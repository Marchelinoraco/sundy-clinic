import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Tanpa "use server": pembantu server untuk laporan. Penjumlahan dilakukan di basis data agar laporan tidak
// memuat baris tagihan ke memori (spec laporan 3). Rumusnya harus sama persis dengan src/lib/invoice.ts.

export type InvoiceAggregate = {
  /** "YYYY-MM" (WITA) bila dikelompokkan per bulan; "semua" bila tidak. */
  bucket: string;
  service: number;
  treatment: number;
  goods: number;
  package: number;
  discount: number;
  cogs: number;
  outstanding: number;
  invoiceCount: number;
  /** Pemakaian stok tanpa harga beli di tagihan periode ini (spec harga modal 7). */
  missingCost: number;
};

type Row = Record<keyof Omit<InvoiceAggregate, "bucket">, bigint | number | null> & { bucket: string };

/**
 * Harga pokok = barang (harga beli kosong dihitung 0) + bahan + alat treatment; komisi tidak (spec harga modal M3).
 * Per jenis baris kotor (quantity × unitPrice); diskon = diskon baris + diskon tagihan (rencana perbaikan tagihan,
 * keputusan 1), sehingga pendapatan = layanan + treatment + barang + paket − diskon tidak memotong diskon baris dua kali.
 * Jumlah tagihan FINAL yang `finalizedAt`-nya di [start, end), per jenis baris, diskon, harga pokok, sisa
 * belum tertagih, dan jumlah tagihan. Diskon per tagihan: persen dibulatkan ke bawah (`subtotal × min(nilai, 100) / 100`,
 * pembagian bilangan bulat), nominal dibatasi subtotal. Sisa = max(0, total − pembayaran yang berlaku).
 */
export async function invoiceAggregates(start: Date, end: Date, branchId: string | null, byMonth: boolean): Promise<InvoiceAggregate[]> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const bucket = byMonth ? Prisma.sql`m.month` : Prisma.sql`'semua'`;
  const group = byMonth ? Prisma.sql`GROUP BY m.month` : Prisma.empty;
  const rows = await prisma.$queryRaw<Row[]>`
    WITH inv AS (
      SELECT i."id", i."discountKind", i."discountValue",
             to_char(i."finalizedAt" AT TIME ZONE 'Asia/Makassar', 'YYYY-MM') AS month
      FROM "Invoice" i
      WHERE i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch}
    ),
    lines AS (
      SELECT l."invoiceId",
             COALESCE(SUM(l."quantity" * l."unitPrice") FILTER (WHERE l."kind" = 'LAYANAN'), 0) AS service,
             COALESCE(SUM(l."quantity" * l."unitPrice") FILTER (WHERE l."kind" = 'TREATMENT'), 0) AS treatment,
             COALESCE(SUM(l."quantity" * l."unitPrice") FILTER (WHERE l."kind" = 'BARANG'), 0) AS goods,
             COALESCE(SUM(l."quantity" * l."unitPrice") FILTER (WHERE l."kind" = 'PAKET'), 0) AS package,
             COALESCE(SUM(l."discountAmount"), 0) AS "itemDiscount",
             COALESCE(SUM(l."materialCost" + l."toolCost"), 0) AS "treatmentCost",
             COALESCE(SUM(l."quantity" * l."unitPrice" - l."discountAmount"), 0) AS subtotal
      FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId"
      GROUP BY l."invoiceId"
    ),
    cost AS (
      SELECT l."invoiceId", SUM(u."quantity" * u."unitCost") AS cogs, COUNT(*) FILTER (WHERE u."unitCost" IS NULL) AS missing
      FROM "InvoiceStockUse" u
      JOIN "InvoiceLine" l ON l."id" = u."lineId"
      JOIN inv ON inv."id" = l."invoiceId"
      GROUP BY l."invoiceId"
    ),
    paid AS (
      SELECT p."invoiceId", SUM(p."amount") AS paid
      FROM "InvoicePayment" p JOIN inv ON inv."id" = p."invoiceId"
      WHERE p."revokedAt" IS NULL
      GROUP BY p."invoiceId"
    ),
    m AS (
      SELECT inv.month,
             COALESCE(lines.service, 0) AS service,
             COALESCE(lines.treatment, 0) AS treatment,
             COALESCE(lines.goods, 0) AS goods,
             COALESCE(lines.package, 0) AS package,
             COALESCE(lines.subtotal, 0) AS subtotal,
             COALESCE(lines."itemDiscount", 0) AS item,
             COALESCE(lines."itemDiscount", 0) + CASE
               WHEN inv."discountKind" = 'PERSEN' AND inv."discountValue" > 0
                 THEN (COALESCE(lines.subtotal, 0) * LEAST(inv."discountValue", 100)) / 100
               WHEN inv."discountKind" = 'NOMINAL' AND inv."discountValue" > 0
                 THEN LEAST(inv."discountValue"::bigint, COALESCE(lines.subtotal, 0))
               ELSE 0
             END AS discount,
             COALESCE(cost.cogs, 0) + COALESCE(lines."treatmentCost", 0) AS cogs,
             COALESCE(cost.missing, 0) AS missing,
             COALESCE(paid.paid, 0) AS paid
      FROM inv
      LEFT JOIN lines ON lines."invoiceId" = inv."id"
      LEFT JOIN cost ON cost."invoiceId" = inv."id"
      LEFT JOIN paid ON paid."invoiceId" = inv."id"
    )
    SELECT ${bucket} AS bucket,
           COALESCE(SUM(m.service), 0) AS service,
           COALESCE(SUM(m.treatment), 0) AS treatment,
           COALESCE(SUM(m.goods), 0) AS goods,
           COALESCE(SUM(m.package), 0) AS package,
           COALESCE(SUM(m.discount), 0) AS discount,
           COALESCE(SUM(m.cogs), 0) AS cogs,
           COALESCE(SUM(GREATEST(0, m.subtotal - (m.discount - m.item) - m.paid)), 0) AS outstanding,
           COALESCE(SUM(m.missing), 0) AS "missingCost",
           COUNT(*) AS "invoiceCount"
    FROM m
    ${group}
    ORDER BY 1
  `;
  return rows.map((row) => ({
    bucket: row.bucket,
    service: Number(row.service ?? 0),
    treatment: Number(row.treatment ?? 0),
    goods: Number(row.goods ?? 0),
    package: Number(row.package ?? 0),
    discount: Number(row.discount ?? 0),
    cogs: Number(row.cogs ?? 0),
    outstanding: Number(row.outstanding ?? 0),
    invoiceCount: Number(row.invoiceCount ?? 0),
    missingCost: Number(row.missingCost ?? 0),
  }));
}

/**
 * Sesi paket terpakai per treatment (rencana paket keputusan 5): Σ −delta baris PAKAI yang tagihan pemakaiannya
 * masih FINAL dengan `finalizedAt` di [start, end), menurut cabang tagihan pemakaian.
 */
export async function packageSessionsUsed(start: Date, end: Date, branchId: string | null): Promise<{ name: string; sessions: number }[]> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ name: string; sessions: bigint | number }[]>`
    SELECT ppi."serviceName" AS name, SUM(-e."delta") AS sessions
    FROM "PackageSessionEntry" e
    JOIN "PatientPackageItem" ppi ON ppi."id" = e."patientPackageItemId"
    JOIN "InvoiceLine" l ON l."id" = e."invoiceLineId"
    JOIN "Invoice" i ON i."id" = l."invoiceId"
    WHERE e."kind" = 'PAKAI' AND i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch}
    GROUP BY ppi."serviceName"
    ORDER BY 2 DESC, 1
  `;
  return rows.map((row) => ({ name: row.name, sessions: Number(row.sessions) }));
}

/** Jumlah pengeluaran yang tidak dibatalkan per bulan ("YYYY-MM"), untuk tren. `branchId` null = semua cabang. */
export async function expensesByMonth(fromDate: string, toDate: string, branchId: string | null): Promise<Map<string, number>> {
  const branch = branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ month: string; amount: bigint | null }[]>`
    SELECT to_char("date", 'YYYY-MM') AS month, SUM("amount") AS amount
    FROM "Expense"
    WHERE "voidedAt" IS NULL AND "date" >= ${new Date(`${fromDate}T00:00:00Z`)} AND "date" <= ${new Date(`${toDate}T00:00:00Z`)} ${branch}
    GROUP BY 1
  `;
  return new Map(rows.map((row) => [row.month, Number(row.amount ?? 0)]));
}
