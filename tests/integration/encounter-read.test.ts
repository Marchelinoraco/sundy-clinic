// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emptyDraftInput, type EncounterDraftInput } from "@/lib/encounter";
import { can } from "@/lib/permissions";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addEncounterAddendum, finalizeEncounter, openEncounter, saveEncounterDraft } from "@/server/encounter";
import { getEncounterForStaff, listDoctorWorklist } from "@/server/encounter-read";
import { requireCapability } from "@/server/session";
import { slimmingNewPatient } from "../fixtures/quiz-answers-v2";
import { unwrap } from "./unwrap";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));

const SLUG = "baca-kunjungan-uji";
const PATIENT_WA = "6281200007720";
const HISTORY_WA = "6281200007721";
const ROUTINE_WA = "6281200007722";

describe("membaca kunjungan dan daftar kerja dokter", () => {
  let world: BookingWorld;
  let patientId: string;
  let serial = 0;
  const today = witaDateString(new Date());

  function actAs(role: StaffRole) {
    vi.mocked(requireCapability).mockImplementation(async (capability) => {
      if (!can(role, capability)) throw new Error(`forbidden: ${capability}`);
      return { userId: "u1", staffId: world.doctorId, name: `${role} Uji`, role, email: "uji@sundy.test" };
    });
  }

  async function booking(day: string, time: string, status: "HADIR" | "TERKONFIRMASI" = "HADIR", patient = patientId) {
    serial += 1;
    const startAt = at(day, time);
    return prisma.appointment.create({
      data: {
        code: `BKJ-${serial}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status,
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: patient,
      },
    });
  }

  async function finalized(appointmentId: string) {
    const { encounterId } = await unwrap(openEncounter(appointmentId));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    await unwrap(
      finalizeEncounter({ encounterId, version: updatedAt.toISOString(), draft: { ...emptyDraftInput(), assessment: "Kontrol" } }),
    );
    return encounterId;
  }

  async function finalizedWith(
    appointment: { id: string },
    patch: { assessment: string; plan?: string; vitals?: Partial<EncounterDraftInput["vitals"]> },
  ) {
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    const base = emptyDraftInput();
    await unwrap(
      finalizeEncounter({
        encounterId,
        version: updatedAt.toISOString(),
        draft: { ...base, assessment: patch.assessment, plan: patch.plan ?? "", vitals: { ...base.vitals, ...patch.vitals } },
      }),
    );
    return encounterId;
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, HISTORY_WA, ROUTINE_WA]);
    world = await createBookingWorld(SLUG);
    patientId = (
      await prisma.patient.create({
        data: {
          medicalRecordNumber: "SDY-2026-7720",
          name: "Pasien Baca",
          whatsapp: PATIENT_WA,
          birthDate: new Date("1990-05-17T00:00:00Z"),
          gender: "P",
          allergies: "Udang",
          medicalHistory: null,
          importantNotes: "Takut jarum",
          paperRecordNumber: "RM-0457",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, HISTORY_WA, ROUTINE_WA]);
    await prisma.$disconnect();
  });

  it("dokter melihat peringatan, isian draf sebagai teks formulir, dan pilihan treatment", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 3), "11:00");
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    await unwrap(
      saveEncounterDraft({
        encounterId,
        version: updatedAt.toISOString(),
        draft: { ...emptyDraftInput(), vitals: { ...emptyDraftInput().vitals, weightKg: "72,5", heightCm: "160" } },
      }),
    );

    const detail = await getEncounterForStaff(encounterId);

    expect(detail).toMatchObject({
      status: "DRAF",
      patient: { name: "Pasien Baca", medicalRecordNumber: "SDY-2026-7720", genderLabel: "Perempuan" },
      warnings: { allergies: "Udang", medicalHistory: null, importantNotes: "Takut jarum", paperRecordNumber: "RM-0457", pregnancy: false },
      intake: null,
      trail: null,
    });
    expect(detail!.patient.ageLabel).toMatch(/^\d+ tahun$/);
    expect(detail!.draft.vitals).toMatchObject({ weightKg: "72,5", heightCm: "160", systolic: "" });
    expect(detail!.vitalLines).toEqual(["Berat badan: 72,5 kg", "Tinggi badan: 160 cm", "IMT 28,3"]);
    expect(detail!.options.defaultServiceId).toBe(world.consultationId);
    expect(detail!.options.defaultPerformerId).toBe(world.doctorId);
    expect(detail!.options.services.map((s) => s.id)).toEqual(expect.arrayContaining([world.consultationId, world.treatmentId]));
    expect(detail!.options.performers.map((p) => p.id)).toEqual(expect.arrayContaining([world.doctorId, world.therapistId]));
  });

  it("mencatat 'membuka' paling banyak sekali per 30 menit, dan Super Admin melihat jejaknya", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 3), "12:00");
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    await getEncounterForStaff(encounterId);
    await getEncounterForStaff(encounterId);
    expect(await prisma.auditLog.count({ where: { action: "encounter.view", entityId: encounterId } })).toBe(1);

    actAs("SUPER_ADMIN");
    const detail = await getEncounterForStaff(encounterId);
    expect(detail!.trail!.map((row) => row.actionLabel)).toEqual(expect.arrayContaining(["membuat kunjungan", "membuka"]));
    expect(detail!.trail![0]).toMatchObject({ roleLabel: expect.any(String), actorName: expect.any(String) });
  });

  it("resepsionis ditolak", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 3), "13:00");
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    actAs("RESEPSIONIS");
    await expect(getEncounterForStaff(encounterId)).rejects.toThrow(/forbidden/);
    await expect(listDoctorWorklist()).rejects.toThrow(/forbidden/);
  });

  it("isian kuis kunjungan: siap (dengan hamil dan perlu disetujui), belum diisi, atau versi tidak dikenal", async () => {
    actAs("DOKTER");
    const withIntake = async (time: string, data: { status: "MENUNGGU_DIISI" | "TERISI"; quizVersion: number | null; answers?: object }) => {
      const appointment = await booking(addDaysToDateString(today, 4), time);
      await prisma.intake.create({
        data: {
          appointmentId: appointment.id,
          patientId,
          kind: "LENGKAP",
          purpose: "SLIMMING",
          status: data.status,
          quizVersion: data.quizVersion,
          answers: data.answers,
          submittedAt: data.status === "TERISI" ? new Date() : null,
        },
      });
      const { encounterId } = await unwrap(openEncounter(appointment.id));
      return (await getEncounterForStaff(encounterId))!;
    };

    const pregnant = { ...slimmingNewPatient, health: { ...slimmingNewPatient.health, pregnancy: "YA" } };
    const ready = await withIntake("11:00", { status: "TERISI", quizVersion: 2, answers: pregnant });
    expect(ready.intake).toMatchObject({ state: "ready", needsApproval: true });
    expect(ready.warnings.pregnancy).toBe(true);

    const pending = await withIntake("12:00", { status: "MENUNGGU_DIISI", quizVersion: null });
    expect(pending.intake).toMatchObject({ state: "pending" });

    const unknown = await withIntake("13:00", { status: "TERISI", quizVersion: 9, answers: {} });
    expect(unknown.intake).toMatchObject({ state: "error", message: "Isian dengan kuis versi 9 belum bisa ditampilkan." });
  });

  it("daftar kerja: hari ini menurut WITA, dan catatan tertinggal dari hari sebelumnya", async () => {
    actAs("DOKTER");
    const yesterday = addDaysToDateString(today, -1);

    // 07.30 WITA = 23.30 UTC hari sebelumnya: tetap "hari ini".
    const morning = await booking(today, "07:30");
    const doneToday = await booking(today, "08:00");
    const doneTodayId = await finalized(doneToday.id);
    const confirmedToday = await booking(today, "08:30", "TERKONFIRMASI");
    const lateYesterday = await booking(yesterday, "23:30");
    const oldDraft = await booking(addDaysToDateString(today, -3), "10:00");
    const { encounterId: oldDraftId } = await unwrap(openEncounter(oldDraft.id));
    const doneYesterday = await booking(yesterday, "10:00");
    await finalized(doneYesterday.id);

    const worklist = await listDoctorWorklist();
    const find = (rows: typeof worklist.today, code: string) => rows.find((row) => row.code === code);

    expect(find(worklist.today, morning.code)).toMatchObject({ state: "BELUM", encounterId: null, patientName: "Pasien Baca" });
    expect(find(worklist.today, doneToday.code)).toMatchObject({ state: "FINAL", encounterId: doneTodayId });
    expect(find(worklist.today, confirmedToday.code)).toBeUndefined();
    expect(find(worklist.today, lateYesterday.code)).toBeUndefined();

    expect(find(worklist.unfinished, lateYesterday.code)).toMatchObject({ state: "BELUM" });
    expect(find(worklist.unfinished, oldDraft.code)).toMatchObject({ state: "DRAF", encounterId: oldDraftId });
    expect(find(worklist.unfinished, doneYesterday.code)).toBeUndefined();
    expect(find(worklist.unfinished, morning.code)).toBeUndefined();

    const unfinishedCodes = worklist.unfinished.map((row) => row.code);
    expect(unfinishedCodes.indexOf(oldDraft.code)).toBeLessThan(unfinishedCodes.indexOf(lateYesterday.code));
  });

  it("riwayat: hanya kunjungan final pasien yang sama sebelum kunjungan ini, terbaru di atas", async () => {
    actAs("DOKTER");
    const other = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7721", name: "Pasien Riwayat", whatsapp: HISTORY_WA } })
    ).id;
    const oldest = await finalizedWith(await booking(addDaysToDateString(today, -20), "09:00", "HADIR", other), {
      assessment: "Konsultasi awal",
      vitals: { weightKg: "75" },
    });
    const previous = await finalizedWith(await booking(addDaysToDateString(today, -13), "09:00", "HADIR", other), {
      assessment: "Obesitas derajat 1",
      plan: "Program MAX",
      vitals: { weightKg: "73,3", heightCm: "158", systolic: "130", diastolic: "85" },
    });
    await unwrap(addEncounterAddendum({ encounterId: previous, text: "Tensi diukur ulang 125/80." }));
    const otherDraft = await booking(addDaysToDateString(today, -6), "09:00", "HADIR", other);
    await unwrap(openEncounter(otherDraft.id));
    await finalizedWith(await booking(addDaysToDateString(today, 9), "09:00", "HADIR", other), { assessment: "Kunjungan nanti" });

    const current = await booking(addDaysToDateString(today, 2), "09:00", "HADIR", other);
    const { encounterId } = await unwrap(openEncounter(current.id));
    const detail = (await getEncounterForStaff(encounterId))!;

    expect(detail.history.map((visit) => visit.id)).toEqual([previous, oldest]);
    expect(detail.hasMoreHistory).toBe(false);
    expect(detail.history[0]).toMatchObject({
      assessment: "Obesitas derajat 1",
      plan: "Program MAX",
      branchName: "Cabang Publik Uji",
      authorName: "DOKTER Uji",
      assessmentPreview: "Obesitas derajat 1",
    });
    expect(detail.history[0].vitals).toMatchObject({ weightKg: 73.3, heightCm: 158, systolic: 130, diastolic: 85, pulse: null });
    expect(detail.history[0].vitalLines).toContain("IMT 29,4");
    expect(detail.history[0].addenda).toEqual([expect.objectContaining({ text: "Tensi diukur ulang 125/80." })]);
    // Tinggi diisikan dari kunjungan final terakhir yang punya tinggi (Task 3 plan kunjungan).
    expect(detail.vitals.heightCm).toBe(158);
  });

  it("riwayat maksimal 12 kunjungan, dengan penanda ada yang lebih lama", async () => {
    actAs("DOKTER");
    const routine = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7722", name: "Pasien Rutin", whatsapp: ROUTINE_WA } })
    ).id;
    for (let week = 13; week >= 1; week -= 1) {
      await finalizedWith(await booking(addDaysToDateString(today, -7 * week - 30), "08:00", "HADIR", routine), {
        assessment: `Kontrol minggu ${14 - week}`,
      });
    }
    const current = await booking(addDaysToDateString(today, 5), "08:00", "HADIR", routine);
    const { encounterId } = await unwrap(openEncounter(current.id));
    const detail = (await getEncounterForStaff(encounterId))!;

    expect(detail.history).toHaveLength(12);
    expect(detail.hasMoreHistory).toBe(true);
    expect(detail.history[0].assessment).toBe("Kontrol minggu 13");
  });

  it("persetujuan isian tersedia di halaman kunjungan untuk penulis rekam medis bila isian sudah terisi", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 6), "11:00");
    await prisma.intake.create({
      data: {
        appointmentId: appointment.id,
        patientId,
        kind: "LENGKAP",
        purpose: "SLIMMING",
        status: "TERISI",
        quizVersion: 2,
        answers: slimmingNewPatient,
        submittedAt: new Date(),
      },
    });
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const detail = (await getEncounterForStaff(encounterId))!;

    expect(detail.approval).toMatchObject({ state: "ready", patientId, current: { allergies: "Udang" } });
    expect(detail.approval!.prefill.allergies).toContain("Amoxicillin");
    expect(detail.intake).toMatchObject({ state: "ready", kind: "LENGKAP", purposeLabel: "Slimming" });

    const bare = await booking(addDaysToDateString(today, 6), "12:00");
    const { encounterId: bareId } = await unwrap(openEncounter(bare.id));
    expect((await getEncounterForStaff(bareId))!.approval).toBeNull();
  });

  it("membuka kunjungan juga mencatat pembukaan rekam medis pasien, paling banyak sekali per 30 menit", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 6), "13:00");
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    await prisma.auditLog.deleteMany({ where: { action: "patient.view-records", entityId: patientId } });

    await getEncounterForStaff(encounterId);
    await getEncounterForStaff(encounterId);
    expect(await prisma.auditLog.count({ where: { action: "patient.view-records", entityId: patientId } })).toBe(1);
  });
});
