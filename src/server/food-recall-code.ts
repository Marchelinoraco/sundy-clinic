import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kode link food recall (spec 4.2): "{foodRecallId}.{tanda tangan}". Tanda
 * tangan = HMAC-SHA256(foodRecallId) dengan kunci turunan BETTER_AUTH_SECRET
 * berlabel sendiri, dipotong 16 byte — kode link kuis (label lain) tidak
 * pernah berlaku di sini. Kode tidak disimpan di basis data. Hanya untuk
 * server: kuncinya rahasia.
 */
const KEY_LABEL = "sundy:food-recall-link:v1";
const SIGNATURE_BYTES = 16;
const CODE_PATTERN = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{22})$/;

export function foodRecallKey(secret: string | undefined = process.env.BETTER_AUTH_SECRET): Buffer {
  if (!secret) throw new Error("BETTER_AUTH_SECRET belum diisi; link food recall tidak bisa dibuat.");
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function signature(foodRecallId: string, key: Buffer): string {
  return createHmac("sha256", key).update(foodRecallId).digest().subarray(0, SIGNATURE_BYTES).toString("base64url");
}

export function foodRecallCode(foodRecallId: string, key: Buffer = foodRecallKey()): string {
  return `${foodRecallId}.${signature(foodRecallId, key)}`;
}

export function parseFoodRecallCode(code: unknown): { foodRecallId: string; signature: string } | null {
  if (typeof code !== "string") return null;
  const match = CODE_PATTERN.exec(code);
  return match ? { foodRecallId: match[1], signature: match[2] } : null;
}

/** Perbandingan waktu-konstan atas teks base64url (lihat quiz-link-code.ts). */
export function isValidFoodRecallCode(code: string, key: Buffer = foodRecallKey()): boolean {
  const parsed = parseFoodRecallCode(code);
  if (!parsed) return false;
  const given = Buffer.from(parsed.signature);
  const expected = Buffer.from(signature(parsed.foodRecallId, key));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Kode setelah "#": tidak pernah dikirim browser ke server, jadi tidak tercatat di log. */
export function foodRecallUrl(siteUrl: string, foodRecallId: string, key: Buffer = foodRecallKey()): string {
  return `${siteUrl}/food-recall#${foodRecallCode(foodRecallId, key)}`;
}
