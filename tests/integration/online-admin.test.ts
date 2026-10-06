// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { listOnlineBookings } from "@/server/appointment";
import { createOnlineAppointment, updateContactWindows } from "@/server/online-consultation";
import { cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";
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

const SLUG = "admin-online-uji";
const WA = ["6281200007720", "6281200007721"];
const today = witaDateString(new Date());
const day = (offset: number) => addDaysToDateString(today, offset);
const draft = (date: string, startMinute: number, endMinute: number) => ({ date, startMinute, endMinute });

describe("booking online dari panel admin", () => {
  let world: BookingWorld;
  let patientId: string;

  const create = (overrides: Record<string, unknown> = {}) =>
    createOnlineAppointment({
      patientId,
      staffId: world.doctorId,
      source: "WHATSAPP",
      windows: [draft(day(3), 600, 720), draft(day(2), 1140, 1260)],
      ...overrides,
    } as Parameters<typeof createOnlineAppointment>[0]);

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, WA);
    world = await createBookingWorld(SLUG);
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7720", name: "Siti Online", whatsapp: WA[0] } })).id;
  });

  beforeEach(async () => {
    await setOnlineService({ price: 250000, active: true });
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, WA);
    await prisma.$disconnect();
  });

  it("membuat booking online: kanal, biaya yang disalin, rentang terurut, dan jadwal = rentang pertama", async () => {
    const created = await unwrap(create());
    const setting = await prisma.clinicSetting.findUniqueOrThrow({ where: { id: 1 } });
    const firstBranch = await prisma.branch.findFirstOrThrow({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" } });

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
      include: { contactWindows: { orderBy: { startAt: "asc" } }, service: true },
    });
    expect(row).toMatchObject({
      channel: "ONLINE",
      type: "KONSULTASI",
      status: "MENUNGGU_KONFIRMASI",
      source: "WHATSAPP",
      servicePrice: 250000,
      bookingFee: setting.bookingFee,
      branchId: firstBranch.id,
      staffId: world.doctorId,
    });
    expect(row.service?.slug).toBe("konsultasi-online");
    expect(row.contactWindows.map((w) => [w.startAt, w.endAt])).toEqual([
      [combineWitaDateAndMinutes(day(2), 1140), combineWitaDateAndMinutes(day(2), 1260)],
      [combineWitaDateAndMinutes(day(3), 600), combineWitaDateAndMinutes(day(3), 720)],
    ]);
    expect(row.startAt).toEqual(combineWitaDateAndMinutes(day(2), 1140));
    expect(row.endAt).toEqual(combineWitaDateAndMinutes(day(2), 1260));

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "appointment.create", entityId: created.id } });
    expect(audit.summary).toContain("online");
  });

  it("menolak bila layanan online nonaktif atau berharga 0", async () => {
    await setOnlineService({ price: 250000, active: false });
    const off = "Konsultasi Online belum diaktifkan. Atur harganya dan aktifkan di halaman Layanan.";
    expect(await create()).toEqual({ ok: false, error: off });
    await setOnlineService({ price: 0, active: true });
    expect(await create()).toEqual({ ok: false, error: off });
  });

  it("menolak sumber walk-in, terapis, rentang tidak sah, dan pasien rangkap", async () => {
    expect(await create({ source: "WALK_IN" })).toEqual({ ok: false, error: "Booking online dicatat dari WhatsApp atau telepon." });
    expect(await create({ staffId: world.therapistId })).toEqual({ ok: false, error: "Konsultasi online harus ditangani dokter." });
    expect(await create({ windows: [draft(day(2), 600, 630)] })).toEqual({ ok: false, error: "Setiap waktu minimal 1 jam." });

    const owner = await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7721", name: "Siti Lama", whatsapp: WA[1] } });
    await prisma.patient.update({ where: { id: patientId }, data: { mergedIntoId: owner.id } });
    try {
      expect(await create()).toEqual({
        ok: false,
        error: "Pasien ini rangkap dari Siti Lama (SDY-2026-7721). Buat booking untuk pasien itu.",
      });
    } finally {
      await prisma.patient.update({ where: { id: patientId }, data: { mergedIntoId: null } });
      await prisma.patient.delete({ where: { id: owner.id } });
    }
  });

  it("resepsionis boleh membuat rentang yang sudah mulai selama belum berakhir", async () => {
    const now = new Date();
    const minute = Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes() + 8 * 60) % (24 * 60) / 30) * 30;
    // Hanya bisa diuji saat jam WITA sekarang berada di 08.00–20.00.
    if (minute < 480 || minute + 60 > 1260) return;
    expect((await create({ windows: [draft(today, minute, minute + 60)] })).ok).toBe(true);
  });

  it("ubah waktu luang: mengganti semua rentang dan menggeser jadwal ke rentang pertama", async () => {
    const created = await unwrap(create());
    await unwrap(updateContactWindows({ appointmentId: created.id, windows: [draft(day(5), 780, 900)] }));

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id }, include: { contactWindows: true } });
    expect(row.contactWindows).toHaveLength(1);
    expect(row.startAt).toEqual(combineWitaDateAndMinutes(day(5), 780));
    expect(row.endAt).toEqual(combineWitaDateAndMinutes(day(5), 900));
    expect(await prisma.auditLog.count({ where: { action: "appointment.update-windows", entityId: created.id } })).toBe(1);
  });

  it("ubah waktu luang menolak booking klinik dan booking yang sudah dibatalkan", async () => {
    const created = await unwrap(create());
    await prisma.appointment.update({ where: { id: created.id }, data: { status: "DIBATALKAN" } });
    expect(await updateContactWindows({ appointmentId: created.id, windows: [draft(day(5), 780, 900)] })).toEqual({
      ok: false,
      error: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman.",
    });

    const clinic = await prisma.appointment.create({
      data: {
        code: "ADM-KLINIK-1",
        type: "KONSULTASI",
        startAt: combineWitaDateAndMinutes(day(2), 660),
        endAt: combineWitaDateAndMinutes(day(2), 690),
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
    expect(await updateContactWindows({ appointmentId: clinic.id, windows: [draft(day(5), 780, 900)] })).toEqual({
      ok: false,
      error: "Hanya booking online yang punya waktu luang.",
    });
  });

  it("daftar Konsultasi online: hanya yang terkonfirmasi, Perlu waktu baru paling atas", async () => {
    const later = await unwrap(create({ windows: [draft(day(4), 600, 720)] }));
    const sooner = await unwrap(create({ windows: [draft(day(2), 600, 720)] }));
    const lapsed = await unwrap(create({ windows: [draft(day(2), 780, 900)] }));
    const waiting = await unwrap(create());
    await prisma.appointment.updateMany({ where: { id: { in: [later.id, sooner.id, lapsed.id] } }, data: { status: "TERKONFIRMASI" } });
    // Semua rentang booking ini sudah lewat.
    await prisma.contactWindow.updateMany({
      where: { appointmentId: lapsed.id },
      data: { startAt: combineWitaDateAndMinutes(day(-1), 600), endAt: combineWitaDateAndMinutes(day(-1), 720) },
    });

    const rows = (await listOnlineBookings()).filter((row) => [later.id, sooner.id, lapsed.id, waiting.id].includes(row.id));
    expect(rows.map((row) => [row.id, row.phase])).toEqual([
      [lapsed.id, "NEEDS_NEW"],
      [sooner.id, "UPCOMING"],
      [later.id, "UPCOMING"],
    ]);
  });
});
