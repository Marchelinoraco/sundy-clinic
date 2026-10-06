// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { PaymentInput } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { countOverduePayables, listPayables, payablesOverview } from "@/server/payable-read";
import { recordSupplierPayment, revokeSupplierPayment, updateDueDate } from "@/server/payables";
import { getPurchaseDetail } from "@/server/purchase-read";
import { cancelPurchase } from "@/server/purchases";
import { createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u2", staffId: "s2", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "keu@sundy.test" },
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

const SLUG = "hutang-stok";
const today = witaDateString(new Date());
let seq = 0;

describe("hutang ke supplier", () => {
  let world: StockWorld;

  /** Faktur 10 × Rp 10.000 = Rp 100.000. */
  const invoice = async (input: { invoiceDate?: string; dueDate?: string } = {}) => {
    seq += 1;
    return seedBatch(world, {
      invoiceNumber: `HT-${seq}`,
      itemId: world.productId,
      quantity: 10,
      unitCost: 10000,
      invoiceDate: input.invoiceDate ?? addDaysToDateString(today, -10),
      dueDate: input.dueDate ?? addDaysToDateString(today, 20),
    });
  };
  const pay = (invoiceId: string, patch: Partial<PaymentInput> = {}): Promise<Awaited<ReturnType<typeof recordSupplierPayment>>> =>
    recordSupplierPayment({ invoiceId, kind: "BAYAR", amount: 40000, method: "TRANSFER", paidAt: today, reference: "", ...patch });

  beforeAll(async () => {
    await cleanupStockWorld(SLUG);
    world = await createStockWorld(SLUG);
  });

  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
  });

  afterAll(async () => {
    await cleanupStockWorld(SLUG);
    await prisma.$disconnect();
  });

  it("bayar sebagian lalu lunas; nominal di atas sisa ditolak", async () => {
    const { invoiceId } = await invoice();
    const first = await unwrap(pay(invoiceId));
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ paid: 40000, balance: 60000, status: "SEBAGIAN" });
    expect(await pay(invoiceId, { amount: 60001 })).toEqual({ ok: false, error: "Nominal melebihi sisa hutang (Rp 60.000)." });
    const second = await unwrap(pay(invoiceId, { amount: 60000, method: "TUNAI" }));
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ balance: 0, status: "LUNAS" });
    expect(await pay(invoiceId, { amount: 1 })).toEqual({ ok: false, error: "Faktur ini tidak punya sisa hutang." });
    expect(
      await prisma.auditLog.count({ where: { action: "supplier-payment.create", entityId: { in: [first.id, second.id] } } }),
    ).toBe(2);
  });

  it("dua pembayaran bersamaan yang masing-masing melunasi: hanya satu diterima", async () => {
    const { invoiceId } = await invoice();
    const results = await Promise.all([pay(invoiceId, { amount: 100000 }), pay(invoiceId, { amount: 100000 })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Faktur ini tidak punya sisa hutang." });
    expect(await prisma.supplierPayment.count({ where: { invoiceId, revokedAt: null } })).toBe(1);
  });

  it("menolak tanggal bayar di masa depan atau sebelum tanggal faktur, dan faktur yang dibatalkan", async () => {
    const { invoiceId } = await invoice({ invoiceDate: addDaysToDateString(today, -3) });
    expect(await pay(invoiceId, { paidAt: addDaysToDateString(today, 1) })).toEqual({ ok: false, error: "Tanggal bayar tidak boleh di masa depan." });
    expect(await pay(invoiceId, { paidAt: addDaysToDateString(today, -4) })).toEqual({
      ok: false,
      error: "Tanggal bayar tidak boleh sebelum tanggal faktur.",
    });
    await unwrap(cancelPurchase({ invoiceId, reason: "Faktur ganda" }));
    expect(await pay(invoiceId)).toEqual({ ok: false, error: "Faktur yang dibatalkan tidak punya hutang." });
  });

  it("membatalkan pembayaran salah input mengembalikan sisa; tidak bisa dibatalkan dua kali", async () => {
    const { invoiceId } = await invoice();
    const { id } = await unwrap(pay(invoiceId));
    expect(await revokeSupplierPayment({ paymentId: id, reason: " " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(revokeSupplierPayment({ paymentId: id, reason: "Nominal salah" }));
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ paid: 0, balance: 100000, status: "BELUM_DIBAYAR" });
    expect(await prisma.supplierPayment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      revokedByName: "Keuangan Uji",
      revokeReason: "Nominal salah",
    });
    expect(await revokeSupplierPayment({ paymentId: id, reason: "lagi" })).toEqual({ ok: false, error: "Pembayaran ini sudah dibatalkan." });
    expect(await prisma.auditLog.count({ where: { action: "supplier-payment.revoke", entityId: id } })).toBe(1);
  });

  it("retur atas faktur lunas menjadi kredit; pengembalian dana menutupnya, tidak boleh melebihi kredit", async () => {
    const { invoiceId, batchId } = await invoice();
    await unwrap(pay(invoiceId, { amount: 100000 }));
    actor.role = "APOTEKER";
    await unwrap(createSupplierReturn({ invoiceId, lines: [{ batchId, quantity: 3 }], note: "" }));
    actor.role = "ADMIN_KEUANGAN";
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ balance: -30000, status: "KREDIT" });

    expect(await pay(invoiceId, { kind: "PENGEMBALIAN", amount: 30001 })).toEqual({
      ok: false,
      error: "Nominal melebihi kredit dari supplier (Rp 30.000).",
    });
    const refund = await unwrap(pay(invoiceId, { kind: "PENGEMBALIAN", amount: 30000, method: "TUNAI" }));
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ refunded: 30000, balance: 0, status: "LUNAS" });
    expect(await prisma.auditLog.count({ where: { action: "supplier-refund.create", entityId: refund.id } })).toBe(1);
  });

  it("ubah jatuh tempo beralasan; tidak sebelum tanggal faktur", async () => {
    const { invoiceId } = await invoice({ invoiceDate: addDaysToDateString(today, -5) });
    const newDue = addDaysToDateString(today, 45);
    expect(await updateDueDate({ invoiceId, dueDate: addDaysToDateString(today, -6), reason: "x" })).toEqual({
      ok: false,
      error: "Jatuh tempo tidak boleh sebelum tanggal faktur.",
    });
    expect(await updateDueDate({ invoiceId, dueDate: newDue, reason: "" })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(updateDueDate({ invoiceId, dueDate: newDue, reason: "Kesepakatan baru" }));
    expect((await getPurchaseDetail(invoiceId))?.dueDate).toBe(newDue);
    expect(await prisma.auditLog.count({ where: { action: "purchase.update-due-date", entityId: invoiceId } })).toBe(1);
  });

  it("daftar hutang per tampilan, urutan, dan ringkasan", async () => {
    await prisma.supplierPayment.deleteMany({ where: { invoice: { branch: { slug: { startsWith: SLUG } } } } });
    const overdue = await invoice({ invoiceDate: addDaysToDateString(today, -40), dueDate: addDaysToDateString(today, -1) });
    const soon = await invoice({ dueDate: addDaysToDateString(today, 3) });
    const later = await invoice({ dueDate: addDaysToDateString(today, 25) });
    const settled = await invoice();
    await unwrap(pay(settled.invoiceId, { amount: 100000 }));

    const mine = (rows: { id: string }[]) => rows.map((row) => row.id).filter((id) => [overdue, soon, later, settled].some((x) => x.invoiceId === id));
    const open = await listPayables({ view: "BELUM_LUNAS", supplierId: world.supplierId });
    expect(mine(open)).toEqual([overdue.invoiceId, soon.invoiceId, later.invoiceId]);
    expect(open.find((row) => row.id === overdue.invoiceId)).toMatchObject({ overdue: true, balance: 100000, supplierName: world.supplierName });
    expect(mine(await listPayables({ view: "TERLAMBAT" }))).toEqual([overdue.invoiceId]);
    expect(mine(await listPayables({ view: "JATUH_TEMPO" }))).toEqual([soon.invoiceId]);
    expect(mine(await listPayables({ view: "LUNAS" }))).toEqual([settled.invoiceId]);

    const overview = await payablesOverview();
    const supplier = overview.bySupplier.find((row) => row.supplierId === world.supplierId);
    expect(supplier?.overdueCount).toBe(1);
    expect(overview.overdueCount).toBeGreaterThanOrEqual(1);
    expect(overview.totalBalance).toBeGreaterThanOrEqual(300000);
    expect(await countOverduePayables()).toBe(overview.overdueCount);
  });

  it("hak akses: Apoteker dan Resepsionis tidak mengurus hutang", async () => {
    const { invoiceId } = await invoice();
    for (const role of ["APOTEKER", "RESEPSIONIS"] as const) {
      actor.role = role;
      await expect(pay(invoiceId)).rejects.toThrow(/forbidden: payable:manage/);
      await expect(listPayables({ view: "BELUM_LUNAS" })).rejects.toThrow(/forbidden: payable:manage/);
      await expect(updateDueDate({ invoiceId, dueDate: today, reason: "x" })).rejects.toThrow(/forbidden: payable:manage/);
    }
  });
});
