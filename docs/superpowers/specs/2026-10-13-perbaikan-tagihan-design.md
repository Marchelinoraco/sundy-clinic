# Desain — Perbaikan Tagihan: Diskon per Item, Catatan Internal, Rekening Klinik, dan Rincian Transfer

- **Versi:** 1.0
- **Tanggal:** 13 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Sub-proyek:** 1 dari 5 (urutan disepakati: tagihan → deposit dan paket → harga modal dan margin → menu Karyawan gaji dan komisi → impor Kluto)
- **Menyentuh:** tabel `InvoiceLine`, `InvoicePayment`, `StockItem` (kolom baru), tabel baru `ClinicBankAccount`; aturan total tagihan (`src/lib/invoice.ts`), draf dan pembayaran tagihan, laporan pendapatan (`src/server/report-sql.ts`), struk (`src/lib/receipt.ts`, ESC/POS, halaman `/struk`), halaman Stok dan Pengaturan. Alur booking, kunjungan, resep, dan penyerahan obat tidak berubah.

## 1. Latar belakang & tujuan

Kasir lama (Kluto) memungkinkan diskon per item, keterangan, dan rincian pembayaran. Tagihan SunDY baru punya diskon untuk seluruh tagihan, kolom catatan yang belum bisa diisi dari layar, satu rekening klinik di Pengaturan, dan satu kolom "referensi" untuk pembayaran.

Tujuan:
1. Diskon per baris tagihan, baik **diskon bawaan** yang disiapkan per barang maupun **diskon manual** yang diketik resepsionis.
2. **Catatan internal** tagihan yang bisa diisi staf.
3. **Daftar rekening klinik** di Pengaturan.
4. **Rincian pembayaran transfer bank:** rekening tujuan klinik dan data pengirim.

Bukan tujuan: deposit dan paket treatment (sub-proyek 2), harga modal dan margin (sub-proyek 3), komisi dan gaji (sub-proyek 4), diskon bawaan untuk layanan/treatment (sudah ada lewat harga coret dan harga berlaku di Layanan & Harga), mengubah instruksi transfer biaya booking, dan rincian transfer untuk pembayaran hutang ke supplier.

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| T1 | Bentuk diskon per item | **Keduanya**: diskon bawaan per barang terpasang otomatis, dan resepsionis bisa menambah atau mengubah diskon per baris. |
| T2 | Batas resepsionis | **Gabungan 20%**: diskon manual semua baris ditambah diskon tagihan paling banyak 20% dari subtotal sebelum diskon. Admin Keuangan (`invoice:correct`) boleh lebih. |
| T3 | Diskon bawaan untuk apa | **Barang saja** (produk dan obat). Layanan dan treatment memakai harga coret/harga berlaku yang sudah ada. |
| T4 | Diskon bawaan dalam batas 20%? | **Tidak**: ditetapkan pemilik, bukan resepsionis. Begitu resepsionis mengubahnya, baris itu dihitung diskon manual. |
| T5 | Alasan diskon per baris | **Wajib**, sama dengan diskon tagihan. Diskon bawaan memakai alasan "Promo: {nama promo}". |
| T6 | Catatan tagihan | **Hanya internal**; tidak pernah di struk atau tautan struk. |
| T7 | Rekening klinik | **Lebih dari satu**, dikelola di Pengaturan. |
| T8 | Isian transfer wajib | **Hanya rekening tujuan**; bank pengirim, nama pemilik, nomor rekening pengirim, dan nomor referensi opsional. |

## 3. Data

Migrasi hanya menambah. Baris dan pembayaran lama tetap sah (diskon 0, rincian transfer kosong).

**`InvoiceLine`**
| Kolom | Isi |
|---|---|
| `discountAmount` | `INT NOT NULL DEFAULT 0`; rupiah, potongan untuk seluruh baris (bukan per unit). CHECK `0 <= discountAmount <= quantity * unitPrice`. |
| `discountReason` | `TEXT`; wajib bila `discountAmount > 0` (CHECK). |
| `discountSource` | enum baru `LineDiscountSource` (`PROMO`, `MANUAL`), boleh kosong; kosong bila tanpa diskon. CHECK kosong ⇔ `discountAmount = 0`. |

**`StockItem`** (diskon bawaan)
| Kolom | Isi |
|---|---|
| `promoName` | `TEXT`, boleh kosong. |
| `promoKind` | enum yang sudah ada `DiscountKind` (`NOMINAL`, `PERSEN`), boleh kosong. |
| `promoValue` | `INT NOT NULL DEFAULT 0`. |
| `promoStartsOn`, `promoEndsOn` | `DATE`, boleh kosong (tanpa batas di sisi itu). |

CHECK: tanpa promo ⇔ `promoKind` kosong dan `promoValue = 0`; dengan promo, nama terisi, nilai > 0, persen ≤ 100, dan `promoEndsOn >= promoStartsOn` bila keduanya terisi.

**`ClinicBankAccount`** (baru)
| Kolom | Isi |
|---|---|
| `id`, `bankName`, `accountNumber`, `accountHolder` | teks wajib; nomor hanya angka (spasi/tanda hubung dibuang saat disimpan). |
| `isActive` | `BOOLEAN DEFAULT true`. |
| `sortOrder` | `INT DEFAULT 0`. |
| `createdAt`, `updatedAt` | — |

Migrasi menyalin rekening yang ada di `ClinicSetting` (bila nomornya terisi) menjadi baris pertama. `ClinicSetting.bankName/Number/Holder` tidak diubah dan tetap dipakai instruksi transfer biaya booking.

**`InvoicePayment`**
| Kolom | Isi |
|---|---|
| `clinicBankAccountId` | FK ke `ClinicBankAccount` (Restrict), boleh kosong. |
| `destinationLabel` | `TEXT`; salinan "{bank} {nomor} a.n. {pemilik}" saat pembayaran dicatat, agar riwayat tidak berubah bila rekening diedit. |
| `senderBank`, `senderAccountName`, `senderAccountNumber` | `TEXT`, boleh kosong. |
| `reference` | kolom yang sudah ada dipakai sebagai **Nomor referensi**. |

CHECK: `clinicBankAccountId` dan `destinationLabel` terisi bersamaan atau kosong bersamaan; keduanya wajib untuk pembayaran `TRANSFER` yang dibuat setelah rilis ini (diperiksa di server, tidak di CHECK, agar pembayaran transfer lama tetap sah).

## 4. Aturan hitung

Diberi baris dengan `gross = quantity × unitPrice` dan `discountAmount`:

- **Jumlah baris** = `gross − discountAmount` (≥ 0).
- **Subtotal kotor** = Σ gross; **diskon item** = Σ discountAmount; **subtotal** = subtotal kotor − diskon item.
- **Diskon tagihan** dihitung dari *subtotal* (setelah diskon item): persen dibulatkan ke bawah, nominal tidak melebihi subtotal (aturan yang ada).
- **Total** = subtotal − diskon tagihan. Dibayar, sisa, dan status tampil tidak berubah caranya.
- **Batas resepsionis (T2):** Σ diskon baris `MANUAL` + diskon tagihan ≤ `floor(subtotal kotor × 20%)`. Diperiksa setiap kali diskon baris atau diskon tagihan diubah, dan saat finalisasi. Diskon `PROMO` tidak ikut dihitung.
- **Diskon bawaan berlaku** pada tanggal hari ini (WITA) bila `promoKind` terisi dan tanggal di antara `promoStartsOn` dan `promoEndsOn` (inklusif, sisi kosong tanpa batas). Persen: `floor(gross × persen / 100)`. Nominal: per unit × quantity, tidak melebihi gross.
- **Diskon koreksi setelah final** (Admin Keuangan, `applyFinalDiscount`) tetap di tingkat tagihan.

`invoiceTotals` mengembalikan tambahan `grossSubtotal` dan `itemDiscount`; `subtotal` kini berarti setelah diskon item. Semua pemakai (`invoice-read`, `invoice-payments`, `invoice-store`, `invoice-lifecycle`, struk) memakai fungsi yang sama.

## 5. Tagihan draf (resepsionis, `invoice:manage`)

### 5.1 Diskon bawaan

- Barang yang ditambahkan (`addInvoiceItem`) dan baris dari penyerahan Apoteker mendapat diskon bawaan bila promonya berlaku hari itu: `discountSource = PROMO`, alasan "Promo: {nama promo}".
- Mengubah jumlah barang menghitung ulang diskon `PROMO` baris itu. Diskon `MANUAL` dipertahankan bila masih ≤ gross baru, bila tidak dipotong ke gross.
- "Perbarui harga katalog" yang sudah ada ikut memasang, mengubah, atau melepas diskon `PROMO` sesuai promo hari itu; diskon `MANUAL` tidak disentuh.

### 5.2 Diskon manual per baris

- Setiap baris draf punya aksi **Diskon** yang membuka dialog: jenis (Nominal untuk seluruh baris / Persen), nilai, alasan (wajib, ≤ 200 karakter). Persen diubah ke rupiah (dibulatkan ke bawah) dan disimpan sebagai `discountAmount`; persentase tidak disimpan.
- Pada baris berdiskon `PROMO`, dialog menampilkan promo yang terpasang; menyimpan nilai lain menjadikannya `MANUAL`. **Hapus diskon** mengosongkan diskon baris.
- Galat: melebihi gross baris ("Diskon tidak boleh melebihi harga baris."), melebihi batas gabungan ("Diskon di atas 20% diberikan oleh Admin Keuangan."), alasan kosong.
- Semua perubahan memakai penguncian versi draf yang sudah ada (`touchDraft`).

### 5.3 Tampilan

Baris berdiskon menampilkan jumlah kotor, lalu "Diskon −Rp… · {alasan}" (penanda "Promo" untuk diskon bawaan), lalu jumlah baris. Ringkasan tagihan: Subtotal (kotor), Diskon item, Diskon tagihan, Total.

## 6. Catatan internal

- Kotak **"Catatan internal"** (≤ 500 karakter) di halaman tagihan, draf maupun final dan dibatalkan, untuk `invoice:manage` dan `invoice:correct`. Disimpan dengan tombol **Simpan catatan**, dicatat di audit (`invoice.notes`) dengan ringkasan nomor/“draf” saja, tanpa isi.
- Mengubah catatan tidak mengubah versi draf (tidak membatalkan suntingan lain yang sedang dibuka).
- Tidak pernah ikut struk, tautan struk, ESC/POS, atau pesan WA (sudah dijamin `buildPublicReceipt` yang memilih kolom satu per satu).

## 7. Rekening klinik (Pengaturan, `content:manage`)

- Bagian **"Rekening klinik"** di Pengaturan: daftar rekening (bank, nomor, nama pemilik, status), tambah, ubah, aktifkan/nonaktifkan, dan urutan. Tanpa hapus (riwayat pembayaran merujuknya).
- Validasi: bank dan pemilik wajib (≤ 80 karakter); nomor 5–20 angka setelah spasi/tanda hubung dibuang; nomor + bank tidak boleh kembar di antara rekening aktif.
- Perubahan dicatat di audit (`clinic-bank.create/update/activate/deactivate`).

## 8. Pembayaran transfer bank

- Dialog **Catat pembayaran**: bila metode **Transfer bank** dipilih, muncul:
  - **Rekening tujuan** (wajib): pilihan dari rekening klinik aktif, berurutan; bila hanya satu, sudah terpilih.
  - **Bank pengirim**, **Nama pemilik rekening pengirim**, **Nomor rekening pengirim**, **Nomor referensi** (opsional; ≤ 80 karakter; nomor rekening boleh memuat `*` untuk nomor yang disamarkan di bukti transfer).
- Tanpa rekening klinik aktif: dialog menampilkan "Belum ada rekening klinik. Tambahkan di Pengaturan." dan Transfer bank tidak bisa disimpan.
- Server menolak `TRANSFER` tanpa rekening tujuan, rekening tidak aktif, atau rekening yang tidak ada. Untuk Tunai dan QRIS, isian transfer diabaikan (disimpan kosong).
- **Daftar pembayaran** di tagihan menampilkan untuk transfer: "Ke {destinationLabel}", lalu "Dari {bank pengirim} {nomor} a.n. {nama}" bila diisi, dan "Ref. {nomor referensi}".
- **Struk** (kertas, ESC/POS, online) tetap hanya menulis "Transfer bank"; data rekening pengirim tidak pernah tampil di struk.

## 9. Struk dan laporan

- **Struk** (`PublicReceipt`, ESC/POS, `/struk`, cetak browser): tiap baris berdiskon menampilkan "Diskon −Rp…" di bawah jumlah kotor; ringkasan menampilkan Subtotal, Diskon item (bila ada), Diskon (tagihan, bila ada), Total. Alasan diskon tidak tampil (sama dengan sekarang). `PublicReceipt.lines[]` mendapat `discount` dan `amount` menjadi jumlah setelah diskon.
- **Laporan pendapatan** (`report-sql.ts`): pendapatan per jenis (layanan/treatment/barang) memakai jumlah baris setelah diskon item; kolom diskon = diskon item + diskon tagihan; piutang memakai total baru.

## 10. Teknis

- `src/lib/invoice.ts`: `lineAmount`, `invoiceTotals` (dengan `grossSubtotal`, `itemDiscount`), `validateLineDiscount`, `manualDiscountTotal`, batas gabungan; `src/lib/stock-promo.ts` (murni): `activePromo(item, today)`, `promoDiscount(item, quantity, unitPrice, today)`, `validatePromo`.
- `src/server/invoice-drafts.ts`: `setLineDiscount({ invoiceId, version, lineId, kind, value, reason })`, `clearLineDiscount`, pemasangan promo di `addInvoiceItem`, perubahan jumlah, dan `refreshCatalogPrices`; `setInvoiceDiscount` memakai batas gabungan.
- `src/server/invoice-notes.ts`: `updateInvoiceNotes({ invoiceId, notes })`.
- `src/server/clinic-bank.ts`: daftar, tambah, ubah, aktif/nonaktif.
- `src/server/invoice-payments.ts` dan `validateInvoicePayment`: isian transfer.
- `src/server/stock-catalog.ts`: simpan promo barang (`stock:manage`, audit `stock-item.promo`).
- Layar: dialog diskon baris di editor draf, kotak catatan, bagian rekening klinik di Pengaturan, isian transfer di dialog pembayaran, isian promo di formulir barang Stok.

## 11. Keamanan dan privasi

- Batas 20% diperiksa di server untuk setiap perubahan diskon dan saat finalisasi, bukan hanya di layar.
- Catatan internal dan rincian rekening pengirim tidak pernah keluar ke struk, tautan publik, atau pesan WA.
- Nomor rekening pengirim adalah data pribadi pelanggan: hanya tampil di halaman tagihan untuk peran dengan `invoice:read`, tidak masuk audit (audit pembayaran mencatat jumlah dan metode seperti sekarang).

## 12. Pengujian

- **Unit:** jumlah baris dan total dengan diskon item + diskon tagihan (nominal/persen, pembulatan, batas gross); batas gabungan (PROMO tidak dihitung, MANUAL dihitung, tepat 20% sah, 20% + Rp1 ditolak); promo berlaku per tanggal (sebelum, pada hari mulai/selesai, sesudah, sisi kosong); validasi rekening dan isian transfer; struk dan ESC/POS dengan diskon baris; komponen dialog diskon, kotak catatan, isian transfer, bagian rekening.
- **Integrasi:** promo terpasang saat barang ditambah dan saat penyerahan Apoteker, dihitung ulang saat jumlah berubah, diperbarui oleh "Perbarui harga katalog"; diskon manual melampaui batas ditolak untuk resepsionis dan diterima Admin Keuangan; finalisasi menolak draf yang melampaui batas; laporan pendapatan per jenis memakai jumlah setelah diskon; transfer tanpa rekening tujuan atau dengan rekening nonaktif ditolak; salinan rekening tujuan tidak berubah setelah rekening diedit; catatan tidak ada di struk publik; migrasi menyalin rekening `ClinicSetting`; CHECK basis data (diskon > gross, diskon tanpa alasan, promo tidak lengkap).
- **E2E:** Apoteker memasang promo barang; resepsionis menambah barang (diskon promo terpasang), memberi diskon manual pada baris lain, melihat penolakan di atas 20%, mengisi catatan, memfinalkan, lalu mencatat pembayaran transfer ke rekening klinik dengan data pengirim; struk menampilkan diskon baris. Super Admin menambah rekening di Pengaturan. Desktop dan ponsel.

## 13. Rilis dan risiko

- Migrasi hanya menambah kolom, satu enum, dan satu tabel, ditambah satu penyalinan data rekening; `deploy.sh kembali` aman (rilis lama mengabaikan kolom baru; diskon baris yang sudah dibuat tidak terbaca rilis lama, sehingga total di rilis lama akan lebih besar dari seharusnya untuk tagihan yang memakai diskon baris — bila kembali ke rilis lama, tagihan dengan diskon baris perlu dicek).
- Laporan bulan berjalan berubah angkanya hanya untuk tagihan yang memakai diskon baris; tagihan lama tidak berubah.
- Diskon bawaan dikelola `stock:manage` (Super Admin dan Apoteker), sama dengan harga jual barang. Bila pemilik ingin hanya Super Admin yang boleh memasang promo, itu satu perubahan hak.
