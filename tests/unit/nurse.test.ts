import { describe, expect, it } from "vitest";
import { NURSE_OUT_OF_SCOPE, nurseCanWork } from "@/lib/nurse";

describe("batas kerja perawat (spec peran perawat 5)", () => {
  const now = new Date("2026-10-20T03:00:00Z"); // 11.00 WITA
  const base = { status: "HADIR", channel: "KLINIK" as const, startAt: new Date("2026-10-20T02:00:00Z") };

  it("hanya booking klinik hari ini yang Hadir", () => {
    expect(nurseCanWork(base, now)).toBe(true);
    expect(nurseCanWork({ ...base, status: "SELESAI" }, now)).toBe(false);
    expect(nurseCanWork({ ...base, status: "TERKONFIRMASI" }, now)).toBe(false);
    expect(nurseCanWork({ ...base, channel: "ONLINE" }, now)).toBe(false);
    expect(nurseCanWork({ ...base, startAt: new Date("2026-10-19T02:00:00Z") }, now)).toBe(false);
  });

  it("hari dihitung dalam WITA, bukan UTC", () => {
    expect(nurseCanWork({ ...base, startAt: new Date("2026-10-19T16:30:00Z") }, now)).toBe(true); // 00.30 WITA 20 Okt
    expect(nurseCanWork({ ...base, startAt: new Date("2026-10-19T15:30:00Z") }, now)).toBe(false); // 23.30 WITA 19 Okt
  });

  it("pesan di luar batas", () => {
    expect(NURSE_OUT_OF_SCOPE).toBe("Pasien ini tidak sedang ditangani hari ini.");
  });
});
