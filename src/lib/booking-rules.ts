import { addDaysToDateString, witaDateString } from "./time";

/** Aturan booking publik (PRD F4, spec pendaftaran pasien 3.1). */
export const HOLD_MINUTES = 10;
export const PUBLIC_MIN_LEAD_MINUTES = 120;
export const PUBLIC_MAX_DAYS_AHEAD = 30;
/** Pasien boleh batal/pindah jadwal paling lambat sekian menit sebelum jadwal (F6, K16). */
export const PATIENT_CHANGE_CUTOFF_MINUTES = 120;

/** Pasien baru selalu memesan layanan ini (K9). */
export const CONSULTATION_SERVICE_SLUG = "konsultasi-dokter";
/** Layanan kategori ini tidak ditawarkan sebagai treatment untuk pasien Aesthetic lama. */
export const SLIMMING_CATEGORY_SLUG = "slimming";

/** Tanggal WITA "YYYY-MM-DD" yang boleh dipilih pasien: hari ini s/d 30 hari ke depan. */
export function isBookableDate(date: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = witaDateString(now);
  return date >= today && date <= addDaysToDateString(today, PUBLIC_MAX_DAYS_AHEAD);
}

export function canPatientChange(startAt: Date, now: Date): boolean {
  return startAt.getTime() - now.getTime() >= PATIENT_CHANGE_CUTOFF_MINUTES * 60_000;
}
