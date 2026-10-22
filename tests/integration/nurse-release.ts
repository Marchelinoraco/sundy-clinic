import { prisma } from "@/lib/db";

/**
 * Perawat sudah menekan Selesai ditangani (spec vital perawat VP4), tanpa angka vital, agar uji dokter bisa langsung
 * membuka kunjungan klinik hari ini. Mengembalikan booking-nya apa adanya.
 */
export async function nurseDone<T extends { id: string }>(appointment: T | Promise<T>): Promise<T> {
  const row = await appointment;
  await prisma.nurseVitals.create({
    data: { appointmentId: row.id, updatedById: "perawat-uji", updatedByName: "Perawat Uji", completedAt: new Date(), completedById: "perawat-uji", completedByName: "Perawat Uji" },
  });
  return row;
}
