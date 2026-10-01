# Desain — UI Panel Admin Bagian C2: Konfirmasi, Pengingat H-1, dan Pindah Jadwal

- **Versi:** 1.0
- **Tanggal:** 2 Oktober 2026
- **Status:** Disetujui pemilik (2 Oktober 2026) · terlaksana (2 Oktober 2026)
- **Melengkapi:**
  - `docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md` (C1: Booking Baru, instruksi transfer, daftar "Menunggu konfirmasi");
  - PRD `docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md` F9 (aksi booking, termasuk jadwal ulang) dan F17 (pola pengingat dan aturan hari libur).
- **Mockup:** companion visual 2 Oktober 2026. Tata letak "A" disetujui pemilik. Berkasnya disimpan lokal di `.superpowers/brainstorm/` (tidak masuk git).

## 1. Latar belakang & tujuan

Setelah C1, admin sudah bisa mencatat booking WA/telepon dan mengirim instruksi transfer. Tiga pesan berikutnya masih lambat atau tidak terpantau.

**Konfirmasi setelah verifikasi**
- Setelah admin menekan Verifikasi di daftar "Menunggu konfirmasi", baris itu langsung hilang dari daftar. Tombol "Kirim konfirmasi" baru bisa ditemukan di daftar per tanggal.
- Pesan konfirmasi belum memuat alamat, peta, aturan pindah jadwal, dan tautan cek booking.
- Tidak ada tanda mana konfirmasi yang sudah dikirim.

**Pengingat H-1:** belum ada sama sekali.

**Pindah jadwal**
- Fungsi server `rescheduleAppointment` sudah ada, tetapi panel belum punya tombolnya.
- Pasien yang ingin pindah jadwal terpaksa dibatalkan lalu dibuatkan booking baru. Akibatnya biaya booking tercatat dua kali, dan riwayatnya terputus.

**Berhasil bila:**
- setiap booking terkonfirmasi menerima konfirmasi yang lengkap, dan setiap pasien diingatkan sehari kerja sebelum jadwalnya, tanpa admin mengetik pesan sendiri;
- admin bisa melihat dalam satu halaman pesan apa yang masih harus dikirim dan balasan apa yang belum dicatat;
- pindah jadwal dilakukan pada booking yang sama.

## 2. Keputusan (dikonfirmasi pemilik, 2 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| P1 | Masalah konfirmasi | Ketiganya: tombol kirim hilang setelah Verifikasi, isi pesan kurang, tidak tahu sudah dikirim |
| P2 | Tambahan isi pesan konfirmasi | Alamat + Google Maps, datang 10 menit lebih awal, aturan pindah/batal, tautan cek booking |
| P3 | Letak pengingat | Halaman baru **Pengingat** di menu samping. Pengingat kontrol mingguan F17 nanti masuk ke halaman yang sama |
| P4 | Booking yang diingatkan | Hanya **Terkonfirmasi** |
| P5 | Yang dicatat setelah pengingat | "Sudah dikirim" **dan** balasan pasien: Akan datang / Minta pindah / Tidak membalas |
| P6 | Penyimpanan | Tabel catatan pesan per booking (`AppointmentMessage`), dengan riwayat |
| P7 | Tata letak Pengingat | A: daftar kerja bertingkat (tiga kotak, dikerjakan dari atas ke bawah) |
| P8 | Pindah jadwal | Masuk C2 |

## 3. Konfirmasi setelah verifikasi

### 3.1 Dialog setelah Verifikasi

Setelah **Verifikasi** berhasil, di mana pun tombol itu ditekan, dialog muncul berisi:
- **"✓ Booking {kode} terkonfirmasi"**, dengan nama pasien, jadwal, dan tenaga;
- **Kirim konfirmasi via WA:** tautan `wa.me` ke nomor pasien dengan teks bagian 3.2. Menekannya mencatat pengiriman (bagian 6);
- **Salin teks**;
- **Nanti saja:** menutup dialog. Booking itu tetap muncul di Pengingat → "Konfirmasi belum dikirim".

Bila nomor WA pasien tidak sah, tombol WA tidak tampil. Yang tersedia hanya **Salin teks**, dengan keterangan "Nomor WhatsApp pasien tidak dikenali".

### 3.2 Teks konfirmasi

```
Halo {nama pasien}, booking Anda di SunDY Clinic sudah terkonfirmasi.

Kode booking: {kode}
Layanan: {layanan}
Jadwal: {hari, tanggal bulan tahun} pukul {HH.MM} WITA
Tenaga: {nama tenaga} · {cabang}
Alamat: {alamat cabang}
Peta: {tautan peta cabang}

Mohon datang 10 menit sebelum jadwal.
Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya; biaya booking tetap berlaku. Bila dibatalkan, biaya booking tidak dikembalikan.
Cek status booking: https://sundyclinic.com/cek-booking?kode={kode}

Sampai jumpa di klinik.
```

**Aturan:**
- **Peta:** baris "Peta" dilewati bila `Branch.mapsUrl` kosong.
- **Walk-in, atau booking tanpa biaya** (`bookingFee` kosong): kalimat pindah jadwal menjadi "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya." tanpa dua kalimat tentang biaya booking.
- **Tautan cek booking:** memakai alamat situs dari `BETTER_AUTH_URL` yang sudah ada di `.env` (produksi `https://sundyclinic.com`), bukan alamat yang ditulis di kode.
- **Teks yang sama** dipakai di dialog Verifikasi, di baris booking ("Kirim konfirmasi" / "Salin konfirmasi"), di halaman Pengingat, dan setelah pindah jadwal.

### 3.3 Cek booking dengan kode terisi

`/cek-booking?kode={kode}` mengisi kolom kode booking secara otomatis. Customer cukup mengetik 4 digit akhir nomor WhatsApp. Aturan pemeriksaannya tidak berubah, karena kode saja tidak cukup untuk membuka status.

## 4. Halaman Pengingat (`/admin/pengingat`)

**Menu "Pengingat"**
- Berada di menu samping, di bawah Booking. Hak aksesnya `booking:manage`, sehingga resepsionis bisa membukanya.
- Angkanya adalah jumlah isi kotak 1 dan kotak 2, yaitu pesan yang masih harus dikirim. Angka tidak tampil bila nol.

Halaman berjudul "Pengingat · {hari, tanggal bulan}" (hari ini, WITA) dan berisi tiga kotak berurutan. Setiap kotak menampilkan "Tidak ada" bila kosong.

### 4.1 Kotak 1 · Konfirmasi belum dikirim

**Isinya:** booking yang memenuhi semua syarat berikut:
- status **Terkonfirmasi**;
- jadwalnya belum lewat;
- belum punya catatan konfirmasi yang berlaku untuk jadwal saat ini (bagian 6).

**Urutan:** jadwal terdekat di atas.

**Isi baris:**
- nama pasien, kode, jadwal, dan tenaga;
- tombol **Kirim konfirmasi** (WA) dan **Salin**.

Setelah tombol WA ditekan, baris itu keluar dari kotak 1.

### 4.2 Kotak 2 · Ingatkan sekarang

**Hari pengingat** suatu booking adalah hari buka terakhir sebelum tanggal jadwalnya. Hari Minggu dan tanggal libur (`Holiday`) dilewati. Contoh:
- jadwal Senin → diingatkan Sabtu;
- jadwal Rabu setelah Selasa libur → diingatkan Senin.

**Isinya:** booking yang memenuhi semua syarat berikut:
- status **Terkonfirmasi**;
- hari pengingatnya hari ini atau sudah lewat;
- jadwalnya belum lewat;
- belum punya catatan pengingat yang berlaku untuk jadwal saat ini.

**Dikecualikan:** booking yang catatan konfirmasinya (untuk jadwal saat ini) dikirim **pada hari pengingat atau sesudahnya**. Pasien itu baru saja menerima jadwalnya. Contohnya booking untuk besok yang dibuat dan dikonfirmasi hari ini, atau booking untuk hari ini.

**Urutan:**
- Booking yang hari pengingatnya sudah lewat diberi label merah **"terlambat"** dan ditaruh paling atas.
- Sisanya urut menurut jadwal.

**Isi baris:**
- nama pasien, jadwal, tenaga, dan keterangan bila hari pengingatnya berbeda dari hari sebelum jadwal (mis. "Minggu tutup, jadi diingatkan hari ini");
- tombol **Ingatkan via WA**, dengan teks bagian 4.4. Setelah ditekan, baris itu pindah ke kotak 3.

### 4.3 Kotak 3 · Sudah diingatkan — catat balasannya

**Isinya:** booking **Terkonfirmasi** yang punya catatan pengingat yang berlaku dan jadwalnya belum lewat.

**Urutan:** menurut jadwal.

**Isi baris:**
- nama pasien, jadwal, dan "diingatkan {jam} oleh {nama}";
- bila balasan belum dicatat: tombol **Akan datang**, **Minta pindah**, dan **Tidak membalas**;
- bila balasan sudah dicatat: label (mis. "✓ Akan datang") dengan tautan **ubah**, yang menampilkan kembali ketiga tombol tadi.

**Tindakan tambahan:**
- Baris dengan balasan **Minta pindah** menampilkan tombol **Pindah jadwal** (bagian 5).
- **Batalkan tanda:** untuk WA yang ternyata tidak terkirim. Catatan pengingat ditandai batal (tidak dihapus), dan baris kembali ke kotak 2.

### 4.4 Teks pengingat

```
Halo {nama pasien}, kami mengingatkan jadwal Anda di SunDY Clinic:
{hari, tanggal bulan tahun} pukul {HH.MM} WITA
{layanan} dengan {nama tenaga}
{cabang} — {alamat cabang}
Peta: {tautan peta cabang}

Mohon datang 10 menit sebelum jadwal. Balas YA bila Anda akan datang, atau kabari kami bila ingin pindah jadwal.
```

- Tanggal selalu ditulis lengkap, tidak memakai "besok", karena pengingat hari Sabtu bisa untuk jadwal Senin.
- Baris "Peta" dilewati bila tautan peta kosong.

### 4.5 Di daftar Booking

**Baris booking** (`AppointmentTable`) menampilkan keterangan kecil dari catatan pesan yang berlaku:
- "Instruksi transfer terkirim {jam}";
- "Konfirmasi terkirim {jam} · {nama}";
- "Diingatkan {jam}", ditambah balasannya bila sudah dicatat (mis. "· Akan datang").

Jam ditulis dengan tanggal singkat bila bukan hari ini.

**Tombol kirim yang sudah ada juga mencatat pengiriman:** "Kirim instruksi transfer" (baris booking dan panel "Booking dibuat" C1), serta "Kirim konfirmasi".

**Menu ⋯** bertambah **Pindah jadwal** untuk booking Menunggu konfirmasi dan Terkonfirmasi, kecuali booking situs yang belum dicocokkan.

## 5. Pindah jadwal

Dibuka dari menu ⋯ di daftar Booking, atau dari baris "Minta pindah" di halaman Pengingat.

**Isi dialog:**
- jadwal saat ini (tanggal, jam, tenaga, cabang);
- strip 14 hari dan pilihan jam, memakai komponen C1 (`DateStrip`, `SlotPicker`);
- tenaga, cabang, dan durasi tetap sama dengan booking itu;
- tombol **Simpan jadwal baru**.

**Aturan:**
- **Hanya tanggal dan jam yang berubah.** Untuk ganti tenaga atau cabang, booking dibatalkan lalu dibuat baru. Keterangan ini ditulis di dialog.
- **Jam milik booking itu sendiri tidak dihitung terisi**, sehingga booking bisa digeser ke jam yang tumpang tindih dengan jam lamanya (mis. maju 30 menit).
- **Jam direbut booking lain:** pesan galat yang sudah ada ("Slot baru saja terisi. Pilih jam lain.") tampil, lalu strip dan daftar jam dimuat ulang. Tanggal yang dipilih tetap terpilih.
- **Biaya booking, kode, dan riwayat** tetap pada booking yang sama. Audit `appointment.reschedule` tetap dicatat seperti sekarang.
- **Batas transfer** booking yang belum transfer tetap dihitung dari jam booking dibuat. Batas itu tidak pernah melewati jadwal baru (aturan C1).

**Setelah tersimpan,** dialog menampilkan "Jadwal dipindah ke {jadwal baru}", diikuti salah satu:
- booking **Terkonfirmasi:** **Kirim konfirmasi jadwal baru via WA** dan **Salin teks**, memakai teks bagian 3.2 dengan jadwal baru;
- booking **WA/telepon yang belum transfer:** **Kirim instruksi transfer** dan **Salin teks**, memakai teks C1 dengan jadwal baru;
- **lainnya:** hanya **Tutup**.

**Catatan pesan lama** (konfirmasi, pengingat, dan balasannya) untuk jadwal lama otomatis tidak berlaku. Akibatnya booking Terkonfirmasi kembali muncul di kotak 1 sampai konfirmasi jadwal barunya dikirim.

## 6. Data dan server

**Satu migrasi aditif.** Tabel `Appointment` tidak diubah, sehingga kunci rekam medis final (`appointment_record_locked`) tidak tersentuh.

**Tabel `AppointmentMessage`** berisi satu baris per pesan WA yang dicatat terkirim:

| Kolom | Isi |
|---|---|
| `appointmentId` | booking yang dituju |
| `kind` | `INSTRUKSI_TRANSFER` / `KONFIRMASI` / `PENGINGAT` |
| `scheduledFor` | `startAt` booking saat pesan dicatat |
| `sentAt`, pengirim | kapan, dan siapa (id staf atau pengguna, plus nama saat itu, seperti jejak audit) |
| `revokedAt`, pembatal | diisi oleh "Batalkan tanda" |
| `reply` | khusus pengingat: `AKAN_DATANG` / `MINTA_PINDAH` / `TIDAK_MEMBALAS`, atau kosong |
| `repliedAt`, pencatat balasan | kapan, dan siapa |

**Kapan sebuah catatan berlaku:**
- catatan tidak dibatalkan, dan `scheduledFor` sama dengan `startAt` booking saat ini;
- bila ada beberapa catatan berlaku dengan jenis yang sama, yang dipakai adalah yang terakhir.

**Aksi server** (semuanya `booking:manage`, tanpa data klinis):
- **mencatat pengiriman** `{ appointmentId, kind }`. Jenis pesan harus cocok dengan keadaan booking:
  - instruksi transfer hanya untuk booking yang menunggu transfer (aturan C1);
  - konfirmasi dan pengingat hanya untuk booking Terkonfirmasi;
- **membatalkan tanda** sebuah catatan;
- **mencatat atau mengubah balasan** sebuah catatan pengingat yang masih berlaku;
- **daftar kerja Pengingat**: tiga kotak bagian 4, dan jumlah untuk menu samping;
- **teks konfirmasi dan teks pengingat** sebuah booking, beserta tautan WA-nya. Teks disusun di server dari data booking dan cabang;
- **pindah jadwal:** memakai `rescheduleAppointment` yang ada. Pemeriksaan ketersediaan (strip dan jam) menerima pengecualian satu booking (jam booking itu sendiri tidak dihitung terisi). Exclusion constraint basis data tetap menjadi penjaga terakhir;
- **jam booking itu sendiri:** fungsi ketersediaan admin (`getStaffAvailabilityForAdmin`, `getStaffAvailabilityRange`) menerima `excludeAppointmentId` opsional.

**Fungsi murni:**
- penyusun teks konfirmasi dan teks pengingat;
- `reminderDay(tanggal jadwal, tanggal libur)`: hari buka terakhir sebelum tanggal jadwal;
- pengelompokan booking ke kotak 1–3 dari data booking dan catatan pesan.

**Mencatat dari tombol WA:**
- Tautan WA dibuka di tab baru. Pada saat yang sama, aksi pencatatan dipanggil.
- Bila pencatatan gagal, toast galat tampil dan baris tetap di kotaknya, sehingga admin bisa menekan lagi.
- "Salin teks" tidak mencatat pengiriman, karena admin belum tentu mengirimnya.

## 7. Kasus khusus

- **Booking dibatalkan, ditandai Hadir/Tidak hadir, atau jadwalnya lewat:** keluar dari semua kotak Pengingat. Catatannya tetap tersimpan.
- **Konfirmasi dikirim ulang:** catatan baru ditambahkan, dan keterangan di baris memakai kiriman terakhir.
- **Admin membuka Pengingat pada hari Minggu atau tanggal libur:** booking yang hari pengingatnya kemarin dan belum diingatkan tampil di kotak 2 sebagai "terlambat".
- **Booking situs:** mengikuti aturan yang sama setelah diverifikasi. Instruksi transfer tetap tidak ada untuk booking situs (aturan C1).
- **Tenaga tanpa jadwal di 14 hari ke depan saat pindah jadwal:** sama seperti Booking Baru, yaitu semua hari "tutup" dengan petunjuk "Pilih tanggal lain".
- **Dua admin mengirim pengingat yang sama hampir bersamaan:** keduanya tercatat, dan baris tetap di kotak 3. Tidak ada galat.

## 8. Pengujian

**Unit:**
- teks konfirmasi: lengkap; tanpa peta; walk-in tanpa kalimat biaya; tautan cek booking berisi kode;
- teks pengingat: tanggal lengkap; tanpa peta;
- `reminderDay`: hari biasa; Senin → Sabtu; melewati tanggal libur; libur berurutan;
- pengelompokan kotak 1–3, termasuk:
  - label "terlambat" dan urutannya;
  - pengecualian konfirmasi yang dikirim pada hari pengingat;
  - catatan yang dibatalkan;
  - catatan untuk jadwal lama;
- dialog setelah Verifikasi: tautan WA berisi nomor pasien dan kode; Salin teks; nomor tidak sah; Nanti saja;
- halaman Pengingat: tombol WA memanggil pencatatan; tombol balasan; ubah; Batalkan tanda; galat pencatatan;
- dialog Pindah jadwal:
  - jadwal saat ini;
  - simpan;
  - jam direbut (pesan, muat ulang, tanggal tetap);
  - tombol kirim yang sesuai status booking;
- `bookingRowActions`: Pindah jadwal di menu ⋯ untuk status yang benar, dan tidak untuk booking situs yang belum dicocokkan;
- `/cek-booking?kode=` mengisi kolom kode.

**Integrasi:**
- mencatat pengiriman: jenis yang tidak cocok dengan keadaan booking ditolak; `scheduledFor` terisi;
- membatalkan tanda; balasan hanya untuk catatan pengingat yang berlaku;
- daftar kerja dan angka menu untuk data campuran:
  - Terkonfirmasi, Menunggu, dan Dibatalkan;
  - jadwal lewat;
  - hari pengingat yang melewati Minggu dan libur;
- setelah pindah jadwal: catatan lama tidak berlaku dan booking kembali ke kotak 1;
- ketersediaan dengan `excludeAppointmentId`: jam milik booking itu sendiri tersedia, jam booking lain tetap terisi;
- pindah jadwal ke jam yang tumpang tindih dengan jamnya sendiri berhasil, ke jam booking lain ditolak;
- resepsionis bisa memakai semua aksi di atas.

**E2E** (desktop dan ponsel):
- verifikasi booking WA → dialog → Kirim konfirmasi → baris menampilkan "Konfirmasi terkirim";
- halaman Pengingat: booking jadwal besok di kotak 2 → Ingatkan via WA → kotak 3 → Akan datang;
- Minta pindah → Pindah jadwal → booking kembali ke kotak 1 dengan jadwal baru.

## 9. Di luar cakupan

- Pengiriman otomatis lewat API WhatsApp (Fase 2 PRD).
- Pengingat kontrol mingguan slimming (F17, rekam medis sub-proyek 5). Kelak masuk ke halaman Pengingat yang sama.
- C3: link isi kuis (Plan 3b-2b). `AppointmentMessage` siap menerima jenis pesan baru.
- Mengganti tenaga atau cabang lewat Pindah jadwal.
- Bagian D: tampilan umum semua halaman dan dasbor.
