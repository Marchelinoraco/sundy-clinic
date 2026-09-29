/** Jawaban "tidak ada" yang tidak perlu ditambahkan ke catatan yang sudah berisi. */
const NONE_LINES = new Set(["tidak ada", "tidak ada riwayat penyakit"]);

function normalize(line: string): string {
  return line.trim().replace(/\s+/g, " ").toLowerCase();
}

function linesOf(text: string | null): string[] {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Isi awal kolom yang disunting dokter: catatan pasien saat ini, ditambah
 * baris usulan yang belum ada di dalamnya. Dokter tetap memutuskan hasil
 * akhirnya (spec 6.4). Fungsi ini hanya mencegah catatan lama tertimpa tanpa
 * sengaja oleh usulan dari satu isian.
 */
export function mergeRecordText(current: string | null, proposal: string | null): string {
  const isNone = (line: string) => NONE_LINES.has(normalize(line));
  const currentLines = linesOf(current);
  const proposalLines = linesOf(proposal);
  const currentHasContent = currentLines.some((line) => !isNone(line));
  const proposalHasContent = proposalLines.some((line) => !isNone(line));

  // "Tidak ada" lama tidak berlaku lagi begitu isian membawa isi sungguhan.
  const kept = currentLines.filter((line) => !(isNone(line) && proposalHasContent));
  const seen = new Set(kept.map(normalize));
  for (const line of proposalLines) {
    const key = normalize(line);
    if (seen.has(key)) continue;
    // "Tidak ada" dari isian tidak ditambahkan ke catatan yang sudah berisi.
    if (isNone(line) && currentHasContent) continue;
    kept.push(line);
    seen.add(key);
  }
  return kept.join("\n");
}
