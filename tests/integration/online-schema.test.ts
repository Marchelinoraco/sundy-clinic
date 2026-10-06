// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isExclusionViolation } from "@/server/db-errors";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

const SLUG = "skema-online-uji";
const WA = "6281200007700";

describe("skema konsultasi online: kanal, rentang waktu luang, penjaga slot", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let n = 0;

  function booking(overrides: Record<string, unknown> = {}) {
    n += 1;
    return prisma.appointment.create({
      data: {
        code: `SOL-${n}`,
        type: "KONSULTASI",
        startAt: at(date, "10:00"),
        endAt: at(date, "10:30"),
        status: "TERKONFIRMASI",
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
        ...overrides,
      },
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7700", name: "Pasien Skema Online", whatsapp: WA } })).id;
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("booking tanpa kanal tetap kanal klinik", async () => {
    const row = await booking();
    expect(row).toMatchObject({ channel: "KLINIK", servicePrice: null });
  });

  it("booking online wajib berjenis konsultasi dan membawa harga layanan; booking klinik tidak boleh", async () => {
    await expect(booking({ channel: "ONLINE" })).rejects.toThrow(/appointment_online_consultation/);
    await expect(booking({ channel: "ONLINE", servicePrice: 250000, type: "TREATMENT" })).rejects.toThrow(
      /appointment_online_consultation/,
    );
    await expect(booking({ servicePrice: 250000 })).rejects.toThrow(/appointment_online_consultation/);
    expect(await booking({ channel: "ONLINE", servicePrice: 250000 })).toMatchObject({ channel: "ONLINE", servicePrice: 250000 });
  });

  it("booking online tidak ikut penjaga anti-bentrok, booking klinik tetap saling bentrok", async () => {
    await booking({ channel: "ONLINE", servicePrice: 250000 });
    await booking({ channel: "ONLINE", servicePrice: 250000 });
    const klinik = await booking();
    expect(klinik.channel).toBe("KLINIK");

    const clash = await booking().catch((error: unknown) => error);
    expect(isExclusionViolation(clash)).toBe(true);
  });

  it("rentang waktu luang: akhir harus setelah awal, dan ikut terhapus bersama booking", async () => {
    const online = await booking({ channel: "ONLINE", servicePrice: 250000 });
    await expect(
      prisma.contactWindow.create({ data: { appointmentId: online.id, startAt: at(date, "19:00"), endAt: at(date, "19:00") } }),
    ).rejects.toThrow(/contact_window_range/);

    await prisma.contactWindow.create({ data: { appointmentId: online.id, startAt: at(date, "19:00"), endAt: at(date, "21:00") } });
    await prisma.contactAttempt.create({ data: { appointmentId: online.id, at: at(date, "19:40"), staffId: world.doctorId, staffName: "dr. Uji" } });

    await prisma.appointment.delete({ where: { id: online.id } });
    expect(await prisma.contactWindow.count({ where: { appointmentId: online.id } })).toBe(0);
    expect(await prisma.contactAttempt.count({ where: { appointmentId: online.id } })).toBe(0);
  });
});
