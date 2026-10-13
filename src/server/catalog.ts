import type { Branch, Package, PackageItem, Product, ServiceCategory, Staff } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { PACKAGE_GROUPS } from "@/lib/package-group";

/**
 * Layanan di situs publik (spec layanan situs 3): isi dari layanan situs, harga dan durasi dari layanan internal yang ditautkan.
 * Tampil hanya bila keduanya aktif. Konsultasi Online tidak pernah tampil (spec konsultasi online 3.3).
 */
const VISIBLE = { isActive: true, service: { isActive: true, slug: { not: ONLINE_SERVICE_SLUG } } } as const;

// Kolom biaya dan komisi sengaja tidak dipilih: data situs tidak pernah memuatnya (spec layanan situs 3).
const SITE_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  imageUrl: true,
  priceNote: true,
  isSignature: true,
  sortOrder: true,
  categoryId: true,
  serviceId: true,
  service: { select: { promoPrice: true, normalPrice: true, durationMin: true } },
} as const;

export type CatalogService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceNote: string | null;
  isSignature: boolean;
  sortOrder: number;
  categoryId: string;
  serviceId: string;
  promoPrice: number;
  normalPrice: number | null;
  durationMin: number;
};

export type ServiceWithCategory = CatalogService & { category: ServiceCategory };

export type ServiceCategoryWithServices = ServiceCategory & { services: CatalogService[] };

type SiteRow = Omit<CatalogService, "promoPrice" | "normalPrice" | "durationMin"> & {
  service: { promoPrice: number; normalPrice: number | null; durationMin: number };
};

function toCatalogService({ service, ...row }: SiteRow): CatalogService {
  return { ...row, promoPrice: service.promoPrice, normalPrice: service.normalPrice, durationMin: service.durationMin };
}

// Ditulis dari tipe Prisma, bukan diturunkan dari getPackagesByGroup: fungsi
// itu sendiri beranotasi PackageGroup[], jadi menurunkannya akan melingkar.
export type PackageWithItems = Package & { items: PackageItem[] };

export type PackageGroup = { groupName: string; packages: PackageWithItems[] };

/** Kategori beserta layanan situs yang tampil. Kategori tanpa layanan yang tampil tidak dikembalikan. */
export async function getServiceCategoriesWithServices(): Promise<ServiceCategoryWithServices[]> {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { siteServices: { where: VISIBLE, orderBy: { sortOrder: "asc" }, select: SITE_SELECT } },
  });

  return categories
    .map(({ siteServices, ...category }) => ({ ...category, services: siteServices.map(toCatalogService) }))
    .filter((category) => category.services.length > 0);
}

export async function getServiceBySlug(slug: string): Promise<ServiceWithCategory | null> {
  const row = await prisma.siteService.findFirst({
    where: { slug, ...VISIBLE },
    select: { ...SITE_SELECT, category: true },
  });
  return row ? { ...toCatalogService(row), category: row.category } : null;
}

/** Layanan signature beserta kategorinya (foto kartu memakai foto kategori). */
export async function getSignatureServices(): Promise<ServiceWithCategory[]> {
  const rows = await prisma.siteService.findMany({
    where: { isSignature: true, ...VISIBLE },
    orderBy: { sortOrder: "asc" },
    select: { ...SITE_SELECT, category: true },
  });
  return rows.map((row) => ({ ...toCatalogService(row), category: row.category }));
}

/** Layanan situs lain dalam kategori yang sama, untuk "Treatment lain di …" di halaman detail. */
export async function getRelatedServices(categoryId: string, excludeServiceId: string, limit = 3): Promise<CatalogService[]> {
  const rows = await prisma.siteService.findMany({
    where: { categoryId, ...VISIBLE, id: { not: excludeServiceId } },
    orderBy: { sortOrder: "asc" },
    take: limit,
    select: SITE_SELECT,
  });
  return rows.map(toCatalogService);
}

/** Jumlah treatment yang tampil di situs, untuk angka di Beranda. */
export async function countActiveServices(): Promise<number> {
  return prisma.siteService.count({ where: VISIBLE });
}

export async function getAllServiceSlugs(): Promise<string[]> {
  const rows = await prisma.siteService.findMany({ where: VISIBLE, select: { slug: true } });
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
