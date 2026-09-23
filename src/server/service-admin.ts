"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { validatePriceChange, type PriceInput } from "@/lib/price-validation";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export async function updateServicePrice(input: PriceInput & { id: string }): Promise<void> {
  const actor = await requireCapability("content:manage");

  const error = validatePriceChange(input);
  if (error) throw new Error(error);

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
  revalidatePath("/layanan");
  revalidatePath(`/layanan/${after.slug}`);
  revalidatePath("/");
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

  revalidatePath("/layanan");
  revalidatePath(`/layanan/${updated.slug}`);
  revalidatePath("/");
}
