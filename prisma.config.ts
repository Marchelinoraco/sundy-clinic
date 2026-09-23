import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Perintah CLI memakai koneksi LANGSUNG (tanpa "-pooler"). Connection pooler
// Neon tidak menerima perintah DDL yang dipakai migrasi. Runtime aplikasi
// memakai koneksi pooled lewat adapter di src/lib/db.ts — sengaja berbeda.
//
// PRISMA_TARGET=test mengarahkan perintah ke branch "test" di Neon.
// Dipakai oleh `npm run db:migrate:test`, agar migrasi uji tidak pernah
// menyentuh branch production hanya karena lupa mengganti variabel.
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
