// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { emptyDraftInput } from "@/lib/encounter";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { openEncounter } from "@/server/encounter";
import { getEncounterForStaff } from "@/server/encounter-read";
import { getNurseVisit, listNurseWorklist } from "@/server/nurse";
import { completeNurseVisit, saveNurseVitals } from "@/server/nurse-vitals";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

type Role = "TERAPIS" | "RESEPSIONIS" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s-perawat-vital", name: "Perawat Vital", role: "TERAPIS" as Role, email: "vital@sundy.test" },
}));
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

const SLUG = "vital-perawat";
const WA = "6281200009966";
const today = witaDateString(new Date());
let world: BookingWorld;
let patientId: string;
let slot = 0;
const vitals = (patch: Partial<ReturnType<typeof emptyDraftInput>["vitals"]> = {}) => ({ ...emptyDraftInput().vitals, ...patch });

async function visit(offsetDays = 0, status: "HADIR" | "SELESAI" = "HADIR") {
  slot += 1;
  const startAt = at(addDaysToDateString(today, offsetDays), `${String(4 + slot).padStart(2, "0")}:00`);
  return prisma.appointment.create({
    data: {
      code: `VTL-${slot}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status,
      source: "WALK_IN",
      branchId: world.branchId,
      staffId: world.doctorId,
      serviceId: world.consultationId,
      patientId,
    },
  });
}

beforeAll(async () => {
  await cleanupBookingWorld(SLUG, [WA]);
  world = await createBookingWorld(SLUG);
  patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-9966", name: "Vita Uji", whatsapp: WA } })).id;
  // Kunjungan lalu dengan tinggi badan: diisi lebih dulu di kunjungan baru (VP2).
  const past = await visit(-7, "SELESAI");
  await prisma.encounter.create({
    data: { appointmentId: past.id, status: "FINAL", assessment: "Kontrol", heightCm: 160, createdById: world.doctorId, createdByName: "dr. Uji", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
  });
});
beforeEach(() => {
  actor.role = "TERAPIS";
});
afterAll(async () => {
  await prisma.encounter.deleteMany({ where: { appointment: { patientId } } }).catch(() => undefined);
  await cleanupBookingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("angka vital oleh perawat (spec vital perawat VP1–VP3, VP6)", () => {
  it("tinggi badan terisi dari kunjungan lalu; simpan dengan versi; versi lama ditolak; angka salah ditolak", async () => {
    const appointment = await visit();
    const before = (await getNurseVisit(appointment.id))!;
    expect(before.vitals).toEqual({ inputs: vitals({ heightCm: "160" }), version: null, completed: null });

    const first = await unwrap(saveNurseVitals({ appointmentId: appointment.id, version: null, vitals: vitals({ weightKg: "72,5", heightCm: "160" }) }));
    const second = await unwrap(saveNurseVitals({ appointmentId: appointment.id, version: first.version, vitals: vitals({ weightKg: "72,4", heightCm: "160" }) }));
    expect(second.version).not.toBe(first.version);
    expect(await saveNurseVitals({ appointmentId: appointment.id, version: first.version, vitals: vitals({ weightKg: "70" }) })).toEqual({
      ok: false,
      error: "Angka vital baru saja diubah. Muat ulang halaman.",
    });
    expect(await saveNurseVitals({ appointmentId: appointment.id, version: second.version, vitals: vitals({ systolic: "400", diastolic: "80" }) })).toEqual({
      ok: false,
      error: "Sistolik harus 50–260 mmHg.",
    });
    expect((await getNurseVisit(appointment.id))!.vitals.inputs).toEqual(vitals({ weightKg: "72,4", heightCm: "160" }));
  });

  it("Selesai ditangani mencatat nama perawat dan jam, lalu angka terkunci; daftar menandainya", async () => {
    const appointment = await visit();
    const saved = await unwrap(saveNurseVitals({ appointmentId: appointment.id, version: null, vitals: vitals({ systolic: "120", diastolic: "80" }) }));
    expect((await listNurseWorklist()).find((row) => row.appointmentId === appointment.id)).toMatchObject({ handled: false });

    await unwrap(completeNurseVisit({ appointmentId: appointment.id, version: saved.version, vitals: vitals({ systolic: "120", diastolic: "80" }) }));
    const after = (await getNurseVisit(appointment.id))!;
    expect(after.vitals.completed).toMatchObject({ byName: "Perawat Vital" });
    expect(await saveNurseVitals({ appointmentId: appointment.id, version: saved.version, vitals: vitals() })).toEqual({ ok: false, error: "Pasien ini sudah selesai ditangani." });
    expect(await completeNurseVisit({ appointmentId: appointment.id, version: saved.version, vitals: vitals() })).toEqual({ ok: false, error: "Pasien ini sudah selesai ditangani." });
    expect((await listNurseWorklist()).find((row) => row.appointmentId === appointment.id)).toMatchObject({ handled: true });
    expect(await prisma.auditLog.count({ where: { action: "nurse-visit.complete", entityId: appointment.id } })).toBe(1);
  });

  it("selesai tanpa mengukur pun boleh (tidak ada angka wajib); resepsionis tidak boleh", async () => {
    const appointment = await visit();
    actor.role = "RESEPSIONIS";
    await expect(completeNurseVisit({ appointmentId: appointment.id, version: null, vitals: vitals() })).rejects.toThrow(/forbidden/);
    actor.role = "TERAPIS";
    // Tinggi badan dari kunjungan lalu yang terlihat di halaman ikut tersimpan walau perawat tidak mengetik apa pun.
    await unwrap(completeNurseVisit({ appointmentId: appointment.id, version: null, vitals: vitals({ heightCm: "160" }) }));
    const row = await prisma.nurseVitals.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    expect(row).toMatchObject({ weightKg: null, completedByName: "Perawat Vital" });
    expect(Number(row.heightCm)).toBe(160);
  });

  it("Selesai ditangani menyimpan angka yang terlihat sekaligus; versi lama dan angka salah ditolak (temuan review)", async () => {
    const appointment = await visit();
    const saved = await unwrap(saveNurseVitals({ appointmentId: appointment.id, version: null, vitals: vitals({ heightCm: "160" }) }));
    expect(await completeNurseVisit({ appointmentId: appointment.id, version: null, vitals: vitals({ weightKg: "72,5", heightCm: "160" }) })).toEqual({
      ok: false,
      error: "Angka vital baru saja diubah. Muat ulang halaman.",
    });
    expect(await completeNurseVisit({ appointmentId: appointment.id, version: saved.version, vitals: vitals({ systolic: "400", diastolic: "80" }) })).toEqual({
      ok: false,
      error: "Sistolik harus 50–260 mmHg.",
    });
    expect((await getNurseVisit(appointment.id))!.vitals.completed).toBeNull();

    // Ketikan terakhir yang belum sempat tersimpan otomatis ikut terkunci.
    await unwrap(completeNurseVisit({ appointmentId: appointment.id, version: saved.version, vitals: vitals({ weightKg: "72,5", heightCm: "160" }) }));
    const after = (await getNurseVisit(appointment.id))!;
    expect(after.vitals.inputs).toEqual(vitals({ weightKg: "72,5", heightCm: "160" }));
    expect(after.vitals.completed).toMatchObject({ byName: "Perawat Vital" });
  });

  it("perawat mengosongkan tinggi badan lalu selesai: dokter mendapat angka perawat apa adanya, tanpa tanda diubah dokter (temuan review)", async () => {
    const appointment = await visit();
    await unwrap(completeNurseVisit({ appointmentId: appointment.id, version: null, vitals: vitals({ weightKg: "70" }) }));
    actor.role = "DOKTER";
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const encounter = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(encounter.heightCm).toBeNull();
    expect(Number(encounter.weightKg)).toBe(70);
    expect((await getEncounterForStaff(encounterId))!.nurseVitals).toMatchObject({ changedByDoctor: false });
  });
});
