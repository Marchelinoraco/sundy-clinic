import type { Validation } from "./stock";

// Rekening klinik penerima transfer tagihan (spec perbaikan tagihan 7). Murni.

export type ClinicBankAccountInput = { bankName: string; accountNumber: string; accountHolder: string };

export function validateClinicBankAccount(raw: unknown): Validation<ClinicBankAccountInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." };
  const input = raw as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const bankName = text(input.bankName);
  const accountHolder = text(input.accountHolder);
  const accountNumber = text(input.accountNumber).replace(/[\s-]/g, "");
  if (!bankName) return { ok: false, message: "Isi nama bank." };
  if (bankName.length > 80) return { ok: false, message: "Nama bank paling banyak 80 karakter." };
  if (!/^\d{5,20}$/.test(accountNumber)) return { ok: false, message: "Nomor rekening 5–20 angka." };
  if (!accountHolder) return { ok: false, message: "Isi nama pemilik rekening." };
  if (accountHolder.length > 80) return { ok: false, message: "Nama pemilik paling banyak 80 karakter." };
  return { ok: true, value: { bankName, accountNumber, accountHolder } };
}
