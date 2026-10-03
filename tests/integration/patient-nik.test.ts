import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { NIK_FORMAT_ERROR } from "@/lib/nik";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getEncounterForStaff, listDoctorWorklist } from "@/server/encounter-read";
import { getPatientDetail, updatePatientNik } from "@/server/patient";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "dr. Uji NIK", role: "DOKTER" as const, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", () => ({ requireCapability: vi.fn().mockResolvedValue(actor) }));

const SLUG = "nik-pasien-uji";
const WA = ["6281200005500", "6281200005501", "6281200005502"];
const today = witaDateString(new Date());
const ENTRY = { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" };

describe("NIK di data pasien, food recall di riwayat dan daftar dokter", () => {
  let world: BookingWorld;
  let patientId: string;
  let otherId: string;
  let slot = 0;

  async function booking(offsetDays: number, status: "HADIR" | "SELESAI" = "HADIR") {
    slot += 1;
    const startAt = at(addDaysToDateString(today, offsetDays), `0${4 + Math.floor(slot / 2)}:${slot % 2 ? "30" : "00"}`);
    return prisma.appointment.create({
      data: {
        code: `NIK-${slot}`,
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
    await cleanupBookingWorld(SLUG, WA);
    world = await createBookingWorld(SLUG);
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-5500", name: "Siti NIK", whatsapp: WA[0] } })).id;
    otherId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-5501", name: "Siti Lain", whatsapp: WA[1], nik: "7171015705900055" } })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, WA);
    await prisma.$disconnect();
  });

  it("mengubah NIK dari data pasien dengan aturan yang sama seperti check-in", async () => {
    await unwrap(updatePatientNik({ patientId, nik: "7171 0157 0590 0001", missingReason: null }));
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).toMatchObject({ nik: "7171015705900001", nikMissingReason: null });
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.update-nik", entityId: patientId }, orderBy: { createdAt: "desc" } })).summary,
    ).toBe("SDY-2026-5500: ••••••••••••0001");

    await unwrap(updatePatientNik({ patientId, nik: null, missingReason: "ANAK" }));
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).toMatchObject({ nik: null, nikMissingReason: "ANAK" });

    expect(await updatePatientNik({ patientId, nik: "123", missingReason: null })).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
    expect(await updatePatientNik({ patientId, nik: "7171015705900055", missingReason: null })).toEqual({
      ok: false,
      error: "NIK ini sudah dipakai Siti Lain (SDY-2026-5501).",
    });
    expect(await updatePatientNik({ patientId, nik: null, missingReason: null })).toEqual({
      ok: false,
      error: "Isi NIK atau pilih alasan belum ada NIK.",
    });
  });

  it("pasien rangkap: NIK tidak bisa diubah, dan detailnya menunjuk pasien lama", async () => {
    const duplicate = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-5502", name: "Siti Rangkap", whatsapp: WA[2], mergedIntoId: otherId },
    });
    expect(await updatePatientNik({ patientId: duplicate.id, nik: "7171015705900077", missingReason: null })).toEqual({
      ok: false,
      error: "Pasien ini rangkap; ubah NIK di pasien lamanya.",
    });
    expect((await getPatientDetail(duplicate.id))?.mergedInto).toEqual({ id: otherId, medicalRecordNumber: "SDY-2026-5501", name: "Siti Lain" });
    expect((await getPatientDetail(otherId))?.nik).toBe("7171015705900055");
  });

  it("food recall tampil di riwayat kunjungan, riwayat pasien, dan daftar dokter", async () => {
    const past = await booking(-7);
    await prisma.foodRecall.create({
      data: { appointmentId: past.id, recallDate: new Date(`${addDaysToDateString(today, -8)}T00:00:00Z`), status: "DIISI", entries: [ENTRY] },
    });
    const pastEncounter = await prisma.encounter.create({
      data: { appointmentId: past.id, createdById: world.doctorId, createdByName: "dr. Uji", assessment: "Obesitas" },
    });
    await prisma.$transaction([
      prisma.encounter.update({
        where: { id: pastEncounter.id },
        data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
      }),
      prisma.appointment.update({ where: { id: past.id }, data: { status: "SELESAI" } }),
    ]);

    const current = await booking(0);
    await prisma.foodRecall.create({
      data: { appointmentId: current.id, recallDate: new Date(`${addDaysToDateString(today, -1)}T00:00:00Z`), status: "DIISI", entries: [ENTRY] },
    });
    const encounter = await prisma.encounter.create({ data: { appointmentId: current.id, createdById: world.doctorId, createdByName: "dr. Uji" } });

    const detail = await getEncounterForStaff(encounter.id);
    expect(detail?.foodRecall).toMatchObject({ state: "FILLED", entries: [ENTRY] });
    expect(detail?.history[0].foodRecall).toMatchObject({ state: "FILLED", recallDate: addDaysToDateString(today, -8) });

    const patient = await getPatientDetail(patientId);
    expect(patient?.encounters?.find((e) => e.id === pastEncounter.id)?.foodRecall).toMatchObject({ state: "FILLED" });

    const worklist = await listDoctorWorklist();
    expect(worklist.today.find((row) => row.code === current.code)?.foodRecallFilled).toBe(true);
  });
});
