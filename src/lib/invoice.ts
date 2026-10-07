import { formatRupiah } from "./format";
import {
  dateOnlyString,
  isDateString,
  MAX_AMOUNT,
  MAX_QUANTITY,
  PAYMENT_METHODS,
  type PaymentMethodValue,
  type Validation,
} from "./stock";

// Aturan murni tagihan (spec tagihan 3.2). Dipakai server dan browser; tanpa akses basis data.

export type InvoiceStatusValue = "DRAF" | "FINAL" | "DIBATALKAN";
export type InvoiceLineKindValue = "LAYANAN" | "TREATMENT" | "BARANG";
export type DiscountKindValue = "NOMINAL" | "PERSEN";
export type InvoiceDisplayStatus = "DRAF" | "BELUM_DIBAYAR" | "SEBAGIAN" | "LUNAS" | "DIBATALKAN";
export type InvoiceView = "PERLU_DITAGIH" | "DRAF" | "BELUM_LUNAS" | "LUNAS" | "DIBATALKAN";

/** Batas diskon yang boleh diberikan resepsionis, dalam persen dari subtotal (spec TG9). */
export const DISCOUNT_LIMIT_PERCENT = 20;
/** Kunjungan final lebih lama dari ini tidak lagi masuk "Perlu ditagih". */
export const BILLABLE_DAYS = 30;

export const INVOICE_STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
  DRAF: "Draf",
  BELUM_DIBAYAR: "Belum dibayar",
  SEBAGIAN: "Sebagian",
  LUNAS: "Lunas",
  DIBATALKAN: "Dibatalkan",
};
export const INVOICE_VIEW_LABEL: Record<InvoiceView, string> = {
  PERLU_DITAGIH: "Perlu ditagih",
  DRAF: "Draf",
  BELUM_LUNAS: "Belum lunas",
  LUNAS: "Lunas",
  DIBATALKAN: "Dibatalkan",
};
export const INVOICE_VIEWS = Object.keys(INVOICE_VIEW_LABEL) as InvoiceView[];
export const INVOICE_LINE_KIND_LABEL: Record<InvoiceLineKindValue, string> = {
  LAYANAN: "Layanan",
  TREATMENT: "Treatment",
  BARANG: "Barang",
};
export const DISCOUNT_KIND_LABEL: Record<DiscountKindValue, string> = { NOMINAL: "Nominal", PERSEN: "Persen" };

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : null;
}

// ---- Hitung ------------------------------------------------------------------------------

export function invoiceSubtotal(lines: readonly { quantity: number; unitPrice: number }[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

/** Diskon dalam rupiah: persen dibulatkan ke bawah, nominal tidak melebihi subtotal. */
export function discountAmount(subtotal: number, kind: DiscountKindValue | null, value: number): number {
  if (!kind || value <= 0) return 0;
  return kind === "PERSEN" ? Math.floor((subtotal * Math.min(value, 100)) / 100) : Math.min(value, subtotal);
}

/** Diskon terbesar yang boleh diberikan resepsionis. */
export function discountLimit(subtotal: number): number {
  return Math.floor((subtotal * DISCOUNT_LIMIT_PERCENT) / 100);
}

export type InvoiceInput = {
  status: InvoiceStatusValue;
  discountKind: DiscountKindValue | null;
  discountValue: number;
  lines: readonly { quantity: number; unitPrice: number }[];
  payments: readonly { amount: number; revokedAt: Date | null }[];
};

export type InvoiceTotals = {
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  /** Sisa yang harus dibayar; 0 untuk tagihan dibatalkan. */
  balance: number;
  display: InvoiceDisplayStatus;
};

/** Total, dibayar, sisa, dan status tampil (spec tagihan 3.2). Pembayaran yang dibatalkan tidak dihitung. */
export function invoiceTotals(invoice: InvoiceInput): InvoiceTotals {
  const subtotal = invoiceSubtotal(invoice.lines);
  const discount = discountAmount(subtotal, invoice.discountKind, invoice.discountValue);
  const total = subtotal - discount;
  const paid = invoice.payments.reduce((sum, payment) => (payment.revokedAt ? sum : sum + payment.amount), 0);
  if (invoice.status === "DIBATALKAN") return { subtotal, discount, total, paid, balance: 0, display: "DIBATALKAN" };
  const balance = total - paid;
  if (invoice.status === "DRAF") return { subtotal, discount, total, paid, balance, display: "DRAF" };
  const display = balance <= 0 ? "LUNAS" : paid > 0 ? "SEBAGIAN" : "BELUM_DIBAYAR";
  return { subtotal, discount, total, paid, balance, display };
}

/** "TG-2026-0001". */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `TG-${year}-${String(sequence).padStart(4, "0")}`;
}

export function isInvoiceView(value: unknown): value is InvoiceView {
  return typeof value === "string" && (INVOICE_VIEWS as string[]).includes(value);
}

/** Saringan daftar tagihan; "Perlu ditagih" bukan tagihan sehingga tidak pernah cocok di sini. */
export function matchesInvoiceView(row: { display: InvoiceDisplayStatus }, view: InvoiceView): boolean {
  switch (view) {
    case "DRAF":
      return row.display === "DRAF";
    case "BELUM_LUNAS":
      return row.display === "BELUM_DIBAYAR" || row.display === "SEBAGIAN";
    case "LUNAS":
      return row.display === "LUNAS";
    case "DIBATALKAN":
      return row.display === "DIBATALKAN";
    case "PERLU_DITAGIH":
      return false;
  }
}

// ---- FEFO ---------------------------------------------------------------------------------

export type BatchStock = { id: string; quantityRemaining: number; expiryDate: Date | null; createdAt: Date };
export type FefoPlan = { ok: true; takes: { batchId: string; quantity: number }[] } | { ok: false; available: number };

/**
 * Rencana pengambilan stok: batch tercepat kedaluwarsa dulu (tanpa kedaluwarsa paling akhir),
 * lalu yang lebih dulu masuk. Batch kosong dan yang sudah kedaluwarsa tidak dipakai.
 */
export function fefoPlan(batches: readonly BatchStock[], quantity: number, today: string): FefoPlan {
  const usable = batches
    .filter((batch) => batch.quantityRemaining > 0 && !(batch.expiryDate && dateOnlyString(batch.expiryDate) < today))
    .sort((a, b) => {
      const ae = a.expiryDate ? dateOnlyString(a.expiryDate) : "9999-12-31";
      const be = b.expiryDate ? dateOnlyString(b.expiryDate) : "9999-12-31";
      return ae.localeCompare(be) || a.createdAt.getTime() - b.createdAt.getTime();
    });
  const available = usable.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
  if (available < quantity) return { ok: false, available };
  const takes: { batchId: string; quantity: number }[] = [];
  let left = quantity;
  for (const batch of usable) {
    if (left === 0) break;
    const take = Math.min(left, batch.quantityRemaining);
    takes.push({ batchId: batch.id, quantity: take });
    left -= take;
  }
  return { ok: true, takes };
}

// ---- Isi tagihan dari kunjungan ----------------------------------------------------------------

export type DraftLine = {
  kind: InvoiceLineKindValue;
  name: string;
  quantity: number;
  unitPrice: number;
  serviceId: string | null;
  encounterTreatmentId: string | null;
};

/**
 * Baris draf dari kunjungan final (spec tagihan 3.3): konsultasi (kecuali Konsultasi Online yang
 * sudah lunas di muka) dan satu baris per treatment. Harga kosong menjadi Rp 0 yang bisa diedit.
 */
export function visitLines(input: {
  online: boolean;
  service: { id: string; name: string; price: number | null } | null;
  treatments: { id: string; serviceId: string; name: string; price: number | null }[];
}): DraftLine[] {
  const lines: DraftLine[] = [];
  if (input.service && !input.online) {
    lines.push({
      kind: "LAYANAN",
      name: input.service.name,
      quantity: 1,
      unitPrice: input.service.price ?? 0,
      serviceId: input.service.id,
      encounterTreatmentId: null,
    });
  }
  for (const treatment of input.treatments) {
    lines.push({
      kind: "TREATMENT",
      name: treatment.name,
      quantity: 1,
      unitPrice: treatment.price ?? 0,
      serviceId: treatment.serviceId,
      encounterTreatmentId: treatment.id,
    });
  }
  return lines;
}

// ---- Validasi formulir (diulang di server) -----------------------------------------------------

export type FreeLineInput = { kind: "LAYANAN" | "TREATMENT"; name: string; quantity: number; unitPrice: number };

export function validateFreeLine(raw: unknown): Validation<FreeLineInput> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (raw.kind !== "LAYANAN" && raw.kind !== "TREATMENT") return fail("Pilih jenis baris.");
  const name = cleanText(raw.name);
  if (name === null) return fail(INVALID_FORM);
  if (!name) return fail("Isi nama baris.");
  if (name.length > 120) return fail("Nama baris paling banyak 120 karakter.");
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  if (!isWhole(raw.unitPrice, 0, MAX_AMOUNT)) return fail("Harga tidak sah.");
  return { ok: true, value: { kind: raw.kind, name, quantity: raw.quantity, unitPrice: raw.unitPrice } };
}

export type ItemAddInput = { itemId: string; quantity: number };

export function validateItemAdd(raw: unknown): Validation<ItemAddInput> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (typeof raw.itemId !== "string" || !raw.itemId) return fail("Pilih barang.");
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  return { ok: true, value: { itemId: raw.itemId, quantity: raw.quantity } };
}

export type LineEditInput = { quantity: number; unitPrice: number; priceNote: string };
export type ValidLineEdit = { quantity: number; unitPrice: number; priceNote: string | null };

/** Mengubah baris draf. `needsNote`: baris berasal dari katalog dan harganya berbeda dari harga katalog. */
export function validateLineEdit(raw: unknown, ctx: { needsNote: boolean }): Validation<ValidLineEdit> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  if (!isWhole(raw.unitPrice, 0, MAX_AMOUNT)) return fail("Harga tidak sah.");
  const note = cleanText(raw.priceNote);
  if (note === null) return fail(INVALID_FORM);
  if (note.length > 200) return fail("Catatan harga paling banyak 200 karakter.");
  if (ctx.needsNote && !note) return fail("Isi catatan alasan perubahan harga.");
  return { ok: true, value: { quantity: raw.quantity, unitPrice: raw.unitPrice, priceNote: note || null } };
}

export type DiscountInput = { kind: DiscountKindValue | null; value: number; reason: string };
export type ValidDiscount = { kind: DiscountKindValue | null; value: number; reason: string | null };

/**
 * Diskon tagihan (spec tagihan 3.2, TG9). Jenis kosong atau nilai 0 menghapus diskon.
 * `canExceed`: pelaku boleh memberi diskon di atas batas resepsionis (Admin Keuangan, Super Admin).
 */
export function validateDiscount(raw: unknown, ctx: { subtotal: number; canExceed: boolean }): Validation<ValidDiscount> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  const kind = raw.kind === "NOMINAL" || raw.kind === "PERSEN" ? raw.kind : null;
  if (raw.kind !== null && raw.kind !== undefined && kind === null) return fail(INVALID_FORM);
  const value = raw.value;
  if (kind === null || value === 0) return { ok: true, value: { kind: null, value: 0, reason: null } };
  if (kind === "PERSEN" && !isWhole(value, 1, 100)) return fail("Persen diskon harus 1 sampai 100.");
  if (kind === "NOMINAL" && !isWhole(value, 1, MAX_AMOUNT)) return fail("Nominal diskon harus bilangan bulat lebih dari 0.");
  const amount = value as number;
  if (kind === "NOMINAL" && amount > ctx.subtotal) return fail("Nominal diskon tidak boleh melebihi subtotal.");
  const reason = cleanText(raw.reason);
  if (reason === null) return fail(INVALID_FORM);
  if (!reason) return fail("Isi alasan diskon.");
  if (reason.length > 300) return fail("Alasan paling banyak 300 karakter.");
  if (!ctx.canExceed && discountAmount(ctx.subtotal, kind, amount) > discountLimit(ctx.subtotal)) {
    return fail(`Diskon di atas ${DISCOUNT_LIMIT_PERCENT}% diberikan oleh Admin Keuangan.`);
  }
  return { ok: true, value: { kind, value: amount, reason } };
}

export type InvoicePaymentInput = {
  invoiceId: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  reference: string;
};
export type ValidInvoicePayment = Omit<InvoicePaymentInput, "reference"> & { reference: string | null };

/**
 * Pembayaran customer (spec tagihan 4.4). `limit` = sisa tagihan saat ini, dihitung server
 * setelah tagihan dikunci; `finalizedDate` = tanggal WITA tagihan difinalkan.
 */
export function validateInvoicePayment(
  raw: unknown,
  ctx: { today: string; finalizedDate: string; limit: number },
): Validation<ValidInvoicePayment> {
  if (!isObject(raw) || typeof raw.invoiceId !== "string" || !raw.invoiceId) return fail(INVALID_FORM);
  if (ctx.limit <= 0) return fail("Tagihan ini tidak punya sisa.");
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail("Nominal harus bilangan bulat lebih dari 0.");
  if (raw.amount > ctx.limit) return fail(`Nominal melebihi sisa tagihan (${formatRupiah(ctx.limit)}).`);
  if (!(PAYMENT_METHODS as unknown[]).includes(raw.method)) return fail("Pilih metode pembayaran.");
  if (!isDateString(raw.paidAt)) return fail("Isi tanggal bayar.");
  if (raw.paidAt > ctx.today) return fail("Tanggal bayar tidak boleh di masa depan.");
  if (raw.paidAt < ctx.finalizedDate) return fail("Tanggal bayar tidak boleh sebelum tagihan difinalkan.");
  const reference = cleanText(raw.reference);
  if (reference === null) return fail(INVALID_FORM);
  if (reference.length > 100) return fail("Referensi paling banyak 100 karakter.");
  return {
    ok: true,
    value: {
      invoiceId: raw.invoiceId,
      amount: raw.amount,
      method: raw.method as PaymentMethodValue,
      paidAt: raw.paidAt,
      reference: reference || null,
    },
  };
}
