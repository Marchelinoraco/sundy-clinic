// Aturan pakai obat (spec aturan pakai AP1–AP6): frekuensi pilihan atau teks sendiri, ditambah waktu. Yang disimpan tetap
// satu teks, jadi tagihan, etiket, dan catatan membacanya tanpa perubahan. Murni: dipakai formulir dan server.

export const USAGE_FREQUENCIES = ["1xSehari", "1xSeminggu", "1-2xSehari", "2-3xSehari", "3xSehari"] as const;
export type UsageFrequency = (typeof USAGE_FREQUENCIES)[number];
/** Pilihan "Lainnya": frekuensi diketik sendiri. */
export const USAGE_OTHER = "LAINNYA";
export const USAGE_TIMING_DEFAULT = "SEBELUM MAKAN";

export type UsageParts = { frequency: "" | UsageFrequency | typeof USAGE_OTHER; custom: string; timing: string };

/** Baris obat baru: frekuensi belum dipilih, waktu SEBELUM MAKAN (AP2). */
export function newUsageParts(): UsageParts {
  return { frequency: "", custom: "", timing: USAGE_TIMING_DEFAULT };
}

/** "3xSehari SEBELUM MAKAN"; tanpa waktu = frekuensinya saja (AP4). */
export function composeUsage(parts: UsageParts): string {
  const frequency = parts.frequency === USAGE_OTHER ? parts.custom.trim() : parts.frequency;
  return [frequency, parts.timing.trim()].filter(Boolean).join(" ");
}

/**
 * Teks tersimpan → isian (AP5): diawali salah satu frekuensi (diikuti spasi atau akhir teks) → frekuensi itu dan sisanya
 * waktu; selain itu → Lainnya berisi seluruh teks. composeUsage(parseUsage(teks)) selalu sama dengan teksnya.
 */
export function parseUsage(usage: string): UsageParts {
  const text = usage.trim();
  const frequency = USAGE_FREQUENCIES.find((option) => text === option || text.startsWith(`${option} `));
  if (frequency) return { frequency, custom: "", timing: text.slice(frequency.length).trim() };
  return { frequency: USAGE_OTHER, custom: text, timing: "" };
}

/** Pesan untuk isian yang belum bisa disimpan (AP6), atau null. */
export function usageProblem(parts: UsageParts, max: number): string | null {
  if (parts.frequency !== USAGE_OTHER && !USAGE_FREQUENCIES.includes(parts.frequency as UsageFrequency)) return "Pilih aturan pakai obat.";
  if (parts.frequency === USAGE_OTHER && !parts.custom.trim()) return "Isi aturan pakai obat.";
  if (composeUsage(parts).length > max) return `Aturan pakai terlalu panjang (maks. ${max} karakter).`;
  return null;
}

/** Belum selesai diisi: frekuensi belum dipilih, atau Lainnya masih kosong. */
export function isIncompleteUsage(parts: UsageParts): boolean {
  return parts.frequency === "" || (parts.frequency === USAGE_OTHER && !parts.custom.trim());
}
