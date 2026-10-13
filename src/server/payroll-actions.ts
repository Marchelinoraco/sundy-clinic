"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { validateEmployee, type EmployeeInput } from "@/lib/payroll";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, isDateString } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
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
