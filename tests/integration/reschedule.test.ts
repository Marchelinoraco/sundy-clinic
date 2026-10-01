// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { rescheduleAppointment } from "@/server/appointment";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange } from "@/server/schedule";
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

const SLUG = "pindah-jadwal-uji";
const MRN = "SDY-2026-7760";
const DATE = "2032-03-01"; // Senin
const at = (minutes: number) => combineWitaDateAndMinutes(DATE, minutes);

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: MRN } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("pindah jadwal", () => {
  let staffId: string;
  let branchId: string;
  let ownId: string;

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Pindah", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Pindah",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–14.00",
          status: "AKTIF",
        },
      })
    ).id;
    // Senin 11.00–14.00.
    await prisma.scheduleTemplate.create({ data: { staffId, branchId, weekday: 1, startMinute: 660, endMinute: 840 } });
    const patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: MRN, name: "Pasien Pindah", whatsapp: "6281277600001" } })
    ).id;
    const book = (code: string, from: number, to: number) =>
      prisma.appointment.create({
        data: {
          code,
          type: "TREATMENT",
          source: "WHATSAPP",
          status: "TERKONFIRMASI",
          branchId,
          staffId,
          patientId,
          startAt: at(from),
          endAt: at(to),
        },
      });
    ownId = (await book("PINDAH-A", 660, 720)).id; // 11.00–12.00, booking yang dipindah
    await book("PINDAH-B", 780, 810); // 13.00–13.30, booking orang lain
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("jam milik booking itu sendiri tidak dihitung terisi, jam booking lain tetap terisi", async () => {
    const input = { staffId, branchId, date: DATE, durationMinutes: 60 };
    expect((await getStaffAvailabilityForAdmin(input)).map((slot) => slot.label)).toEqual(["12.00"]);
    expect(
      (await getStaffAvailabilityForAdmin({ ...input, excludeAppointmentId: ownId })).map((slot) => slot.label),
    ).toEqual(["11.00", "11.30", "12.00"]);

    const range = { staffId, branchId, durationMinutes: 60, from: DATE, days: 1 };
    expect((await getStaffAvailabilityRange(range))[0].openCount).toBe(1);
    expect((await getStaffAvailabilityRange({ ...range, excludeAppointmentId: ownId }))[0].openCount).toBe(3);
  });

  it("boleh digeser ke jam yang tumpang tindih dengan jamnya sendiri", async () => {
    await unwrap(rescheduleAppointment(ownId, { startAt: at(690), endAt: at(750) }));
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: ownId } })).startAt).toEqual(at(690));
  });

  it("ditolak dengan pesan jelas bila bentrok dengan booking lain", async () => {
    expect(await rescheduleAppointment(ownId, { startAt: at(750), endAt: at(810) })).toEqual({
      ok: false,
      error: "Slot baru saja terisi. Pilih jam lain.",
    });
  });
});
