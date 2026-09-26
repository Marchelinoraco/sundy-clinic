# Desain — Migrasi SunDY ke VPS sundy (Sub-proyek 0)

- **Versi:** 1.0
- **Tanggal:** 26 September 2026
- **Status:** Menunggu review pemilik
- **Menggantikan:** keputusan hosting *Vercel + Neon* di PRD v1.1 (bagian hosting PRD perlu disesuaikan setelah desain ini disetujui)

## 1. Latar belakang

SunDY saat ini berjalan di **Vercel** (`sundy-clinic.vercel.app`) dengan database **Neon**. Sistem akan
segera menyimpan **rekam medis** (formulir Identitas Pasien, hasil BIA, order dokter), sehingga pemilik
memutuskan memindahkan **semuanya** — aplikasi, database, dan file pasien — ke server sendiri:

- **VPS sundy**: IDCloudHost jkt01, 2 vCPU / 2 GB RAM / 20 GB, saat ini AlmaLinux (akan di-install ulang).
- **Domain `sundyclinic.com`**: dibeli pemilik di Jetorbit (registrar Rumahweb) pada 26 Sep 2026, berlaku
  sampai 26 Sep 2027, belum memiliki record DNS.

Sub-proyek ini adalah langkah 0 dari rangkaian: **0 migrasi VPS** → 1 pendaftaran pasien (Plan 3b) →
2 rekam medis + apotek (Plan 4) → 3 kasir/pembayaran (Plan 5).

## 2. Keputusan (dikonfirmasi pemilik, 26 Sep 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| K1 | Tempat semua komponen | Aplikasi + PostgreSQL + file pasien di VPS sundy |
| K2 | Sistem operasi | Ubuntu 24.04 LTS (install ulang dari AlmaLinux) |
| K3 | Cara memasang | **aaPanel** — sama seperti server Welcome Manado (Wm-2026) |
| K4 | Domain | `sundyclinic.com` untuk seluruh aplikasi; `www` dialihkan ke domain utama |
| K5 | DNS | Nameserver dipindah dari Jetorbit ke **Cloudflare**, proxy aktif, SSL **Full (strict)** |
| K6 | Rilis | Skrip `deploy.sh` di server, folder rilis bergantian, bisa kembali ke rilis sebelumnya |
| K7 | Backup | Harian, **terenkripsi**, ke IDCloudHost Object Storage; disertai laporan bila gagal |
| K8 | Pemisahan dari Welcome Manado | VPS, kunci SSH, panel, database, dan storage account Object Storage **terpisah sepenuhnya** dari server Welcome Manado (Wm-2026) — tidak ada kredensial yang dipakai bersama |
| K9 | Akun Cloudflare | Akun yang sama dengan zona `welcomemanado.com` (zona `sundyclinic.com` terpisah di dalamnya) |
| K10 | Email klinik | Alamat **`@sundyclinic.com`** (penyedia kotak masuk: lihat bagian 9) |

Pembagian kerja mengikuti cara yang terbukti saat memulihkan Wm-2026: Claude menjalankan perintah lewat
SSH (setiap perintah disetujui), pemilik mengerjakan bagian UI (console IDCloudHost, aaPanel,
Cloudflare, Jetorbit). **Rahasia tidak pernah dikirim lewat chat** — pemilik mengisinya sendiri lewat
aaPanel *Files*.

## 3. Arsitektur

```
Pasien / staf ──HTTPS──> Cloudflare (proxy, Full strict) ──HTTPS──> VPS sundy (Ubuntu 24.04 + aaPanel)
                                                                    ├─ Nginx  → reverse proxy ke Node
                                                                    ├─ Node.js 22 (PM2) → Next.js standalone
                                                                    │     /www/sundy/current → releases/<waktu>
                                                                    ├─ PostgreSQL (hanya localhost)
                                                                    └─ /www/sundy-files (file pasien, di luar web root)
                        backup 02.00 WITA ── rclone crypt ──> IDCloudHost Object Storage (bucket sundy-backup)
```

Satu aplikasi Next.js melayani seluruh rute: situs publik, `/admin/*`, `/masuk`, dan `/api/auth/*`.

## 4. Komponen

### 4.1 Server

- Install ulang ke **Ubuntu 24.04** lewat console IDCloudHost (pemilik). Beri nama VPS yang jelas di
  console, mis. **SUNDY-PRODUKSI**, dan aktifkan *delete/rebuild protection* bila tersedia — pelajaran
  dari Wm-2026 yang ter-reinstall tanpa sengaja.
- Kunci SSH khusus (`~/.ssh/sundy_ed25519`, alias `ssh sundy`); login password SSH dimatikan.
- Swap 2 GB, zona waktu `Asia/Makassar`, pembaruan keamanan otomatis (`unattended-upgrades`), `fail2ban`
  untuk SSH.
- Firewall (`ufw`): hanya 22, 80, 443, dan port panel.

### 4.2 aaPanel

- Nginx (stabil terbaru), **PostgreSQL** (versi mayor disamakan dengan Neon produksi — dicek saat
  migrasi), **Node.js 22 LTS** lewat *Node Project* (PM2).
- **Tidak dipasang:** PHP, MySQL/MariaDB, FTP, phpMyAdmin.
- Panel: *security entrance*, port non-standar, **akses dibatasi ke IP pemilik**.
- PostgreSQL hanya mendengarkan `localhost`; user database khusus aplikasi dengan hak atas database
  `sundy` saja.

### 4.3 Domain & DNS

1. Pemilik menambahkan `sundyclinic.com` di akun Cloudflare yang sama dengan `welcomemanado.com` (K9),
   lalu mengganti nameserver di Jetorbit ke nameserver Cloudflare. Karena domain belum dipakai, perpindahan ini tidak mengganggu apa pun dan
   dilakukan paling awal.
2. Record `A sundyclinic.com → IP VPS` dan `CNAME www → sundyclinic.com`, keduanya **di-proxy**.
3. Sertifikat Let's Encrypt dari aaPanel untuk `sundyclinic.com` + `www`; Force HTTPS; Cloudflare SSL/TLS
   **Full (strict)**. (Validasi Let's Encrypt lewat proxy Cloudflare terbukti berhasil di Wm-2026.)
4. `www` dialihkan 301 ke `https://sundyclinic.com`.

**Email `@sundyclinic.com` (K10):** record MX, SPF, DKIM, dan DMARC dari penyedia kotak masuk (bagian 9)
dipasang di zona Cloudflare yang sama — record email **tidak** di-proxy. Setelah kotak masuk aktif, email
login Super Admin diganti dari contoh `pemilik@sundyclinic.id` ke alamat `@sundyclinic.com` yang
sungguhan.

### 4.4 Perubahan kode (branch fitur, dengan tes)

1. **Adapter Prisma**: `@prisma/adapter-neon` → `@prisma/adapter-pg`. Adapter ini juga bekerja dengan
   Neon, sehingga uji integrasi tetap boleh memakai branch *test* Neon tanpa mengubah alur pengembangan.
   `neon.ts` dan dependensi Neon yang tidak terpakai lagi dihapus.
2. `next.config.ts`: `output: "standalone"`.
3. Variabel lingkungan baru `PATIENT_FILES_DIR` (default `/www/sundy-files`). Modul unggah/unduh file
   **belum** dibuat di sub-proyek ini — dibuat di sub-proyek pertama yang membutuhkannya (BIA/rekam
   medis). Aturannya sudah ditetapkan di sini: file di luar web root, nama acak, hanya bisa diunduh lewat
   rute aplikasi setelah login dengan peran yang sesuai.
4. `scripts/deploy.sh` (lihat 4.6) masuk repo.
5. `vercel.json` dihapus setelah perpindahan selesai.
6. `.env.example` diperbarui: `DATABASE_URL` menunjuk PostgreSQL lokal; bagian Neon hanya untuk
   pengembangan/uji.

Semua tes yang ada (unit, integrasi, e2e) harus tetap hijau setelah pergantian adapter.

### 4.5 Perpindahan database (Neon → VPS)

1. **Gladi:** `pg_dump` branch *production* Neon → restore ke PostgreSQL VPS → aplikasi di VPS diuji
   lewat alamat sementara (belum lewat domain publik). Jumlah baris setiap tabel dicocokkan.
2. **Perpindahan final — malam hari setelah klinik tutup (≥ 19.00 WITA)**, perkiraan jeda ±15 menit:
   hentikan penulisan di Vercel (mode pemeliharaan) → `pg_dump` terakhir → restore → cocokkan jumlah baris
   → `sundyclinic.com` mulai melayani dari VPS.
3. `sundy-clinic.vercel.app` dialihkan ke `https://sundyclinic.com` selama masa transisi.
4. **Satu minggu setelah pindah**, setelah pemulihan dari backup VPS terbukti berhasil: proyek Vercel
   dihapus dan **branch `production` di Neon dihapus** — data medis tidak boleh tertinggal di layanan
   lain. Branch `test` Neon (hanya data uji) tetap dipakai untuk uji integrasi.

### 4.6 Rilis (`deploy.sh`)

```
/www/sundy/releases/<YYYYmmdd-HHMMSS>/   ← kode main + build
/www/sundy/current -> releases/<terbaru> ← dijalankan PM2
/www/sundy/shared/.env                   ← rahasia (600), di-link ke setiap rilis
```

Urutan: ambil `main` dari GitHub (repo publik — tanpa kunci) → `npm ci` → `prisma migrate deploy` →
`next build` di folder rilis baru → pindahkan `current` → `pm2 reload`. Selama build, versi lama tetap
melayani pasien. **Kembali ke rilis sebelumnya** = arahkan `current` ke folder rilis lama + `pm2 reload`.
Tiga rilis terakhir disimpan. Build di VPS (2 vCPU / 2 GB + swap) memakan beberapa menit — dapat diterima
untuk klinik kecil; rilis otomatis dari GitHub Actions ditunda sampai dibutuhkan.

Catatan: migrasi database yang tidak kompatibel mundur membuat "kembali ke rilis sebelumnya" tidak
cukup — perubahan skema semacam itu harus dirancang dua langkah (tambah dulu, hapus di rilis berikutnya).

### 4.7 Backup

- **Setiap hari 02.00 WITA** (cron aaPanel, user root): `pg_dump -Fc` database + folder
  `/www/sundy-files` + konfigurasi (`shared/.env`, vhost Nginx).
- **Dienkripsi di server** dengan `rclone crypt` sebelum dikirim ke IDCloudHost Object Storage, bucket
  `sundy-backup`, dengan access key khusus server sundy.
- Bucket berada di **storage account IDCloudHost tersendiri** untuk SunDY. Access key IDCloudHost berlaku
  untuk *semua* bucket dalam satu storage account, sehingga bucket di storage account Welcome Manado
  akan ikut terbaca/terhapus oleh kunci server Wm-2026 (K8).
- Retensi: 30 hari di bucket (dihitung dari nama folder bertanggal, bukan umur file — pelajaran dari
  Wm-2026), 7 hari salinan lokal (`/root/backup`, hanya root).
- **Kata sandi enkripsi** dibuat acak; pemilik menyimpannya di pengelola kata sandi dan satu tempat aman
  lain. Tanpa kata sandi itu backup tidak dapat dibuka.
- **Uji pemulihan** sekali setelah pemasangan, lalu bulanan: unduh → dekripsi → restore ke database
  kosong → cocokkan jumlah baris.
- Backup mingguan VM dari IDCloudHost juga diaktifkan.

### 4.8 Pemantauan

- **Uptime**: layanan gratis (mis. UptimeRobot) memeriksa `https://sundyclinic.com` setiap 5 menit →
  notifikasi email/Telegram ke pemilik.
- **Backup**: skrip backup mengirim sinyal ke layanan *heartbeat* gratis (mis. healthchecks.io) setiap
  kali berhasil → pemilik diberi tahu bila backup tidak berjalan pada suatu malam.
- Log PM2 dirotasi agar tidak memenuhi disk 20 GB.

### 4.9 Perlindungan data pasien (UU PDP)

- Data (database, file, backup) tetap di Indonesia: VPS dan Object Storage IDCloudHost Jakarta.
- HTTPS wajib; rekam medis hanya dapat dilihat staf dengan peran yang sesuai (peran sudah ada di sistem
  login Better Auth).
- Akses server: SSH hanya dengan kunci; panel hanya dari IP pemilik; PostgreSQL tidak terbuka ke internet.
- `.env` tidak pernah di-commit (sudah menjadi aturan repo).

## 5. Ruang lingkup

**Masuk:** semua bagian 4.

**Tidak masuk:** pengiriman email dari aplikasi (mis. notifikasi ke pasien); rilis otomatis (CI/CD); Object Storage untuk file pasien (file disimpan di
disk VPS — ditinjau ulang bila mendekati 10 GB); fitur pendaftaran pasien, rekam medis, apotek, dan
kasir (sub-proyek 1–3).

## 6. Pengujian & verifikasi

| Yang diuji | Cara | Lulus bila |
|---|---|---|
| Pergantian adapter Prisma | Seluruh tes unit, integrasi, e2e | Semua hijau |
| Build standalone | `next build` + jalankan `server.js` | Halaman publik & `/masuk` tampil |
| Restore database | Jumlah baris per tabel Neon vs VPS | Identik |
| Aplikasi di VPS | Login admin, buka jadwal, buat & batalkan booking uji | Berhasil |
| Rilis & kembali | `deploy.sh` lalu kembali ke rilis sebelumnya | Situs tetap melayani |
| HTTPS & DNS | `curl -I` http→https, www→apex, SSL Full (strict) | 301/200 sesuai |
| Keamanan | Port terbuka dari luar; akses panel dari IP lain | Hanya 22/80/443/panel; panel menolak |
| Backup | Jalankan manual → dekripsi → restore ke DB kosong | Jumlah baris identik |
| Pemantauan | Matikan aplikasi sebentar; lewati satu backup | Notifikasi diterima |

## 7. Urutan pekerjaan

1. Pemilik: install ulang VPS ke Ubuntu 24.04, beri nama & proteksi; pindahkan nameserver ke Cloudflare.
2. Server dasar + aaPanel + PostgreSQL + Node (Claude lewat SSH).
3. Perubahan kode di branch fitur → PR → merge.
4. Gladi restore dari Neon + uji aplikasi di VPS.
5. DNS + SSL + Force HTTPS.
6. Pemilik: buat storage account IDCloudHost khusus SunDY + bucket `sundy-backup` + access key. Lalu backup
   terenkripsi + uji pemulihan + pemantauan.
6a. Email `@sundyclinic.com`: record MX/SPF/DKIM/DMARC di Cloudflare, lalu ganti email login Super Admin
   (setelah penyedia kotak masuk dipilih — boleh menyusul).
7. Perpindahan final malam hari.
8. Satu minggu kemudian: hapus proyek Vercel dan data produksi Neon.

## 8. Risiko

| Risiko | Mitigasi |
|---|---|
| RAM 2 GB sempit saat build | Swap 2 GB; build di folder rilis baru sehingga aplikasi lama tetap berjalan |
| Kata sandi enkripsi backup hilang | Disimpan di dua tempat oleh pemilik; diuji saat uji pemulihan |
| Salah reinstall VPS | Nama jelas + proteksi di console; backup di luar server |
| Versi PostgreSQL VPS ≠ Neon | Samakan versi mayor; gladi restore sebelum perpindahan final |
| Data tertinggal di Neon/Vercel | Dihapus satu minggu setelah pindah, setelah backup terbukti bisa dipulihkan |

## 9. Pertanyaan terbuka

1. **Penyedia kotak masuk `@sundyclinic.com`** — menentukan record MX/SPF/DKIM yang dipasang dan alamat
   login Super Admin yang baru. Tidak menghalangi migrasi server.
2. ~~Akun Cloudflare~~ — **akun yang sama dengan welcomemanado.com** (pemilik, 26 Sep 2026; K9).
3. ~~Email klinik~~ — **memakai `@sundyclinic.com`** (pemilik, 26 Sep 2026; K10).
