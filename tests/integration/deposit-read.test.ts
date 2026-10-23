// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getPatientDeposit, listDepositBalances, listDepositHistory } from "@/server/deposit-read";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { at } from "./public-booking-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s-baca", name: "Resepsionis Baca", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

// Menu Deposit dan saldo di halaman pasien (spec deposit D10, D18).
const SLUG = "deposit-baca";
const WA = "6281200009766";
const WA_OTHER = "6281200009767";
const today = witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
let world: BillingWorld;
let otherId: string;
let slot = 0;

const credit = (patientId: string, amount: number, validUntil: string, staffName = "Uji") =>
  prisma.depositCredit.create({
    data: { patientId, amount, source: "KELEBIHAN_BAYAR", recordedOn: day(addDaysToDateString(validUntil, -30)), validUntil: day(validUntil), staffId: "s", staffName },
  });

async function verifiedBooking(fee: number, status: "HADIR" | "DIBATALKAN") {
  slot += 1;
  const startAt = at(today, `${String(6 + slot).padStart(2, "0")}:00`);
  const appointment = await prisma.appointment.create({
    data: {
      code: `DPB-${slot}`, type: "KONSULTASI", channel: "KLINIK", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status, source: "WHATSAPP",
      bookingFee: fee, branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId: world.patientId,
    },
  });
  await prisma.auditLog.create({ data: { actorStaffId: "s", actorName: "Kasir Verifikasi", actorRole: "RESEPSIONIS", action: "appointment.verify", entity: "Appointment", entityId: appointment.id } });
  return appointment.id;
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, WA_OTHER]);
  world = await createBillingWorld(SLUG, WA);
  otherId = (await prisma.patient.create({ data: { medicalRecordNumber: `SDY-2026-B${Math.floor(Math.random() * 9000 + 1000)}`, name: `Pasien ${SLUG} lain`, whatsapp: WA_OTHER } })).id;
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await prisma.depositRefund.deleteMany({ where: { patientId: { in: [world.patientId, otherId] } } });
  await prisma.depositUse.deleteMany({ where: { invoice: { patientId: world.patientId } } });
  await prisma.depositCredit.deleteMany({ where: { patientId: { in: [world.patientId, otherId] } } });
});
afterAll(async () => {
  await prisma.depositCredit.deleteMany({ where: { patientId: otherId } });
  await cleanupBillingWorld(SLUG, [WA, WA_OTHER]);
  await prisma.$disconnect();
});

describe("baca deposit", () => {
  it("Aktif: hanya pasien dengan saldo berlaku, dengan total dan kedaluwarsa terdekat (D10, D18)", async () => {
    await credit(world.patientId, 200_000, addDaysToDateString(today, 10));
    await credit(world.patientId, 100_000, addDaysToDateString(today, 5));
    await credit(world.patientId, 50_000, addDaysToDateString(today, -1));
    await credit(otherId, 70_000, addDaysToDateString(today, -2));

    const rows = await listDepositBalances();
    expect(rows.find((row) => row.patientId === world.patientId)).toEqual({
      patientId: world.patientId,
      patientName: `Pasien ${SLUG}`,
      medicalRecordNumber: expect.any(String),
      balance: 300_000,
      nearestValidUntil: addDaysToDateString(today, 5),
    });
    expect(rows.some((row) => row.patientId === otherId)).toBe(false);

    expect(await getPatientDeposit(world.patientId)).toEqual({
      balance: 300_000,
      nearestValidUntil: addDaysToDateString(today, 5),
      credits: [
        { remaining: 100_000, validUntil: addDaysToDateString(today, 5) },
        { remaining: 200_000, validUntil: addDaysToDateString(today, 10) },
      ],
    });
    expect(await getPatientDeposit(otherId)).toBeNull();
  });

  it("Riwayat: masuk, dipakai, dikembalikan, dan hangus dengan tanggal, tagihan, staf, dan penyetuju (D18)", async () => {
    const visit = await verifiedBooking(100_000, "HADIR");
    await verifiedBooking(50_000, "DIBATALKAN");
    const saved = await credit(world.patientId, 80_000, addDaysToDateString(today, 30), "Kasir Lebih");
    await credit(world.patientId, 25_000, addDaysToDateString(today, -1));
    const invoice = await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, appointmentId: visit, createdById: "s", createdByName: "Uji" } });
    await prisma.invoiceLine.create({ data: { invoiceId: invoice.id, kind: "LAYANAN", name: "Layanan Baca", quantity: 1, unitPrice: 150_000, sortOrder: 0 } });
    const { number } = await unwrap(finalizeInvoice({ invoiceId: invoice.id, version: invoice.version }));
    await prisma.depositRefund.create({
      data: {
        patientId: world.patientId, amount: 30_000, method: "TUNAI", reason: "Pindah kota", refundedOn: day(today), staffId: "s", staffName: "Kasir Kembali",
        approvedById: "a", approvedByName: "Penyetuju Uji", parts: { create: [{ creditId: saved.id, amount: 30_000 }] },
      },
    });

    const history = await listDepositHistory({});
    expect(history).toMatchObject({ from: addDaysToDateString(today, -89), to: today, olderBefore: addDaysToDateString(today, -89) });
    const mine = history.rows.filter((row) => row.patientId === world.patientId);
    expect(mine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "MASUK", label: "Deposit booking", amount: 100_000, date: today, staffName: "Kasir Verifikasi" }),
        expect.objectContaining({ kind: "MASUK", label: "Kelebihan bayar", amount: 80_000, staffName: "Kasir Lebih" }),
        expect.objectContaining({ kind: "DIPAKAI", label: "Deposit booking", amount: 100_000, date: today, invoiceId: invoice.id, invoiceNumber: number, staffName: "Resepsionis Baca" }),
        expect.objectContaining({ kind: "DIPAKAI", label: "Saldo deposit", amount: 50_000, invoiceNumber: number }),
        expect.objectContaining({ kind: "DIKEMBALIKAN", label: "Tunai", amount: 30_000, date: today, staffName: "Kasir Kembali", approvedByName: "Penyetuju Uji", note: "Pindah kota" }),
        expect.objectContaining({ kind: "HANGUS", label: "Kelebihan bayar", amount: 25_000, date: today }),
        expect.objectContaining({ kind: "HANGUS", label: "Deposit booking", amount: 50_000, date: today }),
      ]),
    );
    expect(mine.map((row) => row.date)).toEqual([...mine.map((row) => row.date)].sort().reverse());
    const older = await listDepositHistory({ before: history.from });
    expect(older).toMatchObject({ to: addDaysToDateString(today, -90), from: addDaysToDateString(today, -179) });
    expect(older.rows.filter((row) => row.patientId === world.patientId)).toEqual([]);
  });

  it("Apoteker tidak bisa membaca deposit", async () => {
    actor.role = "APOTEKER";
    await expect(listDepositBalances()).rejects.toThrow(/forbidden/);
    await expect(listDepositHistory({})).rejects.toThrow(/forbidden/);
  });
});
