# Plan 0 — Migrasi SunDY ke VPS sundy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memindahkan aplikasi, database, dan file pasien SunDY dari Vercel + Neon ke VPS sundy
(Ubuntu 24.04 + aaPanel) yang tayang di `https://sundyclinic.com`, lengkap dengan rilis yang bisa
dikembalikan, backup harian terenkripsi, dan pemantauan.

**Architecture:** Kode diubah seminimal mungkin: adapter Prisma diganti ke PostgreSQL biasa, Next.js
dibangun sebagai server mandiri (`standalone`), dan seluruh berkas operasional server (rilis, backup,
uji pulih, konfigurasi Nginx & PM2) disimpan di repo pada `scripts/server/` beserta ujinya. Pekerjaan
server dilakukan Claude lewat SSH (setiap perintah disetujui) sementara pemilik mengerjakan bagian UI
(console IDCloudHost, aaPanel, Cloudflare, Jetorbit, Healthchecks, UptimeRobot). Perpindahan final
dilakukan malam hari dengan mode pemeliharaan, sehingga tidak ada penulisan yang hilang.

**Tech Stack:** Next.js 15.5 (output standalone) · Prisma 7.10 + `@prisma/adapter-pg` · PostgreSQL 18
(PGDG) · Node.js 22 (NodeSource) + PM2 · aaPanel (Nginx, SSL Let's Encrypt, cron, Files) · Cloudflare ·
rclone crypt → IDCloudHost Object Storage · Bash (skrip server + uji dengan perintah tiruan) · Vitest

**Spec:** `docs/superpowers/specs/2026-09-26-migrasi-vps-sundy-design.md` (disetujui pemilik 26 Sep 2026)

## Global Constraints

- Node.js **≥ 22.20** (`engines` di `package.json`).
- **PostgreSQL 18** di VPS — Neon produksi saat ini `18.6`. Ekstensi `btree_gist` wajib tersedia
  (dipakai exclusion constraint anti-bentrok di tabel `Appointment` dan `SlotHold`).
- Prisma tetap **7.10**; adapter baru `@prisma/adapter-pg` versi `^7.10.0`.
- Domain `sundyclinic.com`; `www.sundyclinic.com` → 301 ke `https://sundyclinic.com`.
- Cloudflare: zona di akun yang sama dengan `welcomemanado.com`, proxy aktif, SSL **Full (strict)**.
- `@sundyclinic.com` **hanya nama login** — zona diberi null MX, `v=spf1 -all`, DMARC `p=reject`.
- VPS sundy **terpisah total** dari Wm-2026: kunci SSH, panel, database, dan *storage account*
  Object Storage sendiri. Tidak ada kredensial yang dipakai bersama.
- Rahasia **tidak pernah** dikirim lewat chat dan `.env` **tidak pernah** di-commit. Pemilik mengisi
  rahasia lewat aaPanel *Files*; rahasia yang dibuat mesin langsung ditulis ke berkas di server.
- Zona waktu **WITA** (`Asia/Makassar`). Perpindahan final **≥ 19.00 WITA** (klinik tutup). Backup
  **02.00 WITA**.
- Firewall hanya membuka **22, 80, 443**; PostgreSQL hanya `localhost`. **Port panel tertutup** — aaPanel
  dibuka lewat terowongan SSH (`ssh -N sundy-panel`, lalu `https://localhost:<port-panel>/<entrance>`),
  karena IP internet pemilik berubah-ubah (jaringan seluler) sehingga batasan per-IP tidak bisa dipakai.
- Jaringan seluler pemilik "menjawab" koneksi TCP ke port mana pun, jadi `nc -z` dari Mac **tidak**
  bisa dipakai untuk menguji port; periksa dari sisi server (`ufw status`, log `UFW BLOCK`) atau dengan
  permintaan sungguhan (`curl`).
- VPS **sundy-production**: IP `103.186.1.38` (IDCloudHost jkt01, akun "Marchelino Raco" — terpisah dari
  akun Welcome Manado). User admin SSH = **`sundy`** (bawaan IDCloudHost, tidak bisa diubah); aplikasi
  berjalan sebagai user sistem **`sundyapp`** tanpa hak sudo. Database & role PostgreSQL tetap bernama `sundy`.
- Retensi: rilis **3** terakhir; backup **30 hari** di bucket (dihitung dari nama folder bertanggal),
  **7 hari** lokal.
- Teks antarmuka, komentar kode, dan dokumen dalam Bahasa Indonesia; pesan commit dalam bahasa Inggris
  (mengikuti riwayat repo) dan diakhiri
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Penyesuaian dari spec (dijelaskan ke pemilik saat plan diserahkan):**
1. PostgreSQL 18 dipasang dari repositori resmi PostgreSQL (PGDG) dan Node.js 22 dari NodeSource +
   PM2 global — bukan dari menu aaPanel — karena versinya harus tepat dan proses aplikasi harus bisa
   dikendalikan `deploy.sh`. aaPanel tetap dipakai untuk Nginx, SSL, cron, dan *Files*.
2. Berkas operasional ada di `scripts/server/` (spec menyebut `scripts/deploy.sh`); spec diperbarui
   di Task 13.
3. `node_modules` tetap disimpan di setiap rilis agar `npm run reset-password` / `change-email` bisa
   dijalankan di server.

## Susunan berkas

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/db.ts` (ubah) | Klien Prisma runtime — adapter PostgreSQL biasa |
| `prisma/seed.ts` (ubah) | Klien seed — adapter PostgreSQL biasa |
| `prisma.config.ts` (ubah komentar) | URL migrasi |
| `neon.ts` (hapus) | Konfigurasi Neon yang tidak dipakai lagi |
| `.env.example` (ubah) | Contoh variabel untuk VPS, pengembangan, dan uji |
| `next.config.ts` (ubah) | `output: "standalone"` |
| `src/server/account.ts` (baru) | `changeLoginEmail()` — ganti email login staf |
| `scripts/change-email.mts` (baru) | CLI pembungkus `changeLoginEmail()` |
| `scripts/server/deploy.sh` (baru) | Rilis & kembali ke rilis sebelumnya |
| `scripts/server/ecosystem.config.cjs` (baru) | Definisi proses PM2 |
| `scripts/server/cek-situs.sh` (baru) | Pemeriksaan cepat situs setelah rilis |
| `scripts/server/backup.sh` (baru) | Backup harian terenkripsi + heartbeat |
| `scripts/server/restore-test.sh` (baru) | Uji pemulihan dari bucket |
| `scripts/server/hitung-baris.sql` (baru) | Jumlah baris per tabel (Neon vs VPS, uji pulih) |
| `scripts/server/nginx/sundyclinic.com.conf` (baru) | Aturan situs: proxy, www, pemeliharaan |
| `scripts/server/nginx/cloudflare-realip.sh` (baru) | Membuat konfigurasi IP asli pengunjung dari daftar resmi Cloudflare |
| `scripts/server/pemeliharaan.html` (baru) | Halaman 503 saat perpindahan |
| `tests/unit/db.test.ts` (baru) | Kontrak klien database |
| `tests/unit/next-config.test.ts` (baru) | Kontrak konfigurasi Next |
| `tests/integration/account.test.ts` (baru) | Ganti email login |
| `tests/server/deploy.test.sh` (baru) | Uji `deploy.sh` dengan perintah tiruan |
| `tests/server/backup.test.sh` (baru) | Uji `backup.sh` dengan perintah tiruan |
| `vercel.json` (ubah di Task 12, hapus di Task 14) | Pengalihan masa transisi |
| `docs/operasional/server-sundy.md` (baru) | Runbook server |

Branch kerja: **`migrasi-vps-sundy`**, dibuat dari `desain-migrasi-vps` (sudah berisi spec dan plan
ini). Seluruh perubahan kode masuk satu PR yang **baru di-merge saat perpindahan final (Task 12)** —
merge ke `main` memicu Vercel, dan Vercel hanya boleh berubah menjadi pengalihan pada malam itu. Gladi
di VPS memakai branch ini langsung (`SUNDY_BRANCH=migrasi-vps-sundy`).

---

### Task 1: Adapter PostgreSQL biasa

**Files:**
- Create: `tests/unit/db.test.ts`
- Modify: `src/lib/db.ts`, `prisma/seed.ts:1-24`, `prisma.config.ts:4-9`, `.env.example`, `package.json`, `package-lock.json`
- Delete: `neon.ts`

**Interfaces:**
- Consumes: —
- Produces: `prisma` dari `@/lib/db` (nama & tipe tidak berubah: `PrismaClient`). Variabel lingkungan
  yang dibaca tetap `DATABASE_URL` (runtime) dan `DATABASE_URL_UNPOOLED` (migrasi & seed), ditambah
  `PATIENT_FILES_DIR` (baru terdokumentasi, belum dibaca kode).

- [x] **Step 1: Buat branch kerja**

```bash
git switch desain-migrasi-vps && git switch -c migrasi-vps-sundy
```

- [x] **Step 2: Tulis uji yang gagal — `tests/unit/db.test.ts`**

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Konstruktor tiruan: uji ini memeriksa KONTRAK src/lib/db.ts (adapter apa
// yang dipakai dan connection string mana yang diberikan), bukan koneksi
// sungguhan — koneksi sungguhan diuji di tests/integration/connection.test.ts.
const { PrismaPg, PrismaClient } = vi.hoisted(() => ({
  PrismaPg: vi.fn(function (this: { options: unknown }, options: unknown) {
    this.options = options;
  }),
  PrismaClient: vi.fn(function (this: { config: unknown }, config: unknown) {
    this.config = config;
  }),
}));

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg }));
vi.mock("@prisma/client", () => ({ PrismaClient }));

describe("klien basis data (src/lib/db.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    PrismaPg.mockClear();
    PrismaClient.mockClear();
    // db.ts menyimpan klien di globalThis di luar produksi; buang agar setiap
    // uji membuat klien baru.
    delete (globalThis as { prisma?: unknown }).prisma;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("memakai adapter PostgreSQL biasa dengan DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://sundy:rahasia@127.0.0.1:5432/sundy");

    await import("@/lib/db");

    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: "postgresql://sundy:rahasia@127.0.0.1:5432/sundy",
    });
    const [config] = PrismaClient.mock.calls[0] as [{ adapter: unknown }];
    expect(config.adapter).toBe(PrismaPg.mock.instances[0]);
  });

  it("menolak berjalan tanpa DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(import("@/lib/db")).rejects.toThrow("DATABASE_URL belum diisi");
  });
});
```

- [x] **Step 3: Jalankan — harus gagal**

Run: `npx vitest run tests/unit/db.test.ts`
Expected: FAIL — `PrismaPg` tidak pernah dipanggil (db.ts masih memakai `PrismaNeon`) atau
`@prisma/adapter-pg` belum terpasang.

- [x] **Step 4: Ganti dependensi**

```bash
npm uninstall @prisma/adapter-neon @neon/config @neon/env
npm install @prisma/adapter-pg@^7.10.0
npm ls pg
```

Expected: `npm ls pg` menampilkan `pg@8.x` di bawah `@prisma/adapter-pg`. Bila `(empty)`, jalankan
`npm install pg` (adapter membutuhkannya saat runtime).

- [x] **Step 5: Tulis ulang `src/lib/db.ts`**

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL belum diisi. Salin .env.example menjadi .env lalu isi dengan connection string PostgreSQL.",
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Adapter PostgreSQL biasa (node-postgres). Di VPS menunjuk PostgreSQL lokal;
  // untuk uji integrasi tetap bisa menunjuk branch "test" di Neon.
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Satu instance dipakai ulang agar hot reload Next.js tidak membocorkan koneksi.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [x] **Step 6: Jalankan uji unit — harus lulus**

Run: `npx vitest run tests/unit/db.test.ts`
Expected: PASS (2 uji).

- [x] **Step 7: Ganti adapter di `prisma/seed.ts`**

Ganti baris 1–24 (impor sampai akhir `createSeedClient`) menjadi:

```ts
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Seed memakai DATABASE_URL_UNPOOLED, bukan DATABASE_URL.
 *
 * Di Neon, DATABASE_URL adalah pooler mode transaksi yang tidak mendukung
 * transaksi batch seperti yang dipakai di bawah — percobaannya gagal dengan
 * "Unable to start a transaction in the given time". Di VPS kedua nilai sama
 * (PostgreSQL lokal), jadi pembedaan ini hanya berarti untuk Neon.
 */
function createSeedClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED belum diisi. Seed membutuhkan koneksi langsung ke PostgreSQL.",
    );
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
```

- [x] **Step 8: Perbarui komentar `prisma.config.ts` (baris 4–9)**

```ts
// Perintah CLI (migrate, seed) memakai DATABASE_URL_UNPOOLED. Di VPS nilainya
// sama dengan DATABASE_URL (PostgreSQL lokal). Untuk Neon (branch "test") ini
// koneksi LANGSUNG tanpa "-pooler", karena pooler Neon menolak DDL migrasi.
//
// PRISMA_TARGET=test mengarahkan perintah ke branch "test" di Neon.
// Dipakai oleh `npm run db:migrate:test`, agar migrasi uji tidak pernah
// menyentuh database lain hanya karena lupa mengganti variabel.
```

- [x] **Step 9: Hapus `neon.ts` dan tulis ulang `.env.example`**

```bash
git rm neon.ts
```

Isi baru `.env.example`:

```dotenv
# Salin berkas ini menjadi .env lalu isi dengan nilai asli.
# .env TIDAK BOLEH di-commit — berisi kredensial basis data rekam medis.
#
# Produksi (VPS sundy): .env ada di /www/sundy/shared/.env, dibuat langsung di
# server dan hanya bisa dibaca user "sundyapp". Kedua URL di bawah menunjuk
# PostgreSQL 18 lokal (127.0.0.1) dan bernilai sama.
#
# Pengembangan di laptop: arahkan ke branch "dev" di Neon — bukan "test", dan
# bukan database produksi.

# Dipakai runtime aplikasi.
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
# Dipakai prisma migrate & seed. Di Neon: endpoint LANGSUNG (tanpa "-pooler").
DATABASE_URL_UNPOOLED="postgresql://USER:PASSWORD@HOST:5432/DATABASE"

# Branch "test" di Neon — dipakai uji integrasi & e2e. Tabelnya dikosongkan
# berulang kali, jadi JANGAN PERNAH mengarahkan dua nilai ini ke database lain.
# Ambil dengan: neon connection-string test --pooled   (dan tanpa --pooled)
TEST_DATABASE_URL="postgresql://..."
TEST_DATABASE_URL_UNPOOLED="postgresql://..."

# URL situs. Produksi: https://sundyclinic.com
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# Better Auth — hasilkan dengan: openssl rand -base64 32
BETTER_AUTH_SECRET="ganti-dengan-secret-32-karakter-atau-lebih"
BETTER_AUTH_URL="http://localhost:3000"

# Folder file pasien (hasil BIA, scan rekam medis lama). Di luar web root dan
# hanya dibuka lewat aplikasi. Produksi: /www/sundy-files
PATIENT_FILES_DIR="/www/sundy-files"
```

- [x] **Step 10: Jalankan seluruh uji**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run test:integration
npm run test:e2e
```

Expected: semua hijau. Uji integrasi dan e2e kini lewat `@prisma/adapter-pg` ke branch *test* Neon.
Bila uji integrasi gagal dengan `prepared statement "…" already exists`, arahkan `TEST_DATABASE_URL`
di `.env` lokal ke endpoint langsung (sama dengan `TEST_DATABASE_URL_UNPOOLED`) — uji berjalan
berurutan, jadi pooler tidak dibutuhkan — lalu ulangi. Catat di pesan commit bila langkah ini perlu.

- [x] **Step 11: Commit**

```bash
git add src/lib/db.ts prisma/seed.ts prisma.config.ts .env.example package.json package-lock.json tests/unit/db.test.ts
git commit -m "feat: talk to PostgreSQL through the plain pg adapter

The app is moving to its own PostgreSQL on the sundy VPS, so the Neon
serverless adapter goes. @prisma/adapter-pg still reaches the Neon test
branch, which keeps integration and e2e tests unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`neon.ts` sudah di-stage oleh `git rm` di Step 9.)

---

### Task 2: Server mandiri, proses PM2, dan pemeriksaan situs

**Files:**
- Create: `tests/unit/next-config.test.ts`, `scripts/server/ecosystem.config.cjs`, `scripts/server/cek-situs.sh`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: —
- Produces: build menghasilkan `.next/standalone/server.js`. Proses PM2 bernama **`sundy`**,
  mendengarkan `127.0.0.1:3000`, membaca rahasia dari `/www/sundy/shared/.env`.
  `scripts/server/cek-situs.sh <base-url> [opsi-curl...]` keluar 0 bila situs sehat.

- [ ] **Step 1: Tulis uji yang gagal — `tests/unit/next-config.test.ts`**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config", () => {
  it("menghasilkan server mandiri untuk VPS", () => {
    expect(nextConfig.output).toBe("standalone");
  });

  it("tetap mengaktifkan authInterrupts yang dipakai forbidden()", () => {
    expect(nextConfig.experimental?.authInterrupts).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npx vitest run tests/unit/next-config.test.ts`
Expected: FAIL — `expected undefined to be 'standalone'`.

- [ ] **Step 3: Ubah `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Node mandiri untuk VPS: .next/standalone/server.js membawa modul
  // yang dibutuhkannya sendiri. Aset statis & public disalin oleh deploy.sh.
  output: "standalone",
  experimental: {
    // Dibutuhkan oleh forbidden() di src/server/session.ts, yang memberi
    // respons 403 alih-alih mengalihkan staf berwenang ke halaman login.
    authInterrupts: true,
  },
};

export default nextConfig;
```

- [ ] **Step 4: Jalankan — harus lulus**

Run: `npx vitest run tests/unit/next-config.test.ts`
Expected: PASS (2 uji).

- [ ] **Step 5: Tulis `scripts/server/ecosystem.config.cjs`**

```js
// Proses aplikasi SunDY di VPS, dijalankan PM2 sebagai user "sundyapp".
// Jalurnya lewat symlink /www/sundy/current, dan deploy.sh selalu menjalankan
// `pm2 delete` + `pm2 start` berkas ini, sehingga rilis baru pasti terpakai.
module.exports = {
  apps: [
    {
      name: "sundy",
      cwd: "/www/sundy/current/.next/standalone",
      script: "server.js",
      // Rahasia dibaca dari berkas bersama; tidak pernah disalin ke folder rilis.
      node_args: "--env-file=/www/sundy/shared/.env",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
      },
      max_memory_restart: "700M",
      time: true,
    },
  ],
};
```

- [ ] **Step 6: Tulis `scripts/server/cek-situs.sh`**

```bash
#!/usr/bin/env bash
# Pemeriksaan cepat situs SunDY setelah rilis.
# Pakai:  cek-situs.sh https://sundyclinic.com
#         cek-situs.sh http://sundyclinic.com --resolve sundyclinic.com:80:<IP>   (sebelum DNS)
# Keluar 0 bila semua pemeriksaan lulus.
set -uo pipefail

BASE=${1:?Pakai: cek-situs.sh <base-url> [opsi curl tambahan...]}
shift
EXTRA=("$@")
gagal=0

# ${EXTRA[@]+"${EXTRA[@]}"}: aman untuk larik kosong di bash 3.2 (macOS) dengan set -u.
kode() { curl -s -o /dev/null -m 20 -w '%{http_code}' ${EXTRA[@]+"${EXTRA[@]}"} "$BASE$1"; }
lapor() { # nama, lulus?
  if [ "$2" = 1 ]; then echo "  ✓ $1"; else echo "  ✗ $1"; gagal=1; fi
}

for jalur in / /layanan /program-slimming /masuk; do
  k=$(kode "$jalur")
  lapor "$jalur → $k (harus 200)" "$([ "$k" = 200 ] && echo 1 || echo 0)"
done

# /admin tanpa login harus dialihkan ke /masuk, bukan ditampilkan.
lokasi=$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' ${EXTRA[@]+"${EXTRA[@]}"} "$BASE/admin")
lapor "/admin tanpa login → $lokasi (harus 30x ke /masuk)" \
  "$([[ $lokasi =~ ^30[1278]\ .*/masuk ]] && echo 1 || echo 0)"

# Aset statis harus ikut tersalin ke server mandiri.
aset=$(curl -s -m 20 ${EXTRA[@]+"${EXTRA[@]}"} "$BASE/" | grep -oE '/_next/static/[^"]+\.js' | head -1)
if [ -n "$aset" ]; then
  k=$(kode "$aset")
  lapor "aset $aset → $k (harus 200)" "$([ "$k" = 200 ] && echo 1 || echo 0)"
else
  lapor "halaman utama memuat aset /_next/static" 0
fi

k=$(kode /api/auth/get-session)
lapor "/api/auth/get-session → $k (harus 200)" "$([ "$k" = 200 ] && echo 1 || echo 0)"

exit $gagal
```

```bash
chmod +x scripts/server/cek-situs.sh
```

- [ ] **Step 7: Uji `cek-situs.sh` terhadap server pengembangan**

```bash
npm run dev    # terminal lain; tunggu "Ready"
bash scripts/server/cek-situs.sh http://localhost:3000
```

Expected: semua baris `✓`, keluar 0. (Uji membaca halaman saja, tidak menulis ke database.)
Uji kegagalan: `bash scripts/server/cek-situs.sh http://localhost:3999; echo $?` → baris `✗` dan `1`.
Hentikan `npm run dev` sesudahnya.

- [ ] **Step 8: Commit**

```bash
git add next.config.ts tests/unit/next-config.test.ts scripts/server/ecosystem.config.cjs scripts/server/cek-situs.sh
git commit -m "feat: build a standalone Next server and add a post-release site check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Skrip rilis `deploy.sh` (dengan kembali ke rilis sebelumnya)

**Files:**
- Create: `scripts/server/deploy.sh`, `tests/server/deploy.test.sh`
- Modify: `package.json` (skrip `test:server`)

**Interfaces:**
- Consumes: `scripts/server/ecosystem.config.cjs` (Task 2); `npm run build` menghasilkan `.next/standalone` + `.next/static`.
- Produces: `deploy.sh [rilis|kembali]`. Variabel yang bisa diganti (untuk uji dan gladi):
  `SUNDY_ROOT` (bawaan `/www/sundy`), `SUNDY_REPO` (bawaan repo GitHub), `SUNDY_BRANCH` (bawaan
  `main`), `SUNDY_KEEP` (bawaan `3`). Susunan: `$SUNDY_ROOT/releases/<YYYYmmdd-HHMMSS>/`,
  `$SUNDY_ROOT/current` (symlink), `$SUNDY_ROOT/shared/.env`.

- [ ] **Step 1: Tulis uji yang gagal — `tests/server/deploy.test.sh`**

```bash
#!/usr/bin/env bash
# Uji deploy.sh tanpa server: git, npm, npx, dan pm2 diganti tiruan di PATH.
set -euo pipefail

SINI=$(cd "$(dirname "$0")" && pwd)
DEPLOY="$SINI/../../scripts/server/deploy.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

export SUNDY_ROOT=$TMP/www/sundy SUNDY_REPO=$TMP/repo-palsu SUNDY_KEEP=3
export LOG=$TMP/perintah.log
mkdir -p "$SUNDY_ROOT/shared" "$TMP/bin"
echo 'DATABASE_URL="postgresql://uji"' > "$SUNDY_ROOT/shared/.env"

cat > "$TMP/bin/git" <<'EOF'
#!/usr/bin/env bash
# git clone --quiet --depth 1 --branch <b> <repo> <dir>
dir=${*: -1}
mkdir -p "$dir/public" "$dir/scripts/server"
echo '{}' > "$dir/package.json"
touch "$dir/public/logo.png"
if [ -n "${GAGAL_BUILD:-}" ]; then touch "$dir/.gagal"; fi
EOF
cat > "$TMP/bin/npm" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  ci) mkdir -p node_modules ;;
  run)
    if [ -e .gagal ]; then echo "build gagal" >&2; exit 1; fi
    mkdir -p .next/standalone .next/static/chunks
    touch .next/standalone/server.js .next/static/chunks/app.js ;;
esac
EOF
printf '#!/usr/bin/env bash\necho "npx $*" >> "$LOG"\n' > "$TMP/bin/npx"
printf '#!/usr/bin/env bash\necho "pm2 $*" >> "$LOG"\n' > "$TMP/bin/pm2"
chmod +x "$TMP/bin/"*
export PATH="$TMP/bin:$PATH"

lulus=0; gagal=0
periksa() {
  if eval "$2"; then lulus=$((lulus + 1)); echo "  ✓ $1"; else gagal=$((gagal + 1)); echo "  ✗ $1"; fi
}
jumlah_rilis() { ls "$SUNDY_ROOT/releases" | wc -l | tr -d ' '; }

echo "rilis pertama"
bash "$DEPLOY" > /dev/null
R1=$(readlink "$SUNDY_ROOT/current")
periksa "current menunjuk folder di releases/" '[ -d "$R1" ] && [ "$(dirname "$R1")" = "$SUNDY_ROOT/releases" ]'
periksa ".env rilis adalah link ke shared/.env" '[ "$(readlink "$R1/.env")" = "$SUNDY_ROOT/shared/.env" ]'
periksa "public disalin ke server mandiri" '[ -f "$R1/.next/standalone/public/logo.png" ]'
periksa "aset statis disalin ke server mandiri" '[ -f "$R1/.next/standalone/.next/static/chunks/app.js" ]'
periksa "node_modules dipertahankan (untuk skrip admin)" '[ -d "$R1/node_modules" ]'
periksa "migrasi database dijalankan" 'grep -q "npx prisma migrate deploy" "$LOG"'
periksa "PM2 dimulai dari ecosystem.config.cjs" 'grep -q "pm2 start .*ecosystem.config.cjs" "$LOG"'

echo "rilis yang gagal tidak mengubah versi aktif"
if GAGAL_BUILD=1 bash "$DEPLOY" > /dev/null 2>&1; then status=0; else status=1; fi
periksa "deploy.sh keluar dengan galat" '[ "$status" = 1 ]'
periksa "current tetap rilis pertama" '[ "$(readlink "$SUNDY_ROOT/current")" = "$R1" ]'
periksa "folder rilis gagal dibersihkan" '[ "$(jumlah_rilis)" = 1 ]'

echo "hanya 3 rilis disimpan"
for _ in 2 3 4; do bash "$DEPLOY" > /dev/null; done
periksa "tersisa 3 folder rilis" '[ "$(jumlah_rilis)" = 3 ]'
periksa "rilis pertama sudah terhapus" '[ ! -e "$R1" ]'

echo "kembali ke rilis sebelumnya"
R4=$(readlink "$SUNDY_ROOT/current")
bash "$DEPLOY" kembali > /dev/null
R3=$(readlink "$SUNDY_ROOT/current")
periksa "current pindah ke rilis yang lebih lama" '[ "$R3" != "$R4" ] && [[ "$R3" < "$R4" ]]'

echo
echo "$lulus lulus, $gagal gagal"
[ "$gagal" = 0 ]
```

Tambahkan ke `package.json` → `scripts`:

```json
"test:server": "bash tests/server/deploy.test.sh"
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test:server`
Expected: FAIL — `bash: .../scripts/server/deploy.sh: No such file or directory`.

- [ ] **Step 3: Tulis `scripts/server/deploy.sh`**

```bash
#!/usr/bin/env bash
# Rilis SunDY di VPS. Jalankan sebagai user "sundyapp":
#   sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh           # rilis main terbaru
#   sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh kembali   # kembali ke rilis sebelumnya
#
# Susunan:
#   releases/<YYYYmmdd-HHMMSS>/   kode + build (node_modules disimpan untuk skrip admin)
#   current -> releases/<aktif>   dijalankan PM2 (scripts/server/ecosystem.config.cjs)
#   shared/.env                   rahasia; di-link ke setiap rilis, tidak pernah disalin
#
# Selama build berjalan, rilis lama tetap melayani pasien. Rilis yang gagal dihapus dan
# versi aktif tidak berubah. Perhatian: migrasi database dijalankan SEBELUM rilis baru
# aktif, jadi perubahan skema harus tetap cocok dengan kode rilis sebelumnya.
# -E: trap ERR juga berlaku di dalam fungsi (dipakai untuk membersihkan rilis yang gagal).
set -Eeuo pipefail

ROOT=${SUNDY_ROOT:-/www/sundy}
REPO=${SUNDY_REPO:-https://github.com/Marchelinoraco/sundy-clinic.git}
BRANCH=${SUNDY_BRANCH:-main}
KEEP=${SUNDY_KEEP:-3}
RELEASES=$ROOT/releases
dir=""

log() { printf '[deploy] %s\n' "$*"; }

daftar_rilis() { # terlama → terbaru
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort
}

aktifkan() { # $1 = folder rilis
  ln -sfn "$1" "$ROOT/current"
  pm2 delete sundy > /dev/null 2>&1 || true
  pm2 start "$ROOT/current/scripts/server/ecosystem.config.cjs"
  pm2 save > /dev/null
}

bersihkan() { # sisakan $KEEP rilis terbaru; rilis aktif tidak pernah dihapus
  local aktif lama
  aktif=$(readlink "$ROOT/current")
  # Semua kecuali $KEEP terakhir (awk, karena `head -n -N` tidak ada di macOS tempat uji berjalan).
  daftar_rilis | awk -v k="$KEEP" '{ a[NR] = $0 } END { for (i = 1; i <= NR - k; i++) print a[i] }' | while read -r lama; do
    [ "$lama" = "$aktif" ] && continue
    log "hapus rilis lama $(basename "$lama")"
    rm -rf "$lama"
  done
}

rilis() {
  local waktu
  mkdir -p "$RELEASES"
  waktu=$(date +%Y%m%d-%H%M%S)
  while [ -e "$RELEASES/$waktu" ]; do sleep 1; waktu=$(date +%Y%m%d-%H%M%S); done
  dir=$RELEASES/$waktu
  trap 'log "GAGAL — versi aktif tidak berubah"; rm -rf "$dir"' ERR

  log "ambil $BRANCH dari $REPO → releases/$waktu"
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO" "$dir"
  ln -s "$ROOT/shared/.env" "$dir/.env"
  cd "$dir"

  log "npm ci"
  npm ci --no-audit --no-fund
  log "migrasi database"
  npx prisma migrate deploy
  log "build"
  npm run build
  # Server mandiri tidak membawa public/ dan .next/static/ — salin sendiri.
  cp -R public .next/standalone/public
  mkdir -p .next/standalone/.next
  cp -R .next/static .next/standalone/.next/static

  trap - ERR
  aktifkan "$dir"
  log "aktif: $waktu"
  bersihkan
}

kembali() {
  local aktif sebelum
  aktif=$(readlink "$ROOT/current")
  sebelum=$(daftar_rilis | awk -v a="$aktif" '$0 < a' | tail -n 1)
  if [ -z "$sebelum" ]; then
    log "tidak ada rilis sebelum $(basename "$aktif")"
    exit 1
  fi
  aktifkan "$sebelum"
  log "kembali ke $(basename "$sebelum")"
}

case "${1:-rilis}" in
  rilis) rilis ;;
  kembali) kembali ;;
  *) echo "Pakai: deploy.sh [rilis|kembali]" >&2; exit 2 ;;
esac
```

```bash
chmod +x scripts/server/deploy.sh
```

- [ ] **Step 4: Jalankan — harus lulus**

Run: `npm run test:server`
Expected: `13 lulus, 0 gagal`, keluar 0. (Uji menunggu ±1 detik antarrilis karena nama folder memakai
detik.)

- [ ] **Step 5: Periksa sintaks dengan ShellCheck bila tersedia**

Run: `command -v shellcheck && shellcheck scripts/server/deploy.sh scripts/server/cek-situs.sh tests/server/deploy.test.sh`
Expected: tanpa temuan (atau lewati bila ShellCheck tidak terpasang — jangan memasangnya bila disk
Mac hampir penuh).

- [ ] **Step 6: Commit**

```bash
git add scripts/server/deploy.sh tests/server/deploy.test.sh package.json
git commit -m "feat: add release script with timestamped releases and rollback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Backup terenkripsi, uji pulih, dan penghitung baris

**Files:**
- Create: `scripts/server/backup.sh`, `scripts/server/restore-test.sh`, `scripts/server/hitung-baris.sql`, `tests/server/backup.test.sh`
- Modify: `package.json` (`test:server`)

**Interfaces:**
- Consumes: —
- Produces:
  - `backup.sh` — tanpa argumen. Membaca `HEARTBEAT_URL` dari `/root/.config/sundy-backup.env`.
    Remote rclone terenkripsi bernama **`sundy-crypt:`**. Menulis `harian/<YYYY-MM-DD>/` berisi
    `sundy.dump`, `file-pasien.tar.gz`, `konfigurasi.tar.gz`. Variabel pengganti untuk uji:
    `SUNDY_LOCK`, `SUNDY_BACKUP_ENV`, `SUNDY_REMOTE`, `SUNDY_BACKUP_DIR`, `PATIENT_FILES_DIR`,
    `SUNDY_DB`, `SUNDY_TAR_ROOT`, `SUNDY_KONFIG`.
  - `restore-test.sh [YYYY-MM-DD]` — keluar 0 dan mencetak `PULIH OK` bila berhasil.
  - `hitung-baris.sql` — keluaran `psql -At`: satu baris `<tabel>|<jumlah>` per tabel skema `public`,
    urut nama tabel.

- [ ] **Step 1: Tulis uji yang gagal — `tests/server/backup.test.sh`**

```bash
#!/usr/bin/env bash
# Uji backup.sh tanpa server: sudo, pg_dump, rclone, curl, dan flock diganti tiruan.
set -euo pipefail

SINI=$(cd "$(dirname "$0")" && pwd)
BACKUP="$SINI/../../scripts/server/backup.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

export LOG=$TMP/perintah.log
export SUNDY_LOCK=$TMP/backup.lock
export SUNDY_BACKUP_ENV=$TMP/sundy-backup.env
export SUNDY_BACKUP_DIR=$TMP/backup
export PATIENT_FILES_DIR=$TMP/www/sundy-files
export SUNDY_TAR_ROOT=$TMP
export SUNDY_KONFIG="www/sundy/shared/.env"
mkdir -p "$PATIENT_FILES_DIR" "$TMP/www/sundy/shared" "$TMP/bin"
echo "hasil BIA" > "$PATIENT_FILES_DIR/bia-contoh.pdf"
echo 'DATABASE_URL="postgresql://uji"' > "$TMP/www/sundy/shared/.env"
echo 'HEARTBEAT_URL="https://hc.contoh/ping/abc"' > "$SUNDY_BACKUP_ENV"

cat > "$TMP/bin/sudo" <<'EOF'
#!/usr/bin/env bash
# sudo -u <user> <perintah...>
shift 2; exec "$@"
EOF
cat > "$TMP/bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
if [ -n "${PG_GAGAL:-}" ]; then echo "pg_dump: koneksi gagal" >&2; exit 1; fi
echo "PGDMP isi-dump-palsu"
EOF
cat > "$TMP/bin/rclone" <<'EOF'
#!/usr/bin/env bash
echo "rclone $*" >> "$LOG"
if [ "$1" = lsf ]; then printf '%s\n' ${RCLONE_DIRS:-}; fi
EOF
printf '#!/usr/bin/env bash\necho "curl $*" >> "$LOG"\n' > "$TMP/bin/curl"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/flock"
chmod +x "$TMP/bin/"*
export PATH="$TMP/bin:$PATH"

HARI_INI=$(date +%F)
lulus=0; gagal=0
periksa() {
  if eval "$2"; then lulus=$((lulus + 1)); echo "  ✓ $1"; else gagal=$((gagal + 1)); echo "  ✗ $1"; fi
}

echo "backup berhasil"
RCLONE_DIRS="2020-01-01/ $HARI_INI/ catatan/" bash "$BACKUP" > /dev/null
D=$SUNDY_BACKUP_DIR/$HARI_INI
periksa "dump database dibuat" 'grep -q PGDMP "$D/sundy.dump"'
periksa "file pasien diarsipkan" 'tar -tzf "$D/file-pasien.tar.gz" | grep -q bia-contoh.pdf'
periksa "konfigurasi diarsipkan" 'tar -tzf "$D/konfigurasi.tar.gz" | grep -q "shared/.env"'
periksa "hanya root yang bisa membaca backup" '[ "$(ls -ld "$D" | cut -c1-10)" = "drwx------" ]'
periksa "diunggah ke remote terenkripsi" 'grep -q "rclone copy $D sundy-crypt:harian/$HARI_INI" "$LOG"'
periksa "folder > 30 hari dihapus" 'grep -q "rclone purge sundy-crypt:harian/2020-01-01" "$LOG"'
periksa "folder hari ini tidak dihapus" '! grep -q "rclone purge sundy-crypt:harian/$HARI_INI" "$LOG"'
periksa "folder bukan tanggal tidak disentuh" '! grep -q "purge sundy-crypt:harian/catatan" "$LOG"'
periksa "heartbeat sukses dikirim" 'grep -q "curl .*https://hc.contoh/ping/abc$" "$LOG"'

echo "backup gagal"
: > "$LOG"
if PG_GAGAL=1 bash "$BACKUP" > /dev/null 2>&1; then status=0; else status=1; fi
periksa "backup.sh keluar dengan galat" '[ "$status" = 1 ]'
periksa "heartbeat gagal dikirim" 'grep -q "curl .*https://hc.contoh/ping/abc/fail" "$LOG"'
periksa "tidak ada yang diunggah" '! grep -q "rclone copy" "$LOG"'

echo
echo "$lulus lulus, $gagal gagal"
[ "$gagal" = 0 ]
```

Ubah skrip `package.json`:

```json
"test:server": "bash tests/server/deploy.test.sh && bash tests/server/backup.test.sh"
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `bash tests/server/backup.test.sh`
Expected: FAIL — `scripts/server/backup.sh: No such file or directory`.

- [ ] **Step 3: Tulis `scripts/server/backup.sh`**

```bash
#!/usr/bin/env bash
# Backup harian SunDY → IDCloudHost Object Storage, TERENKRIPSI (remote rclone "sundy-crypt").
# Isi: dump PostgreSQL (format custom), folder file pasien, dan konfigurasi.
# Retensi: 7 hari lokal; 30 hari di bucket, dihitung dari NAMA folder bertanggal (bukan umur
# file — pelajaran dari Wm-2026).
# Dijalankan cron aaPanel setiap hari 02.00 WITA sebagai root:
#   /www/sundy/current/scripts/server/backup.sh
set -euo pipefail

exec 9> "${SUNDY_LOCK:-/run/sundy-backup.lock}"
flock -n 9 || { echo "Backup lain masih berjalan."; exit 1; }

KONF=${SUNDY_BACKUP_ENV:-/root/.config/sundy-backup.env} # berisi HEARTBEAT_URL
# shellcheck disable=SC1090
[ -f "$KONF" ] && . "$KONF"
REMOTE=${SUNDY_REMOTE:-sundy-crypt:}
LOKAL=${SUNDY_BACKUP_DIR:-/root/backup}
FILES=${PATIENT_FILES_DIR:-/www/sundy-files}
DB=${SUNDY_DB:-sundy}
TAR_ROOT=${SUNDY_TAR_ROOT:-/}
KONFIG=${SUNDY_KONFIG:-"www/sundy/shared/.env www/server/panel/vhost/nginx www/server/panel/vhost/rewrite"}
TGL=$(date +%F)
BATAS=$(date -d '30 days ago' +%F 2> /dev/null || date -v-30d +%F)
DIR=$LOKAL/$TGL

lapor() { # $1 = "" (sukses) atau "/fail"
  if [ -n "${HEARTBEAT_URL:-}" ]; then curl -fsS -m 10 --retry 3 "${HEARTBEAT_URL}$1" > /dev/null || true; fi
}
trap 'lapor /fail' ERR

umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"

sudo -u postgres pg_dump -Fc "$DB" > "$DIR/$DB.dump"
tar -czf "$DIR/file-pasien.tar.gz" -C "$(dirname "$FILES")" "$(basename "$FILES")"
# shellcheck disable=SC2086 # KONFIG sengaja dipecah menjadi beberapa jalur
tar -czf "$DIR/konfigurasi.tar.gz" -C "$TAR_ROOT" $KONFIG

find "$LOKAL" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

rclone copy "$DIR" "${REMOTE}harian/$TGL"

for D in $(rclone lsf --dirs-only "${REMOTE}harian" 2> /dev/null); do
  D=${D%/}
  if [[ $D =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && $D < $BATAS ]]; then
    rclone purge "${REMOTE}harian/$D"
  fi
done

lapor ""
echo "Backup $TGL selesai: $(ls "$DIR" | tr '\n' ' ')($(du -sh "$DIR" | cut -f1))"
```

```bash
chmod +x scripts/server/backup.sh
```

- [ ] **Step 4: Jalankan — harus lulus**

Run: `bash tests/server/backup.test.sh`
Expected: `12 lulus, 0 gagal`.

- [ ] **Step 5: Tulis `scripts/server/hitung-baris.sql`**

```sql
-- Jumlah baris setiap tabel di skema public, satu baris per tabel: "<tabel>|<jumlah>".
-- Dipakai untuk mencocokkan Neon vs VPS saat perpindahan dan saat uji pemulihan:
--   psql "$URL" -At -f scripts/server/hitung-baris.sql
SELECT table_name || '|' ||
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

- [ ] **Step 6: Uji `hitung-baris.sql` terhadap branch test Neon**

```bash
set -a; . ./.env; set +a
psql "$TEST_DATABASE_URL_UNPOOLED" -At -f scripts/server/hitung-baris.sql | head
```

Expected: baris seperti `Appointment|0`, `Branch|2`, … — satu per tabel, termasuk
`_prisma_migrations`. (Bila `psql` belum ada di Mac, lewati langkah ini; skrip diuji di server pada
Task 9 Step 6.)

- [ ] **Step 7: Tulis `scripts/server/restore-test.sh`**

```bash
#!/usr/bin/env bash
# Uji pemulihan (sekali setelah pemasangan, lalu bulanan). Jalankan sebagai root:
#   /www/sundy/current/scripts/server/restore-test.sh [YYYY-MM-DD]   # bawaan: backup terbaru
# Mengunduh backup terenkripsi, memulihkannya ke database sementara, memeriksa arsip file,
# lalu menampilkan jumlah baris per tabel berdampingan dengan database aktif. Selisih kecil
# wajar (data sejak jam backup); tabel yang hilang atau kosong mendadak tidak wajar.
set -euo pipefail

REMOTE=${SUNDY_REMOTE:-sundy-crypt:}
DB=${SUNDY_DB:-sundy}
UJI=${DB}_uji_pulih
SQL=$(cd "$(dirname "$0")" && pwd)/hitung-baris.sql
TGL=${1:-$(rclone lsf --dirs-only "${REMOTE}harian" | sed 's#/$##' | sort | tail -n 1)}
KERJA=$(mktemp -d)
trap 'rm -rf "$KERJA"; sudo -u postgres dropdb --if-exists "$UJI"' EXIT

echo "Mengunduh backup $TGL…"
rclone copy "${REMOTE}harian/$TGL" "$KERJA"
tar -tzf "$KERJA/file-pasien.tar.gz" > /dev/null
tar -tzf "$KERJA/konfigurasi.tar.gz" > /dev/null
chmod 755 "$KERJA" && chmod 644 "$KERJA/$DB.dump" # agar user postgres bisa membaca

sudo -u postgres dropdb --if-exists "$UJI"
sudo -u postgres createdb "$UJI"
sudo -u postgres pg_restore --no-owner --no-acl --exit-on-error --dbname "$UJI" "$KERJA/$DB.dump"

echo "tabel|pulih|aktif"
join -t '|' -a1 -a2 -e '-' -o 0,1.2,2.2 \
  <(sudo -u postgres psql -At -d "$UJI" -f "$SQL") \
  <(sudo -u postgres psql -At -d "$DB" -f "$SQL")

jumlah_pulih=$(sudo -u postgres psql -At -d "$UJI" -f "$SQL" | wc -l)
jumlah_aktif=$(sudo -u postgres psql -At -d "$DB" -f "$SQL" | wc -l)
if [ "$jumlah_pulih" -ne "$jumlah_aktif" ]; then
  echo "GAGAL: backup berisi $jumlah_pulih tabel, database aktif $jumlah_aktif." >&2
  exit 1
fi
echo "PULIH OK: backup $TGL berhasil dipulihkan ($jumlah_pulih tabel, arsip file & konfigurasi utuh)."
```

```bash
chmod +x scripts/server/restore-test.sh
bash -n scripts/server/restore-test.sh
```

Expected: `bash -n` tanpa keluaran. Uji fungsionalnya di server pada Task 11 Step 8 (butuh PostgreSQL
dan bucket sungguhan).

- [ ] **Step 8: Commit**

```bash
git add scripts/server/backup.sh scripts/server/restore-test.sh scripts/server/hitung-baris.sql tests/server/backup.test.sh package.json
git commit -m "feat: add encrypted daily backup, restore test and row counter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ganti email login staf

**Files:**
- Create: `src/server/account.ts`, `scripts/change-email.mts`, `tests/integration/account.test.ts`
- Modify: `package.json` (skrip `change-email`)

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`; `auth` dari `@/lib/auth` (hanya di uji).
- Produces: `changeLoginEmail(currentEmail: string, newEmail: string): Promise<{ userId: string; email: string }>` —
  melempar `Error` dengan pesan berisi `"tidak valid"`, `"Tidak ada akun"`, atau `"sudah dipakai"`.
  CLI: `npm run change-email -- <email-lama> <email-baru>`.

- [ ] **Step 1: Tulis uji yang gagal — `tests/integration/account.test.ts`**

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeLoginEmail } from "@/server/account";

const SANDI = "kataSandiPanjang123";

describe("ganti email login staf", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buatAkun(email: string): Promise<string> {
    const created = await auth.api.signUpEmail({ body: { email, password: SANDI, name: "Staf Uji" } });
    return created.user.id;
  }

  it("login berhasil dengan email baru dan gagal dengan email lama", async () => {
    await buatAkun("pemilik@sundyclinic.id");

    const hasil = await changeLoginEmail("pemilik@sundyclinic.id", " Pemilik@SundyClinic.com ");

    expect(hasil.email).toBe("pemilik@sundyclinic.com");
    const masuk = await auth.api.signInEmail({ body: { email: "pemilik@sundyclinic.com", password: SANDI } });
    expect(masuk.user.email).toBe("pemilik@sundyclinic.com");
    await expect(
      auth.api.signInEmail({ body: { email: "pemilik@sundyclinic.id", password: SANDI } }),
    ).rejects.toThrow();
  });

  it("menghapus semua sesi lama akun itu", async () => {
    const userId = await buatAkun("pemilik@sundyclinic.id");
    await auth.api.signInEmail({ body: { email: "pemilik@sundyclinic.id", password: SANDI } });
    expect(await prisma.session.count({ where: { userId } })).toBeGreaterThan(0);

    await changeLoginEmail("pemilik@sundyclinic.id", "pemilik@sundyclinic.com");

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it("menolak email yang sudah dipakai akun lain", async () => {
    await buatAkun("pemilik@sundyclinic.id");
    await buatAkun("dokter@sundyclinic.com");

    await expect(
      changeLoginEmail("pemilik@sundyclinic.id", "dokter@sundyclinic.com"),
    ).rejects.toThrow("sudah dipakai");
  });

  it("menolak akun yang tidak ada", async () => {
    await expect(
      changeLoginEmail("tidak-ada@sundyclinic.id", "baru@sundyclinic.com"),
    ).rejects.toThrow("Tidak ada akun");
  });

  it("menolak email baru yang tidak valid", async () => {
    await buatAkun("pemilik@sundyclinic.id");

    await expect(changeLoginEmail("pemilik@sundyclinic.id", "bukan-email")).rejects.toThrow("tidak valid");
  });
});
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/account.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/account"`.

- [ ] **Step 3: Tulis `src/server/account.ts`**

```ts
import { prisma } from "@/lib/db";

const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mengganti email login seorang staf. Dipanggil skrip admin
 * (`npm run change-email`), bukan dari halaman web — belum ada layar untuk ini.
 *
 * Better Auth menyimpan email dalam huruf kecil, jadi keduanya dinormalkan.
 * Semua sesi akun itu dihapus agar login berikutnya memakai email baru.
 */
export async function changeLoginEmail(
  currentEmail: string,
  newEmail: string,
): Promise<{ userId: string; email: string }> {
  const dari = currentEmail.trim().toLowerCase();
  const ke = newEmail.trim().toLowerCase();

  if (!FORMAT_EMAIL.test(ke)) {
    throw new Error(`Email baru tidak valid: ${newEmail}`);
  }

  const user = await prisma.user.findFirst({ where: { email: dari } });
  if (!user) {
    throw new Error(`Tidak ada akun dengan email ${currentEmail}.`);
  }

  if (ke !== dari) {
    const dipakai = await prisma.user.findFirst({ where: { email: ke } });
    if (dipakai) {
      throw new Error(`Email ${ke} sudah dipakai akun lain.`);
    }
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { email: ke } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return { userId: user.id, email: ke };
}
```

- [ ] **Step 4: Jalankan — harus lulus**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/account.test.ts`
Expected: PASS (5 uji).

- [ ] **Step 5: Tulis `scripts/change-email.mts` dan skrip npm**

```ts
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { changeLoginEmail } from "../src/server/account";

const [lama, baru] = process.argv.slice(2);

if (!lama || !baru) {
  console.error("Pakai: npm run change-email -- <email-lama> <email-baru>");
  process.exit(1);
}

try {
  const { email } = await changeLoginEmail(lama, baru);
  console.log(`Email login ${lama} sudah diganti menjadi ${email}. Semua sesi login lama dihapus.`);
} catch (galat) {
  console.error(galat instanceof Error ? galat.message : galat);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
```

`package.json` → `scripts`:

```json
"change-email": "tsx scripts/change-email.mts"
```

- [ ] **Step 6: Jalankan seluruh uji integrasi dan pemeriksaan tipe**

```bash
npm run test:integration
npx tsc --noEmit
npm run lint
```

Expected: semua hijau.

- [ ] **Step 7: Commit**

```bash
git add src/server/account.ts scripts/change-email.mts tests/integration/account.test.ts package.json
git commit -m "feat: add a script to change a staff member's login email

The clinic's staff logins move to @sundyclinic.com addresses, and there is no
screen for editing a login email yet. Old sessions are dropped so the next
login uses the new address.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Konfigurasi Nginx situs, IP asli pengunjung, dan halaman pemeliharaan

**Files:**
- Create: `scripts/server/nginx/sundyclinic.com.conf`, `scripts/server/nginx/cloudflare-realip.sh`, `scripts/server/pemeliharaan.html`

**Interfaces:**
- Consumes: aplikasi di `127.0.0.1:3000` (Task 2).
- Produces: aturan situs yang dipasang sebagai *URL rewrite* aaPanel
  (`/www/server/panel/vhost/rewrite/sundyclinic.com.conf`); mode pemeliharaan aktif selama berkas
  `/www/sundy/maintenance.on` ada; halaman `/www/sundy/shared/pemeliharaan.html`;
  `cloudflare-realip.sh <berkas-keluaran>` menulis `set_real_ip_from` dari daftar resmi Cloudflare.

- [ ] **Step 1: Tulis `scripts/server/nginx/sundyclinic.com.conf`**

```nginx
# Aturan situs sundyclinic.com — dipasang sebagai "URL rewrite" situs di aaPanel
# (/www/server/panel/vhost/rewrite/sundyclinic.com.conf). Aplikasi Next.js
# berjalan di 127.0.0.1:3000 (PM2, user "sundyapp").

# www → domain utama
if ($host = www.sundyclinic.com) { return 301 https://sundyclinic.com$request_uri; }

client_max_body_size 20m; # unggahan hasil BIA/scan rekam medis nanti

error_page 503 /pemeliharaan.html;
location = /pemeliharaan.html {
    root /www/sundy/shared;
    internal;
}

location / {
    # Mode pemeliharaan (perpindahan database): aktif selama berkas ini ada.
    if (-f /www/sundy/maintenance.on) { return 503; }

    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
}
```

- [ ] **Step 2: Tulis `scripts/server/nginx/cloudflare-realip.sh`**

```bash
#!/usr/bin/env bash
# Menulis konfigurasi Nginx agar $remote_addr = IP asli pengunjung di balik proxy Cloudflare.
# Daftar IP diambil dari sumber resmi Cloudflare setiap kali dijalankan.
# Pakai (root): cloudflare-realip.sh /www/server/panel/vhost/nginx/0.cloudflare-realip.conf
set -euo pipefail
KELUAR=${1:?Pakai: cloudflare-realip.sh <berkas-keluaran>}
SEMENTARA=$(mktemp)
{
  echo "# Dibuat oleh scripts/server/nginx/cloudflare-realip.sh pada $(date +%F) — jangan diubah manual."
  for daftar in ips-v4 ips-v6; do
    curl -fsS -m 20 "https://www.cloudflare.com/$daftar" | while read -r net; do
      [ -n "$net" ] && echo "set_real_ip_from $net;"
    done
  done
  echo "real_ip_header CF-Connecting-IP;"
} > "$SEMENTARA"
grep -q '^set_real_ip_from ' "$SEMENTARA" || { echo "Daftar IP Cloudflare kosong — dibatalkan." >&2; exit 1; }
install -m 644 "$SEMENTARA" "$KELUAR"
rm -f "$SEMENTARA"
echo "Ditulis: $KELUAR ($(grep -c '^set_real_ip_from' "$KELUAR") jaringan)"
```

```bash
chmod +x scripts/server/nginx/cloudflare-realip.sh
bash scripts/server/nginx/cloudflare-realip.sh /tmp/uji-realip.conf && head -3 /tmp/uji-realip.conf && rm /tmp/uji-realip.conf
```

Expected: `Ditulis: /tmp/uji-realip.conf (NN jaringan)` dengan NN ≈ 20, lalu baris
`set_real_ip_from 173.245.48.0/20;` (atau jaringan pertama yang berlaku saat itu).

- [ ] **Step 3: Tulis `scripts/server/pemeliharaan.html`**

```html
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SunDY Clinic — Sedang dalam pemeliharaan</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
           font: 16px/1.6 system-ui, sans-serif; background: #faf7f2; color: #2b2b2b; }
    main { max-width: 440px; text-align: center; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    a { color: #8a5a3b; }
  </style>
</head>
<body>
  <main>
    <h1>Sebentar, kami sedang memperbarui sistem</h1>
    <p>Situs SunDY Clinic akan kembali dalam beberapa menit. Untuk booking atau pertanyaan,
       hubungi kami lewat WhatsApp
       <a href="https://wa.me/6285172228900">0851-7222-8900</a>.</p>
  </main>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add scripts/server/nginx scripts/server/pemeliharaan.html
git commit -m "feat: add Nginx site rules, Cloudflare real-IP generator and maintenance page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Dorong branch dan buka PR draf**

```bash
git push -u origin migrasi-vps-sundy
gh pr create --draft --base main --title "Pindah ke VPS sundy (sundyclinic.com)" --body "$(cat <<'EOF'
Plan 0 — docs/superpowers/plans/2026-09-26-plan-0-migrasi-vps-sundy.md
Spec — docs/superpowers/specs/2026-09-26-migrasi-vps-sundy-design.md

**Jangan di-merge sebelum perpindahan final (Task 12).** Merge ke main memicu Vercel; pada malam
perpindahan PR ini juga membawa vercel.json yang mengalihkan sundy-clinic.vercel.app ke sundyclinic.com.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: URL PR draf. Laporkan ke pemilik.

---

### Task 7: Persiapan pemilik — VPS, nama & proteksi, Cloudflare, nameserver

**Pelaksana:** pemilik (UI). Claude memandu dan memverifikasi. Boleh dikerjakan bersamaan dengan
Task 1–6.

- [x] **Step 1: Install ulang VPS sundy** — console IDCloudHost → **pastikan yang dipilih VPS
  sundy (2 vCPU / 2 GB / 20 GB, AlmaLinux), BUKAN Wm-2026** → Reinstall/Rebuild → **Ubuntu 24.04**.
  Catat username dan IP yang ditampilkan. Kata sandi awal cukup diketik di Terminal Mac nanti — jangan
  dikirim ke chat.
- [ ] **Step 2: Nama & proteksi** — ganti nama VPS menjadi **SUNDY-PRODUKSI**; aktifkan
  *delete/rebuild protection* bila ada; aktifkan backup mingguan VM (menu Backups).
- [x] **Step 3: Cloudflare** — akun yang sama dengan welcomemanado.com → *Add a domain* →
  `sundyclinic.com` → paket Free → lewati impor record → catat **dua nameserver** yang diberikan.
- [x] **Step 4: Jetorbit** — Domain `sundyclinic.com` → Nameserver → ganti `ns1–3.jetorbit.net`
  dengan dua nameserver Cloudflare → simpan.
- [x] **Step 5: Verifikasi (Claude)**

```bash
dig +short NS sundyclinic.com @1.1.1.1
```

Expected: dua nameserver `*.ns.cloudflare.com` (bisa perlu hingga beberapa jam; lanjutkan task lain
sambil menunggu). Cloudflare mengirim email "sundyclinic.com is now active" kepada pemilik.

---

### Task 8: Server dasar, aaPanel, PostgreSQL 18, Node 22, user & database

**Pelaksana:** Claude lewat SSH (setiap perintah disetujui); pemilik untuk langkah bertanda *(pemilik)*.
Semua perintah server dijalankan dari Mac dengan `ssh sundy 'sudo bash -s' <<'EOF' … EOF`.

**Interfaces:**
- Produces: alias SSH `sundy`; user sistem **`sundyapp`** (PM2 berjalan sebagai user ini; tanpa hak sudo); folder
  `/www/sundy/{releases,shared}` dan `/www/sundy-files`; database **`sundy`** milik role **`sundy`**
  di PostgreSQL 18; `/www/sundy/shared/.env` (600, `sundyapp`) berisi `DATABASE_URL`,
  `DATABASE_URL_UNPOOLED`, `NEXT_PUBLIC_SITE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `PATIENT_FILES_DIR`.

- [x] **Step 1: Kunci SSH khusus (Claude, di Mac)**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/sundy_ed25519 -N "" -C "claude-sundy"
cat >> ~/.ssh/config <<'EOF'

Host sundy
  HostName <IP-VPS>
  User <username-VPS>
  IdentityFile ~/.ssh/sundy_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
EOF
```

*(pemilik)* di Terminal Mac: `ssh-copy-id -o PubkeyAuthentication=no -i ~/.ssh/sundy_ed25519.pub <username-VPS>@<IP-VPS>`
lalu ketik kata sandi VPS. Verifikasi (Claude): `ssh -o BatchMode=yes sundy 'whoami; sudo -n true && echo sudo-OK'`.

- [x] **Step 2: Dasar sistem (Claude)**

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get -y -qq -o Dpkg::Options::=--force-confold upgrade
timedatectl set-timezone Asia/Makassar
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
apt-get install -y -qq ufw fail2ban unattended-upgrades
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
systemctl enable --now fail2ban
timedatectl | grep "Time zone"; free -h | grep Swap; ufw status | head -8
EOF
```

Expected: `Asia/Makassar`, Swap `2.0Gi`, ufw aktif dengan 22/80/443. Bila koneksi SSH putus
("Broken pipe") karena `sshd` dimulai ulang saat upgrade, sambung lagi dan periksa
`sudo dpkg --audit` (harus kosong) — ini terjadi juga di Wm-2026 dan tidak berbahaya.

- [x] **Step 3: Matikan login SSH dengan kata sandi (Claude)** — hanya setelah Step 1 terbukti bisa
  login dengan kunci.

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
# 00-: sshd memakai nilai yang dibaca PERTAMA; 50-cloud-init.conf berisi PasswordAuthentication yes.
cat > /etc/ssh/sshd_config.d/00-sundy.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sshd -t && systemctl reload ssh
EOF
ssh -o BatchMode=yes sundy 'echo kunci-masih-bisa'
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password -o BatchMode=yes <username-VPS>@<IP-VPS> true; echo "exit=$?"
```

Expected: `kunci-masih-bisa`, lalu `Permission denied (publickey)` dan `exit=255`.
Bila pesan masih `Permission denied (publickey,password)`, ada berkas lain di `sshd_config.d` yang
terbaca lebih dulu — periksa dengan `sshd -T | grep passwordauthentication` (terjadi 26 Sep 2026).

- [ ] **Step 4: Pasang aaPanel (Claude memulai, pemilik memilih paket)**

Salin perintah instalasi **Ubuntu** yang berlaku dari situs resmi aaPanel (aapanel.com → Install),
jalankan di latar belakang dan pantau lognya:

```bash
ssh sundy 'sudo bash -c "cd /root && wget -qO install.sh <URL-installer-dari-aapanel.com> && nohup bash install.sh aapanel -y > /root/aapanel-install.log 2>&1 &"'
ssh sundy 'sudo tail -5 /root/aapanel-install.log'
```

Setelah selesai (±15 menit), Claude membaca alamat panel, user, dan kata sandi dari log **ke berkas di
scratchpad Mac (izin 600)** — bukan ke chat — dan memberi tahu lokasinya.
*(pemilik)* Masuk ke panel → pada tawaran paket, **hanya pilih Nginx** (hapus centang MySQL, PHP,
Pure-FTPd, phpMyAdmin) → pasang.

- [ ] **Step 5: Kunci panel (pemilik + Claude)**

Keputusan pemilik 26 Sep 2026: **panel ditutup dari internet** dan dibuka lewat terowongan SSH (IP
pemilik berubah-ubah, jadi *Authorized IP* tidak bisa dipakai). *Security entrance* bawaan installer
tetap aktif; simpan user & kata sandi panel di pengelola kata sandi.
(Claude) tutup port panel yang dibuka installer dan buat alias terowongan di Mac:

```bash
ssh sundy 'sudo ufw delete allow <PORT-PANEL>/tcp; sudo ufw status'
cat >> ~/.ssh/config <<'CONF'

Host sundy-panel
  HostName <IP-VPS>
  User sundy
  IdentityFile ~/.ssh/sundy_ed25519
  IdentitiesOnly yes
  LocalForward <PORT-PANEL> 127.0.0.1:<PORT-PANEL>
  ServerAliveInterval 30
CONF
```

Pemakaian (pemilik): `ssh -N sundy-panel` di Terminal (biarkan terbuka), lalu buka
`https://localhost:<PORT-PANEL>/<security-entrance>` di browser. Bukti port tertutup: permintaan
`curl -sk -m 8 https://<IP-VPS>:<PORT-PANEL>/` tidak dijawab dan log server mencatat `UFW BLOCK … DPT=<PORT-PANEL>`
(`nc -z` dari jaringan seluler pemilik selalu tampak "terbuka" — jangan dipakai).

- [ ] **Step 6: PostgreSQL 18 dari PGDG (Claude)**

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq postgresql-common
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get install -y -qq postgresql-18
sudo -u postgres psql -Atc "show server_version"
sudo -u postgres psql -Atc "show listen_addresses"
sudo -u postgres psql -Atc "select name from pg_available_extensions where name = 'btree_gist'"
EOF
```

Expected: `18.x`, `localhost`, `btree_gist`.

- [ ] **Step 7: Node.js 22 + PM2 (Claude)**

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs git
npm install -g pm2@latest --no-audit --no-fund
node -v; pm2 -v
EOF
```

Expected: `v22.x` dengan x ≥ 20.

- [ ] **Step 8: User, folder, database, dan `.env` bersama (Claude)** — rahasia dibuat di server dan
  langsung ditulis ke berkas; tidak ada yang tercetak.

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
id sundyapp >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/sundyapp --shell /bin/bash sundyapp
# Grup www: Nginx perlu masuk ke /www/sundy (maintenance.on) dan membaca shared/pemeliharaan.html &
# gladi.htpasswd. .env tetap 600 milik sundyapp, jadi Nginx tidak bisa membacanya.
install -d -o sundyapp -g www -m 750 /www/sundy /www/sundy/shared
install -d -o sundyapp -g sundyapp -m 750 /www/sundy/releases
install -d -o sundyapp -g sundyapp -m 700 /www/sundy-files
PW=$(openssl rand -hex 24)
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
CREATE ROLE sundy LOGIN PASSWORD '$PW';
CREATE DATABASE sundy OWNER sundy;
SQL
AUTH=$(openssl rand -base64 32)
umask 077
cat > /www/sundy/shared/.env <<ENV
DATABASE_URL="postgresql://sundy:$PW@127.0.0.1:5432/sundy"
DATABASE_URL_UNPOOLED="postgresql://sundy:$PW@127.0.0.1:5432/sundy"
NEXT_PUBLIC_SITE_URL="https://sundyclinic.com"
BETTER_AUTH_SECRET="$AUTH"
BETTER_AUTH_URL="https://sundyclinic.com"
PATIENT_FILES_DIR="/www/sundy-files"
ENV
chown sundyapp:sundyapp /www/sundy/shared/.env && chmod 600 /www/sundy/shared/.env
env PATH="$PATH" pm2 startup systemd -u sundyapp --hp /home/sundyapp | tail -1
ls -la /www/sundy/shared/.env; sudo -u postgres psql -Atc "select datname, pg_get_userbyid(datdba) from pg_database where datname='sundy'"
EOF
```

Expected: `.env` `-rw------- sundyapp sundyapp`; `sundy|sundy`; PM2 startup terdaftar di systemd.

---

### Task 9: Gladi — pulihkan data Neon di VPS, rilis pertama, situs Nginx

**Pelaksana:** Claude (SSH); pemilik membuat situs di aaPanel.

**Interfaces:**
- Consumes: Task 1–6 (branch `migrasi-vps-sundy` sudah di-push), Task 8.
- Produces: aplikasi berjalan di VPS dari branch `migrasi-vps-sundy` dengan salinan data Neon; situs
  aaPanel `sundyclinic.com` + `www` yang mem-proxy ke aplikasi, sementara **dilindungi kata sandi gladi**
  (HTTP basic auth, user `gladi`; kata sandinya di `/root/gladi-sandi.txt`).

- [ ] **Step 1: Kirim URL Neon produksi ke server tanpa menampilkannya (Claude, di Mac)**

```bash
cd ~/Documents/2026/sundy-clinik
grep '^DATABASE_URL_UNPOOLED=' .env | sed 's/^DATABASE_URL_UNPOOLED=/NEON_URL=/' \
  | ssh sundy 'sudo sh -c "umask 077; mkdir -p /root/pindah; cat > /root/pindah/neon.env"'
ssh sundy 'sudo sh -c ". /root/pindah/neon.env; test -n \"\$NEON_URL\" && echo NEON_URL-terisi"'
```

- [ ] **Step 2: Dump Neon dengan klien PostgreSQL 18 (Claude)**

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
. /root/pindah/neon.env
pg_dump -Fc --no-owner --no-acl "$NEON_URL" -f /root/pindah/neon-gladi.dump
ls -lh /root/pindah/neon-gladi.dump
EOF
```

Expected: berkas dump beberapa ratus KB–MB, tanpa galat versi.

- [ ] **Step 3: Pulihkan ke database `sundy` (Claude)**

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
set -a; . /www/sundy/shared/.env; set +a
pg_restore --no-owner --no-acl --exit-on-error -d "$DATABASE_URL" /root/pindah/neon-gladi.dump
psql "$DATABASE_URL" -Atc "select extname from pg_extension where extname='btree_gist'"
EOF
```

Expected: `btree_gist`. Bila `pg_restore` gagal:
- **`CREATE EXTENSION btree_gist` ditolak** (hak akses): kosongkan database
  (`sudo -u postgres dropdb sundy && sudo -u postgres createdb -O sundy sundy`), jalankan
  `sudo -u postgres psql -d sundy -c 'CREATE EXTENSION btree_gist'`, lalu ulangi Step 3.
- **Ekstensi khusus Neon** (bukan `btree_gist`/`plpgsql`) tidak tersedia: lihat daftarnya dengan
  `pg_restore -l /root/pindah/neon-gladi.dump | grep EXTENSION`, buat daftar tanpa baris ekstensi itu
  (`pg_restore -l … | grep -v '<nama-ekstensi>' > /root/pindah/daftar.txt`), kosongkan database seperti
  di atas, lalu pulihkan dengan `pg_restore -L /root/pindah/daftar.txt --no-owner --no-acl --exit-on-error -d "$DATABASE_URL" …`.
  Pakai daftar yang sama di Task 12 Step 4.

- [ ] **Step 4: Cocokkan jumlah baris Neon vs VPS (Claude)**

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
. /root/pindah/neon.env
set -a; . /www/sundy/shared/.env; set +a
curl -fsSL https://raw.githubusercontent.com/Marchelinoraco/sundy-clinic/migrasi-vps-sundy/scripts/server/hitung-baris.sql -o /root/pindah/hitung-baris.sql
psql "$NEON_URL" -At -f /root/pindah/hitung-baris.sql > /root/pindah/neon.txt
psql "$DATABASE_URL" -At -f /root/pindah/hitung-baris.sql > /root/pindah/vps.txt
diff /root/pindah/neon.txt /root/pindah/vps.txt && echo "IDENTIK: $(wc -l < /root/pindah/vps.txt) tabel"
EOF
```

Expected: `IDENTIK: NN tabel`.

- [ ] **Step 5: Rilis pertama dari branch kerja (Claude)**

```bash
ssh sundy 'sudo -u sundyapp -H bash -s' <<'EOF'
set -e
rm -rf /tmp/sundy-awal
git clone --quiet --depth 1 --branch migrasi-vps-sundy https://github.com/Marchelinoraco/sundy-clinic.git /tmp/sundy-awal
SUNDY_BRANCH=migrasi-vps-sundy bash /tmp/sundy-awal/scripts/server/deploy.sh
rm -rf /tmp/sundy-awal
# Rotasi log PM2 agar tidak memenuhi disk 20 GB (spec 4.8).
pm2 install pm2-logrotate > /dev/null
pm2 set pm2-logrotate:max_size 10M > /dev/null && pm2 set pm2-logrotate:retain 7 > /dev/null
pm2 status
curl -s -o /dev/null -w "aplikasi lokal: %{http_code}\n" http://127.0.0.1:3000/
EOF
```

Expected: `[deploy] aktif: <waktu>`, PM2 `online`, `aplikasi lokal: 200`. `prisma migrate deploy`
harus melaporkan *No pending migrations* (riwayat migrasi ikut dari Neon). Bila halaman gagal dengan
`Cannot find module '.prisma/client…'`, tambahkan ke `next.config.ts`
`outputFileTracingIncludes: { "/*": ["./node_modules/.prisma/client/**/*"] }`, commit + push ke
`migrasi-vps-sundy`, lalu jalankan `deploy.sh` lagi (kali ini dari `/www/sundy/current/scripts/server/`).

- [ ] **Step 6: Situs Nginx (pemilik + Claude)**

*(pemilik)* aaPanel → Website → Add site: domain `sundyclinic.com` dan `www.sundyclinic.com` (dua
baris), PHP version **Static**, tanpa database/FTP.
(Claude) pasang aturan dari repo, IP asli Cloudflare, halaman pemeliharaan, dan batasan gladi; lalu
hapus dua blok cache statis aaPanel yang akan membelokkan `/_next/static/*.js` dan gambar ke disk
alih-alih ke aplikasi. Batasan gladi berupa **kata sandi (HTTP basic auth)** — bukan per-IP, karena
IP pemilik berubah-ubah — dan ditaruh **di dalam `location /`**, sehingga validasi Let's Encrypt
(`/.well-known/`, ditangani blok aaPanel sendiri) tetap bisa masuk. Kata sandinya dibuat di server:

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
V=/www/server/panel/vhost; NGX=/www/server/nginx/sbin/nginx; C=/www/sundy/current/scripts/server
# vhost dan rewrite sama-sama bernama sundyclinic.com.conf — backup ke subfolder terpisah.
BK=/root/backup-vhost-$(date +%Y%m%d-%H%M%S); mkdir -p "$BK/nginx" "$BK/rewrite"
cp -a $V/nginx/sundyclinic.com.conf "$BK/nginx/"; cp -a $V/rewrite/sundyclinic.com.conf "$BK/rewrite/"
$NGX -V 2>&1 | grep -q http_realip_module || { echo "Nginx tanpa realip_module"; exit 1; }
bash $C/nginx/cloudflare-realip.sh $V/nginx/0.cloudflare-realip.conf
install -o sundyapp -g sundyapp -m 644 $C/pemeliharaan.html /www/sundy/shared/pemeliharaan.html
umask 077; openssl rand -hex 12 > /root/gladi-sandi.txt
printf 'gladi:%s\n' "$(openssl passwd -apr1 "$(cat /root/gladi-sandi.txt)")" > /www/sundy/shared/gladi.htpasswd
chown root:www /www/sundy/shared/gladi.htpasswd && chmod 640 /www/sundy/shared/gladi.htpasswd
sed "s#^location / {#location / {\n    auth_basic \"Gladi SunDY\"; auth_basic_user_file /www/sundy/shared/gladi.htpasswd; \# GLADI — dihapus di Task 12#" \
  $C/nginx/sundyclinic.com.conf > $V/rewrite/sundyclinic.com.conf
grep -q "auth_basic_user_file" $V/rewrite/sundyclinic.com.conf
python3 - <<'PY'
import re
p = '/www/server/panel/vhost/nginx/sundyclinic.com.conf'
c = open(p).read()
n = 0
for pat in (r'\n\s*location ~ \.\*\\\.\(gif\|jpg\|jpeg\|png\|bmp\|swf\)\$\s*\{[^}]*\}',
            r'\n\s*location ~ \.\*\\\.\(js\|css\)\?\$\s*\{[^}]*\}'):
    c, k = re.subn(pat, '', c); n += k
open(p, 'w').write(c)
print('blok cache statis aaPanel dihapus:', n)
PY
$NGX -t && $NGX -s reload && echo "nginx reload OK"
EOF
```

Expected: `blok cache statis aaPanel dihapus: 2`, `nginx reload OK`. Bila `nginx -t` gagal, kembalikan
`$BK/nginx/…` dan `$BK/rewrite/…` ke tempatnya dan reload.

- [ ] **Step 7: Periksa situs lewat IP (Claude, di Mac)**

```bash
GLADI=$(ssh sundy 'sudo cat /root/gladi-sandi.txt')   # kata sandi gladi, tidak dicetak
bash scripts/server/cek-situs.sh http://sundyclinic.com --resolve sundyclinic.com:80:<IP-VPS> -u "gladi:$GLADI"
```

Expected: semua `✓`. Tanpa `-u` semua halaman menjawab `401` — itu batasan gladi.

- [ ] **Step 8: Uji rilis ulang & kembali di server (Claude)** — spec bagian 6 "Rilis & kembali".

```bash
GLADI=$(ssh sundy 'sudo cat /root/gladi-sandi.txt')
ssh sundy 'sudo -u sundyapp -H SUNDY_BRANCH=migrasi-vps-sundy /www/sundy/current/scripts/server/deploy.sh'
bash scripts/server/cek-situs.sh http://sundyclinic.com --resolve sundyclinic.com:80:<IP-VPS> -u "gladi:$GLADI"
ssh sundy 'sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh kembali && ls -1 /www/sundy/releases && readlink /www/sundy/current'
bash scripts/server/cek-situs.sh http://sundyclinic.com --resolve sundyclinic.com:80:<IP-VPS> -u "gladi:$GLADI"
ssh sundy 'sudo -u sundyapp -H SUNDY_BRANCH=migrasi-vps-sundy /www/sundy/current/scripts/server/deploy.sh'
```

Expected: setelah rilis kedua dan setelah `kembali`, `cek-situs.sh` tetap semua `✓`; `current`
menunjuk rilis pertama setelah `kembali`, lalu rilis terbaru setelah perintah terakhir.
(`sudo -u sundyapp -H VAR=… perintah` diperbolehkan karena user admin VPS punya hak `ALL`.)

---

### Task 10: DNS, SSL, Force HTTPS, dan record "domain tanpa email"

**Pelaksana:** pemilik (Cloudflare, aaPanel) + Claude (verifikasi dan Force HTTPS).

- [ ] **Step 1: Record DNS (pemilik, Cloudflare → DNS → Records)**

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `<IP-VPS>` | Proxied (oranye) |
| CNAME | `www` | `sundyclinic.com` | Proxied (oranye) |
| MX | `@` | `.` (titik), priority `0` | — |
| TXT | `@` | `v=spf1 -all` | — |
| TXT | `_dmarc` | `v=DMARC1; p=reject; adkim=s; aspf=s` | — |

Bila Cloudflare menolak MX berisi `.`, lewati baris itu (SPF + DMARC sudah mencegah pemalsuan).
Pastikan **SSL/TLS → Edge Certificates → Always Use HTTPS = Off** selama sertifikat Let's Encrypt
belum terbit (validasinya lewat HTTP).

- [ ] **Step 2: Sertifikat Let's Encrypt (pemilik, aaPanel)** — situs `sundyclinic.com` → SSL → tab
  Let's Encrypt → centang **kedua** domain → Apply.

- [ ] **Step 3: Cloudflare Full (strict) (pemilik)** — SSL/TLS → Configure → Custom SSL/TLS →
  **Full (Strict)** → Save. Harus sebelum Step 4: dengan mode *Flexible*, Force HTTPS di server
  membuat pengalihan berputar tanpa akhir.

- [ ] **Step 4: Force HTTPS (Claude)** — blok yang sama persis dengan tombol aaPanel (diverifikasi di
  Wm-2026 25 Sep 2026):

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
python3 - <<'PY'
p = '/www/server/panel/vhost/nginx/sundyclinic.com.conf'
c = open(p).read()
to = """#error_page 404/404.html;
    #HTTP_TO_HTTPS_START
    if ($server_port !~ 443){
        rewrite ^(/.*)$ https://$host$1 permanent;
    }
    #HTTP_TO_HTTPS_END"""
if 'HTTP_TO_HTTPS_START' not in c:
    assert c.count('#error_page 404/404.html;') == 1 and 'ssl_certificate' in c
    open(p, 'w').write(c.replace('#error_page 404/404.html;', to))
print('Force HTTPS terpasang')
PY
/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
openssl x509 -in /www/server/panel/vhost/cert/sundyclinic.com/fullchain.pem -noout -ext subjectAltName | tail -1
EOF
```

Expected: SAN `DNS:sundyclinic.com, DNS:www.sundyclinic.com`. Setelah ini *Always Use HTTPS* di
Cloudflare boleh dinyalakan (pemilik).

- [ ] **Step 5: Verifikasi (Claude, dari Mac)**

```bash
GLADI=$(ssh sundy 'sudo cat /root/gladi-sandi.txt')
for u in http://sundyclinic.com/ https://www.sundyclinic.com/layanan; do
  printf "%-40s → " "$u"; curl -s -o /dev/null -m 20 -w "%{http_code} %{redirect_url}\n" "$u"; done
bash scripts/server/cek-situs.sh https://sundyclinic.com -u "gladi:$GLADI"
dig +short MX sundyclinic.com; dig +short TXT sundyclinic.com; dig +short TXT _dmarc.sundyclinic.com
```

Expected: `301 https://sundyclinic.com/`, `301 https://sundyclinic.com/layanan`, semua `✓`, MX `0 .`,
SPF dan DMARC tampil. Tanpa kata sandi gladi situs menjawab **401** — itu batasan gladi yang disengaja
(pengalihan www dan http→https tetap berjalan tanpa kata sandi).

- [ ] **Step 6: Uji aplikasi oleh pemilik (browser)** — Claude membuka `/root/gladi-sandi.txt` untuk
  pemilik lewat panel (*Files*, lewat terowongan) — bukan chat. Buka `https://sundyclinic.com/masuk`,
  isi user `gladi` + kata sandi itu saat browser meminta, login sebagai Super Admin yang sekarang, buka **Jadwal**, buat satu
  booking uji lalu batalkan. Data gladi ini akan ditimpa saat perpindahan final.

- [ ] **Step 7: Uji keamanan (Claude + pemilik)** — spec bagian 6 "Keamanan".

Dari sisi server (bukan `nc` dari Mac — jaringan seluler pemilik memalsukan port "terbuka"):

```bash
ssh sundy 'sudo bash -s' <<'EOF'
echo "ufw: $(ufw status | awk 'NR>4 && $2=="ALLOW"{print $1}' | sort -u | tr '\n' ' ')"
echo "mendengarkan di semua antarmuka: $(ss -tlnH | awk '$4 !~ /^(127\.|\[::1\])/{print $4}' | sed 's/.*://' | sort -un | tr '\n' ' ')"
echo "PostgreSQL: $(sudo -u postgres psql -Atc 'show listen_addresses')"
EOF
for p in 3000 5432 <PORT-PANEL>; do printf "%s: " $p; curl -sk -m 8 -o /dev/null -w "%{http_code}\n" https://<IP-VPS>:$p/ || echo "tidak dijawab"; done
```

Expected: ufw hanya `22/tcp 80/tcp 443/tcp`; port yang mendengarkan di luar localhost hanya 22, 80, 443
(dan panel/888 yang tetap ditutup ufw); PostgreSQL `localhost`; ketiga `curl` **tidak dijawab**.

---

### Task 11: Backup terenkripsi, uji pulih, dan pemantauan

**Pelaksana:** pemilik (IDCloudHost, Healthchecks, UptimeRobot, aaPanel) + Claude (SSH).

**Interfaces:**
- Consumes: `scripts/server/backup.sh`, `restore-test.sh` (Task 4), rilis aktif (Task 9).
- Produces: remote rclone `idch-sundy:` (bucket `sundy-backup`) dan `sundy-crypt:` (terenkripsi);
  `/root/.config/sundy-backup.env` berisi `HEARTBEAT_URL`; cron harian 02.00.

- [ ] **Step 1: Storage account tersendiri (pemilik, console IDCloudHost)** — Storage → **Create new
  storage account** (bukan "Default storage account" milik Welcome Manado) bernama `SunDY` → bucket
  `sundy-backup` (Private) → access key `sundy-backup` (**tanpa** centang Read-only).

- [ ] **Step 2: Heartbeat & uptime (pemilik)**
  - healthchecks.io → daftar gratis → *Add Check* `sundy-backup`, Period **1 day**, Grace **2 hours** →
    salin **Ping URL**. Integrasi: email (dan Telegram bila mau).
  - uptimerobot.com → *New monitor* HTTP(s) `https://sundyclinic.com`, interval 5 menit, notifikasi
    email/Telegram.

- [ ] **Step 3: rclone + kata sandi enkripsi (Claude)** — kata sandi enkripsi dibuat di server; pemilik
  menyalinnya dari berkas lewat aaPanel Files, lalu berkas itu dihapus.

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
apt-get install -y -qq rclone
install -d -m 700 /root/.config /root/.config/rclone
P1=$(openssl rand -base64 24); P2=$(openssl rand -base64 24)
umask 077
cat > /root/.config/rclone/rclone.conf <<CONF
[idch-sundy]
type = s3
provider = Other
access_key_id = ISI_ACCESS_KEY
secret_access_key = ISI_SECRET_KEY
endpoint = https://is3.cloudhost.id
acl = private
no_check_bucket = true

[sundy-crypt]
type = crypt
remote = idch-sundy:sundy-backup
password = $(rclone obscure "$P1")
password2 = $(rclone obscure "$P2")
CONF
printf 'KATA SANDI ENKRIPSI BACKUP SUNDY — simpan di pengelola kata sandi, lalu hapus berkas ini.\nTanpa keduanya backup tidak bisa dibuka.\n\npassword  = %s\npassword2 = %s\n' "$P1" "$P2" > /root/KATA-SANDI-BACKUP-SUNDY.txt
echo 'HEARTBEAT_URL=""' > /root/.config/sundy-backup.env
chmod 600 /root/.config/rclone/rclone.conf /root/KATA-SANDI-BACKUP-SUNDY.txt /root/.config/sundy-backup.env
rclone version | head -1
EOF
```

- [ ] **Step 4: Isi rahasia (pemilik, aaPanel → Files)**
  1. Buka `/root/KATA-SANDI-BACKUP-SUNDY.txt` → salin kedua baris ke pengelola kata sandi **dan** satu
     tempat aman lain → beri tahu Claude "sudah disimpan".
  2. `/root/.config/rclone/rclone.conf` → ganti `ISI_ACCESS_KEY` / `ISI_SECRET_KEY` dengan kunci dari
     Step 1 → Save.
  3. `/root/.config/sundy-backup.env` → isi Ping URL: `HEARTBEAT_URL="https://hc-ping.com/…"` → Save.

- [ ] **Step 5: Hapus berkas kata sandi & uji koneksi (Claude)** — setelah pemilik konfirmasi Step 4.1.

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
shred -u /root/KATA-SANDI-BACKUP-SUNDY.txt
grep -c ISI_ /root/.config/rclone/rclone.conf | sed "s/^/placeholder tersisa: /" || true
rclone lsd idch-sundy: | grep sundy-backup
EOF
```

Expected: `placeholder tersisa: 0`, bucket `sundy-backup` tampil.

- [ ] **Step 6: Cron (pemilik, aaPanel → Cron → Add task)** — Type *Shell Script*, Name *Backup SunDY*,
  Period **Daily 2:00**, User **root**, Script: `/www/sundy/current/scripts/server/backup.sh`.

- [ ] **Step 7: Backup pertama & bukti enkripsi (Claude)**

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
/www/sundy/current/scripts/server/backup.sh
echo "--- nama terbaca (lewat sundy-crypt):"; rclone ls sundy-crypt:harian/$(date +%F)
echo "--- yang tersimpan di bucket (harus acak):"; rclone ls idch-sundy:sundy-backup | head -3
EOF
```

Expected: `sundy.dump`, `file-pasien.tar.gz`, `konfigurasi.tar.gz` di daftar pertama; nama acak di
daftar kedua. Healthchecks menandai *up*.

- [ ] **Step 8: Uji pulih (Claude)**

```bash
ssh sundy 'sudo /www/sundy/current/scripts/server/restore-test.sh'
```

Expected: tabel `pulih|aktif` dengan angka sama dan baris akhir `PULIH OK`.

- [ ] **Step 9: Uji notifikasi (Claude + pemilik)**
  - Gagal backup: `ssh sundy 'sudo SUNDY_REMOTE=tidak-ada: /www/sundy/current/scripts/server/backup.sh'; echo "exit=$?"`
    → `exit` ≠ 0; pemilik menerima email "sundy-backup is DOWN" dari Healthchecks; jalankan backup
    normal sekali lagi agar status kembali *up*.
  - Situs mati: `ssh sundy 'sudo -u sundyapp pm2 stop sundy'`, tunggu notifikasi UptimeRobot (≤ 10 menit),
    lalu `ssh sundy 'sudo -u sundyapp pm2 start sundy'`. Aman karena situs belum dipakai pasien.

---

### Task 12: Perpindahan final (malam, ≥ 19.00 WITA)

**Pelaksana:** Claude + pemilik bersama-sama, pada malam yang dipilih pemilik.

**Interfaces:**
- Consumes: semua task sebelumnya selesai; PR draf dari Task 6.
- Produces: `sundyclinic.com` melayani pasien dari VPS dengan data Neon terakhir;
  `sundy-clinic.vercel.app` mengalihkan ke `sundyclinic.com`; `main` berisi seluruh perubahan.

- [ ] **Step 1: Tambah pengalihan Vercel ke PR (Claude, di Mac)**

Isi baru `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"],
  "redirects": [
    { "source": "/:path*", "destination": "https://sundyclinic.com/:path*", "permanent": false }
  ]
}
```

```bash
git add vercel.json
git commit -m "chore: send sundy-clinic.vercel.app visitors to sundyclinic.com

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 2: Mode pemeliharaan di VPS**

```bash
ssh sundy 'sudo -u sundyapp touch /www/sundy/maintenance.on'
curl -s -o /dev/null -w "%{http_code}\n" https://sundyclinic.com/
```

Expected: `503`.

- [ ] **Step 3: Merge PR → Vercel menjadi pengalihan (pemilik menyetujui merge; Claude memeriksa)**

```bash
gh pr ready && gh pr merge --merge
# tunggu deployment Vercel "Ready", lalu:
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://sundy-clinic.vercel.app/layanan
```

Expected: `307 https://sundyclinic.com/layanan`. **Jangan lanjut** sebelum hasil ini benar — selama
Vercel masih melayani aplikasi, pasien masih bisa menulis ke Neon. Bila build Vercel gagal, periksa
log build di dashboard Vercel dan perbaiki sebelum lanjut.

- [ ] **Step 4: Dump terakhir → pulihkan → cocokkan (Claude)**

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
. /root/pindah/neon.env
sudo -u sundyapp pm2 stop sundy
pg_dump -Fc --no-owner --no-acl "$NEON_URL" -f /root/pindah/neon-final.dump
sudo -u postgres dropdb sundy
sudo -u postgres createdb -O sundy sundy
set -a; . /www/sundy/shared/.env; set +a
pg_restore --no-owner --no-acl --exit-on-error -d "$DATABASE_URL" /root/pindah/neon-final.dump
psql "$NEON_URL" -At -f /root/pindah/hitung-baris.sql > /root/pindah/neon.txt
psql "$DATABASE_URL" -At -f /root/pindah/hitung-baris.sql > /root/pindah/vps.txt
diff /root/pindah/neon.txt /root/pindah/vps.txt && echo "IDENTIK: $(wc -l < /root/pindah/vps.txt) tabel"
EOF
```

Expected: `IDENTIK: NN tabel`. (Bila `CREATE EXTENSION btree_gist` ditolak, lakukan penanganan yang
sama dengan Task 9 Step 3.)

- [ ] **Step 5: Rilis `main` (Claude)**

```bash
ssh sundy 'sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh'
```

Expected: `[deploy] aktif: <waktu>`; *No pending migrations*.

- [ ] **Step 6: Buka untuk umum (Claude)** — hapus batasan gladi dan mode pemeliharaan.

```bash
ssh sundy 'sudo bash -s' <<'EOF'
set -e
R=/www/server/panel/vhost/rewrite/sundyclinic.com.conf
cp -a "$R" /root/pindah/rewrite-gladi.conf
cp /www/sundy/current/scripts/server/nginx/sundyclinic.com.conf "$R"
rm -f /www/sundy/maintenance.on /www/sundy/shared/gladi.htpasswd /root/gladi-sandi.txt
/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
EOF
bash scripts/server/cek-situs.sh https://sundyclinic.com
```

Expected: semua `✓` tanpa kata sandi gladi. Pemilik membuka situs di ponsel — harus tampil tanpa diminta
kata sandi.

- [ ] **Step 7: Uji pemilik** — login, buka Jadwal: booking terakhir dari Vercel/Neon tampil; buat dan
  batalkan satu booking uji.

- [ ] **Step 8: Email login Super Admin (pemilik memilih alamat; Claude menjalankan)**

```bash
ssh sundy 'sudo -u sundyapp -H bash -c "cd /www/sundy/current && npm run change-email -- pemilik@sundyclinic.id <alamat-baru>@sundyclinic.com"'
```

Pemilik login ulang dengan alamat baru. Kata sandi tidak berubah.

- [ ] **Step 9: Database pengembangan di laptop (Claude)** — `.env` lokal masih menunjuk Neon produksi,
  yang kini usang. Buat branch Neon `dev` dan arahkan `.env` lokal ke sana, tanpa menampilkan URL-nya:

```bash
neon branches create --name dev --parent test
neon connection-string dev --pooled > /tmp/dev-pooled && neon connection-string dev > /tmp/dev-direct
python3 - <<'PY'
import re
p = '.env'; c = open(p).read()
pooled = open('/tmp/dev-pooled').read().strip(); direct = open('/tmp/dev-direct').read().strip()
c = re.sub(r'^DATABASE_URL=.*$', f'DATABASE_URL="{pooled}"', c, flags=re.M)
c = re.sub(r'^DATABASE_URL_UNPOOLED=.*$', f'DATABASE_URL_UNPOOLED="{direct}"', c, flags=re.M)
c = re.sub(r'^NEON_BRANCH=.*\n', '', c, flags=re.M)
open(p, 'w').write(c)
print('.env lokal → branch dev')
PY
rm -f /tmp/dev-pooled /tmp/dev-direct
npm run db:seed
```

Expected: `.env lokal → branch dev`; seed berhasil.

- [ ] **Step 10: Rencana mundur (hanya bila Step 5–7 gagal)** — di dashboard Vercel → Deployments →
  deployment sebelum pengalihan → **Promote to Production**. Situs kembali ke Vercel + Neon (Neon tidak
  menerima penulisan sejak Step 3, jadi datanya utuh). Pasang lagi `maintenance.on` di VPS, perbaiki,
  lalu ulangi dari Step 3.

---

### Task 13: Runbook server dan pembaruan dokumen

**Files:**
- Create: `docs/operasional/server-sundy.md`
- Modify: `docs/superpowers/specs/2026-09-26-migrasi-vps-sundy-design.md` (jalur skrip),
  `docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md` (bagian hosting + D6)

- [ ] **Step 1: Tulis `docs/operasional/server-sundy.md`** dengan bagian-bagian berikut, diisi nilai
  **sesungguhnya** dari Task 7–12 — tanpa kata sandi, kunci, atau alamat *security entrance*:
  1. Ringkasan: IP VPS, OS, versi PostgreSQL/Node/PM2/aaPanel, domain, akun Cloudflare yang dipakai.
  2. Akses: `ssh sundy` (kunci `~/.ssh/sundy_ed25519`); panel **tidak terbuka ke internet** — buka lewat
     `ssh -N sundy-panel` lalu `https://localhost:<port-panel>/<entrance>`; lupa kata sandi panel → `ssh sundy 'sudo bt'`.
  3. Susunan folder `/www/sundy` dan `/www/sundy-files`; letak `.env`.
  4. Rilis & kembali: perintah `deploy.sh` dan `deploy.sh kembali`; aturan migrasi dua langkah.
  5. Mode pemeliharaan: `touch` / `rm /www/sundy/maintenance.on`.
  6. Skrip admin di server: `reset-password`, `change-email` (cara menjalankan sebagai `sundyapp`).
  7. Backup: isi, jadwal, lokasi kata sandi enkripsi (pengelola kata sandi pemilik), uji pulih bulanan
     (`restore-test.sh`), heartbeat & UptimeRobot.
  8. Memulihkan server dari nol: urutan Task 8 → 9 (pakai backup, bukan Neon) → 10 → 11.
  9. Pemeriksaan cepat: `scripts/server/cek-situs.sh https://sundyclinic.com`.

- [ ] **Step 2: Perbarui spec** — ganti `scripts/deploy.sh` menjadi `scripts/server/deploy.sh` di
  bagian 4.4 dan 4.6; tambahkan di bawah tabel keputusan: "Pelaksanaan: PostgreSQL 18 dari PGDG,
  Node.js 22 dari NodeSource + PM2 (lihat Plan 0)".

- [ ] **Step 3: Perbarui PRD** — bagian hosting: Vercel + Neon → VPS sundy (rujuk spec migrasi); D6 →
  "Selesai: `sundyclinic.com` (Jetorbit, DNS Cloudflare); email `@sundyclinic.com` hanya untuk login";
  naikkan versi PRD dan tambahkan baris "Perubahan dari versi 1.5".

- [ ] **Step 4: Commit & PR**

```bash
git switch main && git pull
git switch -c dokumen-server-sundy
git add docs/operasional/server-sundy.md docs/superpowers/specs/2026-09-26-migrasi-vps-sundy-design.md docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md
git commit -m "docs: add sundy server runbook and record the move in the PRD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin dokumen-server-sundy
gh pr create --base main --title "Runbook server sundy" --body "Runbook server & pembaruan PRD setelah pindah ke VPS.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

### Task 14: Tujuh hari kemudian — hapus Vercel dan data produksi Neon

**Pelaksana:** pemilik (dashboard Vercel/Neon) + Claude. **Syarat:** Task 11 Step 8 dan satu uji pulih
lagi pada hari ini lulus, dan situs berjalan normal selama tujuh hari.

- [ ] **Step 1: Uji pulih ulang (Claude)** — `ssh sundy 'sudo /www/sundy/current/scripts/server/restore-test.sh'` → `PULIH OK`.
- [ ] **Step 2: Hapus branch `production` Neon (pemilik, dashboard Neon)** — Branches → `production` →
  Delete. Branch `test` dan `dev` **tetap**. Konfirmasi ke Claude.
- [ ] **Step 3: Hapus proyek Vercel (pemilik, dashboard Vercel)** — Settings → Delete Project.
  (Pengalihan `sundy-clinic.vercel.app` ikut berhenti — pastikan tautan di Instagram/WhatsApp sudah
  memakai `sundyclinic.com`.)
- [ ] **Step 4: Bersihkan repo & server (Claude)**

```bash
git switch main && git pull && git switch -c bersih-sisa-vercel
git rm vercel.json
git commit -m "chore: drop vercel.json now that the Vercel project is gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin bersih-sisa-vercel
gh pr create --base main --title "Hapus vercel.json" --body "Proyek Vercel sudah dihapus (Plan 0, Task 14).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
ssh sundy 'sudo shred -u /root/pindah/neon.env /root/pindah/*.dump; sudo rm -rf /root/pindah'
```

Expected: PR terbuka; `/root/pindah` (berisi URL Neon dan dump berisi data pasien) terhapus.
