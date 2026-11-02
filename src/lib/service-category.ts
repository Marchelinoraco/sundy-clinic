import { DOCTOR_PHOTO_NAME } from "./doctor-profile";
import { slugify } from "./slug";
import type { Validation } from "./stock";

/** Aturan kategori layanan (spec kategori layanan KL3, KL5, KL9, KL14). Murni: dipakai server dan komponen klien. */
export const CATEGORY_NAME_MAX = 60;
export const CATEGORY_DESCRIPTION_MAX = 200;
export const CATEGORY_PHOTO_PATH_PREFIX = "/foto-kategori/";
const SLUG_MAX = 60;
const FALLBACK_SLUG = "kategori";
const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";

export type ServiceCategoryInput = { name: string; description: string | null; selfBookable: boolean };

const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

export function validateServiceCategory(raw: unknown): Validation<ServiceCategoryInput> {
  if (typeof raw !== "object" || raw === null) return fail(INVALID);
  const input = raw as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : null;
  const description =
    input.description === null || input.description === undefined ? "" : typeof input.description === "string" ? input.description.replace(/\r\n/g, "\n").trim() : null;
  if (name === null || description === null || typeof input.selfBookable !== "boolean") return fail(INVALID);
  if (!name) return fail("Isi nama kategori.");
  if (name.length > CATEGORY_NAME_MAX) return fail(`Nama kategori paling banyak ${CATEGORY_NAME_MAX} karakter.`);
  if (description.length > CATEGORY_DESCRIPTION_MAX) return fail(`Deskripsi paling banyak ${CATEGORY_DESCRIPTION_MAX} karakter.`);
  return { ok: true, value: { name, description: description || null, selfBookable: input.selfBookable } };
}

/** Slug dari nama, dipotong 60 karakter tanpa tanda hubung di ujung; "kategori" bila nama tidak menghasilkan huruf. */
export function categorySlugBase(name: string): string {
  return slugify(name).slice(0, SLUG_MAX).replace(/-+$/, "") || FALLBACK_SLUG;
}

/** `base` bila belum dipakai, selain itu `base-2`, `base-3`, … yang pertama kosong. */
export function nextFreeSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function categoryPhotoUrl(name: string): string {
  return `${CATEGORY_PHOTO_PATH_PREFIX}${name}`;
}

/** Nama berkas dari `imageUrl`, atau null bila bukan foto kategori unggahan yang sah. */
export function categoryPhotoName(url: string | null | undefined): string | null {
  if (!url?.startsWith(CATEGORY_PHOTO_PATH_PREFIX)) return null;
  const name = url.slice(CATEGORY_PHOTO_PATH_PREFIX.length);
  return DOCTOR_PHOTO_NAME.test(name) ? name : null;
}
