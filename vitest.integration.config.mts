import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env" });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} belum diisi di .env. Uji integrasi butuh branch "test" di Neon, ` +
        `bukan branch production.`,
    );
  }
  return value;
}

// Uji integrasi mengosongkan tabel berulang kali, jadi ia HARUS menunjuk ke
// branch "test". Pemetaan ini satu-satunya tempat TEST_* menjadi DATABASE_URL;
// tidak ada skrip lain yang boleh melakukannya sendiri.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Seluruh berkas memakai satu basis data dan sebagian mengosongkan tabel.
    // Berjalan paralel membuat satu berkas menghapus data berkas lain.
    fileParallelism: false,
    // Basis datanya di Singapura, jadi setiap kueri menempuh jaringan dan
    // batas bawaan 5 detik terlalu ketat. Neon juga menidurkan basis data yang
    // menganggur; kueri pertama setelah itu perlu waktu membangunkannya.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: required("TEST_DATABASE_URL"),
      DATABASE_URL_UNPOOLED: required("TEST_DATABASE_URL_UNPOOLED"),
      TEST_DATABASE_URL: required("TEST_DATABASE_URL"),
    },
  },
});
