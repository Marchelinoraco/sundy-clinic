// @vitest-environment node
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { getMarginReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Margin", role: "ADMIN_KEUANGAN" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "laporan-margin";
const WA = "6281200009709";
let world: BillingWorld;
let seq = 0;
const number = () => `TG-2098-${String(++seq).padStart(4, "0")}`;

async function finalInvoice(lines: Prisma.InvoiceLineUncheckedCreateWithoutInvoiceInput[], extra: Partial<Prisma.InvoiceUncheckedCreateInput> = {}, status: "FINAL" | "DIBATALKAN" = "FINAL") {
  return prisma.invoice.create({
    data: { patientId: world.patientId, branchId: world.branchId, createdById: "s", createdByName: "Uji", status, number: number(), finalizedAt: new Date(), lines: { create: lines }, ...extra },
  });
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const packageId = await catalogPackage(world, { name: "Paket Margin" });
  const purchase = await prisma.purchaseInvoice.create({
    data: { supplierId: world.supplierId, branchId: world.branchId, invoiceNumber: `${SLUG}-1`, invoiceDate: new Date(), dueDate: new Date(), total: 4000, createdById: "s", createdByName: "Uji" },
  });
  const purchaseLine = await prisma.purchaseLine.create({ data: { invoiceId: purchase.id, itemId: world.productId, quantity: 2, unitCost: 2000 } });
  const batch = await prisma.stockBatch.create({ data: { itemId: world.productId, branchId: world.branchId, purchaseLineId: purchaseLine.id, unitCost: 2000, quantityReceived: 2, quantityRemaining: 0 } });
  await finalInvoice(
    [
      { kind: "TREATMENT", name: "Facial Uji", quantity: 2, unitPrice: 250_000, discountAmount: 50_000, discountReason: "Member", discountSource: "MANUAL", serviceId: world.treatmentId, materialCost: 80_000, toolCost: 20_000, commissionAmount: 50_000, performerId: world.therapistId, performerName: "Terapis Uji" },
      { kind: "BARANG", name: "Serum C", quantity: 2, unitPrice: 150_000, itemId: world.productId, stockUses: { create: [{ batchId: batch.id, quantity: 2, unitCost: 2000 }] } },
      { kind: "PAKET", name: "Paket Margin", quantity: 1, unitPrice: 600_000, treatmentPackageId: packageId },
      { kind: "LAYANAN", name: "Konsultasi Dokter", quantity: 1, unitPrice: 150_000, serviceId: world.consultationId },
    ],
    { discountKind: "NOMINAL", discountValue: 30_000, discountReason: "Promo", discountByName: "Uji" },
  );
  await finalInvoice([{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, materialCost: 40_000 }], {}, "DIBATALKAN");
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("laporan margin", () => {
  it("per kelompok, per barang, per treatment; diskon tagihan terpisah; tagihan dibatalkan tidak dihitung", async () => {
    const report = await getMarginReport({ period: monthPeriod(witaDateString(new Date()).slice(0, 7)), branchId: world.branchId });
    expect(report.goods).toEqual({ revenue: 300_000, stockCost: 4000, materialCost: 0, toolCost: 0, commission: 0 });
    expect(report.treatment).toEqual({ revenue: 450_000, stockCost: 0, materialCost: 80_000, toolCost: 20_000, commission: 50_000 });
    expect(report.packageRevenue).toBe(600_000);
    expect(report.serviceRevenue).toBe(150_000);
    expect(report.invoiceDiscount).toBe(30_000);
    expect(report.byItem).toEqual([{ name: "Serum C", quantity: 2, revenue: 300_000, cost: 4000 }]);
    expect(report.byTreatment).toEqual([{ name: "Facial Uji", quantity: 2, revenue: 450_000, materialCost: 80_000, toolCost: 20_000, commission: 50_000 }]);
  });
});
