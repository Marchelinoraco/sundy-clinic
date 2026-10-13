import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateOnlyString } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { packageState, type PackageEntryKindValue, type PackageOption, type PatientPackageState } from "@/lib/treatment-package";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

const day = (value: string) => new Date(`${value}T00:00:00Z`);

/** Item paket aktif dan belum kedaluwarsa milik customer, dengan sisa sesudah semua draf yang menandainya (rencana paket keputusan 10). */
export async function listPackageOptions(patientId: string): Promise<PackageOption[]> {
  await requireCapability("invoice:read");
  const today = witaDateString(new Date());
  const items = await prisma.patientPackageItem.findMany({
    where: { patientPackage: { patientId: String(patientId ?? ""), status: "AKTIF", expiresOn: { gte: day(today) } } },
    orderBy: [{ patientPackage: { expiresOn: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, serviceId: true, serviceName: true, sessions: true, patientPackage: { select: { id: true, name: true, startsOn: true, expiresOn: true } } },
  });
  if (items.length === 0) return [];
  const ids = items.map((item) => item.id);
  const [sums, pending] = await Promise.all([
    prisma.packageSessionEntry.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids } }, _sum: { delta: true } }),
    prisma.invoiceLine.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids }, invoice: { status: "DRAF" } }, _sum: { quantity: true } }),
  ]);
  return items
    .map((item) => ({
      patientPackageItemId: item.id,
      patientPackageId: item.patientPackage.id,
      packageName: item.patientPackage.name,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      sessions: item.sessions,
      remaining:
        (sums.find((row) => row.patientPackageItemId === item.id)?._sum.delta ?? 0) - (pending.find((row) => row.patientPackageItemId === item.id)?._sum.quantity ?? 0),
      startsOn: dateOnlyString(item.patientPackage.startsOn),
      expiresOn: dateOnlyString(item.patientPackage.expiresOn),
    }))
    .filter((option) => option.remaining > 0);
}

export type PatientPackageSummary = {
  id: string;
  name: string;
  startsOn: string;
  expiresOn: string;
  state: PatientPackageState;
  items: { serviceName: string; sessions: number; remaining: number }[];
  purchaseInvoice: { id: string; number: string | null };
  patient: { id: string; name: string; medicalRecordNumber: string };
};
export type PackageEntryRow = {
  id: string;
  createdAt: Date;
  kind: PackageEntryKindValue;
  delta: number;
  /** Kosong untuk PERPANJANG: perpanjangan berlaku untuk seluruh paket (rencana paket keputusan 4). */
  serviceName: string | null;
  invoice: { id: string; number: string | null } | null;
  staffName: string;
  reason: string | null;
  previousExpiresOn: string | null;
  newExpiresOn: string | null;
};
export type PatientPackageDetail = PatientPackageSummary & { price: number; entries: PackageEntryRow[] };

const SUMMARY_SELECT = {
  id: true,
  name: true,
  price: true,
  startsOn: true,
  expiresOn: true,
  status: true,
  patient: { select: { id: true, name: true, medicalRecordNumber: true } },
  purchaseLine: { select: { invoice: { select: { id: true, number: true } } } },
  items: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceName: true, sessions: true } },
} as const;
type SummaryRow = Prisma.PatientPackageGetPayload<{ select: typeof SUMMARY_SELECT }>;

/** Paket aktif dulu, lalu urutan dari query (terbaru dulu). */
async function summarize(rows: SummaryRow[]): Promise<(PatientPackageSummary & { price: number })[]> {
  const itemIds = rows.flatMap((row) => row.items.map((item) => item.id));
  const sums =
    itemIds.length === 0
      ? []
      : await prisma.packageSessionEntry.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: itemIds } }, _sum: { delta: true } });
  const today = witaDateString(new Date());
  const summaries = rows.map((row) => {
    const items = row.items.map((item) => ({
      serviceName: item.serviceName,
      sessions: item.sessions,
      remaining: sums.find((sum) => sum.patientPackageItemId === item.id)?._sum.delta ?? 0,
    }));
    const expiresOn = dateOnlyString(row.expiresOn);
    return {
      id: row.id,
      name: row.name,
      price: row.price,
      startsOn: dateOnlyString(row.startsOn),
      expiresOn,
      state: packageState({ status: row.status, expiresOn, remaining: items.reduce((sum, item) => sum + item.remaining, 0) }, today),
      items,
      purchaseInvoice: row.purchaseLine.invoice,
      patient: row.patient,
    };
  });
  return summaries.sort((a, b) => Number(b.state === "AKTIF") - Number(a.state === "AKTIF"));
}

export async function listPatientPackages(patientId: string): Promise<PatientPackageSummary[]> {
  await requireCapability("invoice:read");
  const rows = await prisma.patientPackage.findMany({ where: { patientId: String(patientId ?? "") }, orderBy: { createdAt: "desc" }, select: SUMMARY_SELECT });
  return summarize(rows);
}

/** Tab "Paket customer": paling banyak 200, terbaru dulu, cari nama paket, nama customer, atau nomor RM. */
export async function searchPatientPackages(q?: string): Promise<PatientPackageSummary[]> {
  await requireCapability("invoice:read");
  const term = q?.trim();
  const rows = await prisma.patientPackage.findMany({
    where: term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { patient: { name: { contains: term, mode: "insensitive" } } },
            { patient: { medicalRecordNumber: { contains: term, mode: "insensitive" } } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    select: SUMMARY_SELECT,
  });
  return summarize(rows);
}

export async function getPatientPackage(id: string): Promise<PatientPackageDetail | null> {
  await requireCapability("invoice:read");
  const row = await prisma.patientPackage.findUnique({ where: { id: String(id ?? "") }, select: SUMMARY_SELECT });
  if (!row) return null;
  const [summary] = await summarize([row]);
  const entries = await prisma.packageSessionEntry.findMany({
    where: { item: { patientPackageId: row.id } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      createdAt: true,
      kind: true,
      delta: true,
      staffName: true,
      reason: true,
      previousExpiresOn: true,
      newExpiresOn: true,
      item: { select: { serviceName: true } },
      invoiceLine: { select: { invoice: { select: { id: true, number: true } } } },
    },
  });
  return {
    ...summary,
    entries: entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      kind: entry.kind,
      delta: entry.delta,
      serviceName: entry.kind === "PERPANJANG" ? null : entry.item.serviceName,
      invoice: entry.invoiceLine?.invoice ?? null,
      staffName: entry.staffName,
      reason: entry.reason,
      previousExpiresOn: entry.previousExpiresOn ? dateOnlyString(entry.previousExpiresOn) : null,
      newExpiresOn: entry.newExpiresOn ? dateOnlyString(entry.newExpiresOn) : null,
    })),
  };
}
