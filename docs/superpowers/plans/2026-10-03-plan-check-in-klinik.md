# Check-in Klinik (NIK & Food Recall H-1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resepsionis meng-check-in customer lewat dialog: NIK, data diri yang masih kosong, dan nomor WA, dengan pindah pasien rangkap bila NIK bentrok. Customer Slimming/gizi klinik mengisi food recall H-1 di tablet atau HP, dan dokter melihatnya sebagai tabel di halaman kunjungan, bisa menyalinnya ke S, melengkapinya, dan menguncinya saat final.

**Architecture:**
- **Data:** `Patient` mendapat `nik`, `nikMissingReason`, dan `mergedIntoId`; `Appointment` mendapat `checkedInAt`; tabel baru `FoodRecall` (satu per booking). Semuanya lewat migrasi aditif, dengan CHECK dan trigger kunci seperti rekam medis bagian 1.
- **Check-in:** satu aksi server bertransaksi (`checkInAppointment`) menggantikan `markAttended`.
- **Link food recall:** memakai mekanisme HMAC link kuis C3 dengan kunci terpisah (`/food-recall#kode`).
- **Pembagian kode:** logika murni di `src/lib/nik.ts` dan `src/lib/food-recall.ts`; aksi admin, publik, dan dokter di modul server terpisah.

**Tech Stack:** Next.js 15.5 App Router, React 19, Prisma 7 + PostgreSQL, Zod 4, shadcn/ui (Radix), `qrcode`, Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-check-in-klinik-design.md`

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar.
- **Kata di halaman customer:** panel admin memakai "pasien". Halaman `/food-recall` dan pesan WA memakai "Anda" dan "customer", **tanpa kata "pasien" atau "berobat"**.
- **Zona waktu:** WITA. "Hari kunjungan" dan H-1 dihitung dari **tanggal booking** dalam WITA (`witaDateString`).
- **NIK:**
  - tepat 16 angka, disimpan tanpa spasi atau titik, unik per pasien;
  - **tidak pernah** tampil di situs publik, kuis, pesan WhatsApp, atau link;
  - di jejak audit hanya 4 angka terakhir (`maskNik`).
- **Data diri saat check-in hanya melengkapi kolom yang kosong.** Kolom pasien yang sudah terisi tidak pernah ditimpa, kecuali nomor WhatsApp yang memang dikonfirmasi di dialog.
- **Hak akses (spec 6.2):**

  | Aksi | Kemampuan |
  |---|---|
  | Check-in, NIK, data diri, nomor WA, pindah pasien rangkap, tawarkan food recall, link food recall | `booking:manage` |
  | Isi food recall | `record:read` |
  | Melengkapi food recall dan Salin ke S | `record:write` |

  Isi food recall tidak pernah dikirim ke halaman atau komponen yang dibuka resepsionis.
- **Aksi publik `/food-recall`:** tanpa login, kode link satu-satunya bukti, dibatasi `guardRate`, dan kode diperiksa ulang di setiap panggilan.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (ekspor tipe boleh). Pembantu yang tidak boleh dipanggil browser (`food-recall-code.ts`, `food-recall-store.ts`, `appointment-guard.ts`) **tidak** memakai `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`, dan komponen tidak mengimpor `@/lib/db`.
- **Fungsi dari modul `"use client"` tidak dipanggil komponen server** (dijaga uji arsitektur yang sudah ada).
- **Migrasi:** hanya menambah (tanpa `DROP`), lalu diterapkan berurutan:
  - `npx prisma migrate deploy`;
  - `npm run db:migrate:test`;
  - `npx prisma generate`;
  - `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` harus keluar dengan kode 0.
- **Tanpa dependensi baru.**
- **Format kode:** repo tidak memakai Prettier. Ikuti format kode di sekitarnya.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`). Jangan jalankan bersamaan dengan `npm run test:e2e`. Laptop 8 GB: e2e dijalankan **per berkas atau kelompok**, bukan seluruhnya paralel.
- **Commit:** Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. **Jangan pernah mengubah atau men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **NIK diketik atau ditempel dengan spasi, titik, atau tanda hubung dari foto KTP** (`7171 0102 9203 0001`, `7171.0102.9203.0001`). Diterima sebagai 16 angka yang sama, dan bentrok NIK tetap terdeteksi → uji di Task 1 (`normalizeNik`), Task 4 (pemilik NIK ditemukan walau diketik bertitik), dan Task 9 (e2e mengetik NIK berspasi).
2. **Customer membuka link food recall keesokan harinya** (pesan WA dibuka terlambat). Halaman menampilkan "Link sudah tidak berlaku…", dan Kirim ditolak tanpa menyimpan apa pun → uji di Task 3.
3. **Tablet bersama.** Setelah customer A menekan Selesai, customer B yang memegang tablet tidak melihat isian A (tanpa localStorage, layar terima kasih tanpa isian, Selesai membuang kode dari URL) → uji di Task 6.
4. **Dokter menekan Salin ke S dua kali, atau S sudah hampir 5.000 karakter.**
   - Klik kedua meminta konfirmasi.
   - Teks yang akan melewati batas tidak dipotong diam-diam; muncul pesan dan S tidak berubah.

   → uji di Task 7.
5. **Pasien rangkap punya booking lain di hari lain.** Semua booking dan isiannya ikut pindah ke pasien lama, dan pasien rangkap tidak muncul lagi di pencarian, pemilih pasien, maupun pencocokan isian → uji di Task 4.

---

## Struktur berkas

**Baru:**

| Berkas | Isi |
|---|---|
| `src/lib/nik.ts` | Aturan NIK murni: alasan "Belum ada NIK", `normalizeNik`, `decodeNikBirth`, `nikMismatchWarning`, `maskNik` |
| `src/lib/food-recall.ts` | Logika food recall murni: skema baris, validasi kiriman customer/dokter, tanggal H-1 & labelnya, baris tabel 06–22, teks Salin ke S, status link, pesan WA, tipe yang dipakai bersama komponen |
| `src/server/food-recall-code.ts` | Kode link HMAC food recall (tanpa `"use server"`) |
| `src/server/food-recall-store.ts` | Pemuat baris food recall untuk link + pembentuk `FoodRecallLinkInfo` (tanpa `"use server"`) |
| `src/server/appointment-guard.ts` | `ACTIVE_STATUSES` dan `rejectedChangeError`, dipindah dari `appointment.ts` agar dipakai bersama (tanpa `"use server"`) |
| `src/server/check-in.ts` | `getCheckInForm`, `lookupNikOwner`, `mergeDuplicatePatient`, `checkInAppointment` |
| `src/server/food-recall-admin.ts` | `getFoodRecallLink`, `offerFoodRecall`, `saveFoodRecallByStaff` |
| `src/server/food-recall-public.ts` | `getFoodRecallPage`, `submitFoodRecall` (publik) |
| `src/components/admin/nik-input.tsx` | Kolom NIK / "Belum ada NIK" + alasan (dipakai dialog check-in dan data pasien) |
| `src/components/admin/food-recall-link-panel.tsx` | QR, Buka di tablet, Kirim lewat WA, Salin link |
| `src/components/admin/food-recall-dialog.tsx` | Dialog aksi "Food recall" di daftar booking |
| `src/components/admin/check-in-dialog.tsx` | Dialog check-in |
| `src/components/admin/food-recall-table.tsx` | Tabel 06.00–22.00 (dipakai tab kunjungan, Sebelumnya, data pasien) |
| `src/components/admin/encounter-food-recall-tab.tsx` | Tab "Food recall" halaman kunjungan |
| `src/components/admin/nik-form.tsx` | Ubah NIK di halaman data pasien |
| `src/components/food-recall/food-recall-entry.tsx` | Membaca kode dari `#` dan memuat halaman |
| `src/components/food-recall/food-recall-form.tsx` | Form customer + layar terima kasih |
| `src/app/(public)/food-recall/page.tsx` | Halaman `/food-recall` |
| `prisma/migrations/20261003120000_check_in_klinik/migration.sql` | Migrasi aditif + CHECK + trigger |

**Uji baru:**
- `tests/unit/nik.test.ts`, `tests/unit/food-recall.test.ts`, `tests/unit/food-recall-code.test.ts`;
- `tests/unit/components/check-in-dialog.test.tsx`, `tests/unit/components/food-recall-dialog.test.tsx`, `tests/unit/components/food-recall-form.test.tsx`, `tests/unit/components/encounter-food-recall-tab.test.tsx`, `tests/unit/components/nik-form.test.tsx`;
- `tests/integration/check-in-schema.test.ts`, `tests/integration/check-in.test.ts`, `tests/integration/food-recall.test.ts`, `tests/integration/patient-nik.test.ts`;
- `tests/e2e/check-in.spec.ts`.

**Diubah:**
- `prisma/schema.prisma`;
- server:
  - `src/server/appointment.ts` (`markAttended` dihapus, guard dipindah, daftar booking membawa status food recall);
  - `src/server/patient.ts` (NIK di pencarian dan detail, pasien rangkap disembunyikan, `updatePatientNik`);
  - `src/server/intake.ts` (pencocokan tanpa pasien rangkap);
  - `src/server/encounter-read.ts` (food recall di kunjungan, riwayat, daftar dokter);
- logika dan aksi booking: `src/lib/encounter.ts` (tab konteks), `src/lib/booking-actions.ts`;
- komponen admin:
  - daftar booking: `appointment-table.tsx`, `booking-dialogs.tsx`;
  - halaman kunjungan: `encounter-form.tsx`, `encounter-workspace.tsx`, `encounter-context-panel.tsx`, `previous-visits-tab.tsx`;
  - data pasien dan dasbor dokter: `patient-detail-view.tsx`, `doctor-worklist.tsx`;
- halaman admin: `src/app/(admin)/admin/booking/page.tsx`;
- situs dan rute publik: `src/app/robots.ts`, `src/components/layout/header-shell.tsx`, `src/components/motion/smooth-scroll.tsx`;
- uji yang sudah ada:
  - pembantu: `tests/purge-encounters.ts`, `tests/e2e/prepare-db.mts`, `tests/fixtures/encounter-detail.ts`;
  - integrasi: `tests/integration/appointment.test.ts`, `tests/integration/intake-matching.test.ts`;
  - unit umum: `tests/unit/booking-actions.test.ts`, `tests/unit/encounter-trend.test.ts`, `tests/unit/migrations.test.ts`, `tests/unit/robots.test.ts`, `tests/unit/architecture.test.ts`;
  - unit komponen: `tests/unit/components/appointment-table.test.tsx`, `tests/unit/components/site-header.test.tsx`, `tests/unit/components/motion/smooth-scroll.test.tsx`, `tests/unit/components/encounter-form.test.tsx`, `tests/unit/components/encounter-page-view.test.tsx`, `tests/unit/components/patient-detail-view.test.tsx`, `tests/unit/components/doctor-worklist.test.tsx`;
- spec ini (baris Status, di Task 9).

**Ruang kerja eksekusi** (di-ignore git): `WS=.superpowers/sdd/2026-10-03-plan-check-in-klinik`. Log dan ledger ditaruh di sini.

---

### Task 1: Fondasi data — skema, migrasi, kunci database, aturan NIK

**Files:**
- Create: `src/lib/nik.ts`, `prisma/migrations/20261003120000_check_in_klinik/migration.sql`
- Modify: `prisma/schema.prisma`, `tests/purge-encounters.ts`, `tests/unit/migrations.test.ts`
- Test: `tests/unit/nik.test.ts`, `tests/integration/check-in-schema.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - Prisma: enum `NikMissingReason` (`WARGA_ASING`, `ANAK`, `LUPA_KTP`); enum `FoodRecallStatus` (`DITAWARKAN`, `DIISI`); `Patient.nik String?` unik, `Patient.nikMissingReason`, `Patient.mergedIntoId` + relasi `mergedInto`/`mergedFrom`; `Appointment.checkedInAt DateTime?` + relasi `foodRecall FoodRecall?`; model `FoodRecall { id, appointmentId @unique, recallDate @db.Date, status, entries Json, submittedAt?, completedByStaffId?, completedByName?, completedAt?, createdAt, updatedAt }`.
  - Database: CHECK `patient_nik_format`, `patient_nik_or_reason`, `patient_not_merged_into_self`; trigger `food_recall_locked` (INSERT/UPDATE/DELETE ditolak bila kunjungan booking itu FINAL, pesan diawali `rekam_medis_terkunci`) dan `food_recall_no_truncate`.
  - `src/lib/nik.ts`: `NIK_MISSING_REASONS`, `type NikMissingReasonValue`, `isNikMissingReason(value: unknown): value is NikMissingReasonValue`, `NIK_FORMAT_ERROR`, `normalizeNik(input: string): string | null`, `type NikBirth`, `decodeNikBirth(nik: string): NikBirth | null`, `nikMismatchWarning(nik: string, patient: { birthDate: string | null; gender: "L" | "P" | null }): string | null`, `maskNik(nik: string): string`.
  - `purgeEncounters` ikut mengosongkan `FoodRecall`.

- [ ] **Step 1: Tulis uji aturan NIK (gagal)**

Buat `tests/unit/nik.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  decodeNikBirth,
  isNikMissingReason,
  maskNik,
  NIK_MISSING_REASONS,
  nikMismatchWarning,
  normalizeNik,
} from "@/lib/nik";

// Perempuan lahir 17 Mei 1990: tanggal 17 + 40 = 57.
const NIK_P = "7171015705900001";
// Laki-laki lahir 2 Januari 2008.
const NIK_L = "7171010201080002";

describe("normalizeNik", () => {
  it("membuang spasi, titik, dan tanda hubung yang ikut tertempel dari KTP", () => {
    expect(normalizeNik("7171 0157 0590 0001")).toBe(NIK_P);
    expect(normalizeNik("7171.0157.0590.0001")).toBe(NIK_P);
    expect(normalizeNik(" 7171-0157-0590-0001 ")).toBe(NIK_P);
  });

  it("menolak yang bukan tepat 16 angka", () => {
    expect(normalizeNik("123")).toBeNull();
    expect(normalizeNik("71710157059000011")).toBeNull();
    expect(normalizeNik("7171O15705900001")).toBeNull();
    expect(normalizeNik("")).toBeNull();
  });
});

describe("decodeNikBirth", () => {
  it("membaca tanggal +40 sebagai perempuan", () => {
    expect(decodeNikBirth(NIK_P)).toEqual({ day: 17, month: 5, yearTwoDigits: 90, gender: "P" });
    expect(decodeNikBirth(NIK_L)).toEqual({ day: 2, month: 1, yearTwoDigits: 8, gender: "L" });
  });

  it("null bila tanggal atau bulan tidak masuk akal", () => {
    expect(decodeNikBirth("7171010013900001")).toBeNull(); // tanggal 00, bulan 13
    expect(decodeNikBirth("7171017205900001")).toBeNull(); // tanggal 72-40 = 32
  });
});

describe("nikMismatchWarning", () => {
  it("tanpa peringatan bila cocok atau data pasien masih kosong", () => {
    expect(nikMismatchWarning(NIK_P, { birthDate: "1990-05-17", gender: "P" })).toBeNull();
    expect(nikMismatchWarning(NIK_P, { birthDate: null, gender: null })).toBeNull();
  });

  it("menyebut bagian yang tidak cocok", () => {
    expect(nikMismatchWarning(NIK_P, { birthDate: "1990-05-18", gender: "P" })).toBe(
      "Tanggal lahir di NIK berbeda dengan data pasien — periksa KTP.",
    );
    expect(nikMismatchWarning(NIK_P, { birthDate: "1990-05-17", gender: "L" })).toBe(
      "Jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.",
    );
    expect(nikMismatchWarning(NIK_P, { birthDate: "1991-05-17", gender: "L" })).toBe(
      "Tanggal lahir dan jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.",
    );
  });

  it("memperingatkan bila kode tanggal lahir tidak terbaca", () => {
    expect(nikMismatchWarning("7171010013900001", { birthDate: null, gender: null })).toBe(
      "Bagian tanggal lahir di NIK tidak terbaca — periksa KTP.",
    );
  });
});

describe("alasan belum ada NIK dan penyamaran", () => {
  it("mengenal tiga alasan saja", () => {
    expect(Object.keys(NIK_MISSING_REASONS)).toEqual(["WARGA_ASING", "ANAK", "LUPA_KTP"]);
    expect(isNikMissingReason("ANAK")).toBe(true);
    expect(isNikMissingReason("constructor")).toBe(false);
    expect(isNikMissingReason(null)).toBe(false);
  });

  it("menyamarkan NIK kecuali 4 angka terakhir", () => {
    expect(maskNik(NIK_P)).toBe("••••••••••••0001");
  });
});
```

Run: `npx vitest run tests/unit/nik.test.ts`
Expected: FAIL, karena modul `@/lib/nik` tidak ditemukan.

- [ ] **Step 2: Tulis aturan NIK**

Buat `src/lib/nik.ts`:

```ts
/** Alasan "Belum ada NIK" saat check-in (spec rekam medis bagian 2, CI2). */
export const NIK_MISSING_REASONS = {
  WARGA_ASING: "Warga negara asing",
  ANAK: "Anak-anak",
  LUPA_KTP: "Lupa membawa KTP",
} as const;

export type NikMissingReasonValue = keyof typeof NIK_MISSING_REASONS;

export function isNikMissingReason(value: unknown): value is NikMissingReasonValue {
  return typeof value === "string" && Object.hasOwn(NIK_MISSING_REASONS, value);
}

export const NIK_FORMAT_ERROR = "NIK harus 16 angka.";

/** Membuang spasi, titik, dan tanda hubung yang ikut tertempel; null bila hasilnya bukan tepat 16 angka. */
export function normalizeNik(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  return /^\d{16}$/.test(cleaned) ? cleaned : null;
}

export type NikBirth = { day: number; month: number; yearTwoDigits: number; gender: "L" | "P" };

/**
 * Angka ke-7 sampai ke-12 NIK: tanggal lahir (ditambah 40 untuk perempuan),
 * bulan, dan dua digit tahun. Null bila tanggal atau bulannya tidak masuk akal.
 */
export function decodeNikBirth(nik: string): NikBirth | null {
  if (!/^\d{16}$/.test(nik)) return null;
  const rawDay = Number(nik.slice(6, 8));
  const month = Number(nik.slice(8, 10));
  const yearTwoDigits = Number(nik.slice(10, 12));
  const gender = rawDay > 40 ? "P" : "L";
  const day = rawDay > 40 ? rawDay - 40 : rawDay;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month, yearTwoDigits, gender };
}

/**
 * Peringatan (tidak menghalangi) bila kode lahir di NIK tidak cocok dengan data
 * pasien. `birthDate` berbentuk "YYYY-MM-DD"; kolom yang kosong tidak dibandingkan.
 */
export function nikMismatchWarning(
  nik: string,
  patient: { birthDate: string | null; gender: "L" | "P" | null },
): string | null {
  const birth = decodeNikBirth(nik);
  if (!birth) return "Bagian tanggal lahir di NIK tidak terbaca — periksa KTP.";

  let dateDiffers = false;
  if (patient.birthDate) {
    const [year, month, day] = patient.birthDate.split("-").map(Number);
    dateDiffers = day !== birth.day || month !== birth.month || year % 100 !== birth.yearTwoDigits;
  }
  const genderDiffers = patient.gender !== null && patient.gender !== birth.gender;

  if (dateDiffers && genderDiffers) return "Tanggal lahir dan jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.";
  if (dateDiffers) return "Tanggal lahir di NIK berbeda dengan data pasien — periksa KTP.";
  if (genderDiffers) return "Jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.";
  return null;
}

/** NIK untuk jejak audit: hanya 4 angka terakhir yang terlihat. */
export function maskNik(nik: string): string {
  return `${"•".repeat(Math.max(0, nik.length - 4))}${nik.slice(-4)}`;
}
```

Run: `npx vitest run tests/unit/nik.test.ts`
Expected: PASS (9/9).

- [ ] **Step 3: Tulis uji kunci database (gagal)**

Buat `tests/integration/check-in-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isUniqueViolation } from "@/server/db-errors";
import { purgeEncounters } from "../purge-encounters";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

const SLUG = "skema-check-in-uji";
const WAS = ["6281200008800", "6281200008801"];

describe("skema check-in: NIK, pasien rangkap, dan kunci food recall", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let otherId: string;
  let slot = 0;

  async function attended() {
    slot += 1;
    const minutes = 6 * 60 + slot * 30;
    const startAt = at(date, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    return prisma.appointment.create({
      data: {
        code: `CIS-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: "HADIR",
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
  }

  async function finalEncounter(appointmentId: string) {
    const created = await prisma.encounter.create({
      data: { appointmentId, createdById: world.doctorId, createdByName: "dr. Uji", assessment: "Obesitas" },
    });
    await prisma.encounter.update({
      where: { id: created.id },
      data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, WAS);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-8800", name: "Pasien Skema CI", whatsapp: WAS[0] } })).id;
    otherId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-8801", name: "Pasien Lain CI", whatsapp: WAS[1] } })).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, WAS);
    await prisma.$disconnect();
  });

  it("NIK di basis data hanya tepat 16 angka", async () => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Patient" SET "nik" = '123' WHERE "id" = $1`, patientId),
    ).rejects.toThrow(/patient_nik_format/);
    await prisma.patient.update({ where: { id: patientId }, data: { nik: "7171015705900001" } });
    await prisma.patient.update({ where: { id: patientId }, data: { nik: null } });
  });

  it("NIK dan alasan belum ada NIK tidak terisi bersamaan", async () => {
    await expect(
      prisma.patient.update({ where: { id: patientId }, data: { nik: "7171015705900001", nikMissingReason: "LUPA_KTP" } }),
    ).rejects.toThrow(/patient_nik_or_reason/);
  });

  it("satu NIK hanya untuk satu pasien", async () => {
    await prisma.patient.update({ where: { id: patientId }, data: { nik: "7171015705900009" } });
    const error = await prisma.patient
      .update({ where: { id: otherId }, data: { nik: "7171015705900009" } })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(error)).toBe(true);
    await prisma.patient.update({ where: { id: patientId }, data: { nik: null } });
  });

  it("pasien tidak bisa ditandai rangkap dari dirinya sendiri", async () => {
    await expect(
      prisma.patient.update({ where: { id: patientId }, data: { mergedIntoId: patientId } }),
    ).rejects.toThrow(/patient_not_merged_into_self/);
  });

  it("food recall bisa diubah selama catatan dokter masih draf", async () => {
    const appointment = await attended();
    const recall = await prisma.foodRecall.create({ data: { appointmentId: appointment.id, recallDate: new Date(`${date}T00:00:00Z`) } });
    await prisma.encounter.create({ data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji" } });
    const updated = await prisma.foodRecall.update({ where: { id: recall.id }, data: { status: "DIISI" } });
    expect(updated.status).toBe("DIISI");
  });

  it("food recall terkunci setelah catatan dokter final", async () => {
    const appointment = await attended();
    const recall = await prisma.foodRecall.create({ data: { appointmentId: appointment.id, recallDate: new Date(`${date}T00:00:00Z`) } });
    await finalEncounter(appointment.id);

    await expect(prisma.foodRecall.update({ where: { id: recall.id }, data: { status: "DIISI" } })).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "FoodRecall" WHERE "id" = $1`, recall.id)).rejects.toThrow(/rekam_medis_terkunci/);

    const late = await attended();
    await finalEncounter(late.id);
    await expect(
      prisma.foodRecall.create({ data: { appointmentId: late.id, recallDate: new Date(`${date}T00:00:00Z`) } }),
    ).rejects.toThrow(/rekam_medis_terkunci/);
  });

  it("purgeEncounters ikut mengosongkan food recall uji", async () => {
    await purgeEncounters(prisma);
    expect(await prisma.foodRecall.count()).toBe(0);
  });
});
```

Run: `npm run test:integration -- tests/integration/check-in-schema.test.ts`
Expected: FAIL, karena `prisma.foodRecall` belum ada dan kolom `nik` tidak dikenal (galat TypeScript/runtime dari Prisma).

- [ ] **Step 4: Ubah skema Prisma**

Di `prisma/schema.prisma`:

1. Tambahkan di blok `model Patient`, tepat setelah `lastVisitAt DateTime?`:

```prisma
  /// NIK 16 angka, ditanyakan resepsionis saat check-in. Tidak pernah tampil di situs,
  /// pesan WA, atau link (spec rekam medis bagian 2). Bentuk dan keunikannya dijaga basis data.
  nik                 String?              @unique
  /// Alasan "Belum ada NIK"; tidak pernah terisi bersamaan dengan nik (CHECK patient_nik_or_reason).
  nikMissingReason    NikMissingReason?
  /// Pasien rangkap: booking dan isiannya sudah dipindah ke pasien ini (spec bagian 3.3).
  mergedIntoId        String?
  mergedInto          Patient?             @relation("PatientMerge", fields: [mergedIntoId], references: [id])
  mergedFrom          Patient[]            @relation("PatientMerge")
```

   dan tambahkan `@@index([mergedIntoId])` di samping `@@index([name])`.

2. Tambahkan di blok `model Appointment`, tepat setelah `encounter  Encounter?`:

```prisma
  foodRecall FoodRecall?
  /// Jam check-in di meja depan (spec rekam medis bagian 2).
  checkedInAt DateTime?
```

3. Tambahkan setelah `enum IntakePurpose { … }`:

```prisma
enum NikMissingReason {
  WARGA_ASING
  ANAK
  LUPA_KTP
}

enum FoodRecallStatus {
  DITAWARKAN
  DIISI
}

/// Food recall H-1: catatan makan, minum, dan aktivitas customer sehari sebelum
/// booking, diisi lewat link /food-recall atau dilengkapi dokter. Satu per booking,
/// terkunci saat catatan dokter kunjungan itu final (trigger food_recall_locked).
model FoodRecall {
  id            String           @id @default(cuid())
  appointmentId String           @unique
  appointment   Appointment      @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  /// Tanggal booking (WITA) dikurangi satu hari.
  recallDate    DateTime         @db.Date
  status        FoodRecallStatus @default(DITAWARKAN)
  /// Baris { hour, kind, text, by }; bentuknya dikunci src/lib/food-recall.ts.
  entries       Json             @default("[]")
  /// Kiriman customer terakhir.
  submittedAt   DateTime?
  /// Suntingan dokter terakhir. Id dan nama disalin seperti AuditLog, tanpa relasi.
  completedByStaffId String?
  completedByName    String?
  completedAt        DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 5: Buat migrasi**

Pastikan basis data pengembangan sudah di migrasi terakhir, lalu hasilkan SQL dari skema:

```bash
npx prisma migrate deploy
mkdir -p prisma/migrations/20261003120000_check_in_klinik
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  > prisma/migrations/20261003120000_check_in_klinik/migration.sql
cat prisma/migrations/20261003120000_check_in_klinik/migration.sql
```

Expected: SQL yang setara dengan berikut (urutan kolom boleh berbeda; **hasil generate yang dipakai**):

```sql
-- CreateEnum
CREATE TYPE "NikMissingReason" AS ENUM ('WARGA_ASING', 'ANAK', 'LUPA_KTP');

-- CreateEnum
CREATE TYPE "FoodRecallStatus" AS ENUM ('DITAWARKAN', 'DIISI');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "checkedInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "nik" TEXT,
ADD COLUMN     "nikMissingReason" "NikMissingReason";

-- CreateTable
CREATE TABLE "FoodRecall" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "recallDate" DATE NOT NULL,
    "status" "FoodRecallStatus" NOT NULL DEFAULT 'DITAWARKAN',
    "entries" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3),
    "completedByStaffId" TEXT,
    "completedByName" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodRecall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodRecall_appointmentId_key" ON "FoodRecall"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nik_key" ON "Patient"("nik");

-- CreateIndex
CREATE INDEX "Patient_mergedIntoId_idx" ON "Patient"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodRecall" ADD CONSTRAINT "FoodRecall_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Tambahkan komentar ini di **awal** berkas `migration.sql`:

```sql
-- Rekam medis bagian 2: check-in klinik (NIK, pasien rangkap, food recall H-1).
-- Spec: docs/superpowers/specs/2026-10-03-check-in-klinik-design.md bagian 6.
--
-- Hanya menambah: deploy.sh menjalankan migrasi sebelum build, dan rilis lama
-- tetap melayani selama build. Semua kolom baru boleh kosong.

```

Lalu tambahkan blok ini di **akhir** berkas:

```sql

-- NIK: tepat 16 angka, tidak bersamaan dengan alasan "Belum ada NIK".
ALTER TABLE "Patient" ADD CONSTRAINT "patient_nik_format" CHECK ("nik" IS NULL OR "nik" ~ '^[0-9]{16}$');
ALTER TABLE "Patient" ADD CONSTRAINT "patient_nik_or_reason" CHECK ("nik" IS NULL OR "nikMissingReason" IS NULL);
ALTER TABLE "Patient" ADD CONSTRAINT "patient_not_merged_into_self" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");

-- Food recall ikut terkunci begitu catatan dokter kunjungannya final (spec 5.4),
-- seperti encounter_treatment_locked: tidak bisa ditambah, diubah, atau dihapus.
CREATE FUNCTION food_recall_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF EXISTS (SELECT 1 FROM "Encounter" WHERE "appointmentId" = OLD."appointmentId" AND "status" = 'FINAL') THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: food recall booking % sudah final', OLD."appointmentId";
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF EXISTS (SELECT 1 FROM "Encounter" WHERE "appointmentId" = NEW."appointmentId" AND "status" = 'FINAL') THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: food recall booking % sudah final', NEW."appointmentId";
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER food_recall_locked
BEFORE INSERT OR UPDATE OR DELETE ON "FoodRecall"
FOR EACH ROW EXECUTE FUNCTION food_recall_locked();

CREATE TRIGGER food_recall_no_truncate BEFORE TRUNCATE ON "FoodRecall"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();
```

Terapkan:

```bash
npx prisma migrate deploy
npm run db:migrate:test
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: ketiga perintah pertama berhasil, dan perintah terakhir keluar dengan kode 0.

- [ ] **Step 6: Ikutkan food recall di purgeEncounters**

Di `tests/purge-encounters.ts`, ganti baris `const TABLES = …` dengan:

```ts
// FoodRecall lebih dulu: trigger kuncinya membaca status kunjungan.
const TABLES = ['"FoodRecall"', '"EncounterAddendum"', '"EncounterTreatment"', '"Encounter"'] as const;
```

Run: `npm run test:integration -- tests/integration/check-in-schema.test.ts tests/integration/encounter-schema.test.ts`
Expected: PASS semua.

- [ ] **Step 7: Kunci isi migrasi di uji unit**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi check-in klinik (rekam medis bagian 2)", () => {
  const sql = readFileSync("prisma/migrations/20261003120000_check_in_klinik/migration.sql", "utf8");

  it("hanya menambah, tanpa menghapus apa pun yang dikenal rilis sebelumnya", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga NIK dan pasien rangkap di basis data, serta mengunci food recall saat final", () => {
    expect(sql).toMatch(/patient_nik_format/);
    expect(sql).toMatch(/patient_nik_or_reason/);
    expect(sql).toMatch(/patient_not_merged_into_self/);
    expect(sql).toMatch(/CREATE TRIGGER food_recall_locked/);
    expect(sql).toMatch(/CREATE TRIGGER food_recall_no_truncate/);
  });
});
```

Run: `npx vitest run tests/unit/migrations.test.ts`
Expected: PASS.

- [ ] **Step 8: Uji unit, tipe, commit**

Run: `npx vitest run > "$WS/t1.log" 2>&1; grep -E "Test Files|Tests " "$WS/t1.log"; npx tsc --noEmit -p . > "$WS/t1-tsc.log" 2>&1; echo "tsc exit $?"; tail -5 "$WS/t1-tsc.log"`
Expected: semua PASS, `tsc` keluar 0.

```bash
git add prisma/schema.prisma prisma/migrations/20261003120000_check_in_klinik src/lib/nik.ts \
  tests/purge-encounters.ts tests/unit/nik.test.ts tests/unit/migrations.test.ts tests/integration/check-in-schema.test.ts
git commit -m "feat: add NIK, duplicate-patient links, check-in time, and a locked food recall table"
```

---

### Task 2: Logika food recall dan kode link

**Files:**
- Create: `src/lib/food-recall.ts`, `src/server/food-recall-code.ts`
- Test: `tests/unit/food-recall.test.ts`, `tests/unit/food-recall-code.test.ts`

**Interfaces:**
- Consumes (sudah ada):
  - `activityEntrySchema`, `type ActivityEntry` dari `@/lib/kuis/v1/answers`;
  - `ACTIVITY_FIRST_HOUR`, `ACTIVITY_LAST_HOUR`, `ACTIVITY_KINDS` dari `@/lib/kuis/v1/options`;
  - `addDaysToDateString`, `minutesToTimeLabel`, `witaDateString` dari `@/lib/time`;
  - `firstName` dari `@/lib/quiz-link`, `CLINIC_NAME` dari `@/lib/clinic`.
- Produces (`src/lib/food-recall.ts`):
  - `FOOD_RECALL_MAX_ENTRIES = 40`, `type FoodRecallAuthor = "CUSTOMER" | "DOKTER"`, `foodRecallEntrySchema`, `type FoodRecallEntry = ActivityEntry & { by: FoodRecallAuthor }`;
  - `type EntriesValidation = { ok: true; entries: FoodRecallEntry[] } | { ok: false; message: string }`;
  - `validateCustomerEntries(raw: unknown): EntriesValidation`, `validateStaffEntries(raw: unknown): EntriesValidation`, `parseStoredEntries(raw: unknown): FoodRecallEntry[]`;
  - `recallDateFor(bookingStart: Date): string` ("YYYY-MM-DD"), `recallDateLabel(recallDate: string): string` ("Jumat, 2 Oktober"), `recallDateShortLabel(recallDate: string): string` ("Jumat, 2 Okt");
  - `type FoodRecallRow = { hour: number; label: string; entries: { kindLabel: string; text: string; byDoctor: boolean }[] }`, `foodRecallRows(entries: readonly FoodRecallEntry[]): FoodRecallRow[]`;
  - `foodRecallHeader(recallDate: string): string`, `foodRecallSubjectiveText(recallDate: string, entries: readonly FoodRecallEntry[]): string`, `appendToSubjective(current: string, block: string): string`;
  - `shouldOfferFoodRecall(input: { intakePurpose: string | null; hasActivePackage: boolean }): boolean`;
  - `type FoodRecallLinkState = "OPEN" | "CLOSED" | "RECEIVED"`, `foodRecallLinkState(input: { appointmentStatus: string; startAt: Date; encounterStatus: "DRAF" | "FINAL" | null; completedAt: Date | null }, now: Date): FoodRecallLinkState`;
  - `FOOD_RECALL_CLOSED`, `FOOD_RECALL_RECEIVED`, `foodRecallMessageText(input: { patientName: string; link: string }): string`;
  - `type FoodRecallLinkInfo` (lihat kode), `type FoodRecallPage` (lihat kode), `type FoodRecallView` (lihat kode).
- Produces (`src/server/food-recall-code.ts`): `foodRecallKey(secret?)`, `foodRecallCode(foodRecallId: string, key?)`, `parseFoodRecallCode(code: unknown): { foodRecallId: string; signature: string } | null`, `isValidFoodRecallCode(code: string, key?): boolean`, `foodRecallUrl(siteUrl: string, foodRecallId: string, key?): string`.

- [ ] **Step 1: Tulis uji logika food recall (gagal)**

Buat `tests/unit/food-recall.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  appendToSubjective,
  foodRecallHeader,
  foodRecallLinkState,
  foodRecallMessageText,
  foodRecallRows,
  foodRecallSubjectiveText,
  parseStoredEntries,
  recallDateFor,
  recallDateLabel,
  recallDateShortLabel,
  shouldOfferFoodRecall,
  validateCustomerEntries,
  validateStaffEntries,
  type FoodRecallEntry,
} from "@/lib/food-recall";
import { combineWitaDateAndMinutes } from "@/lib/time";

const ENTRIES: FoodRecallEntry[] = [
  { hour: 12, kind: "KAPSUL_OBAT", text: "Kapsul M", by: "CUSTOMER" },
  { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning 1 piring, teh manis", by: "CUSTOMER" },
  { hour: 7, kind: "OLAHRAGA", text: "Jalan pagi 20 menit", by: "DOKTER" },
];

describe("tanggal H-1", () => {
  it("sehari sebelum tanggal booking dalam WITA, termasuk awal bulan dan tahun", () => {
    expect(recallDateFor(combineWitaDateAndMinutes("2026-10-03", 11 * 60))).toBe("2026-10-02");
    expect(recallDateFor(combineWitaDateAndMinutes("2026-10-01", 6 * 60))).toBe("2026-09-30");
    expect(recallDateFor(combineWitaDateAndMinutes("2027-01-01", 0))).toBe("2026-12-31");
  });

  it("label panjang dan pendek berbahasa Indonesia", () => {
    expect(recallDateLabel("2026-10-02")).toBe("Jumat, 2 Oktober");
    expect(recallDateShortLabel("2026-10-02")).toBe("Jumat, 2 Okt");
  });
});

describe("validasi baris", () => {
  it("kiriman customer: minimal 1, paling banyak 40, semua ditandai CUSTOMER", () => {
    expect(validateCustomerEntries([])).toEqual({ ok: false, message: "Tambahkan minimal satu catatan." });
    const many = Array.from({ length: 41 }, () => ({ hour: 8, kind: "MAKAN_MINUM", text: "Roti" }));
    expect(validateCustomerEntries(many)).toEqual({ ok: false, message: "Paling banyak 40 catatan." });
    expect(validateCustomerEntries([{ hour: 8, kind: "MAKAN_MINUM", text: "Roti", by: "DOKTER" }]).ok).toBe(false);
    expect(validateCustomerEntries([{ hour: 8, kind: "MAKAN_MINUM", text: " Roti " }])).toEqual({
      ok: true,
      entries: [{ hour: 8, kind: "MAKAN_MINUM", text: "Roti", by: "CUSTOMER" }],
    });
  });

  it("menolak jam di luar 06–22, jenis asing, dan isi kosong", () => {
    expect(validateCustomerEntries([{ hour: 5, kind: "MAKAN_MINUM", text: "Roti" }]).ok).toBe(false);
    expect(validateCustomerEntries([{ hour: 8, kind: "TIDUR", text: "Tidur" }]).ok).toBe(false);
    expect(validateCustomerEntries([{ hour: 8, kind: "MAKAN_MINUM", text: "   " }]).ok).toBe(false);
  });

  it("simpanan dokter: baris customer tetap CUSTOMER, baris baru menjadi DOKTER", () => {
    const result = validateStaffEntries([
      { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
      { hour: 9, kind: "OLAHRAGA", text: "Senam" },
    ]);
    expect(result).toEqual({
      ok: true,
      entries: [
        { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
        { hour: 9, kind: "OLAHRAGA", text: "Senam", by: "DOKTER" },
      ],
    });
  });

  it("baris tersimpan yang rusak dibaca sebagai kosong", () => {
    expect(parseStoredEntries("bukan larik")).toEqual([]);
    expect(parseStoredEntries([{ hour: "tujuh" }])).toEqual([]);
    expect(parseStoredEntries(ENTRIES)).toEqual(ENTRIES);
  });
});

describe("tabel dan teks untuk dokter", () => {
  it("tabel 06.00–22.00 dengan tanda baris dokter", () => {
    const rows = foodRecallRows(ENTRIES);
    expect(rows).toHaveLength(17);
    expect(rows[0].label).toBe("06.00");
    expect(rows[1]).toEqual({
      hour: 7,
      label: "07.00",
      entries: [
        { kindLabel: "Makan/minum", text: "Nasi kuning 1 piring, teh manis", byDoctor: false },
        { kindLabel: "Olahraga", text: "Jalan pagi 20 menit", byDoctor: true },
      ],
    });
  });

  it("teks Salin ke S: judul, lalu satu catatan per baris terurut per jam", () => {
    expect(foodRecallHeader("2026-10-02")).toBe("Food recall H-1 (Jumat, 2 Okt)");
    expect(foodRecallSubjectiveText("2026-10-02", ENTRIES)).toBe(
      [
        "Food recall H-1 (Jumat, 2 Okt):",
        "07.00 Makan/minum — Nasi kuning 1 piring, teh manis",
        "07.00 Olahraga — Jalan pagi 20 menit",
        "12.00 Kapsul/obat — Kapsul M",
      ].join("\n"),
    );
  });

  it("menambahkan di akhir S dengan satu baris kosong pemisah", () => {
    expect(appendToSubjective("", "Food recall")).toBe("Food recall");
    expect(appendToSubjective("  ", "Food recall")).toBe("Food recall");
    expect(appendToSubjective("Keluhan BB naik\n", "Food recall")).toBe("Keluhan BB naik\n\nFood recall");
  });
});

describe("penawaran dan status link", () => {
  it("otomatis untuk Slimming, gizi klinik, atau paket aktif", () => {
    expect(shouldOfferFoodRecall({ intakePurpose: "SLIMMING", hasActivePackage: false })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: "GIZI_KLINIK", hasActivePackage: false })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: null, hasActivePackage: true })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: "AESTHETIC", hasActivePackage: false })).toBe(false);
    expect(shouldOfferFoodRecall({ intakePurpose: null, hasActivePackage: false })).toBe(false);
  });

  const startAt = combineWitaDateAndMinutes("2026-10-03", 11 * 60);
  const sameDay = combineWitaDateAndMinutes("2026-10-03", 16 * 60);
  const nextDay = combineWitaDateAndMinutes("2026-10-04", 9 * 60);
  const open = { appointmentStatus: "HADIR", startAt, encounterStatus: null, completedAt: null } as const;

  it("berlaku pada tanggal booking selama booking Hadir", () => {
    expect(foodRecallLinkState(open, sameDay)).toBe("OPEN");
    expect(foodRecallLinkState({ ...open, encounterStatus: "DRAF" }, sameDay)).toBe("OPEN");
  });

  it("tidak berlaku di hari lain atau bila booking bukan Hadir", () => {
    expect(foodRecallLinkState(open, nextDay)).toBe("CLOSED");
    expect(foodRecallLinkState({ ...open, appointmentStatus: "DIBATALKAN" }, sameDay)).toBe("CLOSED");
    expect(foodRecallLinkState({ ...open, appointmentStatus: "TIDAK_HADIR" }, sameDay)).toBe("CLOSED");
  });

  it("sudah diterima dokter bila catatan final atau dokter sudah melengkapi", () => {
    expect(foodRecallLinkState({ ...open, appointmentStatus: "SELESAI", encounterStatus: "FINAL" }, sameDay)).toBe("RECEIVED");
    expect(foodRecallLinkState({ ...open, completedAt: sameDay }, sameDay)).toBe("RECEIVED");
  });

  it("pesan WA memakai nama depan dan tanpa kata pasien", () => {
    const text = foodRecallMessageText({ patientName: "Siti Rahayu", link: "https://sundyclinic.com/food-recall#x" });
    expect(text).toContain("Halo Siti, ini SunDY Clinic.");
    expect(text).toContain("https://sundyclinic.com/food-recall#x");
    expect(text).not.toMatch(/pasien|berobat/i);
  });
});
```

Run: `npx vitest run tests/unit/food-recall.test.ts`
Expected: FAIL, karena modul `@/lib/food-recall` tidak ditemukan.

- [ ] **Step 2: Tulis logika food recall**

Buat `src/lib/food-recall.ts`:

```ts
import { z } from "zod";
import { CLINIC_NAME } from "@/lib/clinic";
import { activityEntrySchema, type ActivityEntry } from "@/lib/kuis/v1/answers";
import { ACTIVITY_FIRST_HOUR, ACTIVITY_KINDS, ACTIVITY_LAST_HOUR } from "@/lib/kuis/v1/options";
import { firstName } from "@/lib/quiz-link";
import { addDaysToDateString, minutesToTimeLabel, witaDateString } from "@/lib/time";

/**
 * Food recall H-1 (spec rekam medis bagian 2): baris jam + jenis + isi seperti
 * "Aktivitas kemarin" kuis v1 (CI5), ditambah penanda siapa yang mengisi.
 */
export const FOOD_RECALL_MAX_ENTRIES = 40;

export const FOOD_RECALL_AUTHORS = ["CUSTOMER", "DOKTER"] as const;
export type FoodRecallAuthor = (typeof FOOD_RECALL_AUTHORS)[number];

export const foodRecallEntrySchema = activityEntrySchema.extend({ by: z.enum(FOOD_RECALL_AUTHORS) });
export type FoodRecallEntry = ActivityEntry & { by: FoodRecallAuthor };

export type EntriesValidation = { ok: true; entries: FoodRecallEntry[] } | { ok: false; message: string };

const FOOD_RECALL_EMPTY = "Tambahkan minimal satu catatan.";
const FOOD_RECALL_TOO_MANY = "Paling banyak 40 catatan.";
const FOOD_RECALL_INVALID = "Catatan tidak sah. Muat ulang halaman lalu coba lagi.";

const trimmedEntry = activityEntrySchema.transform((entry) => ({ ...entry, text: entry.text.trim() }));

function checkCount(raw: unknown): string | null {
  if (!Array.isArray(raw)) return FOOD_RECALL_INVALID;
  if (raw.length === 0) return FOOD_RECALL_EMPTY;
  if (raw.length > FOOD_RECALL_MAX_ENTRIES) return FOOD_RECALL_TOO_MANY;
  return null;
}

/** Kiriman customer lewat link: semua baris ditandai CUSTOMER. */
export function validateCustomerEntries(raw: unknown): EntriesValidation {
  const countProblem = checkCount(raw);
  if (countProblem) return { ok: false, message: countProblem };
  const parsed = z.array(trimmedEntry).safeParse(raw);
  if (!parsed.success || parsed.data.some((entry) => !entry.text)) return { ok: false, message: FOOD_RECALL_INVALID };
  return { ok: true, entries: parsed.data.map((entry) => ({ ...entry, by: "CUSTOMER" })) };
}

/**
 * Simpanan dokter (spec 5.3): baris yang dibawa dari isian customer tetap
 * CUSTOMER; baris tanpa penanda adalah tambahan dokter.
 */
export function validateStaffEntries(raw: unknown): EntriesValidation {
  const countProblem = checkCount(raw);
  if (countProblem) return { ok: false, message: countProblem };
  const parsed = z
    .array(activityEntrySchema.extend({ by: z.enum(FOOD_RECALL_AUTHORS).optional() }))
    .safeParse(raw);
  if (!parsed.success) return { ok: false, message: FOOD_RECALL_INVALID };
  const entries = parsed.data.map((entry) => ({ ...entry, text: entry.text.trim(), by: entry.by ?? ("DOKTER" as const) }));
  if (entries.some((entry) => !entry.text)) return { ok: false, message: FOOD_RECALL_INVALID };
  return { ok: true, entries };
}

/** Baris tersimpan; bentuk yang rusak dibaca kosong agar halaman dokter tidak gagal. */
export function parseStoredEntries(raw: unknown): FoodRecallEntry[] {
  const parsed = z.array(foodRecallEntrySchema).max(FOOD_RECALL_MAX_ENTRIES).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Tanggal "kemarin": tanggal booking (WITA) dikurangi satu hari. */
export function recallDateFor(bookingStart: Date): string {
  return addDaysToDateString(witaDateString(bookingStart), -1);
}

const longLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const shortLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
const asDate = (recallDate: string) => new Date(`${recallDate}T00:00:00Z`);

/** "Jumat, 2 Oktober" — judul form customer dan tab dokter. */
export function recallDateLabel(recallDate: string): string {
  return longLabel.format(asDate(recallDate));
}

/** "Jumat, 2 Okt" — judul teks Salin ke S. */
export function recallDateShortLabel(recallDate: string): string {
  return shortLabel.format(asDate(recallDate));
}

export type FoodRecallRow = {
  hour: number;
  label: string;
  entries: { kindLabel: string; text: string; byDoctor: boolean }[];
};

/** Tabel 06.00–22.00 yang dilihat dokter; jam tanpa catatan tetap ada (komponen boleh menyembunyikannya). */
export function foodRecallRows(entries: readonly FoodRecallEntry[]): FoodRecallRow[] {
  const rows: FoodRecallRow[] = [];
  for (let hour = ACTIVITY_FIRST_HOUR; hour <= ACTIVITY_LAST_HOUR; hour++) {
    rows.push({
      hour,
      label: minutesToTimeLabel(hour * 60),
      entries: entries
        .filter((entry) => entry.hour === hour)
        .map((entry) => ({ kindLabel: ACTIVITY_KINDS[entry.kind], text: entry.text, byDoctor: entry.by === "DOKTER" })),
    });
  }
  return rows;
}

export function foodRecallHeader(recallDate: string): string {
  return `Food recall H-1 (${recallDateShortLabel(recallDate)})`;
}

/** Teks Salin ke S (spec 5.2): judul, lalu satu catatan per baris, terurut per jam. */
export function foodRecallSubjectiveText(recallDate: string, entries: readonly FoodRecallEntry[]): string {
  const lines = [...entries]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.hour - b.entry.hour || a.index - b.index)
    .map(({ entry }) => `${minutesToTimeLabel(entry.hour * 60)} ${ACTIVITY_KINDS[entry.kind]} — ${entry.text}`);
  return [`${foodRecallHeader(recallDate)}:`, ...lines].join("\n");
}

/** Ditambahkan di akhir S, dipisah satu baris kosong. */
export function appendToSubjective(current: string, block: string): string {
  return current.trim() ? `${current.trimEnd()}\n\n${block}` : block;
}

/** Centang otomatis "Tawarkan food recall" (spec 4.1). */
export function shouldOfferFoodRecall(input: { intakePurpose: string | null; hasActivePackage: boolean }): boolean {
  return input.intakePurpose === "SLIMMING" || input.intakePurpose === "GIZI_KLINIK" || input.hasActivePackage;
}

export type FoodRecallLinkState = "OPEN" | "CLOSED" | "RECEIVED";

/**
 * Masa berlaku link (spec 4.2). "RECEIVED" bila dokter sudah melengkapi atau
 * catatannya final; "CLOSED" bila booking bukan Hadir atau bukan tanggal booking.
 */
export function foodRecallLinkState(
  input: { appointmentStatus: string; startAt: Date; encounterStatus: "DRAF" | "FINAL" | null; completedAt: Date | null },
  now: Date,
): FoodRecallLinkState {
  if (input.completedAt || input.encounterStatus === "FINAL") return "RECEIVED";
  if (input.appointmentStatus !== "HADIR") return "CLOSED";
  return witaDateString(input.startAt) === witaDateString(now) ? "OPEN" : "CLOSED";
}

export const FOOD_RECALL_CLOSED = "Link sudah tidak berlaku. Silakan tanyakan ke resepsionis.";
export const FOOD_RECALL_RECEIVED = "Food recall Anda sudah diterima dokter.";

/** Pesan WA berisi link (spec 4.2). Hanya nama depan; tanpa NIK atau data lain. */
export function foodRecallMessageText(input: { patientName: string; link: string }): string {
  return [
    `Halo ${firstName(input.patientName)}, ini ${CLINIC_NAME}. Mohon catat apa saja yang Anda makan, minum, dan lakukan kemarin sebelum konsultasi (±3 menit): ${input.link}`,
    "Catatan ini hanya dibaca dokter kami.",
  ].join("\n");
}

/** Link food recall sebuah booking untuk panel admin. */
export type FoodRecallLinkInfo =
  | { state: "NOT_OFFERED" }
  | { state: "OPEN"; filled: boolean; url: string; message: { text: string; link: string | null } }
  | { state: "CLOSED" | "RECEIVED"; filled: boolean };

/** Isi halaman /food-recall untuk customer: hanya nama depan dan tanggal kemarin. */
export type FoodRecallPage =
  | { state: "OPEN"; firstName: string; recallDateLabel: string }
  | { state: "CLOSED" }
  | { state: "RECEIVED" };

/** Food recall di halaman kunjungan dokter (spec bagian 5). */
export type FoodRecallView = {
  appointmentId: string;
  state: "NOT_OFFERED" | "WAITING" | "FILLED";
  recallDate: string;
  recallDateLabel: string;
  entries: FoodRecallEntry[];
  submittedAt: Date | null;
  completedAt: Date | null;
  completedByName: string | null;
};
```

Run: `npx vitest run tests/unit/food-recall.test.ts`
Expected: PASS (14/14).

- [ ] **Step 3: Tulis uji kode link (gagal)**

Buat `tests/unit/food-recall-code.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  foodRecallCode,
  foodRecallKey,
  foodRecallUrl,
  isValidFoodRecallCode,
  parseFoodRecallCode,
} from "@/server/food-recall-code";
import { quizLinkCode, quizLinkKey } from "@/server/quiz-link-code";

const KEY = foodRecallKey("rahasia-uji");
const ID = "cmfoodrecall000000000001";

describe("kode link food recall", () => {
  it("bentuknya id + tanda tangan, dan berlaku untuk id itu", () => {
    const code = foodRecallCode(ID, KEY);
    expect(parseFoodRecallCode(code)).toEqual({ foodRecallId: ID, signature: expect.any(String) });
    expect(isValidFoodRecallCode(code, KEY)).toBe(true);
  });

  it("menolak id lain, tanda tangan diubah, dan kunci lain", () => {
    const code = foodRecallCode(ID, KEY);
    const other = foodRecallCode("cmfoodrecall000000000002", KEY);
    expect(isValidFoodRecallCode(`${ID}.${other.split(".")[1]}`, KEY)).toBe(false);
    expect(isValidFoodRecallCode(`${code.slice(0, -1)}${code.endsWith("A") ? "B" : "A"}`, KEY)).toBe(false);
    expect(isValidFoodRecallCode(code, foodRecallKey("rahasia-lain"))).toBe(false);
  });

  it("kode link kuis untuk id yang sama tidak berlaku sebagai kode food recall", () => {
    const quizCode = quizLinkCode(ID, 0, quizLinkKey("rahasia-uji"));
    expect(isValidFoodRecallCode(quizCode, KEY)).toBe(false);
  });

  it("menolak bentuk rusak", () => {
    expect(parseFoodRecallCode("")).toBeNull();
    expect(parseFoodRecallCode(42)).toBeNull();
    expect(parseFoodRecallCode("tanpa-titik")).toBeNull();
    expect(isValidFoodRecallCode("tanpa-titik", KEY)).toBe(false);
  });

  it("link memakai #, sehingga kode tidak terkirim ke server", () => {
    expect(foodRecallUrl("https://sundyclinic.com", ID, KEY)).toBe(`https://sundyclinic.com/food-recall#${foodRecallCode(ID, KEY)}`);
  });
});
```

Run: `npx vitest run tests/unit/food-recall-code.test.ts`
Expected: FAIL, karena modul `@/server/food-recall-code` tidak ditemukan.

- [ ] **Step 4: Tulis kode link**

Buat `src/server/food-recall-code.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kode link food recall (spec 4.2): "{foodRecallId}.{tanda tangan}". Tanda
 * tangan = HMAC-SHA256(foodRecallId) dengan kunci turunan BETTER_AUTH_SECRET
 * berlabel sendiri, dipotong 16 byte — kode link kuis (label lain) tidak
 * pernah berlaku di sini. Kode tidak disimpan di basis data. Hanya untuk
 * server: kuncinya rahasia.
 */
const KEY_LABEL = "sundy:food-recall-link:v1";
const SIGNATURE_BYTES = 16;
const CODE_PATTERN = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{22})$/;

export function foodRecallKey(secret: string | undefined = process.env.BETTER_AUTH_SECRET): Buffer {
  if (!secret) throw new Error("BETTER_AUTH_SECRET belum diisi; link food recall tidak bisa dibuat.");
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function signature(foodRecallId: string, key: Buffer): string {
  return createHmac("sha256", key).update(foodRecallId).digest().subarray(0, SIGNATURE_BYTES).toString("base64url");
}

export function foodRecallCode(foodRecallId: string, key: Buffer = foodRecallKey()): string {
  return `${foodRecallId}.${signature(foodRecallId, key)}`;
}

export function parseFoodRecallCode(code: unknown): { foodRecallId: string; signature: string } | null {
  if (typeof code !== "string") return null;
  const match = CODE_PATTERN.exec(code);
  return match ? { foodRecallId: match[1], signature: match[2] } : null;
}

/** Perbandingan waktu-konstan atas teks base64url (lihat quiz-link-code.ts). */
export function isValidFoodRecallCode(code: string, key: Buffer = foodRecallKey()): boolean {
  const parsed = parseFoodRecallCode(code);
  if (!parsed) return false;
  const given = Buffer.from(parsed.signature);
  const expected = Buffer.from(signature(parsed.foodRecallId, key));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Kode setelah "#": tidak pernah dikirim browser ke server, jadi tidak tercatat di log. */
export function foodRecallUrl(siteUrl: string, foodRecallId: string, key: Buffer = foodRecallKey()): string {
  return `${siteUrl}/food-recall#${foodRecallCode(foodRecallId, key)}`;
}
```

Run: `npx vitest run tests/unit/food-recall-code.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t2.log" 2>&1; grep -E "Test Files|Tests " "$WS/t2.log"; npx eslint src/lib/food-recall.ts src/server/food-recall-code.ts; npx tsc --noEmit -p . > "$WS/t2-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/lib/food-recall.ts src/server/food-recall-code.ts tests/unit/food-recall.test.ts tests/unit/food-recall-code.test.ts
git commit -m "feat: add food recall rules (entries, day-before date, doctor table, copy-to-S text, link state) and signed food recall links"
```

---
### Task 3: Server food recall — link admin, kiriman customer, suntingan dokter

**Files:**
- Create: `src/server/food-recall-store.ts`, `src/server/food-recall-admin.ts`, `src/server/food-recall-public.ts`
- Test: `tests/integration/food-recall.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: model `FoodRecall`;
  - Task 2: `foodRecallLinkState`, `foodRecallMessageText`, `recallDateFor`, `recallDateLabel`, `validateCustomerEntries`, `validateStaffEntries`, `FOOD_RECALL_CLOSED`, `FOOD_RECALL_RECEIVED`, `type FoodRecallLinkInfo`, `type FoodRecallPage`, `type FoodRecallLinkState`, `foodRecallUrl`, `isValidFoodRecallCode`, `parseFoodRecallCode`.
- Produces:
  - `food-recall-store.ts` (tanpa `"use server"`):
    - `loadFoodRecallForLink(foodRecallId: string)`, `loadFoodRecallForAppointment(appointmentId: string)` → `FoodRecallForLink | null`;
    - `type FoodRecallForLink`;
    - `linkStateOf(row: FoodRecallForLink, now: Date): FoodRecallLinkState`;
    - `foodRecallLinkInfo(row: FoodRecallForLink | null, now: Date): FoodRecallLinkInfo`.
  - `food-recall-admin.ts`:
    - `getFoodRecallLink(appointmentId: string): Promise<ActionResult<FoodRecallLinkInfo>>` (`booking:manage`);
    - `offerFoodRecall(appointmentId: string): Promise<ActionResult<FoodRecallLinkInfo>>` (`booking:manage`);
    - `saveFoodRecallByStaff(input: { appointmentId: string; entries: unknown }): Promise<ActionResult<void>>` (`record:write`).
  - `food-recall-public.ts`:
    - `getFoodRecallPage(code: string): Promise<ActionResult<FoodRecallPage>>`;
    - `submitFoodRecall(input: { code: string; entries: unknown; website: string }): Promise<ActionResult<{ state: "SUBMITTED" }>>`.
  - Aksi audit: `food-recall.offer`, `food-recall.submit`, `food-recall.complete` (entity `Appointment`).

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/food-recall.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FOOD_RECALL_CLOSED, FOOD_RECALL_RECEIVED, recallDateLabel } from "@/lib/food-recall";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getFoodRecallLink, offerFoodRecall, saveFoodRecallByStaff } from "@/server/food-recall-admin";
import { foodRecallCode } from "@/server/food-recall-code";
import { getFoodRecallPage, submitFoodRecall } from "@/server/food-recall-public";
import { quizLinkCode } from "@/server/quiz-link-code";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({
  actor: {
    userId: "u1",
    staffId: "s1",
    name: "dr. Uji Food Recall",
    role: "DOKTER" as "DOKTER" | "RESEPSIONIS" | "SUPER_ADMIN",
    email: "uji@sundy.test",
  },
}));

// Meniru requireCapability: staf tanpa kemampuan itu ditolak.
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "food-recall-uji";
const WA = "6281200009900";
const today = witaDateString(new Date());
const CUSTOMER_ROW = { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning 1 piring" };

describe("food recall: link, kiriman customer, suntingan dokter", () => {
  let world: BookingWorld;
  let patientId: string;
  let slot = 0;

  /** Booking pada tanggal hari ini + offset, mulai 04.00 bergeser 30 menit agar tidak bertindihan. */
  async function booking(status: AppointmentStatus = "HADIR", offsetDays = 0) {
    slot += 1;
    const minutes = 4 * 60 + slot * 30;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const startAt = at(addDaysToDateString(today, offsetDays), time);
    return prisma.appointment.create({
      data: {
        code: `FRC-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status,
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
  }

  async function offered(offsetDays = 0) {
    const appointment = await booking("HADIR", offsetDays);
    const recall = await prisma.foodRecall.create({
      data: { appointmentId: appointment.id, recallDate: new Date(`${addDaysToDateString(today, offsetDays - 1)}T00:00:00Z`) },
    });
    return { appointment, recall, code: foodRecallCode(recall.id) };
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-9900", name: "Siti Rahayu", whatsapp: WA } })
    ).id;
  });

  beforeEach(() => {
    actor.role = "DOKTER";
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("menawarkan food recall: satu baris H-1, link berlaku hari ini dengan pesan WA", async () => {
    const appointment = await booking();
    const info = await unwrap(offerFoodRecall(appointment.id));
    expect(info).toMatchObject({ state: "OPEN", filled: false });
    if (info.state !== "OPEN") throw new Error("link seharusnya berlaku");
    expect(info.url).toMatch(/\/food-recall#/);
    expect(info.message.link).toContain("wa.me/6281200009900");
    expect(info.message.text).not.toMatch(/pasien|berobat/i);

    await unwrap(offerFoodRecall(appointment.id));
    const rows = await prisma.foodRecall.findMany({ where: { appointmentId: appointment.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recallDate.toISOString().slice(0, 10)).toBe(addDaysToDateString(today, -1));
  });

  it("tidak menawarkan food recall untuk booking yang belum check-in", async () => {
    const appointment = await booking("TERKONFIRMASI");
    expect(await offerFoodRecall(appointment.id)).toEqual({
      ok: false,
      error: "Food recall hanya untuk customer yang sudah check-in.",
    });
  });

  it("halaman link hanya memuat nama depan dan tanggal kemarin", async () => {
    const { code } = await offered();
    const page = await unwrap(getFoodRecallPage(code));
    expect(page).toEqual({ state: "OPEN", firstName: "Siti", recallDateLabel: recallDateLabel(addDaysToDateString(today, -1)) });
    expect(JSON.stringify(page)).not.toContain(WA);
    expect(JSON.stringify(page)).not.toContain("Rahayu");
  });

  it("kiriman customer tersimpan sebagai baris CUSTOMER, dan kiriman ulang menggantikannya", async () => {
    const { appointment, recall, code } = await offered();
    await unwrap(submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" }));
    await unwrap(submitFoodRecall({ code, entries: [{ hour: 12, kind: "KAPSUL_OBAT", text: "Kapsul M" }], website: "" }));

    const row = await prisma.foodRecall.findUniqueOrThrow({ where: { id: recall.id } });
    expect(row.status).toBe("DIISI");
    expect(row.entries).toEqual([{ hour: 12, kind: "KAPSUL_OBAT", text: "Kapsul M", by: "CUSTOMER" }]);
    expect(row.submittedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "food-recall.submit", entityId: appointment.id } })).toBe(2);
  });

  it("link kemarin tidak berlaku: halaman tertutup dan kiriman ditolak tanpa menyimpan", async () => {
    const { recall, code } = await offered(-1);
    expect(await unwrap(getFoodRecallPage(code))).toEqual({ state: "CLOSED" });
    expect(await submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" })).toEqual({
      ok: false,
      error: FOOD_RECALL_CLOSED,
    });
    expect((await prisma.foodRecall.findUniqueOrThrow({ where: { id: recall.id } })).entries).toEqual([]);
  });

  it("kode link kuis dan kode rusak tidak membuka food recall", async () => {
    const { recall, appointment } = await offered();
    expect(await unwrap(getFoodRecallPage(quizLinkCode(recall.id, 0)))).toEqual({ state: "CLOSED" });
    expect(await unwrap(getFoodRecallPage(quizLinkCode(appointment.id, 0)))).toEqual({ state: "CLOSED" });
    expect(await unwrap(getFoodRecallPage("bukan-kode"))).toEqual({ state: "CLOSED" });
  });

  it("kolom jebakan bot menolak kiriman", async () => {
    const { code } = await offered();
    expect((await submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "spam" })).ok).toBe(false);
  });

  it("dokter melengkapi: baris baru DOKTER, link customer ditutup", async () => {
    const { appointment, recall, code } = await offered();
    await unwrap(submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" }));
    await unwrap(
      saveFoodRecallByStaff({
        appointmentId: appointment.id,
        entries: [{ ...CUSTOMER_ROW, by: "CUSTOMER" }, { hour: 9, kind: "OLAHRAGA", text: "Senam pagi" }],
      }),
    );

    const row = await prisma.foodRecall.findUniqueOrThrow({ where: { id: recall.id } });
    expect(row.entries).toEqual([
      { ...CUSTOMER_ROW, by: "CUSTOMER" },
      { hour: 9, kind: "OLAHRAGA", text: "Senam pagi", by: "DOKTER" },
    ]);
    expect(row.completedByName).toBe("dr. Uji Food Recall");
    expect(await unwrap(getFoodRecallPage(code))).toEqual({ state: "RECEIVED" });
    expect(await submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" })).toEqual({
      ok: false,
      error: FOOD_RECALL_RECEIVED,
    });
  });

  it("dokter bisa melengkapi walau food recall belum ditawarkan", async () => {
    const appointment = await booking();
    await unwrap(saveFoodRecallByStaff({ appointmentId: appointment.id, entries: [CUSTOMER_ROW] }));
    const row = await prisma.foodRecall.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    expect(row).toMatchObject({ status: "DIISI", entries: [{ ...CUSTOMER_ROW, by: "DOKTER" }] });
  });

  it("setelah catatan final: kiriman customer dan suntingan dokter ditolak", async () => {
    const { appointment, code } = await offered();
    const encounter = await prisma.encounter.create({
      data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji", assessment: "Obesitas" },
    });
    await prisma.$transaction([
      prisma.encounter.update({
        where: { id: encounter.id },
        data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
      }),
      prisma.appointment.update({ where: { id: appointment.id }, data: { status: "SELESAI" } }),
    ]);

    expect(await submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" })).toEqual({
      ok: false,
      error: FOOD_RECALL_RECEIVED,
    });
    expect(await saveFoodRecallByStaff({ appointmentId: appointment.id, entries: [CUSTOMER_ROW] })).toEqual({
      ok: false,
      error: "Catatan dokter sudah final; food recall tidak bisa diubah.",
    });
  });

  it("resepsionis melihat status link tanpa isi catatan, dan tidak bisa melengkapi", async () => {
    const { appointment, code } = await offered();
    await unwrap(submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" }));
    actor.role = "RESEPSIONIS";

    const info = await unwrap(getFoodRecallLink(appointment.id));
    expect(info).toMatchObject({ state: "OPEN", filled: true });
    expect(JSON.stringify(info)).not.toContain("Nasi kuning");
    await expect(saveFoodRecallByStaff({ appointmentId: appointment.id, entries: [CUSTOMER_ROW] })).rejects.toThrow(
      /forbidden: record:write/,
    );
  });

  it("booking tanpa food recall dilaporkan belum ditawarkan", async () => {
    const appointment = await booking();
    expect(await unwrap(getFoodRecallLink(appointment.id))).toEqual({ state: "NOT_OFFERED" });
  });
});
```

Run: `npm run test:integration -- tests/integration/food-recall.test.ts`
Expected: FAIL, karena modul `@/server/food-recall-admin` tidak ditemukan.

- [ ] **Step 2: Tulis pemuat baris dan info link**

Buat `src/server/food-recall-store.ts`:

```ts
import { prisma } from "@/lib/db";
import {
  foodRecallLinkState,
  foodRecallMessageText,
  type FoodRecallLinkInfo,
  type FoodRecallLinkState,
} from "@/lib/food-recall";
import { buildWhatsAppLinkTo } from "@/lib/whatsapp";
import { foodRecallUrl } from "@/server/food-recall-code";
import { publicSiteUrl } from "@/server/site-url";

// Tanpa "use server": berkas ini tidak boleh bisa dipanggil dari browser.
// Isi catatan (entries) sengaja tidak dipilih: info link juga dibuka resepsionis.
const LINK_SELECT = {
  id: true,
  status: true,
  recallDate: true,
  completedAt: true,
  appointment: {
    select: {
      id: true,
      status: true,
      startAt: true,
      patient: { select: { name: true, whatsapp: true } },
      encounter: { select: { status: true } },
    },
  },
} as const;

export function loadFoodRecallForLink(foodRecallId: string) {
  return prisma.foodRecall.findUnique({ where: { id: foodRecallId }, select: LINK_SELECT });
}

export function loadFoodRecallForAppointment(appointmentId: string) {
  return prisma.foodRecall.findUnique({ where: { appointmentId }, select: LINK_SELECT });
}

export type FoodRecallForLink = NonNullable<Awaited<ReturnType<typeof loadFoodRecallForLink>>>;

export function linkStateOf(row: FoodRecallForLink, now: Date): FoodRecallLinkState {
  return foodRecallLinkState(
    {
      appointmentStatus: row.appointment.status,
      startAt: row.appointment.startAt,
      encounterStatus: row.appointment.encounter?.status ?? null,
      completedAt: row.completedAt,
    },
    now,
  );
}

/** Info link untuk panel admin: QR, buka di tablet, kirim WA (spec 4.2), atau keadaannya bila tidak berlaku. */
export function foodRecallLinkInfo(row: FoodRecallForLink | null, now: Date): FoodRecallLinkInfo {
  if (!row) return { state: "NOT_OFFERED" };
  const filled = row.status === "DIISI";
  const state = linkStateOf(row, now);
  if (state !== "OPEN") return { state, filled };
  const url = foodRecallUrl(publicSiteUrl(), row.id);
  const patient = row.appointment.patient;
  const text = foodRecallMessageText({ patientName: patient?.name ?? "", link: url });
  return { state: "OPEN", filled, url, message: { text, link: patient ? buildWhatsAppLinkTo(patient.whatsapp, text) : null } };
}
```

- [ ] **Step 3: Tulis aksi admin dan dokter**

Buat `src/server/food-recall-admin.ts`:

```ts
"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { recallDateFor, validateStaffEntries, type FoodRecallLinkInfo } from "@/lib/food-recall";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { isRecordLockedError } from "@/server/db-errors";
import { foodRecallLinkInfo, loadFoodRecallForAppointment } from "@/server/food-recall-store";
import { requireCapability } from "@/server/session";

const LOCKED = "Catatan dokter sudah final; food recall tidak bisa diubah.";
const NOT_CHECKED_IN = "Food recall hanya untuk customer yang sudah check-in.";

const recallDateValue = (startAt: Date) => new Date(`${recallDateFor(startAt)}T00:00:00Z`);

function loadBooking(appointmentId: unknown) {
  return prisma.appointment.findUnique({
    where: { id: String(appointmentId ?? "") },
    select: { id: true, code: true, status: true, startAt: true, encounter: { select: { id: true, status: true } } },
  });
}

/** Link food recall sebuah booking (spec 4.4). Tanpa isi catatan: resepsionis juga membukanya. */
export async function getFoodRecallLink(appointmentId: string): Promise<ActionResult<FoodRecallLinkInfo>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    return foodRecallLinkInfo(await loadFoodRecallForAppointment(String(appointmentId ?? "")), new Date());
  });
}

/** "Tawarkan food recall" untuk booking yang sudah check-in tanpa food recall (spec 4.4, 5.1). */
export async function offerFoodRecall(appointmentId: string): Promise<ActionResult<FoodRecallLinkInfo>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const booking = await loadBooking(appointmentId);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.encounter?.status === "FINAL") throw new UserFacingError(LOCKED);
    if (booking.status !== "HADIR") throw new UserFacingError(NOT_CHECKED_IN);

    try {
      await prisma.foodRecall.upsert({
        where: { appointmentId: booking.id },
        create: { appointmentId: booking.id, recallDate: recallDateValue(booking.startAt) },
        update: {},
      });
    } catch (error) {
      if (isRecordLockedError(error)) throw new UserFacingError(LOCKED);
      throw error;
    }

    await recordAudit({ actor, action: "food-recall.offer", entity: "Appointment", entityId: booking.id, summary: booking.code });
    safeRevalidatePath("/admin/booking");
    return foodRecallLinkInfo(await loadFoodRecallForAppointment(booking.id), new Date());
  });
}

/**
 * Dokter melengkapi food recall dari halaman kunjungan (spec 5.3). Baris
 * customer tetap bertanda CUSTOMER, tambahan dokter bertanda DOKTER, dan
 * completedAt menutup link customer agar tambahan ini tidak tertimpa.
 */
export async function saveFoodRecallByStaff(input: { appointmentId: string; entries: unknown }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const checked = validateStaffEntries(input?.entries);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const booking = await loadBooking(input?.appointmentId);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.encounter?.status === "FINAL") throw new UserFacingError(LOCKED);
    if (booking.status !== "HADIR") throw new UserFacingError(NOT_CHECKED_IN);

    const data = {
      status: "DIISI" as const,
      entries: checked.entries as Prisma.InputJsonValue,
      completedByStaffId: actor.staffId,
      completedByName: actor.name,
      completedAt: new Date(),
    };
    try {
      await prisma.foodRecall.upsert({
        where: { appointmentId: booking.id },
        create: { appointmentId: booking.id, recallDate: recallDateValue(booking.startAt), ...data },
        update: data,
      });
    } catch (error) {
      if (isRecordLockedError(error)) throw new UserFacingError(LOCKED);
      throw error;
    }

    await recordAudit({ actor, action: "food-recall.complete", entity: "Appointment", entityId: booking.id, summary: booking.code });
    if (booking.encounter) safeRevalidatePath(`/admin/kunjungan/${booking.encounter.id}`);
    safeRevalidatePath("/admin/booking");
  });
}
```

- [ ] **Step 4: Tulis aksi publik**

Buat `src/server/food-recall-public.ts`:

```ts
"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  FOOD_RECALL_CLOSED,
  FOOD_RECALL_RECEIVED,
  recallDateLabel,
  validateCustomerEntries,
  type FoodRecallPage,
} from "@/lib/food-recall";
import { firstName } from "@/lib/quiz-link";
import { createRateLimiter } from "@/lib/rate-limit";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit, SITE_PATIENT_ACTOR } from "@/server/audit";
import { isRecordLockedError } from "@/server/db-errors";
import { isValidFoodRecallCode, parseFoodRecallCode } from "@/server/food-recall-code";
import { linkStateOf, loadFoodRecallForLink, type FoodRecallForLink } from "@/server/food-recall-store";
import { guardRate } from "@/server/request-guard";

// Setiap ekspor berkas ini bisa dipanggil siapa pun dari browser tanpa login.
// Kode link adalah satu-satunya bukti, jadi diperiksa ulang di setiap aksi.

const pageLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const submitLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

const GENERIC_FAILURE = "Catatan gagal dikirim. Muat ulang halaman lalu coba lagi.";

async function foodRecallForCode(code: unknown): Promise<FoodRecallForLink | null> {
  const parsed = parseFoodRecallCode(code);
  if (!parsed || !isValidFoodRecallCode(code as string)) return null;
  return loadFoodRecallForLink(parsed.foodRecallId);
}

/** Isi halaman /food-recall: hanya nama depan dan tanggal kemarin (spec 4.3). */
export async function getFoodRecallPage(code: string): Promise<ActionResult<FoodRecallPage>> {
  return runAction(async () => {
    await guardRate(pageLimiter);
    const row = await foodRecallForCode(code);
    if (!row) return { state: "CLOSED" };
    const state = linkStateOf(row, new Date());
    if (state !== "OPEN") return { state };
    return {
      state: "OPEN",
      firstName: firstName(row.appointment.patient?.name ?? ""),
      recallDateLabel: recallDateLabel(row.recallDate.toISOString().slice(0, 10)),
    };
  });
}

/**
 * Kiriman customer (spec 4.2–4.3): menggantikan isian sebelumnya selama link
 * berlaku. Pembaruan bersyarat completedAt = null: bila dokter sudah melengkapi
 * lebih dulu, kiriman ini ditolak dan tambahan dokter tidak tertimpa.
 */
export async function submitFoodRecall(input: {
  code: string;
  entries: unknown;
  website: string;
}): Promise<ActionResult<{ state: "SUBMITTED" }>> {
  return runAction(async () => {
    await guardRate(submitLimiter);
    if (input?.website) throw new UserFacingError(GENERIC_FAILURE);

    const row = await foodRecallForCode(input?.code);
    if (!row) throw new UserFacingError(FOOD_RECALL_CLOSED);
    const state = linkStateOf(row, new Date());
    if (state === "RECEIVED") throw new UserFacingError(FOOD_RECALL_RECEIVED);
    if (state !== "OPEN") throw new UserFacingError(FOOD_RECALL_CLOSED);

    const checked = validateCustomerEntries(input?.entries);
    if (!checked.ok) throw new UserFacingError(checked.message);

    let updated: number;
    try {
      const result = await prisma.foodRecall.updateMany({
        where: { id: row.id, completedAt: null },
        data: { status: "DIISI", entries: checked.entries as Prisma.InputJsonValue, submittedAt: new Date() },
      });
      updated = result.count;
    } catch (error) {
      if (isRecordLockedError(error)) throw new UserFacingError(FOOD_RECALL_RECEIVED);
      throw error;
    }
    if (updated === 0) throw new UserFacingError(FOOD_RECALL_RECEIVED);

    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "food-recall.submit",
      entity: "Appointment",
      entityId: row.appointment.id,
    });
    safeRevalidatePath("/admin/booking");
    return { state: "SUBMITTED" };
  });
}
```

Run: `npm run test:integration -- tests/integration/food-recall.test.ts`
Expected: PASS (12/12).

- [ ] **Step 5: Lint, tipe, uji unit, commit**

Run: `npx eslint src/server/food-recall-store.ts src/server/food-recall-admin.ts src/server/food-recall-public.ts; npx tsc --noEmit -p . > "$WS/t3-tsc.log" 2>&1; echo "tsc exit $?"; npx vitest run > "$WS/t3.log" 2>&1; grep -E "Test Files|Tests " "$WS/t3.log"`
Expected: eslint bersih, `tsc` keluar 0, uji unit PASS. Uji arsitektur "komponen server hanya mengambil komponen dari modul klien" tetap lulus.

```bash
git add src/server/food-recall-store.ts src/server/food-recall-admin.ts src/server/food-recall-public.ts tests/integration/food-recall.test.ts
git commit -m "feat: offer, submit, and complete the day-before food recall through signed links, locked once the visit is final"
```

---

### Task 4: Server check-in — NIK, data diri, pasien rangkap

**Files:**
- Create: `src/server/appointment-guard.ts`, `src/server/check-in.ts`
- Modify:
  - `src/server/appointment.ts` (pakai `appointment-guard.ts`);
  - `src/server/patient.ts` (pasien rangkap disembunyikan, pencarian NIK);
  - `src/server/intake.ts` (pencocokan tanpa pasien rangkap).
- Test: `tests/integration/check-in.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `normalizeNik`, `isNikMissingReason`, `maskNik`, `NIK_FORMAT_ERROR`, `NIK_MISSING_REASONS`, `type NikMissingReasonValue`;
  - Task 2: `recallDateFor`, `shouldOfferFoodRecall`, `type FoodRecallLinkInfo`;
  - Task 3: `foodRecallLinkInfo`, `loadFoodRecallForAppointment`;
  - sudah ada: `validateLinkIdentity`, `type LinkIdentity`, `type IdentityField` (`@/lib/kuis/identity`), `missingIdentityFields` (`@/lib/quiz-link`), `bookingServiceName`, `normalizeWhatsapp`.
- Produces:
  - `appointment-guard.ts`: `ACTIVE_STATUSES: AppointmentStatus[]`, `rejectedChangeError(id: string, needsPatient?: boolean): Promise<UserFacingError>`.
  - `check-in.ts`:
    - `type CheckInPatient`, `type CheckInForm`, `type NikOwner`, `type CheckInNik`, `type CheckInInput`, `type CheckInResult` (lihat kode);
    - `getCheckInForm(appointmentId: string): Promise<ActionResult<CheckInForm>>`;
    - `lookupNikOwner(input: { appointmentId: string; nik: string }): Promise<ActionResult<NikOwner | null>>`;
    - `mergeDuplicatePatient(input: { appointmentId: string; nik: string }): Promise<ActionResult<CheckInForm>>`;
    - `checkInAppointment(input: CheckInInput): Promise<ActionResult<CheckInResult>>`.
  - Aksi audit: `appointment.check-in`, `patient.update-nik`, `patient.merge-duplicate`.
  - `listRecentPatients`, `countPatients`, `searchPatients`, `findPatientsByWhatsapp`, dan `getMatchCandidates` tidak lagi mengembalikan pasien rangkap. `searchPatients` juga mencari NIK (≥ 6 angka). `matchPatient` menolak pasien rangkap.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/check-in.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NIK_FORMAT_ERROR } from "@/lib/nik";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import {
  checkInAppointment,
  getCheckInForm,
  lookupNikOwner,
  mergeDuplicatePatient,
  type CheckInInput,
} from "@/server/check-in";
import { getMatchCandidates, matchPatient } from "@/server/intake";
import { countPatients, findPatientsByWhatsapp, listRecentPatients, searchPatients } from "@/server/patient";
import { purgeEncounters } from "../purge-encounters";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as const, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", () => ({ requireCapability: vi.fn().mockResolvedValue(actor) }));

const SLUG = "check-in-uji";
const WA = { main: "6281200006600", owner: "6281200006601", duplicate: "6281200006602", clinical: "6281200006603" };
const OWNER_NIK = "7171015705900001";
const today = witaDateString(new Date());

describe("check-in: NIK, data diri, pasien rangkap", () => {
  let world: BookingWorld;
  let slot = 0;

  async function patient(input: { mrn: string; name: string; whatsapp: string; extra?: object }) {
    return prisma.patient.create({
      data: { medicalRecordNumber: input.mrn, name: input.name, whatsapp: input.whatsapp, ...(input.extra ?? {}) },
    });
  }

  async function booking(patientId: string | null, input: { status?: AppointmentStatus; offsetDays?: number } = {}) {
    slot += 1;
    const minutes = 4 * 60 + slot * 30;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const startAt = at(addDaysToDateString(today, input.offsetDays ?? 0), time);
    return prisma.appointment.create({
      data: {
        code: `CIN-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: input.status ?? "TERKONFIRMASI",
        source: patientId ? "WHATSAPP" : "SITUS",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
  }

  const input = (appointmentId: string, overrides: Partial<CheckInInput> = {}): CheckInInput => ({
    appointmentId,
    nik: { kind: "SET", value: "7171 0102 9203 0001" },
    // Kolom yang sudah terisi di data pasien diabaikan server.
    identity: { birthDate: "1992-04-17", gender: "P", occupation: "Guru", address: "Jl. Uji Check-in 1" },
    whatsapp: "0812-0000-6600",
    offerFoodRecall: true,
    ...overrides,
  });

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, Object.values(WA));
    world = await createBookingWorld(SLUG);
  });

  beforeEach(async () => {
    // Uji pindah pasien rangkap membuat kunjungan, yang menahan booking (FK Restrict).
    await purgeEncounters(prisma);
    await prisma.foodRecall.deleteMany({ where: { appointment: { staff: { slug: { startsWith: SLUG } } } } });
    await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: { startsWith: SLUG } } } } });
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
    await prisma.patient.updateMany({ where: { whatsapp: { in: Object.values(WA) } }, data: { mergedIntoId: null } });
    await prisma.patient.deleteMany({ where: { whatsapp: { in: Object.values(WA) } } });
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, Object.values(WA));
    await prisma.$disconnect();
  });

  it("dialog memuat data pasien dan mencentang food recall untuk isian Slimming", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main, extra: { address: "Jl. Lama 1" } });
    const appointment = await booking(main.id);
    await prisma.intake.create({ data: { appointmentId: appointment.id, patientId: main.id, status: "TERISI", kind: "LENGKAP", purpose: "SLIMMING" } });

    const form = await unwrap(getCheckInForm(appointment.id));
    expect(form).toMatchObject({
      code: appointment.code,
      offerFoodRecallByDefault: true,
      patient: { name: "Siti Rahayu", nik: null, nikMissingReason: null, address: "Jl. Lama 1", birthDate: null, gender: null },
    });
    expect(form.summary).toContain("dr. Uji Publik");

    const other = await booking(main.id);
    expect((await unwrap(getCheckInForm(other.id))).offerFoodRecallByDefault).toBe(false);
  });

  it("check-in menyimpan NIK, hanya melengkapi kolom kosong, dan menawarkan food recall", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main, extra: { address: "Jl. Lama 1" } });
    const appointment = await booking(main.id);

    const result = await unwrap(
      checkInAppointment(input(appointment.id, { identity: { gender: "P", occupation: "Guru", address: "Jl. Baru", birthDate: "1992-04-17" } })),
    );
    expect(result.patientName).toBe("Siti Rahayu");
    expect(result.foodRecall).toMatchObject({ state: "OPEN", filled: false });

    const saved = await prisma.patient.findUniqueOrThrow({ where: { id: main.id } });
    expect(saved).toMatchObject({ nik: "7171010292030001", gender: "P", occupation: "Guru", address: "Jl. Lama 1", whatsapp: "6281200006600" });
    expect(saved.birthDate?.toISOString().slice(0, 10)).toBe("1992-04-17");

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { foodRecall: true } });
    expect(row.status).toBe("HADIR");
    expect(row.checkedInAt).not.toBeNull();
    expect(row.foodRecall?.recallDate.toISOString().slice(0, 10)).toBe(addDaysToDateString(today, -1));

    const audits = await prisma.auditLog.findMany({ where: { entityId: { in: [appointment.id, main.id] } } });
    expect(audits.map((a) => a.action).sort()).toEqual(["appointment.check-in", "patient.update-nik"]);
    expect(audits.find((a) => a.action === "patient.update-nik")?.summary).toBe("SDY-2026-6600: ••••••••••••0001");
  });

  it("Belum ada NIK disimpan dengan alasannya, lalu diminta lagi di check-in berikutnya", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main });
    const first = await booking(main.id);
    await unwrap(checkInAppointment(input(first.id, { nik: { kind: "MISSING", reason: "LUPA_KTP" }, offerFoodRecall: false })));
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: main.id } })).toMatchObject({ nik: null, nikMissingReason: "LUPA_KTP" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: first.id }, include: { foodRecall: true } })).foodRecall).toBeNull();

    const second = await booking(main.id, { offsetDays: 1 });
    expect(await checkInAppointment(input(second.id, { nik: { kind: "KEEP" } }))).toEqual({
      ok: false,
      error: "Isi NIK atau pilih alasan belum ada NIK.",
    });
  });

  it("menolak NIK yang bukan 16 angka, alasan asing, dan data diri yang belum diisi", async () => {
    const main = await patient({
      mrn: "SDY-2026-6600",
      name: "Siti Rahayu",
      whatsapp: WA.main,
      extra: { birthDate: new Date("1992-04-17T00:00:00Z"), address: "Jl. Lama 1" },
    });
    const appointment = await booking(main.id);
    expect(await checkInAppointment(input(appointment.id, { nik: { kind: "SET", value: "12345" } }))).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
    expect(
      await checkInAppointment(input(appointment.id, { nik: { kind: "MISSING", reason: "LAINNYA" as never } })),
    ).toEqual({ ok: false, error: "Isi NIK atau pilih alasan belum ada NIK." });
    expect(await checkInAppointment(input(appointment.id, { identity: { occupation: "Guru" } }))).toEqual({
      ok: false,
      error: "Pilih jenis kelamin.",
    });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("TERKONFIRMASI");
  });

  it("NIK milik pasien lain: check-in ditolak, dan pemiliknya ditemukan walau NIK diketik bertitik", async () => {
    const owner = await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const duplicate = await patient({ mrn: "SDY-2026-6602", name: "Siti Rangkap", whatsapp: WA.duplicate });
    const appointment = await booking(duplicate.id);

    expect(await checkInAppointment(input(appointment.id, { nik: { kind: "SET", value: OWNER_NIK } }))).toEqual({
      ok: false,
      error: "NIK ini sudah dipakai Siti Lama (SDY-2026-6601). Periksa lagi, atau pindahkan booking ke pasien itu.",
    });
    const found = await unwrap(lookupNikOwner({ appointmentId: appointment.id, nik: "7171.0157.0590.0001" }));
    expect(found).toMatchObject({ patientId: owner.id, medicalRecordNumber: "SDY-2026-6601", merge: { allowed: true } });
    expect(await unwrap(lookupNikOwner({ appointmentId: appointment.id, nik: "7171015705900099" }))).toBeNull();
  });

  it("pindah pasien rangkap: semua booking dan isian pindah, dan pasien rangkap tersembunyi", async () => {
    const owner = await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const duplicate = await patient({ mrn: "SDY-2026-6602", name: "Siti Rangkap", whatsapp: WA.duplicate });
    const todayBooking = await booking(duplicate.id);
    const laterBooking = await booking(duplicate.id, { offsetDays: 7 });
    await prisma.intake.create({ data: { appointmentId: laterBooking.id, patientId: duplicate.id, status: "TERISI", kind: "PENDEK" } });

    const form = await unwrap(mergeDuplicatePatient({ appointmentId: todayBooking.id, nik: OWNER_NIK }));
    expect(form.patient).toMatchObject({ id: owner.id, nik: OWNER_NIK, name: "Siti Lama" });

    expect(await prisma.appointment.count({ where: { patientId: owner.id } })).toBe(2);
    expect(await prisma.intake.count({ where: { patientId: owner.id } })).toBe(1);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: duplicate.id } })).mergedIntoId).toBe(owner.id);
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.merge-duplicate", entityId: owner.id } })).summary,
    ).toBe("SDY-2026-6602 → SDY-2026-6601: 2 booking, 1 isian");

    await unwrap(checkInAppointment(input(todayBooking.id, { nik: { kind: "KEEP" } })));

    expect((await searchPatients("Siti")).map((p) => p.id)).not.toContain(duplicate.id);
    expect((await listRecentPatients()).map((p) => p.id)).not.toContain(duplicate.id);
    expect(await findPatientsByWhatsapp(WA.duplicate)).toEqual([]);
    expect((await searchPatients("7171 0157")).map((p) => p.id)).toEqual([owner.id]);
    expect(await countPatients()).toBe(await prisma.patient.count({ where: { mergedIntoId: null } }));
  });

  it("pasien rangkap tidak muncul di pencocokan isian dan tidak bisa dipilih", async () => {
    const owner = await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const duplicate = await patient({ mrn: "SDY-2026-6602", name: "Siti Rangkap", whatsapp: WA.duplicate });
    const appointment = await booking(duplicate.id);
    await unwrap(mergeDuplicatePatient({ appointmentId: appointment.id, nik: OWNER_NIK }));

    const site = await booking(null, { status: "MENUNGGU_KONFIRMASI", offsetDays: 3 });
    await prisma.intake.create({
      data: { appointmentId: site.id, status: "TERISI", kind: "PENDEK", name: "Siti", whatsapp: WA.duplicate },
    });
    const candidates = await unwrap(getMatchCandidates(site.id));
    expect(candidates.candidates.map((c) => c.id)).not.toContain(duplicate.id);
    expect(await matchPatient(site.id, duplicate.id)).toEqual({
      ok: false,
      error: "Pasien ini rangkap dari pasien lain. Pilih pasien lamanya.",
    });
    expect(owner.id).toBeTruthy();
  });

  it("pindah ditolak bila pasien booking ini sudah punya catatan dokter atau data klinis", async () => {
    await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const clinical = await patient({ mrn: "SDY-2026-6603", name: "Siti Klinis", whatsapp: WA.clinical, extra: { allergies: "Udang" } });
    const appointment = await booking(clinical.id);
    const blocked = "Pasien ini sudah punya catatan dokter. Hubungi Super Admin untuk menggabungkan data.";

    expect(await unwrap(lookupNikOwner({ appointmentId: appointment.id, nik: OWNER_NIK }))).toMatchObject({
      merge: { allowed: false, reason: blocked },
    });
    expect(await mergeDuplicatePatient({ appointmentId: appointment.id, nik: OWNER_NIK })).toEqual({ ok: false, error: blocked });

    await prisma.patient.update({ where: { id: clinical.id }, data: { allergies: null } });
    const past = await booking(clinical.id, { status: "HADIR", offsetDays: -7 });
    await prisma.encounter.create({ data: { appointmentId: past.id, createdById: world.doctorId, createdByName: "dr. Uji" } });
    expect(await mergeDuplicatePatient({ appointmentId: appointment.id, nik: OWNER_NIK })).toEqual({ ok: false, error: blocked });
  });

  it("dua resepsionis meng-check-in bersamaan: hanya satu yang berhasil", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main });
    const appointment = await booking(main.id);
    const [first, second] = await Promise.all([
      checkInAppointment(input(appointment.id)),
      checkInAppointment(input(appointment.id)),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const failed = first.ok ? second : first;
    expect(failed).toEqual({ ok: false, error: "Booking ini sudah check-in." });
    expect(await prisma.auditLog.count({ where: { action: "appointment.check-in", entityId: appointment.id } })).toBe(1);
  });

  it("booking batal atau belum dicocokkan tidak bisa di-check-in", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main });
    const cancelled = await booking(main.id, { status: "DIBATALKAN" });
    expect(await getCheckInForm(cancelled.id)).toEqual({ ok: false, error: expect.stringMatching(/dibatalkan/i) });
    expect(await checkInAppointment(input(cancelled.id))).toEqual({ ok: false, error: expect.stringMatching(/dibatalkan/i) });

    const unmatched = await booking(null, { status: "MENUNGGU_KONFIRMASI" });
    expect(await checkInAppointment(input(unmatched.id))).toEqual({
      ok: false,
      error: "Cocokkan booking ini dengan data pasien lebih dulu.",
    });
  });
});
```

Run: `npm run test:integration -- tests/integration/check-in.test.ts`
Expected: FAIL, karena modul `@/server/check-in` tidak ditemukan.

- [ ] **Step 2: Pindahkan penjaga status ke modul bersama**

Buat `src/server/appointment-guard.ts`:

```ts
import type { AppointmentStatus } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";

// Tanpa "use server": dipakai appointment.ts dan check-in.ts, tidak dipanggil browser.

/** Status yang masih bisa dijadwal ulang, diverifikasi, di-check-in, atau dibatalkan. */
export const ACTIVE_STATUSES: AppointmentStatus[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

const STATUS_WORD: Record<AppointmentStatus, string> = {
  MENUNGGU_KONFIRMASI: "menunggu konfirmasi",
  TERKONFIRMASI: "terkonfirmasi",
  HADIR: "hadir",
  SELESAI: "selesai",
  DIBATALKAN: "dibatalkan",
  TIDAK_HADIR: "tidak hadir",
  KEDALUWARSA: "kedaluwarsa",
};

/**
 * Pesan untuk UPDATE bersyarat yang tidak mengubah apa pun: pasien belum
 * dicocokkan (booking situs), atau statusnya sudah berubah.
 */
export async function rejectedChangeError(id: string, needsPatient = false): Promise<UserFacingError> {
  const current = await prisma.appointment.findUniqueOrThrow({
    where: { id },
    select: { status: true, patientId: true },
  });
  if (needsPatient && current.patientId === null) {
    return new UserFacingError("Cocokkan booking ini dengan data pasien lebih dulu.");
  }
  return new UserFacingError(
    `Booking ini sudah berstatus ${STATUS_WORD[current.status]}. Muat ulang halaman.`,
  );
}
```

Di `src/server/appointment.ts`:
- hapus blok `/** Status yang masih bisa dijadwal ulang … */ const ACTIVE_STATUSES …`, blok `const STATUS_WORD …`, dan fungsi `rejectedChangeError` beserta komentarnya;
- tambahkan `import { ACTIVE_STATUSES, rejectedChangeError } from "@/server/appointment-guard";` di blok import `@/server/…`.

Run: `grep -n "STATUS_WORD\|const ACTIVE_STATUSES\|async function rejectedChangeError" src/server/appointment.ts; npm run test:integration -- tests/integration/appointment.test.ts tests/integration/intake-matching.test.ts`
Expected: `grep` tidak mengeluarkan apa pun, dan kedua berkas uji PASS (perilaku tidak berubah).

- [ ] **Step 3: Tulis aksi check-in**

Buat `src/server/check-in.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatDateColumn, formatIndonesianDate } from "@/lib/format";
import { recallDateFor, shouldOfferFoodRecall, type FoodRecallLinkInfo } from "@/lib/food-recall";
import { validateLinkIdentity, type IdentityField, type LinkIdentity } from "@/lib/kuis/identity";
import {
  isNikMissingReason,
  maskNik,
  NIK_FORMAT_ERROR,
  NIK_MISSING_REASONS,
  normalizeNik,
  type NikMissingReasonValue,
} from "@/lib/nik";
import { missingIdentityFields } from "@/lib/quiz-link";
import { safeRevalidatePath } from "@/lib/revalidate";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { bookingServiceName } from "@/lib/transfer-instruction";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { ACTIVE_STATUSES, rejectedChangeError } from "@/server/appointment-guard";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { foodRecallLinkInfo, loadFoodRecallForAppointment } from "@/server/food-recall-store";
import { requireCapability } from "@/server/session";

/** Data pasien di dialog check-in. Tanpa catatan medis: dialog juga dibuka resepsionis. */
export type CheckInPatient = {
  id: string;
  name: string;
  medicalRecordNumber: string;
  nik: string | null;
  nikMissingReason: NikMissingReasonValue | null;
  /** "YYYY-MM-DD" */
  birthDate: string | null;
  gender: "L" | "P" | null;
  occupation: string | null;
  address: string | null;
  whatsapp: string;
};

export type CheckInForm = {
  appointmentId: string;
  code: string;
  /** "Sabtu, 3 Oktober 2026 · 11.00–11.30 · Konsultasi Dokter · dr. Diane" */
  summary: string;
  patient: CheckInPatient;
  /** Centang awal "Tawarkan food recall" (spec 4.1). */
  offerFoodRecallByDefault: boolean;
};

/** Pemilik NIK yang bentrok (spec 3.3). */
export type NikOwner = {
  patientId: string;
  name: string;
  medicalRecordNumber: string;
  birthDateLabel: string | null;
  whatsapp: string;
  lastVisitLabel: string | null;
  merge: { allowed: true } | { allowed: false; reason: string };
};

export type CheckInNik =
  | { kind: "KEEP" }
  | { kind: "SET"; value: string }
  | { kind: "MISSING"; reason: NikMissingReasonValue };

export type CheckInInput = {
  appointmentId: string;
  nik: CheckInNik;
  /** Hanya kolom yang kosong di data pasien yang dibaca; kolom terisi diabaikan. */
  identity: LinkIdentity;
  whatsapp: string;
  offerFoodRecall: boolean;
};

export type CheckInResult = { patientName: string; foodRecall: FoodRecallLinkInfo | null };

const NIK_REQUIRED = "Isi NIK atau pilih alasan belum ada NIK.";
const NIK_TAKEN_RACE = "NIK ini baru saja dipakai pasien lain — periksa lagi.";
const MERGE_BLOCKED_CLINICAL = "Pasien ini sudah punya catatan dokter. Hubungi Super Admin untuk menggabungkan data.";
const MERGE_BLOCKED_OWN_NIK = "Pasien booking ini sudah punya NIK lain. Periksa lagi NIK-nya.";

/** Pesan untuk resepsionis; validateLinkIdentity menulis pesannya untuk customer. */
const IDENTITY_MESSAGE: Record<IdentityField, string> = {
  birthDate: "Isi tanggal lahir yang benar.",
  gender: "Pilih jenis kelamin.",
  occupation: "Isi pekerjaan (maksimal 100 karakter).",
  address: "Isi alamat (maksimal 200 karakter).",
};

const BOOKING_SELECT = {
  id: true,
  code: true,
  status: true,
  type: true,
  startAt: true,
  endAt: true,
  service: { select: { name: true } },
  staff: { select: { name: true } },
  intake: { select: { purpose: true } },
  patient: {
    select: {
      id: true,
      name: true,
      medicalRecordNumber: true,
      nik: true,
      nikMissingReason: true,
      birthDate: true,
      gender: true,
      occupation: true,
      address: true,
      whatsapp: true,
      activePackageId: true,
      mergedIntoId: true,
    },
  },
} as const;

async function loadBooking(appointmentId: unknown) {
  const booking = await prisma.appointment.findUnique({ where: { id: String(appointmentId ?? "") }, select: BOOKING_SELECT });
  if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
  return booking;
}

type LoadedBooking = Awaited<ReturnType<typeof loadBooking>>;
type CheckablePatient = NonNullable<LoadedBooking["patient"]>;

/** Spec 7: resepsionis kedua yang menekan Check-in bersamaan. */
const ALREADY_CHECKED_IN = "Booking ini sudah check-in.";

/** Booking yang boleh di-check-in: sudah punya pasien dan statusnya masih aktif. */
async function checkableBooking(appointmentId: unknown): Promise<LoadedBooking & { patient: CheckablePatient }> {
  const booking = await loadBooking(appointmentId);
  if (!booking.patient) throw new UserFacingError("Cocokkan booking ini dengan data pasien lebih dulu.");
  if (booking.patient.mergedIntoId) throw new UserFacingError("Data pasien booking ini baru saja dipindah. Muat ulang halaman.");
  if (booking.status === "HADIR") throw new UserFacingError(ALREADY_CHECKED_IN);
  if (!ACTIVE_STATUSES.includes(booking.status)) throw await rejectedChangeError(booking.id, true);
  return { ...booking, patient: booking.patient };
}

function toForm(booking: LoadedBooking & { patient: CheckablePatient }): CheckInForm {
  const { patient } = booking;
  const time = (date: Date) => minutesToTimeLabel(witaMinutesOfDay(date));
  return {
    appointmentId: booking.id,
    code: booking.code,
    summary: [
      formatIndonesianDate(booking.startAt),
      `${time(booking.startAt)}–${time(booking.endAt)}`,
      bookingServiceName(booking),
      booking.staff.name,
    ].join(" · "),
    patient: {
      id: patient.id,
      name: patient.name,
      medicalRecordNumber: patient.medicalRecordNumber,
      nik: patient.nik,
      nikMissingReason: patient.nikMissingReason,
      birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
      gender: patient.gender,
      occupation: patient.occupation,
      address: patient.address,
      whatsapp: patient.whatsapp,
    },
    offerFoodRecallByDefault: shouldOfferFoodRecall({
      intakePurpose: booking.intake?.purpose ?? null,
      hasActivePackage: patient.activePackageId !== null,
    }),
  };
}

function findOwner(nik: string, excludePatientId: string) {
  return prisma.patient.findFirst({
    where: { nik, id: { not: excludePatientId } },
    select: { id: true, name: true, medicalRecordNumber: true, birthDate: true, whatsapp: true, lastVisitAt: true },
  });
}

/** Syarat pindah pasien rangkap (spec 3.3): tanpa NIK sendiri, kunjungan, maupun catatan klinis. */
async function mergeBlockReason(duplicateId: string): Promise<string | null> {
  const duplicate = await prisma.patient.findUniqueOrThrow({
    where: { id: duplicateId },
    select: {
      nik: true,
      allergies: true,
      medicalHistory: true,
      importantNotes: true,
      appointments: { where: { encounter: { isNot: null } }, select: { id: true }, take: 1 },
    },
  });
  if (duplicate.nik) return MERGE_BLOCKED_OWN_NIK;
  const hasClinical =
    duplicate.appointments.length > 0 ||
    Boolean(duplicate.allergies?.trim() || duplicate.medicalHistory?.trim() || duplicate.importantNotes?.trim());
  return hasClinical ? MERGE_BLOCKED_CLINICAL : null;
}

/** Isi dialog check-in (spec 3.1). */
export async function getCheckInForm(appointmentId: string): Promise<ActionResult<CheckInForm>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    return toForm(await checkableBooking(appointmentId));
  });
}

/** Pemilik lain NIK ini, atau null (spec 3.3). NIK boleh bertitik atau berspasi. */
export async function lookupNikOwner(input: { appointmentId: string; nik: string }): Promise<ActionResult<NikOwner | null>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const nik = normalizeNik(String(input?.nik ?? ""));
    if (!nik) throw new UserFacingError(NIK_FORMAT_ERROR);
    const booking = await checkableBooking(input?.appointmentId);
    const owner = await findOwner(nik, booking.patient.id);
    if (!owner) return null;
    const blocked = await mergeBlockReason(booking.patient.id);
    return {
      patientId: owner.id,
      name: owner.name,
      medicalRecordNumber: owner.medicalRecordNumber,
      birthDateLabel: formatDateColumn(owner.birthDate),
      whatsapp: owner.whatsapp,
      lastVisitLabel: owner.lastVisitAt ? formatIndonesianDate(owner.lastVisitAt) : null,
      merge: blocked ? { allowed: false, reason: blocked } : { allowed: true },
    };
  });
}

/**
 * "Ini orang yang sama — pindahkan" (spec 3.3): semua booking dan isian pasien
 * rangkap pindah ke pemilik NIK dalam satu transaksi, lalu pasien rangkap
 * ditandai. Data diri pasien rangkap tidak disalin.
 */
export async function mergeDuplicatePatient(input: { appointmentId: string; nik: string }): Promise<ActionResult<CheckInForm>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const nik = normalizeNik(String(input?.nik ?? ""));
    if (!nik) throw new UserFacingError(NIK_FORMAT_ERROR);
    const booking = await checkableBooking(input?.appointmentId);
    const duplicate = booking.patient;
    const owner = await findOwner(nik, duplicate.id);
    if (!owner) throw new UserFacingError("NIK ini tidak dimiliki pasien lain. Lanjutkan check-in.");
    const blocked = await mergeBlockReason(duplicate.id);
    if (blocked) throw new UserFacingError(blocked);

    const moved = await prisma.$transaction(async (tx) => {
      const appointments = await tx.appointment.updateMany({ where: { patientId: duplicate.id }, data: { patientId: owner.id } });
      const intakes = await tx.intake.updateMany({ where: { patientId: duplicate.id }, data: { patientId: owner.id } });
      await tx.patient.update({ where: { id: duplicate.id }, data: { mergedIntoId: owner.id } });
      return { appointments: appointments.count, intakes: intakes.count };
    });

    await recordAudit({
      actor,
      action: "patient.merge-duplicate",
      entity: "Patient",
      entityId: owner.id,
      summary: `${duplicate.medicalRecordNumber} → ${owner.medicalRecordNumber}: ${moved.appointments} booking, ${moved.intakes} isian`,
    });
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin/pasien");
    return toForm(await checkableBooking(booking.id));
  });
}

class StatusChanged extends Error {}

/**
 * Check-in (spec 3.1): data pasien, status Hadir + jam check-in, dan baris food
 * recall bila ditawarkan — dalam satu transaksi. Perpindahan status bersyarat:
 * dua resepsionis yang menekan bersamaan, hanya satu yang berhasil.
 */
export async function checkInAppointment(input: CheckInInput): Promise<ActionResult<CheckInResult>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const booking = await checkableBooking(input?.appointmentId);
    const { patient } = booking;

    // NIK wajib, kecuali "Belum ada NIK" beralasan; pasien tanpa NIK ditanya lagi setiap check-in (spec 3.2, 3.4).
    let nikData: { nik: string | null; nikMissingReason: NikMissingReasonValue | null } | null = null;
    const choice = input?.nik;
    if (choice?.kind === "KEEP") {
      if (!patient.nik) throw new UserFacingError(NIK_REQUIRED);
    } else if (choice?.kind === "SET") {
      const nik = normalizeNik(String(choice.value ?? ""));
      if (!nik) throw new UserFacingError(NIK_FORMAT_ERROR);
      const owner = await findOwner(nik, patient.id);
      if (owner) {
        throw new UserFacingError(
          `NIK ini sudah dipakai ${owner.name} (${owner.medicalRecordNumber}). Periksa lagi, atau pindahkan booking ke pasien itu.`,
        );
      }
      if (nik !== patient.nik) nikData = { nik, nikMissingReason: null };
    } else if (choice?.kind === "MISSING") {
      if (!isNikMissingReason(choice.reason)) throw new UserFacingError(NIK_REQUIRED);
      if (patient.nik) throw new UserFacingError("Pasien ini sudah punya NIK.");
      nikData = { nik: null, nikMissingReason: choice.reason };
    } else {
      throw new UserFacingError(NIK_REQUIRED);
    }

    const whatsapp = normalizeWhatsapp(String(input?.whatsapp ?? ""));
    if (!whatsapp) throw new UserFacingError("Nomor WhatsApp tidak sah. Contoh: 081234567890.");

    const checked = validateLinkIdentity(input?.identity ?? {}, missingIdentityFields(patient));
    if (!checked.ok) {
      throw new UserFacingError(checked.field ? IDENTITY_MESSAGE[checked.field] : "Data diri tidak sah. Muat ulang lalu coba lagi.");
    }
    const filled = checked.identity;

    const now = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.appointment.updateMany({
          where: { id: booking.id, status: { in: ACTIVE_STATUSES }, patientId: patient.id },
          data: { status: "HADIR", checkedInAt: now },
        });
        if (count === 0) throw new StatusChanged();
        await tx.patient.update({
          where: { id: patient.id },
          data: {
            whatsapp,
            ...(nikData ?? {}),
            ...(filled.birthDate ? { birthDate: new Date(`${filled.birthDate}T00:00:00Z`) } : {}),
            ...(filled.gender ? { gender: filled.gender } : {}),
            ...(filled.occupation ? { occupation: filled.occupation } : {}),
            ...(filled.address ? { address: filled.address } : {}),
          },
        });
        if (input.offerFoodRecall) {
          await tx.foodRecall.upsert({
            where: { appointmentId: booking.id },
            create: { appointmentId: booking.id, recallDate: new Date(`${recallDateFor(booking.startAt)}T00:00:00Z`) },
            update: {},
          });
        }
      });
    } catch (error) {
      if (error instanceof StatusChanged) {
        const current = await prisma.appointment.findUnique({ where: { id: booking.id }, select: { status: true } });
        throw current?.status === "HADIR" ? new UserFacingError(ALREADY_CHECKED_IN) : await rejectedChangeError(booking.id, true);
      }
      if (isUniqueViolation(error)) throw new UserFacingError(NIK_TAKEN_RACE);
      throw error;
    }

    await recordAudit({ actor, action: "appointment.check-in", entity: "Appointment", entityId: booking.id, summary: booking.code });
    if (nikData) {
      await recordAudit({
        actor,
        action: "patient.update-nik",
        entity: "Patient",
        entityId: patient.id,
        summary: `${patient.medicalRecordNumber}: ${
          nikData.nik ? maskNik(nikData.nik) : `belum ada NIK (${NIK_MISSING_REASONS[nikData.nikMissingReason!]})`
        }`,
      });
    }
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/pengingat");
    return {
      patientName: patient.name,
      foodRecall: input.offerFoodRecall ? foodRecallLinkInfo(await loadFoodRecallForAppointment(booking.id), now) : null,
    };
  });
}
```

- [ ] **Step 4: Sembunyikan pasien rangkap dan cari NIK**

Di `src/server/patient.ts`:

1. `listRecentPatients`: tambahkan `where: { mergedIntoId: null },` di `findMany`.
2. `countPatients`: ganti `return prisma.patient.count();` dengan `return prisma.patient.count({ where: { mergedIntoId: null } });`.
3. `findPatientsByWhatsapp`: ganti `where: { whatsapp: normalized }` dengan `where: { whatsapp: normalized, mergedIntoId: null }`.
4. `searchPatients`: ganti komentar fungsinya menjadi `/** Cocok terhadap nama (sebagian, tanpa peduli huruf besar/kecil), nomor WhatsApp, no. RM, atau NIK (≥ 6 angka). Pasien rangkap tidak ikut. */`. Tepat sebelum `const rows = await prisma.patient.findMany({`, tambahkan:

```ts
  // NIK lazim diketik berspasi atau bertitik seperti di KTP.
  const nikDigits = /^[\d\s.-]+$/.test(trimmed) ? trimmed.replace(/\D/g, "") : "";
  const nikMatch = nikDigits.length >= 6 ? [{ nik: { contains: nikDigits } }] : [];
```

   lalu ganti `where: {` di kueri itu menjadi `where: {\n      mergedIntoId: null,` dan tambahkan `...nikMatch,` setelah `...phoneVariants,`.

Di `src/server/intake.ts`:

1. `getMatchCandidates`: di `prisma.patient.findMany`, ganti `where: {\n        OR: [` menjadi `where: {\n        mergedIntoId: null,\n        OR: [`.
2. `matchPatient`: ubah `select: { id: true, medicalRecordNumber: true }` menjadi `select: { id: true, medicalRecordNumber: true, mergedIntoId: true }`, lalu tambahkan setelah `if (!patient) throw …`:

```ts
    if (patient.mergedIntoId) throw new UserFacingError("Pasien ini rangkap dari pasien lain. Pilih pasien lamanya.");
```

Run: `npm run test:integration -- tests/integration/check-in.test.ts`
Expected: PASS (10/10).

- [ ] **Step 5: Seluruh uji integrasi terkait, lint, tipe, commit**

Run: `npm run test:integration -- tests/integration/appointment.test.ts tests/integration/intake-matching.test.ts tests/integration/patient.test.ts tests/integration/check-in.test.ts > "$WS/t4-int.log" 2>&1; grep -E "Test Files|Tests " "$WS/t4-int.log"; npx eslint src/server/appointment-guard.ts src/server/check-in.ts src/server/appointment.ts src/server/patient.ts src/server/intake.ts; npx tsc --noEmit -p . > "$WS/t4-tsc.log" 2>&1; echo "tsc exit $?"; npx vitest run > "$WS/t4.log" 2>&1; grep -E "Test Files|Tests " "$WS/t4.log"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/server/appointment-guard.ts src/server/check-in.ts src/server/appointment.ts src/server/patient.ts src/server/intake.ts \
  tests/integration/check-in.test.ts
git commit -m "feat: check customers in with their NIK and missing details, and move bookings off a duplicate patient onto the NIK owner"
```

---
### Task 5: Dialog check-in dan food recall di daftar booking

**Files:**
- Create: `src/components/admin/nik-input.tsx`, `src/components/admin/food-recall-link-panel.tsx`, `src/components/admin/food-recall-dialog.tsx`, `src/components/admin/check-in-dialog.tsx`
- Modify:
  - `src/lib/booking-actions.ts`;
  - `src/components/admin/booking-dialogs.tsx`, `src/components/admin/appointment-table.tsx`;
  - `src/app/(admin)/admin/booking/page.tsx`;
  - `src/server/appointment.ts` (daftar booking membawa status food recall; `markAttended` dihapus).
- Test:
  - `tests/unit/components/check-in-dialog.test.tsx`, `tests/unit/components/food-recall-dialog.test.tsx`;
  - yang diubah: `tests/unit/components/appointment-table.test.tsx`, `tests/unit/booking-actions.test.ts`, `tests/integration/appointment.test.ts`, `tests/integration/intake-matching.test.ts`.

**Interfaces:**
- Consumes:
  - Task 1: `NIK_MISSING_REASONS`, `NIK_FORMAT_ERROR`, `normalizeNik`, `nikMismatchWarning`, `type NikMissingReasonValue`;
  - Task 2: `type FoodRecallLinkInfo`;
  - Task 3: `getFoodRecallLink`, `offerFoodRecall`;
  - Task 4: `getCheckInForm`, `lookupNikOwner`, `mergeDuplicatePatient`, `checkInAppointment`, `type CheckInForm`, `type CheckInNik`, `type NikOwner`.
- Produces:
  - `NikInput({ draft, onChange, warning? })` dan `type NikDraft = { mode: "NIK"; value: string } | { mode: "MISSING"; reason: NikMissingReasonValue | "" }`;
  - `FoodRecallLinkPanel({ info })`, untuk `info` selain `NOT_OFFERED`;
  - `FoodRecallDialog({ target, open, onOpenChange })` dan `CheckInDialog({ target, open, onOpenChange })`, dengan target `{ appointmentId: string; code: string; patientName: string }`;
  - `BookingDialogs.openCheckIn(target)`, `BookingDialogs.openFoodRecall(target)`;
  - `BookingRow.foodRecall: "DITAWARKAN" | "DIISI" | null`, `BookingRow.foodRecallAvailable: boolean`;
  - `BookingActionRow.foodRecallAvailable?: boolean`;
  - aksi `FOOD_RECALL` ("Food recall"); label `ATTEND` menjadi "Check-in".
  - `markAttended` tidak ada lagi. Check-in adalah satu-satunya jalan ke status Hadir.

- [ ] **Step 1: Tulis uji aksi dan dialog (gagal)**

Di `tests/unit/booking-actions.test.ts`, ganti `import { bookingRowActions, type BookingActionRow } from "@/lib/booking-actions";` dengan `import { BOOKING_ACTION_LABEL, bookingRowActions, type BookingActionRow } from "@/lib/booking-actions";`, lalu tambahkan di dalam `describe` yang ada:

```ts
  it("Hadir menjadi Check-in", () => {
    expect(BOOKING_ACTION_LABEL.ATTEND).toBe("Check-in");
    expect(BOOKING_ACTION_LABEL.FOOD_RECALL).toBe("Food recall");
  });

  it("customer yang sudah check-in hari ini: Food recall di menu, sebelum Lihat isian", () => {
    expect(bookingRowActions({ ...site, status: "HADIR", foodRecallAvailable: true }, true)).toEqual({
      primary: [],
      menu: ["FOOD_RECALL", "VIEW_INTAKE"],
    });
    expect(bookingRowActions({ ...site, status: "HADIR", foodRecallAvailable: false }, true)).toEqual({
      primary: [],
      menu: ["VIEW_INTAKE"],
    });
  });
```

Buat `tests/unit/components/check-in-dialog.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInDialog } from "@/components/admin/check-in-dialog";
import { checkInAppointment, getCheckInForm, lookupNikOwner, mergeDuplicatePatient, type CheckInForm } from "@/server/check-in";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/check-in", () => ({
  getCheckInForm: vi.fn(),
  lookupNikOwner: vi.fn(),
  mergeDuplicatePatient: vi.fn(),
  checkInAppointment: vi.fn(),
}));

const FORM: CheckInForm = {
  appointmentId: "a1",
  code: "SDY-CI01",
  summary: "Sabtu, 3 Oktober 2026 · 11.00–11.30 · Konsultasi Dokter · dr. Diane",
  patient: {
    id: "p1",
    name: "Siti Rahayu",
    medicalRecordNumber: "SDY-2026-0001",
    nik: null,
    nikMissingReason: null,
    birthDate: "1990-05-17",
    gender: null,
    occupation: null,
    address: "Jl. Garuda 10",
    whatsapp: "6281234567890",
  },
  offerFoodRecallByDefault: true,
};
const TARGET = { appointmentId: "a1", code: "SDY-CI01", patientName: "Siti Rahayu" };
const OPEN_LINK = {
  state: "OPEN" as const,
  filled: false,
  url: "https://sundyclinic.com/food-recall#kode",
  message: { text: "Halo", link: "https://wa.me/6281234567890?text=Halo" },
};

function renderDialog() {
  render(<CheckInDialog target={TARGET} open onOpenChange={vi.fn()} />);
  return screen.findByRole("dialog", { name: "Check-in — SDY-CI01" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCheckInForm).mockResolvedValue({ ok: true, data: FORM });
  vi.mocked(lookupNikOwner).mockResolvedValue({ ok: true, data: null });
  vi.mocked(checkInAppointment).mockResolvedValue({ ok: true, data: { patientName: "Siti Rahayu", foodRecall: OPEN_LINK } });
});

describe("CheckInDialog", () => {
  it("menampilkan hanya data diri yang masih kosong, dan NIK wajib", async () => {
    const user = userEvent.setup();
    const dialog = await renderDialog();
    expect(await within(dialog).findByText(FORM.summary)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Jenis kelamin")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Pekerjaan")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Tanggal lahir")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Alamat")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Nomor WhatsApp")).toHaveValue("6281234567890");
    expect(within(dialog).getByLabelText("Tawarkan food recall")).toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("NIK harus 16 angka.");
    expect(checkInAppointment).not.toHaveBeenCalled();
  });

  it("check-in dengan NIK: memeriksa pemiliknya dulu, lalu menampilkan link food recall", async () => {
    const user = userEvent.setup();
    const dialog = await renderDialog();
    await user.type(await within(dialog).findByLabelText("NIK (16 angka)"), "7171 0157 0590 0001");
    await user.selectOptions(within(dialog).getByLabelText("Jenis kelamin"), "P");
    await user.type(within(dialog).getByLabelText("Pekerjaan"), "Guru");
    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));

    await waitFor(() =>
      expect(checkInAppointment).toHaveBeenCalledWith({
        appointmentId: "a1",
        nik: { kind: "SET", value: "7171015705900001" },
        identity: { gender: "P", occupation: "Guru" },
        whatsapp: "6281234567890",
        offerFoodRecall: true,
      }),
    );
    expect(lookupNikOwner).toHaveBeenCalledWith({ appointmentId: "a1", nik: "7171015705900001" });
    expect(await within(dialog).findByRole("link", { name: "Buka di tablet" })).toHaveAttribute("href", OPEN_LINK.url);
  });

  it("memperingatkan bila jenis kelamin di NIK berbeda, tanpa menghalangi", async () => {
    const user = userEvent.setup();
    const dialog = await renderDialog();
    await user.selectOptions(await within(dialog).findByLabelText("Jenis kelamin"), "L");
    await user.type(within(dialog).getByLabelText("NIK (16 angka)"), "7171015705900001");
    expect(within(dialog).getByText("Jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.")).toBeInTheDocument();
  });

  it("Belum ada NIK mengirim alasannya", async () => {
    const user = userEvent.setup();
    vi.mocked(checkInAppointment).mockResolvedValue({ ok: true, data: { patientName: "Siti Rahayu", foodRecall: null } });
    const dialog = await renderDialog();
    await user.click(await within(dialog).findByLabelText("Belum ada NIK"));
    await user.selectOptions(within(dialog).getByLabelText("Alasan"), "LUPA_KTP");
    await user.selectOptions(within(dialog).getByLabelText("Jenis kelamin"), "P");
    await user.type(within(dialog).getByLabelText("Pekerjaan"), "Guru");
    await user.click(within(dialog).getByLabelText("Tawarkan food recall"));
    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));
    await waitFor(() =>
      expect(checkInAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ nik: { kind: "MISSING", reason: "LUPA_KTP" }, offerFoodRecall: false }),
      ),
    );
    expect(lookupNikOwner).not.toHaveBeenCalled();
  });

  it("NIK milik pasien lain: menawarkan pindah, lalu melanjutkan dengan data pasien lama", async () => {
    const user = userEvent.setup();
    vi.mocked(lookupNikOwner).mockResolvedValue({
      ok: true,
      data: {
        patientId: "p9",
        name: "Siti Lama",
        medicalRecordNumber: "SDY-2026-0009",
        birthDateLabel: "17/05/1990",
        whatsapp: "6281234567899",
        lastVisitLabel: "Senin, 7 September 2026",
        merge: { allowed: true },
      },
    });
    vi.mocked(mergeDuplicatePatient).mockResolvedValue({
      ok: true,
      data: {
        ...FORM,
        patient: { ...FORM.patient, id: "p9", name: "Siti Lama", medicalRecordNumber: "SDY-2026-0009", nik: "7171015705900001", gender: "P", occupation: "Guru" },
      },
    });
    const dialog = await renderDialog();
    await user.type(await within(dialog).findByLabelText("NIK (16 angka)"), "7171015705900001");
    await user.selectOptions(within(dialog).getByLabelText("Jenis kelamin"), "P");
    await user.type(within(dialog).getByLabelText("Pekerjaan"), "Guru");
    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));

    expect(await within(dialog).findByText("NIK ini sudah milik pasien lain")).toBeInTheDocument();
    expect(within(dialog).getByText("Siti Lama")).toBeInTheDocument();
    expect(checkInAppointment).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Ini orang yang sama — pindahkan" }));
    expect(mergeDuplicatePatient).toHaveBeenCalledWith({ appointmentId: "a1", nik: "7171015705900001" });
    expect(await within(dialog).findByText("NIK 7171015705900001")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));
    await waitFor(() => expect(checkInAppointment).toHaveBeenCalledWith(expect.objectContaining({ nik: { kind: "KEEP" }, identity: {} })));
  });

  it("pindah tidak ditawarkan bila pasien booking ini sudah punya catatan dokter", async () => {
    const user = userEvent.setup();
    vi.mocked(lookupNikOwner).mockResolvedValue({
      ok: true,
      data: {
        patientId: "p9",
        name: "Siti Lama",
        medicalRecordNumber: "SDY-2026-0009",
        birthDateLabel: null,
        whatsapp: "6281234567899",
        lastVisitLabel: null,
        merge: { allowed: false, reason: "Pasien ini sudah punya catatan dokter. Hubungi Super Admin untuk menggabungkan data." },
      },
    });
    const dialog = await renderDialog();
    await user.type(await within(dialog).findByLabelText("NIK (16 angka)"), "7171015705900001");
    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));
    expect(await within(dialog).findByText(/Hubungi Super Admin/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Ini orang yang sama — pindahkan" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Bukan — periksa lagi NIK-nya" }));
    expect(within(dialog).getByLabelText("NIK (16 angka)")).toHaveValue("7171015705900001");
  });

  it("menampilkan pesan bila booking tidak bisa di-check-in", async () => {
    vi.mocked(getCheckInForm).mockResolvedValue({ ok: false, error: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman." });
    const dialog = await renderDialog();
    expect(await within(dialog).findByText("Booking ini sudah berstatus dibatalkan. Muat ulang halaman.")).toBeInTheDocument();
  });
});
```

Buat `tests/unit/components/food-recall-dialog.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoodRecallDialog } from "@/components/admin/food-recall-dialog";
import { getFoodRecallLink, offerFoodRecall } from "@/server/food-recall-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/food-recall-admin", () => ({ getFoodRecallLink: vi.fn(), offerFoodRecall: vi.fn() }));

const TARGET = { appointmentId: "a1", code: "SDY-CI01", patientName: "Siti Rahayu" };
const OPEN_LINK = {
  state: "OPEN" as const,
  filled: true,
  url: "https://sundyclinic.com/food-recall#kode",
  message: { text: "Halo", link: "https://wa.me/6281234567890?text=Halo" },
};

function renderDialog() {
  render(<FoodRecallDialog target={TARGET} open onOpenChange={vi.fn()} />);
  return screen.findByRole("dialog", { name: "Food recall — SDY-CI01" });
}

beforeEach(() => vi.clearAllMocks());

describe("FoodRecallDialog", () => {
  it("menawarkan food recall yang belum ditawarkan saat check-in", async () => {
    const user = userEvent.setup();
    vi.mocked(getFoodRecallLink).mockResolvedValue({ ok: true, data: { state: "NOT_OFFERED" } });
    vi.mocked(offerFoodRecall).mockResolvedValue({ ok: true, data: { ...OPEN_LINK, filled: false } });
    const dialog = await renderDialog();
    await user.click(await within(dialog).findByRole("button", { name: "Tawarkan food recall" }));
    await waitFor(() => expect(offerFoodRecall).toHaveBeenCalledWith("a1"));
    expect(await within(dialog).findByRole("link", { name: "Buka di tablet" })).toHaveAttribute("href", OPEN_LINK.url);
    expect(within(dialog).getByText("Belum diisi.")).toBeInTheDocument();
  });

  it("link yang berlaku: status sudah diisi, buka di tablet, kirim lewat WA", async () => {
    vi.mocked(getFoodRecallLink).mockResolvedValue({ ok: true, data: OPEN_LINK });
    const dialog = await renderDialog();
    expect(await within(dialog).findByText("Sudah diisi — customer masih bisa mengirim ulang.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Kirim lewat WA" })).toHaveAttribute("href", OPEN_LINK.message.link);
  });

  it("food recall yang sudah diterima dokter tidak menawarkan link", async () => {
    vi.mocked(getFoodRecallLink).mockResolvedValue({ ok: true, data: { state: "RECEIVED", filled: true } });
    const dialog = await renderDialog();
    expect(await within(dialog).findByText("Food recall sudah diterima dokter.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Buka di tablet" })).not.toBeInTheDocument();
  });
});
```

Di `tests/unit/components/appointment-table.test.tsx`:
1. Di mock `@/server/appointment`, hapus baris `markAttended: vi.fn(),`.
2. Tambahkan mock berikut setelah mock `@/server/quiz-link-admin`:

```tsx
vi.mock("@/server/check-in", () => ({
  getCheckInForm: vi.fn().mockResolvedValue({ ok: false, error: "Memuat" }),
  lookupNikOwner: vi.fn(),
  mergeDuplicatePatient: vi.fn(),
  checkInAppointment: vi.fn(),
}));
vi.mock("@/server/food-recall-admin", () => ({
  getFoodRecallLink: vi.fn().mockResolvedValue({ ok: true, data: { state: "NOT_OFFERED" } }),
  offerFoodRecall: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
```

3. Di objek `base`, tambahkan `foodRecall: null,` dan `foodRecallAvailable: false,` setelah `needsFullIntake: false,`.
4. Ganti `"Hadir",` di daftar menu uji "booking WA menunggu" dengan `"Check-in",`, dan ganti `screen.getByRole("button", { name: "Hadir" })` dengan `screen.getByRole("button", { name: "Check-in" })`.
5. Tambahkan di akhir berkas:

```tsx
describe("AppointmentTable check-in dan food recall", () => {
  it("Check-in membuka dialog check-in untuk booking itu", async () => {
    const user = userEvent.setup();
    renderTable([{ ...base, status: "TERKONFIRMASI" }]);
    await user.click(screen.getByRole("button", { name: "Check-in" }));
    expect(await screen.findByRole("dialog", { name: "Check-in — SDY-8F3K" })).toBeInTheDocument();
  });

  it("menampilkan status food recall tanpa isinya, dan aksi Food recall di menu", async () => {
    const user = userEvent.setup();
    renderTable([{ ...base, status: "HADIR", foodRecall: "DITAWARKAN", foodRecallAvailable: true }]);
    expect(screen.getByText("Food recall: belum diisi")).toBeInTheDocument();
    await openMenu(user, "SDY-8F3K");
    await user.click(screen.getByRole("menuitem", { name: "Food recall" }));
    expect(await screen.findByRole("dialog", { name: "Food recall — SDY-8F3K" })).toBeInTheDocument();
  });

  it("food recall yang sudah diisi ditandai sudah diisi", () => {
    renderTable([{ ...base, status: "HADIR", foodRecall: "DIISI", foodRecallAvailable: true }]);
    expect(screen.getByText("Food recall: sudah diisi")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/booking-actions.test.ts tests/unit/components/check-in-dialog.test.tsx tests/unit/components/food-recall-dialog.test.tsx tests/unit/components/appointment-table.test.tsx`
Expected: FAIL, karena modul `@/components/admin/check-in-dialog` tidak ditemukan, `BOOKING_ACTION_LABEL.FOOD_RECALL` belum ada, dan "Check-in" tidak ditemukan.

- [ ] **Step 2: Aksi booking**

Di `src/lib/booking-actions.ts`:
1. Tambahkan `| "FOOD_RECALL"` di tipe `BookingAction`, tepat setelah `| "QUIZ_LINK"`.
2. Di `BOOKING_ACTION_LABEL`, ganti `ATTEND: "Hadir",` dengan `ATTEND: "Check-in",`, dan tambahkan `FOOD_RECALL: "Food recall",` setelah `QUIZ_LINK: "Link kuis",`.
3. Di tipe `BookingActionRow`, tambahkan:

```ts
  /** Customer sudah check-in hari ini dan catatan dokternya belum final (spec check-in 4.4). */
  foodRecallAvailable?: boolean;
```

4. Di `baseRowActions`, ganti baris terakhir `return { primary: [], menu: intake };` dengan:

```ts
  return { primary: [], menu: row.foodRecallAvailable ? ["FOOD_RECALL", ...intake] : intake };
```

- [ ] **Step 3: Kolom NIK dan panel link**

Buat `src/components/admin/nik-input.tsx`:

```tsx
"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NIK_MISSING_REASONS, type NikMissingReasonValue } from "@/lib/nik";

export type NikDraft = { mode: "NIK"; value: string } | { mode: "MISSING"; reason: NikMissingReasonValue | "" };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** NIK 16 angka, atau "Belum ada NIK" dengan alasan (spec check-in 3.2). Dipakai dialog check-in dan data pasien. */
export function NikInput({
  draft,
  onChange,
  warning,
}: {
  draft: NikDraft;
  onChange: (draft: NikDraft) => void;
  /** Peringatan kecocokan dengan tanggal lahir/jenis kelamin; tidak menghalangi. */
  warning?: string | null;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">NIK</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name={`${id}-mode`} checked={draft.mode === "NIK"} onChange={() => onChange({ mode: "NIK", value: "" })} />
          Isi NIK
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={draft.mode === "MISSING"}
            onChange={() => onChange({ mode: "MISSING", reason: "" })}
          />
          Belum ada NIK
        </label>
      </div>
      {draft.mode === "NIK" ? (
        <div className="space-y-1">
          <Label htmlFor={`${id}-nik`}>NIK (16 angka)</Label>
          <Input
            id={`${id}-nik`}
            inputMode="numeric"
            autoComplete="off"
            value={draft.value}
            onChange={(e) => onChange({ mode: "NIK", value: e.target.value })}
          />
          {warning && <p className="text-xs text-amber-700">{warning}</p>}
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor={`${id}-reason`}>Alasan</Label>
          <select
            id={`${id}-reason`}
            className={selectClass}
            value={draft.reason}
            onChange={(e) => onChange({ mode: "MISSING", reason: e.target.value as NikMissingReasonValue | "" })}
          >
            <option value="">Pilih alasan</option>
            {Object.entries(NIK_MISSING_REASONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
    </fieldset>
  );
}
```

Buat `src/components/admin/food-recall-link-panel.tsx`:

```tsx
"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FoodRecallLinkInfo } from "@/lib/food-recall";

type ShownInfo = Exclude<FoodRecallLinkInfo, { state: "NOT_OFFERED" }>;

/**
 * Link food recall (spec check-in 4.2): QR untuk HP customer, buka di tablet
 * klinik, kirim lewat WA, atau salin. QR dibuat di browser, jadi link tidak
 * dikirim ke layanan luar. Isi catatan tidak pernah ada di panel ini.
 */
export function FoodRecallLinkPanel({ info }: { info: ShownInfo }) {
  const url = info.state === "OPEN" ? info.url : null;
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let current = true;
    QRCode.toString(url, { type: "svg", margin: 1 })
      .then((svg) => {
        if (current) setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (current) setQr(null);
      });
    return () => {
      current = false;
    };
  }, [url]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin link secara manual.");
    }
  }

  if (info.state === "RECEIVED") return <p className="text-sm text-muted-foreground">Food recall sudah diterima dokter.</p>;
  if (info.state === "CLOSED") {
    return (
      <p className="text-sm text-muted-foreground">
        Link food recall tidak berlaku lagi: hanya bisa dibuka pada hari kunjungan selama customer berstatus hadir.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm">{info.filled ? "Sudah diisi — customer masih bisa mengirim ulang." : "Belum diisi."}</p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element -- data URI SVG buatan browser, bukan gambar dari server
        <img src={qr} alt="QR link food recall" className="mx-auto size-56 rounded-md border bg-white p-2" />
      )}
      <Button asChild variant="outline" className="w-full">
        <a href={info.url} target="_blank" rel="noopener noreferrer">
          Buka di tablet
        </a>
      </Button>
      {info.message.link ? (
        <Button asChild className="w-full bg-emerald-700 text-white hover:bg-emerald-800">
          <a href={info.message.link} target="_blank" rel="noopener noreferrer">
            Kirim lewat WA
          </a>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Nomor WhatsApp pasien tidak dikenali.</p>
      )}
      <Button type="button" variant="outline" className="w-full" onClick={() => void copy(info.url)}>
        Salin link
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Dialog food recall**

Buat `src/components/admin/food-recall-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FoodRecallLinkInfo } from "@/lib/food-recall";
import { getFoodRecallLink, offerFoodRecall } from "@/server/food-recall-admin";
import { FoodRecallLinkPanel } from "./food-recall-link-panel";

export type FoodRecallTarget = { appointmentId: string; code: string; patientName: string };

/** Aksi "Food recall" di baris booking (spec check-in 4.4): buka lagi link, atau tawarkan bila belum. */
export function FoodRecallDialog({
  target,
  open,
  onOpenChange,
}: {
  target: FoodRecallTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  // undefined = masih dimuat; null = gagal dimuat.
  const [info, setInfo] = useState<FoodRecallLinkInfo | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    getFoodRecallLink(target.appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          toast.error(result.error);
          setInfo(null);
          return;
        }
        setInfo(result.data);
      })
      .catch(() => {
        if (current) setInfo(null);
      });
    return () => {
      current = false;
    };
  }, [target.appointmentId]);

  function offer() {
    startTransition(async () => {
      try {
        const result = await offerFoodRecall(target.appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setInfo(result.data);
        router.refresh();
      } catch {
        toast.error("Gagal menawarkan food recall. Coba lagi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Food recall — {target.code}</DialogTitle>
          <DialogDescription>{target.patientName}</DialogDescription>
        </DialogHeader>
        {info === undefined ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : info === null ? (
          <p className="text-sm text-muted-foreground">Food recall gagal dimuat. Coba lagi.</p>
        ) : info.state === "NOT_OFFERED" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Food recall belum ditawarkan saat check-in.</p>
            <Button type="button" className="w-full" disabled={pending} onClick={offer}>
              Tawarkan food recall
            </Button>
          </div>
        ) : (
          <FoodRecallLinkPanel info={info} />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Dialog check-in**

Buat `src/components/admin/check-in-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FoodRecallLinkInfo } from "@/lib/food-recall";
import { NIK_FORMAT_ERROR, NIK_MISSING_REASONS, nikMismatchWarning, normalizeNik } from "@/lib/nik";
import {
  checkInAppointment,
  getCheckInForm,
  lookupNikOwner,
  mergeDuplicatePatient,
  type CheckInForm,
  type CheckInNik,
  type NikOwner,
} from "@/server/check-in";
import { FoodRecallLinkPanel } from "./food-recall-link-panel";
import { NikInput, type NikDraft } from "./nik-input";

export type CheckInTarget = { appointmentId: string; code: string; patientName: string };

type IdentityDraft = { birthDate: string; gender: "" | "L" | "P"; occupation: string; address: string };

type Draft = {
  /** false: NIK tersimpan dipakai apa adanya (tombol "Ubah" untuk menyunting). */
  nikEditing: boolean;
  nik: NikDraft;
  identity: IdentityDraft;
  whatsapp: string;
  offer: boolean;
};

type Step =
  | { kind: "form" }
  | { kind: "conflict"; owner: NikOwner; nik: string }
  | { kind: "done"; foodRecall: Exclude<FoodRecallLinkInfo, { state: "NOT_OFFERED" }> };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const textareaClass =
  "min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function draftFor(form: CheckInForm): Draft {
  return {
    nikEditing: form.patient.nik === null,
    nik: { mode: "NIK", value: form.patient.nik ?? "" },
    identity: { birthDate: "", gender: "", occupation: "", address: "" },
    whatsapp: form.patient.whatsapp,
    offer: form.offerFoodRecallByDefault,
  };
}

/** Kolom data diri yang masih kosong; hanya ini yang ditampilkan dan dikirim (spec check-in 3.1). */
function missingOf(patient: CheckInForm["patient"]) {
  return {
    birthDate: !patient.birthDate,
    gender: !patient.gender,
    occupation: !patient.occupation?.trim(),
    address: !patient.address?.trim(),
  };
}

/**
 * Check-in di meja depan (spec check-in bagian 3): NIK, data diri yang masih
 * kosong, nomor WA, lalu food recall. NIK yang sudah milik pasien lain
 * menampilkan pemiliknya dan pilihan pindah pasien rangkap.
 */
export function CheckInDialog({
  target,
  open,
  onOpenChange,
}: {
  target: CheckInTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const id = useId();
  // undefined = masih dimuat; null = tidak bisa di-check-in (pesannya di loadError).
  const [form, setForm] = useState<CheckInForm | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    getCheckInForm(target.appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          setLoadError(result.error);
          setForm(null);
          return;
        }
        setForm(result.data);
        setDraft(draftFor(result.data));
      })
      .catch(() => {
        if (!current) return;
        setLoadError("Data check-in gagal dimuat. Coba lagi.");
        setForm(null);
      });
    return () => {
      current = false;
    };
  }, [target.appointmentId]);

  const update = (patch: Partial<Draft>) => setDraft((value) => (value ? { ...value, ...patch } : value));
  const setIdentity = (patch: Partial<IdentityDraft>) =>
    setDraft((value) => (value ? { ...value, identity: { ...value.identity, ...patch } } : value));

  function nikChoice(current: Draft): CheckInNik | string {
    if (!current.nikEditing) return { kind: "KEEP" };
    if (current.nik.mode === "MISSING") {
      return current.nik.reason ? { kind: "MISSING", reason: current.nik.reason } : "Pilih alasan belum ada NIK.";
    }
    const value = normalizeNik(current.nik.value);
    return value ? { kind: "SET", value } : NIK_FORMAT_ERROR;
  }

  function identityPayload(current: Draft, patient: CheckInForm["patient"]) {
    const missing = missingOf(patient);
    return {
      ...(missing.birthDate ? { birthDate: current.identity.birthDate } : {}),
      ...(missing.gender && current.identity.gender ? { gender: current.identity.gender } : {}),
      ...(missing.occupation ? { occupation: current.identity.occupation } : {}),
      ...(missing.address ? { address: current.identity.address } : {}),
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form || !draft) return;
    const choice = nikChoice(draft);
    if (typeof choice === "string") {
      setError(choice);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (choice.kind === "SET" && choice.value !== form.patient.nik) {
          const lookup = await lookupNikOwner({ appointmentId: form.appointmentId, nik: choice.value });
          if (!lookup.ok) {
            setError(lookup.error);
            return;
          }
          if (lookup.data) {
            setStep({ kind: "conflict", owner: lookup.data, nik: choice.value });
            return;
          }
        }
        const result = await checkInAppointment({
          appointmentId: form.appointmentId,
          nik: choice,
          identity: identityPayload(draft, form.patient),
          whatsapp: draft.whatsapp,
          offerFoodRecall: draft.offer,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`${result.data.patientName} sudah check-in.`);
        router.refresh();
        const foodRecall = result.data.foodRecall;
        if (foodRecall && foodRecall.state !== "NOT_OFFERED") setStep({ kind: "done", foodRecall });
        else onOpenChange(false);
      } catch {
        setError("Check-in gagal. Coba lagi.");
      }
    });
  }

  function merge(nik: string) {
    startTransition(async () => {
      try {
        const result = await mergeDuplicatePatient({ appointmentId: target.appointmentId, nik });
        setStep({ kind: "form" });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setForm(result.data);
        setDraft((value) => ({ ...draftFor(result.data), offer: value?.offer ?? result.data.offerFoodRecallByDefault }));
        setError(null);
        toast.success(`Booking dipindah ke ${result.data.patient.name} (${result.data.patient.medicalRecordNumber}).`);
        router.refresh();
      } catch {
        setStep({ kind: "form" });
        setError("Gagal memindahkan. Coba lagi.");
      }
    });
  }

  const patient = form?.patient;
  const missing = patient ? missingOf(patient) : null;
  const typedNik = draft && draft.nikEditing && draft.nik.mode === "NIK" ? normalizeNik(draft.nik.value) : null;
  const warning =
    typedNik && patient && draft
      ? nikMismatchWarning(typedNik, {
          birthDate: patient.birthDate ?? (draft.identity.birthDate || null),
          gender: patient.gender ?? (draft.identity.gender || null),
        })
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check-in — {target.code}</DialogTitle>
          <DialogDescription>{form?.summary ?? target.patientName}</DialogDescription>
        </DialogHeader>

        {form === undefined && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {form === null && <p className="text-sm text-destructive">{loadError}</p>}

        {form && draft && patient && missing && step.kind === "conflict" && (
          <section aria-labelledby={`${id}-conflict`} className="space-y-3 text-sm">
            <h3 id={`${id}-conflict`} className="font-medium">
              NIK ini sudah milik pasien lain
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border p-3">
              <dt className="text-muted-foreground">Nama</dt>
              <dd>{step.owner.name}</dd>
              <dt className="text-muted-foreground">No. RM</dt>
              <dd>{step.owner.medicalRecordNumber}</dd>
              <dt className="text-muted-foreground">Tanggal lahir</dt>
              <dd>{step.owner.birthDateLabel ?? "—"}</dd>
              <dt className="text-muted-foreground">WhatsApp</dt>
              <dd>{step.owner.whatsapp}</dd>
              <dt className="text-muted-foreground">Kunjungan terakhir</dt>
              <dd>{step.owner.lastVisitLabel ?? "belum pernah"}</dd>
            </dl>
            {step.owner.merge.allowed ? (
              <p className="text-muted-foreground">
                Bila orangnya sama, semua booking dan isian {patient.name} ({patient.medicalRecordNumber}) dipindah ke pasien ini.
              </p>
            ) : (
              <p className="text-destructive">{step.owner.merge.reason}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {step.owner.merge.allowed && (
                <Button type="button" disabled={pending} onClick={() => merge(step.nik)}>
                  Ini orang yang sama — pindahkan
                </Button>
              )}
              <Button type="button" variant="outline" disabled={pending} onClick={() => setStep({ kind: "form" })}>
                Bukan — periksa lagi NIK-nya
              </Button>
            </div>
          </section>
        )}

        {form && step.kind === "done" && (
          <section aria-labelledby={`${id}-done`} className="space-y-3">
            <p className="text-sm">✓ {form.patient.name} sudah check-in.</p>
            <h3 id={`${id}-done`} className="text-sm font-medium">
              Food recall
            </h3>
            <FoodRecallLinkPanel info={step.foodRecall} />
            <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Selesai
            </Button>
          </section>
        )}

        {form && draft && patient && missing && step.kind === "form" && (
          <form onSubmit={submit} className="space-y-4 text-sm">
            <p>
              <span className="font-medium">{patient.name}</span>{" "}
              <span className="text-muted-foreground">{patient.medicalRecordNumber}</span>
            </p>

            {draft.nikEditing ? (
              <div className="space-y-1">
                {patient.nikMissingReason && (
                  <p className="text-xs text-amber-700">
                    Sebelumnya: belum ada NIK ({NIK_MISSING_REASONS[patient.nikMissingReason]}). Tanyakan lagi.
                  </p>
                )}
                <NikInput draft={draft.nik} onChange={(nik) => update({ nik })} warning={warning} />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span>NIK {patient.nik}</span>
                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => update({ nikEditing: true })}>
                  Ubah
                </Button>
              </div>
            )}

            {(missing.birthDate || missing.gender || missing.occupation || missing.address) && (
              <fieldset className="space-y-3">
                <legend className="font-medium">Data diri yang masih kosong</legend>
                {missing.birthDate && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-birth`}>Tanggal lahir</Label>
                    <Input
                      id={`${id}-birth`}
                      type="date"
                      value={draft.identity.birthDate}
                      onChange={(e) => setIdentity({ birthDate: e.target.value })}
                    />
                  </div>
                )}
                {missing.gender && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-gender`}>Jenis kelamin</Label>
                    <select
                      id={`${id}-gender`}
                      className={selectClass}
                      value={draft.identity.gender}
                      onChange={(e) => setIdentity({ gender: e.target.value as IdentityDraft["gender"] })}
                    >
                      <option value="">Pilih</option>
                      <option value="P">Perempuan</option>
                      <option value="L">Laki-laki</option>
                    </select>
                  </div>
                )}
                {missing.occupation && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-job`}>Pekerjaan</Label>
                    <Input
                      id={`${id}-job`}
                      maxLength={100}
                      value={draft.identity.occupation}
                      onChange={(e) => setIdentity({ occupation: e.target.value })}
                    />
                  </div>
                )}
                {missing.address && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-address`}>Alamat</Label>
                    <textarea
                      id={`${id}-address`}
                      rows={2}
                      maxLength={200}
                      value={draft.identity.address}
                      onChange={(e) => setIdentity({ address: e.target.value })}
                      className={textareaClass}
                    />
                  </div>
                )}
              </fieldset>
            )}

            <div className="space-y-1">
              <Label htmlFor={`${id}-wa`}>Nomor WhatsApp</Label>
              <Input id={`${id}-wa`} inputMode="tel" value={draft.whatsapp} onChange={(e) => update({ whatsapp: e.target.value })} />
              <p className="text-xs text-muted-foreground">Pastikan masih aktif untuk pengingat kontrol.</p>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.offer} onChange={(e) => update({ offer: e.target.checked })} />
              Tawarkan food recall
            </label>

            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              Check-in
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Pasang dialog di daftar booking**

Di `src/components/admin/booking-dialogs.tsx`:
1. Tambahkan import `import { CheckInDialog, type CheckInTarget } from "./check-in-dialog";` dan `import { FoodRecallDialog, type FoodRecallTarget } from "./food-recall-dialog";`.
2. Di tipe `BookingDialogs`, tambahkan:

```ts
  /** Dialog check-in (spec check-in bagian 3). */
  openCheckIn: (target: CheckInTarget) => void;
  /** Dialog "Food recall" (spec check-in 4.4). */
  openFoodRecall: (target: FoodRecallTarget) => void;
```

3. Di `BookingDialogsProvider`, tambahkan state `const [checkIn, setCheckIn] = useState<CheckInTarget | null>(null);` dan `const [foodRecall, setFoodRecall] = useState<FoodRecallTarget | null>(null);`, lalu `openCheckIn: setCheckIn,` dan `openFoodRecall: setFoodRecall,` di objek `useMemo`.
4. Tambahkan sebelum `</BookingDialogsContext.Provider>`:

```tsx
      {checkIn && (
        <CheckInDialog
          key={checkIn.appointmentId}
          target={checkIn}
          open
          onOpenChange={(open) => {
            if (!open) setCheckIn(null);
          }}
        />
      )}
      {foodRecall && (
        <FoodRecallDialog
          key={foodRecall.appointmentId}
          target={foodRecall}
          open
          onOpenChange={(open) => {
            if (!open) setFoodRecall(null);
          }}
        />
      )}
```

Di `src/components/admin/appointment-table.tsx`:
1. Hapus `markAttended,` dari import `@/server/appointment`.
2. Di tipe `BookingRow`, tambahkan setelah `needsFullIntake: boolean;`:

```ts
  /** Status food recall booking ini, tanpa isinya (spec check-in 4.4). */
  foodRecall: "DITAWARKAN" | "DIISI" | null;
  /** Aksi "Food recall" tersedia: sudah check-in hari ini dan catatan dokter belum final. */
  foodRecallAvailable: boolean;
```

3. Di `actionTarget`, ganti kasus `case "ATTEND":` dengan:

```tsx
      case "ATTEND":
        return {
          onSelect: () => dialogs.openCheckIn({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
      case "FOOD_RECALL":
        return {
          onSelect: () => dialogs.openFoodRecall({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
```

4. Di sel status, tambahkan setelah blok `{row.intakeStatus && (…)}`:

```tsx
                  {row.foodRecall && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Food recall: {row.foodRecall === "DIISI" ? "sudah diisi" : "belum diisi"}
                    </div>
                  )}
```

Di `src/server/appointment.ts`:
1. Hapus fungsi `markAttended`.
2. Di `BOOKING_LIST_INCLUDE`, tambahkan setelah `intake: { … },`:

```ts
  // Status food recall saja: isinya catatan klinis, dan daftar ini juga dibuka resepsionis.
  foodRecall: { select: { status: true } },
  encounter: { select: { status: true } },
```

Di `src/app/(admin)/admin/booking/page.tsx`, di `toRow`, tambahkan setelah `needsFullIntake: …,`:

```ts
    foodRecall: a.foodRecall?.status ?? null,
    foodRecallAvailable:
      a.status === "HADIR" && witaDateString(a.startAt) === witaDateString(context.now) && a.encounter?.status !== "FINAL",
```

Run: `npx vitest run tests/unit/booking-actions.test.ts tests/unit/components/check-in-dialog.test.tsx tests/unit/components/food-recall-dialog.test.tsx tests/unit/components/appointment-table.test.tsx`
Expected: PASS semua.

- [ ] **Step 7: Ganti markAttended di uji integrasi**

Di `tests/integration/appointment.test.ts`:
1. Hapus `markAttended,` dari import `@/server/appointment`, lalu tambahkan `import { checkInAppointment } from "@/server/check-in";`.
2. Tambahkan setelah `vi.mock("@/server/session", …);`:

```ts
/** Check-in tanpa NIK (alasan "Lupa membawa KTP"): yang diuji di sini perpindahan statusnya. */
function checkIn(id: string) {
  return checkInAppointment({
    appointmentId: id,
    nik: { kind: "MISSING", reason: "LUPA_KTP" },
    identity: { birthDate: "1990-05-17", gender: "P", occupation: "Guru", address: "Jl. Uji 1" },
    whatsapp: "081277770000",
    offerFoodRecall: false,
  });
}
```

3. Ganti setiap `markAttended(` dengan `checkIn(`. Di uji yang memeriksa `attended.status`, ganti:

```ts
    const attended = await unwrap(markAttended(appt.id));
    expect(attended.status).toBe("HADIR");
```

   dengan:

```ts
    await unwrap(checkIn(appt.id));
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("HADIR");
```

Di `tests/integration/intake-matching.test.ts`:
1. Hapus `markAttended,` dari import `@/server/appointment`, lalu tambahkan `import { checkInAppointment } from "@/server/check-in";`.
2. Ganti `expect(await markAttended(booking.id)).toEqual({ ok: false, error: message });` dengan:

```ts
    expect(
      await checkInAppointment({
        appointmentId: booking.id,
        nik: { kind: "MISSING", reason: "LUPA_KTP" },
        identity: {},
        whatsapp: "081234567890",
        offerFoodRecall: false,
      }),
    ).toEqual({ ok: false, error: message });
```

Run: `grep -rn "markAttended" src tests; npm run test:integration -- tests/integration/appointment.test.ts tests/integration/intake-matching.test.ts`
Expected: `grep` tidak mengeluarkan apa pun, dan kedua berkas PASS.

- [ ] **Step 8: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t5.log" 2>&1; grep -E "Test Files|Tests " "$WS/t5.log"; npx eslint src/components/admin src/lib/booking-actions.ts src/server/appointment.ts "src/app/(admin)/admin/booking/page.tsx"; npx tsc --noEmit -p . > "$WS/t5-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/components/admin/nik-input.tsx src/components/admin/food-recall-link-panel.tsx src/components/admin/food-recall-dialog.tsx \
  src/components/admin/check-in-dialog.tsx src/components/admin/booking-dialogs.tsx src/components/admin/appointment-table.tsx \
  src/lib/booking-actions.ts src/server/appointment.ts "src/app/(admin)/admin/booking/page.tsx" \
  tests/unit/booking-actions.test.ts tests/unit/components/check-in-dialog.test.tsx tests/unit/components/food-recall-dialog.test.tsx \
  tests/unit/components/appointment-table.test.tsx tests/integration/appointment.test.ts tests/integration/intake-matching.test.ts
git commit -m "feat: replace Hadir with a check-in dialog (NIK, missing details, WhatsApp, duplicate move) and add food recall status and links to the booking list"
```

---
### Task 6: Halaman `/food-recall` untuk customer

**Files:**
- Create: `src/app/(public)/food-recall/page.tsx`, `src/components/food-recall/food-recall-entry.tsx`, `src/components/food-recall/food-recall-form.tsx`
- Modify: `src/app/robots.ts`, `src/components/layout/header-shell.tsx`, `src/components/motion/smooth-scroll.tsx`
- Test:
  - baru: `tests/unit/components/food-recall-form.test.tsx`;
  - diubah: `tests/unit/robots.test.ts`, `tests/unit/components/site-header.test.tsx`, `tests/unit/components/motion/smooth-scroll.test.tsx`, `tests/unit/architecture.test.ts`.

**Interfaces:**
- Consumes:
  - Task 2: `FOOD_RECALL_CLOSED`, `FOOD_RECALL_RECEIVED`, `type FoodRecallPage`;
  - Task 3: `getFoodRecallPage`, `submitFoodRecall`;
  - sudah ada: `ActivityList` (`@/components/kuis/activity-list`), `type ActivityEntry` (`@/lib/kuis/v1/answers`).
- Produces:
  - `FoodRecallEntry()`: membaca kode dari `#` dan memuat halaman;
  - `FoodRecallForm({ code, page, onSubmitted })`;
  - rute `/food-recall` dengan `noindex` dan `Disallow`;
  - header krem sejak atas dan gulir asli di `/food-recall`.

- [ ] **Step 1: Tulis uji form customer (gagal)**

Buat `tests/unit/components/food-recall-form.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FoodRecallEntry } from "@/components/food-recall/food-recall-entry";
import { FOOD_RECALL_CLOSED, FOOD_RECALL_RECEIVED } from "@/lib/food-recall";
import { getFoodRecallPage, submitFoodRecall } from "@/server/food-recall-public";

vi.mock("@/server/food-recall-public", () => ({ getFoodRecallPage: vi.fn(), submitFoodRecall: vi.fn() }));

const OPEN = { state: "OPEN" as const, firstName: "Siti", recallDateLabel: "Jumat, 2 Oktober" };

function openWithCode(code: string) {
  window.history.replaceState(null, "", `/food-recall#${code}`);
  render(<FoodRecallEntry />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFoodRecallPage).mockResolvedValue({ ok: true, data: OPEN });
  vi.mocked(submitFoodRecall).mockResolvedValue({ ok: true, data: { state: "SUBMITTED" } });
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("halaman food recall customer", () => {
  it("membaca kode dari # dan menyapa dengan nama depan serta tanggal kemarin", async () => {
    openWithCode("kode-uji");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Apa saja yang Anda makan, minum, dan lakukan kemarin, Jumat, 2 Oktober?",
    );
    expect(screen.getByText("Halo Siti,")).toBeInTheDocument();
    expect(getFoodRecallPage).toHaveBeenCalledWith("kode-uji");
    expect(document.body.textContent).not.toMatch(/pasien|berobat/i);
  });

  it("Kirim baru aktif setelah ada catatan, lalu mengirim baris yang ditambahkan", async () => {
    const user = userEvent.setup();
    openWithCode("kode-uji");
    const send = await screen.findByRole("button", { name: "Kirim" });
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText("Isi catatan"), "Nasi kuning");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(send);

    await waitFor(() =>
      expect(submitFoodRecall).toHaveBeenCalledWith({
        code: "kode-uji",
        entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning" }],
        website: "",
      }),
    );
  });

  it("tablet bersama: layar terima kasih tanpa isian, Selesai membuang kode, tanpa simpanan di perangkat", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    openWithCode("kode-uji");
    await user.type(await screen.findByLabelText("Isi catatan"), "Nasi kuning");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));

    expect(await screen.findByText("Terima kasih, dokter akan melihatnya saat konsultasi.")).toBeInTheDocument();
    expect(screen.queryByText("Nasi kuning")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Selesai" }));
    expect(window.location.hash).toBe("");
    expect(screen.getByText("Buka link dari klinik untuk mengisi catatan ini.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Nasi kuning");
    expect(document.body.textContent).not.toContain("Siti");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("menampilkan pesan dari server bila kiriman ditolak", async () => {
    const user = userEvent.setup();
    vi.mocked(submitFoodRecall).mockResolvedValue({ ok: false, error: FOOD_RECALL_RECEIVED });
    openWithCode("kode-uji");
    await user.type(await screen.findByLabelText("Isi catatan"), "Teh manis");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FOOD_RECALL_RECEIVED);
  });

  it("link yang tidak berlaku atau sudah diterima dokter", async () => {
    vi.mocked(getFoodRecallPage).mockResolvedValueOnce({ ok: true, data: { state: "CLOSED" } });
    openWithCode("kode-lama");
    expect(await screen.findByText(FOOD_RECALL_CLOSED)).toBeInTheDocument();
  });

  it("food recall yang sudah diterima dokter", async () => {
    vi.mocked(getFoodRecallPage).mockResolvedValueOnce({ ok: true, data: { state: "RECEIVED" } });
    openWithCode("kode-diterima");
    expect(await screen.findByText(FOOD_RECALL_RECEIVED)).toBeInTheDocument();
  });

  it("tanpa kode: meminta link dari klinik tanpa memanggil server", () => {
    window.history.replaceState(null, "", "/food-recall");
    render(<FoodRecallEntry />);
    expect(screen.getByText("Buka link dari klinik untuk mengisi catatan ini.")).toBeInTheDocument();
    expect(getFoodRecallPage).not.toHaveBeenCalled();
  });
});
```

Ubah uji yang sudah ada:
- `tests/unit/robots.test.ts`: ganti `disallow: ["/admin", "/isi"]` dengan `disallow: ["/admin", "/isi", "/food-recall"]`, dan judul ujinya dengan `"menutup panel admin, link kuis, dan link food recall dari mesin pencari"`.
- `tests/unit/components/site-header.test.tsx`: tambahkan `expect(headerStartsSolid("/food-recall")).toBe(true);` setelah baris `"/isi"`.
- `tests/unit/components/motion/smooth-scroll.test.tsx`: tambahkan `expect(usesNativeScroll("/food-recall")).toBe(true);` setelah baris `"/isi/kode"`.
- `tests/unit/architecture.test.ts`: tambahkan `"src/components/food-recall",` di daftar `dirs` uji "kuis, pendaftaran, dan panel admin tidak memakai bahan gerak situs publik" (setelah `"src/components/pendaftaran",`) dan di daftar `dirs` uji "halaman publik tidak memakai kata pasien atau berobat" (setelah `"src/components/motion",`).

Run: `npx vitest run tests/unit/components/food-recall-form.test.tsx tests/unit/robots.test.ts tests/unit/components/site-header.test.tsx tests/unit/components/motion/smooth-scroll.test.tsx tests/unit/architecture.test.ts`
Expected: FAIL, karena `@/components/food-recall/food-recall-entry` tidak ditemukan, `/food-recall` belum ada di robots, dan header/gulir belum mengenalnya.

- [ ] **Step 2: Tulis form dan pembaca kode**

Buat `src/components/food-recall/food-recall-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { ActivityList } from "@/components/kuis/activity-list";
import { Button } from "@/components/ui/button";
import type { FoodRecallPage } from "@/lib/food-recall";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { submitFoodRecall } from "@/server/food-recall-public";

/**
 * Form food recall H-1 (spec check-in 4.3), seperti "Aktivitas kemarin" kuis v1.
 * Tanpa draf di perangkat: tablet klinik dipakai bergantian.
 */
export function FoodRecallForm({
  code,
  page,
  onSubmitted,
}: {
  code: string;
  page: Extract<FoodRecallPage, { state: "OPEN" }>;
  onSubmitted: () => void;
}) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitFoodRecall({ code, entries, website });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSubmitted();
      } catch {
        setError("Catatan gagal dikirim. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <p className="text-brown-700">Halo {page.firstName},</p>
        <h1 className="font-display text-3xl text-brown-900">
          Apa saja yang Anda makan, minum, dan lakukan kemarin, {page.recallDateLabel}?
        </h1>
        <p className="text-sm text-brown-700">
          Tambahkan satu per satu: jam, jenisnya, lalu isinya. Tulis yang benar-benar terjadi kemarin.
        </p>
      </div>

      <ActivityList entries={entries} onChange={setEntries} />

      {/* Kolom jebakan: tersembunyi dari manusia, diisi bot. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />

      <p className="text-xs text-brown-600">
        Catatan ini hanya dibaca dokter SunDY untuk konsultasi Anda.{" "}
        <Link href="/kebijakan-privasi" className="underline underline-offset-4">
          Kebijakan Privasi
        </Link>
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base" disabled={pending || entries.length === 0}>
        Kirim
      </Button>
    </form>
  );
}
```

Buat `src/components/food-recall/food-recall-entry.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FOOD_RECALL_CLOSED, FOOD_RECALL_RECEIVED, type FoodRecallPage } from "@/lib/food-recall";
import { getFoodRecallPage } from "@/server/food-recall-public";
import { FoodRecallForm } from "./food-recall-form";

type Loaded =
  | { kind: "EMPTY" }
  | { kind: "FAILED" }
  | { kind: "SUBMITTED" }
  | { kind: "PAGE"; code: string; page: FoodRecallPage };

const EMPTY_MESSAGE = "Buka link dari klinik untuk mengisi catatan ini.";

function codeFromHash(): string {
  return decodeURIComponent(window.location.hash.slice(1)).trim();
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
      <h1 className="font-display text-3xl text-brown-900">{title}</h1>
      <p className="text-brown-700">{text}</p>
    </div>
  );
}

/**
 * Halaman /food-recall (spec check-in 4.2–4.3). Kode ada di bagian "#" URL dan
 * hanya dibaca browser. Setelah Kirim, layar terima kasih tidak menampilkan
 * isian; Selesai membuang kode dari URL untuk customer berikutnya di tablet.
 */
export function FoodRecallEntry() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const code = codeFromHash();
    if (!code) {
      setLoaded({ kind: "EMPTY" });
      return;
    }
    let current = true;
    getFoodRecallPage(code)
      .then((result) => {
        if (current) setLoaded(result.ok ? { kind: "PAGE", code, page: result.data } : { kind: "FAILED" });
      })
      .catch(() => {
        if (current) setLoaded({ kind: "FAILED" });
      });
    return () => {
      current = false;
    };
  }, []);

  function finish() {
    window.history.replaceState(null, "", "/food-recall");
    setLoaded({ kind: "EMPTY" });
  }

  if (!loaded) return <p className="px-4 py-16 text-center text-brown-600">Memuat…</p>;
  if (loaded.kind === "EMPTY") return <Notice title="Catatan makan kemarin" text={EMPTY_MESSAGE} />;
  if (loaded.kind === "FAILED") {
    return <Notice title="Halaman gagal dimuat" text="Periksa koneksi lalu muat ulang halaman ini." />;
  }
  if (loaded.kind === "SUBMITTED") {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-brown-900">Terima kasih</h1>
        <p className="text-brown-700">Terima kasih, dokter akan melihatnya saat konsultasi.</p>
        <Button type="button" size="lg" className="h-12 w-full rounded-full text-base" onClick={finish}>
          Selesai
        </Button>
      </div>
    );
  }
  if (loaded.page.state === "CLOSED") return <Notice title="Link tidak berlaku" text={FOOD_RECALL_CLOSED} />;
  if (loaded.page.state === "RECEIVED") return <Notice title="Sudah diterima" text={FOOD_RECALL_RECEIVED} />;
  return <FoodRecallForm code={loaded.code} page={loaded.page} onSubmitted={() => setLoaded({ kind: "SUBMITTED" })} />;
}
```

Buat `src/app/(public)/food-recall/page.tsx`:

```tsx
import type { Metadata } from "next";
import { FoodRecallEntry } from "@/components/food-recall/food-recall-entry";

export const metadata: Metadata = {
  title: "Catatan Makan Kemarin",
  robots: { index: false, follow: false },
};

/** Halaman statis: kode ada di bagian "#" dan hanya dibaca browser (spec check-in 4.2). */
export default function FoodRecallPage() {
  return <FoodRecallEntry />;
}
```

- [ ] **Step 3: Robots, header, dan gulir**

- `src/app/robots.ts`:
  - ganti `disallow: ["/admin", "/isi"],` dengan `disallow: ["/admin", "/isi", "/food-recall"],`;
  - tambahkan baris komentar `// /food-recall: link food recall pribadi saat check-in (spec rekam medis bagian 2).` setelah komentar `/isi`.
- `src/components/layout/header-shell.tsx`: tambahkan `"/food-recall"` ke `SOLID_PATHS`, setelah `"/isi"`.
- `src/components/motion/smooth-scroll.tsx`:
  - tambahkan `"/food-recall"` ke `NATIVE_SCROLL_PATHS`, setelah `"/isi"`;
  - ubah komentar di atasnya menjadi `Alur kuis dan form food recall tidak diubah redesign ini, jadi tetap memakai gulir asli: setiap ganti langkah kuis menggulir sendiri ke atas, dan isiannya punya kolom teks yang bisa digulir.`

Run: `npx vitest run tests/unit/components/food-recall-form.test.tsx tests/unit/robots.test.ts tests/unit/components/site-header.test.tsx tests/unit/components/motion/smooth-scroll.test.tsx tests/unit/architecture.test.ts`
Expected: PASS semua.

- [ ] **Step 4: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t6.log" 2>&1; grep -E "Test Files|Tests " "$WS/t6.log"; npx eslint src/components/food-recall "src/app/(public)/food-recall" src/app/robots.ts src/components/layout/header-shell.tsx src/components/motion/smooth-scroll.tsx; npx tsc --noEmit -p . > "$WS/t6-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/components/food-recall "src/app/(public)/food-recall" src/app/robots.ts src/components/layout/header-shell.tsx \
  src/components/motion/smooth-scroll.tsx tests/unit/components/food-recall-form.test.tsx tests/unit/robots.test.ts \
  tests/unit/components/site-header.test.tsx tests/unit/components/motion/smooth-scroll.test.tsx tests/unit/architecture.test.ts
git commit -m "feat: add the /food-recall page where customers log yesterday's food, drinks, and activity on a tablet or phone"
```

---
### Task 7: Food recall di halaman kunjungan — tab, Salin ke S, dokter melengkapi

**Files:**
- Create: `src/components/admin/food-recall-table.tsx`, `src/components/admin/encounter-food-recall-tab.tsx`
- Modify:
  - `src/lib/food-recall.ts` (`foodRecallView`), `src/lib/encounter.ts` (tab konteks);
  - `src/server/encounter-read.ts` (`EncounterDetail.foodRecall`);
  - komponen: `src/components/admin/encounter-form.tsx`, `src/components/admin/encounter-workspace.tsx`, `src/components/admin/encounter-context-panel.tsx`.
- Test:
  - baru: `tests/unit/components/encounter-food-recall-tab.test.tsx`;
  - diubah: `tests/unit/food-recall.test.ts`, `tests/unit/encounter-trend.test.ts`, `tests/unit/components/encounter-form.test.tsx`, `tests/unit/components/encounter-page-view.test.tsx`, `tests/fixtures/encounter-detail.ts`.

**Interfaces:**
- Consumes:
  - Task 2: `foodRecallHeader`, `foodRecallSubjectiveText`, `appendToSubjective`, `foodRecallRows`, `parseStoredEntries`, `recallDateFor`, `recallDateLabel`, `type FoodRecallView`, `type FoodRecallEntry`;
  - Task 3: `saveFoodRecallByStaff`;
  - Task 5: `FoodRecallDialog`.
- Produces:
  - `type StoredFoodRecall` dan `foodRecallView(appointment: { id: string; startAt: Date }, row: StoredFoodRecall | null): FoodRecallView` di `src/lib/food-recall.ts`;
  - `ContextTab` mendapat `"foodRecall"`; `initialContextTab({ hasIntake, hasHistory, hasFilledFoodRecall? })`;
  - `EncounterDetail.foodRecall: FoodRecallView`; `FOOD_RECALL_SELECT` di `src/lib/food-recall.ts` (dipakai Task 8; tidak boleh di `encounter-read.ts` karena berkas `"use server"` hanya boleh mengekspor fungsi async);
  - `FoodRecallTable({ entries, label })`;
  - `EncounterFoodRecallTab({ foodRecall, appointmentCode, patientName, editable, copy? })` dan `type SubjectiveCopy = { has: (text: string) => boolean; append: (block: string) => boolean }`;
  - `type SubjectiveHandle = { text: () => string; append: (block: string) => boolean }` dan prop `EncounterFormProps.subjectiveRef?: Ref<SubjectiveHandle>`.

- [ ] **Step 1: Tulis uji (gagal)**

Tambahkan di akhir `tests/unit/food-recall.test.ts` (dan tambahkan `foodRecallView` ke import `@/lib/food-recall`):

```ts
describe("foodRecallView", () => {
  const appointment = { id: "a1", startAt: combineWitaDateAndMinutes("2026-10-03", 11 * 60) };
  const stored = {
    status: "DIISI" as const,
    recallDate: new Date("2026-10-02T00:00:00Z"),
    entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" }],
    submittedAt: new Date("2026-10-03T02:00:00Z"),
    completedAt: null,
    completedByName: null,
  };

  it("belum ditawarkan: tanggal H-1 tetap dihitung dari tanggal booking", () => {
    expect(foodRecallView(appointment, null)).toEqual({
      appointmentId: "a1",
      state: "NOT_OFFERED",
      recallDate: "2026-10-02",
      recallDateLabel: "Jumat, 2 Oktober",
      entries: [],
      submittedAt: null,
      completedAt: null,
      completedByName: null,
    });
  });

  it("ditawarkan tetapi belum diisi, dan sudah diisi", () => {
    expect(foodRecallView(appointment, { ...stored, status: "DITAWARKAN", entries: [] }).state).toBe("WAITING");
    expect(foodRecallView(appointment, stored)).toMatchObject({ state: "FILLED", entries: stored.entries });
  });
});
```

Tambahkan di `tests/unit/encounter-trend.test.ts`, di dalam `describe` yang memuat uji `initialContextTab`:

```ts
  it("food recall yang sudah diisi terbuka lebih dulu", () => {
    expect(initialContextTab({ hasIntake: true, hasHistory: true, hasFilledFoodRecall: true })).toBe("foodRecall");
    expect(initialContextTab({ hasIntake: true, hasHistory: true, hasFilledFoodRecall: false })).toBe("intake");
  });
```

Buat `tests/unit/components/encounter-food-recall-tab.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncounterFoodRecallTab, type SubjectiveCopy } from "@/components/admin/encounter-food-recall-tab";
import type { FoodRecallView } from "@/lib/food-recall";
import { saveFoodRecallByStaff } from "@/server/food-recall-admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/food-recall-admin", () => ({
  saveFoodRecallByStaff: vi.fn(),
  getFoodRecallLink: vi.fn().mockResolvedValue({ ok: true, data: { state: "NOT_OFFERED" } }),
  offerFoodRecall: vi.fn(),
}));

const FILLED: FoodRecallView = {
  appointmentId: "a1",
  state: "FILLED",
  recallDate: "2026-09-30",
  recallDateLabel: "Rabu, 30 September",
  entries: [
    { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" },
    { hour: 9, kind: "OLAHRAGA", text: "Senam", by: "DOKTER" },
  ],
  submittedAt: new Date("2026-10-01T02:30:00Z"),
  completedAt: new Date("2026-10-01T03:00:00Z"),
  completedByName: "dr. Diane",
};

function copyStub(has = false, append = true): SubjectiveCopy {
  return { has: vi.fn().mockReturnValue(has), append: vi.fn().mockReturnValue(append) };
}

function renderTab(props: Partial<Parameters<typeof EncounterFoodRecallTab>[0]> = {}) {
  return render(
    <EncounterFoodRecallTab foodRecall={FILLED} appointmentCode="SDY-8F3K" patientName="Siti Rahayu" editable copy={copyStub()} {...props} />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("EncounterFoodRecallTab", () => {
  it("menampilkan tabel per jam dengan tanda baris dokter", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Kemarin, Rabu, 30 September" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Food recall Rabu, 30 September" });
    expect(within(table).getByText("Nasi kuning")).toBeInTheDocument();
    expect(within(table).getByText("dilengkapi dokter")).toBeInTheDocument();
    expect(screen.getByText(/Dilengkapi dr\. Diane/)).toBeInTheDocument();
  });

  it("Salin ke S menambahkan ringkasan; salinan kedua meminta konfirmasi", async () => {
    const user = userEvent.setup();
    const copy = copyStub(false);
    const { unmount } = renderTab({ copy });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(copy.append).toHaveBeenCalledWith(
      "Food recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi kuning\n09.00 Olahraga — Senam",
    );
    expect(toast.success).toHaveBeenCalledWith("Food recall disalin ke S.");
    unmount();

    const again = copyStub(true);
    renderTab({ copy: again });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(again.append).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Salin lagi" }));
    expect(again.append).toHaveBeenCalledTimes(1);
  });

  it("tidak memotong S diam-diam bila akan melebihi batas", async () => {
    const user = userEvent.setup();
    renderTab({ copy: copyStub(false, false) });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(toast.error).toHaveBeenCalledWith("Kolom S akan melebihi 5.000 karakter. Ringkas S dulu, lalu salin lagi.");
  });

  it("catatan final: tabel saja, tanpa Salin ke S dan Lengkapi", () => {
    renderTab({ editable: false, copy: undefined });
    expect(screen.getByText("Nasi kuning")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salin ke S" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lengkapi" })).not.toBeInTheDocument();
  });

  it("Lengkapi: baris customer tetap, baris baru dikirim tanpa penanda lalu disimpan", async () => {
    const user = userEvent.setup();
    vi.mocked(saveFoodRecallByStaff).mockResolvedValue({ ok: true, data: undefined });
    renderTab({ foodRecall: { ...FILLED, entries: [FILLED.entries[0]] } });
    await user.click(screen.getByRole("button", { name: "Lengkapi" }));
    await user.type(screen.getByLabelText("Isi catatan"), "Teh tawar");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: "Simpan food recall" }));
    await waitFor(() =>
      expect(saveFoodRecallByStaff).toHaveBeenCalledWith({
        appointmentId: "a1",
        entries: [FILLED.entries[0], { hour: 7, kind: "MAKAN_MINUM", text: "Teh tawar" }],
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("belum diisi: pesan, buka QR dan link, atau isi sendiri", async () => {
    const user = userEvent.setup();
    renderTab({ foodRecall: { ...FILLED, state: "WAITING", entries: [], submittedAt: null, completedAt: null } });
    expect(screen.getByText("Customer belum mengisi food recall.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Isi sendiri" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Buka QR dan link" }));
    expect(await screen.findByRole("dialog", { name: "Food recall — SDY-8F3K" })).toBeInTheDocument();
  });

  it("tidak ditawarkan saat check-in: bisa ditawarkan sekarang", () => {
    renderTab({ foodRecall: { ...FILLED, state: "NOT_OFFERED", entries: [], submittedAt: null, completedAt: null } });
    expect(screen.getByText("Food recall tidak ditawarkan saat check-in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tawarkan sekarang" })).toBeInTheDocument();
  });
});
```

Tambahkan di akhir `tests/unit/components/encounter-form.test.tsx` (dan tambahkan `createRef` ke import dari `"react"`, `act` ke import dari `"@testing-library/react"`, serta `type SubjectiveHandle` ke import dari `"@/components/admin/encounter-form"`):

```tsx
describe("EncounterForm: menambah ke S dari tab food recall", () => {
  it("menambahkan di akhir S dan menolak bila melebihi 5.000 karakter", () => {
    const ref = createRef<SubjectiveHandle>();
    renderForm({ initialDraft: { ...emptyDraftInput(), subjective: "BB naik" }, subjectiveRef: ref });
    const field = screen.getByLabelText("Keluhan dan anamnesis dokter");

    let accepted = false;
    act(() => {
      accepted = ref.current!.append("Food recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi");
    });
    expect(accepted).toBe(true);
    expect(field).toHaveValue("BB naik\n\nFood recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi");
    expect(ref.current!.text()).toContain("Food recall H-1 (Rabu, 30 Sep)");

    act(() => {
      accepted = ref.current!.append("x".repeat(5000));
    });
    expect(accepted).toBe(false);
    expect(field).toHaveValue("BB naik\n\nFood recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi");
  });
});
```

Di `tests/unit/components/encounter-page-view.test.tsx`:
1. Tambahkan mock setelah mock `@/server/intake`:

```tsx
vi.mock("@/server/food-recall-admin", () => ({
  saveFoodRecallByStaff: vi.fn(),
  getFoodRecallLink: vi.fn(),
  offerFoodRecall: vi.fn(),
}));
```

2. Tambahkan di akhir `describe("EncounterPageView", …)`:

```tsx
  it("food recall yang sudah diisi terbuka lebih dulu, dan Salin ke S menambahkannya ke kolom S", async () => {
    const user = userEvent.setup();
    const encounter = encounterDetail({
      draft: { ...emptyDraftInput(), subjective: "BB naik 1 kg" },
      foodRecall: {
        appointmentId: "a1",
        state: "FILLED",
        recallDate: "2026-09-30",
        recallDateLabel: "Rabu, 30 September",
        entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" }],
        submittedAt: new Date("2026-10-01T02:30:00Z"),
        completedAt: null,
        completedByName: null,
      },
    });
    render(<EncounterPageView encounter={encounter} canWrite />);
    expect(screen.getByRole("tab", { name: "Food recall" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(screen.getByLabelText("Keluhan dan anamnesis dokter")).toHaveValue(
      "BB naik 1 kg\n\nFood recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi kuning",
    );
  });
```

Di `tests/fixtures/encounter-detail.ts`, tambahkan di objek `encounterDetail` (sebelum `...patch`):

```ts
    foodRecall: {
      appointmentId: "a1",
      state: "NOT_OFFERED",
      recallDate: "2026-09-30",
      recallDateLabel: "Rabu, 30 September",
      entries: [],
      submittedAt: null,
      completedAt: null,
      completedByName: null,
    },
```

Run: `npx vitest run tests/unit/food-recall.test.ts tests/unit/encounter-trend.test.ts tests/unit/components/encounter-food-recall-tab.test.tsx tests/unit/components/encounter-form.test.tsx tests/unit/components/encounter-page-view.test.tsx`
Expected: FAIL, karena `foodRecallView` belum ada, `"foodRecall"` belum menjadi tab, `encounter-food-recall-tab` tidak ditemukan, dan `subjectiveRef` belum didukung.

- [ ] **Step 2: Tampilan food recall untuk kunjungan dan tab konteks**

Tambahkan di akhir `src/lib/food-recall.ts`:

```ts
/** Baris food recall tersimpan, seperti dibaca halaman kunjungan. */
export type StoredFoodRecall = {
  status: "DITAWARKAN" | "DIISI";
  recallDate: Date;
  entries: unknown;
  submittedAt: Date | null;
  completedAt: Date | null;
  completedByName: string | null;
};

/** Food recall sebuah kunjungan; tanpa baris pun tanggal H-1 dihitung dari tanggal booking. */
export function foodRecallView(appointment: { id: string; startAt: Date }, row: StoredFoodRecall | null): FoodRecallView {
  const recallDate = row ? row.recallDate.toISOString().slice(0, 10) : recallDateFor(appointment.startAt);
  return {
    appointmentId: appointment.id,
    state: !row ? "NOT_OFFERED" : row.status === "DIISI" ? "FILLED" : "WAITING",
    recallDate,
    recallDateLabel: recallDateLabel(recallDate),
    entries: row ? parseStoredEntries(row.entries) : [],
    submittedAt: row?.submittedAt ?? null,
    completedAt: row?.completedAt ?? null,
    completedByName: row?.completedByName ?? null,
  };
}
```

Di `src/lib/encounter.ts`, ganti tipe `ContextTab` dan fungsi `initialContextTab` dengan:

```ts
export type ContextTab = "intake" | "foodRecall" | "previous" | "trend";

/**
 * Tab yang terbuka pertama kali di kolom kiri (spec UI B keputusan U5). Food
 * recall yang sudah diisi pada catatan draf terbuka lebih dulu (spec check-in 5.1).
 */
export function initialContextTab(input: { hasIntake: boolean; hasHistory: boolean; hasFilledFoodRecall?: boolean }): ContextTab {
  if (input.hasFilledFoodRecall) return "foodRecall";
  if (input.hasIntake) return "intake";
  return input.hasHistory ? "previous" : "trend";
}
```

Tambahkan juga di akhir `src/lib/food-recall.ts`:

```ts
/** Kolom food recall yang dibaca halaman record:read (kunjungan, riwayat, data pasien). */
export const FOOD_RECALL_SELECT = {
  status: true,
  recallDate: true,
  entries: true,
  submittedAt: true,
  completedAt: true,
  completedByName: true,
} as const;
```

Di `src/server/encounter-read.ts`:
1. Tambahkan import `import { FOOD_RECALL_SELECT, foodRecallView, type FoodRecallView } from "@/lib/food-recall";`.
2. Di tipe `EncounterDetail`, tambahkan `/** Food recall H-1 booking ini (spec check-in bagian 5). */ foodRecall: FoodRecallView;` setelah `approval: …;`.
3. Di `getEncounterForStaff`, tambahkan `foodRecall: { select: FOOD_RECALL_SELECT },` di dalam `appointment: { select: { … } }`, setelah baris `intake: …`.
4. Di objek yang dikembalikan `getEncounterForStaff`, tambahkan `foodRecall: foodRecallView(appointment, appointment.foodRecall),`.

- [ ] **Step 3: Tabel dan tab food recall**

Buat `src/components/admin/food-recall-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { foodRecallRows, type FoodRecallEntry } from "@/lib/food-recall";

/** Tabel 06.00–22.00 (spec check-in 5.1); jam kosong disembunyikan sampai diminta. */
export function FoodRecallTable({ entries, label }: { entries: readonly FoodRecallEntry[]; label: string }) {
  const [showAll, setShowAll] = useState(false);
  const rows = foodRecallRows(entries).filter((row) => showAll || row.entries.length > 0);
  return (
    <div className="space-y-2">
      <table aria-label={label} className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="w-16 py-1">Jam</th>
            <th className="py-1">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.hour} className="border-b align-top">
              <td className="py-1 tabular-nums text-muted-foreground">{row.label}</td>
              <td className="py-1">
                {row.entries.map((entry, index) => (
                  <span key={index} className="mr-2 inline-block">
                    <span className="text-muted-foreground">{entry.kindLabel}:</span> {entry.text}
                    {entry.byDoctor && (
                      <span className="ml-1 rounded bg-sky-50 px-1 text-xs text-sky-800">dilengkapi dokter</span>
                    )}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-4"
        onClick={() => setShowAll((value) => !value)}
      >
        {showAll ? "Sembunyikan jam kosong" : "Tampilkan 06.00–22.00"}
      </button>
    </div>
  );
}
```

Buat `src/components/admin/encounter-food-recall-tab.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ActivityList } from "@/components/kuis/activity-list";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { foodRecallHeader, foodRecallSubjectiveText, type FoodRecallAuthor, type FoodRecallView } from "@/lib/food-recall";
import { formatShortIndonesianDate } from "@/lib/format";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { saveFoodRecallByStaff } from "@/server/food-recall-admin";
import { FoodRecallDialog } from "./food-recall-dialog";
import { FoodRecallTable } from "./food-recall-table";

/** Jalan ke kolom S formulir kunjungan (spec check-in 5.2). Tidak ada saat catatan final atau hanya-baca. */
export type SubjectiveCopy = { has: (text: string) => boolean; append: (block: string) => boolean };

/** Baris di penyunting: baris lama membawa penandanya, tambahan dokter belum (server menandainya DOKTER). */
type EditableEntry = ActivityEntry & { by?: FoodRecallAuthor };

const at = (date: Date) => `${formatShortIndonesianDate(date)} ${minutesToTimeLabel(witaMinutesOfDay(date))}`;

/** Tab "Food recall" halaman kunjungan (spec check-in bagian 5). */
export function EncounterFoodRecallTab({
  foodRecall,
  appointmentCode,
  patientName,
  editable,
  copy,
}: {
  foodRecall: FoodRecallView;
  appointmentCode: string;
  patientName: string;
  /** Catatan masih draf dan staf memegang record:write. */
  editable: boolean;
  copy?: SubjectiveCopy;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [entries, setEntries] = useState<EditableEntry[]>(foodRecall.entries);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function doCopy() {
    setConfirmCopy(false);
    if (!copy) return;
    if (copy.append(foodRecallSubjectiveText(foodRecall.recallDate, foodRecall.entries))) {
      toast.success("Food recall disalin ke S.");
    } else {
      toast.error("Kolom S akan melebihi 5.000 karakter. Ringkas S dulu, lalu salin lagi.");
    }
  }

  function requestCopy() {
    if (copy?.has(foodRecallHeader(foodRecall.recallDate))) setConfirmCopy(true);
    else doCopy();
  }

  function startEditing() {
    setEntries(foodRecall.entries);
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      try {
        const result = await saveFoodRecallByStaff({ appointmentId: foodRecall.appointmentId, entries });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Food recall disimpan.");
        setEditing(false);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan food recall. Coba lagi.");
      }
    });
  }

  const meta = [
    foodRecall.submittedAt && `Dikirim customer ${at(foodRecall.submittedAt)}`,
    foodRecall.completedAt && `Dilengkapi ${foodRecall.completedByName ?? "dokter"} ${at(foodRecall.completedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-base font-medium">Kemarin, {foodRecall.recallDateLabel}</h3>

      {editing ? (
        <div className="space-y-3">
          <ActivityList entries={entries} onChange={setEntries} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={pending || entries.length === 0}>
              Simpan food recall
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
              Batal
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Setelah disimpan, link customer ditutup supaya catatan ini tidak tertimpa.</p>
        </div>
      ) : foodRecall.state === "FILLED" ? (
        <>
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
          <FoodRecallTable entries={foodRecall.entries} label={`Food recall ${foodRecall.recallDateLabel}`} />
          <div className="flex flex-wrap gap-2">
            {copy && (
              <Button size="sm" onClick={requestCopy}>
                Salin ke S
              </Button>
            )}
            {editable && (
              <Button size="sm" variant="outline" onClick={startEditing}>
                Lengkapi
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            {foodRecall.state === "WAITING" ? "Customer belum mengisi food recall." : "Food recall tidak ditawarkan saat check-in."}
          </p>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                {foodRecall.state === "WAITING" ? "Buka QR dan link" : "Tawarkan sekarang"}
              </Button>
              <Button size="sm" variant="outline" onClick={startEditing}>
                Isi sendiri
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={confirmCopy} onOpenChange={setConfirmCopy}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salin food recall lagi?</AlertDialogTitle>
            <AlertDialogDescription>Kolom S sudah memuat food recall ini.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={doCopy}>Salin lagi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {linkOpen && (
        <FoodRecallDialog
          target={{ appointmentId: foodRecall.appointmentId, code: appointmentCode, patientName }}
          open
          onOpenChange={(open) => {
            if (!open) {
              setLinkOpen(false);
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Sambungkan ke formulir dan kolom kiri**

Di `src/components/admin/encounter-form.tsx`:
1. Ubah import `react` menjadi `import { useId, useImperativeHandle, useState, useTransition, type Ref } from "react";`, lalu tambahkan `import { appendToSubjective } from "@/lib/food-recall";`.
2. Tambahkan sebelum `export type EncounterFormProps`:

```ts
/** Pegangan kolom S untuk tab food recall (spec check-in 5.2). */
export type SubjectiveHandle = { text: () => string; append: (block: string) => boolean };
```

3. Tambahkan di `EncounterFormProps`:

```ts
  /** Tab food recall menambahkan ringkasan ke S lewat pegangan ini. */
  subjectiveRef?: Ref<SubjectiveHandle>;
```

4. Tambahkan di `EncounterForm`, tepat setelah fungsi `setText`:

```ts
  // Tanpa daftar dependensi: pegangan selalu membaca draf terbaru.
  useImperativeHandle(props.subjectiveRef, () => ({
    text: () => draft.subjective,
    append: (block: string) => {
      const next = appendToSubjective(draft.subjective, block);
      if (next.length > ENCOUNTER_TEXT_MAX) return false;
      update({ ...draft, subjective: next });
      return true;
    },
  }));
```

Di `src/components/admin/encounter-context-panel.tsx`:
1. Tambahkan import `import { EncounterFoodRecallTab, type SubjectiveCopy } from "./encounter-food-recall-tab";`.
2. Ganti `TABS` dengan:

```ts
const TABS: { key: ContextTab; label: string }[] = [
  { key: "intake", label: "Isian kuis" },
  { key: "foodRecall", label: "Food recall" },
  { key: "previous", label: "Sebelumnya" },
  { key: "trend", label: "Tren" },
];
```

3. Tambahkan dua prop ke `EncounterContextPanel`:

```ts
  /** Catatan masih draf dan staf memegang record:write. */
  canEditFoodRecall?: boolean;
  /** Jalan ke kolom S (hanya saat formulir draf terbuka). */
  copyToSubjective?: SubjectiveCopy;
```

4. Ganti pemanggilan `initialContextTab({ … })` dengan:

```ts
    initialContextTab({
      hasIntake: encounter.intake !== null,
      hasHistory: encounter.history.length > 0,
      hasFilledFoodRecall: encounter.foodRecall.state === "FILLED" && encounter.status === "DRAF",
    }),
```

5. Tambahkan di dalam panel tab, setelah baris `{item.key === "intake" && …}`:

```tsx
            {item.key === "foodRecall" && (
              <EncounterFoodRecallTab
                foodRecall={encounter.foodRecall}
                appointmentCode={encounter.appointment.code}
                patientName={encounter.patient.name}
                editable={canEditFoodRecall ?? false}
                copy={copyToSubjective}
              />
            )}
```

6. Ganti komentar "Ketiga panel tetap terpasang…" menjadi "Semua panel tetap terpasang…".

Di `src/components/admin/encounter-workspace.tsx`:
1. Ubah import `react` menjadi `import { useRef, useState } from "react";`, ubah `import { EncounterForm } from "./encounter-form";` menjadi `import { EncounterForm, type SubjectiveHandle } from "./encounter-form";`, dan tambahkan `import type { SubjectiveCopy } from "./encounter-food-recall-tab";`.
2. Tambahkan setelah `const weightHistory = …;`:

```ts
  const subjectiveRef = useRef<SubjectiveHandle>(null);
  const copyToSubjective: SubjectiveCopy | undefined = editable
    ? {
        has: (text) => subjectiveRef.current?.text().includes(text) ?? false,
        append: (block) => subjectiveRef.current?.append(block) ?? false,
      }
    : undefined;
```

3. Ganti `<EncounterContextPanel encounter={encounter} currentVitals={…} />` dengan:

```tsx
        <EncounterContextPanel
          encounter={encounter}
          currentVitals={editable ? currentVitals : encounter.vitals}
          canEditFoodRecall={editable}
          copyToSubjective={copyToSubjective}
        />
```

4. Tambahkan `subjectiveRef={subjectiveRef}` di props `<EncounterForm … />`.

Run: `npx vitest run tests/unit/food-recall.test.ts tests/unit/encounter-trend.test.ts tests/unit/components/encounter-food-recall-tab.test.tsx tests/unit/components/encounter-form.test.tsx tests/unit/components/encounter-page-view.test.tsx`
Expected: PASS semua.

- [ ] **Step 5: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t7.log" 2>&1; grep -E "Test Files|Tests " "$WS/t7.log"; npx eslint src/components/admin src/lib/food-recall.ts src/lib/encounter.ts src/server/encounter-read.ts; npx tsc --noEmit -p . > "$WS/t7-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/lib/food-recall.ts src/lib/encounter.ts src/server/encounter-read.ts src/components/admin/food-recall-table.tsx \
  src/components/admin/encounter-food-recall-tab.tsx src/components/admin/encounter-form.tsx src/components/admin/encounter-workspace.tsx \
  src/components/admin/encounter-context-panel.tsx tests/unit/food-recall.test.ts tests/unit/encounter-trend.test.ts \
  tests/unit/components/encounter-food-recall-tab.test.tsx tests/unit/components/encounter-form.test.tsx \
  tests/unit/components/encounter-page-view.test.tsx tests/fixtures/encounter-detail.ts
git commit -m "feat: show the food recall on the visit page with copy-to-S, let the doctor complete it, and open that tab first when it is filled"
```

---
### Task 8: Riwayat dan data pasien — NIK, pasien rangkap, food recall sebelumnya, daftar dokter

**Files:**
- Create: `src/components/admin/nik-form.tsx`
- Modify:
  - server: `src/server/patient.ts` (`PatientDetail` + `updatePatientNik`), `src/server/encounter-read.ts` (riwayat dan daftar dokter);
  - komponen: `src/components/admin/patient-detail-view.tsx`, `src/components/admin/previous-visits-tab.tsx`, `src/components/admin/doctor-worklist.tsx`.
- Test:
  - baru: `tests/unit/components/nik-form.test.tsx`, `tests/integration/patient-nik.test.ts`;
  - diubah: `tests/unit/components/patient-detail-view.test.tsx`, `tests/unit/components/doctor-worklist.test.tsx`, `tests/unit/components/encounter-page-view.test.tsx`, `tests/fixtures/encounter-detail.ts`.

**Interfaces:**
- Consumes:
  - Task 1: `normalizeNik`, `isNikMissingReason`, `maskNik`, `NIK_FORMAT_ERROR`, `NIK_MISSING_REASONS`;
  - Task 5: `NikInput`, `type NikDraft`;
  - Task 7: `FOOD_RECALL_SELECT`, `foodRecallView`, `type FoodRecallView`, `FoodRecallTable`.
- Produces:
  - `EncounterHistoryItem.foodRecall: FoodRecallView | null`; `WorklistRow.foodRecallFilled: boolean`;
  - `PatientDetail.nik: string | null`, `PatientDetail.nikMissingReason: NikMissingReasonValue | null`, `PatientDetail.mergedInto: { id: string; medicalRecordNumber: string; name: string } | null`, `PatientDetail.encounters[].foodRecall: FoodRecallView | null`;
  - `updatePatientNik(input: { patientId: string; nik: string | null; missingReason: string | null }): Promise<ActionResult<void>>` (`booking:manage`);
  - `NikForm({ patientId, nik, missingReason })`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/patient-nik.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { NIK_FORMAT_ERROR } from "@/lib/nik";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getEncounterForStaff, listDoctorWorklist } from "@/server/encounter-read";
import { getPatientDetail, updatePatientNik } from "@/server/patient";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "dr. Uji NIK", role: "DOKTER" as const, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", () => ({ requireCapability: vi.fn().mockResolvedValue(actor) }));

const SLUG = "nik-pasien-uji";
const WA = ["6281200005500", "6281200005501", "6281200005502"];
const today = witaDateString(new Date());
const ENTRY = { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" };

describe("NIK di data pasien, food recall di riwayat dan daftar dokter", () => {
  let world: BookingWorld;
  let patientId: string;
  let otherId: string;
  let slot = 0;

  async function booking(offsetDays: number, status: "HADIR" | "SELESAI" = "HADIR") {
    slot += 1;
    const startAt = at(addDaysToDateString(today, offsetDays), `0${4 + Math.floor(slot / 2)}:${slot % 2 ? "30" : "00"}`);
    return prisma.appointment.create({
      data: {
        code: `NIK-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status,
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, WA);
    world = await createBookingWorld(SLUG);
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-5500", name: "Siti NIK", whatsapp: WA[0] } })).id;
    otherId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-5501", name: "Siti Lain", whatsapp: WA[1], nik: "7171015705900055" } })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, WA);
    await prisma.$disconnect();
  });

  it("mengubah NIK dari data pasien dengan aturan yang sama seperti check-in", async () => {
    await unwrap(updatePatientNik({ patientId, nik: "7171 0157 0590 0001", missingReason: null }));
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).toMatchObject({ nik: "7171015705900001", nikMissingReason: null });
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.update-nik", entityId: patientId }, orderBy: { createdAt: "desc" } })).summary,
    ).toBe("SDY-2026-5500: ••••••••••••0001");

    await unwrap(updatePatientNik({ patientId, nik: null, missingReason: "ANAK" }));
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).toMatchObject({ nik: null, nikMissingReason: "ANAK" });

    expect(await updatePatientNik({ patientId, nik: "123", missingReason: null })).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
    expect(await updatePatientNik({ patientId, nik: "7171015705900055", missingReason: null })).toEqual({
      ok: false,
      error: "NIK ini sudah dipakai Siti Lain (SDY-2026-5501).",
    });
    expect(await updatePatientNik({ patientId, nik: null, missingReason: null })).toEqual({
      ok: false,
      error: "Isi NIK atau pilih alasan belum ada NIK.",
    });
  });

  it("pasien rangkap: NIK tidak bisa diubah, dan detailnya menunjuk pasien lama", async () => {
    const duplicate = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-5502", name: "Siti Rangkap", whatsapp: WA[2], mergedIntoId: otherId },
    });
    expect(await updatePatientNik({ patientId: duplicate.id, nik: "7171015705900077", missingReason: null })).toEqual({
      ok: false,
      error: "Pasien ini rangkap; ubah NIK di pasien lamanya.",
    });
    expect((await getPatientDetail(duplicate.id))?.mergedInto).toEqual({ id: otherId, medicalRecordNumber: "SDY-2026-5501", name: "Siti Lain" });
    expect((await getPatientDetail(otherId))?.nik).toBe("7171015705900055");
  });

  it("food recall tampil di riwayat kunjungan, riwayat pasien, dan daftar dokter", async () => {
    const past = await booking(-7);
    await prisma.foodRecall.create({
      data: { appointmentId: past.id, recallDate: new Date(`${addDaysToDateString(today, -8)}T00:00:00Z`), status: "DIISI", entries: [ENTRY] },
    });
    const pastEncounter = await prisma.encounter.create({
      data: { appointmentId: past.id, createdById: world.doctorId, createdByName: "dr. Uji", assessment: "Obesitas" },
    });
    await prisma.$transaction([
      prisma.encounter.update({
        where: { id: pastEncounter.id },
        data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
      }),
      prisma.appointment.update({ where: { id: past.id }, data: { status: "SELESAI" } }),
    ]);

    const current = await booking(0);
    await prisma.foodRecall.create({
      data: { appointmentId: current.id, recallDate: new Date(`${addDaysToDateString(today, -1)}T00:00:00Z`), status: "DIISI", entries: [ENTRY] },
    });
    const encounter = await prisma.encounter.create({ data: { appointmentId: current.id, createdById: world.doctorId, createdByName: "dr. Uji" } });

    const detail = await getEncounterForStaff(encounter.id);
    expect(detail?.foodRecall).toMatchObject({ state: "FILLED", entries: [ENTRY] });
    expect(detail?.history[0].foodRecall).toMatchObject({ state: "FILLED", recallDate: addDaysToDateString(today, -8) });

    const patient = await getPatientDetail(patientId);
    expect(patient?.encounters?.find((e) => e.id === pastEncounter.id)?.foodRecall).toMatchObject({ state: "FILLED" });

    const worklist = await listDoctorWorklist();
    expect(worklist.today.find((row) => row.code === current.code)?.foodRecallFilled).toBe(true);
  });
});
```

Run: `npm run test:integration -- tests/integration/patient-nik.test.ts`
Expected: FAIL, karena `updatePatientNik` bukan fungsi dan `mergedInto`/`foodRecall` belum ada.

- [ ] **Step 2: Riwayat kunjungan dan daftar dokter**

Di `src/server/encounter-read.ts`:
1. Di tipe `EncounterHistoryItem`, tambahkan `/** Food recall kunjungan itu, bila ada (spec check-in 5.5). */ foodRecall: FoodRecallView | null;`.
2. Di `findHistory`, ganti `appointment: { select: { startAt: true, branch: { select: { name: true } } } },` dengan:

```ts
      appointment: {
        select: { id: true, startAt: true, branch: { select: { name: true } }, foodRecall: { select: FOOD_RECALL_SELECT } },
      },
```

3. Di `toHistoryItem`, tambahkan:

```ts
    foodRecall: row.appointment.foodRecall ? foodRecallView(row.appointment, row.appointment.foodRecall) : null,
```

4. Di tipe `WorklistRow`, tambahkan `/** Customer sudah mengisi food recall (spec check-in 5.5). */ foodRecallFilled: boolean;`.
5. Di `findWorklist`, tambahkan `foodRecall: { select: { status: true } },` di `select`, dan di `toWorklistRow` tambahkan `foodRecallFilled: row.foodRecall?.status === "DIISI",`.

Di `tests/fixtures/encounter-detail.ts`, tambahkan `foodRecall: null,` di objek `historyItem` (sebelum `...patch`). Di `tests/unit/components/doctor-worklist.test.tsx`, tambahkan `foodRecallFilled: false,` di helper `row` (sebelum `...patch`).

- [ ] **Step 3: Detail pasien dan ubah NIK**

Di `src/server/patient.ts`:
1. Tambahkan import:

```ts
import { FOOD_RECALL_SELECT, foodRecallView, type FoodRecallView } from "@/lib/food-recall";
import {
  isNikMissingReason,
  maskNik,
  NIK_FORMAT_ERROR,
  NIK_MISSING_REASONS,
  normalizeNik,
  type NikMissingReasonValue,
} from "@/lib/nik";
import { isUniqueViolation } from "@/server/db-errors";
```

2. Di tipe `PatientDetail`, tambahkan setelah `paperRecordNumber: string | null;`:

```ts
  /** NIK, atau alasan belum ada NIK (spec check-in 3.4). Tidak pernah dikirim ke situs publik. */
  nik: string | null;
  nikMissingReason: NikMissingReasonValue | null;
  /** Pasien rangkap: booking dan isiannya sudah dipindah ke pasien ini (spec check-in 3.3). */
  mergedInto: { id: string; medicalRecordNumber: string; name: string } | null;
```

   dan di elemen `encounters`, tambahkan `foodRecall: FoodRecallView | null;` setelah `status: "DRAF" | "FINAL";`.
3. Di `getPatientDetail`:
   - tambahkan `nik: true, nikMissingReason: true, mergedInto: { select: { id: true, medicalRecordNumber: true, name: true } },` di `select` pasien;
   - di kueri `encounters`, ganti `appointment: { select: { code: true, startAt: true, branch: { select: { name: true } } } },` dengan `appointment: { select: { id: true, code: true, startAt: true, branch: { select: { name: true } }, foodRecall: { select: FOOD_RECALL_SELECT } } },`;
   - di objek yang dikembalikan, tambahkan `nik: patient.nik, nikMissingReason: patient.nikMissingReason, mergedInto: patient.mergedInto,` setelah `paperRecordNumber: …,`, dan di pemetaan `encounters` tambahkan `foodRecall: encounter.appointment.foodRecall ? foodRecallView(encounter.appointment, encounter.appointment.foodRecall) : null,`.
4. Tambahkan di akhir berkas:

```ts
/** NIK dari halaman data pasien (spec check-in 3.4): aturannya sama dengan check-in, tanpa pindah pasien rangkap. */
export async function updatePatientNik(input: {
  patientId: string;
  nik: string | null;
  missingReason: string | null;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, medicalRecordNumber: true, mergedIntoId: true },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
    if (patient.mergedIntoId) throw new UserFacingError("Pasien ini rangkap; ubah NIK di pasien lamanya.");

    let data: { nik: string | null; nikMissingReason: NikMissingReasonValue | null };
    if (input?.nik !== null && input?.nik !== undefined) {
      const nik = normalizeNik(String(input.nik));
      if (!nik) throw new UserFacingError(NIK_FORMAT_ERROR);
      const owner = await prisma.patient.findFirst({
        where: { nik, id: { not: patient.id } },
        select: { name: true, medicalRecordNumber: true },
      });
      if (owner) throw new UserFacingError(`NIK ini sudah dipakai ${owner.name} (${owner.medicalRecordNumber}).`);
      data = { nik, nikMissingReason: null };
    } else if (isNikMissingReason(input?.missingReason)) {
      data = { nik: null, nikMissingReason: input.missingReason };
    } else {
      throw new UserFacingError("Isi NIK atau pilih alasan belum ada NIK.");
    }

    try {
      await prisma.patient.update({ where: { id: patient.id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError("NIK ini baru saja dipakai pasien lain — periksa lagi.");
      throw error;
    }
    await recordAudit({
      actor,
      action: "patient.update-nik",
      entity: "Patient",
      entityId: patient.id,
      summary: `${patient.medicalRecordNumber}: ${
        data.nik ? maskNik(data.nik) : `belum ada NIK (${NIK_MISSING_REASONS[data.nikMissingReason!]})`
      }`,
    });
    safeRevalidatePath(`/admin/pasien/${patient.id}`);
  });
}
```

Run: `npm run test:integration -- tests/integration/patient-nik.test.ts tests/integration/patient-detail.test.ts tests/integration/encounter-read.test.ts`
Expected: PASS semua.

- [ ] **Step 4: Tulis uji tampilan (gagal)**

Buat `tests/unit/components/nik-form.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NikForm } from "@/components/admin/nik-form";
import { updatePatientNik } from "@/server/patient";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/patient", () => ({ updatePatientNik: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("NikForm", () => {
  it("menampilkan NIK dan menyimpan NIK baru", async () => {
    const user = userEvent.setup();
    vi.mocked(updatePatientNik).mockResolvedValue({ ok: true, data: undefined });
    render(<NikForm patientId="p1" nik="7171015705900001" missingReason={null} />);
    expect(screen.getByText("7171015705900001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ubah NIK" }));
    const field = screen.getByLabelText("NIK (16 angka)");
    await user.clear(field);
    await user.type(field, "7171015705900009");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updatePatientNik).toHaveBeenCalledWith({ patientId: "p1", nik: "7171015705900009", missingReason: null }));
    expect(refresh).toHaveBeenCalled();
  });

  it("menandai pasien tanpa NIK beserta alasannya", () => {
    render(<NikForm patientId="p1" nik={null} missingReason="LUPA_KTP" />);
    expect(screen.getByText("NIK belum ada (Lupa membawa KTP)")).toBeInTheDocument();
  });

  it("menyimpan alasan belum ada NIK", async () => {
    const user = userEvent.setup();
    vi.mocked(updatePatientNik).mockResolvedValue({ ok: true, data: undefined });
    render(<NikForm patientId="p1" nik={null} missingReason={null} />);
    await user.click(screen.getByRole("button", { name: "Ubah NIK" }));
    await user.click(screen.getByLabelText("Belum ada NIK"));
    await user.selectOptions(screen.getByLabelText("Alasan"), "WARGA_ASING");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updatePatientNik).toHaveBeenCalledWith({ patientId: "p1", nik: null, missingReason: "WARGA_ASING" }));
  });
});
```

Di `tests/unit/components/patient-detail-view.test.tsx`:
1. Ganti mock `@/server/patient` dengan `vi.mock("@/server/patient", () => ({ updatePatientImportantNotes: vi.fn(), updatePaperRecordNumber: vi.fn(), updatePatientNik: vi.fn() }));`.
2. Di objek `patient`, tambahkan `nik: "7171015705900001", nikMissingReason: null, mergedInto: null,` setelah `paperRecordNumber: "RM-0457",`, dan di elemen `encounters` tambahkan:

```ts
      foodRecall: {
        appointmentId: "a1",
        state: "FILLED",
        recallDate: "2026-10-06",
        recallDateLabel: "Selasa, 6 Oktober",
        entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" }],
        submittedAt: null,
        completedAt: null,
        completedByName: null,
      },
```

3. Tambahkan di akhir `describe` yang ada:

```tsx
  it("NIK tampil di data diri", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(within(screen.getByRole("region", { name: "Data diri" })).getByText("7171015705900001")).toBeInTheDocument();
  });

  it("riwayat kunjungan memuat food recall yang bisa dibuka", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    const visits = screen.getByRole("region", { name: "Riwayat kunjungan" });
    expect(within(visits).getByText("Food recall Selasa, 6 Oktober")).toBeInTheDocument();
    // Isinya di dalam <details> yang tertutup: dicari lewat teks, bukan peran tabel.
    expect(within(visits).getByText("Nasi kuning")).toBeInTheDocument();
  });

  it("pasien rangkap menunjuk pasien lamanya", () => {
    render(
      <PatientDetailView
        patient={{ ...patient, mergedInto: { id: "p9", medicalRecordNumber: "SDY-2026-0009", name: "Siti Lama" } }}
        canReadRecords
        canWriteRecords
      />,
    );
    expect(screen.getByRole("link", { name: "Siti Lama (SDY-2026-0009)" })).toHaveAttribute("href", "/admin/pasien/p9");
    expect(screen.getByText(/Pasien ini rangkap dari/)).toBeInTheDocument();
  });
```

Di `tests/unit/components/doctor-worklist.test.tsx`, tambahkan di `describe` yang ada:

```tsx
  it("menandai customer yang sudah mengisi food recall", () => {
    render(<DoctorWorklistView worklist={{ today: [row({ foodRecallFilled: true })], unfinished: [] }} />);
    expect(screen.getByText("food recall ✓")).toBeInTheDocument();
  });
```

Di `tests/unit/components/encounter-page-view.test.tsx`, tambahkan di akhir `describe("EncounterPageView", …)`:

```tsx
  it("tab Sebelumnya memuat food recall kunjungan itu", async () => {
    const user = userEvent.setup();
    const visit = historyItem({
      foodRecall: {
        appointmentId: "a0",
        state: "FILLED",
        recallDate: "2026-09-22",
        recallDateLabel: "Selasa, 22 September",
        entries: [{ hour: 12, kind: "KAPSUL_OBAT", text: "Kapsul M", by: "CUSTOMER" }],
        submittedAt: null,
        completedAt: null,
        completedByName: null,
      },
    });
    render(<EncounterPageView encounter={encounterDetail({ history: [visit] })} canWrite />);
    await user.click(screen.getByRole("tab", { name: "Sebelumnya" }));
    expect(screen.getByText("Food recall Selasa, 22 September")).toBeInTheDocument();
  });
```

Run: `npx vitest run tests/unit/components/nik-form.test.tsx tests/unit/components/patient-detail-view.test.tsx tests/unit/components/doctor-worklist.test.tsx tests/unit/components/encounter-page-view.test.tsx`
Expected: FAIL, karena `@/components/admin/nik-form` tidak ditemukan, NIK dan food recall belum tampil, dan tanda daftar dokter belum ada.

- [ ] **Step 5: Tampilan**

Buat `src/components/admin/nik-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NIK_FORMAT_ERROR, NIK_MISSING_REASONS, normalizeNik, type NikMissingReasonValue } from "@/lib/nik";
import { updatePatientNik } from "@/server/patient";
import { NikInput, type NikDraft } from "./nik-input";

/** NIK di halaman data pasien (spec check-in 3.4), untuk semua staf booking:manage. */
export function NikForm({
  patientId,
  nik,
  missingReason,
}: {
  patientId: string;
  nik: string | null;
  missingReason: NikMissingReasonValue | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NikDraft>({ mode: "NIK", value: nik ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    let payload: { nik: string | null; missingReason: string | null };
    if (draft.mode === "NIK") {
      const value = normalizeNik(draft.value);
      if (!value) {
        setError(NIK_FORMAT_ERROR);
        return;
      }
      payload = { nik: value, missingReason: null };
    } else {
      if (!draft.reason) {
        setError("Pilih alasan belum ada NIK.");
        return;
      }
      payload = { nik: null, missingReason: draft.reason };
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updatePatientNik({ patientId, ...payload });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("NIK disimpan.");
        setEditing(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan NIK. Coba lagi.");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <h3 className="text-xs text-muted-foreground">NIK</h3>
        {nik ? (
          <p>{nik}</p>
        ) : missingReason ? (
          <p className="font-medium text-amber-700">NIK belum ada ({NIK_MISSING_REASONS[missingReason]})</p>
        ) : (
          <p>—</p>
        )}
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0"
          onClick={() => {
            setDraft({ mode: "NIK", value: nik ?? "" });
            setEditing(true);
          }}
        >
          Ubah NIK
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <NikInput draft={draft} onChange={setDraft} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          Simpan
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
          Batal
        </Button>
      </div>
    </div>
  );
}
```

Di `src/components/admin/patient-detail-view.tsx`:
1. Tambahkan import `import { FoodRecallTable } from "./food-recall-table";` dan `import { NikForm } from "./nik-form";`.
2. Tambahkan di awal `<div className="space-y-6">` (sebelum grid kartu):

```tsx
      {patient.mergedInto && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pasien ini rangkap dari{" "}
          <Link href={`/admin/pasien/${patient.mergedInto.id}`} className="font-medium underline underline-offset-4">
            {patient.mergedInto.name} ({patient.mergedInto.medicalRecordNumber})
          </Link>
          . Booking dan isiannya sudah dipindah ke sana.
        </p>
      )}
```

3. Di kartu "Data diri", ganti `<div className="mt-3 border-t pt-3 text-sm">` yang memuat `PaperRecordNumberForm` dengan:

```tsx
          <div className="mt-3 grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
            <NikForm patientId={patient.id} nik={patient.nik} missingReason={patient.nikMissingReason} />
            <PaperRecordNumberForm patientId={patient.id} value={patient.paperRecordNumber} />
          </div>
```

4. Di tabel "Riwayat kunjungan", tambahkan kolom `<TableHead>Food recall</TableHead>` setelah `<TableHead>Penilaian</TableHead>`, dan sel berikut setelah sel penilaian:

```tsx
                    <TableCell className="max-w-xs whitespace-normal">
                      {encounter.foodRecall && encounter.foodRecall.entries.length > 0 ? (
                        <details>
                          <summary className="cursor-pointer text-sm">Food recall {encounter.foodRecall.recallDateLabel}</summary>
                          <FoodRecallTable
                            entries={encounter.foodRecall.entries}
                            label={`Food recall ${encounter.foodRecall.recallDateLabel}`}
                          />
                        </details>
                      ) : (
                        "—"
                      )}
                    </TableCell>
```

Di `src/components/admin/previous-visits-tab.tsx`:
1. Tambahkan import `import { FoodRecallTable } from "./food-recall-table";`.
2. Di `VisitDetail`, tambahkan sebelum `{visit.addenda.map(…)}`:

```tsx
      {visit.foodRecall && visit.foodRecall.entries.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Food recall {visit.foodRecall.recallDateLabel}
          </summary>
          <FoodRecallTable entries={visit.foodRecall.entries} label={`Food recall ${visit.foodRecall.recallDateLabel}`} />
        </details>
      )}
```

Di `src/components/admin/doctor-worklist.tsx`, ganti `<div className="font-medium">{row.patientName}</div>` dengan:

```tsx
                <div className="font-medium">
                  {row.patientName}
                  {row.foodRecallFilled && (
                    <Badge variant="outline" className="ml-2 text-xs font-normal">
                      food recall ✓
                    </Badge>
                  )}
                </div>
```

Run: `npx vitest run tests/unit/components/nik-form.test.tsx tests/unit/components/patient-detail-view.test.tsx tests/unit/components/doctor-worklist.test.tsx tests/unit/components/encounter-page-view.test.tsx`
Expected: PASS semua.

- [ ] **Step 6: Uji unit, integrasi terkait, lint, tipe, commit**

Run: `npx vitest run > "$WS/t8.log" 2>&1; grep -E "Test Files|Tests " "$WS/t8.log"; npm run test:integration -- tests/integration/patient-nik.test.ts tests/integration/patient-detail.test.ts tests/integration/patient-records.test.ts tests/integration/encounter-read.test.ts > "$WS/t8-int.log" 2>&1; grep -E "Test Files|Tests " "$WS/t8-int.log"; npx eslint src/components/admin src/server/patient.ts src/server/encounter-read.ts; npx tsc --noEmit -p . > "$WS/t8-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/components/admin/nik-form.tsx src/components/admin/patient-detail-view.tsx src/components/admin/previous-visits-tab.tsx \
  src/components/admin/doctor-worklist.tsx src/server/patient.ts src/server/encounter-read.ts \
  tests/unit/components/nik-form.test.tsx tests/unit/components/patient-detail-view.test.tsx tests/unit/components/doctor-worklist.test.tsx \
  tests/unit/components/encounter-page-view.test.tsx tests/fixtures/encounter-detail.ts tests/integration/patient-nik.test.ts
git commit -m "feat: edit the NIK on the patient page, point duplicates to the kept patient, and show food recalls in visit history and the doctor's list"
```

---
### Task 9: Uji ujung-ke-ujung dan penutup

**Files:**
- Create: `tests/e2e/check-in.spec.ts`
- Modify: `tests/e2e/prepare-db.mts`, `docs/superpowers/specs/2026-10-03-check-in-klinik-design.md` (baris Status)

**Interfaces:**
- Consumes (dari layar yang dibangun Task 5–8):
  - **daftar booking:** tombol baris "Check-in"; tanda baris "Food recall: belum diisi" / "Food recall: sudah diisi"; dialog "Check-in — {kode}" dengan kolom "NIK (16 angka)", kotak centang "Tawarkan food recall", tombol "Check-in", bagian "NIK ini sudah milik pasien lain", tombol "Ini orang yang sama — pindahkan";
  - **panel link food recall:** tautan "Buka di tablet" dan tombol "Selesai";
  - **halaman `/food-recall`:** "Halo {nama depan},", "Isi catatan", "＋ Tambah catatan", "Kirim", lalu teks terima kasih dan `FOOD_RECALL_RECEIVED`;
  - **dasbor dokter:** tanda "food recall ✓" dan tombol "Periksa";
  - **halaman kunjungan:** tab "Food recall", tombol "Salin ke S", toast "Food recall disalin ke S.".
- Produces: data uji e2e — booking hari ini `E2E-CEKIN-1/2` (isian Slimming) dan `E2E-GABUNG-1/2` (pasien rangkap dengan pemilik NIK `SDY-E2E-NIK-1/2`).

- [ ] **Step 1: Data uji**

Di `tests/e2e/prepare-db.mts`, tambahkan tepat sebelum `await prisma.$disconnect();`:

```ts
// Check-in (check-in.spec.ts): booking terkonfirmasi HARI INI per proyek, pukul 04.00/04.30
// dengan isian Slimming (food recall ditawarkan), dan 05.00/05.30 untuk pasien rangkap yang
// NIK-nya milik pasien lama. Di luar jam buka dan sebelum booking 06.00 uji lain.
const identity = {
  birthDate: new Date("1990-05-17T00:00:00Z"),
  gender: "P" as const,
  occupation: "Karyawan",
  address: "Jl. Sam Ratulangi, Manado",
};
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-CEKIN-${index + 1}`, name: `Rani Cekin ${project}`, whatsapp: `6281200080${index}01`, ...identity },
  });
  const startAt = combineWitaDateAndMinutes(today, 4 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-CEKIN-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "TERKONFIRMASI",
      source: "WALK_IN",
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: patient.id,
    },
  });
  await prisma.intake.create({
    data: {
      appointmentId: appointment.id,
      patientId: patient.id,
      status: "TERISI",
      kind: "LENGKAP",
      purpose: "SLIMMING",
      quizVersion: 2,
      answers: slimmingNewPatient,
      submittedAt: new Date(),
    },
  });

  await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-NIK-${index + 1}`,
      name: `Rina Lama ${project}`,
      whatsapp: `6281200081${index}01`,
      nik: `717101570590002${index + 1}`,
      ...identity,
    },
  });
  const duplicate = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-RANGKAP-${index + 1}`, name: `Rina Baru ${project}`, whatsapp: `6281200082${index}01`, ...identity },
  });
  const mergeAt = combineWitaDateAndMinutes(today, 5 * 60 + index * 30);
  await prisma.appointment.create({
    data: {
      code: `E2E-GABUNG-${index + 1}`,
      type: "KONSULTASI",
      startAt: mergeAt,
      endAt: new Date(mergeAt.getTime() + 30 * 60_000),
      status: "TERKONFIRMASI",
      source: "WALK_IN",
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: duplicate.id,
    },
  });
}
```

- [ ] **Step 2: Tulis uji e2e**

Buat `tests/e2e/check-in.spec.ts`:

```ts
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Booking hari ini dari prepare-db.mts, satu per proyek agar desktop dan ponsel tidak berebut.
test.setTimeout(180_000);

const projectIndex = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? 2 : 1);

async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}

/** Booking terkonfirmasi hari ini hanya ada di daftar tanggal (bukan di "Menunggu konfirmasi"). */
async function openCheckIn(page: Page, code: string) {
  await page.goto("/admin/booking");
  const row = page.getByRole("row").filter({ hasText: code });
  await row.getByRole("button", { name: "Check-in" }).click();
  const dialog = page.getByRole("dialog", { name: `Check-in — ${code}` });
  await expect(dialog.getByRole("button", { name: "Check-in" })).toBeVisible({ timeout: 30_000 });
  return { row, dialog };
}

test("resepsionis check-in dengan NIK, customer mengisi food recall di tablet, dokter menyalinnya ke S lalu memfinalisasi", async ({
  page,
  browser,
}, testInfo) => {
  const n = projectIndex(testInfo);
  const code = `E2E-CEKIN-${n}`;
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const newContext = () => browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL: E2E_BASE_URL });
  await stubWhatsApp(page);
  await signIn(page, E2E_RESEPSIONIS);

  // Resepsionis: NIK ditempel dari foto KTP dengan spasi (Review Focus 1).
  const { row, dialog } = await openCheckIn(page, code);
  await dialog.getByLabel("NIK (16 angka)").fill(`7171 0157 0590 001${n}`);
  await expect(dialog.getByLabel("Tawarkan food recall")).toBeChecked();
  await dialog.getByRole("button", { name: "Check-in" }).click();

  const openOnTablet = dialog.getByRole("link", { name: "Buka di tablet" });
  await expect(openOnTablet).toBeVisible({ timeout: 30_000 });
  const link = (await openOnTablet.getAttribute("href"))!;
  expect(link.startsWith(`${E2E_BASE_URL}/food-recall#`)).toBe(true);
  await dialog.getByRole("button", { name: "Selesai" }).click();
  await expect(row).toContainText("Food recall: belum diisi", { timeout: 30_000 });

  // Customer di tablet: perangkat lain, tanpa login.
  const tabletContext = await newContext();
  const tablet = await tabletContext.newPage();
  await tablet.goto(link);
  await expect(tablet.getByText("Halo Rani,")).toBeVisible({ timeout: 30_000 });
  await tablet.getByLabel("Isi catatan").fill("Nasi kuning dan teh manis");
  await tablet.getByRole("button", { name: "＋ Tambah catatan" }).click();
  await tablet.getByRole("button", { name: "Kirim" }).click();
  await expect(tablet.getByText("Terima kasih, dokter akan melihatnya saat konsultasi.")).toBeVisible({ timeout: 30_000 });
  await expect(tablet.locator("main").getByText(/pasien|berobat/i)).toHaveCount(0);

  // Resepsionis hanya melihat statusnya, tanpa isi (spec 4.4).
  await page.reload();
  await expect(row).toContainText("Food recall: sudah diisi", { timeout: 30_000 });
  await expect(page.getByText("Nasi kuning dan teh manis")).toHaveCount(0);

  // Dokter (sesi sendiri): tanda di daftar pasien hari ini, tab Food recall terbuka pertama.
  const doctorContext = await newContext();
  const doctor = await doctorContext.newPage();
  await signIn(doctor, E2E_ADMIN);
  const todayRow = doctor
    .getByRole("region", { name: "Pasien hari ini" })
    .getByRole("row")
    .filter({ hasText: `Rani Cekin ${testInfo.project.name}` });
  await expect(todayRow).toContainText("food recall ✓", { timeout: 30_000 });
  await todayRow.getByRole("button", { name: "Periksa" }).click();
  await expect(doctor).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  await expect(doctor.getByRole("tab", { name: "Food recall" })).toHaveAttribute("aria-selected", "true");
  await expect(doctor.getByRole("tabpanel")).toContainText("Nasi kuning dan teh manis");

  await doctor.getByRole("tabpanel").getByRole("button", { name: "Salin ke S" }).click();
  await expect(doctor.getByText("Food recall disalin ke S.")).toBeVisible();
  await expect(doctor.getByLabel("Keluhan dan anamnesis dokter")).toHaveValue(
    /^Food recall H-1 \(.+\):\n07\.00 Makan\/minum — Nasi kuning dan teh manis$/,
  );

  await doctor.getByLabel("Penilaian / diagnosis").fill("Obesitas derajat 1");
  await expect(doctor.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await doctor.getByRole("button", { name: "Finalisasi" }).click();
  await doctor.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(doctor.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
  await doctorContext.close();

  // Setelah final, link customer hanya mengabarkan bahwa catatannya sudah diterima.
  await tablet.reload();
  await expect(tablet.getByText("Food recall Anda sudah diterima dokter.")).toBeVisible({ timeout: 30_000 });
  await expect(tablet.getByRole("button", { name: "Kirim" })).toHaveCount(0);
  await tabletContext.close();
});

test("resepsionis memindah pasien rangkap ke pemilik NIK, lalu check-in tanpa food recall", async ({ page }, testInfo) => {
  const n = projectIndex(testInfo);
  const code = `E2E-GABUNG-${n}`;
  const owner = `Rina Lama ${testInfo.project.name}`;
  await signIn(page, E2E_RESEPSIONIS);

  const { row, dialog } = await openCheckIn(page, code);
  await dialog.getByLabel("NIK (16 angka)").fill(`7171.0157.0590.002${n}`);
  await dialog.getByRole("button", { name: "Check-in" }).click();

  await expect(dialog.getByRole("heading", { name: "NIK ini sudah milik pasien lain" })).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText(`SDY-E2E-NIK-${n}`);
  await dialog.getByRole("button", { name: "Ini orang yang sama — pindahkan" }).click();
  await expect(page.getByText(`Booking dipindah ke ${owner} (SDY-E2E-NIK-${n}).`)).toBeVisible({ timeout: 30_000 });

  // Dialog kini memuat pasien lama: NIK-nya sudah ada, dan tanpa isian Slimming food recall tidak dicentang.
  await expect(dialog.getByText(`NIK 717101570590002${n}`)).toBeVisible();
  await expect(dialog.getByLabel("Tawarkan food recall")).not.toBeChecked();
  await dialog.getByRole("button", { name: "Check-in" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(row).toContainText("Hadir", { timeout: 30_000 });
  await expect(row).toContainText(owner);
});
```

- [ ] **Step 3: Jalankan uji e2e check-in**

Pastikan tidak ada `npm run test:integration` yang sedang berjalan (basis data ujinya sama).

Run: `npm run test:e2e -- tests/e2e/check-in.spec.ts > "$WS/e2e-check-in.log" 2>&1; tail -25 "$WS/e2e-check-in.log"`
Expected: 4 passed (2 uji × desktop dan ponsel).

Bila gagal, buka `test-results/` dan baca jejaknya sebelum mengubah apa pun. Jangan menaikkan batas waktu untuk menutupi galat.

- [ ] **Step 4: Uji e2e yang bersinggungan, per kelompok**

Booking hari ini bertambah, label "Hadir" berubah menjadi "Check-in", dan header/gulir publik mendapat jalur baru. Jalankan satu kelompok per perintah (laptop 8 GB):

Run:

```bash
npm run test:e2e -- tests/e2e/kunjungan.spec.ts tests/e2e/dasbor.spec.ts > "$WS/e2e-a.log" 2>&1; tail -8 "$WS/e2e-a.log"
npm run test:e2e -- tests/e2e/admin-booking.spec.ts tests/e2e/pengingat.spec.ts > "$WS/e2e-b.log" 2>&1; tail -8 "$WS/e2e-b.log"
npm run test:e2e -- tests/e2e/link-kuis.spec.ts tests/e2e/admin.spec.ts tests/e2e/tampilan-admin.spec.ts > "$WS/e2e-c.log" 2>&1; tail -8 "$WS/e2e-c.log"
npm run test:e2e -- tests/e2e/public-site.spec.ts tests/e2e/situs-publik-gerak.spec.ts > "$WS/e2e-d.log" 2>&1; tail -8 "$WS/e2e-d.log"
```

Expected: setiap kelompok `passed` tanpa `failed`. Uji yang dilewati karena hari libur atau malam (`test.skip` yang sudah ada) boleh.

- [ ] **Step 5: Verifikasi penuh**

Run:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code; echo "migrate diff exit $?"
npx eslint > "$WS/lint.log" 2>&1; echo "eslint exit $?"
npx tsc --noEmit -p . > "$WS/tsc.log" 2>&1; echo "tsc exit $?"
npx vitest run > "$WS/unit.log" 2>&1; grep -E "Test Files|Tests " "$WS/unit.log"
npm run test:integration > "$WS/int.log" 2>&1; grep -E "Test Files|Tests " "$WS/int.log"
```

Expected: `migrate diff exit 0`, `eslint exit 0`, `tsc exit 0`, dan uji unit dan integrasi lulus semua tanpa `failed`.

- [ ] **Step 6: Tandai spec sudah dibangun, lalu commit**

Di `docs/superpowers/specs/2026-10-03-check-in-klinik-design.md`, ganti baris status:

```
- **Status:** Menunggu tinjauan pemilik
```

dengan:

```
- **Status:** Disetujui pemilik (3 Oktober 2026); dibangun lewat `docs/superpowers/plans/2026-10-03-plan-check-in-klinik.md`
```

```bash
git add tests/e2e/check-in.spec.ts tests/e2e/prepare-db.mts docs/superpowers/specs/2026-10-03-check-in-klinik-design.md
git commit -m "test: cover check-in with NIK, the tablet food recall, Salin ke S, and the duplicate patient merge end to end; mark the spec built"
```

`git status` sesudahnya tidak boleh menampilkan `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md` di bagian staged.
