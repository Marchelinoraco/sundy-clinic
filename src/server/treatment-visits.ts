import type { Prisma } from "@prisma/client";
import { dateOnlyString } from "@/lib/stock";
import { combineWitaDateAndMinutes, witaDateString } from "@/lib/time";

// Kunjungan treatment terbaru tiap pasien untuk pengingat "waktunya treatment lagi" (spec pengingat treatment PT4, PT5,
// PT7, PT9). Modul server biasa; pemanggil memeriksa hak.

type Db = Prisma.TransactionClient;

export type TreatmentVisit = {
  patientId: string;
  patientName: string;
  medicalRecordNumber: string;
  whatsapp: string;
  /** Tanggal treatment (WITA): tanggal booking, atau tanggal tagihan difinalkan untuk penjualan langsung (PT5). */
  treatmentOn: string;
  /** Nama baris treatment pada tanggal itu, urut seperti di tagihan. */
  treatments: string[];
  /** Jarak terpendek di antara treatment itu, dari pengaturan layanan saat ini (PT2, PT7). */
  intervalDays: number;
};

export type ReturnFlags = { upcomingBookingOn: string | null; packageVisitOn: string | null; cameBackOn: string | null };

/**
 * Satu kunjungan treatment per pasien, yang terbaru. Treatment = baris tagihan FINAL yang layanannya punya jarak pengingat
 * (PT4); pasien rangkap tidak ikut. `since` membatasi tagihan yang difinalkan sejak tanggal itu.
 */
export async function latestTreatmentVisits(db: Db, filter: { since?: string; patientIds?: string[] } = {}): Promise<TreatmentVisit[]> {
  const services = await db.service.findMany({ where: { returnReminderDays: { not: null } }, select: { id: true, returnReminderDays: true } });
  if (services.length === 0) return [];
  const intervalOf = new Map(services.map((service) => [service.id, service.returnReminderDays as number]));
  const serviceIds = [...intervalOf.keys()];
  const invoices = await db.invoice.findMany({
    where: {
      status: "FINAL",
      finalizedAt: filter.since ? { gte: combineWitaDateAndMinutes(filter.since, 0) } : { not: null },
      ...(filter.patientIds ? { patientId: { in: filter.patientIds } } : {}),
      patient: { mergedIntoId: null },
      lines: { some: { serviceId: { in: serviceIds } } },
    },
    select: {
      finalizedAt: true,
      appointment: { select: { startAt: true } },
      patient: { select: { id: true, name: true, medicalRecordNumber: true, whatsapp: true } },
      lines: { where: { serviceId: { in: serviceIds } }, orderBy: { sortOrder: "asc" }, select: { name: true, serviceId: true } },
    },
  });

  const latest = new Map<string, TreatmentVisit>();
  for (const invoice of invoices) {
    const treatmentOn = witaDateString(invoice.appointment?.startAt ?? (invoice.finalizedAt as Date));
    const names = invoice.lines.map((line) => line.name);
    const interval = Math.min(...invoice.lines.map((line) => intervalOf.get(line.serviceId as string) as number));
    const current = latest.get(invoice.patient.id);
    if (current && current.treatmentOn > treatmentOn) continue;
    if (current && current.treatmentOn === treatmentOn) {
      current.treatments.push(...names.filter((name) => !current.treatments.includes(name)));
      current.intervalDays = Math.min(current.intervalDays, interval);
      continue;
    }
    latest.set(invoice.patient.id, {
      patientId: invoice.patient.id,
      patientName: invoice.patient.name,
      medicalRecordNumber: invoice.patient.medicalRecordNumber,
      whatsapp: invoice.patient.whatsapp,
      treatmentOn,
      treatments: [...new Set(names)],
      intervalDays: interval,
    });
  }
  return [...latest.values()];
}

/**
 * Alasan pasien tidak diajak kembali (PT9): booking berikutnya, paket aktif berjadwal (yang diingatkan kotak 4), dan
 * kunjungan Hadir/Selesai sesudah tanggal treatment.
 */
export async function returnFlags(db: Db, visits: readonly TreatmentVisit[], today: string): Promise<Map<string, ReturnFlags>> {
  const flags = new Map<string, ReturnFlags>(visits.map((visit) => [visit.patientId, { upcomingBookingOn: null, packageVisitOn: null, cameBackOn: null }]));
  if (visits.length === 0) return flags;
  const patientIds = visits.map((visit) => visit.patientId);
  const treatmentOn = new Map(visits.map((visit) => [visit.patientId, visit.treatmentOn]));
  const earliest = visits.reduce((min, visit) => (visit.treatmentOn < min ? visit.treatmentOn : min), visits[0].treatmentOn);
  const startOfToday = combineWitaDateAndMinutes(today, 0);

  const [upcoming, visited, packages] = await Promise.all([
    db.appointment.findMany({
      where: { patientId: { in: patientIds }, status: { in: ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "HADIR"] }, startAt: { gte: startOfToday } },
      orderBy: { startAt: "asc" },
      select: { patientId: true, startAt: true },
    }),
    db.appointment.findMany({
      where: { patientId: { in: patientIds }, status: { in: ["HADIR", "SELESAI"] }, startAt: { gte: combineWitaDateAndMinutes(earliest, 0) } },
      orderBy: { startAt: "asc" },
      select: { patientId: true, startAt: true },
    }),
    db.patientPackage.findMany({
      where: { patientId: { in: patientIds }, status: "AKTIF", nextVisitOn: { not: null }, expiresOn: { gte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { nextVisitOn: "asc" },
      select: { patientId: true, nextVisitOn: true, expiresOn: true },
    }),
  ]);
  for (const row of upcoming) {
    const flag = flags.get(row.patientId as string)!;
    flag.upcomingBookingOn ??= witaDateString(row.startAt);
  }
  for (const row of visited) {
    const on = witaDateString(row.startAt);
    // Kunjungan treatment itu sendiri jatuh pada tanggal treatment; yang dihitung kunjungan sesudahnya, yang terakhir.
    if (on > (treatmentOn.get(row.patientId as string) as string)) flags.get(row.patientId as string)!.cameBackOn = on;
  }
  for (const row of packages) {
    const visitOn = dateOnlyString(row.nextVisitOn as Date);
    // Rencana sesudah masa berlaku tidak diingatkan kotak 4, jadi tidak menahan pengingat ini.
    if (visitOn > dateOnlyString(row.expiresOn)) continue;
    const flag = flags.get(row.patientId)!;
    flag.packageVisitOn ??= visitOn;
  }
  return flags;
}

export function hasReturnFlag(flag: ReturnFlags | undefined): boolean {
  return Boolean(flag && (flag.upcomingBookingOn || flag.packageVisitOn || flag.cameBackOn));
}

/** Kiriman pengingat treatment terakhir per pasien (PT12). */
export async function lastTreatmentReminders(db: Db, patientIds: readonly string[]): Promise<Map<string, { treatmentOn: string; sentAt: Date; staffName: string }>> {
  if (patientIds.length === 0) return new Map();
  const rows = await db.treatmentReminder.findMany({
    where: { patientId: { in: [...patientIds] } },
    orderBy: { sentAt: "desc" },
    select: { patientId: true, treatmentOn: true, sentAt: true, staffName: true },
  });
  const last = new Map<string, { treatmentOn: string; sentAt: Date; staffName: string }>();
  for (const row of rows) {
    if (!last.has(row.patientId)) last.set(row.patientId, { treatmentOn: dateOnlyString(row.treatmentOn), sentAt: row.sentAt, staffName: row.staffName });
  }
  return last;
}
