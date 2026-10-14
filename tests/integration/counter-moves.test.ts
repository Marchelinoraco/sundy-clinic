// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { pullToWarehouse, moveToCounter } from "@/server/counter-stock";
import { cancelPurchase } from "@/server/purchases";
import { adjustStock, createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s1", name: "Apoteker Meja", role: "APOTEKER" as Role, email: "uji@sundy.test" } }));
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

const SLUG = "pindah-meja";
const today = witaDateString(new Date());
let world: StockWorld;
let seq = 0;
let itemSeq = 0;

/** Barang baru dengan rak sendiri, supaya FEFO tidak bercampur dengan batch uji lain. */
const newItem = () => {
  itemSeq += 1;
  return prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-${itemSeq}`, name: `${SLUG} Barang ${itemSeq}`, kind: "PRODUK", unit: "pcs", sellPrice: 1000 } });
};
const batchOf = (itemId: string, quantity: number, days: number | null, counter = 0) => {
  seq += 1;
  return seedBatch(world, {
    invoiceNumber: `PM-${seq}`,
    itemId,
    quantity,
    counter,
    expiryDate: days === null ? null : addDaysToDateString(today, days),
    invoiceDate: today,
    dueDate: addDaysToDateString(today, 30),
  });
};
const sisa = async (batchId: string) => {
  const row = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } });
  return { gudang: row.quantityRemaining, meja: row.counterRemaining };
};

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
});
beforeEach(() => {
  actor.role = "APOTEKER";
});
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("pindah gudang ke meja (spec stok meja 3)", () => {
  it("mengambil batch kedaluwarsa terdekat dulu dan mencatat dua jurnal per batch", async () => {
    const item = await newItem();
    const later = await batchOf(item.id, 10, 200);
    const soon = await batchOf(item.id, 5, 30);
    await unwrap(moveToCounter({ branchId: world.branchId, itemId: item.id, quantity: 7 }));
    expect(await sisa(soon.batchId)).toEqual({ gudang: 0, meja: 5 });
    expect(await sisa(later.batchId)).toEqual({ gudang: 8, meja: 2 });
    const moves = await prisma.stockMovement.findMany({ where: { batchId: soon.batchId, kind: "PINDAH" }, orderBy: { location: "asc" } });
    expect(moves.map((m) => [m.location, m.quantity])).toEqual([["GUDANG", -5], ["MEJA", 5]]);
    expect(await prisma.auditLog.count({ where: { action: "stock.move", entityId: item.id } })).toBe(1);
  });

  it("batch kedaluwarsa tidak dipindah; gudang kurang ditolak tanpa perubahan (Review Focus 1)", async () => {
    const item = await newItem();
    const old = await batchOf(item.id, 9, -1);
    const fresh = await batchOf(item.id, 2, 100);
    expect(await moveToCounter({ branchId: world.branchId, itemId: item.id, quantity: 3 })).toEqual({
      ok: false,
      error: `Sisa gudang ${item.name} tidak cukup (tersedia 2).`,
    });
    expect(await sisa(old.batchId)).toEqual({ gudang: 9, meja: 0 });
    expect(await sisa(fresh.batchId)).toEqual({ gudang: 2, meja: 0 });
  });

  it("hanya pemegang stock:manage", async () => {
    const item = await newItem();
    actor.role = "RESEPSIONIS";
    await expect(moveToCounter({ branchId: world.branchId, itemId: item.id, quantity: 1 })).rejects.toThrow("forbidden: stock:manage");
  });
});

describe("tarik meja ke gudang", () => {
  it("per batch; batch kedaluwarsa boleh ditarik; melebihi sisa meja ditolak", async () => {
    const item = await newItem();
    const expired = await batchOf(item.id, 6, -1, 6);
    await unwrap(pullToWarehouse({ batchId: expired.batchId, quantity: 2 }));
    expect(await sisa(expired.batchId)).toEqual({ gudang: 2, meja: 4 });
    expect(await pullToWarehouse({ batchId: expired.batchId, quantity: 5 })).toEqual({ ok: false, error: "Sisa meja batch ini tidak cukup. Muat ulang halaman." });
    expect(await pullToWarehouse({ batchId: expired.batchId, quantity: 0 })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat lebih dari 0." });
  });
});

describe("penyesuaian per lokasi", () => {
  it("meja dikurangi atau ditambah; gudang tidak berubah; jurnal berlokasi MEJA", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 10, 100, 4);
    await unwrap(adjustStock({ batchId: b.batchId, direction: "KURANGI", quantity: 1, reason: "RUSAK", note: "", location: "MEJA" }));
    await unwrap(adjustStock({ batchId: b.batchId, direction: "TAMBAH", quantity: 2, reason: "SELISIH_HITUNG", note: "hitung ulang", location: "MEJA" }));
    expect(await sisa(b.batchId)).toEqual({ gudang: 6, meja: 5 });
    expect(await adjustStock({ batchId: b.batchId, direction: "KURANGI", quantity: 6, reason: "HILANG", note: "", location: "MEJA" })).toEqual({
      ok: false,
      error: "Sisa batch tidak cukup. Muat ulang halaman.",
    });
    const adjustments = await prisma.stockMovement.findMany({ where: { batchId: b.batchId, kind: "PENYESUAIAN" } });
    expect(adjustments.every((m) => m.location === "MEJA")).toBe(true);
  });

  it("penyesuaian dan batal faktur bersamaan: tepat satu berhasil (Review Focus 5)", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 5, 100);
    const [adjusted, cancelled] = await Promise.all([
      adjustStock({ batchId: b.batchId, direction: "TAMBAH", quantity: 3, reason: "SELISIH_HITUNG", note: "hitung", location: "GUDANG" }),
      cancelPurchase({ invoiceId: b.invoiceId, reason: "Salah input" }),
    ]);
    expect([adjusted.ok, cancelled.ok].filter(Boolean)).toHaveLength(1);
    const row = await prisma.stockBatch.findUniqueOrThrow({ where: { id: b.batchId } });
    expect(row.quantityRemaining).toBe(cancelled.ok ? 0 : 8);
  });
});

describe("retur dan batal faktur hanya dari gudang", () => {
  it("retur melebihi sisa gudang ditolak walau meja masih ada", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 5, 100, 3);
    expect(await createSupplierReturn({ invoiceId: b.invoiceId, lines: [{ batchId: b.batchId, quantity: 3 }], note: "" })).toEqual({
      ok: false,
      error: `Sisa gudang ${item.name} (batch -) tidak cukup untuk diretur.`,
    });
  });

  it("faktur yang batch-nya pernah dipindah ke meja tidak bisa dibatalkan", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 5, 100);
    await unwrap(moveToCounter({ branchId: world.branchId, itemId: item.id, quantity: 1 }));
    await unwrap(pullToWarehouse({ batchId: b.batchId, quantity: 1 }));
    const result = await cancelPurchase({ invoiceId: b.invoiceId, reason: "Salah input" });
    expect(result.ok).toBe(false);
  });
});
