"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateOwnPasswordChange } from "@/lib/staff-accounts";
import { recordAudit } from "@/server/audit";
import { getPendingPasswordChange } from "@/server/session";

/**
 * Mengganti kata sandi sendiri (spec kelola staf 5.3). Hanya untuk akun yang wajib mengganti (akun baru atau yang baru
 * direset): memakai `getPendingPasswordChange`, sehingga akun lain, atau yang belum login, ditolak. Kata sandi saat ini
 * diperiksa lebih dulu; setelah berhasil, tanda dimatikan dan semua sesi lain dikeluarkan (sesi ini tetap).
 */
export async function changeOwnPassword(input: { currentPassword: string; newPassword: string; confirmation: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const pending = await getPendingPasswordChange();
    if (!pending) throw new UserFacingError("Anda tidak perlu mengganti kata sandi sekarang. Muat ulang halaman.");
    const currentPassword = String(input?.currentPassword ?? "");
    const checked = validateOwnPasswordChange({
      currentPassword,
      newPassword: String(input?.newPassword ?? ""),
      confirmation: String(input?.confirmation ?? ""),
    });
    if (!checked.ok) throw new UserFacingError(checked.message);

    const ctx = await auth.$context;
    const credential = await ctx.internalAdapter.findCredentialAccount(pending.userId);
    const valid = credential?.password ? await ctx.password.verify({ hash: credential.password, password: currentPassword }) : false;
    if (!valid) throw new UserFacingError("Kata sandi saat ini salah.");

    const hash = await ctx.password.hash(checked.value);
    // Satu transaksi: bila pencabutan sesi gagal, kata sandi sementara tetap berlaku dan tanda tetap menyala, sehingga bisa diulang.
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.account.updateMany({ where: { userId: pending.userId, providerId: "credential" }, data: { password: hash } });
      if (count !== 1) throw new UserFacingError("Akun ini tidak memakai login email dan kata sandi.");
      await tx.user.update({ where: { id: pending.userId }, data: { mustChangePassword: false } });
      await tx.session.deleteMany({ where: { userId: pending.userId, id: { not: pending.sessionId } } });
    });
    await recordAudit({ actor: pending, action: "staff.password.change", entity: "Staff", entityId: pending.staffId, summary: pending.name });
  });
}
