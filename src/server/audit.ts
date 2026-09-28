import { prisma } from "@/lib/db";
import type { CurrentStaff } from "@/server/session";

/**
 * Pelaku yang tercatat di jejak audit: staf yang sedang login (CurrentStaff
 * memenuhi bentuk ini), atau salah satu pelaku tetap di bawah. Kolom
 * actorStaffId tidak berelasi, jadi penanda tetap aman disimpan di sana.
 */
export type AuditActor = Pick<CurrentStaff, "staffId" | "name"> & { role: string };

/** Perubahan yang dilakukan sistem sendiri, mis. booking situs yang kedaluwarsa. */
export const SYSTEM_ACTOR: AuditActor = { staffId: "sistem", name: "Sistem", role: "SISTEM" };

/** Pasien yang memesan atau membatalkan lewat situs publik. */
export const SITE_PATIENT_ACTOR: AuditActor = {
  staffId: "pasien",
  name: "Pasien (situs)",
  role: "PASIEN",
};

type AuditInput = {
  actor: AuditActor;
  action: string;
  entity: string;
  entityId: string;
  summary?: string;
};

/**
 * Mencatat satu peristiwa ke jejak audit.
 *
 * Identitas pelaku disalin apa adanya. Menyimpan hanya id berarti catatan
 * kehilangan makna begitu staf yang bersangkutan dihapus, padahal justru
 * catatan lama itu yang dibutuhkan saat ada yang dipertanyakan.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorStaffId: input.actor.staffId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      summary: input.summary,
    },
  });
}
