# Desain — Rencana kunjungan paket dan pengingat H-1 untuk pasien berpaket

- **Tanggal:** 22 Oktober 2026
- **Status:** menunggu persetujuan pemilik
- **Melanjutkan:** paket barang (`2026-10-21-paket-barang-design.md`), paket informatif, invoice A4 (`2026-10-22-invoice-a4-design.md`), dan menu Pengingat (spec C2)

## 1. Tujuan

Pasien yang membeli paket, misalnya 4 sesi treatment dan 28 kapsul, seharusnya datang secara berkala, misalnya seminggu sekali, untuk menjalani satu sesi dan menerima 7 kapsul. Saat ini sistem hanya mencatat sisa paket. Klinik tidak tahu kapan pasien seharusnya datang lagi, dan tidak ada yang mengingatkan pasien.

**Berhasil bila:**
- setiap paket yang dibeli punya tanggal kunjungan berikutnya;
- resepsionis diingatkan H-1 untuk mengirim WhatsApp ke pasien yang belum membooking;
- di kasir, satu tombol menambahkan isi kunjungan sesuai rencana;
- pasien melihat tanggal kunjungan berikutnya di invoice A4.

**Gagal walau jalan bila:**
- pasien yang sudah membooking tetap dikirimi pengingat paket;
- rencana tidak bergeser saat pasien datang terlambat;
- pengingat masih muncul untuk paket yang habis, kedaluwarsa, atau dibatalkan.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| JP1 | Jadwal berupa **rencana tanggal**, bukan booking. Pasien diingatkan, lalu memilih jamnya sendiri (membalas WhatsApp; resepsionis yang membooking). | pemilik |
| JP2 | **Katalog paket:** Admin Keuangan mengisi **Jarak antar kunjungan** (hari, bawaan 7) per paket, dan **Diserahkan per kunjungan** untuk setiap obat atau produk (misalnya 7 kapsul). | pemilik |
| JP3 | **Isi satu kunjungan:** 1 sesi untuk setiap treatment yang masih bersisa, ditambah jumlah per kunjungan setiap obat (atau sisanya bila kurang). Rencana berlanjut sampai semua sesi dan obat habis. Contoh 4× Facial, 2× RF, 28 kapsul/7: kunjungan 3 dan 4 hanya berisi Facial dan 7 kapsul. | pemilik |
| JP4 | **Bergeser:** setiap kali pasien datang dan memakai paketnya (tagihan final), kunjungan berikutnya = tanggal kedatangan + jarak. | pemilik |
| JP5 | **Pengingat H-1** di menu Pengingat, dalam daftar baru **"Sesi paket perlu dibooking"**. Resepsionis menekan tombol kirim WhatsApp, sama seperti pengingat booking. | pemilik |
| JP6 | **Pengingat tidak muncul** bila pasien sudah punya booking yang akan datang, atau bila paketnya habis, kedaluwarsa, atau dibatalkan. | pemilik (tebakan yang diiyakan) |
| JP7 | **Rencana terlihat** di halaman paket customer (tabel rencana kunjungan) dan di invoice A4 ("Kunjungan berikutnya: …"). | pemilik (tebakan yang diiyakan) |
| JP8 | **Tombol "Pakai sesuai rencana"** di kotak paket draf tagihan menambahkan isi kunjungan berikutnya sekaligus: sesi treatment dan obat dengan jumlah per kunjungan, Rp 0. Baris paket dan pembelian tambahan bercampur di invoice, dengan keterangan. | pemilik |
| JP9 | **Resepsionis boleh mengubah tanggal kunjungan berikutnya** ("Ubah tanggal rencana" di halaman paket customer). Pengingat dan kunjungan sesudahnya mengikuti tanggal baru. | pemilik |
| JP10 | **Penyimpanan:** paket customer menyimpan salinan jarak (`visitIntervalDays`) dan jumlah per kunjungan tiap barang (`perVisit`), serta satu tanggal **`nextVisitOn`**. Rencana sesudahnya dihitung dari sisa paket + tanggal itu + jarak, bukan disimpan per baris. Mengubah katalog tidak mengubah paket yang sudah dijual. | Claude |
| JP11 | **Nilai `nextVisitOn`:** saat paket dibeli = tanggal beli, atau tanggal beli + jarak bila tagihan pembelian sudah memakai paketnya. Sesudah tagihan final yang memakai paket = tanggal final + jarak. Bila paket habis, nilainya kosong. Saat tagihan pemakaian dibatalkan, dihitung ulang dari tagihan pemakaian terakhir yang masih final (atau tanggal beli). | Claude |
| JP12 | **Hari pengingat** memakai aturan pengingat booking: H-1, maju ke hari buka sebelumnya bila H-1 hari Minggu atau libur. Pengingat yang terlewat tetap tampil dengan tanda "terlewat" sampai pasien membooking, datang, atau tanggalnya diubah. Kiriman dicatat per paket dan tanggal rencana, sehingga yang sudah dikirim pindah ke "Sudah diingatkan". | Claude |
| JP13 | **Teks WhatsApp:** "Halo {nama depan}, ini SunDY Clinic. Sesuai program paket {paket}, jadwal kunjungan ke-{n} Anda {besok/pada {hari, tanggal}}: {isi kunjungan}. Balas pesan ini untuk memilih jam ya. Terima kasih." {n} = jumlah kunjungan yang sudah terjadi + 1. | Claude |
| JP14 | **Invoice A4:** baris "Kunjungan berikutnya: {tanggal}" hanya tampil di invoice **terbaru** yang membeli atau memakai paket itu, dengan rencana terkini (termasuk perubahan manual). Invoice yang lebih lama tidak menampilkannya. Angka progres tetap per tanggal invoice. | Claude |
| JP15 | **Paket yang sudah terjual sebelum fitur ini:** jarak 7 hari; jumlah per kunjungan barang = sisa ÷ jumlah sesi terbanyak yang tersisa (dibulatkan ke atas), atau seluruh sisa bila tanpa treatment; kunjungan berikutnya = pemakaian terakhir (atau tanggal beli) + 7 hari. Katalog lama mendapat jarak 7 dan jumlah per kunjungan dengan rumus yang sama. | Claude |
| JP16 | **Batas isian:** jarak 1–365 hari. Jumlah per kunjungan 1 sampai jumlah barang di paket. Ubah tanggal rencana: tidak sebelum hari ini dan tidak melewati masa berlaku paket. | Claude |

## 3. Data (migrasi hanya menambah)

- `TreatmentPackage.visitIntervalDays Int @default(7)` — CHECK 1–365.
- `TreatmentPackageItem.perVisit Int?` — wajib untuk barang, kosong untuk treatment; CHECK 1 ≤ perVisit ≤ sessions.
- `PatientPackage.visitIntervalDays Int @default(7)`, `PatientPackage.nextVisitOn DateTime? @db.Date`.
- `PatientPackageItem.perVisit Int?` — salinan saat dibeli.
- Tabel baru `PackageVisitReminder`: `patientPackageId`, `visitOn` (tanggal rencana), `sentAt`, `staffId`, `staffName`; unik `(patientPackageId, visitOn)`.
- Isian awal untuk data lama mengikuti JP15.

## 4. Alur

1. **Katalog:** dialog paket menambah **Jarak antar kunjungan (hari)** dengan keterangan, misalnya "Kunjungan 1 hari pembelian, berikutnya tiap 7 hari". Setiap baris obat atau produk menambah **Diserahkan per kunjungan** (bawaan: dibagi rata dengan jumlah sesi terbanyak). Ringkasan menambah "Rencana: 4 kunjungan, ±21 hari". Peringatan muncul bila rencana melewati masa berlaku (tidak memblokir).
2. **Pembelian:** finalisasi menyalin jarak dan jumlah per kunjungan, lalu menetapkan `nextVisitOn` (JP11).
3. **Kunjungan:** draf tagihan pasien berpaket menampilkan, per paket, "Rencana kunjungan {n} ({tanggal}): 1 sesi Facial, 7 kapsul Slimming" dan tombol **Pakai sesuai rencana**.
   - Baris treatment yang cocok di draf ditandai memakai paket.
   - Treatment yang belum ada ditambahkan sebagai baris treatment Rp 0.
   - Obat ditambahkan lewat "Ambil barang paket".
   - Jumlah yang tidak cukup dibatasi oleh sisanya.
4. **Final:** `nextVisitOn` bergeser (JP4, JP11).
5. **Pengingat:** daftar "Sesi paket perlu dibooking" (JP5, JP6, JP12, JP13). Kirim membuka WhatsApp dan mencatat kiriman.
6. **Halaman paket customer:** tabel rencana (kunjungan, tanggal, isi). Kunjungan yang sudah terjadi ditandai dari buku sesi. Tombol **Ubah tanggal rencana** tersedia untuk resepsionis dan Admin Keuangan (`invoice:manage`); perubahan dicatat di audit.
7. **Invoice A4:** "Kunjungan berikutnya: {tanggal}" (JP14).

## 5. Di luar cakupan

- Booking otomatis untuk setiap rencana.
- Pengiriman WhatsApp otomatis tanpa resepsionis.
- Mengubah tanggal untuk kunjungan selain kunjungan berikutnya; kunjungan sesudahnya selalu dihitung dari jarak.
- Rilis dan buku panduan: dikerjakan saat rilis.
