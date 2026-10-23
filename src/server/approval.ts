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
    select: { id: true, name: true, role: true, isActive: true, approvalPin: { select: { staffId: true } } },
  });
  if (!staff || !staff.isActive || !can(staff.role, "approval:give") || !staff.approvalPin) throw new UserFacingError(APPROVER_INVALID);

  const ctx = await auth.$context;
  // Satu percobaan per penyetuju pada satu waktu: permintaan serentak antre di kunci baris PIN, sehingga kunci 5 kali
  // salah tidak bisa dilewati dengan menebak bersamaan (temuan review). Hasilnya dikembalikan, bukan dilempar, supaya
  // hitungan salah ikut tersimpan.
  const outcome = await prisma.$transaction(
    async (tx): Promise<{ kind: "ok" | "wrong" | "invalid" } | { kind: "locked"; until: Date }> => {
      const rows = await tx.$queryRaw<{ pinHash: string; failedCount: number; lockedUntil: Date | null }[]>`
        SELECT "pinHash", "failedCount", "lockedUntil" FROM "ApprovalPin" WHERE "staffId" = ${staff.id} FOR UPDATE`;
      const row = rows[0];
      if (!row) return { kind: "invalid" };
      const now = new Date();
      const lockedUntil = row.lockedUntil ? new Date(row.lockedUntil) : null;
      if (lockedUntil && lockedUntil > now) return { kind: "locked", until: lockedUntil };
      if (await ctx.password.verify({ hash: row.pinHash, password: pin })) {
        await tx.approvalPin.update({ where: { staffId: staff.id }, data: { failedCount: 0, lockedUntil: null } });
        return { kind: "ok" };
      }
      const failedCount = row.failedCount + 1;
      if (failedCount >= APPROVAL_MAX_FAILS) {
        const until = new Date(now.getTime() + APPROVAL_LOCK_MINUTES * 60_000);
        await tx.approvalPin.update({ where: { staffId: staff.id }, data: { failedCount: 0, lockedUntil: until } });
        return { kind: "locked", until };
      }
      await tx.approvalPin.update({ where: { staffId: staff.id }, data: { failedCount } });
      return { kind: "wrong" };
    },
    { maxWait: 15_000, timeout: 15_000 },
  );

  if (outcome.kind === "ok") return { id: staff.id, name: staff.name };
  if (outcome.kind === "locked") throw new UserFacingError(pinLockedMessage(staff.name, outcome.until));
  throw new UserFacingError(outcome.kind === "invalid" ? APPROVER_INVALID : PIN_WRONG);
}

/** Tindakan yang menuntut persetujuan menolak tanpa penyetuju (spec PIN P1–P3). */
export function requireApprover(approver: Approver | null): Approver {
  if (!approver) throw new UserFacingError(APPROVAL_REQUIRED);
  return approver;
}
