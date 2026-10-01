// Tanpa 0/O dan 1/I — keduanya mudah tertukar saat kode dibacakan lewat telepon.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Kode booking format SDY-XXXX. Keunikan diperiksa & diulang di lapisan server. */
export function generateBookingCode(): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `SDY-${suffix}`;
}

/**
 * Kode booking dari `?kode=` di tautan konfirmasi (spec C2 3.3). Kode saja tidak
 * membuka status — customer tetap mengetik 4 digit akhir WhatsApp-nya. Nilai yang
 * tidak mirip kode, atau parameter ganda, menghasilkan kolom kosong.
 */
export function bookingCodeFromParam(value: string | string[] | undefined): string {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9-]{1,20}$/.test(code) ? code : "";
}
