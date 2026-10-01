// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  getBookingMessage,
  recordAppointmentMessage,
  recordReminderReply,
  revokeAppointmentMessage,
} from "@/server/appointment-message";
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

const SLUG = "pesan-booking-uji";
const WA = "6281277400001";
const HOUR = 60 * 60 * 1000;

async function cleanup() {
  // Catatan pesan ikut terhapus bersama bookingnya (onDelete: Cascade).
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("catatan pesan booking", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(input: { source?: BookingSource; status?: AppointmentStatus; bookingFee?: number | null }) {
    slot += 1;
    const startAt = new Date(base + (48 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: `MSG-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: input.source ?? "WHATSAPP",
        status: input.status ?? "TERKONFIRMASI",
        bookingFee: input.bookingFee === undefined ? 100000 : input.bookingFee,
        branchId,
        staffId,
        patientId,
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Pesan", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Pesan",
          address: "Jl. Uji Pesan No. 1, Manado",
          mapsUrl: "https://maps.app.goo.gl/uji",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7740", name: "Maria Pesan", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("mencatat konfirmasi untuk jadwal saat itu, beserta pengirimnya", async () => {
    const confirmed = await booking({});
    const { id } = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "KONFIRMASI", scheduledFor: confirmed.startAt }));

    const saved = await prisma.appointmentMessage.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({
      appointmentId: confirmed.id,
      kind: "KONFIRMASI",
      scheduledFor: confirmed.startAt,
      sentById: "s1",
      sentByName: "Resepsionis Uji",
      revokedAt: null,
      reply: null,
    });
  });

  it("menolak jenis pesan yang tidak cocok dengan keadaan booking", async () => {
    const waiting = await booking({ status: "MENUNGGU_KONFIRMASI" });
    const confirmed = await booking({});

    expect(await recordAppointmentMessage({ appointmentId: waiting.id, kind: "KONFIRMASI", scheduledFor: waiting.startAt })).toEqual({
      ok: false,
      error: "Booking ini belum terkonfirmasi.",
    });
    expect(await recordAppointmentMessage({ appointmentId: confirmed.id, kind: "INSTRUKSI_TRANSFER", scheduledFor: confirmed.startAt })).toEqual({
      ok: false,
      error: "Booking ini tidak sedang menunggu transfer.",
    });
    expect(await recordAppointmentMessage({ appointmentId: confirmed.id, kind: "LAIN" as never, scheduledFor: confirmed.startAt })).toEqual({
      ok: false,
      error: "Jenis pesan tidak dikenal.",
    });
    await unwrap(recordAppointmentMessage({ appointmentId: waiting.id, kind: "INSTRUKSI_TRANSFER", scheduledFor: waiting.startAt }));
  });

  it("menolak pencatatan bila jadwal booking berubah sejak teks pesannya disusun", async () => {
    const confirmed = await booking({});
    const shownSchedule = confirmed.startAt;
    // Admin lain memindah jadwal setelah halaman ini dimuat.
    await prisma.appointment.update({
      where: { id: confirmed.id },
      data: {
        startAt: new Date(confirmed.startAt.getTime() + 24 * HOUR),
        endAt: new Date(confirmed.endAt.getTime() + 24 * HOUR),
      },
    });

    expect(
      await recordAppointmentMessage({ appointmentId: confirmed.id, kind: "KONFIRMASI", scheduledFor: shownSchedule }),
    ).toEqual({ ok: false, error: "Jadwal booking ini sudah berubah. Muat ulang halaman lalu kirim ulang." });
    expect(await prisma.appointmentMessage.count({ where: { appointmentId: confirmed.id } })).toBe(0);
  });

  it("membatalkan tanda sekali saja, tanpa menghapus catatannya", async () => {
    const confirmed = await booking({});
    const { id } = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT", scheduledFor: confirmed.startAt }));

    await unwrap(revokeAppointmentMessage(id));
    const revoked = await prisma.appointmentMessage.findUniqueOrThrow({ where: { id } });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedByName).toBe("Resepsionis Uji");

    expect(await revokeAppointmentMessage(id)).toEqual({
      ok: false,
      error: "Tanda ini sudah dibatalkan. Muat ulang halaman.",
    });
  });

  it("mencatat dan mengubah balasan untuk pengingat yang berlaku", async () => {
    const confirmed = await booking({});
    const { id } = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT", scheduledFor: confirmed.startAt }));

    await unwrap(recordReminderReply({ messageId: id, reply: "AKAN_DATANG" }));
    await unwrap(recordReminderReply({ messageId: id, reply: "MINTA_PINDAH" }));

    expect(await prisma.appointmentMessage.findUniqueOrThrow({ where: { id } })).toMatchObject({
      reply: "MINTA_PINDAH",
      repliedByName: "Resepsionis Uji",
    });
  });

  it("menolak balasan untuk konfirmasi, pengingat yang dibatalkan admin lain, atau jadwal lama", async () => {
    const stale = "Pengingat ini sudah tidak berlaku. Muat ulang halaman.";
    const confirmed = await booking({});
    const confirmation = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "KONFIRMASI", scheduledFor: confirmed.startAt }));
    expect(await recordReminderReply({ messageId: confirmation.id, reply: "AKAN_DATANG" })).toEqual({
      ok: false,
      error: stale,
    });

    const revoked = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT", scheduledFor: confirmed.startAt }));
    await unwrap(revokeAppointmentMessage(revoked.id));
    expect(await recordReminderReply({ messageId: revoked.id, reply: "AKAN_DATANG" })).toEqual({ ok: false, error: stale });
    expect((await prisma.appointmentMessage.findUniqueOrThrow({ where: { id: revoked.id } })).reply).toBeNull();

    const moved = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT", scheduledFor: confirmed.startAt }));
    await prisma.appointment.update({
      where: { id: confirmed.id },
      data: {
        startAt: new Date(confirmed.startAt.getTime() + 24 * HOUR),
        endAt: new Date(confirmed.endAt.getTime() + 24 * HOUR),
      },
    });
    expect(await recordReminderReply({ messageId: moved.id, reply: "AKAN_DATANG" })).toEqual({ ok: false, error: stale });

    expect(await recordReminderReply({ messageId: moved.id, reply: "LAIN" as never })).toEqual({
      ok: false,
      error: "Balasan tidak dikenal.",
    });
  });

  it("pesan lanjutan: konfirmasi untuk terkonfirmasi, instruksi untuk yang menunggu transfer, kosong untuk walk-in", async () => {
    const confirmed = await booking({});
    const message = (await unwrap(getBookingMessage(confirmed.id)))!;
    expect(message.kind).toBe("KONFIRMASI");
    expect(message.text).toContain("Alamat: Jl. Uji Pesan No. 1, Manado");
    expect(message.text).toContain("Peta: https://maps.app.goo.gl/uji");
    expect(message.text).toContain(`/cek-booking?kode=${confirmed.code}`);
    expect(message.link).toMatch(/^https:\/\/wa\.me\/6281277400001\?text=/);

    const waiting = await booking({ status: "MENUNGGU_KONFIRMASI" });
    expect((await unwrap(getBookingMessage(waiting.id)))!.kind).toBe("INSTRUKSI_TRANSFER");

    const walkIn = await booking({ source: "WALK_IN", status: "MENUNGGU_KONFIRMASI", bookingFee: null });
    expect(await unwrap(getBookingMessage(walkIn.id))).toBeNull();

    expect(await getBookingMessage("tidak-ada")).toEqual({ ok: false, error: "Booking tidak ditemukan." });
  });

  it("semua aksi memakai booking:manage, yang dimiliki resepsionis", async () => {
    const confirmed = await booking({});
    vi.mocked(requireCapability).mockClear();
    const { id } = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT", scheduledFor: confirmed.startAt }));
    await recordReminderReply({ messageId: id, reply: "AKAN_DATANG" });
    await revokeAppointmentMessage(id);
    await getBookingMessage(confirmed.id);

    const capabilities = vi.mocked(requireCapability).mock.calls.map(([capability]) => capability);
    expect(new Set(capabilities)).toEqual(new Set(["booking:manage"]));
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
  });
});
