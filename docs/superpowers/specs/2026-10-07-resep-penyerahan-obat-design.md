# Desain — Penyerahan Obat oleh Apoteker (Sub-proyek Keuangan 3)

- **Versi:** 1.0
- **Tanggal:** 7 Oktober 2026
- **Status:** Dibangun (belum dideploy)
- **Bagian dari:** rangkaian keuangan klinik (`docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`, bagian 2)
- **Melanjutkan:**
  - tagihan dan pembayaran: `docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md`;
  - stok, batch, dan jurnal stok: `docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`;
  - catatan dokter dan kunjungan: `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md`;
  - hak akses berbasis kemampuan: `src/lib/permissions.ts`.

## 1. Latar belakang & tujuan

Setelah tagihan berjalan (sub-proyek 2), obat masuk ke tagihan hanya karena resepsionis menambahkannya dari katalog stok. Tidak ada catatan siapa yang menentukan obat, berapa banyak, dan aturan pakainya. Rencana dokter hanya teks bebas, dan Apoteker belum punya pekerjaan di sistem.

**Berhasil bila:**
- dokter bisa meninggalkan catatan khusus untuk Apoteker tanpa membuka data klinis lain;
- Apoteker mencatat obat yang diserahkan (jumlah dan aturan pakai) dan obat itu otomatis menjadi baris tagihan;
- tagihan kunjungan dengan obat tidak bisa difinalkan sebelum obatnya diserahkan, sehingga tidak ada obat keluar tanpa tagihan;
- customer menerima etiket cetak berisi obat, jumlah, dan aturan pakai;
- dokter bisa melihat ketersediaan obat tanpa melihat harga.

## 2. Keputusan (dikonfirmasi pemilik, 7 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| RS1 | Siapa menentukan obat | **Apoteker**, dari "Catatan untuk Apoteker" yang ditulis dokter. Tidak ada resep terstruktur dari dokter |
| RS2 | Stok dan tagihan | Penyerahan menjadi **baris tagihan**; stok tetap keluar (FEFO) **saat tagihan difinalkan**, tanpa mengubah aturan sub-proyek 2 |
| RS3 | Data yang terlihat Apoteker | Hanya **Catatan untuk Apoteker**, nama pasien, cabang, dan waktu kunjungan; data klinis lain tertutup |
| RS4 | Urutan kerja | Tagihan kunjungan yang punya penyerahan **Menunggu** **tidak bisa difinalkan** |
| RS5 | Tambahan | Aturan pakai per obat, cetak etiket, dan **Dokter melihat stok tanpa harga** |

## 3. Data

Migrasi hanya menambah.

### 3.1 Kolom dan tabel

- `Encounter.pharmacyNote String?`: catatan dokter untuk Apoteker. Bisa diisi selama catatan masih draf; terkunci bersama catatan saat difinalkan.
- Enum `DispensingStatus`: `MENUNGGU`, `SELESAI`, `TANPA_OBAT`.
- `Dispensing`: satu per kunjungan.
  - `id`, `appointmentId` (unik, Restrict), `branchId`, `status` (bawaan `MENUNGGU`), `version` (bawaan 1; naik setiap perubahan);
  - `completedAt?`, `completedById?`, `completedByName?`;
  - `createdAt`, `updatedAt`.
- `DispensingLine`:
  - `id`, `dispensingId`, `itemId` (merujuk `StockItem`), `itemName` (disalin), `quantity Int`, `usage String` (aturan pakai), `sortOrder`.
- `InvoiceLine.dispensingLineId String?` unik: menandai baris tagihan yang berasal dari penyerahan.

### 3.2 Penjagaan di basis data

- `DispensingLine`: `quantity > 0`, `btrim(usage) <> ''`.
- `Dispensing`: `SELESAI` wajib punya `completedAt`, `completedById`, `completedByName`; `MENUNGGU` tidak boleh punya ketiganya; `TANPA_OBAT` wajib punya ketiganya.
- `Dispensing` `TANPA_OBAT` tidak boleh punya baris, dan `SELESAI` wajib punya minimal satu baris. Aturan ini dijaga di server dalam satu transaksi (CHECK lintas tabel tidak mungkin), diuji integrasi.
- `InvoiceLine.dispensingLineId` unik: satu baris penyerahan tidak bisa masuk dua tagihan aktif.

### 3.3 Pembuatan otomatis

Saat dokter memfinalkan catatan dan `pharmacyNote` tidak kosong (setelah dipangkas), transaksi finalisasi membuat `Dispensing` berstatus `MENUNGGU` untuk kunjungan itu, dengan `branchId` booking. Bila kosong, tidak ada `Dispensing` dan tagihan berjalan seperti sub-proyek 2. Kunjungan final sebelum fitur ini ada tidak dibuatkan apa pun.

## 4. Alur

### 4.1 Dokter
Mengisi "Catatan untuk Apoteker" di formulir kunjungan (opsional). Batas 1.000 karakter. Kolom ini bukan bagian dari ringkasan yang dilihat resepsionis atau Admin Keuangan.

### 4.2 Apoteker
1. Membuka `/admin/resep`, melihat antrean *Menunggu* (urutan terlama di atas).
2. Membuka satu penyerahan: melihat Catatan untuk Apoteker (hanya baca), nama pasien, cabang, waktu kunjungan.
3. Menambah obat: memilih barang dari katalog stok cabang kunjungan (hanya yang aktif dan berstok), mengisi jumlah (bilangan bulat > 0) dan aturan pakai (wajib, ≤ 200 karakter).
4. **Selesai**: server mengunci penyerahan, memeriksa versi, memeriksa sisa stok tiap obat di cabang kunjungan (kurang → ditolak dengan sisa yang tersedia; satu barang di beberapa baris dijumlahkan), lalu menandai `SELESAI`.
   **Tanpa obat**: menandai `TANPA_OBAT` (mis. catatan hanya anjuran). Tidak membuat baris tagihan.
5. Dapat mencetak etiket.

Daftar obat disimpan sebagai draf di penyerahan `MENUNGGU` (tambah, ubah, hapus obat sebelum Selesai), setiap perubahan menaikkan `version`.

### 4.3 Penyambungan ke tagihan
- **Tagihan belum ada** saat penyerahan Selesai: tidak ada yang berubah. Saat resepsionis menekan "Buat tagihan" (sub-proyek 2), baris penyerahan ikut terisi (jenis `BARANG`, harga jual katalog saat itu, `dispensingLineId` terisi).
- **Tagihan draf sudah ada**: baris ditambahkan ke draf dalam transaksi yang sama (menaikkan versi draf).
- **Tagihan sudah final atau dibatalkan**: tidak terjadi, karena tagihan yang punya penyerahan `MENUNGGU` tidak bisa difinalkan (4.4). Tagihan dibatalkan lalu dibuat ulang akan mengisi baris penyerahan lagi.
- Baris dari penyerahan **tidak bisa dihapus atau diubah jumlahnya** oleh resepsionis. Harga baris tetap bisa diubah dengan catatan, mengikuti aturan harga sub-proyek 2.

### 4.4 Penahanan finalisasi
`finalizeInvoice` menolak tagihan yang kunjungannya punya `Dispensing` `MENUNGGU`: "Menunggu Apoteker menyerahkan obat." Pemeriksaan dilakukan di server di dalam transaksi finalisasi, setelah kunci tagihan. Editor draf menampilkan pita status dan menonaktifkan tombol Finalkan.

### 4.5 Buka kembali
Apoteker membuka kembali penyerahan `SELESAI` atau `TANPA_OBAT` selama tagihan kunjungan itu belum final (draf atau belum ada): status kembali `MENUNGGU`, baris tagihan asal penyerahan dicabut dari draf. Kunci tagihan diambil lebih dulu supaya pembukaan kembali dan finalisasi tidak bisa terjadi bersamaan: salah satu menang, yang lain ditolak dengan pesan yang jelas.

### 4.6 Tagihan dibatalkan
Saat tagihan final dibatalkan (sub-proyek 2), penyerahan kunjungan itu kembali `MENUNGGU` dan baris tagihan lamanya terlepas, agar Apoteker menyerahkan ulang atau menandai ulang. Stok sudah dikembalikan oleh pembatalan tagihan.

## 5. Hak akses

Kemampuan baru: `dispense:read`, `dispense:manage`, `stock:availability`.

| Peran | `dispense:read` | `dispense:manage` | `stock:availability` | Lainnya |
|---|---|---|---|---|
| Apoteker | ya | ya | ya | `stock:read`, `stock:manage` yang sudah ada |
| Dokter | | | ya | menulis Catatan untuk Apoteker lewat `record:write` |
| Super Admin | ya | ya | ya | |
| Resepsionis, Admin Keuangan, Terapis | | | | Resepsionis melihat status penyerahan di tagihan (4.4), tanpa isi catatan |

Setiap halaman dan aksi memanggil `requireCapability` sendiri. `getInvoiceDetail` hanya mengembalikan status penyerahan (`MENUNGGU`/`SELESAI`/`TANPA_OBAT`), tidak pernah `pharmacyNote`.

## 6. Layar

- `/admin/resep`: tab *Menunggu* (bawaan), *Selesai*, *Tanpa obat*; lencana jumlah Menunggu di menu "Resep". Kotak dasbor "Resep menunggu" untuk Apoteker.
- `/admin/resep/[id]`: Catatan untuk Apoteker, formulir obat, tombol Selesai dan Tanpa obat; setelah selesai ringkasan, tombol Cetak etiket dan Buka kembali.
- `/admin/resep/[id]/etiket`: halaman cetak (CSS print): nama klinik, nama pasien, tanggal, daftar obat, jumlah, aturan pakai. Tanpa harga dan tanpa data klinis.
- Formulir kunjungan dokter: kolom "Catatan untuk Apoteker".
- Editor draf tagihan: pita status penyerahan; baris dari penyerahan bertanda kunci.
- `/admin/stok-dokter`: tabel baca saja nama, jenis, sisa, satuan di cabang aktif, dengan pencarian. Tanpa harga dan tanpa batch.

## 7. Kasus khusus

- Dua Apoteker menyelesaikan penyerahan yang sama bersamaan: kunci baris dan nomor versi, yang kedua ditolak.
- Barang dinonaktifkan atau stok habis setelah ditambahkan ke draf penyerahan: Selesai ditolak dengan pesan yang menyebut barangnya.
- Harga jual barang kosong (barang tak dijual): tidak muncul di pilihan obat.
- Catatan dokter dikoreksi lewat addendum setelah final: `pharmacyNote` tidak berubah; addendum tidak membuat penyerahan baru.
- Konsultasi Online ikut alur yang sama bila dokter mengisi catatan itu.
- Penjualan langsung tanpa kunjungan tetap oleh resepsionis, tidak lewat Apoteker.
- Kunjungan tanpa Catatan untuk Apoteker: tagihan dan penambahan barang manual oleh resepsionis tetap seperti sub-proyek 2.

## 8. Jejak audit

`dispensing.create` (otomatis saat catatan final), `dispensing.update` (draf obat), `dispensing.complete`, `dispensing.none`, `dispensing.reopen`. Ringkasan memuat pasien dan obat, tidak memuat isi Catatan untuk Apoteker.

## 9. Pengujian

- **Unit:** aturan penyerahan (validasi jumlah dan aturan pakai, label status, ringkasan stok per barang).
- **Integrasi:** pembuatan otomatis saat catatan final (terisi / kosong / hanya spasi); Selesai menambah baris ke draf; Selesai sebelum tagihan dibuat lalu terisi saat tagihan dibuat; finalisasi tagihan ditolak selama Menunggu; Tanpa obat melepas penahanan; buka kembali mencabut baris dan ditolak bila tagihan final; dua penyelesaian bersamaan hanya satu berhasil; buka kembali dan finalisasi bersamaan: satu menang; stok kurang ditolak, termasuk satu barang di dua baris; baris penyerahan tak bisa dihapus atau diubah jumlahnya oleh resepsionis; pembatalan tagihan mengembalikan penyerahan ke Menunggu; hak akses tiap peran (Apoteker tidak membaca data klinis lain, Dokter tidak melihat harga, Resepsionis tidak membaca isi catatan).
- **Komponen:** formulir obat, antrean, pita status di editor tagihan, tabel stok dokter, etiket.
- **E2E:** dokter mengisi catatan dan memfinalkan → Apoteker menyerahkan dua obat → resepsionis membuat dan memfinalkan tagihan → stok berkurang; ditambah hak akses (Apoteker menolak `/admin/tagihan`, Dokter tidak membuka `/admin/resep`).

## 10. Di luar cakupan

Resep terstruktur yang ditulis dokter, interaksi obat dan alergi otomatis, penjualan langsung oleh Apoteker, retur obat dari customer, cetak PDF atau kirim lewat WhatsApp, laporan penggunaan obat (sub-proyek 4).

## 11. Hal yang diuji pemilik sebelum rilis

- Apakah Catatan untuk Apoteker 1.000 karakter cukup.
- Apakah aturan pakai bebas (teks) cukup, atau perlu daftar pilihan umum.
