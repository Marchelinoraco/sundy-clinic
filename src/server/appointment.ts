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
import { combineWitaDateAndMinutes } from "@/lib/time";
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

/** Status yang masih bisa dijadwal ulang, diverifikasi, dihadiri, atau dibatalkan. */
const ACTIVE_STATUSES: AppointmentStatus[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

const STATUS_WORD: Record<AppointmentStatus, string> = {
  MENUNGGU_KONFIRMASI: "menunggu konfirmasi",
  TERKONFIRMASI: "terkonfirmasi",
  HADIR: "hadir",
  SELESAI: "selesai",
  DIBATALKAN: "dibatalkan",
  TIDAK_HADIR: "tidak hadir",
  KEDALUWARSA: "kedaluwarsa",
};

async function staleStatusError(id: string): Promise<UserFacingError> {
  const current = await prisma.appointment.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  });
  return new UserFacingError(
    `Booking ini sudah berstatus ${STATUS_WORD[current.status]}. Muat ulang halaman.`,
  );
}

export async function rescheduleAppointment(
  id: string,
  input: { startAt: Date; endAt: Date },
): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");

    assertTimeRange(input.startAt, input.endAt);

    const { count } = await createWithSlotGuard(() =>
      prisma.appointment.updateMany({
        where: { id, status: { in: ACTIVE_STATUSES } },
        data: { startAt: input.startAt, endAt: input.endAt },
      }),
    );
    if (count === 0) throw await staleStatusError(id);

    await recordAudit({
      actor,
      action: "appointment.reschedule",
      entity: "Appointment",
      entityId: id,
      summary: `pindah ke ${input.startAt.toISOString()}`,
    });

    safeRevalidatePath("/admin/booking");
    return prisma.appointment.findUniqueOrThrow({ where: { id } });
  });
}

/**
 * Pembaruan bersyarat: baris hanya berubah bila statusnya saat ini masih
 * salah satu dari `from`. Satu pernyataan UPDATE ... WHERE status IN (...)
 * bersifat atomik, sehingga dua admin yang mengklik bersamaan tidak saling
 * menimpa, dan booking yang sudah dibatalkan tidak bisa "hidup lagi" lewat
 * tombol Hadir — yang juga akan menabrak exclusion constraint bila slotnya
 * sudah diisi orang lain.
 */
async function setStatus(
  id: string,
  from: AppointmentStatus[],
  to: AppointmentStatus,
  action: string,
  summary?: string,
): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");

    const { count } = await prisma.appointment.updateMany({
      where: { id, status: { in: from } },
      data: { status: to },
    });
    if (count === 0) throw await staleStatusError(id);

    await recordAudit({ actor, action, entity: "Appointment", entityId: id, summary });

    safeRevalidatePath("/admin/booking");
    return prisma.appointment.findUniqueOrThrow({ where: { id } });
  });
}

export async function verifyAppointment(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, ["MENUNGGU_KONFIRMASI"], "TERKONFIRMASI", "appointment.verify");
}

export async function markAttended(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, ACTIVE_STATUSES, "HADIR", "appointment.mark-attended");
}

export async function markNoShow(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, ACTIVE_STATUSES, "TIDAK_HADIR", "appointment.mark-no-show");
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
  return setStatus(
    id,
    ACTIVE_STATUSES,
    "DIBATALKAN",
    "appointment.cancel",
    reason?.trim() || undefined,
  );
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
              gte: combineWitaDateAndMinutes(filter.date, 0),
              lt: combineWitaDateAndMinutes(filter.date, 24 * 60),
            },
          }
        : {}),
    },
    include: { patient: true, staff: true, branch: true, service: true },
    orderBy: { startAt: "asc" },
  });
}
