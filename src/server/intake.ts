"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
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
