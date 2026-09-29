// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, IntakeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysToDateString } from "@/lib/time";
import { listAppointments } from "@/server/appointment";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "filter-isian-uji";
const PATIENT_WA = "6281200006630";

describe("filter isian belum diperiksa", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let slot = 0;

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (
      await prisma.patient.create({
        data: {
          medicalRecordNumber: "SDY-2026-6630",
          name: "Pasien Filter",
          whatsapp: PATIENT_WA,
          allergies: "Udang",
          medicalHistory: "Asma",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  async function booking(day: string, status: AppointmentStatus, intakeStatus: IntakeStatus | null) {
    slot += 1;
    const appointment = await prisma.appointment.create({
      data: {
        code: `FLT-${slot}`,
        type: "KONSULTASI",
        startAt: at(day, `${10 + slot}:00`),
        endAt: at(day, `${10 + slot}:30`),
        source: "SITUS",
        status,
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
    if (intakeStatus) {
      await prisma.intake.create({
        data: {
          appointmentId: appointment.id,
          patientId,
          status: intakeStatus,
          kind: "LENGKAP",
          purpose: "SLIMMING",
          quizVersion: 1,
          answers: { patientType: "BARU", purpose: "SLIMMING" },
          name: "Pasien Filter",
          whatsapp: PATIENT_WA,
        },
      });
    }
    return appointment;
  }

  it("mendaftar isian terisi dari semua tanggal, tanpa booking batal, kedaluwarsa, atau isian yang sudah diperiksa", async () => {
    const soon = await booking(date, "TERKONFIRMASI", "TERISI");
    const later = await booking(addDaysToDateString(date, 3), "MENUNGGU_KONFIRMASI", "TERISI");
    await booking(date, "TERKONFIRMASI", "DIPERIKSA");
    await booking(date, "DIBATALKAN", "TERISI");
    await booking(date, "KEDALUWARSA", "TERISI");
    await booking(date, "TERKONFIRMASI", null);

    const list = await listAppointments({ staffId: world.doctorId, intakeStatus: "TERISI" });

    expect(list.map((a) => a.id)).toEqual([soon.id, later.id]);
    expect(list[0].intake?.status).toBe("TERISI");
  });

  it("daftar booking tidak membawa catatan medis pasien", async () => {
    const list = await listAppointments({ staffId: world.doctorId });

    expect(list.length).toBeGreaterThan(0);
    expect(list[0].patient).toMatchObject({ id: patientId, name: "Pasien Filter", medicalRecordNumber: "SDY-2026-6630" });
    expect(JSON.stringify(list)).not.toMatch(/Udang|Asma/);
  });
});
