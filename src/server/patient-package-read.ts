import { prisma } from "@/lib/db";
import { dateOnlyString } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import type { PackageOption } from "@/lib/treatment-package";
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
