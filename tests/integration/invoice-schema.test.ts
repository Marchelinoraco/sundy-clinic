// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isExclusionViolation } from "@/server/db-errors";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

const SLUG = "skema-tagihan";
const WA = "6281200008800";

describe("skema tagihan", () => {
  let world: BillingWorld;
  let appointmentId: string;

  const invoice = (data: Record<string, unknown> = {}) =>
    prisma.invoice.create({
      data: {
        patientId: world.patientId,
        branchId: world.branchId,
        createdById: "s1",
        createdByName: "Resepsionis Uji",
        ...data,
      },
    });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    appointmentId = (await finalVisit(world)).appointmentId;
  });

  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("tagihan baru berstatus draf, versi 1, tanpa nomor", async () => {
    expect(await invoice()).toMatchObject({ status: "DRAF", version: 1, number: null, discountValue: 0 });
  });

  it("tagihan final wajib bernomor dan berwaktu final; draf tidak boleh bernomor", async () => {
    await expect(invoice({ status: "FINAL" })).rejects.toThrow(/invoice_status_fields/);
    await expect(invoice({ number: "TG-2031-9999" })).rejects.toThrow(/invoice_status_fields/);
    expect(await invoice({ status: "FINAL", number: "TG-2031-9998", finalizedAt: new Date() })).toMatchObject({ status: "FINAL" });
  });

  it("diskon: persen paling banyak 100, wajib jenis dan alasan bila bernilai", async () => {
    await expect(invoice({ discountKind: "PERSEN", discountValue: 101, discountReason: "x" })).rejects.toThrow(/invoice_discount_values/);
    await expect(invoice({ discountValue: 5000, discountReason: "x" })).rejects.toThrow(/invoice_discount_values/);
    await expect(invoice({ discountKind: "NOMINAL", discountValue: 5000 })).rejects.toThrow(/invoice_discount_values/);
    expect(await invoice({ discountKind: "NOMINAL", discountValue: 5000, discountReason: "Pelanggan lama" })).toMatchObject({ discountValue: 5000 });
  });

  it("satu tagihan aktif per kunjungan; yang dibatalkan tidak menghalangi", async () => {
    const first = await invoice({ appointmentId });
    const clash = await invoice({ appointmentId }).catch((error: unknown) => error);
    expect(isExclusionViolation(clash)).toBe(true);
    await prisma.invoice.update({ where: { id: first.id }, data: { status: "DIBATALKAN", cancelledAt: new Date() } });
    expect((await invoice({ appointmentId })).status).toBe("DRAF");
  });

  it("baris: jumlah positif, harga tidak negatif, barang wajib punya barang", async () => {
    const created = await invoice();
    const line = (data: Record<string, unknown>) =>
      prisma.invoiceLine.create({ data: { invoiceId: created.id, kind: "LAYANAN", name: "Konsultasi", quantity: 1, unitPrice: 1000, ...data } });
    await expect(line({ quantity: 0 })).rejects.toThrow(/invoice_line_values/);
    await expect(line({ unitPrice: -1 })).rejects.toThrow(/invoice_line_values/);
    await expect(line({ kind: "BARANG" })).rejects.toThrow(/invoice_line_values/);
    await expect(line({ itemId: world.drugId })).rejects.toThrow(/invoice_line_values/);
    expect((await line({ kind: "BARANG", itemId: world.drugId })).kind).toBe("BARANG");
  });

  it("pembayaran harus lebih dari 0; treatment yang sama tidak masuk dua kali di satu tagihan", async () => {
    const created = await invoice();
    await expect(
      prisma.invoicePayment.create({
        data: { invoiceId: created.id, amount: 0, method: "TUNAI", paidAt: new Date("2031-01-01T00:00:00Z"), staffId: "s1", staffName: "Uji" },
      }),
    ).rejects.toThrow(/invoice_payment_amount_positive/);
    const base = { invoiceId: created.id, kind: "TREATMENT" as const, name: "Facial", quantity: 1, unitPrice: 1000, encounterTreatmentId: "et-1" };
    await prisma.invoiceLine.create({ data: base });
    await expect(prisma.invoiceLine.create({ data: base })).rejects.toThrow(/Unique constraint/);
  });
});
