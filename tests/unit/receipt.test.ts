import { describe, expect, it } from "vitest";
import {
  buildPublicReceipt,
  formatReceiptDateTime,
  RECEIPT_CANCELLED_TEXT,
  RECEIPT_INVALID_TEXT,
  receiptMessageText,
  type ReceiptSource,
} from "@/lib/receipt";

const FINALIZED = new Date("2026-10-12T10:46:00Z"); // 18.46 WITA

function source(patch: Partial<ReceiptSource> = {}): ReceiptSource {
  return {
    number: "TG-2026-0123",
    status: "FINAL",
    finalizedAt: FINALIZED,
    finalizedByName: "Mey",
    discountKind: null,
    discountValue: 0,
    patient: { name: "Priscillya Jenitha Chiantoery" },
    branch: { name: "SunDY Mahakeret", address: "Jl. Mahakeret 1, Manado" },
    lines: [
      { name: "Paket Lux", quantity: 1, unitPrice: 1_500_000 },
      { name: "Paket S 0.3", quantity: 1, unitPrice: 1_600_000 },
    ],
    payments: [{ amount: 3_100_000, method: "QRIS", paidAt: new Date("2026-10-12T00:00:00Z"), revokedAt: null }],
    ...patch,
  };
}

describe("buildPublicReceipt", () => {
  it("tagihan final lunas: semua bagian struk", () => {
    expect(buildPublicReceipt(source())).toEqual({
      clinicName: "SunDY Clinic",
      branchName: "SunDY Mahakeret",
      branchAddress: "Jl. Mahakeret 1, Manado",
      number: "TG-2026-0123",
      finalizedAt: FINALIZED,
      cashierName: "Mey",
      customerName: "Priscillya Jenitha Chiantoery",
      lines: [
        { name: "Paket Lux", quantity: 1, unitPrice: 1_500_000, amount: 1_500_000 },
        { name: "Paket S 0.3", quantity: 1, unitPrice: 1_600_000, amount: 1_600_000 },
      ],
      subtotal: 3_100_000,
      discount: 0,
      total: 3_100_000,
      paid: 3_100_000,
      balance: 0,
      payments: [{ paidAt: "2026-10-12", method: "QRIS", amount: 3_100_000 }],
      status: "LUNAS",
    });
  });

  it("diskon, cicilan, dan pembayaran yang ditarik tidak ikut", () => {
    const receipt = buildPublicReceipt(
      source({
        discountKind: "NOMINAL",
        discountValue: 100_000,
        payments: [
          { amount: 1_000_000, method: "TUNAI", paidAt: new Date("2026-10-12T00:00:00Z"), revokedAt: null },
          { amount: 500_000, method: "TRANSFER", paidAt: new Date("2026-10-12T00:00:00Z"), revokedAt: new Date() },
        ],
      }),
    )!;
    expect(receipt).toMatchObject({ discount: 100_000, total: 3_000_000, paid: 1_000_000, balance: 2_000_000, status: "SEBAGIAN" });
    expect(receipt.payments).toEqual([{ paidAt: "2026-10-12", method: "TUNAI", amount: 1_000_000 }]);
  });

  it("belum dibayar sama sekali", () => {
    expect(buildPublicReceipt(source({ payments: [] }))).toMatchObject({ paid: 0, balance: 3_100_000, status: "BELUM_DIBAYAR" });
  });

  it("draf dan dibatalkan tidak punya struk", () => {
    expect(buildPublicReceipt(source({ status: "DRAF", number: null, finalizedAt: null }))).toBeNull();
    expect(buildPublicReceipt(source({ status: "DIBATALKAN" }))).toBeNull();
  });

  it("hanya memuat kunci yang diizinkan, walau sumbernya membawa data lain", () => {
    const extra = { ...source(), notes: "catatan internal", discountReason: "alasan", patient: { name: "A", whatsapp: "6281", medicalRecordNumber: "SDY-1" } };
    const json = JSON.stringify(buildPublicReceipt(extra as ReceiptSource));
    for (const secret of ["catatan internal", "alasan", "6281", "SDY-1"]) expect(json).not.toContain(secret);
  });
});

describe("receiptMessageText", () => {
  it("lunas: menyapa nama depan, nomor, total, dan tautan", () => {
    expect(receiptMessageText({ customerName: "Priscillya Jenitha", number: "TG-2026-0123", total: 3_100_000, balance: 0, url: "https://x/struk#k" })).toBe(
      [
        "Halo Priscillya, terima kasih sudah berkunjung ke SunDY Clinic.",
        "No. tagihan: TG-2026-0123",
        "Total: Rp 3.100.000 (LUNAS)",
        "Lihat struk lengkap: https://x/struk#k",
      ].join("\n"),
    );
  });

  it("belum lunas menyebut sisa", () => {
    expect(receiptMessageText({ customerName: "Budi", number: "TG-2026-0124", total: 300_000, balance: 100_000, url: "u" })).toContain(
      "Total: Rp 300.000 (sisa Rp 100.000)",
    );
  });
});

describe("label", () => {
  it("tanggal dan jam final dalam WITA", () => {
    expect(formatReceiptDateTime(FINALIZED)).toBe("12 Okt 2026 pukul 18.46");
  });

  it("pesan halaman publik", () => {
    expect(RECEIPT_INVALID_TEXT).toBe("Tautan struk tidak berlaku.");
    expect(RECEIPT_CANCELLED_TEXT).toBe("Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan.");
  });
});
