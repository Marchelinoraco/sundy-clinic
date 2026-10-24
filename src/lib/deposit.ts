import { formatRupiah } from "@/lib/format";
import { dateLabel, dateOnlyString, validateReason, type Validation } from "@/lib/stock";
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

export type DepositUseKindValue = "BOOKING" | "SALDO";
export type DepositSourceValue = "KELEBIHAN_BAYAR" | "SISA_DEPOSIT_BOOKING";

/** Baris ringkasan tagihan: "Deposit booking" dan "Saldo deposit" (D9). */
export function depositSplit(uses: readonly { kind: DepositUseKindValue; amount: number }[]): { booking: number; saldo: number } {
  let booking = 0;
  let saldo = 0;
  for (const use of uses) {
    if (use.kind === "BOOKING") booking += use.amount;
    else saldo += use.amount;
  }
  return { booking, saldo };
}

/** Catatan saldo yang lahir dari tagihan ini (D9): kelebihan bayar atau sisa deposit booking. */
export function depositCreditNote(credit: { amount: number; source: DepositSourceValue; validUntil: string }): string {
  const what = credit.source === "KELEBIHAN_BAYAR" ? "Kelebihan" : "Sisa deposit booking";
  return `${what} ${formatRupiah(credit.amount)} menjadi deposit, berlaku s.d. ${dateLabel(credit.validUntil)}`;
}

/** Ringkasan deposit satu tagihan untuk layar, struk, dan invoice A4. */
export function depositSummary(
  uses: readonly { kind: DepositUseKindValue; amount: number }[],
  credits: readonly { amount: number; source: DepositSourceValue; validUntil: Date }[],
): { booking: number; saldo: number; notes: string[] } {
  return { ...depositSplit(uses), notes: credits.map((credit) => depositCreditNote({ ...credit, validUntil: dateOnlyString(credit.validUntil) })) };
}

export const DEPOSIT_REFUND_METHODS = ["TUNAI", "TRANSFER"] as const;
export type DepositRefundMethod = (typeof DEPOSIT_REFUND_METHODS)[number];
export type ValidDepositRefund = { amount: number; method: DepositRefundMethod; reason: string };

/**
 * Isian pengembalian deposit (D15, D16), dipakai dialog dan server. `balance` = saldo yang masih berlaku; server
 * memeriksanya lagi setelah pasien dikunci.
 */
export function validateDepositRefund(raw: unknown, balance?: number): Validation<ValidDepositRefund> {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const amount = input.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) return { ok: false, message: "Nominal harus bilangan bulat lebih dari 0." };
  if (amount < DEPOSIT_REFUND_MIN) return { ok: false, message: `Pengembalian minimal ${formatRupiah(DEPOSIT_REFUND_MIN)}.` };
  if (balance !== undefined && amount > balance) return { ok: false, message: depositRefundOverBalance(balance) };
  if (!(DEPOSIT_REFUND_METHODS as readonly unknown[]).includes(input.method)) return { ok: false, message: "Pilih cara pengembalian." };
  const reason = validateReason(input.reason);
  if (!reason.ok) return reason;
  return { ok: true, value: { amount, method: input.method as DepositRefundMethod, reason: reason.value } };
}

export function depositRefundOverBalance(balance: number): string {
  return `Pengembalian melebihi saldo deposit (${formatRupiah(balance)}).`;
}
