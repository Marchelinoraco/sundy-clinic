import { describe, expect, it } from "vitest";
import {
  clinicDayLabel,
  deltaLabel,
  greetingFor,
  greetingName,
  parsePeriod,
  periodRanges,
  timelineAxis,
  timelineHours,
  timelinePosition,
  timelineTone,
} from "@/lib/dashboard";

// Jam WITA = UTC + 8.
const wita = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);

describe("greetingFor (spec D 4.1)", () => {
  it.each([
    ["03:59", "Selamat malam"],
    ["04:00", "Selamat pagi"],
    ["10:59", "Selamat pagi"],
    ["11:00", "Selamat siang"],
    ["14:59", "Selamat siang"],
    ["15:00", "Selamat sore"],
    ["17:59", "Selamat sore"],
    ["18:00", "Selamat malam"],
    ["23:30", "Selamat malam"],
  ])("pukul %s WITA → %s", (time, greeting) => {
    expect(greetingFor(wita("2031-02-12", time))).toBe(greeting);
  });

  it("nama sapaan melewati gelar dan singkatan di belakang koma", () => {
    expect(greetingName("Dr. Diane Paparang, Sp.GK, AIFO-K")).toBe("Diane");
    expect(greetingName("dr. Budi Santoso")).toBe("Budi");
    expect(greetingName("drg. Maria")).toBe("Maria");
    expect(greetingName("Staf E2E")).toBe("Staf");
    expect(greetingName("Lino")).toBe("Lino");
    expect(greetingName("Dr.")).toBe("Dr.");
  });
});

describe("parsePeriod", () => {
  it("bawaan minggu; bulan hanya bila diminta", () => {
    expect(parsePeriod(undefined)).toBe("minggu");
    expect(parsePeriod("bulan")).toBe("bulan");
    expect(parsePeriod("tahun")).toBe("minggu");
    expect(parsePeriod(["bulan"])).toBe("minggu");
  });
});

describe("periodRanges (spec D 4.5)", () => {
  it("minggu ini: Senin 00.00 sampai sekarang, dibanding minggu lalu sampai jam yang sama", () => {
    const now = wita("2031-02-13", "15:20"); // Kamis
    const r = periodRanges("minggu", now);
    expect(r.current).toEqual({ start: wita("2031-02-10", "00:00"), end: now });
    expect(r.previous).toEqual({ start: wita("2031-02-03", "00:00"), end: wita("2031-02-06", "15:20") });
    expect(r.previousLabel).toBe("minggu lalu");
  });

  it("Minggu (hari) masih bagian minggu yang dimulai Senin sebelumnya", () => {
    const r = periodRanges("minggu", wita("2031-02-16", "10:00")); // Minggu
    expect(r.current.start).toEqual(wita("2031-02-10", "00:00"));
  });

  it("Senin pukul 00.30: minggu baru baru berjalan setengah jam", () => {
    const now = wita("2031-02-17", "00:30");
    const r = periodRanges("minggu", now);
    expect(r.current).toEqual({ start: wita("2031-02-17", "00:00"), end: now });
    expect(r.previous).toEqual({ start: wita("2031-02-10", "00:00"), end: wita("2031-02-10", "00:30") });
  });

  it("bulan ini: tanggal 1 sampai sekarang, dibanding bulan lalu sampai tanggal dan jam yang sama", () => {
    const now = wita("2031-02-12", "09:00");
    const r = periodRanges("bulan", now);
    expect(r.current).toEqual({ start: wita("2031-02-01", "00:00"), end: now });
    expect(r.previous).toEqual({ start: wita("2031-01-01", "00:00"), end: wita("2031-01-12", "09:00") });
    expect(r.previousLabel).toBe("bulan lalu");
  });

  it("31 Maret dibanding Februari berhenti di akhir Februari", () => {
    const r = periodRanges("bulan", wita("2031-03-31", "12:00"));
    expect(r.previous).toEqual({ start: wita("2031-02-01", "00:00"), end: wita("2031-03-01", "00:00") });
  });

  it("Januari dibanding Desember tahun sebelumnya", () => {
    const r = periodRanges("bulan", wita("2031-01-05", "08:00"));
    expect(r.previous).toEqual({ start: wita("2030-12-01", "00:00"), end: wita("2030-12-05", "08:00") });
  });
});

describe("garis waktu (spec D 4.3)", () => {
  it("sumbu mencakup jam kerja DAN booking di luarnya, dibulatkan ke jam penuh", () => {
    expect(
      timelineAxis([
        { startMinute: 660, endMinute: 1140 }, // 11.00–19.00
        { startMinute: 360, endMinute: 390 }, // booking 06.00–06.30
        { startMinute: 1150, endMinute: 1175 }, // booking 19.10–19.35
      ]),
    ).toEqual({ startMinute: 360, endMinute: 1200 });
    expect(timelineAxis([])).toBeNull();
  });

  it("jam penanda dari awal sampai akhir sumbu", () => {
    expect(timelineHours({ startMinute: 660, endMinute: 900 })).toEqual([11, 12, 13, 14, 15]);
  });

  it("posisi dan lebar dalam persen; di luar sumbu terpotong atau hilang", () => {
    const axis = { startMinute: 600, endMinute: 1200 }; // 10.00–20.00
    expect(timelinePosition(660, 690, axis)).toEqual({ left: 10, width: 5 });
    expect(timelinePosition(1170, 1260, axis)).toEqual({ left: 95, width: 5 });
    expect(timelinePosition(500, 540, axis)).toBeNull();
  });

  it("warna menurut status; batal dan kedaluwarsa tidak ditampilkan", () => {
    expect(timelineTone("MENUNGGU_KONFIRMASI")).toBe("menunggu");
    expect(timelineTone("TERKONFIRMASI")).toBe("terkonfirmasi");
    expect(timelineTone("HADIR")).toBe("hadir");
    expect(timelineTone("SELESAI")).toBe("hadir");
    expect(timelineTone("TIDAK_HADIR")).toBe("tidak-hadir");
    expect(timelineTone("DIBATALKAN")).toBeNull();
    expect(timelineTone("KEDALUWARSA")).toBeNull();
  });
});

describe("label lain", () => {
  it("selisih angka", () => {
    expect(deltaLabel(23, 19)).toBe("+4");
    expect(deltaLabel(3, 5)).toBe("−2");
    expect(deltaLabel(6, 6)).toBe("sama");
  });

  it("jam buka klinik hari ini", () => {
    expect(clinicDayLabel({ holidayName: null, windows: [{ startMinute: 660, endMinute: 1140 }, { startMinute: 720, endMinute: 1080 }] })).toBe(
      "klinik buka 11.00–19.00",
    );
    expect(clinicDayLabel({ holidayName: null, windows: [] })).toBe("tidak ada jadwal praktik hari ini");
    expect(clinicDayLabel({ holidayName: "Hari Raya Natal", windows: [] })).toBe("Klinik tutup hari ini — Hari Raya Natal");
  });
});
