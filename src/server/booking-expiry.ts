import { prisma } from "@/lib/db";
import { recordAudit, SYSTEM_ACTOR } from "@/server/audit";

/** Booking situs yang belum diverifikasi selama ini menjadi KEDALUWARSA (PRD bagian 8, spec K13). */
export const SITE_BOOKING_CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Menandai booking situs yang melewati batas konfirmasi sebagai KEDALUWARSA,
 * sehingga slotnya lepas dari exclusion constraint.
 *
 * Tidak ada cron. Fungsi ini dipanggil tepat sebelum slot dihitung, sebelum
 * booking atau hold dibuat, dan saat daftar booking dibuka — persis saat slot
 * itu dibutuhkan orang lain. Booking yang dicatat admin tidak pernah disentuh.
 * Satu UPDATE bersyarat: booking yang baru saja diverifikasi admin tidak ikut
 * berubah, dan hanya baris yang benar-benar berubah yang dicatat di audit.
 *
 * Modul biasa (bukan "use server") agar tidak bisa dipanggil dari browser.
 */
export async function expireStaleSiteBookings(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SITE_BOOKING_CONFIRMATION_WINDOW_MS);

  const expired = await prisma.appointment.updateManyAndReturn({
    where: { source: "SITUS", status: "MENUNGGU_KONFIRMASI", createdAt: { lt: cutoff } },
    data: { status: "KEDALUWARSA" },
    select: { id: true, code: true },
  });

  for (const appointment of expired) {
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: "appointment.expire",
      entity: "Appointment",
      entityId: appointment.id,
      summary: `${appointment.code} — tidak dikonfirmasi dalam 24 jam`,
    });
  }

  return expired.length;
}
