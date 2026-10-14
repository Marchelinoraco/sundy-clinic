// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { PurchaseInput } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addInvoiceItem, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordSupplierPayment } from "@/server/payables";
import { setPurchasePrices } from "@/server/purchase-pricing";
import { createPurchase } from "@/server/purchases";
import { createSupplierReturn } from "@/server/stock-movements";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Apoteker Modal", role: "APOTEKER" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "harga-beli";
const WA = "6281200009702";
const today = witaDateString(new Date());
let world: BillingWorld;
let seq = 0;
const as = (role: Role) => {
  actor.role = role;
};
const purchase = (unitCost: number | null): PurchaseInput => {
  seq += 1;
  return {
    supplierId: world.supplierId,
    branchId: world.branchId,
    invoiceNumber: `${SLUG}-${seq}`,
    invoiceDate: today,
    dueDate: addDaysToDateString(today, 30),
    notes: "",
    lines: [{ itemId: world.productId, quantity: 5, unitCost, batchNumber: "", expiryDate: "" }],
  };
};
const lineOf = async (invoiceId: string) => prisma.purchaseLine.findFirstOrThrow({ where: { invoiceId } });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(() => as("APOTEKER"));
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("barang masuk dua langkah", () => {
  it("Apoteker mencatat tanpa harga; harga dari Apoteker ditolak (Review Focus 2)", async () => {
    expect(await createPurchase(purchase(5000))).toEqual({ ok: false, error: "Harga beli diisi Admin Keuangan." });
    const { id } = await unwrap(createPurchase(purchase(null)));
    const invoice = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id }, include: { lines: { include: { batch: true } } } });
    expect(invoice).toMatchObject({ total: null, pricedAt: null });
    expect(invoice.lines[0]).toMatchObject({ unitCost: null, batch: { unitCost: null, quantityRemaining: 5 } });
    const line = await lineOf(id);
    await expect(setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: 1 }] })).rejects.toThrow("forbidden: price:manage");
  });

  it("menunggu harga: bayar dan retur ditolak; setelah harga diisi keduanya berjalan (Review Focus 3)", async () => {
    const { id } = await unwrap(createPurchase(purchase(null)));
    const line = await prisma.purchaseLine.findFirstOrThrow({ where: { invoiceId: id }, include: { batch: true } });
    as("ADMIN_KEUANGAN");
    expect(await recordSupplierPayment({ invoiceId: id, kind: "BAYAR", amount: 1000, method: "TUNAI", paidAt: today, reference: "" })).toEqual({ ok: false, error: "Isi harga beli dulu." });
    as("APOTEKER");
    expect(await createSupplierReturn({ invoiceId: id, lines: [{ batchId: line.batch!.id, quantity: 1 }], note: "rusak" })).toEqual({ ok: false, error: "Isi harga beli dulu." });

    as("ADMIN_KEUANGAN");
    await unwrap(setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: 8000 }] }));
    const priced = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id } });
    expect(priced).toMatchObject({ total: 40_000, pricedByName: "Apoteker Modal" });
    expect(await prisma.auditLog.count({ where: { action: "purchase.price", entityId: id } })).toBe(1);
    await unwrap(recordSupplierPayment({ invoiceId: id, kind: "BAYAR", amount: 10_000, method: "TUNAI", paidAt: today, reference: "" }));
    expect(await setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: 9000 }] })).toEqual({
      ok: false,
      error: "Harga tidak bisa diubah setelah ada pembayaran atau retur.",
    });
  });

  it("tagihan final yang mengambil stok tanpa harga ikut terisi harga pokoknya (Review Focus 1)", async () => {
    const { id } = await unwrap(createPurchase(purchase(null)));
    // Hanya batch faktur ini yang tersisa, supaya FEFO pasti mengambilnya.
    await prisma.stockBatch.updateMany({ where: { itemId: world.productId, branchId: world.branchId, purchaseLine: { invoiceId: { not: id } } }, data: { quantityRemaining: 0, counterRemaining: 0 } });
    // Tagihan mengambil stok meja (spec stok meja SM1): seluruh batch faktur ini dipindah ke meja.
    const own = await prisma.stockBatch.findFirstOrThrow({ where: { purchaseLine: { invoiceId: id } } });
    await prisma.stockBatch.update({ where: { id: own.id }, data: { counterRemaining: own.quantityRemaining, quantityRemaining: 0 } });
    as("RESEPSIONIS");
    const sale = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addInvoiceItem({ invoiceId: sale.id, version: 1, itemId: world.productId, quantity: 2 }));
    const version = (await prisma.invoice.findUniqueOrThrow({ where: { id: sale.id } })).version;
    await unwrap(finalizeInvoice({ invoiceId: sale.id, version }));
    const uses = () => prisma.invoiceStockUse.findMany({ where: { line: { invoiceId: sale.id } } });
    expect((await uses()).map((u) => u.unitCost)).toEqual([null]);

    as("ADMIN_KEUANGAN");
    const line = await lineOf(id);
    await unwrap(setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: 7000 }] }));
    expect((await uses()).map((u) => [u.quantity, u.unitCost])).toEqual([[2, 7000]]);
  });

  it("isian harga tidak lengkap ditolak; Super Admin bisa mencatat langsung berharga", async () => {
    const { id } = await unwrap(createPurchase(purchase(null)));
    as("ADMIN_KEUANGAN");
    const line = await lineOf(id);
    expect(await setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: null }] })).toEqual({ ok: false, error: "Isi harga beli semua baris." });
    as("SUPER_ADMIN");
    const direct = await unwrap(createPurchase(purchase(6000)));
    expect(await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: direct.id } })).toMatchObject({ total: 30_000, pricedByName: "Apoteker Modal" });
  });
});
