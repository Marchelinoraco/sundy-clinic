"use server";

import { safeRevalidatePath } from "@/lib/revalidate";
import type { Staff, StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Slug yang belum dipakai staf lain.
 *
 * Berkas ini menyandang "use server", sehingga setiap ekspornya WAJIB berupa
 * fungsi async — Next.js menolak ekspor sinkron dari server action. Karena itu
 * `slugify` yang murni tinggal di src/lib/slug.ts, bukan di sini.
 */
export async function uniqueStaffSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  while (await prisma.staff.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

export async function listStaff(): Promise<Staff[]> {
  await requireCapability("staff:manage");
  return prisma.staff.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] });
}

export async function createStaff(input: {
  name: string;
  role: StaffRole;
  showOnWebsite?: boolean;
}): Promise<Staff> {
  const actor = await requireCapability("staff:manage");

  const slug = await uniqueStaffSlug(input.name);
  const created = await prisma.staff.create({
    data: {
      slug,
      name: input.name,
      role: input.role,
      showOnWebsite: input.showOnWebsite ?? false,
    },
  });

  await recordAudit({
    actor,
    action: "staff.create",
    entity: "Staff",
    entityId: created.id,
    summary: `${created.name} (${created.role})`,
  });

  safeRevalidatePath("/admin/staf");
  return created;
}

export async function setStaffActive(id: string, isActive: boolean): Promise<void> {
  const actor = await requireCapability("staff:manage");

  const updated = await prisma.staff.update({ where: { id }, data: { isActive } });

  await recordAudit({
    actor,
    action: isActive ? "staff.activate" : "staff.deactivate",
    entity: "Staff",
    entityId: id,
    summary: updated.name,
  });

  safeRevalidatePath("/admin/staf");
  safeRevalidatePath("/tentang");
}
