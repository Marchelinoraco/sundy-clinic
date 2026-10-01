// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentMessageKind, AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { countReminderWork, getReminderWorklist } from "@/server/reminder";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "daftar-pengingat-uji";
const MRN = "SDY-2026-7750";
// Maret 2032: Rabu 3, Jumat 5, Sabtu 6, Minggu 7, Senin 8 (dibuat libur di uji ini), Selasa 9.
const HOLIDAY = new Date("2032-03-08T00:00:00Z");
const NOW = combineWitaDateAndMinutes("2032-03-06", 10 * 60); // Sabtu 10.00 WITA
const at = (date: string, hour: number) => combineWitaDateAndMinutes(date, hour * 60);

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: MRN } });
  await prisma.holiday.deleteMany({ where: { date: HOLIDAY } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("daftar kerja Pengingat", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  const ids: Record<string, string> = {};

  async function booking(key: string, startAt: Date, status: AppointmentStatus = "TERKONFIRMASI") {
    const created = await prisma.appointment.create({
      data: {
        code: `PNG-${key}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: "WHATSAPP",
        status,
        bookingFee: 100000,
        branchId,
        staffId,
        patientId,
      },
    });
    ids[key] = created.id;
    return created;
  }

  function message(appointmentId: string, kind: AppointmentMessageKind, scheduledFor: Date, sentAt: Date) {
    return prisma.appointmentMessage.create({
      data: { appointmentId, kind, scheduledFor, sentAt, sentById: "s1", sentByName: "Rina" },
    });
  }

  beforeAll(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Pengingat", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Pengingat",
          address: "Jl. Uji Pengingat No. 2",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: MRN, name: "Maria Pengingat", whatsapp: "6281277500001" } })
    ).id;
    await prisma.holiday.create({ data: { date: HOLIDAY, name: "Libur Uji Pengingat", kind: "LIBUR_KLINIK" } });

    const wednesday = at("2032-03-03", 10);
    const p = await booking("P", at("2032-03-08", 11)); // Senin (libur): diingatkan Sabtu
    await message(p.id, "KONFIRMASI", p.startAt, wednesday);
    await booking("R", at("2032-03-08", 13)); // belum ada konfirmasi
    await booking("S", at("2032-03-08", 15), "MENUNGGU_KONFIRMASI"); // bukan Terkonfirmasi
    const t = await booking("T", at("2032-03-08", 16)); // sudah diingatkan
    await message(t.id, "KONFIRMASI", t.startAt, wednesday);
    await message(t.id, "PENGINGAT", t.startAt, at("2032-03-06", 9));
    await booking("U", at("2032-03-05", 15)); // jadwal sudah lewat
    const v = await booking("V", at("2032-03-10", 11)); // Rabu: diingatkan Selasa
    await message(v.id, "KONFIRMASI", v.startAt, wednesday);
    const z = await booking("Z", at("2032-03-09", 11)); // Selasa: Senin libur dan Minggu tutup, jadi Sabtu
    await message(z.id, "KONFIRMASI", z.startAt, wednesday);
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

  it("mengelompokkan booking ke tiga kotak memakai tanggal libur dari basis data", async () => {
    const worklist = await getReminderWorklist();

    expect(worklist.today).toBe("2032-03-06");
    expect(worklist.confirm.map((row) => row.code)).toEqual(["PNG-R"]);
    expect(worklist.remind.map((row) => [row.code, row.overdue, row.shifted])).toEqual([
      ["PNG-P", false, true],
      ["PNG-Z", false, true],
    ]);
    expect(worklist.reminded.map((row) => [row.code, row.reminderSent?.sentByName, row.reminderSent?.reply])).toEqual([
      ["PNG-T", "Rina", null],
    ]);
  });

  it("setiap baris membawa teks pesan dan data pindah jadwal", async () => {
    const worklist = await getReminderWorklist();
    const [confirmRow] = worklist.confirm;
    expect(confirmRow.confirmation?.link).toMatch(/^https:\/\/wa\.me\/6281277500001\?text=/);
    expect(confirmRow.confirmation?.text).toContain("Alamat: Jl. Uji Pengingat No. 2");

    const [first] = worklist.remind;
    expect(first.reminder?.text).toContain("Senin, 8 Maret 2032 pukul 11.00 WITA");
    expect(first.reschedule).toMatchObject({
      appointmentId: ids.P,
      code: "PNG-P",
      durationMinutes: 30,
      staffId,
      branchId,
      patientName: "Maria Pengingat",
    });
  });

  it("angka menu = kotak 1 + kotak 2", async () => {
    expect(await countReminderWork()).toBe(3);
  });

  it("pindah jadwal menggugurkan catatan lama: booking kembali ke kotak 1", async () => {
    const t = await prisma.appointment.findUniqueOrThrow({ where: { id: ids.T } });
    await prisma.appointment.update({
      where: { id: ids.T },
      data: { startAt: at("2032-03-09", 16), endAt: new Date(at("2032-03-09", 16).getTime() + 30 * 60 * 1000) },
    });
    try {
      const worklist = await getReminderWorklist();
      expect(worklist.confirm.map((row) => row.code)).toEqual(["PNG-R", "PNG-T"]);
      expect(worklist.reminded).toEqual([]);
    } finally {
      await prisma.appointment.update({ where: { id: ids.T }, data: { startAt: t.startAt, endAt: t.endAt } });
    }
  });
});
