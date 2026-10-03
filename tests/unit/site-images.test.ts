import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRANCH_IMAGES,
  CATEGORY_IMAGES,
  CLINIC_GALLERY,
  FALLBACK_IMAGE,
  PRODUCT_IMAGE,
  STEP_IMAGES,
  branchImage,
  categoryImage,
  doctorPhotos,
  productImage,
  serviceImage,
  type SiteImage,
} from "@/lib/site-images";

const DIANE = { slug: "diane-paparang", name: "Dr. Diane Paparang, Sp.GK, AIFO-K", photoUrl: null };

// Slug kategori di prisma/seed.ts.
const SEEDED_CATEGORY_SLUGS = [
  "facial",
  "peeling",
  "rf",
  "hifu",
  "botox",
  "laser",
  "dermapen",
  "elektrocauter",
  "skin-booster",
  "vitamin-c",
  "slimming",
];

function allImages(): SiteImage[] {
  const diane = doctorPhotos(DIANE);
  return [
    ...Object.values(CATEGORY_IMAGES),
    ...Object.values(STEP_IMAGES),
    ...CLINIC_GALLERY,
    ...Object.values(BRANCH_IMAGES),
    FALLBACK_IMAGE,
    PRODUCT_IMAGE,
    ...(diane ? [diane.portrait, diane.feature] : []),
  ];
}

describe("peta foto situs publik", () => {
  it("setiap berkas yang dipetakan ada di public/", () => {
    const missing = allImages().filter((image) => !existsSync(join("public", image.src)));
    expect(missing).toEqual([]);
  });

  it("setiap foto punya teks alternatif", () => {
    expect(allImages().filter((image) => image.alt.trim() === "")).toEqual([]);
  });

  it("setiap kategori layanan di data awal punya foto sendiri", () => {
    const unmapped = SEEDED_CATEGORY_SLUGS.filter((slug) => !Object.hasOwn(CATEGORY_IMAGES, slug));
    expect(unmapped).toEqual([]);
    expect(CATEGORY_IMAGES.slimming.src).toBe("/images/stok/kategori-slimming-wellness.jpg");
  });

  it("memakai foto cadangan untuk kategori yang belum punya foto", () => {
    expect(categoryImage("kategori-baru")).toEqual(FALLBACK_IMAGE);
    expect(categoryImage(null)).toEqual(FALLBACK_IMAGE);
    expect(categoryImage(undefined)).toEqual(FALLBACK_IMAGE);
  });

  it("tidak tertipu nama bawaan objek sebagai slug kategori", () => {
    expect(categoryImage("constructor")).toEqual(FALLBACK_IMAGE);
    expect(categoryImage("__proto__")).toEqual(FALLBACK_IMAGE);
    expect(branchImage("toString")).toEqual(CLINIC_GALLERY[0]);
    expect(doctorPhotos({ slug: "constructor", name: "X" })).toBeNull();
  });

  it("mendahulukan foto layanan yang diisi lewat data", () => {
    expect(serviceImage({ name: "HIFU Wajah", imageUrl: "/images/layanan/hifu.jpg" }, "hifu")).toEqual({
      src: "/images/layanan/hifu.jpg",
      alt: "HIFU Wajah",
    });
    expect(serviceImage({ name: "HIFU Wajah", imageUrl: null }, "hifu")).toEqual(CATEGORY_IMAGES.hifu);
  });

  it("mengabaikan alamat foto yang bukan berkas lokal", () => {
    for (const imageUrl of ["https://contoh.com/a.jpg", "//cdn.contoh.com/a.jpg", "foto.jpg", "", "   "]) {
      expect(serviceImage({ name: "HIFU Wajah", imageUrl }, "hifu")).toEqual(CATEGORY_IMAGES.hifu);
      expect(productImage({ name: "Kapsul M", imageUrl })).toEqual(PRODUCT_IMAGE);
    }
  });

  it("mendahulukan foto produk yang diisi lewat data", () => {
    expect(productImage({ name: "Kapsul M", imageUrl: "/images/produk/kapsul-m.jpg" })).toEqual({
      src: "/images/produk/kapsul-m.jpg",
      alt: "Kapsul M",
    });
  });

  it("memetakan dua foto dr. Diane menurut slug staf", () => {
    const photos = doctorPhotos(DIANE);
    expect(photos?.portrait.src).toBe("/images/dokter/diane-1.jpg");
    expect(photos?.feature.src).toBe("/images/dokter/diane-2.jpg");
    expect(photos?.portrait.alt).toBe("dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic");
  });

  it("mendahulukan foto staf yang diisi lewat data, dan kosong bila tidak ada foto", () => {
    expect(doctorPhotos({ slug: "dokter-baru", name: "dr. Baru", photoUrl: "/images/dokter/baru.jpg" })).toEqual({
      portrait: { src: "/images/dokter/baru.jpg", alt: "dr. Baru" },
      feature: { src: "/images/dokter/baru.jpg", alt: "dr. Baru" },
    });
    expect(doctorPhotos({ slug: "terapis-mahakeret", name: "Terapis" })).toBeNull();
  });

  it("memberi setiap cabang foto, dengan cadangan untuk cabang baru", () => {
    expect(branchImage("mahakeret")).toEqual(BRANCH_IMAGES.mahakeret);
    expect(branchImage("cabang-baru")).toEqual(CLINIC_GALLERY[0]);
  });
});
