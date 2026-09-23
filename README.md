# SunDY Clinic

Sistem klinik SunDY — Nutrition, Slimming & Wellness Clinic, Manado.

Terdiri dari situs publik (katalog layanan & harga, pendaftaran konsultasi dengan
slot jadwal dokter) dan panel admin (manajemen booking, jadwal, dan rekam medis
elektronik pasien).

## Status

Tahap perancangan. Kode aplikasi belum ditulis.

## Dokumen

- [PRD v1.1](docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md) — kebutuhan produk,
  alur bisnis, model data, arsitektur, dan daftar layanan & harga.

## Cabang

| Cabang | Alamat | Status |
|---|---|---|
| SunDY Mahakeret | Jl. Garuda No. 10, Mahakeret Barat, Manado | Beroperasi |
| SunDY Citraland | Citraland — Cluster The Manhattan, Manado | Segera hadir |

Jam operasional: Senin–Sabtu, 11.00–19.00 WITA. Minggu dan hari libur nasional tutup.

## Rencana teknologi

Next.js 15 (App Router) + TypeScript · Tailwind CSS + shadcn/ui · Prisma + PostgreSQL ·
Auth.js · Vitest + Playwright.

## Catatan keamanan

Repositori ini akan memuat kode yang menangani **rekam medis pasien**. Jangan pernah
melakukan commit terhadap berkas `.env`, dump basis data, atau data pasien dalam bentuk
apa pun. Lihat `.gitignore`.
