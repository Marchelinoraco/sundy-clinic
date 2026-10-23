"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { approvedSuffix, type ApprovalInput } from "@/lib/approval";
import { prisma } from "@/lib/db";
import { allocateCredits, depositRefundOverBalance, validateDepositRefund } from "@/lib/deposit";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, PAYMENT_METHOD_LABEL } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireApprover, verifyApproval } from "@/server/approval";
import { recordAudit } from "@/server/audit";
import { activeCredits, lockPatient } from "@/server/deposit-store";
import { requireAnyCapability } from "@/server/session";

/**
 * Kembalikan saldo deposit dalam bentuk uang (spec deposit D15, D16): minimal Rp 200.000, paling banyak saldo yang masih
 * berlaku, dipotong dari saldo yang kedaluwarsa paling dulu. Wajib PIN persetujuan, juga bila penyetuju sendiri yang
 * mengembalikan (spec PIN P1d, P2).
 */
export async function refundDeposit(input: {
  patientId: string;
  amount: number;
  method: "TUNAI" | "TRANSFER";
  reason: string;
  approval?: ApprovalInput;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireAnyCapability("invoice:manage", "invoice:correct");
    const patientId = String(input?.patientId ?? "");
    const checked = validateDepositRefund(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const { amount, method, reason } = checked.value;
    const today = witaDateString(new Date());
    const approver = await verifyApproval(input?.approval);

    const result = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { name: true } });
      if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
      await lockPatient(tx, patientId);
      const credits = await activeCredits(tx, patientId, today);
      const balance = credits.reduce((sum, credit) => sum + credit.remaining, 0);
      if (amount > balance) throw new UserFacingError(depositRefundOverBalance(balance));
      const approvedBy = requireApprover(approver);

      const refund = await tx.depositRefund.create({
        data: {
          patientId,
          amount,
          method,
          reason,
          refundedOn: dateOnly(today),
          staffId: actor.staffId,
          staffName: actor.name,
          approvedById: approvedBy.id,
          approvedByName: approvedBy.name,
          parts: { create: allocateCredits(credits, amount, today) },
        },
        select: { id: true },
      });
      return {
        id: refund.id,
        summary: `${patient.name}: ${formatRupiah(amount)} (${PAYMENT_METHOD_LABEL[method]}, ${reason})${approvedSuffix(approvedBy.name)}`,
      };
    });

    await recordAudit({ actor, action: "deposit.refund", entity: "DepositRefund", entityId: result.id, summary: result.summary });
    safeRevalidatePath("/admin/deposit");
    safeRevalidatePath(`/admin/pasien/${patientId}`);
  });
}
