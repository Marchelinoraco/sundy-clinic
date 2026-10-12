# Desain — Data Lengkap dan Cek NIK saat Resepsionis Mendaftarkan Pasien

- **Versi:** 1.0
- **Tanggal:** 12 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Menyentuh:** tabel `Patient` (empat kolom baru dan satu enum), `createPatient` dan satu aksi baru `checkPatientNik`, formulir "Pasien Baru" (`NewPatientForm`, dipakai di halaman Pasien dan di pemilih pasien pada Booking baru, Konsultasi online, dan Penjualan langsung), dan tampilan data diri di halaman detail pasien. Pendaftaran online `/daftar`, check-in, dan situs publik tidak berubah.

## 1. Latar belakang & tujuan

Pasien kini terbentuk lewat tiga jalan: pendaftaran online (data masuk sebagai isian `Intake`, tanpa NIK), tombol "Pasien Baru" di panel (`createPatient` hanya meminta nama dan WhatsApp), dan check-in di klinik (NIK baru ditanyakan di sini, lengkap dengan pengecekan "NIK milik pasien lain" dan pemindahan pasien rangkap). Akibatnya pasien yang dibuat resepsionis tidak punya NIK, email, kontak darurat, maupun status pernikahan, dan pasien ganda baru ketahuan saat check-in.

Tujuan: saat resepsionis mendaftarkan pasien baru di panel, data lengkap dikumpulkan di satu formulir dan **NIK dicek saat diisi**, sehingga pasien yang sudah terdaftar ditawarkan untuk dipakai, bukan dibuat ganda.

Bukan tujuan: mengubah pendaftaran online (NIK tetap tidak dikumpulkan di situs publik, keputusan privasi spec rekam medis bagian 2), mengubah data pasien yang sudah ada (menambah email untuk pasien lama), pencocokan pasien lewat nama, dan mengubah check-in.

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| D1 | Di mana | Hanya resepsionis di panel (formulir "Pasien Baru"). |
| D2 | Arti "Status (opsional)" | **Status pernikahan**: Belum menikah, Menikah, Cerai hidup, Cerai mati. Boleh kosong. |
| D3 | Aturan NIK | Wajib, dengan alasan bila belum ada (Warga negara asing, Anak-anak, Lupa membawa KTP), sama dengan check-in. |
| D4 | Email | Opsional; bila diisi, bentuknya diperiksa. |
| D5 | Kontak darurat | **Nama dan nomor**, keduanya wajib bersamaan. |
| D6 | "No. HP" | Memakai kolom nomor WhatsApp yang sudah ada, berlabel "No. HP (WhatsApp)": klinik berkomunikasi lewat WhatsApp, jadi satu nomor. |
| D7 | Pendekatan | Perluas formulir dan aksi yang ada (bukan wizard baru); pakai ulang `NikInput`, `normalizeNik`, `nikMismatchWarning`, dan pengaman NIK di basis data yang sudah teruji di check-in. |

## 3. Data

Migrasi hanya menambah; pasien lama tetap kosong di kolom baru, dan kolom boleh kosong di basis data karena pasien lama serta pasien dari pendaftaran online tidak punya data ini.

| Kolom `Patient` | Isi |
|---|---|
| `email` | `TEXT` boleh kosong; disimpan huruf kecil; CHECK berbentuk email. |
| `emergencyContactName` | `TEXT` boleh kosong. |
| `emergencyContactPhone` | `TEXT` boleh kosong; nomor dinormalkan seperti nomor WhatsApp. |
| `maritalStatus` | enum baru `MaritalStatus` (`BELUM_MENIKAH`, `MENIKAH`, `CERAI_HIDUP`, `CERAI_MATI`), boleh kosong. |

Pengaman basis data: `patient_emergency_pair` (nama dan nomor kontak darurat terisi bersamaan atau kosong bersamaan) dan `patient_email_format`. Yang sudah ada dan dipakai ulang: `nik` (unik, 16 angka), `nikMissingReason`, `name`, `birthDate`, `address`, `whatsapp`.

## 4. Aturan

Divalidasi di server **sebelum** nomor rekam medis dialokasikan (nomor yang sudah diambil tidak pernah dikembalikan), dan diulang di formulir untuk umpan balik cepat.

- **NIK:** tepat satu dari dua: NIK 16 angka (titik, spasi, dan tanda hubung dibuang), atau alasan belum ada. Keduanya kosong atau keduanya terisi ditolak. NIK yang sudah dipakai pasien lain ditolak.
- **Nama:** wajib, dirapikan, paling banyak 100 karakter.
- **Tanggal lahir:** wajib, bentuk `YYYY-MM-DD`, tidak di masa depan, tidak sebelum 1900-01-01.
- **No. HP (WhatsApp):** wajib, sah menurut `normalizeWhatsapp`.
- **Email:** opsional; huruf kecil, dipangkas, bentuk email, paling banyak 254 karakter.
- **Kontak darurat:** nama (wajib, paling banyak 100 karakter) dan nomor (wajib, sah menurut `normalizeWhatsapp`), bersamaan.
- **Alamat:** wajib, dirapikan, paling banyak 300 karakter.
- **Status pernikahan:** opsional; nilai di luar daftar ditolak.
- **Kecocokan tanggal lahir dengan NIK** hanya peringatan di layar (`nikMismatchWarning`); tidak menghalangi, karena kode lahir di NIK tidak selalu akurat.

## 5. Cek NIK

### 5.1 Aksi `checkPatientNik(nik)`

Hak `booking:manage`. Mengembalikan:
- galat "NIK harus 16 angka." bila bentuknya salah;
- `{ status: "FREE" }` bila belum dipakai;
- `{ status: "TAKEN", owner }` dengan kartu pasien pemilik NIK: nama, nomor RM, tanggal lahir (label), WhatsApp, dan `id` (untuk "Pakai pasien ini").

Pencarian memakai cara yang sama dengan check-in (`findOwner`): pasien mana pun yang memegang NIK itu. Pasien rangkap yang sudah dipindahkan tidak pernah memegang NIK, karena pemindahan hanya dilakukan untuk pasien tanpa NIK sendiri.

### 5.2 Saat menyimpan

`createPatient` memeriksa NIK lagi di server. Bila dipakai pasien lain: "NIK ini sudah terdaftar atas nama <nama> (<nomor RM>)." Bila dua pendaftaran dengan NIK yang sama berjalan bersamaan, indeks unik `Patient_nik_key` menolak yang kedua dan pelanggarannya diterjemahkan ke pesan yang sama (bukan galat umum); nomor RM yang sempat dialokasikan oleh transaksi yang batal ikut batal.

## 6. Layar

### 6.1 Dialog "Pasien baru"

Tombol "+ Pasien Baru" (tidak berubah) membuka dialog (menggulir di ponsel). Urutan isian:

1. **NIK:** komponen `NikInput` yang sudah ada (Isi NIK atau Belum ada NIK dengan alasan).
2. **Panel hasil cek NIK** di bawahnya:
   - *Memeriksa…* selama pencarian;
   - *NIK belum terdaftar* (hijau);
   - *NIK sudah terdaftar*: kartu pasien (nama, nomor RM, tanggal lahir, WhatsApp) dan tombol **"Pakai pasien ini"**; selama NIK itu dipakai, tombol **Simpan dinonaktifkan**;
   - peringatan kuning bila tanggal lahir tidak cocok dengan kode di NIK (tidak menghalangi).
3. **Nama**, 4. **Tanggal lahir** (pemilih tanggal yang sama dengan isian tanggal admin lain), 5. **No. HP (WhatsApp)**; peringatan nomor yang sama dengan pasien lain (`findPatientsByWhatsapp`) **tetap seperti sekarang** (peringatan, bukan penghalang), 6. **Email** (opsional), 7. **Nama kontak darurat** dan 8. **Nomor kontak darurat**, 9. **Alamat** (beberapa baris), 10. **Status pernikahan** (pilihan, bawaan "— Tidak diisi —").

Galat server tampil di dalam dialog (bukan hanya toast) dan menyebut isian yang bermasalah. Menyimpan berhasil memanggil `onCreated` seperti sekarang, sehingga pemilih pasien di Booking baru, Konsultasi online, dan Penjualan langsung langsung memakai pasien baru.

### 6.2 Halaman detail pasien

Kartu "Data diri" menambah **Email**, **Kontak darurat** (nama · nomor), dan **Status pernikahan**. NIK tetap tersamarkan seperti sekarang.

## 7. Teknis

- **`src/lib/patient-registration.ts`** (murni): `validatePatientRegistration(input)` yang mengembalikan nilai bersih atau pesan galat pertama, `MARITAL_STATUS_LABEL`, dan pembantu email dan kontak darurat.
- **`src/server/patient.ts`:** `checkPatientNik`, `createPatient` yang diperluas (menggantikan versi lama; satu-satunya pemanggilnya `NewPatientForm`), dan penerjemah pelanggaran unik NIK. `insertPatient` (`src/server/patient-store.ts`) menerima kolom baru.
- **`src/components/admin/new-patient-form.tsx`:** menjadi dialog dengan isian di atas dan memakai `NikInput`.
- **`src/components/admin/patient-detail-view.tsx`** dan `PatientDetail`: tiga bidang baru.
- **Audit:** `patient.create` memuat nama dan nomor RM, **tidak** NIK, email, atau kontak darurat.

## 8. Keamanan dan privasi

- NIK, email, dan kontak darurat tidak pernah tampil di situs publik, pesan WA, atau tautan; di panel hanya untuk peran dengan akses pasien (`booking:manage`), NIK tersamarkan seperti sekarang.
- Cek NIK hanya untuk staf berhak; tidak ada endpoint publik. Hasil "sudah terdaftar" menampilkan data pasien lain hanya kepada resepsionis yang memang berhak melihat daftar pasien.
- Audit tidak memuat data pribadi di luar nama dan nomor RM.

## 9. Pengujian

- **Unit:** semua aturan validasi dan label (batas panjang, email, pasangan kontak darurat, rentang tanggal lahir, status tidak dikenal); komponen dialog (empat keadaan panel NIK, Simpan nonaktif saat NIK terpakai, "Pakai pasien ini", galat per isian, status pernikahan opsional, kolom darurat wajib berpasangan).
- **Integrasi:** pasien tersimpan lengkap dengan NIK dinormalkan; NIK dobel ditolak dengan pesan yang menyebut pemiliknya; **dua pendaftaran dengan NIK sama bersamaan: tepat satu yang lolos** dan yang kalah mendapat pesan jelas; jalur "belum ada NIK" dengan alasan; isian wajib yang kurang tidak memakan nomor rekam medis; pengaman basis data (kontak darurat tidak berpasangan, email salah bentuk ditolak langsung di SQL); audit tidak memuat NIK, email, atau kontak darurat; hak (peran tanpa `booking:manage` ditolak di kedua aksi).
- **E2E:** resepsionis mendaftarkan pasien lengkap dan datanya muncul di detail; NIK yang sama kedua kalinya menampilkan pasien tadi dan Simpan nonaktif; "Pakai pasien ini" dari pemilih pasien di Booking baru. Desktop dan ponsel.

## 10. Rilis dan risiko

- Migrasi hanya menambah kolom dan satu tipe, jadi `deploy.sh kembali` aman: rilis lama mengabaikan kolom baru, dan formulirnya yang lama tetap membuat pasien dengan nama dan WhatsApp saja.
- Pasien yang sudah ada tidak berubah dan tidak diminta melengkapi datanya; mengubah data pasien lama adalah pekerjaan terpisah.
- Pendaftaran online tetap membuat isian tanpa NIK; pasien dari jalan itu mendapat NIK saat check-in seperti sekarang. Bila kelak pendaftaran online perlu mengumpulkan NIK, itu mengubah keputusan privasi dan dirancang tersendiri.
- Resepsionis yang menghadapi pasien tanpa data lengkap (mis. anak tanpa kontak darurat sendiri) tetap bisa mendaftar: kontak darurat boleh orang tua atau wali. Tidak ada pengecualian "tanpa kontak darurat" karena disepakati wajib.
