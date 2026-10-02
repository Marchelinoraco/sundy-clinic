// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getTransferInstruction } from "@/server/appointment";
import { getBookingMessage } from "@/server/appointment-message";
import { quizLinkCode } from "@/server/quiz-link-code";
import { getReminderWorklist } from "@/server/reminder";
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

const SLUG = "link-kuis-pesan-uji";
const WA = "6281277950001";
const HOUR = 60 * 60 * 1000;

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("link kuis di pesan C1/C2", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(status: AppointmentStatus, source: "WHATSAPP" | "SITUS" = "WHATSAPP") {
    slot += 1;
    const startAt = new Date(base + (48 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: `LKP-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source,
        status,
        bookingFee: 100000,
        branchId,
        staffId,
        patientId,
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "dr. Pesan Link", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Pesan Link",
          address: "Jl. Uji",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7795", name: "Citra Pesan", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("instruksi transfer memuat link selama kuis belum diisi, lalu tidak lagi", async () => {
    const b = await booking("MENUNGGU_KONFIRMASI");
    const link = `/isi#${quizLinkCode(b.id, 0)}`;
    expect((await unwrap(getTransferInstruction(b.id)))!.text).toContain(link);
    expect((await unwrap(getBookingMessage(b.id)))!.text).toContain(link);

    await prisma.intake.create({
      data: { appointmentId: b.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    expect((await unwrap(getTransferInstruction(b.id)))!.text).not.toContain("/isi#");
  });

  it("konfirmasi dan pengingat memuat link; booking situs tidak pernah", async () => {
    const confirmed = await booking("TERKONFIRMASI");
    const link = `/isi#${quizLinkCode(confirmed.id, 0)}`;
    expect((await unwrap(getBookingMessage(confirmed.id)))!.text).toContain(link);

    const worklist = await getReminderWorklist();
    const row = worklist.confirm.find((r) => r.appointmentId === confirmed.id)!;
    expect(row.confirmation!.text).toContain(link);
    expect(row.reminder!.text).toContain(link);

    const site = await booking("TERKONFIRMASI", "SITUS");
    expect((await unwrap(getBookingMessage(site.id)))!.text).not.toContain("/isi#");
  });
});
