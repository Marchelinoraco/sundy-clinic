"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { discountAmount, invoiceSubtotal, invoiceTotals, validateDiscount, validateInvoicePayment, type DiscountKindValue, type InvoicePaymentInput } from "@/lib/invoice";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, PAYMENT_METHOD_LABEL, validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { lockInvoiceRow, TOTALS_SELECT } from "@/server/invoice-store";
import { requireCapability } from "@/server/session";

function revalidatePayments(invoiceId: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

/**
 * Catat pembayaran customer (spec tagihan 4.4). Batasnya sisa tagihan saat ini, dihitung setelah
 * tagihan dikunci: dua pembayaran bersamaan tidak bisa sama-sama melunasi.
 */
export async function recordInvoicePayment(input: InvoicePaymentInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const today = witaDateString(new Date());

    const result = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { number: true, finalizedAt: true, patient: { select: { name: true } }, ...TOTALS_SELECT },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status !== "FINAL" || !invoice.finalizedAt) throw new UserFacingError("Tagihan ini belum final atau sudah dibatalkan.");
      const { balance } = invoiceTotals(invoice);
      const checked = validateInvoicePayment(input, { today, finalizedDate: witaDateString(invoice.finalizedAt), limit: balance });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const payment = checked.value;
      const created = await tx.invoicePayment.create({
        data: {
          invoiceId,
          amount: payment.amount,
          method: payment.method,
          paidAt: dateOnly(payment.paidAt),
          reference: payment.reference,
          staffId: actor.staffId,
          staffName: actor.name,
        },
        select: { id: true },
      });
      return { id: created.id, summary: `${invoice.number} ${invoice.patient.name}: ${formatRupiah(payment.amount)} (${PAYMENT_METHOD_LABEL[payment.method]})` };
    });

    await recordAudit({ actor, action: "invoice-payment.create", entity: "InvoicePayment", entityId: result.id, summary: result.summary });
    revalidatePayments(invoiceId);
    return { id: result.id };
  });
}

/** Batalkan pembayaran salah input (spec tagihan 5): tidak dihapus, ditandai dibatalkan beserta alasannya. */
export async function revokeInvoicePayment(input: { paymentId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:correct");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.paymentId ?? "");
    const payment = await prisma.invoicePayment.findUnique({
      where: { id },
      select: { invoiceId: true, amount: true, invoice: { select: { number: true } } },
    });
    if (!payment) throw new UserFacingError("Pembayaran tidak ditemukan.");

    await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, payment.invoiceId);
      const { count } = await tx.invoicePayment.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date(), revokedByName: actor.name, revokeReason: reason.value },
      });
      if (count === 0) throw new UserFacingError("Pembayaran ini sudah dibatalkan.");
    });

    await recordAudit({
      actor,
      action: "invoice-payment.revoke",
      entity: "InvoicePayment",
      entityId: id,
      summary: `${payment.invoice.number}: ${formatRupiah(payment.amount)} (${reason.value})`,
    });
    revalidatePayments(payment.invoiceId);
  });
}

/**
 * Tambah diskon di tagihan final yang belum lunas (spec tagihan 5): hanya menambah, dan total tidak
 * boleh turun di bawah yang sudah dibayar. Diskon yang membuat sisa 0 melunasi tagihan.
 */
export async function applyFinalDiscount(input: {
  invoiceId: string;
  kind: DiscountKindValue;
  value: number;
  reason: string;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:correct");
    const invoiceId = String(input?.invoiceId ?? "");

    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { number: true, ...TOTALS_SELECT },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status !== "FINAL") throw new UserFacingError("Diskon sesudah final hanya untuk tagihan yang sudah final.");
      const totals = invoiceTotals(invoice);
      if (totals.display === "LUNAS") throw new UserFacingError("Tagihan ini sudah lunas.");

      const subtotal = invoiceSubtotal(invoice.lines);
      const checked = validateDiscount(input, { subtotal, canExceed: true });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const discount = checked.value;
      if (!discount.kind) throw new UserFacingError("Pilih jenis dan nilai diskon.");
      const amount = discountAmount(subtotal, discount.kind, discount.value);
      if (amount <= totals.discount) throw new UserFacingError("Diskon sesudah final hanya bisa ditambah.");
      if (subtotal - amount < totals.paid) throw new UserFacingError("Diskon membuat total di bawah yang sudah dibayar.");

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { discountKind: discount.kind, discountValue: discount.value, discountReason: discount.reason, discountByName: actor.name },
      });
      return `${invoice.number}: diskon ${discount.value}${discount.kind === "PERSEN" ? "%" : ""} sesudah final (${discount.reason})`;
    });

    await recordAudit({ actor, action: "invoice.discount", entity: "Invoice", entityId: invoiceId, summary });
    revalidatePayments(invoiceId);
  });
}
