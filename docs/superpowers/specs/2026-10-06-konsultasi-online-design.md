# Desain — Konsultasi Online (Booking Tanpa Slot, Berdasarkan Waktu Luang Customer)

- **Versi:** 1.0
- **Tanggal:** 6 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Melanjutkan:**
  - pendaftaran pasien & `/daftar`: `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`;
  - booking admin & daftar booking: `docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md`;
  - konfirmasi & pengingat: `docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md`;
  - link kuis C3: `docs/superpowers/specs/2026-10-02-link-kuis-design.md`;
  - catatan dokter: `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md`;
  - check-in & food recall: `docs/superpowers/specs/2026-10-03-check-in-klinik-design.md`.

## 1. Latar belakang & tujuan

Semua booking SunDY saat ini adalah kunjungan ke klinik. Setiap booking mengunci satu slot jam dokter atau terapis di satu cabang, dan penjaga anti-bentrok di database memastikan slot itu tidak dipakai dua kali.

Sebagian customer, terutama dari luar Manado atau yang sibuk, ingin berkonsultasi tanpa datang. Bagi mereka slot jam tidak cocok, karena:
- dokter menelepon di sela praktik, sehingga jam pastinya tidak bisa dijanjikan;
- yang penting adalah **kapan customer bisa menjawab telepon**, bukan kapan dokter kosong.

**Berhasil bila:**
- customer bisa memesan konsultasi online dari `/daftar`, dan resepsionis bisa mencatatnya dari panel, tanpa memilih slot;
- booking online tidak pernah mengurangi slot praktik di klinik;
- dokter melihat daftar customer online beserta rentang waktu luangnya, menelepon lewat WhatsApp, lalu menulis catatan dokter yang sama seperti kunjungan klinik;
- bila customer tidak bisa dihubungi di semua rentangnya, resepsionis tahu dan bisa meminta waktu baru tanpa membuat booking baru.

## 2. Keputusan (dikonfirmasi pemilik, 6 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| KO1 | Siapa membuat booking online | **Customer** dari `/daftar` dan **resepsionis** dari panel admin |
| KO2 | Isi konsultasi | **Konsultasi online penuh** lewat telepon/video WhatsApp. Dokter menulis catatan dokter (S/O/A/P) seperti kunjungan klinik |
| KO3 | Pembayaran | **Transfer di muka**, diverifikasi resepsionis sebelum dokter menghubungi |
| KO4 | Nominal transfer | **Biaya booking + harga layanan "Konsultasi Online"**. Harga diatur pemilik di halaman Layanan |
| KO5 | Waktu luang | **1–3 rentang** tanggal + jam mulai–selesai, dalam 14 hari ke depan |
| KO6 | Jam pasti | **Tidak ada.** Dokter menelepon kapan saja di dalam salah satu rentang |
| KO7 | Tujuan yang boleh online | **Semua tujuan** kuis (Slimming, Aesthetic, Gizi klinik, Belum yakin). Treatment tetap di klinik |
| KO8 | Kuis | **Kuis v2 yang sama** seperti booking klinik |
| KO9 | Tidak terhubung | Dokter mencatat percobaan. Bila semua rentang lewat, resepsionis **meminta waktu baru** lewat WA dan mencatatnya di booking yang sama; biaya tetap berlaku |
| KO10 | Pintu masuk di situs | **Pilihan di dalam `/daftar`** setelah layar Layanan & biaya, bukan halaman terpisah |
| KO11 | Pendekatan | **Kanal pada booking yang ada** (Klinik/Online) + tabel rentang waktu luang. Verifikasi, pesan WA, kuis, catatan dokter, dan riwayat dipakai ulang |

## 3. Aturan dasar

### 3.1 Kanal

Setiap booking punya **kanal**: `KLINIK` (semua booking yang sudah ada dan booking baru di klinik) atau `ONLINE`.

Booking online tetap memakai kode SDY-XXXX, pasien, dokter, kuis, status, verifikasi, pesan WA, dan catatan dokter yang sama dengan booking klinik.

Booking online selalu berjenis **Konsultasi** dengan layanan "Konsultasi Online" (bagian 3.3), dan tenaganya selalu **dokter**.

### 3.2 Rentang waktu luang

Satu booking online punya **1–3 rentang**. Setiap rentang adalah satu tanggal (WITA) dengan jam mulai dan jam selesai.

| Aturan | Nilai |
|---|---|
| Jam | 08.00–21.00 WITA |
| Kelipatan | 30 menit |
| Panjang minimal | 1 jam |
| Paling cepat — customer | 2 jam dari sekarang (sama dengan booking klinik) |
| Paling cepat — resepsionis | sekarang (customer bisa sedang di telepon dan siap dihubungi) |
| Paling lambat | 14 hari ke depan (tanggal WITA) |
| Tumpang tindih | Tidak boleh antar-rentang dalam satu booking |
| Hari Minggu dan hari libur | **Boleh**, karena tidak terikat jadwal praktik klinik |

Rentang disimpan terurut dari yang paling awal.

### 3.3 Layanan & biaya

- Layanan baru **"Konsultasi Online"** (slug `konsultasi-online`), wajib dokter. Harga (`promoPrice`) dan durasi (`durationMin`) diatur pemilik di halaman Layanan.
- Layanan ini dibuat **nonaktif** saat migrasi. Pilihan online tidak muncul di `/daftar` maupun Booking Baru sampai pemilik mengisi harga dan mengaktifkannya.
- Layanan ini **tidak tampil di katalog layanan situs** (halaman Layanan, beranda, kategori). Ia hanya muncul sebagai pilihan cara konsultasi.
- Saat booking online dibuat, dua angka disalin ke booking:
  - `bookingFee` — biaya booking dari pengaturan (seperti booking klinik);
  - `servicePrice` — harga Konsultasi Online saat itu.
- Customer mentransfer **total keduanya**. Perubahan harga di kemudian hari tidak mengubah booking lama.
- Aturan biaya booking yang sudah ada (tidak dikembalikan, K16) berlaku untuk total itu. Pada booking online, "pindah jadwal" berarti **mengganti rentang waktu luang**.

### 3.4 Status

Status yang ada dipakai apa adanya.

| Status | Arti pada booking online |
|---|---|
| Menunggu konfirmasi | Belum transfer / belum diverifikasi |
| Terkonfirmasi | Sudah diverifikasi, menunggu dihubungi dokter |
| Hadir | Dokter menekan **Mulai konsultasi** |
| Selesai | Catatan dokter difinalisasi (sama seperti klinik) |
| Kedaluwarsa | Booking dari situs tidak diverifikasi dalam 24 jam kerja (sama seperti klinik) |
| Dibatalkan | Dibatalkan resepsionis atau customer lewat WA |

*Tidak hadir* tidak dipakai untuk booking online.

**"Perlu waktu baru"** bukan status, melainkan keadaan yang dihitung: booking online *Terkonfirmasi* yang **semua rentangnya sudah berakhir**, baik dokter sudah mencoba menelepon maupun belum.

### 3.5 Tanggal & jam booking

Kolom `startAt`/`endAt` booking tetap wajib diisi, dan dipakai untuk pengurutan, riwayat, serta batas transfer.

- **Sebelum konsultasi dimulai:** `startAt`/`endAt` = awal dan akhir **rentang paling awal**. Nilainya dihitung ulang setiap kali rentang diubah.
- **Saat Mulai konsultasi:** `startAt` = waktu sekarang, dan `endAt` = sekarang + durasi layanan.

Dengan begitu riwayat kunjungan, catatan dokter, "Pasien hari ini", dan tanggal H-1 food recall memakai tanggal konsultasi yang sebenarnya.

Batas transfer (`transferDeadline`) tetap "24 jam kerja, tetapi tidak setelah jadwalnya sendiri". Untuk booking online, jadwal sendiri = awal rentang paling awal.

### 3.6 Cabang

Kolom cabang booking tetap wajib. Booking online diisi **cabang aktif pertama** (urutan `sortOrder`) hanya untuk administrasi.

Di semua tampilan dan pesan, booking online menampilkan **"Online (WhatsApp)"** di tempat nama cabang.

### 3.7 Tidak mengunci slot

Booking online **tidak ikut**:
- penjaga anti-bentrok `appointment_no_overlap` (aturan database dibuat ulang hanya untuk kanal `KLINIK`, bagian 8.1);
- perhitungan slot kosong (`/daftar`, Booking Baru, Pindah jadwal);
- garis waktu jadwal di dasbor.

## 4. Alur customer di `/daftar`

Kuis v2, ringkasan, dan pilihan layanan tetap sama. Perubahan dimulai di layar **Layanan & biaya**.

### 4.1 Layanan & biaya

- Bila layanan yang dipilih adalah konsultasi **dan** layanan Konsultasi Online aktif, muncul pilihan **"Cara konsultasi"**:
  - **Datang ke klinik** — seperti sekarang: biaya booking ditransfer, harga layanan dibayar di klinik;
  - **Online lewat WhatsApp (telepon/video)** — biaya booking + harga Konsultasi Online ditransfer di muka.
- Pilihan bawaan: *Datang ke klinik*.
- Treatment (pasien Aesthetic lama) tidak menampilkan pilihan ini, karena treatment selalu di klinik.
- Rincian biaya mengikuti pilihan. Contoh online: "Biaya booking Rp 100.000 + Konsultasi Online Rp 250.000 = **Rp 350.000**, dibayar di muka."

### 4.2 Waktu Anda bisa dihubungi (pengganti layar Jadwal, khusus online)

- **Dokter:**
  - dipilih otomatis bila hanya satu dokter aktif;
  - bila lebih dari satu, customer memilih dokter dari daftar dokter yang ditampilkan di situs.
- **Rentang:**
  - customer menambah 1–3 rentang, masing-masing tanggal (hari ini s/d 14 hari), jam mulai, dan jam selesai;
  - pilihan jam per 30 menit, mengikuti aturan bagian 3.2.
  - Kesalahan (terlalu pendek, tumpang tindih, terlalu dekat) ditampilkan di bawah rentang yang bermasalah.
- **Teks bantuan:** *"Dokter akan menelepon atau video call lewat WhatsApp kapan saja di dalam salah satu rentang ini. Pilih waktu Anda benar-benar bisa menjawab."*
- Tidak ada penguncian slot 10 menit.

### 4.3 Data diri

Sama seperti booking klinik. Yang berbeda hanya teks kotak persetujuan biaya, versi online:

> Total biaya (biaya booking + Konsultasi Online) dibayar di muka dan tidak dikembalikan, tetapi tetap berlaku bila waktu luang Anda perlu diganti.

### 4.4 Kirim & halaman sukses

- **Kiriman ulang** (sinyal putus, tombol ditekan dua kali) menghasilkan booking yang sama. Kunci kirimannya dibuat browser saat customer memilih online, dan disimpan di `Intake.submissionKey` seperti token hold pada booking klinik.
- Server memeriksa ulang:
  - layanan Konsultasi Online aktif;
  - aturan rentang;
  - dokter aktif;
  - persetujuan, kuis, dan data diri dengan aturan yang sama seperti booking klinik.
- **Halaman sukses** menampilkan:
  - kode booking;
  - total transfer dengan rinciannya, rekening, dan batas transfer;
  - daftar rentang waktu luang;
  - nomor WhatsApp yang akan dihubungi dokter;
  - tombol **"Konfirmasi via WhatsApp"** seperti sekarang.

### 4.5 Cek booking

`/cek-booking` menampilkan status dan **rentang waktu luang** (bukan jam dan cabang) untuk booking online.

Customer belum bisa mengubah rentang atau membatalkan sendiri. Halaman mengarahkan customer menghubungi klinik lewat WhatsApp.

### 4.6 Penutupan sementara

Selama `REGISTRATION_CLOSED=true`, seluruh `/daftar` tertutup, termasuk pilihan online.

## 5. Alur resepsionis di panel admin

### 5.1 Booking Baru

- Ada pilihan **Konsultasi di klinik** (seperti sekarang) atau **Konsultasi online**. Pilihan online hanya muncul bila layanan Konsultasi Online aktif.
- **Untuk online:**
  - pilih pasien;
  - pilih dokter;
  - pilih sumber: *WhatsApp* atau *Telepon*. Walk-in tidak berlaku;
  - isi 1–3 rentang, dengan aturan bagian 3.2 versi resepsionis (boleh mulai sekarang).
- `bookingFee` dan `servicePrice` disalin otomatis.
- Panel setelah booking dibuat menampilkan **"Kirim instruksi transfer via WA"** dengan teks versi online (bagian 7.1).

### 5.2 Daftar Booking

- **Menunggu konfirmasi:** booking online ikut tampil di bagian ini dengan label **"Online"**, dengan rentang waktu luang di tempat jam. Verifikasi berjalan seperti biasa.
- **Bagian baru "Konsultasi online"** (di atas daftar per tanggal):
  - berisi booking online *Terkonfirmasi*;
  - diurutkan dari rentang terdekat yang belum berakhir; booking "Perlu waktu baru" paling atas;
  - tiap baris menampilkan kode, pasien, dokter, rentang, dan percobaan terakhir;
  - booking "Perlu waktu baru" diberi tanda **"Perlu waktu baru"**.
- **Daftar per tanggal:**
  - booking online *Menunggu konfirmasi* dan *Terkonfirmasi* **tidak** masuk, karena belum punya jam;
  - booking online yang sudah **dimulai** (*Hadir*/*Selesai*) masuk daftar tanggal konsultasinya dengan label "Online", sebagai catatan kegiatan hari itu.
- **Pencarian** menemukan booking online seperti booking lain.

### 5.3 Aksi di baris booking online

| Aksi | Booking online |
|---|---|
| Verifikasi, Kirim/Salin instruksi transfer, Link kuis, Batalkan | Sama seperti booking klinik |
| Kirim/Salin konfirmasi | Sama, dengan teks versi online (bagian 7.2) |
| Check-in, Tidak hadir, Pindah jadwal | **Tidak ada** |
| **Ubah waktu luang** (baru) | Untuk *Menunggu konfirmasi* dan *Terkonfirmasi* |
| **Minta waktu baru via WA** (baru) | Hanya saat "Perlu waktu baru" |

**Ubah waktu luang:**
- dialog mengganti seluruh rentang (1–3) dengan aturan bagian 3.2 versi resepsionis;
- menyimpan menghitung ulang `startAt`/`endAt` (bagian 3.5) dan tercatat di jejak audit;
- bila rentang baru belum berakhir, keadaan "Perlu waktu baru" hilang dengan sendirinya.

**Minta waktu baru via WA:** membuka WA ke nomor pasien dengan teks bagian 7.3. Tidak mengubah apa pun di booking.

### 5.4 Setelah Verifikasi

Dialog konfirmasi setelah Verifikasi (spec C2 3.1) memakai teks konfirmasi versi online (bagian 7.2).

## 6. Alur dokter

### 6.1 Dasbor: bagian "Konsultasi online"

Bagian baru di dasbor untuk pemegang `record:write` (dokter, Super Admin), di dekat "Pasien hari ini".

**Isinya** adalah booking online *Terkonfirmasi* yang masih punya rentang belum berakhir, dikelompokkan:
- **Sekarang** — waktu sekarang berada di dalam salah satu rentang. Ditandai dan ditaruh paling atas;
- **Hari ini** — ada rentang hari ini yang belum dimulai;
- **Mendatang** — rentang terdekat ada di hari lain.

Booking yang semua rentangnya sudah berakhir pindah ke daftar resepsionis sebagai "Perlu waktu baru".

**Setiap baris menampilkan:**
- nama pasien dan no. RM;
- dokter (bila dokter aktif lebih dari satu);
- tujuan dari kuis (Slimming, Aesthetic, Gizi klinik, Belum yakin);
- rentang waktu luang, dengan rentang yang sedang berlangsung ditandai;
- **nomor WhatsApp yang bisa diketuk** (`https://wa.me/<nomor>`) untuk membuka chat atau panggilan WA;
- percobaan sebelumnya, misalnya "Dicoba 7 Okt 19.40 — tidak terhubung (dr. Diane)";
- tautan **Lihat isian** bila kuis sudah diisi.

### 6.2 Mulai konsultasi

Dalam satu transaksi:
- booking berpindah dari *Terkonfirmasi* ke *Hadir* dengan **perpindahan status bersyarat**;
- `startAt` dan `endAt` diisi menurut bagian 3.5;
- kunjungan (catatan dokter) dibuat seperti `openEncounter`.

Setelah itu dokter langsung dibawa ke halaman catatan dokter.

- Boleh ditekan **di luar rentang**, misalnya customer sendiri yang menelepon lebih awal. Rentang hanya panduan.
- Dua dokter atau dua klik bersamaan menghasilkan **satu** kunjungan. Yang kedua dibawa ke kunjungan yang sama.
- `checkedInAt` tidak diisi, karena kolom itu khusus check-in di meja depan.

### 6.3 Tidak terhubung

Mencatat satu **percobaan menghubungi**: waktu, id dan nama dokter. Status booking tidak berubah, dan booking tetap di daftar dokter selama masih ada rentang yang belum berakhir.

### 6.4 Halaman catatan dokter

- Sama seperti kunjungan klinik, dengan label **"Konsultasi online"** di kepala halaman dan "Online (WhatsApp)" di tempat cabang.
- Tanda vital boleh kosong (seperti sekarang). Berat badan boleh diisi dari pengakuan customer.
- **Food recall:**
  - tidak ditawarkan otomatis, karena tidak ada check-in;
  - tab Food recall menampilkan keadaan "Food recall tidak ditawarkan saat check-in" dengan **Isi sendiri** dan **Tawarkan sekarang** (sudah ada dari spec check-in 5.1);
  - link yang ditawarkan berlaku hari itu juga, karena tanggal booking sudah diisi waktu konsultasi.
- Setelah dimulai, booking tampil di **"Pasien hari ini"** dengan label **Online**. Bila belum difinalisasi di hari itu, ia masuk **"Catatan belum final"** seperti biasa.

## 7. Pesan WhatsApp versi online

Semua pesan hanya memakai nama depan dan nama dokter. Tanpa NIK, tanpa catatan klinis.

**Format rentang di pesan** (satu baris per rentang):
```
• Senin, 7 Oktober, 19.00–21.00
• Rabu, 9 Oktober, 10.00–12.00
```

### 7.1 Instruksi transfer

```
Halo {nama depan}, konsultasi online Anda di SunDY Clinic sudah kami catat.
Kode: {kode}
Layanan: Konsultasi Online lewat WhatsApp dengan {dokter}
Waktu Anda bisa dihubungi:
{daftar rentang}

Mohon transfer {total} (biaya booking {biaya booking} + Konsultasi Online {harga}) paling lambat {batas} ke:
{rekening}
lalu kirim bukti transfer di chat ini.

Biaya ini dibayar di muka dan tidak dikembalikan, tetapi tetap berlaku bila waktu Anda perlu diganti.
```

Diikuti baris link kuis bila kuis belum diisi, seperti booking klinik (spec C3 4.1).

### 7.2 Konfirmasi (setelah Verifikasi)

```
Halo {nama depan}, pembayaran konsultasi online Anda ({kode}) sudah kami terima.
{dokter} akan menelepon atau video call lewat WhatsApp ke nomor ini kapan saja di dalam salah satu waktu berikut:
{daftar rentang}
Mohon pastikan nomor ini aktif dan bisa menerima panggilan. Bila waktu Anda berubah, balas pesan ini.
```

### 7.3 Minta waktu baru

```
Halo {nama depan}, {dokter} sudah mencoba menghubungi Anda untuk konsultasi online ({kode}), tetapi belum tersambung.
Mohon kirim 1–3 pilihan hari dan jam Anda bisa dihubungi (mis. "Senin 19.00–21.00"). Biaya yang sudah dibayar tetap berlaku.
```

Bila belum ada percobaan tercatat (semua rentang lewat tanpa telepon), kalimat pertama menjadi: *"…waktu yang Anda pilih untuk konsultasi online ({kode}) sudah lewat."*

### 7.4 Pengingat H-1

Booking online *Terkonfirmasi* masuk **Pengingat H-1** bila tanggal rentang paling awal yang belum berakhir adalah **besok** (tanggal WITA). Satu pengingat per booking, menyebut semua rentang di tanggal itu.

```
Halo {nama depan}, mengingatkan: besok, {hari tanggal}, {dokter} akan menghubungi Anda lewat WhatsApp antara {jam mulai}–{jam selesai} untuk konsultasi online ({kode}). Mohon pastikan nomor ini aktif.
```

Bila booking punya beberapa rentang di hari yang sama, pesan menyebut semuanya ("antara 10.00–12.00 atau 19.00–21.00").

**Konfirmasi belum dikirim** di halaman Pengingat ikut memuat booking online.

## 8. Data & teknis

### 8.1 Model & migrasi

**`Appointment`:**
- `channel AppointmentChannel @default(KLINIK)` (`KLINIK`, `ONLINE`). Semua booking lama otomatis `KLINIK`;
- `servicePrice Int?` — salinan harga Konsultasi Online. Wajib terisi untuk `ONLINE`, selalu kosong untuk `KLINIK`.

**`ContactWindow` (baru)** — rentang waktu luang:
- `id`;
- `appointmentId` (relasi ke `Appointment`, onDelete Cascade);
- `startAt`, `endAt`;
- `createdAt`;
- indeks `[appointmentId, startAt]`.

Mengubah waktu luang mengganti seluruh baris booking itu dalam satu transaksi.

**`ContactAttempt` (baru)** — percobaan menghubungi yang gagal:
- `id`;
- `appointmentId` (relasi ke `Appointment`, onDelete Cascade);
- `at`;
- `staffId`, `staffName` (disalin seperti jejak audit, tanpa relasi);
- indeks `[appointmentId, at]`.

**CHECK di database:**
- `appointment_online_consultation`: booking `ONLINE` berjenis `KONSULTASI` dan `servicePrice` terisi; booking `KLINIK` memiliki `servicePrice` kosong;
- `contact_window_range`: `endAt > startAt`.

**Penjaga anti-bentrok dibuat ulang:**
- `appointment_no_overlap` dihapus lalu dibuat lagi dengan syarat `WHERE channel = 'KLINIK' AND status IN ('MENUNGGU_KONFIRMASI','TERKONFIRMASI','HADIR')`.
- Ini satu-satunya `DROP` di migrasi, dan menyangkut aturan, bukan kolom.
- Aman dengan pola deploy (migrasi sebelum build, rilis lama tetap melayani): rilis lama tidak pernah membuat booking online, dan untuk booking klinik aturan barunya sama persis.
- Penghapusan dan pembuatan ulang berlangsung dalam satu transaksi migrasi.

**Layanan:** migrasi data membuat layanan "Konsultasi Online" (slug `konsultasi-online`, kategori sama dengan "Konsultasi Dokter", `requiresDoctor = true`, `isActive = false`, durasi 30 menit, harga 0) bila belum ada.

### 8.2 Query yang harus menyaring kanal

| Tempat | Penyaringan |
|---|---|
| Ketersediaan slot (`computeAvailability`, `computeAvailabilityRange`) | Hanya `KLINIK` |
| Garis waktu dasbor | Hanya `KLINIK` |
| Daftar booking per tanggal | `KLINIK`, ditambah `ONLINE` berstatus *Hadir*/*Selesai* |
| Check-in, Tidak hadir, Pindah jadwal (server) | Menolak `ONLINE` |
| Katalog layanan publik | Tanpa layanan `konsultasi-online` |

### 8.3 Hak akses

| Aksi | Kemampuan |
|---|---|
| Buat booking online, verifikasi, ubah waktu luang, minta waktu baru, batalkan | `booking:manage` (resepsionis, dokter, Super Admin) |
| Bagian "Konsultasi online" di dasbor, Mulai konsultasi, Tidak terhubung | `record:write` (dokter, Super Admin) |

### 8.4 Jejak audit

Dicatat dengan pola audit yang ada:
- `appointment.create` dengan ringkasan memuat "online";
- `appointment.update-windows` (ringkasan: rentang lama → baru);
- `appointment.contact-failed`;
- `appointment.start-online`.

### 8.5 NIK

Konsultasi online **tidak menanyakan NIK**, karena KTP tidak bisa diperiksa dari jauh. Pasien yang NIK-nya masih kosong akan ditanya saat check-in pertama di klinik (spec check-in 3.2).

## 9. Kasus khusus

| Kasus | Perilaku |
|---|---|
| Layanan Konsultasi Online dinonaktifkan saat masih ada booking online aktif | Booking yang ada tetap berjalan; hanya pilihan untuk booking baru yang hilang |
| Harga Konsultasi Online diubah setelah booking dibuat | Booking memakai `servicePrice` yang disalin; pesan memakai angka itu |
| Customer belum transfer sampai semua rentang lewat | Booking situs kedaluwarsa menurut aturan 24 jam kerja; booking admin tetap *Menunggu konfirmasi*. Bila diverifikasi setelah semua rentang lewat, booking langsung "Perlu waktu baru" |
| Dua dokter menekan Mulai konsultasi bersamaan | Satu perpindahan status berhasil; keduanya dibawa ke kunjungan yang sama |
| Mulai konsultasi untuk booking yang baru dibatalkan | Ditolak: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman." |
| Customer menelepon sendiri di luar rentang | Dokter tetap boleh Mulai konsultasi |
| Dokter cuti/nonaktif dengan booking online terkonfirmasi | Booking tetap tampil di daftar resepsionis; resepsionis menghubungi customer (mengganti dokter di luar cakupan) |
| Rentang melewati tengah malam | Tidak mungkin: jam dibatasi 08.00–21.00 di tanggal yang sama |

## 10. Pengujian

**Unit**
- Aturan rentang:
  - batas jam 08.00–21.00, kelipatan 30 menit, panjang minimal 1 jam;
  - tumpang tindih; batas 2 jam (customer) dan sekarang (resepsionis); batas 14 hari; jumlah 1–3.
- Pengelompokan dasbor dokter: Sekarang / Hari ini / Mendatang, dan keadaan "Perlu waktu baru".
- Teks pesan versi online:
  - instruksi transfer (total dan rincian);
  - konfirmasi;
  - minta waktu baru (dengan dan tanpa percobaan);
  - pengingat H-1 (satu dan beberapa rentang di hari yang sama).
- Komponen:
  - pilihan "Cara konsultasi" dan rincian biaya;
  - layar waktu luang (tambah/hapus rentang, pesan galat);
  - dialog Ubah waktu luang;
  - baris online di daftar booking dan dasbor dokter.

**Integrasi**
- Booking online situs dan admin: kanal, biaya yang disalin, rentang, `startAt`/`endAt`.
- Booking online **tidak mengurangi** slot klinik dokter yang sama dan tidak ditolak penjaga anti-bentrok. Booking klinik tetap saling bentrok seperti sebelumnya.
- Kiriman ulang menghasilkan booking yang sama.
- Layanan nonaktif → booking online ditolak.
- Verifikasi; Mulai konsultasi (status Hadir, tanggal terisi, kunjungan dibuat; bersamaan → satu kunjungan); Tidak terhubung; Ubah waktu luang; check-in/tidak hadir/pindah jadwal menolak booking online.
- Hak akses: resepsionis tidak bisa Mulai konsultasi atau mencatat Tidak terhubung.
- Migrasi: CHECK kanal, penjaga anti-bentrok hanya untuk `KLINIK`.

**E2E**
- Customer memilih *Online* di `/daftar`, mengisi dua rentang, dan melihat total transfer di halaman sukses → resepsionis memverifikasi → dokter melihatnya di "Konsultasi online", menekan Mulai konsultasi, mengisi penilaian, dan memfinalisasi.
- Resepsionis membuat booking online dari Booking Baru dengan rentang yang sudah lewat → booking tampil "Perlu waktu baru" → Ubah waktu luang → booking kembali ke daftar dokter.

## 11. Di luar cakupan

- Panggilan video di dalam aplikasi; panggilan tetap lewat WhatsApp.
- Pembayaran otomatis (payment gateway).
- Customer mengubah rentang atau membatalkan sendiri dari `/cek-booking`.
- Mengganti dokter pada booking online.
- Angka atau laporan khusus konsultasi online di dasbor Super Admin.
- Pengingat otomatis saat rentang dimulai.
- Treatment online.
