// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createStockItem, setStockItemPrice, updateStockItem } from "@/server/stock-catalog";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Uji Harga", role: "APOTEKER" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const CODE = "HARGA-UJI";
const base = { code: CODE, name: "Serum Harga Uji", kind: "PRODUK" as const, unit: "botol", sellPrice: null, minStock: 0, notes: "" };
const noPromo = { name: "", kind: null, value: 0, startsOn: "", endsOn: "" };
let itemId: string;

beforeAll(async () => {
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: CODE } } });
});
beforeEach(() => {
  actor.role = "APOTEKER";
});
afterAll(async () => {
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: CODE } } });
  await prisma.$disconnect();
});

describe("harga jual dan promo barang", () => {
  it("Apoteker menambah barang tanpa harga; mengirim harga ditolak", async () => {
    expect(await createStockItem({ ...base, code: `${CODE}-X`, sellPrice: 50_000 })).toEqual({ ok: false, error: "Harga jual diisi Admin Keuangan." });
    itemId = (await unwrap(createStockItem(base))).id;
    expect((await prisma.stockItem.findUniqueOrThrow({ where: { id: itemId } })).sellPrice).toBeNull();
  });

  it("Admin Keuangan mengisi harga jual dan promo, tercatat di audit", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(setStockItemPrice({ itemId, sellPrice: 150_000, promo: { name: "Promo Oktober", kind: "PERSEN", value: 10, startsOn: "2026-10-01", endsOn: "2026-10-31" } }));
    const item = await prisma.stockItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item).toMatchObject({ sellPrice: 150_000, promoName: "Promo Oktober", promoKind: "PERSEN", promoValue: 10 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "stock-item.price", entityId: itemId }, orderBy: { createdAt: "desc" } });
    expect(audit.summary).toBe(`${CODE}: harga belum diisi → Rp 150.000; Promo Oktober · 10% · 1 Okt 2026–31 Okt 2026`);
  });

  it("Apoteker mengubah data lain tanpa menyentuh harga; mengubah harga lewat aksi lama ditolak (Review Focus 4)", async () => {
    await unwrap(updateStockItem(itemId, { ...base, name: "Serum Harga Uji Baru", sellPrice: 150_000 }));
    expect(await updateStockItem(itemId, { ...base, sellPrice: 1 })).toEqual({ ok: false, error: "Harga jual diisi Admin Keuangan." });
    expect((await prisma.stockItem.findUniqueOrThrow({ where: { id: itemId } })).sellPrice).toBe(150_000);
    await expect(setStockItemPrice({ itemId, sellPrice: 1, promo: noPromo })).rejects.toThrow("forbidden: price:manage");
  });

  it("Super Admin boleh mengisi harga lewat formulir barang; promo dikosongkan lewat aksi harga", async () => {
    actor.role = "SUPER_ADMIN";
    await unwrap(updateStockItem(itemId, { ...base, sellPrice: 160_000 }));
    const audit = await prisma.auditLog.findFirst({ where: { action: "stock-item.price", entityId: itemId }, orderBy: { createdAt: "desc" } });
    expect(audit?.summary).toMatch(/harga Rp 150\.000 → Rp 160\.000/);
    await unwrap(setStockItemPrice({ itemId, sellPrice: 160_000, promo: noPromo }));
    expect(await prisma.stockItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ sellPrice: 160_000, promoKind: null, promoValue: 0, promoName: null });
  });

  it("harga atau promo tidak sah ditolak", async () => {
    actor.role = "ADMIN_KEUANGAN";
    expect(await setStockItemPrice({ itemId, sellPrice: -5, promo: noPromo })).toEqual({ ok: false, error: "Harga jual tidak sah." });
    expect(await setStockItemPrice({ itemId, sellPrice: 1000, promo: { name: "", kind: "PERSEN", value: 10, startsOn: "", endsOn: "" } })).toEqual({ ok: false, error: "Isi nama promo." });
    expect(await setStockItemPrice({ itemId: "tidak-ada", sellPrice: 1000, promo: noPromo })).toEqual({ ok: false, error: "Barang tidak ditemukan." });
  });
});
