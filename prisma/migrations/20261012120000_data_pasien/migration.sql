-- Data pasien lengkap saat resepsionis mendaftarkan pasien di panel.
-- Spec: docs/superpowers/specs/2026-10-12-pendaftaran-pasien-panel-design.md bagian 3.
--
-- Hanya menambah: deploy.sh menjalankan migrasi sebelum build, dan rilis lama tetap
-- melayani selama build. Semua kolom baru boleh kosong (pasien lama dan pasien dari
-- pendaftaran online tidak punya data ini).

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('BELUM_MENIKAH', 'MENIKAH', 'CERAI_HIDUP', 'CERAI_MATI');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "maritalStatus" "MaritalStatus";

-- Nama dan nomor kontak darurat: terisi bersamaan atau kosong bersamaan.
ALTER TABLE "Patient" ADD CONSTRAINT "patient_emergency_pair" CHECK (("emergencyContactName" IS NULL) = ("emergencyContactPhone" IS NULL));

-- Email: bentuk dasar nama@domain.tld tanpa spasi.
ALTER TABLE "Patient" ADD CONSTRAINT "patient_email_format" CHECK ("email" IS NULL OR "email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
