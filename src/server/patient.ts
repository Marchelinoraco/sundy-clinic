"use server";

import type { Patient, PatientProgramStatus } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import { prisma } from "@/lib/db";
import { formatDateColumn, formatGender } from "@/lib/format";
import { INTAKE_PURPOSE_LABEL } from "@/lib/intake-purpose";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { recordAudit } from "@/server/audit";
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
};

const SUMMARY_SELECT = {
  id: true,
  medicalRecordNumber: true,
  name: true,
  whatsapp: true,
  programStatus: true,
} as const;

function toSummary(patient: Patient): PatientSummary {
  return {
    id: patient.id,
    medicalRecordNumber: patient.medicalRecordNumber,
    name: patient.name,
    whatsapp: patient.whatsapp,
    programStatus: patient.programStatus,
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
    return toSummary(patient);
  });
}

export async function listRecentPatients(limit = 50): Promise<PatientSummary[]> {
  await requireCapability("booking:manage");
  return prisma.patient.findMany({ orderBy: { createdAt: "desc" }, take: limit, select: SUMMARY_SELECT });
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

  return prisma.patient.findMany({
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
    select: SUMMARY_SELECT,
  });
}

/** Dipakai saat membuat pasien baru untuk menawarkan penggabungan bila nomor sudah terdaftar. */
export async function findPatientsByWhatsapp(whatsapp: string): Promise<PatientSummary[]> {
  await requireCapability("booking:manage");
  const normalized = normalizeWhatsapp(whatsapp);
  if (!normalized) return [];
  return prisma.patient.findMany({ where: { whatsapp: normalized }, select: SUMMARY_SELECT });
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
  programStatus: "AKTIF" | "SELESAI" | "TIDAK_AKTIF";
  /** Hanya untuk record:read (spec 6.2). */
  record: { allergies: string | null; medicalHistory: string | null } | null;
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

  const record = can(staff.role, "record:read")
    ? await prisma.patient.findUniqueOrThrow({ where: { id }, select: { allergies: true, medicalHistory: true } })
    : null;

  return {
    id: patient.id,
    medicalRecordNumber: patient.medicalRecordNumber,
    name: patient.name,
    whatsapp: patient.whatsapp,
    birthDateLabel: formatDateColumn(patient.birthDate),
    genderLabel: formatGender(patient.gender),
    occupation: patient.occupation,
    address: patient.address,
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
  };
}
