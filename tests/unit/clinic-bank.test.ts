import { describe, expect, it } from "vitest";
import { validateClinicBankAccount } from "@/lib/clinic-bank";

describe("validateClinicBankAccount", () => {
  it("membersihkan nomor dan teks", () => {
    expect(validateClinicBankAccount({ bankName: " BCA ", accountNumber: "123-456 7890", accountHolder: " PT SunDY " })).toEqual({
      ok: true,
      value: { bankName: "BCA", accountNumber: "1234567890", accountHolder: "PT SunDY" },
    });
  });

  it("menolak isian kosong, nomor tidak sah, dan teks terlalu panjang", () => {
    expect(validateClinicBankAccount({ bankName: "", accountNumber: "12345", accountHolder: "x" })).toEqual({ ok: false, message: "Isi nama bank." });
    expect(validateClinicBankAccount({ bankName: "BCA", accountNumber: "1234", accountHolder: "x" })).toEqual({ ok: false, message: "Nomor rekening 5–20 angka." });
    expect(validateClinicBankAccount({ bankName: "BCA", accountNumber: "12ab45", accountHolder: "x" })).toEqual({ ok: false, message: "Nomor rekening 5–20 angka." });
    expect(validateClinicBankAccount({ bankName: "BCA", accountNumber: "12345", accountHolder: "" })).toEqual({ ok: false, message: "Isi nama pemilik rekening." });
    expect(validateClinicBankAccount({ bankName: "a".repeat(81), accountNumber: "12345", accountHolder: "x" }).ok).toBe(false);
    expect(validateClinicBankAccount(null).ok).toBe(false);
  });
});
