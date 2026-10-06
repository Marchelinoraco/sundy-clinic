import { describe, expect, it } from "vitest";
import {
  comparePayables,
  dateLabel,
  dateOnly,
  dateOnlyString,
  flagsOf,
  isDateString,
  matchesPayableView,
  payableSummary,
  stockFlags,
  summarizeStock,
  validateAdjustment,
  validateDueDateChange,
  validatePayment,
  validatePurchase,
  validateReason,
  validateReturn,
  validateStockItem,
  validateSupplier,
  type PayableInput,
  type PurchaseInput,
} from "@/lib/stock";

const TODAY = "2026-10-07";
const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("tanggal tanpa jam", () => {
  it("menerima tanggal yang ada saja", () => {
    expect(isDateString("2026-10-07")).toBe(true);
    expect(isDateString("2026-02-31")).toBe(false);
    expect(isDateString("7/10/2026")).toBe(false);
    expect(isDateString(20261007)).toBe(false);
  });

  it("bolak-balik @db.Date tanpa bergeser hari, dan label tanggal", () => {
    expect(dateOnlyString(dateOnly("2026-12-31"))).toBe("2026-12-31");
    expect(dateLabel("2026-10-07")).toBe("7 Okt 2026");
    expect(dateLabel(null)).toBe("—");
  });
});

describe("payableSummary", () => {
  const base: PayableInput = { total: 100000, cancelledAt: null, dueDate: day("2026-10-31"), payments: [], returns: [] };

  it("belum dibayar, sebagian, lunas", () => {
    expect(payableSummary(base, TODAY)).toEqual({ paid: 0, refunded: 0, returned: 0, balance: 100000, status: "BELUM_DIBAYAR", overdue: false });
    const partial = { ...base, payments: [{ kind: "BAYAR" as const, amount: 40000, revokedAt: null }] };
    expect(payableSummary(partial, TODAY)).toMatchObject({ paid: 40000, balance: 60000, status: "SEBAGIAN" });
    const paid = { ...base, payments: [{ kind: "BAYAR" as const, amount: 100000, revokedAt: null }] };
    expect(payableSummary(paid, TODAY)).toMatchObject({ balance: 0, status: "LUNAS" });
  });

  it("pembayaran yang dibatalkan tidak dihitung", () => {
    const revoked = { ...base, payments: [{ kind: "BAYAR" as const, amount: 100000, revokedAt: new Date() }] };
    expect(payableSummary(revoked, TODAY)).toMatchObject({ paid: 0, balance: 100000, status: "BELUM_DIBAYAR" });
  });

  it("retur mengurangi hutang; retur atas faktur lunas menjadi kredit, pengembalian dana menutupnya", () => {
    const returned = { ...base, returns: [{ total: 30000 }] };
    expect(payableSummary(returned, TODAY)).toMatchObject({ returned: 30000, balance: 70000, status: "SEBAGIAN" });
    const credit = { ...base, payments: [{ kind: "BAYAR" as const, amount: 100000, revokedAt: null }], returns: [{ total: 30000 }] };
    expect(payableSummary(credit, TODAY)).toMatchObject({ balance: -30000, status: "KREDIT" });
    const refunded = { ...credit, payments: [...credit.payments, { kind: "PENGEMBALIAN" as const, amount: 30000, revokedAt: null }] };
    expect(payableSummary(refunded, TODAY)).toMatchObject({ refunded: 30000, balance: 0, status: "LUNAS" });
  });

  it("terlambat hanya bila belum lunas dan jatuh tempo sudah lewat; faktur dibatalkan tidak berhutang", () => {
    expect(payableSummary({ ...base, dueDate: day("2026-10-06") }, TODAY).overdue).toBe(true);
    expect(payableSummary({ ...base, dueDate: day("2026-10-07") }, TODAY).overdue).toBe(false);
    const cancelled = { ...base, dueDate: day("2026-10-01"), cancelledAt: new Date() };
    expect(payableSummary(cancelled, TODAY)).toMatchObject({ status: "DIBATALKAN", overdue: false });
  });
});

describe("tampilan dan urutan hutang", () => {
  const row = (patch: Partial<{ status: "BELUM_DIBAYAR" | "SEBAGIAN" | "LUNAS" | "KREDIT" | "DIBATALKAN"; overdue: boolean; balance: number; dueDate: string }>) => ({
    status: "BELUM_DIBAYAR" as const,
    overdue: false,
    balance: 1000,
    dueDate: "2026-10-20",
    ...patch,
  });

  it("menyaring per tampilan", () => {
    expect(matchesPayableView(row({ status: "KREDIT", balance: -500 }), "BELUM_LUNAS", TODAY)).toBe(true);
    expect(matchesPayableView(row({ status: "LUNAS", balance: 0 }), "BELUM_LUNAS", TODAY)).toBe(false);
    expect(matchesPayableView(row({ overdue: true, dueDate: "2026-10-01" }), "TERLAMBAT", TODAY)).toBe(true);
    expect(matchesPayableView(row({ dueDate: "2026-10-14" }), "JATUH_TEMPO", TODAY)).toBe(true);
    expect(matchesPayableView(row({ dueDate: "2026-10-15" }), "JATUH_TEMPO", TODAY)).toBe(false);
    expect(matchesPayableView(row({ status: "DIBATALKAN" }), "DIBATALKAN", TODAY)).toBe(true);
  });

  it("terlambat paling atas, lalu jatuh tempo terdekat", () => {
    const list = [row({ dueDate: "2026-10-30" }), row({ dueDate: "2026-10-10" }), row({ overdue: true, dueDate: "2026-10-01" })];
    expect([...list].sort(comparePayables).map((r) => r.dueDate)).toEqual(["2026-10-01", "2026-10-10", "2026-10-30"]);
  });
});

describe("stockFlags", () => {
  const batch = (quantityRemaining: number, expiry: string | null, unitCost = 1000) => ({
    quantityRemaining,
    expiryDate: expiry ? day(expiry) : null,
    unitCost,
  });

  it("stok tersedia tidak menghitung batch kedaluwarsa; nilai stok menghitung semua sisa", () => {
    const flags = stockFlags([batch(10, "2027-06-01"), batch(4, "2026-10-06"), batch(3, null, 5000)], 0, TODAY);
    expect(flags).toEqual({ onHand: 17, available: 13, value: 10000 + 4000 + 15000, low: false, expiringSoon: false, expired: true });
    expect(flagsOf(flags)).toEqual(["KEDALUWARSA"]);
  });

  it("segera kedaluwarsa dalam 60 hari, termasuk hari ini; menipis bila tersedia ≤ batas", () => {
    expect(stockFlags([batch(5, "2026-12-06")], 0, TODAY).expiringSoon).toBe(true);
    expect(stockFlags([batch(5, "2026-12-07")], 0, TODAY).expiringSoon).toBe(false);
    expect(stockFlags([batch(5, "2026-10-07")], 0, TODAY)).toMatchObject({ expiringSoon: true, expired: false, available: 5 });
    expect(stockFlags([batch(20, null)], 20, TODAY).low).toBe(true);
    expect(stockFlags([batch(21, null)], 20, TODAY).low).toBe(false);
    expect(stockFlags([], 0, TODAY).low).toBe(false);
    expect(flagsOf(stockFlags([batch(2, "2026-11-01")], 5, TODAY))).toEqual(["MENIPIS", "SEGERA_KEDALUWARSA"]);
  });

  it("ringkasan cabang", () => {
    const a = stockFlags([batch(2, "2026-11-01")], 5, TODAY);
    const b = stockFlags([batch(1, "2026-10-01", 3000)], 0, TODAY);
    expect(summarizeStock([a, b])).toEqual({ value: 2000 + 3000, low: 1, expiringSoon: 1, expired: 1 });
  });
});

describe("validasi barang dan supplier", () => {
  const item = { code: " obt-001 ", name: " Amoxicillin ", kind: "OBAT", unit: " kapsul ", sellPrice: 2000, minStock: 20, notes: "" };

  it("merapikan barang yang sah", () => {
    expect(validateStockItem(item)).toEqual({
      ok: true,
      value: { code: "OBT-001", name: "Amoxicillin", kind: "OBAT", unit: "kapsul", sellPrice: 2000, minStock: 20, notes: null },
    });
    expect(validateStockItem({ ...item, sellPrice: null })).toMatchObject({ ok: true, value: { sellPrice: null } });
  });

  it("menolak barang yang tidak sah", () => {
    expect(validateStockItem({ ...item, code: "" })).toEqual({ ok: false, message: "Isi kode barang." });
    expect(validateStockItem({ ...item, code: "OBT 001" })).toEqual({
      ok: false,
      message: "Kode hanya huruf, angka, dan tanda hubung, paling banyak 30 karakter.",
    });
    expect(validateStockItem({ ...item, name: " " })).toEqual({ ok: false, message: "Isi nama barang." });
    expect(validateStockItem({ ...item, kind: "ALAT" })).toEqual({ ok: false, message: "Pilih jenis barang." });
    expect(validateStockItem({ ...item, unit: "" })).toEqual({ ok: false, message: "Isi satuan, mis. tablet atau botol." });
    expect(validateStockItem({ ...item, sellPrice: -1 })).toEqual({ ok: false, message: "Harga jual tidak sah." });
    expect(validateStockItem({ ...item, minStock: 1.5 })).toEqual({
      ok: false,
      message: "Batas menipis harus bilangan bulat 0 atau lebih.",
    });
  });

  it("supplier: nama wajib", () => {
    expect(validateSupplier({ name: " Kimia Farma ", phone: "", address: "", notes: "" })).toEqual({
      ok: true,
      value: { name: "Kimia Farma", phone: null, address: null, notes: null },
    });
    expect(validateSupplier({ name: "", phone: "", address: "", notes: "" })).toEqual({ ok: false, message: "Isi nama supplier." });
  });
});

describe("validatePurchase", () => {
  const kinds = new Map([
    ["obat", "OBAT" as const],
    ["serum", "PRODUK" as const],
  ]);
  const ctx = { today: TODAY, kindOf: (id: string) => kinds.get(id) ?? null };
  const valid: PurchaseInput = {
    supplierId: "s1",
    branchId: "b1",
    invoiceNumber: " INV-123 ",
    invoiceDate: "2026-10-07",
    dueDate: "2026-11-06",
    notes: "",
    lines: [
      { itemId: "obat", quantity: 10, unitCost: 5000, batchNumber: " B1 ", expiryDate: "2027-06-01" },
      { itemId: "serum", quantity: 2, unitCost: 75000, batchNumber: "", expiryDate: "" },
    ],
  };

  it("menghitung total dan merapikan isian", () => {
    expect(validatePurchase(valid, ctx)).toEqual({
      ok: true,
      value: {
        supplierId: "s1",
        branchId: "b1",
        invoiceNumber: "INV-123",
        invoiceDate: "2026-10-07",
        dueDate: "2026-11-06",
        notes: null,
        total: 50000 + 150000,
        lines: [
          { itemId: "obat", quantity: 10, unitCost: 5000, batchNumber: "B1", expiryDate: "2027-06-01" },
          { itemId: "serum", quantity: 2, unitCost: 75000, batchNumber: null, expiryDate: null },
        ],
      },
    });
  });

  it("menolak kepala faktur yang tidak sah", () => {
    expect(validatePurchase({ ...valid, supplierId: "" }, ctx)).toEqual({ ok: false, message: "Pilih supplier." });
    expect(validatePurchase({ ...valid, branchId: "" }, ctx)).toEqual({ ok: false, message: "Pilih cabang penerima." });
    expect(validatePurchase({ ...valid, invoiceNumber: " " }, ctx)).toEqual({ ok: false, message: "Isi nomor faktur." });
    expect(validatePurchase({ ...valid, invoiceDate: "2026-10-08" }, ctx)).toEqual({
      ok: false,
      message: "Tanggal faktur tidak boleh di masa depan.",
    });
    expect(validatePurchase({ ...valid, dueDate: "2026-10-06" }, ctx)).toEqual({
      ok: false,
      message: "Jatuh tempo tidak boleh sebelum tanggal faktur.",
    });
    expect(validatePurchase({ ...valid, lines: [] }, ctx)).toEqual({ ok: false, message: "Tambahkan minimal satu barang." });
    expect(validatePurchase("bukan objek", ctx)).toEqual({
      ok: false,
      message: "Data barang masuk tidak sah. Muat ulang halaman lalu coba lagi.",
    });
  });

  it("menolak baris yang tidak sah, dengan nomor barisnya", () => {
    const line = (patch: Record<string, unknown>) => ({ ...valid, lines: [valid.lines[0], { ...valid.lines[1], ...patch }] });
    expect(validatePurchase(line({ itemId: "hilang" }), ctx)).toEqual({ ok: false, message: "Baris 2: pilih barang yang aktif." });
    expect(validatePurchase(line({ quantity: 1.5 }), ctx)).toEqual({
      ok: false,
      message: "Baris 2: jumlah harus bilangan bulat lebih dari 0.",
    });
    expect(validatePurchase(line({ quantity: 0 }), ctx)).toEqual({
      ok: false,
      message: "Baris 2: jumlah harus bilangan bulat lebih dari 0.",
    });
    expect(validatePurchase(line({ unitCost: -1 }), ctx)).toEqual({ ok: false, message: "Baris 2: harga beli tidak sah." });
    expect(validatePurchase(line({ expiryDate: "2026-02-31" }), ctx)).toEqual({
      ok: false,
      message: "Baris 2: tanggal kedaluwarsa tidak sah.",
    });
    expect(validatePurchase(line({ itemId: "obat", expiryDate: "" }), ctx)).toEqual({
      ok: false,
      message: "Baris 2: isi tanggal kedaluwarsa obat.",
    });
    expect(validatePurchase(line({ expiryDate: "2026-10-06" }), ctx)).toEqual({ ok: false, message: "Baris 2: barang ini sudah kedaluwarsa." });
    expect(validatePurchase(line({ quantity: 1_000_000, unitCost: 2_000_000_000 }), ctx)).toEqual({
      ok: false,
      message: "Total faktur terlalu besar.",
    });
  });
});

describe("validasi penyesuaian, retur, pembayaran, alasan, jatuh tempo", () => {
  it("penyesuaian: arah menentukan tanda dan alasan yang boleh", () => {
    expect(validateAdjustment({ batchId: "b1", direction: "KURANGI", quantity: 2, reason: "RUSAK", note: "" })).toEqual({
      ok: true,
      value: { batchId: "b1", delta: -2, reason: "RUSAK", note: null },
    });
    expect(validateAdjustment({ batchId: "b1", direction: "TAMBAH", quantity: 1, reason: "SELISIH_HITUNG", note: "Hitung ulang rak" })).toEqual({
      ok: true,
      value: { batchId: "b1", delta: 1, reason: "SELISIH_HITUNG", note: "Hitung ulang rak" },
    });
    expect(validateAdjustment({ batchId: "b1", direction: "TAMBAH", quantity: 1, reason: "RUSAK", note: "" })).toEqual({
      ok: false,
      message: "Pilih alasan penyesuaian.",
    });
    expect(validateAdjustment({ batchId: "b1", direction: "KURANGI", quantity: 1, reason: "LAINNYA", note: " " })).toEqual({
      ok: false,
      message: "Isi catatan untuk alasan ini.",
    });
    expect(validateAdjustment({ batchId: "b1", direction: "KURANGI", quantity: -3, reason: "HILANG", note: "" })).toEqual({
      ok: false,
      message: "Jumlah harus bilangan bulat lebih dari 0.",
    });
  });

  it("retur: minimal satu baris, jumlah bulat positif, batch tidak berulang", () => {
    expect(validateReturn({ invoiceId: "i1", lines: [{ batchId: "b1", quantity: 2 }], note: "" })).toEqual({
      ok: true,
      value: { invoiceId: "i1", lines: [{ batchId: "b1", quantity: 2 }], note: null },
    });
    expect(validateReturn({ invoiceId: "i1", lines: [], note: "" })).toEqual({ ok: false, message: "Pilih minimal satu barang untuk diretur." });
    expect(validateReturn({ invoiceId: "i1", lines: [{ batchId: "b1", quantity: 0.5 }], note: "" })).toEqual({
      ok: false,
      message: "Jumlah retur harus bilangan bulat lebih dari 0.",
    });
    expect(
      validateReturn({ invoiceId: "i1", lines: [{ batchId: "b1", quantity: 1 }, { batchId: "b1", quantity: 1 }], note: "" }),
    ).toEqual({ ok: false, message: "Batch yang sama dipilih dua kali." });
  });

  it("pembayaran: batas sisa, tanggal, metode", () => {
    const pay = { invoiceId: "i1", kind: "BAYAR", amount: 40000, method: "TRANSFER", paidAt: "2026-10-07", reference: " TRF-1 " };
    const ctx = { today: TODAY, invoiceDate: "2026-10-01", limit: 60000 };
    expect(validatePayment(pay, ctx)).toEqual({
      ok: true,
      value: { invoiceId: "i1", kind: "BAYAR", amount: 40000, method: "TRANSFER", paidAt: "2026-10-07", reference: "TRF-1" },
    });
    expect(validatePayment({ ...pay, amount: 60001 }, ctx)).toEqual({ ok: false, message: "Nominal melebihi sisa hutang (Rp 60.000)." });
    expect(validatePayment({ ...pay, kind: "PENGEMBALIAN", amount: 70000 }, ctx)).toEqual({
      ok: false,
      message: "Nominal melebihi kredit dari supplier (Rp 60.000).",
    });
    expect(validatePayment(pay, { ...ctx, limit: 0 })).toEqual({ ok: false, message: "Faktur ini tidak punya sisa hutang." });
    expect(validatePayment({ ...pay, kind: "PENGEMBALIAN" }, { ...ctx, limit: 0 })).toEqual({
      ok: false,
      message: "Faktur ini tidak punya kredit dari supplier.",
    });
    expect(validatePayment({ ...pay, amount: 0 }, ctx)).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
    expect(validatePayment({ ...pay, method: "CEK" }, ctx)).toEqual({ ok: false, message: "Pilih metode pembayaran." });
    expect(validatePayment({ ...pay, paidAt: "2026-10-08" }, ctx)).toEqual({ ok: false, message: "Tanggal bayar tidak boleh di masa depan." });
    expect(validatePayment({ ...pay, paidAt: "2026-09-30" }, ctx)).toEqual({
      ok: false,
      message: "Tanggal bayar tidak boleh sebelum tanggal faktur.",
    });
  });

  it("alasan wajib dan jatuh tempo baru tidak sebelum tanggal faktur", () => {
    expect(validateReason("  salah input  ")).toEqual({ ok: true, value: "salah input" });
    expect(validateReason(" ")).toEqual({ ok: false, message: "Isi alasan." });
    expect(validateDueDateChange("2026-11-30", "2026-10-01")).toEqual({ ok: true, value: "2026-11-30" });
    expect(validateDueDateChange("2026-09-30", "2026-10-01")).toEqual({
      ok: false,
      message: "Jatuh tempo tidak boleh sebelum tanggal faktur.",
    });
    expect(validateDueDateChange("", "2026-10-01")).toEqual({ ok: false, message: "Isi tanggal jatuh tempo." });
  });
});
