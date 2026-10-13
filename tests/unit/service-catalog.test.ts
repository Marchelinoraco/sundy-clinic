import { describe, expect, it } from "vitest";
import {
  siteServicePhotoName,
  siteServicePhotoPreviewUrl,
  siteServicePhotoUrl,
  siteSlugFrom,
  validateInternalService,
  validateSiteService,
} from "@/lib/service-catalog";

const internal = { name: "  Add-on   Masker  ", categoryId: "c1", promoPrice: 75_000, normalPrice: null, durationMin: 30, requiresDoctor: false };
const site = { serviceId: "s1", name: "Masker Glow", slug: "masker-glow", categoryId: "c1", description: "  Baris satu\r\nBaris dua  ", priceNote: "", isSignature: false, sortOrder: 3 };

describe("validasi layanan internal", () => {
  it("merapikan nama dan menerima isian sah", () => {
    expect(validateInternalService(internal)).toEqual({ ok: true, value: { ...internal, name: "Add-on Masker" } });
  });

  it.each([
    [{ name: "" }, "Isi nama layanan."],
    [{ name: "A" }, "Nama layanan 2–100 karakter."],
    [{ name: "x".repeat(101) }, "Nama layanan 2–100 karakter."],
    [{ categoryId: "" }, "Pilih kategori."],
    [{ promoPrice: 0 }, "Harga harus lebih dari nol."],
    [{ promoPrice: Number.NaN }, "Harga harus bilangan bulat rupiah, tanpa desimal."],
    [{ normalPrice: 50_000 }, "Harga promo harus lebih murah dari harga coret."],
    [{ durationMin: 20 }, "Durasi 15–480 menit, kelipatan 15."],
    [{ durationMin: 495 }, "Durasi 15–480 menit, kelipatan 15."],
    [{ durationMin: 0 }, "Durasi 15–480 menit, kelipatan 15."],
  ])("menolak %j", (patch, message) => {
    expect(validateInternalService({ ...internal, ...patch })).toEqual({ ok: false, message });
  });

  it("menolak bentuk data yang rusak", () => {
    expect(validateInternalService(null)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
    expect(validateInternalService({ ...internal, requiresDoctor: "ya" })).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("validasi layanan situs", () => {
  it("merapikan deskripsi (baris baru dipertahankan) dan mengosongkan satuan harga kosong", () => {
    expect(validateSiteService(site)).toEqual({ ok: true, value: { ...site, description: "Baris satu\nBaris dua", priceNote: null } });
  });

  it.each([
    [{ serviceId: "" }, "Pilih layanan internal."],
    [{ name: " " }, "Isi nama di situs."],
    [{ name: "M" }, "Nama di situs 2–100 karakter."],
    [{ slug: "" }, "Isi alamat (slug)."],
    [{ slug: "Masker Glow" }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ slug: "masker--glow" }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ slug: "-masker" }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ slug: "m" }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ slug: "m".repeat(81) }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ categoryId: "" }, "Pilih kategori."],
    [{ description: "x".repeat(2001) }, "Deskripsi paling banyak 2.000 karakter."],
    [{ priceNote: "x".repeat(41) }, "Satuan harga paling banyak 40 karakter."],
    [{ sortOrder: -1 }, "Urutan harus bilangan bulat 0–9999."],
    [{ sortOrder: 1.5 }, "Urutan harus bilangan bulat 0–9999."],
  ])("menolak %j", (patch, message) => {
    expect(validateSiteService({ ...site, ...patch })).toEqual({ ok: false, message });
  });
});

describe("slug dan foto layanan situs", () => {
  it("membuat slug dari nama, paling panjang 80 karakter tanpa tanda hubung di ujung", () => {
    expect(siteSlugFrom("Facial Glow + Masker (Promo!)")).toBe("facial-glow-masker-promo");
    expect(siteSlugFrom(`${"a".repeat(79)} b`)).toBe("a".repeat(79));
  });

  it("alamat foto hanya untuk nama berkas unggahan yang sah", () => {
    const name = "ssabc123-0123abcd.webp";
    expect(siteServicePhotoUrl(name)).toBe("/foto-layanan/ssabc123-0123abcd.webp");
    expect(siteServicePhotoName("/foto-layanan/ssabc123-0123abcd.webp")).toBe(name);
    expect(siteServicePhotoPreviewUrl("/foto-layanan/ssabc123-0123abcd.webp")).toBe("/admin/layanan/foto/ssabc123-0123abcd.webp");
    for (const url of [null, undefined, "/images/layanan/hifu.jpg", "/foto-layanan/../rahasia.webp", "/foto-dokter/ssabc123-0123abcd.webp"]) {
      expect(siteServicePhotoName(url)).toBeNull();
      expect(siteServicePhotoPreviewUrl(url)).toBeNull();
    }
  });
});
