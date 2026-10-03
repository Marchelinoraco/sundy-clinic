/** Alasan "Belum ada NIK" saat check-in (spec rekam medis bagian 2, CI2). */
export const NIK_MISSING_REASONS = {
  WARGA_ASING: "Warga negara asing",
  ANAK: "Anak-anak",
  LUPA_KTP: "Lupa membawa KTP",
} as const;

export type NikMissingReasonValue = keyof typeof NIK_MISSING_REASONS;

export function isNikMissingReason(value: unknown): value is NikMissingReasonValue {
  return typeof value === "string" && Object.hasOwn(NIK_MISSING_REASONS, value);
}

export const NIK_FORMAT_ERROR = "NIK harus 16 angka.";

/** Membuang spasi, titik, dan tanda hubung yang ikut tertempel; null bila hasilnya bukan tepat 16 angka. */
export function normalizeNik(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  return /^\d{16}$/.test(cleaned) ? cleaned : null;
}

export type NikBirth = { day: number; month: number; yearTwoDigits: number; gender: "L" | "P" };

/**
 * Angka ke-7 sampai ke-12 NIK: tanggal lahir (ditambah 40 untuk perempuan),
 * bulan, dan dua digit tahun. Null bila tanggal atau bulannya tidak masuk akal.
 */
export function decodeNikBirth(nik: string): NikBirth | null {
  if (!/^\d{16}$/.test(nik)) return null;
  const rawDay = Number(nik.slice(6, 8));
  const month = Number(nik.slice(8, 10));
  const yearTwoDigits = Number(nik.slice(10, 12));
  const gender = rawDay > 40 ? "P" : "L";
  const day = rawDay > 40 ? rawDay - 40 : rawDay;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month, yearTwoDigits, gender };
}

/**
 * Peringatan (tidak menghalangi) bila kode lahir di NIK tidak cocok dengan data
 * pasien. `birthDate` berbentuk "YYYY-MM-DD"; kolom yang kosong tidak dibandingkan.
 */
export function nikMismatchWarning(
  nik: string,
  patient: { birthDate: string | null; gender: "L" | "P" | null },
): string | null {
  const birth = decodeNikBirth(nik);
  if (!birth) return "Bagian tanggal lahir di NIK tidak terbaca — periksa KTP.";

  let dateDiffers = false;
  if (patient.birthDate) {
    const [year, month, day] = patient.birthDate.split("-").map(Number);
    dateDiffers = day !== birth.day || month !== birth.month || year % 100 !== birth.yearTwoDigits;
  }
  const genderDiffers = patient.gender !== null && patient.gender !== birth.gender;

  if (dateDiffers && genderDiffers) return "Tanggal lahir dan jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.";
  if (dateDiffers) return "Tanggal lahir di NIK berbeda dengan data pasien — periksa KTP.";
  if (genderDiffers) return "Jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.";
  return null;
}

/** NIK untuk jejak audit: hanya 4 angka terakhir yang terlihat. */
export function maskNik(nik: string): string {
  return `${"•".repeat(Math.max(0, nik.length - 4))}${nik.slice(-4)}`;
}
