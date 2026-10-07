import { formatDateWithYear, formatRupiah } from "./format";
import { addDaysToDateString } from "./time";

// Aturan murni stok dan hutang (spec stok 4.2). Dipakai server dan browser; tanpa akses basis data.

export type StockItemKindValue = "OBAT" | "PRODUK";
export type AdjustReasonValue = "RUSAK" | "HILANG" | "KEDALUWARSA" | "SELISIH_HITUNG" | "LAINNYA";
export type PaymentMethodValue = "TUNAI" | "TRANSFER" | "QRIS";
export type SupplierPaymentKindValue = "BAYAR" | "PENGEMBALIAN";
export type StockMovementKindValue = "MASUK" | "RETUR" | "PENYESUAIAN";
export type StockFlag = "MENIPIS" | "SEGERA_KEDALUWARSA" | "KEDALUWARSA";
export type PayableStatus = "DIBATALKAN" | "LUNAS" | "KREDIT" | "SEBAGIAN" | "BELUM_DIBAYAR";
export type PayableView = "BELUM_LUNAS" | "TERLAMBAT" | "JATUH_TEMPO" | "LUNAS" | "DIBATALKAN";
export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

export const STOCK_ITEM_KIND_LABEL: Record<StockItemKindValue, string> = { OBAT: "Obat", PRODUK: "Produk" };
export const ADJUST_REASON_LABEL: Record<AdjustReasonValue, string> = {
  RUSAK: "Rusak",
  HILANG: "Hilang",
  KEDALUWARSA: "Kedaluwarsa dibuang",
  SELISIH_HITUNG: "Selisih hitung",
  LAINNYA: "Lainnya",
};
export const MOVEMENT_KIND_LABEL: Record<StockMovementKindValue, string> = {
  MASUK: "Masuk",
  RETUR: "Retur ke supplier",
  PENYESUAIAN: "Penyesuaian",
};
export const PAYMENT_METHOD_LABEL: Record<PaymentMethodValue, string> = {
  TUNAI: "Tunai",
  TRANSFER: "Transfer bank",
  QRIS: "QRIS",
};
export const PAYMENT_KIND_LABEL: Record<SupplierPaymentKindValue, string> = {
  BAYAR: "Pembayaran",
  PENGEMBALIAN: "Pengembalian dana",
};
export const STOCK_FLAG_LABEL: Record<StockFlag, string> = {
  MENIPIS: "Menipis",
  SEGERA_KEDALUWARSA: "Segera kedaluwarsa",
  KEDALUWARSA: "Kedaluwarsa",
};
export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  DIBATALKAN: "Dibatalkan",
  LUNAS: "Lunas",
  KREDIT: "Kredit dari supplier",
  SEBAGIAN: "Sebagian",
  BELUM_DIBAYAR: "Belum dibayar",
};
export const PAYABLE_VIEW_LABEL: Record<PayableView, string> = {
  BELUM_LUNAS: "Belum lunas",
  TERLAMBAT: "Terlambat",
  JATUH_TEMPO: "Jatuh tempo 7 hari",
  LUNAS: "Lunas",
  DIBATALKAN: "Dibatalkan",
};

export const DECREASE_REASONS: readonly AdjustReasonValue[] = ["RUSAK", "HILANG", "KEDALUWARSA", "LAINNYA"];
export const INCREASE_REASONS: readonly AdjustReasonValue[] = ["SELISIH_HITUNG"];
export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethodValue[];
export const PAYABLE_VIEWS = Object.keys(PAYABLE_VIEW_LABEL) as PayableView[];

export const EXPIRY_WARNING_DAYS = 60;
export const DEFAULT_DUE_DAYS = 30;
export const DUE_SOON_DAYS = 7;
export const MAX_PURCHASE_LINES = 100;
export const MAX_QUANTITY = 1_000_000;
export const MAX_AMOUNT = 2_000_000_000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODE_PATTERN = /^[A-Z0-9-]{1,30}$/;
const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const INVALID_PURCHASE = "Data barang masuk tidak sah. Muat ulang halaman lalu coba lagi.";

const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

/** Teks dari formulir, dipangkas. Kosong untuk null/undefined; null bila bukan teks. */
function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : null;
}

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---- Tanggal tanpa jam (@db.Date) -----------------------------------------------------------

/** Tanggal "YYYY-MM-DD" yang benar-benar ada (2026-02-31 ditolak). */
export function isDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_PATTERN.test(value) && addDaysToDateString(value, 0) === value;
}

/** "YYYY-MM-DD" → nilai kolom @db.Date (tengah malam UTC). */
export function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** Kolom @db.Date → "YYYY-MM-DD", dibaca dari UTC agar tidak bergeser hari. */
export function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-10-07" → "7 Okt 2026"; kosong → "—". */
export function dateLabel(value: string | null): string {
  return value ? formatDateWithYear(dateOnly(value)) : "—";
}

// ---- Hutang -----------------------------------------------------------------------------------

export type PayableInput = {
  total: number;
  cancelledAt: Date | null;
  dueDate: Date;
  payments: readonly { kind: SupplierPaymentKindValue; amount: number; revokedAt: Date | null }[];
  returns: readonly { total: number }[];
};

export type PayableSummary = {
  paid: number;
  refunded: number;
  returned: number;
  /** Sisa hutang; negatif berarti kredit dari supplier. */
  balance: number;
  status: PayableStatus;
  overdue: boolean;
};

/** Sisa = total − pembayaran − retur + pengembalian dana (spec stok 4.2). Yang dibatalkan tidak dihitung. */
export function payableSummary(invoice: PayableInput, today: string): PayableSummary {
  let paid = 0;
  let refunded = 0;
  for (const payment of invoice.payments) {
    if (payment.revokedAt) continue;
    if (payment.kind === "BAYAR") paid += payment.amount;
    else refunded += payment.amount;
  }
  const returned = invoice.returns.reduce((sum, r) => sum + r.total, 0);
  // Faktur dibatalkan tidak berhutang (spec stok 6.4).
  const balance = invoice.cancelledAt ? 0 : invoice.total - paid - returned + refunded;
  const status: PayableStatus = invoice.cancelledAt
    ? "DIBATALKAN"
    : balance === 0
      ? "LUNAS"
      : balance < 0
        ? "KREDIT"
        : paid > 0 || returned > 0
          ? "SEBAGIAN"
          : "BELUM_DIBAYAR";
  const overdue = status !== "DIBATALKAN" && balance > 0 && dateOnlyString(invoice.dueDate) < today;
  return { paid, refunded, returned, balance, status, overdue };
}

export function isPayableView(value: unknown): value is PayableView {
  return typeof value === "string" && (PAYABLE_VIEWS as string[]).includes(value);
}

/** Saringan daftar hutang (spec stok 6.1). */
export function matchesPayableView(
  row: { status: PayableStatus; overdue: boolean; balance: number; dueDate: string },
  view: PayableView,
  today: string,
): boolean {
  switch (view) {
    case "BELUM_LUNAS":
      return row.status === "BELUM_DIBAYAR" || row.status === "SEBAGIAN" || row.status === "KREDIT";
    case "TERLAMBAT":
      return row.overdue;
    case "JATUH_TEMPO":
      return row.balance > 0 && !row.overdue && row.dueDate <= addDaysToDateString(today, DUE_SOON_DAYS);
    case "LUNAS":
      return row.status === "LUNAS";
    case "DIBATALKAN":
      return row.status === "DIBATALKAN";
  }
}

/** Terlambat paling atas, lalu jatuh tempo terdekat. */
export function comparePayables(a: { overdue: boolean; dueDate: string }, b: { overdue: boolean; dueDate: string }): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  return a.dueDate.localeCompare(b.dueDate);
}

// ---- Stok -------------------------------------------------------------------------------------

export type StockFlags = {
  /** Semua sisa, termasuk batch kedaluwarsa. */
  onHand: number;
  /** Sisa yang masih boleh dipakai: tanpa batch kedaluwarsa. */
  available: number;
  /** Σ sisa × harga beli. */
  value: number;
  low: boolean;
  expiringSoon: boolean;
  expired: boolean;
};

/** Tanda stok satu barang di satu cabang (spec stok 4.2). `today` adalah tanggal WITA. */
export function stockFlags(
  batches: readonly { quantityRemaining: number; expiryDate: Date | null; unitCost: number }[],
  minStock: number,
  today: string,
): StockFlags {
  const warnUntil = addDaysToDateString(today, EXPIRY_WARNING_DAYS);
  let onHand = 0;
  let available = 0;
  let value = 0;
  let expired = false;
  let expiringSoon = false;
  for (const batch of batches) {
    if (batch.quantityRemaining <= 0) continue;
    onHand += batch.quantityRemaining;
    value += batch.quantityRemaining * batch.unitCost;
    const expiry = batch.expiryDate ? dateOnlyString(batch.expiryDate) : null;
    if (expiry !== null && expiry < today) {
      expired = true;
      continue;
    }
    available += batch.quantityRemaining;
    if (expiry !== null && expiry <= warnUntil) expiringSoon = true;
  }
  return { onHand, available, value, low: minStock > 0 && available <= minStock, expiringSoon, expired };
}

export function flagsOf(flags: StockFlags): StockFlag[] {
  const list: StockFlag[] = [];
  if (flags.low) list.push("MENIPIS");
  if (flags.expiringSoon) list.push("SEGERA_KEDALUWARSA");
  if (flags.expired) list.push("KEDALUWARSA");
  return list;
}

export function isStockFlag(value: unknown): value is StockFlag {
  return value === "MENIPIS" || value === "SEGERA_KEDALUWARSA" || value === "KEDALUWARSA";
}

/** Ringkasan di atas daftar barang: nilai stok dan jumlah barang per tanda. */
export function summarizeStock(rows: readonly StockFlags[]): { value: number; low: number; expiringSoon: number; expired: number } {
  return rows.reduce(
    (sum, row) => ({
      value: sum.value + row.value,
      low: sum.low + (row.low ? 1 : 0),
      expiringSoon: sum.expiringSoon + (row.expiringSoon ? 1 : 0),
      expired: sum.expired + (row.expired ? 1 : 0),
    }),
    { value: 0, low: 0, expiringSoon: 0, expired: 0 },
  );
}

// ---- Validasi formulir (diulang di server) ------------------------------------------------------

export type StockItemInput = {
  code: string;
  name: string;
  kind: StockItemKindValue;
  unit: string;
  sellPrice: number | null;
  minStock: number;
  notes: string;
};
export type ValidStockItem = Omit<StockItemInput, "notes"> & { notes: string | null };

export function validateStockItem(raw: unknown): Validation<ValidStockItem> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  const code = cleanText(raw.code)?.toUpperCase() ?? null;
  const name = cleanText(raw.name);
  const unit = cleanText(raw.unit);
  const notes = cleanText(raw.notes);
  if (code === null || name === null || unit === null || notes === null) return fail(INVALID_FORM);
  if (!code) return fail("Isi kode barang.");
  if (!CODE_PATTERN.test(code)) return fail("Kode hanya huruf, angka, dan tanda hubung, paling banyak 30 karakter.");
  if (!name) return fail("Isi nama barang.");
  if (name.length > 120) return fail("Nama barang paling banyak 120 karakter.");
  if (raw.kind !== "OBAT" && raw.kind !== "PRODUK") return fail("Pilih jenis barang.");
  if (!unit) return fail("Isi satuan, mis. tablet atau botol.");
  if (unit.length > 30) return fail("Satuan paling banyak 30 karakter.");
  const sellPrice = raw.sellPrice === null || raw.sellPrice === undefined ? null : raw.sellPrice;
  if (sellPrice !== null && !isWhole(sellPrice, 0, MAX_AMOUNT)) return fail("Harga jual tidak sah.");
  if (!isWhole(raw.minStock, 0, MAX_QUANTITY)) return fail("Batas menipis harus bilangan bulat 0 atau lebih.");
  if (notes.length > 500) return fail("Catatan paling banyak 500 karakter.");
  return {
    ok: true,
    value: { code, name, kind: raw.kind, unit, sellPrice, minStock: raw.minStock, notes: notes || null },
  };
}

export type SupplierInput = { name: string; phone: string; address: string; notes: string };
export type ValidSupplier = { name: string; phone: string | null; address: string | null; notes: string | null };

export function validateSupplier(raw: unknown): Validation<ValidSupplier> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  const name = cleanText(raw.name);
  const phone = cleanText(raw.phone);
  const address = cleanText(raw.address);
  const notes = cleanText(raw.notes);
  if (name === null || phone === null || address === null || notes === null) return fail(INVALID_FORM);
  if (!name) return fail("Isi nama supplier.");
  if (name.length > 120) return fail("Nama supplier paling banyak 120 karakter.");
  if (phone.length > 30) return fail("Nomor telepon paling banyak 30 karakter.");
  if (address.length > 300) return fail("Alamat paling banyak 300 karakter.");
  if (notes.length > 500) return fail("Catatan paling banyak 500 karakter.");
  return { ok: true, value: { name, phone: phone || null, address: address || null, notes: notes || null } };
}

export type PurchaseLineInput = { itemId: string; quantity: number; unitCost: number; batchNumber: string; expiryDate: string };
export type PurchaseInput = {
  supplierId: string;
  branchId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  notes: string;
  lines: PurchaseLineInput[];
};
export type ValidPurchaseLine = {
  itemId: string;
  quantity: number;
  unitCost: number;
  batchNumber: string | null;
  expiryDate: string | null;
};
export type ValidPurchase = {
  supplierId: string;
  branchId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  notes: string | null;
  lines: ValidPurchaseLine[];
  total: number;
};

/**
 * Barang masuk (spec stok 5.2). `kindOf` mengembalikan jenis barang yang aktif, atau null bila
 * barangnya tidak ada atau nonaktif.
 */
export function validatePurchase(
  raw: unknown,
  ctx: { today: string; kindOf: (itemId: string) => StockItemKindValue | null },
): Validation<ValidPurchase> {
  if (!isObject(raw)) return fail(INVALID_PURCHASE);
  if (typeof raw.supplierId !== "string" || !raw.supplierId) return fail("Pilih supplier.");
  if (typeof raw.branchId !== "string" || !raw.branchId) return fail("Pilih cabang penerima.");
  const invoiceNumber = cleanText(raw.invoiceNumber);
  const notes = cleanText(raw.notes);
  if (invoiceNumber === null || notes === null) return fail(INVALID_PURCHASE);
  if (!invoiceNumber) return fail("Isi nomor faktur.");
  if (invoiceNumber.length > 60) return fail("Nomor faktur paling banyak 60 karakter.");
  if (!isDateString(raw.invoiceDate)) return fail("Isi tanggal faktur.");
  if (raw.invoiceDate > ctx.today) return fail("Tanggal faktur tidak boleh di masa depan.");
  if (!isDateString(raw.dueDate)) return fail("Isi tanggal jatuh tempo.");
  if (raw.dueDate < raw.invoiceDate) return fail("Jatuh tempo tidak boleh sebelum tanggal faktur.");
  if (notes.length > 500) return fail("Catatan paling banyak 500 karakter.");
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) return fail("Tambahkan minimal satu barang.");
  if (raw.lines.length > MAX_PURCHASE_LINES) return fail("Paling banyak 100 baris per faktur.");

  const lines: ValidPurchaseLine[] = [];
  let total = 0;
  for (const [index, line] of raw.lines.entries()) {
    const n = index + 1;
    if (!isObject(line)) return fail(INVALID_PURCHASE);
    const kind = typeof line.itemId === "string" ? ctx.kindOf(line.itemId) : null;
    if (kind === null) return fail(`Baris ${n}: pilih barang yang aktif.`);
    if (!isWhole(line.quantity, 1, MAX_QUANTITY)) return fail(`Baris ${n}: jumlah harus bilangan bulat lebih dari 0.`);
    if (!isWhole(line.unitCost, 0, MAX_AMOUNT)) return fail(`Baris ${n}: harga beli tidak sah.`);
    const batchNumber = cleanText(line.batchNumber);
    if (batchNumber === null) return fail(INVALID_PURCHASE);
    if (batchNumber.length > 60) return fail(`Baris ${n}: nomor batch paling banyak 60 karakter.`);
    const rawExpiry = line.expiryDate === undefined || line.expiryDate === null ? "" : line.expiryDate;
    let expiryDate: string | null = null;
    if (rawExpiry !== "") {
      if (!isDateString(rawExpiry)) return fail(`Baris ${n}: tanggal kedaluwarsa tidak sah.`);
      expiryDate = rawExpiry;
    }
    if (kind === "OBAT" && expiryDate === null) return fail(`Baris ${n}: isi tanggal kedaluwarsa obat.`);
    if (expiryDate !== null && expiryDate < ctx.today) return fail(`Baris ${n}: barang ini sudah kedaluwarsa.`);
    total += line.quantity * line.unitCost;
    if (total > MAX_AMOUNT) return fail("Total faktur terlalu besar.");
    lines.push({
      itemId: line.itemId as string,
      quantity: line.quantity,
      unitCost: line.unitCost,
      batchNumber: batchNumber || null,
      expiryDate,
    });
  }
  return {
    ok: true,
    value: {
      supplierId: raw.supplierId,
      branchId: raw.branchId,
      invoiceNumber,
      invoiceDate: raw.invoiceDate,
      dueDate: raw.dueDate,
      notes: notes || null,
      lines,
      total,
    },
  };
}

export type AdjustmentInput = {
  batchId: string;
  direction: "KURANGI" | "TAMBAH";
  quantity: number;
  reason: AdjustReasonValue;
  note: string;
};
export type ValidAdjustment = { batchId: string; delta: number; reason: AdjustReasonValue; note: string | null };

/** Penyesuaian stok (spec stok 5.4): arah menentukan tanda jumlah dan alasan yang boleh. */
export function validateAdjustment(raw: unknown): Validation<ValidAdjustment> {
  if (!isObject(raw) || typeof raw.batchId !== "string" || !raw.batchId) return fail(INVALID_FORM);
  if (raw.direction !== "KURANGI" && raw.direction !== "TAMBAH") return fail(INVALID_FORM);
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  const allowed = raw.direction === "KURANGI" ? DECREASE_REASONS : INCREASE_REASONS;
  if (!(allowed as readonly unknown[]).includes(raw.reason)) return fail("Pilih alasan penyesuaian.");
  const reason = raw.reason as AdjustReasonValue;
  const note = cleanText(raw.note);
  if (note === null) return fail(INVALID_FORM);
  if (note.length > 500) return fail("Catatan paling banyak 500 karakter.");
  if ((reason === "LAINNYA" || reason === "SELISIH_HITUNG") && !note) return fail("Isi catatan untuk alasan ini.");
  return {
    ok: true,
    value: { batchId: raw.batchId, delta: raw.direction === "KURANGI" ? -raw.quantity : raw.quantity, reason, note: note || null },
  };
}

export type ReturnInput = { invoiceId: string; lines: { batchId: string; quantity: number }[]; note: string };
export type ValidReturn = { invoiceId: string; lines: { batchId: string; quantity: number }[]; note: string | null };

/** Retur ke supplier (spec stok 5.5). Batas sisa batch diperiksa server di dalam transaksi. */
export function validateReturn(raw: unknown): Validation<ValidReturn> {
  if (!isObject(raw) || typeof raw.invoiceId !== "string" || !raw.invoiceId) return fail(INVALID_FORM);
  if (!Array.isArray(raw.lines) || raw.lines.length > MAX_PURCHASE_LINES) return fail(INVALID_FORM);
  if (raw.lines.length === 0) return fail("Pilih minimal satu barang untuk diretur.");
  const seen = new Set<string>();
  const lines: { batchId: string; quantity: number }[] = [];
  for (const line of raw.lines) {
    if (!isObject(line) || typeof line.batchId !== "string" || !line.batchId) return fail(INVALID_FORM);
    if (!isWhole(line.quantity, 1, MAX_QUANTITY)) return fail("Jumlah retur harus bilangan bulat lebih dari 0.");
    if (seen.has(line.batchId)) return fail("Batch yang sama dipilih dua kali.");
    seen.add(line.batchId);
    lines.push({ batchId: line.batchId, quantity: line.quantity });
  }
  const note = cleanText(raw.note);
  if (note === null) return fail(INVALID_FORM);
  if (note.length > 500) return fail("Catatan paling banyak 500 karakter.");
  return { ok: true, value: { invoiceId: raw.invoiceId, lines, note: note || null } };
}

export type PaymentInput = {
  invoiceId: string;
  kind: SupplierPaymentKindValue;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  reference: string;
};
export type ValidPayment = Omit<PaymentInput, "reference"> & { reference: string | null };

/**
 * Pembayaran atau pengembalian dana (spec stok 6.2–6.3). `limit` = sisa hutang (BAYAR) atau
 * kredit dari supplier (PENGEMBALIAN), dihitung server di dalam transaksi yang mengunci faktur.
 */
export function validatePayment(raw: unknown, ctx: { today: string; invoiceDate: string; limit: number }): Validation<ValidPayment> {
  if (!isObject(raw) || typeof raw.invoiceId !== "string" || !raw.invoiceId) return fail(INVALID_FORM);
  if (raw.kind !== "BAYAR" && raw.kind !== "PENGEMBALIAN") return fail(INVALID_FORM);
  const kind = raw.kind;
  if (ctx.limit <= 0) {
    return fail(kind === "BAYAR" ? "Faktur ini tidak punya sisa hutang." : "Faktur ini tidak punya kredit dari supplier.");
  }
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail("Nominal harus bilangan bulat lebih dari 0.");
  if (raw.amount > ctx.limit) {
    return fail(
      kind === "BAYAR"
        ? `Nominal melebihi sisa hutang (${formatRupiah(ctx.limit)}).`
        : `Nominal melebihi kredit dari supplier (${formatRupiah(ctx.limit)}).`,
    );
  }
  if (!(PAYMENT_METHODS as unknown[]).includes(raw.method)) return fail("Pilih metode pembayaran.");
  if (!isDateString(raw.paidAt)) return fail("Isi tanggal bayar.");
  if (raw.paidAt > ctx.today) return fail("Tanggal bayar tidak boleh di masa depan.");
  if (raw.paidAt < ctx.invoiceDate) return fail("Tanggal bayar tidak boleh sebelum tanggal faktur.");
  const reference = cleanText(raw.reference);
  if (reference === null) return fail(INVALID_FORM);
  if (reference.length > 100) return fail("Referensi paling banyak 100 karakter.");
  return {
    ok: true,
    value: {
      invoiceId: raw.invoiceId,
      kind,
      amount: raw.amount,
      method: raw.method as PaymentMethodValue,
      paidAt: raw.paidAt,
      reference: reference || null,
    },
  };
}

/** Alasan wajib untuk batal faktur, batal pembayaran, dan ubah jatuh tempo. */
export function validateReason(raw: unknown): Validation<string> {
  const reason = cleanText(raw);
  if (!reason) return fail("Isi alasan.");
  if (reason.length > 300) return fail("Alasan paling banyak 300 karakter.");
  return { ok: true, value: reason };
}

export function validateDueDateChange(raw: unknown, invoiceDate: string): Validation<string> {
  if (!isDateString(raw)) return fail("Isi tanggal jatuh tempo.");
  if (raw < invoiceDate) return fail("Jatuh tempo tidak boleh sebelum tanggal faktur.");
  return { ok: true, value: raw };
}
