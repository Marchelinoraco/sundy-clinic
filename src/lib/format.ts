import { CLINIC_TIMEZONE } from "./clinic";

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Memformat rupiah penuh menjadi teks siap tampil.
 * Intl menghasilkan "Rp" diikuti spasi tanpa putus (U+00A0); klinik memakai
 * spasi biasa agar teksnya dapat dicari dan disalin dengan wajar.
 */
export function formatRupiah(amount: number): string {
  return rupiahFormatter.format(amount).replace(/^Rp\s?/u, "Rp ");
}

/** Menggabungkan harga dengan catatan satuannya, misal "Rp 50.000 / unit". */
export function formatPrice(promoPrice: number, priceNote?: string | null): string {
  const price = formatRupiah(promoPrice);
  return priceNote ? `${price} ${priceNote}` : price;
}

const indonesianDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: CLINIC_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Menulis tanggal dalam zona waktu klinik (WITA), misal "Jumat, 25 September 2026". */
export function formatIndonesianDate(date: Date): string {
  return indonesianDateFormatter.format(date);
}
