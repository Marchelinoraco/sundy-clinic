# Desain — UI Panel Admin Bagian C1: Booking WA/Telepon dan Menemukan Booking Lagi

- **Versi:** 1.0
- **Tanggal:** 1 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Melengkapi:** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md` (biaya booking K18, kedaluwarsa booking situs K13, aturan pencocokan) dan `docs/superpowers/specs/2026-09-30-ui-alur-dokter-design.md` (bagian A dan B dari perbaikan panel).
- **Mockup:** companion visual 1 Oktober 2026. Tata letak "A" disetujui pemilik. Berkasnya disimpan lokal di `.superpowers/brainstorm/` (tidak masuk git).

## 1. Latar belakang & tujuan

Pemilik menilai alur **mencatat booking dari WhatsApp/telepon** lambat di keempat titiknya:
1. **Pasien:** mencari atau membuat pasien;
2. **Jadwal:** memilih tanggal dan jam, karena admin harus mencoba tanggal satu per satu untuk tahu hari mana yang masih kosong;
3. **Pesan ke pasien:** mengetik sendiri biaya, rekening, kode, dan jadwal di WA;
4. **Menemukan booking lagi:** setelah disimpan, halaman kembali ke daftar hari ini, bukan ke tanggal booking itu, sehingga admin harus mencarinya lagi untuk verifikasi.

Bagian C dipecah menjadi tiga:
- **C1** *(spec ini)*: Booking Baru, panel "Booking dibuat" dengan instruksi transfer, dan menemukan booking lagi.
- **C2:** konfirmasi setelah verifikasi yang lebih rapi, dan daftar pengingat H-1.
- **C3:** link isi kuis (Plan 3b-2b, desainnya ada di spec pendaftaran bagian 4).

**Berhasil bila:**
- admin bisa mencatat booking WA, langsung melihat hari yang masih kosong, dan mengirim instruksi transfer dengan satu klik setelah menyimpan;
- booking yang belum ditransfer mudah ditemukan lagi, lewat daftar "Menunggu konfirmasi" atau pencarian.

## 2. Keputusan (dikonfirmasi pemilik, 1 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| B1 | Titik lambat | Keempatnya: pasien, tanggal & jam, pesan ke pasien, menemukan booking lagi |
| B2 | Pesan WA yang diinginkan | Instruksi transfer, konfirmasi terverifikasi, pengingat H-1, dan link isi kuis. Hanya **instruksi transfer** yang masuk C1 |
| B3 | Urutan | C1, lalu C2, lalu C3 |
| B4 | Tata letak Booking Baru | Satu halaman: langkah di kiri, ringkasan yang tetap di tempat di kanan, lalu berubah menjadi panel "Booking dibuat" |
| B5 | Batas transfer | Ditulis di pesan, **tanpa** kedaluwarsa otomatis untuk booking WA/telepon |

## 3. Halaman Booking Baru (`/admin/booking/baru`)

**Susunan:**
- **Laptop (≥ 1024 px):** dua kolom. Kiri berisi langkah 1–4 dan catatan. Kanan berisi ringkasan yang tetap di tempat saat menggulir (`sticky`).
- **Layar lebih sempit:** satu kolom, dengan ringkasan di bawah langkah-langkah.
- Semua langkah terlihat sekaligus dan boleh diubah dalam urutan apa pun.

**1 · Pasien**
- Pencarian per nama, WA, atau no. RM, seperti sekarang. Nomor tempelan dari WA ("+62 812-3456-7890", "0812 3456 7890") dikenali sebagai nomor yang sama.
- Setiap hasil menampilkan nama, no. RM, dan WA, ditambah:
  - **kunjungan terakhir** (tanggal, atau "belum pernah");
  - **booking berikutnya** bila ada (tanggal dan jam booking aktif terdekat yang belum lewat). Dengan ini booking ganda ketahuan sebelum dibuat.
- **+ Pasien baru** tetap di tempat yang sama, dengan pengecekan nomor kembar seperti sekarang.
- Setelah pasien dipilih, baris pasien menampilkan tombol **Ganti pasien**.

**2 · Layanan & tenaga**
- **Jenis:** Konsultasi Dokter (30 menit) atau Treatment. Treatment memakai pemilihan layanan yang sudah ada.
- **Cabang:** hanya tampil bila ada lebih dari satu cabang aktif.
- **Tenaga:** aturannya tetap. Layanan yang wajib dokter hanya menampilkan dokter. Bila hanya ada satu tenaga yang sah, ia terpilih otomatis.
- **Sumber booking** menjadi tombol pilihan: **WhatsApp · Telepon · Walk-in**, dengan WhatsApp sebagai pilihan awal.

**3 · Tanggal**
- **Strip 14 hari** mulai hari ini (WITA). Setiap hari menampilkan nama hari, tanggal, dan salah satu:
  - jumlah jam kosong (mis. "6 jam");
  - **"penuh"** bila tenaga itu bekerja hari itu tetapi semua jamnya terisi;
  - **"tutup"** bila hari Minggu, tanggal libur, tenaga libur, atau di luar jadwal tenaga.
- Hari "tutup" dan "penuh" tidak bisa dipilih.
- Strip baru tampil setelah tenaga, layanan/durasi, dan cabang diketahui. Sebelum itu tampil keterangan "Pilih layanan dan tenaga dulu".
- Mengganti layanan, tenaga, atau cabang menghitung ulang strip dan mengosongkan jam yang sudah dipilih.
- **Pilih tanggal lain** membuka isian tanggal untuk hari di luar 14 hari itu, dengan batas yang sama seperti sekarang.

**4 · Jam**
- Tombol jam berukuran lebih besar.
- Bila jam yang dipilih baru saja direbut booking lain saat disimpan, pesan galat yang ada sekarang tetap tampil, lalu daftar jam dan strip dimuat ulang.

**Catatan (opsional):** tetap seperti sekarang.

**Ringkasan (kolom kanan):**
- Isinya pasien, layanan, jadwal, tenaga, cabang, sumber, dan **biaya booking**. Biayanya Rp 100.000 dari Pengaturan; walk-in "tanpa biaya booking".
- Baris yang belum diisi bertuliskan "belum dipilih".
- Tombol **Buat Booking** ada di bawah ringkasan. Bila ada yang belum lengkap, tombol tetap aktif tetapi menyebutkan apa yang kurang, seperti sekarang.

## 4. Panel "Booking dibuat" dan instruksi transfer

Setelah **Buat Booking** berhasil, halaman tidak pindah otomatis. Ringkasan berubah menjadi panel:
- **"✓ Booking {kode} dibuat"** beserta ringkasannya;
- **Kirim instruksi transfer via WA:** tautan `wa.me` ke nomor pasien, dengan teks sudah terisi;
- **Salin teks**;
- **Lihat di daftar:** membuka `/admin/booking?tanggal={tanggal booking}&sorot={id}` (bagian 5.4);
- **+ Booking baru:** mengosongkan formulir. Sumber booking terakhir tetap terpilih.

**Teks instruksi transfer:**

```
Halo {nama pasien}, booking Anda di SunDY Clinic sudah kami catat.
Kode: {kode}
Layanan: {layanan}
Jadwal: {hari, tanggal bulan tahun} pukul {HH.MM} WITA
Tenaga: {nama tenaga} · {cabang}

Mohon transfer biaya booking {Rp 100.000} paling lambat {hari, tanggal bulan tahun} pukul {HH.MM} WITA ke:
{bank} {nomor rekening} a.n. {nama pemilik rekening}
lalu kirim bukti transfer di chat ini.

Biaya booking terpisah dari biaya layanan dan tidak dikembalikan, tetapi tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelumnya.
```

**Aturan:**
- **Batas transfer** adalah yang lebih awal di antara:
  - 24 jam sejak booking dibuat, tanpa menghitung hari Minggu dan tanggal libur (fungsi `confirmationDeadline` yang sudah dipakai booking situs);
  - jam mulai booking itu sendiri.

  Batas ini hanya tertulis. Sistem tidak membatalkan booking WA/telepon secara otomatis (B5).
- **Biaya** diambil dari salinan `Appointment.bookingFee`, bukan dari Pengaturan saat ini, supaya pesan yang dikirim ulang tetap sesuai.
- **Rekening** diambil dari Pengaturan. Bila salah satu kolom rekening kosong, panel menampilkan peringatan "Rekening belum diisi di Pengaturan", dan baris rekening di teks menjadi `(rekening akan kami kirimkan)`.
- **Walk-in, atau booking tanpa biaya** (`bookingFee` kosong): tidak ada instruksi transfer. Panel hanya menampilkan ringkasan, **Lihat di daftar**, dan **+ Booking baru**.
- **Nomor WA pasien tidak sah:** tombol WA tidak tampil. Yang tersedia **Salin teks**, dengan keterangan "Nomor WhatsApp pasien tidak dikenali".

## 5. Halaman Booking (`/admin/booking`)

### 5.1 Daftar "Menunggu konfirmasi"

Daftar yang sekarang bernama "Booking situs menunggu konfirmasi" menjadi **"Menunggu konfirmasi"**. Isinya:
- booking **situs** `MENUNGGU_KONFIRMASI` yang belum kedaluwarsa, seperti sekarang, dengan "Kedaluwarsa {waktu}";
- booking **WhatsApp dan Telepon** `MENUNGGU_KONFIRMASI` dari semua tanggal:
  - sebelum batas: **"Batas transfer {waktu}"**;
  - setelah batas: **"Lewat batas transfer"** berwarna merah. Booking itu tidak dibatalkan otomatis.

Urutannya menurut batas terdekat, dengan yang paling mendesak di atas. Angka di menu Booking menghitung keduanya.

### 5.2 Aksi per baris

Paling banyak dua aksi utama terlihat. Sisanya ada di menu **⋯** (`DropdownMenu` yang sudah ada):

| Status / sumber | Aksi terlihat | Menu ⋯ |
|---|---|---|
| Menunggu konfirmasi, WA/telepon | **Verifikasi**, **Kirim instruksi transfer** | Salin instruksi transfer, Batalkan |
| Menunggu konfirmasi, situs belum dicocokkan | **Cocokkan pasien** | Lihat isian, Batalkan |
| Menunggu konfirmasi, situs sudah dicocokkan | **Verifikasi** | Lihat isian, Ganti pasien, Batalkan |
| Terkonfirmasi | **Hadir**, **Kirim konfirmasi** | Salin konfirmasi, Lihat isian, Tidak hadir, Batalkan |
| Hadir, Selesai, Tidak hadir, Dibatalkan, Kedaluwarsa | — | Lihat isian (bila ada dan berhak) |

- Kirim instruksi transfer, Kirim konfirmasi, dan Salin teks memakai teks yang sama dengan panel "Booking dibuat" (bagian 4) dan teks konfirmasi yang sudah ada.
- Dialog pembatalan dan pencocokan pasien tetap seperti sekarang.
- "Lihat isian" hanya untuk `record:read`, seperti sekarang.

### 5.3 Pencarian booking

- Kotak **"Cari kode, nama, atau WA"** di atas daftar per tanggal.
- Pencarian mencakup booking yang jadwalnya **30 hari ke belakang sampai seterusnya ke depan**. Kodenya dicocokkan persis tanpa peduli huruf besar/kecil. Nama dicocokkan sebagian, juga nama di isian untuk booking situs yang belum dicocokkan. Nomor WA dinormalkan seperti pencarian pasien.
- Hasilnya maksimal 50 booking, terbaru di atas, dengan tanggal di setiap baris dan aksi yang sama dengan bagian 5.2.
- Selama kotak berisi, daftar per tanggal dan filter disembunyikan. Mengosongkan kotak kembali ke tampilan per tanggal.
- Pencarian disimpan di URL (`?cari=…`), sehingga tombol Kembali dan muat ulang tetap menampilkan hasilnya.

### 5.4 Sorotan dari Booking Baru

- `?tanggal={YYYY-MM-DD}&sorot={id}` membuka tanggal itu.
- Baris booking tersebut diberi latar sorotan, lalu digulir ke tengah layar sekali saat halaman dibuka.
- Bila booking itu tidak ada di tanggal tersebut (sudah dipindah, atau difilter), tidak ada yang disorot dan tidak ada galat.

## 6. Data dan server

**Tanpa migrasi.** Semua aksi baru memakai `booking:manage`, sehingga resepsionis bisa memakainya. Tidak ada data klinis yang ditambahkan ke objek mana pun.

**Pencarian pasien** (`searchPatients`, `findPatientsByWhatsapp`, `listRecentPatients`): `PatientSummary` bertambah
- `lastVisitAt: Date | null`, dari `Patient.lastVisitAt`;
- `nextBookingAt: Date | null`: jadwal booking `MENUNGGU_KONFIRMASI`/`TERKONFIRMASI` terdekat yang `startAt ≥ sekarang`.

**Ketersediaan beberapa hari:** fungsi `getStaffAvailabilityRange({ staffId, branchId, durationMinutes, from, days })` (`booking:manage`, maks. 31 hari). Fungsi ini memakai `computeAvailability` yang sudah ada untuk setiap hari, dan mengembalikan per hari:
- `{ date, state: "OPEN" | "FULL" | "CLOSED", openCount }`;
- **CLOSED** bila tenaga tidak punya jam kerja hari itu (Minggu, libur, pengecualian, atau di luar jadwal);
- **FULL** bila punya jam kerja tetapi tidak ada slot kosong.

**Instruksi transfer:**
- `transferDeadline(createdAt, startAt, closedDates)`: fungsi murni yang mengembalikan yang lebih awal antara `confirmationDeadline` dan `startAt`;
- `transferInstructionText({...})`: fungsi murni yang menyusun teks bagian 4;
- server mengisi data booking, rekening dari Pengaturan, dan tanggal libur, lalu menghasilkan `{ text, link, deadline, missingBankAccount }`, atau `null` bila booking tidak punya biaya;
- dipakai panel "Booking dibuat" (lewat aksi `getTransferInstruction(appointmentId)`) dan baris daftar booking (`BookingRow.transferInstruction`).

**Daftar menunggu:** `listPendingSiteBookings`/`countPendingSiteBookings` diperluas, lalu diganti namanya menjadi `listPendingBookings`/`countPendingBookings`. Isinya mencakup booking WA/telepon, dengan `deadlineKind: "EXPIRES" | "TRANSFER"` dan `overdue: boolean`.

**Pencarian booking:** `searchBookings(query)` mengembalikan baris dalam bentuk `BookingRow` yang sama, ditambah tanggal.

## 7. Kasus khusus

- **Pasien dengan booking aktif di hari yang sama:** hanya terlihat lewat "booking berikutnya" di hasil pencarian. Sistem tidak melarang.
- **Tenaga tanpa jadwal di 14 hari ke depan:** semua hari "tutup", ditambah keterangan "Tidak ada jadwal dalam 14 hari ke depan — gunakan Pilih tanggal lain".
- **Pengaturan biaya diubah setelah booking dibuat:** instruksi transfer tetap memakai `bookingFee` yang disalin saat booking dibuat.
- **Booking situs:** instruksi transfer **tidak** ditampilkan untuk booking situs, karena customer sudah menerima instruksi di halaman sukses `/daftar`.
- **Walk-in:** tidak muncul di daftar "Menunggu konfirmasi", karena tanpa biaya.

## 8. Pengujian

**Unit:**
- `transferDeadline`: 24 jam biasa; melewati Minggu dan libur; dipotong oleh jadwal yang lebih dekat;
- `transferInstructionText`: lengkap; tanpa rekening; format rupiah dan tanggal WITA;
- strip tanggal: angka jam kosong, "penuh", "tutup", hari yang tidak bisa dipilih, dan keterangan tanpa jadwal;
- ringkasan: terisi bertahap dan "belum dipilih";
- panel "Booking dibuat": tautan WA berisi nomor pasien dan kode; salin teks; walk-in tanpa tombol transfer; peringatan rekening kosong; nomor tidak sah;
- aksi per baris sesuai tabel bagian 5.2;
- sorotan baris dari `sorot`.

**Integrasi:**
- `getStaffAvailabilityRange`: Minggu dan libur "tutup", hari penuh "FULL", angka jam kosong sama dengan daftar slot satu hari;
- `searchPatients`: `lastVisitAt` dan `nextBookingAt` (booking lewat dan dibatalkan tidak dihitung), dan nomor "+62 812-…" ditemukan;
- daftar menunggu: memuat booking WA/telepon beserta batas dan `overdue`, walk-in tidak termasuk, dan angka menu ikut;
- `searchBookings`: per kode, per nama pasien, per nama isian situs yang belum dicocokkan, per WA, rentang 30 hari ke belakang, maks. 50;
- `getTransferInstruction`: biaya dari salinan booking, rekening kosong, walk-in `null`;
- resepsionis bisa memakai semua aksi di atas.

**E2E** (desktop dan ponsel):
- admin membuat booking WA lewat strip tanggal, lalu panel "Booking dibuat" menampilkan tautan WA ke nomor pasien dengan kode booking di teksnya;
- "Lihat di daftar" membuka tanggal booking dengan barisnya disorot, dan booking itu ada di "Menunggu konfirmasi";
- `admin-booking.spec.ts` yang ada disesuaikan dengan tata letak dan aksi baru.

## 9. Di luar cakupan

- C2: konfirmasi setelah verifikasi yang lebih rapi, dan daftar pengingat H-1.
- C3: link isi kuis (Plan 3b-2b).
- Kedaluwarsa otomatis untuk booking WA/telepon.
- Bagian D: tampilan umum semua halaman dan dasbor.
