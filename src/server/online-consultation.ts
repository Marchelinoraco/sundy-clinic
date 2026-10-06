"use server";

import type { Appointment } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { generateBookingCode } from "@/lib/booking-code";
import { prisma } from "@/lib/db";
import { boundsOf, validateContactWindows, windowLabel } from "@/lib/online-consultation";
import { bookingFeeFor } from "@/lib/payment";
import { safeRevalidatePath } from "@/lib/revalidate";
import { ACTIVE_STATUSES, rejectedChangeError } from "@/server/appointment-guard";
import { recordAudit } from "@/server/audit";
import { lastHeightCm } from "@/server/encounter-store";
import { getClinicSetting } from "@/server/clinic-setting";
import { loadOnlineService, ONLINE_SERVICE_OFF, onlineBranchId } from "@/server/online-store";
import { requireCapability } from "@/server/session";

const ONLINE_SOURCES: readonly string[] = ["WHATSAPP", "TELEPON"];
const NOT_ONLINE = "Hanya booking online yang punya waktu luang.";

class StatusChanged extends Error {}

function revalidateOnlineViews() {
  safeRevalidatePath("/admin/booking");
  safeRevalidatePath("/admin/pengingat");
  safeRevalidatePath("/admin");
}

/** Booking online dari panel (spec 5.1): tanpa slot, dengan 1–3 rentang waktu luang. */
export async function createOnlineAppointment(input: {
  patientId: string;
  staffId: string;
  source: "WHATSAPP" | "TELEPON";
  windows: unknown;
  notes?: string;
}): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    if (!ONLINE_SOURCES.includes(String(input?.source))) {
      throw new UserFacingError("Booking online dicatat dari WhatsApp atau telepon.");
    }
    const checked = validateContactWindows(input?.windows, { now: new Date(), audience: "STAFF" });
    if (!checked.ok) throw new UserFacingError(checked.message);

    const [service, branchId, setting, staff, patient] = await Promise.all([
      loadOnlineService(),
      onlineBranchId(),
      getClinicSetting(),
      prisma.staff.findUnique({ where: { id: String(input?.staffId ?? "") }, select: { id: true, role: true, isActive: true } }),
      prisma.patient.findUnique({
        where: { id: String(input?.patientId ?? "") },
        select: { id: true, mergedInto: { select: { name: true, medicalRecordNumber: true } } },
      }),
    ]);
    if (!service) throw new UserFacingError(ONLINE_SERVICE_OFF);
    if (!branchId) throw new UserFacingError("Belum ada cabang aktif.");
    if (!staff || !staff.isActive || staff.role !== "DOKTER") {
      throw new UserFacingError("Konsultasi online harus ditangani dokter.");
    }
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
    if (patient.mergedInto) {
      throw new UserFacingError(
        `Pasien ini rangkap dari ${patient.mergedInto.name} (${patient.mergedInto.medicalRecordNumber}). Buat booking untuk pasien itu.`,
      );
    }

    const source = input.source;
    const first = boundsOf(checked.windows);
    const created = await prisma.appointment.create({
      data: {
        code: generateBookingCode(),
        type: "KONSULTASI",
        channel: "ONLINE",
        startAt: first.startAt,
        endAt: first.endAt,
        source,
        notes: input.notes?.trim() || undefined,
        bookingFee: bookingFeeFor(source, setting.bookingFee),
        servicePrice: service.promoPrice,
        branchId,
        staffId: staff.id,
        patientId: patient.id,
        serviceId: service.id,
        contactWindows: { create: checked.windows.map((w) => ({ startAt: w.startAt, endAt: w.endAt })) },
      },
    });

    await recordAudit({
      actor,
      action: "appointment.create",
      entity: "Appointment",
      entityId: created.id,
      summary: `${created.code} — online, ${checked.windows.length} waktu luang mulai ${windowLabel(first)}`,
    });
    revalidateOnlineViews();
    return created;
  });
}

/**
 * Ubah waktu luang (spec 5.3): seluruh rentang diganti dalam satu transaksi, dan jadwal
 * booking mengikuti rentang pertama. Hanya untuk booking online yang masih aktif.
 */
export async function updateContactWindows(input: { appointmentId: string; windows: unknown }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const id = String(input?.appointmentId ?? "");
    const booking = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, code: true, channel: true, _count: { select: { contactWindows: true } } },
    });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.channel !== "ONLINE") throw new UserFacingError(NOT_ONLINE);
    const checked = validateContactWindows(input?.windows, { now: new Date(), audience: "STAFF" });
    if (!checked.ok) throw new UserFacingError(checked.message);
    const first = boundsOf(checked.windows);

    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.appointment.updateMany({
          where: { id, channel: "ONLINE", status: { in: ACTIVE_STATUSES } },
          data: { startAt: first.startAt, endAt: first.endAt },
        });
        if (count === 0) throw new StatusChanged();
        await tx.contactWindow.deleteMany({ where: { appointmentId: id } });
        await tx.contactWindow.createMany({
          data: checked.windows.map((w) => ({ appointmentId: id, startAt: w.startAt, endAt: w.endAt })),
        });
      });
    } catch (error) {
      if (error instanceof StatusChanged) throw await rejectedChangeError(id);
      throw error;
    }

    await recordAudit({
      actor,
      action: "appointment.update-windows",
      entity: "Appointment",
      entityId: id,
      summary: `${booking.code}: ${booking._count.contactWindows} → ${checked.windows.length} waktu luang, mulai ${windowLabel(first)}`,
    });
    revalidateOnlineViews();
  });
}

/**
 * Mulai konsultasi (spec 6.2): Terkonfirmasi → Hadir dengan jam sebenarnya, lalu kunjungan
 * dibuat dalam transaksi yang sama. Klik kedua atau dokter lain mendapat kunjungan yang sama.
 */
export async function startOnlineConsultation(appointmentId: string): Promise<ActionResult<{ encounterId: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const id = String(appointmentId ?? "");
    const booking = await prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        channel: true,
        patientId: true,
        service: { select: { durationMin: true } },
        encounter: { select: { id: true } },
      },
    });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.channel !== "ONLINE") throw new UserFacingError("Hanya untuk konsultasi online.");
    if (booking.encounter) return { encounterId: booking.encounter.id };

    const now = new Date();
    const endAt = new Date(now.getTime() + (booking.service?.durationMin ?? 30) * 60_000);
    const encounterId = await prisma.$transaction(async (tx) => {
      const { count } = await tx.appointment.updateMany({
        where: { id, channel: "ONLINE", status: "TERKONFIRMASI", patientId: { not: null } },
        data: { status: "HADIR", startAt: now, endAt },
      });
      if (count === 0) return null;
      const created = await tx.encounter.create({
        data: {
          appointmentId: id,
          createdById: actor.staffId,
          createdByName: actor.name,
          heightCm: await lastHeightCm(tx, booking.patientId!),
        },
        select: { id: true },
      });
      return created.id;
    });

    if (encounterId === null) {
      // Kalah dari klik lain yang sudah memulai: pakai kunjungannya.
      const existing = await prisma.encounter.findUnique({ where: { appointmentId: id }, select: { id: true } });
      if (existing) return { encounterId: existing.id };
      throw await rejectedChangeError(id, true);
    }

    await recordAudit({ actor, action: "appointment.start-online", entity: "Appointment", entityId: id, summary: booking.code });
    await recordAudit({ actor, action: "encounter.create", entity: "Encounter", entityId: encounterId, summary: booking.code });
    revalidateOnlineViews();
    safeRevalidatePath(`/admin/kunjungan/${encounterId}`);
    if (booking.patientId) safeRevalidatePath(`/admin/pasien/${booking.patientId}`);
    return { encounterId };
  });
}

/** Tidak terhubung (spec 6.3): satu percobaan tercatat, status booking tetap. */
export async function recordContactAttempt(appointmentId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const id = String(appointmentId ?? "");
    const booking = await prisma.appointment.findUnique({ where: { id }, select: { code: true, channel: true, status: true } });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.channel !== "ONLINE") throw new UserFacingError("Hanya untuk konsultasi online.");
    if (booking.status !== "TERKONFIRMASI") throw await rejectedChangeError(id);

    await prisma.contactAttempt.create({ data: { appointmentId: id, at: new Date(), staffId: actor.staffId, staffName: actor.name } });
    await recordAudit({ actor, action: "appointment.contact-failed", entity: "Appointment", entityId: id, summary: booking.code });
    revalidateOnlineViews();
  });
}
