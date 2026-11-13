import { describe, expect, it } from "vitest";
import {
  defaultNextVisit,
  LEGACY_BOUGHT_MIN,
  usedFromVisits,
  validateLegacyPackage,
  validateReason,
  validateRemainingCorrection,
} from "@/lib/legacy-package";

// Aturan murni paket lama dari Kluto (spec paket lama PL5, PL11, PL13; rencana Task 2).
const TODAY = "2026-11-11";
const ITEMS = [{ id: "a", name: "Facial", sessions: 4 }];
const valid = { packageId: "p1", boughtOn: "2025-03-01", priorVisits: 3, used: { a: 3 }, nextVisitOn: null, note: " Nota 9 ", confirmDuplicate: false };
const check = (patch: Record<string, unknown>) => validateLegacyPackage({ ...valid, ...patch }, { today: TODAY, items: ITEMS });
const INVALID = { ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." };

describe("usedFromVisits", () => {
  const items = [
    { sessions: 4, perVisit: null },
    { sessions: 28, perVisit: 7 },
  ];
  it("treatment 1 sesi per kunjungan, barang sebanyak jumlah per kunjungan", () => {
    expect(usedFromVisits(items, 3)).toEqual([3, 21]);
  });
  it("tidak melebihi jatah", () => {
    expect(usedFromVisits(items, 10)).toEqual([4, 28]);
  });
  it("nol kunjungan berarti belum ada yang dipakai", () => {
    expect(usedFromVisits(items, 0)).toEqual([0, 0]);
  });
  it("barang tanpa jumlah per kunjungan dihitung 1 per kunjungan", () => {
    expect(usedFromVisits([{ sessions: 30, perVisit: null }], 5)).toEqual([5]);
  });
});

describe("validateLegacyPackage", () => {
  it("menerima isian sah, merapikan catatan, rencana boleh kosong", () => {
    expect(check({})).toEqual({ ok: true, value: { boughtOn: "2025-03-01", priorVisits: 3, used: [{ itemId: "a", used: 3 }], nextVisitOn: null, note: "Nota 9" } });
    expect(check({ note: "  " })).toMatchObject({ ok: true, value: { note: null } });
    expect(check({ nextVisitOn: TODAY })).toMatchObject({ ok: true, value: { nextVisitOn: TODAY } });
  });

  it("paket wajib dipilih", () => {
    expect(check({ packageId: "" })).toEqual({ ok: false, message: "Pilih paket." });
  });

  it("tanggal beli: wajib, sah, tidak sebelum batas bawah, tidak di masa depan", () => {
    expect(check({ boughtOn: "" })).toEqual({ ok: false, message: "Isi tanggal beli di Kluto." });
    expect(check({ boughtOn: "2026-02-30" })).toEqual({ ok: false, message: "Tanggal beli tidak sah." });
    expect(check({ boughtOn: "1999-12-31" })).toEqual({ ok: false, message: "Tanggal beli tidak sah." });
    expect(check({ boughtOn: LEGACY_BOUGHT_MIN })).toMatchObject({ ok: true });
    expect(check({ boughtOn: "2026-11-12" })).toEqual({ ok: false, message: "Tanggal beli tidak boleh di masa depan." });
    expect(check({ boughtOn: TODAY })).toMatchObject({ ok: true });
  });

  it("jumlah kunjungan di Kluto 0..1000", () => {
    expect(check({ priorVisits: -1 })).toEqual({ ok: false, message: "Jumlah kunjungan di Kluto 0–1000." });
    expect(check({ priorVisits: 1001 })).toEqual({ ok: false, message: "Jumlah kunjungan di Kluto 0–1000." });
    expect(check({ priorVisits: 1.5 })).toEqual({ ok: false, message: "Jumlah kunjungan di Kluto 0–1000." });
  });

  it("sudah dipakai per isi: 0..jatah, kunci harus sama persis dengan isi katalog", () => {
    expect(check({ used: { a: 5 } })).toEqual({ ok: false, message: "Sudah dipakai Facial 0–4." });
    expect(check({ used: { a: -1 } })).toEqual({ ok: false, message: "Sudah dipakai Facial 0–4." });
    expect(check({ used: {} })).toEqual(INVALID);
    expect(check({ used: { a: 1, b: 1 } })).toEqual(INVALID);
    expect(check({ used: null })).toEqual(INVALID);
  });

  it("menolak paket yang semua isinya sudah terpakai (Review Focus 2)", () => {
    expect(check({ used: { a: 4 } })).toEqual({ ok: false, message: "Semua sesi paket ini sudah terpakai di Kluto, jadi tidak perlu dimasukkan." });
  });

  it("kunjungan berikutnya tidak boleh sebelum hari ini", () => {
    expect(check({ nextVisitOn: "2026-11-10" })).toEqual({ ok: false, message: "Kunjungan berikutnya tidak boleh sebelum hari ini." });
    expect(check({ nextVisitOn: "bukan tanggal" })).toEqual(INVALID);
  });

  it("catatan paling banyak 200 karakter", () => {
    expect(check({ note: "x".repeat(201) })).toEqual({ ok: false, message: "Catatan paling banyak 200 karakter." });
    expect(check({ note: "x".repeat(200) })).toMatchObject({ ok: true });
  });
});

describe("defaultNextVisit", () => {
  it("hari ini + jarak kunjungan katalog", () => {
    expect(defaultNextVisit(TODAY, 7)).toBe("2026-11-18");
  });
});

describe("validateReason", () => {
  it("wajib, dirapikan, paling banyak 200 karakter", () => {
    expect(validateReason(" salah pasien ", "Isi alasan pembatalan.")).toEqual({ ok: true, value: "salah pasien" });
    expect(validateReason("", "Isi alasan pembatalan.")).toEqual({ ok: false, message: "Isi alasan pembatalan." });
    expect(validateReason("x".repeat(201), "Isi alasan pembatalan.")).toEqual({ ok: false, message: "Alasan paling banyak 200 karakter." });
    expect(validateReason(5, "Isi alasan pembatalan.")).toEqual(INVALID);
  });
});

describe("validateRemainingCorrection", () => {
  const ctx = { items: [{ id: "a", name: "Facial", remaining: 2, max: 3 }] };
  it("mengembalikan isi yang berubah saja", () => {
    expect(validateRemainingCorrection({ reason: " salah ketik ", remaining: { a: 3 } }, ctx)).toEqual({
      ok: true,
      value: { reason: "salah ketik", changes: [{ itemId: "a", name: "Facial", from: 2, to: 3 }] },
    });
  });
  it("sisa baru 0..batas", () => {
    expect(validateRemainingCorrection({ reason: "x", remaining: { a: 4 } }, ctx)).toEqual({ ok: false, message: "Sisa Facial 0–3." });
    expect(validateRemainingCorrection({ reason: "x", remaining: { a: -1 } }, ctx)).toEqual({ ok: false, message: "Sisa Facial 0–3." });
  });
  it("harus ada yang berubah, dan alasan wajib", () => {
    expect(validateRemainingCorrection({ reason: "x", remaining: { a: 2 } }, ctx)).toEqual({ ok: false, message: "Tidak ada sisa yang berubah." });
    expect(validateRemainingCorrection({ reason: "", remaining: { a: 1 } }, ctx)).toEqual({ ok: false, message: "Isi alasan koreksi." });
  });
  it("kunci harus sama persis dengan isi paket", () => {
    expect(validateRemainingCorrection({ reason: "x", remaining: { b: 1 } }, ctx)).toEqual(INVALID);
  });
});
