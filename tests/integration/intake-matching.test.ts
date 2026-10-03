// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  cancelAppointment,
  listAppointments,
  markNoShow,
  verifyAppointment,
} from "@/server/appointment";
import { checkInAppointment } from "@/server/check-in";
import { createPatientFromIntake, getMatchCandidates, matchPatient } from "@/server/intake";
import { unwrap } from "./unwrap";
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

const SLUG = "cocokkan-uji";
const FAMILY_WA = "6281200006610";
const OTHER_WA = "6281200006611";

describe("mencocokkan booking situs dengan pasien", () => {
  let world: BookingWorld;
  let date: string;
  let hour = 10;

  beforeEach(async () => {
    await cleanupBookingWorld(SLUG, [FAMILY_WA, OTHER_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [FAMILY_WA, OTHER_WA]);
    await prisma.$disconnect();
  });

  /** Booking situs yang belum dicocokkan, seperti hasil submitSiteBooking. */
  async function siteBooking(name = "Siti Rahayu", whatsapp = FAMILY_WA) {
    hour += 1;
    const appointment = await prisma.appointment.create({
      data: {
        code: `COCOK-${hour}`,
        type: "KONSULTASI",
        startAt: at(date, `${hour}:00`),
        endAt: at(date, `${hour}:30`),
        source: "SITUS",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: null,
        bookingFee: 100000,
      },
    });
    await prisma.intake.create({
      data: {
        appointmentId: appointment.id,
        status: "TERISI",
        kind: "LENGKAP",
        purpose: "SLIMMING",
        claimsReturning: true,
        quizVersion: 1,
        answers: { patientType: "BARU", purpose: "SLIMMING" },
        name,
        whatsapp,
        birthDate: new Date("1992-04-17T00:00:00Z"),
        gender: "P",
        occupation: "Guru",
        address: "Jl. Sam Ratulangi",
      },
    });
    return appointment;
  }

  it("menyarankan pasien dengan nomor WA sama, atau nama & tanggal lahir sama, tanpa data klinis", async () => {
    const booking = await siteBooking();
    await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6610", name: "Ibu Maria", whatsapp: FAMILY_WA },
    });
    await prisma.patient.create({
      data: {
        medicalRecordNumber: "SDY-2026-6611",
        name: "Siti Rahayu Lumban",
        whatsapp: OTHER_WA,
        birthDate: new Date("1992-04-17T00:00:00Z"),
      },
    });

    const result = await unwrap(getMatchCandidates(booking.id));
    expect(result.intake).toEqual({
      name: "Siti Rahayu",
      whatsapp: FAMILY_WA,
      birthDateLabel: "17/04/1992",
      claimsReturning: true,
    });
    expect(result.candidates.map((c) => c.medicalRecordNumber).sort()).toEqual(["SDY-2026-6610", "SDY-2026-6611"]);
    expect(JSON.stringify(result)).not.toMatch(/answers|SLIMMING/);
  });

  it("menautkan pasien lama ke booking dan isiannya, lalu booking bisa diverifikasi", async () => {
    const booking = await siteBooking();
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6612", name: "Siti Rahayu", whatsapp: FAMILY_WA },
    });

    await unwrap(matchPatient(booking.id, patient.id));

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id }, include: { intake: true } });
    expect(after.patientId).toBe(patient.id);
    expect(after.intake?.patientId).toBe(patient.id);
    expect((await unwrap(verifyAppointment(booking.id))).status).toBe("TERKONFIRMASI");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: booking.id, action: "appointment.match-patient" },
    });
    expect(audit.summary).toContain("SDY-2026-6612");
  });

  it("membuat pasien baru dari identitas isian", async () => {
    const booking = await siteBooking();

    const { patientId, medicalRecordNumber } = await unwrap(createPatientFromIntake(booking.id));

    expect(medicalRecordNumber).toMatch(/^SDY-\d{4}-\d{4}$/);
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(patient).toMatchObject({ name: "Siti Rahayu", whatsapp: FAMILY_WA, gender: "P", occupation: "Guru" });
    expect(patient.birthDate?.toISOString().slice(0, 10)).toBe("1992-04-17");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id } })).patientId).toBe(patientId);
  });

  it("menolak verifikasi, hadir, dan tidak hadir sebelum dicocokkan, tetapi mengizinkan pembatalan", async () => {
    const booking = await siteBooking();
    const message = "Cocokkan booking ini dengan data pasien lebih dulu.";

    expect(await verifyAppointment(booking.id)).toEqual({ ok: false, error: message });
    expect(
      await checkInAppointment({
        appointmentId: booking.id,
        nik: { kind: "MISSING", reason: "LUPA_KTP" },
        identity: {},
        whatsapp: "081234567890",
        offerFoodRecall: false,
      }),
    ).toEqual({ ok: false, error: message });
    expect(await markNoShow(booking.id)).toEqual({ ok: false, error: message });
    expect((await unwrap(cancelAppointment(booking.id))).status).toBe("DIBATALKAN");
  });

  it("pencocokan bisa diganti sebelum verifikasi, tetapi tidak sesudahnya", async () => {
    const booking = await siteBooking();
    const first = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6613", name: "Siti A", whatsapp: FAMILY_WA },
    });
    const second = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6614", name: "Siti B", whatsapp: FAMILY_WA },
    });

    await unwrap(matchPatient(booking.id, first.id));
    await unwrap(matchPatient(booking.id, second.id));
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id } })).patientId).toBe(second.id);

    await unwrap(verifyAppointment(booking.id));
    expect(await matchPatient(booking.id, first.id)).toEqual({
      ok: false,
      error: "Pasien hanya bisa dicocokkan sebelum booking diverifikasi.",
    });
  });

  it("daftar booking hanya membawa identitas isian, bukan jawaban klinis", async () => {
    await siteBooking();
    const rows = await listAppointments({ date });
    const row = rows.find((r) => r.code.startsWith("COCOK-"))!;
    // kind & linkVersion (spec C3) hanya penanda jenis kuis dan versi link, bukan jawaban klinis.
    expect(row.intake).toEqual({
      id: expect.any(String),
      name: "Siti Rahayu",
      whatsapp: FAMILY_WA,
      status: "TERISI",
      kind: "LENGKAP",
      linkVersion: 0,
    });
  });
});
