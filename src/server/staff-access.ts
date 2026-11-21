"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { CAPABILITIES_BY_ROLE, CAPABILITY_LABEL, isGrantable, type Capability } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Super Admin menetapkan himpunan akses tambahan satu akun (spec akses tambahan bagian 5-7). Himpunan baru menggantikan yang
 * lama; kemampuan yang sudah dimiliki peran sasaran diabaikan. Tanpa selisih tidak ada yang ditulis dan tidak ada audit.
 */
export async function setStaffExtraCapabilities(staffId: string, capabilities: string[]): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const requested = Array.isArray(capabilities) ? capabilities.map(String) : [];
    if (!requested.every(isGrantable)) throw new UserFacingError("Akses tidak dikenal.");

    const target = await prisma.staff.findUnique({ where: { id: String(staffId ?? "") }, select: { id: true, name: true, role: true } });
    if (!target) throw new UserFacingError("Staf tidak ditemukan.");
    if (target.role === "SUPER_ADMIN") throw new UserFacingError("Super Admin sudah memiliki semua akses.");

    const byRole = CAPABILITIES_BY_ROLE[target.role] ?? [];
    const wanted = new Set<Capability>(requested.filter(isGrantable).filter((cap) => !byRole.includes(cap)));

    const { added, removed } = await prisma.$transaction(async (tx) => {
      const current = await tx.staffCapabilityGrant.findMany({ where: { staffId: target.id }, select: { capability: true } });
      const have = new Set(current.map((row) => row.capability));
      const add = [...wanted].filter((cap) => !have.has(cap));
      const remove = [...have].filter((cap) => !wanted.has(cap as Capability));
      if (add.length > 0) {
        await tx.staffCapabilityGrant.createMany({
          data: add.map((capability) => ({ staffId: target.id, capability, grantedById: actor.staffId })),
          skipDuplicates: true,
        });
      }
      if (remove.length > 0) await tx.staffCapabilityGrant.deleteMany({ where: { staffId: target.id, capability: { in: remove } } });
      return { added: add, removed: remove };
    });

    const label = (capability: string) => CAPABILITY_LABEL[capability as Capability] ?? capability;
    for (const capability of added) {
      await recordAudit({ actor, action: "staff.access.add", entity: "Staff", entityId: target.id, summary: `${target.name}: ${label(capability)}` });
    }
    for (const capability of removed) {
      await recordAudit({ actor, action: "staff.access.remove", entity: "Staff", entityId: target.id, summary: `${target.name}: ${label(capability)}` });
    }
    if (added.length > 0 || removed.length > 0) safeRevalidatePath("/admin/staf");
  });
}
