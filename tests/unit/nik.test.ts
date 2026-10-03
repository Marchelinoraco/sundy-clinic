import { describe, expect, it } from "vitest";
import {
  decodeNikBirth,
  isNikMissingReason,
  maskNik,
  NIK_MISSING_REASONS,
  nikMismatchWarning,
  normalizeNik,
} from "@/lib/nik";

// Perempuan lahir 17 Mei 1990: tanggal 17 + 40 = 57.
const NIK_P = "7171015705900001";
// Laki-laki lahir 2 Januari 2008.
const NIK_L = "7171010201080002";

describe("normalizeNik", () => {
  it("membuang spasi, titik, dan tanda hubung yang ikut tertempel dari KTP", () => {
    expect(normalizeNik("7171 0157 0590 0001")).toBe(NIK_P);
    expect(normalizeNik("7171.0157.0590.0001")).toBe(NIK_P);
    expect(normalizeNik(" 7171-0157-0590-0001 ")).toBe(NIK_P);
  });

  it("menolak yang bukan tepat 16 angka", () => {
    expect(normalizeNik("123")).toBeNull();
    expect(normalizeNik("71710157059000011")).toBeNull();
    expect(normalizeNik("7171O15705900001")).toBeNull();
    expect(normalizeNik("")).toBeNull();
  });
});

describe("decodeNikBirth", () => {
  it("membaca tanggal +40 sebagai perempuan", () => {
    expect(decodeNikBirth(NIK_P)).toEqual({ day: 17, month: 5, yearTwoDigits: 90, gender: "P" });
    expect(decodeNikBirth(NIK_L)).toEqual({ day: 2, month: 1, yearTwoDigits: 8, gender: "L" });
  });

  it("null bila tanggal atau bulan tidak masuk akal", () => {
    expect(decodeNikBirth("7171010013900001")).toBeNull(); // tanggal 00, bulan 13
    expect(decodeNikBirth("7171017205900001")).toBeNull(); // tanggal 72-40 = 32
  });
});

describe("nikMismatchWarning", () => {
  it("tanpa peringatan bila cocok atau data pasien masih kosong", () => {
    expect(nikMismatchWarning(NIK_P, { birthDate: "1990-05-17", gender: "P" })).toBeNull();
    expect(nikMismatchWarning(NIK_P, { birthDate: null, gender: null })).toBeNull();
  });

  it("menyebut bagian yang tidak cocok", () => {
    expect(nikMismatchWarning(NIK_P, { birthDate: "1990-05-18", gender: "P" })).toBe(
      "Tanggal lahir di NIK berbeda dengan data pasien — periksa KTP.",
    );
    expect(nikMismatchWarning(NIK_P, { birthDate: "1990-05-17", gender: "L" })).toBe(
      "Jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.",
    );
    expect(nikMismatchWarning(NIK_P, { birthDate: "1991-05-17", gender: "L" })).toBe(
      "Tanggal lahir dan jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.",
    );
  });

  it("memperingatkan bila kode tanggal lahir tidak terbaca", () => {
    expect(nikMismatchWarning("7171010013900001", { birthDate: null, gender: null })).toBe(
      "Bagian tanggal lahir di NIK tidak terbaca — periksa KTP.",
    );
  });
});

describe("alasan belum ada NIK dan penyamaran", () => {
  it("mengenal tiga alasan saja", () => {
    expect(Object.keys(NIK_MISSING_REASONS)).toEqual(["WARGA_ASING", "ANAK", "LUPA_KTP"]);
    expect(isNikMissingReason("ANAK")).toBe(true);
    expect(isNikMissingReason("constructor")).toBe(false);
    expect(isNikMissingReason(null)).toBe(false);
  });

  it("menyamarkan NIK kecuali 4 angka terakhir", () => {
    expect(maskNik(NIK_P)).toBe("••••••••••••0001");
  });
});
