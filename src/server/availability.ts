import { getAvailableSlots, type SlotOption } from "@/lib/slot";
import { combineWitaDateAndMinutes, witaWeekday } from "@/lib/time";
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
