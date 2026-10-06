import type { Prisma } from "@prisma/client";

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
