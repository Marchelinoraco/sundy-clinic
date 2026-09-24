import { execFileSync } from "node:child_process";
import { e2eDatabaseEnv } from "./test-env";

/**
 * Menyiapkan branch test sebelum uji E2E: data katalog & jadwal dari seed,
 * booking/pasien sisa dibersihkan, dan akun admin uji dipastikan ada.
 *
 * Uji integrasi (npm run test:integration) memakai branch yang sama dan
 * mengosongkan tabelnya — itulah sebabnya persiapan ini dijalankan ulang
 * setiap kali, bukan sekali saja. Jangan jalankan keduanya bersamaan.
 */
export default function globalSetup() {
  const env = { ...process.env, ...e2eDatabaseEnv() };
  const run = (script: string) =>
    execFileSync("npx", ["tsx", script], { env, stdio: ["ignore", "ignore", "inherit"] });

  run("prisma/seed.ts");
  run("tests/e2e/prepare-db.mts");
}
