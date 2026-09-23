import type { Branch, Doctor, Package, PackageItem, Product, Service } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Urutan kelompok paket sebagaimana ditampilkan ke pengunjung. */
const PACKAGE_GROUP_ORDER = ["MAX", "LUX", "ACTIVE"] as const;

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
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return categories.filter((category) => category.services.length > 0);
}

export async function getServiceBySlug(slug: string) {
  return prisma.service.findFirst({
    where: { slug, isActive: true },
    include: { category: true },
  });
}

export async function getSignatureServices(): Promise<Service[]> {
  return prisma.service.findMany({
    where: { isSignature: true, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getAllServiceSlugs(): Promise<string[]> {
  const rows = await prisma.service.findMany({
    where: { isActive: true },
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

  return PACKAGE_GROUP_ORDER.map((groupName) => ({
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

export async function getActiveDoctors(): Promise<Doctor[]> {
  return prisma.doctor.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}
