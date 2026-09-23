// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("skema katalog", () => {
  beforeEach(async () => {
    await prisma.packageItem.deleteMany();
    await prisma.package.deleteMany();
    await prisma.service.deleteMany();
    await prisma.serviceCategory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.doctor.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("menyimpan harga sebagai bilangan bulat rupiah penuh", async () => {
    const category = await prisma.serviceCategory.create({
      data: { slug: "hifu", name: "HIFU", sortOrder: 1 },
    });
    const service = await prisma.service.create({
      data: {
        slug: "hifu-wajah",
        name: "HIFU Wajah",
        normalPrice: 749000,
        promoPrice: 499000,
        durationMin: 60,
        categoryId: category.id,
      },
    });

    expect(service.promoPrice).toBe(499000);
    expect(Number.isInteger(service.promoPrice)).toBe(true);
  });

  it("menolak dua layanan dengan slug sama", async () => {
    const category = await prisma.serviceCategory.create({
      data: { slug: "peeling", name: "Peeling", sortOrder: 2 },
    });
    await prisma.service.create({
      data: { slug: "peeling", name: "Peeling", promoPrice: 99000, categoryId: category.id },
    });

    await expect(
      prisma.service.create({
        data: {
          slug: "peeling",
          name: "Peeling Ulang",
          promoPrice: 99000,
          categoryId: category.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("membedakan cabang aktif dari cabang yang segera hadir", async () => {
    await prisma.branch.create({
      data: {
        slug: "mahakeret",
        name: "SunDY Mahakeret",
        address: "Jl. Garuda No. 10, Mahakeret Barat, Manado",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
        sortOrder: 1,
      },
    });
    await prisma.branch.create({
      data: {
        slug: "citraland",
        name: "SunDY Citraland",
        address: "Citraland — Cluster The Manhattan, Manado",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "SEGERA_HADIR",
        sortOrder: 2,
      },
    });

    const bookable = await prisma.branch.findMany({ where: { status: "AKTIF" } });
    expect(bookable).toHaveLength(1);
    expect(bookable[0].slug).toBe("mahakeret");
  });

  it("memberi cabang baru status SEGERA_HADIR secara bawaan", async () => {
    // Cabang yang belum jelas statusnya tidak boleh otomatis bisa dibooking.
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-baru",
        name: "Cabang Baru",
        address: "Alamat",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
      },
    });
    expect(branch.status).toBe("SEGERA_HADIR");
  });

  it("menghapus isi paket saat paketnya dihapus", async () => {
    const pkg = await prisma.package.create({
      data: {
        slug: "max-slim",
        name: "MAX SLIM",
        groupName: "MAX",
        monthlyPrice: 1925000,
        sortOrder: 2,
        items: {
          create: [
            { label: "Konsul & Timbang BIA", sortOrder: 1 },
            { label: "Kapsul M", sortOrder: 2 },
          ],
        },
      },
      include: { items: true },
    });
    expect(pkg.items).toHaveLength(2);

    await prisma.package.delete({ where: { id: pkg.id } });
    expect(await prisma.packageItem.count()).toBe(0);
  });

  it("menghapus layanan saat kategorinya dihapus", async () => {
    const category = await prisma.serviceCategory.create({
      data: { slug: "laser", name: "Laser", sortOrder: 3 },
    });
    await prisma.service.create({
      data: { slug: "lip-laser", name: "Lip Laser", promoPrice: 99000, categoryId: category.id },
    });

    await prisma.serviceCategory.delete({ where: { id: category.id } });
    expect(await prisma.service.count()).toBe(0);
  });
});
