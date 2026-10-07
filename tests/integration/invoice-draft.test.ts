// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  addFreeLine,
  addInvoiceItem,
  createDirectSale,
  createInvoiceFromVisit,
  refreshCatalogPrices,
  removeInvoiceLine,
  setInvoiceDiscount,
  updateInvoiceLine,
} from "@/server/invoice-drafts";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
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

const SLUG = "draf-tagihan";
const WA = "6281200008820";
const STALE = "Tagihan ini baru diubah orang lain. Muat ulang halaman.";

describe("mengubah draf tagihan", () => {
  let world: BillingWorld;

  /** Draf kosong untuk penjualan langsung; kembalikan id dan versinya. */
  async function draft() {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    return { id, version: 1 };
  }
  const free = (id: string, version: number, patch: Record<string, unknown> = {}) =>
    addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Biaya administrasi", quantity: 1, unitPrice: 100000, ...patch } as Parameters<typeof addFreeLine>[0]);

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });

  beforeEach(() => {
    actor.role = "RESEPSIONIS";
  });

  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("tambah barang dari katalog dengan harga jual; versi naik setiap perubahan", async () => {
    const { id, version } = await draft();
    const added = await unwrap(addInvoiceItem({ invoiceId: id, version, itemId: world.drugId, quantity: 3 }));
    expect(added.version).toBe(2);
    const detail = await getInvoiceDetail(id);
    expect(detail?.version).toBe(2);
    expect(detail?.lines[0]).toMatchObject({ kind: "BARANG", name: `${SLUG} Amoxicillin`, quantity: 3, unitPrice: 2000, itemId: world.drugId, catalogLinked: true });
    expect(detail?.totals.total).toBe(6000);
    expect(await prisma.auditLog.count({ where: { action: "invoice.update", entityId: id } })).toBe(1);
  });

  it("menolak barang nonaktif, tanpa harga jual, atau tidak ada", async () => {
    const { id, version } = await draft();
    const off = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-OFF`, name: `${SLUG} Off`, kind: "PRODUK", unit: "pcs", sellPrice: 1000, isActive: false } });
    const noPrice = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-NOP`, name: `${SLUG} NoPrice`, kind: "PRODUK", unit: "pcs" } });
    expect(await addInvoiceItem({ invoiceId: id, version, itemId: off.id, quantity: 1 })).toEqual({ ok: false, error: "Barang ini nonaktif." });
    expect(await addInvoiceItem({ invoiceId: id, version, itemId: noPrice.id, quantity: 1 })).toEqual({
      ok: false,
      error: "Barang ini belum punya harga jual.",
    });
    expect(await addInvoiceItem({ invoiceId: id, version, itemId: "tidak-ada", quantity: 1 })).toEqual({ ok: false, error: "Barang tidak ditemukan." });
    expect((await getInvoiceDetail(id))?.version).toBe(1);
  });

  it("baris bebas: jenis, nama, jumlah, dan harga diperiksa di server", async () => {
    const { id, version } = await draft();
    expect(await free(id, version, { kind: "BARANG" })).toEqual({ ok: false, error: "Pilih jenis baris." });
    expect(await free(id, version, { unitPrice: -1 })).toEqual({ ok: false, error: "Harga tidak sah." });
    expect(await free(id, version, { quantity: 0.5 })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat lebih dari 0." });
    const ok = await unwrap(free(id, version));
    expect(ok.version).toBe(2);
    expect((await getInvoiceDetail(id))?.lines[0]).toMatchObject({ kind: "LAYANAN", unitPrice: 100000, catalogLinked: false });
  });

  it("suntingan dari halaman yang usang ditolak; dua suntingan bersamaan dengan versi sama hanya satu yang masuk", async () => {
    const { id, version } = await draft();
    await unwrap(free(id, version));
    expect(await free(id, version)).toEqual({ ok: false, error: STALE });

    const current = (await getInvoiceDetail(id))!.version;
    const results = await Promise.all([free(id, current, { name: "A" }), free(id, current, { name: "B" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: STALE });
    expect((await getInvoiceDetail(id))?.lines).toHaveLength(2);
  });

  it("ubah jumlah dan harga: harga katalog yang diubah wajib catatan, baris bebas tidak", async () => {
    const { id, version } = await draft();
    const a = await unwrap(addInvoiceItem({ invoiceId: id, version, itemId: world.productId, quantity: 1 }));
    const b = await unwrap(free(id, a.version, { unitPrice: 50000 }));
    const [catalog, custom] = (await getInvoiceDetail(id))!.lines;

    expect(await updateInvoiceLine({ invoiceId: id, version: b.version, lineId: catalog.id, quantity: 1, unitPrice: 120000, priceNote: "" })).toEqual({
      ok: false,
      error: "Isi catatan alasan perubahan harga.",
    });
    const c = await unwrap(
      updateInvoiceLine({ invoiceId: id, version: b.version, lineId: catalog.id, quantity: 2, unitPrice: 120000, priceNote: "Promo pelanggan lama" }),
    );
    const d = await unwrap(updateInvoiceLine({ invoiceId: id, version: c.version, lineId: custom.id, quantity: 3, unitPrice: 60000, priceNote: "" }));
    const detail = await getInvoiceDetail(id);
    expect(detail?.lines[0]).toMatchObject({ quantity: 2, unitPrice: 120000, priceNote: "Promo pelanggan lama" });
    expect(detail?.lines[1]).toMatchObject({ quantity: 3, unitPrice: 60000 });
    expect(d.version).toBe(detail?.version);

    // Mengembalikan harga ke harga katalog menghapus catatan; hanya mengubah jumlah tidak butuh catatan baru.
    const e = await unwrap(updateInvoiceLine({ invoiceId: id, version: d.version, lineId: catalog.id, quantity: 2, unitPrice: 150000, priceNote: "" }));
    expect((await getInvoiceDetail(id))?.lines[0]).toMatchObject({ unitPrice: 150000, priceNote: null });
    expect((await updateInvoiceLine({ invoiceId: id, version: e.version, lineId: "tidak-ada", quantity: 1, unitPrice: 1, priceNote: "" }))).toEqual({
      ok: false,
      error: "Baris tidak ditemukan.",
    });
  });

  it("hapus baris", async () => {
    const { id, version } = await draft();
    const a = await unwrap(free(id, version));
    const line = (await getInvoiceDetail(id))!.lines[0];
    await unwrap(removeInvoiceLine({ invoiceId: id, version: a.version, lineId: line.id }));
    expect((await getInvoiceDetail(id))?.lines).toHaveLength(0);
  });

  it("diskon: resepsionis sampai 20%, di atasnya ditolak; Admin Keuangan boleh lebih; alasan wajib", async () => {
    const { id, version } = await draft();
    const a = await unwrap(free(id, version));
    expect(await setInvoiceDiscount({ invoiceId: id, version: a.version, kind: "PERSEN", value: 21, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon di atas 20% diberikan oleh Admin Keuangan.",
    });
    expect(await setInvoiceDiscount({ invoiceId: id, version: a.version, kind: "NOMINAL", value: 5000, reason: " " })).toEqual({
      ok: false,
      error: "Isi alasan diskon.",
    });
    const b = await unwrap(setInvoiceDiscount({ invoiceId: id, version: a.version, kind: "PERSEN", value: 20, reason: "Pelanggan lama" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ discountKind: "PERSEN", discountValue: 20, discountReason: "Pelanggan lama", totals: { discount: 20000, total: 80000 } });

    actor.role = "ADMIN_KEUANGAN";
    const c = await unwrap(setInvoiceDiscount({ invoiceId: id, version: b.version, kind: "PERSEN", value: 50, reason: "Kebijakan pemilik" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ discountByName: "Resepsionis Uji", totals: { total: 50000 } });
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: c.version, kind: null, value: 0, reason: "" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ discountKind: null, discountValue: 0, discountReason: null, totals: { total: 100000 } });
    expect(await prisma.auditLog.count({ where: { action: "invoice.discount", entityId: id } })).toBe(3);
  });

  it("mengubah baris tidak boleh membuat diskon resepsionis melewati 20%", async () => {
    const { id, version } = await draft();
    const a = await unwrap(free(id, version, { name: "Besar", unitPrice: 80000 }));
    const b = await unwrap(free(id, a.version, { name: "Kecil", unitPrice: 20000 }));
    const c = await unwrap(setInvoiceDiscount({ invoiceId: id, version: b.version, kind: "NOMINAL", value: 20000, reason: "Pelanggan lama" }));
    const big = (await getInvoiceDetail(id))!.lines[0];
    expect(await removeInvoiceLine({ invoiceId: id, version: c.version, lineId: big.id })).toEqual({
      ok: false,
      error: "Perubahan ini membuat diskon melebihi 20%. Ubah diskon dulu atau minta Admin Keuangan.",
    });
    expect((await getInvoiceDetail(id))?.lines).toHaveLength(2);
  });

  it("diskon di atas 20% yang disetujui Admin Keuangan tidak bisa diperbesar resepsionis lewat baris", async () => {
    const { id, version } = await draft();
    const a = await unwrap(free(id, version, { name: "Konsultasi", unitPrice: 100000 }));
    actor.role = "ADMIN_KEUANGAN";
    const b = await unwrap(setInvoiceDiscount({ invoiceId: id, version: a.version, kind: "PERSEN", value: 50, reason: "Kebijakan pemilik" }));
    actor.role = "RESEPSIONIS";
    const grown = await free(id, b.version, { name: "Serum", quantity: 10, unitPrice: 150000 });
    expect(grown).toEqual({ ok: false, error: "Perubahan ini membuat diskon melebihi 20%. Ubah diskon dulu atau minta Admin Keuangan." });
    expect((await getInvoiceDetail(id))?.lines).toHaveLength(1);

    // Diskon nominal yang disetujui: menghapus baris membuat porsinya membesar.
    actor.role = "ADMIN_KEUANGAN";
    const c = await unwrap(setInvoiceDiscount({ invoiceId: id, version: b.version, kind: "NOMINAL", value: 30000, reason: "Kebijakan pemilik" }));
    actor.role = "RESEPSIONIS";
    const d = await unwrap(free(id, c.version, { name: "Besar", unitPrice: 300000 }));
    const lines = (await getInvoiceDetail(id))!.lines;
    const small = lines.find((line) => line.name === "Konsultasi")!;
    expect((await removeInvoiceLine({ invoiceId: id, version: d.version, lineId: small.id })).ok).toBe(true);
  });

  it("segarkan harga katalog: baris katalog mengikuti harga sekarang, baris bebas tetap", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const a = await unwrap(free(id, 1, { name: "Bebas", unitPrice: 7000 }));
    await prisma.service.update({ where: { id: world.consultationId }, data: { promoPrice: 210000 } });
    try {
      const refreshed = await unwrap(refreshCatalogPrices({ invoiceId: id, version: a.version }));
      expect(refreshed.updated).toBe(1);
      const lines = (await getInvoiceDetail(id))!.lines;
      expect(lines.find((line) => line.name === "Konsultasi Dokter")?.unitPrice).toBe(210000);
      expect(lines.find((line) => line.name === "Bebas")?.unitPrice).toBe(7000);
    } finally {
      await prisma.service.update({ where: { id: world.consultationId }, data: { promoPrice: 200000 } });
    }
  });

  it("tagihan yang sudah final tidak bisa diubah", async () => {
    const { id, version } = await draft();
    await prisma.invoice.update({ where: { id }, data: { status: "FINAL", number: `TG-2031-${Date.now() % 10000}`, finalizedAt: new Date() } });
    expect(await free(id, version)).toEqual({ ok: false, error: "Tagihan ini sudah tidak berupa draf. Muat ulang halaman." });
    expect(await setInvoiceDiscount({ invoiceId: id, version, kind: "PERSEN", value: 5, reason: "x" })).toEqual({
      ok: false,
      error: "Tagihan ini sudah tidak berupa draf. Muat ulang halaman.",
    });
  });

  it("hak akses: Admin Keuangan tidak mengubah baris; Dokter tidak menyentuh tagihan", async () => {
    const { id, version } = await draft();
    actor.role = "ADMIN_KEUANGAN";
    await expect(free(id, version)).rejects.toThrow(/forbidden: invoice:manage/);
    await expect(addInvoiceItem({ invoiceId: id, version, itemId: world.drugId, quantity: 1 })).rejects.toThrow(/forbidden: invoice:manage/);
    actor.role = "DOKTER";
    await expect(setInvoiceDiscount({ invoiceId: id, version, kind: "PERSEN", value: 5, reason: "x" })).rejects.toThrow(/forbidden: invoice:read/);
  });
});
