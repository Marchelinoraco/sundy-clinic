"use server";

import type { IntakeKind, IntakePurpose, IntakeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  VITAL_KEYS,
  ageInYears,
  assessmentPreview,
  describeVitals,
  vitalInputValue,
  type EncounterDraftInput,
  type EncounterOptions,
  type VitalKey,
} from "@/lib/encounter";
import { FOOD_RECALL_SELECT, foodRecallView, type FoodRecallView } from "@/lib/food-recall";
import { formatGender } from "@/lib/format";
import { INTAKE_PURPOSE_LABEL } from "@/lib/intake-purpose";
import { lastAttemptLabel, nextOpenWindow, onlinePhase, placeLabel, windowLabel } from "@/lib/online-consultation";
import type { RecordProposal } from "@/lib/kuis/v2/record-proposal";
import { can } from "@/lib/permissions";
import { billingLabel } from "@/lib/prescription";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { parseUsage } from "@/lib/usage";
import { nurseGateApplies } from "@/lib/nurse-vitals";
import { listAuditTrail, recordAuditThrottled, type AuditTrailRow } from "@/server/audit";
import { loadApproval, loadIntakeClinical, type IntakeClinical, type ReadyIntakeApproval } from "@/server/intake-clinical";
import { listPrescribableItems } from "@/server/prescription-read";
import { requireCapability } from "@/server/session";
import { packageSummaries } from "@/server/encounter-store";

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
  | {
      id: string;
      state: "ready";
      clinical: IntakeClinical;
      needsApproval: boolean;
      kind: "LENGKAP" | "PENDEK";
      purposeLabel: string | null;
      submittedAt: Date | null;
    };

export type EncounterTreatmentSummary = {
  serviceName: string;
  area: string | null;
  dose: string | null;
  /** Kosong untuk kunjungan sesudah spec aturan pakai PL1: pelaksana dipilih di tagihan. */
  performerName: string | null;
  notes: string | null;
};

export type EncounterAddendumSummary = { id: string; text: string; authorName: string; createdAt: Date };

/** Kunjungan final sebelumnya, untuk tab Sebelumnya dan Tren (spec UI B bagian 4–5). */
export type EncounterHistoryItem = {
  id: string;
  startAt: Date;
  branchName: string;
  authorName: string;
  subjective: string | null;
  physicalExam: string | null;
  assessment: string | null;
  plan: string | null;
  vitals: Record<VitalKey, number | null>;
  vitalLines: string[];
  assessmentPreview: string | null;
  treatments: EncounterTreatmentSummary[];
  addenda: EncounterAddendumSummary[];
  /** Food recall kunjungan itu, bila ada (spec check-in 5.5). */
  foodRecall: FoodRecallView | null;
};

export type EncounterDetail = {
  id: string;
  status: "DRAF" | "FINAL";
  /** updatedAt kunjungan; dikirim kembali saat menyimpan (spec 7). */
  version: string;
  createdByName: string;
  finalized: { byName: string; at: Date } | null;
  appointment: {
    id: string;
    code: string;
    startAt: Date;
    serviceName: string;
    staffName: string;
    branchName: string;
    /** Konsultasi online diberi label di kepala halaman (spec 6.4). */
    channel: "KLINIK" | "ONLINE";
  };
  patient: { id: string; name: string; medicalRecordNumber: string; ageLabel: string | null; genderLabel: string | null };
  warnings: EncounterWarnings;
  intake: EncounterIntake | null;
  /** Isian formulir (teks) untuk draf, juga dipakai tampilan baca-saja. */
  draft: EncounterDraftInput;
  /** Tanda vital yang diukur, siap dibaca (baca-saja). */
  vitalLines: string[];
  /** Angka vital tersimpan kunjungan ini (baris "Kunjungan ini" di Tren sebelum dokter mengetik). */
  vitals: Record<VitalKey, number | null>;
  /** Angka vital dari perawat yang menekan Selesai ditangani, untuk keterangan di bagian O (spec vital perawat VP5, VP6). */
  nurseVitals: { byName: string; at: Date; values: Record<VitalKey, number | null>; changedByDoctor: boolean } | null;
  treatments: EncounterTreatmentSummary[];
  /** Catatan untuk Apoteker dari alur lama; baca-saja (spec resep dokter 2.2). */
  pharmacyNote: string | null;
  /** Resep dokter beserta keterangan penagihan dari resepsionis (spec resep dokter 4). */
  prescriptions: { id: string; itemName: string; quantity: number; usage: string; billing: string | null }[];
  /** Paket yang disarankan dokter; `declined` = "Tidak dibeli — {alasan}" dari resepsionis (spec vital perawat PR1, PR3). */
  packages: { id: string; name: string; contents: string; declined: string | null }[];
  addenda: EncounterAddendumSummary[];
  options: EncounterOptions;
  /** Hanya untuk audit:read (Super Admin). */
  trail: AuditTrailRow[] | null;
  /** Kunjungan final pasien ini yang lebih awal dari kunjungan ini, terbaru di atas, maks. 12. */
  history: EncounterHistoryItem[];
  hasMoreHistory: boolean;
  /** Persetujuan isian ke data pasien; hanya untuk record:write bila isian sudah terisi. */
  approval: ReadyIntakeApproval | null;
  /** Food recall H-1 booking ini (spec check-in bagian 5). */
  foodRecall: FoodRecallView;
};

const UNKNOWN_QUIZ_VERSION = "Isian dengan kuis versi";

const HISTORY_LIMIT = 12;

const VITAL_SELECT = {
  systolic: true,
  diastolic: true,
  pulse: true,
  temperatureC: true,
  weightKg: true,
  heightCm: true,
  waistCm: true,
} as const;

const TREATMENT_SELECT = {
  orderBy: { sortOrder: "asc" as const },
  select: { serviceId: true, serviceName: true, area: true, dose: true, performerId: true, performerName: true, notes: true },
};

const ADDENDUM_SELECT = {
  orderBy: { createdAt: "asc" as const },
  select: { id: true, text: true, authorName: true, createdAt: true },
};

function vitalsOf(row: Record<VitalKey, number | Prisma.Decimal | null>): Record<VitalKey, number | null> {
  const values = {} as Record<VitalKey, number | null>;
  for (const key of VITAL_KEYS) values[key] = row[key] === null ? null : Number(row[key]);
  return values;
}

/** Angka perawat yang sudah Selesai ditangani; "diubah dokter" bila angka mana pun di catatan berbeda (spec vital perawat VP6). */
function nurseVitalsOf(
  row: (Record<VitalKey, number | Prisma.Decimal | null> & { completedAt: Date | null; completedByName: string | null }) | null,
  current: Record<VitalKey, number | null>,
): EncounterDetail["nurseVitals"] {
  if (!row?.completedAt) return null;
  const values = vitalsOf(row);
  return { byName: row.completedByName ?? "", at: row.completedAt, values, changedByDoctor: VITAL_KEYS.some((key) => values[key] !== current[key]) };
}

function findHistory(patientId: string, before: Date, excludeId: string) {
  return prisma.encounter.findMany({
    where: { status: "FINAL", id: { not: excludeId }, appointment: { patientId, startAt: { lt: before } } },
    orderBy: { appointment: { startAt: "desc" } },
    take: HISTORY_LIMIT + 1,
    select: {
      id: true,
      subjective: true,
      physicalExam: true,
      assessment: true,
      plan: true,
      ...VITAL_SELECT,
      createdByName: true,
      finalizedByName: true,
      treatments: TREATMENT_SELECT,
      addenda: ADDENDUM_SELECT,
      appointment: {
        select: { id: true, startAt: true, channel: true, branch: { select: { name: true } }, foodRecall: { select: FOOD_RECALL_SELECT } },
      },
    },
  });
}

function toHistoryItem(row: Awaited<ReturnType<typeof findHistory>>[number]): EncounterHistoryItem {
  const vitals = vitalsOf(row);
  return {
    id: row.id,
    startAt: row.appointment.startAt,
    branchName: placeLabel(row.appointment.channel, row.appointment.branch.name),
    authorName: row.finalizedByName ?? row.createdByName,
    subjective: row.subjective,
    physicalExam: row.physicalExam,
    assessment: row.assessment,
    plan: row.plan,
    vitals,
    vitalLines: describeVitals(vitals),
    assessmentPreview: assessmentPreview(row.assessment),
    treatments: row.treatments.map(toTreatmentSummary),
    addenda: row.addenda,
    foodRecall: row.appointment.foodRecall ? foodRecallView(row.appointment, row.appointment.foodRecall) : null,
  };
}

function toTreatmentSummary(row: {
  serviceName: string;
  area: string | null;
  dose: string | null;
  performerName: string | null;
  notes: string | null;
}): EncounterTreatmentSummary {
  return { serviceName: row.serviceName, area: row.area, dose: row.dose, performerName: row.performerName, notes: row.notes };
}

/** Isian kuis booking ini untuk tab Isian. Versi kuis yang tidak dikenal tidak menggagalkan halaman. */
async function loadEncounterIntake(
  intake: { id: string; status: IntakeStatus; kind: IntakeKind; purpose: IntakePurpose | null; submittedAt: Date | null } | null,
): Promise<{ intake: EncounterIntake | null; pregnancy: boolean; proposal: RecordProposal | null }> {
  if (!intake) return { intake: null, pregnancy: false, proposal: null };
  if (intake.status === "MENUNGGU_DIISI") return { intake: { id: intake.id, state: "pending" }, pregnancy: false, proposal: null };
  try {
    const loaded = await loadIntakeClinical(intake.id);
    if (!loaded) return { intake: { id: intake.id, state: "pending" }, pregnancy: false, proposal: null };
    return {
      intake: {
        id: intake.id,
        state: "ready",
        clinical: loaded.clinical,
        needsApproval: intake.status === "TERISI",
        kind: intake.kind,
        purposeLabel: intake.purpose ? INTAKE_PURPOSE_LABEL[intake.purpose] : null,
        submittedAt: intake.submittedAt,
      },
      pregnancy: loaded.pregnancy,
      proposal: loaded.proposal,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(UNKNOWN_QUIZ_VERSION)) {
      return { intake: { id: intake.id, state: "error", message: error.message }, pregnancy: false, proposal: null };
    }
    throw error;
  }
}

/**
 * Pilihan formulir: layanan aktif, ditambah yang sudah dipakai draf atau booking ini walau kini nonaktif, agar
 * pilihannya tidak hilang. Pelaksana tidak dipilih dokter (spec aturan pakai PL1).
 */
async function loadOptions(used: { serviceIds: string[]; packageIds: string[] }, booking: { serviceId: string | null }): Promise<Omit<EncounterOptions, "medicines">> {
  const serviceIds = [...used.serviceIds, ...(booking.serviceId ? [booking.serviceId] : [])];
  const [services, packages] = await Promise.all([
    prisma.service.findMany({
      where: { OR: [{ isActive: true }, { id: { in: serviceIds } }] },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    // Paket yang masih dijual, ditambah yang sudah ada di draf walau kini nonaktif (spec vital perawat PR1).
    packageSummaries(prisma, { OR: [{ isActive: true }, { id: { in: used.packageIds } }] }),
  ]);
  const defaultServiceId =
    booking.serviceId && services.some((service) => service.id === booking.serviceId)
      ? booking.serviceId
      : (services[0]?.id ?? "");
  return { services, defaultServiceId, packages: packages.map(({ id, name, contents }) => ({ id, name, contents })) };
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
      pharmacyNote: true,
      ...VITAL_SELECT,
      createdByName: true,
      finalizedByName: true,
      finalizedAt: true,
      treatments: TREATMENT_SELECT,
      prescriptions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          itemId: true,
          itemName: true,
          quantity: true,
          usage: true,
          dispensingLine: { select: { billedQuantity: true, billingNote: true } },
        },
      },
      packages: { orderBy: { sortOrder: "asc" }, select: { id: true, packageId: true, packageName: true, contents: true, decline: { select: { reason: true } } } },
      addenda: ADDENDUM_SELECT,
      appointment: {
        select: {
          id: true,
          code: true,
          type: true,
          branchId: true,
          channel: true,
          startAt: true,
          serviceId: true,
          staffId: true,
          service: { select: { name: true } },
          staff: { select: { name: true } },
          branch: { select: { name: true } },
          intake: { select: { id: true, status: true, kind: true, purpose: true, submittedAt: true } },
          nurseVitals: { select: { ...VITAL_SELECT, completedAt: true, completedByName: true } },
          foodRecall: { select: FOOD_RECALL_SELECT },
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
  // Halaman ini juga menampilkan isi kunjungan lain milik pasien (tab Sebelumnya).
  await recordAuditThrottled({
    actor: staff,
    action: "patient.view-records",
    entity: "Patient",
    entityId: patient.id,
    summary: patient.medicalRecordNumber,
  });

  const vitals = vitalsOf(row);
  const vitalInputs = {} as Record<VitalKey, string>;
  for (const key of VITAL_KEYS) vitalInputs[key] = vitalInputValue(key, vitals[key]);

  const [{ intake, pregnancy, proposal }, options, trail, historyRows, medicines] = await Promise.all([
    loadEncounterIntake(appointment.intake),
    loadOptions({ serviceIds: row.treatments.map((t) => t.serviceId), packageIds: row.packages.map((p) => p.packageId) }, { serviceId: appointment.serviceId }),
    can(staff.role, "audit:read") ? listAuditTrail("Encounter", row.id) : Promise.resolve(null),
    findHistory(patient.id, appointment.startAt, row.id),
    listPrescribableItems(
      appointment.branchId,
      row.prescriptions.map((p) => p.itemId),
    ),
  ]);

  const approval =
    proposal && appointment.intake && can(staff.role, "record:write")
      ? await loadApproval(patient.id, proposal, appointment.intake.status === "DIPERIKSA")
      : null;

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
      branchName: placeLabel(appointment.channel, appointment.branch.name),
      channel: appointment.channel,
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
        notes: t.notes ?? "",
      })),
      prescriptions: row.prescriptions.map((p) => ({ itemId: p.itemId, quantity: String(p.quantity), usage: parseUsage(p.usage) })),
      packages: row.packages.map((p) => ({ packageId: p.packageId })),
    },
    vitalLines: describeVitals(vitals),
    vitals,
    nurseVitals: nurseVitalsOf(appointment.nurseVitals, vitals),
    treatments: row.treatments.map(toTreatmentSummary),
    pharmacyNote: row.pharmacyNote,
    prescriptions: row.prescriptions.map((p) => ({
      id: p.id,
      itemName: p.itemName,
      quantity: p.quantity,
      usage: p.usage,
      billing: p.dispensingLine ? billingLabel({ quantity: p.quantity, ...p.dispensingLine }) : null,
    })),
    packages: row.packages.map((p) => ({ id: p.id, name: p.packageName, contents: p.contents, declined: p.decline ? `Tidak dibeli — ${p.decline.reason}` : null })),
    addenda: row.addenda,
    options: { ...options, medicines },
    trail,
    history: historyRows.slice(0, HISTORY_LIMIT).map(toHistoryItem),
    hasMoreHistory: historyRows.length > HISTORY_LIMIT,
    approval,
    foodRecall: foodRecallView(appointment, appointment.foodRecall),
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
  /** Customer sudah mengisi food recall (spec check-in 5.5). */
  foodRecallFilled: boolean;
  /** Konsultasi online (spec 6.4). */
  online: boolean;
  /** Kunjungan klinik hari ini yang menunggu perawat menekan Selesai ditangani (spec vital perawat VP4). */
  waitingNurse: boolean;
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
      channel: true,
      startAt: true,
      service: { select: { name: true } },
      branch: { select: { name: true } },
      patient: { select: { name: true, medicalRecordNumber: true } },
      encounter: { select: { id: true, status: true } },
      foodRecall: { select: { status: true } },
      nurseVitals: { select: { completedAt: true } },
    },
  });
}

function toWorklistRow(row: Awaited<ReturnType<typeof findWorklist>>[number], today: string): WorklistRow {
  const encounter = row.encounter;
  return {
    appointmentId: row.id,
    code: row.code,
    startAt: row.startAt,
    patientName: row.patient?.name ?? "",
    patientRecordNumber: row.patient?.medicalRecordNumber ?? "",
    serviceName: row.service?.name ?? (row.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
    branchName: placeLabel(row.channel, row.branch.name),
    encounterId: encounter?.id ?? null,
    state: !encounter ? "BELUM" : encounter.status === "FINAL" ? "FINAL" : "DRAF",
    foodRecallFilled: row.foodRecall?.status === "DIISI",
    online: row.channel === "ONLINE",
    waitingNurse: nurseGateApplies({ channel: row.channel, startAt: row.startAt, hasEncounter: encounter !== null }, today) && !row.nurseVitals?.completedAt,
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
  return { today: todayRows.map((row) => toWorklistRow(row, today)), unfinished: unfinishedRows.map((row) => toWorklistRow(row, today)) };
}

export type OnlineWorkRow = {
  appointmentId: string;
  code: string;
  phase: "NOW" | "TODAY" | "UPCOMING";
  patientName: string;
  patientRecordNumber: string;
  whatsapp: string;
  /** https://wa.me/<nomor> untuk chat atau panggilan WA. */
  whatsappLink: string;
  doctorName: string;
  purposeLabel: string | null;
  /** Isian kuis yang sudah dikirim, untuk tautan "Lihat isian". */
  intakeId: string | null;
  windows: { label: string; current: boolean }[];
  lastAttempt: string | null;
};

const ONLINE_PHASE_ORDER = { NOW: 0, TODAY: 1, UPCOMING: 2 } as const;

/**
 * Bagian "Konsultasi online" di dasbor dokter (spec 6.1): booking online terkonfirmasi yang
 * masih punya rentang terbuka. Booking yang semua rentangnya lewat pindah ke resepsionis.
 */
export async function listOnlineWork(): Promise<OnlineWorkRow[]> {
  await requireCapability("record:write");
  const now = new Date();
  const rows = await prisma.appointment.findMany({
    where: { channel: "ONLINE", status: "TERKONFIRMASI", patientId: { not: null } },
    select: {
      id: true,
      code: true,
      patient: { select: { name: true, medicalRecordNumber: true, whatsapp: true } },
      staff: { select: { name: true } },
      intake: { select: { id: true, status: true, purpose: true } },
      contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },
      contactAttempts: { select: { at: true, staffName: true } },
    },
  });

  const work: OnlineWorkRow[] = [];
  for (const row of rows) {
    const phase = onlinePhase(row.contactWindows, now);
    if (phase === "NEEDS_NEW" || !row.patient) continue;
    work.push({
      appointmentId: row.id,
      code: row.code,
      phase,
      patientName: row.patient.name,
      patientRecordNumber: row.patient.medicalRecordNumber,
      whatsapp: row.patient.whatsapp,
      whatsappLink: `https://wa.me/${row.patient.whatsapp}`,
      doctorName: row.staff.name,
      purposeLabel: row.intake?.purpose ? INTAKE_PURPOSE_LABEL[row.intake.purpose] : null,
      intakeId: row.intake && row.intake.status !== "MENUNGGU_DIISI" ? row.intake.id : null,
      windows: row.contactWindows
        .filter((w) => w.endAt.getTime() > now.getTime())
        .map((w) => ({ label: windowLabel(w), current: w.startAt.getTime() <= now.getTime() })),
      lastAttempt: lastAttemptLabel(row.contactAttempts),
    });
  }
  const nextStart = (row: (typeof rows)[number]) => nextOpenWindow(row.contactWindows, now)?.startAt.getTime() ?? 0;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return work.sort(
    (a, b) =>
      ONLINE_PHASE_ORDER[a.phase] - ONLINE_PHASE_ORDER[b.phase] ||
      nextStart(byId.get(a.appointmentId)!) - nextStart(byId.get(b.appointmentId)!),
  );
}
