import { UserFacingError } from "@/lib/action-result";
import { APPROVAL_LOCK_MINUTES, APPROVAL_MAX_FAILS, APPROVAL_REQUIRED, APPROVER_INVALID, PIN_WRONG, pinLockedMessage, validatePin } from "@/lib/approval";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";

/** Penyetuju yang PIN-nya benar. */
export type Approver = { id: string; name: string };

/**
 * Memeriksa PIN di kotak Persetujuan (spec PIN P7, P9). Dipanggil SEBELUM transaksi tindakan, supaya hitungan salah
 * tetap tersimpan walau tindakannya gagal. Null bila tidak ada isian persetujuan; tindakan yang menuntutnya menolak
 * lewat requireApprover setelah validasinya sendiri.
 */
export async function verifyApproval(input: unknown): Promise<Approver | null> {
  if (input === undefined || input === null) return null;
  const raw = input as { approverId?: unknown; pin?: unknown };
  const pinProblem = validatePin(raw.pin);
  if (pinProblem) throw new UserFacingError(pinProblem);
  const approverId = typeof raw.approverId === "string" ? raw.approverId : "";
  const pin = raw.pin as string;

  const staff = await prisma.staff.findUnique({
    where: { id: approverId },
    select: { id: true, name: true, role: true, isActive: true, approvalPin: { select: { pinHash: true, lockedUntil: true } } },
  });
  if (!staff || !staff.isActive || !can(staff.role, "approval:give") || !staff.approvalPin) throw new UserFacingError(APPROVER_INVALID);

  const now = new Date();
  const { lockedUntil, pinHash } = staff.approvalPin;
  if (lockedUntil && lockedUntil > now) throw new UserFacingError(pinLockedMessage(staff.name, lockedUntil));

  const ctx = await auth.$context;
  if (await ctx.password.verify({ hash: pinHash, password: pin })) {
    await prisma.approvalPin.update({ where: { staffId: staff.id }, data: { failedCount: 0, lockedUntil: null } });
    return { id: staff.id, name: staff.name };
  }

  // Penambahan atomik: dua salah bersamaan tetap terhitung dua.
  const failed = await prisma.approvalPin.update({ where: { staffId: staff.id }, data: { failedCount: { increment: 1 } }, select: { failedCount: true } });
  if (failed.failedCount >= APPROVAL_MAX_FAILS) {
    const until = new Date(now.getTime() + APPROVAL_LOCK_MINUTES * 60_000);
    await prisma.approvalPin.update({ where: { staffId: staff.id }, data: { failedCount: 0, lockedUntil: until } });
    throw new UserFacingError(pinLockedMessage(staff.name, until));
  }
  throw new UserFacingError(PIN_WRONG);
}

/** Tindakan yang menuntut persetujuan menolak tanpa penyetuju (spec PIN P1–P3). */
export function requireApprover(approver: Approver | null): Approver {
  if (!approver) throw new UserFacingError(APPROVAL_REQUIRED);
  return approver;
}
