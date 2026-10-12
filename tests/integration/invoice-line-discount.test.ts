// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addFreeLine, addInvoiceItem, clearLineDiscount, createDirectSale, createInvoiceFromVisit, refreshCatalogPrices, setInvoiceDiscount, setLineDiscount, updateInvoiceLine } from "@/server/invoice-drafts";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Diskon", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "diskon-baris";
const WA = "6281200009502";
let world: BillingWorld;

const lineOf = async (invoiceId: string, name: string) => prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, name } });
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

async function setPromo(itemId: string, promo: { kind: "PERSEN" | "NOMINAL"; value: number; endsOn?: string } | null) {
  await prisma.stockItem.update({
    where: { id: itemId },
    data: promo
      ? { promoName: "Promo Uji", promoKind: promo.kind, promoValue: promo.value, promoStartsOn: null, promoEndsOn: promo.endsOn ? new Date(`${promo.endsOn}T00:00:00Z`) : null }
      : { promoName: null, promoKind: null, promoValue: 0, promoStartsOn: null, promoEndsOn: null },
  });
}

/** Penjualan langsung: produk 2 × Rp150.000 + baris layanan Rp100.000. */
async function draft() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  const { version } = await unwrap(addInvoiceItem({ invoiceId: id, version: 1, itemId: world.productId, quantity: 2 }));
  await unwrap(addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Layanan Diskon", quantity: 1, unitPrice: 100_000 }));
  return id;
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await setPromo(world.productId, null);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("promo barang di tagihan", () => {
  it("terpasang otomatis saat barang ditambahkan (persen dan nominal per unit)", async () => {
    await setPromo(world.productId, { kind: "PERSEN", value: 10 });
    const id = await draft();
    expect(await lineOf(id, `${SLUG} Serum C`)).toMatchObject({ discountAmount: 30_000, discountSource: "PROMO", discountReason: "Promo: Promo Uji" });
    await setPromo(world.productId, { kind: "NOMINAL", value: 10_000 });
    const second = await draft();
    expect((await lineOf(second, `${SLUG} Serum C`)).discountAmount).toBe(20_000);
  });

  it("promo yang sudah berakhir tidak terpasang", async () => {
    await setPromo(world.productId, { kind: "PERSEN", value: 10, endsOn: "2020-01-01" });
    const id = await draft();
    expect((await lineOf(id, `${SLUG} Serum C`)).discountAmount).toBe(0);
  });

  it("baris dari penyerahan Apoteker juga mendapat promo", async () => {
    await setPromo(world.drugId, { kind: "PERSEN", value: 50 });
    const { appointmentId } = await finalVisit(world);
    await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 4 }] });
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, itemId: world.drugId } })).toMatchObject({ discountAmount: 4000, discountSource: "PROMO" });
    await setPromo(world.drugId, null);
  });

  it("jumlah diubah: promo dihitung ulang; diskon manual dipotong ke harga baris baru (Review Focus 1)", async () => {
    await setPromo(world.productId, { kind: "PERSEN", value: 10 });
    const id = await draft();
    const product = await lineOf(id, `${SLUG} Serum C`);
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: product.id, quantity: 1, unitPrice: 150_000, priceNote: "" }));
    expect((await lineOf(id, `${SLUG} Serum C`)).discountAmount).toBe(15_000);

    actor.role = "ADMIN_KEUANGAN";
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 90_000, reason: "Uji" }));
    actor.role = "RESEPSIONIS";
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: service.id, quantity: 1, unitPrice: 50_000, priceNote: "" }));
    expect(await lineOf(id, "Layanan Diskon")).toMatchObject({ discountAmount: 50_000, discountSource: "MANUAL" });
  });

  it("Segarkan harga katalog memasang dan melepas promo, diskon manual tetap", async () => {
    const id = await draft();
    await setPromo(world.productId, { kind: "PERSEN", value: 20 });
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 5_000, reason: "Uji" }));
    await unwrap(refreshCatalogPrices({ invoiceId: id, version: await versionOf(id) }));
    expect((await lineOf(id, `${SLUG} Serum C`)).discountAmount).toBe(60_000);
    await setPromo(world.productId, null);
    await unwrap(refreshCatalogPrices({ invoiceId: id, version: await versionOf(id) }));
    expect(await lineOf(id, `${SLUG} Serum C`)).toMatchObject({ discountAmount: 0, discountSource: null });
    expect((await lineOf(id, "Layanan Diskon")).discountAmount).toBe(5_000);
  });
});

describe("diskon manual dan batas gabungan 20%", () => {
  it("resepsionis: manual + diskon tagihan sampai 20% dari kotor; lewat 20% ditolak", async () => {
    const id = await draft(); // kotor 400.000 → batas 80.000
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 50_000, reason: "Uji" }));
    expect(await setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "NOMINAL", value: 30_001, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon di atas 20% diberikan oleh Admin Keuangan.",
    });
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "NOMINAL", value: 30_000, reason: "x" }));
    const product = await lineOf(id, `${SLUG} Serum C`);
    expect(await setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: product.id, kind: "NOMINAL", value: 1, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon di atas 20% diberikan oleh Admin Keuangan.",
    });
  });

  it("promo tidak dihitung dalam batas (Review Focus 2)", async () => {
    await setPromo(world.productId, { kind: "PERSEN", value: 50 }); // promo 150.000
    const id = await draft();
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "PERSEN", value: 20, reason: "x" }));
    // subtotal bersih 250.000 → diskon tagihan 50.000 ≤ batas 80.000
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice).toMatchObject({ discountKind: "PERSEN", discountValue: 20 });
  });

  it("Admin Keuangan boleh di atas 20%", async () => {
    const id = await draft();
    actor.role = "ADMIN_KEUANGAN";
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "PERSEN", value: 100, reason: "Gratis" }));
    expect((await lineOf(id, "Layanan Diskon")).discountAmount).toBe(100_000);
  });

  it("menghapus diskon baris; galat bentuk; versi usang ditolak", async () => {
    const id = await draft();
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 10_000, reason: "Uji" }));
    await unwrap(clearLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id }));
    expect(await lineOf(id, "Layanan Diskon")).toMatchObject({ discountAmount: 0, discountSource: null, discountReason: null });
    expect(await setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 100_001, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon tidak boleh melebihi harga baris.",
    });
    expect(await setLineDiscount({ invoiceId: id, version: 1, lineId: service.id, kind: "NOMINAL", value: 1, reason: "x" })).toEqual({
      ok: false,
      error: "Tagihan ini baru diubah orang lain. Muat ulang halaman.",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.update", entityId: id, summary: { startsWith: "Diskon baris" } } });
    expect(audit.summary).toBe("Diskon baris Layanan Diskon: Rp 10.000 (Uji)");
  });
});
