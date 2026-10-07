"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { currentMonthOf, validateRecurring, validateRecurringUpdate } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { ensureRecurringExpenses } from "@/server/expense-store";
import { requireCapability } from "@/server/session";

function revalidateRecurring() {
  safeRevalidatePath("/admin/pengeluaran");
  safeRevalidatePath("/admin/laporan");
  safeRevalidatePath("/admin");
}

/** Tambah templat berulang (spec laporan 5, 9). Catatan bulan yang sudah jatuh tempo langsung dibuat. */
export async function createRecurringExpense(input: {
  categoryId: string;
  amount: number;
  note?: string;
  branchId?: string | null;
  dayOfMonth: number;
  startMonth: string;
  endMonth?: string | null;
}): Promise<ActionResult<{ id: string; generated: number }>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const today = witaDateString(new Date());
    const checked = validateRecurring(input, { currentMonth: currentMonthOf(today) });
    if (!checked.ok) throw new UserFacingError(checked.message);
    const data = checked.value;

    const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId }, select: { name: true, isActive: true } });
    if (!category || !category.isActive) throw new UserFacingError("Kategori tidak ditemukan atau sudah nonaktif.");
    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId }, select: { status: true } });
      if (!branch || branch.status !== "AKTIF") throw new UserFacingError("Cabang tidak ditemukan atau belum aktif.");
    }

    const created = await prisma.recurringExpense.create({
      data: { ...data, createdById: actor.staffId, createdByName: actor.name },
      select: { id: true },
    });
    const generated = await ensureRecurringExpenses(today, prisma, created.id);
    await recordAudit({
      actor,
      action: "expense-recurring.create",
      entity: "RecurringExpense",
      entityId: created.id,
      summary: `${category.name} ${formatRupiah(data.amount)} tiap tanggal ${data.dayOfMonth}`,
    });
    revalidateRecurring();
    return { id: created.id, generated };
  });
}

/**
 * Ubah nominal, keterangan, tanggal, atau bulan berakhir templat. Bulan yang sudah jatuh tempo disusul lebih dulu
 * dengan nilai lama; perubahan hanya berlaku untuk bulan-bulan berikutnya (spec laporan 5).
 */
export async function updateRecurringExpense(input: {
  id: string;
  amount: number;
  note?: string;
  dayOfMonth: number;
  endMonth?: string | null;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const id = String(input?.id ?? "");
    const template = await prisma.recurringExpense.findUnique({
      where: { id },
      select: { isActive: true, startMonth: true, category: { select: { name: true } } },
    });
    if (!template) throw new UserFacingError("Templat tidak ditemukan.");
    if (!template.isActive) throw new UserFacingError("Templat ini sudah dihentikan.");
    const checked = validateRecurringUpdate(input, { startMonth: template.startMonth });
    if (!checked.ok) throw new UserFacingError(checked.message);

    await ensureRecurringExpenses(witaDateString(new Date()), prisma, id);
    const { count } = await prisma.recurringExpense.updateMany({ where: { id, isActive: true }, data: checked.value });
    if (count === 0) throw new UserFacingError("Templat ini sudah dihentikan.");
    await recordAudit({
      actor,
      action: "expense-recurring.update",
      entity: "RecurringExpense",
      entityId: id,
      summary: `${template.category.name} ${formatRupiah(checked.value.amount)} tiap tanggal ${checked.value.dayOfMonth}`,
    });
    revalidateRecurring();
  });
}

/** Hentikan templat: bulan yang sudah jatuh tempo disusul lebih dulu; catatan lama tetap. */
export async function stopRecurringExpense(input: { id: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const id = String(input?.id ?? "");
    const template = await prisma.recurringExpense.findUnique({ where: { id }, select: { isActive: true, amount: true, category: { select: { name: true } } } });
    if (!template) throw new UserFacingError("Templat tidak ditemukan.");
    if (!template.isActive) throw new UserFacingError("Templat ini sudah dihentikan.");

    await ensureRecurringExpenses(witaDateString(new Date()), prisma, id);
    const { count } = await prisma.recurringExpense.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
    if (count === 0) throw new UserFacingError("Templat ini sudah dihentikan.");
    await recordAudit({
      actor,
      action: "expense-recurring.stop",
      entity: "RecurringExpense",
      entityId: id,
      summary: `${template.category.name} ${formatRupiah(template.amount)}`,
    });
    revalidateRecurring();
  });
}
