// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getDispensingDetail, listDispensings } from "@/server/dispensing-read";
import { reopenDispensing } from "@/server/dispensing-lifecycle";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Apoteker Uji", role: "APOTEKER" as const, email: "u@uji.test" } }));
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

const SLUG = "resep-dari-dokter";
const WA = "6281200009733";
let world: BillingWorld;
let dispensingId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const { appointmentId } = await finalVisit(world);
  dispensingId = (await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 2 }] })).id;
  await prisma.dispensing.update({ where: { id: dispensingId }, data: { source: "DOKTER" } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("resep dokter di menu Resep (spec resep dokter 6)", () => {
  it("tampil di tab Selesai sebagai dari dokter, baca-saja", async () => {
    expect((await listDispensings({ view: "SELESAI" })).find((r) => r.id === dispensingId)?.source).toBe("DOKTER");
    expect(await getDispensingDetail(dispensingId)).toMatchObject({ source: "DOKTER", canReopen: false });
  });

  it("Apoteker tidak bisa membuka kembali resep dokter", async () => {
    expect(await reopenDispensing({ dispensingId })).toEqual({ ok: false, error: "Resep dari dokter tidak diubah di sini." });
    expect((await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } })).status).toBe("SELESAI");
  });
});
