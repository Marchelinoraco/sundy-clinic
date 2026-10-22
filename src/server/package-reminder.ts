"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnlyString, isDateString } from "@/lib/stock";
import { requireCapability } from "@/server/session";

/**
 * Mencatat pengingat kunjungan paket yang dikirim lewat WhatsApp (spec jadwal paket JP12). Dicatat per paket dan tanggal
 * rencana, jadi menekan dua kali tidak menggandakan; tanggal yang sudah berubah ditolak.
 */
export async function recordPackageVisitReminder(input: { patientPackageId: string; visitOn: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const patientPackageId = String(input?.patientPackageId ?? "");
    const pkg = await prisma.patientPackage.findUnique({ where: { id: patientPackageId }, select: { nextVisitOn: true } });
    if (!pkg) throw new UserFacingError("Paket tidak ditemukan.");
    const visitOn = input?.visitOn;
    if (!isDateString(visitOn) || !pkg.nextVisitOn || dateOnlyString(pkg.nextVisitOn) !== visitOn) {
      throw new UserFacingError("Rencana kunjungan paket ini sudah berubah. Muat ulang halaman.");
    }
    await prisma.packageVisitReminder.createMany({
      data: [{ patientPackageId, visitOn: new Date(`${visitOn}T00:00:00Z`), staffId: actor.staffId, staffName: actor.name }],
      skipDuplicates: true,
    });
    safeRevalidatePath("/admin/pengingat");
  });
}
