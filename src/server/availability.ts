import { getAvailableSlots, type SlotOption } from "@/lib/slot";
import { addDaysToDateString, combineWitaDateAndMinutes, witaWeekday } from "@/lib/time";
import { prisma } from "@/lib/db";
import { expireStaleSiteBookings } from "@/server/booking-expiry";
import { isHoliday } from "@/server/holiday";

// Status Appointment yang benar-benar memblokir slot — sejalan dengan klausa
// WHERE pada exclusion constraint di migrasi appointment_slothold_exclusion.
export const BLOCKING_STATUSES = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "HADIR"] as const;

export type AvailabilityInput = {
  staffId: string;
  branchId: string;
  date: string;
  durationMinutes: number;
};

export type AvailabilityOptions = {
  minLeadMinutes: number;
  /**
   * Jalur publik: hold aktif milik pasien lain dihitung sibuk; hold dengan
   * token ini (milik pasien yang sedang memilih) tidak. Jalur admin
   * mengabaikan hold — hold tidak mengikat admin (spec bagian 7).
   */
  holds?: { excludeToken: string | null };
};

/**
 * Menyambungkan mesin murni getAvailableSlots ke data nyata: template hari
 * itu, pengecualian, status libur, booking yang memblokir, dan (jalur
 * publik) hold aktif. Modul biasa, bukan "use server": hanya dipanggil dari
 * server action yang sudah memeriksa hak akses atau input.
 */
export async function computeAvailability(
  input: AvailabilityInput,
  options: AvailabilityOptions,
): Promise<SlotOption[]> {
  await expireStaleSiteBookings();

  const weekday = witaWeekday(new Date(`${input.date}T12:00:00Z`));
  const dayStart = combineWitaDateAndMinutes(input.date, 0);
  const dayEnd = combineWitaDateAndMinutes(input.date, 24 * 60);
  const now = new Date();

  const [template, exceptions, holiday, busyAppointments, activeHolds] = await Promise.all([
    prisma.scheduleTemplate.findUnique({
      where: { staffId_weekday: { staffId: input.staffId, weekday } },
    }),
    prisma.scheduleException.findMany({
      where: { staffId: input.staffId, date: new Date(`${input.date}T00:00:00Z`) },
    }),
    isHoliday(input.date),
    prisma.appointment.findMany({
      where: {
        staffId: input.staffId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
    }),
    options.holds
      ? prisma.slotHold.findMany({
          where: {
            staffId: input.staffId,
            expiresAt: { gt: now },
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
            ...(options.holds.excludeToken ? { token: { not: options.holds.excludeToken } } : {}),
          },
          select: { startAt: true, endAt: true },
        })
      : Promise.resolve([]),
  ]);

  return getAvailableSlots({
    date: input.date,
    durationMinutes: input.durationMinutes,
    template:
      template && template.branchId === input.branchId
        ? { startMinute: template.startMinute, endMinute: template.endMinute }
        : null,
    exceptions: exceptions.map((e) => ({
      kind: e.kind,
      startMinute: e.startMinute,
      endMinute: e.endMinute,
    })),
    isHoliday: holiday,
    busy: [...busyAppointments, ...activeHolds],
    now,
    minLeadMinutes: options.minLeadMinutes,
  });
}

export type DayAvailabilityState = "OPEN" | "FULL" | "CLOSED";
export type DayAvailability = { date: string; state: DayAvailabilityState; openCount: number };

/** Batas rentang yang boleh diminta sekaligus. */
export const MAX_AVAILABILITY_RANGE_DAYS = 31;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ringkasan beberapa hari untuk strip tanggal Booking Baru (spec C1 bagian 3).
 * Memakai mesin getAvailableSlots yang sama dengan computeAvailability, tetapi
 * memuat data seluruh rentang dengan empat kueri, bukan lima kueri per hari.
 *
 * CLOSED: tenaga tidak punya jam yang masih bisa dipesan hari itu (Minggu,
 * libur, cuti, di luar jadwal di cabang ini, atau jam kerja hari ini sudah
 * lewat). FULL: masih punya jam kerja, tetapi semuanya sudah terisi.
 */
export async function computeAvailabilityRange(
  input: { staffId: string; branchId: string; durationMinutes: number; from: string; days: number },
  options: { minLeadMinutes: number },
): Promise<DayAvailability[]> {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_AVAILABILITY_RANGE_DAYS) {
    throw new Error(`Rentang harus 1–${MAX_AVAILABILITY_RANGE_DAYS} hari.`);
  }
  if (!DATE_PATTERN.test(input.from)) throw new Error("Tanggal awal tidak sah.");

  await expireStaleSiteBookings();

  const dates = Array.from({ length: input.days }, (_, index) => addDaysToDateString(input.from, index));
  const lastDate = dates[dates.length - 1];
  const firstDay = new Date(`${input.from}T00:00:00Z`);
  const lastDay = new Date(`${lastDate}T00:00:00Z`);
  const rangeStart = combineWitaDateAndMinutes(input.from, 0);
  const rangeEnd = combineWitaDateAndMinutes(lastDate, 24 * 60);
  const now = new Date();

  const [templates, exceptions, holidays, busy] = await Promise.all([
    prisma.scheduleTemplate.findMany({ where: { staffId: input.staffId } }),
    prisma.scheduleException.findMany({
      where: { staffId: input.staffId, date: { gte: firstDay, lte: lastDay } },
    }),
    prisma.holiday.findMany({ where: { date: { gte: firstDay, lte: lastDay } }, select: { date: true } }),
    prisma.appointment.findMany({
      where: {
        staffId: input.staffId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);
  const holidayDates = new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));

  return dates.map((date): DayAvailability => {
    const weekday = witaWeekday(new Date(`${date}T12:00:00Z`));
    const template = templates.find((t) => t.weekday === weekday);
    const day = {
      date,
      durationMinutes: input.durationMinutes,
      template:
        template && template.branchId === input.branchId
          ? { startMinute: template.startMinute, endMinute: template.endMinute }
          : null,
      exceptions: exceptions
        .filter((e) => e.date.toISOString().slice(0, 10) === date)
        .map((e) => ({ kind: e.kind, startMinute: e.startMinute, endMinute: e.endMinute })),
      isHoliday: holidayDates.has(date),
      now,
      minLeadMinutes: options.minLeadMinutes,
    };
    // Tanpa booking sama sekali pun tidak ada jam: tenaga memang tidak bekerja.
    if (getAvailableSlots({ ...day, busy: [] }).length === 0) return { date, state: "CLOSED", openCount: 0 };
    const openCount = getAvailableSlots({ ...day, busy }).length;
    return { date, state: openCount === 0 ? "FULL" : "OPEN", openCount };
  });
}
