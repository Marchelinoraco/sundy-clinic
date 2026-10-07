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

describe("migrasi konsultasi online", () => {
  const sql = readFileSync("prisma/migrations/20261006120000_konsultasi_online/migration.sql", "utf8");

  it("hanya menghapus penjaga anti-bentrok lama, lalu membuatnya lagi di berkas yang sama", () => {
    const drops = sql.match(/\bDROP\b[^;]*;/gi) ?? [];
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatch(/DROP CONSTRAINT appointment_no_overlap/);
    expect(sql).toMatch(/ADD CONSTRAINT appointment_no_overlap[\s\S]*"channel" = 'KLINIK'/);
  });

  it("menjaga kanal online dan rentang waktu luang di basis data", () => {
    expect(sql).toMatch(/appointment_online_consultation/);
    expect(sql).toMatch(/contact_window_range/);
  });

  it("membuat layanan Konsultasi Online dalam keadaan nonaktif", () => {
    expect(sql).toMatch(/'konsultasi-online'[\s\S]*false, false, 99/);
  });
});

describe("migrasi stok dan hutang", () => {
  const sql = readFileSync("prisma/migrations/20261007120000_stok_hutang/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga sisa batch, nilai faktur, alasan penyesuaian, dan pembayaran di basis data", () => {
    for (const name of [
      "stock_batch_remaining_nonnegative",
      "purchase_invoice_dates",
      "purchase_line_values",
      "stock_movement_reason",
      "supplier_payment_amount_positive",
    ]) {
      expect(sql).toContain(name);
    }
  });

  it("menambah peran Apoteker dan Admin Keuangan", () => {
    expect(sql).toMatch(/ADD VALUE 'APOTEKER'/);
    expect(sql).toMatch(/ADD VALUE 'ADMIN_KEUANGAN'/);
  });
});

describe("migrasi tagihan", () => {
  const sql = readFileSync("prisma/migrations/20261007180000_tagihan/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga status tagihan, diskon, baris, dan pembayaran di basis data", () => {
    for (const name of [
      "invoice_status_fields",
      "invoice_discount_values",
      "invoice_one_active_per_appointment",
      "invoice_line_values",
      "invoice_payment_amount_positive",
    ]) {
      expect(sql).toContain(name);
    }
  });

  it("menambah jenis stok KELUAR", () => {
    expect(sql).toMatch(/ADD VALUE 'KELUAR'/);
  });
});
