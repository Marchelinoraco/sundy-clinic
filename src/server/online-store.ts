import type { Prisma } from "@prisma/client";

// Tanpa "use server": pembantu server untuk konsultasi online, tidak dipanggil browser.

/**
 * Booking yang punya tempat di daftar per tanggal dan hitungan "hari ini" (spec 5.2):
 * semua booking klinik, dan booking online yang konsultasinya sudah dimulai. Booking
 * online yang belum dimulai belum punya jam yang berarti.
 */
export const DAY_LIST_CHANNEL: Prisma.AppointmentWhereInput = {
  OR: [{ channel: "KLINIK" }, { channel: "ONLINE", status: { in: ["HADIR", "SELESAI"] } }],
};
