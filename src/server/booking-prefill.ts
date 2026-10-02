import { EMPTY_BOOKING_INITIAL, parseDateParam, parseTimeParam, type BookingFormInitial } from "@/lib/booking-prefill";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaWeekday } from "@/lib/time";
import { computeAvailability } from "@/server/availability";
import { getPatientSummary } from "@/server/patient";
import { requireCapability } from "@/server/session";

// Modul biasa, bukan "use server": hanya dipanggil halaman Booking Baru (server component).

export type BookingPrefillParams = { pasien?: string; tenaga?: string; tanggal?: string; jam?: string };

export const SLOT_TAKEN_NOTICE = "Jam itu sudah tidak tersedia. Pilih jam lain.";

/** Durasi bawaan Booking Baru (konsultasi), sama dengan slot di garis waktu dasbor. */
const CONSULTATION_MINUTES = 30;

/**
 * Isian awal hanya mengisi formulir; booking tetap dibuat lewat Buat Booking dengan
 * pemeriksaan biasa. Isian yang tidak sah diabaikan, dan formulir mulai dari bagian
 * yang masih sah (spec D 5.8).
 */
export async function resolveBookingPrefill(
  params: BookingPrefillParams,
  now: Date = new Date(),
): Promise<{ initial: BookingFormInitial; notice: string | null }> {
  await requireCapability("booking:manage");
  const initial: BookingFormInitial = { ...EMPTY_BOOKING_INITIAL };

  if (params.pasien) initial.patient = await getPatientSummary(params.pasien);

  const staff = params.tenaga
    ? await prisma.staff.findFirst({
        where: { id: params.tenaga, role: { in: ["DOKTER", "TERAPIS"] }, isActive: true },
        select: { id: true, role: true },
      })
    : null;
  if (!staff) return { initial, notice: null };
  initial.staffId = staff.id;
  initial.kind = staff.role === "TERAPIS" ? "TREATMENT" : "KONSULTASI";

  const date = parseDateParam(params.tanggal);
  if (!date || date < witaDateString(now)) return { initial, notice: null };
  initial.date = date;
  const template = await prisma.scheduleTemplate.findUnique({
    where: { staffId_weekday: { staffId: staff.id, weekday: witaWeekday(new Date(`${date}T12:00:00Z`)) } },
    select: { branchId: true },
  });
  if (template) initial.branchId = template.branchId;

  const minute = parseTimeParam(params.jam);
  if (minute === null) return { initial, notice: null };
  // Durasi treatment baru diketahui setelah layanannya dipilih.
  if (staff.role === "TERAPIS") return { initial, notice: `Pilih layanan treatment, lalu jam ${minutesToTimeLabel(minute)}.` };

  const branchId =
    initial.branchId ??
    (await prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true } }))?.id ??
    null;
  const slots = branchId
    ? await computeAvailability({ staffId: staff.id, branchId, date, durationMinutes: CONSULTATION_MINUTES }, { minLeadMinutes: 0 })
    : [];
  const wanted = combineWitaDateAndMinutes(date, minute).getTime();
  const slot = slots.find((s) => s.startAt.getTime() === wanted) ?? null;
  if (!slot) return { initial, notice: SLOT_TAKEN_NOTICE };
  initial.slot = slot;
  initial.branchId = branchId;
  return { initial, notice: null };
}
