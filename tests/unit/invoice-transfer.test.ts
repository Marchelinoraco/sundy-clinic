import { describe, expect, it } from "vitest";
import { validateInvoicePayment } from "@/lib/invoice";

const ctx = { today: "2026-10-13", finalizedDate: "2026-10-12", limit: 500_000 };
const base = { invoiceId: "inv", amount: 100_000, paidAt: "2026-10-13", reference: "" };

describe("pembayaran transfer bank", () => {
  it("rekening tujuan wajib; isian pengirim opsional dan dirapikan", () => {
    expect(validateInvoicePayment({ ...base, method: "TRANSFER" }, ctx)).toEqual({ ok: false, message: "Pilih rekening tujuan." });
    const ok = validateInvoicePayment(
      { ...base, method: "TRANSFER", reference: " 2026101399 ", clinicBankAccountId: "acc", senderBank: " BRI ", senderAccountName: " Budi ", senderAccountNumber: " ****1234 " },
      ctx,
    );
    expect(ok).toEqual({
      ok: true,
      value: {
        invoiceId: "inv",
        amount: 100_000,
        method: "TRANSFER",
        paidAt: "2026-10-13",
        reference: "2026101399",
        transfer: { clinicBankAccountId: "acc", senderBank: "BRI", senderAccountName: "Budi", senderAccountNumber: "****1234" },
      },
    });
  });

  it("tunai dan QRIS mengabaikan isian transfer", () => {
    expect(validateInvoicePayment({ ...base, method: "TUNAI", clinicBankAccountId: "acc", senderBank: "BRI" }, ctx)).toMatchObject({ ok: true, value: { transfer: null } });
  });

  it("isian pengirim terlalu panjang atau nomor rekening berisi huruf ditolak", () => {
    expect(validateInvoicePayment({ ...base, method: "TRANSFER", clinicBankAccountId: "acc", senderBank: "a".repeat(81) }, ctx).ok).toBe(false);
    expect(validateInvoicePayment({ ...base, method: "TRANSFER", clinicBankAccountId: "acc", senderAccountNumber: "12ab" }, ctx)).toEqual({
      ok: false,
      message: "Nomor rekening pengirim hanya angka (boleh * untuk yang disamarkan).",
    });
  });
});
