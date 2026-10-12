import { CLINIC_NAME } from "./clinic";
import { formatDateWithYear, formatRupiah } from "./format";
import { invoiceTotals, type DiscountKindValue, type InvoiceStatusValue } from "./invoice";
import { firstName } from "./quiz-link";
import { dateOnlyString, type PaymentMethodValue } from "./stock";
import { minutesToTimeLabel, witaMinutesOfDay } from "./time";

// Struk tagihan (spec struk WA 5–7). Murni: dipakai halaman /struk, cetak browser, dan ESC/POS.

export type ReceiptLine = { name: string; quantity: number; unitPrice: number; amount: number };
export type ReceiptPayment = { paidAt: string; method: PaymentMethodValue; amount: number };
export type ReceiptStatus = "LUNAS" | "SEBAGIAN" | "BELUM_DIBAYAR";

/** Hanya yang tertulis di struk kasir biasa: tanpa nomor WA, NIK, nomor RM, alamat, atau catatan (spec 6). */
export type PublicReceipt = {
  clinicName: string;
  branchName: string;
  branchAddress: string;
  number: string;
  finalizedAt: Date;
  cashierName: string;
  customerName: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  payments: ReceiptPayment[];
  status: ReceiptStatus;
};

export type PublicReceiptPage = { state: "VALID"; receipt: PublicReceipt } | { state: "CANCELLED" } | { state: "INVALID" };

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  LUNAS: "LUNAS",
  SEBAGIAN: "DIBAYAR SEBAGIAN",
  BELUM_DIBAYAR: "BELUM DIBAYAR",
};
export const RECEIPT_INVALID_TEXT = "Tautan struk tidak berlaku.";
export const RECEIPT_CANCELLED_TEXT = "Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan.";

export type ReceiptSource = {
  number: string | null;
  status: InvoiceStatusValue;
  finalizedAt: Date | null;
  finalizedByName: string | null;
  discountKind: DiscountKindValue | null;
  discountValue: number;
  patient: { name: string };
  branch: { name: string; address: string };
  lines: readonly { name: string; quantity: number; unitPrice: number }[];
  payments: readonly { amount: number; method: PaymentMethodValue; paidAt: Date; revokedAt: Date | null }[];
};

/** Struk tagihan final; null untuk draf dan dibatalkan. Kolom dipilih satu per satu, bukan disalin. */
export function buildPublicReceipt(source: ReceiptSource): PublicReceipt | null {
  if (source.status !== "FINAL" || !source.number || !source.finalizedAt) return null;
  const totals = invoiceTotals(source);
  return {
    clinicName: CLINIC_NAME,
    branchName: source.branch.name,
    branchAddress: source.branch.address,
    number: source.number,
    finalizedAt: source.finalizedAt,
    cashierName: source.finalizedByName ?? "-",
    customerName: source.patient.name,
    lines: source.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.quantity * line.unitPrice,
    })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    paid: totals.paid,
    balance: Math.max(0, totals.balance),
    payments: source.payments
      .filter((payment) => !payment.revokedAt)
      .map((payment) => ({ paidAt: dateOnlyString(payment.paidAt), method: payment.method, amount: payment.amount })),
    status: totals.display === "LUNAS" ? "LUNAS" : totals.display === "SEBAGIAN" ? "SEBAGIAN" : "BELUM_DIBAYAR",
  };
}

/** "12 Okt 2026 pukul 18.46" (WITA). */
export function formatReceiptDateTime(date: Date): string {
  return `${formatDateWithYear(date)} pukul ${minutesToTimeLabel(witaMinutesOfDay(date))}`;
}

/** Pesan WhatsApp struk (spec 5). */
export function receiptMessageText(input: { customerName: string; number: string; total: number; balance: number; url: string }): string {
  const status = input.balance > 0 ? `sisa ${formatRupiah(input.balance)}` : "LUNAS";
  return [
    `Halo ${firstName(input.customerName)}, terima kasih sudah berkunjung ke ${CLINIC_NAME}.`,
    `No. tagihan: ${input.number}`,
    `Total: ${formatRupiah(input.total)} (${status})`,
    `Lihat struk lengkap: ${input.url}`,
  ].join("\n");
}
