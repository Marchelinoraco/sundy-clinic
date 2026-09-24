// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createScheduleException,
  getStaffAvailability,
  listScheduleExceptions,
  listScheduleTemplates,
  upsertScheduleTemplate,
} from "@/server/schedule";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

describe("template & pengecualian jadwal", () => {
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await prisma.scheduleException.deleteMany();
    await prisma.scheduleTemplate.deleteMany();
    await prisma.staff.deleteMany({ where: { slug: "staf-jadwal-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-jadwal-uji" } });

    const staff = await prisma.staff.create({
      data: { slug: "staf-jadwal-uji", name: "Staf Jadwal", role: "DOKTER" },
    });
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-jadwal-uji",
        name: "Cabang Uji",
        address: "Alamat",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });
    staffId = staff.id;
    branchId = branch.id;
  });

  afterAll(async () => {
    // beforeEach hanya membersihkan SEBELUM giliran berikutnya di berkas ini
    // — baris yang dibuat pada giliran TERAKHIR tetap ada sampai ada yang
    // membersihkannya. Tanpa ini, "cabang-jadwal-uji" bocor ke berkas lain
    // yang berjalan setelahnya (mis. seed.test.ts menghitung total cabang).
    await prisma.scheduleException.deleteMany();
    await prisma.scheduleTemplate.deleteMany();
    await prisma.staff.deleteMany({ where: { slug: "staf-jadwal-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-jadwal-uji" } });
    await prisma.$disconnect();
  });

  it("membuat template jadwal untuk satu hari dalam minggu", async () => {
    const template = await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 4, // Kamis
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });
    expect(template.weekday).toBe(4);

    const list = await listScheduleTemplates(staffId);
    expect(list).toHaveLength(1);
  });

  it("menimpa template yang sama tanpa menggandakan baris", async () => {
    await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 4,
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });
    await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 4,
      startMinute: 660,
      endMinute: 1080, // jam tutup dimajukan
      slotMinutes: 30,
    });

    const list = await listScheduleTemplates(staffId);
    expect(list).toHaveLength(1);
    expect(list[0].endMinute).toBe(1080);
  });

  it("memindahkan template ke cabang lain pada hari yang sama tanpa menggandakan baris", async () => {
    // "Satu staf tidak boleh di dua cabang pada jam yang sama" (PRD F10)
    // ditegakkan oleh dua hal: @@unique([staffId, weekday]) di sini — yang
    // membuat satu hari-dalam-minggu hanya bisa menunjuk SATU cabang, tidak
    // pernah dua sekaligus — dan exclusion constraint pada Appointment (Task
    // 9), yang jadi jaminan sesungguhnya saat booking sungguhan dibuat.
    // Karena itu, memindahkan cabang untuk hari yang sama adalah EDIT yang
    // sah, bukan sesuatu yang perlu ditolak.
    const otherBranch = await prisma.branch.create({
      data: {
        slug: "cabang-jadwal-uji-2",
        name: "Cabang Uji 2",
        address: "Alamat 2",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });

    await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 4,
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });
    await upsertScheduleTemplate({
      staffId,
      branchId: otherBranch.id,
      weekday: 4,
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });

    const list = await listScheduleTemplates(staffId);
    expect(list).toHaveLength(1);
    expect(list[0].branchId).toBe(otherBranch.id);

    await prisma.branch.delete({ where: { id: otherBranch.id } });
  });

  it("membuat pengecualian tanggal dan mendaftarnya dalam rentang", async () => {
    await createScheduleException({
      staffId,
      branchId: null,
      date: "2026-10-05",
      kind: "LIBUR",
      startMinute: null,
      endMinute: null,
    });

    const list = await listScheduleExceptions(staffId, "2026-10-01", "2026-10-31");
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("LIBUR");
  });
});

describe("getStaffAvailability — melawan basis data sungguhan", () => {
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.patient.deleteMany({
      where: { medicalRecordNumber: { in: ["SDY-2026-9999", "SDY-2026-9998"] } },
    });
    await prisma.scheduleException.deleteMany();
    await prisma.scheduleTemplate.deleteMany();
    await prisma.staff.deleteMany({ where: { slug: "staf-ketersediaan-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-ketersediaan-uji" } });
    await prisma.holiday.deleteMany({ where: { date: new Date("2026-10-05T00:00:00Z") } });

    const staff = await prisma.staff.create({
      data: { slug: "staf-ketersediaan-uji", name: "Staf Ketersediaan", role: "DOKTER" },
    });
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-ketersediaan-uji",
        name: "Cabang Uji",
        address: "Alamat",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });
    staffId = staff.id;
    branchId = branch.id;

    // 2026-10-05 adalah hari Senin (weekday 1).
    await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 1,
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany();
    await prisma.patient.deleteMany({
      where: { medicalRecordNumber: { in: ["SDY-2026-9999", "SDY-2026-9998"] } },
    });
    await prisma.scheduleException.deleteMany();
    await prisma.scheduleTemplate.deleteMany();
    await prisma.staff.deleteMany({ where: { slug: "staf-ketersediaan-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-ketersediaan-uji" } });
    await prisma.holiday.deleteMany({ where: { date: new Date("2026-10-05T00:00:00Z") } });
    await prisma.$disconnect();
  });

  it("mengembalikan slot kosong dari template yang tersimpan", async () => {
    const slots = await getStaffAvailability({
      staffId,
      branchId,
      date: "2026-10-05",
      durationMinutes: 30,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].label).toBe("11.00");
  });

  it("mengosongkan hasil pada hari libur nasional yang tersimpan", async () => {
    await prisma.holiday.create({
      data: { date: new Date("2026-10-05T00:00:00Z"), name: "Uji Libur", kind: "LIBUR_KLINIK" },
    });
    const slots = await getStaffAvailability({
      staffId,
      branchId,
      date: "2026-10-05",
      durationMinutes: 30,
    });
    expect(slots).toEqual([]);
  });

  it("mengecualikan slot yang sudah terisi booking sungguhan", async () => {
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-9999", name: "Pasien Uji", whatsapp: "628999" },
    });
    await prisma.appointment.create({
      data: {
        code: "SDY-TEST",
        branchId,
        staffId,
        patientId: patient.id,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"), // 15.00 WITA
        endAt: new Date("2026-10-05T07:30:00Z"),
        status: "TERKONFIRMASI",
        source: "WALK_IN",
      },
    });

    const slots = await getStaffAvailability({
      staffId,
      branchId,
      date: "2026-10-05",
      durationMinutes: 30,
    });
    expect(slots.map((s) => s.label)).not.toContain("15.00");
  });

  it("tidak mengecualikan slot dari booking yang sudah dibatalkan", async () => {
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-9998", name: "Pasien Uji 2", whatsapp: "628998" },
    });
    await prisma.appointment.create({
      data: {
        code: "SDY-TES2",
        branchId,
        staffId,
        patientId: patient.id,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        status: "DIBATALKAN",
        source: "WALK_IN",
      },
    });

    const slots = await getStaffAvailability({
      staffId,
      branchId,
      date: "2026-10-05",
      durationMinutes: 30,
    });
    expect(slots.map((s) => s.label)).toContain("15.00");
  });
});
