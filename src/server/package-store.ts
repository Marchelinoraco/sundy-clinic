import type { Prisma } from "@prisma/client";
import { dateLabel, dateOnlyString } from "@/lib/stock";
import { packageContentsLabel } from "@/lib/treatment-package";

// Tanpa "use server": pembantu server paket treatment (spec paket 5–8), dipanggil di dalam transaksi tagihan
// atau dengan klien prisma biasa untuk tampilan.

type Db = Prisma.TransactionClient;

export type PackageNoteLine = { id: string; kind: string; treatmentPackageId: string | null; patientPackageItemId: string | null };

/**
 * Keterangan di bawah nama baris (spec paket 5, 8):
 * - baris PAKET draf: "3× Facial · berlaku 90 hari";
 * - baris PAKET final: "3× Facial · berlaku s.d. 12 Apr 2027".
 */
export async function packageLineNotes(db: Db, lines: readonly PackageNoteLine[]): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  const packageLines = lines.filter((line) => line.kind === "PAKET" && line.treatmentPackageId);
  if (packageLines.length > 0) {
    const [bought, catalog] = await Promise.all([
      db.patientPackage.findMany({
        where: { purchaseLineId: { in: packageLines.map((line) => line.id) } },
        select: { purchaseLineId: true, expiresOn: true, items: { orderBy: { sortOrder: "asc" }, select: { serviceName: true, sessions: true } } },
      }),
      db.treatmentPackage.findMany({
        where: { id: { in: packageLines.map((line) => line.treatmentPackageId!) } },
        select: { id: true, validDays: true, items: { orderBy: { sortOrder: "asc" }, select: { sessions: true, service: { select: { name: true } } } } },
      }),
    ]);
    for (const line of packageLines) {
      const own = bought.find((row) => row.purchaseLineId === line.id);
      if (own) {
        const contents = packageContentsLabel(own.items.map((item) => ({ name: item.serviceName, sessions: item.sessions })));
        notes.set(line.id, `${contents} · berlaku s.d. ${dateLabel(dateOnlyString(own.expiresOn))}`);
        continue;
      }
      const pkg = catalog.find((row) => row.id === line.treatmentPackageId);
      if (pkg) notes.set(line.id, `${packageContentsLabel(pkg.items.map((item) => ({ name: item.service.name, sessions: item.sessions })))} · berlaku ${pkg.validDays} hari`);
    }
  }
  return notes;
}
