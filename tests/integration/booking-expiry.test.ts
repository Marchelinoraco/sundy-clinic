// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { expireStaleSiteBookings } from "@/server/booking-expiry";
import { countPendingSiteBookings, listAppointments, listPendingSiteBookings } from "@/server/appointment";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "kedaluwarsa-uji";
const HOUR = 60 * 60 * 1000;
// Waktu tetap agar hasil tidak bergantung pada hari saat uji dijalankan.
// Feb 2031: Sabtu 8, Minggu 9, Senin 10, Selasa 11, Rabu 12, Kamis 13. 12.00 WITA = 04.00 UTC.
const WEDNESDAY_NOON = new Date(Date.UTC(2031, 1, 12, 4));
const HOLIDAY_DATE = new Date("2031-02-12T00:00:00Z");

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.auditLog.deleteMany({ where: { action: "appointment.expire" } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-6602" } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.holiday.deleteMany({ where: { date: HOLIDAY_DATE } });
}

describe("kedaluwarsa booking situs", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Kedaluwarsa", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Kedaluwarsa",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-6602", name: "Pasien Kedaluwarsa", whatsapp: "6281200006602" },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  function booking(input: {
    source: BookingSource;
    status: AppointmentStatus;
    ageHours?: number;
    createdAt?: Date;
    withPatient: boolean;
  }) {
    slot += 1;
    return prisma.appointment.create({
      data: {
        code: `KDL-${slot}`,
        type: "KONSULTASI",
        startAt: new Date(Date.UTC(2031, 1, 3, slot)),
        endAt: new Date(Date.UTC(2031, 1, 3, slot, 30)),
        source: input.source,
        status: input.status,
        branchId,
        staffId,
        patientId: input.withPatient ? patientId : null,
        createdAt: input.createdAt ?? new Date(WEDNESDAY_NOON.getTime() - (input.ageHours ?? 0) * HOUR),
      },
    });
  }

  it("menandai booking situs yang tidak dikonfirmasi 24 jam sebagai kedaluwarsa", async () => {
    const stale = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", ageHours: 25, withPatient: false });

    expect(await expireStaleSiteBookings(WEDNESDAY_NOON)).toBe(1);

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: stale.id } });
    expect(after.status).toBe("KEDALUWARSA");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: stale.id } });
    expect(audit).toMatchObject({ action: "appointment.expire", actorName: "Sistem", actorRole: "SISTEM" });
  });

  it("membiarkan booking situs yang belum 24 jam", async () => {
    const fresh = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", ageHours: 23, withPatient: false });

    expect(await expireStaleSiteBookings(WEDNESDAY_NOON)).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe(
      "MENUNGGU_KONFIRMASI",
    );
  });

  it("tidak pernah menyentuh booking yang dicatat admin (K13)", async () => {
    const adminBooking = await booking({ source: "WHATSAPP", status: "MENUNGGU_KONFIRMASI", ageHours: 72, withPatient: true });

    await expireStaleSiteBookings(WEDNESDAY_NOON);

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: adminBooking.id } })).status).toBe(
      "MENUNGGU_KONFIRMASI",
    );
  });

  it("tidak menyentuh booking situs yang sudah diverifikasi", async () => {
    const verified = await booking({ source: "SITUS", status: "TERKONFIRMASI", ageHours: 72, withPatient: true });

    await expireStaleSiteBookings(WEDNESDAY_NOON);

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: verified.id } })).status).toBe(
      "TERKONFIRMASI",
    );
  });

  it("dijalankan saat admin membuka daftar booking", async () => {
    // Memakai jam sungguhan: dua pekan cukup jauh melewati hari Minggu dan libur mana pun.
    const stale = await booking({
      source: "SITUS",
      status: "MENUNGGU_KONFIRMASI",
      createdAt: new Date(Date.now() - 14 * 24 * HOUR),
      withPatient: false,
    });

    await listAppointments({ date: "2031-02-03" });

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("KEDALUWARSA");
  });

  it("tidak menghitung jam pada hari Minggu", async () => {
    const mondayNoon = new Date(Date.UTC(2031, 1, 10, 4));
    // Sabtu 13.00 WITA: 11 jam Sabtu + 12 jam Senin = 23 jam kerja.
    const waiting = await booking({
      source: "SITUS",
      status: "MENUNGGU_KONFIRMASI",
      createdAt: new Date(Date.UTC(2031, 1, 8, 5)),
      withPatient: false,
    });
    // Sabtu 11.00 WITA: 13 jam Sabtu + 12 jam Senin = 25 jam kerja.
    const stale = await booking({
      source: "SITUS",
      status: "MENUNGGU_KONFIRMASI",
      createdAt: new Date(Date.UTC(2031, 1, 8, 3)),
      withPatient: false,
    });

    expect(await expireStaleSiteBookings(mondayNoon)).toBe(1);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe("MENUNGGU_KONFIRMASI");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("KEDALUWARSA");
  });

  it("tidak menghitung jam pada tanggal libur", async () => {
    await prisma.holiday.create({ data: { date: HOLIDAY_DATE, name: "Libur Uji", kind: "LIBUR_KLINIK" } });
    const thursdayNoon = new Date(Date.UTC(2031, 1, 13, 4));
    // Selasa 13.00 WITA: 11 jam Selasa + 12 jam Kamis = 23 jam kerja (Rabu libur).
    const waiting = await booking({
      source: "SITUS",
      status: "MENUNGGU_KONFIRMASI",
      createdAt: new Date(Date.UTC(2031, 1, 11, 5)),
      withPatient: false,
    });

    expect(await expireStaleSiteBookings(thursdayNoon)).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe("MENUNGGU_KONFIRMASI");
  });

  it("mendaftar booking situs yang menunggu dari tanggal mana pun, tertua dulu, beserta batas kedaluwarsanya", async () => {
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);
    const older = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", createdAt: hoursAgo(2), withPatient: false });
    const newer = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", createdAt: hoursAgo(1), withPatient: false });
    await booking({ source: "WHATSAPP", status: "MENUNGGU_KONFIRMASI", createdAt: hoursAgo(1), withPatient: true });
    await booking({ source: "SITUS", status: "TERKONFIRMASI", createdAt: hoursAgo(1), withPatient: true });
    // Sudah lewat batas tetapi belum ditandai: tidak dihitung, lalu ditandai kedaluwarsa saat daftar dibuka.
    const stale = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", createdAt: hoursAgo(14 * 24), withPatient: false });

    const count = await countPendingSiteBookings();
    const pending = await listPendingSiteBookings();

    expect(pending.filter((row) => row.staffId === staffId).map((row) => row.id)).toEqual([older.id, newer.id]);
    expect(count).toBe(pending.length);
    for (const row of pending) {
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThanOrEqual(24 * HOUR);
    }
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("KEDALUWARSA");
  });
});
