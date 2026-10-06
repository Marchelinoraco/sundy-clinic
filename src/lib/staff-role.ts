import type { StaffRole } from "@prisma/client";

/** Nama peran di panel dan di jejak audit. */
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super Admin",
  DOKTER: "Dokter",
  TERAPIS: "Terapis",
  RESEPSIONIS: "Resepsionis",
  APOTEKER: "Apoteker",
  ADMIN_KEUANGAN: "Admin Keuangan",
};

const ROLES = Object.keys(STAFF_ROLE_LABEL) as StaffRole[];

/** Argumen peran skrip create-admin: kosong berarti Super Admin; selain itu harus nama peran yang dikenal. */
export function parseStaffRole(value: string | undefined): StaffRole | null {
  if (value === undefined || value.trim() === "") return "SUPER_ADMIN";
  const role = value.trim().toUpperCase();
  return (ROLES as string[]).includes(role) ? (role as StaffRole) : null;
}
