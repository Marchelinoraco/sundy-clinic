# Desain — Recall (bangun tidur dan istirahat)

- **Tanggal:** 23 Oktober 2026
- **Status:** disetujui pemilik di chat ("ok saya setuju")
- **Melanjutkan:** food recall H-1 (check-in), halaman Tangani perawat, tab dokter

## 1. Tujuan

Catatan kemarin pasien bukan hanya soal makanan: dokter juga ingin tahu jam bangun dan istirahat. Karena itu
"Food recall" berganti nama menjadi **Recall** dan mendapat dua jenis catatan baru.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| R1 | Nama tampil "Food recall" menjadi **Recall** di semua tulisan yang terlihat staf dan pasien: halaman Tangani perawat, tab dokter, daftar pasien perawat dan dokter ("recall ✓"), dialog check-in ("Tawarkan recall"), pesan, teks Salin ke S ("Recall H-1 (…)"), dan halaman tablet pasien. | pemilik |
| R2 | Jenis catatan menjadi lima: Makan/minum, Kapsul/obat, Olahraga, **Bangun tidur**, **Istirahat**. | pemilik |
| R3 | **Bangun tidur** boleh tanpa isi catatan (cukup jam), misalnya "05.00 Bangun tidur". Jenis lain tetap wajib berisi. | pemilik (contoh yang diiyakan) |
| R4 | Pilihan jam **00.00–23.00**, tetap per jam (sebelumnya 06.00–22.00). | Claude, diiyakan |
| R5 | Pesan WA ke pasien menyebut jam bangun dan istirahat: "…apa saja yang Anda makan, minum, dan lakukan kemarin, termasuk jam bangun dan istirahat…". | Claude, diiyakan |
| R6 | Tidak diubah: alamat link pasien `/food-recall/…`, nama di basis data dan kode, kuis lama v1 ("Aktivitas kemarin"), dan catatan recall yang sudah tersimpan (tetap tampil seperti sekarang). Tanpa migrasi. | Claude, diiyakan |

Contoh dari pemilik: "05.00 Bangun tidur", "13.00 Istirahat — tidur siang 1 jam", "23.00 Istirahat — tidur malam".

## 3. Di luar cakupan

- Menit (jam tetap per jam), durasi tidur terhitung otomatis.
- Rilis dan buku panduan v1.7: dikerjakan saat rilis.
