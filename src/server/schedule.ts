"use server";

import type { ExceptionKind, ScheduleException, ScheduleTemplate, Staff } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import type { SlotOption } from "@/lib/slot";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { WEEKDAY_LABELS, type WeeklyDayInput } from "@/lib/schedule-week";
import { recordAudit } from "@/server/audit";
import {
  computeAvailability,
  computeAvailabilityRange,
  type AvailabilityInput,
  type DayAvailability,
} from "@/server/availability";
import { requireCapability } from "@/server/session";


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

/**
 * Jam kerja seminggu dalam satu transaksi (spec D 5.1). Hari yang tidak sah
 * membatalkan semuanya. Hari yang tutup dihapus jam kerjanya. Booking yang sudah
 * ada tidak diubah: hari itu hanya tidak lagi menawarkan slot baru.
 */
export async function saveWeeklySchedule(input: {
  staffId: string;
  branchId: string;
  days: WeeklyDayInput[];
}): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("schedule:manage");
    const weekdays = input.days.map((day) => day.weekday);
    if (
      input.days.length !== 7 ||
      new Set(weekdays).size !== 7 ||
      weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    ) {
      throw new UserFacingError("Jam kerja tidak lengkap. Muat ulang halaman lalu coba lagi.");
    }
    for (const day of input.days) {
      if (!day.open) continue;
      if (day.startMinute === null || day.endMinute === null) {
        throw new UserFacingError(`${WEEKDAY_LABELS[day.weekday]}: isi jam mulai dan selesai.`);
      }
      if (day.endMinute <= day.startMinute) {
        throw new UserFacingError(`${WEEKDAY_LABELS[day.weekday]}: jam selesai harus setelah jam mulai.`);
      }
    }

    const existing = await prisma.scheduleTemplate.findMany({ where: { staffId: input.staffId } });
    const changes: { action: "schedule-template.upsert" | "schedule-template.delete"; id: string; summary: string }[] = [];
    await prisma.$transaction(async (tx) => {
      for (const day of input.days) {
        const current = existing.find((t) => t.weekday === day.weekday);
        if (!day.open) {
          if (current) {
            await tx.scheduleTemplate.delete({ where: { id: current.id } });
            changes.push({ action: "schedule-template.delete", id: current.id, summary: `staf ${input.staffId}, hari ${day.weekday}` });
          }
          continue;
        }
        const startMinute = day.startMinute!;
        const endMinute = day.endMinute!;
        if (current && current.branchId === input.branchId && current.startMinute === startMinute && current.endMinute === endMinute) {
          continue;
        }
        const saved = await tx.scheduleTemplate.upsert({
          where: { staffId_weekday: { staffId: input.staffId, weekday: day.weekday } },
          update: { branchId: input.branchId, startMinute, endMinute, slotMinutes: 30 },
          create: { staffId: input.staffId, branchId: input.branchId, weekday: day.weekday, startMinute, endMinute, slotMinutes: 30 },
        });
        changes.push({
          action: "schedule-template.upsert",
          id: saved.id,
          summary: `staf ${input.staffId}, hari ${day.weekday}, ${startMinute}-${endMinute}`,
        });
      }
    });

    for (const change of changes) {
      await recordAudit({ actor, action: change.action, entity: "ScheduleTemplate", entityId: change.id, summary: change.summary });
    }
    safeRevalidatePath("/admin/jadwal");
    safeRevalidatePath("/admin");
  });
}

/** Hapus pengecualian tanggal (spec D 5.1). Booking yang sudah ada tidak berubah. */
export async function deleteScheduleException(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("schedule:manage");
    const existing = await prisma.scheduleException.findUnique({ where: { id } });
    if (!existing) throw new UserFacingError("Pengecualian ini sudah dihapus.");
    await prisma.scheduleException.delete({ where: { id } });
    await recordAudit({
      actor,
      action: "schedule-exception.delete",
      entity: "ScheduleException",
      entityId: id,
      summary: `staf ${existing.staffId}, ${existing.date.toISOString().slice(0, 10)}, ${existing.kind}`,
    });
    safeRevalidatePath("/admin/jadwal");
    safeRevalidatePath("/admin");
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

/** Untuk pendaftaran mandiri publik: paling cepat 2 jam dari sekarang, hold pasien lain dihitung sibuk. */
export async function getStaffAvailability(input: AvailabilityInput): Promise<SlotOption[]> {
  return computeAvailability(input, { minLeadMinutes: 120, holds: { excludeToken: null } });
}

/**
 * Untuk admin yang mencatat booking: tanpa batas 2 jam, karena pasien
 * walk-in dan penelepon sering minta jam terdekat (PRD F9). Slot yang
 * sudah lewat tetap tidak ditawarkan. Hold pasien tidak mengikat admin.
 * `excludeAppointmentId`: saat pindah jadwal, jam booking itu sendiri tidak dihitung terisi.
 */
export async function getStaffAvailabilityForAdmin(
  input: AvailabilityInput & { excludeAppointmentId?: string },
): Promise<SlotOption[]> {
  await requireCapability("booking:manage");
  return computeAvailability(input, { minLeadMinutes: 0, excludeAppointmentId: input.excludeAppointmentId });
}

/**
 * Strip tanggal Booking Baru dan Pindah jadwal: ringkasan per hari dengan aturan
 * jam yang sama seperti getStaffAvailabilityForAdmin (tanpa batas 2 jam, hold diabaikan).
 */
export async function getStaffAvailabilityRange(input: {
  staffId: string;
  branchId: string;
  durationMinutes: number;
  from: string;
  days: number;
  excludeAppointmentId?: string;
}): Promise<DayAvailability[]> {
  await requireCapability("booking:manage");
  return computeAvailabilityRange(input, { minLeadMinutes: 0, excludeAppointmentId: input.excludeAppointmentId });
}
