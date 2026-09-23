import { prisma } from "@/lib/db";
import type { CurrentStaff } from "@/server/session";

type AuditInput = {
  actor: CurrentStaff;
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
