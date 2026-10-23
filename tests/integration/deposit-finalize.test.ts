// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { invoiceTotals } from "@/lib/invoice";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { TOTALS_SELECT } from "@/server/invoice-store";
import { testApproval } from "./approver";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { at } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s-deposit", name: "Resepsionis Deposit", role: "RESEPSIONIS" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

// Potongan deposit booking dan saldo pasien saat finalisasi, dan pelepasannya saat pembatalan (spec deposit D1–D8, D12).
const SLUG = "deposit-final";
const WA = "6281200009722";
const today = witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
let world: BillingWorld;
let slot = 0;

async function booking(opts: { fee: number | null; verified: boolean; channel?: "KLINIK" | "ONLINE" }) {
  slot += 1;
  const startAt = at(today, `${String(6 + slot).padStart(2, "0")}:00`);
  const appointment = await prisma.appointment.create({
    data: {
      code: `DPF-${slot}`,
      type: "KONSULTASI",
      channel: opts.channel ?? "KLINIK",
      servicePrice: opts.channel === "ONLINE" ? 250_000 : null,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: opts.fee === null ? "WALK_IN" : "WHATSAPP",
      bookingFee: opts.fee,
      branchId: world.branchId,
      staffId: world.doctorId,
      serviceId: world.consultationId,
      patientId: world.patientId,
    },
  });
  if (opts.verified) {
    await prisma.auditLog.create({ data: { actorStaffId: "s", actorName: "Uji", actorRole: "RESEPSIONIS", action: "appointment.verify", entity: "Appointment", entityId: appointment.id } });
  }
  return appointment.id;
}

/** Draf berisi satu layanan bebas seharga `total`, untuk booking `appointmentId` atau penjualan langsung. */
async function draft(total: number, appointmentId: string | null = null) {
  const invoice = await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, appointmentId, createdById: "s", createdByName: "Uji" } });
  await prisma.invoiceLine.create({ data: { invoiceId: invoice.id, kind: "LAYANAN", name: "Layanan Deposit", quantity: 1, unitPrice: total, sortOrder: 0 } });
  return invoice.id;
}

const finalize = async (id: string) => unwrap(finalizeInvoice({ invoiceId: id, version: (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version }));
const totalsOf = async (id: string) => invoiceTotals(await prisma.invoice.findUniqueOrThrow({ where: { id }, select: TOTALS_SELECT }));
const credit = (amount: number, validUntil: string) =>
  prisma.depositCredit.create({ data: { patientId: world.patientId, amount, source: "KELEBIHAN_BAYAR", recordedOn: day(addDaysToDateString(validUntil, -30)), validUntil: day(validUntil), staffId: "s", staffName: "Uji" } });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(async () => {
  await prisma.depositUse.deleteMany({ where: { invoice: { patientId: world.patientId } } });
  await prisma.depositRefundPart.deleteMany({ where: { credit: { patientId: world.patientId } } });
  await prisma.depositCredit.deleteMany({ where: { patientId: world.patientId } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("deposit saat finalisasi", () => {
  it("booking terverifikasi Rp100.000: tagihan Rp300.000 dipotong deposit booking, sisa 200.000, status Deposit (D1)", async () => {
    const id = await draft(300_000, await booking({ fee: 100_000, verified: true }));
    await finalize(id);
    expect(await prisma.depositUse.findMany({ where: { invoiceId: id }, select: { kind: true, amount: true } })).toEqual([{ kind: "BOOKING", amount: 100_000 }]);
    expect(await totalsOf(id)).toMatchObject({ total: 300_000, deposit: 100_000, balance: 200_000, display: "SEBAGIAN" });
  });

  it("booking belum diverifikasi atau walk-in: tanpa potongan (D3)", async () => {
    const unverified = await draft(300_000, await booking({ fee: 100_000, verified: false }));
    const walkIn = await draft(300_000, await booking({ fee: null, verified: false }));
    await finalize(unverified);
    await finalize(walkIn);
    expect(await prisma.depositUse.count({ where: { invoiceId: { in: [unverified, walkIn] } } })).toBe(0);
    expect((await totalsOf(unverified)).display).toBe("BELUM_DIBAYAR");
  });

  it("tagihan Rp60.000 dengan deposit booking Rp100.000: Lunas, sisa Rp40.000 menjadi saldo berlaku 30 hari (D4)", async () => {
    const id = await draft(60_000, await booking({ fee: 100_000, verified: true }));
    await finalize(id);
    expect(await totalsOf(id)).toMatchObject({ deposit: 60_000, balance: 0, display: "LUNAS" });
    const rest = await prisma.depositCredit.findFirstOrThrow({ where: { sourceInvoiceId: id } });
    expect(rest).toMatchObject({ amount: 40_000, source: "SISA_DEPOSIT_BOOKING" });
    expect(rest.recordedOn.toISOString().slice(0, 10)).toBe(today);
    expect(rest.validUntil.toISOString().slice(0, 10)).toBe(addDaysToDateString(today, 30));
  });

  it("saldo dipotong otomatis, kedaluwarsa paling dulu lebih dulu; berlaku s.d. hari ini dipakai, s.d. kemarin tidak (D6, D7, Review Focus 3)", async () => {
    const later = await credit(50_000, addDaysToDateString(today, 20));
    const soon = await credit(30_000, today);
    await credit(70_000, addDaysToDateString(today, -1));
    const id = await draft(60_000);
    await finalize(id);
    const uses = await prisma.depositUse.findMany({ where: { invoiceId: id }, orderBy: { amount: "desc" }, select: { kind: true, creditId: true, amount: true } });
    expect(uses).toEqual([
      { kind: "SALDO", creditId: soon.id, amount: 30_000 },
      { kind: "SALDO", creditId: later.id, amount: 30_000 },
    ]);
    expect(await totalsOf(id)).toMatchObject({ deposit: 60_000, display: "LUNAS" });
  });

  it("booking ONLINE: biaya booking menjadi deposit untuk tagihan kunjungan online (D3b)", async () => {
    const id = await draft(80_000, await booking({ fee: 100_000, verified: true, channel: "ONLINE" }));
    await finalize(id);
    expect(await totalsOf(id)).toMatchObject({ deposit: 80_000, display: "LUNAS" });
    expect((await prisma.depositCredit.findFirstOrThrow({ where: { sourceInvoiceId: id } })).amount).toBe(20_000);
  });

  it("dua tagihan pasien yang sama difinalkan bersamaan berbagi satu kredit: terpakai sekali (Review Focus 1)", async () => {
    const shared = await credit(100_000, addDaysToDateString(today, 10));
    const [first, second] = [await draft(100_000), await draft(100_000)];
    await Promise.all([finalize(first), finalize(second)]);
    const uses = await prisma.depositUse.findMany({ where: { creditId: shared.id } });
    expect(uses.reduce((sum, use) => sum + use.amount, 0)).toBe(100_000);
    expect(uses).toHaveLength(1);
  });
});

describe("deposit saat pembatalan", () => {
  it("batalkan lalu buat ulang tagihan kunjungan: deposit booking dipakai lagi, tidak ganda; sisa deposit booking lama dihapus (D12, Review Focus 2)", async () => {
    const appointmentId = await booking({ fee: 100_000, verified: true });
    const first = await draft(60_000, appointmentId);
    await finalize(first);
    await unwrap(cancelInvoice({ invoiceId: first, reason: "Salah input", approval: await testApproval() }));
    expect(await prisma.depositUse.count({ where: { invoiceId: first } })).toBe(0);
    expect(await prisma.depositCredit.count({ where: { sourceInvoiceId: first } })).toBe(0);

    const second = await draft(300_000, appointmentId);
    await finalize(second);
    expect(await prisma.depositUse.findMany({ where: { appointmentId }, select: { invoiceId: true, amount: true } })).toEqual([{ invoiceId: second, amount: 100_000 }]);
  });

  it("batalkan tagihan yang sisa deposit bookingnya sudah dipakai tagihan lain: ditolak dengan nomornya (D12)", async () => {
    const source = await draft(60_000, await booking({ fee: 100_000, verified: true }));
    await finalize(source);
    const user = await draft(40_000);
    const { number } = await finalize(user);
    expect(await cancelInvoice({ invoiceId: source, reason: "Salah input", approval: await testApproval() })).toEqual({
      ok: false,
      error: `Deposit dari tagihan ini sudah dipakai di ${number}. Batalkan tagihan itu dulu.`,
    });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: source } })).status).toBe("FINAL");
  });

  it("membatalkan tagihan pemakai saldo mengembalikan saldo dengan tanggal berlaku aslinya", async () => {
    const saved = await credit(50_000, addDaysToDateString(today, 5));
    const id = await draft(50_000);
    await finalize(id);
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Salah input", approval: await testApproval() }));
    expect(await prisma.depositUse.count({ where: { creditId: saved.id } })).toBe(0);
    expect((await prisma.depositCredit.findUniqueOrThrow({ where: { id: saved.id } })).validUntil.toISOString().slice(0, 10)).toBe(addDaysToDateString(today, 5));
  });
});
