# Runbook Server SunDY (`sundyclinic.com`)

Panduan mengelola dan memulihkan server produksi SunDY Clinic. Ditulis 28 September 2026, saat
aplikasi pindah dari Vercel + Neon ke VPS sendiri (Plan 0,
`docs/superpowers/plans/2026-09-26-plan-0-migrasi-vps-sundy.md`).

**Tidak ada rahasia di dokumen ini.** Kata sandi, kunci, dan kode *security entrance* disimpan pemilik di
pengelola kata sandi atau hanya ada di server.

## 1. Ringkasan

| | |
|---|---|
| Situs | https://sundyclinic.com (`www` dialihkan ke domain utama). Proyek Vercel & Neon lama sudah dihapus (28 Sep 2026) |
| VPS | **sundy-production** — IDCloudHost jkt01, akun "Marchelino Raco" (terpisah dari akun Welcome Manado); IP `103.186.1.38`; 2 vCPU / 2 GB RAM / 20 GB disk |
| OS & perangkat | Ubuntu 24.04.5 LTS · aaPanel 8.0.6 (Nginx 1.24.0) · PostgreSQL 18.6 (PGDG) · Node.js 22 (NodeSource) · PM2 7 · rclone 1.60 |
| DNS | Cloudflare (akun yang sama dengan `welcomemanado.com`), proxy aktif, SSL/TLS **Full (strict)**; nameserver diatur di Jetorbit |
| Sertifikat | Let's Encrypt dari aaPanel untuk `sundyclinic.com` + `www`, diperpanjang otomatis |
| Email | `@sundyclinic.com` **hanya nama login** — zona diberi null MX, `v=spf1 -all`, DMARC `p=reject` |
| Login Super Admin | `admin@sundyclinic.com` (kata sandi di pengelola kata sandi pemilik) |
| Pemantauan | UptimeRobot (situs, tiap 5 menit) dan Healthchecks.io `sundy-backup` (backup harian) → email pemilik |

## 2. Akses

- **SSH** (hanya kunci; kata sandi & root ditolak): `ssh sundy` dari Mac pemilik, kunci `~/.ssh/sundy_ed25519`,
  user admin `sundy` (bawaan IDCloudHost, sudo tanpa kata sandi).
  Berkas pengaman SSH harus bernama `/etc/ssh/sshd_config.d/00-sundy.conf`: sshd memakai nilai yang dibaca
  pertama, dan `50-cloud-init.conf` berisi `PasswordAuthentication yes`.
- **aaPanel tertutup dari internet.** Buka dengan klik dua kali `~/Desktop/Buka-Panel-SunDY.command`
  (menyalakan terowongan `ssh -N sundy-panel` lalu membuka `https://localhost:27869/<entrance>`), atau
  manual: `ssh -N sundy-panel` lalu buka alamat itu di browser. Lupa kata sandi panel → `ssh sundy 'sudo bt'`.
- IP internet pemilik berubah-ubah (jaringan seluler), karena itu tidak ada pembatasan per-IP. Jaringan itu
  juga "menjawab" koneksi ke port mana pun, jadi **jangan menguji port dengan `nc` dari Mac** — periksa dari
  server (`sudo ufw status`, log `UFW BLOCK`) atau dengan `curl` sungguhan.
- Firewall (ufw) hanya membuka 22, 80, 443. PostgreSQL hanya `localhost`; aplikasi hanya `127.0.0.1:3000`.

## 3. Susunan folder

```
/www/sundy/                  sundyapp:www 750
  releases/<YYYYmmdd-HHMMSS>/  kode + build + node_modules (3 rilis terakhir disimpan)
  current -> releases/<aktif>  dijalankan PM2 dari .next/standalone
  shared/.env                  rahasia aplikasi, sundyapp 600 (Nginx TIDAK bisa membacanya)
  shared/pemeliharaan.html     halaman 503 saat mode pemeliharaan
  maintenance.on               ada = mode pemeliharaan aktif
/www/sundy-files/            file pasien (BIA, scan), sundyapp 700, di luar web root
/root/backup/                salinan backup lokal 7 hari
/etc/cron.d/sundy-backup     jadwal backup 02.00 WITA
```

Aplikasi berjalan sebagai user sistem **`sundyapp`** (tanpa sudo) di bawah PM2 (`pm2-sundyapp.service`,
menyala otomatis saat server restart). Database & role PostgreSQL: `sundy`.
Aturan Nginx situs ada di aaPanel → situs → *URL rewrite*
(`/www/server/panel/vhost/rewrite/sundyclinic.com.conf`, sumbernya `scripts/server/nginx/sundyclinic.com.conf`);
IP asli pengunjung dari Cloudflare di `/www/server/panel/vhost/nginx/0.cloudflare-realip.conf`
(buat ulang dengan `scripts/server/nginx/cloudflare-realip.sh` bila Cloudflare mengubah daftar IP-nya).

## 4. Rilis & kembali ke rilis sebelumnya

```bash
# rilis main terbaru (build ±1 menit; rilis lama tetap melayani selama build)
ssh sundy 'sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh'
# kembali ke rilis sebelumnya
ssh sundy 'sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh kembali'
# periksa situs
bash scripts/server/cek-situs.sh https://sundyclinic.com
```

- Rilis panjang sebaiknya dijalankan di latar belakang di server (koneksi seluler pemilik sering putus):
  `sudo -u sundyapp -H bash -c "cd /home/sundyapp && nohup /www/sundy/current/scripts/server/deploy.sh > deploy.log 2>&1 < /dev/null &"`.
- **Migrasi database dijalankan sebelum rilis baru aktif.** Perubahan skema harus tetap cocok dengan kode rilis
  sebelumnya (tambah kolom dulu, hapus di rilis berikutnya) — kalau tidak, "kembali" tidak menolong.
- **Sejak Plan 3b-1 (pendaftaran situs), jangan `deploy.sh kembali` ke rilis sebelum 3b-1 setelah ada booking dari situs.** Booking situs boleh belum punya pasien, dan kode lama menganggap pasien selalu ada — daftar booking akan rusak. Bila terpaksa, cocokkan dulu semua booking berlabel "Belum dicocokkan".
- Rilis gagal dihapus otomatis dan versi aktif tidak berubah.

## 5. Mode pemeliharaan

```bash
ssh sundy 'sudo -u sundyapp touch /www/sundy/maintenance.on'   # nyalakan — pengunjung melihat halaman 503
ssh sundy 'sudo rm -f /www/sundy/maintenance.on'                # matikan
```

## 6. Skrip admin di server

```bash
ssh sundy 'sudo -u sundyapp -H bash -c "cd /www/sundy/current && npm run -s reset-password -- <email> \"\$PW\""'
ssh sundy 'sudo -u sundyapp -H bash -c "cd /www/sundy/current && npm run -s change-email -- <email-lama> <email-baru>"'
```

Kata sandi baru **jangan diketik di perintah atau chat**: buat di server
(mis. `openssl rand` atau pembuat frasa), berikan lewat variabel lingkungan `PW`, lalu serahkan ke pemilik
lewat berkas 600 di Mac yang dibuka di TextEdit dan kemudian dihapus. Kedua skrip menghapus semua sesi lama akun itu.

## 7. Backup

| | |
|---|---|
| Jadwal | setiap hari **02.00 WITA** (`/etc/cron.d/sundy-backup`, log `/var/log/sundy-backup.log`) |
| Isi | `sundy.dump` (pg_dump format custom), `file-pasien.tar.gz`, `konfigurasi.tar.gz` (`shared/.env` + vhost/rewrite Nginx) |
| Tujuan | IDCloudHost Object Storage, **storage account "SunDY"** (akun "Marchelino Raco"), bucket `sundy-backup` |
| Enkripsi | rclone crypt (remote `sundy-crypt:`), kata sandi `password` + `password2` di pengelola kata sandi pemilik **dan** satu tempat aman lain — tanpa keduanya backup tidak bisa dibuka |
| Retensi | 7 hari lokal; 30 hari di bucket (dihitung dari nama folder bertanggal) |
| Laporan | sinyal ke Healthchecks setiap selesai; gagal → `/fail` → email pemilik |

Konfigurasi rclone: `/root/.config/rclone/rclone.conf`; URL heartbeat: `/root/.config/sundy-backup.env`.

**Uji pemulihan — bulanan** (atau setelah perubahan backup):

```bash
ssh sundy 'cd /tmp && sudo /www/sundy/current/scripts/server/restore-test.sh'      # harus diakhiri "PULIH OK"
```

**Memulihkan data sungguhan** (mis. setelah salah hapus): nyalakan mode pemeliharaan → `pm2 stop sundy` →
`rclone copy sundy-crypt:harian/<tanggal> /root/pulih` → `dropdb sundy` + `createdb -O sundy sundy` →
`pg_restore --no-owner --no-acl -d "$DATABASE_URL" /root/pulih/sundy.dump` → ekstrak `file-pasien.tar.gz` ke `/www/`
→ `pm2 start` → matikan mode pemeliharaan. Backup mingguan VM dari IDCloudHost juga aktif sebagai lapis kedua.

## 8. Membangun ulang server dari nol

Ikuti Plan 0 Task 8 → 9 → 10 → 11 dengan dua perbedaan: data dipulihkan dari **backup terbaru** (bagian 7),
bukan dari Neon; dan `shared/.env` diambil dari `konfigurasi.tar.gz` di backup (bila dibuat ulang,
`BETTER_AUTH_SECRET` baru membuat semua staf login ulang — tidak ada data lain yang terkunci olehnya).
Pelajaran yang sudah dimasukkan ke skrip dan plan: `deploy.sh` berpindah ke `/www/sundy` sebelum `find`
(GNU find gagal bila folder kerja pemanggil tidak bisa dibaca `sundyapp`); `restore-test.sh` mengalirkan SQL
lewat stdin; `cek-situs.sh` membuang kredensial dari URL yang dicetaknya; backup vhost memakai subfolder
`nginx/` dan `rewrite/` karena kedua berkasnya bernama sama; `nginx -V` harus memuat `http_realip_module`.

## 9. Pemeriksaan & pemeliharaan rutin

| Kapan | Apa |
|---|---|
| Setiap rilis | `bash scripts/server/cek-situs.sh https://sundyclinic.com` → semua ✓ |
| Bulanan | uji pemulihan (bagian 7); `ssh sundy 'df -h /; free -h'` |
| Disk > 80% | `sudo apt-get clean`; kurangi rilis lama (`releases/` — tiap rilis ±1,6 GB karena `node_modules` disimpan untuk skrip admin); periksa `/var/log` dan `/root/backup` |
| Paket sistem | pembaruan keamanan otomatis (`unattended-upgrades`); restart bila `/var/run/reboot-required` ada |
| Sertifikat | diperpanjang aaPanel otomatis; cek sisa hari di aaPanel → situs → SSL |
| fail2ban | `sudo fail2ban-client status sshd` — IP yang diblokir wajar (bot) |

## 10. Riwayat pembersihan (Plan 0 Task 14)

28 Sep 2026: pemilik menghapus proyek Vercel dan **seluruh proyek Neon SunDY** (lebih awal dari rencana satu
minggu; uji pemulihan dari backup lulus pada hari yang sama). `/root/pindah` (URL Neon + dump) dihancurkan di
server, `vercel.json` dihapus dari repo. Pengembangan & uji di laptop pindah ke PostgreSQL 18 lokal
(`sundy_dev`, `sundy_test`) — lihat README. **Satu-satunya salinan data produksi kini ada di VPS dan di backup
terenkripsi**, jadi uji pemulihan bulanan (bagian 7) penting.
