import type { BiaVisitView } from "@/server/bia-read";
import { prisma } from "@/lib/db";
import { FOOD_RECALL_SELECT, foodRecallView, type FoodRecallView } from "@/lib/food-recall";
import type { Prisma } from "@prisma/client";
import { VITAL_KEYS, vitalInputValue, type VitalKey } from "@/lib/encounter";
import { nurseCanWork } from "@/lib/nurse";
import { placeLabel } from "@/lib/online-consultation";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { getBiaForNurse } from "@/server/bia-read";
import { lastHeightCm } from "@/server/encounter-store";
import { requireCapability } from "@/server/session";

// Daftar dan halaman Tangani perawat (spec peran perawat 6–7). Hanya data seperlunya: tanpa catatan dokter,
// diagnosis, resep, riwayat, isian kuis, BIA lama, atau tagihan.

export type NurseWorklistRow = {
  appointmentId: string;
  startAt: Date;
  patientName: string;
  patientRecordNumber: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  foodRecall: "BELUM" | "TERISI";
  bia: "BELUM" | "BERKAS" | "ANGKA";
  /** Perawat sudah menekan Selesai ditangani (spec vital perawat VP3). */
  handled: boolean;
};

export type NurseVisit = {
  appointmentId: string;
  code: string;
  startAt: Date;
  serviceName: string;
  staffName: string;
  branchName: string;
  patient: { name: string; medicalRecordNumber: string; allergies: string | null };
  foodRecall: FoodRecallView;
  bia: BiaVisitView;
  /** Angka vital sebagai teks isian; tinggi badan diisi dari kunjungan lalu bila belum diukur (spec vital perawat VP1–VP3). */
  vitals: { inputs: Record<VitalKey, string>; version: string | null; completed: { byName: string; at: Date } | null };
};

const VITALS_SELECT = { systolic: true, diastolic: true, pulse: true, temperatureC: true, weightKg: true, heightCm: true, waistCm: true } as const;

/** Isian angka vital; tinggi badan dari kunjungan final terakhir bila perawat belum menyimpan apa pun (spec vital perawat VP2). */
async function vitalsView(
  patientId: string,
  row: (Record<VitalKey, number | Prisma.Decimal | null> & { updatedAt: Date; completedAt: Date | null; completedByName: string | null }) | null,
): Promise<NurseVisit["vitals"]> {
  const inputs = {} as Record<VitalKey, string>;
  for (const key of VITAL_KEYS) {
    const value = row?.[key];
    inputs[key] = vitalInputValue(key, value === null || value === undefined ? null : Number(value));
  }
  if (!row) {
    const height = await lastHeightCm(prisma, patientId);
    inputs.heightCm = vitalInputValue("heightCm", height === null ? null : Number(height));
  }
  return {
    inputs,
    version: row ? row.updatedAt.toISOString() : null,
    completed: row?.completedAt ? { byName: row.completedByName ?? "", at: row.completedAt } : null,
  };
}

const serviceNameOf = (row: { service: { name: string } | null; type: string }) => row.service?.name ?? (row.type === "KONSULTASI" ? "Konsultasi" : "Treatment");

/** Pasien klinik yang sudah check-in hari ini (WITA), semua cabang, urut jam. Tanpa audit baca, seperti daftar dokter. */
export async function listNurseWorklist(now: Date = new Date()): Promise<NurseWorklistRow[]> {
  await requireCapability("nurse:work");
  const today = witaDateString(now);
  const rows = await prisma.appointment.findMany({
    where: {
      startAt: { gte: combineWitaDateAndMinutes(today, 0), lt: combineWitaDateAndMinutes(addDaysToDateString(today, 1), 0) },
      status: "HADIR",
      channel: "KLINIK",
      patientId: { not: null },
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      type: true,
      channel: true,
      startAt: true,
      service: { select: { name: true } },
      staff: { select: { name: true } },
      branch: { select: { name: true } },
      patient: { select: { name: true, medicalRecordNumber: true } },
      foodRecall: { select: { status: true } },
      nurseVitals: { select: { completedAt: true } },
      biaMeasurements: {
        where: { voidedAt: null },
        select: { numbersAt: true, _count: { select: { files: { where: { voidedAt: null } } } } },
      },
    },
  });
  return rows.map((row) => {
    const active = row.biaMeasurements[0];
    return {
      appointmentId: row.id,
      startAt: row.startAt,
      patientName: row.patient?.name ?? "",
      patientRecordNumber: row.patient?.medicalRecordNumber ?? "",
      serviceName: serviceNameOf(row),
      staffName: row.staff.name,
      branchName: placeLabel(row.channel, row.branch.name),
      foodRecall: row.foodRecall?.status === "DIISI" ? "TERISI" : "BELUM",
      bia: active?.numbersAt ? "ANGKA" : active && active._count.files > 0 ? "BERKAS" : "BELUM",
      handled: Boolean(row.nurseVitals?.completedAt),
    };
  });
}

/** Satu pasien untuk halaman Tangani; null di luar batas perawat (bukan hari ini, belum/sudah selesai, online). */
export async function getNurseVisit(appointmentId: string, now: Date = new Date()): Promise<NurseVisit | null> {
  await requireCapability("nurse:work");
  const row = await prisma.appointment.findUnique({
    where: { id: String(appointmentId ?? "") },
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      channel: true,
      startAt: true,
      service: { select: { name: true } },
      staff: { select: { name: true } },
      branch: { select: { name: true } },
      patientId: true,
      patient: { select: { name: true, medicalRecordNumber: true, allergies: true } },
      foodRecall: { select: FOOD_RECALL_SELECT },
      nurseVitals: { select: { ...VITALS_SELECT, updatedAt: true, completedAt: true, completedByName: true } },
    },
  });
  if (!row?.patient || !nurseCanWork(row, now)) return null;
  const bia = await getBiaForNurse(row.id, now);
  if (!bia) return null;
  return {
    appointmentId: row.id,
    code: row.code,
    startAt: row.startAt,
    serviceName: serviceNameOf(row),
    staffName: row.staff.name,
    branchName: placeLabel(row.channel, row.branch.name),
    patient: { name: row.patient.name, medicalRecordNumber: row.patient.medicalRecordNumber, allergies: row.patient.allergies },
    foodRecall: foodRecallView({ id: row.id, startAt: row.startAt }, row.foodRecall),
    bia,
    vitals: await vitalsView(row.patientId!, row.nurseVitals),
  };
}
