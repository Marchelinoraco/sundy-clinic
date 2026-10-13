# Menu Karyawan: data karyawan, gaji, dan komisi — desain

Tanggal: 13 Oktober 2026 · Status: menunggu tinjauan pemilik

## 1. Tujuan

Klinik membayar gaji dan komisi perawat/terapis setiap bulan, tetapi panel belum mencatatnya. Laporan Komisi (spec harga
modal 7) sudah menghitung komisi per pelaksana, tetapi tidak tahu mana yang sudah dibayar, dan laba rugi tidak memuat gaji
maupun komisi kecuali dicatat manual di Pengeluaran.

Berhasil bila: semua karyawan (termasuk yang tanpa akun panel) tercatat beserta gajinya; setiap bulan Admin Keuangan
membuat satu daftar penggajian yang otomatis memuat komisi dari tagihan; bonus dan potongan dicatat dengan keterangan;
pembayaran dicatat per karyawan, komisi tidak pernah dibayar dua kali, dan pembayaran otomatis masuk Pengeluaran sehingga
laba rugi benar; slip gaji bisa dicetak atau disimpan sebagai PDF.

### Keputusan pemilik

| No | Keputusan |
|----|-----------|
| K1 | Menu mencakup data karyawan, gaji bulanan, pembayaran komisi, serta bonus dan potongan. |
| K2 | Karyawan = semua staf yang ada + karyawan tanpa akun panel (cleaning service, satpam, driver, …). |
| K3 | Hanya Super Admin dan Admin Keuangan yang membuka menu ini. Peran lain tidak melihat gaji siapa pun. |
| K4 | Gaji dan komisi dibayar bersama, sebulan sekali; setiap pembayaran otomatis tercatat di Pengeluaran. |
| K5 | Slip gaji bisa dicetak / disimpan sebagai PDF dari browser (tanpa kirim WhatsApp). |
| K6 | Data karyawan di tabel terpisah dari `Staff` (pendekatan 1), boleh ditautkan satu-satu ke `Staff`. |

## 2. Data

### 2.1 `Employee`

| Kolom | Jenis | Keterangan |
|-------|-------|------------|
| `id` | String cuid | |
| `name` | String | 2–100 karakter |
| `position` | String | jabatan bebas, 2–60 karakter (mis. "Perawat", "Cleaning service") |
| `branchId` | String? → `Branch` | cabang utama; kosong = umum. `onDelete: Restrict` |
| `joinedOn` | Date | tanggal masuk |
| `nik` | String? | 16 angka bila diisi (aturan sama dengan NIK pasien) |
| `npwp` | String? | 15 atau 16 angka bila diisi (tanda baca dibuang) |
| `whatsapp` | String? | dinormalkan `62…` seperti nomor pasien |
| `bankName`, `bankAccount`, `bankHolder` | String? | rekening tujuan; diisi bertiga atau tidak sama sekali; nomor 5–30 angka |
| `notes` | String? | maks. 500 karakter |
| `baseSalary` | Int | gaji pokok per bulan, ≥ 0 |
| `allowance` | Int | tunjangan tetap per bulan, ≥ 0 |
| `status` | `EmployeeStatus` (`AKTIF`, `BERHENTI`) | bawaan `AKTIF` |
| `leftOn` | Date? | wajib bila `BERHENTI`, kosong bila `AKTIF` (CHECK) |
| `staffId` | String? → `Staff` | unik; `onDelete: SetNull` |
| `createdAt`, `updatedAt` | DateTime | |

CHECK `employee_values`: `baseSalary >= 0 AND allowance >= 0 AND ((status = 'AKTIF' AND leftOn IS NULL) OR
(status = 'BERHENTI' AND leftOn IS NOT NULL))`. Data karyawan tidak pernah dihapus (riwayat gaji merujuknya).

### 2.2 `PayrollPeriod`

`id`, `month` (String "YYYY-MM", unik), `createdById`, `createdByName`, `createdAt`. Satu per bulan.

### 2.3 `PayrollItem`

| Kolom | Keterangan |
|-------|------------|
| `id`, `periodId` → `PayrollPeriod` (`Restrict`), `employeeId` → `Employee` (`Restrict`) | unik `(periodId, employeeId)` |
| `employeeName`, `position` | disalin saat dibuat (slip lama tidak berubah bila data karyawan diganti) |
| `baseSalary`, `allowance` | disalin dari karyawan saat dibuat; boleh diubah sebelum dibayar dengan `amountNote` (alasan) |
| `amountNote` | String?; wajib bila gaji pokok/tunjangan berbeda dari data karyawan saat diubah |
| `commission`, `treatments` | Int; bernilai 0 dan dihitung langsung selama belum dibayar; diisi (dikunci) saat dibayar |
| `bonusTotal`, `deductionTotal`, `total` | Int; dikunci saat dibayar |
| `paidAt` | Date?; `paidById`, `paidByName` |
| `salaryExpenseId`, `commissionExpenseId` | String? → `Expense`; terisi saat dibayar |
| `voidedPayments` | Int bawaan 0; jumlah pembatalan pembayaran (untuk audit) |

CHECK `payroll_item_values`: semua nominal ≥ 0, `total >= 0`; `paidAt IS NULL` ⇔ `paidById IS NULL`.

### 2.4 `PayrollAdjustment`

`id`, `itemId` → `PayrollItem` (`Cascade`), `kind` (`BONUS` | `POTONGAN`), `amount` (Int > 0), `note` (2–120 karakter),
`invoiceLineId` (String?, hanya untuk koreksi komisi otomatis, unik), `createdByName`, `createdAt`.

### 2.5 Penanda komisi di `InvoiceLine`

Kolom baru `payrollItemId` (String? → `PayrollItem`, `onDelete: SetNull`): baris treatment yang komisinya sudah dibayar.
Index `(performerId, payrollItemId)`.

## 3. Komisi

- **Komisi terbuka** seorang karyawan untuk bulan M = baris `InvoiceLine` dengan `kind = TREATMENT`, `performerId` = staf
  yang ditautkan ke karyawan itu, `payrollItemId IS NULL`, `commissionAmount > 0`, pada tagihan `FINAL` yang
  `finalizedAt < awal bulan M+1` (WITA). Komisi bulan-bulan sebelumnya yang belum dibayar ikut masuk.
- Karyawan tanpa tautan Staf tidak punya komisi.
- Selama baris penggajian belum dibayar, `commission` dan `treatments` yang tampil dihitung langsung dari komisi terbuka.
- **Saat dibayar** (dalam satu transaksi dengan kunci baris karyawan): baris-baris komisi terbuka diberi `payrollItemId`,
  jumlahnya disimpan ke `commission`/`treatments`. Baris yang sudah diklaim penggajian lain tidak terhitung, sehingga dua
  pembayaran bersamaan tidak membayar komisi yang sama.
- **Koreksi pembatalan:** bila tagihan yang salah satu barisnya sudah diklaim kemudian dibatalkan (`BATAL`), maka saat
  penggajian bulan berikutnya dibuat atau dibuka, baris penggajian karyawan itu otomatis mendapat `POTONGAN`
  "Koreksi komisi TG-…-… (dibatalkan)" sebesar komisi baris itu (`invoiceLineId` unik mencegah koreksi ganda). Koreksi
  hanya ditambahkan ke baris yang belum dibayar.

## 4. Alur penggajian

1. **Buat penggajian** bulan M (pilih bulan; bulan yang sama ditolak "Penggajian bulan ini sudah ada."). Dibuat satu
   `PayrollItem` untuk setiap karyawan `AKTIF`, atau `BERHENTI` dengan `leftOn` di dalam bulan M, yang `joinedOn` paling
   lambat akhir bulan M. Gaji pokok dan tunjangan disalin dari data karyawan.
2. **Sesuaikan** (hanya baris belum dibayar): tambah/hapus bonus dan potongan; ubah gaji pokok/tunjangan bulan itu dengan
   alasan; hapus baris dari daftar; tambah karyawan aktif yang belum ada di daftar.
3. **Tandai dibayar** (tanggal bayar bawaan hari ini WITA, tidak boleh di masa depan): hitung total = gaji pokok +
   tunjangan + komisi + bonus − potongan; total < 0 ditolak "Potongan melebihi gaji."; klaim komisi; buat dua `Expense`:
   - kategori **"Gaji Karyawan"**: gaji pokok + tunjangan + bonus − potongan (boleh 0; bila 0 tidak dibuat),
   - kategori **"Komisi"**: komisi (bila 0 tidak dibuat),
   keduanya bertanggal tanggal bayar, `branchId` = cabang utama karyawan, catatan "Penggajian 2026-10 · <nama>".
   Kategori dibuat bila belum ada (nama dibandingkan tanpa huruf besar/kecil). Semua dalam satu transaksi; dicatat di audit.
4. **Batalkan pembayaran** (alasan wajib): kedua `Expense` dibatalkan (`voidedAt`, alasan disalin), klaim komisi dilepas,
   `commission`/`treatments`/`total` kembali dihitung langsung, `voidedPayments` + 1; dicatat di audit.
5. Tidak ada status "ditutup" untuk periode; setiap baris berdiri sendiri. Periode tidak bisa dihapus bila ada baris yang
   pernah dibayar; periode tanpa pembayaran boleh dihapus.

## 5. Tampilan

Hak baru `payroll:manage` = Super Admin + Admin Keuangan. Menu samping **Karyawan** (`/admin/karyawan`), dua tab:

- **Karyawan** (`?tab=karyawan`, bawaan): tabel Nama · Jabatan · Cabang · Gaji pokok · Tunjangan · Staf tertaut · Status.
  **+ Karyawan** dan **Ubah** memakai satu dialog berisi semua kolom 2.1, termasuk pilihan "Tautkan ke staf" (staf yang
  belum tertaut). **Berhentikan** (tanggal keluar) dan **Aktifkan kembali**. NIK dan rekening tidak tampil di tabel.
- **Penggajian** (`?tab=penggajian`): daftar bulan (jumlah karyawan, total, dibayar, sisa) dan **+ Penggajian**.
  Halaman bulan `/admin/karyawan/penggajian/<YYYY-MM>`: ringkasan + tabel per karyawan (gaji, tunjangan, komisi dengan
  tautan rincian ke tab Komisi laporan, bonus, potongan, total, status). Aksi per baris: **Penyesuaian**, **Ubah gaji**,
  **Tandai dibayar**, **Batalkan pembayaran**, **Slip**, **Keluarkan dari daftar**; di atas tabel **+ Tambah karyawan**.
- **Slip gaji** `/admin/karyawan/slip/<itemId>`: kop (`CLINIC_FULL_NAME`), nama, jabatan, periode, rincian (gaji pokok,
  tunjangan, komisi dan jumlah treatment, setiap bonus dan potongan), total, tanggal bayar, rekening tujuan. Tata letak
  khusus cetak (`@media print` menyembunyikan panel); tombol **Cetak / simpan PDF** memanggil `window.print()`. Baris
  belum dibayar bertanda air "DRAF".
- **Laporan Komisi** (tab yang sudah ada): rincian per baris mendapat kolom "Dibayar" (periode penggajian atau "Belum").

## 6. Hak akses dan kerahasiaan

- Semua halaman, rute slip, dan aksi menu Karyawan memeriksa `payroll:manage`; peran lain 403.
- Bacaan karyawan dan penggajian ada di modul baca sendiri dengan `select` eksplisit; `Employee` tidak pernah dibaca
  oleh situs publik, halaman Staf, atau bacaan tagihan.
- Jejak audit memuat nama karyawan dan nominal, tidak memuat NIK, NPWP, atau nomor rekening.

## 7. Pengujian

- **Unit:** validasi data karyawan (NIK, NPWP, rekening bertiga, nomor WA, status/tanggal keluar), validasi penyesuaian,
  rumus total, dialog karyawan dan dialog penyesuaian.
- **Integrasi:** komisi terbuka hanya dari tagihan FINAL yang belum diklaim, termasuk bulan sebelumnya; dua pembayaran
  tidak membayar komisi yang sama; koreksi otomatis untuk tagihan yang dibatalkan sesudah komisinya dibayar, tanpa
  koreksi ganda; pembayaran membuat Pengeluaran Gaji Karyawan dan Komisi dan masuk laba rugi; batalkan pembayaran
  membatalkan pengeluaran dan melepas klaim; bulan ganda ditolak; total negatif ditolak; karyawan berhenti masuk hanya di
  bulan keluarnya; hak akses (Resepsionis, Apoteker, Dokter ditolak).
- **E2E** (`tests/e2e/karyawan.spec.ts`, desktop dan ponsel): Admin Keuangan menambah karyawan tanpa akun dan menautkan
  terapis → tagihan bertreatment dengan terapis itu difinalkan → buat penggajian, komisi tampil → tambah potongan → tandai
  dibayar → slip tampil → Pengeluaran bulan itu memuat Gaji Karyawan dan Komisi.

## 8. Di luar cakupan

Absensi dan jadwal kerja karyawan non-panel, perhitungan PPh 21/BPJS, pro-rata otomatis untuk karyawan baru (diatur
lewat "Ubah gaji" dengan alasan), kirim slip lewat WhatsApp, karyawan melihat slip sendiri.
