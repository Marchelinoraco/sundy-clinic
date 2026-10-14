-- Stok meja (spec docs/superpowers/specs/2026-10-19-stok-meja-design.md bagian 2.2).
-- Nilai enum baru ditambah di migrasi sendiri: PostgreSQL tidak mengizinkan nilai baru dipakai di transaksi yang menambahkannya.
ALTER TYPE "StockMovementKind" ADD VALUE 'PINDAH';
