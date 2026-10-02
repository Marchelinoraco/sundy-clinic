import { prisma } from "@/lib/db";

/** Data booking yang dibutuhkan link kuis — identitas pasien saja, tanpa catatan medis. */
const LINK_BOOKING_SELECT = {
  id: true,
  code: true,
  type: true,
  source: true,
  status: true,
  startAt: true,
  bookingFee: true,
  patientId: true,
  service: { select: { name: true } },
  staff: { select: { name: true } },
  branch: { select: { name: true } },
  patient: {
    select: { name: true, whatsapp: true, birthDate: true, gender: true, occupation: true, address: true },
  },
  intake: { select: { id: true, status: true, linkVersion: true } },
} as const;

export function loadLinkBooking(appointmentId: string) {
  return prisma.appointment.findUnique({ where: { id: appointmentId }, select: LINK_BOOKING_SELECT });
}

export type LinkBooking = NonNullable<Awaited<ReturnType<typeof loadLinkBooking>>>;

/** Isian lengkap yang sudah dikirim pasien ini, dari booking mana pun (spec C3 3.2). */
export async function hasCompletedFullIntake(patientId: string): Promise<boolean> {
  const count = await prisma.intake.count({
    where: { patientId, kind: "LENGKAP", status: { in: ["TERISI", "DIPERIKSA"] } },
  });
  return count > 0;
}
