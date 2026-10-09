# Desain — Pengelolaan Akun Staf di Panel

- **Versi:** 1.0
- **Tanggal:** 9 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Menyentuh:** halaman Staf (`/admin/staf`), satu halaman baru (`/ganti-kata-sandi`), `src/server/session.ts` (gerbang wajib ganti kata sandi), satu kolom baru di tabel `user`, aksi server staf, dan jejak audit. Situs publik dan hak akses peran lain tidak berubah.

## 1. Latar belakang & tujuan

Akun staf hari ini hanya bisa dibuat, direset, dan diganti emailnya lewat skrip di server (`create-admin`, `reset-password`, `change-email`), yang dijalankan pengembang. Halaman Staf di panel hanya menampilkan daftar. Fungsi `createStaff` dan `setStaffActive` di `src/server/staff.ts` sudah ada tetapi belum terpasang ke layar mana pun, dan `createStaff` hanya membuat baris Staff tanpa akun login.

Akibatnya pemilik tidak bisa menambah staf, menonaktifkan staf yang berhenti, atau menolong staf yang lupa kata sandi tanpa pengembang. Lima akun demo di server juga baru bisa dimatikan lewat SQL.

Tujuan:
- pemilik (Super Admin) mengelola akun staf sendiri dari halaman Staf;
- kata sandi pertama sampai ke staf tanpa pemilik mengetahui kata sandi akhirnya;
- akun yang dinonaktifkan atau direset langsung kehilangan akses di semua perangkat;
- tidak ada jalan bagi pemilik untuk mengunci dirinya atau seluruh klinik dari panel.

Bukan tujuan: pengiriman email atau WhatsApp otomatis, "lupa kata sandi" mandiri tanpa pemilik, autentikasi dua langkah, penghapusan akun, dan penggantian kata sandi sukarela di luar kewajiban ganti (lihat K3).

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| K1 | Pendekatan | Aksi server memakai Better Auth yang sudah ada (fungsi yang sama dengan skrip `create-admin`/`reset-password`). Plugin `admin` Better Auth **tidak dipakai**: ia membawa kolom peran dan ban sendiri yang bentrok dengan `Staff.role` dan `Staff.isActive`. |
| K2 | Kata sandi pertama | Kata sandi sementara acak yang tampil **sekali** di layar pemilik; staf **wajib** menggantinya saat masuk pertama. Pemilik tidak pernah tahu kata sandi akhir. |
| K3 | Ganti kata sandi sukarela | Tidak ada. Halaman "Ganti kata sandi" hanya muncul bagi akun yang wajib mengganti (akun baru atau yang baru direset). Pemilik yang ingin mengganti kata sandinya sendiri mereset akunnya sendiri. |
| K4 | Cakupan | Tambah staf (dengan atau tanpa akun), buat akun untuk staf yang sudah ada, ubah nama/peran/tampil di situs, nonaktifkan dan aktifkan, reset kata sandi, ganti email. |
| K5 | Siapa | Hanya `staff:manage` (Super Admin), seperti halaman Staf sekarang. |
| K6 | Terapis | Peran Terapis tidak boleh punya akun login: ia sumber daya jadwal tanpa kemampuan panel. |

## 3. Data

Satu perubahan skema: kolom `mustChangePassword BOOLEAN NOT NULL DEFAULT false` di tabel `user` (model `User`). Migrasi hanya menambah kolom bersifat bawaan, sehingga rilis sebelumnya tetap berjalan dan `deploy.sh kembali` aman. Akun yang sudah ada (termasuk lima akun demo) tetap `false`.

Tidak ada kata sandi yang disimpan selain hash milik Better Auth. Kata sandi sementara hanya ada di nilai kembalian aksi server ke browser pemilik dan di state dialog; ia tidak masuk basis data, jejak audit, log, alamat (URL), maupun penyimpanan peramban.

## 4. Aturan

- **Kata sandi sementara:** 16 karakter acak dari `crypto.randomInt`, alfabet tanpa karakter yang mudah tertukar (tanpa `0 O 1 l I`), memuat huruf besar, huruf kecil, dan angka. Memenuhi aturan minimal 12 karakter aplikasi (`minPasswordLength` di `src/lib/auth.ts`, tidak diturunkan).
- **Email login:** dinormalkan ke huruf kecil dan dipangkas; harus berbentuk email; harus unik (Better Auth menyimpan huruf kecil). Pesan galat berbahasa Indonesia.
- **Akun dan peran:** staf berperan Terapis tidak bisa diberi akun; staf yang punya akun tidak bisa diubah perannya menjadi Terapis (pesan: nonaktifkan akunnya dulu atau pilih peran lain).
- **Pengaman diri dan klinik:**
  - Pemilik tidak bisa menonaktifkan dirinya sendiri atau menurunkan perannya sendiri dari Super Admin.
  - Selalu harus tersisa minimal satu Super Admin aktif yang punya akun. Aksi yang akan menghabiskannya (nonaktifkan atau turunkan Super Admin terakhir) ditolak.
  - Reset kata sandi dan ganti email diperbolehkan untuk diri sendiri dan akun lain (lihat K3).
- **Sesi:** nonaktifkan, reset kata sandi, dan ganti email menghapus semua sesi akun itu. Mengaktifkan kembali tidak membuat sesi.
- **Peran berlaku seketika:** peran dibaca dari basis data pada setiap permintaan (`getCurrentStaff`), jadi perubahan peran tidak menunggu sesi baru.
- **Tanpa penghapusan:** akun dan staf tidak pernah dihapus. Staf yang berhenti dinonaktifkan; riwayat (booking, kunjungan, audit) tetap utuh.
- **Wajib ganti kata sandi (gerbang):** selama `mustChangePassword` bernilai `true`, `getCurrentStaff()` mengembalikan `null`, sehingga akun itu **tidak dianggap login** oleh halaman panel, aksi server, maupun rute yang memakai fungsi itu (termasuk `POST /admin/bia/unggah` dan `GET /admin/bia/berkas/<id>`). Satu-satunya yang boleh diakses adalah halaman Ganti kata sandi, lewat fungsi terpisah `getPendingPasswordChange()`. Setelah kata sandi diganti, tanda dimatikan dan sesi lain akun itu dihapus.

## 5. Layar dan alur

### 5.1 Halaman Staf

Tabel `AdminDataGrid` dengan kolom Nama, Peran, Akun (email, atau "Belum punya akun"), Status (Aktif/Nonaktif, ditambah "Wajib ganti kata sandi" bila tanda menyala), dan satu kolom aksi berupa menu ⋯ per baris:

- **Ubah:** nama, peran, tampil di situs.
- **Buat akun:** hanya bagi staf tanpa akun dan bukan Terapis; meminta email.
- **Reset kata sandi:** konfirmasi, lalu dialog kata sandi sementara. Bila menimpa akun sendiri, konfirmasi menyebut bahwa Anda akan keluar dan harus membuat kata sandi baru.
- **Ganti email:** satu isian.
- **Nonaktifkan** (konfirmasi: staf langsung keluar dari semua perangkat dan riwayat tetap utuh) atau **Aktifkan**.

Kepala halaman punya tombol **+ Tambah staf**: nama, peran, tampil di situs, dan email login (tersembunyi bila peran Terapis). Dialog konfirmasi memakai `alertdialog` dengan deskripsi tertaut (`aria-describedby`), pola yang sama dengan dialog lain.

### 5.2 Dialog kata sandi sementara

Setelah **Tambah staf** (dengan akun), **Buat akun**, atau **Reset kata sandi** berhasil, muncul dialog berisi nama staf, email, kata sandi sementara (dengan tombol *Salin*), dan peringatan "Kata sandi ini hanya tampil sekali. Sampaikan ke staf; ia wajib menggantinya saat masuk pertama." Menutup dialog menghapus kata sandi dari state. Tidak ada tautan yang membawa kata sandi.

### 5.3 Halaman Ganti kata sandi (`/ganti-kata-sandi`)

Halaman di grup `(admin)` tetapi **di luar** layout `/admin` (tanpa menu panel), dengan kartu seperti halaman masuk: kata sandi saat ini (sementara), kata sandi baru, ulangi kata sandi baru, dan tombol *Keluar*. Aturan 12 karakter ditulis di bawah isian; galat dalam bahasa Indonesia ("Kata sandi saat ini salah.", "Kata sandi baru dan ulangannya tidak sama.", "Kata sandi baru harus berbeda dari yang sementara."). Setelah berhasil, staf diarahkan ke `/admin`. Akses ke halaman ini oleh akun yang tidak wajib ganti diarahkan ke `/admin`; oleh yang belum login ke `/masuk`.

### 5.4 Alur masuk

1. Pemilik membuat akun, lalu menyampaikan email dan kata sandi sementara ke staf.
2. Staf masuk di `/masuk`. Halaman `/masuk` mengarahkan akun yang wajib ganti ke `/ganti-kata-sandi` (bukan `/admin`).
3. Di `/admin/**`, `requireStaff()` mengarahkan akun yang wajib ganti ke `/ganti-kata-sandi`, dan akun yang belum login ke `/masuk`.
4. Staf membuat kata sandi baru dan masuk panel.

## 6. Teknis

- **Aturan murni** `src/lib/staff-accounts.ts` (tanpa basis data): `generateTempPassword()`, `validateLoginEmail()`, `roleCanHaveLogin(role)`, dan `staffChangeBlock(...)` yang mengembalikan pesan penolakan atau `null` (diri sendiri, Super Admin aktif terakhir, Terapis dengan akun).
- **Aksi server** `src/server/staff.ts` (diperluas; satu-satunya tempat, tidak ada jalur lama yang terlepas): `createStaffWithAccount`, `createAccountForStaff`, `updateStaff`, `setStaffActive` (diperluas dengan pengaman dan pencabutan sesi), `resetStaffPassword`, `changeStaffEmail`. Semuanya `requireCapability("staff:manage")`, memakai `runAction`/`UserFacingError`, dan `recordAudit`. Pembuatan dan reset akun memakai `auth.$context` (`internalAdapter`) seperti skrip yang sudah ada; pembuatan akun, penautan ke Staff, dan tanda wajib ganti terjadi dalam satu transaksi bila memungkinkan, atau dibatalkan bersih bila gagal di tengah.
- **Ganti kata sandi sendiri** `src/server/own-password.ts`: `changeOwnPassword({ currentPassword, newPassword, confirmation })` memakai `auth.api.changePassword` dengan `revokeOtherSessions`, lalu mematikan `mustChangePassword`. Hanya boleh dipanggil oleh akun yang wajib ganti.
- **Sesi** `src/server/session.ts`: `getCurrentStaff()` ikut memilih `mustChangePassword` dan mengembalikan `null` bila `true`; `getPendingPasswordChange()` mengembalikan staf bila `true`, jika tidak `null`; `requireStaff()` mengarahkan ke `/ganti-kata-sandi` bila pending, ke `/masuk` bila tidak login.
- **Skrip yang sudah ada** (`create-admin`, `reset-password`, `change-email`) tidak berubah dan tetap berfungsi sebagai jalur pemulihan di server. Mereka tidak menyentuh `mustChangePassword`: akun yang dibuat atau direset lewat skrip mengikuti nilai tandanya saat itu (akun baru: `false`).
- **Audit:** `staff.create`, `staff.update`, `staff.activate`, `staff.deactivate`, `staff.account.create`, `staff.account.reset`, `staff.account.email`, `staff.password.change`. Ringkasan memuat nama dan peran staf (dan email untuk perubahan email), **tidak** kata sandi. Label bahasa manusia ditambah di `src/lib/audit-labels.ts`.

## 7. Keamanan

- Hanya Super Admin yang bisa memanggil aksi pengelolaan; peran lain ditolak di server (bukan hanya disembunyikan di layar).
- Kata sandi sementara tidak ada di audit, log, URL, basis data, atau penyimpanan peramban; respons aksi tidak boleh di-cache (`no-store` sudah bawaan aksi server).
- Gerbang wajib ganti berada di `getCurrentStaff()`, bukan hanya di layout, sehingga rute dan aksi tidak bisa dipakai akun yang belum mengganti kata sandi.
- Pembatas laju login Better Auth tetap berlaku; kesalahan kata sandi lama di halaman Ganti kata sandi tidak boleh mengungkap apakah akun ada.
- Menonaktifkan dan mereset mencabut sesi, sehingga akses yang dicabut pemilik langsung berhenti, bukan menunggu sesi kedaluwarsa.

## 8. Pengujian

- **Unit:** pembuat kata sandi sementara (panjang 16, alfabet, tiga golongan karakter, tidak berulang pada 1.000 panggilan), validasi email, `roleCanHaveLogin`, dan `staffChangeBlock` untuk setiap aturan pengaman.
- **Integrasi:**
  - Akun yang dibuat bisa masuk dengan kata sandi sementara, dan `getCurrentStaff()` mengembalikan `null` sampai kata sandi diganti.
  - Setelah ganti kata sandi: tanda mati, sesi lain dicabut, kata sandi lama ditolak.
  - Nonaktifkan, reset, dan ganti email mencabut semua sesi.
  - Super Admin terakhir dan diri sendiri tidak bisa dinonaktifkan atau diturunkan; email dobel ditolak; Terapis tidak bisa diberi akun.
  - Audit tidak memuat kata sandi sementara.
  - Peran selain Super Admin ditolak di semua aksi.
  - Rute BIA menolak akun yang wajib ganti (401).
- **Komponen:** dialog kata sandi sementara (salin, hilang saat ditutup), menu aksi per baris, dialog konfirmasi, dan halaman Ganti kata sandi (kecocokan, galat).
- **E2E:** pemilik menambah staf, staf masuk, dipaksa ganti kata sandi, lalu masuk panel; nonaktifkan membuat staf ditolak masuk; resepsionis tidak bisa membuka halaman Staf; foto terang dan gelap untuk halaman Staf dan Ganti kata sandi.

## 9. Rilis dan risiko

- Migrasi hanya menambah satu kolom bawaan; `deploy.sh kembali` tetap aman. Akun yang ada tidak terpengaruh.
- Setelah rilis, pemilik menonaktifkan kelima akun demo dari panel.
- Pemilik yang lupa kata sandinya sendiri dan tidak punya Super Admin lain tidak bisa mereset dirinya dari panel (butuh login); jalurnya tetap skrip server `reset-password`. Menambah Super Admin kedua dianjurkan.
- Kata sandi sementara yang disampaikan lewat chat tetap berisiko; karena itu wajib diganti pada masuk pertama dan hanya berlaku sampai saat itu.
