// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { createExpense, createExpenseCategory, setExpenseCategoryActive, voidExpense } from "@/server/expense-actions";
import { listCategories, listExpenses } from "@/server/expense-read";
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

const SLUG = "aksi-pengeluaran";
const WA = "6281200009001";
const today = witaDateString(new Date());

describe("pengeluaran dan kategori", () => {
  let world: BillingWorld;
  let categoryId: string;
  let comingSoonBranchId: string;
  let branchName: string;

  const input = (patch: Record<string, unknown> = {}) => ({ date: today, categoryId, amount: 250000, note: "Sewa Oktober", branchId: world.branchId, ...patch });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
    world = await createBillingWorld(SLUG, WA);
    branchName = (await prisma.branch.findUniqueOrThrow({ where: { id: world.branchId } })).name;
    categoryId = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Sewa` } })).id;
    comingSoonBranchId = (
      await prisma.branch.create({
        data: { slug: `${SLUG}-segera`, name: `Cabang ${SLUG} segera`, address: "Jl. Uji", whatsapp: "6285172228900", openingHours: "-", status: "SEGERA_HADIR", sortOrder: 91 },
      })
    ).id;
  });
  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.branch.deleteMany({ where: { slug: `${SLUG}-segera` } });
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
    await prisma.$disconnect();
  });

  it("mencatat pengeluaran: data tersimpan, pelaku tercatat, audit tanpa keterangan bebas", async () => {
    const { id } = await unwrap(createExpense(input({ note: "  Sewa  Oktober  " })));
    expect(await prisma.expense.findUniqueOrThrow({ where: { id } })).toMatchObject({
      amount: 250000,
      note: "Sewa  Oktober",
      branchId: world.branchId,
      createdByName: "Keuangan Uji",
      voidedAt: null,
      recurringId: null,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "expense.create", entityId: id } });
    expect(audit.summary).toContain(`${SLUG} Sewa`);
    expect(audit.summary).toContain("250.000");
    expect(audit.summary).not.toContain("Oktober");
  });

  it("pengeluaran umum (tanpa cabang) diterima", async () => {
    const { id } = await unwrap(createExpense(input({ branchId: null, note: "" })));
    expect(await prisma.expense.findUniqueOrThrow({ where: { id } })).toMatchObject({ branchId: null, note: null });
  });

  it("menolak permintaan buatan: tanggal, nominal, kategori, dan cabang yang tidak sah", async () => {
    expect(await createExpense(input({ date: addDaysToDateString(today, 1) }))).toEqual({
      ok: false,
      error: "Tanggal pengeluaran tidak boleh di masa depan.",
    });
    expect(await createExpense(input({ amount: 0 }))).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await createExpense(input({ amount: 10.5 }))).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await createExpense(input({ categoryId: "tidak-ada" }))).toEqual({ ok: false, error: "Kategori tidak ditemukan atau sudah nonaktif." });
    expect(await createExpense(input({ branchId: "tidak-ada" }))).toEqual({ ok: false, error: "Cabang tidak ditemukan atau belum aktif." });
    expect(await createExpense(input({ branchId: comingSoonBranchId }))).toEqual({ ok: false, error: "Cabang tidak ditemukan atau belum aktif." });
    await prisma.expenseCategory.update({ where: { id: categoryId }, data: { isActive: false } });
    expect(await createExpense(input())).toEqual({ ok: false, error: "Kategori tidak ditemukan atau sudah nonaktif." });
    await prisma.expenseCategory.update({ where: { id: categoryId }, data: { isActive: true } });
  });

  it("membatalkan pengeluaran: butuh alasan, tidak bisa dua kali, tidak dihapus", async () => {
    const { id } = await unwrap(createExpense(input()));
    expect(await voidExpense({ id, reason: "  " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(voidExpense({ id, reason: "Salah catat nominal" }));
    expect(await prisma.expense.findUniqueOrThrow({ where: { id } })).toMatchObject({ voidedByName: "Keuangan Uji", voidReason: "Salah catat nominal" });
    expect(await voidExpense({ id, reason: "lagi" })).toEqual({ ok: false, error: "Pengeluaran ini sudah dibatalkan." });
    expect(await voidExpense({ id: "tidak-ada", reason: "x" })).toEqual({ ok: false, error: "Pengeluaran tidak ditemukan." });
    expect(await prisma.auditLog.count({ where: { action: "expense.void", entityId: id } })).toBe(1);
  });

  it("kategori: tambah, nama kembar (tanpa membedakan huruf) ditolak, nonaktifkan dan aktifkan lagi", async () => {
    const { id } = await unwrap(createExpenseCategory({ name: `  ${SLUG} Servis AC ` }));
    expect((await prisma.expenseCategory.findUniqueOrThrow({ where: { id } })).name).toBe(`${SLUG} Servis AC`);
    expect(await createExpenseCategory({ name: `${SLUG.toUpperCase()} SERVIS AC` })).toEqual({ ok: false, error: "Kategori ini sudah ada." });
    expect(await createExpenseCategory({ name: "   " })).toEqual({ ok: false, error: "Isi nama kategori." });
    await unwrap(setExpenseCategoryActive({ id, active: false }));
    expect((await listCategories()).map((c) => c.id)).not.toContain(id);
    expect((await listCategories({ includeInactive: true })).map((c) => c.id)).toContain(id);
    await unwrap(setExpenseCategoryActive({ id, active: true }));
    expect((await listCategories()).map((c) => c.id)).toContain(id);
    expect(await setExpenseCategoryActive({ id: "tidak-ada", active: false })).toEqual({ ok: false, error: "Kategori tidak ditemukan." });
    expect(await prisma.auditLog.count({ where: { action: "expense-category.update", entityId: id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "expense-category.create", entityId: id } })).toBe(1);
  });

  it("daftar per bulan: urut tanggal turun, saringan kategori dan cabang, yang dibatalkan ikut dengan tandanya", async () => {
    const other = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Listrik` } })).id;
    const mk = (date: string, categoryId: string, amount: number, extra: Record<string, unknown> = {}) =>
      prisma.expense.create({ data: { date: new Date(`${date}T00:00:00Z`), categoryId, amount, createdById: "s1", createdByName: "Uji", branchId: world.branchId, ...extra } });
    const a = await mk("2035-03-05", categoryId, 100);
    const b = await mk("2035-03-20", other, 200);
    const c = await mk("2035-03-12", categoryId, 300, { voidedAt: new Date(), voidedByName: "Uji", voidReason: "Salah" });
    await mk("2035-04-01", categoryId, 400);
    await mk("2035-03-31", categoryId, 500, { branchId: null });

    const march = await listExpenses({ month: "2035-03", branchId: world.branchId });
    expect(march.map((r) => r.id)).toEqual([b.id, c.id, a.id]);
    expect(march.find((r) => r.id === c.id)?.voided).toMatchObject({ by: "Uji", reason: "Salah" });
    expect(march.find((r) => r.id === a.id)).toMatchObject({ date: "2035-03-05", categoryName: `${SLUG} Sewa`, branchName, voided: null, recurring: false });
    expect((await listExpenses({ month: "2035-03", branchId: world.branchId, categoryId: other })).map((r) => r.id)).toEqual([b.id]);
    expect((await listExpenses({ month: "2035-04", branchId: world.branchId })).map((r) => r.amount)).toEqual([400]);
    expect(await listExpenses({ month: "bukan-bulan" })).toEqual([]);
  });

  it("hak akses: Resepsionis, Dokter, dan Apoteker ditolak; Super Admin boleh", async () => {
    for (const role of ["RESEPSIONIS", "DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      await expect(createExpense(input())).rejects.toThrow(/forbidden: expense:manage/);
      await expect(voidExpense({ id: "x", reason: "x" })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(createExpenseCategory({ name: "x" })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(setExpenseCategoryActive({ id: "x", active: false })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(listExpenses({ month: "2035-03" })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(listCategories()).rejects.toThrow(/forbidden: expense:manage/);
    }
    actor.role = "SUPER_ADMIN";
    expect((await createExpense(input())).ok).toBe(true);
  });
});
