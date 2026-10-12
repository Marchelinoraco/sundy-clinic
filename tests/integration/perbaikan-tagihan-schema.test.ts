// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "skema-diskon";
const WA = "6281200009501";
let world: BillingWorld;
let invoiceId: string;
let lineId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const invoice = await prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      lines: { create: [{ kind: "LAYANAN", name: "Layanan", quantity: 2, unitPrice: 50_000 }] },
    },
    select: { id: true, lines: { select: { id: true } } },
  });
  invoiceId = invoice.id;
  lineId = invoice.lines[0].id;
});
afterAll(async () => {
  await prisma.invoicePayment.deleteMany({ where: { invoiceId } });
  await prisma.clinicBankAccount.deleteMany({ where: { bankName: "Bank Skema" } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("skema perbaikan tagihan", () => {
  it("diskon baris sah: 0 tanpa sumber, atau >0 dengan sumber dan alasan, paling banyak harga baris", async () => {
    await prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 100_000, discountReason: "Uji", discountSource: "MANUAL" } });
    await prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 0, discountReason: null, discountSource: null } });
  });

  it("diskon melebihi harga baris, tanpa alasan, atau tanpa sumber ditolak", async () => {
    await expect(prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 100_001, discountReason: "x", discountSource: "MANUAL" } })).rejects.toThrow(/invoice_line_discount_range/);
    await expect(prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 10, discountReason: null, discountSource: "MANUAL" } })).rejects.toThrow(/invoice_line_discount_reason/);
    await expect(prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 10, discountReason: "x", discountSource: null } })).rejects.toThrow(/invoice_line_discount_reason/);
  });

  it("promo barang harus lengkap atau kosong sama sekali", async () => {
    await prisma.stockItem.update({ where: { id: world.productId }, data: { promoName: "Okt", promoKind: "PERSEN", promoValue: 10 } });
    await expect(prisma.stockItem.update({ where: { id: world.productId }, data: { promoName: null } })).rejects.toThrow(/stock_item_promo_shape/);
    await expect(prisma.stockItem.update({ where: { id: world.productId }, data: { promoValue: 101 } })).rejects.toThrow(/stock_item_promo_shape/);
    await expect(
      prisma.stockItem.update({ where: { id: world.productId }, data: { promoStartsOn: new Date("2026-10-10"), promoEndsOn: new Date("2026-10-09") } }),
    ).rejects.toThrow(/stock_item_promo_shape/);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { promoName: null, promoKind: null, promoValue: 0 } });
  });

  it("rekening tujuan dan labelnya terisi bersamaan", async () => {
    const account = await prisma.clinicBankAccount.create({ data: { bankName: "Bank Skema", accountNumber: "1234567", accountHolder: "SunDY" } });
    await expect(
      prisma.invoicePayment.create({ data: { invoiceId, amount: 1, method: "TRANSFER", paidAt: new Date("2026-10-13"), staffId: "s", staffName: "Uji", clinicBankAccountId: account.id } }),
    ).rejects.toThrow(/invoice_payment_destination_pair/);
  });
});
