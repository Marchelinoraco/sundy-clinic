// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { EMPTY_BIA_INPUT } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { saveBiaNumbers, startBiaMeasurement } from "@/server/bia-actions";
import { saveFoodRecallByNurse } from "@/server/food-recall-admin";
import { getNurseVisit, listNurseWorklist } from "@/server/nurse";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

type Role = "DOKTER" | "TERAPIS";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s-perawat", name: "Perawat Uji", role: "TERAPIS" as Role, email: "perawat@sundy.test" },
}));

vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
    requireAnyCapability: vi.fn(async (...capabilities: Parameters<typeof can>[1][]) => {
      if (!capabilities.some((capability) => can(actor.role, capability))) throw new Error(`forbidden: ${capabilities.join("|")}`);
      return actor;
    }),
  };
});

const SLUG = "perawat-uji";
const WA = "6281200009955";
const today = witaDateString(new Date());

describe("daftar dan halaman Tangani perawat (spec peran perawat 6–7)", () => {
  let world: BookingWorld;
  let patientId: string;
  let slot = 0;

  async function booking(status: AppointmentStatus = "HADIR", offsetDays = 0, channel: "KLINIK" | "ONLINE" = "KLINIK") {
    slot += 1;
    const minutes = 4 * 60 + slot * 30;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const startAt = at(addDaysToDateString(today, offsetDays), time);
    return prisma.appointment.create({
      data: {
        code: `PRW-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status,
        source: "WALK_IN",
        channel,
        servicePrice: channel === "ONLINE" ? 250_000 : null,
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-9955", name: "Mario Uji", whatsapp: WA, allergies: "Udang", medicalHistory: "Diabetes", importantNotes: "Rahasia" },
      })
    ).id;
  });

  beforeEach(() => {
    actor.role = "TERAPIS";
  });

  afterAll(async () => {
    await prisma.biaMeasurement.deleteMany({ where: { patientId } });
    await prisma.foodRecall.deleteMany({ where: { appointment: { patientId } } });
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("daftar hanya berisi booking klinik Hadir hari ini, urut jam; status food recall dan BIA ikut berubah", async () => {
    const later = await booking();
    const earlier = await prisma.appointment.update({ where: { id: (await booking()).id }, data: { startAt: at(today, "03:00"), endAt: at(today, "03:30") } });
    await booking("HADIR", -1);
    await booking("SELESAI");
    await booking("TERKONFIRMASI");
    await booking("HADIR", 0, "ONLINE");

    const rows = (await listNurseWorklist()).filter((row) => row.patientRecordNumber === "SDY-2026-9955");
    expect(rows.map((row) => row.appointmentId)).toEqual([earlier.id, later.id]);
    expect(rows[0]).toMatchObject({ patientName: "Mario Uji", foodRecall: "BELUM", bia: "BELUM" });
    expect(rows[0].serviceName).not.toBe("");
    expect(rows[0].staffName).not.toBe("");

    await unwrap(saveFoodRecallByNurse({ appointmentId: earlier.id, entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi" }] }));
    const { measurementId } = await unwrap(startBiaMeasurement(earlier.id));
    const afterStart = (await listNurseWorklist()).find((row) => row.appointmentId === earlier.id);
    expect(afterStart).toMatchObject({ foodRecall: "TERISI", bia: "BELUM" });
    await unwrap(saveBiaNumbers({ measurementId, version: 1, numbers: { ...EMPTY_BIA_INPUT, bodyFatPercent: "28,5" }, note: "" }));
    expect((await listNurseWorklist()).find((row) => row.appointmentId === earlier.id)).toMatchObject({ bia: "ANGKA" });
  });

  it("halaman Tangani: hanya data seperlunya, dengan alergi; null di luar batas", async () => {
    const appointment = await booking();
    const visit = await getNurseVisit(appointment.id);
    expect(visit).not.toBeNull();
    expect(Object.keys(visit!.patient)).toEqual(["name", "medicalRecordNumber", "allergies"]);
    expect(visit!.patient).toEqual({ name: "Mario Uji", medicalRecordNumber: "SDY-2026-9955", allergies: "Udang" });
    expect(visit!.foodRecall).toMatchObject({ appointmentId: appointment.id, state: "NOT_OFFERED", entries: [] });
    expect(visit!.bia).toMatchObject({ active: null, points: [] });
    expect(JSON.stringify(visit)).not.toMatch(/Diabetes|Rahasia/);

    expect(await getNurseVisit((await booking("HADIR", -1)).id)).toBeNull();
    expect(await getNurseVisit((await booking("SELESAI")).id)).toBeNull();
    expect(await getNurseVisit("tidak-ada")).toBeNull();
  });

  it("dokter tidak memakai daftar dan halaman perawat", async () => {
    actor.role = "DOKTER";
    await expect(listNurseWorklist()).rejects.toThrow("forbidden: nurse:work");
    await expect(getNurseVisit("apa-saja")).rejects.toThrow("forbidden: nurse:work");
  });
});
