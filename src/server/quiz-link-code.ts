import { createHmac, timingSafeEqual } from "node:crypto";
import { quizLinkState, quizLinkVersion, type QuizLinkBooking } from "@/lib/quiz-link";

/**
 * Kode link kuis (spec C3 bagian 6): "{appointmentId}.{tanda tangan}". Tanda
 * tangan = HMAC-SHA256("{appointmentId}.{versi}") dengan kunci turunan
 * BETTER_AUTH_SECRET, dipotong 16 byte. Kode tidak disimpan di basis data,
 * sehingga backup database saja tidak cukup untuk membuka link pasien.
 * Modul ini hanya untuk server: kuncinya rahasia.
 */
const KEY_LABEL = "sundy:isi-link:v1";
const SIGNATURE_BYTES = 16;
const CODE_PATTERN = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{22})$/;

export function quizLinkKey(secret: string | undefined = process.env.BETTER_AUTH_SECRET): Buffer {
  if (!secret) throw new Error("BETTER_AUTH_SECRET belum diisi; link kuis tidak bisa dibuat.");
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function signature(appointmentId: string, version: number, key: Buffer): Buffer {
  return createHmac("sha256", key).update(`${appointmentId}.${version}`).digest().subarray(0, SIGNATURE_BYTES);
}

export function quizLinkCode(appointmentId: string, version: number, key: Buffer = quizLinkKey()): string {
  return `${appointmentId}.${signature(appointmentId, version, key).toString("base64url")}`;
}

export function parseQuizLinkCode(code: unknown): { appointmentId: string; signature: string } | null {
  if (typeof code !== "string") return null;
  const match = CODE_PATTERN.exec(code);
  return match ? { appointmentId: match[1], signature: match[2] } : null;
}

/**
 * Perbandingan waktu-konstan: lama pemeriksaan tidak membocorkan berapa karakter yang benar.
 * Teks base64url-nya yang dibandingkan, bukan byte hasil decode: karakter terakhir dari 16 byte
 * hanya membawa 2 bit, sehingga beberapa teks berbeda ter-decode ke byte yang sama.
 */
export function isValidQuizLinkCode(code: string, version: number, key: Buffer = quizLinkKey()): boolean {
  const parsed = parseQuizLinkCode(code);
  if (!parsed) return false;
  const given = Buffer.from(parsed.signature);
  const expected = Buffer.from(signature(parsed.appointmentId, version, key).toString("base64url"));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Kode ditaruh setelah "#": browser tidak pernah mengirimnya ke server, jadi
 * tidak tercatat di log nginx maupun Cloudflare (spec C3 3.1).
 */
export function quizLinkUrl(
  siteUrl: string,
  appointmentId: string,
  version: number,
  key: Buffer = quizLinkKey(),
): string {
  return `${siteUrl}/isi#${quizLinkCode(appointmentId, version, key)}`;
}

/** Link untuk pesan dan baris booking, atau null bila link tidak (lagi) berlaku. */
export function quizLinkFor(
  booking: QuizLinkBooking & { id: string },
  siteUrl: string,
  now: Date,
  key?: Buffer,
): string | null {
  if (quizLinkState(booking, now) !== "OPEN") return null;
  return quizLinkUrl(siteUrl, booking.id, quizLinkVersion(booking), key ?? quizLinkKey());
}
