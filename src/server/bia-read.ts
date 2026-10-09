import type { BiaMeasurement, BiaFile } from "@prisma/client";
import { biaAccess, type BiaAccess, type BiaNumbers, type BiaPoint } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/server/session";

export type BiaFileView = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedAt: Date;
  /** Bisa ditampilkan peramban (bukan HEIC). */
  previewable: boolean;
  voided: { at: Date; by: string; reason: string } | null;
};

export type BiaMeasurementView = {
  id: string;
  version: number;
  createdAt: Date;
  /** Tanggal kunjungan (jadwal booking). Dipakai untuk urutan dan grafik, bukan waktu pengukuran dibuat: pengukuran koreksi dibuat belakangan. */
  visitAt: Date;
  createdByName: string;
  appointmentId: string;
  appointmentCode: string;
  numbers: BiaNumbers;
  note: string | null;
  numbersAt: Date | null;
  numbersByName: string | null;
  voided: { at: Date; by: string; reason: string } | null;
  files: BiaFileView[];
};

/** BIA satu kunjungan, untuk halaman Kunjungan (butuh record:read). */
export type BiaVisitView = {
  active: BiaMeasurementView | null;
  /** Pengukuran yang dibatalkan, terbaru dulu. */
  voided: BiaMeasurementView[];
  access: BiaAccess;
  /** Booking sudah SELESAI (kunjungan final): angka yang sudah tersimpan terkunci. */
  final: boolean;
  /** Seluruh titik grafik pasien ini (pengukuran aktif beserta angka), terlama dulu. */
  points: BiaPoint[];
};

/** BIA seluruh kunjungan satu pasien, untuk halaman Data Pasien (butuh record:read). */
export type BiaHistory = { items: BiaMeasurementView[]; points: BiaPoint[] };

const num = (value: { toString(): string } | null): number | null => (value === null ? null : Number(value.toString()));

const MEASUREMENT_SELECT = {
  id: true,
  version: true,
  createdAt: true,
  createdByName: true,
  appointmentId: true,
  bodyFatPercent: true,
  muscleMassKg: true,
  visceralFat: true,
  bmr: true,
  metabolicAge: true,
  bodyWaterPercent: true,
  boneMassKg: true,
  note: true,
  numbersAt: true,
  numbersByName: true,
  voidedAt: true,
  voidedByName: true,
  voidReason: true,
  appointment: { select: { code: true, startAt: true } },
  files: { orderBy: { uploadedAt: "asc" as const } },
} as const;

type Row = Pick<
  BiaMeasurement,
  | "id" | "version" | "createdAt" | "createdByName" | "appointmentId" | "visceralFat" | "bmr" | "metabolicAge" | "note"
  | "numbersAt" | "numbersByName" | "voidedAt" | "voidedByName" | "voidReason"
> & {
  bodyFatPercent: { toString(): string } | null;
  muscleMassKg: { toString(): string } | null;
  bodyWaterPercent: { toString(): string } | null;
  boneMassKg: { toString(): string } | null;
  appointment: { code: string; startAt: Date };
  files: BiaFile[];
};

function toFileView(file: BiaFile): BiaFileView {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    uploadedByName: file.uploadedByName,
    uploadedAt: file.uploadedAt,
    previewable: file.mimeType !== "image/heic",
    voided: file.voidedAt ? { at: file.voidedAt, by: file.voidedByName ?? "", reason: file.voidReason ?? "" } : null,
  };
}

function toView(row: Row): BiaMeasurementView {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.createdAt,
    visitAt: row.appointment.startAt,
    createdByName: row.createdByName,
    appointmentId: row.appointmentId,
    appointmentCode: row.appointment.code,
    numbers: {
      bodyFatPercent: num(row.bodyFatPercent),
      muscleMassKg: num(row.muscleMassKg),
      visceralFat: row.visceralFat,
      bmr: row.bmr,
      metabolicAge: row.metabolicAge,
      bodyWaterPercent: num(row.bodyWaterPercent),
      boneMassKg: num(row.boneMassKg),
    },
    note: row.note,
    numbersAt: row.numbersAt,
    numbersByName: row.numbersByName,
    voided: row.voidedAt ? { at: row.voidedAt, by: row.voidedByName ?? "", reason: row.voidReason ?? "" } : null,
    files: row.files.map(toFileView),
  };
}

function pointsOf(items: BiaMeasurementView[]): BiaPoint[] {
  return items
    .filter((m) => !m.voided && m.numbersAt !== null)
    .map((m) => ({ at: m.visitAt, bodyFatPercent: m.numbers.bodyFatPercent, muscleMassKg: m.numbers.muscleMassKg }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** BIA satu kunjungan. Tidak mencatat audit: halaman Kunjungan sudah mencatat `encounter.view`; berkasnya dicatat saat dibuka. */
export async function getBiaForVisit(appointmentId: string): Promise<BiaVisitView> {
  const staff = await requireCapability("record:read");
  const appointment = await prisma.appointment.findUnique({
    where: { id: String(appointmentId ?? "") },
    select: { status: true, channel: true, patientId: true },
  });
  const [rows, patientRows] = await Promise.all([
    prisma.biaMeasurement.findMany({ where: { appointmentId: String(appointmentId ?? "") }, select: MEASUREMENT_SELECT, orderBy: { createdAt: "desc" } }),
    appointment?.patientId
      ? prisma.biaMeasurement.findMany({ where: { patientId: appointment.patientId, voidedAt: null }, select: MEASUREMENT_SELECT })
      : Promise.resolve([]),
  ]);
  const views = rows.map(toView);
  return {
    active: views.find((m) => !m.voided) ?? null,
    voided: views.filter((m) => m.voided),
    access: biaAccess(staff.role, appointment ?? { status: "", channel: "KLINIK" }),
    final: appointment?.status === "SELESAI",
    points: pointsOf(patientRows.map(toView)),
  };
}

/** Riwayat BIA satu pasien (halaman Data Pasien), terbaru dulu. */
export async function getBiaHistory(patientId: string): Promise<BiaHistory> {
  await requireCapability("record:read");
  const rows = await prisma.biaMeasurement.findMany({
    where: { patientId: String(patientId ?? "") },
    select: MEASUREMENT_SELECT,
    orderBy: { createdAt: "desc" },
  });
  // Terbaru dulu menurut tanggal kunjungan; pengukuran koreksi tidak melompat ke atas hanya karena dibuat belakangan.
  const items = rows.map(toView).sort((a, b) => b.visitAt.getTime() - a.visitAt.getTime());
  return { items, points: pointsOf(items) };
}


/** Data satu berkas untuk rute buka berkas. Tanpa pemeriksaan hak: rute memeriksa login dan record:read lebih dulu. */
export async function findBiaFileForViewer(
  fileId: string,
): Promise<{ storageName: string; originalName: string; mimeType: string; measurementId: string; appointmentCode: string } | null> {
  const file = await prisma.biaFile.findUnique({
    where: { id: String(fileId ?? "") },
    select: { storageName: true, originalName: true, mimeType: true, measurement: { select: { id: true, appointment: { select: { code: true } } } } },
  });
  if (!file) return null;
  return {
    storageName: file.storageName,
    originalName: file.originalName,
    mimeType: file.mimeType,
    measurementId: file.measurement.id,
    appointmentCode: file.measurement.appointment.code,
  };
}
