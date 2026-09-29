// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createAppointment } from "@/server/appointment";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "biaya-booking-uji";

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-6603" } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("biaya booking pada booking admin", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;

  beforeEach(async () => {
    await cleanup();
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 100000 } });
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Biaya", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Biaya",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-6603", name: "Pasien Biaya", whatsapp: "6281200006603" },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  function create(source: "WHATSAPP" | "TELEPON" | "WALK_IN", hour: number) {
    return unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date(Date.UTC(2031, 2, 4, hour)),
        endAt: new Date(Date.UTC(2031, 2, 4, hour, 30)),
        source,
      }),
    );
  }

  it("menyalin biaya booking saat booking lewat WhatsApp atau telepon", async () => {
    expect((await create("WHATSAPP", 3)).bookingFee).toBe(100000);
    expect((await create("TELEPON", 4)).bookingFee).toBe(100000);
  });

  it("tidak mengenakan biaya booking pada walk-in", async () => {
    expect((await create("WALK_IN", 5)).bookingFee).toBeNull();
  });

  it("tidak mengubah booking lama saat biaya diubah", async () => {
    const before = await create("WHATSAPP", 6);
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 150000 } });
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 100000 } });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: before.id } })).bookingFee).toBe(100000);
  });
});
