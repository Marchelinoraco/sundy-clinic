import { confirmationCutoff, MAX_LOOKBACK_DAYS } from "@/lib/confirmation-window";
import { prisma } from "@/lib/db";
import { recordAudit, SYSTEM_ACTOR } from "@/server/audit";

/** Tanggal libur (WITA) yang mungkin jatuh di dalam jendela konfirmasi sebelum `now`. */
async function closedDatesBefore(now: Date): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({
    where: { date: { gte: new Date(now.getTime() - (MAX_LOOKBACK_DAYS + 1) * 24 * 60 * 60 * 1000), lte: now } },
    select: { date: true },
  });
  return new Set(rows.map((row) => row.date.toISOString().slice(0, 10)));
}

/**
 * Menandai booking situs yang melewati batas konfirmasi sebagai KEDALUWARSA,
 * sehingga slotnya lepas dari exclusion constraint. Batasnya 24 jam di luar
 * hari Minggu dan tanggal libur (lihat `confirmationCutoff`).
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
  const cutoff = confirmationCutoff(now, await closedDatesBefore(now));

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
