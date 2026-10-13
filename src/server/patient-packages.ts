"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateLabel, dateOnlyString } from "@/lib/stock";
import { validateExtension } from "@/lib/treatment-package";
import { recordAudit } from "@/server/audit";
import { lockPatientPackages } from "@/server/package-store";
import { requireCapability } from "@/server/session";

const day = (value: string) => new Date(`${value}T00:00:00Z`);

/** Perpanjang masa berlaku paket customer (spec paket 7), dengan alasan; tercatat di buku sesi dan audit. */
export async function extendPatientPackage(input: { packageId: string; expiresOn: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:correct");
    const packageId = String(input?.packageId ?? "");
    const summary = await prisma.$transaction(async (tx) => {
      await lockPatientPackages(tx, [packageId]);
      const pkg = await tx.patientPackage.findUnique({
        where: { id: packageId },
        select: { name: true, status: true, expiresOn: true, items: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } } },
      });
      if (!pkg || pkg.items.length === 0) throw new UserFacingError("Paket tidak ditemukan.");
      if (pkg.status === "DIBATALKAN") throw new UserFacingError("Paket yang dibatalkan tidak bisa diperpanjang.");
      const previous = dateOnlyString(pkg.expiresOn);
      const checked = validateExtension(input, { currentExpiresOn: previous });
      if (!checked.ok) throw new UserFacingError(checked.message);
      await tx.packageSessionEntry.create({
        data: {
          patientPackageItemId: pkg.items[0].id,
          kind: "PERPANJANG",
          delta: 0,
          reason: checked.value.reason,
          previousExpiresOn: day(previous),
          newExpiresOn: day(checked.value.expiresOn),
          staffId: actor.staffId,
          staffName: actor.name,
        },
      });
      await tx.patientPackage.update({ where: { id: packageId }, data: { expiresOn: day(checked.value.expiresOn) } });
      return `${pkg.name}: berlaku s.d. ${dateLabel(previous)} → ${dateLabel(checked.value.expiresOn)} (${checked.value.reason})`;
    });
    await recordAudit({ actor, action: "patient-package.extend", entity: "PatientPackage", entityId: packageId, summary });
    safeRevalidatePath("/admin/paket");
    safeRevalidatePath(`/admin/paket/${packageId}`);
  });
}
