import type { StaffRole } from "@prisma/client";
import type { Parsed } from "./staff-accounts";

/** Aturan profil dokter di halaman publik (spec profil dokter 3 dan 4). Murni, tanpa basis data, tanpa node:*: dipakai juga oleh komponen klien. */
export const SPECIALTY_MAX = 100;
export const BIO_MAX = 600;
export const DOCTOR_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const DOCTOR_PHOTO_MIN_SIDE = 600;
export const DOCTOR_PHOTO_MAX_SIDE = 1600;
/** Untuk atribut `accept` kotak pilih berkas; HEIC sengaja tidak ada (peramban ponsel mengonversinya ke JPG). */
export const DOCTOR_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
/** Nama berkas foto: id staf (huruf kecil dan angka) + sidik jari 8 heks. Disusun server, tidak pernah dari masukan pengguna. */
export const DOCTOR_PHOTO_NAME = /^[0-9a-z]+-[0-9a-f]{8}\.webp$/;
export const DOCTOR_PHOTO_PATH_PREFIX = "/foto-dokter/";

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export function validateSpecialty(raw: unknown): Parsed<string | null> {
  const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (text.length > SPECIALTY_MAX) return fail(`Spesialisasi paling banyak ${SPECIALTY_MAX} karakter.`);
  return { ok: true, value: text || null };
}

export function validateBio(raw: unknown): Parsed<string | null> {
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (text.length > BIO_MAX) return fail(`Deskripsi paling banyak ${BIO_MAX} karakter.`);
  return { ok: true, value: text || null };
}

export function doctorPhotoUrl(name: string): string {
  return `${DOCTOR_PHOTO_PATH_PREFIX}${name}`;
}

/** Nama berkas dari `photoUrl`, atau null bila bukan foto unggahan yang sah (mis. foto bawaan situs atau kosong). */
export function doctorPhotoName(photoUrl: string | null | undefined): string | null {
  if (!photoUrl?.startsWith(DOCTOR_PHOTO_PATH_PREFIX)) return null;
  const name = photoUrl.slice(DOCTOR_PHOTO_PATH_PREFIX.length);
  return DOCTOR_PHOTO_NAME.test(name) ? name : null;
}

/** Alamat pratinjau di panel (rute admin, tidak bergantung pada tampil-tidaknya dokter di situs); null bila bukan foto unggahan. */
export function doctorPhotoPreviewUrl(photoUrl: string | null | undefined): string | null {
  const name = doctorPhotoName(photoUrl);
  return name ? `/admin/staf/foto/${name}` : null;
}

/** Hanya dokter dan terapis yang tampil di "Tim Dokter" (sama dengan `getPublicStaff`). */
export function roleHasPublicProfile(role: StaffRole): boolean {
  return role === "DOKTER" || role === "TERAPIS";
}

export type PhotoKind = "jpeg" | "png" | "webp";

/** Jenis foto dari byte awalnya, bukan dari nama atau tipe kiriman klien. */
export function detectPhotoKind(bytes: Uint8Array): PhotoKind | null {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && text(1, 4) === "PNG") return "png";
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  return null;
}
