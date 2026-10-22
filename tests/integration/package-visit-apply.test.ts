// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addInvoiceItem, addPackageLine, applyPackageVisit, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { listPackageVisitPlans } from "@/server/patient-package-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({ userId: "u", staffId: "s", name: "Rina Rencana", role: "RESEPSIONIS", email: "u@uji.test" }),
}));

const SLUG = "pakai-rencana";
const WA = "6281200009643";
let world: BillingWorld;
let luxId: string;
let pkgId: string;
let items: { id: string; serviceName: string }[];
const today = () => witaDateString(new Date());
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
const linesOf = (invoiceId: string) =>
  prisma.invoiceLine.findMany({ where: { invoiceId }, orderBy: { sortOrder: "asc" }, select: { kind: true, name: true, quantity: true, unitPrice: true, serviceId: true, itemId: true, patientPackageItemId: true } });
const apply = async (invoiceId: string) => applyPackageVisit({ invoiceId, version: await versionOf(invoiceId), patientPackageId: pkgId });
const directSale = async () => (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;

/** Membeli paket Lux lewat penjualan langsung; hasilnya paket customer dengan isinya. */
async function buyLux() {
  const sale = await directSale();
  await unwrap(addPackageLine({ invoiceId: sale, version: await versionOf(sale), packageId: luxId }));
  const purchaseLineId = (await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: sale, kind: "PAKET" } })).id;
  await unwrap(finalizeInvoice({ invoiceId: sale, version: await versionOf(sale) }));
  return prisma.patientPackage.findUniqueOrThrow({ where: { purchaseLineId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, { invoiceNumber: `${SLUG}-F1`, itemId: world.drugId, quantity: 500 });
  // 2× Facial + 10 kapsul (7 per kunjungan): kunjungan 2 hanya tersisa 3 kapsul.
  luxId = (await prisma.treatmentPackage.create({
    data: {
      name: `${SLUG} Lux`,
      price: 2_000_000,
      validDays: 90,
      visitIntervalDays: 7,
      items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }, { itemId: world.drugId, sessions: 10, perVisit: 7, sortOrder: 1 }] },
    },
    select: { id: true },
  })).id;
  const pkg = await buyLux();
  pkgId = pkg.id;
  items = pkg.items;
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("Pakai sesuai rencana (spec jadwal paket JP8)", () => {
  it("rencana kunjungan berikutnya per paket milik customer", async () => {
    expect(await listPackageVisitPlans(world.patientId)).toEqual([
      {
        patientPackageId: pkgId,
        packageName: `${SLUG} Lux`,
        visit: {
          number: 1,
          date: addDaysToDateString(today(), 7),
          contents: [
            { name: items[0].serviceName, unit: null, quantity: 1 },
            { name: `${SLUG} Amoxicillin`, unit: "kapsul", quantity: 7 },
          ],
        },
      },
    ]);
  });

  it("draf dari kunjungan: baris Facial yang ada ditandai, 7 kapsul ditambahkan Rp 0; menekan lagi tidak menggandakan", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const before = (await linesOf(id)).filter((line) => line.kind === "TREATMENT");
    expect(before).toHaveLength(1);
    await unwrap(apply(id));
    const lines = await linesOf(id);
    expect(lines.filter((line) => line.kind === "TREATMENT")).toEqual([expect.objectContaining({ serviceId: world.treatmentId, unitPrice: 0, patientPackageItemId: items[0].id })]);
    expect(lines.filter((line) => line.kind === "BARANG")).toEqual([expect.objectContaining({ itemId: world.drugId, quantity: 7, unitPrice: 0, patientPackageItemId: items[1].id })]);

    expect(await apply(id)).toEqual({ ok: false, error: `Isi kunjungan paket ${SLUG} Lux sudah ada di tagihan ini.` });
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
  });

  it("penjualan langsung: Facial ditambahkan Rp 0 dan barang tinggal 3 diambil 3 (Review Focus 4)", async () => {
    expect((await listPackageVisitPlans(world.patientId))[0].visit.number).toBe(2);
    const id = await directSale();
    await unwrap(apply(id));
    expect(await linesOf(id)).toEqual([
      expect.objectContaining({ kind: "TREATMENT", name: items[0].serviceName, quantity: 1, unitPrice: 0, serviceId: world.treatmentId, patientPackageItemId: items[0].id }),
      expect.objectContaining({ kind: "BARANG", quantity: 3, unitPrice: 0, itemId: world.drugId, patientPackageItemId: items[1].id }),
    ]);
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
  });

  it("paket yang sudah habis ditolak dan tidak punya rencana", async () => {
    expect(await listPackageVisitPlans(world.patientId)).toEqual([]);
    const id = await directSale();
    expect(await apply(id)).toEqual({ ok: false, error: "Paket ini sudah habis." });
  });

  it("barang paket yang sudah ada di draf (mis. obat resep) dipakai, bukan digandakan; kekurangannya ditambahkan (temuan review I1)", async () => {
    const pkg = await buyLux();
    const id = await directSale();
    await unwrap(addInvoiceItem({ invoiceId: id, version: await versionOf(id), itemId: world.drugId, quantity: 5 }));
    await unwrap(applyPackageVisit({ invoiceId: id, version: await versionOf(id), patientPackageId: pkg.id }));
    expect((await linesOf(id)).filter((line) => line.kind === "BARANG")).toEqual([
      expect.objectContaining({ quantity: 5, unitPrice: 0, patientPackageItemId: pkg.items[1].id }),
      expect.objectContaining({ quantity: 2, unitPrice: 0, patientPackageItemId: pkg.items[1].id }),
    ]);
  });

  it("baris barang yang melebihi rencana tidak diubah; resepsionis diminta memutuskan sendiri (temuan review I1)", async () => {
    const pkg = await buyLux();
    const id = await directSale();
    await unwrap(addInvoiceItem({ invoiceId: id, version: await versionOf(id), itemId: world.drugId, quantity: 9 }));
    expect(await applyPackageVisit({ invoiceId: id, version: await versionOf(id), patientPackageId: pkg.id })).toEqual({
      ok: false,
      error: `${SLUG} Amoxicillin ×9 sudah ada di tagihan, lebih dari rencana 7 kapsul. Klik Pakai jatah paket di baris itu, lalu tekan Pakai sesuai rencana lagi.`,
    });
    expect(await linesOf(id)).toEqual([expect.objectContaining({ kind: "BARANG", quantity: 9, unitPrice: 2000, patientPackageItemId: null })]);
  });
});
