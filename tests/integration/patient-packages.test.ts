// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { getPatientPackage, listPatientPackages, searchPatientPackages } from "@/server/patient-package-read";
import { extendPatientPackage } from "@/server/patient-packages";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Paket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "paket-customer";
const WA = "6281200009607";
let world: BillingWorld;
let patientPackageId: string;
let usageNumber: string;
const today = witaDateString(new Date());
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  actor.role = "RESEPSIONIS";
  const packageId = await catalogPackage(world, { name: "Facial 3x", validDays: 90 });
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
  await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
  const owned = await prisma.patientPackage.findFirstOrThrow({ where: { purchaseLine: { invoiceId: id } }, select: { id: true, items: { select: { id: true } } } });
  patientPackageId = owned.id;
  const { appointmentId } = await finalVisit(world);
  const visit = await unwrap(createInvoiceFromVisit(appointmentId));
  const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: visit.id, kind: "TREATMENT" } });
  await unwrap(applyPackageSession({ invoiceId: visit.id, version: await versionOf(visit.id), lineId: line.id, patientPackageItemId: owned.items[0].id }));
  usageNumber = (await unwrap(finalizeInvoice({ invoiceId: visit.id, version: await versionOf(visit.id) }))).number;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("paket customer", () => {
  it("daftar per pasien dan pencarian: sisa per treatment, status, tagihan pembelian", async () => {
    const [row] = await listPatientPackages(world.patientId);
    expect(row).toMatchObject({ id: patientPackageId, name: `${SLUG} Facial 3x`, state: "AKTIF", startsOn: today, items: [{ serviceName: "Facial Uji", sessions: 3, remaining: 2 }] });
    expect(row.purchaseInvoice.number).toMatch(/^TG-\d{4}-\d{4}$/);
    expect((await searchPatientPackages(`${SLUG} facial`)).map((r) => r.id)).toContain(patientPackageId);
    expect((await searchPatientPackages("tidak ada paket begini")).length).toBe(0);
  });

  it("detail: riwayat terbaru di atas dengan tagihan pemakaian", async () => {
    const detail = (await getPatientPackage(patientPackageId))!;
    expect(detail.entries.map((e) => [e.kind, e.delta, e.invoice?.number ?? null])).toEqual([
      ["PAKAI", -1, usageNumber],
      ["BELI", 3, detail.purchaseInvoice.number],
    ]);
    expect(await getPatientPackage("tidak-ada")).toBeNull();
  });

  it("perpanjangan hanya oleh Admin Keuangan: tanggal baru, buku PERPANJANG, audit", async () => {
    const current = (await getPatientPackage(patientPackageId))!.expiresOn;
    const next = addDaysToDateString(current, 30);
    await expect(extendPatientPackage({ packageId: patientPackageId, expiresOn: next, reason: "Customer sakit" })).rejects.toThrow("forbidden: invoice:correct");
    actor.role = "ADMIN_KEUANGAN";
    expect(await extendPatientPackage({ packageId: patientPackageId, expiresOn: current, reason: "x" })).toMatchObject({ ok: false });
    await unwrap(extendPatientPackage({ packageId: patientPackageId, expiresOn: next, reason: "Customer sakit" }));
    const detail = (await getPatientPackage(patientPackageId))!;
    expect(detail.expiresOn).toBe(next);
    expect(detail.entries[0]).toMatchObject({ kind: "PERPANJANG", delta: 0, reason: "Customer sakit", previousExpiresOn: current, newExpiresOn: next, serviceName: null });
    expect(await prisma.auditLog.count({ where: { action: "patient-package.extend", entityId: patientPackageId } })).toBe(1);
  });

  it("paket yang dibatalkan tidak bisa diperpanjang", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await prisma.patientPackage.update({ where: { id: patientPackageId }, data: { status: "DIBATALKAN" } });
    expect(await extendPatientPackage({ packageId: patientPackageId, expiresOn: "2099-01-01", reason: "x" })).toEqual({ ok: false, error: "Paket yang dibatalkan tidak bisa diperpanjang." });
    expect((await listPatientPackages(world.patientId))[0].state).toBe("DIBATALKAN");
    await prisma.patientPackage.update({ where: { id: patientPackageId }, data: { status: "AKTIF" } });
  });
});
