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
 * Kunci pembatas laju untuk sebuah alamat. IPv4 apa adanya; IPv6 dikelompokkan
 * per /64 (satu pelanggan biasanya mendapat seluruh /64), supaya penyerang
 * tidak bisa berganti-ganti alamat dalam blok miliknya untuk lolos dari batas.
 */
export function rateLimitKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];

  const [head, tail] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail === undefined ? [] : tail ? tail.split(":") : [];
  const zeros = tail === undefined ? 0 : Math.max(0, 8 - headGroups.length - tailGroups.length);
  const groups = [...headGroups, ...Array<string>(zeros).fill("0"), ...tailGroups];
  if (groups.length !== 8) return ip;
  return `${groups
    .slice(0, 4)
    .map((group) => parseInt(group || "0", 16).toString(16))
    .join(":")}::/64`;
}

/**
 * Menolak permintaan publik yang melewati batas laju (PRD bagian 10).
 * RATE_LIMIT_DISABLED=1 hanya dipasang di server uji Playwright, yang semua
 * permintaannya datang dari satu alamat.
 */
export async function guardRate(limiter: RateLimiter): Promise<void> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return;
  if (!limiter.take(rateLimitKey(await clientIp()))) {
    throw new UserFacingError("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.");
  }
}
