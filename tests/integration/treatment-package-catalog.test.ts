// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createTreatmentPackage,
  listPackageServices,
  listPackageStockItems,
  listSellablePackages,
  listTreatmentPackages,
  setTreatmentPackageActive,
  updateTreatmentPackage,
} from "@/server/treatment-package-catalog";
import { billingBatch, cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Paket", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "katalog-paket";
const WA = "6281200009602";
let world: BillingWorld;
const input = () => ({
  name: `${SLUG} Facial Glow 5x`,
  price: 1_500_000,
  validDays: 180,
  description: "",
  items: [
    { serviceId: world.treatmentId, sessions: 5 },
    { serviceId: world.slimmingTreatmentId, sessions: 1 },
  ],
});

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("katalog paket treatment", () => {
  it("Admin Keuangan membuat, mengubah, menonaktifkan; isi dan audit tercatat", async () => {
    const { id } = await unwrap(createTreatmentPackage(input()));
    const created = (await listTreatmentPackages()).find((row) => row.id === id)!;
    expect(created).toMatchObject({ name: `${SLUG} Facial Glow 5x`, price: 1_500_000, validDays: 180, description: null, isActive: true, soldCount: 0 });
    expect(created.contents).toBe("5× Facial Uji, 1× Meso Uji");
    expect(await prisma.auditLog.count({ where: { action: "treatment-package.create", entityId: id } })).toBe(1);

    await unwrap(updateTreatmentPackage(id, { ...input(), price: 1_200_000, items: [{ serviceId: world.treatmentId, sessions: 4 }] }));
    const updated = (await listTreatmentPackages()).find((row) => row.id === id)!;
    expect(updated).toMatchObject({ price: 1_200_000, contents: "4× Facial Uji" });
    expect(await prisma.auditLog.count({ where: { action: "treatment-package.update", entityId: id } })).toBe(1);

    expect((await listSellablePackages().catch(() => null)) ?? "forbidden").toBe("forbidden");
    actor.role = "RESEPSIONIS";
    expect((await listSellablePackages()).map((row) => row.id)).toContain(id);
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(setTreatmentPackageActive(id, false));
    actor.role = "RESEPSIONIS";
    expect((await listSellablePackages()).map((row) => row.id)).not.toContain(id);
    actor.role = "ADMIN_KEUANGAN";
    expect(await prisma.auditLog.count({ where: { action: "treatment-package.deactivate", entityId: id } })).toBe(1);
  });

  it("nama ganda di antara paket aktif dan treatment nonaktif ditolak", async () => {
    const name = `${SLUG} Ganda`;
    await unwrap(createTreatmentPackage({ ...input(), name }));
    expect(await createTreatmentPackage({ ...input(), name: name.toUpperCase() })).toEqual({ ok: false, error: "Paket dengan nama ini sudah ada." });
    await prisma.service.update({ where: { id: world.slimmingTreatmentId }, data: { isActive: false } });
    expect(await createTreatmentPackage({ ...input(), name: `${SLUG} Lain` })).toEqual({ ok: false, error: "Treatment tidak ditemukan atau nonaktif." });
    await prisma.service.update({ where: { id: world.slimmingTreatmentId }, data: { isActive: true } });
    expect(await createTreatmentPackage({ ...input(), items: [] })).toEqual({ ok: false, error: "Tambahkan minimal satu isi paket." });
  });

  it("paket berisi treatment dan barang: isi tersimpan dengan satuan; barang nonaktif ditolak (spec paket barang PB1)", async () => {
    await billingBatch(world, { invoiceNumber: `${SLUG}-AMX`, itemId: world.drugId, quantity: 100, unitCost: 1000 });
    const { id } = await unwrap(
      createTreatmentPackage({ ...input(), name: `${SLUG} Lux`, items: [{ serviceId: world.treatmentId, sessions: 4 }, { itemId: world.drugId, sessions: 30 }] }),
    );
    const created = (await listTreatmentPackages()).find((row) => row.id === id)!;
    expect(created.contents).toBe(`4× Facial Uji, 30 kapsul ${SLUG} Amoxicillin`);
    expect(created.items).toEqual([
      { serviceId: world.treatmentId, itemId: null, serviceName: "Facial Uji", unit: null, sessions: 4 },
      { serviceId: null, itemId: world.drugId, serviceName: `${SLUG} Amoxicillin`, unit: "kapsul", sessions: 30 },
    ]);
    expect((await listPackageStockItems()).find((item) => item.id === world.drugId)).toMatchObject({ name: `${SLUG} Amoxicillin`, unit: "kapsul" });

    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: false } });
    expect(await createTreatmentPackage({ ...input(), name: `${SLUG} Serum`, items: [{ itemId: world.productId, sessions: 1 }] })).toEqual({
      ok: false,
      error: "Barang tidak ditemukan atau nonaktif.",
    });
    expect((await listPackageStockItems()).map((item) => item.id)).not.toContain(world.productId);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: true } });
  });

  it("pilihan isi membawa harga jual dan biaya: biaya per sesi treatment, harga beli terakhir barang (spec paket informatif PI1, PI8)", async () => {
    await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 40_000 } });
    await prisma.serviceCostLine.create({ data: { serviceId: world.treatmentId, name: "Laundry", amount: 5000 } });
    try {
      const facial = (await listPackageServices()).find((service) => service.id === world.treatmentId)!;
      expect(facial).toMatchObject({ name: "Facial Uji", price: (await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).promoPrice, costPerSession: 45_000 });
    } finally {
      await prisma.serviceCostLine.deleteMany({ where: { serviceId: world.treatmentId } });
      await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0 } });
    }
    await billingBatch(world, { invoiceNumber: `${SLUG}-AMX-1`, itemId: world.drugId, quantity: 10, unitCost: 1200 });
    await billingBatch(world, { invoiceNumber: `${SLUG}-AMX-2`, itemId: world.drugId, quantity: 10, unitCost: 1500 });
    const unpriced = await billingBatch(world, { invoiceNumber: `${SLUG}-AMX-3`, itemId: world.drugId, quantity: 10, unitCost: 1 });
    await prisma.stockBatch.update({ where: { id: unpriced.batchId }, data: { unitCost: null } });
    expect((await listPackageStockItems()).find((item) => item.id === world.drugId)).toMatchObject({ sellPrice: 2000, lastUnitCost: 1500 });
    expect((await listPackageStockItems()).find((item) => item.id === world.productId)).toMatchObject({ sellPrice: 150_000, lastUnitCost: null });
  });

  it("server menolak barang tanpa harga beli dan harga paket di bawah biaya; sama dengan biaya boleh (PI3, PI4)", async () => {
    expect(await createTreatmentPackage({ ...input(), name: `${SLUG} Serum`, items: [{ itemId: world.productId, sessions: 1 }] })).toEqual({
      ok: false,
      error: `Harga beli ${SLUG} Serum C belum diisi. Isi di Stok → Barang masuk.`,
    });
    await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 100_000 } });
    try {
      expect(await createTreatmentPackage({ ...input(), name: `${SLUG} Murah`, price: 399_999, items: [{ serviceId: world.treatmentId, sessions: 4 }] })).toEqual({
        ok: false,
        error: "Harga paket Rp 399.999 di bawah total biaya isi Rp 400.000. Naikkan harga paket atau kurangi isinya.",
      });
      const { id } = await unwrap(createTreatmentPackage({ ...input(), name: `${SLUG} Pas`, price: 400_000, items: [{ serviceId: world.treatmentId, sessions: 4 }] }));
      expect(await updateTreatmentPackage(id, { ...input(), name: `${SLUG} Pas`, price: 300_000, items: [{ serviceId: world.treatmentId, sessions: 4 }] })).toEqual({
        ok: false,
        error: "Harga paket Rp 300.000 di bawah total biaya isi Rp 400.000. Naikkan harga paket atau kurangi isinya.",
      });
      // Biaya naik sesudah paket disimpan: katalog menandai selisih negatif tanpa memblokir (PI6).
      await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 120_000 } });
      expect((await listTreatmentPackages()).find((row) => row.id === id)).toMatchObject({ price: 400_000, cost: 480_000 });
    } finally {
      await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0 } });
    }
  });

  it("resepsionis tidak bisa mengelola katalog", async () => {
    actor.role = "RESEPSIONIS";
    await expect(createTreatmentPackage(input())).rejects.toThrow("forbidden: price:manage");
    await expect(listTreatmentPackages()).rejects.toThrow("forbidden: price:manage");
  });
});
