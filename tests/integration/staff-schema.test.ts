// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("skema staf", () => {
  beforeEach(async () => {
    await prisma.staff.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("menyimpan peran staf", async () => {
    const staff = await prisma.staff.create({
      data: { slug: "terapis-satu", name: "Terapis Satu", role: "TERAPIS" },
    });
    expect(staff.role).toBe("TERAPIS");
  });

  it("menyembunyikan staf dari situs publik secara bawaan", async () => {
    // Resepsionis dan admin tidak seharusnya muncul di halaman "Tim Dokter".
    // Bawaannya tersembunyi agar menambah staf baru tidak pernah tidak
    // sengaja memublikasikan namanya.
    const staff = await prisma.staff.create({
      data: { slug: "resepsionis", name: "Resepsionis", role: "RESEPSIONIS" },
    });
    expect(staff.showOnWebsite).toBe(false);
  });

  it("menolak dua staf dengan slug sama", async () => {
    await prisma.staff.create({
      data: { slug: "diane-paparang", name: "Dr. Diane", role: "DOKTER" },
    });
    await expect(
      prisma.staff.create({
        data: { slug: "diane-paparang", name: "Diane Lain", role: "TERAPIS" },
      }),
    ).rejects.toThrow();
  });
});
