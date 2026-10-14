// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { countCounterAlerts, listCounterItems } from "@/server/counter-read";
import { getStockItemDetail, listStockItems } from "@/server/stock-read";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";

type Role = "SUPER_ADMIN" | "APOTEKER" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s1", name: "Rina", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-meja";
const today = witaDateString(new Date());
let world: StockWorld;

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
  await prisma.stockItem.update({ where: { id: world.drugId }, data: { counterMinStock: 5 } });
  await seedBatch(world, { invoiceNumber: "BM-1", itemId: world.drugId, quantity: 30, counter: 3, expiryDate: addDaysToDateString(today, 200) });
  await seedBatch(world, { invoiceNumber: "BM-2", itemId: world.drugId, quantity: 4, counter: 4, expiryDate: addDaysToDateString(today, -2) });
  await prisma.restockRequest.create({
    data: { branchId: world.branchId, requestedById: "s1", requestedByName: "Rina", lines: { create: [{ itemId: world.drugId, itemName: "x", requestedQuantity: 5 }] } },
  });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("stok meja untuk resepsionis (spec stok meja 4.1)", () => {
  it("meja tersedia, kedaluwarsa di meja, tanda, dan Sudah diminta; tanpa gudang atau harga (Review Focus 4)", async () => {
    const rows = await listCounterItems(world.branchId);
    const drug = rows.find((r) => r.id === world.drugId)!;
    expect(drug).toEqual({
      id: world.drugId,
      code: `${SLUG.toUpperCase()}-OBT`,
      name: `${SLUG} Amoxicillin 500 mg`,
      unit: "kapsul",
      kind: "OBAT",
      available: 3,
      expired: 4,
      counterMinStock: 5,
      flag: "MEJA_MENIPIS",
      requested: true,
    });
    expect(rows.find((r) => r.id === world.productId)).toMatchObject({ available: 0, flag: null, requested: false });
    expect(JSON.stringify(rows)).not.toMatch(/quantityRemaining|unitCost|sellPrice|value/);
    expect(await countCounterAlerts()).toBeGreaterThanOrEqual(1);
  });

  it("Admin Keuangan tidak membuka stok meja", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await expect(listCounterItems(world.branchId)).rejects.toThrow("forbidden: counter:read");
  });
});

describe("menu Stok per lokasi (spec stok meja 6)", () => {
  it("daftar barang: gudang dan meja terpisah, tanda meja ikut, saringan meja", async () => {
    actor.role = "APOTEKER";
    const row = (await listStockItems({ branchId: world.branchId })).find((r) => r.id === world.drugId)!;
    expect(row).toMatchObject({ available: 27, counterAvailable: 3, counterExpired: 4, counterMinStock: 5 });
    expect(row.flags).toEqual(expect.arrayContaining(["KEDALUWARSA", "MEJA_MENIPIS"]));
    expect((await listStockItems({ branchId: world.branchId, flag: "MEJA_MENIPIS" })).map((r) => r.id)).toContain(world.drugId);
    expect((await listStockItems({ branchId: world.branchId, flag: "MEJA_HABIS" })).map((r) => r.id)).not.toContain(world.drugId);
  });

  it("detail barang: batch dengan gudang dan meja, lokasi jurnal, dan pilihan cabang pindah", async () => {
    actor.role = "APOTEKER";
    const detail = (await getStockItemDetail(world.drugId))!;
    expect(detail.item.counterMinStock).toBe(5);
    expect(detail.batches.map((b) => [b.quantityRemaining, b.counterRemaining]).sort()).toEqual([[0, 4], [27, 3]]);
    expect(detail.movements.some((m) => m.kind === "PINDAH" && m.location === "MEJA")).toBe(true);
    expect(detail.moveOptions).toEqual([{ branchId: world.branchId, branchName: `Cabang ${SLUG}`, warehouseAvailable: 27 }]);
  });
});
