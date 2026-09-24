// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createScheduleException,
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
