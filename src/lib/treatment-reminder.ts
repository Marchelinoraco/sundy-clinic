import { formatIndonesianDate } from "./format";
import { firstName } from "./quiz-link";

// Pengingat "waktunya treatment lagi" (spec pengingat treatment PT2, PT11). Murni: dipakai halaman dan server.

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

/** Pesan WhatsApp "waktunya treatment lagi" (PT11); `treatmentOn` = tanggal treatment WITA (YYYY-MM-DD). */
export function treatmentReminderMessage(input: { patientName: string; treatments: readonly string[]; treatmentOn: string; intervalDays: number }): string {
  const date = formatIndonesianDate(new Date(`${input.treatmentOn}T00:00:00Z`));
  return (
    `Halo ${firstName(input.patientName)}, terima kasih sudah melakukan ${treatmentNamesLabel(input.treatments)} di SunDY Clinic pada ${date}. ` +
    `Agar hasilnya maksimal, treatment ini sebaiknya dilakukan ${returnIntervalPhrase(input.intervalDays)}. ` +
    "Yuk jadwalkan kunjungan berikutnya — balas pesan ini untuk memilih waktu. SunDY Clinic"
  );
}
