import { describe, expect, it } from "vitest";
import {
  commissionLabel,
  costOverPrice,
  lineCosts,
  marginOf,
  marginPercent,
  priceBelowCost,
  serviceCostSummary,
  totalCostPerSession,
  validateOtherCosts,
  validatePurchasePrices,
  validateServiceCost,
} from "@/lib/costing";

const service = { promoPrice: 250_000, materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN" as const, commissionValue: 10, otherCosts: [] };

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

  it("label dan ringkasan", () => {
    expect(commissionLabel("NOMINAL", 15_000)).toBe("Rp 15.000/sesi");
    expect(commissionLabel("PERSEN", 10)).toBe("10%");
    expect(commissionLabel(null, 0)).toBe("tanpa komisi");
    expect(serviceCostSummary({ materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 })).toBe("bahan Rp 40.000 · alat Rp 10.000 · komisi 10%");
  });
});

describe("biaya lainnya (spec biaya lainnya BL4, BL11)", () => {
  const flat = { materialCost: 20_000, toolCost: 10_000, commissionKind: "NOMINAL" as const, commissionValue: 15_000 };
  const others = [
    { name: "Laundry", amount: 5000 },
    { name: "Listrik", amount: 3000 },
  ];

  it("baris dirapikan, baris kosong diabaikan, urutan dijaga", () => {
    expect(validateOtherCosts([{ name: " Laundry ", amount: 5000 }, { name: "", amount: null }, { name: "Listrik", amount: 3000 }])).toEqual({ ok: true, value: others });
    expect(validateOtherCosts([])).toEqual({ ok: true, value: [] });
  });

  it("menolak baris setengah terisi, nama panjang, nominal tidak sah, nama ganda, dan lebih dari 20 baris", () => {
    expect(validateOtherCosts([{ name: "Listrik", amount: null }])).toEqual({ ok: false, message: "Isi nama dan nominal biaya lainnya baris 1." });
    expect(validateOtherCosts([{ name: "A", amount: 1 }, { name: "  ", amount: 2000 }])).toEqual({ ok: false, message: "Isi nama dan nominal biaya lainnya baris 2." });
    expect(validateOtherCosts([{ name: "x".repeat(61), amount: 1 }])).toEqual({ ok: false, message: "Nama biaya lainnya paling banyak 60 karakter." });
    expect(validateOtherCosts([{ name: "A", amount: 0 }])).toEqual({ ok: false, message: "Nominal biaya lainnya baris 1 tidak sah." });
    expect(validateOtherCosts([{ name: "A", amount: 1.5 }])).toEqual({ ok: false, message: "Nominal biaya lainnya baris 1 tidak sah." });
    expect(validateOtherCosts([{ name: "Listrik", amount: 1 }, { name: " listrik ", amount: 2 }])).toEqual({ ok: false, message: 'Nama biaya lainnya "listrik" dipakai dua kali.' });
    const many = Array.from({ length: 21 }, (_, i) => ({ name: `Biaya ${i + 1}`, amount: 1 }));
    expect(validateOtherCosts(many)).toEqual({ ok: false, message: "Biaya lainnya paling banyak 20 baris." });
    expect(validateOtherCosts("x")).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });

  it("total per sesi: bahan + alat + komisi + biaya lainnya; komisi persen dari harga", () => {
    expect(totalCostPerSession(flat, others, 149_000)).toBe(53_000);
    expect(totalCostPerSession({ ...flat, commissionKind: "PERSEN", commissionValue: 10 }, others, 149_000)).toBe(20_000 + 10_000 + 14_900 + 8000);
  });

  it("melebihi harga ditolak; sama dengan harga boleh", () => {
    expect(costOverPrice(flat, others, 53_000)).toBeNull();
    expect(costOverPrice(flat, others, 52_999)).toBe("Total biaya Rp 53.000 melebihi harga berlaku Rp 52.999. Naikkan harga berlaku atau kurangi biaya.");
    expect(priceBelowCost(flat, others, 53_000)).toBeNull();
  });

  it("komisi persen 100 dengan biaya tetap: pesan menyebut total pada harga itu (Review Focus 1)", () => {
    expect(priceBelowCost({ materialCost: 1, toolCost: 0, commissionKind: "PERSEN", commissionValue: 100 }, [], 1000)).toBe(
      "Harga berlaku Rp 1.000 di bawah total biaya per sesi Rp 1.001. Naikkan harga atau kurangi biaya lewat tombol Harga & biaya.",
    );
  });

  it("ringkasan menyebut biaya lainnya bila ada", () => {
    expect(serviceCostSummary(flat, [])).toBe("bahan Rp 20.000 · alat Rp 10.000 · komisi Rp 15.000/sesi");
    expect(serviceCostSummary(flat, others)).toBe("bahan Rp 20.000 · alat Rp 10.000 · komisi Rp 15.000/sesi · lainnya Rp 8.000");
  });
});

describe("salinan biaya baris", () => {
  it("persen dari harga katalog × jumlah dibulatkan ke bawah; rupiah × jumlah; tanpa pelaksana tanpa komisi", () => {
    expect(lineCosts({ quantity: 2, hasPerformer: true, service })).toEqual({ materialCost: 80_000, toolCost: 20_000, otherCost: 0, commissionAmount: 50_000 });
    expect(lineCosts({ quantity: 1, hasPerformer: true, service: { ...service, promoPrice: 99_999 } }).commissionAmount).toBe(9_999);
    expect(lineCosts({ quantity: 3, hasPerformer: true, service: { ...service, commissionKind: "NOMINAL", commissionValue: 15_000 } }).commissionAmount).toBe(45_000);
    expect(lineCosts({ quantity: 1, hasPerformer: false, service })).toEqual({ materialCost: 40_000, toolCost: 10_000, otherCost: 0, commissionAmount: 0 });
    expect(lineCosts({ quantity: 1, hasPerformer: true, service: null })).toEqual({ materialCost: 0, toolCost: 0, otherCost: 0, commissionAmount: 0 });
  });

  it("biaya lainnya × jumlah ikut disalin (spec biaya lainnya BL2)", () => {
    const flat = { promoPrice: 100_000, materialCost: 1, toolCost: 2, commissionKind: null, commissionValue: 0, otherCosts: [{ name: "L", amount: 5000 }] };
    expect(lineCosts({ quantity: 2, hasPerformer: true, service: flat })).toEqual({ materialCost: 2, toolCost: 4, otherCost: 10_000, commissionAmount: 0 });
  });

  it("margin dan persennya", () => {
    expect(marginOf({ revenue: 250_000, stockCost: 0, materialCost: 40_000, toolCost: 10_000, otherCost: 8000, commission: 25_000 })).toBe(167_000);
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
