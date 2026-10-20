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
  | "bia:upload"
  | "price:manage"
  | "catalog:manage"
  | "payroll:manage"
  | "counter:read"
  | "restock:request"
  | "nurse:work"
  | "checkin:notify";

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
    "price:manage",
    "catalog:manage",
    "payroll:manage",
    "counter:read",
    "restock:request",
    // Super Admin bisa mengerjakan tugas perawat, tetapi tidak ikut berbunyi setiap check-in (spec peran perawat 5).
    "nurse:work",
  ],

  // Dokter memegang rekam medis, tetapi tidak mengelola akun staf.
  // report:read (Angka dasbor, termasuk biaya booking masuk) hanya untuk Super Admin dan Admin Keuangan (spec D 4.6, spec stok 7.2).
  DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write", "stock:availability", "bia:upload"],

  // Resepsionis mengurus booking dan jadwal. Catatan klinis sengaja tidak ada
  // di daftar ini — lihat PRD bagian 4.
  // Resepsionis juga menagih customer (spec tagihan 6); koreksi uang masuk ada di Admin Keuangan.
  // Resepsionis juga melihat stok meja dan meminta restock ke Apoteker (spec stok meja 7).
  RESEPSIONIS: ["booking:manage", "schedule:manage", "invoice:read", "invoice:manage", "bia:upload", "counter:read", "restock:request"],

  // Perawat (enum TERAPIS): food recall dan BIA pasien hari ini, serta pemberitahuan check-in (spec peran perawat 5).
  TERAPIS: ["nurse:work", "checkin:notify", "bia:upload"],

  // Apoteker mengelola barang, barang masuk, retur, dan penyesuaian stok (spec stok 7).
  // Ia mengisi harga beli dari faktur kertas, tetapi tidak mengurus pembayaran hutang.
  APOTEKER: ["stock:read", "stock:manage", "dispense:read", "dispense:manage", "stock:availability", "counter:read"],

  // Admin Keuangan melihat stok, mengelola hutang ke supplier, dan melihat Angka dasbor.
  // Tidak mengubah stok, booking, jadwal, rekam medis, atau akun staf (spec stok 7.2).
  // Harga jual dan promo barang (spec perbaikan tagihan T9); harga beli menyusul di sub-proyek 3.
  // Katalog layanan internal dan situs (spec layanan situs 5).
  ADMIN_KEUANGAN: ["stock:read", "payable:manage", "report:read", "invoice:read", "invoice:correct", "expense:manage", "profit:read", "price:manage", "catalog:manage", "payroll:manage"],
};

export function can(role: StaffRole, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role]?.includes(capability) ?? false;
}
