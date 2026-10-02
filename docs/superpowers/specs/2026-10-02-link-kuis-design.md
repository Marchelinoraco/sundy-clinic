# Desain — UI Panel Admin Bagian C3: Link Isi Kuis untuk Booking yang Dicatat Admin

- **Versi:** 1.0
- **Tanggal:** 2 Oktober 2026
- **Status:** Disetujui pemilik (2 Oktober 2026) · terlaksana (2 Oktober 2026)
- **Menggantikan:** bagian 4 spec pendaftaran (`docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`, "Plan 3b-2b"). Desain awal itu ditulis sebelum kuis v2, C1, dan C2.
- **Melengkapi:**
  - kuis v2: `docs/superpowers/specs/2026-09-30-kuis-v2-form-recall-design.md`;
  - C1: `docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md` (instruksi transfer);
  - C2: `docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md` (konfirmasi, pengingat H-1, catatan pesan).

## 1. Latar belakang & tujuan

Customer yang booking lewat situs mengisi kuis di `/daftar`, sehingga dokter sudah melihat jawabannya sebelum kunjungan. Pasien yang booking lewat WhatsApp, telepon, atau datang langsung belum punya jalan untuk mengisi kuis.

**Berhasil bila:**
- pasien booking WA/telepon/walk-in bisa mengisi kuis di HP-nya sendiri tanpa login;
- admin tidak perlu klik tambahan untuk mengirim link, karena link ikut pesan yang sudah dikirim;
- isiannya muncul di halaman kunjungan dokter, sama seperti isian booking situs.

## 2. Keputusan (dikonfirmasi pemilik, 2 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| Q1 | Booking yang mendapat link | WA dan telepon, walk-in, serta pasien lama tanpa isian lengkap (lihat Q4) |
| Q2 | Cara mengirim | **Ikut pesan yang ada:** instruksi transfer, konfirmasi, dan pengingat H-1. Ada juga tombol terpisah untuk walk-in dan kirim ulang |
| Q3 | Walk-in di klinik | **QR** di layar admin, dan **Buka di perangkat ini** (tablet klinik) |
| Q4 | Booking situs dari pasien lama tanpa isian lengkap | Booking situs itu tetap memakai kuis pendeknya dan diberi tanda "Belum punya isian lengkap". Booking WA/telepon/walk-in **berikutnya** otomatis mendapat kuis lengkap. Satu booking tetap satu isian |
| Q5 | Cara membuat link | **Link turunan (HMAC):** kunci rahasia server + booking + nomor versi. Link tetap sama sampai diganti |

## 3. Halaman isi kuis untuk customer (`/isi#<kode>`)

### 3.1 Link

- Bentuknya `sundyclinic.com/isi#<kode>`. Kode memuat ID booking dan tanda tangan HMAC dari kunci rahasia, ID booking, dan nomor versi link (bagian 6).
- Kode ditaruh **setelah tanda `#`**, jadi browser tidak pernah mengirimnya ke server. Kode tidak tercatat di log nginx maupun Cloudflare, dan halaman `/isi` sendiri tidak memuat data apa pun. Browser membaca kode itu, lalu meminta isi halaman lewat aksi server. *(Perubahan 2 Okt 2026 saat menyusun plan: spec semula menulis `/isi/<kode>`, yang tercatat lengkap di log nginx dan Cloudflare.)*
- **Link berlaku** bila semua syarat ini terpenuhi:
  - tanda tangannya cocok dengan versi link saat ini;
  - booking berstatus Menunggu konfirmasi atau Terkonfirmasi, bersumber WhatsApp, Telepon, atau Walk-in, dan sudah punya pasien;
  - jam mulai booking belum lewat;
  - kuis booking itu belum dikirim.
- **Link tidak berlaku** bila booking dibatalkan, kedaluwarsa, atau ditandai tidak hadir, bila jadwalnya lewat, atau bila admin menekan **Ganti link**.
- Link yang tidak berlaku menampilkan "Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp", dengan tombol WA klinik. Pesan ini sama untuk semua alasan, sehingga link tidak membocorkan keadaan booking.
- Link yang kuisnya sudah dikirim menampilkan "Terima kasih, sudah kami terima."

### 3.2 Isi halaman

- **Bagian atas:** "Halo {nama depan}", layanan, dan jadwal. Data medis lama tidak pernah ditampilkan.
- **Jenis kuis ditentukan sistem:**
  - **kuis lengkap** (jalur customer baru pada kuis v2) bila pasien belum punya isian lengkap yang sudah dikirim, termasuk pasien era kertas;
  - **kuis pendek** (jalur customer lama) bila sudah punya.
  - "Isian lengkap yang sudah dikirim" berarti isian berjenis `LENGKAP` berstatus `TERISI` atau `DIPERIKSA` milik pasien itu, dari booking mana pun (situs atau link).
  - Jenisnya dihitung saat halaman dibuka, diperiksa lagi saat Kirim, dan disimpan di baris isian saat Kirim.
- **Yang dilewati:** layanan, jadwal, dan "Pernah konsultasi atau treatment?" (U1). Tujuan konsultasi (U2) tetap ditanyakan.
- **Langkah data diri:**
  - hanya menanyakan kolom yang masih kosong di data pasien: tanggal lahir, jenis kelamin, pekerjaan, alamat;
  - nama dan nomor WA tidak ditanyakan, karena sudah dicatat admin;
  - selalu memuat persetujuan Kebijakan Privasi;
  - persetujuan biaya booking hanya muncul bila booking berbiaya dan belum diverifikasi.
- **Lainnya:**
  - ringkasan jawaban dengan tombol "Ubah", lalu **Kirim**, seperti `/daftar`;
  - jawaban tersimpan sementara per tab (sessionStorage), dengan kunci terpisah per booking;
  - nada bahasa memakai "Anda" dan "customer", tanpa kata "pasien" atau "berobat".

### 3.3 Setelah Kirim

- Baris isian dibuat atau diisi dengan status **TERISI**, terhubung ke booking dan pasiennya.
- Data diri yang diisi langsung **melengkapi kolom yang masih kosong** di data pasien. Kolom yang sudah terisi tidak pernah ditimpa. Ini data identitas, bukan data klinis.
- Jawaban klinis menunggu dokter menyetujuinya ("Setujui ke data pasien"), seperti booking situs.
- **Kirim dua kali** (tombol ditekan ulang, atau dua tab) tidak membuat isian ganda. Kiriman kedua mendapat halaman terima kasih.

## 4. Sisi admin

### 4.1 Link ikut pesan yang sudah ada

Selama link berlaku (3.1), baris berikut ditambahkan ke tiga pesan:
- **instruksi transfer** (C1): di akhir pesan;
- **konfirmasi** (C2): sebelum "Sampai jumpa di klinik.";
- **pengingat H-1** (C2): di akhir pesan.

```
Sebelum datang, mohon isi form singkat ini (±5 menit): {link}
Jawaban Anda hanya dibaca dokter kami.
```

- Setelah kuis dikirim, baris itu hilang dari pesan berikutnya.
- Booking situs tidak pernah mendapat baris ini.
- Panel "Booking dibuat" (C1) ikut memuat link, karena memakai instruksi transfer yang sama.

### 4.2 Menu ⋯ → "Link kuis"

Muncul untuk booking WA, telepon, dan walk-in yang linknya berlaku. Membuka dialog berisi:
- **kode QR** dari link itu, dibuat di browser admin;
- **Buka di perangkat ini:** membuka link di tab baru, untuk diisi di tablet klinik;
- **Kirim link via WA:** pesan terpisah ke nomor pasien. Pengirimannya tercatat sebagai jenis `LINK_KUIS` di catatan pesan C2;

  ```
  Halo {nama depan}, ini SunDY Clinic. Sebelum {layanan} {hari, tanggal bulan tahun} pukul {HH.MM} WITA, mohon isi form singkat ini (±5 menit): {link}
  Jawaban Anda hanya dibaca dokter kami.
  ```

- **Salin link**;
- **Ganti link:** menaikkan nomor versi, sehingga link lama langsung tidak berlaku. Ada konfirmasi sebelum dijalankan. Dipakai bila link terkirim ke nomor yang salah.

### 4.3 Status di daftar Booking

- **Kuis belum diisi** (booking admin yang linknya berlaku): baris menampilkan "Isian: belum diisi", label yang sudah ada.
- **Kuis sudah dikirim:** baris menampilkan "Isian: belum diperiksa". Isiannya tampil di tab Isian halaman kunjungan dan di `/admin/isian/[id]`.
- **Booking situs yang pasiennya belum punya isian lengkap:** baris booking dan halaman isiannya menampilkan tanda **"Belum punya isian lengkap"**, yaitu bila isian booking itu kuis pendek dan pasiennya tidak punya isian lengkap yang sudah dikirim. Booking admin berikutnya untuk pasien itu otomatis mendapat kuis lengkap (3.2).

### 4.4 Halaman Pengingat

Tidak berubah. Pengingat H-1 sudah membawa link (4.1), jadi pasien yang belum mengisi diingatkan sekaligus.

## 5. Kasus khusus

- **Pindah jadwal (C2):** link tetap sama dan berlaku sampai jadwal baru dimulai.
- **Admin mengganti pasien sebuah booking:** link tetap sama, tetapi halaman menampilkan nama pasien yang sekarang. Jenis kuis dihitung untuk pasien itu.
- **Booking walk-in tanpa biaya:** tidak ada persetujuan biaya booking. Link hanya dikirim lewat "Link kuis", karena walk-in tidak mendapat instruksi transfer.
- **Pasien membuka link setelah jam mulai** (misal sudah di ruang tunggu): link sudah tidak berlaku. Admin bisa memakai tablet klinik untuk booking yang belum dimulai, atau dokter bertanya langsung.
- **Kunci rahasia server diganti:** semua link lama tidak berlaku. Admin bisa mengirim ulang lewat "Link kuis".

## 6. Data dan server

**Satu migrasi aditif:**
- `Intake.linkVersion Int @default(0)`;
- kolom lama `Intake.linkTokenHash` dan `Intake.linkExpiresAt`, yang belum pernah dipakai, dihapus;
- nilai baru `LINK_KUIS` pada enum `AppointmentMessageKind` (C2).

**Versi link:**
- dibaca dari baris isian booking itu, atau 0 bila belum ada baris isian;
- "Ganti link" membuat baris isian berstatus `MENUNGGU_DIISI` bila belum ada, lalu menaikkan `linkVersion`.

**Kunci rahasia:**
- diturunkan dari `BETTER_AUTH_SECRET` dengan label tetap (mis. `sundy:isi-link:v1`), lewat HMAC-SHA256;
- tanda tangan link adalah HMAC-SHA256 dari `"{appointmentId}.{versi}"` dengan kunci itu, dipotong 16 byte dan dikodekan base64url;
- pemeriksaannya memakai perbandingan waktu-konstan.

**Aksi server publik** (tanpa login, dibatasi frekuensinya seperti `/daftar`):
- **membaca halaman link:** hasilnya salah satu dari "berlaku" (nama depan, layanan, jadwal, jenis kuis, kolom data diri yang kosong, perlu persetujuan biaya), "sudah diisi", atau "tidak berlaku";
- **mengirim kuis:**
  - link, jawaban (skema kuis v2 dengan jenis yang ditentukan sistem), dan data diri diperiksa ulang di server;
  - isian dibuat atau diisi, lalu kolom kosong pasien dilengkapi, dalam satu transaksi;
  - isian yang sudah TERISI tidak pernah diubah.

**Aksi server admin** (`booking:manage`):
- mengambil link sebuah booking (untuk dialog, QR, dan pesan);
- mengganti link.

**Pesan C1/C2:**
- penyusun teks instruksi transfer, konfirmasi, dan pengingat menerima link opsional;
- bila link ada, baris kuis (4.1) ditambahkan;
- link dihitung di server saat daftar booking, panel "Booking dibuat", dan halaman Pengingat disusun.

**Keamanan & privasi:**
- halaman link tidak pernah menampilkan nomor WA, data medis, atau jawaban lama;
- halaman `/isi` tidak diindeks mesin pencari (`noindex`, dan `Disallow: /isi` di robots.txt);
- kode tidak pernah sampai ke server lewat URL (3.1), dan aplikasi tidak mencatatnya di log;
- QR dibuat di browser admin, jadi link tidak dikirim ke layanan luar.

**Dependensi baru:** `qrcode` (pembuat QR, MIT), dipakai hanya di komponen dialog admin.

## 7. Pengujian

**Unit:**
- link: dibuat lalu diperiksa; versi lama ditolak; tanda tangan atau ID yang diubah ditolak; format rusak ditolak;
- aturan jenis kuis: lengkap untuk pasien tanpa isian lengkap, pendek untuk yang punya;
- baris kuis di instruksi transfer, konfirmasi, dan pengingat; tidak ada bila link kosong;
- halaman isi kuis:
  - U1, layanan, dan jadwal dilewati;
  - data diri hanya menanyakan kolom kosong;
  - persetujuan biaya hanya bila perlu;
  - halaman tidak berlaku dan halaman terima kasih;
- dialog "Link kuis": QR tampil, Salin, Buka di perangkat ini, Kirim via WA mencatat `LINK_KUIS`, dan Ganti link meminta konfirmasi;
- tanda "Belum punya isian lengkap".

**Integrasi:**
- kirim kuis lewat link membuat isian TERISI dan melengkapi kolom kosong pasien tanpa menimpa yang terisi;
- link tidak berlaku untuk booking batal, lewat jadwal, booking situs, sudah diisi, atau versi lama setelah Ganti link;
- kirim dua kali menghasilkan satu isian;
- jenis kuis yang dikirim tidak sesuai aturan ditolak;
- pesan C1/C2 dari server memuat link hanya selama berlaku;
- resepsionis bisa memakai aksi admin.

**E2E** (desktop dan ponsel):
- admin membuat booking WA, lalu link dari panel "Booking dibuat" dibuka;
- kuis diisi sampai Kirim, lalu muncul "Terima kasih";
- daftar booking menampilkan "Isian: belum diperiksa";
- link yang sama sesudahnya menampilkan halaman terima kasih.

## 8. Di luar cakupan

- Dua isian untuk satu booking (Q4).
- NIK, food recall H-1, dan kuis di tablet saat check-in (rekam medis sub-proyek 2).
- Pengiriman otomatis lewat API WhatsApp.
- Bagian D: tampilan umum dan dasbor.
