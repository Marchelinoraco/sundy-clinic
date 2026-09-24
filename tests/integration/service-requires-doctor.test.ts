// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "../../prisma/seed";

describe("penanda requiresDoctor pada layanan", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("menandai treatment yang menembus kulit sebagai butuh dokter", async () => {
    await seed();
    const botox = await prisma.service.findUnique({ where: { slug: "botox" } });
    const hifu = await prisma.service.findUnique({ where: { slug: "hifu-wajah" } });
    const konsultasi = await prisma.service.findUnique({ where: { slug: "konsultasi-dokter" } });
    const skinBoosterHa = await prisma.service.findUnique({ where: { slug: "skin-booster-ha" } });
    const eyebooster = await prisma.service.findUnique({ where: { slug: "eyebooster" } });

    expect(botox?.requiresDoctor).toBe(true);
    expect(hifu?.requiresDoctor).toBe(true);
    expect(konsultasi?.requiresDoctor).toBe(true);
    // Skin booster menyuntikkan bahan ke bawah kulit — kolom "Harus dokter" pada
    // tabel D10 PRD, bukan kolom terapis meski berada di kategori Skin Booster.
    expect(skinBoosterHa?.requiresDoctor).toBe(true);
    expect(eyebooster?.requiresDoctor).toBe(true);
  });

  it("tidak menandai facial dan peeling permukaan sebagai butuh dokter", async () => {
    const facial = await prisma.service.findUnique({ where: { slug: "relaxing-facial" } });
    const peeling = await prisma.service.findUnique({ where: { slug: "peeling" } });
    const bia = await prisma.service.findUnique({ where: { slug: "timbang-bia" } });

    expect(facial?.requiresDoctor).toBe(false);
    expect(peeling?.requiresDoctor).toBe(false);
    expect(bia?.requiresDoctor).toBe(false);
  });
});
