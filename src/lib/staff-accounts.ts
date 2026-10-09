import type { StaffRole } from "@prisma/client";

/** Aturan pengelolaan akun staf (spec kelola staf 4). Murni, tanpa basis data dan tanpa node:crypto: dipakai juga oleh komponen klien. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** Harus sama dengan `minPasswordLength` di src/lib/auth.ts (dijaga uji integrasi). */
export const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const NAME_MAX = 100;
const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export function validateStaffName(raw: unknown): Parsed<string> {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) return fail("Isi nama staf.");
  if (name.length > NAME_MAX) return fail(`Nama staf paling banyak ${NAME_MAX} karakter.`);
  return { ok: true, value: name };
}

/** Better Auth menyimpan email dalam huruf kecil, jadi dinormalkan di sini. */
export function validateLoginEmail(raw: unknown): Parsed<string> {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email) return fail("Isi email login.");
  if (email.length > 254 || !FORMAT_EMAIL.test(email) || email.split("@").length !== 2) return fail("Email tidak valid.");
  return { ok: true, value: email };
}

/** Terapis adalah sumber daya jadwal tanpa kemampuan panel: tidak punya akun (spec K6). */
export function roleCanHaveLogin(role: StaffRole): boolean {
  return role !== "TERAPIS";
}

export type StaffTarget = { id: string; role: StaffRole; isActive: boolean; hasLogin: boolean };
export type StaffChange = { kind: "deactivate" } | { kind: "role"; to: StaffRole };

/** Alasan sebuah perubahan ditolak, atau null bila boleh (spec kelola staf 4: pengaman diri dan klinik). */
export function staffChangeBlock(input: { actorStaffId: string; target: StaffTarget; change: StaffChange; activeSuperAdminsWithLogin: number }): string | null {
  const { actorStaffId, target, change, activeSuperAdminsWithLogin } = input;
  const self = actorStaffId === target.id;

  if (change.kind === "deactivate" && self) return "Anda tidak bisa menonaktifkan akun Anda sendiri.";
  if (change.kind === "role" && self && target.role === "SUPER_ADMIN" && change.to !== "SUPER_ADMIN") {
    return "Anda tidak bisa menurunkan peran Anda sendiri.";
  }
  if (change.kind === "role" && change.to === "TERAPIS" && target.hasLogin) {
    return "Staf yang punya akun tidak bisa berperan Terapis. Nonaktifkan akunnya atau pilih peran lain.";
  }

  const losesSuperAdmin = target.role === "SUPER_ADMIN" && target.isActive && target.hasLogin && (change.kind === "deactivate" || change.to !== "SUPER_ADMIN");
  if (losesSuperAdmin && activeSuperAdminsWithLogin <= 1) return "Harus tersisa minimal satu Super Admin aktif yang punya akun.";
  return null;
}

/** Isian halaman Ganti kata sandi. Mengembalikan kata sandi baru bila sah. */
export function validateOwnPasswordChange(input: { currentPassword: string; newPassword: string; confirmation: string }): Parsed<string> {
  const { currentPassword, newPassword, confirmation } = input;
  if (!currentPassword) return fail("Isi kata sandi saat ini.");
  if (newPassword.length < MIN_PASSWORD_LENGTH) return fail(`Kata sandi baru minimal ${MIN_PASSWORD_LENGTH} karakter.`);
  if (newPassword.length > MAX_PASSWORD_LENGTH) return fail(`Kata sandi baru paling banyak ${MAX_PASSWORD_LENGTH} karakter.`);
  if (newPassword !== confirmation) return fail("Kata sandi baru dan ulangannya tidak sama.");
  if (newPassword === currentPassword) return fail("Kata sandi baru harus berbeda dari yang sementara.");
  return { ok: true, value: newPassword };
}
