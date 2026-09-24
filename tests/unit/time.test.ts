import { describe, expect, it } from "vitest";
import {
  combineWitaDateAndMinutes,
  minutesToTimeInput,
  minutesToTimeLabel,
  timeInputToMinutes,
  witaDateString,
  witaMinutesOfDay,
  witaWeekday,
} from "@/lib/time";

describe("konversi nilai <input type=time>", () => {
  it("mengubah 'HH:MM' menjadi menit sejak tengah malam", () => {
    expect(timeInputToMinutes("11:00")).toBe(660);
    expect(timeInputToMinutes("15:30")).toBe(930);
  });

  it("mengembalikan null untuk nilai kosong atau tidak sah", () => {
    expect(timeInputToMinutes("")).toBeNull();
    expect(timeInputToMinutes("25:00")).toBeNull();
    expect(timeInputToMinutes("abc")).toBeNull();
  });

  it("mengubah menit menjadi 'HH:MM' untuk nilai awal input", () => {
    expect(minutesToTimeInput(660)).toBe("11:00");
    expect(minutesToTimeInput(1140)).toBe("19:00");
  });
});

describe("witaDateString", () => {
  it("mengembalikan tanggal WITA, bukan tanggal UTC", () => {
    // 23.30 WITA tanggal 25 = 15.30 UTC tanggal 25, masih hari yang sama.
    // Tapi 00.30 WITA tanggal 26 = 16.30 UTC tanggal 25 — beda tanggal UTC.
    const date = new Date("2026-09-25T16:30:00Z");
    expect(witaDateString(date)).toBe("2026-09-26");
  });
});

describe("witaWeekday", () => {
  it("mengembalikan 4 untuk Kamis dalam WITA", () => {
    // 25 Sep 2026 pukul 07.00 UTC = 15.00 WITA, hari Jumat (5).
    expect(witaWeekday(new Date("2026-09-25T07:00:00Z"))).toBe(5);
  });
});

describe("combineWitaDateAndMinutes", () => {
  it("menggabungkan tanggal WITA dan menit menjadi instant UTC", () => {
    // 25 Sep 2026 pukul 15.00 WITA = 07.00 UTC.
    const instant = combineWitaDateAndMinutes("2026-09-25", 900);
    expect(instant.toISOString()).toBe("2026-09-25T07:00:00.000Z");
  });

  it("menangani lewat tengah malam WITA dengan benar", () => {
    // 25 Sep 2026 pukul 00.30 WITA = 24 Sep pukul 16.30 UTC.
    const instant = combineWitaDateAndMinutes("2026-09-25", 30);
    expect(instant.toISOString()).toBe("2026-09-24T16:30:00.000Z");
  });
});

describe("minutesToTimeLabel", () => {
  it("memformat menit sejak tengah malam menjadi jam.menit", () => {
    expect(minutesToTimeLabel(540)).toBe("09.00");
    expect(minutesToTimeLabel(930)).toBe("15.30");
    expect(minutesToTimeLabel(0)).toBe("00.00");
  });
});

describe("witaMinutesOfDay", () => {
  it("adalah kebalikan combineWitaDateAndMinutes", () => {
    // 25 Sep 2026 pukul 15.30 WITA = 900+30 = 930 menit sejak tengah malam WITA.
    const instant = combineWitaDateAndMinutes("2026-09-25", 930);
    expect(witaMinutesOfDay(instant)).toBe(930);
  });

  it("menangani lewat tengah malam WITA dengan benar", () => {
    const instant = combineWitaDateAndMinutes("2026-09-25", 30); // 00.30 WITA
    expect(witaMinutesOfDay(instant)).toBe(30);
  });
});
