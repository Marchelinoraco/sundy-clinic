import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import { dateLabel, dateOnlyString } from "@/lib/stock";
import { packageContentsLabel, packageExpiresOn, sessionNote } from "@/lib/treatment-package";

// Tanpa "use server": pembantu server paket treatment (spec paket 5–8), dipanggil di dalam transaksi tagihan
// atau dengan klien prisma biasa untuk tampilan.

type Db = Prisma.TransactionClient;

export type PackageNoteLine = { id: string; kind: string; treatmentPackageId: string | null; patientPackageItemId: string | null };

/**
 * Keterangan di bawah nama baris (spec paket 5, 8):
 * - baris PAKET draf: "3× Facial · berlaku 90 hari";
 * - baris PAKET final: "3× Facial · berlaku s.d. 12 Apr 2027".
 */
export async function packageLineNotes(db: Db, lines: readonly PackageNoteLine[], options: { draft: boolean }): Promise<Map<string, string>> {
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
  // Baris sesi: "Sesi paket {nama} · sisa n dari m". Di draf, sisa sesudah semua draf yang menandai item itu (rencana paket
  // keputusan 10); di tagihan final, struk, dan tagihan dibatalkan hanya buku sesi, supaya draf lain tidak mengubah angkanya.
  const useLines = lines.filter((line) => line.patientPackageItemId);
  if (useLines.length > 0) {
    const ids = [...new Set(useLines.map((line) => line.patientPackageItemId!))];
    const [items, sums, pending] = await Promise.all([
      db.patientPackageItem.findMany({ where: { id: { in: ids } }, select: { id: true, sessions: true, patientPackage: { select: { name: true } } } }),
      db.packageSessionEntry.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids } }, _sum: { delta: true } }),
      options.draft
        ? db.invoiceLine.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids }, invoice: { status: "DRAF" } }, _sum: { quantity: true } })
        : Promise.resolve([] as { patientPackageItemId: string | null; _sum: { quantity: number | null } }[]),
    ]);
    for (const line of useLines) {
      const item = items.find((row) => row.id === line.patientPackageItemId);
      if (!item) continue;
      const left = (sums.find((row) => row.patientPackageItemId === item.id)?._sum.delta ?? 0) - (pending.find((row) => row.patientPackageItemId === item.id)?._sum.quantity ?? 0);
      notes.set(line.id, sessionNote({ packageName: item.patientPackage.name, remaining: Math.max(0, left), sessions: item.sessions }));
    }
  }
  return notes;
}

type Actor = { staffId: string; name: string };
const day = (value: string) => new Date(`${value}T00:00:00Z`);

/** Mengunci paket customer sampai transaksi selesai, berurutan menurut id agar dua transaksi tidak saling menunggu. */
export async function lockPatientPackages(tx: Db, ids: readonly string[]): Promise<void> {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "PatientPackage" WHERE id = ANY(${sorted}::text[]) ORDER BY id FOR UPDATE`;
}

/** Sisa sesi per item = Σ delta buku sesi (spec paket 3, 10). */
export async function remainingByItem(tx: Db, itemIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return new Map();
  const sums = await tx.packageSessionEntry.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids } }, _sum: { delta: true } });
  return new Map(ids.map((id) => [id, sums.find((row) => row.patientPackageItemId === id)?._sum.delta ?? 0]));
}

/** Setiap baris PAKET menjadi satu paket customer dengan buku BELI per treatment (spec paket 5). */
export async function activatePurchasedPackages(
  tx: Db,
  invoice: { patientId: string; lines: readonly { id: string; kind: string; name: string; unitPrice: number; treatmentPackageId: string | null }[] },
  actor: Actor,
  today: string,
): Promise<void> {
  for (const line of invoice.lines) {
    if (line.kind !== "PAKET" || !line.treatmentPackageId) continue;
    const pkg = await tx.treatmentPackage.findUnique({
      where: { id: line.treatmentPackageId },
      select: { name: true, validDays: true, isActive: true, items: { orderBy: { sortOrder: "asc" }, select: { serviceId: true, sessions: true, service: { select: { name: true } } } } },
    });
    if (!pkg || !pkg.isActive) throw new UserFacingError(`Paket ${line.name} sudah tidak dijual. Hapus barisnya.`);
    const created = await tx.patientPackage.create({
      data: {
        patientId: invoice.patientId,
        packageId: line.treatmentPackageId,
        name: pkg.name,
        price: line.unitPrice,
        purchaseLineId: line.id,
        startsOn: day(today),
        expiresOn: day(packageExpiresOn(today, pkg.validDays)),
        items: { create: pkg.items.map((item, index) => ({ serviceId: item.serviceId, serviceName: item.service.name, sessions: item.sessions, sortOrder: index })) },
      },
      select: { items: { select: { id: true, sessions: true } } },
    });
    await tx.packageSessionEntry.createMany({
      data: created.items.map((item) => ({ patientPackageItemId: item.id, kind: "BELI" as const, delta: item.sessions, invoiceLineId: line.id, staffId: actor.staffId, staffName: actor.name })),
    });
  }
}

/**
 * Tagihan pembelian dibatalkan (spec paket 7): ditolak bila ada sesi yang dipakai di tagihan yang masih final;
 * bila tidak, paket dibatalkan dan sisa sesinya dikurangi lewat BATAL_PAKET.
 */
export async function cancelPurchasedPackages(tx: Db, invoiceId: string, actor: Actor): Promise<void> {
  const packages = await tx.patientPackage.findMany({ where: { purchaseLine: { invoiceId } }, select: { id: true } });
  if (packages.length === 0) return;
  const ids = packages.map((pkg) => pkg.id);
  await lockPatientPackages(tx, ids);
  const used = await tx.packageSessionEntry.findFirst({
    where: { kind: "PAKAI", item: { patientPackageId: { in: ids } }, invoiceLine: { invoice: { status: "FINAL" } } },
    orderBy: { createdAt: "asc" },
    select: { item: { select: { patientPackage: { select: { name: true } } } }, invoiceLine: { select: { invoice: { select: { number: true } } } } },
  });
  if (used) {
    throw new UserFacingError(`Sesi paket ${used.item.patientPackage.name} sudah dipakai di tagihan ${used.invoiceLine?.invoice.number ?? "lain"}. Batalkan tagihan itu dulu.`);
  }
  const items = await tx.patientPackageItem.findMany({ where: { patientPackageId: { in: ids } }, select: { id: true } });
  const remaining = await remainingByItem(tx, items.map((item) => item.id));
  const entries = items
    .map((item) => ({ item, left: remaining.get(item.id) ?? 0 }))
    .filter(({ left }) => left > 0)
    .map(({ item, left }) => ({ patientPackageItemId: item.id, kind: "BATAL_PAKET" as const, delta: -left, staffId: actor.staffId, staffName: actor.name }));
  if (entries.length > 0) await tx.packageSessionEntry.createMany({ data: entries });
  await tx.patientPackage.updateMany({ where: { id: { in: ids } }, data: { status: "DIBATALKAN" } });
}

/**
 * Finalisasi tagihan pemakaian (spec paket 6): paket dikunci, lalu setiap baris sesi dicek (milik customer ini,
 * aktif, belum kedaluwarsa, sisa cukup) dan dicatat PAKAI. Gagal satu, seluruh finalisasi batal.
 */
export async function consumePackageSessions(
  tx: Db,
  invoice: { patientId: string; lines: readonly { id: string; name: string; quantity: number; patientPackageItemId: string | null }[] },
  actor: Actor,
  today: string,
): Promise<void> {
  const uses = invoice.lines.filter((line) => line.patientPackageItemId);
  if (uses.length === 0) return;
  const itemIds = uses.map((line) => line.patientPackageItemId!);
  const owners = await tx.patientPackageItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, serviceName: true, patientPackageId: true } });
  await lockPatientPackages(tx, owners.map((item) => item.patientPackageId));
  const packages = await tx.patientPackage.findMany({
    where: { id: { in: owners.map((item) => item.patientPackageId) } },
    select: { id: true, name: true, patientId: true, status: true, expiresOn: true },
  });
  const remaining = await remainingByItem(tx, itemIds);
  for (const line of uses) {
    const item = owners.find((row) => row.id === line.patientPackageItemId);
    const pkg = item ? packages.find((row) => row.id === item.patientPackageId) : undefined;
    if (!item || !pkg) throw new UserFacingError(`Paket untuk baris ${line.name} tidak ditemukan. Lepas paket lalu coba lagi.`);
    if (pkg.patientId !== invoice.patientId) throw new UserFacingError("Paket ini milik customer lain.");
    if (pkg.status !== "AKTIF") throw new UserFacingError(`Paket ${pkg.name} sudah dibatalkan. Lepas paket dari baris ${line.name}.`);
    const expires = dateOnlyString(pkg.expiresOn);
    if (expires < today) throw new UserFacingError(`Paket ${pkg.name} sudah kedaluwarsa ${dateLabel(expires)}. Lepas paket atau minta Admin Keuangan memperpanjang.`);
    const left = remaining.get(item.id) ?? 0;
    if (left < line.quantity) throw new UserFacingError(`Sesi ${item.serviceName} di paket ${pkg.name} tinggal ${left}. Lepas paket atau kurangi jumlahnya.`);
    remaining.set(item.id, left - line.quantity);
    await tx.packageSessionEntry.create({
      data: { patientPackageItemId: item.id, kind: "PAKAI", delta: -line.quantity, invoiceLineId: line.id, staffId: actor.staffId, staffName: actor.name },
    });
  }
}

/** Tagihan pemakaian dibatalkan: setiap PAKAI dikembalikan lewat BATAL_PAKAI, walau paketnya sudah kedaluwarsa (spec paket 7). */
export async function restoreUsedSessions(tx: Db, invoiceId: string, actor: Actor): Promise<void> {
  const used = await tx.packageSessionEntry.findMany({
    where: { kind: "PAKAI", invoiceLine: { invoiceId } },
    select: { patientPackageItemId: true, delta: true, invoiceLineId: true, item: { select: { patientPackageId: true } } },
  });
  if (used.length === 0) return;
  await lockPatientPackages(tx, used.map((entry) => entry.item.patientPackageId));
  await tx.packageSessionEntry.createMany({
    data: used.map((entry) => ({
      patientPackageItemId: entry.patientPackageItemId,
      kind: "BATAL_PAKAI" as const,
      delta: -entry.delta,
      invoiceLineId: entry.invoiceLineId,
      staffId: actor.staffId,
      staffName: actor.name,
    })),
  });
}
