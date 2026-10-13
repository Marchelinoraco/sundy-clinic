// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { updateInvoiceNotes } from "@/server/invoice-notes";
import { getPublicReceipt } from "@/server/receipt-public";
import { getReceiptMessage } from "@/server/receipt";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Uji Catatan", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/server/request-guard", () => ({ guardRate: vi.fn().mockResolvedValue(undefined), clientIp: vi.fn().mockResolvedValue("127.0.0.1") }));

const SLUG = "catatan-tagihan";
const WA = "6281200009504";
let world: BillingWorld;
let invoiceId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  actor.role = "RESEPSIONIS";
  invoiceId = (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("catatan internal tagihan", () => {
  it("disimpan saat draf tanpa menaikkan versi draf, audit tanpa isi", async () => {
    const before = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
    await unwrap(updateInvoiceNotes({ invoiceId, notes: "  inject ke 1 L jam 10.00  " }));
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice).toMatchObject({ notes: "inject ke 1 L jam 10.00", version: before });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.notes", entityId: invoiceId } });
    expect(audit.summary).toBe("draf");
  });

  it("bisa diubah setelah final, juga oleh Admin Keuangan; kosong menghapus", async () => {
    const { version } = await unwrap(addFreeLine({ invoiceId, version: (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version, kind: "LAYANAN", name: "Catatan Uji", quantity: 1, unitPrice: 1000 }));
    await unwrap(finalizeInvoice({ invoiceId, version }));
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(updateInvoiceNotes({ invoiceId, notes: "rahasia internal" }));
    actor.role = "RESEPSIONIS";
    const code = /\/struk#(\S+)/.exec((await unwrap(getReceiptMessage(invoiceId))).text)![1];
    expect(JSON.stringify(await unwrap(getPublicReceipt(code)))).not.toContain("rahasia internal");
    await unwrap(updateInvoiceNotes({ invoiceId, notes: "" }));
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).notes).toBeNull();
  });

  it("lebih dari 500 karakter ditolak; peran tanpa hak ditolak", async () => {
    expect(await updateInvoiceNotes({ invoiceId, notes: "a".repeat(501) })).toEqual({ ok: false, error: "Catatan paling banyak 500 karakter." });
    actor.role = "APOTEKER";
    await expect(updateInvoiceNotes({ invoiceId, notes: "x" })).rejects.toThrow("forbidden: invoice:read");
  });
});
