"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { shortageMessage, stockShortage, totalsByItem } from "@/lib/dispensing";
import { safeRevalidatePath } from "@/lib/revalidate";
import { stockFlags } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { appendDispensingLines, lockDispensingContext, removeDispensingLines, STALE_DISPENSING } from "@/server/dispensing-store";
import { requireCapability } from "@/server/session";

const ALREADY_PROCESSED = "Penyerahan ini sudah diproses. Muat ulang halaman.";

function revalidateDispensing(dispensingId: string, invoiceId?: string) {
  safeRevalidatePath("/admin/resep");
  safeRevalidatePath(`/admin/resep/${dispensingId}`);
  safeRevalidatePath("/admin");
  safeRevalidatePath("/admin/tagihan");
  if (invoiceId) safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

const SELECT = {
  appointmentId: true,
  branchId: true,
  status: true,
  version: true,
  appointment: { select: { patient: { select: { name: true } } } },
  lines: { orderBy: { sortOrder: "asc" as const }, select: { itemId: true, itemName: true, quantity: true } },
} as const;

/**
 * Selesai (spec penyerahan 4.2–4.3): obat dicek terhadap stok cabang, status menjadi Selesai, dan
 * barisnya masuk ke draf tagihan kunjungan bila ada (bila belum ada, terisi saat tagihan dibuat).
 */
export async function completeDispensing(input: { dispensingId: string; version: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input?.dispensingId ?? "");
    const today = witaDateString(new Date());

    const result = await prisma.$transaction(async (tx) => {
      const probe = await tx.dispensing.findUnique({ where: { id: dispensingId }, select: { appointmentId: true } });
      if (!probe) throw new UserFacingError("Penyerahan tidak ditemukan.");
      const { invoice } = await lockDispensingContext(tx, dispensingId, probe.appointmentId);
      const row = await tx.dispensing.findUniqueOrThrow({ where: { id: dispensingId }, select: SELECT });
      if (row.status !== "MENUNGGU") throw new UserFacingError(ALREADY_PROCESSED);
      if (row.version !== input.version) throw new UserFacingError(STALE_DISPENSING);
      if (row.lines.length === 0) throw new UserFacingError("Tambahkan obat dulu, atau pilih Tanpa obat.");

      const needed = totalsByItem(row.lines.map((l) => ({ itemId: l.itemId, itemName: l.itemName, quantity: l.quantity })));
      const batches = await tx.stockBatch.findMany({
        where: { itemId: { in: needed.map((n) => n.itemId) }, branchId: row.branchId, quantityRemaining: { gt: 0 } },
        select: { itemId: true, quantityRemaining: true, expiryDate: true, unitCost: true },
      });
      const available = new Map(needed.map((n) => [n.itemId, stockFlags(batches.filter((b) => b.itemId === n.itemId), 0, today).available]));
      const shortage = stockShortage(needed, available);
      if (shortage) throw new UserFacingError(shortageMessage(shortage));

      await tx.dispensing.update({
        where: { id: dispensingId },
        data: { status: "SELESAI", completedAt: new Date(), completedById: actor.staffId, completedByName: actor.name, version: { increment: 1 } },
      });
      if (invoice) {
        if (invoice.status !== "DRAF") throw new UserFacingError("Tagihan kunjungan ini sudah final. Muat ulang halaman.");
        await appendDispensingLines(tx, invoice.id, dispensingId);
      }
      return {
        invoiceId: invoice?.id,
        summary: `${row.appointment.patient?.name ?? "-"}: ${row.lines.map((l) => `${l.itemName} ×${l.quantity}`).join(", ")}`,
      };
    });

    await recordAudit({ actor, action: "dispensing.complete", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId, result.invoiceId);
  });
}

/** Tanpa obat (spec penyerahan 4.2): hanya bila daftar obat kosong; melepas penahanan finalisasi tagihan. */
export async function markNoDispensing(input: { dispensingId: string; version: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input?.dispensingId ?? "");

    const summary = await prisma.$transaction(async (tx) => {
      const probe = await tx.dispensing.findUnique({ where: { id: dispensingId }, select: { appointmentId: true } });
      if (!probe) throw new UserFacingError("Penyerahan tidak ditemukan.");
      await lockDispensingContext(tx, dispensingId, probe.appointmentId);
      const row = await tx.dispensing.findUniqueOrThrow({ where: { id: dispensingId }, select: SELECT });
      if (row.status !== "MENUNGGU") throw new UserFacingError(ALREADY_PROCESSED);
      if (row.version !== input.version) throw new UserFacingError(STALE_DISPENSING);
      if (row.lines.length > 0) throw new UserFacingError("Penyerahan ini punya obat. Hapus obatnya dulu, atau pilih Selesai.");
      await tx.dispensing.update({
        where: { id: dispensingId },
        data: { status: "TANPA_OBAT", completedAt: new Date(), completedById: actor.staffId, completedByName: actor.name, version: { increment: 1 } },
      });
      return row.appointment.patient?.name ?? "-";
    });

    await recordAudit({ actor, action: "dispensing.none", entity: "Dispensing", entityId: dispensingId, summary });
    revalidateDispensing(dispensingId);
  });
}

/**
 * Buka kembali (spec penyerahan 4.5): hanya bila tagihan kunjungan belum final. Baris asal penyerahan
 * dicabut dari draf tagihan, lalu penyerahan kembali Menunggu.
 */
export async function reopenDispensing(input: { dispensingId: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input?.dispensingId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const probe = await tx.dispensing.findUnique({ where: { id: dispensingId }, select: { appointmentId: true } });
      if (!probe) throw new UserFacingError("Penyerahan tidak ditemukan.");
      const { invoice } = await lockDispensingContext(tx, dispensingId, probe.appointmentId);
      const row = await tx.dispensing.findUniqueOrThrow({ where: { id: dispensingId }, select: SELECT });
      if (row.status === "MENUNGGU") throw new UserFacingError("Penyerahan ini masih menunggu.");
      if (invoice?.status === "FINAL") throw new UserFacingError("Tagihan kunjungan ini sudah final. Penyerahan tidak bisa dibuka kembali.");
      await tx.dispensing.update({
        where: { id: dispensingId },
        data: { status: "MENUNGGU", completedAt: null, completedById: null, completedByName: null, version: { increment: 1 } },
      });
      if (invoice) await removeDispensingLines(tx, invoice.id, dispensingId);
      return { invoiceId: invoice?.id, summary: row.appointment.patient?.name ?? "-" };
    });

    await recordAudit({ actor, action: "dispensing.reopen", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId, result.invoiceId);
  });
}
