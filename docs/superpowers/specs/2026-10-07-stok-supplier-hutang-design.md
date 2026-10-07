# Desain — Stok Barang, Supplier, dan Hutang (Sub-proyek Keuangan 1)

- **Versi:** 1.0
- **Tanggal:** 7 Oktober 2026
- **Status:** Dibangun (belum dideploy)
- **Bagian dari:** rangkaian keuangan klinik (lihat bagian 2)
- **Melanjutkan:**
  - hak akses berbasis kemampuan: `src/lib/permissions.ts`;
  - halaman Staf dan jejak audit yang sudah ada;
  - tampilan dan dasbor panel admin: `docs/superpowers/specs/2026-10-02-ui-tampilan-dasbor-design.md`.

## 1. Latar belakang & tujuan

Pemilik ingin tahu apakah klinik **untung atau rugi**. Itu hanya bisa dijawab bila setiap rupiah yang masuk dan keluar tercatat. Saat ini sistem belum mencatat keuangan sama sekali:
- satu-satunya uang yang tercatat adalah biaya booking dan harga Konsultasi Online;
- tidak ada data obat, stok, supplier, pembelian, hutang, tagihan, pembayaran, atau pengeluaran;
- resep masih teks bebas di catatan dokter;
- "Produk" yang ada hanya katalog di situs publik (tanpa stok dan tanpa harga beli).

Klinik membeli obat dan produk jual dari supplier, sering dengan tempo, sehingga muncul **hutang**. Harga beli setiap barang juga dibutuhkan untuk menghitung untung yang sebenarnya.

**Sub-proyek ini berhasil bila:**
- pemilik dan Admin Keuangan bisa melihat stok obat dan produk per cabang, termasuk yang menipis dan yang (segera) kedaluwarsa;
- setiap barang masuk dari supplier tercatat per batch dengan harga beli dan kedaluwarsa;
- pemilik dan Admin Keuangan bisa melihat hutang ke setiap supplier, yang terlambat, dan yang segera jatuh tempo, lalu mencatat pembayarannya;
- retur ke supplier dan barang rusak/hilang/kedaluwarsa tercatat, sehingga stok dan hutang selalu cocok dengan kenyataan;
- role baru **Apoteker** dan **Admin Keuangan** hanya melihat bagian yang menjadi tugasnya.

## 2. Rangkaian sub-proyek keuangan

| Urutan | Sub-proyek | Isi |
|---|---|---|
| **1 (spec ini)** | Stok, supplier, hutang | Katalog barang, barang masuk per batch, penyesuaian, retur, hutang, pembayaran hutang, role Apoteker dan Admin Keuangan |
| 2 | Tagihan & pembayaran customer | Tagihan dari kunjungan (layanan, treatment, produk/obat), diskon, cicilan, tunai/transfer/QRIS. Produk/obat yang ditagih mengurangi stok |
| 3 | Apoteker & resep | Resep terstruktur dari dokter, penyerahan obat, layar apoteker untuk melihat obat dan yang dibayar customer |
| 4 | Pengeluaran & laporan untung-rugi | Pengeluaran lain (gaji, sewa, dan sebagainya) dan laporan pendapatan − harga pokok − pengeluaran per periode |

Keputusan yang sudah diambil untuk sub-proyek 2 (dicatat di sini agar tidak hilang; dirinci di spec-nya sendiri):
- resepsionis menagih **setelah dokter memfinalisasi** catatan; tagihan terisi otomatis dari kunjungan;
- **biaya booking** tetap pendapatan terpisah dan **tidak** mengurangi tagihan; Konsultasi Online sudah lunas di muka;
- metode bayar: **tunai, transfer bank, QRIS**; didukung **diskon per tagihan** dan **bayar sebagian**;
- data tagihan disimpan di tabel sendiri dengan harga yang disalin saat tagihan dibuat.

## 3. Keputusan (dikonfirmasi pemilik, 7 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| SH1 | Urutan | Stok/supplier/hutang dulu, lalu tagihan, lalu apoteker & resep, lalu pengeluaran & laporan |
| SH2 | Cakupan barang | **Obat dan produk jual dalam satu katalog stok** (`StockItem`). `Product` di situs publik tidak diubah |
| SH3 | Rincian stok | **Per batch** dengan nomor batch, harga beli, dan tanggal kedaluwarsa; keluar memakai batch tercepat kedaluwarsa (FEFO) |
| SH4 | Lokasi stok | **Per cabang** |
| SH5 | Hutang | Jatuh tempo + pengingat, **bayar sebagian**, **retur ke supplier**, **penyesuaian stok** |
| SH6 | Pembagian tugas | **Apoteker** mencatat barang, barang masuk, retur, penyesuaian. **Admin Keuangan** mencatat pembayaran hutang. Super Admin semuanya |
| SH7 | Harga beli | **Satu langkah:** Apoteker mengisi harga beli dan jatuh tempo dari faktur kertas saat mencatat barang masuk; hutang langsung terbentuk |
| SH8 | Role Admin | Role baru **Admin Keuangan**: stok (baca), hutang, dan angka keuangan; tidak mengelola staf, jadwal, booking, atau rekam medis |
| SH9 | Pendekatan data | **Batch + jurnal pergerakan stok** yang tidak pernah diubah |

## 4. Data

### 4.1 Model baru

**`StockItem`** — barang yang distok.
- `code` (unik, mis. "OBT-001"), `name`, `kind` (`OBAT` | `PRODUK`), `unit` (teks satuan: tablet, kapsul, botol, tube, sachet, …);
- `sellPrice Int?` — harga jual dalam rupiah; boleh kosong sampai dibutuhkan tagihan (sub-proyek 2);
- `minStock Int @default(0)` — batas "menipis" per cabang;
- `isActive Boolean @default(true)`, `notes String?`, `createdAt`, `updatedAt`.

**`Supplier`**
- `name`, `phone String?`, `address String?`, `notes String?`, `isActive`, `createdAt`, `updatedAt`.

**`PurchaseInvoice`** — faktur pembelian dari supplier.
- `supplierId`, `branchId` (cabang penerima), `invoiceNumber` (nomor di faktur supplier), `invoiceDate` (tanggal WITA), `dueDate` (tanggal WITA, ≥ `invoiceDate`), `total Int` (jumlah baris, dihitung server);
- `notes String?`, `createdById`, `createdByName`, `createdAt`;
- `cancelledAt DateTime?`, `cancelledByName String?`, `cancelReason String?`;
- **unik** `[supplierId, invoiceNumber]`.

**`PurchaseLine`** — baris faktur.
- `invoiceId`, `itemId`, `quantity Int` (> 0), `unitCost Int` (≥ 0), `batchNumber String?`, `expiryDate DateTime?` (tanggal WITA).

**`StockBatch`** — stok fisik satu batch di satu cabang.
- `itemId`, `branchId`, `purchaseLineId` (unik), `batchNumber String?`, `expiryDate DateTime?`, `unitCost Int`;
- `quantityReceived Int`, `quantityRemaining Int`;
- CHECK basis data: **`quantityRemaining >= 0`**. Sisa boleh melebihi `quantityReceived`, karena penyesuaian *selisih hitung* bisa menambah.

**`StockMovement`** — jurnal stok. Tidak pernah diubah atau dihapus.
- `batchId`, `kind` (`MASUK` | `RETUR` | `PENYESUAIAN`; `KELUAR` ditambahkan sub-proyek 2), `quantity Int` (bertanda: + menambah, − mengurangi);
- `reason` (untuk penyesuaian: `RUSAK` | `HILANG` | `KEDALUWARSA` | `SELISIH_HITUNG` | `LAINNYA`), `note String?`;
- `staffId`, `staffName`, `createdAt`;
- rujukan opsional: `purchaseLineId`, `supplierReturnId`.

**`SupplierReturn`** dan **`SupplierReturnLine`** — retur atas satu faktur.
- retur: `invoiceId`, `returnedAt`, `note`, `staffId`, `staffName`, `total Int` (jumlah nilai baris);
- baris: `batchId`, `quantity Int` (> 0), `unitCost Int` (disalin dari batch), `amount Int`.

**`SupplierPayment`** — uang antara klinik dan supplier untuk satu faktur.
- `invoiceId`, `kind` (`BAYAR` | `PENGEMBALIAN`), `amount Int` (> 0), `method` (`TUNAI` | `TRANSFER` | `QRIS`), `paidAt` (tanggal WITA), `reference String?`;
- `staffId`, `staffName`, `createdAt`;
- `revokedAt DateTime?`, `revokedByName String?`, `revokeReason String?` — pembayaran salah input dibatalkan, tidak dihapus.

**`StaffRole`** mendapat dua nilai: `APOTEKER` dan `ADMIN_KEUANGAN`.

### 4.2 Aturan hitung

- **Sisa hutang faktur** = `total` − Σ `BAYAR` aktif − Σ nilai retur + Σ `PENGEMBALIAN` aktif.
- **Status faktur** (dihitung, tidak disimpan):
  - *Dibatalkan* bila `cancelledAt` terisi;
  - *Lunas* bila sisa = 0;
  - *Kredit dari supplier* bila sisa < 0 (retur melebihi yang belum dibayar);
  - *Sebagian* bila sudah ada pembayaran atau retur dan sisa > 0;
  - *Belum dibayar* selain itu.
- **Terlambat**: belum lunas (sisa > 0) dan `dueDate` < hari ini (WITA).
- **Stok barang di cabang** = Σ `quantityRemaining` semua batchnya di cabang itu. **Stok tersedia** tidak menghitung batch yang kedaluwarsa (`expiryDate` < hari ini).
- **Menipis**: stok tersedia ≤ `minStock` (dan `minStock` > 0).
- **Segera kedaluwarsa**: ada batch bersisa dengan `expiryDate` dalam **60 hari** ke depan. **Kedaluwarsa**: ada batch bersisa yang `expiryDate`-nya sudah lewat.
- **Nilai stok** cabang = Σ `quantityRemaining × unitCost`.
- **Kerugian penyesuaian** = Σ |jumlah pengurangan| × `unitCost` batch; dipakai laporan sub-proyek 4.
- **Uang** selalu rupiah penuh (`Int`), seperti harga yang sudah ada. **Jumlah barang** selalu bilangan bulat dalam satuan barang itu.

### 4.3 Penjagaan di basis data

- CHECK `quantityRemaining >= 0` pada `StockBatch`, `quantity > 0` pada `PurchaseLine` dan baris retur, `amount > 0` pada pembayaran, `unitCost >= 0`, `dueDate >= invoiceDate`.
- Pengurangan sisa batch selalu satu `UPDATE … SET quantityRemaining = quantityRemaining - n WHERE id = … AND quantityRemaining >= n` di dalam transaksi bersama jurnalnya; bila 0 baris berubah, aksi ditolak dengan pesan yang jelas.
- Unik `[supplierId, invoiceNumber]` mencegah faktur yang sama tercatat dua kali, termasuk bila dua orang menyimpan bersamaan.
- Migrasi hanya menambah tabel, kolom, dan nilai enum; tidak menghapus apa pun.

## 5. Alur Apoteker (menu **Stok**)

### 5.1 Daftar barang

- Per cabang (pilihan cabang; bawaannya cabang aktif pertama): kode, nama, jenis, satuan, stok tersedia, harga jual.
- Cari nama/kode; filter jenis; filter tanda **Menipis**, **Segera kedaluwarsa**, **Kedaluwarsa**, **Nonaktif**.
- Tanda tampil di baris barang.
- **Tambah barang** dan **Ubah barang** (kode, nama, jenis, satuan, harga jual, batas menipis, catatan). **Nonaktifkan** menggantikan hapus.
- Ringkasan **nilai stok** cabang tampil di atas daftar.

### 5.2 Barang masuk

Formulir sesuai faktur kertas supplier:
- supplier (pilih; **+ Supplier baru** di tempat), cabang penerima (hanya cabang *Aktif*), nomor faktur, tanggal faktur, jatuh tempo (bawaan = tanggal faktur + 30 hari, bisa diubah);
- baris barang (minimal satu): barang (hanya yang aktif), jumlah, harga beli per satuan, nomor batch, kedaluwarsa (wajib untuk `OBAT`, opsional untuk `PRODUK`);
- total dihitung otomatis dan ditampilkan.

Simpan, dalam satu transaksi:
- membuat faktur, baris, satu batch per baris, dan jurnal `MASUK` per batch;
- mencatat jejak audit;
- membawa pengguna ke halaman detail faktur.

Ditolak bila: nomor faktur supplier itu sudah ada; tanggal faktur di masa depan; jatuh tempo sebelum tanggal faktur; kedaluwarsa sudah lewat; jumlah ≤ 0; harga beli < 0; barang nonaktif; cabang tidak aktif.

### 5.3 Detail barang

- Batch per cabang: nomor batch, kedaluwarsa, sisa, harga beli, faktur asal (tautan).
- Riwayat jurnal: tanggal, jenis, jumlah, sisa sesudahnya per batch, staf, alasan.
- Tombol **Penyesuaian** dan **Ubah barang**.

### 5.4 Penyesuaian stok

- Pilih batch, arah (**kurangi** / **tambah**), jumlah, alasan:
  - kurangi: rusak, hilang, kedaluwarsa dibuang, lainnya;
  - tambah: selisih hitung;
- catatan **wajib** untuk *lainnya* dan *selisih hitung*;
- pengurangan tidak boleh melebihi sisa batch;
- membuat jurnal `PENYESUAIAN` dan jejak audit.

### 5.5 Retur ke supplier

- Dari detail faktur: **Retur**. Pilih baris batch dari faktur itu dan jumlahnya.
- Batas per batch: sisa batch saat ini.
- Nilai retur = jumlah × harga beli batch; ditampilkan sebelum disimpan.
- Simpan, dalam satu transaksi: retur dan barisnya, pengurangan sisa batch, jurnal `RETUR`, jejak audit.
- Retur mengurangi sisa hutang faktur. Bila faktur sudah dibayar lebih dari yang tersisa, faktur menjadi **Kredit dari supplier** (bagian 6.3).

### 5.6 Supplier

- Daftar supplier dengan sisa hutang masing-masing (yang terakhir hanya terlihat oleh `payable:manage`).
- Tambah, ubah, nonaktifkan. Supplier nonaktif tidak bisa dipilih untuk barang masuk baru, tetapi faktur dan hutangnya tetap tampil.

## 6. Alur hutang (menu **Hutang**, Admin Keuangan)

### 6.1 Daftar hutang

- Per faktur: supplier, nomor faktur, cabang, tanggal faktur, jatuh tempo, total, dibayar, retur, sisa, status.
- Filter: **Belum lunas** (bawaan; termasuk *Kredit dari supplier*), **Terlambat**, **Jatuh tempo 7 hari ke depan**, **Lunas**, **Dibatalkan**, dan per supplier.
- Urutan: terlambat paling atas, lalu jatuh tempo terdekat.
- Ringkasan di atas: total sisa hutang, total terlambat, dan sisa per supplier.

### 6.2 Detail faktur (halaman yang sama dengan 5.5)

Untuk `payable:manage`, halaman detail faktur menampilkan bagian **Pembayaran**:
- riwayat pembayaran dan pengembalian dana (termasuk yang dibatalkan, dicoret, dengan alasan);
- **Catat pembayaran**: nominal (≤ sisa), metode, tanggal bayar (tidak di masa depan dan tidak sebelum tanggal faktur), referensi/catatan;
- **Batalkan pembayaran**: alasan wajib; pembayaran tidak dihapus, sisa hutang kembali;
- **Ubah jatuh tempo**: alasan wajib; tidak boleh sebelum tanggal faktur.

### 6.3 Kredit dari supplier

- Bila sisa < 0, faktur menampilkan **"Kredit dari supplier Rp X"**.
- **Catat pengembalian dana**: nominal (≤ kredit), metode, tanggal. Membuat `SupplierPayment` berjenis `PENGEMBALIAN`.
- Kredit yang dipotongkan ke faktur lain di luar cakupan; untuk sekarang dicatat sebagai pengembalian dana dengan catatan.

### 6.4 Batalkan faktur

- Boleh oleh `stock:manage` atau `payable:manage`, hanya bila: belum ada pembayaran aktif, belum ada retur, dan setiap batch faktur itu masih utuh (sisa = jumlah diterima, tanpa jurnal lain selain `MASUK`).
- Alasan wajib. Dalam satu transaksi: sisa setiap batch dijadikan 0 lewat jurnal `PENYESUAIAN` (alasan *lainnya*, catatan "Faktur dibatalkan"), faktur ditandai dibatalkan, jejak audit.
- Faktur dibatalkan tetap tampil (filter *Dibatalkan*), tidak dihitung sebagai hutang, dan nomornya **tetap terpakai** untuk supplier itu; faktur pengganti memakai nomor yang sama dengan akhiran, mis. "INV-123 (koreksi)". Cara ini juga yang dipakai untuk memperbaiki harga beli yang salah.

### 6.5 Pengingat

- Dasbor untuk `payable:manage`: kotak **Hutang** — jumlah faktur terlambat dan jumlah yang jatuh tempo dalam 7 hari, dengan tautan ke daftar tersaring.
- Menu samping **Hutang** menampilkan jumlah faktur terlambat.

## 7. Hak akses

### 7.1 Kemampuan baru

| Kemampuan | Isinya | Dipegang |
|---|---|---|
| `stock:read` | Melihat barang, stok per cabang, batch, harga beli, nilai stok, jurnal, supplier, dan faktur (tanpa bagian pembayaran) | Apoteker, Admin Keuangan, Super Admin |
| `stock:manage` | Tambah/ubah/nonaktifkan barang dan supplier, barang masuk, penyesuaian, retur, batalkan faktur yang memenuhi syarat | Apoteker, Super Admin |
| `payable:manage` | Daftar hutang, sisa hutang supplier, catat/batalkan pembayaran, pengembalian dana, ubah jatuh tempo, batalkan faktur | Admin Keuangan, Super Admin |

### 7.2 Peran

| Peran | Kemampuan | Menu panel |
|---|---|---|
| Super Admin | semuanya (ditambah tiga di atas) | semuanya |
| Apoteker | `stock:read`, `stock:manage` | Dasbor (kotak Stok), Stok |
| Admin Keuangan | `stock:read`, `payable:manage`, `report:read` | Dasbor (Angka, kotak Stok, kotak Hutang), Stok (baca), Hutang |
| Dokter, Resepsionis, Terapis | tidak berubah | tidak berubah; belum ada akses stok (Dokter mendapatkannya di sub-proyek 3) |

- Apoteker tidak melihat booking, rekam medis, hutang, atau angka keuangan.
- Admin Keuangan tidak melihat booking, jadwal, atau rekam medis, dan tidak bisa mengubah stok.
- Akun Apoteker dan Admin Keuangan dibuat dengan cara yang sama seperti akun staf lain: skrip `npm run create-admin` di server (dijalankan Claude lewat SSH; kata sandi tidak lewat chat), yang mendapat argumen peran. Halaman **Staf** menampilkan nama peran barunya. Keduanya tidak bisa dijadwalkan dan tidak tampil di situs (seperti Resepsionis).
- Dasbor yang sudah ada menampilkan bagian sesuai kemampuan; pemeriksaan di halaman dan di setiap aksi server tetap memakai `requireCapability`.

### 7.3 Jejak audit

Dicatat dengan pola audit yang ada (siapa, kapan, ringkasan):
- `stock-item.create`, `stock-item.update`, `supplier.create`, `supplier.update`;
- `purchase.create`, `purchase.cancel`, `purchase.update-due-date`;
- `stock.adjust`, `stock.return`;
- `supplier-payment.create`, `supplier-payment.revoke`, `supplier-refund.create`.

## 8. Layar

- **`/admin/stok`** dengan tab (pola `PageTabs` yang ada):
  - **Barang** (bawaan) — bagian 5.1;
  - **Barang masuk** — daftar faktur (tanggal, supplier, nomor, cabang, total, status) dan **+ Barang masuk**;
  - **Supplier** — bagian 5.6.
- **`/admin/stok/barang/[id]`** — detail barang (5.3).
- **`/admin/stok/masuk/baru`** — formulir barang masuk (5.2).
- **`/admin/stok/masuk/[id]`** — detail faktur: baris, retur, **Retur**, **Batalkan faktur**; bagian **Pembayaran** hanya untuk `payable:manage` (6.2).
- **`/admin/hutang`** — daftar dan ringkasan hutang (6.1), tautan ke detail faktur.
- **Dasbor**: kotak **Stok** (`stock:read`) — jumlah barang menipis, segera kedaluwarsa, dan kedaluwarsa di semua cabang, masing-masing tautan ke daftar tersaring; kotak **Hutang** (`payable:manage`).
- **Menu samping**: **Stok** (jumlah barang menipis + kedaluwarsa) dan **Hutang** (jumlah faktur terlambat), masing-masing hanya untuk yang berhak.
- Semua uang ditampilkan dengan format rupiah yang ada; semua tanggal WITA.

## 9. Kasus khusus

| Kasus | Perilaku |
|---|---|
| Faktur yang sama diinput dua kali atau bersamaan | Ditolak oleh unik supplier + nomor faktur: "Faktur INV-123 dari {supplier} sudah tercatat." |
| Retur atau penyesuaian bersamaan pada batch yang sama | Pengurangan bersyarat dan atomik; yang kalah ditolak bila sisa tidak cukup, sisa tidak pernah minus |
| Kedaluwarsa sudah lewat saat barang masuk | Ditolak |
| Tanggal bayar di masa depan atau sebelum tanggal faktur | Ditolak |
| Pembayaran melebihi sisa hutang | Ditolak, pesan menyebut sisanya |
| Barang nonaktif yang masih punya stok | Tampil di filter *Nonaktif*; tidak bisa dipilih untuk barang masuk baru |
| Supplier nonaktif dengan hutang | Hutang tetap tampil dan bisa dibayar |
| Cabang *Segera hadir* | Belum bisa menerima barang |
| Harga jual kosong | Boleh; baru wajib saat ditagih (sub-proyek 2) |
| Batch kedaluwarsa masih bersisa | Tidak dihitung stok tersedia; ditandai *Kedaluwarsa*; dibuang lewat penyesuaian |
| Faktur dengan harga beli salah | Bila memenuhi syarat batal: batalkan dan input ulang. Bila tidak: penyesuaian/retur, lalu input ulang selisihnya sebagai faktur koreksi |
| Barang dengan batas menipis 0 | Tidak pernah ditandai menipis |

## 10. Pengujian

**Unit**
- Sisa hutang, status (*Belum dibayar*, *Sebagian*, *Lunas*, *Kredit dari supplier*, *Dibatalkan*), terlambat; pembayaran dan pengembalian yang dibatalkan tidak dihitung.
- Stok tersedia, menipis, segera kedaluwarsa (60 hari), kedaluwarsa, nilai stok.
- Validasi formulir barang masuk, penyesuaian, retur, dan pembayaran (semua pesan galat bagian 5–6).
- Hak akses: tabel kemampuan untuk Apoteker dan Admin Keuangan.
- Komponen: formulir barang masuk (tambah/hapus baris, total), daftar barang dengan tanda, detail faktur dengan dan tanpa bagian pembayaran, dialog pembayaran.

**Integrasi**
- Barang masuk membuat faktur, batch, dan jurnal dalam satu transaksi; nomor faktur ganda ditolak (termasuk bersamaan).
- Retur dan penyesuaian tidak pernah membuat sisa minus, termasuk dua permintaan bersamaan.
- Batalkan faktur: berhasil bila syarat terpenuhi, ditolak bila sudah ada pembayaran, retur, atau stok terpakai.
- Pembayaran ≤ sisa; batal pembayaran mengembalikan sisa; retur atas faktur lunas menghasilkan kredit; pengembalian dana ≤ kredit.
- Hak akses: Apoteker ditolak di aksi hutang; Admin Keuangan ditolak di aksi stok; Resepsionis dan Dokter ditolak di keduanya.
- Migrasi: CHECK sisa ≥ 0 dan unik faktur bekerja.

**E2E**
- Apoteker menambah barang, mencatat faktur dua baris, melihat stok bertambah, lalu meretur sebagian.
- Admin Keuangan melihat hutang, membayar sebagian, lalu melunasi; faktur menjadi *Lunas*.
- Apoteker tidak bisa membuka Hutang; Admin Keuangan tidak melihat tombol ubah stok.

## 11. Di luar cakupan

- Stok keluar ke customer (sub-proyek 2: tagihan) dan resep/penyerahan obat (sub-proyek 3).
- Pengeluaran lain dan laporan untung-rugi (sub-proyek 4).
- Pindah stok antar cabang, stock opname massal, pesanan pembelian (PO) ke supplier.
- Pajak/PPN, diskon dari supplier per baris, barcode, impor Excel.
- Memotong kredit supplier ke faktur lain secara otomatis.
- Notifikasi WhatsApp ke supplier.
