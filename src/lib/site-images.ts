/**
 * Foto situs publik: berkas, teks alternatif, dan kegunaannya.
 *
 * Foto stok sementara dari Unsplash (sumbernya di public/images/stok/SUMBER.md).
 * Menggantinya dengan foto klinik sendiri cukup dengan menimpa berkas bernama sama.
 *
 * Foto yang diisi lewat data (Service.imageUrl, Product.imageUrl, Staff.photoUrl)
 * didahulukan, asalkan berupa berkas lokal yang diawali "/". next/image di situs
 * ini tidak mengizinkan domain luar, jadi alamat lain diabaikan dan foto
 * cadangan yang dipakai.
 */
export type SiteImage = { src: string; alt: string };

export type DoctorPhotos = {
  /** Foto 1 (latar krem): hero Beranda dan Tentang. */
  portrait: SiteImage;
  /** Foto 2 (latar biru): bagian Dokter. */
  feature: SiteImage;
};

const STOCK = "/images/stok";

export const CATEGORY_IMAGES: Record<string, SiteImage> = {
  facial: { src: `${STOCK}/kategori-facial.jpg`, alt: "Masker wajah dioleskan saat perawatan facial" },
  peeling: { src: `${STOCK}/kategori-peeling.jpg`, alt: "Pipet meneteskan cairan bening" },
  rf: { src: `${STOCK}/kategori-rf.jpg`, alt: "Dua roller wajah berwarna putih dan rose gold" },
  hifu: { src: `${STOCK}/kategori-hifu.jpg`, alt: "Perawatan wajah dengan alat logam" },
  botox: { src: `${STOCK}/kategori-botox.jpg`, alt: "Tangan memegang jarum suntik" },
  laser: { src: `${STOCK}/kategori-laser.jpg`, alt: "Perawatan laser pada kaki" },
  dermapen: { src: `${STOCK}/kategori-dermapen.jpg`, alt: "Roller perawatan kulit berwarna emas" },
  elektrocauter: {
    src: `${STOCK}/kategori-elektrocauter.jpg`,
    alt: "Tangan bersarung tangan memegang nampan alat",
  },
  "skin-booster": {
    src: `${STOCK}/kategori-skin-booster.jpg`,
    alt: "Pipet serum dengan bayangan panjang",
  },
  "vitamin-c": { src: `${STOCK}/kategori-vitamin-c.jpg`, alt: "Jeruk dan pipet serum" },
  slimming: {
    src: `${STOCK}/kategori-slimming-wellness.jpg`,
    alt: "Salad sayuran segar di atas piring putih",
  },
};

export const CLINIC_GALLERY: readonly SiteImage[] = [
  { src: `${STOCK}/suasana-1.jpg`, alt: "Ruang perawatan dengan ranjang, meja bundar kecil, dan hiasan dinding anyaman" },
  { src: `${STOCK}/suasana-2.jpg`, alt: "Ranjang perawatan berseprai krem di samping wastafel" },
  { src: `${STOCK}/suasana-3.jpg`, alt: "Rak produk perawatan kulit di lorong yang terang" },
];

/** Foto untuk kategori yang belum punya foto sendiri. */
export const FALLBACK_IMAGE: SiteImage = CLINIC_GALLERY[2];

export const STEP_IMAGES = {
  konsultasi: { src: `${STOCK}/langkah-konsultasi.jpg`, alt: "Stetoskop di atas latar putih" },
  timbang: { src: `${STOCK}/langkah-timbang.jpg`, alt: "Semangkuk salad sayur di mangkuk kaca" },
  kontrol: { src: `${STOCK}/langkah-kontrol.jpg`, alt: "Pinggang diukur dengan pita ukur kuning" },
} satisfies Record<string, SiteImage>;

export const PRODUCT_IMAGE: SiteImage = { src: `${STOCK}/produk.jpg`, alt: "Tiga botol putih" };

export const BRANCH_IMAGES: Record<string, SiteImage> = {
  mahakeret: CLINIC_GALLERY[0],
  citraland: CLINIC_GALLERY[1],
};

const DOCTOR_PHOTOS: Record<string, DoctorPhotos> = {
  "diane-paparang": {
    portrait: {
      src: "/images/dokter/diane-1.jpg",
      alt: "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic",
    },
    feature: {
      src: "/images/dokter/diane-2.jpg",
      alt: "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic",
    },
  },
};

function isLocalImage(url: string | null | undefined): url is string {
  return typeof url === "string" && /^\/(?!\/)\S+$/.test(url);
}

/** Dicari dengan Object.hasOwn: slug seperti "constructor" tidak boleh terbaca sebagai milik objek. */
function lookup<T>(map: Record<string, T>, key: string | null | undefined): T | undefined {
  return key && Object.hasOwn(map, key) ? map[key] : undefined;
}

export function categoryImage(slug?: string | null): SiteImage {
  return lookup(CATEGORY_IMAGES, slug) ?? FALLBACK_IMAGE;
}

export function serviceImage(
  service: { name: string; imageUrl?: string | null },
  categorySlug?: string | null,
): SiteImage {
  if (isLocalImage(service.imageUrl)) return { src: service.imageUrl, alt: service.name };
  return categoryImage(categorySlug);
}

export function productImage(product: { name: string; imageUrl?: string | null }): SiteImage {
  if (isLocalImage(product.imageUrl)) return { src: product.imageUrl, alt: product.name };
  return PRODUCT_IMAGE;
}

export function branchImage(slug: string): SiteImage {
  return lookup(BRANCH_IMAGES, slug) ?? CLINIC_GALLERY[0];
}

export function doctorPhotos(staff: {
  slug: string;
  name: string;
  photoUrl?: string | null;
}): DoctorPhotos | null {
  if (isLocalImage(staff.photoUrl)) {
    const photo = { src: staff.photoUrl, alt: staff.name };
    return { portrait: photo, feature: photo };
  }
  return lookup(DOCTOR_PHOTOS, staff.slug) ?? null;
}
