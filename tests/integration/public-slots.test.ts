// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getPublicSlots, holdSlot } from "@/server/public-booking";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "slot-publik-uji";

describe("slot dan hold publik", () => {
  let world: BookingWorld;
  let date: string;

  beforeEach(async () => {
    await cleanupBookingWorld(SLUG);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG);
    await prisma.$disconnect();
  });

  const consultationSlots = (holdToken: string | null = null) =>
    unwrap(
      getPublicSlots({
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        date,
        holdToken,
      }),
    );

  const hold = (time: string, previousToken: string | null = null) =>
    holdSlot({
      serviceId: world.consultationId,
      staffId: world.doctorId,
      branchId: world.branchId,
      startAt: at(date, time).toISOString(),
      previousToken,
    });

  it("menawarkan setiap setengah jam dari jadwal dokter", async () => {
    const slots = await consultationSlots();
    expect(slots).toHaveLength(16);
    expect(slots[0]).toMatchObject({ label: "11.00", staffId: world.doctorId, staffName: "dr. Uji Publik" });
  });

  it("menolak tanggal kemarin dan 31 hari lagi (Review Focus 5)", async () => {
    const today = witaDateString(new Date());
    for (const day of [addDaysToDateString(today, -1), addDaysToDateString(today, 31)]) {
      const result = await getPublicSlots({
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        date: day,
        holdToken: null,
      });
      expect(result).toEqual({ ok: false, error: "Pilih tanggal antara hari ini dan 30 hari ke depan." });
    }
  });

  it("tidak menawarkan konsultasi dokter pada terapis", async () => {
    const result = await getPublicSlots({
      serviceId: world.consultationId,
      staffId: world.therapistId,
      branchId: world.branchId,
      date,
      holdToken: null,
    });
    expect(result).toEqual({ ok: false, error: "Tenaga ini tidak menangani layanan tersebut." });
  });

  it("menggabungkan tenaga yang boleh untuk 'siapa saja' tanpa jam ganda", async () => {
    const slots = await unwrap(
      getPublicSlots({ serviceId: world.treatmentId, staffId: null, branchId: world.branchId, date, holdToken: null }),
    );
    const starts = slots.map((s) => s.startAt.getTime());
    expect(new Set(starts).size).toBe(starts.length);
    expect(slots[0].staffId).toBe(world.doctorId);
  });

  it("menyembunyikan jam yang ditahan dari pasien lain, tetapi tidak dari pemegangnya", async () => {
    const { token } = await unwrap(hold("15:00"));
    const hasFifteen = (slots: { label: string }[]) => slots.some((s) => s.label === "15.00");

    expect(hasFifteen(await consultationSlots())).toBe(false);
    expect(hasFifteen(await consultationSlots(token))).toBe(true);
  });

  it("menolak menahan jam yang tidak ditawarkan (Review Focus 5)", async () => {
    for (const time of ["10:00", "15:15"]) {
      expect(await hold(time)).toEqual({ ok: false, error: "Jam ini baru saja dipilih orang lain. Pilih jam lain." });
    }
  });

  it("dua pasien tidak bisa menahan jam yang sama", async () => {
    await unwrap(hold("16:00"));
    expect(await hold("16:00")).toMatchObject({ ok: false });
  });

  it("hold kedaluwarsa tidak menghalangi, dan barisnya dibersihkan saat jam itu ditahan lagi", async () => {
    await prisma.slotHold.create({
      data: {
        token: "hold-basi-uji-0000000000",
        startAt: at(date, "17:00"),
        endAt: at(date, "17:30"),
        expiresAt: new Date(Date.now() - 60_000),
        staffId: world.doctorId,
        branchId: world.branchId,
      },
    });

    expect((await consultationSlots()).some((s) => s.label === "17.00")).toBe(true);
    await unwrap(hold("17:00"));
    expect(await prisma.slotHold.count({ where: { token: "hold-basi-uji-0000000000" } })).toBe(0);
  });

  it("memilih jam lain melepas hold sebelumnya", async () => {
    const first = await unwrap(hold("13:00"));
    const second = await unwrap(hold("13:30", first.token));

    const holds = await prisma.slotHold.findMany({ where: { staffId: world.doctorId } });
    expect(holds.map((h) => h.token)).toEqual([second.token]);
    expect(second.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
  });
});
