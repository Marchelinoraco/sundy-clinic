# Desain — Akses Tambahan per Akun, Tahap 1 (mekanisme + Menu Stok)

- **Tanggal:** 21 November 2026
- **Status:** menunggu persetujuan pemilik
- **Menyentuh:** `src/lib/permissions.ts` (kemampuan dan `can`), `src/server/session.ts` (`CurrentStaff`, `requireCapability`), halaman dan aksi Stok, `src/lib/live-events.ts`, halaman Staf, jejak audit, satu tabel baru.
- **Tahap berikutnya (tidak dirancang di sini):** 2 Tagihan/Paket/Deposit, 3 Pasien/Booking/Pengingat/Jadwal/Kunjungan, 4 Resep, 5 Keuangan (Pengeluaran, Hutang, Laporan, Karyawan), 6 Layanan & Pengaturan.

## 1. Latar belakang & tujuan

Hak akses kini ditentukan **sepenuhnya oleh peran**, dan tiap akun hanya punya satu peran. Daftar kemampuan tiap peran tertulis di kode (`CAPABILITIES_BY_ROLE`), sehingga mengubahnya butuh rilis. Akibatnya klinik tidak bisa, misalnya, membiarkan seorang Resepsionis ikut mengelola sebagian pekerjaan Menu Stok tanpa menjadikannya Apoteker.

Pemilik ingin: peran tetap seperti sekarang, tetapi **Super Admin bisa menambahkan kemampuan ke akun tertentu**, dan untuk Menu Stok akun itu hanya mendapat **sebagian fitur** di dalamnya, bukan seluruh menu. Pengaturan ini hanya boleh dilakukan Super Admin, sama seperti menu Staf.

**Berhasil bila:**
- Super Admin bisa memilih satu akun non-Super Admin dan mencentang akses tambahan Stok tertentu, dan akun itu langsung (tanpa login ulang) bisa memakai tepat fitur itu;
- fitur Stok lain tetap ditolak oleh server, bukan hanya disembunyikan;
- perilaku semua peran yang ada sekarang tidak berubah sama sekali bila tidak ada akses tambahan;
- setiap pemberian dan pencabutan akses tercatat di jejak audit.

## 2. Tujuan, bukan tujuan, dan hal yang harus dihindari

- **Tujuan:** mekanisme yang bisa dipakai tahap 2–6 tanpa merombak lagi; pemecahan halus untuk Menu Stok.
- **Bukan tujuan:**
  - mencabut hak bawaan peran (hanya menambah);
  - peran buatan sendiri;
  - memecah menu selain Stok;
  - mengubah siapa yang **tampil sebagai dokter** (jadwal, booking, Tim Dokter di situs). Itu tetap ditentukan peran (`role === "DOKTER"`), terpisah dari akses.
- **Hal yang harus dihindari:** satu hak tambahan membuka lebih dari yang dicentang; akses naik tanpa jejak; Super Admin terkunci keluar; menu lain menjadi bisa diberikan dalam bentuk kasar sebelum dipecah.

## 3. Keputusan pemilik (21 Nov 2026)

| # | Keputusan |
|---|---|
| A1 | Peran dasar tidak berubah; akses tambahan hanya **menambah** per akun (pendekatan "tambah per akun"). |
| A2 | Hanya yang berkemampuan `staff:manage` (Super Admin) yang melihat dan mengubah akses tambahan. |
| A3 | Menu Stok dipecah menjadi potongan fitur yang bisa diberikan satu per satu (bagian 4). |
| A4 | Semua menu akhirnya dipecah, bertahap; tahap 1 membangun mekanisme dan Stok saja. |

Keputusan saya (bukan pemilik, bisa dikoreksi): lihat bagian 9.

## 4. Pemecahan Menu Stok

Kemampuan `stock:manage` dihapus dan digantikan lima kemampuan. `stock:read` tetap.

| Kemampuan | Label di dialog | Isi |
|---|---|---|
| `stock:read` | Lihat stok | Tab Barang, Barang masuk, Supplier, halaman detail (hanya baca) |
| `stock:item` | Kelola barang | `createStockItem`, `updateStockItem`, `setStockItemActive` |
| `stock:supplier` | Kelola supplier | `createSupplier`, `updateSupplier`, `setSupplierActive` |
| `stock:receive` | Catat barang masuk & retur | `createPurchase`, `createSupplierReturn`, halaman `/admin/stok/masuk/baru` |
| `stock:adjust` | Penyesuaian stok | `adjustStock` |
| `stock:counter` | Isi stok meja & permintaan | `moveToCounter`, `pullToWarehouse`, `sendRestockRequest`, `rejectRestockRequest`, tab Permintaan, halaman `/admin/stok/permintaan/[id]`, tombol isi di Stok meja, pemberitahuan `RESTOCK_BARU` |

`price:manage` (harga beli/jual) dan `payable:manage` (hutang) sudah terpisah dan **tidak** ditawarkan di tahap 1 (menunggu tahap Keuangan).

**Peran bawaan:** Apoteker dan Super Admin memegang **semua** lima kemampuan baru (setara `stock:manage` hari ini). Admin Keuangan tetap hanya `stock:read`. Resepsionis tetap `counter:read` dan `restock:request`. Tidak ada peran lain yang berubah.

**Kemampuan prasyarat.** Memberi salah satu dari lima kemampuan baru otomatis memberi `stock:read`, supaya menu dan halaman daftar bisa dibuka. Memberi `stock:counter` otomatis memberi `counter:read` (halaman Stok meja). Prasyarat dihitung saat pemeriksaan, tidak disimpan sebagai baris terpisah.

## 5. Penyimpanan dan pemeriksaan

- **Tabel baru `StaffCapabilityGrant`:** `id`, `staffId` (FK ke Staff, hapus berantai), `capability` (teks), `grantedById` (teks, staf Super Admin pemberi), `createdAt`; unik pada (`staffId`, `capability`). Migrasi hanya menambah tabel, aman bagi rilis lama (rilis lama mengabaikannya).
- **Daftar yang boleh diberikan** (`GRANTABLE_CAPABILITIES`) tertulis di kode, tahap 1: `stock:read`, `stock:item`, `stock:supplier`, `stock:receive`, `stock:adjust`, `stock:counter`. Server menolak nama lain, sehingga `staff:manage`, `approval:give`, dan kemampuan menu yang belum dipecah tidak bisa diberikan lewat jalan apa pun.
- **`CurrentStaff`** bertambah `extraCapabilities: Capability[]`, dimuat sekali per permintaan di `loadStaff()` (satu `include`), sehingga berlaku **saat itu juga**, termasuk bagi sesi yang sedang berjalan.
- **`can`** menerima aktor: `can({ role, extraCapabilities }, capability)`. Ia benar bila peran memilikinya, atau akses tambahan memuatnya, atau akses tambahan memuat kemampuan yang menjadikannya prasyarat (bagian 4). Pemanggil yang kini menulis `can(staff.role, x)` diganti `can(staff, x)` (sekitar 135 tempat, mekanis; tempat yang hanya punya `role` tanpa akun, seperti rute pemberitahuan langsung, memuat akses tambahan akun yang sedang tersambung).
- **`requireCapability`** dan **`requireAnyCapability`** memakai `can` baru; ini kontrol sebenarnya (menyembunyikan tombol bukan kontrol akses).
- **Sidebar:** item **Stok** tampil bagi yang punya `stock:read` (termasuk lewat prasyarat); **Stok meja** bagi yang punya `counter:read`. Tombol dan tab di dalam halaman Stok mengikuti kemampuan masing-masing.

## 6. Halaman Staf: dialog "Akses tambahan"

- Tombol **Akses tambahan** pada baris staf, hanya terlihat bagi pemegang `staff:manage`. Untuk akun Super Admin, tombol tidak muncul (sudah punya semua).
- Dialog mengelompokkan per menu. Tahap 1 hanya satu kelompok, **Stok**:

```
Akses tambahan — Pricilia Monique Felicia Weku (Resepsionis)

Stok
  [ ] Lihat stok
  [x] Kelola barang
  [ ] Kelola supplier
  [x] Catat barang masuk & retur
  [ ] Penyesuaian stok
  [ ] Isi stok meja & permintaan
Akses yang sudah ada pada peran ditampilkan tercentang dan terkunci
(mis. "dari peran Resepsionis").                      [Batal] [Simpan]
```
- Menyimpan memberi dan mencabut dalam **satu transaksi** (menghitung selisih terhadap yang tersimpan). Hanya kemampuan di `GRANTABLE_CAPABILITIES`; kemampuan yang sudah dimiliki peran tidak disimpan.
- Daftar Staf menampilkan penanda kecil "+ akses" pada akun yang punya akses tambahan, dengan jumlahnya.

## 7. Jejak audit dan pengaman

- Tiap pemberian dan pencabutan menulis baris audit (`recordAudit`) berisi aktor (Super Admin), akun sasaran, dan kemampuan. Aksi: `AKSES_DITAMBAH`, `AKSES_DICABUT`.
- Aksi server `setStaffExtraCapabilities` meminta `staff:manage`, menolak sasaran Super Admin, menolak kemampuan di luar `GRANTABLE_CAPABILITIES`, dan menolak staf yang tidak ada.
- Akses tambahan **tetap tersimpan** bila akun dinonaktifkan atau perannya diubah; akses tidak berlaku selama akun nonaktif (gerbang `isActive` yang sudah ada). Bila peran diubah menjadi Super Admin, baris tambahan tidak berpengaruh dan boleh tertinggal.
- **Peran Super Admin dan PIN persetujuan tidak berubah:** `approval:give` tidak bisa diberikan.

## 8. Pengujian dan rilis

- **Unit:** `can` (peran saja, tambahan, prasyarat, kemampuan di luar daftar); semua peran bawaan menghasilkan hasil **identik** dengan sebelum perubahan untuk setiap kemampuan yang ada (uji kesetaraan, dengan `stock:manage` lama dipetakan ke lima kemampuan baru).
- **Integrasi:** `setStaffExtraCapabilities` (hanya Super Admin; menolak Super Admin sasaran, nama sembarang, staf tidak ada; selisih tepat; audit tertulis); akun Resepsionis dengan hanya `stock:receive` bisa `createPurchase` tetapi ditolak pada `adjustStock`, `createStockItem`, dan `moveToCounter`; pencabutan berlaku pada permintaan berikutnya.
- **E2E:** Super Admin memberi akses, Resepsionis masuk dan melihat hanya fitur itu.
- **Rilis:** satu migrasi yang hanya menambah tabel; deploy seperti biasa, dengan cadangan basis data lebih dulu. Buku panduan staf mendapat bagian baru.

## 9. Keputusan saya (bisa dikoreksi) dan sisa untuk pembangun

- **Prasyarat otomatis** (`stock:read` dan `counter:read`) supaya akun tidak mendapat hak yang tidak bisa dipakai. Alternatifnya mensyaratkan Super Admin mencentangnya sendiri; saya pilih otomatis.
- **Hanya menambah.** Tidak ada pencabutan hak bawaan. Mudah ditambah nanti dengan kolom jenis (tambah/cabut).
- **`stock:manage` dihapus**, bukan dipertahankan sebagai gabungan, agar tidak ada dua cara yang berbeda untuk hal yang sama.
- **Jangan menawarkan menu lain** di dialog sampai dipecah (bagian 5).
- Diserahkan kepada pembangun: nama berkas dan komponen, bentuk tepatnya penanda di daftar Staf, cara memuat akses tambahan untuk koneksi pemberitahuan langsung, dan urutan migrasi.

## 10. Pendekatan yang dipertimbangkan

1. **Tambah per akun (dipilih pemilik, 21 Nov 2026).** Sederhana, hasil akhir mudah dibaca ("peran + tambahan"), cocok untuk bertahap per menu. Kekurangan: penyesuaian yang sama untuk banyak akun harus diulang.
2. **Peran buatan sendiri.** Rapi untuk banyak akun berjabatan sama, tetapi butuh layar pengelola peran dan peran lama masih mengikat jadwal dan situs publik; lebih besar.
3. **Matriks penuh per akun.** Paling fleksibel, tetapi mudah salah atur dan peran kehilangan arti. Ditolak.
