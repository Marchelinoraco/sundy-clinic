// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "skema-pengeluaran";
const WA = "6281200009000";

describe("skema pengeluaran", () => {
  let world: BillingWorld;
  let categoryId: string;

  const expense = (data: Record<string, unknown> = {}) =>
    prisma.expense.create({
      data: { date: new Date("2035-01-10T00:00:00Z"), categoryId, amount: 100000, createdById: "s1", createdByName: "Uji", branchId: world.branchId, ...data },
    });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
    world = await createBillingWorld(SLUG, WA);
    categoryId = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Sewa` } })).id;
  });

  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
    await prisma.$disconnect();
  });

  it("kategori bawaan terisi dari migrasi", async () => {
    const names = (await prisma.expenseCategory.findMany({ select: { name: true } })).map((c) => c.name);
    for (const name of ["Gaji", "Sewa", "Listrik dan air", "Internet dan telepon", "Perlengkapan", "Pemasaran", "Lain-lain"]) {
      expect(names).toContain(name);
    }
  });

  it("nama kategori unik tanpa membedakan huruf besar-kecil", async () => {
    await expect(prisma.expenseCategory.create({ data: { name: `${SLUG.toUpperCase()} SEWA` } })).rejects.toThrow(/Unique constraint|expense_category_name_lower/);
  });

  it("nominal harus lebih dari 0", async () => {
    await expect(expense({ amount: 0 })).rejects.toThrow(/expense_amount_positive/);
    await expect(expense({ amount: -5 })).rejects.toThrow(/expense_amount_positive/);
    expect((await expense()).amount).toBe(100000);
  });

  it("data pembatalan harus lengkap atau kosong semuanya", async () => {
    await expect(expense({ voidedAt: new Date() })).rejects.toThrow(/expense_void_fields/);
    await expect(expense({ voidedAt: new Date(), voidedByName: "x" })).rejects.toThrow(/expense_void_fields/);
    expect((await expense({ voidedAt: new Date(), voidedByName: "x", voidReason: "Salah" })).voidReason).toBe("Salah");
  });

  it("satu templat tidak bisa membuat dua catatan untuk bulan yang sama; catatan manual tidak dibatasi", async () => {
    const recurring = await prisma.recurringExpense.create({
      data: { categoryId, amount: 500000, dayOfMonth: 5, startMonth: "2035-01", createdById: "s1", createdByName: "Uji", branchId: world.branchId },
    });
    await expense({ recurringId: recurring.id, recurringMonth: "2035-01" });
    await expect(expense({ recurringId: recurring.id, recurringMonth: "2035-01" })).rejects.toThrow(/Unique constraint/);
    await expense({ recurringId: recurring.id, recurringMonth: "2035-02" });
    await expense();
    await expense();
  });

  it("templat: tanggal 1–28, nominal positif, bulan berakhir tidak lebih awal dari mulai", async () => {
    const base = { categoryId, amount: 1000, dayOfMonth: 1, startMonth: "2035-03", createdById: "s1", createdByName: "Uji" };
    await expect(prisma.recurringExpense.create({ data: { ...base, dayOfMonth: 29 } })).rejects.toThrow(/recurring_expense_values/);
    await expect(prisma.recurringExpense.create({ data: { ...base, dayOfMonth: 0 } })).rejects.toThrow(/recurring_expense_values/);
    await expect(prisma.recurringExpense.create({ data: { ...base, amount: 0 } })).rejects.toThrow(/recurring_expense_values/);
    await expect(prisma.recurringExpense.create({ data: { ...base, endMonth: "2035-02" } })).rejects.toThrow(/recurring_expense_values/);
    expect((await prisma.recurringExpense.create({ data: { ...base, endMonth: "2035-03" } })).endMonth).toBe("2035-03");
  });
});
