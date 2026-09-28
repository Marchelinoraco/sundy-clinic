import { headers } from "next/headers";
import { UserFacingError } from "@/lib/action-result";
import type { RateLimiter } from "@/lib/rate-limit";

/**
 * IP asli pengunjung. Di produksi Nginx menimpa X-Real-IP dengan alamat dari
 * CF-Connecting-IP (scripts/server/nginx/cloudflare-realip.sh), dan aplikasi
 * hanya menerima koneksi dari Nginx (127.0.0.1:3000) — jadi pengunjung tidak
 * bisa memalsukannya.
 */
export async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-real-ip")?.trim() ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "tanpa-ip"
  );
}

/**
 * Menolak permintaan publik yang melewati batas laju (PRD bagian 10).
 * RATE_LIMIT_DISABLED=1 hanya dipasang di server uji Playwright, yang semua
 * permintaannya datang dari satu alamat.
 */
export async function guardRate(limiter: RateLimiter): Promise<void> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return;
  if (!limiter.take(await clientIp())) {
    throw new UserFacingError("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.");
  }
}
