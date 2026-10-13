// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addPackageLine, createDirectSale, refreshCatalogPrices, setLineDiscount, updateInvoiceLine } from "@/server/invoice-drafts";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Paket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "jual-paket";
const WA = "6281200009603";
let world: BillingWorld;
let packageId: string;

const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
async function draftWithPackage() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
  const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } });
  return { id, line };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  packageId = await catalogPackage(world, { name: "Facial 3x", price: 600_000, validDays: 90 });
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await prisma.treatmentPackage.update({ where: { id: packageId }, data: { price: 600_000, isActive: true } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("menjual paket di draf", () => {
  it("baris PAKET berharga katalog, jumlah 1, dengan keterangan isi dan masa berlaku", async () => {
    const { id, line } = await draftWithPackage();
    expect(line).toMatchObject({ kind: "PAKET", name: `${SLUG} Facial 3x`, quantity: 1, unitPrice: 600_000, treatmentPackageId: packageId });
    const detail = (await getInvoiceDetail(id))!;
    expect(detail.lines[0]).toMatchObject({ kind: "PAKET", catalogLinked: true, packageNote: "3× Facial Uji · berlaku 90 hari", packageUse: null, treatmentPackageId: packageId });
    expect(detail.totals.total).toBe(600_000);
    expect(await prisma.auditLog.count({ where: { action: "invoice.update", entityId: id, summary: `Tambah paket ${SLUG} Facial 3x` } })).toBe(1);
  });

  it("jumlah paket tidak bisa diubah; diskon baris manual tetap bisa dalam batas", async () => {
    const { id, line } = await draftWithPackage();
    expect(await updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 2, unitPrice: 600_000, priceNote: "" })).toEqual({
      ok: false,
      error: "Jumlah paket selalu 1. Tambahkan baris paket lagi untuk paket berikutnya.",
    });
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: line.id, kind: "NOMINAL", value: 60_000, reason: "Member lama" }));
    expect((await getInvoiceDetail(id))!.totals.total).toBe(540_000);
  });

  it("Segarkan harga katalog memperbarui harga paket", async () => {
    const { id } = await draftWithPackage();
    await prisma.treatmentPackage.update({ where: { id: packageId }, data: { price: 700_000 } });
    expect(await unwrap(refreshCatalogPrices({ invoiceId: id, version: await versionOf(id) }))).toMatchObject({ updated: 1 });
    expect((await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } })).unitPrice).toBe(700_000);
  });

  it("paket nonaktif tidak bisa ditambahkan", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await prisma.treatmentPackage.update({ where: { id: packageId }, data: { isActive: false } });
    expect(await addPackageLine({ invoiceId: id, version: 1, packageId })).toEqual({ ok: false, error: `Paket ${SLUG} Facial 3x sudah tidak dijual.` });
    expect(await addPackageLine({ invoiceId: id, version: 1, packageId: "tidak-ada" })).toEqual({ ok: false, error: "Paket tidak ditemukan." });
  });
});
