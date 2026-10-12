// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceDetail } from "@/server/invoice-read";
import { getReceiptMessage } from "@/server/receipt";
import { getPublicReceipt } from "@/server/receipt-public";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({ userId: "u", staffId: "s", name: "Resepsionis Transfer", role: "SUPER_ADMIN", email: "u@uji.test" }),
}));
vi.mock("@/server/request-guard", () => ({ guardRate: vi.fn().mockResolvedValue(undefined), clientIp: vi.fn().mockResolvedValue("127.0.0.1") }));

const SLUG = "transfer-tagihan";
const WA = "6281200009505";
const today = witaDateString(new Date());
let world: BillingWorld;
let invoiceId: string;
let accountId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  accountId = (await prisma.clinicBankAccount.create({ data: { bankName: "BCA Transfer Uji", accountNumber: "1234567890", accountHolder: "SunDY Clinic" } })).id;
  invoiceId = (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;
  const { version } = await unwrap(addFreeLine({ invoiceId, version: 1, kind: "LAYANAN", name: "Layanan Transfer", quantity: 1, unitPrice: 300_000 }));
  await unwrap(finalizeInvoice({ invoiceId, version }));
});
afterAll(async () => {
  await prisma.invoicePayment.deleteMany({ where: { invoiceId } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.clinicBankAccount.deleteMany({ where: { bankName: "BCA Transfer Uji" } });
  await prisma.$disconnect();
});

describe("transfer bank", () => {
  it("menyimpan rekening tujuan, salinan labelnya, dan data pengirim", async () => {
    await unwrap(
      recordInvoicePayment({ invoiceId, amount: 100_000, method: "TRANSFER", paidAt: today, reference: "REF-1", clinicBankAccountId: accountId, senderBank: "BRI", senderAccountName: "Budi", senderAccountNumber: "****1234" }),
    );
    const payment = await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId, reference: "REF-1" } });
    expect(payment).toMatchObject({ clinicBankAccountId: accountId, destinationLabel: "BCA Transfer Uji 1234567890 a.n. SunDY Clinic", senderBank: "BRI", senderAccountName: "Budi", senderAccountNumber: "****1234" });
    expect((await getInvoiceDetail(invoiceId))!.payments[0]).toMatchObject({ destinationLabel: "BCA Transfer Uji 1234567890 a.n. SunDY Clinic", senderBank: "BRI" });
  });

  it("salinan tidak berubah setelah rekening diedit (Review Focus 3)", async () => {
    await prisma.clinicBankAccount.update({ where: { id: accountId }, data: { accountHolder: "Nama Baru" } });
    expect((await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId, reference: "REF-1" } })).destinationLabel).toContain("SunDY Clinic");
  });

  it("tanpa rekening tujuan, rekening nonaktif, atau tidak ada ditolak", async () => {
    const base = { invoiceId, amount: 1000, method: "TRANSFER" as const, paidAt: today, reference: "" };
    expect(await recordInvoicePayment(base)).toEqual({ ok: false, error: "Pilih rekening tujuan." });
    expect(await recordInvoicePayment({ ...base, clinicBankAccountId: "tidak-ada" })).toEqual({ ok: false, error: "Rekening tujuan tidak ditemukan." });
    await prisma.clinicBankAccount.update({ where: { id: accountId }, data: { isActive: false } });
    expect(await recordInvoicePayment({ ...base, clinicBankAccountId: accountId })).toEqual({ ok: false, error: "Rekening tujuan tidak aktif." });
    await prisma.clinicBankAccount.update({ where: { id: accountId }, data: { isActive: true } });
  });

  it("data rekening pengirim tidak ada di struk publik maupun audit", async () => {
    const code = /\/struk#(\S+)/.exec((await unwrap(getReceiptMessage(invoiceId))).text)![1];
    const json = JSON.stringify(await unwrap(getPublicReceipt(code)));
    for (const secret of ["****1234", "Budi", "BRI"]) expect(json).not.toContain(secret);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice-payment.create" }, orderBy: { createdAt: "desc" } });
    expect(audit.summary).not.toContain("****1234");
  });
});
