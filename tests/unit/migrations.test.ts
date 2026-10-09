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

describe("migrasi penyerahan obat", () => {
  const sql = readFileSync("prisma/migrations/20261007200000_penyerahan_obat/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga status, baris, dan panjang catatan di basis data", () => {
    for (const name of ["dispensing_status_fields", "dispensing_line_values", "encounter_pharmacy_note_length"]) {
      expect(sql).toContain(name);
    }
  });
});

describe("migrasi pengeluaran", () => {
  const sql = readFileSync("prisma/migrations/20261007220000_pengeluaran/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga nominal, pembatalan, templat, dan nama kategori di basis data", () => {
    for (const name of ["expense_amount_positive", "expense_void_fields", "recurring_expense_values", "expense_category_name_lower"]) {
      expect(sql).toContain(name);
    }
  });

  it("mengisi tujuh kategori bawaan", () => {
    expect(sql).toMatch(/INSERT INTO "ExpenseCategory"/);
    for (const name of ["Gaji", "Sewa", "Listrik dan air", "Internet dan telepon", "Perlengkapan", "Pemasaran", "Lain-lain"]) {
      expect(sql).toContain(`'${name}'`);
    }
  });
});

describe("migrasi indeks laporan", () => {
  const sql = readFileSync("prisma/migrations/20261007230000_indeks_laporan/migration.sql", "utf8");

  it("hanya menambah indeks untuk saringan laporan", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    for (const name of ["Invoice_status_finalizedAt_idx", "InvoicePayment_paidAt_idx", "SupplierPayment_paidAt_idx"]) {
      expect(sql).toContain(name);
    }
  });
});

describe("migrasi hasil BIA", () => {
  const sql = readFileSync("prisma/migrations/20261009120000_hasil_bia/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga rentang angka, pembatalan, ukuran berkas, satu pengukuran aktif, dan kunci setelah final", () => {
    for (const name of ["bia_body_fat_range", "bia_muscle_range", "bia_visceral_range", "bia_bmr_range", "bia_metabolic_age_range", "bia_water_range", "bia_bone_range", "bia_void_fields", "bia_file_void_fields", "bia_file_size"]) {
      expect(sql).toContain(name);
    }
    expect(sql).toMatch(/CREATE UNIQUE INDEX "BiaMeasurement_one_active_per_appointment"[\s\S]*WHERE "voidedAt" IS NULL/);
    expect(sql).toMatch(/CREATE TRIGGER bia_numbers_locked/);
  });
});
