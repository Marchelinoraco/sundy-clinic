"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { ADJUST_REASON_LABEL, validateAdjustment, validateReturn, type AdjustmentInput, type ReturnInput } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { lockInvoice, STOCK_NOT_ENOUGH, takeFromBatch } from "@/server/stock-store";

function revalidateMovement(itemIds: string[], invoiceId?: string) {
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath("/admin");
  for (const itemId of itemIds) safeRevalidatePath(`/admin/stok/barang/${itemId}`);
  if (invoiceId) {
    safeRevalidatePath(`/admin/stok/masuk/${invoiceId}`);
    safeRevalidatePath("/admin/hutang");
  }
}

/** Penyesuaian stok (spec stok 5.4): rusak, hilang, kedaluwarsa dibuang, lainnya, atau selisih hitung. */
export async function adjustStock(input: AdjustmentInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateAdjustment(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const adjustment = checked.value;

    const batch = await prisma.stockBatch.findUnique({
      where: { id: adjustment.batchId },
      select: {
        id: true,
        itemId: true,
        batchNumber: true,
        item: { select: { name: true } },
        purchaseLine: { select: { invoice: { select: { cancelledAt: true } } } },
      },
    });
    if (!batch) throw new UserFacingError("Batch tidak ditemukan.");
    if (batch.purchaseLine.invoice.cancelledAt) {
      throw new UserFacingError("Batch dari faktur yang dibatalkan tidak bisa disesuaikan.");
    }

    await prisma.$transaction(async (tx) => {
      if (adjustment.delta < 0) {
        if (!(await takeFromBatch(tx, batch.id, -adjustment.delta))) throw new UserFacingError(STOCK_NOT_ENOUGH);
      } else {
        await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { increment: adjustment.delta } } });
      }
      await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          kind: "PENYESUAIAN",
          quantity: adjustment.delta,
          reason: adjustment.reason,
          note: adjustment.note,
          staffId: actor.staffId,
          staffName: actor.name,
        },
      });
    });

    await recordAudit({
      actor,
      action: "stock.adjust",
      entity: "StockBatch",
      entityId: batch.id,
      summary: `${batch.item.name} batch ${batch.batchNumber ?? "-"}: ${adjustment.delta > 0 ? "+" : ""}${adjustment.delta} (${ADJUST_REASON_LABEL[adjustment.reason]})`,
    });
    revalidateMovement([batch.itemId]);
  });
}

/**
 * Retur ke supplier (spec stok 5.5): sisa batch berkurang, jurnal RETUR dibuat, dan nilai retur
 * (jumlah × harga beli batch) mengurangi hutang faktur. Faktur dikunci selama transaksi.
 */
export async function createSupplierReturn(input: ReturnInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateReturn(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const request = checked.value;

    const result = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, request.invoiceId);
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: request.invoiceId },
        select: {
          invoiceNumber: true,
          cancelledAt: true,
          supplier: { select: { name: true } },
          lines: {
            select: { batch: { select: { id: true, itemId: true, unitCost: true, batchNumber: true, item: { select: { name: true } } } } },
          },
        },
      });
      if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
      if (invoice.cancelledAt) throw new UserFacingError("Faktur yang dibatalkan tidak bisa diretur.");
      const batches = new Map(invoice.lines.flatMap((line) => (line.batch ? [[line.batch.id, line.batch] as const] : [])));

      const lines: { batchId: string; quantity: number; unitCost: number; amount: number }[] = [];
      const itemIds = new Set<string>();
      for (const line of request.lines) {
        const batch = batches.get(line.batchId);
        if (!batch) throw new UserFacingError("Batch tidak termasuk faktur ini.");
        if (!(await takeFromBatch(tx, batch.id, line.quantity))) {
          throw new UserFacingError(`Sisa ${batch.item.name} (batch ${batch.batchNumber ?? "-"}) tidak cukup untuk diretur.`);
        }
        lines.push({ batchId: batch.id, quantity: line.quantity, unitCost: batch.unitCost, amount: line.quantity * batch.unitCost });
        itemIds.add(batch.itemId);
      }
      const total = lines.reduce((sum, line) => sum + line.amount, 0);
      const created = await tx.supplierReturn.create({
        data: { invoiceId: request.invoiceId, total, note: request.note, staffId: actor.staffId, staffName: actor.name, lines: { create: lines } },
        select: { id: true },
      });
      for (const line of lines) {
        await tx.stockMovement.create({
          data: {
            batchId: line.batchId,
            kind: "RETUR",
            quantity: -line.quantity,
            supplierReturnId: created.id,
            staffId: actor.staffId,
            staffName: actor.name,
          },
        });
      }
      return { id: created.id, itemIds: [...itemIds], summary: `${invoice.supplier.name} ${invoice.invoiceNumber}: ${formatRupiah(total)}` };
    });

    await recordAudit({ actor, action: "stock.return", entity: "SupplierReturn", entityId: result.id, summary: result.summary });
    revalidateMovement(result.itemIds, request.invoiceId);
    return { id: result.id };
  });
}
