# Desain — Paket berisi obat dan produk (jatah barang)

- **Tanggal:** 21 Oktober 2026
- **Status:** dikerjakan langsung atas permintaan pemilik ("langsung kerjakan"); semua keputusan di bawah adalah **keputusan Claude**
- **Melanjutkan:** `docs/superpowers/specs/2026-10-13-paket-treatment-deposit-design.md` (paket treatment, buku sesi)

## 1. Tujuan

Pemilik ingin isi paket tidak hanya treatment, tetapi juga obat dan produk dari stok. Contohnya "4× Facial Brightening, 1× RF Perut, 30 kapsul Slimming".

**Berhasil bila:**
- Admin Keuangan bisa menyusun paket berisi treatment dan barang;
- pasien bisa membawa pulang barang dari paketnya, baik di hari pembelian maupun di kunjungan berikutnya;
- stok meja berkurang saat barang benar-benar diserahkan;
- sisa jatah tercatat sama rapinya dengan sisa sesi.

## 2. Keputusan

| # | Keputusan |
|---|-----------|
| PB1 | Isi paket katalog adalah campuran **treatment × sesi** (1–100) dan **barang × jumlah** (1–1.000, dalam satuan barang). Satu paket minimal punya satu isi. Treatment dan barang masing-masing tidak boleh ganda. |
| PB2 | Barang paket adalah **jatah**, seperti sesi. Barang tidak keluar otomatis saat paket dibeli. Barang diambil lewat baris BARANG di tagihan bernilai Rp 0, dan stok meja berkurang saat tagihan itu difinalkan, dengan aturan stok yang sudah ada. |
| PB3 | Jatah bisa diambil **di tagihan pembelian paket itu sendiri**, berlaku untuk barang maupun sesi treatment, dan di tagihan mana pun sesudahnya. |
| PB4 | Cara mengambil jatah barang: tombol **Pakai jatah paket** pada baris BARANG (termasuk baris obat dari resep dokter), atau tombol **Ambil** di kotak paket customer, yang membuat baris BARANG Rp 0 dengan jumlah yang dipilih. |
| PB5 | Pendapatan tetap diakui saat paket dijual. Baris pengambilan bernilai Rp 0 tetapi membawa harga pokok stok, sama seperti sesi treatment yang membawa biaya bahan. |
| PB6 | Isi paket customer disalin saat pembelian final: nama barang **dan satuannya**. Mengubah katalog tidak mengubah paket yang sudah dijual. |

## 3. Data (migrasi hanya menambah dan melonggarkan)

- `TreatmentPackageItem`:
  - `serviceId` boleh kosong;
  - kolom baru `itemId` (FK Restrict ke `StockItem`);
  - CHECK: tepat satu dari keduanya terisi; `sessions` 1–100 untuk treatment, 1–1.000 untuk barang;
  - unik `(packageId, itemId)`.
- `PatientPackageItem`:
  - `serviceId` boleh kosong;
  - kolom baru `itemId` (tanpa FK, seperti `serviceId`) dan `unit` (satuan yang disalin);
  - CHECK yang sama;
  - unik `(patientPackageId, itemId)`.
  - `serviceName` tetap dipakai sebagai nama tampil isi, baik treatment maupun barang.
- `InvoiceLine.packageSourceLineId` (FK SetNull ke baris PAKET di tagihan yang sama): baris yang memakai jatah paket **yang dibeli di tagihan ini**. Saat final, kolom ini diterjemahkan ke `patientPackageItemId`.
- CHECK `invoice_line_package_shape` diganti: baris pemakaian (`patientPackageItemId` atau `packageSourceLineId`) adalah `TREATMENT` **atau** `BARANG`, Rp 0, tanpa diskon. Baris PAKET tidak punya `packageSourceLineId`.

## 4. Alur

- **Katalog:** dialog paket punya "+ Treatment" dan "+ Barang". Pilihan barang berisi barang stok aktif beserta satuannya. Teks isi menjadi "4× Facial Brightening, 1× RF Perut, 30 kapsul Slimming".
- **Draf tagihan:**
  - pilihan paket untuk sebuah baris berisi paket customer yang aktif, ditambah paket yang sedang dibeli di draf yang sama ("dibeli di tagihan ini");
  - sisa jatah paket baru = jumlah katalog dikurangi baris lain di draf yang memakai sumber dan isi yang sama;
  - "Lepas paket" pada baris barang mengembalikan harga jual katalog barang;
  - menghapus baris PAKET melepas dulu baris yang memakainya.
- **Finalisasi:** paket dibeli dulu (BELI), lalu baris sumber diterjemahkan ke item paket customer yang baru, lalu semua baris pemakaian dicek dan dicatat PAKAI. Stok barang diambil dari meja seperti baris BARANG lain.
- **Pembatalan:** pemakaian di tagihan itu sendiri dikembalikan dan tidak menghalangi pembatalan paket yang dibeli di tagihan yang sama. Pemakaian di tagihan lain yang masih final tetap menghalangi.
- **Tampilan:**
  - kartu paket customer, kotak info di draf, dan keterangan baris menyebut satuan barang, misalnya "sisa 20 dari 30 kapsul";
  - struk memakai keterangan yang sama.

## 5. Di luar cakupan

- Penyerahan barang otomatis saat paket dibeli.
- Margin gabungan per paket.
- Pengembalian barang paket (refund).

## 6. Rilis

- Migrasi hanya menambah kolom dan melonggarkan `NOT NULL`.
- Setelah ada paket berisi barang, **jangan `deploy.sh kembali`** ke rilis sebelum fitur ini, karena rilis lama menganggap setiap isi paket punya treatment. Catatan ini masuk runbook bagian 4.
