import { describe, expect, it } from "vitest";
import { formatIndonesianDate, formatPrice, formatRupiah } from "@/lib/format";

describe("formatRupiah", () => {
  it("memakai titik sebagai pemisah ribuan", () => {
    expect(formatRupiah(499000)).toBe("Rp 499.000");
  });

  it("memformat angka jutaan", () => {
    expect(formatRupiah(3589000)).toBe("Rp 3.589.000");
  });

  it("memformat angka di bawah seribu", () => {
    expect(formatRupiah(500)).toBe("Rp 500");
  });

  it("tidak menampilkan angka desimal", () => {
    expect(formatRupiah(50000)).toBe("Rp 50.000");
  });

  it("memakai spasi biasa, bukan spasi tanpa putus", () => {
    // Intl menghasilkan U+00A0 setelah "Rp". Spasi itu tidak dapat dicari
    // pengguna dan membingungkan saat uji membandingkan teks.
    expect(formatRupiah(99000)).not.toContain(" ");
  });
});

describe("formatPrice", () => {
  it("menambahkan catatan satuan bila ada", () => {
    expect(formatPrice(50000, "/ unit")).toBe("Rp 50.000 / unit");
  });

  it("menghilangkan catatan bila null", () => {
    expect(formatPrice(499000, null)).toBe("Rp 499.000");
  });

  it("menghilangkan catatan bila tidak diberikan", () => {
    expect(formatPrice(499000)).toBe("Rp 499.000");
  });
});

describe("formatIndonesianDate", () => {
  it("menulis hari dan bulan dalam bahasa Indonesia, dalam WITA", () => {
    // 25 September 2026 pukul 07.00 UTC = 15.00 WITA, hari Jumat.
    const date = new Date("2026-09-25T07:00:00Z");
    expect(formatIndonesianDate(date)).toBe("Jumat, 25 September 2026");
  });

  it("tidak melompat ke tanggal berikutnya dekat tengah malam WITA", () => {
    // 26 Sep pukul 00.30 WITA = 25 Sep pukul 16.30 UTC — tetap tanggal 26 WITA.
    const date = new Date("2026-09-25T16:30:00Z");
    expect(formatIndonesianDate(date)).toBe("Sabtu, 26 September 2026");
  });
});
