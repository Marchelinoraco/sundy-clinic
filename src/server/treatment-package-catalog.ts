"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { packageContentsLabel, validateTreatmentPackage, type TreatmentPackageInput, type ValidTreatmentPackage } from "@/lib/treatment-package";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export type TreatmentPackageView = {
  id: string;
  name: string;
  price: number;
  validDays: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Treatment (serviceId) atau barang stok (itemId, dengan satuan) — spec paket barang PB1. */
  items: { serviceId: string | null; itemId: string | null; serviceName: string; unit: string | null; sessions: number }[];
  /** "3× Facial, 30 kapsul Slimming". */
  contents: string;
  /** Berapa kali paket ini sudah difinalkan di tagihan. */
  soldCount: number;
};
export type SellablePackage = { id: string; name: string; price: number; validDays: number; contents: string };
export type PackageServiceOption = { id: string; name: string; categoryName: string };
export type PackageStockOption = { id: string; name: string; unit: string; kindLabel: string };

const SELECT = {
  id: true,
  name: true,
  price: true,
  validDays: true,
  description: true,
  isActive: true,
  sortOrder: true,
  items: {
    orderBy: { sortOrder: "asc" },
    select: { serviceId: true, itemId: true, sessions: true, service: { select: { name: true } }, item: { select: { name: true, unit: true } } },
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
  }));
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    validDays: row.validDays,
    description: row.description,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    items,
    contents: packageContentsLabel(items.map((item) => ({ name: item.serviceName, sessions: item.sessions, unit: item.unit }))),
    soldCount: row._count.patientPackages,
  };
}

const summaryOf = (row: TreatmentPackageView) => `${row.name}: ${formatRupiah(row.price)} · ${row.contents} · ${row.validDays} hari`;
const itemRows = (value: ValidTreatmentPackage) =>
  value.items.map((item, index) => ({ serviceId: item.serviceId, itemId: item.itemId, sessions: item.sessions, sortOrder: index }));

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

async function checkCatalog(value: ValidTreatmentPackage, exceptId?: string) {
  const serviceIds = value.items.flatMap((item) => (item.serviceId ? [item.serviceId] : []));
  const itemIds = value.items.flatMap((item) => (item.itemId ? [item.itemId] : []));
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds }, isActive: true }, select: { id: true } });
  if (services.length !== serviceIds.length) throw new UserFacingError("Treatment tidak ditemukan atau nonaktif.");
  const goods = await prisma.stockItem.findMany({ where: { id: { in: itemIds }, isActive: true }, select: { id: true } });
  if (goods.length !== itemIds.length) throw new UserFacingError("Barang tidak ditemukan atau nonaktif.");
  await assertNameFree(value.name, exceptId);
}

/** Semua paket katalog, aktif dulu (spec paket 4). */
export async function listTreatmentPackages(): Promise<TreatmentPackageView[]> {
  await requireCapability("price:manage");
  const rows = await prisma.treatmentPackage.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }], select: SELECT });
  return rows.map(view);
}

/** Layanan aktif yang bisa menjadi isi paket. */
export async function listPackageServices(): Promise<PackageServiceOption[]> {
  await requireCapability("price:manage");
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, name: true, category: { select: { name: true } } },
  });
  return services.map((service) => ({ id: service.id, name: service.name, categoryName: service.category.name }));
}

/** Obat dan produk aktif yang bisa menjadi isi paket (spec paket barang PB1). Tanpa harga: jatah paket tidak berharga sendiri. */
export async function listPackageStockItems(): Promise<PackageStockOption[]> {
  await requireCapability("price:manage");
  const items = await prisma.stockItem.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true, kind: true } });
  return items.map((item) => ({ id: item.id, name: item.name, unit: item.unit, kindLabel: item.kind === "OBAT" ? "Obat" : "Produk" }));
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
        data: { name: value.name, price: value.price, validDays: value.validDays, description: value.description, items: { create: itemRows(value) } },
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
