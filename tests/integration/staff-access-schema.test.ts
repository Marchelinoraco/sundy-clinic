// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("skema hak tambahan staf", () => {
  beforeEach(async () => {
    await prisma.staff.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("menolak hibah ganda untuk staf dan kemampuan yang sama", async () => {
    const staff = await prisma.staff.create({
      data: { slug: "resepsionis-hibah", name: "Resepsionis Hibah", role: "RESEPSIONIS" },
    });
    await prisma.staffCapabilityGrant.create({
      data: { staffId: staff.id, capability: "stock.view" },
    });
    await expect(
      prisma.staffCapabilityGrant.create({
        data: { staffId: staff.id, capability: "stock.view" },
      }),
    ).rejects.toThrow();
  });

  it("menghapus hibah ketika stafnya dihapus", async () => {
    const staff = await prisma.staff.create({
      data: { slug: "resepsionis-hapus", name: "Resepsionis Hapus", role: "RESEPSIONIS" },
    });
    await prisma.staffCapabilityGrant.create({
      data: { staffId: staff.id, capability: "stock.view" },
    });
    await prisma.staff.delete({ where: { id: staff.id } });
    expect(await prisma.staffCapabilityGrant.count()).toBe(0);
  });
});
