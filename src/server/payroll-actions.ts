"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { isMonthString } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import {
  expenseSplit,
  payrollTotal,
  PAYROLL_COMMISSION_CATEGORY,
  PAYROLL_SALARY_CATEGORY,
  validateAdjustment,
  validateAmounts,
  validateEmployee,
  worksInMonth,
  type AdjustmentInput,
  type EmployeeInput,
} from "@/lib/payroll";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, dateOnlyString, isDateString, validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { adjustmentTotals, lockEmployee, openCommissions, syncCommissionCorrections } from "@/server/payroll-store";
import { requireCapability } from "@/server/session";

const EMPLOYEE_NOT_FOUND = "Karyawan tidak ditemukan.";
const STAFF_TAKEN = "Staf ini sudah ditautkan ke karyawan lain.";

function revalidatePayroll(month?: string) {
  safeRevalidatePath("/admin/karyawan");
  if (month) safeRevalidatePath(`/admin/karyawan/penggajian/${month}`);
  safeRevalidatePath("/admin/pengeluaran");
  safeRevalidatePath("/admin/laporan");
  safeRevalidatePath("/admin");
}

async function checkEmployeeLinks(value: EmployeeInput) {
  if (value.branchId && !(await prisma.branch.findUnique({ where: { id: value.branchId }, select: { id: true } }))) throw new UserFacingError("Cabang tidak ditemukan.");
  if (value.staffId && !(await prisma.staff.findUnique({ where: { id: value.staffId }, select: { id: true } }))) throw new UserFacingError("Staf tidak ditemukan.");
}

async function staffGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError(STAFF_TAKEN);
    throw error;
  }
}

/** Ringkasan audit tanpa NIK, NPWP, atau rekening (spec karyawan 6). */
const employeeSummary = (v: EmployeeInput) => `${v.name} (${v.position}): gaji ${formatRupiah(v.baseSalary)} + tunjangan ${formatRupiah(v.allowance)}`;

export async function createEmployee(input: EmployeeInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const checked = validateEmployee(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    await checkEmployeeLinks(value);
    const created = await staffGuard(() => prisma.employee.create({ data: { ...value, joinedOn: dateOnly(value.joinedOn) }, select: { id: true } }));
    await recordAudit({ actor, action: "employee.create", entity: "Employee", entityId: created.id, summary: employeeSummary(value) });
    revalidatePayroll();
    return { id: created.id };
  });
}

export async function updateEmployee(input: { id: string } & EmployeeInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const checked = validateEmployee(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    const before = await prisma.employee.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true } });
    if (!before) throw new UserFacingError(EMPLOYEE_NOT_FOUND);
    await checkEmployeeLinks(value);
    await staffGuard(() => prisma.employee.update({ where: { id: before.id }, data: { ...value, joinedOn: dateOnly(value.joinedOn) } }));
    await recordAudit({ actor, action: "employee.update", entity: "Employee", entityId: before.id, summary: employeeSummary(value) });
    revalidatePayroll();
  });
}

export async function setEmployeeStatus(input: { id: string; status: "AKTIF" | "BERHENTI"; leftOn?: string | null }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const employee = await prisma.employee.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true, name: true, joinedOn: true } });
    if (!employee) throw new UserFacingError(EMPLOYEE_NOT_FOUND);
    if (input?.status === "BERHENTI") {
      if (!isDateString(input.leftOn)) throw new UserFacingError("Isi tanggal keluar.");
      if (dateOnly(input.leftOn) < employee.joinedOn) throw new UserFacingError("Tanggal keluar tidak boleh sebelum tanggal masuk.");
      await prisma.employee.update({ where: { id: employee.id }, data: { status: "BERHENTI", leftOn: dateOnly(input.leftOn) } });
      await recordAudit({ actor, action: "employee.status", entity: "Employee", entityId: employee.id, summary: `${employee.name}: berhenti per ${input.leftOn}` });
    } else if (input?.status === "AKTIF") {
      await prisma.employee.update({ where: { id: employee.id }, data: { status: "AKTIF", leftOn: null } });
      await recordAudit({ actor, action: "employee.status", entity: "Employee", entityId: employee.id, summary: `${employee.name}: aktif kembali` });
    } else {
      throw new UserFacingError("Data tidak sah. Muat ulang halaman lalu coba lagi.");
    }
    revalidatePayroll();
  });
}

const PERIOD_NOT_FOUND = "Penggajian tidak ditemukan.";
const ITEM_NOT_FOUND = "Baris penggajian tidak ditemukan.";
const ITEM_PAID = "Baris yang sudah dibayar tidak bisa diubah.";

const workRecord = (e: { joinedOn: Date; status: "AKTIF" | "BERHENTI"; leftOn: Date | null }) => ({
  joinedOn: dateOnlyString(e.joinedOn),
  status: e.status,
  leftOn: e.leftOn ? dateOnlyString(e.leftOn) : null,
});

/** Baris belum dibayar beserta bulan dan staf tertautnya; selain itu galat yang bisa dibaca pengguna. */
async function unpaidItem(itemId: unknown) {
  const item = await prisma.payrollItem.findUnique({
    where: { id: String(itemId ?? "") },
    select: { id: true, paidAt: true, employeeName: true, period: { select: { month: true } }, employee: { select: { baseSalary: true, allowance: true, staffId: true } } },
  });
  if (!item) throw new UserFacingError(ITEM_NOT_FOUND);
  if (item.paidAt) throw new UserFacingError(ITEM_PAID);
  return item;
}

export async function createPayrollPeriod(input: { month: string }): Promise<ActionResult<{ month: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const month = input?.month;
    if (!isMonthString(month)) throw new UserFacingError("Pilih bulan.");
    const employees = await prisma.employee.findMany({
      select: { id: true, name: true, position: true, baseSalary: true, allowance: true, joinedOn: true, status: true, leftOn: true, staffId: true },
    });
    const working = employees.filter((e) => worksInMonth(workRecord(e), month));
    try {
      await prisma.$transaction(async (tx) => {
        const period = await tx.payrollPeriod.create({ data: { month, createdById: actor.staffId, createdByName: actor.name }, select: { id: true } });
        for (const e of working) {
          const item = await tx.payrollItem.create({
            data: { periodId: period.id, employeeId: e.id, employeeName: e.name, position: e.position, baseSalary: e.baseSalary, allowance: e.allowance },
            select: { id: true },
          });
          await syncCommissionCorrections(tx, { id: item.id, staffId: e.staffId }, actor.name);
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError("Penggajian bulan ini sudah ada.");
      throw error;
    }
    await recordAudit({ actor, action: "payroll.create", entity: "PayrollPeriod", entityId: month, summary: `Penggajian ${month}: ${working.length} karyawan` });
    revalidatePayroll(month);
    return { month };
  });
}

export async function deletePayrollPeriod(input: { month: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const period = await prisma.payrollPeriod.findUnique({ where: { month: String(input?.month ?? "") }, select: { id: true, month: true, items: { select: { paidAt: true, voidedPayments: true } } } });
    if (!period) throw new UserFacingError(PERIOD_NOT_FOUND);
    if (period.items.some((i) => i.paidAt || i.voidedPayments > 0)) throw new UserFacingError("Penggajian yang pernah dibayar tidak bisa dihapus.");
    await prisma.$transaction([prisma.payrollItem.deleteMany({ where: { periodId: period.id } }), prisma.payrollPeriod.delete({ where: { id: period.id } })]);
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollPeriod", entityId: period.month, summary: `Penggajian ${period.month} dihapus` });
    revalidatePayroll(period.month);
  });
}

export async function addPayrollItem(input: { month: string; employeeId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const period = await prisma.payrollPeriod.findUnique({ where: { month: String(input?.month ?? "") }, select: { id: true, month: true } });
    if (!period) throw new UserFacingError(PERIOD_NOT_FOUND);
    const e = await prisma.employee.findUnique({
      where: { id: String(input?.employeeId ?? "") },
      select: { id: true, name: true, position: true, baseSalary: true, allowance: true, joinedOn: true, status: true, leftOn: true, staffId: true },
    });
    if (!e) throw new UserFacingError(EMPLOYEE_NOT_FOUND);
    if (!worksInMonth(workRecord(e), period.month)) throw new UserFacingError("Karyawan ini tidak bekerja di bulan tersebut.");
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.payrollItem.create({
          data: { periodId: period.id, employeeId: e.id, employeeName: e.name, position: e.position, baseSalary: e.baseSalary, allowance: e.allowance },
          select: { id: true },
        });
        await syncCommissionCorrections(tx, { id: item.id, staffId: e.staffId }, actor.name);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError("Karyawan ini sudah ada di penggajian bulan ini.");
      throw error;
    }
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollPeriod", entityId: period.month, summary: `Tambah ${e.name} ke penggajian ${period.month}` });
    revalidatePayroll(period.month);
  });
}

export async function removePayrollItem(input: { itemId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const item = await unpaidItem(input?.itemId);
    await prisma.payrollItem.delete({ where: { id: item.id } });
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollItem", entityId: item.id, summary: `Keluarkan ${item.employeeName} dari penggajian ${item.period.month}` });
    revalidatePayroll(item.period.month);
  });
}

export async function updatePayrollAmounts(input: { itemId: string; baseSalary: number; allowance: number; note: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const item = await unpaidItem(input?.itemId);
    const checked = validateAmounts(input, { baseSalary: item.employee.baseSalary, allowance: item.employee.allowance });
    if (!checked.ok) throw new UserFacingError(checked.message);
    await prisma.payrollItem.update({ where: { id: item.id }, data: { baseSalary: checked.value.baseSalary, allowance: checked.value.allowance, amountNote: checked.value.note } });
    await recordAudit({
      actor,
      action: "payroll.update",
      entity: "PayrollItem",
      entityId: item.id,
      summary: `${item.employeeName} ${item.period.month}: gaji ${formatRupiah(checked.value.baseSalary)} + tunjangan ${formatRupiah(checked.value.allowance)}`,
    });
    revalidatePayroll(item.period.month);
  });
}

export async function addPayrollAdjustment(input: { itemId: string } & AdjustmentInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const item = await unpaidItem(input?.itemId);
    const checked = validateAdjustment(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    await prisma.payrollAdjustment.create({ data: { itemId: item.id, ...checked.value, createdByName: actor.name } });
    const sign = checked.value.kind === "BONUS" ? "+" : "−";
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollItem", entityId: item.id, summary: `${item.employeeName} ${item.period.month}: ${checked.value.note} ${sign}${formatRupiah(checked.value.amount)}` });
    revalidatePayroll(item.period.month);
  });
}

export async function removePayrollAdjustment(input: { adjustmentId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const adjustment = await prisma.payrollAdjustment.findUnique({ where: { id: String(input?.adjustmentId ?? "") }, select: { id: true, itemId: true, note: true, invoiceLineId: true } });
    if (!adjustment) throw new UserFacingError("Penyesuaian tidak ditemukan.");
    const item = await unpaidItem(adjustment.itemId);
    if (adjustment.invoiceLineId) throw new UserFacingError("Koreksi otomatis tidak bisa dihapus.");
    await prisma.payrollAdjustment.delete({ where: { id: adjustment.id } });
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollItem", entityId: item.id, summary: `${item.employeeName} ${item.period.month}: hapus ${adjustment.note}` });
    revalidatePayroll(item.period.month);
  });
}

/** Kategori pengeluaran penggajian; dibuat bila belum ada (nama dibandingkan tanpa huruf besar/kecil). */
async function ensureCategory(name: string): Promise<string> {
  const find = () => prisma.expenseCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  const found = await find();
  if (found) return found.id;
  const last = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
  try {
    return (await prisma.expenseCategory.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 }, select: { id: true } })).id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await find())!.id;
  }
}

export async function payPayrollItem(input: { itemId: string; paidOn: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    if (!isDateString(input?.paidOn)) throw new UserFacingError("Isi tanggal bayar.");
    if (input.paidOn > witaDateString(new Date())) throw new UserFacingError("Tanggal bayar tidak boleh di masa depan.");
    const head = await prisma.payrollItem.findUnique({ where: { id: String(input?.itemId ?? "") }, select: { id: true, employeeId: true } });
    if (!head) throw new UserFacingError(ITEM_NOT_FOUND);
    const [salaryCategoryId, commissionCategoryId] = [await ensureCategory(PAYROLL_SALARY_CATEGORY), await ensureCategory(PAYROLL_COMMISSION_CATEGORY)];

    const summary = await prisma.$transaction(async (tx) => {
      await lockEmployee(tx, head.employeeId);
      const item = await tx.payrollItem.findUniqueOrThrow({
        where: { id: head.id },
        select: { id: true, paidAt: true, employeeName: true, baseSalary: true, allowance: true, period: { select: { month: true } }, employee: { select: { staffId: true, branchId: true } } },
      });
      if (item.paidAt) throw new UserFacingError(ITEM_PAID);
      await syncCommissionCorrections(tx, { id: item.id, staffId: item.employee.staffId }, actor.name);
      const adjustments = await tx.payrollAdjustment.findMany({ where: { itemId: item.id }, select: { kind: true, amount: true } });
      const open = item.employee.staffId ? (await openCommissions(tx, [item.employee.staffId], item.period.month)).get(item.employee.staffId) : undefined;
      const amounts = { baseSalary: item.baseSalary, allowance: item.allowance, commission: open?.commission ?? 0, ...adjustmentTotals(adjustments) };
      const total = payrollTotal(amounts);
      if (total < 0) throw new UserFacingError("Potongan melebihi gaji.");
      const split = expenseSplit(amounts);
      const note = `Penggajian ${item.period.month} · ${item.employeeName}`;
      const expense = (categoryId: string, amount: number) =>
        amount > 0
          ? tx.expense.create({
              data: { date: dateOnly(input.paidOn), categoryId, amount, note, branchId: item.employee.branchId, createdById: actor.staffId, createdByName: actor.name },
              select: { id: true },
            })
          : Promise.resolve(null);
      const salaryExpense = await expense(salaryCategoryId, split.salary);
      const commissionExpense = await expense(commissionCategoryId, split.commission);

      if (open && open.lineIds.length > 0) {
        const { count } = await tx.invoiceLine.updateMany({ where: { id: { in: open.lineIds }, payrollItemId: null }, data: { payrollItemId: item.id } });
        if (count !== open.lineIds.length) throw new UserFacingError("Komisi berubah saat diproses. Coba lagi.");
      }
      await tx.payrollItem.update({
        where: { id: item.id },
        data: {
          ...amounts,
          treatments: open?.treatments ?? 0,
          total,
          paidAt: dateOnly(input.paidOn),
          paidById: actor.staffId,
          paidByName: actor.name,
          salaryExpenseId: salaryExpense?.id ?? null,
          commissionExpenseId: commissionExpense?.id ?? null,
        },
      });
      return { name: item.employeeName, month: item.period.month, total };
    });

    await recordAudit({ actor, action: "payroll.pay", entity: "PayrollItem", entityId: head.id, summary: `${summary.name} ${summary.month}: ${formatRupiah(summary.total)}` });
    revalidatePayroll(summary.month);
  });
}

export async function voidPayrollPayment(input: { itemId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const head = await prisma.payrollItem.findUnique({ where: { id: String(input?.itemId ?? "") }, select: { id: true, employeeId: true } });
    if (!head) throw new UserFacingError(ITEM_NOT_FOUND);

    const summary = await prisma.$transaction(async (tx) => {
      await lockEmployee(tx, head.employeeId);
      const item = await tx.payrollItem.findUniqueOrThrow({
        where: { id: head.id },
        select: { id: true, paidAt: true, employeeName: true, total: true, salaryExpenseId: true, commissionExpenseId: true, period: { select: { month: true } } },
      });
      if (!item.paidAt) throw new UserFacingError("Baris ini belum dibayar.");
      const expenseIds = [item.salaryExpenseId, item.commissionExpenseId].filter((id): id is string => id !== null);
      await tx.expense.updateMany({
        where: { id: { in: expenseIds }, voidedAt: null },
        data: { voidedAt: new Date(), voidedByName: actor.name, voidReason: `Pembatalan penggajian: ${reason.value}` },
      });
      const claimed = (await tx.invoiceLine.findMany({ where: { payrollItemId: item.id }, select: { id: true } })).map((l) => l.id);
      // Koreksi yang lahir dari klaim ini dan belum dibayar tidak berlaku lagi (Review Focus 3).
      await tx.payrollAdjustment.deleteMany({ where: { invoiceLineId: { in: claimed }, item: { paidAt: null } } });
      await tx.invoiceLine.updateMany({ where: { payrollItemId: item.id }, data: { payrollItemId: null } });
      await tx.payrollItem.update({
        where: { id: item.id },
        data: {
          paidAt: null,
          paidById: null,
          paidByName: null,
          salaryExpenseId: null,
          commissionExpenseId: null,
          commission: 0,
          treatments: 0,
          bonusTotal: 0,
          deductionTotal: 0,
          total: 0,
          voidedPayments: { increment: 1 },
        },
      });
      return { name: item.employeeName, month: item.period.month, total: item.total };
    });

    await recordAudit({ actor, action: "payroll.void", entity: "PayrollItem", entityId: head.id, summary: `${summary.name} ${summary.month}: ${formatRupiah(summary.total)} — ${reason.value}` });
    revalidatePayroll(summary.month);
  });
}
