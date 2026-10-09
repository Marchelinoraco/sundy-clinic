# Desain — Unggah Hasil Timbang BIA

- **Versi:** 1.0
- **Tanggal:** 9 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Menyentuh:** skema basis data (dua tabel baru), rute unggah dan buka berkas, daftar Booking, halaman Kunjungan (tab BIA dan tab Tren), halaman Data Pasien, tabel kemampuan peran, dan penyiapan folder berkas di server. Situs publik dan kuis tidak berubah.

## 1. Latar belakang & tujuan

PRD menjadikan hasil Timbang BIA sebagai nilai jual terbesar program slimming: penurunan lemak dan kenaikan massa otot harus bisa ditunjukkan sebagai grafik (PRD bagian 1 dan sasaran "≥ 70% pasien slimming punya minimal 2 pengukuran BIA di sistem"). Sampai sekarang hasil BIA hanya berupa cetakan alat. Halaman Kunjungan masih menulis "Grafik lengkap menyusul di bagian BIA", dan nginx sudah menyiapkan batas unggahan 20 MB untuk ini.

Tujuan:
- staf klinik mengunggah **berkas hasil BIA** (foto atau PDF cetakan alat) untuk kunjungan hari itu;
- dokter mengisi **tujuh angka** dari hasil itu, sehingga muncul **grafik progres** per pasien;
- berkas dan angka diperlakukan sebagai data klinis: hanya yang berhak membuka, tercatat di jejak audit, tidak pernah dihapus.

Bukan tujuan: membaca angka otomatis dari foto (OCR), tampilan atau unduhan untuk pasien, ekspor, gambar mini, dan penghapusan sungguhan.

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| B1 | Apa yang dilakukan sistem dengan berkas? | Menyimpannya dan menampilkannya. Angka diketik dokter, bukan dibaca otomatis. |
| B2 | Angka apa? | Tujuh: % lemak tubuh, massa otot (kg), lemak viseral, metabolisme basal (kkal), usia metabolik, % air tubuh, massa tulang (kg). Semuanya boleh kosong. Berat badan tidak diisi ulang; memakai tanda vital kunjungan. |
| B3 | Terikat ke apa? | Ke **booking** (kunjungan hari itu), dengan pasien didapat dari booking. Bukan ke pasien lepas. |
| B4 | Siapa mengunggah? | Dokter, Resepsionis, dan Super Admin. Hanya Dokter dan Super Admin yang membuka isi dan mengisi angka. |
| B5 | Di mana disimpan? | Berkas di disk server (`PATIENT_FILES_DIR`, bawaan `/www/sundy-files`), metadata dan angka di basis data. Folder itu sudah ada dan sudah masuk backup harian terenkripsi (`file-pasien.tar.gz`). |
| B6 | Penghapusan | Tidak ada. Yang salah **dibatalkan** dengan alasan; berkas tetap di disk. |

## 3. Data

### 3.1 `BiaMeasurement` (satu pengukuran)

| Kolom | Isi |
|---|---|
| `id`, `createdAt` | Seperti tabel lain. `createdAt` adalah waktu ukur. |
| `appointmentId`, `patientId` | Booking dan pasiennya. |
| `bodyFatPercent` | Desimal(4,1), 2–70. |
| `muscleMassKg` | Desimal(5,1), 5–120. |
| `visceralFat` | Bulat, 1–59. |
| `bmr` | Bulat (kkal), 500–5000. |
| `metabolicAge` | Bulat, 5–110. |
| `bodyWaterPercent` | Desimal(4,1), 20–80. |
| `boneMassKg` | Desimal(3,1), 0,5–10. |
| `note` | Teks bebas, opsional, paling banyak 500 karakter. |
| `numbersByStaffId`, `numbersAt` | Siapa dan kapan angka terakhir disimpan. |
| `version` | Bilangan bulat untuk menolak simpan ganda, seperti catatan kunjungan. |
| `voidedAt`, `voidedByStaffId`, `voidReason` | Pembatalan (alasan wajib). |

Satu booking boleh punya beberapa pengukuran karena yang dibatalkan tidak dihapus, tetapi **hanya satu yang aktif**: indeks unik sebagian pada `appointmentId` untuk baris yang `voidedAt`-nya kosong (SQL mentah di migrasi, seperti pola yang sudah ada di repo).

### 3.2 `BiaFile` (satu berkas)

`id`, `measurementId`, `storageName` (nama acak di disk), `originalName` (hanya untuk tampilan), `mimeType`, `sizeBytes`, `sha256`, `uploadedByStaffId`, `uploadedAt`, dan `voidedAt`, `voidedByStaffId`, `voidReason`. Paling banyak **5 berkas aktif** per pengukuran, diperiksa di dalam transaksi yang sama dengan penyimpanan.

### 3.3 Aturan kunci

- Pengukuran dan berkas hanya untuk booking **kanal klinik** berstatus `HADIR` (sudah check-in) atau `SELESAI`. Konsultasi online tidak ditimbang, jadi tidak punya BIA.
- Selama booking `HADIR`: dokter boleh mengubah angka; resepsionis boleh mengunggah dan membatalkan berkas **yang ia unggah sendiri**.
- Setelah booking `SELESAI` (kunjungan final): angka dan berkas **tidak bisa diubah**. Yang boleh hanya **membatalkan** (dokter dan Super Admin, alasan wajib) dan **menambah pengukuran baru** (hanya dokter dan Super Admin), seperti adendum. Resepsionis tidak bisa mengunggah lagi.
- Aturan ini dijaga di server dan dengan pemicu basis data (mengikuti pola `appointment_record_locked` yang sudah ada), supaya jalan lain tidak bisa mengubah angka setelah final.

## 4. Berkas

### 4.1 Yang diterima

JPG, PNG, WebP, HEIC, dan PDF. Paling besar **10 MB** per berkas. Jenisnya ditentukan dari **isi** (byte awal), bukan dari nama atau ekstensi: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF…WEBP`, HEIC `ftyp` dengan merek `heic`/`heix`/`mif1`, PDF `%PDF-`. Jenis lain ditolak. HEIC tidak bisa ditampilkan di sebagian besar peramban desktop, jadi ditawarkan sebagai **Unduh**, bukan pratinjau; sebagian besar ponsel mengubahnya ke JPG sendiri saat dipilih.

### 4.2 Penyimpanan

`<PATIENT_FILES_DIR>/bia/<tahun>/<bulan>/<uuid>.<ekstensi dari jenis terdeteksi>`. Berkas ditulis ke nama sementara lalu dipindah (`rename`), dengan izin 0600 dan folder 0700. Nama asli tidak pernah menjadi bagian dari jalur di disk. Bila penyimpanan ke basis data gagal, berkas yang sudah tertulis dihapus; bila penulisan gagal, tidak ada baris yang dibuat.

### 4.3 Rute

- `POST /admin/bia/unggah` (multipart): `appointmentId` dan **satu** berkas per permintaan. Klien mengunggah berkas satu per satu, jadi tiap permintaan di bawah batas nginx 20 MB. Memeriksa login, kemampuan `bia:upload`, status booking, batas ukuran dan jumlah, dan header `Origin` sama dengan situs. Jawaban JSON berisi pesan berbahasa Indonesia untuk setiap penolakan.
- `GET /admin/bia/berkas/<id>`: memeriksa login dan hak rekam medis; mengalirkan berkas dengan `Content-Type` dari jenis yang tersimpan, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, dan `Content-Disposition` bernama sesuai nama asli yang sudah dibersihkan. Berkas yang dibatalkan tetap bisa dibuka dokter dan Super Admin dengan penanda "dibatalkan".
- Tidak ada alamat publik, tidak ada pemetaan nginx ke folder berkas.

## 5. Hak akses

Satu kemampuan baru, `bia:upload`: **Super Admin, Dokter, Resepsionis**. Membuka berkas dan angka memakai `record:read` (Dokter dan Super Admin); mengisi dan mengubah angka memakai `record:write`. Peran lain tidak berubah. Resepsionis melihat hanya status ("BIA terunggah, 10.42, oleh Rina"); ia tidak mendapat tautan ke berkas dan tidak melihat angka.

## 6. Layar

### 6.1 Daftar Booking (resepsionis)

Booking klinik berstatus `HADIR` mendapat menu **"Unggah hasil BIA"** di "Aksi lain". Dialognya memilih satu atau beberapa berkas (di ponsel dan tablet langsung membuka kamera atau galeri), menunjukkan kemajuan per berkas, dan menampilkan "Terunggah" atau alasan penolakan. Baris booking mendapat penanda **"BIA terunggah"**. Resepsionis bisa membatalkan unggahannya sendiri dengan alasan selama booking masih `HADIR`.

### 6.2 Halaman Kunjungan (dokter)

Panel konteks mendapat tab **BIA** di antara "Food recall" dan "Sebelumnya":
- daftar berkas pengukuran aktif (nama, waktu, pengunggah) dengan tombol **Buka** (foto di dialog besar, PDF di tab baru, HEIC sebagai Unduh) dan **Unggah** untuk dokter;
- formulir tujuh angka dengan tombol **Simpan angka BIA**, terpisah dari simpan otomatis SOAP. Angka diperiksa rentangnya dan ditolak dengan pesan yang menyebut nama dan rentangnya; desimal boleh memakai koma;
- setelah final: tampilan baca-saja, dengan **Batalkan pengukuran** (alasan wajib). **Tambah pengukuran baru** hanya tersedia setelah pengukuran aktif dibatalkan, karena satu booking hanya boleh punya satu pengukuran aktif.

Tab **Tren** menambah grafik **komposisi tubuh** (MUI X Charts): garis % lemak tubuh dan massa otot per kunjungan, dengan tabel tersembunyi berisi angka tiap kunjungan untuk pembaca layar, seperti grafik laporan. Teks "Grafik lengkap menyusul di bagian BIA" diganti keterangan sumbernya.

### 6.3 Data Pasien (dokter dan Super Admin)

Bagian **BIA**: riwayat pengukuran (tanggal, tujuh angka, tautan ke berkasnya) dan grafik yang sama. Tidak tampil untuk peran lain.

### 6.4 Keadaan kosong dan galat

Pasien tanpa pengukuran: "Belum ada hasil BIA." dan keterangan cara mengunggah. Berkas terlalu besar, jenis tidak dikenal, atau sudah 5 berkas: pesan menyebut batasnya. Unggahan terputus di tengah: berkas itu tidak muncul di daftar dan bisa diulang tanpa merusak yang lain.

## 7. Jejak audit

Memakai `recordAudit`: `bia.upload`, `bia.numbers.save`, `bia.file.void`, `bia.void`. Pembukaan berkas memakai `recordAuditThrottled` (`bia.view`) agar pembukaan beruntun oleh orang yang sama tidak membanjiri log. Ringkasan memuat nama pasien dan kode booking, bukan isi angka.

## 8. Pengujian

- **Unit:** rentang dan format angka (koma, kosong, di luar rentang), deteksi jenis dari byte awal (termasuk berkas palsu berekstensi `.jpg`), pembersihan nama berkas, matriks hak per peran dan status booking, aturan kunci setelah final.
- **Rute (uji dengan basis data uji):** unggah tanpa login ditolak; resepsionis boleh mengunggah tetapi `GET` berkas ditolak; dokter boleh membuka; jenis salah dan berkas lewat 10 MB ditolak; berkas ke-6 ditolak; berkas dibatalkan tetap ada di disk; asal (`Origin`) asing ditolak.
- **Integrasi:** indeks unik sebagian (satu pengukuran aktif), pemicu kunci setelah final, transaksi batas 5 berkas.
- **E2E:** resepsionis mengunggah dari daftar Booking dan tidak dapat membuka; dokter membuka, mengisi angka, melihat grafik di tab Tren; setelah final angka terkunci dan hanya bisa dibatalkan lalu diganti. Di ponsel: dialog unggah dan tab BIA tanpa gulir mendatar. Mode terang dan gelap diperiksa dengan foto, seperti pekerjaan Material UI.

## 9. Penyiapan server dan rilis

- `PATIENT_FILES_DIR` diisi di `shared/.env`; folder `/www/sundy-files` sudah ada (pemilik `sundyapp`, 0700). Aplikasi membuat subfolder `bia/<tahun>/<bulan>` sendiri.
- nginx sudah `client_max_body_size 20m`; tidak ada perubahan.
- Backup sudah memuat folder itu. Uji pemulihan (`restore-test.sh`) diperluas agar memastikan satu berkas contoh di `bia/` ikut pulih dan sidik jarinya sama.
- Disk sisa ±5,5 GB. Asumsi yang belum diukur: ±300 pengukuran per bulan × 2–3 MB ≈ 1 GB per bulan di puncak (jumlah sebenarnya perlu dicek dengan klinik); rilis lama sudah dipangkas ke 3, tetapi pertumbuhan ini perlu masuk pemeriksaan rutin (runbook bagian 9: ambang disk 80%).
- Migrasi hanya **menambah** tabel, jadi `deploy.sh kembali` tetap aman; berkas dan baris yang sudah dibuat tidak dipakai kode lama.

## 10. Risiko dan batasan

- Berkas terikat ke satu server; kehilangan server tanpa backup berarti kehilangan berkas (backup harian terenkripsi dan backup mingguan VM menutup ini).
- HEIC hanya bisa diunduh, bukan dilihat langsung, di peramban desktop.
- Merek alat BIA berbeda mencetak angka berbeda; tujuh angka ini diambil dari yang paling umum. Menambah angka kelak berarti menambah kolom (migrasi kecil).
- Angka diketik manual sehingga bisa salah ketik; rentang yang masuk akal menahan kesalahan besar, dan pembatalan dengan alasan menyediakan jalan koreksi.
