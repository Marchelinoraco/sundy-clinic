# Desain — Kuis Pendaftaran Versi 2: Gizi Klinik & Form Recall

- **Versi:** 1.1 (food recall H-1 dipindah ke kedatangan di klinik)
- **Tanggal:** 30 September 2026
- **Status:** Disetujui pemilik per bagian (30 September 2026), menunggu tinjauan spec tertulis
- **Melengkapi:** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Untuk isian baru, spec ini **menggantikan bagian 3.2 (isi kuis versi 1)**. Alur booking, pencocokan, persetujuan dokter, hak akses, dan kedaluwarsa tetap mengikuti spec itu.
- **Acuan isi:** formulir Google dokter (22 kolom: identitas, tujuan, jam bangun, jam dan isi+porsi sarapan/siang/malam, cemilan, olahraga, rokok/alkohol/soda, alergi makanan, riwayat penyakit & obat rutin, jam tidur), dan lembar kertas klinik "JAM | Jenis dan Jumlah Pemberian" 06.00–22.00.

## 1. Latar belakang & tujuan

Kuis versi 1 sudah dipakai di produksi sejak 29 September 2026. Pemilik meminta tiga perubahan:

1. Pilihan tujuan menjadi **Slimming**, **Aesthetic**, dan **Konsultasi dokter spesialis gizi klinik**. Pilihan "Belum yakin, tanya dokter saja" dihapus.
2. Pertanyaan makan harus **informatif** dan meminta **porsi** di setiap waktu makan. Layar sekarang juga punya kolom "Snack" dan "Cemilan" yang maknanya sama.
3. Nada teks **condong ke customer**, bukan pasien.

Dokter membedakan dua pengumpulan data:
- **Form recall (kebiasaan):** pola sehari-hari customer, yaitu jam bangun dan tidur, jam dan isi makan yang biasa beserta porsinya, cemilan, olahraga, serta rokok/alkohol/soda.
- **Food recall (H-1):** apa yang benar-benar dimakan dan diminum customer **kemarin**.

Dokter membaca keduanya sebagai **tabel per jam**, persis seperti lembar kertas klinik.

**Food recall H-1 tidak ditanyakan di kuis online** (keputusan V10). Ia harus menggambarkan hari sebelum *konsultasi*, sedangkan kuis online bisa diisi seminggu sebelum jadwal. Karena itu food recall ditanyakan saat customer tiba di klinik, lewat sub-proyek berikutnya: **Kedatangan di klinik (check-in front office)**. Sub-proyek itu juga mencakup NIK, pencocokan pasien dengan seluruh data diri, dan kuis di tablet/QR klinik. Sampai sub-proyek itu dirilis, dokter tetap memakai lembar kertas "JAM | Jenis dan Jumlah Pemberian".

**Berhasil bila:**
- customer baru Slimming dan gizi klinik mengisi form recall dari HP, satu hal per layar;
- dokter melihat form recall sebagai tabel per jam;
- isian versi 1 yang sudah ada tetap terbaca seperti sekarang.

## 2. Keputusan (dikonfirmasi pemilik, 30 Sep 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| V1 | Tujuan konsultasi | Slimming · Aesthetic · Konsultasi dokter spesialis gizi klinik. "Belum yakin" dihapus |
| V2 | Pertanyaan gizi klinik | Keluhan/tujuan singkat, berat & tinggi, form recall, lalu kesehatan. Tanpa target kg, area tubuh, dan riwayat diet. Layanan yang dipesan: **Konsultasi Dokter** |
| V3 | Form recall untuk Slimming | Ya. Slimming dan gizi klinik memakai blok form recall yang sama |
| V4 | Siapa mengisi apa | Customer **baru** Slimming/gizi klinik mengisi form recall. Customer **lama** tidak mengisi form recall. Food recall H-1 untuk keduanya ditanyakan saat tiba di klinik (V10) |
| V5 | Susunan layar makan | Satu layar per waktu makan (gaya BetterMe) |
| V6 | Tampilan dokter | Form recall sebagai tabel per jam "Jam \| Jenis dan jumlah", seperti lembar kertas klinik |
| V7 | Versi | Kuis **versi 2** baru. Versi 1 dibekukan hanya untuk membaca isian lama |
| V8 | Nada | Customer disapa "Anda". Kata "pasien" dan "berobat" tidak dipakai di halaman customer. Bila perlu kata benda: **"customer"**. Panel admin/dokter tetap memakai "pasien" |
| V9 | Aesthetic | Tidak berubah, dan tidak memakai form recall maupun food recall |
| V10 | Food recall H-1 | **Tidak** di kuis online. Ditanyakan saat customer tiba di klinik (sub-proyek "Kedatangan di klinik"). Sampai itu dirilis: lembar kertas |

## 3. Alur kuis versi 2

Layar pembuka untuk semua customer:
- **U1:** "Pernah konsultasi atau treatment di SunDY Clinic?", dengan jawaban "Belum, ini pertama kali" / "Sudah pernah";
- **U2:** "Apa yang ingin Anda konsultasikan?".

**Customer baru**

| Tujuan | Layar setelah U2 |
|---|---|
| Slimming | S1 tujuan utama → S2 target kg → S3 area tubuh → S4 riwayat diet → (S5 program, S6 hasil bila pernah/sedang diet) → **T1 berat & tinggi** → **F1–F7 form recall** → K1–K4 kesehatan |
| Gizi klinik | **N1 keluhan/tujuan** → **T1 berat & tinggi** → **F1–F7 form recall** → K1–K4 kesehatan |
| Aesthetic | A1–A4 (tidak berubah) → K1–K4 kesehatan |

**Customer lama**

| Tujuan | Layar setelah U2 |
|---|---|
| Slimming, Gizi klinik | P1 cerita kunjungan ini → P2 ada perubahan kesehatan? → K1–K4 bila P2 = ada perubahan. Tabel aktivitas kemarin (P3 versi 1) tidak ada lagi di kuis online (V10) |
| Aesthetic | P1 → P2 → K1–K4 bila ada perubahan (tidak berubah) |

Layar S7 dan S8 versi 1 tidak ada lagi di versi 2:
- S7 (berat & tinggi) menjadi **T1**, dipakai Slimming dan gizi klinik;
- S8 (Pagi/Siang/Malam/Snack/Minuman/Cemilan) digantikan F2–F5.

Layar identitas, jadwal, dan konfirmasi tidak berubah. **Ringkasan jawaban** yang dilihat customer menampilkan form recall sebagai baris singkat per layar (mis. "Sarapan 07.00: nasi 1 piring, …"), masing-masing dengan tombol "Ubah" seperti sekarang. Tabel per jam hanya untuk dokter.

## 4. Isi layar baru

Semua jam dipilih dari daftar **per jam** (mis. 07.00), sama dengan baris tabel dokter. Semua teks bebas dibatasi 300 karakter, kecuali N1 (1.000).

| Layar | Judul | Isian & aturan wajib |
|---|---|---|
| N1 | "Apa yang ingin Anda konsultasikan ke dokter gizi klinik?" | Teks, wajib. Petunjuk: *"Misalnya gula darah, kolesterol, asam urat, maag, atau berat badan. Dokter kami membacanya sebelum Anda datang."* |
| T1 | "Berat & tinggi badan Anda" | Sama dengan S7 versi 1 (angka, batas 30–250 kg dan 120–220 cm, IMT tampil). Wajib |
| F1 | "Jam berapa Anda biasanya bangun dan tidur?" | Jam bangun (03.00–12.00) dan jam tidur (18.00–02.00). Keduanya wajib |
| F2 | "Sarapan" | "Jam berapa biasanya Anda sarapan?" (04.00–12.00) **atau** kotak "Saya tidak sarapan". Bila sarapan: "Apa yang Anda makan & minum, berapa porsinya?" wajib |
| F3 | "Makan siang" | Sama seperti F2 (jam 10.00–16.00, "Saya tidak makan siang") |
| F4 | "Makan malam" | Sama seperti F2 (jam 16.00–23.00, "Saya tidak makan malam") |
| F5 | "Cemilan" | Seberapa sering (wajib): Hampir setiap hari / 3–5× seminggu / 1–2× seminggu / Jarang atau tidak pernah. Bila bukan "Jarang": jam biasanya (daftar jam **atau** "Tidak tentu") dan "Cemilan apa, berapa banyak?" wajib |
| F6 | "Olahraga" | Rutin? (wajib): Ya, rutin / Kadang-kadang / Tidak berolahraga. Bila bukan "Tidak": jenis (teks), berapa menit sekali olahraga (5–300), berapa kali seminggu (1–7), dan jam biasanya. Semuanya wajib |
| F7 | "Rokok, alkohol, dan minuman bersoda" | Tiga pertanyaan, masing-masing Tidak / Kadang / Sering. Ketiganya wajib |

Petunjuk informatif di layar makan dan aktivitas:
- **F2–F4:** *"Tulis makanan dan minuman beserta porsinya. Contoh: nasi 1 piring, paha ayam goreng 1 potong, sayur kol tumis 1 centong, kopi hitam tanpa gula 1 gelas. Ini membantu dokter menyusun program yang pas untuk Anda."*
- **F5:** *"Contoh: kerupuk, bakwan goreng, pisang goreng, permen, cokelat, martabak."*
- **F6:** *"Contoh: jalan kaki, gym, renang, senam."*

Semua judul, petunjuk, dan pilihan versi 2 dikumpulkan di `src/lib/kuis/v2/texts.ts` dan `options.ts`. Kata-kata ini **ditinjau dr. Diane sebelum rilis**. Koreksi kata tidak mengubah desain.

## 5. Nada untuk customer

| Tempat | Versi 1 | Versi 2 |
|---|---|---|
| U1 | "Pernah berobat di SunDY Clinic?" | "Pernah konsultasi atau treatment di SunDY Clinic?" |
| Ringkasan jawaban (dilihat customer) | "Slimming · pasien baru/lama" | "Slimming · pertama kali ke SunDY" / "pernah ke SunDY" |
| Cek booking | "Jam Anda akan dilepas untuk pasien lain." | "Jam Anda akan dilepas agar bisa dipesan orang lain." |

Halaman isian dokter tetap memakai "pasien baru/lama".

## 6. Tampilan untuk dokter (halaman isian)

**Tabel "Kebiasaan sehari (form recall)"**, hanya untuk isian versi 2 customer baru Slimming/gizi klinik:

| Jam | Jenis dan jumlah |
|---|---|
| 06.00 | Bangun tidur |
| 07.00 | Sarapan: nasi 1 piring, telur dadar 1, teh manis 1 gelas |
| 16.00 | Cemilan (hampir setiap hari): pisang goreng 2 potong · Olahraga: gym, 60 menit, 3× seminggu |
| 22.00 | Tidur malam |

Aturan tabelnya:
- Baris selalu 06.00–22.00, termasuk jam kosong. Baris melebar ke jam bangun bila lebih pagi, dan ke jam tidur bila lebih larut. Jam tidur 00.00–02.00 ditaruh setelah 23.00.
- Beberapa catatan di jam yang sama tampil dalam satu baris, dipisah " · ". Urutannya: bangun, makan, cemilan, olahraga, tidur.
- Catatan "Tidak sarapan / tidak makan siang / tidak makan malam" dan cemilan "tidak tentu" atau "jarang" tampil di bawah tabel, tidak di baris jam.
- Di bawah tabel juga tampil: **Rokok:** … · **Alkohol:** … · **Soda:** ….

Isian **versi 1** customer lama tetap menampilkan tabel "Aktivitas kemarin" seperti sekarang. Isian versi 2 tidak memilikinya; food recall H-1 digital hadir lewat sub-proyek "Kedatangan di klinik".

Bagian lain halaman isian tidak berubah: tujuan, target dan area (Slimming), riwayat diet, keluhan gizi klinik, berat/tinggi/IMT, kesehatan, dan formulir "Setujui ke data pasien". Usulan alergi dan riwayat penyakit memakai aturan versi 1, karena bagian kesehatan sama persis.

## 7. Data & versi

- **Kode:** `src/lib/kuis/v2/` berisi `options`, `answers` (skema zod), `steps` (urutan & aturan wajib), `texts`, `describe` (bagian + tabel kebiasaan), dan `record-proposal`. Isian baru disimpan dengan `quizVersion = 2`.
- **Versi 1 dibekukan.** `src/lib/kuis/v1/` tidak lagi dipakai layar kuis maupun pengiriman. Ia hanya dipakai untuk mengurai, menampilkan, dan menyusun usulan dari isian `quizVersion = 1`.
- **Dua pembaca.** `describe` versi 2 menerima sasaran pembaca: *customer* (ringkasan, dengan nada bagian 5) atau *staf* (halaman isian, dengan "pasien baru/lama" dan tabel kebiasaan).
- **Pemilih versi.** Server memilih modul menurut `Intake.quizVersion`: `loadClinical` untuk tampilan, dan usulan "Setujui ke data pasien". Versi yang tidak dikenal tetap memberi pesan galat seperti sekarang.
- **Bentuk jawaban versi 2** (bagian yang baru; bagian lain sama dengan versi 1):
  - `nutrition: { story }` untuk gizi klinik (N1);
  - `body: { weightKg, heightCm }` (T1). Nilainya disalin ke kolom bertipe `selfWeightKg`/`selfHeightCm` dan dibuang dari JSON, seperti versi 1;
  - `habits: { wakeHour, sleepHour, breakfast, lunch, dinner, snack, exercise, smoking, alcohol, soda }`:
    - setiap makan: `{ none?: true, hour?, text? }`;
    - `snack`: `{ frequency, hour? | anytime?: true, text? }`;
    - `exercise`: `{ routine, kind?, minutes?, perWeek?, hour? }`;

  Bagian `unsure`, `slimming.foodRecall`, dan `returning.activities` versi 1 tidak ada di versi 2. Kolom `activityDate` tidak diisi oleh isian versi 2.
- **Basis data:** satu migrasi aditif `ALTER TYPE "IntakePurpose" ADD VALUE 'GIZI_KLINIK'`. `BELUM_YAKIN` tetap ada untuk data versi 1. Kolom lain tidak berubah.
- **Label tujuan** untuk panel (daftar, halaman pasien) dipindah ke satu peta yang tidak bergantung versi: SLIMMING "Slimming", AESTHETIC "Aesthetic", GIZI_KLINIK "Gizi klinik", BELUM_YAKIN "Belum yakin (kuis lama)".
- **Layanan:** gizi klinik (baru maupun lama) hanya boleh memesan `konsultasi-dokter`. Aturan yang sudah ada (hanya customer lama Aesthetic yang boleh memilih treatment) tetap berlaku.

## 8. Kasus khusus

| Kasus | Perilaku |
|---|---|
| Customer sedang mengisi kuis versi 1 saat rilis | Draf di browser tidak memuat penanda versi 2 dan dibuang. Customer melihat pesan *"Kuis kami baru saja diperbarui. Silakan isi dari awal."* Tanda terima booking yang tersimpan tidak disentuh |
| Pengiriman berjawaban versi 1 dari tab lama | Ditolak skema versi 2 dengan pesan galat umum yang sama seperti jawaban tidak sah |
| Jam tidur setelah tengah malam | Disimpan 0–2. Di tabel, baris 00.00–02.00 ditaruh setelah 23.00 |
| Tidak sarapan dan tidak makan siang, dan seterusnya | Boleh. Tidak ada aturan "minimal satu makan"; tabel mencatatnya di bawah |
| Rollback ke rilis sebelum kuis v2 | Rilis lama tidak bisa membaca isian versi 2. Runbook bagian 4 diberi catatan: jangan `deploy.sh kembali` ke rilis sebelum kuis v2 setelah ada isian v2 |

## 9. Pengujian

- **Unit:**
  - skema versi 2 menolak kunci asing dan menerima jawaban lengkap tiap alur;
  - aturan wajib isi setiap layar baru (termasuk "tidak sarapan" dan cemilan "jarang");
  - urutan layar untuk keenam alur (baru/lama × tiga tujuan);
  - tabel kebiasaan, termasuk bangun 05.00, tidur 23.00 dan 01.00, beberapa catatan di jam yang sama, dan catatan di bawah tabel;
  - teks customer tidak memuat "pasien" atau "berobat".
- **Integrasi:**
  - kirim booking versi 2 (Slimming dan gizi klinik), dengan berat/tinggi di kolom bertipe dan `activityDate` kosong;
  - dokter membaca isian versi 1 **dan** versi 2;
  - usulan "Setujui ke data pasien" dari kedua versi;
  - resepsionis tetap tanpa isi klinis;
  - gizi klinik tidak bisa memesan treatment;
  - migrasi `GIZI_KLINIK`.
- **E2E:** alur Slimming baru diperbarui untuk layar T1 dan F1–F7. Ditambah satu alur gizi klinik sampai kode booking. Dokter melihat tabel kebiasaan di halaman isian.

## 10. Dokumen yang ikut berubah

- Spec 2026-09-28: baris Status mencatat bahwa isi kuis bagian 3.2 digantikan versi 2 oleh spec ini.
- PRD: Lampiran C merujuk spec ini untuk kuis versi 2.
- Runbook bagian 4: catatan rollback (bagian 8 di atas).

## 11. Di luar cakupan

- **Kedatangan di klinik (check-in front office)**, sub-proyek berikutnya dengan spec tersendiri:
  - konfirmasi kedatangan oleh front office;
  - **NIK** pasien, ditanyakan front office saat tiba dan tidak pernah di situs;
  - pencocokan pasien lama/baru memakai NIK dan seluruh data diri, bukan hanya WA;
  - kuis di tablet klinik atau QR, untuk customer yang belum punya isian;
  - **food recall H-1** digital, dengan tabel per jam untuk dokter.

  Bagian QR/tablet dari Plan 3b-2b pindah ke sub-proyek ini.
- Link WhatsApp untuk booking admin (sisa Plan 3b-2b) tetap mengikuti spec 2026-09-28 bagian 4, memakai kuis versi 2.
- Mencetak tabel dokter, dan mengubah isi tabel dari panel.
- Mengubah jawaban isian versi 1 yang sudah tersimpan.
