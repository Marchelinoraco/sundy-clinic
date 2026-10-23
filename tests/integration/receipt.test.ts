// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { RECEIPT_CANCELLED_TEXT } from "@/lib/receipt";
import { witaDateString } from "@/lib/time";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment, revokeInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceReceipt, getReceiptMessage, recordReceiptPrint, resetReceiptLink } from "@/server/receipt";
import { receiptCode } from "@/server/receipt-link-code";
import { getPublicReceipt } from "@/server/receipt-public";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";
import { testApproval } from "./approver";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Struk", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
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
vi.mock("@/server/request-guard", () => ({ guardRate: vi.fn().mockResolvedValue(undefined), clientIp: vi.fn().mockResolvedValue("127.0.0.1") }));

const SLUG = "struk-uji";
const WA = "6281200009401";
const today = witaDateString(new Date());

let world: BillingWorld;

/** Tagihan penjualan langsung final dengan satu baris layanan; opsional dibayar sebagian. */
async function finalInvoice(price = 300_000, paid = 0) {
  actor.role = "RESEPSIONIS";
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  const { version } = await unwrap(addFreeLine({ invoiceId: id, version: 1, kind: "LAYANAN", name: "Layanan Struk", quantity: 1, unitPrice: price }));
  await unwrap(finalizeInvoice({ invoiceId: id, version }));
  if (paid > 0) await unwrap(recordInvoicePayment({ invoiceId: id, amount: paid, method: "QRIS", paidAt: today, reference: "" }));
  return id;
}

function codeFrom(text: string): string {
  const match = /\/struk#(\S+)/.exec(text);
  if (!match) throw new Error(`Tidak ada tautan struk di pesan: ${text}`);
  return match[1];
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await prisma.patient.update({ where: { id: world.patientId }, data: { name: "Priscillya Struk" } });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("pesan struk WhatsApp", () => {
  it("menyapa nama depan, menyebut nomor, total dan sisa, serta tautan wa.me ke nomor pasien", async () => {
    const id = await finalInvoice(300_000, 100_000);
    const message = await unwrap(getReceiptMessage(id));
    expect(message.text).toMatch(/^Halo Priscillya, terima kasih/);
    expect(message.text).toMatch(/No\. tagihan: TG-\d{4}-\d{4}/);
    expect(message.text).toContain("Total: Rp 300.000 (sisa Rp 200.000)");
    expect(message.link).toMatch(new RegExp(`^https://wa\\.me/${WA}\\?text=`));
    expect(decodeURIComponent(message.link!.split("text=")[1])).toBe(message.text);
  });

  it("dicatat di audit tanpa kode tautan", async () => {
    const id = await finalInvoice();
    const message = await unwrap(getReceiptMessage(id));
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.receipt-link", entityId: id } });
    expect(JSON.stringify(audit)).not.toContain(codeFrom(message.text));
    expect(audit.summary).toMatch(/^TG-\d{4}-\d{4}$/);
  });

  it("draf tidak bisa dibuatkan struk", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    expect(await getReceiptMessage(id)).toEqual({ ok: false, error: "Struk hanya untuk tagihan final." });
    expect(await getReceiptMessage("tidak-ada")).toEqual({ ok: false, error: "Tagihan tidak ditemukan." });
  });

  it("hanya untuk invoice:manage", async () => {
    const id = await finalInvoice();
    actor.role = "ADMIN_KEUANGAN";
    await expect(getReceiptMessage(id)).rejects.toThrow("forbidden: invoice:manage");
    await expect(resetReceiptLink(id)).rejects.toThrow("forbidden: invoice:manage");
    await expect(recordReceiptPrint(id)).rejects.toThrow("forbidden: invoice:manage");
  });
});

describe("struk publik", () => {
  it("tautan sah menampilkan struk tanpa data terlarang", async () => {
    const id = await finalInvoice(300_000, 300_000);
    await prisma.invoice.update({ where: { id }, data: { notes: "catatan internal struk" } });
    const page = await unwrap(getPublicReceipt(codeFrom((await unwrap(getReceiptMessage(id))).text)));
    expect(page.state).toBe("VALID");
    if (page.state !== "VALID") return;
    expect(page.receipt).toMatchObject({ customerName: "Priscillya Struk", total: 300_000, balance: 0, status: "LUNAS", branchAddress: "Alamat" });
    expect(page.receipt.lines).toEqual([{ name: "Layanan Struk", quantity: 1, unitPrice: 300_000, gross: 300_000, discount: 0, amount: 300_000, note: null }]);
    const json = JSON.stringify(page);
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: world.patientId } });
    for (const secret of [WA, patient.medicalRecordNumber, "catatan internal struk"]) expect(json).not.toContain(secret);
  });

  it("pembayaran yang ditarik tidak tampil", async () => {
    const id = await finalInvoice(300_000, 100_000);
    const payment = await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId: id } });
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(revokeInvoicePayment({ paymentId: payment.id, reason: "Salah catat" }));
    actor.role = "RESEPSIONIS";
    const page = await unwrap(getPublicReceipt(codeFrom((await unwrap(getReceiptMessage(id))).text)));
    expect(page.state === "VALID" && page.receipt.payments).toEqual([]);
  });

  it("Ganti tautan: kode lama tidak berlaku, kode baru berlaku", async () => {
    const id = await finalInvoice();
    const oldCode = codeFrom((await unwrap(getReceiptMessage(id))).text);
    await unwrap(resetReceiptLink(id));
    expect(await unwrap(getPublicReceipt(oldCode))).toEqual({ state: "INVALID" });
    const newCode = codeFrom((await unwrap(getReceiptMessage(id))).text);
    expect(newCode).not.toBe(oldCode);
    expect((await unwrap(getPublicReceipt(newCode))).state).toBe("VALID");
    expect(await prisma.auditLog.count({ where: { action: "invoice.receipt-link-reset", entityId: id } })).toBe(1);
  });

  it("tagihan dibatalkan: kode sah → dibatalkan; kode palsu → tidak berlaku", async () => {
    const id = await finalInvoice();
    const code = codeFrom((await unwrap(getReceiptMessage(id))).text);
    actor.role = "SUPER_ADMIN";
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: id, reason: "Salah input" }));
    expect(await unwrap(getPublicReceipt(code))).toEqual({ state: "CANCELLED" });
    expect(await unwrap(getPublicReceipt(receiptCode(id, 5)))).toEqual({ state: "INVALID" });
    expect(RECEIPT_CANCELLED_TEXT).toMatch(/dibatalkan/);
    actor.role = "RESEPSIONIS";
    expect(await resetReceiptLink(id)).toEqual({ ok: false, error: "Tautan struk hanya untuk tagihan final." });
  });

  it("kode rusak, kosong, atau tagihan lain selalu tidak berlaku", async () => {
    const id = await finalInvoice();
    const { id: draftId } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    for (const code of ["", "abc", null, 12, `${id}.${"A".repeat(22)}`, receiptCode(draftId, 0), receiptCode("cmtidakada0000000000", 0)]) {
      expect(await unwrap(getPublicReceipt(code as never)), String(code)).toEqual({ state: "INVALID" });
    }
  });
});

describe("struk untuk cetak di panel", () => {
  it("getInvoiceReceipt untuk invoice:read; null untuk draf", async () => {
    const id = await finalInvoice();
    actor.role = "ADMIN_KEUANGAN";
    expect((await getInvoiceReceipt(id))?.number).toMatch(/^TG-/);
    actor.role = "RESEPSIONIS";
    const { id: draftId } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    expect(await getInvoiceReceipt(draftId)).toBeNull();
  });

  it("recordReceiptPrint mencatat nomor tagihan", async () => {
    const id = await finalInvoice();
    await unwrap(recordReceiptPrint(id));
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.receipt-print", entityId: id } })).summary).toMatch(/^TG-/);
  });
});
