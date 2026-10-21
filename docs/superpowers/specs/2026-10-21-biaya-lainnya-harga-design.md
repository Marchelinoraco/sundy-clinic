# Desain — Biaya lainnya per treatment, dan harga berlaku tidak boleh di bawah biaya

- **Tanggal:** 21 Oktober 2026
- **Status:** menunggu persetujuan pemilik
- **Melanjutkan:** `docs/superpowers/specs/2026-10-14-harga-modal-margin-komisi-design.md` (biaya bahan, alat, komisi, margin)

## 1. Tujuan

Pemilik ingin biaya per sesi sebuah treatment lengkap. Saat ini sistem hanya mencatat bahan, alat, dan komisi. Biaya lain seperti laundry handuk atau listrik belum punya tempat, sehingga margin di laporan tampak lebih besar dari kenyataan.

Pemilik juga tidak mau ada treatment yang dijual di bawah biayanya. Begitu total biaya melebihi harga, admin harus menaikkan harga atau mengurangi biaya.

**Berhasil bila:**
- Admin Keuangan bisa mencatat biaya lain per sesi dengan nama sendiri;
- total biaya per sesi selalu terlihat di samping harganya;
- tidak ada jalan untuk menyimpan harga berlaku di bawah total biaya;
- margin di laporan menghitung biaya lain itu.

**Gagal walau jalan bila:**
- harga bisa diturunkan di bawah biaya lewat satu tempat yang terlewat;
- tagihan lama berubah angkanya karena biaya katalog diubah.

## 2. Keputusan

Kolom **Asal**: *pemilik* berarti diputuskan pemilik, atau tebakan Claude yang dibacakan dan diiyakan pemilik. *Claude* berarti diputuskan Claude saat menulis desain ini, belum dibacakan.

| # | Keputusan | Asal |
|---|-----------|------|
| BL1 | Dialog biaya punya bagian **Biaya lainnya**. Admin menambah baris sendiri berisi **nama biaya** dan **nominal per sesi**, boleh banyak baris, dan tiap baris bisa dihapus. | pemilik |
| BL2 | Biaya lainnya masuk **harga pokok** seperti bahan dan alat (Laporan → Margin dan Ringkasan). Biaya ini **disalin saat tagihan difinalkan**, jadi tagihan lama tidak berubah. | pemilik |
| BL3 | Nama biaya diketik bebas per treatment, tanpa daftar nama baku bersama. | pemilik |
| BL4 | **Total biaya per sesi** = bahan + alat + komisi per sesi + semua biaya lainnya. Bila lebih besar dari harga berlaku, **penyimpanan ditolak**. Bila sama, masih boleh. | pemilik |
| BL5 | Aturan BL4 berlaku di **setiap jalan yang mengubah harga atau biaya**, ke dua arah: menaikkan biaya, atau menurunkan harga. | pemilik (ditambah Claude: jalan ke-4, lihat 4.4) |
| BL6 | Tombol **Biaya** membuka dialog **"Harga & biaya {treatment}"**. Isinya harga coret, harga berlaku, biaya bahan, alat, komisi, biaya lainnya, dan ringkasan yang dihitung langsung saat mengetik. Satu tombol **Simpan** menyimpan semuanya. | pemilik |
| BL7 | Komisi persen dihitung dari harga berlaku yang **sedang diketik** di dialog. | pemilik |
| BL8 | Di luar cakupan: harga khusus atau diskon yang dibuat resepsionis di baris tagihan, dan harga paket. | pemilik |
| BL9 | Penyimpanan data: tabel baru `ServiceCostLine`. Baris tagihan mendapat satu kolom `otherCost`, berisi **total** biaya lainnya baris itu, tanpa rincian nama. | Claude |
| BL10 | Label tetap **"Harga berlaku"**, sama dengan tabel dan dialog Ubah; pesan juga memakai kata itu. Tombol "Biaya" berganti nama menjadi **"Harga & biaya"**. | Claude |
| BL11 | Batas isian: nama 1–60 karakter, nominal Rp 1–Rp 2.000.000.000, paling banyak 20 baris per treatment. Nama ganda pada treatment yang sama ditolak (huruf besar/kecil dianggap sama). Baris yang nama dan nominalnya sama-sama kosong diabaikan. | Claude |
| BL12 | Treatment yang biayanya sudah melebihi harga sebelum aturan ini ada diberi tanda merah **"Biaya melebihi harga"** di kolom Biaya per sesi, dan harus diperbaiki pada penyimpanan berikutnya. Per 21 Okt 2026 di produksi: 0 dari 32 layanan, dan belum ada yang biayanya diisi. | Claude |
| BL13 | Di tabel, dialog Ubah, dan Konsultasi Online, aturan BL4 diperiksa **hanya bila harga berlaku berubah**. Mengubah nama, kategori, atau durasi saja tidak pernah ditolak karena biaya. Dialog Harga & biaya selalu memeriksa. | Claude |
| BL14 | Keempat jalan mengunci baris layanan dan membaca biaya di transaksi yang sama, supaya ubah harga dan ubah biaya yang terjadi bersamaan tidak bisa saling menembus aturan. | Claude |

## 3. Data

Migrasi hanya menambah:

- **Tabel `ServiceCostLine`**:
  - kolom `id`, `serviceId` (FK Cascade ke `Service`), `name`, `amount` (rupiah per sesi), `sortOrder`;
  - CHECK `service_cost_line_values`: panjang nama setelah dirapikan 1–60, `amount` 1–2.000.000.000.
  - Keunikan nama tanpa beda huruf dijaga di aplikasi, bukan di indeks.
- **`InvoiceLine.otherCost`**:
  - `Int`, bawaan 0;
  - nilainya Σ biaya lainnya × jumlah, ditulis saat final, bersamaan dengan `materialCost` dan `toolCost`;
  - CHECK `invoice_line_cost_values` dibuat ulang dengan tambahan `"otherCost" >= 0`.
- **Aturan BL4 tidak dipasang sebagai CHECK basis data**, karena melibatkan dua tabel. Aturan itu dipegang aksi server (bagian 4).

## 4. Alur

### 4.1 Dialog "Harga & biaya"

- **Bagian Harga:** Harga coret (opsional) dan Harga berlaku. Validasinya sama dengan yang sekarang: harga berlaku > 0, dan harga coret bila diisi lebih besar dari harga berlaku.
- **Bagian Biaya per sesi:** Biaya bahan, Biaya alat, dan Komisi (tanpa komisi, rupiah per sesi, atau persen dari harga).
- **Bagian Biaya lainnya:**
  - setiap baris berisi "Nama biaya n", "Per sesi", dan tombol Hapus;
  - tombol **+ Biaya lainnya** menambah baris;
  - urutan baris disimpan sesuai tampilan.
- **Ringkasan**, dihitung langsung saat mengetik:
  - selalu tampil "Total biaya per sesi Rp X · harga berlaku Rp Y";
  - bila tidak melebihi: tambahan "Sisa Rp Z per sesi";
  - bila melebihi: tambahan "Kurang Rp Z per sesi" berwarna merah, pesan "Total biaya Rp X melebihi harga berlaku Rp Y. Naikkan harga berlaku atau kurangi biaya.", dan tombol Simpan dinonaktifkan.
- **Server:** satu aksi baru menyimpan harga, biaya, dan seluruh baris biaya lainnya dalam satu transaksi.
  - Baris layanan dikunci (`SELECT … FOR UPDATE`) supaya penyimpanan lain yang berjalan bersamaan tidak bisa menembus aturan BL4.
  - Aturan BL4 diperiksa lagi di server.
  - Baris biaya lainnya ditulis ulang seluruhnya.
  - Satu catatan audit merangkum perubahan.
- Aksi lama `updateServiceCost` digantikan oleh aksi baru.

### 4.2 Kotak harga di tabel Layanan & Harga

- Simpan harga di baris tabel memakai aturan BL4 dengan biaya yang tersimpan.
- Bila harga baru di bawah total biaya, penyimpanan ditolak dengan pesan "Harga berlaku paling rendah Rp X, sama dengan total biaya per sesi. Kurangi biaya lewat tombol Harga & biaya bila perlu."
- Kolom "Biaya per sesi" menampilkan "bahan · alat · komisi · lainnya Rp N", ditambah baris **total Rp T**, serta tanda merah dari BL12 bila ada.

### 4.3 Dialog Ubah layanan

Mengubah harga berlaku lewat dialog Ubah diperiksa dengan aturan dan pesan yang sama seperti 4.2.

### 4.4 Pengaturan Konsultasi Online

- Harga Konsultasi Online diatur di kartu tersendiri (`updateOnlineService`) dan menulis harga layanan yang sama. Aturan BL4 juga berlaku di sini, dengan pesan seperti 4.2.
- Harga Rp 0 untuk Konsultasi Online yang nonaktif tetap boleh, asalkan total biayanya juga Rp 0.

### 4.5 Finalisasi tagihan

- Selain bahan dan alat, finalisasi menyalin Σ biaya lainnya × jumlah ke `otherCost` pada setiap baris treatment (`lineCosts` di `src/lib/costing.ts`).
- Baris treatment yang memakai sesi paket (Rp 0) tetap membawa biayanya, sama seperti sekarang.

### 4.6 Laporan dan tagihan final

- **Laporan → Margin:** tabel per treatment mendapat kolom **Lainnya**. Kelompok treatment menghitung `otherCost` sebagai biaya.
- **Laporan → Ringkasan:** harga pokok treatment = bahan + alat + lainnya.
- **Tagihan final** (khusus Admin Keuangan): baris "Bahan dan alat" menjadi "Bahan, alat, dan lainnya". Modal per baris ikut menghitung `otherCost`.

## 5. Di luar cakupan

- Harga baris tagihan yang diubah resepsionis, termasuk diskon dan harga khusus.
- Harga paket dibandingkan dengan biaya isinya.
- Biaya operasional bulanan (sewa, gaji, listrik keseluruhan): tetap dicatat di menu Pengeluaran.
- Daftar nama biaya baku yang dipakai bersama antar-treatment.

## 6. Rilis

- Migrasi hanya menambah tabel dan kolom, jadi aman bila perlu kembali ke rilis sebelumnya. Rilis lama mengabaikan biaya lainnya, sehingga margin sementara tampak lebih besar, tetapi tidak ada galat.
- Buku panduan: bagian 7 (Admin Keuangan, Biaya) dan 8.5 diperbarui saat rilis.
