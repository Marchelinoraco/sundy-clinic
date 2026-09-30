/**
 * Membuka catatan dan mengubah draf dicatat paling banyak sekali per staf per
 * catatan dalam jendela ini (spec R12). Memuat ulang halaman atau simpan
 * otomatis tiap beberapa detik tidak membanjiri jejak audit.
 */
export const AUDIT_REPEAT_WINDOW_MS = 30 * 60 * 1000;

export function shouldRecordRepeat(last: Date | null, now: Date, windowMs = AUDIT_REPEAT_WINDOW_MS): boolean {
  return last === null || now.getTime() - last.getTime() >= windowMs;
}
