# Desain — UI Panel Admin Bagian D: Tampilan Seragam & Dasbor

- **Versi:** 1.0
- **Tanggal:** 2 Oktober 2026
- **Status:** Disetujui pemilik (2 Oktober 2026) · terlaksana (2 Oktober 2026)
- **Melengkapi:**
  - spec bagian B: `docs/superpowers/specs/2026-09-30-ui-alur-dokter-design.md`;
  - spec C1: `docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md`;
  - spec C2: `docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md`;
  - spec C3: `docs/superpowers/specs/2026-10-02-link-kuis-design.md`.
  - Alur halaman Booking, Booking Baru, Pengingat, Isian, dan Kunjungan di spec-spec itu tetap berlaku. Spec ini hanya mengubah tampilannya.
- **Mockup:** companion visual 2 Oktober 2026 (`.superpowers/brainstorm/66915-1790928630/`, lokal, tidak masuk git). Disetujui pemilik:
  - arah tampilan **A** (lapang);
  - dasbor **B** (garis waktu);
  - mockup halaman Jadwal, Data Pasien, Layanan & Harga, dan Pengaturan.

## 1. Latar belakang & tujuan

Bagian terakhir dari empat bagian perbaikan panel admin (A → B → C → D). Pemilik menilai panel kurang rapi dan informasi penting sulit ditemukan. Bagian B dan C sudah merapikan alur dokter dan booking.

Temuan dari screenshot 2 Oktober 2026:
- **Kepala halaman:** setiap halaman hanya punya judul kecil di bar atas. Tombol, pencarian, dan judul bagian ditata sendiri-sendiri di tiap halaman.
- **Dasbor:** hanya sapaan. Resepsionis bahkan hanya mendapat kalimat arahan.
- **Jadwal:** satu halaman panjang. Ada enam baris jam kerja yang masing-masing punya tombol Simpan, formulir pengecualian, lalu seluruh hari libur setahun.
- **Layanan & Harga:** 35 kartu, masing-masing dengan tombol Simpan. Harga tertulis tanpa format (`189000`).
- **Data Pasien:** semua bagian ditumpuk dalam satu kolom. Kolom data diri yang kosong memenuhi layar.
- **Pengaturan:** formulir polos tanpa pengelompokan.

**Berhasil bila:**
- semua halaman panel memakai kepala halaman, kartu, dan tabel yang sama;
- begitu membuka Dasbor, resepsionis tahu apa yang harus dikerjakan hari ini dan slot mana yang masih kosong, dokter melihat pasiennya, dan pemilik melihat angka minggu atau bulan ini;
- mengubah jam kerja seminggu atau harga satu layanan cukup sekali Simpan.

## 2. Keputusan (dikonfirmasi pemilik, 2 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| D1 | Isi dasbor | Pekerjaan hari ini, jadwal hari ini per tenaga, daftar dokter (sudah ada), dan angka ringkas pemilik |
| D2 | Halaman yang dirapikan | Semua halaman panel |
| D3 | Arah tampilan | **A · Lapang:** judul besar (Cormorant) + keterangan + tombol aksi di kanan, isi di kartu putih |
| D4 | Jadwal hari ini | **Garis waktu:** satu lajur jam per tenaga, blok booking berwarna menurut status, slot kosong terlihat |
| D5 | Angka | Booking & pasien baru, booking per sumber, tidak hadir & batal, biaya booking masuk |
| D6 | Periode angka | Bisa dipilih: **Minggu ini** (bawaan) atau **Bulan ini**, dibandingkan dengan periode sebelumnya |
| D7 | Klik garis waktu | Blok membuka booking itu. Slot kosong membuka Booking Baru dengan tenaga, tanggal, dan jam terisi |
| D8 | Yang melihat Angka | **Super Admin saja** |
| D9 | Rilis | **Satu rilis** untuk dasbor dan semua halaman |

## 3. Kerangka & bahan tampilan bersama

### 3.1 Komponen bersama
- **Kepala halaman:**
  - judul besar dengan huruf display (Cormorant);
  - keterangan satu baris (boleh kosong);
  - jejak lokasi opsional, misalnya "Pasien › Maria Wenas", yang setiap bagiannya bisa diklik;
  - tempat tombol aksi di kanan, yang turun ke bawah judul di layar sempit.
- **Badan halaman:** jarak tepi yang sama di semua halaman, dengan lebar isi dibatasi supaya tabel tidak melebar di layar besar. Halaman kunjungan (B) boleh memakai lebar penuh.
- **Kartu bagian:** judul, tempat tautan atau tombol kecil di kanan judul, lalu isi. Tabel di dalam kartu tidak punya bingkai sendiri.
- **Tab halaman:** tab yang dibuka tersimpan di alamat halaman (`?tab=`), jadi tetap sama setelah dimuat ulang dan bisa dibagikan. Tab yang tidak dikenal kembali ke tab pertama.
- **Kotak angka:**
  - berisi label, angka besar, dan satu baris keterangan;
  - seluruh kotak berupa tautan;
  - varian "perlu tindakan" bergaris emas.
- **Tampilan kosong:** kalimat singkat dengan gaya yang sama untuk daftar atau tabel tanpa data.

### 3.2 Bar atas & sidebar
- Bar atas tetap: tombol buka-tutup sidebar dan jejak lokasi kecil.
- Sidebar tidak berubah: krem, dua kelompok menu, angka di Booking dan Pengingat. Tidak ada menu baru.

### 3.3 Yang tidak berubah
- Isi dan alur Booking, Booking Baru, Pengingat, Isian, dan Kunjungan. Halaman-halaman ini hanya mendapat kepala halaman (bagian 5.7).
- Situs publik, warna, dan huruf SunDY.
- Tampilan HP tetap bukan prioritas, tetapi semua halaman harus tetap bisa dipakai di lebar 390 px tanpa gulir mendatar di seluruh halaman. Tabel boleh digulir di dalam kartunya.

## 4. Dasbor (`/admin`)

### 4.1 Kepala halaman
- **Sapaan menurut jam WITA:**
  - "Selamat pagi" (04.00–10.59);
  - "Selamat siang" (11.00–14.59);
  - "Selamat sore" (15.00–17.59);
  - "Selamat malam" (18.00–03.59);
  - diikuti nama depan staf.
- **Keterangan:**
  - tanggal hari ini, lalu "klinik buka {jam buka paling awal}–{jam tutup paling akhir}" dari jam kerja tenaga yang praktik hari ini;
  - "tidak ada jadwal praktik hari ini" bila tidak ada tenaga yang praktik;
  - "Klinik tutup hari ini — {nama libur}" pada hari libur.
- **Aksi:** **+ Booking Baru** (hak `booking:manage`).

### 4.2 Pekerjaan hari ini (hak `booking:manage`)
Empat kotak angka:

| Kotak | Angka | Keterangan | Tautan |
|---|---|---|---|
| Menunggu konfirmasi | sama dengan angka menu Booking | "N lewat batas transfer" bila ada | `/admin/booking` |
| Pesan WA belum dikirim | sama dengan angka menu Pengingat | "konfirmasi N · pengingat N" | `/admin/pengingat` |
| Booking hari ini | booking yang jadwalnya hari ini (WITA), tanpa yang dibatalkan atau kedaluwarsa | "N isian belum diisi" bila ada: booking admin yang link kuisnya berlaku dan belum dikirim (spec C3) | `/admin/booking?tanggal={hari ini}` |
| Sudah hadir | Hadir + Selesai, ditulis "N / total" dengan total = angka kotak sebelumnya | "N tidak hadir" bila ada | `/admin/booking?tanggal={hari ini}` |

- Kotak 1 dan 2 memakai varian "perlu tindakan" bila angkanya lebih dari 0.
- Booking situs yang menunggu pencocokan tidak dihitung terpisah, karena sudah termasuk di angka kotak 1.

### 4.3 Jadwal hari ini (hak `booking:manage`)
- **Lajur:** satu lajur untuk setiap tenaga yang praktik hari ini menurut jam kerja mingguan dan pengecualiannya, dengan aturan yang sama seperti perhitungan slot booking. Tenaga yang tidak praktik ditulis di satu baris kecil: "Tidak praktik hari ini: …".
- **Sumbu jam:**
  - dari jam buka paling awal sampai jam tutup paling akhir di antara lajur, dibulatkan ke jam penuh;
  - garis tipis menandai jam sekarang selama masih di dalam rentang.
- **Blok booking:**
  - posisi dan lebarnya sesuai jam mulai dan selesai;
  - labelnya nama depan pasien, ditambah layanan bila muat;
  - warna menurut status:

    | Status | Tampilan |
    |---|---|
    | Menunggu konfirmasi | garis putus emas |
    | Terkonfirmasi | emas |
    | Hadir, Selesai | hijau |
    | Tidak hadir | abu-abu |
    | Dibatalkan, Kedaluwarsa | tidak ditampilkan |

  - teks blok yang tidak muat terpotong, dengan nama lengkap, jam, layanan, dan status di tooltip serta label pembaca layar;
  - klik blok membuka `/admin/booking?tanggal={hari ini}&sorot={id}`.
- **Slot kosong:**
  - dihitung dengan fungsi ketersediaan admin yang sama dengan Booking Baru;
  - hanya slot yang belum lewat yang ditampilkan;
  - tampil sebagai kotak bergaris tipis;
  - klik slot membuka Booking Baru dengan tenaga, tanggal, dan jam terisi (bagian 5.8).
- **Kosong:**
  - "Tidak ada jadwal praktik hari ini." bila tidak ada lajur;
  - "Klinik tutup hari ini — {nama libur}." pada hari libur.

### 4.4 Daftar dokter (hak `record:read`)
- Kartu **Pasien hari ini** dan **Catatan belum final** berisi daftar yang sudah ada (spec catatan dokter 4.2), dipindah ke dalam kartu.
- Isinya, tombol Periksa, dan urutannya tidak berubah.

### 4.5 Angka (hak `report:read`, yaitu Super Admin saja)
**Pilihan periode** (`?periode=minggu|bulan`, bawaan minggu):
- **Minggu ini:** Senin 00.00 WITA sampai sekarang. Pembandingnya Senin minggu lalu sampai jam yang sama tujuh hari sebelumnya.
- **Bulan ini:** tanggal 1 pukul 00.00 WITA sampai sekarang. Pembandingnya tanggal 1 bulan lalu sampai tanggal dan jam yang sama di bulan lalu. Bila bulan lalu lebih pendek, misalnya 31 Maret dibanding Februari, pembandingnya berhenti di akhir bulan lalu.

**Angka:**

| Angka | Definisi |
|---|---|
| Booking | booking yang **dibuat** dalam periode (`createdAt`), semua sumber dan status |
| Per sumber | angka Booking dirinci: Situs, WhatsApp, Telepon, Walk-in |
| Pasien baru | data pasien yang **dibuat** dalam periode |
| Tidak hadir & batal | booking yang **jadwalnya** dalam periode, berstatus Tidak hadir, Dibatalkan, atau Kedaluwarsa, ditulis per status |
| Biaya booking masuk | jumlah `bookingFee` dari booking yang **diverifikasi** dalam periode, yaitu catatan audit `appointment.verify`. Satu booking dihitung sekali walau tercatat dua kali. Ditulis dalam rupiah |

- Booking, Pasien baru, dan Biaya booking masuk menampilkan selisih terhadap periode pembanding: "+4", "−2", atau "sama".
- Pendapatan layanan belum ada (menyusul bersama kasir, Plan 5).

### 4.6 Per peran

| Peran | Yang tampil |
|---|---|
| Resepsionis | kepala halaman, pekerjaan hari ini, jadwal hari ini |
| Dokter | + pasien hari ini & catatan belum final |
| Super Admin | semuanya, termasuk Angka |
| Terapis | sapaan saja (belum punya akses panel lain) |

- Hak `report:read` **dicabut dari Dokter**, karena belum dipakai di mana pun, sehingga Angka cukup dijaga dengan hak itu.
- Semua data diambil di server dengan pemeriksaan hak. Bagian yang tidak berhak tidak dimuat sama sekali.

### 4.7 Bila sebagian gagal
- Setiap bagian dasbor (pekerjaan hari ini, jadwal, daftar dokter, Angka) dimuat sendiri-sendiri.
- Bila satu bagian gagal, kartunya menulis "Gagal dimuat. Muat ulang halaman." dan bagian lain tetap tampil.
- Galat dicatat di log server.

## 5. Halaman lain

### 5.1 Jadwal (`/admin/jadwal`, hak `schedule:manage`)
**Kepala halaman**
- Keterangan: "Jam praktik tiap tenaga, cuti, dan hari libur klinik. Dipakai untuk slot booking situs dan admin."
- Pilihan tenaga di kanan, sebagai tombol segmen. Tetap memakai `?staf=`, dan tampil bila ada lebih dari satu tenaga.

**Tab** (`?tab=jam-kerja|pengecualian|hari-libur`)

- **Jam kerja:**
  - satu kartu "Jam kerja mingguan · {cabang}", berisi tabel Senin–Minggu dengan kolom *Buka* (centang), *Mulai*, dan *Selesai*;
  - satu tombol **Simpan jam kerja** di kepala kartu, aktif hanya bila ada perubahan;
  - hari yang tidak dicentang berarti tutup, yaitu jam kerja hari itu dihapus;
  - Minggu ikut tampil, jadi bisa dibuka;
  - **penyimpanan:** satu aksi server menyimpan ketujuh hari dalam satu transaksi. Bila satu hari tidak sah, misalnya jam mulai tidak sebelum jam selesai, tidak ada yang tersimpan dan galatnya menyebut harinya. Aturan jam yang sekarang tetap berlaku. Setiap hari yang berubah tercatat di jejak audit seperti sekarang;
  - **booking yang sudah ada** di hari yang ditutup atau di luar jam baru tidak diubah. Hari atau jam itu hanya tidak lagi menawarkan slot baru.
- **Pengecualian:**
  - formulir tambah seperti sekarang;
  - daftar pengecualian **mulai hari ini** dengan tombol **Hapus** (baru: sekarang pengecualian belum bisa dihapus), sedangkan yang sudah lewat tidak ditampilkan;
  - Hapus meminta konfirmasi dan tercatat di jejak audit. Booking yang sudah ada tidak berubah;
  - judul tab memuat jumlahnya, misalnya "Pengecualian (2)".
- **Hari libur:**
  - daftar hari libur tahun berjalan **mulai hari ini**, dengan tombol Hapus seperti sekarang;
  - yang sudah lewat dilipat di bawah "Sudah lewat (N)";
  - judul tab: "Hari libur {tahun}".

### 5.2 Pasien (`/admin/pasien`)
- **Kepala halaman:** judul "Pasien", keterangan "N pasien", dan tombol **+ Pasien Baru** di kanan.
- **Kartu:**
  - kotak cari berikon. Enter mencari, dan tombol Cari tetap ada untuk layar sentuh;
  - tabel No. RM · Nama (tautan) · WhatsApp · Program · **Kunjungan terakhir** · **Booking berikutnya**. Dua kolom terakhir memakai data ringkasan pasien yang sudah ada;
  - judul kartu "Pasien terbaru" tanpa pencarian, atau "Hasil untuk “…”" saat mencari.
- **Kosong:** "Belum ada pasien." atau "Tidak ada pasien yang cocok dengan “…”."

### 5.3 Data Pasien (`/admin/pasien/[id]`)
**Kepala halaman**
- Jejak "Pasien › {nama}".
- Judul = nama, lalu keterangan: no. RM · status program · "kunjungan terakhir {tanggal}" (bila ada).
- **Aksi:**
  - *(Perubahan saat menyusun plan, 2 Okt 2026: "Ubah no. RM kertas lama" tetap di kartu Data diri sebagai penyuntingan di tempat, sama seperti "Ubah catatan penting".)*
  - **+ Booking** (hak `booking:manage`), yang membuka Booking Baru dengan pasien ini terpilih (bagian 5.8).

**Dua kartu berdampingan** (bertumpuk di layar sempit)
- **Data diri:** WhatsApp, tanggal lahir (dengan umur), jenis kelamin, pekerjaan, dan alamat. Kolom kosong ditulis "—".
- **Catatan medis:**
  - alergi, riwayat penyakit & obat, dan catatan penting;
  - alergi yang terisi diberi tanda merah;
  - "Ubah catatan penting" tetap ada;
  - siapa yang melihat dan mengubahnya tetap sama seperti sekarang.

**Tab** (`?tab=kunjungan|booking|isian`)
- Judul tab memuat jumlah, misalnya "Kunjungan (4)".
- Isi tiap tab sama seperti bagian riwayat yang sekarang.
- Tab awal: Kunjungan bila ada kunjungan, Booking bila tidak.

### 5.4 Layanan & Harga (`/admin/layanan`, hak `content:manage`)
- **Kepala halaman:** keterangan "Perubahan harga langsung tampil di situs publik dan tercatat di jejak audit."
- **Bar saring:**
  - kotak cari nama layanan dan chip kategori ("Semua" + satu chip per kategori);
  - menyaring di browser tanpa memuat ulang;
  - kategori tanpa hasil disembunyikan;
  - bila tidak ada hasil sama sekali: "Tidak ada layanan yang cocok."
- **Kartu per kategori:** judul kategori + "N layanan", berisi tabel Layanan · Harga coret · Harga berlaku · aksi.
- **Masukan rupiah:**
  - diketik sebagai angka dan ditampilkan "Rp 189.000";
  - harga coret boleh kosong;
  - yang dikirim ke server tetap angka bulat.
- **Simpan & Batal:**
  - muncul di baris yang nilainya berbeda dari yang tersimpan;
  - Batal mengembalikan nilai tersimpan;
  - aturan harga dan pesan galat yang ada tetap berlaku.

### 5.5 Pengaturan (`/admin/pengaturan`, hak `content:manage`)
- **Kepala halaman:** keterangan "Setiap perubahan tercatat di jejak audit.", dengan tombol **Simpan pengaturan** di kanan.
- **Kartu Biaya booking:**
  - masukan rupiah;
  - keterangan yang ada: berlaku untuk situs, WhatsApp, dan telepon; walk-in tidak dikenai biaya; biaya terpisah dan tidak dikembalikan.
- **Kartu Rekening transfer:**
  - Bank, Nomor rekening, dan Atas nama;
  - pratinjau "Tampil ke pasien: {baris rekening}" memakai fungsi format yang sama dengan pesan WA dan kuitansi, atau tulisan pengganti yang sama bila belum lengkap.
- Validasi dan aksi penyimpanan tidak berubah.

### 5.6 Staf (`/admin/staf`, hak `staff:manage`)
- Kepala halaman dengan keterangan.
- Tabel di dalam kartu, dengan peran dan status sebagai tanda.
- Tidak ada fitur baru.

### 5.7 Booking, Booking Baru, Pengingat, Isian, Kunjungan
- **Kepala halaman baru:**

  | Halaman | Judul & keterangan |
  |---|---|
  | Booking | "Booking" + tanggal yang dilihat |
  | Booking Baru | "Booking Baru" + jejak "Booking › Baru" |
  | Pengingat | "Pengingat" + "Konfirmasi dan pengingat H-1 lewat WhatsApp" |
  | Isian | jejak + kode booking |
  | Kunjungan | tetap memakai bar atas B, dengan kepala halaman ringkas |

- Tombol yang sudah ada pindah ke kanan kepala halaman, misalnya "+ Booking Baru" di Booking.
- Bagian-bagian di halaman itu memakai kartu bersama bila belum.
- Alur, aksi, dan teks lain tidak berubah.

### 5.8 Booking Baru dengan isian awal
Alamat `/admin/booking/baru` menerima:
- `?pasien={id}` untuk memilih pasien itu;
- `?tenaga={staffId}&tanggal={YYYY-MM-DD}&jam={HH.MM}` untuk memilih tenaga, tanggal, dan jam. Cabang mengikuti jam kerja tenaga itu, dan layanan bawaan Konsultasi tetap seperti sekarang.

Aturannya:
- isian awal hanya mengisi formulir, sehingga booking tetap dibuat lewat tombol **Buat Booking** dengan pemeriksaan yang sama seperti sekarang;
- isian yang tidak sah diabaikan, misalnya pasien tidak ditemukan, tenaga tidak aktif, tanggal lewat, atau jam bukan slot kosong. Formulir dimulai dari bagian yang masih sah, dengan pesan singkat "Jam itu sudah tidak tersedia. Pilih jam lain." bila jamnya yang tidak sah.

## 6. Data, hak akses, dan keamanan
- **Tanpa migrasi database.**
- **Data baru hanya dibaca:** jumlah per status atau sumber, jumlah pasien baru, dan catatan audit `appointment.verify` untuk Biaya booking masuk. Semua dari tabel yang sudah ada.
- **Dua aksi server baru** (hak `schedule:manage`):
  - simpan jam kerja seminggu, memakai aturan dan audit yang sama dengan aksi per hari yang sekarang;
  - hapus pengecualian tanggal, dengan audit.
- **Hak:** `report:read` dicabut dari Dokter. Hak lain tidak berubah.
- **Waktu:** semua dalam WITA. Minggu dihitung Senin–Minggu, dan bulan dari tanggal 1.
- **Daftar booking di garis waktu** hanya memuat identitas: nama depan, layanan, jam, dan status. Tidak ada catatan medis.

## 7. Pengujian

**Unit**
- Rentang periode minggu dan bulan beserta pembandingnya, termasuk:
  - pergantian minggu, bulan, dan tahun;
  - 31 Maret dibanding Februari;
  - Senin pukul 00.30 WITA.
- Sapaan di batas jam (10.59/11.00, 14.59/15.00, 17.59/18.00, 03.59/04.00).
- Posisi dan lebar blok garis waktu, termasuk blok di luar rentang dan pembulatan sumbu jam.
- Komponen bersama: kepala halaman (jejak, aksi), kartu, tab (`?tab=` tidak dikenal), kotak angka (tautan, varian).
- Masukan rupiah: mengetik, menghapus, dan nilai kosong.
- Baris harga: Simpan/Batal hanya saat berubah.
- Formulir jam kerja seminggu: centang Buka, perubahan, dan tombol aktif.
- Tab Data Pasien dan pilihan tab awal.
- Isian awal Booking Baru: sah, pasien tidak ditemukan, dan jam bukan slot kosong.

**Integrasi**
- Kotak pekerjaan hari ini: semua angka, termasuk batas hari WITA.
- Jadwal hari ini: lajur dari jam kerja dan pengecualian, booking per status, dan hari libur.
- Angka:
  - per periode dan pembanding;
  - biaya booking dari audit, satu booking dihitung sekali;
  - **ditolak** untuk Dokter dan Resepsionis.
- Simpan jam kerja seminggu: semua tersimpan; satu hari tidak sah berarti tidak ada yang tersimpan; hari yang tidak dicentang terhapus; audit tercatat.
- Hapus pengecualian: terhapus dan tercatat di audit; ditolak tanpa hak `schedule:manage`.

**E2E** (desktop dan ponsel)
- Dasbor resepsionis: kotak Menunggu konfirmasi membuka Booking, dan garis waktu menampilkan booking hari ini.
- Klik slot kosong di garis waktu, lalu Booking Baru terisi tenaga, tanggal, dan jam, lalu Buat Booking berhasil.
- Jadwal: ubah jam satu hari di tab Jam kerja → Simpan jam kerja → dimuat ulang tetap tersimpan.
- Layanan & Harga: ubah harga satu layanan, Simpan, lalu harga baru tampil di situs publik.
- Data Pasien: tab Booking, lalu **+ Booking**, lalu Booking Baru dengan pasien terpilih.
- Uji e2e lama yang mencari judul atau tombol disesuaikan dengan kepala halaman baru.

## 8. Di luar cakupan
- Pendapatan layanan, kasir, dan laporan lengkap (Plan 5).
- Mengubah atau menambah staf dari halaman Staf.
- Halaman dan menu Jejak Audit.
- Tampilan khusus HP.
- Situs publik.
