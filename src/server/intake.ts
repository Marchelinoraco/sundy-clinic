"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
import type { ActivityRow, IntakeSection } from "@/lib/kuis/v1/describe";
import { activityTable, describeAnswers } from "@/lib/kuis/v1/describe";
import { quizAnswersSchema } from "@/lib/kuis/v1/answers";
import { PURPOSES, QUIZ_VERSION } from "@/lib/kuis/v1/options";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { insertPatient } from "@/server/patient-store";
import { requireCapability } from "@/server/session";

export type MatchCandidate = {
  id: string;
  medicalRecordNumber: string;
  name: string;
  whatsapp: string;
  birthDateLabel: string | null;
  lastVisitLabel: string | null;
};

export type MatchCandidates = {
  code: string;
  intake: { name: string; whatsapp: string; birthDateLabel: string | null; claimsReturning: boolean };
  candidates: MatchCandidate[];
};

/** Kolom @db.Date → "17/04/1992". */
function dateLabel(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10).split("-").reverse().join("/") : null;
}

/** Hanya booking situs yang belum diverifikasi yang boleh dicocokkan (spec 6.1). */
async function loadMatchable(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      code: true,
      source: true,
      status: true,
      intake: {
        select: {
          id: true,
          name: true,
          whatsapp: true,
          birthDate: true,
          gender: true,
          occupation: true,
          address: true,
          claimsReturning: true,
        },
      },
    },
  });
  if (!appointment || appointment.source !== "SITUS" || !appointment.intake) {
    throw new UserFacingError("Hanya booking dari situs yang perlu dicocokkan.");
  }
  if (appointment.status !== "MENUNGGU_KONFIRMASI") {
    throw new UserFacingError("Pasien hanya bisa dicocokkan sebelum booking diverifikasi.");
  }
  return { ...appointment, intake: appointment.intake };
}

async function linkPatient(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  intakeId: string,
  patientId: string,
) {
  const { count } = await tx.appointment.updateMany({
    where: { id: appointmentId, source: "SITUS", status: "MENUNGGU_KONFIRMASI" },
    data: { patientId },
  });
  if (count === 0) throw new UserFacingError("Status booking baru saja berubah. Muat ulang halaman.");
  await tx.intake.update({ where: { id: intakeId }, data: { patientId } });
}

/**
 * Saran pasien yang mirip: nomor WA sama, atau nama depan & tanggal lahir
 * sama. Tidak ada pencocokan otomatis — satu nomor WA sering dipakai
 * sekeluarga, jadi admin yang memutuskan (spec K4, bagian 7).
 */
export async function getMatchCandidates(appointmentId: string): Promise<ActionResult<MatchCandidates>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const { code, intake } = await loadMatchable(appointmentId);

    const firstName = intake.name?.trim().split(/\s+/)[0] ?? "";
    const patients = await prisma.patient.findMany({
      where: {
        OR: [
          ...(intake.whatsapp ? [{ whatsapp: intake.whatsapp }] : []),
          ...(intake.birthDate && firstName
            ? [{ birthDate: intake.birthDate, name: { contains: firstName, mode: "insensitive" as const } }]
            : []),
        ],
      },
      orderBy: { name: "asc" },
      take: 10,
      select: {
        id: true,
        medicalRecordNumber: true,
        name: true,
        whatsapp: true,
        birthDate: true,
        appointments: {
          where: { status: { in: ["HADIR", "SELESAI"] } },
          orderBy: { startAt: "desc" },
          take: 1,
          select: { startAt: true },
        },
      },
    });

    return {
      code,
      intake: {
        name: intake.name ?? "",
        whatsapp: intake.whatsapp ?? "",
        birthDateLabel: dateLabel(intake.birthDate),
        claimsReturning: intake.claimsReturning ?? false,
      },
      candidates: patients.map((patient) => ({
        id: patient.id,
        medicalRecordNumber: patient.medicalRecordNumber,
        name: patient.name,
        whatsapp: patient.whatsapp,
        birthDateLabel: dateLabel(patient.birthDate),
        lastVisitLabel: patient.appointments[0] ? formatIndonesianDate(patient.appointments[0].startAt) : null,
      })),
    };
  });
}

export async function matchPatient(appointmentId: string, patientId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const appointment = await loadMatchable(appointmentId);
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, medicalRecordNumber: true },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");

    await prisma.$transaction((tx) => linkPatient(tx, appointment.id, appointment.intake.id, patient.id));

    await recordAudit({
      actor,
      action: "appointment.match-patient",
      entity: "Appointment",
      entityId: appointment.id,
      summary: `${appointment.code} → ${patient.medicalRecordNumber}`,
    });
    safeRevalidatePath("/admin/booking");
  });
}

export async function createPatientFromIntake(
  appointmentId: string,
): Promise<ActionResult<{ patientId: string; medicalRecordNumber: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const appointment = await loadMatchable(appointmentId);
    const { intake } = appointment;
    const name = intake.name;
    const whatsapp = intake.whatsapp;
    if (!name || !whatsapp) throw new UserFacingError("Isian ini belum memuat nama dan nomor WhatsApp.");

    // Nomor RM dialokasikan di dalam transaksi yang sama: bila pencocokan
    // gagal, nomornya ikut batal dan tidak terbuang.
    const patient = await prisma.$transaction(async (tx) => {
      const created = await insertPatient(tx, {
        name,
        whatsapp,
        birthDate: intake.birthDate,
        gender: intake.gender,
        occupation: intake.occupation,
        address: intake.address,
      });
      await linkPatient(tx, appointment.id, intake.id, created.id);
      return created;
    });

    await recordAudit({
      actor,
      action: "patient.create",
      entity: "Patient",
      entityId: patient.id,
      summary: `${patient.name} (${patient.medicalRecordNumber}) dari booking ${appointment.code}`,
    });
    await recordAudit({
      actor,
      action: "appointment.match-patient",
      entity: "Appointment",
      entityId: appointment.id,
      summary: `${appointment.code} → ${patient.medicalRecordNumber} (pasien baru)`,
    });
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin/pasien");
    return { patientId: patient.id, medicalRecordNumber: patient.medicalRecordNumber };
  });
}

export type IntakeDetail = {
  id: string;
  status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA";
  kind: "LENGKAP" | "PENDEK";
  purposeLabel: string | null;
  submittedAt: Date | null;
  appointment: { code: string; startAt: Date; serviceName: string; staffName: string };
  patient: { name: string; medicalRecordNumber: string } | null;
  identity: {
    name: string | null;
    whatsapp: string | null;
    birthDateLabel: string | null;
    genderLabel: string | null;
    occupation: string | null;
    address: string | null;
  };
  /** null untuk peran tanpa record:read, atau bila pasien belum mengisi. */
  clinical: {
    sections: IntakeSection[];
    activities: ActivityRow[] | null;
    activityDateLabel: string | null;
  } | null;
};

/** Kolom klinis dibaca dengan kueri terpisah, hanya untuk yang berhak (spec 6.2). */
async function loadClinical(intakeId: string): Promise<IntakeDetail["clinical"]> {
  const row = await prisma.intake.findUniqueOrThrow({
    where: { id: intakeId },
    select: { quizVersion: true, answers: true, selfWeightKg: true, selfHeightCm: true, activityDate: true },
  });
  if (row.answers === null) return null;
  if (row.quizVersion !== QUIZ_VERSION) {
    throw new Error(`Isian dengan kuis versi ${row.quizVersion} belum bisa ditampilkan.`);
  }

  const answers = quizAnswersSchema.parse(row.answers);
  // Berat & tinggi disimpan di kolom bertipe, bukan di JSON (spec 5.1).
  if (answers.slimming && row.selfWeightKg !== null && row.selfHeightCm !== null) {
    answers.slimming.weightKg = Number(row.selfWeightKg);
    answers.slimming.heightCm = Number(row.selfHeightCm);
  }

  return {
    // Aktivitas tampil sebagai tabel 06.00–22.00, bukan daftar baris.
    sections: describeAnswers(answers).filter((section) => section.step !== "P3"),
    activities: answers.returning?.activities ? activityTable(answers.returning.activities) : null,
    activityDateLabel: row.activityDate ? formatIndonesianDate(row.activityDate) : null,
  };
}

export async function getIntakeForStaff(intakeId: string): Promise<IntakeDetail | null> {
  const staff = await requireCapability("booking:manage");

  const row = await prisma.intake.findUnique({
    where: { id: intakeId },
    select: {
      id: true,
      status: true,
      kind: true,
      purpose: true,
      submittedAt: true,
      name: true,
      whatsapp: true,
      birthDate: true,
      gender: true,
      occupation: true,
      address: true,
      appointment: {
        select: {
          code: true,
          startAt: true,
          service: { select: { name: true } },
          staff: { select: { name: true } },
        },
      },
      patient: { select: { name: true, medicalRecordNumber: true } },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    purposeLabel: row.purpose ? PURPOSES[row.purpose] : null,
    submittedAt: row.submittedAt,
    appointment: {
      code: row.appointment.code,
      startAt: row.appointment.startAt,
      serviceName: row.appointment.service?.name ?? "Konsultasi",
      staffName: row.appointment.staff.name,
    },
    patient: row.patient,
    identity: {
      name: row.name,
      whatsapp: row.whatsapp,
      birthDateLabel: dateLabel(row.birthDate),
      genderLabel: row.gender === "P" ? "Perempuan" : row.gender === "L" ? "Laki-laki" : null,
      occupation: row.occupation,
      address: row.address,
    },
    clinical: can(staff.role, "record:read") ? await loadClinical(row.id) : null,
  };
}
