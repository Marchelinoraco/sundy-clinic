import { describe, expect, it } from "vitest";
import {
  availableStock,
  counterShortages,
  counterState,
  suggestedRestock,
  validateRejectReason,
  validateRestockRequest,
  validateRestockSend,
} from "@/lib/counter-stock";

const TODAY = "2026-10-14";
const d = (value: string) => new Date(`${value}T00:00:00Z`);
const batch = (warehouse: number, counter: number, expiry: string | null) => ({
  quantityRemaining: warehouse,
  counterRemaining: counter,
  expiryDate: expiry ? d(expiry) : null,
});

describe("stok per lokasi (spec stok meja 3)", () => {
  it("tersedia per lokasi tanpa batch kedaluwarsa", () => {
    const batches = [batch(10, 4, "2027-01-01"), batch(5, 3, "2026-10-01"), batch(2, 0, null)];
    expect(availableStock(batches, TODAY, "GUDANG")).toBe(12);
    expect(availableStock(batches, TODAY, "MEJA")).toBe(4);
    expect(availableStock(batches, TODAY, "SEMUA")).toBe(16);
  });

  it("tanda meja hanya untuk barang yang berbatas meja", () => {
    expect(counterState([batch(0, 3, "2027-01-01")], 5, TODAY)).toEqual({ available: 3, expired: 0, flag: "MEJA_MENIPIS" });
    expect(counterState([batch(0, 6, "2027-01-01")], 5, TODAY).flag).toBeNull();
    expect(counterState([batch(0, 2, "2026-10-01")], 5, TODAY)).toEqual({ available: 0, expired: 2, flag: "MEJA_HABIS" });
    expect(counterState([], 0, TODAY)).toEqual({ available: 0, expired: 0, flag: null });
  });

  it("jumlah usulan sampai dua kali batas meja, paling sedikit 1", () => {
    expect(suggestedRestock(5, 0)).toBe(10);
    expect(suggestedRestock(5, 3)).toBe(7);
    expect(suggestedRestock(5, 12)).toBe(1);
    expect(suggestedRestock(0, 0)).toBe(1);
  });
});

describe("permintaan restock (spec stok meja 4)", () => {
  const line = { itemId: "i1", quantity: 10 };

  it("merapikan permintaan yang sah", () => {
    expect(validateRestockRequest({ branchId: "b1", note: "  untuk sore  ", lines: [line] })).toEqual({
      ok: true,
      value: { branchId: "b1", note: "untuk sore", lines: [line] },
    });
    expect(validateRestockRequest({ branchId: "b1", note: "", lines: [line] })).toMatchObject({ ok: true, value: { note: null } });
  });

  it.each([
    [{ branchId: "", note: "", lines: [line] }, "Pilih cabang."],
    [{ branchId: "b1", note: "", lines: [] }, "Pilih minimal satu barang."],
    [{ branchId: "b1", note: "", lines: Array.from({ length: 31 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 })) }, "Paling banyak 30 barang per permintaan."],
    [{ branchId: "b1", note: "", lines: [{ itemId: "", quantity: 1 }] }, "Pilih barang dari daftar."],
    [{ branchId: "b1", note: "", lines: [line, line] }, "Barang yang sama dipilih dua kali."],
    [{ branchId: "b1", note: "", lines: [{ itemId: "i1", quantity: 0 }] }, "Jumlah restock harus bilangan bulat 1–9.999."],
    [{ branchId: "b1", note: "", lines: [{ itemId: "i1", quantity: 10000 }] }, "Jumlah restock harus bilangan bulat 1–9.999."],
    [{ branchId: "b1", note: "x".repeat(301), lines: [line] }, "Catatan paling banyak 300 karakter."],
  ])("menolak %j", (input, message) => {
    expect(validateRestockRequest(input)).toEqual({ ok: false, message });
  });

  it("kirim: semua baris diisi 0 atau lebih, minimal satu lebih dari 0", () => {
    const ctx = { lineIds: ["l1", "l2"] };
    expect(validateRestockSend([{ lineId: "l1", quantity: 5 }, { lineId: "l2", quantity: 0 }], ctx)).toEqual({
      ok: true,
      value: [{ lineId: "l1", quantity: 5 }, { lineId: "l2", quantity: 0 }],
    });
    expect(validateRestockSend([{ lineId: "l1", quantity: 5 }], ctx)).toEqual({ ok: false, message: "Isi jumlah kirim semua barang." });
    expect(validateRestockSend([{ lineId: "l1", quantity: -1 }, { lineId: "l2", quantity: 0 }], ctx)).toEqual({ ok: false, message: "Jumlah kirim harus bilangan bulat 0 atau lebih." });
    expect(validateRestockSend([{ lineId: "l1", quantity: 0 }, { lineId: "l2", quantity: 0 }], ctx)).toEqual({
      ok: false,
      message: "Isi jumlah kirim minimal satu barang, atau tolak permintaan ini.",
    });
  });

  it("alasan tolak 2–200 karakter", () => {
    expect(validateRejectReason("  Stok gudang   kosong ")).toEqual({ ok: true, value: "Stok gudang kosong" });
    expect(validateRejectReason("x")).toEqual({ ok: false, message: "Alasan penolakan 2–200 karakter." });
  });

  it("kekurangan meja di draf tagihan: baris barang yang sama dijumlahkan", () => {
    const available = new Map([["i1", 4], ["i2", 10]]);
    const short = counterShortages(
      [
        { kind: "BARANG", itemId: "i1", quantity: 3 },
        { kind: "BARANG", itemId: "i1", quantity: 2 },
        { kind: "BARANG", itemId: "i2", quantity: 1 },
        { kind: "LAYANAN", itemId: null, quantity: 9 },
        { kind: "BARANG", itemId: "lain", quantity: 9 },
      ],
      available,
    );
    expect([...short.entries()]).toEqual([["i1", { needed: 5, available: 4 }]]);
  });
});
