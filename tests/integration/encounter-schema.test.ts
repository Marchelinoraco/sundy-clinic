// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isRecordLockedError } from "@/server/db-errors";
import { purgeEncounters } from "../purge-encounters";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

const SLUG = "skema-kunjungan-uji";
const PATIENT_WA = "6281200007700";

describe("skema kunjungan dan trigger penguncian", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let slot = 0;

  /** Booking HADIR baru pada jam berikutnya (06.00, 06.30, …) agar tidak bertindihan. */
  async function attended() {
    slot += 1;
    const minutes = 6 * 60 + slot * 30;
    const startAt = at(date, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    return prisma.appointment.create({
      data: {
        code: `SKM-${slot}`,
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

  async function encounter(status: "DRAF" | "FINAL", assessment: string | null = "Obesitas") {
    const appointment = await attended();
    const created = await prisma.encounter.create({
      data: {
        appointmentId: appointment.id,
        createdById: world.doctorId,
        createdByName: "dr. Uji",
        assessment,
        treatments: {
          create: [{ serviceId: world.treatmentId, serviceName: "Facial Uji", performerId: world.therapistId, performerName: "Terapis Uji" }],
        },
      },
    });
    if (status === "FINAL") {
      await prisma.encounter.update({
        where: { id: created.id },
        data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
      });
    }
    return created.id;
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7700", name: "Pasien Skema", whatsapp: PATIENT_WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("kunjungan final tidak bisa diubah, dikembalikan ke draf, atau dihapus lewat SQL langsung", async () => {
    const id = await encounter("FINAL");

    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Encounter" SET "assessment" = 'diubah' WHERE "id" = $1`, id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Encounter" SET "status" = 'DRAF' WHERE "id" = $1`, id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Encounter" WHERE "id" = $1`, id)).rejects.toThrow(
      /rekam_medis_terkunci/,
    );

    const row = await prisma.encounter.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "FINAL", assessment: "Obesitas" });
  });

  it("galat trigger dari kueri Prisma biasa dikenali isRecordLockedError", async () => {
    const id = await encounter("FINAL");
    const error = await prisma.encounter.update({ where: { id }, data: { plan: "diubah" } }).catch((e: unknown) => e);
    expect(isRecordLockedError(error)).toBe(true);
    expect(isRecordLockedError(new Error("galat lain"))).toBe(false);
  });

  it("treatment milik kunjungan final tidak bisa ditambah, diubah, atau dihapus", async () => {
    const id = await encounter("FINAL");
    const treatment = await prisma.encounterTreatment.findFirstOrThrow({ where: { encounterId: id } });

    await expect(
      prisma.encounterTreatment.create({
        data: { encounterId: id, serviceId: world.treatmentId, serviceName: "Facial Uji", performerId: world.therapistId, performerName: "Terapis Uji" },
      }),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "EncounterTreatment" SET "area" = 'Dahi' WHERE "id" = $1`, treatment.id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "EncounterTreatment" WHERE "id" = $1`, treatment.id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    expect(await prisma.encounterTreatment.count({ where: { encounterId: id } })).toBe(1);
  });

  it("draf boleh diubah, lalu dibuang beserta treatment-nya", async () => {
    const id = await encounter("DRAF");
    await prisma.encounter.update({ where: { id }, data: { plan: "Kontrol 1 minggu" } });
    await prisma.encounterTreatment.updateMany({ where: { encounterId: id }, data: { area: "Perut" } });

    await prisma.encounter.delete({ where: { id } });
    expect(await prisma.encounterTreatment.count({ where: { encounterId: id } })).toBe(0);
  });

  it("adendum hanya untuk kunjungan final, dan tidak pernah bisa diubah atau dihapus", async () => {
    const draftId = await encounter("DRAF");
    await expect(
      prisma.encounterAddendum.create({ data: { encounterId: draftId, text: "Koreksi", authorId: world.doctorId, authorName: "dr. Uji" } }),
    ).rejects.toThrow(/rekam_medis_terkunci/);

    const finalId = await encounter("FINAL");
    const addendum = await prisma.encounterAddendum.create({
      data: { encounterId: finalId, text: "Tensi diukur ulang: 118/78.", authorId: world.doctorId, authorName: "dr. Uji" },
    });
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "EncounterAddendum" SET "text" = 'diubah' WHERE "id" = $1`, addendum.id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "EncounterAddendum" WHERE "id" = $1`, addendum.id)).rejects.toThrow(
      /rekam_medis_terkunci/,
    );
    await expect(
      prisma.encounterAddendum.create({ data: { encounterId: finalId, text: "   ", authorId: world.doctorId, authorName: "dr. Uji" } }),
    ).rejects.toThrow();
  });

  it("TRUNCATE ditolak untuk ketiga tabel", async () => {
    await encounter("FINAL");
    for (const table of ["EncounterAddendum", "EncounterTreatment", "Encounter"]) {
      await expect(prisma.$executeRawUnsafe(`TRUNCATE "${table}" CASCADE`)).rejects.toThrow(/rekam_medis_terkunci/);
    }
  });

  it("CHECK menolak tanda vital di luar rentang, tensi tidak berpasangan, dan final tanpa penilaian", async () => {
    const make = async (data: Record<string, unknown>) => {
      const appointment = await attended();
      return prisma.encounter.create({
        data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji", ...data },
      });
    };
    await expect(make({ systolic: 261, diastolic: 80 })).rejects.toThrow();
    await expect(make({ systolic: 120 })).rejects.toThrow();
    await expect(make({ systolic: 120, diastolic: 120 })).rejects.toThrow();
    await expect(make({ temperatureC: 42.1 })).rejects.toThrow();
    await expect(make({ weightKg: 19.9 })).rejects.toThrow();
    await expect(make({ systolic: 120, diastolic: 80, temperatureC: 36.5, weightKg: 72.5, heightCm: 160, waistCm: 88, pulse: 80 })).resolves.toBeTruthy();

    const blank = await encounter("DRAF", "   ");
    await expect(
      prisma.encounter.update({
        where: { id: blank },
        data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
      }),
    ).rejects.toThrow();
    const unsigned = await encounter("DRAF");
    await expect(prisma.encounter.update({ where: { id: unsigned }, data: { status: "FINAL" } })).rejects.toThrow();
  });

  it("purgeEncounters mengosongkan kunjungan uji lalu menyalakan trigger lagi", async () => {
    await encounter("FINAL");
    await purgeEncounters(prisma);
    expect(await prisma.encounter.count()).toBe(0);

    const id = await encounter("FINAL");
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Encounter" WHERE "id" = $1`, id)).rejects.toThrow(
      /rekam_medis_terkunci/,
    );
  });
});
