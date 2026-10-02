// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { WeeklyDayInput } from "@/lib/schedule-week";
import { deleteScheduleException, saveWeeklySchedule } from "@/server/schedule";
import { requireCapability } from "@/server/session";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "jam-minggu-uji";

async function cleanup() {
  await prisma.scheduleException.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.scheduleTemplate.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Resepsionis Uji", entity: { in: ["ScheduleTemplate", "ScheduleException"] } } });
}

const week = (open: (weekday: number) => WeeklyDayInput): WeeklyDayInput[] => [1, 2, 3, 4, 5, 6, 0].map(open);

describe("jam kerja seminggu dan pengecualian (spec D 5.1)", () => {
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await cleanup();
    branchId = (
      await prisma.branch.create({
        data: { slug: SLUG, name: "Cabang Jam", address: "Alamat", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF" },
      })
    ).id;
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Terapis Jam", role: "TERAPIS" } })).id;
    await prisma.scheduleTemplate.create({
      data: { staffId, branchId, weekday: 1, startMinute: 660, endMinute: 1140, slotMinutes: 30 },
    });
    vi.mocked(requireCapability).mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("seluruh minggu tersimpan sekaligus; hari tutup dihapus; hari yang sama tidak diaudit ulang", async () => {
    await unwrap(
      saveWeeklySchedule({
        staffId,
        branchId,
        days: week((weekday) =>
          weekday === 1
            ? { weekday, open: true, startMinute: 660, endMinute: 1140 }
            : weekday === 2
              ? { weekday, open: true, startMinute: 600, endMinute: 900 }
              : { weekday, open: false, startMinute: null, endMinute: null },
        ),
      }),
    );
    const templates = await prisma.scheduleTemplate.findMany({ where: { staffId }, orderBy: { weekday: "asc" } });
    expect(templates.map((t) => [t.weekday, t.startMinute, t.endMinute])).toEqual([
      [1, 660, 1140],
      [2, 600, 900],
    ]);
    expect(await prisma.auditLog.count({ where: { actorName: "Resepsionis Uji", action: "schedule-template.upsert" } })).toBe(1);
    expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("schedule:manage");

    await unwrap(saveWeeklySchedule({ staffId, branchId, days: week((weekday) => ({ weekday, open: false, startMinute: null, endMinute: null })) }));
    expect(await prisma.scheduleTemplate.count({ where: { staffId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { actorName: "Resepsionis Uji", action: "schedule-template.delete" } })).toBe(2);
  });

  it("satu hari tidak sah: tidak ada yang tersimpan, galat menyebut harinya", async () => {
    const result = await saveWeeklySchedule({
      staffId,
      branchId,
      days: week((weekday) =>
        weekday === 3
          ? { weekday, open: true, startMinute: 900, endMinute: 600 }
          : { weekday, open: true, startMinute: 600, endMinute: 900 },
      ),
    });
    expect(result).toEqual({ ok: false, error: "Rabu: jam selesai harus setelah jam mulai." });
    const monday = await prisma.scheduleTemplate.findFirstOrThrow({ where: { staffId, weekday: 1 } });
    expect([monday.startMinute, monday.endMinute]).toEqual([660, 1140]);
    expect(await prisma.scheduleTemplate.count({ where: { staffId } })).toBe(1);
  });

  it("minggu yang tidak lengkap ditolak", async () => {
    expect(await saveWeeklySchedule({ staffId, branchId, days: [{ weekday: 1, open: false, startMinute: null, endMinute: null }] })).toEqual({
      ok: false,
      error: "Jam kerja tidak lengkap. Muat ulang halaman lalu coba lagi.",
    });
  });

  it("hapus pengecualian tercatat di audit; menghapus dua kali ditolak dengan pesan", async () => {
    const exception = await prisma.scheduleException.create({
      data: { staffId, branchId, date: new Date("2031-02-12T00:00:00Z"), kind: "LIBUR" },
    });
    await unwrap(deleteScheduleException(exception.id));
    expect(await prisma.scheduleException.count({ where: { id: exception.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "schedule-exception.delete", entityId: exception.id } })).toBe(1);
    expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("schedule:manage");
    expect(await deleteScheduleException(exception.id)).toEqual({ ok: false, error: "Pengecualian ini sudah dihapus." });
  });
});
