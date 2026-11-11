import { prisma } from "@/lib/db";
import type { LegacyCatalogPackage } from "@/lib/legacy-package";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman Paket untuk dialog paket lama (spec paket lama bagian 4, PL4).

/** Semua paket katalog, yang aktif dulu (paket yang sudah tidak dijual tetap bisa menjadi paket lama). */
export async function listLegacyCatalog(): Promise<LegacyCatalogPackage[]> {
  await requireCapability("invoice:manage");
  const rows = await prisma.treatmentPackage.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      visitIntervalDays: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, sessions: true, perVisit: true, service: { select: { name: true } }, item: { select: { name: true, unit: true } } },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    visitIntervalDays: row.visitIntervalDays,
    items: row.items.map((item) => ({
      id: item.id,
      name: item.service?.name ?? item.item?.name ?? "",
      unit: item.item?.unit ?? null,
      sessions: item.sessions,
      perVisit: item.perVisit,
    })),
  }));
}
