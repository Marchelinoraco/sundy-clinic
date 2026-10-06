"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatDateColumn, formatIndonesianDate } from "@/lib/format";
import { recallDateFor, shouldOfferFoodRecall, type FoodRecallLinkInfo } from "@/lib/food-recall";
import { validateLinkIdentity, type IdentityField, type LinkIdentity } from "@/lib/kuis/identity";
import {
  isNikMissingReason,
  maskNik,
  NIK_FORMAT_ERROR,
  NIK_MISSING_REASONS,
  normalizeNik,
  type NikMissingReasonValue,
} from "@/lib/nik";
import { missingIdentityFields } from "@/lib/quiz-link";
import { safeRevalidatePath } from "@/lib/revalidate";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { bookingServiceName } from "@/lib/transfer-instruction";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { ACTIVE_STATUSES, rejectedChangeError } from "@/server/appointment-guard";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { foodRecallLinkInfo, loadFoodRecallForAppointment } from "@/server/food-recall-store";
import { requireCapability } from "@/server/session";

/** Data pasien di dialog check-in. Tanpa catatan medis: dialog juga dibuka resepsionis. */
export type CheckInPatient = {
  id: string;
  name: string;
  medicalRecordNumber: string;
  nik: string | null;
  nikMissingReason: NikMissingReasonValue | null;
  /** "YYYY-MM-DD" */
  birthDate: string | null;
  gender: "L" | "P" | null;
  occupation: string | null;
  address: string | null;
  whatsapp: string;
};

export type CheckInForm = {
  appointmentId: string;
  code: string;
  /** "Sabtu, 3 Oktober 2026 · 11.00–11.30 · Konsultasi Dokter · dr. Diane" */
  summary: string;
  patient: CheckInPatient;
  /** Centang awal "Tawarkan food recall" (spec 4.1). */
  offerFoodRecallByDefault: boolean;
};

/** Pemilik NIK yang bentrok (spec 3.3). */
export type NikOwner = {
  patientId: string;
  name: string;
  medicalRecordNumber: string;
  birthDateLabel: string | null;
  whatsapp: string;
  lastVisitLabel: string | null;
  merge: { allowed: true } | { allowed: false; reason: string };
};

export type CheckInNik =
  | { kind: "KEEP" }
  | { kind: "SET"; value: string }
  | { kind: "MISSING"; reason: NikMissingReasonValue };

export type CheckInInput = {
  appointmentId: string;
  nik: CheckInNik;
  /** Hanya kolom yang kosong di data pasien yang dibaca; kolom terisi diabaikan. */
  identity: LinkIdentity;
  whatsapp: string;
  offerFoodRecall: boolean;
};

export type CheckInResult = { patientName: string; foodRecall: FoodRecallLinkInfo | null };

const NIK_REQUIRED = "Isi NIK atau pilih alasan belum ada NIK.";
const NIK_TAKEN_RACE = "NIK ini baru saja dipakai pasien lain — periksa lagi.";
const MERGE_BLOCKED_CLINICAL = "Pasien ini sudah punya catatan dokter. Hubungi Super Admin untuk menggabungkan data.";
const MERGE_BLOCKED_OWN_NIK = "Pasien booking ini sudah punya NIK lain. Periksa lagi NIK-nya.";

/** Pesan untuk resepsionis; validateLinkIdentity menulis pesannya untuk customer. */
const IDENTITY_MESSAGE: Record<IdentityField, string> = {
  birthDate: "Isi tanggal lahir yang benar.",
  gender: "Pilih jenis kelamin.",
  occupation: "Isi pekerjaan (maksimal 100 karakter).",
  address: "Isi alamat (maksimal 200 karakter).",
};

const BOOKING_SELECT = {
  id: true,
  code: true,
  status: true,
  type: true,
  channel: true,
  startAt: true,
  endAt: true,
  service: { select: { name: true } },
  staff: { select: { name: true } },
  intake: { select: { purpose: true } },
  patient: {
    select: {
      id: true,
      name: true,
      medicalRecordNumber: true,
      nik: true,
      nikMissingReason: true,
      birthDate: true,
      gender: true,
      occupation: true,
      address: true,
      whatsapp: true,
      activePackageId: true,
      mergedIntoId: true,
    },
  },
} as const;

async function loadBooking(appointmentId: unknown) {
  const booking = await prisma.appointment.findUnique({ where: { id: String(appointmentId ?? "") }, select: BOOKING_SELECT });
  if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
  return booking;
}

type LoadedBooking = Awaited<ReturnType<typeof loadBooking>>;
type CheckablePatient = NonNullable<LoadedBooking["patient"]>;

/** Spec 7: resepsionis kedua yang menekan Check-in bersamaan. */
const ALREADY_CHECKED_IN = "Booking ini sudah check-in.";

/** Booking yang boleh di-check-in: sudah punya pasien dan statusnya masih aktif. */
async function checkableBooking(appointmentId: unknown): Promise<LoadedBooking & { patient: CheckablePatient }> {
  const booking = await loadBooking(appointmentId);
  if (!booking.patient) throw new UserFacingError("Cocokkan booking ini dengan data pasien lebih dulu.");
  if (booking.channel === "ONLINE") {
    throw new UserFacingError("Konsultasi online tidak memakai check-in. Dokter memulainya dari dasbor.");
  }
  if (booking.patient.mergedIntoId) throw new UserFacingError("Data pasien booking ini baru saja dipindah. Muat ulang halaman.");
  if (booking.status === "HADIR") throw new UserFacingError(ALREADY_CHECKED_IN);
  if (!ACTIVE_STATUSES.includes(booking.status)) throw await rejectedChangeError(booking.id, true);
  return { ...booking, patient: booking.patient };
}

function toForm(booking: LoadedBooking & { patient: CheckablePatient }): CheckInForm {
  const { patient } = booking;
  const time = (date: Date) => minutesToTimeLabel(witaMinutesOfDay(date));
  return {
    appointmentId: booking.id,
    code: booking.code,
    summary: [
      formatIndonesianDate(booking.startAt),
      `${time(booking.startAt)}–${time(booking.endAt)}`,
      bookingServiceName(booking),
      booking.staff.name,
    ].join(" · "),
    patient: {
      id: patient.id,
      name: patient.name,
      medicalRecordNumber: patient.medicalRecordNumber,
      nik: patient.nik,
      nikMissingReason: patient.nikMissingReason,
      birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
      gender: patient.gender,
      occupation: patient.occupation,
      address: patient.address,
      whatsapp: patient.whatsapp,
    },
    offerFoodRecallByDefault: shouldOfferFoodRecall({
      intakePurpose: booking.intake?.purpose ?? null,
      hasActivePackage: patient.activePackageId !== null,
    }),
  };
}

function findOwner(nik: string, excludePatientId: string) {
  return prisma.patient.findFirst({
    where: { nik, id: { not: excludePatientId } },
    select: { id: true, name: true, medicalRecordNumber: true, birthDate: true, whatsapp: true, lastVisitAt: true },
  });
}

/** Syarat pindah pasien rangkap (spec 3.3): tanpa NIK sendiri, kunjungan, maupun catatan klinis. */
async function mergeBlockReason(duplicateId: string): Promise<string | null> {
  const duplicate = await prisma.patient.findUniqueOrThrow({
    where: { id: duplicateId },
    select: {
      nik: true,
      allergies: true,
      medicalHistory: true,
      importantNotes: true,
      appointments: { where: { encounter: { isNot: null } }, select: { id: true }, take: 1 },
    },
  });
  if (duplicate.nik) return MERGE_BLOCKED_OWN_NIK;
  const hasClinical =
    duplicate.appointments.length > 0 ||
    Boolean(duplicate.allergies?.trim() || duplicate.medicalHistory?.trim() || duplicate.importantNotes?.trim());
  return hasClinical ? MERGE_BLOCKED_CLINICAL : null;
}

/** Isi dialog check-in (spec 3.1). */
export async function getCheckInForm(appointmentId: string): Promise<ActionResult<CheckInForm>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    return toForm(await checkableBooking(appointmentId));
  });
}

/** Pemilik lain NIK ini, atau null (spec 3.3). NIK boleh bertitik atau berspasi. */
export async function lookupNikOwner(input: { appointmentId: string; nik: string }): Promise<ActionResult<NikOwner | null>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const nik = normalizeNik(String(input?.nik ?? ""));
    if (!nik) throw new UserFacingError(NIK_FORMAT_ERROR);
    const booking = await checkableBooking(input?.appointmentId);
    const owner = await findOwner(nik, booking.patient.id);
    if (!owner) return null;
    const blocked = await mergeBlockReason(booking.patient.id);
    return {
      patientId: owner.id,
      name: owner.name,
      medicalRecordNumber: owner.medicalRecordNumber,
      birthDateLabel: formatDateColumn(owner.birthDate),
      whatsapp: owner.whatsapp,
      lastVisitLabel: owner.lastVisitAt ? formatIndonesianDate(owner.lastVisitAt) : null,
      merge: blocked ? { allowed: false, reason: blocked } : { allowed: true },
    };
  });
}

/**
 * "Ini orang yang sama — pindahkan" (spec 3.3): semua booking dan isian pasien
 * rangkap pindah ke pemilik NIK dalam satu transaksi, lalu pasien rangkap
 * ditandai. Data diri pasien rangkap tidak disalin.
 */
export async function mergeDuplicatePatient(input: { appointmentId: string; nik: string }): Promise<ActionResult<CheckInForm>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const nik = normalizeNik(String(input?.nik ?? ""));
    if (!nik) throw new UserFacingError(NIK_FORMAT_ERROR);
    const booking = await checkableBooking(input?.appointmentId);
    const duplicate = booking.patient;
    const owner = await findOwner(nik, duplicate.id);
    if (!owner) throw new UserFacingError("NIK ini tidak dimiliki pasien lain. Lanjutkan check-in.");
    const blocked = await mergeBlockReason(duplicate.id);
    if (blocked) throw new UserFacingError(blocked);

    const moved = await prisma.$transaction(async (tx) => {
      const appointments = await tx.appointment.updateMany({ where: { patientId: duplicate.id }, data: { patientId: owner.id } });
      const intakes = await tx.intake.updateMany({ where: { patientId: duplicate.id }, data: { patientId: owner.id } });
      await tx.patient.update({ where: { id: duplicate.id }, data: { mergedIntoId: owner.id } });
      return { appointments: appointments.count, intakes: intakes.count };
    });

    await recordAudit({
      actor,
      action: "patient.merge-duplicate",
      entity: "Patient",
      entityId: owner.id,
      summary: `${duplicate.medicalRecordNumber} → ${owner.medicalRecordNumber}: ${moved.appointments} booking, ${moved.intakes} isian`,
    });
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin/pasien");
    return toForm(await checkableBooking(booking.id));
  });
}

class StatusChanged extends Error {}

/**
 * Check-in (spec 3.1): data pasien, status Hadir + jam check-in, dan baris food
 * recall bila ditawarkan — dalam satu transaksi. Perpindahan status bersyarat:
 * dua resepsionis yang menekan bersamaan, hanya satu yang berhasil.
 */
export async function checkInAppointment(input: CheckInInput): Promise<ActionResult<CheckInResult>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const booking = await checkableBooking(input?.appointmentId);
    const { patient } = booking;

    // NIK wajib, kecuali "Belum ada NIK" beralasan; pasien tanpa NIK ditanya lagi setiap check-in (spec 3.2, 3.4).
    let nikData: { nik: string | null; nikMissingReason: NikMissingReasonValue | null } | null = null;
    const choice = input?.nik;
    if (choice?.kind === "KEEP") {
      if (!patient.nik) throw new UserFacingError(NIK_REQUIRED);
    } else if (choice?.kind === "SET") {
      const nik = normalizeNik(String(choice.value ?? ""));
      if (!nik) throw new UserFacingError(NIK_FORMAT_ERROR);
      const owner = await findOwner(nik, patient.id);
      if (owner) {
        throw new UserFacingError(
          `NIK ini sudah dipakai ${owner.name} (${owner.medicalRecordNumber}). Periksa lagi, atau pindahkan booking ke pasien itu.`,
        );
      }
      if (nik !== patient.nik) nikData = { nik, nikMissingReason: null };
    } else if (choice?.kind === "MISSING") {
      if (!isNikMissingReason(choice.reason)) throw new UserFacingError(NIK_REQUIRED);
      if (patient.nik) throw new UserFacingError("Pasien ini sudah punya NIK.");
      nikData = { nik: null, nikMissingReason: choice.reason };
    } else {
      throw new UserFacingError(NIK_REQUIRED);
    }

    const whatsapp = normalizeWhatsapp(String(input?.whatsapp ?? ""));
    if (!whatsapp) throw new UserFacingError("Nomor WhatsApp tidak sah. Contoh: 081234567890.");

    const checked = validateLinkIdentity(input?.identity ?? {}, missingIdentityFields(patient));
    if (!checked.ok) {
      throw new UserFacingError(checked.field ? IDENTITY_MESSAGE[checked.field] : "Data diri tidak sah. Muat ulang lalu coba lagi.");
    }
    const filled = checked.identity;

    const now = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.appointment.updateMany({
          where: { id: booking.id, status: { in: ACTIVE_STATUSES }, patientId: patient.id },
          data: { status: "HADIR", checkedInAt: now },
        });
        if (count === 0) throw new StatusChanged();
        await tx.patient.update({
          where: { id: patient.id },
          data: {
            whatsapp,
            ...(nikData ?? {}),
            ...(filled.birthDate ? { birthDate: new Date(`${filled.birthDate}T00:00:00Z`) } : {}),
            ...(filled.gender ? { gender: filled.gender } : {}),
            ...(filled.occupation ? { occupation: filled.occupation } : {}),
            ...(filled.address ? { address: filled.address } : {}),
          },
        });
        if (input.offerFoodRecall) {
          await tx.foodRecall.upsert({
            where: { appointmentId: booking.id },
            create: { appointmentId: booking.id, recallDate: new Date(`${recallDateFor(booking.startAt)}T00:00:00Z`) },
            update: {},
          });
        }
      });
    } catch (error) {
      if (error instanceof StatusChanged) {
        const current = await prisma.appointment.findUnique({ where: { id: booking.id }, select: { status: true } });
        throw current?.status === "HADIR" ? new UserFacingError(ALREADY_CHECKED_IN) : await rejectedChangeError(booking.id, true);
      }
      if (isUniqueViolation(error)) throw new UserFacingError(NIK_TAKEN_RACE);
      throw error;
    }

    await recordAudit({ actor, action: "appointment.check-in", entity: "Appointment", entityId: booking.id, summary: booking.code });
    if (nikData) {
      await recordAudit({
        actor,
        action: "patient.update-nik",
        entity: "Patient",
        entityId: patient.id,
        summary: `${patient.medicalRecordNumber}: ${
          nikData.nik ? maskNik(nikData.nik) : `belum ada NIK (${NIK_MISSING_REASONS[nikData.nikMissingReason!]})`
        }`,
      });
    }
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/pengingat");
    return {
      patientName: patient.name,
      foodRecall: input.offerFoodRecall ? foodRecallLinkInfo(await loadFoodRecallForAppointment(booking.id), now) : null,
    };
  });
}
