// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { getReminderWorklist } from "@/server/reminder";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "pengingat-online-uji";
const MRN = "SDY-2026-7760";
// April 2032: Selasa 6, Rabu 7, Kamis 8. "Sekarang" = Rabu 7 April 10.00 WITA.
const NOW = combineWitaDateAndMinutes("2032-04-07", 10 * 60);
const at = (date: string, minute: number) => combineWitaDateAndMinutes(date, minute);

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: MRN } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("pengingat untuk konsultasi online", () => {
  let lapsedFirstId: string;
  let unconfirmedId: string;

  beforeAll(async () => {
    await cleanup();
    const staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "dr. Online Pengingat", role: "DOKTER" } })).id;
    const branchId = (
      await prisma.branch.create({
        data: { slug: SLUG, name: "Cabang Online", address: "Jl. Uji", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF" },
      })
    ).id;
    const patientId = (await prisma.patient.create({ data: { medicalRecordNumber: MRN, name: "Rina Online", whatsapp: "6281277600001" } })).id;

    const online = (code: string, windows: [string, number, number][]) =>
      prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          channel: "ONLINE",
          servicePrice: 250000,
          bookingFee: 100000,
          startAt: at(windows[0][0], windows[0][1]),
          endAt: at(windows[0][0], windows[0][2]),
          status: "TERKONFIRMASI",
          source: "WHATSAPP",
          branchId,
          staffId,
          patientId,
          contactWindows: { create: windows.map(([date, from, to]) => ({ startAt: at(date, from), endAt: at(date, to) })) },
        },
      });

    // Rentang pertama (Selasa) sudah lewat; rentang berikutnya Kamis besok → masuk "Ingatkan sekarang".
    const lapsedFirst = await online("PNO-1", [["2032-04-06", 600, 720], ["2032-04-08", 1140, 1260]]);
    lapsedFirstId = lapsedFirst.id;
    await prisma.appointmentMessage.create({
      data: { appointmentId: lapsedFirst.id, kind: "KONFIRMASI", scheduledFor: lapsedFirst.startAt, sentAt: at("2032-04-05", 600), sentById: "s1", sentByName: "Rina" },
    });
    // Belum ada konfirmasi → kotak "Konfirmasi belum dikirim".
    unconfirmedId = (await online("PNO-2", [["2032-04-09", 600, 720]])).id;
    // Semua rentang sudah lewat → tidak tampil sama sekali.
    await online("PNO-3", [["2032-04-06", 780, 900]]);
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("menyusun kotak pengingat dari rentang terbuka berikutnya, dengan teks dan label online", async () => {
    const worklist = await getReminderWorklist();
    const all = [...worklist.confirm, ...worklist.remind, ...worklist.reminded].filter((row) => row.code.startsWith("PNO-"));
    expect(all.map((row) => row.code).sort()).toEqual(["PNO-1", "PNO-2"]);

    const remind = worklist.remind.find((row) => row.appointmentId === lapsedFirstId);
    expect(remind).toMatchObject({ channel: "ONLINE", branchName: "Online (WhatsApp)" });
    expect(remind?.onlineLabel).toBe("Online · Kamis, 8 April 2032, 19.00–21.00");
    expect(remind?.reminder?.text).toContain("pada Kamis, 8 April 2032, dr. Online Pengingat akan menghubungi Anda lewat WhatsApp antara 19.00–21.00");

    const confirm = worklist.confirm.find((row) => row.appointmentId === unconfirmedId);
    expect(confirm?.confirmation?.text).toContain("pembayaran konsultasi online Anda (PNO-2) sudah kami terima");
  });
});
