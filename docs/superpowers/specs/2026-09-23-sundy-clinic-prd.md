# PRD — Sistem Klinik SunDY (Situs Publik + Admin & Rekam Medis)

- **Versi:** 1.5
- **Tanggal:** 23 September 2026
- **Status:** Menunggu review pemilik
- **Klinik:** SunDY — Nutrition, Slimming & Wellness Clinic, Manado
- **Kontak resmi:** WhatsApp 0851-7222-8900 (+62 851-7222-8900) · Instagram @sundyclinic
- **Tagline:** "Happy weight, happy life" · "Your Beauty, Our Priority"

**Cabang**

| Cabang | Alamat | Status |
|---|---|---|
| SunDY Mahakeret | Jl. Garuda No. 10, Mahakeret Barat, Manado | Beroperasi — menerima booking |
| SunDY Citraland | Citraland — Cluster The Manhattan, Manado | Segera hadir — belum menerima booking |

**Jam operasional (kedua cabang):** Senin–Sabtu, 11.00–19.00 WITA. Minggu dan hari libur nasional tutup.

**Dokter:** Dr. Diane Paparang, Sp.GK, AIFO-K (praktik di SunDY Mahakeret). Sistem dirancang multi-dokter; untuk saat ini hanya satu dokter yang ditampilkan.

**Perubahan dari versi 1.0:** dukungan multi-cabang dinaikkan dari Fase 3 ke MVP; jam operasional, hari libur nasional, dan data dokter dikonfirmasi pemilik.

**Perubahan dari versi 1.1:** ditambahkan **Pengingat Kontrol Mingguan** (F17) — daftar kerja harian bagi admin untuk mengingatkan pasien program slimming lewat WhatsApp; keputusan hosting Vercel + Neon dicatat.

**Perubahan dari versi 1.2:** ditambahkan **batasan unik (dokter, waktu mulai)** pada Appointment dan SlotHold. Tanpa itu, pencegahan bentrok jadwal hanya berjalan di aplikasi dan masih dapat tertembus dua permintaan yang tiba bersamaan; nama lengkap dan gelar dokter dilengkapi.

**Perubahan dari versi 1.3:** jadwal beralih dari "milik klinik" menjadi **milik tenaga** (F4a). Dua jenis booking dengan durasi berbeda, layanan ditandai `requiresDoctor`, dan `Doctor` digantikan `Staff` berperan DOKTER/TERAPIS. **Batasan unik (dokter, waktu mulai) dari v1.3 dicabut** — batasan itu meloloskan treatment 15.00–16.00 yang bertindihan dengan konsultasi 15.30, dan digantikan *exclusion constraint* atas rentang waktu.

**Perubahan dari versi 1.4:** F9 diperluas — admin **membuat** janji temu sendiri, bukan hanya memverifikasi, karena mayoritas pasien akan tetap memesan lewat WhatsApp. Sumber booking dicatat (`SITUS` / `WHATSAPP` / `TELEPON` / `WALK_IN`), pasien baru dapat dibuat langsung dari form booking, dan ditegaskan bahwa booking **tidak pernah dihapus** — pembatalan adalah perubahan status.

---

## 1. Ringkasan Eksekutif

SunDY Clinic saat ini menjalankan pendaftaran dan skrining pasien lewat Google Form terpisah, dan seluruh komunikasi booking terjadi manual di WhatsApp. Katalog layanan tersebar di gambar promosi Instagram. Tidak ada tempat tunggal yang menyimpan riwayat klinis pasien, sehingga progres program slimming (yang sifatnya berbulan-bulan) sulit dievaluasi dokter secara objektif.

Produk ini menyatukan tiga hal dalam satu sistem:

1. **Situs publik** — etalase layanan aesthetic & program slimming lengkap dengan harga, katalog produk, dan **pendaftaran konsultasi mandiri** di mana pasien melihat slot dokter yang benar-benar kosong (contoh: Kamis 15.00 dan 17.00) lalu memilihnya sendiri.
2. **Panel admin** — pengelolaan jadwal dokter, verifikasi booking, dan pengelolaan konten katalog.
3. **Rekam medis elektronik** — riwayat kunjungan, catatan SOAP dokter, hasil Timbang BIA, treatment yang dijalani, dan **grafik progres berat badan & komposisi tubuh** per pasien.

**Hasil yang dikejar:** admin berhenti menjadi calendar manusia, dokter punya data objektif untuk evaluasi program, dan pasien bisa mendaftar jam 11 malam tanpa menunggu admin membalas.

---

## 2. Latar Belakang & Masalah

| Masalah hari ini | Dampak |
|---|---|
| Booking hanya via chat WhatsApp | Admin harus membalas satu per satu, cek buku jadwal manual, rawan double-booking dan salah catat. Di luar jam kerja, calon pasien menunggu atau batal. |
| Skrining pakai Google Form terpisah | Jawaban food recall berhenti di spreadsheet, tidak menempel di riwayat pasien, dan dokter harus membuka aplikasi lain saat konsultasi. |
| Riwayat klinis tersebar di catatan kertas / chat | Saat pasien kontrol bulan ke-3, dokter sulit membandingkan dengan kondisi bulan ke-1. Program slimming kehilangan bukti keberhasilan. |
| Harga & layanan hanya ada di gambar promosi | Calon pasien harus bertanya dulu ("berapa harga HIFU?"), menambah beban admin dan memperlambat keputusan. |
| Hasil Timbang BIA tidak terakumulasi | Nilai jual terbesar program (penurunan lemak, kenaikan massa otot) tidak bisa ditunjukkan sebagai grafik ke pasien. |
| Tidak ada yang melacak kapan pasien slimming harus kembali | Program slimming menuntut pasien datang **setiap minggu** untuk kontrol, Timbang BIA, inject, atau mengambil obat. Saat ini tidak ada daftar siapa yang jatuh tempo minggu ini, sehingga pasien yang lupa akan terus lupa. Setiap pasien yang berhenti di tengah jalan adalah pendapatan berulang yang hilang sekaligus program yang gagal. |

---

## 3. Sasaran & Ukuran Keberhasilan

### Sasaran produk
1. Pasien baru dapat menyelesaikan pendaftaran konsultasi sendiri dari HP dalam waktu di bawah 3 menit.
2. Seluruh kunjungan pasien tercatat di satu rekam medis yang dapat ditelusuri dokter.
3. Katalog layanan & harga dapat diperbarui admin sendiri tanpa bantuan developer.
4. Progres pasien program slimming dapat ditampilkan sebagai grafik saat konsultasi.
5. Admin memiliki daftar kerja harian berisi pasien slimming yang jatuh tempo kontrol, lengkap dengan tombol untuk mengingatkan lewat WhatsApp.

### Ukuran keberhasilan (dievaluasi 3 bulan setelah rilis)
| Metrik | Target |
|---|---|
| Booking yang masuk lewat situs (bukan chat manual) | ≥ 40% dari total booking |
| Waktu admin memproses satu booking | < 1 menit (dari sebelumnya percakapan bolak-balik) |
| Kunjungan yang punya catatan rekam medis lengkap | ≥ 90% |
| Double-booking slot dokter | 0 kejadian |
| Pasien slimming dengan minimal 2 kali pengukuran BIA di sistem | ≥ 70% |
| Pasien slimming jatuh tempo yang benar-benar diingatkan | ≥ 90% |
| Pasien slimming yang kembali dalam 10 hari sejak kunjungan terakhir | ≥ 70% |

### Bukan sasaran rilis ini (Non-Goals)
- Keranjang belanja, checkout, dan pengiriman produk (fase berikutnya).
- Pembayaran online otomatis lewat payment gateway.
- Aplikasi mobile native.
- Integrasi SATUSEHAT / BPJS.
- Login mandiri untuk pasien dengan dashboard pribadi.
- Telemedicine / konsultasi video.

---

## 4. Pengguna & Peran

| Peran | Siapa | Kebutuhan utama | Akses |
|---|---|---|---|
| **Calon pasien / pasien** | Publik, mayoritas dari Instagram, hampir semua lewat HP | Lihat layanan & harga, lihat slot kosong, daftar konsultasi, cek status booking | Situs publik saja. Tidak punya akun. |
| **Resepsionis / Admin Klinik** | Staf front office | Verifikasi booking masuk, atur ulang jadwal, daftarkan pasien walk-in, catat kehadiran, **menjalankan daftar pengingat kontrol mingguan** | Panel admin — data booking & demografi pasien **di cabang tempatnya ditempatkan**. **Tidak bisa membuka isi catatan klinis SOAP.** Pada daftar pengingat, resepsionis melihat *jenis* pengingat (mis. "Ambil obat") dan tanggal, tetapi bukan isi catatan dokter. |
| **Dokter** | Dokter klinik | Lihat jadwal hari ini, buka rekam medis pasien, isi SOAP, input hasil BIA, catat treatment & resep, lihat grafik progres | Panel admin — penuh atas rekam medis pasiennya. |
| **Super Admin / Pemilik** | Pemilik klinik | Kelola akun staf, kelola katalog & harga, atur jadwal dokter, lihat laporan | Seluruh panel admin + manajemen pengguna + audit log. |

---

## 5. Lingkup Rilis Pertama (MVP)

Disepakati masuk MVP:

- ✅ Situs publik: profil klinik, katalog treatment & paket + harga, halaman produk (tampilan saja, pemesanan diarahkan ke WhatsApp)
- ✅ Pendaftaran konsultasi mandiri dengan tampilan slot kosong per dokter
- ✅ Form skrining digital (pengganti Google Form "Recall Form")
- ✅ Panel admin: kelola jadwal dokter, verifikasi booking, kelola konten katalog
- ✅ Rekam medis pasien: riwayat kunjungan, SOAP, treatment, resep
- ✅ Grafik progres pasien (berat badan, % lemak tubuh, massa otot dari hasil BIA)
- ✅ **Dukungan multi-cabang** — dua lokasi, jadwal dokter per cabang, kunjungan tercatat per cabang
- ✅ **Pengingat kontrol mingguan** — daftar kerja harian admin + tombol WhatsApp per pasien slimming

**Catatan multi-cabang.** Satu katalog layanan & harga berlaku di seluruh cabang. **Rekam medis pasien menyatu lintas cabang** — pasien yang pernah datang ke Mahakeret dan kemudian ke Citraland tetap memakai satu nomor rekam medis dan satu timeline, karena dokternya sama dan kontinuitas perawatan adalah inti program slimming. Setiap kunjungan mencatat cabang tempat ia terjadi, sehingga laporan per cabang tetap bisa dibuat.

---

## 6. Fitur — Situs Publik

### F1. Beranda
Ringkasan klinik, empat nilai jual dari materi promosi (*Professional Treatment, Premium Technology, Safe & Hygienic, Beauty For You*), sorotan promo berjalan, testimoni, dan dua tombol aksi utama: **"Daftar Konsultasi"** dan **"Chat WhatsApp"**. Tombol WhatsApp mengambang tersedia di seluruh halaman.

### F2. Katalog Layanan
Dua kategori besar, masing-masing dengan halaman detail per layanan:

- **Aesthetic** — RF, Facial, HIFU, Botox, Peeling, Vitamin C, Dermapen, Elektrocauter, Skin Booster, Laser, Meso
- **Slimming & Wellness** — paket bulanan MAX / LUX / ACTIVE dan layanan satuan

Setiap layanan menampilkan: nama, deskripsi manfaat, foto, durasi perkiraan, **harga normal dicoret + harga promo** (mengikuti gaya materi promosi klinik), dan tombol "Daftar Konsultasi untuk layanan ini".

Halaman detail layanan dibuat ramah mesin pencari (URL sendiri, judul & deskripsi meta, data terstruktur), karena ini pintu masuk pasien yang mencari "HIFU Manado" atau "klinik slimming Manado".

### F3. Katalog Produk (tampilan saja)
Daftar produk klinik (kapsul, suplemen, skincare) dengan foto, deskripsi, dan harga. Tombol "Pesan via WhatsApp" membuka chat ke 0851-7222-8900 dengan pesan terisi otomatis menyebut nama produk. Tidak ada keranjang, stok, maupun checkout di rilis ini.

### F4. Jadwal & Ketersediaan Dokter
Halaman yang menampilkan kalender per dokter **pada cabang yang dipilih**. Pasien memilih tanggal, sistem menampilkan slot yang benar-benar kosong pada tanggal itu — contoh: `Kamis, 25 Sep — 15.00 ✓ · 16.00 (penuh) · 17.00 ✓`. Slot yang sudah lewat, sudah dipesan, jatuh di luar jam praktik dokter di cabang itu, atau jatuh pada hari libur tidak muncul sebagai pilihan.

**Aturan ketersediaan:**
- Zona waktu sistem: **WITA (Asia/Makassar, UTC+8)**. Seluruh waktu disimpan dalam UTC dan ditampilkan dalam WITA.
- Jam operasional: **Senin–Sabtu 11.00–19.00**. Minggu tutup.
- **Hari libur nasional tutup.** Sistem membawa daftar hari libur nasional & cuti bersama Indonesia per tahun (mengacu SKB 3 Menteri), dapat disunting dan ditambah admin. Tanggal yang ditandai libur tidak memunculkan slot apa pun di seluruh cabang.
- Booking paling cepat: **2 jam** dari sekarang.
- Booking paling jauh: **30 hari** ke depan.
- Durasi slot default: **30 menit** untuk konsultasi (dapat diatur per dokter per cabang).
- Ketersediaan dihitung per kombinasi **dokter × cabang**: seorang dokter tidak dapat memiliki dua slot bersamaan di cabang berbeda, sehingga booking di satu cabang otomatis menutup jam yang sama di cabang lain.
- Saat pasien memilih slot, slot ditahan sementara (**hold 10 menit**) agar tidak direbut pasien lain selama pengisian form. Hold yang kedaluwarsa otomatis dilepas.
- **Jaminan akhir ada di basis data,** bukan di aplikasi: *exclusion constraint* menolak dua booking dengan rentang waktu bertindihan pada tenaga yang sama. Perhitungan slot dan penahanan di atas menjaga pengalaman pasien tetap wajar; batasan basis data yang menjaga datanya tetap benar. Lihat **Catatan integritas slot** pada bagian 9.

**Data awal:** Dr. Diane Paparang, Sp.GK, AIFO-K — SunDY Mahakeret, Senin–Sabtu 11.00–19.00. SunDY Citraland belum memiliki jadwal dokter sehingga tidak dapat dipilih saat booking.

### F4a. Dua Jenis Booking & Jalur Jadwal

Klinik menjalankan dua jenis janji temu dengan durasi berbeda, dan keduanya tidak selalu memakai orang yang sama.

| Jenis | Durasi | Contoh |
|---|---|---|
| **Konsultasi dokter** | 30 menit | Konsultasi program slimming, kontrol mingguan, Timbang BIA |
| **Treatment kecantikan** | 60 menit (mengikuti durasi layanan) | Facial, peeling, RF, HIFU, botox, laser |

Pada rentang 15.00–16.00, artinya klinik dapat menerima **dua konsultasi** (15.00 dan 15.30) **atau satu treatment** — tergantung siapa yang mengerjakan.

**Jadwal dimiliki tenaga, bukan klinik.** Dr. Diane punya antreannya sendiri, terapis punya antreannya sendiri, dan keduanya berjalan paralel. Konsekuensinya:

- Facial yang dikerjakan terapis pukul 15.00 **tidak** menutup konsultasi Dr. Diane pukul 15.00.
- Botox yang harus dikerjakan dokter pukul 15.00 **menutup** konsultasi pukul 15.00 dan 15.30, karena Dr. Diane sedang tidak tersedia.

Karena itu setiap layanan membawa penanda **`requiresDoctor`**. Penanda inilah yang menentukan antrean mana yang terpakai saat pasien memesan layanan tersebut. Salah menandai satu layanan berakibat langsung: layanan yang seharusnya butuh dokter akan tampak tersedia padahal dokternya sedang menangani pasien lain.

**Usulan pembagian — perlu dikonfirmasi pemilik (keputusan D10).**

| Dikerjakan terapis | Harus dokter |
|---|---|
| Relaxing Facial, Facial Brightening, Facial Acne | Konsultasi Dokter |
| Peeling, Peeling Premium | Botox |
| RF Perut, RF Paha, RF Lengan, RF Wajah | Skin Booster HA, DNA Salmon, Eyebooster |
| Timbang BIA | Injek & Infus Vitamin C |
| | Dermapen, Dermapen PRP |
| | Elektrocauter |
| | Meso Treatment |
| | HIFU Wajah, HIFU Miss V, HIFU Perut |
| | Laser Rejuve/Fleck, Laser 2 in 1, Lip Laser |
| | Meal Plan |

Dasar usulan: tindakan yang menembus kulit (injeksi, infus, PRP, mesoterapi), membakar jaringan (elektrocauter), atau memakai energi terarah (HIFU, laser) ditempatkan pada dokter; perawatan permukaan kulit ditempatkan pada terapis. Ini penilaian dari sisi keamanan prosedur, bukan dari cara klinik Anda benar-benar membagi pekerjaan — mohon dikoreksi.

**Tanpa jeda antar treatment.** Booking berikutnya boleh dimulai tepat pada menit treatment sebelumnya selesai. Treatment 15.00–16.00 membuat slot 16.00 langsung tersedia, bukan 16.15. Ini menyederhanakan perhitungan slot: rentang waktu booking sama persis dengan durasi layanan, tanpa penambahan tersembunyi.

**Pasien baru vs pasien lama.** Pasien baru hanya dapat memesan **konsultasi dokter**; treatment ditentukan dokter setelah pemeriksaan. Pasien yang sudah pernah datang boleh langsung memilih treatment beserta durasinya.

Situs publik **tidak** memeriksa status pasien dari nomor WhatsApp yang dimasukkan. Pemeriksaan semacam itu memungkinkan siapa pun menebak nomor untuk mengetahui apakah seseorang pernah berobat di sini — kebocoran privasi yang tidak sebanding dengan manfaatnya. Sebagai gantinya, form menawarkan kedua pilihan kepada semua orang, disertai keterangan bahwa treatment hanya untuk pasien yang sudah pernah konsultasi. Admin memverifikasinya pada langkah konfirmasi WhatsApp yang memang sudah ada, sehingga tidak menambah pekerjaan baru.

### F5. Pendaftaran Konsultasi
Alur 4 langkah, mobile-first:

1. **Tujuan & lokasi** — Slimming / Aesthetic / Lainnya, opsional memilih layanan yang diminati, lalu memilih cabang. Cabang Citraland tampil dengan label **"Segera Hadir"** dan tidak dapat dipilih; di bawahnya tersedia tautan "Beri tahu saya saat buka" yang mengarah ke WhatsApp klinik. Selama hanya satu cabang aktif, langkah ini otomatis memilih Mahakeret dan tidak menambah klik bagi pasien.
2. **Pilih dokter & jadwal** — pilih dokter tertentu atau "dokter mana saja yang tersedia" di cabang itu, lalu pilih tanggal & slot.
3. **Data diri** — nama lengkap, nomor WhatsApp, tanggal lahir, jenis kelamin, pekerjaan, alamat, keluhan/tujuan. Untuk tujuan Slimming, ditambah **form skrining**: berat badan, tinggi badan, dan food recall harian (makanan utama, snack, minuman, cemilan) — konten diambil dari Google Form yang berjalan sekarang.
4. **Konfirmasi** — sistem menampilkan ringkasan, persetujuan penggunaan data pribadi, lalu menerbitkan **kode booking** (format `SDY-XXXX`).

Setelah submit, pasien diarahkan ke halaman sukses berisi kode booking, detail jadwal, instruksi pembayaran, dan tombol besar **"Konfirmasi via WhatsApp"**. Tombol ini membuka chat ke 0851-7222-8900 dengan pesan terisi otomatis:

> *Halo SunDY Clinic, saya sudah booking konsultasi. Kode: SDY-8F3K, atas nama Siti Rahayu, dengan Dr. Diane Paparang, Sp.GK, AIFO-K di cabang Mahakeret, Kamis 25 Sep 2026 pukul 15.00. Berikut bukti transfernya.*

Pasien mengirim bukti transfer di chat tersebut, admin memverifikasi di panel.

### F6. Cek Status Booking
Halaman publik: masukkan **kode booking + 4 digit terakhir nomor WhatsApp** untuk melihat status (Menunggu Konfirmasi / Terkonfirmasi / Selesai / Dibatalkan), detail jadwal, dan tombol batalkan (paling lambat 2 jam sebelum jadwal, selaras dengan batas minimum pemesanan; di bawah itu pasien diarahkan menghubungi admin). Tidak ada data klinis yang ditampilkan di halaman ini.

### F7. Halaman Lokasi & Pendukung

**Halaman lokasi** — satu halaman berisi kedua cabang:

- **SunDY Mahakeret** — Jl. Garuda No. 10, Mahakeret Barat, Manado. Senin–Sabtu 11.00–19.00. Peta, tombol "Petunjuk Arah", tombol "Daftar Konsultasi".
- **SunDY Citraland** — Citraland, Cluster The Manhattan, Manado. Ditandai **"Segera Hadir"** dengan peta lokasi dan tombol "Beri tahu saya saat buka" ke WhatsApp klinik.

Setiap cabang memiliki URL sendiri agar dapat dioptimalkan untuk pencarian lokal ("klinik kecantikan Mahakeret", "klinik slimming Citraland Manado").

**Halaman pendukung** — Tentang klinik & tim dokter (Dr. Diane Paparang, Sp.GK, AIFO-K), jam operasional, FAQ, Kebijakan Privasi, dan Syarat & Ketentuan.

---

## 7. Fitur — Panel Admin

### F8. Dasbor
Booking hari ini, booking yang menunggu verifikasi, jadwal per dokter hari ini, dan ringkasan angka minggu berjalan.

### F9. Manajemen Booking

Daftar booking dengan filter (tanggal, **cabang**, tenaga, status), tersedia sebagai tabel maupun tampilan kalender harian.

**Admin membuat booking sendiri, bukan hanya memverifikasi.** Mayoritas pasien akan tetap memesan lewat WhatsApp atau menelepon, apa pun yang tersedia di situs. Pendaftaran mandiri di situs publik adalah tambahan, bukan pengganti. Karena itu panel admin harus dapat mencatat janji temu dari nol secepat menulis di buku — kalau tidak, admin akan kembali ke buku.

**Aksi yang tersedia:**

| Aksi | Keterangan |
|---|---|
| **Buat** | Pilih pasien (atau buat pasien baru saat itu juga), cabang, tenaga, layanan, tanggal & jam. Sistem menolak jam yang bentrok. |
| **Ubah** | Ganti layanan, tenaga, atau catatan. Perubahan layanan ikut menyesuaikan durasi. |
| **Jadwal ulang** | Pindah ke jam lain, tetap melewati pemeriksaan bentrok pada jam tujuan. |
| **Verifikasi** | Menunggu Konfirmasi → Terkonfirmasi, setelah bukti transfer diterima. |
| **Tandai hadir / tidak hadir** | Mengubah status pada hari kunjungan. |
| **Batalkan** | Mengubah status menjadi Dibatalkan dan melepas slotnya. |

**Booking tidak pernah dihapus.** Pembatalan adalah perubahan status, bukan penghapusan baris. Janji temu adalah catatan kegiatan klinik: menghapusnya menghilangkan riwayat siapa pernah dijadwalkan kapan, memutus tautan ke rekam medis yang mungkin sudah dibuat, dan membuat jejak audit menunjuk ke baris yang tidak ada lagi. Yang tampak sebagai "hapus" di antarmuka selalu berarti "batalkan".

**Sumber booking dicatat** sebagai `SITUS`, `WHATSAPP`, `TELEPON`, atau `WALK_IN`. Tanpa pembedaan ini, sasaran "≥ 40% booking masuk lewat situs" pada bagian 3 tidak dapat diukur — dan pemilik tidak akan tahu apakah situs benar-benar mengurangi beban admin atau hanya memindahkannya.

**Pasien baru dibuat langsung dari form booking.** Admin yang sedang menerima telepon tidak boleh dipaksa membuka halaman lain untuk mendaftarkan pasien dulu. Cukup nama dan nomor WhatsApp; sisanya dilengkapi saat pasien datang.

Setiap booking terkonfirmasi menyediakan teks konfirmasi siap-salin untuk dikirim admin lewat WhatsApp.

### F10. Manajemen Jadwal Dokter
- **Template mingguan** per **dokter per cabang**: data awal — Dr. Diane Paparang, Sp.GK, AIFO-K, SunDY Mahakeret, Senin–Sabtu 11.00–19.00, slot 30 menit. Admin dapat menambah baris untuk cabang atau dokter baru tanpa bantuan developer.
- **Pengecualian tanggal**: cuti dokter, jam tambahan, atau blokir sebagian jam.
- **Kalender hari libur**: daftar hari libur nasional & cuti bersama per tahun yang dapat disunting admin. Tanggal libur menutup slot di seluruh cabang sekaligus, sesuai kebijakan klinik ("tanggal merah tutup").
- Sistem menolak template yang membuat satu dokter berada di dua cabang pada jam yang sama.
- Perubahan template tidak membatalkan booking yang sudah terkonfirmasi; sistem menandai bentrokan agar admin menyelesaikannya secara sadar.

### F11. Manajemen Pasien
Pencarian pasien berdasarkan nama, nomor WhatsApp, atau nomor rekam medis. Setiap pasien punya **nomor rekam medis** otomatis berformat `SDY-2026-0001`. Sistem mendeteksi kemungkinan duplikat berdasarkan nomor WhatsApp dan menawarkan penggabungan.

### F12. Rekam Medis Elektronik
Halaman pasien berisi timeline kunjungan. Per kunjungan (encounter), dokter mengisi:

- **S (Subjective)** — keluhan, riwayat, hasil form skrining/food recall bila ada
- **O (Objective)** — pemeriksaan fisik, tanda vital, **hasil Timbang BIA**
- **A (Assessment)** — penilaian/diagnosis
- **P (Plan)** — rencana tindakan, paket program yang dijalankan, resep

Ditambah data yang melekat pada pasien (bukan per kunjungan): alergi, riwayat penyakit, obat rutin, catatan penting — ditampilkan sebagai banner peringatan di setiap kunjungan.

**Pencatatan treatment:** treatment yang dijalankan, area tubuh, dosis bila relevan (contoh: Botox 12 unit area dahi), pelaksana, dan catatan pasca-tindakan.

**Pencatatan hasil BIA:** tanggal, berat (kg), tinggi (cm), BMI, persen lemak tubuh, massa otot (kg), lemak visceral, persen air tubuh, BMR.

**Aturan integritas:** catatan klinis yang sudah difinalisasi tidak dapat dihapus. Koreksi dilakukan lewat **adendum** yang tercatat waktu dan penulisnya, mengikuti prinsip rekam medis.

### F13. Grafik Progres Pasien
Grafik garis dari seluruh pengukuran BIA pasien: berat badan, persen lemak tubuh, dan massa otot terhadap waktu, dengan penanda kapan program dimulai. Dapat ditampilkan ke pasien saat konsultasi dan diekspor sebagai gambar/PDF untuk dibagikan.

### F14. Manajemen Konten & Cabang
CRUD untuk kategori layanan, layanan (termasuk harga normal & harga promo, durasi, foto), paket slimming beserta isinya, produk, dokter, banner promo, dan FAQ. Semua dapat dikelola pemilik tanpa developer.

**Manajemen cabang**: nama, alamat, titik peta, nomor WhatsApp (bila nanti berbeda per cabang), jam operasional, dan **status** — `AKTIF` (bisa dibooking) atau `SEGERA_HADIR` (tampil di situs, tidak bisa dibooking). Mengaktifkan cabang Citraland nanti cukup dengan mengubah status dan mengisi jadwal dokternya, tanpa perubahan kode.

Katalog layanan, paket, dan harga bersifat global — satu kali ubah, berlaku di seluruh cabang.

### F15. Manajemen Pengguna & Audit
Pembuatan akun staf beserta perannya. **Audit log** mencatat siapa membuka, membuat, atau mengubah rekam medis mana dan kapan — wajib untuk rekam medis elektronik dan tidak dapat dihapus dari antarmuka.

### F16. Laporan Sederhana
Jumlah kunjungan per periode, layanan terpopuler, tingkat ketidakhadiran (no-show), pasien baru vs kunjungan ulang, dan ekspor CSV. Seluruh laporan dapat disaring **per cabang** maupun digabung, sehingga performa Citraland dapat dibandingkan dengan Mahakeret begitu cabang kedua beroperasi.

---

### F17. Pengingat Kontrol Mingguan

Program slimming hanya berhasil bila pasien datang setiap minggu. Fitur ini mengubah "semoga pasien ingat" menjadi daftar kerja yang jelas: admin membuka satu halaman, melihat siapa yang jatuh tempo, dan menekan tombol.

**Siapa yang masuk daftar.** Hanya pasien yang sedang menjalani **program slimming** (paket MAX / LUX / ACTIVE). Pasien aesthetic tidak diingatkan otomatis di rilis ini.

**Kapan pengingat muncul.** Setiap kunjungan pasien slimming yang difinalisasi otomatis menjadwalkan kontrol berikutnya **7 hari** kemudian. Pengingat muncul di daftar kerja **H-1**, yaitu sehari sebelum tanggal kontrol.

**Aturan hari libur.** Klinik tutup Minggu dan tanggal merah. Bila H-1 jatuh pada hari tutup, pengingat **dimajukan ke hari kerja terakhir sebelumnya**. Contoh: pasien kontrol Senin 28 Sep, jatuh tempo Senin 5 Okt, H-1 adalah Minggu 4 Okt — klinik tutup, maka pengingat muncul **Sabtu 3 Okt**. Tanpa aturan ini, setiap pasien yang kontrol hari Senin akan terlewat setiap minggu.

**Halaman daftar kerja** (`Pengingat`) berisi empat kelompok:

| Kelompok | Isi |
|---|---|
| **Hari ini** | Pengingat yang jatuh tempo hari ini dan belum dikirim |
| **Terlambat** | Sudah lewat tanggalnya tetapi belum pernah dikirim — ditampilkan paling atas dengan penanda merah |
| **Sudah diingatkan** | Sudah dikirim, menunggu pasien datang |
| **Minggu ini** | Pratinjau 7 hari ke depan, agar admin dapat mencicil |

Setiap baris menampilkan: nama pasien, nomor WhatsApp, tanggal & jenis kunjungan terakhir, paket yang dijalani, tanggal kontrol, status pengingat, dan tombol **"Ingatkan via WhatsApp"**.

**Tombol pengingat.** Menekan tombol membuka chat WhatsApp ke nomor pasien dengan pesan yang sudah terisi, lalu mengubah status menjadi *Sudah Diingatkan* beserta catatan waktu dan siapa yang mengirim. Admin tidak perlu mengetik ulang nomor maupun pesan.

**Status pengingat:**

| Status | Arti |
|---|---|
| `BELUM_DIINGATKAN` | Dibuat otomatis saat kunjungan difinalisasi |
| `SUDAH_DIINGATKAN` | Admin sudah menekan tombol WhatsApp |
| `DIKONFIRMASI` | Pasien membalas dan menyatakan akan datang |
| `DITUNDA` | Pasien minta diingatkan lagi nanti; admin mengisi tanggal baru |
| `TIDAK_MERESPONS` | Sudah diingatkan, pasien tidak membalas |
| `SELESAI` | Pasien sudah datang — ditutup otomatis oleh kunjungan baru |
| `DIBATALKAN` | Program pasien selesai atau pasien dinyatakan tidak aktif |

**Template pesan per jenis kunjungan.** Sistem memilih template berdasarkan isi kunjungan terakhir, dan admin dapat menggantinya sebelum mengirim:

| Jenis | Dipilih bila kunjungan terakhir berisi | Isi pesan |
|---|---|---|
| Ambil obat | Resep kapsul / Fat Blocker / Fat Burner | Mengingatkan obat akan habis dan waktunya mengambil kembali |
| Kontrol & Timbang BIA | Pengukuran BIA | Mengajak kontrol dan menimbang ulang untuk melihat progres |
| Inject | Inject S / Inject T | Mengingatkan jadwal inject berikutnya |
| Treatment lanjutan | Treatment aesthetic yang bersambung | Mengingatkan sesi lanjutan |

Contoh pesan terisi otomatis:

> *Halo Ibu Siti, ini dari SunDY Clinic. Obat program slimming Ibu diperkirakan habis minggu ini. Kami tunggu kedatangannya untuk kontrol dan pengambilan obat berikutnya ya. Klinik buka Senin–Sabtu 11.00–19.00.*

**Kapan pasien berhenti diingatkan:**

1. **Pasien datang kembali** — kunjungan baru menutup pengingat lama dan membuat pengingat baru untuk minggu berikutnya.
2. **Dokter menandai program selesai** — status pasien menjadi tidak aktif, seluruh pengingat terbuka dibatalkan.
3. **Otomatis setelah 60 hari** tanpa kunjungan — pasien dianggap tidak aktif agar daftar tidak menumpuk pasien lama yang sudah berhenti. Pasien tetap dapat diaktifkan kembali secara manual.

**Biaya.** Nol. Pengingat dikirim manual oleh admin lewat aplikasi WhatsApp biasa, bukan lewat API berbayar. Pengiriman otomatis terjadwal dibahas di Fase 2.

---

## 8. Alur Utama

### Alur booking (jalur normal)

```
Pasien buka situs
  → pilih tujuan konsultasi (Slimming / Aesthetic)
  → pilih cabang (Mahakeret aktif · Citraland "Segera Hadir")
  → pilih dokter & lihat kalender
  → pilih slot kosong (Kamis 15.00)            [slot di-hold 10 menit]
  → isi data diri + form skrining
  → setujui kebijakan privasi & submit
  → terima kode booking SDY-8F3K, status: MENUNGGU KONFIRMASI
  → klik "Konfirmasi via WhatsApp" → kirim bukti transfer ke 0851-7222-8900

Admin buka panel
  → lihat booking menunggu verifikasi
  → cocokkan dengan bukti transfer di WhatsApp
  → klik Verifikasi → status: TERKONFIRMASI
  → salin teks konfirmasi → kirim ke pasien

Hari H
  → admin tandai HADIR
  → dokter buka rekam medis pasien → isi SOAP, BIA, treatment
  → status: SELESAI
```

### Status booking

`MENUNGGU_KONFIRMASI` → `TERKONFIRMASI` → `HADIR` → `SELESAI`

Cabang: `DIBATALKAN` (oleh pasien atau admin) · `TIDAK_HADIR` (lewat jadwal tanpa kedatangan) · `KEDALUWARSA` (tidak dikonfirmasi dalam 24 jam, slot dilepas otomatis).

### Alur pengingat kontrol mingguan

```
Dokter finalisasi kunjungan pasien slimming (Senin 28 Sep)
  → sistem set tanggal kontrol = Senin 5 Okt (+7 hari)
  → sistem hitung tanggal pengingat = Minggu 4 Okt (H-1)
  → Minggu tutup, dimajukan ke Sabtu 3 Okt
  → pengingat dibuat, status: BELUM_DIINGATKAN

Sabtu 3 Okt — admin buka halaman Pengingat
  → pasien muncul di kelompok "Hari ini"
  → admin klik "Ingatkan via WhatsApp"
  → WhatsApp terbuka, pesan sudah terisi sesuai jenis kunjungan terakhir
  → status: SUDAH_DIINGATKAN (tercatat waktu & nama admin)

Pasien membalas "iya saya datang Senin"
  → admin ubah status: DIKONFIRMASI

Senin 5 Okt — pasien datang
  → kunjungan baru dicatat
  → pengingat lama: SELESAI
  → pengingat baru dibuat untuk minggu berikutnya
```

Bila pasien tidak datang, pengingat tetap berstatus `SUDAH_DIINGATKAN` dan muncul di kelompok **Terlambat** hari berikutnya, sehingga tidak hilang begitu saja dari pandangan admin.

### Penanganan kasus khusus
| Kasus | Perilaku sistem |
|---|---|
| Dua pasien memilih slot sama bersamaan | Slot pertama yang menahan (hold) menang; pasien kedua melihat pesan "slot baru saja terisi" dan kalender dimuat ulang. |
| Dua permintaan tiba pada milidetik yang sama | Penahanan slot berjalan di aplikasi dan punya celah baca-tulis. Batasan unik pada (dokter, waktu) di basis data menolak permintaan kedua; aplikasi menangkap penolakan itu dan menampilkan pesan yang sama seperti baris di atas, bukan galat mentah. |
| Pasien tidak konfirmasi dalam 24 jam | Booking `KEDALUWARSA`, slot kembali tersedia. |
| Dokter mendadak berhalangan | Admin menandai pengecualian tanggal; sistem menampilkan daftar booking terdampak untuk dijadwal ulang satu per satu. |
| Pasien lama booking lagi | Sistem mengenali nomor WhatsApp dan menautkan ke rekam medis yang sudah ada, bukan membuat pasien baru. |
| Pasien walk-in | Admin membuat booking manual; bila slot penuh, dapat menambahkan di luar slot dengan penanda "walk-in". |
| Pasien membuka kalender di tanggal merah | Tanggal ditampilkan nonaktif dengan keterangan nama hari liburnya (contoh: "Libur — Hari Natal"), bukan sekadar kosong tanpa penjelasan. |
| Pasien mencoba booking di cabang Citraland | Cabang tidak dapat dipilih; muncul ajakan "Segera Hadir — beri tahu saya saat buka" yang mengarah ke WhatsApp klinik. |
| Pasien Mahakeret pindah ke Citraland nanti | Rekam medis dan nomor RM tetap sama; kunjungan baru tercatat dengan cabang Citraland. Tidak ada data yang perlu dipindahkan. |
| Tanggal pengingat jatuh di Minggu atau tanggal merah | Pengingat dimajukan ke hari kerja terakhir sebelumnya. Bila beberapa hari libur berurutan (misal cuti bersama), sistem terus mundur sampai menemukan hari klinik buka. |
| Pasien datang lebih cepat dari jadwal | Kunjungan baru langsung menutup pengingat yang masih terbuka dan menjadwalkan ulang dari tanggal kunjungan yang baru, bukan dari jadwal lama. |
| Pasien punya dua pengingat terbuka | Tidak mungkin terjadi — membuat pengingat baru selalu menutup pengingat pasien yang masih terbuka lebih dulu. |
| Admin menekan tombol WhatsApp tapi batal mengirim | Status tetap berubah menjadi `SUDAH_DIINGATKAN` karena sistem tidak dapat mengetahui isi aplikasi WhatsApp. Admin dapat mengembalikannya ke `BELUM_DIINGATKAN` secara manual. |

---

## 9. Model Data

Entitas inti dan hubungannya:

| Entitas | Isi pokok | Relasi |
|---|---|---|
| `Branch` | nama, alamat, koordinat peta, no. WhatsApp, jam operasional, status (`AKTIF` / `SEGERA_HADIR`), urutan tampil | punya ScheduleTemplate, Appointment, Encounter |
| `Holiday` | tanggal, nama hari libur, jenis (libur nasional / cuti bersama / libur klinik), tahun | berlaku global lintas cabang |
| `Patient` | no. rekam medis, nama, no. WhatsApp, tanggal lahir, jenis kelamin, pekerjaan, alamat, alergi, riwayat penyakit, **status program** (`AKTIF` / `SELESAI` / `TIDAK_AKTIF`), **paket berjalan**, **tanggal kunjungan terakhir** | punya banyak Appointment, Encounter, Measurement, Reminder — **tidak terikat cabang** |
| `Reminder` | pasien, kunjungan pemicu, jenis pengingat (`AMBIL_OBAT` / `KONTROL_BIA` / `INJECT` / `TREATMENT_LANJUTAN`), tanggal kontrol, tanggal tampil (H-1 setelah penyesuaian hari libur), status, waktu dikirim, admin pengirim, catatan | milik Patient & Encounter; **maksimal satu pengingat terbuka per pasien** |
| `Staff` | nama, **peran (`DOKTER` / `TERAPIS`)**, no. SIP, spesialisasi, foto, bio, aktif | punya ScheduleTemplate, ScheduleException, Appointment. Menggantikan `Doctor`: satu dokter adalah Staff berperan `DOKTER`, sehingga jadwal terapis memakai mekanisme yang sama persis alih-alih jalur terpisah |
| `ScheduleTemplate` | **cabang**, **staff**, hari dalam minggu, jam mulai, jam selesai, durasi slot, jeda | milik Staff × Branch |
| `ScheduleException` | **staff**, opsional cabang, tanggal, jenis (libur / jam tambahan / blokir sebagian), rentang jam | milik Staff |
| `Appointment` | kode booking, **cabang**, pasien, **staff**, **jenis (`KONSULTASI` / `TREATMENT`)**, waktu mulai & **selesai** (UTC), layanan diminati, status, catatan, **sumber (`SITUS` / `WHATSAPP` / `TELEPON` / `WALK_IN`)** | milik Patient, Staff & Branch; menghasilkan satu Encounter. **Exclusion constraint pada (staff, rentang waktu)** — lihat catatan di bawah |
| `SlotHold` | cabang, **staff**, waktu mulai & selesai, kedaluwarsa, token sesi | sementara, dibersihkan otomatis. **Exclusion constraint pada (staff, rentang waktu)** |

**Catatan integritas slot.** Batasan di atas bukan detail teknis yang bisa ditunda — itulah satu-satunya hal yang membuat bentrok jadwal *mustahil*, bukan sekadar tidak mungkin.

Perhitungan slot, penahanan 10 menit, dan pemeriksaan "apakah jam ini masih kosong?" semuanya berjalan di aplikasi. Pemeriksaan di aplikasi selalu punya celah waktu antara membaca dan menulis: dua permintaan yang tiba dalam milidetik yang sama sama-sama membaca "kosong", lalu sama-sama menulis. Pasien tidak melihat ada yang salah sampai keduanya datang ke klinik pada jam yang sama.

**Batasan unik pada waktu mulai tidak cukup.** Booking di klinik ini punya durasi berbeda-beda — konsultasi 30 menit, treatment 60 menit atau lebih. Dua booking bisa bentrok tanpa waktu mulai yang sama:

> Treatment pukul 15.00–16.00, lalu konsultasi pukul 15.30. Waktu mulainya berbeda, sehingga batasan unik meloloskan keduanya, padahal jelas bertindihan.

Yang dibutuhkan adalah penolakan terhadap **rentang waktu yang bertindihan** pada tenaga yang sama. PostgreSQL menyediakannya lewat *exclusion constraint*:

```sql
ALTER TABLE "Appointment" ADD CONSTRAINT appointment_tanpa_tindih
EXCLUDE USING gist (
  "staffId"  WITH =,
  tstzrange("startAt", "endAt", '[)') WITH &&
) WHERE (status IN ('MENUNGGU_KONFIRMASI', 'TERKONFIRMASI', 'HADIR'));
```

Tiga hal yang perlu diperhatikan saat menerapkannya:

1. **Kuncinya `staffId`, bukan dokter atau cabang.** Ini yang membuat jalur dokter dan jalur terapis berdiri sendiri, sekaligus mencegah satu orang dipesan di dua cabang pada jam yang sama.
2. **Klausa `WHERE` penting.** Booking yang sudah `DIBATALKAN`, `KEDALUWARSA`, atau `TIDAK_HADIR` harus berhenti memblokir slot; tanpa klausa itu, satu pembatalan mengunci jam tersebut selamanya.
3. **Prisma tidak mendukung exclusion constraint,** jadi ini ditulis sebagai SQL mentah di dalam berkas migrasi, dan butuh ekstensi `btree_gist` diaktifkan lebih dulu.

`SlotHold` memakai batasan yang sama persis, agar slot yang sedang ditahan pasien lain juga tidak bisa ditembus.

Aplikasi menangkap penolakan dari basis data dan menampilkan "slot baru saja terisi", bukan melempar galat mentah ke pasien. Tanpa mekanisme ini, target "double-booking: 0 kejadian" pada bagian 3 tidak dapat dijanjikan.

Booking walk-in di luar slot tetap tunduk pada batasan yang sama; bila admin memasukkan walk-in pada jam yang sudah terisi, sistem menolak dan meminta admin memilih jam lain.
| `IntakeForm` | jawaban skrining & food recall (JSON terstruktur), tertaut appointment | milik Appointment |
| `Encounter` | tanggal, **cabang**, dokter, S, O, A, P, status (draf/final), **tanggal kontrol berikutnya** | milik Patient & Branch; punya banyak TreatmentRecord, Prescription, Measurement; memicu satu Reminder |
| `EncounterAddendum` | isi koreksi, penulis, waktu | milik Encounter |
| `Measurement` | tanggal, berat, tinggi, BMI, % lemak, massa otot, lemak visceral, % air, BMR | milik Patient, opsional tertaut Encounter |
| `TreatmentRecord` | layanan, area, dosis, pelaksana, catatan | milik Encounter |
| `Prescription` | item (kapsul M/L, Fat Blocker/Burner, Inject S/T), dosis, aturan pakai | milik Encounter |
| `ServiceCategory` / `Service` | nama, deskripsi, harga normal, harga promo, durasi, **`requiresDoctor`**, foto, urutan, aktif | Service milik ServiceCategory. `requiresDoctor` menentukan antrean mana yang terpakai saat layanan ini dipesan |
| `Package` / `PackageItem` | nama paket, harga per bulan, deskripsi, daftar isi | PackageItem milik Package |
| `Product` | nama, deskripsi, harga, foto, aktif | mandiri |
| `User` / `Role` | email, kata sandi terenkripsi, peran (SUPER_ADMIN / DOKTER / RESEPSIONIS), **cabang penempatan**, aktif | User dapat tertaut ke Doctor; resepsionis dibatasi pada cabangnya, SUPER_ADMIN & dokter melihat seluruh cabang |
| `AuditLog` | aktor, aksi, entitas, id entitas, waktu, alamat IP | hanya-tambah, tidak dapat diubah |

---

## 10. Persyaratan Non-Fungsional

**Bahasa & lokal.** Seluruh antarmuka berbahasa Indonesia. Format tanggal Indonesia (`Kamis, 25 September 2026`), mata uang Rupiah (`Rp 499.000`), zona waktu WITA.

**Perangkat.** Dirancang mobile-first — mayoritas pengunjung datang dari tautan Instagram di HP. Panel admin dioptimalkan untuk desktop namun tetap terpakai di tablet.

**Performa.** Halaman publik dimuat di bawah 2,5 detik pada koneksi 4G. Kalender slot merespons di bawah 500 ms.

**Ketersediaan.** Situs publik harus dapat diakses 24/7; pendaftaran di luar jam kerja adalah salah satu alasan utama produk ini dibuat.

**Keamanan.**
- Seluruh lalu lintas lewat HTTPS.
- Kata sandi staf disimpan sebagai hash (Argon2id).
- Pembatasan laju (rate limit) pada endpoint booking dan login untuk mencegah penyalahgunaan.
- Kontrol akses berbasis peran ditegakkan di sisi server, bukan hanya disembunyikan di antarmuka. Resepsionis secara teknis tidak dapat mengambil isi catatan klinis.
- Nomor WhatsApp dan tanggal lahir tidak pernah tampil utuh di halaman publik.
- Pencadangan basis data harian, dengan uji pemulihan minimal sekali sebelum rilis.

**Kepatuhan.** Sistem ini menyimpan data kesehatan, yang tergolong data pribadi bersifat spesifik.
- **UU No. 27 Tahun 2022 (Pelindungan Data Pribadi)** — wajib ada persetujuan eksplisit saat pendaftaran, kebijakan privasi yang jelas, pembatasan akses, dan mekanisme permintaan penghapusan data non-medis.
- **Permenkes No. 24 Tahun 2022 (Rekam Medis Elektronik)** — rekam medis wajib memiliki jejak audit, tidak boleh dihapus, dan disimpan sekurang-kurangnya 25 tahun sejak kunjungan terakhir. Desain ini memenuhi audit trail dan larangan penghapusan sejak MVP.
- **Integrasi SATUSEHAT** diwajibkan bagi fasilitas pelayanan kesehatan. Ini berada di luar lingkup MVP namun model data disiapkan agar tidak menghalangi integrasi di kemudian hari. **Perlu dikonfirmasi pemilik:** status registrasi klinik dan tenggat kepatuhan yang berlaku.

---

## 11. Arsitektur & Teknologi

Keputusan: **Next.js**, dengan biaya awal nol.

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Satu basis kode untuk situs publik dan panel admin. Rendering server memberi SEO yang dibutuhkan halaman layanan. |
| Antarmuka | **Tailwind CSS + shadcn/ui** | Komponen siap pakai untuk tabel, formulir, dan kalender admin; tema disesuaikan dengan identitas emas-krem SunDY. |
| Basis data | **PostgreSQL (Neon, paket gratis)** | Relasional — cocok untuk rekam medis yang butuh integritas. Paket gratis cukup untuk tahap awal. |
| ORM | **Prisma** | Migrasi berversi, tipe aman, mengurangi kesalahan pada skema yang cukup besar ini. |
| Autentikasi staf | **Auth.js (NextAuth) — kredensial + sesi basis data** | Tanpa layanan pihak ketiga berbayar; sesi dapat dicabut. |
| Penyimpanan gambar | **Cloudinary (paket gratis)** | Optimasi & pengubahan ukuran otomatis untuk foto treatment dan produk. |
| Grafik | **Recharts** | Ringan, cukup untuk grafik progres BIA. |
| Pengujian | **Vitest** (unit) + **Playwright** (alur booking ujung-ke-ujung) | Logika ketersediaan slot wajib punya pengujian otomatis. |
| Hosting tahap awal | **Vercel (paket Hobby)** | Gratis, deploy langsung dari repositori. |

### Catatan penting soal hosting produksi
**Keputusan pemilik (23 Sep 2026):** memakai **Vercel + Neon** sejak awal agar proses deploy sederhana dan biayanya nol. Basis data Neon ditempatkan di region **Singapore (`ap-southeast-1`)**, yang terdekat dari Manado.

Dua hal yang perlu ditinjau ulang menjelang go-live komersial:

- Paket **Vercel Hobby gratis hanya untuk penggunaan non-komersial**; situs klinik yang menerima pasien termasuk komersial. Saat mulai menerima booking sungguhan, naik ke **Vercel Pro** (USD 20/bulan) atau pindah ke **VPS Indonesia** (Biznet/IDCloudHost/Rumahweb, kisaran Rp 80.000–150.000/bulan).
- Pilihan VPS Indonesia punya keuntungan tambahan: latensi lebih rendah untuk pengguna Manado dan **data rekam medis berada di dalam negeri** — pertimbangan nyata untuk data kesehatan. Pemindahan ini tidak memerlukan penulisan ulang karena aplikasi memakai Next.js + PostgreSQL standar.

Selama situs publik belum menerima data pasien (Plan 1 & 2), Vercel Hobby aman dipakai.

Aplikasi dirancang portabel (Docker + PostgreSQL standar) sehingga perpindahan ini tidak memerlukan penulisan ulang.

---

## 12. Keputusan yang Perlu Dikonfirmasi

| # | Keputusan | Yang saya usulkan | Catatan |
|---|---|---|---|
| D1 | **Verifikasi nomor pasien** | MVP: tanpa OTP. Verifikasi terjadi alami saat pasien mengirim bukti transfer lewat WhatsApp. | Anda sempat memilih OTP WhatsApp, namun tidak ada layanan OTP WhatsApp yang gratis (Meta Cloud API menagih per pesan; gateway lokal seperti Fonnte ±Rp 100.000/bulan). Bila tingkat ketidakhadiran ternyata tinggi, OTP dapat ditambahkan di Fase 1.5 tanpa mengubah alur. |
| D2 | ~~Jam operasional & jumlah dokter~~ | **Selesai.** Senin–Sabtu 11.00–19.00, tanggal merah tutup. Satu dokter tampil: Dr. Diane Paparang, Sp.GK, AIFO-K di SunDY Mahakeret. Sistem tetap multi-dokter & multi-cabang. | Dikonfirmasi pemilik, 23 Sep 2026. |
| D2b | **Jadwal Dr. Diane bila Citraland buka** | Belum ditentukan. | Saat Citraland siap, perlu keputusan pembagian hari (misal Senin–Rabu Mahakeret, Kamis–Sabtu Citraland) atau penambahan dokter kedua. Cukup diisi lewat panel admin, tanpa perubahan kode. |
| D2c | **Nomor WhatsApp cabang Citraland** | Sementara memakai nomor yang sama, 0851-7222-8900. | Bila nanti Citraland punya nomor sendiri, tinggal diisi di data cabang. |
| D3 | **Harga Vitamin C** | Ditranskrip apa adanya dari materi promosi. | Materi menulis "1.299 JT" untuk Injek Vit C 2000mg. Bila maksudnya Rp 1.299.000 sudah benar; bila seharusnya Rp 299.000, mohon dikoreksi sebelum tayang. |
| D4 | **Ketikan pada paket LUX T ACTIVE** | Diperbaiki menjadi "Kapsul **L**-Fat Burner". | Materi promosi menulis "Kapsul M-Fat Burner-Inject T" padahal paket LUX lain memakai Kapsul L. Kemungkinan salah ketik di desain. |
| D5 | **Biaya konsultasi & DP** | Konsultasi Dokter Rp 200.000 ditampilkan; besaran DP untuk mengunci slot belum ditentukan. | Perlu keputusan: apakah pasien membayar penuh di muka, DP sebagian, atau bayar di klinik dengan bukti transfer hanya untuk booking berbayar. |
| D6 | **Domain & email klinik** | Belum ada. | Diperlukan sebelum go-live (contoh: `sundyclinic.com`). |
| D7 | **Jeda pengingat** | Kontrol setiap **7 hari**, pengingat tampil **H-1**, dimajukan bila jatuh di hari tutup. | Dikonfirmasi pemilik, 23 Sep 2026. Angka 7 hari disimpan sebagai pengaturan, bukan ditulis keras di kode, agar dapat diubah tanpa developer. |
| D8 | **Pengingat otomatis terjadwal** | Tidak di MVP — admin menekan tombol secara manual. | Pengiriman otomatis memerlukan WhatsApp API berbayar. Ditinjau ulang di Fase 2 bila jumlah pasien slimming membuat pengiriman manual terlalu memberatkan. |
| D9 | **Pasien aesthetic** | Belum masuk daftar pengingat. | Model data sudah mendukung; tinggal melonggarkan penyaringan bila nanti treatment aesthetic berseri juga ingin diingatkan. |
| D10 | **Layanan mana yang harus dokter** | Usulan tabel pada F4a. | **Perlu dikonfirmasi pemilik.** Salah menandai membuat layanan tampak tersedia padahal dokternya sedang menangani pasien lain. |
| D11 | **Jumlah terapis per cabang** | Asumsi sementara: satu terapis di Mahakeret. | Model `Staff` mendukung berapa pun; ini hanya data awal. Menambah terapis kedua langsung menggandakan kapasitas treatment tanpa perubahan kode. |
| D12 | ~~Durasi treatment di jadwal~~ | **Selesai.** Memakai `durationMin` tiap layanan (20–90 menit), dibulatkan ke kelipatan 30 menit. **Tanpa jeda bersih-bersih antar treatment** — booking berikutnya boleh dimulai tepat saat yang sebelumnya selesai. | Dikonfirmasi pemilik, 24 Sep 2026. Contoh: HIFU Wajah 90 menit mengunci tiga slot berurutan, dan slot berikutnya langsung tersedia. |

---

## 13. Rencana Bertahap

**Catatan urutan pembangunan.** Pencatatan janji temu oleh admin dibangun **sebelum** pendaftaran mandiri di situs publik. Admin yang dapat mencatat janji temu sudah menggantikan buku jadwal dan mencegah bentrok sejak hari pertama, sementara pendaftaran mandiri hanya berguna bila sisi admin-nya sudah ada untuk memverifikasi. Membangunnya terbalik berarti mesin anti-bentrok pertama kali diuji oleh pasien sungguhan, bukan oleh staf sendiri.

**Fase 1 — MVP (lingkup dokumen ini)**
Situs publik + katalog + pendaftaran konsultasi + panel admin + rekam medis + grafik progres, dengan dukungan multi-cabang sejak awal (Mahakeret aktif, Citraland "Segera Hadir").

**Fase 1.1 — Pembukaan cabang Citraland**
Tanpa pekerjaan developer: pemilik mengubah status cabang menjadi `AKTIF` dan mengisi jadwal dokternya lewat panel admin. Cabang langsung dapat menerima booking.

**Fase 1.5 — Penyempurnaan pasca-rilis**
OTP WhatsApp otomatis, pengingat janji temu H-1, dan **pengiriman pengingat kontrol mingguan secara otomatis** lewat gateway WhatsApp lokal — bila data menunjukkan ketidakhadiran tinggi atau pengiriman manual sudah terlalu memberatkan admin.

**Fase 2 — Perluasan**
Toko online penuh (keranjang, stok, ongkir, pesanan), pembayaran online (Midtrans/Xendit), akun pasien dengan riwayat mandiri, program loyalitas & paket kunjungan.

**Fase 3 — Kepatuhan & skala**
Integrasi SATUSEHAT, manajemen inventaris & stok obat per cabang, transfer stok antar cabang, laporan keuangan, dan dukungan cabang ketiga dan seterusnya.

---

## Lampiran A — Daftar Layanan & Harga (dari materi promosi klinik)

Harga dicoret adalah harga normal; harga tebal adalah harga promo berjalan.

### Signature Treatment
| Layanan | Normal | Promo |
|---|---|---|
| Peeling | Rp 149.000 | **Rp 99.000** |
| RF | Rp 389.000 | **Rp 289.000** |
| HIFU | Rp 749.000 | **Rp 499.000** |
| Skin Booster | Rp 989.000 | **Rp 889.000** |

### RF Treatment
| Layanan | Normal | Promo |
|---|---|---|
| RF Perut | Rp 749.000 | **Rp 499.000** |
| RF Paha | Rp 499.000 | **Rp 329.000** |
| RF Lengan | Rp 389.000 | **Rp 289.000** |
| RF Wajah | Rp 389.000 | **Rp 289.000** |

### Facial
| Layanan | Normal | Promo |
|---|---|---|
| Relaxing Facial | Rp 189.000 | **Rp 149.000** |
| Facial Brightening | Rp 289.000 | **Rp 249.000** |
| Facial Acne | Rp 289.000 | **Rp 249.000** |

### HIFU & Botox
| Layanan | Normal | Promo |
|---|---|---|
| HIFU Wajah | Rp 749.000 | **Rp 499.000** |
| HIFU Miss V | Rp 649.000 | **Rp 489.000** |
| HIFU Perut | Rp 1.000.000 | **Rp 699.000** |
| Botox | — | **Rp 50.000 / unit** |

### Peeling
| Layanan | Normal | Promo |
|---|---|---|
| Peeling | Rp 149.000 | **Rp 99.000** |
| Peeling Premium | Rp 349.000 | **Rp 299.000** |
| Paket Peeling Premium (3x) | — | **Rp 799.000** |

### Vitamin C *(lihat keputusan D3)*
| Layanan | Normal | Promo |
|---|---|---|
| Injek Vit. C 2000mg | Rp 1.449.000 | **Rp 1.299.000** |
| Injek Vit. C 1100mg | Rp 1.249.000 | **Rp 1.199.000** |
| Infus Vit. C 1100mg | Rp 1.499.000 | **Rp 1.299.000** |
| Infus Vit. C 2000mg | Rp 1.699.000 | **Rp 1.499.000** |

### Dermapen, Elektrocauter & Skin Booster
| Layanan | Normal | Promo |
|---|---|---|
| Dermapen | Rp 749.000 | **Rp 589.000** |
| Dermapen PRP | Rp 1.189.000 | **Rp 898.000** |
| Elektrocauter | Rp 248.000 | **Rp 188.000** |
| Skin Booster HA | Rp 3.890.000 | **Rp 3.589.000** |
| Skin Booster DNA Salmon | Rp 989.000 | **Rp 889.000** |
| Eyebooster | Rp 2.389.000 | **Rp 2.189.000** |

### Laser & Meso
| Layanan | Normal | Promo |
|---|---|---|
| Laser Rejuve / Fleck | Rp 849.000 | **Rp 399.000** |
| Laser 2 in 1 | Rp 1.000.000 | **Rp 599.000** |
| Lip Laser | Rp 249.000 | **Rp 99.000** |
| Meso Treatment (slimming) | — | **Rp 550.000 / 5 titik** |

---

## Lampiran B — Program Slimming

### Paket MAX (Fat Blocker)
| Paket | Harga / bulan | Isi |
|---|---|---|
| MAX | Rp 1.125.000 | Konsul & Timbang BIA, Kapsul M, Fat Blocker |
| MAX SLIM | Rp 1.925.000 | Konsul & Timbang BIA, Kapsul M, Fat Blocker, Inject S |
| MAX T | Rp 2.525.000 | Konsul & Timbang BIA, Kapsul M, Fat Blocker, Inject T |

### Paket LUX (Fat Blocker)
| Paket | Harga / bulan | Isi |
|---|---|---|
| LUX | Rp 1.500.000 | Konsul & Timbang BIA, Kapsul L, Fat Blocker |
| LUX SLIM | Rp 2.300.000 | Konsul & Timbang BIA, Kapsul L, Fat Blocker, Inject S |
| LUX T | Rp 2.900.000 | Konsul & Timbang BIA, Kapsul L, Fat Blocker, Inject T |

### Paket ACTIVE (Fat Burner)
| Paket | Harga / bulan | Isi |
|---|---|---|
| MAX ACTIVE | Rp 1.125.000 | Konsul & Timbang BIA, Kapsul M, Fat Burner |
| MAX SLIM ACTIVE | Rp 1.925.000 | Konsul & Timbang BIA, Kapsul M, Fat Burner, Inject S |
| MAX T ACTIVE | Rp 2.525.000 | Konsul & Timbang BIA, Kapsul M, Fat Burner, Inject T |
| LUX ACTIVE | Rp 1.500.000 | Konsul & Timbang BIA, Kapsul L, Fat Burner |
| LUX SLIM ACTIVE | Rp 2.300.000 | Konsul & Timbang BIA, Kapsul L, Fat Burner, Inject S |
| LUX T ACTIVE | Rp 2.900.000 | Konsul & Timbang BIA, Kapsul L, Fat Burner, Inject T *(lihat keputusan D4)* |

### Layanan Satuan
| Layanan | Harga |
|---|---|
| Konsultasi Dokter | Rp 200.000 |
| Timbang BIA | Rp 350.000 |
| Meal Plan | Rp 300.000 |
| Nutrigenomics Program | Segera hadir |

---

## Lampiran C — Form Skrining Digital

Menggantikan Google Form "Recall Form Sundy Clinic Manado". Jawaban tersimpan sebagai bagian rekam medis, bukan di spreadsheet terpisah.

**Data dasar** — nama lengkap, pekerjaan, usia/tanggal lahir, berat badan (kg), tinggi badan (cm), jenis kelamin, tujuan konsultasi.

**Food recall harian** — makanan utama (pagi, siang, malam), snack, minuman, dan cemilan yang biasa dikonsumsi.

Field yang sudah ada di data pasien (nama, jenis kelamin, tanggal lahir, pekerjaan) terisi otomatis pada kunjungan berikutnya sehingga pasien lama tidak mengetik ulang. Berat badan dan tinggi badan yang diisi pasien masuk sebagai pengukuran mandiri dan dibedakan dari hasil Timbang BIA resmi di klinik.
