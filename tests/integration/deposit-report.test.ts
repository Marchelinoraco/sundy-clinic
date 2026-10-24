// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { summarizeReport } from "@/lib/report";
import { collectReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

// Deposit di laporan untung-rugi (rencana deposit, Global Constraints "Laporan"; spec deposit D11, D17).
const SLUG = "deposit-lapor";
const WA = "6281200009755";
const MAY = { from: "2036-05-01", to: "2036-05-31" };
const at = (date: string, time = "12:00") => new Date(`${date}T${time}:00+08:00`);
const day = (date: string) => new Date(`${date}T00:00:00Z`);
let world: BillingWorld;
let seq = 0;

async function finalInvoice(total: number, appointmentId: string | null = null) {
  seq += 1;
  return prisma.invoice.create({
    data: {
      patientId: world.patientId, branchId: world.branchId, appointmentId, status: "FINAL", number: `TG-2036-D${seq}`, finalizedAt: at("2036-05-10"),
      createdById: "s", createdByName: "Uji",
      lines: { create: [{ kind: "LAYANAN", name: "Layanan Lapor", quantity: 1, unitPrice: total, sortOrder: 0 }] },
    },
  });
}
const credit = (amount: number, source: "KELEBIHAN_BAYAR" | "SISA_DEPOSIT_BOOKING", sourceInvoiceId: string) =>
  prisma.depositCredit.create({
    data: { patientId: world.patientId, amount, source, sourceInvoiceId, recordedOn: day("2036-05-10"), validUntil: day("2036-06-09"), staffId: "s", staffName: "Uji" },
  });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("deposit di laporan", () => {
  it("biaya booking tidak terhitung dua kali; sisa deposit booking yang dipakai atau dikembalikan juga tidak; pengembalian = uang keluar", async () => {
    // Booking Rp100.000 diverifikasi 5 Mei: pendapatan di muka.
    const startAt = at("2036-05-10", "09:00");
    const appointment = await prisma.appointment.create({
      data: {
        code: "DPL-1", type: "KONSULTASI", channel: "KLINIK", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status: "HADIR", source: "WHATSAPP",
        bookingFee: 100_000, branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId: world.patientId,
      },
    });
    await prisma.auditLog.create({
      data: { actorStaffId: "s", actorName: "Uji", actorRole: "RESEPSIONIS", action: "appointment.verify", entity: "Appointment", entityId: appointment.id, createdAt: at("2036-05-05") },
    });
    // Tagihan kunjungan Rp60.000: deposit booking 60.000, sisa 40.000 menjadi saldo.
    const visit = await finalInvoice(60_000, appointment.id);
    await prisma.depositUse.create({ data: { invoiceId: visit.id, kind: "BOOKING", appointmentId: appointment.id, amount: 60_000 } });
    const leftover = await credit(40_000, "SISA_DEPOSIT_BOOKING", visit.id);
    // Tagihan berikut Rp300.000: saldo sisa booking 30.000 dipakai, dibayar QRIS 470.000 (kelebihan 200.000).
    const next = await finalInvoice(300_000);
    await prisma.depositUse.create({ data: { invoiceId: next.id, kind: "SALDO", creditId: leftover.id, amount: 30_000 } });
    await prisma.invoicePayment.create({ data: { invoiceId: next.id, amount: 470_000, method: "QRIS", paidAt: day("2036-05-10"), staffId: "s", staffName: "Uji" } });
    const overpaid = await credit(200_000, "KELEBIHAN_BAYAR", next.id);
    // 12 Mei: dikembalikan Rp210.000 tunai = 10.000 sisa booking + 200.000 kelebihan bayar.
    await prisma.depositRefund.create({
      data: {
        patientId: world.patientId, amount: 210_000, method: "TUNAI", reason: "Pindah kota", refundedOn: day("2036-05-12"), staffId: "s", staffName: "Uji",
        approvedById: "a", approvedByName: "Penyetuju", parts: { create: [{ creditId: leftover.id, amount: 10_000 }, { creditId: overpaid.id, amount: 200_000 }] },
      },
    });

    const raw = await collectReport(MAY, world.branchId);
    expect(raw).toMatchObject({ upfrontFee: 100_000, bookingDepositUsed: 100_000, depositRefunds: 210_000, customerPaid: 470_000, outstanding: 0 });
    const view = summarizeReport(raw);
    // Layanan 360.000 − deposit booking 100.000 + biaya booking 100.000.
    expect(view.totals.revenue).toBe(360_000);
    expect(view.cash).toMatchObject({ inflow: 570_000, depositRefunds: 210_000, outflow: 210_000, net: 360_000 });
    expect(await collectReport(MAY, "cabang-lain")).toMatchObject({ bookingDepositUsed: 0, depositRefunds: 0 });
  });
});
