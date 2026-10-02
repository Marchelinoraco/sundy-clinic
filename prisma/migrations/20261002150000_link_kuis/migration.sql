-- UI panel admin bagian C3: link isi kuis untuk booking yang dicatat admin.
-- Kode link dihitung dari kunci rahasia + booking + versi, jadi tidak disimpan;
-- kolom token lama (desain awal, belum pernah dipakai) dihapus.
-- Spec: docs/superpowers/specs/2026-10-02-link-kuis-design.md bagian 6.

-- AlterEnum
ALTER TYPE "AppointmentMessageKind" ADD VALUE 'LINK_KUIS';

-- DropIndex
DROP INDEX "Intake_linkTokenHash_key";

-- AlterTable
ALTER TABLE "Intake" DROP COLUMN "linkExpiresAt",
DROP COLUMN "linkTokenHash",
ADD COLUMN     "linkVersion" INTEGER NOT NULL DEFAULT 0;
