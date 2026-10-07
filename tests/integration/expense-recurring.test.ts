// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addMonths, currentMonthOf } from "@/lib/expense";
import { witaDateString } from "@/lib/time";
import { createRecurringExpense, stopRecurringExpense, updateRecurringExpense } from "@/server/expense-recurring";
import { voidExpense } from "@/server/expense-actions";
import { ensureRecurringExpenses } from "@/server/expense-store";
import { listExpenses, listRecurring } from "@/server/expense-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "berulang-uji";
const WA = "6281200009003";
const today = witaDateString(new Date());
const thisMonth = currentMonthOf(today);

describe("pengeluaran berulang", () => {
  let world: BillingWorld;
  let categoryId: string;

  const make = (patch: Record<string, unknown> = {}) =>
    createRecurringExpense({ categoryId, amount: 1_000_000, note: "Gaji staf", branchId: world.branchId, dayOfMonth: 25, startMonth: addMonths(thisMonth, -2), ...patch });
  const rowsOf = (recurringId: string) =>
    prisma.expense.findMany({ where: { recurringId }, orderBy: { recurringMonth: "asc" } });

  async function clean() {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
  }

  beforeAll(async () => {
    await clean();
    world = await createBillingWorld(SLUG, WA);
    categoryId = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Gaji` } })).id;
  });
  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("templat baru langsung membuat catatan dari bulan mulai sampai bulan berjalan, dengan nilai disalin dari templat", async () => {
    const { id, generated } = await unwrap(make());
    expect(generated).toBe(3);
    const rows = await rowsOf(id);
    expect(rows.map((r) => r.recurringMonth)).toEqual([addMonths(thisMonth, -2), addMonths(thisMonth, -1), thisMonth]);
    expect(rows[2]).toMatchObject({
      amount: 1_000_000,
      note: "Gaji staf",
      branchId: world.branchId,
      categoryId,
      createdByName: "Berulang (otomatis)",
      voidedAt: null,
    });
    expect(rows[2].date.toISOString().slice(0, 10)).toBe(`${thisMonth}-25`);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "expense-recurring.create", entityId: id } });
    expect(audit.summary).toContain(`${SLUG} Gaji`);
    expect(audit.summary).not.toContain("Gaji staf");

    const listed = await listExpenses({ month: thisMonth, branchId: world.branchId });
    expect(listed.find((r) => r.recurring)).toMatchObject({ amount: 1_000_000, categoryName: `${SLUG} Gaji`, recurring: true });
  });

  it("susulan idempoten dan aman dipanggil bersamaan: tidak pernah ada catatan ganda", async () => {
    const { id } = await unwrap(make({ note: "Sewa ruko" }));
    await Promise.all(Array.from({ length: 6 }, () => ensureRecurringExpenses(today)));
    await ensureRecurringExpenses(today);
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(3);
    expect(await ensureRecurringExpenses(today, prisma, id)).toBe(0);
  });

  it("membuka daftar menyusul bulan yang terlewat; catatan yang sudah dibatalkan tidak dibuat lagi", async () => {
    const { id } = await unwrap(make({ note: "Internet" }));
    const rows = await rowsOf(id);
    await prisma.expense.delete({ where: { id: rows[2].id } }); // bulan berjalan terlewat
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(2);
    await listExpenses({ month: thisMonth });
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(3);

    const first = (await rowsOf(id))[0];
    await unwrap(voidExpense({ id: first.id, reason: "Tidak jadi" }));
    await listExpenses({ month: thisMonth });
    const after = await rowsOf(id);
    expect(after).toHaveLength(3);
    expect(after[0].voidedAt).not.toBeNull();
  });

  it("mengubah templat: bulan yang sudah jatuh tempo memakai nilai lama, bulan depan memakai nilai baru", async () => {
    const { id } = await unwrap(make({ note: "Listrik" }));
    const rows = await rowsOf(id);
    await prisma.expense.delete({ where: { id: rows[2].id } }); // belum sempat dibuat
    await unwrap(updateRecurringExpense({ id, amount: 1_200_000, note: "Listrik naik", dayOfMonth: 10, endMonth: null }));

    const after = await rowsOf(id);
    expect(after).toHaveLength(3);
    expect(after.map((r) => r.amount)).toEqual([1_000_000, 1_000_000, 1_000_000]); // susulan memakai nilai lama
    expect(await prisma.recurringExpense.findUniqueOrThrow({ where: { id } })).toMatchObject({ amount: 1_200_000, note: "Listrik naik", dayOfMonth: 10 });

    const nextMonth = addMonths(thisMonth, 1);
    expect(await ensureRecurringExpenses(`${nextMonth}-02`, prisma, id)).toBe(1);
    const next = (await rowsOf(id)).at(-1)!;
    expect(next).toMatchObject({ recurringMonth: nextMonth, amount: 1_200_000, note: "Listrik naik" });
    expect(next.date.toISOString().slice(0, 10)).toBe(`${nextMonth}-10`);
    expect(await prisma.auditLog.count({ where: { action: "expense-recurring.update", entityId: id } })).toBe(1);
  });

  it("menghentikan templat: catatan lama tetap, tidak ada catatan baru, tidak bisa diubah atau dihentikan lagi", async () => {
    const { id } = await unwrap(make({ note: "Pemasaran" }));
    await unwrap(stopRecurringExpense({ id }));
    expect((await prisma.recurringExpense.findUniqueOrThrow({ where: { id } })).isActive).toBe(false);
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(3);
    expect(await ensureRecurringExpenses(`${addMonths(thisMonth, 3)}-01`)).toBeGreaterThanOrEqual(0);
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(3);
    expect(await stopRecurringExpense({ id })).toEqual({ ok: false, error: "Templat ini sudah dihentikan." });
    expect(await updateRecurringExpense({ id, amount: 5, note: "", dayOfMonth: 1, endMonth: null })).toEqual({ ok: false, error: "Templat ini sudah dihentikan." });
    expect(await stopRecurringExpense({ id: "tidak-ada" })).toEqual({ ok: false, error: "Templat tidak ditemukan." });
    expect(await prisma.auditLog.count({ where: { action: "expense-recurring.stop", entityId: id } })).toBe(1);
    expect((await listRecurring()).find((r) => r.id === id)).toMatchObject({ isActive: false, categoryName: `${SLUG} Gaji` });
  });

  it("bulan berakhir membatasi susulan, dan bulan mulai di masa depan belum membuat apa pun", async () => {
    const ended = await unwrap(make({ note: "Kontrak", endMonth: addMonths(thisMonth, -1) }));
    expect(ended.generated).toBe(2);
    await ensureRecurringExpenses(`${addMonths(thisMonth, 6)}-01`);
    expect(await prisma.expense.count({ where: { recurringId: ended.id } })).toBe(2);

    const future = await unwrap(make({ note: "Sewa baru", startMonth: addMonths(thisMonth, 1) }));
    expect(future.generated).toBe(0);
    expect(await ensureRecurringExpenses(`${addMonths(thisMonth, 1)}-01`, prisma, future.id)).toBe(1);
  });

  it("menolak templat yang tidak sah: tanggal, bulan mulai, nominal, kategori, dan cabang", async () => {
    expect(await make({ dayOfMonth: 29 })).toEqual({ ok: false, error: "Tanggal tiap bulan harus 1 sampai 28." });
    expect(await make({ startMonth: addMonths(thisMonth, -25) })).toEqual({ ok: false, error: "Bulan mulai paling jauh 24 bulan ke belakang." });
    expect(await make({ amount: 0 })).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await make({ endMonth: addMonths(thisMonth, -5) })).toEqual({ ok: false, error: "Bulan berakhir tidak boleh lebih awal dari bulan mulai." });
    expect(await make({ categoryId: "tidak-ada" })).toEqual({ ok: false, error: "Kategori tidak ditemukan atau sudah nonaktif." });
    expect(await make({ branchId: "tidak-ada" })).toEqual({ ok: false, error: "Cabang tidak ditemukan atau belum aktif." });
  });

  it("hak akses: hanya Admin Keuangan dan Super Admin", async () => {
    for (const role of ["RESEPSIONIS", "DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      await expect(make()).rejects.toThrow(/forbidden: expense:manage/);
      await expect(updateRecurringExpense({ id: "x", amount: 1, note: "", dayOfMonth: 1, endMonth: null })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(stopRecurringExpense({ id: "x" })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(listRecurring()).rejects.toThrow(/forbidden: expense:manage/);
    }
  });
});
