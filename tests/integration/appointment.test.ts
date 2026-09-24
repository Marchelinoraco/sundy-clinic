// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { unwrap } from "./unwrap";
import {
  cancelAppointment,
  createAppointment,
  listAppointments,
  markAttended,
  markNoShow,
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
  let therapistId: string;
  let doctorOnlyServiceId: string;

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-7777" } });
    await prisma.staff.deleteMany({ where: { slug: "staf-appointment-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-appointment-uji" } });
    await prisma.staff.deleteMany({ where: { slug: "terapis-appointment-uji" } });
    await prisma.serviceCategory.deleteMany({ where: { slug: "kategori-appointment-uji" } });

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
    const therapist = await prisma.staff.create({
      data: { slug: "terapis-appointment-uji", name: "Terapis Appointment", role: "TERAPIS" },
    });
    const category = await prisma.serviceCategory.create({
      data: { slug: "kategori-appointment-uji", name: "Kategori Uji" },
    });
    const doctorOnly = await prisma.service.create({
      data: {
        slug: "layanan-dokter-uji",
        name: "Botox Uji",
        promoPrice: 1,
        durationMin: 60,
        requiresDoctor: true,
        categoryId: category.id,
      },
    });
    patientId = patient.id;
    staffId = staff.id;
    branchId = branch.id;
    therapistId = therapist.id;
    doctorOnlyServiceId = doctorOnly.id;
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
    await prisma.staff.deleteMany({ where: { slug: "terapis-appointment-uji" } });
    await prisma.serviceCategory.deleteMany({ where: { slug: "kategori-appointment-uji" } });
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

  it("menolak layanan khusus dokter yang dijadwalkan ke terapis", async () => {
    const result = await createAppointment({
      patientId,
      branchId,
      staffId: therapistId,
      serviceId: doctorOnlyServiceId,
      type: "TREATMENT",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T08:00:00Z"),
      source: "TELEPON",
    });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/dokter/i) });
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("menolak konsultasi yang dijadwalkan ke terapis", async () => {
    const result = await createAppointment({
      patientId,
      branchId,
      staffId: therapistId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "TELEPON",
    });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/dokter/i) });
  });

  it("menolak booking di cabang yang belum aktif", async () => {
    await prisma.branch.update({ where: { id: branchId }, data: { status: "SEGERA_HADIR" } });
    const result = await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "TELEPON",
    });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/cabang/i) });
  });

  it("menolak jam selesai yang tidak setelah jam mulai", async () => {
    const result = await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:30:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "TELEPON",
    });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/jam selesai/i) });
  });

  async function book(startAt: string, endAt: string) {
    return unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        source: "TELEPON",
      }),
    );
  }

  it("tidak menghidupkan kembali booking yang sudah dibatalkan", async () => {
    const appt = await book("2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    await unwrap(cancelAppointment(appt.id));

    const result = await markAttended(appt.id);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/dibatalkan/i) });
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(row.status).toBe("DIBATALKAN");
  });

  it("menolak verifikasi ganda, misal dua admin mengklik bersamaan", async () => {
    const appt = await book("2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    const [first, second] = await Promise.all([
      verifyAppointment(appt.id),
      verifyAppointment(appt.id),
    ]);
    const outcomes = [first.ok, second.ok].sort();
    expect(outcomes).toEqual([false, true]);
    expect(await prisma.auditLog.count({ where: { action: "appointment.verify" } })).toBe(1);
  });

  it("tidak membatalkan pasien yang sudah hadir", async () => {
    const appt = await book("2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    await unwrap(markAttended(appt.id));
    const result = await cancelAppointment(appt.id);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/hadir/i) });
  });

  it("menandai tidak hadir hanya dari status aktif", async () => {
    const appt = await book("2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    expect((await unwrap(markNoShow(appt.id))).status).toBe("TIDAK_HADIR");
    const again = await markAttended(appt.id);
    expect(again.ok).toBe(false);
  });

  it("tidak menjadwal ulang booking yang sudah dibatalkan", async () => {
    const appt = await book("2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    await unwrap(cancelAppointment(appt.id));
    const result = await rescheduleAppointment(appt.id, {
      startAt: new Date("2026-10-05T08:00:00Z"),
      endAt: new Date("2026-10-05T08:30:00Z"),
    });
    expect(result.ok).toBe(false);
  });

  it("memfilter per tanggal WITA, bukan tanggal UTC", async () => {
    // 07.00 WITA tanggal 5 = 23.00 UTC tanggal 4 → termasuk tanggal 5.
    await book("2026-10-04T23:00:00Z", "2026-10-04T23:30:00Z");
    // 01.00 WITA tanggal 6 = 17.00 UTC tanggal 5 → BUKAN tanggal 5.
    await book("2026-10-05T17:00:00Z", "2026-10-05T17:30:00Z");

    const list = await listAppointments({ date: "2026-10-05" });
    expect(list.map((a) => a.startAt.toISOString())).toEqual(["2026-10-04T23:00:00.000Z"]);
  });

  it("menolak jadwal ulang ke jam yang sudah terisi dengan pesan yang dapat dipahami", async () => {
    await book("2026-10-05T08:00:00Z", "2026-10-05T08:30:00Z");
    const appt = await book("2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    const result = await rescheduleAppointment(appt.id, {
      startAt: new Date("2026-10-05T08:00:00Z"),
      endAt: new Date("2026-10-05T08:30:00Z"),
    });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/slot baru saja terisi/i) });
  });
});
