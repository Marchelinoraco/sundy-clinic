// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addFreeLine, addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit, takePackageItem } from "@/server/invoice-drafts";
import { getPublicInvoice } from "@/server/invoice-a4-public";
import { loadInvoiceA4 } from "@/server/invoice-a4-store";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceA4 } from "@/server/invoice-read";
import { extendPatientPackage } from "@/server/patient-packages";
import { getReceiptMessage } from "@/server/receipt";
import { dateOnlyString } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";
import { testApproval } from "./approver";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Rina Kasir", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

vi.mock("@/server/request-guard", () => ({ guardRate: vi.fn().mockResolvedValue(undefined), clientIp: vi.fn().mockResolvedValue("127.0.0.1") }));

const SLUG = "invoice-a4";
const WA = "6281200009631";
let world: BillingWorld;
let lux: string;
let purchaseInvoice: string;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
const finalize = async (id: string) => unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
const codeOf = async (id: string) => /\/struk#(\S+)/.exec((await unwrap(getReceiptMessage(id))).text)![1];

/** Kunjungan dengan treatment Facial Uji; `purchase` = juga membeli paket Lux di tagihan yang sama. */
async function visitInvoice(purchase: boolean) {
  const { appointmentId } = await finalVisit(world);
  const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
  const treatment = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } });
  if (purchase) {
    await unwrap(addPackageLine({ invoiceId: id, version: await versionOf(id), packageId: lux }));
    const purchaseLine = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } });
    await unwrap(applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, purchaseLineId: purchaseLine.id }));
    await unwrap(takePackageItem({ invoiceId: id, version: await versionOf(id), purchaseLineId: purchaseLine.id, itemId: world.drugId, quantity: 10 }));
  } else {
    const items = await prisma.patientPackageItem.findMany({ where: { patientPackage: { packageId: lux, patientId: world.patientId } }, orderBy: { sortOrder: "asc" } });
    await unwrap(applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, patientPackageItemId: items[0].id }));
    await unwrap(takePackageItem({ invoiceId: id, version: await versionOf(id), patientPackageItemId: items[1].id, quantity: 10 }));
  }
  await finalize(id);
  return id;
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, { invoiceNumber: `${SLUG}-F1`, itemId: world.drugId, quantity: 200 });
  lux = (
    await prisma.treatmentPackage.create({
      data: {
        name: `${SLUG} Lux`,
        price: 2_000_000,
        validDays: 180,
        items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }, { itemId: world.drugId, sessions: 30, perVisit: 7, sortOrder: 1 }] },
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

describe("invoice A4: paket per tanggal invoice (spec invoice A4 IA5, IA6, IA10)", () => {
  it("invoice pembelian dan kunjungan berikutnya masing-masing menulis keadaan pada tanggalnya; invoice lama tidak berubah", async () => {
    const purchase = await visitInvoice(true);
    purchaseInvoice = purchase;
    const firstExpiry = (await prisma.patientPackage.findFirstOrThrow({ where: { packageId: lux, patientId: world.patientId } })).expiresOn;
    const before = (await loadInvoiceA4(purchase))!.packages;
    expect(before).toEqual([
      {
        name: `${SLUG} Lux`,
        expiresOn: witaDateString(firstExpiry).slice(0, 10),
        items: [
          { name: "Facial Uji", unit: null, total: 2, used: 1, remaining: 1 },
          { name: `${SLUG} Amoxicillin`, unit: "kapsul", total: 30, used: 10, remaining: 20 },
        ],
        nextVisitOn: addDaysToDateString(witaDateString(new Date()), 7),
      },
    ]);

    // Diperpanjang sesudah invoice pembelian, lalu kunjungan kedua.
    actor.role = "ADMIN_KEUANGAN";
    const owned = await prisma.patientPackage.findFirstOrThrow({ where: { packageId: lux, patientId: world.patientId } });
    await unwrap(extendPatientPackage({ packageId: owned.id, expiresOn: "2099-12-31", reason: "Customer sakit" }));
    actor.role = "RESEPSIONIS";
    const second = await visitInvoice(false);
    expect((await loadInvoiceA4(second))!.packages[0]).toMatchObject({
      expiresOn: "2099-12-31",
      items: [
        { total: 2, used: 2, remaining: 0 },
        { total: 30, used: 20, remaining: 10 },
      ],
    });
    // Kunjungan berikutnya hanya di invoice terbaru paket itu (spec jadwal paket JP14).
    expect((await loadInvoiceA4(second))!.packages[0].nextVisitOn).toBe(addDaysToDateString(witaDateString(new Date()), 7));
    expect((await loadInvoiceA4(purchase))!.packages[0].nextVisitOn).toBeNull();

    // Kunjungan kedua dibatalkan: invoice pembelian tetap seperti tanggalnya (Review Focus 1).
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: second, reason: "Salah input" }));
    expect((await loadInvoiceA4(purchase))!.packages).toEqual(before);
    expect((await getInvoiceA4(second))!.status).toBe("DIBATALKAN");
  });

  it("kunjungan berikutnya yang melewati masa berlaku paket tidak dicetak (temuan review I2)", async () => {
    const owned = await prisma.patientPackage.findFirstOrThrow({ where: { packageId: lux, patientId: world.patientId } });
    const next = addDaysToDateString(witaDateString(new Date()), 7);
    expect(dateOnlyString(owned.nextVisitOn!)).toBe(next);
    await prisma.patientPackage.update({ where: { id: owned.id }, data: { expiresOn: new Date(`${addDaysToDateString(witaDateString(new Date()), 3)}T00:00:00Z`) } });
    expect((await loadInvoiceA4(purchaseInvoice))!.packages[0].nextVisitOn).toBeNull();
    await prisma.patientPackage.update({ where: { id: owned.id }, data: { expiresOn: new Date(`${next}T00:00:00Z`) } });
    expect((await loadInvoiceA4(purchaseInvoice))!.packages[0].nextVisitOn).toBe(next);
  });

  it("invoice tanpa paket tidak punya kotak paket (Review Focus 3)", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addFreeLine({ approval: await testApproval(), invoiceId: id, version: await versionOf(id), kind: "LAYANAN", name: "Konsultasi bebas", quantity: 1, unitPrice: 50_000 }));
    expect(await getInvoiceA4(id)).toBeNull();
    await finalize(id);
    expect((await loadInvoiceA4(id))!.packages).toEqual([]);
  });
});

describe("invoice A4: tautan pasien dan panel (IA8, IA9)", () => {
  it("kode struk yang sah membuka invoice A4 dengan nomor RM dan pembayaran; dibatalkan dan kode palsu tidak", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addFreeLine({ approval: await testApproval(), invoiceId: id, version: await versionOf(id), kind: "LAYANAN", name: "Konsultasi bebas", quantity: 1, unitPrice: 100_000 }));
    await finalize(id);
    await unwrap(recordInvoicePayment({ invoiceId: id, amount: 40_000, method: "TUNAI", paidAt: witaDateString(new Date()), reference: "" }));
    const code = await codeOf(id);
    const page = await unwrap(getPublicInvoice(code));
    expect(page.state).toBe("VALID");
    if (page.state !== "VALID") return;
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: world.patientId } });
    expect(page.invoice).toMatchObject({ customerName: patient.name, medicalRecordNumber: patient.medicalRecordNumber, status: "DEPOSIT", balance: 60_000 });
    expect(page.invoice.payments[0].text).toMatch(/· Tunai$/);
    expect(JSON.stringify(page.invoice)).not.toContain("materialCost");

    expect(await unwrap(getPublicInvoice(`${code.slice(0, -1)}x`))).toEqual({ state: "INVALID" });
    actor.role = "ADMIN_KEUANGAN";
    const revoke = await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId: id } });
    await prisma.invoicePayment.update({ where: { id: revoke.id }, data: { revokedAt: new Date(), revokedByName: "Uji", revokeReason: "Uji" } });
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: id, reason: "Salah input" }));
    expect(await unwrap(getPublicInvoice(code))).toEqual({ state: "CANCELLED" });
  });

  it("panel: resepsionis boleh membaca invoice A4 (invoice:read)", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addFreeLine({ approval: await testApproval(), invoiceId: id, version: await versionOf(id), kind: "LAYANAN", name: "Konsultasi bebas", quantity: 1, unitPrice: 10_000 }));
    await finalize(id);
    expect((await getInvoiceA4(id))!.status).toBe("BELUM_DIBAYAR");
  });
});
