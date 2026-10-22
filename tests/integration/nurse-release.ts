import { prisma } from "@/lib/db";
import { lastHeightCm } from "@/server/encounter-store";

/**
 * Perawat sudah menekan Selesai ditangani (spec vital perawat VP4) tanpa mengetik angka, agar uji dokter bisa langsung
 * membuka kunjungan klinik hari ini. Seperti di halaman perawat, tinggi badan dari kunjungan final terakhir ikut
 * tersimpan. Mengembalikan booking-nya apa adanya.
 */
export async function nurseDone<T extends { id: string }>(appointment: T | Promise<T>): Promise<T> {
  const row = await appointment;
  const { patientId } = await prisma.appointment.findUniqueOrThrow({ where: { id: row.id }, select: { patientId: true } });
  const heightCm = patientId ? await lastHeightCm(prisma, patientId) : null;
  await prisma.nurseVitals.create({
    data: { appointmentId: row.id, heightCm, updatedById: "perawat-uji", updatedByName: "Perawat Uji", completedAt: new Date(), completedById: "perawat-uji", completedByName: "Perawat Uji" },
  });
  return row;
}
