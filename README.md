# SunDY Clinic

Sistem klinik SunDY — Nutrition, Slimming & Wellness Clinic, Manado.

Terdiri dari situs publik (katalog layanan & harga, pendaftaran konsultasi dengan
slot jadwal dokter) dan panel admin (manajemen booking, jadwal, dan rekam medis
elektronik pasien).

## Status

Sudah berjalan: situs publik (Plan 1); fondasi panel admin — login, peran staf,
jejak audit, penyuntingan harga (Plan 2); serta jadwal tenaga, data pasien, dan
booking yang dicatat admin dengan jaminan anti-bentrok di basis data (Plan 3a).

Belum dibangun: pendaftaran mandiri pasien lewat situs (Plan 3b) dan rekam medis
elektronik (Plan 4).

## Dokumen

- [PRD v1.5](docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md) — kebutuhan produk,
  alur bisnis, model data, arsitektur, dan daftar layanan & harga.
- [Plan 1](docs/superpowers/plans/2026-09-23-plan-1-fondasi-situs-publik.md) — fondasi & situs publik.
- [Plan 2](docs/superpowers/plans/2026-09-24-plan-2-autentikasi-fondasi-admin.md) — autentikasi & fondasi admin.
- [Plan 3a](docs/superpowers/plans/2026-09-24-plan-3a-jadwal-pasien-booking-admin.md) — jadwal, pasien & booking admin.

## Cabang

| Cabang | Alamat | Status |
|---|---|---|
| SunDY Mahakeret | Jl. Garuda No. 10, Mahakeret Barat, Manado | Beroperasi |
| SunDY Citraland | Citraland — Cluster The Manhattan, Manado | Segera hadir |

Jam operasional: Senin–Sabtu, 11.00–19.00 WITA. Minggu dan hari libur nasional tutup.

## Teknologi

Next.js 15 (App Router) + TypeScript · Tailwind CSS v4 + shadcn/ui · Prisma 7 +
PostgreSQL 18 · Better Auth · Vitest + Playwright.

## Menjalankan secara lokal

Butuh Node 22.20+ dan PostgreSQL 18 di laptop, dengan dua basis data: `sundy_dev` (pengembangan)
dan `sundy_test` (uji — tabelnya dikosongkan berulang kali). Di macOS:

```bash
brew install postgresql@18 && brew services start postgresql@18
psql -h localhost -d postgres -c "CREATE ROLE sundy LOGIN"
createdb -h localhost -O sundy sundy_dev
createdb -h localhost -O sundy sundy_test

cp .env.example .env   # URL bawaannya sudah menunjuk kedua basis data di atas; isi BETTER_AUTH_SECRET
npm install
npm run db:migrate     # terapkan skema ke sundy_dev
npm run db:seed        # muat katalog layanan
npm run dev            # http://localhost:3000
```

Skema basis data uji diperbarui setiap ada migrasi baru:

```bash
npm run db:migrate:test   # prisma migrate deploy ke sundy_test
```

## Panel admin

Panel admin berada di `/admin` dan menuntut login. Tidak ada pendaftaran
mandiri — akun staf dibuat Super Admin dari panel.

Akun Super Admin pertama dibuat dari baris perintah:

```bash
npm run create-admin -- <email> <kata-sandi> "<nama lengkap>"
```

Kata sandi minimal 12 karakter. Sesi berlaku 8 jam.

Lupa kata sandi? Ganti dari baris perintah (semua sesi login akun itu ikut dihapus):

```bash
npm run reset-password -- <email> "<kata-sandi-baru>"
```

## Pengujian

```bash
npm test                  # uji unit & komponen
npm run test:integration  # uji terhadap basis data uji (sundy_test)
npm run test:e2e          # uji ujung-ke-ujung Playwright (desktop & ponsel)
```

Uji integrasi dan uji E2E sama-sama memakai `sundy_test` dan mengosongkan tabelnya —
jangan jalankan keduanya bersamaan. Uji E2E menjalankan server sendiri di port 3100
yang diarahkan ke `sundy_test`, menjalankan seed, dan membuat akun admin uji; ia
menolak berjalan bila `TEST_DATABASE_URL` menunjuk basis data yang sama dengan `DATABASE_URL`.

```bash
npm run test:server       # uji skrip server (deploy.sh, backup.sh) dengan perintah tiruan
```

## Produksi

Situs produksi berjalan di VPS sendiri (IDCloudHost Jakarta) di **https://sundyclinic.com**, di balik
Cloudflare. Semua hal operasional — rilis, kembali ke rilis sebelumnya, mode pemeliharaan, backup
terenkripsi, uji pemulihan, dan membangun ulang server — ada di runbook
[`docs/operasional/server-sundy.md`](docs/operasional/server-sundy.md).

Rilis dilakukan dari server dengan `scripts/server/deploy.sh`, yang juga menjalankan
`prisma migrate deploy` sebelum rilis baru aktif. Migrasi yang mengubah skema harus tetap cocok dengan
kode rilis sebelumnya, agar kembali ke rilis sebelumnya tetap aman.

## Catatan keamanan

Repositori ini memuat kode yang akan menangani **rekam medis pasien**. Jangan pernah
melakukan commit terhadap berkas `.env`, dump basis data, atau data pasien dalam bentuk
apa pun. Lihat `.gitignore`.
