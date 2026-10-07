import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import { lockInvoiceRow } from "@/server/invoice-store";

// Tanpa "use server": pembantu server untuk penyerahan, tidak dipanggil browser.

export const STALE_DISPENSING = "Penyerahan ini baru diubah orang lain. Muat ulang halaman.";
export const NOT_WAITING = "Penyerahan ini sudah selesai. Buka kembali dulu untuk mengubahnya.";

/** Mengunci baris penyerahan sampai transaksi selesai (spec penyerahan 4.2). */
export async function lockDispensingRow(tx: Prisma.TransactionClient, dispensingId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Dispensing" WHERE id = ${dispensingId} FOR UPDATE`;
}

/**
 * Setiap perubahan daftar obat lewat sini: baris dikunci, penyerahan harus Menunggu, dan versi yang
 * dikirim harus sama dengan versi sekarang. Mengembalikan versi baru.
 */
export async function touchDispensing(tx: Prisma.TransactionClient, dispensingId: string, version: unknown): Promise<number> {
  await lockDispensingRow(tx, dispensingId);
  const row = await tx.dispensing.findUnique({ where: { id: dispensingId }, select: { status: true, version: true } });
  if (!row) throw new UserFacingError("Penyerahan tidak ditemukan.");
  if (row.status !== "MENUNGGU") throw new UserFacingError(NOT_WAITING);
  if (row.version !== version) throw new UserFacingError(STALE_DISPENSING);
  await tx.dispensing.update({ where: { id: dispensingId }, data: { version: { increment: 1 } } });
  return row.version + 1;
}

export const CONTEXT_CHANGED = "Tagihan kunjungan ini baru berubah. Muat ulang halaman lalu coba lagi.";

type ActiveInvoice = { id: string; status: "DRAF" | "FINAL" };

/** Tagihan aktif (bukan dibatalkan) kunjungan ini; tanpa kunci. */
export async function activeInvoiceOf(tx: Prisma.TransactionClient, appointmentId: string): Promise<ActiveInvoice | null> {
  const invoice = await tx.invoice.findFirst({
    where: { appointmentId, status: { not: "DIBATALKAN" } },
    select: { id: true, status: true },
  });
  return invoice ? { id: invoice.id, status: invoice.status === "FINAL" ? "FINAL" : "DRAF" } : null;
}

/**
 * Urutan kunci yang seragam: tagihan lebih dulu, lalu penyerahan. Tagihan aktif dibaca tanpa kunci,
 * dikunci, baris penyerahan dikunci, lalu tagihan aktif dibaca ulang; bila berubah di sela-sela,
 * aksi ditolak dan pengguna mengulang. Dengan begitu pembatalan tagihan (tagihan → penyerahan) dan
 * buka kembali (tagihan → penyerahan) tidak pernah saling menunggu secara silang.
 */
export async function lockDispensingContext(
  tx: Prisma.TransactionClient,
  dispensingId: string,
  appointmentId: string,
): Promise<{ invoice: ActiveInvoice | null }> {
  const before = await activeInvoiceOf(tx, appointmentId);
  if (before) await lockInvoiceRow(tx, before.id);
  await lockDispensingRow(tx, dispensingId);
  const after = await activeInvoiceOf(tx, appointmentId);
  if ((before?.id ?? null) !== (after?.id ?? null)) throw new UserFacingError(CONTEXT_CHANGED);
  return { invoice: after };
}

export type HandedLine = {
  kind: "BARANG";
  name: string;
  quantity: number;
  unitPrice: number;
  serviceId: null;
  encounterTreatmentId: null;
  itemId: string;
  dispensingLineId: string;
};

/** Baris tagihan dari penyerahan SELESAI (harga jual katalog saat ini); kosong untuk status lain. Panggil setelah baris dikunci. */
export async function handedInvoiceLines(tx: Prisma.TransactionClient, dispensingId: string): Promise<HandedLine[]> {
  const dispensing = await tx.dispensing.findUnique({
    where: { id: dispensingId },
    select: { status: true, lines: { orderBy: { sortOrder: "asc" }, select: { id: true, itemId: true, itemName: true, quantity: true } } },
  });
  if (!dispensing || dispensing.status !== "SELESAI") return [];
  const prices = new Map(
    (await tx.stockItem.findMany({ where: { id: { in: dispensing.lines.map((l) => l.itemId) } }, select: { id: true, sellPrice: true } })).map((item) => [
      item.id,
      item.sellPrice,
    ]),
  );
  return dispensing.lines.map((line) => {
    const unitPrice = prices.get(line.itemId);
    if (unitPrice === null || unitPrice === undefined) throw new UserFacingError(`Harga jual ${line.itemName} belum diisi.`);
    return {
      kind: "BARANG" as const,
      name: line.itemName,
      quantity: line.quantity,
      unitPrice,
      serviceId: null,
      encounterTreatmentId: null,
      itemId: line.itemId,
      dispensingLineId: line.id,
    };
  });
}

/** Menambahkan baris penyerahan ke draf tagihan (tagihan sudah dikunci pemanggil) dan menaikkan versi draf. */
export async function appendDispensingLines(tx: Prisma.TransactionClient, invoiceId: string, dispensingId: string): Promise<void> {
  const handed = await handedInvoiceLines(tx, dispensingId);
  const last = await tx.invoiceLine.aggregate({ where: { invoiceId }, _max: { sortOrder: true } });
  let order = (last._max.sortOrder ?? -1) + 1;
  for (const line of handed) {
    await tx.invoiceLine.create({ data: { ...line, invoiceId, sortOrder: order++ } });
  }
  await tx.invoice.update({ where: { id: invoiceId }, data: { version: { increment: 1 } } });
}

/** Mencabut baris penyerahan dari draf tagihan (tagihan sudah dikunci pemanggil) dan menaikkan versi draf. */
export async function removeDispensingLines(tx: Prisma.TransactionClient, invoiceId: string, dispensingId: string): Promise<void> {
  await tx.invoiceLine.deleteMany({ where: { invoiceId, dispensingLine: { dispensingId } } });
  await tx.invoice.update({ where: { id: invoiceId }, data: { version: { increment: 1 } } });
}
