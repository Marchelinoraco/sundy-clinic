import { describe, expect, it } from "vitest";
import { buildInvoiceA4, INVOICE_A4_STAMP, packageItemText, paymentText, type InvoiceA4Source } from "@/lib/invoice-a4";

const paid = (amount: number, patch: Partial<InvoiceA4Source["payments"][number]> = {}) => ({
  amount,
  method: "TUNAI" as const,
  paidAt: new Date("2026-10-22T00:00:00Z"),
  revokedAt: null,
  destinationLabel: null,
  ...patch,
});

const source = (patch: Partial<InvoiceA4Source> = {}): InvoiceA4Source => ({
  number: "TG-2026-0123",
  status: "FINAL",
  finalizedAt: new Date("2026-10-22T02:15:00Z"),
  finalizedByName: "Rina",
  discountKind: null,
  discountValue: 0,
  patient: { name: "Maria Sului", medicalRecordNumber: "SDY-2026-0007" },
  branch: { name: "SunDY Mahakeret", address: "Jl. Garuda No. 10, Mahakeret Barat, Manado" },
  lines: [
    { name: "Paket Glowing 3 Bulan", quantity: 1, unit: null, unitPrice: 1_200_000, discountAmount: 0, discountSource: null, note: "4× Facial · berlaku s.d. 19 Jan 2027" },
    { name: "Slimming Capsule", quantity: 7, unit: "kapsul", unitPrice: 0, discountAmount: 0, discountSource: null, note: "Jatah paket Glowing 3 Bulan" },
  ],
  payments: [],
  ...patch,
});

const glowing = { name: "Glowing 3 Bulan", expiresOn: "2027-01-19", items: [{ name: "Facial Brightening", unit: null, total: 4, used: 1, remaining: 3 }] };

describe("invoice A4 (spec invoice A4)", () => {
  it("cap air mengikuti status bayar terkini; pembayaran dibatalkan tidak dihitung (IA3, IA6, Review Focus 2)", () => {
    expect(buildInvoiceA4(source(), [])!.status).toBe("BELUM_DIBAYAR");
    expect(buildInvoiceA4(source({ payments: [paid(500_000)] }), [])).toMatchObject({ status: "DEPOSIT", paid: 500_000, balance: 700_000 });
    expect(buildInvoiceA4(source({ payments: [paid(500_000), paid(700_000)] }), [])).toMatchObject({ status: "LUNAS", balance: 0 });
    const revoked = buildInvoiceA4(source({ payments: [paid(500_000), paid(700_000, { revokedAt: new Date() })] }), [])!;
    expect(revoked).toMatchObject({ status: "DEPOSIT", balance: 700_000 });
    expect(revoked.payments).toHaveLength(1);
    expect(buildInvoiceA4(source({ status: "DIBATALKAN" }), [])!.status).toBe("DIBATALKAN");
    expect(buildInvoiceA4(source({ status: "DRAF", number: null, finalizedAt: null }), [])).toBeNull();
    expect(INVOICE_A4_STAMP).toEqual({ LUNAS: "LUNAS", DEPOSIT: "DEPOSIT", BELUM_DIBAYAR: "BELUM DIBAYAR", DIBATALKAN: "DIBATALKAN" });
  });

  it("isi invoice: nomor RM, baris dengan satuan, dan paket dibawa apa adanya (IA4, IA5)", () => {
    const invoice = buildInvoiceA4(source(), [glowing])!;
    expect(invoice).toMatchObject({ number: "TG-2026-0123", cashierName: "Rina", customerName: "Maria Sului", medicalRecordNumber: "SDY-2026-0007", branchName: "SunDY Mahakeret", total: 1_200_000 });
    expect(invoice.lines[1]).toMatchObject({ name: "Slimming Capsule", quantity: 7, unit: "kapsul", gross: 0, note: "Jatah paket Glowing 3 Bulan" });
    expect(invoice.packages).toEqual([glowing]);
  });

  it("baris pembayaran menyebut tanggal dan metode; transfer dan EDC menyebut rekeningnya (IA4a, IA4b, IA12)", () => {
    const at = "2026-10-22";
    expect(paymentText({ paidAt: at, method: "TUNAI", destinationLabel: null })).toBe("22 Okt 2026 · Tunai");
    expect(paymentText({ paidAt: at, method: "QRIS", destinationLabel: null })).toBe("22 Okt 2026 · QRIS");
    expect(paymentText({ paidAt: at, method: "TRANSFER", destinationLabel: "BCA 1234567890 a.n. SunDY Clinic" })).toBe("22 Okt 2026 · Transfer bank ke BCA 1234567890 a.n. SunDY Clinic");
    expect(paymentText({ paidAt: at, method: "EDC", destinationLabel: "BCA 1234567890 a.n. SunDY Clinic" })).toBe("22 Okt 2026 · EDC BCA 1234567890 a.n. SunDY Clinic");
    const invoice = buildInvoiceA4(source({ payments: [paid(500_000, { method: "EDC", destinationLabel: "BCA 1234567890 a.n. SunDY Clinic" })] }), [])!;
    expect(invoice.payments).toEqual([{ paidAt: at, text: "22 Okt 2026 · EDC BCA 1234567890 a.n. SunDY Clinic", amount: 500_000 }]);
  });

  it("progres paket: sesi terpakai dan barang diterima (IA5)", () => {
    expect(packageItemText({ name: "Facial Brightening", unit: null, total: 4, used: 1, remaining: 3 })).toBe("1 dari 4 sesi terpakai · sisa 3");
    expect(packageItemText({ name: "Slimming Capsule", unit: "kapsul", total: 28, used: 7, remaining: 21 })).toBe("7 dari 28 kapsul diterima · sisa 21");
  });
});
