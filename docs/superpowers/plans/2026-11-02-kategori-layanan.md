# Kelola Kategori Layanan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin (Super Admin, Admin Keuangan) menambah, mengubah, mengurutkan, memberi foto, dan menghapus kategori layanan dari Layanan & Harga; sakelar per kategori menentukan apakah layanannya boleh dipilih sendiri pasien di /daftar; dialog paket menyebut isinya "Layanan".

**Architecture:** `ServiceCategory` mendapat kolom `imageUrl` dan `selfBookable`, nama unik tanpa beda huruf besar-kecil, dan relasi ke `Service`/`SiteService` menjadi Restrict. Aturan murni (validasi, slug, alamat foto) di `src/lib/service-category.ts`; aksi server di `src/server/service-category-admin.ts`; foto memakai penyimpanan foto publik yang sudah ada (folder baru `kategori`). Booking situs membaca `category.selfBookable` sebagai pengganti `SLIMMING_CATEGORY_SLUG`.

**Tech Stack:** Next.js 15 server actions + route handlers, Prisma 7 + PostgreSQL (migrasi SQL manual), MUI, sharp, Vitest (unit + integrasi), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-kategori-layanan-design.md`

**Sebelum Task 1:** buat branch `kategori-layanan` dari `main`, lalu commit spec dan rencana ini (`docs: kategori layanan spec and plan`).

## Global Constraints

- **Hak:** semua aksi dan rute kategori memakai `catalog:manage` (Admin Keuangan, Super Admin).
- **Nama:** wajib, satu baris (spasi dirapatkan), paling banyak `CATEGORY_NAME_MAX = 60` karakter, unik tanpa membedakan huruf besar-kecil (indeks `service_category_name_lower`). **Deskripsi:** opsional, paling banyak `CATEGORY_DESCRIPTION_MAX = 200` karakter; kosong disimpan `null`.
- **Pesan (persis):** "Isi nama kategori." · "Nama kategori paling banyak 60 karakter." · "Deskripsi paling banyak 200 karakter." · "Kategori dengan nama ini sudah ada." · "Kategori tidak ditemukan." · "Kategori ini masih berisi {X} layanan internal dan {Y} layanan situs. Pindahkan dulu ke kategori lain lewat tombol Ubah pada layanannya." · "Kategori ini berisi Konsultasi Online dan tidak bisa dihapus." · data rusak: "Data tidak sah. Muat ulang halaman lalu coba lagi."
- **Slug:** `slugify(nama)` dipotong 60 karakter tanpa tanda hubung di ujung; kosong → `kategori`; bila sudah dipakai → akhiran `-2`, `-3`, …. Dibuat sekali saat tambah, tidak pernah diubah.
- **Urutan:** kategori baru = `max(sortOrder) + 1`. Naik/turun menulis ulang urutan semua kategori menjadi 1..n dalam satu transaksi (aman bila ada nilai kembar). Naik pada yang pertama / turun pada yang terakhir = tidak berubah, tanpa galat.
- **Terkunci:** kategori yang berisi layanan ber-slug `ONLINE_SERVICE_SLUG` (Konsultasi Online; dalam data nyata: Slimming & Wellness) tidak punya tombol Hapus dan ditolak server.
- **Sakelar:** label "Pasien boleh memilih sendiri di situs"; teks bantuan (persis): "Bila tidak dicentang, layanan di kategori ini tidak ditawarkan saat pasien lama Aesthetic memilih treatment sendiri di situs. Layanan tetap bisa dipakai di Booking Baru, tagihan, resep, dan paket." Tanda di daftar bila mati: "Tidak dipesan sendiri". Nilai awal: `true`; migrasi dan seed: `false` untuk slug `slimming`.
- **Foto:** sama seperti foto layanan situs (≤ 8 MB, JPG/PNG/WebP → WebP lewat `processPublicPhoto`). Disimpan di folder `kategori`; `imageUrl = "/foto-kategori/<nama>"`. Urutan foto kartu: foto layanan situs → foto kategori unggahan → `CATEGORY_IMAGES[slug]` → `FALLBACK_IMAGE`; teks alternatif foto kategori = nama kategori.
- **Audit:** `service_category.create` "menambah kategori layanan", `service_category.update` "mengubah kategori layanan", `service_category.move` "mengubah urutan kategori layanan", `service_category.delete` "menghapus kategori layanan", `service_category.photo` "mengganti foto kategori layanan".
- **Label paket:** "+ Treatment" → "+ Layanan"; label isi "Treatment" → "Layanan" (aria `Layanan {n}`, `Hapus layanan {n}`); "Pilih treatment dari katalog layanan." → "Pilih layanan dari katalog."; catatan "biaya treatment + harga beli barang" → "biaya layanan + harga beli barang"; "Treatment tidak ditemukan atau nonaktif." → "Layanan tidak ditemukan atau nonaktif."; "Treatment yang sama tidak boleh dua kali." → "Layanan yang sama tidak boleh dua kali."

## Review Focus

1. **Kategori yang "terlihat kosong" tetapi berisi layanan nonaktif atau layanan situs tersembunyi** → hapus ditolak dengan hitungan yang benar, tidak ada yang terhapus. Tes: Task 2.
2. **Mengganti nama ke nama yang sama dengan beda huruf** ("facial treatment") → ditolak bila milik kategori lain, diterima bila milik kategori itu sendiri (ganti besar-kecil huruf). Tes: Task 2.
3. **Nama tanpa huruf/angka ("✨✨") atau nama yang slug-nya sudah dipakai** → kategori tetap dibuat dengan slug `kategori` / berakhiran `-2`. Tes: Task 1 (unit) dan Task 2.
4. **Permintaan booking situs yang dirakit sendiri untuk layanan di kategori bersakelar mati** → ditolak server dengan pesan Konsultasi Dokter. Tes: Task 4.
5. **Foto kategori lama setelah diganti atau kategorinya dihapus** → rute publik 404 dan berkasnya hilang dari disk. Tes: Task 3.

---

### Task 1: Data dan aturan murni kategori

**Files:**
- Modify: `prisma/schema.prisma` (`ServiceCategory.imageUrl String?`, `ServiceCategory.selfBookable Boolean @default(true)` dengan komentar KL14; `onDelete: Restrict` pada `Service.category` dan `SiteService.category`; komentar indeks `service_category_name_lower` seperti `ExpenseCategory`)
- Create: `prisma/migrations/20261102090000_kategori_layanan/migration.sql`
- Modify: `prisma/seed.ts` (slimming `selfBookable: false`; upsert kategori `update: {}`)
- Create: `src/lib/service-category.ts`
- Modify: `tests/integration/schema.test.ts` (tes "menghapus layanan saat kategorinya dihapus" diganti), `tests/integration/appointment.test.ts:53,109` (hapus layanan kategori uji sebelum kategorinya)
- Test: `tests/unit/service-category.test.ts`, `tests/unit/migrations.test.ts`, `tests/integration/schema.test.ts`

**Interfaces:**
- Produces (di `src/lib/service-category.ts`, murni, tanpa impor server):
  - `CATEGORY_NAME_MAX = 60`, `CATEGORY_DESCRIPTION_MAX = 200`, `CATEGORY_PHOTO_PATH_PREFIX = "/foto-kategori/"`
  - `type ServiceCategoryInput = { name: string; description: string | null; selfBookable: boolean }`
  - `validateServiceCategory(raw: unknown): Validation<ServiceCategoryInput>` (`Validation` dari `src/lib/stock.ts`)
  - `categorySlugBase(name: string): string`; `nextFreeSlug(base: string, taken: readonly string[]): string`
  - `categoryPhotoUrl(name: string): string`; `categoryPhotoName(url: string | null | undefined): string | null` (sah hanya bila cocok `DOCTOR_PHOTO_NAME`, seperti `siteServicePhotoName`)

- [ ] **Step 1: Write the failing tests:**
  - Unit `validateServiceCategory`: `{ name: "  Hair   Treatment ", description: "", selfBookable: true }` → `{ name: "Hair Treatment", description: null, selfBookable: true }`; nama kosong → "Isi nama kategori."; 61 karakter → "Nama kategori paling banyak 60 karakter."; deskripsi 201 karakter → "Deskripsi paling banyak 200 karakter."; `selfBookable` bukan boolean → pesan data tidak sah.
  - Unit slug: `categorySlugBase("Hair & Scalp")` = `"hair-scalp"`; `categorySlugBase("✨✨")` = `"kategori"`; `nextFreeSlug("facial", ["facial", "facial-2"])` = `"facial-3"`; `nextFreeSlug("hair", ["facial"])` = `"hair"`.
  - Unit foto: `categoryPhotoName(categoryPhotoUrl("cat1-0123abcd.webp"))` = `"cat1-0123abcd.webp"`; `null` untuk `"/foto-kategori/../x.webp"`, `"/foto-layanan/cat1-0123abcd.webp"`, `null`.
  - Migrasi (`tests/unit/migrations.test.ts`, describe "migrasi kategori layanan"): SQL tidak memuat `DROP COLUMN`/`DROP TABLE`; memuat `UPDATE "ServiceCategory" SET "selfBookable" = false WHERE "slug" = 'slimming'`, indeks `service_category_name_lower`, dan `ON DELETE RESTRICT` untuk kedua relasi.
  - Integrasi `schema.test.ts`: `"menolak menghapus kategori yang masih berisi layanan"` — `serviceCategory.delete` melempar galat dan layanan tetap ada; `"nama kategori unik tanpa membedakan huruf besar-kecil"` — membuat "Laser" lalu "laser" melempar galat unik.
- [ ] **Step 2: Run** `npx vitest run tests/unit/service-category.test.ts tests/unit/migrations.test.ts` dan `npm run test:integration -- tests/integration/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Hasilkan SQL relasi dan kolom dengan `prisma migrate diff`, lalu tambahkan sendiri `UPDATE … 'slimming'` dan `CREATE UNIQUE INDEX service_category_name_lower ON "ServiceCategory" (lower("name"));`. Seed: `categories` slimming `selfBookable: false`; upsert kategori `update: {}` (seed hanya untuk lokal; deploy hanya `migrate deploy`).
- [ ] **Step 4: Run** `npm run db:migrate:test`, the tests di atas, `npm run test:integration -- tests/integration/appointment.test.ts tests/integration/seed.test.ts tests/integration/catalog.test.ts`, dan `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (kode 0). Expected: PASS.
- [ ] **Step 5: Commit** `feat: service category photo, self-booking flag, and safe delete in schema`

### Task 2: Aksi server kategori

**Files:**
- Create: `src/server/service-category-admin.ts` (`"use server"`)
- Modify: `src/server/catalog-admin-read.ts` (`listServiceCategoryRows`), `src/lib/audit-labels.ts` (lima label Global Constraints)
- Test: `tests/integration/service-category-admin.test.ts` (pola mock sesi dan `revalidate` seperti `tests/integration/site-service-admin.test.ts`), `tests/unit/audit-labels.test.ts` (tes baru: kelima aksi `service_category.*` punya label persis Global Constraints)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `type ServiceCategoryRow = { id: string; name: string; description: string | null; imageUrl: string | null; selfBookable: boolean; serviceCount: number; siteServiceCount: number; locked: boolean }`
  - `listServiceCategoryRows(): Promise<ServiceCategoryRow[]>` — semua kategori menurut `sortOrder`, lalu nama; hitungan memasukkan layanan nonaktif dan layanan situs tersembunyi; `locked` = berisi layanan `ONLINE_SERVICE_SLUG`.
  - `createServiceCategory(input: ServiceCategoryInput): Promise<ActionResult<{ id: string }>>`
  - `updateServiceCategory(input: { id: string } & ServiceCategoryInput): Promise<ActionResult>`
  - `moveServiceCategory(input: { id: string; direction: "up" | "down" }): Promise<ActionResult>`
  - `deleteServiceCategory(id: string): Promise<ActionResult>`

- [ ] **Step 1: Write the failing tests** (`describe("kelola kategori layanan (spec kategori layanan)")`):
  - `"menambah kategori di urutan terakhir dengan slug dari nama; tercatat di audit (KL3, KL4, KL5)"` — slug `nextFreeSlug`, `sortOrder` = maks + 1, audit `service_category.create` summary = nama.
  - `"nama kembar beda huruf ditolak; ganti besar-kecil huruf nama sendiri boleh (Review Focus 2)"`.
  - `"nama tanpa huruf memakai slug kategori; slug terpakai diberi akhiran (Review Focus 3)"`.
  - `"mengubah nama, deskripsi, dan sakelar tanpa mengubah slug; audit menyebut perubahan sakelar (KL5, KL12)"` — summary memuat `"pasien boleh memilih sendiri: ya → tidak"` bila sakelar berubah.
  - `"naik/turun menukar posisi; ujung daftar tidak berubah; urutan kembar ditulis ulang 1..n (KL4)"`.
  - `"hapus ditolak selama berisi layanan internal nonaktif atau layanan situs tersembunyi; kosong terhapus (KL6, Review Focus 1)"` — pesan persis dengan hitungan; setelah layanan dipindah, hapus berhasil + audit `service_category.delete`.
  - `"kategori berisi Konsultasi Online tidak bisa dihapus (KL8)"`.
  - `"listServiceCategoryRows menghitung semua isi dan menandai kategori terkunci"`.
  - `"Resepsionis tidak boleh (catalog:manage)"` — setiap aksi melempar `forbidden: catalog:manage`.
- [ ] **Step 2: Run** `npm run test:integration -- tests/integration/service-category-admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Ikuti pola `src/server/site-service-admin.ts` (`runAction`, `requireCapability`, `UserFacingError`, `isUniqueViolation` → "Kategori dengan nama ini sudah ada."). Slug dihitung dari slug yang sudah ada dengan awalan yang sama. Setiap perubahan memanggil `revalidateSitePages(slug layanan situs di kategori itu)`; urutan memanggil `revalidateSitePages([])`. Pembuangan berkas foto saat kategori dihapus dikerjakan di Task 3.
- [ ] **Step 4: Run** the test + `npx vitest run tests/unit/audit-labels.test.ts` + `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: create, rename, reorder, and delete service categories`

### Task 3: Foto kategori di server dan di situs

**Files:**
- Modify: `src/server/public-photo.ts` (`PhotoFolder` + `"kategori"`)
- Create: `src/server/category-photo.ts` (bukan `"use server"`, seperti `site-service-photo.ts`)
- Create: `src/app/(admin)/admin/layanan/foto-kategori/route.ts` (POST, bidang `categoryId` + `file`), `src/app/(public)/foto-kategori/[nama]/route.ts` (GET)
- Modify: `src/server/service-category-admin.ts` (`removeServiceCategoryPhoto`; hapus kategori membuang berkas foto)
- Modify: `src/lib/site-images.ts`, `src/components/catalog/service-card.tsx` (prop `category` menggantikan `categorySlug`), pemanggil di `src/app/(public)/layanan/page.tsx`, `src/app/(public)/layanan/[slug]/page.tsx`, `src/app/(public)/program-slimming/page.tsx`, `src/components/home/signature-treatments.tsx`
- Test: `tests/integration/category-photo-routes.test.ts` (pola `tests/integration/site-service-photo-routes.test.ts`), `tests/unit/site-images.test.ts`, `tests/unit/components/service-card.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`categoryPhotoUrl`, `categoryPhotoName`), Task 2.
- Produces:
  - `uploadCategoryPhoto(input: { actor: CurrentStaff; categoryId: string; bytes: Uint8Array }): Promise<{ photoUrl: string }>`; `removeCategoryPhotoFor(actor: CurrentStaff, id: string): Promise<void>`; `findPublicCategoryPhoto(name: string): Promise<Buffer | null>` (null bila tidak ada kategori yang `imageUrl`-nya persis nama itu)
  - `removeServiceCategoryPhoto(id: string): Promise<ActionResult>` (`"use server"`, `catalog:manage`)
  - `type CardCategory = { slug: string; name: string; imageUrl?: string | null }`; `categoryImage(category?: CardCategory | null): SiteImage`; `serviceImage(service: { name: string; imageUrl?: string | null }, category?: CardCategory | null): SiteImage`
  - `ServiceCard` props: `{ service; category?: CardCategory | null }`

- [ ] **Step 1: Write the failing tests:**
  - Integrasi rute: `"unggah menyimpan WebP di folder kategori, mengganti yang lama, dan tampil di rute publik"` (alamat cocok `/^\/foto-kategori\/[0-9a-z]+-[0-9a-f]{8}\.webp$/`, berkas lama hilang dari disk, audit `service_category.photo`); `"hapus foto dan hapus kategori membuang berkasnya; rute publik 404 (Review Focus 5)"`; `"Resepsionis 403; beda asal 403; berkas > 8 MB 413"`.
  - Unit `site-images`: kategori dengan `imageUrl: "/foto-kategori/c1-0123abcd.webp"` → `{ src: itu, alt: nama kategori }`; tanpa `imageUrl` → `CATEGORY_IMAGES.hifu` untuk slug `hifu`; slug baru tanpa foto → `FALLBACK_IMAGE`; foto layanan situs tetap menang atas foto kategori; `"constructor"` → `FALLBACK_IMAGE`.
  - Komponen `ServiceCard`: dengan `category={{ slug: "baru", name: "Hair", imageUrl: "/foto-kategori/c1-0123abcd.webp" }}` gambar memakai alamat itu.
- [ ] **Step 2: Run** `npm run test:integration -- tests/integration/category-photo-routes.test.ts` dan `npx vitest run tests/unit/site-images.test.ts tests/unit/components/service-card.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Rute POST meniru `src/app/(admin)/admin/layanan/foto/route.ts` (sesi, `catalog:manage`, `isSameOrigin`, batas `content-length`, pesan sama). Rute GET meniru `src/app/(public)/foto-layanan/[nama]/route.ts` (`Cache-Control: public, max-age=300`); tanpa syarat aktif karena kategori tidak punya status aktif, jadi panel memakai alamat publik ini untuk pratinjau. Kueri katalog publik sudah memuat seluruh kolom kategori; cukup teruskan objek kategori ke `ServiceCard`/`serviceImage`.
- [ ] **Step 4: Run** the tests + `tests/integration/site-service-photo-routes.test.ts` + `npx vitest run tests/unit/pages tests/unit/components/home-sections.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: uploadable category photos used on service cards`

### Task 4: Sakelar "Pasien boleh memilih sendiri di situs" di booking situs

**Files:**
- Modify: `src/server/public-booking-data.ts:81` (`category: { selfBookable: true }`), `src/server/public-booking.ts:68,323-331` (pilih `category.selfBookable`; tolak bila `false`), `src/lib/booking-rules.ts` (hapus `SLIMMING_CATEGORY_SLUG`)
- Modify: `tests/integration/public-booking-world.ts:48-52` (slimming `selfBookable: false` di `create` dan `update`)
- Test: `tests/integration/site-booking.test.ts`, `tests/integration/booking-options-site.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ServiceCategory.selfBookable`).
- Produces: `assertServiceFits(service: { slug: string; category: { selfBookable: boolean } }, answers: QuizAnswers)` (fungsi lokal).

- [ ] **Step 1: Write the failing tests:**
  - `booking-options-site`: `"hanya menawarkan treatment dari kategori yang boleh dipilih sendiri (KL14)"` — layanan situs di kategori uji bersakelar mati tidak ada di pilihan; setelah sakelar dihidupkan, muncul.
  - `site-booking`: `"menolak permintaan rakitan untuk layanan di kategori bersakelar mati (Review Focus 4)"` — kategori uji baru (bukan slug `slimming`) bersakelar mati → `{ ok: false, error: "Silakan pilih Konsultasi Dokter. Treatment ditentukan dokter setelah pemeriksaan." }`. Tes slimming yang ada tetap lulus.
- [ ] **Step 2: Run** `npm run test:integration -- tests/integration/site-booking.test.ts tests/integration/booking-options-site.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** perubahan di atas; Konsultasi Dokter tetap dikecualikan lewat slug-nya seperti sekarang.
- [ ] **Step 4: Run** the tests + `npm run test:integration -- tests/integration/public-slots.test.ts tests/integration/booking-prefill.test.ts` + `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: per-category self-booking switch replaces the slimming slug rule`

### Task 5: Panel Kelola kategori

**Files:**
- Create: `src/components/admin/photo-upload-field.tsx` (diekstrak dari `src/components/admin/service/site-service-photo-field.tsx`)
- Modify: `src/components/admin/service/site-service-photo-field.tsx` (menjadi pembungkus; teks dan perilaku tidak berubah)
- Create: `src/components/admin/service/category-manager-dialog.tsx`, `src/components/admin/service/category-dialog.tsx`
- Modify: `src/app/(admin)/admin/layanan/page.tsx` (tombol "Kelola kategori" sebelum tombol tambah layanan, di kedua tab; data dari `listServiceCategoryRows`)
- Test: `tests/unit/components/category-manager-dialog.test.tsx`, `tests/unit/components/site-service-dialog.test.tsx` (tetap lulus)

**Interfaces:**
- Consumes: Task 2 (aksi + `ServiceCategoryRow`), Task 3 (`removeServiceCategoryPhoto`, rute `/admin/layanan/foto-kategori`, `categoryPhotoName`).
- Produces:
  - `PhotoUploadField(props: { endpoint: string; fields: Record<string, string>; previewUrl: string | null; inputLabel: string; emptyText: string; savedText: string; removedText: string; onRemove: () => Promise<ActionResult>; onChange: (imageUrl: string | null) => void })`
  - `CategoryManagerDialog({ categories }: { categories: ServiceCategoryRow[] })`; `CategoryDialog({ row }: { row?: ServiceCategoryRow })`

- [ ] **Step 1: Write the failing tests** (komponen, aksi server di-mock):
  - Tombol "Kelola kategori" membuka dialog "Kelola kategori" berisi baris per kategori: foto kecil bila `imageUrl` ada, nama, "{n} layanan internal · {m} layanan situs", tanda "Tidak dipesan sendiri" bila `selfBookable` false, tombol `Naikkan {nama}` / `Turunkan {nama}` (yang pertama tanpa Naikkan aktif, yang terakhir tanpa Turunkan aktif), `Ubah {nama}`, `Hapus {nama}`; baris `locked` tanpa tombol Hapus.
  - "+ Kategori" membuka "Tambah kategori": isian "Nama kategori", "Deskripsi", kotak centang "Pasien boleh memilih sendiri di situs" (tercentang) dengan teks bantuan persis, teks "Simpan dulu, lalu unggah foto lewat tombol Ubah."; Simpan memanggil `createServiceCategory({ name, description, selfBookable })`; galat validasi tampil tanpa memanggil aksi.
  - "Ubah {nama}" membuka "Ubah — {nama}" dengan isian terisi dan isian foto berlabel "Berkas foto kategori".
  - "Hapus {nama}" menampilkan konfirmasi di dalam dialog ("Hapus kategori {nama}?", tombol "Ya, hapus" dan "Batal"); "Ya, hapus" memanggil `deleteServiceCategory(id)`; pesan galat dari server tampil sebagai Alert.
  - Naikkan memanggil `moveServiceCategory({ id, direction: "up" })`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/components/category-manager-dialog.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pola MUI seperti `site-service-dialog.tsx` (`Dialog`, `DialogCloseButton`, `toast`, `router.refresh()` setelah berhasil). Isian foto kategori: `PhotoUploadField` dengan `endpoint "/admin/layanan/foto-kategori"`, `fields { categoryId }`, `previewUrl` = `imageUrl` bila `categoryPhotoName(imageUrl)` sah, teks kosong "Belum ada foto unggahan. Kartu layanan tanpa foto memakai foto bawaan kategori.", tersimpan "Foto kategori diganti dan sudah tampil di situs.", dihapus "Foto kategori dihapus."
- [ ] **Step 4: Run** the test + `npx vitest run tests/unit/components/site-service-dialog.test.tsx tests/unit/components/internal-service-dialog.test.tsx` + `npx tsc --noEmit` + `npx eslint src tests --quiet`. Expected: PASS / clean.
- [ ] **Step 5: Commit** `feat: manage service categories from Layanan & Harga`

### Task 6: Dialog paket menyebut "Layanan"

**Files:**
- Modify: `src/components/admin/package/treatment-package-catalog.tsx:269,278,371,383`, `src/server/treatment-package-catalog.ts:160`, `src/lib/treatment-package.ts:90`
- Modify tes: `tests/unit/components/treatment-package-catalog.test.tsx`, `tests/unit/treatment-package.test.ts:35`, `tests/integration/treatment-package-catalog.test.ts:83`, `tests/e2e/paket.spec.ts:34,145`, `tests/e2e/resep-dokter.spec.ts:34`

- [ ] **Step 1: Ubah tes** ke teks baru di Global Constraints ("Layanan 1", "+ Layanan", "biaya layanan + harga beli barang", dua pesan galat); tambah satu tes komponen: layanan non-treatment (mis. "Konsultasi Dokter") bisa dipilih sebagai "Layanan 1".
- [ ] **Step 2: Run** `npx vitest run tests/unit/components/treatment-package-catalog.test.tsx tests/unit/treatment-package.test.ts` dan `npm run test:integration -- tests/integration/treatment-package-catalog.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** penggantian teks (hanya di dialog paket dan dua pesan itu).
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: package dialog calls catalog items Layanan`

### Task 7: E2E dan verifikasi

**Files:**
- Modify: `tests/e2e/prepare-db.mts` (hapus layanan di kategori bernama `E2E Kategori…`, lalu kategorinya)
- Create: `tests/e2e/kategori-layanan.spec.ts`

- [ ] **Step 1:** Spec per proyek (`tag(testInfo)` di nama): Admin Keuangan membuka Layanan & Harga → Kelola kategori → + Kategori "E2E Kategori {t}" tanpa centang sakelar → tampil paling bawah dengan "Tidak dipesan sendiri" → Naikkan → Ubah: ganti nama dan unggah foto (PNG buatan `sharp`, seperti `layanan-situs.spec.ts`) → "+ Layanan internal" di kategori itu → Hapus ditolak dengan pesan "masih berisi 1 layanan internal" → ubah kategori layanan itu ke Facial Treatment → Hapus → Ya, hapus → kategori hilang. Lalu buka Paket → Tambah paket → tombol "+ Layanan" ada dan "Layanan 1" bisa memilih "Konsultasi Dokter".
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npx eslint src tests --quiet`, lalu `caffeinate -i npx playwright test tests/e2e/kategori-layanan.spec.ts tests/e2e/layanan-situs.spec.ts tests/e2e/paket.spec.ts tests/e2e/resep-dokter.spec.ts tests/e2e/public-site.spec.ts tests/e2e/public-registration.spec.ts tests/e2e/harga-modal.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1`. Expected: PASS.
- [ ] **Step 3:** Reset DB uji (`prepare-db.mts`), lalu `npm run test:integration` → hanya `schedule.test.ts` (3) yang gagal seperti sebelumnya; `npx vitest run` → semua lulus.
- [ ] **Step 4: Commit** `test: service category management end to end`
