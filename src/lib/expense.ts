import { isDateString, MAX_AMOUNT, type Validation } from "./stock";

// Aturan murni pengeluaran (spec laporan 4, 5, 9). Dipakai server dan browser; tanpa akses basis data.

export const EXPENSE_NOTE_MAX = 300;
export const CATEGORY_NAME_MAX = 60;
export const RECURRING_BACK_MONTHS = 24;
export const RECURRING_AHEAD_MONTHS = 12;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const AMOUNT_MESSAGE = "Nominal harus bilangan bulat lebih dari 0.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
/** Teks dipangkas; kosong/null/undefined → "", bukan teks → null. */
function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : null;
}

// ---- Bulan ("YYYY-MM") --------------------------------------------------------------------

export function isMonthString(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

export function currentMonthOf(today: string): string {
  return today.slice(0, 7);
}

export function addMonths(month: string, count: number): string {
  const [year, mon] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Bulan dari `from` sampai `to`, inklusif dan naik; kosong bila `from` lebih akhir dari `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) months.push(month);
  return months;
}

/** Bulan yang harus sudah punya catatan: dari bulan mulai sampai bulan berjalan (atau bulan berakhir bila lebih awal). */
export function dueMonths(template: { startMonth: string; endMonth: string | null }, currentMonth: string): string[] {
  const last = template.endMonth !== null && template.endMonth < currentMonth ? template.endMonth : currentMonth;
  return monthsBetween(template.startMonth, last);
}

export function recurringDate(month: string, dayOfMonth: number): string {
  return `${month}-${String(dayOfMonth).padStart(2, "0")}`;
}

// ---- Pengeluaran ----------------------------------------------------------------------------

export type ExpenseData = { date: string; categoryId: string; amount: number; note: string | null; branchId: string | null };

/** Satu pengeluaran manual (spec laporan 9). Tanggal tidak boleh di masa depan. */
export function validateExpense(raw: unknown, ctx: { today: string }): Validation<ExpenseData> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (!isDateString(raw.date)) return fail("Isi tanggal pengeluaran.");
  if (raw.date > ctx.today) return fail("Tanggal pengeluaran tidak boleh di masa depan.");
  if (typeof raw.categoryId !== "string" || raw.categoryId === "" || raw.categoryId.length > 100) return fail("Pilih kategori.");
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail(AMOUNT_MESSAGE);
  const note = cleanText(raw.note);
  const branch = cleanText(raw.branchId);
  if (note === null || branch === null || branch.length > 100) return fail(INVALID_FORM);
  if (note.length > EXPENSE_NOTE_MAX) return fail(`Keterangan paling banyak ${EXPENSE_NOTE_MAX} karakter.`);
  return {
    ok: true,
    value: { date: raw.date, categoryId: raw.categoryId, amount: raw.amount, note: note === "" ? null : note, branchId: branch === "" ? null : branch },
  };
}

export function validateCategoryName(raw: unknown): Validation<string> {
  const name = cleanText(raw);
  if (name === null) return fail(INVALID_FORM);
  if (name === "") return fail("Isi nama kategori.");
  if (name.length > CATEGORY_NAME_MAX) return fail(`Nama kategori paling banyak ${CATEGORY_NAME_MAX} karakter.`);
  return { ok: true, value: name };
}

// ---- Templat berulang ------------------------------------------------------------------------

export type RecurringData = {
  categoryId: string;
  amount: number;
  note: string | null;
  branchId: string | null;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
};

const DAY_MESSAGE = "Tanggal tiap bulan harus 1 sampai 28.";

function endMonthOf(raw: unknown, startMonth: string): Validation<string | null> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (!isMonthString(raw)) return fail("Bulan berakhir tidak sah.");
  if (raw < startMonth) return fail("Bulan berakhir tidak boleh lebih awal dari bulan mulai.");
  return { ok: true, value: raw };
}

/** Templat baru (spec laporan 5, 9): tanggal 1–28, mulai paling jauh 24 bulan ke belakang dan 12 bulan ke depan. */
export function validateRecurring(raw: unknown, ctx: { currentMonth: string }): Validation<RecurringData> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (typeof raw.categoryId !== "string" || raw.categoryId === "" || raw.categoryId.length > 100) return fail("Pilih kategori.");
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail(AMOUNT_MESSAGE);
  if (!isWhole(raw.dayOfMonth, 1, 28)) return fail(DAY_MESSAGE);
  if (!isMonthString(raw.startMonth)) return fail("Isi bulan mulai.");
  if (raw.startMonth < addMonths(ctx.currentMonth, -RECURRING_BACK_MONTHS)) {
    return fail(`Bulan mulai paling jauh ${RECURRING_BACK_MONTHS} bulan ke belakang.`);
  }
  if (raw.startMonth > addMonths(ctx.currentMonth, RECURRING_AHEAD_MONTHS)) {
    return fail(`Bulan mulai paling jauh ${RECURRING_AHEAD_MONTHS} bulan ke depan.`);
  }
  const end = endMonthOf(raw.endMonth, raw.startMonth);
  if (!end.ok) return end;
  const note = cleanText(raw.note);
  const branch = cleanText(raw.branchId);
  if (note === null || branch === null || branch.length > 100) return fail(INVALID_FORM);
  if (note.length > EXPENSE_NOTE_MAX) return fail(`Keterangan paling banyak ${EXPENSE_NOTE_MAX} karakter.`);
  return {
    ok: true,
    value: {
      categoryId: raw.categoryId,
      amount: raw.amount,
      note: note === "" ? null : note,
      branchId: branch === "" ? null : branch,
      dayOfMonth: raw.dayOfMonth,
      startMonth: raw.startMonth,
      endMonth: end.value,
    },
  };
}

export type RecurringUpdateData = { amount: number; note: string | null; dayOfMonth: number; endMonth: string | null };

/** Perubahan templat (spec laporan 7): kategori, cabang, dan bulan mulai tidak diubah. */
export function validateRecurringUpdate(raw: unknown, ctx: { startMonth: string }): Validation<RecurringUpdateData> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail(AMOUNT_MESSAGE);
  if (!isWhole(raw.dayOfMonth, 1, 28)) return fail(DAY_MESSAGE);
  const end = endMonthOf(raw.endMonth, ctx.startMonth);
  if (!end.ok) return end;
  const note = cleanText(raw.note);
  if (note === null) return fail(INVALID_FORM);
  if (note.length > EXPENSE_NOTE_MAX) return fail(`Keterangan paling banyak ${EXPENSE_NOTE_MAX} karakter.`);
  return { ok: true, value: { amount: raw.amount, note: note === "" ? null : note, dayOfMonth: raw.dayOfMonth, endMonth: end.value } };
}
