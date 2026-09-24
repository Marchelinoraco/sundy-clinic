/** Cermin enum AppointmentStatus di prisma/schema.prisma, untuk kode yang tidak boleh mengimpor Prisma. */
export const APPOINTMENT_STATUSES = [
  "MENUNGGU_KONFIRMASI",
  "TERKONFIRMASI",
  "HADIR",
  "SELESAI",
  "DIBATALKAN",
  "TIDAK_HADIR",
  "KEDALUWARSA",
] as const;

export type AppointmentStatusValue = (typeof APPOINTMENT_STATUSES)[number];

export const STATUS_LABEL: Record<AppointmentStatusValue, string> = {
  MENUNGGU_KONFIRMASI: "Menunggu Konfirmasi",
  TERKONFIRMASI: "Terkonfirmasi",
  HADIR: "Hadir",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
  TIDAK_HADIR: "Tidak Hadir",
  KEDALUWARSA: "Kedaluwarsa",
};

export function isAppointmentStatus(value: string | undefined): value is AppointmentStatusValue {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(value ?? "");
}
