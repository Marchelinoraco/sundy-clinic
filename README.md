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

Skema basis data uji diperbarui setiap ada migrasi baru:

```bash
npm run db:migrate:test   # prisma migrate deploy ke branch test
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

Uji integrasi dan uji E2E sama-sama memakai branch `test` dan mengosongkan tabelnya —
jangan jalankan keduanya bersamaan. Uji E2E menjalankan server sendiri di port 3100
yang diarahkan ke branch `test`, menjalankan seed, dan membuat akun admin uji; ia
menolak berjalan bila `TEST_DATABASE_URL` menunjuk basis data production.

## Deploy ke Vercel

Proyek Vercel dihubungkan ke repositori ini dan membangun production dari `main`.
Fungsi server berjalan di Singapura (`sin1`, lihat `vercel.json`) agar dekat dengan
basis data Neon di `ap-southeast-1`.

Environment variables untuk lingkungan **Production**:

| Nama | Isi |
|---|---|
| `DATABASE_URL` | Connection string *pooled* branch `production` |
| `DATABASE_URL_UNPOOLED` | Connection string langsung branch `production` — dibaca `prisma generate` saat build |
| `BETTER_AUTH_SECRET` | Rahasia acak: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Alamat situs, misal `https://domain-klinik.com` |
| `NEXT_PUBLIC_SITE_URL` | Alamat yang sama — dipakai sitemap dan robots.txt |

Untuk lingkungan **Preview**, isi `DATABASE_URL`/`DATABASE_URL_UNPOOLED` dengan
connection string branch `test`, bukan production — preview dibangun dari setiap
branch dan tidak boleh menulis ke data pasien sungguhan. Variabel `TEST_*` tidak
dipakai di Vercel.

Migrasi **tidak** dijalankan saat build. Terapkan dari lokal sebelum perubahan skema
digabung ke `main`:

```bash
npx prisma migrate deploy   # ke branch production (DATABASE_URL_UNPOOLED di .env)
```

## Catatan keamanan

Repositori ini memuat kode yang akan menangani **rekam medis pasien**. Jangan pernah
melakukan commit terhadap berkas `.env`, dump basis data, atau data pasien dalam bentuk
apa pun. Lihat `.gitignore`.
