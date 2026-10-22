# Desain — Aturan pakai pilihan dan pelaksana treatment oleh resepsionis

- **Tanggal:** 22 Oktober 2026
- **Status:** menunggu persetujuan pemilik
- **Melanjutkan:** resep dokter (`2026-10-14` resep dokter), penyerahan obat (keuangan sub-proyek 3), harga modal & komisi (pelaksana baris treatment)

## 1. Tujuan

Dokter dan Apoteker sekarang mengetik aturan pakai obat secara bebas ("3 x 1 sesudah makan"), sehingga penulisan tidak seragam dan lambat. Dokter juga harus memilih pelaksana setiap treatment, padahal yang mengatur siapa mengerjakan treatment adalah resepsionis.

**Berhasil bila:**
- aturan pakai yang umum cukup dipilih (frekuensi + waktu), dan yang tidak umum masih bisa diketik;
- etiket, tagihan, dan catatan tetap menampilkan aturan pakai seperti sekarang;
- dokter tidak lagi memilih pelaksana, dan tidak ada tagihan final yang treatment-nya tanpa pelaksana.

**Gagal walau jalan bila:**
- resep atau penyerahan lama berubah teksnya, atau tidak bisa dibuka lagi;
- komisi pelaksana terlewat karena tagihan bisa difinalkan tanpa pelaksana.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| AP1 | **Frekuensi** dipilih dari: 1xSehari, 1xSeminggu, 1-2xSehari, 2-3xSehari, 3xSehari, **Lainnya**. Lainnya membuka kolom untuk mengetik sendiri (mis. "2xSehari", "bila perlu"). | pemilik |
| AP2 | **Waktu**: kolom teks, terisi **SEBELUM MAKAN** untuk baris obat baru, bisa diubah. Boleh dikosongkan (obat oles, tetes); teks disimpan apa adanya, tanpa dipaksa huruf besar. | pemilik; kosong & huruf: Claude |
| AP3 | Berlaku di **resep dokter** (halaman kunjungan) dan di **penyerahan obat Apoteker** (tambah baris dan ubah baris). | pemilik |
| AP4 | **Penyimpanan tetap satu teks aturan pakai** = `{frekuensi} {waktu}`, mis. "3xSehari SEBELUM MAKAN"; tanpa waktu = frekuensinya saja. Tagihan, etiket, catatan kunjungan, dan menu Resep membaca teks yang sama tanpa perubahan. Tanpa migrasi. | Claude |
| AP5 | **Membuka lagi** baris yang tersimpan: teks yang diawali salah satu pilihan AP1 (diikuti spasi atau akhir teks) → pilihan itu, sisanya menjadi Waktu. Selain itu → **Lainnya** berisi seluruh teks, Waktu kosong. Teks lama tidak pernah diubah kecuali disimpan ulang oleh pengguna. | Claude |
| AP6 | **Validasi**: frekuensi wajib dipilih; Lainnya wajib diisi; gabungan paling panjang 200 karakter (batas yang sudah ada). Pesan: "Pilih aturan pakai obat." / "Isi aturan pakai obat." / batas lama. | Claude |
| PL1 | **Dokter tidak memilih pelaksana**: kolom Pelaksana hilang dari formulir treatment di halaman kunjungan. | pemilik |
| PL2 | **Resepsionis memilih pelaksana** di draf tagihan, dengan pilihan pelaksana per baris yang sudah ada. Baris dari kunjungan baru mulai kosong; kunjungan lama yang sudah punya pelaksana tetap membawanya ke tagihan. | pemilik; kunjungan lama: Claude |
| PL3 | **Tagihan tidak bisa difinalkan** selama ada baris treatment (termasuk sesi paket dan baris treatment yang ditambah resepsionis) tanpa pelaksana. Pesan: "Pilih pelaksana untuk {treatment}." | pemilik |
| PL4 | **Data**: pelaksana di catatan treatment kunjungan menjadi boleh kosong (migrasi hanya melonggarkan kolom). Catatan dan riwayat kunjungan menampilkan pelaksana hanya bila ada. | Claude |

## 3. Alur

1. **Dokter, halaman kunjungan → Resep:** pilih obat, jumlah, **Frekuensi** (atau Lainnya + ketik), **Waktu** (terisi SEBELUM MAKAN). Simpan otomatis seperti sekarang; baris dianggap belum lengkap bila frekuensi belum dipilih atau Lainnya masih kosong.
2. **Dokter, halaman kunjungan → Treatment:** pilih treatment, area, dosis, catatan; tanpa pelaksana.
3. **Apoteker, penyerahan obat:** tambah baris dan ubah baris memakai kolom Frekuensi + Waktu yang sama.
4. **Resepsionis, draf tagihan:** baris treatment tanpa pelaksana menampilkan pilihan pelaksana kosong. Finalkan ditolak dengan pesan PL3 sampai semua terisi.
5. **Etiket, tagihan, struk, invoice A4:** menampilkan teks aturan pakai gabungan (AP4), tidak berubah.

## 4. Di luar cakupan

- Mengubah teks aturan pakai resep atau penyerahan yang sudah final.
- Daftar frekuensi yang bisa diatur sendiri oleh Super Admin.
- Pilihan cepat untuk Waktu (mis. SESUDAH MAKAN); cukup kolom teks.
- Rilis dan buku panduan: dikerjakan saat rilis.
