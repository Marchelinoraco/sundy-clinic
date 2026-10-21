# Desain — Peran Perawat (pengganti Terapis) yang bisa masuk panel

- **Tanggal:** 20 Oktober 2026
- **Status:** menunggu persetujuan pemilik
- **Mengubah:** `docs/superpowers/specs/2026-10-09-kelola-staf-design.md` (aturan K6 "Terapis tanpa akun"), `docs/superpowers/specs/2026-10-03-check-in-klinik-design.md` (food recall diisi customer, dilengkapi dokter), `docs/superpowers/specs/2026-10-09-hasil-bia-design.md` (angka BIA diisi dokter), pemberitahuan langsung (`src/lib/live-events.ts`, `src/server/live-events.ts`).

## 1. Latar belakang & tujuan

Klinik mulai memakai sistem sungguhan. Peran "Terapis" di sistem sebenarnya diisi **perawat**, dan perawat punya pekerjaan yang selama ini dicatat orang lain:

1. **Mewawancarai pasien untuk food recall:** makan, minum, obat, dan olahraga sehari sebelumnya. Sekarang food recall diisi customer sendiri di tablet, lalu dokter melengkapinya.
2. **Mengukur BIA:** mengunggah hasil cetak alat **dan** mengetik angka-angkanya. Sekarang resepsionis atau dokter mengunggah, dan dokter mengetik angkanya.
3. **Menangani treatment.** Tidak ada perubahan di sistem: perawat tetap dipilih sebagai *pelaksana*, dan komisinya tetap dihitung di penggajian.

**Berhasil bila:**
- perawat masuk dengan akunnya sendiri;
- perawat melihat pasien yang baru check-in tanpa harus memeriksa layar terus, karena ada bunyi dan pemberitahuan;
- perawat mengisi food recall dan BIA pasien itu sebelum pasien masuk ke dokter;
- dokter langsung membaca hasilnya di halaman kunjungan, dengan keterangan siapa yang mengisi;
- perawat tidak melihat apa pun di luar keperluan itu.

## 2. Keputusan pemilik (20 Okt 2026)

| No | Keputusan |
|----|-----------|
| PR1 | Nama peran yang tampil di mana pun: **Perawat**, menggantikan Terapis. Meliputi panel, situs publik, buku panduan, dan PDF. |
| PR2 | Perawat **bisa login**, berbeda dengan Terapis sekarang. |
| PR3 | Pekerjaan perawat di sistem: **food recall** (mewawancarai lalu mengetik) dan **BIA** (unggah berkas **dan** ketik ketujuh angka). Untuk treatment **tidak ada layar baru**. |
| PR4 | Data pasien yang dilihat perawat **seperlunya**: nama, No. RM, jadwal, layanan, tenaga, cabang, dan **alergi**. Perawat **tidak** melihat catatan dokter, diagnosis, resep, riwayat kunjungan, isian kuis, BIA sebelumnya, atau tagihan. |
| PR5 | **Pemberitahuan langsung dengan bunyi** ke perawat setiap kali resepsionis meng-check-in pasien. |
| PR6 | Teks situs "Ditangani dokter dan terapis berpengalaman" menjadi "…dokter dan perawat…". Staf "Terapis SunDY Mahakeret" berganti nama menjadi "Perawat SunDY Mahakeret". Buku panduan dan PDF ikut diperbarui. |

## 3. Nama peran

- **Hanya label yang berubah.** `STAFF_ROLE_LABEL.TERAPIS` menjadi `"Perawat"`. Nilai enum `StaffRole.TERAPIS` di basis data dan di kode **tetap** (*keputusan Claude*: tanpa migrasi enum, sehingga `deploy.sh kembali` tetap aman). Beri komentar di `src/lib/staff-role.ts` bahwa TERAPIS ditampilkan sebagai Perawat.
- Teks yang tampil ke pengguna dan menyebut terapis ikut diganti:
  - deskripsi halaman Staf;
  - pesan galat foto staf;
  - catatan di formulir staf;
  - pesan di `staff-accounts.ts`;
  - `src/components/home/value-props.tsx`.

  Komentar kode boleh tetap. Isi basis data situs (layanan, kategori, paket) sudah diperiksa 20 Okt dan tidak memuat kata "terapis".
- **Data:** nama staf "Terapis SunDY Mahakeret" diganti menjadi "Perawat SunDY Mahakeret" saat rilis, lewat **Staf → Ubah** atau SQL. `slug`-nya (`terapis-mahakeret`) tidak diubah.

## 4. Akun Perawat

- `roleCanHaveLogin` mengizinkan semua peran. Aturan "Staf yang punya akun tidak bisa berperan Terapis" di `staffChangeBlock` dihapus.
- **Tambah staf** berperan Perawat: email login **boleh kosong** (*keputusan Claude*), agar perawat yang hanya dijadwalkan, seperti staf umum "Perawat SunDY Mahakeret", tetap bisa dibuat. Bila email diisi, alurnya sama dengan peran lain: kata sandi sementara, lalu wajib ganti kata sandi. Peran lain tetap wajib beremail.
- Perawat tanpa akun bisa diberi akun kemudian lewat aksi **Buat akun** (`createAccountForStaff`) yang sudah ada.
- Perawat tetap muncul sebagai tenaga di Jadwal dan booking, dan sebagai pelaksana di tagihan, seperti sekarang.

## 5. Hak akses

Kemampuan baru, dengan nama yang ditentukan pembangun, misalnya `nurse:work`. Isinya:
- melihat daftar "Pasien hari ini" versi perawat dan membuka halaman **Tangani**;
- menyimpan food recall dari halaman itu;
- menyimpan angka BIA dari halaman itu;
- membuka berkas BIA booking yang sedang ditangani.

| Peran | Daftar perawat & Tangani | Food recall | Unggah BIA | Angka BIA | Pemberitahuan check-in |
|-------|--------------------------|-------------|------------|-----------|------------------------|
| Perawat | ya | ya | ya (`bia:upload`) | ya | ya |
| Super Admin | ya | ya | ya | ya | tidak (*keputusan Claude*: Super Admin tidak ikut berbunyi setiap check-in) |
| Dokter | — (tetap lewat halaman kunjungan) | ya, seperti sekarang | ya | ya | tidak |
| Resepsionis | — | — | ya, seperti sekarang | — | tidak |

- **Menu kiri Perawat:** hanya **Dasbor**.
- **Batas data**, diperiksa di server untuk setiap aksi perawat:
  - booking **hari ini (WITA)**;
  - berstatus **Hadir** (sudah check-in, catatan dokter belum final);
  - booking klinik, bukan Konsultasi Online.

  Di luar itu ditolak, termasuk bila alamat halaman diketik langsung. Perawat tidak memegang `record:read`.

## 6. Dasbor Perawat

Kotak **"Pasien hari ini"** berisi booking hari ini yang berstatus Hadir, dari semua cabang aktif, urut menurut jam. Kolomnya:

| Kolom | Isi |
|-------|-----|
| Jam | jam mulai booking |
| Pasien | nama dan No. RM |
| Layanan | nama layanan |
| Tenaga | dokter atau perawat booking |
| Food recall | `belum` / `terisi`; tanda siapa pengisinya boleh ditambahkan |
| BIA | `belum` / `berkas` / `angka` |
| — | tombol **Tangani** |

- Booking yang menjadi **Selesai** (catatan dokter final) hilang dari daftar.
- Daftar ikut **diperbarui** saat pemberitahuan check-in datang, tanpa muat ulang manual.

## 7. Halaman Tangani (perawat)

Alamatnya ditentukan pembangun, misalnya `/admin/perawat/[appointmentId]`. Halaman ini terpisah dari halaman kunjungan dokter dan tidak memakai `record:read`.

**Kepala:** nama, No. RM, tanggal dan jam, layanan, tenaga, cabang, dan **Peringatan alergi** dari `Patient.allergies`, bila ada. Tidak ada data klinis lain.

**Bagian Food recall (kemarin):**
- Memakai penyunting tabel per jam (06.00–22.00) yang sama dengan tab Food recall dokter. Jenisnya Makan/minum, Kapsul/obat, dan Olahraga.
- Baris yang diisi pasien lewat tablet ikut tampil dan bisa dilengkapi. Aturan menyimpannya sama dengan saat dokter menyimpan (`saveFoodRecallByStaff`): `completedAt` dan `completedBy*` terisi, dan link customer tertutup.
- Baris yang ditambah perawat bertanda `by: "PERAWAT"`, nilai baru di `FOOD_RECALL_AUTHORS`. Datanya berupa JSON, jadi tidak perlu migrasi; baris lama tetap sah.
- Bila booking belum punya baris FoodRecall karena "Tawarkan food recall" tidak dicentang saat check-in, simpanan pertama perawat **membuatnya** dengan status `DIISI` (*keputusan Claude*). Nilai `recallDate` dihitung dengan aturan yang sama dengan saat check-in.
- Pasien tetap boleh mengisi sendiri lewat tablet bila ditawarkan saat check-in. Begitu perawat atau dokter menyimpan, link pasien tertutup, sehingga kiriman pasien yang datang belakangan ditolak dengan pesan yang sudah ada.
- Terkunci setelah catatan dokter final. Penguncian ini sudah dijalankan trigger `food_recall_locked`; tampilannya menjadi baca-saja dengan pesan.

**Bagian BIA:**
- **Unggah** berkas lewat rute dan aturan berkas yang sudah ada (`bia:upload`). Daftar berkas bisa **dibuka** perawat untuk dibaca. Rute `/admin/bia/berkas/[id]` mengizinkan perawat hanya untuk booking dalam batas data di bagian 5.
- **Tujuh angka** (`BIA_FIELDS`) dan catatan, dengan validasi yang sama seperti dokter. Ada tombol **Simpan angka BIA**, dan **Isi angka tanpa berkas** bila tidak ada berkas.
- Perawat boleh mengoreksi angkanya sendiri selama catatan belum final. **Batalkan pengukuran** tetap hanya untuk dokter (`record:write`).
- `numbersById` dan `numbersByName` terisi nama perawat.

**Yang tidak ada di halaman ini:** SOAP, diagnosis, resep, treatment, riwayat kunjungan, isian kuis, BIA lama, grafik tren, dan tagihan.

**Jejak audit:** simpan food recall dan angka BIA tercatat atas nama perawat, mengikuti pola audit yang ada.

## 8. Yang dilihat dokter

- **Tab Food recall:** setiap baris menunjukkan pengisinya, yaitu **Pasien**, **Perawat**, atau **Dokter**, menggantikan tanda `byDoctor` yang sekarang hanya dua jenis.
- **Tab BIA:** menunjukkan "Angka diisi {nama} · {waktu}" dari `numbersByName` dan `numbersAt`. Dokter tetap bisa mengubah angka sebelum final.
- Daftar "Pasien hari ini" milik dokter tidak berubah.

## 9. Pemberitahuan check-in

- Ada jenis peristiwa baru di `src/lib/live-events.ts` dan `src/server/live-events.ts`, misalnya `PASIEN_CHECKIN`. Sumbernya `Appointment.checkedInAt` di jendela polling yang ada, hanya untuk booking klinik.
- **Penerima:** peran yang memegang kemampuan perawat **kecuali** Super Admin (lihat tabel di bagian 5).
- **Isi pesan:** judul "Pasien check-in: {nama}", keterangan "{layanan} · {jam}". Tombol **Buka** menuju halaman Tangani booking itu.
- Bunyi dan tombol bunyi sama dengan pemberitahuan yang sudah ada.

## 10. Buku panduan & PDF

- Semua kata "Terapis" diganti "Perawat".
- Tabel peran di bagian 1 diperbarui: Perawat bisa login, menunya Dasbor.
- Ada bagian baru **Panduan Perawat**: dasbor, Tangani, food recall, BIA, dan pemberitahuan.
- Diagram alur di bagian 3 diperbarui: setelah check-in, perawat mengisi food recall dan BIA sebelum dokter.
- Daftar isi dan PDF bergaya dibuat ulang setelah fitur dirilis.

## 11. Pengujian

- **Unit:**
  - kemampuan per peran, termasuk menu Perawat yang hanya Dasbor;
  - `roleCanHaveLogin` dan `staffChangeBlock` tanpa aturan Terapis;
  - label peran "Perawat";
  - penulis food recall `PERAWAT`, baik saat dibaca maupun saat ditampilkan;
  - pesan dan tujuan peristiwa `PASIEN_CHECKIN`;
  - batas data perawat (hari ini, Hadir, klinik).
- **Integrasi:**
  - perawat menyimpan food recall, termasuk membuat baris baru bila belum ditawarkan;
  - perawat menyimpan angka BIA;
  - perawat ditolak untuk booking kemarin, booking final, dan Konsultasi Online;
  - perawat ditolak membuka halaman kunjungan dokter dan rute berkas BIA di luar batas;
  - email opsional untuk Perawat;
  - peristiwa check-in muncul untuk perawat dan tidak untuk resepsionis.
- **E2E** (desktop dan ponsel):
  - resepsionis meng-check-in pasien;
  - perawat menerima pemberitahuan tanpa muat ulang, menekan Tangani, mengisi food recall dan ketujuh angka BIA, lalu mengunggah berkas;
  - dokter membuka kunjungan dan melihat baris "Perawat" serta "Angka diisi {perawat}";
  - setelah dokter memfinalkan, booking hilang dari daftar perawat.
- **Uji lama** yang menyebut label "Terapis" atau aturan tanpa akun disesuaikan.

## 12. Rilis

- Kemungkinan tanpa migrasi basis data. Pembangun memastikan hal ini; bila ternyata perlu migrasi, migrasinya hanya boleh menambah.
- Setelah rilis:
  - ganti nama staf "Terapis SunDY Mahakeret" (bagian 3);
  - Super Admin membuat akun untuk setiap perawat;
  - perbarui buku panduan dan PDF (bagian 10).

## 13. Di luar cakupan

- Daftar treatment atau catatan tindakan untuk perawat (PR3).
- Perawat melihat riwayat atau BIA sebelumnya (PR4).
- Mengganti nama enum di basis data.
- Pemberitahuan check-in untuk dokter.

## 14. Keputusan Claude (untuk diperiksa pemilik)

- Hanya label yang berubah. Enum `TERAPIS` tetap (bagian 3).
- Email boleh kosong untuk Perawat (bagian 4).
- Super Admin bisa melakukan semua pekerjaan perawat, tetapi tidak menerima bunyi check-in (bagian 5 dan 9).
- Batas data perawat: hanya booking klinik hari ini yang berstatus Hadir (bagian 5).
- Simpanan perawat menutup link food recall pasien, sama seperti simpanan dokter (bagian 7).
- Food recall yang dibuat perawat untuk booking yang tidak ditawari berstatus `DIISI` (bagian 7).
