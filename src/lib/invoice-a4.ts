import { depositSummary } from "./deposit";
import { invoiceTotals } from "./invoice";
import type { ReceiptLine, ReceiptSource } from "./receipt";
import { dateLabel, dateOnlyString, PAYMENT_METHOD_LABEL, type PaymentMethodValue } from "./stock";

// Invoice A4 (spec invoice A4): kop surat, cap air status, setiap pembayaran, dan progres paket. Murni: dipakai halaman
// /invoice untuk pasien dan halaman cetak panel.

export type InvoiceA4Status = "LUNAS" | "DEPOSIT" | "BELUM_DIBAYAR" | "DIBATALKAN";
/** Teks cap air (IA3). */
export const INVOICE_A4_STAMP: Record<InvoiceA4Status, string> = {
  LUNAS: "LUNAS",
  DEPOSIT: "DEPOSIT",
  BELUM_DIBAYAR: "BELUM DIBAYAR",
  DIBATALKAN: "DIBATALKAN",
};

/** Satu isi paket per tanggal invoice (IA6): `used` sesi terpakai atau satuan diterima, `remaining` sisanya. */
export type InvoiceA4PackageItem = { name: string; unit: string | null; total: number; used: number; remaining: number };
/** `nextVisitOn` terisi hanya di invoice terbaru yang membeli atau memakai paket itu, dari rencana terkini (spec jadwal paket JP14). */
export type InvoiceA4Package = { name: string; expiresOn: string; items: InvoiceA4PackageItem[]; nextVisitOn: string | null };

export type InvoiceA4Source = Omit<ReceiptSource, "patient" | "payments" | "lines"> & {
  patient: { name: string; medicalRecordNumber: string };
  lines: readonly (ReceiptSource["lines"][number] & { unit: string | null })[];
  payments: readonly { amount: number; method: PaymentMethodValue; paidAt: Date; revokedAt: Date | null; destinationLabel: string | null }[];
};

export type InvoiceA4 = {
  branchName: string;
  branchAddress: string;
  number: string;
  finalizedAt: Date;
  cashierName: string;
  customerName: string;
  medicalRecordNumber: string;
  lines: (ReceiptLine & { unit: string | null })[];
  subtotal: number;
  itemDiscount: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  payments: { paidAt: string; text: string; amount: number }[];
  status: InvoiceA4Status;
  packages: InvoiceA4Package[];
  /** Potongan deposit dan catatan saldo baru (spec deposit D9). */
  bookingDeposit: number;
  saldoDeposit: number;
  depositNotes: string[];
};

/** "22 Okt 2026 · Transfer bank ke BCA … a.n. …" (IA4a, IA4b, IA12). */
export function paymentText(payment: { paidAt: string; method: PaymentMethodValue; destinationLabel: string | null }): string {
  const date = dateLabel(payment.paidAt);
  if (payment.method === "TRANSFER" && payment.destinationLabel) return `${date} · Transfer bank ke ${payment.destinationLabel}`;
  if (payment.method === "EDC" && payment.destinationLabel) return `${date} · EDC ${payment.destinationLabel}`;
  return `${date} · ${PAYMENT_METHOD_LABEL[payment.method]}`;
}

/** "1 dari 4 sesi terpakai · sisa 3" atau "7 dari 28 kapsul diterima · sisa 21" (IA5). */
export function packageItemText(item: InvoiceA4PackageItem): string {
  return item.unit
    ? `${item.used} dari ${item.total} ${item.unit} diterima · sisa ${item.remaining}`
    : `${item.used} dari ${item.total} sesi terpakai · sisa ${item.remaining}`;
}

/** Invoice A4 tagihan final atau dibatalkan; null untuk draf. Status dan pembayaran selalu terkini (IA6). */
export function buildInvoiceA4(source: InvoiceA4Source, packages: InvoiceA4Package[]): InvoiceA4 | null {
  if (source.status === "DRAF" || !source.number || !source.finalizedAt) return null;
  const totals = invoiceTotals(source);
  const deposit = depositSummary(source.depositUses, source.depositCredits);
  const status: InvoiceA4Status =
    totals.display === "DIBATALKAN" ? "DIBATALKAN" : totals.display === "LUNAS" ? "LUNAS" : totals.display === "SEBAGIAN" ? "DEPOSIT" : "BELUM_DIBAYAR";
  return {
    branchName: source.branch.name,
    branchAddress: source.branch.address,
    number: source.number,
    finalizedAt: source.finalizedAt,
    cashierName: source.finalizedByName ?? "-",
    customerName: source.patient.name,
    medicalRecordNumber: source.patient.medicalRecordNumber,
    lines: source.lines.map((line) => {
      const gross = line.quantity * line.unitPrice;
      return { name: line.name, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, gross, discount: line.discountAmount, amount: gross - line.discountAmount, note: line.note ?? null };
    }),
    subtotal: totals.grossSubtotal,
    itemDiscount: totals.itemDiscount,
    discount: totals.discount,
    total: totals.total,
    paid: totals.paid,
    balance: Math.max(0, totals.balance),
    payments: source.payments
      .filter((payment) => !payment.revokedAt)
      .map((payment) => {
        const paidAt = dateOnlyString(payment.paidAt);
        return { paidAt, text: paymentText({ paidAt, method: payment.method, destinationLabel: payment.destinationLabel }), amount: payment.amount };
      }),
    status,
    packages,
    bookingDeposit: deposit.booking,
    saldoDeposit: deposit.saldo,
    depositNotes: deposit.notes,
  };
}

/** Isi halaman /invoice (IA8, IA9): tagihan dibatalkan hanya menampilkan pesan, seperti struk. */
export type PublicInvoicePage = { state: "VALID"; invoice: InvoiceA4 } | { state: "CANCELLED" } | { state: "INVALID" };
