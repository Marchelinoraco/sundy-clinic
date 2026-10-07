"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { validateCategoryName, validateExpense } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

function revalidateExpenses() {
  safeRevalidatePath("/admin/pengeluaran");
  safeRevalidatePath("/admin/laporan");
  safeRevalidatePath("/admin");
}

/** Catat satu pengeluaran (spec laporan 7, 9). Ringkasan audit memuat kategori dan nominal, bukan keterangan. */
export async function createExpense(input: {
  date: string;
  categoryId: string;
  amount: number;
  note?: string;
  branchId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const checked = validateExpense(input, { today: witaDateString(new Date()) });
    if (!checked.ok) throw new UserFacingError(checked.message);
    const data = checked.value;

    const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId }, select: { name: true, isActive: true } });
    if (!category || !category.isActive) throw new UserFacingError("Kategori tidak ditemukan atau sudah nonaktif.");
    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId }, select: { status: true } });
      if (!branch || branch.status !== "AKTIF") throw new UserFacingError("Cabang tidak ditemukan atau belum aktif.");
    }

    const created = await prisma.expense.create({
      data: {
        date: dateOnly(data.date),
        categoryId: data.categoryId,
        amount: data.amount,
        note: data.note,
        branchId: data.branchId,
        createdById: actor.staffId,
        createdByName: actor.name,
      },
      select: { id: true },
    });
    await recordAudit({
      actor,
      action: "expense.create",
      entity: "Expense",
      entityId: created.id,
      summary: `${category.name} ${formatRupiah(data.amount)}`,
    });
    revalidateExpenses();
    return { id: created.id };
  });
}

/** Batalkan pengeluaran salah catat (spec laporan 9): tidak dihapus, wajib beralasan, tidak bisa dua kali. */
export async function voidExpense(input: { id: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.id ?? "");

    const { count } = await prisma.expense.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidedByName: actor.name, voidReason: reason.value },
    });
    const row = await prisma.expense.findUnique({ where: { id }, select: { amount: true, category: { select: { name: true } } } });
    if (!row) throw new UserFacingError("Pengeluaran tidak ditemukan.");
    if (count === 0) throw new UserFacingError("Pengeluaran ini sudah dibatalkan.");

    await recordAudit({ actor, action: "expense.void", entity: "Expense", entityId: id, summary: `${row.category.name} ${formatRupiah(row.amount)}` });
    revalidateExpenses();
  });
}

export async function createExpenseCategory(input: { name: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const checked = validateCategoryName(input?.name);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const last = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
    try {
      const created = await prisma.expenseCategory.create({
        data: { name: checked.value, sortOrder: (last._max.sortOrder ?? 0) + 1 },
        select: { id: true },
      });
      await recordAudit({ actor, action: "expense-category.create", entity: "ExpenseCategory", entityId: created.id, summary: checked.value });
      revalidateExpenses();
      return { id: created.id };
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError("Kategori ini sudah ada.");
      throw error;
    }
  });
}

export async function setExpenseCategoryActive(input: { id: string; active: boolean }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const id = String(input?.id ?? "");
    const category = await prisma.expenseCategory.findUnique({ where: { id }, select: { name: true } });
    if (!category) throw new UserFacingError("Kategori tidak ditemukan.");
    const active = input.active === true;
    await prisma.expenseCategory.update({ where: { id }, data: { isActive: active } });
    await recordAudit({
      actor,
      action: "expense-category.update",
      entity: "ExpenseCategory",
      entityId: id,
      summary: `${category.name}: ${active ? "diaktifkan" : "dinonaktifkan"}`,
    });
    revalidateExpenses();
  });
}
