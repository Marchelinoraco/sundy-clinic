// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { can } from "@/lib/permissions";
import {
  approveIntakeToPatient,
  createPatientFromIntake,
  getIntakeForStaff,
  matchPatient,
  type IntakeDetail,
} from "@/server/intake";
import { holdSlot, submitSiteBooking } from "@/server/public-booking";
import { requireCapability } from "@/server/session";
import { aestheticNewPatient, newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));
vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "setujui-isian-uji";
const PATIENT_WA = "6281234567890"; // newPatientIdentity yang sudah dinormalkan
const OTHER_WA = "6281200006650";

describe("setujui isian ke data pasien", () => {
  let world: BookingWorld;
  let date: string;
  let slot = -1;

  /** Meniru requireCapability sungguhan: staf tanpa hak itu ditolak. staffId harus Staff nyata (FK reviewedBy). */
  function actAs(role: StaffRole) {
    vi.mocked(requireCapability).mockImplementation(async (capability) => {
      if (!can(role, capability)) throw new Error(`forbidden: ${capability}`);
      return { userId: "u1", staffId: world.doctorId, name: `${role} Uji`, role, email: "uji@sundy.test" };
    });
  }

  /** Booking situs yang sudah diisi pasien; `match` membuat pasien baru dari isiannya. */
  async function siteIntake(answers: QuizAnswers = slimmingNewPatient, match = true) {
    // Slot 30 menit mulai 11.00: jadwal uji 11.00–19.00 memuat 16 booking.
    slot += 1;
    const minutes = 11 * 60 + slot * 30;
    const startAt = at(date, `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`).toISOString();
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
        answers,
        identity: newPatientIdentity,
        consentData: true,
        consentFee: true,
        website: "",
      }),
    );
    const intake = await prisma.intake.findFirstOrThrow({
      where: { submissionKey: token },
      select: { id: true, appointmentId: true },
    });
    const patientId = match ? (await unwrap(createPatientFromIntake(intake.appointmentId))).patientId : null;
    return { intakeId: intake.id, appointmentId: intake.appointmentId, patientId };
  }

  function ready(detail: IntakeDetail | null) {
    if (detail?.approval?.state !== "ready") throw new Error(`approval: ${JSON.stringify(detail?.approval)}`);
    return detail.approval;
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, OTHER_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, OTHER_WA]);
    await prisma.$disconnect();
  });

  it("dokter melihat usulan berdampingan dengan catatan pasien saat ini", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    await prisma.patient.update({ where: { id: patientId! }, data: { allergies: "Udang" } });

    const approval = ready(await getIntakeForStaff(intakeId));

    expect(approval.current).toEqual({ allergies: "Udang", medicalHistory: null });
    expect(approval.proposed.allergies).toBe("Amoxicillin (gatal-gatal)");
    expect(approval.prefill.allergies).toBe("Udang\nAmoxicillin (gatal-gatal)");
    expect(approval.prefill.medicalHistory).toContain("Darah tinggi: Amlodipine 5 mg, 1× sehari");
  });

  it("menyimpan suntingan dokter, menandai isian diperiksa, dan mencatat audit tanpa isi klinis", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const approval = ready(await getIntakeForStaff(intakeId));

    await unwrap(
      approveIntakeToPatient({
        intakeId,
        allergies: "Amoxicillin (gatal-gatal)",
        medicalHistory: "Darah tinggi: Amlodipine 5 mg, 1× sehari",
        patientVersion: approval.patientVersion,
      }),
    );

    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } });
    expect(patient).toMatchObject({
      allergies: "Amoxicillin (gatal-gatal)",
      medicalHistory: "Darah tinggi: Amlodipine 5 mg, 1× sehari",
      name: "Siti Rahayu",
    });
    const intake = await prisma.intake.findUniqueOrThrow({ where: { id: intakeId } });
    expect(intake.status).toBe("DIPERIKSA");
    expect(intake.reviewedByStaffId).toBe(world.doctorId);
    expect(intake.reviewedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.approve-intake", entityId: patientId! } });
    expect(audit.summary).toContain(patient.medicalRecordNumber);
    expect(audit.summary).not.toMatch(/Amoxicillin|Amlodipine/);

    const detail = await getIntakeForStaff(intakeId);
    expect(detail!.review?.reviewerName).toBe("dr. Uji Publik");
  });

  it("isian yang sudah diperiksa: isi awal sama dengan catatan pasien, usulan tetap ditampilkan", async () => {
    actAs("DOKTER");
    const { intakeId } = await siteIntake();
    const first = ready(await getIntakeForStaff(intakeId));
    await unwrap(
      approveIntakeToPatient({
        intakeId,
        allergies: "Amoxicillin (gatal-gatal)",
        medicalHistory: "Darah tinggi: Amlodipine 5 mg, 1× sehari",
        patientVersion: first.patientVersion,
      }),
    );

    const again = ready(await getIntakeForStaff(intakeId));

    expect(again.prefill.medicalHistory).toBe("Darah tinggi: Amlodipine 5 mg, 1× sehari");
    expect(again.proposed.medicalHistory).toContain("Diabetes: tidak minum obat");
  });

  it("menolak simpan dari halaman lama agar persetujuan yang lebih baru tidak tertimpa", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const stale = ready(await getIntakeForStaff(intakeId)).patientVersion;
    await unwrap(approveIntakeToPatient({ intakeId, allergies: "Baru", medicalHistory: "Baru", patientVersion: stale }));

    const result = await approveIntakeToPatient({ intakeId, allergies: "Lama", medicalHistory: "Lama", patientVersion: stale });

    expect(result).toEqual({ ok: false, error: "Data pasien baru saja berubah. Muat ulang halaman lalu periksa lagi." });
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({ allergies: "Baru" });
  });

  it("kolom yang dikosongkan atau hanya berisi spasi tersimpan sebagai kosong", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake(aestheticNewPatient);
    const approval = ready(await getIntakeForStaff(intakeId));

    await unwrap(approveIntakeToPatient({ intakeId, allergies: "   ", medicalHistory: "", patientVersion: approval.patientVersion }));

    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({
      allergies: null,
      medicalHistory: null,
    });
  });

  it("menolak teks lebih dari 2.000 karakter tanpa mengubah apa pun", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const approval = ready(await getIntakeForStaff(intakeId));

    const result = await approveIntakeToPatient({
      intakeId,
      allergies: "x".repeat(2001),
      medicalHistory: "",
      patientVersion: approval.patientVersion,
    });

    expect(result).toEqual({ ok: false, error: "Teks alergi atau riwayat penyakit terlalu panjang (maks. 2.000 karakter)." });
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({ allergies: null });
    expect((await prisma.intake.findUniqueOrThrow({ where: { id: intakeId } })).status).toBe("TERISI");
  });

  it("booking yang belum dicocokkan: minta dicocokkan dulu, dan aksinya ditolak", async () => {
    actAs("DOKTER");
    const { intakeId } = await siteIntake(slimmingNewPatient, false);

    expect((await getIntakeForStaff(intakeId))!.approval).toEqual({ state: "needs-match" });
    expect(
      await approveIntakeToPatient({ intakeId, allergies: "A", medicalHistory: "B", patientVersion: new Date().toISOString() }),
    ).toEqual({ ok: false, error: "Cocokkan booking ini dengan pasien dulu." });
  });

  it("resepsionis tidak menerima data persetujuan dan tidak bisa memanggil aksinya", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const version = ready(await getIntakeForStaff(intakeId)).patientVersion;

    actAs("RESEPSIONIS");
    const detail = await getIntakeForStaff(intakeId);
    expect(detail!.approval).toBeNull();
    expect(JSON.stringify(detail)).not.toMatch(/Amoxicillin|Amlodipine/);
    await expect(
      approveIntakeToPatient({ intakeId, allergies: "A", medicalHistory: "B", patientVersion: version }),
    ).rejects.toThrow("forbidden");
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({ allergies: null });
  });

  it("setelah disetujui, pasien booking tidak bisa diganti ke pasien lain", async () => {
    actAs("DOKTER");
    const { intakeId, appointmentId, patientId } = await siteIntake();
    const approval = ready(await getIntakeForStaff(intakeId));
    await unwrap(approveIntakeToPatient({ intakeId, allergies: "Amoxicillin", medicalHistory: "", patientVersion: approval.patientVersion }));
    const other = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6650", name: "Saudara Pasien", whatsapp: OTHER_WA },
    });
    const refusal = {
      ok: false,
      error: "Isian booking ini sudah disetujui dokter ke data pasien, jadi pasiennya tidak bisa diganti lagi.",
    };

    expect(await matchPatient(appointmentId, other.id)).toEqual(refusal);
    expect(await createPatientFromIntake(appointmentId)).toEqual(refusal);
    expect(await prisma.intake.findUniqueOrThrow({ where: { id: intakeId } })).toMatchObject({ patientId });
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).toMatchObject({ patientId });
  });

  it("menolak persetujuan bila pasien booking diganti di tengah jalan", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const approval = ready(await getIntakeForStaff(intakeId));
    const other = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6651", name: "Saudara Lain", whatsapp: OTHER_WA },
    });
    // Admin mengganti pasien tepat setelah aksi membaca isian, sebelum transaksinya berjalan.
    const read = prisma.intake.findUnique.bind(prisma.intake);
    const findUnique = vi.spyOn(prisma.intake, "findUnique").mockImplementationOnce((async (args: never) => {
      const row = await read(args);
      await prisma.intake.update({ where: { id: intakeId }, data: { patientId: other.id } });
      return row;
    }) as never);
    try {
      const result = await approveIntakeToPatient({
        intakeId,
        allergies: "Amoxicillin",
        medicalHistory: "",
        patientVersion: approval.patientVersion,
      });

      expect(result).toEqual({ ok: false, error: "Pasien booking ini baru saja diganti. Muat ulang halaman lalu periksa lagi." });
      expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({ allergies: null });
      expect((await prisma.intake.findUniqueOrThrow({ where: { id: intakeId } })).status).toBe("TERISI");
    } finally {
      findUnique.mockRestore();
    }
  });
});

