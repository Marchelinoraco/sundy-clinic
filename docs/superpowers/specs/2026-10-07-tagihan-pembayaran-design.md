# Desain — Tagihan dan Pembayaran Customer (Sub-proyek Keuangan 2)

- **Versi:** 1.0
- **Tanggal:** 7 Oktober 2026
- **Status:** Dibangun (belum dideploy)
- **Bagian dari:** rangkaian keuangan klinik (`docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`, bagian 2)
- **Melanjutkan:**
  - stok, batch, dan jurnal stok: `docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`;
  - catatan dokter dan kunjungan: `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md`;
  - konsultasi online: `docs/superpowers/specs/2026-10-06-konsultasi-online-design.md`;
  - hak akses berbasis kemampuan: `src/lib/permissions.ts`.

## 1. Latar belakang & tujuan

Setelah stok dan hutang ke supplier tercatat (sub-proyek 1), sisi pendapatan masih kosong: layanan, treatment, dan obat yang diserahkan di klinik "dibayar di klinik" tanpa catatan apa pun di sistem. Tanpa ini laporan untung-rugi (sub-proyek 4) tidak punya pendapatan untuk dijumlahkan.

**Berhasil bila:**
- setiap kunjungan yang selesai bisa ditagih dalam beberapa klik, dengan layanan dan treatment terisi otomatis dari catatan dokter;
- obat dan produk yang dijual tercatat sebagai stok keluar dengan harga pokok dari batch yang terambil;
- setiap pembayaran (tunai, transfer, QRIS, boleh bertahap) tercatat dengan siapa, kapan, dan berapa;
- diskon selalu beralasan dan terawasi; uang masuk punya dua pasang mata (resepsionis mencatat, Admin Keuangan mengoreksi);
- penjualan produk tanpa kunjungan tetap bisa ditagih;
- tidak ada tagihan yang hilang: yang salah dibatalkan, tidak dihapus.

## 2. Keputusan (dikonfirmasi pemilik, 7 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| TG1 | Siapa menagih dan kapan | **Resepsionis, setelah dokter memfinalisasi** catatan; tagihan terisi otomatis dari kunjungan |
| TG2 | Biaya booking | **Pendapatan terpisah**, tidak mengurangi tagihan. Konsultasi Online sudah lunas di muka |
| TG3 | Metode bayar | **Tunai, transfer bank, QRIS** |
| TG4 | Fitur tagihan | **Diskon per tagihan** dan **bayar sebagian** (cicilan) |
| TG5 | Sumber tagihan | **Kunjungan final dan penjualan langsung** (tanpa kunjungan) |
| TG6 | Obat dan produk | **Resepsionis menambah dari katalog stok** saat menagih; sub-proyek 3 kelak mengisinya dari resep |
| TG7 | Siklus | **Draf → Final**; Final mengunci item dan mengurangi stok; yang salah **dibatalkan dengan alasan**, tidak dihapus |
| TG8 | Hak akses | **Resepsionis menagih**; **Admin Keuangan melihat dan mengoreksi**; Dokter dan Apoteker tidak mengakses tagihan |
| TG9 | Diskon | Nominal atau persen, **alasan wajib**; di atas **20%** hanya Admin Keuangan/Super Admin |
| TG10 | Pendekatan data | **Tabel tagihan sendiri** (`Invoice`, `InvoiceLine`, `InvoicePayment`) dengan harga yang disalin |

## 3. Data

### 3.1 Model baru

**`Invoice`**
- `number String? @unique` — nomor berurutan `TG-{tahun}-{4 digit}`, diisi saat **Final**; draf belum bernomor. Dibuat dari penghitung per tahun (`InvoiceNumberCounter { year, value }`), seperti nomor rekam medis pasien.
- `status` (`DRAF` | `FINAL` | `DIBATALKAN`), `version Int @default(1)` (naik setiap perubahan draf; untuk mendeteksi suntingan bersamaan).
- `patientId` (wajib), `appointmentId String?`, `branchId`.
- `discountKind` (`NOMINAL` | `PERSEN`)`?`, `discountValue Int @default(0)`, `discountReason String?`, `discountByName String?`.
- `notes String?`, `createdById`, `createdByName`, `createdAt`, `updatedAt`.
- `finalizedAt DateTime?`, `finalizedByName String?`.
- `cancelledAt DateTime?`, `cancelledByName String?`, `cancelReason String?`.
- Unik sebagian: satu tagihan aktif (`status <> 'DIBATALKAN'`) per `appointmentId`.

**`InvoiceLine`**
- `invoiceId`, `kind` (`LAYANAN` | `TREATMENT` | `BARANG`), `name`, `quantity Int` (> 0), `unitPrice Int` (≥ 0), `sortOrder`.
- `serviceId String?`, `encounterTreatmentId String?` (cegah treatment yang sama masuk dua kali), `itemId String?` (untuk `BARANG`), `priceNote String?` (catatan bila harga diubah dari harga katalog).

**`InvoiceStockUse`** — stok yang diambil untuk satu baris `BARANG`.
- `lineId`, `batchId`, `quantity Int` (> 0), `unitCost Int` (disalin dari batch).

**`InvoicePayment`**
- `invoiceId`, `amount Int` (> 0), `method` (`PaymentMethod` yang sudah ada: `TUNAI` | `TRANSFER` | `QRIS`), `paidAt` (@db.Date), `reference String?`, `staffId`, `staffName`, `createdAt`.
- `revokedAt DateTime?`, `revokedByName String?`, `revokeReason String?`.

**`InvoiceNumberCounter`** — `year Int @id`, `value Int`.

**`StockMovementKind`** mendapat nilai `KELUAR`; `StockMovement` mendapat `invoiceId String?`. CHECK alasan penyesuaian tidak berubah (`KELUAR` tanpa alasan).

### 3.2 Aturan hitung

- **Subtotal** = Σ `quantity × unitPrice`.
- **Diskon:**
  - persen (1–100): `floor(subtotal × persen / 100)`;
  - nominal: 0 ≤ nilai ≤ subtotal.
- **Total** = subtotal − diskon. **Dibayar** = Σ pembayaran aktif. **Sisa** = total − dibayar.
- **Status tampil:** *Draf*; *Dibatalkan*; untuk `FINAL`: *Lunas* bila sisa = 0 (termasuk total Rp 0), *Sebagian* bila dibayar > 0, selain itu *Belum dibayar*.
- **Batas diskon resepsionis** = `floor(subtotal × 20 / 100)`, berlaku untuk diskon persen maupun nominal; lebih dari itu butuh `invoice:correct`.
- **Pembayaran** tidak boleh melebihi sisa; tanggal bayar tidak di masa depan dan tidak sebelum tanggal finalisasi.
- **Harga pokok baris barang** = Σ `InvoiceStockUse.quantity × unitCost`; **laba kotor tagihan** = total − Σ harga pokok (untuk sub-proyek 4; tidak ditampilkan di sini).
- **Uang** rupiah penuh (`Int`); **jumlah** bilangan bulat.

### 3.3 Isi otomatis dari kunjungan

Tombol **Buat tagihan** membuat draf berisi:
- satu baris `LAYANAN` dari layanan booking (nama dan harga saat itu), **kecuali** booking Konsultasi Online (sudah lunas di muka, sehingga tanpa baris ini);
- satu baris `TREATMENT` per `EncounterTreatment` (nama layanan, harga saat itu, `encounterTreatmentId` terisi);
- layanan tanpa harga atau yang sudah dihapus masuk sebagai baris Rp 0 yang bisa diedit di draf.

### 3.4 Penjagaan di basis data

- CHECK: `quantity > 0`, `unitPrice >= 0`, `amount > 0`, `discountValue >= 0`, persen ≤ 100, nomor wajib bila `FINAL` dan kosong bila `DRAF`, `finalizedAt` wajib bila `FINAL`.
- Unik sebagian satu tagihan aktif per kunjungan; unik `number`.
- Pengurangan stok memakai `UPDATE … WHERE quantityRemaining >= n` (sama seperti retur).
- Migrasi hanya menambah tabel, kolom, dan nilai enum.

## 4. Alur resepsionis (menu **Tagihan**)

### 4.1 Daftar tagihan

- Tab **Perlu ditagih** (bawaan), **Draf**, **Belum lunas**, **Lunas**, **Dibatalkan**; pencarian nomor atau nama pasien.
- **Perlu ditagih:** kunjungan berstatus *Final* dalam 30 hari terakhir yang belum punya tagihan aktif, dengan tombol **Buat tagihan**.
- **+ Penjualan langsung:** membuat draf tanpa kunjungan; pasien dipilih dari data pasien yang ada.

### 4.2 Membuat dan mengubah draf

- Buat dari kunjungan: terisi otomatis (3.3). Dua klik bersamaan menghasilkan satu tagihan; yang kedua dibawa ke yang sama.
- **+ Barang:** pilih dari katalog stok (nama, satuan, harga jual, stok tersedia); barang tanpa harga jual tidak bisa ditambahkan.
- **+ Baris bebas** (layanan atau treatment) dengan nama dan harga; harga yang diubah dari harga katalog wajib catatan.
- **Ubah jumlah, harga, hapus baris, ubah diskon** hanya di draf. **Segarkan harga katalog** menyalin ulang harga saat ini ke baris katalog.
- Setiap perubahan menaikkan `version`; simpan dengan versi usang ditolak: "Tagihan ini baru diubah orang lain. Muat ulang halaman."

### 4.3 Finalkan

- Ringkasan sebelum finalisasi: total, diskon, dan barang yang stoknya berkurang.
- Dalam satu transaksi: ambil stok (FEFO, tanpa batch kedaluwarsa, dari cabang tagihan) untuk setiap baris barang, catat `InvoiceStockUse` dan jurnal `KELUAR`, beri nomor tagihan, kunci baris, status `FINAL`.
- Stok tidak cukup: seluruh finalisasi ditolak ("Stok {barang} di {cabang} tidak cukup (tersedia N)"), draf utuh.
- Dua orang memfinalkan bersamaan: tepat satu berhasil.

### 4.4 Pembayaran

- **Catat pembayaran:** nominal (bawaan = sisa), metode, tanggal, referensi. Boleh bertahap. Dua pembayaran bersamaan yang masing-masing melunasi: hanya satu diterima (tagihan dikunci selama transaksi).

### 4.5 Cetak

Halaman tagihan memakai gaya cetak (`@media print`): nama klinik, nomor, pasien, baris, diskon, total, dibayar, sisa; tanpa menu dan tombol. PDF dan pengiriman WhatsApp di luar cakupan.

## 5. Pembatalan dan koreksi

- **Batalkan tagihan** (alasan wajib):
  - draf: oleh `invoice:manage` atau `invoice:correct`;
  - final tanpa pembayaran aktif: oleh `invoice:manage` atau `invoice:correct`;
  - final yang pernah dibayar: pembayarannya dibatalkan dulu, lalu dibatalkan oleh `invoice:correct`.
- **Stok dikembalikan** saat tagihan final dibatalkan: setiap `InvoiceStockUse` dikembalikan ke batch asalnya lewat jurnal `PENYESUAIAN` ("Tagihan {nomor} dibatalkan"). Tagihan tidak pernah dihapus; nomornya tidak dipakai ulang; kunjungan itu boleh ditagih ulang.
- **Batalkan pembayaran:** hanya `invoice:correct`, alasan wajib; tidak dihapus, ditandai dibatalkan.
- **Tagihan final tidak bisa diubah.** Salah barang atau harga: batalkan lalu buat baru. Satu pengecualian: **diskon** boleh ditambah di tagihan final yang belum lunas oleh `invoice:correct`, dengan alasan.
- **Retur dari customer** di luar cakupan.

## 6. Hak akses

| Kemampuan | Isinya | Dipegang |
|---|---|---|
| `invoice:read` | Melihat tagihan, baris, pembayaran, dan daftar Perlu ditagih | Resepsionis, Admin Keuangan, Super Admin |
| `invoice:manage` | Buat tagihan dan penjualan langsung, ubah draf, diskon sampai 20%, finalkan, batalkan draf dan tagihan final tanpa pembayaran aktif, catat pembayaran | Resepsionis, Super Admin |
| `invoice:correct` | Diskon di atas 20% dan sesudah final, batalkan pembayaran, batalkan tagihan yang pernah dibayar | Admin Keuangan, Super Admin |

- Dokter, Apoteker, dan Terapis tidak mengakses tagihan.
- Tagihan hanya memuat nama layanan, area, dan harga; **tidak pernah membawa teks klinis** catatan dokter.
- Harga pokok per baris barang hanya terlihat oleh pemegang `stock:read` (Admin Keuangan, Super Admin). Barang untuk tagihan dibaca lewat katalog khusus (nama, satuan, harga jual, stok tersedia), tanpa harga beli dan tanpa batch.
- **Jejak audit:** `invoice.create`, `invoice.update`, `invoice.finalize`, `invoice.cancel`, `invoice.discount`, `invoice-payment.create`, `invoice-payment.revoke`.

## 7. Layar

- **`/admin/tagihan`** (tab di bagian 4.1) dan **`/admin/tagihan/[id]`** (draf: baris yang bisa diedit, diskon, Finalkan, Batalkan; final: baris terkunci, ringkasan, pembayaran, Batalkan, Tambah diskon, Cetak).
- **Dasbor:** kotak **Perlu ditagih** (resepsionis) dan **Tagihan belum lunas** (Admin Keuangan: jumlah dan total sisa). **Menu samping:** **Tagihan**, dengan angka kunjungan yang perlu ditagih bagi resepsionis.
- Uang dengan format rupiah yang ada; tanggal WITA.

## 8. Kasus khusus

| Kasus | Perilaku |
|---|---|
| Kunjungan masih draf | Tidak ada di Perlu ditagih |
| Kunjungan sudah punya tagihan aktif | Hilang dari Perlu ditagih; klik ganda ke tagihan yang sama |
| Layanan tanpa harga | Baris Rp 0 yang bisa diedit di draf |
| Stok tidak cukup saat finalisasi | Finalisasi ditolak utuh, draf tetap |
| Batch kedaluwarsa | Tidak dipakai untuk penjualan |
| Barang dinonaktifkan setelah masuk draf | Draf boleh difinalkan; barang nonaktif tidak bisa ditambahkan baru |
| Diskon penuh (total Rp 0) | Langsung *Lunas* |
| Harga katalog berubah setelah draf dibuat | Draf memakai harga yang disalin; **Segarkan harga katalog** untuk memperbarui |
| Pembayaran melebihi sisa, atau tanggal di masa depan | Ditolak |
| Pasien digabung sebagai duplikat setelah tagihan dibuat | Tagihan tetap menunjuk pasien asalnya |
| Kunjungan final mendapat adendum setelah ditagih | Tagihan tidak berubah; koreksi lewat batal dan buat baru |

## 9. Pengujian

**Unit**
- Subtotal, diskon persen dan nominal, total, sisa, status; batas diskon 20%; validasi baris, diskon, dan pembayaran; pengisian otomatis dari kunjungan; ringkasan perlu ditagih.
- Komponen: tabel draf (ubah, hapus, tambah barang), dialog pembayaran, bagian pembayaran tagihan final, daftar dengan saringan.

**Integrasi**
- Tagihan dari kunjungan terisi benar; duplikat bersamaan menghasilkan satu.
- Finalisasi mengambil stok FEFO, mencatat `KELUAR` dan harga pokok; ditolak utuh bila stok tidak cukup; pembatalan mengembalikan stok.
- Pembayaran sebagian, pelunasan, dan dua pembayaran bersamaan hanya satu diterima.
- Batalkan pembayaran dan tagihan sesuai peran; edit draf bersamaan ditolak oleh nomor versi.
- Hak akses tiap peran; tagihan tidak membawa teks klinis.
- Migrasi: CHECK dan unik sebagian tagihan aktif per kunjungan.

**E2E**
- Resepsionis membuat tagihan dari kunjungan final, menambah obat, finalkan, bayar sebagian lalu lunas.
- Admin Keuangan memberi diskon besar dan membatalkan sebuah pembayaran.
- Apoteker dan Dokter tidak bisa membuka Tagihan.

## 10. Di luar cakupan

- Resep terstruktur dan penyerahan obat oleh apoteker (sub-proyek 3).
- Pengeluaran lain dan laporan untung-rugi (sub-proyek 4).
- Paket/program berbayar di muka, retur dan pengembalian uang ke customer.
- PDF, pengiriman tagihan lewat WhatsApp, pajak/PPN, dan pembayaran kartu (EDC).
