import { addDaysToDateString } from "@/lib/time";

// Deposit booking dan saldo deposit pasien (spec deposit D1–D18). Murni: dipakai halaman dan server.

/** Saldo deposit berlaku 30 hari sejak dicatat (D7). */
export const DEPOSIT_VALID_DAYS = 30;
/** Pengembalian dalam bentuk uang hanya untuk saldo Rp 200.000 ke atas (D16). */
export const DEPOSIT_REFUND_MIN = 200_000;

/** "Berlaku s.d." = tanggal dicatat (WITA, YYYY-MM-DD) + 30 hari. */
export function depositValidUntil(recordedOn: string): string {
  return addDaysToDateString(recordedOn, DEPOSIT_VALID_DAYS);
}

/** Masih bisa dipakai pada tanggal "berlaku s.d.", hangus sehari sesudahnya (D7). */
export function isCreditActive(validUntil: string, today: string): boolean {
  return validUntil >= today;
}

/**
 * Bagian tiap kredit yang dipakai untuk `amount` (D6, D16): hanya kredit yang masih berlaku, yang kedaluwarsa paling dulu
 * lebih dulu (urutan masuk dipertahankan bila tanggalnya sama), berhenti saat `amount` habis atau saldo habis.
 */
export function allocateCredits(
  credits: readonly { id: string; remaining: number; validUntil: string }[],
  amount: number,
  today: string,
): { creditId: string; amount: number }[] {
  const parts: { creditId: string; amount: number }[] = [];
  let left = amount;
  const active = credits
    .map((credit, index) => ({ credit, index }))
    .filter(({ credit }) => credit.remaining > 0 && isCreditActive(credit.validUntil, today))
    .sort((a, b) => a.credit.validUntil.localeCompare(b.credit.validUntil) || a.index - b.index);
  for (const { credit } of active) {
    if (left <= 0) break;
    const take = Math.min(credit.remaining, left);
    parts.push({ creditId: credit.id, amount: take });
    left -= take;
  }
  return parts;
}
