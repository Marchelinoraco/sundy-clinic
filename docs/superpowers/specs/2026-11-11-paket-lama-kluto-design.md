# Desain — Paket Lama dari Kluto (sisa sesi diketik manual)

- **Versi:** 1.0
- **Tanggal:** 11 November 2026
- **Status:** Menunggu tinjauan pemilik
- **Menggantikan:** sub-proyek "impor Kluto" untuk bagian paket. Kluto tidak bisa mengekspor data, jadi tidak ada impor berkas.
- **Menyentuh:**
  - `PatientPackage`: asal paket, tagihan pembelian boleh kosong, catatan, tanpa batas waktu;
  - `PackageSessionEntry`: jenis entri baru untuk sesi yang sudah terpakai di Kluto;
  - menu Paket (`/admin/paket`, `/admin/paket/{id}`), dialog baru "Paket lama (Kluto)";
  - tampilan paket di detail pasien, editor tagihan, invoice A4/struk, dan Pengingat.

  Alur penjualan paket di tagihan, katalog paket, booking, rekam medis, dan laporan uang tidak berubah.

## 1. Latar belakang & tujuan

Sekitar 100 pasien lama masih punya sisa sesi treatment (dan mungkin jatah barang) dari paket yang dibeli dan dibayar di kasir lama, Kluto. Kluto tidak bisa mengekspor data. Admin hanya bisa melihat catatan per kunjungan di layar Kluto: tanggal treatment dan sesi ke berapa. Data pasien seperti NIK juga terlihat di sana.

Sekarang, paket di SunDY hanya bisa lahir dari tagihan pembelian SunDY. Akibatnya sisa sesi pasien lama tidak terlihat di SunDY, dan staf harus membuka Kluto setiap kali pasien lama datang treatment.

Tujuan:
1. Resepsionis dan Super Admin bisa **mengetik paket lama** pasien dari layar Kluto ke SunDY: paket apa, kapan dibeli, dan berapa yang sudah dipakai.
2. Setelah diketik, sisa sesinya **dipakai di tagihan persis seperti paket biasa**. Staf tidak perlu lagi membuka Kluto untuk sisa sesi.
3. Pekerjaan memasukkan ±100 paket bisa dicicil beberapa hari tanpa membanjiri Pengingat.

Bukan tujuan:
- impor berkas dari Kluto;
- riwayat treatment lama, pembayaran lama, dan sisa tagihan lama. Sisa tagihan pasien lama tetap ditagih di Kluto (keputusan pemilik);
- persetujuan PIN untuk paket lama;
- paket lama yang isinya berbeda dari katalog SunDY. Pemilik menyatakan paket dan treatment di Kluto sama dengan di SunDY;
- data rekam medis lama lainnya (alergi, riwayat penyakit, kunjungan lama, scan berkas kertas). Kalau dibutuhkan, dibahas terpisah.

Hal yang harus dihindari, walau fitur secara teknis berjalan:
- sesi gratis yang muncul tanpa jejak siapa yang memasukkannya;
- pendapatan di laporan naik palsu karena paket lama;
- ±100 pasien muncul bertanda *terlewat* di Pengingat pada hari pertama;
- pasien yang sama terdaftar dua kali, atau paket yang sama diketik dua kali oleh dua orang yang mencicil bersamaan.

## 2. Keputusan

| # | Pertanyaan | Keputusan | Oleh |
|---|---|---|---|
| PL1 | Cara masuk | **Diketik manual** dari layar Kluto. Tidak ada impor berkas. | pemilik |
| PL2 | Siapa yang mengetik | **Resepsionis dan Super Admin.** Admin Keuangan tidak mengetik; ia yang memeriksa dan membetulkan (PL11, PL12), sehingga yang mengetik dan yang memeriksa adalah orang yang berbeda. | pemilik (pilihan A, 11 Nov 2026) |
| PL3 | Persetujuan | **Tanpa PIN.** Paket lama langsung aktif begitu disimpan. Pengamannya jejak: siapa yang mengetik dan kapan (buku sesi + audit), serta saringan untuk pemeriksaan. | pemilik (pilihan A) |
| PL4 | Isi paket | **Dipilih dari katalog paket SunDY.** Isi (treatment/barang dan jumlahnya) disalin dari katalog seperti saat dijual. Paket katalog yang sudah dinonaktifkan tetap boleh dipilih, dengan tanda "tidak dijual lagi". | pemilik (katalog), Claude (nonaktif) |
| PL5 | Isian per paket | **Tanggal beli** di Kluto dan **jumlah kunjungan di Kluto**. Dari jumlah kunjungan, dialog mengisi otomatis per isi **jumlah yang sudah dipakai** (treatment) atau **sudah diambil** (barang). Staf boleh mengubah angka per isi. SunDY menghitung sisanya: isi katalog − sudah dipakai. Ditambah **catatan** opsional, misalnya nomor nota Kluto. | pemilik (tanggal, pemakaian), Claude (jumlah kunjungan, isi otomatis, catatan) |
| PL6 | Masa berlaku | **Tanpa batas waktu.** Paket lama tidak pernah kedaluwarsa dan tidak bisa (dan tidak perlu) diperpanjang. | pemilik |
| PL7 | Uang | **Tidak ada tagihan dan tidak masuk pendapatan.** Paket lama tidak tampil di laporan uang masuk, pendapatan, atau margin penjualan paket. Harga disimpan 0 dan tampil "Dibayar di Kluto". | pemilik (uang), Claude (tampilan) |
| PL8 | Pemakaian | **Sama dengan paket biasa:** "Pakai sesi paket" di tagihan, terpotong saat final, Rp 0. Komisi pelaksana dihitung seperti sesi paket biasa. | Claude, disetujui pemilik |
| PL9 | Pasien | Cari pasien yang sudah ada (NIK, nama, no. RM, WA). Kalau belum ada, **buat pasien dari dialog yang sama**. Wajib hanya **nama dan WA**; NIK, tanggal lahir, alamat, kontak darurat, dan lainnya boleh kosong. NIK, tanggal lahir, dan alamat dilengkapi resepsionis saat check-in pertama, seperti pasien dari booking situs. | pemilik |
| PL10 | Paket ganda | Bila pasien sudah punya paket lama **aktif dari paket katalog yang sama**, dialog menampilkan peringatan (siapa yang memasukkan, kapan, sisanya). Penyimpanan tetap boleh setelah staf mencentang "Ini paket yang berbeda", karena pasien bisa saja membeli paket yang sama dua kali di Kluto. | Claude, disetujui pemilik |
| PL11 | Salah ketik | **Admin Keuangan atau Super Admin**, dengan alasan: **Batalkan paket lama** selama belum ada sesinya yang dipakai di SunDY (salah pasien atau salah paket; staf lalu mengetik ulang). **Koreksi sisa** per isi kapan saja (salah angka, termasuk sesudah sesinya dipakai di SunDY). | Claude; pemilik menyetujui "batalkan lalu ketik ulang", koreksi sisa ditambahkan Claude sesudah tinjauan |
| PL12 | Pemeriksaan | Tab *Paket customer* punya saringan **"Paket lama (Kluto)"** agar Admin Keuangan bisa mencocokkan dengan Kluto. | Claude, disetujui pemilik |
| PL13 | Kunjungan berikutnya | Dialog punya isian **"Kunjungan berikutnya"**. Isinya otomatis hari ini + jarak kunjungan katalog, bisa diubah (tidak boleh sebelum hari ini), atau dikosongkan. Kosong = tidak diingatkan sampai tanggalnya diisi lewat "Ubah tanggal rencana" atau sampai sesi pertama dipakai di SunDY. Setelah dipakai, tanggal bergeser seperti paket biasa (spec jadwal paket JP4). | pemilik |
| PL14 | Tempat | Tombol **"+ Paket lama (Kluto)"** di tab *Paket customer* menu Paket. | Claude, disetujui pemilik |
| PL15 | Aturan kerja | Setelah paket seorang pasien dimasukkan ke SunDY, sisa sesinya **hanya dipakai di SunDY**, tidak lagi di Kluto. Ini aturan kerja klinik, bukan fitur; dicatat di buku panduan staf. | pemilik |

## 3. Data

Semua perubahan basis data menambah atau melonggarkan; tidak ada data yang diubah.

**`PatientPackage`**
- Kolom baru `source`: enum baru `PatientPackageSource` { `TAGIHAN`, `KLUTO` }, bawaan `TAGIHAN`. Semua paket yang sudah ada menjadi `TAGIHAN`.
- `purchaseLineId` boleh kosong. CHECK `patient_package_source`: `TAGIHAN` ⇔ `purchaseLineId` terisi; `KLUTO` ⇔ `purchaseLineId` kosong.
- Kolom baru `note` (teks ≤ 200, opsional), hanya untuk `KLUTO`.
- `price` = 0 untuk `KLUTO`.
- `startsOn` = tanggal beli di Kluto. Tidak boleh di masa depan; batas bawah yang wajar ditentukan pembangun (mis. tahun 2000).
- **Tanpa batas waktu:** cara menyimpannya diserahkan ke pembangun. Pilihannya `expiresOn` boleh kosong (CHECK: `TAGIHAN` ⇒ terisi) atau tanggal penanda jauh di depan. Yang wajib: paket `KLUTO` tidak pernah berstatus Kedaluwarsa, tidak pernah ditolak karena kedaluwarsa di tagihan, dan **tidak ada tanggal kedaluwarsa yang tampil di layar mana pun** (tampil "Tanpa batas waktu"). Pembangun harus memeriksa semua tempat yang membaca `expiresOn` (lihat bagian 9).
- `visitIntervalDays` disalin dari katalog seperti biasa. `nextVisitOn` dari isian PL13.
- Kolom baru `priorVisits` (Int, bawaan 0): jumlah kunjungan di Kluto (PL5). Selalu 0 untuk `TAGIHAN`. Ditambahkan ke jumlah kunjungan SunDY saat menomori kunjungan, sehingga pesan WA pengingat ("kunjungan ke-n") dan tabel rencana meneruskan hitungan Kluto, bukan mulai dari 1.

**`PatientPackageItem`** tidak berubah. `sessions` = jumlah dari katalog (jatah awal), sehingga tampilan "sisa n dari m" tetap benar.

**`PackageSessionEntry`**
- Saat paket lama disimpan, per isi:
  - satu entri `BELI` sebesar `+sessions` tanpa `invoiceLineId`;
  - bila sudah dipakai > 0, satu entri jenis baru **`PAKAI_KLUTO`** sebesar `−sudah dipakai`, tanpa `invoiceLineId`. Label: "Terpakai di Kluto".
- Jenis baru kedua **`KOREKSI_KLUTO`** untuk Koreksi sisa (PL11): `delta` = sisa baru − sisa sekarang (≠ 0), `reason` wajib, tanpa `invoiceLineId`. Label: "Koreksi".
- CHECK tanda `delta` diperluas: `PAKAI_KLUTO` < 0, `KOREKSI_KLUTO` ≠ 0.
- Kedua jenis baru ini sengaja **bukan** `PAKAI`, sehingga tidak dihitung sebagai kunjungan SunDY (`visitsDoneByPackage`), tidak masuk laporan "Sesi paket terpakai" (`packageSessionsUsed`), dan tidak bisa dikembalikan lewat pembatalan tagihan.
- Pembatalan paket lama memakai `BATAL_PAKET` (−sisa) dengan `reason` terisi.
- Kedua entri menyimpan staf yang mengetik (`staffId`, `staffName`). Inilah jejak utama PL3.

## 4. Dialog "Paket lama (Kluto)"

Dibuka dari tombol **"+ Paket lama (Kluto)"** di tab *Paket customer* (PL14). Hanya terlihat oleh pemegang `invoice:manage` (Resepsionis, Super Admin).

1. **Pasien.**
   - Kotak cari: NIK, nama, no. RM, atau nomor WA. Pasien rangkap yang sudah digabung tidak muncul.
   - **"Pasien belum ada di SunDY"** membuka isian pasien baru: Nama dan WA wajib. NIK, tanggal lahir, jenis kelamin, alamat, kontak darurat, dan email opsional, dengan aturan bentuk yang sama seperti dialog *Pasien baru*. Kontak darurat tetap berpasangan: isi keduanya atau kosongkan keduanya.
   - NIK yang diisi dicek seperti sekarang (`checkPatientNik`). Bila NIK sudah dimiliki pasien lain, dialog menawarkan memakai pasien itu, bukan membuat pasien baru.
   - Pasien baru dibuat **bersamaan** dengan paket saat Simpan, dalam satu transaksi. Dialog yang ditutup tanpa Simpan tidak meninggalkan pasien kosong. Pembuatan pasien butuh `booking:manage` (Resepsionis dan Super Admin memilikinya).
2. **Paket.** Pilih dari katalog: paket aktif dulu, lalu yang nonaktif dengan tanda "tidak dijual lagi". Isi paket tampil di bawahnya.
3. **Tanggal beli di Kluto.**
4. **Pemakaian di Kluto.**
   - Isian **"Jumlah kunjungan di Kluto"** (wajib, ≥ 0), dihitung staf dari catatan kunjungan di layar Kluto.
   - Di bawahnya satu baris per isi paket: nama, jatah ("dari 10 sesi" / "dari 28 kapsul"), dan angka **"Sudah dipakai"** (treatment) atau **"Sudah diambil"** (barang), batas 0..jatah.
   - Saat jumlah kunjungan diketik, angka per isi terisi otomatis dengan aturan rencana kunjungan yang sudah ada (`planVisits`): treatment 1 sesi per kunjungan, barang sebanyak jumlah per kunjungan katalog, tidak melebihi jatah. Staf boleh mengubah angka per isi bila catatan Kluto berbeda; angka yang sudah diubah tangan tidak ditimpa lagi saat jumlah kunjungan diubah.
   - Di samping tiap isi tampil **"Sisa n"**, diperbarui saat diketik.
5. **Kunjungan berikutnya** (PL13).
6. **Catatan** (opsional, ≤ 200 karakter), misalnya nomor nota Kluto.

**Validasi:**
- pasien terpilih atau isian pasien baru sah;
- paket terpilih;
- tanggal beli sah dan tidak di masa depan;
- 0 ≤ sudah dipakai ≤ jatah untuk setiap isi;
- **minimal satu isi masih bersisa.** Kalau semuanya sudah habis: "Semua sesi paket ini sudah terpakai di Kluto, jadi tidak perlu dimasukkan.";
- kunjungan berikutnya kosong atau ≥ hari ini;
- peringatan paket ganda (PL10) sudah dicentang bila muncul.

**Setelah Simpan:** dialog menampilkan ringkasan ("Paket Lux untuk Ani (RM 2026-0012): sisa 4× Facial, 14 kapsul") dengan tautan ke detail paket dan tombol **"Tambah paket lama lain"**, yang mengosongkan dialog. Tombol ini memudahkan mencicil 100 paket. Rincian tata letaknya diserahkan ke pembangun.

## 5. Tampilan

- **Tab Paket customer:**
  - baris paket lama memakai label **"Paket lama (Kluto)"**;
  - kolom masa berlaku menampilkan "Tanpa batas waktu";
  - kolom tagihan pembelian menampilkan "Kluto" tanpa tautan;
  - saringan **Semua / Paket lama (Kluto)** (PL12) bisa digabung dengan pencarian yang ada.
- **Detail paket** (`/admin/paket/{id}`):
  - label "Paket lama (Kluto)", "Dibeli di Kluto {tanggal}", "Dibayar di Kluto" (sebagai pengganti harga dan tautan tagihan), "Tanpa batas waktu", dan catatan;
  - tombol Perpanjang tidak tampil;
  - tombol **"Koreksi sisa"** dan **"Batalkan paket lama"** tampil untuk `invoice:correct` (PL11, bagian 6);
  - buku sesi menampilkan "Beli (Kluto)", "Terpakai di Kluto", dan "Koreksi" beserta nama staf dan alasannya.
- **Detail pasien:** daftar paket memakai label yang sama.
- **Editor tagihan:** paket lama muncul di pilihan "Pakai sesi paket" dan "Pakai sesuai rencana" seperti paket lain, dengan label "Paket lama (Kluto)". Urutan pilihan yang sekarang berdasarkan kedaluwarsa terdekat menaruh paket lama di akhir.
- **Invoice A4 dan struk:** progres paket tampil seperti biasa, dengan "Tanpa batas waktu" sebagai pengganti "berlaku s.d.".
- **Pengingat:** kotak *Sesi paket perlu dibooking* dan pengingat treatment memperlakukan paket lama seperti paket lain berdasarkan `nextVisitOn`, tanpa batas masa berlaku.

## 6. Pembatalan dan tanggal rencana

Kedua tindakan di bawah hanya untuk paket `KLUTO`, butuh `invoice:correct` (Admin Keuangan, Super Admin), dan wajib beralasan (≤ 200). Paket `TAGIHAN` tetap dibatalkan lewat pembatalan tagihan pembeliannya.

- **Batalkan paket lama**, untuk salah pasien atau salah paket.
  - Ditolak bila ada entri `PAKAI` paket itu di tagihan yang masih final: "Sesi paket ini sudah dipakai di tagihan {nomor}. Pakai Koreksi sisa." Aturannya sama dengan pembatalan paket yang dibeli (spec paket P12), sehingga sesi yang dikembalikan oleh pembatalan tagihan tidak pernah jatuh ke paket yang sudah dibatalkan.
  - Status menjadi `DIBATALKAN`, `nextVisitOn` kosong, dan sisa per isi dikurangi lewat `BATAL_PAKET` dengan alasan.
  - Draf tagihan yang masih menandai paket itu ditolak saat final, dengan pesan yang sudah ada ("Paket … sudah dibatalkan. Lepas paket …").
- **Koreksi sisa**, untuk salah angka, kapan saja selama paket aktif.
  - Dialog menampilkan per isi sisa sekarang dan isian "Sisa yang benar" (0..jatah − terpakai di SunDY).
  - Setiap isi yang berubah mendapat satu entri `KOREKSI_KLUTO`. Paket tidak berganti, jadi riwayat pemakaian SunDY dan nomor kunjungan tetap utuh.
  - Bila semua sisa menjadi 0, `nextVisitOn` dikosongkan. Bila sisa naik dari 0 dan rencana kosong, staf mengisinya lewat Ubah tanggal rencana.
  - Sisa dikunci seperti finalisasi tagihan (`lockPatientPackages`), sehingga tidak bertabrakan dengan tagihan yang sedang memakai paket itu.
- **Ubah tanggal rencana** (`changeNextVisit`, Resepsionis dan Admin Keuangan) harus bisa mengisi tanggal untuk paket aktif yang masih bersisa walau `nextVisitOn`-nya kosong (PL13). Sekarang aksi ini menolak paket tanpa rencana. Untuk paket lama tidak ada batas atas tanggal.

## 7. Hak akses

| Tindakan | Hak | Peran |
|---|---|---|
| Melihat paket lama | `invoice:read` (seperti sekarang) | Resepsionis, Admin Keuangan, Super Admin |
| Memasukkan paket lama | `invoice:manage` | Resepsionis, Super Admin |
| Membuat pasien dari dialog | `booking:manage` (tambahan) | Resepsionis, Super Admin |
| Membatalkan paket lama, Koreksi sisa | `invoice:correct` | Admin Keuangan, Super Admin |
| Mengubah tanggal rencana | seperti sekarang | Resepsionis, Admin Keuangan, Super Admin |

**Audit:**
- `patient-package.legacy-create`: no. RM, nama paket, tanggal beli, dan sisa per isi;
- `patient-package.legacy-cancel`: alasan;
- `patient-package.legacy-correct`: per isi sisa lama → sisa baru, dan alasan;
- pembuatan pasien memakai audit yang sudah ada.

## 8. Laporan dan uang

- Tidak ada `Invoice`/`InvoiceLine` untuk paket lama, sehingga laporan pendapatan, uang masuk, deposit, dan margin penjualan paket tidak berubah.
- Pemakaian sesi paket lama di SunDY menghasilkan baris TREATMENT Rp 0 seperti paket biasa. Baris ini masuk laporan *Sesi paket terpakai*, *Komisi*, dan biaya treatment di *Margin*, sama seperti sesi paket yang dijual di SunDY.

## 9. Teknis

- **Tempat yang membaca `purchaseLine` atau `expiresOn`** harus diperiksa untuk paket `KLUTO`. Minimal:
  - `src/server/patient-package-read.ts` (ringkasan, `purchaseInvoice`, `listPackageOptions`, `listPackageVisitPlans`);
  - `src/server/package-store.ts` (`consumePackageSessions` cek kedaluwarsa, `recomputeNextVisit` dasar `startsOn`);
  - `src/server/invoice-drafts.ts` (pemilihan sumber paket, `applyPackageVisit`);
  - `src/server/invoice-a4-store.ts`;
  - `src/server/reminder.ts`;
  - `src/server/treatment-visits.ts`;
  - `src/server/patient-packages.ts`;
  - `src/lib/treatment-package.ts` (`packageState`);
  - `src/lib/package-visit.ts` (`validatePlanDate`);
  - komponen di `src/components/admin/package/` dan `src/components/receipt/invoice-a4-paper.tsx`.
- **Konkurensi:** penyimpanan paket lama tidak menyentuh paket lain. Pengecekan paket ganda (PL10) cukup dilakukan saat dialog dibuka dan diulang saat simpan. Dua orang yang menyimpan bersamaan untuk pasien yang sama boleh lolos keduanya; saringan PL12 dan pembatalan PL11 menangani sisanya.
- **Penomoran kunjungan** = `priorVisits` + kunjungan SunDY (`visitsDoneByPackage`). Pembangun memastikan semua pemanggil `planVisits` dan pesan WA pengingat memakai jumlah ini, termasuk `listPackageVisitPlans`, `getPatientPackage`, dan `reminder.ts`.
- **Rencana sesudah pembatalan tagihan:** `recomputeNextVisit` sekarang kembali ke `startsOn` + jarak bila tidak ada pemakaian SunDY tersisa. Untuk paket `KLUTO`, `startsOn` bisa bertahun-tahun lalu dan langsung menjadi *terlewat*. Jadi untuk paket `KLUTO` hasilnya **kosong** (tidak diingatkan sampai diisi lewat Ubah tanggal rencana).
- **Pasien rangkap digabung** (check-in): paket lama ikut pindah seperti paket lain, tanpa perubahan.
- **Migrasi:** nilai enum baru (`PAKAI_KLUTO`, enum `PatientPackageSource`) ditambahkan dengan migrasi terpisah sebelum dipakai, seperti `paket_enum`. CHECK ditulis di SQL mentah. `purchaseLineId DROP NOT NULL`.
- **Tampilan:** panel admin memakai MUI.

## 10. Pengujian

- **Unit:**
  - validasi isian (sudah dipakai di luar batas, semua habis, tanggal beli masa depan, rencana sebelum hari ini, catatan terlalu panjang);
  - `packageState` untuk paket tanpa batas waktu;
  - hitung sisa dari BELI + PAKAI_KLUTO + KOREKSI_KLUTO;
  - isi otomatis dari jumlah kunjungan (treatment, barang dengan jumlah per kunjungan, batas jatah, angka ubahan tangan tidak ditimpa);
  - penomoran kunjungan dengan `priorVisits`.
- **Integrasi:**
  - Resepsionis memasukkan paket lama untuk pasien yang sudah ada, dan untuk pasien baru (hanya nama + WA);
  - NIK bentrok mengarah ke pasien yang ada;
  - Admin Keuangan ditolak saat memasukkan, Resepsionis ditolak saat membatalkan;
  - sesi paket lama dipakai di tagihan tanggal jauh di depan (tanpa kedaluwarsa);
  - pembatalan paket lama ditolak setelah sesinya dipakai di tagihan final, dan diterima setelah tagihan itu dibatalkan;
  - Koreksi sisa naik dan turun, termasuk sesudah dipakai di SunDY, dan ditolak di luar batas;
  - pembatalan satu-satunya tagihan pemakaian paket lama membuat rencananya kosong;
  - laporan pendapatan/uang masuk tidak berubah, sedangkan *Sesi paket terpakai* bertambah hanya saat dipakai di SunDY;
  - `visitsDoneByPackage` mengabaikan PAKAI_KLUTO;
  - kotak Pengingat memuat paket lama bertanggal dan melewatkan yang kosong;
  - `changeNextVisit` bisa mengisi rencana yang kosong;
  - invoice A4 menampilkan "Tanpa batas waktu".
- **E2E:** Resepsionis membuat pasien + paket lama lewat dialog, lalu memakai satu sesinya di tagihan kunjungan dan memfinalkannya; Admin Keuangan menyaring "Paket lama", mengoreksi sisa satu paket, dan membatalkan satu paket lain yang belum dipakai.

## 11. Rilis dan risiko

- **Rilis hanya maju.** Setelah ada paket lama di produksi, jangan `deploy.sh kembali` ke rilis sebelum fitur ini, karena rilis lama tidak mengenal `purchaseLineId` kosong. Tambahkan catatan ini di runbook bagian 4.
- **Backup** sebelum deploy, karena ada migrasi. Build memakai `NODE_OPTIONS=--max-old-space-size=2048`.
- **Buku panduan staf** naik versi. Isinya cara memasukkan paket lama, aturan kerja PL15, dan cara Admin Keuangan mencocokkan serta membatalkan.
- **Risiko: angka salah ketik.** Ditangani saringan PL12, serta pembatalan dan Koreksi sisa PL11. Tanpa PIN sesuai pilihan pemilik.
- **Risiko: sesi dipakai di Kluto setelah dimasukkan ke SunDY.** Tidak bisa dicegah sistem; ditangani aturan kerja PL15.
- **Risiko: paket di Kluto ternyata berbeda dari katalog SunDY.** Di luar lingkup (pemilik menyatakan sama). Bila terjadi, isi yang tidak dimiliki pasien diisi "sudah dipakai" = jatah (sisa 0), atau Admin Keuangan membuat paket katalog yang sesuai lalu menonaktifkannya.
