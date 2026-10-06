import type { Prisma } from "@prisma/client";

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

/**
 * Mengurangi sisa batch dalam satu UPDATE bersyarat (spec stok 4.3). Dua pengurangan bersamaan
 * tidak bisa sama-sama lolos: yang kedua melihat sisa terbaru dan gagal bila tidak cukup.
 */
export async function takeFromBatch(tx: Prisma.TransactionClient, batchId: string, quantity: number): Promise<boolean> {
  const { count } = await tx.stockBatch.updateMany({
    where: { id: batchId, quantityRemaining: { gte: quantity } },
    data: { quantityRemaining: { decrement: quantity } },
  });
  return count === 1;
}
