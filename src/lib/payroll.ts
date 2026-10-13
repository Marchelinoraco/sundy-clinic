import { addMonths } from "./expense";
import { NIK_FORMAT_ERROR, normalizeNik } from "./nik";
import { isDateString, MAX_AMOUNT, type Validation } from "./stock";
import { combineWitaDateAndMinutes } from "./time";
import { normalizeWhatsapp } from "./whatsapp";

/** Aturan murni menu Karyawan (spec karyawan 2–4). Dipakai server dan browser; tanpa basis data. */
export const PAYROLL_SALARY_CATEGORY = "Gaji Karyawan";
export const PAYROLL_COMMISSION_CATEGORY = "Komisi";

const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const SALARY_MESSAGE = "Gaji pokok dan tunjangan harus bilangan bulat 0 atau lebih.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
/** Teks satu baris dirapikan; kosong/null/undefined → "", bukan teks → null. */
const line = (value: unknown): string | null => (value === undefined || value === null ? "" : typeof value === "string" ? value.replace(/\s+/g, " ").trim() : null);
const optionalId = (value: unknown): string | null | undefined =>
  value === undefined || value === null || value === "" ? null : typeof value === "string" ? value : undefined;

export type EmployeeInput = {
  name: string;
  position: string;
  branchId: string | null;
  joinedOn: string;
  nik: string | null;
  npwp: string | null;
  whatsapp: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  notes: string | null;
  baseSalary: number;
  allowance: number;
  staffId: string | null;
};

export function validateEmployee(raw: unknown): Validation<EmployeeInput> {
  if (!isObject(raw)) return fail(INVALID);
  const name = line(raw.name);
  const position = line(raw.position);
  const nikText = line(raw.nik);
  const npwpText = line(raw.npwp);
  const waText = line(raw.whatsapp);
  const bankName = line(raw.bankName);
  const bankAccountText = line(raw.bankAccount);
  const bankHolder = line(raw.bankHolder);
  const notes = raw.notes === undefined || raw.notes === null ? "" : typeof raw.notes === "string" ? raw.notes.trim() : null;
  const branchId = optionalId(raw.branchId);
  const staffId = optionalId(raw.staffId);
  if ([name, position, nikText, npwpText, waText, bankName, bankAccountText, bankHolder, notes].includes(null) || branchId === undefined || staffId === undefined) {
    return fail(INVALID);
  }
  if (!name) return fail("Isi nama karyawan.");
  if (name!.length < 2 || name!.length > 100) return fail("Nama 2–100 karakter.");
  if (!position) return fail("Isi jabatan.");
  if (position!.length < 2 || position!.length > 60) return fail("Jabatan 2–60 karakter.");
  if (!isDateString(raw.joinedOn)) return fail("Isi tanggal masuk.");

  let nik: string | null = null;
  if (nikText) {
    nik = normalizeNik(nikText);
    if (!nik) return fail(NIK_FORMAT_ERROR);
  }
  let npwp: string | null = null;
  if (npwpText) {
    npwp = npwpText.replace(/[\s.-]/g, "");
    if (!/^\d{15,16}$/.test(npwp)) return fail("NPWP harus 15 atau 16 angka.");
  }
  let whatsapp: string | null = null;
  if (waText) {
    whatsapp = normalizeWhatsapp(waText);
    if (!whatsapp) return fail("Nomor WhatsApp tidak sah.");
  }
  const bankParts = [bankName, bankAccountText, bankHolder];
  let bankAccount: string | null = null;
  if (bankParts.some(Boolean)) {
    if (!bankParts.every(Boolean)) return fail("Isi nama bank, nomor rekening, dan atas nama sekaligus.");
    bankAccount = bankAccountText!.replace(/[\s-]/g, "");
    if (!/^\d{5,30}$/.test(bankAccount)) return fail("Nomor rekening 5–30 angka.");
    if (bankName!.length > 60 || bankHolder!.length > 60) return fail("Nama bank dan atas nama paling banyak 60 karakter.");
  }
  if (notes!.length > 500) return fail("Catatan paling banyak 500 karakter.");
  if (!isWhole(raw.baseSalary, 0, MAX_AMOUNT) || !isWhole(raw.allowance, 0, MAX_AMOUNT)) return fail(SALARY_MESSAGE);

  return {
    ok: true,
    value: {
      name: name!,
      position: position!,
      branchId,
      joinedOn: raw.joinedOn,
      nik,
      npwp,
      whatsapp,
      bankName: bankAccount ? bankName : null,
      bankAccount,
      bankHolder: bankAccount ? bankHolder : null,
      notes: notes || null,
      baseSalary: raw.baseSalary,
      allowance: raw.allowance,
      staffId,
    },
  };
}

export type AdjustmentInput = { kind: "BONUS" | "POTONGAN"; amount: number; note: string };

export function validateAdjustment(raw: unknown): Validation<AdjustmentInput> {
  if (!isObject(raw)) return fail(INVALID);
  if (raw.kind !== "BONUS" && raw.kind !== "POTONGAN") return fail("Pilih bonus atau potongan.");
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail("Nominal harus bilangan bulat lebih dari 0.");
  const note = line(raw.note);
  if (note === null) return fail(INVALID);
  if (note.length < 2 || note.length > 120) return fail("Keterangan 2–120 karakter.");
  return { ok: true, value: { kind: raw.kind, amount: raw.amount, note } };
}

/** Gaji pokok dan tunjangan satu bulan; alasan wajib bila berbeda dari data karyawan (spec karyawan 4.2). */
export function validateAmounts(raw: unknown, ctx: { baseSalary: number; allowance: number }): Validation<{ baseSalary: number; allowance: number; note: string | null }> {
  if (!isObject(raw)) return fail(INVALID);
  if (!isWhole(raw.baseSalary, 0, MAX_AMOUNT) || !isWhole(raw.allowance, 0, MAX_AMOUNT)) return fail(SALARY_MESSAGE);
  const note = line(raw.note);
  if (note === null) return fail(INVALID);
  const changed = raw.baseSalary !== ctx.baseSalary || raw.allowance !== ctx.allowance;
  if (changed && !note) return fail("Isi alasan perubahan gaji.");
  if (note.length > 300) return fail("Alasan paling banyak 300 karakter.");
  return { ok: true, value: { baseSalary: raw.baseSalary, allowance: raw.allowance, note: note || null } };
}

type Amounts = { baseSalary: number; allowance: number; commission: number; bonusTotal: number; deductionTotal: number };

export function payrollTotal(x: Amounts): number {
  return x.baseSalary + x.allowance + x.commission + x.bonusTotal - x.deductionTotal;
}

/**
 * Pembagian ke Pengeluaran (spec karyawan 4.3): "Gaji Karyawan" = gaji + tunjangan + bonus − potongan, "Komisi" = komisi. Bila
 * potongan melebihi bagian gaji, sisanya mengurangi komisi, sehingga tidak ada pengeluaran negatif dan jumlahnya = total.
 */
export function expenseSplit(x: Amounts): { salary: number; commission: number } {
  const salary = x.baseSalary + x.allowance + x.bonusTotal - x.deductionTotal;
  return salary >= 0 ? { salary, commission: x.commission } : { salary: 0, commission: x.commission + salary };
}

/** Karyawan ikut penggajian bulan itu: sudah masuk paling lambat akhir bulan dan belum keluar sebelum awal bulan (spec 4.1). */
export function worksInMonth(e: { joinedOn: string; status: "AKTIF" | "BERHENTI"; leftOn: string | null }, month: string): boolean {
  const first = `${month}-01`;
  const next = `${addMonths(month, 1)}-01`;
  if (e.joinedOn >= next) return false;
  return e.status === "AKTIF" || (e.leftOn !== null && e.leftOn >= first);
}

/** Batas atas komisi bulan itu: awal bulan berikutnya pukul 00.00 WITA. */
export function monthEndInstant(month: string): Date {
  return combineWitaDateAndMinutes(`${addMonths(month, 1)}-01`, 0);
}
