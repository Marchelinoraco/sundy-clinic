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
});
