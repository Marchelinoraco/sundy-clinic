import { DOCTOR_PHOTO_NAME } from "./doctor-profile";
import { validatePriceChange } from "./price-validation";
import { slugify } from "./slug";
import type { Validation } from "./stock";

/** Aturan katalog layanan internal dan situs (spec layanan situs 2 dan 5). Murni: dipakai server dan komponen klien. */
export const SITE_PHOTO_PATH_PREFIX = "/foto-layanan/";
const SITE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const oneLine = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : null);

export type InternalServiceInput = {
  name: string;
  categoryId: string;
  promoPrice: number;
  normalPrice: number | null;
  durationMin: number;
  requiresDoctor: boolean;
};

export function validateInternalService(raw: unknown): Validation<InternalServiceInput> {
  if (!isObject(raw)) return fail(INVALID);
  const name = oneLine(raw.name);
  if (name === null || typeof raw.requiresDoctor !== "boolean") return fail(INVALID);
  if (!name) return fail("Isi nama layanan.");
  if (name.length < 2 || name.length > 100) return fail("Nama layanan 2–100 karakter.");
  if (typeof raw.categoryId !== "string" || !raw.categoryId) return fail("Pilih kategori.");
  if (typeof raw.promoPrice !== "number" || (raw.normalPrice !== null && typeof raw.normalPrice !== "number")) return fail(INVALID);
  const normalPrice = raw.normalPrice as number | null;
  const priceError = validatePriceChange({ promoPrice: raw.promoPrice, normalPrice });
  if (priceError) return fail(priceError);
  const duration = raw.durationMin;
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 15 || duration > 480 || duration % 15 !== 0) {
    return fail("Durasi 15–480 menit, kelipatan 15.");
  }
  return {
    ok: true,
    value: { name, categoryId: raw.categoryId, promoPrice: raw.promoPrice, normalPrice, durationMin: duration, requiresDoctor: raw.requiresDoctor },
  };
}

export type SiteServiceInput = {
  serviceId: string;
  name: string;
  slug: string;
  categoryId: string;
  description: string | null;
  priceNote: string | null;
  isSignature: boolean;
  sortOrder: number;
};

export function validateSiteService(raw: unknown): Validation<SiteServiceInput> {
  if (!isObject(raw)) return fail(INVALID);
  const name = oneLine(raw.name);
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : null;
  const priceNote = raw.priceNote === null || raw.priceNote === undefined ? "" : oneLine(raw.priceNote);
  const description =
    raw.description === null || raw.description === undefined ? "" : typeof raw.description === "string" ? raw.description.replace(/\r\n/g, "\n").trim() : null;
  if (name === null || slug === null || priceNote === null || description === null || typeof raw.isSignature !== "boolean") return fail(INVALID);
  if (typeof raw.serviceId !== "string" || !raw.serviceId) return fail("Pilih layanan internal.");
  if (!name) return fail("Isi nama di situs.");
  if (name.length < 2 || name.length > 100) return fail("Nama di situs 2–100 karakter.");
  if (!slug) return fail("Isi alamat (slug).");
  if (slug.length < 2 || slug.length > 80 || !SITE_SLUG.test(slug)) return fail("Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter).");
  if (typeof raw.categoryId !== "string" || !raw.categoryId) return fail("Pilih kategori.");
  if (description.length > 2000) return fail("Deskripsi paling banyak 2.000 karakter.");
  if (priceNote.length > 40) return fail("Satuan harga paling banyak 40 karakter.");
  const sortOrder = raw.sortOrder;
  if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) return fail("Urutan harus bilangan bulat 0–9999.");
  return {
    ok: true,
    value: {
      serviceId: raw.serviceId,
      name,
      slug,
      categoryId: raw.categoryId,
      description: description || null,
      priceNote: priceNote || null,
      isSignature: raw.isSignature,
      sortOrder,
    },
  };
}

/** Slug usulan dari nama, dipotong 80 karakter tanpa tanda hubung di ujung. */
export function siteSlugFrom(name: string): string {
  return slugify(name).slice(0, 80).replace(/-+$/, "");
}

export function siteServicePhotoUrl(name: string): string {
  return `${SITE_PHOTO_PATH_PREFIX}${name}`;
}

/** Nama berkas dari `imageUrl`, atau null bila bukan foto unggahan yang sah (foto lokal lama atau kosong). */
export function siteServicePhotoName(url: string | null | undefined): string | null {
  if (!url?.startsWith(SITE_PHOTO_PATH_PREFIX)) return null;
  const name = url.slice(SITE_PHOTO_PATH_PREFIX.length);
  return DOCTOR_PHOTO_NAME.test(name) ? name : null;
}

/** Alamat pratinjau di panel (tidak bergantung pada tampil-tidaknya layanan di situs); null bila bukan foto unggahan. */
export function siteServicePhotoPreviewUrl(url: string | null | undefined): string | null {
  const name = siteServicePhotoName(url);
  return name ? `/admin/layanan/foto/${name}` : null;
}
