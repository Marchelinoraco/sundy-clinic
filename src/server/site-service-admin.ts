"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { validateSiteService, type SiteServiceInput } from "@/lib/service-catalog";
import { recordAudit } from "@/server/audit";
import { revalidateSitePages } from "@/server/catalog-revalidate";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";
import { removeSiteServicePhotoFor } from "@/server/site-service-photo";

const SLUG_TAKEN = "Alamat (slug) sudah dipakai layanan situs lain.";
const NOT_FOUND = "Layanan situs tidak ditemukan.";

/** Tautan wajib ke layanan internal yang ada, bukan Konsultasi Online; kategori harus ada (spec layanan situs 2.2). */
async function checkLinks(value: SiteServiceInput) {
  const service = await prisma.service.findUnique({ where: { id: value.serviceId }, select: { slug: true } });
  if (!service || service.slug === ONLINE_SERVICE_SLUG) throw new UserFacingError("Pilih layanan internal yang sah.");
  const category = await prisma.serviceCategory.findUnique({ where: { id: value.categoryId }, select: { id: true } });
  if (!category) throw new UserFacingError("Pilih kategori.");
}

async function slugGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError(SLUG_TAKEN);
    throw error;
  }
}

export async function createSiteService(input: SiteServiceInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const checked = validateSiteService(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    await checkLinks(checked.value);

    const created = await slugGuard(() => prisma.siteService.create({ data: checked.value, select: { id: true, slug: true, name: true } }));
    await recordAudit({ actor, action: "site_service.create", entity: "SiteService", entityId: created.id, summary: `${created.name} (/layanan/${created.slug})` });
    revalidateSitePages([created.slug]);
    return { id: created.id };
  });
}

export async function updateSiteService(input: { id: string } & SiteServiceInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const checked = validateSiteService(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const before = await prisma.siteService.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true, slug: true } });
    if (!before) throw new UserFacingError(NOT_FOUND);
    await checkLinks(checked.value);

    const value = checked.value;
    await slugGuard(() => prisma.siteService.update({ where: { id: before.id }, data: value }));
    await recordAudit({
      actor,
      action: "site_service.update",
      entity: "SiteService",
      entityId: before.id,
      summary: before.slug === value.slug ? value.name : `${value.name}: /layanan/${before.slug} -> /layanan/${value.slug}`,
    });
    revalidateSitePages([before.slug, value.slug]);
  });
}

export async function setSiteServiceActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const row = await prisma.siteService.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true, slug: true, name: true } });
    if (!row) throw new UserFacingError(NOT_FOUND);
    const active = input?.active === true;

    await prisma.siteService.update({ where: { id: row.id }, data: { isActive: active } });
    await recordAudit({ actor, action: active ? "site_service.activate" : "site_service.deactivate", entity: "SiteService", entityId: row.id, summary: row.name });
    revalidateSitePages([row.slug]);
  });
}

export async function removeSiteServicePhoto(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    await removeSiteServicePhotoFor(actor, id);
  });
}
