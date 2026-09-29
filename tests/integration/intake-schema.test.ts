// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";

const SLUG = "skema-isian-uji";

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-6601" } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("skema pendaftaran pasien", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let hour = 0;

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Skema", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Skema",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-6601", name: "Pasien Skema", whatsapp: "6281200006601" },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // Setiap booking di jam berbeda agar exclusion constraint tidak ikut campur.
  function booking(input: {
    patientId: string | null;
    source: BookingSource;
    status?: AppointmentStatus;
  }) {
    hour += 1;
    return prisma.appointment.create({
      data: {
        code: `SKEMA-${hour}`,
        type: "KONSULTASI",
        startAt: new Date(Date.UTC(2031, 0, 6, hour)),
        endAt: new Date(Date.UTC(2031, 0, 6, hour, 30)),
        source: input.source,
        status: input.status ?? "MENUNGGU_KONFIRMASI",
        branchId,
        staffId,
        patientId: input.patientId,
      },
    });
  }

  it("menerima booking situs tanpa pasien selama menunggu konfirmasi", async () => {
    const created = await booking({ patientId: null, source: "SITUS" });
    expect(created.patientId).toBeNull();
  });

  it("menolak booking admin tanpa pasien", async () => {
    await expect(booking({ patientId: null, source: "WHATSAPP" })).rejects.toThrow();
  });

  it("menolak booking situs tanpa pasien yang langsung terkonfirmasi", async () => {
    await expect(
      booking({ patientId: null, source: "SITUS", status: "TERKONFIRMASI" }),
    ).rejects.toThrow();
  });

  it("menolak verifikasi booking situs yang belum dicocokkan", async () => {
    const created = await booking({ patientId: null, source: "SITUS" });
    await expect(
      prisma.appointment.update({ where: { id: created.id }, data: { status: "TERKONFIRMASI" } }),
    ).rejects.toThrow();
  });

  it("mengizinkan pembatalan dan kedaluwarsa booking situs yang belum dicocokkan", async () => {
    const first = await booking({ patientId: null, source: "SITUS" });
    const second = await booking({ patientId: null, source: "SITUS" });
    await prisma.appointment.update({ where: { id: first.id }, data: { status: "DIBATALKAN" } });
    await prisma.appointment.update({ where: { id: second.id }, data: { status: "KEDALUWARSA" } });
  });

  it("mengizinkan verifikasi setelah pasien dicocokkan", async () => {
    const created = await booking({ patientId: null, source: "SITUS" });
    const verified = await prisma.appointment.update({
      where: { id: created.id },
      data: { patientId, status: "TERKONFIRMASI" },
    });
    expect(verified.status).toBe("TERKONFIRMASI");
  });

  it("hanya menerima satu isian per booking", async () => {
    const created = await booking({ patientId: null, source: "SITUS" });
    const intake = { appointmentId: created.id, status: "TERISI" as const, kind: "LENGKAP" as const };
    await prisma.intake.create({ data: intake });
    await expect(prisma.intake.create({ data: intake })).rejects.toThrow();
  });

  it("menyimpan pengaturan klinik sebagai satu baris dengan biaya booking awal Rp 100.000", async () => {
    const setting = await prisma.clinicSetting.findUniqueOrThrow({ where: { id: 1 } });
    expect(setting.bookingFee).toBe(100000);
    await expect(prisma.clinicSetting.create({ data: { id: 2 } })).rejects.toThrow();
  });
});
