"use server";

import { Prisma } from "@prisma/client";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  BookingSource,
} from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { generateBookingCode } from "@/lib/booking-code";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Kode Postgres untuk pelanggaran exclusion constraint adalah "23P01".
 * Ini satu-satunya tempat yang menerjemahkannya ke pesan yang admin
 * mengerti — di mana pun exclusion constraint bisa terpicu, tangkap di
 * sini, jangan biarkan galat SQL mentah sampai ke antarmuka.
 */
function isExclusionViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      typeof error.meta?.code === "string" &&
      error.meta.code === "23P01") ||
    (error instanceof Error && error.message.includes("23P01"))
  );
}

function assertTimeRange(startAt: Date, endAt: Date): void {
  if (endAt.getTime() <= startAt.getTime()) {
    throw new UserFacingError("Jam selesai harus setelah jam mulai.");
  }
}

async function createWithSlotGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new UserFacingError("Slot baru saja terisi. Pilih jam lain.");
    }
    throw error;
  }
}

export async function createAppointment(input: {
  patientId: string;
  branchId: string;
  staffId: string;
  serviceId: string | null;
  type: AppointmentType;
  startAt: Date;
  endAt: Date;
  source: BookingSource;
  notes?: string;
}): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");

    assertTimeRange(input.startAt, input.endAt);

    const [branch, staff, service] = await Promise.all([
      prisma.branch.findUniqueOrThrow({ where: { id: input.branchId } }),
      prisma.staff.findUniqueOrThrow({ where: { id: input.staffId } }),
      input.serviceId ? prisma.service.findUniqueOrThrow({ where: { id: input.serviceId } }) : null,
    ]);

    if (branch.status !== "AKTIF") {
      throw new UserFacingError(`Cabang ${branch.name} belum menerima booking.`);
    }
    // Dijaga di server, bukan hanya disaring di form: salah menempatkan
    // tindakan khusus dokter ke terapis adalah soal keselamatan pasien
    // (PRD F4a, keputusan D10).
    const needsDoctor = input.type === "KONSULTASI" || service?.requiresDoctor === true;
    if (needsDoctor && staff.role !== "DOKTER") {
      throw new UserFacingError(
        `${service?.name ?? "Konsultasi"} harus ditangani dokter, bukan ${staff.name}.`,
      );
    }

    const created = await createWithSlotGuard(() =>
      prisma.appointment.create({
        data: {
          code: generateBookingCode(),
          branchId: input.branchId,
          staffId: input.staffId,
          patientId: input.patientId,
          serviceId: input.serviceId,
          type: input.type,
          startAt: input.startAt,
          endAt: input.endAt,
          source: input.source,
          notes: input.notes,
        },
      }),
    );

    await recordAudit({
      actor,
      action: "appointment.create",
      entity: "Appointment",
      entityId: created.id,
      summary: `${created.code} — ${input.startAt.toISOString()}`,
    });

    safeRevalidatePath("/admin/booking");
    return created;
  });
}

export async function rescheduleAppointment(
  id: string,
  input: { startAt: Date; endAt: Date },
): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");

    assertTimeRange(input.startAt, input.endAt);

    const updated = await createWithSlotGuard(() =>
      prisma.appointment.update({
        where: { id },
        data: { startAt: input.startAt, endAt: input.endAt },
      }),
    );

    await recordAudit({
      actor,
      action: "appointment.reschedule",
      entity: "Appointment",
      entityId: id,
      summary: `pindah ke ${input.startAt.toISOString()}`,
    });

    safeRevalidatePath("/admin/booking");
    return updated;
  });
}

async function setStatus(
  id: string,
  status: AppointmentStatus,
  action: string,
  summary?: string,
): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");

    const updated = await prisma.appointment.update({ where: { id }, data: { status } });

    await recordAudit({ actor, action, entity: "Appointment", entityId: id, summary });

    safeRevalidatePath("/admin/booking");
    return updated;
  });
}

export async function verifyAppointment(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, "TERKONFIRMASI", "appointment.verify");
}

export async function markAttended(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, "HADIR", "appointment.mark-attended");
}

export async function markNoShow(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, "TIDAK_HADIR", "appointment.mark-no-show");
}

/**
 * Mengubah status menjadi DIBATALKAN. Tidak pernah menghapus baris —
 * lihat PRD F9: janji temu adalah catatan kegiatan klinik, dan
 * menghapusnya memutus jejak audit serta riwayat pasien.
 */
export async function cancelAppointment(
  id: string,
  reason?: string,
): Promise<ActionResult<Appointment>> {
  return setStatus(id, "DIBATALKAN", "appointment.cancel", reason);
}

export async function listAppointments(filter: {
  branchId?: string;
  staffId?: string;
  status?: AppointmentStatus;
  date?: string;
}) {
  await requireCapability("booking:manage");

  return prisma.appointment.findMany({
    where: {
      branchId: filter.branchId,
      staffId: filter.staffId,
      status: filter.status,
      ...(filter.date
        ? {
            startAt: {
              gte: new Date(`${filter.date}T00:00:00Z`),
              lte: new Date(`${filter.date}T23:59:59Z`),
            },
          }
        : {}),
    },
    include: { patient: true, staff: true, branch: true, service: true },
    orderBy: { startAt: "asc" },
  });
}
