import { describe, expect, it } from "vitest";
import { rowsChanged, toDayInputs, weekRows } from "@/lib/schedule-week";

const TEMPLATES = [
  { weekday: 1, startMinute: 660, endMinute: 1140 },
  { weekday: 6, startMinute: 600, endMinute: 900 },
];

describe("jam kerja seminggu (spec D 5.1)", () => {
  it("baris Senin–Minggu; hari tanpa jam kerja tutup dengan jam bawaan", () => {
    const rows = weekRows(TEMPLATES);
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(rows[0]).toEqual({ weekday: 1, open: true, start: "11:00", end: "19:00" });
    expect(rows[1]).toEqual({ weekday: 2, open: false, start: "11:00", end: "19:00" });
    expect(rows[5]).toEqual({ weekday: 6, open: true, start: "10:00", end: "15:00" });
    expect(rows[6]).toMatchObject({ weekday: 0, open: false });
  });

  it("perubahan: jam hari buka atau status buka; jam hari tutup diabaikan", () => {
    const saved = weekRows(TEMPLATES);
    expect(rowsChanged(saved, saved)).toBe(false);
    expect(rowsChanged(saved.map((r) => (r.weekday === 1 ? { ...r, end: "18:00" } : r)), saved)).toBe(true);
    expect(rowsChanged(saved.map((r) => (r.weekday === 2 ? { ...r, end: "12:00" } : r)), saved)).toBe(false);
    expect(rowsChanged(saved.map((r) => (r.weekday === 0 ? { ...r, open: true } : r)), saved)).toBe(true);
  });

  it("dicentang lalu dibatalkan lagi: tidak dianggap berubah (Review Focus 5)", () => {
    const saved = weekRows(TEMPLATES);
    const toggledTwice = saved.map((r) => (r.weekday === 0 ? { ...r, open: true } : r)).map((r) => (r.weekday === 0 ? { ...r, open: false } : r));
    expect(rowsChanged(toggledTwice, saved)).toBe(false);
  });

  it("ke masukan server: menit, atau null untuk jam yang kosong", () => {
    const days = toDayInputs(weekRows(TEMPLATES).map((r) => (r.weekday === 3 ? { ...r, open: true, start: "" } : r)));
    expect(days.find((d) => d.weekday === 1)).toEqual({ weekday: 1, open: true, startMinute: 660, endMinute: 1140 });
    expect(days.find((d) => d.weekday === 3)).toEqual({ weekday: 3, open: true, startMinute: null, endMinute: 1140 });
    expect(days.find((d) => d.weekday === 2)).toEqual({ weekday: 2, open: false, startMinute: 660, endMinute: 1140 });
  });
});
