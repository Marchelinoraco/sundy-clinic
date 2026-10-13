"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { safeRevalidatePath } from "@/lib/revalidate";
import { prisma } from "@/lib/db";
import { CONSULTATION_SERVICE_SLUG, isConsultationDuration } from "@/lib/booking-rules";
import { serviceCostSummary, validateServiceCost, type ServiceCostInput } from "@/lib/costing";
import { formatRupiah } from "@/lib/format";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { validatePriceChange, type PriceInput } from "@/lib/price-validation";
import { validateInternalService, type InternalServiceInput } from "@/lib/service-catalog";
import { slugify } from "@/lib/slug";
import { recordAudit } from "@/server/audit";
import { revalidateServicePages } from "@/server/catalog-revalidate";
import { getConsultationMinutes } from "@/server/consultation-duration";
import { requireCapability } from "@/server/session";

export async function updateServicePrice(
  input: PriceInput & { id: string },
): Promise<ActionResult> {
  return runAction(async () => {
    // Harga jual treatment diisi Admin Keuangan dan Super Admin (spec harga modal M5).
    const actor = await requireCapability("price:manage");

    const error = validatePriceChange(input);
    if (error) throw new UserFacingError(error);

    const before = await prisma.service.findUniqueOrThrow({ where: { id: input.id } });
    const after = await prisma.service.update({
      where: { id: input.id },
      data: { normalPrice: input.normalPrice, promoPrice: input.promoPrice },
    });

    await recordAudit({
      actor,
      action: "service.price.update",
      entity: "Service",
      entityId: after.id,
      summary: `${after.name}: ${formatRupiah(before.promoPrice)} -> ${formatRupiah(after.promoPrice)}`,
    });

    // Halaman publik di-prerender. Tanpa ini, harga baru tidak muncul sampai
    // deploy berikutnya.
    await revalidateServicePages(after.id);
  });
}

/** Biaya bahan, alat, dan komisi pelaksana per sesi (spec harga modal 5). */
export async function updateServiceCost(input: { id: string } & ServiceCostInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const checked = validateServiceCost(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const service = await prisma.service.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true, name: true } });
    if (!service) throw new UserFacingError("Layanan tidak ditemukan.");
    await prisma.service.update({ where: { id: service.id }, data: checked.value });
    await recordAudit({ actor, action: "service.cost", entity: "Service", entityId: service.id, summary: `${service.name}: ${serviceCostSummary(checked.value)}` });
    safeRevalidatePath("/admin/layanan");
  });
}

const SERVICE_NOT_FOUND = "Layanan tidak ditemukan.";

/** Layanan yang boleh diubah lewat katalog internal: semua kecuali Konsultasi Online, yang punya kartunya sendiri. */
async function findEditableService(id: unknown) {
  const service = await prisma.service.findUnique({ where: { id: String(id ?? "") }, select: { id: true, slug: true, name: true } });
  if (!service || service.slug === ONLINE_SERVICE_SLUG) throw new UserFacingError(SERVICE_NOT_FOUND);
  return service;
}

async function assertCategory(categoryId: string) {
  const category = await prisma.serviceCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) throw new UserFacingError("Pilih kategori.");
}

/** Nama unik tanpa membedakan huruf besar/kecil, supaya pilihan di tagihan tidak kembar (spec layanan situs 2.1). */
async function assertUniqueName(name: string, exceptId: string | null) {
  const clash = await prisma.service.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new UserFacingError("Nama layanan sudah dipakai layanan lain.");
}

/** Slug internal dibuat sekali dari nama, tidak pernah tampil, dan tidak berubah sesudahnya. */
async function uniqueServiceSlug(name: string): Promise<string> {
  const base = slugify(name) || "layanan";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await prisma.service.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}

/** Tambah layanan internal (spec layanan situs 5.1); belum tampil di situs sampai ada layanan situs yang menautkannya. */
export async function createInternalService(input: InternalServiceInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const checked = validateInternalService(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    await assertCategory(value.categoryId);
    await assertUniqueName(value.name, null);

    const created = await prisma.service.create({ data: { ...value, slug: await uniqueServiceSlug(value.name) }, select: { id: true, name: true } });
    await recordAudit({
      actor,
      action: "service.create",
      entity: "Service",
      entityId: created.id,
      summary: `${created.name}: ${formatRupiah(value.promoPrice)}, ${value.durationMin} menit`,
    });
    await revalidateServicePages(created.id);
    return { id: created.id };
  });
}

export async function updateInternalService(input: { id: string } & InternalServiceInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const checked = validateInternalService(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    const before = await findEditableService(input?.id);
    if (before.slug === CONSULTATION_SERVICE_SLUG && !isConsultationDuration(value.durationMin)) {
      throw new UserFacingError("Durasi Konsultasi Dokter harus 15, 30, 45, atau 60 menit.");
    }
    // Tanpa ini, terapis ikut ditawarkan untuk konsultasi di /daftar (review akhir layanan situs).
    if (before.slug === CONSULTATION_SERVICE_SLUG && !value.requiresDoctor) throw new UserFacingError("Konsultasi Dokter selalu ditangani dokter.");
    await assertCategory(value.categoryId);
    await assertUniqueName(value.name, before.id);

    await prisma.service.update({ where: { id: before.id }, data: value });
    await recordAudit({
      actor,
      action: "service.update",
      entity: "Service",
      entityId: before.id,
      summary: before.name === value.name ? value.name : `${before.name} -> ${value.name}`,
    });
    await revalidateServicePages(before.id);
  });
}

/** Aktif/nonaktif layanan internal; menonaktifkan ikut menyembunyikan layanan situs yang menautkannya (spec layanan situs 3). */
export async function setServiceActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const service = await findEditableService(input?.id);
    const active = input?.active === true;
    if (!active && service.slug === CONSULTATION_SERVICE_SLUG) throw new UserFacingError("Konsultasi Dokter tidak bisa dinonaktifkan.");

    await prisma.service.update({ where: { id: service.id }, data: { isActive: active } });
    await recordAudit({ actor, action: active ? "service.activate" : "service.deactivate", entity: "Service", entityId: service.id, summary: service.name });
    await revalidateServicePages(service.id);
  });
}

export type OnlineServiceSettings = { price: number; durationMin: number; active: boolean };

const ONLINE_DURATIONS = [15, 30, 45, 60];

/** Pengaturan layanan Konsultasi Online (spec konsultasi online 3.3); null bila barisnya belum ada. */
export async function getOnlineServiceSettings(): Promise<OnlineServiceSettings | null> {
  await requireCapability("content:manage");
  const service = await prisma.service.findUnique({
    where: { slug: ONLINE_SERVICE_SLUG },
    select: { promoPrice: true, durationMin: true, isActive: true },
  });
  return service ? { price: service.promoPrice, durationMin: service.durationMin, active: service.isActive } : null;
}

export async function updateOnlineService(input: OnlineServiceSettings): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    const price = Number(input?.price);
    const durationMin = Number(input?.durationMin);
    const active = input?.active === true;
    if (!Number.isInteger(price) || price < 0) throw new UserFacingError("Harga tidak sah.");
    if (!ONLINE_DURATIONS.includes(durationMin)) throw new UserFacingError("Durasi harus 15, 30, 45, atau 60 menit.");
    if (active && price <= 0) throw new UserFacingError("Isi harga Konsultasi Online sebelum mengaktifkannya.");

    const updated = await prisma.service.update({
      where: { slug: ONLINE_SERVICE_SLUG },
      data: { promoPrice: price, durationMin, isActive: active },
    });
    await recordAudit({
      actor,
      action: "service.online.update",
      entity: "Service",
      entityId: updated.id,
      summary: `${updated.name}: ${formatRupiah(price)}, ${durationMin} menit, ${active ? "aktif" : "nonaktif"}`,
    });
    safeRevalidatePath("/admin/layanan");
    safeRevalidatePath("/daftar");
    safeRevalidatePath("/admin/booking/baru");
  });
}

/** Lama konsultasi klinik untuk kartu di Layanan & Harga. */
export async function getClinicConsultationMinutes(): Promise<number> {
  await requireCapability("content:manage");
  return getConsultationMinutes();
}

/**
 * Mengubah lama konsultasi klinik (layanan Konsultasi Dokter). Jam mulai konsultasi tetap
 * ditawarkan tiap 15 menit; booking yang sudah ada tidak diubah.
 */
export async function updateClinicConsultationDuration(minutes: number): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    if (!isConsultationDuration(minutes)) throw new UserFacingError("Durasi harus 15, 30, 45, atau 60 menit.");

    const before = await prisma.service.findUnique({ where: { slug: CONSULTATION_SERVICE_SLUG } });
    if (!before) throw new UserFacingError("Layanan Konsultasi Dokter belum ada.");
    const updated = await prisma.service.update({ where: { id: before.id }, data: { durationMin: minutes } });
    await recordAudit({
      actor,
      action: "service.consultation.update",
      entity: "Service",
      entityId: updated.id,
      summary: `${updated.name}: ${before.durationMin} menit -> ${minutes} menit`,
    });
    safeRevalidatePath("/admin/layanan");
    safeRevalidatePath("/admin/booking/baru");
    safeRevalidatePath("/admin");
  });
}
