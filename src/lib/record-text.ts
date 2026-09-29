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
  const kept = linesOf(current);
  const seen = new Set(kept.map(normalize));
  for (const line of linesOf(proposal)) {
    const key = normalize(line);
    if (seen.has(key)) continue;
    kept.push(line);
    seen.add(key);
  }
  // "Tidak ada" hanya bermakna bila tidak ada isi lain di catatan itu.
  const meaningful = kept.filter((line) => !NONE_LINES.has(normalize(line)));
  return (meaningful.length > 0 ? meaningful : kept).join("\n");
}
