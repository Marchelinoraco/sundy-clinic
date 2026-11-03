import { describe, expect, it } from "vitest";
import {
  CATEGORY_DESCRIPTION_MAX,
  CATEGORY_NAME_MAX,
  categoryPhotoName,
  categoryPhotoUrl,
  categorySlugBase,
  nextFreeSlug,
  validateServiceCategory,
} from "@/lib/service-category";

const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";

describe("validateServiceCategory (spec kategori layanan KL3, KL14)", () => {
  it("merapikan nama satu baris dan menyimpan deskripsi kosong sebagai null", () => {
    expect(validateServiceCategory({ name: "  Hair   Treatment ", description: "", selfBookable: true })).toEqual({
      ok: true,
      value: { name: "Hair Treatment", description: null, selfBookable: true },
    });
    expect(validateServiceCategory({ name: "Konsultasi & Jasa", description: " Jasa non-treatment ", selfBookable: false })).toEqual({
      ok: true,
      value: { name: "Konsultasi & Jasa", description: "Jasa non-treatment", selfBookable: false },
    });
  });

  it("menolak nama kosong atau lebih dari 60 karakter", () => {
    expect(validateServiceCategory({ name: "   ", description: null, selfBookable: true })).toEqual({ ok: false, message: "Isi nama kategori." });
    expect(CATEGORY_NAME_MAX).toBe(60);
    expect(validateServiceCategory({ name: "a".repeat(60), description: null, selfBookable: true }).ok).toBe(true);
    expect(validateServiceCategory({ name: "a".repeat(61), description: null, selfBookable: true })).toEqual({
      ok: false,
      message: "Nama kategori paling banyak 60 karakter.",
    });
  });

  it("menolak deskripsi lebih dari 200 karakter", () => {
    expect(CATEGORY_DESCRIPTION_MAX).toBe(200);
    expect(validateServiceCategory({ name: "Hair", description: "d".repeat(200), selfBookable: true }).ok).toBe(true);
    expect(validateServiceCategory({ name: "Hair", description: "d".repeat(201), selfBookable: true })).toEqual({
      ok: false,
      message: "Deskripsi paling banyak 200 karakter.",
    });
  });

  it("menolak data rusak", () => {
    expect(validateServiceCategory({ name: "Hair", description: null, selfBookable: "ya" })).toEqual({ ok: false, message: INVALID });
    expect(validateServiceCategory({ name: 5, description: null, selfBookable: true })).toEqual({ ok: false, message: INVALID });
    expect(validateServiceCategory({ name: "Hair", description: 5, selfBookable: true })).toEqual({ ok: false, message: INVALID });
    expect(validateServiceCategory(null)).toEqual({ ok: false, message: INVALID });
  });
});

describe("slug kategori (KL5, Review Focus 3)", () => {
  it("dibuat dari nama, dengan cadangan bila nama tidak menghasilkan huruf", () => {
    expect(categorySlugBase("Hair & Scalp")).toBe("hair-scalp");
    expect(categorySlugBase("✨✨")).toBe("kategori");
    expect(categorySlugBase(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
  });

  it("diberi akhiran bila sudah dipakai", () => {
    expect(nextFreeSlug("facial", ["facial", "facial-2"])).toBe("facial-3");
    expect(nextFreeSlug("facial", ["facial"])).toBe("facial-2");
    expect(nextFreeSlug("hair", ["facial"])).toBe("hair");
  });
});

describe("alamat foto kategori (KL9)", () => {
  it("hanya mengenali nama berkas unggahan yang sah", () => {
    expect(categoryPhotoUrl("cat1-0123abcd.webp")).toBe("/foto-kategori/cat1-0123abcd.webp");
    expect(categoryPhotoName(categoryPhotoUrl("cat1-0123abcd.webp"))).toBe("cat1-0123abcd.webp");
    for (const url of ["/foto-kategori/../x.webp", "/foto-layanan/cat1-0123abcd.webp", "/images/stok/kategori-hifu.jpg", null, undefined]) {
      expect(categoryPhotoName(url)).toBeNull();
    }
  });
});
