# Desain — Rekam Medis Bagian 2: Check-in di Klinik (NIK & Food Recall H-1)

- **Versi:** 1.0
- **Tanggal:** 3 Oktober 2026
- **Status:** Disetujui pemilik (3 Oktober 2026); dibangun lewat `docs/superpowers/plans/2026-10-03-plan-check-in-klinik.md`
- **Bagian dari:** pemecahan rekam medis (30 Sep 2026): 1 catatan dokter → **2 check-in klinik** → 3 BIA & grafik → 4 order ke apotek → 5 pengingat kontrol.
- **Melanjutkan:**
  - catatan dokter per kunjungan: `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md` (bagian 1);
  - kuis v2: `docs/superpowers/specs/2026-09-30-kuis-v2-form-recall-design.md` (V10: food recall H-1 ditanyakan saat tiba di klinik);
  - link kuis C3: `docs/superpowers/specs/2026-10-02-link-kuis-design.md`. Kuis lewat QR dan tablet klinik **sudah selesai di C3**, jadi tidak diulang di sini.

## 1. Latar belakang & tujuan

Saat customer datang, resepsionis menekan **Tandai hadir** di daftar booking, tanpa pemeriksaan apa pun. Akibatnya ada tiga celah.

- **Identitas tidak kuat.** Pasien lama dan baru masih dicocokkan lewat nomor WhatsApp, padahal satu nomor sering dipakai sekeluarga. NIK, identitas utama rekam medis elektronik, belum dicatat sama sekali.
- **Data diri bolong.** Pasien yang booking lewat WhatsApp atau telepon sering belum punya tanggal lahir, jenis kelamin, alamat, atau pekerjaan.
- **Food recall H-1 masih di kertas.** Sejak kuis v2, food recall sengaja tidak ditanyakan di kuis online, karena harus menggambarkan hari tepat sebelum konsultasi.

**Berhasil bila:**
- setiap pasien yang check-in punya NIK, atau alasan tertulis mengapa belum;
- satu NIK selalu satu pasien;
- resepsionis tidak lagi memakai lembar kertas food recall;
- dokter langsung melihat food recall kemarin sebagai tabel per jam saat membuka kunjungan, dan bisa menyalinnya ke bagian S.

## 2. Keputusan (dikonfirmasi pemilik, 3 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| CI1 | Siapa mengisi food recall | **Customer sendiri** di tablet klinik atau HP-nya, setelah check-in. Dokter bisa melengkapi |
| CI2 | Aturan NIK | **Wajib**, dengan pengecualian "Belum ada NIK" beralasan: Warga negara asing, Anak-anak, Lupa membawa KTP. Pasien tanpa NIK diberi tanda agar dilengkapi di kunjungan berikutnya |
| CI3 | Isi check-in selain NIK | Lengkapi data diri yang **masih kosong**, konfirmasi nomor WhatsApp, dan tawarkan food recall. Nama dan tanggal lahir **tidak** diperiksa terhadap KTP |
| CI4 | NIK sudah milik pasien lain | **Pindahkan ke pasien lama:** booking dan isian pasien rangkap pindah, pasien rangkap ditandai tidak dipakai. Hanya bila pasien rangkap belum punya catatan dokter |
| CI5 | Bentuk food recall | **Seperti "Aktivitas kemarin"** di kuis lama: baris jam + jenis + isi; dokter melihat tabel 06.00–22.00 |
| CI6 | Food recall ke catatan dokter | **Tabel lampiran kunjungan**, ditambah tombol **Salin ke S** |
| CI7 | Pendekatan | **Dialog check-in di daftar booking** + link food recall per booking dengan mekanisme link kuis C3. Tanpa halaman antrean tersendiri |

## 3. Check-in di meja depan

### 3.1 Tombol & dialog

**Tandai hadir** diganti **Check-in** di setiap tempat aksi itu muncul sekarang, untuk semua layanan termasuk Aesthetic. Aksinya berlaku untuk booking berstatus yang sama seperti Tandai hadir hari ini. **Tidak hadir** tidak berubah.

Check-in membuka dialog dengan urutan berikut.

1. **Ringkasan booking:** nama, tanggal dan jam, layanan, tenaga.
2. **NIK** (bagian 3.2).
3. **Data diri yang masih kosong:** tanggal lahir, jenis kelamin, alamat, pekerjaan. Hanya kolom yang kosong yang ditampilkan, dan kolom yang sudah terisi tidak diubah di dialog ini.
4. **Nomor WhatsApp:** sudah terisi dan bisa dikoreksi, dengan catatan "Pastikan masih aktif untuk pengingat kontrol". Nomornya diseragamkan seperti di tempat lain (`normalizeWhatsapp`).
5. **Tombol Check-in.** Dalam satu transaksi:
   - data pasien disimpan;
   - booking menjadi **Hadir** dan `checkedInAt` diisi;
   - bila food recall ditawarkan (bagian 4.1), barisnya dibuat;
   - semuanya tercatat di jejak audit.
6. Bila food recall ditawarkan, dialog berlanjut ke langkah **Food recall** (bagian 4.2). Bila tidak, dialog tertutup dengan pesan "{nama} sudah check-in."

### 3.2 NIK: aturan & pemeriksaan

- **Pasien belum punya NIK:** kolom NIK 16 angka wajib diisi. Pilihan lainnya **Belum ada NIK** dengan alasan *Warga negara asing*, *Anak-anak*, atau *Lupa membawa KTP*.
- **Pasien sudah punya NIK:** NIK ditampilkan dengan tombol **Ubah**. Pasien yang sebelumnya "Belum ada NIK" diminta lagi (bagian 3.4).
- **Pemeriksaan bentuk:**
  - harus tepat 16 angka; spasi dan titik yang ikut tertempel dibuang;
  - nilai lain ditolak dengan pesan "NIK harus 16 angka".
- **Pemeriksaan kecocokan** (peringatan, tidak menghalangi). Angka ke-7 sampai ke-12 NIK memuat tanggal, bulan, dan dua digit tahun lahir; tanggal ditambah 40 untuk perempuan.
  - Bila tanggal lahir atau jenis kelamin yang tersimpan (atau yang baru diisi di dialog) tidak cocok, muncul peringatan "Tanggal lahir/jenis kelamin di NIK berbeda dengan data pasien — periksa KTP".
  - Kode wilayah dan nomor urut tidak diperiksa.

### 3.3 NIK bentrok & pasien rangkap

Bila NIK yang diketik sudah tersimpan di pasien lain, dialog berhenti dan menampilkan pemilik NIK itu: nama, no. RM, tanggal lahir, nomor WhatsApp, dan kunjungan terakhir. Ada dua pilihan.

- **Ini orang yang sama — pindahkan.** Dalam satu transaksi:
  - semua booking dan isian pasien rangkap pindah ke pasien pemilik NIK;
  - pasien rangkap diberi `mergedIntoId` = pasien lama.

  Sesudah itu dialog melanjutkan check-in **dengan data pasien lama**; data diri pasien rangkap tidak disalin.

  Syaratnya, pasien rangkap **belum punya data klinis**:
  - tidak punya kunjungan (catatan dokter final maupun draf);
  - alergi, riwayat penyakit, dan catatan penting kosong.

  Bila syarat tidak terpenuhi, tombol tidak tersedia dan dialog menulis "Pasien ini sudah punya catatan dokter. Hubungi Super Admin untuk menggabungkan data."
- **Bukan — periksa lagi NIK-nya.** Kembali ke kolom NIK.

**Pasien rangkap:**
- tidak muncul di pencarian pasien, pemilih pasien booking, maupun pencocokan isian;
- halaman detailnya menampilkan "Pasien ini rangkap dari {no. RM pasien lama}", dengan tautan ke pasien lama.

### 3.4 NIK di data pasien

- Halaman data pasien menampilkan NIK. Formulir data diri yang sudah ada mendapat kolom NIK dan pilihan "Belum ada NIK", dengan aturan dan pemeriksaan yang sama seperti bagian 3.2.
- Pasien dengan "Belum ada NIK" mendapat tanda **NIK belum ada (alasan)** di halaman detail dan di dialog check-in berikutnya. Di check-in berikutnya kolom NIK kembali diminta, dan alasan boleh dipilih lagi.
- Pencarian di Data Pasien juga mencari NIK.
- NIK **tidak pernah** tampil di situs publik, kuis, pesan WhatsApp, atau link mana pun.

## 4. Food recall untuk customer

### 4.1 Kapan ditawarkan

Langkah food recall di dialog check-in punya kotak centang **Tawarkan food recall**.
- **Tercentang otomatis** bila tujuan isian booking itu Slimming atau gizi klinik, atau pasien punya paket program aktif (`activePackageId`).
  - `activePackageId` belum diisi oleh fitur mana pun. Selama itu, pasien lama yang booking lewat WhatsApp tanpa isian baru tidak tercentang otomatis, dan resepsionis mencentangnya sendiri.
- **Tidak tercentang** untuk booking lain, tetapi resepsionis boleh mencentangnya.

Bila tercentang, check-in membuat baris food recall berstatus **Ditawarkan**.

### 4.2 Link & masa berlaku

- **Tiga cara membuka form**, seperti C3:
  - **QR** di dialog, untuk HP customer;
  - **Buka di tablet**, yang membuka tab baru;
  - **Kirim lewat WA**, berupa pesan berisi link ke nomor pasien.
- **Bentuk link:** `sundyclinic.com/food-recall#<kode>`.
  - Kode = ID food recall + tanda tangan HMAC-SHA256 dengan kunci turunan `BETTER_AUTH_SECRET` berlabel khusus food recall. Link kuis tidak bisa membuka food recall dan sebaliknya.
  - Kode ada setelah `#`, jadi tidak pernah terkirim ke server dan tidak tercatat di log nginx maupun Cloudflare. Halaman meminta isinya lewat aksi server, seperti `/isi`.
- **Link berlaku** bila semua syarat terpenuhi:
  - tanda tangan cocok;
  - booking berstatus Hadir (finalisasi catatan dokter mengubahnya menjadi Selesai);
  - hari ini (WITA) sama dengan **tanggal booking**;
  - catatan dokter kunjungan itu belum final;
  - dokter belum melengkapi tabel (bagian 5.3).
- **Pesan bila tidak berlaku:**
  - "Link sudah tidak berlaku. Silakan tanyakan ke resepsionis." untuk link yang kedaluwarsa atau tidak valid;
  - "Food recall Anda sudah diterima dokter." bila dokter sudah melengkapi atau catatan sudah final.
- Selama berlaku, customer boleh mengirim ulang; kiriman terbaru menggantikan isian sebelumnya.
- `/food-recall` tidak diindeks (`noindex`, `Disallow` di robots) dan memakai pembatas laju serta penjaga permintaan yang sama dengan `/isi`.

### 4.3 Form

- **Satu halaman** untuk HP dan tablet, bergaya kuis `/daftar` (tanpa gerak situs publik).
- **Judul:** "Apa saja yang Anda makan, minum, dan lakukan **kemarin, {hari, tanggal}**?". Tanggalnya selalu **sehari sebelum tanggal booking**.
- **Data yang tampil:** hanya **nama depan** customer, karena tablet dipakai bergantian.
- **Baris aktivitas**, sama seperti "Aktivitas kemarin" kuis v1:
  - **jam** 06.00–22.00, **jenis** (Makan/minum, Kapsul/obat, Olahraga), dan **isi** (paling banyak 200 karakter);
  - tombol **+ Tambah** dan **Hapus**;
  - minimal 1 baris, paling banyak 40 baris;
  - urutan bebas, dokter melihatnya terurut per jam.
- **Pemberitahuan:** "Catatan ini hanya dibaca dokter SunDY untuk konsultasi Anda", dengan tautan ke Kebijakan Privasi.
- **Tanpa draf** di perangkat (tidak ada localStorage), karena tablet dipakai bergantian.
- **Setelah Kirim:** layar "Terima kasih, dokter akan melihatnya saat konsultasi", tanpa menampilkan ulang isian. Tombol **Selesai** membuka `/food-recall` tanpa kode ("Buka link dari klinik untuk mengisi"), supaya customer berikutnya tidak melihat apa pun.

### 4.4 Di sisi resepsionis

- Baris booking hari itu menampilkan tanda **Food recall: belum diisi** atau **Food recall: sudah diisi**.
- Resepsionis **tidak bisa melihat isinya**, karena itu catatan klinis (PRD bagian 4).
- Aksi **Food recall** di baris booking membuka lagi langkah QR/tablet/WA selama link masih berlaku. Untuk booking yang sudah check-in tanpa food recall, aksi ini menawarkannya dan membuat barisnya.

## 5. Food recall di halaman kunjungan dokter

### 5.1 Tab "Food recall"

- **Letak:** tab baru di panel kiri halaman kunjungan, di samping Isian kuis, Sebelumnya, dan Tren.
- **Isi:**
  - judul tanggal ("Kemarin, Kamis 2 Oktober");
  - **tabel 06.00–22.00** dengan tampilan yang sama seperti tabel "Aktivitas kemarin";
  - jam kirim, dan tanda **diisi customer** atau **dilengkapi dokter** per baris.
- **Tab terpilih otomatis** saat halaman dibuka bila food recall sudah diisi dan catatan masih draf.
- **Bila belum diisi**, tab menulis "Customer belum mengisi food recall" dengan tombol untuk membuka QR/tablet/WA.
- **Bila tidak ditawarkan**, tab menulis "Food recall tidak ditawarkan saat check-in" dengan tombol **Tawarkan sekarang**.
- Isian v1 "Aktivitas kemarin" (kuis lama) tetap tampil di tab Isian kuis seperti sekarang.

### 5.2 Salin ke S

- **Salin ke S** menambahkan ringkasan di **akhir** kolom S draf, satu catatan per baris, terurut per jam:
  > Food recall H-1 (Kamis 2 Okt): 07.00 Makan/minum — nasi kuning 1 piring, teh manis; 12.00 Kapsul/obat — Kapsul M; …
- Dokter bebas menyuntingnya setelah disalin.
- Bila S sudah memuat baris pembuka yang sama ("Food recall H-1 ({tanggal})"), tombol meminta konfirmasi dulu supaya tidak tersalin dua kali.
- Tombol ini tidak tersedia setelah catatan final.

### 5.3 Dokter melengkapi

- Selama catatan masih draf, dokter (record:write) bisa menambah, mengubah, dan menghapus baris di tab itu, dengan penyunting yang sama dengan form customer. Contohnya bila customer tidak membawa HP atau kesulitan mengisi.
- Baris yang ditambah atau diubah dokter ditandai **dilengkapi dokter**.
- Bila belum ada baris food recall, simpanan pertama dokter membuatnya.
- **Begitu dokter menyimpan, link customer ditutup** ("Food recall Anda sudah diterima dokter"), supaya kiriman customer tidak menimpa tambahan dokter.

### 5.4 Terkunci saat final

Finalisasi catatan dokter ikut mengunci food recall kunjungan itu. Kuncinya dijaga trigger PostgreSQL, sama seperti `appointment_record_locked`: baris food recall tidak bisa diubah atau dihapus setelah kunjungannya final. Adendum tidak mengubah food recall.

### 5.5 Kunjungan sebelumnya & daftar pasien hari ini

- **Riwayat:** tab Sebelumnya dan riwayat kunjungan di halaman pasien menampilkan food recall setiap kunjungan sebagai tabel yang bisa dilipat.
- **Daftar pasien hari ini** milik dokter menampilkan tanda kecil **food recall ✓** bagi customer yang sudah mengisi.

## 6. Data & teknis

### 6.1 Model (migrasi aditif)

Semua kolom baru boleh kosong, sehingga rilis lama tetap berjalan selama `deploy.sh` memigrasi sebelum build.

- **`Patient`:**
  - `nik String? @unique`;
  - `nikMissingReason NikMissingReason?` (`WARGA_ASING`, `ANAK`, `LUPA_KTP`);
  - `mergedIntoId String?` (relasi ke `Patient`), berindeks.
  - CHECK di database: `nik` berbentuk tepat 16 angka; `nik` dan `nikMissingReason` tidak terisi bersamaan; `mergedIntoId` tidak menunjuk dirinya sendiri.
- **`Appointment`:** `checkedInAt DateTime?`.
- **`FoodRecall` (baru):**
  - `id`;
  - `appointmentId` unik (satu per booking);
  - `recallDate @db.Date` (tanggal booking − 1 hari, WITA);
  - `status FoodRecallStatus` (`DITAWARKAN`, `DIISI`);
  - `entries Json`: baris `{ hour, kind, text, by: "CUSTOMER" | "DOKTER" }`, bentuknya dikunci skema Zod;
  - `submittedAt` (kiriman customer terakhir), `completedByStaffId` dan `completedAt` (suntingan dokter terakhir);
  - `createdAt`, `updatedAt`.
- **Trigger** `food_recall_locked`: menolak UPDATE/DELETE pada `FoodRecall` bila `Encounter` booking itu berstatus final.

### 6.2 Hak akses

| Aksi | Kemampuan |
|---|---|
| Check-in, NIK, data diri, nomor WA, pindah pasien rangkap, tawarkan food recall, buka QR/link | `booking:manage` (resepsionis, dokter, Super Admin) |
| Melihat status "belum/sudah diisi" | `booking:manage` |
| Melihat isi food recall | `record:read` (dokter, Super Admin) |
| Melengkapi food recall, Salin ke S | `record:write` (dokter, Super Admin) |

Isi food recall tidak dikirim ke halaman atau komponen yang dibuka resepsionis.

### 6.3 Jejak audit

Dicatat dengan pola audit yang ada:
- `appointment.check-in`;
- perubahan NIK pada pasien, dengan nilai **disamarkan** (`••••••••••••0001`);
- `patient.merge-duplicate` (pasien rangkap → pasien lama, jumlah booking dan isian yang dipindah);
- kiriman food recall customer (pelaku: customer lewat link);
- suntingan food recall dokter.

Pembacaan isi food recall ikut audit baca catatan kunjungan yang sudah ada.

### 6.4 Link

Kode, tanda tangan, dan perbandingan waktu-konstan memakai pola `src/server/quiz-link-code.ts`, dengan label kunci terpisah (mis. `sundy:food-recall-link:v1`) dan ID food recall sebagai isi yang ditandatangani. Kode tidak disimpan di database.

## 7. Kasus khusus

| Kasus | Perilaku |
|---|---|
| Dua resepsionis meng-check-in booking yang sama bersamaan | Hanya satu yang berhasil (perpindahan status bersyarat). Yang lain mendapat "Booking ini sudah check-in." |
| Dua pasien diberi NIK yang sama bersamaan | Batasan unik database menolak yang kedua dengan pesan "NIK ini baru saja dipakai pasien lain — periksa lagi". |
| Check-in tidak pada tanggal booking (mis. baru dicatat besok) | Food recall tetap memakai H-1 dari tanggal booking. Link hanya berlaku pada tanggal booking, jadi langsung tidak berlaku; dokter bisa melengkapi sendiri. |
| Customer mengirim ulang setelah dokter melengkapi | Link menampilkan "Food recall Anda sudah diterima dokter" dan kiriman ditolak. |
| Pasien rangkap sudah punya catatan dokter atau data klinis | Tombol pindah tidak tersedia; dialog meminta menghubungi Super Admin. |
| Booking dibatalkan atau ditandai tidak hadir setelah food recall ditawarkan | Link tidak berlaku (status booking bukan Hadir). Baris food recall tetap tersimpan. |
| Tablet dibiarkan terbuka setelah Kirim | Layar terima kasih tidak menampilkan isian; Selesai membuka halaman kosong tanpa kode. |
| Pasien "Belum ada NIK" check-in lagi | Kolom NIK diminta lagi; resepsionis boleh memilih alasan lagi. |

## 8. Pengujian

**Unit**
- Pemeriksaan NIK:
  - 16 angka, pembersihan spasi/titik;
  - pembacaan tanggal lahir dan jenis kelamin (tanggal +40 untuk perempuan);
  - peringatan tidak cocok.
- Tanggal H-1 dari tanggal booking (WITA), termasuk awal bulan dan awal tahun.
- Teks Salin ke S, termasuk urutan per jam dan deteksi salinan ganda.
- Syarat pindah pasien rangkap.
- Komponen:
  - dialog check-in (kolom kosong saja, Belum ada NIK, NIK bentrok);
  - form food recall (tambah/hapus baris, batas 40, layar terima kasih tanpa isian);
  - tab Food recall (tabel, Salin ke S, mode draf/final);
  - tanda status di baris booking tanpa isi.

**Integrasi**
- Check-in dalam satu transaksi: status Hadir, `checkedInAt`, data pasien, baris food recall.
- Check-in bersamaan.
- NIK unik.
- Pindah pasien rangkap memindahkan booking dan isian, dan menolak pasien dengan kunjungan atau data klinis.
- Masa berlaku link (tanggal, status, final, sudah dilengkapi dokter) dan kode lintas jenis (kode kuis ditolak).
- Trigger kunci saat final.
- Hak akses: resepsionis tidak bisa membaca isi food recall.

**E2E**
- Resepsionis check-in dengan NIK, lalu membuka food recall "di tablet". Customer mengisi dan mengirim. Dokter melihat tabel, menekan Salin ke S, dan finalisasi. Link lalu tidak berlaku dan food recall terkunci.
- NIK bentrok dengan pasien lain, lalu pindah ke pasien lama.

## 9. Di luar cakupan

- Timbang BIA dan grafik (rekam medis bagian 3).
- Integrasi SATUSEHAT.
- Membaca KTP lewat kamera atau NFC.
- Menggabungkan pasien yang sudah punya catatan dokter atau data klinis (manual oleh Super Admin).
- Halaman antrean "Kedatangan hari ini".
- Pemeriksaan nama dan tanggal lahir terhadap KTP (CI3).
