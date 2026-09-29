# Desain — Pendaftaran Pasien: Kuis, Booking Situs & Link WhatsApp (Sub-proyek 1 / Plan 3b)

- **Versi:** 1.0
- **Tanggal:** 28 September 2026
- **Status:** Disetujui pemilik (28 September 2026) · Plan 3b-1 terlaksana (29 September 2026) · Plan 3b-2 menyusul
- **Melengkapi PRD:** F5 (Pendaftaran Konsultasi), F6 (Cek Status Booking), F9 (Manajemen Booking), Lampiran C
  (Form Skrining Digital), dan menjawab keputusan **D5** (biaya booking). Perubahan PRD yang diperlukan dirinci di
  bagian 11.

## 1. Latar belakang & tujuan

Plan 3a membangun pencatatan janji temu oleh admin. Sub-proyek ini menambahkan dua jalan bagi pasien untuk
menyerahkan datanya sendiri:

1. **Booking mandiri di situs** (`sundyclinic.com/daftar`), dibuka 24 jam.
2. **Form lewat link WhatsApp** untuk booking yang dicatat admin (telepon, chat WA, walk-in).

Keduanya dimulai dengan **kuis bergaya BetterMe** (`bttrm.co/calisthenics11`): satu pertanyaan per layar,
kartu pilihan besar, dan batang progres. Tujuannya menggali **keluhan dan tujuan pasien** sesuai tujuan
konsultasinya (Slimming atau Aesthetic) **sebelum** data pribadi diminta.

**Berhasil bila:**

- Dokter membaca keluhan, tujuan, riwayat penyakit dan obat, riwayat diet, serta kebiasaan makan pasien
  *sebelum* pasien masuk ruang konsultasi.
- Admin tidak lagi mengetik ulang formulir kertas Identitas Pasien atau Google Form "Recall Form".
- Booking dari situs tercatat dengan sumber `SITUS`, sehingga sasaran PRD "≥ 40% booking lewat situs"
  bisa diukur.
- Pasien lama tidak perlu mengisi ulang data yang sudah ada. Di sisi lain, situs tidak pernah membocorkan
  apakah seseorang pernah berobat di SunDY.

## 2. Keputusan (dikonfirmasi pemilik, 28 Sep 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| K1 | Lingkup | Booking situs (F5/F6) **dan** form lewat link WA untuk booking admin, dalam satu sub-proyek |
| K2 | Bentuk | Kuis gaya BetterMe: satu pertanyaan per layar. Data pribadi diminta **di akhir** |
| K3 | Tujuan konsultasi | Slimming · Aesthetic · "Belum yakin, tanya dokter saja" |
| K4 | Pasien lama | Pasien menyatakan sendiri "sudah pernah" dan mendapat **kuis versi pendek**. Situs tidak memeriksa nomor WA. **Admin mencocokkan** booking dengan rekam medis |
| K5 | Riwayat penyakit | Setiap penyakit yang dicentang **wajib** dijawab obatnya, atau dicentang "Tidak minum obat". Pasien boleh menulis "lupa" |
| K6 | Riwayat diet (Slimming) | Program apa (boleh lebih dari satu). Untuk tiap program: Berhasil / Tidak berhasil / Masih jalan. Berhasil → turun berapa kg dan apakah beratnya bertahan atau naik lagi |
| K7 | Aktivitas H-1 (Slimming, pasien lama) | Pasien mengisi **daftar catatan** (jam + jenis + isi). Dokter melihatnya sebagai **tabel 06.00–22.00** |
| K8 | Layar Ringkasan | Ada, sebelum memilih jadwal. Setiap bagian bisa diubah |
| K9 | Layanan yang dipesan | Pasien baru: **Konsultasi Dokter** saja. Timbang BIA diputuskan dokter di klinik. Pasien Aesthetic lama boleh memilih treatment |
| K10 | Isi kuis | **Tetap di kode**, diberi nomor versi. Perubahan pertanyaan dikerjakan developer lewat rilis |
| K11 | Penyimpanan | **Isian Pendaftaran** terpisah per booking. Booking situs boleh belum terhubung ke pasien sampai admin mencocokkan |
| K12 | Persetujuan dokter (A1) | Jawaban klinis masuk ke data pasien hanya lewat tombol **"Setujui ke data pasien"** oleh dokter |
| K13 | Kedaluwarsa | Booking **situs** yang belum diverifikasi dalam 24 jam menjadi Kedaluwarsa. Booking admin tidak ikut kedaluwarsa |
| K14 | Link WA | Link pribadi acak, disimpan sebagai hash, berlaku sampai jam janji. Ada kode QR sebagai cadangan di klinik |
| K15 | Biaya booking (menjawab D5) | **Rp 100.000** untuk semua jenis booking, **terpisah** dari biaya layanan (tidak dipotong dari tagihan) |
| K16 | Pembatalan | Biaya booking **tidak dikembalikan**, tetapi **tetap berlaku bila pasien pindah jadwal** paling lambat 2 jam sebelum jadwal |
| K17 | Angka biaya & rekening | Disimpan sebagai **pengaturan klinik** yang diubah Super Admin di panel, tanpa developer |
| K18 | Biaya booking untuk booking admin | Berlaku juga untuk booking yang dicatat admin lewat **WhatsApp atau telepon**. **Walk-in** tidak dikenai biaya |

## 3. Alur pasien di situs

### 3.1 Langkah-langkah (`/daftar`)

Satu halaman kuis. Langkahnya berganti tanpa memuat ulang halaman, dan tombol "kembali" di HP mundur satu
langkah. Batang progres dihitung dari jalur yang sedang ditempuh.

```
U1 Pernah berobat?  →  U2 Tujuan  →  pertanyaan jalur (3.2)  →  R Ringkasan
   →  L Layanan  →  J Jadwal [slot ditahan 10 menit]  →  D Data diri + persetujuan  →  Kirim
   →  Halaman sukses (kode SDY-XXXX, instruksi transfer biaya booking, tombol "Konfirmasi via WhatsApp")
```

- **R — Ringkasan.** Mengulang jawaban per bagian, masing-masing dengan tombol "Ubah". Layar ini tidak
  menjanjikan hasil dan tidak memberi diagnosis. Kalimat penutupnya: *"Dokter kami akan membahas ini
  bersama Anda saat konsultasi."*
- **L — Layanan.**
  - Pasien baru dan semua pasien "Belum yakin" memesan **Konsultasi Dokter** (layanan `konsultasi-dokter`,
    tipe `KONSULTASI`, 30 menit). Layanan ini ditampilkan tanpa pilihan lain.
  - Pasien Slimming lama memesan Konsultasi Dokter untuk kontrol.
  - Pasien Aesthetic lama memilih Konsultasi Dokter **atau** satu treatment aktif dari katalog (tipe
    `TREATMENT`). Durasinya mengikuti `durationMin`, dan antreannya mengikuti `requiresDoctor` (PRD F4a).
  - Layar ini juga menampilkan harga layanan (dibayar di klinik) dan **biaya booking Rp 100.000** (dibayar
    sekarang lewat transfer), lengkap dengan aturan K16.
- **J — Jadwal.**
  - Cabang dipilih otomatis (Mahakeret) selama hanya satu cabang yang aktif. Citraland tampil
    "Segera Hadir" (PRD F5).
  - Pasien memilih tenaga (dokter tertentu, atau "siapa saja yang tersedia"), lalu tanggal dan slot. Aturan
    ketersediaan mengikuti PRD F4.
  - Memilih slot membuat **penahanan 10 menit** (bagian 5.4).
- **D — Data diri.**
  - Pasien baru mengisi nama lengkap, nomor WA, tanggal lahir, jenis kelamin, pekerjaan, dan alamat.
  - Pasien lama cukup mengisi nama, nomor WA, dan tanggal lahir. Data ini hanya dipakai admin untuk
    mencocokkan.
  - Dua kotak centang wajib: persetujuan penggunaan data (UU PDP, dengan tautan ke Kebijakan Privasi), dan
    persetujuan aturan biaya booking.
- **Halaman sukses** menampilkan:
  - kode booking dan detail jadwal;
  - **"Transfer biaya booking Rp 100.000 ke {bank} {nomor} a.n. {pemilik}"**;
  - tombol besar **Konfirmasi via WhatsApp**, dengan pesan terisi yang sama seperti PRD F5.

  Bila nomor rekening belum diisi di pengaturan, halaman menampilkan *"Admin kami akan mengirim nomor rekening
  lewat WhatsApp"*.

Tombol **"Daftar Konsultasi"** ditambahkan di header situs, beranda, halaman layanan, dan halaman Program
Slimming. Tombol WhatsApp melayang yang sudah ada tetap dipertahankan.

### 3.2 Isi kuis — versi 1

Daftar pilihan di bawah ini adalah **kuis versi 1**. Dokter meninjau kata-katanya saat meninjau spec ini.
Mengubah kata atau menambah pilihan tidak mengubah desain; perubahan seperti itu cukup menaikkan nomor versi
(bagian 5.2).

**Langkah umum**

| Kode | Pertanyaan | Jawaban |
|---|---|---|
| U1 | Pernah berobat di SunDY Clinic? | Belum, ini pertama kali · Sudah pernah |
| U2 | Apa yang ingin Anda konsultasikan? | Slimming (berat badan & bentuk tubuh) · Aesthetic (kulit & wajah) · Belum yakin, tanya dokter saja |

**Slimming, pasien baru**

| Kode | Pertanyaan | Jawaban |
|---|---|---|
| S1 | Apa tujuan utama Anda? | Menurunkan berat badan · Mengecilkan lingkar tubuh · Kembali ideal setelah melahirkan · Hidup lebih sehat & bugar |
| S2 | Berapa kg yang ingin diturunkan? | 1–5 kg · 5–10 kg · 10–20 kg · Lebih dari 20 kg · Belum tahu |
| S3 | Area mana yang paling ingin dikecilkan? *(boleh lebih dari satu)* | Perut · Lengan · Paha · Pipi & dagu · Tidak ada area khusus *(eksklusif)* |
| S4 | Pernah menjalani program diet? | Belum pernah · Pernah · Sedang menjalani sekarang |
| S5 | Program diet apa? *(muncul bila S4 ≠ Belum pernah; boleh lebih dari satu)* | Kurangi nasi/karbo · Keto · Intermittent fasting · Hitung kalori · Katering diet · Olahraga/gym · Obat/suplemen pelangsing · Program klinik lain · Lainnya (teks wajib) |
| S6 | Bagaimana hasilnya? *(satu kelompok jawaban per program di S5)* | **Wajib:** Berhasil · Tidak berhasil · Masih jalan. **Berhasil/Masih jalan:** "Turun berapa kg?" (angka 0,5–100, perkiraan boleh, wajib). **Berhasil:** "Sekarang beratnya?" Bertahan · Naik sebagian · Naik lagi semua (wajib) |
| S7 | Berat & tinggi badan Anda | Berat 30–250 kg, tinggi 120–220 cm (keduanya wajib). IMT tampil beserta catatan: *"Dokter akan memastikannya dengan Timbang BIA di klinik."* |
| S8 | Apa yang biasa Anda makan sehari? | Pagi · Siang · Malam (minimal satu terisi) · Snack · Minuman · Cemilan (opsional). Semua teks bebas, maksimal 300 karakter |

**Aesthetic, pasien baru**

| Kode | Pertanyaan | Jawaban |
|---|---|---|
| A1 | Apa yang paling mengganggu Anda? *(boleh lebih dari satu)* | Jerawat & bekasnya · Flek & kulit kusam · Kerutan & garis halus · Pori-pori besar · Kulit kendur / double chin · Lainnya (teks wajib) |
| A2 | Bagaimana kulit wajah Anda? | Berminyak · Kering · Kombinasi · Sensitif / mudah merah · Tidak tahu |
| A3 | Sudah berapa lama keluhan ini? | Kurang dari 3 bulan · 3–12 bulan · Lebih dari 1 tahun |
| A4 | Pernah treatment di klinik lain? *(boleh lebih dari satu)* | Belum pernah *(eksklusif)* · Facial / peeling · Laser / injeksi · Lainnya (teks). Ditambah "Skincare yang dipakai sekarang" (teks, opsional) |

**Belum yakin, pasien baru**

| Kode | Pertanyaan | Jawaban |
|---|---|---|
| B1 | Ceritakan keluhan atau tujuan Anda | Teks wajib, maksimal 1.000 karakter |

**Kesehatan (semua pasien baru, sesudah pertanyaan jalur)**

| Kode | Pertanyaan | Jawaban |
|---|---|---|
| K-1 | Punya riwayat penyakit atau kondisi ini? *(boleh lebih dari satu)* | Darah tinggi · Diabetes · Penyakit jantung · Gangguan tiroid · Asam lambung / maag · Penyakit lain (teks nama penyakit, wajib) · Tidak ada *(eksklusif)* |
| K-2 | Obat apa yang Anda minum? *(muncul bila K-1 ≠ Tidak ada; satu kelompok jawaban per penyakit)* | Teks "nama obat & aturan minum", **atau** centang "Tidak minum obat". Salah satunya wajib. Pasien boleh menulis "lupa" |
| K-3 | Ada obat lain atau alergi? | Obat/suplemen lain (vitamin, suplemen, obat pelangsing, KB, obat jerawat): Tidak ada · Ya → teks wajib. Alergi (obat, makanan, kosmetik): Tidak ada · Ya → teks wajib |
| K-4 | Sedang hamil, merencanakan kehamilan, atau menyusui? | Ya · Tidak · Tidak berlaku |

**Pasien lama (kuis versi pendek)**

| Kode | Pertanyaan | Jawaban |
|---|---|---|
| P1 | Slimming: *"Bagaimana perkembangan program Anda? Ada keluhan?"* · Aesthetic: *"Keluhan atau treatment yang diinginkan kali ini?"* · Belum yakin: pertanyaan B1 | Teks wajib, maksimal 1.000 karakter |
| P2 | Ada perubahan penyakit atau obat sejak kunjungan terakhir? | Tidak ada · Ada → layar K-1, K-2, dan K-3 dengan petunjuk *"isi kondisi Anda saat ini"* |
| P3 | *(Slimming saja)* Apa saja yang Anda lakukan kemarin? | **Daftar catatan**, minimal 1. Setiap catatan: jam (06.00–22.00, per jam), jenis (Makan/minum · Kapsul/obat · Olahraga), dan isi (teks, maksimal 200 karakter). Tanggal "kemarin" disimpan bersama jawaban |

Catatan untuk P3: "kemarin" dihitung dari hari pasien mengisi (WITA), bukan dari hari kunjungan. Pasien yang
booking beberapa hari sebelumnya tetap memberi contoh satu hari kebiasaannya, dan dokter melihat tanggalnya.

### 3.3 Cek status booking (`/cek-booking`, PRD F6)

- Pasien memasukkan kode booking dan 4 digit terakhir nomor WA. Halaman menampilkan status, layanan, tenaga,
  cabang, dan jadwal. **Tidak ada data klinis** yang ditampilkan, dan nomor WA disamarkan.
- **Batalkan** tersedia sampai 2 jam sebelum jadwal. Sebelum membatalkan booking yang sudah diverifikasi,
  pasien melihat peringatan *"Biaya booking tidak dikembalikan. Ingin pindah jadwal saja?"*.
- **Pindah jadwal** tersedia untuk booking terkonfirmasi, sampai 2 jam sebelum jadwal. Tombol ini membuka
  WhatsApp klinik dengan pesan terisi (kode dan jadwal lama). Admin memindahkannya dengan fitur jadwal ulang
  yang sudah ada, dan biaya booking tetap melekat pada booking yang sama (K16).
- Kurang dari 2 jam sebelum jadwal, kedua tombol diganti ajakan menghubungi admin lewat WA.
- Status Kedaluwarsa ditampilkan dengan ajakan *"booking ulang"*.

## 4. Link WhatsApp untuk booking yang dicatat admin

1. Admin mencatat booking seperti sekarang (Plan 3a). Booking ini sudah terhubung ke pasien.
2. Di daftar booking muncul **"Kirim form"**. Tombol ini membuat link pribadi `sundyclinic.com/isi/<token>`
   lalu membuka WhatsApp ke nomor pasien dengan pesan terisi:
   > *Halo {nama depan}, ini SunDY Clinic. Sebelum {layanan} {hari tanggal} pukul {jam}, mohon isi form
   > singkat ini (±5 menit): {link}. Transfer biaya booking Rp 100.000 ke {rekening} bila belum.
   > Jawaban Anda hanya dibaca dokter kami.*

   Kalimat transfer hanya disertakan bila booking belum diverifikasi.
3. Pasien mengisi kuis yang sama. Langkah **L** dan **J** dilewati karena sudah ditetapkan admin. Langkah
   **U1** juga dilewati: jenis kuis ditentukan sistem. Langkah **D** hanya meminta data identitas yang masih
   kosong di data pasien, dan selalu memuat kotak persetujuan data. Kotak persetujuan biaya booking hanya
   muncul bila booking itu punya `bookingFee` dan belum diverifikasi.
4. Saat Kirim, data identitas yang diisi pasien (tanggal lahir, jenis kelamin, pekerjaan, alamat) langsung
   **mengisi kolom yang masih kosong** di data pasien. Kolom yang sudah terisi tidak pernah ditimpa. Ini data
   identitas, bukan data klinis, sehingga tidak menunggu persetujuan dokter. Jawaban klinis tetap mengikuti
   6.4.

**Jenis kuis ditentukan otomatis.** Pasien yang **belum pernah punya isian lengkap** mendapat kuis lengkap,
dan yang sudah punya mendapat kuis pendek. Aturan ini sekaligus menangani pasien era kertas: mereka mengisi
data lengkap sekali, lalu kunjungan berikutnya cukup kuis pendek. Aturan yang sama muncul di booking situs:
bila admin mencocokkan booking dengan pasien yang belum punya isian lengkap, tombol "Kirim form" muncul di
booking itu untuk isian lengkap.

**Keamanan link:**

- Token dibuat dari 32 byte acak (base64url). Basis data hanya menyimpan **hash SHA-256**-nya.
- Halaman link hanya menampilkan **nama depan**, layanan, dan jadwal. Data medis lama tidak pernah
  ditampilkan.
- Link berlaku sampai **jam mulai janji temu**. Link mati lebih awal bila booking dibatalkan, kedaluwarsa,
  atau tidak hadir, dan setelah form terkirim. Setelah terkirim, link hanya menampilkan *"Terima kasih, sudah
  kami terima"*.
- **Kirim ulang** mengganti token, sehingga link lama langsung mati.
- **Tampilkan QR** memunculkan kode QR link yang sama di layar admin. Pasien memindainya dengan HP sendiri,
  atau admin membuka link di tablet klinik.

## 5. Data

### 5.1 Tabel baru `Intake` ("Isian Pendaftaran")

Satu baris per booking (`appointmentId` unik).

| Kolom | Isi |
|---|---|
| `appointmentId` | Booking pemilik isian |
| `patientId` (boleh kosong) | Terisi saat admin mencocokkan (booking situs) atau langsung (booking admin) |
| `status` | `MENUNGGU_DIISI` (link terkirim) → `TERISI` → `DIPERIKSA` |
| `kind` | `LENGKAP` · `PENDEK` |
| `purpose` (kosong selama `MENUNGGU_DIISI`) | `SLIMMING` · `AESTHETIC` · `BELUM_YAKIN` |
| `claimsReturning` | Pengakuan pasien di U1 (hanya booking situs) |
| `quizVersion` | Nomor versi kuis saat diisi |
| `answers` (JSON) | Semua jawaban kuis selain kolom bertipe di bawah. Bentuknya dikunci skema zod versi yang sama dan diperiksa saat disimpan |
| `name`, `whatsapp`, `birthDate`, `gender`, `occupation`, `address` | Data diri, sebagai kolom biasa agar bisa dicari dan dipakai membuat pasien |
| `selfWeightKg`, `selfHeightCm` | Ukuran mandiri (desimal). Nanti bisa masuk grafik, dengan penanda berbeda dari BIA |
| `activityDate` | Tanggal yang dimaksud "kemarin" pada P3 |
| `consentAt`, `consentVersion` | Waktu persetujuan dan versi Kebijakan Privasi yang disetujui |
| `submittedAt` | Waktu pasien menekan Kirim |
| `reviewedAt`, `reviewedByStaffId` | Pemeriksaan dokter (K12) |
| `linkTokenHash` (unik), `linkExpiresAt` | Link WA (bagian 4) |

- **Tidak pernah dihapus.** Setelah `TERISI`, jawaban tidak pernah diubah. Yang boleh berubah hanya
  `patientId` (saat pencocokan) dan kolom pemeriksaan. Aturan ini dijaga di satu-satunya modul server yang
  menulis `Intake` dan dibuktikan lewat uji integrasi.
- Satu isian per booking. "Kirim ulang" memperbarui token pada baris yang sama.

### 5.2 Skema kuis berversi (`src/lib/kuis/`)

- Definisi kuis versi 1 ditulis sebagai data TypeScript: langkah, pilihan, dan aturan kapan setiap langkah
  muncul. Skema zod-nya ada di tempat yang sama.
- Satu definisi dipakai tiga pihak: layar kuis di browser, pemeriksaan di server, dan tampilan isian untuk
  dokter.
- Mengubah pertanyaan berarti membuat versi baru (`v2`). Versi lama tetap disimpan di kode, agar isian lama
  selalu bisa ditampilkan dengan pertanyaan aslinya.
- `zod` dijadikan dependensi langsung. Saat ini zod 4 sudah terpasang sebagai dependensi Better Auth.

### 5.3 Perubahan tabel lain

- **`Appointment.patientId` boleh kosong**, dijaga constraint basis data:
  ```sql
  CHECK ("patientId" IS NOT NULL
         OR ("source" = 'SITUS' AND "status" IN ('MENUNGGU_KONFIRMASI','DIBATALKAN','KEDALUWARSA')))
  ```
  Artinya booking tanpa pasien hanya mungkin dari situs, dan tidak pernah bisa terkonfirmasi atau hadir.
  Kode yang menampilkan booking (daftar, teks konfirmasi) menangani pasien kosong dengan menampilkan nama dari
  isian dan label "Belum dicocokkan".
- **`Appointment.bookingFee`** (angka rupiah, boleh kosong) menyimpan salinan biaya booking saat booking
  dibuat. Kolom ini diisi untuk sumber `SITUS`, `WHATSAPP`, dan `TELEPON`, dan dibiarkan kosong untuk
  `WALK_IN` (K18). Perubahan pengaturan tidak mengubah booking lama, dan kasir (Plan 5) nanti membaca angka ini.
- **Tabel baru `ClinicSetting`** (satu baris) berisi `bookingFee` (awal 100.000), `bankName`,
  `bankAccountNumber`, dan `bankAccountHolder`. Halaman `/admin/pengaturan` hanya untuk Super Admin
  (`content:manage`), dan setiap perubahan dicatat di audit.
- **Audit tanpa staf.** `recordAudit` menerima pelaku bukan staf: **Sistem** (kedaluwarsa otomatis) dan
  **Pasien (situs)** (booking dan pembatalan dari situs). Kolom `actorStaffId` diisi penanda tetap `sistem`
  atau `pasien`. Kolom itu tidak punya relasi, jadi skemanya tidak berubah.

### 5.4 Penahanan slot (`SlotHold`, skemanya dari Plan 3a)

1. Saat pasien memilih slot, server membuat `SlotHold` 10 menit dengan token acak yang disimpan di browser.
   Dalam **transaksi yang sama**, hold kedaluwarsa milik tenaga itu dihapus lebih dulu. Ini menutup catatan
   risiko Plan 3a (hold basi menghalangi baris baru) **tanpa perlu cron**.
2. Perhitungan slot publik menganggap hold aktif milik orang lain sebagai jam sibuk. Hold milik pasien
   sendiri tidak dihitung sibuk.
3. Saat Kirim, dalam **satu transaksi**: hold milik token itu dihapus, Appointment (`SITUS`) dibuat, lalu
   `Intake` (`TERISI`) dibuat.
   - Bila hold sudah kedaluwarsa tetapi jamnya masih kosong, booking tetap dibuat.
   - Bila jamnya sudah terisi (misalnya admin mencatat booking telepon di jam yang sama), exclusion constraint
     Appointment menolaknya. Pasien melihat *"Slot baru saja terisi, pilih jam lain"* dan kembali ke langkah
     J **tanpa kehilangan jawaban**.
4. Setiap token hold hanya bisa dipakai sekali, sehingga Kirim ganda tidak menghasilkan dua booking.

## 6. Sisi admin & dokter

### 6.1 Mencocokkan pasien (booking situs)

- Di daftar booking, booking situs tanpa pasien menampilkan nama dari isian dan label **"Belum dicocokkan"**.
- **"Cocokkan pasien"** membuka panel yang berisi:
  - data diri dari isian dan pengakuan pasien (baru/lama);
  - **saran pasien yang mirip**: nomor WA sama (dinormalkan dengan `normalizeWhatsapp`), atau nama mirip
    dengan tanggal lahir sama. Setiap saran menampilkan nomor RM, tanggal lahir, dan kunjungan terakhir;
  - pilihan **"Pilih pasien ini"** atau **"Buat pasien baru"**. Pilihan kedua sudah terisi dari isian, dan
    nomor RM dibuat saat itu juga dengan mekanisme Plan 3a.
- Pencocokan menyetel `Appointment.patientId` dan `Intake.patientId` dalam satu transaksi, lalu dicatat di
  audit (`appointment.match-patient`).
- **Verifikasi**, **Hadir**, dan **Tidak hadir** baru aktif setelah booking dicocokkan. Constraint 5.3 juga
  menolak ketiganya pada booking tanpa pasien. **Batalkan** tetap bisa kapan saja.
- Pencocokan bisa diganti selama booking belum diverifikasi. Pasien baru yang terlanjur dibuat saat
  pencocokan pertama tidak dihapus: nomor RM tidak pernah dipakai ulang, dan admin bisa mengabaikannya.

### 6.2 Hak akses (ditegakkan di server)

| Data | Super Admin | Dokter | Resepsionis |
|---|---|---|---|
| Data diri isian, tujuan, status isian | ✓ | ✓ | ✓ |
| Keluhan, penyakit & obat, alergi, hamil/menyusui, diet, food recall, aktivitas, BB/TB | ✓ | ✓ | ✗ |
| Mencocokkan pasien, Kirim form / QR | ✓ | ✓ | ✓ |
| Setujui ke data pasien | ✓ | ✓ | ✗ |
| Pengaturan biaya & rekening | ✓ | ✗ | ✗ |

Kolom klinis tidak pernah dikirim ke browser pengguna tanpa kemampuan `record:read`. Kueri untuk resepsionis
tidak memilih kolom `answers`, `selfWeightKg`, `selfHeightCm`, maupun `activityDate` sama sekali. Ini
diuji di uji integrasi.

### 6.3 Halaman isian untuk dokter (`/admin/isian/[id]`, `record:read`)

Halaman ini menampilkan jawaban yang sudah dirapikan per bagian sesuai versi kuisnya:

- tujuan dan target;
- **daftar penyakit → obat** (contoh: *Darah tinggi: Amlodipine 5 mg 1×/hari · Diabetes: tidak minum obat*);
- obat lain, alergi, dan hamil/menyusui;
- riwayat diet per program (contoh: *Kurangi karbo: berhasil −8 kg, naik sebagian*);
- food recall;
- **tabel aktivitas 06.00–22.00** beserta tanggalnya, dengan jam kosong tetap tampil kosong;
- BB, TB, dan IMT mandiri.

### 6.4 Setujui ke data pasien (K12, `record:write`)

- Sistem menyusun usulan teks **Alergi** dan **Riwayat penyakit & obat** dari isian. Usulan ini ditampilkan
  berdampingan dengan isi `Patient.allergies` dan `Patient.medicalHistory` saat ini.
- Dokter menyunting lalu menyimpan. Dalam satu transaksi, data pasien diperbarui, isian menjadi `DIPERIKSA`
  (siapa dan kapan), dan aksi dicatat di audit.
- Tombol ini tidak menyentuh data identitas. Identitas diisi saat admin membuat pasien (6.1), atau saat
  pasien mengirim lewat link (bagian 4, langkah 4).
- Rekam medis lengkap (SOAP, BIA, order) tetap lingkup sub-proyek 2. Di sini isian hanya menjadi masukan.

### 6.5 Agar tidak terlewat

- Daftar booking punya filter **"Isian belum diperiksa"** dan kolom status isian (belum diisi, terisi,
  diperiksa).
- Tombol **Kirim form / Kirim ulang / Tampilkan QR** tersedia di baris booking.
- Halaman pasien menampilkan **riwayat semua isian** pasien itu. Bagian klinisnya hanya untuk `record:read`.

## 7. Aturan otomatis & kasus khusus

| Kasus | Perilaku |
|---|---|
| Booking situs belum diverifikasi 24 jam | Menjadi `KEDALUWARSA` dan slotnya lepas. Pemeriksaan dijalankan tepat sebelum slot dihitung, sebelum booking/hold dibuat, dan saat daftar booking dibuka, lewat satu `UPDATE` bersyarat. Audit mencatat pelaku "Sistem" |
| Booking dicatat admin belum diverifikasi | Tidak kedaluwarsa otomatis (K13). Admin yang memutuskan |
| Hold habis saat pasien mengisi data diri | Booking tetap dibuat bila jamnya masih kosong (5.4) |
| Kirim ditekan dua kali / dikirim ulang karena sinyal | Token hold hanya berlaku sekali, sehingga tidak ada booking ganda |
| Admin mencatat booking di jam yang sedang ditahan pasien | Diizinkan (hold tidak mengikat admin). Pasien mendapat "slot baru saja terisi" saat Kirim |
| Pasien membatalkan ≥ 2 jam sebelum jadwal | `DIBATALKAN`, pelaku "Pasien (situs)". Isian tetap tersimpan. Biaya booking hangus bila sudah dibayar |
| Pasien ingin pindah jadwal | Lewat WA ke admin, lalu admin memakai jadwal ulang Plan 3a. Status dan biaya booking tetap melekat |
| Satu nomor WA dipakai sekeluarga | Tidak ada pencocokan otomatis. Admin memilih pasien yang tepat dari saran (6.1) |
| Pasien mengaku "pernah" padahal belum | Admin tidak menemukan kecocokan lalu memilih "Buat pasien baru". Karena pasien itu belum punya isian lengkap, tombol "Kirim form" muncul (bagian 4) |
| Link dibuka setelah mati | Penjelasan singkat dan tombol WA ke klinik |
| Tanggal merah, dokter berhalangan, Citraland | Aturan PRD F4/F5 yang sudah ada tetap berlaku |

## 8. Keamanan & privasi

- **Jawaban di browser.** Jawaban kuis disimpan di `sessionStorage` tab tersebut (kunci per versi kuis), agar
  refresh atau sinyal putus tidak mengulang kuis. Jawaban terhapus setelah Kirim berhasil, saat pasien
  menekan "Mulai ulang", dan saat tab ditutup. **Tidak ada jawaban yang dikirim ke server sebelum Kirim.**
  Yang dikirim lebih awal hanya permintaan hold (tenaga dan jam).
- **Persetujuan.** Halaman Kebijakan Privasi diperbarui agar menyebut data kesehatan dari kuis dan biaya
  booking, dan diberi nomor versi. Versi yang disetujui disimpan di `Intake.consentVersion`.
- **Pembatasan laju** per IP asli pengunjung. Nginx mengisi `X-Real-IP` dari `CF-Connecting-IP`; lihat
  `scripts/server/nginx/`. Hitungannya disimpan di memori proses aplikasi, dan ini cukup karena PM2
  menjalankan satu proses. Bila kelak dibuat cluster, penghitung dipindah ke basis data.

  | Aksi | Batas |
  |---|---|
  | Membuat hold | 10 per menit |
  | Kirim pendaftaran (situs dan link) | 5 per 10 menit |
  | `/cek-booking` (cari) | 10 per 10 menit |
  | Batalkan dari situs | 5 per 10 menit |

- **Kolom jebakan** tersembunyi di formulir Kirim. Bila terisi, permintaan ditolak diam-diam.
- **Pemeriksaan ulang di server** dengan skema zod yang sama. Batas panjang teks mengikuti 3.2.
- **Halaman publik** tidak pernah menampilkan data klinis. Nomor WA disamarkan (`0851-****-8900`), dan tanggal
  lahir tidak ditampilkan.
- **Log server** tidak mencatat isi jawaban maupun data diri.
- Isian otomatis ikut **backup harian terenkripsi** yang sudah berjalan (runbook bagian 7).

## 9. Susunan kode (gambaran; nama akhir ditetapkan di plan)

| Bagian | Isi |
|---|---|
| `src/lib/kuis/` | Definisi & skema kuis v1, percabangan langkah, IMT, pengubahan aktivitas menjadi tabel jam, penyusun teks usulan Alergi/Riwayat. Murni, tanpa basis data |
| `src/lib/rate-limit.ts` | Pembatas laju di memori |
| `src/server/public-booking.ts` | Hold, perhitungan slot publik, Kirim (transaksi 5.4), cek status, batal. Tanpa login, dengan pembatasan laju |
| `src/server/intake.ts` | Link (buat/kirim ulang/validasi), Kirim lewat link, pencocokan pasien, baca isian (dengan filter hak akses), Setujui ke data pasien |
| `src/server/clinic-setting.ts` | Baca/ubah biaya booking & rekening |
| `src/server/booking-expiry.ts` | `expireStaleSiteBookings()` (bagian 7) |
| `src/app/(public)/daftar`, `isi/[token]`, `cek-booking` | Halaman publik |
| `src/app/(admin)/admin/isian/[id]`, `pengaturan` | Halaman admin baru |
| `src/components/kuis/` | Komponen layar kuis (kartu pilihan, progres, daftar catatan) |
| Migrasi | Tabel `Intake`, `ClinicSetting`, enum baru; `Appointment.patientId` boleh kosong + CHECK; `Appointment.bookingFee` |

Perubahan kode lama: `appointment-table` (label/tombol baru, pasien kosong), `getStaffAvailability` (hold
dihitung sibuk untuk jalur publik), `recordAudit` (pelaku non-staf), halaman pasien (riwayat isian), header
dan halaman publik (tombol Daftar Konsultasi).

## 10. Pengujian

- **Unit (Vitest):**
  - percabangan kuis: layar mana yang muncul untuk setiap kombinasi baru/lama × tujuan × jawaban;
  - skema: obat wajib per penyakit, hasil wajib per program diet, kg wajib bila berhasil/masih jalan,
    pilihan eksklusif;
  - IMT;
  - daftar aktivitas menjadi tabel 06.00–22.00;
  - teks usulan Alergi/Riwayat;
  - hash dan masa berlaku token;
  - pembatas laju.
- **Integrasi (PostgreSQL lokal `sundy_test`):**
  - transaksi Kirim, termasuk tabrakan dengan booking admin, hold kedaluwarsa, dan Kirim ganda;
  - CHECK `patientId` menolak booking tanpa pasien yang diverifikasi atau yang bukan dari situs;
  - kedaluwarsa 24 jam hanya untuk booking situs;
  - pencocokan pasien, termasuk pencocokan ulang sebelum verifikasi;
  - **resepsionis tidak menerima kolom klinis**;
  - siklus hidup link (terisi, batal, lewat jam, kirim ulang);
  - Kirim lewat link hanya mengisi kolom identitas pasien yang kosong, tanpa menimpa yang sudah ada;
  - Verifikasi, Hadir, dan Tidak hadir ditolak pada booking yang belum dicocokkan;
  - Setujui ke data pasien;
  - isian tidak bisa diubah setelah terisi;
  - salinan `bookingFee`.
- **E2E (Playwright, desktop & mobile):**
  - pasien baru Slimming dari U1 sampai kode SDY dan halaman sukses;
  - pasien lama Aesthetic memesan treatment;
  - pengisian lewat link WA;
  - admin mencocokkan lalu memverifikasi;
  - dokter menyetujui ke data pasien;
  - pasien membatalkan lewat `/cek-booking`;
  - resepsionis tidak melihat bagian klinis.

## 11. Perubahan PRD yang menyertai

- **F5:** langkah 4-tahap diganti alur bagian 3.1. Form skrining Slimming menjadi bagian dari kuis.
  Pembayaran berupa biaya booking K15/K16.
- **F6:** tambah "Pindah jadwal via WA" dan aturan biaya booking saat membatalkan.
- **F9:** tambah aksi **Cocokkan pasien** dan **Kirim form**. Booking situs boleh belum terhubung ke pasien
  sampai diverifikasi.
- **Bagian 8, kasus "Pasien lama booking lagi":** diubah dari *"sistem mengenali nomor WhatsApp dan
  menautkan"* menjadi *"sistem menyarankan pasien yang cocok, admin yang memutuskan"*.
- **Lampiran C:** diganti rujukan ke kuis versi 1 (bagian 3.2).
- **D5:** ditutup dengan K15–K17.

## 12. Ruang lingkup

**Termasuk:** semua yang tertulis di bagian 3–8.

**Tidak termasuk:**

- rekam medis SOAP/BIA/order (sub-proyek 2);
- kasir dan pencatatan pembayaran selain verifikasi biaya booking (sub-proyek 3);
- OTP dan pengiriman WA otomatis (PRD D1, Fase 1.5);
- pembuat kuis di panel (K10);
- statistik lintas pasien dari jawaban kuis;
- pemindahan jadwal mandiri oleh pasien di situs;
- pembukaan cabang Citraland.

## 13. Rencana rilis

Pekerjaan dibagi menjadi dua plan yang masing-masing bisa dirilis dan diuji di produksi:

- **Plan 3b-1:** kuis, booking situs, `/cek-booking`, pengaturan biaya & rekening, kedaluwarsa,
  pencocokan pasien, dan halaman isian untuk dokter (baca saja).
- **Plan 3b-2:** link WA dan QR, Setujui ke data pasien, filter isian, dan riwayat isian di halaman pasien.

Tombol **"Daftar Konsultasi"** di situs publik baru ditampilkan setelah 3b-1 dirilis dan dicoba pemilik.
Sebelum itu, `/daftar` bisa dibuka lewat alamat langsung untuk uji coba.

## 14. Risiko

| Risiko | Penanganan |
|---|---|
| **Kembali ke rilis sebelum 3b** (`deploy.sh kembali`) setelah ada booking situs tanpa pasien, sehingga kode lama menganggap `patient` selalu ada | Setelah booking situs pertama masuk, jangan kembali ke rilis sebelum 3b-1. Dicatat di runbook bagian 4 saat 3b-1 dirilis. Bila terpaksa, cocokkan dulu semua booking "Belum dicocokkan" |
| Pasien mengisi asal-asalan atau bot mengisi booking palsu | Pembatasan laju, kolom jebakan, dan biaya booking. Booking tanpa bukti transfer kedaluwarsa dalam 24 jam |
| Kata-kata pertanyaan kurang pas secara medis | Dokter meninjau bagian 3.2 sebelum implementasi. Perubahan setelah rilis cukup menjadi versi kuis baru |
| Pembatas laju di memori hilang saat rilis/restart | Dapat diterima: batasnya pendek (≤ 10 menit) |
| Pasien tidak mengerti bahwa biaya booking terpisah | Biaya ditampilkan di langkah L dan halaman sukses, dengan kotak persetujuan wajib di langkah D |

## 15. Yang perlu dikonfirmasi saat tinjauan spec

- ~~Biaya booking untuk booking yang dicatat admin~~: **dijawab pemilik 28 Sep 2026** dan menjadi K18.
- **Kata-kata kuis versi 1** (bagian 3.2), untuk ditinjau dokter. Tinjauan ini tidak menahan penulisan plan.
  Kata-katanya harus final sebelum task yang membangun definisi kuis dikerjakan.
