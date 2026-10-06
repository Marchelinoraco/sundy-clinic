// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getPurchaseDetail } from "@/server/purchase-read";
import { cancelPurchase } from "@/server/purchases";
import { adjustStock, createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Apoteker Uji", role: "APOTEKER" as Role, email: "uji@sundy.test" },
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

const SLUG = "gerak-stok";
const today = witaDateString(new Date());
const NOT_ENOUGH = "Sisa batch tidak cukup. Muat ulang halaman.";
let seq = 0;

describe("penyesuaian dan retur", () => {
  let world: StockWorld;

  const batchOf = async (quantity: number, unitCost = 5000) => {
    seq += 1;
    return seedBatch(world, {
      invoiceNumber: `GR-${seq}`,
      itemId: world.drugId,
      quantity,
      unitCost,
      expiryDate: addDaysToDateString(today, 200),
      invoiceDate: today,
      dueDate: addDaysToDateString(today, 30),
    });
  };
  const remaining = async (batchId: string) => (await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } })).quantityRemaining;

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

  it("mengurangi dan menambah sisa batch lewat jurnal PENYESUAIAN beralasan", async () => {
    const { batchId } = await batchOf(10);
    await unwrap(adjustStock({ batchId, direction: "KURANGI", quantity: 3, reason: "RUSAK", note: "" }));
    await unwrap(adjustStock({ batchId, direction: "TAMBAH", quantity: 1, reason: "SELISIH_HITUNG", note: "Hitung ulang rak" }));
    expect(await remaining(batchId)).toBe(8);
    const movements = await prisma.stockMovement.findMany({ where: { batchId, kind: "PENYESUAIAN" }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.quantity, m.reason, m.note])).toEqual([
      [-3, "RUSAK", null],
      [1, "SELISIH_HITUNG", "Hitung ulang rak"],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "stock.adjust", entityId: batchId } })).toBe(2);
  });

  it("menolak pengurangan melebihi sisa dan batch dari faktur yang dibatalkan", async () => {
    const { batchId, invoiceId } = await batchOf(2);
    expect(await adjustStock({ batchId, direction: "KURANGI", quantity: 3, reason: "HILANG", note: "" })).toEqual({
      ok: false,
      error: NOT_ENOUGH,
    });
    expect(await remaining(batchId)).toBe(2);
    await unwrap(cancelPurchase({ invoiceId, reason: "Salah input" }));
    expect(await adjustStock({ batchId, direction: "TAMBAH", quantity: 1, reason: "SELISIH_HITUNG", note: "x" })).toEqual({
      ok: false,
      error: "Batch dari faktur yang dibatalkan tidak bisa disesuaikan.",
    });
    expect(await adjustStock({ batchId: "tidak-ada", direction: "KURANGI", quantity: 1, reason: "RUSAK", note: "" })).toEqual({
      ok: false,
      error: "Batch tidak ditemukan.",
    });
  });

  it("dua pengurangan bersamaan pada batch yang sama: tepat satu berhasil, sisa tidak pernah minus", async () => {
    const { batchId } = await batchOf(5);
    const results = await Promise.all([
      adjustStock({ batchId, direction: "KURANGI", quantity: 4, reason: "RUSAK", note: "" }),
      adjustStock({ batchId, direction: "KURANGI", quantity: 4, reason: "HILANG", note: "" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: NOT_ENOUGH });
    expect(await remaining(batchId)).toBe(1);
  });

  it("retur mengurangi stok dan hutang faktur, dengan nilai dari harga beli batch", async () => {
    const { batchId, invoiceId } = await batchOf(10, 5000);
    const { id } = await unwrap(createSupplierReturn({ invoiceId, lines: [{ batchId, quantity: 4 }], note: "Kemasan penyok" }));
    expect(await remaining(batchId)).toBe(6);
    expect(await prisma.supplierReturn.findUniqueOrThrow({ where: { id }, include: { lines: true } })).toMatchObject({
      total: 20000,
      note: "Kemasan penyok",
      lines: [{ batchId, quantity: 4, unitCost: 5000, amount: 20000 }],
    });
    expect(await prisma.stockMovement.findFirst({ where: { batchId, kind: "RETUR" } })).toMatchObject({ quantity: -4, supplierReturnId: id });
    const detail = await getPurchaseDetail(invoiceId);
    expect(detail?.summary).toMatchObject({ returned: 20000, balance: 30000, status: "SEBAGIAN" });
    expect(detail?.returns).toHaveLength(1);
    expect(detail?.canCancel).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "stock.return", entityId: id } })).toBe(1);
  });

  it("menolak retur melebihi sisa, batch dari faktur lain, dan faktur yang dibatalkan", async () => {
    const first = await batchOf(3);
    const second = await batchOf(3);
    expect(await createSupplierReturn({ invoiceId: first.invoiceId, lines: [{ batchId: first.batchId, quantity: 4 }], note: "" })).toEqual({
      ok: false,
      error: `Sisa ${SLUG} Amoxicillin 500 mg (batch -) tidak cukup untuk diretur.`,
    });
    expect(await createSupplierReturn({ invoiceId: first.invoiceId, lines: [{ batchId: second.batchId, quantity: 1 }], note: "" })).toEqual({
      ok: false,
      error: "Batch tidak termasuk faktur ini.",
    });
    await unwrap(cancelPurchase({ invoiceId: second.invoiceId, reason: "Salah input" }));
    expect(await createSupplierReturn({ invoiceId: second.invoiceId, lines: [{ batchId: second.batchId, quantity: 1 }], note: "" })).toEqual({
      ok: false,
      error: "Faktur yang dibatalkan tidak bisa diretur.",
    });
    expect(await remaining(first.batchId)).toBe(3);
  });

  it("retur dan penyesuaian bersamaan tidak melewati sisa batch", async () => {
    const { batchId, invoiceId } = await batchOf(5);
    const results = await Promise.all([
      createSupplierReturn({ invoiceId, lines: [{ batchId, quantity: 3 }], note: "" }),
      adjustStock({ batchId, direction: "KURANGI", quantity: 3, reason: "RUSAK", note: "" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await remaining(batchId)).toBe(2);
  });

  it("hak akses: Admin Keuangan dan Resepsionis tidak mengubah stok", async () => {
    const { batchId, invoiceId } = await batchOf(5);
    for (const role of ["ADMIN_KEUANGAN", "RESEPSIONIS"] as const) {
      actor.role = role;
      await expect(adjustStock({ batchId, direction: "KURANGI", quantity: 1, reason: "RUSAK", note: "" })).rejects.toThrow(
        /forbidden: stock:manage/,
      );
      await expect(createSupplierReturn({ invoiceId, lines: [{ batchId, quantity: 1 }], note: "" })).rejects.toThrow(
        /forbidden: stock:manage/,
      );
    }
  });
});
