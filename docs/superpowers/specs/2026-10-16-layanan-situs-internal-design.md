# Katalog layanan situs dan internal — desain

Tanggal: 13 Oktober 2026 · Status: menunggu tinjauan pemilik

## 1. Tujuan

Hari ini satu tabel `Service` melayani dua hal: katalog situs publik (/layanan, beranda, /daftar) dan katalog internal
(rekam medis, tagihan, paket, biaya, komisi, laporan). Pemilik ingin keduanya terpisah karena:

- katalog internal perlu lebih banyak item (varian, per titik, add-on) yang tidak dipromosikan di situs;
- isi situs (nama promosi, foto, deskripsi) diatur bebas tanpa menyentuh harga, biaya, atau komisi di tagihan;
- resepsionis memilih treatment dari katalog internal di "+ Baris layanan", bukan mengetik nama dan harga.

Berhasil bila: treatment internal baru bisa dibuat dan ditagihkan tanpa muncul di situs; layanan situs bisa dibuat dengan
nama dan foto sendiri yang tertaut ke satu layanan internal; situs tampil persis sama sesudah deploy; draf tagihan bisa
diisi treatment katalog lengkap dengan pelaksana, biaya, dan komisi.

### Keputusan pemilik

| No | Keputusan |
|----|-----------|
| K1 | Dua katalog terpisah. `Service` tetap menjadi katalog internal; tabel baru `SiteService` untuk situs. |
| K2 | Setiap layanan situs tertaut ke tepat satu layanan internal. |
| K3 | Harga situs selalu ikut harga layanan internal yang ditautkan; layanan situs tidak punya harga sendiri. |
| K4 | Satu daftar kategori (`ServiceCategory`) dipakai bersama kedua katalog. |
| K5 | Kedua katalog dikelola Super Admin dan Admin Keuangan. |
| K6 | "+ Baris layanan" memilih dari katalog internal, dan "Lainnya (ketik sendiri)" tetap ada. |
| K7 | Foto layanan situs bisa diunggah, memakai pengolahan foto dokter (branch `foto-dokter`, sudah di-merge ke main lokal). |

## 2. Data

### 2.1 Layanan internal (`Service`, tanpa perubahan relasi)

Dipakai seperti sekarang oleh `Appointment`, `EncounterTreatment`, `InvoiceLine`, `TreatmentPackageItem`, dan
`PatientPackageItem`. Kolom yang dikelola: `name`, `categoryId`, `promoPrice` (harga berlaku), `normalPrice` (harga coret,
opsional), `durationMin`, `requiresDoctor`, `isActive`, `sortOrder`, serta biaya dan komisi (spec harga modal 5).

- `slug` tetap unik dan wajib, tetapi dibuat otomatis dari nama saat layanan baru ditambah (huruf kecil, tanda hubung,
  akhiran `-2`, `-3`, … bila sudah dipakai) dan tidak pernah tampil atau berubah sesudahnya.
- Kolom khusus situs `description`, `imageUrl`, `isSignature`, `priceNote` tidak dibaca lagi oleh kode mana pun. Kolomnya
  dibiarkan (migrasi hanya menambah); penghapusannya urusan migrasi kemudian.
- Nama unik tanpa membedakan huruf besar/kecil dan spasi di tepi, supaya pilihan di tagihan tidak kembar.
- `konsultasi-dokter` dan `konsultasi-online` tetap layanan internal khusus yang dicari lewat slug.

### 2.2 Layanan situs (`SiteService`, baru)

| Kolom | Jenis | Keterangan |
|-------|-------|------------|
| `id` | String cuid | |
| `slug` | String unik | alamat `/layanan/<slug>`; huruf kecil, angka, tanda hubung; 2–80 karakter |
| `name` | String | nama promosi, 2–100 karakter |
| `description` | String? | maks. 2.000 karakter, baris baru dipertahankan |
| `imageUrl` | String? | foto unggahan (`/foto-layanan/<nama>`) atau berkas lokal lama; kosong = foto kategori |
| `priceNote` | String? | satuan harga, misal "/ 5 titik"; maks. 40 karakter |
| `isSignature` | Boolean, bawaan false | tampil di "Our Signature Treatment" |
| `isActive` | Boolean, bawaan true | |
| `sortOrder` | Int, bawaan 0 | urutan di dalam kategori |
| `categoryId` | → `ServiceCategory` | `onDelete: Cascade`, sama seperti `Service` |
| `serviceId` | → `Service` | wajib, `onDelete: Restrict` |
| `createdAt`, `updatedAt` | DateTime | |

Indeks `@@index([categoryId, sortOrder])`, `@@index([serviceId])`, `@@index([isSignature])`. Satu layanan internal boleh
ditautkan oleh beberapa layanan situs. Tidak ada kolom harga (K3).

### 2.3 Migrasi `20261016090000_layanan_situs`

Membuat tabel `SiteService`, lalu menyalin setiap baris `Service` yang slug-nya bukan `konsultasi-online` menjadi satu
`SiteService` dengan `slug`, `name`, `description`, `imageUrl`, `priceNote`, `isSignature`, `isActive`, `sortOrder`,
`categoryId` yang sama dan `serviceId` = id asalnya. Id baru dibuat di SQL (`'ss_' || md5(random()::text || id)`).
Hasilnya situs menampilkan hal yang sama persis seperti sebelum deploy. `prisma/seed.ts` ikut membuat `SiteService` untuk
setiap layanan seed (kecuali Konsultasi Online) agar basis data uji dan E2E sama bentuknya.

## 3. Situs publik

Semua fungsi di `src/server/catalog.ts` yang dipakai situs membaca `SiteService` beserta layanan internalnya:
`getServiceCategoriesWithServices` (/layanan, /program-slimming), `getServiceBySlug` dan `getRelatedServices`
(/layanan/[slug]), `getSignatureServices` dan `countActiveServices` (beranda), `getAllServiceSlugs` (halaman statis dan
sitemap).

- Syarat tampil: `SiteService.isActive` **dan** `Service.isActive`. Menonaktifkan layanan internal otomatis
  menyembunyikannya dari situs.
- Nama, slug, deskripsi, foto, satuan harga, signature, urutan, dan kategori dari `SiteService`; harga berlaku, harga coret,
  dan durasi dari `Service`.
- Bentuk data yang diterima komponen situs (`service-card`, `price-tag`, halaman detail) dipertahankan: fungsi katalog
  memetakan baris ke bentuk lama (`name`, `slug`, `description`, `imageUrl`, `promoPrice`, `normalPrice`, `priceNote`,
  `durationMin`, `category`), sehingga komponen situs tidak perlu diubah selain jenis datanya.
- Kueri situs memakai `select` eksplisit untuk kolom `Service`: biaya bahan/alat dan komisi tidak pernah dimuat untuk situs
  (menutup minor harga modal "katalog publik memuat kolom biaya").
- `getServiceCategoriesWithServices` tidak lagi dipakai halaman admin (bagian 5 dan 6 memakai fungsi internal sendiri).

## 4. Booking

### 4.1 /daftar (pasien)

`getBookingOptions().treatments` dibangun dari layanan situs aktif yang layanan internalnya aktif, di luar kategori slimming
dan di luar kedua layanan konsultasi. Setiap pilihan membawa **id layanan internal** dengan **nama layanan situs**; harga,
durasi, dan `requiresDoctor` dari layanan internal. Bila beberapa layanan situs menautkan layanan internal yang sama, pilihan
itu tampil sekali dengan nama layanan situs yang urutannya paling awal.

Server booking (`public-booking.ts`) tetap menerima id layanan internal, dan sekarang juga menolak treatment yang tidak
punya satu pun layanan situs aktif ("Treatment tidak tersedia."), supaya item khusus internal tidak bisa dipesan lewat
permintaan buatan. Konsultasi Dokter dikecualikan dari syarat ini. Aturan slimming tetap memakai kategori layanan internal
(K4: kategorinya satu daftar).

### 4.2 Panel admin

Formulir janji temu admin (`/admin/booking/baru`) memilih dari katalog internal aktif (fungsi baru
`listInternalServiceOptions`), karena staf perlu melihat semua item. Konsultasi Online tetap lewat formulirnya sendiri.

## 5. Halaman Layanan & Harga

Hak baru `catalog:manage` = Super Admin + Admin Keuangan (K5). `/admin/layanan` memeriksa hak ini; kartu durasi
konsultasi dan kartu Konsultasi Online tetap hanya untuk `content:manage` seperti sekarang. Halaman memakai `PageTabs`:
`?tab=internal` (bawaan) dan `?tab=situs`.

### 5.1 Tab "Layanan internal"

Tabel per kategori: Nama · Harga (coret dan berlaku) · Durasi · Perlu dokter · Biaya per sesi · Di situs (jumlah layanan
situs aktif yang menautkan, atau "Hanya internal") · Status · aksi. Konsultasi Online tidak masuk tabel.

- **+ Layanan internal** dan **Ubah** memakai satu dialog: Nama, Kategori, Harga berlaku, Harga normal (opsional; bila diisi
  harus lebih besar dari harga berlaku), Durasi (15–480 menit, kelipatan 15), Perlu dokter.
- Tombol **Biaya** (dialog harga modal) dan **Aktifkan/Nonaktifkan** tetap.
- Menonaktifkan layanan internal yang masih ditautkan layanan situs aktif tetap boleh; dialog konfirmasi menyebut bahwa
  layanan itu ikut hilang dari situs.
- Aksi server baru di `src/server/service-admin.ts`: `createInternalService`, `updateInternalService`. `updateServicePrice`,
  `updateServiceCost`, dan `setServiceActive` beralih ke `catalog:manage` (`updateServiceCost` tetap juga membutuhkan
  `price:manage`; keduanya kini sama anggotanya).

### 5.2 Tab "Layanan situs"

Tabel per kategori: Foto kecil · Nama di situs · Layanan internal (nama dan harga) · Signature · Status · aksi (Ubah,
Aktifkan/Nonaktifkan, "Lihat di situs" bila tampil).

- **+ Layanan situs** dan **Ubah** memakai satu dialog: Layanan internal (pilihan dengan pencarian, semua layanan internal
  kecuali Konsultasi Online), Nama di situs (awalnya nama internal), Slug (terisi dari nama selama belum disentuh pengguna;
  saat mengubah slug layanan yang sudah ada tampil peringatan "Tautan lama ke halaman ini akan rusak."), Kategori (awalnya
  kategori internal), Deskripsi, Satuan harga, Signature, Urutan, Foto. Harga tampil read-only "ikut layanan internal".
- Aksi server baru di `src/server/site-service-admin.ts`: `createSiteService`, `updateSiteService`, `setSiteServiceActive`,
  `removeSiteServicePhoto`. Validasi bersama di `src/lib/site-service.ts`.
- Tidak ada hapus untuk kedua katalog; hanya nonaktif.
- Setiap perubahan pada kedua katalog dicatat lewat `recordAudit` (aksi `service.create`, `service.update`,
  `site_service.create`, `site_service.update`, `site_service.activate`, `site_service.deactivate`, `site_service.photo`)
  dan memanggil `safeRevalidatePath` untuk `/`, `/layanan`, `/layanan/<slug>` (slug lama dan baru), `/program-slimming`,
  dan `/admin/layanan`.

### 5.3 Foto layanan situs (K7)

- Pengolahan `processDoctorPhoto` diganti nama menjadi `processPublicPhoto` di `src/server/public-photo.ts` dan dipakai
  foto dokter dan foto layanan (batas sama: maks. 8 MB, JPG/PNG/WebP, sisi terpendek minimal sama, maks. 1600 px, WebP,
  metadata dibuang).
- Unggah lewat `POST /admin/layanan/foto` (form-data `siteServiceId`, `file`), hak `catalog:manage`, pemeriksaan
  same-origin seperti rute foto staf.
- Berkas disimpan di `<patientFilesDir>/layanan/<siteServiceId>-<sidik8>.webp`; foto lama dihapus setelah yang baru
  tersimpan.
- Disajikan publik lewat `GET /foto-layanan/<nama>` hanya bila layanan situs pemiliknya aktif dan layanan internalnya
  aktif; `Cache-Control: public, max-age=300`. Pratinjau admin lewat `GET /admin/layanan/foto/<nama>` (hak
  `catalog:manage`), tanpa syarat aktif.
- Foto unggahan baru bisa dipasang pada layanan situs yang sudah tersimpan; dialog "+ Layanan situs" menyimpan dulu, lalu
  bagian foto aktif.

## 6. "+ Baris layanan" di draf tagihan (K6)

- Dialog `AddFreeLineDialog` menjadi dua mode. Kolom pertama **Layanan**: pilihan dengan pencarian dari katalog internal
  aktif (kecuali Konsultasi Online), dikelompokkan per kategori, setiap pilihan menampilkan harga berlaku. Pilihan terakhir
  **"Lainnya (ketik sendiri)"** membuka isian lama (jenis, nama, harga) tanpa perubahan perilaku.
- Mode katalog: nama dan harga tampil terkunci; hanya Jumlah yang diisi. Memanggil aksi baru
  `addServiceLine({ invoiceId, version, serviceId, quantity })` di `invoice-drafts.ts`, hak `invoice:manage`.
- `addServiceLine` membuat baris `kind: "TREATMENT"`, `serviceId`, `name` = nama layanan internal, `unitPrice` = `promoPrice`,
  lewat `touchDraft` dan `guardDiscount` seperti `addFreeLine`, lalu `recordAudit` "Tambah baris <nama> ×<jumlah>".
  Menolak layanan yang tidak ada, nonaktif, atau Konsultasi Online ("Layanan tidak tersedia.").
- Karena tertaut `serviceId`, baris ini mendapat perilaku baris treatment yang sudah ada: pilihan pelaksana, snapshot biaya
  dan komisi saat final, tab Margin dan Komisi, "Pakai sesi paket", diskon per item, dan aturan ubah harga (harga berbeda dari
  katalog wajib alasan).
- Opsi katalog dimuat lewat fungsi baca `listInternalServiceOptions()` (id, nama, kategori, harga) yang sama dengan
  formulir janji temu admin.

## 7. Hak akses

| Peran | Lihat/ubah layanan internal | Lihat/ubah layanan situs | Pilih katalog di tagihan |
|-------|------------------------------|--------------------------|--------------------------|
| Super Admin | ya | ya | ya |
| Admin Keuangan | ya | ya | tidak (tidak punya `invoice:manage`) |
| Resepsionis | tidak (403) | tidak (403) | ya |
| Apoteker, Dokter, Terapis | tidak (403) | tidak (403) | tidak |

Biaya bahan/alat dan komisi tetap tersembunyi dari Resepsionis (spec harga modal 8): opsi katalog di tagihan hanya membawa
id, nama, kategori, dan harga.

## 8. Pengujian

- **Unit:** validasi layanan internal (nama, harga, harga coret, durasi kelipatan 15) dan layanan situs (slug, nama,
  panjang deskripsi, satuan harga); pembuat slug; dialog tambah baris (mode katalog terkunci, mode Lainnya tetap); dialog
  layanan situs (slug mengikuti nama sampai disentuh, peringatan ubah slug).
- **Integrasi:** migrasi menyalin layanan 1:1 (kecuali Konsultasi Online); katalog situs menyembunyikan layanan bila layanan
  situs atau layanan internalnya nonaktif dan tidak memuat kolom biaya; booking situs menolak treatment khusus internal dan
  memakai durasi/aturan dokter dari internal; hak akses aksi katalog (Resepsionis dan Apoteker ditolak); `addServiceLine`
  menolak layanan nonaktif dan Konsultasi Online, dan baris yang dibuatnya ikut snapshot biaya dan komisi saat final; rute
  `/foto-layanan` hanya menyajikan foto layanan situs aktif.
- **E2E** (`tests/e2e/layanan-situs.spec.ts`, desktop dan ponsel): Admin Keuangan menambah layanan internal
  "Add-on E2E <D|M>" yang tidak tampil di /layanan → Super Admin membuat layanan situs tertaut dengan foto, tampil di
  /layanan dengan harga internal → Resepsionis menambahkan "Add-on E2E" dari katalog ke draf tagihan dan memilih
  pelaksana.

## 9. Di luar cakupan

- Menambah, mengubah, atau mengurutkan kategori.
- Menghapus kolom situs lama di `Service` (migrasi kemudian, setelah rilis ini stabil).
- Harga situs yang berbeda dari harga internal (K3).
- Mengubah alur rekam medis (pilihan treatment dokter tetap katalog internal seperti sekarang).
