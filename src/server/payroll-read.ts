import { prisma } from "@/lib/db";
import { payrollTotal, worksInMonth } from "@/lib/payroll";
import { dateOnlyString } from "@/lib/stock";
import { adjustmentTotals, openCommissions, pendingCorrections } from "@/server/payroll-store";
import { requireCapability } from "@/server/session";

/** Bacaan menu Karyawan (spec karyawan 5–6). Semua fungsi memeriksa `payroll:manage`; kolom dipilih eksplisit. */
export type EmployeeRow = {
  id: string;
  name: string;
  position: string;
  branchId: string | null;
  branchName: string | null;
  joinedOn: string;
  nik: string | null;
  npwp: string | null;
  whatsapp: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  notes: string | null;
  baseSalary: number;
  allowance: number;
  status: "AKTIF" | "BERHENTI";
  leftOn: string | null;
  staffId: string | null;
  staffName: string | null;
};

export async function listEmployees(): Promise<EmployeeRow[]> {
  await requireCapability("payroll:manage");
  const rows = await prisma.employee.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, position: true, branchId: true, joinedOn: true, nik: true, npwp: true, whatsapp: true,
      bankName: true, bankAccount: true, bankHolder: true, notes: true, baseSalary: true, allowance: true, status: true, leftOn: true, staffId: true,
      branch: { select: { name: true } },
      staff: { select: { name: true } },
    },
  });
  return rows.map(({ branch, staff, joinedOn, leftOn, ...row }) => ({
    ...row,
    branchName: branch?.name ?? null,
    staffName: staff?.name ?? null,
    joinedOn: dateOnlyString(joinedOn),
    leftOn: leftOn ? dateOnlyString(leftOn) : null,
  }));
}

export async function listLinkableStaff(): Promise<{ id: string; name: string; employeeId: string | null }[]> {
  await requireCapability("payroll:manage");
  const rows = await prisma.staff.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, employee: { select: { id: true } } } });
  return rows.map((row) => ({ id: row.id, name: row.name, employeeId: row.employee?.id ?? null }));
}

export type PayrollItemRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  staffId: string | null;
  baseSalary: number;
  allowance: number;
  amountNote: string | null;
  commission: number;
  treatments: number;
  bonusTotal: number;
  deductionTotal: number;
  total: number;
  paidAt: string | null;
  paidByName: string | null;
  adjustments: { id: string; kind: "BONUS" | "POTONGAN"; amount: number; note: string; automatic: boolean }[];
};

const ITEM_SELECT = {
  id: true, employeeId: true, employeeName: true, position: true, baseSalary: true, allowance: true, amountNote: true,
  commission: true, treatments: true, bonusTotal: true, deductionTotal: true, total: true, paidAt: true, paidByName: true,
  employee: { select: { staffId: true } },
  adjustments: { orderBy: { createdAt: "asc" as const }, select: { id: true, kind: true, amount: true, note: true, invoiceLineId: true } },
} as const;

async function itemRows(month: string, items: Awaited<ReturnType<typeof loadItems>>): Promise<PayrollItemRow[]> {
  const unpaidStaff = items.filter((i) => !i.paidAt && i.employee.staffId).map((i) => i.employee.staffId!);
  const open = await openCommissions(prisma, unpaidStaff, month);
  // Koreksi yang muncul sesudah baris dibuat ikut tampil, sama dengan yang akan dicatat saat dibayar (review akhir, Important 1).
  const pending = await pendingCorrections(prisma, unpaidStaff);
  return items.map(({ employee, adjustments, paidAt, ...item }) => {
    const saved = adjustments.map((a) => ({ id: a.id, kind: a.kind, amount: a.amount, note: a.note, automatic: a.invoiceLineId !== null }));
    if (paidAt) return { ...item, staffId: employee.staffId, paidAt: dateOnlyString(paidAt), adjustments: saved };
    const virtual = (employee.staffId ? (pending.get(employee.staffId) ?? []) : []).map((c) => ({
      id: `koreksi-${c.lineId}`,
      kind: "POTONGAN" as const,
      amount: c.amount,
      note: c.note,
      automatic: true,
    }));
    const rows = [...saved, ...virtual];
    const live = employee.staffId ? open.get(employee.staffId) : undefined;
    const totals = adjustmentTotals(rows);
    const amounts = { baseSalary: item.baseSalary, allowance: item.allowance, commission: live?.commission ?? 0, ...totals };
    return { ...item, ...amounts, treatments: live?.treatments ?? 0, total: payrollTotal(amounts), staffId: employee.staffId, paidAt: null, adjustments: rows };
  });
}

function loadItems(periodId: string) {
  return prisma.payrollItem.findMany({ where: { periodId }, orderBy: { employeeName: "asc" }, select: ITEM_SELECT });
}

export async function getPayrollPeriod(month: string): Promise<{ month: string; items: PayrollItemRow[]; addable: { id: string; name: string }[] } | null> {
  await requireCapability("payroll:manage");
  const period = await prisma.payrollPeriod.findUnique({ where: { month }, select: { id: true, month: true } });
  if (!period) return null;
  const items = await itemRows(month, await loadItems(period.id));
  const present = new Set(items.map((i) => i.employeeId));
  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, joinedOn: true, status: true, leftOn: true } });
  const addable = employees
    .filter((e) => !present.has(e.id) && worksInMonth({ joinedOn: dateOnlyString(e.joinedOn), status: e.status, leftOn: e.leftOn ? dateOnlyString(e.leftOn) : null }, month))
    .map((e) => ({ id: e.id, name: e.name }));
  return { month: period.month, items, addable };
}

export type PeriodSummary = { month: string; employees: number; total: number; paid: number; unpaid: number };

export async function listPayrollPeriods(): Promise<PeriodSummary[]> {
  await requireCapability("payroll:manage");
  const periods = await prisma.payrollPeriod.findMany({ orderBy: { month: "desc" }, select: { id: true, month: true } });
  const summaries: PeriodSummary[] = [];
  for (const period of periods) {
    const items = await itemRows(period.month, await loadItems(period.id));
    const total = items.reduce((sum, i) => sum + i.total, 0);
    const paid = items.filter((i) => i.paidAt).reduce((sum, i) => sum + i.total, 0);
    summaries.push({ month: period.month, employees: items.length, total, paid, unpaid: total - paid });
  }
  return summaries;
}
