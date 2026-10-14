"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { MAX_QUANTITY } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { moveItemToCounter } from "@/server/stock-store";

const QUANTITY = "Jumlah harus bilangan bulat lebih dari 0.";
const isQuantity = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY;

function revalidateCounter(itemId: string) {
  for (const path of ["/admin/stok", "/admin/stok-meja", "/admin", `/admin/stok/barang/${itemId}`]) safeRevalidatePath(path);
}

/** Isi meja tanpa permintaan (spec stok meja 4.2): FEFO dari gudang cabang itu. */
export async function moveToCounter(input: { branchId: string; itemId: string; quantity: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    if (!isQuantity(input?.quantity)) throw new UserFacingError(QUANTITY);
    const [item, branch] = await Promise.all([
      prisma.stockItem.findUnique({ where: { id: String(input?.itemId ?? "") }, select: { id: true, name: true } }),
      prisma.branch.findUnique({ where: { id: String(input?.branchId ?? "") }, select: { id: true, name: true } }),
    ]);
    if (!item || !branch) throw new UserFacingError("Barang atau cabang tidak ditemukan. Muat ulang halaman.");
    const today = witaDateString(new Date());
    await prisma.$transaction((tx) =>
      moveItemToCounter(tx, { branchId: branch.id, itemId: item.id, itemName: item.name, quantity: input.quantity, today, actor }),
    );
    await recordAudit({ actor, action: "stock.move", entity: "StockItem", entityId: item.id, summary: `${item.name}: ${input.quantity} ke meja ${branch.name}` });
    revalidateCounter(item.id);
  });
}

/** Tarik stok meja satu batch kembali ke gudang (spec stok meja 3). Batch kedaluwarsa boleh ditarik. */
export async function pullToWarehouse(input: { batchId: string; quantity: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    if (!isQuantity(input?.quantity)) throw new UserFacingError(QUANTITY);
    const batch = await prisma.stockBatch.findUnique({
      where: { id: String(input?.batchId ?? "") },
      select: { id: true, itemId: true, batchNumber: true, item: { select: { name: true } } },
    });
    if (!batch) throw new UserFacingError("Batch tidak ditemukan.");
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.stockBatch.updateMany({
        where: { id: batch.id, counterRemaining: { gte: input.quantity } },
        data: { counterRemaining: { decrement: input.quantity }, quantityRemaining: { increment: input.quantity } },
      });
      if (count !== 1) throw new UserFacingError("Sisa meja batch ini tidak cukup. Muat ulang halaman.");
      const base = { batchId: batch.id, kind: "PINDAH" as const, staffId: actor.staffId, staffName: actor.name };
      await tx.stockMovement.createMany({
        data: [
          { ...base, location: "MEJA", quantity: -input.quantity },
          { ...base, location: "GUDANG", quantity: input.quantity },
        ],
      });
    });
    await recordAudit({
      actor,
      action: "stock.pull",
      entity: "StockBatch",
      entityId: batch.id,
      summary: `${batch.item.name} batch ${batch.batchNumber ?? "-"}: ${input.quantity} ke gudang`,
    });
    revalidateCounter(batch.itemId);
  });
}
