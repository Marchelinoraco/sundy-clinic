import type { Prisma } from "@prisma/client";
import { packageContentsLabel } from "@/lib/treatment-package";

// Tanpa "use server": pembantu kunjungan yang memakai transaksi, tidak dipanggil browser.

/** Tinggi badan dari kunjungan final terakhir pasien, untuk diisi lebih dulu di kunjungan baru. */
export async function lastHeightCm(db: Prisma.TransactionClient, patientId: string): Promise<Prisma.Decimal | null> {
  const last = await db.encounter.findFirst({
    where: { status: "FINAL", heightCm: { not: null }, appointment: { patientId } },
    orderBy: { appointment: { startAt: "desc" } },
    select: { heightCm: true },
  });
  return last?.heightCm ?? null;
}

/** Paket katalog dengan ringkasan isinya ("4× Facial, 28 kapsul Slimming"), tanpa harga (spec vital perawat PR1). */
export async function packageSummaries(
  db: Prisma.TransactionClient,
  where: Prisma.TreatmentPackageWhereInput,
): Promise<{ id: string; name: string; contents: string; isActive: boolean }[]> {
  const rows = await db.treatmentPackage.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      items: { orderBy: { sortOrder: "asc" }, select: { sessions: true, service: { select: { name: true } }, item: { select: { name: true, unit: true } } } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    contents: packageContentsLabel(row.items.map((item) => ({ name: item.service?.name ?? item.item?.name ?? "", sessions: item.sessions, unit: item.item?.unit ?? null }))),
  }));
}
