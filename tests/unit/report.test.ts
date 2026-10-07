import { describe, expect, it } from "vitest";
import {
  compareReports,
  csvCell,
  delta,
  monthPeriod,
  periodDays,
  periodInstants,
  presetPeriod,
  previousPeriod,
  profitLabel,
  reportCsvRows,
  summarizeReport,
  toCsv,
  trendMonths,
  trendPoint,
  validatePeriod,
  type RawReport,
} from "@/lib/report";

describe("periode", () => {
  it("preset: bulan ini, bulan lalu, tahun ini; Februari kabisat", () => {
    expect(presetPeriod("BULAN_INI", "2026-10-07")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetPeriod("BULAN_LALU", "2026-10-07")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetPeriod("BULAN_LALU", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetPeriod("TAHUN_INI", "2026-10-07")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(monthPeriod("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthPeriod("2027-02").to).toBe("2027-02-28");
  });

  it("jumlah hari inklusif", () => {
    expect(periodDays({ from: "2026-10-01", to: "2026-10-01" })).toBe(1);
    expect(periodDays({ from: "2026-10-01", to: "2026-10-31" })).toBe(31);
    expect(periodDays({ from: "2026-01-01", to: "2026-12-31" })).toBe(365);
  });

  it("validasi rentang: tanggal sah, tidak terbalik, paling lama 366 hari", () => {
    expect(validatePeriod({ from: "2026-10-01", to: "2026-10-07" })).toEqual({ ok: true, value: { from: "2026-10-01", to: "2026-10-07" } });
    expect(validatePeriod({ from: "2026-01-01", to: "2027-01-01" }).ok).toBe(true); // 366 hari
    expect(validatePeriod({ from: "2026-01-01", to: "2027-01-02" })).toEqual({ ok: false, message: "Rentang laporan paling lama 366 hari." });
    expect(validatePeriod({ from: "2026-10-08", to: "2026-10-07" })).toEqual({
      ok: false,
      message: "Tanggal dari tidak boleh setelah tanggal sampai.",
    });
    expect(validatePeriod({ from: "9999-12-01", to: "9999-12-31" })).toEqual({ ok: false, message: "Tanggal laporan tidak sah." });
    expect(validatePeriod({ from: "1999-12-01", to: "2000-01-31" })).toEqual({ ok: false, message: "Tanggal laporan tidak sah." });
    expect(validatePeriod({ from: "2100-01-01", to: "2100-01-31" }).ok).toBe(true);
    for (const raw of [{ from: "2026-02-31", to: "2026-03-01" }, { from: "", to: "2026-03-01" }, { from: "2026-03-01" }, null, "x"]) {
      expect(validatePeriod(raw)).toEqual({ ok: false, message: "Isi tanggal dari dan sampai." });
    }
  });

  it("periode sebelumnya: bulan penuh → bulan sebelumnya; tahun penuh → tahun sebelumnya; lainnya sepanjang sama", () => {
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-31" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousPeriod({ from: "2026-01-01", to: "2026-01-31" })).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousPeriod({ from: "2028-01-01", to: "2028-12-31" })).toEqual({ from: "2027-01-01", to: "2027-12-31" });
    expect(previousPeriod({ from: "2026-10-05", to: "2026-10-11" })).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(previousPeriod({ from: "2026-10-10", to: "2026-10-10" })).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-15" })).toEqual({ from: "2026-09-16", to: "2026-09-30" });
  });

  it("batas waktu WITA: dari pukul 00.00 WITA sampai (eksklusif) 00.00 WITA hari berikutnya", () => {
    const { start, end } = periodInstants({ from: "2035-01-01", to: "2035-01-31" });
    expect(start.toISOString()).toBe("2034-12-31T16:00:00.000Z");
    expect(end.toISOString()).toBe("2035-01-31T16:00:00.000Z");
    // 23.59 WITA tanggal terakhir masih di dalam; 00.00 WITA hari berikutnya di luar.
    expect(new Date("2035-01-31T15:59:00Z") < end).toBe(true);
    expect(new Date("2035-01-31T16:00:00Z") < end).toBe(false);
  });

  it("tren: 12 bulan berakhir di bulan berjalan", () => {
    const months = trendMonths("2026-10-07");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-11");
    expect(months[11]).toBe("2026-10");
    expect(trendMonths("2026-02-01", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

const RAW: RawReport = {
  service: 1_000_000,
  treatment: 500_000,
  goods: 300_000,
  discount: 100_000,
  upfrontFee: 200_000,
  upfrontOnline: 250_000,
  cogs: 120_000,
  outstanding: 50_000,
  invoiceCount: 12,
  expenses: [
    { categoryId: "k1", name: "Sewa", isActive: true, amount: 400_000 },
    { categoryId: "k2", name: "Gaji", isActive: true, amount: 600_000 },
  ],
  customerPaid: 1_500_000,
  supplierPaid: 300_000,
  supplierRefunded: 50_000,
};

describe("rumus laporan", () => {
  it("pendapatan, laba kotor, dan laba bersih", () => {
    const { totals } = summarizeReport(RAW);
    expect(totals).toMatchObject({
      service: 1_000_000,
      treatment: 500_000,
      goods: 300_000,
      discount: 100_000,
      upfront: 450_000,
      revenue: 2_150_000, // 1.000.000 + 500.000 + 300.000 − 100.000 + 450.000
      cogs: 120_000,
      grossProfit: 2_030_000,
      expenses: 1_000_000,
      netProfit: 1_030_000,
      outstanding: 50_000,
    });
  });

  it("pembayaran hutang supplier tidak mengurangi laba, hanya masuk arus kas", () => {
    const base = summarizeReport(RAW).totals.netProfit;
    expect(summarizeReport({ ...RAW, supplierPaid: 9_000_000 }).totals.netProfit).toBe(base);
    expect(summarizeReport({ ...RAW, customerPaid: 0 }).totals.netProfit).toBe(base);
  });

  it("arus kas: masuk = pembayaran customer + di muka; keluar = hutang neto + pengeluaran", () => {
    expect(summarizeReport(RAW).cash).toEqual({
      customer: 1_500_000,
      upfront: 450_000,
      inflow: 1_950_000,
      supplier: 250_000,
      expenses: 1_000_000,
      outflow: 1_250_000,
      net: 700_000,
    });
  });

  it("rugi: pengeluaran tanpa pendapatan; label Rugi bila negatif dan Laba bila nol atau positif", () => {
    const empty: RawReport = { ...RAW, service: 0, treatment: 0, goods: 0, discount: 0, upfrontFee: 0, upfrontOnline: 0, cogs: 0, outstanding: 0, invoiceCount: 0, customerPaid: 0, supplierPaid: 0, supplierRefunded: 0 };
    const view = summarizeReport(empty);
    expect(view.totals.netProfit).toBe(-1_000_000);
    expect(profitLabel(view.totals.netProfit)).toBe("Rugi");
    expect(profitLabel(0)).toBe("Laba");
    expect(profitLabel(5)).toBe("Laba");
    expect(summarizeReport({ ...empty, expenses: [] }).totals.netProfit).toBe(0);
  });

  it("perbandingan: selisih dan persen satu desimal; pembanding 0 tanpa persen", () => {
    expect(delta(110, 100)).toEqual({ amount: 10, percent: 10 });
    expect(delta(0, 100)).toEqual({ amount: -100, percent: -100 });
    expect(delta(5, 0)).toEqual({ amount: 5, percent: null });
    expect(delta(0, 0)).toEqual({ amount: 0, percent: null });
    expect(delta(-50, -100)).toEqual({ amount: 50, percent: 50 });
    expect(delta(1, 3)).toEqual({ amount: -2, percent: -66.7 });
  });

  it("compareReports membandingkan lima angka utama", () => {
    const current = summarizeReport(RAW).totals;
    const previous = summarizeReport({ ...RAW, service: 500_000 }).totals;
    const comparison = compareReports(current, previous);
    expect(comparison.revenue).toEqual({ amount: 500_000, percent: 30.3 });
    expect(comparison.expenses).toEqual({ amount: 0, percent: 0 });
    expect(Object.keys(comparison).sort()).toEqual(["cogs", "expenses", "grossProfit", "netProfit", "revenue"]);
  });

  it("titik tren: biaya = harga pokok + pengeluaran", () => {
    expect(trendPoint("2026-10", summarizeReport(RAW))).toEqual({ month: "2026-10", revenue: 2_150_000, cost: 1_120_000, netProfit: 1_030_000 });
  });
});

describe("CSV", () => {
  it("sel biasa tidak diubah; koma, kutip, dan baris baru dikutip", () => {
    expect(csvCell("Sewa")).toBe("Sewa");
    expect(csvCell(1500)).toBe("1500");
    expect(csvCell(-200)).toBe("-200");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('dia "bos"')).toBe('"dia ""bos"""');
    expect(csvCell("baris1\nbaris2")).toBe('"baris1\nbaris2"');
  });

  it("sel teks yang diawali karakter rumus dinetralkan", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+62812")).toBe("'+62812");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
    expect(csvCell("tidak =rumus")).toBe("tidak =rumus");
  });

  it("toCsv: BOM, pemisah koma, akhir baris CRLF", () => {
    const csv = toCsv([["a", 1], ["b,c", 2]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿a,1\r\n"b,c",2\r\n');
  });

  it("baris laporan: ringkasan, kategori, dan arus kas; diskon negatif; kategori berbahaya dinetralkan", () => {
    const view = summarizeReport({ ...RAW, expenses: [{ categoryId: "x", name: "=HACK()", isActive: true, amount: 1000 }] });
    const rows = reportCsvRows({ period: { from: "2026-10-01", to: "2026-10-31" }, branchName: "Semua cabang" }, view);
    const flat = toCsv(rows);
    expect(rows[0]).toEqual(["Laporan untung-rugi"]);
    expect(rows).toContainEqual(["Periode", "2026-10-01", "2026-10-31"]);
    expect(rows).toContainEqual(["Cabang", "Semua cabang"]);
    expect(rows).toContainEqual(["Diskon", -100_000]);
    expect(rows).toContainEqual(["Total pendapatan", 2_150_000]);
    expect(rows).toContainEqual(["Harga pokok", 120_000]);
    expect(rows).toContainEqual(["Laba kotor", 2_030_000]);
    expect(rows).toContainEqual(["Kas bersih", 1_950_000 - 250_000 - 1000]);
    expect(flat).toContain("'=HACK()");
    expect(flat).not.toMatch(/(^|,|\r\n)=HACK/);
  });
});
