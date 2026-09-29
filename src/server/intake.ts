"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
import type { ActivityRow, IntakeSection } from "@/lib/kuis/v1/describe";
import { activityTable, describeAnswers } from "@/lib/kuis/v1/describe";
import { quizAnswersSchema, type QuizAnswers } from "@/lib/kuis/v1/answers";
import { PURPOSES, QUIZ_VERSION } from "@/lib/kuis/v1/options";
import { proposeRecordFromAnswers, type RecordProposal } from "@/lib/kuis/v1/record-proposal";
import { can } from "@/lib/permissions";
import { mergeRecordText } from "@/lib/record-text";
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

export type IntakeApproval =
  | { state: "needs-match" }
  | {
      state: "ready";
      patientId: string;
      /** updatedAt pasien (ISO) saat halaman dibuka; simpan ditolak bila data pasien berubah sesudahnya. */
      patientVersion: string;
      current: { allergies: string | null; medicalHistory: string | null };
      proposed: RecordProposal;
      /** Isi awal kolom sunting. */
      prefill: { allergies: string; medicalHistory: string };
    };

export type IntakeDetail = {
  id: string;
  status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA";
  kind: "LENGKAP" | "PENDEK";
  purposeLabel: string | null;
  submittedAt: Date | null;
  appointment: { code: string; startAt: Date; serviceName: string; staffName: string };
  patient: { id: string; name: string; medicalRecordNumber: string } | null;
  review: { reviewedAt: Date; reviewerName: string } | null;
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
  /** Hanya untuk record:write, setelah pasien mengisi kuis (spec 6.4). */
  approval: IntakeApproval | null;
};

/** Kolom klinis dibaca dengan kueri terpisah, hanya untuk yang berhak (spec 6.2). */
async function loadClinical(
  intakeId: string,
): Promise<{ clinical: NonNullable<IntakeDetail["clinical"]>; answers: QuizAnswers } | null> {
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
    answers,
    clinical: {
      // Aktivitas tampil sebagai tabel 06.00–22.00, bukan daftar baris.
      sections: describeAnswers(answers).filter((section) => section.step !== "P3"),
      activities: answers.returning?.activities ? activityTable(answers.returning.activities) : null,
      activityDateLabel: row.activityDate ? formatIndonesianDate(row.activityDate) : null,
    },
  };
}

/**
 * Usulan berdampingan dengan catatan pasien saat ini (spec 6.4). Isian yang
 * sudah diperiksa tidak menggabungkan usulan lagi: baris yang sengaja dihapus
 * dokter tidak boleh muncul kembali.
 */
async function loadApproval(patientId: string, answers: QuizAnswers, reviewed: boolean): Promise<IntakeApproval> {
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { allergies: true, medicalHistory: true, updatedAt: true },
  });
  const proposed = proposeRecordFromAnswers(answers);
  return {
    state: "ready",
    patientId,
    patientVersion: patient.updatedAt.toISOString(),
    current: { allergies: patient.allergies, medicalHistory: patient.medicalHistory },
    proposed,
    prefill: reviewed
      ? { allergies: patient.allergies ?? "", medicalHistory: patient.medicalHistory ?? "" }
      : {
          allergies: mergeRecordText(patient.allergies, proposed.allergies),
          medicalHistory: mergeRecordText(patient.medicalHistory, proposed.medicalHistory),
        },
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
      patient: { select: { id: true, name: true, medicalRecordNumber: true } },
      reviewedAt: true,
      reviewedBy: { select: { name: true } },
    },
  });
  if (!row) return null;

  const loaded = can(staff.role, "record:read") ? await loadClinical(row.id) : null;
  let approval: IntakeApproval | null = null;
  if (loaded && can(staff.role, "record:write")) {
    approval = row.patient
      ? await loadApproval(row.patient.id, loaded.answers, row.status === "DIPERIKSA")
      : { state: "needs-match" };
  }

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
    review: row.reviewedAt && row.reviewedBy ? { reviewedAt: row.reviewedAt, reviewerName: row.reviewedBy.name } : null,
    identity: {
      name: row.name,
      whatsapp: row.whatsapp,
      birthDateLabel: dateLabel(row.birthDate),
      genderLabel: row.gender === "P" ? "Perempuan" : row.gender === "L" ? "Laki-laki" : null,
      occupation: row.occupation,
      address: row.address,
    },
    clinical: loaded?.clinical ?? null,
    approval,
  };
}

/** Batas panjang teks catatan medis yang disunting dokter. */
const RECORD_TEXT_MAX = 2000;

/**
 * Setujui ke data pasien (spec 6.4, K12). Mengganti catatan Alergi dan
 * Riwayat penyakit & obat pasien dengan teks yang disunting dokter, lalu
 * menandai isian DIPERIKSA. Identitas pasien dan jawaban isian tidak disentuh.
 */
export async function approveIntakeToPatient(input: {
  intakeId: string;
  allergies: string;
  medicalHistory: string;
  patientVersion: string;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const allergies = String(input.allergies ?? "").trim();
    const medicalHistory = String(input.medicalHistory ?? "").trim();
    if (allergies.length > RECORD_TEXT_MAX || medicalHistory.length > RECORD_TEXT_MAX) {
      throw new UserFacingError("Teks alergi atau riwayat penyakit terlalu panjang (maks. 2.000 karakter).");
    }
    const version = new Date(String(input.patientVersion ?? ""));
    if (Number.isNaN(version.getTime())) throw new UserFacingError("Muat ulang halaman lalu coba lagi.");

    const intake = await prisma.intake.findUnique({
      where: { id: String(input.intakeId ?? "") },
      select: {
        id: true,
        status: true,
        patientId: true,
        appointment: { select: { code: true } },
        patient: { select: { medicalRecordNumber: true } },
      },
    });
    if (!intake) throw new UserFacingError("Isian tidak ditemukan.");
    if (intake.status === "MENUNGGU_DIISI") throw new UserFacingError("Pasien belum mengisi kuis.");
    if (!intake.patientId || !intake.patient) throw new UserFacingError("Cocokkan booking ini dengan pasien dulu.");
    const patientId = intake.patientId;

    await prisma.$transaction(async (tx) => {
      // Hanya bila catatan pasien belum berubah sejak halaman dibuka: persetujuan
      // dari halaman lama tidak boleh menimpa persetujuan yang lebih baru.
      const { count } = await tx.patient.updateMany({
        where: { id: patientId, updatedAt: version },
        data: { allergies: allergies || null, medicalHistory: medicalHistory || null },
      });
      if (count === 0) {
        throw new UserFacingError("Data pasien baru saja berubah. Muat ulang halaman lalu periksa lagi.");
      }
      await tx.intake.update({
        where: { id: intake.id },
        data: { status: "DIPERIKSA", reviewedAt: new Date(), reviewedByStaffId: actor.staffId },
      });
    });

    // Tanpa isi klinis: jejak audit untuk menelusuri siapa dan kapan, bukan apa.
    await recordAudit({
      actor,
      action: "patient.approve-intake",
      entity: "Patient",
      entityId: patientId,
      summary: `${intake.patient.medicalRecordNumber}: alergi & riwayat penyakit dari isian ${intake.appointment.code}`,
    });
    safeRevalidatePath(`/admin/isian/${intake.id}`);
    safeRevalidatePath(`/admin/pasien/${patientId}`);
    safeRevalidatePath("/admin/booking");
  });
}
