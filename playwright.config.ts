import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT, e2eDatabaseEnv } from "./tests/e2e/test-env";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  // Server pengujian menjalankan `next dev`, yang mengkompilasi setiap rute
  // saat pertama diakses, dan rute admin juga menempuh Better Auth ke basis
  // data. Dengan paralelisme bawaan Playwright (mendekati jumlah inti
  // CPU), banyak rute yang belum pernah dikompilasi diakses bersamaan dan
  // navigasi melewati batas waktu secara acak — bergiliran uji mana yang
  // gagal setiap dijalankan, bukan bug pada halamannya. Dibatasi ke angka
  // yang terbukti stabil di lingkungan ini.
  workers: 3,
  reporter: "list",
  // Uji login menembus Better Auth ke basis data, bukan hanya navigasi lokal.
  // Batas waktu bawaan (5 detik) sesekali terlampaui saat
  // worker lain sedang membebani server yang sama.
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Mayoritas pengunjung datang dari tautan Instagram di HP, jadi alur ini
    // harus diuji di lebar ponsel, bukan hanya di desktop.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Server uji terpisah dari `npm run dev` (port 3000, sundy_dev): port sendiri
  // dan DATABASE_URL yang ditimpa ke basis data uji. Tidak pernah memakai ulang
  // server yang sudah berjalan — server lain di port ini bisa saja terhubung ke
  // basis data lain, dan uji ini menulis booking sungguhan.
  webServer: {
    command: `npx next dev --turbopack -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...e2eDatabaseEnv(),
      BETTER_AUTH_URL: E2E_BASE_URL,
      NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
      // Semua permintaan uji datang dari satu alamat; tanpa ini pembatas laju
      // situs publik menolak uji kedua dan seterusnya.
      RATE_LIMIT_DISABLED: "1",
      // Berkas hasil BIA dari uji ditulis di sini, bukan ke folder server.
      PATIENT_FILES_DIR: `${process.cwd()}/.playwright/bia-files`,
    },
  },
});
