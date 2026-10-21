import { prisma } from "@/lib/db";
import type { OtherCost, ServiceCostInput } from "@/lib/costing";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { requireCapability } from "@/server/session";

/** Bacaan halaman Layanan & Harga (spec layanan situs 5). Setiap fungsi memeriksa hak `catalog:manage`. */
export type InternalServiceRow = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  normalPrice: number | null;
  promoPrice: number;
  durationMin: number;
  requiresDoctor: boolean;
  isActive: boolean;
  /** Jumlah layanan situs aktif yang menautkan layanan ini; 0 = "Hanya internal". */
  siteCount: number;
  /** Biaya lainnya per sesi, urut seperti di dialog (spec biaya lainnya BL1). */
  otherCosts: OtherCost[];
} & ServiceCostInput;

export type InternalCategory = { id: string; name: string; services: InternalServiceRow[] };

export type SiteServiceRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceNote: string | null;
  isSignature: boolean;
  isActive: boolean;
  sortOrder: number;
  categoryId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceNormalPrice: number | null;
  serviceActive: boolean;
};

export type SiteCategory = { id: string; name: string; services: SiteServiceRow[] };

export async function getInternalCatalog(): Promise<InternalCategory[]> {
  await requireCapability("catalog:manage");
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      services: {
        where: { slug: { not: ONLINE_SERVICE_SLUG } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          categoryId: true,
          normalPrice: true,
          promoPrice: true,
          durationMin: true,
          requiresDoctor: true,
          isActive: true,
          materialCost: true,
          toolCost: true,
          commissionKind: true,
          commissionValue: true,
          costLines: { orderBy: { sortOrder: "asc" }, select: { name: true, amount: true } },
          _count: { select: { siteServices: { where: { isActive: true } } } },
        },
      },
    },
  });
  return categories
    .filter((category) => category.services.length > 0)
    .map((category) => ({
      id: category.id,
      name: category.name,
      services: category.services.map(({ _count, costLines, ...service }) => ({ ...service, siteCount: _count.siteServices, otherCosts: costLines })),
    }));
}

export async function listServiceCategories(): Promise<{ id: string; name: string }[]> {
  await requireCapability("catalog:manage");
  return prisma.serviceCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
}

export async function getSiteCatalog(): Promise<SiteCategory[]> {
  await requireCapability("catalog:manage");
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      siteServices: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          imageUrl: true,
          priceNote: true,
          isSignature: true,
          isActive: true,
          sortOrder: true,
          categoryId: true,
          serviceId: true,
          service: { select: { name: true, promoPrice: true, normalPrice: true, isActive: true } },
        },
      },
    },
  });
  return categories
    .filter((category) => category.siteServices.length > 0)
    .map((category) => ({
      id: category.id,
      name: category.name,
      services: category.siteServices.map(({ service, ...row }) => ({
        ...row,
        serviceName: service.name,
        servicePrice: service.promoPrice,
        serviceNormalPrice: service.normalPrice,
        serviceActive: service.isActive,
      })),
    }));
}
