# Desain — Pengingat treatment

- **Tanggal:** 24 Oktober 2026
- **Status:** gambaran disetujui pemilik di chat ("ok sudah sesuai", "ya seperti itu", "ya sudah sesuai", dengan contoh tampilan); dokumen ini menunggu persetujuan
- **Melanjutkan:** halaman Pengingat (kotak 1–4), pengingat jadwal paket (kotak 4), menu Layanan & Harga

## 1. Tujuan

Pasien yang sudah treatment di SunDY diajak kembali. Saat waktunya treatment lagi, pasien muncul di halaman Pengingat dan
resepsionis mengirim WhatsApp yang menyebut treatment terakhirnya. Setelah itu, pengingat berikutnya terserah resepsionis
lewat daftar semua pasien treatment.

**Berhasil bila:**
- setiap pasien yang treatment muncul sekali di kotak pengingat pada waktunya, dan resepsionis tinggal menekan Kirim;
- jarak pengingat cocok dengan treatment-nya (facial mingguan, Botox per beberapa bulan), diatur sendiri oleh klinik;
- resepsionis bisa mencari pasien lama yang belum kembali dan mengingatkannya lagi kapan saja.

**Gagal walau jalan bila:**
- pasien yang sudah punya booking berikutnya, atau sudah datang lagi, tetap diajak kembali;
- pasien paket mendapat dua pesan untuk hal yang sama;
- pasien menerima "treatment ini sebaiknya dilakukan …" setelah layanan yang bukan treatment (konsultasi, timbang BIA, meal plan);
- resepsionis tidak tahu pasien mana yang sudah diingatkan, oleh siapa, dan kapan.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| PT1 | Pengiriman tetap lewat tombol **Kirim** per pasien yang membuka WhatsApp dengan pesan terisi (wa.me), seperti pengingat lain. Tanpa layanan WhatsApp berbayar dan tanpa pengiriman otomatis. | pemilik |
| PT2 | **Jarak pengingat diatur per layanan** di menu **Layanan & Harga**: "Ingatkan kembali setelah" dengan pilihan **Tidak diingatkan, 1 minggu, 2 minggu, 3 minggu, 1 bulan, 2 bulan, 3 bulan, 6 bulan**. Layanan "Tidak diingatkan" tidak memicu pengingat dan tidak dihitung sebagai treatment. | pemilik ("ya seperti itu", "waktu pengingatnya … di atur") |
| PT3 | **Nilai awal** saat dirilis: **1 minggu** untuk semua layanan, kecuali Konsultasi Dokter, Konsultasi Online, Timbang BIA, dan Meal Plan yang **Tidak diingatkan**. Layanan baru dibuat dengan "Tidak diingatkan". Yang boleh mengubah: yang sudah boleh mengelola Layanan & Harga (`catalog:manage`: Admin Keuangan, Super Admin). | Claude, diiyakan (nilai awal); hak dan layanan baru: Claude |
| PT4 | **Treatment** = baris tagihan **final** yang terhubung ke layanan katalog dengan jarak pengingat (PT2), baik layanan yang dibooking maupun treatment dari dokter (baris Layanan atau Treatment). Baris bebas tanpa layanan katalog, obat/produk, dan paket tidak dihitung. Tagihan batal tidak dihitung. Jarak dibaca dari pengaturan layanan saat ini. | Claude, diiyakan (temuan reviewer) |
| PT5 | **Tanggal treatment** = tanggal kunjungan (booking) bila tagihan punya booking; untuk penjualan langsung, tanggal tagihan difinalkan (WITA). | Claude |
| PT6 | **Kotak 5 "Waktunya treatment lagi — ajak kembali"** di halaman Pengingat, sesudah kotak 4. Pasien muncul pada **tanggal treatment + jarak layanan**. Satu baris per pasien: nama, treatment, tanggal treatment, jarak ("tiap 2 minggu"), tombol Kirim; sesudah dikirim: "Sudah diingatkan · jam · oleh {nama}". | pemilik (contoh tampilan) |
| PT7 | Beberapa treatment dalam satu kunjungan = **satu baris**, memakai **jarak terpendek** di antaranya; pesannya menyebut semuanya ("Chemical Peeling dan Laser Toning"). Bila pasien treatment lagi sebelum waktunya, yang dipakai kunjungan treatment terbarunya. | Claude, diiyakan |
| PT8 | Pengingat otomatis hanya **sekali** per kunjungan treatment. Pengingat berikutnya dikirim manual dari tab Pasien treatment (PT10). | pemilik |
| PT9 | Pasien **tidak masuk** kotak 5 bila: (a) punya booking berikutnya yang belum lewat (menunggu konfirmasi atau terkonfirmasi); (b) sudah datang lagi sesudah tanggal treatment (booking Hadir/Selesai); (c) punya **paket aktif dengan rencana kunjungan berikutnya**, karena kotak 4 sudah mengingatkannya; (d) pasien rangkap yang sudah digabung. Sesi dari paket yang sudah selesai, kedaluwarsa, atau batal tetap dihitung sebagai treatment. | Claude (c: temuan reviewer); a, b, d diiyakan |
| PT10 | **Tab "Pasien treatment"** di halaman Pengingat: semua pasien yang pernah treatment (PT4), dengan treatment terakhir, tanggalnya, dan terakhir diingatkan (tanggal · oleh siapa). Pencarian nama atau treatment, dan saringan "treatment terakhir lebih dari … minggu lalu". Tombol **Kirim** / **Kirim lagi** per pasien, kapan saja. Pasien tetap bisa dikirimi, tetapi diberi tanda "punya booking {tanggal}", "paket aktif · kunjungan berikutnya {tanggal}", atau "sudah datang lagi {tanggal}". | pemilik (contoh tampilan); tanda: Claude |
| PT11 | **Isi pesan** (kotak 5 dan tab Pasien treatment): "Halo {nama depan}, terima kasih sudah melakukan {treatment} di SunDY Clinic pada {hari, tanggal}. Agar hasilnya maksimal, treatment ini sebaiknya dilakukan {jarak}. Yuk jadwalkan kunjungan berikutnya — balas pesan ini untuk memilih waktu. SunDY Clinic". {jarak}: "setiap minggu", "setiap 2 minggu", "setiap 3 minggu", "setiap bulan", "setiap 2 bulan", "setiap 3 bulan", "setiap 6 bulan". | pemilik (contoh tampilan) |
| PT12 | Setiap tekan Kirim **tercatat**: pasien, tanggal treatment yang diingatkan, jam, dan staf. Kotak 5 dan kolom "Terakhir diingatkan" membaca catatan ini. | Claude |
| PT13 | Halaman Pengingat tetap untuk kapabilitas `booking:manage` (Resepsionis, Dokter, Super Admin). Angka di menu Pengingat ikut menghitung baris kotak 5 yang belum dikirim. | Claude |
| PT14 | Pasien tanpa nomor WhatsApp yang sah: baris tetap tampil dengan tulisan "Nomor WhatsApp pasien tidak dikenali.", tanpa tombol Kirim, seperti kotak 4. | Claude |

Contoh dari tampilan yang disetujui: "Rina Wulandari · Facial Brightening · 17 Okt 2026 · tiap 1 minggu · [Kirim]";
pengaturan: Facial Brightening 1 minggu, Peeling 2 minggu, Botox 3 bulan, Konsultasi Dokter dan Timbang BIA tidak diingatkan.

## 3. Data (migrasi hanya menambah)

- **Jarak pengingat per layanan:** kosong = tidak diingatkan; nilai awal sesuai PT3 diisi oleh migrasi.
- **Catatan pengingat treatment:** pasien, tanggal treatment yang diingatkan, waktu kirim, staf pengirim (id dan nama
  disalin). Dibaca kotak 5 (sudah dikirim untuk kunjungan itu?) dan tab Pasien treatment (kiriman terakhir).

## 4. Alur

1. Admin mengatur jarak pengingat tiap layanan di Layanan & Harga (sekali, lalu bila perlu).
2. Pasien treatment pada hari H; tagihan difinalkan.
3. Hari H + jarak: pasien muncul di kotak 5, kecuali kena PT9.
4. Resepsionis menekan Kirim → WhatsApp terbuka dengan pesan PT11 → kiriman tercatat → baris menjadi "Sudah diingatkan".
5. Kapan pun: resepsionis membuka tab Pasien treatment, menyaring pasien yang lama tidak kembali, lalu Kirim lagi satu per satu.

## 5. Diserahkan ke pembangun

- **Berapa lama baris belum terkirim bertahan di kotak 5** sesudah waktunya, misalnya 7 hari supaya hari libur terkejar.
  Setelah itu pasien tetap bisa diingatkan dari tab Pasien treatment.
- "1 bulan" dihitung 30 hari atau bulan kalender.
- Urutan dan halaman tab Pasien treatment (berapa baris per halaman), pilihan saringan minggu.
- Apakah baris yang sudah dikirim hari ini tetap tampil di kotak 5 sampai besok (seperti kotak 4).

## 6. Di luar cakupan

- Pengiriman otomatis atau broadcast sekaligus lewat WhatsApp Business API.
- Pengingat untuk obat atau produk.
- Rilis dan buku panduan: dikerjakan saat rilis.
