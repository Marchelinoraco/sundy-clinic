import { prisma } from "@/lib/db";
import { currentMonthOf } from "@/lib/expense";
import { discountAmount, invoiceTotals } from "@/lib/invoice";
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

  const [invoices, expenseGroups, upfront, customerPaid, supplierGroups] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: "FINAL", finalizedAt: { gte: start, lt: end }, ...branch },
      select: {
        status: true,
        discountKind: true,
        discountValue: true,
        lines: { select: { kind: true, quantity: true, unitPrice: true, stockUses: { select: { quantity: true, unitCost: true } } } },
        payments: { select: { amount: true, revokedAt: true } },
      },
    }),
    prisma.expense.groupBy({ by: ["categoryId"], where: { voidedAt: null, date: dates, ...branch }, _sum: { amount: true } }),
    upfrontFor(start, end, branch),
    prisma.invoicePayment.aggregate({ where: { revokedAt: null, paidAt: dates, invoice: branch }, _sum: { amount: true } }),
    prisma.supplierPayment.groupBy({ by: ["kind"], where: { revokedAt: null, paidAt: dates, invoice: branch }, _sum: { amount: true } }),
  ]);

  const raw: RawReport = {
    service: 0,
    treatment: 0,
    goods: 0,
    discount: 0,
    upfrontFee: upfront.fee,
    upfrontOnline: upfront.online,
    cogs: 0,
    outstanding: 0,
    invoiceCount: invoices.length,
    expenses: [],
    customerPaid: customerPaid._sum.amount ?? 0,
    supplierPaid: supplierGroups.find((g) => g.kind === "BAYAR")?._sum.amount ?? 0,
    supplierRefunded: supplierGroups.find((g) => g.kind === "PENGEMBALIAN")?._sum.amount ?? 0,
  };

  for (const invoice of invoices) {
    let subtotal = 0;
    for (const line of invoice.lines) {
      const amount = line.quantity * line.unitPrice;
      subtotal += amount;
      if (line.kind === "LAYANAN") raw.service += amount;
      else if (line.kind === "TREATMENT") raw.treatment += amount;
      else raw.goods += amount;
      for (const use of line.stockUses) raw.cogs += use.quantity * use.unitCost;
    }
    raw.discount += discountAmount(subtotal, invoice.discountKind, invoice.discountValue);
    raw.outstanding += Math.max(0, invoiceTotals(invoice).balance);
  }

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
 */
async function upfrontFor(start: Date, end: Date, branch: { branchId?: string }): Promise<{ fee: number; online: number }> {
  const inRange = await prisma.auditLog.findMany({
    where: { action: "appointment.verify", entity: "Appointment", createdAt: { gte: start, lt: end } },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  if (inRange.length === 0) return { fee: 0, online: 0 };
  const earliest = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: { action: "appointment.verify", entity: "Appointment", entityId: { in: inRange.map((row) => row.entityId) } },
    _min: { createdAt: true },
  });
  const firstHere = earliest
    .filter((row) => row._min.createdAt !== null && row._min.createdAt >= start && row._min.createdAt < end)
    .map((row) => row.entityId);
  if (firstHere.length === 0) return { fee: 0, online: 0 };
  const appointments = await prisma.appointment.findMany({
    where: { id: { in: firstHere }, ...branch },
    select: { bookingFee: true, servicePrice: true, channel: true },
  });
  let fee = 0;
  let online = 0;
  for (const appointment of appointments) {
    fee += appointment.bookingFee ?? 0;
    if (appointment.channel === "ONLINE") online += appointment.servicePrice ?? 0;
  }
  return { fee, online };
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
  const [current, before, ...monthly] = await Promise.all([
    collectReport(checked.value, filter.branchId),
    collectReport(previous, filter.branchId),
    ...months.map((month) => collectReport(monthPeriod(month), filter.branchId)),
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
    trend: months.map((month, index) => trendPoint(month, summarizeReport(monthly[index]))),
  };
}

/** Pendapatan dan laba bersih bulan berjalan, semua cabang, untuk kotak dasbor. */
export async function getMonthProfit(now: Date = new Date()): Promise<{ month: string; revenue: number; netProfit: number }> {
  await requireCapability("profit:read");
  await ensureRecurringExpenses(witaDateString(now));
  const month = currentMonthOf(witaDateString(now));
  const view = summarizeReport(await collectReport(monthPeriod(month), null));
  return { month, revenue: view.totals.revenue, netProfit: view.totals.netProfit };
}
