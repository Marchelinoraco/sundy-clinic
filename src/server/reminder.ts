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
import { nextOpenWindow, ONLINE_BRANCH_LABEL, windowLabel } from "@/lib/online-consultation";
import { groupReminderWork } from "@/lib/reminder-work";
import { witaDateString } from "@/lib/time";
import { closedDatesBetween } from "@/server/booking-expiry";
import { quizLinkFor } from "@/server/quiz-link-code";
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
  channel: "KLINIK" | "ONLINE";
  /** "Online · {rentang terbuka berikutnya}" untuk booking online; null untuk klinik. */
  onlineLabel: string | null;
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
  intake: { select: { status: true, linkVersion: true } },
  contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },
  messages: {
    select: { id: true, kind: true, scheduledFor: true, sentAt: true, sentByName: true, revokedAt: true, reply: true },
  },
} as const;

/** Booking Terkonfirmasi yang jadwalnya belum lewat, dikelompokkan ke tiga kotak (spec C2 bagian 4). */
async function loadReminderGroups(now: Date) {
  const rows = await prisma.appointment.findMany({
    where: {
      status: "TERKONFIRMASI",
      patientId: { not: null },
      OR: [
        { channel: "KLINIK", startAt: { gt: now } },
        { channel: "ONLINE", contactWindows: { some: { endAt: { gt: now } } } },
      ],
    },
    include: WORK_INCLUDE,
    orderBy: { startAt: "asc" },
  });
  // Booking online diingatkan untuk rentang terbuka berikutnya (spec konsultasi online 7.4).
  const bookings = rows.map((row) =>
    row.channel === "ONLINE" ? { ...row, reminderAt: nextOpenWindow(row.contactWindows, now)!.startAt } : row,
  );
  const latest = bookings.reduce(
    (max, b) => Math.max(max, ("reminderAt" in b && b.reminderAt ? b.reminderAt : b.startAt).getTime()),
    now.getTime(),
  );
  const closedDates = await closedDatesBetween(new Date(now.getTime() - MAX_LOOKBACK_DAYS * DAY_MS), new Date(latest));
  return groupReminderWork(bookings, { now, closedDates });
}

/** Angka di menu Pengingat: pesan yang masih harus dikirim (kotak 1 + kotak 2). */
export async function countReminderWork(): Promise<number> {
  await requireCapability("booking:manage");
  const groups = await loadReminderGroups(new Date());
  return groups.confirm.length + groups.remind.length;
}

/** Kotak 1 dan 2 halaman Pengingat secara terpisah, untuk kotak dasbor (spec D 4.2). */
export async function getReminderCounts(): Promise<{ confirm: number; remind: number }> {
  await requireCapability("booking:manage");
  const groups = await loadReminderGroups(new Date());
  return { confirm: groups.confirm.length, remind: groups.remind.length };
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
    branchName: booking.channel === "ONLINE" ? ONLINE_BRANCH_LABEL : booking.branch.name,
    channel: booking.channel,
    onlineLabel:
      booking.channel === "ONLINE"
        ? `Online · ${windowLabel(nextOpenWindow(booking.contactWindows, now) ?? booking.contactWindows[0])}`
        : null,
    confirmation: confirmationMessageFor(booking, siteUrl, quizLinkFor(booking, siteUrl, now)),
    reminder: reminderMessageFor(booking, quizLinkFor(booking, siteUrl, now), now),
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
