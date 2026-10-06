// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import {
  createStockItem,
  createSupplier,
  setStockItemActive,
  setSupplierActive,
  updateStockItem,
  updateSupplier,
} from "@/server/stock-catalog";
import { countStockAlerts, getStockItemDetail, listStockItems, listSuppliers } from "@/server/stock-read";
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

const SLUG = "katalog-stok";
const CODE = SLUG.toUpperCase();
const today = witaDateString(new Date());
const item = (patch: Record<string, unknown> = {}) => ({
  code: `${CODE}-BARU`,
  name: `${SLUG} Vitamin C`,
  kind: "PRODUK" as const,
  unit: "botol",
  sellPrice: 50000,
  minStock: 5,
  notes: "",
  ...patch,
});

describe("barang dan supplier", () => {
  let world: StockWorld;

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

  it("menambah barang, menolak kode ganda, mengubah, dan menonaktifkan", async () => {
    const { id } = await unwrap(createStockItem(item()));
    const saved = await prisma.stockItem.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({ code: `${CODE}-BARU`, kind: "PRODUK", sellPrice: 50000, minStock: 5, isActive: true });
    expect(await prisma.auditLog.count({ where: { action: "stock-item.create", entityId: id } })).toBe(1);

    expect(await createStockItem(item({ code: `${CODE.toLowerCase()}-baru` }))).toEqual({
      ok: false,
      error: `Kode barang ${CODE}-BARU sudah dipakai.`,
    });

    await unwrap(updateStockItem(id, item({ name: `${SLUG} Vitamin C 1000`, sellPrice: null })));
    expect(await prisma.stockItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: `${SLUG} Vitamin C 1000`, sellPrice: null });

    await unwrap(setStockItemActive(id, false));
    const active = await listStockItems({ branchId: world.branchId, q: SLUG });
    const inactive = await listStockItems({ branchId: world.branchId, flag: "NONAKTIF", q: SLUG });
    expect(active.map((row) => row.id)).not.toContain(id);
    expect(inactive.map((row) => row.id)).toContain(id);
    expect(await prisma.auditLog.count({ where: { action: "stock-item.update", entityId: id } })).toBe(2);
  });

  it("menolak barang yang tidak sah di server", async () => {
    expect(await createStockItem(item({ code: "" }))).toEqual({ ok: false, error: "Isi kode barang." });
    expect(await updateStockItem("tidak-ada", item())).toEqual({ ok: false, error: "Barang tidak ditemukan." });
  });

  it("daftar barang per cabang: stok tersedia, tanda, nilai, saringan jenis dan pencarian", async () => {
    await seedBatch(world, { invoiceNumber: "KT-1", itemId: world.drugId, quantity: 8, unitCost: 1500, expiryDate: addDaysToDateString(today, 30) });
    await seedBatch(world, { invoiceNumber: "KT-2", itemId: world.drugId, quantity: 3, unitCost: 1500, expiryDate: addDaysToDateString(today, -1) });
    await seedBatch(world, { invoiceNumber: "KT-3", itemId: world.productId, quantity: 4, unitCost: 90000 });
    await seedBatch(world, { invoiceNumber: "KT-4", itemId: world.productId, quantity: 50, branchId: world.comingSoonBranchId });

    const rows = await listStockItems({ branchId: world.branchId, q: SLUG });
    const drug = rows.find((row) => row.id === world.drugId)!;
    const product = rows.find((row) => row.id === world.productId)!;
    expect(drug).toMatchObject({ onHand: 11, available: 8, value: 11 * 1500, flags: ["MENIPIS", "SEGERA_KEDALUWARSA", "KEDALUWARSA"] });
    expect(product).toMatchObject({ onHand: 4, available: 4, flags: [] });

    expect((await listStockItems({ branchId: world.branchId, kind: "OBAT", q: SLUG })).map((r) => r.id)).toEqual([world.drugId]);
    expect((await listStockItems({ branchId: world.branchId, flag: "KEDALUWARSA", q: SLUG })).map((r) => r.id)).toEqual([world.drugId]);
    expect((await listStockItems({ branchId: world.branchId, q: `${CODE}-prd` })).map((r) => r.id)).toEqual([world.productId]);
  });

  it("detail barang: batch per cabang dengan faktur asal, dan jurnal", async () => {
    const detail = await getStockItemDetail(world.drugId);
    expect(detail?.item).toMatchObject({ code: `${CODE}-OBT`, kind: "OBAT", unit: "kapsul" });
    expect(detail?.batches.map((b) => [b.invoiceNumber, b.quantityRemaining, b.expired])).toEqual([
      ["KT-2", 3, true],
      ["KT-1", 8, false],
    ]);
    expect(detail?.movements.every((m) => m.kind === "MASUK")).toBe(true);
    expect(await getStockItemDetail("tidak-ada")).toBeNull();
  });

  it("hitungan tanda stok untuk dasbor bertambah oleh barang di cabang aktif saja", async () => {
    const before = await countStockAlerts();
    const extra = await prisma.stockItem.create({
      data: { code: `${CODE}-HIT`, name: `${SLUG} Hitung`, kind: "PRODUK", unit: "pcs", minStock: 0 },
    });
    await seedBatch(world, { invoiceNumber: "KT-5", itemId: extra.id, quantity: 1, expiryDate: addDaysToDateString(today, -2) });
    await seedBatch(world, { invoiceNumber: "KT-6", itemId: extra.id, quantity: 1, expiryDate: addDaysToDateString(today, -2), branchId: world.comingSoonBranchId });
    const after = await countStockAlerts();
    expect(after.expired - before.expired).toBe(1);
  });

  it("supplier: tambah, ubah, nonaktifkan; sisa hutang hanya terlihat oleh keuangan", async () => {
    const created = await unwrap(createSupplier({ name: `${SLUG} Medika`, phone: "0812", address: "", notes: "" }));
    expect(created.name).toBe(`${SLUG} Medika`);
    await unwrap(updateSupplier(created.id, { name: `${SLUG} Medika Jaya`, phone: "0812", address: "Manado", notes: "" }));
    await unwrap(setSupplierActive(created.id, false));
    expect(await prisma.supplier.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ name: `${SLUG} Medika Jaya`, isActive: false });
    expect(await createSupplier({ name: " ", phone: "", address: "", notes: "" })).toEqual({ ok: false, error: "Isi nama supplier." });

    const forPharmacist = (await listSuppliers()).find((s) => s.id === world.supplierId);
    expect(forPharmacist?.balance).toBeNull();
    actor.role = "ADMIN_KEUANGAN";
    const forFinance = (await listSuppliers()).find((s) => s.id === world.supplierId);
    // KT-1..KT-6: 8×1500 + 3×1500 + 4×90000 + 50×1000 + 1×1000 + 1×1000
    expect(forFinance?.balance).toBe(12000 + 4500 + 360000 + 50000 + 1000 + 1000);
  });

  it("hak akses: Admin Keuangan tidak mengubah barang; Resepsionis dan Dokter tidak membaca stok", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await expect(createStockItem(item({ code: `${CODE}-X` }))).rejects.toThrow(/forbidden: stock:manage/);
    await expect(createSupplier({ name: `${SLUG} X`, phone: "", address: "", notes: "" })).rejects.toThrow(/forbidden: stock:manage/);
    for (const role of ["RESEPSIONIS", "DOKTER"] as const) {
      actor.role = role;
      await expect(listStockItems({ branchId: world.branchId })).rejects.toThrow(/forbidden: stock:read/);
      await expect(listSuppliers()).rejects.toThrow(/forbidden: stock:read/);
    }
  });
});
