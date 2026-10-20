import type { BiaVisitView } from "@/server/bia-read";
import { prisma } from "@/lib/db";
import { foodRecallView, type FoodRecallView } from "@/lib/food-recall";
import { nurseCanWork } from "@/lib/nurse";
import { placeLabel } from "@/lib/online-consultation";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { getBiaForNurse } from "@/server/bia-read";
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
};

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
      patient: { select: { name: true, medicalRecordNumber: true, allergies: true } },
      foodRecall: { select: { status: true, recallDate: true, entries: true, submittedAt: true, completedAt: true, completedByName: true } },
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
  };
}
