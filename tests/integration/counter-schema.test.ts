// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";

const SLUG = "skema-meja";
let world: StockWorld;

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
});
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("skema stok meja (spec stok meja 2)", () => {
  it("batch baru: meja 0; meja tidak boleh minus; batas meja tidak boleh minus", async () => {
    const { batchId } = await seedBatch(world, { invoiceNumber: "SKM-1", itemId: world.productId, quantity: 5 });
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } })).counterRemaining).toBe(0);
    await expect(prisma.stockBatch.update({ where: { id: batchId }, data: { counterRemaining: -1 } })).rejects.toThrow(/stock_batch_counter_nonnegative/);
    await expect(prisma.stockItem.update({ where: { id: world.productId }, data: { counterMinStock: -1 } })).rejects.toThrow(/stock_item_counter_min_nonnegative/);
  });

  it("jurnal MASUK dan RETUR selalu di gudang; PINDAH boleh di meja", async () => {
    const { batchId } = await seedBatch(world, { invoiceNumber: "SKM-2", itemId: world.productId, quantity: 5 });
    const base = { batchId, quantity: 1, staffId: "s", staffName: "Uji" };
    expect((await prisma.stockMovement.findFirstOrThrow({ where: { batchId, kind: "MASUK" } })).location).toBe("GUDANG");
    await expect(prisma.stockMovement.create({ data: { ...base, kind: "MASUK", location: "MEJA" } })).rejects.toThrow(/stock_movement_location/);
    await expect(prisma.stockMovement.create({ data: { ...base, kind: "RETUR", location: "MEJA" } })).rejects.toThrow(/stock_movement_location/);
    expect((await prisma.stockMovement.create({ data: { ...base, kind: "PINDAH", location: "MEJA" } })).location).toBe("MEJA");
  });

  it("permintaan: keputusan dan alasan tolak sesuai status; jumlah minta > 0", async () => {
    const base = { branchId: world.branchId, requestedById: "s", requestedByName: "Rina" };
    const request = await prisma.restockRequest.create({
      data: { ...base, lines: { create: [{ itemId: world.productId, itemName: "Serum", requestedQuantity: 2 }] } },
      include: { lines: true },
    });
    expect(request).toMatchObject({ status: "MENUNGGU", version: 1, decidedAt: null });
    await expect(prisma.restockRequest.update({ where: { id: request.id }, data: { status: "SELESAI" } })).rejects.toThrow(/restock_request_decision/);
    await expect(
      prisma.restockRequest.update({ where: { id: request.id }, data: { status: "SELESAI", decidedAt: new Date(), decidedById: "a", decidedByName: "Apoteker", rejectReason: "x" } }),
    ).rejects.toThrow(/restock_request_decision/);
    await expect(
      prisma.restockRequest.update({ where: { id: request.id }, data: { status: "DITOLAK", decidedAt: new Date(), decidedById: "a", decidedByName: "Apoteker" } }),
    ).rejects.toThrow(/restock_request_decision/);
    await expect(prisma.restockRequestLine.update({ where: { id: request.lines[0].id }, data: { requestedQuantity: 0 } })).rejects.toThrow(/restock_line_values/);
    await expect(prisma.restockRequestLine.update({ where: { id: request.lines[0].id }, data: { sentQuantity: -1 } })).rejects.toThrow(/restock_line_values/);
  });
});
