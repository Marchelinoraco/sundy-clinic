// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addInvoiceItem, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { getPurchaseDetail, listPurchases } from "@/server/purchase-read";
import { createPurchase } from "@/server/purchases";
import { getStockItemDetail, listStockItems } from "@/server/stock-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Modal", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "lihat-modal";
const WA = "6281200009703";
const today = witaDateString(new Date());
let world: BillingWorld;
let purchaseId: string;
let invoiceId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  actor.role = "SUPER_ADMIN";
  purchaseId = (
    await unwrap(
      createPurchase({
        supplierId: world.supplierId,
        branchId: world.branchId,
        invoiceNumber: `${SLUG}-1`,
        invoiceDate: today,
        dueDate: addDaysToDateString(today, 30),
        notes: "",
        lines: [{ itemId: world.productId, quantity: 5, unitCost: 9000, batchNumber: "B-1", expiryDate: "" }],
      }),
    )
  ).id;
  invoiceId = (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;
  await unwrap(addInvoiceItem({ invoiceId, version: 1, itemId: world.productId, quantity: 1 }));
  await unwrap(finalizeInvoice({ invoiceId, version: (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version }));
});
beforeEach(() => {
  actor.role = "SUPER_ADMIN";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("harga beli dan harga pokok hanya untuk hak harga (Review Focus 5)", () => {
  it("Apoteker: faktur, daftar barang masuk, dan stok tanpa angka harga", async () => {
    actor.role = "APOTEKER";
    const detail = (await getPurchaseDetail(purchaseId))!;
    expect(detail).toMatchObject({ canSeeCost: false, total: null });
    expect(detail.lines[0]).toMatchObject({ unitCost: null, amount: null, quantity: 5 });
    expect(detail.summary).toMatchObject({ paid: 0, balance: 0 });
    expect((await listPurchases()).find((row) => row.id === purchaseId)!.total).toBeNull();
    expect((await listStockItems({ branchId: world.branchId })).find((row) => row.id === world.productId)!.value).toBeNull();
    expect((await getStockItemDetail(world.productId))!.batches.every((batch) => batch.unitCost === null)).toBe(true);
  });

  it("Resepsionis: tagihan tanpa harga pokok", async () => {
    actor.role = "RESEPSIONIS";
    const detail = (await getInvoiceDetail(invoiceId))!;
    expect(detail.cost).toBeNull();
    expect(detail.lines.every((line) => line.cost === null)).toBe(true);
  });

  it("Admin Keuangan: semua angka tampil", async () => {
    actor.role = "ADMIN_KEUANGAN";
    expect((await getPurchaseDetail(purchaseId))!).toMatchObject({ canSeeCost: true, total: 45_000 });
    expect((await getInvoiceDetail(invoiceId))!.cost).toBe(9000);
    expect((await listStockItems({ branchId: world.branchId })).find((row) => row.id === world.productId)!.value).toBe(36_000);
  });
});
