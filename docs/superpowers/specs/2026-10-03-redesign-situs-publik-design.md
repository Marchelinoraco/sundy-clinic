# Desain — Redesign Situs Publik SunDY dengan Animasi & Motion

- **Versi:** 1.0
- **Tanggal:** 3 Oktober 2026
- **Status:** Disetujui pemilik (3 Oktober 2026); foto stok dipilih pemilik 3 Oktober 2026
- **Cakupan:** semua halaman publik di `src/app/(public)`.
  - Alur kuis `/daftar`, `/cek-booking`, dan `/isi` **tidak berubah**. Ketiganya hanya mendapat header, footer, dan transisi baru.
  - Panel admin tidak tersentuh.
- **Mockup:** companion visual 2–3 Oktober 2026 (`.superpowers/brainstorm/67096-1790956714/`, lokal, tidak masuk git). Yang disetujui pemilik:
  - arah **B · Organik Lembut**;
  - susunan Beranda 10 bagian;
  - mockup Layanan, Detail layanan, Program Slimming, dan Tentang, beserta catatan halaman lain.

## 1. Latar belakang & tujuan

Situs publik sekarang rapi tetapi datar.
- Isinya hanya teks dan kartu, tanpa foto atau ilustrasi, dan tanpa gerak sama sekali.
- Program Slimming menumpuk 15 kartu paket dalam satu halaman panjang.
- Halaman detail layanan hampir kosong.

**Tujuan pemilik (keempatnya):**
- lebih banyak pendaftaran (Daftar Konsultasi dan kuis `/daftar`);
- kesan klinik estetika premium;
- informasi yang mudah dicerna di HP;
- membangun kepercayaan.

**Berhasil bila:**
- pengunjung melihat wajah dr. Diane, layanan berfoto, dan harga yang jelas dalam satu gulir pertama di HP;
- gerak terasa hidup tetapi tidak mengganggu, dan berhenti total bagi pengunjung yang memilih "kurangi gerakan";
- situs tetap cepat: skor performa Lighthouse versi HP minimal 85 di Beranda, Layanan, dan Program Slimming;
- isi dan harga tetap terbaca mesin pencari seperti sekarang.

## 2. Keputusan (dikonfirmasi pemilik, 2–3 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| P1 | Tujuan | Pendaftaran, kesan premium, info mudah dicerna, kepercayaan |
| P2 | Foto | **Foto stok sementara** (Unsplash), diganti foto klinik sendiri nanti, ditambah **foto dr. Diane** dari pemilik |
| P3 | Cakupan | Semua halaman publik; foto dokter di Beranda dan Tentang (tanpa halaman dokter tersendiri) |
| P4 | Intensitas gerak | **Berani** |
| P5 | Arah desain | **B · Organik Lembut:** bentuk emas cair, foto dalam bingkai lengkung, kartu melayang, warna krem–emas–cokelat SunDY |
| P6 | Testimoni | Belum ada, jadi bagian testimoni **tidak dibuat**. Tempatnya diisi galeri suasana klinik |
| P7 | Angka | Dari pemilik: **700+ customer**, **berdiri 2026**. Ditambah jumlah treatment dari data |
| P8 | Pendekatan teknis | **Motion untuk React (`motion`) + Lenis (`lenis`)** |
| P9 | Foto dr. Diane | Foto 1 (krem) di hero Beranda dan Tentang; foto 2 (biru) di bagian Dokter Beranda |

## 3. Sistem gerak

### 3.1 Pustaka
- **`motion` (v12):** komponen bergerak, animasi saat digulir (`useScroll`, `useTransform`, `whileInView`), dan tata letak beranimasi.
- **`lenis` (v1):** gulir halus di desktop.
- Tidak ada pustaka animasi lain. `tw-animate-css` yang sudah ada tetap dipakai untuk animasi CSS kecil.

### 3.2 Bahan gerak bersama
Setiap bahan dibuat sekali di `src/components/motion/` dan dipakai di semua halaman:

| Bahan | Perilaku |
|---|---|
| **Muncul saat digulir** | naik ±24 px sambil memudar saat masuk layar, **sekali saja**; versi bergiliran untuk kumpulan kartu (jeda 60–80 ms) |
| **Parallax** | elemen bergeser lebih lambat atau cepat dari gulir halaman, paling jauh ±60 px |
| **Bentuk emas cair** | gumpalan bergradasi emas yang berubah bentuk pelan (siklus 8–12 dtk), sedikit ikut bergeser saat digulir; untuk latar hero, kepala halaman, dan ajakan akhir |
| **Foto bingkai lengkung** | bingkai berujung setengah lingkaran; foto "naik" dari bawah bingkai saat pertama terlihat, lalu zoom pelan |
| **Kartu melayang** | naik-turun pelan ±8 px (kartu kecil di hero) |
| **Kartu miring** | miring paling jauh 6° mengikuti kursor (kartu treatment); hanya di perangkat dengan kursor |
| **Tombol magnet** | tombol tertarik paling jauh 8 px ke arah kursor; hanya di perangkat dengan kursor |
| **Angka berhitung** | dari 0 ke nilai akhir dalam ±1,5 dtk saat masuk layar, sekali saja; akhiran seperti "+" tetap tampil |
| **Langkah menempel** | bagian yang menempel saat digulir; langkah 1→2→3 menyala bergantian dan foto berganti (desktop). Di HP berupa kartu bertumpuk yang muncul satu per satu |
| **Tombol pilihan beranimasi** | penanda pilihan meluncur ke tombol aktif; isi panel berganti dengan geser + pudar |
| **Akordeon** | membuka dengan animasi tinggi; ikon berputar |
| **Transisi masuk halaman** | isi halaman memudar dan naik ±12 px setiap pindah halaman (`template.tsx` di `(public)`) |

### 3.3 Aturan kinerja & aksesibilitas
- **Server tetap merender isi.** Teks, harga, dan data dirender di server seperti sekarang. Komponen bergerak hanya membungkus isi itu (pulau `"use client"` kecil).
- **Isi tetap terlihat tanpa animasi.** Elemen yang muncul saat digulir tetap terlihat bila JavaScript belum jalan, dan mesin pencari tetap membaca seluruh isi.
- **"Kurangi gerakan"** (`prefers-reduced-motion: reduce`):
  - semua bahan langsung menampilkan keadaan akhirnya;
  - angka langsung bernilai akhir;
  - tanpa parallax, tanpa bentuk yang berubah, tanpa gulir halus, dan tanpa transisi halaman.
- **Layar sentuh:**
  - Lenis tidak mengubah gulir asli HP;
  - kartu miring dan tombol magnet mati (`pointer: coarse`).
- **Hanya `transform` dan `opacity`** yang dianimasikan; tidak ada animasi lebar, tinggi, atau posisi tata letak, kecuali akordeon.
- **Foto:**
  - memakai `next/image`;
  - foto hero dimuat paling dulu (`priority`), dan yang lain dimuat saat mendekati layar;
  - ukuran disesuaikan per lebar layar.
- **Tata letak:** tidak ada gulir mendatar di lebar 390 px di semua halaman publik.
- **Aksesibilitas:**
  - fokus keyboard tetap terlihat;
  - tombol pilihan paket dan akordeon dapat dipakai dengan keyboard dan pembaca layar;
  - foto bermakna punya teks alternatif, sedangkan bentuk hiasan disembunyikan dari pembaca layar.

## 4. Foto & isi

### 4.1 Foto stok sementara
- **Sumber:** Unsplash, yang lisensinya boleh dipakai komersial tanpa wajib mencantumkan atribusi. Sumber setiap foto tetap dicatat di `public/images/stok/SUMBER.md`.
- **Kebutuhan (±18 foto):**
  - 3 untuk langkah cara kerja: konsultasi, timbang dan menu makan, kontrol;
  - 1 per kategori layanan (11): facial, peeling, rf, hifu, botox, laser, dermapen, elektrocauter, skin-booster, vitamin-c, slimming-wellness;
  - 3 untuk suasana klinik;
  - 1–2 untuk produk.
- **Persetujuan:** pemilik menyetujui pilihan foto lewat companion visual **sebelum plan dibuat**.
- **Tanpa wajah yang menyesatkan:** tidak boleh ada foto wajah orang yang bisa disangka customer atau staf SunDY.
- **Penyimpanan:**
  - diperkecil (sisi panjang paling besar 1600 px, JPEG kualitas ±80) di `public/images/stok/`;
  - nama tetap per kegunaan, misalnya `kategori-hifu.jpg`, `langkah-konsultasi.jpg`, `suasana-1.jpg`.
- **Pemetaan:** foto, teks alternatif, dan kegunaannya dipetakan di satu berkas `src/lib/site-images.ts`.
  - Nanti foto klinik sendiri cukup menimpa berkas bernama sama, tanpa mengubah kode.
  - `Service.imageUrl` dan `Product.imageUrl` yang terisi (kelak lewat admin) didahulukan daripada foto kategori.

### 4.2 Foto dr. Diane
- **Lokasi asli:** dua foto potret dari pemilik ada di `public/dokter-1.jpg` (krem) dan `public/dokter-2.jpg` (biru), ±17 MB berdua.
- **Salinan web:** sisi panjang 1600 px, JPEG ±80, disimpan sebagai `public/images/dokter/diane-1.jpg` dan `public/images/dokter/diane-2.jpg`.
- **Berkas asli** dipindah ke `~/Documents/2026/sundy-aset/` (disetujui pemilik 3 Okt 2026). Tidak pernah masuk repo.
- **Pemakaian:**
  - foto 1: hero Beranda dan Tentang;
  - foto 2: bagian Dokter di Beranda.
- **Teks alternatif:** "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic".

### 4.3 Angka & teks
- **Konstanta di `src/lib/clinic.ts`:** `CLINIC_FOUNDED_YEAR = 2026` dan `CUSTOMER_COUNT = 700` (ditampilkan "700+"), dengan komentar asal: "angka dari pemilik, 3 Okt 2026".
- **Jumlah treatment** dihitung dari layanan aktif di database.
- **Data dokter** (nama, gelar, dan profil) diambil dari data staf dengan `showOnWebsite`. Saat ini hanya dr. Diane.
- **Teks:**
  - memakai tagline asli ("Happy weight, happy life", "Your Beauty, Our Priority") dan teks yang sudah ada;
  - **tanpa klaim, rating, atau ulasan karangan**;
  - halaman publik tetap memakai "Anda" dan "customer", **tanpa kata "pasien" atau "berobat"**.

## 5. Halaman

### 5.1 Header & footer (semua halaman publik)
- **Header:**
  - menempel di atas;
  - transparan di atas hero, lalu menjadi krem dengan latar buram setelah digulir ±40 px, dan sedikit memendek;
  - menu halaman aktif bergaris emas;
  - tombol **Daftar Konsultasi** bergerak sebagai tombol magnet.
- **Menu HP:** tombol garis tiga membuka panel yang meluncur dari kanan. Panel memuat semua menu, Daftar Konsultasi, dan WhatsApp, dan tertutup saat tautan diklik atau Esc ditekan.
- **Footer:** isi sama seperti sekarang, ditata ulang dengan bentuk emas di latar.
- **Tombol WhatsApp melayang** tetap ada, dengan animasi masuk.

### 5.2 Beranda
Sepuluh bagian, sesuai mockup yang disetujui:

| # | Bagian | Isi | Gerak |
|---|---|---|---|
| 1 | Header | §5.1 | §5.1 |
| 2 | Hero | nama klinik, tagline, Daftar Konsultasi + Program Slimming, **foto 1 dr. Diane** dalam bingkai lengkung, kartu "dr. Diane Paparang, Sp.GK" dan "700+ customer" | bentuk emas cair, foto naik dari bingkai, judul per baris, kartu melayang, parallax |
| 3 | Angka | 700+ customer · Sejak 2026 · {N} treatment · Senin–Sabtu 11.00–19.00 | angka berhitung (kecuali tahun dan jam) |
| 4 | Keunggulan | empat nilai jual yang sudah ada, dengan ikon | bergiliran; kartu terangkat saat disentuh |
| 5 | Cara kerja Program Slimming | 1 · Konsultasi dokter, 2 · Timbang BIA & meal plan, 3 · Kontrol mingguan, dengan foto stok per langkah dan tautan ke Program Slimming | langkah menempel (desktop), kartu bertumpuk (HP) |
| 6 | Signature Treatment | layanan signature yang sudah ada, dengan foto kategori dan harga | bergiliran; foto zoom dan kartu miring; di HP digeser menyamping dengan jepretan per kartu |
| 7 | Dokter | **foto 2 dr. Diane**, nama, gelar, profil, dan tombol "Konsultasi dengan dr. Diane" (ke `/daftar`) | foto dari bingkai lengkung dengan bentuk emas; teks masuk dari samping |
| 8 | Suasana klinik | 3 foto stok suasana | parallax beda kecepatan |
| 9 | Lokasi | kartu cabang yang sudah ada; label "Segera hadir" untuk Citraland | kartu naik; label berdenyut pelan |
| 10 | Ajakan akhir | "Mulai perjalanan sehat Anda", Daftar Konsultasi + Chat WhatsApp | bentuk emas bergerak; tombol magnet |

### 5.3 Layanan & Harga (`/layanan`)
- **Kepala halaman:** judul, "{N} treatment · harga promo berlaku", dan foto lengkung kecil dengan bentuk emas.
- **Chip kategori:**
  - menempel di bawah header;
  - menyala mengikuti kategori yang sedang terlihat;
  - klik chip menggulir halus ke kategorinya (dengan "kurangi gerakan": lompat langsung);
  - di HP, chip bisa digeser menyamping.
- **Bagian per kategori:** kartu berfoto (foto kategori, atau `Service.imageUrl` bila ada) berisi nama, deskripsi singkat, dan harga coret + harga berlaku. Kartu muncul bergiliran.

### 5.4 Detail layanan (`/layanan/[slug]`)
- **Kepala halaman:**
  - jejak, judul, harga coret + harga berlaku, dan deskripsi;
  - chip durasi dan kategori;
  - tombol Daftar Konsultasi dan Tanya via WhatsApp;
  - foto kategori dalam bingkai lengkung.
- **Baru: "Treatment lain di {kategori}":** sampai 3 layanan lain dalam kategori yang sama, sebagai kartu. Bagian ini tidak tampil bila tidak ada.
- **Baru: bar bawah di HP:** menempel di bawah layar setelah tombol utama tergulir lewat, berisi harga berlaku, Daftar, dan WhatsApp. Bar tidak menutupi footer, karena halaman diberi ruang bawah setinggi bar.

### 5.5 Program Slimming (`/program-slimming`)
- **Kepala halaman:** judul dan "Setiap paket sudah termasuk konsultasi dokter dan Timbang BIA…" (teks yang sudah ada).
- **Tombol pilihan paket:**
  - **MAX · LUX · ACTIVE** menggantikan tiga kelompok paket yang ditumpuk;
  - pilihan tersimpan di `?paket=max|lux|active` (bawaan max), sehingga tautan bisa dibagikan;
  - memakai pola ARIA tablist (panah kiri/kanan berpindah);
  - di bawah tombol: slogan kelompok, lalu kartu paket kelompok itu dengan nama, harga per bulan, dan isi paket (centang muncul bergiliran);
  - **semua paket dan isinya tetap sama** dengan data sekarang.
- **Bagian berikutnya:**
  - cara kerja tiga langkah (bahan yang sama dengan Beranda);
  - Layanan satuan (kartu yang sudah ada);
  - Nutrigenomics segera hadir;
  - Daftar Konsultasi.

### 5.6 Halaman lain
- **Produk:** kartu berfoto (`Product.imageUrl`, atau foto stok produk) yang muncul bergiliran, dan tombol "Pesan via WhatsApp" tetap ada. Produk tidak punya kategori, jadi tanpa chip.
- **Lokasi & detail lokasi:** kartu cabang dengan foto suasana, tombol petunjuk arah (cabang aktif), label "Segera hadir" berdenyut, dan "Beri tahu saya saat buka" tetap ada. Peta dan alamat seperti sekarang.
- **Tentang:**
  - kepala halaman dengan foto 1 dr. Diane;
  - "Cerita kami" dari teks yang ada, muncul per paragraf;
  - chip 700+ customer · Sejak 2026;
  - bagian dokter (bahan yang sama dengan Beranda);
  - galeri suasana.
- **FAQ:**
  - akordeon beranimasi;
  - kotak cari yang menyaring pertanyaan saat mengetik, dengan "Tidak ada pertanyaan yang cocok." bila kosong;
  - isi pertanyaan tetap.
- **Kebijakan Privasi, Syarat & Ketentuan, `/daftar`, `/cek-booking`, `/isi`:** hanya mendapat header, footer, dan transisi baru. Isi dan alurnya tidak berubah.

## 6. Data & teknis
- **Database:** tanpa migrasi. Dibaca dari tabel yang ada, yaitu layanan, kategori, paket, produk, cabang, dan staf `showOnWebsite`.
- **Dependensi baru:** `motion` dan `lenis`.
- **Bebas dari gerak:** komponen kuis `/daftar` dan halaman admin tidak mengimpor bahan gerak, dan Lenis hanya dipasang di layout `(public)`.
- **SEO tetap:** metadata, judul halaman, `sitemap`, dan `robots` tidak berubah.
- **Gambar:** `next/image` dengan berkas lokal di `public/images/`, tanpa domain luar.

## 7. Pengujian

**Unit**
- Setiap bahan gerak dengan "kurangi gerakan" langsung merender keadaan akhir:
  - angka berhitung bernilai akhir;
  - elemen muncul-saat-digulir terlihat;
  - tanpa parallax.
- Angka berhitung berakhir tepat di nilai akhir dengan akhiran yang benar.
- Tombol pilihan paket:
  - klik dan panah kiri/kanan;
  - `?paket=` dibaca, dan nilai yang tidak dikenal kembali ke MAX;
  - kartu yang tampil sesuai kelompok.
- FAQ: akordeon dibuka dan ditutup, kotak cari menyaring, dan pesan kosong tampil.
- Chip kategori Layanan: chip aktif mengikuti kategori yang terlihat, dengan `IntersectionObserver` di-mock.
- Bar bawah detail layanan: tampil setelah tombol utama tergulir lewat.
- Pemetaan foto: kategori tanpa foto memakai foto cadangan, dan `imageUrl` didahulukan.

**E2E** (desktop dan ponsel)
- Uji situs publik yang ada disesuaikan:
  - paket LUX dan ACTIVE tampil setelah tombolnya diklik;
  - judul dan tautan yang dipakai uji tetap ada.
- Baru:
  - semua halaman publik tanpa gulir mendatar di lebar ponsel;
  - dengan `reducedMotion: "reduce"`, isi Beranda, Layanan, dan Program Slimming langsung terlihat;
  - menu HP terbuka dan menutup;
  - bar bawah detail layanan di ponsel;
  - `?paket=lux` membuka kelompok LUX;
  - kuis `/daftar` tetap bisa diisi sampai kode booking (uji yang ada).

**Kinerja**
- Lighthouse versi HP (`npx lighthouse`, tidak ditambahkan ke `package.json`) untuk Beranda, Layanan, dan Program Slimming, sebelum dan sesudah.
- Performa minimal 85 dan aksesibilitas minimal 90. Hasilnya dicatat di ledger.

## 8. Di luar cakupan
- Testimoni dan ulasan (belum ada yang asli).
- Halaman dokter tersendiri.
- Unggah foto dari panel admin; foto klinik sendiri cukup menimpa berkas di `public/images/`.
- Perubahan alur kuis `/daftar`, panel admin, dan teks hukum.
- Versi bahasa Inggris.
