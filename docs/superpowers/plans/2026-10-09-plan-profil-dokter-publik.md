# Edit Profil Dokter di Halaman Publik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super Admin mengedit spesialisasi, deskripsi singkat, dan foto dokter yang tampil di halaman publik "Tim Dokter" dari dialog Ubah di halaman Staf.

**Architecture:** Teks lewat `updateStaff` yang diperluas. Foto diunggah ke rute `POST /admin/staf/foto`, diolah `sharp` (putar sesuai EXIF, susutkan, WebP, buang metadata), disimpan di `<PATIENT_FILES_DIR>/dokter/<idStaf>-<sidikJari8>.webp`, dan disajikan lewat rute publik `GET /foto-dokter/<nama>` yang hanya melayani foto staf aktif yang tampil di situs. `Staff.photoUrl` menyimpan jalur lokalnya, yang sudah didukung `doctorPhotos()`.

**Tech Stack:** Next.js 15 (route handler, server action), Prisma 7/PostgreSQL, `sharp` 0.35, Vitest (unit + integrasi), Playwright, Material UI.

**Spec:** `docs/superpowers/specs/2026-10-09-profil-dokter-publik-design.md` (disetujui pemilik). Untuk gaya komponen admin baca juga `docs/superpowers/specs/2026-10-08-admin-material-ui-design.md`.

## Prasyarat (periksa sebelum Task 1)

Branch `kelola-staf-perbaikan` (PR belum digabung saat rencana ini ditulis) mengubah `src/server/staff.ts` dan `src/components/admin/staff/staff-manager.tsx`, dua berkas yang juga disentuh rencana ini (Task 3 dan Task 5). Jalankan `git fetch origin && git merge-base --is-ancestor origin/kelola-staf-perbaikan origin/main && echo siap`. Bila belum "siap", **minta pemilik menggabungkan PR itu dulu**, lalu `git rebase origin/main` di branch kerja; jangan mengerjakan keduanya berdampingan dan menyelesaikan konflik belakangan.

## Global Constraints

- **Bahasa:** semua teks yang dilihat pengguna, pesan galat, nama uji, dan komentar kode dalam Bahasa Indonesia; nama berkas, fungsi, dan commit dalam bahasa Inggris.
- **Batas isi (spec 3):** `specialty` paling banyak **100** karakter; `bio` paling banyak **600** karakter; kosong disimpan sebagai `null`. Nomor SIP tidak ikut.
- **Foto (spec 4):** hanya JPG, PNG, WebP, dikenali dari **isi**; paling besar **8 MB** (`8 * 1024 * 1024`); sisi terpendek (setelah orientasi EXIF) minimal **600 px**; jumlah piksel masukan paling banyak **40.000.000**; hasil disusutkan ke paling besar **1600 px** sisi terpanjang (tanpa memperbesar), disimpan sebagai **WebP kualitas 82**, **tanpa metadata apa pun** (termasuk GPS).
- **Penyimpanan:** `<PATIENT_FILES_DIR>/dokter/<idStaf>-<sidikJari8>.webp` (bawaan `PATIENT_FILES_DIR=/www/sundy-files`); nama berkas disusun server, tidak pernah dari masukan pengguna; pola `^[0-9a-z]+-[0-9a-f]{8}\.webp$`; tulis ke nama sementara lalu `rename`.
- **Penyajian publik:** `GET /foto-dokter/<nama>` tanpa login, hanya nama berpola ketik, hanya bila ada staf **aktif**, `showOnWebsite`, berperan DOKTER/TERAPIS dengan `photoUrl` sama persis; header `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable`; selain itu 404 (`no-store`).
- **Hak:** unggah, hapus, dan ubah profil hanya `staff:manage` (Super Admin); foto hanya untuk staf berperan DOKTER atau TERAPIS.
- **Mengganti/menghapus:** foto baru ditulis dulu, baris `photoUrl` diperbarui, baru berkas lama dihapus (bukan bila namanya sama); bila pembaruan basis data gagal, berkas baru dihapus kembali.
- **Pola kode yang ada:** `runAction`/`UserFacingError` dari `@/lib/action-result`; `requireCapability` dan `getCurrentStaff` dari `@/server/session`; `recordAudit` dari `@/server/audit`; `safeRevalidatePath` dari `@/lib/revalidate`; berkas `"use server"` hanya boleh mengekspor fungsi async (tipe boleh); komponen admin hanya MUI (dijaga `tests/unit/architecture.test.ts`: tanpa shadcn, lucide, kelas warna Tailwind, atau impor Prisma di `src/app`).
- **Pengujian:** unit `npx vitest run <berkas>`; integrasi `npm run test:integration -- <berkas>` (basis data uji `sundy_test`; **jangan bersamaan dengan E2E**); E2E `npx playwright test <berkas> --project=desktop` lalu `--project=mobile` (laptop 8 GB: per berkas, per proyek, `--workers=1`).
- **Uji lama yang sudah gagal:** 3 uji `tests/integration/schedule.test.ts`. Jangan diubah. Beberapa uji unit komponen sesekali kena batas 5 detik saat suite penuh karena memori mesin; jalankan sendirian sebelum menyimpulkan regresi.
- **Commit:** Conventional Commits berbahasa Inggris, diakhiri baris `Co-Authored-By` yang menyebut model penulis commit. **Jangan pernah men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Push, merge, dan deploy hanya atas permintaan pemilik. **Jangan** memakai `bash -c` yang memuat `rm` (diblokir pengaman izin); jalankan langkah terpisah.
- **Log kerja:** `WS` = `.superpowers/sdd/2026-10-09-plan-profil-dokter-publik/` (git-ignored).

## Keputusan perencana (hal yang spec tidak merinci)

1. **`uploadStaffPhoto` ada di berkas tanpa `"use server"`** (`src/server/staff-photo.ts`): fungsi itu menerima byte, dan semua ekspor berkas `"use server"` menjadi titik masuk yang bisa dipanggil klien. Hanya `removeStaffPhoto` (tanpa byte) yang menjadi aksi server, di `staff.ts`.
2. **Ukuran minimal diperiksa dari dimensi setelah orientasi EXIF** (lebar dan tinggi ditukar untuk orientasi 5–8), **sebelum** menyusutkan. Memeriksa setelah menyusutkan akan menolak keliru gambar lebar-tipis, dan memeriksa tanpa orientasi akan salah menilai foto ponsel yang diputar.
3. **Foto yang sama diunggah ulang** menghasilkan nama yang sama (sidik jari isi); berkas tidak dihapus bila nama baru sama dengan nama lama.
4. **Audit yang gagal setelah foto terpasang tidak membatalkan unggahan** (dicatat di log server), sama dengan keputusan pada unggah BIA.
5. **`updateStaff` menerima `specialty` dan `bio` untuk peran apa pun**, tetapi dialog hanya mengirimnya untuk Dokter dan Terapis; tidak dikirim berarti tidak berubah, sehingga menyimpan staf berperan lain tidak mengosongkan profil.
6. **Foto yang diganti atau dihapus benar-benar dihapus dari disk** (foto profil publik, bukan data klinis).
7. **Bentuk bingkai pratinjau** di dialog dibuat dengan `borderRadius: "999px 999px 32px 32px"` pada kotak 4:5, cukup dekat dengan bingkai lengkung halaman publik (`ArchImage`) untuk menunjukkan bagian yang terpotong; bukan salinan piksel-demi-piksel.

## Review Focus

1. **Berkas yang menyamar atau merusak**: HTML/SVG/skrip bernama `.jpg`, JPEG rusak, "bom piksel" → harus ditolak dengan pesan jelas dan tidak pernah disajikan sebagai berkas pengguna → Task 2 dan Task 4.
2. **Foto yang seharusnya tersembunyi bisa dibuka**: dokter nonaktif atau disembunyikan, staf berperan lain, nama yang ditebak atau berisi `../` → 404 → Task 4.
3. **Kegagalan di tengah**: pembaruan basis data gagal setelah berkas tertulis (berkas yatim), atau unggah ulang foto yang sama lalu gagal (berkas yang masih dipakai ikut terhapus) → Task 3.
4. **Metadata dan orientasi**: GPS/EXIF ikut terpublikasi, atau foto ponsel tampil miring → Task 2.
5. **Hak dan efek samping**: peran selain Super Admin mengubah profil atau foto; foto untuk staf yang bukan dokter/terapis; menyimpan staf berperan lain mengosongkan spesialisasi/deskripsi → Task 3, Task 4, dan Task 5.

---

### Task 1: Aturan murni, dependensi `sharp`, pengecekan asal bersama

**Files:**
- Modify: `package.json`, `package-lock.json` (`sharp` jadi dependensi langsung)
- Create: `src/lib/doctor-profile.ts`
- Create: `src/server/same-origin.ts`
- Modify: `src/app/(admin)/admin/bia/unggah/route.ts` (memakai `isSameOrigin`)
- Modify: `src/lib/audit-labels.ts`
- Test: `tests/unit/doctor-profile.test.ts` (baru), `tests/unit/same-origin.test.ts` (baru), `tests/unit/audit-labels.test.ts` (tambah)

**Interfaces:**
- Consumes: `type Parsed<T>` dari `@/lib/staff-accounts`.
- Produces:
  - `@/lib/doctor-profile`: `SPECIALTY_MAX = 100`, `BIO_MAX = 600`, `DOCTOR_PHOTO_MAX_BYTES = 8 * 1024 * 1024`, `DOCTOR_PHOTO_MIN_SIDE = 600`, `DOCTOR_PHOTO_MAX_SIDE = 1600`, `DOCTOR_PHOTO_ACCEPT: string`, `DOCTOR_PHOTO_NAME: RegExp`, `DOCTOR_PHOTO_PATH_PREFIX = "/foto-dokter/"`; `validateSpecialty(raw: unknown): Parsed<string | null>`; `validateBio(raw: unknown): Parsed<string | null>`; `doctorPhotoUrl(name: string): string`; `doctorPhotoName(photoUrl: string | null | undefined): string | null`; `type PhotoKind = "jpeg" | "png" | "webp"`; `detectPhotoKind(bytes: Uint8Array): PhotoKind | null`; `roleHasPublicProfile(role: StaffRole): boolean` (true untuk DOKTER dan TERAPIS).
  - `@/server/same-origin`: `isSameOrigin(request: Request): boolean`.

- [ ] **Step 1: Prasyarat dan dependensi**

Jalankan pemeriksaan di bagian "Prasyarat". Lalu:

Run: `npm install sharp@^0.35.4`
Expected: `package.json` memuat `"sharp": "^0.35.4"` di `dependencies`; `git diff --stat package-lock.json` hanya menambah entri akar untuk `sharp` (versi terpasang tidak berubah: `npm ls sharp` tetap `0.35.4`). Bila lockfile berubah lebih dari itu, `git checkout package-lock.json` lalu ulangi dengan `npm install --package-lock-only sharp@0.35.4 --no-audit --no-fund` dan periksa lagi.

- [ ] **Step 2: Tulis uji (RED)**

`tests/unit/doctor-profile.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BIO_MAX,
  DOCTOR_PHOTO_NAME,
  SPECIALTY_MAX,
  detectPhotoKind,
  doctorPhotoName,
  doctorPhotoUrl,
  roleHasPublicProfile,
  validateBio,
  validateSpecialty,
} from "@/lib/doctor-profile";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

describe("spesialisasi dan deskripsi", () => {
  it("spesialisasi dirapikan, kosong menjadi null, dan dibatasi 100 karakter", () => {
    expect(validateSpecialty("  Spesialis   Gizi  Klinik ")).toEqual({ ok: true, value: "Spesialis Gizi Klinik" });
    expect(validateSpecialty("   ")).toEqual({ ok: true, value: null });
    expect(validateSpecialty(undefined)).toEqual({ ok: true, value: null });
    expect(validateSpecialty("x".repeat(SPECIALTY_MAX))).toEqual({ ok: true, value: "x".repeat(SPECIALTY_MAX) });
    expect(validateSpecialty("x".repeat(SPECIALTY_MAX + 1))).toEqual({ ok: false, message: "Spesialisasi paling banyak 100 karakter." });
  });

  it("deskripsi mempertahankan baris baru, dipangkas, kosong menjadi null, dan dibatasi 600 karakter", () => {
    expect(validateBio("  Baris satu.\r\nBaris dua.  ")).toEqual({ ok: true, value: "Baris satu.\nBaris dua." });
    expect(validateBio("")).toEqual({ ok: true, value: null });
    expect(validateBio(null)).toEqual({ ok: true, value: null });
    expect(validateBio("x".repeat(BIO_MAX))).toEqual({ ok: true, value: "x".repeat(BIO_MAX) });
    expect(validateBio("x".repeat(BIO_MAX + 1))).toEqual({ ok: false, message: "Deskripsi paling banyak 600 karakter." });
  });
});

describe("nama dan alamat foto", () => {
  it("hanya pola id-sidikjari.webp yang sah", () => {
    expect(DOCTOR_PHOTO_NAME.test("cmv0abc123-0a1b2c3d.webp")).toBe(true);
    for (const bad of ["../cmv0abc-0a1b2c3d.webp", "cmv0abc-0a1b2c3d.png", "cmv0abc-0A1B2C3D.webp", "cmv0abc-0a1b2c3.webp", "cmv0abc.webp", "-0a1b2c3d.webp", "a/b-0a1b2c3d.webp", "cmv0abc-0a1b2c3d.webp/x"]) {
      expect(DOCTOR_PHOTO_NAME.test(bad)).toBe(false);
    }
  });

  it("menyusun alamat dari nama dan membacanya kembali; nilai lain menghasilkan null", () => {
    expect(doctorPhotoUrl("cmv0abc-0a1b2c3d.webp")).toBe("/foto-dokter/cmv0abc-0a1b2c3d.webp");
    expect(doctorPhotoName("/foto-dokter/cmv0abc-0a1b2c3d.webp")).toBe("cmv0abc-0a1b2c3d.webp");
    expect(doctorPhotoName("/images/dokter/diane-1.jpg")).toBeNull();
    expect(doctorPhotoName("/foto-dokter/../rahasia.webp")).toBeNull();
    expect(doctorPhotoName(null)).toBeNull();
    expect(doctorPhotoName(undefined)).toBeNull();
  });

  it("hanya dokter dan terapis yang punya profil di situs", () => {
    expect(roleHasPublicProfile("DOKTER")).toBe(true);
    expect(roleHasPublicProfile("TERAPIS")).toBe(true);
    for (const role of ["SUPER_ADMIN", "RESEPSIONIS", "APOTEKER", "ADMIN_KEUANGAN"] as const) expect(roleHasPublicProfile(role)).toBe(false);
  });
});

describe("jenis foto dari isi berkas", () => {
  it("mengenali JPEG, PNG, dan WebP", () => {
    expect(detectPhotoKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe("jpeg");
    expect(detectPhotoKind(bytes(0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(detectPhotoKind(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toBe("webp");
  });

  it("menolak HTML, SVG, PDF, HEIC, dan berkas pendek", () => {
    expect(detectPhotoKind(bytes(...ascii("<!doctype html><script>alert(1)</script>")))).toBeNull();
    expect(detectPhotoKind(bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBeNull();
    expect(detectPhotoKind(bytes(...ascii("%PDF-1.7")))).toBeNull();
    expect(detectPhotoKind(bytes(0, 0, 0, 24, ...ascii("ftypheic"), 0))).toBeNull();
    expect(detectPhotoKind(bytes(0xff, 0xd8))).toBeNull();
    expect(detectPhotoKind(new Uint8Array(0))).toBeNull();
  });
});

describe("dependensi", () => {
  it("sharp adalah dependensi langsung proyek (bukan hanya ikut Next.js)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.sharp).toMatch(/^\^?0\.35\./);
  });
});
```

`tests/unit/same-origin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/server/same-origin";

const request = (headers: Record<string, string>) => new Request("https://sundyclinic.com/admin/staf/foto", { method: "POST", headers });

describe("asal permintaan", () => {
  it("sama bila host Origin sama dengan header host", () => {
    expect(isSameOrigin(request({ origin: "https://sundyclinic.com", host: "sundyclinic.com" }))).toBe(true);
    expect(isSameOrigin(request({ origin: "http://localhost:3100", host: "localhost:3100" }))).toBe(true);
  });

  it("menolak Origin asing, tanpa Origin, tanpa host, dan Origin yang bukan alamat", () => {
    expect(isSameOrigin(request({ origin: "https://jahat.example", host: "sundyclinic.com" }))).toBe(false);
    expect(isSameOrigin(request({ host: "sundyclinic.com" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "https://sundyclinic.com" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "bukan-alamat", host: "sundyclinic.com" }))).toBe(false);
  });

  it("X-Forwarded-Host dari klien tidak dipercaya", () => {
    expect(isSameOrigin(request({ origin: "https://jahat.example", host: "sundyclinic.com", "x-forwarded-host": "jahat.example" }))).toBe(false);
  });
});
```

`tests/unit/audit-labels.test.ts`: tambahkan sebagai `it` baru di akhir `describe`:

```ts
  it("aksi foto staf punya bahasa manusia", () => {
    expect(auditActionLabel("staff.photo.update")).toBe("mengganti foto staf");
    expect(auditActionLabel("staff.photo.remove")).toBe("menghapus foto staf");
  });
```

Run: `npx vitest run tests/unit/doctor-profile.test.ts tests/unit/same-origin.test.ts tests/unit/audit-labels.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 3: Implementasi**

`src/lib/doctor-profile.ts`:

```ts
import type { StaffRole } from "@prisma/client";
import type { Parsed } from "./staff-accounts";

/** Aturan profil dokter di halaman publik (spec profil dokter 3 dan 4). Murni, tanpa basis data, tanpa node:*: dipakai juga oleh komponen klien. */
export const SPECIALTY_MAX = 100;
export const BIO_MAX = 600;
export const DOCTOR_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const DOCTOR_PHOTO_MIN_SIDE = 600;
export const DOCTOR_PHOTO_MAX_SIDE = 1600;
/** Untuk atribut `accept` kotak pilih berkas; HEIC sengaja tidak ada (peramban ponsel mengonversinya ke JPG). */
export const DOCTOR_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
/** Nama berkas foto: id staf (huruf kecil dan angka) + sidik jari 8 heks. Disusun server, tidak pernah dari masukan pengguna. */
export const DOCTOR_PHOTO_NAME = /^[0-9a-z]+-[0-9a-f]{8}\.webp$/;
export const DOCTOR_PHOTO_PATH_PREFIX = "/foto-dokter/";

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export function validateSpecialty(raw: unknown): Parsed<string | null> {
  const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (text.length > SPECIALTY_MAX) return fail(`Spesialisasi paling banyak ${SPECIALTY_MAX} karakter.`);
  return { ok: true, value: text || null };
}

export function validateBio(raw: unknown): Parsed<string | null> {
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (text.length > BIO_MAX) return fail(`Deskripsi paling banyak ${BIO_MAX} karakter.`);
  return { ok: true, value: text || null };
}

export function doctorPhotoUrl(name: string): string {
  return `${DOCTOR_PHOTO_PATH_PREFIX}${name}`;
}

/** Nama berkas dari `photoUrl`, atau null bila bukan foto unggahan yang sah (mis. foto bawaan situs atau kosong). */
export function doctorPhotoName(photoUrl: string | null | undefined): string | null {
  if (!photoUrl?.startsWith(DOCTOR_PHOTO_PATH_PREFIX)) return null;
  const name = photoUrl.slice(DOCTOR_PHOTO_PATH_PREFIX.length);
  return DOCTOR_PHOTO_NAME.test(name) ? name : null;
}

/** Hanya dokter dan terapis yang tampil di "Tim Dokter" (sama dengan `getPublicStaff`). */
export function roleHasPublicProfile(role: StaffRole): boolean {
  return role === "DOKTER" || role === "TERAPIS";
}

export type PhotoKind = "jpeg" | "png" | "webp";

/** Jenis foto dari byte awalnya, bukan dari nama atau tipe kiriman klien. */
export function detectPhotoKind(bytes: Uint8Array): PhotoKind | null {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && text(1, 4) === "PNG") return "png";
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  return null;
}
```

`src/server/same-origin.ts`:

```ts
/**
 * Asal permintaan harus situs ini sendiri (cookie sesi saja tidak cukup bagi rute yang menulis). Hanya header `host`
 * yang dipakai: nginx mengisinya dari `$host`, sedangkan `x-forwarded-host` bisa dikirim klien.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
```

`src/app/(admin)/admin/bia/unggah/route.ts`: hapus fungsi lokal `sameOrigin` beserta komentarnya, tambahkan `import { isSameOrigin } from "@/server/same-origin";`, dan ganti pemanggilan `if (!sameOrigin(request))` menjadi `if (!isSameOrigin(request))`.

`src/lib/audit-labels.ts`, tambahkan di `ACTION_LABEL` setelah `"staff.password.change"`:

```ts
  "staff.photo.update": "mengganti foto staf",
  "staff.photo.remove": "menghapus foto staf",
```

- [ ] **Step 4: Jalankan uji (GREEN) dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run tests/unit/doctor-profile.test.ts tests/unit/same-origin.test.ts tests/unit/audit-labels.test.ts tests/unit/architecture.test.ts && npm run test:integration -- tests/integration/bia-routes.test.ts`
Expected: lulus (uji rute BIA membuktikan perilaku unggah BIA tidak berubah, termasuk penolakan `X-Forwarded-Host`).

```bash
git add package.json package-lock.json src/lib/doctor-profile.ts src/server/same-origin.ts "src/app/(admin)/admin/bia/unggah/route.ts" src/lib/audit-labels.ts tests/unit/doctor-profile.test.ts tests/unit/same-origin.test.ts tests/unit/audit-labels.test.ts
git commit -m "feat: add doctor profile rules, make sharp a direct dependency, and share the same-origin check"
```

---

### Task 2: Pengolahan dan penyimpanan foto

**Files:**
- Create: `src/server/doctor-photo.ts`
- Test: `tests/unit/doctor-photo.test.ts` (baru; lingkungan node, memakai `sharp` sungguhan)

**Interfaces:**
- Consumes: `DOCTOR_PHOTO_MAX_BYTES`, `DOCTOR_PHOTO_MIN_SIDE`, `DOCTOR_PHOTO_MAX_SIDE`, `DOCTOR_PHOTO_NAME`, `detectPhotoKind` (Task 1); `patientFilesDir` dari `@/server/bia-storage`; `UserFacingError`.
- Produces (`@/server/doctor-photo`, bukan `"use server"`):
  - `type ProcessedPhoto = { bytes: Buffer; width: number; height: number; fingerprint: string }`.
  - `processDoctorPhoto(input: Uint8Array): Promise<ProcessedPhoto>` — melempar `UserFacingError` berpesan Indonesia: `Berkas kosong.`, `Foto terlalu besar (maks. 8 MB).`, `Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.`, `Foto tidak bisa dibaca sebagai gambar.`, `Ukuran foto (piksel) terlalu besar.`, `Foto terlalu kecil. Sisi terpendek minimal 600 px.`
  - `doctorPhotoDir(): string`; `writeDoctorPhoto(staffId: string, photo: ProcessedPhoto): Promise<string>` (mengembalikan nama berkas); `readDoctorPhotoFile(name: string): Promise<Buffer>`; `removeDoctorPhotoFile(name: string): Promise<void>` (tidak galat bila tidak ada). Ketiganya melempar `Error("Nama berkas foto dokter tidak sah.")` bila nama tidak cocok `DOCTOR_PHOTO_NAME`.

- [ ] **Step 1: Tulis uji (RED)**

`tests/unit/doctor-photo.test.ts`:

```ts
// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/action-result";
import { DOCTOR_PHOTO_NAME } from "@/lib/doctor-profile";
import { doctorPhotoDir, processDoctorPhoto, readDoctorPhotoFile, removeDoctorPhotoFile, writeDoctorPhoto } from "@/server/doctor-photo";

const solid = (width: number, height: number, background = "#c8a97e") => sharp({ create: { width, height, channels: 3, background } });
const refuse = async (promise: Promise<unknown>, message: string) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(UserFacingError);
  expect((error as UserFacingError).message).toBe(message);
};

describe("pengolahan foto dokter", () => {
  it("menghasilkan WebP tanpa metadata: lokasi GPS dan hak cipta dari JPEG masukan terbuang", async () => {
    const input = await solid(800, 1000)
      .jpeg()
      .withExif({ IFD0: { Copyright: "Fotografer Uji" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "1/1 2/1 3/1", GPSLongitudeRef: "E", GPSLongitude: "4/1 5/1 6/1" } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // pastikan masukan memang membawa EXIF

    const out = await processDoctorPhoto(input);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(out.bytes.includes(Buffer.from("Fotografer Uji"))).toBe(false);
    expect(out.bytes.includes(Buffer.from("GPS"))).toBe(false);
  });

  it("mengoreksi orientasi EXIF (foto ponsel yang diputar) dan tidak menyisakan tanda orientasi", async () => {
    // 1000×800 dengan orientasi 6 (putar 90°) tampil sebagai 800×1000.
    const input = await solid(1000, 800).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await processDoctorPhoto(input);
    expect([out.width, out.height]).toEqual([800, 1000]);
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([800, 1000]);
    expect(meta.orientation).toBeUndefined();
  });

  it("menyusutkan ke paling besar 1600 px sisi terpanjang dan tidak pernah memperbesar", async () => {
    const big = await processDoctorPhoto(await solid(3000, 4000).png().toBuffer());
    expect([big.width, big.height]).toEqual([1200, 1600]);
    const small = await processDoctorPhoto(await solid(800, 1000).png().toBuffer());
    expect([small.width, small.height]).toEqual([800, 1000]);
  });

  it("sidik jari 8 heks berasal dari isi hasil olahan, dan foto yang sama menghasilkan sidik jari yang sama", async () => {
    const input = await solid(800, 1000).png().toBuffer();
    const a = await processDoctorPhoto(input);
    const b = await processDoctorPhoto(input);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(a.fingerprint).toBe(createHash("sha256").update(a.bytes).digest("hex").slice(0, 8));
    expect(b.fingerprint).toBe(a.fingerprint);
    expect((await processDoctorPhoto(await solid(800, 1000, "#112233").png().toBuffer())).fingerprint).not.toBe(a.fingerprint);
  });

  it("menolak foto yang terlalu kecil, dinilai dari sisi terpendek setelah orientasi", async () => {
    const message = "Foto terlalu kecil. Sisi terpendek minimal 600 px.";
    await refuse(processDoctorPhoto(await solid(500, 700).png().toBuffer()), message);
    await refuse(processDoctorPhoto(await solid(4000, 500).png().toBuffer()), message);
    // 700×1200 dengan orientasi 6 tampil 1200×700: sisi terpendek 700 ≥ 600, lolos.
    await expect(processDoctorPhoto(await solid(700, 1200).jpeg().withMetadata({ orientation: 6 }).toBuffer())).resolves.toBeTruthy();
  });

  it("menolak berkas kosong, terlalu besar, bukan gambar, dan gambar rusak", async () => {
    await refuse(processDoctorPhoto(new Uint8Array(0)), "Berkas kosong.");
    await refuse(processDoctorPhoto(new Uint8Array(8 * 1024 * 1024 + 1).fill(0xff)), "Foto terlalu besar (maks. 8 MB).");
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    await refuse(processDoctorPhoto(html), "Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"></svg>');
    await refuse(processDoctorPhoto(svg), "Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.");
    // Awal JPEG yang benar, isinya sampah: lolos pemeriksaan jenis, gagal dibaca sebagai gambar.
    const corrupt = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 200 }, (_, i) => (i * 7) % 256)]);
    await refuse(processDoctorPhoto(corrupt), "Foto tidak bisa dibaca sebagai gambar.");
  });

  it("menolak gambar berpiksel terlalu banyak (bom gambar) walau berkasnya kecil", async () => {
    const bomb = await solid(9000, 4500, "#ffffff").png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(8 * 1024 * 1024);
    await refuse(processDoctorPhoto(bomb), "Ukuran foto (piksel) terlalu besar.");
  }, 60_000);
});

describe("penyimpanan foto dokter", () => {
  let root: string;
  const previous = process.env.PATIENT_FILES_DIR;
  const photo = { bytes: Buffer.from("isi-foto-webp"), width: 800, height: 1000, fingerprint: "0a1b2c3d" };

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-dokter-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  afterEach(async () => {
    await rm(path.join(root, "dokter"), { recursive: true, force: true });
  });
  afterAll(async () => {
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });

  it("menulis berkas bernama idstaf-sidikjari.webp di folder dokter tanpa sisa berkas sementara", async () => {
    expect(doctorPhotoDir()).toBe(path.join(root, "dokter"));
    const name = await writeDoctorPhoto("cmv0abc123", photo);
    expect(name).toBe("cmv0abc123-0a1b2c3d.webp");
    expect(name).toMatch(DOCTOR_PHOTO_NAME);
    expect((await stat(path.join(root, "dokter", name))).mode & 0o777).toBe(0o644);
    expect([...(await readDoctorPhotoFile(name))]).toEqual([...photo.bytes]);
    expect(await readdir(path.join(root, "dokter"))).toEqual([name]);
  });

  it("menulis ulang nama yang sama aman (foto yang sama), dan menghapus berkas, juga yang sudah tidak ada", async () => {
    const name = await writeDoctorPhoto("cmv0abc123", photo);
    expect(await writeDoctorPhoto("cmv0abc123", photo)).toBe(name);
    await removeDoctorPhotoFile(name);
    await expect(readDoctorPhotoFile(name)).rejects.toThrow();
    await expect(removeDoctorPhotoFile(name)).resolves.toBeUndefined();
  });

  it("menolak nama yang mencoba keluar dari folder atau tidak berbentuk yang kita buat", async () => {
    for (const bad of ["../../etc/passwd", "../x-0a1b2c3d.webp", "/etc/passwd", "abc.webp", "abc-0a1b2c3d.png", "a/b-0a1b2c3d.webp"]) {
      await expect(readDoctorPhotoFile(bad)).rejects.toThrow("Nama berkas foto dokter tidak sah.");
      await expect(removeDoctorPhotoFile(bad)).rejects.toThrow("Nama berkas foto dokter tidak sah.");
    }
    // id staf berpola aneh tidak bisa menyusun nama yang sah.
    await expect(writeDoctorPhoto("../escape", photo)).rejects.toThrow("Nama berkas foto dokter tidak sah.");
    await expect(writeDoctorPhoto("ID-Besar", photo)).rejects.toThrow("Nama berkas foto dokter tidak sah.");
  });
});
```

Run: `npx vitest run tests/unit/doctor-photo.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 2: Implementasi `src/server/doctor-photo.ts`**

```ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { UserFacingError } from "@/lib/action-result";
import { DOCTOR_PHOTO_MAX_BYTES, DOCTOR_PHOTO_MAX_SIDE, DOCTOR_PHOTO_MIN_SIDE, DOCTOR_PHOTO_NAME, detectPhotoKind } from "@/lib/doctor-profile";
import { patientFilesDir } from "@/server/bia-storage";

/** Pengolahan dan penyimpanan foto dokter di halaman publik (spec profil dokter 4). */
const MAX_INPUT_PIXELS = 40_000_000;

export type ProcessedPhoto = { bytes: Buffer; width: number; height: number; fingerprint: string };

/**
 * Foto kiriman pengguna diubah menjadi WebP buatan `sharp`: diputar sesuai EXIF, disusutkan, dan tanpa metadata apa pun
 * (lokasi GPS ikut terbuang). Berkas kiriman tidak pernah disajikan apa adanya.
 */
export async function processDoctorPhoto(input: Uint8Array): Promise<ProcessedPhoto> {
  if (input.length === 0) throw new UserFacingError("Berkas kosong.");
  if (input.length > DOCTOR_PHOTO_MAX_BYTES) throw new UserFacingError("Foto terlalu besar (maks. 8 MB).");
  if (!detectPhotoKind(input)) throw new UserFacingError("Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.");

  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const rawWidth = meta.width ?? 0;
    const rawHeight = meta.height ?? 0;
    if (rawWidth === 0 || rawHeight === 0) throw new UserFacingError("Foto tidak bisa dibaca sebagai gambar.");
    if (rawWidth * rawHeight > MAX_INPUT_PIXELS) throw new UserFacingError("Ukuran foto (piksel) terlalu besar.");
    // Orientasi 5–8 menukar lebar dan tinggi saat ditampilkan; ukuran minimal dinilai dari yang terlihat.
    const swapped = (meta.orientation ?? 1) >= 5;
    const shortSide = Math.min(swapped ? rawHeight : rawWidth, swapped ? rawWidth : rawHeight);
    if (shortSide < DOCTOR_PHOTO_MIN_SIDE) throw new UserFacingError(`Foto terlalu kecil. Sisi terpendek minimal ${DOCTOR_PHOTO_MIN_SIDE} px.`);

    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: DOCTOR_PHOTO_MAX_SIDE, height: DOCTOR_PHOTO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height, fingerprint: createHash("sha256").update(data).digest("hex").slice(0, 8) };
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message)) throw new UserFacingError("Ukuran foto (piksel) terlalu besar.");
    throw new UserFacingError("Foto tidak bisa dibaca sebagai gambar.");
  }
}

export function doctorPhotoDir(): string {
  return path.join(patientFilesDir(), "dokter");
}

function fileOf(name: string): string {
  if (!DOCTOR_PHOTO_NAME.test(name)) throw new Error("Nama berkas foto dokter tidak sah.");
  return path.join(doctorPhotoDir(), name);
}

/** Menulis ke nama sementara lalu memindahkannya, sehingga berkas yang terbaca selalu utuh. Mengembalikan nama berkas. */
export async function writeDoctorPhoto(staffId: string, photo: ProcessedPhoto): Promise<string> {
  const name = `${staffId}-${photo.fingerprint}.webp`;
  const target = fileOf(name);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, photo.bytes, { mode: 0o644 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return name;
}

export async function readDoctorPhotoFile(name: string): Promise<Buffer> {
  return readFile(fileOf(name));
}

export async function removeDoctorPhotoFile(name: string): Promise<void> {
  await rm(fileOf(name), { force: true });
}
```

- [ ] **Step 3: Jalankan uji (GREEN) dan commit**

Run: `npx vitest run tests/unit/doctor-photo.test.ts`
Expected: PASS (10 uji). Bila `withExif`/`withMetadata` ditolak oleh versi `sharp` (galat tipe atau runtime), catat sebagai Ruling dan pakai padanannya yang sah di versi terpasang; jangan melonggarkan uji GPS atau orientasi. Bila uji "bom gambar" memakai terlalu banyak memori di mesin, jalankan sendirian (`-t "bom gambar"`); jangan menurunkan ambang piksel.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run tests/unit/architecture.test.ts`

```bash
git add src/server/doctor-photo.ts tests/unit/doctor-photo.test.ts
git commit -m "feat: process doctor photos into metadata-free WebP and store them under random names"
```

---

### Task 3: Layanan foto, perluasan `updateStaff`, dan hapus foto

**Files:**
- Create: `src/server/staff-photo.ts` (tanpa `"use server"`)
- Modify: `src/server/staff.ts` (`StaffRow`, `listStaffAccounts`, `updateStaff`, `removeStaffPhoto`)
- Modify: `tests/unit/components/staff-manager.test.tsx` (hanya fixture `row()`: tiga bidang baru)
- Test: `tests/integration/staff-profile.test.ts` (baru)

**Interfaces:**
- Consumes: Task 1 (`validateSpecialty`, `validateBio`, `doctorPhotoUrl`, `doctorPhotoName`, `roleHasPublicProfile`, `DOCTOR_PHOTO_NAME`); Task 2 (`processDoctorPhoto`, `writeDoctorPhoto`, `removeDoctorPhotoFile`, `readDoctorPhotoFile`); `CurrentStaff` dan `requireCapability` dari `@/server/session`; `recordAudit`.
- Produces:
  - `@/server/staff-photo`: `uploadStaffPhoto(input: { actor: CurrentStaff; staffId: string; bytes: Uint8Array }): Promise<{ photoUrl: string }>`; `removeStaffPhotoFor(actor: CurrentStaff, staffId: string): Promise<void>`; `findPublicDoctorPhoto(name: string): Promise<Buffer | null>`. Mereka melempar `UserFacingError` berpesan: `Staf tidak ditemukan.`, `Foto hanya untuk dokter dan terapis.`, `Staf ini belum punya foto unggahan.` (ditambah pesan dari `processDoctorPhoto`).
  - `@/server/staff`: `StaffRow` bertambah `specialty: string | null; bio: string | null; photoUrl: string | null`; `updateStaff(input: { id: string; name: string; role: StaffRole; showOnWebsite: boolean; specialty?: string; bio?: string }): Promise<ActionResult<void>>`; `removeStaffPhoto(staffId: string): Promise<ActionResult<void>>`.

- [ ] **Step 1: Tulis uji integrasi (RED)**

`tests/integration/staff-profile.test.ts`:

```ts
// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { listStaffAccounts, removeStaffPhoto, updateStaff } from "@/server/staff";
import { findPublicDoctorPhoto, uploadStaffPhoto } from "@/server/staff-photo";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u-aktor", staffId: "s-aktor", name: "Pemilik Profil", role: "SUPER_ADMIN" as Role, email: "profil@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return { ...actor };
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));
// Pencatatan audit bisa gagal setelah foto terpasang; bendera ini membuatnya gagal sesuai kebutuhan uji.
const { auditState } = vi.hoisted(() => ({ auditState: { fail: false } }));
vi.mock("@/server/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/audit")>();
  return {
    ...real,
    recordAudit: vi.fn(async (...args: Parameters<typeof real.recordAudit>) => {
      if (auditState.fail) throw new Error("audit down");
      return real.recordAudit(...args);
    }),
  };
});

const SLUG = "profil-uji";
const png = (color = "#c8a97e", width = 800, height = 1000) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

describe("profil dokter di situs publik", () => {
  let root: string;
  const previous = process.env.PATIENT_FILES_DIR;
  const files = async () => readdir(path.join(root, "dokter")).catch(() => [] as string[]);
  const doctor = (suffix: string, patch: Record<string, unknown> = {}) =>
    prisma.staff.create({ data: { slug: `${SLUG}-${suffix}`, name: `Profil ${suffix}`, role: "DOKTER", showOnWebsite: true, ...patch } });
  const edit = (id: string, patch: Partial<Parameters<typeof updateStaff>[0]> = {}) => updateStaff({ id, name: "Profil Dokter", role: "DOKTER", showOnWebsite: true, ...patch });
  const refuse = async (promise: Promise<unknown>, message: string) => {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(UserFacingError);
    expect((error as UserFacingError).message).toBe(message);
  };

  async function clean() {
    await prisma.staff.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await prisma.auditLog.deleteMany({ where: { actorName: "Pemilik Profil" } });
    await rm(path.join(root, "dokter"), { recursive: true, force: true });
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-profil-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  beforeEach(async () => {
    actor.role = "SUPER_ADMIN";
    auditState.fail = false;
    await clean();
    vi.mocked(safeRevalidatePath).mockClear();
  });
  afterAll(async () => {
    await clean();
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("updateStaff menyimpan spesialisasi dan deskripsi (dirapikan), kosong menjadi null, dan menyegarkan halaman publik", async () => {
    const staff = await doctor("a");
    await unwrap(edit(staff.id, { specialty: "  Spesialis   Gizi Klinik ", bio: "  Dokter penanggung jawab.\nRamah.  " }));
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({ specialty: "Spesialis Gizi Klinik", bio: "Dokter penanggung jawab.\nRamah." });
    expect(safeRevalidatePath).toHaveBeenCalledWith("/tentang");
    expect(safeRevalidatePath).toHaveBeenCalledWith("/");

    await unwrap(edit(staff.id, { specialty: "   ", bio: "" }));
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({ specialty: null, bio: null });
  });

  it("updateStaff tanpa specialty/bio tidak mengubahnya (menyimpan staf berperan lain tidak mengosongkan profil)", async () => {
    const staff = await doctor("b", { specialty: "Spesialis Gizi Klinik", bio: "Bio awal." });
    await unwrap(edit(staff.id, { name: "Nama Baru" }));
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({ name: "Nama Baru", specialty: "Spesialis Gizi Klinik", bio: "Bio awal." });
  });

  it("updateStaff menolak teks terlalu panjang dengan pesan jelas dan tidak mengubah apa pun", async () => {
    const staff = await doctor("c", { specialty: "Awal" });
    expect(await edit(staff.id, { specialty: "x".repeat(101) })).toEqual({ ok: false, error: "Spesialisasi paling banyak 100 karakter." });
    expect(await edit(staff.id, { bio: "x".repeat(601) })).toEqual({ ok: false, error: "Deskripsi paling banyak 600 karakter." });
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).specialty).toBe("Awal");
  });

  it("audit perubahan profil mencatat nama tetapi tidak isi deskripsi", async () => {
    const staff = await doctor("d");
    await unwrap(edit(staff.id, { specialty: "Spesialisasi Rahasia Uji", bio: "Isi deskripsi rahasia uji." }));
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.update", entityId: staff.id } });
    expect(audit.summary).toContain("profil situs diubah");
    expect(JSON.stringify(audit)).not.toContain("Spesialisasi Rahasia Uji");
    expect(JSON.stringify(audit)).not.toContain("Isi deskripsi rahasia uji.");
  });

  it("mengunggah foto: berkas WebP ada di disk, photoUrl terisi, audit tercatat, halaman publik disegarkan", async () => {
    const staff = await doctor("e");
    const { photoUrl } = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    expect(photoUrl).toMatch(new RegExp(`^/foto-dokter/${staff.id}-[0-9a-f]{8}\\.webp$`));
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBe(photoUrl);
    expect(await files()).toEqual([photoUrl.replace("/foto-dokter/", "")]);
    expect(await prisma.auditLog.count({ where: { action: "staff.photo.update", entityId: staff.id } })).toBe(1);
    expect(safeRevalidatePath).toHaveBeenCalledWith("/tentang");
    expect(safeRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("mengganti foto menghapus berkas lama; mengunggah foto yang sama lagi tidak menghapus berkas yang masih dipakai", async () => {
    const staff = await doctor("f");
    const first = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#aa0000") });
    const second = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#00aa00") });
    expect(second.photoUrl).not.toBe(first.photoUrl);
    expect(await files()).toEqual([second.photoUrl.replace("/foto-dokter/", "")]);

    const again = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#00aa00") });
    expect(again.photoUrl).toBe(second.photoUrl);
    expect(await files()).toEqual([second.photoUrl.replace("/foto-dokter/", "")]);
  });

  it("menolak foto tidak sah tanpa mengubah apa pun, dan hanya untuk dokter dan terapis", async () => {
    const staff = await doctor("g", { photoUrl: null });
    await refuse(uploadStaffPhoto({ actor, staffId: staff.id, bytes: new TextEncoder().encode("<script>alert(1)</script>") }), "Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.");
    await refuse(uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#ffffff", 500, 700) }), "Foto terlalu kecil. Sisi terpendek minimal 600 px.");
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBeNull();
    expect(await files()).toEqual([]);

    const reception = await prisma.staff.create({ data: { slug: `${SLUG}-resepsionis`, name: "Profil Resepsionis", role: "RESEPSIONIS" } });
    await refuse(uploadStaffPhoto({ actor, staffId: reception.id, bytes: await png() }), "Foto hanya untuk dokter dan terapis.");
    await refuse(uploadStaffPhoto({ actor, staffId: "tidak-ada", bytes: await png() }), "Staf tidak ditemukan.");
    expect(await files()).toEqual([]);
  });

  it("bila pembaruan basis data gagal, berkas baru dihapus dan foto lama tetap utuh", async () => {
    const staff = await doctor("gagal-db");
    const first = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#aa0000") });
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION profil_gagal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."slug" = '${SLUG}-gagal-db' AND NEW."photoUrl" IS DISTINCT FROM OLD."photoUrl" THEN RAISE EXCEPTION 'profil_gagal'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER profil_gagal BEFORE UPDATE ON "Staff" FOR EACH ROW EXECUTE FUNCTION profil_gagal()`);
    try {
      await expect(uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#00aa00") })).rejects.toThrow();
      expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBe(first.photoUrl);
      expect(await files()).toEqual([first.photoUrl.replace("/foto-dokter/", "")]);
      // Foto yang sama (nama sama) lalu gagal: berkas yang masih dipakai tidak boleh ikut terhapus.
      await expect(uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#aa0000") })).resolves.toEqual({ photoUrl: first.photoUrl });
      expect(await files()).toEqual([first.photoUrl.replace("/foto-dokter/", "")]);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS profil_gagal ON "Staff"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS profil_gagal()`);
    }
  });

  it("audit yang gagal setelah foto terpasang tidak membatalkan unggahan", async () => {
    const staff = await doctor("audit");
    auditState.fail = true;
    const result = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    auditState.fail = false;
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBe(result.photoUrl);
    expect(await files()).toHaveLength(1);
  });

  it("menghapus foto: photoUrl kosong, berkas terhapus, audit tercatat; tanpa foto unggahan ditolak", async () => {
    const staff = await doctor("h");
    expect(await removeStaffPhoto(staff.id)).toEqual({ ok: false, error: "Staf ini belum punya foto unggahan." });
    await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    await unwrap(removeStaffPhoto(staff.id));
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBeNull();
    expect(await files()).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: "staff.photo.remove", entityId: staff.id } })).toBe(1);
    expect(await removeStaffPhoto("tidak-ada")).toEqual({ ok: false, error: "Staf tidak ditemukan." });
  });

  it("daftar staf memuat spesialisasi, deskripsi, dan photoUrl", async () => {
    const staff = await doctor("i", { specialty: "Spesialis Uji", bio: "Bio uji." });
    const { photoUrl } = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    const row = (await listStaffAccounts()).find((r) => r.id === staff.id);
    expect(row).toMatchObject({ specialty: "Spesialis Uji", bio: "Bio uji.", photoUrl });
  });

  it("foto publik hanya ditemukan untuk staf aktif yang tampil di situs", async () => {
    const staff = await doctor("j");
    const { photoUrl } = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    const name = photoUrl.replace("/foto-dokter/", "");
    expect((await findPublicDoctorPhoto(name))?.length).toBeGreaterThan(0);
    await prisma.staff.update({ where: { id: staff.id }, data: { showOnWebsite: false } });
    expect(await findPublicDoctorPhoto(name)).toBeNull();
    await prisma.staff.update({ where: { id: staff.id }, data: { showOnWebsite: true, isActive: false } });
    expect(await findPublicDoctorPhoto(name)).toBeNull();
    await prisma.staff.update({ where: { id: staff.id }, data: { isActive: true, role: "RESEPSIONIS" } });
    expect(await findPublicDoctorPhoto(name)).toBeNull();
    await prisma.staff.update({ where: { id: staff.id }, data: { role: "DOKTER" } });
    expect(await findPublicDoctorPhoto(name)).not.toBeNull();
    for (const bad of ["../x-0a1b2c3d.webp", "tidak-ada-0a1b2c3d.webp", "abc.png", ""]) expect(await findPublicDoctorPhoto(bad)).toBeNull();
  });

  it("semua aksi hanya untuk Super Admin", async () => {
    actor.role = "DOKTER";
    await expect(updateStaff({ id: "a", name: "X", role: "DOKTER", showOnWebsite: false, specialty: "x" })).rejects.toThrow("forbidden: staff:manage");
    await expect(removeStaffPhoto("a")).rejects.toThrow("forbidden: staff:manage");
  });
});
```

Run: `npm run test:integration -- tests/integration/staff-profile.test.ts`
Expected: FAIL (`@/server/staff-photo` belum ada; `removeStaffPhoto` belum ada).

- [ ] **Step 2: Implementasi `src/server/staff-photo.ts`**

```ts
import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { doctorPhotoName, doctorPhotoUrl, roleHasPublicProfile } from "@/lib/doctor-profile";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { processDoctorPhoto, readDoctorPhotoFile, removeDoctorPhotoFile, writeDoctorPhoto } from "@/server/doctor-photo";
import type { CurrentStaff } from "@/server/session";

/**
 * Layanan foto profil dokter (spec profil dokter 4.5). Sengaja BUKAN berkas "use server": `uploadStaffPhoto` menerima byte,
 * dan semua ekspor berkas "use server" menjadi titik masuk yang bisa dipanggil klien. Pintu masuknya rute `POST /admin/staf/foto`
 * dan aksi `removeStaffPhoto`, keduanya sudah memeriksa hak `staff:manage`.
 */
function revalidatePublic() {
  safeRevalidatePath("/admin/staf");
  safeRevalidatePath("/tentang");
  safeRevalidatePath("/");
}

const NOT_FOUND = "Staf tidak ditemukan.";

export async function uploadStaffPhoto(input: { actor: CurrentStaff; staffId: string; bytes: Uint8Array }): Promise<{ photoUrl: string }> {
  const staff = await prisma.staff.findUnique({ where: { id: String(input.staffId ?? "") }, select: { id: true, name: true, role: true, photoUrl: true } });
  if (!staff) throw new UserFacingError(NOT_FOUND);
  if (!roleHasPublicProfile(staff.role)) throw new UserFacingError("Foto hanya untuk dokter dan terapis.");

  const processed = await processDoctorPhoto(input.bytes);
  const name = await writeDoctorPhoto(staff.id, processed);
  const photoUrl = doctorPhotoUrl(name);
  const oldName = doctorPhotoName(staff.photoUrl);

  try {
    await prisma.staff.update({ where: { id: staff.id }, data: { photoUrl } });
  } catch (error) {
    // Foto yang sama (nama sama dengan yang lama) berarti berkasnya masih dipakai: jangan dihapus.
    if (name !== oldName) await removeDoctorPhotoFile(name).catch(() => undefined);
    throw error;
  }
  if (oldName && oldName !== name) await removeDoctorPhotoFile(oldName).catch(() => undefined);

  // Foto sudah terpasang: kegagalan menulis audit tidak boleh membuat unggahan dianggap gagal.
  await recordAudit({ actor: input.actor, action: "staff.photo.update", entity: "Staff", entityId: staff.id, summary: staff.name }).catch((error) =>
    console.error("Gagal mencatat audit foto staf", staff.id, error),
  );
  revalidatePublic();
  return { photoUrl };
}

export async function removeStaffPhotoFor(actor: CurrentStaff, staffId: string): Promise<void> {
  const staff = await prisma.staff.findUnique({ where: { id: String(staffId ?? "") }, select: { id: true, name: true, photoUrl: true } });
  if (!staff) throw new UserFacingError(NOT_FOUND);
  const name = doctorPhotoName(staff.photoUrl);
  if (!name) throw new UserFacingError("Staf ini belum punya foto unggahan.");

  await prisma.staff.update({ where: { id: staff.id }, data: { photoUrl: null } });
  await removeDoctorPhotoFile(name).catch(() => undefined);
  await recordAudit({ actor, action: "staff.photo.remove", entity: "Staff", entityId: staff.id, summary: staff.name });
  revalidatePublic();
}

/**
 * Isi foto untuk rute publik. Hanya foto milik staf AKTIF, `showOnWebsite`, berperan dokter/terapis yang `photoUrl`-nya sama
 * persis dengan nama ini; selain itu null. Jalur yang tidak terdaftar di basis data tidak pernah dibaca dari disk.
 */
export async function findPublicDoctorPhoto(name: string): Promise<Buffer | null> {
  const safe = doctorPhotoName(doctorPhotoUrl(String(name ?? "")));
  if (!safe) return null;
  const owner = await prisma.staff.findFirst({
    where: { photoUrl: doctorPhotoUrl(safe), isActive: true, showOnWebsite: true, role: { in: ["DOKTER", "TERAPIS"] } },
    select: { id: true },
  });
  if (!owner) return null;
  try {
    return await readDoctorPhotoFile(safe);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Perluas `src/server/staff.ts`**

Impor tambahan: `import { validateBio, validateSpecialty } from "@/lib/doctor-profile";` dan `import { removeStaffPhotoFor } from "@/server/staff-photo";`.

`StaffRow` (ganti definisi) dan `listStaffAccounts` (tambahkan tiga bidang di `rows.map`):

```ts
export type StaffRow = {
  id: string;
  name: string;
  role: StaffRole;
  showOnWebsite: boolean;
  isActive: boolean;
  email: string | null;
  mustChangePassword: boolean;
  /** Profil di halaman publik (spec profil dokter). */
  specialty: string | null;
  bio: string | null;
  photoUrl: string | null;
};
```

```ts
    email: row.user?.email ?? null,
    mustChangePassword: row.user?.mustChangePassword ?? false,
    specialty: row.specialty,
    bio: row.bio,
    photoUrl: row.photoUrl,
```

`revalidateStaff` (ganti isinya): menyegarkan juga beranda:

```ts
function revalidateStaff() {
  safeRevalidatePath("/admin/staf");
  safeRevalidatePath("/tentang");
  safeRevalidatePath("/");
}
```

`updateStaff`: ganti tanda tangan dan bagian data/ringkasan dengan:

```ts
export async function updateStaff(input: {
  id: string;
  name: string;
  role: StaffRole;
  showOnWebsite: boolean;
  /** Profil situs publik; tidak dikirim berarti tidak berubah. */
  specialty?: string;
  bio?: string;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const name = validateStaffName(input?.name);
    if (!name.ok) throw new UserFacingError(name.message);
    if (!isStaffRole(input?.role)) throw new UserFacingError("Pilih peran.");
    const role = input.role;
    const specialty = input.specialty === undefined ? undefined : validateSpecialty(input.specialty);
    if (specialty && !specialty.ok) throw new UserFacingError(specialty.message);
    const bio = input.bio === undefined ? undefined : validateBio(input.bio);
    if (bio && !bio.ok) throw new UserFacingError(bio.message);

    const summary = await prisma.$transaction(async (tx) => {
      await lockSuperAdmins(tx);
      const target = await tx.staff.findUnique({ where: { id: String(input.id ?? "") }, include: { user: { select: { id: true } } } });
      if (!target) throw new UserFacingError(NOT_FOUND);
      if (role !== target.role) {
        const block = staffChangeBlock({
          actorStaffId: actor.staffId,
          target: { id: target.id, role: target.role, isActive: target.isActive, hasLogin: target.user !== null },
          change: { kind: "role", to: role },
          activeSuperAdminsWithLogin: await countActiveSuperAdminsWithLogin(tx),
        });
        if (block) throw new UserFacingError(block);
      }
      const nextSpecialty = specialty && specialty.ok ? specialty.value : target.specialty;
      const nextBio = bio && bio.ok ? bio.value : target.bio;
      await tx.staff.update({
        where: { id: target.id },
        data: { name: name.value, role, showOnWebsite: Boolean(input.showOnWebsite), specialty: nextSpecialty, bio: nextBio },
      });
      if (target.user && name.value !== target.name) await tx.user.update({ where: { id: target.user.id }, data: { name: name.value } });
      const base = role === target.role ? name.value : `${name.value} (${STAFF_ROLE_LABEL[target.role]} → ${STAFF_ROLE_LABEL[role]})`;
      // Ringkasan audit tidak memuat isi spesialisasi atau deskripsi, hanya bahwa profil berubah.
      return nextSpecialty !== target.specialty || nextBio !== target.bio ? `${base} · profil situs diubah` : base;
    });

    await recordAudit({ actor, action: "staff.update", entity: "Staff", entityId: input.id, summary });
    revalidateStaff();
  });
}
```

Tambahkan di akhir berkas:

```ts
export async function removeStaffPhoto(staffId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    await removeStaffPhotoFor(actor, String(staffId ?? ""));
  });
}
```

`setStaffActive` memanggil `revalidateStaff()` yang dulu juga menyegarkan `/tentang`; karena fungsi itu kini juga menyegarkan `/`, tidak ada perubahan lain di sana.

`tests/unit/components/staff-manager.test.tsx`: di fungsi `row()` (baris `const row = (patch: Partial<StaffRow>): StaffRow => ({ … })`) tambahkan `specialty: null, bio: null, photoUrl: null,` ke objek bawaan. Tidak ada harapan uji yang berubah di tugas ini.

- [ ] **Step 4: Jalankan uji (GREEN)**

Run: `npx tsc --noEmit -p . && npm run test:integration -- tests/integration/staff-profile.test.ts tests/integration/staff-accounts.test.ts`
Expected: PASS (13 uji profil + uji staf lama). Uji "audit yang gagal…" memakai tiruan `@/server/audit` berbendera (pola yang sama dengan `tests/integration/bia-upload.test.ts`).

- [ ] **Step 5: Verifikasi tugas dan commit**

Run: `npx eslint src tests && npx vitest run tests/unit/components/staff-manager.test.tsx tests/unit/architecture.test.ts`
Expected: lulus.

```bash
git add src/server/staff-photo.ts src/server/staff.ts tests/integration/staff-profile.test.ts tests/unit/components/staff-manager.test.tsx
git commit -m "feat: edit doctor specialty, bio, and photo through the staff server code"
```


---

### Task 4: Rute unggah (panel) dan rute foto publik

**Files:**
- Create: `src/app/(admin)/admin/staf/foto/route.ts`
- Create: `src/app/(public)/foto-dokter/[nama]/route.ts`
- Test: `tests/integration/staff-photo-routes.test.ts` (baru)

**Interfaces:**
- Consumes: `uploadStaffPhoto`, `findPublicDoctorPhoto` (Task 3); `isSameOrigin` (Task 1); `DOCTOR_PHOTO_MAX_BYTES`; `getCurrentStaff` dan `can`.
- Produces: `POST /admin/staf/foto` (multipart: `staffId`, satu berkas `file`) → JSON `{ ok: true; photoUrl: string } | { ok: false; error: string }` dengan status 200/400/401/403/413/422/500; `GET /foto-dokter/<nama>` → isi WebP atau 404.

- [ ] **Step 1: Tulis uji rute (RED)**

`tests/integration/staff-photo-routes.test.ts`:

```ts
// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/(admin)/admin/staf/foto/route";
import { GET } from "@/app/(public)/foto-dokter/[nama]/route";
import { prisma } from "@/lib/db";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS";
const { state } = vi.hoisted(() => ({ state: { staff: null as null | { userId: string; staffId: string; name: string; role: Role; email: string } } }));
vi.mock("@/server/session", () => ({ getCurrentStaff: vi.fn(async () => state.staff) }));
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "rutefoto";
const ORIGIN = "https://sundyclinic.com";
const as = (role: Role | null) => {
  state.staff = role ? { userId: "u", staffId: "s-aktor", name: "Pemilik Rute", role, email: "rute@sundy.test" } : null;
};
const png = (color = "#c8a97e", width = 800, height = 1000) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

function form(staffId: string, bytes: Uint8Array, name = "dokter.png", type = "image/png") {
  const body = new FormData();
  body.set("staffId", staffId);
  body.set("file", new File([bytes as BlobPart], name, { type }));
  return body;
}
const post = (body: FormData | string, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/staf/foto`, { method: "POST", body, headers }));
const get = (name: string) => GET(new Request(`${ORIGIN}/foto-dokter/${name}`), { params: Promise.resolve({ nama: name }) });

describe("rute foto dokter", () => {
  let root: string;
  let doctorId: string;
  const previous = process.env.PATIENT_FILES_DIR;
  const upload = async (bytes: Uint8Array) => (await (await post(form(doctorId, bytes))).json()) as { ok: boolean; photoUrl?: string; error?: string };
  const nameOf = (photoUrl: string) => photoUrl.replace("/foto-dokter/", "");

  async function clean() {
    await prisma.staff.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await prisma.auditLog.deleteMany({ where: { actorName: "Pemilik Rute" } });
    await rm(path.join(root, "dokter"), { recursive: true, force: true });
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-rutefoto-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  beforeEach(async () => {
    await clean();
    doctorId = (await prisma.staff.create({ data: { slug: `${SLUG}-dokter`, name: "Dokter Rute", role: "DOKTER", showOnWebsite: true } })).id;
  });
  afterAll(async () => {
    await clean();
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("unggah: tanpa login 401, peran selain Super Admin 403, asal asing atau tanpa Origin 403, bukan multipart 400, isian kurang 400", async () => {
    as(null);
    expect((await post(form(doctorId, await png()))).status).toBe(401);
    as("DOKTER");
    expect((await post(form(doctorId, await png()))).status).toBe(403);
    as("RESEPSIONIS");
    expect((await post(form(doctorId, await png()))).status).toBe(403);
    as("SUPER_ADMIN");
    expect((await post(form(doctorId, await png()), { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form(doctorId, await png()), { host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form(doctorId, await png()), { origin: "https://jahat.example", host: "sundyclinic.com", "x-forwarded-host": "jahat.example" })).status).toBe(403);
    expect((await post("bukan multipart")).status).toBe(400);
    const noFile = new FormData();
    noFile.set("staffId", doctorId);
    expect((await post(noFile)).status).toBe(400);
    expect(await readdir(path.join(root, "dokter")).catch(() => [])).toEqual([]);
  });

  it("unggah: Super Admin berhasil; berkas ada, photoUrl terisi, jawaban memuat alamatnya", async () => {
    as("SUPER_ADMIN");
    const response = await post(form(doctorId, await png()));
    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean; photoUrl: string };
    expect(data.ok).toBe(true);
    expect(data.photoUrl).toMatch(new RegExp(`^/foto-dokter/${doctorId}-[0-9a-f]{8}\\.webp$`));
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: doctorId } })).photoUrl).toBe(data.photoUrl);
    expect(await readdir(path.join(root, "dokter"))).toEqual([nameOf(data.photoUrl)]);
  });

  it("unggah: berkas palsu 422 dengan pesan Indonesia, terlalu kecil 422, peran bukan dokter 422, staf tak dikenal 422; tidak ada yang berubah", async () => {
    as("SUPER_ADMIN");
    const fake = await post(form(doctorId, new TextEncoder().encode("<script>alert(1)</script>"), "foto.jpg", "image/jpeg"));
    expect(fake.status).toBe(422);
    expect(await fake.json()).toEqual({ ok: false, error: "Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP." });
    const small = await post(form(doctorId, await png("#ffffff", 500, 700)));
    expect(small.status).toBe(422);
    expect(await small.json()).toEqual({ ok: false, error: "Foto terlalu kecil. Sisi terpendek minimal 600 px." });
    const reception = await prisma.staff.create({ data: { slug: `${SLUG}-resepsionis`, name: "Resepsionis Rute", role: "RESEPSIONIS" } });
    expect(await (await post(form(reception.id, await png()))).json()).toEqual({ ok: false, error: "Foto hanya untuk dokter dan terapis." });
    expect(await (await post(form("tidak-ada", await png()))).json()).toEqual({ ok: false, error: "Staf tidak ditemukan." });
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: doctorId } })).photoUrl).toBeNull();
    expect(await readdir(path.join(root, "dokter")).catch(() => [])).toEqual([]);
  });

  it("unggah: isi yang jelas terlalu besar ditolak 413 sebelum dibaca; berkas lebih dari 8 MB juga 413", async () => {
    as("SUPER_ADMIN");
    const request = new Request(`${ORIGIN}/admin/staf/foto`, {
      method: "POST",
      body: form(doctorId, await png()),
      headers: { origin: ORIGIN, host: "sundyclinic.com", "content-length": String(20 * 1024 * 1024) },
    });
    const reading = vi.spyOn(request, "formData");
    const early = await POST(request);
    expect(early.status).toBe(413);
    expect(await early.json()).toEqual({ ok: false, error: "Foto terlalu besar (maks. 8 MB)." });
    expect(reading).not.toHaveBeenCalled();

    const big = await post(form(doctorId, new Uint8Array(8 * 1024 * 1024 + 1).fill(0xff), "besar.jpg", "image/jpeg"));
    expect(big.status).toBe(413);
  });

  it("publik: foto staf aktif yang tampil di situs disajikan tanpa login dengan header yang benar", async () => {
    as("SUPER_ADMIN");
    const { photoUrl } = await upload(await png());
    as(null);
    const response = await get(nameOf(photoUrl!));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("RIFF");
    expect(Buffer.from(bytes.slice(8, 12)).toString()).toBe("WEBP");
    expect([...bytes]).toEqual([...(await readFile(path.join(root, "dokter", nameOf(photoUrl!))))]);
  });

  it("publik: 404 untuk staf yang disembunyikan, nonaktif, atau bukan dokter/terapis; berkasnya tetap ada di disk", async () => {
    as("SUPER_ADMIN");
    const { photoUrl } = await upload(await png());
    const name = nameOf(photoUrl!);
    await prisma.staff.update({ where: { id: doctorId }, data: { showOnWebsite: false } });
    expect((await get(name)).status).toBe(404);
    await prisma.staff.update({ where: { id: doctorId }, data: { showOnWebsite: true, isActive: false } });
    expect((await get(name)).status).toBe(404);
    await prisma.staff.update({ where: { id: doctorId }, data: { isActive: true, role: "RESEPSIONIS" } });
    expect((await get(name)).status).toBe(404);
    expect(await readdir(path.join(root, "dokter"))).toEqual([name]);
    await prisma.staff.update({ where: { id: doctorId }, data: { role: "DOKTER" } });
    expect((await get(name)).status).toBe(200);
  });

  it("publik: nama berpola salah, upaya keluar folder, dan nama yang tidak terdaftar semuanya 404 tanpa menyentuh disk", async () => {
    const response404 = await get("tidak-terdaftar-0a1b2c3d.webp");
    expect(response404.status).toBe(404);
    expect(response404.headers.get("cache-control")).toBe("no-store");
    for (const bad of ["../x-0a1b2c3d.webp", "..%2F..%2Fetc%2Fpasswd", "abc.png", "ABC-0A1B2C3D.webp", "", "a/b-0a1b2c3d.webp"]) {
      expect((await get(bad)).status).toBe(404);
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/staff-photo-routes.test.ts`
Expected: FAIL (rute belum ada).

- [ ] **Step 2: Implementasi rute unggah**

`src/app/(admin)/admin/staf/foto/route.ts`:

```ts
import { UserFacingError } from "@/lib/action-result";
import { DOCTOR_PHOTO_MAX_BYTES } from "@/lib/doctor-profile";
import { can } from "@/lib/permissions";
import { isSameOrigin } from "@/server/same-origin";
import { getCurrentStaff } from "@/server/session";
import { uploadStaffPhoto } from "@/server/staff-photo";

export const dynamic = "force-dynamic";

const json = (body: { ok: true; photoUrl: string } | { ok: false; error: string }, status: number) => Response.json(body, { status });
const TOO_BIG = "Foto terlalu besar (maks. 8 MB).";

/** Satu foto profil staf per permintaan (spec profil dokter 4 dan 6). Pemeriksaan hak diulang oleh pemanggil layanan lewat peran pelaku. */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return json({ ok: false, error: "Masuk dulu." }, 401);
  if (!can(staff.role, "staff:manage")) return json({ ok: false, error: "Anda tidak berhak mengubah foto staf." }, 403);
  if (!isSameOrigin(request)) return json({ ok: false, error: "Permintaan tidak sah." }, 403);

  // Tolak sebelum isinya dibaca ke memori (+ sedikit ruang untuk bidang formulir).
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > DOCTOR_PHOTO_MAX_BYTES + 512 * 1024) return json({ ok: false, error: TOO_BIG }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Permintaan bukan unggahan berkas." }, 400);
  }
  const staffId = form.get("staffId");
  const file = form.get("file");
  if (typeof staffId !== "string" || !(file instanceof File)) return json({ ok: false, error: "Pilih foto yang akan diunggah." }, 400);
  if (file.size > DOCTOR_PHOTO_MAX_BYTES) return json({ ok: false, error: TOO_BIG }, 413);

  try {
    const saved = await uploadStaffPhoto({ actor: staff, staffId, bytes: new Uint8Array(await file.arrayBuffer()) });
    return json({ ok: true, photoUrl: saved.photoUrl }, 200);
  } catch (error) {
    if (error instanceof UserFacingError) return json({ ok: false, error: error.message }, 422);
    console.error("Gagal menyimpan foto staf", error);
    return json({ ok: false, error: "Gagal menyimpan foto. Coba lagi." }, 500);
  }
}
```

- [ ] **Step 3: Implementasi rute publik**

`src/app/(public)/foto-dokter/[nama]/route.ts`:

```ts
import { findPublicDoctorPhoto } from "@/server/staff-photo";

export const dynamic = "force-dynamic";

/**
 * Foto profil dokter untuk halaman publik (spec profil dokter 4.4). Tanpa login, tetapi hanya foto milik staf aktif yang tampil
 * di situs; nama berkas memuat sidik jari isinya sehingga aman di-cache selamanya.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const { nama } = await params;
  const bytes = await findPublicDoctorPhoto(nama);
  if (!bytes) return new Response("Foto tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 4: Jalankan uji (GREEN) dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npm run test:integration -- tests/integration/staff-photo-routes.test.ts && npx vitest run tests/unit/architecture.test.ts`
Expected: PASS (6 uji rute; arsitektur utuh: rute tidak mengimpor Prisma).

```bash
git add "src/app/(admin)/admin/staf/foto/route.ts" "src/app/(public)/foto-dokter" tests/integration/staff-photo-routes.test.ts
git commit -m "feat: upload doctor photos from the panel and serve them publicly for visible doctors only"
```

---

### Task 5: Layar — dialog Ubah dengan profil situs dan foto

**Files:**
- Create: `src/components/admin/staff/send-photo.ts`
- Create: `src/components/admin/staff/doctor-photo-field.tsx`
- Modify (ganti seluruh isi): `src/components/admin/staff/staff-form-dialog.tsx`
- Test: `tests/unit/staff-send-photo.test.ts` (baru), `tests/unit/components/doctor-photo-field.test.tsx` (baru), `tests/unit/components/staff-manager.test.tsx` (tambah/ubah)

**Interfaces:**
- Consumes: `removeStaffPhoto`, `updateStaff`, `createStaffWithAccount`, `StaffRow` (Task 3); `DOCTOR_PHOTO_ACCEPT`, `DOCTOR_PHOTO_MAX_BYTES`, `SPECIALTY_MAX`, `BIO_MAX`, `roleHasPublicProfile`; rute `POST /admin/staf/foto` (Task 4).
- Produces: `sendStaffPhoto(staffId: string, file: File): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }>`; `DoctorPhotoField({ staffId, photoUrl, onChange }: { staffId: string; photoUrl: string | null; onChange: (photoUrl: string | null) => void })`; dialog Ubah memuat bagian "Profil di halaman publik" (legenda) dengan isian berlabel `Spesialisasi` dan `Deskripsi singkat`.

- [ ] **Step 1: Tulis uji (RED)**

`tests/unit/staff-send-photo.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendStaffPhoto } from "@/components/admin/staff/send-photo";

const file = (size = 10, name = "dokter.png") => new File([new Uint8Array(size)], name, { type: "image/png" });
afterEach(() => vi.unstubAllGlobals());

describe("mengirim foto staf", () => {
  it("mengirim id staf dan berkas ke rute unggah dan mengembalikan alamat fotonya", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, photoUrl: "/foto-dokter/abc-0a1b2c3d.webp" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendStaffPhoto("s1", file())).toEqual({ ok: true, photoUrl: "/foto-dokter/abc-0a1b2c3d.webp" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/admin/staf/foto");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("staffId")).toBe("s1");
    expect((body.get("file") as File).name).toBe("dokter.png");
  });

  it("meneruskan pesan penolakan server, dan pesan umum bila jawaban bukan JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "Foto terlalu kecil. Sisi terpendek minimal 600 px." }, { status: 422 })));
    expect(await sendStaffPhoto("s1", file())).toEqual({ ok: false, error: "Foto terlalu kecil. Sisi terpendek minimal 600 px." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    expect(await sendStaffPhoto("s1", file())).toEqual({ ok: false, error: "Gagal mengunggah. Coba lagi." });
  });

  it("menolak berkas di atas 8 MB tanpa mengirimnya, dan melaporkan koneksi terputus", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendStaffPhoto("s1", file(8 * 1024 * 1024 + 1))).toEqual({ ok: false, error: "Foto terlalu besar (maks. 8 MB)." });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await sendStaffPhoto("s1", file())).toEqual({ ok: false, error: "Koneksi terputus. Coba lagi." });
  });
});
```

`tests/unit/components/doctor-photo-field.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorPhotoField } from "@/components/admin/staff/doctor-photo-field";
import { sendStaffPhoto } from "@/components/admin/staff/send-photo";
import { removeStaffPhoto } from "@/server/staff";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/admin/staff/send-photo", () => ({ sendStaffPhoto: vi.fn() }));
vi.mock("@/server/staff", () => ({ removeStaffPhoto: vi.fn() }));

const picture = () => new File(["x"], "dokter.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:pratinjau");
  URL.revokeObjectURL = vi.fn();
});

describe("isian foto dokter", () => {
  it("tanpa foto: keterangan, tombol Pilih foto, tanpa Hapus foto", () => {
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl={null} onChange={() => {}} />);
    expect(screen.getByText("Belum ada foto unggahan. Situs memakai foto bawaan bila ada.")).toBeInTheDocument();
    expect(screen.getByText(/Foto potret \(tegak\) paling bagus, minimal 600 px\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pilih foto" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus foto" })).toBeNull();
  });

  it("dengan foto: tampil di bingkai dan ada Hapus foto", () => {
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl="/foto-dokter/s1-0a1b2c3d.webp" onChange={() => {}} />);
    expect(screen.getByRole("img", { name: "Foto saat ini" })).toHaveAttribute("src", "/foto-dokter/s1-0a1b2c3d.webp");
    expect(screen.getByRole("button", { name: "Hapus foto" })).toBeInTheDocument();
  });

  it("memilih berkas menampilkan pratinjau dan tombol Pakai foto ini; Batal membuangnya", async () => {
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl="/foto-dokter/s1-0a1b2c3d.webp" onChange={() => {}} />);
    await user.upload(screen.getByLabelText("Berkas foto dokter"), picture());
    expect(screen.getByRole("img", { name: "Pratinjau foto baru" })).toHaveAttribute("src", "blob:pratinjau");
    expect(screen.getByText(/langsung tampil di situs saat dipakai, tanpa menunggu tombol Simpan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus foto" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("img", { name: "Pratinjau foto baru" })).toBeNull();
    expect(screen.getByRole("img", { name: "Foto saat ini" })).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pratinjau");
    expect(sendStaffPhoto).not.toHaveBeenCalled();
  });

  it("Pakai foto ini mengunggah, memberi tahu induknya, dan kembali ke tampilan foto", async () => {
    vi.mocked(sendStaffPhoto).mockResolvedValue({ ok: true, photoUrl: "/foto-dokter/s1-aaaaaaaa.webp" });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl={null} onChange={onChange} />);
    const file = picture();
    await user.upload(screen.getByLabelText("Berkas foto dokter"), file);
    await user.click(screen.getByRole("button", { name: "Pakai foto ini" }));
    await waitFor(() => expect(sendStaffPhoto).toHaveBeenCalledWith("s1", file));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/foto-dokter/s1-aaaaaaaa.webp"));
    expect(screen.queryByRole("button", { name: "Pakai foto ini" })).toBeNull();
  });

  it("penolakan server tampil di bawah pratinjau; pratinjau dan tombol tetap bisa dipakai lagi", async () => {
    vi.mocked(sendStaffPhoto).mockResolvedValue({ ok: false, error: "Foto terlalu kecil. Sisi terpendek minimal 600 px." });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl={null} onChange={onChange} />);
    await user.upload(screen.getByLabelText("Berkas foto dokter"), picture());
    await user.click(screen.getByRole("button", { name: "Pakai foto ini" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Foto terlalu kecil. Sisi terpendek minimal 600 px.");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pakai foto ini" })).toBeEnabled();
  });

  it("Hapus foto memanggil aksi dan memberi tahu induknya; galat server tampil", async () => {
    vi.mocked(removeStaffPhoto).mockResolvedValueOnce({ ok: false, error: "Staf ini belum punya foto unggahan." }).mockResolvedValueOnce({ ok: true, data: undefined });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl="/foto-dokter/s1-0a1b2c3d.webp" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Hapus foto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Staf ini belum punya foto unggahan.");
    await user.click(screen.getByRole("button", { name: "Hapus foto" }));
    await waitFor(() => expect(removeStaffPhoto).toHaveBeenLastCalledWith("s1"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });

  it("tombol Pilih foto bisa dipakai lewat papan ketik (Enter dan Spasi membuka pemilih berkas)", async () => {
    const opened = vi.spyOn(HTMLInputElement.prototype, "click");
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl={null} onChange={() => {}} />);
    screen.getByRole("button", { name: "Pilih foto" }).focus();
    await user.keyboard("{Enter}");
    expect(opened).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(opened).toHaveBeenCalledTimes(2);
    opened.mockRestore();
  });
});
```

`tests/unit/components/staff-manager.test.tsx`: lakukan perubahan berikut.
1. Di `vi.mock("@/server/staff", …)` tambahkan `removeStaffPhoto: vi.fn(),` dan tambahkan mock baru `vi.mock("@/components/admin/staff/send-photo", () => ({ sendStaffPhoto: vi.fn() }));`.
2. Ubah konstanta `DOKTER` menjadi: `const DOKTER = row({ id: "s-dokter", name: "Dr. Diane", role: "DOKTER", specialty: "Spesialis Gizi Klinik", bio: "Dokter penanggung jawab." });`.
3. Di uji `"Ubah: mengirim nama, peran, dan tampil di situs"`, ganti harapan pemanggilan menjadi: `expect(updateStaff).toHaveBeenCalledWith({ id: "s-dokter", name: "Dr. Diane", role: "DOKTER", showOnWebsite: true, specialty: "Spesialis Gizi Klinik", bio: "Dokter penanggung jawab." })` dan ubah namanya menjadi `"Ubah dokter: mengirim nama, peran, tampil di situs, spesialisasi, dan deskripsi"`.
4. Tambahkan blok uji berikut (di dalam `describe("aksi per baris", …)`):

```tsx
  it("Ubah dokter: bagian profil situs berisi spesialisasi, deskripsi dengan hitungan karakter, dan foto", async () => {
    vi.mocked(updateStaff).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Dr. Diane");
    await user.click(screen.getByRole("menuitem", { name: "Ubah" }));
    const form = await screen.findByRole("dialog", { name: "Ubah — Dr. Diane" });
    expect(within(form).getByText("Profil di halaman publik")).toBeInTheDocument();
    const specialty = within(form).getByLabelText("Spesialisasi");
    const bio = within(form).getByLabelText("Deskripsi singkat");
    expect(specialty).toHaveValue("Spesialis Gizi Klinik");
    expect(bio).toHaveValue("Dokter penanggung jawab.");
    expect(within(form).getByText("21/100")).toBeInTheDocument();
    expect(within(form).getByText("24/600")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Pilih foto" })).toBeInTheDocument();

    await user.clear(specialty);
    await user.type(specialty, "Spesialis Gizi");
    expect(within(form).getByText("14/100")).toBeInTheDocument();
    await user.clear(bio);
    await user.click(within(form).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith({ id: "s-dokter", name: "Dr. Diane", role: "DOKTER", showOnWebsite: false, specialty: "Spesialis Gizi", bio: "" }));
  });

  it("Ubah staf berperan lain: tanpa bagian profil situs, dan specialty/bio tidak dikirim (tidak mengosongkan profil)", async () => {
    vi.mocked(updateStaff).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Ubah" }));
    const form = await screen.findByRole("dialog", { name: "Ubah — Rina Baru" });
    expect(within(form).queryByText("Profil di halaman publik")).toBeNull();
    expect(within(form).queryByLabelText("Spesialisasi")).toBeNull();
    await user.click(within(form).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith({ id: "s-baru", name: "Rina Baru", role: "RESEPSIONIS", showOnWebsite: false }));
  });

  it("mengganti peran di dialog ke Dokter menampilkan bagian profil situs; ke peran lain menyembunyikannya", async () => {
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Ubah" }));
    const form = await screen.findByRole("dialog", { name: "Ubah — Rina Baru" });
    await user.selectOptions(within(form).getByLabelText("Peran"), "DOKTER");
    expect(within(form).getByLabelText("Spesialisasi")).toBeInTheDocument();
    await user.selectOptions(within(form).getByLabelText("Peran"), "APOTEKER");
    expect(within(form).queryByLabelText("Spesialisasi")).toBeNull();
  });
```

Run: `npx vitest run tests/unit/staff-send-photo.test.ts tests/unit/components/doctor-photo-field.test.tsx tests/unit/components/staff-manager.test.tsx`
Expected: FAIL (komponen belum ada; dialog belum memuat bagian profil).

- [ ] **Step 2: Implementasi pengirim dan isian foto**

`src/components/admin/staff/send-photo.ts`:

```ts
import { DOCTOR_PHOTO_MAX_BYTES } from "@/lib/doctor-profile";

export type PhotoResult = { ok: true; photoUrl: string } | { ok: false; error: string };

/** Satu foto per permintaan ke rute unggah panel (spec profil dokter 6). */
export async function sendStaffPhoto(staffId: string, file: File): Promise<PhotoResult> {
  if (file.size > DOCTOR_PHOTO_MAX_BYTES) return { ok: false, error: "Foto terlalu besar (maks. 8 MB)." };
  const body = new FormData();
  body.set("staffId", staffId);
  body.set("file", file);
  try {
    const response = await fetch("/admin/staf/foto", { method: "POST", body });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; photoUrl?: string; error?: string } | null;
    if (response.ok && data?.ok && data.photoUrl) return { ok: true, photoUrl: data.photoUrl };
    return { ok: false, error: data?.error ?? "Gagal mengunggah. Coba lagi." };
  } catch {
    return { ok: false, error: "Koneksi terputus. Coba lagi." };
  }
}
```

`src/components/admin/staff/doctor-photo-field.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DOCTOR_PHOTO_ACCEPT, DOCTOR_PHOTO_MIN_SIDE } from "@/lib/doctor-profile";
import { removeStaffPhoto } from "@/server/staff";
import { sendStaffPhoto } from "./send-photo";

/** Bingkai pratinjau 4:5 dengan sudut atas setengah lingkaran, cukup dekat dengan bingkai lengkung halaman publik untuk menunjukkan bagian yang terpotong. */
function ArchPreview({ src, alt }: { src: string; alt: string }) {
  return (
    <Box sx={{ width: 160, aspectRatio: "4 / 5", overflow: "hidden", borderRadius: "999px 999px 32px 32px", bgcolor: "action.hover", flexShrink: 0 }}>
      <Box component="img" src={src} alt={alt} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </Box>
  );
}

/**
 * Foto dokter di dialog Ubah (spec profil dokter 5.1). Alur: pilih berkas → pratinjau → "Pakai foto ini". Berbeda dari teks,
 * foto langsung terpublikasi saat dipakai dan tidak menunggu tombol Simpan; layar mengatakannya.
 */
export function DoctorPhotoField({ staffId, photoUrl, onChange }: { staffId: string; photoUrl: string | null; onChange: (photoUrl: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Alamat blob dilepas saat pilihan diganti, dibatalkan, atau dialog ditutup.
  useEffect(
    () => () => {
      if (candidate) URL.revokeObjectURL(candidate.preview);
    },
    [candidate],
  );

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCandidate({ file, preview: URL.createObjectURL(file) });
  }

  async function use() {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    const result = await sendStaffPhoto(staffId, candidate.file);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Foto diganti dan sudah tampil di situs.");
    setCandidate(null);
    onChange(result.photoUrl);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await removeStaffPhoto(staffId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Foto dihapus.");
      onChange(null);
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const shown = candidate?.preview ?? photoUrl;
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", flexWrap: "wrap", rowGap: 1.5 }}>
      {shown ? <ArchPreview src={shown} alt={candidate ? "Pratinjau foto baru" : "Foto saat ini"} /> : null}
      <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
        {!shown && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Belum ada foto unggahan. Situs memakai foto bawaan bila ada.
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Foto potret (tegak) paling bagus, minimal {DOCTOR_PHOTO_MIN_SIDE} px. Foto langsung tampil di situs saat dipakai, tanpa menunggu tombol Simpan.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          <Button variant="outlined" size="small" disabled={busy} onClick={() => input.current?.click()}>
            Pilih foto
          </Button>
          {candidate && (
            <>
              <Button variant="contained" size="small" disabled={busy} onClick={() => void use()}>
                Pakai foto ini
              </Button>
              <Button size="small" disabled={busy} onClick={() => setCandidate(null)}>
                Batal
              </Button>
            </>
          )}
          {!candidate && photoUrl && (
            <Button color="error" size="small" disabled={busy} onClick={() => void remove()}>
              Hapus foto
            </Button>
          )}
        </Stack>
        <input
          ref={input}
          hidden
          type="file"
          accept={DOCTOR_PHOTO_ACCEPT}
          aria-label="Berkas foto dokter"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            pick(file);
          }}
        />
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </Stack>
    </Stack>
  );
}
```

- [ ] **Step 3: Ganti seluruh isi `src/components/admin/staff/staff-form-dialog.tsx`**

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { StaffRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BIO_MAX, SPECIALTY_MAX, roleHasPublicProfile } from "@/lib/doctor-profile";
import { roleCanHaveLogin } from "@/lib/staff-accounts";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import { createStaffWithAccount, updateStaff, type Credentials, type StaffRow } from "@/server/staff";
import { SelectField } from "../mui/select-field";
import { DoctorPhotoField } from "./doctor-photo-field";

const ROLES = Object.keys(STAFF_ROLE_LABEL) as StaffRole[];

/**
 * Tambah staf (dengan akun bila perannya boleh) atau ubah nama, peran, tampil di situs, dan, untuk dokter dan terapis,
 * profil di halaman publik: spesialisasi, deskripsi, dan foto (spec kelola staf 5.1, spec profil dokter 5.1).
 */
export function StaffFormDialog({
  mode,
  row,
  onClose,
  onCredentials,
}: {
  mode: "add" | "edit";
  row?: StaffRow;
  onClose: () => void;
  onCredentials: (name: string, credentials: Credentials) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(row?.name ?? "");
  const [role, setRole] = useState<StaffRole>(row?.role ?? "RESEPSIONIS");
  const [showOnWebsite, setShowOnWebsite] = useState(row?.showOnWebsite ?? false);
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState(row?.specialty ?? "");
  const [bio, setBio] = useState(row?.bio ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(row?.photoUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const title = mode === "add" ? "Tambah staf" : `Ubah — ${row?.name ?? ""}`;
  const needsEmail = mode === "add" && roleCanHaveLogin(role);
  const hasProfile = mode === "edit" && roleHasPublicProfile(role);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "add") {
        const result = await createStaffWithAccount({ name, role, showOnWebsite, email: needsEmail ? email : undefined });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Staf ditambahkan.");
        router.refresh();
        if (result.data.credentials) onCredentials(name.trim(), result.data.credentials);
        else onClose();
        return;
      }
      // Profil situs hanya dikirim untuk dokter dan terapis: menyimpan staf berperan lain tidak boleh mengosongkannya.
      const result = await updateStaff({ id: row!.id, name, role, showOnWebsite, ...(hasProfile ? { specialty, bio } : {}) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Perubahan disimpan.");
      router.refresh();
      onClose();
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { component: "form", onSubmit: submit } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField id="staf-nama" label="Nama" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth />
          <SelectField id="staf-peran" label="Peran" value={role} onChange={(value) => setRole(value as StaffRole)}>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {STAFF_ROLE_LABEL[value]}
              </option>
            ))}
          </SelectField>
          <FormControlLabel control={<Switch checked={showOnWebsite} onChange={(e) => setShowOnWebsite(e.target.checked)} />} label="Tampil di situs publik" />
          {hasProfile && (
            <Stack component="fieldset" spacing={2} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
              <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
                Profil di halaman publik
              </Typography>
              <TextField
                id="staf-spesialisasi"
                label="Spesialisasi"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                helperText={`${specialty.length}/${SPECIALTY_MAX}`}
                slotProps={{ htmlInput: { maxLength: SPECIALTY_MAX } }}
                fullWidth
              />
              <TextField
                id="staf-deskripsi"
                label="Deskripsi singkat"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                helperText={`${bio.length}/${BIO_MAX}`}
                multiline
                minRows={3}
                slotProps={{ htmlInput: { maxLength: BIO_MAX } }}
                fullWidth
              />
              <DoctorPhotoField
                staffId={row!.id}
                photoUrl={photoUrl}
                onChange={(next) => {
                  setPhotoUrl(next);
                  router.refresh();
                }}
              />
            </Stack>
          )}
          {needsEmail && (
            <TextField
              id="staf-email"
              label="Email login"
              type="text"
              slotProps={{ htmlInput: { inputMode: "email" } }}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helperText="Kata sandi sementara dibuat otomatis dan tampil sekali setelah disimpan."
              fullWidth
            />
          )}
          {mode === "add" && !roleCanHaveLogin(role) && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Terapis tidak punya akun login.
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Batal</Button>
        <Button type="submit" variant="contained" disabled={pending}>
          {mode === "add" ? "Tambah staf" : "Simpan"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

Catatan: bila berkas `staff-form-dialog.tsx` di repositori sudah berbeda dari yang dulu ditulis Task 5 rencana kelola staf (mis. setelah branch perbaikan digabung), pertahankan semua perilaku lama (isian email, pesan Terapis, `noValidate` tidak dipakai) dan hanya tambahkan bagian profil di atas; uji `staff-manager` yang sudah ada menjadi penjaganya.

- [ ] **Step 4: Jalankan uji (GREEN)**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run tests/unit/staff-send-photo.test.ts tests/unit/components/doctor-photo-field.test.tsx tests/unit/components/staff-manager.test.tsx tests/unit/architecture.test.ts`
Expected: PASS (3 + 7 + staff-manager lama dan 3 baru). Bila `getByText("21/100")` menemukan lebih dari satu elemen, periksa bahwa hanya satu isian yang memuat hitungan itu; jangan melonggarkan uji.

- [ ] **Step 5: Verifikasi tugas dan commit**

Run: `npx vitest run tests/unit/components`
Expected: lulus (uji komponen yang kena batas 5 detik karena beban mesin dijalankan ulang sendirian sebelum disimpulkan sebagai regresi).

```bash
git add src/components/admin/staff/send-photo.ts src/components/admin/staff/doctor-photo-field.tsx src/components/admin/staff/staff-form-dialog.tsx tests/unit/staff-send-photo.test.ts tests/unit/components/doctor-photo-field.test.tsx tests/unit/components/staff-manager.test.tsx
git commit -m "feat: edit doctor specialty, bio, and photo from the staff dialog with a frame preview"
```

---

### Task 6: E2E, runbook, dan verifikasi akhir

**Files:**
- Create: `tests/e2e/profil-dokter.spec.ts`
- Modify: `docs/operasional/server-sundy.md` (bagian 7)

**Interfaces:**
- Consumes: semua tugas sebelumnya; `signIn` (`tests/e2e/helpers/quiz`), `tungguHidrasi` (`tests/e2e/helpers/mui`), `E2E_ADMIN`. Email akun uji berawalan `e2e-staf-` agar ikut dibersihkan `prepare-db.mts` (pembersih yang sama dengan `kelola-staf.spec.ts`).
- Produces: —

- [ ] **Step 1: Tulis uji E2E**

`tests/e2e/profil-dokter.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { E2E_ADMIN } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

test.setTimeout(240_000);

test("pemilik mengedit profil dokter: teks dan foto tampil di /tentang; setelah disembunyikan fotonya tidak bisa dibuka", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `Dr. Profil ${suffix}`;
  const specialty = `Spesialis Uji ${suffix}`;
  const bio = `Deskripsi uji ${suffix}.`;
  const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#c8a97e" } }).png().toBuffer();

  // Tambah dokter yang tampil di situs.
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/staf");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Tambah staf" }).click();
  const add = page.getByRole("dialog", { name: "Tambah staf" });
  await add.getByLabel("Nama").fill(name);
  await add.getByLabel("Peran").selectOption("DOKTER");
  await add.getByLabel("Tampil di situs publik").check();
  await add.getByLabel("Email login").fill(`e2e-staf-profil-${suffix}@sundy.test`.toLowerCase());
  await add.getByRole("button", { name: "Tambah staf" }).click();
  await page.getByRole("dialog", { name: `Kata sandi sementara — ${name}` }).getByRole("button", { name: "Tutup" }).click();

  // Ubah: spesialisasi, deskripsi, dan foto.
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Ubah" }).click();
  const edit = page.getByRole("dialog", { name: `Ubah — ${name}` });
  await edit.getByLabel("Spesialisasi").fill(specialty);
  await edit.getByLabel("Deskripsi singkat").fill(bio);
  await edit.getByLabel("Berkas foto dokter").setInputFiles({ name: "dokter.png", mimeType: "image/png", buffer: photo });
  await expect(edit.getByRole("img", { name: "Pratinjau foto baru" })).toBeVisible();
  await edit.getByRole("button", { name: "Pakai foto ini" }).click();
  await expect(page.getByText("Foto diganti dan sudah tampil di situs.")).toBeVisible({ timeout: 30_000 });
  await edit.getByRole("button", { name: "Simpan" }).click();
  await expect(edit).toBeHidden({ timeout: 30_000 });

  // Halaman publik menampilkan teks dan fotonya.
  await page.goto("/tentang");
  const profile = page.getByRole("article").filter({ hasText: name });
  await expect(profile.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
  await expect(profile).toContainText(specialty);
  await expect(profile).toContainText(bio);
  const image = profile.getByRole("img", { name });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const src = (await image.getAttribute("src")) ?? "";
  const photoUrl = decodeURIComponent(new URL(src, "http://localhost").searchParams.get("url") ?? src);
  expect(photoUrl).toMatch(/^\/foto-dokter\/[0-9a-z]+-[0-9a-f]{8}\.webp$/);

  // Rute foto melayani tanpa login dengan cache panjang.
  const direct = await request.get(photoUrl);
  expect(direct.status()).toBe(200);
  expect(direct.headers()["content-type"]).toBe("image/webp");
  expect(direct.headers()["cache-control"]).toContain("immutable");

  // Disembunyikan dari situs: fotonya tidak bisa dibuka lagi dan dokternya hilang dari halaman.
  await page.goto("/admin/staf");
  await tungguHidrasi(page);
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Ubah" }).click();
  const hide = page.getByRole("dialog", { name: `Ubah — ${name}` });
  await hide.getByLabel("Tampil di situs publik").uncheck();
  await hide.getByRole("button", { name: "Simpan" }).click();
  await expect(hide).toBeHidden({ timeout: 30_000 });
  expect((await request.get(photoUrl)).status()).toBe(404);
  await page.goto("/tentang");
  await expect(page.getByRole("heading", { name })).toHaveCount(0);

  // Hapus foto dari dokter yang sudah disembunyikan (memastikan tombol Hapus foto bekerja di dialog).
  await page.goto("/admin/staf");
  await tungguHidrasi(page);
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Ubah" }).click();
  const remove = page.getByRole("dialog", { name: `Ubah — ${name}` });
  await remove.getByRole("button", { name: "Hapus foto" }).click();
  await expect(page.getByText("Foto dihapus.")).toBeVisible({ timeout: 30_000 });
  await expect(remove.getByText("Belum ada foto unggahan. Situs memakai foto bawaan bila ada.")).toBeVisible();
});
```

- [ ] **Step 2: Jalankan E2E per proyek**

Run (satu per proyek, laptop 8 GB): `npx playwright test tests/e2e/profil-dokter.spec.ts --project=desktop --workers=1 > $WS/e2e-d.log 2>&1; tail -20 $WS/e2e-d.log`, lalu `--project=mobile`.
Expected: `1 passed` di keduanya. Bila gambar tidak termuat di server dev (`naturalWidth` 0), periksa `$WS/e2e-d.log` dan keluaran server: itu tanda pengoptimal gambar Next.js tidak bisa membaca rute; pasang `unoptimized={image.src.startsWith("/foto-dokter/")}` pada `<Image>` di `src/components/public/arch-image.tsx`, tambahkan satu uji unit untuk prop itu, dan catat sebagai Ruling. Bila gagal karena klik sebelum hidrasi, tambahkan `tungguHidrasi` (bukan menambah batas waktu).

Run juga spek yang menyentuh halaman Staf atau halaman publik dokter: `npx playwright test tests/e2e/kelola-staf.spec.ts tests/e2e/tampilan-admin.spec.ts --project=desktop --workers=1` dan `grep -ln "tentang\|Tim Dokter" tests/e2e/*.spec.ts` lalu jalankan spek yang ditemukan.
Expected: lulus.

- [ ] **Step 3: Runbook**

`docs/operasional/server-sundy.md`, bagian 7 (Backup), tepat sebelum baris "Konfigurasi rclone", tambahkan:

```markdown
**Foto dokter di halaman publik** ada di `/www/sundy-files/dokter/` (berkas WebP `<idStaf>-<sidikJari>.webp`, dibuat dari panel: Staf → Ubah)
dan ikut `file-pasien.tar.gz`. Berkas ini publik lewat `/foto-dokter/<nama>`, tetapi hanya untuk staf aktif yang tampil di situs. Foto lama
dihapus otomatis saat diganti atau dihapus; tidak ada yang perlu dibersihkan manual. Foto bawaan situs ada di repositori (`public/images/dokter`).
```

- [ ] **Step 4: Verifikasi akhir dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > $WS/unit.log 2>&1; tail -5 $WS/unit.log` → semua lulus (uji komponen yang kena batas waktu karena beban mesin dijalankan sendirian). Integrasi terpisah dari E2E: `npm run test:integration > $WS/int.log 2>&1; tail -8 $WS/int.log` → lulus kecuali 3 uji lama `schedule.test.ts`.

```bash
git add tests/e2e/profil-dokter.spec.ts docs/operasional/server-sundy.md
git commit -m "test: cover editing public doctor profiles end to end and document the photo storage"
```

---

## Catatan rilis (bukan tugas; hanya atas permintaan pemilik)

- Tanpa migrasi. `deploy.sh kembali` aman: rilis lama tidak punya rute `/foto-dokter`, jadi foto unggahan tidak tampil sampai rilis baru kembali (teks tetap tampil).
- Folder `/www/sundy-files/dokter/` dibuat otomatis oleh aplikasi saat foto pertama diunggah (pemilik `sundyapp`).
- `sharp` sudah terpasang di server (0.35.4, WebP aktif) lewat Next.js; menjadikannya dependensi langsung tidak mengubah apa yang terpasang.
- Setelah rilis: pemilik membuka Staf → Ubah pada Dr. Diane, mengisi spesialisasi dan deskripsi bila perlu, mengunggah satu foto, lalu memeriksa `/tentang` dan beranda. **Periksa bahwa fotonya benar-benar tampil di produksi** (pengoptimal gambar Next.js membaca rute foto); bila tidak, terapkan cadangan `unoptimized` yang sama seperti catatan di Task 6 Step 2.
