// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { openEncounter, saveEncounterDraft } from "@/server/encounter";
import { getEncounterForStaff, listDoctorWorklist } from "@/server/encounter-read";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s-dokter-vital", name: "dr. Vital", role: "DOKTER" as const, email: "dokter@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
    requireStaff: vi.fn(async () => actor),
  };
});

const SLUG = "dokter-vital";
const WA = "6281200009977";
const today = witaDateString(new Date());
let world: BookingWorld;
let patientId: string;
let slot = 0;

async function visit(offsetDays = 0, channel: "KLINIK" | "ONLINE" = "KLINIK") {
  slot += 1;
  const startAt = at(addDaysToDateString(today, offsetDays), `0${Math.min(9, 3 + slot)}:30`);
  return prisma.appointment.create({
    data: {
      code: `DVT-${slot}`,
      type: "KONSULTASI",
      channel,
      servicePrice: channel === "ONLINE" ? 250_000 : null,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: "WALK_IN",
      branchId: world.branchId,
      staffId: world.doctorId,
      serviceId: world.consultationId,
      patientId,
    },
  });
}

const nurseDone = (appointmentId: string) =>
  prisma.nurseVitals.create({
    data: { appointmentId, systolic: 120, diastolic: 80, weightKg: 72.5, heightCm: 160, updatedById: "p1", updatedByName: "Rina", completedAt: new Date(), completedById: "p1", completedByName: "Rina" },
  });

beforeAll(async () => {
  await cleanupBookingWorld(SLUG, [WA]);
  world = await createBookingWorld(SLUG);
  actor.staffId = world.doctorId;
  patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-9977", name: "Dodi Uji", whatsapp: WA } })).id;
});
afterAll(async () => {
  await prisma.encounter.deleteMany({ where: { appointment: { patientId } } });
  await cleanupBookingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("dokter menunggu perawat (spec vital perawat VP4–VP6)", () => {
  it("kunjungan klinik hari ini menunggu Selesai ditangani; sesudahnya angka perawat ada di bagian O", async () => {
    const appointment = await visit();
    expect(await openEncounter(appointment.id)).toEqual({ ok: false, error: "Perawat belum selesai menangani pasien ini." });
    expect((await listDoctorWorklist()).today.find((row) => row.appointmentId === appointment.id)).toMatchObject({ waitingNurse: true });

    await nurseDone(appointment.id);
    expect((await listDoctorWorklist()).today.find((row) => row.appointmentId === appointment.id)).toMatchObject({ waitingNurse: false });
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const encounter = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(encounter).toMatchObject({ systolic: 120, diastolic: 80, pulse: null });
    expect(Number(encounter.weightKg)).toBe(72.5);
    expect(Number(encounter.heightCm)).toBe(160);

    // Review Focus 1: tanpa perubahan dokter tidak ada tanda; setelah berat diubah, ada.
    const detail = (await getEncounterForStaff(encounterId))!;
    expect(detail.nurseVitals).toMatchObject({ byName: "Rina", changedByDoctor: false });
    await unwrap(saveEncounterDraft({ encounterId, version: detail.version, draft: { ...detail.draft, vitals: { ...detail.draft.vitals, weightKg: "72" } } }));
    expect((await getEncounterForStaff(encounterId))!.nurseVitals).toMatchObject({ changedByDoctor: true });
  });

  it("kunjungan klinik kemarin yang belum dibuka dan konsultasi online tidak menunggu perawat (Review Focus 2, 3)", async () => {
    const yesterday = await visit(-1);
    const online = await visit(0, "ONLINE");
    await unwrap(openEncounter(yesterday.id));
    await unwrap(openEncounter(online.id));
    const worklist = await listDoctorWorklist();
    expect(worklist.today.find((row) => row.appointmentId === online.id)).toMatchObject({ waitingNurse: false });
    expect((await getEncounterForStaff((await prisma.encounter.findUniqueOrThrow({ where: { appointmentId: online.id } })).id))!.nurseVitals).toBeNull();
  });
});
