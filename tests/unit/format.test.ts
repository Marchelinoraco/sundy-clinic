import { describe, expect, it } from "vitest";
import { formatPrice, formatRupiah } from "@/lib/format";

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
