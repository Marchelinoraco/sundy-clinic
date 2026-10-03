import { describe, expect, it } from "vitest";
import {
  appendToSubjective,
  foodRecallHeader,
  foodRecallLinkState,
  foodRecallMessageText,
  foodRecallRows,
  foodRecallSubjectiveText,
  parseStoredEntries,
  recallDateFor,
  recallDateLabel,
  recallDateShortLabel,
  shouldOfferFoodRecall,
  validateCustomerEntries,
  validateStaffEntries,
  type FoodRecallEntry,
} from "@/lib/food-recall";
import { combineWitaDateAndMinutes } from "@/lib/time";

const ENTRIES: FoodRecallEntry[] = [
  { hour: 12, kind: "KAPSUL_OBAT", text: "Kapsul M", by: "CUSTOMER" },
  { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning 1 piring, teh manis", by: "CUSTOMER" },
  { hour: 7, kind: "OLAHRAGA", text: "Jalan pagi 20 menit", by: "DOKTER" },
];

describe("tanggal H-1", () => {
  it("sehari sebelum tanggal booking dalam WITA, termasuk awal bulan dan tahun", () => {
    expect(recallDateFor(combineWitaDateAndMinutes("2026-10-03", 11 * 60))).toBe("2026-10-02");
    expect(recallDateFor(combineWitaDateAndMinutes("2026-10-01", 6 * 60))).toBe("2026-09-30");
    expect(recallDateFor(combineWitaDateAndMinutes("2027-01-01", 0))).toBe("2026-12-31");
  });

  it("label panjang dan pendek berbahasa Indonesia", () => {
    expect(recallDateLabel("2026-10-02")).toBe("Jumat, 2 Oktober");
    expect(recallDateShortLabel("2026-10-02")).toBe("Jumat, 2 Okt");
  });
});

describe("validasi baris", () => {
  it("kiriman customer: minimal 1, paling banyak 40, semua ditandai CUSTOMER", () => {
    expect(validateCustomerEntries([])).toEqual({ ok: false, message: "Tambahkan minimal satu catatan." });
    const many = Array.from({ length: 41 }, () => ({ hour: 8, kind: "MAKAN_MINUM", text: "Roti" }));
    expect(validateCustomerEntries(many)).toEqual({ ok: false, message: "Paling banyak 40 catatan." });
    expect(validateCustomerEntries([{ hour: 8, kind: "MAKAN_MINUM", text: "Roti", by: "DOKTER" }]).ok).toBe(false);
    expect(validateCustomerEntries([{ hour: 8, kind: "MAKAN_MINUM", text: " Roti " }])).toEqual({
      ok: true,
      entries: [{ hour: 8, kind: "MAKAN_MINUM", text: "Roti", by: "CUSTOMER" }],
    });
  });

  it("menolak jam di luar 06–22, jenis asing, dan isi kosong", () => {
    expect(validateCustomerEntries([{ hour: 5, kind: "MAKAN_MINUM", text: "Roti" }]).ok).toBe(false);
    expect(validateCustomerEntries([{ hour: 8, kind: "TIDUR", text: "Tidur" }]).ok).toBe(false);
    expect(validateCustomerEntries([{ hour: 8, kind: "MAKAN_MINUM", text: "   " }]).ok).toBe(false);
  });

  it("simpanan dokter: baris customer tetap CUSTOMER, baris baru menjadi DOKTER", () => {
    const result = validateStaffEntries([
      { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
      { hour: 9, kind: "OLAHRAGA", text: "Senam" },
    ]);
    expect(result).toEqual({
      ok: true,
      entries: [
        { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
        { hour: 9, kind: "OLAHRAGA", text: "Senam", by: "DOKTER" },
      ],
    });
  });

  it("baris tersimpan yang rusak dibaca sebagai kosong", () => {
    expect(parseStoredEntries("bukan larik")).toEqual([]);
    expect(parseStoredEntries([{ hour: "tujuh" }])).toEqual([]);
    expect(parseStoredEntries(ENTRIES)).toEqual(ENTRIES);
  });
});

describe("tabel dan teks untuk dokter", () => {
  it("tabel 06.00–22.00 dengan tanda baris dokter", () => {
    const rows = foodRecallRows(ENTRIES);
    expect(rows).toHaveLength(17);
    expect(rows[0].label).toBe("06.00");
    expect(rows[1]).toEqual({
      hour: 7,
      label: "07.00",
      entries: [
        { kindLabel: "Makan/minum", text: "Nasi kuning 1 piring, teh manis", byDoctor: false },
        { kindLabel: "Olahraga", text: "Jalan pagi 20 menit", byDoctor: true },
      ],
    });
  });

  it("teks Salin ke S: judul, lalu satu catatan per baris terurut per jam", () => {
    expect(foodRecallHeader("2026-10-02")).toBe("Food recall H-1 (Jumat, 2 Okt)");
    expect(foodRecallSubjectiveText("2026-10-02", ENTRIES)).toBe(
      [
        "Food recall H-1 (Jumat, 2 Okt):",
        "07.00 Makan/minum — Nasi kuning 1 piring, teh manis",
        "07.00 Olahraga — Jalan pagi 20 menit",
        "12.00 Kapsul/obat — Kapsul M",
      ].join("\n"),
    );
  });

  it("menambahkan di akhir S dengan satu baris kosong pemisah", () => {
    expect(appendToSubjective("", "Food recall")).toBe("Food recall");
    expect(appendToSubjective("  ", "Food recall")).toBe("Food recall");
    expect(appendToSubjective("Keluhan BB naik\n", "Food recall")).toBe("Keluhan BB naik\n\nFood recall");
  });
});

describe("penawaran dan status link", () => {
  it("otomatis untuk Slimming, gizi klinik, atau paket aktif", () => {
    expect(shouldOfferFoodRecall({ intakePurpose: "SLIMMING", hasActivePackage: false })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: "GIZI_KLINIK", hasActivePackage: false })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: null, hasActivePackage: true })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: "AESTHETIC", hasActivePackage: false })).toBe(false);
    expect(shouldOfferFoodRecall({ intakePurpose: null, hasActivePackage: false })).toBe(false);
  });

  const startAt = combineWitaDateAndMinutes("2026-10-03", 11 * 60);
  const sameDay = combineWitaDateAndMinutes("2026-10-03", 16 * 60);
  const nextDay = combineWitaDateAndMinutes("2026-10-04", 9 * 60);
  const open = { appointmentStatus: "HADIR", startAt, encounterStatus: null, completedAt: null } as const;

  it("berlaku pada tanggal booking selama booking Hadir", () => {
    expect(foodRecallLinkState(open, sameDay)).toBe("OPEN");
    expect(foodRecallLinkState({ ...open, encounterStatus: "DRAF" }, sameDay)).toBe("OPEN");
  });

  it("tidak berlaku di hari lain atau bila booking bukan Hadir", () => {
    expect(foodRecallLinkState(open, nextDay)).toBe("CLOSED");
    expect(foodRecallLinkState({ ...open, appointmentStatus: "DIBATALKAN" }, sameDay)).toBe("CLOSED");
    expect(foodRecallLinkState({ ...open, appointmentStatus: "TIDAK_HADIR" }, sameDay)).toBe("CLOSED");
  });

  it("sudah diterima dokter bila catatan final atau dokter sudah melengkapi", () => {
    expect(foodRecallLinkState({ ...open, appointmentStatus: "SELESAI", encounterStatus: "FINAL" }, sameDay)).toBe("RECEIVED");
    expect(foodRecallLinkState({ ...open, completedAt: sameDay }, sameDay)).toBe("RECEIVED");
  });

  it("pesan WA memakai nama depan dan tanpa kata pasien", () => {
    const text = foodRecallMessageText({ patientName: "Siti Rahayu", link: "https://sundyclinic.com/food-recall#x" });
    expect(text).toContain("Halo Siti, ini SunDY Clinic.");
    expect(text).toContain("https://sundyclinic.com/food-recall#x");
    expect(text).not.toMatch(/pasien|berobat/i);
  });
});
