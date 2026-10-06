"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { safeRevalidatePath } from "@/lib/revalidate";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { validatePriceChange, type PriceInput } from "@/lib/price-validation";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export async function updateServicePrice(
  input: PriceInput & { id: string },
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");

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
    safeRevalidatePath("/layanan");
    safeRevalidatePath(`/layanan/${after.slug}`);
    safeRevalidatePath("/");
  });
}

export async function setServiceActive(id: string, isActive: boolean): Promise<void> {
  const actor = await requireCapability("content:manage");

  const updated = await prisma.service.update({ where: { id }, data: { isActive } });

  await recordAudit({
    actor,
    action: isActive ? "service.activate" : "service.deactivate",
    entity: "Service",
    entityId: id,
    summary: updated.name,
  });

  safeRevalidatePath("/layanan");
  safeRevalidatePath(`/layanan/${updated.slug}`);
  safeRevalidatePath("/");
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
