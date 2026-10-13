// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { buildPublicReceipt } from "@/lib/receipt";
import { addPackageLine, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { loadReceiptSource } from "@/server/receipt-store";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Struk", role: "RESEPSIONIS" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", () => ({ requireCapability: vi.fn(async () => actor) }));

const SLUG = "struk-paket";
const WA = "6281200009608";
let world: BillingWorld;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("struk dengan baris paket", () => {
  it("baris paket membawa isi dan tanggal berlaku", async () => {
    const packageId = await catalogPackage(world, { name: "Facial 3x", validDays: 90 });
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
    const version = (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    const receipt = buildPublicReceipt((await loadReceiptSource(id))!)!;
    expect(receipt.lines[0].note).toMatch(/^3× Facial Uji · berlaku s\.d\. /);
  });
});
