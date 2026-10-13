// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "skema-modal";
const WA = "6281200009701";
let world: BillingWorld;
let invoiceId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  invoiceId = (await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, createdById: "s", createdByName: "Uji" } })).id;
});
afterAll(async () => {
  await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("skema harga modal", () => {
  it("biaya dan komisi layanan masuk akal", async () => {
    const set = (data: Record<string, unknown>) => prisma.service.update({ where: { id: world.treatmentId }, data });
    await expect(set({ materialCost: -1 })).rejects.toThrow(/service_cost_values/);
    await expect(set({ commissionKind: null, commissionValue: 5 })).rejects.toThrow(/service_cost_values/);
    await expect(set({ commissionKind: "PERSEN", commissionValue: 101 })).rejects.toThrow(/service_cost_values/);
    await expect(set({ commissionKind: "NOMINAL", commissionValue: 0 })).rejects.toThrow(/service_cost_values/);
    expect((await set({ materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 })).commissionValue).toBe(10);
  });

  it("baris tagihan: biaya tidak negatif; pelaksana hanya untuk treatment dan lengkap berpasangan", async () => {
    const line = (data: Record<string, unknown>) => prisma.invoiceLine.create({ data: { invoiceId, kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, ...data } });
    await expect(line({ commissionAmount: -1 })).rejects.toThrow(/invoice_line_cost_values/);
    await expect(line({ performerId: "p1" })).rejects.toThrow(/invoice_line_cost_values/);
    await expect(line({ kind: "LAYANAN", performerId: "p1", performerName: "Rina" })).rejects.toThrow(/invoice_line_cost_values/);
    expect((await line({ performerId: "p1", performerName: "Rina", materialCost: 40_000 })).performerName).toBe("Rina");
  });

  it("harga beli dan total faktur boleh kosong (menunggu harga)", async () => {
    const purchase = await prisma.purchaseInvoice.create({
      data: {
        supplierId: world.supplierId,
        branchId: world.branchId,
        invoiceNumber: `${SLUG}-1`,
        invoiceDate: new Date("2031-01-01T00:00:00Z"),
        dueDate: new Date("2031-01-31T00:00:00Z"),
        total: null,
        createdById: "s",
        createdByName: "Uji",
        lines: { create: [{ itemId: world.productId, quantity: 2, unitCost: null }] },
      },
      select: { total: true, lines: { select: { id: true, unitCost: true } } },
    });
    expect(purchase.total).toBeNull();
    const batch = await prisma.stockBatch.create({
      data: { itemId: world.productId, branchId: world.branchId, purchaseLineId: purchase.lines[0].id, unitCost: null, quantityReceived: 2, quantityRemaining: 2 },
    });
    expect(batch.unitCost).toBeNull();
  });
});
