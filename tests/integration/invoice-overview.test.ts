// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { unpaidOverview } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "ikhtisar-tagihan";
const WA = "6281200008841";

describe("ikhtisar tagihan belum lunas", () => {
  let world: BillingWorld;

  async function finalInvoice() {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    const { version } = await unwrap(addFreeLine({ invoiceId: id, version: 1, kind: "LAYANAN", name: "Layanan Uji", quantity: 1, unitPrice: 100000 }));
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    return id;
  }

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });
  beforeEach(() => {
    actor.role = "RESEPSIONIS";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("menghitung hanya tagihan final dengan sisa; draf, lunas, dan dibatalkan tidak", async () => {
    const before = await unpaidOverview();
    const partly = await finalInvoice();
    await unwrap(recordInvoicePayment({ invoiceId: partly, amount: 30000, method: "TUNAI", paidAt: witaDateString(new Date()), reference: "" }));
    await finalInvoice();
    const paid = await finalInvoice();
    await unwrap(recordInvoicePayment({ invoiceId: paid, amount: 100000, method: "QRIS", paidAt: witaDateString(new Date()), reference: "" }));
    const cancelled = await finalInvoice();
    await unwrap(cancelInvoice({ invoiceId: cancelled, reason: "Salah" }));
    await unwrap(createDirectSale({ patientId: world.patientId }));

    const after = await unpaidOverview();
    expect(after.count - before.count).toBe(2);
    expect(after.balance - before.balance).toBe(170000);
  });

  it("Dokter tidak boleh melihatnya", async () => {
    actor.role = "DOKTER";
    await expect(unpaidOverview()).rejects.toThrow(/forbidden: invoice:read/);
  });
});
