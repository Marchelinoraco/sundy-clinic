import { CLINIC_TIMEZONE } from "./clinic";

const witaPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

/** Tanggal dalam zona waktu klinik (WITA), format "YYYY-MM-DD". */
export function witaDateString(date: Date): string {
  const parts = witaPartsFormatter.formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Hari dalam minggu di WITA. 0 = Minggu ... 6 = Sabtu. */
export function witaWeekday(date: Date): number {
  const parts = witaPartsFormatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  return WEEKDAY_INDEX[weekday];
}

/**
 * Menggabungkan tanggal WITA ("YYYY-MM-DD") dan menit sejak tengah malam WITA
 * menjadi instant UTC. WITA adalah UTC+8 tanpa DST, jadi konversinya tetap.
 */
export function combineWitaDateAndMinutes(dateStr: string, minutes: number): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  // WITA = UTC+8. Kurangi 8 jam dari waktu lokal untuk mendapat instant UTC.
  return new Date(Date.UTC(year, month - 1, day, hours - 8, mins));
}

/** Menit sejak tengah malam menjadi label "HH.MM", misal 930 -> "15.30". */
export function minutesToTimeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}.${String(mins).padStart(2, "0")}`;
}

const witaTimePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Kebalikan combineWitaDateAndMinutes: mengambil menit-sejak-tengah-malam
 * WITA dari sebuah instant UTC. Dipakai saat menampilkan ulang jam booking
 * yang tersimpan sebagai instant UTC di basis data.
 */
export function witaMinutesOfDay(date: Date): number {
  const label = witaTimePartsFormatter.format(date); // "HH:MM"
  const [hours, minutes] = label.split(":").map(Number);
  return hours * 60 + minutes;
}
