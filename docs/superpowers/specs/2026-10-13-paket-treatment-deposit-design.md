# Desain — Paket Treatment dengan Sisa Sesi, dan Label Deposit

- **Versi:** 1.0
- **Tanggal:** 13 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Sub-proyek:** 2 dari 6 (urutan disepakati: tagihan (selesai, PR #42) → **deposit dan paket** → harga modal dan margin → menu Karyawan gaji dan komisi → impor Kluto; resep terstruktur menyusul)
- **Menyentuh:**
  - tabel baru `TreatmentPackage`, `TreatmentPackageItem`, `PatientPackage`, `PatientPackageItem`, `PackageSessionEntry`;
  - kolom baru di `InvoiceLine`, dan jenis baris baru `PAKET`;
  - draf, finalisasi, dan pembatalan tagihan;
  - aturan total (`src/lib/invoice.ts`), label status, struk (`src/lib/receipt.ts`, ESC/POS, `/struk`), laporan pendapatan (`src/server/report-sql.ts`);
  - halaman Layanan & Harga, detail pasien, dan tagihan.

  Alur booking, kunjungan, resep, penyerahan obat, dan model `Package` (katalog program slimming di situs publik) tidak berubah.

## 1. Latar belakang & tujuan

Klinik menjual paket treatment, misalnya "Facial Glow 5x". Customer membayar di muka, sering hanya DP dulu, lalu datang beberapa kali untuk memakai sesinya. SunDY saat ini hanya bisa menagih treatment per kunjungan. Tagihan yang baru dibayar sebagian tampil "Sebagian", sedangkan staf menyebutnya "Deposit".

Tujuan:
1. **Katalog paket treatment.** Isinya bisa satu treatment × N sesi atau campuran beberapa treatment, dengan harga dan masa berlaku per paket.
2. **Menjual paket di tagihan**, termasuk dibayar DP.
3. **Memakai sesi paket di tagihan kunjungan**, dengan sisa sesi yang tercatat dan bisa ditelusuri.
4. **Label "Deposit"** untuk tagihan final yang dibayar sebagian.

Bukan tujuan:
- refund paket;
- memindahkan paket ke customer lain;
- membeli paket lewat situs publik;
- pengakuan pendapatan per sesi;
- komisi perawat (sub-proyek 4, tetapi data pelaksana dijaga agar bisa dihitung nanti);
- DP minimal wajib;
- saldo deposit/titipan customer.

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| P1 | Arti "Deposit" | **DP/uang muka tagihan.** Bukan saldo titipan customer. |
| P2 | Label tagihan dibayar sebagian | **"Deposit"** menggantikan "Sebagian" di semua tampilan tagihan dan struk. Tidak ada langkah tambahan bagi kasir. Label hutang supplier tidak berubah. |
| P3 | Isi paket | **Satu treatment × N sesi, atau campuran** beberapa treatment, masing-masing dengan jumlah sesinya. |
| P4 | Asal paket | **Katalog tetap** yang disiapkan klinik. Resepsionis memilih dari katalog dan tidak menyusun isi sendiri. |
| P5 | Sesi sebelum lunas | **Boleh dipakai** sejak tagihan pembelian final. Sisa tagihan tetap tercatat sebagai Deposit. |
| P6 | Masa berlaku | **Per paket** (dalam hari, sejak tanggal pembelian final). Sesi yang kedaluwarsa tidak bisa dipakai. Admin Keuangan bisa memperpanjang dengan alasan. |
| P7 | Tempat potong sesi | **Di tagihan oleh resepsionis.** Baris TREATMENT ditandai "Pakai sesi paket" dan sesi terpotong saat tagihan difinalkan. |
| P8 | Cabang | **Semua cabang.** Paket milik customer, bukan milik cabang. |
| P9 | Pendapatan | **Diakui saat paket dijual.** Pemakaian sesi bernilai Rp 0. |
| P10 | Penyimpanan sisa sesi | **Buku sesi** (seperti buku stok): setiap perubahan adalah baris riwayat, dan sisa = jumlah baris. |
| P11 | Katalog dan harga paket | Diatur pemegang `price:manage` (Admin Keuangan dan Super Admin), sejalan dengan keputusan bahwa harga hanya diisi Admin Keuangan. |
| P12 | Pembatalan tagihan pembelian | **Ditolak bila ada sesi yang sudah terpakai.** Bila belum terpakai, paket ikut dibatalkan. |

## 3. Data

Semua tabel dan kolom baru hanya menambah. Nilai rupiah adalah bilangan bulat rupiah penuh.

**`TreatmentPackage`** (katalog)
- `id`, `name` (unik di antara paket aktif, ≤ 120 karakter), `price` (Int, 0..2.000.000.000), `validDays` (Int, 1..3650), `description?` (≤ 500), `isActive` (bawaan true), `sortOrder`, `createdAt`, `updatedAt`.
- Paket yang pernah dijual tidak bisa dihapus, hanya dinonaktifkan. Paket yang belum pernah dijual pun cukup dinonaktifkan, demi kesederhanaan.

**`TreatmentPackageItem`**
- `id`, `packageId` (FK Cascade), `serviceId` (FK Restrict ke `Service`), `sessions` (Int, 1..100), `sortOrder`.
- Unik `(packageId, serviceId)`. Satu paket minimal punya satu item; aturan ini dijaga di server.

**`PatientPackage`** (paket milik customer)
- `id`, `patientId` (FK Restrict), `packageId` (FK Restrict, untuk rujukan saja).
- `name` dan `price`: **disalin** saat dibeli, sehingga perubahan katalog tidak mengubah paket yang sudah dijual.
- `purchaseLineId` (FK Restrict ke `InvoiceLine`, unik).
- `startsOn` (Date, tanggal WITA saat final), `expiresOn` (Date, inklusif).
- `status`: enum `PatientPackageStatus` { `AKTIF`, `DIBATALKAN` }. Kedaluwarsa tidak disimpan sebagai status; dihitung dari `expiresOn`.
- `createdAt`.

**`PatientPackageItem`**
- `id`, `patientPackageId` (FK Cascade), `serviceId`, `serviceName` (disalin), `sessions` (jatah awal).
- Unik `(patientPackageId, serviceId)`.

**`PackageSessionEntry`** (buku sesi)
- `id`, `patientPackageItemId` (FK Restrict).
- `kind`: enum `PackageEntryKind` { `BELI`, `PAKAI`, `BATAL_PAKAI`, `PERPANJANG`, `BATAL_PAKET` }.
- `delta` (Int): BELI +N, PAKAI −N, BATAL_PAKAI +N, BATAL_PAKET −(sisa), PERPANJANG 0.
- `invoiceLineId?` (baris tagihan yang memakai atau mengembalikan sesi), `reason?` (wajib untuk PERPANJANG).
- `previousExpiresOn?` dan `newExpiresOn?` (hanya PERPANJANG).
- `staffId`, `staffName`, `createdAt`.
- Sisa sesi satu item = Σ `delta`. Server menjaga sisa ≥ 0 di dalam transaksi yang mengunci `PatientPackage` (`FOR UPDATE`). CHECK basis data: tanda `delta` sesuai `kind`.

**`InvoiceLine`** (kolom baru)
- `treatmentPackageId?` untuk baris PAKET: paket katalog yang dijual.
- `patientPackageItemId?` untuk baris TREATMENT yang memakai sesi: item paket customer yang dipakai.
- Jenis baris baru `PAKET` pada enum `InvoiceLineKind`.
- CHECK:
  - baris `PAKET` wajib punya `treatmentPackageId`, dan tidak punya `itemId` maupun `patientPackageItemId`;
  - `patientPackageItemId` hanya untuk baris `TREATMENT`, dengan `unitPrice = 0` dan `discountAmount = 0`.

## 4. Katalog paket (Layanan & Harga, `price:manage`)

- **Tab baru "Paket treatment"** di halaman Layanan & Harga, terlihat bila pengguna punya `price:manage`. Hak halaman itu sekarang `content:manage`, jadi halaman dibuka untuk `content:manage` **atau** `price:manage`; tab lain tetap hanya `content:manage`.
- **Daftar paket:** nama, isi (misal "3× Facial Glow, 2× Peeling"), harga, masa berlaku ("180 hari"), dan status.
- **Tombol:** "+ Paket", "Ubah", dan "Nonaktifkan"/"Aktifkan".
- **Dialog "Tambah paket" / "Ubah paket":**
  - isian Nama, Harga, Masa berlaku (hari), dan Keterangan (opsional);
  - daftar isi, dengan "+ Treatment" untuk memilih layanan dan jumlah sesi, serta tombol hapus per baris.
- **Validasi:** nama wajib; harga 0..2 M; masa berlaku 1..3650 hari; minimal satu treatment; sesi 1..100; treatment tidak boleh ganda.
- **Mengubah paket** tidak mengubah paket yang sudah dijual, karena isinya disalin saat dijual.
- **Audit:** `treatment-package.create`, `.update`, `.activate`, `.deactivate`.

## 5. Menjual paket (tagihan draf, `invoice:manage`)

- **Tombol "+ Paket"** di editor tagihan draf, baik dari kunjungan maupun penjualan langsung. Dialog "Tambah paket" menampilkan paket aktif beserta isi, harga, dan masa berlakunya.
- **Baris yang dibuat:** jenis `PAKET`, `name` = nama paket, `quantity` 1, `unitPrice` = harga katalog, dan keterangan isi.
- **Satu customer boleh membeli paket yang sama lebih dari sekali.** Setiap baris PAKET menjadi satu paket customer.
- **Diskon baris manual** berlaku seperti baris lain, dengan batas gabungan 20%. Promo otomatis hanya untuk barang, tidak berlaku untuk paket.
- **"Segarkan harga katalog"** juga memperbarui harga baris PAKET.
- **Saat tagihan difinalkan,** di transaksi yang sama, per baris PAKET dibuat satu `PatientPackage`:
  - `startsOn` = tanggal finalisasi (WITA);
  - `expiresOn` = `startsOn` + `validDays` − 1;
  - item disalin dari katalog saat itu;
  - satu baris buku BELI +sesi per item.
- **Paket katalog nonaktif:** finalisasi ditolak bila paketnya dinonaktifkan sejak baris ditambahkan ("Paket {nama} sudah tidak dijual. Hapus barisnya.").
- **Pembayaran sebagian** membuat tagihan tampil "Deposit" (bagian 8). Paket sudah aktif sejak final.

## 6. Memakai sesi paket (tagihan draf, `invoice:manage`)

**Paket yang cocok:** paket customer yang memenuhi semua syarat berikut:
- `AKTIF`, dan `expiresOn` ≥ hari ini (WITA);
- punya item dengan `serviceId` sama dengan baris TREATMENT;
- sisa sesinya ≥ jumlah baris dikurangi sesi yang sudah ditandai di draf lain yang masih terbuka.

Sisa itu hanya penanda di layar; pengecekan yang mengikat ada saat finalisasi.

**Di editor draf:**
- Bila tagihan punya customer dengan paket aktif, muncul kotak info: "Customer punya paket aktif: Facial Glow 5x (sisa 3 Facial Glow, berlaku s.d. 12 Apr 2027)."
- Baris TREATMENT (bukan baris bebas tanpa `serviceId`) yang punya paket cocok menampilkan tombol **"Pakai sesi paket"**. Paket yang dipilih otomatis adalah yang kedaluwarsanya paling dekat, dengan pilihan untuk menggantinya bila ada lebih dari satu.
- **Setelah dipakai:**
  - harga baris menjadi Rp 0, diskon baris dihapus, dan `patientPackageItemId` terisi;
  - keterangan: "Sesi paket {nama paket} · sisa {n} dari {jatah} setelah ini";
  - tombol diskon baris disembunyikan untuk baris ini.
- **"Lepas paket"** mengembalikan harga katalog layanan dan mengosongkan `patientPackageItemId`.
- Perubahan jumlah pada baris paket tetap boleh, dan sesi yang dipakai = jumlahnya.

**Saat finalisasi:**
- Semua `PatientPackage` yang dirujuk baris tagihan dikunci, lalu per baris dicek: paket `AKTIF`, belum kedaluwarsa, dan sisa ≥ jumlah.
- Bila gagal, finalisasi ditolak:
  - "Sesi {treatment} di paket {nama} tinggal {n}. Lepas paket atau kurangi jumlahnya."
  - "Paket {nama} sudah kedaluwarsa {tanggal}. Lepas paket atau minta Admin Keuangan memperpanjang."
- Bila berhasil, ditulis satu baris buku PAKAI −jumlah per baris, dengan `invoiceLineId`.

**Pelaksana:** baris TREATMENT dari kunjungan tetap merujuk `encounterTreatmentId`, yang menyimpan perawat atau dokter pelaksana. Data ini dipakai komisi di sub-proyek 4.

## 7. Pembatalan, perpanjangan, dan halaman customer

**Pembatalan tagihan** (`cancelInvoice`, aturannya tetap seperti sekarang ditambah aturan berikut):
- Tagihan yang **memakai sesi**: setiap baris PAKAI mendapat pasangan BATAL_PAKAI +jumlah. Sesi kembali walau paketnya sudah kedaluwarsa.
- Tagihan yang **membeli paket**:
  - bila salah satu paketnya punya baris PAKAI tanpa pasangan BATAL_PAKAI, pembatalan ditolak: "Sesi paket {nama} sudah dipakai di tagihan {nomor}. Batalkan tagihan itu dulu.";
  - bila tidak, `PatientPackage.status` = `DIBATALKAN`, dengan baris BATAL_PAKET −sisa per item.
- **Draf yang dibatalkan** tidak menyentuh buku sesi, karena belum ada sesi yang dipotong.

**Perpanjangan** (`invoice:correct`, Admin Keuangan):
- Tombol **"Perpanjang"** pada paket di halaman customer membuka dialog berisi tanggal kedaluwarsa baru (harus setelah tanggal kedaluwarsa sekarang) dan alasan (wajib, ≤ 200 karakter).
- Hasilnya ditulis sebagai baris buku PERPANJANG dengan tanggal lama dan baru, `expiresOn` diperbarui, dan audit `patient-package.extend`.
- Paket yang `DIBATALKAN` tidak bisa diperpanjang.

**Halaman detail pasien:**
- Kartu **"Paket treatment"** terlihat oleh pemegang `invoice:read`. Isinya per paket:
  - nama, tanggal beli, berlaku s.d., dan status (Aktif / Kedaluwarsa / Dibatalkan / Habis);
  - per treatment: "Facial Glow 2 dari 5 tersisa";
  - riwayat buku: tanggal, jenis, jumlah, dan tagihan terkait (tautan ke tagihan), plus staf dan alasan.
- Urutan: paket aktif dulu, lalu yang lain dari yang terbaru.
- Kartu tidak menampilkan data klinis, hanya nama treatment, sama dengan tagihan.

## 8. Label Deposit, struk, dan laporan

**Label "Deposit":**
- `INVOICE_DISPLAY_LABEL.SEBAGIAN` menjadi "Deposit". Nilai internal `SEBAGIAN` tetap, supaya saringan, URL, dan data tidak berubah.
- Saringan daftar tagihan "Sebagian" menjadi "Deposit".
- Struk: status `SEBAGIAN` tampil **"DEPOSIT"**, dengan baris "Sisa Rp X" yang sudah ada.
- Status hutang supplier ("Sebagian") tidak berubah.

**Struk** (layar, `/struk`, ESC/POS):
- Baris PAKET: nama paket, lalu baris kecil "{isi} · berlaku s.d. {tanggal}". Tanggal hanya ada setelah final.
- Baris pemakaian sesi: nama treatment Rp 0, lalu baris kecil "Sesi paket {nama} · sisa {n}". Sisa dihitung saat struk dibuat dan ditampilkan apa adanya.

**Laporan pendapatan** (`report-sql.ts`):
- Kolom baru **"Paket"**: Σ harga kotor baris `PAKET` pada tagihan final. Total pendapatan tetap Σ total tagihan; diskon baris paket masuk kolom diskon item seperti baris lain.
- Baris pemakaian bernilai Rp 0, jadi tidak menambah kolom treatment.
- Tabel baru **"Sesi paket terpakai"**: jumlah sesi per treatment untuk periode laporan, yaitu Σ PAKAI dikurangi BATAL_PAKAI yang berpasangan, menurut tanggal finalisasi tagihan pemakaian, dengan saringan cabang tagihan pemakaian.

## 9. Hak akses

| Tindakan | Hak |
|---|---|
| Kelola katalog paket | `price:manage` (Admin Keuangan, Super Admin) |
| Menjual paket, memakai/melepas sesi di draf | `invoice:manage` (resepsionis, Super Admin) |
| Memperpanjang paket | `invoice:correct` (Admin Keuangan, Super Admin) |
| Melihat kartu paket di detail pasien | `invoice:read` |
| Membatalkan tagihan | aturan `cancelInvoice` yang ada |

Setiap aksi baru memeriksa hak di server (`requireCapability`), mencatat audit, dan memakai kunci versi draf (`touchDraft`) untuk perubahan draf.

## 10. Teknis

- **Berkas:**
  - aturan murni di `src/lib/treatment-package.ts`: validasi katalog, `expiresOn`, sisa dari baris buku, dan pemilihan paket otomatis;
  - server di `src/server/treatment-package-catalog.ts` (katalog), `src/server/patient-packages.ts` (baca, perpanjang), dan tambahan di `invoice-drafts.ts` (`addPackageLine`, `usePackageSession`, `releasePackageSession`) serta `invoice-lifecycle.ts` (finalisasi, pembatalan).
- **Satu sumber hitung sisa:** sisa sesi selalu dihitung dari `PackageSessionEntry` dengan SUM di basis data. Tidak ada kolom "sisa" yang disimpan.
- **Konkurensi:** finalisasi dan pembatalan mengunci baris tagihan (seperti sekarang) lalu `PatientPackage` terkait, berurutan menurut id. Dua tagihan yang memakai sesi terakhir paket yang sama berjalan bergiliran; yang kedua ditolak.
- **Aturan total tagihan** tidak berubah. Baris PAKET adalah baris biasa dengan harga, dan baris pemakaian bernilai Rp 0.
- **Migrasi** hanya menambah. Jenis enum baru (`PAKET`) ditambahkan dengan `ALTER TYPE … ADD VALUE`. CHECK ditulis di SQL mentah.
- **Tampilan:** panel admin memakai MUI. Situs publik tidak berubah.

## 11. Keamanan dan privasi

- Kartu paket dan struk hanya memuat nama treatment, bukan catatan dokter.
- Harga katalog tidak bisa diubah resepsionis. Baris paket mengikuti aturan harga baris yang ada (resepsionis bisa mengubah harga baris draf dengan catatan, seperti layanan).
- Baris pemakaian tidak bisa diberi harga atau diskon, dan dijaga CHECK.
- Aksi dari permintaan buatan, misalnya memakai paket milik customer lain, ditolak di server. Paket harus milik customer tagihan itu.

## 12. Pengujian

- **Unit:** validasi katalog; perhitungan `expiresOn` (termasuk batas tahun kabisat dan WITA); sisa dari buku; pemilihan paket kedaluwarsa terdekat; label Deposit; struk dengan baris paket dan pemakaian.
- **Integrasi:**
  - katalog (hak, validasi, audit);
  - jual paket → final → paket dan buku BELI dibuat;
  - DP → Deposit;
  - pakai sesi → final → PAKAI;
  - sesi habis atau kedaluwarsa ditolak saat final;
  - dua draf berebut sesi terakhir (yang kedua ditolak);
  - batal tagihan pemakaian → BATAL_PAKAI;
  - batal tagihan pembelian ditolak bila sesi terpakai, dan bila tidak, paket dibatalkan;
  - perpanjangan (hak, tanggal, audit);
  - paket milik customer lain ditolak;
  - laporan kolom Paket dan Sesi terpakai;
  - CHECK basis data.
- **E2E (desktop dan mobile):**
  1. Admin Keuangan membuat paket "Facial … 3x".
  2. Resepsionis menjualnya ke customer baru, final, lalu mencatat DP; tagihan tampil "Deposit".
  3. Kunjungan dengan treatment itu → tagihan → "Pakai sesi paket" → final.
  4. Kartu paket di detail pasien menunjukkan sisa 2 dari 3.
- Uji lama yang memeriksa label "Sebagian" pada tagihan diperbarui.

## 13. Rilis dan risiko

- Migrasi hanya menambah tabel, kolom, nilai enum, dan CHECK. Tidak ada data lama yang diubah.
- Setelah rilis, Admin Keuangan perlu membuat katalog paket sebelum resepsionis bisa menjualnya.
- **Paket yang sudah dijual di sistem lama (Kluto)** tidak dipindahkan otomatis. Sisa sesinya bisa dimasukkan lewat impor Kluto (sub-proyek 5) atau dicatat manual nanti; cara pencatatannya diputuskan di sub-proyek itu.
- **Risiko: baris PAKAI tanpa tagihan final.** Tidak mungkin, karena PAKAI hanya ditulis di transaksi finalisasi.
- **Risiko: paket kedaluwarsa padahal customer masih ingin memakai.** Ditangani lewat perpanjangan oleh Admin Keuangan.
