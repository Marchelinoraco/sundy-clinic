import { describe, expect, it } from "vitest";
import { bookingFeeFor, formatBankAccount } from "@/lib/payment";

describe("formatBankAccount", () => {
  it("menulis bank, nomor, dan pemilik rekening", () => {
    expect(
      formatBankAccount({ bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" }),
    ).toBe("BCA 1234567890 a.n. SunDY Clinic");
  });

  it("mengembalikan null bila salah satu bagian belum diisi", () => {
    expect(formatBankAccount({ bankName: "BCA", bankAccountNumber: null, bankAccountHolder: "SunDY" })).toBeNull();
  });
});

describe("bookingFeeFor", () => {
  it("mengenakan biaya booking untuk situs, WhatsApp, dan telepon (K15, K18)", () => {
    expect(bookingFeeFor("SITUS", 100000)).toBe(100000);
    expect(bookingFeeFor("WHATSAPP", 100000)).toBe(100000);
    expect(bookingFeeFor("TELEPON", 100000)).toBe(100000);
  });

  it("tidak mengenakan biaya booking untuk walk-in", () => {
    expect(bookingFeeFor("WALK_IN", 100000)).toBeNull();
  });
});
