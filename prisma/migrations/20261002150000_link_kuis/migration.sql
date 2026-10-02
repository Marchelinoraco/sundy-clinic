-- UI panel admin bagian C3: link isi kuis untuk booking yang dicatat admin.
-- Kode link dihitung dari kunci rahasia + booking + versi, jadi tidak disimpan.
-- Spec: docs/superpowers/specs/2026-10-02-link-kuis-design.md bagian 6.
--
-- Hanya menambah: deploy.sh menjalankan migrasi sebelum build, dan rilis lama
-- tetap melayani selama build. Kolom token lama (linkTokenHash, linkExpiresAt)
-- masih dikenal rilis lama, jadi baru dihapus di rilis berikutnya.

-- AlterEnum
ALTER TYPE "AppointmentMessageKind" ADD VALUE IF NOT EXISTS 'LINK_KUIS';

-- AlterTable
ALTER TABLE "Intake" ADD COLUMN     "linkVersion" INTEGER NOT NULL DEFAULT 0;
