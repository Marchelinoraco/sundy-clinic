# Desain — Harga Modal, Margin, dan Komisi Pelaksana Treatment

- **Versi:** 1.0
- **Tanggal:** 14 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Sub-proyek:** 3 dari 6. Urutan yang disepakati:
  1. tagihan (selesai, PR #42);
  2. paket (selesai, rilis 20261013-114114);
  3. **harga modal, margin, dan komisi pelaksana** (spec ini);
  4. menu Karyawan, gaji, dan pembayaran komisi;
  5. impor Kluto;
  6. resep terstruktur, menyusul.
- **Menyentuh:**
  - **Data:** kolom baru di `Service`, `InvoiceLine`, `PurchaseLine`, `StockBatch`, `PurchaseInvoice`, dan `InvoiceStockUse`.
  - **Proses:** barang masuk, hutang dan retur supplier, finalisasi tagihan, dan laporan untung-rugi.
  - **Layar:** halaman Layanan & Harga, Stok, Hutang, Tagihan, dan Laporan (tab baru "Margin" dan "Komisi").
  - **Tidak berubah:** booking, catatan kunjungan dokter, resep, penyerahan obat, situs publik, dan paket (kecuali biaya sesinya).

## 1. Latar belakang & tujuan

Sekarang Apoteker mengisi harga beli saat mencatat barang masuk. Treatment tidak punya biaya, sehingga marginnya terlihat 100%. Komisi perawat belum tercatat sama sekali. Pemilik ingin:

1. **Harga beli (modal) diisi Admin Keuangan**, bukan Apoteker. Apoteker tidak lagi melihat harga beli maupun harga pokok.
2. **Biaya operasional per treatment:** biaya bahan, biaya alat, dan komisi pelaksana.
3. **Margin per baris tagihan dan laporan margin**, terpisah untuk obat/produk, treatment, dan paket.
4. **Komisi tercatat per pelaksana**, supaya admin tahu dalam sebulan setiap perawat melakukan berapa treatment dan berapa komisinya.
5. **Harga jual treatment juga bisa diisi Admin Keuangan.**

Bukan tujuan:
- membayar komisi dan gaji (sub-proyek 4);
- resep bahan treatment dari stok, yaitu bahan yang otomatis berkurang;
- komisi untuk penjualan obat atau produk;
- mengubah cara diskon atau paket dihitung.

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| M1 | Alur barang masuk | **Dua langkah.** Apoteker mencatat jumlah, batch, dan kedaluwarsa tanpa harga; stok langsung bisa dipakai. Admin Keuangan lalu mengisi harga beli per baris. Total hutang terbentuk setelah semua harga terisi. |
| M2 | Biaya treatment | **Biaya operasional per treatment = bahan + alat + komisi pelaksana**, diisi per treatment di katalog. |
| M3 | Biaya di laporan laba | **Bahan + alat ikut "Harga pokok"** laporan untung-rugi. **Komisi tidak**: komisi masuk laba saat dibayar lewat menu Karyawan (sub-proyek 4), supaya tidak terhitung dua kali. Laporan margin menampilkan ketiganya. |
| M4 | Bentuk komisi | **Dipilih per treatment:** rupiah tetap per sesi atau persen. |
| M5 | Siapa mengisi | **Admin Keuangan dan Super Admin** (`price:manage`) mengisi harga jual dan biaya treatment, serta harga beli barang. Nama, deskripsi, foto, dan status layanan tetap Super Admin (`content:manage`). |
| M6 | Penerima komisi | **Siapa pun pelaksananya**: perawat, terapis, atau dokter. |
| M7 | Baris treatment tanpa catatan kunjungan | Resepsionis **boleh memilih** pelaksana, **tidak wajib**. Bila kosong, baris itu tidak menghasilkan komisi. |
| M8 | Siapa melihat angka | Harga beli, harga pokok, biaya, komisi, dan margin **hanya Admin Keuangan dan Super Admin**. Resepsionis dan Apoteker tidak melihat angkanya; resepsionis hanya memilih nama pelaksana. |
| M9 | Penyimpanan biaya | **Disalin ke baris tagihan saat final**, sehingga mengubah katalog tidak mengubah margin tagihan lama. |
| M10 | Dasar komisi persen | **Harga katalog treatment saat final** (`Service.promoPrice` × jumlah), dibulatkan ke bawah. Sesi paket (Rp 0) tetap berkomisi. |

## 3. Data

Semua tambahan hanya menambah kolom. Nilai rupiah adalah bilangan bulat rupiah penuh.

**`Service`** (kolom baru):
- `materialCost` (Int, bawaan 0, 0..2 M);
- `toolCost` (Int, bawaan 0, 0..2 M);
- `commissionKind` (`DiscountKind?`: `NOMINAL` | `PERSEN`; kosong = tanpa komisi);
- `commissionValue` (Int, bawaan 0; persen 1..100, nominal 1..2 M).

CHECK `service_commission_shape`: tanpa jenis berarti nilai 0; jenis persen berarti nilai 1..100; jenis nominal berarti nilai > 0. Biaya tidak boleh negatif.

**`InvoiceLine`** (kolom baru):
- `performerId` (String?) dan `performerName` (String?): pelaksana treatment;
- `materialCost` (Int, bawaan 0) dan `toolCost` (Int, bawaan 0): total baris, yaitu biaya per sesi × jumlah, disalin saat final;
- `commissionAmount` (Int, bawaan 0): komisi baris, disalin saat final.

CHECK `invoice_line_cost_values`: ketiga kolom tidak negatif. Pelaksana hanya untuk baris `TREATMENT`; `performerId` dan `performerName` diisi bersamaan atau kosong bersamaan.

**`PurchaseLine.unitCost`**, **`StockBatch.unitCost`**, dan **`InvoiceStockUse.unitCost`** menjadi **boleh kosong** (`Int?`), artinya harga beli belum diisi. Ini satu-satunya perubahan pada kolom yang sudah ada. Melonggarkan `NOT NULL` aman bagi rilis lama, karena rilis lama selalu menulis angka.

**`PurchaseInvoice.total`** menjadi `Int?`. Kosong berarti faktur "Menunggu harga". Total diisi saat semua baris berharga.

Kolom baru **`PurchaseInvoice.pricedAt`** (DateTime?) dan **`pricedByName`** (String?) mencatat kapan dan siapa yang melengkapi harga.

## 4. Barang masuk dua langkah

- **Formulir "Barang masuk baru":**
  - **Apoteker** (`stock:manage` tanpa `price:manage`) melihat isian supplier, nomor faktur, tanggal, jatuh tempo, lalu per baris barang, jumlah, batch, dan kedaluwarsa. **Tidak ada** isian harga beli. Faktur tersimpan dengan semua `unitCost` kosong dan `total` kosong.
  - **Pemegang `price:manage`** (Admin Keuangan, Super Admin) melihat isian harga beli per baris, opsional. Bila semua diisi, faktur langsung lengkap; bila tidak, faktur tersimpan "Menunggu harga". Barang masuk tetap butuh `stock:manage`. Saat ini Admin Keuangan tidak punya `stock:manage` (hak `stock:read` dan `payable:manage`), jadi Admin Keuangan **mengisi harga** tetapi tidak mencatat barang masuk; Super Admin bisa keduanya.
- **Stok dari faktur "Menunggu harga" langsung bisa dipakai** untuk penyerahan obat dan tagihan. Harga pokok tagihan yang mengambil batch tanpa harga dicatat kosong.
- **Detail barang masuk:** pemegang `price:manage` mendapat tombol **"Isi harga beli"**. Dialognya berisi satu isian rupiah per baris, menampilkan jumlah per baris dan total yang ikut terhitung, lalu "Simpan".
  - Semua baris wajib terisi ("Isi harga beli semua baris.").
  - Saat disimpan, dalam satu transaksi:
    - `PurchaseLine.unitCost` dan `StockBatch.unitCost` diisi;
    - `PurchaseInvoice.total` = Σ jumlah × harga;
    - `InvoiceStockUse.unitCost` yang masih kosong untuk batch itu ikut diisi dengan harga yang sama, sehingga harga pokok tagihan lama terisi;
    - `pricedAt` dan `pricedByName` dicatat;
    - audit `purchase.price` dengan ringkasan "{faktur}: Rp total".
- **Koreksi harga:** boleh selama faktur belum punya pembayaran aktif dan belum punya retur. Mengubah harga juga memperbarui batch dan `InvoiceStockUse` dari batch itu. Audit mencatat total lama → baru. Bila sudah ada pembayaran atau retur: "Harga tidak bisa diubah setelah ada pembayaran atau retur."
- **Daftar barang masuk:** faktur tanpa harga memakai label status **"Menunggu harga"**. Pemegang `price:manage` mendapat saringan "Menunggu harga".
- **Hutang:**
  - faktur "Menunggu harga" tampil di Hutang dengan total "—";
  - tidak ikut jumlah hutang;
  - tidak bisa dibayar ("Isi harga beli dulu.") atau diretur ("Isi harga beli dulu.").
- **Pembatalan faktur pembelian** tetap seperti sekarang, dan boleh dilakukan walau harga belum diisi.

## 5. Biaya dan komisi treatment (Layanan & Harga)

- **Hak halaman Layanan & Harga** menjadi `content:manage` **atau** `price:manage`.
  - Admin Keuangan hanya melihat **tabel harga dan biaya**.
  - Kartu durasi konsultasi, konsultasi online, dan tombol aktif/nonaktif layanan tetap untuk `content:manage`.
  - Menu sidebar mengikuti hak ini.
- **Tabel harga layanan** per layanan berisi:
  - harga normal dan harga berlaku (sudah ada; sekarang berhak `price:manage`, Super Admin tetap punya);
  - **Biaya bahan** dan **Biaya alat** (rupiah);
  - **Komisi**: pilihan "Tanpa komisi", "Rupiah per sesi", atau "Persen dari harga", ditambah nilainya.
  - Audit `service.cost` dengan ringkasan "{layanan}: bahan X, alat Y, komisi Z".
- **Validasi:**
  - biaya 0..2 M;
  - komisi persen 1..100;
  - komisi rupiah 1..2 M;
  - jumlah biaya bahan + alat + komisi rupiah boleh melebihi harga (margin negatif tetap disimpan), tetapi muncul peringatan "Biaya melebihi harga jual."

## 6. Pelaksana dan salinan biaya di tagihan

- **Tagihan dari kunjungan:** baris treatment menyalin `performerId` dan `performerName` dari `EncounterTreatment` saat draf dibuat.
- **Baris treatment bebas** ("+ Baris layanan" jenis Treatment) dan baris treatment lain tanpa pelaksana:
  - di editor draf ada pilihan **"Pelaksana"** berisi staf aktif berperan DOKTER atau TERAPIS, ditambah "Tanpa pelaksana";
  - tidak wajib; disimpan lewat aksi `setLinePerformer` (`invoice:manage`, kunci versi draf, audit `invoice.update`);
  - pelaksana yang berasal dari catatan kunjungan juga bisa diganti, misalnya bila catatan salah.
- **Saat tagihan final**, untuk setiap baris `TREATMENT` yang punya `serviceId`, layanan dibaca saat itu lalu dihitung:
  - `materialCost` = biaya bahan × jumlah;
  - `toolCost` = biaya alat × jumlah;
  - `commissionAmount` = 0 bila tanpa pelaksana. Bila ada pelaksana: rupiah × jumlah, atau `floor(promoPrice × jumlah × persen / 100)`.

  Baris treatment bebas tanpa `serviceId`, baris layanan, barang, dan paket menyimpan 0. Sesi paket (Rp 0) tetap dihitung (keputusan M10).
- **Tampilan untuk resepsionis:** nama pelaksana di bawah nama baris, misalnya "Pelaksana: Rina". **Tidak ada angka biaya atau komisi** (keputusan M8).

## 7. Margin dan laporan (`price:manage` untuk angka di tagihan; `profit:read` untuk laporan)

**Tagihan final** (pemegang `price:manage`):
- ringkasan **"Margin"**: pendapatan bersih (total tagihan), harga pokok barang, biaya bahan dan alat, komisi, lalu **margin** = pendapatan bersih − semuanya;
- per baris keterangan kecil "modal Rp X · margin Rp Y", dengan modal = harga pokok barang atau bahan + alat + komisi;
- bila ada harga pokok barang yang kosong: "Harga pokok belum lengkap: menunggu harga beli."
- Keterangan "Harga pokok barang Rp X" yang sekarang tampil untuk `stock:read` diganti ringkasan ini dan hanya untuk `price:manage`.

**Laporan untung-rugi:**
- "Harga pokok" = Σ harga pokok barang (`InvoiceStockUse`, yang kosong dihitung 0) + Σ biaya bahan dan alat baris treatment, dari tagihan final di periode itu.
- Komisi **tidak** ikut (keputusan M3).
- Bila ada `InvoiceStockUse` kosong di periode itu, muncul peringatan "{n} baris barang belum punya harga pokok; laba bisa lebih tinggi dari sebenarnya."

**Tab baru "Margin"** di Laporan (`profit:read`), per periode dan cabang:
- **Obat dan produk:** pendapatan bersih (Σ jumlah baris setelah diskon baris), harga pokok, margin, dan % margin. Tabel per barang: jumlah terjual, pendapatan, harga pokok, margin, %.
- **Treatment:** pendapatan bersih baris treatment, bahan, alat, komisi, margin, dan %. Tabel per treatment: jumlah dilakukan (Σ jumlah), pendapatan, biaya, margin. Baris sesi paket dihitung di sini dengan pendapatan Rp 0.
- **Paket:** pendapatan penjualan paket (Σ jumlah baris PAKET setelah diskon baris). Biaya sesi paket sudah ada di Treatment; catatan di kartu menjelaskannya.
- **Diskon tagihan** tampil sebagai pengurang tersendiri, tidak dibagi ke baris.
- Ringkasan: total margin = Σ margin kelompok − diskon tagihan.

**Tab baru "Komisi"** di Laporan (`profit:read`):
- per periode dan cabang, tabel per pelaksana: nama, jumlah treatment (Σ jumlah baris), dan total komisi;
- baris pelaksana bisa dibuka untuk rincian: tanggal final, nomor tagihan (bertaut), customer, treatment, jumlah, komisi;
- unduh CSV untuk rincian semua pelaksana di periode itu;
- hanya tagihan **FINAL** yang dihitung; tagihan dibatalkan tidak.

## 8. Menyembunyikan harga beli (keputusan M8)

Angka harga beli, harga pokok, nilai stok, biaya, komisi, dan margin hanya dirender untuk pemegang `price:manage` (layar tagihan dan stok) atau `profit:read` (laporan), **dan** server tidak mengirimnya ke peran lain:
- **Stok:** kartu ringkasan "Nilai stok (harga beli)", kolom harga beli batch di detail barang, dan harga di jurnal stok.
- **Barang masuk:** daftar dan detail menyembunyikan harga beli per baris dan total.
- **Retur supplier:** nilai retur.
- **Tagihan:** harga pokok per baris dan ringkasan margin.
- **Penyerahan obat** (Apoteker): bila ada harga pokok di layar penyerahan, disembunyikan juga.

Fungsi baca server (`stock-read`, `purchase-read`, `invoice-read`, `dispensing-read`) mengosongkan kolom harga (null) bila pemanggil tidak memegang `price:manage`, mengikuti pola `withCost` yang sudah ada di `invoice-read`.

## 9. Teknis

- **Aturan murni** di `src/lib/costing.ts`:
  - validasi biaya layanan;
  - hitung salinan biaya dan komisi satu baris;
  - margin baris dan tagihan;
  - validasi isian harga beli.
- **Server:**
  - `src/server/purchase-pricing.ts`: `setPurchasePrices`, dengan `price:manage`;
  - `src/server/service-admin.ts`: `updateServiceCost`, dan `updateServicePrice` berpindah ke `price:manage`;
  - `setLinePerformer` di `src/server/invoice-drafts.ts`;
  - salinan biaya dan komisi di `finalizeInvoice`;
  - `src/server/report-sql.ts`: harga pokok ditambah bahan + alat, `marginAggregates`, `commissionByPerformer`.
- **Konkurensi:** `setPurchasePrices` mengunci baris `PurchaseInvoice` (`FOR UPDATE`) lalu memeriksa pembayaran dan retur di dalam transaksi itu. Pembayaran dan retur supplier mengunci baris faktur yang sama, sehingga keduanya bergiliran.
- **Data lama:**
  - migrasi mengisi `InvoiceLine.performerId` dan `performerName` untuk baris TREATMENT yang punya `encounterTreatmentId`, diambil dari `EncounterTreatment`;
  - biaya dan komisi tagihan lama tetap 0;
  - faktur pembelian lama tetap berharga.
- **Migrasi** hanya menambah kolom, melonggarkan `NOT NULL` pada empat kolom harga, dan mengisi pelaksana lama. Rilis lama tetap jalan selama deploy.

## 10. Keamanan dan privasi

- Kolom harga dikosongkan di server bagi peran tanpa hak, tidak hanya disembunyikan di layar.
- Laporan komisi memuat nama customer dan treatment, tanpa data klinis, dan hanya untuk `profit:read`.
- Aksi baru memeriksa hak di server dan mencatat audit.

## 11. Pengujian

- **Unit:**
  - validasi biaya dan komisi layanan;
  - hitung komisi rupiah, persen (pembulatan), tanpa pelaksana, dan sesi paket;
  - margin baris dan tagihan;
  - validasi harga beli.
- **Integrasi:**
  - barang masuk oleh Apoteker tanpa harga: stok bisa dipakai, faktur "Menunggu harga", hutang 0, bayar dan retur ditolak;
  - Admin Keuangan mengisi harga: total, batch, dan harga pokok tagihan yang sudah mengambil stok ikut terisi;
  - koreksi harga ditolak setelah pembayaran;
  - Apoteker mengirim harga lewat aksi lama: ditolak;
  - salinan biaya dan komisi saat final (rupiah, persen, tanpa pelaksana, sesi paket);
  - pelaksana disalin dari kunjungan dan bisa dipilih;
  - laporan untung-rugi (harga pokok + bahan + alat), margin per kelompok, dan komisi per pelaksana (tagihan dibatalkan tidak dihitung);
  - kolom harga kosong untuk Apoteker dan resepsionis di fungsi baca.
- **E2E (desktop dan mobile):**
  1. Apoteker mencatat barang masuk tanpa isian harga.
  2. Admin Keuangan mengisi harga beli dan biaya treatment.
  3. Resepsionis menagih kunjungan dengan pelaksana dan tidak melihat angka biaya.
  4. Admin Keuangan melihat margin tagihan, tab Margin, dan tab Komisi.

## 12. Rilis dan risiko

- Setelah rilis, Admin Keuangan perlu mengisi biaya treatment di Layanan & Harga; sebelum diisi, biayanya 0.
- **Risiko: faktur dibiarkan "Menunggu harga" lama.** Akibatnya laba terlalu tinggi dan hutang terlalu rendah. Mitigasinya: saringan "Menunggu harga" dan peringatan di laporan.
- **Risiko: komisi persen dari harga katalog** berbeda dengan harga yang ditagih bila ada diskon. Ini disengaja (keputusan M10) dan dijelaskan di keterangan tab Komisi.
- Uji E2E lama yang mengisi "Harga beli" sebagai Apoteker (stok-hutang, resep, tagihan, tagihan-diskon, paket) disesuaikan: harga diisi Admin Keuangan.
