"use server";

import type { ExceptionKind, ScheduleException, ScheduleTemplate } from "@prisma/client";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export async function listScheduleTemplates(staffId: string): Promise<ScheduleTemplate[]> {
  return prisma.scheduleTemplate.findMany({
    where: { staffId },
    orderBy: { weekday: "asc" },
  });
}

export async function upsertScheduleTemplate(input: {
  staffId: string;
  branchId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
}): Promise<ScheduleTemplate> {
  const actor = await requireCapability("schedule:manage");

  // Tidak ada pemeriksaan "staf ini sudah di cabang lain hari ini" di sini
  // dengan sengaja. @@unique([staffId, weekday]) pada skema sudah membuat
  // satu hari-dalam-minggu hanya bisa menunjuk satu cabang — upsert ke
  // weekday yang sama selalu MENIMPA baris lama, bukan membuat konflik baru.
  // Jaminan sesungguhnya terhadap "satu dokter di dua cabang pada jam yang
  // sama" ada di exclusion constraint Appointment (Task 9), yang berlaku
  // saat booking sungguhan dibuat — bukan di metadata jadwal ini.
  const result = await prisma.scheduleTemplate.upsert({
    where: { staffId_weekday: { staffId: input.staffId, weekday: input.weekday } },
    update: {
      branchId: input.branchId,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      slotMinutes: input.slotMinutes,
    },
    create: input,
  });

  await recordAudit({
    actor,
    action: "schedule-template.upsert",
    entity: "ScheduleTemplate",
    entityId: result.id,
    summary: `staf ${input.staffId}, hari ${input.weekday}, ${input.startMinute}-${input.endMinute}`,
  });

  safeRevalidatePath("/admin/jadwal");
  return result;
}

export async function deleteScheduleTemplate(id: string): Promise<void> {
  const actor = await requireCapability("schedule:manage");
  const deleted = await prisma.scheduleTemplate.delete({ where: { id } });

  await recordAudit({
    actor,
    action: "schedule-template.delete",
    entity: "ScheduleTemplate",
    entityId: id,
    summary: `staf ${deleted.staffId}, hari ${deleted.weekday}`,
  });

  safeRevalidatePath("/admin/jadwal");
}

export async function createScheduleException(input: {
  staffId: string;
  branchId: string | null;
  date: string;
  kind: ExceptionKind;
  startMinute: number | null;
  endMinute: number | null;
}): Promise<ScheduleException> {
  const actor = await requireCapability("schedule:manage");

  const created = await prisma.scheduleException.create({
    data: {
      staffId: input.staffId,
      branchId: input.branchId,
      date: new Date(`${input.date}T00:00:00Z`),
      kind: input.kind,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
    },
  });

  await recordAudit({
    actor,
    action: "schedule-exception.create",
    entity: "ScheduleException",
    entityId: created.id,
    summary: `staf ${input.staffId}, ${input.date}, ${input.kind}`,
  });

  safeRevalidatePath("/admin/jadwal");
  return created;
}

export async function listScheduleExceptions(
  staffId: string,
  from: string,
  to: string,
): Promise<ScheduleException[]> {
  return prisma.scheduleException.findMany({
    where: {
      staffId,
      date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    },
    orderBy: { date: "asc" },
  });
}
