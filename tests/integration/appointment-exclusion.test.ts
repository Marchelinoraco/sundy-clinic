// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("exclusion constraint Appointment", () => {
  let patientId: string;
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-8888" } });
    await prisma.staff.deleteMany({ where: { slug: { startsWith: "staf-exclusion-uji" } } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-exclusion-uji" } });

    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-8888", name: "Pasien Exclusion", whatsapp: "628888" },
    });
    const staff = await prisma.staff.create({
      data: { slug: "staf-exclusion-uji", name: "Staf Exclusion", role: "DOKTER" },
    });
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-exclusion-uji",
        name: "Cabang Uji",
        address: "Alamat",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });
    patientId = patient.id;
    staffId = staff.id;
    branchId = branch.id;
  });

  afterAll(async () => {
    // Sama seperti schedule.test.ts: beforeEach hanya membersihkan sebelum
    // giliran berikutnya, bukan setelah giliran terakhir. Tanpa ini,
    // "cabang-exclusion-uji" bocor ke berkas lain yang berjalan sesudahnya.
    await prisma.appointment.deleteMany();
    await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-8888" } });
    await prisma.staff.deleteMany({ where: { slug: { startsWith: "staf-exclusion-uji" } } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-exclusion-uji" } });
    await prisma.$disconnect();
  });

  async function insertAppointment(
    code: string,
    startAt: string,
    endAt: string,
    status = "TERKONFIRMASI",
  ) {
    return prisma.$executeRawUnsafe(
      `INSERT INTO "Appointment"
        (id, code, "branchId", "staffId", "patientId", type, "startAt", "endAt", status, source, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'KONSULTASI', $5::timestamptz, $6::timestamptz, $7, 'WALK_IN', now(), now())`,
      code,
      branchId,
      staffId,
      patientId,
      startAt,
      endAt,
      status,
    );
  }

  it("mengizinkan dua booking pada staf yang sama tanpa tindihan waktu", async () => {
    await insertAppointment("SDY-AAA1", "2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    await insertAppointment("SDY-AAA2", "2026-10-05T07:30:00Z", "2026-10-05T08:00:00Z");

    const count = await prisma.appointment.count({ where: { staffId } });
    expect(count).toBe(2);
  });

  it("menolak dua booking pada staf yang sama dengan waktu bertindihan sebagian", async () => {
    await insertAppointment("SDY-BBB1", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z");

    // Treatment 15.00-16.00 WITA sudah ada. Konsultasi 15.30 WITA bertindihan
    // meski waktu mulainya berbeda — persis kasus yang membatalkan batasan
    // unik pada v1.3 PRD.
    await expect(
      insertAppointment("SDY-BBB2", "2026-10-05T07:30:00Z", "2026-10-05T08:00:00Z"),
    ).rejects.toThrow();

    const count = await prisma.appointment.count({ where: { staffId } });
    expect(count).toBe(1);
  });

  it("mengizinkan booking bertindihan bila salah satunya berstatus DIBATALKAN", async () => {
    await insertAppointment("SDY-CCC1", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z", "DIBATALKAN");
    await insertAppointment("SDY-CCC2", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z", "TERKONFIRMASI");

    const count = await prisma.appointment.count({ where: { staffId } });
    expect(count).toBe(2);
  });

  it("menolak tindihan pada staf yang sama walau cabangnya berbeda", async () => {
    const otherBranch = await prisma.branch.create({
      data: {
        slug: "cabang-exclusion-uji-2",
        name: "Cabang Uji 2",
        address: "Alamat 2",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });

    await insertAppointment("SDY-DDD1", "2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Appointment"
          (id, code, "branchId", "staffId", "patientId", type, "startAt", "endAt", status, source, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'KONSULTASI', $5::timestamptz, $6::timestamptz, 'TERKONFIRMASI', 'WALK_IN', now(), now())`,
        "SDY-DDD2",
        otherBranch.id,
        staffId,
        patientId,
        "2026-10-05T07:00:00Z",
        "2026-10-05T07:30:00Z",
      ),
    ).rejects.toThrow();

    await prisma.branch.delete({ where: { id: otherBranch.id } });
  });

  it("mengizinkan dokter dan terapis memakai jam yang sama — jadwal milik tenaga, bukan klinik", async () => {
    // PRD F4a: konsultasi dr. Diane 15.00 dan facial terapis 15.00–16.00
    // berjalan paralel. Exclusion constraint dikunci per staffId, bukan per
    // cabang atau per klinik.
    const therapist = await prisma.staff.create({
      data: { slug: "staf-exclusion-uji-terapis", name: "Terapis Exclusion", role: "TERAPIS" },
    });

    await insertAppointment("SDY-EEE1", "2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Appointment"
        (id, code, "branchId", "staffId", "patientId", type, "startAt", "endAt", status, source, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'TREATMENT', $5::timestamptz, $6::timestamptz, 'TERKONFIRMASI', 'WALK_IN', now(), now())`,
      "SDY-EEE2",
      branchId,
      therapist.id,
      patientId,
      "2026-10-05T07:00:00Z",
      "2026-10-05T08:00:00Z",
    );

    expect(await prisma.appointment.count({ where: { branchId } })).toBe(2);
  });
});
