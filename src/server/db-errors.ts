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
