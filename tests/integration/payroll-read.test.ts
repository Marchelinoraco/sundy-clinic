// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getPayrollPeriod, listEmployees, listLinkableStaff, listPayrollPeriods } from "@/server/payroll-read";
import { openCommissions, syncCommissionCorrections } from "@/server/payroll-store";
import { cleanupPayrollWorld, commissionInvoice, createPayrollWorld, type PayrollWorld } from "./payroll-world";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Baca Gaji", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-gaji";
const WA = "6281200009720";
let world: PayrollWorld;

beforeAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2091");
  world = await createPayrollWorld(SLUG, WA);
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2091");
  await prisma.$disconnect();
});

describe("komisi terbuka dan bacaan penggajian", () => {
  it("komisi terbuka hanya dari tagihan FINAL yang belum diklaim, termasuk bulan sebelumnya", async () => {
    await commissionInvoice(world, 40_000, "FINAL", new Date("2026-05-10T03:00:00Z"));
    await commissionInvoice(world, 25_000);
    await commissionInvoice(world, 99_000, "DIBATALKAN");
    const open = await openCommissions(prisma, [world.therapistId], "2091-01");
    expect(open.get(world.therapistId)).toMatchObject({ commission: 65_000, treatments: 2 });
    expect(open.get(world.therapistId)!.lineIds).toHaveLength(2);
    expect((await openCommissions(prisma, [world.therapistId], "2026-04")).get(world.therapistId)).toBeUndefined();
  });

  it("baris penggajian belum dibayar menampilkan komisi terbuka dan total langsung", async () => {
    const period = await prisma.payrollPeriod.create({ data: { month: "2091-01", createdById: "s", createdByName: "Uji" } });
    const item = await prisma.payrollItem.create({ data: { periodId: period.id, employeeId: world.employeeId, employeeName: `${SLUG} Rina`, position: "Terapis", baseSalary: 3_000_000, allowance: 500_000 } });
    await prisma.payrollAdjustment.create({ data: { itemId: item.id, kind: "POTONGAN", amount: 100_000, note: "Kasbon", createdByName: "Uji" } });
    const detail = (await getPayrollPeriod("2091-01"))!;
    expect(detail.items.find((i) => i.id === item.id)).toMatchObject({ commission: 65_000, treatments: 2, deductionTotal: 100_000, total: 3_465_000, paidAt: null });
    expect((await listPayrollPeriods()).find((p) => p.month === "2091-01")).toMatchObject({ employees: 1, total: 3_465_000, paid: 0, unpaid: 3_465_000 });
    expect(await getPayrollPeriod("2091-12")).toBeNull();
  });

  it("koreksi komisi tagihan dibatalkan sesudah komisinya dibayar: sekali saja", async () => {
    const paidPeriod = await prisma.payrollPeriod.create({ data: { month: "2091-02", createdById: "s", createdByName: "Uji" } });
    const paidItem = await prisma.payrollItem.create({
      data: { periodId: paidPeriod.id, employeeId: world.employeeId, employeeName: "x", position: "x", baseSalary: 0, allowance: 0, paidAt: new Date("2091-02-28T00:00:00Z"), paidById: "s", paidByName: "Uji" },
    });
    const { invoiceId, lineId } = await commissionInvoice(world, 30_000);
    await prisma.invoiceLine.update({ where: { id: lineId }, data: { payrollItemId: paidItem.id } });
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "DIBATALKAN" } });

    const target = await prisma.payrollItem.findFirstOrThrow({ where: { period: { month: "2091-01" }, employeeId: world.employeeId } });
    await syncCommissionCorrections(prisma, { id: target.id, staffId: world.therapistId }, "Uji");
    await syncCommissionCorrections(prisma, { id: target.id, staffId: world.therapistId }, "Uji");
    const corrections = await prisma.payrollAdjustment.findMany({ where: { invoiceLineId: lineId } });
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ itemId: target.id, kind: "POTONGAN", amount: 30_000 });
    expect(corrections[0].note).toMatch(/^Koreksi komisi TG-2098-\S+ \(dibatalkan\)$/);
  });

  it("daftar karyawan dan staf yang bisa ditautkan; hanya Super Admin dan Admin Keuangan", async () => {
    const employee = (await listEmployees()).find((e) => e.id === world.employeeId)!;
    expect(employee).toMatchObject({ name: `${SLUG} Rina`, staffId: world.therapistId, status: "AKTIF", joinedOn: "2026-01-01", baseSalary: 3_000_000 });
    expect((await listLinkableStaff()).find((s) => s.id === world.therapistId)?.employeeId).toBe(world.employeeId);
    actor.role = "RESEPSIONIS";
    await expect(listEmployees()).rejects.toThrow("forbidden: payroll:manage");
    await expect(getPayrollPeriod("2091-01")).rejects.toThrow("forbidden: payroll:manage");
  });
});
