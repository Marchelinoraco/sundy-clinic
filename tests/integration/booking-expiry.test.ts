// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { expireStaleSiteBookings } from "@/server/booking-expiry";
import { listAppointments } from "@/server/appointment";

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

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.auditLog.deleteMany({ where: { action: "appointment.expire" } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-6602" } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
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
    ageHours: number;
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
        createdAt: new Date(Date.now() - input.ageHours * HOUR),
      },
    });
  }

  it("menandai booking situs yang tidak dikonfirmasi 24 jam sebagai kedaluwarsa", async () => {
    const stale = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", ageHours: 25, withPatient: false });

    expect(await expireStaleSiteBookings()).toBe(1);

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: stale.id } });
    expect(after.status).toBe("KEDALUWARSA");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: stale.id } });
    expect(audit).toMatchObject({ action: "appointment.expire", actorName: "Sistem", actorRole: "SISTEM" });
  });

  it("membiarkan booking situs yang belum 24 jam", async () => {
    const fresh = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", ageHours: 23, withPatient: false });

    expect(await expireStaleSiteBookings()).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe(
      "MENUNGGU_KONFIRMASI",
    );
  });

  it("tidak pernah menyentuh booking yang dicatat admin (K13)", async () => {
    const adminBooking = await booking({ source: "WHATSAPP", status: "MENUNGGU_KONFIRMASI", ageHours: 72, withPatient: true });

    await expireStaleSiteBookings();

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: adminBooking.id } })).status).toBe(
      "MENUNGGU_KONFIRMASI",
    );
  });

  it("tidak menyentuh booking situs yang sudah diverifikasi", async () => {
    const verified = await booking({ source: "SITUS", status: "TERKONFIRMASI", ageHours: 72, withPatient: true });

    await expireStaleSiteBookings();

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: verified.id } })).status).toBe(
      "TERKONFIRMASI",
    );
  });

  it("dijalankan saat admin membuka daftar booking", async () => {
    const stale = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", ageHours: 30, withPatient: false });

    await listAppointments({ date: "2031-02-03" });

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("KEDALUWARSA");
  });
});
