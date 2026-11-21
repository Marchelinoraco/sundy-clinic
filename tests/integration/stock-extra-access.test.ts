// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { Capability } from "@/lib/permissions";
import type { PurchaseInput } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { moveToCounter, pullToWarehouse } from "@/server/counter-stock";
import { cancelPurchase, createPurchase } from "@/server/purchases";
import { createRestockRequest, rejectRestockRequest, sendRestockRequest } from "@/server/restock";
import { createStockItem, createSupplier } from "@/server/stock-catalog";
import { adjustStock, createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";

// Akses tambahan per akun (spec akses tambahan 4): Resepsionis dengan hibah tertentu saja.
const { actor } = vi.hoisted(() => ({
  actor: {
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS" as const,
    email: "uji@sundy.test",
    extraCapabilities: [] as string[],
  },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor as never, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "akses-stok";
const today = witaDateString(new Date());
let world: StockWorld;
let seq = 0;
const grant = (...caps: Capability[]) => {
  actor.extraCapabilities = caps;
};

const purchase = (): PurchaseInput => {
  seq += 1;
  return {
    supplierId: world.supplierId,
    branchId: world.branchId,
    invoiceNumber: `AS-${seq}`,
    invoiceDate: today,
    dueDate: addDaysToDateString(today, 30),
    notes: "",
    lines: [{ itemId: world.productId, quantity: 3, unitCost: null, batchNumber: "", expiryDate: "" }],
  };
};

// Permintaan restock nyata: Resepsionis boleh meminta dari perannya sendiri (restock:request).
async function createRequest() {
  seq += 1;
  const item = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-R${seq}`, name: `${SLUG} Barang ${seq}`, kind: "PRODUK", unit: "pcs", sellPrice: 1000 } });
  await seedBatch(world, { invoiceNumber: `AS-Q${seq}`, itemId: item.id, quantity: 10, expiryDate: null });
  const result = await createRestockRequest({ branchId: world.branchId, note: "", lines: [{ itemId: item.id, quantity: 5 }] });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
});
beforeEach(() => {
  actor.extraCapabilities = [];
});
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("akses tambahan stok", () => {
  it("tanpa hibah, Resepsionis ditolak semuanya", async () => {
    const { batchId } = await seedBatch(world, { invoiceNumber: "AS-0", itemId: world.drugId, quantity: 5, counter: 0, expiryDate: null, invoiceDate: today, dueDate: today });
    await expect(createPurchase(purchase())).rejects.toThrow("forbidden: stock:receive");
    await expect(adjustStock({ batchId, direction: "KURANGI", quantity: 1, reason: "RUSAK", note: "" })).rejects.toThrow("forbidden: stock:adjust");
    await expect(createStockItem({ code: `${SLUG}-X`, name: "X", kind: "PRODUK", unit: "pcs", sellPrice: null, minStock: 0, counterMinStock: 0, notes: "" } as never)).rejects.toThrow("forbidden: stock:item");
    await expect(createSupplier({ name: `${SLUG} X`, phone: "", address: "", notes: "" })).rejects.toThrow("forbidden: stock:supplier");
    await expect(moveToCounter({ branchId: world.branchId, itemId: world.drugId, quantity: 1 })).rejects.toThrow("forbidden: stock:counter");
  });

  it("hanya stock:receive: barang masuk berhasil, yang lain ditolak sesuai kemampuannya", async () => {
    grant("stock:receive");
    const { batchId } = await seedBatch(world, { invoiceNumber: "AS-R", itemId: world.drugId, quantity: 5, counter: 0, expiryDate: null, invoiceDate: today, dueDate: today });
    const result = await createPurchase(purchase());
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    await expect(adjustStock({ batchId, direction: "KURANGI", quantity: 1, reason: "RUSAK", note: "" })).rejects.toThrow("forbidden: stock:adjust");
    await expect(createStockItem({ code: `${SLUG}-Y`, name: "Y", kind: "PRODUK", unit: "pcs", sellPrice: null, minStock: 0, counterMinStock: 0, notes: "" } as never)).rejects.toThrow("forbidden: stock:item");
    await expect(createSupplier({ name: `${SLUG} Y`, phone: "", address: "", notes: "" })).rejects.toThrow("forbidden: stock:supplier");
    await expect(moveToCounter({ branchId: world.branchId, itemId: world.drugId, quantity: 1 })).rejects.toThrow("forbidden: stock:counter");
  });

  it("hanya stock:counter: pindah ke meja dan kirim permintaan berhasil, barang masuk ditolak", async () => {
    grant("stock:counter");
    await seedBatch(world, { invoiceNumber: "AS-C", itemId: world.drugId, quantity: 5, counter: 0, expiryDate: null, invoiceDate: today, dueDate: today });
    expect((await moveToCounter({ branchId: world.branchId, itemId: world.drugId, quantity: 1 })).ok).toBe(true);
    const { id } = await createRequest();
    const [line] = await prisma.restockRequestLine.findMany({ where: { requestId: id } });
    expect(await sendRestockRequest({ requestId: id, version: 1, lines: [{ lineId: line.id, quantity: 1 }] })).toEqual({ ok: true, data: undefined });
    await expect(createPurchase(purchase())).rejects.toThrow("forbidden: stock:receive");
  });

  it("batal faktur: stock:receive berhasil; tanpa stock:receive/payable:manage ditolak", async () => {
    const { invoiceId } = await seedBatch(world, { invoiceNumber: "AS-X1", itemId: world.drugId, quantity: 4, expiryDate: null });
    grant("stock:read");
    expect(await cancelPurchase({ invoiceId, reason: "Salah input" })).toEqual({ ok: false, error: "Anda tidak berhak membatalkan faktur." });
    grant("stock:receive");
    expect(await cancelPurchase({ invoiceId, reason: "Salah input" })).toEqual({ ok: true, data: undefined });
    grant();
    await expect(cancelPurchase({ invoiceId, reason: "Salah input" })).rejects.toThrow(/forbidden/);
  });

  it("retur ke supplier: stock:receive berhasil, tanpa hibah ditolak", async () => {
    const { invoiceId, batchId } = await seedBatch(world, { invoiceNumber: "AS-X2", itemId: world.drugId, quantity: 4, expiryDate: null });
    const input = { invoiceId, lines: [{ batchId, quantity: 1 }], note: "" };
    await expect(createSupplierReturn(input)).rejects.toThrow("forbidden: stock:receive");
    grant("stock:receive");
    expect(await createSupplierReturn(input)).toMatchObject({ ok: true });
  });

  it("pullToWarehouse dan rejectRestockRequest: ditolak dengan stock:receive saja, lolos dengan stock:counter", async () => {
    const { batchId } = await seedBatch(world, { invoiceNumber: "AS-X3", itemId: world.drugId, quantity: 4, counter: 2, expiryDate: null });
    const { id } = await createRequest();
    grant("stock:receive");
    await expect(pullToWarehouse({ batchId, quantity: 1 })).rejects.toThrow("forbidden: stock:counter");
    await expect(rejectRestockRequest({ requestId: id, version: 1, reason: "Stok kosong" })).rejects.toThrow("forbidden: stock:counter");
    grant("stock:counter");
    expect(await pullToWarehouse({ batchId, quantity: 1 })).toEqual({ ok: true, data: undefined });
    expect(await rejectRestockRequest({ requestId: id, version: 1, reason: "Stok kosong" })).toEqual({ ok: true, data: undefined });
  });
});
