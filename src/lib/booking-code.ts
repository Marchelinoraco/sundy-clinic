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
