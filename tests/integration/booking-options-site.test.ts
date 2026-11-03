// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getBookingOptions } from "@/server/public-booking-data";
import { cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

const SLUG = "opsi-situs-uji";
let world: BookingWorld;

beforeAll(async () => {
  await cleanupBookingWorld(SLUG);
  world = await createBookingWorld(SLUG);
});
afterAll(async () => {
  await cleanupBookingWorld(SLUG);
  await prisma.$disconnect();
});

describe("pilihan treatment /daftar dari katalog situs", () => {
  it("memakai nama layanan situs dengan id, harga, dan durasi layanan internal; satu pilihan per layanan internal", async () => {
    const facial = await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } });
    await prisma.siteService.update({ where: { slug: `${SLUG}-facial` }, data: { name: "Facial Glowing Promo", sortOrder: 1 } });
    await prisma.siteService.create({ data: { slug: `${SLUG}-facial-2`, name: "Facial Kedua", categoryId: facial.categoryId, serviceId: facial.id, sortOrder: 2 } });

    const { treatments } = await getBookingOptions();
    const matches = treatments.filter((t) => t.id === world.treatmentId);
    expect(matches).toEqual([{ id: world.treatmentId, name: "Facial Glowing Promo", price: 250000, durationMin: 60, requiresDoctor: false }]);
  });

  it("tidak menawarkan item khusus internal atau layanan internal nonaktif", async () => {
    const facial = await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } });
    const internal = await prisma.service.create({ data: { slug: `${SLUG}-addon`, name: "Add-on Opsi Uji", promoPrice: 10_000, categoryId: facial.categoryId } });
    expect((await getBookingOptions()).treatments.some((t) => t.id === internal.id)).toBe(false);

    await prisma.service.update({ where: { id: world.treatmentId }, data: { isActive: false } });
    expect((await getBookingOptions()).treatments.some((t) => t.id === world.treatmentId)).toBe(false);
    await prisma.service.update({ where: { id: world.treatmentId }, data: { isActive: true } });
  });

  it("hanya menawarkan treatment dari kategori yang boleh dipilih sendiri (spec kategori layanan KL14)", async () => {
    const facial = await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } });
    await prisma.serviceCategory.update({ where: { id: facial.categoryId }, data: { selfBookable: false } });
    expect((await getBookingOptions()).treatments.some((t) => t.id === world.treatmentId)).toBe(false);

    await prisma.serviceCategory.update({ where: { id: facial.categoryId }, data: { selfBookable: true } });
    expect((await getBookingOptions()).treatments.some((t) => t.id === world.treatmentId)).toBe(true);
  });

  it("layanan situs di kategori bersakelar mati tidak ditawarkan walau layanan internalnya di kategori yang boleh (KL14, review akhir)", async () => {
    const jasa = await prisma.serviceCategory.create({ data: { slug: `${SLUG}-jasa`, name: "Jasa Opsi Uji", selfBookable: false } });
    const sites = await prisma.siteService.findMany({ where: { serviceId: world.treatmentId }, select: { id: true, categoryId: true } });
    const [first, ...others] = sites;
    await prisma.siteService.update({ where: { id: first.id }, data: { categoryId: jasa.id } });
    try {
      // Masih ada layanan situs lain di kategori yang boleh: tetap ditawarkan lewat yang itu.
      if (others.length > 0) expect((await getBookingOptions()).treatments.some((t) => t.id === world.treatmentId)).toBe(true);
      await prisma.siteService.updateMany({ where: { serviceId: world.treatmentId }, data: { categoryId: jasa.id } });
      expect((await getBookingOptions()).treatments.some((t) => t.id === world.treatmentId)).toBe(false);
    } finally {
      for (const site of sites) await prisma.siteService.update({ where: { id: site.id }, data: { categoryId: site.categoryId } });
      await prisma.serviceCategory.delete({ where: { id: jasa.id } });
    }
  });
});
