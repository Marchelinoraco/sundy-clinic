// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { resolveBookingPrefill, SLOT_TAKEN_NOTICE } from "@/server/booking-prefill";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "isian-awal-uji";
const WA = "6281277500001";
const DAY = "2031-02-12"; // Rabu
const NOW = new Date("2031-02-10T09:00:00+08:00");

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.scheduleTemplate.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.staff.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("resolveBookingPrefill", () => {
  let doctorId: string;
  let therapistId: string;
  let branchId: string;
  let patientId: string;

  beforeEach(async () => {
    await cleanup();
    branchId = (
      await prisma.branch.create({
        data: { slug: SLUG, name: "Cabang Isian Awal", address: "Alamat", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF" },
      })
    ).id;
    doctorId = (await prisma.staff.create({ data: { slug: `${SLUG}-dokter`, name: "dr. Isian Awal", role: "DOKTER" } })).id;
    therapistId = (await prisma.staff.create({ data: { slug: `${SLUG}-terapis`, name: "Terapis Isian Awal", role: "TERAPIS" } })).id;
    await prisma.scheduleTemplate.create({
      data: { staffId: doctorId, branchId, weekday: 3, startMinute: 660, endMinute: 1140, slotMinutes: 30 },
    });
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2031-7500", name: "Rina Isian Awal", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("tenaga, tanggal, dan jam kosong menjadi pilihan; pasien ikut terpilih", async () => {
    const result = await resolveBookingPrefill({ pasien: patientId, tenaga: doctorId, tanggal: DAY, jam: "11.00" }, NOW);
    expect(result.notice).toBeNull();
    expect(result.initial).toMatchObject({ kind: "KONSULTASI", staffId: doctorId, branchId, date: DAY });
    expect(result.initial.patient).toMatchObject({ id: patientId, name: "Rina Isian Awal" });
    expect(result.initial.slot?.startAt).toEqual(combineWitaDateAndMinutes(DAY, 660));
    expect(result.initial.slot?.label).toBe("11.00");
  });

  it("jam yang sudah terisi: tenaga dan tanggal tetap, jam kosong dengan pesan", async () => {
    const startAt = combineWitaDateAndMinutes(DAY, 660);
    await prisma.appointment.create({
      data: {
        code: "ISA-1",
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        source: "WHATSAPP",
        status: "TERKONFIRMASI",
        branchId,
        staffId: doctorId,
        patientId,
      },
    });
    const result = await resolveBookingPrefill({ tenaga: doctorId, tanggal: DAY, jam: "11.00" }, NOW);
    expect(result.notice).toBe(SLOT_TAKEN_NOTICE);
    expect(result.initial).toMatchObject({ staffId: doctorId, date: DAY, slot: null });
  });

  it("terapis: jenis treatment dan pesan untuk memilih layanan dulu", async () => {
    const result = await resolveBookingPrefill({ tenaga: therapistId, tanggal: DAY, jam: "11.00" }, NOW);
    expect(result.initial).toMatchObject({ kind: "TREATMENT", staffId: therapistId, date: DAY, slot: null });
    expect(result.notice).toBe("Pilih layanan treatment, lalu jam 11.00.");
  });

  it("isian yang tidak sah diabaikan tanpa galat", async () => {
    expect((await resolveBookingPrefill({ pasien: "tidak-ada", tenaga: "tidak-ada" }, NOW)).initial).toEqual({
      patient: null,
      kind: "KONSULTASI",
      staffId: null,
      branchId: null,
      date: null,
      slot: null,
    });
    const past = await resolveBookingPrefill({ tenaga: doctorId, tanggal: "2031-02-01", jam: "11.00" }, NOW);
    expect(past.initial).toMatchObject({ staffId: doctorId, date: null, slot: null });
    expect(past.notice).toBeNull();
    const badTime = await resolveBookingPrefill({ tenaga: doctorId, tanggal: DAY, jam: "25.00" }, NOW);
    expect(badTime).toMatchObject({ notice: null, initial: { date: DAY, slot: null } });
  });
});
