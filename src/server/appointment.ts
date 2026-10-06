"use server";

import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  BookingSource,
  IntakeStatus,
  Prisma,
} from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { generateBookingCode } from "@/lib/booking-code";
import { prisma } from "@/lib/db";
import { nextOpenWindow, onlinePhase, type OnlinePhase } from "@/lib/online-consultation";
import { bookingFeeFor } from "@/lib/payment";
import { safeRevalidatePath } from "@/lib/revalidate";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import {
  TRANSFER_SOURCES,
  transferInstructionFor,
  type TransferInstruction,
} from "@/lib/transfer-instruction";
import { ACTIVE_STATUSES, rejectedChangeError, rejectedClinicOnlyError } from "@/server/appointment-guard";
import { recordAudit } from "@/server/audit";
import {
  confirmationDeadlines,
  currentConfirmationCutoff,
  expireStaleSiteBookings,
  transferDeadlines,
} from "@/server/booking-expiry";
import { getClinicSetting } from "@/server/clinic-setting";
import { isExclusionViolation } from "@/server/db-errors";
import { DAY_LIST_CHANNEL } from "@/server/online-store";
import { quizLinkFor } from "@/server/quiz-link-code";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

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

    // Booking situs basi masih memblokir slot di exclusion constraint.
    await expireStaleSiteBookings();

    const setting = await getClinicSetting();

    assertTimeRange(input.startAt, input.endAt);

    const [branch, staff, service, patient] = await Promise.all([
      prisma.branch.findUniqueOrThrow({ where: { id: input.branchId } }),
      prisma.staff.findUniqueOrThrow({ where: { id: input.staffId } }),
      input.serviceId ? prisma.service.findUniqueOrThrow({ where: { id: input.serviceId } }) : null,
      prisma.patient.findUnique({
        where: { id: input.patientId },
        select: { mergedInto: { select: { name: true, medicalRecordNumber: true } } },
      }),
    ]);

    // Pasien rangkap (spec check-in 3.3): booking baru hanya untuk pasien yang masih dipakai.
    if (patient?.mergedInto) {
      throw new UserFacingError(
        `Pasien ini rangkap dari ${patient.mergedInto.name} (${patient.mergedInto.medicalRecordNumber}). Buat booking untuk pasien itu.`,
      );
    }

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
          bookingFee: bookingFeeFor(input.source, setting.bookingFee),
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

    const { count } = await createWithSlotGuard(() =>
      prisma.appointment.updateMany({
        where: { id, status: { in: ACTIVE_STATUSES }, channel: "KLINIK" },
        data: { startAt: input.startAt, endAt: input.endAt },
      }),
    );
    if (count === 0) throw await rejectedClinicOnlyError(id);

    await recordAudit({
      actor,
      action: "appointment.reschedule",
      entity: "Appointment",
      entityId: id,
      summary: `pindah ke ${input.startAt.toISOString()}`,
    });

    safeRevalidatePath("/admin/booking");
    // Status dan jadwal menentukan isi halaman Pengingat (spec C2 bagian 4).
    safeRevalidatePath("/admin/pengingat");
    return prisma.appointment.findUniqueOrThrow({ where: { id } });
  });
}

/**
 * Pembaruan bersyarat: baris hanya berubah bila statusnya saat ini masih
 * salah satu dari `from`. Satu pernyataan UPDATE ... WHERE status IN (...)
 * bersifat atomik, sehingga dua admin yang mengklik bersamaan tidak saling
 * menimpa, dan booking yang sudah dibatalkan tidak bisa "hidup lagi" lewat
 * tombol Hadir — yang juga akan menabrak exclusion constraint bila slotnya
 * sudah diisi orang lain. Selain pembatalan, booking wajib sudah punya
 * pasien (CHECK appointment_patient_required menjaga hal yang sama di basis data).
 */
async function setStatus(
  id: string,
  from: AppointmentStatus[],
  to: AppointmentStatus,
  action: string,
  summary?: string,
  options: { clinicOnly?: boolean } = {},
): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const needsPatient = to !== "DIBATALKAN";

    const { count } = await prisma.appointment.updateMany({
      where: {
        id,
        status: { in: from },
        ...(needsPatient ? { patientId: { not: null } } : {}),
        ...(options.clinicOnly ? { channel: "KLINIK" as const } : {}),
      },
      data: { status: to },
    });
    if (count === 0) {
      throw options.clinicOnly ? await rejectedClinicOnlyError(id, needsPatient) : await rejectedChangeError(id, needsPatient);
    }

    await recordAudit({ actor, action, entity: "Appointment", entityId: id, summary });

    safeRevalidatePath("/admin/booking");
    // Status dan jadwal menentukan isi halaman Pengingat (spec C2 bagian 4).
    safeRevalidatePath("/admin/pengingat");
    return prisma.appointment.findUniqueOrThrow({ where: { id } });
  });
}

export async function verifyAppointment(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, ["MENUNGGU_KONFIRMASI"], "TERKONFIRMASI", "appointment.verify");
}

export async function markNoShow(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, ACTIVE_STATUSES, "TIDAK_HADIR", "appointment.mark-no-show", undefined, { clinicOnly: true });
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

// Isian hanya membawa identitas: daftar booking juga dibuka resepsionis,
// yang tidak boleh menerima jawaban klinis (spec 6.2).
const BOOKING_LIST_INCLUDE = {
  // Hanya identitas: catatan medis tidak pernah ikut daftar booking (spec 6.2).
  patient: {
    select: {
      id: true,
      name: true,
      medicalRecordNumber: true,
      whatsapp: true,
      // Hanya id: cukup untuk tanda "Belum punya isian lengkap" (spec C3 4.3), tanpa jawaban klinis.
      // "Bukan MENUNGGU_DIISI" = TERISI atau DIPERIKSA; daftar `in` tidak bisa dipakai di objek `as const`.
      intakes: { where: { kind: "LENGKAP", status: { not: "MENUNGGU_DIISI" } }, select: { id: true }, take: 1 },
    },
  },
  staff: true,
  branch: true,
  service: true,
  intake: { select: { id: true, name: true, whatsapp: true, status: true, kind: true, linkVersion: true } },
  // Status food recall saja: isinya catatan klinis, dan daftar ini juga dibuka resepsionis.
  foodRecall: { select: { status: true } },
  encounter: { select: { status: true } },
  // Rentang waktu luang dan percobaan menghubungi booking online (spec 5.2); tanpa data klinis.
  contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },
  contactAttempts: { orderBy: { at: "asc" }, select: { at: true, staffName: true } },
  // Catatan pesan untuk keterangan "Konfirmasi terkirim …" di baris booking (spec C2 4.5).
  messages: {
    select: { id: true, kind: true, scheduledFor: true, sentAt: true, sentByName: true, revokedAt: true, reply: true },
  },
} as const;

/** Menambahkan batas transfer ke setiap booking (null bila booking tidak menunggu transfer). */
async function withTransferDeadlines<
  T extends { source: BookingSource; status: AppointmentStatus; bookingFee: number | null; createdAt: Date; startAt: Date },
>(appointments: T[]): Promise<(T & { transferDeadline: Date | null })[]> {
  const deadlines = await transferDeadlines(appointments);
  return appointments.map((appointment, index) => ({ ...appointment, transferDeadline: deadlines[index] }));
}

export async function listAppointments(filter: {
  branchId?: string;
  staffId?: string;
  status?: AppointmentStatus;
  date?: string;
  intakeStatus?: IntakeStatus;
}) {
  await requireCapability("booking:manage");
  await expireStaleSiteBookings();

  const appointments = await prisma.appointment.findMany({
    where: {
      // Daftar per tanggal tidak memuat booking online yang belum dimulai; pencarian lintas tanggal (filter isian) memuatnya.
      ...(filter.date ? { AND: [DAY_LIST_CHANNEL] } : {}),
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
      ...(filter.intakeStatus
        ? {
            intake: { status: filter.intakeStatus },
            // Isian booking yang batal atau kedaluwarsa tidak perlu diperiksa lagi.
            ...(filter.status ? {} : { status: { notIn: ["DIBATALKAN", "KEDALUWARSA"] as AppointmentStatus[] } }),
          }
        : {}),
    },
    include: BOOKING_LIST_INCLUDE,
    orderBy: { startAt: "asc" },
  });
  return withTransferDeadlines(appointments);
}

export type PendingDeadlineKind = "EXPIRES" | "TRANSFER";

/** Booking WA/telepon berbiaya yang belum diverifikasi; walk-in tidak pernah menunggu transfer. */
const WAITING_TRANSFER: Prisma.AppointmentWhereInput = {
  source: { in: [...TRANSFER_SOURCES] },
  bookingFee: { not: null },
};

/**
 * Daftar "Menunggu konfirmasi" dari tanggal jadwal mana pun (spec C1 5.1):
 * booking situs yang belum kedaluwarsa, dan booking WA/telepon berbiaya yang
 * belum diverifikasi. Yang paling mendesak di atas. Booking WA/telepon yang
 * lewat batas transfer tetap di sini dan tidak dibatalkan otomatis (B5).
 * Tanpa daftar ini admin harus membuka tanggal satu per satu.
 */
export async function listPendingBookings() {
  await requireCapability("booking:manage");
  await expireStaleSiteBookings();

  const appointments = await withTransferDeadlines(
    await prisma.appointment.findMany({
      where: { status: "MENUNGGU_KONFIRMASI", OR: [{ source: "SITUS" }, WAITING_TRANSFER] },
      include: BOOKING_LIST_INCLUDE,
    }),
  );
  const site = appointments.filter((a) => a.source === "SITUS");
  const expiries = await confirmationDeadlines(site.map((a) => a.createdAt));
  const expiresAt = new Map(site.map((a, index) => [a.id, expiries[index]]));
  const now = Date.now();

  return appointments
    .map((a) => {
      const deadlineKind: PendingDeadlineKind = a.transferDeadline ? "TRANSFER" : "EXPIRES";
      const deadline = a.transferDeadline ?? expiresAt.get(a.id)!;
      return { ...a, deadline, deadlineKind, overdue: deadlineKind === "TRANSFER" && deadline.getTime() <= now };
    })
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

/** Jumlah untuk menu samping; tanpa menulis apa pun, karena dipanggil di setiap halaman admin. */
export async function countPendingBookings(): Promise<number> {
  await requireCapability("booking:manage");
  const cutoff = await currentConfirmationCutoff();
  return prisma.appointment.count({
    where: {
      status: "MENUNGGU_KONFIRMASI",
      OR: [{ source: "SITUS", createdAt: { gte: cutoff } }, WAITING_TRANSFER],
    },
  });
}

const PHASE_ORDER: Record<OnlinePhase, number> = { NEEDS_NEW: 0, NOW: 1, TODAY: 2, UPCOMING: 3 };

/**
 * Bagian "Konsultasi online" di halaman Booking (spec 5.2): booking online yang sudah
 * diverifikasi dan menunggu dihubungi. "Perlu waktu baru" paling atas, lalu menurut
 * rentang terbuka terdekat.
 */
export async function listOnlineBookings() {
  await requireCapability("booking:manage");
  const now = new Date();
  const rows = await withTransferDeadlines(
    await prisma.appointment.findMany({
      where: { channel: "ONLINE", status: "TERKONFIRMASI" },
      include: BOOKING_LIST_INCLUDE,
    }),
  );
  return rows
    .map((row) => ({ ...row, phase: onlinePhase(row.contactWindows, now) }))
    .sort((a, b) => {
      const byPhase = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
      if (byPhase !== 0) return byPhase;
      const next = (row: typeof a) => nextOpenWindow(row.contactWindows, now)?.startAt.getTime() ?? row.startAt.getTime();
      return next(a) - next(b);
    });
}

const SEARCH_LOOKBACK_DAYS = 30;
const SEARCH_LIMIT = 50;
/** Angka lebih pendek dari ini tidak dicocokkan ke nomor WA, agar hasilnya tidak membanjir. */
const SEARCH_MIN_PHONE_DIGITS = 4;

/**
 * Pencarian di halaman Booking (spec C1 5.3): kode persis tanpa peduli huruf
 * besar/kecil; nama pasien, atau nama di isian booking situs yang belum
 * dicocokkan (sebagian); nomor WA yang dinormalkan seperti pencarian pasien.
 * Jadwal 30 hari ke belakang sampai seterusnya, terbaru di atas.
 */
export async function searchBookings(query: string) {
  await requireCapability("booking:manage");
  const trimmed = query.trim();
  if (!trimmed) return [];
  await expireStaleSiteBookings();

  const since = combineWitaDateAndMinutes(addDaysToDateString(witaDateString(new Date()), -SEARCH_LOOKBACK_DAYS), 0);
  const digits = /^[\d\s()+-]+$/.test(trimmed) ? trimmed.replace(/\D/g, "") : "";
  const phone = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  const name = { contains: trimmed, mode: "insensitive" as const };
  const phoneMatches: Prisma.AppointmentWhereInput[] =
    phone.length >= SEARCH_MIN_PHONE_DIGITS
      ? [{ patient: { whatsapp: { contains: phone } } }, { patientId: null, intake: { whatsapp: { contains: phone } } }]
      : [];

  return withTransferDeadlines(
    await prisma.appointment.findMany({
      where: {
        startAt: { gte: since },
        OR: [
          { code: { equals: trimmed, mode: "insensitive" } },
          { patient: { name } },
          { patientId: null, intake: { name } },
          ...phoneMatches,
        ],
      },
      include: BOOKING_LIST_INCLUDE,
      orderBy: { startAt: "desc" },
      take: SEARCH_LIMIT,
    }),
  );
}

/** Untuk panel "Booking dibuat" (spec C1 bagian 4): null bila booking tidak menunggu transfer. */
export async function getTransferInstruction(
  appointmentId: string,
): Promise<ActionResult<TransferInstruction | null>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: BOOKING_LIST_INCLUDE,
    });
    if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
    const [withDeadline] = await withTransferDeadlines([appointment]);
    const quizLink = quizLinkFor(appointment, publicSiteUrl(), new Date());
    return transferInstructionFor(withDeadline, await getClinicSetting(), quizLink);
  });
}
