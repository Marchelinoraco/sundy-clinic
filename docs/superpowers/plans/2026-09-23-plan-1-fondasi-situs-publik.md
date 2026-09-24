# Plan 1 — Fondasi & Situs Publik SunDY Clinic

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun fondasi proyek (Next.js + PostgreSQL + Prisma + pengujian) dan situs publik SunDY Clinic yang menampilkan katalog layanan, paket slimming, produk, dan dua lokasi cabang — siap tayang tanpa panel admin.

**Architecture:** Aplikasi Next.js 15 App Router tunggal dengan rendering server. Data katalog dibaca dari PostgreSQL lewat Prisma melalui satu lapisan query di `src/server/catalog.ts`; komponen halaman tidak pernah memanggil Prisma langsung. Seluruh konstanta klinik (nomor WhatsApp, Instagram, nama cabang) terpusat di `src/lib/clinic.ts` agar tidak tersebar sebagai teks keras di banyak berkas. Situs ini hanya membaca data — tidak ada tulis basis data sama sekali di Plan 1.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Prisma 6 · PostgreSQL terkelola di **Neon** (paket gratis) · Vitest + Testing Library · Playwright · npm · deploy ke **Vercel**

**Spec:** `docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md` (PRD v1.1)

**Plan berikutnya (di luar lingkup dokumen ini):** Plan 2 autentikasi & panel admin · Plan 3 mesin jadwal & booking · Plan 4 rekam medis, grafik progres & pengingat kontrol mingguan.

## Status Eksekusi

Terakhir diperbarui 23 September 2026. Dikerjakan di branch `plan-1-fondasi-situs-publik`.

| Task | Status | Catatan |
|---|---|---|
| 1. Inisialisasi proyek | ✅ Selesai | Next 15.5.26, React 19, Tailwind v4, Vitest 4 |
| 2. Basis data Neon | ⛔ **Terblokir** | Menunggu connection string dari pemilik |
| 3. Skema katalog | ⛔ Terblokir | Menunggu Task 2 |
| 4. Data awal katalog | ⛔ Terblokir | Menunggu Task 2 |
| 5. Utilitas format & WhatsApp | ✅ Selesai | Dikerjakan lebih awal, tidak butuh basis data |
| 6. Lapisan query katalog | ⛔ Terblokir | Menunggu Task 2 |
| 7. Tema & tata letak | ✅ Selesai | Logo masih wordmark teks di `src/components/layout/logo.tsx` |
| 8. Komponen katalog | ✅ Selesai | Dikerjakan lebih awal setelah `PackageCard` dilepas dari tipe Prisma |
| 9–16 | ⛔ Terblokir | Menunggu Task 2 |

**Capaian saat ini:** 29 uji lulus, typecheck dan lint bersih, build produksi berhasil.

**Penyimpangan dari rencana semula, semuanya disengaja:**

1. Konfigurasi Vitest memakai `vitest.config.mts` dan `resolve.tsconfigPaths` bawaan Vite; paket `vite-tsconfig-paths` dihapus karena Vite melaporkannya sudah tidak diperlukan.
2. Wordmark dipisah ke komponen `Logo` sendiri karena berkas logo resmi belum ada. Mengganti ke gambar nanti cukup menyentuh satu berkas.
3. `PackageCard` memakai tipe prop struktural, bukan `PackageWithItems` dari lapisan query, agar seluruh komponen katalog tidak bergantung pada Prisma.
4. Task 5, 7, dan 8 dikerjakan mendahului Task 2–4 karena tidak menyentuh basis data. Tidak ada task lain yang bergantung padanya, jadi urutannya tetap sah.

**Catatan keamanan:** `npm audit` melaporkan kerentanan PostCSS yang dibawa Next 15. Seluruh advisory-nya menyangkut pemrosesan CSS dari sumber yang tidak tepercaya pada saat build — di proyek ini CSS hanya ditulis sendiri dan PostCSS tidak pernah menyentuh masukan pengguna, jadi tidak ada paparan nyata. Perbaikannya menuntut lompatan ke Next 16; ditunda agar tidak mengubah fondasi di tengah pengerjaan plan.

---

## Global Constraints

- **Bahasa kode:** seluruh pengenal, nama berkas, nama model, dan nama fungsi memakai **bahasa Inggris**. Bahasa Indonesia hanya untuk **teks yang dilihat pengguna** dan **segmen URL**. Contoh benar: berkas `src/server/catalog.ts` berisi fungsi `getActiveServices()` yang dipakai rute `/layanan`.
- **Mata uang:** seluruh harga disimpan sebagai `Int` dalam satuan **rupiah penuh** (`499000`, bukan `499.000` atau sen). Tidak ada tipe desimal untuk uang.
- **Zona waktu:** `Asia/Makassar` (WITA, UTC+8). Seluruh `DateTime` disimpan UTC.
- **Nomor WhatsApp klinik:** `6285172228900` (format internasional tanpa `+` untuk tautan `wa.me`). Tampilan ke pengguna: `0851-7222-8900`.
- **Instagram:** `sundyclinic`.
- **Jam operasional:** Senin–Sabtu 11.00–19.00 WITA. Minggu dan hari libur nasional tutup.
- **Cabang:** `SunDY Mahakeret` (Jl. Garuda No. 10, Mahakeret Barat, Manado) berstatus `AKTIF`; `SunDY Citraland` (Citraland — Cluster The Manhattan, Manado) berstatus `SEGERA_HADIR`.
- **Dokter:** `Dr. Diane Paparang, Sp.GK, AIFO-K`.
- **Tema warna:** hanya mode terang. Situs menetapkan `color-scheme: light` dan tidak menyediakan mode gelap — identitas SunDY bertumpu pada krem-emas yang tidak punya padanan gelap yang masuk akal.
- **Basis data:** Neon (PostgreSQL terkelola), wilayah **Singapore `ap-southeast-1`** — terdekat dari Manado. Dua basis data dalam satu proyek Neon: `sundy_dev` untuk pengembangan dan `sundy_test` untuk pengujian integrasi.
- **Koneksi Prisma:** `url` memakai endpoint **pooled** (`-pooler`) untuk aplikasi; `directUrl` memakai endpoint **langsung** untuk migrasi. Keduanya wajib ada — `prisma migrate` tidak dapat berjalan lewat connection pooler.
- **Tidak ada data pasien di Plan 1.** Model rekam medis tidak dibuat di plan ini.
- **Setiap task berakhir dengan commit.** Pesan commit berbahasa Inggris berformat Conventional Commits.

---

## Struktur Berkas

Berkas yang dibuat plan ini, beserta tanggung jawab masing-masing:

```
public/logo-sundy.png           Logo horizontal SunDY (latar transparan) — header & footer
src/app/icon.png                Ikon tab peramban: lambang matahari saja, 512×512
src/app/opengraph-image.png     Gambar pratinjau saat tautan dibagikan, 1200×630

.env.example                    Contoh variabel lingkungan (tanpa rahasia)
prisma/schema.prisma            Model Branch, Doctor, ServiceCategory, Service, Package, PackageItem, Product
prisma/seed.ts                  Data awal: 2 cabang, 1 dokter, seluruh katalog dari PRD Lampiran A & B

src/lib/db.ts                   Singleton PrismaClient (aman terhadap hot reload)
src/lib/clinic.ts               Konstanta klinik: nama, WA, Instagram, jam operasional
src/lib/format.ts               formatRupiah, formatPrice
src/lib/whatsapp.ts             Pembangun tautan wa.me dengan pesan terisi otomatis
src/server/catalog.ts           Seluruh query baca katalog — satu-satunya berkas yang menyentuh Prisma untuk katalog

src/app/layout.tsx              Kerangka halaman: font, header, footer, tombol WA mengambang
src/app/globals.css             Token warna & tipografi SunDY (Tailwind v4 @theme)
src/app/page.tsx                Beranda
src/app/layanan/page.tsx        Daftar seluruh layanan per kategori
src/app/layanan/[slug]/page.tsx Detail satu layanan
src/app/program-slimming/page.tsx  Paket MAX / LUX / ACTIVE + layanan satuan
src/app/produk/page.tsx         Katalog produk (pesan via WhatsApp)
src/app/lokasi/page.tsx         Kedua cabang
src/app/lokasi/[slug]/page.tsx  Detail satu cabang
src/app/tentang/page.tsx        Tentang klinik & Dr. Diane Paparang, Sp.GK, AIFO-K
src/app/faq/page.tsx            Tanya jawab
src/app/kebijakan-privasi/page.tsx  Kebijakan privasi (UU PDP 27/2022)
src/app/syarat-ketentuan/page.tsx   Syarat & ketentuan
src/app/sitemap.ts              Peta situs dinamis
src/app/robots.ts               robots.txt

src/components/layout/site-header.tsx    Navigasi utama + menu mobile
src/components/layout/site-footer.tsx    Footer: kontak, cabang, tautan
src/components/layout/whatsapp-fab.tsx   Tombol WhatsApp mengambang
src/components/catalog/price-tag.tsx     Harga coret + harga promo + catatan harga
src/components/catalog/service-card.tsx  Kartu satu layanan
src/components/catalog/package-card.tsx  Kartu satu paket slimming
src/components/catalog/product-card.tsx  Kartu satu produk
src/components/catalog/branch-card.tsx   Kartu satu cabang (menangani status SEGERA_HADIR)

tests/unit/format.test.ts        Uji utilitas format
tests/unit/whatsapp.test.ts      Uji pembangun tautan WA
tests/unit/components/*.test.tsx Uji komponen katalog
tests/integration/catalog.test.ts  Uji lapisan query terhadap basis data uji
tests/integration/seed.test.ts     Uji isi data awal
tests/e2e/public-site.spec.ts      Uji ujung-ke-ujung alur publik
```

**Batasan penting:** `src/app/**` tidak boleh mengimpor `@/lib/db` secara langsung. Halaman memanggil fungsi dari `src/server/catalog.ts`. Aturan ini ditegakkan oleh uji di Task 6.

---

### Task 1: Inisialisasi proyek & perkakas pengujian

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` (dihasilkan `create-next-app`)
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/unit/smoke.test.ts`
- Modify: `package.json` (skrip uji)

**Interfaces:**
- Consumes: —
- Produces: perintah `npm test` (Vitest, sekali jalan) dan `npm run dev`. Alias impor `@/*` menunjuk ke `src/*`.

- [ ] **Step 1: Buat proyek Next.js**

Jalankan dari `/Users/marchelinoraco/Documents/2026/sundy-clinik` (folder sudah berisi `.git`, `README.md`, `docs/`, `.gitignore` — `create-next-app` akan mengisi folder yang sudah ada):

```bash
npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Jawab `Yes` bila ditanya soal melanjutkan di direktori tidak kosong. Untuk pertanyaan sisanya (misalnya Turbopack), jawaban mana pun tidak memengaruhi plan ini.

- [ ] **Step 2: Pasang dependensi pengujian**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths
```

- [ ] **Step 3: Buat konfigurasi Vitest**

Buat `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
  },
});
```

Buat `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Berkas uji yang butuh Node (basis data) menuliskan `// @vitest-environment node` di baris pertamanya.

- [ ] **Step 4: Tulis uji asap yang gagal**

Buat `tests/unit/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CLINIC_NAME } from "@/lib/clinic";

describe("perkakas proyek", () => {
  it("menyelesaikan alias impor @/ ke src/", () => {
    expect(CLINIC_NAME).toBe("SunDY Clinic");
  });
});
```

- [ ] **Step 5: Tambahkan skrip uji ke package.json**

Tambahkan di dalam `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Jalankan uji dan pastikan GAGAL**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/lib/clinic"`.

- [ ] **Step 7: Buat konstanta klinik minimal agar uji lulus**

Buat `src/lib/clinic.ts`:

```ts
export const CLINIC_NAME = "SunDY Clinic";
```

- [ ] **Step 8: Jalankan uji dan pastikan LULUS**

Run: `npm test`
Expected: PASS — 1 uji lulus.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 project with Vitest"
```

---

### Task 2: Basis data Neon & klien Prisma

**Files:**
- Create: `.env.example`
- Create: `.env` (tidak di-commit — sudah diblokir `.gitignore`)
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `tests/integration/connection.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: alias `@/*` dari Task 1.
- Produces: `prisma` — instance `PrismaClient` yang diekspor dari `@/lib/db`. Basis data `sundy_dev` dan `sundy_test` di satu proyek Neon.

> **Catatan jujur soal kecepatan uji.** Basis data Neon berada di Singapura, jadi setiap kueri dalam uji integrasi menempuh perjalanan jaringan. Uji integrasi akan terasa lebih lambat daripada Postgres lokal — perkiraan beberapa detik per berkas, bukan milidetik. Ini harga yang dibayar untuk deploy Vercel yang tanpa konfigurasi, dan untuk proyek sebesar ini masih nyaman. Uji unit (yang jumlahnya jauh lebih banyak) tidak menyentuh basis data sama sekali dan tetap seketika.

- [ ] **Step 1: Buat proyek Neon**

Lewat peramban di [console.neon.tech](https://console.neon.tech):

1. Daftar/masuk, lalu **Create project**.
2. Nama proyek: `sundy-clinic`.
3. **Region: Singapore (`ap-southeast-1`)** — terdekat dari Manado, jangan pilih region AS atau Eropa.
4. Versi PostgreSQL: 16.
5. Setelah proyek jadi, buka tab **Databases** → **New Database** → buat `sundy_dev`, lalu ulangi untuk `sundy_test`.

Salin connection string dari tab **Connection Details**. Ambil **dua** bentuk untuk masing-masing basis data:
- **Pooled connection** — hostnya mengandung `-pooler`, dipakai aplikasi.
- **Direct connection** — tanpa `-pooler`, dipakai migrasi Prisma.

- [ ] **Step 2: Buat .env.example dan .env**

Buat `.env.example` (di-commit, **tanpa** kredensial asli):

```
# Neon PostgreSQL — region ap-southeast-1 (Singapore)
# Endpoint pooled (mengandung "-pooler"): dipakai aplikasi.
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/sundy_dev?sslmode=require"
# Endpoint langsung (tanpa "-pooler"): dipakai prisma migrate.
DIRECT_URL="postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/sundy_dev?sslmode=require"

# Basis data terpisah untuk pengujian integrasi.
TEST_DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/sundy_test?sslmode=require"
TEST_DIRECT_URL="postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/sundy_test?sslmode=require"
```

Salin menjadi `.env`, lalu ganti seluruh nilainya dengan connection string asli dari Neon:

```bash
cp .env.example .env
```

`.env` sudah diblokir `.gitignore`. Jangan pernah menempatkan kredensial asli di `.env.example`.

- [ ] **Step 3: Pasang Prisma**

```bash
npm install -D prisma
npm install @prisma/client
```

Jangan jalankan `prisma init` — perintah itu menimpa `.env` yang baru saja Anda isi. Berkas `prisma/schema.prisma` dibuat manual di Step 4.

- [ ] **Step 4: Buat skema Prisma dengan dua URL**

Buat `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`directUrl` bukan pilihan opsional. Neon menyalurkan `DATABASE_URL` lewat connection pooler yang tidak mendukung perintah DDL yang dipakai `prisma migrate`; tanpa `directUrl`, migrasi akan gagal.

- [ ] **Step 5: Tulis uji koneksi yang gagal**

Buat `tests/integration/connection.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("koneksi basis data", () => {
  it("dapat menjalankan kueri terhadap PostgreSQL", async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(result[0].ok).toBe(1);
  });
});
```

- [ ] **Step 6: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/integration/connection.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/db"`.

- [ ] **Step 7: Buat singleton klien Prisma**

Buat `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Singleton ini mencegah kebocoran koneksi saat Next.js melakukan hot reload di mode pengembangan.

- [ ] **Step 8: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/integration/connection.test.ts`
Expected: PASS.

- [ ] **Step 9: Tambahkan skrip basis data ke package.json**

```json
"db:migrate": "prisma migrate dev",
"db:studio": "prisma studio",
"db:reset": "prisma migrate reset --force"
```

Ubah juga skrip `build` agar klien Prisma selalu dibangkitkan ulang:

```json
"build": "prisma generate && next build"
```

Vercel menyimpan `node_modules` dari build sebelumnya. Tanpa `prisma generate` di awal, klien Prisma yang terpakai bisa tertinggal di versi skema lama dan galatnya baru muncul saat aplikasi sudah tayang.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Neon PostgreSQL and Prisma client"
```

---

### Task 3: Skema katalog & cabang

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/` (dihasilkan Prisma)
- Create: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`.
- Produces: model Prisma `Branch`, `Doctor`, `ServiceCategory`, `Service`, `Package`, `PackageItem`, `Product`, dan enum `BranchStatus` (`AKTIF` | `SEGERA_HADIR`). Seluruh kolom harga bertipe `Int` dalam rupiah penuh.

- [ ] **Step 1: Tulis uji skema yang gagal**

Buat `tests/integration/schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("skema katalog", () => {
  beforeEach(async () => {
    await prisma.packageItem.deleteMany();
    await prisma.package.deleteMany();
    await prisma.service.deleteMany();
    await prisma.serviceCategory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.doctor.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("menyimpan harga sebagai bilangan bulat rupiah penuh", async () => {
    const category = await prisma.serviceCategory.create({
      data: { slug: "hifu", name: "HIFU", sortOrder: 1 },
    });
    const service = await prisma.service.create({
      data: {
        slug: "hifu-wajah",
        name: "HIFU Wajah",
        normalPrice: 749000,
        promoPrice: 499000,
        durationMin: 60,
        categoryId: category.id,
      },
    });

    expect(service.promoPrice).toBe(499000);
    expect(Number.isInteger(service.promoPrice)).toBe(true);
  });

  it("menolak dua layanan dengan slug sama", async () => {
    const category = await prisma.serviceCategory.create({
      data: { slug: "peeling", name: "Peeling", sortOrder: 2 },
    });
    await prisma.service.create({
      data: { slug: "peeling", name: "Peeling", promoPrice: 99000, categoryId: category.id },
    });

    await expect(
      prisma.service.create({
        data: { slug: "peeling", name: "Peeling Ulang", promoPrice: 99000, categoryId: category.id },
      }),
    ).rejects.toThrow();
  });

  it("membedakan cabang aktif dari cabang yang segera hadir", async () => {
    await prisma.branch.create({
      data: {
        slug: "mahakeret",
        name: "SunDY Mahakeret",
        address: "Jl. Garuda No. 10, Mahakeret Barat, Manado",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
        sortOrder: 1,
      },
    });
    await prisma.branch.create({
      data: {
        slug: "citraland",
        name: "SunDY Citraland",
        address: "Citraland — Cluster The Manhattan, Manado",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "SEGERA_HADIR",
        sortOrder: 2,
      },
    });

    const bookable = await prisma.branch.findMany({ where: { status: "AKTIF" } });
    expect(bookable).toHaveLength(1);
    expect(bookable[0].slug).toBe("mahakeret");
  });

  it("menghapus isi paket saat paketnya dihapus", async () => {
    const pkg = await prisma.package.create({
      data: {
        slug: "max-slim",
        name: "MAX SLIM",
        groupName: "MAX",
        monthlyPrice: 1925000,
        sortOrder: 2,
        items: {
          create: [
            { label: "Konsul & Timbang BIA", sortOrder: 1 },
            { label: "Kapsul M", sortOrder: 2 },
          ],
        },
      },
      include: { items: true },
    });
    expect(pkg.items).toHaveLength(2);

    await prisma.package.delete({ where: { id: pkg.id } });
    expect(await prisma.packageItem.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `DATABASE_URL="$TEST_DATABASE_URL" npm test -- tests/integration/schema.test.ts`

Agar tidak perlu mengetik variabel setiap kali, tambahkan skrip ini ke `package.json` dan pakai seterusnya:

```json
"test:integration": "dotenv -e .env -v DATABASE_URL=$TEST_DATABASE_URL -v DIRECT_URL=$TEST_DIRECT_URL -- vitest run tests/integration --no-file-parallelism"
```

Bila `dotenv-cli` belum ada: `npm install -D dotenv-cli`.

`--no-file-parallelism` wajib ada. Seluruh berkas uji integrasi memakai satu basis data uji yang sama, dan sebagian di antaranya mengosongkan tabel. Bila dijalankan paralel, satu berkas akan menghapus data yang sedang dipakai berkas lain dan kegagalannya muncul acak.

Expected: FAIL — `prisma.serviceCategory is not a function` (model belum ada).

- [ ] **Step 3: Tulis skema**

Ganti seluruh isi `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum BranchStatus {
  AKTIF
  SEGERA_HADIR
}

model Branch {
  id           String       @id @default(cuid())
  slug         String       @unique
  name         String
  address      String
  mapsUrl      String?
  latitude     Float?
  longitude    Float?
  whatsapp     String
  openingHours String
  status       BranchStatus @default(SEGERA_HADIR)
  sortOrder    Int          @default(0)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([status, sortOrder])
}

model Doctor {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  sipNumber String?
  specialty String?
  photoUrl  String?
  bio       String?
  isActive  Boolean  @default(true)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ServiceCategory {
  id          String    @id @default(cuid())
  slug        String    @unique
  name        String
  description String?
  sortOrder   Int       @default(0)
  services    Service[]
}

model Service {
  id          String  @id @default(cuid())
  slug        String  @unique
  name        String
  description String?
  /// Harga sebelum promo dalam rupiah penuh. null bila tidak ada harga coret.
  normalPrice Int?
  /// Harga yang berlaku dalam rupiah penuh.
  promoPrice  Int
  /// Satuan harga yang tampil setelah angka, misal "/ unit" atau "/ 5 titik".
  priceNote   String?
  durationMin Int     @default(30)
  imageUrl    String?
  /// Ditampilkan di bagian "Our Signature Treatment" pada beranda.
  isSignature Boolean @default(false)
  isActive    Boolean @default(true)
  sortOrder   Int     @default(0)

  categoryId String
  category   ServiceCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([categoryId, sortOrder])
  @@index([isSignature])
}

model Package {
  id           String        @id @default(cuid())
  slug         String        @unique
  name         String
  /// Kelompok paket: MAX, LUX, atau ACTIVE.
  groupName    String
  /// Harga per bulan dalam rupiah penuh.
  monthlyPrice Int
  description  String?
  isActive     Boolean       @default(true)
  sortOrder    Int           @default(0)
  items        PackageItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([groupName, sortOrder])
}

model PackageItem {
  id        String  @id @default(cuid())
  label     String
  sortOrder Int     @default(0)

  packageId String
  package   Package @relation(fields: [packageId], references: [id], onDelete: Cascade)

  @@index([packageId, sortOrder])
}

model Product {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  description String?
  /// Harga dalam rupiah penuh. null bila harga hanya lewat WhatsApp.
  price       Int?
  imageUrl    String?
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- [ ] **Step 4: Jalankan migrasi**

```bash
npx prisma migrate dev --name catalog_and_branches
npx dotenv -e .env -v DATABASE_URL=$TEST_DATABASE_URL -v DIRECT_URL=$TEST_DIRECT_URL -- prisma migrate deploy
```

Perintah kedua menerapkan migrasi yang sama ke basis data uji di Neon.

- [ ] **Step 5: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration`
Expected: PASS — 4 uji lulus.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add catalog and branch schema"
```

---

### Task 4: Data awal katalog

**Files:**
- Create: `prisma/seed.ts`
- Create: `tests/integration/seed.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: model Prisma dari Task 3.
- Produces: fungsi `seed(): Promise<void>` yang diekspor dari `prisma/seed.ts`, bersifat idempoten (aman dijalankan berulang kali). Perintah `npm run db:seed`.

Seluruh harga di bawah disalin dari PRD Lampiran A & B. **Catatan:** entri "Signature Treatment" pada materi promosi bukan layanan terpisah — ia menyorot empat layanan yang sudah ada (Peeling, RF Wajah, HIFU Wajah, Skin Booster DNA Salmon), jadi disimpan sebagai penanda `isSignature` pada layanan tersebut, bukan sebagai baris duplikat.

- [ ] **Step 1: Tulis uji data awal yang gagal**

Buat `tests/integration/seed.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "../../prisma/seed";

describe("data awal katalog", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("membuat dua cabang dengan status yang benar", async () => {
    const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
    expect(branches).toHaveLength(2);
    expect(branches[0].slug).toBe("mahakeret");
    expect(branches[0].status).toBe("AKTIF");
    expect(branches[1].slug).toBe("citraland");
    expect(branches[1].status).toBe("SEGERA_HADIR");
  });

  it("membuat Dr. Diane Paparang, Sp.GK, AIFO-K", async () => {
    const doctor = await prisma.doctor.findUnique({ where: { slug: "diane-paparang" } });
    expect(doctor?.name).toBe("Dr. Diane Paparang, Sp.GK, AIFO-K");
    expect(doctor?.isActive).toBe(true);
  });

  it("memuat harga HIFU Wajah sesuai materi promosi", async () => {
    const service = await prisma.service.findUnique({ where: { slug: "hifu-wajah" } });
    expect(service?.normalPrice).toBe(749000);
    expect(service?.promoPrice).toBe(499000);
  });

  it("menyimpan Botox dengan catatan satuan harga", async () => {
    const botox = await prisma.service.findUnique({ where: { slug: "botox" } });
    expect(botox?.promoPrice).toBe(50000);
    expect(botox?.normalPrice).toBeNull();
    expect(botox?.priceNote).toBe("/ unit");
  });

  it("menandai tepat empat layanan sebagai signature", async () => {
    const signature = await prisma.service.findMany({ where: { isSignature: true } });
    expect(signature.map((s) => s.slug).sort()).toEqual([
      "hifu-wajah",
      "peeling",
      "rf-wajah",
      "skin-booster-dna-salmon",
    ]);
  });

  it("membuat dua belas paket slimming dalam tiga kelompok", async () => {
    const packages = await prisma.package.findMany();
    expect(packages).toHaveLength(12);

    const maxSlim = await prisma.package.findUnique({
      where: { slug: "max-slim" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    expect(maxSlim?.monthlyPrice).toBe(1925000);
    expect(maxSlim?.items.map((i) => i.label)).toEqual([
      "Konsul & Timbang BIA",
      "Kapsul M",
      "Fat Blocker",
      "Inject S",
    ]);
  });

  it("memakai Kapsul L pada LUX T ACTIVE, bukan Kapsul M", async () => {
    const luxTActive = await prisma.package.findUnique({
      where: { slug: "lux-t-active" },
      include: { items: true },
    });
    const labels = luxTActive?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("Kapsul L");
    expect(labels).not.toContain("Kapsul M");
  });

  it("bersifat idempoten — dijalankan dua kali tidak menggandakan data", async () => {
    await seed();
    expect(await prisma.branch.count()).toBe(2);
    expect(await prisma.package.count()).toBe(12);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/seed.test.ts`
Expected: FAIL — `Cannot find module '../../prisma/seed'`.

- [ ] **Step 3: Tulis skrip data awal — bagian cabang, dokter, kategori**

Buat `prisma/seed.ts`:

```ts
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/db";

const branches = [
  {
    slug: "mahakeret",
    name: "SunDY Mahakeret",
    address: "Jl. Garuda No. 10, Mahakeret Barat, Manado, Sulawesi Utara",
    whatsapp: "6285172228900",
    openingHours: "Senin–Sabtu, 11.00–19.00",
    status: "AKTIF" as const,
    sortOrder: 1,
  },
  {
    slug: "citraland",
    name: "SunDY Citraland",
    address: "Citraland — Cluster The Manhattan, Manado, Sulawesi Utara",
    whatsapp: "6285172228900",
    openingHours: "Senin–Sabtu, 11.00–19.00",
    status: "SEGERA_HADIR" as const,
    sortOrder: 2,
  },
];

const doctors = [
  {
    slug: "diane-paparang",
    name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
    specialty: "Nutrition, Slimming & Aesthetic",
    bio: "Dokter penanggung jawab SunDY Clinic Manado untuk program slimming dan perawatan estetika.",
    isActive: true,
    sortOrder: 1,
  },
];

const categories = [
  { slug: "facial", name: "Facial Treatment", sortOrder: 1 },
  { slug: "peeling", name: "Peeling", sortOrder: 2 },
  { slug: "rf", name: "RF Treatment", description: "Kulit lebih kencang, glowing & awet muda", sortOrder: 3 },
  { slug: "hifu", name: "HIFU Treatment", sortOrder: 4 },
  { slug: "botox", name: "Botox Treatment", sortOrder: 5 },
  { slug: "laser", name: "Laser Treatment", description: "Solusi kulit lebih sehat, cerah, dan glowing", sortOrder: 6 },
  { slug: "dermapen", name: "Dermapen Treatment", sortOrder: 7 },
  { slug: "elektrocauter", name: "Elektrocauter Treatment", sortOrder: 8 },
  { slug: "skin-booster", name: "Skin Booster", sortOrder: 9 },
  { slug: "vitamin-c", name: "Vitamin C", sortOrder: 10 },
  { slug: "meso", name: "Meso Treatment", description: "Signature treatment for slimming", sortOrder: 11 },
];
```

- [ ] **Step 4: Tambahkan daftar layanan ke prisma/seed.ts**

Lanjutkan berkas yang sama:

```ts
type SeedService = {
  slug: string;
  name: string;
  description?: string;
  normalPrice?: number;
  promoPrice: number;
  priceNote?: string;
  durationMin?: number;
  isSignature?: boolean;
  categorySlug: string;
  sortOrder: number;
};

const services: SeedService[] = [
  // Facial
  { slug: "relaxing-facial", name: "Relaxing Facial", normalPrice: 189000, promoPrice: 149000, durationMin: 60, categorySlug: "facial", sortOrder: 1 },
  { slug: "facial-brightening", name: "Facial Brightening", normalPrice: 289000, promoPrice: 249000, durationMin: 60, categorySlug: "facial", sortOrder: 2 },
  { slug: "facial-acne", name: "Facial Acne", normalPrice: 289000, promoPrice: 249000, durationMin: 60, categorySlug: "facial", sortOrder: 3 },

  // Peeling
  { slug: "peeling", name: "Peeling", description: "Mengangkat sel kulit mati, membersihkan pori-pori, dan membantu kulit tampak lebih cerah, halus, dan sehat.", normalPrice: 149000, promoPrice: 99000, durationMin: 45, isSignature: true, categorySlug: "peeling", sortOrder: 1 },
  { slug: "peeling-premium", name: "Peeling Premium", description: "Perawatan peeling dengan formula premium untuk hasil yang lebih optimal, aman, nyaman, dan minim iritasi.", normalPrice: 349000, promoPrice: 299000, durationMin: 45, categorySlug: "peeling", sortOrder: 2 },
  { slug: "paket-peeling-premium", name: "Paket Peeling Premium", description: "Rangkaian tiga kali Peeling Premium.", promoPrice: 799000, priceNote: "/ 3x", durationMin: 45, categorySlug: "peeling", sortOrder: 3 },

  // RF
  { slug: "rf-perut", name: "RF Perut", description: "Mengencangkan kulit perut, mengurangi lemak lokal, dan membantu meratakan tekstur kulit sehingga perut terlihat lebih kencang dan ramping.", normalPrice: 749000, promoPrice: 499000, durationMin: 60, categorySlug: "rf", sortOrder: 1 },
  { slug: "rf-paha", name: "RF Paha", description: "Membantu mengencangkan kulit pada area paha, mengurangi lemak membandel, dan meningkatkan elastisitas kulit agar paha tampak lebih halus dan kencang.", normalPrice: 499000, promoPrice: 329000, durationMin: 60, categorySlug: "rf", sortOrder: 2 },
  { slug: "rf-lengan", name: "RF Lengan", description: "Mengencangkan kulit lengan yang kendur, mengurangi lemak berlebih, dan membantu membentuk lengan agar terlihat lebih kencang dan ideal.", normalPrice: 389000, promoPrice: 289000, durationMin: 45, categorySlug: "rf", sortOrder: 3 },
  { slug: "rf-wajah", name: "RF Wajah", description: "Merangsang produksi kolagen, mengencangkan kulit wajah, mengurangi garis halus, dan membantu kulit tampak lebih cerah, halus, serta awet muda.", normalPrice: 389000, promoPrice: 289000, durationMin: 45, isSignature: true, categorySlug: "rf", sortOrder: 4 },

  // HIFU
  { slug: "hifu-wajah", name: "HIFU Wajah", description: "Mengencangkan kulit & mengurangi garis halus.", normalPrice: 749000, promoPrice: 499000, durationMin: 90, isSignature: true, categorySlug: "hifu", sortOrder: 1 },
  { slug: "hifu-miss-v", name: "HIFU Miss V", normalPrice: 649000, promoPrice: 489000, durationMin: 60, categorySlug: "hifu", sortOrder: 2 },
  { slug: "hifu-perut", name: "HIFU Perut", normalPrice: 1000000, promoPrice: 699000, durationMin: 90, categorySlug: "hifu", sortOrder: 3 },

  // Botox
  { slug: "botox", name: "Botox", promoPrice: 50000, priceNote: "/ unit", durationMin: 30, categorySlug: "botox", sortOrder: 1 },

  // Laser
  { slug: "laser-rejuve-fleck", name: "Laser Rejuve / Fleck", description: "Merangsang regenerasi kulit, memudarkan flek hitam, bekas jerawat, dan membuat kulit tampak lebih cerah dan merata.", normalPrice: 849000, promoPrice: 399000, durationMin: 45, categorySlug: "laser", sortOrder: 1 },
  { slug: "laser-2-in-1", name: "Laser 2 in 1", description: "Perawatan laser kombinasi untuk mengatasi berbagai masalah kulit seperti pori-pori besar, bekas jerawat, dan tekstur kulit tidak merata.", normalPrice: 1000000, promoPrice: 599000, durationMin: 60, categorySlug: "laser", sortOrder: 2 },
  { slug: "lip-laser", name: "Lip Laser", description: "Mencerahkan warna bibir, mengurangi bibir gelap, dan membuat bibir tampak lebih sehat, cerah, dan merona alami.", normalPrice: 249000, promoPrice: 99000, durationMin: 30, categorySlug: "laser", sortOrder: 3 },

  // Dermapen
  { slug: "dermapen", name: "Dermapen", description: "Merangsang produksi kolagen alami, memperbaiki tekstur kulit, mengurangi bekas jerawat, dan membantu penyerapan skincare lebih optimal.", normalPrice: 749000, promoPrice: 589000, durationMin: 60, categorySlug: "dermapen", sortOrder: 1 },
  { slug: "dermapen-prp", name: "Dermapen PRP", description: "Kombinasi dermapen dengan PRP (Platelet Rich Plasma) untuk regenerasi kulit lebih cepat, kulit tampak lebih cerah, sehat, dan awet muda.", normalPrice: 1189000, promoPrice: 898000, durationMin: 90, categorySlug: "dermapen", sortOrder: 2 },

  // Elektrocauter
  { slug: "elektrocauter", name: "Elektrocauter", description: "Menghilangkan skin tag, milia, kutil, atau verruca dengan teknologi elektrocauter yang aman, cepat, dan minim rasa sakit dengan hasil optimal.", normalPrice: 248000, promoPrice: 188000, durationMin: 30, categorySlug: "elektrocauter", sortOrder: 1 },

  // Skin Booster
  { slug: "skin-booster-ha", name: "Skin Booster HA", description: "Melembapkan kulit secara intens, meningkatkan elastisitas dan membuat kulit lebih kenyal dan sehat.", normalPrice: 3890000, promoPrice: 3589000, durationMin: 60, categorySlug: "skin-booster", sortOrder: 1 },
  { slug: "skin-booster-dna-salmon", name: "Skin Booster DNA Salmon", description: "Membantu regenerasi sel kulit, memperbaiki tekstur kulit, mencerahkan, dan mengurangi tanda-tanda penuaan.", normalPrice: 989000, promoPrice: 889000, durationMin: 60, isSignature: true, categorySlug: "skin-booster", sortOrder: 2 },
  { slug: "eyebooster", name: "Eyebooster", description: "Perawatan khusus area mata untuk mengurangi kerutan, mata panda, dan membuat tampilan mata lebih segar dan bercahaya.", normalPrice: 2389000, promoPrice: 2189000, durationMin: 45, categorySlug: "skin-booster", sortOrder: 3 },

  // Vitamin C
  { slug: "injek-vitamin-c-2000mg", name: "Injek Vit. C 2000mg", description: "Membantu mencerahkan kulit, meningkatkan produksi kolagen, dan melindungi kulit dari radikal bebas.", normalPrice: 1449000, promoPrice: 1299000, durationMin: 30, categorySlug: "vitamin-c", sortOrder: 1 },
  { slug: "injek-vitamin-c-1100mg", name: "Injek Vit. C 1100mg", description: "Membantu menjaga kesehatan kulit, membuat kulit tampak lebih cerah, segar, dan bercahaya.", normalPrice: 1249000, promoPrice: 1199000, durationMin: 30, categorySlug: "vitamin-c", sortOrder: 2 },
  { slug: "infus-vitamin-c-1100mg", name: "Infus Vit. C 1100mg", description: "Membantu meningkatkan daya tahan tubuh, meredakan kelelahan, dan membuat kulit tampak lebih sehat.", normalPrice: 1499000, promoPrice: 1299000, durationMin: 60, categorySlug: "vitamin-c", sortOrder: 3 },
  { slug: "infus-vitamin-c-2000mg", name: "Infus Vit. C 2000mg", description: "Dosis tinggi untuk hasil maksimal dalam mencerahkan kulit, meningkatkan imunitas, dan melawan radikal bebas.", normalPrice: 1699000, promoPrice: 1499000, durationMin: 60, categorySlug: "vitamin-c", sortOrder: 4 },

  // Meso
  { slug: "meso-treatment", name: "Meso Treatment", description: "Signature treatment untuk slimming.", promoPrice: 550000, priceNote: "/ 5 titik", durationMin: 45, categorySlug: "meso", sortOrder: 1 },

  // Layanan satuan program slimming
  { slug: "konsultasi-dokter", name: "Konsultasi Dokter", description: "Analisa kondisi dan rekomendasi program terbaik untuk Anda.", promoPrice: 200000, durationMin: 30, categorySlug: "meso", sortOrder: 90 },
  { slug: "timbang-bia", name: "Timbang BIA", description: "Pengukuran komposisi tubuh: berat, massa lemak, massa otot, dan lemak visceral.", promoPrice: 350000, durationMin: 20, categorySlug: "meso", sortOrder: 91 },
  { slug: "meal-plan", name: "Meal Plan", description: "Rencana makan yang disusun sesuai kondisi dan target Anda.", promoPrice: 300000, durationMin: 30, categorySlug: "meso", sortOrder: 92 },
];
```

- [ ] **Step 5: Tambahkan daftar paket dan produk ke prisma/seed.ts**

Lanjutkan berkas yang sama:

```ts
type SeedPackage = {
  slug: string;
  name: string;
  groupName: string;
  monthlyPrice: number;
  items: string[];
  sortOrder: number;
};

const BIA = "Konsul & Timbang BIA";

const packages: SeedPackage[] = [
  { slug: "max", name: "MAX", groupName: "MAX", monthlyPrice: 1125000, items: [BIA, "Kapsul M", "Fat Blocker"], sortOrder: 1 },
  { slug: "max-slim", name: "MAX SLIM", groupName: "MAX", monthlyPrice: 1925000, items: [BIA, "Kapsul M", "Fat Blocker", "Inject S"], sortOrder: 2 },
  { slug: "max-t", name: "MAX T", groupName: "MAX", monthlyPrice: 2525000, items: [BIA, "Kapsul M", "Fat Blocker", "Inject T"], sortOrder: 3 },

  { slug: "lux", name: "LUX", groupName: "LUX", monthlyPrice: 1500000, items: [BIA, "Kapsul L", "Fat Blocker"], sortOrder: 4 },
  { slug: "lux-slim", name: "LUX SLIM", groupName: "LUX", monthlyPrice: 2300000, items: [BIA, "Kapsul L", "Fat Blocker", "Inject S"], sortOrder: 5 },
  { slug: "lux-t", name: "LUX T", groupName: "LUX", monthlyPrice: 2900000, items: [BIA, "Kapsul L", "Fat Blocker", "Inject T"], sortOrder: 6 },

  { slug: "max-active", name: "MAX ACTIVE", groupName: "ACTIVE", monthlyPrice: 1125000, items: [BIA, "Kapsul M", "Fat Burner"], sortOrder: 7 },
  { slug: "max-slim-active", name: "MAX SLIM ACTIVE", groupName: "ACTIVE", monthlyPrice: 1925000, items: [BIA, "Kapsul M", "Fat Burner", "Inject S"], sortOrder: 8 },
  { slug: "max-t-active", name: "MAX T ACTIVE", groupName: "ACTIVE", monthlyPrice: 2525000, items: [BIA, "Kapsul M", "Fat Burner", "Inject T"], sortOrder: 9 },
  { slug: "lux-active", name: "LUX ACTIVE", groupName: "ACTIVE", monthlyPrice: 1500000, items: [BIA, "Kapsul L", "Fat Burner"], sortOrder: 10 },
  { slug: "lux-slim-active", name: "LUX SLIM ACTIVE", groupName: "ACTIVE", monthlyPrice: 2300000, items: [BIA, "Kapsul L", "Fat Burner", "Inject S"], sortOrder: 11 },
  // Materi promosi menulis "Kapsul M" di sini; dikoreksi menjadi Kapsul L sesuai keputusan D4 pada PRD.
  { slug: "lux-t-active", name: "LUX T ACTIVE", groupName: "ACTIVE", monthlyPrice: 2900000, items: [BIA, "Kapsul L", "Fat Burner", "Inject T"], sortOrder: 12 },
];

const products = [
  { slug: "kapsul-m", name: "Kapsul M", description: "Kapsul program slimming paket MAX. Penggunaan sesuai anjuran dokter.", sortOrder: 1 },
  { slug: "kapsul-l", name: "Kapsul L", description: "Kapsul program slimming paket LUX. Penggunaan sesuai anjuran dokter.", sortOrder: 2 },
  { slug: "fat-blocker", name: "Fat Blocker", description: "Membantu menghambat penyerapan lemak dari makanan.", sortOrder: 3 },
  { slug: "fat-burner", name: "Fat Burner", description: "Membantu meningkatkan pembakaran lemak pada program ACTIVE.", sortOrder: 4 },
];
```

- [ ] **Step 6: Tulis fungsi seed idempoten di prisma/seed.ts**

Lanjutkan berkas yang sama:

```ts
export async function seed(): Promise<void> {
  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { slug: branch.slug },
      update: branch,
      create: branch,
    });
  }

  for (const doctor of doctors) {
    await prisma.doctor.upsert({
      where: { slug: doctor.slug },
      update: doctor,
      create: doctor,
    });
  }

  const categoryIdBySlug = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
    categoryIdBySlug.set(category.slug, row.id);
  }

  for (const { categorySlug, ...service } of services) {
    const categoryId = categoryIdBySlug.get(categorySlug);
    if (!categoryId) {
      throw new Error(`Kategori "${categorySlug}" tidak ditemukan untuk layanan "${service.slug}"`);
    }
    const data = { ...service, categoryId };
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: data,
      create: data,
    });
  }

  for (const { items, ...pkg } of packages) {
    // Isi paket ditulis ulang setiap kali agar perubahan susunan tercermin tanpa menggandakan baris.
    const row = await prisma.package.upsert({
      where: { slug: pkg.slug },
      update: pkg,
      create: pkg,
    });
    await prisma.packageItem.deleteMany({ where: { packageId: row.id } });
    await prisma.packageItem.createMany({
      data: items.map((label, index) => ({
        packageId: row.id,
        label,
        sortOrder: index + 1,
      })),
    });
  }

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: product,
      create: product,
    });
  }
}

// Dijalankan hanya saat berkas ini dipanggil langsung lewat `npm run db:seed`,
// bukan saat diimpor oleh berkas uji.
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  seed()
    .then(() => console.log("Data awal selesai dimuat."))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 7: Tambahkan skrip seed ke package.json**

```json
"db:seed": "tsx prisma/seed.ts"
```

Pasang `tsx`:

```bash
npm install -D tsx
```

- [ ] **Step 8: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/seed.test.ts`
Expected: PASS — 8 uji lulus.

- [ ] **Step 9: Muat data awal ke basis data pengembangan**

```bash
npm run db:seed
```

Expected: `Data awal selesai dimuat.`

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: seed full service catalog, packages, and branches"
```

---

### Task 5: Utilitas format, konstanta klinik, dan tautan WhatsApp

**Files:**
- Modify: `src/lib/clinic.ts`
- Create: `src/lib/format.ts`
- Create: `src/lib/whatsapp.ts`
- Create: `tests/unit/format.test.ts`
- Create: `tests/unit/whatsapp.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `CLINIC_NAME: string`, `CLINIC_TAGLINE: string`, `CLINIC_WHATSAPP: string` (`"6285172228900"`), `CLINIC_WHATSAPP_DISPLAY: string` (`"0851-7222-8900"`), `CLINIC_INSTAGRAM: string` (`"sundyclinic"`), `CLINIC_TIMEZONE: string` (`"Asia/Makassar"`), `OPENING_HOURS: string`
  - `formatRupiah(amount: number): string`
  - `formatPrice(promoPrice: number, priceNote?: string | null): string`
  - `buildWhatsAppLink(message: string): string`
  - `productInquiryMessage(productName: string): string`
  - `serviceInquiryMessage(serviceName: string): string`
  - `branchNotifyMessage(branchName: string): string`

- [ ] **Step 1: Tulis uji format yang gagal**

Buat `tests/unit/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPrice, formatRupiah } from "@/lib/format";

describe("formatRupiah", () => {
  it("memakai titik sebagai pemisah ribuan", () => {
    expect(formatRupiah(499000)).toBe("Rp 499.000");
  });

  it("memformat angka jutaan", () => {
    expect(formatRupiah(3589000)).toBe("Rp 3.589.000");
  });

  it("memformat angka di bawah seribu", () => {
    expect(formatRupiah(500)).toBe("Rp 500");
  });

  it("tidak menampilkan angka desimal", () => {
    expect(formatRupiah(50000)).toBe("Rp 50.000");
  });
});

describe("formatPrice", () => {
  it("menambahkan catatan satuan bila ada", () => {
    expect(formatPrice(50000, "/ unit")).toBe("Rp 50.000 / unit");
  });

  it("menghilangkan catatan bila null", () => {
    expect(formatPrice(499000, null)).toBe("Rp 499.000");
  });

  it("menghilangkan catatan bila tidak diberikan", () => {
    expect(formatPrice(499000)).toBe("Rp 499.000");
  });
});
```

Pemformatan tanggal Indonesia belum dibuat di sini. Tidak ada satu pun halaman di Plan 1 yang menampilkan tanggal, jadi fungsinya akan menjadi kode mati. Pemformatan tanggal dibuat di Plan 3 bersama kalender booking yang pertama kali membutuhkannya.

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/format.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/format"`.

- [ ] **Step 3: Tulis utilitas format**

Buat `src/lib/format.ts`:

```ts
const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Memformat rupiah penuh menjadi teks siap tampil.
 * Intl menghasilkan "Rp499.000" tanpa spasi; klinik memakai "Rp 499.000".
 */
export function formatRupiah(amount: number): string {
  return rupiahFormatter.format(amount).replace(/^Rp\s?/, "Rp ");
}

/** Menggabungkan harga dengan catatan satuannya, misal "Rp 50.000 / unit". */
export function formatPrice(promoPrice: number, priceNote?: string | null): string {
  const price = formatRupiah(promoPrice);
  return priceNote ? `${price} ${priceNote}` : price;
}
```

- [ ] **Step 4: Lengkapi konstanta klinik**

Ganti seluruh isi `src/lib/clinic.ts`:

```ts
export const CLINIC_NAME = "SunDY Clinic";
export const CLINIC_FULL_NAME = "SunDY — Nutrition, Slimming & Wellness Clinic";
export const CLINIC_TAGLINE = "Happy weight, happy life";
export const CLINIC_BEAUTY_TAGLINE = "Your Beauty, Our Priority";

/** Format internasional tanpa tanda plus — dipakai tautan wa.me. */
export const CLINIC_WHATSAPP = "6285172228900";
/** Format yang ditampilkan ke pengunjung. */
export const CLINIC_WHATSAPP_DISPLAY = "0851-7222-8900";
export const CLINIC_INSTAGRAM = "sundyclinic";

export const CLINIC_TIMEZONE = "Asia/Makassar";
export const OPENING_HOURS = "Senin–Sabtu, 11.00–19.00 WITA";
export const CLOSED_NOTE = "Minggu dan hari libur nasional tutup";
```

- [ ] **Step 5: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/format.test.ts`
Expected: PASS — 8 uji lulus.

- [ ] **Step 6: Tulis uji tautan WhatsApp yang gagal**

Buat `tests/unit/whatsapp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  branchNotifyMessage,
  buildWhatsAppLink,
  productInquiryMessage,
  serviceInquiryMessage,
} from "@/lib/whatsapp";

describe("buildWhatsAppLink", () => {
  it("menunjuk ke nomor resmi klinik", () => {
    expect(buildWhatsAppLink("Halo")).toMatch(/^https:\/\/wa\.me\/6285172228900\?text=/);
  });

  it("mengkodekan spasi dan karakter khusus", () => {
    const link = buildWhatsAppLink("Halo SunDY & Clinic");
    expect(link).toContain("Halo%20SunDY%20%26%20Clinic");
  });

  it("mengkodekan baris baru", () => {
    expect(buildWhatsAppLink("baris satu\nbaris dua")).toContain("%0A");
  });
});

describe("pesan terisi otomatis", () => {
  it("menyebut nama produk", () => {
    expect(productInquiryMessage("Kapsul M")).toBe(
      "Halo SunDY Clinic, saya ingin memesan produk Kapsul M. Mohon informasinya.",
    );
  });

  it("menyebut nama layanan", () => {
    expect(serviceInquiryMessage("HIFU Wajah")).toBe(
      "Halo SunDY Clinic, saya ingin bertanya tentang treatment HIFU Wajah.",
    );
  });

  it("menyebut nama cabang yang ditunggu", () => {
    expect(branchNotifyMessage("SunDY Citraland")).toBe(
      "Halo SunDY Clinic, mohon beri tahu saya saat cabang SunDY Citraland sudah buka.",
    );
  });
});
```

- [ ] **Step 7: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/whatsapp.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/whatsapp"`.

- [ ] **Step 8: Tulis pembangun tautan WhatsApp**

Buat `src/lib/whatsapp.ts`:

```ts
import { CLINIC_NAME, CLINIC_WHATSAPP } from "./clinic";

/** Membangun tautan wa.me ke nomor klinik dengan pesan yang sudah terisi. */
export function buildWhatsAppLink(message: string): string {
  return `https://wa.me/${CLINIC_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

export function productInquiryMessage(productName: string): string {
  return `Halo ${CLINIC_NAME}, saya ingin memesan produk ${productName}. Mohon informasinya.`;
}

export function serviceInquiryMessage(serviceName: string): string {
  return `Halo ${CLINIC_NAME}, saya ingin bertanya tentang treatment ${serviceName}.`;
}

export function branchNotifyMessage(branchName: string): string {
  return `Halo ${CLINIC_NAME}, mohon beri tahu saya saat cabang ${branchName} sudah buka.`;
}
```

- [ ] **Step 9: Jalankan seluruh uji unit dan pastikan LULUS**

Run: `npm test -- tests/unit`
Expected: PASS — seluruh uji unit lulus.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add clinic constants, currency formatting, and WhatsApp links"
```

---

### Task 6: Lapisan query katalog

**Files:**
- Create: `src/server/catalog.ts`
- Create: `tests/integration/catalog.test.ts`
- Create: `tests/unit/architecture.test.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`; data awal dari Task 4.
- Produces:
  - `getServiceCategoriesWithServices(): Promise<ServiceCategoryWithServices[]>`
  - `getServiceBySlug(slug: string): Promise<ServiceWithCategory | null>`
  - `getSignatureServices(): Promise<Service[]>`
  - `getAllServiceSlugs(): Promise<string[]>`
  - `getPackagesByGroup(): Promise<PackageGroup[]>` — `PackageGroup` adalah `{ groupName: string; packages: PackageWithItems[] }`
  - `getActiveProducts(): Promise<Product[]>`
  - `getBranches(): Promise<Branch[]>`
  - `getBranchBySlug(slug: string): Promise<Branch | null>`
  - `getActiveDoctors(): Promise<Doctor[]>`

- [ ] **Step 1: Tulis uji lapisan query yang gagal**

Buat `tests/integration/catalog.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "../../prisma/seed";
import {
  getActiveDoctors,
  getActiveProducts,
  getAllServiceSlugs,
  getBranchBySlug,
  getBranches,
  getPackagesByGroup,
  getServiceBySlug,
  getServiceCategoriesWithServices,
  getSignatureServices,
} from "@/server/catalog";

describe("lapisan query katalog", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("mengelompokkan layanan di bawah kategorinya dan mengurutkannya", async () => {
    const categories = await getServiceCategoriesWithServices();
    expect(categories[0].slug).toBe("facial");

    const rf = categories.find((c) => c.slug === "rf");
    expect(rf?.services.map((s) => s.slug)).toEqual([
      "rf-perut",
      "rf-paha",
      "rf-lengan",
      "rf-wajah",
    ]);
  });

  it("tidak memuat kategori yang tidak punya layanan aktif", async () => {
    const empty = await prisma.serviceCategory.create({
      data: { slug: "kategori-kosong", name: "Kategori Kosong", sortOrder: 99 },
    });
    const categories = await getServiceCategoriesWithServices();
    expect(categories.map((c) => c.slug)).not.toContain("kategori-kosong");
    await prisma.serviceCategory.delete({ where: { id: empty.id } });
  });

  it("mengambil satu layanan beserta kategorinya", async () => {
    const service = await getServiceBySlug("hifu-wajah");
    expect(service?.name).toBe("HIFU Wajah");
    expect(service?.category.name).toBe("HIFU Treatment");
  });

  it("mengembalikan null untuk slug yang tidak ada", async () => {
    expect(await getServiceBySlug("tidak-ada")).toBeNull();
  });

  it("mengembalikan empat layanan signature", async () => {
    const signature = await getSignatureServices();
    expect(signature).toHaveLength(4);
    expect(signature.every((s) => s.isSignature)).toBe(true);
  });

  it("mengembalikan seluruh slug layanan untuk peta situs", async () => {
    const slugs = await getAllServiceSlugs();
    expect(slugs).toContain("hifu-wajah");
    expect(slugs).toContain("meso-treatment");
  });

  it("mengelompokkan paket menurut MAX, LUX, ACTIVE dengan urutan itu", async () => {
    const groups = await getPackagesByGroup();
    expect(groups.map((g) => g.groupName)).toEqual(["MAX", "LUX", "ACTIVE"]);
    expect(groups[0].packages.map((p) => p.slug)).toEqual(["max", "max-slim", "max-t"]);
    expect(groups[2].packages).toHaveLength(6);
  });

  it("menyertakan isi paket yang sudah terurut", async () => {
    const groups = await getPackagesByGroup();
    const maxSlim = groups[0].packages.find((p) => p.slug === "max-slim");
    expect(maxSlim?.items.map((i) => i.label)).toEqual([
      "Konsul & Timbang BIA",
      "Kapsul M",
      "Fat Blocker",
      "Inject S",
    ]);
  });

  it("mengembalikan produk aktif saja", async () => {
    const hidden = await prisma.product.create({
      data: { slug: "produk-nonaktif", name: "Produk Nonaktif", isActive: false, sortOrder: 99 },
    });
    const products = await getActiveProducts();
    expect(products.map((p) => p.slug)).not.toContain("produk-nonaktif");
    expect(products.map((p) => p.slug)).toContain("kapsul-m");
    await prisma.product.delete({ where: { id: hidden.id } });
  });

  it("mengembalikan kedua cabang dengan cabang aktif lebih dulu", async () => {
    const branches = await getBranches();
    expect(branches.map((b) => b.slug)).toEqual(["mahakeret", "citraland"]);
  });

  it("mengambil satu cabang menurut slug", async () => {
    const branch = await getBranchBySlug("citraland");
    expect(branch?.status).toBe("SEGERA_HADIR");
  });

  it("mengembalikan dokter aktif", async () => {
    const doctors = await getActiveDoctors();
    expect(doctors.map((d) => d.name)).toContain("Dr. Diane Paparang, Sp.GK, AIFO-K");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/catalog.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/catalog"`.

- [ ] **Step 3: Tulis lapisan query**

Buat `src/server/catalog.ts`:

```ts
import type { Branch, Doctor, Product } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Urutan kelompok paket sebagaimana ditampilkan ke pengunjung. */
const PACKAGE_GROUP_ORDER = ["MAX", "LUX", "ACTIVE"] as const;

export type ServiceCategoryWithServices = Awaited<
  ReturnType<typeof getServiceCategoriesWithServices>
>[number];
export type ServiceWithCategory = NonNullable<Awaited<ReturnType<typeof getServiceBySlug>>>;
export type PackageWithItems = Awaited<ReturnType<typeof getPackagesByGroup>>[number]["packages"][number];
export type PackageGroup = { groupName: string; packages: PackageWithItems[] };

/** Kategori beserta layanan aktifnya. Kategori tanpa layanan aktif tidak dikembalikan. */
export async function getServiceCategoriesWithServices() {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      services: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  return categories.filter((category) => category.services.length > 0);
}

export async function getServiceBySlug(slug: string) {
  return prisma.service.findFirst({
    where: { slug, isActive: true },
    include: { category: true },
  });
}

export async function getSignatureServices() {
  return prisma.service.findMany({
    where: { isSignature: true, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getAllServiceSlugs(): Promise<string[]> {
  const rows = await prisma.service.findMany({
    where: { isActive: true },
    select: { slug: true },
  });
  return rows.map((row) => row.slug);
}

export async function getPackagesByGroup(): Promise<PackageGroup[]> {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  return PACKAGE_GROUP_ORDER.map((groupName) => ({
    groupName,
    packages: packages.filter((pkg) => pkg.groupName === groupName),
  })).filter((group) => group.packages.length > 0);
}

export async function getActiveProducts(): Promise<Product[]> {
  return prisma.product.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

/** Kedua cabang, cabang aktif lebih dulu. */
export async function getBranches(): Promise<Branch[]> {
  return prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function getBranchBySlug(slug: string): Promise<Branch | null> {
  return prisma.branch.findUnique({ where: { slug } });
}

export async function getActiveDoctors(): Promise<Doctor[]> {
  return prisma.doctor.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/catalog.test.ts`
Expected: PASS — 12 uji lulus.

- [ ] **Step 5: Tulis uji batasan arsitektur**

Batasan "halaman tidak boleh memanggil Prisma langsung" hanya bertahan bila ada yang memeriksanya. Buat `tests/unit/architecture.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? collectFiles(full) : [full];
  });
}

describe("batasan arsitektur", () => {
  it("tidak ada berkas di src/app yang mengimpor klien Prisma secara langsung", () => {
    const offenders = collectFiles("src/app")
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes('from "@/lib/db"') || source.includes('from "@prisma/client"');
      });

    expect(offenders).toEqual([]);
  });
});
```

Catatan: `@prisma/client` boleh diimpor untuk **tipe** di `src/components`, tetapi tidak di `src/app` — halaman menerima data lewat fungsi `src/server/catalog.ts` yang tipenya sudah tersedia dari berkas itu.

- [ ] **Step 6: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/architecture.test.ts`
Expected: PASS — belum ada halaman yang melanggar.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add catalog query layer with architecture guard"
```

---

### Task 7: Tema SunDY & kerangka tata letak

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `public/logo-sundy.png` (aset dari pemilik klinik)
- Create: `src/app/icon.png` (aset dari pemilik klinik)
- Create: `src/app/opengraph-image.png` (aset dari pemilik klinik)
- Create: `src/components/layout/site-header.tsx`
- Create: `src/components/layout/site-footer.tsx`
- Create: `src/components/layout/whatsapp-fab.tsx`
- Create: `tests/unit/components/site-footer.test.tsx`
- Create: `tests/unit/components/whatsapp-fab.test.tsx`

**Interfaces:**
- Consumes: konstanta dari `@/lib/clinic`, `buildWhatsAppLink` dari `@/lib/whatsapp`.
- Produces: komponen `SiteHeader`, `SiteFooter`, `WhatsAppFab`; token warna Tailwind `cream-*`, `gold-*`, `brown-*`.

- [ ] **Step 1: Tulis token tema**

Ganti seluruh isi `src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-cream-50: #fffdf7;
  --color-cream-100: #fdf6e3;
  --color-cream-200: #f7edd4;
  --color-cream-300: #f0e2bd;

  --color-gold-300: #efd08c;
  --color-gold-400: #e8b84b;
  --color-gold-500: #d4a017;
  --color-gold-600: #b8860b;

  --color-brown-600: #8a7047;
  --color-brown-700: #6b5535;
  --color-brown-800: #4a3c28;
  --color-brown-900: #2e2517;

  /* Nilai --font-cormorant dan --font-jakarta disuntikkan next/font di src/app/layout.tsx.
     Cadangan di belakangnya dipakai bila font gagal dimuat. */
  --font-display: var(--font-cormorant), Georgia, serif;
  --font-sans: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;
}

:root {
  /* Situs ini hanya mode terang — identitas krem-emas SunDY tidak punya padanan gelap. */
  color-scheme: light;
}

body {
  background-color: var(--color-cream-50);
  color: var(--color-brown-800);
  font-family: var(--font-sans);
}

h1, h2, h3 {
  font-family: var(--font-display);
  color: var(--color-brown-900);
}
```

- [ ] **Step 2: Tulis uji footer yang gagal**

Buat `tests/unit/components/site-footer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/layout/site-footer";

describe("SiteFooter", () => {
  it("menampilkan nomor WhatsApp klinik dalam format lokal", () => {
    render(<SiteFooter />);
    expect(screen.getByText("0851-7222-8900")).toBeInTheDocument();
  });

  it("menautkan ke Instagram klinik", () => {
    render(<SiteFooter />);
    const link = screen.getByRole("link", { name: /sundyclinic/i });
    expect(link).toHaveAttribute("href", "https://instagram.com/sundyclinic");
  });

  it("menyebut jam operasional dan hari tutup", () => {
    render(<SiteFooter />);
    expect(screen.getByText(/Senin–Sabtu, 11.00–19.00 WITA/)).toBeInTheDocument();
    expect(screen.getByText(/Minggu dan hari libur nasional tutup/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/components/site-footer.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/layout/site-footer"`.

- [ ] **Step 4: Tulis komponen footer**

Buat `src/components/layout/site-footer.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import {
  CLINIC_FULL_NAME,
  CLINIC_INSTAGRAM,
  CLINIC_WHATSAPP,
  CLINIC_WHATSAPP_DISPLAY,
  CLOSED_NOTE,
  OPENING_HOURS,
} from "@/lib/clinic";

const navLinks = [
  { href: "/layanan", label: "Layanan" },
  { href: "/program-slimming", label: "Program Slimming" },
  { href: "/produk", label: "Produk" },
  { href: "/lokasi", label: "Lokasi" },
  { href: "/tentang", label: "Tentang" },
  { href: "/faq", label: "FAQ" },
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
  { href: "/syarat-ketentuan", label: "Syarat & Ketentuan" },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-cream-300 bg-cream-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          {/* Logo sudah memuat nama lengkap dan tagline, jadi keduanya tidak diulang sebagai teks. */}
          <Image
            src="/logo-sundy.png"
            alt={CLINIC_FULL_NAME}
            width={724}
            height={362}
            className="h-20 w-auto"
          />
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brown-700">Kontak</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                className="text-brown-800 underline-offset-4 hover:underline"
                href={`https://wa.me/${CLINIC_WHATSAPP}`}
              >
                {CLINIC_WHATSAPP_DISPLAY}
              </a>
            </li>
            <li>
              <a
                className="text-brown-800 underline-offset-4 hover:underline"
                href={`https://instagram.com/${CLINIC_INSTAGRAM}`}
              >
                @{CLINIC_INSTAGRAM}
              </a>
            </li>
            <li className="pt-2 text-brown-600">{OPENING_HOURS}</li>
            <li className="text-brown-600">{CLOSED_NOTE}</li>
          </ul>
        </div>

        <nav aria-label="Tautan situs">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brown-700">Situs</h2>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link className="text-brown-800 underline-offset-4 hover:underline" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <p className="border-t border-cream-300 py-6 text-center text-xs text-brown-600">
        © {new Date().getFullYear()} {CLINIC_FULL_NAME}. Seluruh hak cipta dilindungi.
      </p>
    </footer>
  );
}
```

- [ ] **Step 5: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/components/site-footer.test.tsx`
Expected: PASS — 3 uji lulus.

- [ ] **Step 6: Tulis uji tombol WhatsApp yang gagal**

Buat `tests/unit/components/whatsapp-fab.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";

describe("WhatsAppFab", () => {
  it("menautkan ke WhatsApp klinik dengan pesan terisi", () => {
    render(<WhatsAppFab />);
    const link = screen.getByRole("link", { name: /chat via whatsapp/i });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/6285172228900?text="),
    );
  });

  it("membuka di tab baru dengan rel yang aman", () => {
    render(<WhatsAppFab />);
    const link = screen.getByRole("link", { name: /chat via whatsapp/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
```

- [ ] **Step 7: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/components/whatsapp-fab.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 8: Tulis komponen tombol WhatsApp**

Buat `src/components/layout/whatsapp-fab.tsx`:

```tsx
import { CLINIC_NAME } from "@/lib/clinic";
import { buildWhatsAppLink } from "@/lib/whatsapp";

export function WhatsAppFab() {
  const href = buildWhatsAppLink(`Halo ${CLINIC_NAME}, saya ingin bertanya.`);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat via WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden="true">
        <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.21 8.21 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.24 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.02 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.28Z" />
      </svg>
    </a>
  );
}
```

- [ ] **Step 9: Tempatkan berkas logo**

Simpan logo SunDY sebagai `public/logo-sundy.png`.

Syarat berkas: **latar transparan** (PNG-24 atau SVG), logo horizontal lengkap termasuk wordmark "SunDY", baris "Nutrition, Slimming & Wellness Clinic", dan "Happy weight, happy life". Lebar minimal 1.000 px agar tetap tajam di layar beresolusi tinggi. Bila yang tersedia hanya versi berlatar krem, latar itu akan terlihat sebagai kotak pucat di atas header — mintalah versi transparan ke perancang logo.

Bila berkas belum tersedia, lewati langkah ini dan gunakan komponen header versi teks pada Step 10; logo dapat dipasang belakangan tanpa mengubah bagian lain.

Verifikasi:

```bash
ls -la public/logo-sundy.png
```

Expected: berkas ada dan ukurannya wajar (puluhan sampai ratusan kilobyte).

- [ ] **Step 10: Tulis komponen header**

Buat `src/components/layout/site-header.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { CLINIC_FULL_NAME } from "@/lib/clinic";

const navLinks = [
  { href: "/layanan", label: "Layanan" },
  { href: "/program-slimming", label: "Program Slimming" },
  { href: "/produk", label: "Produk" },
  { href: "/lokasi", label: "Lokasi" },
  { href: "/tentang", label: "Tentang" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-cream-300 bg-cream-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" aria-label={`${CLINIC_FULL_NAME} — beranda`}>
          <Image
            src="/logo-sundy.png"
            alt={CLINIC_FULL_NAME}
            width={724}
            height={362}
            priority
            className="h-11 w-auto md:h-14"
          />
        </Link>

        <nav aria-label="Navigasi utama" className="hidden gap-6 text-sm md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-brown-700 underline-offset-8 hover:text-brown-900 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Navigasi mobile: baris yang dapat digulir horizontal, tanpa JavaScript. */}
      <nav
        aria-label="Navigasi utama mobile"
        className="flex gap-5 overflow-x-auto border-t border-cream-200 px-4 py-2 text-sm md:hidden"
      >
        {navLinks.map((link) => (
          <Link key={link.href} href={link.href} className="whitespace-nowrap text-brown-700">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 11: Pasang kerangka di layout**

Ganti seluruh isi `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";
import { CLINIC_BEAUTY_TAGLINE, CLINIC_FULL_NAME, CLINIC_NAME } from "@/lib/clinic";
import "./globals.css";

// Nama variabel sengaja berbeda dari token Tailwind (--font-display / --font-sans)
// agar token di globals.css dapat merujuknya tanpa saling menimpa.
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cormorant",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: {
    default: `${CLINIC_FULL_NAME} — Manado`,
    template: `%s | ${CLINIC_NAME}`,
  },
  description: `${CLINIC_BEAUTY_TAGLINE}. Klinik nutrisi, slimming, dan perawatan estetika di Manado.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${display.variable} ${sans.variable}`}>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <WhatsAppFab />
      </body>
    </html>
  );
}
```

- [ ] **Step 12: Jalankan seluruh uji dan pastikan LULUS**

Run: `npm test`
Expected: PASS — seluruh uji unit lulus.

- [ ] **Step 13: Tempatkan ikon tab dan gambar pratinjau**

Dua aset turunan dari logo yang sama:

- `src/app/icon.png` — **lambang mataharinya saja** (tanpa tulisan), bujur sangkar 512×512, latar transparan. Wordmark "SunDY" tidak terbaca pada ikon sekecil tab peramban, jadi jangan memakai logo penuh di sini. Next.js otomatis menjadikannya favicon; tidak perlu konfigurasi apa pun.
- `src/app/opengraph-image.png` — 1200×630, logo penuh di atas latar krem `#FDF6E3`. Gambar inilah yang muncul saat tautan situs dibagikan di WhatsApp atau Instagram. Tanpa berkas ini, tautan tampil sebagai kotak abu-abu kosong.

Bila kedua berkas belum tersedia, situs tetap berjalan — lewati langkah ini dan tambahkan belakangan.

- [ ] **Step 14: Periksa tampilan di peramban**

```bash
npm run dev
```

Buka `http://localhost:3000`. Pastikan logo tampil di header tanpa kotak latar yang janggal, footer dan tombol WhatsApp hijau di pojok kanan bawah muncul, latar krem, dan tidak ada teks gelap di atas latar gelap. Kecilkan jendela sampai lebar ponsel dan pastikan logo mengecil, bukan memaksa halaman bergulir ke samping.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: add SunDY theme, logo, header, footer, and WhatsApp button"
```

---

### Task 8: Komponen katalog

**Files:**
- Create: `src/components/catalog/price-tag.tsx`
- Create: `src/components/catalog/service-card.tsx`
- Create: `src/components/catalog/package-card.tsx`
- Create: `src/components/catalog/product-card.tsx`
- Create: `src/components/catalog/branch-card.tsx`
- Create: `tests/unit/components/price-tag.test.tsx`
- Create: `tests/unit/components/branch-card.test.tsx`

**Interfaces:**
- Consumes: `formatPrice`, `formatRupiah` dari `@/lib/format`; `buildWhatsAppLink`, `productInquiryMessage`, `branchNotifyMessage` dari `@/lib/whatsapp`; tipe `PackageWithItems` dari `@/server/catalog`.
- Produces:
  - `PriceTag({ normalPrice, promoPrice, priceNote })`
  - `ServiceCard({ service })` — `service` adalah `{ slug, name, description, normalPrice, promoPrice, priceNote }`
  - `PackageCard({ pkg })` — `pkg` bertipe `PackageWithItems`
  - `ProductCard({ product })`
  - `BranchCard({ branch })`

- [ ] **Step 1: Tulis uji PriceTag yang gagal**

Buat `tests/unit/components/price-tag.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceTag } from "@/components/catalog/price-tag";

describe("PriceTag", () => {
  it("mencoret harga normal dan menonjolkan harga promo", () => {
    render(<PriceTag normalPrice={749000} promoPrice={499000} />);

    const normal = screen.getByText("Rp 749.000");
    expect(normal.tagName).toBe("S");
    expect(screen.getByText("Rp 499.000")).toBeInTheDocument();
  });

  it("menyembunyikan harga coret bila tidak ada", () => {
    render(<PriceTag normalPrice={null} promoPrice={50000} priceNote="/ unit" />);

    expect(screen.queryByText(/^Rp 749/)).not.toBeInTheDocument();
    expect(screen.getByText("Rp 50.000 / unit")).toBeInTheDocument();
  });

  it("memberi tahu pembaca layar bahwa harga coret adalah harga lama", () => {
    render(<PriceTag normalPrice={749000} promoPrice={499000} />);
    expect(screen.getByText("Harga normal:")).toHaveClass("sr-only");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/components/price-tag.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Tulis PriceTag**

Buat `src/components/catalog/price-tag.tsx`:

```tsx
import { formatPrice, formatRupiah } from "@/lib/format";

type PriceTagProps = {
  normalPrice?: number | null;
  promoPrice: number;
  priceNote?: string | null;
};

export function PriceTag({ normalPrice, promoPrice, priceNote }: PriceTagProps) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      {normalPrice ? (
        <>
          <span className="sr-only">Harga normal:</span>
          <s className="text-sm text-brown-600">{formatRupiah(normalPrice)}</s>
        </>
      ) : null}
      <span className="text-lg font-semibold text-gold-600">
        {formatPrice(promoPrice, priceNote)}
      </span>
    </p>
  );
}
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/components/price-tag.test.tsx`
Expected: PASS — 3 uji lulus.

- [ ] **Step 5: Tulis uji BranchCard yang gagal**

Buat `tests/unit/components/branch-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BranchCard } from "@/components/catalog/branch-card";

const active = {
  slug: "mahakeret",
  name: "SunDY Mahakeret",
  address: "Jl. Garuda No. 10, Mahakeret Barat, Manado",
  openingHours: "Senin–Sabtu, 11.00–19.00",
  status: "AKTIF" as const,
  mapsUrl: "https://maps.google.com/?q=SunDY+Mahakeret",
};

const comingSoon = {
  slug: "citraland",
  name: "SunDY Citraland",
  address: "Citraland — Cluster The Manhattan, Manado",
  openingHours: "Senin–Sabtu, 11.00–19.00",
  status: "SEGERA_HADIR" as const,
  mapsUrl: null,
};

describe("BranchCard", () => {
  it("menampilkan alamat dan jam operasional", () => {
    render(<BranchCard branch={active} />);
    expect(screen.getByText(active.address)).toBeInTheDocument();
    expect(screen.getByText(/Senin–Sabtu, 11.00–19.00/)).toBeInTheDocument();
  });

  it("menawarkan petunjuk arah pada cabang aktif", () => {
    render(<BranchCard branch={active} />);
    expect(screen.getByRole("link", { name: /petunjuk arah/i })).toHaveAttribute(
      "href",
      active.mapsUrl,
    );
  });

  it("menandai cabang yang belum buka sebagai Segera Hadir", () => {
    render(<BranchCard branch={comingSoon} />);
    expect(screen.getByText("Segera Hadir")).toBeInTheDocument();
  });

  it("menawarkan pemberitahuan lewat WhatsApp pada cabang yang belum buka", () => {
    render(<BranchCard branch={comingSoon} />);
    const link = screen.getByRole("link", { name: /beri tahu saya saat buka/i });
    expect(link.getAttribute("href")).toContain("wa.me/6285172228900");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain("SunDY Citraland");
  });

  it("tidak menawarkan petunjuk arah pada cabang yang belum buka", () => {
    render(<BranchCard branch={comingSoon} />);
    expect(screen.queryByRole("link", { name: /petunjuk arah/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/components/branch-card.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 7: Tulis BranchCard**

Buat `src/components/catalog/branch-card.tsx`:

```tsx
import { CLOSED_NOTE } from "@/lib/clinic";
import { branchNotifyMessage, buildWhatsAppLink } from "@/lib/whatsapp";

type BranchCardProps = {
  branch: {
    slug: string;
    name: string;
    address: string;
    openingHours: string;
    status: "AKTIF" | "SEGERA_HADIR";
    mapsUrl?: string | null;
  };
};

export function BranchCard({ branch }: BranchCardProps) {
  const isOpen = branch.status === "AKTIF";

  return (
    <article className="rounded-2xl border border-cream-300 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl text-brown-900">{branch.name}</h2>
        {!isOpen && (
          <span className="rounded-full bg-gold-300 px-3 py-1 text-xs font-semibold text-brown-900">
            Segera Hadir
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-brown-700">{branch.address}</p>
      <p className="mt-3 text-sm text-brown-600">
        {branch.openingHours} · {CLOSED_NOTE}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {isOpen && branch.mapsUrl && (
          <a
            href={branch.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-gold-500 px-5 py-2 text-sm font-medium text-gold-600 hover:bg-cream-100"
          >
            Petunjuk Arah
          </a>
        )}

        {!isOpen && (
          <a
            href={buildWhatsAppLink(branchNotifyMessage(branch.name))}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-gold-500 px-5 py-2 text-sm font-medium text-white hover:bg-gold-600"
          >
            Beri tahu saya saat buka
          </a>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 8: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/components/branch-card.test.tsx`
Expected: PASS — 5 uji lulus.

`PriceTag` dan `BranchCard` mendapat uji sendiri karena keduanya punya percabangan: harga coret yang bisa tidak ada, dan cabang yang belum buka. Tiga komponen berikutnya tidak diberi uji unit — mereka hanya menyusun tata letak di atas `PriceTag`, `formatRupiah`, dan `buildWhatsAppLink` yang logikanya sudah teruji, dan hasil rendernya diperiksa uji ujung-ke-ujung pada Task 15. Menambah uji render untuk ketiganya hanya akan menduplikasi jaminan yang sudah ada.

- [ ] **Step 9: Tulis ServiceCard**

Buat `src/components/catalog/service-card.tsx`:

```tsx
import Link from "next/link";
import { PriceTag } from "./price-tag";

type ServiceCardProps = {
  service: {
    slug: string;
    name: string;
    description?: string | null;
    normalPrice?: number | null;
    promoPrice: number;
    priceNote?: string | null;
  };
};

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-cream-300 bg-white p-5 shadow-sm transition hover:shadow-md">
      <h3 className="font-display text-xl text-brown-900">
        <Link href={`/layanan/${service.slug}`} className="underline-offset-4 hover:underline">
          {service.name}
        </Link>
      </h3>

      {service.description && (
        <p className="mt-2 line-clamp-3 text-sm text-brown-600">{service.description}</p>
      )}

      <div className="mt-auto pt-4">
        <PriceTag
          normalPrice={service.normalPrice}
          promoPrice={service.promoPrice}
          priceNote={service.priceNote}
        />
      </div>
    </article>
  );
}
```

- [ ] **Step 10: Tulis PackageCard**

Buat `src/components/catalog/package-card.tsx`:

```tsx
import { formatRupiah } from "@/lib/format";
import type { PackageWithItems } from "@/server/catalog";

export function PackageCard({ pkg }: { pkg: PackageWithItems }) {
  return (
    <article className="rounded-2xl border border-gold-300 bg-cream-100 p-6 shadow-sm">
      <h3 className="font-display text-2xl text-brown-900">{pkg.name}</h3>

      <p className="mt-1">
        <span className="text-xl font-semibold text-gold-600">
          {formatRupiah(pkg.monthlyPrice)}
        </span>
        <span className="text-sm text-brown-600"> / bulan</span>
      </p>

      <ul className="mt-4 space-y-1 text-sm text-brown-700">
        {pkg.items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span aria-hidden="true" className="text-gold-500">
              •
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </article>
  );
}
```

- [ ] **Step 11: Tulis ProductCard**

Buat `src/components/catalog/product-card.tsx`:

```tsx
import { formatRupiah } from "@/lib/format";
import { buildWhatsAppLink, productInquiryMessage } from "@/lib/whatsapp";

type ProductCardProps = {
  product: {
    slug: string;
    name: string;
    description?: string | null;
    price?: number | null;
  };
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-cream-300 bg-white p-5 shadow-sm">
      <h3 className="font-display text-xl text-brown-900">{product.name}</h3>

      {product.description && (
        <p className="mt-2 text-sm text-brown-600">{product.description}</p>
      )}

      <p className="mt-3 text-base font-semibold text-gold-600">
        {product.price ? formatRupiah(product.price) : "Hubungi kami untuk harga"}
      </p>

      <a
        href={buildWhatsAppLink(productInquiryMessage(product.name))}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto pt-4"
      >
        <span className="inline-block rounded-full bg-gold-500 px-5 py-2 text-sm font-medium text-white hover:bg-gold-600">
          Pesan via WhatsApp
        </span>
      </a>
    </article>
  );
}
```

- [ ] **Step 12: Jalankan seluruh uji dan pastikan LULUS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add catalog display components"
```

---

### Task 9: Halaman layanan — daftar dan detail

**Files:**
- Create: `src/app/layanan/page.tsx`
- Create: `src/app/layanan/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getServiceCategoriesWithServices`, `getServiceBySlug`, `getAllServiceSlugs` dari `@/server/catalog`; `ServiceCard`, `PriceTag`.
- Produces: rute `/layanan` dan `/layanan/[slug]`.

- [ ] **Step 1: Tulis halaman daftar layanan**

Buat `src/app/layanan/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ServiceCard } from "@/components/catalog/service-card";
import { getServiceCategoriesWithServices } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Layanan & Harga",
  description:
    "Daftar lengkap treatment SunDY Clinic Manado: facial, peeling, RF, HIFU, botox, laser, dermapen, skin booster, dan vitamin C beserta harganya.",
};

export default async function ServicesPage() {
  const categories = await getServiceCategoriesWithServices();

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Layanan & Harga</h1>
      <p className="mt-3 max-w-2xl text-brown-600">
        Seluruh treatment yang tersedia di SunDY Clinic Manado. Harga yang tercantum adalah harga
        promo yang sedang berjalan.
      </p>

      {categories.map((category) => (
        <section key={category.id} className="mt-14" aria-labelledby={`kategori-${category.slug}`}>
          <h2 id={`kategori-${category.slug}`} className="font-display text-2xl text-brown-900">
            {category.name}
          </h2>
          {category.description && (
            <p className="mt-1 text-sm text-brown-600">{category.description}</p>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {category.services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Tulis halaman detail layanan**

Buat `src/app/layanan/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceTag } from "@/components/catalog/price-tag";
import { formatPrice } from "@/lib/format";
import { buildWhatsAppLink, serviceInquiryMessage } from "@/lib/whatsapp";
import { getAllServiceSlugs, getServiceBySlug } from "@/server/catalog";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllServiceSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return { title: "Layanan tidak ditemukan" };

  return {
    title: `${service.name} — ${formatPrice(service.promoPrice, service.priceNote)}`,
    description:
      service.description ??
      `${service.name} di SunDY Clinic Manado. ${formatPrice(service.promoPrice, service.priceNote)}.`,
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <nav aria-label="Remah roti" className="text-sm text-brown-600">
        <Link href="/layanan" className="underline-offset-4 hover:underline">
          Layanan
        </Link>
        <span aria-hidden="true"> · </span>
        <span>{service.category.name}</span>
      </nav>

      <h1 className="mt-4 font-display text-4xl text-brown-900">{service.name}</h1>

      <div className="mt-4">
        <PriceTag
          normalPrice={service.normalPrice}
          promoPrice={service.promoPrice}
          priceNote={service.priceNote}
        />
      </div>

      {service.description && (
        <p className="mt-6 leading-relaxed text-brown-700">{service.description}</p>
      )}

      <dl className="mt-8 grid gap-4 rounded-2xl border border-cream-300 bg-cream-100 p-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-brown-600">Perkiraan durasi</dt>
          <dd className="mt-1 text-brown-900">{service.durationMin} menit</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-brown-600">Kategori</dt>
          <dd className="mt-1 text-brown-900">{service.category.name}</dd>
        </div>
      </dl>

      {/* Pendaftaran konsultasi daring dibangun pada Plan 3. Sampai saat itu, WhatsApp adalah jalurnya. */}
      <a
        href={buildWhatsAppLink(serviceInquiryMessage(service.name))}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-block rounded-full bg-gold-500 px-7 py-3 font-medium text-white hover:bg-gold-600"
      >
        Tanya & Daftar via WhatsApp
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Jalankan uji batasan arsitektur**

Run: `npm test -- tests/unit/architecture.test.ts`
Expected: PASS — halaman memanggil `@/server/catalog`, bukan Prisma.

- [ ] **Step 4: Periksa di peramban**

```bash
npm run dev
```

Buka `http://localhost:3000/layanan` — pastikan seluruh kategori muncul dengan layanannya. Klik "HIFU Wajah" dan pastikan `Rp 749.000` tercoret di samping `Rp 499.000`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add service catalog and detail pages"
```

---

### Task 10: Halaman program slimming

**Files:**
- Create: `src/app/program-slimming/page.tsx`

**Interfaces:**
- Consumes: `getPackagesByGroup`, `getServiceCategoriesWithServices` dari `@/server/catalog`; `PackageCard`, `ServiceCard`.
- Produces: rute `/program-slimming`.

- [ ] **Step 1: Tulis halaman program slimming**

Buat `src/app/program-slimming/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PackageCard } from "@/components/catalog/package-card";
import { ServiceCard } from "@/components/catalog/service-card";
import { CLINIC_TAGLINE } from "@/lib/clinic";
import { getPackagesByGroup, getServiceCategoriesWithServices } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Program Slimming",
  description:
    "Paket program slimming bulanan SunDY Clinic Manado: MAX, LUX, dan ACTIVE. Termasuk konsultasi dokter, Timbang BIA, dan pendampingan nutrisi.",
};

const GROUP_DESCRIPTION: Record<string, string> = {
  MAX: "Shape with Care, Transform with Confidence",
  LUX: "A More Refined Way to Reach Your Ideal Shape",
  ACTIVE: "Personalized Care for Your Best Self",
};

/** Layanan satuan program slimming, ditampilkan terpisah dari paket bulanan. */
const INDIVIDUAL_SERVICE_SLUGS = ["konsultasi-dokter", "timbang-bia", "meal-plan"];

export default async function SlimmingProgramPage() {
  const [groups, categories] = await Promise.all([
    getPackagesByGroup(),
    getServiceCategoriesWithServices(),
  ]);

  const allServices = categories.flatMap((category) => category.services);
  const individualServices = INDIVIDUAL_SERVICE_SLUGS.map((slug) =>
    allServices.find((service) => service.slug === slug),
  ).filter((service) => service !== undefined);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Program Slimming</h1>
      <p className="mt-3 max-w-2xl text-brown-600">
        {CLINIC_TAGLINE}. Setiap paket sudah termasuk konsultasi dokter dan Timbang BIA untuk
        memantau komposisi tubuh Anda dari bulan ke bulan.
      </p>

      {groups.map((group) => (
        <section key={group.groupName} className="mt-14" aria-labelledby={`paket-${group.groupName}`}>
          <h2 id={`paket-${group.groupName}`} className="font-display text-3xl text-brown-900">
            Paket {group.groupName}
          </h2>
          <p className="mt-1 text-sm italic text-brown-600">
            {GROUP_DESCRIPTION[group.groupName]}
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
        </section>
      ))}

      <section className="mt-16" aria-labelledby="layanan-satuan">
        <h2 id="layanan-satuan" className="font-display text-3xl text-brown-900">
          Layanan Satuan
        </h2>
        <p className="mt-1 text-sm text-brown-600">
          Ingin mencoba tanpa mengambil paket bulanan? Layanan berikut tersedia satuan.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {individualServices.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>

        <p className="mt-6 rounded-2xl border border-cream-300 bg-cream-100 p-5 text-sm text-brown-700">
          <strong className="font-semibold">Nutrigenomics Program</strong> — segera hadir.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Periksa di peramban**

Buka `http://localhost:3000/program-slimming`. Pastikan tiga kelompok paket muncul (MAX 3 paket, LUX 3 paket, ACTIVE 6 paket), dan LUX T ACTIVE mencantumkan **Kapsul L**.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add slimming program page"
```

---

### Task 11: Halaman produk

**Files:**
- Create: `src/app/produk/page.tsx`

**Interfaces:**
- Consumes: `getActiveProducts` dari `@/server/catalog`; `ProductCard`.
- Produces: rute `/produk`.

- [ ] **Step 1: Tulis halaman produk**

Buat `src/app/produk/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ProductCard } from "@/components/catalog/product-card";
import { CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { getActiveProducts } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Produk",
  description:
    "Produk pendukung program SunDY Clinic Manado. Pemesanan dilakukan lewat WhatsApp setelah konsultasi dokter.",
};

export default async function ProductsPage() {
  const products = await getActiveProducts();

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Produk</h1>
      <p className="mt-3 max-w-2xl text-brown-600">
        Produk berikut digunakan dalam program SunDY Clinic. Pemesanan dilakukan lewat WhatsApp di{" "}
        {CLINIC_WHATSAPP_DISPLAY}.
      </p>

      <p className="mt-6 rounded-2xl border border-gold-300 bg-cream-100 p-5 text-sm text-brown-700">
        Produk yang mengandung bahan aktif hanya diberikan sesuai anjuran dokter setelah konsultasi.
        Silakan hubungi kami untuk mengetahui produk mana yang sesuai dengan kondisi Anda.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Periksa di peramban**

Buka `http://localhost:3000/produk`. Klik "Pesan via WhatsApp" pada salah satu produk dan pastikan pesan terisi otomatis menyebut nama produk itu.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add product catalog page"
```

---

### Task 12: Halaman lokasi

**Files:**
- Create: `src/app/lokasi/page.tsx`
- Create: `src/app/lokasi/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getBranches`, `getBranchBySlug` dari `@/server/catalog`; `BranchCard`.
- Produces: rute `/lokasi` dan `/lokasi/[slug]`.

- [ ] **Step 1: Tulis halaman daftar lokasi**

Buat `src/app/lokasi/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { BranchCard } from "@/components/catalog/branch-card";
import { getBranches } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Lokasi Klinik",
  description:
    "Lokasi SunDY Clinic Manado: cabang Mahakeret Barat (Jl. Garuda No. 10) dan cabang Citraland Cluster The Manhattan yang segera hadir.",
};

export default async function LocationsPage() {
  const branches = await getBranches();

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Lokasi Klinik</h1>
      <p className="mt-3 text-brown-600">
        SunDY Clinic hadir di dua lokasi di Manado.
      </p>

      <div className="mt-10 grid gap-6">
        {branches.map((branch) => (
          <div key={branch.id}>
            <BranchCard branch={branch} />
            <Link
              href={`/lokasi/${branch.slug}`}
              className="mt-2 inline-block text-sm text-gold-600 underline-offset-4 hover:underline"
            >
              Lihat detail {branch.name}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Tulis halaman detail lokasi**

Buat `src/app/lokasi/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BranchCard } from "@/components/catalog/branch-card";
import { getBranchBySlug, getBranches } from "@/server/catalog";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const branches = await getBranches();
  return branches.map((branch) => ({ slug: branch.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  if (!branch) return { title: "Lokasi tidak ditemukan" };

  const status = branch.status === "AKTIF" ? "Buka" : "Segera hadir";
  return {
    title: branch.name,
    description: `${branch.name} — ${branch.address}. ${status}. ${branch.openingHours}.`,
  };
}

export default async function BranchDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  if (!branch) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <BranchCard branch={branch} />
    </div>
  );
}
```

- [ ] **Step 3: Periksa di peramban**

Buka `http://localhost:3000/lokasi`. Pastikan Mahakeret tampil normal dan Citraland tampil dengan lencana "Segera Hadir" serta tombol "Beri tahu saya saat buka" — bukan tombol petunjuk arah.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add branch location pages"
```

---

### Task 13: Beranda

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getSignatureServices`, `getBranches` dari `@/server/catalog`; `ServiceCard`, `BranchCard`.
- Produces: rute `/`.

- [ ] **Step 1: Tulis beranda**

Ganti seluruh isi `src/app/page.tsx`:

```tsx
import Link from "next/link";
import { BranchCard } from "@/components/catalog/branch-card";
import { ServiceCard } from "@/components/catalog/service-card";
import {
  CLINIC_BEAUTY_TAGLINE,
  CLINIC_FULL_NAME,
  CLINIC_TAGLINE,
  CLOSED_NOTE,
  OPENING_HOURS,
} from "@/lib/clinic";
import { getBranches, getSignatureServices } from "@/server/catalog";

/** Empat nilai jual dari materi promosi klinik. */
const VALUE_PROPS = [
  { title: "Professional Treatment", body: "Ditangani dokter dan terapis berpengalaman." },
  { title: "Premium Technology", body: "Peralatan modern untuk hasil yang optimal." },
  { title: "Safe & Hygienic", body: "Prosedur dan alat yang steril serta terkontrol." },
  { title: "Beauty For You", body: "Perawatan yang disesuaikan dengan kondisi Anda." },
];

export default async function HomePage() {
  const [signatureServices, branches] = await Promise.all([
    getSignatureServices(),
    getBranches(),
  ]);

  return (
    <>
      <section className="bg-gradient-to-b from-cream-100 to-cream-50 px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-5xl text-brown-900">{CLINIC_FULL_NAME}</h1>
          <p className="mt-4 text-lg text-brown-700">{CLINIC_TAGLINE}</p>
          <p className="mt-1 text-lg text-brown-700">{CLINIC_BEAUTY_TAGLINE}</p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/layanan"
              className="rounded-full bg-gold-500 px-7 py-3 font-medium text-white hover:bg-gold-600"
            >
              Lihat Layanan & Harga
            </Link>
            <Link
              href="/program-slimming"
              className="rounded-full border border-gold-500 px-7 py-3 font-medium text-gold-600 hover:bg-cream-100"
            >
              Program Slimming
            </Link>
          </div>

          <p className="mt-8 text-sm text-brown-600">
            {OPENING_HOURS} · {CLOSED_NOTE}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="keunggulan">
        <h2 id="keunggulan" className="sr-only">
          Keunggulan klinik
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.title} className="rounded-2xl border border-cream-300 bg-white p-6">
              <h3 className="font-display text-xl text-brown-900">{prop.title}</h3>
              <p className="mt-2 text-sm text-brown-600">{prop.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="signature">
        <h2 id="signature" className="font-display text-3xl text-brown-900">
          Our Signature Treatment
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {signatureServices.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
        <Link
          href="/layanan"
          className="mt-6 inline-block text-sm text-gold-600 underline-offset-4 hover:underline"
        >
          Lihat seluruh layanan
        </Link>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-20" aria-labelledby="lokasi">
        <h2 id="lokasi" className="font-display text-3xl text-brown-900">
          Lokasi Kami
        </h2>
        <div className="mt-6 grid gap-6">
          {branches.map((branch) => (
            <BranchCard key={branch.id} branch={branch} />
          ))}
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Jalankan seluruh uji dan pastikan LULUS**

Run: `npm test`
Expected: PASS — termasuk uji batasan arsitektur.

- [ ] **Step 3: Periksa di peramban**

Buka `http://localhost:3000`. Pastikan empat layanan signature muncul (Peeling, RF Wajah, HIFU Wajah, Skin Booster DNA Salmon) dan kedua cabang tampil dengan status yang benar.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add homepage"
```

---

### Task 14: Halaman pendukung & SEO

**Files:**
- Create: `src/app/tentang/page.tsx`
- Create: `src/app/faq/page.tsx`
- Create: `src/app/kebijakan-privasi/page.tsx`
- Create: `src/app/syarat-ketentuan/page.tsx`
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`
- Modify: `.env.example`, `.env`

**Interfaces:**
- Consumes: `getActiveDoctors`, `getAllServiceSlugs`, `getBranches` dari `@/server/catalog`.
- Produces: rute `/tentang`, `/faq`, `/kebijakan-privasi`, `/syarat-ketentuan`, `/sitemap.xml`, `/robots.txt`. Variabel lingkungan `NEXT_PUBLIC_SITE_URL`.

- [ ] **Step 1: Tambahkan URL situs ke lingkungan**

Tambahkan baris ini ke `.env.example` dan `.env`:

```
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

Saat tayang, isi dengan domain sebenarnya (lihat keputusan D6 pada PRD).

- [ ] **Step 2: Tulis halaman tentang**

Buat `src/app/tentang/page.tsx`:

```tsx
import type { Metadata } from "next";
import {
  CLINIC_BEAUTY_TAGLINE,
  CLINIC_FULL_NAME,
  CLINIC_TAGLINE,
  CLOSED_NOTE,
  OPENING_HOURS,
} from "@/lib/clinic";
import { getActiveDoctors } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Tentang Kami",
  description:
    "SunDY — Nutrition, Slimming & Wellness Clinic Manado. Program penurunan berat badan dan perawatan estetika yang ditangani dokter.",
};

export default async function AboutPage() {
  const doctors = await getActiveDoctors();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Tentang {CLINIC_FULL_NAME}</h1>

      <p className="mt-6 leading-relaxed text-brown-700">
        SunDY Clinic adalah klinik nutrisi, slimming, dan wellness di Manado. Kami memadukan program
        penurunan berat badan yang diawasi dokter dengan perawatan estetika, sehingga perubahan yang
        Anda capai terlihat sekaligus terasa. {CLINIC_TAGLINE}. {CLINIC_BEAUTY_TAGLINE}.
      </p>

      <p className="mt-4 leading-relaxed text-brown-700">
        Setiap program dimulai dari konsultasi dan Timbang BIA untuk mengetahui komposisi tubuh Anda
        — bukan sekadar angka di timbangan — agar rencana yang disusun benar-benar sesuai kondisi Anda.
      </p>

      <section className="mt-12" aria-labelledby="tim-dokter">
        <h2 id="tim-dokter" className="font-display text-2xl text-brown-900">
          Tim Dokter
        </h2>

        <div className="mt-6 grid gap-5">
          {doctors.map((doctor) => (
            <article key={doctor.id} className="rounded-2xl border border-cream-300 bg-white p-6">
              <h3 className="font-display text-xl text-brown-900">{doctor.name}</h3>
              {doctor.specialty && (
                <p className="mt-1 text-sm text-gold-600">{doctor.specialty}</p>
              )}
              {doctor.bio && <p className="mt-3 text-sm text-brown-600">{doctor.bio}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="jam-praktik">
        <h2 id="jam-praktik" className="font-display text-2xl text-brown-900">
          Jam Praktik
        </h2>
        <p className="mt-3 text-brown-700">{OPENING_HOURS}</p>
        <p className="text-brown-600">{CLOSED_NOTE}</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Tulis halaman FAQ**

Buat `src/app/faq/page.tsx`:

```tsx
import type { Metadata } from "next";
import { CLINIC_WHATSAPP_DISPLAY, CLOSED_NOTE, OPENING_HOURS } from "@/lib/clinic";

export const metadata: Metadata = {
  title: "Tanya Jawab",
  description: "Pertanyaan yang sering diajukan tentang layanan dan program di SunDY Clinic Manado.",
};

const faqs = [
  {
    question: "Bagaimana cara mendaftar konsultasi?",
    answer: `Untuk saat ini pendaftaran dilakukan lewat WhatsApp di ${CLINIC_WHATSAPP_DISPLAY}. Pendaftaran mandiri lewat situs dengan pilihan jadwal akan segera tersedia.`,
  },
  {
    question: "Apa itu Timbang BIA?",
    answer:
      "BIA (Bioelectrical Impedance Analysis) mengukur komposisi tubuh Anda: berat badan, massa lemak, massa otot, lemak visceral, dan kadar air. Angka-angka inilah yang dipakai dokter untuk menyusun dan mengevaluasi program Anda.",
  },
  {
    question: "Apakah harus konsultasi dulu sebelum treatment?",
    answer:
      "Ya. Konsultasi dokter diperlukan agar treatment yang dipilih sesuai dengan kondisi kulit dan kesehatan Anda, serta aman untuk dijalani.",
  },
  {
    question: "Berapa jam operasional klinik?",
    answer: `${OPENING_HOURS}. ${CLOSED_NOTE}.`,
  },
  {
    question: "Apakah harga yang tercantum sudah final?",
    answer:
      "Harga yang tercantum adalah harga promo yang sedang berjalan dan dapat berubah. Untuk treatment tertentu, jumlah sesi dan dosis ditentukan setelah konsultasi.",
  },
  {
    question: "Kapan cabang Citraland buka?",
    answer:
      "Cabang SunDY Citraland di Cluster The Manhattan sedang dipersiapkan. Hubungi kami lewat WhatsApp agar kami kabari saat sudah buka.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Tanya Jawab</h1>

      <dl className="mt-10 space-y-8">
        {faqs.map((faq) => (
          <div key={faq.question} className="border-b border-cream-300 pb-8 last:border-0">
            <dt className="font-display text-xl text-brown-900">{faq.question}</dt>
            <dd className="mt-2 leading-relaxed text-brown-700">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 4: Tulis kebijakan privasi**

Buat `src/app/kebijakan-privasi/page.tsx`:

```tsx
import type { Metadata } from "next";
import { CLINIC_FULL_NAME, CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description: `Kebijakan privasi ${CLINIC_FULL_NAME} sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.`,
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Kebijakan Privasi</h1>

      <div className="mt-8 space-y-6 leading-relaxed text-brown-700">
        <p>
          {CLINIC_FULL_NAME} menghormati privasi Anda. Kebijakan ini menjelaskan data apa yang kami
          kumpulkan, untuk apa digunakan, dan hak Anda atas data tersebut, sesuai Undang-Undang
          Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.
        </p>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Data yang kami kumpulkan</h2>
          <p className="mt-2">
            Situs ini menampilkan informasi layanan dan tidak mengumpulkan data pribadi secara
            otomatis. Data pribadi Anda kami terima hanya ketika Anda menghubungi kami lewat
            WhatsApp atau datang ke klinik, berupa nama, nomor kontak, usia, jenis kelamin, dan
            informasi kesehatan yang Anda sampaikan kepada dokter.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Data kesehatan</h2>
          <p className="mt-2">
            Informasi kesehatan tergolong data pribadi bersifat spesifik. Data ini hanya diakses oleh
            dokter dan tenaga klinik yang berwenang, digunakan semata-mata untuk pelayanan kesehatan
            Anda, dan disimpan sesuai ketentuan Peraturan Menteri Kesehatan Nomor 24 Tahun 2022
            tentang Rekam Medis.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Penggunaan data</h2>
          <p className="mt-2">
            Data Anda digunakan untuk menjadwalkan kunjungan, memberikan pelayanan medis, dan
            menghubungi Anda terkait perawatan. Kami tidak menjual data Anda dan tidak membagikannya
            kepada pihak ketiga untuk kepentingan pemasaran.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Hak Anda</h2>
          <p className="mt-2">
            Anda berhak mengetahui data apa yang kami simpan tentang Anda, meminta koreksi bila ada
            yang keliru, dan menarik persetujuan atas pemrosesan data non-medis. Rekam medis sendiri
            wajib kami simpan selama jangka waktu yang ditetapkan peraturan dan tidak dapat dihapus
            atas permintaan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Menghubungi kami</h2>
          <p className="mt-2">
            Pertanyaan mengenai kebijakan ini dapat disampaikan lewat WhatsApp {CLINIC_WHATSAPP_DISPLAY}.
          </p>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Tulis syarat & ketentuan**

Buat `src/app/syarat-ketentuan/page.tsx`:

```tsx
import type { Metadata } from "next";
import { CLINIC_FULL_NAME, CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan",
  description: `Syarat dan ketentuan layanan ${CLINIC_FULL_NAME}.`,
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Syarat & Ketentuan</h1>

      <div className="mt-8 space-y-6 leading-relaxed text-brown-700">
        <section>
          <h2 className="font-display text-2xl text-brown-900">Informasi di situs ini</h2>
          <p className="mt-2">
            Keterangan mengenai treatment di situs ini bersifat informasi umum dan bukan pengganti
            konsultasi medis. Tindakan yang sesuai untuk Anda ditentukan dokter setelah pemeriksaan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Harga</h2>
          <p className="mt-2">
            Harga yang tercantum adalah harga promo yang berlaku saat halaman ini ditampilkan dan
            dapat berubah sewaktu-waktu. Jumlah sesi, dosis, dan harga akhir untuk sebagian treatment
            ditentukan setelah konsultasi.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Hasil perawatan</h2>
          <p className="mt-2">
            Hasil setiap treatment berbeda pada tiap orang, bergantung pada kondisi tubuh, kepatuhan
            menjalani program, dan faktor lain. Kami tidak menjanjikan hasil yang seragam.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Janji temu</h2>
          <p className="mt-2">
            Janji temu dibuat melalui WhatsApp {CLINIC_WHATSAPP_DISPLAY}. Mohon memberi tahu kami
            sesegera mungkin bila Anda berhalangan hadir agar jadwal dapat diberikan kepada pasien lain.
          </p>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Tulis peta situs**

Buat `src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { getAllServiceSlugs, getBranches } from "@/server/catalog";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [serviceSlugs, branches] = await Promise.all([getAllServiceSlugs(), getBranches()]);

  const staticRoutes = [
    "",
    "/layanan",
    "/program-slimming",
    "/produk",
    "/lokasi",
    "/tentang",
    "/faq",
    "/kebijakan-privasi",
    "/syarat-ketentuan",
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${BASE_URL}${route}`,
      lastModified: new Date(),
    })),
    ...serviceSlugs.map((slug) => ({
      url: `${BASE_URL}/layanan/${slug}`,
      lastModified: new Date(),
    })),
    ...branches.map((branch) => ({
      url: `${BASE_URL}/lokasi/${branch.slug}`,
      lastModified: branch.updatedAt,
    })),
  ];
}
```

- [ ] **Step 7: Tulis robots.txt**

Buat `src/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Panel admin dibangun pada Plan 2; jalurnya ditutup dari mesin pencari sejak sekarang.
      disallow: ["/admin"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 8: Periksa peta situs di peramban**

Buka `http://localhost:3000/sitemap.xml` dan pastikan seluruh URL layanan muncul. Buka `http://localhost:3000/robots.txt` dan pastikan barisnya benar.

- [ ] **Step 9: Jalankan seluruh uji dan pastikan LULUS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add supporting pages, sitemap, and robots"
```

---

### Task 15: Uji ujung-ke-ujung situs publik

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/public-site.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: seluruh rute publik dari Task 9–14.
- Produces: perintah `npm run test:e2e`.

- [ ] **Step 1: Pasang Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Buat konfigurasi Playwright**

Buat `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Mayoritas pengunjung datang dari Instagram di HP — alur ini harus diuji di lebar ponsel.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Tulis uji ujung-ke-ujung**

Buat `tests/e2e/public-site.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("beranda menampilkan identitas klinik dan layanan signature", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("SunDY");
  await expect(page.getByRole("heading", { name: "Our Signature Treatment" })).toBeVisible();
});

test("pengunjung dapat menelusuri dari beranda ke detail layanan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Lihat Layanan & Harga" }).click();
  await expect(page).toHaveURL(/\/layanan$/);

  await page.getByRole("link", { name: "HIFU Wajah" }).first().click();
  await expect(page).toHaveURL(/\/layanan\/hifu-wajah$/);
  await expect(page.getByText("Rp 749.000")).toBeVisible();
  await expect(page.getByText("Rp 499.000")).toBeVisible();
});

test("halaman program slimming menampilkan ketiga kelompok paket", async ({ page }) => {
  await page.goto("/program-slimming");
  await expect(page.getByRole("heading", { name: "Paket MAX" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paket LUX" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paket ACTIVE" })).toBeVisible();
});

test("cabang Citraland ditandai segera hadir dan tidak menawarkan petunjuk arah", async ({ page }) => {
  await page.goto("/lokasi/citraland");
  await expect(page.getByText("Segera Hadir")).toBeVisible();
  await expect(page.getByRole("link", { name: /beri tahu saya saat buka/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /petunjuk arah/i })).toHaveCount(0);
});

test("tombol WhatsApp mengambang tersedia di seluruh halaman", async ({ page }) => {
  for (const path of ["/", "/layanan", "/produk", "/lokasi", "/faq"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: /chat via whatsapp/i })).toBeVisible();
  }
});

test("halaman produk menautkan ke WhatsApp dengan nama produk terisi", async ({ page }) => {
  await page.goto("/produk");
  const link = page.getByRole("link", { name: "Pesan via WhatsApp" }).first();
  const href = await link.getAttribute("href");
  expect(href).toContain("wa.me/6285172228900");
  expect(decodeURIComponent(href ?? "")).toContain("Kapsul M");
});

test("tidak ada guliran horizontal di lebar ponsel", async ({ page }) => {
  await page.goto("/");
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});
```

- [ ] **Step 4: Tambahkan skrip e2e ke package.json**

```json
"test:e2e": "playwright test"
```

- [ ] **Step 5: Jalankan uji dan pastikan LULUS**

Pastikan basis data pengembangan sudah berisi data awal:

```bash
npm run db:seed && npm run test:e2e
```

Expected: PASS pada proyek `desktop` maupun `mobile`.

Bila uji pertama gagal karena waktu tunggu, jalankan ulang: Neon menidurkan basis data yang menganggur dan kueri pertama setelah itu butuh sekitar satu detik untuk membangunkannya.

- [ ] **Step 6: Pastikan build produksi berhasil**

Run: `npm run build`
Expected: build selesai tanpa galat tipe maupun galat lint.

- [ ] **Step 7: Perbarui README**

Tambahkan bagian berikut ke `README.md` di bawah judul `## Status`, menggantikan kalimat "Tahap perancangan. Kode aplikasi belum ditulis.":

```markdown
Plan 1 selesai — situs publik berjalan. Panel admin, booking, dan rekam medis belum dibangun.

## Menjalankan secara lokal

Butuh Node 20+ dan satu proyek [Neon](https://console.neon.tech) (paket gratis, region
`ap-southeast-1`) berisi dua basis data: `sundy_dev` dan `sundy_test`.

```bash
cp .env.example .env   # lalu isi connection string dari Neon
npm install
npm run db:migrate     # terapkan skema
npm run db:seed        # muat katalog layanan
npm run dev            # http://localhost:3000
```

Basis data uji disiapkan sekali saja:

```bash
npx dotenv -e .env -v DATABASE_URL=$TEST_DATABASE_URL -v DIRECT_URL=$TEST_DIRECT_URL -- prisma migrate deploy
```

## Pengujian

```bash
npm test               # uji unit & komponen
npm run test:integration  # uji terhadap basis data uji
npm run test:e2e       # uji ujung-ke-ujung Playwright
```
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: add end-to-end coverage for public site"
```

---

### Task 16: Deploy ke Vercel

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: seluruh aplikasi dari Task 1–15; proyek Neon dari Task 2.
- Produces: situs publik yang tayang di URL Vercel, membaca basis data `sundy_dev` di Neon.

> Basis data yang sama dipakai untuk pengembangan dan situs tayang selama Plan 1. Ini dapat diterima karena Plan 1 tidak menulis apa pun ke basis data dan belum ada data pasien. **Sebelum Plan 3 tayang, basis data produksi wajib dipisahkan** — begitu booking pasien masuk, menjalankan `db:reset` saat pengembangan akan menghapus data asli.

- [ ] **Step 1: Pastikan kode sudah terdorong ke GitHub**

```bash
git push -u origin main
```

Expected: branch `main` terlihat di `https://github.com/Marchelinoraco/sundy-clinic`.

- [ ] **Step 2: Hubungkan repositori ke Vercel**

Di [vercel.com](https://vercel.com): **Add New → Project → Import** repositori `sundy-clinic`. Framework akan terdeteksi sebagai Next.js; biarkan seluruh pengaturan build apa adanya.

- [ ] **Step 3: Isi variabel lingkungan di Vercel**

Sebelum menekan Deploy, buka **Environment Variables** dan isikan tiga variabel untuk lingkungan **Production** dan **Preview**:

| Nama | Nilai |
|---|---|
| `DATABASE_URL` | connection string **pooled** Neon untuk `sundy_dev` |
| `DIRECT_URL` | connection string **langsung** Neon untuk `sundy_dev` |
| `NEXT_PUBLIC_SITE_URL` | URL yang diberikan Vercel, misal `https://sundy-clinic.vercel.app` |

`TEST_DATABASE_URL` dan `TEST_DIRECT_URL` **tidak** diisikan ke Vercel — keduanya hanya untuk pengujian lokal.

- [ ] **Step 4: Deploy dan periksa hasilnya**

Tekan **Deploy**. Setelah selesai, buka URL yang diberikan dan periksa:
- Beranda tampil dengan empat layanan signature
- `/layanan` menampilkan seluruh kategori
- `/layanan/hifu-wajah` menampilkan `Rp 749.000` tercoret dan `Rp 499.000`
- `/lokasi` menampilkan Citraland sebagai "Segera Hadir"
- `/sitemap.xml` memakai domain Vercel, bukan `localhost`

Bila build gagal dengan galat klien Prisma, pastikan skrip `build` di `package.json` berbunyi `prisma generate && next build` (Task 2 Step 9).

- [ ] **Step 5: Perbarui NEXT_PUBLIC_SITE_URL bila domain sudah ada**

Bila domain klinik sudah dibeli (keputusan D6 pada PRD), tambahkan di **Settings → Domains**, lalu ubah `NEXT_PUBLIC_SITE_URL` ke domain itu dan deploy ulang agar peta situs menunjuk ke alamat yang benar.

- [ ] **Step 6: Catat URL tayang di README**

Tambahkan di bawah judul `# SunDY Clinic` pada `README.md`:

```markdown
Situs publik: <URL Vercel atau domain klinik>
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: record deployed site URL"
git push
```

---

## Definisi Selesai untuk Plan 1

- [ ] `npm test` lulus seluruhnya
- [ ] `npm run test:integration` lulus seluruhnya
- [ ] `npm run test:e2e` lulus pada proyek desktop dan mobile
- [ ] `npm run build` berhasil tanpa galat
- [ ] Setiap harga pada PRD Lampiran A & B muncul benar di situs
- [ ] Cabang Citraland tampil "Segera Hadir" dan tidak dapat diarahkan
- [ ] Tidak ada berkas di `src/app` yang mengimpor Prisma langsung
- [ ] Tidak ada guliran horizontal di lebar ponsel
- [ ] Situs tayang di Vercel dan membaca data dari Neon
- [ ] `.env` tidak pernah masuk ke riwayat git

## Yang Sengaja Tidak Dikerjakan di Plan 1

Hal-hal berikut disebut PRD tetapi bukan bagian plan ini — jangan kerjakan lebih awal:

- Pendaftaran konsultasi, kalender slot, penahanan slot → **Plan 3**
- Panel admin, autentikasi, manajemen konten → **Plan 2**
- Rekam medis, SOAP, BIA, grafik progres, audit log, pengingat kontrol mingguan (F17) → **Plan 4**
- Unggah gambar ke Cloudinary — kolom `imageUrl` sudah ada di skema tetapi belum diisi; kartu layanan tampil tanpa foto di Plan 1
- Isi FAQ masih ditulis langsung di dalam kode. FAQ yang dapat disunting pemilik dibangun bersama manajemen konten di **Plan 2**
- Pemisahan basis data produksi dari basis data pengembangan → wajib sebelum **Plan 3** tayang
- Pemindahan hosting ke VPS Indonesia → keputusan menjelang go-live komersial; lihat catatan lisensi Vercel Hobby pada PRD bagian 11
