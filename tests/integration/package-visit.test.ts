// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dateOnlyString } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit, takePackageItem } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getPatientPackage } from "@/server/patient-package-read";
import { changeNextVisit } from "@/server/patient-packages";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Rina Jadwal", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
    requireAnyCapability: vi.fn(async (...capabilities: Parameters<typeof can>[1][]) => {
      if (!capabilities.some((capability) => can(actor.role, capability))) throw new Error(`forbidden: ${capabilities.join(" | ")}`);
      return actor;
    }),
  };
});

const SLUG = "jadwal-paket";
const WA = "6281200009641";
let world: BillingWorld;
let lux: string;
const today = () => witaDateString(new Date());
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
const finalize = async (id: string) => unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
const packageOf = async (purchaseLineId: string) =>
  prisma.patientPackage.findFirstOrThrow({ where: { purchaseLineId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
const next = async (purchaseLineId: string) => {
  const value = (await packageOf(purchaseLineId)).nextVisitOn;
  return value ? dateOnlyString(value) : null;
};

/** Tagihan pembelian Lux saja (tanpa memakai isinya). */
async function buyOnly() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: await versionOf(id), packageId: lux }));
  const purchaseLineId = (await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } })).id;
  await finalize(id);
  return { invoiceId: id, purchaseLineId };
}

/** Kunjungan yang memakai 1 sesi Facial dan 7 kapsul dari paket milik customer. */
async function useVisit(purchaseLineId: string, kapsul = 7) {
  const pkg = await packageOf(purchaseLineId);
  const { appointmentId } = await finalVisit(world);
  const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
  const treatment = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } });
  await unwrap(applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, patientPackageItemId: pkg.items[0].id }));
  await unwrap(takePackageItem({ invoiceId: id, version: await versionOf(id), patientPackageItemId: pkg.items[1].id, quantity: kapsul }));
  await finalize(id);
  return id;
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
        validDays: 90,
        visitIntervalDays: 7,
        items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }, { itemId: world.drugId, sessions: 14, perVisit: 7, sortOrder: 1 }] },
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

describe("tanggal kunjungan berikutnya (spec jadwal paket JP4, JP10, JP11)", () => {
  it("dibeli tanpa dipakai: kunjungan 1 = tanggal beli + jarak (keputusan pemilik 22 Okt); jarak dan jumlah per kunjungan disalin", async () => {
    const { purchaseLineId } = await buyOnly();
    const pkg = await packageOf(purchaseLineId);
    expect(pkg.visitIntervalDays).toBe(7);
    expect(pkg.items.map((item) => item.perVisit)).toEqual([null, 7]);
    expect(await next(purchaseLineId)).toBe(addDaysToDateString(today(), 7));
  });

  it("dibeli dan langsung dipakai di tagihan yang sama: tanggal beli + jarak (Review Focus 1)", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    await unwrap(addPackageLine({ invoiceId: id, version: await versionOf(id), packageId: lux }));
    const purchaseLine = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } });
    const treatment = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } });
    await unwrap(applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, purchaseLineId: purchaseLine.id }));
    await finalize(id);
    expect(await next(purchaseLine.id)).toBe(addDaysToDateString(today(), 7));
  });

  it("kunjungan berikutnya bergeser dari kedatangan; pembatalan mengembalikan dasar sebelumnya (Review Focus 5); habis = kosong", async () => {
    const { purchaseLineId } = await buyOnly();
    const first = await useVisit(purchaseLineId);
    expect(await next(purchaseLineId)).toBe(addDaysToDateString(today(), 7));
    // Tanggal beli dimundurkan 3 hari agar dasar "tanggal beli + jarak" berbeda dari dasar tagihan yang dibatalkan.
    await prisma.patientPackage.update({ where: { purchaseLineId }, data: { startsOn: new Date(`${addDaysToDateString(today(), -3)}T00:00:00Z`) } });
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(cancelInvoice({ invoiceId: first, reason: "Salah input" }));
    expect(await next(purchaseLineId)).toBe(addDaysToDateString(today(), 4));
    actor.role = "RESEPSIONIS";
    await useVisit(purchaseLineId);
    await useVisit(purchaseLineId);
    expect(await next(purchaseLineId)).toBeNull();
  });

  it("halaman paket: kunjungan selesai dari buku sesi, lalu rencana sisanya (spec jadwal paket JP7)", async () => {
    const { purchaseLineId } = await buyOnly();
    const pkg = await packageOf(purchaseLineId);
    const invoiceId = await useVisit(purchaseLineId);
    const detail = (await getPatientPackage(pkg.id))!;
    const facial = { name: pkg.items[0].serviceName, unit: null, quantity: 1 };
    const kapsul = { name: `${SLUG} Amoxicillin`, unit: "kapsul", quantity: 7 };
    expect(detail.nextVisitOn).toBe(addDaysToDateString(today(), 7));
    expect(detail.doneVisits).toEqual([{ number: 1, date: today(), invoice: { id: invoiceId, number: expect.any(String) }, contents: [facial, kapsul] }]);
    expect(detail.plan).toEqual([{ number: 2, date: addDaysToDateString(today(), 7), contents: [facial, kapsul] }]);
  });

  it("pembelian dibatalkan: paket tanpa rencana", async () => {
    const { invoiceId, purchaseLineId } = await buyOnly();
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(cancelInvoice({ invoiceId, reason: "Salah input" }));
    expect(await next(purchaseLineId)).toBeNull();
  });
});

describe("ubah tanggal rencana (spec jadwal paket JP9, JP16)", () => {
  it("resepsionis mengubah tanggal; sebelum hari ini atau lewat masa berlaku ditolak; tercatat di audit", async () => {
    const { purchaseLineId } = await buyOnly();
    const pkg = await packageOf(purchaseLineId);
    const target = addDaysToDateString(today(), 10);
    await unwrap(changeNextVisit({ packageId: pkg.id, visitOn: target }));
    expect(await next(purchaseLineId)).toBe(target);
    expect(await changeNextVisit({ packageId: pkg.id, visitOn: addDaysToDateString(today(), -1) })).toEqual({ ok: false, error: "Tanggal rencana tidak boleh sebelum hari ini." });
    const expiry = dateOnlyString(pkg.expiresOn);
    expect(await changeNextVisit({ packageId: pkg.id, visitOn: addDaysToDateString(expiry, 1) })).toMatchObject({ ok: false, error: expect.stringContaining("Tanggal rencana melewati masa berlaku paket") });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "patient-package.next-visit", entityId: pkg.id }, orderBy: { createdAt: "desc" } });
    expect(audit.summary).toContain(`${SLUG} Lux`);
  });

  it("Admin Keuangan juga boleh mengubah tanggal; peran lain tidak (spec jadwal paket 4.6, temuan review I4)", async () => {
    const { purchaseLineId } = await buyOnly();
    const pkg = await packageOf(purchaseLineId);
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(changeNextVisit({ packageId: pkg.id, visitOn: addDaysToDateString(today(), 4) }));
    expect(await next(purchaseLineId)).toBe(addDaysToDateString(today(), 4));
    actor.role = "APOTEKER";
    await expect(changeNextVisit({ packageId: pkg.id, visitOn: addDaysToDateString(today(), 5) })).rejects.toThrow(/forbidden/);
    expect(await next(purchaseLineId)).toBe(addDaysToDateString(today(), 4));
  });

  it("paket habis atau dibatalkan tidak bisa diubah", async () => {
    const { invoiceId, purchaseLineId } = await buyOnly();
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(cancelInvoice({ invoiceId, reason: "Salah input" }));
    actor.role = "RESEPSIONIS";
    const pkg = await packageOf(purchaseLineId);
    expect(await changeNextVisit({ packageId: pkg.id, visitOn: addDaysToDateString(today(), 3) })).toEqual({ ok: false, error: "Paket ini sudah tidak punya rencana kunjungan." });
  });
});
