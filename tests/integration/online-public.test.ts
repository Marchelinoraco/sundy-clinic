// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { cancelSiteBooking, findBookingStatus, submitOnlineBooking, type OnlineBookingInput } from "@/server/public-booking";
import { getBookingOptions } from "@/server/public-booking-data";
import { aestheticNewPatient, newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers-v2";
import { cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "publik-online-uji";
const PATIENT_WA = "6281234567890";
const today = witaDateString(new Date());
const day = (offset: number) => addDaysToDateString(today, offset);
const draft = (date: string, startMinute: number, endMinute: number) => ({ date, startMinute, endMinute });
let keySeq = 0;

describe("konsultasi online dari situs", () => {
  let world: BookingWorld;

  function input(overrides: Partial<OnlineBookingInput> = {}): OnlineBookingInput {
    keySeq += 1;
    return {
      submissionKey: `kunci-kiriman-online-${keySeq}-${Date.now()}`,
      staffId: world.doctorId,
      windows: [draft(day(3), 600, 720), draft(day(2), 1140, 1260)],
      answers: slimmingNewPatient,
      identity: newPatientIdentity,
      consentData: true,
      consentFee: true,
      website: "",
      ...overrides,
    };
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 100000 } });
    world = await createBookingWorld(SLUG);
  });

  beforeEach(async () => {
    await setOnlineService({ price: 250000, active: true });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("pilihan online di /daftar mengikuti layanan Konsultasi Online", async () => {
    const options = await getBookingOptions();
    expect(options.online).toMatchObject({ serviceName: "Konsultasi Online", price: 250000 });
    expect(options.online?.doctors).toContainEqual({ id: world.doctorId, name: "dr. Uji Publik" });
    expect(options.online?.doctors.map((d) => d.id)).not.toContain(world.therapistId);

    await setOnlineService({ price: 250000, active: false });
    expect((await getBookingOptions()).online).toBeNull();
    await setOnlineService({ price: 0, active: true });
    expect((await getBookingOptions()).online).toBeNull();
  });

  it("kirim booking online: kanal, biaya, rentang, isian, dan kwitansi berisi total", async () => {
    const sent = input();
    const { receipt } = await unwrap(submitOnlineBooking(sent));

    expect(receipt).toMatchObject({
      patientName: "Siti Rahayu",
      serviceName: "Konsultasi Online",
      staffName: "dr. Uji Publik",
      branchName: "Online (WhatsApp)",
      bookingFee: 100000,
      online: { servicePrice: 250000, total: 350000, maskedWhatsapp: "0812-****-7890" },
    });
    expect(receipt.online?.windowLines).toHaveLength(2);
    expect(receipt.online?.windowLines[0]).toMatch(/^• .*19\.00–21\.00$/);
    expect(decodeURIComponent(receipt.confirmationLink)).toContain("konsultasi online");

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { code: receipt.code },
      include: { contactWindows: true, intake: true },
    });
    expect(row).toMatchObject({ channel: "ONLINE", source: "SITUS", status: "MENUNGGU_KONFIRMASI", patientId: null, servicePrice: 250000 });
    expect(row.contactWindows).toHaveLength(2);
    expect(row.intake).toMatchObject({ status: "TERISI", purpose: "SLIMMING", submissionKey: sent.submissionKey });
  });

  it("kirim ulang dengan kunci yang sama mengembalikan booking yang sama", async () => {
    const sent = input();
    const first = await unwrap(submitOnlineBooking(sent));
    const again = await unwrap(submitOnlineBooking(sent));
    expect(again.receipt.code).toBe(first.receipt.code);
    expect(await prisma.intake.count({ where: { submissionKey: sent.submissionKey } })).toBe(1);
  });

  it("semua tujuan kuis boleh online, termasuk Aesthetic", async () => {
    const { receipt } = await unwrap(submitOnlineBooking(input({ answers: aestheticNewPatient })));
    expect((await prisma.intake.findFirstOrThrow({ where: { appointment: { code: receipt.code } } })).purpose).toBe("AESTHETIC");
  });

  it("menolak layanan nonaktif, terapis, rentang tidak sah, persetujuan kosong, dan bot", async () => {
    await setOnlineService({ price: 250000, active: false });
    expect(await submitOnlineBooking(input())).toEqual({
      ok: false,
      error: "Konsultasi online sedang tidak tersedia. Silakan pilih datang ke klinik.",
    });
    await setOnlineService({ price: 250000, active: true });

    expect(await submitOnlineBooking(input({ staffId: world.therapistId }))).toEqual({
      ok: false,
      error: "Tenaga ini tidak menangani layanan tersebut.",
    });
    expect(await submitOnlineBooking(input({ windows: [draft(day(15), 600, 720)] }))).toEqual({
      ok: false,
      error: "Pilih tanggal antara hari ini dan 14 hari ke depan.",
    });
    expect(await submitOnlineBooking(input({ windows: [draft(day(2), 600, 720), draft(day(2), 660, 780)] }))).toEqual({
      ok: false,
      error: "Waktu-waktu yang dipilih tidak boleh tumpang tindih.",
    });
    expect(await submitOnlineBooking(input({ consentFee: false }))).toEqual({
      ok: false,
      error: "Centang kedua persetujuan untuk melanjutkan.",
    });
    expect((await submitOnlineBooking(input({ website: "spam" }))).ok).toBe(false);
  });

  it("cek booking: rentang tampil, tanpa batal atau pindah dari situs", async () => {
    const { receipt } = await unwrap(submitOnlineBooking(input()));
    const status = await unwrap(findBookingStatus({ code: receipt.code, last4: "7890" }));
    expect(status).toMatchObject({
      channel: "ONLINE",
      branchName: "Online (WhatsApp)",
      canCancel: false,
      canReschedule: false,
      rescheduleLink: null,
    });
    expect(status?.windowLines).toHaveLength(2);
    expect(decodeURIComponent(status?.onlineChangeLink ?? "")).toContain(receipt.code);

    expect(await cancelSiteBooking({ code: receipt.code, last4: "7890" })).toEqual({
      ok: false,
      error: "Untuk membatalkan konsultasi online, hubungi kami lewat WhatsApp.",
    });
  });
});
