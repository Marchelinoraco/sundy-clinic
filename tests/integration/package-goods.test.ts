// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  addInvoiceItem,
  addPackageLine,
  applyPackageSession,
  createDirectSale,
  createInvoiceFromVisit,
  refreshCatalogPrices,
  releasePackageSession,
  removeInvoiceLine,
  takePackageItem,
} from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { listPackageOptions } from "@/server/patient-package-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Barang", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "paket-barang";
const WA = "6281200009611";
let world: BillingWorld;
/** 2× Facial Uji + 30 kapsul Amoxicillin. */
let lux: string;
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
const finalize = async (id: string) => finalizeInvoice({ invoiceId: id, version: await versionOf(id) });
const remaining = async (itemId: string) => (await prisma.packageSessionEntry.aggregate({ where: { patientPackageItemId: itemId }, _sum: { delta: true } }))._sum.delta ?? 0;
const counter = async () => (await prisma.stockBatch.aggregate({ where: { itemId: world.drugId, branchId: world.branchId }, _sum: { counterRemaining: true } }))._sum.counterRemaining ?? 0;

async function draftWithPackage() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: await versionOf(id), packageId: lux }));
  const purchaseLine = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" }, select: { id: true } });
  return { id, purchaseLineId: purchaseLine.id };
}
async function ownPackage() {
  const draft = await draftWithPackage();
  await unwrap(finalize(draft.id));
  const owned = await prisma.patientPackage.findFirstOrThrow({
    where: { purchaseLine: { invoiceId: draft.id } },
    select: { id: true, items: { orderBy: { sortOrder: "asc" }, select: { id: true, itemId: true, serviceId: true, unit: true, serviceName: true, sessions: true } } },
  });
  const goods = owned.items.find((item) => item.itemId)!;
  return { purchaseId: draft.id, goods, facial: owned.items.find((item) => item.serviceId)! };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, { invoiceNumber: `${SLUG}-F1`, itemId: world.drugId, quantity: 500 });
  lux = (
    await prisma.treatmentPackage.create({
      data: {
        name: `${SLUG} Lux`,
        price: 2_000_000,
        validDays: 180,
        items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }, { itemId: world.drugId, sessions: 30, sortOrder: 1 }] },
      },
      select: { id: true },
    })
  ).id;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("paket berisi barang (spec paket barang)", () => {
  it("isi paket customer menyalin barang dan satuannya; pilihan paket menyebut satuan", async () => {
    const own = await ownPackage();
    expect(own.goods).toMatchObject({ itemId: world.drugId, unit: "kapsul", serviceName: `${SLUG} Amoxicillin`, sessions: 30 });
    expect(await remaining(own.goods.id)).toBe(30);
    const option = (await listPackageOptions(world.patientId)).find((o) => o.patientPackageItemId === own.goods.id);
    expect(option).toMatchObject({ itemId: world.drugId, serviceId: null, unit: "kapsul", remaining: 30, purchaseLineId: null });
  });

  it("Ambil dari paket customer: baris BARANG Rp 0, stok meja berkurang saat final, sisa jatah tercatat", async () => {
    const own = await ownPackage();
    const before = await counter();
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(takePackageItem({ invoiceId: id, version: await versionOf(id), patientPackageItemId: own.goods.id, quantity: 10 }));
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id } });
    expect(line).toMatchObject({ kind: "BARANG", itemId: world.drugId, quantity: 10, unitPrice: 0, discountAmount: 0, patientPackageItemId: own.goods.id });
    const detail = (await getInvoiceDetail(id))!;
    expect(detail.lines[0].packageNote).toBe(`Jatah paket ${SLUG} Lux · sisa 20 dari 30 kapsul`);

    await unwrap(finalize(id));
    expect(await remaining(own.goods.id)).toBe(20);
    expect(await counter()).toBe(before - 10);
    expect(await prisma.invoiceStockUse.aggregate({ where: { lineId: line.id }, _sum: { quantity: true } })).toMatchObject({ _sum: { quantity: 10 } });
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { status: true } })).toEqual({ status: "FINAL" });
  });

  it("Pakai jatah paket pada baris barang biasa, lalu Lepas paket mengembalikan harga jual", async () => {
    const own = await ownPackage();
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addInvoiceItem({ invoiceId: id, version: await versionOf(id), itemId: world.drugId, quantity: 5 }));
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id } });
    await unwrap(applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: line.id, patientPackageItemId: own.goods.id }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ unitPrice: 0, patientPackageItemId: own.goods.id });
    await unwrap(releasePackageSession({ invoiceId: id, version: await versionOf(id), lineId: line.id }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ unitPrice: 2000, patientPackageItemId: null });
    expect(await applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: line.id, patientPackageItemId: own.facial.id })).toEqual({
      ok: false,
      error: `Paket ${SLUG} Lux tidak berisi ${SLUG} Amoxicillin.`,
    });
  });

  it("melebihi sisa jatah ditolak", async () => {
    const own = await ownPackage();
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    expect(await takePackageItem({ invoiceId: id, version: await versionOf(id), patientPackageItemId: own.goods.id, quantity: 31 })).toEqual({
      ok: false,
      error: `Jatah ${SLUG} Amoxicillin di paket ${SLUG} Lux tinggal 30. Kurangi jumlahnya.`,
    });
  });

  it("ambil di tagihan pembelian itu sendiri: barang dan sesi pertama dipakai saat paket dibeli (PB3)", async () => {
    const draft = await draftWithPackage();
    const options = await listPackageOptions(world.patientId, draft.id);
    const fresh = options.filter((o) => o.purchaseLineId === draft.purchaseLineId);
    expect(fresh.map((o) => [o.serviceId ?? o.itemId, o.remaining, o.patientPackageId])).toEqual([
      [world.treatmentId, 2, `baru:${draft.purchaseLineId}`],
      [world.drugId, 30, `baru:${draft.purchaseLineId}`],
    ]);
    await unwrap(takePackageItem({ invoiceId: draft.id, version: await versionOf(draft.id), purchaseLineId: draft.purchaseLineId, itemId: world.drugId, quantity: 10 }));
    expect(await takePackageItem({ invoiceId: draft.id, version: await versionOf(draft.id), purchaseLineId: draft.purchaseLineId, itemId: world.drugId, quantity: 21 })).toEqual({
      ok: false,
      error: `Jatah ${SLUG} Amoxicillin di paket ${SLUG} Lux tinggal 20. Kurangi jumlahnya.`,
    });
    const take = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: draft.id, kind: "BARANG" } });
    expect(take).toMatchObject({ unitPrice: 0, packageSourceLineId: draft.purchaseLineId, patientPackageItemId: null });
    expect((await getInvoiceDetail(draft.id))!.lines.find((l) => l.id === take.id)!.packageNote).toBe(`Dari paket ${SLUG} Lux yang dibeli di tagihan ini`);
    expect((await listPackageOptions(world.patientId, draft.id)).find((o) => o.purchaseLineId === draft.purchaseLineId && o.itemId)!.remaining).toBe(20);

    const before = await counter();
    await unwrap(finalize(draft.id));
    const owned = await prisma.patientPackage.findFirstOrThrow({ where: { purchaseLineId: draft.purchaseLineId }, select: { items: { select: { id: true, itemId: true } } } });
    const goods = owned.items.find((item) => item.itemId)!;
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: take.id } })).toMatchObject({ patientPackageItemId: goods.id });
    expect(await remaining(goods.id)).toBe(20);
    expect(await counter()).toBe(before - 10);
  });

  it("sesi treatment juga bisa dipakai di tagihan pembelian (PB3)", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    await unwrap(addPackageLine({ invoiceId: id, version: await versionOf(id), packageId: lux }));
    const purchaseLine = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } });
    const treatment = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } });
    await unwrap(applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, purchaseLineId: purchaseLine.id }));
    await unwrap(refreshCatalogPrices({ invoiceId: id, version: await versionOf(id) }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: treatment.id } })).toMatchObject({ unitPrice: 0, packageSourceLineId: purchaseLine.id });
    await unwrap(finalize(id));
    const facial = await prisma.patientPackageItem.findFirstOrThrow({ where: { patientPackage: { purchaseLineId: purchaseLine.id }, serviceId: world.treatmentId } });
    expect(await remaining(facial.id)).toBe(1);
  });

  it("menghapus baris PAKET melepas baris yang memakai jatahnya", async () => {
    const draft = await draftWithPackage();
    await unwrap(takePackageItem({ invoiceId: draft.id, version: await versionOf(draft.id), purchaseLineId: draft.purchaseLineId, itemId: world.drugId, quantity: 3 }));
    await unwrap(removeInvoiceLine({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.purchaseLineId }));
    const left = await prisma.invoiceLine.findMany({ where: { invoiceId: draft.id } });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ kind: "BARANG", unitPrice: 2000, packageSourceLineId: null, patientPackageItemId: null });
  });

  it("membatalkan tagihan pembelian yang sekaligus mengambil jatahnya: stok dan buku kembali, paket batal", async () => {
    const draft = await draftWithPackage();
    await unwrap(takePackageItem({ invoiceId: draft.id, version: await versionOf(draft.id), purchaseLineId: draft.purchaseLineId, itemId: world.drugId, quantity: 4 }));
    const before = await counter();
    await unwrap(finalize(draft.id));
    expect(await counter()).toBe(before - 4);
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(cancelInvoice({ invoiceId: draft.id, reason: "Salah input" }));
    const owned = await prisma.patientPackage.findFirstOrThrow({ where: { purchaseLineId: draft.purchaseLineId }, select: { status: true, items: { select: { id: true } } } });
    expect(owned.status).toBe("DIBATALKAN");
    for (const item of owned.items) expect(await remaining(item.id)).toBe(0);
    expect(await counter()).toBe(before);
  });

  it("baris dari paket customer lain ditolak", async () => {
    const own = await ownPackage();
    const other = await prisma.patient.create({ data: { medicalRecordNumber: `SDY-2026-${Math.floor(Math.random() * 9000 + 1000)}`, name: `${SLUG} Lain`, whatsapp: "6281200009612" } });
    const { id } = await unwrap(createDirectSale({ patientId: other.id, branchId: world.branchId }));
    expect(await takePackageItem({ invoiceId: id, version: await versionOf(id), patientPackageItemId: own.goods.id, quantity: 1 })).toEqual({ ok: false, error: "Paket ini milik customer lain." });
    await prisma.invoice.deleteMany({ where: { id } });
    await prisma.patient.delete({ where: { id: other.id } });
  });

  it("katalog paket uji diakui fixture lama: paket treatment saja tetap bekerja", async () => {
    const plain = await catalogPackage(world, { name: "Facial 3x" });
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: id, version: await versionOf(id), packageId: plain }));
    await unwrap(finalize(id));
    const item = await prisma.patientPackageItem.findFirstOrThrow({ where: { patientPackage: { purchaseLine: { invoiceId: id } } } });
    expect(item).toMatchObject({ serviceId: world.treatmentId, itemId: null, unit: null });
  });
});
