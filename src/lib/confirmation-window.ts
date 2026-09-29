import { combineWitaDateAndMinutes, witaDateString, witaWeekday } from "./time";

/** Booking situs yang belum diverifikasi selama ini menjadi KEDALUWARSA (spec K13). */
export const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Rentang terjauh yang ditelusuri mundur; cukup untuk libur panjang lebaran plus hari Minggu. */
export const MAX_LOOKBACK_DAYS = 45;

/**
 * Batas `createdAt`: booking situs yang dibuat sebelum instant ini sudah
 * melewati 24 jam konfirmasi. Jam pada hari Minggu dan tanggal libur tidak
 * dihitung, karena admin tidak memverifikasi booking pada hari itu — booking
 * Sabtu pukul 15.00 baru kedaluwarsa Senin pukul 15.00.
 *
 * `closedDates` berisi tanggal libur WITA ("YYYY-MM-DD"); hari Minggu selalu
 * dilewati tanpa perlu dicantumkan.
 */
export function confirmationCutoff(now: Date, closedDates: ReadonlySet<string>): Date {
  let remaining = CONFIRMATION_WINDOW_MS;
  let cursor = now;
  for (let day = 0; day < MAX_LOOKBACK_DAYS; day += 1) {
    // Hari WITA tempat jam tepat sebelum `cursor` berada.
    const date = witaDateString(new Date(cursor.getTime() - 1));
    const dayStart = combineWitaDateAndMinutes(date, 0);
    const closed = witaWeekday(dayStart) === 0 || closedDates.has(date);
    if (!closed) {
      const counted = cursor.getTime() - dayStart.getTime();
      if (counted >= remaining) return new Date(cursor.getTime() - remaining);
      remaining -= counted;
    }
    cursor = dayStart;
  }
  return cursor;
}
