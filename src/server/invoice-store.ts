import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import { discountLimit, DISCOUNT_LIMIT_PERCENT, invoiceGrossSubtotal, limitedDiscount } from "@/lib/invoice";

// Tanpa "use server": pembantu server untuk tagihan, tidak dipanggil browser.

export const STALE_DRAFT = "Tagihan ini baru diubah orang lain. Muat ulang halaman.";

/** Kolom tagihan yang dibutuhkan invoiceTotals (src/lib/invoice.ts). */
export const TOTALS_SELECT = {
  status: true,
  discountKind: true,
  discountValue: true,
  lines: { select: { quantity: true, unitPrice: true, discountAmount: true, discountSource: true } },
  payments: { select: { amount: true, revokedAt: true } },
  depositUses: { select: { amount: true } },
} as const;

/** Potongan deposit dan saldo yang lahir dari tagihan, untuk layar tagihan, struk, dan invoice A4 (spec deposit D9). */
export const DEPOSIT_SUMMARY_SELECT = {
  depositUses: { select: { kind: true, amount: true } },
  depositCredits: { orderBy: { createdAt: "asc" }, select: { amount: true, source: true, validUntil: true } },
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

/**
 * Menjalankan perubahan draf, lalu menolaknya bila diskon yang dibatasi (diskon baris manual + diskon
 * tagihan, spec perbaikan tagihan T2) melewati 20% dari subtotal kotor. Diskon yang sudah di atas batas
 * (disetujui Admin Keuangan) boleh tetap, tetapi tidak boleh membesar, baik nilainya maupun porsinya.
 */
export async function guardDiscount(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  canExceed: boolean,
  mutate: () => Promise<void>,
  message = `Perubahan ini membuat diskon melebihi ${DISCOUNT_LIMIT_PERCENT}%. Ubah diskon dulu atau minta Admin Keuangan.`,
): Promise<void> {
  const read = async () => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { discountKind: true, discountValue: true, lines: { select: { quantity: true, unitPrice: true, discountAmount: true, discountSource: true } } },
    });
    const gross = invoiceGrossSubtotal(invoice.lines);
    const amount = limitedDiscount(invoice);
    return { gross, amount, within: amount <= discountLimit(gross) };
  };
  const before = await read();
  await mutate();
  const after = await read();
  const grew = after.amount > before.amount || after.amount * before.gross > before.amount * after.gross;
  if (!canExceed && !after.within && (before.within || grew)) throw new UserFacingError(message);
}
