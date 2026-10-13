// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { voidExpense } from "@/server/expense-actions";
import { addPayrollAdjustment, createPayrollPeriod, payPayrollItem, removePayrollItem, voidPayrollPayment } from "@/server/payroll-actions";
import { getPayrollPeriod } from "@/server/payroll-read";
import { expensesByMonth } from "@/server/report-sql";
import { cleanupPayrollWorld, commissionInvoice, createPayrollWorld, type PayrollWorld } from "./payroll-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Bayar", role: "ADMIN_KEUANGAN" as const, email: "u@uji.test" } }));
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

const SLUG = "bayar-gaji";
const WA = "6281200009723";
const today = witaDateString(new Date());
let world: PayrollWorld;
const itemOf = async (month: string) => prisma.payrollItem.findFirstOrThrow({ where: { period: { month }, employeeId: world.employeeId } });

beforeAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2093");
  world = await createPayrollWorld(SLUG, WA);
});
beforeEach(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2093");
  world = await createPayrollWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2093");
  await prisma.$disconnect();
});

describe("tandai dibayar (spec karyawan 4.3)", () => {
  it("mengunci nominal, mengklaim komisi, dan mencatat Pengeluaran Gaji Karyawan dan Komisi yang masuk laba rugi", async () => {
    const { lineId } = await commissionInvoice(world, 400_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "POTONGAN", amount: 200_000, note: "Kasbon" }));
    const before = (await expensesByMonth(today, today, null)).get(today.slice(0, 7)) ?? 0;

    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    const paid = await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id }, include: { salaryExpense: { include: { category: true } }, commissionExpense: { include: { category: true } } } });
    expect(paid).toMatchObject({ commission: 400_000, treatments: 1, deductionTotal: 200_000, total: 3_700_000, paidByName: "Keuangan Bayar" });
    expect(paid.salaryExpense).toMatchObject({ amount: 3_300_000, branchId: world.branchId, note: `Penggajian 2093-01 · ${SLUG} Rina`, category: { name: "Gaji Karyawan" } });
    expect(paid.commissionExpense).toMatchObject({ amount: 400_000, category: { name: "Komisi" } });
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: lineId } })).payrollItemId).toBe(item.id);
    expect((await expensesByMonth(today, today, null)).get(today.slice(0, 7))).toBe(before + 3_700_000);
    expect(await payPayrollItem({ itemId: item.id, paidOn: today })).toEqual({ ok: false, error: "Baris yang sudah dibayar tidak bisa diubah." });
  });

  it("komisi yang sudah dibayar tidak terhitung lagi di bulan berikutnya", async () => {
    await commissionInvoice(world, 50_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    await unwrap(payPayrollItem({ itemId: (await itemOf("2093-01")).id, paidOn: today }));
    await unwrap(createPayrollPeriod({ month: "2093-02" }));
    await unwrap(payPayrollItem({ itemId: (await itemOf("2093-02")).id, paidOn: today }));
    expect((await itemOf("2093-02")).commission).toBe(0);
  });

  it("dua pembayaran bersamaan di dua bulan: komisi hanya terbayar sekali (Review Focus 1)", async () => {
    await commissionInvoice(world, 70_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    await unwrap(createPayrollPeriod({ month: "2093-02" }));
    const [a, b] = [await itemOf("2093-01"), await itemOf("2093-02")];
    const results = await Promise.all([payPayrollItem({ itemId: a.id, paidOn: today }), payPayrollItem({ itemId: b.id, paidOn: today })]);
    expect(results.every((r) => r.ok)).toBe(true);
    const commissions = [(await itemOf("2093-01")).commission, (await itemOf("2093-02")).commission].sort();
    expect(commissions).toEqual([0, 70_000]);
  });

  it("menolak tanggal masa depan dan total negatif", async () => {
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    expect(await payPayrollItem({ itemId: item.id, paidOn: "2999-01-01" })).toEqual({ ok: false, error: "Tanggal bayar tidak boleh di masa depan." });
    expect(await payPayrollItem({ itemId: item.id, paidOn: "" })).toEqual({ ok: false, error: "Isi tanggal bayar." });
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "POTONGAN", amount: 4_000_000, note: "Kasbon besar" }));
    expect(await payPayrollItem({ itemId: item.id, paidOn: today })).toEqual({ ok: false, error: "Potongan melebihi gaji." });
  });

  it("potongan melebihi gaji tetapi tertutup komisi: tanpa pengeluaran negatif (Review Focus 2)", async () => {
    await commissionInvoice(world, 1_000_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "POTONGAN", amount: 3_800_000, note: "Kasbon besar" }));
    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    const paid = await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id }, include: { salaryExpense: true, commissionExpense: true } });
    expect(paid.total).toBe(700_000);
    expect(paid.salaryExpense).toBeNull();
    expect(paid.commissionExpense?.amount).toBe(700_000);
  });
});

describe("batalkan pembayaran (spec karyawan 4.4)", () => {
  it("membatalkan pengeluaran dan melepas klaim komisi; baris bisa dibayar lagi", async () => {
    const { lineId } = await commissionInvoice(world, 60_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    const paid = await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } });

    expect(await voidPayrollPayment({ itemId: item.id, reason: "" })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(voidPayrollPayment({ itemId: item.id, reason: "Salah nominal" }));
    expect(await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ paidAt: null, commission: 0, total: 0, salaryExpenseId: null, commissionExpenseId: null, voidedPayments: 1 });
    for (const id of [paid.salaryExpenseId!, paid.commissionExpenseId!]) {
      expect(await prisma.expense.findUniqueOrThrow({ where: { id } })).toMatchObject({ voidReason: "Pembatalan penggajian: Salah nominal" });
    }
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: lineId } })).payrollItemId).toBeNull();
    expect(await voidPayrollPayment({ itemId: item.id, reason: "Lagi" })).toEqual({ ok: false, error: "Baris ini belum dibayar." });
    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    expect((await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } })).commission).toBe(60_000);
  });

  it("koreksi tagihan dibatalkan muncul sekali di bulan berikutnya, dan hilang bila pembayaran asalnya dibatalkan (Review Focus 3)", async () => {
    const { invoiceId, lineId } = await commissionInvoice(world, 80_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const january = await itemOf("2093-01");
    await unwrap(payPayrollItem({ itemId: january.id, paidOn: today }));
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "DIBATALKAN" } });

    await unwrap(createPayrollPeriod({ month: "2093-02" }));
    const february = await itemOf("2093-02");
    expect(await prisma.payrollAdjustment.findMany({ where: { itemId: february.id, invoiceLineId: lineId } })).toHaveLength(1);

    await unwrap(voidPayrollPayment({ itemId: january.id, reason: "Salah bulan" }));
    expect(await prisma.payrollAdjustment.count({ where: { invoiceLineId: lineId } })).toBe(0);
    await unwrap(payPayrollItem({ itemId: february.id, paidOn: today }));
    expect((await itemOf("2093-02")).deductionTotal).toBe(0);
  });
});

describe("perbaikan review akhir", () => {
  it("koreksi yang muncul sesudah penggajian dibuat langsung tampil, dan total kedaluwarsa ditolak (Important 1)", async () => {
    const { invoiceId } = await commissionInvoice(world, 90_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    await unwrap(payPayrollItem({ itemId: (await itemOf("2093-01")).id, paidOn: today }));
    await unwrap(createPayrollPeriod({ month: "2093-02" }));
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "DIBATALKAN" } });

    const row = (await getPayrollPeriod("2093-02"))!.items.find((i) => i.employeeId === world.employeeId)!;
    expect(row.deductionTotal).toBe(90_000);
    expect(row.total).toBe(3_410_000);
    const february = await itemOf("2093-02");
    expect(await payPayrollItem({ itemId: february.id, paidOn: today, expectedTotal: 3_500_000 })).toEqual({
      ok: false,
      error: "Total berubah sejak halaman dibuka. Muat ulang halaman lalu periksa lagi.",
    });
    await unwrap(payPayrollItem({ itemId: february.id, paidOn: today, expectedTotal: 3_410_000 }));
    expect((await itemOf("2093-02")).total).toBe(3_410_000);
  });

  it("pembayaran yang koreksinya sudah dibayar di bulan lain tidak bisa dibatalkan (Important 2)", async () => {
    const { invoiceId } = await commissionInvoice(world, 100_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const january = await itemOf("2093-01");
    await unwrap(payPayrollItem({ itemId: january.id, paidOn: today }));
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "DIBATALKAN" } });
    await unwrap(createPayrollPeriod({ month: "2093-02" }));
    await unwrap(payPayrollItem({ itemId: (await itemOf("2093-02")).id, paidOn: today }));

    expect(await voidPayrollPayment({ itemId: january.id, reason: "Salah tanggal" })).toEqual({
      ok: false,
      error: "Koreksi komisi dari pembayaran ini sudah dibayar di penggajian 2093-02; batalkan pembayaran itu dulu.",
    });
  });

  it("baris yang sedang dibayar tidak bisa dikeluarkan bersamaan (Important 3)", async () => {
    for (let round = 0; round < 5; round++) {
      await cleanupPayrollWorld(SLUG, WA, "2093");
      world = await createPayrollWorld(SLUG, WA);
      await commissionInvoice(world, 10_000);
      await unwrap(createPayrollPeriod({ month: "2093-01" }));
      const item = await itemOf("2093-01");
      await Promise.all([payPayrollItem({ itemId: item.id, paidOn: today }), removePayrollItem({ itemId: item.id })]);
      const after = await prisma.payrollItem.findUnique({ where: { id: item.id } });
      const expenses = await prisma.expense.count({ where: { note: `Penggajian 2093-01 · ${SLUG} Rina`, voidedAt: null } });
      if (after) expect(after.paidAt).not.toBeNull();
      else expect(expenses).toBe(0);
    }
  });

  it("pengeluaran dari penggajian tidak bisa dibatalkan dari halaman Pengeluaran (Important 4)", async () => {
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    const paid = await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(await voidExpense({ id: paid.salaryExpenseId!, reason: "Salah" })).toEqual({
      ok: false,
      error: "Pengeluaran ini dari penggajian; batalkan pembayarannya dari menu Karyawan.",
    });
  });
});
