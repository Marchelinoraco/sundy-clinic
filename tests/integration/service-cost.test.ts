// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { updateServiceCost, updateServicePrice } from "@/server/service-admin";
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
    await unwrap(updateServiceCost({ id: world.treatmentId, materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 }));
    expect(await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).toMatchObject({ materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service.cost", entityId: world.treatmentId } })).summary).toBe(
      "Facial Uji: bahan Rp 40.000 · alat Rp 10.000 · komisi 10%",
    );
    expect(await updateServiceCost({ id: world.treatmentId, materialCost: 0, toolCost: 0, commissionKind: "PERSEN", commissionValue: 0 })).toEqual({ ok: false, error: "Komisi persen 1–100." });
  });

  it("Admin Keuangan mengubah harga jual; resepsionis tidak bisa keduanya", async () => {
    await unwrap(updateServicePrice({ id: world.treatmentId, normalPrice: null, promoPrice: 260_000 }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).promoPrice).toBe(260_000);
    actor.role = "RESEPSIONIS";
    await expect(updateServiceCost({ id: world.treatmentId, materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 })).rejects.toThrow("forbidden: price:manage");
    await expect(updateServicePrice({ id: world.treatmentId, normalPrice: null, promoPrice: 1 })).rejects.toThrow("forbidden: price:manage");
  });
});
