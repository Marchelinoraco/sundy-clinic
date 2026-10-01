// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange } from "@/server/schedule";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "strip-tanggal-uji";
const MRN = "SDY-2026-7710";
// Minggu 29 Feb 2032, lalu Senin 1 sampai Sabtu 6 Maret 2032.
const FROM = "2032-02-29";
const HOLIDAY = new Date("2032-03-03T00:00:00Z");

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: MRN } });
  await prisma.holiday.deleteMany({ where: { date: HOLIDAY } });
  // Template dan pengecualian ikut terhapus bersama stafnya (onDelete: Cascade).
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: { startsWith: SLUG } } });
}

function branchData(slug: string) {
  return {
    slug,
    name: `Cabang ${slug}`,
    address: "Alamat",
    whatsapp: "6285172228900",
    openingHours: "Senin–Sabtu, 11.00–13.00",
    status: "AKTIF" as const,
  };
}

describe("ketersediaan beberapa hari (strip tanggal)", () => {
  let staffId: string;
  let branchId: string;
  const input = () => ({ staffId, branchId, durationMinutes: 30, from: FROM, days: 7 });

  beforeAll(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Strip", role: "DOKTER" } })).id;
    branchId = (await prisma.branch.create({ data: branchData(SLUG) })).id;
    // Senin–Sabtu 11.00–13.00: empat jam 30 menit per hari.
    await prisma.scheduleTemplate.createMany({
      data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ staffId, branchId, weekday, startMinute: 660, endMinute: 780 })),
    });
    await prisma.holiday.create({ data: { date: HOLIDAY, name: "Libur Strip", kind: "LIBUR_KLINIK" } });
    await prisma.scheduleException.create({
      data: { staffId, date: new Date("2032-03-04T00:00:00Z"), kind: "LIBUR" },
    });
    const patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: MRN, name: "Pasien Strip", whatsapp: "6281277100001" } })
    ).id;
    const book = (code: string, date: string, from: number, to: number) =>
      prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          source: "WHATSAPP",
          status: "TERKONFIRMASI",
          branchId,
          staffId,
          patientId,
          startAt: combineWitaDateAndMinutes(date, from),
          endAt: combineWitaDateAndMinutes(date, to),
        },
      });
    await book("STRIP-1", "2032-03-02", 660, 780); // Selasa terisi penuh
    await book("STRIP-2", "2032-03-05", 660, 690); // Jumat tersisa tiga jam
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("Minggu, libur, dan cuti tutup; hari yang terisi semua penuh; hari lain menghitung jam kosong", async () => {
    expect(await getStaffAvailabilityRange(input())).toEqual([
      { date: "2032-02-29", state: "CLOSED", openCount: 0 },
      { date: "2032-03-01", state: "OPEN", openCount: 4 },
      { date: "2032-03-02", state: "FULL", openCount: 0 },
      { date: "2032-03-03", state: "CLOSED", openCount: 0 },
      { date: "2032-03-04", state: "CLOSED", openCount: 0 },
      { date: "2032-03-05", state: "OPEN", openCount: 3 },
      { date: "2032-03-06", state: "OPEN", openCount: 4 },
    ]);
  });

  it("angka jam kosong sama dengan daftar jam satu hari", async () => {
    for (const day of await getStaffAvailabilityRange(input())) {
      const slots = await getStaffAvailabilityForAdmin({ staffId, branchId, date: day.date, durationMinutes: 30 });
      expect(day.openCount).toBe(slots.length);
    }
  });

  it("jadwal di cabang lain berarti tutup di cabang ini", async () => {
    const otherId = (await prisma.branch.create({ data: branchData(`${SLUG}-lain`) })).id;
    const days = await getStaffAvailabilityRange({ ...input(), branchId: otherId });
    expect(days.every((day) => day.state === "CLOSED")).toBe(true);
  });

  it("hari ini: hanya jam yang belum lewat dihitung, dan setelah jam kerja menjadi tutup, bukan penuh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(combineWitaDateAndMinutes("2032-03-01", 12 * 60 + 10));
      expect(await getStaffAvailabilityRange({ ...input(), from: "2032-03-01", days: 1 })).toEqual([
        { date: "2032-03-01", state: "OPEN", openCount: 1 },
      ]);
      vi.setSystemTime(combineWitaDateAndMinutes("2032-03-01", 13 * 60 + 5));
      expect(await getStaffAvailabilityRange({ ...input(), from: "2032-03-01", days: 1 })).toEqual([
        { date: "2032-03-01", state: "CLOSED", openCount: 0 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("menolak rentang di luar 1–31 hari dan tanggal yang tidak sah", async () => {
    await expect(getStaffAvailabilityRange({ ...input(), days: 32 })).rejects.toThrow("Rentang");
    await expect(getStaffAvailabilityRange({ ...input(), days: 0 })).rejects.toThrow("Rentang");
    await expect(getStaffAvailabilityRange({ ...input(), from: "besok" })).rejects.toThrow("Tanggal");
  });
});
