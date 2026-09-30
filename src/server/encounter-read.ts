"use server";

import type { IntakeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  VITAL_KEYS,
  ageInYears,
  describeVitals,
  vitalInputValue,
  type EncounterDraftInput,
  type EncounterOptions,
  type VitalKey,
} from "@/lib/encounter";
import { formatGender } from "@/lib/format";
import { can } from "@/lib/permissions";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { listAuditTrail, recordAuditThrottled, type AuditTrailRow } from "@/server/audit";
import { loadIntakeClinical, type IntakeClinical } from "@/server/intake-clinical";
import { requireCapability } from "@/server/session";

export type EncounterWarnings = {
  allergies: string | null;
  medicalHistory: string | null;
  importantNotes: string | null;
  paperRecordNumber: string | null;
  /** Dari jawaban K4 isian kunjungan ini (spec R6). */
  pregnancy: boolean;
};

export type EncounterIntake =
  | { id: string; state: "pending" }
  | { id: string; state: "error"; message: string }
  | { id: string; state: "ready"; clinical: IntakeClinical; needsApproval: boolean };

export type EncounterDetail = {
  id: string;
  status: "DRAF" | "FINAL";
  /** updatedAt kunjungan; dikirim kembali saat menyimpan (spec 7). */
  version: string;
  createdByName: string;
  finalized: { byName: string; at: Date } | null;
  appointment: { id: string; code: string; startAt: Date; serviceName: string; staffName: string; branchName: string };
  patient: { id: string; name: string; medicalRecordNumber: string; ageLabel: string | null; genderLabel: string | null };
  warnings: EncounterWarnings;
  intake: EncounterIntake | null;
  /** Isian formulir (teks) untuk draf, juga dipakai tampilan baca-saja. */
  draft: EncounterDraftInput;
  /** Tanda vital yang diukur, siap dibaca (baca-saja). */
  vitalLines: string[];
  treatments: { serviceName: string; area: string | null; dose: string | null; performerName: string; notes: string | null }[];
  addenda: { id: string; text: string; authorName: string; createdAt: Date }[];
  options: EncounterOptions;
  /** Hanya untuk audit:read (Super Admin). */
  trail: AuditTrailRow[] | null;
};

const UNKNOWN_QUIZ_VERSION = "Isian dengan kuis versi";

/** Isian kuis booking ini untuk bagian S. Versi kuis yang tidak dikenal tidak menggagalkan halaman. */
async function loadEncounterIntake(
  intake: { id: string; status: IntakeStatus } | null,
): Promise<{ intake: EncounterIntake | null; pregnancy: boolean }> {
  if (!intake) return { intake: null, pregnancy: false };
  if (intake.status === "MENUNGGU_DIISI") return { intake: { id: intake.id, state: "pending" }, pregnancy: false };
  try {
    const loaded = await loadIntakeClinical(intake.id);
    if (!loaded) return { intake: { id: intake.id, state: "pending" }, pregnancy: false };
    return {
      intake: { id: intake.id, state: "ready", clinical: loaded.clinical, needsApproval: intake.status === "TERISI" },
      pregnancy: loaded.pregnancy,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(UNKNOWN_QUIZ_VERSION)) {
      return { intake: { id: intake.id, state: "error", message: error.message }, pregnancy: false };
    }
    throw error;
  }
}

/**
 * Pilihan formulir: layanan dan pelaksana aktif, ditambah yang sudah dipakai
 * draf atau booking ini walau kini nonaktif, agar pilihannya tidak hilang.
 */
async function loadOptions(
  used: { serviceIds: string[]; performerIds: string[] },
  booking: { serviceId: string | null; staffId: string },
): Promise<EncounterOptions> {
  const serviceIds = [...used.serviceIds, ...(booking.serviceId ? [booking.serviceId] : [])];
  const performerIds = [...used.performerIds, booking.staffId];
  const [services, performers] = await Promise.all([
    prisma.service.findMany({
      where: { OR: [{ isActive: true }, { id: { in: serviceIds } }] },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.staff.findMany({
      where: { role: { in: ["DOKTER", "TERAPIS"] }, OR: [{ isActive: true }, { id: { in: performerIds } }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  const defaultServiceId =
    booking.serviceId && services.some((service) => service.id === booking.serviceId)
      ? booking.serviceId
      : (services[0]?.id ?? "");
  const defaultPerformerId = performers.some((staff) => staff.id === booking.staffId)
    ? booking.staffId
    : (performers[0]?.id ?? "");
  return { services, performers, defaultServiceId, defaultPerformerId };
}

/** Halaman kunjungan (spec 4–5). Membuka catatan tercatat di audit, maks. sekali per 30 menit. */
export async function getEncounterForStaff(encounterId: string): Promise<EncounterDetail | null> {
  const staff = await requireCapability("record:read");
  const row = await prisma.encounter.findUnique({
    where: { id: String(encounterId ?? "") },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      subjective: true,
      physicalExam: true,
      assessment: true,
      plan: true,
      systolic: true,
      diastolic: true,
      pulse: true,
      temperatureC: true,
      weightKg: true,
      heightCm: true,
      waistCm: true,
      createdByName: true,
      finalizedByName: true,
      finalizedAt: true,
      treatments: {
        orderBy: { sortOrder: "asc" },
        select: { serviceId: true, serviceName: true, area: true, dose: true, performerId: true, performerName: true, notes: true },
      },
      addenda: { orderBy: { createdAt: "asc" }, select: { id: true, text: true, authorName: true, createdAt: true } },
      appointment: {
        select: {
          id: true,
          code: true,
          type: true,
          startAt: true,
          serviceId: true,
          staffId: true,
          service: { select: { name: true } },
          staff: { select: { name: true } },
          branch: { select: { name: true } },
          intake: { select: { id: true, status: true } },
          patient: {
            select: {
              id: true,
              name: true,
              medicalRecordNumber: true,
              birthDate: true,
              gender: true,
              allergies: true,
              medicalHistory: true,
              importantNotes: true,
              paperRecordNumber: true,
            },
          },
        },
      },
    },
  });
  if (!row || !row.appointment.patient) return null;
  const { appointment } = row;
  const patient = appointment.patient!;

  await recordAuditThrottled({ actor: staff, action: "encounter.view", entity: "Encounter", entityId: row.id, summary: appointment.code });

  const vitals = {} as Record<VitalKey, number | null>;
  const vitalInputs = {} as Record<VitalKey, string>;
  for (const key of VITAL_KEYS) {
    const value = row[key] === null ? null : Number(row[key]);
    vitals[key] = value;
    vitalInputs[key] = vitalInputValue(key, value);
  }

  const [{ intake, pregnancy }, options, trail] = await Promise.all([
    loadEncounterIntake(appointment.intake),
    loadOptions(
      { serviceIds: row.treatments.map((t) => t.serviceId), performerIds: row.treatments.map((t) => t.performerId) },
      { serviceId: appointment.serviceId, staffId: appointment.staffId },
    ),
    can(staff.role, "audit:read") ? listAuditTrail("Encounter", row.id) : Promise.resolve(null),
  ]);

  return {
    id: row.id,
    status: row.status,
    version: row.updatedAt.toISOString(),
    createdByName: row.createdByName,
    finalized: row.finalizedAt && row.finalizedByName ? { byName: row.finalizedByName, at: row.finalizedAt } : null,
    appointment: {
      id: appointment.id,
      code: appointment.code,
      startAt: appointment.startAt,
      serviceName: appointment.service?.name ?? (appointment.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
      staffName: appointment.staff.name,
      branchName: appointment.branch.name,
    },
    patient: {
      id: patient.id,
      name: patient.name,
      medicalRecordNumber: patient.medicalRecordNumber,
      ageLabel: patient.birthDate ? `${ageInYears(patient.birthDate, witaDateString(appointment.startAt))} tahun` : null,
      genderLabel: formatGender(patient.gender),
    },
    warnings: {
      allergies: patient.allergies,
      medicalHistory: patient.medicalHistory,
      importantNotes: patient.importantNotes,
      paperRecordNumber: patient.paperRecordNumber,
      pregnancy,
    },
    intake,
    draft: {
      subjective: row.subjective ?? "",
      physicalExam: row.physicalExam ?? "",
      assessment: row.assessment ?? "",
      plan: row.plan ?? "",
      vitals: vitalInputs,
      treatments: row.treatments.map((t) => ({
        serviceId: t.serviceId,
        area: t.area ?? "",
        dose: t.dose ?? "",
        performerId: t.performerId,
        notes: t.notes ?? "",
      })),
    },
    vitalLines: describeVitals(vitals),
    treatments: row.treatments.map((t) => ({
      serviceName: t.serviceName,
      area: t.area,
      dose: t.dose,
      performerName: t.performerName,
      notes: t.notes,
    })),
    addenda: row.addenda,
    options,
    trail,
  };
}

export type WorklistState = "BELUM" | "DRAF" | "FINAL";

export type WorklistRow = {
  appointmentId: string;
  code: string;
  startAt: Date;
  patientName: string;
  patientRecordNumber: string;
  serviceName: string;
  branchName: string;
  encounterId: string | null;
  state: WorklistState;
};

export type DoctorWorklist = { today: WorklistRow[]; unfinished: WorklistRow[] };

function findWorklist(where: Prisma.AppointmentWhereInput) {
  return prisma.appointment.findMany({
    where: { ...where, patientId: { not: null } },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      code: true,
      type: true,
      startAt: true,
      service: { select: { name: true } },
      branch: { select: { name: true } },
      patient: { select: { name: true, medicalRecordNumber: true } },
      encounter: { select: { id: true, status: true } },
    },
  });
}

function toWorklistRow(row: Awaited<ReturnType<typeof findWorklist>>[number]): WorklistRow {
  const encounter = row.encounter;
  return {
    appointmentId: row.id,
    code: row.code,
    startAt: row.startAt,
    patientName: row.patient?.name ?? "",
    patientRecordNumber: row.patient?.medicalRecordNumber ?? "",
    serviceName: row.service?.name ?? (row.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
    branchName: row.branch.name,
    encounterId: encounter?.id ?? null,
    state: !encounter ? "BELUM" : encounter.status === "FINAL" ? "FINAL" : "DRAF",
  };
}

/**
 * Dasbor dokter (spec 4.2), semua cabang. "Hari ini" adalah tanggal WITA.
 * "Catatan belum final": draf dari hari sebelumnya, dan booking Hadir dari hari
 * sebelumnya yang belum diperiksa, terlama di atas.
 */
export async function listDoctorWorklist(): Promise<DoctorWorklist> {
  await requireCapability("record:read");
  const today = witaDateString(new Date());
  const dayStart = combineWitaDateAndMinutes(today, 0);
  const dayEnd = combineWitaDateAndMinutes(addDaysToDateString(today, 1), 0);

  const [todayRows, unfinishedRows] = await Promise.all([
    findWorklist({ startAt: { gte: dayStart, lt: dayEnd }, status: { in: ["HADIR", "SELESAI"] } }),
    findWorklist({
      startAt: { lt: dayStart },
      OR: [{ status: "HADIR", encounter: { is: null } }, { encounter: { is: { status: "DRAF" } } }],
    }),
  ]);
  return { today: todayRows.map(toWorklistRow), unfinished: unfinishedRows.map(toWorklistRow) };
}
