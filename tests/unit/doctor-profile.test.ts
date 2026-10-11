import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BIO_MAX,
  DOCTOR_PHOTO_NAME,
  SPECIALTY_MAX,
  detectPhotoKind,
  doctorPhotoName,
  doctorPhotoUrl,
  roleHasPublicProfile,
  validateBio,
  validateSpecialty,
} from "@/lib/doctor-profile";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

describe("spesialisasi dan deskripsi", () => {
  it("spesialisasi dirapikan, kosong menjadi null, dan dibatasi 100 karakter", () => {
    expect(validateSpecialty("  Spesialis   Gizi  Klinik ")).toEqual({ ok: true, value: "Spesialis Gizi Klinik" });
    expect(validateSpecialty("   ")).toEqual({ ok: true, value: null });
    expect(validateSpecialty(undefined)).toEqual({ ok: true, value: null });
    expect(validateSpecialty("x".repeat(SPECIALTY_MAX))).toEqual({ ok: true, value: "x".repeat(SPECIALTY_MAX) });
    expect(validateSpecialty("x".repeat(SPECIALTY_MAX + 1))).toEqual({ ok: false, message: "Spesialisasi paling banyak 100 karakter." });
  });

  it("deskripsi mempertahankan baris baru, dipangkas, kosong menjadi null, dan dibatasi 600 karakter", () => {
    expect(validateBio("  Baris satu.\r\nBaris dua.  ")).toEqual({ ok: true, value: "Baris satu.\nBaris dua." });
    expect(validateBio("")).toEqual({ ok: true, value: null });
    expect(validateBio(null)).toEqual({ ok: true, value: null });
    expect(validateBio("x".repeat(BIO_MAX))).toEqual({ ok: true, value: "x".repeat(BIO_MAX) });
    expect(validateBio("x".repeat(BIO_MAX + 1))).toEqual({ ok: false, message: "Deskripsi paling banyak 600 karakter." });
  });
});

describe("nama dan alamat foto", () => {
  it("hanya pola id-sidikjari.webp yang sah", () => {
    expect(DOCTOR_PHOTO_NAME.test("cmv0abc123-0a1b2c3d.webp")).toBe(true);
    for (const bad of ["../cmv0abc-0a1b2c3d.webp", "cmv0abc-0a1b2c3d.png", "cmv0abc-0A1B2C3D.webp", "cmv0abc-0a1b2c3.webp", "cmv0abc.webp", "-0a1b2c3d.webp", "a/b-0a1b2c3d.webp", "cmv0abc-0a1b2c3d.webp/x"]) {
      expect(DOCTOR_PHOTO_NAME.test(bad)).toBe(false);
    }
  });

  it("menyusun alamat dari nama dan membacanya kembali; nilai lain menghasilkan null", () => {
    expect(doctorPhotoUrl("cmv0abc-0a1b2c3d.webp")).toBe("/foto-dokter/cmv0abc-0a1b2c3d.webp");
    expect(doctorPhotoName("/foto-dokter/cmv0abc-0a1b2c3d.webp")).toBe("cmv0abc-0a1b2c3d.webp");
    expect(doctorPhotoName("/images/dokter/diane-1.jpg")).toBeNull();
    expect(doctorPhotoName("/foto-dokter/../rahasia.webp")).toBeNull();
    expect(doctorPhotoName(null)).toBeNull();
    expect(doctorPhotoName(undefined)).toBeNull();
  });

  it("hanya dokter dan terapis yang punya profil di situs", () => {
    expect(roleHasPublicProfile("DOKTER")).toBe(true);
    expect(roleHasPublicProfile("TERAPIS")).toBe(true);
    for (const role of ["SUPER_ADMIN", "RESEPSIONIS", "APOTEKER", "ADMIN_KEUANGAN"] as const) expect(roleHasPublicProfile(role)).toBe(false);
  });
});

describe("jenis foto dari isi berkas", () => {
  it("mengenali JPEG, PNG, dan WebP", () => {
    expect(detectPhotoKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe("jpeg");
    expect(detectPhotoKind(bytes(0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(detectPhotoKind(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toBe("webp");
  });

  it("menolak HTML, SVG, PDF, HEIC, dan berkas pendek", () => {
    expect(detectPhotoKind(bytes(...ascii("<!doctype html><script>alert(1)</script>")))).toBeNull();
    expect(detectPhotoKind(bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBeNull();
    expect(detectPhotoKind(bytes(...ascii("%PDF-1.7")))).toBeNull();
    expect(detectPhotoKind(bytes(0, 0, 0, 24, ...ascii("ftypheic"), 0))).toBeNull();
    expect(detectPhotoKind(bytes(0xff, 0xd8))).toBeNull();
    expect(detectPhotoKind(new Uint8Array(0))).toBeNull();
  });
});

describe("dependensi", () => {
  it("sharp adalah dependensi langsung proyek (bukan hanya ikut Next.js)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.sharp).toMatch(/^\^?0\.35\./);
  });
});
