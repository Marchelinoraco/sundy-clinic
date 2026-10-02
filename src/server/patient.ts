"use server";

import type { AppointmentStatus, Patient, PatientProgramStatus } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import { prisma } from "@/lib/db";
import { formatDateColumn, formatGender } from "@/lib/format";
import { INTAKE_PURPOSE_LABEL } from "@/lib/intake-purpose";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { assessmentPreview, IMPORTANT_NOTES_MAX, PAPER_RECORD_NUMBER_MAX } from "@/lib/encounter";
import { recordAudit, recordAuditThrottled } from "@/server/audit";
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
    orderBy: { createdAt: "desc" },
    take: limit,
    select: summarySelect(new Date()),
  });
  return rows.map(toSummary);
}

/** Satu pasien dalam bentuk ringkasan, untuk Booking Baru dengan pasien terpilih (spec D 5.8). */
export async function getPatientSummary(id: string): Promise<PatientSummary | null> {
  await requireCapability("booking:manage");
  const row = await prisma.patient.findUnique({ where: { id }, select: summarySelect(new Date()) });
  return row ? toSummary(row) : null;
}

/** Cocok terhadap nama (sebagian, tanpa peduli huruf besar/kecil) atau nomor WhatsApp. */
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

  const rows = await prisma.patient.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { whatsapp: { contains: trimmed } },
        { medicalRecordNumber: { contains: trimmed, mode: "insensitive" } },
        ...phoneVariants,
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
  const rows = await prisma.patient.findMany({ where: { whatsapp: normalized }, select: summarySelect(new Date()) });
  return rows.map(toSummary);
}

export type PatientDetail = {
  id: string;
  medicalRecordNumber: string;
  name: string;
  whatsapp: string;
  birthDateLabel: string | null;
  genderLabel: string | null;
  occupation: string | null;
  address: string | null;
  /** Nomor rekam medis kertas lama; boleh dilihat dan diubah resepsionis (spec R11). */
  paperRecordNumber: string | null;
  programStatus: "AKTIF" | "SELESAI" | "TIDAK_AKTIF";
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
      programStatus: true,
      appointments: {
        orderBy: { startAt: "desc" },
        select: {
          id: true,
          code: true,
          type: true,
          startAt: true,
          status: true,
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
          appointment: { select: { code: true, startAt: true, branch: { select: { name: true } } } },
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
    genderLabel: formatGender(patient.gender),
    occupation: patient.occupation,
    address: patient.address,
    paperRecordNumber: patient.paperRecordNumber,
    programStatus: patient.programStatus,
    record,
    appointments: patient.appointments.map((a) => ({
      id: a.id,
      code: a.code,
      startAt: a.startAt,
      status: a.status,
      serviceName: a.service?.name ?? (a.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
      staffName: a.staff.name,
      branchName: a.branch.name,
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
        branchName: encounter.appointment.branch.name,
        authorName: encounter.finalizedByName ?? encounter.createdByName,
        assessmentPreview: assessmentPreview(encounter.assessment),
        status: encounter.status,
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
