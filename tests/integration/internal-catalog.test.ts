// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getInternalCatalog, getSiteCatalog, listServiceCategories } from "@/server/catalog-admin-read";
import { listInternalServiceOptions } from "@/server/internal-catalog";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Katalog Baca", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-katalog";
let categoryId: string;
let internalOnlyId: string;
let linkedId: string;

async function clean() {
  await prisma.service.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await clean();
  categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Baca", sortOrder: 98 } })).id;
  internalOnlyId = (await prisma.service.create({ data: { slug: `${SLUG}-addon`, name: "Add-on Baca Uji", promoPrice: 50_000, durationMin: 15, categoryId } })).id;
  linkedId = (await prisma.service.create({ data: { slug: `${SLUG}-facial`, name: "Facial Baca Uji", promoPrice: 150_000, normalPrice: 200_000, durationMin: 45, categoryId } })).id;
  await prisma.service.create({ data: { slug: `${SLUG}-mati`, name: "Mati Baca Uji", promoPrice: 10_000, isActive: false, categoryId } });
  await prisma.siteService.create({ data: { slug: `${SLUG}-promo`, name: "Facial Promo Baca", categoryId, serviceId: linkedId } });
  await prisma.siteService.create({ data: { slug: `${SLUG}-promo-mati`, name: "Facial Promo Mati", categoryId, serviceId: linkedId, isActive: false } });
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("katalog internal", () => {
  it("pilihan internal: aktif saja, termasuk item khusus internal, tanpa Konsultasi Online", async () => {
    const options = await listInternalServiceOptions();
    const ids = options.map((option) => option.id);
    expect(ids).toContain(internalOnlyId);
    expect(ids).toContain(linkedId);
    expect(options.find((option) => option.name === "Mati Baca Uji")).toBeUndefined();
    expect(options.find((option) => option.slug === "konsultasi-online")).toBeUndefined();
    expect(options.find((option) => option.id === linkedId)).toEqual({
      id: linkedId,
      slug: `${SLUG}-facial`,
      name: "Facial Baca Uji",
      categoryId,
      categoryName: "Kategori Baca",
      price: 150_000,
      durationMin: 45,
      requiresDoctor: false,
    });
  });

  it("tabel internal memuat layanan nonaktif dan jumlah layanan situs aktif yang menautkan", async () => {
    const category = (await getInternalCatalog()).find((c) => c.id === categoryId)!;
    expect(category.services.map((s) => s.name)).toEqual(["Add-on Baca Uji", "Facial Baca Uji", "Mati Baca Uji"]);
    expect(category.services.find((s) => s.id === linkedId)).toMatchObject({ siteCount: 1, normalPrice: 200_000, materialCost: 0, commissionKind: null });
    expect(category.services.find((s) => s.id === internalOnlyId)?.siteCount).toBe(0);
    expect((await getInternalCatalog()).flatMap((c) => c.services).some((s) => s.slug === "konsultasi-online")).toBe(false);
  });

  it("tabel situs membawa nama dan harga layanan internalnya", async () => {
    const category = (await getSiteCatalog()).find((c) => c.id === categoryId)!;
    expect(category.services.find((s) => s.slug === `${SLUG}-promo`)).toMatchObject({
      name: "Facial Promo Baca",
      serviceId: linkedId,
      serviceName: "Facial Baca Uji",
      servicePrice: 150_000,
      serviceNormalPrice: 200_000,
      serviceActive: true,
      isActive: true,
    });
  });

  it("hanya Super Admin dan Admin Keuangan yang membaca katalog untuk pengelolaan", async () => {
    actor.role = "SUPER_ADMIN";
    expect((await listServiceCategories()).some((c) => c.id === categoryId)).toBe(true);
    actor.role = "RESEPSIONIS";
    await expect(getInternalCatalog()).rejects.toThrow("forbidden: catalog:manage");
    await expect(getSiteCatalog()).rejects.toThrow("forbidden: catalog:manage");
    await expect(listServiceCategories()).rejects.toThrow("forbidden: catalog:manage");
  });
});
