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
import { packageVisitMessage, planVisits, visitContentsLabel } from "@/lib/package-visit";
import { groupReminderWork, reminderDay } from "@/lib/reminder-work";
import { dateOnlyString } from "@/lib/stock";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { buildWhatsAppLinkTo } from "@/lib/whatsapp";
import { closedDatesBetween } from "@/server/booking-expiry";
import { remainingByItem } from "@/server/package-store";
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

/** Kotak 4: kunjungan paket yang perlu dibooking pasien (spec jadwal paket JP5, JP12, JP13). */
export type PackageReminderRow = {
  patientPackageId: string;
  patientName: string;
  packageName: string;
  visitOn: string;
  visitNumber: number;
  contents: string;
  message: WhatsAppMessage;
  /** Tanggal rencananya sudah lewat. */
  overdue: boolean;
  /** Hari sebelum rencana tutup, jadi diingatkan lebih awal. */
  shifted: boolean;
  sent: { sentAt: Date; sentByName: string } | null;
};

export type ReminderWorklist = {
  today: string;
  confirm: ReminderRow[];
  remind: ReminderRow[];
  reminded: ReminderRow[];
  packageVisits: PackageReminderRow[];
};

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

/**
 * Paket aktif yang hari pengingat kunjungan berikutnya sudah tiba (spec jadwal paket JP5, JP6, JP12). Paket yang habis atau
 * kedaluwarsa, dan pasien yang sudah punya booking dari hari ini, tidak diingatkan.
 */
async function loadPackageVisitWork(now: Date): Promise<PackageReminderRow[]> {
  const today = witaDateString(now);
  const horizon = addDaysToDateString(today, MAX_LOOKBACK_DAYS + 1);
  const packages = await prisma.patientPackage.findMany({
    where: {
      status: "AKTIF",
      nextVisitOn: { not: null, lte: new Date(`${horizon}T00:00:00Z`) },
      expiresOn: { gte: new Date(`${today}T00:00:00Z`) },
      patient: {
        appointments: {
          none: { status: { in: ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "HADIR"] }, startAt: { gte: combineWitaDateAndMinutes(today, 0) } },
        },
      },
    },
    orderBy: { nextVisitOn: "asc" },
    select: {
      id: true,
      name: true,
      visitIntervalDays: true,
      nextVisitOn: true,
      patient: { select: { name: true, whatsapp: true } },
      items: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceName: true, unit: true, perVisit: true } },
      visitReminders: { select: { visitOn: true, sentAt: true, staffName: true } },
    },
  });
  if (packages.length === 0) return [];
  const ids = packages.map((pkg) => pkg.id);
  const remaining = await remainingByItem(prisma, packages.flatMap((pkg) => pkg.items.map((item) => item.id)));
  // Kunjungan yang sudah terjadi = tagihan final berbeda yang memakai paket ini (JP13).
  const uses = await prisma.packageSessionEntry.findMany({
    where: { kind: "PAKAI", item: { patientPackageId: { in: ids } }, invoiceLine: { invoice: { status: "FINAL" } } },
    select: { item: { select: { patientPackageId: true } }, invoiceLine: { select: { invoiceId: true } } },
  });
  const visitsDone = new Map<string, Set<string>>();
  for (const use of uses) {
    const invoices = visitsDone.get(use.item.patientPackageId) ?? new Set<string>();
    if (use.invoiceLine) invoices.add(use.invoiceLine.invoiceId);
    visitsDone.set(use.item.patientPackageId, invoices);
  }
  const closedDates = await closedDatesBetween(new Date(now.getTime() - MAX_LOOKBACK_DAYS * DAY_MS), new Date(`${horizon}T00:00:00Z`));

  const rows: PackageReminderRow[] = [];
  for (const pkg of packages) {
    const visitOn = dateOnlyString(pkg.nextVisitOn!);
    const day = reminderDay(visitOn, closedDates);
    if (day > today) continue;
    const items = pkg.items.map((item) => ({ name: item.serviceName, unit: item.unit, remaining: remaining.get(item.id) ?? 0, perVisit: item.perVisit }));
    const visitNumber = (visitsDone.get(pkg.id)?.size ?? 0) + 1;
    const [visit] = planVisits({ nextVisitOn: visitOn, intervalDays: pkg.visitIntervalDays, visitsDone: visitNumber - 1, items });
    if (!visit) continue;
    const text = packageVisitMessage({ patientName: pkg.patient.name, packageName: pkg.name, visitNumber, visitOn, today, contents: visit.contents });
    const sent = pkg.visitReminders.find((reminder) => dateOnlyString(reminder.visitOn) === visitOn);
    rows.push({
      patientPackageId: pkg.id,
      patientName: pkg.patient.name,
      packageName: pkg.name,
      visitOn,
      visitNumber,
      contents: visitContentsLabel(visit.contents),
      message: { text, link: buildWhatsAppLinkTo(pkg.patient.whatsapp, text) },
      overdue: visitOn < today,
      shifted: day !== addDaysToDateString(visitOn, -1),
      sent: sent ? { sentAt: sent.sentAt, sentByName: sent.staffName } : null,
    });
  }
  // Yang belum dikirim di atas, yang terlewat paling atas; urutan tanggal dari query.
  return rows.sort((a, b) => Number(a.sent !== null) - Number(b.sent !== null) || Number(b.overdue) - Number(a.overdue));
}

/** Angka di menu Pengingat: pesan yang masih harus dikirim (kotak 1, kotak 2, dan kunjungan paket yang belum diingatkan). */
export async function countReminderWork(): Promise<number> {
  await requireCapability("booking:manage");
  const now = new Date();
  const [groups, packageVisits] = await Promise.all([loadReminderGroups(now), loadPackageVisitWork(now)]);
  return groups.confirm.length + groups.remind.length + packageVisits.filter((row) => !row.sent).length;
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
  const [groups, packageVisits] = await Promise.all([loadReminderGroups(now), loadPackageVisitWork(now)]);
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
      kind: booking.type,
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
    packageVisits,
  };
}
