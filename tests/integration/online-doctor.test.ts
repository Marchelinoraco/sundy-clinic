// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { getEncounterForStaff, listDoctorWorklist, listOnlineWork } from "@/server/encounter-read";
import { recordContactAttempt, startOnlineConsultation } from "@/server/online-consultation";
import { purgeEncounters } from "../purge-encounters";
import { cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({
  actor: {
    userId: "u1",
    staffId: "s1",
    name: "dr. Uji Online",
    role: "DOKTER" as "DOKTER" | "RESEPSIONIS",
    email: "uji@sundy.test",
  },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "dokter-online-uji";
const WA = "6281200007730";
const today = witaDateString(new Date());
const MINUTE = 60_000;

describe("konsultasi online di sisi dokter", () => {
  let world: BookingWorld;
  let patientId: string;
  let serviceId: string;
  let n = 0;

  async function online(windows: { startAt: Date; endAt: Date }[], status: "TERKONFIRMASI" | "MENUNGGU_KONFIRMASI" | "DIBATALKAN" = "TERKONFIRMASI") {
    n += 1;
    return prisma.appointment.create({
      data: {
        code: `DOL-${n}`,
        type: "KONSULTASI",
        channel: "ONLINE",
        servicePrice: 250000,
        bookingFee: 100000,
        startAt: windows[0].startAt,
        endAt: windows[0].endAt,
        status,
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId,
        patientId,
        contactWindows: { create: windows },
      },
    });
  }

  const around = () => ({ startAt: new Date(Date.now() - 30 * MINUTE), endAt: new Date(Date.now() + 90 * MINUTE) });
  const later = (days: number) => ({
    startAt: combineWitaDateAndMinutes(addDaysToDateString(today, days), 600),
    endAt: combineWitaDateAndMinutes(addDaysToDateString(today, days), 720),
  });

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    serviceId = await setOnlineService({ price: 250000, active: true });
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7730", name: "Rani Online", whatsapp: WA } })).id;
  });

  beforeEach(async () => {
    actor.role = "DOKTER";
    await purgeEncounters(prisma);
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("Mulai konsultasi: booking Hadir dengan jam sekarang, dan kunjungan langsung dibuat", async () => {
    const booking = await online([later(2)]);
    const before = Date.now();
    const { encounterId } = await unwrap(startOnlineConsultation(booking.id));

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id }, include: { encounter: true } });
    expect(row.status).toBe("HADIR");
    expect(row.encounter?.id).toBe(encounterId);
    expect(row.startAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.endAt.getTime() - row.startAt.getTime()).toBe(30 * MINUTE);
    expect(row.checkedInAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "appointment.start-online", entityId: booking.id } })).toBe(1);

    const detail = await getEncounterForStaff(encounterId);
    expect(detail?.appointment).toMatchObject({ channel: "ONLINE", branchName: "Online (WhatsApp)" });
    const worklist = await listDoctorWorklist();
    expect(worklist.today.find((r) => r.appointmentId === booking.id)).toMatchObject({ online: true, branchName: "Online (WhatsApp)" });
  });

  it("dua klik atau dua dokter bersamaan menghasilkan satu kunjungan", async () => {
    const booking = await online([later(2)]);
    const [a, b] = await Promise.all([startOnlineConsultation(booking.id), startOnlineConsultation(booking.id)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data.encounterId).toBe(b.data.encounterId);
    expect(await prisma.encounter.count({ where: { appointmentId: booking.id } })).toBe(1);
    expect((await unwrap(startOnlineConsultation(booking.id))).encounterId).toBe(a.data.encounterId);
  });

  it("menolak booking klinik, booking yang dibatalkan, dan resepsionis", async () => {
    const clinic = await prisma.appointment.create({
      data: {
        code: `DOL-K-${Date.now()}`,
        type: "KONSULTASI",
        startAt: later(2).startAt,
        endAt: new Date(later(2).startAt.getTime() + 30 * MINUTE),
        status: "TERKONFIRMASI",
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
    expect(await startOnlineConsultation(clinic.id)).toEqual({ ok: false, error: "Hanya untuk konsultasi online." });

    const cancelled = await online([later(3)], "DIBATALKAN");
    expect(await startOnlineConsultation(cancelled.id)).toEqual({
      ok: false,
      error: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman.",
    });

    actor.role = "RESEPSIONIS";
    const booking = await online([later(2)]);
    await expect(startOnlineConsultation(booking.id)).rejects.toThrow(/forbidden: record:write/);
    await expect(recordContactAttempt(booking.id)).rejects.toThrow(/forbidden: record:write/);
  });

  it("Tidak terhubung mencatat percobaan tanpa mengubah status", async () => {
    const booking = await online([later(2)]);
    await unwrap(recordContactAttempt(booking.id));
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id }, include: { contactAttempts: true } });
    expect(row.status).toBe("TERKONFIRMASI");
    expect(row.contactAttempts).toMatchObject([{ staffName: "dr. Uji Online" }]);
    expect(await prisma.auditLog.count({ where: { action: "appointment.contact-failed", entityId: booking.id } })).toBe(1);

    const waiting = await online([later(2)], "MENUNGGU_KONFIRMASI");
    expect(await recordContactAttempt(waiting.id)).toEqual({
      ok: false,
      error: "Booking ini sudah berstatus menunggu konfirmasi. Muat ulang halaman.",
    });
  });

  it("daftar Konsultasi online: Sekarang di atas, tanpa yang belum diverifikasi atau semua rentangnya lewat", async () => {
    const upcoming = await online([later(3)]);
    const now = await online([around()]);
    await online([later(2)], "MENUNGGU_KONFIRMASI");
    const lapsed = await online([{ startAt: new Date(Date.now() - 3 * 60 * MINUTE), endAt: new Date(Date.now() - 60 * MINUTE) }]);
    await prisma.intake.create({
      data: { appointmentId: now.id, patientId, status: "TERISI", kind: "LENGKAP", purpose: "SLIMMING", submittedAt: new Date() },
    });
    await unwrap(recordContactAttempt(upcoming.id));

    const rows = (await listOnlineWork()).filter((row) => row.code.startsWith("DOL-"));
    expect(rows.map((row) => [row.appointmentId, row.phase])).toEqual([
      [now.id, "NOW"],
      [upcoming.id, "UPCOMING"],
    ]);
    expect(rows.map((row) => row.appointmentId)).not.toContain(lapsed.id);
    expect(rows[0]).toMatchObject({
      patientName: "Rani Online",
      patientRecordNumber: "SDY-2026-7730",
      whatsapp: WA,
      whatsappLink: `https://wa.me/${WA}`,
      doctorName: "dr. Uji Publik",
      purposeLabel: "Slimming",
    });
    expect(rows[0].intakeId).not.toBeNull();
    expect(rows[0].windows).toEqual([expect.objectContaining({ current: true })]);
    expect(rows[1].lastAttempt).toMatch(/^Dicoba .* — tidak terhubung \(dr\. Uji Online\)$/);
  });
});
