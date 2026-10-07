# Desain — Pengeluaran dan Laporan Untung-Rugi (Sub-proyek Keuangan 4)

- **Versi:** 1.0
- **Tanggal:** 7 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Bagian dari:** rangkaian keuangan klinik (`docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`, bagian 2)
- **Melanjutkan:**
  - tagihan dan pembayaran: `docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md`;
  - penyerahan obat: `docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md`;
  - stok, batch, hutang supplier: `docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`;
  - konsultasi online: `docs/superpowers/specs/2026-10-06-konsultasi-online-design.md`;
  - Angka dasbor (biaya booking diterima): `src/server/dashboard.ts`;
  - hak akses berbasis kemampuan: `src/lib/permissions.ts`.

## 1. Latar belakang & tujuan

Pemilik ingin tahu apakah klinik untung atau rugi. Pendapatan (tagihan, biaya booking, Konsultasi Online) dan harga pokok obat sudah tercatat oleh sub-proyek sebelumnya, tetapi biaya lain (gaji, sewa, listrik, dan sejenisnya) belum ada di sistem, dan tidak ada laporan yang menyatukannya.

**Berhasil bila:**
- Admin Keuangan bisa mencatat pengeluaran per kategori dengan cepat, termasuk yang berulang tiap bulan;
- pemilik bisa membuka satu laporan untuk periode dan cabang pilihan dan melihat pendapatan, harga pokok, pengeluaran, dan laba atau rugi, tanpa biaya yang terhitung dua kali;
- uang yang benar-benar masuk dan keluar tampil terpisah sebagai arus kas;
- laporan bisa dibandingkan dengan periode sebelumnya, dilihat trennya 12 bulan, dan diunduh sebagai CSV;
- hanya Admin Keuangan dan Super Admin yang melihat angka ini.

## 2. Keputusan (dikonfirmasi pemilik, 7 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| LP1 | Dasar hitung | **Saat tagihan final**; sisa tagihan ditampilkan terpisah sebagai "belum tertagih" |
| LP2 | Pengeluaran yang dicatat | Pengeluaran umum per kategori, **dan** pengeluaran berulang otomatis tiap bulan |
| LP3 | Pendapatan di muka | Biaya booking dan harga Konsultasi Online ikut sebagai pendapatan, terpisah dari tagihan |
| LP4 | Pembayaran hutang supplier | **Tidak** dikurangkan dari laba (agar biaya barang tidak terhitung dua kali); tampil di bagian **Arus kas** terpisah |
| LP5 | Isi laporan | Periode dan cabang, rincian per jenis, perbandingan dengan periode sebelumnya, tren 12 bulan, unduh CSV |
| LP6 | Hak akses | Admin Keuangan mencatat dan melihat; Super Admin semuanya |

## 3. Rumus laporan

Semua tanggal dalam WITA. Satu periode = rentang tanggal `[dari, sampai]` (inklusif), dan satu cabang atau "semua cabang".

### 3.1 Pendapatan
- **Layanan, treatment, obat/produk:** jumlah `quantity × unitPrice` baris tagihan berstatus `FINAL` yang `finalizedAt`-nya (dalam WITA) jatuh di periode, dikelompokkan per jenis baris (`LAYANAN`, `TREATMENT`, `BARANG`). Cabang = cabang tagihan.
- **Diskon:** jumlah diskon tagihan-tagihan itu, ditampilkan sebagai baris pengurang. Tagihan `DRAF` dan `DIBATALKAN` tidak dihitung.
- **Pendapatan di muka:** untuk booking yang **diverifikasi** di periode (aksi audit `appointment.verify`, satu booking dihitung sekali, tanggal = tanggal audit pertama dalam WITA): `bookingFee` (kosong dihitung 0) dan, untuk kanal `ONLINE`, `servicePrice`. Cabang = cabang booking. Konsultasi Online tidak punya baris di tagihan (sub-proyek tagihan), jadi tidak terhitung dua kali. Booking yang kemudian batal tetap pendapatan (biaya booking tidak dikembalikan).
- **Total pendapatan** = layanan + treatment + obat/produk − diskon + pendapatan di muka.

### 3.2 Harga pokok, laba, dan pengeluaran
- **Harga pokok** = Σ `InvoiceStockUse.quantity × unitCost` dari tagihan `FINAL` periode itu (harga beli batch yang benar-benar terambil).
- **Laba kotor** = total pendapatan − harga pokok.
- **Pengeluaran** = Σ nominal pengeluaran yang tidak dibatalkan dengan tanggal di periode, per kategori. Pengeluaran **umum** (tanpa cabang) hanya ikut bila laporan "semua cabang".
- **Laba bersih** = laba kotor − pengeluaran. Bila negatif ditulis "Rugi".
- **Belum tertagih** (informasi, tidak mengurangi laba) = Σ sisa tagihan `FINAL` periode itu pada saat laporan dibuka.

### 3.3 Arus kas (terpisah dari laba)
- **Masuk** = pembayaran customer yang tidak dibatalkan dengan `paidAt` di periode + pendapatan di muka (3.1).
- **Keluar** = pembayaran hutang supplier jenis `BAYAR` dengan `paidAt` di periode dikurangi `PENGEMBALIAN` pada periode itu + pengeluaran (3.2).
- **Kas bersih** = masuk − keluar. Cabang: pembayaran mengikuti cabang tagihan atau faktur; pengeluaran umum hanya di "semua cabang".

### 3.4 Perbandingan dan tren
- **Periode sebelumnya** = rentang dengan jumlah hari sama yang berakhir sehari sebelum `dari`. Bulan ini dibanding bulan lalu penuh bila periodenya bulan kalender penuh. Selisih dan persen (kosong bila pembanding 0).
- **Tren 12 bulan** = pendapatan, harga pokok + pengeluaran, dan laba bersih per bulan kalender, untuk 12 bulan yang berakhir di bulan berjalan, mengikuti saringan cabang.

### 3.5 Konsekuensi yang disengaja
Laporan dihitung langsung dari data sumber, tanpa tabel ringkasan. Karena itu laporan bulan lampau bisa berubah bila tagihan bulan itu dibatalkan sekarang. Pembatalan tagihan selalu tercatat di jejak audit.

## 4. Data

Migrasi hanya menambah.

### 4.1 `ExpenseCategory`
`id`, `name` (unik tanpa membedakan huruf besar-kecil), `isActive` (bawaan `true`), `sortOrder`, `createdAt`. Diisi bawaan lewat migrasi: Gaji, Sewa, Listrik dan air, Internet dan telepon, Perlengkapan, Pemasaran, Lain-lain. Kategori tidak dihapus, hanya dinonaktifkan; kategori nonaktif tetap tampil di laporan.

### 4.2 `Expense`
`id`, `date` (`@db.Date`), `categoryId` (Restrict), `amount Int`, `note String?`, `branchId String?` (kosong = umum), `recurringId String?`, `recurringMonth String?` (`"YYYY-MM"`), `createdById`, `createdByName`, `createdAt`, `voidedAt?`, `voidedByName?`, `voidReason?`.
- Keunikan: `(recurringId, recurringMonth)` unik bila `recurringId` terisi, sehingga templat tidak pernah membuat dua catatan untuk bulan yang sama.
- CHECK: `amount > 0`; `voidedAt` terisi bersama `voidedByName` dan `voidReason`, atau semuanya kosong.

### 4.3 `RecurringExpense`
`id`, `categoryId`, `amount Int`, `note String?`, `branchId String?`, `dayOfMonth Int` (1–28), `startMonth String` (`"YYYY-MM"`), `endMonth String?`, `isActive` (bawaan `true`), `createdById`, `createdByName`, `createdAt`.
- CHECK: `amount > 0`, `dayOfMonth` antara 1 dan 28, `endMonth` kosong atau tidak lebih awal dari `startMonth`.

## 5. Pengeluaran berulang

Tidak ada penjadwal di server. Catatan bulan yang belum ada dibuat **saat Admin Keuangan membuka halaman Pengeluaran atau Laporan**, dan lewat aksi yang sama bila dipanggil langsung:
1. untuk tiap templat aktif, bulan yang dibuat adalah dari `startMonth` sampai bulan berjalan (tidak melewati `endMonth`), tanggal = `dayOfMonth` bulan itu;
2. tiap bulan dimasukkan dengan `INSERT … ON CONFLICT (recurringId, recurringMonth) DO NOTHING`, sehingga dua orang yang membuka halaman bersamaan tidak membuat catatan ganda;
3. nominal, kategori, dan cabang disalin dari templat saat catatan dibuat; mengubah atau menghentikan templat tidak mengubah catatan yang sudah ada (catatan tetap bisa dibatalkan atau, bila perlu, dicatat ulang manual);
4. bulan yang sudah terlewat sebelum templat dibuat (`startMonth` ke belakang) ikut dibuat bila `startMonth` diisi bulan lampau, agar pemilik bisa memulai dari catatan lama.

## 6. Hak akses

Kemampuan baru: `expense:manage` (mencatat, membatalkan, kelola kategori dan templat berulang, melihat daftar pengeluaran) dan `profit:read` (laporan, tren, CSV). Dipegang **Admin Keuangan** dan **Super Admin**. Dokter, Apoteker, Resepsionis, dan Terapis tidak memegang keduanya. Setiap halaman, aksi, dan rute unduhan memanggil `requireCapability` sendiri.

## 7. Layar

- **`/admin/pengeluaran`**, tiga tab:
  - *Catatan*: daftar per bulan, saringan kategori dan cabang, tombol "+ Pengeluaran", dan "Batalkan" dengan alasan. Pengeluaran yang dibatalkan tampil dicoret dengan alasannya;
  - *Berulang*: daftar templat (tambah, ubah nominal untuk bulan ke depan, hentikan);
  - *Kategori*: tambah dan nonaktifkan.
- **`/admin/laporan`**: pilihan periode (bulan ini, bulan lalu, tahun ini, rentang bebas dengan batas 366 hari) dan cabang (hanya cabang aktif, atau semua). Isi: kartu ringkas (Pendapatan, Harga pokok, Laba kotor, Pengeluaran, Laba bersih/Rugi); tabel rincian pendapatan per jenis dan pengeluaran per kategori beserta diskon dan belum tertagih; perbandingan dengan periode sebelumnya; bagian Arus kas; grafik tren 12 bulan (SVG sendiri, tanpa dependensi baru); tombol "Unduh CSV".
- **`/admin/laporan/unduh`** (rute): CSV untuk periode dan cabang yang sedang dilihat.
- **Menu**: "Pengeluaran" dan "Laporan" di grup Persediaan dan keuangan. **Dasbor**: kotak "Laba bersih bulan ini" untuk pemegang `profit:read`.

## 8. CSV

UTF-8 dengan BOM agar Excel membukanya benar; pemisah koma; angka rupiah bilangan bulat tanpa pemisah ribuan. Sel teks yang diawali `=`, `+`, `-`, `@`, tab, atau karakter kontrol diberi awalan `'` agar tidak dijalankan sebagai rumus. Unduhan dicatat di jejak audit (`report.export`).

## 9. Validasi dan kasus khusus

- Pengeluaran: nominal bilangan bulat > 0 (batas atas sama dengan batas uang di sub-proyek stok); tanggal tidak di masa depan; keterangan paling banyak 300 karakter; kategori harus ada dan aktif; cabang kosong atau cabang aktif.
- Templat: `dayOfMonth` 1–28; `startMonth` tidak lebih dari 24 bulan ke belakang; `endMonth` tidak lebih awal dari `startMonth`.
- Pembatalan pengeluaran wajib beralasan; pengeluaran yang dibatalkan tidak dihitung di laporan.
- Rentang bebas lebih dari 366 hari atau terbalik ditolak dengan pesan yang jelas.
- Periode tanpa data menampilkan nol, bukan galat; pembanding bernilai 0 menampilkan "–" untuk persen.
- Booking yang diverifikasi dua kali tercatat sekali (seperti Angka dasbor).

## 10. Jejak audit

`expense.create`, `expense.void`, `expense-category.create`, `expense-category.update`, `expense-recurring.create`, `expense-recurring.update`, `expense-recurring.stop`, `report.export`. Ringkasan memuat kategori dan nominal, bukan keterangan bebas.

## 11. Pengujian

- **Unit (aturan murni):** rumus laba kotor dan bersih, perbandingan dan persen, rentang periode (bulan ini, bulan lalu, tahun ini, rentang bebas dan batas 366 hari, periode sebelumnya sepanjang sama), batas hari WITA, validasi pengeluaran dan templat, penetralan sel CSV.
- **Integrasi:** laporan dari tagihan final (draf dan dibatalkan tidak ikut; batas tengah malam WITA), harga pokok dari baris obat, diskon, belum tertagih, pendapatan di muka dari booking terverifikasi (biaya booking dan Konsultasi Online, tidak terhitung dua kali), arus kas (pembayaran customer yang dibatalkan tidak ikut, pembayaran hutang dikurangi pengembalian dana), pengeluaran dibatalkan tidak ikut, pengeluaran umum hanya di "semua cabang", kategori nonaktif tetap tampil. Pengeluaran berulang: pembuatan susulan beberapa bulan, tidak ganda walau dibuka bersamaan, templat yang dihentikan atau berakhir. Hak akses tiap peran.
- **Komponen:** formulir pengeluaran, daftar, templat, kartu laporan dan "Rugi", grafik tren, tombol unduh.
- **E2E:** Admin Keuangan menambah pengeluaran dan templat berulang, membuka laporan dan melihat angka yang sesuai dengan tagihan di cerita itu, mengunduh CSV; peran lain mendapat 403 di `/admin/pengeluaran`, `/admin/laporan`, dan unduhan CSV.

## 12. Di luar cakupan

Pajak (PPN, PPh), penyusutan aset, neraca, anggaran dan target, lampiran foto nota, persetujuan berjenjang, rekonsiliasi bank, dan laporan PDF.

## 13. Hal yang diuji pemilik sebelum rilis

- Apakah kategori bawaan sudah cukup, dan apakah tanggal tiap bulan 1–28 untuk pengeluaran berulang cukup.
- Apakah laporan bulan lampau yang bisa berubah karena pembatalan tagihan (3.5) dapat diterima, atau perlu penutupan bulan yang mengunci angka.
