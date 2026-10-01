"use server";

import type { RescheduleTarget } from "@/lib/booking-actions";
import {
  confirmationMessageFor,
  reminderMessageFor,
  type ReminderReplyValue,
  type WhatsAppMessage,
} from "@/lib/booking-messages";
import { MAX_LOOKBACK_DAYS } from "@/lib/confirmation-window";
import { prisma } from "@/lib/db";
import { groupReminderWork } from "@/lib/reminder-work";
import { witaDateString } from "@/lib/time";
import { closedDatesBetween } from "@/server/booking-expiry";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

/** Satu baris halaman Pengingat. Hanya identitas dan jadwal — tanpa data klinis. */
export type ReminderRow = {
  appointmentId: string;
  code: string;
  patientName: string;
  startAt: Date;
  staffName: string;
  branchName: string;
  confirmation: WhatsAppMessage | null;
  reminder: WhatsAppMessage | null;
  /** Kotak 2: hari pengingatnya sudah lewat. */
  overdue: boolean;
  /** Kotak 2: hari sebelum jadwal tutup, jadi diingatkan lebih awal. */
  shifted: boolean;
  /** Kotak 3: pengingat yang berlaku. */
  reminderSent: { messageId: string; sentAt: Date; sentByName: string; reply: ReminderReplyValue | null } | null;
  reschedule: RescheduleTarget;
};

export type ReminderWorklist = { today: string; confirm: ReminderRow[]; remind: ReminderRow[]; reminded: ReminderRow[] };

const DAY_MS = 24 * 60 * 60 * 1000;

const WORK_INCLUDE = {
  patient: { select: { name: true, whatsapp: true } },
  staff: { select: { name: true } },
  branch: { select: { name: true, address: true, mapsUrl: true } },
  service: { select: { name: true } },
  messages: {
    select: { id: true, kind: true, scheduledFor: true, sentAt: true, sentByName: true, revokedAt: true, reply: true },
  },
} as const;

/** Booking Terkonfirmasi yang jadwalnya belum lewat, dikelompokkan ke tiga kotak (spec C2 bagian 4). */
async function loadReminderGroups(now: Date) {
  const bookings = await prisma.appointment.findMany({
    where: { status: "TERKONFIRMASI", startAt: { gt: now }, patientId: { not: null } },
    include: WORK_INCLUDE,
    orderBy: { startAt: "asc" },
  });
  const latest = bookings.length > 0 ? bookings[bookings.length - 1].startAt : now;
  const closedDates = await closedDatesBetween(new Date(now.getTime() - MAX_LOOKBACK_DAYS * DAY_MS), latest);
  return groupReminderWork(bookings, { now, closedDates });
}

/** Angka di menu Pengingat: pesan yang masih harus dikirim (kotak 1 + kotak 2). */
export async function countReminderWork(): Promise<number> {
  await requireCapability("booking:manage");
  const groups = await loadReminderGroups(new Date());
  return groups.confirm.length + groups.remind.length;
}

export async function getReminderWorklist(): Promise<ReminderWorklist> {
  await requireCapability("booking:manage");
  const now = new Date();
  const groups = await loadReminderGroups(now);
  const siteUrl = publicSiteUrl();

  type Loaded = (typeof groups.confirm)[number];
  const toRow = (booking: Loaded, extra: Partial<ReminderRow> = {}): ReminderRow => ({
    appointmentId: booking.id,
    code: booking.code,
    // CHECK appointment_patient_required + filter di atas: booking Terkonfirmasi selalu punya pasien.
    patientName: booking.patient!.name,
    startAt: booking.startAt,
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    confirmation: confirmationMessageFor(booking, siteUrl),
    reminder: reminderMessageFor(booking),
    overdue: false,
    shifted: false,
    reminderSent: null,
    reschedule: {
      appointmentId: booking.id,
      code: booking.code,
      patientName: booking.patient!.name,
      startAt: booking.startAt,
      durationMinutes: Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60_000),
      staffId: booking.staffId,
      staffName: booking.staff.name,
      branchId: booking.branchId,
      branchName: booking.branch.name,
    },
    ...extra,
  });

  return {
    today: witaDateString(now),
    confirm: groups.confirm.map((booking) => toRow(booking)),
    remind: groups.remind.map((booking) => toRow(booking, { overdue: booking.overdue, shifted: booking.shifted })),
    reminded: groups.reminded.map((booking) =>
      toRow(booking, {
        reminderSent: {
          messageId: booking.reminder.id,
          sentAt: booking.reminder.sentAt,
          sentByName: booking.reminder.sentByName,
          reply: booking.reminder.reply,
        },
      }),
    ),
  };
}
