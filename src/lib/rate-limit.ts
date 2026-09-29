export type RateLimiter = {
  /** Mencatat satu percobaan; false bila batas sudah tercapai. */
  take(key: string, now?: number): boolean;
  /** true bila satu percobaan lagi masih boleh — tanpa mencatat apa pun. */
  peek(key: string, now?: number): boolean;
  /** Mengembalikan percobaan terakhir yang dicatat untuk kunci ini (mis. ternyata berhasil). */
  undo(key: string): void;
};

/**
 * Pembatas laju jendela geser di memori proses.
 *
 * Cukup karena aplikasi berjalan sebagai satu proses PM2
 * (scripts/server/ecosystem.config.cjs). Bila kelak dijalankan sebagai
 * cluster, tiap proses punya hitungannya sendiri dan penghitung harus pindah
 * ke basis data. Hitungan hilang saat rilis/restart — dapat diterima karena
 * jendelanya pendek (≤ 1 jam).
 */
export function createRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  // Membuang kunci yang semua catatannya sudah lewat, agar peta tidak tumbuh
  // tanpa batas dari IP yang hanya mampir sekali.
  function sweep(now: number) {
    if (now - lastSweep < options.windowMs) return;
    lastSweep = now;
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= options.windowMs)) hits.delete(key);
    }
  }

  return {
    peek(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((time) => now - time < options.windowMs);
      return recent.length < options.limit;
    },
    take(key, now = Date.now()) {
      sweep(now);
      const recent = (hits.get(key) ?? []).filter((time) => now - time < options.windowMs);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    undo(key) {
      const times = hits.get(key);
      if (!times?.length) return;
      times.pop();
      if (!times.length) hits.delete(key);
    },
  };
}
