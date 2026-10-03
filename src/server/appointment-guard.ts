import type { AppointmentStatus } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";

// Tanpa "use server": dipakai appointment.ts dan check-in.ts, tidak dipanggil browser.

/** Status yang masih bisa dijadwal ulang, diverifikasi, di-check-in, atau dibatalkan. */
export const ACTIVE_STATUSES: AppointmentStatus[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

const STATUS_WORD: Record<AppointmentStatus, string> = {
  MENUNGGU_KONFIRMASI: "menunggu konfirmasi",
  TERKONFIRMASI: "terkonfirmasi",
  HADIR: "hadir",
  SELESAI: "selesai",
  DIBATALKAN: "dibatalkan",
  TIDAK_HADIR: "tidak hadir",
  KEDALUWARSA: "kedaluwarsa",
};

/**
 * Pesan untuk UPDATE bersyarat yang tidak mengubah apa pun: pasien belum
 * dicocokkan (booking situs), atau statusnya sudah berubah.
 */
export async function rejectedChangeError(id: string, needsPatient = false): Promise<UserFacingError> {
  const current = await prisma.appointment.findUniqueOrThrow({
    where: { id },
    select: { status: true, patientId: true },
  });
  if (needsPatient && current.patientId === null) {
    return new UserFacingError("Cocokkan booking ini dengan data pasien lebih dulu.");
  }
  return new UserFacingError(
    `Booking ini sudah berstatus ${STATUS_WORD[current.status]}. Muat ulang halaman.`,
  );
}
