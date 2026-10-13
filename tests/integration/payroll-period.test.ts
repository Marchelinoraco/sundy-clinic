// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  addPayrollAdjustment,
  addPayrollItem,
  createPayrollPeriod,
  deletePayrollPeriod,
  removePayrollAdjustment,
  removePayrollItem,
  updatePayrollAmounts,
} from "@/server/payroll-actions";
import { getPayrollPeriod } from "@/server/payroll-read";
import { cleanupPayrollWorld, createPayrollWorld, type PayrollWorld } from "./payroll-world";
import { unwrap } from "./unwrap";

type Role = "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Periode", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "periode-gaji";
const WA = "6281200009722";
let world: PayrollWorld;
let leftId: string;
let futureId: string;
const itemOf = async (month: string, employeeId: string) => prisma.payrollItem.findFirstOrThrow({ where: { period: { month }, employeeId } });

beforeAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2092");
  world = await createPayrollWorld(SLUG, WA);
  leftId = (await prisma.employee.create({ data: { name: `${SLUG} Keluar`, position: "Driver", joinedOn: new Date("2026-01-01T00:00:00Z"), status: "BERHENTI", leftOn: new Date("2091-12-31T00:00:00Z"), baseSalary: 1 } })).id;
  futureId = (await prisma.employee.create({ data: { name: `${SLUG} Baru`, position: "Driver", joinedOn: new Date("2093-01-01T00:00:00Z"), baseSalary: 1 } })).id;
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2092");
  await prisma.$disconnect();
});

describe("penggajian bulanan (spec karyawan 4)", () => {
  it("membuat penggajian untuk karyawan yang bekerja di bulan itu; bulan ganda ditolak (Review Focus 4)", async () => {
    await unwrap(createPayrollPeriod({ month: "2092-01" }));
    const ids = (await prisma.payrollItem.findMany({ where: { period: { month: "2092-01" } }, select: { employeeId: true } })).map((i) => i.employeeId);
    expect(ids).toContain(world.employeeId);
    expect(ids).not.toContain(leftId);
    expect(ids).not.toContain(futureId);
    expect(await itemOf("2092-01", world.employeeId)).toMatchObject({ employeeName: `${SLUG} Rina`, baseSalary: 3_000_000, allowance: 500_000 });
    expect(await createPayrollPeriod({ month: "2092-01" })).toEqual({ ok: false, error: "Penggajian bulan ini sudah ada." });
    expect(await createPayrollPeriod({ month: "2092-13" })).toEqual({ ok: false, error: "Pilih bulan." });
    expect(await addPayrollItem({ month: "2092-01", employeeId: futureId })).toEqual({ ok: false, error: "Karyawan ini tidak bekerja di bulan tersebut." });
    expect(await addPayrollItem({ month: "2092-01", employeeId: world.employeeId })).toEqual({ ok: false, error: "Karyawan ini sudah ada di penggajian bulan ini." });
  });

  it("menambah dan mengeluarkan karyawan dari daftar", async () => {
    const other = await prisma.employee.create({ data: { name: `${SLUG} Tambah`, position: "Driver", joinedOn: new Date("2026-01-01T00:00:00Z"), baseSalary: 1 } });
    expect((await getPayrollPeriod("2092-01"))!.addable.map((e) => e.id)).toContain(other.id);
    await unwrap(addPayrollItem({ month: "2092-01", employeeId: other.id }));
    const item = await itemOf("2092-01", other.id);
    await unwrap(removePayrollItem({ itemId: item.id }));
    expect(await prisma.payrollItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it("gaji bulan itu bisa diubah dengan alasan; bonus dan potongan ditambah dan dihapus", async () => {
    const item = await itemOf("2092-01", world.employeeId);
    expect(await updatePayrollAmounts({ itemId: item.id, baseSalary: 1_500_000, allowance: 500_000, note: "" })).toEqual({ ok: false, error: "Isi alasan perubahan gaji." });
    await unwrap(updatePayrollAmounts({ itemId: item.id, baseSalary: 1_500_000, allowance: 500_000, note: "Masuk tengah bulan" }));
    expect(await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ baseSalary: 1_500_000, amountNote: "Masuk tengah bulan" });
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "BONUS", amount: 250_000, note: "Bonus target" }));
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "POTONGAN", amount: 100_000, note: "Kasbon" }));
    const row = (await getPayrollPeriod("2092-01"))!.items.find((i) => i.id === item.id)!;
    expect(row).toMatchObject({ bonusTotal: 250_000, deductionTotal: 100_000, total: 2_150_000 });
    await unwrap(removePayrollAdjustment({ adjustmentId: row.adjustments[1].id }));
    expect((await getPayrollPeriod("2092-01"))!.items.find((i) => i.id === item.id)!.deductionTotal).toBe(0);
  });

  it("koreksi otomatis tidak bisa dihapus; baris dibayar tidak bisa diubah; penggajian yang pernah dibayar tidak bisa dihapus", async () => {
    const item = await itemOf("2092-01", world.employeeId);
    const auto = await prisma.payrollAdjustment.create({ data: { itemId: item.id, kind: "POTONGAN", amount: 1, note: "Koreksi komisi uji", invoiceLineId: `uji-${item.id}`, createdByName: "Uji" } });
    expect(await removePayrollAdjustment({ adjustmentId: auto.id })).toEqual({ ok: false, error: "Koreksi otomatis tidak bisa dihapus." });
    await prisma.payrollAdjustment.delete({ where: { id: auto.id } });

    await prisma.payrollItem.update({ where: { id: item.id }, data: { paidAt: new Date("2092-01-31T00:00:00Z"), paidById: "s", paidByName: "Uji" } });
    expect(await addPayrollAdjustment({ itemId: item.id, kind: "BONUS", amount: 1, note: "Telat" })).toEqual({ ok: false, error: "Baris yang sudah dibayar tidak bisa diubah." });
    expect(await removePayrollItem({ itemId: item.id })).toEqual({ ok: false, error: "Baris yang sudah dibayar tidak bisa diubah." });
    expect(await deletePayrollPeriod({ month: "2092-01" })).toEqual({ ok: false, error: "Penggajian yang pernah dibayar tidak bisa dihapus." });

    await unwrap(createPayrollPeriod({ month: "2092-02" }));
    await unwrap(deletePayrollPeriod({ month: "2092-02" }));
    expect(await prisma.payrollPeriod.findUnique({ where: { month: "2092-02" } })).toBeNull();
  });

  it("Resepsionis ditolak", async () => {
    actor.role = "RESEPSIONIS";
    await expect(createPayrollPeriod({ month: "2092-03" })).rejects.toThrow("forbidden: payroll:manage");
  });
});
