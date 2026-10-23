"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { PIN_WRONG, validatePin } from "@/lib/approval";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CAPABILITIES_BY_ROLE } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { verifyApproval } from "@/server/approval";
import { recordAudit } from "@/server/audit";
import { requireCapability, requireStaff } from "@/server/session";

// Membuat, mengganti, dan mereset PIN persetujuan (spec PIN P8, P10, P12).

const OLD_PIN_WRONG = "PIN lama salah.";
const APPROVER_ROLES = Object.entries(CAPABILITIES_BY_ROLE)
  .filter(([, capabilities]) => capabilities.includes("approval:give"))
  .map(([role]) => role as keyof typeof CAPABILITIES_BY_ROLE);

/** Apakah staf yang masuk sudah punya PIN (halaman PIN persetujuan). */
export async function hasOwnApprovalPin(): Promise<boolean> {
  const actor = await requireCapability("approval:give");
  return (await prisma.approvalPin.count({ where: { staffId: actor.staffId } })) > 0;
}

/** PIN baru 6 angka; mengganti PIN wajib PIN lama yang benar, yang salah ikut dihitung dan bisa mengunci (P8, P9). */
export async function setOwnApprovalPin(input: { currentPin?: string; newPin: string }): Promise<ActionResult<void>> {
  const actor = await requireCapability("approval:give");
  return runAction(async () => {
    const formatProblem = validatePin(input?.newPin);
    if (formatProblem) throw new UserFacingError(formatProblem);
    const existing = await prisma.approvalPin.count({ where: { staffId: actor.staffId } });
    if (existing > 0) {
      if (validatePin(input?.currentPin)) throw new UserFacingError(OLD_PIN_WRONG);
      try {
        await verifyApproval({ approverId: actor.staffId, pin: input.currentPin });
      } catch (error) {
        if (error instanceof UserFacingError && error.message === PIN_WRONG) throw new UserFacingError(OLD_PIN_WRONG);
        throw error;
      }
    }
    const pinHash = await (await auth.$context).password.hash(input.newPin);
    await prisma.approvalPin.upsert({
      where: { staffId: actor.staffId },
      create: { staffId: actor.staffId, pinHash },
      update: { pinHash, failedCount: 0, lockedUntil: null },
    });
    await recordAudit({ actor, action: "approval-pin.set", entity: "Staff", entityId: actor.staffId, summary: actor.name });
    safeRevalidatePath("/admin/pin-persetujuan");
  });
}

/** Penyetuju di kotak Persetujuan: Admin Keuangan dan Super Admin aktif yang sudah punya PIN, urut nama (P7, P12). */
export async function listApprovers(): Promise<ActionResult<{ id: string; name: string }[]>> {
  await requireStaff();
  return runAction(() =>
    prisma.staff.findMany({
      where: { isActive: true, role: { in: APPROVER_ROLES }, approvalPin: { isNot: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  );
}

/** Lupa PIN (P10): Super Admin menghapus PIN staf itu; ia membuat PIN baru sendiri. */
export async function resetApprovalPin(staffId: string): Promise<ActionResult<void>> {
  const actor = await requireCapability("staff:manage");
  return runAction(async () => {
    const staff = await prisma.staff.findUnique({ where: { id: String(staffId ?? "") }, select: { id: true, name: true } });
    if (!staff) throw new UserFacingError("Staf tidak ditemukan.");
    await prisma.approvalPin.deleteMany({ where: { staffId: staff.id } });
    await recordAudit({ actor, action: "approval-pin.reset", entity: "Staff", entityId: staff.id, summary: staff.name });
    safeRevalidatePath("/admin/staf");
  });
}
