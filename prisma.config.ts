import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Perintah CLI (migrate, seed) memakai DATABASE_URL_UNPOOLED. Di VPS nilainya
// sama dengan DATABASE_URL (PostgreSQL lokal). Untuk Neon (branch "test") ini
// koneksi LANGSUNG tanpa "-pooler", karena pooler Neon menolak DDL migrasi.
//
// PRISMA_TARGET=test mengarahkan perintah ke branch "test" di Neon.
// Dipakai oleh `npm run db:migrate:test`, agar migrasi uji tidak pernah
// menyentuh database lain hanya karena lupa mengganti variabel.
const isTestTarget = process.env.PRISMA_TARGET === "test";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env(isTestTarget ? "TEST_DATABASE_URL_UNPOOLED" : "DATABASE_URL_UNPOOLED"),
  },
});
