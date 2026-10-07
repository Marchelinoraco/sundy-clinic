// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { listStockAvailability } from "@/server/stock-availability";
import { billingBatch, cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Dokter Uji", role: "DOKTER" as Role, email: "uji@sundy.test" },
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

const SLUG = "stok-dokter";
const WA = "6281200008905";
const today = witaDateString(new Date());

describe("ketersediaan stok untuk Dokter", () => {
  let world: BillingWorld;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    await billingBatch(world, { invoiceNumber: "SD-1", itemId: world.drugId, quantity: 9, unitCost: 1234, expiryDate: addDaysToDateString(today, 100) });
    await billingBatch(world, { invoiceNumber: "SD-2", itemId: world.drugId, quantity: 4, expiryDate: addDaysToDateString(today, -2) });
  });
  beforeEach(() => {
    actor.role = "DOKTER";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("Dokter melihat nama, jenis, satuan, dan sisa tersedia (tanpa batch kedaluwarsa); tanpa harga atau batch", async () => {
    const rows = await listStockAvailability({ branchId: world.branchId });
    const drug = rows.find((r) => r.id === world.drugId);
    expect(drug).toEqual({ id: world.drugId, name: `${SLUG} Amoxicillin`, kind: "OBAT", unit: "kapsul", available: 9 });
    expect(Object.keys(drug!).sort()).toEqual(["available", "id", "kind", "name", "unit"]);
    const json = JSON.stringify(rows);
    for (const secret of ["unitCost", "sellPrice", "expiry", "batch"]) expect(json).not.toContain(secret);
    expect(rows.find((r) => r.id === world.productId)).toMatchObject({ available: 0 });
  });

  it("pencarian, barang nonaktif, dan cabang lain", async () => {
    expect((await listStockAvailability({ branchId: world.branchId, q: "amoxi" })).map((r) => r.id)).toEqual([world.drugId]);
    expect(await listStockAvailability({ branchId: world.branchId, q: "tidak-ada-barang-ini" })).toEqual([]);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: false } });
    expect((await listStockAvailability({ branchId: world.branchId })).map((r) => r.id)).not.toContain(world.productId);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: true } });
    expect((await listStockAvailability({ branchId: "cabang-lain" })).find((r) => r.id === world.drugId)?.available).toBe(0);
  });

  it("hak akses: Dokter, Apoteker, Super Admin boleh; Resepsionis dan Admin Keuangan ditolak", async () => {
    for (const role of ["APOTEKER", "SUPER_ADMIN"] as const) {
      actor.role = role;
      expect((await listStockAvailability({ branchId: world.branchId })).length).toBeGreaterThan(0);
    }
    for (const role of ["RESEPSIONIS", "ADMIN_KEUANGAN"] as const) {
      actor.role = role;
      await expect(listStockAvailability({ branchId: world.branchId })).rejects.toThrow(/forbidden: stock:availability/);
    }
  });
});
