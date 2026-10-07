import { prisma } from "@/lib/db";
import { isMonthString } from "@/lib/expense";
import { monthPeriod } from "@/lib/report";
import { dateOnly, dateOnlyString } from "@/lib/stock";
import { requireCapability } from "@/server/session";

export type ExpenseRow = {
  id: string;
  date: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  note: string | null;
  branchId: string | null;
  branchName: string | null;
  recurring: boolean;
  createdByName: string;
  voided: { at: Date; by: string; reason: string } | null;
};

/** Daftar pengeluaran satu bulan (spec laporan 7): tanggal turun; yang dibatalkan ikut dengan tandanya. */
export async function listExpenses(filter: { month: string; categoryId?: string; branchId?: string }): Promise<ExpenseRow[]> {
  await requireCapability("expense:manage");
  if (!isMonthString(filter.month)) return [];
  const period = monthPeriod(filter.month);
  const rows = await prisma.expense.findMany({
    where: {
      date: { gte: dateOnly(period.from), lte: dateOnly(period.to) },
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      date: true,
      categoryId: true,
      amount: true,
      note: true,
      branchId: true,
      recurringId: true,
      createdByName: true,
      voidedAt: true,
      voidedByName: true,
      voidReason: true,
      category: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    date: dateOnlyString(row.date),
    categoryId: row.categoryId,
    categoryName: row.category.name,
    amount: row.amount,
    note: row.note,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    recurring: row.recurringId !== null,
    createdByName: row.createdByName,
    voided: row.voidedAt ? { at: row.voidedAt, by: row.voidedByName ?? "", reason: row.voidReason ?? "" } : null,
  }));
}

export type CategoryRow = { id: string; name: string; isActive: boolean };

/** Kategori pengeluaran; bawaannya hanya yang aktif (untuk formulir). */
export async function listCategories(options: { includeInactive?: boolean } = {}): Promise<CategoryRow[]> {
  await requireCapability("expense:manage");
  return prisma.expenseCategory.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });
}
