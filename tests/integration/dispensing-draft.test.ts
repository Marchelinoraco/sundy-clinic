// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDispensingLine, removeDispensingLine, updateDispensingLine } from "@/server/dispensing-drafts";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Apoteker Uji", role: "APOTEKER" as Role, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "draf-penyerahan";
const WA = "6281200008901";

describe("mengubah daftar obat penyerahan", () => {
  let world: BillingWorld;

  async function waiting() {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "Amoxicillin" });
    return seedDispensing(world, appointmentId);
  }
  const add = (id: string, version: number, patch: Record<string, unknown> = {}) =>
    addDispensingLine({ dispensingId: id, version, itemId: world.drugId, quantity: 3, usage: "3 x 1 sesudah makan", ...patch });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });
  beforeEach(() => {
    actor.role = "APOTEKER";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("menambah obat: nama disalin, versi naik, audit tercatat", async () => {
    const { id } = await waiting();
    const first = await unwrap(add(id, 1));
    expect(first.version).toBe(2);
    const second = await unwrap(add(id, 2, { itemId: world.productId, quantity: 1, usage: "1 x 1 pagi" }));
    expect(second.version).toBe(3);
    const lines = await prisma.dispensingLine.findMany({ where: { dispensingId: id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((l) => [l.itemName, l.quantity, l.usage, l.sortOrder])).toEqual([
      [`${SLUG} Amoxicillin`, 3, "3 x 1 sesudah makan", 0],
      [`${SLUG} Serum C`, 1, "1 x 1 pagi", 1],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "dispensing.update", entityId: id } })).toBe(2);
  });

  it("versi usang ditolak dan tidak mengubah apa pun", async () => {
    const { id } = await waiting();
    await unwrap(add(id, 1));
    expect(await add(id, 1)).toEqual({ ok: false, error: "Penyerahan ini baru diubah orang lain. Muat ulang halaman." });
    expect(await prisma.dispensingLine.count({ where: { dispensingId: id } })).toBe(1);
  });

  it("menolak permintaan buatan: jumlah, aturan pakai, dan obat yang tidak sah", async () => {
    const { id } = await waiting();
    for (const quantity of [0, -2, 1.5]) {
      expect(await add(id, 1, { quantity })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat lebih dari 0." });
    }
    expect(await add(id, 1, { usage: " " })).toEqual({ ok: false, error: "Isi aturan pakai." });
    expect(await add(id, 1, { itemId: "tidak-ada" })).toEqual({ ok: false, error: "Obat tidak ditemukan atau tidak dijual." });
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: false } });
    expect(await add(id, 1, { itemId: world.productId })).toEqual({ ok: false, error: "Obat tidak ditemukan atau tidak dijual." });
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: true, sellPrice: null } });
    expect(await add(id, 1, { itemId: world.productId })).toEqual({ ok: false, error: "Obat tidak ditemukan atau tidak dijual." });
    await prisma.stockItem.update({ where: { id: world.productId }, data: { sellPrice: 150000 } });
    expect(await prisma.dispensingLine.count({ where: { dispensingId: id } })).toBe(0);
    expect((await prisma.dispensing.findUniqueOrThrow({ where: { id } })).version).toBe(1);
  });

  it("mengubah jumlah dan aturan pakai, dan menghapus baris", async () => {
    const { id } = await waiting();
    const a = await unwrap(add(id, 1));
    const lineId = (await prisma.dispensingLine.findFirstOrThrow({ where: { dispensingId: id } })).id;
    const b = await unwrap(updateDispensingLine({ dispensingId: id, version: a.version, lineId, quantity: 5, usage: "2 x 1" }));
    expect(await prisma.dispensingLine.findUniqueOrThrow({ where: { id: lineId } })).toMatchObject({ quantity: 5, usage: "2 x 1" });
    expect(await updateDispensingLine({ dispensingId: id, version: b.version, lineId, quantity: 0, usage: "2 x 1" })).toEqual({
      ok: false,
      error: "Jumlah harus bilangan bulat lebih dari 0.",
    });
    expect(await removeDispensingLine({ dispensingId: id, version: b.version, lineId: "tidak-ada" })).toEqual({ ok: false, error: "Baris tidak ditemukan." });
    await unwrap(removeDispensingLine({ dispensingId: id, version: b.version, lineId }));
    expect(await prisma.dispensingLine.count({ where: { dispensingId: id } })).toBe(0);
  });

  it("penyerahan yang sudah selesai tidak bisa diubah", async () => {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "x" });
    const { id } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 1 }] });
    expect(await add(id, 1)).toEqual({ ok: false, error: "Penyerahan ini sudah selesai. Buka kembali dulu untuk mengubahnya." });
  });

  it("hak akses: hanya Apoteker (dispense:manage)", async () => {
    const { id } = await waiting();
    for (const role of ["RESEPSIONIS", "DOKTER", "ADMIN_KEUANGAN"] as const) {
      actor.role = role;
      await expect(add(id, 1)).rejects.toThrow(/forbidden: dispense:manage/);
    }
    expect(await prisma.dispensingLine.count({ where: { dispensingId: id } })).toBe(0);
  });
});
