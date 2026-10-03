// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isUniqueViolation } from "@/server/db-errors";
import { purgeEncounters } from "../purge-encounters";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

const SLUG = "skema-check-in-uji";
const WAS = ["6281200008800", "6281200008801"];

describe("skema check-in: NIK, pasien rangkap, dan kunci food recall", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let otherId: string;
  let slot = 0;

  async function attended() {
    slot += 1;
    const minutes = 6 * 60 + slot * 30;
    const startAt = at(date, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    return prisma.appointment.create({
      data: {
        code: `CIS-${slot}`,
        type: "KONSULTASI",
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

  async function finalEncounter(appointmentId: string) {
    const created = await prisma.encounter.create({
      data: { appointmentId, createdById: world.doctorId, createdByName: "dr. Uji", assessment: "Obesitas" },
    });
    await prisma.encounter.update({
      where: { id: created.id },
      data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, WAS);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-8800", name: "Pasien Skema CI", whatsapp: WAS[0] } })).id;
    otherId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-8801", name: "Pasien Lain CI", whatsapp: WAS[1] } })).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, WAS);
    await prisma.$disconnect();
  });

  it("NIK di basis data hanya tepat 16 angka", async () => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Patient" SET "nik" = '123' WHERE "id" = $1`, patientId),
    ).rejects.toThrow(/patient_nik_format/);
    await prisma.patient.update({ where: { id: patientId }, data: { nik: "7171015705900001" } });
    await prisma.patient.update({ where: { id: patientId }, data: { nik: null } });
  });

  it("NIK dan alasan belum ada NIK tidak terisi bersamaan", async () => {
    await expect(
      prisma.patient.update({ where: { id: patientId }, data: { nik: "7171015705900001", nikMissingReason: "LUPA_KTP" } }),
    ).rejects.toThrow(/patient_nik_or_reason/);
  });

  it("satu NIK hanya untuk satu pasien", async () => {
    await prisma.patient.update({ where: { id: patientId }, data: { nik: "7171015705900009" } });
    const error = await prisma.patient
      .update({ where: { id: otherId }, data: { nik: "7171015705900009" } })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(error)).toBe(true);
    await prisma.patient.update({ where: { id: patientId }, data: { nik: null } });
  });

  it("pasien tidak bisa ditandai rangkap dari dirinya sendiri", async () => {
    await expect(
      prisma.patient.update({ where: { id: patientId }, data: { mergedIntoId: patientId } }),
    ).rejects.toThrow(/patient_not_merged_into_self/);
  });

  it("food recall bisa diubah selama catatan dokter masih draf", async () => {
    const appointment = await attended();
    const recall = await prisma.foodRecall.create({ data: { appointmentId: appointment.id, recallDate: new Date(`${date}T00:00:00Z`) } });
    await prisma.encounter.create({ data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji" } });
    const updated = await prisma.foodRecall.update({ where: { id: recall.id }, data: { status: "DIISI" } });
    expect(updated.status).toBe("DIISI");
  });

  it("food recall terkunci setelah catatan dokter final", async () => {
    const appointment = await attended();
    const recall = await prisma.foodRecall.create({ data: { appointmentId: appointment.id, recallDate: new Date(`${date}T00:00:00Z`) } });
    await finalEncounter(appointment.id);

    await expect(prisma.foodRecall.update({ where: { id: recall.id }, data: { status: "DIISI" } })).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "FoodRecall" WHERE "id" = $1`, recall.id)).rejects.toThrow(/rekam_medis_terkunci/);

    const late = await attended();
    await finalEncounter(late.id);
    await expect(
      prisma.foodRecall.create({ data: { appointmentId: late.id, recallDate: new Date(`${date}T00:00:00Z`) } }),
    ).rejects.toThrow(/rekam_medis_terkunci/);
  });

  it("purgeEncounters ikut mengosongkan food recall uji", async () => {
    await purgeEncounters(prisma);
    expect(await prisma.foodRecall.count()).toBe(0);
  });
});
