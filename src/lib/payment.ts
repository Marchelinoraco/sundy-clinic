export type BankAccount = {
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
};

export type BookingSourceValue = "SITUS" | "WHATSAPP" | "TELEPON" | "WALK_IN";

/** "BCA 1234567890 a.n. SunDY Clinic", atau null bila rekening belum lengkap di pengaturan. */
export function formatBankAccount(account: BankAccount): string | null {
  if (!account.bankName || !account.bankAccountNumber || !account.bankAccountHolder) return null;
  return `${account.bankName} ${account.bankAccountNumber} a.n. ${account.bankAccountHolder}`;
}

/** Biaya booking dikenakan pada semua sumber kecuali walk-in (spec K15, K18). */
export function bookingFeeFor(source: BookingSourceValue, fee: number): number | null {
  return source === "WALK_IN" ? null : fee;
}

/** Aturan biaya booking yang ditampilkan ke pasien (spec K15, K16). */
export const BOOKING_FEE_TERMS =
  "Biaya booking mengunci jadwal Anda. Biaya ini terpisah dari biaya layanan dan tidak dikembalikan, tetapi tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelum jadwal.";
