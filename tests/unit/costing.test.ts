import { describe, expect, it } from "vitest";
import {
  commissionLabel,
  costWarning,
  lineCosts,
  marginOf,
  marginPercent,
  serviceCostSummary,
  validatePurchasePrices,
  validateServiceCost,
} from "@/lib/costing";

const service = { promoPrice: 250_000, materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN" as const, commissionValue: 10 };

describe("biaya layanan", () => {
  it("validasi", () => {
    expect(validateServiceCost({ materialCost: 40_000, toolCost: 0, commissionKind: "NOMINAL", commissionValue: 15_000 })).toEqual({
      ok: true,
      value: { materialCost: 40_000, toolCost: 0, commissionKind: "NOMINAL", commissionValue: 15_000 },
    });
    expect(validateServiceCost({ materialCost: 1, toolCost: 1, commissionKind: null, commissionValue: 99 })).toEqual({
      ok: true,
      value: { materialCost: 1, toolCost: 1, commissionKind: null, commissionValue: 0 },
    });
    expect(validateServiceCost({ materialCost: -1, toolCost: 0, commissionKind: null, commissionValue: 0 })).toEqual({ ok: false, message: "Biaya bahan tidak sah." });
    expect(validateServiceCost({ materialCost: 0, toolCost: 1.5, commissionKind: null, commissionValue: 0 })).toEqual({ ok: false, message: "Biaya alat tidak sah." });
    expect(validateServiceCost({ materialCost: 0, toolCost: 0, commissionKind: "PERSEN", commissionValue: 0 })).toEqual({ ok: false, message: "Komisi persen 1–100." });
    expect(validateServiceCost({ materialCost: 0, toolCost: 0, commissionKind: "NOMINAL", commissionValue: 0 })).toEqual({ ok: false, message: "Komisi rupiah tidak sah." });
    expect(validateServiceCost({ materialCost: 0, toolCost: 0, commissionKind: "X", commissionValue: 1 })).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });

  it("peringatan biaya melebihi harga, label, dan ringkasan", () => {
    expect(costWarning({ materialCost: 200_000, toolCost: 30_000, commissionKind: "PERSEN", commissionValue: 10 }, 250_000)).toBe("Biaya melebihi harga jual.");
    expect(costWarning({ materialCost: 40_000, toolCost: 10_000, commissionKind: "NOMINAL", commissionValue: 15_000 }, 250_000)).toBeNull();
    expect(commissionLabel("NOMINAL", 15_000)).toBe("Rp 15.000/sesi");
    expect(commissionLabel("PERSEN", 10)).toBe("10%");
    expect(commissionLabel(null, 0)).toBe("tanpa komisi");
    expect(serviceCostSummary({ materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 })).toBe("bahan Rp 40.000 · alat Rp 10.000 · komisi 10%");
  });
});

describe("salinan biaya baris", () => {
  it("persen dari harga katalog × jumlah dibulatkan ke bawah; rupiah × jumlah; tanpa pelaksana tanpa komisi", () => {
    expect(lineCosts({ quantity: 2, hasPerformer: true, service })).toEqual({ materialCost: 80_000, toolCost: 20_000, commissionAmount: 50_000 });
    expect(lineCosts({ quantity: 1, hasPerformer: true, service: { ...service, promoPrice: 99_999 } }).commissionAmount).toBe(9_999);
    expect(lineCosts({ quantity: 3, hasPerformer: true, service: { ...service, commissionKind: "NOMINAL", commissionValue: 15_000 } }).commissionAmount).toBe(45_000);
    expect(lineCosts({ quantity: 1, hasPerformer: false, service })).toEqual({ materialCost: 40_000, toolCost: 10_000, commissionAmount: 0 });
    expect(lineCosts({ quantity: 1, hasPerformer: true, service: null })).toEqual({ materialCost: 0, toolCost: 0, commissionAmount: 0 });
  });

  it("margin dan persennya", () => {
    expect(marginOf({ revenue: 250_000, stockCost: 0, materialCost: 40_000, toolCost: 10_000, commission: 25_000 })).toBe(175_000);
    expect(marginPercent(175_000, 250_000)).toBe(70);
    expect(marginPercent(1, 3)).toBe(33.3);
    expect(marginPercent(-50, 0)).toBeNull();
  });
});

describe("validatePurchasePrices", () => {
  it("semua baris wajib, bilangan bulat tidak negatif, baris harus milik faktur", () => {
    const ctx = { lineIds: ["a", "b"] };
    expect(validatePurchasePrices([{ lineId: "a", unitCost: 5000 }, { lineId: "b", unitCost: 0 }], ctx)).toEqual({ ok: true, value: [{ lineId: "a", unitCost: 5000 }, { lineId: "b", unitCost: 0 }] });
    expect(validatePurchasePrices([{ lineId: "a", unitCost: 5000 }], ctx)).toEqual({ ok: false, message: "Isi harga beli semua baris." });
    expect(validatePurchasePrices([{ lineId: "a", unitCost: 5000 }, { lineId: "b", unitCost: null }], ctx)).toEqual({ ok: false, message: "Isi harga beli semua baris." });
    expect(validatePurchasePrices([{ lineId: "a", unitCost: -1 }, { lineId: "b", unitCost: 1 }], ctx)).toEqual({ ok: false, message: "Harga beli tidak sah." });
    expect(validatePurchasePrices([{ lineId: "a", unitCost: 1 }, { lineId: "x", unitCost: 1 }], ctx)).toEqual({ ok: false, message: "Isi harga beli semua baris." });
    expect(validatePurchasePrices("x", ctx)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});
