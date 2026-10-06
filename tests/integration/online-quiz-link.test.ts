// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { quizLinkCode } from "@/server/quiz-link-code";
import { getQuizLinkPage } from "@/server/quiz-link-public";
import { cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "link-online-uji";
const WA = "6281200007740";
const today = witaDateString(new Date());

describe("halaman link kuis untuk konsultasi online", () => {
  let world: BookingWorld;
  let patientId: string;
  let serviceId: string;

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    serviceId = await setOnlineService({ price: 250000, active: true });
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7740", name: "Siti Online", whatsapp: WA } })).id;
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("memakai Online (WhatsApp), rentang, dan total transfer; tetap terbuka walau rentang pertama sudah mulai", async () => {
    // Rentang pertama kemarin (sudah mulai), rentang kedua lusa.
    const first = { startAt: combineWitaDateAndMinutes(addDaysToDateString(today, -1), 600), endAt: combineWitaDateAndMinutes(addDaysToDateString(today, -1), 720) };
    const second = { startAt: combineWitaDateAndMinutes(addDaysToDateString(today, 2), 600), endAt: combineWitaDateAndMinutes(addDaysToDateString(today, 2), 720) };
    const booking = await prisma.appointment.create({
      data: {
        code: "LKO-1",
        type: "KONSULTASI",
        channel: "ONLINE",
        servicePrice: 250000,
        bookingFee: 100000,
        startAt: first.startAt,
        endAt: first.endAt,
        status: "MENUNGGU_KONFIRMASI",
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId,
        patientId,
        contactWindows: { create: [first, second] },
      },
    });

    const page = await unwrap(getQuizLinkPage(quizLinkCode(booking.id, 0)));
    expect(page.state).toBe("OPEN");
    if (page.state !== "OPEN") return;
    expect(page.branchName).toBe("Online (WhatsApp)");
    expect(page.online?.windowLines).toHaveLength(2);
    expect(page.online?.windowLines[0]).toMatch(/^• /);
    expect(page.feeConsent).toEqual({ bookingFee: 100000, onlineTotal: 350000 });
  });

  it("tertutup setelah konsultasi dimulai", async () => {
    const booking = await prisma.appointment.create({
      data: {
        code: "LKO-2",
        type: "KONSULTASI",
        channel: "ONLINE",
        servicePrice: 250000,
        bookingFee: 100000,
        startAt: new Date(Date.now() - 600_000),
        endAt: new Date(Date.now() + 600_000),
        status: "HADIR",
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId,
        patientId,
      },
    });
    expect((await unwrap(getQuizLinkPage(quizLinkCode(booking.id, 0)))).state).toBe("CLOSED");
  });
});
