// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createPatient, findPatientsByWhatsapp, listRecentPatients, searchPatients } from "@/server/patient";
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

const SLUG = "info-pasien-uji";
const WA = "6281277200001";
const NEW_WA = "6281277200002";
const HOUR = 60 * 60 * 1000;
const LAST_VISIT = new Date("2026-09-24T03:00:00Z");

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: { in: [WA, NEW_WA] } } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("info booking di pencarian pasien", () => {
  let patientId: string;
  let nextBooking: Date;

  beforeAll(async () => {
    await cleanup();
    const staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Info", role: "DOKTER" } })).id;
    const branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Info",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-7720", name: "Maria Infobooking", whatsapp: WA, lastVisitAt: LAST_VISIT },
      })
    ).id;
    // Jam bulat: tiap booking di jam berbeda agar tidak bertabrakan.
    const base = Math.ceil(Date.now() / HOUR) * HOUR;
    const book = (code: string, offsetHours: number, status: AppointmentStatus) =>
      prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          source: "WHATSAPP",
          status,
          branchId,
          staffId,
          patientId,
          startAt: new Date(base + offsetHours * HOUR),
          endAt: new Date(base + offsetHours * HOUR + 30 * 60 * 1000),
        },
      });
    await book("INFO-LEWAT", -48, "TERKONFIRMASI"); // sudah lewat
    await book("INFO-BATAL", 24, "DIBATALKAN"); // lebih dekat, tetapi dibatalkan
    nextBooking = (await book("INFO-AKTIF", 72, "MENUNGGU_KONFIRMASI")).startAt;
    await book("INFO-JAUH", 120, "TERKONFIRMASI");
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("menampilkan kunjungan terakhir dan booking aktif terdekat yang belum lewat", async () => {
    const [found] = await searchPatients("infobooking");
    expect(found).toMatchObject({ id: patientId, lastVisitAt: LAST_VISIT, nextBookingAt: nextBooking });
  });

  it("mengenali nomor yang ditempel dari WhatsApp", async () => {
    expect((await searchPatients("+62 812-7720-0001")).map((p) => p.id)).toContain(patientId);
    expect((await findPatientsByWhatsapp("0812 7720 0001")).map((p) => p.nextBookingAt)).toEqual([nextBooking]);
  });

  it("pasien baru: belum pernah berkunjung dan tanpa booking", async () => {
    const created = await unwrap(createPatient({ name: "Pasien Infobaru", whatsapp: NEW_WA }));
    expect(created).toMatchObject({ lastVisitAt: null, nextBookingAt: null });
    const recent = await listRecentPatients();
    expect(recent.find((p) => p.id === created.id)).toMatchObject({ lastVisitAt: null, nextBookingAt: null });
  });
});
