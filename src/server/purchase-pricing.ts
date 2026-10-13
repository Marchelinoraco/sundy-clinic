"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { validatePurchasePrices } from "@/lib/costing";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { MAX_AMOUNT } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { lockInvoice } from "@/server/stock-store";

const LOCKED = "Harga tidak bisa diubah setelah ada pembayaran atau retur.";

/**
 * Isi atau koreksi harga beli faktur (spec harga modal 4). Batch dan harga pokok tagihan yang sudah mengambil
 * stok dari batch itu ikut diperbarui. Batch diperbarui lebih dulu: finalisasi tagihan yang sedang mengambil batch
 * yang sama memegang kunci barisnya, jadi pembaruan harga pokok tagihan di bawah selalu melihat hasilnya.
 */
export async function setPurchasePrices(input: { invoiceId: string; prices: { lineId: string; unitCost: number | null }[] }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, invoiceId);
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        select: {
          invoiceNumber: true,
          total: true,
          cancelledAt: true,
          supplier: { select: { name: true } },
          lines: { orderBy: { sortOrder: "asc" }, select: { id: true, quantity: true, batch: { select: { id: true } } } },
          payments: { select: { revokedAt: true } },
          _count: { select: { returns: true } },
        },
      });
      if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
      if (invoice.cancelledAt) throw new UserFacingError("Faktur yang dibatalkan tidak perlu harga.");
      if (invoice.payments.some((payment) => payment.revokedAt === null) || invoice._count.returns > 0) throw new UserFacingError(LOCKED);
      const checked = validatePurchasePrices(input?.prices, { lineIds: invoice.lines.map((line) => line.id) });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const priceOf = new Map(checked.value.map((entry) => [entry.lineId, entry.unitCost]));
      const total = invoice.lines.reduce((sum, line) => sum + line.quantity * priceOf.get(line.id)!, 0);
      if (total > MAX_AMOUNT) throw new UserFacingError("Total faktur terlalu besar.");
      for (const line of invoice.lines) {
        const unitCost = priceOf.get(line.id)!;
        await tx.purchaseLine.update({ where: { id: line.id }, data: { unitCost } });
        if (line.batch) {
          await tx.stockBatch.update({ where: { id: line.batch.id }, data: { unitCost } });
          await tx.invoiceStockUse.updateMany({ where: { batchId: line.batch.id }, data: { unitCost } });
        }
      }
      await tx.purchaseInvoice.update({ where: { id: invoiceId }, data: { total, pricedAt: new Date(), pricedByName: actor.name } });
      const before = invoice.total === null ? "" : `${formatRupiah(invoice.total)} → `;
      return `${invoice.supplier.name} ${invoice.invoiceNumber}: ${before}${formatRupiah(total)}`;
    });
    await recordAudit({ actor, action: "purchase.price", entity: "PurchaseInvoice", entityId: invoiceId, summary });
    for (const path of ["/admin/stok", "/admin/hutang", "/admin/laporan", "/admin", `/admin/stok/masuk/${invoiceId}`]) safeRevalidatePath(path);
  });
}
