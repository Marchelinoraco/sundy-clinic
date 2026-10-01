import { confirmationCutoff, confirmationDeadline, MAX_LOOKBACK_DAYS } from "@/lib/confirmation-window";
import { prisma } from "@/lib/db";
import type { BookingSourceValue } from "@/lib/payment";
import { needsTransfer, transferDeadline } from "@/lib/transfer-instruction";
import { recordAudit, SYSTEM_ACTOR } from "@/server/audit";

const LOOKBACK_MS = (MAX_LOOKBACK_DAYS + 1) * 24 * 60 * 60 * 1000;

/** Tanggal libur (WITA, "YYYY-MM-DD") dari `from` sampai `to`. */
export async function closedDatesBetween(from: Date, to: Date): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({
    where: { date: { gte: new Date(from.getTime() - 24 * 60 * 60 * 1000), lte: to } },
    select: { date: true },
  });
  return new Set(rows.map((row) => row.date.toISOString().slice(0, 10)));
}

/** Booking situs yang dibuat sebelum instant ini sudah melewati batas konfirmasi. */
export async function currentConfirmationCutoff(now: Date = new Date()): Promise<Date> {
  return confirmationCutoff(now, await closedDatesBetween(new Date(now.getTime() - LOOKBACK_MS), now));
}

/** Saat tiap booking situs menjadi KEDALUWARSA bila belum diverifikasi (satu kueri libur untuk semua). */
export async function confirmationDeadlines(createdAts: Date[]): Promise<Date[]> {
  if (createdAts.length === 0) return [];
  const earliest = new Date(Math.min(...createdAts.map((date) => date.getTime())));
  const latest = new Date(Math.max(...createdAts.map((date) => date.getTime())) + LOOKBACK_MS);
  const closed = await closedDatesBetween(earliest, latest);
  return createdAts.map((createdAt) => confirmationDeadline(createdAt, closed));
}

/**
 * Batas transfer untuk booking WA/telepon yang menunggu transfer, atau null
 * untuk booking lain (satu kueri libur untuk semua). Hanya pengingat: tidak
 * ada yang dibatalkan saat batas ini lewat (spec C1, B5).
 */
export async function transferDeadlines(
  bookings: { source: BookingSourceValue; status: string; bookingFee: number | null; createdAt: Date; startAt: Date }[],
): Promise<(Date | null)[]> {
  const due = bookings.filter(needsTransfer);
  if (due.length === 0) return bookings.map(() => null);
  const earliest = new Date(Math.min(...due.map((b) => b.createdAt.getTime())));
  const latest = new Date(Math.max(...due.map((b) => b.createdAt.getTime())) + LOOKBACK_MS);
  const closed = await closedDatesBetween(earliest, latest);
  return bookings.map((b) => (needsTransfer(b) ? transferDeadline(b.createdAt, b.startAt, closed) : null));
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
  const cutoff = await currentConfirmationCutoff(now);

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
