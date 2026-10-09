# Pengelolaan Akun Staf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pemilik (Super Admin) menambah staf, membuat akun login, mengubah peran, menonaktifkan, mereset kata sandi, dan mengganti email dari halaman Staf; staf baru atau yang direset wajib membuat kata sandinya sendiri saat masuk pertama.

**Architecture:** Satu kolom `User.mustChangePassword`; gerbangnya di `getCurrentStaff()` sehingga akun yang wajib ganti tidak dianggap login di halaman, aksi, maupun rute mana pun (hanya halaman Ganti kata sandi yang memakai fungsi terpisah `getPendingPasswordChange()`). Aturan murni di `src/lib/staff-accounts.ts`; aksi server di `src/server/staff.ts` memakai Better Auth (`auth.api.signUpEmail`, `auth.$context.internalAdapter`) seperti skrip `create-admin`/`reset-password`; layar MUI di `src/components/admin/staff/`.

**Tech Stack:** Next.js 15 (server actions), Better Auth 1.7 + Prisma 7/PostgreSQL, Vitest (unit + integrasi), Playwright, Material UI + MUI X DataGrid.

**Spec:** `docs/superpowers/specs/2026-10-09-kelola-staf-design.md` (disetujui pemilik). Untuk gaya komponen admin baca juga `docs/superpowers/specs/2026-10-08-admin-material-ui-design.md`.

## Global Constraints

- **Bahasa:** semua teks yang dilihat pengguna, pesan galat, nama uji, dan komentar kode dalam Bahasa Indonesia; nama berkas, fungsi, dan commit dalam bahasa Inggris.
- **Kata sandi:** minimal **12 karakter** (`minPasswordLength` di `src/lib/auth.ts`; **tidak diturunkan**). Kata sandi sementara 16 karakter dari `randomInt`, alfabet tanpa `0 O 1 l I`, memuat huruf besar, huruf kecil, dan angka.
- **Kata sandi sementara tidak boleh** masuk basis data (selain hash Better Auth), jejak audit, log, URL, atau penyimpanan peramban. Ia hanya ada di nilai kembalian aksi ke browser pemilik dan di state dialog.
- **Hak:** semua aksi pengelolaan `requireCapability("staff:manage")` (Super Admin). Peran lain ditolak di server.
- **Pengaman:** pemilik tidak bisa menonaktifkan atau menurunkan perannya sendiri; harus tersisa minimal satu Super Admin **aktif yang punya akun**; Terapis tidak boleh punya akun dan staf berakun tidak boleh dijadikan Terapis. Reset kata sandi dan ganti email boleh untuk diri sendiri.
- **Sesi:** nonaktifkan, reset kata sandi, dan ganti email menghapus semua sesi akun itu. Peran dibaca dari basis data tiap permintaan.
- **Tanpa penghapusan** akun atau staf (hanya dinonaktifkan). Satu pengecualian: pembersihan staf/akun yang baru dibuat bila pembuatannya gagal di tengah.
- **Skrip server** (`create-admin`, `reset-password`, `change-email`) **tidak diubah**.
- **Pola kode yang ada:** `runAction`/`UserFacingError` dari `@/lib/action-result`; `requireCapability` dari `@/server/session`; `recordAudit` dari `@/server/audit`; `safeRevalidatePath` dari `@/lib/revalidate`; berkas `"use server"` hanya boleh mengekspor fungsi async (tipe boleh); komponen admin hanya MUI (dijaga `tests/unit/architecture.test.ts`: tanpa shadcn, lucide, kelas warna Tailwind, atau impor Prisma di `src/app`).
- **Pengujian:** unit `npx vitest run <berkas>`; integrasi `npm run test:integration -- <berkas>` (basis data uji `sundy_test`; **jangan bersamaan dengan E2E**); E2E `npx playwright test <berkas> --project=desktop` lalu `--project=mobile` (laptop 8 GB: per berkas, per proyek, `--workers=1`). Setelah mengubah `prisma/schema.prisma`: `npx prisma generate`; setelah menambah migrasi: `npm run db:migrate:test`.
- **Uji lama yang sudah gagal:** 3 uji `tests/integration/schedule.test.ts`. Jangan diubah.
- **Commit:** Conventional Commits berbahasa Inggris, diakhiri baris `Co-Authored-By` yang menyebut model penulis commit. **Jangan pernah men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Push, merge, dan deploy hanya atas permintaan pemilik.
- **Log kerja:** `WS` = `.superpowers/sdd/2026-10-09-plan-kelola-staf/` (git-ignored).

## Keputusan perencana (hal yang spec tidak merinci)

1. **`generateTempPassword` di `src/server/temp-password.ts`**, bukan di `src/lib/`: ia memakai `node:crypto`, dan berkas `src/lib/` dipakai juga oleh komponen klien (yang akan gagal dibangun bila mengimpor `node:crypto`). Aturan lain yang murni (email, peran, pengaman, validasi kata sandi) tetap di `src/lib/staff-accounts.ts`.
2. **Kunci Super Admin:** aksi yang bisa mengurangi jumlah Super Admin (nonaktifkan, ubah peran) berjalan dalam transaksi yang lebih dulu mengunci baris Super Admin (`SELECT … FOR UPDATE`), supaya dua pemilik yang bertindak bersamaan tidak sama-sama lolos pengaman "minimal satu".
3. **`getPendingPasswordChange()` mengembalikan `sessionId`** sesi yang sedang dipakai, supaya `changeOwnPassword` bisa mengeluarkan semua sesi lain dan menyisakan sesi ini.
4. **Pembatas laju** untuk halaman Ganti kata sandi tidak ditambah: pemanggilnya sudah memegang sesi sah untuk akun itu (ia sudah tahu kata sandi sementaranya). Dicatat sebagai risiko di spec.
5. **Uji integrasi "Super Admin terakhir"** menonaktifkan sementara Super Admin lain di basis data uji dan memulihkannya di `afterAll`, karena penghitungan memakai seluruh tabel `Staff`.

6. **Mereset akun sendiri tidak me-refresh halaman:** reset mencabut sesi pemilik; `revalidatePath` dari aksi akan memuat ulang rute dan melempar pemilik ke `/masuk` sebelum kata sandi sementara sempat disalin. Aksi melewati `revalidateStaff()` bila sasarannya diri sendiri, dan layar memuat ulang sendiri saat dialog ditutup (Task 5).

7. **`changeOwnPassword` memakai adapter internal Better Auth** (`findCredentialAccount`, `password.verify`, `updatePassword`), bukan `auth.api.changePassword` seperti tertulis di spec 6: endpoint itu menuntut cookie sesi pada permintaan, sehingga aksi tidak bisa diuji tanpa menyusun cookie, sedangkan `getPendingPasswordChange` sudah memberi identitas dan id sesi. Perilakunya sama (kata sandi lama diperiksa, sesi lain dicabut, tanda dimatikan). Skrip `reset-password` yang sudah teruji di produksi memakai adapter yang sama.

## Review Focus

1. **Akun wajib ganti kata sandi tetap bisa memakai rute atau aksi lain** (mis. unggah BIA, aksi server) → harus ditolak/dialihkan; gerbangnya di `getCurrentStaff()` → Task 1 (uji sesi + rute BIA) dan Task 6 (E2E).
2. **Pemilik mengunci dirinya atau seluruh klinik** (nonaktifkan atau turunkan diri sendiri, Super Admin terakhir, dua pemilik bersamaan) → Task 2 (aturan) dan Task 3 (integrasi).
3. **Kata sandi sementara bocor** (audit, log, ringkasan, state yang tertinggal setelah dialog ditutup) → Task 3 (pindai seluruh tabel audit) dan Task 5 (dialog hilang saat ditutup).
4. **Email: huruf besar/kecil, spasi, dobel, milik akun nonaktif, email tidak sah** → Task 2 dan Task 3.
5. **Pembuatan akun gagal di tengah** (staf terbuat tanpa akun, akun tanpa staf, sesi bawaan `signUpEmail` yang tertinggal) → Task 3.

---

### Task 1: Kolom wajib ganti dan gerbang sesi

**Files:**
- Modify: `prisma/schema.prisma` (model `User`)
- Create: `prisma/migrations/20261009170000_wajib_ganti_kata_sandi/migration.sql`
- Modify: `src/server/session.ts`
- Modify: `src/app/(admin)/masuk/page.tsx`
- Create: `tests/integration/session-gate.test.ts`
- Modify: `tests/unit/migrations.test.ts` (blok baru di akhir berkas)

**Interfaces:**
- Consumes: —
- Produces: kolom Prisma `User.mustChangePassword: boolean`; di `@/server/session`: `type PendingPasswordStaff = CurrentStaff & { sessionId: string }`, `getPendingPasswordChange(): Promise<PendingPasswordStaff | null>`; `getCurrentStaff()` kini mengembalikan `null` bila `mustChangePassword`; `requireStaff()` mengarahkan akun yang wajib ganti ke `/ganti-kata-sandi`.

- [ ] **Step 1: Skema dan migrasi**

`prisma/schema.prisma`, di model `User` tambahkan setelah `staff Staff? …` baris berikut:

```prisma
  /// Akun baru atau yang baru direset: wajib membuat kata sandi sendiri sebelum bisa memakai panel (spec kelola staf 4).
  mustChangePassword Boolean   @default(false)
```

`prisma/migrations/20261009170000_wajib_ganti_kata_sandi/migration.sql`:

```sql
-- Wajib ganti kata sandi (spec kelola staf 3). Hanya menambah satu kolom bawaan false, sehingga rilis sebelumnya
-- tetap berjalan dan `deploy.sh kembali` aman. Akun yang sudah ada tidak terpengaruh.
ALTER TABLE "user" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
```

Run: `npx prisma generate && npm run db:migrate:test`
Expected: `Generated Prisma Client` dan `Applying migration 20261009170000_wajib_ganti_kata_sandi`.

- [ ] **Step 2: Tulis uji migrasi dan uji gerbang sesi (RED)**

`tests/unit/migrations.test.ts`, tambahkan di akhir berkas:

```ts
describe("migrasi wajib ganti kata sandi", () => {
  const sql = readFileSync("prisma/migrations/20261009170000_wajib_ganti_kata_sandi/migration.sql", "utf8");

  it("hanya menambah satu kolom bawaan false di tabel user: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).toMatch(/ALTER TABLE "user" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false/);
  });
});
```

`tests/integration/session-gate.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST as uploadBia } from "@/app/(admin)/admin/bia/unggah/route";
import { getCurrentStaff, getPendingPasswordChange, requireStaff } from "@/server/session";

const { state } = vi.hoisted(() => ({ state: { headers: new Headers() } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => state.headers) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));

const SLUG = "gerbang";
const PASSWORD = "kataSandiPanjang123";
const email = (name: string) => `${SLUG}-${name}@sundy.test`;

/** Membuat staf + akun dan mengembalikan header cookie sesi yang sah. */
async function login(name: string, patch: { mustChange?: boolean; active?: boolean } = {}) {
  const staff = await prisma.staff.create({ data: { slug: `${SLUG}-${name}`, name: `Staf ${name}`, role: "RESEPSIONIS", isActive: patch.active ?? true } });
  const created = await auth.api.signUpEmail({ body: { email: email(name), password: PASSWORD, name: `Staf ${name}` } });
  await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id, mustChangePassword: patch.mustChange ?? false } });
  // signUpEmail ikut membuat satu sesi; buang agar satu-satunya sesi adalah yang dibuat signInEmail di bawah.
  await prisma.session.deleteMany({ where: { userId: created.user.id } });
  const signedIn = await auth.api.signInEmail({ body: { email: email(name), password: PASSWORD }, returnHeaders: true });
  const cookie = signedIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  state.headers = new Headers({ cookie });
  return { staff, userId: created.user.id };
}

async function clean() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: `${SLUG}-` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.account.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.staff.deleteMany({ where: { slug: { startsWith: `${SLUG}-` } } });
}

describe("gerbang wajib ganti kata sandi", () => {
  beforeEach(async () => {
    state.headers = new Headers();
    await clean();
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("akun biasa: login, tidak menunggu ganti kata sandi", async () => {
    await login("biasa");
    expect(await getCurrentStaff()).toMatchObject({ email: email("biasa"), role: "RESEPSIONIS" });
    expect(await getPendingPasswordChange()).toBeNull();
    expect((await requireStaff()).email).toBe(email("biasa"));
  });

  it("akun yang wajib ganti tidak dianggap login, tetapi dikenali sebagai menunggu dan membawa id sesinya", async () => {
    const { userId } = await login("wajib", { mustChange: true });
    expect(await getCurrentStaff()).toBeNull();
    const pending = await getPendingPasswordChange();
    expect(pending).toMatchObject({ email: email("wajib"), role: "RESEPSIONIS", userId });
    const session = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(pending?.sessionId).toBe(session.id);
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/ganti-kata-sandi");
  });

  it("rute yang memakai getCurrentStaff menolak akun yang wajib ganti (unggah BIA 401)", async () => {
    await login("rute", { mustChange: true });
    const response = await uploadBia(new Request("https://sundyclinic.com/admin/bia/unggah", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("tanpa cookie atau staf nonaktif: tidak login dan tidak menunggu; requireStaff ke /masuk", async () => {
    expect(await getCurrentStaff()).toBeNull();
    expect(await getPendingPasswordChange()).toBeNull();
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/masuk");

    await login("nonaktif", { active: false });
    expect(await getCurrentStaff()).toBeNull();
    expect(await getPendingPasswordChange()).toBeNull();
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/masuk");
  });

  it("peran dibaca dari basis data tiap permintaan: perubahan peran berlaku seketika", async () => {
    const { staff } = await login("peran");
    expect((await getCurrentStaff())?.role).toBe("RESEPSIONIS");
    await prisma.staff.update({ where: { id: staff.id }, data: { role: "APOTEKER" } });
    expect((await getCurrentStaff())?.role).toBe("APOTEKER");
  });
});
```

Run: `npx vitest run tests/unit/migrations.test.ts` → PASS; `npm run test:integration -- tests/integration/session-gate.test.ts`
Expected: FAIL (`getPendingPasswordChange` belum ada; `getCurrentStaff` belum memeriksa tanda).

- [ ] **Step 3: Implementasi `src/server/session.ts`**

Ganti seluruh bagian dari `export type CurrentStaff` sampai akhir `requireStaff` dengan (biarkan `requireCapability` dan impor `can` apa adanya):

```ts
export type CurrentStaff = {
  userId: string;
  staffId: string;
  name: string;
  role: StaffRole;
  email: string;
};

/** Akun yang wajib membuat kata sandi sendiri; membawa id sesi yang sedang dipakai (spec kelola staf 4). */
export type PendingPasswordStaff = CurrentStaff & { sessionId: string };

type LoadedStaff = CurrentStaff & { sessionId: string; mustChangePassword: boolean };

/**
 * Staf aktif pemilik sesi ini, atau null. Pengguna tanpa baris Staff yang aktif diperlakukan sebagai belum login:
 * menonaktifkan staf di panel langsung mencabut aksesnya, tanpa menunggu sesinya kedaluwarsa.
 */
async function loadStaff(): Promise<LoadedStaff | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, mustChangePassword: true, staff: true },
  });

  if (!user?.staff || !user.staff.isActive) return null;

  return {
    userId: user.id,
    staffId: user.staff.id,
    name: user.staff.name,
    role: user.staff.role,
    email: user.email,
    sessionId: session.session.id,
    mustChangePassword: user.mustChangePassword,
  };
}

const toCurrent = ({ userId, staffId, name, role, email }: LoadedStaff): CurrentStaff => ({ userId, staffId, name, role, email });

/**
 * Mengambil staf yang sedang login, atau null. Akun yang wajib mengganti kata sandi TIDAK dianggap login di sini,
 * sehingga halaman, aksi server, dan rute yang memakai fungsi ini otomatis menolaknya; hanya halaman Ganti kata sandi
 * yang boleh memakai `getPendingPasswordChange`.
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const found = await loadStaff();
  if (!found || found.mustChangePassword) return null;
  return toCurrent(found);
}

/** Akun yang wajib mengganti kata sandi (akun baru atau yang baru direset), atau null. */
export async function getPendingPasswordChange(): Promise<PendingPasswordStaff | null> {
  const found = await loadStaff();
  if (!found || !found.mustChangePassword) return null;
  return { ...toCurrent(found), sessionId: found.sessionId };
}

export async function requireStaff(): Promise<CurrentStaff> {
  const found = await loadStaff();
  if (!found) redirect("/masuk");
  if (found.mustChangePassword) redirect("/ganti-kata-sandi");
  return toCurrent(found);
}
```

Run: `npm run test:integration -- tests/integration/session-gate.test.ts`
Expected: PASS (5 uji). Bila `returnHeaders` ditolak oleh versi Better Auth, ambil cookie lewat `auth.api.signInEmail({ body, asResponse: true })` dan `response.headers.getSetCookie()`; catat sebagai Ruling.

- [ ] **Step 4: Halaman masuk mengalihkan akun yang wajib ganti**

`src/app/(admin)/masuk/page.tsx`: ubah impor menjadi `import { getCurrentStaff, getPendingPasswordChange } from "@/server/session";` dan ganti baris `if (await getCurrentStaff()) redirect("/admin");` dengan:

```ts
  // Akun yang wajib ganti kata sandi tidak dianggap login; arahkan ke halaman penggantiannya, bukan memperlihatkan formulir masuk lagi.
  if (await getPendingPasswordChange()) redirect("/ganti-kata-sandi");
  if (await getCurrentStaff()) redirect("/admin");
```

- [ ] **Step 5: Verifikasi tugas dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run && npm run test:integration -- tests/integration/session-gate.test.ts tests/integration/auth.test.ts tests/integration/bia-routes.test.ts`
Expected: semua lulus (uji lama `auth` dan `bia-routes` tidak terpengaruh).

```bash
git add prisma/schema.prisma prisma/migrations/20261009170000_wajib_ganti_kata_sandi src/server/session.ts "src/app/(admin)/masuk/page.tsx" tests/integration/session-gate.test.ts tests/unit/migrations.test.ts
git commit -m "feat: treat accounts that must change their password as signed out except on the change-password page"
```

---

### Task 2: Aturan murni dan pembuat kata sandi sementara

**Files:**
- Create: `src/lib/staff-accounts.ts`
- Create: `src/server/temp-password.ts`
- Modify: `src/lib/staff-role.ts` (`isStaffRole`)
- Modify: `src/lib/audit-labels.ts`
- Test: `tests/unit/staff-accounts.test.ts` (baru), `tests/unit/temp-password.test.ts` (baru), `tests/unit/audit-labels.test.ts` (tambah)

**Interfaces:**
- Consumes: —
- Produces:
  - `@/lib/staff-role`: `isStaffRole(value: unknown): value is StaffRole`.
  - `@/lib/staff-accounts`: `MIN_PASSWORD_LENGTH = 12`; `type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }`; `validateStaffName(raw: unknown): Parsed<string>`; `validateLoginEmail(raw: unknown): Parsed<string>`; `roleCanHaveLogin(role: StaffRole): boolean`; `type StaffTarget = { id: string; role: StaffRole; isActive: boolean; hasLogin: boolean }`; `type StaffChange = { kind: "deactivate" } | { kind: "role"; to: StaffRole }`; `staffChangeBlock(input: { actorStaffId: string; target: StaffTarget; change: StaffChange; activeSuperAdminsWithLogin: number }): string | null`; `validateOwnPasswordChange(input: { currentPassword: string; newPassword: string; confirmation: string }): Parsed<string>`.
  - `@/server/temp-password`: `TEMP_PASSWORD_LENGTH = 16`; `generateTempPassword(random?: (max: number) => number): string`.

- [ ] **Step 1: Tulis uji (RED)**

`tests/unit/staff-accounts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isStaffRole } from "@/lib/staff-role";
import { MIN_PASSWORD_LENGTH, roleCanHaveLogin, staffChangeBlock, validateLoginEmail, validateOwnPasswordChange, validateStaffName } from "@/lib/staff-accounts";

describe("validasi nama dan email", () => {
  it("nama dipangkas, dirapikan, dan dibatasi 100 karakter", () => {
    expect(validateStaffName("  Dr.   Diane  ")).toEqual({ ok: true, value: "Dr. Diane" });
    expect(validateStaffName("   ")).toEqual({ ok: false, message: "Isi nama staf." });
    expect(validateStaffName(undefined)).toEqual({ ok: false, message: "Isi nama staf." });
    expect(validateStaffName("x".repeat(101))).toEqual({ ok: false, message: "Nama staf paling banyak 100 karakter." });
  });

  it("email dipangkas dan diubah ke huruf kecil; bentuk yang salah ditolak", () => {
    expect(validateLoginEmail("  Rina@SunDY.Test ")).toEqual({ ok: true, value: "rina@sundy.test" });
    expect(validateLoginEmail("")).toEqual({ ok: false, message: "Isi email login." });
    expect(validateLoginEmail(null)).toEqual({ ok: false, message: "Isi email login." });
    for (const bad of ["rina", "rina@", "@sundy.test", "rina@sundy", "ri na@sundy.test", "a@b@c.test"]) {
      expect(validateLoginEmail(bad)).toEqual({ ok: false, message: "Email tidak valid." });
    }
    expect(validateLoginEmail(`${"a".repeat(250)}@sundy.test`)).toEqual({ ok: false, message: "Email tidak valid." });
  });
});

describe("peran dan akun", () => {
  it("hanya Terapis yang tidak boleh punya akun", () => {
    expect(roleCanHaveLogin("TERAPIS")).toBe(false);
    for (const role of ["SUPER_ADMIN", "DOKTER", "RESEPSIONIS", "APOTEKER", "ADMIN_KEUANGAN"] as const) expect(roleCanHaveLogin(role)).toBe(true);
  });

  it("mengenali nama peran yang sah", () => {
    expect(isStaffRole("DOKTER")).toBe(true);
    expect(isStaffRole("dokter")).toBe(false);
    expect(isStaffRole("PEMILIK")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe("pengaman perubahan staf", () => {
  const target = (patch: Partial<Parameters<typeof staffChangeBlock>[0]["target"]> = {}) => ({ id: "t1", role: "RESEPSIONIS" as const, isActive: true, hasLogin: true, ...patch });
  const block = (input: Partial<Parameters<typeof staffChangeBlock>[0]> & Pick<Parameters<typeof staffChangeBlock>[0], "change">) =>
    staffChangeBlock({ actorStaffId: "aktor", target: target(), activeSuperAdminsWithLogin: 2, ...input });

  it("tidak boleh menonaktifkan diri sendiri atau menurunkan peran diri sendiri", () => {
    expect(block({ actorStaffId: "t1", change: { kind: "deactivate" } })).toBe("Anda tidak bisa menonaktifkan akun Anda sendiri.");
    expect(block({ actorStaffId: "t1", target: target({ role: "SUPER_ADMIN" }), change: { kind: "role", to: "DOKTER" } })).toBe("Anda tidak bisa menurunkan peran Anda sendiri.");
    expect(block({ actorStaffId: "t1", target: target({ role: "SUPER_ADMIN" }), change: { kind: "role", to: "SUPER_ADMIN" } })).toBeNull();
  });

  it("harus tersisa minimal satu Super Admin aktif yang punya akun", () => {
    const owner = target({ role: "SUPER_ADMIN" });
    const message = "Harus tersisa minimal satu Super Admin aktif yang punya akun.";
    expect(block({ target: owner, activeSuperAdminsWithLogin: 1, change: { kind: "deactivate" } })).toBe(message);
    expect(block({ target: owner, activeSuperAdminsWithLogin: 1, change: { kind: "role", to: "DOKTER" } })).toBe(message);
    expect(block({ target: owner, activeSuperAdminsWithLogin: 2, change: { kind: "deactivate" } })).toBeNull();
    // Super Admin tanpa akun atau yang sudah nonaktif tidak termasuk hitungan: menonaktifkannya tidak mengurangi apa pun.
    expect(block({ target: target({ role: "SUPER_ADMIN", hasLogin: false }), activeSuperAdminsWithLogin: 1, change: { kind: "deactivate" } })).toBeNull();
    expect(block({ target: target({ role: "SUPER_ADMIN", isActive: false }), activeSuperAdminsWithLogin: 1, change: { kind: "role", to: "DOKTER" } })).toBeNull();
  });

  it("staf yang punya akun tidak boleh dijadikan Terapis", () => {
    expect(block({ change: { kind: "role", to: "TERAPIS" } })).toBe("Staf yang punya akun tidak bisa berperan Terapis. Nonaktifkan akunnya atau pilih peran lain.");
    expect(block({ target: target({ hasLogin: false }), change: { kind: "role", to: "TERAPIS" } })).toBeNull();
  });
});

describe("mengganti kata sandi sendiri", () => {
  const input = (patch: Partial<Parameters<typeof validateOwnPasswordChange>[0]> = {}) => ({ currentPassword: "SementaraAbc234xyz", newPassword: "kataSandiBaruPanjang1", confirmation: "kataSandiBaruPanjang1", ...patch });

  it("menerima kata sandi baru yang cukup panjang, berbeda, dan sama dengan ulangannya", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(validateOwnPasswordChange(input())).toEqual({ ok: true, value: "kataSandiBaruPanjang1" });
  });

  it("menolak dengan pesan yang jelas", () => {
    expect(validateOwnPasswordChange(input({ currentPassword: "" }))).toEqual({ ok: false, message: "Isi kata sandi saat ini." });
    expect(validateOwnPasswordChange(input({ newPassword: "pendek", confirmation: "pendek" }))).toEqual({ ok: false, message: "Kata sandi baru minimal 12 karakter." });
    expect(validateOwnPasswordChange(input({ confirmation: "lain" }))).toEqual({ ok: false, message: "Kata sandi baru dan ulangannya tidak sama." });
    expect(validateOwnPasswordChange(input({ newPassword: "SementaraAbc234xyz", confirmation: "SementaraAbc234xyz" }))).toEqual({ ok: false, message: "Kata sandi baru harus berbeda dari yang sementara." });
    expect(validateOwnPasswordChange(input({ newPassword: "x".repeat(129), confirmation: "x".repeat(129) }))).toEqual({ ok: false, message: "Kata sandi baru paling banyak 128 karakter." });
  });
});
```

`tests/unit/temp-password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEMP_PASSWORD_LENGTH, generateTempPassword } from "@/server/temp-password";

describe("kata sandi sementara", () => {
  it("16 karakter, tanpa karakter yang mudah tertukar, memuat huruf besar, kecil, dan angka", () => {
    expect(TEMP_PASSWORD_LENGTH).toBe(16);
    for (let i = 0; i < 500; i += 1) {
      const password = generateTempPassword();
      expect(password).toHaveLength(16);
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
    }
  });

  it("tidak berulang pada 1.000 panggilan", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateTempPassword()));
    expect(seen.size).toBe(1000);
  });

  it("memakai sumber acak yang diberikan (uji deterministik) dan mengacak urutan golongan", () => {
    let n = 0;
    const counter = (max: number) => n++ % max;
    const a = generateTempPassword(counter);
    n = 0;
    expect(generateTempPassword(counter)).toBe(a);
    // Tiga karakter pertama tidak selalu huruf besar-kecil-angka berurutan.
    const firsts = new Set(Array.from({ length: 200 }, () => generateTempPassword().slice(0, 3).replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/[2-9]/g, "9")));
    expect(firsts.size).toBeGreaterThan(3);
  });
});
```

`tests/unit/audit-labels.test.ts`, tambahkan di dalam `it("aksi BIA punya bahasa manusia…")` yang ada **atau** sebagai `it` baru di akhir `describe`:

```ts
  it("aksi pengelolaan staf punya bahasa manusia", () => {
    expect(auditActionLabel("staff.create")).toBe("menambah staf");
    expect(auditActionLabel("staff.update")).toBe("mengubah data staf");
    expect(auditActionLabel("staff.activate")).toBe("mengaktifkan staf");
    expect(auditActionLabel("staff.deactivate")).toBe("menonaktifkan staf");
    expect(auditActionLabel("staff.account.create")).toBe("membuat akun staf");
    expect(auditActionLabel("staff.account.reset")).toBe("mereset kata sandi staf");
    expect(auditActionLabel("staff.account.email")).toBe("mengganti email staf");
    expect(auditActionLabel("staff.password.change")).toBe("mengganti kata sandi sendiri");
  });
```

Run: `npx vitest run tests/unit/staff-accounts.test.ts tests/unit/temp-password.test.ts tests/unit/audit-labels.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 2: Implementasi**

`src/lib/staff-role.ts`, tambahkan di akhir berkas:

```ts
export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}
```

`src/lib/staff-accounts.ts`:

```ts
import type { StaffRole } from "@prisma/client";

/** Aturan pengelolaan akun staf (spec kelola staf 4). Murni, tanpa basis data dan tanpa node:crypto: dipakai juga oleh komponen klien. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** Harus sama dengan `minPasswordLength` di src/lib/auth.ts (dijaga uji integrasi). */
export const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const NAME_MAX = 100;
const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export function validateStaffName(raw: unknown): Parsed<string> {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) return fail("Isi nama staf.");
  if (name.length > NAME_MAX) return fail(`Nama staf paling banyak ${NAME_MAX} karakter.`);
  return { ok: true, value: name };
}

/** Better Auth menyimpan email dalam huruf kecil, jadi dinormalkan di sini. */
export function validateLoginEmail(raw: unknown): Parsed<string> {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email) return fail("Isi email login.");
  if (email.length > 254 || !FORMAT_EMAIL.test(email) || email.split("@").length !== 2) return fail("Email tidak valid.");
  return { ok: true, value: email };
}

/** Terapis adalah sumber daya jadwal tanpa kemampuan panel: tidak punya akun (spec K6). */
export function roleCanHaveLogin(role: StaffRole): boolean {
  return role !== "TERAPIS";
}

export type StaffTarget = { id: string; role: StaffRole; isActive: boolean; hasLogin: boolean };
export type StaffChange = { kind: "deactivate" } | { kind: "role"; to: StaffRole };

/** Alasan sebuah perubahan ditolak, atau null bila boleh (spec kelola staf 4: pengaman diri dan klinik). */
export function staffChangeBlock(input: { actorStaffId: string; target: StaffTarget; change: StaffChange; activeSuperAdminsWithLogin: number }): string | null {
  const { actorStaffId, target, change, activeSuperAdminsWithLogin } = input;
  const self = actorStaffId === target.id;

  if (change.kind === "deactivate" && self) return "Anda tidak bisa menonaktifkan akun Anda sendiri.";
  if (change.kind === "role" && self && target.role === "SUPER_ADMIN" && change.to !== "SUPER_ADMIN") {
    return "Anda tidak bisa menurunkan peran Anda sendiri.";
  }
  if (change.kind === "role" && change.to === "TERAPIS" && target.hasLogin) {
    return "Staf yang punya akun tidak bisa berperan Terapis. Nonaktifkan akunnya atau pilih peran lain.";
  }

  const losesSuperAdmin = target.role === "SUPER_ADMIN" && target.isActive && target.hasLogin && (change.kind === "deactivate" || change.to !== "SUPER_ADMIN");
  if (losesSuperAdmin && activeSuperAdminsWithLogin <= 1) return "Harus tersisa minimal satu Super Admin aktif yang punya akun.";
  return null;
}

/** Isian halaman Ganti kata sandi. Mengembalikan kata sandi baru bila sah. */
export function validateOwnPasswordChange(input: { currentPassword: string; newPassword: string; confirmation: string }): Parsed<string> {
  const { currentPassword, newPassword, confirmation } = input;
  if (!currentPassword) return fail("Isi kata sandi saat ini.");
  if (newPassword.length < MIN_PASSWORD_LENGTH) return fail(`Kata sandi baru minimal ${MIN_PASSWORD_LENGTH} karakter.`);
  if (newPassword.length > MAX_PASSWORD_LENGTH) return fail(`Kata sandi baru paling banyak ${MAX_PASSWORD_LENGTH} karakter.`);
  if (newPassword !== confirmation) return fail("Kata sandi baru dan ulangannya tidak sama.");
  if (newPassword === currentPassword) return fail("Kata sandi baru harus berbeda dari yang sementara.");
  return { ok: true, value: newPassword };
}
```

`src/server/temp-password.ts`:

```ts
import { randomInt } from "node:crypto";

export const TEMP_PASSWORD_LENGTH = 16;
// Tanpa karakter yang mudah tertukar saat dibaca atau diketik: I O l 0 1.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

/** Kata sandi sementara untuk akun baru atau yang direset. `random(max)` mengembalikan bilangan bulat 0..max-1. */
export function generateTempPassword(random: (max: number) => number = (max) => randomInt(max)): string {
  const pick = (alphabet: string) => alphabet[random(alphabet.length)];
  // Satu dari tiap golongan dulu, sisanya bebas, lalu diacak supaya golongan tidak selalu di depan.
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
```

`src/lib/audit-labels.ts`, tambahkan di `ACTION_LABEL` setelah entri `bia.view`:

```ts
  "staff.create": "menambah staf",
  "staff.update": "mengubah data staf",
  "staff.activate": "mengaktifkan staf",
  "staff.deactivate": "menonaktifkan staf",
  "staff.account.create": "membuat akun staf",
  "staff.account.reset": "mereset kata sandi staf",
  "staff.account.email": "mengganti email staf",
  "staff.password.change": "mengganti kata sandi sendiri",
```

- [ ] **Step 3: Jalankan uji (GREEN)**

Run: `npx vitest run tests/unit/staff-accounts.test.ts tests/unit/temp-password.test.ts tests/unit/audit-labels.test.ts`
Expected: PASS. Uji "mengacak urutan golongan" bersifat statistik (200 sampel, lebih dari 3 pola); bila sesekali gagal, naikkan sampel ke 500, jangan melonggarkan ambangnya.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run tests/unit/architecture.test.ts` → bersih.

- [ ] **Step 4: Commit**

```bash
git add src/lib/staff-accounts.ts src/server/temp-password.ts src/lib/staff-role.ts src/lib/audit-labels.ts tests/unit/staff-accounts.test.ts tests/unit/temp-password.test.ts tests/unit/audit-labels.test.ts
git commit -m "feat: add staff account rules, a temporary password generator, and audit labels"
```

---

### Task 3: Aksi server pengelolaan staf

**Files:**
- Modify (tulis ulang): `src/server/staff.ts`
- Test: `tests/integration/staff-accounts.test.ts` (baru)

**Interfaces:**
- Consumes: `staffChangeBlock`, `validateLoginEmail`, `validateStaffName`, `roleCanHaveLogin`, `MIN_PASSWORD_LENGTH` (`@/lib/staff-accounts`); `generateTempPassword` (`@/server/temp-password`); `isStaffRole`, `STAFF_ROLE_LABEL` (`@/lib/staff-role`); kolom `User.mustChangePassword` (Task 1).
- Produces (semua dari `@/server/staff`, berkas `"use server"`):
  - Tipe: `StaffRow = { id: string; name: string; role: StaffRole; showOnWebsite: boolean; isActive: boolean; email: string | null; mustChangePassword: boolean }`; `Credentials = { email: string; tempPassword: string }`.
  - `uniqueStaffSlug(name: string): Promise<string>` (tetap).
  - `listStaffAccounts(): Promise<StaffRow[]>` (menggantikan `listStaff`).
  - `createStaffWithAccount(input: { name: string; role: StaffRole; showOnWebsite?: boolean; email?: string }): Promise<ActionResult<{ staffId: string; credentials: Credentials | null }>>`.
  - `createAccountForStaff(input: { staffId: string; email: string }): Promise<ActionResult<{ credentials: Credentials }>>`.
  - `updateStaff(input: { id: string; name: string; role: StaffRole; showOnWebsite: boolean }): Promise<ActionResult<void>>`.
  - `setStaffActive(id: string, isActive: boolean): Promise<ActionResult<void>>` (menggantikan versi lama yang mengembalikan `void`).
  - `resetStaffPassword(staffId: string): Promise<ActionResult<{ credentials: Credentials }>>`.
  - `changeStaffEmail(input: { staffId: string; email: string }): Promise<ActionResult<void>>`.
  - `createStaff` lama **dihapus** (tidak ada pemakai selain berkasnya sendiri; periksa dengan `grep -rn "createStaff\b\|listStaff\b\|setStaffActive" src tests`).

- [ ] **Step 1: Tulis uji integrasi (RED)**

`tests/integration/staff-accounts.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-accounts";
import {
  changeStaffEmail,
  createAccountForStaff,
  createStaffWithAccount,
  listStaffAccounts,
  resetStaffPassword,
  setStaffActive,
  updateStaff,
} from "@/server/staff";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u-aktor", staffId: "", name: "Pemilik Uji", role: "SUPER_ADMIN" as Role, email: "aktor@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "kelola";
const mail = (name: string) => `${SLUG}-${name}@sundy.test`;
const PASSWORD = "kataSandiPanjang123";

describe("pengelolaan akun staf", () => {
  let actorStaffId: string;
  let othersToRestore: string[] = [];

  async function clean() {
    const users = await prisma.user.findMany({ where: { email: { startsWith: `${SLUG}-` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entity: "Staff", actorName: "Pemilik Uji" } });
    // Staf yang dibuat lewat aksi memakai slug dari nama, jadi dikenali dari awalan nama "Kelola ".
    await prisma.staff.deleteMany({ where: { OR: [{ slug: { startsWith: SLUG } }, { name: { startsWith: "Kelola " } }] } });
  }

  /** Staf + akun langsung lewat Better Auth (di luar aksi yang diuji). */
  async function seedAccount(name: string, role: "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS" | "APOTEKER" = "RESEPSIONIS") {
    const staff = await prisma.staff.create({ data: { slug: `${SLUG}-${name}`, name: `Staf ${name}`, role } });
    const created = await auth.api.signUpEmail({ body: { email: mail(name), password: PASSWORD, name: `Staf ${name}` } });
    await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });
    // signUpEmail ikut membuat satu sesi; buang agar hitungan sesi di uji tepat.
    await prisma.session.deleteMany({ where: { userId: created.user.id } });
    return { staff, userId: created.user.id };
  }
  const login = (name: string, password = PASSWORD) => auth.api.signInEmail({ body: { email: mail(name), password } });

  beforeAll(async () => {
    await clean();
    // Penghitungan "Super Admin terakhir" memakai seluruh tabel Staff: matikan sementara yang lain di basis data uji, pulihkan di afterAll.
    const others = await prisma.staff.findMany({ where: { role: "SUPER_ADMIN", isActive: true, user: { isNot: null } }, select: { id: true } });
    othersToRestore = others.map((s) => s.id);
    await prisma.staff.updateMany({ where: { id: { in: othersToRestore } }, data: { isActive: false } });
  });
  beforeEach(async () => {
    await clean();
    actor.role = "SUPER_ADMIN";
    const owner = await seedAccount("pemilik", "SUPER_ADMIN");
    actorStaffId = owner.staff.id;
    actor.staffId = actorStaffId;
  });
  afterAll(async () => {
    await clean();
    await prisma.staff.updateMany({ where: { id: { in: othersToRestore } }, data: { isActive: true } });
    await prisma.$disconnect();
  });

  it("memastikan aturan panjang kata sandi sama dengan konfigurasi Better Auth", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(auth.options.emailAndPassword?.minPasswordLength);
  });

  it("menambah staf dengan akun: kata sandi sementara bisa dipakai masuk, tanda wajib ganti menyala, tanpa sesi tersisa", async () => {
    const { staffId, credentials } = await unwrap(createStaffWithAccount({ name: `  Kelola   Rina Uji `, role: "RESEPSIONIS", email: ` ${mail("rina").toUpperCase()} ` }));
    expect(credentials).not.toBeNull();
    expect(credentials!.email).toBe(mail("rina"));
    expect(credentials!.tempPassword).toHaveLength(16);

    const staff = await prisma.staff.findUniqueOrThrow({ where: { id: staffId }, include: { user: true } });
    expect(staff).toMatchObject({ name: "Kelola Rina Uji", role: "RESEPSIONIS", isActive: true, showOnWebsite: false });
    expect(staff.user).toMatchObject({ email: mail("rina"), mustChangePassword: true, staffId });
    expect(await prisma.session.count({ where: { userId: staff.user!.id } })).toBe(0);
    expect((await login("rina", credentials!.tempPassword)).user.email).toBe(mail("rina"));
  });

  it("kata sandi sementara tidak pernah masuk ke jejak audit (seluruh tabel dipindai)", async () => {
    const { credentials } = await unwrap(createStaffWithAccount({ name: "Kelola Audit Uji", role: "DOKTER", email: mail("audit") }));
    const reset = await unwrap(resetStaffPassword((await prisma.staff.findFirstOrThrow({ where: { name: "Kelola Audit Uji" } })).id));
    const rows = await prisma.auditLog.findMany();
    const everything = JSON.stringify(rows);
    expect(everything).not.toContain(credentials!.tempPassword);
    expect(everything).not.toContain(reset.credentials.tempPassword);
    const actions = rows.filter((r) => r.actorName === "Pemilik Uji").map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["staff.create", "staff.account.create", "staff.account.reset"]));
  });

  it("Terapis ditambah tanpa akun dan tanpa kata sandi", async () => {
    const { staffId, credentials } = await unwrap(createStaffWithAccount({ name: "Kelola Terapis Uji", role: "TERAPIS", email: mail("abaikan") }));
    expect(credentials).toBeNull();
    expect(await prisma.user.count({ where: { staffId } })).toBe(0);
    expect(await prisma.user.count({ where: { email: mail("abaikan") } })).toBe(0);
  });

  it("menolak email tidak sah, nama kosong, dan peran tak dikenal tanpa meninggalkan staf", async () => {
    const before = await prisma.staff.count();
    expect(await createStaffWithAccount({ name: "Salah Email", role: "DOKTER", email: "bukan-email" })).toEqual({ ok: false, error: "Email tidak valid." });
    expect(await createStaffWithAccount({ name: "Tanpa Email", role: "DOKTER" })).toEqual({ ok: false, error: "Isi email login." });
    expect(await createStaffWithAccount({ name: "  ", role: "DOKTER", email: mail("x") })).toEqual({ ok: false, error: "Isi nama staf." });
    expect(await createStaffWithAccount({ name: "Peran Salah", role: "PEMILIK" as never, email: mail("y") })).toEqual({ ok: false, error: "Pilih peran." });
    expect(await prisma.staff.count()).toBe(before);
  });

  it("email dobel ditolak (huruf besar dan spasi dinormalkan), dan staf yang sempat dibuat dibersihkan", async () => {
    await seedAccount("ada");
    const before = await prisma.staff.count();
    expect(await createStaffWithAccount({ name: "Kelola Dobel Uji", role: "DOKTER", email: `  ${mail("ada").toUpperCase()}` })).toEqual({ ok: false, error: "Email ini sudah dipakai akun lain." });
    expect(await prisma.staff.count()).toBe(before);
  });

  it("bila pembuatan akun gagal di tengah, staf yang sempat dibuat dibersihkan dan tidak ada akun tersisa", async () => {
    const before = await prisma.staff.count();
    const spy = vi.spyOn(auth.api, "signUpEmail").mockRejectedValueOnce(new Error("boom"));
    await expect(createStaffWithAccount({ name: "Kelola Gagal Tengah", role: "DOKTER", email: mail("gagal") })).rejects.toThrow("boom");
    spy.mockRestore();
    expect(await prisma.staff.count()).toBe(before);
    expect(await prisma.user.count({ where: { email: mail("gagal") } })).toBe(0);
  });

  it("membuat akun untuk staf yang sudah ada; menolak yang sudah punya akun, Terapis, dan staf nonaktif", async () => {
    const dokter = await prisma.staff.create({ data: { slug: `${SLUG}-dokter`, name: "Dokter Tanpa Akun", role: "DOKTER" } });
    const { credentials } = await unwrap(createAccountForStaff({ staffId: dokter.id, email: mail("dokter") }));
    expect((await login("dokter", credentials.tempPassword)).user.email).toBe(mail("dokter"));
    expect((await prisma.user.findFirstOrThrow({ where: { staffId: dokter.id } })).mustChangePassword).toBe(true);

    expect(await createAccountForStaff({ staffId: dokter.id, email: mail("lain") })).toEqual({ ok: false, error: "Staf ini sudah punya akun." });
    const terapis = await prisma.staff.create({ data: { slug: `${SLUG}-terapis`, name: "Terapis", role: "TERAPIS" } });
    expect(await createAccountForStaff({ staffId: terapis.id, email: mail("terapis") })).toEqual({ ok: false, error: "Staf berperan Terapis tidak bisa punya akun." });
    const off = await prisma.staff.create({ data: { slug: `${SLUG}-off`, name: "Nonaktif", role: "DOKTER", isActive: false } });
    expect(await createAccountForStaff({ staffId: off.id, email: mail("off") })).toEqual({ ok: false, error: "Aktifkan staf dulu sebelum membuat akunnya." });
    expect(await createAccountForStaff({ staffId: "tidak-ada", email: mail("z") })).toEqual({ ok: false, error: "Staf tidak ditemukan." });
  });

  it("mengubah nama, peran, dan tampil di situs; nama akun ikut berubah, dan peran berlaku seketika", async () => {
    const { staff, userId } = await seedAccount("ubah", "RESEPSIONIS");
    await unwrap(updateStaff({ id: staff.id, name: "  Nama   Baru ", role: "APOTEKER", showOnWebsite: true }));
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({ name: "Nama Baru", role: "APOTEKER", showOnWebsite: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).name).toBe("Nama Baru");
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.update", entityId: staff.id } })).summary).toContain("Resepsionis → Apoteker");
  });

  it("pengaman perubahan peran: tidak ke Terapis bila punya akun, tidak menurunkan diri sendiri, tidak menghabiskan Super Admin", async () => {
    const { staff } = await seedAccount("peran", "DOKTER");
    expect(await updateStaff({ id: staff.id, name: "Staf peran", role: "TERAPIS", showOnWebsite: false })).toEqual({
      ok: false,
      error: "Staf yang punya akun tidak bisa berperan Terapis. Nonaktifkan akunnya atau pilih peran lain.",
    });
    expect(await updateStaff({ id: actorStaffId, name: "Pemilik Uji", role: "DOKTER", showOnWebsite: false })).toEqual({ ok: false, error: "Anda tidak bisa menurunkan peran Anda sendiri." });

    // Super Admin kedua: menurunkannya boleh selama pemilik masih ada; setelah pemilik berhenti jadi Super Admin aktif, yang terakhir terlindungi.
    const second = await seedAccount("kedua", "SUPER_ADMIN");
    await unwrap(updateStaff({ id: second.staff.id, name: "Staf kedua", role: "DOKTER", showOnWebsite: false }));
    await prisma.staff.update({ where: { id: second.staff.id }, data: { role: "SUPER_ADMIN" } });
    await prisma.staff.update({ where: { id: actorStaffId }, data: { isActive: false } }); // pemilik (aktor) tidak lagi dihitung
    actor.staffId = "orang-lain";
    expect(await updateStaff({ id: second.staff.id, name: "Staf kedua", role: "DOKTER", showOnWebsite: false })).toEqual({ ok: false, error: "Harus tersisa minimal satu Super Admin aktif yang punya akun." });
  });

  it("menonaktifkan mencabut semua sesi dan langsung menolak masuk; mengaktifkan kembali memulihkan akses", async () => {
    const { staff, userId } = await seedAccount("henti");
    await login("henti");
    await login("henti");
    expect(await prisma.session.count({ where: { userId } })).toBe(2);

    await unwrap(setStaffActive(staff.id, false));
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).isActive).toBe(false);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.deactivate", entityId: staff.id } })).summary).toBe("Staf henti");

    await unwrap(setStaffActive(staff.id, true));
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).isActive).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "staff.activate", entityId: staff.id } })).toBe(1);
  });

  it("pengaman nonaktifkan: tidak diri sendiri, tidak Super Admin terakhir", async () => {
    expect(await setStaffActive(actorStaffId, false)).toEqual({ ok: false, error: "Anda tidak bisa menonaktifkan akun Anda sendiri." });
    const second = await seedAccount("kedua", "SUPER_ADMIN");
    actor.staffId = "orang-lain"; // seolah pemilik lain yang bertindak
    await unwrap(setStaffActive(second.staff.id, false)); // masih ada pemilik aktif lain: boleh
    await prisma.staff.update({ where: { id: second.staff.id }, data: { isActive: true } });
    await prisma.staff.update({ where: { id: actorStaffId }, data: { isActive: false } });
    expect(await setStaffActive(second.staff.id, false)).toEqual({ ok: false, error: "Harus tersisa minimal satu Super Admin aktif yang punya akun." });
  });

  it("reset kata sandi: kata sandi baru berlaku, yang lama tidak, sesi dicabut, tanda wajib ganti menyala; boleh untuk diri sendiri", async () => {
    const { staff, userId } = await seedAccount("lupa");
    await login("lupa");
    const { credentials } = await unwrap(resetStaffPassword(staff.id));
    expect(credentials.email).toBe(mail("lupa"));
    expect(credentials.tempPassword).toHaveLength(16);
    expect((await login("lupa", credentials.tempPassword)).user.email).toBe(mail("lupa"));
    await expect(login("lupa", PASSWORD)).rejects.toThrow();
    expect(await prisma.session.count({ where: { userId } })).toBe(1); // hanya sesi dari masuk dengan kata sandi baru di atas
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(true);

    const self = await unwrap(resetStaffPassword(actorStaffId));
    expect((await login("pemilik", self.credentials.tempPassword)).user.email).toBe(mail("pemilik"));
    const noAccount = await prisma.staff.create({ data: { slug: `${SLUG}-noacc`, name: "Tanpa Akun", role: "DOKTER" } });
    expect(await resetStaffPassword(noAccount.id)).toEqual({ ok: false, error: "Staf ini belum punya akun." });
    expect(await resetStaffPassword("tidak-ada")).toEqual({ ok: false, error: "Staf tidak ditemukan." });
  });

  it("ganti email: dinormalkan, sesi dicabut, email lama tidak lagi bisa masuk; menolak dobel dan yang sama", async () => {
    const { staff, userId } = await seedAccount("surel");
    await seedAccount("lain");
    await login("surel");
    await unwrap(changeStaffEmail({ staffId: staff.id, email: `  ${mail("baru").toUpperCase()} ` }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(mail("baru"));
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    await expect(login("surel")).rejects.toThrow();
    expect((await auth.api.signInEmail({ body: { email: mail("baru"), password: PASSWORD } })).user.id).toBe(userId);

    expect(await changeStaffEmail({ staffId: staff.id, email: mail("lain") })).toEqual({ ok: false, error: "Email ini sudah dipakai akun lain." });
    expect(await changeStaffEmail({ staffId: staff.id, email: mail("baru") })).toEqual({ ok: false, error: "Email baru sama dengan yang sekarang." });
    expect(await changeStaffEmail({ staffId: staff.id, email: "salah" })).toEqual({ ok: false, error: "Email tidak valid." });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.account.email", entityId: staff.id } })).summary).toContain(`${mail("surel")} → ${mail("baru")}`);
  });

  it("daftar staf memuat email dan tanda wajib ganti", async () => {
    const { credentials } = await unwrap(createStaffWithAccount({ name: "Kelola Daftar Uji", role: "DOKTER", email: mail("daftar") }));
    expect(credentials).not.toBeNull();
    await prisma.staff.create({ data: { slug: `${SLUG}-tanpa`, name: "Tanpa Akun Daftar", role: "TERAPIS" } });
    const rows = await listStaffAccounts();
    expect(rows.find((r) => r.name === "Kelola Daftar Uji")).toMatchObject({ email: mail("daftar"), mustChangePassword: true, role: "DOKTER", isActive: true });
    expect(rows.find((r) => r.name === "Tanpa Akun Daftar")).toMatchObject({ email: null, mustChangePassword: false });
  });

  it("semua aksi hanya untuk Super Admin", async () => {
    actor.role = "DOKTER";
    await expect(listStaffAccounts()).rejects.toThrow("forbidden: staff:manage");
    await expect(createStaffWithAccount({ name: "X", role: "DOKTER", email: mail("x") })).rejects.toThrow("forbidden: staff:manage");
    await expect(createAccountForStaff({ staffId: "a", email: mail("x") })).rejects.toThrow("forbidden: staff:manage");
    await expect(updateStaff({ id: "a", name: "X", role: "DOKTER", showOnWebsite: false })).rejects.toThrow("forbidden: staff:manage");
    await expect(setStaffActive("a", false)).rejects.toThrow("forbidden: staff:manage");
    await expect(resetStaffPassword("a")).rejects.toThrow("forbidden: staff:manage");
    await expect(changeStaffEmail({ staffId: "a", email: mail("x") })).rejects.toThrow("forbidden: staff:manage");
  });
});
```

Run: `npm run test:integration -- tests/integration/staff-accounts.test.ts`
Expected: FAIL (fungsi baru belum ada).

- [ ] **Step 2: Tulis ulang `src/server/staff.ts`**

Seluruh isi berkas menjadi:

```ts
"use server";

import type { Prisma, StaffRole } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { slugify } from "@/lib/slug";
import { roleCanHaveLogin, staffChangeBlock, validateLoginEmail, validateStaffName } from "@/lib/staff-accounts";
import { STAFF_ROLE_LABEL, isStaffRole } from "@/lib/staff-role";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { generateTempPassword } from "@/server/temp-password";

export type StaffRow = {
  id: string;
  name: string;
  role: StaffRole;
  showOnWebsite: boolean;
  isActive: boolean;
  email: string | null;
  mustChangePassword: boolean;
};

/** Kata sandi sementara hanya dikembalikan ke browser pemilik; tidak pernah disimpan, dicatat, atau dimasukkan ke audit. */
export type Credentials = { email: string; tempPassword: string };

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

function revalidateStaff() {
  safeRevalidatePath("/admin/staf");
  safeRevalidatePath("/tentang");
}

export async function listStaffAccounts(): Promise<StaffRow[]> {
  await requireCapability("staff:manage");
  const rows = await prisma.staff.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { user: { select: { email: true, mustChangePassword: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    showOnWebsite: row.showOnWebsite,
    isActive: row.isActive,
    email: row.user?.email ?? null,
    mustChangePassword: row.user?.mustChangePassword ?? false,
  }));
}

const NOT_FOUND = "Staf tidak ditemukan.";
const EMAIL_TAKEN = "Email ini sudah dipakai akun lain.";

/**
 * Membuat akun login untuk staf dan menautkannya. Akun baru wajib mengganti kata sandi. `signUpEmail` ikut membuat satu sesi
 * (tanpa cookie, tidak bisa dipakai siapa pun); dihapus agar tidak tersisa. Bila langkah setelah pembuatan akun gagal, akun
 * itu dibersihkan sehingga tidak ada akun tanpa staf.
 */
async function createLogin(staff: { id: string; name: string }, email: string): Promise<Credentials> {
  if (await prisma.user.findFirst({ where: { email } })) throw new UserFacingError(EMAIL_TAKEN);
  const tempPassword = generateTempPassword();
  const created = await auth.api.signUpEmail({ body: { email, password: tempPassword, name: staff.name } });
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id, mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: created.user.id } }),
    ]);
  } catch (error) {
    await prisma.session.deleteMany({ where: { userId: created.user.id } }).catch(() => undefined);
    await prisma.account.deleteMany({ where: { userId: created.user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: created.user.id } }).catch(() => undefined);
    throw error;
  }
  return { email, tempPassword };
}

/** Jumlah Super Admin aktif yang punya akun; dipanggil setelah baris Super Admin dikunci dalam transaksi yang sama. */
async function countActiveSuperAdminsWithLogin(tx: Prisma.TransactionClient): Promise<number> {
  return tx.staff.count({ where: { role: "SUPER_ADMIN", isActive: true, user: { isNot: null } } });
}

/** Mengunci baris Super Admin supaya dua pemilik yang bertindak bersamaan tidak sama-sama lolos pengaman "minimal satu". */
async function lockSuperAdmins(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Staff" WHERE "role" = 'SUPER_ADMIN' FOR UPDATE`;
}

export async function createStaffWithAccount(input: {
  name: string;
  role: StaffRole;
  showOnWebsite?: boolean;
  email?: string;
}): Promise<ActionResult<{ staffId: string; credentials: Credentials | null }>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const name = validateStaffName(input?.name);
    if (!name.ok) throw new UserFacingError(name.message);
    if (!isStaffRole(input?.role)) throw new UserFacingError("Pilih peran.");
    const role = input.role;

    let email: string | null = null;
    if (roleCanHaveLogin(role)) {
      const checked = validateLoginEmail(input.email);
      if (!checked.ok) throw new UserFacingError(checked.message);
      if (await prisma.user.findFirst({ where: { email: checked.value } })) throw new UserFacingError(EMAIL_TAKEN);
      email = checked.value;
    }

    const staff = await prisma.staff.create({
      data: { slug: await uniqueStaffSlug(name.value), name: name.value, role, showOnWebsite: input.showOnWebsite ?? false },
    });
    let credentials: Credentials | null = null;
    if (email) {
      try {
        credentials = await createLogin(staff, email);
      } catch (error) {
        await prisma.staff.delete({ where: { id: staff.id } }).catch(() => undefined);
        throw error;
      }
    }

    await recordAudit({ actor, action: "staff.create", entity: "Staff", entityId: staff.id, summary: `${staff.name} (${STAFF_ROLE_LABEL[role]})` });
    if (credentials) {
      await recordAudit({ actor, action: "staff.account.create", entity: "Staff", entityId: staff.id, summary: `${staff.name} · ${credentials.email}` });
    }
    revalidateStaff();
    return { staffId: staff.id, credentials };
  });
}

export async function createAccountForStaff(input: { staffId: string; email: string }): Promise<ActionResult<{ credentials: Credentials }>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const staff = await prisma.staff.findUnique({ where: { id: String(input?.staffId ?? "") }, include: { user: { select: { id: true } } } });
    if (!staff) throw new UserFacingError(NOT_FOUND);
    if (staff.user) throw new UserFacingError("Staf ini sudah punya akun.");
    if (!roleCanHaveLogin(staff.role)) throw new UserFacingError("Staf berperan Terapis tidak bisa punya akun.");
    if (!staff.isActive) throw new UserFacingError("Aktifkan staf dulu sebelum membuat akunnya.");
    const email = validateLoginEmail(input.email);
    if (!email.ok) throw new UserFacingError(email.message);

    const credentials = await createLogin(staff, email.value);
    await recordAudit({ actor, action: "staff.account.create", entity: "Staff", entityId: staff.id, summary: `${staff.name} · ${credentials.email}` });
    revalidateStaff();
    return { credentials };
  });
}

export async function updateStaff(input: { id: string; name: string; role: StaffRole; showOnWebsite: boolean }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const name = validateStaffName(input?.name);
    if (!name.ok) throw new UserFacingError(name.message);
    if (!isStaffRole(input?.role)) throw new UserFacingError("Pilih peran.");
    const role = input.role;

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
      await tx.staff.update({ where: { id: target.id }, data: { name: name.value, role, showOnWebsite: Boolean(input.showOnWebsite) } });
      if (target.user && name.value !== target.name) await tx.user.update({ where: { id: target.user.id }, data: { name: name.value } });
      return role === target.role ? name.value : `${name.value} (${STAFF_ROLE_LABEL[target.role]} → ${STAFF_ROLE_LABEL[role]})`;
    });

    await recordAudit({ actor, action: "staff.update", entity: "Staff", entityId: input.id, summary });
    revalidateStaff();
  });
}

export async function setStaffActive(id: string, isActive: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const name = await prisma.$transaction(async (tx) => {
      await lockSuperAdmins(tx);
      const target = await tx.staff.findUnique({ where: { id: String(id ?? "") }, include: { user: { select: { id: true } } } });
      if (!target) throw new UserFacingError(NOT_FOUND);
      if (!isActive && target.isActive) {
        const block = staffChangeBlock({
          actorStaffId: actor.staffId,
          target: { id: target.id, role: target.role, isActive: target.isActive, hasLogin: target.user !== null },
          change: { kind: "deactivate" },
          activeSuperAdminsWithLogin: await countActiveSuperAdminsWithLogin(tx),
        });
        if (block) throw new UserFacingError(block);
      }
      await tx.staff.update({ where: { id: target.id }, data: { isActive } });
      // Akses langsung berhenti walau sesi masih ada (getCurrentStaff menolak staf nonaktif); sesi dicabut juga agar bersih.
      if (!isActive && target.user) await tx.session.deleteMany({ where: { userId: target.user.id } });
      return target.name;
    });

    await recordAudit({ actor, action: isActive ? "staff.activate" : "staff.deactivate", entity: "Staff", entityId: id, summary: name });
    revalidateStaff();
  });
}

export async function resetStaffPassword(staffId: string): Promise<ActionResult<{ credentials: Credentials }>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const staff = await prisma.staff.findUnique({ where: { id: String(staffId ?? "") }, include: { user: { select: { id: true, email: true } } } });
    if (!staff) throw new UserFacingError(NOT_FOUND);
    if (!staff.user) throw new UserFacingError("Staf ini belum punya akun.");

    const ctx = await auth.$context;
    if (!(await ctx.internalAdapter.findCredentialAccount(staff.user.id))) {
      throw new UserFacingError("Akun ini tidak memakai login email dan kata sandi.");
    }
    const tempPassword = generateTempPassword();
    await ctx.internalAdapter.updatePassword(staff.user.id, await ctx.password.hash(tempPassword));
    await prisma.$transaction([
      prisma.user.update({ where: { id: staff.user.id }, data: { mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: staff.user.id } }),
    ]);

    await recordAudit({ actor, action: "staff.account.reset", entity: "Staff", entityId: staff.id, summary: `${staff.name} · ${staff.user.email}` });
    revalidateStaff();
    return { credentials: { email: staff.user.email, tempPassword } };
  });
}

export async function changeStaffEmail(input: { staffId: string; email: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const email = validateLoginEmail(input?.email);
    if (!email.ok) throw new UserFacingError(email.message);
    const staff = await prisma.staff.findUnique({ where: { id: String(input.staffId ?? "") }, include: { user: { select: { id: true, email: true } } } });
    if (!staff) throw new UserFacingError(NOT_FOUND);
    if (!staff.user) throw new UserFacingError("Staf ini belum punya akun.");
    if (staff.user.email === email.value) throw new UserFacingError("Email baru sama dengan yang sekarang.");
    if (await prisma.user.findFirst({ where: { email: email.value } })) throw new UserFacingError(EMAIL_TAKEN);

    await prisma.$transaction([
      prisma.user.update({ where: { id: staff.user.id }, data: { email: email.value } }),
      prisma.session.deleteMany({ where: { userId: staff.user.id } }),
    ]);
    await recordAudit({ actor, action: "staff.account.email", entity: "Staff", entityId: staff.id, summary: `${staff.name}: ${staff.user.email} → ${email.value}` });
    revalidateStaff();
  });
}
```

- [ ] **Step 3: Bereskan pemakai lama dan jalankan uji (GREEN)**

Run: `grep -rn "createStaff\b\|listStaff\b\|setStaffActive" src tests | grep -v "src/server/staff.ts\|tests/integration/staff-accounts.test.ts"`
Expected: hanya `src/app/(admin)/admin/staf/page.tsx` yang memakai `listStaff` (diganti di Task 5) dan baris `createStaffUser` lokal di `tests/integration/auth.test.ts` (nama fungsi lokal, bukan impor; abaikan). Agar `tsc` tetap hijau sampai Task 5, ubah sementara impor halaman Staf:

`src/app/(admin)/admin/staf/page.tsx`: ganti `import { listStaff } from "@/server/staff";` menjadi `import { listStaffAccounts } from "@/server/staff";` dan `await listStaff()` menjadi `await listStaffAccounts()`. `StaffTable` menerima `Staff[]`; ubah impor dan tipenya di `src/components/admin/staff-table.tsx` menjadi `import type { StaffRow } from "@/server/staff";` dengan `GridColDef<StaffRow>[]`, `{ staff }: { staff: StaffRow[] }` (tidak ada kolom yang memakai bidang di luar `StaffRow`).

Run: `npx tsc --noEmit -p . && npm run test:integration -- tests/integration/staff-accounts.test.ts tests/integration/auth.test.ts`
Expected: PASS (14 uji staf + uji auth lama). Bila uji "reset … sesi" melihat 0 sesi: pastikan `login()` setelah reset membuat tepat satu sesi dan tidak ada reset sesudahnya (hitungan 1 di uji itu disengaja).

- [ ] **Step 4: Verifikasi tugas dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run && npm run test:integration -- tests/integration/staff-accounts.test.ts tests/integration/session-gate.test.ts`
Expected: lulus.

```bash
git add src/server/staff.ts "src/app/(admin)/admin/staf/page.tsx" src/components/admin/staff-table.tsx tests/integration/staff-accounts.test.ts
git commit -m "feat: add server actions to create, edit, deactivate, reset, and re-email staff accounts"
```


---

### Task 4: Ganti kata sandi sendiri (aksi, halaman, formulir)

**Files:**
- Create: `src/server/own-password.ts`
- Create: `src/app/(admin)/ganti-kata-sandi/page.tsx`
- Create: `src/components/admin/change-password-form.tsx`
- Create: `src/components/admin/sign-out-button.tsx`
- Test: `tests/integration/own-password.test.ts` (baru), `tests/unit/components/change-password-form.test.tsx` (baru)

**Interfaces:**
- Consumes: `getPendingPasswordChange`, `getCurrentStaff`, `PendingPasswordStaff` (`@/server/session`, Task 1); `validateOwnPasswordChange` (`@/lib/staff-accounts`, Task 2); `recordAudit`.
- Produces: `changeOwnPassword(input: { currentPassword: string; newPassword: string; confirmation: string }): Promise<ActionResult<void>>` (`@/server/own-password`, berkas `"use server"`); `ChangePasswordForm()` dan `SignOutButton()` (komponen klien); rute `/ganti-kata-sandi`.

- [ ] **Step 1: Tulis uji (RED)**

`tests/integration/own-password.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeOwnPassword } from "@/server/own-password";

type Pending = { userId: string; staffId: string; name: string; role: "RESEPSIONIS"; email: string; sessionId: string } | null;
const { state } = vi.hoisted(() => ({ state: { pending: null as Pending } }));
vi.mock("@/server/session", () => ({ getPendingPasswordChange: vi.fn(async () => state.pending) }));

const SLUG = "gantisendiri";
const TEMP = "SementaraAbc234xyz";
const NEW = "kataSandiBaruPanjang1";
const email = `${SLUG}@sundy.test`;

describe("ganti kata sandi sendiri", () => {
  let userId: string;
  let staffId: string;

  async function clean() {
    const users = await prisma.user.findMany({ where: { email: { startsWith: SLUG } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { action: "staff.password.change" } });
    await prisma.staff.deleteMany({ where: { slug: SLUG } });
  }
  const signIn = (password: string) => auth.api.signInEmail({ body: { email, password } });
  const input = (patch: Partial<Parameters<typeof changeOwnPassword>[0]> = {}) => ({ currentPassword: TEMP, newPassword: NEW, confirmation: NEW, ...patch });

  beforeEach(async () => {
    await clean();
    const staff = await prisma.staff.create({ data: { slug: SLUG, name: "Staf Ganti", role: "RESEPSIONIS" } });
    const created = await auth.api.signUpEmail({ body: { email, password: TEMP, name: "Staf Ganti" } });
    await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id, mustChangePassword: true } });
    await prisma.session.deleteMany({ where: { userId: created.user.id } }); // sesi bawaan signUpEmail
    userId = created.user.id;
    staffId = staff.id;
    await signIn(TEMP); // sesi yang sedang dipakai
    await signIn(TEMP); // sesi di perangkat lain
    const current = await prisma.session.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: "asc" } });
    state.pending = { userId, staffId, name: "Staf Ganti", role: "RESEPSIONIS", email, sessionId: current.id };
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("berhasil: kata sandi baru berlaku, yang sementara tidak; tanda mati; hanya sesi ini yang tersisa; audit tanpa kata sandi", async () => {
    const current = state.pending!.sessionId;
    expect(await prisma.session.count({ where: { userId } })).toBe(2);
    expect(await changeOwnPassword(input())).toEqual({ ok: true, data: undefined });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(false);
    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions.map((s) => s.id)).toEqual([current]);
    await expect(signIn(TEMP)).rejects.toThrow();
    expect((await signIn(NEW)).user.email).toBe(email);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.password.change", entityId: staffId } });
    expect(JSON.stringify(audit)).not.toContain(NEW);
    expect(JSON.stringify(audit)).not.toContain(TEMP);
  });

  it("kata sandi saat ini yang salah ditolak, tanda tetap menyala, tidak ada yang berubah", async () => {
    expect(await changeOwnPassword(input({ currentPassword: "salahSalahSalah1" }))).toEqual({ ok: false, error: "Kata sandi saat ini salah." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(true);
    expect(await prisma.session.count({ where: { userId } })).toBe(2);
    expect((await signIn(TEMP)).user.email).toBe(email);
  });

  it("aturan isian ditegakkan di server", async () => {
    expect(await changeOwnPassword(input({ newPassword: "pendek", confirmation: "pendek" }))).toEqual({ ok: false, error: "Kata sandi baru minimal 12 karakter." });
    expect(await changeOwnPassword(input({ confirmation: "berbeda1234567" }))).toEqual({ ok: false, error: "Kata sandi baru dan ulangannya tidak sama." });
    expect(await changeOwnPassword(input({ newPassword: TEMP, confirmation: TEMP }))).toEqual({ ok: false, error: "Kata sandi baru harus berbeda dari yang sementara." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(true);
  });

  it("akun yang tidak menunggu ganti kata sandi tidak bisa memakai aksi ini", async () => {
    state.pending = null;
    expect(await changeOwnPassword(input())).toEqual({ ok: false, error: "Anda tidak perlu mengganti kata sandi sekarang. Muat ulang halaman." });
    expect((await signIn(TEMP)).user.email).toBe(email);
  });
});
```

`tests/unit/components/change-password-form.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { changeOwnPassword } from "@/server/own-password";
import { renderAdmin } from "../helpers/render-admin";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/server/own-password", () => ({ changeOwnPassword: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

async function fill(current = "SementaraAbc234xyz", next = "kataSandiBaruPanjang1", again = "kataSandiBaruPanjang1") {
  await userEvent.type(screen.getByLabelText("Kata sandi saat ini"), current);
  await userEvent.type(screen.getByLabelText("Kata sandi baru", { exact: true }), next);
  await userEvent.type(screen.getByLabelText("Ulangi kata sandi baru"), again);
}

describe("formulir ganti kata sandi", () => {
  it("menampilkan aturan 12 karakter dan tiga isian kata sandi", () => {
    renderAdmin(<ChangePasswordForm />);
    expect(screen.getByText("Minimal 12 karakter.")).toBeInTheDocument();
    for (const label of ["Kata sandi saat ini", "Kata sandi baru", "Ulangi kata sandi baru"]) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute("type", "password");
    }
  });

  it("mengirim isian, lalu masuk ke panel dan memuat ulang", async () => {
    vi.mocked(changeOwnPassword).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<ChangePasswordForm />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    await waitFor(() =>
      expect(changeOwnPassword).toHaveBeenCalledWith({ currentPassword: "SementaraAbc234xyz", newPassword: "kataSandiBaruPanjang1", confirmation: "kataSandiBaruPanjang1" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
    expect(refresh).toHaveBeenCalled();
  });

  it("menampilkan galat dari server dan tidak berpindah halaman", async () => {
    vi.mocked(changeOwnPassword).mockResolvedValue({ ok: false, error: "Kata sandi saat ini salah." });
    renderAdmin(<ChangePasswordForm />);
    await fill("salah");
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kata sandi saat ini salah.");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Simpan kata sandi baru" })).toBeEnabled();
  });

  it("galat tak terduga ditulis dengan pesan umum, bukan dibiarkan kosong", async () => {
    vi.mocked(changeOwnPassword).mockRejectedValue(new Error("jaringan putus"));
    renderAdmin(<ChangePasswordForm />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal menyimpan. Coba lagi.");
  });
});
```

Run: `npm run test:integration -- tests/integration/own-password.test.ts` dan `npx vitest run tests/unit/components/change-password-form.test.tsx`
Expected: FAIL (modul belum ada).

- [ ] **Step 2: Implementasi**

`src/server/own-password.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateOwnPasswordChange } from "@/lib/staff-accounts";
import { recordAudit } from "@/server/audit";
import { getPendingPasswordChange } from "@/server/session";

/**
 * Mengganti kata sandi sendiri (spec kelola staf 5.3). Hanya untuk akun yang wajib mengganti (akun baru atau yang baru
 * direset): memakai `getPendingPasswordChange`, sehingga akun lain, atau yang belum login, ditolak. Kata sandi saat ini
 * diperiksa lebih dulu; setelah berhasil, tanda dimatikan dan semua sesi lain dikeluarkan (sesi ini tetap).
 */
export async function changeOwnPassword(input: { currentPassword: string; newPassword: string; confirmation: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const pending = await getPendingPasswordChange();
    if (!pending) throw new UserFacingError("Anda tidak perlu mengganti kata sandi sekarang. Muat ulang halaman.");
    const checked = validateOwnPasswordChange({
      currentPassword: String(input?.currentPassword ?? ""),
      newPassword: String(input?.newPassword ?? ""),
      confirmation: String(input?.confirmation ?? ""),
    });
    if (!checked.ok) throw new UserFacingError(checked.message);

    const ctx = await auth.$context;
    const credential = await ctx.internalAdapter.findCredentialAccount(pending.userId);
    const valid = credential?.password ? await ctx.password.verify({ hash: credential.password, password: input.currentPassword }) : false;
    if (!valid) throw new UserFacingError("Kata sandi saat ini salah.");

    await ctx.internalAdapter.updatePassword(pending.userId, await ctx.password.hash(checked.value));
    await prisma.$transaction([
      prisma.user.update({ where: { id: pending.userId }, data: { mustChangePassword: false } }),
      prisma.session.deleteMany({ where: { userId: pending.userId, id: { not: pending.sessionId } } }),
    ]);
    await recordAudit({ actor: pending, action: "staff.password.change", entity: "Staff", entityId: pending.staffId, summary: pending.name });
  });
}
```

`src/components/admin/change-password-form.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-accounts";
import { changeOwnPassword } from "@/server/own-password";

/** Formulir halaman Ganti kata sandi (spec kelola staf 5.3). */
export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await changeOwnPassword({ currentPassword, newPassword, confirmation });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <TextField id="kata-sandi-saat-ini" label="Kata sandi saat ini" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} fullWidth />
      <TextField
        id="kata-sandi-baru"
        label="Kata sandi baru"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        helperText={`Minimal ${MIN_PASSWORD_LENGTH} karakter.`}
        fullWidth
      />
      <TextField id="ulangi-kata-sandi-baru" label="Ulangi kata sandi baru" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" size="large" fullWidth disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan kata sandi baru"}
      </Button>
    </Box>
  );
}
```

`src/components/admin/sign-out-button.tsx`:

```tsx
"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

/** Tombol Keluar untuk halaman tanpa menu panel (mis. Ganti kata sandi). */
export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="text"
      color="inherit"
      onClick={async () => {
        await signOut();
        router.push("/masuk");
        router.refresh();
      }}
    >
      Keluar
    </Button>
  );
}
```

`src/app/(admin)/ganti-kata-sandi/page.tsx`:

```tsx
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { getCurrentStaff, getPendingPasswordChange } from "@/server/session";

export const metadata: Metadata = {
  title: "Ganti kata sandi",
  robots: { index: false, follow: false },
};

/** Di luar layout /admin (tanpa menu panel): hanya untuk akun yang wajib membuat kata sandi sendiri. */
export default async function ChangePasswordPage() {
  const pending = await getPendingPasswordChange();
  if (!pending) redirect((await getCurrentStaff()) ? "/admin" : "/masuk");

  return (
    <Box sx={{ minHeight: "100svh", display: "grid", placeItems: "center", px: 2, bgcolor: "background.default" }}>
      <Card sx={{ width: "100%", maxWidth: 420, p: 4 }}>
        <Typography variant="h1" sx={{ fontSize: "1.75rem" }}>
          Buat kata sandi baru
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, mb: 3 }}>
          {CLINIC_FULL_NAME} · {pending.email}. Kata sandi sementara dari pemilik hanya berlaku untuk masuk pertama. Buat kata sandi yang hanya Anda yang tahu.
        </Typography>
        <ChangePasswordForm />
        <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
          <SignOutButton />
        </Box>
      </Card>
    </Box>
  );
}
```

- [ ] **Step 3: Jalankan uji (GREEN)**

Run: `npx tsc --noEmit -p . && npm run test:integration -- tests/integration/own-password.test.ts && npx vitest run tests/unit/components/change-password-form.test.tsx tests/unit/architecture.test.ts`
Expected: PASS (4 uji integrasi, 4 uji komponen, arsitektur utuh: halaman tidak mengimpor Prisma).

- [ ] **Step 4: Commit**

```bash
git add src/server/own-password.ts "src/app/(admin)/ganti-kata-sandi" src/components/admin/change-password-form.tsx src/components/admin/sign-out-button.tsx tests/integration/own-password.test.ts tests/unit/components/change-password-form.test.tsx
git commit -m "feat: add the change-password page for accounts that must set their own password"
```

---

### Task 5: Layar pengelolaan di halaman Staf

**Files:**
- Create: `src/components/admin/staff/staff-manager.tsx`
- Create: `src/components/admin/staff/temp-password-dialog.tsx`
- Create: `src/components/admin/staff/staff-form-dialog.tsx`
- Create: `src/components/admin/staff/staff-email-dialog.tsx`
- Create: `src/components/admin/staff/staff-confirm-dialog.tsx`
- Modify: `src/app/(admin)/admin/staf/page.tsx`
- Delete: `src/components/admin/staff-table.tsx` (digantikan `StaffManager`; periksa `grep -rn "staff-table\|StaffTable" src tests` dan perbarui/hapus pemakai dan ujinya)
- Modify: `src/server/staff.ts` (satu perbaikan kecil di `resetStaffPassword`, Step 1)
- Test: `tests/unit/components/staff-manager.test.tsx` (baru)

**Interfaces:**
- Consumes: semua dari `@/server/staff` (Task 3: `StaffRow`, `Credentials`, `createStaffWithAccount`, `createAccountForStaff`, `updateStaff`, `setStaffActive`, `resetStaffPassword`, `changeStaffEmail`, `listStaffAccounts`); `roleCanHaveLogin`; `STAFF_ROLE_LABEL`; `AdminDataGrid`, `SelectField`, `StatusChip`, `PageBody`/`PageHeader`.
- Produces: `StaffManager({ rows, currentStaffId }: { rows: StaffRow[]; currentStaffId: string })`; dialog dengan nama aksesibel: `Tambah staf`, `Ubah — <nama>`, `Buat akun — <nama>`, `Ganti email — <nama>`, `Kata sandi sementara — <nama>` (berisi `data-testid="kata-sandi-sementara"`), dan `alertdialog` `Nonaktifkan <nama>?` serta `Reset kata sandi <nama>?`.

- [ ] **Step 1: Perbaikan kecil: reset kata sandi diri sendiri tidak boleh me-refresh halaman**

Setelah pemilik mereset akunnya sendiri, sesinya habis; `revalidatePath` dari aksi membuat Next memuat ulang rute saat itu juga, yang akan mengalihkannya ke `/masuk` dan menghapus dialog kata sandi sementara sebelum sempat disalin. Di `src/server/staff.ts`, `resetStaffPassword`, ganti `revalidateStaff();` dengan:

```ts
    // Mereset akun sendiri mencabut sesi ini; me-refresh rute sekarang akan melempar pemilik ke /masuk sebelum sempat menyalin kata sandi.
    // Layar memuat ulang sendiri saat dialog ditutup.
    if (staff.id !== actor.staffId) revalidateStaff();
```

Run: `npm run test:integration -- tests/integration/staff-accounts.test.ts` → PASS (tidak ada perubahan perilaku yang terlihat uji).

- [ ] **Step 2: Tulis uji komponen (RED)**

`tests/unit/components/staff-manager.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffManager } from "@/components/admin/staff/staff-manager";
import { changeStaffEmail, createAccountForStaff, createStaffWithAccount, resetStaffPassword, setStaffActive, updateStaff, type StaffRow } from "@/server/staff";
import { mockGridLayout } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/staff", () => ({
  createStaffWithAccount: vi.fn(),
  createAccountForStaff: vi.fn(),
  updateStaff: vi.fn(),
  setStaffActive: vi.fn(),
  resetStaffPassword: vi.fn(),
  changeStaffEmail: vi.fn(),
}));

const row = (patch: Partial<StaffRow>): StaffRow => ({ id: "x", name: "X", role: "RESEPSIONIS", showOnWebsite: false, isActive: true, email: null, mustChangePassword: false, ...patch });
const OWNER = row({ id: "s-owner", name: "Pemilik SunDY", role: "SUPER_ADMIN", email: "admin@sundyclinic.com" });
const DOKTER = row({ id: "s-dokter", name: "Dr. Diane", role: "DOKTER" });
const TERAPIS = row({ id: "s-terapis", name: "Terapis Mahakeret", role: "TERAPIS" });
const BARU = row({ id: "s-baru", name: "Rina Baru", role: "RESEPSIONIS", email: "rina@sundy.test", mustChangePassword: true });
const OFF = row({ id: "s-off", name: "Budi Berhenti", role: "APOTEKER", email: "budi@sundy.test", isActive: false });
const ROWS = [OWNER, DOKTER, TERAPIS, BARU, OFF];

const TEMP = "Ab3dEfGhJkMnPqRs";
const credentials = { email: "rina@sundy.test", tempPassword: TEMP };

function renderManager(rows = ROWS) {
  return renderAdmin(<StaffManager rows={rows} currentStaffId="s-owner" />);
}
async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Aksi lain ${name}` }));
  return screen.getByRole("menu");
}
const items = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((i) => i.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  mockGridLayout();
});

describe("daftar dan menu aksi", () => {
  it("menampilkan email, 'Belum punya akun', tanda wajib ganti, dan status", () => {
    renderManager();
    const grid = screen.getByRole("grid", { name: "Daftar staf" });
    expect(within(grid).getByText("admin@sundyclinic.com")).toBeInTheDocument();
    expect(within(grid).getAllByText("Belum punya akun")).toHaveLength(2);
    expect(within(grid).getByText("Wajib ganti kata sandi")).toBeInTheDocument();
    expect(within(grid).getByText("Nonaktif")).toBeInTheDocument();
  });

  it("menu tiap baris hanya berisi aksi yang berlaku", async () => {
    const user = userEvent.setup();
    renderManager();
    expect(items(await openMenu(user, "Dr. Diane"))).toEqual(["Ubah", "Buat akun", "Nonaktifkan"]);
    await user.keyboard("{Escape}");
    expect(items(await openMenu(user, "Terapis Mahakeret"))).toEqual(["Ubah", "Nonaktifkan"]);
    await user.keyboard("{Escape}");
    expect(items(await openMenu(user, "Rina Baru"))).toEqual(["Ubah", "Reset kata sandi", "Ganti email", "Nonaktifkan"]);
    await user.keyboard("{Escape}");
    expect(items(await openMenu(user, "Budi Berhenti"))).toEqual(["Ubah", "Reset kata sandi", "Ganti email", "Aktifkan"]);
  });

  it("pemilik tidak punya 'Nonaktifkan' untuk dirinya sendiri, tetapi boleh mereset akunnya", async () => {
    const user = userEvent.setup();
    renderManager();
    expect(items(await openMenu(user, "Pemilik SunDY"))).toEqual(["Ubah", "Reset kata sandi", "Ganti email"]);
  });
});

describe("tambah staf", () => {
  it("mengirim isian, menampilkan kata sandi sementara satu kali, dan menghapusnya dari layar saat ditutup", async () => {
    vi.mocked(createStaffWithAccount).mockResolvedValue({ ok: true, data: { staffId: "baru", credentials } });
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "+ Tambah staf" }));
    const form = await screen.findByRole("dialog", { name: "Tambah staf" });
    await user.type(within(form).getByLabelText("Nama"), "Rina Baru");
    await user.selectOptions(within(form).getByLabelText("Peran"), "RESEPSIONIS");
    await user.type(within(form).getByLabelText("Email login"), "rina@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Tambah staf" }));

    await waitFor(() => expect(createStaffWithAccount).toHaveBeenCalledWith({ name: "Rina Baru", role: "RESEPSIONIS", showOnWebsite: false, email: "rina@sundy.test" }));
    const temp = await screen.findByRole("dialog", { name: "Kata sandi sementara — Rina Baru" });
    expect(within(temp).getByTestId("kata-sandi-sementara")).toHaveTextContent(TEMP);
    expect(within(temp).getByText("rina@sundy.test")).toBeInTheDocument();
    expect(within(temp).getByText(/hanya tampil sekali/i)).toBeInTheDocument();

    await user.click(within(temp).getByRole("button", { name: "Salin kata sandi" }));
    expect(await navigator.clipboard.readText()).toBe(TEMP);

    await user.click(within(temp).getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Kata sandi sementara/ })).toBeNull());
    expect(screen.queryByText(TEMP)).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("peran Terapis menyembunyikan isian email dan tidak meminta akun", async () => {
    vi.mocked(createStaffWithAccount).mockResolvedValue({ ok: true, data: { staffId: "t", credentials: null } });
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "+ Tambah staf" }));
    const form = await screen.findByRole("dialog", { name: "Tambah staf" });
    expect(within(form).getByLabelText("Email login")).toBeInTheDocument();
    await user.selectOptions(within(form).getByLabelText("Peran"), "TERAPIS");
    expect(within(form).queryByLabelText("Email login")).toBeNull();
    expect(within(form).getByText("Terapis tidak punya akun login.")).toBeInTheDocument();
    await user.type(within(form).getByLabelText("Nama"), "Terapis Baru");
    await user.click(within(form).getByRole("button", { name: "Tambah staf" }));
    await waitFor(() => expect(createStaffWithAccount).toHaveBeenCalledWith({ name: "Terapis Baru", role: "TERAPIS", showOnWebsite: false, email: undefined }));
    expect(screen.queryByRole("dialog", { name: /Kata sandi sementara/ })).toBeNull();
  });

  it("galat dari server tampil di dalam dialog dan dialog tetap terbuka", async () => {
    vi.mocked(createStaffWithAccount).mockResolvedValue({ ok: false, error: "Email ini sudah dipakai akun lain." });
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "+ Tambah staf" }));
    const form = await screen.findByRole("dialog", { name: "Tambah staf" });
    await user.type(within(form).getByLabelText("Nama"), "Dobel");
    await user.type(within(form).getByLabelText("Email login"), "ada@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Tambah staf" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Email ini sudah dipakai akun lain.");
    expect(screen.getByRole("dialog", { name: "Tambah staf" })).toBeInTheDocument();
  });
});

describe("aksi per baris", () => {
  it("Ubah: mengirim nama, peran, dan tampil di situs", async () => {
    vi.mocked(updateStaff).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Dr. Diane");
    await user.click(screen.getByRole("menuitem", { name: "Ubah" }));
    const form = await screen.findByRole("dialog", { name: "Ubah — Dr. Diane" });
    expect(within(form).getByLabelText("Nama")).toHaveValue("Dr. Diane");
    expect(within(form).queryByLabelText("Email login")).toBeNull();
    await user.click(within(form).getByLabelText("Tampil di situs publik"));
    await user.click(within(form).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith({ id: "s-dokter", name: "Dr. Diane", role: "DOKTER", showOnWebsite: true }));
  });

  it("Buat akun: meminta email lalu menampilkan kata sandi sementara", async () => {
    vi.mocked(createAccountForStaff).mockResolvedValue({ ok: true, data: { credentials: { email: "diane@sundy.test", tempPassword: TEMP } } });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Dr. Diane");
    await user.click(screen.getByRole("menuitem", { name: "Buat akun" }));
    const form = await screen.findByRole("dialog", { name: "Buat akun — Dr. Diane" });
    await user.type(within(form).getByLabelText("Email login"), "diane@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Buat akun" }));
    await waitFor(() => expect(createAccountForStaff).toHaveBeenCalledWith({ staffId: "s-dokter", email: "diane@sundy.test" }));
    expect(await screen.findByRole("dialog", { name: "Kata sandi sementara — Dr. Diane" })).toBeInTheDocument();
  });

  it("Ganti email: terisi email sekarang dan mengirim yang baru", async () => {
    vi.mocked(changeStaffEmail).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Ganti email" }));
    const form = await screen.findByRole("dialog", { name: "Ganti email — Rina Baru" });
    const field = within(form).getByLabelText("Email login");
    expect(field).toHaveValue("rina@sundy.test");
    await user.clear(field);
    await user.type(field, "rina.baru@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Ganti email" }));
    await waitFor(() => expect(changeStaffEmail).toHaveBeenCalledWith({ staffId: "s-baru", email: "rina.baru@sundy.test" }));
  });

  it("Nonaktifkan: konfirmasi menjelaskan akibatnya; galat server tampil di dialog", async () => {
    vi.mocked(setStaffActive).mockResolvedValueOnce({ ok: false, error: "Harus tersisa minimal satu Super Admin aktif yang punya akun." }).mockResolvedValueOnce({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Nonaktifkan" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Nonaktifkan Rina Baru?" });
    expect(confirm).toHaveAccessibleDescription(/langsung keluar dari semua perangkat/);
    await user.click(within(confirm).getByRole("button", { name: "Nonaktifkan" }));
    expect(await within(confirm).findByText("Harus tersisa minimal satu Super Admin aktif yang punya akun.")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Nonaktifkan" }));
    await waitFor(() => expect(setStaffActive).toHaveBeenLastCalledWith("s-baru", false));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("Aktifkan langsung jalan tanpa konfirmasi", async () => {
    vi.mocked(setStaffActive).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Budi Berhenti");
    await user.click(screen.getByRole("menuitem", { name: "Aktifkan" }));
    await waitFor(() => expect(setStaffActive).toHaveBeenCalledWith("s-off", true));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Reset kata sandi staf lain: konfirmasi, lalu kata sandi sementara", async () => {
    vi.mocked(resetStaffPassword).mockResolvedValue({ ok: true, data: { credentials } });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Reset kata sandi" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Reset kata sandi Rina Baru?" });
    expect(confirm).not.toHaveAccessibleDescription(/Anda akan keluar/);
    await user.click(within(confirm).getByRole("button", { name: "Reset kata sandi" }));
    expect(await screen.findByRole("dialog", { name: "Kata sandi sementara — Rina Baru" })).toBeInTheDocument();
    expect(resetStaffPassword).toHaveBeenCalledWith("s-baru");
  });

  it("Reset kata sandi sendiri: peringatan keluar; refresh ditunda sampai dialog ditutup, lalu ke /masuk", async () => {
    vi.mocked(resetStaffPassword).mockResolvedValue({ ok: true, data: { credentials: { email: "admin@sundyclinic.com", tempPassword: TEMP } } });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Pemilik SunDY");
    await user.click(screen.getByRole("menuitem", { name: "Reset kata sandi" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Reset kata sandi Pemilik SunDY?" });
    expect(confirm).toHaveAccessibleDescription(/Anda akan keluar dari semua perangkat/);
    await user.click(within(confirm).getByRole("button", { name: "Reset kata sandi" }));
    const temp = await screen.findByRole("dialog", { name: "Kata sandi sementara — Pemilik SunDY" });
    expect(refresh).not.toHaveBeenCalled();
    await user.click(within(temp).getByRole("button", { name: "Tutup" }));
    expect(push).toHaveBeenCalledWith("/masuk");
  });
});
```

Run: `npx vitest run tests/unit/components/staff-manager.test.tsx`
Expected: FAIL (komponen belum ada).

- [ ] **Step 3: Dialog-dialog**

`src/components/admin/staff/temp-password-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { toast } from "sonner";
import type { Credentials } from "@/server/staff";

/**
 * Kata sandi sementara yang tampil sekali (spec kelola staf 5.2). Hanya hidup di state pemanggil: menutup dialog membuangnya.
 * Klik di luar dialog tidak menutupnya, supaya kata sandi tidak hilang sebelum sempat disalin.
 */
export function TempPasswordDialog({ name, credentials, onClose }: { name: string; credentials: Credentials; onClose: () => void }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(credentials.tempPassword);
      toast.success("Kata sandi disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <Dialog open onClose={(_, reason) => reason !== "backdropClick" && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>Kata sandi sementara — {name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Email login
            </Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>{credentials.email}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Kata sandi sementara
            </Typography>
            <Box
              data-testid="kata-sandi-sementara"
              sx={{ fontFamily: "ui-monospace, monospace", fontSize: "1.25rem", letterSpacing: "0.05em", userSelect: "all", overflowWrap: "anywhere" }}
            >
              {credentials.tempPassword}
            </Box>
          </Box>
          <Box>
            <Button variant="outlined" onClick={() => void copy()}>
              Salin kata sandi
            </Button>
          </Box>
          <Alert severity="warning">Kata sandi ini hanya tampil sekali. Sampaikan ke staf; ia wajib menggantinya saat masuk pertama.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Tutup
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

`src/components/admin/staff/staff-confirm-dialog.tsx`:

```tsx
"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useId, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

/** Konfirmasi tindakan yang berdampak (nonaktifkan, reset). Galat server tampil di dalam dialog, dialog tetap terbuka. */
export function StaffConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<ActionResult<unknown>>;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-describedby={`${id}-desc`} slotProps={{ paper: { role: "alertdialog" } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${id}-desc`}>{description}</DialogContentText>
        {error && (
          <DialogContentText role="alert" sx={{ mt: 2, color: "error.main" }}>
            {error}
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Kembali</Button>
        <Button color="error" variant="contained" disabled={pending} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

`src/components/admin/staff/staff-form-dialog.tsx`:

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
import { roleCanHaveLogin } from "@/lib/staff-accounts";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import { createStaffWithAccount, updateStaff, type Credentials, type StaffRow } from "@/server/staff";
import { SelectField } from "../mui/select-field";

const ROLES = Object.keys(STAFF_ROLE_LABEL) as StaffRole[];

/** Tambah staf (dengan akun bila perannya boleh) atau ubah nama, peran, dan tampil di situs (spec kelola staf 5.1). */
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const title = mode === "add" ? "Tambah staf" : `Ubah — ${row?.name ?? ""}`;
  const needsEmail = mode === "add" && roleCanHaveLogin(role);

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
      const result = await updateStaff({ id: row!.id, name, role, showOnWebsite });
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
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { component: "form", onSubmit: submit, noValidate: true } }}>
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
          {needsEmail && (
            <TextField
              id="staf-email"
              label="Email login"
              type="email"
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

`src/components/admin/staff/staff-email-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { changeStaffEmail, createAccountForStaff, type Credentials, type StaffRow } from "@/server/staff";

/** "Buat akun" untuk staf tanpa akun, atau "Ganti email" untuk yang sudah punya (spec kelola staf 5.1). */
export function StaffEmailDialog({
  mode,
  row,
  onClose,
  onCredentials,
}: {
  mode: "create" | "change";
  row: StaffRow;
  onClose: () => void;
  onCredentials: (name: string, credentials: Credentials) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(mode === "change" ? (row.email ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const label = mode === "create" ? "Buat akun" : "Ganti email";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "create") {
        const result = await createAccountForStaff({ staffId: row.id, email });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        onCredentials(row.name, result.data.credentials);
        return;
      }
      const result = await changeStaffEmail({ staffId: row.id, email });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Email diganti. Staf keluar dari semua perangkat.");
      router.refresh();
      onClose();
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { component: "form", onSubmit: submit, noValidate: true } }}>
      <DialogTitle>
        {label} — {row.name}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            id="staf-email-login"
            label="Email login"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            helperText={mode === "create" ? "Kata sandi sementara dibuat otomatis dan tampil sekali setelah disimpan." : "Staf keluar dari semua perangkat dan masuk lagi dengan email baru."}
            autoFocus
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Batal</Button>
        <Button type="submit" variant="contained" disabled={pending}>
          {label}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 4: `StaffManager`**

`src/components/admin/staff/staff-manager.tsx`:

```tsx
"use client";

import MoreHoriz from "@mui/icons-material/MoreHoriz";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { roleCanHaveLogin } from "@/lib/staff-accounts";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import { resetStaffPassword, setStaffActive, type Credentials, type StaffRow } from "@/server/staff";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { StatusChip } from "../mui/status-chip";
import { SectionCard } from "../page-layout";
import { StaffConfirmDialog } from "./staff-confirm-dialog";
import { StaffEmailDialog } from "./staff-email-dialog";
import { StaffFormDialog } from "./staff-form-dialog";
import { TempPasswordDialog } from "./temp-password-dialog";

type Dialog =
  | { kind: "add" }
  | { kind: "edit"; row: StaffRow }
  | { kind: "account"; row: StaffRow }
  | { kind: "email"; row: StaffRow }
  | { kind: "deactivate"; row: StaffRow }
  | { kind: "reset"; row: StaffRow };

/** Daftar staf dan seluruh aksi pengelolaannya (spec kelola staf 5.1). */
export function StaffManager({ rows, currentStaffId }: { rows: StaffRow[]; currentStaffId: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: StaffRow } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [temp, setTemp] = useState<{ name: string; credentials: Credentials; selfReset: boolean } | null>(null);

  function open(next: Dialog) {
    setMenu(null);
    setDialog(next);
  }
  function showCredentials(name: string, credentials: Credentials, selfReset = false) {
    setDialog(null);
    setTemp({ name, credentials, selfReset });
  }
  function closeTemp() {
    const selfReset = temp?.selfReset ?? false;
    setTemp(null);
    // Mereset akun sendiri mencabut sesi ini: pindah ke /masuk hanya setelah kata sandi sempat disalin.
    if (selfReset) router.push("/masuk");
    router.refresh();
  }
  async function activate(row: StaffRow) {
    setMenu(null);
    try {
      const result = await setStaffActive(row.id, true);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${row.name} diaktifkan.`);
      router.refresh();
    } catch {
      toast.error("Aksi gagal. Coba lagi.");
    }
  }

  const columns: GridColDef<StaffRow>[] = [
    { field: "name", headerName: "Nama", flex: 1, minWidth: 180, renderCell: ({ row }) => <Typography sx={{ fontWeight: 500, fontSize: "inherit" }}>{row.name}</Typography> },
    { field: "role", headerName: "Peran", minWidth: 150, valueGetter: (_value, row) => STAFF_ROLE_LABEL[row.role], renderCell: ({ row }) => <StatusChip label={STAFF_ROLE_LABEL[row.role]} /> },
    {
      field: "email",
      headerName: "Akun",
      flex: 1.2,
      minWidth: 230,
      valueGetter: (_value, row) => row.email ?? "Belum punya akun",
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.5, minWidth: 0 }}>
          {row.email ? <Box sx={{ overflowWrap: "anywhere" }}>{row.email}</Box> : <Box sx={{ color: "text.secondary" }}>Belum punya akun</Box>}
          {row.mustChangePassword && (
            <Box sx={{ mt: 0.5 }}>
              <StatusChip label="Wajib ganti kata sandi" tone="warning" />
            </Box>
          )}
        </Box>
      ),
    },
    {
      field: "isActive",
      headerName: "Status",
      minWidth: 120,
      valueGetter: (_value, row) => (row.isActive ? "Aktif" : "Nonaktif"),
      renderCell: ({ row }) => <StatusChip label={row.isActive ? "Aktif" : "Nonaktif"} tone={row.isActive ? "success" : "neutral"} />,
    },
    {
      field: "actions",
      headerName: "Aksi",
      width: 80,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <IconButton size="small" aria-label={`Aksi lain ${row.name}`} aria-haspopup="menu" onClick={(event) => setMenu({ anchor: event.currentTarget, row })}>
          <MoreHoriz fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const target = menu?.row;
  const self = target?.id === currentStaffId;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => open({ kind: "add" })}>
          + Tambah staf
        </Button>
      </Box>
      <SectionCard title="Daftar staf" flush>
        <AdminDataGrid rows={rows} columns={columns} label="Daftar staf" emptyText="Belum ada staf." />
      </SectionCard>

      <Menu anchorEl={menu?.anchor ?? null} open={menu !== null} onClose={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {target && <MenuItem onClick={() => open({ kind: "edit", row: target })}>Ubah</MenuItem>}
        {target && !target.email && roleCanHaveLogin(target.role) && target.isActive && <MenuItem onClick={() => open({ kind: "account", row: target })}>Buat akun</MenuItem>}
        {target?.email && <MenuItem onClick={() => open({ kind: "reset", row: target })}>Reset kata sandi</MenuItem>}
        {target?.email && <MenuItem onClick={() => open({ kind: "email", row: target })}>Ganti email</MenuItem>}
        {target && target.isActive && !self && (
          <MenuItem sx={{ color: "error.main" }} onClick={() => open({ kind: "deactivate", row: target })}>
            Nonaktifkan
          </MenuItem>
        )}
        {target && !target.isActive && <MenuItem onClick={() => void activate(target)}>Aktifkan</MenuItem>}
      </Menu>

      {dialog?.kind === "add" && <StaffFormDialog mode="add" onClose={() => setDialog(null)} onCredentials={showCredentials} />}
      {dialog?.kind === "edit" && <StaffFormDialog key={dialog.row.id} mode="edit" row={dialog.row} onClose={() => setDialog(null)} onCredentials={showCredentials} />}
      {dialog?.kind === "account" && <StaffEmailDialog key={dialog.row.id} mode="create" row={dialog.row} onClose={() => setDialog(null)} onCredentials={showCredentials} />}
      {dialog?.kind === "email" && <StaffEmailDialog key={dialog.row.id} mode="change" row={dialog.row} onClose={() => setDialog(null)} onCredentials={showCredentials} />}
      {dialog?.kind === "deactivate" && (
        <StaffConfirmDialog
          title={`Nonaktifkan ${dialog.row.name}?`}
          description="Staf langsung keluar dari semua perangkat dan tidak bisa masuk lagi sampai diaktifkan kembali. Riwayat kerjanya tetap utuh."
          confirmLabel="Nonaktifkan"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await setStaffActive(dialog.row.id, false);
            if (result.ok) {
              toast.success(`${dialog.row.name} dinonaktifkan.`);
              router.refresh();
            }
            return result;
          }}
        />
      )}
      {dialog?.kind === "reset" && (
        <StaffConfirmDialog
          title={`Reset kata sandi ${dialog.row.name}?`}
          description={
            dialog.row.id === currentStaffId
              ? "Anda akan keluar dari semua perangkat dan harus membuat kata sandi baru saat masuk lagi. Kata sandi sementara tampil sekali di layar ini; salin dulu sebelum menutupnya."
              : "Kata sandi lama berhenti berlaku dan staf keluar dari semua perangkat. Anda akan mendapat kata sandi sementara untuk disampaikan ke staf."
          }
          confirmLabel="Reset kata sandi"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await resetStaffPassword(dialog.row.id);
            if (result.ok) showCredentials(dialog.row.name, result.data.credentials, dialog.row.id === currentStaffId);
            return result;
          }}
        />
      )}
      {temp && <TempPasswordDialog name={temp.name} credentials={temp.credentials} onClose={closeTemp} />}
    </Stack>
  );
}
```

- [ ] **Step 5: Halaman Staf, hapus komponen lama, jalankan uji**

`src/app/(admin)/admin/staf/page.tsx` menjadi:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { StaffManager } from "@/components/admin/staff/staff-manager";
import { listStaffAccounts } from "@/server/staff";
import { requireCapability } from "@/server/session";

export default async function StaffPage() {
  const staff = await requireCapability("staff:manage");
  const rows = await listStaffAccounts();

  return (
    <>
      <AdminHeader title="Staf" />
      <PageBody>
        <PageHeader title="Staf" description="Akun staf dan perannya di panel. Staf berperan Terapis tidak punya akun login." />
        <StaffManager rows={rows} currentStaffId={staff.staffId} />
      </PageBody>
    </>
  );
}
```

Run: `git rm src/components/admin/staff-table.tsx` lalu `grep -rn "staff-table\|StaffTable" src tests` (perbarui atau hapus pemakai/ujinya, mis. uji yang merender `StaffTable`; ganti dengan `StaffManager` bila relevan).
Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run tests/unit/components/staff-manager.test.tsx tests/unit/architecture.test.ts`
Expected: PASS (12 uji komponen). Bila `navigator.clipboard.readText` tidak tersedia, pasang `userEvent.setup()` sebelum merender (sudah) dan pastikan `user` yang sama dipakai; jangan mengganti dengan tiruan global.

- [ ] **Step 6: Verifikasi tugas dan commit**

Run: `npx vitest run && npm run test:integration -- tests/integration/staff-accounts.test.ts tests/integration/own-password.test.ts tests/integration/session-gate.test.ts`
Expected: lulus.

```bash
git add src/components/admin/staff "src/app/(admin)/admin/staf/page.tsx" src/server/staff.ts tests/unit/components/staff-manager.test.tsx
git add -u src/components/admin/staff-table.tsx tests
git commit -m "feat: manage staff accounts from the Staff page"
```

---

### Task 6: E2E, pembersihan data uji, dan runbook

**Files:**
- Modify: `tests/e2e/prepare-db.mts` (bersihkan akun uji dari putaran sebelumnya)
- Create: `tests/e2e/kelola-staf.spec.ts`
- Modify: `docs/operasional/server-sundy.md` (bagian 6)

**Interfaces:**
- Consumes: semua tugas sebelumnya; `signIn` (`tests/e2e/helpers/quiz`), `tungguHidrasi` (`tests/e2e/helpers/mui`), `E2E_ADMIN`, `E2E_BASE_URL`.
- Produces: —

- [ ] **Step 1: Bersihkan akun uji lama di `prepare-db.mts`**

Di `tests/e2e/prepare-db.mts`, tepat sebelum `await ensureAccount(E2E_ADMIN, …)`:

```ts
// Akun yang dibuat kelola-staf.spec.ts di putaran sebelumnya (email e2e-staf-…): dihapus agar tidak menumpuk.
const staleUsers = await prisma.user.findMany({ where: { email: { startsWith: "e2e-staf-" } }, select: { id: true, staffId: true } });
const staleIds = staleUsers.map((u) => u.id);
await prisma.session.deleteMany({ where: { userId: { in: staleIds } } });
await prisma.account.deleteMany({ where: { userId: { in: staleIds } } });
await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
await prisma.staff.deleteMany({ where: { id: { in: staleUsers.flatMap((u) => (u.staffId ? [u.staffId] : [])) } } });
```

- [ ] **Step 2: Tulis uji E2E**

`tests/e2e/kelola-staf.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

test.setTimeout(240_000);

test("pemilik menambah staf; staf dipaksa mengganti kata sandi lalu bekerja; pemilik menonaktifkannya", async ({ page, browser }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `Staf Uji ${suffix}`;
  const email = `e2e-staf-${suffix}@sundy.test`;
  const newPassword = `KataSandiBaru${Date.now()}`;

  // Pemilik menambah staf.
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/staf");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Tambah staf" }).click();
  const form = page.getByRole("dialog", { name: "Tambah staf" });
  await form.getByLabel("Nama").fill(name);
  await form.getByLabel("Peran").selectOption("RESEPSIONIS");
  await form.getByLabel("Email login").fill(email);
  await form.getByRole("button", { name: "Tambah staf" }).click();
  const temp = page.getByRole("dialog", { name: `Kata sandi sementara — ${name}` });
  const tempPassword = ((await temp.getByTestId("kata-sandi-sementara").textContent()) ?? "").trim();
  expect(tempPassword).toHaveLength(16);
  await temp.getByRole("button", { name: "Tutup" }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Wajib ganti kata sandi", { timeout: 30_000 });

  // Staf masuk dengan kata sandi sementara: diarahkan ke Ganti kata sandi, belum bisa memakai panel atau rute apa pun.
  const staffContext = await browser.newContext({ ...testInfo.project.use, baseURL: E2E_BASE_URL });
  const staff = await staffContext.newPage();
  await staff.goto("/masuk");
  await staff.waitForLoadState("networkidle");
  await staff.getByLabel("Email").fill(email);
  await staff.getByLabel("Kata Sandi").fill(tempPassword);
  await staff.getByRole("button", { name: "Masuk" }).click();
  await expect(staff).toHaveURL(/\/ganti-kata-sandi/, { timeout: 60_000 });
  // Halaman ini tidak masuk daftar foto halaman admin (butuh akun yang wajib ganti): periksa sekilas di mode gelap, tanpa gulir mendatar.
  await staff.emulateMedia({ colorScheme: "dark" });
  await expect(staff.getByLabel("Kata sandi saat ini")).toBeVisible();
  expect(await staff.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await staff.goto("/admin");
  await expect(staff).toHaveURL(/\/ganti-kata-sandi/, { timeout: 60_000 });
  expect((await staff.request.post("/admin/bia/unggah")).status()).toBe(401);

  // Kata sandi sementara tidak boleh dipakai ulang sebagai kata sandi baru; yang baru diterima.
  await staff.getByLabel("Kata sandi saat ini").fill(tempPassword);
  await staff.getByLabel("Kata sandi baru", { exact: true }).fill(tempPassword);
  await staff.getByLabel("Ulangi kata sandi baru").fill(tempPassword);
  await staff.getByRole("button", { name: "Simpan kata sandi baru" }).click();
  await expect(staff.getByRole("alert")).toContainText("Kata sandi baru harus berbeda dari yang sementara.");
  await staff.getByLabel("Kata sandi baru", { exact: true }).fill(newPassword);
  await staff.getByLabel("Ulangi kata sandi baru").fill(newPassword);
  await staff.getByRole("button", { name: "Simpan kata sandi baru" }).click();
  await expect(staff).toHaveURL(/\/admin$/, { timeout: 60_000 });

  // Resepsionis tidak bisa membuka halaman Staf.
  const forbidden = await staff.goto("/admin/staf");
  expect(forbidden?.status()).toBe(403);

  // Pemilik menonaktifkan: staf langsung keluar.
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Nonaktifkan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row).toContainText("Nonaktif", { timeout: 30_000 });
  await staff.goto("/admin");
  await expect(staff).toHaveURL(/\/masuk/, { timeout: 60_000 });
  await staffContext.close();
});
```

Run (satu per proyek, di latar belakang): `npx playwright test tests/e2e/kelola-staf.spec.ts --project=desktop > $WS/e2e-staf-d.log 2>&1; tail -20 $WS/e2e-staf-d.log`
Expected: `1 passed`. Lalu `--project=mobile` → `1 passed`. Bila gagal karena klik sebelum hidrasi, tambahkan `tungguHidrasi` atau `waitForLoadState("networkidle")` di titik itu (bukan menambah batas waktu), dan catat Ruling.

Run juga spek yang menyentuh halaman Staf atau sesi: `grep -ln "staf" tests/e2e/*.spec.ts` lalu jalankan masing-masing (`tampilan-admin.spec.ts` memuat semua halaman admin dalam dua skema, termasuk `/admin/staf`): `npx playwright test tests/e2e/tampilan-admin.spec.ts tests/e2e/admin-sidebar.spec.ts --project=desktop --workers=1`
Expected: lulus.

- [ ] **Step 3: Runbook**

`docs/operasional/server-sundy.md`, di bagian 6 ("Skrip admin di server"), tepat setelah judul bagian itu dan sebelum blok kode, tambahkan:

```markdown
**Akun staf sehari-hari dikelola dari panel** (menu Staf, hanya Super Admin): tambah staf, buat akun, ubah peran, nonaktifkan, reset kata sandi,
dan ganti email. Akun baru dan yang direset mendapat kata sandi sementara yang tampil sekali; staf wajib menggantinya saat masuk pertama.
Skrip di bawah tetap dipakai untuk pemulihan, mis. satu-satunya Super Admin lupa kata sandinya dan tidak ada Super Admin lain yang bisa mereset.
Disarankan selalu ada dua Super Admin aktif.
```

- [ ] **Step 4: Verifikasi akhir dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > $WS/unit.log 2>&1; tail -5 $WS/unit.log` → semua lulus. Integrasi terpisah dari E2E: `npm run test:integration > $WS/int.log 2>&1; tail -8 $WS/int.log` → lulus kecuali 3 uji lama `schedule.test.ts`.

```bash
git add tests/e2e/prepare-db.mts tests/e2e/kelola-staf.spec.ts docs/operasional/server-sundy.md
git commit -m "test: cover staff account management end to end and document it in the runbook"
```

---

## Catatan rilis (bukan tugas; hanya atas permintaan pemilik)

- Migrasi hanya menambah satu kolom bawaan `false`; `deploy.sh kembali` aman, akun yang ada tidak terpengaruh.
- Setelah rilis: masuk sebagai pemilik, buka Staf, nonaktifkan lima akun demo (`demo.*@sundyclinic.com`), lalu buat akun Dr. Diane lewat "Buat akun". Setelah itu uji masuk sebagai staf baru dari perangkat lain.
- Tambahkan Super Admin kedua supaya ada cadangan bila pemilik lupa kata sandi.
