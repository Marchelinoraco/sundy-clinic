import { addMonths, currentMonthOf, monthsBetween } from "./expense";
import { dateLabel, isDateString, type Validation } from "./stock";
import { addDaysToDateString, combineWitaDateAndMinutes } from "./time";

// Aturan murni laporan untung-rugi (spec laporan 3, 8). Dipakai server dan browser; tanpa akses basis data.

export const MAX_REPORT_DAYS = 366;

export type ReportPeriod = { from: string; to: string };
export type ReportPreset = "BULAN_INI" | "BULAN_LALU" | "TAHUN_INI" | "RENTANG";
export const REPORT_PRESET_LABEL: Record<ReportPreset, string> = {
  BULAN_INI: "Bulan ini",
  BULAN_LALU: "Bulan lalu",
  TAHUN_INI: "Tahun ini",
  RENTANG: "Rentang bebas",
};
export const REPORT_PRESETS = Object.keys(REPORT_PRESET_LABEL) as ReportPreset[];

export function isReportPreset(value: unknown): value is ReportPreset {
  return typeof value === "string" && (REPORT_PRESETS as string[]).includes(value);
}

const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const DAY_MS = 24 * 3600_000;

// ---- Periode ---------------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Satu bulan kalender penuh ("YYYY-MM"). */
export function monthPeriod(month: string): ReportPeriod {
  const [year, mon] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(year, mon)).padStart(2, "0")}` };
}

export function presetPeriod(preset: Exclude<ReportPreset, "RENTANG">, today: string): ReportPeriod {
  const month = currentMonthOf(today);
  if (preset === "BULAN_INI") return monthPeriod(month);
  if (preset === "BULAN_LALU") return monthPeriod(addMonths(month, -1));
  const year = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Jumlah hari, inklusif. */
export function periodDays(period: ReportPeriod): number {
  return Math.round((Date.parse(period.to) - Date.parse(period.from)) / DAY_MS) + 1;
}

export function validatePeriod(raw: unknown): Validation<ReportPeriod> {
  if (typeof raw !== "object" || raw === null) return fail("Isi tanggal dari dan sampai.");
  const { from, to } = raw as Record<string, unknown>;
  if (!isDateString(from) || !isDateString(to)) return fail("Isi tanggal dari dan sampai.");
  if (from > to) return fail("Tanggal dari tidak boleh setelah tanggal sampai.");
  if (periodDays({ from, to }) > MAX_REPORT_DAYS) return fail(`Rentang laporan paling lama ${MAX_REPORT_DAYS} hari.`);
  return { ok: true, value: { from, to } };
}

function isFullMonth(period: ReportPeriod): boolean {
  return period.from.endsWith("-01") && monthPeriod(period.from.slice(0, 7)).to === period.to;
}

function isFullYear(period: ReportPeriod): boolean {
  const year = period.from.slice(0, 4);
  return period.from === `${year}-01-01` && period.to === `${year}-12-31`;
}

/** Periode pembanding (spec laporan 3.4): bulan penuh → bulan sebelumnya, tahun penuh → tahun sebelumnya, lainnya sepanjang sama. */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  if (isFullMonth(period)) return monthPeriod(addMonths(period.from.slice(0, 7), -1));
  if (isFullYear(period)) {
    const year = Number(period.from.slice(0, 4)) - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  const days = periodDays(period);
  const to = addDaysToDateString(period.from, -1);
  return { from: addDaysToDateString(to, -(days - 1)), to };
}

/** Batas instant periode di WITA; `end` eksklusif. */
export function periodInstants(period: ReportPeriod): { start: Date; end: Date } {
  return {
    start: combineWitaDateAndMinutes(period.from, 0),
    end: combineWitaDateAndMinutes(addDaysToDateString(period.to, 1), 0),
  };
}

/** Bulan-bulan tren, naik, berakhir di bulan berjalan. */
export function trendMonths(today: string, count = 12): string[] {
  const current = currentMonthOf(today);
  return monthsBetween(addMonths(current, -(count - 1)), current);
}

export function periodLabel(period: ReportPeriod): string {
  return period.from === period.to ? dateLabel(period.from) : `${dateLabel(period.from)} – ${dateLabel(period.to)}`;
}

// ---- Angka ------------------------------------------------------------------------------------

/** Angka mentah satu periode, dikumpulkan server dari basis data. */
export type RawReport = {
  service: number;
  treatment: number;
  goods: number;
  discount: number;
  upfrontFee: number;
  upfrontOnline: number;
  cogs: number;
  outstanding: number;
  invoiceCount: number;
  expenses: { categoryId: string; name: string; isActive: boolean; amount: number }[];
  customerPaid: number;
  supplierPaid: number;
  supplierRefunded: number;
};

export type ReportTotals = {
  service: number;
  treatment: number;
  goods: number;
  discount: number;
  upfront: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  outstanding: number;
};

export type CashFlow = {
  customer: number;
  upfront: number;
  inflow: number;
  supplier: number;
  expenses: number;
  outflow: number;
  net: number;
};

export type ReportView = {
  totals: ReportTotals;
  expensesByCategory: RawReport["expenses"];
  cash: CashFlow;
  invoiceCount: number;
  upfrontFee: number;
  upfrontOnline: number;
};

/** Rumus spec laporan 3.1–3.3. Pembayaran hutang supplier hanya masuk arus kas, tidak mengurangi laba. */
export function summarizeReport(raw: RawReport): ReportView {
  const upfront = raw.upfrontFee + raw.upfrontOnline;
  const revenue = raw.service + raw.treatment + raw.goods - raw.discount + upfront;
  const expenses = raw.expenses.reduce((sum, row) => sum + row.amount, 0);
  const grossProfit = revenue - raw.cogs;
  const supplier = raw.supplierPaid - raw.supplierRefunded;
  const inflow = raw.customerPaid + upfront;
  const outflow = supplier + expenses;
  return {
    totals: {
      service: raw.service,
      treatment: raw.treatment,
      goods: raw.goods,
      discount: raw.discount,
      upfront,
      revenue,
      cogs: raw.cogs,
      grossProfit,
      expenses,
      netProfit: grossProfit - expenses,
      outstanding: raw.outstanding,
    },
    expensesByCategory: raw.expenses,
    cash: { customer: raw.customerPaid, upfront, inflow, supplier, expenses, outflow, net: inflow - outflow },
    invoiceCount: raw.invoiceCount,
    upfrontFee: raw.upfrontFee,
    upfrontOnline: raw.upfrontOnline,
  };
}

export function profitLabel(netProfit: number): "Laba" | "Rugi" {
  return netProfit < 0 ? "Rugi" : "Laba";
}

export type Delta = { amount: number; percent: number | null };

/** Selisih dan persen perubahan (satu desimal); persen kosong bila pembanding 0. */
export function delta(current: number, previous: number): Delta {
  const amount = current - previous;
  if (previous === 0) return { amount, percent: null };
  return { amount, percent: Math.round((amount / Math.abs(previous)) * 1000) / 10 };
}

export type Comparison = Record<"revenue" | "cogs" | "grossProfit" | "expenses" | "netProfit", Delta>;

export function compareReports(current: ReportTotals, previous: ReportTotals): Comparison {
  return {
    revenue: delta(current.revenue, previous.revenue),
    cogs: delta(current.cogs, previous.cogs),
    grossProfit: delta(current.grossProfit, previous.grossProfit),
    expenses: delta(current.expenses, previous.expenses),
    netProfit: delta(current.netProfit, previous.netProfit),
  };
}

export type TrendPoint = { month: string; revenue: number; cost: number; netProfit: number };

/** Satu titik tren: biaya = harga pokok + pengeluaran. */
export function trendPoint(month: string, view: ReportView): TrendPoint {
  return { month, revenue: view.totals.revenue, cost: view.totals.cogs + view.totals.expenses, netProfit: view.totals.netProfit };
}

// ---- CSV (spec laporan 8) ----------------------------------------------------------------------

/** Sel CSV: teks yang diawali karakter rumus diberi awalan `'`; sel berisi koma, kutip, atau baris baru dikutip. */
export function csvCell(value: string | number): string {
  let text = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && /^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** UTF-8 dengan BOM, pemisah koma, akhir baris CRLF. */
export function toCsv(rows: (string | number)[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function reportCsvRows(meta: { period: ReportPeriod; branchName: string }, view: ReportView): (string | number)[][] {
  const { totals, cash } = view;
  return [
    ["Laporan untung-rugi"],
    ["Periode", meta.period.from, meta.period.to],
    ["Cabang", meta.branchName],
    [],
    ["Ringkasan", "Jumlah (Rp)"],
    ["Layanan", totals.service],
    ["Treatment", totals.treatment],
    ["Obat dan produk", totals.goods],
    ["Diskon", -totals.discount],
    ["Biaya booking (di muka)", view.upfrontFee],
    ["Konsultasi Online (di muka)", view.upfrontOnline],
    ["Total pendapatan", totals.revenue],
    ["Harga pokok", totals.cogs],
    ["Laba kotor", totals.grossProfit],
    ["Pengeluaran", totals.expenses],
    [profitLabel(totals.netProfit) === "Rugi" ? "Rugi bersih" : "Laba bersih", totals.netProfit],
    ["Belum tertagih (informasi)", totals.outstanding],
    [],
    ["Pengeluaran per kategori", "Jumlah (Rp)"],
    ...view.expensesByCategory.map((row) => [row.name, row.amount]),
    [],
    ["Arus kas", "Jumlah (Rp)"],
    ["Pembayaran customer", cash.customer],
    ["Pendapatan di muka", cash.upfront],
    ["Total masuk", cash.inflow],
    ["Pembayaran hutang supplier (neto)", cash.supplier],
    ["Pengeluaran", cash.expenses],
    ["Total keluar", cash.outflow],
    ["Kas bersih", cash.net],
  ];
}
