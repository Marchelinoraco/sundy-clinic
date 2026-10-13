import type { Prisma, PrismaClient } from "@prisma/client";
import { monthEndInstant } from "@/lib/payroll";

/** Logika basis data penggajian bersama bacaan dan aksi (spec karyawan 3). Modul biasa, bukan "use server". */
export type Db = PrismaClient | Prisma.TransactionClient;
export type OpenCommission = { commission: number; treatments: number; lineIds: string[] };

/** Komisi yang belum dibayar per staf: baris treatment berkomisi dari tagihan FINAL yang difinalkan sebelum akhir bulan itu. */
export async function openCommissions(db: Db, staffIds: string[], month: string): Promise<Map<string, OpenCommission>> {
  const result = new Map<string, OpenCommission>();
  if (staffIds.length === 0) return result;
  const rows = await db.invoiceLine.findMany({
    where: {
      kind: "TREATMENT",
      performerId: { in: staffIds },
      payrollItemId: null,
      commissionAmount: { gt: 0 },
      invoice: { status: "FINAL", finalizedAt: { lt: monthEndInstant(month) } },
    },
    select: { id: true, performerId: true, quantity: true, commissionAmount: true },
  });
  for (const row of rows) {
    const current = result.get(row.performerId!) ?? { commission: 0, treatments: 0, lineIds: [] };
    current.commission += row.commissionAmount;
    current.treatments += row.quantity;
    current.lineIds.push(row.id);
    result.set(row.performerId!, current);
  }
  return result;
}

/**
 * Koreksi otomatis (spec karyawan 3): baris komisi yang sudah dibayar tetapi tagihannya kemudian dibatalkan menjadi POTONGAN
 * di baris penggajian yang belum dibayar. `invoiceLineId` unik mencegah koreksi ganda.
 */
export async function syncCommissionCorrections(db: Db, item: { id: string; staffId: string | null }, actorName: string): Promise<void> {
  if (!item.staffId) return;
  const lines = await db.invoiceLine.findMany({
    where: { performerId: item.staffId, payrollItem: { paidAt: { not: null } }, invoice: { status: "DIBATALKAN" }, commissionAmount: { gt: 0 } },
    select: { id: true, commissionAmount: true, invoice: { select: { number: true } } },
  });
  if (lines.length === 0) return;
  const done = new Set(
    (await db.payrollAdjustment.findMany({ where: { invoiceLineId: { in: lines.map((l) => l.id) } }, select: { invoiceLineId: true } })).map((a) => a.invoiceLineId),
  );
  const fresh = lines.filter((l) => !done.has(l.id));
  if (fresh.length === 0) return;
  await db.payrollAdjustment.createMany({
    data: fresh.map((l) => ({
      itemId: item.id,
      kind: "POTONGAN" as const,
      amount: l.commissionAmount,
      note: `Koreksi komisi ${l.invoice.number ?? "tagihan"} (dibatalkan)`,
      invoiceLineId: l.id,
      createdByName: actorName,
    })),
    skipDuplicates: true,
  });
}

/** Pembayaran untuk karyawan yang sama bergiliran, supaya komisi yang sama tidak diklaim dua kali (Review Focus 1). */
export async function lockEmployee(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${id} FOR UPDATE`;
}

export function adjustmentTotals(adjustments: { kind: "BONUS" | "POTONGAN"; amount: number }[]): { bonusTotal: number; deductionTotal: number } {
  let bonusTotal = 0;
  let deductionTotal = 0;
  for (const a of adjustments) {
    if (a.kind === "BONUS") bonusTotal += a.amount;
    else deductionTotal += a.amount;
  }
  return { bonusTotal, deductionTotal };
}
