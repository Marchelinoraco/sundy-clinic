import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Server pengujian menjalankan `next dev`, yang mengkompilasi setiap rute
  // saat pertama diakses. Rute admin juga menempuh Better Auth dan Neon lewat
  // jaringan. Dengan paralelisme bawaan Playwright (mendekati jumlah inti
  // CPU), banyak rute yang belum pernah dikompilasi diakses bersamaan dan
  // navigasi melewati batas waktu secara acak — bergiliran uji mana yang
  // gagal setiap dijalankan, bukan bug pada halamannya. Dibatasi ke angka
  // yang terbukti stabil di lingkungan ini.
  workers: 3,
  reporter: "list",
  // Uji login menembus Better Auth ke Neon lewat jaringan, bukan hanya
  // navigasi lokal. Batas waktu bawaan (5 detik) sesekali terlampaui saat
  // worker lain sedang membebani server yang sama.
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Mayoritas pengunjung datang dari tautan Instagram di HP, jadi alur ini
    // harus diuji di lebar ponsel, bukan hanya di desktop.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
