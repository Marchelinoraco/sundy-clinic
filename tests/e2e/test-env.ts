import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/**
 * Koneksi branch "test" Neon untuk server uji ujung-ke-ujung.
 *
 * Uji E2E membuat pasien dan booking sungguhan, dan booking tidak pernah
 * dihapus lewat aplikasi (PRD F9). Menjalankannya ke branch production akan
 * menanam data palsu di basis data yang menyimpan rekam medis pasien — jadi
 * fungsi ini menolak keras bila alamat test sama dengan production.
 */
export function e2eDatabaseEnv(): Record<string, string> {
  const fileEnv = existsSync(".env") ? parse(readFileSync(".env")) : {};
  const read = (key: string) => process.env[key] ?? fileEnv[key];

  const testUrl = read("TEST_DATABASE_URL");
  const testUnpooled = read("TEST_DATABASE_URL_UNPOOLED");
  if (!testUrl || !testUnpooled) {
    throw new Error(
      "TEST_DATABASE_URL dan TEST_DATABASE_URL_UNPOOLED wajib diisi untuk uji E2E (branch test Neon).",
    );
  }

  const productionUrl = read("DATABASE_URL");
  const hostOf = (url: string) => new URL(url).host.replace("-pooler", "");
  if (productionUrl && hostOf(productionUrl) === hostOf(testUrl)) {
    throw new Error(
      "TEST_DATABASE_URL menunjuk ke basis data yang sama dengan DATABASE_URL. Uji E2E dihentikan agar data uji tidak masuk ke production.",
    );
  }

  return { DATABASE_URL: testUrl, DATABASE_URL_UNPOOLED: testUnpooled };
}
