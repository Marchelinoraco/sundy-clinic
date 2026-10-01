// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import {
  countPendingBookings,
  getTransferInstruction,
  listPendingBookings,
  searchBookings,
} from "@/server/appointment";
import { requireCapability } from "@/server/session";
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

const SLUG = "antrian-booking-uji";
const WA = "6281277300001";
const HOUR = 60 * 60 * 1000;
const BANK = { bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" };

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("antrean menunggu, pencarian booking, dan instruksi transfer", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let originalSetting: { bankName: string | null; bankAccountNumber: string | null; bankAccountHolder: string | null };
  let slot = 0;
  // Jam bulat; tiap booking memakai jam berbeda agar tidak bertabrakan.
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(input: {
    source: BookingSource;
    status?: AppointmentStatus;
    createdAt?: Date;
    startAt?: Date;
    bookingFee?: number | null;
    withPatient?: boolean;
    code?: string;
  }) {
    slot += 1;
    const startAt = input.startAt ?? new Date(base + (240 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: input.code ?? `ANT-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: input.source,
        status: input.status ?? "MENUNGGU_KONFIRMASI",
        bookingFee: input.bookingFee === undefined ? 100000 : input.bookingFee,
        createdAt: input.createdAt ?? new Date(),
        branchId,
        staffId,
        patientId: input.withPatient === false ? null : patientId,
      },
    });
  }

  const ids = (rows: { id: string; staffId: string }[]) => rows.filter((r) => r.staffId === staffId).map((r) => r.id);

  beforeAll(async () => {
    originalSetting = await prisma.clinicSetting.findUniqueOrThrow({
      where: { id: 1 },
      select: { bankName: true, bankAccountNumber: true, bankAccountHolder: true },
    });
    await prisma.clinicSetting.update({ where: { id: 1 }, data: BANK });
  });

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Antrian", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Antrian",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7730", name: "Maria Antrian", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.clinicSetting.update({ where: { id: 1 }, data: originalSetting });
    await prisma.$disconnect();
  });

  it("daftar menunggu memuat booking WA/telepon berbiaya beserta batasnya, yang paling mendesak di atas", async () => {
    const overdue = await booking({ source: "TELEPON", createdAt: new Date(Date.now() - 30 * 24 * HOUR) });
    const site = await booking({ source: "SITUS", withPatient: false, createdAt: new Date(Date.now() - HOUR) });
    // Jadwal 2–3 jam lagi: batas transfernya jadwal itu sendiri.
    const soon = await booking({ source: "WHATSAPP", startAt: new Date(base + 3 * HOUR) });
    await booking({ source: "WALK_IN", bookingFee: null });
    await booking({ source: "WHATSAPP", bookingFee: null });
    await booking({ source: "WHATSAPP", status: "TERKONFIRMASI" });

    const pending = (await listPendingBookings()).filter((row) => row.staffId === staffId);

    expect(pending.map((row) => row.id)).toEqual([overdue.id, soon.id, site.id]);
    expect(pending.map((row) => [row.deadlineKind, row.overdue])).toEqual([
      ["TRANSFER", true],
      ["TRANSFER", false],
      ["EXPIRES", false],
    ]);
    expect(pending[1].deadline).toEqual(soon.startAt);
    // Lewat batas tetapi tidak dibatalkan otomatis (B5).
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: overdue.id } })).status).toBe(
      "MENUNGGU_KONFIRMASI",
    );
    expect(await countPendingBookings()).toBe((await listPendingBookings()).length);
  });

  it("mencari per kode persis tanpa peduli huruf besar/kecil", async () => {
    const target = await booking({ source: "WHATSAPP", code: "SDY-Q7W2" });
    expect(ids(await searchBookings("sdy-q7w2"))).toEqual([target.id]);
    expect(ids(await searchBookings("SDY-Q7"))).toEqual([]);
  });

  it("mencari per nama pasien sebagian, dan per nama atau nomor di isian booking situs yang belum dicocokkan", async () => {
    const mine = await booking({ source: "WHATSAPP" });
    const unmatched = await booking({ source: "SITUS", withPatient: false });
    await prisma.intake.create({
      data: {
        appointmentId: unmatched.id,
        status: "MENUNGGU_DIISI",
        kind: "PENDEK",
        name: "Stevanie Isian",
        whatsapp: "6281277300009",
      },
    });

    expect(ids(await searchBookings("antrian"))).toEqual([mine.id]);
    expect(ids(await searchBookings("stevanie"))).toEqual([unmatched.id]);
    expect(ids(await searchBookings("0812 7730 0009"))).toEqual([unmatched.id]);
  });

  it("mengenali nomor WA yang ditempel", async () => {
    const mine = await booking({ source: "TELEPON" });
    expect(ids(await searchBookings("+62 812-7730-0001"))).toEqual([mine.id]);
    expect(ids(await searchBookings("0812 7730 0001"))).toEqual([mine.id]);
  });

  it("spasi saja tidak mencari apa pun, dan angka pendek tidak dicocokkan ke nomor WA", async () => {
    await booking({ source: "WHATSAPP" });
    expect(await searchBookings("   ")).toEqual([]);
    expect(ids(await searchBookings("12"))).toEqual([]);
  });

  it("mencakup jadwal 30 hari ke belakang sampai seterusnya, terbaru di atas", async () => {
    const today = witaDateString(new Date());
    const daysAgo = (days: number) => combineWitaDateAndMinutes(addDaysToDateString(today, -days), 12 * 60);
    const recent = await booking({ source: "WHATSAPP", status: "SELESAI", startAt: daysAgo(29) });
    await booking({ source: "WHATSAPP", status: "SELESAI", startAt: daysAgo(31) });
    const later = await booking({ source: "WHATSAPP" });

    expect(ids(await searchBookings("antrian"))).toEqual([later.id, recent.id]);
  });

  it("paling banyak 50 hasil", async () => {
    await prisma.appointment.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        code: `ANT-M${index}`,
        type: "KONSULTASI" as const,
        source: "WHATSAPP" as const,
        status: "DIBATALKAN" as const,
        branchId,
        staffId,
        patientId,
        startAt: new Date(base + (500 + index) * HOUR),
        endAt: new Date(base + (500 + index) * HOUR + 30 * 60 * 1000),
      })),
    });

    const results = await searchBookings("antrian");
    expect(results).toHaveLength(50);
    expect(results[0].code).toBe("ANT-M54");
  });

  it("instruksi transfer memakai biaya yang disalin ke booking dan rekening dari Pengaturan", async () => {
    const created = await booking({ source: "WHATSAPP", bookingFee: 150000 });
    const instruction = (await unwrap(getTransferInstruction(created.id)))!;
    expect(instruction.text).toContain("Rp 150.000");
    expect(instruction.text).toContain("BCA 1234567890 a.n. SunDY Clinic");
    expect(instruction.link).toMatch(/^https:\/\/wa\.me\/6281277300001\?text=/);
    expect(instruction.missingBankAccount).toBe(false);
  });

  it("menandai rekening yang belum lengkap di Pengaturan", async () => {
    const created = await booking({ source: "TELEPON" });
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bankName: null } });
    try {
      expect((await unwrap(getTransferInstruction(created.id)))!.missingBankAccount).toBe(true);
    } finally {
      await prisma.clinicSetting.update({ where: { id: 1 }, data: BANK });
    }
  });

  it("walk-in, booking situs, dan booking terkonfirmasi tidak punya instruksi transfer", async () => {
    const bookings = [
      await booking({ source: "WALK_IN", bookingFee: null }),
      await booking({ source: "SITUS", withPatient: false }),
      await booking({ source: "WHATSAPP", status: "TERKONFIRMASI" }),
    ];
    for (const b of bookings) {
      expect(await unwrap(getTransferInstruction(b.id))).toBeNull();
    }
  });

  it("booking yang tidak ada ditolak dengan pesan", async () => {
    expect(await getTransferInstruction("tidak-ada")).toEqual({ ok: false, error: "Booking tidak ditemukan." });
  });

  it("semua fungsi memakai booking:manage, yang dimiliki resepsionis", async () => {
    vi.mocked(requireCapability).mockClear();
    await listPendingBookings();
    await countPendingBookings();
    await searchBookings("antrian");
    await getTransferInstruction("tidak-ada");

    const capabilities = vi.mocked(requireCapability).mock.calls.map(([capability]) => capability);
    expect(new Set(capabilities)).toEqual(new Set(["booking:manage"]));
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
  });
});
