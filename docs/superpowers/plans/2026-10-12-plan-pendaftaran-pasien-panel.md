# Data Lengkap dan Cek NIK saat Resepsionis Mendaftarkan Pasien — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resepsionis mendaftarkan pasien baru di panel lewat satu dialog berisi NIK, nama, tanggal lahir, no. HP, email (opsional), kontak darurat, alamat, dan status pernikahan (opsional), dengan NIK dicek saat diketik sehingga pasien yang sudah terdaftar ditawarkan untuk dipakai, bukan dibuat ganda.

**Architecture:** Empat kolom baru di `Patient` (migrasi hanya menambah, dijaga CHECK di basis data). Aturan validasi murni di `src/lib/patient-registration.ts` dipakai server (sebelum nomor rekam medis dialokasikan) dan dialog (umpan balik per isian). `createPatient` diperluas dan menyimpan dalam satu transaksi supaya nomor RM yang gagal ikut batal; aksi baru `checkPatientNik` memberi tahu apakah NIK sudah dipakai. Dialog MUI menggantikan kotak inline `NewPatientForm` dan memakai ulang `NikInput`.

**Tech Stack:** Next.js 15 (server actions), Prisma 7/PostgreSQL, MUI 9 + MUI X Pickers, Vitest (unit + integrasi), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-pendaftaran-pasien-panel-design.md` (disetujui pemilik 12 Oktober 2026). Untuk gaya komponen admin baca juga `docs/superpowers/specs/2026-10-08-admin-material-ui-design.md`.

## Global Constraints

- **Bahasa:** semua teks yang dilihat pengguna, pesan galat, nama uji, dan komentar kode dalam Bahasa Indonesia; nama berkas, fungsi, dan commit dalam bahasa Inggris.
- **Wajib di formulir dan di server:** NIK (atau alasan belum ada), nama (maks. 100 karakter), tanggal lahir (bentuk `YYYY-MM-DD`, tidak di masa depan, tidak sebelum 1900-01-01), no. HP, kontak darurat (nama maks. 100 karakter + nomor), alamat (maks. 300 karakter). **Opsional:** email (huruf kecil, bentuk diperiksa, maks. 254 karakter) dan status pernikahan (`BELUM_MENIKAH`, `MENIKAH`, `CERAI_HIDUP`, `CERAI_MATI`).
- **Kolom basis data tetap boleh kosong:** pasien lama dan pasien dari pendaftaran online tidak punya data ini. Pendaftaran online `/daftar`, check-in, dan situs publik **tidak berubah**.
- **Validasi server sebelum alokasi nomor RM:** input yang ditolak tidak boleh memakan nomor rekam medis. Penyimpanan berjalan dalam satu transaksi, sehingga nomor yang sempat diambil ikut batal bila penyimpanan gagal.
- **Hak:** `createPatient` dan `checkPatientNik` memanggil `requireCapability("booking:manage")`.
- **Privasi:** NIK, email, dan kontak darurat tidak masuk catatan audit (`patient.create` hanya memuat `${nama} (${nomor RM})`), tidak ikut `PatientSummary` yang dikirim ke browser, dan tidak tampil di situs publik, pesan WA, atau tautan. NIK di halaman detail tetap tersamarkan seperti sekarang.
- **Pola kode yang ada:** `runAction`/`UserFacingError` dari `@/lib/action-result`; `requireCapability` dari `@/server/session`; `recordAudit` dari `@/server/audit`; `safeRevalidatePath` dari `@/lib/revalidate`; `isUniqueViolation` dari `@/server/db-errors`; berkas `"use server"` hanya boleh mengekspor fungsi async (tipe boleh); komponen admin hanya MUI (dijaga `tests/unit/architecture.test.ts`: tanpa shadcn, lucide, kelas warna Tailwind, atau impor Prisma di `src/app`).
- **Pengujian:** unit `npx vitest run <berkas>`; integrasi `npm run test:integration -- <berkas>` (basis data uji `sundy_test`; **jangan bersamaan dengan E2E**); E2E `npx playwright test <berkas> --project=desktop` lalu `--project=mobile` (laptop 8 GB: per berkas, per proyek, `--workers=1`). Setelah mengubah `prisma/schema.prisma`: `npx prisma generate`; setelah menambah migrasi: `npm run db:migrate:test` (E2E tidak menerapkan migrasi sendiri). Uji komponen yang kena batas 5 dtk saat suite penuh tetapi lulus sendirian bukan regresi.
- **Uji lama yang sudah gagal:** 3 uji `tests/integration/schedule.test.ts`. Jangan diubah.
- **Commit:** Conventional Commits berbahasa Inggris, diakhiri baris `Co-Authored-By` yang menyebut model penulis commit (saat rencana ditulis: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; ikuti pengingat atribusi terbaru bila berbeda). **Jangan pernah men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Push, merge, dan deploy hanya atas permintaan pemilik.
- **Branch:** `data-pasien`.

## Keputusan perencana (hal yang spec tidak merinci)

1. **Dialog tanpa elemen `<form>`**, tombol `type="button"`. Event `submit` React menggelembung lewat portal ke leluhur React-nya; `NewPatientForm` dipakai di dalam dialog lain (Penjualan langsung) dan halaman Booking baru, sehingga `<form>` bersarang bisa memicu `onSubmit` induknya. Kotak lama juga memakai `type="button"` karena alasan yang sama.
2. **Tombol simpan tetap berlabel "Buat Pasien"** (spec menyebutnya "Simpan" secara umum): selektor E2E dan kebiasaan resepsionis tetap.
3. **Dialog tidak tertutup oleh klik latar** (`backdropClick` diabaikan): formulirnya panjang dan hilangnya isian karena salah klik merugikan; tombol silang, Batal, dan Escape tetap menutup.
4. **Klien mengirim isian apa adanya** (NIK dengan spasi/titik, nomor `0812…`); server yang menormalkan, jadi satu-satunya aturan ada di `validatePatientRegistration`. Klien memakai fungsi yang sama hanya untuk menampilkan galat per isian.
5. **`checkPatientNik` mengembalikan `PatientSummary` pemilik NIK** (bukan kartu khusus) supaya tombol "Pakai pasien ini" langsung bisa memanggil `onPickExisting`/`onCreated`. Tanpa `onPickExisting` (halaman Pasien) kartu menawarkan tautan "Buka data pasien" agar tidak buntu. Pencarian pemilik tidak menyaring `mergedIntoId`: pasien rangkap tidak pernah memegang NIK (`mergeBlockReason` menolak pemindahan pasien ber-NIK).
6. **Pemeriksaan NIK yang gagal (jaringan/galat) tidak menghalangi** penyimpanan: dialog menampilkan info, server memeriksa ulang saat menyimpan.
7. **Uji lama yang memanggil `createPatient({ name, whatsapp })`** diperbarui memakai helper `tests/integration/patient-fixture.ts` (`patientInput(patch)`), karena input kini wajib lengkap. `insertPatient` tetap menerima kolom baru sebagai opsional, jadi `createPatientFromIntake` tidak berubah.
8. **`npx tsc --noEmit` merah sementara setelah Task 3** (hanya di `new-patient-form.tsx`, yang masih memanggil `createPatient` versi lama); Task 6 mengembalikannya hijau.

## Review Focus

Masukan dan keadaan yang spec tidak sebut tetapi paling mungkin menggigit pengguna; masing-masing dipasangi uji di tugas pemilik kodenya:

1. **Dua resepsionis mendaftarkan NIK yang sama bersamaan** — tepat satu lolos, yang kalah mendapat pesan menyebut pemilik NIK, nomor RM yang sempat diambil tidak terbuang (Task 3: uji serentak + uji deterministik dengan pemeriksaan awal dilewati).
2. **Nilai bukan teks dari browser** (`null`, angka, objek, input `null`) — ditolak dengan pesan, bukan galat 500 (Task 2 dan Task 3).
3. **Batas tanggal lahir** — hari ini sah, besok tidak; `1900-01-01` sah, `1899-12-31` tidak; `1990-02-31` dan `17/05/1990` tidak sah (Task 2).
4. **Hasil cek NIK usang atau gagal** — hasil untuk NIK lama tidak boleh menandai NIK baru "sudah terdaftar"; cek yang gagal tidak mengunci tombol simpan (Task 6).
5. **Kebocoran data sensitif** — `PatientSummary` yang kembali ke browser, hasil `checkPatientNik`, dan catatan audit tidak memuat NIK, email, atau kontak darurat (Task 3 dan Task 4).

---

### Task 1: Kolom baru, migrasi, dan pengaman basis data

**Files:**
- Modify: `prisma/schema.prisma` (model `Patient`, enum baru `MaritalStatus`)
- Create: `prisma/migrations/20261012120000_data_pasien/migration.sql`
- Modify: `tests/unit/migrations.test.ts`
- Test: `tests/integration/patient-data-schema.test.ts`

**Interfaces:**
- Consumes: —
- Produces: kolom `Patient.email`, `emergencyContactName`, `emergencyContactPhone` (semua `String?`), `maritalStatus` (`MaritalStatus?`); enum Prisma `MaritalStatus`; CHECK `patient_emergency_pair` dan `patient_email_format`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi data pasien (pendaftaran di panel)", () => {
  const sql = readFileSync("prisma/migrations/20261012120000_data_pasien/migration.sql", "utf8");

  it("hanya menambah, tanpa menghapus apa pun yang dikenal rilis sebelumnya", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga pasangan kontak darurat dan bentuk email di basis data", () => {
    expect(sql).toMatch(/patient_emergency_pair/);
    expect(sql).toMatch(/patient_email_format/);
  });
});
```

Buat `tests/integration/patient-data-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const WA = "6281200009101";
const base = { medicalRecordNumber: "SDY-2026-9101", name: "Skema Data", whatsapp: WA };

async function cleanup() {
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
}

describe("skema data pasien: kontak darurat, email, status pernikahan", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("menyimpan semua kolom baru", async () => {
    const created = await prisma.patient.create({
      data: { ...base, email: "budi@example.com", emergencyContactName: "Ani", emergencyContactPhone: "6281200009102", maritalStatus: "MENIKAH" },
    });
    expect(created).toMatchObject({
      email: "budi@example.com",
      emergencyContactName: "Ani",
      emergencyContactPhone: "6281200009102",
      maritalStatus: "MENIKAH",
    });
  });

  it("pasien tanpa data baru tetap sah (pasien lama dan pendaftaran online)", async () => {
    const created = await prisma.patient.create({ data: base });
    expect(created).toMatchObject({ email: null, emergencyContactName: null, emergencyContactPhone: null, maritalStatus: null });
  });

  it("nama dan nomor kontak darurat terisi bersamaan atau kosong bersamaan", async () => {
    await expect(prisma.patient.create({ data: { ...base, emergencyContactName: "Ani" } })).rejects.toThrow(/patient_emergency_pair/);
    await expect(prisma.patient.create({ data: { ...base, emergencyContactPhone: "6281200009102" } })).rejects.toThrow(
      /patient_emergency_pair/,
    );
  });

  it("email harus berbentuk email", async () => {
    for (const email of ["budi", "budi@", "@example.com", "budi@example", "bu di@example.com"]) {
      await expect(prisma.patient.create({ data: { ...base, email } })).rejects.toThrow(/patient_email_format/);
    }
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts` dan `npm run test:integration -- tests/integration/patient-data-schema.test.ts`
Expected: unit FAIL (`ENOENT … 20261012120000_data_pasien/migration.sql`); integrasi FAIL (Prisma tidak mengenal `email`/`maritalStatus`).

- [ ] **Step 3: Tambah skema dan migrasi**

Di `prisma/schema.prisma`, tambahkan di model `Patient` tepat setelah `nikMissingReason`:

```prisma
  /// Email pasien (opsional), disimpan huruf kecil. Dikumpulkan resepsionis saat mendaftarkan pasien di panel.
  email                 String?
  /// Kontak darurat: nama dan nomor terisi bersamaan atau kosong bersamaan (CHECK patient_emergency_pair).
  emergencyContactName  String?
  emergencyContactPhone String?
  maritalStatus         MaritalStatus?
```

dan enum baru di dekat enum lain (mis. setelah `NikMissingReason`):

```prisma
enum MaritalStatus {
  BELUM_MENIKAH
  MENIKAH
  CERAI_HIDUP
  CERAI_MATI
}
```

Buat `prisma/migrations/20261012120000_data_pasien/migration.sql`:

```sql
-- Data pasien lengkap saat resepsionis mendaftarkan pasien di panel.
-- Spec: docs/superpowers/specs/2026-10-12-pendaftaran-pasien-panel-design.md bagian 3.
--
-- Hanya menambah: deploy.sh menjalankan migrasi sebelum build, dan rilis lama tetap
-- melayani selama build. Semua kolom baru boleh kosong (pasien lama dan pasien dari
-- pendaftaran online tidak punya data ini).

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('BELUM_MENIKAH', 'MENIKAH', 'CERAI_HIDUP', 'CERAI_MATI');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "maritalStatus" "MaritalStatus";

-- Nama dan nomor kontak darurat: terisi bersamaan atau kosong bersamaan.
ALTER TABLE "Patient" ADD CONSTRAINT "patient_emergency_pair" CHECK (("emergencyContactName" IS NULL) = ("emergencyContactPhone" IS NULL));

-- Email: bentuk dasar nama@domain.tld tanpa spasi.
ALTER TABLE "Patient" ADD CONSTRAINT "patient_email_format" CHECK ("email" IS NULL OR "email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
```

- [ ] **Step 4: Terapkan ke basis data uji dan buat ulang klien Prisma**

Run: `npx prisma generate && npm run db:migrate:test`
Expected: klien Prisma dibuat; migrasi `20261012120000_data_pasien` diterapkan tanpa galat.

- [ ] **Step 5: Jalankan uji, pastikan lulus**

Run: `npx vitest run tests/unit/migrations.test.ts` dan `npm run test:integration -- tests/integration/patient-data-schema.test.ts`
Expected: unit PASS; integrasi PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261012120000_data_pasien tests/unit/migrations.test.ts tests/integration/patient-data-schema.test.ts
git commit -m "feat: add patient email, emergency contact, and marital status columns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Aturan validasi pendaftaran pasien (murni)

**Files:**
- Create: `src/lib/patient-registration.ts`
- Test: `tests/unit/patient-registration.test.ts`

**Interfaces:**
- Consumes: `normalizeNik`, `isNikMissingReason`, `NIK_FORMAT_ERROR`, `NikMissingReasonValue` dari `@/lib/nik`; `normalizeWhatsapp` dari `@/lib/whatsapp`.
- Produces (dipakai Task 3, 4, 5, 6, 7):
  - `MARITAL_STATUS_LABEL: { BELUM_MENIKAH: "Belum menikah"; MENIKAH: "Menikah"; CERAI_HIDUP: "Cerai hidup"; CERAI_MATI: "Cerai mati" }`, `type MaritalStatusValue`, `isMaritalStatus(value: unknown): value is MaritalStatusValue`
  - `NAME_MAX = 100`, `ADDRESS_MAX = 300`, `EMAIL_MAX = 254`, `BIRTH_DATE_MIN = "1900-01-01"`
  - `REGISTRATION_FIELDS` (urutan: `nik, name, birthDate, whatsapp, email, emergencyContactName, emergencyContactPhone, address, maritalStatus`), `type RegistrationField`, `type RegistrationErrors = Partial<Record<RegistrationField, string>>`
  - `type PatientRegistrationInput = { nik: string | null; nikMissingReason: string | null; name: string; birthDate: string; whatsapp: string; email: string; emergencyContactName: string; emergencyContactPhone: string; address: string; maritalStatus: string | null }`
  - `type ValidPatientRegistration = { nik: string | null; nikMissingReason: NikMissingReasonValue | null; name: string; birthDate: Date; whatsapp: string; email: string | null; emergencyContactName: string; emergencyContactPhone: string; address: string; maritalStatus: MaritalStatusValue | null }`
  - `validatePatientRegistration(input: Record<string, unknown>, today: string): { ok: true; value: ValidPatientRegistration } | { ok: false; errors: RegistrationErrors }` (`today` berbentuk `YYYY-MM-DD`)
  - `firstRegistrationError(errors: RegistrationErrors): string`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/patient-registration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NIK_FORMAT_ERROR } from "@/lib/nik";
import {
  firstRegistrationError,
  isMaritalStatus,
  MARITAL_STATUS_LABEL,
  validatePatientRegistration,
  type RegistrationErrors,
} from "@/lib/patient-registration";

const TODAY = "2026-10-12";
const VALID = {
  nik: "7171015705900001",
  nikMissingReason: null,
  name: "Siti Rahayu",
  birthDate: "1990-05-17",
  whatsapp: "0812-3456-7890",
  email: "",
  emergencyContactName: "Budi Rahayu",
  emergencyContactPhone: "081298765432",
  address: "Jl. Sam Ratulangi 10, Manado",
  maritalStatus: null,
};

function check(patch: Record<string, unknown> = {}) {
  return validatePatientRegistration({ ...VALID, ...patch }, TODAY);
}

function errorsOf(patch: Record<string, unknown>): RegistrationErrors {
  const result = check(patch);
  if (result.ok) throw new Error(`Diharapkan ditolak, ternyata diterima: ${JSON.stringify(patch)}`);
  return result.errors;
}

describe("validatePatientRegistration", () => {
  it("menerima data lengkap dan membersihkannya", () => {
    const result = check();
    expect(result).toEqual({
      ok: true,
      value: {
        nik: "7171015705900001",
        nikMissingReason: null,
        name: "Siti Rahayu",
        birthDate: new Date("1990-05-17T00:00:00Z"),
        whatsapp: "6281234567890",
        email: null,
        emergencyContactName: "Budi Rahayu",
        emergencyContactPhone: "6281298765432",
        address: "Jl. Sam Ratulangi 10, Manado",
        maritalStatus: null,
      },
    });
  });

  describe("NIK", () => {
    it("membuang spasi, titik, dan tanda hubung yang ikut tertempel", () => {
      const result = check({ nik: "7171 0157.0590-0001" });
      expect(result.ok && result.value.nik).toBe("7171015705900001");
    });

    it("menolak NIK yang bukan 16 angka", () => {
      expect(errorsOf({ nik: "717101570590000" }).nik).toBe(NIK_FORMAT_ERROR);
      expect(errorsOf({ nik: "71710157059000012" }).nik).toBe(NIK_FORMAT_ERROR);
      expect(errorsOf({ nik: "7171015705900AB1" }).nik).toBe(NIK_FORMAT_ERROR);
    });

    it("menerima alasan belum ada NIK sebagai pengganti", () => {
      const result = check({ nik: null, nikMissingReason: "ANAK" });
      expect(result.ok && result.value).toMatchObject({ nik: null, nikMissingReason: "ANAK" });
    });

    it("menolak keduanya kosong, keduanya terisi, atau alasan yang tidak dikenal", () => {
      expect(errorsOf({ nik: null, nikMissingReason: null }).nik).toMatch(/NIK/);
      expect(errorsOf({ nik: "", nikMissingReason: "" }).nik).toMatch(/NIK/);
      expect(errorsOf({ nik: "7171015705900001", nikMissingReason: "ANAK" }).nik).toMatch(/salah satu/);
      expect(errorsOf({ nik: null, nikMissingReason: "BOSAN" }).nik).toMatch(/NIK/);
    });
  });

  describe("nama", () => {
    it("wajib dan dirapikan", () => {
      expect(errorsOf({ name: "   " }).name).toBe("Nama pasien wajib diisi.");
      const result = check({ name: "  Siti    Rahayu " });
      expect(result.ok && result.value.name).toBe("Siti Rahayu");
    });

    it("paling banyak 100 karakter", () => {
      expect(check({ name: "a".repeat(100) }).ok).toBe(true);
      expect(errorsOf({ name: "a".repeat(101) }).name).toMatch(/100/);
    });
  });

  describe("tanggal lahir (batas)", () => {
    it("hari ini sah, besok tidak", () => {
      expect(check({ birthDate: "2026-10-12" }).ok).toBe(true);
      expect(errorsOf({ birthDate: "2026-10-13" }).birthDate).toBe("Tanggal lahir tidak boleh di masa depan.");
    });

    it("1 Januari 1900 sah, 31 Desember 1899 tidak", () => {
      expect(check({ birthDate: "1900-01-01" }).ok).toBe(true);
      expect(errorsOf({ birthDate: "1899-12-31" }).birthDate).toMatch(/1900/);
    });

    it("wajib, dan menolak tanggal yang tidak ada atau bentuk lain", () => {
      expect(errorsOf({ birthDate: "" }).birthDate).toBe("Tanggal lahir wajib diisi.");
      expect(errorsOf({ birthDate: "1990-02-31" }).birthDate).toBe("Tanggal lahir tidak sah.");
      expect(errorsOf({ birthDate: "17/05/1990" }).birthDate).toBe("Tanggal lahir tidak sah.");
      expect(errorsOf({ birthDate: "1990-5-7" }).birthDate).toBe("Tanggal lahir tidak sah.");
    });
  });

  describe("no. HP (WhatsApp)", () => {
    it("wajib dan harus sah", () => {
      expect(errorsOf({ whatsapp: "" }).whatsapp).toBe("Nomor HP (WhatsApp) wajib diisi.");
      expect(errorsOf({ whatsapp: "0812" }).whatsapp).toMatch(/tidak sah/);
    });
  });

  describe("email", () => {
    it("boleh kosong; bila diisi menjadi huruf kecil dan dipangkas", () => {
      const empty = check({ email: "   " });
      expect(empty.ok && empty.value.email).toBeNull();
      const filled = check({ email: "  Budi@Example.COM " });
      expect(filled.ok && filled.value.email).toBe("budi@example.com");
    });

    it("menolak yang bukan bentuk email atau lebih dari 254 karakter", () => {
      for (const email of ["budi", "budi@", "@example.com", "budi@example", "bu di@example.com"]) {
        expect(errorsOf({ email }).email, email).toMatch(/Email tidak sah/);
      }
      expect(errorsOf({ email: `${"a".repeat(250)}@x.id` }).email).toMatch(/Email tidak sah/);
    });
  });

  describe("kontak darurat", () => {
    it("nama dan nomor sama-sama wajib", () => {
      expect(errorsOf({ emergencyContactName: " " }).emergencyContactName).toBe("Nama kontak darurat wajib diisi.");
      expect(errorsOf({ emergencyContactPhone: "" }).emergencyContactPhone).toBe("Nomor kontak darurat wajib diisi.");
    });

    it("nomor harus sah dan nama paling banyak 100 karakter", () => {
      expect(errorsOf({ emergencyContactPhone: "0812" }).emergencyContactPhone).toMatch(/tidak sah/);
      expect(errorsOf({ emergencyContactName: "a".repeat(101) }).emergencyContactName).toMatch(/100/);
    });
  });

  describe("alamat", () => {
    it("wajib dan paling banyak 300 karakter", () => {
      expect(errorsOf({ address: "  " }).address).toBe("Alamat wajib diisi.");
      expect(check({ address: "a".repeat(300) }).ok).toBe(true);
      expect(errorsOf({ address: "a".repeat(301) }).address).toMatch(/300/);
    });
  });

  describe("status pernikahan", () => {
    it("opsional; kosong menjadi null", () => {
      for (const maritalStatus of [null, "", undefined]) {
        const result = check({ maritalStatus });
        expect(result.ok && result.value.maritalStatus).toBeNull();
      }
    });

    it("menerima nilai yang dikenal dan menolak yang lain", () => {
      for (const value of Object.keys(MARITAL_STATUS_LABEL)) {
        const result = check({ maritalStatus: value });
        expect(result.ok && result.value.maritalStatus).toBe(value);
      }
      expect(errorsOf({ maritalStatus: "JANDA" }).maritalStatus).toBe("Status pernikahan tidak dikenal.");
      expect(isMaritalStatus("MENIKAH")).toBe(true);
      expect(isMaritalStatus("toString")).toBe(false);
    });
  });

  it("nilai bukan teks dari browser ditolak dengan galat per isian, tanpa melempar", () => {
    const result = validatePatientRegistration(
      { nik: 7171015705900001, name: null, birthDate: 19900517, whatsapp: {}, email: [], emergencyContactName: 5, emergencyContactPhone: true, address: undefined },
      TODAY,
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : Object.keys(result.errors)).toEqual(
      expect.arrayContaining(["nik", "name", "birthDate", "whatsapp", "emergencyContactName", "emergencyContactPhone", "address"]),
    );
  });

  it("input kosong total melaporkan semua isian wajib, bukan email dan status", () => {
    const result = validatePatientRegistration({}, TODAY);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(
      ["address", "birthDate", "emergencyContactName", "emergencyContactPhone", "name", "nik", "whatsapp"].sort(),
    );
  });
});

describe("firstRegistrationError", () => {
  it("mengambil galat menurut urutan isian di formulir", () => {
    expect(firstRegistrationError({ address: "Alamat wajib diisi.", name: "Nama pasien wajib diisi." })).toBe("Nama pasien wajib diisi.");
  });

  it("punya cadangan bila tidak ada galat per isian", () => {
    expect(firstRegistrationError({})).toBe("Data pasien belum lengkap.");
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/patient-registration.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/patient-registration"`).

- [ ] **Step 3: Tulis implementasi**

Buat `src/lib/patient-registration.ts`:

```ts
import { isNikMissingReason, NIK_FORMAT_ERROR, normalizeNik, type NikMissingReasonValue } from "@/lib/nik";
import { normalizeWhatsapp } from "@/lib/whatsapp";

/** Status pernikahan pasien (opsional). Nilainya sama dengan enum `MaritalStatus` di basis data. */
export const MARITAL_STATUS_LABEL = {
  BELUM_MENIKAH: "Belum menikah",
  MENIKAH: "Menikah",
  CERAI_HIDUP: "Cerai hidup",
  CERAI_MATI: "Cerai mati",
} as const;

export type MaritalStatusValue = keyof typeof MARITAL_STATUS_LABEL;

export function isMaritalStatus(value: unknown): value is MaritalStatusValue {
  return typeof value === "string" && Object.hasOwn(MARITAL_STATUS_LABEL, value);
}

export const NAME_MAX = 100;
export const ADDRESS_MAX = 300;
export const EMAIL_MAX = 254;
export const BIRTH_DATE_MIN = "1900-01-01";

/** Urutan isian di formulir; galat pertama yang dikembalikan server mengikuti urutan ini. */
export const REGISTRATION_FIELDS = [
  "nik",
  "name",
  "birthDate",
  "whatsapp",
  "email",
  "emergencyContactName",
  "emergencyContactPhone",
  "address",
  "maritalStatus",
] as const;

export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

/** Yang dikirim dialog ke server: isian apa adanya (NIK/nomor belum dinormalkan). */
export type PatientRegistrationInput = {
  /** Diisi bila memilih "Isi NIK"; null bila memilih "Belum ada NIK". */
  nik: string | null;
  /** Diisi bila memilih "Belum ada NIK"; null bila mengisi NIK. */
  nikMissingReason: string | null;
  name: string;
  /** "YYYY-MM-DD". */
  birthDate: string;
  whatsapp: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  maritalStatus: string | null;
};

export type ValidPatientRegistration = {
  nik: string | null;
  nikMissingReason: NikMissingReasonValue | null;
  name: string;
  birthDate: Date;
  whatsapp: string;
  email: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  maritalStatus: MaritalStatusValue | null;
};

export type RegistrationResult = { ok: true; value: ValidPatientRegistration } | { ok: false; errors: RegistrationErrors };

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Server action menerima apa pun dari browser; nilai bukan teks dihitung kosong. */
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const isBlank = (value: unknown): boolean => value === null || value === undefined || value === "";

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Aturan pendaftaran pasien di panel (spec bagian 4). Dipakai server (sebelum nomor rekam medis
 * dialokasikan) dan dialog (galat per isian). `today` berbentuk "YYYY-MM-DD" di zona waktu klinik.
 */
export function validatePatientRegistration(input: Record<string, unknown>, today: string): RegistrationResult {
  const errors: RegistrationErrors = {};

  let nik: string | null = null;
  let nikMissingReason: NikMissingReasonValue | null = null;
  const nikText = text(input.nik).trim();
  if (nikText && !isBlank(input.nikMissingReason)) {
    errors.nik = "Pilih salah satu: isi NIK atau belum ada NIK.";
  } else if (nikText) {
    nik = normalizeNik(nikText);
    if (!nik) errors.nik = NIK_FORMAT_ERROR;
  } else if (isNikMissingReason(input.nikMissingReason)) {
    nikMissingReason = input.nikMissingReason;
  } else {
    errors.nik = "Isi NIK 16 angka, atau pilih alasan belum ada NIK.";
  }

  const name = text(input.name).trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Nama pasien wajib diisi.";
  else if (name.length > NAME_MAX) errors.name = `Nama pasien paling banyak ${NAME_MAX} karakter.`;

  const birthText = text(input.birthDate).trim();
  if (!birthText) errors.birthDate = "Tanggal lahir wajib diisi.";
  else if (!isRealDate(birthText)) errors.birthDate = "Tanggal lahir tidak sah.";
  else if (birthText > today) errors.birthDate = "Tanggal lahir tidak boleh di masa depan.";
  else if (birthText < BIRTH_DATE_MIN) errors.birthDate = "Tanggal lahir tidak boleh sebelum tahun 1900.";

  const whatsappText = text(input.whatsapp).trim();
  const whatsapp = whatsappText ? normalizeWhatsapp(whatsappText) : null;
  if (!whatsappText) errors.whatsapp = "Nomor HP (WhatsApp) wajib diisi.";
  else if (!whatsapp) errors.whatsapp = "Nomor HP (WhatsApp) tidak sah. Contoh: 081234567890.";

  let email: string | null = null;
  const emailText = text(input.email).trim().toLowerCase();
  if (emailText) {
    if (emailText.length > EMAIL_MAX || !EMAIL_PATTERN.test(emailText)) errors.email = "Email tidak sah. Contoh: nama@contoh.com.";
    else email = emailText;
  }

  const emergencyContactName = text(input.emergencyContactName).trim().replace(/\s+/g, " ");
  if (!emergencyContactName) errors.emergencyContactName = "Nama kontak darurat wajib diisi.";
  else if (emergencyContactName.length > NAME_MAX) errors.emergencyContactName = `Nama kontak darurat paling banyak ${NAME_MAX} karakter.`;

  const emergencyPhoneText = text(input.emergencyContactPhone).trim();
  const emergencyContactPhone = emergencyPhoneText ? normalizeWhatsapp(emergencyPhoneText) : null;
  if (!emergencyPhoneText) errors.emergencyContactPhone = "Nomor kontak darurat wajib diisi.";
  else if (!emergencyContactPhone) errors.emergencyContactPhone = "Nomor kontak darurat tidak sah. Contoh: 081234567890.";

  const address = text(input.address).trim();
  if (!address) errors.address = "Alamat wajib diisi.";
  else if (address.length > ADDRESS_MAX) errors.address = `Alamat paling banyak ${ADDRESS_MAX} karakter.`;

  let maritalStatus: MaritalStatusValue | null = null;
  if (!isBlank(input.maritalStatus)) {
    if (isMaritalStatus(input.maritalStatus)) maritalStatus = input.maritalStatus;
    else errors.maritalStatus = "Status pernikahan tidak dikenal.";
  }

  if (Object.keys(errors).length > 0 || !whatsapp || !emergencyContactPhone) return { ok: false, errors };
  return {
    ok: true,
    value: {
      nik,
      nikMissingReason,
      name,
      birthDate: new Date(`${birthText}T00:00:00Z`),
      whatsapp,
      email,
      emergencyContactName,
      emergencyContactPhone,
      address,
      maritalStatus,
    },
  };
}

/** Pesan galat pertama menurut urutan formulir, untuk server yang mengembalikan satu pesan. */
export function firstRegistrationError(errors: RegistrationErrors): string {
  for (const field of REGISTRATION_FIELDS) {
    const message = errors[field];
    if (message) return message;
  }
  return "Data pasien belum lengkap.";
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx vitest run tests/unit/patient-registration.test.ts`
Expected: PASS (semua uji hijau).

- [ ] **Step 5: Mutasi cepat — buktikan uji batas sahih**

Ubah sementara `birthText > today` menjadi `birthText >= today` di `src/lib/patient-registration.ts`, jalankan `npx vitest run tests/unit/patient-registration.test.ts`.
Expected: FAIL pada "hari ini sah, besok tidak". Kembalikan perubahan, jalankan lagi: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/patient-registration.ts tests/unit/patient-registration.test.ts
git commit -m "feat: add patient registration validation rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `createPatient` lengkap dengan cek NIK saat menyimpan

**Files:**
- Modify: `src/server/patient-store.ts` (tipe data `insertPatient`)
- Modify: `src/server/patient.ts` (`createPatient`; helper `findNikOwner`)
- Create: `tests/integration/patient-fixture.ts`
- Create: `tests/integration/patient-registration.test.ts`
- Modify: `tests/integration/patient.test.ts`, `tests/integration/patient-booking-info.test.ts` (pakai `patientInput`)

**Interfaces:**
- Consumes: dari Task 2 `PatientRegistrationInput`, `validatePatientRegistration`, `firstRegistrationError`; dari Task 1 kolom baru; `witaDateString` dari `@/lib/time`.
- Produces (dipakai Task 4, 5, 6):
  - `createPatient(input: PatientRegistrationInput): Promise<ActionResult<PatientSummary>>`
  - internal `findNikOwner(nik: string)` (tidak diekspor) yang mengembalikan baris `summarySelect(now)` + `birthDate`, atau `null`
  - `nikTakenMessage(owner)` → `"NIK ini sudah terdaftar atas nama <nama> (<nomor RM>)."`
  - helper uji `patientInput(patch?: Partial<PatientRegistrationInput>): PatientRegistrationInput` dan `uniqueNik(): string` di `tests/integration/patient-fixture.ts`

- [ ] **Step 1: Tulis helper uji dan uji integrasi yang gagal**

Buat `tests/integration/patient-fixture.ts`:

```ts
import type { PatientRegistrationInput } from "@/lib/patient-registration";

// Bagian 7–12 NIK = tanggal lahir (ddmmyy) → "010190" cocok dengan birthDate bawaan 1990-01-01.
let next = Math.floor(Math.random() * 9000);

/** NIK 16 angka yang berbeda di tiap panggilan, untuk uji yang membuat banyak pasien lewat createPatient. */
export function uniqueNik(): string {
  next = (next + 1) % 10_000;
  return `717101010190${String(next).padStart(4, "0")}`;
}

/** Isian pendaftaran pasien yang lengkap dan sah; timpa seperlunya. Bila memakai nikMissingReason, set nik: null. */
export function patientInput(patch: Partial<PatientRegistrationInput> = {}): PatientRegistrationInput {
  return {
    nik: uniqueNik(),
    nikMissingReason: null,
    name: "Siti Rahayu",
    birthDate: "1990-01-01",
    whatsapp: "6281234567890",
    email: "",
    emergencyContactName: "Budi Rahayu",
    emergencyContactPhone: "6281298765432",
    address: "Jl. Sam Ratulangi 10, Manado",
    maritalStatus: null,
    ...patch,
  };
}
```

Buat `tests/integration/patient-registration.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createPatient } from "@/server/patient";
import { requireCapability } from "@/server/session";
import { patientInput } from "./patient-fixture";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const YEAR = new Date().getFullYear();

async function reset() {
  await prisma.patient.deleteMany();
  await prisma.patientNumberCounter.deleteMany();
}

// Satu penutupan koneksi untuk seluruh berkas: Task 4 dan 5 menambah describe lain di berkas ini.
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("createPatient: data lengkap dan NIK", () => {
  beforeEach(reset);

  it("menyimpan data lengkap: NIK dan nomor dinormalkan, email huruf kecil", async () => {
    const created = await unwrap(
      createPatient(
        patientInput({
          nik: "7171 0101.9000-0001",
          name: "  Siti   Rahayu ",
          whatsapp: "0812-3456-7890",
          email: " Siti@Example.COM ",
          emergencyContactPhone: "0812 9876 5432",
          maritalStatus: "MENIKAH",
        }),
      ),
    );
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      nik: "7171010190000001",
      nikMissingReason: null,
      name: "Siti Rahayu",
      whatsapp: "6281234567890",
      email: "siti@example.com",
      emergencyContactName: "Budi Rahayu",
      emergencyContactPhone: "6281298765432",
      address: "Jl. Sam Ratulangi 10, Manado",
      maritalStatus: "MENIKAH",
    });
    expect(row.birthDate?.toISOString().slice(0, 10)).toBe("1990-01-01");
    expect(created.medicalRecordNumber).toBe(`SDY-${YEAR}-0001`);
  });

  it("email dan status pernikahan boleh kosong", async () => {
    const created = await unwrap(createPatient(patientInput({ email: "", maritalStatus: null })));
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ email: null, maritalStatus: null });
  });

  it("menyimpan alasan belum ada NIK bila NIK tidak diisi", async () => {
    const created = await unwrap(createPatient(patientInput({ nik: null, nikMissingReason: "ANAK" })));
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ nik: null, nikMissingReason: "ANAK" });
  });

  it("menolak NIK yang sudah dipakai dengan pesan yang menyebut pemiliknya", async () => {
    const first = await unwrap(createPatient(patientInput({ nik: "7171010190000002", name: "Pemilik Asli" })));
    const second = await createPatient(patientInput({ nik: "7171 0101 9000 0002", name: "Pendaftar Kedua", whatsapp: "6281200000002" }));
    expect(second).toEqual({
      ok: false,
      error: `NIK ini sudah terdaftar atas nama Pemilik Asli (${first.medicalRecordNumber}).`,
    });
    expect(await prisma.patient.count()).toBe(1);
  });

  it("isian yang ditolak tidak memakan nomor rekam medis", async () => {
    const rejected: Partial<Parameters<typeof patientInput>[0]>[] = [
      { name: "" },
      { birthDate: "2999-01-01" },
      { whatsapp: "0812" },
      { email: "bukan-email" },
      { emergencyContactName: "" },
      { emergencyContactPhone: "" },
      { address: "" },
      { nik: null, nikMissingReason: null },
      { nik: "123" },
    ];
    for (const patch of rejected) {
      const result = await createPatient(patientInput(patch));
      expect(result.ok, JSON.stringify(patch)).toBe(false);
    }
    expect(await prisma.patientNumberCounter.count()).toBe(0);
    expect(await prisma.patient.count()).toBe(0);

    const next = await unwrap(createPatient(patientInput()));
    expect(next.medicalRecordNumber).toBe(`SDY-${YEAR}-0001`);
  });

  it("nilai bukan teks dari browser ditolak dengan pesan, bukan galat", async () => {
    const hostile = { ...patientInput(), name: 123, nik: {}, birthDate: null, address: ["x"] } as never;
    const result = await createPatient(hostile);
    expect(result.ok).toBe(false);
    expect(await createPatient(null as never)).toEqual({ ok: false, error: expect.any(String) });
    expect(await prisma.patientNumberCounter.count()).toBe(0);
  });

  it("dua pendaftaran dengan NIK sama bersamaan: tepat satu lolos dan nomor tidak terbuang", async () => {
    const nik = "7171010190000003";
    const results = await Promise.all([
      createPatient(patientInput({ nik, name: "Rebutan A", whatsapp: "6281200000003" })),
      createPatient(patientInput({ nik, name: "Rebutan B", whatsapp: "6281200000004" })),
    ]);
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ ok: false, error: expect.stringMatching(/^NIK ini sudah terdaftar atas nama Rebutan [AB] \(SDY-\d{4}-0001\)\.$/) });
    expect(await prisma.patient.count({ where: { nik } })).toBe(1);
    expect((await prisma.patientNumberCounter.findFirstOrThrow()).value).toBe(1);
  });

  it("pemeriksaan awal terlewat (balapan): pelanggaran indeks unik diterjemahkan dan nomor dibatalkan", async () => {
    const nik = "7171010190000004";
    await unwrap(createPatient(patientInput({ nik, name: "Sudah Ada" })));
    // Meniru pendaftar kedua yang pemeriksaan awalnya belum melihat pemilik NIK.
    const findFirst = vi.spyOn(prisma.patient, "findFirst").mockImplementationOnce((async () => null) as never);
    try {
      const result = await createPatient(patientInput({ nik, name: "Terlambat", whatsapp: "6281200000005" }));
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/^NIK ini sudah terdaftar atas nama Sudah Ada \(SDY-\d{4}-0001\)\.$/) });
      expect(findFirst).toHaveBeenCalled();
    } finally {
      findFirst.mockRestore();
    }
    expect(await prisma.patient.count()).toBe(1);
    // Nomor yang sempat diambil pendaftar kedua ikut batal bersama transaksinya.
    expect((await prisma.patientNumberCounter.findFirstOrThrow()).value).toBe(1);
  });

  it("ringkasan yang kembali ke browser tidak memuat NIK, email, atau kontak darurat", async () => {
    const created = await unwrap(createPatient(patientInput({ nik: "7171010190000005", email: "rahasia@example.com" })));
    const json = JSON.stringify(created);
    expect(json).not.toContain("7171010190000005");
    expect(json).not.toContain("rahasia@example.com");
    expect(json).not.toContain("Budi Rahayu");
    expect(Object.keys(created).sort()).toEqual(
      ["id", "lastVisitAt", "medicalRecordNumber", "name", "nextBookingAt", "programStatus", "whatsapp"].sort(),
    );
  });

  it("catatan audit hanya memuat nama dan nomor rekam medis", async () => {
    const created = await unwrap(
      createPatient(patientInput({ nik: "7171010190000006", email: "rahasia@example.com", emergencyContactName: "Kontak Rahasia" })),
    );
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.create", entityId: created.id } });
    expect(audit.summary).toBe(`Siti Rahayu (${created.medicalRecordNumber})`);
    const all = JSON.stringify(audit);
    expect(all).not.toContain("7171010190000006");
    expect(all).not.toContain("rahasia@example.com");
    expect(all).not.toContain("Kontak Rahasia");
  });

  it("memerlukan hak booking:manage dan tidak menyimpan apa pun bila ditolak", async () => {
    await unwrap(createPatient(patientInput()));
    expect(requireCapability).toHaveBeenLastCalledWith("booking:manage");

    vi.mocked(requireCapability).mockRejectedValueOnce(new Error("Tidak berhak"));
    await expect(createPatient(patientInput())).rejects.toThrow("Tidak berhak");
    expect(await prisma.patient.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:integration -- tests/integration/patient-registration.test.ts`
Expected: FAIL — `createPatient` lama mengabaikan kolom baru dan tidak memvalidasi (mis. "menyimpan data lengkap" gagal karena `nik`/`email` null; "isian yang ditolak" gagal karena input diterima).

- [ ] **Step 3: Perluas `insertPatient`**

Di `src/server/patient-store.ts` ubah impor dan tipe `data`:

```ts
import type { Gender, MaritalStatus, NikMissingReason, Patient, Prisma, PrismaClient } from "@prisma/client";
```

```ts
  data: {
    name: string;
    whatsapp: string;
    birthDate: Date | null;
    gender?: Gender | null;
    occupation?: string | null;
    address?: string | null;
    email?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    maritalStatus?: MaritalStatus | null;
    nik?: string | null;
    nikMissingReason?: NikMissingReason | null;
  },
```

(isi fungsi tidak berubah: `...data` sudah menyebar semua kolom.)

- [ ] **Step 4: Tulis ulang `createPatient`**

Di `src/server/patient.ts`: tambahkan impor

```ts
import {
  firstRegistrationError,
  validatePatientRegistration,
  type PatientRegistrationInput,
} from "@/lib/patient-registration";
import { witaDateString } from "@/lib/time";
```

Ganti seluruh fungsi `createPatient` (dari `export async function createPatient(` sampai kurung penutupnya) dengan:

```ts
/** Pemilik NIK (pasien mana pun yang memegangnya) lengkap dengan bentuk ringkasan dan tanggal lahir. */
async function findNikOwner(nik: string) {
  return prisma.patient.findFirst({
    where: { nik },
    select: { ...summarySelect(new Date()), birthDate: true },
  });
}

function nikTakenMessage(owner: { name: string; medicalRecordNumber: string }): string {
  return `NIK ini sudah terdaftar atas nama ${owner.name} (${owner.medicalRecordNumber}).`;
}

/**
 * Pendaftaran pasien oleh resepsionis (spec pendaftaran pasien di panel). Semua isian divalidasi
 * SEBELUM nomor rekam medis dialokasikan, dan penyimpanan berjalan dalam satu transaksi: nomor urut
 * yang sempat diambil ikut batal bila NIK ternyata direbut pendaftar lain di antara pemeriksaan dan simpan.
 */
export async function createPatient(input: PatientRegistrationInput): Promise<ActionResult<PatientSummary>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");

    const checked = validatePatientRegistration(input ?? {}, witaDateString(new Date()));
    if (!checked.ok) throw new UserFacingError(firstRegistrationError(checked.errors));
    const data = checked.value;

    if (data.nik) {
      const owner = await findNikOwner(data.nik);
      if (owner) throw new UserFacingError(nikTakenMessage(owner));
    }

    let patient;
    try {
      patient = await prisma.$transaction((tx) => insertPatient(tx, data));
    } catch (error) {
      // Dua pendaftar bersamaan: indeks unik Patient_nik_key menolak yang kedua, bukan galat umum.
      if (isUniqueViolation(error) && data.nik) {
        const owner = await findNikOwner(data.nik);
        if (owner) throw new UserFacingError(nikTakenMessage(owner));
      }
      throw error;
    }

    await recordAudit({
      actor,
      action: "patient.create",
      entity: "Patient",
      entityId: patient.id,
      // Tanpa NIK, email, dan kontak darurat: catatan audit hanya memuat nama dan nomor rekam medis.
      summary: `${patient.name} (${patient.medicalRecordNumber})`,
    });

    safeRevalidatePath("/admin/pasien");
    // Pasien yang baru dibuat belum punya booking.
    return toSummary({ ...patient, appointments: [] });
  });
}
```

Hapus impor `normalizeWhatsapp` dari `src/server/patient.ts` **hanya bila** tidak lagi dipakai di berkas itu (masih dipakai `findPatientsByWhatsapp`, jadi biarkan).

- [ ] **Step 5: Jalankan uji baru, pastikan lulus**

Run: `npm run test:integration -- tests/integration/patient-registration.test.ts`
Expected: PASS 11/11 (jumlah uji di berkas pada titik ini).

- [ ] **Step 6: Perbarui uji lama yang memanggil `createPatient`**

Di `tests/integration/patient.test.ts` dan `tests/integration/patient-booking-info.test.ts`, tambahkan impor `import { patientInput } from "./patient-fixture";` lalu bungkus semua panggilan:

Run:
```bash
perl -pi -e 's/createPatient\(\{ (.*) \}\)/createPatient(patientInput({ $1 }))/' tests/integration/patient.test.ts tests/integration/patient-booking-info.test.ts
grep -n "createPatient({" tests/integration/patient.test.ts tests/integration/patient-booking-info.test.ts
```
Expected: `grep` tidak mencetak apa pun (tidak ada panggilan telanjang tersisa). Periksa `git diff` kedua berkas: hanya pembungkusan `patientInput(...)` dan satu baris impor.

Run: `npm run test:integration -- tests/integration/patient.test.ts tests/integration/patient-booking-info.test.ts tests/integration/intake-matching.test.ts tests/integration/intake-approval.test.ts tests/integration/patient-nik.test.ts tests/integration/patient-detail.test.ts tests/integration/patient-records.test.ts`
Expected: PASS semua (uji lama tentang nama kosong dan nomor WhatsApp tidak sah tetap lulus: pesannya memuat "nama" dan "WhatsApp").

- [ ] **Step 7: Mutasi — buktikan transaksi dan penerjemahan sahih**

(a) Ubah sementara `prisma.$transaction((tx) => insertPatient(tx, data))` menjadi `insertPatient(prisma, data)`. Jalankan `npm run test:integration -- tests/integration/patient-registration.test.ts`.
Expected: FAIL pada "pemeriksaan awal terlewat" (nilai penghitung 2, bukan 1). Kembalikan.
(b) Hapus sementara blok `if (isUniqueViolation(error) …)`. Jalankan ulang.
Expected: FAIL pada "pemeriksaan awal terlewat" (galat Prisma mentah dilempar). Kembalikan; jalankan ulang: PASS.

- [ ] **Step 8: Periksa tipe**

Run: `npx tsc --noEmit`
Expected: satu-satunya galat ada di `src/components/admin/new-patient-form.tsx` (masih memanggil `createPatient({ name, whatsapp })`); diperbaiki di Task 6 (keputusan perencana 8).

- [ ] **Step 9: Commit**

```bash
git add src/server/patient-store.ts src/server/patient.ts tests/integration/patient-fixture.ts tests/integration/patient-registration.test.ts tests/integration/patient.test.ts tests/integration/patient-booking-info.test.ts
git commit -m "feat: register patients with full data and reject taken NIK

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Aksi `checkPatientNik`

**Files:**
- Modify: `src/server/patient.ts`
- Modify: `tests/integration/patient-registration.test.ts` (tambah `describe`)

**Interfaces:**
- Consumes: dari Task 3 `findNikOwner`, `toSummary`; `normalizeNik`, `NIK_FORMAT_ERROR` (sudah diimpor di `patient.ts`); `formatDateColumn` (sudah diimpor).
- Produces (dipakai Task 6):
  - `type NikCheck = { status: "FREE" } | { status: "TAKEN"; patient: PatientSummary; birthDateLabel: string | null }`
  - `checkPatientNik(nik: string): Promise<ActionResult<NikCheck>>` — `birthDateLabel` berformat `DD/MM/YYYY`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan impor `checkPatientNik` pada impor `@/server/patient` di `tests/integration/patient-registration.test.ts` (`import { checkPatientNik, createPatient } from "@/server/patient";`) dan `import { NIK_FORMAT_ERROR } from "@/lib/nik";`, lalu tambahkan di akhir berkas:

```ts
describe("checkPatientNik", () => {
  beforeEach(reset);

  it("NIK yang belum dipakai → FREE", async () => {
    expect(await unwrap(checkPatientNik("7171010190000010"))).toEqual({ status: "FREE" });
  });

  it("NIK yang sudah dipakai → TAKEN dengan ringkasan pemilik dan tanggal lahir", async () => {
    const owner = await unwrap(createPatient(patientInput({ nik: "7171010190000011", name: "Pemilik NIK" })));
    const result = await unwrap(checkPatientNik("7171 0101 9000 0011"));
    expect(result).toEqual({
      status: "TAKEN",
      patient: expect.objectContaining({ id: owner.id, name: "Pemilik NIK", medicalRecordNumber: owner.medicalRecordNumber }),
      birthDateLabel: "01/01/1990",
    });
  });

  it("hasilnya tidak memuat email atau kontak darurat pemilik", async () => {
    await unwrap(createPatient(patientInput({ nik: "7171010190000012", email: "rahasia@example.com" })));
    const json = JSON.stringify(await unwrap(checkPatientNik("7171010190000012")));
    expect(json).not.toContain("rahasia@example.com");
    expect(json).not.toContain("Budi Rahayu");
    expect(json).not.toContain("emergency");
  });

  it("menolak NIK yang bukan 16 angka, termasuk nilai bukan teks", async () => {
    expect(await checkPatientNik("123")).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
    expect(await checkPatientNik(null as never)).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
    expect(await checkPatientNik({} as never)).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
  });

  it("memerlukan hak booking:manage", async () => {
    await checkPatientNik("7171010190000013");
    expect(requireCapability).toHaveBeenLastCalledWith("booking:manage");
    vi.mocked(requireCapability).mockRejectedValueOnce(new Error("Tidak berhak"));
    await expect(checkPatientNik("7171010190000013")).rejects.toThrow("Tidak berhak");
  });
});
```

(Koneksi ditutup oleh `afterAll` tingkat berkas dari Task 3; describe ini tidak menutupnya sendiri.)

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:integration -- tests/integration/patient-registration.test.ts`
Expected: FAIL (`checkPatientNik is not a function`).

- [ ] **Step 3: Tulis implementasi**

Di `src/server/patient.ts`, tepat setelah `createPatient`:

```ts
export type NikCheck =
  | { status: "FREE" }
  /** Kartu pasien pemilik NIK; `patient` utuh agar tombol "Pakai pasien ini" bisa langsung memakainya. */
  | { status: "TAKEN"; patient: PatientSummary; birthDateLabel: string | null };

/**
 * Cek NIK saat resepsionis mengetik di dialog Pasien baru: sudah dipakai siapa, atau masih bebas.
 * Hanya staf berhak; hasilnya tidak memuat data pribadi di luar ringkasan pasien.
 */
export async function checkPatientNik(nik: string): Promise<ActionResult<NikCheck>> {
  return runAction<NikCheck>(async () => {
    await requireCapability("booking:manage");
    const normalized = normalizeNik(typeof nik === "string" ? nik : "");
    if (!normalized) throw new UserFacingError(NIK_FORMAT_ERROR);
    const owner = await findNikOwner(normalized);
    if (!owner) return { status: "FREE" };
    return { status: "TAKEN", patient: toSummary(owner), birthDateLabel: formatDateColumn(owner.birthDate) };
  });
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npm run test:integration -- tests/integration/patient-registration.test.ts`
Expected: PASS 16/16.

- [ ] **Step 5: Commit**

```bash
git add src/server/patient.ts tests/integration/patient-registration.test.ts
git commit -m "feat: add live NIK ownership check for patient registration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Data baru di halaman detail pasien

**Files:**
- Modify: `src/server/patient.ts` (`PatientDetail`, `getPatientDetail`)
- Modify: `src/components/admin/patient-detail-view.tsx`
- Modify: `tests/unit/components/patient-detail-view.test.tsx`
- Modify: `tests/integration/patient-registration.test.ts` (tambah `describe`)

**Interfaces:**
- Consumes: `MARITAL_STATUS_LABEL` dari Task 2; kolom Task 1; `createPatient`/`patientInput` dari Task 3.
- Produces: `PatientDetail` bertambah `email: string | null`, `emergencyContact: { name: string; phone: string } | null`, `maritalStatusLabel: string | null`.

- [ ] **Step 1: Tulis uji yang gagal**

Di `tests/unit/components/patient-detail-view.test.tsx`: tambahkan ke objek `patient` (setelah `nikMissingReason: null,`):

```ts
  email: "siti@example.com",
  emergencyContact: { name: "Budi Rahayu", phone: "6281298765432" },
  maritalStatusLabel: "Menikah",
```

dan di dalam `describe` yang ada tambahkan:

```tsx
  it("kartu Data diri menampilkan email, kontak darurat, dan status pernikahan", () => {
    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(screen.getByText("Email").parentElement).toHaveTextContent("siti@example.com");
    expect(screen.getByText("Kontak darurat").parentElement).toHaveTextContent("Budi Rahayu · 6281298765432");
    expect(screen.getByText("Status pernikahan").parentElement).toHaveTextContent("Menikah");
  });

  it("pasien lama tanpa data baru menampilkan strip, bukan kosong", () => {
    renderAdmin(
      <PatientDetailView patient={{ ...patient, email: null, emergencyContact: null, maritalStatusLabel: null }} canReadRecords canWriteRecords />,
    );
    for (const label of ["Email", "Kontak darurat", "Status pernikahan"]) {
      expect(screen.getByText(label).parentElement).toHaveTextContent("—");
    }
  });
```

Tambahkan di akhir `tests/integration/patient-registration.test.ts` (impor `getPatientDetail` dari `@/server/patient`):

```ts
describe("getPatientDetail: data pendaftaran", () => {
  beforeEach(reset);

  it("memuat email, kontak darurat, dan status pernikahan", async () => {
    const created = await unwrap(
      createPatient(patientInput({ nik: "7171010190000020", email: "Siti@Example.com", maritalStatus: "CERAI_HIDUP" })),
    );
    const detail = await getPatientDetail(created.id);
    expect(detail).toMatchObject({
      email: "siti@example.com",
      emergencyContact: { name: "Budi Rahayu", phone: "6281298765432" },
      maritalStatusLabel: "Cerai hidup",
    });
  });

  it("pasien lama tanpa data baru → null semua", async () => {
    const legacy = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-9201", name: "Pasien Lama", whatsapp: "6281200009201" },
    });
    const detail = await getPatientDetail(legacy.id);
    expect(detail).toMatchObject({ email: null, emergencyContact: null, maritalStatusLabel: null });
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/components/patient-detail-view.test.tsx` dan `npm run test:integration -- tests/integration/patient-registration.test.ts`
Expected: FAIL (label "Email"/"Kontak darurat"/"Status pernikahan" tidak ada; `detail.email` undefined).

- [ ] **Step 3: Tulis implementasi**

`src/server/patient.ts`: impor `MARITAL_STATUS_LABEL` dari `@/lib/patient-registration` (gabungkan dengan impor Task 3). Di tipe `PatientDetail` tambahkan setelah `nikMissingReason`:

```ts
  email: string | null;
  /** Nama dan nomor terisi bersamaan (CHECK patient_emergency_pair); null untuk pasien lama. */
  emergencyContact: { name: string; phone: string } | null;
  maritalStatusLabel: string | null;
```

Di `select` pada `getPatientDetail` (setelah `nikMissingReason: true,`):

```ts
      email: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      maritalStatus: true,
```

Di objek kembalian (setelah `nikMissingReason: patient.nikMissingReason,`):

```ts
    email: patient.email,
    emergencyContact:
      patient.emergencyContactName && patient.emergencyContactPhone
        ? { name: patient.emergencyContactName, phone: patient.emergencyContactPhone }
        : null,
    maritalStatusLabel: patient.maritalStatus ? MARITAL_STATUS_LABEL[patient.maritalStatus] : null,
```

`src/components/admin/patient-detail-view.tsx`, di kartu "Data diri" tambahkan setelah `Pekerjaan` dan sebelum `Alamat`:

```tsx
            <Field label="Email" value={patient.email} />
            <Field label="Status pernikahan" value={patient.maritalStatusLabel} />
            <Field
              label="Kontak darurat"
              value={patient.emergencyContact ? `${patient.emergencyContact.name} · ${patient.emergencyContact.phone}` : null}
              wide
            />
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx vitest run tests/unit/components/patient-detail-view.test.tsx` dan `npm run test:integration -- tests/integration/patient-registration.test.ts tests/integration/patient-detail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/patient.ts src/components/admin/patient-detail-view.tsx tests/unit/components/patient-detail-view.test.tsx tests/integration/patient-registration.test.ts
git commit -m "feat: show email, emergency contact, and marital status on patient detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Dialog "Pasien baru" dengan cek NIK

**Files:**
- Create: `src/components/admin/nik-check-panel.tsx`
- Modify (tulis ulang): `src/components/admin/new-patient-form.tsx`
- Test: `tests/unit/components/new-patient-form.test.tsx`

**Interfaces:**
- Consumes: `checkPatientNik`, `createPatient`, `findPatientsByWhatsapp`, `PatientSummary` dari `@/server/patient` (Task 3, 4); `validatePatientRegistration`, `MARITAL_STATUS_LABEL`, `RegistrationErrors`, `PatientRegistrationInput` (Task 2); `NikInput`, `NikDraft` (sudah ada); `DateField`, `SelectField`, `DialogCloseButton`, `TextLink` (sudah ada); `nikMismatchWarning`, `normalizeNik`; `witaDateString`.
- Produces: `NikCheckPanel({ state, onPickExisting })` dan `type NikCheckState = { kind: "IDLE" } | { kind: "CHECKING" } | { kind: "ERROR" } | { kind: "FREE" } | { kind: "TAKEN"; patient: PatientSummary; birthDateLabel: string | null }`; `NewPatientForm` dengan props yang sama seperti sekarang (`onCreated?`, `onPickExisting?`) — tidak ada perubahan di pemanggilnya (`pasien/page.tsx`, `patient-picker.tsx`).

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/new-patient-form.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewPatientForm } from "@/components/admin/new-patient-form";
import type { ActionResult } from "@/lib/action-result";
import { checkPatientNik, createPatient, findPatientsByWhatsapp, type NikCheck, type PatientSummary } from "@/server/patient";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/patient", () => ({
  checkPatientNik: vi.fn(),
  createPatient: vi.fn(),
  findPatientsByWhatsapp: vi.fn(),
}));

const NIK = "7171015705900001"; // 17 Mei 1990, perempuan
const OWNER: PatientSummary = {
  id: "p-owner",
  medicalRecordNumber: "SDY-2026-0007",
  name: "Maria Wenas",
  whatsapp: "6281234567001",
  programStatus: "AKTIF",
  lastVisitAt: null,
  nextBookingAt: null,
};
const CREATED: PatientSummary = { ...OWNER, id: "p-new", medicalRecordNumber: "SDY-2026-0099", name: "Siti Rahayu" };

const FREE: ActionResult<NikCheck> = { ok: true, data: { status: "FREE" } };
const TAKEN: ActionResult<NikCheck> = { ok: true, data: { status: "TAKEN", patient: OWNER, birthDateLabel: "17/05/1990" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkPatientNik).mockResolvedValue(FREE);
  vi.mocked(findPatientsByWhatsapp).mockResolvedValue([]);
  vi.mocked(createPatient).mockResolvedValue({ ok: true, data: CREATED });
});

async function openDialog(props: Parameters<typeof NewPatientForm>[0] = {}) {
  const user = userEvent.setup();
  renderAdmin(<NewPatientForm {...props} />);
  await user.click(screen.getByRole("button", { name: "+ Pasien Baru" }));
  const dialog = await screen.findByRole("dialog", { name: "Pasien baru" });
  return { user, dialog };
}

async function fillRest(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(within(dialog).getByLabelText("Nama", { exact: true }), "Siti Rahayu");
  setDateField("Tanggal lahir", "1990-05-17", within(dialog));
  await user.type(within(dialog).getByLabelText("No. HP (WhatsApp)"), "081234567890");
  await user.type(within(dialog).getByLabelText("Nama kontak darurat"), "Budi Rahayu");
  await user.type(within(dialog).getByLabelText("Nomor kontak darurat"), "081298765432");
  await user.type(within(dialog).getByLabelText("Alamat"), "Jl. Sam Ratulangi 10");
}

describe("NewPatientForm", () => {
  it("membuka dialog berisi semua isian", async () => {
    const { dialog } = await openDialog();
    for (const label of ["NIK (16 angka)", "No. HP (WhatsApp)", "Email (opsional)", "Nama kontak darurat", "Nomor kontak darurat", "Alamat", "Status pernikahan (opsional)"]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(dialog).getByLabelText("Nama", { exact: true })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Tanggal lahir" })).toBeInTheDocument();
  });

  describe("cek NIK", () => {
    it("memeriksa begitu 16 angka diketik dan menampilkan 'belum terdaftar'", async () => {
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), "7171 0157 0590 0001");
      expect(await within(dialog).findByText("NIK belum terdaftar.")).toBeInTheDocument();
      expect(checkPatientNik).toHaveBeenCalledTimes(1);
      expect(checkPatientNik).toHaveBeenCalledWith(NIK);
    });

    it("tidak memeriksa sebelum 16 angka lengkap", async () => {
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), "71710157");
      expect(checkPatientNik).not.toHaveBeenCalled();
    });

    it("NIK sudah terdaftar: kartu pasien, Simpan nonaktif, dan 'Pakai pasien ini'", async () => {
      vi.mocked(checkPatientNik).mockResolvedValue(TAKEN);
      const onPickExisting = vi.fn();
      const { user, dialog } = await openDialog({ onPickExisting });
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);

      expect(await within(dialog).findByText("NIK sudah terdaftar")).toBeInTheDocument();
      const card = within(dialog).getByText("NIK sudah terdaftar").closest("[role='alert']") as HTMLElement;
      expect(card).toHaveTextContent("Maria Wenas");
      expect(card).toHaveTextContent("SDY-2026-0007");
      expect(card).toHaveTextContent("17/05/1990");
      expect(card).toHaveTextContent("6281234567001");
      expect(within(dialog).getByRole("button", { name: "Buat Pasien" })).toBeDisabled();

      await user.click(within(card).getByRole("button", { name: "Pakai pasien ini" }));
      expect(onPickExisting).toHaveBeenCalledWith(OWNER);
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pasien baru" })).not.toBeInTheDocument());
    });

    it("tanpa onPickExisting kartu menawarkan tautan ke data pasien", async () => {
      vi.mocked(checkPatientNik).mockResolvedValue(TAKEN);
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      const link = await within(dialog).findByRole("link", { name: "Buka data pasien" });
      expect(link).toHaveAttribute("href", "/admin/pasien/p-owner");
      expect(within(dialog).queryByRole("button", { name: "Pakai pasien ini" })).not.toBeInTheDocument();
    });

    it("peringatan (tidak menghalangi) bila tanggal lahir tidak cocok dengan kode di NIK", async () => {
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      setDateField("Tanggal lahir", "1991-01-01", within(dialog));
      expect(await within(dialog).findByText("Tanggal lahir di NIK berbeda dengan data pasien — periksa KTP.")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Buat Pasien" })).toBeEnabled();
    });

    it("hasil untuk NIK lama tidak menandai NIK baru sebagai terdaftar", async () => {
      let resolveFirst!: (value: ActionResult<NikCheck>) => void;
      vi.mocked(checkPatientNik)
        .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce(FREE);
      const { user, dialog } = await openDialog();
      const input = within(dialog).getByLabelText("NIK (16 angka)");

      await user.type(input, NIK); // pemeriksaan pertama menggantung
      await user.clear(input);
      await user.type(input, "7171015705900002");
      expect(await within(dialog).findByText("NIK belum terdaftar.")).toBeInTheDocument();

      resolveFirst(TAKEN); // jawaban terlambat untuk NIK yang sudah diganti
      await waitFor(() => expect(checkPatientNik).toHaveBeenCalledTimes(2));
      expect(within(dialog).queryByText("NIK sudah terdaftar")).not.toBeInTheDocument();
      expect(within(dialog).getByText("NIK belum terdaftar.")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Buat Pasien" })).toBeEnabled();
    });

    it("pemeriksaan yang gagal tidak menghalangi menyimpan", async () => {
      vi.mocked(checkPatientNik).mockRejectedValue(new Error("jaringan"));
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      expect(await within(dialog).findByText(/belum bisa diperiksa sekarang/)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Buat Pasien" })).toBeEnabled();
    });

    it("'Belum ada NIK' dengan alasan melewati pemeriksaan", async () => {
      const { user, dialog } = await openDialog();
      await user.click(within(dialog).getByRole("radio", { name: "Belum ada NIK" }));
      await user.selectOptions(within(dialog).getByLabelText("Alasan"), "ANAK");
      expect(checkPatientNik).not.toHaveBeenCalled();
    });
  });

  describe("menyimpan", () => {
    it("mengirim data lengkap, memanggil onCreated, dan menutup dialog", async () => {
      const onCreated = vi.fn();
      const { user, dialog } = await openDialog({ onCreated });
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), "7171 0157 0590 0001");
      await fillRest(user, dialog);
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));

      await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
      expect(createPatient).toHaveBeenCalledWith({
        nik: "7171 0157 0590 0001",
        nikMissingReason: null,
        name: "Siti Rahayu",
        birthDate: "1990-05-17",
        whatsapp: "081234567890",
        email: "",
        emergencyContactName: "Budi Rahayu",
        emergencyContactPhone: "081298765432",
        address: "Jl. Sam Ratulangi 10",
        maritalStatus: null,
      });
      expect(onCreated).toHaveBeenCalledWith(CREATED);
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pasien baru" })).not.toBeInTheDocument());
    });

    it("email dan status pernikahan yang diisi ikut terkirim", async () => {
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      await fillRest(user, dialog);
      await user.type(within(dialog).getByLabelText("Email (opsional)"), "siti@example.com");
      await user.selectOptions(within(dialog).getByLabelText("Status pernikahan (opsional)"), "MENIKAH");
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));
      await waitFor(() => expect(createPatient).toHaveBeenCalled());
      expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ email: "siti@example.com", maritalStatus: "MENIKAH" }));
    });

    it("alasan belum ada NIK dikirim tanpa NIK", async () => {
      const { user, dialog } = await openDialog();
      await user.click(within(dialog).getByRole("radio", { name: "Belum ada NIK" }));
      await user.selectOptions(within(dialog).getByLabelText("Alasan"), "ANAK");
      await fillRest(user, dialog);
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));
      await waitFor(() => expect(createPatient).toHaveBeenCalled());
      expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ nik: null, nikMissingReason: "ANAK" }));
    });

    it("isian wajib yang kosong menampilkan galat per isian dan tidak memanggil server", async () => {
      const { user, dialog } = await openDialog();
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));
      for (const message of [
        "Isi NIK 16 angka, atau pilih alasan belum ada NIK.",
        "Nama pasien wajib diisi.",
        "Tanggal lahir wajib diisi.",
        "Nomor HP (WhatsApp) wajib diisi.",
        "Nama kontak darurat wajib diisi.",
        "Nomor kontak darurat wajib diisi.",
        "Alamat wajib diisi.",
      ]) {
        expect(within(dialog).getByText(message)).toBeInTheDocument();
      }
      expect(createPatient).not.toHaveBeenCalled();
    });

    it("galat dari server tampil di dalam dialog dan dialog tetap terbuka", async () => {
      vi.mocked(createPatient).mockResolvedValue({ ok: false, error: "NIK ini sudah terdaftar atas nama Maria Wenas (SDY-2026-0007)." });
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      await fillRest(user, dialog);
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));
      expect(await within(dialog).findByText("NIK ini sudah terdaftar atas nama Maria Wenas (SDY-2026-0007).")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Pasien baru" })).toBeInTheDocument();
    });
  });

  it("peringatan nomor WhatsApp yang sama tetap ada, dengan 'Pakai pasien ini'", async () => {
    vi.mocked(findPatientsByWhatsapp).mockResolvedValue([OWNER]);
    const onPickExisting = vi.fn();
    const { user, dialog } = await openDialog({ onPickExisting });
    const phone = within(dialog).getByLabelText("No. HP (WhatsApp)");
    await user.type(phone, "081234567001");
    await user.tab();
    expect(await within(dialog).findByText("Nomor ini sudah terdaftar. Pastikan ini bukan pasien yang sama:")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Pakai pasien ini" }));
    expect(onPickExisting).toHaveBeenCalledWith(OWNER);
  });

  it("klik latar tidak menutup dialog, tombol Batal menutupnya", async () => {
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText("Nama", { exact: true }), "Terlanjur diketik");
    await user.click(document.querySelector(".MuiBackdrop-root") as HTMLElement);
    expect(screen.getByRole("dialog", { name: "Pasien baru" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Batal" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pasien baru" })).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/components/new-patient-form.test.tsx`
Expected: FAIL (tidak ada dialog "Pasien baru"; label belum ada).

- [ ] **Step 3: Tulis `NikCheckPanel`**

Buat `src/components/admin/nik-check-panel.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import type { PatientSummary } from "@/server/patient";
import { TextLink } from "./mui/links";

export type NikCheckState =
  | { kind: "IDLE" }
  | { kind: "CHECKING" }
  | { kind: "ERROR" }
  | { kind: "FREE" }
  | { kind: "TAKEN"; patient: PatientSummary; birthDateLabel: string | null };

/** Hasil cek NIK di bawah isian NIK pada dialog Pasien baru (spec pendaftaran pasien bagian 6.1). */
export function NikCheckPanel({
  state,
  onPickExisting,
}: {
  state: NikCheckState;
  /** Bila diisi, kartu menawarkan "Pakai pasien ini"; bila tidak, tautan ke data pasien. */
  onPickExisting?: (patient: PatientSummary) => void;
}) {
  if (state.kind === "IDLE") return null;
  if (state.kind === "CHECKING") {
    return (
      <Typography variant="caption" role="status" sx={{ color: "text.secondary" }}>
        Memeriksa NIK…
      </Typography>
    );
  }
  if (state.kind === "ERROR") {
    return (
      <Alert severity="info" role="status">
        NIK belum bisa diperiksa sekarang. Pemeriksaan diulang saat disimpan.
      </Alert>
    );
  }
  if (state.kind === "FREE") {
    return (
      <Alert severity="success" role="status">
        NIK belum terdaftar.
      </Alert>
    );
  }

  const { patient, birthDateLabel } = state;
  return (
    <Alert severity="warning" icon={false}>
      <Typography component="p" sx={{ m: 0, fontWeight: 600 }}>
        NIK sudah terdaftar
      </Typography>
      <Box component="p" sx={{ mt: 0.5, mb: 1 }}>
        <strong>{patient.name}</strong> · {patient.medicalRecordNumber}
        <br />
        Lahir {birthDateLabel ?? "—"} · WhatsApp {patient.whatsapp}
      </Box>
      {onPickExisting ? (
        <Button type="button" size="small" variant="outlined" onClick={() => onPickExisting(patient)}>
          Pakai pasien ini
        </Button>
      ) : (
        <TextLink href={`/admin/pasien/${patient.id}`}>Buka data pasien</TextLink>
      )}
    </Alert>
  );
}
```

- [ ] **Step 4: Tulis ulang `NewPatientForm`**

Ganti seluruh isi `src/components/admin/new-patient-form.tsx` dengan:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { nikMismatchWarning, normalizeNik } from "@/lib/nik";
import {
  BIRTH_DATE_MIN,
  MARITAL_STATUS_LABEL,
  validatePatientRegistration,
  type PatientRegistrationInput,
  type RegistrationErrors,
  type RegistrationField,
} from "@/lib/patient-registration";
import { witaDateString } from "@/lib/time";
import { checkPatientNik, createPatient, findPatientsByWhatsapp, type PatientSummary } from "@/server/patient";
import { DateField } from "./mui/date-field";
import { DialogCloseButton } from "./mui/dialog-close-button";
import { SelectField } from "./mui/select-field";
import { NikCheckPanel, type NikCheckState } from "./nik-check-panel";
import { NikInput, type NikDraft } from "./nik-input";

type Props = {
  onCreated?: (patient: PatientSummary) => void;
  /** Bila diisi, peringatan duplikat dan cek NIK menawarkan tombol untuk memakai pasien yang sudah ada. */
  onPickExisting?: (patient: PatientSummary) => void;
};

type Draft = {
  nik: NikDraft;
  name: string;
  birthDate: string;
  whatsapp: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  maritalStatus: string;
};

const EMPTY: Draft = {
  nik: { mode: "NIK", value: "" },
  name: "",
  birthDate: "",
  whatsapp: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  address: "",
  maritalStatus: "",
};

type NikResult = "FREE" | "ERROR" | { patient: PatientSummary; birthDateLabel: string | null };

function toInput(draft: Draft): PatientRegistrationInput {
  return {
    nik: draft.nik.mode === "NIK" ? draft.nik.value : null,
    nikMissingReason: draft.nik.mode === "MISSING" ? draft.nik.reason || null : null,
    name: draft.name,
    birthDate: draft.birthDate,
    whatsapp: draft.whatsapp,
    email: draft.email,
    emergencyContactName: draft.emergencyContactName,
    emergencyContactPhone: draft.emergencyContactPhone,
    address: draft.address,
    maritalStatus: draft.maritalStatus || null,
  };
}

export function NewPatientForm({ onCreated, onPickExisting }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<PatientSummary[]>([]);
  // Hasil cek NIK dicatat bersama NIK yang diperiksa: jawaban untuk NIK yang sudah diganti tidak berlaku.
  const [checked, setChecked] = useState<{ nik: string; result: NikResult } | null>(null);
  const [pending, startTransition] = useTransition();
  // Transition terpisah: pemeriksaan duplikat terpicu saat kolom nomor kehilangan fokus — tepat ketika admin
  // mengklik "Buat Pasien". Bila berbagi `pending`, tombol itu sudah nonaktif saat kliknya mendarat.
  const [, startDuplicateCheck] = useTransition();

  const typedNik = draft.nik.mode === "NIK" ? normalizeNik(draft.nik.value) : null;

  useEffect(() => {
    if (!typedNik) return;
    let current = true;
    checkPatientNik(typedNik)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          setChecked({ nik: typedNik, result: "ERROR" });
          return;
        }
        setChecked({
          nik: typedNik,
          result: result.data.status === "FREE" ? "FREE" : { patient: result.data.patient, birthDateLabel: result.data.birthDateLabel },
        });
      })
      .catch(() => {
        if (current) setChecked({ nik: typedNik, result: "ERROR" });
      });
    return () => {
      current = false;
    };
  }, [typedNik]);

  let nikState: NikCheckState = { kind: "IDLE" };
  if (typedNik) {
    if (checked?.nik !== typedNik) nikState = { kind: "CHECKING" };
    else if (checked.result === "FREE") nikState = { kind: "FREE" };
    else if (checked.result === "ERROR") nikState = { kind: "ERROR" };
    else nikState = { kind: "TAKEN", ...checked.result };
  }

  const nikWarning = typedNik ? nikMismatchWarning(typedNik, { birthDate: draft.birthDate || null, gender: null }) : null;

  function update(patch: Partial<Draft>) {
    setDraft((value) => ({ ...value, ...patch }));
    setErrors((value) => {
      const next = { ...value };
      for (const key of Object.keys(patch)) delete next[key as RegistrationField];
      return next;
    });
    setServerError(null);
  }

  function close() {
    setOpen(false);
    setDraft(EMPTY);
    setErrors({});
    setServerError(null);
    setDuplicates([]);
    setChecked(null);
  }

  function handleCheckDuplicate() {
    if (!draft.whatsapp.trim()) {
      setDuplicates([]);
      return;
    }
    startDuplicateCheck(async () => {
      try {
        setDuplicates(await findPatientsByWhatsapp(draft.whatsapp));
      } catch {
        // Pemeriksaan duplikat hanya peringatan; kegagalannya tidak boleh menghalangi pendaftaran.
        setDuplicates([]);
      }
    });
  }

  function handleCreate() {
    const input = toInput(draft);
    const validation = validatePatientRegistration(input, witaDateString(new Date()));
    if (!validation.ok) {
      setErrors(validation.errors);
      setServerError(null);
      return;
    }
    setErrors({});
    setServerError(null);
    startTransition(async () => {
      try {
        const result = await createPatient(input);
        if (!result.ok) {
          setServerError(result.error);
          return;
        }
        const patient = result.data;
        toast.success(`Pasien ${patient.name} (${patient.medicalRecordNumber}) dibuat.`);
        onCreated?.(patient);
        close();
      } catch {
        setServerError("Gagal membuat pasien. Coba lagi.");
      }
    });
  }

  function handlePickExisting(patient: PatientSummary) {
    onPickExisting?.(patient);
    close();
  }

  const today = witaDateString(new Date());

  return (
    <>
      <Button type="button" variant="outlined" size="small" onClick={() => setOpen(true)}>
        + Pasien Baru
      </Button>
      <Dialog
        open={open}
        // Formulir panjang: klik latar yang tak disengaja tidak boleh membuang isian. Silang, Batal, dan Escape tetap menutup.
        onClose={(_, reason) => {
          if (reason === "backdropClick" || pending) return;
          close();
        }}
        fullWidth
        maxWidth="sm"
        scroll="paper"
      >
        <DialogTitle sx={{ pr: 6 }}>Pasien baru</DialogTitle>
        <DialogCloseButton onClick={close} />
        {/* Tanpa elemen <form>: dialog ini dipakai di dalam dialog/halaman lain, dan event submit React menggelembung lewat portal. */}
        <DialogContent dividers>
          <Stack spacing={2}>
            <div>
              <NikInput draft={draft.nik} onChange={(nik) => update({ nik })} warning={nikWarning} />
              {errors.nik && <FormHelperText error>{errors.nik}</FormHelperText>}
            </div>
            <NikCheckPanel state={nikState} onPickExisting={onPickExisting ? handlePickExisting : undefined} />

            <TextField
              id="new-patient-name"
              label="Nama"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              error={!!errors.name}
              helperText={errors.name}
              fullWidth
            />
            <DateField
              id="new-patient-birth-date"
              label="Tanggal lahir"
              value={draft.birthDate}
              onChange={(birthDate) => update({ birthDate })}
              min={BIRTH_DATE_MIN}
              max={today}
              error={!!errors.birthDate}
              helperText={errors.birthDate}
              fullWidth
            />
            <TextField
              id="new-patient-whatsapp"
              label="No. HP (WhatsApp)"
              value={draft.whatsapp}
              onChange={(e) => update({ whatsapp: e.target.value })}
              onBlur={handleCheckDuplicate}
              placeholder="081234567890"
              slotProps={{ htmlInput: { inputMode: "tel" } }}
              error={!!errors.whatsapp}
              helperText={errors.whatsapp}
              fullWidth
            />

            {duplicates.length > 0 && (
              <Alert severity="warning" icon={false}>
                <Box component="p" sx={{ mt: 0, mb: 1 }}>
                  Nomor ini sudah terdaftar. Pastikan ini bukan pasien yang sama:
                </Box>
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {duplicates.map((p) => (
                    <Box component="li" key={p.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                      <span>
                        <strong>{p.name}</strong> · {p.medicalRecordNumber}
                      </span>
                      {onPickExisting && (
                        <Button type="button" size="small" variant="outlined" onClick={() => handlePickExisting(p)}>
                          Pakai pasien ini
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              </Alert>
            )}

            {/* type="text" + inputMode: validasi bawaan peramban tidak ikut campur; aturannya di validatePatientRegistration. */}
            <TextField
              id="new-patient-email"
              label="Email (opsional)"
              value={draft.email}
              onChange={(e) => update({ email: e.target.value })}
              placeholder="nama@contoh.com"
              slotProps={{ htmlInput: { inputMode: "email", autoComplete: "off" } }}
              error={!!errors.email}
              helperText={errors.email}
              fullWidth
            />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" } }}>
              <TextField
                id="new-patient-emergency-name"
                label="Nama kontak darurat"
                value={draft.emergencyContactName}
                onChange={(e) => update({ emergencyContactName: e.target.value })}
                error={!!errors.emergencyContactName}
                helperText={errors.emergencyContactName}
                fullWidth
              />
              <TextField
                id="new-patient-emergency-phone"
                label="Nomor kontak darurat"
                value={draft.emergencyContactPhone}
                onChange={(e) => update({ emergencyContactPhone: e.target.value })}
                placeholder="081234567890"
                slotProps={{ htmlInput: { inputMode: "tel" } }}
                error={!!errors.emergencyContactPhone}
                helperText={errors.emergencyContactPhone}
                fullWidth
              />
            </Box>
            <TextField
              id="new-patient-address"
              label="Alamat"
              value={draft.address}
              onChange={(e) => update({ address: e.target.value })}
              error={!!errors.address}
              helperText={errors.address}
              multiline
              minRows={2}
              fullWidth
            />
            <SelectField
              id="new-patient-marital-status"
              label="Status pernikahan (opsional)"
              value={draft.maritalStatus}
              onChange={(maritalStatus) => update({ maritalStatus })}
              error={!!errors.maritalStatus}
              helperText={errors.maritalStatus}
            >
              <option value="">— Tidak diisi —</option>
              {Object.entries(MARITAL_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>

            {serverError && <Alert severity="error">{serverError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="text" disabled={pending} onClick={close}>
            Batal
          </Button>
          <Button type="button" variant="contained" disabled={pending || nikState.kind === "TAKEN"} onClick={handleCreate}>
            {pending ? "Menyimpan…" : "Buat Pasien"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 5: Jalankan uji komponen, pastikan lulus**

Run: `npx vitest run tests/unit/components/new-patient-form.test.tsx`
Expected: PASS (semua uji hijau). Jika "hasil untuk NIK lama" tidak stabil, periksa bahwa `checked` dikunci per NIK (bukan `current` saja) — jangan melonggarkan uji.

- [ ] **Step 6: Mutasi — buktikan penjaga hasil usang sahih**

Ubah sementara `if (checked?.nik !== typedNik) nikState = { kind: "CHECKING" };` menjadi `if (!checked) nikState = { kind: "CHECKING" };` dan hapus guard `if (!current) return;` di `.then`. Jalankan `npx vitest run tests/unit/components/new-patient-form.test.tsx`.
Expected: FAIL pada "hasil untuk NIK lama tidak menandai NIK baru sebagai terdaftar". Kembalikan kedua perubahan; jalankan ulang: PASS.

- [ ] **Step 7: Pastikan pemanggil dan uji tetangga tetap hijau**

Run: `npx vitest run tests/unit/components/patient-picker.test.tsx tests/unit/components/appointment-form.test.tsx tests/unit/components/online-appointment-form.test.tsx tests/unit/architecture.test.ts` lalu `npx tsc --noEmit` dan `npm run lint`.
Expected: uji PASS (mock `@/server/patient` di berkas lain hanya memakai `createPatient`/`findPatientsByWhatsapp`; bila ada yang gagal karena `checkPatientNik` tidak ada di mock-nya, tambahkan `checkPatientNik: vi.fn()` pada mock itu — dialog tidak terbuka di uji-uji tersebut, jadi cukup menambah kunci); `tsc` bersih; `lint` bersih.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/nik-check-panel.tsx src/components/admin/new-patient-form.tsx tests/unit/components/new-patient-form.test.tsx
git commit -m "feat: new patient dialog with full data and live NIK check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Sertakan berkas uji tetangga di `git add` bila Step 7 memaksa mengubah mock-nya.)

---

### Task 7: Uji E2E dan penyesuaian alur lama

**Files:**
- Create: `tests/e2e/helpers/pasien-baru.ts`
- Create: `tests/e2e/pasien-baru.spec.ts`
- Modify: `tests/e2e/admin-booking.spec.ts`, `tests/e2e/link-kuis.spec.ts`, `tests/e2e/tagihan.spec.ts`, `tests/e2e/dasbor.spec.ts`, `tests/e2e/tampilan-admin.spec.ts`

**Interfaces:**
- Consumes: dialog "Pasien baru" dari Task 6 (judul dialog, label isian, tombol "Buat Pasien", tombol "Pakai pasien ini"); `isiTanggal` dari `tests/e2e/helpers/mui.ts`; `signIn` dari `tests/e2e/helpers/quiz`; `E2E_RESEPSIONIS` dari `tests/e2e/credentials`.
- Produces: `uniqueNik(): string`, `isiPasienBaru(page, { name, whatsapp, nik? }): Promise<Locator>` (mengisi tanpa menyimpan, mengembalikan dialog), `buatPasienBaru(page, isian): Promise<void>` (mengisi lalu klik "Buat Pasien").

- [ ] **Step 1: Tulis helper**

Buat `tests/e2e/helpers/pasien-baru.ts`:

```ts
import { expect, type Locator, type Page } from "@playwright/test";
import { isiTanggal } from "./mui";

let sequence = 0;

/**
 * NIK 16 angka yang berbeda di tiap panggilan dan tiap proses uji. Bagian 7–12 ("010190") = 1 Januari 1990,
 * cocok dengan tanggal lahir bawaan helper ini sehingga tidak ada peringatan kecocokan.
 */
export function uniqueNik(): string {
  sequence += 1;
  return `717101010190${String((Date.now() + sequence * 7919) % 10_000).padStart(4, "0")}`;
}

export type IsianPasienBaru = { name: string; whatsapp: string; nik?: string };

/** Mengisi dialog "Pasien baru" (harus sudah dibuka lewat tombol "+ Pasien Baru") tanpa menyimpan. */
export async function isiPasienBaru(page: Page, { name, whatsapp, nik = uniqueNik() }: IsianPasienBaru): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Pasien baru" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("NIK (16 angka)").fill(nik);
  await dialog.getByLabel("Nama", { exact: true }).fill(name);
  await isiTanggal(dialog, "Tanggal lahir", "1990-01-01");
  await dialog.getByLabel("No. HP (WhatsApp)").fill(whatsapp);
  await dialog.getByLabel("Nama kontak darurat").fill("Budi Kontak");
  await dialog.getByLabel("Nomor kontak darurat").fill("081200000099");
  await dialog.getByLabel("Alamat").fill("Jl. Uji Coba 1, Manado");
  return dialog;
}

/** Mengisi dialog "Pasien baru" lalu menyimpan. */
export async function buatPasienBaru(page: Page, isian: IsianPasienBaru): Promise<void> {
  const dialog = await isiPasienBaru(page, isian);
  await dialog.getByRole("button", { name: "Buat Pasien" }).click();
}
```

- [ ] **Step 2: Tulis spec baru (gagal dulu bila dialog belum benar)**

Buat `tests/e2e/pasien-baru.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_RESEPSIONIS } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { isiPasienBaru, uniqueNik } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

// Satu pasien dipakai berurutan oleh tiga uji; desktop dan ponsel dijalankan sebagai putaran terpisah.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const suffix = Date.now().toString().slice(-6);
const NIK = uniqueNik();
const NAME = `Pasien Panel ${suffix}`;
const WA = `0813${suffix}77`;

test("resepsionis mendaftarkan pasien lengkap lalu datanya tampil di halaman detail", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/pasien");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();

  const dialog = await isiPasienBaru(page, { name: NAME, whatsapp: WA, nik: NIK });
  await dialog.getByLabel("Email (opsional)").fill("Panel.E2E@Example.com");
  await dialog.getByLabel("Status pernikahan (opsional)").selectOption("MENIKAH");
  await expect(dialog.getByText("NIK belum terdaftar.")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByRole("dialog", { name: "Pasien baru" })).toBeHidden({ timeout: 30_000 });

  await page.goto(`/admin/pasien?q=${encodeURIComponent(NAME)}`);
  await page.getByRole("link", { name: NAME }).first().click();
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Email", { exact: true }).locator("..")).toContainText("panel.e2e@example.com");
  await expect(page.getByText("Kontak darurat", { exact: true }).locator("..")).toContainText("Budi Kontak · 6281200000099");
  await expect(page.getByText("Status pernikahan", { exact: true }).locator("..")).toContainText("Menikah");
  await expect(page.getByText("Alamat", { exact: true }).locator("..")).toContainText("Jl. Uji Coba 1, Manado");
});

test("NIK yang sama kedua kalinya menampilkan pasien tadi dan Simpan tidak bisa ditekan", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/pasien");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();

  const dialog = page.getByRole("dialog", { name: "Pasien baru" });
  await dialog.getByLabel("NIK (16 angka)").fill(NIK);
  const card = dialog.getByRole("alert").filter({ hasText: "NIK sudah terdaftar" });
  await expect(card).toContainText(NAME, { timeout: 30_000 });
  await expect(card).toContainText("01/01/1990");
  await expect(dialog.getByRole("button", { name: "Buat Pasien" })).toBeDisabled();
  await expect(card.getByRole("link", { name: "Buka data pasien" })).toBeVisible();
});

test("'Pakai pasien ini' dari pemilih pasien di Booking baru memilih pasien yang sudah ada", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/booking/baru");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();

  const dialog = page.getByRole("dialog", { name: "Pasien baru" });
  await dialog.getByLabel("NIK (16 angka)").fill(NIK);
  await dialog.getByRole("button", { name: "Pakai pasien ini" }).click({ timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: "Pasien baru" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(NAME).first()).toBeVisible();
});
```

- [ ] **Step 3: Perbarui alur lama yang memakai formulir pasien baru**

Impor di tiap berkas: `import { buatPasienBaru } from "./helpers/pasien-baru";`

`tests/e2e/admin-booking.spec.ts` — ganti isi `createPatientInForm`:

```ts
async function createPatientInForm(page: Page, name: string, whatsapp: string) {
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(page, { name, whatsapp });
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible({ timeout: 30_000 });
}
```

`tests/e2e/link-kuis.spec.ts` — ganti tiga baris isian dan klik (dari `getByLabel("Nama"…).fill(patientName)` sampai klik "Buat Pasien") dengan:

```ts
  await buatPasienBaru(page, { name: patientName, whatsapp: `0812${suffix}55` });
```

`tests/e2e/dasbor.spec.ts` — ganti baris `getByLabel("Nama"…)`, `getByLabel("Nomor WhatsApp")`, dan klik "Buat Pasien" dengan:

```ts
  await buatPasienBaru(page, {
    name: `Pasien Dasbor ${Date.now().toString().slice(-6)}`,
    whatsapp: `0813${Date.now().toString().slice(-8)}`,
  });
```

`tests/e2e/tagihan.spec.ts` — ganti empat baris `saleDialog.getByLabel…`/klik "Buat Pasien" (setelah klik "+ Pasien Baru" di `saleDialog`) dengan:

```ts
  await buatPasienBaru(page, { name: `Pelanggan Tagihan ${t}`, whatsapp: t === "M" ? "6281200007702" : "6281200007701" });
```

`tests/e2e/tampilan-admin.spec.ts` — ganti baris `await expect(dialog.getByLabel("Nomor WhatsApp")).toBeVisible({ timeout: 10_000 });` dengan:

```ts
  await expect(page.getByRole("dialog", { name: "Pasien baru" }).getByLabel("No. HP (WhatsApp)")).toBeVisible({ timeout: 10_000 });
```

- [ ] **Step 4: Jalankan E2E per berkas dan per proyek**

Run (satu per satu; jangan bersamaan dengan uji integrasi):
```bash
npx playwright test tests/e2e/pasien-baru.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/pasien-baru.spec.ts --project=mobile --workers=1
npx playwright test tests/e2e/admin-booking.spec.ts tests/e2e/link-kuis.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/tagihan.spec.ts tests/e2e/dasbor.spec.ts tests/e2e/tampilan-admin.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/admin-booking.spec.ts tests/e2e/link-kuis.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/dasbor.spec.ts tests/e2e/tampilan-admin.spec.ts --project=mobile --workers=1
```
Expected: semua lulus. Bila `pasien-baru` gagal di ponsel karena isian di luar layar, perbaiki helper (mis. `scrollIntoViewIfNeeded`), bukan melonggarkan assertion.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/pasien-baru.ts tests/e2e/pasien-baru.spec.ts tests/e2e/admin-booking.spec.ts tests/e2e/link-kuis.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/dasbor.spec.ts tests/e2e/tampilan-admin.spec.ts
git commit -m "test: e2e for full patient registration and NIK check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (hasil pemeriksaan penulis rencana)

**Cakupan spec:** §3 data → Task 1; §4 aturan → Task 2 (validator) + Task 3 (server); §5.1 `checkPatientNik` → Task 4; §5.2 cek ulang dan pelanggaran unik → Task 3; §6.1 dialog → Task 6; §6.2 detail → Task 5; §7 teknis dan audit → Task 2/3/5/6; §8 privasi → uji kebocoran di Task 3 dan 4; §9 pengujian → unit (Task 2, 5, 6), integrasi (Task 1, 3, 4, 5), E2E (Task 7); §10 rilis (migrasi aditif) → Task 1 (uji `migrations.test.ts` melarang `DROP`).

**Pindai placeholder:** tidak ada "TBD"/"nanti"; satu instruksi bersyarat sengaja (Step 7 Task 6: tambah `checkPatientNik` ke mock uji tetangga bila gagal) karena bergantung pada hasil nyata uji itu.

**Konsistensi tipe:** `PatientRegistrationInput` (Task 2) = argumen `createPatient` (Task 3) = hasil `toInput` (Task 6) = `patientInput` (fixture Task 3); `NikCheck` (Task 4) dipakai `NewPatientForm` (Task 6) dan uji; `findNikOwner` (Task 3) dipakai `checkPatientNik` (Task 4); `PatientDetail.emergencyContact`/`maritalStatusLabel` (Task 5) dipakai tampilan dan uji. Label "No. HP (WhatsApp)" konsisten di Task 2 (pesan galat), 6 (label), 7 (helper).
