import type { PatientSummary } from "@/server/patient";
import type { SlotOption } from "./slot";

/** Nilai awal formulir Booking Baru; setiap bagian boleh kosong (spec D 5.8). */
export type BookingFormInitial = {
  patient: PatientSummary | null;
  kind: "KONSULTASI" | "TREATMENT";
  staffId: string | null;
  branchId: string | null;
  date: string | null;
  slot: SlotOption | null;
};

export const EMPTY_BOOKING_INITIAL: BookingFormInitial = {
  patient: null,
  kind: "KONSULTASI",
  staffId: null,
  branchId: null,
  date: null,
  slot: null,
};

/** "11.00" atau "11:00" → menit sejak tengah malam; selain itu null. */
export function parseTimeParam(value: string | undefined): number | null {
  const match = value ? /^(\d{1,2})[.:](\d{2})$/.exec(value) : null;
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

/** Tanggal "YYYY-MM-DD" yang benar-benar ada; selain itu null. */
export function parseDateParam(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value ? value : null;
}
