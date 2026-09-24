import { describe, expect, it } from "vitest";
import { getAvailableSlots } from "@/lib/slot";

// 11.00-19.00 WITA = 660-1140 menit sejak tengah malam.
const FULL_DAY: import("@/lib/slot").WorkWindow = { startMinute: 660, endMinute: 1140 };
const FAR_FUTURE_NOW = new Date("2026-01-01T00:00:00Z");

describe("getAvailableSlots — kasus dasar", () => {
  it("menghasilkan slot 30 menit sepanjang jam kerja saat kosong", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });

    expect(slots[0].label).toBe("11.00");
    expect(slots.at(-1)!.label).toBe("18.30");
    expect(slots).toHaveLength(16); // (1140-660)/30
  });

  it("mengembalikan larik kosong bila staf tidak bekerja hari itu (template null)", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: null,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots).toEqual([]);
  });

  it("mengembalikan larik kosong pada hari libur nasional, walau template ada", () => {
    const slots = getAvailableSlots({
      date: "2026-08-17",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: true,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots).toEqual([]);
  });
});

describe("getAvailableSlots — durasi campuran (F4a)", () => {
  it("menawarkan lebih sedikit titik mulai untuk treatment 60 menit daripada konsultasi 30 menit", () => {
    const consult = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    const treatment = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 60,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });

    expect(consult.length).toBeGreaterThan(treatment.length);
    // Treatment 60 menit yang mulai 18.30 akan berakhir 19.30 — lewat jam
    // tutup 19.00 — sehingga titik mulai terakhirnya 18.00, bukan 18.30.
    expect(treatment.at(-1)!.label).toBe("18.00");
  });

  it("tanpa jeda: treatment yang baru selesai langsung membuka slot berikutnya", () => {
    // Treatment lain sudah mengisi 15.00-16.00. Slot 16.00 harus tetap
    // tersedia, bukan baru tersedia 16.15 — sesuai F4a "tanpa jeda".
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [
        {
          startAt: new Date("2026-09-24T07:00:00Z"), // 15.00 WITA
          endAt: new Date("2026-09-24T08:00:00Z"), // 16.00 WITA
        },
      ],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });

    const labels = slots.map((s) => s.label);
    expect(labels).toContain("16.00");
    expect(labels).not.toContain("15.00");
    expect(labels).not.toContain("15.30");
  });
});

describe("getAvailableSlots — pengecualian jadwal", () => {
  it("mengosongkan seluruh hari saat ada pengecualian LIBUR, walau template ada", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [{ kind: "LIBUR", startMinute: null, endMinute: null }],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots).toEqual([]);
  });

  it("BLOKIR_SEBAGIAN menghilangkan slot pada rentang itu saja", () => {
    // Blokir 13.00-14.00 (istirahat), sisa hari tetap tersedia.
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [{ kind: "BLOKIR_SEBAGIAN", startMinute: 780, endMinute: 840 }],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("13.00");
    expect(labels).not.toContain("13.30");
    expect(labels).toContain("12.30");
    expect(labels).toContain("14.00");
  });

  it("JAM_TAMBAHAN menambah jendela kerja terpisah di luar jam normal", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [{ kind: "JAM_TAMBAHAN", startMinute: 1200, endMinute: 1260 }], // 20.00-21.00
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots.map((s) => s.label)).toContain("20.00");
  });

  it("staf tanpa template tetap dapat menerima slot lewat JAM_TAMBAHAN saja", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: null,
      exceptions: [{ kind: "JAM_TAMBAHAN", startMinute: 660, endMinute: 720 }],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots).toHaveLength(2);
  });
});

describe("getAvailableSlots — batas waktu pemesanan", () => {
  it("tidak menawarkan slot yang kurang dari minLeadMinutes dari sekarang", () => {
    // Sekarang 24 Sep 06.30 UTC = 14.30 WITA. Lead 120 menit -> paling cepat 16.30 WITA.
    const now = new Date("2026-09-24T06:30:00Z");
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now,
      minLeadMinutes: 120,
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("15.00");
    expect(labels).not.toContain("16.00");
    expect(labels).toContain("16.30");
  });
});
