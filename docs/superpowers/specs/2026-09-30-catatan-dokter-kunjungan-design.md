# Desain — Rekam Medis Bagian 1: Catatan Dokter per Kunjungan

- **Versi:** 1.0
- **Tanggal:** 30 September 2026
- **Status:** Disetujui pemilik (30 September 2026)
- **Bagian dari:** PRD F12 (Rekam Medis Elektronik) dan F15 (audit), untuk kunjungan dan catatan SOAP. BIA, grafik, order obat, dan pengingat kontrol dirancang di spec terpisah (bagian 2).
- **Melengkapi:** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md` (isian, Setujui ke data pasien, hak akses) dan `docs/superpowers/specs/2026-09-30-kuis-v2-form-recall-design.md` (tampilan isian untuk dokter).

## 1. Latar belakang & tujuan

Pasien sudah bisa mendaftar, dicocokkan, dan ditandai hadir. Alergi serta riwayat penyakit & obat sudah masuk ke data pasien lewat **Setujui ke data pasien**. Yang belum ada adalah catatan dokter di setiap kunjungan. Saat ini dr. Diane belum punya format tetap untuk catatan pemeriksaan.

Spec ini menambahkan **kunjungan**: satu catatan SOAP per booking yang sudah hadir. Catatan ditulis sebagai draf, lalu difinalisasi dan dikunci. Koreksi sesudahnya hanya lewat adendum, sesuai Permenkes No. 24 Tahun 2022 dan PRD F12.

**Berhasil bila:**
- dokter bisa membuka pasien yang hadir hari ini dari dasbor, lalu mengisi S, O, A, P, dan treatment dalam satu halaman;
- catatan final tidak bisa diubah atau dihapus oleh siapa pun, termasuk lewat SQL langsung;
- resepsionis tidak pernah menerima isi catatan klinis di browser;
- setiap pembuatan, finalisasi, adendum, dan pembukaan catatan tercatat di audit.

## 2. Pembagian rekam medis

Rekam medis dibagi menjadi lima sub-proyek. Masing-masing punya spec, plan, dan rilisnya sendiri:

1. **Catatan dokter per kunjungan** *(spec ini)*.
2. **Check-in klinik:** NIK ditanyakan front office, pasien dicocokkan dengan seluruh data diri, ada kuis di tablet/QR klinik, dan food recall H-1 digital sebagai tabel per jam yang masuk ke bagian S.
3. **BIA & grafik progres:** angka BIA, unggah berkas hasil, dan grafik berat/lemak/otot. Penyimpanan berkas di VPS juga dipakai untuk scan rekam medis kertas lama.
4. **Order dokter ke apotek:** pilih dari daftar, isi jumlah dan catatan, lalu antrean "sudah diserahkan". Kasir dan pembayaran menyusul di Plan 5.
5. **Pengingat kontrol mingguan** (PRD F17), dibuat dari rencana (P) di catatan dokter.

Bagian 1 dikerjakan lebih dulu karena bagian 3–5 semuanya menempel pada kunjungan. Tombol **Tandai hadir** sudah ada, jadi kunjungan tidak perlu menunggu check-in.

## 3. Keputusan (dikonfirmasi pemilik, 30 Sep 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| R1 | Urutan | Catatan dokter dulu, lalu check-in, BIA, order, dan pengingat |
| R2 | Format catatan | SOAP standar PRD. Belum ada format kertas tetap yang harus ditiru |
| R3 | Bagian O | Kolom angka: tekanan darah (sistolik/diastolik), nadi, suhu, berat, tinggi, lingkar pinggang/perut. IMT (BMI) dihitung. Ditambah teks pemeriksaan fisik |
| R4 | Kunjungan treatment | Dicatat oleh dokter atau Super Admin di halaman yang sama. Pelaksana dipilih dari daftar staf. Terapis tetap tanpa akses panel |
| R5 | Finalisasi | Dokter menekan **Finalisasi**. Sebelumnya draf tersimpan otomatis dan bisa diubah |
| R6 | Peringatan | Alergi, riwayat penyakit & obat, **catatan penting** (kolom baru), **hamil/menyusui** dari isian kunjungan ini, dan **no. RM kertas lama** (kolom baru) |
| R7 | Penyimpanan | Kolom terstruktur, satu kunjungan per booking, treatment per baris, adendum terpisah. Kunci final dijaga trigger PostgreSQL |
| R8 | Awal kunjungan | Dibuat saat tombol **Periksa** pertama kali ditekan pada booking berstatus Hadir |
| R9 | Draf | Boleh dibuang, misalnya bila salah membuka pasien. Pembuangan tercatat di audit |
| R10 | Efek finalisasi | Booking menjadi **Selesai** dan kunjungan terakhir pasien diperbarui, dalam satu transaksi |
| R11 | No. RM kertas lama | Bisa dilihat dan diubah resepsionis juga, karena front office yang mengambil berkas dari lemari |
| R12 | Audit baca | Membuka kunjungan atau riwayat kunjungan pasien dicatat, paling banyak satu baris per staf per catatan per 30 menit. Pengeditan draf juga dicatat dengan batas yang sama |
| R13 | Syarat finalisasi | Kolom **A (penilaian)** wajib terisi |

## 4. Alur kerja

1. **Resepsionis** menandai booking **Hadir** seperti sekarang. Tidak ada yang berubah di sisi resepsionis.
2. **Dasbor** untuk staf dengan `record:read` (dokter, Super Admin) menampilkan:
   - **Pasien hari ini:** booking hari ini (WITA) berstatus Hadir atau Selesai, dari semua cabang, dengan label cabang, jam, nama, layanan, dan status kunjungan ("Belum diperiksa" / "Draf" / "Final"). Tombol **Periksa** pada yang belum diperiksa, **Lanjutkan** pada draf, dan **Lihat** pada yang final.
   - **Catatan belum final:** semua kunjungan Draf dari hari sebelumnya, plus booking Hadir dari hari sebelumnya yang belum punya kunjungan ("Belum diperiksa"). Diurutkan dari yang terlama.

   Dasbor resepsionis tetap seperti sekarang. Kalimat "Booking dan rekam medis dibangun pada tahap berikutnya" diganti kalimat yang sesuai keadaan.
3. **Periksa** membuat kunjungan, lalu membuka `/admin/kunjungan/[id]`. Menekan Periksa lagi, atau dari tab lain, membuka kunjungan yang sama (satu kunjungan per booking).
4. Dokter mengisi halaman kunjungan (bagian 5). **Draf tersimpan otomatis** sekitar 1,5 detik setelah dokter berhenti mengetik, dengan tanda "Tersimpan 10.42".
5. **Finalisasi** meminta konfirmasi ("Catatan yang sudah final tidak bisa diubah, hanya bisa ditambah adendum"). Setelah itu halaman menjadi baca-saja.
6. **Tambah adendum** (hanya pada kunjungan final): kotak teks dan tombol simpan. Adendum tampil berurutan di bawah catatan, dengan nama penulis dan waktunya.
7. **Buang draf** (hanya pada draf) meminta konfirmasi. Kunjungan dan treatment-nya dihapus, dan booking kembali tampil sebagai "Belum diperiksa".
8. **Halaman Data Pasien** (`/admin/pasien/[id]`):
   - bagian baru **Riwayat kunjungan** (hanya `record:read`): tanggal, cabang, penulis, cuplikan penilaian (A) sampai 80 karakter, dan status Draf/Final. Setiap baris membuka kunjungannya.
   - **Catatan penting** tampil dan bisa diubah di kotak catatan medis (hanya `record:read`/`record:write`).
   - **No. RM kertas lama** tampil di identitas pasien dan bisa diubah oleh `booking:manage`.
   - **Riwayat booking** yang sudah ada tetap tampil untuk semua, termasuk resepsionis. Status Selesai di sana menjadi satu-satunya tanda kunjungan bagi resepsionis.

**Penulis kunjungan** adalah staf yang sedang login, bukan staf yang dijadwalkan di booking. Kunjungan treatment oleh terapis dicatat atas nama dokter atau Super Admin (R4).

## 5. Isi halaman kunjungan

Urutan dari atas ke bawah:

**Kepala:** nama pasien, no. RM, umur (dari tanggal lahir), jenis kelamin, tanggal dan jam booking, cabang, layanan, serta status Draf/Final. Tautan ke Data Pasien.

**Peringatan** (kotak yang menonjol; bagian kosong tidak ditampilkan):
- Alergi dan Riwayat penyakit & obat, dari data pasien. Bila keduanya belum pernah diisi: "Alergi dan riwayat penyakit belum dicatat."
- Catatan penting, dari data pasien.
- **Hamil/menyusui**, dari jawaban K4 isian kunjungan ini (v1 dan v2): "Sedang hamil, merencanakan kehamilan, atau menyusui?". Hanya tampil bila jawabannya **Ya**, dengan teks "Hamil, merencanakan kehamilan, atau menyusui (dari isian kunjungan ini)". Isian customer lama tanpa bagian kesehatan tidak memuat K4, jadi peringatan ini tidak tampil.
- **No. RM kertas lama**, dari data pasien, bertuliskan "Ada berkas kertas: RM-…".

**S (Subjective):**
- Bila booking punya isian: ringkasan isian dan tabel kebiasaan (penampil `clinicalView` yang sudah ada), bisa dilipat dan terbuka pada awalnya. Bila isiannya belum disetujui, tampil tautan **Setujui ke data pasien** ke halaman isian.
- Kotak teks **Keluhan dan anamnesis dokter**.

**O (Objective):**

| Kolom | Satuan | Rentang | Bentuk |
|---|---|---|---|
| Tekanan darah sistolik | mmHg | 50–260 | bilangan bulat |
| Tekanan darah diastolik | mmHg | 30–160, dan lebih kecil dari sistolik | bilangan bulat |
| Nadi | /menit | 30–220 | bilangan bulat |
| Suhu | °C | 34,0–42,0 | 1 desimal |
| Berat badan | kg | 20,0–300,0 | 1 desimal |
| Tinggi badan | cm | 100,0–230,0 | 1 desimal |
| Lingkar pinggang/perut | cm | 40,0–200,0 | 1 desimal |

- Semua kolom boleh kosong. Sistolik dan diastolik harus diisi berpasangan.
- **IMT (BMI)** dihitung dan ditampilkan (1 desimal, mis. "IMT 28,3", sama dengan halaman isian) bila berat dan tinggi terisi, tetapi tidak disimpan.
- **Tinggi badan diisikan awal** dari kunjungan final terakhir pasien saat kunjungan dibuat, karena tinggi orang dewasa jarang diukur ulang. Dokter bisa mengubah atau mengosongkannya.
- Kotak teks **Pemeriksaan fisik**.
- Isian menerima koma maupun titik sebagai pemisah desimal.

**A (Assessment):** kotak teks **Penilaian / diagnosis**. Wajib untuk finalisasi (R13).

**P (Plan):** kotak teks **Rencana, program, dan resep**.

**Treatment yang dilakukan:** nol atau lebih baris. Tiap baris berisi:
- **treatment:** pilih dari layanan aktif, dengan layanan booking sebagai usulan pertama; namanya disalin saat dipilih;
- **area** (opsional);
- **dosis** (opsional), mis. "12 unit";
- **pelaksana:** pilih dari staf aktif berperan DOKTER atau TERAPIS, dengan tenaga yang dijadwalkan di booking sebagai usulan pertama; namanya disalin;
- **catatan pasca-tindakan** (opsional).

Tombol **Tambah treatment**, dan tombol hapus per baris selama masih draf.

**Batas panjang:**
- teks S, pemeriksaan fisik, A, P, dan adendum: 5.000 karakter;
- area dan dosis: 100 karakter;
- catatan pasca-tindakan: 1.000 karakter;
- catatan penting: 2.000 karakter;
- no. RM kertas lama: 50 karakter.

**Tombol bawah:**
- saat draf: **Finalisasi** dan **Buang draf**;
- saat final: **Tambah adendum**;
- khusus Super Admin (`audit:read`): bagian yang bisa dilipat, **Jejak catatan ini** (bagian 9).

## 6. Data

**`Encounter`** (Kunjungan):

| Kolom | Isi |
|---|---|
| `id` | cuid |
| `appointmentId` | unik, relasi ke `Appointment` (`onDelete: Restrict`) |
| `status` | enum `EncounterStatus` `DRAF` / `FINAL` |
| `subjective`, `physicalExam`, `assessment`, `plan` | teks, boleh null |
| `systolic`, `diastolic`, `pulse` | Int, boleh null |
| `temperatureC` | Decimal(3,1), boleh null |
| `weightKg`, `heightCm`, `waistCm` | Decimal(4,1), boleh null |
| `createdById`, `createdByName` | staf pembuat (id dan nama disalin) |
| `finalizedById`, `finalizedByName`, `finalizedAt` | diisi saat finalisasi |
| `createdAt`, `updatedAt` | `updatedAt` juga dipakai sebagai versi untuk mendeteksi perubahan dari tab lain |

- **Pasien dan cabang tidak disalin** ke kunjungan, tetapi dibaca dari booking-nya. Dengan begitu keduanya tidak mungkin berbeda dari booking.
- Pasien booking sudah tidak bisa diganti sejak booking diverifikasi (aturan pencocokan yang ada), dan kunjungan hanya dibuat dari booking Hadir.

**`EncounterTreatment`:** `id`, `encounterId` (`onDelete: Cascade`, hanya berlaku untuk draf; lihat trigger), `serviceId` (tanpa relasi: layanan hanya dinonaktifkan, tidak pernah dihapus), `serviceName`, `area`, `dose`, `performerId`, `performerName`, `notes`, `sortOrder`.

**`EncounterAddendum`:** `id`, `encounterId` (`onDelete: Restrict`), `text`, `authorId`, `authorName`, `createdAt`.

**`Patient`** mendapat dua kolom: `importantNotes String?` dan `paperRecordNumber String?`.

**CHECK di basis data:**
- setiap angka vital dalam rentang bagian 5;
- `diastolic < systolic` bila keduanya terisi;
- sistolik dan diastolik sama-sama terisi atau sama-sama kosong;
- `status = 'FINAL'` hanya bila `finalizedAt`, `finalizedById`, dan `assessment` (tidak kosong setelah di-trim) terisi.

**Trigger PostgreSQL** (migrasi ditulis tangan):
1. `Encounter`, BEFORE UPDATE: tolak bila `OLD.status = 'FINAL'`. Ini sekaligus mencegah kembali ke Draf.
2. `Encounter`, BEFORE DELETE: tolak bila `OLD.status = 'FINAL'`.
3. `EncounterTreatment`, BEFORE INSERT/UPDATE/DELETE: tolak bila kunjungan induknya FINAL. Bila induknya sudah tidak ada, penghapusan diizinkan: itu cascade dari draf yang dibuang, karena kunjungan final tidak pernah bisa dihapus (trigger 2).
4. `EncounterAddendum`, BEFORE INSERT: tolak bila kunjungan induknya bukan FINAL. BEFORE UPDATE/DELETE: selalu tolak.
5. Ketiga tabel, BEFORE TRUNCATE: selalu tolak, karena `TRUNCATE` melewati trigger per baris.

Trigger hanya bisa dimatikan oleh pemilik tabel lewat DDL. Aplikasi tidak pernah melakukannya. Uji memakai pembersih khusus basis data uji yang mematikannya sementara di dalam satu transaksi.

Pesan trigger memakai awalan tetap (mis. `rekam_medis_terkunci`), sehingga server bisa menerjemahkannya menjadi pesan untuk pengguna.

## 7. Aturan penyimpanan

Semua aksi adalah server action lewat `runAction`, dengan `UserFacingError` untuk pesan yang terlihat pengguna.

- **`openEncounter(appointmentId)`** (`record:write`):
  - booking harus berstatus HADIR dan punya pasien, bila tidak: "Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir.";
  - bila kunjungan sudah ada, id-nya dikembalikan;
  - bila belum, kunjungan dibuat, dengan tinggi badan diisikan awal dari kunjungan final terakhir pasien. Bentrok unik dari dua klik bersamaan ditangani dengan membaca ulang;
  - audit `encounter.create`.
- **`saveEncounterDraft(id, version, fields)`** (`record:write`):
  - validasi zod dengan rentang bagian 5;
  - pembaruan bersyarat `status = DRAF` dan `updatedAt = version`, termasuk mengganti seluruh baris treatment dalam satu transaksi;
  - bila tidak ada baris yang berubah: "Catatan ini sudah difinalisasi." atau "Catatan ini baru diubah di tempat lain. Muat ulang halaman." Isian di layar tidak dikosongkan;
  - mengembalikan versi baru;
  - audit `encounter.edit-draft` dengan batas 30 menit (R12).
- **`finalizeEncounter(id, version)`** (`record:write`), dalam satu transaksi:
  1. menyimpan isian terakhir yang dikirim bersama permintaan;
  2. memeriksa A tidak kosong, bila kosong: "Isi penilaian (A) sebelum finalisasi.";
  3. mengubah kunjungan menjadi FINAL dengan finalizedBy/At;
  4. mengubah booking HADIR menjadi SELESAI;
  5. mengisi `Patient.lastVisitAt` dengan nilai terbesar antara nilai lama dan `startAt` booking.

  Bila satu langkah gagal, semua batal. Audit `encounter.finalize`.
- **`discardEncounterDraft(id, version)`** (`record:write`): menghapus hanya bila masih DRAF dengan versi yang sama. Audit `encounter.discard`, dengan kode booking di ringkasan.
- **`addEncounterAddendum(id, text)`** (`record:write`): teks wajib diisi setelah di-trim. Audit `encounter.addendum`.
- **`updatePatientImportantNotes(patientId, text)`** (`record:write`) dan **`updatePaperRecordNumber(patientId, text)`** (`booking:manage`). Teks kosong berarti null. Keduanya diaudit.
- **Gagal menyimpan otomatis** (jaringan putus atau galat server): tanda berubah menjadi "Belum tersimpan, mencoba lagi". Klien mencoba ulang dengan jeda bertambah. Selama ada perubahan belum tersimpan, `beforeunload` memperingatkan saat halaman akan ditutup. Konflik versi tidak dicoba ulang, karena harus dimuat ulang.
- **Satu dokter, dua tab:** tab yang tertinggal menerima pesan konflik di atas.

## 8. Hak akses

| Aksi / data | Dokter & Super Admin | Resepsionis |
|---|---|---|
| Dasbor "Pasien hari ini" dan "Catatan belum final" | ✔ (`record:read`) | ✘ |
| Buka `/admin/kunjungan/[id]` | ✔ (`record:read`) | ✘, halaman terlarang (`forbidden()`), sama seperti halaman isian |
| Periksa, simpan draf, finalisasi, buang draf, adendum | ✔ (`record:write`) | ✘ |
| Riwayat kunjungan di Data Pasien | ✔ | ✘ (tetap melihat Riwayat booking yang sudah ada) |
| Catatan penting | lihat & ubah | ✘ |
| No. RM kertas lama | lihat & ubah | lihat & ubah |
| Jejak catatan ini | Super Admin saja (`audit:read`) | ✘ |

Pembatasan dijaga di kueri server: kolom klinis kunjungan dan `importantNotes` tidak pernah dipilih untuk staf tanpa `record:read`, mengikuti pola `PatientSummary` dan `getPatientDetail` yang ada. Halaman tidak mengimpor `@/lib/db` atau `@prisma/client`.

## 9. Audit

Memakai tabel `AuditLog` dan `recordAudit` yang sudah ada.

| Action | Entity | Kapan |
|---|---|---|
| `encounter.create` | Encounter | Periksa membuat kunjungan baru |
| `encounter.edit-draft` | Encounter | draf tersimpan (maks. satu per staf per kunjungan per 30 menit) |
| `encounter.finalize` | Encounter | finalisasi |
| `encounter.discard` | Encounter | draf dibuang |
| `encounter.addendum` | Encounter | adendum ditambahkan |
| `encounter.view` | Encounter | halaman kunjungan dibuka (maks. satu per staf per kunjungan per 30 menit) |
| `patient.view-records` | Patient | Data Pasien dibuka oleh staf `record:read` (maks. satu per staf per pasien per 30 menit) |
| `patient.update-important-notes` | Patient | catatan penting diubah |
| `patient.update-paper-record-number` | Patient | no. RM kertas lama diubah |

- **Batas 30 menit:** sebelum mencatat, cari baris terakhir dengan pelaku, action, dan entityId yang sama. Bila umurnya kurang dari 30 menit, tidak dicatat. Dua permintaan yang benar-benar bersamaan boleh menghasilkan dua baris; itu tidak mengganggu.
- **Jejak catatan ini:** semua baris audit untuk entity Encounter dengan id kunjungan itu, terbaru di atas, berisi waktu (WITA), nama, peran, dan aksi dalam bahasa Indonesia ("membuka", "mengubah draf", "memfinalisasi", dan seterusnya).

## 10. Kasus khusus

- **Walk-in tanpa isian:** bagian S hanya berisi kotak teks dokter.
- **Isian kuis versi 1:** tetap tampil lewat `clinicalView`. Isian versi yang tidak dikenal menampilkan pesan galat yang sudah ada, tanpa membuat halaman kunjungan gagal.
- **Isian berstatus Menunggu diisi** (kelak dari link WA Plan 3b-2b): bagian S menampilkan "Isian belum diisi pasien".
- **Booking Hadir tidak pernah diperiksa:** tetap di daftar "Catatan belum final" sampai diperiksa. Dokter bisa memeriksanya belakangan. Tanggal kunjungan tetap tanggal booking.
- **Staf pelaksana dinonaktifkan kemudian:** nama yang disalin tetap tampil di catatan lama.
- **Layanan diganti nama atau dihapus kemudian:** `serviceName` yang disalin tetap tampil.
- **Pasien dengan banyak kunjungan:** Riwayat kunjungan menampilkan semuanya, terbaru di atas, tanpa halaman bertingkat (volume klinik kecil).
- **Super Admin menulis catatan:** diizinkan (`record:write`), dan namanya tercatat sebagai penulis.

## 11. Pengujian

**Unit:**
- skema zod tanda vital: batas bawah/atas, desimal koma, pasangan sistolik/diastolik, diastolik < sistolik;
- hitung IMT;
- keputusan batas audit 30 menit;
- label peringatan hamil/menyusui dari isian v1 dan v2;
- cuplikan penilaian 80 karakter.

**Integrasi** (basis data `sundy_test`):
- trigger lewat SQL langsung (`$executeRaw`):
  - UPDATE dan DELETE kunjungan FINAL ditolak;
  - FINAL ke DRAF ditolak;
  - treatment pada kunjungan final tidak bisa ditambah, diubah, atau dihapus;
  - adendum ke draf ditolak;
  - adendum tidak bisa diubah atau dihapus;
  - CHECK rentang vital dan syarat FINAL berlaku;
- `openEncounter`: hanya dari HADIR, idempoten, dua panggilan bersamaan menghasilkan satu kunjungan, dan tinggi diisikan dari kunjungan final terakhir (bukan dari draf);
- `saveEncounterDraft`: versi lama ditolak, kunjungan final ditolak, dan baris treatment terganti utuh;
- `finalizeEncounter`: A kosong ditolak; booking menjadi SELESAI dan `lastVisitAt` terisi dalam satu transaksi; `lastVisitAt` tidak mundur bila kunjungan lama difinalisasi belakangan;
- `discardEncounterDraft`: draf terhapus beserta treatment-nya, dan booking kembali "Belum diperiksa";
- regresi: booking HADIR/SELESAI tidak bisa dibatalkan, ditandai tidak hadir, dipindah jadwal, atau dicocokkan ulang;
- akses: resepsionis ditolak di setiap aksi kunjungan; `getPatientDetail` untuk resepsionis tidak memuat `importantNotes` maupun riwayat kunjungan; resepsionis bisa mengubah no. RM kertas lama;
- audit: setiap aksi tercatat, dan baris `view`/`edit-draft` tidak berulang dalam 30 menit;
- dasbor: daftar "Pasien hari ini" memakai tanggal WITA, dan "Catatan belum final" memuat draf lama serta booking Hadir lama tanpa kunjungan.

**E2E** (Playwright, desktop dan mobile):
- dokter: tandai hadir, dasbor, Periksa, isi S/O/A/P dan satu treatment, lihat tanda "Tersimpan", muat ulang dan isian tetap ada, finalisasi, halaman baca-saja, tambah adendum, lalu Riwayat kunjungan di Data Pasien;
- resepsionis: membuka alamat kunjungan menghasilkan halaman terlarang, dan dasbornya tidak memuat daftar pasien hari ini.

## 12. Rilis & dokumen yang ikut berubah

- **Migrasi aditif:** enum `EncounterStatus`, tiga tabel, dua kolom `Patient`, CHECK, dan trigger. Tidak ada data lama yang diubah. Seperti biasa: backup sebelum deploy, `cek-situs.sh`, dan log galat PM2.
- **Runbook §4 (rollback):** setelah ada kunjungan di produksi, jangan `deploy.sh kembali` ke rilis sebelum bagian ini. Rilis lama tidak menampilkan kunjungan, dan tidak tahu bahwa booking Selesai berasal dari catatan dokter.
- **PRD:** status F12 (kunjungan & SOAP terlaksana; BIA, treatment lanjutan, dan grafik menyusul) dan catatan pembagian lima sub-proyek.
- **Sidebar:** tidak ada menu baru. Kunjungan dibuka dari dasbor dan Data Pasien.

## 13. Di luar cakupan

- BIA dan unggah berkas hasil, grafik progres (sub-proyek 3).
- Scan rekam medis kertas lama (sub-proyek 3; nomornya sudah bisa dicatat di spec ini).
- Order obat, antrean apotek, kasir dan pembayaran (sub-proyek 4, Plan 5).
- Pengingat kontrol mingguan (sub-proyek 5).
- Check-in, NIK, kuis di tablet, food recall H-1 digital (sub-proyek 2).
- Cetak atau ekspor rekam medis, kode ICD-10 dan SATUSEHAT, tanda tangan elektronik.
- Halaman audit lengkap untuk seluruh klinik (spec ini hanya menampilkan jejak per kunjungan).
