"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { isDateString } from "@/lib/stock";
import { requireCapability } from "@/server/session";

/**
 * Mencatat pengingat "waktunya treatment lagi" yang dikirim lewat WhatsApp (spec pengingat treatment PT12). Satu baris per
 * tekan Kirim, dari kotak 5 maupun tab Pasien treatment.
 */
export async function recordTreatmentReminder(input: { patientId: string; treatmentOn: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const treatmentOn = input?.treatmentOn;
    if (!isDateString(treatmentOn)) throw new UserFacingError("Tanggal treatment tidak sah.");
    const patient = await prisma.patient.findUnique({ where: { id: String(input?.patientId ?? "") }, select: { id: true } });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
    await prisma.treatmentReminder.create({
      data: { patientId: patient.id, treatmentOn: new Date(`${treatmentOn}T00:00:00Z`), staffId: actor.staffId, staffName: actor.name },
    });
    safeRevalidatePath("/admin/pengingat");
  });
}
