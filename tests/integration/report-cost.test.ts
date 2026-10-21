// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { getProfitReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Laporan", role: "ADMIN_KEUANGAN" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "laporan-modal";
const WA = "6281200009708";
let world: BillingWorld;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const purchase = await prisma.purchaseInvoice.create({
    data: {
      supplierId: world.supplierId,
      branchId: world.branchId,
      invoiceNumber: `${SLUG}-1`,
      invoiceDate: new Date(),
      dueDate: new Date(),
      total: null,
      createdById: "s",
      createdByName: "Uji",
      lines: { create: [{ itemId: world.productId, quantity: 5, unitCost: null }] },
    },
    select: { lines: { select: { id: true } } },
  });
  const batch = await prisma.stockBatch.create({ data: { itemId: world.productId, branchId: world.branchId, purchaseLineId: purchase.lines[0].id, unitCost: null, quantityReceived: 5, quantityRemaining: 4 } });
  const priced = await prisma.purchaseLine.create({ data: { invoiceId: (await prisma.purchaseInvoice.findFirstOrThrow({ where: { invoiceNumber: `${SLUG}-1` } })).id, itemId: world.productId, quantity: 1, unitCost: 3000 } });
  const pricedBatch = await prisma.stockBatch.create({ data: { itemId: world.productId, branchId: world.branchId, purchaseLineId: priced.id, unitCost: 3000, quantityReceived: 1, quantityRemaining: 0 } });
  await prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      status: "FINAL",
      number: `TG-2099-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      finalizedAt: new Date(),
      lines: {
        create: [
          { kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, materialCost: 40_000, toolCost: 10_000, otherCost: 8000, commissionAmount: 25_000, performerId: world.therapistId, performerName: "Terapis Uji" },
          {
            kind: "BARANG",
            name: "Serum C",
            quantity: 2,
            unitPrice: 150_000,
            itemId: world.productId,
            stockUses: { create: [{ batchId: batch.id, quantity: 1, unitCost: null }, { batchId: pricedBatch.id, quantity: 1, unitCost: 3000 }] },
          },
        ],
      },
    },
  });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("harga pokok laporan untung-rugi", () => {
  it("harga pokok = barang + bahan + alat + biaya lainnya; komisi tidak ikut; harga pokok kosong dihitung dan diperingatkan", async () => {
    const report = await getProfitReport({ period: monthPeriod(witaDateString(new Date()).slice(0, 7)), branchId: world.branchId });
    expect(report.current.totals.cogs).toBe(3000 + 40_000 + 10_000 + 8000);
    expect(report.current.missingCost).toBe(1);
  });
});
