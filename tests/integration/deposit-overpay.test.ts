// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { invoiceTotals } from "@/lib/invoice";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { applyFinalDiscount, recordInvoicePayment, revokeInvoicePayment } from "@/server/invoice-payments";
import { TOTALS_SELECT } from "@/server/invoice-store";
import { testApproval } from "./approver";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s-lebih", name: "Kasir Lebih", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

// Kelebihan bayar non-tunai menjadi saldo deposit pasien (spec deposit D5, D12, D14).
const SLUG = "deposit-lebih";
const WA = "6281200009733";
const today = witaDateString(new Date());
let world: BillingWorld;

async function finalInvoice(total: number) {
  const invoice = await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, createdById: "s", createdByName: "Uji" } });
  await prisma.invoiceLine.create({ data: { invoiceId: invoice.id, kind: "LAYANAN", name: "Layanan Lebih", quantity: 1, unitPrice: total, sortOrder: 0 } });
  const { number } = await unwrap(finalizeInvoice({ invoiceId: invoice.id, version: invoice.version }));
  return { id: invoice.id, number };
}
const pay = (invoiceId: string, amount: number, method: "QRIS" | "TUNAI" = "QRIS") => recordInvoicePayment({ invoiceId, amount, method, paidAt: today, reference: "" });
const totalsOf = async (id: string) => invoiceTotals(await prisma.invoice.findUniqueOrThrow({ where: { id }, select: TOTALS_SELECT }));

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await prisma.depositUse.deleteMany({ where: { invoice: { patientId: world.patientId } } });
  await prisma.depositCredit.deleteMany({ where: { patientId: world.patientId } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("kelebihan bayar", () => {
  it("QRIS Rp500.000 untuk sisa Rp450.000: Lunas dan saldo Rp50.000 berlaku 30 hari dari tanggal bayar (D5)", async () => {
    const { id } = await finalInvoice(450_000);
    const { id: paymentId } = await unwrap(pay(id, 500_000));
    expect(await totalsOf(id)).toMatchObject({ paid: 500_000, display: "LUNAS" });
    const credit = await prisma.depositCredit.findUniqueOrThrow({ where: { sourcePaymentId: paymentId } });
    expect(credit).toMatchObject({ amount: 50_000, source: "KELEBIHAN_BAYAR", sourceInvoiceId: id, patientId: world.patientId });
    expect(credit.validUntil.toISOString().slice(0, 10)).toBe(addDaysToDateString(today, 30));
    expect(await prisma.auditLog.count({ where: { action: "deposit.credit", entityId: credit.id } })).toBe(1);
  });

  it("tunai melebihi sisa tetap ditolak; pembayaran pas tidak membuat saldo (D5)", async () => {
    const { id } = await finalInvoice(450_000);
    expect(await pay(id, 500_000, "TUNAI")).toEqual({ ok: false, error: "Nominal melebihi sisa tagihan (Rp 450.000)." });
    await unwrap(pay(id, 450_000, "TUNAI"));
    expect(await prisma.depositCredit.count({ where: { sourceInvoiceId: id } })).toBe(0);
  });

  it("batalkan pembayaran berlebih: saldo yang belum dipakai ikut hilang; yang sudah dipakai menolak dengan nomor tagihan (Review Focus 4)", async () => {
    const first = await finalInvoice(450_000);
    const { id: unused } = await unwrap(pay(first.id, 500_000));
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(revokeInvoicePayment({ paymentId: unused, reason: "Salah catat" }));
    expect(await prisma.depositCredit.count({ where: { sourcePaymentId: unused } })).toBe(0);

    actor.role = "RESEPSIONIS";
    const second = await finalInvoice(450_000);
    const { id: used } = await unwrap(pay(second.id, 500_000));
    const consumer = await finalInvoice(30_000);
    expect((await totalsOf(consumer.id)).deposit).toBe(30_000);
    actor.role = "ADMIN_KEUANGAN";
    expect(await revokeInvoicePayment({ paymentId: used, reason: "Salah catat" })).toEqual({
      ok: false,
      error: `Kelebihan pembayaran ini sudah dipakai di ${consumer.number}.`,
    });
    expect((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: used } })).revokedAt).toBeNull();
  });

  it("membatalkan pembayaran lain di tagihan yang kelebihan bayar ditolak sampai pembayaran berlebihnya dibatalkan (temuan review)", async () => {
    const { id } = await finalInvoice(450_000);
    const { id: cash } = await unwrap(pay(id, 200_000, "TUNAI"));
    const { id: over } = await unwrap(pay(id, 300_000));
    actor.role = "ADMIN_KEUANGAN";
    expect(await revokeInvoicePayment({ paymentId: cash, reason: "Salah catat" })).toEqual({
      ok: false,
      error: "Batalkan dulu pembayaran berlebih Rp 300.000 (QRIS); kelebihannya sudah menjadi saldo deposit.",
    });
    expect((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: cash } })).revokedAt).toBeNull();
    await unwrap(revokeInvoicePayment({ paymentId: over, reason: "Salah catat" }));
    await unwrap(revokeInvoicePayment({ paymentId: cash, reason: "Salah catat" }));
    expect(await prisma.depositCredit.count({ where: { sourceInvoiceId: id } })).toBe(0);
    expect(await totalsOf(id)).toMatchObject({ paid: 0, balance: 450_000 });
  });

  it("diskon sesudah final tidak boleh membuat total di bawah dibayar + deposit dipakai (D14)", async () => {
    await prisma.depositCredit.create({
      data: { patientId: world.patientId, amount: 100_000, source: "KELEBIHAN_BAYAR", recordedOn: new Date(`${today}T00:00:00Z`), validUntil: new Date(`${addDaysToDateString(today, 30)}T00:00:00Z`), staffId: "s", staffName: "Uji" },
    });
    const { id } = await finalInvoice(300_000);
    await unwrap(pay(id, 100_000, "TUNAI"));
    actor.role = "ADMIN_KEUANGAN";
    // Dibayar 100.000 + deposit 100.000: total 300.000 boleh turun ke 200.000, tidak ke 150.000.
    expect(await applyFinalDiscount({ invoiceId: id, kind: "NOMINAL", value: 150_000, reason: "Kompensasi", approval: await testApproval() })).toEqual({
      ok: false,
      error: "Diskon membuat total di bawah yang sudah dibayar.",
    });
    await unwrap(applyFinalDiscount({ invoiceId: id, kind: "NOMINAL", value: 100_000, reason: "Kompensasi", approval: await testApproval() }));
    expect(await totalsOf(id)).toMatchObject({ total: 200_000, balance: 0, display: "LUNAS" });
  });
});
