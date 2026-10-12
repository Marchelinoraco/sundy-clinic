import { describe, expect, it } from "vitest";
import {
  invoiceGrossSubtotal,
  invoiceSubtotal,
  invoiceTotals,
  limitedDiscount,
  lineAmount,
  manualItemDiscount,
  validateDiscount,
  validateLineDiscount,
} from "@/lib/invoice";

const lines = [
  { quantity: 2, unitPrice: 150_000, discountAmount: 30_000, discountSource: "PROMO" as const },
  { quantity: 1, unitPrice: 100_000, discountAmount: 10_000, discountSource: "MANUAL" as const },
];

describe("total dengan diskon baris", () => {
  it("contoh spec: promo 10%, manual Rp10.000, diskon tagihan 5% → total Rp342.000", () => {
    const totals = invoiceTotals({ status: "FINAL", discountKind: "PERSEN", discountValue: 5, lines, payments: [] });
    expect(totals).toMatchObject({ grossSubtotal: 400_000, itemDiscount: 40_000, subtotal: 360_000, discount: 18_000, total: 342_000, balance: 342_000 });
  });

  it("baris tanpa diskon tetap seperti dulu (kolom lama tanpa discountAmount)", () => {
    expect(lineAmount({ quantity: 3, unitPrice: 1000 })).toBe(3000);
    expect(invoiceSubtotal([{ quantity: 3, unitPrice: 1000 }])).toBe(3000);
  });

  it("subtotal bersih, kotor, dan diskon manual saja", () => {
    expect(invoiceGrossSubtotal(lines)).toBe(400_000);
    expect(invoiceSubtotal(lines)).toBe(360_000);
    expect(manualItemDiscount(lines)).toBe(10_000);
  });

  it("batas gabungan menghitung manual + diskon tagihan, bukan promo", () => {
    expect(limitedDiscount({ discountKind: "PERSEN", discountValue: 5, lines })).toBe(28_000);
    expect(limitedDiscount({ discountKind: null, discountValue: 0, lines })).toBe(10_000);
  });
});

describe("validateDiscount dengan batas gabungan", () => {
  it("tepat 20% dari kotor sah; Rp1 lebih ditolak untuk resepsionis", () => {
    // kotor 400.000 → batas 80.000; manual lain 10.000 → diskon tagihan maks 70.000 (nominal)
    const ctx = { subtotal: 360_000, grossSubtotal: 400_000, otherLimited: 10_000, canExceed: false };
    expect(validateDiscount({ kind: "NOMINAL", value: 70_000, reason: "Pelanggan lama" }, ctx).ok).toBe(true);
    expect(validateDiscount({ kind: "NOMINAL", value: 70_001, reason: "Pelanggan lama" }, ctx)).toEqual({
      ok: false,
      message: "Diskon di atas 20% diberikan oleh Admin Keuangan.",
    });
    expect(validateDiscount({ kind: "NOMINAL", value: 70_001, reason: "x" }, { ...ctx, canExceed: true }).ok).toBe(true);
  });

  it("tanpa konteks tambahan tetap seperti dulu (20% dari subtotal)", () => {
    expect(validateDiscount({ kind: "PERSEN", value: 20, reason: "x" }, { subtotal: 100_000, canExceed: false }).ok).toBe(true);
    expect(validateDiscount({ kind: "PERSEN", value: 21, reason: "x" }, { subtotal: 100_000, canExceed: false }).ok).toBe(false);
  });
});

describe("validateLineDiscount", () => {
  it("nominal untuk seluruh baris dan persen dibulatkan ke bawah", () => {
    expect(validateLineDiscount({ kind: "NOMINAL", value: 25_000, reason: "Rusak kemasan" }, { gross: 300_000 })).toEqual({ ok: true, value: { amount: 25_000, reason: "Rusak kemasan" } });
    expect(validateLineDiscount({ kind: "PERSEN", value: 15, reason: "x" }, { gross: 99_999 })).toEqual({ ok: true, value: { amount: 14_999, reason: "x" } });
  });

  it("menolak melebihi harga baris, tanpa alasan, dan nilai tidak sah", () => {
    expect(validateLineDiscount({ kind: "NOMINAL", value: 300_001, reason: "x" }, { gross: 300_000 })).toEqual({ ok: false, message: "Diskon tidak boleh melebihi harga baris." });
    expect(validateLineDiscount({ kind: "NOMINAL", value: 1000, reason: " " }, { gross: 300_000 })).toEqual({ ok: false, message: "Isi alasan diskon." });
    expect(validateLineDiscount({ kind: "PERSEN", value: 0, reason: "x" }, { gross: 1000 }).ok).toBe(false);
    expect(validateLineDiscount({ kind: "PERSEN", value: 101, reason: "x" }, { gross: 1000 }).ok).toBe(false);
    expect(validateLineDiscount({ kind: "LAIN", value: 1, reason: "x" }, { gross: 1000 }).ok).toBe(false);
    expect(validateLineDiscount({ kind: "NOMINAL", value: 1, reason: "a".repeat(201) }, { gross: 1000 }).ok).toBe(false);
    expect(validateLineDiscount(null, { gross: 1000 }).ok).toBe(false);
  });

  it("persen yang menghasilkan Rp0 ditolak", () => {
    expect(validateLineDiscount({ kind: "PERSEN", value: 1, reason: "x" }, { gross: 50 })).toEqual({ ok: false, message: "Diskon terlalu kecil untuk baris ini." });
  });
});
