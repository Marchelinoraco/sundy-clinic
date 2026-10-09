import { randomInt } from "node:crypto";

export const TEMP_PASSWORD_LENGTH = 16;
// Tanpa karakter yang mudah tertukar saat dibaca atau diketik: I O l 0 1.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

/** Kata sandi sementara untuk akun baru atau yang direset. `random(max)` mengembalikan bilangan bulat 0..max-1. */
export function generateTempPassword(random: (max: number) => number = (max) => randomInt(max)): string {
  const pick = (alphabet: string) => alphabet[random(alphabet.length)];
  // Satu dari tiap golongan dulu, sisanya bebas, lalu diacak supaya golongan tidak selalu di depan.
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
