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

  it("biaya lainnya: nama 1–60, nominal 1..2 miliar; ikut terhapus bersama layanan (spec biaya lainnya BL11)", async () => {
    const cost = (data: { name: string; amount: number }) => prisma.serviceCostLine.create({ data: { serviceId: world.treatmentId, ...data } });
    await expect(cost({ name: "  ", amount: 3000 })).rejects.toThrow(/service_cost_line_values/);
    await expect(cost({ name: "x".repeat(61), amount: 3000 })).rejects.toThrow(/service_cost_line_values/);
    await expect(cost({ name: "Listrik", amount: 0 })).rejects.toThrow(/service_cost_line_values/);
    await expect(cost({ name: "Listrik", amount: 2_000_000_001 })).rejects.toThrow(/service_cost_line_values/);
    expect((await cost({ name: "Listrik", amount: 3000 })).amount).toBe(3000);
    await prisma.serviceCostLine.deleteMany({ where: { serviceId: world.treatmentId } });
  });

  it("salinan biaya lainnya baris tagihan tidak negatif", async () => {
    const line = (data: Record<string, unknown>) => prisma.invoiceLine.create({ data: { invoiceId, kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, ...data } });
    await expect(line({ otherCost: -1 })).rejects.toThrow(/invoice_line_cost_values/);
    expect((await line({ otherCost: 8000 })).otherCost).toBe(8000);
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
