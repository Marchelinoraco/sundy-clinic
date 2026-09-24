// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { unwrap } from "./unwrap";
import { createHoliday, isHoliday, listHolidays } from "@/server/holiday";
import { requireCapability } from "@/server/session";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

describe("kalender hari libur", () => {
  beforeEach(async () => {
    await prisma.holiday.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("membuat hari libur dan mendeteksinya", async () => {
    await unwrap(
      createHoliday({
        date: "2026-12-25",
        name: "Kelahiran Yesus Kristus",
        kind: "LIBUR_NASIONAL",
      }),
    );
    expect(await isHoliday("2026-12-25")).toBe(true);
    expect(await isHoliday("2026-12-24")).toBe(false);
  });

  it("mendaftar hari libur satu tahun terurut tanggal", async () => {
    await unwrap(
      createHoliday({ date: "2026-08-17", name: "Proklamasi Kemerdekaan", kind: "LIBUR_NASIONAL" }),
    );
    await unwrap(
      createHoliday({ date: "2026-01-01", name: "Tahun Baru 2026 Masehi", kind: "LIBUR_NASIONAL" }),
    );

    const list = await listHolidays(2026);
    expect(list.map((h) => h.date.toISOString().slice(0, 10))).toEqual([
      "2026-01-01",
      "2026-08-17",
    ]);
  });

  it("menegakkan requireCapability sebelum membuat hari libur", async () => {
    await unwrap(
      createHoliday({
        date: "2026-05-01",
        name: "Hari Buruh Internasional",
        kind: "LIBUR_NASIONAL",
      }),
    );
    expect(requireCapability).toHaveBeenCalledWith("schedule:manage");
  });
});
