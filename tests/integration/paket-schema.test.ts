// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "skema-paket";
const WA = "6281200009601";
let world: BillingWorld;
let packageId: string;
let invoiceId: string;

const day = (value: string) => new Date(`${value}T00:00:00Z`);

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  packageId = (
    await prisma.treatmentPackage.create({
      data: { name: `${SLUG} Facial 3x`, price: 600_000, validDays: 90, items: { create: [{ serviceId: world.treatmentId, sessions: 3 }] } },
    })
  ).id;
  invoiceId = (await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, createdById: "s", createdByName: "Uji" } })).id;
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

const line = (data: Record<string, unknown>) =>
  prisma.invoiceLine.create({ data: { invoiceId, kind: "PAKET", name: "Facial 3x", quantity: 1, unitPrice: 600_000, treatmentPackageId: packageId, ...data } });

describe("skema paket treatment", () => {
  it("katalog: harga dan masa berlaku masuk akal, sesi 1..100, barang 1..1000, tepat satu isi (spec paket barang PB1)", async () => {
    await expect(prisma.treatmentPackage.create({ data: { name: `${SLUG} x`, price: 1, validDays: 0 } })).rejects.toThrow(/treatment_package_values/);
    await expect(prisma.treatmentPackage.create({ data: { name: `${SLUG} y`, price: -1, validDays: 30 } })).rejects.toThrow(/treatment_package_values/);
    const shape = /treatment_package_item_shape/;
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, serviceId: world.slimmingTreatmentId, sessions: 0 } })).rejects.toThrow(shape);
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, serviceId: world.slimmingTreatmentId, sessions: 101 } })).rejects.toThrow(shape);
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, itemId: world.productId, sessions: 1001, perVisit: 1 } })).rejects.toThrow(shape);
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, sessions: 1 } })).rejects.toThrow(shape);
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, serviceId: world.slimmingTreatmentId, itemId: world.productId, sessions: 1 } })).rejects.toThrow(shape);
    const goods = await prisma.treatmentPackageItem.create({ data: { packageId, itemId: world.productId, sessions: 1000, perVisit: 250 } });
    await prisma.treatmentPackageItem.delete({ where: { id: goods.id } });
  });

  it("rencana kunjungan: jarak 1..365 hari; barang wajib jumlah per kunjungan 1..jumlahnya; treatment tanpa (spec jadwal paket JP2, JP16)", async () => {
    const interval = /treatment_package_visit_interval/;
    await expect(prisma.treatmentPackage.create({ data: { name: `${SLUG} j0`, price: 1, validDays: 30, visitIntervalDays: 0 } })).rejects.toThrow(interval);
    await expect(prisma.treatmentPackage.create({ data: { name: `${SLUG} j366`, price: 1, validDays: 30, visitIntervalDays: 366 } })).rejects.toThrow(interval);
    expect((await prisma.treatmentPackage.findUniqueOrThrow({ where: { id: packageId } })).visitIntervalDays).toBe(7);
    const shape = /treatment_package_item_shape/;
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, itemId: world.productId, sessions: 28 } })).rejects.toThrow(shape);
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, itemId: world.productId, sessions: 28, perVisit: 29 } })).rejects.toThrow(shape);
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, serviceId: world.slimmingTreatmentId, sessions: 4, perVisit: 1 } })).rejects.toThrow(shape);
    const goods = await prisma.treatmentPackageItem.create({ data: { packageId, itemId: world.productId, sessions: 28, perVisit: 7 } });
    await prisma.treatmentPackageItem.delete({ where: { id: goods.id } });
  });

  it("baris PAKET wajib merujuk paket katalog, jumlahnya 1, tanpa barang", async () => {
    await expect(line({ treatmentPackageId: null })).rejects.toThrow(/invoice_line_package_shape/);
    await expect(line({ quantity: 2 })).rejects.toThrow(/invoice_line_package_shape/);
    await expect(line({ itemId: world.productId })).rejects.toThrow(/invoice_line_package_shape|invoice_line_values/);
    await expect(prisma.invoiceLine.create({ data: { invoiceId, kind: "LAYANAN", name: "x", quantity: 1, unitPrice: 1, treatmentPackageId: packageId } })).rejects.toThrow(/invoice_line_package_shape/);
    expect((await line({})).kind).toBe("PAKET");
  });

  it("paket customer, buku sesi, dan baris pemakaian dijaga", async () => {
    const purchase = await line({});
    const owned = await prisma.patientPackage.create({
      data: {
        patientId: world.patientId,
        packageId,
        name: "Facial 3x",
        price: 600_000,
        purchaseLineId: purchase.id,
        startsOn: day("2031-01-01"),
        expiresOn: day("2031-03-31"),
        items: { create: [{ serviceId: world.treatmentId, serviceName: "Facial Uji", sessions: 3 }] },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    const itemId = owned.items[0].id;
    await expect(
      prisma.patientPackage.create({
        data: { patientId: world.patientId, packageId, name: "x", price: 1, purchaseLineId: (await line({})).id, startsOn: day("2031-02-01"), expiresOn: day("2031-01-01") },
      }),
    ).rejects.toThrow(/patient_package_dates/);
    const entry = (data: Record<string, unknown>) => prisma.packageSessionEntry.create({ data: { patientPackageItemId: itemId, kind: "BELI", delta: 3, staffId: "s", staffName: "Uji", ...data } });
    await expect(entry({ kind: "PAKAI", delta: 1 })).rejects.toThrow(/package_entry_delta/);
    await expect(entry({ kind: "BELI", delta: 0 })).rejects.toThrow(/package_entry_delta/);
    await expect(entry({ kind: "PERPANJANG", delta: 0 })).rejects.toThrow(/package_entry_delta/);
    expect((await entry({})).delta).toBe(3);

    const use = (data: Record<string, unknown>) =>
      prisma.invoiceLine.create({ data: { invoiceId, kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 0, patientPackageItemId: itemId, ...data } });
    await expect(use({ unitPrice: 1000 })).rejects.toThrow(/invoice_line_package_shape/);
    await expect(use({ kind: "LAYANAN" })).rejects.toThrow(/invoice_line_package_shape/);
    expect((await use({})).unitPrice).toBe(0);

    // Jatah barang (spec paket barang PB1–PB3): isi barang wajib menyalin satuan; baris BARANG Rp 0 boleh memakai paket,
    // termasuk paket yang dibeli di tagihan yang sama, tetapi baris PAKET sendiri tidak.
    await expect(
      prisma.patientPackageItem.create({ data: { patientPackageId: owned.id, itemId: world.productId, serviceName: "Produk Uji", sessions: 30, perVisit: 7 } }),
    ).rejects.toThrow(/patient_package_item_shape/);
    await expect(
      prisma.patientPackageItem.create({ data: { patientPackageId: owned.id, itemId: world.productId, unit: "botol", serviceName: "Produk Uji", sessions: 30 } }),
    ).rejects.toThrow(/patient_package_item_shape/);
    const goods = await prisma.patientPackageItem.create({ data: { patientPackageId: owned.id, itemId: world.productId, unit: "botol", serviceName: "Produk Uji", sessions: 30, perVisit: 7 } });

    // Pengingat kunjungan dicatat sekali per paket dan tanggal rencana (spec jadwal paket JP12).
    const reminder = { patientPackageId: owned.id, visitOn: day("2031-01-08"), staffId: "s", staffName: "Uji" };
    await prisma.packageVisitReminder.create({ data: reminder });
    await expect(prisma.packageVisitReminder.create({ data: reminder })).rejects.toThrow(/Unique constraint/);
    await expect(prisma.patientPackage.update({ where: { id: owned.id }, data: { visitIntervalDays: 0 } })).rejects.toThrow(/patient_package_visit_interval/);
    const take = (data: Record<string, unknown>) =>
      prisma.invoiceLine.create({ data: { invoiceId, kind: "BARANG", name: "Produk Uji", quantity: 2, unitPrice: 0, itemId: world.productId, ...data } });
    expect((await take({ patientPackageItemId: goods.id })).unitPrice).toBe(0);
    expect((await take({ packageSourceLineId: purchase.id })).packageSourceLineId).toBe(purchase.id);
    await expect(take({ packageSourceLineId: purchase.id, unitPrice: 5000 })).rejects.toThrow(/invoice_line_package_shape/);
    await expect(line({ packageSourceLineId: purchase.id })).rejects.toThrow(/invoice_line_package_shape/);
  });
});
