// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const NAME = "Skema Gaji Uji";
let employeeId: string;

beforeAll(async () => {
  await prisma.payrollPeriod.deleteMany({ where: { month: "2090-01" } });
  await prisma.employee.deleteMany({ where: { name: { startsWith: NAME } } });
  employeeId = (await prisma.employee.create({ data: { name: NAME, position: "Perawat", joinedOn: new Date("2026-01-05T00:00:00Z"), baseSalary: 3_000_000 } })).id;
});
afterAll(async () => {
  await prisma.payrollItem.deleteMany({ where: { employeeId } });
  await prisma.payrollPeriod.deleteMany({ where: { month: "2090-01" } });
  await prisma.employee.deleteMany({ where: { name: { startsWith: NAME } } });
  await prisma.$disconnect();
});

describe("skema penggajian", () => {
  it("karyawan: nominal tidak negatif, berhenti wajib bertanggal keluar", async () => {
    const set = (data: Record<string, unknown>) => prisma.employee.update({ where: { id: employeeId }, data });
    await expect(set({ baseSalary: -1 })).rejects.toThrow(/employee_values/);
    await expect(set({ status: "BERHENTI" })).rejects.toThrow(/employee_values/);
    await expect(set({ leftOn: new Date("2026-02-01T00:00:00Z") })).rejects.toThrow(/employee_values/);
    expect((await set({ status: "BERHENTI", leftOn: new Date("2026-02-01T00:00:00Z") })).status).toBe("BERHENTI");
    await set({ status: "AKTIF", leftOn: null });
  });

  it("baris penggajian: total tidak negatif, satu karyawan sekali per bulan, penyesuaian lebih dari 0", async () => {
    const period = await prisma.payrollPeriod.create({ data: { month: "2090-01", createdById: "s", createdByName: "Uji" } });
    const base = { periodId: period.id, employeeId, employeeName: NAME, position: "Perawat", baseSalary: 1, allowance: 0 };
    await expect(prisma.payrollItem.create({ data: { ...base, total: -1 } })).rejects.toThrow(/payroll_item_values/);
    await expect(prisma.payrollItem.create({ data: { ...base, paidAt: new Date("2090-01-31T00:00:00Z") } })).rejects.toThrow(/payroll_item_values/);
    const item = await prisma.payrollItem.create({ data: base });
    await expect(prisma.payrollItem.create({ data: base })).rejects.toThrow();
    await expect(prisma.payrollAdjustment.create({ data: { itemId: item.id, kind: "BONUS", amount: 0, note: "Nol", createdByName: "Uji" } })).rejects.toThrow(/payroll_adjustment_amount/);
  });
});
