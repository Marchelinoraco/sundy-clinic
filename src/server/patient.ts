"use server";

import type { AppointmentStatus, Patient, PatientProgramStatus } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { ageInYears } from "@/lib/age";
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import { prisma } from "@/lib/db";
import { assessmentPreview, IMPORTANT_NOTES_MAX, PAPER_RECORD_NUMBER_MAX } from "@/lib/encounter";
import { FOOD_RECALL_SELECT, foodRecallView, type FoodRecallView } from "@/lib/food-recall";
import { formatDateColumn, formatGender } from "@/lib/format";
import { INTAKE_PURPOSE_LABEL } from "@/lib/intake-purpose";
import {
  isNikMissingReason,
  maskNik,
  NIK_FORMAT_ERROR,
  NIK_MISSING_REASONS,
  normalizeNik,
  type NikMissingReasonValue,
} from "@/lib/nik";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { recordAudit, recordAuditThrottled } from "@/server/audit";
import { placeLabel } from "@/lib/online-consultation";
import { isUniqueViolation } from "@/server/db-errors";
import { insertPatient } from "@/server/patient-store";
import { requireCapability } from "@/server/session";

/**
 * Bentuk pasien yang boleh sampai ke browser. Fungsi di berkas ini dipanggil
 * langsung dari komponen klien (pencarian pasien, formulir pasien baru), jadi
 * catatan medis tidak pernah ikut (spec 6.2). Halaman pasien membacanya lewat
 * getPatientDetail, hanya untuk record:read.
 */
export type PatientSummary = {
  id: string;
  medicalRecordNumber: string;
  name: string;
  whatsapp: string;
  programStatus: PatientProgramStatus;
  /** Jadwal kunjungan terakhir (diisi saat kunjungan difinalisasi). */
  lastVisitAt: Date | null;
  /** Booking aktif terdekat yang belum lewat, agar booking ganda ketahuan (spec C1 bagian 3). */
  nextBookingAt: Date | null;
};

const NEXT_BOOKING_STATUSES: AppointmentStatus[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

function summarySelect(now: Date) {
  return {
    id: true,
    medicalRecordNumber: true,
    name: true,
    whatsapp: true,
    programStatus: true,
    lastVisitAt: true,
    appointments: {
      where: { status: { in: NEXT_BOOKING_STATUSES }, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 1,
      select: { startAt: true },
    },
  } as const;
}

type SummaryRow = Pick<
  Patient,
  "id" | "medicalRecordNumber" | "name" | "whatsapp" | "programStatus" | "lastVisitAt"
> & { appointments: { startAt: Date }[] };

function toSummary(row: SummaryRow): PatientSummary {
  return {
    id: row.id,
    medicalRecordNumber: row.medicalRecordNumber,
    name: row.name,
    whatsapp: row.whatsapp,
    programStatus: row.programStatus,
    lastVisitAt: row.lastVisitAt,
    nextBookingAt: row.appointments[0]?.startAt ?? null,
  };
}

export async function createPatient(input: {
  name: string;
  whatsapp: string;
  birthDate?: string;
  gender?: "L" | "P";
  occupation?: string;
  address?: string;
}): Promise<ActionResult<PatientSummary>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");

    // Divalidasi SEBELUM nomor rekam medis dialokasikan: nomor urut yang
    // sudah diambil tidak pernah dikembalikan, jadi input yang ditolak
    // tidak boleh sempat memakannya.
    const name = input.name.trim();
    if (!name) throw new UserFacingError("Nama pasien wajib diisi.");
    const whatsapp = normalizeWhatsapp(input.whatsapp);
    if (!whatsapp) {
      throw new UserFacingError("Nomor WhatsApp tidak sah. Contoh: 081234567890.");
    }

    const patient = await insertPatient(prisma, {
      name,
      whatsapp,
      birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null,
      gender: input.gender,
      occupation: input.occupation,
      address: input.address,
    });

    await recordAudit({
      actor,
      action: "patient.create",
      entity: "Patient",
      entityId: patient.id,
      summary: `${patient.name} (${patient.medicalRecordNumber})`,
    });

    safeRevalidatePath("/admin/pasien");
    // Pasien yang baru dibuat belum punya booking.
    return toSummary({ ...patient, appointments: [] });
  });
}

export async function listRecentPatients(limit = 50): Promise<PatientSummary[]> {
  await requireCapability("booking:manage");
  const rows = await prisma.patient.findMany({
    where: { mergedIntoId: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: summarySelect(new Date()),
  });
  return rows.map(toSummary);
}

/** Satu pasien dalam bentuk ringkasan, untuk Booking Baru dengan pasien terpilih (spec D 5.8). */
export async function getPatientSummary(id: string): Promise<PatientSummary | null> {
  await requireCapability("booking:manage");
  const row = await prisma.patient.findUnique({ where: { id, mergedIntoId: null }, select: summarySelect(new Date()) });
  return row ? toSummary(row) : null;
}

/** Jumlah semua pasien, untuk kepala halaman Pasien (spec D 5.2). */
export async function countPatients(): Promise<number> {
  await requireCapability("booking:manage");
  return prisma.patient.count({ where: { mergedIntoId: null } });
}

/** Cocok terhadap nama (sebagian, tanpa peduli huruf besar/kecil), nomor WhatsApp, no. RM, atau NIK (≥ 6 angka). Pasien rangkap tidak ikut. */
export async function searchPatients(query: string): Promise<PatientSummary[]> {
  await requireCapability("booking:manage");
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Nomor tersimpan berawalan 62, sedangkan admin lazim mengetik 0812….
  const phoneVariants: { whatsapp: { contains: string } }[] = [];
  if (/^[\d\s()+-]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits) {
      phoneVariants.push({
        whatsapp: { contains: digits.startsWith("0") ? `62${digits.slice(1)}` : digits },
      });
    }
  }

  // NIK lazim diketik berspasi atau bertitik seperti di KTP.
  const nikDigits = /^[\d\s.-]+$/.test(trimmed) ? trimmed.replace(/\D/g, "") : "";
  const nikMatch = nikDigits.length >= 6 ? [{ nik: { contains: nikDigits } }] : [];

  const rows = await prisma.patient.findMany({
    where: {
      mergedIntoId: null,
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { whatsapp: { contains: trimmed } },
        { medicalRecordNumber: { contains: trimmed, mode: "insensitive" } },
        ...phoneVariants,
        ...nikMatch,
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
    select: summarySelect(new Date()),
  });
  return rows.map(toSummary);
}

/** Dipakai saat membuat pasien baru untuk menawarkan penggabungan bila nomor sudah terdaftar. */
export async function findPatientsByWhatsapp(whatsapp: string): Promise<PatientSummary[]> {
  await requireCapability("booking:manage");
  const normalized = normalizeWhatsapp(whatsapp);
  if (!normalized) return [];
  const rows = await prisma.patient.findMany({ where: { whatsapp: normalized, mergedIntoId: null }, select: summarySelect(new Date()) });
  return rows.map(toSummary);
}

export type PatientDetail = {
  id: string;
  medicalRecordNumber: string;
  name: string;
  whatsapp: string;
  birthDateLabel: string | null;
  /** Umur dalam tahun penuh, atau null tanpa tanggal lahir (spec D 5.3). */
  ageYears: number | null;
  genderLabel: string | null;
  occupation: string | null;
  address: string | null;
  /** Nomor rekam medis kertas lama; boleh dilihat dan diubah resepsionis (spec R11). */
  paperRecordNumber: string | null;
  /** NIK, atau alasan belum ada NIK (spec check-in 3.4). Tidak pernah dikirim ke situs publik. */
  nik: string | null;
  nikMissingReason: NikMissingReasonValue | null;
  /** Pasien rangkap: booking dan isiannya sudah dipindah ke pasien ini (spec check-in 3.3). */
  mergedInto: { id: string; medicalRecordNumber: string; name: string } | null;
  programStatus: "AKTIF" | "SELESAI" | "TIDAK_AKTIF";
  /** Jadwal kunjungan terakhir yang difinalisasi. */
  lastVisitAt: Date | null;
  /** Hanya untuk record:read (spec 6.2). */
  record: { allergies: string | null; medicalHistory: string | null; importantNotes: string | null } | null;
  appointments: {
    id: string;
    code: string;
    startAt: Date;
    status: AppointmentStatusValue;
    serviceName: string;
    staffName: string;
    branchName: string;
  }[];
  intakes: {
    id: string;
    code: string;
    submittedAt: Date | null;
    status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA";
    kind: "LENGKAP" | "PENDEK";
    purposeLabel: string | null;
    reviewerName: string | null;
    reviewedAt: Date | null;
  }[];
  /** Riwayat kunjungan, terbaru di atas. Hanya untuk record:read. */
  encounters:
    | {
        id: string;
        code: string;
        startAt: Date;
        branchName: string;
        authorName: string;
        assessmentPreview: string | null;
        status: "DRAF" | "FINAL";
        foodRecall: FoodRecallView | null;
      }[]
    | null;
};

/**
 * Identitas, riwayat booking, dan riwayat isian satu pasien (spec 6.5).
 * Catatan medis dibaca dengan kueri terpisah hanya untuk record:read; jawaban
 * kuis tidak pernah dipilih di sini — dokter membukanya di halaman isian.
 */
export async function getPatientDetail(id: string): Promise<PatientDetail | null> {
  const staff = await requireCapability("booking:manage");
  const patient = await prisma.patient.findUnique({
    where: { id },
    select: {
      id: true,
      medicalRecordNumber: true,
      name: true,
      whatsapp: true,
      birthDate: true,
      gender: true,
      occupation: true,
      address: true,
      paperRecordNumber: true,
      nik: true,
      nikMissingReason: true,
      mergedInto: { select: { id: true, medicalRecordNumber: true, name: true } },
      programStatus: true,
      lastVisitAt: true,
      appointments: {
        orderBy: { startAt: "desc" },
        select: {
          id: true,
          code: true,
          type: true,
          startAt: true,
          status: true,
          channel: true,
          service: { select: { name: true } },
          staff: { select: { name: true } },
          branch: { select: { name: true } },
        },
      },
      intakes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          kind: true,
          purpose: true,
          submittedAt: true,
          reviewedAt: true,
          reviewedBy: { select: { name: true } },
          appointment: { select: { code: true } },
        },
      },
    },
  });
  if (!patient) return null;

  const canRead = can(staff.role, "record:read");
  const record = canRead
    ? await prisma.patient.findUniqueOrThrow({
        where: { id },
        select: { allergies: true, medicalHistory: true, importantNotes: true },
      })
    : null;
  const encounters = canRead
    ? await prisma.encounter.findMany({
        where: { appointment: { patientId: id } },
        orderBy: { appointment: { startAt: "desc" } },
        select: {
          id: true,
          status: true,
          assessment: true,
          createdByName: true,
          finalizedByName: true,
          appointment: { select: { id: true, code: true, startAt: true, channel: true, branch: { select: { name: true } }, foodRecall: { select: FOOD_RECALL_SELECT } } },
        },
      })
    : null;
  if (canRead) {
    await recordAuditThrottled({
      actor: staff,
      action: "patient.view-records",
      entity: "Patient",
      entityId: id,
      summary: patient.medicalRecordNumber,
    });
  }

  return {
    id: patient.id,
    medicalRecordNumber: patient.medicalRecordNumber,
    name: patient.name,
    whatsapp: patient.whatsapp,
    birthDateLabel: formatDateColumn(patient.birthDate),
    ageYears: patient.birthDate ? ageInYears(patient.birthDate, new Date()) : null,
    genderLabel: formatGender(patient.gender),
    occupation: patient.occupation,
    address: patient.address,
    paperRecordNumber: patient.paperRecordNumber,
    nik: patient.nik,
    nikMissingReason: patient.nikMissingReason,
    mergedInto: patient.mergedInto,
    programStatus: patient.programStatus,
    lastVisitAt: patient.lastVisitAt,
    record,
    appointments: patient.appointments.map((a) => ({
      id: a.id,
      code: a.code,
      startAt: a.startAt,
      status: a.status,
      serviceName: a.service?.name ?? (a.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
      staffName: a.staff.name,
      branchName: placeLabel(a.channel, a.branch.name),
    })),
    intakes: patient.intakes.map((intake) => ({
      id: intake.id,
      code: intake.appointment.code,
      submittedAt: intake.submittedAt,
      status: intake.status,
      kind: intake.kind,
      purposeLabel: intake.purpose ? INTAKE_PURPOSE_LABEL[intake.purpose] : null,
      reviewerName: intake.reviewedBy?.name ?? null,
      reviewedAt: intake.reviewedAt,
    })),
    encounters:
      encounters?.map((encounter) => ({
        id: encounter.id,
        code: encounter.appointment.code,
        startAt: encounter.appointment.startAt,
        branchName: placeLabel(encounter.appointment.channel, encounter.appointment.branch.name),
        authorName: encounter.finalizedByName ?? encounter.createdByName,
        assessmentPreview: assessmentPreview(encounter.assessment),
        status: encounter.status,
        foodRecall: encounter.appointment.foodRecall ? foodRecallView(encounter.appointment, encounter.appointment.foodRecall) : null,
      })) ?? null,
  };
}

/** Catatan penting dokter, tampil di peringatan setiap kunjungan (spec R6). */
export async function updatePatientImportantNotes(input: { patientId: string; text: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const text = String(input?.text ?? "").trim();
    if (text.length > IMPORTANT_NOTES_MAX) throw new UserFacingError("Catatan penting terlalu panjang (maks. 2.000 karakter).");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, medicalRecordNumber: true },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");

    await prisma.patient.update({ where: { id: patient.id }, data: { importantNotes: text || null } });
    // Tanpa isi catatan: jejak audit untuk siapa dan kapan, bukan apa.
    await recordAudit({
      actor,
      action: "patient.update-important-notes",
      entity: "Patient",
      entityId: patient.id,
      summary: patient.medicalRecordNumber,
    });
    safeRevalidatePath(`/admin/pasien/${patient.id}`);
  });
}

/** No. RM kertas lama (spec R11): front office yang mengambil berkas dari lemari, jadi booking:manage. */
export async function updatePaperRecordNumber(input: { patientId: string; text: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const text = String(input?.text ?? "").trim();
    if (text.length > PAPER_RECORD_NUMBER_MAX) throw new UserFacingError("No. RM kertas lama terlalu panjang (maks. 50 karakter).");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, medicalRecordNumber: true },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");

    await prisma.patient.update({ where: { id: patient.id }, data: { paperRecordNumber: text || null } });
    await recordAudit({
      actor,
      action: "patient.update-paper-record-number",
      entity: "Patient",
      entityId: patient.id,
      summary: `${patient.medicalRecordNumber}: ${text || "dikosongkan"}`,
    });
    safeRevalidatePath(`/admin/pasien/${patient.id}`);
  });
}

/** NIK dari halaman data pasien (spec check-in 3.4): aturannya sama dengan check-in, tanpa pindah pasien rangkap. */
export async function updatePatientNik(input: {
  patientId: string;
  nik: string | null;
  missingReason: string | null;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, medicalRecordNumber: true, mergedIntoId: true },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
    if (patient.mergedIntoId) throw new UserFacingError("Pasien ini rangkap; ubah NIK di pasien lamanya.");

    let data: { nik: string | null; nikMissingReason: NikMissingReasonValue | null };
    if (input?.nik !== null && input?.nik !== undefined) {
      const nik = normalizeNik(String(input.nik));
      if (!nik) throw new UserFacingError(NIK_FORMAT_ERROR);
      const owner = await prisma.patient.findFirst({
        where: { nik, id: { not: patient.id } },
        select: { name: true, medicalRecordNumber: true },
      });
      if (owner) throw new UserFacingError(`NIK ini sudah dipakai ${owner.name} (${owner.medicalRecordNumber}).`);
      data = { nik, nikMissingReason: null };
    } else if (isNikMissingReason(input?.missingReason)) {
      data = { nik: null, nikMissingReason: input.missingReason };
    } else {
      throw new UserFacingError("Isi NIK atau pilih alasan belum ada NIK.");
    }

    try {
      await prisma.patient.update({ where: { id: patient.id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError("NIK ini baru saja dipakai pasien lain — periksa lagi.");
      throw error;
    }
    await recordAudit({
      actor,
      action: "patient.update-nik",
      entity: "Patient",
      entityId: patient.id,
      summary: `${patient.medicalRecordNumber}: ${
        data.nik ? maskNik(data.nik) : `belum ada NIK (${NIK_MISSING_REASONS[data.nikMissingReason!]})`
      }`,
    });
    safeRevalidatePath(`/admin/pasien/${patient.id}`);
  });
}
