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
 * Sesi paket terpakai per treatment, dan jatah barang terambil per barang dengan satuannya (rencana paket keputusan 5;
 * paket barang PB2): Σ −delta baris PAKAI yang tagihan pemakaiannya masih FINAL dengan `finalizedAt` di [start, end),
 * menurut cabang tagihan pemakaian.
 */
export async function packageSessionsUsed(start: Date, end: Date, branchId: string | null): Promise<{ name: string; unit: string | null; sessions: number }[]> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ name: string; unit: string | null; sessions: bigint | number }[]>`
    SELECT ppi."serviceName" AS name, ppi."unit" AS unit, SUM(-e."delta") AS sessions
    FROM "PackageSessionEntry" e
    JOIN "PatientPackageItem" ppi ON ppi."id" = e."patientPackageItemId"
    JOIN "InvoiceLine" l ON l."id" = e."invoiceLineId"
    JOIN "Invoice" i ON i."id" = l."invoiceId"
    WHERE e."kind" = 'PAKAI' AND i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch}
    GROUP BY ppi."serviceName", ppi."unit"
    ORDER BY 3 DESC, 1
  `;
  return rows.map((row) => ({ name: row.name, unit: row.unit, sessions: Number(row.sessions) }));
}

export type MarginGroup = { revenue: number; stockCost: number; materialCost: number; toolCost: number; commission: number };
export type MarginReport = {
  goods: MarginGroup;
  treatment: MarginGroup;
  packageRevenue: number;
  /** Layanan (konsultasi) tanpa biaya; ikut dihitung supaya diskon tagihan sebanding dengan pendapatannya (tinjauan harga modal). */
  serviceRevenue: number;
  invoiceDiscount: number;
  byItem: { name: string; quantity: number; revenue: number; cost: number }[];
  byTreatment: { name: string; quantity: number; revenue: number; materialCost: number; toolCost: number; commission: number }[];
};

/** Margin per kelompok (spec harga modal 7) dari tagihan FINAL di [start, end); pendapatan baris setelah diskon baris. */
export async function marginAggregates(start: Date, end: Date, branchId: string | null): Promise<MarginReport> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const inv = Prisma.sql`SELECT i."id", i."discountKind", i."discountValue" FROM "Invoice" i WHERE i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch}`;
  type N = bigint | number | null;
  const [groups, items, treatments, discounts] = await Promise.all([
    prisma.$queryRaw<{ kind: string; revenue: N; stock: N; material: N; tool: N; commission: N }[]>`
      WITH inv AS (${inv})
      SELECT l."kind" AS kind,
             SUM(l."quantity" * l."unitPrice" - l."discountAmount") AS revenue,
             SUM((SELECT COALESCE(SUM(u."quantity" * u."unitCost"), 0) FROM "InvoiceStockUse" u WHERE u."lineId" = l."id")) AS stock,
             SUM(l."materialCost") AS material, SUM(l."toolCost") AS tool, SUM(l."commissionAmount") AS commission
      FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId"
      GROUP BY l."kind"`,
    prisma.$queryRaw<{ name: string; quantity: N; revenue: N; cost: N }[]>`
      WITH inv AS (${inv})
      SELECT l."name" AS name, SUM(l."quantity") AS quantity, SUM(l."quantity" * l."unitPrice" - l."discountAmount") AS revenue,
             SUM((SELECT COALESCE(SUM(u."quantity" * u."unitCost"), 0) FROM "InvoiceStockUse" u WHERE u."lineId" = l."id")) AS cost
      FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId"
      WHERE l."kind" = 'BARANG'
      GROUP BY l."name" ORDER BY 3 DESC, 1`,
    prisma.$queryRaw<{ name: string; quantity: N; revenue: N; material: N; tool: N; commission: N }[]>`
      WITH inv AS (${inv})
      SELECT l."name" AS name, SUM(l."quantity") AS quantity, SUM(l."quantity" * l."unitPrice" - l."discountAmount") AS revenue,
             SUM(l."materialCost") AS material, SUM(l."toolCost") AS tool, SUM(l."commissionAmount") AS commission
      FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId"
      WHERE l."kind" = 'TREATMENT'
      GROUP BY l."name" ORDER BY 2 DESC, 1`,
    prisma.$queryRaw<{ discount: N }[]>`
      WITH inv AS (${inv}),
      sub AS (SELECT l."invoiceId", SUM(l."quantity" * l."unitPrice" - l."discountAmount") AS subtotal FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId" GROUP BY l."invoiceId")
      SELECT COALESCE(SUM(CASE
        WHEN inv."discountKind" = 'PERSEN' AND inv."discountValue" > 0 THEN (COALESCE(sub.subtotal, 0) * LEAST(inv."discountValue", 100)) / 100
        WHEN inv."discountKind" = 'NOMINAL' AND inv."discountValue" > 0 THEN LEAST(inv."discountValue"::bigint, COALESCE(sub.subtotal, 0))
        ELSE 0 END), 0) AS discount
      FROM inv LEFT JOIN sub ON sub."invoiceId" = inv."id"`,
  ]);
  const num = (value: N) => Number(value ?? 0);
  const group = (kind: string): MarginGroup => {
    const row = groups.find((g) => g.kind === kind);
    return { revenue: num(row?.revenue ?? 0), stockCost: num(row?.stock ?? 0), materialCost: num(row?.material ?? 0), toolCost: num(row?.tool ?? 0), commission: num(row?.commission ?? 0) };
  };
  const goods = group("BARANG");
  return {
    goods: { ...goods, materialCost: 0, toolCost: 0, commission: 0 },
    treatment: { ...group("TREATMENT"), stockCost: 0 },
    packageRevenue: group("PAKET").revenue,
    serviceRevenue: group("LAYANAN").revenue,
    invoiceDiscount: num(discounts[0]?.discount ?? 0),
    byItem: items.map((row) => ({ name: row.name, quantity: num(row.quantity), revenue: num(row.revenue), cost: num(row.cost) })),
    byTreatment: treatments.map((row) => ({ name: row.name, quantity: num(row.quantity), revenue: num(row.revenue), materialCost: num(row.material), toolCost: num(row.tool), commission: num(row.commission) })),
  };
}

export type CommissionRow = { performerId: string; performerName: string; treatments: number; commission: number };
export type CommissionDetailRow = {
  finalizedAt: Date;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  treatment: string;
  quantity: number;
  commission: number;
  performerName: string;
  /** Bulan penggajian yang sudah membayar komisi baris ini (spec karyawan 5); null = belum dibayar. */
  paidMonth: string | null;
};

/** Komisi per pelaksana (spec harga modal 7): baris TREATMENT berpelaksana dari tagihan FINAL di [start, end). Nama terbaru per pelaksana. */
export async function commissionByPerformer(start: Date, end: Date, branchId: string | null): Promise<CommissionRow[]> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ performerId: string; performerName: string; treatments: bigint | number; commission: bigint | number }[]>`
    SELECT l."performerId" AS "performerId", MAX(l."performerName") AS "performerName",
           SUM(l."quantity") AS treatments, SUM(l."commissionAmount") AS commission
    FROM "InvoiceLine" l JOIN "Invoice" i ON i."id" = l."invoiceId"
    WHERE i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch}
      AND l."kind" = 'TREATMENT' AND l."performerId" IS NOT NULL
    GROUP BY l."performerId"
    ORDER BY 4 DESC, 2`;
  return rows.map((row) => ({ performerId: row.performerId, performerName: row.performerName, treatments: Number(row.treatments), commission: Number(row.commission) }));
}

export async function commissionDetails(start: Date, end: Date, branchId: string | null, performerId: string | null): Promise<CommissionDetailRow[]> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const performer = performerId ? Prisma.sql`AND l."performerId" = ${performerId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<(Omit<CommissionDetailRow, "quantity" | "commission"> & { quantity: bigint | number; commission: bigint | number })[]>`
    SELECT i."finalizedAt" AS "finalizedAt", i."id" AS "invoiceId", i."number" AS "invoiceNumber", p."name" AS "customerName",
           l."name" AS treatment, l."quantity" AS quantity, l."commissionAmount" AS commission, l."performerName" AS "performerName",
           pp."month" AS "paidMonth"
    FROM "InvoiceLine" l JOIN "Invoice" i ON i."id" = l."invoiceId" JOIN "Patient" p ON p."id" = i."patientId"
    LEFT JOIN "PayrollItem" pi ON pi."id" = l."payrollItemId" AND pi."paidAt" IS NOT NULL
    LEFT JOIN "PayrollPeriod" pp ON pp."id" = pi."periodId"
    WHERE i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch} ${performer}
      AND l."kind" = 'TREATMENT' AND l."performerId" IS NOT NULL
    ORDER BY l."performerName", i."finalizedAt", i."number"`;
  return rows.map((row) => ({ ...row, quantity: Number(row.quantity), commission: Number(row.commission) }));
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
