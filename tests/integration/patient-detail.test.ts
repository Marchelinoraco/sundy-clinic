// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysToDateString } from "@/lib/time";
import { getPatientDetail } from "@/server/patient";
import { requireCapability } from "@/server/session";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));

const SLUG = "detail-pasien-uji";
const PATIENT_WA = "6281200006640";

function actAs(role: StaffRole) {
  vi.mocked(requireCapability).mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: `${role} Uji`,
    role,
    email: "uji@sundy.test",
  });
}

describe("detail pasien", () => {
  let world: BookingWorld;
  let patientId: string;
  let firstId: string;
  let secondId: string;

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    const date = await bookableDate();
    patientId = (
      await prisma.patient.create({
        data: {
          medicalRecordNumber: "SDY-2026-6640",
          name: "Pasien Detail",
          whatsapp: PATIENT_WA,
          birthDate: new Date("1990-01-02T00:00:00Z"),
          gender: "P",
          allergies: "Amoxicillin",
          medicalHistory: "Darah tinggi: Amlodipine",
        },
      })
    ).id;
    const booking = (code: string, day: string, time: string, status: "TERKONFIRMASI" | "MENUNGGU_KONFIRMASI") =>
      prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          startAt: at(day, time),
          endAt: new Date(at(day, time).getTime() + 30 * 60_000),
          source: "SITUS",
          status,
          branchId: world.branchId,
          staffId: world.doctorId,
          serviceId: world.consultationId,
          patientId,
        },
      });
    firstId = (await booking("DTL-1", date, "11:00", "TERKONFIRMASI")).id;
    secondId = (await booking("DTL-2", addDaysToDateString(date, 2), "12:00", "MENUNGGU_KONFIRMASI")).id;
    const intake = (appointmentId: string, status: "TERISI" | "DIPERIKSA") =>
      prisma.intake.create({
        data: {
          appointmentId,
          patientId,
          status,
          kind: "LENGKAP",
          purpose: "SLIMMING",
          quizVersion: 1,
          answers: { patientType: "BARU", purpose: "SLIMMING", health: { conditions: ["DARAH_TINGGI"], medications: { DARAH_TINGGI: { text: "Amlodipine" } } } },
          name: "Pasien Detail",
          whatsapp: PATIENT_WA,
          submittedAt: new Date(),
          ...(status === "DIPERIKSA" ? { reviewedAt: new Date(), reviewedByStaffId: world.doctorId } : {}),
        },
      });
    await intake(firstId, "DIPERIKSA");
    await intake(secondId, "TERISI");
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("dokter melihat catatan medis, booking terbaru di atas, dan riwayat isian beserta pemeriksanya", async () => {
    actAs("DOKTER");
    const detail = await getPatientDetail(patientId);

    expect(detail).toMatchObject({
      medicalRecordNumber: "SDY-2026-6640",
      birthDateLabel: "02/01/1990",
      genderLabel: "Perempuan",
      record: { allergies: "Amoxicillin", medicalHistory: "Darah tinggi: Amlodipine" },
    });
    expect(detail!.appointments.map((a) => a.id)).toEqual([secondId, firstId]);
    expect(detail!.appointments[1]).toMatchObject({ code: "DTL-1", serviceName: "Konsultasi Dokter", staffName: "dr. Uji Publik" });
    const reviewed = detail!.intakes.find((i) => i.code === "DTL-1");
    expect(reviewed).toMatchObject({ status: "DIPERIKSA", reviewerName: "dr. Uji Publik", purposeLabel: "Slimming" });
  });

  it("resepsionis melihat identitas dan riwayat, tanpa catatan medis maupun jawaban kuis", async () => {
    actAs("RESEPSIONIS");
    const detail = await getPatientDetail(patientId);

    expect(detail!.record).toBeNull();
    expect(detail!.name).toBe("Pasien Detail");
    expect(detail!.intakes).toHaveLength(2);
    expect(JSON.stringify(detail)).not.toMatch(/Amoxicillin|Amlodipine/);
  });

  it("mengembalikan null untuk pasien yang tidak ada", async () => {
    actAs("DOKTER");
    expect(await getPatientDetail("tidak-ada")).toBeNull();
  });
});
