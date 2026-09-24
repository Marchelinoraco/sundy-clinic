// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { unwrap } from "./unwrap";
import {
  cancelAppointment,
  createAppointment,
  listAppointments,
  markAttended,
  rescheduleAppointment,
  verifyAppointment,
} from "@/server/appointment";

const { actor } = vi.hoisted(() => ({
  actor: {
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN" as const,
    email: "uji@sundy.test",
  },
}));

vi.mock("@/server/session", () => ({ requireCapability: vi.fn().mockResolvedValue(actor) }));

describe("server action appointment", () => {
  let patientId: string;
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-7777" } });
    await prisma.staff.deleteMany({ where: { slug: "staf-appointment-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-appointment-uji" } });

    const patient = await prisma.patient.create({
      data: {
        medicalRecordNumber: "SDY-2026-7777",
        name: "Pasien Appointment",
        whatsapp: "627777",
      },
    });
    const staff = await prisma.staff.create({
      data: { slug: "staf-appointment-uji", name: "Staf Appointment", role: "DOKTER" },
    });
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-appointment-uji",
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
    // beforeEach hanya membersihkan sebelum giliran berikutnya, bukan
    // setelah giliran terakhir — tanpa ini "cabang-appointment-uji" bocor
    // ke berkas lain yang berjalan sesudahnya.
    await prisma.appointment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-7777" } });
    await prisma.staff.deleteMany({ where: { slug: "staf-appointment-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-appointment-uji" } });
    await prisma.$disconnect();
  });

  it("membuat janji temu dengan kode booking dan status awal MENUNGGU_KONFIRMASI", async () => {
    const appt = await unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "TELEPON",
      }),
    );

    expect(appt.code).toMatch(/^SDY-/);
    expect(appt.status).toBe("MENUNGGU_KONFIRMASI");
    expect(appt.source).toBe("TELEPON");
  });

  it("menolak janji temu kedua yang bertindihan dengan pesan yang dapat dipahami", async () => {
    await unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "TELEPON",
      }),
    );

    // Bukan galat SQL mentah — pesan yang admin bisa mengerti.
    await expect(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "TELEPON",
      }),
    ).resolves.toEqual({ ok: false, error: expect.stringMatching(/slot baru saja terisi/i) });
  });

  it("mencatat jejak audit saat janji temu dibuat", async () => {
    const appt = await unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "WALK_IN",
      }),
    );

    const audit = await prisma.auditLog.findFirst({ where: { entityId: appt.id } });
    expect(audit?.action).toBe("appointment.create");
  });

  it("memindahkan jadwal tanpa membatalkan booking lama", async () => {
    const appt = await unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "WALK_IN",
      }),
    );

    const moved = await unwrap(
      rescheduleAppointment(appt.id, {
        startAt: new Date("2026-10-05T08:00:00Z"),
        endAt: new Date("2026-10-05T08:30:00Z"),
      }),
    );

    expect(moved.id).toBe(appt.id);
    expect(moved.startAt.toISOString()).toBe("2026-10-05T08:00:00.000Z");
  });

  it("menjalankan alur status: verifikasi -> hadir", async () => {
    const appt = await unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "WALK_IN",
      }),
    );

    const verified = await unwrap(verifyAppointment(appt.id));
    expect(verified.status).toBe("TERKONFIRMASI");

    const attended = await unwrap(markAttended(appt.id));
    expect(attended.status).toBe("HADIR");
  });

  it("membatalkan janji temu tanpa menghapus baris, dan membuka kembali slotnya", async () => {
    const appt = await unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "WALK_IN",
      }),
    );

    const cancelled = await unwrap(cancelAppointment(appt.id, "Pasien membatalkan"));
    expect(cancelled.status).toBe("DIBATALKAN");
    expect(await prisma.appointment.count({ where: { id: appt.id } })).toBe(1);

    // Slot yang sama sekarang bisa dipakai booking lain — membuktikan
    // pembatalan benar-benar melepas kuncinya di exclusion constraint.
    const rebooked = await unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "WALK_IN",
      }),
    );
    expect(rebooked.status).toBe("MENUNGGU_KONFIRMASI");
  });

  it("mendaftar janji temu dengan filter cabang dan status", async () => {
    await unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "WALK_IN",
      }),
    );

    const list = await listAppointments({ branchId, status: "MENUNGGU_KONFIRMASI" });
    expect(list).toHaveLength(1);
    expect(list[0].patient.name).toBe("Pasien Appointment");
  });
});
