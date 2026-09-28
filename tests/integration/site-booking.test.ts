// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { holdSlot, submitSiteBooking, type SiteBookingInput } from "@/server/public-booking";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  newPatientIdentity,
  returningPatientIdentity,
  slimmingNewPatient,
  slimmingReturningPatient,
} from "../fixtures/quiz-answers";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "kirim-situs-uji";
const PATIENT_WA = "6281234567890";

describe("Kirim pendaftaran situs", () => {
  let world: BookingWorld;
  let date: string;

  beforeEach(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.auditLog.deleteMany({ where: { action: "appointment.site-create" } });
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 100000 } });
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  async function holdFor(time: string, serviceId = world.consultationId, staffId = world.doctorId) {
    const { token } = await unwrap(
      holdSlot({ serviceId, staffId, branchId: world.branchId, startAt: at(date, time).toISOString(), previousToken: null }),
    );
    return token;
  }

  function input(token: string, time: string, overrides: Partial<SiteBookingInput> = {}): SiteBookingInput {
    return {
      holdToken: token,
      serviceId: world.consultationId,
      staffId: world.doctorId,
      branchId: world.branchId,
      startAt: at(date, time).toISOString(),
      answers: slimmingNewPatient,
      identity: newPatientIdentity,
      consentData: true,
      consentFee: true,
      website: "",
      ...overrides,
    };
  }

  it("pasien baru Slimming: booking situs tanpa pasien, isian lengkap, dan kwitansi", async () => {
    const token = await holdFor("11:00");
    const outcome = await unwrap(submitSiteBooking(input(token, "11:00")));

    expect(outcome.kind).toBe("booked");
    if (outcome.kind !== "booked") return;
    const { receipt } = outcome;
    expect(receipt).toMatchObject({
      patientName: "Siti Rahayu",
      serviceName: "Konsultasi Dokter",
      staffName: "dr. Uji Publik",
      bookingFee: 100000,
    });
    expect(receipt.code).toMatch(/^SDY-[2-9A-HJ-NP-Z]{4}$/);
    expect(decodeURIComponent(receipt.confirmationLink)).toContain(`Kode: ${receipt.code}`);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { code: receipt.code },
      include: { intake: true },
    });
    expect(appointment).toMatchObject({
      source: "SITUS",
      status: "MENUNGGU_KONFIRMASI",
      type: "KONSULTASI",
      patientId: null,
      bookingFee: 100000,
    });
    const intake = appointment.intake!;
    expect(intake).toMatchObject({
      status: "TERISI",
      kind: "LENGKAP",
      purpose: "SLIMMING",
      claimsReturning: false,
      quizVersion: 1,
      name: "Siti Rahayu",
      whatsapp: PATIENT_WA,
      gender: "P",
      consentVersion: PRIVACY_POLICY_VERSION,
      submissionKey: token,
    });
    expect(Number(intake.selfWeightKg)).toBe(72);
    expect(Number(intake.selfHeightCm)).toBe(158);
    expect((intake.answers as { slimming: Record<string, unknown> }).slimming.weightKg).toBeUndefined();
    expect(await prisma.slotHold.count({ where: { token } })).toBe(0);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: appointment.id } });
    expect(audit).toMatchObject({ action: "appointment.site-create", actorName: "Pasien (situs)" });
  });

  it("Kirim ganda dengan token yang sama menghasilkan satu booking (Review Focus 3)", async () => {
    const token = await holdFor("11:30");
    const first = await unwrap(submitSiteBooking(input(token, "11:30")));
    const second = await unwrap(submitSiteBooking(input(token, "11:30")));

    expect(first).toEqual(second);
    expect(await prisma.appointment.count({ where: { staffId: world.doctorId } })).toBe(1);
  });

  it("hold yang sudah habis tetap menjadi booking bila jamnya masih kosong (Review Focus 3)", async () => {
    const token = await holdFor("12:00");
    await prisma.slotHold.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    expect((await unwrap(submitSiteBooking(input(token, "12:00")))).kind).toBe("booked");
  });

  it("melaporkan slot terisi bila admin lebih dulu mengambil jam itu", async () => {
    const token = await holdFor("12:30");
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6604", name: "Pasien Telepon", whatsapp: PATIENT_WA },
    });
    await prisma.appointment.create({
      data: {
        code: "KIRIM-ADMIN",
        type: "KONSULTASI",
        startAt: at(date, "12:30"),
        endAt: at(date, "13:00"),
        source: "TELEPON",
        branchId: world.branchId,
        staffId: world.doctorId,
        patientId: patient.id,
      },
    });

    expect(await unwrap(submitSiteBooking(input(token, "12:30")))).toEqual({ kind: "slot-taken" });
    expect(await prisma.intake.count({ where: { submissionKey: token } })).toBe(0);
  });

  it("menolak token hold buatan untuk jam di luar jadwal", async () => {
    const fakeToken = "token-buatan-000000000000";
    const outcome = await unwrap(submitSiteBooking(input(fakeToken, "09:00")));

    expect(outcome).toEqual({ kind: "slot-taken" });
    expect(await prisma.appointment.count({ where: { staffId: world.doctorId } })).toBe(0);
  });

  it("tidak bisa merebut jam yang sedang ditahan pasien lain", async () => {
    await holdFor("16:00");
    const fakeToken = "token-buatan-111111111111";

    expect(await unwrap(submitSiteBooking(input(fakeToken, "16:00")))).toEqual({ kind: "slot-taken" });
  });

  it("menolak jam yang berbeda dari jam yang ditahan", async () => {
    const token = await holdFor("16:30");

    expect(await submitSiteBooking(input(token, "17:00"))).toEqual({
      ok: false,
      error: "Jadwal tidak cocok dengan jam yang ditahan. Pilih jam lagi.",
    });
  });

  it("hold yang sudah dibersihkan tetap menjadi booking bila jamnya masih kosong", async () => {
    const token = await holdFor("17:30");
    await prisma.slotHold.delete({ where: { token } });

    expect((await unwrap(submitSiteBooking(input(token, "17:30")))).kind).toBe("booked");
  });

  it("pasien baru hanya boleh memesan Konsultasi Dokter", async () => {
    const token = await holdFor("13:00", world.treatmentId, world.therapistId);
    const result = await submitSiteBooking(
      input(token, "13:00", { serviceId: world.treatmentId, staffId: world.therapistId }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Pasien baru mendaftar untuk Konsultasi Dokter lebih dulu. Treatment ditentukan dokter setelah pemeriksaan.",
    });
  });

  it("pasien Aesthetic lama boleh memesan treatment dengan isian pendek", async () => {
    const token = await holdFor("13:00", world.treatmentId, world.therapistId);
    const outcome = await unwrap(
      submitSiteBooking(
        input(token, "13:00", {
          serviceId: world.treatmentId,
          staffId: world.therapistId,
          answers: aestheticReturningPatient,
          identity: returningPatientIdentity,
        }),
      ),
    );
    if (outcome.kind !== "booked") throw new Error("seharusnya terbooking");

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { code: outcome.receipt.code },
      include: { intake: true },
    });
    expect(appointment.type).toBe("TREATMENT");
    expect(appointment.intake).toMatchObject({ kind: "PENDEK", purpose: "AESTHETIC", claimsReturning: true, gender: null });
  });

  it("tidak menawarkan treatment kategori slimming kepada pasien Aesthetic lama", async () => {
    const token = await holdFor("14:00", world.slimmingTreatmentId);
    const result = await submitSiteBooking(
      input(token, "14:00", {
        serviceId: world.slimmingTreatmentId,
        answers: aestheticReturningPatient,
        identity: returningPatientIdentity,
      }),
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("menyimpan tanggal 'kemarin' untuk aktivitas pasien Slimming lama", async () => {
    const token = await holdFor("14:30");
    const outcome = await unwrap(
      submitSiteBooking(input(token, "14:30", { answers: slimmingReturningPatient, identity: returningPatientIdentity })),
    );
    if (outcome.kind !== "booked") throw new Error("seharusnya terbooking");

    const intake = await prisma.intake.findFirstOrThrow({ where: { submissionKey: token } });
    const yesterday = addDaysToDateString(witaDateString(new Date()), -1);
    expect(intake.activityDate?.toISOString().slice(0, 10)).toBe(yesterday);
  });

  it("hanya menyimpan jawaban jalur yang akhirnya dipilih (Review Focus 1)", async () => {
    const token = await holdFor("15:00");
    const switched = { ...slimmingNewPatient, purpose: "AESTHETIC", aesthetic: aestheticNewPatient.aesthetic };
    await unwrap(submitSiteBooking(input(token, "15:00", { answers: switched })));

    const intake = await prisma.intake.findFirstOrThrow({ where: { submissionKey: token } });
    expect(intake.purpose).toBe("AESTHETIC");
    expect(intake.answers).not.toHaveProperty("slimming");
    expect(intake.selfWeightKg).toBeNull();
  });

  it("menolak tanpa persetujuan, dengan jawaban yang belum lengkap, atau dengan kolom jebakan terisi", async () => {
    const token = await holdFor("15:30");
    expect(await submitSiteBooking(input(token, "15:30", { consentFee: false }))).toEqual({
      ok: false,
      error: "Centang kedua persetujuan untuk melanjutkan.",
    });
    const incomplete = { ...slimmingNewPatient, health: { ...slimmingNewPatient.health, pregnancy: undefined } };
    expect(await submitSiteBooking(input(token, "15:30", { answers: incomplete }))).toEqual({
      ok: false,
      error: "Pilih salah satu.",
    });
    expect(await submitSiteBooking(input(token, "15:30", { website: "http://spam" }))).toMatchObject({ ok: false });
    expect(await prisma.appointment.count({ where: { staffId: world.doctorId } })).toBe(0);
  });
});
