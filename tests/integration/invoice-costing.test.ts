// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addFreeLine, addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit, setLineDiscount, setLinePerformer, updateInvoiceLine } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { assignPerformers, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Biaya", role: "RESEPSIONIS" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "salinan-biaya";
const WA = "6281200009706";
let world: BillingWorld;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
const finalize = async (id: string) => unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
async function visitDraft() {
  const { appointmentId } = await finalVisit(world);
  const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
  return { id, line: await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } }) };
}
const costsOf = async (lineId: string) =>
  prisma.invoiceLine.findUniqueOrThrow({ where: { id: lineId }, select: { materialCost: true, toolCost: true, otherCost: true, commissionAmount: true } });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(async () => {
  // Facial Uji: Rp 250.000, bahan 40.000, alat 10.000, komisi 10%.
  await prisma.service.update({ where: { id: world.treatmentId }, data: { promoPrice: 250_000, materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 } });
});
afterAll(async () => {
  await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("salinan biaya dan komisi saat final", () => {
  it("komisi persen dari harga katalog × jumlah, bukan harga baris berdiskon (Review Focus 4)", async () => {
    const draft = await visitDraft();
    await unwrap(updateInvoiceLine({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, quantity: 2, unitPrice: 250_000, priceNote: "" }));
    await unwrap(setLineDiscount({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, kind: "NOMINAL", value: 50_000, reason: "Member" }));
    await finalize(draft.id);
    expect(await costsOf(draft.line.id)).toEqual({ materialCost: 80_000, toolCost: 20_000, otherCost: 0, commissionAmount: 50_000 });
  });

  it("biaya lainnya ikut disalin × jumlah; katalog berubah sesudahnya tidak mengubah salinan (spec biaya lainnya BL2)", async () => {
    await prisma.serviceCostLine.createMany({
      data: [
        { serviceId: world.treatmentId, name: "Laundry", amount: 5000, sortOrder: 0 },
        { serviceId: world.treatmentId, name: "Listrik", amount: 3000, sortOrder: 1 },
      ],
    });
    try {
      const draft = await visitDraft();
      await unwrap(updateInvoiceLine({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, quantity: 2, unitPrice: 250_000, priceNote: "" }));
      await finalize(draft.id);
      expect((await costsOf(draft.line.id)).otherCost).toBe(16_000);
      await prisma.serviceCostLine.deleteMany({ where: { serviceId: world.treatmentId } });
      expect((await costsOf(draft.line.id)).otherCost).toBe(16_000);
    } finally {
      await prisma.serviceCostLine.deleteMany({ where: { serviceId: world.treatmentId } });
    }
  });

  it("tanpa pelaksana tidak bisa difinalkan (spec aturan pakai PL3); komisi rupiah × jumlah; katalog berubah sesudahnya tidak mengubah salinan", async () => {
    const none = await visitDraft();
    await unwrap(setLinePerformer({ invoiceId: none.id, version: await versionOf(none.id), lineId: none.line.id, performerId: null }));
    expect(await finalizeInvoice({ invoiceId: none.id, version: await versionOf(none.id) })).toEqual({ ok: false, error: `Pilih pelaksana untuk ${none.line.name}.` });

    await prisma.service.update({ where: { id: world.treatmentId }, data: { commissionKind: "NOMINAL", commissionValue: 15_000 } });
    const flat = await visitDraft();
    await finalize(flat.id);
    expect((await costsOf(flat.line.id)).commissionAmount).toBe(15_000);
    await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 99_000 } });
    expect((await costsOf(flat.line.id)).materialCost).toBe(40_000);
  });

  it("sesi paket Rp 0 tetap menyimpan biaya dan komisi; baris bebas tanpa layanan dan baris layanan 0 (Review Focus 4)", async () => {
    const packageId = await catalogPackage(world, { name: "Facial 3x" });
    const sale = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: sale.id, version: 1, packageId }));
    await finalize(sale.id);
    const itemId = (await prisma.patientPackageItem.findFirstOrThrow({ where: { patientPackage: { purchaseLine: { invoiceId: sale.id } } } })).id;
    const draft = await visitDraft();
    await unwrap(applyPackageSession({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, patientPackageItemId: itemId }));
    await unwrap(addFreeLine({ invoiceId: draft.id, version: await versionOf(draft.id), kind: "TREATMENT", name: "Bebas", quantity: 1, unitPrice: 10_000 }));
    // Baris treatment bebas juga butuh pelaksana (spec aturan pakai PL3); tanpa layanan, komisinya tetap 0.
    await assignPerformers(world, draft.id);
    await finalize(draft.id);
    expect(await costsOf(draft.line.id)).toEqual({ materialCost: 40_000, toolCost: 10_000, otherCost: 0, commissionAmount: 25_000 });
    const free = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: draft.id, name: "Bebas" } });
    const consult = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: draft.id, kind: "LAYANAN" } });
    expect(await costsOf(free.id)).toEqual({ materialCost: 0, toolCost: 0, otherCost: 0, commissionAmount: 0 });
    expect(await costsOf(consult.id)).toEqual({ materialCost: 0, toolCost: 0, otherCost: 0, commissionAmount: 0 });
  });
});
