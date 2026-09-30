# Desain — UI Panel Admin Bagian B: Alur Dokter di Halaman Kunjungan

- **Versi:** 1.0
- **Tanggal:** 30 September 2026
- **Status:** Menunggu tinjauan pemilik
- **Melengkapi:** `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md`. Aturan simpan otomatis, finalisasi, adendum, penguncian, audit, dan hak akses di spec itu tetap berlaku. Spec ini hanya mengubah **susunan halaman kunjungan** dan menambah data yang ditampilkan di sampingnya.
- **Mockup:** companion visual 30 September 2026. Pilihan tata letak "A" dan isi kolom kiri disetujui pemilik. Berkasnya disimpan lokal di `.superpowers/brainstorm/` (tidak masuk git).

## 1. Latar belakang & tujuan

Pemilik menilai panel admin kurang rapi, informasi penting sulit ditemukan, dan alur kerja lambat. Alur yang paling terasa adalah **dokter memeriksa & isian**, lalu mencatat booking WA/telepon. Tampilan di HP bukan prioritas, karena dokter dan resepsionis bekerja di laptop atau desktop.

Perbaikan panel dibagi empat:
- **A.** Perbaikan cepat: huruf SunDY termuat di seluruh situs, dan menu Jejak Audit yang kosong dihapus. Sudah dirilis 30 September 2026 lewat PR #17.
- **B.** Alur dokter di halaman kunjungan *(spec ini)*.
- **C.** Alur booking WA/telepon.
- **D.** Tampilan umum semua halaman dan dasbor.

Temuan dari screenshot halaman kunjungan saat ini:
- satu kolom sempit, dengan separuh kanan layar kosong;
- tabel kebiasaan menampilkan semua jam, termasuk yang kosong, sehingga dokter harus menggulir jauh untuk sampai ke A, P, dan tombol Finalisasi;
- "Setujui ke data pasien" memaksa pindah ke halaman isian;
- kunjungan sebelumnya dan perkembangan berat/tensi tidak terlihat sama sekali, padahal kontrol mingguan slimming bergantung pada keduanya.

**Berhasil bila:** di layar laptop, dr. Diane bisa menulis S-O-A-P sambil melihat isian kuis, kunjungan sebelumnya, tren berat & tensi, dan peringatan, lalu memfinalisasi tanpa menggulir ke bawah halaman dan tanpa pindah halaman untuk menyetujui isian.

## 2. Keputusan (dikonfirmasi pemilik, 30 Sep 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| U1 | Urutan | A dulu (sudah dirilis), lalu B alur dokter |
| U2 | Yang terlihat di samping catatan | Peringatan, isian kuis, kunjungan sebelumnya, dan tren berat & tensi |
| U3 | Tata letak | Dua kolom: konteks di kiri dan tetap di tempat saat menggulir, catatan di kanan, bar aksi di bawah yang selalu terlihat |
| U4 | Isi kolom kiri | Peringatan selalu di atas, lalu tab **Isian kuis**, **Sebelumnya**, **Tren** (bagian 4) |
| U5 | Tab yang terbuka pertama kali | Isian kuis bila kunjungan ini punya isian. Bila tidak, Sebelumnya. Bila tidak ada juga, Tren |
| U6 | Persetujuan isian | "Setujui ke data pasien" dilakukan di tab Isian, tanpa pindah halaman. Halaman isian terpisah tetap ada |
| U7 | Catatan final | Susunan yang sama. Kanan baca-saja, dengan adendum |

## 3. Tata letak

**Layar ≥ 1024 px (laptop/desktop):**
- **Kepala** satu baris: nama pasien, badge Draf/Final, No. RM, umur, jenis kelamin, tanggal & jam, cabang, layanan, tenaga, dan tautan **Data pasien**.
- **Kolom kiri (±40%):** peringatan, lalu tab.
  - Kolom ini tetap di tempat (`sticky`) saat kolom kanan digulir.
  - Tingginya dibatasi setinggi layar dikurangi kepala dan bar bawah, dengan guliran sendiri.
- **Kolom kanan:**
  - **S:** kotak teks "Keluhan dan anamnesis dokter". Isian kuis tidak lagi diulang di sini, karena sudah ada di tab kiri.
  - **O:** tanda vital, baris IMT beserta selisih berat, dan pemeriksaan fisik.
  - **A**, **P**, dan **Treatment yang dilakukan**.
  - **Jejak catatan ini** (Super Admin) di paling bawah.
- **Bar bawah** menempel di dasar area konten dan selalu terlihat:
  - **draf:** status simpan otomatis, **Buang draf**, **Finalisasi**. Status galat tetap merah seperti sekarang;
  - **final:** "Final · difinalisasi oleh {nama}, {tanggal} {jam} WITA".

**Layar < 1024 px:**
- Satu kolom: kepala, peringatan, tab (bisa dilipat, terbuka pada awalnya), lalu catatan.
- Bar bawah tetap menempel.
- Tidak dioptimalkan khusus untuk HP, tetapi tidak boleh ada guliran mendatar.

**Selisih berat di bagian O:** "IMT 29,0 · berat turun 0,8 kg dari 23 Sep" (atau "naik"). Dihitung langsung saat dokter mengetik, dibandingkan dengan berat di kunjungan final terakhir yang punya angka berat. Bila tidak ada pembanding, yang tampil hanya IMT.

## 4. Kolom kiri

**Peringatan** (selalu tampil di atas tab): isinya sama dengan kotak Peringatan sekarang (alergi, riwayat penyakit & obat, catatan penting, hamil/menyusui, no. RM kertas lama), dalam bentuk ringkas.

**Tab Isian kuis:**
- Tidak ada isian: "Tidak ada isian kuis untuk kunjungan ini."
- Isian belum diisi: "Isian belum diisi pasien."
- Versi kuis tidak dikenal: pesan galat dan tautan "Buka halaman isian".
- Isian siap:
  - kepala kecil: tujuan, pasien baru/lama, dan tanggal kirim;
  - bagian jawaban seperti sekarang;
  - **tabel kebiasaan ringkas:** hanya jam yang berisi, dengan tautan "Tampilkan 06.00–22.00" untuk membuka tabel penuh. Tabel aktivitas kemarin (isian v1) diperlakukan sama;
  - kotak **Setujui ke data pasien**, bila staf punya `record:write`. Formulirnya sama dengan di halaman isian (catatan saat ini, usulan, kolom sunting). Setelah disetujui, halaman dimuat ulang, jadi peringatan di atas dan badge isian ikut berubah. Bila isian sudah diperiksa, kotak tetap ada dengan isi awal = catatan pasien saat ini, seperti di halaman isian;
  - tautan "Buka halaman isian".

**Tab Sebelumnya:**
- Sumbernya kunjungan **final** pasien yang sama dengan jadwal **lebih awal** dari kunjungan ini, terbaru di atas, **maksimal 12**. Draf kunjungan lain tidak ditampilkan.
- **Kunjungan terbaru terbuka lengkap:**
  - kepala: tanggal, cabang, dan penulis;
  - S, pemeriksaan fisik, dan baris tanda vital (O);
  - A dan P;
  - treatment (treatment · area · dosis · pelaksana);
  - adendum beserta penulis dan tanggal.
- **Kunjungan lainnya:** daftar tanggal dan cuplikan penilaian (80 karakter). Klik untuk membuka isinya di tempat; hanya satu yang terbuka pada satu waktu.
- **Lebih dari 12 kunjungan:** "Kunjungan lebih lama ada di Data pasien", dengan tautan.
- **Belum ada kunjungan final sebelumnya:** "Belum ada kunjungan sebelumnya."

**Tab Tren:**
- **Tabel:** kolom Tanggal, Berat, IMT, Pinggang, Tensi.
  - Baris pertama adalah **Kunjungan ini** (angka dari formulir, ikut berubah saat mengetik), lalu kunjungan final di tab Sebelumnya yang punya minimal satu angka vital.
  - Selisih berat dan pinggang dari baris di bawahnya ditampilkan hijau bila turun dan merah bila naik.
  - Kolom kosong berisi "—".
- **Ringkasan:** "Total sejak {tanggal paling awal}: berat −2,5 kg · pinggang −5 cm". Ringkasan hanya tampil bila ada minimal dua angka untuk dibandingkan.
- **Keterangan:** "Dari kunjungan final. Grafik lengkap menyusul di bagian BIA."
- **Tanpa data sama sekali:** "Belum ada angka tanda vital."

## 5. Data dan server

`getEncounterForStaff` (`src/server/encounter-read.ts`) menambah tiga hal ke `EncounterDetail`:
- **`history`:** hingga 12 kunjungan untuk tab Sebelumnya dan Tren. Setiap kunjungan berisi:
  - `id`, tanggal, cabang, penulis (penulis finalisasi);
  - `subjective`, `physicalExam`, `assessment`, `plan`;
  - `vitals` (angka), `vitalLines`;
  - treatment, adendum, dan cuplikan penilaian.

  `hasMoreHistory` bernilai true bila kunjungannya lebih dari 12. Kueri: `Encounter.status = FINAL`, `appointment.patientId` = pasien ini, `appointment.startAt` < jadwal kunjungan ini, diurutkan `startAt desc`, `take: 13`.
- **`approval`:** data persetujuan isian (`IntakeApproval`, bentuk yang sama dengan halaman isian). Hanya untuk `record:write`, dan hanya bila booking punya isian yang sudah terisi. Selain itu `null`. `loadApproval` dan tipe `IntakeApproval` dipindah dari `src/server/intake.ts` ke `src/server/intake-clinical.ts` (bukan `"use server"`) agar dipakai kedua halaman.
- **`intake.submittedAt` dan `intake.purposeLabel`,** untuk kepala tab Isian.

Tren dan selisih dihitung di sisi klien dari `history[].vitals` dan angka formulir, dengan fungsi murni di `src/lib/encounter.ts`. Dengan begitu baris "Kunjungan ini" ikut berubah saat mengetik.

**Audit:** selain `encounter.view`, membuka halaman kunjungan juga mencatat `patient.view-records` untuk pasiennya, karena halaman kini menampilkan isi kunjungan lain. Batasnya sama: paling banyak satu baris per staf per pasien per 30 menit.

**Hak akses tidak berubah:**
- halaman kunjungan hanya untuk `record:read`;
- `approval` hanya diisi untuk `record:write`;
- resepsionis tidak pernah menerima `history` maupun `approval`, karena halaman itu tertutup baginya.

## 6. Komponen

- **`EncounterPageView`** disusun ulang menjadi kepala, grid dua kolom, dan bar bawah.
- **`EncounterContextPanel`** (klien): peringatan dan tiga tab, dengan logika tab awal U5. Setiap tab adalah komponen sendiri:
  - **`IntakeTab`:** memakai `IntakeClinicalContent` dan `IntakeApprovalForm` yang sudah ada.
  - **`PreviousVisitsTab`**
  - **`VitalsTrendTab`**
- **`HabitTable`** (klien): tabel kebiasaan/aktivitas dengan mode ringkas. Halaman isian tetap menampilkan tabel penuh; halaman kunjungan memakai mode ringkas.
- **`EncounterForm`:**
  - bar aksi dan status pindah ke bar bawah yang menempel;
  - baris IMT menampilkan selisih berat;
  - `intakeSlot` di bagian S dihapus, karena isian pindah ke kolom kiri;
  - angka vital di formulir diteruskan ke tab Tren untuk baris "Kunjungan ini".
- **`EncounterRecord`:** baris "Difinalisasi oleh…" pindah ke bar bawah. Selebihnya tetap.

Karena Tren membaca angka formulir, `EncounterForm` dan `EncounterContextPanel` berbagi state vital lewat induk klien yang sama. Induk itu adalah `EncounterWorkspace`, komponen klien yang membungkus panel kiri, formulir, dan bar bawah. Nilai awalnya dari server, lalu diperbarui saat mengetik.

## 7. Kasus khusus

- **Pasien baru tanpa kunjungan sebelumnya:** tab Sebelumnya dan Tren menampilkan pesan kosong. Tab awal: Isian bila ada, bila tidak Tren (baris "Kunjungan ini" saja).
- **Kunjungan final dibuka belakangan:** "Sebelumnya" tetap berarti lebih awal dari jadwal kunjungan ini, bukan dari hari ini. Baris "Kunjungan ini" di Tren memakai angka tersimpan.
- **Isian diperiksa di halaman isian sementara halaman kunjungan terbuka:** persetujuan dari halaman kunjungan memakai versi pasien yang sama, jadi versi lama ditolak dengan pesan "Data pasien baru saja berubah…" seperti sekarang.
- **Tensi sebagian** (hanya sistolik) tidak tampil di Tren. Tensi tampil bila keduanya ada, karena begitulah aturan simpannya.

## 8. Pengujian

**Unit:**
- fungsi tren (`vitalsTrend`): urutan baris, selisih berat & pinggang, total sejak awal, baris "Kunjungan ini" dari angka formulir, baris tanpa vital dilewati;
- `weightChangeNote`: pesan "turun/naik … dari {tanggal}", atau null tanpa pembanding;
- logika tab awal (U5).

**Integrasi** (`getEncounterForStaff`):
- `history` hanya memuat kunjungan final yang lebih awal; kunjungan ini, draf lain, dan kunjungan yang lebih baru tidak ikut;
- `history` terbaru di atas dan maksimal 12, dengan `hasMoreHistory`;
- `approval` ada untuk `record:write` bila isian terisi, dan `null` tanpa isian;
- audit `patient.view-records` tercatat dengan batas 30 menit.

**Komponen:**
- dua kolom dan bar bawah dengan Finalisasi;
- tab awal sesuai U5, dan perpindahan tab;
- tabel kebiasaan ringkas beserta "Tampilkan 06.00–22.00";
- membuka kunjungan lama di tab Sebelumnya;
- baris "Kunjungan ini" di Tren ikut angka formulir;
- selisih berat di bagian O;
- kotak persetujuan tampil di tab Isian;
- tampilan final memakai bar "Final · difinalisasi oleh…".

**E2E:**
- `kunjungan.spec.ts` tetap lolos di tata letak baru;
- tambahan: dengan isian kuis, dokter menyetujui ke data pasien dari tab Isian, lalu peringatan memuat alergi baru.

## 9. Di luar cakupan

- Bagian C (booking WA/telepon) dan D (tampilan umum + dasbor): spec terpisah.
- Grafik tren (bagian BIA rekam medis).
- Mengingat tab terakhir yang dipilih per dokter.
- Mengedit atau menyalin isi kunjungan lama ke kunjungan ini.
