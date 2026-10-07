// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addFreeLine, addInvoiceItem, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
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

const SLUG = "siklus-tagihan";
const WA = "6281200008830";
const today = witaDateString(new Date());
const NUMBER = /^TG-\d{4}-\d{4,}$/;
let seq = 0;

describe("finalkan dan batalkan tagihan", () => {
  let world: BillingWorld;

  const remaining = async (batchId: string) => (await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } })).quantityRemaining;
  const batch = (itemId: string, quantity: number, daysToExpiry: number | null, unitCost = 1000) => {
    seq += 1;
    return billingBatch(world, {
      invoiceNumber: `SK-${seq}`,
      itemId,
      quantity,
      unitCost,
      expiryDate: daysToExpiry === null ? null : addDaysToDateString(today, daysToExpiry),
    });
  };
  let itemSeq = 0;
  /** Barang baru dengan rak sendiri: FEFO di cabang yang sama tidak bercampur dengan batch tes lain. */
  const newItem = (price = 5000) => {
    itemSeq += 1;
    return prisma.stockItem.create({
      data: { code: `${SLUG.toUpperCase()}-N${itemSeq}`, name: `${SLUG} Barang ${itemSeq}`, kind: "PRODUK", unit: "pcs", sellPrice: price },
    });
  };
  /** Draf penjualan langsung dengan barang-barang tertentu; kembalikan id dan versi terakhir. */
  async function draftWith(items: { itemId: string; quantity: number }[]) {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    let version = 1;
    for (const item of items) version = (await unwrap(addInvoiceItem({ invoiceId: id, version, ...item }))).version;
    return { id, version };
  }

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

  it("finalisasi: nomor berurutan, tagihan terkunci, stok keluar dari batch tercepat kedaluwarsa dengan harga pokoknya", async () => {
    const soon = await batch(world.drugId, 4, 30, 1000);
    const later = await batch(world.drugId, 10, 90, 1500);
    const { id, version } = await draftWith([{ itemId: world.drugId, quantity: 6 }]);

    const { number } = await unwrap(finalizeInvoice({ invoiceId: id, version }));
    expect(number).toMatch(NUMBER);

    expect(await remaining(soon.batchId)).toBe(0);
    expect(await remaining(later.batchId)).toBe(8);
    const uses = await prisma.invoiceStockUse.findMany({ where: { line: { invoiceId: id } }, orderBy: { quantity: "desc" } });
    expect(uses.map((use) => [use.batchId, use.quantity, use.unitCost])).toEqual([
      [soon.batchId, 4, 1000],
      [later.batchId, 2, 1500],
    ]);
    const movements = await prisma.stockMovement.findMany({ where: { invoiceId: id, kind: "KELUAR" }, orderBy: { quantity: "asc" } });
    expect(movements.map((m) => m.quantity)).toEqual([-4, -2]);
    expect(await prisma.auditLog.count({ where: { action: "invoice.finalize", entityId: id } })).toBe(1);

    const detail = await getInvoiceDetail(id);
    expect(detail).toMatchObject({ status: "FINAL", number, totals: { total: 12000, display: "BELUM_DIBAYAR" } });
    expect(detail?.finalizedAt).not.toBeNull();
    expect(detail?.cost).toBeNull();
    actor.role = "ADMIN_KEUANGAN";
    expect((await getInvoiceDetail(id))?.cost).toBe(4 * 1000 + 2 * 1500);
    expect((await getInvoiceDetail(id))?.lines[0].cost).toBe(7000);
  });

  it("nomor tagihan naik satu demi satu", async () => {
    await batch(world.productId, 10, null);
    const a = await draftWith([{ itemId: world.productId, quantity: 1 }]);
    const b = await draftWith([{ itemId: world.productId, quantity: 1 }]);
    const first = await unwrap(finalizeInvoice({ invoiceId: a.id, version: a.version }));
    const second = await unwrap(finalizeInvoice({ invoiceId: b.id, version: b.version }));
    const n = (value: string) => Number(value.split("-")[2]);
    expect(n(second.number)).toBe(n(first.number) + 1);
  });

  it("stok kurang di tengah finalisasi: semuanya batal, stok barang lain tidak ikut berkurang", async () => {
    const drug = await batch(world.drugId, 20, 60);
    const product = await batch(world.productId, 3, null);
    // Rak produk sudah berisi stok dari tes lain; bawa jumlah melebihi seluruhnya.
    const have = (await prisma.stockBatch.aggregate({ where: { itemId: world.productId, branchId: world.branchId }, _sum: { quantityRemaining: true } }))._sum.quantityRemaining ?? 0;
    const { id, version } = await draftWith([
      { itemId: world.drugId, quantity: 2 },
      { itemId: world.productId, quantity: have + 1 },
    ]);
    const before = await remaining(drug.batchId);
    const result = await finalizeInvoice({ invoiceId: id, version });
    expect(result).toEqual({ ok: false, error: `Stok ${SLUG} Serum C di Cabang Publik Uji tidak cukup (tersedia ${have}).` });
    expect(await remaining(drug.batchId)).toBe(before);
    expect(await remaining(product.batchId)).toBe(3);
    expect(await prisma.stockMovement.count({ where: { invoiceId: id } })).toBe(0);
    expect((await getInvoiceDetail(id))?.status).toBe("DRAF");
  });

  it("barang yang sama di dua baris dihitung bersama; batch kedaluwarsa tidak dipakai", async () => {
    const lone = await prisma.stockItem.create({
      data: { code: `${SLUG.toUpperCase()}-SOLO`, name: `${SLUG} Solo`, kind: "PRODUK", unit: "pcs", sellPrice: 5000 },
    });
    await batch(lone.id, 5, 40);
    await batch(lone.id, 9, -1);
    const { id, version } = await draftWith([
      { itemId: lone.id, quantity: 3 },
      { itemId: lone.id, quantity: 3 },
    ]);
    expect(await finalizeInvoice({ invoiceId: id, version })).toEqual({
      ok: false,
      error: `Stok ${SLUG} Solo di Cabang Publik Uji tidak cukup (tersedia 2).`,
    });
  });

  it("dua finalisasi bersamaan: hanya satu berhasil dan stok hanya berkurang sekali", async () => {
    const item = await newItem();
    const stock = await batch(item.id, 50, 70);
    const { id, version } = await draftWith([{ itemId: item.id, quantity: 5 }]);
    const results = await Promise.all([finalizeInvoice({ invoiceId: id, version }), finalizeInvoice({ invoiceId: id, version })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false });
    expect(await remaining(stock.batchId)).toBe(45);
    expect(await prisma.stockMovement.count({ where: { invoiceId: id, kind: "KELUAR" } })).toBe(1);
  });

  it("menolak tagihan kosong, versi usang, dan yang sudah final", async () => {
    const empty = await unwrap(createDirectSale({ patientId: world.patientId }));
    expect(await finalizeInvoice({ invoiceId: empty.id, version: 1 })).toEqual({
      ok: false,
      error: "Tagihan kosong tidak bisa difinalkan. Tambahkan baris dulu.",
    });
    const { id, version } = await draftWith([]);
    await unwrap(addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Biaya", quantity: 1, unitPrice: 1000 }));
    expect(await finalizeInvoice({ invoiceId: id, version })).toEqual({ ok: false, error: "Tagihan ini baru diubah orang lain. Muat ulang halaman." });
    await unwrap(finalizeInvoice({ invoiceId: id, version: version + 1 }));
    expect(await finalizeInvoice({ invoiceId: id, version: version + 1 })).toEqual({
      ok: false,
      error: "Tagihan ini sudah difinalkan atau dibatalkan. Muat ulang halaman.",
    });
  });

  it("tagihan tanpa barang tidak menyentuh stok; total Rp 0 tetap bisa difinalkan", async () => {
    const { id, version } = await draftWith([]);
    const next = await unwrap(addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Gratis", quantity: 1, unitPrice: 0 }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: next.version }));
    expect(await getInvoiceDetail(id)).toMatchObject({ status: "FINAL", totals: { total: 0, display: "LUNAS" } });
  });

  it("batalkan draf: tanpa efek ke stok; kunjungan boleh ditagih ulang", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(await cancelInvoice({ invoiceId: id, reason: " " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Salah kunjungan" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ status: "DIBATALKAN", cancelReason: "Salah kunjungan", cancelledByName: "Resepsionis Uji", totals: { display: "DIBATALKAN" } });
    expect(await cancelInvoice({ invoiceId: id, reason: "lagi" })).toEqual({ ok: false, error: "Tagihan ini sudah dibatalkan." });
    const again = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(again.id).not.toBe(id);
    expect(await prisma.auditLog.count({ where: { action: "invoice.cancel", entityId: id } })).toBe(1);
  });

  it("batalkan tagihan final tanpa pembayaran: stok kembali ke batch asalnya lewat jurnal", async () => {
    const item = await newItem();
    const stock = await batch(item.id, 12, 80);
    const { id, version } = await draftWith([{ itemId: item.id, quantity: 5 }]);
    const { number } = await unwrap(finalizeInvoice({ invoiceId: id, version }));
    expect(await remaining(stock.batchId)).toBe(7);

    await unwrap(cancelInvoice({ invoiceId: id, reason: "Pelanggan batal beli" }));
    expect(await remaining(stock.batchId)).toBe(12);
    const back = await prisma.stockMovement.findFirstOrThrow({ where: { invoiceId: id, kind: "PENYESUAIAN" } });
    expect(back).toMatchObject({ quantity: 5, reason: "LAINNYA", note: `Tagihan ${number} dibatalkan`, batchId: stock.batchId });
    expect((await getInvoiceDetail(id))?.status).toBe("DIBATALKAN");
  });

  it("tagihan yang sudah dibayar: pembayaran aktif menghalangi; yang pernah dibayar hanya dibatalkan Admin Keuangan", async () => {
    await batch(world.productId, 5, null);
    const { id, version } = await draftWith([{ itemId: world.productId, quantity: 1 }]);
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    const payment = await prisma.invoicePayment.create({
      data: { invoiceId: id, amount: 1000, method: "TUNAI", paidAt: new Date(`${today}T00:00:00Z`), staffId: "s1", staffName: "Resepsionis Uji" },
    });
    expect(await cancelInvoice({ invoiceId: id, reason: "salah" })).toEqual({
      ok: false,
      error: "Batalkan pembayarannya dulu (oleh Admin Keuangan), lalu batalkan tagihan.",
    });

    await prisma.invoicePayment.update({ where: { id: payment.id }, data: { revokedAt: new Date(), revokedByName: "Keuangan", revokeReason: "salah input" } });
    expect(await cancelInvoice({ invoiceId: id, reason: "salah" })).toEqual({
      ok: false,
      error: "Tagihan ini pernah dibayar. Pembatalan dilakukan oleh Admin Keuangan.",
    });
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Pembayaran salah catat" }));
    expect((await getInvoiceDetail(id))?.status).toBe("DIBATALKAN");
  });

  it("hak akses: Admin Keuangan tidak memfinalkan; Dokter dan Apoteker tidak membatalkan", async () => {
    const { id, version } = await draftWith([]);
    actor.role = "ADMIN_KEUANGAN";
    await expect(finalizeInvoice({ invoiceId: id, version })).rejects.toThrow(/forbidden: invoice:manage/);
    for (const role of ["DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      await expect(cancelInvoice({ invoiceId: id, reason: "x" })).rejects.toThrow(/forbidden: invoice:read/);
    }
  });
});
