// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { cancelRestockRequest, createRestockRequest, rejectRestockRequest, sendRestockRequest } from "@/server/restock";
import { countPendingRestock, getRestockRequest, listRestockRequests } from "@/server/restock-read";
import { createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s1", name: "Rina", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" } }));
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

const SLUG = "minta-meja";
const today = witaDateString(new Date());
let world: StockWorld;
let seq = 0;
let itemSeq = 0;

const as = (role: Role, name = role === "APOTEKER" ? "Apoteker Uji" : "Rina") => {
  actor.role = role;
  actor.name = name;
};
const newItem = async (warehouse: number) => {
  itemSeq += 1;
  const item = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-${itemSeq}`, name: `${SLUG} Barang ${itemSeq}`, kind: "PRODUK", unit: "pcs", sellPrice: 1000 } });
  seq += 1;
  const batch = await seedBatch(world, { invoiceNumber: `MM-${seq}`, itemId: item.id, quantity: warehouse, expiryDate: addDaysToDateString(today, 100) });
  return { ...item, ...batch };
};
const request = (itemIds: string[], quantity = 10) =>
  createRestockRequest({ branchId: world.branchId, note: "", lines: itemIds.map((itemId) => ({ itemId, quantity })) });
const linesOf = async (requestId: string) => (await prisma.restockRequestLine.findMany({ where: { requestId }, orderBy: { sortOrder: "asc" } }));

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
});
beforeEach(() => as("RESEPSIONIS"));
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("permintaan restock (spec stok meja 4)", () => {
  it("resepsionis meminta; barang yang masih diminta tidak bisa diminta lagi", async () => {
    const a = await newItem(20);
    const { id } = await unwrap(request([a.id]));
    expect(await prisma.restockRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "MENUNGGU", requestedByName: "Rina", branchId: world.branchId });
    expect((await linesOf(id))[0]).toMatchObject({ itemId: a.id, itemName: a.name, requestedQuantity: 10, sentQuantity: null });
    expect(await request([a.id])).toEqual({ ok: false, error: `${a.name} sudah ada di permintaan yang menunggu.` });
    expect(await prisma.auditLog.count({ where: { action: "restock.request", entityId: id } })).toBe(1);
  });

  it("dua permintaan bersamaan untuk barang yang sama: hanya satu tersimpan (Review Focus 2)", async () => {
    const a = await newItem(20);
    const results = await Promise.all([request([a.id]), request([a.id])]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.restockRequestLine.count({ where: { itemId: a.id } })).toBe(1);
  });

  it("Apoteker tidak meminta; resepsionis tidak mengirim", async () => {
    const a = await newItem(5);
    as("APOTEKER");
    await expect(request([a.id])).rejects.toThrow("forbidden: restock:request");
    as("RESEPSIONIS");
    const { id } = await unwrap(request([a.id]));
    await expect(sendRestockRequest({ requestId: id, version: 1, lines: [] })).rejects.toThrow("forbidden: stock:manage");
  });

  it("dibatalkan peminta selama menunggu; sesudahnya tidak bisa dikirim", async () => {
    const a = await newItem(5);
    const { id } = await unwrap(request([a.id]));
    await unwrap(cancelRestockRequest({ requestId: id, version: 1 }));
    expect(await prisma.restockRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DIBATALKAN", decidedByName: "Rina", version: 2 });
    as("APOTEKER");
    const [line] = await linesOf(id);
    expect(await sendRestockRequest({ requestId: id, version: 2, lines: [{ lineId: line.id, quantity: 1 }] })).toEqual({
      ok: false,
      error: "Permintaan ini sudah diproses. Muat ulang halaman.",
    });
  });

  it("Apoteker mengirim sebagian: stok pindah, jumlah kirim tercatat, jurnal tertaut ke barisnya", async () => {
    const a = await newItem(20);
    const b = await newItem(3);
    const { id } = await unwrap(request([a.id, b.id], 10));
    as("APOTEKER");
    const [la, lb] = await linesOf(id);
    await unwrap(sendRestockRequest({ requestId: id, version: 1, lines: [{ lineId: la.id, quantity: 6 }, { lineId: lb.id, quantity: 0 }] }));
    const done = await prisma.restockRequest.findUniqueOrThrow({ where: { id } });
    expect(done).toMatchObject({ status: "SELESAI", decidedByName: "Apoteker Uji", version: 2 });
    expect((await linesOf(id)).map((l) => l.sentQuantity)).toEqual([6, 0]);
    expect(await prisma.stockBatch.findUniqueOrThrow({ where: { id: a.batchId } })).toMatchObject({ quantityRemaining: 14, counterRemaining: 6 });
    expect(await prisma.stockMovement.count({ where: { restockLineId: la.id } })).toBe(2);
    expect(await prisma.stockBatch.findUniqueOrThrow({ where: { id: b.batchId } })).toMatchObject({ quantityRemaining: 3, counterRemaining: 0 });
  });

  it("kirim melebihi gudang ditolak dengan nama barang; tidak ada yang telanjur pindah (Review Focus 3)", async () => {
    const a = await newItem(10);
    const b = await newItem(10);
    const { id } = await unwrap(request([a.id, b.id], 8));
    as("APOTEKER");
    // Gudang b berkurang lewat retur setelah permintaan dibuat.
    await unwrap(createSupplierReturn({ invoiceId: b.invoiceId, lines: [{ batchId: b.batchId, quantity: 5 }], note: "" }));
    const [la, lb] = await linesOf(id);
    expect(await sendRestockRequest({ requestId: id, version: 1, lines: [{ lineId: la.id, quantity: 8 }, { lineId: lb.id, quantity: 8 }] })).toEqual({
      ok: false,
      error: `Sisa gudang ${b.name} tidak cukup (tersedia 5).`,
    });
    expect(await prisma.stockBatch.findUniqueOrThrow({ where: { id: a.batchId } })).toMatchObject({ quantityRemaining: 10, counterRemaining: 0 });
    expect((await prisma.restockRequest.findUniqueOrThrow({ where: { id } })).status).toBe("MENUNGGU");
  });

  it("dua kiriman bersamaan: hanya satu berhasil, stok pindah sekali (Review Focus 2)", async () => {
    const a = await newItem(20);
    const { id } = await unwrap(request([a.id], 5));
    as("APOTEKER");
    const [line] = await linesOf(id);
    const send = () => sendRestockRequest({ requestId: id, version: 1, lines: [{ lineId: line.id, quantity: 5 }] });
    const results = await Promise.all([send(), send()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: a.batchId } })).counterRemaining).toBe(5);
  });

  it("Apoteker menolak dengan alasan; versi usang ditolak", async () => {
    const a = await newItem(1);
    const { id } = await unwrap(request([a.id]));
    as("APOTEKER");
    expect(await rejectRestockRequest({ requestId: id, version: 1, reason: "x" })).toEqual({ ok: false, error: "Alasan penolakan 2–200 karakter." });
    expect(await rejectRestockRequest({ requestId: id, version: 9, reason: "Stok kosong" })).toEqual({ ok: false, error: "Permintaan ini sudah diproses. Muat ulang halaman." });
    await unwrap(rejectRestockRequest({ requestId: id, version: 1, reason: "Stok gudang kosong, sudah dipesan" }));
    expect(await prisma.restockRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DITOLAK", rejectReason: "Stok gudang kosong, sudah dipesan" });
  });

  it("bacaan: menunggu dan riwayat; rincian Apoteker memuat gudang tersedia", async () => {
    const a = await newItem(7);
    const { id } = await unwrap(request([a.id], 3));
    const pending = await listRestockRequests({ branchId: world.branchId, view: "MENUNGGU" });
    expect(pending.find((r) => r.id === id)).toMatchObject({ status: "MENUNGGU", lines: [{ itemName: a.name, unit: "pcs", requestedQuantity: 3, sentQuantity: null }] });
    expect(JSON.stringify(pending)).not.toMatch(/warehouseAvailable|unitCost/);
    await expect(getRestockRequest(id)).rejects.toThrow("forbidden: stock:manage");
    as("APOTEKER");
    expect((await getRestockRequest(id))!.lines[0].warehouseAvailable).toBe(7);
    expect(await countPendingRestock()).toBeGreaterThanOrEqual(1);
    expect((await listRestockRequests({ branchId: world.branchId, view: "RIWAYAT" })).every((r) => r.status !== "MENUNGGU")).toBe(true);
  });
});
