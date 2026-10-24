// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { at } from "./public-booking-world";

// Aturan basis data catatan deposit (spec deposit bagian 3).
const SLUG = "deposit-skema";
const WA = "6281200009711";
let world: BillingWorld;
let invoiceId: string;
let appointmentId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const startAt = at("2026-10-20", "09:00");
  appointmentId = (
    await prisma.appointment.create({
      data: { code: "DPS-1", type: "KONSULTASI", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status: "HADIR", source: "WHATSAPP", bookingFee: 100_000, branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId: world.patientId },
    })
  ).id;
  invoiceId = (
    await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, appointmentId, createdById: "s", createdByName: "Uji" } })
  ).id;
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("skema deposit", () => {
  it("pemakaian BOOKING wajib menyebut booking dan tidak menyebut kredit", async () => {
    await expect(prisma.depositUse.create({ data: { invoiceId, kind: "BOOKING", amount: 100_000 } })).rejects.toThrow();
    const credit = await prisma.depositCredit.create({
      data: { patientId: world.patientId, amount: 50_000, source: "KELEBIHAN_BAYAR", recordedOn: new Date("2026-10-20T00:00:00Z"), validUntil: new Date("2026-11-19T00:00:00Z"), staffId: "s", staffName: "Uji" },
    });
    await expect(prisma.depositUse.create({ data: { invoiceId, kind: "BOOKING", appointmentId, creditId: credit.id, amount: 100_000 } })).rejects.toThrow();
    await expect(prisma.depositUse.create({ data: { invoiceId, kind: "SALDO", amount: 10_000 } })).rejects.toThrow();
    await prisma.depositUse.create({ data: { invoiceId, kind: "SALDO", creditId: credit.id, amount: 10_000 } });
    await prisma.depositUse.deleteMany({ where: { invoiceId } });
    await prisma.depositCredit.delete({ where: { id: credit.id } });
  });

  it("satu booking hanya sekali menjadi deposit booking; jumlah harus lebih dari 0", async () => {
    await prisma.depositUse.create({ data: { invoiceId, kind: "BOOKING", appointmentId, amount: 100_000 } });
    await expect(prisma.depositUse.create({ data: { invoiceId, kind: "BOOKING", appointmentId, amount: 100_000 } })).rejects.toThrow();
    await prisma.depositUse.deleteMany({ where: { invoiceId } });
    await expect(prisma.depositUse.create({ data: { invoiceId, kind: "BOOKING", appointmentId, amount: 0 } })).rejects.toThrow();
    await expect(
      prisma.depositCredit.create({
        data: { patientId: world.patientId, amount: 0, source: "KELEBIHAN_BAYAR", recordedOn: new Date("2026-10-20T00:00:00Z"), validUntil: new Date("2026-11-19T00:00:00Z"), staffId: "s", staffName: "Uji" },
      }),
    ).rejects.toThrow();
  });
});
