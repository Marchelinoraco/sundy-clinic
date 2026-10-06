import type { AppointmentStatus } from "@prisma/client";
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import { periodRanges, type DashboardPeriod, type MinuteWindow, type TimeRange } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import type { BookingSourceValue } from "@/lib/payment";
import { firstName, quizLinkState } from "@/lib/quiz-link";
import { workingWindows } from "@/lib/slot";
import { addDaysToDateString, combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay, witaWeekday } from "@/lib/time";
import { bookingServiceName } from "@/lib/transfer-instruction";
import { DAY_LIST_CHANNEL } from "@/server/online-store";
import { listPendingBookings } from "@/server/appointment";
import { computeAvailability } from "@/server/availability";
import { getReminderCounts } from "@/server/reminder";
import { requireCapability } from "@/server/session";

// Modul biasa, bukan "use server": hanya dibaca halaman dasbor (server component).
// Setiap fungsi memeriksa haknya sendiri, karena bagian dasbor dimuat terpisah (spec D 4.6–4.7).

const HIDDEN_STATUSES: AppointmentStatus[] = ["DIBATALKAN", "KEDALUWARSA"];
/** Slot kosong di garis waktu memakai durasi konsultasi, sama dengan bawaan Booking Baru. */
const SLOT_MINUTES = 30;

function dayBounds(now: Date) {
  const date = witaDateString(now);
  return {
    date,
    start: combineWitaDateAndMinutes(date, 0),
    end: combineWitaDateAndMinutes(addDaysToDateString(date, 1), 0),
  };
}

export type TodayWork = {
  pending: number;
  pendingOverdue: number;
  messages: { confirm: number; remind: number };
  today: { total: number; unfilledIntakes: number; attended: number; noShow: number };
};

export async function getTodayWork(now: Date = new Date()): Promise<TodayWork> {
  await requireCapability("booking:manage");
  const { start, end } = dayBounds(now);
  const [pending, messages, today] = await Promise.all([
    listPendingBookings(),
    getReminderCounts(),
    prisma.appointment.findMany({
      where: { startAt: { gte: start, lt: end }, status: { notIn: HIDDEN_STATUSES }, ...DAY_LIST_CHANNEL },
      select: {
        source: true,
        status: true,
        startAt: true,
        patientId: true,
        intake: { select: { status: true, linkVersion: true } },
      },
    }),
  ]);
  return {
    pending: pending.length,
    pendingOverdue: pending.filter((booking) => booking.overdue).length,
    messages,
    today: {
      total: today.length,
      // Booking admin yang link kuisnya masih berlaku = isian belum diisi (spec C3).
      unfilledIntakes: today.filter((booking) => quizLinkState(booking, now) === "OPEN").length,
      attended: today.filter((booking) => booking.status === "HADIR" || booking.status === "SELESAI").length,
      noShow: today.filter((booking) => booking.status === "TIDAK_HADIR").length,
    },
  };
}

export type ScheduleBlock = {
  id: string;
  startMinute: number;
  endMinute: number;
  time: string;
  status: AppointmentStatusValue;
  patientName: string;
  serviceName: string;
};
export type OpenSlot = { startMinute: number; endMinute: number; time: string };
export type ScheduleLane = {
  staffId: string;
  staffName: string;
  windows: MinuteWindow[];
  bookings: ScheduleBlock[];
  openSlots: OpenSlot[];
};
export type TodaySchedule = { date: string; holidayName: string | null; lanes: ScheduleLane[]; offStaff: string[] };

export async function getTodaySchedule(now: Date = new Date()): Promise<TodaySchedule> {
  await requireCapability("booking:manage");
  const { date, start, end } = dayBounds(now);
  const dateColumn = new Date(`${date}T00:00:00Z`);

  // Hari libur: tanpa jam kerja dan slot, tetapi booking yang masih tercatat tetap tampil.
  const holiday = await prisma.holiday.findUnique({ where: { date: dateColumn }, select: { name: true } });

  const weekday = witaWeekday(now);
  const [staffList, primaryBranch] = await Promise.all([
    prisma.staff.findMany({
      where: { role: { in: ["DOKTER", "TERAPIS"] }, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        scheduleTemplates: { where: { weekday }, select: { branchId: true, startMinute: true, endMinute: true } },
        scheduleExceptions: {
          where: { date: dateColumn },
          select: { kind: true, startMinute: true, endMinute: true, branchId: true },
        },
      },
    }),
    prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true } }),
  ]);
  const bookings = await prisma.appointment.findMany({
    where: {
      staffId: { in: staffList.map((s) => s.id) },
      // Garis waktu hanya untuk kunjungan klinik (spec konsultasi online 3.7).
      channel: "KLINIK",
      startAt: { gte: start, lt: end },
      status: { notIn: HIDDEN_STATUSES },
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      staffId: true,
      startAt: true,
      endAt: true,
      status: true,
      type: true,
      service: { select: { name: true } },
      // Hanya identitas untuk label blok — tanpa catatan medis (spec D 6).
      patient: { select: { name: true } },
      intake: { select: { name: true } },
    },
  });

  const lanes: ScheduleLane[] = [];
  const offStaff: string[] = [];
  for (const staff of staffList) {
    const template = staff.scheduleTemplates[0] ?? null;
    const windows = workingWindows({ template, exceptions: staff.scheduleExceptions, isHoliday: holiday !== null });
    const own = bookings.filter((b) => b.staffId === staff.id);
    if (windows.length === 0 && own.length === 0) {
      if (!holiday) offStaff.push(staff.name);
      continue;
    }
    const branchId = template?.branchId ?? staff.scheduleExceptions.find((e) => e.branchId)?.branchId ?? primaryBranch?.id;
    const slots =
      windows.length > 0 && branchId
        ? await computeAvailability({ staffId: staff.id, branchId, date, durationMinutes: SLOT_MINUTES }, { minLeadMinutes: 0 })
        : [];
    lanes.push({
      staffId: staff.id,
      staffName: staff.name,
      windows,
      bookings: own.map((b) => {
        const startMinute = witaMinutesOfDay(b.startAt);
        return {
          id: b.id,
          startMinute,
          endMinute: startMinute + Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000),
          time: minutesToTimeLabel(startMinute),
          status: b.status,
          patientName: firstName(b.patient?.name ?? b.intake?.name ?? "Tanpa nama"),
          serviceName: bookingServiceName(b),
        };
      }),
      openSlots: slots.map((slot) => {
        const startMinute = witaMinutesOfDay(slot.startAt);
        return { startMinute, endMinute: startMinute + SLOT_MINUTES, time: slot.label };
      }),
    });
  }
  return { date, holidayName: holiday?.name ?? null, lanes, offStaff };
}

export type PeriodNumbers = {
  bookings: number;
  bySource: Record<BookingSourceValue, number>;
  newPatients: number;
  noShow: number;
  cancelled: number;
  expired: number;
  feeReceived: number;
};
export type DashboardNumbers = {
  period: DashboardPeriod;
  label: string;
  previousLabel: string;
  current: PeriodNumbers;
  previous: PeriodNumbers;
};

async function numbersFor(range: TimeRange): Promise<PeriodNumbers> {
  const within = { gte: range.start, lt: range.end };
  const [bySourceRows, newPatients, outcomeRows, verifications] = await Promise.all([
    prisma.appointment.groupBy({ by: ["source"], where: { createdAt: within }, _count: { _all: true } }),
    prisma.patient.count({ where: { createdAt: within } }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { startAt: within, status: { in: ["TIDAK_HADIR", "DIBATALKAN", "KEDALUWARSA"] } },
      _count: { _all: true },
    }),
    // Satu booking dihitung sekali walau tercatat diverifikasi dua kali (spec D 4.5).
    prisma.auditLog.findMany({
      where: { action: "appointment.verify", createdAt: within },
      select: { entityId: true },
      distinct: ["entityId"],
    }),
  ]);
  const fee =
    verifications.length === 0
      ? 0
      : ((
          await prisma.appointment.aggregate({
            where: { id: { in: verifications.map((v) => v.entityId) } },
            _sum: { bookingFee: true },
          })
        )._sum.bookingFee ?? 0);
  const bySource: Record<BookingSourceValue, number> = { SITUS: 0, WHATSAPP: 0, TELEPON: 0, WALK_IN: 0 };
  for (const row of bySourceRows) bySource[row.source] = row._count._all;
  const outcome = (status: AppointmentStatus) => outcomeRows.find((row) => row.status === status)?._count._all ?? 0;
  return {
    bookings: Object.values(bySource).reduce((sum, n) => sum + n, 0),
    bySource,
    newPatients,
    noShow: outcome("TIDAK_HADIR"),
    cancelled: outcome("DIBATALKAN"),
    expired: outcome("KEDALUWARSA"),
    feeReceived: fee,
  };
}

export async function getDashboardNumbers(period: DashboardPeriod, now: Date = new Date()): Promise<DashboardNumbers> {
  await requireCapability("report:read");
  const ranges = periodRanges(period, now);
  const [current, previous] = await Promise.all([numbersFor(ranges.current), numbersFor(ranges.previous)]);
  return { period, label: ranges.label, previousLabel: ranges.previousLabel, current, previous };
}
