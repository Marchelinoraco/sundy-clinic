"use server";

import { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { categorySlugBase, nextFreeSlug, validateServiceCategory, type ServiceCategoryInput } from "@/lib/service-category";
import { recordAudit } from "@/server/audit";
import { revalidateSitePages } from "@/server/catalog-revalidate";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

/** Tambah, ubah, urutkan, dan hapus kategori layanan (spec kategori layanan KL1–KL8, KL12). */
const NOT_FOUND = "Kategori tidak ditemukan.";
const NAME_TAKEN = "Kategori dengan nama ini sudah ada.";
const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";

const yesNo = (value: boolean) => (value ? "ya" : "tidak");

async function nameGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError(NAME_TAKEN);
    throw error;
  }
}

/** Halaman situs yang memuat kategori ini: halaman katalog dan halaman layanan situs di dalamnya. */
async function revalidateCategoryPages(categoryId: string): Promise<void> {
  const linked = await prisma.siteService.findMany({ where: { categoryId }, select: { slug: true } });
  revalidateSitePages(linked.map((row) => row.slug));
}

function checked(input: unknown): ServiceCategoryInput {
  const result = validateServiceCategory(input);
  if (!result.ok) throw new UserFacingError(result.message);
  return result.value;
}

export async function createServiceCategory(input: ServiceCategoryInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const value = checked(input);
    const base = categorySlugBase(value.name);
    const taken = await prisma.serviceCategory.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
    const last = await prisma.serviceCategory.aggregate({ _max: { sortOrder: true } });

    const created = await nameGuard(() =>
      prisma.serviceCategory.create({
        data: { ...value, slug: nextFreeSlug(base, taken.map((row) => row.slug)), sortOrder: (last._max.sortOrder ?? 0) + 1 },
        select: { id: true },
      }),
    );
    await recordAudit({ actor, action: "service_category.create", entity: "ServiceCategory", entityId: created.id, summary: value.name });
    revalidateSitePages([]);
    return { id: created.id };
  });
}

export async function updateServiceCategory(input: { id: string } & ServiceCategoryInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const value = checked(input);
    const before = await prisma.serviceCategory.findUnique({
      where: { id: String(input?.id ?? "") },
      select: { id: true, name: true, description: true, selfBookable: true },
    });
    if (!before) throw new UserFacingError(NOT_FOUND);

    await nameGuard(() => prisma.serviceCategory.update({ where: { id: before.id }, data: value }));
    const changes: string[] = [];
    if (before.description !== value.description) changes.push("deskripsi diubah");
    if (before.selfBookable !== value.selfBookable) changes.push(`pasien boleh memilih sendiri: ${yesNo(before.selfBookable)} → ${yesNo(value.selfBookable)}`);
    const name = before.name === value.name ? value.name : `${before.name} -> ${value.name}`;
    await recordAudit({
      actor,
      action: "service_category.update",
      entity: "ServiceCategory",
      entityId: before.id,
      summary: changes.length > 0 ? `${name} (${changes.join(", ")})` : name,
    });
    await revalidateCategoryPages(before.id);
  });
}

/** Menukar posisi dengan tetangganya lalu menulis ulang urutan semua kategori menjadi 1..n (aman bila ada urutan kembar). */
export async function moveServiceCategory(input: { id: string; direction: "up" | "down" }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const direction = input?.direction;
    if (direction !== "up" && direction !== "down") throw new UserFacingError(INVALID);
    const id = String(input?.id ?? "");

    const moved = await prisma.$transaction(async (tx) => {
      const rows = await tx.serviceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, sortOrder: true } });
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new UserFacingError(NOT_FOUND);
      const other = direction === "up" ? index - 1 : index + 1;
      if (other < 0 || other >= rows.length) return null;

      const order = [...rows];
      [order[index], order[other]] = [order[other], order[index]];
      for (const [position, row] of order.entries()) {
        if (row.sortOrder !== position + 1) await tx.serviceCategory.update({ where: { id: row.id }, data: { sortOrder: position + 1 } });
      }
      return rows[index];
    });
    if (!moved) return;

    await recordAudit({
      actor,
      action: "service_category.move",
      entity: "ServiceCategory",
      entityId: moved.id,
      summary: `${moved.name}: ${direction === "up" ? "naik" : "turun"}`,
    });
    revalidateSitePages([]);
  });
}

export async function deleteServiceCategory(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const row = await prisma.serviceCategory.findUnique({
      where: { id: String(id ?? "") },
      select: {
        id: true,
        name: true,
        services: { where: { slug: ONLINE_SERVICE_SLUG }, select: { id: true } },
        _count: { select: { services: true, siteServices: true } },
      },
    });
    if (!row) throw new UserFacingError(NOT_FOUND);
    if (row.services.length > 0) throw new UserFacingError("Kategori ini berisi Konsultasi Online dan tidak bisa dihapus.");
    const notEmpty = (services: number, siteServices: number) =>
      new UserFacingError(
        `Kategori ini masih berisi ${services} layanan internal dan ${siteServices} layanan situs. Pindahkan dulu ke kategori lain lewat tombol Ubah pada layanannya.`,
      );
    if (row._count.services > 0 || row._count.siteServices > 0) throw notEmpty(row._count.services, row._count.siteServices);

    try {
      await prisma.serviceCategory.delete({ where: { id: row.id } });
    } catch (error) {
      // Layanan dipindah ke kategori ini tepat di antara pemeriksaan dan penghapusan: basis data menolak (KL7).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        const [services, siteServices] = await Promise.all([
          prisma.service.count({ where: { categoryId: row.id } }),
          prisma.siteService.count({ where: { categoryId: row.id } }),
        ]);
        throw notEmpty(services, siteServices);
      }
      throw error;
    }
    await recordAudit({ actor, action: "service_category.delete", entity: "ServiceCategory", entityId: row.id, summary: row.name });
    revalidateSitePages([]);
  });
}
