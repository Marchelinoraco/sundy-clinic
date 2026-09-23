// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";

const actor = {
  userId: "user-uji",
  staffId: "staf-uji",
  name: "Staf Uji",
  role: "SUPER_ADMIN" as const,
  email: "uji@sundy.test",
};

describe("jejak audit", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("mencatat siapa melakukan apa terhadap entitas mana", async () => {
    await recordAudit({
      actor,
      action: "service.update",
      entity: "Service",
      entityId: "svc-1",
      summary: "Harga promo HIFU Wajah 499000 -> 459000",
    });

    const [entry] = await prisma.auditLog.findMany();
    expect(entry.actorStaffId).toBe("staf-uji");
    expect(entry.actorName).toBe("Staf Uji");
    expect(entry.action).toBe("service.update");
    expect(entry.entityId).toBe("svc-1");
    expect(entry.summary).toContain("499000");
  });

  it("menyimpan nama pelaku sebagai salinan, bukan hanya rujukan", async () => {
    // Permenkes 24/2022 menuntut jejak audit tetap terbaca. Bila staf dihapus
    // dan hanya ada rujukan id, catatannya kehilangan arti.
    await recordAudit({ actor, action: "staff.delete", entity: "Staff", entityId: "staf-lain" });

    const [entry] = await prisma.auditLog.findMany();
    expect(entry.actorName).toBe("Staf Uji");
    expect(entry.actorRole).toBe("SUPER_ADMIN");
  });

  it("mencatat waktu kejadian", async () => {
    const before = Date.now();
    await recordAudit({ actor, action: "staff.create", entity: "Staff", entityId: "baru" });

    const [entry] = await prisma.auditLog.findMany();
    expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});
