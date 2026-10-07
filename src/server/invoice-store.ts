import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";

// Tanpa "use server": pembantu server untuk tagihan, tidak dipanggil browser.

export const STALE_DRAFT = "Tagihan ini baru diubah orang lain. Muat ulang halaman.";

/** Kolom tagihan yang dibutuhkan invoiceTotals (src/lib/invoice.ts). */
export const TOTALS_SELECT = {
  status: true,
  discountKind: true,
  discountValue: true,
  lines: { select: { quantity: true, unitPrice: true } },
  payments: { select: { amount: true, revokedAt: true } },
} as const;

/**
 * Mengunci baris tagihan sampai transaksi selesai. Perubahan, finalisasi, pembayaran, dan
 * pembatalan tagihan yang sama berjalan bergiliran (spec tagihan 4.3, 4.4).
 */
export async function lockInvoiceRow(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
}

/** Nomor urut tagihan berikutnya untuk tahun ini, atomik (satu pernyataan INSERT … ON CONFLICT). */
export async function nextInvoiceSequence(tx: Prisma.TransactionClient, year: number): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "InvoiceNumberCounter" ("year", "value")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "InvoiceNumberCounter"."value" + 1
    RETURNING "value"
  `;
  return rows[0].value;
}

/**
 * Setiap perubahan draf lewat sini: tagihan dikunci, harus masih draf, dan versi yang dikirim
 * harus sama dengan versi sekarang (spec tagihan 4.2). Mengembalikan versi baru.
 */
export async function touchDraft(tx: Prisma.TransactionClient, invoiceId: string, version: unknown): Promise<number> {
  await lockInvoiceRow(tx, invoiceId);
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, version: true } });
  if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
  if (invoice.status !== "DRAF") throw new UserFacingError("Tagihan ini sudah tidak berupa draf. Muat ulang halaman.");
  if (invoice.version !== version) throw new UserFacingError(STALE_DRAFT);
  await tx.invoice.update({ where: { id: invoiceId }, data: { version: { increment: 1 } } });
  return invoice.version + 1;
}
