# Plan 2 — Autentikasi & Fondasi Panel Admin SunDY

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun panel admin SunDY yang terlindungi login — kerangka navigasi, autentikasi staf, peran & hak akses, jejak audit, manajemen staf, dan penyuntingan layanan & harga — sehingga pemilik dapat mengubah harga promo sendiri tanpa developer.

**Architecture:** Panel admin hidup di dalam aplikasi Next.js yang sama dengan situs publik, dipisahkan lewat *route group* agar keduanya punya tata letak sendiri tanpa mengubah URL yang sudah tayang. Autentikasi memakai Better Auth dengan sesi tersimpan di PostgreSQL. Hak akses ditegakkan di sisi server pada setiap halaman dan setiap aksi, bukan disembunyikan di antarmuka. Komponen antarmuka dipasang lewat CLI shadcn (bukan disalin mentah), sementara susunan navigasi dan pola tabel diadaptasi dari proyek `Saas_MUA/frontend` milik pemilik.

**Tech Stack:** Next.js 15 App Router · Better Auth 1.7 · Prisma 7.10 · PostgreSQL (Neon) · shadcn/ui · Tailwind v4 · Zod 4 · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md` (PRD v1.4)

**Acuan rancangan:** `/Users/marchelinoraco/Documents/2026/Saas_MUA/frontend` — proyek MUA milik pemilik. Dipakai sebagai contoh susunan navigasi, pola data-table, dan alur form. **Bukan** untuk disalin mentah: proyek itu Vite + TanStack Router, sedangkan ini Next.js App Router.

**Plan berikutnya:** Plan 2b CRUD konten sisanya (paket, produk, cabang, FAQ) · Plan 3 mesin jadwal & booking · Plan 4 rekam medis, grafik progres & pengingat.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai **bahasa Inggris**. Bahasa Indonesia hanya untuk **teks yang dilihat pengguna** dan **segmen URL**.
- **Mata uang:** harga disimpan sebagai `Int` dalam **rupiah penuh**.
- **Zona waktu:** `Asia/Makassar` (WITA, UTC+8). `DateTime` disimpan UTC.
- **Prisma 7.10.0**, koneksi lewat `prisma.config.ts` (URL langsung) dan adapter Neon (URL pooled). Tidak ada `url`/`directUrl` di `schema.prisma`.
- **Node 22.20+** (`.nvmrc` sudah menetapkan 22).
- **Uji integrasi menunjuk branch `test` di Neon**, lewat `vitest.integration.config.mts`. Jangan pernah memetakan `TEST_*` ke `DATABASE_URL` di tempat lain.
- **Hak akses ditegakkan di server.** Menyembunyikan tombol di antarmuka bukan kontrol akses.
- **Resepsionis tidak boleh dapat mengambil isi catatan klinis** — ditegakkan sejak plan ini meski rekam medis baru dibangun di Plan 4.
- **Tidak ada data pasien di Plan 2.** Model rekam medis tidak dibuat di sini.
- Setiap task berakhir dengan commit berformat Conventional Commits berbahasa Inggris.

---

## Struktur Berkas

```
src/app/(public)/                  Route group situs publik — seluruh halaman yang
                                   sudah ada dipindahkan ke sini. URL tidak berubah.
  layout.tsx                       SiteHeader + SiteFooter + WhatsAppFab
  page.tsx, layanan/, produk/, lokasi/, tentang/, faq/, ...

src/app/(admin)/                   Route group panel admin — tanpa header publik
  masuk/page.tsx                   Halaman login
  admin/layout.tsx                 Kerangka: sidebar + header, wajib login
  admin/page.tsx                   Dasbor
  admin/staf/page.tsx              Manajemen staf
  admin/layanan/page.tsx           Penyuntingan layanan & harga

src/app/api/auth/[...all]/route.ts Route handler Better Auth

src/lib/auth.ts                    Konfigurasi Better Auth (server)
src/lib/auth-client.ts             Klien Better Auth (browser)
src/lib/permissions.ts             Peran, kemampuan, dan pemeriksanya — satu sumber kebenaran

src/server/session.ts              requireStaff() / requireCapability() untuk halaman & aksi
src/server/staff.ts                Query & aksi staf
src/server/service-admin.ts        Aksi tulis layanan (baca tetap di server/catalog.ts)
src/server/audit.ts                Pencatatan jejak audit

src/components/ui/                 Komponen shadcn, dipasang lewat CLI
src/components/admin/app-sidebar.tsx     Navigasi samping
src/components/admin/nav-user.tsx        Menu akun & keluar
src/components/admin/admin-header.tsx    Header dengan pemicu sidebar
src/components/admin/data-table.tsx      Tabel generik: pencarian, urutan, halaman

tests/unit/permissions.test.ts     Uji matriks hak akses
tests/integration/staff.test.ts    Uji query & aksi staf
tests/integration/audit.test.ts    Uji jejak audit
tests/integration/service-admin.test.ts  Uji penyuntingan harga
tests/e2e/admin.spec.ts            Uji ujung-ke-ujung login & proteksi rute
```

**Batasan:** `src/app/(public)/**` tidak boleh mengimpor apa pun dari `src/server/staff.ts`, `src/server/audit.ts`, atau `src/lib/auth.ts`. Uji arsitektur yang sudah ada diperluas untuk menegakkannya.

---

### Task 1: Pisahkan situs publik dan admin lewat route group

**Files:**
- Create: `src/app/(public)/layout.tsx`
- Move: seluruh isi `src/app/` (kecuali `layout.tsx`, `globals.css`, `favicon.ico`, `sitemap.ts`, `robots.ts`) ke `src/app/(public)/`
- Modify: `src/app/layout.tsx`
- Modify: `tests/unit/architecture.test.ts`

**Interfaces:**
- Consumes: `SiteHeader`, `SiteFooter`, `WhatsAppFab` dari Plan 1.
- Produces: root layout yang hanya memuat `<html>`, font, dan metadata dasar; layout publik yang memuat header/footer. URL publik **tidak berubah** — route group tidak muncul di URL.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan ke `tests/unit/architecture.test.ts`, dan pastikan `existsSync` ikut diimpor dari `node:fs` di baris paling atas berkas:

```ts
  it("menempatkan halaman publik di dalam route group (public)", () => {
    // Panel admin tidak boleh mewarisi header, footer, dan tombol WhatsApp
    // milik situs publik. Route group memisahkan tata letaknya tanpa
    // mengubah URL yang sudah tayang dan sudah terindeks.
    expect(existsSync("src/app/(public)/layout.tsx")).toBe(true);
    expect(existsSync("src/app/(public)/page.tsx")).toBe(true);
    expect(existsSync("src/app/page.tsx")).toBe(false);
  });

  it("tidak ada halaman publik yang mengimpor modul admin", () => {
    // Halaman publik tidak butuh sesi, staf, atau jejak audit. Mengimpornya
    // menarik kode autentikasi ke dalam berkas yang dilayani ke siapa pun,
    // dan membuka jalan bagi kebocoran yang tidak disengaja.
    const forbidden = ["@/server/session", "@/server/staff", "@/server/audit", "@/lib/auth"];

    const offenders = collectSourceFiles("src/app/(public)").filter((file) => {
      const source = readFileSync(file, "utf8");
      return forbidden.some((module) => source.includes(`from "${module}"`));
    });

    expect(offenders).toEqual([]);
  });
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/architecture.test.ts`
Expected: FAIL — `expected false to be true`.

- [ ] **Step 3: Pindahkan halaman publik**

```bash
cd src/app
mkdir -p "(public)"
git mv page.tsx layanan program-slimming produk lokasi tentang faq kebijakan-privasi syarat-ketentuan "(public)/"
cd ../..
```

`sitemap.ts` dan `robots.ts` tetap di `src/app/` — keduanya berlaku untuk seluruh situs, bukan hanya route group publik.

- [ ] **Step 4: Buat layout publik**

Buat `src/app/(public)/layout.tsx`:

```tsx
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <WhatsAppFab />
    </>
  );
}
```

- [ ] **Step 5: Kosongkan root layout dari elemen publik**

Ganti `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { CLINIC_BEAUTY_TAGLINE, CLINIC_FULL_NAME, CLINIC_NAME } from "@/lib/clinic";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cormorant",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: {
    default: `${CLINIC_FULL_NAME} — Manado`,
    template: `%s | ${CLINIC_NAME}`,
  },
  description: `${CLINIC_BEAUTY_TAGLINE}. Klinik nutrisi, slimming, dan perawatan estetika di Manado.`,
};

// Root layout hanya memegang <html>, font, dan metadata dasar. Header dan
// footer publik pindah ke (public)/layout.tsx agar panel admin tidak
// mewarisinya.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${display.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Jalankan seluruh uji dan pastikan LULUS**

Run: `npm test && npm run build`
Expected: PASS, dan build menampilkan rute yang sama persis seperti sebelumnya (`/`, `/layanan`, `/layanan/[slug]`, dan seterusnya) — tanpa `(public)` di URL mana pun.

- [ ] **Step 7: Pastikan situs publik masih utuh**

Run: `npm run test:e2e`
Expected: PASS — 18 uji. Bila ada yang gagal, berarti pemindahan merusak rute; perbaiki sebelum lanjut.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: split public and admin into route groups"
```

---

### Task 2: Model Staff menggantikan Doctor

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Modify: `src/server/catalog.ts`
- Modify: `src/app/(public)/tentang/page.tsx`
- Modify: `tests/integration/catalog.test.ts`, `tests/integration/seed.test.ts`
- Create: `tests/integration/staff-schema.test.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`.
- Produces: model `Staff` dengan enum `StaffRole` (`SUPER_ADMIN` | `DOKTER` | `TERAPIS` | `RESEPSIONIS`); `getActiveDoctors()` diganti `getPublicStaff(): Promise<Staff[]>` yang hanya mengembalikan staf berperan `DOKTER` dan `TERAPIS` dengan `showOnWebsite: true`.

- [ ] **Step 1: Tulis uji skema yang gagal**

Buat `tests/integration/staff-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("skema staf", () => {
  beforeEach(async () => {
    await prisma.staff.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("menyimpan peran staf", async () => {
    const staff = await prisma.staff.create({
      data: { slug: "terapis-satu", name: "Terapis Satu", role: "TERAPIS" },
    });
    expect(staff.role).toBe("TERAPIS");
  });

  it("menyembunyikan staf dari situs publik secara bawaan", async () => {
    // Resepsionis dan admin tidak seharusnya muncul di halaman "Tim Dokter".
    // Bawaannya tersembunyi agar menambah staf baru tidak pernah tidak
    // sengaja memublikasikan namanya.
    const staff = await prisma.staff.create({
      data: { slug: "resepsionis", name: "Resepsionis", role: "RESEPSIONIS" },
    });
    expect(staff.showOnWebsite).toBe(false);
  });

  it("menolak dua staf dengan slug sama", async () => {
    await prisma.staff.create({
      data: { slug: "diane-paparang", name: "Dr. Diane", role: "DOKTER" },
    });
    await expect(
      prisma.staff.create({
        data: { slug: "diane-paparang", name: "Diane Lain", role: "TERAPIS" },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/staff-schema.test.ts`
Expected: FAIL — `prisma.staff is undefined`.

- [ ] **Step 3: Ganti model Doctor dengan Staff**

Di `prisma/schema.prisma`, hapus seluruh blok `model Doctor` dan gantikan dengan:

```prisma
enum StaffRole {
  SUPER_ADMIN
  DOKTER
  TERAPIS
  RESEPSIONIS
}

model Staff {
  id        String    @id @default(cuid())
  slug      String    @unique
  name      String
  role      StaffRole
  sipNumber String?
  specialty String?
  photoUrl  String?
  bio       String?
  /// Ditampilkan di halaman "Tim Dokter" pada situs publik.
  /// Bawaannya false agar staf baru tidak pernah tidak sengaja terpublikasi.
  showOnWebsite Boolean @default(false)
  isActive      Boolean @default(true)
  sortOrder     Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([role, isActive])
}
```

- [ ] **Step 4: Jalankan migrasi**

```bash
# db:migrate menjalankan dua perintah berantai, sehingga `npm run db:migrate -- --name X`
# akan menempelkan --name pada `prisma generate`, bukan pada `migrate dev`.
npx prisma migrate dev --name replace_doctor_with_staff
npx prisma generate
npm run db:migrate:test
```

- [ ] **Step 5: Perbarui data awal**

Di `prisma/seed.ts`, ganti blok `doctors` menjadi:

```ts
const staff = [
  {
    slug: "diane-paparang",
    name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
    role: "DOKTER" as const,
    specialty: "Spesialis Gizi Klinik",
    bio: "Dokter penanggung jawab SunDY Clinic Manado untuk program slimming, nutrisi, dan perawatan estetika.",
    showOnWebsite: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    // Jumlah terapis belum dikonfirmasi pemilik (keputusan D11 pada PRD).
    // Satu terapis dipakai sebagai data awal agar jalur jadwal terapis
    // dapat diuji sejak sekarang.
    slug: "terapis-mahakeret",
    name: "Terapis SunDY Mahakeret",
    role: "TERAPIS" as const,
    showOnWebsite: false,
    isActive: true,
    sortOrder: 2,
  },
];
```

Lalu ganti bagian yang menulis dokter di dalam `seed()`:

```ts
    ...staff.map((person) =>
      prisma.staff.upsert({ where: { slug: person.slug }, update: person, create: person }),
    ),
```

- [ ] **Step 6: Ganti query publik**

Di `src/server/catalog.ts`, ganti `getActiveDoctors` menjadi:

```ts
/** Staf yang tampil di halaman "Tim Dokter". Resepsionis dan admin tidak termasuk. */
export async function getPublicStaff(): Promise<Staff[]> {
  return prisma.staff.findMany({
    where: { isActive: true, showOnWebsite: true, role: { in: ["DOKTER", "TERAPIS"] } },
    orderBy: { sortOrder: "asc" },
  });
}
```

Ganti impor tipe di baris pertama berkas dari `Doctor` menjadi `Staff`.

- [ ] **Step 7: Perbarui halaman tentang dan uji lama**

Di `src/app/(public)/tentang/page.tsx`, ganti `getActiveDoctors` menjadi `getPublicStaff` dan nama variabel `doctors` menjadi `team`.

Di `tests/integration/catalog.test.ts`, ganti uji dokter menjadi:

```ts
  it("menampilkan dokter di situs publik, tetapi tidak menampilkan terapis internal", async () => {
    const team = await getPublicStaff();
    expect(team.map((s) => s.name)).toContain("Dr. Diane Paparang, Sp.GK, AIFO-K");
    expect(team.map((s) => s.slug)).not.toContain("terapis-mahakeret");
  });
```

Perbarui impornya dari `getActiveDoctors` menjadi `getPublicStaff`.

Di `tests/integration/seed.test.ts`, ganti `prisma.doctor.findUnique` menjadi `prisma.staff.findUnique` dan tambahkan `expect(doctor?.role).toBe("DOKTER");`.

- [ ] **Step 8: Jalankan seluruh uji dan pastikan LULUS**

```bash
npm run db:seed
npm run test:integration && npm test && npx tsc --noEmit
```

Expected: PASS seluruhnya.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: replace Doctor with Staff carrying a role"
```

---

### Task 3: Matriks peran & hak akses

**Files:**
- Create: `src/lib/permissions.ts`
- Create: `tests/unit/permissions.test.ts`

**Interfaces:**
- Consumes: enum `StaffRole` dari Prisma.
- Produces:
  - `type Capability = "staff:manage" | "content:manage" | "booking:manage" | "schedule:manage" | "record:read" | "record:write" | "report:read" | "audit:read"`
  - `can(role: StaffRole, capability: Capability): boolean`
  - `CAPABILITIES_BY_ROLE: Record<StaffRole, readonly Capability[]>`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can, CAPABILITIES_BY_ROLE, type Capability } from "@/lib/permissions";

describe("hak akses", () => {
  it("memberi super admin seluruh kemampuan", () => {
    const all = new Set(Object.values(CAPABILITIES_BY_ROLE).flat());
    for (const capability of all) {
      expect(can("SUPER_ADMIN", capability)).toBe(true);
    }
  });

  it("melarang resepsionis membaca catatan klinis", () => {
    // Aturan paling penting di berkas ini. Resepsionis mengurus booking dan
    // data demografi, tetapi isi catatan dokter bukan haknya.
    expect(can("RESEPSIONIS", "record:read")).toBe(false);
    expect(can("RESEPSIONIS", "record:write")).toBe(false);
  });

  it("mengizinkan resepsionis mengurus booking dan jadwal", () => {
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
    expect(can("RESEPSIONIS", "schedule:manage")).toBe(true);
  });

  it("mengizinkan dokter membaca dan menulis catatan klinis", () => {
    expect(can("DOKTER", "record:read")).toBe(true);
    expect(can("DOKTER", "record:write")).toBe(true);
  });

  it("melarang dokter mengelola akun staf", () => {
    expect(can("DOKTER", "staff:manage")).toBe(false);
  });

  it("tidak memberi terapis akses apa pun ke panel", () => {
    // Terapis ada sebagai sumber daya jadwal, bukan sebagai pengguna panel.
    expect(CAPABILITIES_BY_ROLE.TERAPIS).toEqual([]);
  });

  it("hanya memberi super admin akses jejak audit", () => {
    const roles: Array<Parameters<typeof can>[0]> = [
      "DOKTER",
      "TERAPIS",
      "RESEPSIONIS",
    ];
    for (const role of roles) {
      expect(can(role, "audit:read")).toBe(false);
    }
    expect(can("SUPER_ADMIN", "audit:read")).toBe(true);
  });

  it("menolak kemampuan yang tidak dikenal", () => {
    expect(can("SUPER_ADMIN", "tidak:ada" as Capability)).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/permissions.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/permissions"`.

- [ ] **Step 3: Tulis matriks hak akses**

Buat `src/lib/permissions.ts`:

```ts
import type { StaffRole } from "@prisma/client";

/**
 * Kemampuan, bukan nama halaman.
 *
 * Halaman dan aksi bertanya "boleh melakukan apa", bukan "berperan apa".
 * Dengan begitu menambah peran baru cukup menambah satu baris di tabel ini,
 * tanpa memburu pemeriksaan peran yang tersebar di seluruh kode.
 */
export type Capability =
  | "staff:manage"
  | "content:manage"
  | "booking:manage"
  | "schedule:manage"
  | "record:read"
  | "record:write"
  | "report:read"
  | "audit:read";

export const CAPABILITIES_BY_ROLE: Record<StaffRole, readonly Capability[]> = {
  SUPER_ADMIN: [
    "staff:manage",
    "content:manage",
    "booking:manage",
    "schedule:manage",
    "record:read",
    "record:write",
    "report:read",
    "audit:read",
  ],

  // Dokter memegang rekam medis, tetapi tidak mengelola akun staf.
  DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write", "report:read"],

  // Resepsionis mengurus booking dan jadwal. Catatan klinis sengaja tidak ada
  // di daftar ini — lihat PRD bagian 4.
  RESEPSIONIS: ["booking:manage", "schedule:manage"],

  // Terapis adalah sumber daya jadwal, bukan pengguna panel. Ia punya baris
  // Staff agar dapat dijadwalkan, tanpa akses apa pun ke panel admin.
  TERAPIS: [],
};

export function can(role: StaffRole, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role]?.includes(capability) ?? false;
}
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/permissions.test.ts`
Expected: PASS — 8 uji.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add role capability matrix"
```

---

### Task 4: Better Auth & model User

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Modify: `prisma/schema.prisma`, `.env`, `.env.example`
- Create: `tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`; model `Staff` dari Task 2.
- Produces: `auth` (instance Better Auth) dari `@/lib/auth`; `authClient`, `signIn`, `signOut`, `useSession` dari `@/lib/auth-client`. Model `User` memiliki kolom `staffId` unik yang menautkannya ke `Staff`.

> **Kenapa User dan Staff terpisah.** `User` memegang kredensial dan sesi; `Staff` memegang identitas klinik yang tampil di situs publik. Digabung, satu `select` yang ceroboh di halaman publik bisa ikut membawa hash kata sandi. Terpisah, terapis yang tidak pernah login tetap punya baris `Staff` untuk dijadwalkan, tanpa akun.

- [ ] **Step 1: Pasang Better Auth dan buat secret**

```bash
npm install better-auth@1.7.5
```

Tambahkan ke `.env`:

```bash
echo "BETTER_AUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env
echo 'BETTER_AUTH_URL="http://localhost:3000"' >> .env
```

Tambahkan ke `.env.example` (tanpa nilai asli):

```
# Better Auth — hasilkan dengan: openssl rand -base64 32
BETTER_AUTH_SECRET="ganti-dengan-secret-32-karakter-atau-lebih"
BETTER_AUTH_URL="http://localhost:3000"
```

- [ ] **Step 2: Tulis konfigurasi auth**

Buat `src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // Tidak ada pendaftaran mandiri. Akun staf dibuat Super Admin dari panel;
    // klinik tidak menerima orang yang mendaftarkan dirinya sendiri.
    disableSignUp: true,
    minPasswordLength: 12,
  },

  session: {
    expiresIn: 60 * 60 * 8, // 8 jam — sekitar satu sif kerja
    updateAge: 60 * 60, // perpanjang paling sering satu jam sekali
  },

  user: {
    additionalFields: {
      staffId: { type: "string", required: false, input: false },
    },
  },
});
```

- [ ] **Step 3: Bangkitkan skema Better Auth**

```bash
npx @better-auth/cli@latest generate --config src/lib/auth.ts --output prisma/schema.prisma
```

Perintah ini menambahkan model `User`, `Session`, `Account`, dan `Verification` ke skema. Periksa hasilnya: model `User` harus punya kolom `staffId`.

Tambahkan relasi ke `Staff` secara manual pada model `User` hasil generate:

```prisma
  staffId String? @unique
  staff   Staff?  @relation(fields: [staffId], references: [id], onDelete: SetNull)
```

Dan pada model `Staff`, tambahkan sisi sebaliknya:

```prisma
  user User?
```

- [ ] **Step 4: Jalankan migrasi**

```bash
npx prisma migrate dev --name better_auth_tables
npx prisma generate
npm run db:migrate:test
```

- [ ] **Step 5: Buat route handler dan klien**

Buat `src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

Buat `src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 6: Tulis uji autentikasi**

Buat `tests/integration/auth.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

describe("autentikasi staf", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
    await prisma.staff.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createStaffUser(email: string, password: string) {
    const staff = await prisma.staff.create({
      data: { slug: `staf-${Date.now()}`, name: "Staf Uji", role: "RESEPSIONIS" },
    });
    const created = await auth.api.signUpEmail({
      body: { email, password, name: "Staf Uji" },
    });
    await prisma.user.update({
      where: { id: created.user.id },
      data: { staffId: staff.id },
    });
    return { staff, userId: created.user.id };
  }

  it("menerima kata sandi yang benar", async () => {
    await createStaffUser("resepsionis@sundy.test", "kataSandiPanjang123");

    const result = await auth.api.signInEmail({
      body: { email: "resepsionis@sundy.test", password: "kataSandiPanjang123" },
    });

    expect(result.user.email).toBe("resepsionis@sundy.test");
  });

  it("menolak kata sandi yang salah", async () => {
    await createStaffUser("resepsionis@sundy.test", "kataSandiPanjang123");

    await expect(
      auth.api.signInEmail({
        body: { email: "resepsionis@sundy.test", password: "kataSandiSalah999" },
      }),
    ).rejects.toThrow();
  });

  it("tidak pernah menyimpan kata sandi dalam bentuk terbaca", async () => {
    await createStaffUser("dokter@sundy.test", "kataSandiPanjang123");

    const accounts = await prisma.account.findMany();
    const stored = accounts.map((a) => a.password).join(" ");
    expect(stored).not.toContain("kataSandiPanjang123");
    expect(stored.length).toBeGreaterThan(0);
  });

  it("menolak kata sandi yang lebih pendek dari 12 karakter", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: "pendek@sundy.test", password: "pendek", name: "Pendek" },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 7: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/auth.test.ts`
Expected: PASS — 4 uji.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Better Auth with database sessions"
```

---

### Task 5: Penjaga sesi di sisi server

**Files:**
- Create: `src/server/session.ts`
- Create: `tests/integration/session.test.ts`

**Interfaces:**
- Consumes: `auth` dari `@/lib/auth`; `can` dari `@/lib/permissions`; `prisma`.
- Produces:
  - `type CurrentStaff = { userId: string; staffId: string; name: string; role: StaffRole; email: string }`
  - `getCurrentStaff(): Promise<CurrentStaff | null>`
  - `requireStaff(): Promise<CurrentStaff>` — melempar `redirect("/masuk")` bila belum login
  - `requireCapability(capability: Capability): Promise<CurrentStaff>` — melempar `forbidden()` bila tidak berhak

- [ ] **Step 1: Tulis penjaga sesi**

Buat `src/server/session.ts`:

```ts
import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import type { StaffRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, type Capability } from "@/lib/permissions";

export type CurrentStaff = {
  userId: string;
  staffId: string;
  name: string;
  role: StaffRole;
  email: string;
};

/**
 * Mengambil staf yang sedang login, atau null.
 *
 * Pengguna tanpa baris Staff yang aktif diperlakukan sebagai belum login.
 * Menonaktifkan staf di panel karena itu langsung mencabut aksesnya, tanpa
 * perlu menghapus akunnya atau menunggu sesinya kedaluwarsa.
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, staff: true },
  });

  if (!user?.staff || !user.staff.isActive) return null;

  return {
    userId: user.id,
    staffId: user.staff.id,
    name: user.staff.name,
    role: user.staff.role,
    email: user.email,
  };
}

export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/masuk");
  return staff;
}

/**
 * Dipanggil di awal setiap halaman admin dan setiap server action.
 * Menyembunyikan tombol di antarmuka bukan kontrol akses; ini kontrolnya.
 */
export async function requireCapability(capability: Capability): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!can(staff.role, capability)) forbidden();
  return staff;
}
```

- [ ] **Step 2: Aktifkan forbidden() di konfigurasi Next**

`forbidden()` berada di balik tanda fitur. Ubah `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Dibutuhkan oleh forbidden() di src/server/session.ts, yang memberi
    // respons 403 alih-alih mengalihkan staf berwenang ke halaman login.
    authInterrupts: true,
  },
};

export default nextConfig;
```

- [ ] **Step 3: Tulis uji penjaga sesi**

Buat `tests/integration/session.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("penjaga sesi", () => {
  it("memetakan peran ke kemampuan yang dipakai halaman admin", () => {
    // requireCapability() membutuhkan next/headers dan hanya berjalan di
    // dalam permintaan Next, jadi perilakunya diuji ujung-ke-ujung pada
    // Task 9. Yang diuji di sini adalah keputusan yang dipakainya.
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
    expect(can("RESEPSIONIS", "staff:manage")).toBe(false);
    expect(can("SUPER_ADMIN", "staff:manage")).toBe(true);
  });
});
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/session.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add server-side session and capability guards"
```

---

### Task 6: Jejak audit

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/server/audit.ts`
- Create: `tests/integration/audit.test.ts`

**Interfaces:**
- Consumes: `prisma`; `CurrentStaff` dari `@/server/session`.
- Produces: `recordAudit(input: { actor: CurrentStaff; action: string; entity: string; entityId: string; summary?: string }): Promise<void>`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/audit.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";

const actor = {
  userId: "user-uji",
  staffId: "staf-uji",
  name: "Staf Uji",
  role: "SUPER_ADMIN" as const,
  email: "uji@sundy.test",
};

describe("jejak audit", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("mencatat siapa melakukan apa terhadap entitas mana", async () => {
    await recordAudit({
      actor,
      action: "service.update",
      entity: "Service",
      entityId: "svc-1",
      summary: "Harga promo HIFU Wajah 499000 -> 459000",
    });

    const [entry] = await prisma.auditLog.findMany();
    expect(entry.actorStaffId).toBe("staf-uji");
    expect(entry.actorName).toBe("Staf Uji");
    expect(entry.action).toBe("service.update");
    expect(entry.entityId).toBe("svc-1");
    expect(entry.summary).toContain("499000");
  });

  it("menyimpan nama pelaku sebagai salinan, bukan hanya rujukan", async () => {
    // Permenkes 24/2022 menuntut jejak audit tetap terbaca. Bila staf dihapus
    // dan hanya ada rujukan id, catatannya kehilangan arti.
    await recordAudit({ actor, action: "staff.delete", entity: "Staff", entityId: "staf-lain" });

    const [entry] = await prisma.auditLog.findMany();
    expect(entry.actorName).toBe("Staf Uji");
    expect(entry.actorRole).toBe("SUPER_ADMIN");
  });

  it("mencatat waktu kejadian", async () => {
    const before = Date.now();
    await recordAudit({ actor, action: "staff.create", entity: "Staff", entityId: "baru" });

    const [entry] = await prisma.auditLog.findMany();
    expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/audit.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/audit"`.

- [ ] **Step 3: Tambahkan model AuditLog**

Tambahkan ke `prisma/schema.prisma`:

```prisma
/// Hanya-tambah. Tidak ada jalur di panel yang menyunting atau menghapus
/// baris di tabel ini — lihat Permenkes 24/2022 pada PRD bagian 10.
model AuditLog {
  id String @id @default(cuid())

  /// Identitas pelaku disalin, bukan sekadar dirujuk: bila staf dihapus,
  /// catatan audit harus tetap terbaca.
  actorStaffId String
  actorName    String
  actorRole    String

  action   String
  entity   String
  entityId String
  summary  String?

  createdAt DateTime @default(now())

  @@index([entity, entityId])
  @@index([actorStaffId, createdAt])
  @@index([createdAt])
}
```

- [ ] **Step 4: Jalankan migrasi**

```bash
npx prisma migrate dev --name audit_log
npx prisma generate
npm run db:migrate:test
```

- [ ] **Step 5: Tulis pencatat audit**

Buat `src/server/audit.ts`:

```ts
import { prisma } from "@/lib/db";
import type { CurrentStaff } from "@/server/session";

type AuditInput = {
  actor: CurrentStaff;
  action: string;
  entity: string;
  entityId: string;
  summary?: string;
};

/**
 * Mencatat satu peristiwa ke jejak audit.
 *
 * Identitas pelaku disalin apa adanya. Menyimpan hanya id berarti catatan
 * kehilangan makna begitu staf yang bersangkutan dihapus, padahal justru
 * catatan lama itu yang dibutuhkan saat ada yang dipertanyakan.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorStaffId: input.actor.staffId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      summary: input.summary,
    },
  });
}
```

- [ ] **Step 6: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/audit.test.ts`
Expected: PASS — 3 uji.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add append-only audit log"
```

---

### Task 7: Komponen antarmuka & kerangka panel admin

**Files:**
- Create: `components.json`
- Create: `src/components/ui/*` (dihasilkan CLI shadcn)
- Create: `src/components/admin/app-sidebar.tsx`, `nav-user.tsx`, `admin-header.tsx`
- Create: `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/page.tsx`
- Modify: `src/lib/utils.ts` (dibuat CLI bila belum ada)

**Interfaces:**
- Consumes: `requireStaff` dari `@/server/session`; `can` dari `@/lib/permissions`.
- Produces: komponen shadcn di `@/components/ui/*`; `AppSidebar`, `NavUser`, `AdminHeader`; rute `/admin` yang menuntut login.

> **Kenapa memakai CLI, bukan menyalin dari Saas_MUA.** Berkas di proyek itu ditulis untuk Vite dan mengimpor dari `@/lib/utils` versinya sendiri. CLI shadcn menghasilkan versi yang cocok untuk Next.js dan Tailwind v4 di proyek ini. Yang diambil dari Saas_MUA adalah **susunannya** — bagaimana sidebar, grup navigasi, dan header dirangkai — bukan berkasnya.

- [ ] **Step 1: Inisialisasi shadcn**

```bash
npx shadcn@latest init
```

Jawab: style **New York**, base color **Stone** (paling dekat dengan cokelat-krem SunDY), CSS variables **yes**.

- [ ] **Step 2: Pasang komponen yang dibutuhkan**

```bash
npx shadcn@latest add sidebar button input label form table dropdown-menu avatar separator sheet tooltip skeleton badge dialog alert-dialog select switch sonner
```

- [ ] **Step 3: Buat menu navigasi**

Buat `src/components/admin/app-sidebar.tsx`:

```tsx
import Link from "next/link";
import { CalendarClock, LayoutDashboard, Scissors, ShieldCheck, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { CLINIC_NAME } from "@/lib/clinic";
import { can, type Capability } from "@/lib/permissions";
import type { CurrentStaff } from "@/server/session";
import { NavUser } from "./nav-user";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard; needs?: Capability };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Utama",
    items: [
      { title: "Dasbor", url: "/admin", icon: LayoutDashboard },
      { title: "Booking", url: "/admin/booking", icon: CalendarClock, needs: "booking:manage" },
    ],
  },
  {
    title: "Kelola",
    items: [
      { title: "Layanan & Harga", url: "/admin/layanan", icon: Scissors, needs: "content:manage" },
      { title: "Staf", url: "/admin/staf", icon: Users, needs: "staff:manage" },
      { title: "Jejak Audit", url: "/admin/audit", icon: ShieldCheck, needs: "audit:read" },
    ],
  },
];

export function AppSidebar({ staff }: { staff: CurrentStaff }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/admin" className="px-2 py-1 font-display text-lg">
          {CLINIC_NAME}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          // Menu yang tidak berhak diakses tidak ditampilkan. Ini kenyamanan,
          // bukan keamanan — halamannya sendiri tetap memanggil
          // requireCapability(), karena URL bisa diketik langsung.
          const visible = group.items.filter((item) => !item.needs || can(staff.role, item.needs));
          if (visible.length === 0) return null;

          return (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <Link href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <NavUser staff={staff} />
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 4: Buat menu akun**

Buat `src/components/admin/nav-user.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth-client";
import type { CurrentStaff } from "@/server/session";

const ROLE_LABEL: Record<CurrentStaff["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  DOKTER: "Dokter",
  TERAPIS: "Terapis",
  RESEPSIONIS: "Resepsionis",
};

export function NavUser({ staff }: { staff: CurrentStaff }) {
  const router = useRouter();

  const initials = staff.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{staff.name}</span>
                <span className="truncate text-xs">{ROLE_LABEL[staff.role]}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs font-normal">{staff.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await signOut();
                router.push("/masuk");
                router.refresh();
              }}
            >
              <LogOut />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

- [ ] **Step 5: Buat header admin**

Buat `src/components/admin/admin-header.tsx`:

```tsx
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AdminHeader({ title }: { title: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-sm font-medium">{title}</h1>
    </header>
  );
}
```

- [ ] **Step 6: Buat layout dan dasbor admin**

Buat `src/app/(admin)/admin/layout.tsx`:

```tsx
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { requireStaff } from "@/server/session";

export const metadata = { title: "Panel Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Dijalankan untuk setiap halaman di bawah /admin. Satu tempat yang
  // memastikan tidak ada halaman admin yang lupa menuntut login.
  const staff = await requireStaff();

  return (
    <SidebarProvider>
      <AppSidebar staff={staff} />
      <SidebarInset>{children}</SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
```

Buat `src/app/(admin)/admin/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { requireStaff } from "@/server/session";

export default async function AdminDashboardPage() {
  const staff = await requireStaff();

  return (
    <>
      <AdminHeader title="Dasbor" />
      <div className="p-6">
        <h2 className="font-display text-3xl">Selamat datang, {staff.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Booking dan rekam medis dibangun pada tahap berikutnya. Untuk saat ini Anda dapat
          mengelola layanan, harga, dan staf lewat menu di samping.
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 7: Pastikan build berhasil**

Run: `npm run build`
Expected: rute `/admin` muncul sebagai dinamis (`ƒ`), bukan statis — karena memanggil sesi.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add admin shell with role-aware navigation"
```

---

### Task 8: Halaman login

**Files:**
- Create: `src/app/(admin)/masuk/page.tsx`
- Create: `src/components/admin/sign-in-form.tsx`
- Create: `tests/unit/components/sign-in-form.test.tsx`

**Interfaces:**
- Consumes: `signIn` dari `@/lib/auth-client`.
- Produces: rute `/masuk`; komponen `SignInForm`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/sign-in-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/admin/sign-in-form";

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn().mockResolvedValue({ error: null }) },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("SignInForm", () => {
  it("menampilkan kolom email dan kata sandi", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kata sandi/i)).toBeInTheDocument();
  });

  it("menyembunyikan kata sandi yang diketik", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/kata sandi/i)).toHaveAttribute("type", "password");
  });

  it("meminta email diisi sebelum mengirim", async () => {
    render(<SignInForm />);
    await userEvent.click(screen.getByRole("button", { name: /masuk/i }));
    expect(await screen.findByText(/email wajib diisi/i)).toBeInTheDocument();
  });

  it("tidak menyebut kolom mana yang salah saat kredensial ditolak", async () => {
    const { signIn } = await import("@/lib/auth-client");
    vi.mocked(signIn.email).mockResolvedValueOnce({ error: { message: "Invalid" } } as never);

    render(<SignInForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "staf@sundy.test");
    await userEvent.type(screen.getByLabelText(/kata sandi/i), "kataSandiPanjang123");
    await userEvent.click(screen.getByRole("button", { name: /masuk/i }));

    // Pesan sengaja tidak membedakan "email tidak ada" dari "kata sandi salah":
    // membedakannya memberi tahu penyerang email mana yang terdaftar.
    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent(/email atau kata sandi salah/i);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/components/sign-in-form.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Tulis form login**

Buat `src/components/admin/sign-in-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);

    if (!email) {
      setFieldError("Email wajib diisi.");
      return;
    }

    setPending(true);
    const result = await signIn.email({ email, password });
    setPending(false);

    if (result.error) {
      // Satu pesan untuk semua kegagalan. Membedakan "email tidak terdaftar"
      // dari "kata sandi salah" memberi tahu penyerang alamat mana yang ada.
      setFormError("Email atau kata sandi salah.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Kata Sandi</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Memproses…" : "Masuk"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Buat halaman login**

Buat `src/app/(admin)/masuk/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SignInForm } from "@/components/admin/sign-in-form";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { getCurrentStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Masuk",
  // Halaman login tidak boleh terindeks mesin pencari.
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  if (await getCurrentStaff()) redirect("/admin");

  return (
    <div className="flex min-h-svh items-center justify-center bg-cream-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-cream-300 bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl text-brown-900">Panel Admin</h1>
        <p className="mt-1 mb-6 text-sm text-brown-600">{CLINIC_FULL_NAME}</p>
        <SignInForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/components/sign-in-form.test.tsx`
Expected: PASS — 4 uji.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add staff sign-in page"
```

---

### Task 9: Manajemen staf

**Files:**
- Create: `src/lib/slug.ts`
- Create: `src/server/staff.ts`
- Create: `src/app/(admin)/admin/staf/page.tsx`
- Create: `src/components/admin/staff-table.tsx`
- Create: `tests/unit/slug.test.ts`, `tests/integration/staff.test.ts`

**Interfaces:**
- Consumes: `requireCapability`; `recordAudit`; `prisma`.
- Produces:
  - `slugify(name: string): string` dari `@/lib/slug`
  - `uniqueStaffSlug(name: string): Promise<string>`
  - `listStaff(): Promise<Staff[]>`
  - `createStaff(input: { name: string; role: StaffRole; slug: string; showOnWebsite?: boolean }): Promise<Staff>`
  - `setStaffActive(id: string, isActive: boolean): Promise<void>`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/staff.test.ts`:

Dua berkas uji, karena pembuat slug adalah fungsi murni sementara pemeriksaan keunikan menyentuh basis data.

Buat `tests/unit/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("membuat slug dari nama bergelar", () => {
    expect(slugify("Dr. Diane Paparang, Sp.GK, AIFO-K")).toBe("dr-diane-paparang-sp-gk-aifo-k");
  });

  it("merapikan spasi berlebih", () => {
    expect(slugify("Terapis   SunDY  Mahakeret")).toBe("terapis-sundy-mahakeret");
  });

  it("tidak menyisakan tanda hubung di ujung", () => {
    expect(slugify("  Siti Rahayu!  ")).toBe("siti-rahayu");
  });
});
```

Buat `tests/integration/staff.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { uniqueStaffSlug } from "@/server/staff";

describe("manajemen staf", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.staff.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("memakai slug apa adanya bila belum dipakai", async () => {
    expect(await uniqueStaffSlug("Siti Rahayu")).toBe("siti-rahayu");
  });

  it("menambahkan akhiran bila slug sudah dipakai", async () => {
    await prisma.staff.create({ data: { slug: "siti-rahayu", name: "Siti", role: "TERAPIS" } });
    expect(await uniqueStaffSlug("Siti Rahayu")).toBe("siti-rahayu-2");
  });

  it("terus menaikkan akhiran sampai menemukan yang kosong", async () => {
    await prisma.staff.create({ data: { slug: "siti-rahayu", name: "A", role: "TERAPIS" } });
    await prisma.staff.create({ data: { slug: "siti-rahayu-2", name: "B", role: "TERAPIS" } });
    expect(await uniqueStaffSlug("Siti Rahayu")).toBe("siti-rahayu-3");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/staff.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/staff"`.

- [ ] **Step 3: Tulis lapisan staf**

Buat `src/server/staff.ts`:

Buat `src/lib/slug.ts` lebih dulu — fungsi murni, tidak boleh berada di berkas server action:

```ts
/** Mengubah nama menjadi slug URL. Tanda baca gelar ikut dibersihkan. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

Lalu buat `src/server/staff.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { Staff, StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Slug yang belum dipakai staf lain.
 *
 * Berkas ini menyandang "use server", sehingga setiap ekspornya WAJIB berupa
 * fungsi async — Next.js menolak ekspor sinkron dari server action. Karena itu
 * `slugify` yang murni tinggal di src/lib/slug.ts, bukan di sini.
 */
export async function uniqueStaffSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  while (await prisma.staff.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

export async function listStaff(): Promise<Staff[]> {
  await requireCapability("staff:manage");
  return prisma.staff.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] });
}

export async function createStaff(input: {
  name: string;
  role: StaffRole;
  showOnWebsite?: boolean;
}): Promise<Staff> {
  const actor = await requireCapability("staff:manage");

  const slug = await uniqueStaffSlug(input.name);
  const created = await prisma.staff.create({
    data: {
      slug,
      name: input.name,
      role: input.role,
      showOnWebsite: input.showOnWebsite ?? false,
    },
  });

  await recordAudit({
    actor,
    action: "staff.create",
    entity: "Staff",
    entityId: created.id,
    summary: `${created.name} (${created.role})`,
  });

  revalidatePath("/admin/staf");
  return created;
}

export async function setStaffActive(id: string, isActive: boolean): Promise<void> {
  const actor = await requireCapability("staff:manage");

  const updated = await prisma.staff.update({ where: { id }, data: { isActive } });

  await recordAudit({
    actor,
    action: isActive ? "staff.activate" : "staff.deactivate",
    entity: "Staff",
    entityId: id,
    summary: updated.name,
  });

  revalidatePath("/admin/staf");
  revalidatePath("/tentang");
}
```

- [ ] **Step 4: Buat halaman staf**

Buat `src/app/(admin)/admin/staf/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { StaffTable } from "@/components/admin/staff-table";
import { listStaff } from "@/server/staff";
import { requireCapability } from "@/server/session";

export default async function StaffPage() {
  await requireCapability("staff:manage");
  const staff = await listStaff();

  return (
    <>
      <AdminHeader title="Staf" />
      <div className="p-6">
        <StaffTable staff={staff} />
      </div>
    </>
  );
}
```

Buat `src/components/admin/staff-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Staff } from "@prisma/client";

const ROLE_LABEL: Record<Staff["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  DOKTER: "Dokter",
  TERAPIS: "Terapis",
  RESEPSIONIS: "Resepsionis",
};

export function StaffTable({ staff }: { staff: Staff[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nama</TableHead>
          <TableHead>Peran</TableHead>
          <TableHead>Tampil di situs</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.map((person) => (
          <TableRow key={person.id}>
            <TableCell className="font-medium">{person.name}</TableCell>
            <TableCell>{ROLE_LABEL[person.role]}</TableCell>
            <TableCell>{person.showOnWebsite ? "Ya" : "Tidak"}</TableCell>
            <TableCell>
              <Badge variant={person.isActive ? "default" : "secondary"}>
                {person.isActive ? "Aktif" : "Nonaktif"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 5: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/slug.test.ts && npm run test:integration -- tests/integration/staff.test.ts && npx tsc --noEmit`
Expected: PASS — 3 uji unit dan 3 uji integrasi.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add staff management page"
```

---

### Task 10: Penyuntingan layanan & harga

**Files:**
- Create: `src/lib/price-validation.ts`
- Create: `src/server/service-admin.ts`
- Create: `src/app/(admin)/admin/layanan/page.tsx`
- Create: `src/components/admin/service-price-form.tsx`
- Create: `tests/unit/price-validation.test.ts`

**Interfaces:**
- Consumes: `requireCapability`; `recordAudit`; `getServiceCategoriesWithServices` dari `@/server/catalog`.
- Produces: `validatePriceChange(input: PriceInput): string | null` dari `@/lib/price-validation`; `updateServicePrice(input: PriceInput & { id: string }): Promise<void>`; `setServiceActive(id: string, isActive: boolean): Promise<void>`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/service-admin.test.ts`:

Validasi harga adalah fungsi murni, jadi ujinya uji unit — tidak perlu menyentuh basis data. Buat `tests/unit/price-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePriceChange } from "@/lib/price-validation";

describe("penyuntingan harga layanan", () => {
  it("menerima harga promo yang lebih murah dari harga normal", () => {
    expect(validatePriceChange({ normalPrice: 749000, promoPrice: 499000 })).toBeNull();
  });

  it("menolak harga promo yang lebih mahal dari harga normal", () => {
    // Harga coret yang lebih murah dari harga promo terlihat seperti
    // kesalahan di halaman publik, dan pasien yang menemukannya lebih dulu.
    expect(validatePriceChange({ normalPrice: 499000, promoPrice: 749000 })).toMatch(
      /harga promo/i,
    );
  });

  it("menolak harga nol atau negatif", () => {
    expect(validatePriceChange({ normalPrice: null, promoPrice: 0 })).toMatch(/lebih dari nol/i);
    expect(validatePriceChange({ normalPrice: null, promoPrice: -5000 })).toMatch(
      /lebih dari nol/i,
    );
  });

  it("menolak harga yang bukan bilangan bulat", () => {
    // Rupiah tidak punya sen. Pecahan di sini berarti ada yang salah hitung.
    expect(validatePriceChange({ normalPrice: null, promoPrice: 99000.5 })).toMatch(
      /bilangan bulat/i,
    );
  });

  it("menerima layanan tanpa harga coret", () => {
    expect(validatePriceChange({ normalPrice: null, promoPrice: 50000 })).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/price-validation.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/price-validation"`.

- [ ] **Step 3: Tulis aksi penyuntingan**

Buat `src/server/service-admin.ts`:

Buat `src/lib/price-validation.ts` lebih dulu — fungsi murni, tidak boleh berada di berkas server action:

```ts
export type PriceInput = { normalPrice: number | null; promoPrice: number };

/**
 * Mengembalikan pesan kesalahan, atau null bila harga sah.
 *
 * Tinggal di src/lib/ dan bukan di src/server/, karena berkas bertanda
 * "use server" hanya boleh mengekspor fungsi async.
 */
export function validatePriceChange({ normalPrice, promoPrice }: PriceInput): string | null {
  if (!Number.isInteger(promoPrice)) {
    return "Harga harus bilangan bulat rupiah, tanpa desimal.";
  }
  if (promoPrice <= 0) {
    return "Harga harus lebih dari nol.";
  }
  if (normalPrice !== null && !Number.isInteger(normalPrice)) {
    return "Harga coret harus bilangan bulat rupiah, tanpa desimal.";
  }
  if (normalPrice !== null && normalPrice <= promoPrice) {
    return "Harga promo harus lebih murah dari harga coret.";
  }
  return null;
}
```

Lalu buat `src/server/service-admin.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { validatePriceChange, type PriceInput } from "@/lib/price-validation";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export async function updateServicePrice(input: PriceInput & { id: string }): Promise<void> {
  const actor = await requireCapability("content:manage");

  const error = validatePriceChange(input);
  if (error) throw new Error(error);

  const before = await prisma.service.findUniqueOrThrow({ where: { id: input.id } });
  const after = await prisma.service.update({
    where: { id: input.id },
    data: { normalPrice: input.normalPrice, promoPrice: input.promoPrice },
  });

  await recordAudit({
    actor,
    action: "service.price.update",
    entity: "Service",
    entityId: after.id,
    summary: `${after.name}: ${formatRupiah(before.promoPrice)} -> ${formatRupiah(after.promoPrice)}`,
  });

  // Halaman publik di-prerender. Tanpa ini, harga baru tidak muncul sampai
  // deploy berikutnya.
  revalidatePath("/layanan");
  revalidatePath(`/layanan/${after.slug}`);
  revalidatePath("/");
}

export async function setServiceActive(id: string, isActive: boolean): Promise<void> {
  const actor = await requireCapability("content:manage");

  const updated = await prisma.service.update({ where: { id }, data: { isActive } });

  await recordAudit({
    actor,
    action: isActive ? "service.activate" : "service.deactivate",
    entity: "Service",
    entityId: id,
    summary: updated.name,
  });

  revalidatePath("/layanan");
  revalidatePath(`/layanan/${updated.slug}`);
  revalidatePath("/");
}
```

- [ ] **Step 4: Buat halaman layanan**

Buat `src/app/(admin)/admin/layanan/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { ServicePriceForm } from "@/components/admin/service-price-form";
import { getServiceCategoriesWithServices } from "@/server/catalog";
import { requireCapability } from "@/server/session";

export default async function AdminServicesPage() {
  await requireCapability("content:manage");
  const categories = await getServiceCategoriesWithServices();

  return (
    <>
      <AdminHeader title="Layanan & Harga" />
      <div className="space-y-10 p-6">
        <p className="text-sm text-muted-foreground">
          Perubahan harga langsung tampil di situs publik. Setiap perubahan tercatat di jejak audit.
        </p>

        {categories.map((category) => (
          <section key={category.id}>
            <h2 className="mb-3 text-lg font-medium">{category.name}</h2>
            <div className="space-y-2">
              {category.services.map((service) => (
                <ServicePriceForm
                  key={service.id}
                  service={{
                    id: service.id,
                    name: service.name,
                    normalPrice: service.normalPrice,
                    promoPrice: service.promoPrice,
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
```

Buat `src/components/admin/service-price-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateServicePrice } from "@/server/service-admin";

type ServicePriceFormProps = {
  service: { id: string; name: string; normalPrice: number | null; promoPrice: number };
};

export function ServicePriceForm({ service }: ServicePriceFormProps) {
  const [normalPrice, setNormalPrice] = useState(service.normalPrice?.toString() ?? "");
  const [promoPrice, setPromoPrice] = useState(service.promoPrice.toString());
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await updateServicePrice({
          id: service.id,
          normalPrice: normalPrice === "" ? null : Number(normalPrice),
          promoPrice: Number(promoPrice),
        });
        toast.success(`Harga ${service.name} tersimpan.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Harga gagal disimpan.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <span className="min-w-48 flex-1 text-sm font-medium">{service.name}</span>

      <div className="space-y-1">
        <Label htmlFor={`normal-${service.id}`} className="text-xs">
          Harga coret
        </Label>
        <Input
          id={`normal-${service.id}`}
          inputMode="numeric"
          className="w-32"
          placeholder="kosong"
          value={normalPrice}
          onChange={(e) => setNormalPrice(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`promo-${service.id}`} className="text-xs">
          Harga berlaku
        </Label>
        <Input
          id={`promo-${service.id}`}
          inputMode="numeric"
          className="w-32"
          value={promoPrice}
          onChange={(e) => setPromoPrice(e.target.value)}
        />
      </div>

      <Button onClick={handleSave} disabled={pending} size="sm">
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/price-validation.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS — 5 uji, build berhasil.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: let the owner edit service prices"
```

---

### Task 11: Akun admin pertama & uji ujung-ke-ujung

**Files:**
- Create: `scripts/create-admin.ts`
- Create: `tests/e2e/admin.spec.ts`
- Modify: `package.json`, `README.md`

**Interfaces:**
- Consumes: `auth`; `prisma`.
- Produces: perintah `npm run create-admin`; uji e2e alur login dan proteksi rute.

- [ ] **Step 1: Tulis skrip pembuat akun admin**

Tidak ada pendaftaran mandiri, jadi akun pertama dibuat dari baris perintah.

Buat `scripts/create-admin.ts`:

```ts
import "dotenv/config";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/db";

const [email, password, name] = process.argv.slice(2);

if (!email || !password || !name) {
  console.error('Pakai: npm run create-admin -- <email> <kata-sandi> "<nama lengkap>"');
  process.exit(1);
}

const created = await auth.api.signUpEmail({ body: { email, password, name } });

const slug = name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const staff = await prisma.staff.create({
  data: { slug, name, role: "SUPER_ADMIN", showOnWebsite: false },
});

await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });

console.log(`Akun Super Admin dibuat untuk ${email}.`);
await prisma.$disconnect();
```

Tambahkan ke `package.json`:

```json
"create-admin": "tsx scripts/create-admin.ts"
```

- [ ] **Step 2: Buat akun admin pertama**

```bash
npm run create-admin -- pemilik@sundyclinic.id "gantiKataSandiIni123" "Pemilik SunDY"
```

Expected: `Akun Super Admin dibuat untuk pemilik@sundyclinic.id.`

- [ ] **Step 3: Tulis uji ujung-ke-ujung**

Buat `tests/e2e/admin.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("panel admin menolak pengunjung yang belum login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/masuk$/);
});

test("halaman staf juga tertutup untuk yang belum login", async ({ page }) => {
  // Diuji terpisah dari /admin: melindungi halaman induk saja tidak cukup
  // bila URL anak bisa diketik langsung.
  await page.goto("/admin/staf");
  await expect(page).toHaveURL(/\/masuk$/);
});

test("halaman login tidak meminta mesin pencari mengindeksnya", async ({ page }) => {
  await page.goto("/masuk");
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
});

test("kredensial salah ditolak tanpa menyebut kolom mana yang keliru", async ({ page }) => {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill("bukan-siapa-siapa@sundy.test");
  await page.getByLabel("Kata Sandi").fill("kataSandiSalah123");
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page.getByRole("alert")).toHaveText(/email atau kata sandi salah/i);
  await expect(page).toHaveURL(/\/masuk$/);
});

test("situs publik tetap dapat diakses tanpa login", async ({ page }) => {
  await page.goto("/layanan");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Layanan");
});
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm run test:e2e`
Expected: PASS — 18 uji Plan 1 ditambah 5 uji baru, di desktop dan ponsel.

- [ ] **Step 5: Perbarui README**

Tambahkan bagian berikut ke `README.md` di bawah bagian pengujian:

```markdown
## Panel admin

Panel admin berada di `/admin` dan menuntut login. Tidak ada pendaftaran
mandiri — akun staf dibuat Super Admin dari panel.

Akun Super Admin pertama dibuat dari baris perintah:

```bash
npm run create-admin -- <email> <kata-sandi> "<nama lengkap>"
```

Kata sandi minimal 12 karakter. Sesi berlaku 8 jam.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add admin bootstrap script and access tests"
```

---

## Definisi Selesai untuk Plan 2

- [ ] `npm test` lulus seluruhnya
- [ ] `npm run test:integration` lulus seluruhnya
- [ ] `npm run test:e2e` lulus di desktop dan ponsel
- [ ] `npm run build` berhasil
- [ ] URL publik tidak berubah sama sekali dari Plan 1
- [ ] `/admin` dan setiap anaknya mengalihkan ke `/masuk` bila belum login
- [ ] Resepsionis tidak melihat menu Staf, dan tidak bisa membukanya lewat URL langsung
- [ ] Mengubah harga di panel langsung tampil di halaman publik
- [ ] Setiap perubahan harga dan staf meninggalkan baris di jejak audit
- [ ] Halaman login tidak terindeks mesin pencari

## Yang Sengaja Tidak Dikerjakan di Plan 2

- CRUD paket, produk, cabang, dan FAQ → **Plan 2b**, mengulang pola dari Task 10
- Unggah foto layanan & staf ke penyimpanan berkas → Plan 2b
- Halaman jejak audit di panel — model dan pencatatnya sudah ada, tampilannya menyusul di Plan 2b
- Ganti kata sandi & lupa kata sandi — akun awal dibuat lewat baris perintah; alur ini menyusul sebelum staf kedua ditambahkan
- Jadwal, booking, slot → **Plan 3**
- Rekam medis, SOAP, BIA, pengingat → **Plan 4**
- Pemisahan basis data produksi dari pengembangan → **wajib sebelum Plan 3 tayang**, saat data pasien mulai masuk
