// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

// Skema paket lama dari Kluto (spec paket lama bagian 3): asal paket, tanpa tagihan pembelian, tanpa batas waktu.
const SLUG = "skema-paket-lama";
const WA = "6281200009701";
let world: BillingWorld;
let packageId: string;
let invoiceId: string;

const day = (value: string) => new Date(`${value}T00:00:00Z`);

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  packageId = (
    await prisma.treatmentPackage.create({
      data: { name: `${SLUG} Lux`, price: 600_000, validDays: 90, items: { create: [{ serviceId: world.treatmentId, sessions: 4 }] } },
    })
  ).id;
  invoiceId = (await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, createdById: "s", createdByName: "Uji" } })).id;
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

const kluto = (data: Record<string, unknown> = {}) =>
  prisma.patientPackage.create({
    data: {
      patientId: world.patientId,
      packageId,
      name: "Lux",
      price: 0,
      source: "KLUTO",
      startsOn: day("2025-03-01"),
      expiresOn: day("9999-12-31"),
      priorVisits: 3,
      note: "Nota 123",
      items: { create: [{ serviceId: world.treatmentId, serviceName: "Facial Uji", sessions: 4 }] },
      ...data,
    },
    select: { id: true, source: true, purchaseLineId: true, items: { select: { id: true } } },
  });

const purchaseLine = () =>
  prisma.invoiceLine.create({ data: { invoiceId, kind: "PAKET", name: "Lux", quantity: 1, unitPrice: 600_000, treatmentPackageId: packageId } });

describe("skema paket lama (Kluto)", () => {
  it("paket KLUTO sah: tanpa tagihan pembelian, harga 0, tanpa batas waktu, dengan kunjungan Kluto dan catatan", async () => {
    const owned = await kluto();
    expect(owned).toMatchObject({ source: "KLUTO", purchaseLineId: null });
  });

  it("asal paket menentukan bentuknya (patient_package_source)", async () => {
    const source = /patient_package_source/;
    await expect(kluto({ purchaseLineId: (await purchaseLine()).id })).rejects.toThrow(source);
    await expect(kluto({ price: 100 })).rejects.toThrow(source);
    await expect(kluto({ expiresOn: day("2027-01-01") })).rejects.toThrow(source);
    await expect(kluto({ source: "TAGIHAN" })).rejects.toThrow(source);
    await expect(kluto({ source: "TAGIHAN", purchaseLineId: (await purchaseLine()).id, price: 600_000, expiresOn: day("2026-12-31"), note: null })).rejects.toThrow(source);
    const sold = await kluto({ source: "TAGIHAN", purchaseLineId: (await purchaseLine()).id, price: 600_000, expiresOn: day("2026-12-31"), note: null, priorVisits: 0 });
    expect(sold.source).toBe("TAGIHAN");
  });

  it("catatan paling banyak 200 karakter, kunjungan Kluto 0..1000", async () => {
    await expect(kluto({ note: "x".repeat(201) })).rejects.toThrow(/patient_package_note/);
    await expect(kluto({ priorVisits: 1001 })).rejects.toThrow(/patient_package_prior_visits/);
    await expect(kluto({ priorVisits: -1 })).rejects.toThrow(/patient_package_prior_visits/);
  });

  it("buku sesi: PAKAI_KLUTO negatif, KOREKSI_KLUTO bukan nol dan wajib beralasan", async () => {
    const owned = await kluto();
    const entry = (data: Record<string, unknown>) =>
      prisma.packageSessionEntry.create({ data: { patientPackageItemId: owned.items[0].id, kind: "BELI", delta: 4, staffId: "s", staffName: "Uji", ...data } });
    const delta = /package_entry_delta/;
    await expect(entry({ kind: "PAKAI_KLUTO", delta: 0 })).rejects.toThrow(delta);
    expect((await entry({ kind: "PAKAI_KLUTO", delta: -2 })).delta).toBe(-2);
    await expect(entry({ kind: "KOREKSI_KLUTO", delta: 0, reason: "salah ketik" })).rejects.toThrow(delta);
    await expect(entry({ kind: "KOREKSI_KLUTO", delta: 1 })).rejects.toThrow(delta);
    await expect(entry({ kind: "KOREKSI_KLUTO", delta: 1, reason: "" })).rejects.toThrow(delta);
    expect((await entry({ kind: "KOREKSI_KLUTO", delta: -1, reason: "salah ketik" })).delta).toBe(-1);
    // Jenis lama tetap dijaga seperti sebelumnya.
    await expect(entry({ kind: "PAKAI", delta: 1 })).rejects.toThrow(delta);
    expect((await entry({})).delta).toBe(4);
  });
});
