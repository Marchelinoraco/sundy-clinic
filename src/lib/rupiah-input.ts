import { formatRupiah } from "./format";

/** Harga paling banyak 12 digit (ratusan miliar rupiah); sisanya dipotong. */
const MAX_DIGITS = 12;

/** Membaca teks ketikan atau tempelan ("Rp 1.000.000", "1.000.000,-") sebagai angka bulat; tanpa angka = null. */
export function parseRupiahText(text: string): number | null {
  const digits = text.replace(/\D/g, "").slice(0, MAX_DIGITS);
  return digits ? Number(digits) : null;
}

export function rupiahInputText(value: number | null): string {
  return value === null ? "" : formatRupiah(value);
}
