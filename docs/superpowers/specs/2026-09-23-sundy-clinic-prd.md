# PRD — Sistem Klinik SunDY (Situs Publik + Admin & Rekam Medis)

- **Versi:** 1.1
- **Tanggal:** 23 September 2026
- **Status:** Menunggu review pemilik
- **Klinik:** SunDY — Nutrition, Slimming & Wellness Clinic, Manado
- **Kontak resmi:** WhatsApp 0851-7222-8900 (+62 851-7222-8900) · Instagram @sundyclinic
- **Tagline:** "Happy weight, happy life" · "Your Beauty, Our Priority"

**Cabang**

| Cabang | Alamat | Status |
|---|---|---|
| SunDY Mahakeret | Jl. Garuda No. 10, Mahakeret Barat, Manado | Beroperasi — menerima booking |
| SunDY Citraland | Citraland — Cluster The Manhattan, Manado | Segera hadir — belum menerima booking |

**Jam operasional (kedua cabang):** Senin–Sabtu, 11.00–19.00 WITA. Minggu dan hari libur nasional tutup.

**Dokter:** dr. Diane Paparang (praktik di SunDY Mahakeret). Sistem dirancang multi-dokter; untuk saat ini hanya satu dokter yang ditampilkan.

**Perubahan dari versi 1.0:** dukungan multi-cabang dinaikkan dari Fase 3 ke MVP; jam operasional, hari libur nasional, dan data dokter dikonfirmasi pemilik.

---

## 1. Ringkasan Eksekutif

SunDY Clinic saat ini menjalankan pendaftaran dan skrining pasien lewat Google Form terpisah, dan seluruh komunikasi booking terjadi manual di WhatsApp. Katalog layanan tersebar di gambar promosi Instagram. Tidak ada tempat tunggal yang menyimpan riwayat klinis pasien, sehingga progres program slimming (yang sifatnya berbulan-bulan) sulit dievaluasi dokter secara objektif.

Produk ini menyatukan tiga hal dalam satu sistem:

1. **Situs publik** — etalase layanan aesthetic & program slimming lengkap dengan harga, katalog produk, dan **pendaftaran konsultasi mandiri** di mana pasien melihat slot dokter yang benar-benar kosong (contoh: Kamis 15.00 dan 17.00) lalu memilihnya sendiri.
2. **Panel admin** — pengelolaan jadwal dokter, verifikasi booking, dan pengelolaan konten katalog.
3. **Rekam medis elektronik** — riwayat kunjungan, catatan SOAP dokter, hasil Timbang BIA, treatment yang dijalani, dan **grafik progres berat badan & komposisi tubuh** per pasien.

**Hasil yang dikejar:** admin berhenti menjadi calendar manusia, dokter punya data objektif untuk evaluasi program, dan pasien bisa mendaftar jam 11 malam tanpa menunggu admin membalas.

---

## 2. Latar Belakang & Masalah

| Masalah hari ini | Dampak |
|---|---|
| Booking hanya via chat WhatsApp | Admin harus membalas satu per satu, cek buku jadwal manual, rawan double-booking dan salah catat. Di luar jam kerja, calon pasien menunggu atau batal. |
| Skrining pakai Google Form terpisah | Jawaban food recall berhenti di spreadsheet, tidak menempel di riwayat pasien, dan dokter harus membuka aplikasi lain saat konsultasi. |
| Riwayat klinis tersebar di catatan kertas / chat | Saat pasien kontrol bulan ke-3, dokter sulit membandingkan dengan kondisi bulan ke-1. Program slimming kehilangan bukti keberhasilan. |
| Harga & layanan hanya ada di gambar promosi | Calon pasien harus bertanya dulu ("berapa harga HIFU?"), menambah beban admin dan memperlambat keputusan. |
| Hasil Timbang BIA tidak terakumulasi | Nilai jual terbesar program (penurunan lemak, kenaikan massa otot) tidak bisa ditunjukkan sebagai grafik ke pasien. |

---

## 3. Sasaran & Ukuran Keberhasilan

### Sasaran produk
1. Pasien baru dapat menyelesaikan pendaftaran konsultasi sendiri dari HP dalam waktu di bawah 3 menit.
2. Seluruh kunjungan pasien tercatat di satu rekam medis yang dapat ditelusuri dokter.
3. Katalog layanan & harga dapat diperbarui admin sendiri tanpa bantuan developer.
4. Progres pasien program slimming dapat ditampilkan sebagai grafik saat konsultasi.

### Ukuran keberhasilan (dievaluasi 3 bulan setelah rilis)
| Metrik | Target |
|---|---|
| Booking yang masuk lewat situs (bukan chat manual) | ≥ 40% dari total booking |
| Waktu admin memproses satu booking | < 1 menit (dari sebelumnya percakapan bolak-balik) |
| Kunjungan yang punya catatan rekam medis lengkap | ≥ 90% |
| Double-booking slot dokter | 0 kejadian |
| Pasien slimming dengan minimal 2 kali pengukuran BIA di sistem | ≥ 70% |

### Bukan sasaran rilis ini (Non-Goals)
- Keranjang belanja, checkout, dan pengiriman produk (fase berikutnya).
- Pembayaran online otomatis lewat payment gateway.
- Aplikasi mobile native.
- Integrasi SATUSEHAT / BPJS.
- Login mandiri untuk pasien dengan dashboard pribadi.
- Telemedicine / konsultasi video.

---

## 4. Pengguna & Peran

| Peran | Siapa | Kebutuhan utama | Akses |
|---|---|---|---|
| **Calon pasien / pasien** | Publik, mayoritas dari Instagram, hampir semua lewat HP | Lihat layanan & harga, lihat slot kosong, daftar konsultasi, cek status booking | Situs publik saja. Tidak punya akun. |
| **Resepsionis / Admin Klinik** | Staf front office | Verifikasi booking masuk, atur ulang jadwal, daftarkan pasien walk-in, catat kehadiran | Panel admin — data booking & demografi pasien **di cabang tempatnya ditempatkan**. **Tidak bisa membuka isi catatan klinis SOAP.** |
| **Dokter** | Dokter klinik | Lihat jadwal hari ini, buka rekam medis pasien, isi SOAP, input hasil BIA, catat treatment & resep, lihat grafik progres | Panel admin — penuh atas rekam medis pasiennya. |
| **Super Admin / Pemilik** | Pemilik klinik | Kelola akun staf, kelola katalog & harga, atur jadwal dokter, lihat laporan | Seluruh panel admin + manajemen pengguna + audit log. |

---

## 5. Lingkup Rilis Pertama (MVP)

Disepakati masuk MVP:

- ✅ Situs publik: profil klinik, katalog treatment & paket + harga, halaman produk (tampilan saja, pemesanan diarahkan ke WhatsApp)
- ✅ Pendaftaran konsultasi mandiri dengan tampilan slot kosong per dokter
- ✅ Form skrining digital (pengganti Google Form "Recall Form")
- ✅ Panel admin: kelola jadwal dokter, verifikasi booking, kelola konten katalog
- ✅ Rekam medis pasien: riwayat kunjungan, SOAP, treatment, resep
- ✅ Grafik progres pasien (berat badan, % lemak tubuh, massa otot dari hasil BIA)
- ✅ **Dukungan multi-cabang** — dua lokasi, jadwal dokter per cabang, kunjungan tercatat per cabang

**Catatan multi-cabang.** Satu katalog layanan & harga berlaku di seluruh cabang. **Rekam medis pasien menyatu lintas cabang** — pasien yang pernah datang ke Mahakeret dan kemudian ke Citraland tetap memakai satu nomor rekam medis dan satu timeline, karena dokternya sama dan kontinuitas perawatan adalah inti program slimming. Setiap kunjungan mencatat cabang tempat ia terjadi, sehingga laporan per cabang tetap bisa dibuat.

---

## 6. Fitur — Situs Publik

### F1. Beranda
Ringkasan klinik, empat nilai jual dari materi promosi (*Professional Treatment, Premium Technology, Safe & Hygienic, Beauty For You*), sorotan promo berjalan, testimoni, dan dua tombol aksi utama: **"Daftar Konsultasi"** dan **"Chat WhatsApp"**. Tombol WhatsApp mengambang tersedia di seluruh halaman.

### F2. Katalog Layanan
Dua kategori besar, masing-masing dengan halaman detail per layanan:

- **Aesthetic** — RF, Facial, HIFU, Botox, Peeling, Vitamin C, Dermapen, Elektrocauter, Skin Booster, Laser, Meso
- **Slimming & Wellness** — paket bulanan MAX / LUX / ACTIVE dan layanan satuan

Setiap layanan menampilkan: nama, deskripsi manfaat, foto, durasi perkiraan, **harga normal dicoret + harga promo** (mengikuti gaya materi promosi klinik), dan tombol "Daftar Konsultasi untuk layanan ini".

Halaman detail layanan dibuat ramah mesin pencari (URL sendiri, judul & deskripsi meta, data terstruktur), karena ini pintu masuk pasien yang mencari "HIFU Manado" atau "klinik slimming Manado".

### F3. Katalog Produk (tampilan saja)
Daftar produk klinik (kapsul, suplemen, skincare) dengan foto, deskripsi, dan harga. Tombol "Pesan via WhatsApp" membuka chat ke 0851-7222-8900 dengan pesan terisi otomatis menyebut nama produk. Tidak ada keranjang, stok, maupun checkout di rilis ini.

### F4. Jadwal & Ketersediaan Dokter
Halaman yang menampilkan kalender per dokter **pada cabang yang dipilih**. Pasien memilih tanggal, sistem menampilkan slot yang benar-benar kosong pada tanggal itu — contoh: `Kamis, 25 Sep — 15.00 ✓ · 16.00 (penuh) · 17.00 ✓`. Slot yang sudah lewat, sudah dipesan, jatuh di luar jam praktik dokter di cabang itu, atau jatuh pada hari libur tidak muncul sebagai pilihan.

**Aturan ketersediaan:**
- Zona waktu sistem: **WITA (Asia/Makassar, UTC+8)**. Seluruh waktu disimpan dalam UTC dan ditampilkan dalam WITA.
- Jam operasional: **Senin–Sabtu 11.00–19.00**. Minggu tutup.
- **Hari libur nasional tutup.** Sistem membawa daftar hari libur nasional & cuti bersama Indonesia per tahun (mengacu SKB 3 Menteri), dapat disunting dan ditambah admin. Tanggal yang ditandai libur tidak memunculkan slot apa pun di seluruh cabang.
- Booking paling cepat: **2 jam** dari sekarang.
- Booking paling jauh: **30 hari** ke depan.
- Durasi slot default: **30 menit** untuk konsultasi (dapat diatur per dokter per cabang).
- Ketersediaan dihitung per kombinasi **dokter × cabang**: seorang dokter tidak dapat memiliki dua slot bersamaan di cabang berbeda, sehingga booking di satu cabang otomatis menutup jam yang sama di cabang lain.
- Saat pasien memilih slot, slot ditahan sementara (**hold 10 menit**) agar tidak direbut pasien lain selama pengisian form. Hold yang kedaluwarsa otomatis dilepas.

**Data awal:** dr. Diane Paparang — SunDY Mahakeret, Senin–Sabtu 11.00–19.00. SunDY Citraland belum memiliki jadwal dokter sehingga tidak dapat dipilih saat booking.

### F5. Pendaftaran Konsultasi
Alur 4 langkah, mobile-first:

1. **Tujuan & lokasi** — Slimming / Aesthetic / Lainnya, opsional memilih layanan yang diminati, lalu memilih cabang. Cabang Citraland tampil dengan label **"Segera Hadir"** dan tidak dapat dipilih; di bawahnya tersedia tautan "Beri tahu saya saat buka" yang mengarah ke WhatsApp klinik. Selama hanya satu cabang aktif, langkah ini otomatis memilih Mahakeret dan tidak menambah klik bagi pasien.
2. **Pilih dokter & jadwal** — pilih dokter tertentu atau "dokter mana saja yang tersedia" di cabang itu, lalu pilih tanggal & slot.
3. **Data diri** — nama lengkap, nomor WhatsApp, tanggal lahir, jenis kelamin, pekerjaan, alamat, keluhan/tujuan. Untuk tujuan Slimming, ditambah **form skrining**: berat badan, tinggi badan, dan food recall harian (makanan utama, snack, minuman, cemilan) — konten diambil dari Google Form yang berjalan sekarang.
4. **Konfirmasi** — sistem menampilkan ringkasan, persetujuan penggunaan data pribadi, lalu menerbitkan **kode booking** (format `SDY-XXXX`).

Setelah submit, pasien diarahkan ke halaman sukses berisi kode booking, detail jadwal, instruksi pembayaran, dan tombol besar **"Konfirmasi via WhatsApp"**. Tombol ini membuka chat ke 0851-7222-8900 dengan pesan terisi otomatis:

> *Halo SunDY Clinic, saya sudah booking konsultasi. Kode: SDY-8F3K, atas nama Siti Rahayu, dengan dr. Diane Paparang di cabang Mahakeret, Kamis 25 Sep 2026 pukul 15.00. Berikut bukti transfernya.*

Pasien mengirim bukti transfer di chat tersebut, admin memverifikasi di panel.

### F6. Cek Status Booking
Halaman publik: masukkan **kode booking + 4 digit terakhir nomor WhatsApp** untuk melihat status (Menunggu Konfirmasi / Terkonfirmasi / Selesai / Dibatalkan), detail jadwal, dan tombol batalkan (paling lambat 2 jam sebelum jadwal, selaras dengan batas minimum pemesanan; di bawah itu pasien diarahkan menghubungi admin). Tidak ada data klinis yang ditampilkan di halaman ini.

### F7. Halaman Lokasi & Pendukung

**Halaman lokasi** — satu halaman berisi kedua cabang:

- **SunDY Mahakeret** — Jl. Garuda No. 10, Mahakeret Barat, Manado. Senin–Sabtu 11.00–19.00. Peta, tombol "Petunjuk Arah", tombol "Daftar Konsultasi".
- **SunDY Citraland** — Citraland, Cluster The Manhattan, Manado. Ditandai **"Segera Hadir"** dengan peta lokasi dan tombol "Beri tahu saya saat buka" ke WhatsApp klinik.

Setiap cabang memiliki URL sendiri agar dapat dioptimalkan untuk pencarian lokal ("klinik kecantikan Mahakeret", "klinik slimming Citraland Manado").

**Halaman pendukung** — Tentang klinik & tim dokter (dr. Diane Paparang), jam operasional, FAQ, Kebijakan Privasi, dan Syarat & Ketentuan.

---

## 7. Fitur — Panel Admin

### F8. Dasbor
Booking hari ini, booking yang menunggu verifikasi, jadwal per dokter hari ini, dan ringkasan angka minggu berjalan.

### F9. Manajemen Booking
Daftar booking dengan filter (tanggal, **cabang**, dokter, status). Aksi: **verifikasi** (Menunggu → Terkonfirmasi), **jadwal ulang**, **batalkan**, **tandai hadir**, **tandai tidak hadir**. Admin juga dapat membuat booking manual untuk pasien walk-in atau yang menelepon. Setiap booking terkonfirmasi menyediakan teks konfirmasi siap-salin untuk dikirim admin lewat WhatsApp.

### F10. Manajemen Jadwal Dokter
- **Template mingguan** per **dokter per cabang**: data awal — dr. Diane Paparang, SunDY Mahakeret, Senin–Sabtu 11.00–19.00, slot 30 menit. Admin dapat menambah baris untuk cabang atau dokter baru tanpa bantuan developer.
- **Pengecualian tanggal**: cuti dokter, jam tambahan, atau blokir sebagian jam.
- **Kalender hari libur**: daftar hari libur nasional & cuti bersama per tahun yang dapat disunting admin. Tanggal libur menutup slot di seluruh cabang sekaligus, sesuai kebijakan klinik ("tanggal merah tutup").
- Sistem menolak template yang membuat satu dokter berada di dua cabang pada jam yang sama.
- Perubahan template tidak membatalkan booking yang sudah terkonfirmasi; sistem menandai bentrokan agar admin menyelesaikannya secara sadar.

### F11. Manajemen Pasien
Pencarian pasien berdasarkan nama, nomor WhatsApp, atau nomor rekam medis. Setiap pasien punya **nomor rekam medis** otomatis berformat `SDY-2026-0001`. Sistem mendeteksi kemungkinan duplikat berdasarkan nomor WhatsApp dan menawarkan penggabungan.

### F12. Rekam Medis Elektronik
Halaman pasien berisi timeline kunjungan. Per kunjungan (encounter), dokter mengisi:

- **S (Subjective)** — keluhan, riwayat, hasil form skrining/food recall bila ada
- **O (Objective)** — pemeriksaan fisik, tanda vital, **hasil Timbang BIA**
- **A (Assessment)** — penilaian/diagnosis
- **P (Plan)** — rencana tindakan, paket program yang dijalankan, resep

Ditambah data yang melekat pada pasien (bukan per kunjungan): alergi, riwayat penyakit, obat rutin, catatan penting — ditampilkan sebagai banner peringatan di setiap kunjungan.

**Pencatatan treatment:** treatment yang dijalankan, area tubuh, dosis bila relevan (contoh: Botox 12 unit area dahi), pelaksana, dan catatan pasca-tindakan.

**Pencatatan hasil BIA:** tanggal, berat (kg), tinggi (cm), BMI, persen lemak tubuh, massa otot (kg), lemak visceral, persen air tubuh, BMR.

**Aturan integritas:** catatan klinis yang sudah difinalisasi tidak dapat dihapus. Koreksi dilakukan lewat **adendum** yang tercatat waktu dan penulisnya, mengikuti prinsip rekam medis.

### F13. Grafik Progres Pasien
Grafik garis dari seluruh pengukuran BIA pasien: berat badan, persen lemak tubuh, dan massa otot terhadap waktu, dengan penanda kapan program dimulai. Dapat ditampilkan ke pasien saat konsultasi dan diekspor sebagai gambar/PDF untuk dibagikan.

### F14. Manajemen Konten & Cabang
CRUD untuk kategori layanan, layanan (termasuk harga normal & harga promo, durasi, foto), paket slimming beserta isinya, produk, dokter, banner promo, dan FAQ. Semua dapat dikelola pemilik tanpa developer.

**Manajemen cabang**: nama, alamat, titik peta, nomor WhatsApp (bila nanti berbeda per cabang), jam operasional, dan **status** — `AKTIF` (bisa dibooking) atau `SEGERA_HADIR` (tampil di situs, tidak bisa dibooking). Mengaktifkan cabang Citraland nanti cukup dengan mengubah status dan mengisi jadwal dokternya, tanpa perubahan kode.

Katalog layanan, paket, dan harga bersifat global — satu kali ubah, berlaku di seluruh cabang.

### F15. Manajemen Pengguna & Audit
Pembuatan akun staf beserta perannya. **Audit log** mencatat siapa membuka, membuat, atau mengubah rekam medis mana dan kapan — wajib untuk rekam medis elektronik dan tidak dapat dihapus dari antarmuka.

### F16. Laporan Sederhana
Jumlah kunjungan per periode, layanan terpopuler, tingkat ketidakhadiran (no-show), pasien baru vs kunjungan ulang, dan ekspor CSV. Seluruh laporan dapat disaring **per cabang** maupun digabung, sehingga performa Citraland dapat dibandingkan dengan Mahakeret begitu cabang kedua beroperasi.

---

## 8. Alur Utama

### Alur booking (jalur normal)

```
Pasien buka situs
  → pilih tujuan konsultasi (Slimming / Aesthetic)
  → pilih cabang (Mahakeret aktif · Citraland "Segera Hadir")
  → pilih dokter & lihat kalender
  → pilih slot kosong (Kamis 15.00)            [slot di-hold 10 menit]
  → isi data diri + form skrining
  → setujui kebijakan privasi & submit
  → terima kode booking SDY-8F3K, status: MENUNGGU KONFIRMASI
  → klik "Konfirmasi via WhatsApp" → kirim bukti transfer ke 0851-7222-8900

Admin buka panel
  → lihat booking menunggu verifikasi
  → cocokkan dengan bukti transfer di WhatsApp
  → klik Verifikasi → status: TERKONFIRMASI
  → salin teks konfirmasi → kirim ke pasien

Hari H
  → admin tandai HADIR
  → dokter buka rekam medis pasien → isi SOAP, BIA, treatment
  → status: SELESAI
```

### Status booking

`MENUNGGU_KONFIRMASI` → `TERKONFIRMASI` → `HADIR` → `SELESAI`

Cabang: `DIBATALKAN` (oleh pasien atau admin) · `TIDAK_HADIR` (lewat jadwal tanpa kedatangan) · `KEDALUWARSA` (tidak dikonfirmasi dalam 24 jam, slot dilepas otomatis).

### Penanganan kasus khusus
| Kasus | Perilaku sistem |
|---|---|
| Dua pasien memilih slot sama bersamaan | Slot pertama yang menahan (hold) menang; pasien kedua melihat pesan "slot baru saja terisi" dan kalender dimuat ulang. |
| Pasien tidak konfirmasi dalam 24 jam | Booking `KEDALUWARSA`, slot kembali tersedia. |
| Dokter mendadak berhalangan | Admin menandai pengecualian tanggal; sistem menampilkan daftar booking terdampak untuk dijadwal ulang satu per satu. |
| Pasien lama booking lagi | Sistem mengenali nomor WhatsApp dan menautkan ke rekam medis yang sudah ada, bukan membuat pasien baru. |
| Pasien walk-in | Admin membuat booking manual; bila slot penuh, dapat menambahkan di luar slot dengan penanda "walk-in". |
| Pasien membuka kalender di tanggal merah | Tanggal ditampilkan nonaktif dengan keterangan nama hari liburnya (contoh: "Libur — Hari Natal"), bukan sekadar kosong tanpa penjelasan. |
| Pasien mencoba booking di cabang Citraland | Cabang tidak dapat dipilih; muncul ajakan "Segera Hadir — beri tahu saya saat buka" yang mengarah ke WhatsApp klinik. |
| Pasien Mahakeret pindah ke Citraland nanti | Rekam medis dan nomor RM tetap sama; kunjungan baru tercatat dengan cabang Citraland. Tidak ada data yang perlu dipindahkan. |

---

## 9. Model Data

Entitas inti dan hubungannya:

| Entitas | Isi pokok | Relasi |
|---|---|---|
| `Branch` | nama, alamat, koordinat peta, no. WhatsApp, jam operasional, status (`AKTIF` / `SEGERA_HADIR`), urutan tampil | punya ScheduleTemplate, Appointment, Encounter |
| `Holiday` | tanggal, nama hari libur, jenis (libur nasional / cuti bersama / libur klinik), tahun | berlaku global lintas cabang |
| `Patient` | no. rekam medis, nama, no. WhatsApp, tanggal lahir, jenis kelamin, pekerjaan, alamat, alergi, riwayat penyakit | punya banyak Appointment, Encounter, Measurement — **tidak terikat cabang** |
| `Doctor` | nama, no. SIP, spesialisasi, foto, bio, aktif | punya ScheduleTemplate, ScheduleException, Appointment |
| `ScheduleTemplate` | **cabang**, dokter, hari dalam minggu, jam mulai, jam selesai, durasi slot, jeda | milik Doctor × Branch |
| `ScheduleException` | dokter, opsional cabang, tanggal, jenis (libur / jam tambahan / blokir sebagian), rentang jam | milik Doctor |
| `Appointment` | kode booking, **cabang**, pasien, dokter, waktu mulai & selesai (UTC), tujuan, layanan diminati, status, catatan, sumber (online/walk-in) | milik Patient, Doctor & Branch; menghasilkan satu Encounter |
| `SlotHold` | cabang, dokter, waktu, kedaluwarsa, token sesi | sementara, dibersihkan otomatis |
| `IntakeForm` | jawaban skrining & food recall (JSON terstruktur), tertaut appointment | milik Appointment |
| `Encounter` | tanggal, **cabang**, dokter, S, O, A, P, status (draf/final) | milik Patient & Branch; punya banyak TreatmentRecord, Prescription, Measurement |
| `EncounterAddendum` | isi koreksi, penulis, waktu | milik Encounter |
| `Measurement` | tanggal, berat, tinggi, BMI, % lemak, massa otot, lemak visceral, % air, BMR | milik Patient, opsional tertaut Encounter |
| `TreatmentRecord` | layanan, area, dosis, pelaksana, catatan | milik Encounter |
| `Prescription` | item (kapsul M/L, Fat Blocker/Burner, Inject S/T), dosis, aturan pakai | milik Encounter |
| `ServiceCategory` / `Service` | nama, deskripsi, harga normal, harga promo, durasi, foto, urutan, aktif | Service milik ServiceCategory |
| `Package` / `PackageItem` | nama paket, harga per bulan, deskripsi, daftar isi | PackageItem milik Package |
| `Product` | nama, deskripsi, harga, foto, aktif | mandiri |
| `User` / `Role` | email, kata sandi terenkripsi, peran (SUPER_ADMIN / DOKTER / RESEPSIONIS), **cabang penempatan**, aktif | User dapat tertaut ke Doctor; resepsionis dibatasi pada cabangnya, SUPER_ADMIN & dokter melihat seluruh cabang |
| `AuditLog` | aktor, aksi, entitas, id entitas, waktu, alamat IP | hanya-tambah, tidak dapat diubah |

---

## 10. Persyaratan Non-Fungsional

**Bahasa & lokal.** Seluruh antarmuka berbahasa Indonesia. Format tanggal Indonesia (`Kamis, 25 September 2026`), mata uang Rupiah (`Rp 499.000`), zona waktu WITA.

**Perangkat.** Dirancang mobile-first — mayoritas pengunjung datang dari tautan Instagram di HP. Panel admin dioptimalkan untuk desktop namun tetap terpakai di tablet.

**Performa.** Halaman publik dimuat di bawah 2,5 detik pada koneksi 4G. Kalender slot merespons di bawah 500 ms.

**Ketersediaan.** Situs publik harus dapat diakses 24/7; pendaftaran di luar jam kerja adalah salah satu alasan utama produk ini dibuat.

**Keamanan.**
- Seluruh lalu lintas lewat HTTPS.
- Kata sandi staf disimpan sebagai hash (Argon2id).
- Pembatasan laju (rate limit) pada endpoint booking dan login untuk mencegah penyalahgunaan.
- Kontrol akses berbasis peran ditegakkan di sisi server, bukan hanya disembunyikan di antarmuka. Resepsionis secara teknis tidak dapat mengambil isi catatan klinis.
- Nomor WhatsApp dan tanggal lahir tidak pernah tampil utuh di halaman publik.
- Pencadangan basis data harian, dengan uji pemulihan minimal sekali sebelum rilis.

**Kepatuhan.** Sistem ini menyimpan data kesehatan, yang tergolong data pribadi bersifat spesifik.
- **UU No. 27 Tahun 2022 (Pelindungan Data Pribadi)** — wajib ada persetujuan eksplisit saat pendaftaran, kebijakan privasi yang jelas, pembatasan akses, dan mekanisme permintaan penghapusan data non-medis.
- **Permenkes No. 24 Tahun 2022 (Rekam Medis Elektronik)** — rekam medis wajib memiliki jejak audit, tidak boleh dihapus, dan disimpan sekurang-kurangnya 25 tahun sejak kunjungan terakhir. Desain ini memenuhi audit trail dan larangan penghapusan sejak MVP.
- **Integrasi SATUSEHAT** diwajibkan bagi fasilitas pelayanan kesehatan. Ini berada di luar lingkup MVP namun model data disiapkan agar tidak menghalangi integrasi di kemudian hari. **Perlu dikonfirmasi pemilik:** status registrasi klinik dan tenggat kepatuhan yang berlaku.

---

## 11. Arsitektur & Teknologi

Keputusan: **Next.js**, dengan biaya awal nol.

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Satu basis kode untuk situs publik dan panel admin. Rendering server memberi SEO yang dibutuhkan halaman layanan. |
| Antarmuka | **Tailwind CSS + shadcn/ui** | Komponen siap pakai untuk tabel, formulir, dan kalender admin; tema disesuaikan dengan identitas emas-krem SunDY. |
| Basis data | **PostgreSQL (Neon, paket gratis)** | Relasional — cocok untuk rekam medis yang butuh integritas. Paket gratis cukup untuk tahap awal. |
| ORM | **Prisma** | Migrasi berversi, tipe aman, mengurangi kesalahan pada skema yang cukup besar ini. |
| Autentikasi staf | **Auth.js (NextAuth) — kredensial + sesi basis data** | Tanpa layanan pihak ketiga berbayar; sesi dapat dicabut. |
| Penyimpanan gambar | **Cloudinary (paket gratis)** | Optimasi & pengubahan ukuran otomatis untuk foto treatment dan produk. |
| Grafik | **Recharts** | Ringan, cukup untuk grafik progres BIA. |
| Pengujian | **Vitest** (unit) + **Playwright** (alur booking ujung-ke-ujung) | Logika ketersediaan slot wajib punya pengujian otomatis. |
| Hosting tahap awal | **Vercel (paket Hobby)** | Gratis, deploy langsung dari repositori. |

### Catatan penting soal hosting produksi
Paket **Vercel Hobby gratis hanya untuk penggunaan non-komersial**; situs klinik yang menerima pasien termasuk komersial. Rencana yang saya sarankan:

- **Tahap pengembangan & uji coba:** Vercel Hobby + Neon gratis — biaya Rp 0.
- **Saat go-live:** pindah ke **VPS Indonesia** (Biznet/IDCloudHost/Rumahweb, kisaran Rp 80.000–150.000/bulan) menjalankan Next.js + PostgreSQL dengan Docker. Tiga keuntungan sekaligus: sesuai ketentuan lisensi, latensi lebih rendah untuk pengguna Manado, dan **data rekam medis berada di dalam negeri** — pertimbangan nyata untuk data kesehatan. Alternatif: Vercel Pro (USD 20/bulan) bila ingin tetap tanpa mengelola server.

Aplikasi dirancang portabel (Docker + PostgreSQL standar) sehingga perpindahan ini tidak memerlukan penulisan ulang.

---

## 12. Keputusan yang Perlu Dikonfirmasi

| # | Keputusan | Yang saya usulkan | Catatan |
|---|---|---|---|
| D1 | **Verifikasi nomor pasien** | MVP: tanpa OTP. Verifikasi terjadi alami saat pasien mengirim bukti transfer lewat WhatsApp. | Anda sempat memilih OTP WhatsApp, namun tidak ada layanan OTP WhatsApp yang gratis (Meta Cloud API menagih per pesan; gateway lokal seperti Fonnte ±Rp 100.000/bulan). Bila tingkat ketidakhadiran ternyata tinggi, OTP dapat ditambahkan di Fase 1.5 tanpa mengubah alur. |
| D2 | ~~Jam operasional & jumlah dokter~~ | **Selesai.** Senin–Sabtu 11.00–19.00, tanggal merah tutup. Satu dokter tampil: dr. Diane Paparang di SunDY Mahakeret. Sistem tetap multi-dokter & multi-cabang. | Dikonfirmasi pemilik, 23 Sep 2026. |
| D2b | **Jadwal dr. Diane bila Citraland buka** | Belum ditentukan. | Saat Citraland siap, perlu keputusan pembagian hari (misal Senin–Rabu Mahakeret, Kamis–Sabtu Citraland) atau penambahan dokter kedua. Cukup diisi lewat panel admin, tanpa perubahan kode. |
| D2c | **Nomor WhatsApp cabang Citraland** | Sementara memakai nomor yang sama, 0851-7222-8900. | Bila nanti Citraland punya nomor sendiri, tinggal diisi di data cabang. |
| D3 | **Harga Vitamin C** | Ditranskrip apa adanya dari materi promosi. | Materi menulis "1.299 JT" untuk Injek Vit C 2000mg. Bila maksudnya Rp 1.299.000 sudah benar; bila seharusnya Rp 299.000, mohon dikoreksi sebelum tayang. |
| D4 | **Ketikan pada paket LUX T ACTIVE** | Diperbaiki menjadi "Kapsul **L**-Fat Burner". | Materi promosi menulis "Kapsul M-Fat Burner-Inject T" padahal paket LUX lain memakai Kapsul L. Kemungkinan salah ketik di desain. |
| D5 | **Biaya konsultasi & DP** | Konsultasi Dokter Rp 200.000 ditampilkan; besaran DP untuk mengunci slot belum ditentukan. | Perlu keputusan: apakah pasien membayar penuh di muka, DP sebagian, atau bayar di klinik dengan bukti transfer hanya untuk booking berbayar. |
| D6 | **Domain & email klinik** | Belum ada. | Diperlukan sebelum go-live (contoh: `sundyclinic.com`). |

---

## 13. Rencana Bertahap

**Fase 1 — MVP (lingkup dokumen ini)**
Situs publik + katalog + pendaftaran konsultasi + panel admin + rekam medis + grafik progres, dengan dukungan multi-cabang sejak awal (Mahakeret aktif, Citraland "Segera Hadir").

**Fase 1.1 — Pembukaan cabang Citraland**
Tanpa pekerjaan developer: pemilik mengubah status cabang menjadi `AKTIF` dan mengisi jadwal dokternya lewat panel admin. Cabang langsung dapat menerima booking.

**Fase 1.5 — Penyempurnaan pasca-rilis**
OTP WhatsApp otomatis dan pengingat H-1 lewat gateway WhatsApp lokal, bila data menunjukkan ketidakhadiran tinggi.

**Fase 2 — Perluasan**
Toko online penuh (keranjang, stok, ongkir, pesanan), pembayaran online (Midtrans/Xendit), akun pasien dengan riwayat mandiri, program loyalitas & paket kunjungan.

**Fase 3 — Kepatuhan & skala**
Integrasi SATUSEHAT, manajemen inventaris & stok obat per cabang, transfer stok antar cabang, laporan keuangan, dan dukungan cabang ketiga dan seterusnya.

---

## Lampiran A — Daftar Layanan & Harga (dari materi promosi klinik)

Harga dicoret adalah harga normal; harga tebal adalah harga promo berjalan.

### Signature Treatment
| Layanan | Normal | Promo |
|---|---|---|
| Peeling | Rp 149.000 | **Rp 99.000** |
| RF | Rp 389.000 | **Rp 289.000** |
| HIFU | Rp 749.000 | **Rp 499.000** |
| Skin Booster | Rp 989.000 | **Rp 889.000** |

### RF Treatment
| Layanan | Normal | Promo |
|---|---|---|
| RF Perut | Rp 749.000 | **Rp 499.000** |
| RF Paha | Rp 499.000 | **Rp 329.000** |
| RF Lengan | Rp 389.000 | **Rp 289.000** |
| RF Wajah | Rp 389.000 | **Rp 289.000** |

### Facial
| Layanan | Normal | Promo |
|---|---|---|
| Relaxing Facial | Rp 189.000 | **Rp 149.000** |
| Facial Brightening | Rp 289.000 | **Rp 249.000** |
| Facial Acne | Rp 289.000 | **Rp 249.000** |

### HIFU & Botox
| Layanan | Normal | Promo |
|---|---|---|
| HIFU Wajah | Rp 749.000 | **Rp 499.000** |
| HIFU Miss V | Rp 649.000 | **Rp 489.000** |
| HIFU Perut | Rp 1.000.000 | **Rp 699.000** |
| Botox | — | **Rp 50.000 / unit** |

### Peeling
| Layanan | Normal | Promo |
|---|---|---|
| Peeling | Rp 149.000 | **Rp 99.000** |
| Peeling Premium | Rp 349.000 | **Rp 299.000** |
| Paket Peeling Premium (3x) | — | **Rp 799.000** |

### Vitamin C *(lihat keputusan D3)*
| Layanan | Normal | Promo |
|---|---|---|
| Injek Vit. C 2000mg | Rp 1.449.000 | **Rp 1.299.000** |
| Injek Vit. C 1100mg | Rp 1.249.000 | **Rp 1.199.000** |
| Infus Vit. C 1100mg | Rp 1.499.000 | **Rp 1.299.000** |
| Infus Vit. C 2000mg | Rp 1.699.000 | **Rp 1.499.000** |

### Dermapen, Elektrocauter & Skin Booster
| Layanan | Normal | Promo |
|---|---|---|
| Dermapen | Rp 749.000 | **Rp 589.000** |
| Dermapen PRP | Rp 1.189.000 | **Rp 898.000** |
| Elektrocauter | Rp 248.000 | **Rp 188.000** |
| Skin Booster HA | Rp 3.890.000 | **Rp 3.589.000** |
| Skin Booster DNA Salmon | Rp 989.000 | **Rp 889.000** |
| Eyebooster | Rp 2.389.000 | **Rp 2.189.000** |

### Laser & Meso
| Layanan | Normal | Promo |
|---|---|---|
| Laser Rejuve / Fleck | Rp 849.000 | **Rp 399.000** |
| Laser 2 in 1 | Rp 1.000.000 | **Rp 599.000** |
| Lip Laser | Rp 249.000 | **Rp 99.000** |
| Meso Treatment (slimming) | — | **Rp 550.000 / 5 titik** |

---

## Lampiran B — Program Slimming

### Paket MAX (Fat Blocker)
| Paket | Harga / bulan | Isi |
|---|---|---|
| MAX | Rp 1.125.000 | Konsul & Timbang BIA, Kapsul M, Fat Blocker |
| MAX SLIM | Rp 1.925.000 | Konsul & Timbang BIA, Kapsul M, Fat Blocker, Inject S |
| MAX T | Rp 2.525.000 | Konsul & Timbang BIA, Kapsul M, Fat Blocker, Inject T |

### Paket LUX (Fat Blocker)
| Paket | Harga / bulan | Isi |
|---|---|---|
| LUX | Rp 1.500.000 | Konsul & Timbang BIA, Kapsul L, Fat Blocker |
| LUX SLIM | Rp 2.300.000 | Konsul & Timbang BIA, Kapsul L, Fat Blocker, Inject S |
| LUX T | Rp 2.900.000 | Konsul & Timbang BIA, Kapsul L, Fat Blocker, Inject T |

### Paket ACTIVE (Fat Burner)
| Paket | Harga / bulan | Isi |
|---|---|---|
| MAX ACTIVE | Rp 1.125.000 | Konsul & Timbang BIA, Kapsul M, Fat Burner |
| MAX SLIM ACTIVE | Rp 1.925.000 | Konsul & Timbang BIA, Kapsul M, Fat Burner, Inject S |
| MAX T ACTIVE | Rp 2.525.000 | Konsul & Timbang BIA, Kapsul M, Fat Burner, Inject T |
| LUX ACTIVE | Rp 1.500.000 | Konsul & Timbang BIA, Kapsul L, Fat Burner |
| LUX SLIM ACTIVE | Rp 2.300.000 | Konsul & Timbang BIA, Kapsul L, Fat Burner, Inject S |
| LUX T ACTIVE | Rp 2.900.000 | Konsul & Timbang BIA, Kapsul L, Fat Burner, Inject T *(lihat keputusan D4)* |

### Layanan Satuan
| Layanan | Harga |
|---|---|
| Konsultasi Dokter | Rp 200.000 |
| Timbang BIA | Rp 350.000 |
| Meal Plan | Rp 300.000 |
| Nutrigenomics Program | Segera hadir |

---

## Lampiran C — Form Skrining Digital

Menggantikan Google Form "Recall Form Sundy Clinic Manado". Jawaban tersimpan sebagai bagian rekam medis, bukan di spreadsheet terpisah.

**Data dasar** — nama lengkap, pekerjaan, usia/tanggal lahir, berat badan (kg), tinggi badan (cm), jenis kelamin, tujuan konsultasi.

**Food recall harian** — makanan utama (pagi, siang, malam), snack, minuman, dan cemilan yang biasa dikonsumsi.

Field yang sudah ada di data pasien (nama, jenis kelamin, tanggal lahir, pekerjaan) terisi otomatis pada kunjungan berikutnya sehingga pasien lama tidak mengetik ulang. Berat badan dan tinggi badan yang diisi pasien masuk sebagai pengukuran mandiri dan dibedakan dari hasil Timbang BIA resmi di klinik.
