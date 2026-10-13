// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoiceFromVisit, setInvoiceDiscount } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Margin", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "margin-tagihan";
const WA = "6281200009707";
let world: BillingWorld;
let invoiceId: string;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await prisma.service.update({ where: { id: world.treatmentId }, data: { promoPrice: 250_000, materialCost: 40_000, toolCost: 10_000, commissionKind: "NOMINAL", commissionValue: 25_000 } });
  actor.role = "RESEPSIONIS";
  const { appointmentId } = await finalVisit(world);
  invoiceId = (await unwrap(createInvoiceFromVisit(appointmentId))).id;
  await unwrap(setInvoiceDiscount({ invoiceId, version: await versionOf(invoiceId), kind: "NOMINAL", value: 20_000, reason: "Member" }));
  await unwrap(finalizeInvoice({ invoiceId, version: await versionOf(invoiceId) }));
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("margin tagihan final", () => {
  it("ringkasan: pendapatan bersih dikurangi bahan, alat, dan komisi; per baris treatment", async () => {
    const detail = (await getInvoiceDetail(invoiceId))!;
    const revenue = detail.totals.total;
    expect(detail.margin).toEqual({ revenue, stockCost: 0, materialCost: 40_000, toolCost: 10_000, commission: 25_000, margin: revenue - 75_000, missingStockCost: false });
    const treatment = detail.lines.find((line) => line.kind === "TREATMENT")!;
    expect(treatment.costing).toEqual({ stockCost: null, materialCost: 40_000, toolCost: 10_000, commission: 25_000, cost: 75_000, margin: treatment.amount - 75_000 });
  });

  it("resepsionis tidak menerima angka margin (Review Focus 5)", async () => {
    actor.role = "RESEPSIONIS";
    const detail = (await getInvoiceDetail(invoiceId))!;
    expect(detail.margin).toBeNull();
    expect(detail.lines.every((line) => line.costing === null)).toBe(true);
  });
});
