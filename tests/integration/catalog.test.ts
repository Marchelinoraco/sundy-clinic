// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getActiveDoctors,
  getActiveProducts,
  getAllServiceSlugs,
  getBranchBySlug,
  getBranches,
  getPackagesByGroup,
  getServiceBySlug,
  getServiceCategoriesWithServices,
  getSignatureServices,
} from "@/server/catalog";
import { seed } from "../../prisma/seed";

describe("lapisan query katalog", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("mengelompokkan layanan di bawah kategorinya dan mengurutkannya", async () => {
    const categories = await getServiceCategoriesWithServices();
    expect(categories[0].slug).toBe("facial");

    const rf = categories.find((c) => c.slug === "rf");
    expect(rf?.services.map((s) => s.slug)).toEqual([
      "rf-perut",
      "rf-paha",
      "rf-lengan",
      "rf-wajah",
    ]);
  });

  it("tidak memuat kategori yang tidak punya layanan aktif", async () => {
    const empty = await prisma.serviceCategory.create({
      data: { slug: "kategori-kosong", name: "Kategori Kosong", sortOrder: 99 },
    });
    const categories = await getServiceCategoriesWithServices();
    expect(categories.map((c) => c.slug)).not.toContain("kategori-kosong");
    await prisma.serviceCategory.delete({ where: { id: empty.id } });
  });

  it("menyembunyikan layanan yang dinonaktifkan", async () => {
    await prisma.service.update({ where: { slug: "botox" }, data: { isActive: false } });

    const categories = await getServiceCategoriesWithServices();
    const botoxCategory = categories.find((c) => c.slug === "botox");
    expect(botoxCategory).toBeUndefined();
    expect(await getServiceBySlug("botox")).toBeNull();
    expect(await getAllServiceSlugs()).not.toContain("botox");

    await prisma.service.update({ where: { slug: "botox" }, data: { isActive: true } });
  });

  it("mengambil satu layanan beserta kategorinya", async () => {
    const service = await getServiceBySlug("hifu-wajah");
    expect(service?.name).toBe("HIFU Wajah");
    expect(service?.category.name).toBe("HIFU Treatment");
  });

  it("mengembalikan null untuk slug yang tidak ada", async () => {
    expect(await getServiceBySlug("tidak-ada")).toBeNull();
  });

  it("mengembalikan empat layanan signature", async () => {
    const signature = await getSignatureServices();
    expect(signature).toHaveLength(4);
    expect(signature.every((s) => s.isSignature)).toBe(true);
  });

  it("mengembalikan seluruh slug layanan untuk peta situs", async () => {
    const slugs = await getAllServiceSlugs();
    expect(slugs).toContain("hifu-wajah");
    expect(slugs).toContain("meso-treatment");
  });

  it("mengelompokkan paket menurut MAX, LUX, ACTIVE dengan urutan itu", async () => {
    const groups = await getPackagesByGroup();
    expect(groups.map((g) => g.groupName)).toEqual(["MAX", "LUX", "ACTIVE"]);
    expect(groups[0].packages.map((p) => p.slug)).toEqual(["max", "max-slim", "max-t"]);
    expect(groups[2].packages).toHaveLength(6);
  });

  it("menyertakan isi paket yang sudah terurut", async () => {
    const groups = await getPackagesByGroup();
    const maxSlim = groups[0].packages.find((p) => p.slug === "max-slim");
    expect(maxSlim?.items.map((i) => i.label)).toEqual([
      "Konsul & Timbang BIA",
      "Kapsul M",
      "Fat Blocker",
      "Inject S",
    ]);
  });

  it("mengembalikan produk aktif saja", async () => {
    const hidden = await prisma.product.create({
      data: { slug: "produk-nonaktif", name: "Produk Nonaktif", isActive: false, sortOrder: 99 },
    });
    const products = await getActiveProducts();
    expect(products.map((p) => p.slug)).not.toContain("produk-nonaktif");
    expect(products.map((p) => p.slug)).toContain("kapsul-m");
    await prisma.product.delete({ where: { id: hidden.id } });
  });

  it("mengembalikan kedua cabang dengan cabang aktif lebih dulu", async () => {
    const branches = await getBranches();
    expect(branches.map((b) => b.slug)).toEqual(["mahakeret", "citraland"]);
  });

  it("mengambil satu cabang menurut slug", async () => {
    const branch = await getBranchBySlug("citraland");
    expect(branch?.status).toBe("SEGERA_HADIR");
  });

  it("mengembalikan dokter aktif", async () => {
    const doctors = await getActiveDoctors();
    expect(doctors.map((d) => d.name)).toContain("dr. Diane Paparang");
  });
});
