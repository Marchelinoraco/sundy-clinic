"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { isMonthString } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { validateAdjustment, validateAmounts, validateEmployee, worksInMonth, type AdjustmentInput, type EmployeeInput } from "@/lib/payroll";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, dateOnlyString, isDateString } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { syncCommissionCorrections } from "@/server/payroll-store";
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
