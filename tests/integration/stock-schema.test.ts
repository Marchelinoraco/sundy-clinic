// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";

const SLUG = "skema-stok";
const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("skema stok dan hutang", () => {
  let world: StockWorld;

  beforeAll(async () => {
    await cleanupStockWorld(SLUG);
    world = await createStockWorld(SLUG);
  });

  afterAll(async () => {
    await cleanupStockWorld(SLUG);
    await prisma.$disconnect();
  });

  const invoice = (invoiceNumber: string, dueDate = "2026-10-31") =>
    prisma.purchaseInvoice.create({
      data: {
        supplierId: world.supplierId,
        branchId: world.branchId,
        invoiceNumber,
        invoiceDate: day("2026-10-01"),
        dueDate: day(dueDate),
        total: 50000,
        createdById: "s1",
        createdByName: "Apoteker Uji",
      },
    });

  it("nomor faktur unik per supplier", async () => {
    await invoice("SK-1");
    await expect(invoice("SK-1")).rejects.toThrow(/Unique constraint/);
  });

  it("jatuh tempo tidak boleh sebelum tanggal faktur", async () => {
    await expect(invoice("SK-2", "2026-09-30")).rejects.toThrow(/purchase_invoice_dates/);
  });

  it("baris faktur wajib berjumlah positif dan sisa batch tidak pernah minus", async () => {
    const { invoiceId, batchId } = await seedBatch(world, { invoiceNumber: "SK-3", itemId: world.drugId, quantity: 10 });
    await expect(
      prisma.purchaseLine.create({ data: { invoiceId, itemId: world.drugId, quantity: 0, unitCost: 5000 } }),
    ).rejects.toThrow(/purchase_line_values/);
    await expect(prisma.stockBatch.update({ where: { id: batchId }, data: { quantityRemaining: -1 } })).rejects.toThrow(
      /stock_batch_remaining_nonnegative/,
    );
  });

  it("penyesuaian wajib beralasan; jenis lain tanpa alasan; jumlah tidak boleh 0", async () => {
    const { batchId } = await seedBatch(world, { invoiceNumber: "SK-4", itemId: world.drugId, quantity: 5 });
    const movement = (data: Record<string, unknown>) =>
      prisma.stockMovement.create({ data: { batchId, staffId: "s1", staffName: "Uji", kind: "PENYESUAIAN", quantity: -1, ...data } });
    await expect(movement({})).rejects.toThrow(/stock_movement_reason/);
    await expect(movement({ kind: "MASUK", quantity: 1, reason: "RUSAK" })).rejects.toThrow(/stock_movement_reason/);
    await expect(movement({ reason: "RUSAK", quantity: 0 })).rejects.toThrow(/stock_movement_nonzero/);
    expect((await movement({ reason: "RUSAK" })).quantity).toBe(-1);
  });

  it("pembayaran harus lebih dari 0", async () => {
    const created = await invoice("SK-5");
    await expect(
      prisma.supplierPayment.create({
        data: { invoiceId: created.id, kind: "BAYAR", amount: 0, method: "TUNAI", paidAt: day("2026-10-02"), staffId: "s1", staffName: "Uji" },
      }),
    ).rejects.toThrow(/supplier_payment_amount_positive/);
  });
});
