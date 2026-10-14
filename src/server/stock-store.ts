import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import type { StockLocationValue } from "@/lib/counter-stock";
import { fefoPlan } from "@/lib/invoice";

// Tanpa "use server": pembantu server untuk stok dan hutang, tidak dipanggil browser.

/** Kolom faktur yang dibutuhkan payableSummary (src/lib/stock.ts). */
export const PAYABLE_SELECT = {
  total: true,
  cancelledAt: true,
  dueDate: true,
  payments: { select: { kind: true, amount: true, revokedAt: true } },
  returns: { select: { total: true } },
} as const;

/**
 * Mengunci baris faktur sampai transaksi selesai. Pembayaran, retur, dan pembatalan faktur yang
 * sama berjalan bergiliran, sehingga batas sisa hutang dan syarat batal tidak bisa dilewati
 * oleh dua permintaan bersamaan (spec stok 4.3).
 */
export async function lockInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id = ${invoiceId} FOR UPDATE`;
}

export const STOCK_NOT_ENOUGH = "Sisa batch tidak cukup. Muat ulang halaman.";

/** Batch yang masih bersisa di gudang atau meja (spec stok meja 2.1). */
export const HAS_STOCK = { OR: [{ quantityRemaining: { gt: 0 } }, { counterRemaining: { gt: 0 } }] };

/**
 * Mengurangi sisa batch di satu lokasi dalam satu UPDATE bersyarat (spec stok 4.3, stok meja 3). Dua pengurangan
 * bersamaan tidak bisa sama-sama lolos: yang kedua melihat sisa terbaru dan gagal bila tidak cukup.
 */
export async function takeFromBatch(tx: Prisma.TransactionClient, batchId: string, quantity: number, location: StockLocationValue = "GUDANG"): Promise<boolean> {
  const { count } =
    location === "MEJA"
      ? await tx.stockBatch.updateMany({ where: { id: batchId, counterRemaining: { gte: quantity } }, data: { counterRemaining: { decrement: quantity } } })
      : await tx.stockBatch.updateMany({ where: { id: batchId, quantityRemaining: { gte: quantity } }, data: { quantityRemaining: { decrement: quantity } } });
  return count === 1;
}

/**
 * Memindah satu barang dari gudang ke meja di satu cabang (spec stok meja 3): batch gudang yang belum kedaluwarsa,
 * kedaluwarsa terdekat dulu. Tiap batch diperbarui dengan UPDATE bersyarat dan mendapat dua jurnal PINDAH.
 * Gagal di tengah membatalkan seluruh transaksi pemanggil.
 */
export async function moveItemToCounter(
  tx: Prisma.TransactionClient,
  input: { branchId: string; itemId: string; itemName: string; quantity: number; today: string; actor: { staffId: string; name: string }; restockLineId?: string | null },
): Promise<void> {
  const batches = await tx.stockBatch.findMany({
    where: { itemId: input.itemId, branchId: input.branchId, quantityRemaining: { gt: 0 } },
    select: { id: true, quantityRemaining: true, expiryDate: true, createdAt: true },
  });
  const plan = fefoPlan(batches, input.quantity, input.today);
  if (!plan.ok) throw new UserFacingError(`Sisa gudang ${input.itemName} tidak cukup (tersedia ${plan.available}).`);
  for (const take of plan.takes) {
    const { count } = await tx.stockBatch.updateMany({
      where: { id: take.batchId, quantityRemaining: { gte: take.quantity } },
      data: { quantityRemaining: { decrement: take.quantity }, counterRemaining: { increment: take.quantity } },
    });
    if (count !== 1) throw new UserFacingError(STOCK_NOT_ENOUGH);
    const base = { batchId: take.batchId, kind: "PINDAH" as const, restockLineId: input.restockLineId ?? null, staffId: input.actor.staffId, staffName: input.actor.name };
    await tx.stockMovement.createMany({
      data: [
        { ...base, location: "GUDANG", quantity: -take.quantity },
        { ...base, location: "MEJA", quantity: take.quantity },
      ],
    });
  }
}
