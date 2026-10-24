import { formatIndonesianDate } from "./format";
import { firstName } from "./quiz-link";

// Pengingat "waktunya treatment lagi" (spec pengingat treatment PT2, PT11). Murni: dipakai halaman dan server.

/**
 * Layanan yang awalnya tidak diingatkan (PT3): konsultasi, BIA, meal plan (bukan treatment), dan treatment intim yang
 * namanya tidak pantas tampil di pratinjau notifikasi WhatsApp. Dipakai seed; migrasi pengingat treatment memakai daftar yang sama.
 */
export const NO_RETURN_REMINDER_SLUGS: ReadonlySet<string> = new Set([
  "konsultasi-dokter",
  "konsultasi-online",
  "konsultasi-bia",
  "timbang-bia",
  "bia",
  "meal-plan",
  "hifu-miss-v",
]);

/** Pilihan jarak pengingat per layanan, dalam hari ("1 bulan" = 30 hari). */
export const RETURN_INTERVALS = [7, 14, 21, 30, 60, 90, 180] as const;

const LABEL: Record<number, string> = { 7: "1 minggu", 14: "2 minggu", 21: "3 minggu", 30: "1 bulan", 60: "2 bulan", 90: "3 bulan", 180: "6 bulan" };
const PHRASE: Record<number, string> = {
  7: "setiap minggu",
  14: "setiap 2 minggu",
  21: "setiap 3 minggu",
  30: "setiap bulan",
  60: "setiap 2 bulan",
  90: "setiap 3 bulan",
  180: "setiap 6 bulan",
};

export function isReturnInterval(value: unknown): value is number {
  return typeof value === "number" && (RETURN_INTERVALS as readonly number[]).includes(value);
}

/** Label pilihan di Layanan & Harga; kosong = "Tidak diingatkan". */
export function returnIntervalLabel(days: number | null): string {
  return days === null ? "Tidak diingatkan" : (LABEL[days] ?? `${days} hari`);
}

/** Frasa di pesan WhatsApp: "setiap minggu", "setiap 2 minggu", … */
export function returnIntervalPhrase(days: number): string {
  return PHRASE[days] ?? `setiap ${days} hari`;
}

/** Baris yang belum dikirim tetap di kotak 5 selama 7 hari sejak waktunya, supaya hari libur terkejar (rencana). */
export const RETURN_WINDOW_DAYS = 7;

/** "A", "A dan B", "A, B, dan C". */
export function treatmentNamesLabel(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} dan ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, dan ${names[names.length - 1]}`;
}

/**
 * Pesan WhatsApp "waktunya treatment lagi" (PT11); `treatmentOn` = tanggal treatment WITA (YYYY-MM-DD). Semua treatment
 * kunjungan itu disebut; anjurannya memakai jarak terpendek (PT7). Bila jaraknya berbeda, anjuran menyebut nama treatment
 * berjarak terpendek saja, supaya Botox tidak ikut dianjurkan tiap minggu (temuan review).
 */
export function treatmentReminderMessage(input: { patientName: string; treatments: readonly { name: string; intervalDays: number }[]; treatmentOn: string }): string {
  const date = formatIndonesianDate(new Date(`${input.treatmentOn}T00:00:00Z`));
  const shortest = Math.min(...input.treatments.map((treatment) => treatment.intervalDays));
  const due = input.treatments.filter((treatment) => treatment.intervalDays === shortest).map((treatment) => treatment.name);
  const subject = due.length === input.treatments.length ? "treatment ini" : treatmentNamesLabel(due);
  return (
    `Halo ${firstName(input.patientName)}, terima kasih sudah melakukan ${treatmentNamesLabel(input.treatments.map((treatment) => treatment.name))} di SunDY Clinic pada ${date}. ` +
    `Agar hasilnya maksimal, ${subject} sebaiknya dilakukan ${returnIntervalPhrase(shortest)}. ` +
    "Yuk jadwalkan kunjungan berikutnya — balas pesan ini untuk memilih waktu. SunDY Clinic"
  );
}
