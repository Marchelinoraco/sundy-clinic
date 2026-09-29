// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getIntakeForStaff } from "@/server/intake";
import { holdSlot, submitSiteBooking } from "@/server/public-booking";
import { requireCapability } from "@/server/session";
import { newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld } from "./public-booking-world";

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

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG);
    const world = await createBookingWorld(SLUG);
    const date = await bookableDate();
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
    expect(intake!.identity.name).toBe("Siti Rahayu");
  });

  it("resepsionis hanya menerima identitas, tanpa bagian klinis sama sekali", async () => {
    actAs("RESEPSIONIS");
    const intake = await getIntakeForStaff(intakeId);

    expect(intake!.clinical).toBeNull();
    expect(JSON.stringify(intake)).not.toMatch(/Amlodipine|IMT|Nasi kuning/);
    expect(intake!.identity.name).toBe("Siti Rahayu");
  });

  it("mengembalikan null untuk isian yang tidak ada", async () => {
    actAs("DOKTER");
    expect(await getIntakeForStaff("tidak-ada")).toBeNull();
  });
});
