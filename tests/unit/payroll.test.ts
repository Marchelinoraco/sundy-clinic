import { describe, expect, it } from "vitest";
import { expenseSplit, monthEndInstant, payrollTotal, validateAdjustment, validateAmounts, validateEmployee, worksInMonth } from "@/lib/payroll";

const employee = {
  name: "  Siti   Aminah ",
  position: "Cleaning service",
  branchId: "",
  joinedOn: "2026-03-01",
  nik: "",
  npwp: "",
  whatsapp: "",
  bankName: "",
  bankAccount: "",
  bankHolder: "",
  notes: "",
  baseSalary: 2_500_000,
  allowance: 0,
  staffId: null,
};

describe("validasi karyawan", () => {
  it("merapikan teks dan mengosongkan isian opsional", () => {
    expect(validateEmployee(employee)).toEqual({
      ok: true,
      value: { ...employee, name: "Siti Aminah", branchId: null, nik: null, npwp: null, whatsapp: null, bankName: null, bankAccount: null, bankHolder: null, notes: null },
    });
  });

  it("menormalkan NIK, NPWP, nomor WhatsApp, dan rekening", () => {
    const result = validateEmployee({ ...employee, nik: "7171.0101.0101.0001", npwp: "01.234.567.8-901.000", whatsapp: "0812 3456 7890", bankName: "BCA", bankAccount: "123-456 7890", bankHolder: "Siti Aminah" });
    expect(result).toMatchObject({ ok: true, value: { nik: "7171010101010001", npwp: "012345678901000", whatsapp: "6281234567890", bankAccount: "1234567890" } });
  });

  it.each([
    [{ name: "" }, "Isi nama karyawan."],
    [{ name: "S" }, "Nama 2–100 karakter."],
    [{ position: "" }, "Isi jabatan."],
    [{ position: "x".repeat(61) }, "Jabatan 2–60 karakter."],
    [{ joinedOn: "" }, "Isi tanggal masuk."],
    [{ nik: "123" }, "NIK harus 16 angka."],
    [{ npwp: "12345" }, "NPWP harus 15 atau 16 angka."],
    [{ whatsapp: "12ab" }, "Nomor WhatsApp tidak sah."],
    [{ bankName: "BCA" }, "Isi nama bank, nomor rekening, dan atas nama sekaligus."],
    [{ bankName: "BCA", bankAccount: "12", bankHolder: "Siti" }, "Nomor rekening 5–30 angka."],
    [{ notes: "x".repeat(501) }, "Catatan paling banyak 500 karakter."],
    [{ baseSalary: -1 }, "Gaji pokok dan tunjangan harus bilangan bulat 0 atau lebih."],
    [{ allowance: 1.5 }, "Gaji pokok dan tunjangan harus bilangan bulat 0 atau lebih."],
  ])("menolak %j", (patch, message) => {
    expect(validateEmployee({ ...employee, ...patch })).toEqual({ ok: false, message });
  });
});

describe("penyesuaian dan perubahan gaji", () => {
  it("bonus/potongan wajib nominal dan keterangan", () => {
    expect(validateAdjustment({ kind: "POTONGAN", amount: 200_000, note: " Kasbon 12 Okt " })).toEqual({ ok: true, value: { kind: "POTONGAN", amount: 200_000, note: "Kasbon 12 Okt" } });
    expect(validateAdjustment({ kind: "X", amount: 1, note: "ab" })).toEqual({ ok: false, message: "Pilih bonus atau potongan." });
    expect(validateAdjustment({ kind: "BONUS", amount: 0, note: "ab" })).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
    expect(validateAdjustment({ kind: "BONUS", amount: 1, note: "a" })).toEqual({ ok: false, message: "Keterangan 2–120 karakter." });
  });

  it("perubahan gaji bulan itu wajib beralasan bila berbeda dari data karyawan", () => {
    const ctx = { baseSalary: 3_000_000, allowance: 500_000 };
    expect(validateAmounts({ baseSalary: 3_000_000, allowance: 500_000, note: "" }, ctx)).toEqual({ ok: true, value: { baseSalary: 3_000_000, allowance: 500_000, note: null } });
    expect(validateAmounts({ baseSalary: 1_500_000, allowance: 500_000, note: "" }, ctx)).toEqual({ ok: false, message: "Isi alasan perubahan gaji." });
    expect(validateAmounts({ baseSalary: 1_500_000, allowance: 500_000, note: "Masuk 15 Okt" }, ctx)).toEqual({ ok: true, value: { baseSalary: 1_500_000, allowance: 500_000, note: "Masuk 15 Okt" } });
    expect(validateAmounts({ baseSalary: -5, allowance: 0, note: "x" }, ctx)).toEqual({ ok: false, message: "Gaji pokok dan tunjangan harus bilangan bulat 0 atau lebih." });
  });
});

describe("hitungan penggajian", () => {
  const row = { baseSalary: 3_000_000, allowance: 500_000, commission: 400_000, bonusTotal: 100_000, deductionTotal: 200_000 };

  it("total = gaji + tunjangan + komisi + bonus − potongan", () => {
    expect(payrollTotal(row)).toBe(3_800_000);
    expect(expenseSplit(row)).toEqual({ salary: 3_400_000, commission: 400_000 });
  });

  it("potongan melebihi gaji tetapi tertutup komisi: pengeluaran tidak negatif dan jumlahnya sama dengan total (Review Focus 2)", () => {
    const heavy = { ...row, deductionTotal: 3_700_000 };
    expect(payrollTotal(heavy)).toBe(300_000);
    expect(expenseSplit(heavy)).toEqual({ salary: 0, commission: 300_000 });
  });

  it("bekerja di bulan itu: sudah masuk dan belum keluar sebelum bulan itu (Review Focus 4)", () => {
    expect(worksInMonth({ joinedOn: "2026-10-20", status: "AKTIF", leftOn: null }, "2026-10")).toBe(true);
    expect(worksInMonth({ joinedOn: "2026-11-01", status: "AKTIF", leftOn: null }, "2026-10")).toBe(false);
    expect(worksInMonth({ joinedOn: "2026-01-01", status: "BERHENTI", leftOn: "2026-10-05" }, "2026-10")).toBe(true);
    expect(worksInMonth({ joinedOn: "2026-01-01", status: "BERHENTI", leftOn: "2026-09-30" }, "2026-10")).toBe(false);
    expect(worksInMonth({ joinedOn: "2026-01-01", status: "BERHENTI", leftOn: "2026-12-31" }, "2026-10")).toBe(true);
  });

  it("akhir bulan = awal bulan berikutnya pukul 00.00 WITA", () => {
    expect(monthEndInstant("2026-10").toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(monthEndInstant("2026-12").toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });
});
