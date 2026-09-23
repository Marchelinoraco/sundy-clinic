import { describe, expect, it } from "vitest";
import { validatePriceChange } from "@/lib/price-validation";

describe("penyuntingan harga layanan", () => {
  it("menerima harga promo yang lebih murah dari harga normal", () => {
    expect(validatePriceChange({ normalPrice: 749000, promoPrice: 499000 })).toBeNull();
  });

  it("menolak harga promo yang lebih mahal dari harga normal", () => {
    // Harga coret yang lebih murah dari harga promo terlihat seperti
    // kesalahan di halaman publik, dan pasien yang menemukannya lebih dulu.
    expect(validatePriceChange({ normalPrice: 499000, promoPrice: 749000 })).toMatch(
      /harga promo/i,
    );
  });

  it("menolak harga nol atau negatif", () => {
    expect(validatePriceChange({ normalPrice: null, promoPrice: 0 })).toMatch(/lebih dari nol/i);
    expect(validatePriceChange({ normalPrice: null, promoPrice: -5000 })).toMatch(
      /lebih dari nol/i,
    );
  });

  it("menolak harga yang bukan bilangan bulat", () => {
    // Rupiah tidak punya sen. Pecahan di sini berarti ada yang salah hitung.
    expect(validatePriceChange({ normalPrice: null, promoPrice: 99000.5 })).toMatch(
      /bilangan bulat/i,
    );
  });

  it("menerima layanan tanpa harga coret", () => {
    expect(validatePriceChange({ normalPrice: null, promoPrice: 50000 })).toBeNull();
  });
});
