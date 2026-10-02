import type { AppointmentStatusValue } from "./appointment-status";
import { formatShortIndonesianDate } from "./format";
import { addDaysToDateString, combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay, witaWeekday } from "./time";

/** Sapaan kepala dasbor menurut jam WITA (spec D 4.1). */
export function greetingFor(now: Date): string {
  const hour = Math.floor(witaMinutesOfDay(now) / 60);
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

const TITLE = /^(dr|drg|prof|ny|tn|bpk|ibu|bu|sdr|sdri)\.?$/i;

/** Nama untuk sapaan: kata pertama yang bukan gelar ("Dr. Diane Paparang, Sp.GK" → "Diane"). */
export function greetingName(fullName: string): string {
  const words = fullName.split(",")[0].trim().split(/\s+/).filter(Boolean);
  return words.find((word) => !TITLE.test(word)) ?? words[0] ?? "";
}

export const DASHBOARD_PERIODS = ["minggu", "bulan"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export function parsePeriod(value: string | string[] | undefined): DashboardPeriod {
  return value === "bulan" ? "bulan" : "minggu";
}

export type TimeRange = { start: Date; end: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Periode Angka dan pembandingnya (spec D 4.5): sampai sekarang, dibanding periode
 * sebelumnya sampai titik yang sama. Bulan lalu yang lebih pendek berhenti di akhir bulannya.
 */
export function periodRanges(
  period: DashboardPeriod,
  now: Date,
): { current: TimeRange; previous: TimeRange; label: string; previousLabel: string } {
  const today = witaDateString(now);
  const elapsedToday = now.getTime() - combineWitaDateAndMinutes(today, 0).getTime();

  if (period === "minggu") {
    const monday = addDaysToDateString(today, -((witaWeekday(now) + 6) % 7));
    const start = combineWitaDateAndMinutes(monday, 0);
    return {
      current: { start, end: now },
      previous: { start: new Date(start.getTime() - 7 * DAY_MS), end: new Date(now.getTime() - 7 * DAY_MS) },
      label: `${formatShortIndonesianDate(start)} – ${formatShortIndonesianDate(now)}`,
      previousLabel: "minggu lalu",
    };
  }

  const [year, month, day] = today.split("-").map(Number);
  const start = combineWitaDateAndMinutes(`${today.slice(0, 7)}-01`, 0);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  const previousEnd =
    day > daysInMonth(prevYear, prevMonth)
      ? start
      : new Date(combineWitaDateAndMinutes(`${prevPrefix}-${String(day).padStart(2, "0")}`, 0).getTime() + elapsedToday);
  return {
    current: { start, end: now },
    previous: { start: combineWitaDateAndMinutes(`${prevPrefix}-01`, 0), end: previousEnd },
    label: `${formatShortIndonesianDate(start)} – ${formatShortIndonesianDate(now)}`,
    previousLabel: "bulan lalu",
  };
}

export type MinuteWindow = { startMinute: number; endMinute: number };

/** Sumbu garis waktu: jam kerja dan booking hari ini, dibulatkan ke jam penuh (spec D 4.3). */
export function timelineAxis(ranges: MinuteWindow[]): MinuteWindow | null {
  if (ranges.length === 0) return null;
  const start = Math.min(...ranges.map((r) => r.startMinute));
  const end = Math.max(...ranges.map((r) => r.endMinute));
  return { startMinute: Math.floor(start / 60) * 60, endMinute: Math.ceil(end / 60) * 60 };
}

export function timelineHours(axis: MinuteWindow): number[] {
  const hours: number[] = [];
  for (let minute = axis.startMinute; minute <= axis.endMinute; minute += 60) hours.push(minute / 60);
  return hours;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Posisi kiri dan lebar dalam persen sumbu; bagian di luar sumbu dipotong, tanpa irisan = null. */
export function timelinePosition(startMinute: number, endMinute: number, axis: MinuteWindow): { left: number; width: number } | null {
  const span = axis.endMinute - axis.startMinute;
  const from = Math.max(startMinute, axis.startMinute);
  const to = Math.min(endMinute, axis.endMinute);
  if (span <= 0 || to <= from) return null;
  return { left: round2(((from - axis.startMinute) / span) * 100), width: round2(((to - from) / span) * 100) };
}

export type TimelineTone = "menunggu" | "terkonfirmasi" | "hadir" | "tidak-hadir";

export function timelineTone(status: AppointmentStatusValue): TimelineTone | null {
  switch (status) {
    case "MENUNGGU_KONFIRMASI":
      return "menunggu";
    case "TERKONFIRMASI":
      return "terkonfirmasi";
    case "HADIR":
    case "SELESAI":
      return "hadir";
    case "TIDAK_HADIR":
      return "tidak-hadir";
    default:
      return null;
  }
}

/** Selisih terhadap periode pembanding: "+4", "−2" (tanda minus), atau "sama". */
export function deltaLabel(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return "sama";
  return diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
}

/** Keterangan kepala dasbor tentang jam buka hari ini (spec D 4.1). */
export function clinicDayLabel(input: { holidayName: string | null; windows: MinuteWindow[] }): string {
  if (input.holidayName) return `Klinik tutup hari ini — ${input.holidayName}`;
  if (input.windows.length === 0) return "tidak ada jadwal praktik hari ini";
  const start = Math.min(...input.windows.map((w) => w.startMinute));
  const end = Math.max(...input.windows.map((w) => w.endMinute));
  return `klinik buka ${minutesToTimeLabel(start)}–${minutesToTimeLabel(end)}`;
}
