// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { cancelSiteBooking, findBookingStatus, holdSlot, submitSiteBooking } from "@/server/public-booking";
import { newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "status-situs-uji";
const PATIENT_WA = "6281234567890";

describe("cek status dan batal dari situs", () => {
  let world: BookingWorld;
  let date: string;

  beforeEach(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, "6285211112222"]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, "6285211112222"]);
    await prisma.$disconnect();
  });

  async function bookAt(time: string, whatsapp = newPatientIdentity.whatsapp) {
    const { token } = await unwrap(
      holdSlot({
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        startAt: at(date, time).toISOString(),
        previousToken: null,
      }),
    );
    const outcome = await unwrap(
      submitSiteBooking({
        holdToken: token,
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        startAt: at(date, time).toISOString(),
        answers: slimmingNewPatient,
        identity: { ...newPatientIdentity, whatsapp },
        consentData: true,
        consentFee: true,
        website: "",
      }),
    );
    if (outcome.kind !== "booked") throw new Error("seharusnya terbooking");
    return outcome.receipt.code;
  }

  it("menemukan booking dengan kode dan 4 digit terakhir WA, apa pun cara nomornya diketik (Review Focus 4)", async () => {
    const code = await bookAt("11:00", "+62 812-3456-7890");

    const status = await unwrap(findBookingStatus({ code: code.toLowerCase(), last4: "7890" }));
    expect(status).toMatchObject({
      code,
      status: "MENUNGGU_KONFIRMASI",
      statusLabel: "Menunggu Konfirmasi",
      serviceName: "Konsultasi Dokter",
      maskedWhatsapp: "0812-****-7890",
      bookingFee: 100000,
      canCancel: true,
      canReschedule: false,
      rescheduleLink: null,
    });
    // Tidak ada data klinis di jawaban publik.
    expect(JSON.stringify(status)).not.toMatch(/Amlodipine|slimming|answers/i);
  });

  it("memberi jawaban yang sama untuk kode salah dan 4 digit salah", async () => {
    const code = await bookAt("11:30");
    expect(await unwrap(findBookingStatus({ code, last4: "0000" }))).toBeNull();
    expect(await unwrap(findBookingStatus({ code: "SDY-ZZZZ", last4: "7890" }))).toBeNull();
    expect(await findBookingStatus({ code, last4: "78" })).toEqual({
      ok: false,
      error: "Isi kode booking dan 4 digit terakhir nomor WhatsApp.",
    });
  });

  it("menawarkan pindah jadwal setelah booking diverifikasi", async () => {
    const code = await bookAt("12:00");
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6605", name: "Siti Rahayu", whatsapp: PATIENT_WA },
    });
    await prisma.appointment.update({ where: { code }, data: { patientId: patient.id, status: "TERKONFIRMASI" } });

    const status = await unwrap(findBookingStatus({ code, last4: "7890" }));
    expect(status).toMatchObject({ canCancel: true, canReschedule: true });
    expect(decodeURIComponent(status!.rescheduleLink!)).toContain(`pindah jadwal booking ${code}`);
  });

  it("membatalkan booking dan mencatat pasien sebagai pelaku", async () => {
    const code = await bookAt("12:30");

    const cancelled = await unwrap(cancelSiteBooking({ code, last4: "7890" }));
    expect(cancelled).toMatchObject({ status: "DIBATALKAN", canCancel: false });

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { code }, include: { intake: true } });
    expect(appointment.intake).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: appointment.id, action: "appointment.cancel-by-patient" },
    });
    expect(audit.actorName).toBe("Pasien (situs)");
  });

  it("menolak pembatalan kurang dari 2 jam sebelum jadwal", async () => {
    const soon = new Date(Date.now() + 60 * 60_000);
    const appointment = await prisma.appointment.create({
      data: {
        code: "STATUS-DEKAT",
        type: "KONSULTASI",
        startAt: soon,
        endAt: new Date(soon.getTime() + 30 * 60_000),
        source: "SITUS",
        branchId: world.branchId,
        staffId: world.doctorId,
        patientId: null,
      },
    });
    await prisma.intake.create({
      data: { appointmentId: appointment.id, status: "TERISI", kind: "LENGKAP", whatsapp: PATIENT_WA },
    });

    expect(await cancelSiteBooking({ code: "STATUS-DEKAT", last4: "7890" })).toEqual({
      ok: false,
      error: "Pembatalan lewat situs hanya sampai 2 jam sebelum jadwal. Hubungi kami lewat WhatsApp.",
    });
  });

  it("menemukan booking yang dicatat admin lewat nomor WA pasiennya", async () => {
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6606", name: "Pasien Telepon", whatsapp: PATIENT_WA },
    });
    await prisma.appointment.create({
      data: {
        code: "STATUS-ADMIN",
        type: "KONSULTASI",
        startAt: at(date, "16:00"),
        endAt: at(date, "16:30"),
        source: "TELEPON",
        branchId: world.branchId,
        staffId: world.doctorId,
        patientId: patient.id,
      },
    });

    expect(await unwrap(findBookingStatus({ code: "STATUS-ADMIN", last4: "7890" }))).toMatchObject({
      code: "STATUS-ADMIN",
      maskedWhatsapp: "0812-****-7890",
    });
  });
  it("tetap memakai nomor yang diketik pemesan setelah booking dicocokkan dengan pasien bernomor lain", async () => {
    const code = await bookAt("13:00");
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6607", name: "Pasien Lama", whatsapp: "6285211112222" },
    });
    await prisma.appointment.update({ where: { code }, data: { patientId: patient.id } });

    expect(await unwrap(findBookingStatus({ code, last4: "2222" }))).toBeNull();
    expect(await unwrap(findBookingStatus({ code, last4: "7890" }))).toMatchObject({
      code,
      maskedWhatsapp: "0812-****-7890",
    });
  });
  it("setelah 10 tebakan digit salah, kode itu tampak tidak ditemukan bahkan untuk digit yang benar", async () => {
    const code = await bookAt("13:30");
    const other = await bookAt("14:00");

    for (let attempt = 0; attempt < 10; attempt++) {
      expect(await unwrap(findBookingStatus({ code, last4: "000" + (attempt % 10) }))).toBeNull();
    }

    // Persis sama dengan "tidak ditemukan": bentuk jawaban dan pesan tidak berubah.
    expect(await findBookingStatus({ code, last4: "7890" })).toEqual({ ok: true, data: null });
    expect(await cancelSiteBooking({ code, last4: "7890" })).toEqual({
      ok: false,
      error: "Booking tidak ditemukan. Periksa kode dan nomor WhatsApp.",
    });
    expect(await prisma.appointment.findUniqueOrThrow({ where: { code } })).toMatchObject({
      status: "MENUNGGU_KONFIRMASI",
    });
    // Booking lain tidak terpengaruh.
    expect(await unwrap(findBookingStatus({ code: other, last4: "7890" }))).toMatchObject({ code: other });
  });
});
