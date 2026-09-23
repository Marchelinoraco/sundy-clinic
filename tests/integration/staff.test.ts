// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { uniqueStaffSlug } from "@/server/staff";

describe("manajemen staf", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.staff.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("memakai slug apa adanya bila belum dipakai", async () => {
    expect(await uniqueStaffSlug("Siti Rahayu")).toBe("siti-rahayu");
  });

  it("menambahkan akhiran bila slug sudah dipakai", async () => {
    await prisma.staff.create({ data: { slug: "siti-rahayu", name: "Siti", role: "TERAPIS" } });
    expect(await uniqueStaffSlug("Siti Rahayu")).toBe("siti-rahayu-2");
  });

  it("terus menaikkan akhiran sampai menemukan yang kosong", async () => {
    await prisma.staff.create({ data: { slug: "siti-rahayu", name: "A", role: "TERAPIS" } });
    await prisma.staff.create({ data: { slug: "siti-rahayu-2", name: "B", role: "TERAPIS" } });
    expect(await uniqueStaffSlug("Siti Rahayu")).toBe("siti-rahayu-3");
  });
});
