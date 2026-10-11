# Desain — Edit Profil Dokter di Halaman Publik

- **Versi:** 1.0
- **Tanggal:** 9 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Menyentuh:** dialog Ubah di halaman Staf, `updateStaff`, satu rute unggah foto di panel, satu rute publik `/foto-dokter/<nama>`, pengolahan gambar di server, `package.json` (`sharp`), dan pengecekan asal permintaan yang dipakai bersama dengan unggah BIA. Halaman publik (`/` dan `/tentang`) tidak diubah tampilannya. Tidak ada migrasi basis data.

## 1. Latar belakang & tujuan

Halaman "Tim Dokter" (dan beranda) menampilkan staf berperan Dokter atau Terapis yang aktif dan `showOnWebsite`: nama, spesialisasi, deskripsi singkat, foto, dan tombol konsultasi. Datanya sudah ada di tabel `Staff` (`specialty`, `bio`, `photoUrl`), tetapi tidak ada layar untuk mengubahnya. Dialog Ubah di halaman Staf hanya mengubah nama, peran, dan tampil di situs. Foto dokter hari ini berasal dari berkas bawaan situs (`public/images/dokter`) yang dipetakan lewat slug, sehingga dokter baru tidak punya foto kecuali pengembang menambahkannya.

Tujuan: Super Admin mengedit **spesialisasi, deskripsi singkat, dan foto** dokter yang tampil di situs dari panel, tanpa pengembang, dengan foto yang aman dipublikasikan.

Bukan tujuan: mengedit nomor SIP (tidak tampil di situs), urutan dokter, galeri foto klinik, alat pemotong gambar, dan unggahan massal.

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| P1 | Cakupan | Teks (spesialisasi, deskripsi) dan unggah foto. |
| P2 | Penyimpanan foto | Disk server di `<PATIENT_FILES_DIR>/dokter/` (`/www/sundy-files/dokter/`, sudah masuk backup harian terenkripsi), disajikan lewat rute publik `/foto-dokter/<nama>`. `Staff.photoUrl` menyimpan jalur lokal itu; kode situs sudah mendukung `photoUrl` berbentuk jalur lokal. |
| P3 | Siapa | Super Admin saja (`staff:manage`), seperti pengelolaan staf. |
| P4 | Pengolahan | Foto diolah di server dengan `sharp`: putar sesuai EXIF, susutkan, simpan ulang sebagai WebP, buang semua metadata (termasuk lokasi GPS). |
| P5 | Alur foto | Pilih berkas → pratinjau lokal dalam bingkai lengkung → "Pakai foto ini". Foto langsung terpublikasi saat dipakai; teks butuh tombol Simpan. |

## 3. Data

Tidak ada kolom atau migrasi baru: `specialty`, `bio`, dan `photoUrl` sudah ada. Yang bertambah adalah aturan isinya:

- `specialty`: satu baris, paling banyak **100** karakter; kosong berarti tidak ditampilkan.
- `bio`: paling banyak **600** karakter; kosong berarti tidak ditampilkan. Teks biasa (tanpa HTML); halaman publik sudah mencetaknya sebagai teks.
- `photoUrl`: bila diisi oleh fitur ini, berbentuk `/foto-dokter/<idStaf>-<sidikJari8>.webp`. Nilai lama (kosong) tetap berarti "pakai foto bawaan situs bila ada".

## 4. Foto

### 4.1 Yang diterima

JPG, PNG, dan WebP, paling besar **8 MB**, jenisnya dikenali dari **isi** berkas (byte awal), bukan nama atau tipe kiriman. HEIC tidak diterima (`accept` pada kotak pilih berkas membuat peramban ponsel mengonversinya ke JPG). Sisi terpendek gambar minimal **600 px**; lebih kecil ditolak karena akan tampak buram di bingkai 4:5. Jumlah piksel masukan dibatasi (40 juta) supaya "bom gambar" tidak menghabiskan memori server 2 GB.

### 4.2 Pengolahan

`sharp` membaca gambar, memutarnya sesuai EXIF (`rotate()`), menyusutkan sisi terpanjangnya ke paling besar **1600 px** tanpa memperbesar, lalu menyimpannya sebagai **WebP** kualitas 82. Hasilnya **tidak membawa metadata apa pun**, jadi lokasi GPS, tipe kamera, dan tanggal pemotretan tidak ikut terpublikasi. Berkas yang tidak bisa dibaca `sharp` sebagai gambar ditolak dengan pesan jelas, apa pun nama dan tipenya.

### 4.3 Penyimpanan

Nama berkas: `<idStaf>-<sidikJari8>.webp`, dengan sidik jari dari isi hasil olahan. Berkas ditulis ke nama sementara lalu dipindah (`rename`), izin 0644 (dibaca aplikasi saja lewat rute, tetapi tidak sensitif), folder `dokter/` dibuat otomatis. Nama berkas **tidak pernah** berasal dari masukan pengguna.

### 4.4 Penyajian

`GET /foto-dokter/<nama>` (publik, tanpa login):
- hanya nama berpola `^[0-9a-z]+-[0-9a-f]{8}\.webp$` yang diproses; selebihnya 404;
- berkas hanya disajikan bila ada staf **aktif** dengan `showOnWebsite` dan `photoUrl` sama persis dengan jalur itu; foto dokter yang dinonaktifkan atau disembunyikan tidak bisa dibuka (404), dan jalur yang tidak ada di basis data tidak dibaca dari disk;
- header `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, dan `Cache-Control: public, max-age=300`. Cache sengaja singkat: pengoptimal gambar Next.js (`/_next/image`) dan Cloudflare menyimpan sesuai angka ini, sehingga foto dokter yang disembunyikan, dinonaktifkan, atau dihapus berhenti tersaji dalam **paling lama 5 menit**, bukan setahun. Rute `/foto-dokter/<nama>` sendiri langsung 404; hanya salinan di cache yang bertahan sampai kedaluwarsa. Untuk mencabut segera, rilis baru mengosongkan cache pengoptimal dan Cloudflare di-purge dari panelnya.

**Pratinjau di panel:** `GET /admin/staf/foto/<nama>` (login dan `staff:manage`, `Cache-Control: private, no-store`, pola nama yang sama) menyajikan foto terpasang tanpa memeriksa tampil-tidaknya dokter di situs. Dialog Ubah memakainya, karena staf baru bawaannya tersembunyi dan pemilik menyiapkan profilnya dulu sebelum menampilkannya. Teks dan petunjuk di dialog menyebut bahwa foto baru tampil di situs setelah dokter ditampilkan.

### 4.5 Mengganti dan menghapus

- **Ganti:** foto baru ditulis dulu, baris `Staff.photoUrl` diperbarui, lalu berkas lama dihapus. Bila penulisan berkas berhasil tetapi pembaruan basis data gagal, berkas baru dihapus kembali.
- **Hapus:** `photoUrl` dikosongkan lalu berkasnya dihapus; tampilan kembali ke foto bawaan situs bila ada (Dr. Diane punya), atau tanpa foto.
- Berbeda dari data klinis (yang tidak pernah dihapus), foto profil publik boleh dihapus karena bukan catatan medis dan tidak ada nilai historisnya.

## 5. Layar dan alur

### 5.1 Dialog Ubah

Untuk staf berperan Dokter atau Terapis, dialog Ubah (halaman Staf) mendapat bagian **"Tampil di situs publik"**:

- **Spesialisasi** dan **Deskripsi singkat**, masing-masing dengan hitungan karakter. Disimpan bersama nama dan peran lewat tombol **Simpan**.
- **Foto:** pratinjau di dalam **bingkai lengkung 4:5** yang bentuknya sama dengan di halaman publik, supaya pemilik melihat bagian foto yang terpotong. Tombol *Pilih foto* (bisa dipakai lewat papan ketik) dan *Hapus foto* (bila ada foto). Petunjuk: "Foto potret (tegak) paling bagus, minimal 600 px."
- **Alur foto:** memilih berkas menampilkan pratinjau lokal beserta tombol **"Pakai foto ini"** dan *Batal*. Menekan "Pakai foto ini" mengunggah dan langsung memublikasikannya; layar menyatakan dengan jelas bahwa foto tidak menunggu tombol Simpan.
- **Penolakan** tampil di dalam dialog dalam bahasa Indonesia: jenis berkas tidak didukung, lebih dari 8 MB, terlalu kecil, atau tidak bisa dibaca sebagai gambar.

### 5.2 Halaman publik

Tampilan tidak berubah, kecuali deskripsi dicetak dengan `white-space: pre-line` sehingga baris baru yang diketik pemilik tampil sebagai paragraf terpisah. Setelah teks atau foto berubah, `/` dan `/tentang` disegarkan (`revalidatePath`).

## 6. Teknis

- **`src/lib/doctor-profile.ts`** (murni): `SPECIALTY_MAX = 100`, `BIO_MAX = 600`, `validateSpecialty`, `validateBio`, `DOCTOR_PHOTO_NAME` (pola nama berkas), `DOCTOR_PHOTO_MAX_BYTES`, `DOCTOR_PHOTO_MIN_SIDE`.
- **`src/server/doctor-photo.ts`:** `processDoctorPhoto(bytes)` (sharp), `saveDoctorPhoto`, `removeDoctorPhotoFile`, `readDoctorPhoto(nama)`; folder dari `PATIENT_FILES_DIR` seperti penyimpanan BIA.
- **`src/server/same-origin.ts`:** `isSameOrigin(request)` (header `host` saja, seperti unggah BIA setelah perbaikannya); unggah BIA beralih memakainya, tanpa mengubah perilakunya.
- **Rute unggah:** `POST /admin/staf/foto` (`staffId` dan satu berkas): login, `staff:manage`, asal permintaan, tolak dini bila `Content-Length` jelas terlalu besar (413), lalu proses.
- **Aksi server:** `updateStaff` diperluas (spesialisasi dan deskripsi opsional: bila tidak dikirim, tidak berubah); `removeStaffPhoto(staffId)`; fungsi `uploadStaffPhoto` yang dipanggil rute.
- **Rute publik:** `src/app/(public)/foto-dokter/[nama]/route.ts` memakai fungsi server (arsitektur: `src/app` tidak mengimpor Prisma langsung).
- **Dependensi:** `sharp` dijadikan dependensi langsung di versi yang sudah terpasang (`^0.35.4`); sebelumnya hanya ikut Next.js sebagai dependensi opsional.
- **Audit:** `staff.update` (teks), `staff.photo.update`, `staff.photo.remove`, dengan label bahasa manusia. Ringkasan memuat nama staf, bukan isi deskripsi.

## 7. Keamanan

- Hanya Super Admin yang bisa mengunggah, mengganti, atau menghapus; rute dan aksi menolak peran lain di server.
- Jenis berkas dikenali dari isinya dan hasil akhirnya selalu WebP buatan `sharp`, bukan berkas kiriman pengguna, sehingga HTML, SVG, atau skrip yang menyamar sebagai gambar tidak pernah disajikan.
- Metadata dibuang, termasuk lokasi GPS foto ponsel.
- Nama berkas disusun server (id staf + sidik jari); rute publik hanya menerima pola ketat dan hanya melayani foto yang terdaftar di basis data milik staf aktif yang tampil di situs. Tidak ada celah jalur (`../`).
- Batas ukuran, batas piksel, dan penolakan dini menjaga memori server.
- Pengecekan asal permintaan (`host`) berlaku untuk rute unggah, seperti unggah BIA.

## 8. Pengujian

- **Unit:** validasi spesialisasi dan deskripsi (batas, kosong, spasi), pola nama berkas (termasuk `../`, ekstensi lain, huruf besar), komponen dialog (hitungan karakter, pratinjau, tombol, galat, tombol dapat dioperasikan lewat papan ketik).
- **Integrasi:**
  - `processDoctorPhoto`: metadata GPS terbuang (gambar uji dibuat dengan EXIF), orientasi EXIF dikoreksi, disusutkan ke 1600 px dan tidak diperbesar, terlalu kecil ditolak, berkas bukan gambar (HTML bernama .jpg) ditolak, batas piksel ditegakkan.
  - Mengganti foto menghapus berkas lama; menghapus foto mengosongkan `photoUrl` dan menghapus berkas; kegagalan pembaruan basis data tidak meninggalkan berkas yatim.
  - Rute publik: melayani foto staf aktif yang tampil di situs dengan header yang benar; 404 untuk staf nonaktif, staf yang disembunyikan, nama berpola salah, dan nama yang tidak terdaftar.
  - Hak: peran selain Super Admin ditolak di unggah dan hapus; `updateStaff` tanpa spesialisasi/deskripsi tidak mengubahnya.
- **E2E:** pemilik menambah dokter yang tampil di situs, mengisi spesialisasi dan deskripsi, mengunggah foto; `/tentang` menampilkan teks dan gambarnya terbuka (lebar alami > 0); foto dihapus; dokter disembunyikan; foto tidak bisa dibuka lagi.

## 9. Rilis dan risiko

- Tanpa migrasi; `deploy.sh kembali` aman (rilis lama menampilkan foto dari `photoUrl` yang sama lewat rute yang tidak ada di rilis itu, sehingga foto unggahan tidak muncul sampai rilis baru kembali; teks tetap tampil).
- Folder `/www/sundy-files/dokter/` dibuat otomatis oleh aplikasi; ukuran total kecil (puluhan KB per foto).
- `next/image` mengoptimasi foto lewat rute publik; E2E membuktikan gambar benar-benar termuat. Bila pengoptimal gambar gagal membaca dari rute (dalam produksi), cadangannya memasang `unoptimized` pada foto unggahan; ini diuji sebelum rilis dengan satu foto contoh.
- Foto yang diunggah adalah milik pemilik; kualitas bingkai (potongan 4:5 dari tengah) bergantung pada foto, bukan pada alat pemotong.
