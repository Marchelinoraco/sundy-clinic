"use server";

import type { ExceptionKind, ScheduleException, ScheduleTemplate, Staff } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { getAvailableSlots, type SlotOption } from "@/lib/slot";
import { witaWeekday } from "@/lib/time";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { isHoliday } from "@/server/holiday";
import { requireCapability } from "@/server/session";

// Status Appointment yang benar-benar memblokir slot — sejalan dengan
// klausa WHERE pada exclusion constraint di migrasi Task 9.
const BLOCKING_STATUSES = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "HADIR"] as const;

/** Staf yang punya antrean jadwal sendiri: dokter dan terapis aktif. */
export async function listSchedulableStaff(): Promise<Staff[]> {
  return prisma.staff.findMany({
    where: { role: { in: ["DOKTER", "TERAPIS"] }, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

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
}): Promise<ActionResult<ScheduleTemplate>> {
  return runAction(async () => {
    const actor = await requireCapability("schedule:manage");

    if (input.endMinute <= input.startMinute) {
      throw new UserFacingError("Jam selesai harus setelah jam mulai.");
    }

    // Tidak ada pemeriksaan "staf ini sudah di cabang lain hari ini" di sini
    // dengan sengaja. @@unique([staffId, weekday]) pada skema sudah membuat
    // satu hari-dalam-minggu hanya bisa menunjuk satu cabang — upsert ke
    // weekday yang sama selalu MENIMPA baris lama, bukan membuat konflik baru.
    // Jaminan sesungguhnya terhadap "satu dokter di dua cabang pada jam yang
    // sama" ada di exclusion constraint Appointment (Task 9), yang berlaku
    // saat booking sungguhan dibuat — bukan di metadata jadwal ini.
    const result = await prisma.scheduleTemplate.upsert({
      where: {
        staffId_weekday: { staffId: input.staffId, weekday: input.weekday },
      },
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
  });
}

export async function deleteScheduleTemplate(id: string): Promise<ActionResult> {
  return runAction(async () => {
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
  });
}

export async function createScheduleException(input: {
  staffId: string;
  branchId: string | null;
  date: string;
  kind: ExceptionKind;
  startMinute: number | null;
  endMinute: number | null;
}): Promise<ActionResult<ScheduleException>> {
  return runAction(async () => {
    const actor = await requireCapability("schedule:manage");

    if (input.kind !== "LIBUR") {
      if (input.startMinute === null || input.endMinute === null) {
        throw new UserFacingError(
          "Jam tambahan dan blokir sebagian wajib punya jam mulai dan selesai.",
        );
      }
      if (input.endMinute <= input.startMinute) {
        throw new UserFacingError("Jam selesai harus setelah jam mulai.");
      }
    }

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
  });
}

export async function listScheduleExceptions(
  staffId: string,
  from: string,
  to: string,
): Promise<ScheduleException[]> {
  return prisma.scheduleException.findMany({
    where: {
      staffId,
      date: {
        gte: new Date(`${from}T00:00:00Z`),
        lte: new Date(`${to}T00:00:00Z`),
      },
    },
    orderBy: { date: "asc" },
  });
}

/**
 * Menyambungkan mesin murni getAvailableSlots ke data nyata: template hari
 * itu, pengecualian, status libur, dan rentang sibuk (Appointment berstatus
 * memblokir) milik staf tersebut. SlotHold belum ikut dihitung di sini —
 * Plan 3b yang menambahkannya, karena penahanan sementara hanya relevan
 * untuk alur pendaftaran mandiri publik.
 */
export async function getStaffAvailability(input: {
  staffId: string;
  branchId: string;
  date: string;
  durationMinutes: number;
}): Promise<SlotOption[]> {
  const weekday = witaWeekday(new Date(`${input.date}T12:00:00Z`));

  const [template, exceptions, holiday, busyAppointments] = await Promise.all([
    prisma.scheduleTemplate.findUnique({
      where: { staffId_weekday: { staffId: input.staffId, weekday } },
    }),
    prisma.scheduleException.findMany({
      where: {
        staffId: input.staffId,
        date: new Date(`${input.date}T00:00:00Z`),
      },
    }),
    isHoliday(input.date),
    prisma.appointment.findMany({
      where: {
        staffId: input.staffId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { gte: new Date(`${input.date}T00:00:00Z`) },
        endAt: { lte: new Date(`${input.date}T23:59:59Z`) },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  return getAvailableSlots({
    date: input.date,
    durationMinutes: input.durationMinutes,
    template:
      template && template.branchId === input.branchId
        ? { startMinute: template.startMinute, endMinute: template.endMinute }
        : null,
    exceptions: exceptions.map((e) => ({
      kind: e.kind,
      startMinute: e.startMinute,
      endMinute: e.endMinute,
    })),
    isHoliday: holiday,
    busy: busyAppointments,
    now: new Date(),
    minLeadMinutes: 120,
  });
}
