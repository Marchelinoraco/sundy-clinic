"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { approvedSuffix, type ApprovalInput } from "@/lib/approval";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { discountAmount, invoiceSubtotal, invoiceTotals, validateDiscount, validateInvoicePayment, type DiscountKindValue, type InvoicePaymentInput } from "@/lib/invoice";
import { formatBankAccount } from "@/lib/payment";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, PAYMENT_METHOD_LABEL, validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { lockPatient, recordOverpayment, releaseOverpayment } from "@/server/deposit-store";
import { lockInvoiceRow, TOTALS_SELECT } from "@/server/invoice-store";
import { requireApprover, verifyApproval } from "@/server/approval";
import { requireCapability } from "@/server/session";

function revalidatePayments(invoiceId: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

/**
 * Catat pembayaran customer (spec tagihan 4.4). Batasnya sisa tagihan saat ini, dihitung setelah
 * tagihan dikunci: dua pembayaran bersamaan tidak bisa sama-sama melunasi. Kelebihan non-tunai menjadi
 * saldo deposit pasien (spec deposit D5).
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
        select: { number: true, finalizedAt: true, patientId: true, patient: { select: { name: true } }, ...TOTALS_SELECT },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status !== "FINAL" || !invoice.finalizedAt) throw new UserFacingError("Tagihan ini belum final atau sudah dibatalkan.");
      const { balance } = invoiceTotals(invoice);
      const checked = validateInvoicePayment(input, { today, finalizedDate: witaDateString(invoice.finalizedAt), limit: balance });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const payment = checked.value;
      let destination: { clinicBankAccountId: string; destinationLabel: string } | null = null;
      // Transfer: rekening tujuan; EDC: rekening klinik penerima setoran mesin itu (spec invoice A4 IA12).
      const accountId = payment.transfer?.clinicBankAccountId ?? payment.edc?.clinicBankAccountId;
      if (accountId) {
        const what = payment.edc ? "Mesin EDC" : "Rekening tujuan";
        const account = await tx.clinicBankAccount.findUnique({ where: { id: accountId } });
        if (!account) throw new UserFacingError(`${what} tidak ditemukan.`);
        if (!account.isActive) throw new UserFacingError(`${what} tidak aktif.`);
        destination = {
          clinicBankAccountId: account.id,
          destinationLabel: formatBankAccount({ bankName: account.bankName, bankAccountNumber: account.accountNumber, bankAccountHolder: account.accountHolder })!,
        };
      }
      const created = await tx.invoicePayment.create({
        data: {
          invoiceId,
          amount: payment.amount,
          method: payment.method,
          paidAt: dateOnly(payment.paidAt),
          reference: payment.reference,
          ...(destination ?? {}),
          senderBank: payment.transfer?.senderBank ?? null,
          senderAccountName: payment.transfer?.senderAccountName ?? null,
          senderAccountNumber: payment.transfer?.senderAccountNumber ?? null,
          staffId: actor.staffId,
          staffName: actor.name,
        },
        select: { id: true },
      });
      let credit: { id: string; summary: string } | null = null;
      if (payment.amount > balance) {
        await lockPatient(tx, invoice.patientId);
        const excess = payment.amount - balance;
        const recorded = await recordOverpayment(
          tx,
          { patientId: invoice.patientId, invoiceId, paymentId: created.id, amount: excess, paidAt: payment.paidAt },
          actor,
        );
        credit = { id: recorded.id, summary: `${invoice.patient.name}: kelebihan bayar ${invoice.number} ${formatRupiah(excess)}, berlaku sampai ${recorded.validUntil}` };
      }
      return { id: created.id, credit, summary: `${invoice.number} ${invoice.patient.name}: ${formatRupiah(payment.amount)} (${PAYMENT_METHOD_LABEL[payment.method]})` };
    });

    await recordAudit({ actor, action: "invoice-payment.create", entity: "InvoicePayment", entityId: result.id, summary: result.summary });
    if (result.credit) await recordAudit({ actor, action: "deposit.credit", entity: "DepositCredit", entityId: result.credit.id, summary: result.credit.summary });
    revalidatePayments(invoiceId);
    return { id: result.id };
  });
}

/**
 * Batalkan pembayaran salah input (spec tagihan 5): tidak dihapus, ditandai dibatalkan beserta alasannya.
 * Saldo deposit dari kelebihannya ikut hilang, kecuali sudah dipakai atau dikembalikan (spec deposit D5).
 */
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
      await releaseOverpayment(tx, id);
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
 * boleh turun di bawah yang sudah dibayar ditambah deposit yang dipakai (spec deposit D14). Diskon yang
 * membuat sisa 0 melunasi tagihan.
 */
export async function applyFinalDiscount(input: {
  invoiceId: string;
  kind: DiscountKindValue;
  value: number;
  reason: string;
  /** Wajib (spec PIN P1b, P3). */
  approval?: ApprovalInput;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:correct");
    const invoiceId = String(input?.invoiceId ?? "");
    const approver = await verifyApproval(input?.approval);

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
      if (subtotal - amount < totals.paid + totals.deposit) throw new UserFacingError("Diskon membuat total di bawah yang sudah dibayar.");
      const approvedBy = requireApprover(approver);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          discountKind: discount.kind,
          discountValue: discount.value,
          discountReason: discount.reason,
          discountByName: actor.name,
          discountApprovedById: approvedBy.id,
          discountApprovedByName: approvedBy.name,
        },
      });
      return `${invoice.number}: diskon ${discount.value}${discount.kind === "PERSEN" ? "%" : ""} sesudah final (${discount.reason})${approvedSuffix(approvedBy.name)}`;
    });

    await recordAudit({ actor, action: "invoice.discount", entity: "Invoice", entityId: invoiceId, summary });
    revalidatePayments(invoiceId);
  });
}
