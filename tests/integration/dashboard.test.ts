// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { getDashboardNumbers, getTodaySchedule, getTodayWork } from "@/server/dashboard";
import { requireCapability } from "@/server/session";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Pemilik Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "dasbor-uji";
const WA = "6281277600001";
// Rabu 12 Februari 2031: tanggal yang tidak dipakai uji lain, jadi angka tidak tercampur.
const DAY = "2031-02-12";
const NOW = new Date(`${DAY}T12:00:00+08:00`);
const at = (date: string, minutes: number) => combineWitaDateAndMinutes(date, minutes);

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: { startsWith: SLUG } } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.scheduleException.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.scheduleTemplate.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.staff.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.holiday.deleteMany({ where: { name: { startsWith: "Libur Uji Dasbor" } } });
  await prisma.auditLog.deleteMany({ where: { summary: "dasbor-uji" } });
}

describe("data dasbor", () => {
  let doctorId: string;
  let therapistId: string;
  let branchId: string;
  let patientId: string;
  let seq = 0;

  function booking(input: {
    staffId?: string;
    date?: string;
    minute: number;
    status?: AppointmentStatus;
    source?: BookingSource;
    createdAt?: Date;
    bookingFee?: number | null;
  }) {
    seq += 1;
    const startAt = at(input.date ?? DAY, input.minute);
    return prisma.appointment.create({
      data: {
        code: `DSB-${seq}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: input.source ?? "WHATSAPP",
        status: input.status ?? "TERKONFIRMASI",
        bookingFee: input.bookingFee === undefined ? 100000 : input.bookingFee,
        branchId,
        staffId: input.staffId ?? doctorId,
        patientId,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Dasbor",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
          sortOrder: -100,
        },
      })
    ).id;
    doctorId = (await prisma.staff.create({ data: { slug: `${SLUG}-dokter`, name: "dr. Dasbor", role: "DOKTER", sortOrder: -100 } })).id;
    therapistId = (
      await prisma.staff.create({ data: { slug: `${SLUG}-terapis`, name: "Terapis Dasbor", role: "TERAPIS", sortOrder: -99 } })
    ).id;
    // Rabu = 3. Dokter praktik 11.00–19.00; terapis tidak punya jam kerja hari Rabu.
    await prisma.scheduleTemplate.create({
      data: { staffId: doctorId, branchId, weekday: 3, startMinute: 660, endMinute: 1140, slotMinutes: 30 },
    });
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2031-7600", name: "Maria Dasbor Uji", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe("jadwal hari ini (spec D 4.3)", () => {
    it("lajur dari jam kerja, booking per status, slot kosong, dan booking di luar jam kerja tetap tampil", async () => {
      const early = await booking({ minute: 6 * 60, status: "HADIR" }); // 06.00, di luar jam kerja
      await booking({ minute: 11 * 60, status: "TERKONFIRMASI" });
      await booking({ minute: 13 * 60, status: "DIBATALKAN" });

      const schedule = await getTodaySchedule(NOW);
      expect(schedule.date).toBe(DAY);
      expect(schedule.holidayName).toBeNull();
      const lane = schedule.lanes.find((l) => l.staffId === doctorId)!;
      expect(lane.windows).toEqual([{ startMinute: 660, endMinute: 1140 }]);
      expect(lane.bookings.map((b) => [b.time, b.status, b.patientName])).toEqual([
        ["06.00", "HADIR", "Maria"],
        ["11.00", "TERKONFIRMASI", "Maria"],
      ]);
      expect(lane.bookings[0]).toMatchObject({ id: early.id, startMinute: 360, endMinute: 390, serviceName: "Konsultasi" });
      // 11.00 terisi; 13.00 kosong lagi karena bookingnya dibatalkan.
      expect(lane.openSlots.map((s) => s.time)).not.toContain("11.00");
      expect(lane.openSlots.map((s) => s.time)).toContain("13.00");
      expect(lane.openSlots[0]).toEqual({ startMinute: 690, endMinute: 720, time: "11.30" });
      expect(schedule.offStaff).toContain("Terapis Dasbor");
    });

    it("tenaga tanpa jam kerja tetapi punya booking tetap mendapat lajur", async () => {
      await booking({ staffId: therapistId, minute: 15 * 60 });
      const schedule = await getTodaySchedule(NOW);
      const lane = schedule.lanes.find((l) => l.staffId === therapistId)!;
      expect(lane.windows).toEqual([]);
      expect(lane.openSlots).toEqual([]);
      expect(lane.bookings).toHaveLength(1);
      expect(schedule.offStaff).not.toContain("Terapis Dasbor");
    });

    it("jam tambahan memberi lajur, cuti menghapusnya", async () => {
      await prisma.scheduleException.create({
        data: { staffId: therapistId, branchId, date: new Date(`${DAY}T00:00:00Z`), kind: "JAM_TAMBAHAN", startMinute: 600, endMinute: 720 },
      });
      await prisma.scheduleException.create({
        data: { staffId: doctorId, branchId, date: new Date(`${DAY}T00:00:00Z`), kind: "LIBUR" },
      });
      const schedule = await getTodaySchedule(NOW);
      expect(schedule.lanes.find((l) => l.staffId === therapistId)!.windows).toEqual([{ startMinute: 600, endMinute: 720 }]);
      expect(schedule.lanes.find((l) => l.staffId === doctorId)).toBeUndefined();
      expect(schedule.offStaff).toContain("dr. Dasbor");
    });

    it("hari libur: klinik tutup, tanpa lajur", async () => {
      await prisma.holiday.create({ data: { date: new Date(`${DAY}T00:00:00Z`), name: "Libur Uji Dasbor", kind: "LIBUR_KLINIK" } });
      expect(await getTodaySchedule(NOW)).toEqual({ date: DAY, holidayName: "Libur Uji Dasbor", lanes: [], offStaff: [] });
    });

    it("hari libur dengan booking yang masih ada: lajur hanya untuk tenaga yang punya booking, tanpa slot", async () => {
      await prisma.holiday.create({ data: { date: new Date(`${DAY}T00:00:00Z`), name: "Libur Uji Dasbor", kind: "LIBUR_KLINIK" } });
      const kept = await booking({ minute: 11 * 60, status: "TERKONFIRMASI" });
      const schedule = await getTodaySchedule(NOW);
      expect(schedule.holidayName).toBe("Libur Uji Dasbor");
      const lane = schedule.lanes.find((l) => l.staffId === doctorId)!;
      expect(lane).toMatchObject({ windows: [], openSlots: [] });
      expect(lane.bookings.map((b) => b.id)).toEqual([kept.id]);
      expect(schedule.lanes.find((l) => l.staffId === therapistId)).toBeUndefined();
      expect(schedule.offStaff).toEqual([]);
    });
  });

  describe("pekerjaan hari ini (spec D 4.2)", () => {
    it("booking hari ini tanpa batal/kedaluwarsa, hadir, tidak hadir, dan isian belum diisi", async () => {
      const before = await getTodayWork(NOW);
      await booking({ minute: 11 * 60, status: "HADIR" });
      await booking({ minute: 12 * 60, status: "SELESAI" });
      await booking({ minute: 13 * 60, status: "TIDAK_HADIR" });
      await booking({ minute: 14 * 60, status: "DIBATALKAN" });
      await booking({ minute: 15 * 60, status: "TERKONFIRMASI" }); // link kuis berlaku: isian belum diisi
      await booking({ minute: 16 * 60, status: "MENUNGGU_KONFIRMASI", source: "SITUS" }); // situs: tanpa link

      const work = await getTodayWork(NOW);
      expect(work.today).toEqual({ total: 5, unfilledIntakes: 1, attended: 2, noShow: 1 });
      // Menunggu konfirmasi bersifat global: dibandingkan dengan sebelum booking uji dibuat.
      expect(work.pending).toBeGreaterThanOrEqual(before.pending);
      expect(work.messages).toEqual({ confirm: expect.any(Number), remind: expect.any(Number) });
    });
  });

  describe("Angka (spec D 4.5)", () => {
    it("booking per sumber, pasien baru, hasil, dan biaya booking dari audit — dengan pembanding", async () => {
      const week = new Date(`2031-02-11T09:00:00+08:00`); // Selasa minggu ini
      const lastWeek = new Date(`2031-02-04T09:00:00+08:00`); // Selasa minggu lalu
      const verified = await booking({ minute: 600, createdAt: week, source: "WHATSAPP", bookingFee: 100000 });
      await booking({ minute: 630, createdAt: week, source: "SITUS", bookingFee: 150000 });
      await booking({ minute: 660, createdAt: week, source: "WALK_IN", bookingFee: null, status: "TIDAK_HADIR" });
      await booking({ minute: 690, createdAt: lastWeek, source: "TELEPON" });
      await booking({ minute: 300, createdAt: week, status: "DIBATALKAN" }); // jadwal 05.00, sebelum "sekarang"
      await prisma.patient.update({ where: { id: patientId }, data: { createdAt: week } });
      // Satu booking diverifikasi dua kali (mis. dibatalkan lalu dibuka ulang) tetap dihitung sekali.
      for (const when of [week, new Date(week.getTime() + 60_000)]) {
        await prisma.auditLog.create({
          data: {
            actorStaffId: "s1",
            actorName: "Pemilik Uji",
            actorRole: "SUPER_ADMIN",
            action: "appointment.verify",
            entity: "Appointment",
            entityId: verified.id,
            summary: "dasbor-uji",
            createdAt: when,
          },
        });
      }

      const numbers = await getDashboardNumbers("minggu", NOW);
      expect(numbers.period).toBe("minggu");
      expect(numbers.previousLabel).toBe("minggu lalu");
      expect(numbers.current).toEqual({
        bookings: 4,
        bySource: { SITUS: 1, WHATSAPP: 2, TELEPON: 0, WALK_IN: 1 },
        newPatients: 1,
        noShow: 1,
        cancelled: 1,
        expired: 0,
        feeReceived: 100000,
      });
      expect(numbers.previous).toMatchObject({ bookings: 1, bySource: { TELEPON: 1 }, newPatients: 0, feeReceived: 0 });
      expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("report:read");
    });
  });
});
