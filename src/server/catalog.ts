import type { Branch, Package, PackageItem, Product, Service, Staff } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { PACKAGE_GROUPS } from "@/lib/package-group";

/** Konsultasi Online hanya dipilih lewat /daftar, tidak tampil di katalog layanan (spec 3.3). */
const CATALOG_SERVICE = { isActive: true, slug: { not: ONLINE_SERVICE_SLUG } } as const;

export type ServiceCategoryWithServices = Awaited<
  ReturnType<typeof getServiceCategoriesWithServices>
>[number];

export type ServiceWithCategory = NonNullable<Awaited<ReturnType<typeof getServiceBySlug>>>;

// Ditulis dari tipe Prisma, bukan diturunkan dari getPackagesByGroup: fungsi
// itu sendiri beranotasi PackageGroup[], jadi menurunkannya akan melingkar.
export type PackageWithItems = Package & { items: PackageItem[] };

export type PackageGroup = { groupName: string; packages: PackageWithItems[] };

/** Kategori beserta layanan aktifnya. Kategori tanpa layanan aktif tidak dikembalikan. */
export async function getServiceCategoriesWithServices() {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      services: {
        where: CATALOG_SERVICE,
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return categories.filter((category) => category.services.length > 0);
}

export async function getServiceBySlug(slug: string) {
  return prisma.service.findFirst({
    where: { isActive: true, AND: [{ slug }, { slug: { not: ONLINE_SERVICE_SLUG } }] },
    include: { category: true },
  });
}

/** Layanan signature beserta kategorinya (foto kartu memakai foto kategori). */
export async function getSignatureServices(): Promise<ServiceWithCategory[]> {
  return prisma.service.findMany({
    where: { isSignature: true, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { category: true },
  });
}

/** Layanan aktif lain dalam kategori yang sama, untuk "Treatment lain di …" di halaman detail. */
export async function getRelatedServices(
  categoryId: string,
  excludeServiceId: string,
  limit = 3,
): Promise<Service[]> {
  return prisma.service.findMany({
    where: { categoryId, ...CATALOG_SERVICE, id: { not: excludeServiceId } },
    orderBy: { sortOrder: "asc" },
    take: limit,
  });
}

/** Jumlah treatment aktif, untuk angka di Beranda. */
export async function countActiveServices(): Promise<number> {
  return prisma.service.count({ where: CATALOG_SERVICE });
}

export async function getAllServiceSlugs(): Promise<string[]> {
  const rows = await prisma.service.findMany({
    where: CATALOG_SERVICE,
    select: { slug: true },
  });

  return rows.map((row) => row.slug);
}

export async function getPackagesByGroup(): Promise<PackageGroup[]> {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  return PACKAGE_GROUPS.map((groupName) => ({
    groupName: groupName as string,
    packages: packages.filter((pkg) => pkg.groupName === groupName),
  })).filter((group) => group.packages.length > 0);
}

export async function getActiveProducts(): Promise<Product[]> {
  return prisma.product.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

/** Kedua cabang, cabang aktif lebih dulu. */
export async function getBranches(): Promise<Branch[]> {
  return prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function getBranchBySlug(slug: string): Promise<Branch | null> {
  return prisma.branch.findUnique({ where: { slug } });
}

/** Staf yang tampil di halaman "Tim Dokter". Resepsionis dan admin tidak termasuk. */
export async function getPublicStaff(): Promise<Staff[]> {
  return prisma.staff.findMany({
    where: { isActive: true, showOnWebsite: true, role: { in: ["DOKTER", "TERAPIS"] } },
    orderBy: { sortOrder: "asc" },
  });
}
