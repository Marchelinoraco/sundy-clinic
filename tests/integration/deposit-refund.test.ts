// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { APPROVAL_REQUIRED } from "@/lib/approval";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { activeCredits } from "@/server/deposit-store";
import { refundDeposit } from "@/server/deposit-actions";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment, revokeInvoicePayment } from "@/server/invoice-payments";
import { TEST_APPROVER_NAME, testApproval } from "./approver";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { at } from "./public-booking-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s-kembali", name: "Kasir Kembali", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  const check = (capabilities: Parameters<typeof can>[1][]) => {
    if (!capabilities.some((capability) => can(actor.role, capability))) throw new Error(`forbidden: ${capabilities.join("|")}`);
    return actor;
  };
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => check([capability])),
    requireAnyCapability: vi.fn(async (...capabilities: Parameters<typeof can>[1][]) => check(capabilities)),
  };
});

// Pengembalian saldo deposit dalam bentuk uang (spec deposit D12, D15, D16).
const SLUG = "deposit-kembali";
const WA = "6281200009744";
const today = witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
let world: BillingWorld;

const credit = (amount: number, validUntil: string) =>
  prisma.depositCredit.create({
    data: { patientId: world.patientId, amount, source: "KELEBIHAN_BAYAR", recordedOn: day(addDaysToDateString(validUntil, -30)), validUntil: day(validUntil), staffId: "s", staffName: "Uji" },
  });
const refund = async (amount: number, withPin = true) =>
  refundDeposit({ patientId: world.patientId, amount, method: "TUNAI", reason: "Pasien pindah kota", ...(withPin ? { approval: await testApproval() } : {}) });
const saldo = async () => (await activeCredits(prisma, world.patientId, today)).reduce((sum, row) => sum + row.remaining, 0);

async function finalInvoice(total: number, appointmentId: string | null = null) {
  const invoice = await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, appointmentId, createdById: "s", createdByName: "Uji" } });
  await prisma.invoiceLine.create({ data: { invoiceId: invoice.id, kind: "LAYANAN", name: "Layanan Kembali", quantity: 1, unitPrice: total, sortOrder: 0 } });
  await unwrap(finalizeInvoice({ invoiceId: invoice.id, version: invoice.version }));
  return invoice.id;
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await prisma.depositRefund.deleteMany({ where: { patientId: world.patientId } });
  await prisma.depositUse.deleteMany({ where: { invoice: { patientId: world.patientId } } });
  await prisma.depositCredit.deleteMany({ where: { patientId: world.patientId } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("pengembalian deposit", () => {
  it("pengembalian Rp250.000 dari saldo Rp300.000 dengan PIN: memotong kredit yang kedaluwarsa paling dulu, sisa Rp50.000 (D15, D16)", async () => {
    const later = await credit(200_000, addDaysToDateString(today, 10));
    const sooner = await credit(100_000, addDaysToDateString(today, 5));
    await unwrap(refund(250_000));

    const row = await prisma.depositRefund.findFirstOrThrow({ where: { patientId: world.patientId }, include: { parts: true } });
    expect(row).toMatchObject({ amount: 250_000, method: "TUNAI", reason: "Pasien pindah kota", staffName: "Kasir Kembali", approvedByName: TEST_APPROVER_NAME });
    expect(row.refundedOn.toISOString().slice(0, 10)).toBe(today);
    expect(row.parts.map((part) => [part.creditId, part.amount]).sort()).toEqual([[later.id, 150_000], [sooner.id, 100_000]].sort());
    expect(await saldo()).toBe(50_000);
    expect(await prisma.auditLog.count({ where: { action: "deposit.refund", entityId: row.id } })).toBe(1);
  });

  it("tanpa PIN APPROVAL_REQUIRED; di bawah Rp200.000 atau melebihi saldo berlaku ditolak; saldo kedaluwarsa tidak dihitung (Review Focus 5)", async () => {
    await credit(500_000, addDaysToDateString(today, -1));
    await credit(250_000, today);
    expect(await refund(200_000, false)).toEqual({ ok: false, error: APPROVAL_REQUIRED });
    expect(await refund(199_999)).toEqual({ ok: false, error: "Pengembalian minimal Rp 200.000." });
    expect(await refund(300_000)).toEqual({ ok: false, error: "Pengembalian melebihi saldo deposit (Rp 250.000)." });
    expect(await prisma.depositRefund.count({ where: { patientId: world.patientId } })).toBe(0);
    await unwrap(refund(250_000));
    expect(await saldo()).toBe(0);
  });

  it("Admin Keuangan boleh dengan PIN-nya; Apoteker tidak boleh mengembalikan deposit", async () => {
    await credit(400_000, today);
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(refund(200_000));
    actor.role = "APOTEKER";
    await expect(refund(200_000)).rejects.toThrow(/forbidden/);
    expect(await saldo()).toBe(200_000);
  });

  it("membatalkan tagihan yang saldonya sudah dikembalikan ditolak (D12)", async () => {
    // Sisa deposit booking Rp250.000 (biaya 300.000, tagihan 50.000) lalu dikembalikan Rp200.000.
    const startAt = at(today, "06:30");
    const appointment = await prisma.appointment.create({
      data: {
        code: "DPK-1", type: "KONSULTASI", channel: "KLINIK", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status: "HADIR", source: "WHATSAPP",
        bookingFee: 300_000, branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId: world.patientId,
      },
    });
    await prisma.auditLog.create({ data: { actorStaffId: "s", actorName: "Uji", actorRole: "RESEPSIONIS", action: "appointment.verify", entity: "Appointment", entityId: appointment.id } });
    const visit = await finalInvoice(50_000, appointment.id);
    await unwrap(refund(200_000));
    expect(await cancelInvoice({ invoiceId: visit, reason: "Salah input", approval: await testApproval() })).toEqual({ ok: false, error: "Deposit dari tagihan ini sudah dikembalikan ke pasien." });

    // Kelebihan bayar QRIS Rp250.000 yang sudah dikembalikan: pembayarannya tidak bisa dibatalkan.
    const paid = await finalInvoice(100_000);
    const { id: paymentId } = await unwrap(recordInvoicePayment({ invoiceId: paid, amount: 350_000, method: "QRIS", paidAt: today, reference: "" }));
    await unwrap(refund(250_000));
    actor.role = "ADMIN_KEUANGAN";
    expect(await revokeInvoicePayment({ paymentId, reason: "Salah catat" })).toEqual({ ok: false, error: "Kelebihan pembayaran ini sudah dikembalikan ke pasien." });
  });
});
