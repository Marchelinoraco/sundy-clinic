# SunDY Clinic

Sistem klinik SunDY — Nutrition, Slimming & Wellness Clinic, Manado.

Terdiri dari situs publik (katalog layanan & harga, pendaftaran konsultasi dengan
slot jadwal dokter) dan panel admin (manajemen booking, jadwal, dan rekam medis
elektronik pasien).

## Status

Situs publik (Plan 1) dan fondasi panel admin — login, peran staf, jejak audit,
penyuntingan harga (Plan 2) — sudah berjalan. Mesin jadwal, booking, dan rekam
medis pasien belum dibangun.

## Dokumen

- [PRD v1.5](docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md) — kebutuhan produk,
  alur bisnis, model data, arsitektur, dan daftar layanan & harga.
- [Plan 1](docs/superpowers/plans/2026-09-23-plan-1-fondasi-situs-publik.md) — fondasi & situs publik.
- [Plan 2](docs/superpowers/plans/2026-09-24-plan-2-autentikasi-fondasi-admin.md) — autentikasi & fondasi admin.

## Cabang

| Cabang | Alamat | Status |
|---|---|---|
| SunDY Mahakeret | Jl. Garuda No. 10, Mahakeret Barat, Manado | Beroperasi |
| SunDY Citraland | Citraland — Cluster The Manhattan, Manado | Segera hadir |

Jam operasional: Senin–Sabtu, 11.00–19.00 WITA. Minggu dan hari libur nasional tutup.

## Teknologi

Next.js 15 (App Router) + TypeScript · Tailwind CSS v4 + shadcn/ui · Prisma 7 +
PostgreSQL (Neon) · Better Auth · Vitest + Playwright.

## Menjalankan secara lokal

Butuh Node 22.20+ dan satu proyek [Neon](https://console.neon.tech) (paket gratis,
region `ap-southeast-1`) berisi dua basis data/branch: `production` dan `test`.

```bash
cp .env.example .env   # lalu isi connection string dari Neon dan BETTER_AUTH_SECRET
npm install
npm run db:migrate     # terapkan skema ke branch production
npm run db:seed        # muat katalog layanan
npm run dev            # http://localhost:3000
```

Basis data uji disiapkan sekali saja:

```bash
npx dotenv -e .env -v DATABASE_URL=$TEST_DATABASE_URL -v DIRECT_URL=$TEST_DIRECT_URL -- prisma migrate deploy
```

## Panel admin

Panel admin berada di `/admin` dan menuntut login. Tidak ada pendaftaran
mandiri — akun staf dibuat Super Admin dari panel.

Akun Super Admin pertama dibuat dari baris perintah:

```bash
npm run create-admin -- <email> <kata-sandi> "<nama lengkap>"
```

Kata sandi minimal 12 karakter. Sesi berlaku 8 jam.

## Pengujian

```bash
npm test                  # uji unit & komponen
npm run test:integration  # uji terhadap basis data uji di Neon
npm run test:e2e          # uji ujung-ke-ujung Playwright (desktop & ponsel)
```

## Catatan keamanan

Repositori ini memuat kode yang akan menangani **rekam medis pasien**. Jangan pernah
melakukan commit terhadap berkas `.env`, dump basis data, atau data pasien dalam bentuk
apa pun. Lihat `.gitignore`.
