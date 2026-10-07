"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import {
  dateLabel,
  dateOnly,
  dateOnlyString,
  PAYMENT_METHOD_LABEL,
  payableSummary,
  validateDueDateChange,
  validatePayment,
  validateReason,
  type PaymentInput,
} from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { lockInvoice, PAYABLE_SELECT } from "@/server/stock-store";

function revalidatePayable(invoiceId: string) {
  safeRevalidatePath("/admin/hutang");
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/stok/masuk/${invoiceId}`);
}

/**
 * Catat pembayaran (BAYAR) atau pengembalian dana dari supplier (PENGEMBALIAN), spec stok 6.2–6.3.
 * Batasnya sisa hutang atau kredit saat ini, dihitung setelah faktur dikunci: dua pembayaran
 * bersamaan tidak bisa sama-sama melunasi.
 */
export async function recordSupplierPayment(input: PaymentInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("payable:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const today = witaDateString(new Date());

    const result = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, invoiceId);
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        select: { invoiceNumber: true, invoiceDate: true, supplier: { select: { name: true } }, ...PAYABLE_SELECT },
      });
      if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
      if (invoice.cancelledAt) throw new UserFacingError("Faktur yang dibatalkan tidak punya hutang.");
      const { balance } = payableSummary(invoice, today);
      const limit = input?.kind === "PENGEMBALIAN" ? Math.max(-balance, 0) : Math.max(balance, 0);
      const checked = validatePayment(input, { today, invoiceDate: dateOnlyString(invoice.invoiceDate), limit });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const payment = checked.value;
      const created = await tx.supplierPayment.create({
        data: {
          invoiceId,
          kind: payment.kind,
          amount: payment.amount,
          method: payment.method,
          paidAt: dateOnly(payment.paidAt),
          reference: payment.reference,
          staffId: actor.staffId,
          staffName: actor.name,
        },
        select: { id: true },
      });
      return {
        id: created.id,
        kind: payment.kind,
        summary: `${invoice.supplier.name} ${invoice.invoiceNumber}: ${formatRupiah(payment.amount)} (${PAYMENT_METHOD_LABEL[payment.method]})`,
      };
    });

    await recordAudit({
      actor,
      action: result.kind === "BAYAR" ? "supplier-payment.create" : "supplier-refund.create",
      entity: "SupplierPayment",
      entityId: result.id,
      summary: result.summary,
    });
    revalidatePayable(invoiceId);
    return { id: result.id };
  });
}

/** Pembayaran salah input dibatalkan, tidak dihapus (spec stok 6.2). */
export async function revokeSupplierPayment(input: { paymentId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("payable:manage");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.paymentId ?? "");
    const payment = await prisma.supplierPayment.findUnique({
      where: { id },
      select: { invoiceId: true, amount: true, invoice: { select: { invoiceNumber: true, supplier: { select: { name: true } } } } },
    });
    if (!payment) throw new UserFacingError("Pembayaran tidak ditemukan.");

    await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, payment.invoiceId);
      const { count } = await tx.supplierPayment.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date(), revokedByName: actor.name, revokeReason: reason.value },
      });
      if (count === 0) throw new UserFacingError("Pembayaran ini sudah dibatalkan.");
    });

    await recordAudit({
      actor,
      action: "supplier-payment.revoke",
      entity: "SupplierPayment",
      entityId: id,
      summary: `${payment.invoice.supplier.name} ${payment.invoice.invoiceNumber}: ${formatRupiah(payment.amount)} (${reason.value})`,
    });
    revalidatePayable(payment.invoiceId);
  });
}

/** Ubah jatuh tempo (spec stok 6.2): beralasan, tidak sebelum tanggal faktur. */
export async function updateDueDate(input: { invoiceId: string; dueDate: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("payable:manage");
    const id = String(input?.invoiceId ?? "");
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      select: { invoiceNumber: true, invoiceDate: true, dueDate: true, cancelledAt: true },
    });
    if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
    if (invoice.cancelledAt) throw new UserFacingError("Faktur yang dibatalkan tidak bisa diubah.");
    const due = validateDueDateChange(input?.dueDate, dateOnlyString(invoice.invoiceDate));
    if (!due.ok) throw new UserFacingError(due.message);
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);

    await prisma.purchaseInvoice.update({ where: { id }, data: { dueDate: dateOnly(due.value) } });
    await recordAudit({
      actor,
      action: "purchase.update-due-date",
      entity: "PurchaseInvoice",
      entityId: id,
      summary: `${invoice.invoiceNumber}: ${dateLabel(dateOnlyString(invoice.dueDate))} → ${dateLabel(due.value)} (${reason.value})`,
    });
    revalidatePayable(id);
  });
}
