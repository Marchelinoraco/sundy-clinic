// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit, takePackageItem } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordPackageVisitReminder } from "@/server/package-reminder";
import { changeNextVisit } from "@/server/patient-packages";
import { countReminderWork, getReminderWorklist } from "@/server/reminder";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => {
  const actor = { userId: "u", staffId: "s", name: "Rina Pengingat", role: "RESEPSIONIS", email: "u@uji.test" };
  return { requireCapability: vi.fn().mockResolvedValue(actor), requireAnyCapability: vi.fn().mockResolvedValue(actor) };
});

const SLUG = "ingat-paket";
const WA = "6281200009642";
let world: BillingWorld;
let lux: string;
let bookings = 0;
const today = () => witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
const rowFor = async (patientPackageId: string) => (await getReminderWorklist()).packageVisits.find((row) => row.patientPackageId === patientPackageId);

/** Paket Lux yang dibeli lewat penjualan langsung (tanpa booking), dengan rencana di `visitOn`. */
async function bought(visitOn: string) {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: await versionOf(id), packageId: lux }));
  const purchaseLineId = (await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } })).id;
  await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
  return prisma.patientPackage.update({ where: { purchaseLineId }, data: { nextVisitOn: day(visitOn) }, include: { items: { orderBy: { sortOrder: "asc" } } } });
}

async function booking(status: AppointmentStatus, date: string) {
  bookings += 1;
  const startAt = combineWitaDateAndMinutes(date, 10 * 60 + bookings * 30);
  return prisma.appointment.create({
    data: {
      code: `ING-PKT-${bookings}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status,
      source: "WHATSAPP",
      branchId: world.branchId,
      staffId: world.doctorId,
      serviceId: world.consultationId,
      patientId: world.patientId,
    },
  });
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, { invoiceNumber: `${SLUG}-F1`, itemId: world.drugId, quantity: 500 });
  lux = (
    await prisma.treatmentPackage.create({
      data: {
        name: `${SLUG} Lux`,
        price: 2_000_000,
        validDays: 90,
        visitIntervalDays: 7,
        items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }, { itemId: world.drugId, sessions: 14, perVisit: 7, sortOrder: 1 }] },
      },
      select: { id: true },
    })
  ).id;
});
beforeEach(async () => {
  // Booking milik pasien uji dari kasus sebelumnya tidak boleh menyembunyikan pengingat kasus berikutnya.
  await prisma.appointment.updateMany({ where: { patientId: world.patientId, status: { in: ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "HADIR"] } }, data: { status: "SELESAI" } });
  await prisma.patientPackage.updateMany({ where: { patientId: world.patientId }, data: { nextVisitOn: null } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("Sesi paket perlu dibooking (spec jadwal paket JP5, JP6, JP12, JP13)", () => {
  it("muncul pada hari pengingat dengan pesan WhatsApp lengkap; rencana yang masih jauh belum muncul", async () => {
    const tomorrow = addDaysToDateString(today(), 1);
    const pkg = await bought(tomorrow);
    const row = await rowFor(pkg.id);
    expect(row).toMatchObject({ patientName: `Pasien ${SLUG}`, packageName: `${SLUG} Lux`, visitOn: tomorrow, visitNumber: 1, overdue: false, sent: null });
    const isi = `${pkg.items[0].serviceName}, 7 kapsul ${SLUG} Amoxicillin`;
    expect(row!.contents).toBe(isi);
    expect(row!.message.text).toBe(
      `Halo Pasien, ini SunDY Clinic. Sesuai program paket ${SLUG} Lux, jadwal kunjungan ke-1 Anda besok: ${isi}. Balas pesan ini untuk memilih jam ya. Terima kasih.`,
    );
    expect(row!.message.link).toContain(`wa.me/${WA}`);

    await prisma.patientPackage.update({ where: { id: pkg.id }, data: { nextVisitOn: day(addDaysToDateString(today(), 10)) } });
    expect(await rowFor(pkg.id)).toBeUndefined();
  });

  it("pasien yang sudah membooking tidak diingatkan (Review Focus 2); booking yang dibatalkan tidak menghalangi", async () => {
    const tomorrow = addDaysToDateString(today(), 1);
    const pkg = await bought(tomorrow);
    const appointment = await booking("TERKONFIRMASI", tomorrow);
    expect(await rowFor(pkg.id)).toBeUndefined();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "DIBATALKAN" } });
    expect(await rowFor(pkg.id)).toBeDefined();
    await booking("MENUNGGU_KONFIRMASI", addDaysToDateString(today(), 3));
    expect(await rowFor(pkg.id)).toBeUndefined();
  });

  it("paket dibatalkan, kedaluwarsa, atau habis tidak diingatkan", async () => {
    const tomorrow = addDaysToDateString(today(), 1);
    const cancelled = await bought(tomorrow);
    await prisma.patientPackage.update({ where: { id: cancelled.id }, data: { status: "DIBATALKAN" } });
    const expired = await bought(tomorrow);
    await prisma.patientPackage.update({ where: { id: expired.id }, data: { startsOn: day(addDaysToDateString(today(), -30)), expiresOn: day(addDaysToDateString(today(), -1)) } });
    const empty = await bought(tomorrow);
    await prisma.packageSessionEntry.createMany({
      data: empty.items.map((item) => ({ patientPackageItemId: item.id, kind: "BATAL_PAKET" as const, delta: -item.sessions, staffId: "s", staffName: "Rina" })),
    });
    const ids = (await getReminderWorklist()).packageVisits.map((row) => row.patientPackageId);
    expect(ids).not.toContain(cancelled.id);
    expect(ids).not.toContain(expired.id);
    expect(ids).not.toContain(empty.id);
  });

  it("rencana sesudah masa berlaku paket tidak diingatkan; tepat di hari terakhir masih (temuan review I2)", async () => {
    const tomorrow = addDaysToDateString(today(), 1);
    const pkg = await bought(tomorrow);
    await prisma.patientPackage.update({ where: { id: pkg.id }, data: { expiresOn: day(today()) } });
    expect(await rowFor(pkg.id)).toBeUndefined();
    await prisma.patientPackage.update({ where: { id: pkg.id }, data: { expiresOn: day(tomorrow) } });
    expect(await rowFor(pkg.id)).toBeDefined();
  });

  it("rencana yang sudah lewat tetap muncul dengan tanda terlewat", async () => {
    const yesterday = addDaysToDateString(today(), -1);
    const pkg = await bought(yesterday);
    const row = await rowFor(pkg.id);
    expect(row).toMatchObject({ visitOn: yesterday, overdue: true });
    expect(row!.message.text).toContain(`sudah waktunya kunjungan ke-1 Anda (rencana ${formatIndonesianDate(day(yesterday))}):`);
  });

  it("kiriman dicatat per paket dan tanggal: baris pindah ke sudah diingatkan, angka menu turun, tanggal lain ditolak", async () => {
    const tomorrow = addDaysToDateString(today(), 1);
    const pkg = await bought(tomorrow);
    const before = await countReminderWork();
    await unwrap(recordPackageVisitReminder({ patientPackageId: pkg.id, visitOn: tomorrow }));
    await unwrap(recordPackageVisitReminder({ patientPackageId: pkg.id, visitOn: tomorrow }));
    expect((await rowFor(pkg.id))!.sent).toMatchObject({ sentByName: "Rina Pengingat" });
    expect(await countReminderWork()).toBe(before - 1);
    expect(await prisma.packageVisitReminder.count({ where: { patientPackageId: pkg.id } })).toBe(1);
    expect(await recordPackageVisitReminder({ patientPackageId: pkg.id, visitOn: addDaysToDateString(today(), 2) })).toEqual({
      ok: false,
      error: "Rencana kunjungan paket ini sudah berubah. Muat ulang halaman.",
    });
  });

  it("sesudah pasien datang, kiriman lama tidak berlaku untuk tanggal baru (Review Focus 3)", async () => {
    const tomorrow = addDaysToDateString(today(), 1);
    const pkg = await bought(tomorrow);
    await unwrap(recordPackageVisitReminder({ patientPackageId: pkg.id, visitOn: tomorrow }));

    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const treatment = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } });
    await unwrap(applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, patientPackageItemId: pkg.items[0].id }));
    await unwrap(takePackageItem({ invoiceId: id, version: await versionOf(id), patientPackageItemId: pkg.items[1].id, quantity: 7 }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
    await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "SELESAI" } });
    expect(await rowFor(pkg.id)).toBeUndefined();

    await unwrap(changeNextVisit({ packageId: pkg.id, visitOn: today() }));
    expect(await rowFor(pkg.id)).toMatchObject({ visitOn: today(), visitNumber: 2, sent: null, contents: `${pkg.items[0].serviceName}, 7 kapsul ${SLUG} Amoxicillin` });
  });
});
