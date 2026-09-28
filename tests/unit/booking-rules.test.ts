import { describe, expect, it } from "vitest";
import { canPatientChange, isBookableDate } from "@/lib/booking-rules";

// Senin 28 Sep 2026 pukul 23.30 WITA = 15.30 UTC.
const NOW = new Date("2026-09-28T15:30:00Z");

describe("isBookableDate", () => {
  it("menerima hari ini sampai 30 hari ke depan menurut WITA", () => {
    expect(isBookableDate("2026-09-28", NOW)).toBe(true);
    expect(isBookableDate("2026-10-28", NOW)).toBe(true);
  });

  it("menolak kemarin, hari ke-31, dan format yang salah", () => {
    expect(isBookableDate("2026-09-27", NOW)).toBe(false);
    expect(isBookableDate("2026-10-29", NOW)).toBe(false);
    expect(isBookableDate("28-09-2026", NOW)).toBe(false);
  });
});

describe("canPatientChange", () => {
  it("mengizinkan batal atau pindah paling lambat 2 jam sebelum jadwal", () => {
    expect(canPatientChange(new Date("2026-09-28T17:30:00Z"), NOW)).toBe(true);
    expect(canPatientChange(new Date("2026-09-28T17:29:00Z"), NOW)).toBe(false);
  });
});
