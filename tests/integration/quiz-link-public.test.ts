// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { quizLinkCode } from "@/server/quiz-link-code";
import { getQuizLinkPage, submitQuizLink } from "@/server/quiz-link-public";
import { aestheticReturningPatient, slimmingNewPatient } from "../fixtures/quiz-answers-v2";
import { unwrap } from "./unwrap";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "link-kuis-publik-uji";
const WA = "6281277800001";
const HOUR = 60 * 60 * 1000;
const CLOSED = "Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp.";
const IDENTITY = { birthDate: "1990-05-17", gender: "P", occupation: "Guru", address: "Jl. Uji Link No. 1, Manado" };

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { action: "intake.link-submit" } });
}

describe("halaman link kuis (publik)", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(input: { source?: BookingSource; status?: AppointmentStatus; offsetHours?: number; bookingFee?: number | null } = {}) {
    slot += 1;
    const startAt = new Date(base + (input.offsetHours ?? 48 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: `LNK-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: input.source ?? "WHATSAPP",
        status: input.status ?? "MENUNGGU_KONFIRMASI",
        bookingFee: input.bookingFee === undefined ? 100000 : input.bookingFee,
        branchId,
        staffId,
        patientId,
      },
    });
  }

  const submission = (code: string, answers: unknown, identity: unknown = IDENTITY) => ({
    code,
    answers,
    identity,
    consentData: true,
    consentFee: true,
    website: "",
  });

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "dr. Link", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Link",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7780", name: "Maria Link Uji", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("menampilkan nama depan, jadwal, kuis lengkap, kolom kosong, dan persetujuan biaya", async () => {
    const b = await booking();
    expect(await unwrap(getQuizLinkPage(quizLinkCode(b.id, 0)))).toEqual({
      state: "OPEN",
      firstName: "Maria",
      serviceName: "Konsultasi",
      startAt: b.startAt,
      staffName: "dr. Link",
      branchName: "Cabang Link",
      kind: "LENGKAP",
      missing: ["birthDate", "gender", "occupation", "address"],
      feeConsent: { bookingFee: 100000 },
    });
  });

  it("kirim kuis membuat isian TERISI dan melengkapi kolom kosong pasien tanpa menimpa yang terisi", async () => {
    await prisma.patient.update({ where: { id: patientId }, data: { occupation: "Dosen", address: "" } });
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    const page = await unwrap(getQuizLinkPage(code));
    expect(page).toMatchObject({ missing: ["birthDate", "gender", "address"] });

    expect(await unwrap(submitQuizLink(submission(code, slimmingNewPatient)))).toEqual({ state: "SUBMITTED" });

    const intake = await prisma.intake.findUniqueOrThrow({ where: { appointmentId: b.id } });
    expect(intake).toMatchObject({
      status: "TERISI",
      kind: "LENGKAP",
      purpose: "SLIMMING",
      patientId,
      name: "Maria Link Uji",
      whatsapp: WA,
      occupation: "Dosen",
      address: "Jl. Uji Link No. 1, Manado",
      claimsReturning: null,
    });
    expect(intake.submittedAt).not.toBeNull();
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(patient).toMatchObject({ occupation: "Dosen", gender: "P", address: "Jl. Uji Link No. 1, Manado" });
    expect(patient.birthDate?.toISOString().slice(0, 10)).toBe("1990-05-17");

    expect(await unwrap(getQuizLinkPage(code))).toEqual({ state: "SUBMITTED" });
    expect(await prisma.auditLog.count({ where: { action: "intake.link-submit", entityId: intake.id } })).toBe(1);
  });

  it("data diri sudah lengkap: tidak ada kolom yang ditanyakan dan data pasien tidak tersentuh", async () => {
    await prisma.patient.update({
      where: { id: patientId },
      data: { birthDate: new Date("1985-01-02T00:00:00Z"), gender: "L", occupation: "Pedagang", address: "Tondano" },
    });
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    expect(await unwrap(getQuizLinkPage(code))).toMatchObject({ missing: [] });

    await unwrap(submitQuizLink(submission(code, slimmingNewPatient, {})));

    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).toMatchObject({
      gender: "L",
      occupation: "Pedagang",
      address: "Tondano",
    });
  });

  it("kirim dua kali menghasilkan satu isian", async () => {
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    const [first, second] = await Promise.all([
      submitQuizLink(submission(code, slimmingNewPatient)),
      submitQuizLink(submission(code, slimmingNewPatient)),
    ]);
    expect(first).toEqual({ ok: true, data: { state: "SUBMITTED" } });
    expect(second).toEqual({ ok: true, data: { state: "SUBMITTED" } });
    expect(await prisma.intake.count({ where: { appointmentId: b.id } })).toBe(1);
  });

  it("pasien yang sudah punya isian lengkap mendapat kuis pendek; jenis yang salah ditolak", async () => {
    const earlier = await booking({ status: "SELESAI", offsetHours: -72 });
    await prisma.intake.create({
      data: { appointmentId: earlier.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    expect(await unwrap(getQuizLinkPage(code))).toMatchObject({ kind: "PENDEK" });

    expect(await submitQuizLink(submission(code, slimmingNewPatient))).toEqual({
      ok: false,
      error: "Form ini sudah diperbarui. Muat ulang halaman lalu isi lagi.",
    });
    await unwrap(submitQuizLink(submission(code, aestheticReturningPatient)));
    expect(await prisma.intake.findUniqueOrThrow({ where: { appointmentId: b.id } })).toMatchObject({
      kind: "PENDEK",
      purpose: "AESTHETIC",
    });
  });

  it("link tidak berlaku: dibatalkan, lewat jadwal, booking situs, kode diubah, atau versi lama", async () => {
    const cancelled = await booking({ status: "DIBATALKAN" });
    const past = await booking({ status: "TERKONFIRMASI", offsetHours: -2 });
    const site = await booking({ source: "SITUS" });
    const open = await booking();
    const tampered = quizLinkCode(open.id, 0).slice(0, -1) + (quizLinkCode(open.id, 0).endsWith("A") ? "B" : "A");

    for (const code of [quizLinkCode(cancelled.id, 0), quizLinkCode(past.id, 0), quizLinkCode(site.id, 0), tampered, "rusak"]) {
      expect(await unwrap(getQuizLinkPage(code))).toEqual({ state: "CLOSED" });
    }
    expect(await submitQuizLink(submission(quizLinkCode(cancelled.id, 0), slimmingNewPatient))).toEqual({
      ok: false,
      error: CLOSED,
    });

    await prisma.intake.create({
      data: { appointmentId: open.id, patientId, status: "MENUNGGU_DIISI", kind: "LENGKAP", linkVersion: 1 },
    });
    expect(await unwrap(getQuizLinkPage(quizLinkCode(open.id, 0)))).toEqual({ state: "CLOSED" });
    expect(await unwrap(getQuizLinkPage(quizLinkCode(open.id, 1)))).toMatchObject({ state: "OPEN" });
  });

  it("Ganti link atau pembatalan saat customer sedang mengisi: Kirim ditolak tanpa menyimpan apa pun", async () => {
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    await unwrap(getQuizLinkPage(code));
    // Admin menekan Ganti link sementara customer masih di tengah kuis.
    await prisma.intake.create({
      data: { appointmentId: b.id, patientId, status: "MENUNGGU_DIISI", kind: "LENGKAP", linkVersion: 1 },
    });
    expect(await submitQuizLink(submission(code, slimmingNewPatient))).toEqual({ ok: false, error: CLOSED });
    expect((await prisma.intake.findUniqueOrThrow({ where: { appointmentId: b.id } })).status).toBe("MENUNGGU_DIISI");

    const other = await booking();
    const otherCode = quizLinkCode(other.id, 0);
    await prisma.appointment.update({ where: { id: other.id }, data: { status: "TIDAK_HADIR" } });
    expect(await submitQuizLink(submission(otherCode, slimmingNewPatient))).toEqual({ ok: false, error: CLOSED });
    expect(await prisma.intake.count({ where: { appointmentId: other.id } })).toBe(0);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).occupation).toBeNull();
  });

  it("kuis yang dibuka sebelum jam mulai masih bisa dikirim sampai jam selesai (keputusan pemilik 2 Okt 2026)", async () => {
    const now = Date.now();
    const late = await prisma.appointment.create({
      data: {
        code: "LNK-LATE",
        type: "KONSULTASI",
        startAt: new Date(now - 10 * 60 * 1000),
        endAt: new Date(now + 20 * 60 * 1000),
        source: "WALK_IN",
        status: "MENUNGGU_KONFIRMASI",
        bookingFee: null,
        branchId,
        staffId,
        patientId,
      },
    });
    const code = quizLinkCode(late.id, 0);
    // Membuka link setelah jam mulai tetap ditolak (spec 5)...
    expect(await unwrap(getQuizLinkPage(code))).toEqual({ state: "CLOSED" });
    // ...tetapi Kirim dari halaman yang sudah terbuka diterima sampai jam selesai.
    expect(await unwrap(submitQuizLink(submission(code, slimmingNewPatient)))).toEqual({ state: "SUBMITTED" });
    expect((await prisma.intake.findUniqueOrThrow({ where: { appointmentId: late.id } })).status).toBe("TERISI");

    const over = await booking({ status: "TERKONFIRMASI", offsetHours: -2 });
    expect(await submitQuizLink(submission(quizLinkCode(over.id, 0), slimmingNewPatient))).toEqual({
      ok: false,
      error: CLOSED,
    });
  });

  it("persetujuan: data selalu wajib, biaya hanya bila booking berbiaya dan belum diverifikasi", async () => {
    const waiting = await booking();
    expect(
      await submitQuizLink({ ...submission(quizLinkCode(waiting.id, 0), slimmingNewPatient), consentData: false }),
    ).toEqual({ ok: false, error: "Centang persetujuan data untuk melanjutkan." });
    expect(
      await submitQuizLink({ ...submission(quizLinkCode(waiting.id, 0), slimmingNewPatient), consentFee: false }),
    ).toEqual({ ok: false, error: "Centang persetujuan biaya booking untuk melanjutkan." });

    const confirmed = await booking({ status: "TERKONFIRMASI" });
    const code = quizLinkCode(confirmed.id, 0);
    expect(await unwrap(getQuizLinkPage(code))).toMatchObject({ feeConsent: null });
    await unwrap(submitQuizLink({ ...submission(code, slimmingNewPatient), consentFee: false }));
  });

  it("kolom jebakan bot ditolak", async () => {
    const b = await booking();
    expect(await submitQuizLink({ ...submission(quizLinkCode(b.id, 0), slimmingNewPatient), website: "spam" })).toEqual({
      ok: false,
      error: "Form gagal dikirim. Muat ulang halaman lalu coba lagi.",
    });
  });
});
