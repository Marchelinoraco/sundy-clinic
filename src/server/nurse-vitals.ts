"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { NURSE_OUT_OF_SCOPE, nurseCanWork } from "@/lib/nurse";
import { parseNurseVitals } from "@/lib/nurse-vitals";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

// Angka vital perawat di halaman Tangani (spec vital perawat VP1–VP3, VP6).

const COMPLETED = "Pasien ini sudah selesai ditangani.";
const STALE = "Angka vital baru saja diubah. Muat ulang halaman.";

type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Kunjungan yang boleh ditangani perawat hari ini, dengan angka vitalnya bila sudah ada. */
async function workableVisit(db: Db, appointmentId: string) {
  const visit = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, code: true, status: true, channel: true, startAt: true, nurseVitals: { select: { updatedAt: true, completedAt: true } } },
  });
  if (!visit || !nurseCanWork(visit, new Date())) throw new UserFacingError(NURSE_OUT_OF_SCOPE);
  return visit;
}

function revalidateNurse(appointmentId: string) {
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/perawat/${appointmentId}`);
}

/**
 * Simpan otomatis angka vital (VP2). Versi = waktu simpan terakhir; versi lama ditolak agar isian perawat lain tidak
 * tertimpa diam-diam. Setelah Selesai ditangani, angka tidak bisa diubah lagi di halaman ini (VP3).
 */
export async function saveNurseVitals(input: {
  appointmentId: string;
  version: string | null;
  vitals: Record<string, string>;
}): Promise<ActionResult<{ version: string; savedAt: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("nurse:work");
    const appointmentId = String(input?.appointmentId ?? "");
    const parsed = parseNurseVitals(input?.vitals);
    if (!parsed.ok) throw new UserFacingError(parsed.message);
    const expected = input?.version || null;
    const data = { ...parsed.value, updatedById: actor.staffId, updatedByName: actor.name };

    const saved = await prisma.$transaction(async (tx) => {
      const visit = await workableVisit(tx, appointmentId);
      if (visit.nurseVitals?.completedAt) throw new UserFacingError(COMPLETED);
      if (!visit.nurseVitals) {
        if (expected !== null) throw new UserFacingError(STALE);
        return tx.nurseVitals.create({ data: { appointmentId, ...data }, select: { updatedAt: true } });
      }
      if (expected === null) throw new UserFacingError(STALE);
      const updated = await tx.nurseVitals.updateMany({ where: { appointmentId, updatedAt: new Date(expected), completedAt: null }, data });
      if (updated.count === 0) throw new UserFacingError(STALE);
      return tx.nurseVitals.findUniqueOrThrow({ where: { appointmentId }, select: { updatedAt: true } });
    }).catch((error: unknown) => {
      // Dua perawat menyimpan angka pertama bersamaan: yang kalah diminta memuat ulang.
      if (isUniqueViolation(error)) throw new UserFacingError(STALE);
      throw error;
    });

    revalidateNurse(appointmentId);
    const version = saved.updatedAt.toISOString();
    return { version, savedAt: version };
  });
}

/** Selesai ditangani (VP3, VP6): mencatat perawat dan jamnya, mengunci angka, dan membuka Periksa bagi dokter (VP4). */
export async function completeNurseVisit(input: { appointmentId: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("nurse:work");
    const appointmentId = String(input?.appointmentId ?? "");
    const completion = { completedAt: new Date(), completedById: actor.staffId, completedByName: actor.name };

    const code = await prisma.$transaction(async (tx) => {
      const visit = await workableVisit(tx, appointmentId);
      if (visit.nurseVitals?.completedAt) throw new UserFacingError(COMPLETED);
      if (!visit.nurseVitals) {
        await tx.nurseVitals.create({ data: { appointmentId, updatedById: actor.staffId, updatedByName: actor.name, ...completion } });
      } else {
        const updated = await tx.nurseVitals.updateMany({ where: { appointmentId, completedAt: null }, data: completion });
        if (updated.count === 0) throw new UserFacingError(COMPLETED);
      }
      return visit.code;
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw new UserFacingError(COMPLETED);
      throw error;
    });

    await recordAudit({ actor, action: "nurse-visit.complete", entity: "Appointment", entityId: appointmentId, summary: `Selesai ditangani ${code}` });
    revalidateNurse(appointmentId);
  });
}
