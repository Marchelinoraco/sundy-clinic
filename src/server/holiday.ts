"use server";

import { safeRevalidatePath } from "@/lib/revalidate";
import type { Holiday, HolidayKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export async function listHolidays(year: number): Promise<Holiday[]> {
  return prisma.holiday.findMany({
    where: { date: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
    orderBy: { date: "asc" },
  });
}

/** `date` berformat "YYYY-MM-DD" dalam WITA. */
export async function isHoliday(date: string): Promise<boolean> {
  const row = await prisma.holiday.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } });
  return row !== null;
}

export async function createHoliday(input: {
  date: string;
  name: string;
  kind: HolidayKind;
}): Promise<Holiday> {
  const actor = await requireCapability("schedule:manage");

  const created = await prisma.holiday.create({
    data: { date: new Date(`${input.date}T00:00:00Z`), name: input.name, kind: input.kind },
  });

  await recordAudit({
    actor,
    action: "holiday.create",
    entity: "Holiday",
    entityId: created.id,
    summary: `${input.date}: ${input.name}`,
  });

  safeRevalidatePath("/admin/jadwal");
  return created;
}

export async function deleteHoliday(id: string): Promise<void> {
  const actor = await requireCapability("schedule:manage");

  const deleted = await prisma.holiday.delete({ where: { id } });

  await recordAudit({
    actor,
    action: "holiday.delete",
    entity: "Holiday",
    entityId: id,
    summary: `${deleted.date.toISOString().slice(0, 10)}: ${deleted.name}`,
  });

  safeRevalidatePath("/admin/jadwal");
}
