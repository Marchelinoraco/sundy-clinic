import { describe, expect, it } from "vitest";
import {
  addMonths,
  currentMonthOf,
  dueMonths,
  isMonthString,
  monthsBetween,
  recurringDate,
  validateCategoryName,
  validateExpense,
  validateRecurring,
  validateRecurringUpdate,
} from "@/lib/expense";

describe("bulan", () => {
  it("mengenali dan menggeser bulan, melewati batas tahun", () => {
    expect(isMonthString("2026-10")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "2026-1", "26-10", "2026-10-01", 202610, null]) expect(isMonthString(bad)).toBe(false);
    expect(currentMonthOf("2026-10-07")).toBe("2026-10");
    expect(addMonths("2026-10", 1)).toBe("2026-11");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", -24)).toBe("2024-10");
  });

  it("daftar bulan inklusif; kosong bila terbalik", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-10", "2026-10")).toEqual(["2026-10"]);
    expect(monthsBetween("2026-11", "2026-10")).toEqual([]);
  });

  it("bulan jatuh tempo templat: dari mulai sampai bulan berjalan atau berakhir yang lebih awal", () => {
    expect(dueMonths({ startMonth: "2026-08", endMonth: null }, "2026-10")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(dueMonths({ startMonth: "2026-08", endMonth: "2026-09" }, "2026-10")).toEqual(["2026-08", "2026-09"]);
    expect(dueMonths({ startMonth: "2026-08", endMonth: "2027-03" }, "2026-10")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(dueMonths({ startMonth: "2026-12", endMonth: null }, "2026-10")).toEqual([]);
  });

  it("tanggal catatan berulang", () => {
    expect(recurringDate("2026-10", 5)).toBe("2026-10-05");
    expect(recurringDate("2026-02", 28)).toBe("2026-02-28");
  });
});

describe("validateExpense", () => {
  const ctx = { today: "2026-10-07" };
  const ok = { date: "2026-10-01", categoryId: "kat1", amount: 500000, note: "Sewa Oktober", branchId: "b1" };

  it("menerima isian yang sah; keterangan dan cabang kosong menjadi null", () => {
    expect(validateExpense(ok, ctx)).toEqual({ ok: true, value: ok });
    expect(validateExpense({ ...ok, note: "   ", branchId: "" }, ctx)).toEqual({ ok: true, value: { ...ok, note: null, branchId: null } });
    expect(validateExpense({ ...ok, note: undefined, branchId: null }, ctx)).toMatchObject({ ok: true, value: { note: null, branchId: null } });
    expect(validateExpense({ ...ok, date: "2026-10-07" }, ctx).ok).toBe(true);
  });

  it("menolak tanggal tidak ada atau di masa depan", () => {
    expect(validateExpense({ ...ok, date: "2026-10-08" }, ctx)).toEqual({ ok: false, message: "Tanggal pengeluaran tidak boleh di masa depan." });
    for (const date of ["2026-02-31", "kemarin", "", null]) {
      expect(validateExpense({ ...ok, date }, ctx)).toEqual({ ok: false, message: "Isi tanggal pengeluaran." });
    }
  });

  it("menolak nominal pecahan, nol, negatif, terlalu besar, atau bukan angka", () => {
    for (const amount of [0, -1, 1.5, Number.NaN, "100", null, 2_000_000_001]) {
      expect(validateExpense({ ...ok, amount }, ctx)).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
    }
    expect(validateExpense({ ...ok, amount: 2_000_000_000 }, ctx).ok).toBe(true);
  });

  it("menolak kategori kosong, keterangan terlalu panjang, dan masukan buatan", () => {
    expect(validateExpense({ ...ok, categoryId: "" }, ctx)).toEqual({ ok: false, message: "Pilih kategori." });
    expect(validateExpense({ ...ok, note: "x".repeat(301) }, ctx)).toEqual({ ok: false, message: "Keterangan paling banyak 300 karakter." });
    expect(validateExpense({ ...ok, note: "x".repeat(300) }, ctx).ok).toBe(true);
    expect(validateExpense(null, ctx)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
    expect(validateExpense({ ...ok, note: 5 }, ctx)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("validateCategoryName", () => {
  it("memangkas, menolak kosong dan terlalu panjang", () => {
    expect(validateCategoryName("  Servis AC ")).toEqual({ ok: true, value: "Servis AC" });
    expect(validateCategoryName("   ")).toEqual({ ok: false, message: "Isi nama kategori." });
    expect(validateCategoryName(undefined)).toEqual({ ok: false, message: "Isi nama kategori." });
    expect(validateCategoryName("x".repeat(61))).toEqual({ ok: false, message: "Nama kategori paling banyak 60 karakter." });
    expect(validateCategoryName(5)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("validateRecurring", () => {
  const ctx = { currentMonth: "2026-10" };
  const ok = { categoryId: "kat1", amount: 1000000, note: "Gaji", branchId: null, dayOfMonth: 25, startMonth: "2026-10", endMonth: null };

  it("menerima templat yang sah", () => {
    expect(validateRecurring(ok, ctx)).toEqual({ ok: true, value: ok });
    expect(validateRecurring({ ...ok, startMonth: "2024-10", endMonth: "2026-12" }, ctx).ok).toBe(true);
    expect(validateRecurring({ ...ok, startMonth: "2027-10" }, ctx).ok).toBe(true);
  });

  it("tanggal tiap bulan 1 sampai 28", () => {
    for (const dayOfMonth of [0, 29, 31, 1.5, "5", null]) {
      expect(validateRecurring({ ...ok, dayOfMonth }, ctx)).toEqual({ ok: false, message: "Tanggal tiap bulan harus 1 sampai 28." });
    }
    expect(validateRecurring({ ...ok, dayOfMonth: 1 }, ctx).ok).toBe(true);
    expect(validateRecurring({ ...ok, dayOfMonth: 28 }, ctx).ok).toBe(true);
  });

  it("bulan mulai: sah, paling jauh 24 bulan ke belakang dan 12 bulan ke depan", () => {
    expect(validateRecurring({ ...ok, startMonth: "oktober" }, ctx)).toEqual({ ok: false, message: "Isi bulan mulai." });
    expect(validateRecurring({ ...ok, startMonth: "2024-09" }, ctx)).toEqual({ ok: false, message: "Bulan mulai paling jauh 24 bulan ke belakang." });
    expect(validateRecurring({ ...ok, startMonth: "2027-11" }, ctx)).toEqual({ ok: false, message: "Bulan mulai paling jauh 12 bulan ke depan." });
  });

  it("bulan berakhir tidak boleh lebih awal dari mulai", () => {
    expect(validateRecurring({ ...ok, endMonth: "2026-09" }, ctx)).toEqual({
      ok: false,
      message: "Bulan berakhir tidak boleh lebih awal dari bulan mulai.",
    });
    expect(validateRecurring({ ...ok, endMonth: "x" }, ctx)).toEqual({ ok: false, message: "Bulan berakhir tidak sah." });
    expect(validateRecurring({ ...ok, endMonth: "2026-10" }, ctx).ok).toBe(true);
  });

  it("nominal harus bilangan bulat positif", () => {
    expect(validateRecurring({ ...ok, amount: 0 }, ctx)).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
  });
});

describe("validateRecurringUpdate", () => {
  it("memeriksa nominal, tanggal, dan bulan berakhir terhadap bulan mulai templat", () => {
    const ok = { amount: 1200000, note: "Gaji naik", dayOfMonth: 26, endMonth: null };
    expect(validateRecurringUpdate(ok, { startMonth: "2026-10" })).toEqual({ ok: true, value: ok });
    expect(validateRecurringUpdate({ ...ok, endMonth: "2026-09" }, { startMonth: "2026-10" })).toEqual({
      ok: false,
      message: "Bulan berakhir tidak boleh lebih awal dari bulan mulai.",
    });
    expect(validateRecurringUpdate({ ...ok, dayOfMonth: 30 }, { startMonth: "2026-10" })).toEqual({
      ok: false,
      message: "Tanggal tiap bulan harus 1 sampai 28.",
    });
  });
});
