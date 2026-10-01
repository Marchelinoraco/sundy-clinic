import { CLINIC_TIMEZONE } from "./clinic";
import { minutesToTimeLabel, witaMinutesOfDay } from "./time";

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

const shortIndonesianDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: CLINIC_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Tanggal singkat dalam WITA untuk tabel, misal "Rab, 7 Okt". */
export function formatShortIndonesianDate(date: Date): string {
  return shortIndonesianDateFormatter.format(date);
}

/** Jadwal di pesan WhatsApp ke pasien, misal "Senin, 5 Oktober 2026 pukul 11.00 WITA". */
export function formatScheduleForMessage(date: Date): string {
  return `${formatIndonesianDate(date)} pukul ${minutesToTimeLabel(witaMinutesOfDay(date))} WITA`;
}

/** Kolom @db.Date (tanggal tanpa jam) → "17/04/1992". Dibaca dari UTC agar tidak bergeser. */
export function formatDateColumn(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10).split("-").reverse().join("/") : null;
}

/** Kode jenis kelamin di basis data → label. */
export function formatGender(gender: "L" | "P" | null): string | null {
  return gender === "P" ? "Perempuan" : gender === "L" ? "Laki-laki" : null;
}
