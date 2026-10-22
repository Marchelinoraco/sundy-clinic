"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { totalCostPerSession } from "@/lib/costing";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import {
  packageContentsLabel,
  packageCostSummary,
  packagePriceError,
  validateTreatmentPackage,
  type PackageCostLine,
  type TreatmentPackageInput,
  type ValidTreatmentPackage,
} from "@/lib/treatment-package";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export type TreatmentPackageView = {
  id: string;
  name: string;
  price: number;
  validDays: number;
  /** Jarak antar kunjungan rencana, hari (spec jadwal paket JP2). */
  visitIntervalDays: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Treatment (serviceId) atau barang stok (itemId, dengan satuan dan jumlah per kunjungan) — spec paket barang PB1, jadwal paket JP2. */
  items: { serviceId: string | null; itemId: string | null; serviceName: string; unit: string | null; sessions: number; perVisit: number | null }[];
  /** "3× Facial, 30 kapsul Slimming". */
  contents: string;
  /** Berapa kali paket ini sudah difinalkan di tagihan. */
  soldCount: number;
};
/** Baris tabel katalog: `cost` = total biaya isi, `null` bila ada barang tanpa harga beli (spec paket informatif PI6). */
export type CatalogPackage = TreatmentPackageView & { cost: number | null };
export type SellablePackage = { id: string; name: string; price: number; validDays: number; contents: string };
/** `price` = harga berlaku, `costPerSession` = total biaya per sesi (spec paket informatif PI1, PI7). */
export type PackageServiceOption = { id: string; name: string; categoryName: string; price: number; costPerSession: number };
/** `lastUnitCost` = harga beli terakhir, `null` bila belum pernah diisi (PI8). */
export type PackageStockOption = { id: string; name: string; unit: string; kindLabel: string; sellPrice: number | null; lastUnitCost: number | null };

const SELECT = {
  id: true,
  name: true,
  price: true,
  validDays: true,
  visitIntervalDays: true,
  description: true,
  isActive: true,
  sortOrder: true,
  items: {
    orderBy: { sortOrder: "asc" },
    select: { serviceId: true, itemId: true, sessions: true, perVisit: true, service: { select: { name: true } }, item: { select: { name: true, unit: true } } },
  },
  _count: { select: { patientPackages: true } },
} as const;
type Row = Prisma.TreatmentPackageGetPayload<{ select: typeof SELECT }>;

function view(row: Row): TreatmentPackageView {
  const items = row.items.map((item) => ({
    serviceId: item.serviceId,
    itemId: item.itemId,
    serviceName: item.service?.name ?? item.item?.name ?? "",
    unit: item.item?.unit ?? null,
    sessions: item.sessions,
    perVisit: item.perVisit,
  }));
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    validDays: row.validDays,
    visitIntervalDays: row.visitIntervalDays,
    description: row.description,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    items,
    contents: packageContentsLabel(items.map((item) => ({ name: item.serviceName, sessions: item.sessions, unit: item.unit }))),
    soldCount: row._count.patientPackages,
  };
}

const summaryOf = (row: TreatmentPackageView) => `${row.name}: ${formatRupiah(row.price)} · ${row.contents} · ${row.validDays} hari`;
/** Jumlah per kunjungan barang sudah diisi validasi (isian atau bawaan JP15). */
const itemRows = (value: ValidTreatmentPackage) =>
  value.items.map((item, index) => ({ serviceId: item.serviceId, itemId: item.itemId, sessions: item.sessions, perVisit: item.perVisit, sortOrder: index }));

function revalidate() {
  safeRevalidatePath("/admin/paket");
  safeRevalidatePath("/admin/tagihan");
}

async function assertNameFree(name: string, exceptId?: string) {
  const twin = await prisma.treatmentPackage.findFirst({
    where: { isActive: true, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (twin) throw new UserFacingError("Paket dengan nama ini sudah ada.");
}

type CostFacts = {
  services: Map<string, { name: string; price: number; costPerSession: number }>;
  items: Map<string, { name: string; sellPrice: number | null; lastUnitCost: number | null }>;
};

/**
 * Harga jual dan biaya per satuan isi paket, dibaca dari basis data (spec paket informatif PI1, PI7, PI8): total biaya per sesi
 * treatment pada harga katalognya; harga beli terakhir barang = batch terbaru yang sudah berharga.
 */
async function costFacts(serviceIds: readonly string[], itemIds: readonly string[]): Promise<CostFacts> {
  const [services, items, batches] = await Promise.all([
    prisma.service.findMany({
      where: { id: { in: [...serviceIds] } },
      select: {
        id: true,
        name: true,
        promoPrice: true,
        materialCost: true,
        toolCost: true,
        commissionKind: true,
        commissionValue: true,
        costLines: { select: { name: true, amount: true } },
      },
    }),
    prisma.stockItem.findMany({ where: { id: { in: [...itemIds] } }, select: { id: true, name: true, sellPrice: true } }),
    prisma.stockBatch.findMany({
      where: { itemId: { in: [...itemIds] }, unitCost: { not: null } },
      orderBy: [{ itemId: "asc" }, { createdAt: "desc" }],
      distinct: ["itemId"],
      select: { itemId: true, unitCost: true },
    }),
  ]);
  return {
    services: new Map(
      services.map((service) => [service.id, { name: service.name, price: service.promoPrice, costPerSession: totalCostPerSession(service, service.costLines, service.promoPrice) }]),
    ),
    items: new Map(items.map((item) => [item.id, { name: item.name, sellPrice: item.sellPrice, lastUnitCost: batches.find((batch) => batch.itemId === item.id)?.unitCost ?? null }])),
  };
}

function costLinesOf(items: readonly { serviceId: string | null; itemId: string | null; sessions: number }[], facts: CostFacts): PackageCostLine[] {
  return items.map((item) => {
    if (item.serviceId) {
      const service = facts.services.get(item.serviceId);
      return { name: service?.name ?? "", unitPrice: service?.price ?? 0, unitCost: service?.costPerSession ?? 0, quantity: item.sessions };
    }
    const goods = facts.items.get(item.itemId ?? "");
    return { name: goods?.name ?? "", unitPrice: goods?.sellPrice ?? null, unitCost: goods?.lastUnitCost ?? null, quantity: item.sessions };
  });
}

async function checkCatalog(value: ValidTreatmentPackage, exceptId?: string) {
  const serviceIds = value.items.flatMap((item) => (item.serviceId ? [item.serviceId] : []));
  const itemIds = value.items.flatMap((item) => (item.itemId ? [item.itemId] : []));
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds }, isActive: true }, select: { id: true } });
  if (services.length !== serviceIds.length) throw new UserFacingError("Treatment tidak ditemukan atau nonaktif.");
  const goods = await prisma.stockItem.findMany({ where: { id: { in: itemIds }, isActive: true }, select: { id: true } });
  if (goods.length !== itemIds.length) throw new UserFacingError("Barang tidak ditemukan atau nonaktif.");
  await assertNameFree(value.name, exceptId);
  // Tidak boleh ada barang tanpa harga beli, dan harga paket tidak boleh di bawah total biaya isi (spec paket informatif PI3, PI4).
  const lines = costLinesOf(value.items, await costFacts(serviceIds, itemIds));
  const error = packagePriceError(value.price, packageCostSummary(value.price, lines));
  if (error) throw new UserFacingError(error);
}

/** Semua paket katalog, aktif dulu (spec paket 4), dengan total biaya isi saat ini (spec paket informatif PI6). */
export async function listTreatmentPackages(): Promise<CatalogPackage[]> {
  await requireCapability("price:manage");
  const rows = await prisma.treatmentPackage.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }], select: SELECT });
  const items = rows.flatMap((row) => row.items);
  const facts = await costFacts(
    items.flatMap((item) => (item.serviceId ? [item.serviceId] : [])),
    items.flatMap((item) => (item.itemId ? [item.itemId] : [])),
  );
  return rows.map((row) => {
    const summary = packageCostSummary(row.price, costLinesOf(row.items, facts));
    return { ...view(row), cost: summary.complete ? summary.cost : null };
  });
}

/** Layanan aktif yang bisa menjadi isi paket. */
export async function listPackageServices(): Promise<PackageServiceOption[]> {
  await requireCapability("price:manage");
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, name: true, category: { select: { name: true } } },
  });
  const facts = await costFacts(services.map((service) => service.id), []);
  return services.map((service) => ({
    id: service.id,
    name: service.name,
    categoryName: service.category.name,
    price: facts.services.get(service.id)?.price ?? 0,
    costPerSession: facts.services.get(service.id)?.costPerSession ?? 0,
  }));
}

/** Obat dan produk aktif yang bisa menjadi isi paket (spec paket barang PB1), dengan harga jual dan harga beli terakhir (spec paket informatif PI1). */
export async function listPackageStockItems(): Promise<PackageStockOption[]> {
  await requireCapability("price:manage");
  const items = await prisma.stockItem.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true, kind: true } });
  const facts = await costFacts([], items.map((item) => item.id));
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    unit: item.unit,
    kindLabel: item.kind === "OBAT" ? "Obat" : "Produk",
    sellPrice: facts.items.get(item.id)?.sellPrice ?? null,
    lastUnitCost: facts.items.get(item.id)?.lastUnitCost ?? null,
  }));
}

/** Paket aktif untuk dialog "Jual paket" di tagihan (spec paket 5). */
export async function listSellablePackages(): Promise<SellablePackage[]> {
  await requireCapability("invoice:manage");
  const rows = await prisma.treatmentPackage.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: SELECT });
  return rows.map(view).map(({ id, name, price, validDays, contents }) => ({ id, name, price, validDays, contents }));
}

export async function createTreatmentPackage(input: TreatmentPackageInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const checked = validateTreatmentPackage(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    await checkCatalog(value);
    const last = await prisma.treatmentPackage.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.treatmentPackage.create({
      data: {
        name: value.name,
        price: value.price,
        validDays: value.validDays,
        visitIntervalDays: value.visitIntervalDays,
        description: value.description,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        items: { create: itemRows(value) },
      },
      select: SELECT,
    });
    await recordAudit({ actor, action: "treatment-package.create", entity: "TreatmentPackage", entityId: created.id, summary: summaryOf(view(created)) });
    revalidate();
    return { id: created.id };
  });
}

/** Mengubah katalog tidak mengubah paket yang sudah dijual: isinya disalin saat dijual (spec paket 4). */
export async function updateTreatmentPackage(id: string, input: TreatmentPackageInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const checked = validateTreatmentPackage(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    const existing = await prisma.treatmentPackage.findUnique({ where: { id: String(id ?? "") }, select: { id: true } });
    if (!existing) throw new UserFacingError("Paket tidak ditemukan.");
    await checkCatalog(value, existing.id);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.treatmentPackageItem.deleteMany({ where: { packageId: existing.id } });
      return tx.treatmentPackage.update({
        where: { id: existing.id },
        data: {
          name: value.name,
          price: value.price,
          validDays: value.validDays,
          visitIntervalDays: value.visitIntervalDays,
          description: value.description,
          items: { create: itemRows(value) },
        },
        select: SELECT,
      });
    });
    await recordAudit({ actor, action: "treatment-package.update", entity: "TreatmentPackage", entityId: existing.id, summary: summaryOf(view(updated)) });
    revalidate();
  });
}

export async function setTreatmentPackageActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const on = active === true;
    const existing = await prisma.treatmentPackage.findUnique({ where: { id: String(id ?? "") }, select: { id: true, name: true } });
    if (!existing) throw new UserFacingError("Paket tidak ditemukan.");
    if (on) await assertNameFree(existing.name, existing.id);
    await prisma.treatmentPackage.update({ where: { id: existing.id }, data: { isActive: on } });
    await recordAudit({
      actor,
      action: on ? "treatment-package.activate" : "treatment-package.deactivate",
      entity: "TreatmentPackage",
      entityId: existing.id,
      summary: existing.name,
    });
    revalidate();
  });
}
