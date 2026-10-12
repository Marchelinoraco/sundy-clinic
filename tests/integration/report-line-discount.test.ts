// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { invoiceTotals } from "@/lib/invoice";
import { invoiceAggregates } from "@/server/report-sql";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "laporan-diskon";
const WA = "6281200009503";
let world: BillingWorld;
const at = new Date("2031-05-10T03:00:00Z");

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      status: "FINAL",
      number: "TG-2031-9001",
      finalizedAt: at,
      finalizedByName: "Uji",
      discountKind: "PERSEN",
      discountValue: 5,
      discountReason: "Pelanggan lama",
      lines: {
        create: [
          { kind: "BARANG", name: "Serum", itemId: world.productId, quantity: 2, unitPrice: 150_000, discountAmount: 30_000, discountReason: "Promo: Uji", discountSource: "PROMO" },
          { kind: "LAYANAN", name: "Facial", quantity: 1, unitPrice: 100_000, discountAmount: 10_000, discountReason: "Uji", discountSource: "MANUAL" },
        ],
      },
      payments: { create: [{ amount: 100_000, method: "TUNAI", paidAt: new Date("2031-05-10T00:00:00Z"), staffId: "s", staffName: "Uji" }] },
    },
  });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("laporan dengan diskon baris (Review Focus 5)", () => {
  it("per jenis kotor, diskon = item + tagihan, pendapatan bersih = total tagihan, sisa benar", async () => {
    const [row] = await invoiceAggregates(new Date("2031-05-01T00:00:00Z"), new Date("2031-06-01T00:00:00Z"), world.branchId, false);
    expect(row).toMatchObject({ goods: 300_000, service: 100_000, discount: 40_000 + 18_000, outstanding: 342_000 - 100_000, invoiceCount: 1 });
    const total = invoiceTotals({
      status: "FINAL",
      discountKind: "PERSEN",
      discountValue: 5,
      lines: [
        { quantity: 2, unitPrice: 150_000, discountAmount: 30_000 },
        { quantity: 1, unitPrice: 100_000, discountAmount: 10_000 },
      ],
      payments: [],
    }).total;
    expect(row.goods + row.service + row.treatment - row.discount).toBe(total);
  });
});
