import { minutesToTimeInput, timeInputToMinutes } from "./time";

export const WEEKDAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
/** Urutan tabel jam kerja: Senin dulu, Minggu terakhir. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const DEFAULT_START = "11:00";
const DEFAULT_END = "19:00";

/** Satu baris tabel jam kerja; jam dalam format <input type="time"> ("HH:MM"). */
export type WeekRow = { weekday: number; open: boolean; start: string; end: string };

export function weekRows(templates: { weekday: number; startMinute: number; endMinute: number }[]): WeekRow[] {
  return WEEK_ORDER.map((weekday) => {
    const template = templates.find((t) => t.weekday === weekday);
    return template
      ? { weekday, open: true, start: minutesToTimeInput(template.startMinute), end: minutesToTimeInput(template.endMinute) }
      : { weekday, open: false, start: DEFAULT_START, end: DEFAULT_END };
  });
}

/** Jam di hari yang tutup diabaikan: mencentang lalu membatalkan centang bukan perubahan. */
export function rowsChanged(rows: WeekRow[], saved: WeekRow[]): boolean {
  return rows.some((row) => {
    const before = saved.find((s) => s.weekday === row.weekday);
    if (!before || row.open !== before.open) return true;
    return row.open && (row.start !== before.start || row.end !== before.end);
  });
}

export type WeeklyDayInput = { weekday: number; open: boolean; startMinute: number | null; endMinute: number | null };

export function toDayInputs(rows: WeekRow[]): WeeklyDayInput[] {
  return rows.map((row) => ({
    weekday: row.weekday,
    open: row.open,
    startMinute: timeInputToMinutes(row.start),
    endMinute: timeInputToMinutes(row.end),
  }));
}
