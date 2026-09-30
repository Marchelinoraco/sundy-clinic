import { auditActionLabel, auditRoleLabel } from "@/lib/audit-labels";
import { AUDIT_REPEAT_WINDOW_MS, shouldRecordRepeat } from "@/lib/audit-window";
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

/**
 * Seperti recordAudit, tetapi paling banyak sekali per pelaku, aksi, dan
 * catatan dalam jendela 30 menit (spec R12): membuka kunjungan dan menyimpan
 * draf otomatis tidak membanjiri jejak audit.
 */
export async function recordAuditThrottled(input: AuditInput, windowMs = AUDIT_REPEAT_WINDOW_MS): Promise<void> {
  const last = await prisma.auditLog.findFirst({
    where: { actorStaffId: input.actor.staffId, action: input.action, entity: input.entity, entityId: input.entityId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!shouldRecordRepeat(last?.createdAt ?? null, new Date(), windowMs)) return;
  await recordAudit(input);
}

export type AuditTrailRow = { id: string; at: Date; actorName: string; roleLabel: string; actionLabel: string };

/**
 * Jejak satu catatan, terbaru di atas. Tidak memeriksa hak akses sendiri:
 * pemanggil wajib memastikan staf punya audit:read.
 */
export async function listAuditTrail(entity: string, entityId: string): Promise<AuditTrailRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, actorName: true, actorRole: true, action: true },
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.createdAt,
    actorName: row.actorName,
    roleLabel: auditRoleLabel(row.actorRole),
    actionLabel: auditActionLabel(row.action),
  }));
}
