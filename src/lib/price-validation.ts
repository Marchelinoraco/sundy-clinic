export type PriceInput = { normalPrice: number | null; promoPrice: number };

/**
 * Mengembalikan pesan kesalahan, atau null bila harga sah.
 *
 * Tinggal di src/lib/ dan bukan di src/server/, karena berkas bertanda
 * "use server" hanya boleh mengekspor fungsi async.
 */
export function validatePriceChange({ normalPrice, promoPrice }: PriceInput): string | null {
  if (!Number.isInteger(promoPrice)) {
    return "Harga harus bilangan bulat rupiah, tanpa desimal.";
  }
  if (promoPrice <= 0) {
    return "Harga harus lebih dari nol.";
  }
  if (normalPrice !== null && !Number.isInteger(normalPrice)) {
    return "Harga coret harus bilangan bulat rupiah, tanpa desimal.";
  }
  if (normalPrice !== null && normalPrice <= promoPrice) {
    return "Harga promo harus lebih murah dari harga coret.";
  }
  return null;
}
