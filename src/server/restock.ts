"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { validateRejectReason, validateRestockRequest, validateRestockSend, type RestockRequestInput } from "@/lib/counter-stock";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { moveItemToCounter } from "@/server/stock-store";

const PROCESSED = "Permintaan ini sudah diproses. Muat ulang halaman.";

function revalidateRestock(requestId?: string) {
  for (const path of ["/admin/stok-meja", "/admin/stok", "/admin"]) safeRevalidatePath(path);
  if (requestId) safeRevalidatePath(`/admin/stok/permintaan/${requestId}`);
}

/** Mengunci permintaan sampai transaksi selesai, lalu memastikan masih menunggu dengan versi yang sama. */
async function lockPending(tx: Prisma.TransactionClient, requestId: string, version: unknown) {
  await tx.$queryRaw`SELECT id FROM "RestockRequest" WHERE id = ${requestId} FOR UPDATE`;
  const row = await tx.restockRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      version: true,
      branchId: true,
      branch: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { id: true, itemId: true, itemName: true } },
    },
  });
  if (!row) throw new UserFacingError("Permintaan tidak ditemukan.");
  if (row.status !== "MENUNGGU" || row.version !== version) throw new UserFacingError(PROCESSED);
  return row;
}

/** Resepsionis meminta restock meja (spec stok meja 4.1). Barang yang masih diminta di cabang ini ditolak. */
export async function createRestockRequest(input: RestockRequestInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("restock:request");
    const checked = validateRestockRequest(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const request = checked.value;

    const id = await prisma.$transaction(async (tx) => {
      // Cabang dikunci: dua permintaan bersamaan untuk barang yang sama bergiliran, yang kedua melihat yang pertama.
      const [branch] = await tx.$queryRaw<{ id: string; status: string }[]>`SELECT id, status::text FROM "Branch" WHERE id = ${request.branchId} FOR UPDATE`;
      if (!branch || branch.status !== "AKTIF") throw new UserFacingError("Pilih cabang yang aktif.");
      const items = await tx.stockItem.findMany({ where: { id: { in: request.lines.map((l) => l.itemId) }, isActive: true }, select: { id: true, name: true } });
      const nameOf = new Map(items.map((item) => [item.id, item.name]));
      if (nameOf.size !== request.lines.length) throw new UserFacingError("Barang tidak ditemukan atau nonaktif. Muat ulang halaman.");
      const pending = await tx.restockRequestLine.findFirst({
        where: { itemId: { in: request.lines.map((l) => l.itemId) }, request: { branchId: request.branchId, status: "MENUNGGU" } },
        select: { itemId: true },
      });
      if (pending) throw new UserFacingError(`${nameOf.get(pending.itemId)} sudah ada di permintaan yang menunggu.`);
      const created = await tx.restockRequest.create({
        data: {
          branchId: request.branchId,
          note: request.note,
          requestedById: actor.staffId,
          requestedByName: actor.name,
          lines: {
            create: request.lines.map((line, index) => ({ itemId: line.itemId, itemName: nameOf.get(line.itemId)!, requestedQuantity: line.quantity, sortOrder: index })),
          },
        },
        select: { id: true },
      });
      return created.id;
    });

    await recordAudit({ actor, action: "restock.request", entity: "RestockRequest", entityId: id, summary: `${request.lines.length} barang` });
    revalidateRestock(id);
    return { id };
  });
}

/** Batalkan permintaan yang masih menunggu (spec stok meja 4.1). */
export async function cancelRestockRequest(input: { requestId: string; version: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("restock:request");
    const requestId = String(input?.requestId ?? "");
    await prisma.$transaction(async (tx) => {
      await lockPending(tx, requestId, input?.version);
      await tx.restockRequest.update({
        where: { id: requestId },
        data: { status: "DIBATALKAN", decidedAt: new Date(), decidedById: actor.staffId, decidedByName: actor.name, version: { increment: 1 } },
      });
    });
    await recordAudit({ actor, action: "restock.cancel", entity: "RestockRequest", entityId: requestId, summary: "dibatalkan" });
    revalidateRestock(requestId);
  });
}

/**
 * Apoteker mengirim dari gudang ke meja (spec stok meja 4.2): tiap baris > 0 dipindah FEFO dalam satu transaksi;
 * satu baris gagal membatalkan seluruhnya. Jumlah kirim boleh kurang dari yang diminta.
 */
export async function sendRestockRequest(input: { requestId: string; version: number; lines: { lineId: string; quantity: number }[] }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const requestId = String(input?.requestId ?? "");
    const today = witaDateString(new Date());

    const summary = await prisma.$transaction(async (tx) => {
      const row = await lockPending(tx, requestId, input?.version);
      const checked = validateRestockSend(input?.lines, { lineIds: row.lines.map((line) => line.id) });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const sent = new Map(checked.value.map((entry) => [entry.lineId, entry.quantity]));
      for (const line of row.lines) {
        const quantity = sent.get(line.id)!;
        if (quantity > 0) {
          await moveItemToCounter(tx, { branchId: row.branchId, itemId: line.itemId, itemName: line.itemName, quantity, today, actor, restockLineId: line.id });
        }
        await tx.restockRequestLine.update({ where: { id: line.id }, data: { sentQuantity: quantity } });
      }
      await tx.restockRequest.update({
        where: { id: requestId },
        data: { status: "SELESAI", decidedAt: new Date(), decidedById: actor.staffId, decidedByName: actor.name, version: { increment: 1 } },
      });
      const moved = row.lines.filter((line) => sent.get(line.id)! > 0);
      return `${moved.length} barang ke meja ${row.branch.name}: ${moved.map((line) => `${line.itemName} ×${sent.get(line.id)}`).join(", ")}`;
    });

    await recordAudit({ actor, action: "restock.send", entity: "RestockRequest", entityId: requestId, summary });
    revalidateRestock(requestId);
  });
}

/** Apoteker menolak dengan alasan (spec stok meja 4.2); stok tidak berubah. */
export async function rejectRestockRequest(input: { requestId: string; version: number; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const reason = validateRejectReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const requestId = String(input?.requestId ?? "");
    await prisma.$transaction(async (tx) => {
      await lockPending(tx, requestId, input?.version);
      await tx.restockRequest.update({
        where: { id: requestId },
        data: { status: "DITOLAK", rejectReason: reason.value, decidedAt: new Date(), decidedById: actor.staffId, decidedByName: actor.name, version: { increment: 1 } },
      });
    });
    await recordAudit({ actor, action: "restock.reject", entity: "RestockRequest", entityId: requestId, summary: reason.value });
    revalidateRestock(requestId);
  });
}
