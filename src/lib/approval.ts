import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";

// PIN persetujuan Admin Keuangan dan Super Admin (spec PIN P1–P12). Murni: dipakai halaman dan server.

/** Penyetuju dan PIN yang diketik di kotak Persetujuan. */
export type ApprovalInput = { approverId: string; pin: string };

export const APPROVAL_MAX_FAILS = 5;
export const APPROVAL_LOCK_MINUTES = 15;

export const APPROVAL_REQUIRED = "Perlu persetujuan Admin Keuangan atau Super Admin.";
export const PIN_WRONG = "PIN salah.";
export const APPROVER_INVALID = "Penyetuju tidak ditemukan atau belum membuat PIN.";
export const NO_APPROVERS = "Belum ada Admin Keuangan atau Super Admin yang membuat PIN.";
export const PIN_FORMAT = "PIN harus 6 angka.";

/** "PIN Rina terkunci sampai 10.15." — jam buka dalam WITA (spec PIN P9). */
export function pinLockedMessage(name: string, until: Date): string {
  return `PIN ${name} terkunci sampai ${minutesToTimeLabel(witaMinutesOfDay(until))}.`;
}

/** Pesan galat, atau null bila PIN tepat 6 angka (spec PIN P8). */
export function validatePin(pin: unknown): string | null {
  return typeof pin === "string" && /^\d{6}$/.test(pin) ? null : PIN_FORMAT;
}
