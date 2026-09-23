import type { StaffRole } from "@prisma/client";

/**
 * Kemampuan, bukan nama halaman.
 *
 * Halaman dan aksi bertanya "boleh melakukan apa", bukan "berperan apa".
 * Dengan begitu menambah peran baru cukup menambah satu baris di tabel ini,
 * tanpa memburu pemeriksaan peran yang tersebar di seluruh kode.
 */
export type Capability =
  | "staff:manage"
  | "content:manage"
  | "booking:manage"
  | "schedule:manage"
  | "record:read"
  | "record:write"
  | "report:read"
  | "audit:read";

export const CAPABILITIES_BY_ROLE: Record<StaffRole, readonly Capability[]> = {
  SUPER_ADMIN: [
    "staff:manage",
    "content:manage",
    "booking:manage",
    "schedule:manage",
    "record:read",
    "record:write",
    "report:read",
    "audit:read",
  ],

  // Dokter memegang rekam medis, tetapi tidak mengelola akun staf.
  DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write", "report:read"],

  // Resepsionis mengurus booking dan jadwal. Catatan klinis sengaja tidak ada
  // di daftar ini — lihat PRD bagian 4.
  RESEPSIONIS: ["booking:manage", "schedule:manage"],

  // Terapis adalah sumber daya jadwal, bukan pengguna panel. Ia punya baris
  // Staff agar dapat dijadwalkan, tanpa akses apa pun ke panel admin.
  TERAPIS: [],
};

export function can(role: StaffRole, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role]?.includes(capability) ?? false;
}
