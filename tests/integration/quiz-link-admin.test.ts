// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { recordAppointmentMessage } from "@/server/appointment-message";
import { isValidQuizLinkCode, quizLinkCode } from "@/server/quiz-link-code";
import { getQuizLink, rotateQuizLink } from "@/server/quiz-link-admin";
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

const SLUG = "link-kuis-admin-uji";
const WA = "6281277900001";
const HOUR = 60 * 60 * 1000;
const SITE = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { action: "intake.link-rotate" } });
}

describe("link kuis di panel admin", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(status: AppointmentStatus = "MENUNGGU_KONFIRMASI") {
    slot += 1;
    const startAt = new Date(base + (48 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: `LKA-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: "WALK_IN",
        status,
        branchId,
        staffId,
        patientId,
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "dr. Admin Link", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Admin Link",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7790", name: "Budi Walkin", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("mengambil link, teks WA terpisah ke nomor pasien, dan jadwal yang tertulis", async () => {
    const b = await booking();
    const info = (await unwrap(getQuizLink(b.id)))!;
    expect(info.url).toBe(`${SITE}/isi#${quizLinkCode(b.id, 0)}`);
    expect(info.message.text).toContain("Halo Budi, ini SunDY Clinic.");
    expect(info.message.text).toContain(info.url);
    expect(info.message.link).toMatch(/^https:\/\/wa\.me\/6281277900001\?text=/);
    expect(info.scheduledFor).toEqual(b.startAt);
  });

  it("tidak ada link setelah kuis dikirim atau bila booking tidak aktif", async () => {
    const submitted = await booking();
    await prisma.intake.create({
      data: { appointmentId: submitted.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    expect(await unwrap(getQuizLink(submitted.id))).toBeNull();
    expect(await unwrap(getQuizLink((await booking("DIBATALKAN")).id))).toBeNull();
    expect(await getQuizLink("tidak-ada")).toEqual({ ok: false, error: "Booking tidak ditemukan." });
  });

  it("Ganti link menaikkan versi, link lama tidak berlaku, dan tercatat di audit", async () => {
    const b = await booking();
    const old = quizLinkCode(b.id, 0);

    const first = await unwrap(rotateQuizLink(b.id));
    expect(await prisma.intake.findUniqueOrThrow({ where: { appointmentId: b.id } })).toMatchObject({
      status: "MENUNGGU_DIISI",
      kind: "LENGKAP",
      linkVersion: 1,
      patientId,
    });
    expect(first.url).toBe(`${SITE}/isi#${quizLinkCode(b.id, 1)}`);
    expect(isValidQuizLinkCode(old, 1)).toBe(false);

    const second = await unwrap(rotateQuizLink(b.id));
    expect(second.url).toBe(`${SITE}/isi#${quizLinkCode(b.id, 2)}`);
    expect(await prisma.auditLog.count({ where: { action: "intake.link-rotate", entityId: b.id } })).toBe(2);
  });

  it("Ganti link ditolak untuk booking yang linknya tidak berlaku", async () => {
    expect(await rotateQuizLink((await booking("TIDAK_HADIR")).id)).toEqual({
      ok: false,
      error: "Link kuis tidak tersedia untuk booking ini.",
    });
  });

  it("pengiriman link via WA tercatat sebagai LINK_KUIS selama link berlaku", async () => {
    const b = await booking();
    await unwrap(recordAppointmentMessage({ appointmentId: b.id, kind: "LINK_KUIS", scheduledFor: b.startAt }));
    expect(await prisma.appointmentMessage.count({ where: { appointmentId: b.id, kind: "LINK_KUIS" } })).toBe(1);

    await prisma.intake.create({
      data: { appointmentId: b.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    expect(await recordAppointmentMessage({ appointmentId: b.id, kind: "LINK_KUIS", scheduledFor: b.startAt })).toEqual({
      ok: false,
      error: "Link kuis tidak tersedia untuk booking ini.",
    });
  });

  it("semua aksi memakai booking:manage, yang dimiliki resepsionis", async () => {
    const b = await booking();
    vi.mocked(requireCapability).mockClear();
    await getQuizLink(b.id);
    await rotateQuizLink(b.id);
    const capabilities = vi.mocked(requireCapability).mock.calls.map(([capability]) => capability);
    expect(new Set(capabilities)).toEqual(new Set(["booking:manage"]));
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
  });
});
