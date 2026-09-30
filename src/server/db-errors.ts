import { Prisma } from "@prisma/client";

/**
 * Kode Postgres untuk pelanggaran exclusion constraint adalah "23P01".
 * Setiap tempat yang bisa memicu exclusion constraint Appointment atau
 * SlotHold menerjemahkannya lewat fungsi ini — galat SQL mentah tidak boleh
 * sampai ke layar.
 */
export function isExclusionViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      typeof error.meta?.code === "string" &&
      error.meta.code === "23P01") ||
    (error instanceof Error && error.message.includes("23P01"))
  );
}

/** Pelanggaran batasan unik (Prisma P2002), mis. kode booking atau submissionKey kembar. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Awalan pesan trigger penguncian rekam medis (migrasi kunjungan_dokter). */
export const RECORD_LOCKED_MARKER = "rekam_medis_terkunci";

/**
 * Trigger menolak perubahan pada kunjungan final, treatment-nya, atau adendum.
 * Pesannya ada di `message` (kueri mentah maupun kueri model lewat adapter-pg);
 * `meta` diperiksa juga untuk berjaga bila bentuk galat Prisma berubah.
 */
export function isRecordLockedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes(RECORD_LOCKED_MARKER)) return true;
  const meta = (error as { meta?: unknown }).meta;
  return meta !== undefined && JSON.stringify(meta).includes(RECORD_LOCKED_MARKER);
}
