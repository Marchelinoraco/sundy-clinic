-- Paket lama dari Kluto (spec docs/superpowers/specs/2026-11-11-paket-lama-kluto-design.md bagian 3).
-- Nilai enum baru ditambah di migrasi sendiri: PostgreSQL tidak mengizinkan nilai baru dipakai di transaksi yang menambahkannya.
CREATE TYPE "PatientPackageSource" AS ENUM ('TAGIHAN', 'KLUTO');
ALTER TYPE "PackageEntryKind" ADD VALUE 'PAKAI_KLUTO';
ALTER TYPE "PackageEntryKind" ADD VALUE 'KOREKSI_KLUTO';
