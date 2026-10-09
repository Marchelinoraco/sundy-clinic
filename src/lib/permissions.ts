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
  | "audit:read"
  | "stock:read"
  | "stock:manage"
  | "payable:manage"
  | "invoice:read"
  | "invoice:manage"
  | "invoice:correct"
  | "dispense:read"
  | "dispense:manage"
  | "stock:availability"
  | "expense:manage"
  | "profit:read"
  | "bia:upload";

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
    "stock:read",
    "stock:manage",
    "payable:manage",
    "invoice:read",
    "invoice:manage",
    "invoice:correct",
    "dispense:read",
    "dispense:manage",
    "stock:availability",
    "expense:manage",
    "profit:read",
    "bia:upload",
  ],

  // Dokter memegang rekam medis, tetapi tidak mengelola akun staf.
  // report:read (Angka dasbor, termasuk biaya booking masuk) hanya untuk Super Admin dan Admin Keuangan (spec D 4.6, spec stok 7.2).
  DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write", "stock:availability", "bia:upload"],

  // Resepsionis mengurus booking dan jadwal. Catatan klinis sengaja tidak ada
  // di daftar ini — lihat PRD bagian 4.
  // Resepsionis juga menagih customer (spec tagihan 6); koreksi uang masuk ada di Admin Keuangan.
  RESEPSIONIS: ["booking:manage", "schedule:manage", "invoice:read", "invoice:manage", "bia:upload"],

  // Terapis adalah sumber daya jadwal, bukan pengguna panel. Ia punya baris
  // Staff agar dapat dijadwalkan, tanpa akses apa pun ke panel admin.
  TERAPIS: [],

  // Apoteker mengelola barang, barang masuk, retur, dan penyesuaian stok (spec stok 7).
  // Ia mengisi harga beli dari faktur kertas, tetapi tidak mengurus pembayaran hutang.
  APOTEKER: ["stock:read", "stock:manage", "dispense:read", "dispense:manage", "stock:availability"],

  // Admin Keuangan melihat stok, mengelola hutang ke supplier, dan melihat Angka dasbor.
  // Tidak mengubah stok, booking, jadwal, rekam medis, atau akun staf (spec stok 7.2).
  ADMIN_KEUANGAN: ["stock:read", "payable:manage", "report:read", "invoice:read", "invoice:correct", "expense:manage", "profit:read"],
};

export function can(role: StaffRole, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role]?.includes(capability) ?? false;
}
