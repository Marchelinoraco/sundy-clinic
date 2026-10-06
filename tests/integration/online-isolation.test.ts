// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { listAppointments, markNoShow, rescheduleAppointment } from "@/server/appointment";
import { ONLINE_NOT_ALLOWED } from "@/server/appointment-guard";
import { computeAvailability, computeAvailabilityRange } from "@/server/availability";
import { getAllServiceSlugs, getServiceBySlug, getServiceCategoriesWithServices } from "@/server/catalog";
import { getCheckInForm } from "@/server/check-in";
import { getTodaySchedule } from "@/server/dashboard";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Admin Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "isolasi-online-uji";
const WA = "6281200007710";

describe("booking online tidak ikut jalur klinik", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let onlineServiceId: string;
  let n = 0;

  function booking(input: { channel: "KLINIK" | "ONLINE"; time: string; day?: string; status?: "TERKONFIRMASI" | "HADIR" }) {
    n += 1;
    const day = input.day ?? date;
    const startAt = at(day, input.time);
    return prisma.appointment.create({
      data: {
        code: `ISO-${n}`,
        type: "KONSULTASI",
        channel: input.channel,
        servicePrice: input.channel === "ONLINE" ? 250000 : null,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: input.status ?? "TERKONFIRMASI",
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: input.channel === "ONLINE" ? onlineServiceId : world.consultationId,
        patientId,
      },
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7710", name: "Pasien Isolasi", whatsapp: WA } })).id;
    onlineServiceId = await setOnlineService({ price: 250000, active: true });
  });

  beforeEach(async () => {
    await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: { startsWith: SLUG } } } } });
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("booking online tidak mengurangi slot klinik dokter yang sama", async () => {
    const rangeInput = { staffId: world.doctorId, branchId: world.branchId, durationMinutes: 30, from: date, days: 1 };
    const empty = await computeAvailabilityRange(rangeInput, { minLeadMinutes: 0 });

    await booking({ channel: "ONLINE", time: "11:00" });
    const slots = await computeAvailability(
      { staffId: world.doctorId, branchId: world.branchId, date, durationMinutes: 30 },
      { minLeadMinutes: 0 },
    );
    expect(slots.map((slot) => slot.startAt.getTime())).toContain(at(date, "11:00").getTime());
    expect((await computeAvailabilityRange(rangeInput, { minLeadMinutes: 0 }))[0].openCount).toBe(empty[0].openCount);

    await booking({ channel: "KLINIK", time: "11:00" });
    const after = await computeAvailability(
      { staffId: world.doctorId, branchId: world.branchId, date, durationMinutes: 30 },
      { minLeadMinutes: 0 },
    );
    expect(after.map((slot) => slot.startAt.getTime())).not.toContain(at(date, "11:00").getTime());
  });

  it("daftar per tanggal: online belum dimulai tidak tampil, online yang sudah dimulai tampil", async () => {
    const waiting = await booking({ channel: "ONLINE", time: "12:00" });
    const started = await booking({ channel: "ONLINE", time: "13:00", status: "HADIR" });
    const clinic = await booking({ channel: "KLINIK", time: "14:00" });
    const ids = (await listAppointments({ date })).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([started.id, clinic.id]));
    expect(ids).not.toContain(waiting.id);
  });

  it("filter isian belum diperiksa (semua tanggal) tetap memuat booking online yang belum dimulai", async () => {
    const waiting = await booking({ channel: "ONLINE", time: "12:30" });
    await prisma.intake.create({
      data: { appointmentId: waiting.id, patientId, status: "TERISI", kind: "LENGKAP", purpose: "SLIMMING", submittedAt: new Date() },
    });
    const unreviewed = (await listAppointments({ intakeStatus: "TERISI" })).map((row) => row.id);
    expect(unreviewed).toContain(waiting.id);
    expect((await listAppointments({ date })).map((row) => row.id)).not.toContain(waiting.id);
  });

  it("garis waktu dasbor hari ini tidak memuat booking online yang belum dimulai", async () => {
    const today = witaDateString(new Date());
    const online = await booking({ channel: "ONLINE", time: "06:00", day: today });
    const schedule = await getTodaySchedule();
    expect(schedule.lanes.flatMap((lane) => lane.bookings).map((block) => block.id)).not.toContain(online.id);
  });

  it("Tidak hadir, Pindah jadwal, dan Check-in menolak booking online", async () => {
    const online = await booking({ channel: "ONLINE", time: "15:00" });
    expect(await markNoShow(online.id)).toEqual({ ok: false, error: ONLINE_NOT_ALLOWED });
    expect(
      await rescheduleAppointment(online.id, { startAt: at(addDaysToDateString(date, 1), "15:00"), endAt: at(addDaysToDateString(date, 1), "15:30") }),
    ).toEqual({ ok: false, error: ONLINE_NOT_ALLOWED });
    expect(await getCheckInForm(online.id)).toEqual({
      ok: false,
      error: "Konsultasi online tidak memakai check-in. Dokter memulainya dari dasbor.",
    });

    const clinic = await booking({ channel: "KLINIK", time: "16:00" });
    expect((await markNoShow(clinic.id)).ok).toBe(true);
  });

  it("layanan Konsultasi Online tidak pernah tampil di katalog situs", async () => {
    expect(await getAllServiceSlugs()).not.toContain("konsultasi-online");
    expect(await getServiceBySlug("konsultasi-online")).toBeNull();
    const slugs = (await getServiceCategoriesWithServices()).flatMap((category) => category.services.map((s) => s.slug));
    expect(slugs).not.toContain("konsultasi-online");
  });
});
