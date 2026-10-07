import { describe, expect, it } from "vitest";
import {
  discountAmount,
  discountLimit,
  fefoPlan,
  formatInvoiceNumber,
  invoiceSubtotal,
  invoiceTotals,
  matchesInvoiceView,
  validateDiscount,
  validateFreeLine,
  validateInvoicePayment,
  validateItemAdd,
  validateLineEdit,
  visitLines,
  type InvoiceInput,
} from "@/lib/invoice";

const TODAY = "2026-10-07";
const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("subtotal, diskon, dan total", () => {
  const lines = [
    { quantity: 1, unitPrice: 200000 },
    { quantity: 2, unitPrice: 2000 },
  ];

  it("subtotal = Σ jumlah × harga", () => {
    expect(invoiceSubtotal(lines)).toBe(204000);
    expect(invoiceSubtotal([])).toBe(0);
  });

  it("diskon persen dibulatkan ke bawah; nominal tidak melebihi subtotal; tanpa jenis = 0", () => {
    expect(discountAmount(204000, "PERSEN", 10)).toBe(20400);
    expect(discountAmount(1005, "PERSEN", 10)).toBe(100);
    expect(discountAmount(204000, "NOMINAL", 5000)).toBe(5000);
    expect(discountAmount(1000, "NOMINAL", 5000)).toBe(1000);
    expect(discountAmount(204000, null, 5000)).toBe(0);
    expect(discountLimit(204000)).toBe(40800);
    expect(discountLimit(1004)).toBe(200);
  });

  const base: InvoiceInput = { status: "FINAL", discountKind: null, discountValue: 0, lines, payments: [] };

  it("total, dibayar, sisa, dan status tampil", () => {
    expect(invoiceTotals(base)).toEqual({ subtotal: 204000, discount: 0, total: 204000, paid: 0, balance: 204000, display: "BELUM_DIBAYAR" });
    const partial = { ...base, discountKind: "NOMINAL" as const, discountValue: 4000, payments: [{ amount: 50000, revokedAt: null }] };
    expect(invoiceTotals(partial)).toMatchObject({ discount: 4000, total: 200000, paid: 50000, balance: 150000, display: "SEBAGIAN" });
    const paid = { ...base, payments: [{ amount: 204000, revokedAt: null }] };
    expect(invoiceTotals(paid)).toMatchObject({ balance: 0, display: "LUNAS" });
  });

  it("pembayaran yang dibatalkan tidak dihitung; draf dan dibatalkan punya status sendiri", () => {
    const revoked = { ...base, payments: [{ amount: 204000, revokedAt: new Date() }] };
    expect(invoiceTotals(revoked)).toMatchObject({ paid: 0, display: "BELUM_DIBAYAR" });
    expect(invoiceTotals({ ...base, status: "DRAF" }).display).toBe("DRAF");
    expect(invoiceTotals({ ...base, status: "DIBATALKAN" })).toMatchObject({ display: "DIBATALKAN", balance: 0 });
  });

  it("diskon penuh membuat total Rp 0 dan langsung Lunas", () => {
    expect(invoiceTotals({ ...base, discountKind: "PERSEN", discountValue: 100 })).toMatchObject({ total: 0, balance: 0, display: "LUNAS" });
  });

  it("nomor tagihan dan saringan tampilan", () => {
    expect(formatInvoiceNumber(2026, 7)).toBe("TG-2026-0007");
    expect(formatInvoiceNumber(2026, 12345)).toBe("TG-2026-12345");
    expect(matchesInvoiceView({ display: "SEBAGIAN" }, "BELUM_LUNAS")).toBe(true);
    expect(matchesInvoiceView({ display: "LUNAS" }, "BELUM_LUNAS")).toBe(false);
    expect(matchesInvoiceView({ display: "DRAF" }, "DRAF")).toBe(true);
    expect(matchesInvoiceView({ display: "DIBATALKAN" }, "DIBATALKAN")).toBe(true);
    expect(matchesInvoiceView({ display: "DRAF" }, "PERLU_DITAGIH")).toBe(false);
  });
});

describe("fefoPlan", () => {
  const batch = (id: string, quantityRemaining: number, expiry: string | null, created = "2026-01-01") => ({
    id,
    quantityRemaining,
    expiryDate: expiry ? day(expiry) : null,
    createdAt: day(created),
  });

  it("mengambil batch tercepat kedaluwarsa dulu, lalu berikutnya; tanpa kedaluwarsa paling akhir", () => {
    const plan = fefoPlan([batch("b3", 10, null), batch("b2", 5, "2027-03-01"), batch("b1", 4, "2027-01-01")], 7, TODAY);
    expect(plan).toEqual({ ok: true, takes: [{ batchId: "b1", quantity: 4 }, { batchId: "b2", quantity: 3 }] });
  });

  it("batch kedaluwarsa dan kosong tidak dipakai; kurang berarti tidak ok dengan jumlah tersedia", () => {
    const batches = [batch("old", 9, "2026-10-06"), batch("zero", 0, "2027-01-01"), batch("ok", 3, "2027-01-01")];
    expect(fefoPlan(batches, 3, TODAY)).toEqual({ ok: true, takes: [{ batchId: "ok", quantity: 3 }] });
    expect(fefoPlan(batches, 4, TODAY)).toEqual({ ok: false, available: 3 });
    expect(fefoPlan([], 1, TODAY)).toEqual({ ok: false, available: 0 });
  });

  it("kedaluwarsa hari ini masih boleh; tanggal sama diurutkan menurut batch yang lebih dulu masuk", () => {
    const plan = fefoPlan([batch("late", 5, "2026-10-07", "2026-06-01"), batch("early", 5, "2026-10-07", "2026-03-01")], 6, TODAY);
    expect(plan).toEqual({ ok: true, takes: [{ batchId: "early", quantity: 5 }, { batchId: "late", quantity: 1 }] });
  });
});

describe("visitLines", () => {
  const treatments = [
    { id: "t1", serviceId: "sv1", name: "Facial", price: 250000 },
    { id: "t2", serviceId: "sv2", name: "Meso", price: null },
  ];

  it("konsultasi + treatment dengan harga katalog; harga kosong menjadi Rp 0", () => {
    expect(visitLines({ online: false, service: { id: "k", name: "Konsultasi Dokter", price: 200000 }, treatments })).toEqual([
      { kind: "LAYANAN", name: "Konsultasi Dokter", quantity: 1, unitPrice: 200000, serviceId: "k", encounterTreatmentId: null },
      { kind: "TREATMENT", name: "Facial", quantity: 1, unitPrice: 250000, serviceId: "sv1", encounterTreatmentId: "t1" },
      { kind: "TREATMENT", name: "Meso", quantity: 1, unitPrice: 0, serviceId: "sv2", encounterTreatmentId: "t2" },
    ]);
  });

  it("Konsultasi Online tanpa baris konsultasi (sudah lunas di muka); tanpa layanan tidak ada baris layanan", () => {
    expect(visitLines({ online: true, service: { id: "o", name: "Konsultasi Online", price: 250000 }, treatments: [] })).toEqual([]);
    expect(visitLines({ online: false, service: null, treatments: [treatments[0]] })).toHaveLength(1);
  });
});

describe("validasi baris", () => {
  it("baris bebas: jenis layanan atau treatment, nama, jumlah bulat, harga tidak negatif", () => {
    expect(validateFreeLine({ kind: "LAYANAN", name: " Biaya administrasi ", quantity: 1, unitPrice: 10000 })).toEqual({
      ok: true,
      value: { kind: "LAYANAN", name: "Biaya administrasi", quantity: 1, unitPrice: 10000 },
    });
    expect(validateFreeLine({ kind: "BARANG", name: "x", quantity: 1, unitPrice: 1 })).toEqual({ ok: false, message: "Pilih jenis baris." });
    expect(validateFreeLine({ kind: "LAYANAN", name: " ", quantity: 1, unitPrice: 1 })).toEqual({ ok: false, message: "Isi nama baris." });
    expect(validateFreeLine({ kind: "LAYANAN", name: "x", quantity: 1.5, unitPrice: 1 })).toEqual({
      ok: false,
      message: "Jumlah harus bilangan bulat lebih dari 0.",
    });
    expect(validateFreeLine({ kind: "LAYANAN", name: "x", quantity: 1, unitPrice: -5 })).toEqual({ ok: false, message: "Harga tidak sah." });
  });

  it("tambah barang: barang dan jumlah", () => {
    expect(validateItemAdd({ itemId: "i1", quantity: 3 })).toEqual({ ok: true, value: { itemId: "i1", quantity: 3 } });
    expect(validateItemAdd({ itemId: "", quantity: 3 })).toEqual({ ok: false, message: "Pilih barang." });
    expect(validateItemAdd({ itemId: "i1", quantity: 0 })).toEqual({ ok: false, message: "Jumlah harus bilangan bulat lebih dari 0." });
  });

  it("ubah baris: harga katalog yang diubah wajib catatan", () => {
    expect(validateLineEdit({ quantity: 2, unitPrice: 5000, priceNote: " promo " }, { needsNote: true })).toEqual({
      ok: true,
      value: { quantity: 2, unitPrice: 5000, priceNote: "promo" },
    });
    expect(validateLineEdit({ quantity: 2, unitPrice: 5000, priceNote: "" }, { needsNote: true })).toEqual({
      ok: false,
      message: "Isi catatan alasan perubahan harga.",
    });
    expect(validateLineEdit({ quantity: 2, unitPrice: 5000, priceNote: "" }, { needsNote: false })).toEqual({
      ok: true,
      value: { quantity: 2, unitPrice: 5000, priceNote: null },
    });
  });
});

describe("validateDiscount", () => {
  it("tanpa diskon: jenis kosong atau nilai 0 menghapus diskon", () => {
    const cleared = { ok: true, value: { kind: null, value: 0, reason: null } };
    expect(validateDiscount({ kind: null, value: 0, reason: "" }, { subtotal: 100000, canExceed: false })).toEqual(cleared);
    expect(validateDiscount({ kind: "PERSEN", value: 0, reason: "x" }, { subtotal: 100000, canExceed: false })).toEqual(cleared);
  });

  it("persen 1–100 dan nominal tidak melebihi subtotal; alasan wajib", () => {
    expect(validateDiscount({ kind: "PERSEN", value: 10, reason: " Pelanggan lama " }, { subtotal: 100000, canExceed: false })).toEqual({
      ok: true,
      value: { kind: "PERSEN", value: 10, reason: "Pelanggan lama" },
    });
    expect(validateDiscount({ kind: "PERSEN", value: 101, reason: "x" }, { subtotal: 100000, canExceed: true })).toEqual({
      ok: false,
      message: "Persen diskon harus 1 sampai 100.",
    });
    expect(validateDiscount({ kind: "NOMINAL", value: 100001, reason: "x" }, { subtotal: 100000, canExceed: true })).toEqual({
      ok: false,
      message: "Nominal diskon tidak boleh melebihi subtotal.",
    });
    expect(validateDiscount({ kind: "NOMINAL", value: 5000, reason: " " }, { subtotal: 100000, canExceed: false })).toEqual({
      ok: false,
      message: "Isi alasan diskon.",
    });
  });

  it("di atas 20% hanya untuk yang boleh mengoreksi, baik persen maupun nominal", () => {
    const tooMuch = "Diskon di atas 20% diberikan oleh Admin Keuangan.";
    expect(validateDiscount({ kind: "PERSEN", value: 21, reason: "x" }, { subtotal: 100000, canExceed: false })).toEqual({ ok: false, message: tooMuch });
    expect(validateDiscount({ kind: "NOMINAL", value: 20001, reason: "x" }, { subtotal: 100000, canExceed: false })).toEqual({ ok: false, message: tooMuch });
    expect(validateDiscount({ kind: "PERSEN", value: 20, reason: "x" }, { subtotal: 100000, canExceed: false }).ok).toBe(true);
    expect(validateDiscount({ kind: "PERSEN", value: 50, reason: "x" }, { subtotal: 100000, canExceed: true }).ok).toBe(true);
  });
});

describe("validateInvoicePayment", () => {
  const pay = { invoiceId: "i1", amount: 50000, method: "QRIS", paidAt: "2026-10-07", reference: " QR-1 " };
  const ctx = { today: TODAY, finalizedDate: "2026-10-06", limit: 80000 };

  it("menerima pembayaran yang sah", () => {
    expect(validateInvoicePayment(pay, ctx)).toEqual({
      ok: true,
      value: { invoiceId: "i1", amount: 50000, method: "QRIS", paidAt: "2026-10-07", reference: "QR-1" },
    });
  });

  it("menolak nominal di atas sisa, tanpa sisa, metode asing, dan tanggal yang tidak sah", () => {
    expect(validateInvoicePayment({ ...pay, amount: 80001 }, ctx)).toEqual({ ok: false, message: "Nominal melebihi sisa tagihan (Rp 80.000)." });
    expect(validateInvoicePayment(pay, { ...ctx, limit: 0 })).toEqual({ ok: false, message: "Tagihan ini tidak punya sisa." });
    expect(validateInvoicePayment({ ...pay, amount: 0 }, ctx)).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
    expect(validateInvoicePayment({ ...pay, method: "CEK" }, ctx)).toEqual({ ok: false, message: "Pilih metode pembayaran." });
    expect(validateInvoicePayment({ ...pay, paidAt: "2026-02-31" }, ctx)).toEqual({ ok: false, message: "Isi tanggal bayar." });
    expect(validateInvoicePayment({ ...pay, paidAt: "2026-10-08" }, ctx)).toEqual({ ok: false, message: "Tanggal bayar tidak boleh di masa depan." });
    expect(validateInvoicePayment({ ...pay, paidAt: "2026-10-05" }, ctx)).toEqual({
      ok: false,
      message: "Tanggal bayar tidak boleh sebelum tagihan difinalkan.",
    });
  });
});
