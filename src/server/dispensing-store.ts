import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";

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
