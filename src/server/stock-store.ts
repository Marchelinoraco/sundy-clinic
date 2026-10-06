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
