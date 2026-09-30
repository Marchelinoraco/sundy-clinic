// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getIntakeForStaff } from "@/server/intake";
import { holdSlot, submitSiteBooking } from "@/server/public-booking";
import { requireCapability } from "@/server/session";
import * as v1 from "../fixtures/quiz-answers";
import { newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers-v2";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));
vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "akses-isian-uji";

function actAs(role: "DOKTER" | "RESEPSIONIS") {
  vi.mocked(requireCapability).mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: `${role} Uji`,
    role,
    email: "uji@sundy.test",
  });
}

describe("akses isian pendaftaran", () => {
  let intakeId: string;
  let world: BookingWorld;
  let date: string;

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    const startAt = at(date, "11:00").toISOString();
    const { token } = await unwrap(
      holdSlot({ serviceId: world.consultationId, staffId: world.doctorId, branchId: world.branchId, startAt, previousToken: null }),
    );
    await unwrap(
      submitSiteBooking({
        holdToken: token,
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        startAt,
        answers: slimmingNewPatient,
        identity: newPatientIdentity,
        consentData: true,
        consentFee: true,
        website: "",
      }),
    );
    intakeId = (await prisma.intake.findFirstOrThrow({ where: { submissionKey: token } })).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG);
    await prisma.$disconnect();
  });

  it("dokter menerima jawaban klinis lengkap, termasuk berat & tinggi dari kolom bertipe", async () => {
    actAs("DOKTER");
    const intake = await getIntakeForStaff(intakeId);

    const lines = intake!.clinical!.sections.flatMap((s) => s.lines);
    expect(lines).toContain("Darah tinggi: Amlodipine 5 mg, 1× sehari");
    expect(lines).toContain("72 kg · 158 cm · IMT 28,8");
    expect(intake!.clinical!.habits?.rows.find((row) => row.label === "07.00")?.entries).toEqual([
      "Sarapan: Nasi kuning 1 piring, teh manis 1 gelas",
    ]);
    expect(intake!.clinical!.activities).toBeNull();
    expect(intake!.identity.name).toBe("Siti Rahayu");
  });

  it("resepsionis hanya menerima identitas, tanpa bagian klinis sama sekali", async () => {
    actAs("RESEPSIONIS");
    const intake = await getIntakeForStaff(intakeId);

    expect(intake!.clinical).toBeNull();
    expect(JSON.stringify(intake)).not.toMatch(/Amlodipine|IMT|Nasi kuning/);
    expect(intake!.identity.name).toBe("Siti Rahayu");
  });

  it("dokter tetap membaca isian versi 1 yang tersimpan sebelum kuis v2, termasuk tabel aktivitas kemarin", async () => {
    actAs("DOKTER");
    const appointment = await prisma.appointment.create({
      data: {
        code: "AKSES-V1",
        type: "KONSULTASI",
        startAt: at(date, "15:00"),
        endAt: at(date, "15:30"),
        source: "SITUS",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: null,
        bookingFee: 100000,
      },
    });
    const stored = await prisma.intake.create({
      data: {
        appointmentId: appointment.id,
        status: "TERISI",
        kind: "PENDEK",
        purpose: "SLIMMING",
        claimsReturning: true,
        quizVersion: 1,
        answers: v1.slimmingReturningPatient,
        activityDate: new Date("2026-09-28T00:00:00Z"),
        name: "Siti Rahayu",
        whatsapp: "6281234567890",
      },
    });

    const detail = await getIntakeForStaff(stored.id);

    expect(detail!.clinical!.habits).toBeNull();
    expect(detail!.clinical!.activities).toHaveLength(17);
    expect(detail!.clinical!.activityDateLabel).toBe("Senin, 28 September 2026");
    expect(detail!.clinical!.sections.flatMap((section) => section.lines)).toContain(
      "Darah tinggi: Amlodipine 5 mg, 1× sehari",
    );
  });

  it("mengembalikan null untuk isian yang tidak ada", async () => {
    actAs("DOKTER");
    expect(await getIntakeForStaff("tidak-ada")).toBeNull();
  });
});
