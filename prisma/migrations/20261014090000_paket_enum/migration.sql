-- Paket treatment (spec docs/superpowers/specs/2026-10-13-paket-treatment-deposit-design.md bagian 3).
-- Nilai enum baru ditambah di migrasi sendiri: PostgreSQL tidak mengizinkan nilai baru dipakai di transaksi yang menambahkannya.
ALTER TYPE "InvoiceLineKind" ADD VALUE 'PAKET';
