// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { addPackageLine, applyPackageVisit, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
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
let pkgId: string;
let items: { id: string; serviceName: string }[];
const today = () => witaDateString(new Date());
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
const linesOf = (invoiceId: string) =>
  prisma.invoiceLine.findMany({ where: { invoiceId }, orderBy: { sortOrder: "asc" }, select: { kind: true, name: true, quantity: true, unitPrice: true, serviceId: true, itemId: true, patientPackageItemId: true } });
const apply = async (invoiceId: string) => applyPackageVisit({ invoiceId, version: await versionOf(invoiceId), patientPackageId: pkgId });
const directSale = async () => (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, { invoiceNumber: `${SLUG}-F1`, itemId: world.drugId, quantity: 500 });
  // 2× Facial + 10 kapsul (7 per kunjungan): kunjungan 2 hanya tersisa 3 kapsul.
  const lux = await prisma.treatmentPackage.create({
    data: {
      name: `${SLUG} Lux`,
      price: 2_000_000,
      validDays: 90,
      visitIntervalDays: 7,
      items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }, { itemId: world.drugId, sessions: 10, perVisit: 7, sortOrder: 1 }] },
    },
    select: { id: true },
  });
  const sale = await directSale();
  await unwrap(addPackageLine({ invoiceId: sale, version: await versionOf(sale), packageId: lux.id }));
  await unwrap(finalizeInvoice({ invoiceId: sale, version: await versionOf(sale) }));
  const pkg = await prisma.patientPackage.findFirstOrThrow({ where: { packageId: lux.id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
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
          date: today(),
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
});
