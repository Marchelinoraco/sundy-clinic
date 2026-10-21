// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { updateServicePrice, updateServicePricing } from "@/server/service-admin";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Biaya", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "biaya-layanan";
const WA = "6281200009704";
let world: BillingWorld;

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

describe("biaya dan harga treatment oleh Admin Keuangan", () => {
  it("mengisi biaya bahan, alat, dan komisi; tercatat di audit", async () => {
    const plain = { id: world.treatmentId, normalPrice: null, promoPrice: 250_000, otherCosts: [] };
    await unwrap(updateServicePricing({ ...plain, materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 }));
    expect(await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).toMatchObject({ materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service.pricing", entityId: world.treatmentId } })).summary).toBe(
      "Facial Uji: harga Rp 250.000; bahan Rp 40.000 · alat Rp 10.000 · komisi 10%",
    );
    expect(await updateServicePricing({ ...plain, materialCost: 0, toolCost: 0, commissionKind: "PERSEN", commissionValue: 0 })).toEqual({ ok: false, error: "Komisi persen 1–100." });
  });

  it("Admin Keuangan mengubah harga jual; resepsionis tidak bisa keduanya", async () => {
    await unwrap(updateServicePrice({ id: world.treatmentId, normalPrice: null, promoPrice: 260_000 }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).promoPrice).toBe(260_000);
    actor.role = "RESEPSIONIS";
    await expect(updateServicePrice({ id: world.treatmentId, normalPrice: null, promoPrice: 1 })).rejects.toThrow("forbidden: price:manage");
    await expect(updateServicePricing(pricing())).rejects.toThrow("forbidden: price:manage");
  });
});

const pricing = (patch: Partial<Parameters<typeof updateServicePricing>[0]> = {}): Parameters<typeof updateServicePricing>[0] => ({
  id: world.treatmentId,
  normalPrice: null,
  promoPrice: 149_000,
  materialCost: 20_000,
  toolCost: 10_000,
  commissionKind: "NOMINAL",
  commissionValue: 15_000,
  otherCosts: [
    { name: "Laundry", amount: 5000 },
    { name: "Listrik", amount: 3000 },
  ],
  ...patch,
});
const costLines = async () =>
  (await prisma.serviceCostLine.findMany({ where: { serviceId: world.treatmentId }, orderBy: { sortOrder: "asc" } })).map((line) => [line.name, line.amount, line.sortOrder]);

describe("Harga & biaya (spec biaya lainnya)", () => {
  it("harga, biaya, dan biaya lainnya tersimpan sekaligus; urutan dijaga; audit", async () => {
    await unwrap(updateServicePricing(pricing({ normalPrice: 189_000, otherCosts: [{ name: " Laundry ", amount: 5000 }, { name: "", amount: null }, { name: "Listrik", amount: 3000 }] })));
    expect(await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).toMatchObject({
      normalPrice: 189_000,
      promoPrice: 149_000,
      materialCost: 20_000,
      toolCost: 10_000,
      commissionKind: "NOMINAL",
      commissionValue: 15_000,
    });
    expect(await costLines()).toEqual([
      ["Laundry", 5000, 0],
      ["Listrik", 3000, 1],
    ]);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service.pricing", entityId: world.treatmentId }, orderBy: { createdAt: "desc" } })).summary).toBe(
      "Facial Uji: harga Rp 149.000; bahan Rp 20.000 · alat Rp 10.000 · komisi Rp 15.000/sesi · lainnya Rp 8.000",
    );
    await unwrap(updateServicePricing(pricing({ otherCosts: [{ name: "Listrik", amount: 3000 }] })));
    expect(await costLines()).toEqual([["Listrik", 3000, 0]]);
  });

  it("total biaya melebihi harga berlaku ditolak tanpa mengubah apa pun; sama dengan harga boleh (BL4)", async () => {
    await unwrap(updateServicePricing(pricing()));
    expect(await updateServicePricing(pricing({ promoPrice: 52_999 }))).toEqual({
      ok: false,
      error: "Total biaya Rp 53.000 melebihi harga berlaku Rp 52.999. Naikkan harga berlaku atau kurangi biaya.",
    });
    expect((await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).promoPrice).toBe(149_000);
    expect(await costLines()).toHaveLength(2);
    expect(await updateServicePricing(pricing({ otherCosts: [{ name: "A", amount: 1 }, { name: "a", amount: 2 }] }))).toEqual({ ok: false, error: 'Nama biaya lainnya "a" dipakai dua kali.' });
    expect(await updateServicePricing(pricing({ promoPrice: 0 }))).toEqual({ ok: false, error: "Harga harus lebih dari nol." });
    await unwrap(updateServicePricing(pricing({ promoPrice: 53_000 })));
  });

  it("harga di tabel tidak boleh turun di bawah biaya; harga coret saja tetap boleh pada layanan yang terlanjur rugi (BL13, Review Focus 4)", async () => {
    await unwrap(updateServicePricing(pricing()));
    expect(await updateServicePrice({ id: world.treatmentId, normalPrice: null, promoPrice: 50_000 })).toEqual({
      ok: false,
      error: "Harga berlaku Rp 50.000 di bawah total biaya per sesi Rp 53.000. Naikkan harga atau kurangi biaya lewat tombol Harga & biaya.",
    });
    await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 200_000 } });
    await unwrap(updateServicePrice({ id: world.treatmentId, normalPrice: 200_000, promoPrice: 149_000 }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).normalPrice).toBe(200_000);
    await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
    await prisma.serviceCostLine.deleteMany({ where: { serviceId: world.treatmentId } });
  });
});
