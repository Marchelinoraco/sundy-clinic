import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// scripts/server/deploy.sh menjalankan migrasi SEBELUM build, dan rilis lama tetap
// melayani selama build berjalan. Kode lama membuat isian tanpa `select`, sehingga
// Prisma meminta kembali semua kolom yang ia kenal: kolom yang dihapus membuat
// pendaftaran /daftar gagal sampai rilis baru aktif — dan lagi bila rilis dikembalikan.
describe("migrasi link kuis (C3)", () => {
  const sql = readFileSync("prisma/migrations/20261002150000_link_kuis/migration.sql", "utf8");

  it("hanya menambah, tidak menghapus kolom atau indeks yang masih dikenal rilis sebelumnya", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menambah versi link dan jenis pesan LINK_KUIS", () => {
    expect(sql).toMatch(/ADD COLUMN\s+"linkVersion" INTEGER NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/ADD VALUE IF NOT EXISTS 'LINK_KUIS'/);
  });
});

describe("migrasi check-in klinik (rekam medis bagian 2)", () => {
  const sql = readFileSync("prisma/migrations/20261003120000_check_in_klinik/migration.sql", "utf8");

  it("hanya menambah, tanpa menghapus apa pun yang dikenal rilis sebelumnya", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga NIK dan pasien rangkap di basis data, serta mengunci food recall saat final", () => {
    expect(sql).toMatch(/patient_nik_format/);
    expect(sql).toMatch(/patient_nik_or_reason/);
    expect(sql).toMatch(/patient_not_merged_into_self/);
    expect(sql).toMatch(/CREATE TRIGGER food_recall_locked/);
    expect(sql).toMatch(/CREATE TRIGGER food_recall_no_truncate/);
  });
});
