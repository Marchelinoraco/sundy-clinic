import { prisma } from "@/lib/db";
import { currentMonthOf } from "@/lib/expense";
import {
  compareReports,
  monthPeriod,
  periodInstants,
  previousPeriod,
  summarizeReport,
  trendMonths,
  trendPoint,
  validatePeriod,
  type Comparison,
  type RawReport,
  type ReportPeriod,
  type ReportView,
  type TrendPoint,
} from "@/lib/report";
import { dateOnly } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { expensesByMonth, invoiceAggregates } from "@/server/report-sql";
import { ensureRecurringExpenses } from "@/server/expense-store";
import { requireCapability } from "@/server/session";

/**
 * Mengumpulkan angka mentah satu periode dan cabang (spec laporan 3). Tanpa tabel ringkasan:
 * semuanya dihitung langsung dari data sumber. `branchId` null = semua cabang (termasuk pengeluaran umum).
 */
export async function collectReport(period: ReportPeriod, branchId: string | null): Promise<RawReport> {
  const { start, end } = periodInstants(period);
  const dates = { gte: dateOnly(period.from), lte: dateOnly(period.to) };
  const branch = branchId ? { branchId } : {};

  const [aggregates, expenseGroups, upfront, customerPaid, supplierGroups] = await Promise.all([
    invoiceAggregates(start, end, branchId, false),
    prisma.expense.groupBy({ by: ["categoryId"], where: { voidedAt: null, date: dates, ...branch }, _sum: { amount: true } }),
    upfrontEntries(start, end, branch),
    prisma.invoicePayment.aggregate({ where: { revokedAt: null, paidAt: dates, invoice: branch }, _sum: { amount: true } }),
    prisma.supplierPayment.groupBy({ by: ["kind"], where: { revokedAt: null, paidAt: dates, invoice: branch }, _sum: { amount: true } }),
  ]);

  const total = aggregates[0];
  const raw: RawReport = {
    service: total?.service ?? 0,
    treatment: total?.treatment ?? 0,
    goods: total?.goods ?? 0,
    discount: total?.discount ?? 0,
    upfrontFee: upfront.reduce((sum, entry) => sum + entry.fee, 0),
    upfrontOnline: upfront.reduce((sum, entry) => sum + entry.online, 0),
    cogs: total?.cogs ?? 0,
    outstanding: total?.outstanding ?? 0,
    invoiceCount: total?.invoiceCount ?? 0,
    expenses: [],
    customerPaid: customerPaid._sum.amount ?? 0,
    supplierPaid: supplierGroups.find((g) => g.kind === "BAYAR")?._sum.amount ?? 0,
    supplierRefunded: supplierGroups.find((g) => g.kind === "PENGEMBALIAN")?._sum.amount ?? 0,
  };

  if (expenseGroups.length > 0) {
    const categories = await prisma.expenseCategory.findMany({
      where: { id: { in: expenseGroups.map((g) => g.categoryId) } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true },
    });
    for (const category of categories) {
      const amount = expenseGroups.find((g) => g.categoryId === category.id)?._sum.amount ?? 0;
      raw.expenses.push({ categoryId: category.id, name: category.name, isActive: category.isActive, amount });
    }
  }
  return raw;
}

/**
 * Pendapatan di muka (spec laporan 3.1): biaya booking dan, untuk Konsultasi Online, harga layanannya, dari
 * booking yang PERTAMA kali diverifikasi di rentang ini. Satu booking dihitung sekali walau diverifikasi lagi.
 * Mengembalikan satu entri per booking beserta waktu verifikasi pertamanya (untuk dikelompokkan per bulan).
 */
async function upfrontEntries(start: Date, end: Date, branch: { branchId?: string }): Promise<{ at: Date; fee: number; online: number }[]> {
  const inRange = await prisma.auditLog.findMany({
    where: { action: "appointment.verify", entity: "Appointment", createdAt: { gte: start, lt: end } },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  if (inRange.length === 0) return [];
  const earliest = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: { action: "appointment.verify", entity: "Appointment", entityId: { in: inRange.map((row) => row.entityId) } },
    _min: { createdAt: true },
  });
  const firstAt = new Map(
    earliest
      .filter((row) => row._min.createdAt !== null && row._min.createdAt >= start && row._min.createdAt < end)
      .map((row) => [row.entityId, row._min.createdAt as Date]),
  );
  if (firstAt.size === 0) return [];
  const appointments = await prisma.appointment.findMany({
    where: { id: { in: [...firstAt.keys()] }, ...branch },
    select: { id: true, bookingFee: true, servicePrice: true, channel: true },
  });
  return appointments.map((appointment) => ({
    at: firstAt.get(appointment.id) as Date,
    fee: appointment.bookingFee ?? 0,
    online: appointment.channel === "ONLINE" ? (appointment.servicePrice ?? 0) : 0,
  }));
}

export type ProfitReport = {
  period: ReportPeriod;
  previousPeriod: ReportPeriod;
  branchId: string | null;
  branchName: string;
  current: ReportView;
  previous: ReportView;
  comparison: Comparison;
  trend: TrendPoint[];
};

/** Laporan satu periode dan cabang, dengan pembanding dan tren 12 bulan (spec laporan 3, 7). */
export async function getProfitReport(filter: { period: ReportPeriod; branchId: string | null }, now: Date = new Date()): Promise<ProfitReport> {
  await requireCapability("profit:read");
  await ensureRecurringExpenses(witaDateString(now));
  const checked = validatePeriod(filter.period);
  if (!checked.ok) throw new Error(checked.message);
  let branchName = "Semua cabang";
  if (filter.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: filter.branchId }, select: { name: true } });
    if (!branch) throw new Error("Cabang tidak ditemukan.");
    branchName = branch.name;
  }

  const previous = previousPeriod(checked.value);
  const months = trendMonths(witaDateString(now));
  const [current, before, trend] = await Promise.all([
    collectReport(checked.value, filter.branchId),
    collectReport(previous, filter.branchId),
    collectTrend(months, filter.branchId),
  ]);
  const currentView = summarizeReport(current);
  const previousView = summarizeReport(before);
  return {
    period: checked.value,
    previousPeriod: previous,
    branchId: filter.branchId,
    branchName,
    current: currentView,
    previous: previousView,
    comparison: compareReports(currentView.totals, previousView.totals),
    trend,
  };
}

/**
 * Tren bulanan dalam satu kali jalan (bukan satu perhitungan per bulan): tagihan dikelompokkan per bulan WITA di
 * basis data, pengeluaran per bulan satu query, dan pendapatan di muka diambil sekali untuk seluruh rentang lalu
 * dibagi per bulan menurut waktu verifikasi pertamanya.
 */
async function collectTrend(months: string[], branchId: string | null): Promise<TrendPoint[]> {
  const first = monthPeriod(months[0]);
  const last = monthPeriod(months[months.length - 1]);
  const { start } = periodInstants(first);
  const { end } = periodInstants(last);
  const [aggregates, expenses, upfront] = await Promise.all([
    invoiceAggregates(start, end, branchId, true),
    expensesByMonth(first.from, last.to, branchId),
    upfrontEntries(start, end, branchId ? { branchId } : {}),
  ]);
  const upfrontOf = new Map<string, { fee: number; online: number }>();
  for (const entry of upfront) {
    const month = witaDateString(entry.at).slice(0, 7);
    const current = upfrontOf.get(month) ?? { fee: 0, online: 0 };
    upfrontOf.set(month, { fee: current.fee + entry.fee, online: current.online + entry.online });
  }
  return months.map((month) => {
    const row = aggregates.find((aggregate) => aggregate.bucket === month);
    const amount = expenses.get(month) ?? 0;
    const view = summarizeReport({
      service: row?.service ?? 0,
      treatment: row?.treatment ?? 0,
      goods: row?.goods ?? 0,
      discount: row?.discount ?? 0,
      upfrontFee: upfrontOf.get(month)?.fee ?? 0,
      upfrontOnline: upfrontOf.get(month)?.online ?? 0,
      cogs: row?.cogs ?? 0,
      outstanding: 0,
      invoiceCount: row?.invoiceCount ?? 0,
      expenses: amount > 0 ? [{ categoryId: "tren", name: "Pengeluaran", isActive: true, amount }] : [],
      customerPaid: 0,
      supplierPaid: 0,
      supplierRefunded: 0,
    });
    return trendPoint(month, view);
  });
}

/** Pendapatan dan laba bersih bulan berjalan, semua cabang, untuk kotak dasbor. */
export async function getMonthProfit(now: Date = new Date()): Promise<{ month: string; revenue: number; netProfit: number }> {
  await requireCapability("profit:read");
  await ensureRecurringExpenses(witaDateString(now));
  const month = currentMonthOf(witaDateString(now));
  const view = summarizeReport(await collectReport(monthPeriod(month), null));
  return { month, revenue: view.totals.revenue, netProfit: view.totals.netProfit };
}
