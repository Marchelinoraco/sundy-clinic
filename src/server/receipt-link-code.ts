import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kode tautan struk (spec struk WA bagian 4): "{invoiceId}.{tanda tangan}". Tanda tangan =
 * HMAC-SHA256("{invoiceId}.{versi}") dengan kunci turunan BETTER_AUTH_SECRET berlabel sendiri
 * (bukan label link kuis), dipotong 16 byte. Kode tidak disimpan di basis data. Hanya untuk server.
 */
const KEY_LABEL = "sundy:struk-link:v1";
const SIGNATURE_BYTES = 16;
const CODE_PATTERN = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{22})$/;

export function receiptKey(secret: string | undefined = process.env.BETTER_AUTH_SECRET): Buffer {
  if (!secret) throw new Error("BETTER_AUTH_SECRET belum diisi; tautan struk tidak bisa dibuat.");
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function signature(invoiceId: string, version: number, key: Buffer): string {
  return createHmac("sha256", key).update(`${invoiceId}.${version}`).digest().subarray(0, SIGNATURE_BYTES).toString("base64url");
}

export function receiptCode(invoiceId: string, version: number, key: Buffer = receiptKey()): string {
  return `${invoiceId}.${signature(invoiceId, version, key)}`;
}

export function parseReceiptCode(code: unknown): { invoiceId: string; signature: string } | null {
  if (typeof code !== "string") return null;
  const match = CODE_PATTERN.exec(code);
  return match ? { invoiceId: match[1], signature: match[2] } : null;
}

/** Perbandingan waktu-konstan atas teks base64url (lihat isValidQuizLinkCode). */
export function isValidReceiptCode(code: string, version: number, key: Buffer = receiptKey()): boolean {
  const parsed = parseReceiptCode(code);
  if (!parsed) return false;
  const given = Buffer.from(parsed.signature);
  const expected = Buffer.from(signature(parsed.invoiceId, version, key));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Kode di belakang "#": browser tidak mengirimnya ke server, jadi tidak tercatat di log nginx maupun Cloudflare. */
export function receiptUrl(siteUrl: string, invoiceId: string, version: number, key: Buffer = receiptKey()): string {
  return `${siteUrl}/struk#${receiptCode(invoiceId, version, key)}`;
}
