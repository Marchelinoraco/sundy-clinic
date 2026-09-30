# Plan — Rekam Medis Bagian 1: Catatan Dokter per Kunjungan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dokter membuka pasien yang hadir dari dasbor, mengisi catatan SOAP beserta tanda vital dan treatment dalam satu halaman yang tersimpan otomatis, lalu memfinalisasinya. Catatan final dikunci basis data, koreksi hanya lewat adendum, dan setiap pembukaan maupun perubahan tercatat di audit.

**Architecture:**
- **Tiga tabel baru:** `Encounter` (satu per booking), `EncounterTreatment`, dan `EncounterAddendum`, ditambah dua kolom `Patient`.
- **Penguncian final** dijaga **trigger PostgreSQL** di migrasi yang ditulis tangan, termasuk penolakan `TRUNCATE`. Aplikasi tetap memakai pembaruan bersyarat (`status = DRAF` dan `updatedAt = versi`), jadi trigger hanya jaring terakhir. Pesannya diterjemahkan lewat penanda `rekam_medis_terkunci`.
- **Aturan isian** (rentang vital, pesan galat, IMT) ada di satu modul murni `src/lib/encounter.ts`. Formulir memakainya untuk pesan langsung, dan server memakainya untuk memeriksa ulang.
- **Server action:** `src/server/encounter.ts` untuk menulis dan `src/server/encounter-read.ts` untuk membaca, keduanya `"use server"`. Hak akses dan kolom klinis dijaga di kueri.
- **Simpan otomatis** adalah objek `DraftSaver` di hook klien. Pada satu waktu hanya ada satu permintaan, selalu dengan versi terakhir dari server. Galat jaringan dicoba ulang; penolakan server ditampilkan.
- **Uji** memakai `tests/purge-encounters.ts`, yang mematikan trigger sementara di dalam satu transaksi, agar basis data uji tetap bisa dibersihkan.

**Tech Stack:** Next.js 15.5 App Router (server actions) · React 19 · Prisma 7.10 + `@prisma/adapter-pg` · PostgreSQL 18 · zod 4 · shadcn/ui (Radix) · Vitest 4 + Testing Library + user-event · Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md` (keputusan R1–R13, bagian 4–12).

**Base branch:** `desain-catatan-dokter`, yang berisi spec dan plan ini. Kerjakan di branch baru `catatan-dokter` dari branch itu.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna, segmen URL (`/admin/kunjungan`), dan komentar. Panel admin memakai kata "pasien".
- **Zona waktu:** WITA (`Asia/Makassar`). DateTime disimpan UTC. Tanggal dihitung dengan `src/lib/time.ts` dan ditulis dengan `src/lib/format.ts`.
- **Hak akses:**
  - membaca kunjungan dan dasbor dokter: `record:read`;
  - membuka, menyimpan, memfinalisasi, membuang draf, adendum, dan catatan penting: `record:write`;
  - no. RM kertas lama: `booking:manage`;
  - jejak catatan: `audit:read`.

  Semuanya ditegakkan di server. Kolom klinis kunjungan dan `Patient.importantNotes` tidak pernah dipilih untuk staf tanpa `record:read`.
- **Catatan final tidak pernah diubah atau dihapus.** Koreksi hanya lewat adendum. Draf boleh dibuang.
- **Jejak audit tidak memuat isi klinis.** Ringkasannya hanya kode booking, No. RM, atau no. RM kertas lama.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (tipe boleh). Setiap ekspornya bisa dipanggil dari browser, jadi setiap aksi memeriksa hak dan input sendiri. Modul pembantu server yang tidak boleh dipanggil browser (`audit.ts`, `intake-clinical.ts`) **tidak** memakai `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`, dan **komponen** tidak mengimpor `@/lib/db` (`tests/unit/architecture.test.ts`).
- **Pesan galat untuk pengguna** dikembalikan lewat `runAction` + `UserFacingError`.
- **Migrasi ditulis tangan** (role `sundy` tidak punya CREATEDB), lalu dijalankan berurutan:
  1. `npx prisma migrate deploy`
  2. `npm run db:migrate:test`
  3. `npx prisma generate`
  4. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`, yang harus keluar dengan kode 0.
- **Uji integrasi** berjalan ke `sundy_test` lewat `npm run test:integration`. Jangan menjalankannya bersamaan dengan `npm run test:e2e`.
- **Tanpa dependensi baru.**
- **Commit** memakai Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. Stage hanya berkas task itu. **Jangan pernah men-stage** perubahan lokal pemilik di `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Dokter terus mengetik saat simpan sebelumnya masih berjalan** (jaringan lambat). Ketikan terakhir tidak boleh hilang, dan simpan berikutnya harus memakai versi baru dari server, bukan ditolak sebagai "diubah di tempat lain" oleh dirinya sendiri → uji di Task 6.
2. **Finalisasi ditekan sesaat setelah mengetik**, sebelum simpan otomatis sempat berjalan. Isian terakhir harus ikut final → uji di Task 6 (formulir mengirim isian terakhir) dan Task 3 (finalisasi menyimpan isian yang dikirim).
3. **Angka diketik dengan koma, titik, atau spasi** ("72,5", " 120 ", "36.5"). Semuanya diterima. "72,55" dan "12.5" untuk nadi ditolak dengan pesan yang jelas, bukan disimpan diam-diam → uji di Task 2.
4. **Pasien pagi hari:** booking 07.30 WITA sama dengan 23.30 UTC hari sebelumnya. Pasien itu tetap di "Pasien hari ini", bukan di "Catatan belum final" → uji di Task 4.
5. **Draf dibuang di satu tab, lalu tab lain masih menyimpan otomatis.** Penyimpanan ditolak dengan pesan bahwa kunjungan sudah tidak ada, tanpa membuat kunjungan baru → uji di Task 3.

---

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `prisma/schema.prisma` | enum `EncounterStatus`, model `Encounter`/`EncounterTreatment`/`EncounterAddendum`, kolom `Patient.importantNotes`/`paperRecordNumber`, relasi `Appointment.encounter` |
| `prisma/migrations/20260930150000_kunjungan_dokter/migration.sql` (baru) | tabel, indeks, FK, CHECK, trigger penguncian |
| `tests/purge-encounters.ts` (baru) | pembersih kunjungan untuk basis data uji |
| `src/server/db-errors.ts` | `isRecordLockedError` |
| `src/lib/encounter.ts` (baru) | batas, label, `parseVital`, `parseEncounterDraft`, skema bentuk isian, IMT, format angka, cuplikan, umur |
| `src/lib/audit-window.ts` (baru) | jendela 30 menit audit berulang |
| `src/lib/audit-labels.ts` (baru) | label aksi dan peran untuk jejak catatan |
| `src/lib/kuis/clinical-view.ts` | `ClinicalView.pregnancy` |
| `src/server/audit.ts` | `recordAuditThrottled`, `listAuditTrail` |
| `src/server/encounter.ts` (baru) | aksi `openEncounter`, `saveEncounterDraft`, `finalizeEncounter`, `discardEncounterDraft`, `addEncounterAddendum` |
| `src/server/intake-clinical.ts` (baru) | `loadIntakeClinical` (dipindah dari `intake.ts`) |
| `src/server/intake.ts` | memakai `loadIntakeClinical` |
| `src/server/encounter-read.ts` (baru) | `getEncounterForStaff`, `listDoctorWorklist` |
| `src/server/patient.ts` | `getPatientDetail` bertambah no. RM kertas lama, catatan penting, riwayat kunjungan; aksi `updatePatientImportantNotes`, `updatePaperRecordNumber` |
| `src/components/admin/patient-note-forms.tsx` (baru) | sunting catatan penting dan no. RM kertas lama |
| `src/components/admin/patient-detail-view.tsx` | no. RM kertas lama, catatan penting, Riwayat kunjungan |
| `src/app/(admin)/admin/pasien/[id]/page.tsx` | meneruskan `canWriteRecords` |
| `src/components/admin/use-draft-autosave.ts` (baru) | `DraftSaver` + `useDraftAutosave` |
| `src/components/admin/encounter-form.tsx` (baru) | formulir draf S/O/A/P + treatment |
| `src/components/admin/intake-clinical-content.tsx` (baru) | isi klinis isian (dipindah dari `intake-view.tsx`) |
| `src/components/admin/intake-view.tsx` | memakai `IntakeClinicalContent` |
| `src/components/admin/encounter-warnings.tsx` (baru) | kotak Peringatan |
| `src/components/admin/encounter-intake-content.tsx` (baru) | isian kuis di bagian S |
| `src/components/admin/encounter-record.tsx` (baru) | tampilan baca-saja |
| `src/components/admin/addendum-form.tsx` (baru) | formulir adendum |
| `src/components/admin/audit-trail.tsx` (baru) | "Jejak catatan ini" |
| `src/components/admin/encounter-page-view.tsx` (baru) | susunan halaman kunjungan |
| `src/app/(admin)/admin/kunjungan/[id]/page.tsx` (baru) | rute halaman kunjungan |
| `src/components/admin/open-encounter-button.tsx` (baru) | tombol Periksa |
| `src/components/admin/doctor-worklist.tsx` (baru) | daftar dasbor dokter |
| `src/app/(admin)/admin/page.tsx` | dasbor |
| `tests/e2e/prepare-db.mts`, `tests/e2e/kunjungan.spec.ts` (baru) | fixture dan alur ujung-ke-ujung |
| `docs/…` | status spec, PRD F12, runbook §4 |

---

### Task 1: Skema, migrasi, dan trigger penguncian

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260930150000_kunjungan_dokter/migration.sql`
- Create: `tests/purge-encounters.ts`
- Modify: `tests/integration/global-setup.ts`, `tests/integration/public-booking-world.ts`, `tests/e2e/prepare-db.mts`
- Modify: `src/server/db-errors.ts`
- Test: `tests/integration/encounter-schema.test.ts`

**Interfaces:**
- Produces:
  - model Prisma `Encounter`, `EncounterTreatment`, `EncounterAddendum`, enum `EncounterStatus` (`DRAF` | `FINAL`), relasi `appointment.encounter`, kolom `Patient.importantNotes` dan `Patient.paperRecordNumber`;
  - `purgeEncounters(db: PrismaClient): Promise<void>`;
  - `isRecordLockedError(error: unknown): boolean`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/integration/encounter-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isRecordLockedError } from "@/server/db-errors";
import { purgeEncounters } from "../purge-encounters";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

const SLUG = "skema-kunjungan-uji";
const PATIENT_WA = "6281200007700";

describe("skema kunjungan dan trigger penguncian", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let slot = 0;

  /** Booking HADIR baru pada jam berikutnya (06.00, 06.30, …) agar tidak bertindihan. */
  async function attended() {
    slot += 1;
    const minutes = 6 * 60 + slot * 30;
    const startAt = at(date, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    return prisma.appointment.create({
      data: {
        code: `SKM-${slot}`,
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

  async function encounter(status: "DRAF" | "FINAL", assessment: string | null = "Obesitas") {
    const appointment = await attended();
    const created = await prisma.encounter.create({
      data: {
        appointmentId: appointment.id,
        createdById: world.doctorId,
        createdByName: "dr. Uji",
        assessment,
        treatments: {
          create: [{ serviceId: world.treatmentId, serviceName: "Facial Uji", performerId: world.therapistId, performerName: "Terapis Uji" }],
        },
      },
    });
    if (status === "FINAL") {
      await prisma.encounter.update({
        where: { id: created.id },
        data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
      });
    }
    return created.id;
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7700", name: "Pasien Skema", whatsapp: PATIENT_WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("kunjungan final tidak bisa diubah, dikembalikan ke draf, atau dihapus lewat SQL langsung", async () => {
    const id = await encounter("FINAL");

    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Encounter" SET "assessment" = 'diubah' WHERE "id" = $1`, id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Encounter" SET "status" = 'DRAF' WHERE "id" = $1`, id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Encounter" WHERE "id" = $1`, id)).rejects.toThrow(
      /rekam_medis_terkunci/,
    );

    const row = await prisma.encounter.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "FINAL", assessment: "Obesitas" });
  });

  it("galat trigger dari kueri Prisma biasa dikenali isRecordLockedError", async () => {
    const id = await encounter("FINAL");
    const error = await prisma.encounter.update({ where: { id }, data: { plan: "diubah" } }).catch((e: unknown) => e);
    expect(isRecordLockedError(error)).toBe(true);
    expect(isRecordLockedError(new Error("galat lain"))).toBe(false);
  });

  it("treatment milik kunjungan final tidak bisa ditambah, diubah, atau dihapus", async () => {
    const id = await encounter("FINAL");
    const treatment = await prisma.encounterTreatment.findFirstOrThrow({ where: { encounterId: id } });

    await expect(
      prisma.encounterTreatment.create({
        data: { encounterId: id, serviceId: world.treatmentId, serviceName: "Facial Uji", performerId: world.therapistId, performerName: "Terapis Uji" },
      }),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "EncounterTreatment" SET "area" = 'Dahi' WHERE "id" = $1`, treatment.id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "EncounterTreatment" WHERE "id" = $1`, treatment.id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    expect(await prisma.encounterTreatment.count({ where: { encounterId: id } })).toBe(1);
  });

  it("draf boleh diubah, lalu dibuang beserta treatment-nya", async () => {
    const id = await encounter("DRAF");
    await prisma.encounter.update({ where: { id }, data: { plan: "Kontrol 1 minggu" } });
    await prisma.encounterTreatment.updateMany({ where: { encounterId: id }, data: { area: "Perut" } });

    await prisma.encounter.delete({ where: { id } });
    expect(await prisma.encounterTreatment.count({ where: { encounterId: id } })).toBe(0);
  });

  it("adendum hanya untuk kunjungan final, dan tidak pernah bisa diubah atau dihapus", async () => {
    const draftId = await encounter("DRAF");
    await expect(
      prisma.encounterAddendum.create({ data: { encounterId: draftId, text: "Koreksi", authorId: world.doctorId, authorName: "dr. Uji" } }),
    ).rejects.toThrow(/rekam_medis_terkunci/);

    const finalId = await encounter("FINAL");
    const addendum = await prisma.encounterAddendum.create({
      data: { encounterId: finalId, text: "Tensi diukur ulang: 118/78.", authorId: world.doctorId, authorName: "dr. Uji" },
    });
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "EncounterAddendum" SET "text" = 'diubah' WHERE "id" = $1`, addendum.id),
    ).rejects.toThrow(/rekam_medis_terkunci/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "EncounterAddendum" WHERE "id" = $1`, addendum.id)).rejects.toThrow(
      /rekam_medis_terkunci/,
    );
    await expect(
      prisma.encounterAddendum.create({ data: { encounterId: finalId, text: "   ", authorId: world.doctorId, authorName: "dr. Uji" } }),
    ).rejects.toThrow();
  });

  it("TRUNCATE ditolak untuk ketiga tabel", async () => {
    await encounter("FINAL");
    for (const table of ["EncounterAddendum", "EncounterTreatment", "Encounter"]) {
      await expect(prisma.$executeRawUnsafe(`TRUNCATE "${table}" CASCADE`)).rejects.toThrow(/rekam_medis_terkunci/);
    }
  });

  it("CHECK menolak tanda vital di luar rentang, tensi tidak berpasangan, dan final tanpa penilaian", async () => {
    const make = async (data: Record<string, unknown>) => {
      const appointment = await attended();
      return prisma.encounter.create({
        data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji", ...data },
      });
    };
    await expect(make({ systolic: 261, diastolic: 80 })).rejects.toThrow();
    await expect(make({ systolic: 120 })).rejects.toThrow();
    await expect(make({ systolic: 120, diastolic: 120 })).rejects.toThrow();
    await expect(make({ temperatureC: 42.1 })).rejects.toThrow();
    await expect(make({ weightKg: 19.9 })).rejects.toThrow();
    await expect(make({ systolic: 120, diastolic: 80, temperatureC: 36.5, weightKg: 72.5, heightCm: 160, waistCm: 88, pulse: 80 })).resolves.toBeTruthy();

    const blank = await encounter("DRAF", "   ");
    await expect(
      prisma.encounter.update({
        where: { id: blank },
        data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
      }),
    ).rejects.toThrow();
    const unsigned = await encounter("DRAF");
    await expect(prisma.encounter.update({ where: { id: unsigned }, data: { status: "FINAL" } })).rejects.toThrow();
  });

  it("purgeEncounters mengosongkan kunjungan uji lalu menyalakan trigger lagi", async () => {
    await encounter("FINAL");
    await purgeEncounters(prisma);
    expect(await prisma.encounter.count()).toBe(0);

    const id = await encounter("FINAL");
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Encounter" WHERE "id" = $1`, id)).rejects.toThrow(
      /rekam_medis_terkunci/,
    );
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/encounter-schema.test.ts`
Expected: FAIL. Impor `../purge-encounters` dan `isRecordLockedError` belum ada, dan model `encounter` belum dikenal.

- [ ] **Step 3: Tambahkan model ke `prisma/schema.prisma`**

Di model `Patient`, sesudah `medicalHistory String?`:

```prisma
  /// Catatan penting dari dokter (mis. "takut jarum"), tampil sebagai peringatan
  /// di setiap kunjungan. Hanya untuk record:read.
  importantNotes      String?
  /// Nomor rekam medis kertas lama, agar front office tahu ada berkas di lemari.
  paperRecordNumber   String?
```

Di model `Appointment`, sesudah `intake     Intake?`:

```prisma
  encounter  Encounter?
```

Di akhir berkas:

```prisma
enum EncounterStatus {
  DRAF
  FINAL
}

/// Kunjungan: catatan SOAP dokter untuk satu booking yang sudah hadir. Pasien
/// dan cabang dibaca dari booking-nya, tidak disalin. Catatan FINAL dikunci
/// trigger PostgreSQL di migrasi kunjungan_dokter: tidak bisa diubah atau
/// dihapus, koreksi hanya lewat EncounterAddendum. Spec:
/// docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md.
model Encounter {
  id     String          @id @default(cuid())
  status EncounterStatus @default(DRAF)

  subjective   String?
  physicalExam String?
  assessment   String?
  plan         String?

  systolic     Int?
  diastolic    Int?
  pulse        Int?
  temperatureC Decimal? @db.Decimal(3, 1)
  weightKg     Decimal? @db.Decimal(5, 1)
  heightCm     Decimal? @db.Decimal(5, 1)
  waistCm      Decimal? @db.Decimal(5, 1)

  /// Id dan nama staf disalin seperti AuditLog, tanpa relasi: catatan tetap
  /// terbaca walau staf kelak dinonaktifkan.
  createdById     String
  createdByName   String
  finalizedById   String?
  finalizedByName String?
  finalizedAt     DateTime?

  appointmentId String      @unique
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Restrict)

  treatments EncounterTreatment[]
  addenda    EncounterAddendum[]

  createdAt DateTime @default(now())
  /// Juga dipakai sebagai versi: simpan draf ditolak bila berbeda dari yang dibaca halaman.
  updatedAt DateTime @updatedAt

  @@index([status])
}

/// Treatment yang dilakukan pada satu kunjungan. Layanan dan pelaksana dirujuk
/// tanpa relasi dan namanya disalin, agar catatan lama tidak ikut berubah.
model EncounterTreatment {
  id            String    @id @default(cuid())
  encounterId   String
  encounter     Encounter @relation(fields: [encounterId], references: [id], onDelete: Cascade)
  serviceId     String
  serviceName   String
  area          String?
  dose          String?
  performerId   String
  performerName String
  notes         String?
  sortOrder     Int       @default(0)

  @@index([encounterId])
}

/// Koreksi atas kunjungan final. Hanya bisa ditambahkan, tidak pernah diubah atau dihapus.
model EncounterAddendum {
  id          String    @id @default(cuid())
  encounterId String
  encounter   Encounter @relation(fields: [encounterId], references: [id], onDelete: Restrict)
  text        String
  authorId    String
  authorName  String
  createdAt   DateTime  @default(now())

  @@index([encounterId])
}
```

- [ ] **Step 4: Tulis migrasi**

`prisma/migrations/20260930150000_kunjungan_dokter/migration.sql`:

```sql
-- Rekam medis bagian 1: catatan dokter per kunjungan.
-- Spec: docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md bagian 6.

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('DRAF', 'FINAL');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "importantNotes" TEXT,
ADD COLUMN "paperRecordNumber" TEXT;

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'DRAF',
    "subjective" TEXT,
    "physicalExam" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse" INTEGER,
    "temperatureC" DECIMAL(3,1),
    "weightKg" DECIMAL(5,1),
    "heightCm" DECIMAL(5,1),
    "waistCm" DECIMAL(5,1),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "finalizedById" TEXT,
    "finalizedByName" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "appointmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterTreatment" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "area" TEXT,
    "dose" TEXT,
    "performerId" TEXT NOT NULL,
    "performerName" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EncounterTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterAddendum" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_appointmentId_key" ON "Encounter"("appointmentId");
CREATE INDEX "Encounter_status_idx" ON "Encounter"("status");
CREATE INDEX "EncounterTreatment_encounterId_idx" ON "EncounterTreatment"("encounterId");
CREATE INDEX "EncounterAddendum_encounterId_idx" ON "EncounterAddendum"("encounterId");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EncounterTreatment" ADD CONSTRAINT "EncounterTreatment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterAddendum" ADD CONSTRAINT "EncounterAddendum_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rentang tanda vital sama dengan src/lib/encounter.ts (spec bagian 5).
ALTER TABLE "Encounter" ADD CONSTRAINT encounter_vitals_range CHECK (
  ("systolic" IS NULL OR "systolic" BETWEEN 50 AND 260)
  AND ("diastolic" IS NULL OR "diastolic" BETWEEN 30 AND 160)
  AND ("pulse" IS NULL OR "pulse" BETWEEN 30 AND 220)
  AND ("temperatureC" IS NULL OR "temperatureC" BETWEEN 34 AND 42)
  AND ("weightKg" IS NULL OR "weightKg" BETWEEN 20 AND 300)
  AND ("heightCm" IS NULL OR "heightCm" BETWEEN 100 AND 230)
  AND ("waistCm" IS NULL OR "waistCm" BETWEEN 40 AND 200)
);

-- Tensi selalu berpasangan, dan diastolik lebih kecil dari sistolik.
ALTER TABLE "Encounter" ADD CONSTRAINT encounter_blood_pressure_pair CHECK (
  ("systolic" IS NULL) = ("diastolic" IS NULL)
  AND ("systolic" IS NULL OR "diastolic" < "systolic")
);

-- Catatan final selalu punya penilaian dan penanda siapa/kapan (spec R13).
ALTER TABLE "Encounter" ADD CONSTRAINT encounter_final_complete CHECK (
  "status" = 'DRAF'
  OR (
    "finalizedAt" IS NOT NULL
    AND "finalizedById" IS NOT NULL
    AND "finalizedByName" IS NOT NULL
    AND btrim(coalesce("assessment", '')) <> ''
  )
);

ALTER TABLE "EncounterAddendum" ADD CONSTRAINT encounter_addendum_text CHECK (btrim("text") <> '');

-- Penguncian rekam medis (Permenkes 24/2022, PRD F12). Aplikasi sudah memakai
-- pembaruan bersyarat; trigger ini jaring terakhir untuk bug, skrip, dan SQL
-- langsung. Hanya pemilik tabel yang bisa mematikannya lewat DDL (lihat
-- tests/purge-encounters.ts, dipakai khusus basis data uji). Semua pesan
-- diawali "rekam_medis_terkunci" agar server bisa menerjemahkannya.
CREATE FUNCTION encounter_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'FINAL' THEN
    RAISE EXCEPTION 'rekam_medis_terkunci: kunjungan % sudah final', OLD."id";
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER encounter_locked
BEFORE UPDATE OR DELETE ON "Encounter"
FOR EACH ROW EXECUTE FUNCTION encounter_locked();

CREATE FUNCTION encounter_treatment_locked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "EncounterStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    -- Induk yang sudah tidak ada berarti cascade dari draf yang dibuang:
    -- kunjungan final tidak pernah bisa dihapus (encounter_locked).
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = OLD."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: treatment kunjungan % sudah final', OLD."encounterId";
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = NEW."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: treatment kunjungan % sudah final', NEW."encounterId";
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER encounter_treatment_locked
BEFORE INSERT OR UPDATE OR DELETE ON "EncounterTreatment"
FOR EACH ROW EXECUTE FUNCTION encounter_treatment_locked();

CREATE FUNCTION encounter_addendum_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "EncounterStatus";
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = NEW."encounterId";
    IF parent_status IS DISTINCT FROM 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: adendum hanya untuk kunjungan final';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'rekam_medis_terkunci: adendum tidak bisa diubah atau dihapus';
END;
$$;

CREATE TRIGGER encounter_addendum_guard
BEFORE INSERT OR UPDATE OR DELETE ON "EncounterAddendum"
FOR EACH ROW EXECUTE FUNCTION encounter_addendum_guard();

-- TRUNCATE melewati trigger per baris, jadi ditolak sendiri.
CREATE FUNCTION medical_record_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rekam_medis_terkunci: tabel % tidak boleh dikosongkan', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER encounter_no_truncate BEFORE TRUNCATE ON "Encounter"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();
CREATE TRIGGER encounter_treatment_no_truncate BEFORE TRUNCATE ON "EncounterTreatment"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();
CREATE TRIGGER encounter_addendum_no_truncate BEFORE TRUNCATE ON "EncounterAddendum"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();
```

- [ ] **Step 5: Terapkan migrasi dan periksa selisih skema**

Run, berurutan:

```bash
npx prisma migrate deploy
npm run db:migrate:test
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: kedua `migrate deploy` menerapkan `20260930150000_kunjungan_dokter`, dan `migrate diff` keluar dengan kode 0 tanpa selisih. Bila ada selisih, samakan `schema.prisma` dengan SQL (nama indeks, tipe desimal, default). Jangan mengubah migrasi yang sudah diterapkan ke basis data lain.

- [ ] **Step 6: Pembersih kunjungan untuk basis data uji**

`tests/purge-encounters.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

const TABLES = ['"EncounterAddendum"', '"EncounterTreatment"', '"Encounter"'] as const;

/**
 * Menghapus semua kunjungan di basis data UJI. Kunjungan final dikunci trigger
 * (migrasi kunjungan_dokter), jadi trigger buatan kita dimatikan sementara di
 * dalam satu transaksi: bila penghapusan gagal, trigger tetap menyala. Hanya
 * pemilik tabel yang bisa melakukannya, dan aplikasi tidak pernah memakainya.
 */
export async function purgeEncounters(db: PrismaClient): Promise<void> {
  await db.$transaction([
    ...TABLES.map((table) => db.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER USER`)),
    ...TABLES.map((table) => db.$executeRawUnsafe(`DELETE FROM ${table}`)),
    ...TABLES.map((table) => db.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER USER`)),
  ]);
}
```

`tests/integration/global-setup.ts`: impor `import { purgeEncounters } from "../purge-encounters";`, lalu panggil `await purgeEncounters(prisma);` sebagai baris pertama di dalam `try`, sebelum `prisma.slotHold.deleteMany()`. Perbarui komentar di atas fungsi: "…meninggalkan booking, isian, kunjungan, dan hold."

`tests/integration/public-booking-world.ts`: impor `import { purgeEncounters } from "../purge-encounters";`, lalu jadikan `await purgeEncounters(prisma);` baris pertama `cleanupBookingWorld`, dengan komentar:

```ts
  // Kunjungan menahan booking (FK Restrict) dan kunjungan final tidak bisa dihapus
  // biasa. Berkas uji berjalan berurutan (fileParallelism: false), jadi aman
  // mengosongkan semuanya.
```

`tests/e2e/prepare-db.mts`: impor `import { purgeEncounters } from "../purge-encounters";`, lalu panggil `await purgeEncounters(prisma);` sebelum `await prisma.slotHold.deleteMany();`.

- [ ] **Step 7: Penerjemah galat trigger**

Tambahkan di akhir `src/server/db-errors.ts`:

```ts
/** Awalan pesan trigger penguncian rekam medis (migrasi kunjungan_dokter). */
export const RECORD_LOCKED_MARKER = "rekam_medis_terkunci";

/**
 * Trigger menolak perubahan pada kunjungan final, treatment-nya, atau adendum.
 * Pesannya ada di `message` (kueri mentah maupun kueri model lewat adapter-pg);
 * `meta` diperiksa juga untuk berjaga bila bentuk galat Prisma berubah.
 */
export function isRecordLockedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes(RECORD_LOCKED_MARKER)) return true;
  const meta = (error as { meta?: unknown }).meta;
  return meta !== undefined && JSON.stringify(meta).includes(RECORD_LOCKED_MARKER);
}
```

- [ ] **Step 8: Jalankan uji dan pastikan lolos**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/encounter-schema.test.ts`
Expected: PASS (8 uji).

Run: `npm run test:integration`
Expected: PASS. Semua berkas lama tetap hijau, karena pembersihan kini mendahulukan kunjungan.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260930150000_kunjungan_dokter tests/purge-encounters.ts tests/integration/global-setup.ts tests/integration/public-booking-world.ts tests/e2e/prepare-db.mts src/server/db-errors.ts tests/integration/encounter-schema.test.ts
git commit -m "feat: encounter tables with database-enforced lock on final records"
```

---

### Task 2: Aturan isian kunjungan

**Files:**
- Create: `src/lib/encounter.ts`, `src/lib/audit-window.ts`, `src/lib/audit-labels.ts`
- Modify: `src/lib/kuis/clinical-view.ts`
- Test: `tests/unit/encounter.test.ts`, `tests/unit/audit-window.test.ts`, `tests/unit/kuis/clinical-view.test.ts`

**Interfaces:**
- Produces (dari `@/lib/encounter`):
  - konstanta `ENCOUNTER_TEXT_MAX = 5000`, `TREATMENT_TEXT_MAX = { area: 100, dose: 100, notes: 1000 }`, `TREATMENTS_MAX = 20`, `IMPORTANT_NOTES_MAX = 2000`, `PAPER_RECORD_NUMBER_MAX = 50`, `FINALIZE_NEEDS_ASSESSMENT`;
  - `VITALS`, `VITAL_KEYS`, `type VitalKey`, `TEXT_FIELDS`, `type TextKey`;
  - `type TreatmentInput`, `type EncounterDraftInput`, `type EncounterDraft`, `type EncounterOptions`, `type Parsed<T>`;
  - `encounterDraftInputSchema`, `parseVital(key, raw): Parsed<number | null>`, `parseEncounterDraft(input): Parsed<EncounterDraft>`, `emptyDraftInput()`;
  - `bmi(weightKg, heightCm): number | null`, `formatDecimal(value, maxFractionDigits?)`, `vitalInputValue(key, value)`, `describeVitals(values)`, `assessmentPreview(text, max?)`, `ageInYears(birthDate, onDate)`.
- Produces: `AUDIT_REPEAT_WINDOW_MS`, `shouldRecordRepeat(last, now, windowMs?)` dari `@/lib/audit-window`; `auditActionLabel(action)` dan `auditRoleLabel(role)` dari `@/lib/audit-labels`.
- Produces: `ClinicalView.pregnancy: boolean`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/encounter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ageInYears,
  assessmentPreview,
  bmi,
  describeVitals,
  emptyDraftInput,
  encounterDraftInputSchema,
  parseEncounterDraft,
  parseVital,
  vitalInputValue,
  type EncounterDraftInput,
} from "@/lib/encounter";

function draft(patch: Omit<Partial<EncounterDraftInput>, "vitals"> & { vitals?: Partial<EncounterDraftInput["vitals"]> } = {}) {
  const base = emptyDraftInput();
  return { ...base, ...patch, vitals: { ...base.vitals, ...patch.vitals } };
}

describe("parseVital", () => {
  it("menerima koma, titik, dan spasi di tepi", () => {
    expect(parseVital("weightKg", " 72,5 ")).toEqual({ ok: true, value: 72.5 });
    expect(parseVital("temperatureC", "36.5")).toEqual({ ok: true, value: 36.5 });
    expect(parseVital("systolic", " 120 ")).toEqual({ ok: true, value: 120 });
  });

  it("kosong berarti tidak diukur", () => {
    expect(parseVital("pulse", "   ")).toEqual({ ok: true, value: null });
  });

  it("menerima batas rentang dan menolak di luar rentang dengan menyebut rentangnya", () => {
    expect(parseVital("weightKg", "20")).toEqual({ ok: true, value: 20 });
    expect(parseVital("systolic", "260")).toEqual({ ok: true, value: 260 });
    expect(parseVital("systolic", "49")).toEqual({ ok: false, message: "Sistolik harus 50–260 mmHg." });
    expect(parseVital("temperatureC", "42,1")).toEqual({ ok: false, message: "Suhu harus 34–42 °C." });
    expect(parseVital("waistCm", "1200")).toEqual({ ok: false, message: "Lingkar pinggang/perut harus 40–200 cm." });
  });

  it("menolak pecahan di kolom bilangan bulat, lebih dari satu desimal, dan teks", () => {
    expect(parseVital("pulse", "12.5")).toEqual({ ok: false, message: "Nadi harus bilangan bulat." });
    expect(parseVital("weightKg", "72,55")).toEqual({
      ok: false,
      message: "Berat badan paling banyak satu angka di belakang koma.",
    });
    expect(parseVital("heightCm", "160 cm")).toEqual({ ok: false, message: "Tinggi badan harus berupa angka." });
  });
});

describe("parseEncounterDraft", () => {
  it("merapikan teks dan mengubah isian kosong menjadi null", () => {
    const parsed = parseEncounterDraft(draft({ subjective: "  Pusing  ", plan: "   " }));
    expect(parsed).toMatchObject({ ok: true, value: { subjective: "Pusing", plan: null, assessment: null } });
  });

  it("tensi harus berpasangan, dan diastolik lebih kecil dari sistolik", () => {
    expect(parseEncounterDraft(draft({ vitals: { systolic: "120" } }))).toEqual({
      ok: false,
      message: "Isi sistolik dan diastolik bersamaan.",
    });
    expect(parseEncounterDraft(draft({ vitals: { systolic: "120", diastolic: "120" } }))).toEqual({
      ok: false,
      message: "Diastolik harus lebih kecil dari sistolik.",
    });
    expect(parseEncounterDraft(draft({ vitals: { systolic: "120", diastolic: "80" } }))).toMatchObject({
      ok: true,
      value: { vitals: { systolic: 120, diastolic: 80, weightKg: null } },
    });
  });

  it("menolak teks terlalu panjang dengan nama kolomnya", () => {
    expect(parseEncounterDraft(draft({ assessment: "a".repeat(5001) }))).toEqual({
      ok: false,
      message: "Penilaian / diagnosis terlalu panjang (maks. 5.000 karakter).",
    });
  });

  it("treatment wajib punya layanan dan pelaksana; area dibatasi 100 karakter", () => {
    const row = { serviceId: "s1", area: "", dose: "", performerId: "p1", notes: "" };
    expect(parseEncounterDraft(draft({ treatments: [{ ...row, serviceId: "" }] }))).toEqual({
      ok: false,
      message: "Pilih treatment dari daftar.",
    });
    expect(parseEncounterDraft(draft({ treatments: [{ ...row, performerId: "" }] }))).toEqual({
      ok: false,
      message: "Pilih pelaksana treatment.",
    });
    expect(parseEncounterDraft(draft({ treatments: [{ ...row, area: "x".repeat(101) }] }))).toEqual({
      ok: false,
      message: "Area treatment terlalu panjang (maks. 100 karakter).",
    });
    expect(parseEncounterDraft(draft({ treatments: [{ ...row, dose: " 12 unit " }] }))).toMatchObject({
      ok: true,
      value: { treatments: [{ serviceId: "s1", performerId: "p1", area: null, dose: "12 unit", notes: null }] },
    });
  });
});

describe("encounterDraftInputSchema", () => {
  it("menolak bentuk isian yang bukan dari formulir", () => {
    expect(encounterDraftInputSchema.safeParse(emptyDraftInput()).success).toBe(true);
    expect(encounterDraftInputSchema.safeParse({ ...emptyDraftInput(), extra: 1 }).success).toBe(false);
    expect(encounterDraftInputSchema.safeParse({ ...emptyDraftInput(), subjective: 5 }).success).toBe(false);
  });
});

describe("tanda vital untuk dibaca", () => {
  it("IMT satu desimal, null bila berat atau tinggi kosong", () => {
    expect(bmi(72.5, 160)).toBe(28.3);
    expect(bmi(72.5, null)).toBeNull();
  });

  it("nilai isian memakai koma dan tanpa ,0 untuk bilangan bulat", () => {
    expect(vitalInputValue("weightKg", 72.5)).toBe("72,5");
    expect(vitalInputValue("heightCm", 160)).toBe("160");
    expect(vitalInputValue("pulse", null)).toBe("");
  });

  it("describeVitals hanya menyebut yang diukur, dengan IMT di akhir", () => {
    expect(
      describeVitals({ systolic: 120, diastolic: 80, pulse: null, temperatureC: 36.5, weightKg: 72.5, heightCm: 160, waistCm: null }),
    ).toEqual(["Tekanan darah: 120/80 mmHg", "Suhu: 36,5 °C", "Berat badan: 72,5 kg", "Tinggi badan: 160 cm", "IMT 28,3"]);
    expect(
      describeVitals({ systolic: null, diastolic: null, pulse: null, temperatureC: null, weightKg: null, heightCm: null, waistCm: null }),
    ).toEqual([]);
  });
});

describe("assessmentPreview", () => {
  it("meratakan spasi dan memotong sampai 80 karakter dengan elipsis", () => {
    expect(assessmentPreview("Obesitas\nderajat   1")).toBe("Obesitas derajat 1");
    const preview = assessmentPreview("a".repeat(120))!;
    expect(preview).toHaveLength(80);
    expect(preview.endsWith("…")).toBe(true);
    expect(assessmentPreview("   ")).toBeNull();
    expect(assessmentPreview(null)).toBeNull();
  });
});

describe("ageInYears", () => {
  it("menghitung umur pada tanggal kunjungan", () => {
    const birth = new Date("1990-05-17T00:00:00Z");
    expect(ageInYears(birth, "2026-05-16")).toBe(35);
    expect(ageInYears(birth, "2026-05-17")).toBe(36);
  });
});
```

`tests/unit/audit-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { auditActionLabel, auditRoleLabel } from "@/lib/audit-labels";
import { AUDIT_REPEAT_WINDOW_MS, shouldRecordRepeat } from "@/lib/audit-window";

describe("shouldRecordRepeat", () => {
  const now = new Date("2026-10-01T03:00:00Z");

  it("mencatat bila belum pernah ada baris", () => {
    expect(shouldRecordRepeat(null, now)).toBe(true);
  });

  it("tidak mencatat lagi dalam 30 menit, dan mencatat tepat setelahnya", () => {
    expect(shouldRecordRepeat(new Date(now.getTime() - AUDIT_REPEAT_WINDOW_MS + 1), now)).toBe(false);
    expect(shouldRecordRepeat(new Date(now.getTime() - AUDIT_REPEAT_WINDOW_MS), now)).toBe(true);
  });
});

describe("label jejak catatan", () => {
  it("menerjemahkan aksi dan peran, dan membiarkan yang tidak dikenal apa adanya", () => {
    expect(auditActionLabel("encounter.view")).toBe("membuka");
    expect(auditActionLabel("encounter.finalize")).toBe("memfinalisasi");
    expect(auditActionLabel("lain.aksi")).toBe("lain.aksi");
    expect(auditRoleLabel("DOKTER")).toBe("Dokter");
    expect(auditRoleLabel("SUPER_ADMIN")).toBe("Super Admin");
  });
});
```

Tambahkan di akhir `describe` pada `tests/unit/kuis/clinical-view.test.ts`:

```ts
  it("menandai hamil/menyusui hanya bila K4 dijawab Ya, di versi 1 maupun 2", () => {
    const pregnantV2 = { ...v2.slimmingNewPatient, health: { ...v2.slimmingNewPatient.health, pregnancy: "YA" } };
    expect(clinicalView({ quizVersion: 2, answers: pregnantV2, weightKg: null, heightCm: null }).pregnancy).toBe(true);
    expect(clinicalView({ quizVersion: 2, answers: v2.slimmingNewPatient, weightKg: null, heightCm: null }).pregnancy).toBe(false);
    expect(clinicalView({ quizVersion: 1, answers: v1.slimmingReturningPatient, weightKg: null, heightCm: null }).pregnancy).toBe(false);
    const pregnantV1 = { ...v1.slimmingNewPatient, health: { ...v1.slimmingNewPatient.health, pregnancy: "YA" } };
    expect(clinicalView({ quizVersion: 1, answers: pregnantV1, weightKg: null, heightCm: null }).pregnancy).toBe(true);
  });
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/encounter.test.ts tests/unit/audit-window.test.ts tests/unit/kuis/clinical-view.test.ts`
Expected: FAIL. Modul `@/lib/encounter`, `@/lib/audit-window`, dan `@/lib/audit-labels` belum ada, dan `pregnancy` masih `undefined`.

- [ ] **Step 3: Tulis `src/lib/encounter.ts`**

```ts
import { z } from "zod";

/**
 * Aturan isian catatan kunjungan (spec catatan dokter, bagian 5). Formulir di
 * browser memakainya untuk pesan langsung, dan server memeriksa ulang dengan
 * aturan yang sama. Rentang vital juga dijaga CHECK di migrasi kunjungan_dokter.
 */

export const ENCOUNTER_TEXT_MAX = 5000;
export const TREATMENT_TEXT_MAX = { area: 100, dose: 100, notes: 1000 } as const;
export const TREATMENTS_MAX = 20;
export const IMPORTANT_NOTES_MAX = 2000;
export const PAPER_RECORD_NUMBER_MAX = 50;
export const ASSESSMENT_PREVIEW_MAX = 80;

export const FINALIZE_NEEDS_ASSESSMENT = "Isi penilaian (A) sebelum finalisasi.";

export const VITALS = {
  systolic: { label: "Sistolik", unit: "mmHg", min: 50, max: 260, decimals: 0 },
  diastolic: { label: "Diastolik", unit: "mmHg", min: 30, max: 160, decimals: 0 },
  pulse: { label: "Nadi", unit: "/menit", min: 30, max: 220, decimals: 0 },
  temperatureC: { label: "Suhu", unit: "°C", min: 34, max: 42, decimals: 1 },
  weightKg: { label: "Berat badan", unit: "kg", min: 20, max: 300, decimals: 1 },
  heightCm: { label: "Tinggi badan", unit: "cm", min: 100, max: 230, decimals: 1 },
  waistCm: { label: "Lingkar pinggang/perut", unit: "cm", min: 40, max: 200, decimals: 1 },
} as const;

export type VitalKey = keyof typeof VITALS;
export const VITAL_KEYS = Object.keys(VITALS) as VitalKey[];

export const TEXT_FIELDS = {
  subjective: "Keluhan dan anamnesis dokter",
  physicalExam: "Pemeriksaan fisik",
  assessment: "Penilaian / diagnosis",
  plan: "Rencana, program, dan resep",
} as const;

export type TextKey = keyof typeof TEXT_FIELDS;
const TEXT_KEYS = Object.keys(TEXT_FIELDS) as TextKey[];

/** Satu baris treatment apa adanya dari formulir. */
export type TreatmentInput = { serviceId: string; area: string; dose: string; performerId: string; notes: string };

/** Isian formulir apa adanya (teks), seperti yang diketik dokter. */
export type EncounterDraftInput = Record<TextKey, string> & {
  vitals: Record<VitalKey, string>;
  treatments: TreatmentInput[];
};

/** Isian yang sudah diperiksa, siap disimpan. */
export type EncounterDraft = Record<TextKey, string | null> & {
  vitals: Record<VitalKey, number | null>;
  treatments: { serviceId: string; area: string | null; dose: string | null; performerId: string; notes: string | null }[];
};

/** Pilihan treatment dan pelaksana di formulir, dengan usulan baris baru. */
export type EncounterOptions = {
  services: { id: string; name: string }[];
  performers: { id: string; name: string }[];
  defaultServiceId: string;
  defaultPerformerId: string;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const text = z.string().max(10_000);
const vital = z.string().max(20);

/** Bentuk isian yang boleh dikirim browser; isi dan pesannya diperiksa parseEncounterDraft. */
export const encounterDraftInputSchema = z
  .object({
    subjective: text,
    physicalExam: text,
    assessment: text,
    plan: text,
    vitals: z
      .object({
        systolic: vital,
        diastolic: vital,
        pulse: vital,
        temperatureC: vital,
        weightKg: vital,
        heightCm: vital,
        waistCm: vital,
      })
      .strict(),
    treatments: z
      .array(
        z
          .object({ serviceId: z.string().max(100), area: text, dose: text, performerId: z.string().max(100), notes: text })
          .strict(),
      )
      .max(TREATMENTS_MAX * 2),
  })
  .strict();

const numberFormats = {
  0: new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0, useGrouping: false }),
  1: new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, useGrouping: false }),
} as const;

/** 72.5 → "72,5"; 160 → "160" — tanda desimal Indonesia. */
export function formatDecimal(value: number, maxFractionDigits: 0 | 1 = 1): string {
  return numberFormats[maxFractionDigits].format(value);
}

function tooLong(label: string, max: number): string {
  return `${label} terlalu panjang (maks. ${new Intl.NumberFormat("id-ID").format(max)} karakter).`;
}

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Satu angka tanda vital dari teks isian. Koma dan titik sama-sama tanda desimal. */
export function parseVital(key: VitalKey, raw: string): Parsed<number | null> {
  const spec = VITALS[key];
  const value = raw.trim().replace(",", ".");
  if (value === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false, message: `${spec.label} harus berupa angka.` };
  const fraction = value.split(".")[1] ?? "";
  if (spec.decimals === 0 && fraction.length > 0) return { ok: false, message: `${spec.label} harus bilangan bulat.` };
  if (fraction.length > 1) return { ok: false, message: `${spec.label} paling banyak satu angka di belakang koma.` };
  const number = Number(value);
  if (number < spec.min || number > spec.max) {
    return { ok: false, message: `${spec.label} harus ${spec.min}–${spec.max} ${spec.unit}.` };
  }
  return { ok: true, value: number };
}

/** Memeriksa seluruh isian. Pesan pertama yang ditemukan dikembalikan apa adanya ke pengguna. */
export function parseEncounterDraft(input: EncounterDraftInput): Parsed<EncounterDraft> {
  const texts = {} as Record<TextKey, string | null>;
  for (const key of TEXT_KEYS) {
    const value = clean(input[key]);
    if (value && value.length > ENCOUNTER_TEXT_MAX) return { ok: false, message: tooLong(TEXT_FIELDS[key], ENCOUNTER_TEXT_MAX) };
    texts[key] = value;
  }

  const vitals = {} as Record<VitalKey, number | null>;
  for (const key of VITAL_KEYS) {
    const parsed = parseVital(key, input.vitals[key]);
    if (!parsed.ok) return parsed;
    vitals[key] = parsed.value;
  }
  if ((vitals.systolic === null) !== (vitals.diastolic === null)) {
    return { ok: false, message: "Isi sistolik dan diastolik bersamaan." };
  }
  if (vitals.systolic !== null && vitals.diastolic !== null && vitals.diastolic >= vitals.systolic) {
    return { ok: false, message: "Diastolik harus lebih kecil dari sistolik." };
  }

  if (input.treatments.length > TREATMENTS_MAX) {
    return { ok: false, message: `Paling banyak ${TREATMENTS_MAX} treatment per kunjungan.` };
  }
  const treatments: EncounterDraft["treatments"] = [];
  for (const row of input.treatments) {
    if (!row.serviceId) return { ok: false, message: "Pilih treatment dari daftar." };
    if (!row.performerId) return { ok: false, message: "Pilih pelaksana treatment." };
    const area = clean(row.area);
    const dose = clean(row.dose);
    const notes = clean(row.notes);
    if (area && area.length > TREATMENT_TEXT_MAX.area) return { ok: false, message: tooLong("Area treatment", TREATMENT_TEXT_MAX.area) };
    if (dose && dose.length > TREATMENT_TEXT_MAX.dose) return { ok: false, message: tooLong("Dosis treatment", TREATMENT_TEXT_MAX.dose) };
    if (notes && notes.length > TREATMENT_TEXT_MAX.notes) {
      return { ok: false, message: tooLong("Catatan pasca-tindakan", TREATMENT_TEXT_MAX.notes) };
    }
    treatments.push({ serviceId: row.serviceId, area, dose, performerId: row.performerId, notes });
  }

  return { ok: true, value: { ...texts, vitals, treatments } };
}

export function emptyDraftInput(): EncounterDraftInput {
  return {
    subjective: "",
    physicalExam: "",
    assessment: "",
    plan: "",
    vitals: { systolic: "", diastolic: "", pulse: "", temperatureC: "", weightKg: "", heightCm: "", waistCm: "" },
    treatments: [],
  };
}

export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null) return null;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

/** Angka tersimpan → teks isian formulir ("72,5"), atau "" bila tidak diukur. */
export function vitalInputValue(key: VitalKey, value: number | null): string {
  return value === null ? "" : formatDecimal(value, VITALS[key].decimals);
}

/** Baris tanda vital yang diukur, untuk tampilan baca-saja. IMT di akhir. */
export function describeVitals(values: Record<VitalKey, number | null>): string[] {
  const lines: string[] = [];
  if (values.systolic !== null && values.diastolic !== null) {
    lines.push(`Tekanan darah: ${values.systolic}/${values.diastolic} mmHg`);
  }
  for (const key of ["pulse", "temperatureC", "weightKg", "heightCm", "waistCm"] as const) {
    const value = values[key];
    if (value !== null) lines.push(`${VITALS[key].label}: ${vitalInputValue(key, value)} ${VITALS[key].unit}`);
  }
  const index = bmi(values.weightKg, values.heightCm);
  if (index !== null) lines.push(`IMT ${formatDecimal(index)}`);
  return lines;
}

/** Cuplikan penilaian untuk Riwayat kunjungan (spec 4.8). */
export function assessmentPreview(value: string | null, max = ASSESSMENT_PREVIEW_MAX): string | null {
  if (!value) return null;
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat === "") return null;
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Umur dalam tahun pada tanggal WITA "YYYY-MM-DD". `birthDate` adalah kolom @db.Date (dibaca dari UTC). */
export function ageInYears(birthDate: Date, onDate: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.toISOString().slice(0, 10).split("-").map(Number);
  const [year, month, day] = onDate.split("-").map(Number);
  const beforeBirthday = month < birthMonth || (month === birthMonth && day < birthDay);
  return year - birthYear - (beforeBirthday ? 1 : 0);
}
```

Catatan untuk `assessmentPreview`: bila potongan 79 karakter berakhir spasi, `trimEnd()` membuat hasilnya lebih pendek dari 80. Uji hanya memakai huruf tanpa spasi, jadi panjangnya tepat 80.

- [ ] **Step 4: Tulis `src/lib/audit-window.ts` dan `src/lib/audit-labels.ts`**

`src/lib/audit-window.ts`:

```ts
/**
 * Membuka catatan dan mengubah draf dicatat paling banyak sekali per staf per
 * catatan dalam jendela ini (spec R12). Memuat ulang halaman atau simpan
 * otomatis tiap beberapa detik tidak membanjiri jejak audit.
 */
export const AUDIT_REPEAT_WINDOW_MS = 30 * 60 * 1000;

export function shouldRecordRepeat(last: Date | null, now: Date, windowMs = AUDIT_REPEAT_WINDOW_MS): boolean {
  return last === null || now.getTime() - last.getTime() >= windowMs;
}
```

`src/lib/audit-labels.ts`:

```ts
/** Bahasa manusia untuk "Jejak catatan ini" (spec bagian 9). */
const ACTION_LABEL: Record<string, string> = {
  "encounter.create": "membuat kunjungan",
  "encounter.edit-draft": "mengubah draf",
  "encounter.finalize": "memfinalisasi",
  "encounter.discard": "membuang draf",
  "encounter.addendum": "menambah adendum",
  "encounter.view": "membuka",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  DOKTER: "Dokter",
  RESEPSIONIS: "Resepsionis",
  TERAPIS: "Terapis",
  SISTEM: "Sistem",
  PASIEN: "Pasien",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export function auditRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}
```

- [ ] **Step 5: Tambahkan `pregnancy` ke `clinicalView`**

Di `src/lib/kuis/clinical-view.ts`, tambahkan ke tipe `ClinicalView` sesudah `proposal: RecordProposal;`:

```ts
  /** Jawaban K4 "Ya": hamil, merencanakan kehamilan, atau menyusui (peringatan kunjungan, spec R6). */
  pregnancy: boolean;
```

Tambahkan `pregnancy: answers.health?.pregnancy === "YA",` pada objek yang dikembalikan cabang versi 1 dan cabang versi 2, masing-masing sesudah baris `proposal: …`.

- [ ] **Step 6: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/encounter.test.ts tests/unit/audit-window.test.ts tests/unit/kuis/clinical-view.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 7: Commit**

```bash
git add src/lib/encounter.ts src/lib/audit-window.ts src/lib/audit-labels.ts src/lib/kuis/clinical-view.ts tests/unit/encounter.test.ts tests/unit/audit-window.test.ts tests/unit/kuis/clinical-view.test.ts
git commit -m "feat: encounter form rules, vitals formatting and pregnancy flag"
```

---

### Task 3: Aksi server kunjungan

**Files:**
- Create: `src/server/encounter.ts`
- Modify: `src/server/audit.ts`
- Test: `tests/integration/encounter.test.ts`

**Interfaces:**
- Consumes: model dari Task 1; `parseEncounterDraft`, `encounterDraftInputSchema`, `ENCOUNTER_TEXT_MAX`, `FINALIZE_NEEDS_ASSESSMENT`, `type EncounterDraftInput`, `type EncounterDraft` (Task 2); `shouldRecordRepeat`, `AUDIT_REPEAT_WINDOW_MS`, `auditActionLabel`, `auditRoleLabel` (Task 2); `isRecordLockedError`, `isUniqueViolation`.
- Produces (dari `@/server/encounter`, semuanya mengembalikan `Promise<ActionResult<…>>`):
  - `openEncounter(appointmentId: string)` → `{ encounterId: string }`
  - `saveEncounterDraft(input: { encounterId: string; version: string; draft: EncounterDraftInput })` → `{ version: string; savedAt: string }`
  - `finalizeEncounter(input: { encounterId: string; version: string; draft: EncounterDraftInput })` → `void`
  - `discardEncounterDraft(input: { encounterId: string; version: string })` → `void`
  - `addEncounterAddendum(input: { encounterId: string; text: string })` → `void`
- Produces (dari `@/server/audit`):
  - `recordAuditThrottled(input: AuditInput, windowMs?: number): Promise<void>`
  - `type AuditTrailRow = { id: string; at: Date; actorName: string; roleLabel: string; actionLabel: string }`
  - `listAuditTrail(entity: string, entityId: string): Promise<AuditTrailRow[]>`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/integration/encounter.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emptyDraftInput, type EncounterDraftInput } from "@/lib/encounter";
import { can } from "@/lib/permissions";
import { cancelAppointment, markNoShow, rescheduleAppointment } from "@/server/appointment";
import {
  addEncounterAddendum,
  discardEncounterDraft,
  finalizeEncounter,
  openEncounter,
  saveEncounterDraft,
} from "@/server/encounter";
import { matchPatient } from "@/server/intake";
import { requireCapability } from "@/server/session";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));

const SLUG = "aksi-kunjungan-uji";
const PATIENT_WA = "6281200007710";
const OTHER_WA = "6281200007711";

function draftWith(
  patch: Omit<Partial<EncounterDraftInput>, "vitals"> & { vitals?: Partial<EncounterDraftInput["vitals"]> } = {},
): EncounterDraftInput {
  const base = emptyDraftInput();
  return { ...base, ...patch, vitals: { ...base.vitals, ...patch.vitals } };
}

describe("aksi kunjungan", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let slot = 0;

  function actAs(role: StaffRole) {
    vi.mocked(requireCapability).mockImplementation(async (capability) => {
      if (!can(role, capability)) throw new Error(`forbidden: ${capability}`);
      return { userId: "u1", staffId: world.doctorId, name: `${role} Uji`, role, email: "uji@sundy.test" };
    });
  }

  /** Booking pada jam berikutnya (06.00, 06.30, …) di `day`, bawaannya HADIR. */
  async function booking(status: "HADIR" | "TERKONFIRMASI" = "HADIR", day = date) {
    slot += 1;
    const minutes = 6 * 60 + slot * 30;
    const startAt = at(day, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    return prisma.appointment.create({
      data: {
        code: `AKJ-${slot}`,
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

  async function opened() {
    const appointment = await booking();
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    return { appointment, encounterId, version: updatedAt.toISOString() };
  }

  const auditCount = (action: string, entityId: string) => prisma.auditLog.count({ where: { action, entityId } });

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, OTHER_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7710", name: "Pasien Aksi", whatsapp: PATIENT_WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, OTHER_WA]);
    await prisma.$disconnect();
  });

  it("Periksa membuat satu kunjungan per booking dan mencatat audit sekali", async () => {
    actAs("DOKTER");
    const appointment = await booking();
    const first = await unwrap(openEncounter(appointment.id));
    const second = await unwrap(openEncounter(appointment.id));

    expect(second.encounterId).toBe(first.encounterId);
    const row = await prisma.encounter.findUniqueOrThrow({ where: { id: first.encounterId } });
    expect(row).toMatchObject({ status: "DRAF", createdById: world.doctorId, createdByName: "DOKTER Uji" });
    expect(await auditCount("encounter.create", first.encounterId)).toBe(1);
  });

  it("dua klik Periksa bersamaan tetap satu kunjungan", async () => {
    actAs("DOKTER");
    const appointment = await booking();
    const [a, b] = await Promise.all([openEncounter(appointment.id), openEncounter(appointment.id)]);
    expect(a.ok && b.ok).toBe(true);
    expect(await prisma.encounter.count({ where: { appointmentId: appointment.id } })).toBe(1);
  });

  it("kunjungan hanya dibuka dari booking yang sudah ditandai hadir", async () => {
    actAs("DOKTER");
    const appointment = await booking("TERKONFIRMASI");
    expect(await openEncounter(appointment.id)).toEqual({
      ok: false,
      error: "Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir.",
    });
  });

  it("resepsionis ditolak di setiap aksi kunjungan", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    actAs("RESEPSIONIS");
    await expect(openEncounter(appointment.id)).rejects.toThrow(/forbidden/);
    await expect(saveEncounterDraft({ encounterId, version, draft: draftWith() })).rejects.toThrow(/forbidden/);
    await expect(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "x" }) })).rejects.toThrow(/forbidden/);
    await expect(discardEncounterDraft({ encounterId, version })).rejects.toThrow(/forbidden/);
    await expect(addEncounterAddendum({ encounterId, text: "x" })).rejects.toThrow(/forbidden/);
  });

  it("menyimpan draf: teks, angka vital, dan treatment dengan nama yang disalin dari basis data", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    const saved = await unwrap(
      saveEncounterDraft({
        encounterId,
        version,
        draft: draftWith({
          subjective: "  Berat naik 3 kg  ",
          vitals: { systolic: "120", diastolic: "80", weightKg: "72,5", heightCm: "160" },
          treatments: [{ serviceId: world.treatmentId, area: "Wajah", dose: "", performerId: world.therapistId, notes: "" }],
        }),
      }),
    );
    expect(saved.version).not.toBe(version);

    const row = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId }, include: { treatments: true } });
    expect(row).toMatchObject({ subjective: "Berat naik 3 kg", systolic: 120, diastolic: 80, pulse: null });
    expect(Number(row.weightKg)).toBe(72.5);
    expect(row.treatments).toEqual([
      expect.objectContaining({ serviceName: "Facial Uji", performerName: "Terapis Uji Publik", area: "Wajah", dose: null, sortOrder: 0 }),
    ]);

    // Simpan berikutnya mengganti seluruh baris treatment.
    await unwrap(saveEncounterDraft({ encounterId, version: saved.version, draft: draftWith({ subjective: "Berat naik 3 kg" }) }));
    expect(await prisma.encounterTreatment.count({ where: { encounterId } })).toBe(0);
  });

  it("menolak versi lama tanpa mengubah catatan yang lebih baru", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    await unwrap(saveEncounterDraft({ encounterId, version, draft: draftWith({ plan: "Tab A" }) }));

    expect(await saveEncounterDraft({ encounterId, version, draft: draftWith({ plan: "Tab B" }) })).toEqual({
      ok: false,
      error: "Catatan ini baru diubah di tempat lain. Muat ulang halaman.",
    });
    expect((await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).plan).toBe("Tab A");
  });

  it("menolak angka vital yang tidak sah dengan pesan yang jelas", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    expect(await saveEncounterDraft({ encounterId, version, draft: draftWith({ vitals: { systolic: "12", diastolic: "8" } }) })).toEqual({
      ok: false,
      error: "Sistolik harus 50–260 mmHg.",
    });
    expect(await saveEncounterDraft({ encounterId, version, draft: { ...draftWith(), extra: true } as never })).toEqual({
      ok: false,
      error: "Isian tidak sah. Muat ulang halaman lalu coba lagi.",
    });
  });

  it("mencatat 'mengubah draf' paling banyak sekali per 30 menit", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    const first = await unwrap(saveEncounterDraft({ encounterId, version, draft: draftWith({ plan: "1" }) }));
    const second = await unwrap(saveEncounterDraft({ encounterId, version: first.version, draft: draftWith({ plan: "2" }) }));
    expect(await auditCount("encounter.edit-draft", encounterId)).toBe(1);

    await prisma.auditLog.updateMany({
      where: { action: "encounter.edit-draft", entityId: encounterId },
      data: { createdAt: new Date(Date.now() - 31 * 60_000) },
    });
    await unwrap(saveEncounterDraft({ encounterId, version: second.version, draft: draftWith({ plan: "3" }) }));
    expect(await auditCount("encounter.edit-draft", encounterId)).toBe(2);
  });

  it("finalisasi butuh penilaian (A)", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    expect(await finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "   " }) })).toEqual({
      ok: false,
      error: "Isi penilaian (A) sebelum finalisasi.",
    });
  });

  it("finalisasi menyimpan isian yang dikirim, mengunci, menandai booking Selesai, dan mengisi kunjungan terakhir", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    await unwrap(
      finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Obesitas derajat 1", plan: "Program MAX" }) }),
    );

    const row = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(row).toMatchObject({ status: "FINAL", assessment: "Obesitas derajat 1", plan: "Program MAX", finalizedByName: "DOKTER Uji" });
    expect(row.finalizedAt).toBeInstanceOf(Date);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("SELESAI");
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).lastVisitAt).toEqual(appointment.startAt);
    expect(await auditCount("encounter.finalize", encounterId)).toBe(1);

    // Catatan final tidak bisa disimpan sebagai draf lagi.
    expect(await saveEncounterDraft({ encounterId, version: row.updatedAt.toISOString(), draft: draftWith() })).toEqual({
      ok: false,
      error: "Catatan ini sudah difinalisasi. Muat ulang halaman.",
    });
  });

  it("kunjungan lama yang difinalisasi belakangan tidak memundurkan kunjungan terakhir", async () => {
    actAs("DOKTER");
    const later = new Date(`${date}T15:00:00Z`);
    await prisma.patient.update({ where: { id: patientId }, data: { lastVisitAt: later } });
    const { encounterId, version } = await opened();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol" }) }));
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).lastVisitAt).toEqual(later);
  });

  it("membuang draf: kunjungan dan treatment terhapus, booking kembali belum diperiksa", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    const saved = await unwrap(
      saveEncounterDraft({
        encounterId,
        version,
        draft: draftWith({ treatments: [{ serviceId: world.treatmentId, area: "", dose: "", performerId: world.doctorId, notes: "" }] }),
      }),
    );
    await unwrap(discardEncounterDraft({ encounterId, version: saved.version }));

    expect(await prisma.encounter.findUnique({ where: { id: encounterId } })).toBeNull();
    expect(await prisma.encounterTreatment.count({ where: { encounterId } })).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("HADIR");
    expect(await auditCount("encounter.discard", encounterId)).toBe(1);

    // Tab lain yang masih terbuka tidak diam-diam membuat kunjungan baru.
    expect(await saveEncounterDraft({ encounterId, version: saved.version, draft: draftWith({ plan: "x" }) })).toEqual({
      ok: false,
      error: "Kunjungan ini sudah tidak ada (drafnya dibuang). Muat ulang halaman.",
    });
    expect(await prisma.encounter.count({ where: { appointmentId: appointment.id } })).toBe(0);
  });

  it("draf yang sudah final tidak bisa dibuang", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol" }) }));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(await discardEncounterDraft({ encounterId, version: updatedAt.toISOString() })).toEqual({
      ok: false,
      error: "Catatan ini sudah difinalisasi. Muat ulang halaman.",
    });
  });

  it("adendum hanya untuk catatan final, wajib berisi, dan tercatat di audit", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    expect(await addEncounterAddendum({ encounterId, text: "Koreksi" })).toEqual({
      ok: false,
      error: "Adendum hanya untuk catatan yang sudah final.",
    });

    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol" }) }));
    expect(await addEncounterAddendum({ encounterId, text: "   " })).toEqual({ ok: false, error: "Tulis isi adendum dulu." });
    await unwrap(addEncounterAddendum({ encounterId, text: "  Tensi diukur ulang: 118/78.  " }));

    const addenda = await prisma.encounterAddendum.findMany({ where: { encounterId } });
    expect(addenda).toEqual([expect.objectContaining({ text: "Tensi diukur ulang: 118/78.", authorName: "DOKTER Uji" })]);
    expect(await auditCount("encounter.addendum", encounterId)).toBe(1);
  });

  it("booking yang sudah hadir atau selesai tidak bisa dibatalkan, ditandai tidak hadir, atau dipindah", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    const tryAll = async () => {
      expect((await cancelAppointment(appointment.id)).ok).toBe(false);
      expect((await markNoShow(appointment.id)).ok).toBe(false);
      const startAt = new Date(appointment.startAt.getTime() + 24 * 60 * 60_000);
      expect((await rescheduleAppointment(appointment.id, { startAt, endAt: new Date(startAt.getTime() + 30 * 60_000) })).ok).toBe(false);
    };
    await tryAll();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol" }) }));
    await tryAll();
  });

  it("booking situs yang sudah hadir dan diperiksa tidak bisa dicocokkan ke pasien lain", async () => {
    actAs("DOKTER");
    const appointment = await booking();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { source: "SITUS" } });
    await prisma.intake.create({
      data: { appointmentId: appointment.id, patientId, status: "TERISI", kind: "LENGKAP", name: "Pasien Aksi", whatsapp: PATIENT_WA, submittedAt: new Date() },
    });
    await unwrap(openEncounter(appointment.id));
    const other = await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7711", name: "Pasien Lain", whatsapp: OTHER_WA } });

    expect((await matchPatient(appointment.id, other.id)).ok).toBe(false);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).patientId).toBe(patientId);
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/encounter.test.ts`
Expected: FAIL. Modul `@/server/encounter` belum ada.

- [ ] **Step 3: Tambahkan audit berjendela dan jejak ke `src/server/audit.ts`**

Tambahkan impor di atas:

```ts
import { auditActionLabel, auditRoleLabel } from "@/lib/audit-labels";
import { AUDIT_REPEAT_WINDOW_MS, shouldRecordRepeat } from "@/lib/audit-window";
```

Tambahkan di akhir berkas:

```ts
/**
 * Seperti recordAudit, tetapi paling banyak sekali per pelaku, aksi, dan
 * catatan dalam jendela 30 menit (spec R12): membuka kunjungan dan menyimpan
 * draf otomatis tidak membanjiri jejak audit.
 */
export async function recordAuditThrottled(input: AuditInput, windowMs = AUDIT_REPEAT_WINDOW_MS): Promise<void> {
  const last = await prisma.auditLog.findFirst({
    where: { actorStaffId: input.actor.staffId, action: input.action, entity: input.entity, entityId: input.entityId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!shouldRecordRepeat(last?.createdAt ?? null, new Date(), windowMs)) return;
  await recordAudit(input);
}

export type AuditTrailRow = { id: string; at: Date; actorName: string; roleLabel: string; actionLabel: string };

/**
 * Jejak satu catatan, terbaru di atas. Tidak memeriksa hak akses sendiri:
 * pemanggil wajib memastikan staf punya audit:read.
 */
export async function listAuditTrail(entity: string, entityId: string): Promise<AuditTrailRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, actorName: true, actorRole: true, action: true },
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.createdAt,
    actorName: row.actorName,
    roleLabel: auditRoleLabel(row.actorRole),
    actionLabel: auditActionLabel(row.action),
  }));
}
```

- [ ] **Step 4: Tulis `src/server/encounter.ts`**

```ts
"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  ENCOUNTER_TEXT_MAX,
  FINALIZE_NEEDS_ASSESSMENT,
  encounterDraftInputSchema,
  parseEncounterDraft,
  type EncounterDraft,
  type EncounterDraftInput,
} from "@/lib/encounter";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit, recordAuditThrottled } from "@/server/audit";
import { isRecordLockedError, isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

const STALE = "Catatan ini baru diubah di tempat lain. Muat ulang halaman.";
const LOCKED = "Catatan ini sudah difinalisasi. Muat ulang halaman.";
const GONE = "Kunjungan ini sudah tidak ada (drafnya dibuang). Muat ulang halaman.";

type Db = Prisma.TransactionClient | typeof prisma;

type TreatmentRow = {
  serviceId: string;
  serviceName: string;
  area: string | null;
  dose: string | null;
  performerId: string;
  performerName: string;
  notes: string | null;
};

function readDraft(input: unknown): EncounterDraft {
  const shape = encounterDraftInputSchema.safeParse(input);
  if (!shape.success) throw new UserFacingError("Isian tidak sah. Muat ulang halaman lalu coba lagi.");
  const parsed = parseEncounterDraft(shape.data);
  if (!parsed.ok) throw new UserFacingError(parsed.message);
  return parsed.value;
}

function readVersion(value: unknown): Date {
  const version = new Date(String(value ?? ""));
  if (Number.isNaN(version.getTime())) throw new UserFacingError("Muat ulang halaman lalu coba lagi.");
  return version;
}

/** Alasan pembaruan bersyarat tidak mengenai baris mana pun. */
async function whyUnchanged(db: Db, encounterId: string): Promise<string> {
  const row = await db.encounter.findUnique({ where: { id: encounterId }, select: { status: true } });
  if (!row) return GONE;
  return row.status === "FINAL" ? LOCKED : STALE;
}

/** Trigger basis data adalah jaring terakhir; pesannya tidak boleh sampai ke layar mentah. */
async function guardLocked<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isRecordLockedError(error)) throw new UserFacingError(LOCKED);
    throw error;
  }
}

/**
 * Nama layanan dan pelaksana dibaca dari basis data, bukan dari browser, lalu
 * disalin (spec bagian 6). Layanan atau staf nonaktif tetap diterima: draf lama
 * boleh memuatnya, dan formulir hanya menawarkan yang aktif.
 */
async function resolveTreatments(draft: EncounterDraft): Promise<TreatmentRow[]> {
  if (draft.treatments.length === 0) return [];
  const [services, performers] = await Promise.all([
    prisma.service.findMany({
      where: { id: { in: draft.treatments.map((row) => row.serviceId) } },
      select: { id: true, name: true },
    }),
    prisma.staff.findMany({
      where: { id: { in: draft.treatments.map((row) => row.performerId) }, role: { in: ["DOKTER", "TERAPIS"] } },
      select: { id: true, name: true },
    }),
  ]);
  const serviceName = new Map(services.map((service) => [service.id, service.name]));
  const performerName = new Map(performers.map((staff) => [staff.id, staff.name]));
  return draft.treatments.map((row) => {
    const service = serviceName.get(row.serviceId);
    const performer = performerName.get(row.performerId);
    if (!service || !performer) {
      throw new UserFacingError("Treatment atau pelaksana tidak ditemukan. Muat ulang halaman.");
    }
    return { ...row, serviceName: service, performerName: performer };
  });
}

/** Menulis draf hanya bila masih DRAF dan versinya sama. Mengembalikan versi baru, atau null. */
async function writeDraft(
  tx: Prisma.TransactionClient,
  encounterId: string,
  version: Date,
  draft: EncounterDraft,
  treatments: TreatmentRow[],
): Promise<Date | null> {
  const { count } = await tx.encounter.updateMany({
    where: { id: encounterId, status: "DRAF", updatedAt: version },
    data: {
      subjective: draft.subjective,
      physicalExam: draft.physicalExam,
      assessment: draft.assessment,
      plan: draft.plan,
      ...draft.vitals,
    },
  });
  if (count === 0) return null;
  // Baris kunjungan sudah terkunci oleh pembaruan di atas sampai transaksi selesai,
  // jadi tidak ada yang bisa memfinalisasinya di sela-sela.
  await tx.encounterTreatment.deleteMany({ where: { encounterId } });
  if (treatments.length > 0) {
    await tx.encounterTreatment.createMany({
      data: treatments.map((row, index) => ({ ...row, encounterId, sortOrder: index })),
    });
  }
  const saved = await tx.encounter.findUniqueOrThrow({ where: { id: encounterId }, select: { updatedAt: true } });
  return saved.updatedAt;
}

function revalidateEncounter(encounterId: string, patientId: string | null) {
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/kunjungan/${encounterId}`);
  if (patientId) safeRevalidatePath(`/admin/pasien/${patientId}`);
}

/**
 * Tombol Periksa (spec 4.3). Membuat kunjungan untuk booking HADIR, atau
 * mengembalikan kunjungan yang sudah ada. Tinggi badan diisikan awal dari
 * kunjungan final terakhir pasien, karena tinggi orang dewasa jarang diukur ulang.
 */
export async function openEncounter(appointmentId: string): Promise<ActionResult<{ encounterId: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const id = String(appointmentId ?? "");
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, code: true, status: true, patientId: true, encounter: { select: { id: true } } },
    });
    if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
    if (appointment.encounter) return { encounterId: appointment.encounter.id };
    if (appointment.status !== "HADIR" || !appointment.patientId) {
      throw new UserFacingError("Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir.");
    }

    const lastHeight = await prisma.encounter.findFirst({
      where: { status: "FINAL", heightCm: { not: null }, appointment: { patientId: appointment.patientId } },
      orderBy: { appointment: { startAt: "desc" } },
      select: { heightCm: true },
    });

    try {
      const created = await prisma.encounter.create({
        data: {
          appointmentId: appointment.id,
          createdById: actor.staffId,
          createdByName: actor.name,
          heightCm: lastHeight?.heightCm ?? null,
        },
        select: { id: true },
      });
      await recordAudit({ actor, action: "encounter.create", entity: "Encounter", entityId: created.id, summary: appointment.code });
      revalidateEncounter(created.id, appointment.patientId);
      return { encounterId: created.id };
    } catch (error) {
      // Dua klik Periksa bersamaan: yang kalah memakai kunjungan milik yang menang.
      if (!isUniqueViolation(error)) throw error;
      const existing = await prisma.encounter.findUniqueOrThrow({ where: { appointmentId: appointment.id }, select: { id: true } });
      return { encounterId: existing.id };
    }
  });
}

/** Simpan otomatis draf (spec 7). Versi lama, draf final, atau draf yang dibuang ditolak dengan pesan. */
export async function saveEncounterDraft(input: {
  encounterId: string;
  version: string;
  draft: EncounterDraftInput;
}): Promise<ActionResult<{ version: string; savedAt: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const draft = readDraft(input?.draft);
    const version = readVersion(input?.version);
    const encounterId = String(input?.encounterId ?? "");
    const treatments = await resolveTreatments(draft);

    const saved = await guardLocked(() =>
      prisma.$transaction(async (tx) => {
        const updatedAt = await writeDraft(tx, encounterId, version, draft, treatments);
        if (!updatedAt) throw new UserFacingError(await whyUnchanged(tx, encounterId));
        return updatedAt;
      }),
    );

    await recordAuditThrottled({ actor, action: "encounter.edit-draft", entity: "Encounter", entityId: encounterId });
    return { version: saved.toISOString(), savedAt: saved.toISOString() };
  });
}

/**
 * Finalisasi (spec R5, R10, R13). Dalam satu transaksi: menyimpan isian yang
 * dikirim, mengunci catatan, menandai booking Selesai, dan memajukan kunjungan
 * terakhir pasien. Bila satu langkah gagal, semuanya batal.
 */
export async function finalizeEncounter(input: {
  encounterId: string;
  version: string;
  draft: EncounterDraftInput;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const draft = readDraft(input?.draft);
    if (!draft.assessment) throw new UserFacingError(FINALIZE_NEEDS_ASSESSMENT);
    const version = readVersion(input?.version);
    const encounterId = String(input?.encounterId ?? "");

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { appointment: { select: { id: true, code: true, startAt: true, patientId: true } } },
    });
    if (!encounter) throw new UserFacingError(GONE);
    const { appointment } = encounter;
    const patientId = appointment.patientId;
    if (!patientId) throw new UserFacingError(GONE);
    const treatments = await resolveTreatments(draft);

    await guardLocked(() =>
      prisma.$transaction(async (tx) => {
        const updatedAt = await writeDraft(tx, encounterId, version, draft, treatments);
        if (!updatedAt) throw new UserFacingError(await whyUnchanged(tx, encounterId));
        await tx.encounter.update({
          where: { id: encounterId },
          data: { status: "FINAL", finalizedAt: new Date(), finalizedById: actor.staffId, finalizedByName: actor.name },
        });
        const done = await tx.appointment.updateMany({
          where: { id: appointment.id, status: "HADIR" },
          data: { status: "SELESAI" },
        });
        if (done.count === 0) throw new UserFacingError("Status booking baru saja berubah. Muat ulang halaman.");
        await tx.patient.updateMany({
          where: { id: patientId, OR: [{ lastVisitAt: null }, { lastVisitAt: { lt: appointment.startAt } }] },
          data: { lastVisitAt: appointment.startAt },
        });
      }),
    );

    await recordAudit({ actor, action: "encounter.finalize", entity: "Encounter", entityId: encounterId, summary: appointment.code });
    revalidateEncounter(encounterId, patientId);
    safeRevalidatePath("/admin/booking");
  });
}

/** Buang draf (spec R9): hanya draf dengan versi yang sama; booking kembali "Belum diperiksa". */
export async function discardEncounterDraft(input: { encounterId: string; version: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const version = readVersion(input?.version);
    const encounterId = String(input?.encounterId ?? "");
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { appointment: { select: { code: true, patientId: true } } },
    });
    if (!encounter) throw new UserFacingError(GONE);

    const { count } = await guardLocked(() =>
      prisma.encounter.deleteMany({ where: { id: encounterId, status: "DRAF", updatedAt: version } }),
    );
    if (count === 0) throw new UserFacingError(await whyUnchanged(prisma, encounterId));

    await recordAudit({
      actor,
      action: "encounter.discard",
      entity: "Encounter",
      entityId: encounterId,
      summary: encounter.appointment.code,
    });
    revalidateEncounter(encounterId, encounter.appointment.patientId);
  });
}

/** Adendum (PRD F12): koreksi atas catatan final, dengan penulis dan waktu. */
export async function addEncounterAddendum(input: { encounterId: string; text: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const text = String(input?.text ?? "").trim();
    if (!text) throw new UserFacingError("Tulis isi adendum dulu.");
    if (text.length > ENCOUNTER_TEXT_MAX) throw new UserFacingError("Adendum terlalu panjang (maks. 5.000 karakter).");
    const encounterId = String(input?.encounterId ?? "");

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { status: true, appointment: { select: { code: true, patientId: true } } },
    });
    if (!encounter) throw new UserFacingError(GONE);
    if (encounter.status !== "FINAL") throw new UserFacingError("Adendum hanya untuk catatan yang sudah final.");

    await guardLocked(() =>
      prisma.encounterAddendum.create({ data: { encounterId, text, authorId: actor.staffId, authorName: actor.name } }),
    );
    await recordAudit({
      actor,
      action: "encounter.addendum",
      entity: "Encounter",
      entityId: encounterId,
      summary: encounter.appointment.code,
    });
    revalidateEncounter(encounterId, encounter.appointment.patientId);
  });
}
```

- [ ] **Step 5: Jalankan uji dan pastikan lolos**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/encounter.test.ts`
Expected: PASS (16 uji).

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add src/server/encounter.ts src/server/audit.ts tests/integration/encounter.test.ts
git commit -m "feat: open, autosave, finalize, discard and addendum actions for visits"
```

---

### Task 4: Membaca kunjungan dan daftar kerja dokter

**Files:**
- Create: `src/server/intake-clinical.ts`, `src/server/encounter-read.ts`
- Modify: `src/server/intake.ts`
- Test: `tests/integration/encounter-read.test.ts`

**Interfaces:**
- Consumes: `openEncounter`, `saveEncounterDraft`, `finalizeEncounter` (Task 3, untuk menyiapkan data uji); `recordAuditThrottled`, `listAuditTrail`, `type AuditTrailRow` (Task 3); `VITAL_KEYS`, `vitalInputValue`, `describeVitals`, `ageInYears`, `type EncounterDraftInput`, `type EncounterOptions` (Task 2); `ClinicalView.pregnancy` (Task 2).
- Produces (dari `@/server/intake-clinical`, bukan `"use server"`):
  - `type IntakeClinical = { sections: ClinicalSection[]; activities: ActivityRow[] | null; activityDateLabel: string | null; habits: HabitTable | null }`
  - `loadIntakeClinical(intakeId: string): Promise<{ clinical: IntakeClinical; proposal: RecordProposal; pregnancy: boolean } | null>`
- Produces (dari `@/server/encounter-read`):
  - `type EncounterWarnings = { allergies: string | null; medicalHistory: string | null; importantNotes: string | null; paperRecordNumber: string | null; pregnancy: boolean }`
  - `type EncounterIntake = { id: string; state: "pending" } | { id: string; state: "error"; message: string } | { id: string; state: "ready"; clinical: IntakeClinical; needsApproval: boolean }`
  - `type EncounterDetail` (bentuknya di Step 4)
  - `getEncounterForStaff(encounterId: string): Promise<EncounterDetail | null>`
  - `type WorklistState = "BELUM" | "DRAF" | "FINAL"`
  - `type WorklistRow = { appointmentId: string; code: string; startAt: Date; patientName: string; patientRecordNumber: string; serviceName: string; branchName: string; encounterId: string | null; state: WorklistState }`
  - `type DoctorWorklist = { today: WorklistRow[]; unfinished: WorklistRow[] }`
  - `listDoctorWorklist(): Promise<DoctorWorklist>`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/integration/encounter-read.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emptyDraftInput } from "@/lib/encounter";
import { can } from "@/lib/permissions";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { finalizeEncounter, openEncounter, saveEncounterDraft } from "@/server/encounter";
import { getEncounterForStaff, listDoctorWorklist } from "@/server/encounter-read";
import { requireCapability } from "@/server/session";
import { slimmingNewPatient } from "../fixtures/quiz-answers-v2";
import { unwrap } from "./unwrap";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));

const SLUG = "baca-kunjungan-uji";
const PATIENT_WA = "6281200007720";

describe("membaca kunjungan dan daftar kerja dokter", () => {
  let world: BookingWorld;
  let patientId: string;
  let serial = 0;
  const today = witaDateString(new Date());

  function actAs(role: StaffRole) {
    vi.mocked(requireCapability).mockImplementation(async (capability) => {
      if (!can(role, capability)) throw new Error(`forbidden: ${capability}`);
      return { userId: "u1", staffId: world.doctorId, name: `${role} Uji`, role, email: "uji@sundy.test" };
    });
  }

  async function booking(day: string, time: string, status: "HADIR" | "TERKONFIRMASI" = "HADIR") {
    serial += 1;
    const startAt = at(day, time);
    return prisma.appointment.create({
      data: {
        code: `BKJ-${serial}`,
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

  async function finalized(appointmentId: string) {
    const { encounterId } = await unwrap(openEncounter(appointmentId));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    await unwrap(
      finalizeEncounter({ encounterId, version: updatedAt.toISOString(), draft: { ...emptyDraftInput(), assessment: "Kontrol" } }),
    );
    return encounterId;
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    patientId = (
      await prisma.patient.create({
        data: {
          medicalRecordNumber: "SDY-2026-7720",
          name: "Pasien Baca",
          whatsapp: PATIENT_WA,
          birthDate: new Date("1990-05-17T00:00:00Z"),
          gender: "P",
          allergies: "Udang",
          medicalHistory: null,
          importantNotes: "Takut jarum",
          paperRecordNumber: "RM-0457",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("dokter melihat peringatan, isian draf sebagai teks formulir, dan pilihan treatment", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 3), "11:00");
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    await unwrap(
      saveEncounterDraft({
        encounterId,
        version: updatedAt.toISOString(),
        draft: { ...emptyDraftInput(), vitals: { ...emptyDraftInput().vitals, weightKg: "72,5", heightCm: "160" } },
      }),
    );

    const detail = await getEncounterForStaff(encounterId);

    expect(detail).toMatchObject({
      status: "DRAF",
      patient: { name: "Pasien Baca", medicalRecordNumber: "SDY-2026-7720", genderLabel: "Perempuan" },
      warnings: { allergies: "Udang", medicalHistory: null, importantNotes: "Takut jarum", paperRecordNumber: "RM-0457", pregnancy: false },
      intake: null,
      trail: null,
    });
    expect(detail!.patient.ageLabel).toMatch(/^\d+ tahun$/);
    expect(detail!.draft.vitals).toMatchObject({ weightKg: "72,5", heightCm: "160", systolic: "" });
    expect(detail!.vitalLines).toEqual(["Berat badan: 72,5 kg", "Tinggi badan: 160 cm", "IMT 28,3"]);
    expect(detail!.options.defaultServiceId).toBe(world.consultationId);
    expect(detail!.options.defaultPerformerId).toBe(world.doctorId);
    expect(detail!.options.services.map((s) => s.id)).toEqual(expect.arrayContaining([world.consultationId, world.treatmentId]));
    expect(detail!.options.performers.map((p) => p.id)).toEqual(expect.arrayContaining([world.doctorId, world.therapistId]));
  });

  it("mencatat 'membuka' paling banyak sekali per 30 menit, dan Super Admin melihat jejaknya", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 3), "12:00");
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    await getEncounterForStaff(encounterId);
    await getEncounterForStaff(encounterId);
    expect(await prisma.auditLog.count({ where: { action: "encounter.view", entityId: encounterId } })).toBe(1);

    actAs("SUPER_ADMIN");
    const detail = await getEncounterForStaff(encounterId);
    expect(detail!.trail!.map((row) => row.actionLabel)).toEqual(expect.arrayContaining(["membuat kunjungan", "membuka"]));
    expect(detail!.trail![0]).toMatchObject({ roleLabel: expect.any(String), actorName: expect.any(String) });
  });

  it("resepsionis ditolak", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 3), "13:00");
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    actAs("RESEPSIONIS");
    await expect(getEncounterForStaff(encounterId)).rejects.toThrow(/forbidden/);
    await expect(listDoctorWorklist()).rejects.toThrow(/forbidden/);
  });

  it("isian kuis kunjungan: siap (dengan hamil dan perlu disetujui), belum diisi, atau versi tidak dikenal", async () => {
    actAs("DOKTER");
    const withIntake = async (time: string, data: { status: "MENUNGGU_DIISI" | "TERISI"; quizVersion: number | null; answers?: object }) => {
      const appointment = await booking(addDaysToDateString(today, 4), time);
      await prisma.intake.create({
        data: {
          appointmentId: appointment.id,
          patientId,
          kind: "LENGKAP",
          purpose: "SLIMMING",
          status: data.status,
          quizVersion: data.quizVersion,
          answers: data.answers,
          submittedAt: data.status === "TERISI" ? new Date() : null,
        },
      });
      const { encounterId } = await unwrap(openEncounter(appointment.id));
      return (await getEncounterForStaff(encounterId))!;
    };

    const pregnant = { ...slimmingNewPatient, health: { ...slimmingNewPatient.health, pregnancy: "YA" } };
    const ready = await withIntake("11:00", { status: "TERISI", quizVersion: 2, answers: pregnant });
    expect(ready.intake).toMatchObject({ state: "ready", needsApproval: true });
    expect(ready.warnings.pregnancy).toBe(true);

    const pending = await withIntake("12:00", { status: "MENUNGGU_DIISI", quizVersion: null });
    expect(pending.intake).toMatchObject({ state: "pending" });

    const unknown = await withIntake("13:00", { status: "TERISI", quizVersion: 9, answers: {} });
    expect(unknown.intake).toMatchObject({ state: "error", message: "Isian dengan kuis versi 9 belum bisa ditampilkan." });
  });

  it("daftar kerja: hari ini menurut WITA, dan catatan tertinggal dari hari sebelumnya", async () => {
    actAs("DOKTER");
    const yesterday = addDaysToDateString(today, -1);

    // 07.30 WITA = 23.30 UTC hari sebelumnya: tetap "hari ini".
    const morning = await booking(today, "07:30");
    const doneToday = await booking(today, "08:00");
    const doneTodayId = await finalized(doneToday.id);
    const confirmedToday = await booking(today, "08:30", "TERKONFIRMASI");
    const lateYesterday = await booking(yesterday, "23:30");
    const oldDraft = await booking(addDaysToDateString(today, -3), "10:00");
    const { encounterId: oldDraftId } = await unwrap(openEncounter(oldDraft.id));
    const doneYesterday = await booking(yesterday, "10:00");
    await finalized(doneYesterday.id);

    const worklist = await listDoctorWorklist();
    const find = (rows: typeof worklist.today, code: string) => rows.find((row) => row.code === code);

    expect(find(worklist.today, morning.code)).toMatchObject({ state: "BELUM", encounterId: null, patientName: "Pasien Baca" });
    expect(find(worklist.today, doneToday.code)).toMatchObject({ state: "FINAL", encounterId: doneTodayId });
    expect(find(worklist.today, confirmedToday.code)).toBeUndefined();
    expect(find(worklist.today, lateYesterday.code)).toBeUndefined();

    expect(find(worklist.unfinished, lateYesterday.code)).toMatchObject({ state: "BELUM" });
    expect(find(worklist.unfinished, oldDraft.code)).toMatchObject({ state: "DRAF", encounterId: oldDraftId });
    expect(find(worklist.unfinished, doneYesterday.code)).toBeUndefined();
    expect(find(worklist.unfinished, morning.code)).toBeUndefined();

    const unfinishedCodes = worklist.unfinished.map((row) => row.code);
    expect(unfinishedCodes.indexOf(oldDraft.code)).toBeLessThan(unfinishedCodes.indexOf(lateYesterday.code));
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/encounter-read.test.ts`
Expected: FAIL. Modul `@/server/encounter-read` belum ada.

- [ ] **Step 3: Pindahkan pemuat isi klinis ke `src/server/intake-clinical.ts`**

```ts
import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
import { clinicalView, type ClinicalSection } from "@/lib/kuis/clinical-view";
import type { ActivityRow } from "@/lib/kuis/v1/describe";
import type { HabitTable } from "@/lib/kuis/v2/describe";
import type { RecordProposal } from "@/lib/kuis/v2/record-proposal";

/** Isi klinis sebuah isian untuk staf ber-record:read (spec pendaftaran 6.2). */
export type IntakeClinical = {
  sections: ClinicalSection[];
  activities: ActivityRow[] | null;
  activityDateLabel: string | null;
  /** Tabel kebiasaan (form recall) — isian kuis versi 2. */
  habits: HabitTable | null;
};

/**
 * Kolom klinis isian dibaca dengan kueri terpisah, hanya untuk yang berhak.
 * Berkas ini sengaja bukan "use server": fungsinya tidak boleh bisa dipanggil
 * dari browser. Pemanggil wajib sudah memeriksa record:read. Versi kuis yang
 * tidak dikenal melempar galat dari clinicalView.
 */
export async function loadIntakeClinical(
  intakeId: string,
): Promise<{ clinical: IntakeClinical; proposal: RecordProposal; pregnancy: boolean } | null> {
  const row = await prisma.intake.findUniqueOrThrow({
    where: { id: intakeId },
    select: { quizVersion: true, answers: true, selfWeightKg: true, selfHeightCm: true, activityDate: true },
  });
  if (row.answers === null) return null;

  const view = clinicalView({
    quizVersion: row.quizVersion,
    answers: row.answers,
    weightKg: row.selfWeightKg === null ? null : Number(row.selfWeightKg),
    heightCm: row.selfHeightCm === null ? null : Number(row.selfHeightCm),
  });
  return {
    proposal: view.proposal,
    pregnancy: view.pregnancy,
    clinical: {
      sections: view.sections,
      activities: view.activities,
      habits: view.habits,
      activityDateLabel: row.activityDate ? formatIndonesianDate(row.activityDate) : null,
    },
  };
}
```

Di `src/server/intake.ts`:
1. hapus fungsi `loadClinical` beserta komentar di atasnya;
2. ganti tipe `clinical` di `IntakeDetail` menjadi:

   ```ts
     /** null untuk peran tanpa record:read, atau bila pasien belum mengisi. */
     clinical: IntakeClinical | null;
   ```
3. ganti `await loadClinical(row.id)` menjadi `await loadIntakeClinical(row.id)`;
4. tambahkan `import { loadIntakeClinical, type IntakeClinical } from "@/server/intake-clinical";`;
5. hapus impor yang tidak terpakai lagi: `clinicalView`, `ClinicalSection`, `ActivityRow`, dan `HabitTable`. `formatIndonesianDate` dan `RecordProposal` tetap dipakai.

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/intake-access.test.ts tests/integration/intake-approval.test.ts`
Expected: PASS. Perilaku halaman isian tidak berubah.

- [ ] **Step 4: Tulis `src/server/encounter-read.ts`**

```ts
"use server";

import type { IntakeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  VITAL_KEYS,
  ageInYears,
  describeVitals,
  vitalInputValue,
  type EncounterDraftInput,
  type EncounterOptions,
  type VitalKey,
} from "@/lib/encounter";
import { formatGender } from "@/lib/format";
import { can } from "@/lib/permissions";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { listAuditTrail, recordAuditThrottled, type AuditTrailRow } from "@/server/audit";
import { loadIntakeClinical, type IntakeClinical } from "@/server/intake-clinical";
import { requireCapability } from "@/server/session";

export type EncounterWarnings = {
  allergies: string | null;
  medicalHistory: string | null;
  importantNotes: string | null;
  paperRecordNumber: string | null;
  /** Dari jawaban K4 isian kunjungan ini (spec R6). */
  pregnancy: boolean;
};

export type EncounterIntake =
  | { id: string; state: "pending" }
  | { id: string; state: "error"; message: string }
  | { id: string; state: "ready"; clinical: IntakeClinical; needsApproval: boolean };

export type EncounterDetail = {
  id: string;
  status: "DRAF" | "FINAL";
  /** updatedAt kunjungan; dikirim kembali saat menyimpan (spec 7). */
  version: string;
  createdByName: string;
  finalized: { byName: string; at: Date } | null;
  appointment: { id: string; code: string; startAt: Date; serviceName: string; staffName: string; branchName: string };
  patient: { id: string; name: string; medicalRecordNumber: string; ageLabel: string | null; genderLabel: string | null };
  warnings: EncounterWarnings;
  intake: EncounterIntake | null;
  /** Isian formulir (teks) untuk draf, juga dipakai tampilan baca-saja. */
  draft: EncounterDraftInput;
  /** Tanda vital yang diukur, siap dibaca (baca-saja). */
  vitalLines: string[];
  treatments: { serviceName: string; area: string | null; dose: string | null; performerName: string; notes: string | null }[];
  addenda: { id: string; text: string; authorName: string; createdAt: Date }[];
  options: EncounterOptions;
  /** Hanya untuk audit:read (Super Admin). */
  trail: AuditTrailRow[] | null;
};

const UNKNOWN_QUIZ_VERSION = "Isian dengan kuis versi";

/** Isian kuis booking ini untuk bagian S. Versi kuis yang tidak dikenal tidak menggagalkan halaman. */
async function loadEncounterIntake(
  intake: { id: string; status: IntakeStatus } | null,
): Promise<{ intake: EncounterIntake | null; pregnancy: boolean }> {
  if (!intake) return { intake: null, pregnancy: false };
  if (intake.status === "MENUNGGU_DIISI") return { intake: { id: intake.id, state: "pending" }, pregnancy: false };
  try {
    const loaded = await loadIntakeClinical(intake.id);
    if (!loaded) return { intake: { id: intake.id, state: "pending" }, pregnancy: false };
    return {
      intake: { id: intake.id, state: "ready", clinical: loaded.clinical, needsApproval: intake.status === "TERISI" },
      pregnancy: loaded.pregnancy,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(UNKNOWN_QUIZ_VERSION)) {
      return { intake: { id: intake.id, state: "error", message: error.message }, pregnancy: false };
    }
    throw error;
  }
}

/**
 * Pilihan formulir: layanan dan pelaksana aktif, ditambah yang sudah dipakai
 * draf atau booking ini walau kini nonaktif, agar pilihannya tidak hilang.
 */
async function loadOptions(
  used: { serviceIds: string[]; performerIds: string[] },
  booking: { serviceId: string | null; staffId: string },
): Promise<EncounterOptions> {
  const serviceIds = [...used.serviceIds, ...(booking.serviceId ? [booking.serviceId] : [])];
  const performerIds = [...used.performerIds, booking.staffId];
  const [services, performers] = await Promise.all([
    prisma.service.findMany({
      where: { OR: [{ isActive: true }, { id: { in: serviceIds } }] },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.staff.findMany({
      where: { role: { in: ["DOKTER", "TERAPIS"] }, OR: [{ isActive: true }, { id: { in: performerIds } }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  const defaultServiceId =
    booking.serviceId && services.some((service) => service.id === booking.serviceId)
      ? booking.serviceId
      : (services[0]?.id ?? "");
  const defaultPerformerId = performers.some((staff) => staff.id === booking.staffId)
    ? booking.staffId
    : (performers[0]?.id ?? "");
  return { services, performers, defaultServiceId, defaultPerformerId };
}

/** Halaman kunjungan (spec 4–5). Membuka catatan tercatat di audit, maks. sekali per 30 menit. */
export async function getEncounterForStaff(encounterId: string): Promise<EncounterDetail | null> {
  const staff = await requireCapability("record:read");
  const row = await prisma.encounter.findUnique({
    where: { id: String(encounterId ?? "") },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      subjective: true,
      physicalExam: true,
      assessment: true,
      plan: true,
      systolic: true,
      diastolic: true,
      pulse: true,
      temperatureC: true,
      weightKg: true,
      heightCm: true,
      waistCm: true,
      createdByName: true,
      finalizedByName: true,
      finalizedAt: true,
      treatments: {
        orderBy: { sortOrder: "asc" },
        select: { serviceId: true, serviceName: true, area: true, dose: true, performerId: true, performerName: true, notes: true },
      },
      addenda: { orderBy: { createdAt: "asc" }, select: { id: true, text: true, authorName: true, createdAt: true } },
      appointment: {
        select: {
          id: true,
          code: true,
          type: true,
          startAt: true,
          serviceId: true,
          staffId: true,
          service: { select: { name: true } },
          staff: { select: { name: true } },
          branch: { select: { name: true } },
          intake: { select: { id: true, status: true } },
          patient: {
            select: {
              id: true,
              name: true,
              medicalRecordNumber: true,
              birthDate: true,
              gender: true,
              allergies: true,
              medicalHistory: true,
              importantNotes: true,
              paperRecordNumber: true,
            },
          },
        },
      },
    },
  });
  if (!row || !row.appointment.patient) return null;
  const { appointment } = row;
  const patient = appointment.patient!;

  await recordAuditThrottled({ actor: staff, action: "encounter.view", entity: "Encounter", entityId: row.id, summary: appointment.code });

  const vitals = {} as Record<VitalKey, number | null>;
  const vitalInputs = {} as Record<VitalKey, string>;
  for (const key of VITAL_KEYS) {
    const value = row[key] === null ? null : Number(row[key]);
    vitals[key] = value;
    vitalInputs[key] = vitalInputValue(key, value);
  }

  const [{ intake, pregnancy }, options, trail] = await Promise.all([
    loadEncounterIntake(appointment.intake),
    loadOptions(
      { serviceIds: row.treatments.map((t) => t.serviceId), performerIds: row.treatments.map((t) => t.performerId) },
      { serviceId: appointment.serviceId, staffId: appointment.staffId },
    ),
    can(staff.role, "audit:read") ? listAuditTrail("Encounter", row.id) : Promise.resolve(null),
  ]);

  return {
    id: row.id,
    status: row.status,
    version: row.updatedAt.toISOString(),
    createdByName: row.createdByName,
    finalized: row.finalizedAt && row.finalizedByName ? { byName: row.finalizedByName, at: row.finalizedAt } : null,
    appointment: {
      id: appointment.id,
      code: appointment.code,
      startAt: appointment.startAt,
      serviceName: appointment.service?.name ?? (appointment.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
      staffName: appointment.staff.name,
      branchName: appointment.branch.name,
    },
    patient: {
      id: patient.id,
      name: patient.name,
      medicalRecordNumber: patient.medicalRecordNumber,
      ageLabel: patient.birthDate ? `${ageInYears(patient.birthDate, witaDateString(appointment.startAt))} tahun` : null,
      genderLabel: formatGender(patient.gender),
    },
    warnings: {
      allergies: patient.allergies,
      medicalHistory: patient.medicalHistory,
      importantNotes: patient.importantNotes,
      paperRecordNumber: patient.paperRecordNumber,
      pregnancy,
    },
    intake,
    draft: {
      subjective: row.subjective ?? "",
      physicalExam: row.physicalExam ?? "",
      assessment: row.assessment ?? "",
      plan: row.plan ?? "",
      vitals: vitalInputs,
      treatments: row.treatments.map((t) => ({
        serviceId: t.serviceId,
        area: t.area ?? "",
        dose: t.dose ?? "",
        performerId: t.performerId,
        notes: t.notes ?? "",
      })),
    },
    vitalLines: describeVitals(vitals),
    treatments: row.treatments.map((t) => ({
      serviceName: t.serviceName,
      area: t.area,
      dose: t.dose,
      performerName: t.performerName,
      notes: t.notes,
    })),
    addenda: row.addenda,
    options,
    trail,
  };
}

export type WorklistState = "BELUM" | "DRAF" | "FINAL";

export type WorklistRow = {
  appointmentId: string;
  code: string;
  startAt: Date;
  patientName: string;
  patientRecordNumber: string;
  serviceName: string;
  branchName: string;
  encounterId: string | null;
  state: WorklistState;
};

export type DoctorWorklist = { today: WorklistRow[]; unfinished: WorklistRow[] };

function findWorklist(where: Prisma.AppointmentWhereInput) {
  return prisma.appointment.findMany({
    where: { ...where, patientId: { not: null } },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      code: true,
      type: true,
      startAt: true,
      service: { select: { name: true } },
      branch: { select: { name: true } },
      patient: { select: { name: true, medicalRecordNumber: true } },
      encounter: { select: { id: true, status: true } },
    },
  });
}

function toWorklistRow(row: Awaited<ReturnType<typeof findWorklist>>[number]): WorklistRow {
  const encounter = row.encounter;
  return {
    appointmentId: row.id,
    code: row.code,
    startAt: row.startAt,
    patientName: row.patient?.name ?? "",
    patientRecordNumber: row.patient?.medicalRecordNumber ?? "",
    serviceName: row.service?.name ?? (row.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
    branchName: row.branch.name,
    encounterId: encounter?.id ?? null,
    state: !encounter ? "BELUM" : encounter.status === "FINAL" ? "FINAL" : "DRAF",
  };
}

/**
 * Dasbor dokter (spec 4.2), semua cabang. "Hari ini" adalah tanggal WITA.
 * "Catatan belum final": draf dari hari sebelumnya, dan booking Hadir dari hari
 * sebelumnya yang belum diperiksa, terlama di atas.
 */
export async function listDoctorWorklist(): Promise<DoctorWorklist> {
  await requireCapability("record:read");
  const today = witaDateString(new Date());
  const dayStart = combineWitaDateAndMinutes(today, 0);
  const dayEnd = combineWitaDateAndMinutes(addDaysToDateString(today, 1), 0);

  const [todayRows, unfinishedRows] = await Promise.all([
    findWorklist({ startAt: { gte: dayStart, lt: dayEnd }, status: { in: ["HADIR", "SELESAI"] } }),
    findWorklist({
      startAt: { lt: dayStart },
      OR: [{ status: "HADIR", encounter: { is: null } }, { encounter: { is: { status: "DRAF" } } }],
    }),
  ]);
  return { today: todayRows.map(toWorklistRow), unfinished: unfinishedRows.map(toWorklistRow) };
}
```

- [ ] **Step 5: Jalankan uji dan pastikan lolos**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/encounter-read.test.ts`
Expected: PASS (5 uji).

Run: `npm run test:integration && npx tsc --noEmit && npm run lint`
Expected: PASS dan bersih.

- [ ] **Step 6: Commit**

```bash
git add src/server/intake-clinical.ts src/server/intake.ts src/server/encounter-read.ts tests/integration/encounter-read.test.ts
git commit -m "feat: read a visit with warnings and intake, and the doctor worklist"
```

---

### Task 5: Data pasien — catatan penting, no. RM kertas lama, riwayat kunjungan

**Files:**
- Modify: `src/server/patient.ts`
- Create: `src/components/admin/patient-note-forms.tsx`
- Modify: `src/components/admin/patient-detail-view.tsx`, `src/app/(admin)/admin/pasien/[id]/page.tsx`
- Test: `tests/integration/patient-records.test.ts`, `tests/unit/components/patient-detail-view.test.tsx`

**Interfaces:**
- Consumes: `openEncounter`, `finalizeEncounter` (Task 3, data uji); `recordAuditThrottled` (Task 3); `assessmentPreview`, `IMPORTANT_NOTES_MAX`, `PAPER_RECORD_NUMBER_MAX` (Task 2).
- Produces:
  - `PatientDetail` bertambah `paperRecordNumber: string | null` dan `record.importantNotes: string | null`;
  - `PatientDetail.encounters: { id: string; code: string; startAt: Date; branchName: string; authorName: string; assessmentPreview: string | null; status: "DRAF" | "FINAL" }[] | null`;
  - `updatePatientImportantNotes(input: { patientId: string; text: string }): Promise<ActionResult<void>>` (`record:write`);
  - `updatePaperRecordNumber(input: { patientId: string; text: string }): Promise<ActionResult<void>>` (`booking:manage`);
  - `PatientDetailView` menerima prop baru `canWriteRecords: boolean`;
  - komponen `ImportantNotesForm({ patientId, value })` dan `PaperRecordNumberForm({ patientId, value })`.

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/patient-records.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emptyDraftInput } from "@/lib/encounter";
import { can } from "@/lib/permissions";
import { finalizeEncounter, openEncounter } from "@/server/encounter";
import { getPatientDetail, updatePaperRecordNumber, updatePatientImportantNotes } from "@/server/patient";
import { requireCapability } from "@/server/session";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));

const SLUG = "rekam-pasien-uji";
const PATIENT_WA = "6281200007730";
const LONG_ASSESSMENT = `Obesitas derajat 1 dengan resistensi insulin, riwayat diet yo-yo tiga kali, target turun 8 kg`;

describe("data pasien: catatan penting, no. RM kertas lama, riwayat kunjungan", () => {
  let world: BookingWorld;
  let patientId: string;
  let finalId: string;
  let draftId: string;

  function actAs(role: StaffRole) {
    vi.mocked(requireCapability).mockImplementation(async (capability) => {
      if (!can(role, capability)) throw new Error(`forbidden: ${capability}`);
      return { userId: "u1", staffId: world.doctorId, name: `${role} Uji`, role, email: "uji@sundy.test" };
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    const date = await bookableDate();
    patientId = (
      await prisma.patient.create({
        data: {
          medicalRecordNumber: "SDY-2026-7730",
          name: "Pasien Rekam",
          whatsapp: PATIENT_WA,
          importantNotes: "Takut jarum",
          paperRecordNumber: "RM-0457",
        },
      })
    ).id;
    const booking = (code: string, time: string) => {
      const startAt = at(date, time);
      return prisma.appointment.create({
        data: {
          code,
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
    };
    actAs("DOKTER");
    const first = await booking("RKM-1", "11:00");
    finalId = (await unwrap(openEncounter(first.id))).encounterId;
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: finalId } });
    await unwrap(
      finalizeEncounter({ encounterId: finalId, version: updatedAt.toISOString(), draft: { ...emptyDraftInput(), assessment: LONG_ASSESSMENT } }),
    );
    const second = await booking("RKM-2", "12:00");
    draftId = (await unwrap(openEncounter(second.id))).encounterId;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("dokter melihat catatan penting, no. RM kertas lama, dan riwayat kunjungan terbaru di atas", async () => {
    actAs("DOKTER");
    const detail = (await getPatientDetail(patientId))!;

    expect(detail.paperRecordNumber).toBe("RM-0457");
    expect(detail.record).toMatchObject({ importantNotes: "Takut jarum" });
    expect(detail.encounters!.map((e) => e.id)).toEqual([draftId, finalId]);
    expect(detail.encounters![0]).toMatchObject({ status: "DRAF", code: "RKM-2", assessmentPreview: null, authorName: "DOKTER Uji" });
    expect(detail.encounters![1]).toMatchObject({ status: "FINAL", branchName: "Cabang Publik Uji" });
    expect(detail.encounters![1].assessmentPreview!.length).toBeLessThanOrEqual(80);
    expect(detail.encounters![1].assessmentPreview!.startsWith("Obesitas derajat 1")).toBe(true);
  });

  it("membuka riwayat pasien tercatat di audit paling banyak sekali per 30 menit", async () => {
    actAs("DOKTER");
    const before = await prisma.auditLog.count({ where: { action: "patient.view-records", entityId: patientId } });
    await getPatientDetail(patientId);
    await getPatientDetail(patientId);
    const after = await prisma.auditLog.count({ where: { action: "patient.view-records", entityId: patientId } });
    expect(after - before).toBeLessThanOrEqual(1);
    expect(after).toBeGreaterThanOrEqual(1);
  });

  it("resepsionis melihat no. RM kertas lama, tanpa catatan penting dan riwayat kunjungan", async () => {
    actAs("RESEPSIONIS");
    const detail = (await getPatientDetail(patientId))!;
    expect(detail.paperRecordNumber).toBe("RM-0457");
    expect(detail.record).toBeNull();
    expect(detail.encounters).toBeNull();
    expect(JSON.stringify(detail)).not.toMatch(/Takut jarum|Obesitas/);
    expect(await prisma.auditLog.count({ where: { action: "patient.view-records", actorRole: "RESEPSIONIS" } })).toBe(0);
  });

  it("catatan penting: dirapikan, kosong berarti dihapus, dibatasi 2.000 karakter, hanya record:write", async () => {
    actAs("DOKTER");
    await unwrap(updatePatientImportantNotes({ patientId, text: "  Kulit mudah iritasi  " }));
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).importantNotes).toBe("Kulit mudah iritasi");
    await unwrap(updatePatientImportantNotes({ patientId, text: "   " }));
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).importantNotes).toBeNull();
    expect(await updatePatientImportantNotes({ patientId, text: "x".repeat(2001) })).toEqual({
      ok: false,
      error: "Catatan penting terlalu panjang (maks. 2.000 karakter).",
    });
    expect(await prisma.auditLog.count({ where: { action: "patient.update-important-notes", entityId: patientId } })).toBe(2);

    actAs("RESEPSIONIS");
    await expect(updatePatientImportantNotes({ patientId, text: "x" })).rejects.toThrow(/forbidden/);
  });

  it("no. RM kertas lama boleh diubah resepsionis, dibatasi 50 karakter", async () => {
    actAs("RESEPSIONIS");
    await unwrap(updatePaperRecordNumber({ patientId, text: " RM-0999 " }));
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).paperRecordNumber).toBe("RM-0999");
    expect(await updatePaperRecordNumber({ patientId, text: "x".repeat(51) })).toEqual({
      ok: false,
      error: "No. RM kertas lama terlalu panjang (maks. 50 karakter).",
    });
    expect(await prisma.auditLog.count({ where: { action: "patient.update-paper-record-number", entityId: patientId } })).toBe(1);
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/patient-records.test.ts`
Expected: FAIL. Aksi `updatePatientImportantNotes` dan `updatePaperRecordNumber` belum ada, dan `encounters` masih `undefined`.

- [ ] **Step 3: Perbarui `src/server/patient.ts`**

Tambahkan impor:

```ts
import { assessmentPreview, IMPORTANT_NOTES_MAX, PAPER_RECORD_NUMBER_MAX } from "@/lib/encounter";
import { recordAudit, recordAuditThrottled } from "@/server/audit";
```

`recordAudit` sudah diimpor. Gabungkan keduanya ke satu baris impor `@/server/audit`.

Ubah tipe `PatientDetail`:
- sesudah `address: string | null;` tambahkan:

  ```ts
    /** Nomor rekam medis kertas lama; boleh dilihat dan diubah resepsionis (spec R11). */
    paperRecordNumber: string | null;
  ```
- ganti baris `record` menjadi:

  ```ts
    /** Hanya untuk record:read (spec 6.2). */
    record: { allergies: string | null; medicalHistory: string | null; importantNotes: string | null } | null;
  ```
- sesudah `intakes: {...}[];` tambahkan:

  ```ts
    /** Riwayat kunjungan, terbaru di atas. Hanya untuk record:read. */
    encounters:
      | {
          id: string;
          code: string;
          startAt: Date;
          branchName: string;
          authorName: string;
          assessmentPreview: string | null;
          status: "DRAF" | "FINAL";
        }[]
      | null;
  ```

Di `getPatientDetail`:
- tambahkan `paperRecordNumber: true,` ke `select` utama;
- ganti pembacaan `record` dan tambahkan riwayat kunjungan:

```ts
  const canRead = can(staff.role, "record:read");
  const record = canRead
    ? await prisma.patient.findUniqueOrThrow({
        where: { id },
        select: { allergies: true, medicalHistory: true, importantNotes: true },
      })
    : null;
  const encounters = canRead
    ? await prisma.encounter.findMany({
        where: { appointment: { patientId: id } },
        orderBy: { appointment: { startAt: "desc" } },
        select: {
          id: true,
          status: true,
          assessment: true,
          createdByName: true,
          finalizedByName: true,
          appointment: { select: { code: true, startAt: true, branch: { select: { name: true } } } },
        },
      })
    : null;
  if (canRead) {
    await recordAuditThrottled({
      actor: staff,
      action: "patient.view-records",
      entity: "Patient",
      entityId: id,
      summary: patient.medicalRecordNumber,
    });
  }
```

- pada objek yang dikembalikan, tambahkan `paperRecordNumber: patient.paperRecordNumber,` sesudah `address`, lalu tambahkan di akhir:

```ts
    encounters:
      encounters?.map((encounter) => ({
        id: encounter.id,
        code: encounter.appointment.code,
        startAt: encounter.appointment.startAt,
        branchName: encounter.appointment.branch.name,
        authorName: encounter.finalizedByName ?? encounter.createdByName,
        assessmentPreview: assessmentPreview(encounter.assessment),
        status: encounter.status,
      })) ?? null,
```

Tambahkan dua aksi di akhir berkas:

```ts
/** Catatan penting dokter, tampil di peringatan setiap kunjungan (spec R6). */
export async function updatePatientImportantNotes(input: { patientId: string; text: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const text = String(input?.text ?? "").trim();
    if (text.length > IMPORTANT_NOTES_MAX) throw new UserFacingError("Catatan penting terlalu panjang (maks. 2.000 karakter).");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, medicalRecordNumber: true },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");

    await prisma.patient.update({ where: { id: patient.id }, data: { importantNotes: text || null } });
    // Tanpa isi catatan: jejak audit untuk siapa dan kapan, bukan apa.
    await recordAudit({
      actor,
      action: "patient.update-important-notes",
      entity: "Patient",
      entityId: patient.id,
      summary: patient.medicalRecordNumber,
    });
    safeRevalidatePath(`/admin/pasien/${patient.id}`);
  });
}

/** No. RM kertas lama (spec R11): front office yang mengambil berkas dari lemari, jadi booking:manage. */
export async function updatePaperRecordNumber(input: { patientId: string; text: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const text = String(input?.text ?? "").trim();
    if (text.length > PAPER_RECORD_NUMBER_MAX) throw new UserFacingError("No. RM kertas lama terlalu panjang (maks. 50 karakter).");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, medicalRecordNumber: true },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");

    await prisma.patient.update({ where: { id: patient.id }, data: { paperRecordNumber: text || null } });
    await recordAudit({
      actor,
      action: "patient.update-paper-record-number",
      entity: "Patient",
      entityId: patient.id,
      summary: `${patient.medicalRecordNumber}: ${text || "dikosongkan"}`,
    });
    safeRevalidatePath(`/admin/pasien/${patient.id}`);
  });
}
```

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/patient-records.test.ts tests/integration/patient-detail.test.ts`
Expected: PASS.

- [ ] **Step 4: Tulis uji komponen yang gagal**

Ganti isi `tests/unit/components/patient-detail-view.test.tsx` dengan:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatientDetailView } from "@/components/admin/patient-detail-view";
import type { PatientDetail } from "@/server/patient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Formulir sunting memanggil server action dari modul ini.
vi.mock("@/server/patient", () => ({ updatePatientImportantNotes: vi.fn(), updatePaperRecordNumber: vi.fn() }));

const patient: PatientDetail = {
  id: "p1",
  medicalRecordNumber: "SDY-2026-0001",
  name: "Siti Rahayu",
  whatsapp: "6281234567890",
  birthDateLabel: "17/04/1992",
  genderLabel: "Perempuan",
  occupation: "Guru",
  address: "Jl. Sam Ratulangi",
  programStatus: "AKTIF",
  paperRecordNumber: "RM-0457",
  record: { allergies: "Amoxicillin", medicalHistory: null, importantNotes: "Takut jarum" },
  appointments: [
    {
      id: "a1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-07T05:00:00Z"),
      status: "TERKONFIRMASI",
      serviceName: "Konsultasi Dokter",
      staffName: "Dr. Diane",
      branchName: "SunDY Mahakeret",
    },
  ],
  intakes: [
    {
      id: "i1",
      code: "SDY-8F3K",
      submittedAt: new Date("2026-10-01T02:00:00Z"),
      status: "DIPERIKSA",
      kind: "LENGKAP",
      purposeLabel: "Slimming",
      reviewerName: "Dr. Diane",
      reviewedAt: new Date("2026-10-02T02:00:00Z"),
    },
  ],
  encounters: [
    {
      id: "e1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-07T05:00:00Z"),
      branchName: "SunDY Mahakeret",
      authorName: "Dr. Diane",
      assessmentPreview: "Obesitas derajat 1",
      status: "FINAL",
    },
  ],
};

const receptionistView: PatientDetail = { ...patient, record: null, encounters: null };

describe("PatientDetailView", () => {
  it("menampilkan catatan medis dan tautan isian untuk pembaca rekam medis", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText("Belum ada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    expect(screen.getByText(/Diperiksa · Dr\. Diane/)).toBeInTheDocument();
  });

  it("menampilkan riwayat kunjungan dengan cuplikan penilaian dan tautan ke kunjungan", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    const visits = screen.getByRole("region", { name: "Riwayat kunjungan" });
    expect(within(visits).getByText("Obesitas derajat 1")).toBeInTheDocument();
    expect(within(visits).getByText("Final")).toBeInTheDocument();
    expect(within(visits).getByRole("link", { name: "Buka" })).toHaveAttribute("href", "/admin/kunjungan/e1");
  });

  it("catatan penting bisa diubah hanya oleh penulis rekam medis", () => {
    const { unmount } = render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(screen.getByText("Takut jarum")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah catatan penting" })).toBeInTheDocument();
    unmount();

    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords={false} />);
    expect(screen.getByText("Takut jarum")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ubah catatan penting" })).not.toBeInTheDocument();
  });

  it("tanpa hak rekam medis: tanpa catatan medis, riwayat kunjungan, dan tautan isian; no. RM kertas lama tetap ada", () => {
    render(<PatientDetailView patient={receptionistView} canReadRecords={false} canWriteRecords={false} />);
    expect(screen.queryByRole("heading", { name: "Catatan medis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Riwayat kunjungan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lihat isian" })).not.toBeInTheDocument();
    expect(screen.getByText("RM-0457")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah no. RM kertas lama" })).toBeInTheDocument();
    // Kode booking tampil di riwayat booking dan riwayat isian.
    expect(screen.getAllByText("SDY-8F3K")).toHaveLength(2);
  });
});
```

Run: `npx vitest run tests/unit/components/patient-detail-view.test.tsx`
Expected: FAIL. `canWriteRecords`, "Riwayat kunjungan", dan formulir sunting belum ada.

- [ ] **Step 5: Tulis `src/components/admin/patient-note-forms.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { IMPORTANT_NOTES_MAX, PAPER_RECORD_NUMBER_MAX } from "@/lib/encounter";
import { updatePaperRecordNumber, updatePatientImportantNotes } from "@/server/patient";

const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function InlineTextEditor(props: {
  label: string;
  editLabel: string;
  value: string | null;
  emptyText: string;
  multiline: boolean;
  maxLength: number;
  onSave: (text: string) => Promise<ActionResult<void>>;
}) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.value ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const result = await props.onSave(text);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${props.label} disimpan.`);
        setEditing(false);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <h3 className="text-xs text-muted-foreground">{props.label}</h3>
        <p className="whitespace-pre-line">{props.value ?? props.emptyText}</p>
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0"
          onClick={() => {
            setText(props.value ?? "");
            setEditing(true);
          }}
        >
          {props.editLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {props.label}
      </Label>
      {props.multiline ? (
        <textarea
          id={id}
          rows={3}
          maxLength={props.maxLength}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={textareaClass}
        />
      ) : (
        <Input id={id} maxLength={props.maxLength} value={text} onChange={(e) => setText(e.target.value)} />
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

/** Catatan penting dokter (spec R6). Hanya ditampilkan untuk record:write. */
export function ImportantNotesForm({ patientId, value }: { patientId: string; value: string | null }) {
  return (
    <InlineTextEditor
      label="Catatan penting"
      editLabel="Ubah catatan penting"
      value={value}
      emptyText="Belum ada"
      multiline
      maxLength={IMPORTANT_NOTES_MAX}
      onSave={(text) => updatePatientImportantNotes({ patientId, text })}
    />
  );
}

/** No. RM kertas lama (spec R11), untuk semua staf booking:manage. */
export function PaperRecordNumberForm({ patientId, value }: { patientId: string; value: string | null }) {
  return (
    <InlineTextEditor
      label="No. RM kertas lama"
      editLabel="Ubah no. RM kertas lama"
      value={value}
      emptyText="—"
      multiline={false}
      maxLength={PAPER_RECORD_NUMBER_MAX}
      onSave={(text) => updatePaperRecordNumber({ patientId, text })}
    />
  );
}
```

- [ ] **Step 6: Perbarui `src/components/admin/patient-detail-view.tsx` dan halaman pasien**

Tambahkan impor:

```tsx
import { Badge } from "@/components/ui/badge";
import { ImportantNotesForm, PaperRecordNumberForm } from "./patient-note-forms";
```

Ubah tanda tangan komponen:

```tsx
export function PatientDetailView({
  patient,
  canReadRecords,
  canWriteRecords,
}: {
  patient: PatientDetail;
  canReadRecords: boolean;
  canWriteRecords: boolean;
}) {
```

Di bagian identitas, sesudah `</dl>` dan masih di dalam `<section>` pertama, tambahkan:

```tsx
        <div className="text-sm">
          <PaperRecordNumberForm patientId={patient.id} value={patient.paperRecordNumber} />
        </div>
```

Di dalam kotak "Catatan medis", sesudah `<div className="grid gap-4 text-sm sm:grid-cols-2">…</div>` dan sebelum paragraf keterangan, tambahkan:

```tsx
          <div className="text-sm">
            {canWriteRecords ? (
              <ImportantNotesForm patientId={patient.id} value={patient.record.importantNotes} />
            ) : (
              <div>
                <h3 className="text-xs text-muted-foreground">Catatan penting</h3>
                <p className="whitespace-pre-line">{patient.record.importantNotes ?? "Belum ada"}</p>
              </div>
            )}
          </div>
```

Uji pertama mencari satu "Belum ada" (Riwayat penyakit kosong), dan catatan penting di fixture berisi, jadi hitungannya tetap satu.

Sesudah section "Catatan medis" dan sebelum "Riwayat booking", tambahkan:

```tsx
      {patient.encounters && (
        <section aria-labelledby="riwayat-kunjungan" className="space-y-2">
          <h2 id="riwayat-kunjungan" className="text-base font-medium">
            Riwayat kunjungan
          </h2>
          {patient.encounters.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kunjungan yang diperiksa.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Penulis</TableHead>
                  <TableHead>Penilaian</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.encounters.map((encounter) => (
                  <TableRow key={encounter.id}>
                    <TableCell>
                      {formatIndonesianDate(encounter.startAt)}, {minutesToTimeLabel(witaMinutesOfDay(encounter.startAt))}
                    </TableCell>
                    <TableCell>{encounter.branchName}</TableCell>
                    <TableCell>{encounter.authorName}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{encounter.assessmentPreview ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={encounter.status === "FINAL" ? "default" : "outline"}>
                        {encounter.status === "FINAL" ? "Final" : "Draf"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/kunjungan/${encounter.id}`} className="text-sm underline underline-offset-4">
                        Buka
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
```

Di `src/app/(admin)/admin/pasien/[id]/page.tsx`, ganti pemanggilan komponen menjadi:

```tsx
        <PatientDetailView
          patient={patient}
          canReadRecords={can(staff.role, "record:read")}
          canWriteRecords={can(staff.role, "record:write")}
        />
```

- [ ] **Step 7: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/components/patient-detail-view.test.tsx`
Expected: PASS (4 uji).

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: PASS dan bersih. Bila skrip unit bernama lain, jalankan `npx vitest run`.

- [ ] **Step 8: Commit**

```bash
git add src/server/patient.ts src/components/admin/patient-note-forms.tsx src/components/admin/patient-detail-view.tsx "src/app/(admin)/admin/pasien/[id]/page.tsx" tests/integration/patient-records.test.ts tests/unit/components/patient-detail-view.test.tsx
git commit -m "feat: important notes, paper record number and visit history on the patient page"
```

---

### Task 6: Formulir draf dengan simpan otomatis

**Files:**
- Create: `src/components/admin/use-draft-autosave.ts`, `src/components/admin/encounter-form.tsx`
- Test: `tests/unit/components/encounter-form.test.tsx`

**Interfaces:**
- Consumes: `saveEncounterDraft`, `finalizeEncounter`, `discardEncounterDraft` (Task 3); dari `@/lib/encounter`: `parseEncounterDraft`, `parseVital`, `bmi`, `formatDecimal`, `emptyDraftInput`, `VITALS`, `VITAL_KEYS`, `TEXT_FIELDS`, `ENCOUNTER_TEXT_MAX`, `TREATMENT_TEXT_MAX`, `FINALIZE_NEEDS_ASSESSMENT`, dan tipenya (Task 2).
- Produces:
  - `useDraftAutosave<T>(options): { status: AutosaveStatus; change(value: T): void; settle(): Promise<string>; forget(): void }`
  - `type AutosaveStatus = { kind: "idle" } | { kind: "pending" } | { kind: "saved"; savedAt: string } | { kind: "retrying" } | { kind: "rejected"; message: string }`
  - `EncounterForm(props: { encounterId: string; initialVersion: string; initialDraft: EncounterDraftInput; options: EncounterOptions; intakeSlot: ReactNode; autosaveDelayMs?: number; retryDelaysMs?: readonly number[] })`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/encounter-form.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { EncounterForm } from "@/components/admin/encounter-form";
import { emptyDraftInput, type EncounterOptions } from "@/lib/encounter";
import { discardEncounterDraft, finalizeEncounter, saveEncounterDraft } from "@/server/encounter";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/encounter", () => ({
  saveEncounterDraft: vi.fn(),
  finalizeEncounter: vi.fn(),
  discardEncounterDraft: vi.fn(),
}));

const options: EncounterOptions = {
  services: [
    { id: "svc-konsul", name: "Konsultasi Dokter" },
    { id: "svc-meso", name: "Meso" },
  ],
  performers: [
    { id: "st-diane", name: "dr. Diane" },
    { id: "st-terapis", name: "Terapis A" },
  ],
  defaultServiceId: "svc-konsul",
  defaultPerformerId: "st-diane",
};

// 02.42 UTC = 10.42 WITA.
const saved = (version: string) => ({ ok: true as const, data: { version, savedAt: "2026-10-01T02:42:00.000Z" } });

function renderForm() {
  return render(
    <EncounterForm
      encounterId="e1"
      initialVersion="v1"
      initialDraft={emptyDraftInput()}
      options={options}
      intakeSlot={<p>Isian pasien</p>}
      autosaveDelayMs={50}
      retryDelaysMs={[300]}
    />,
  );
}

const status = () => screen.getByRole("status");

describe("EncounterForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("menyimpan otomatis setelah berhenti mengetik, lalu memakai versi baru untuk simpan berikutnya", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValueOnce(saved("v2")).mockResolvedValueOnce(saved("v3"));
    renderForm();
    expect(screen.getByText("Isian pasien")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Keluhan dan anamnesis dokter"), "Pusing");
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(1));
    expect(saveEncounterDraft).toHaveBeenLastCalledWith({
      encounterId: "e1",
      version: "v1",
      draft: expect.objectContaining({ subjective: "Pusing" }),
    });
    await waitFor(() => expect(status()).toHaveTextContent("Tersimpan 10.42"));

    await userEvent.type(screen.getByLabelText("Keluhan dan anamnesis dokter"), "!");
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(2));
    expect(saveEncounterDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: "v2", draft: expect.objectContaining({ subjective: "Pusing!" }) }),
    );
  });

  it("ketikan selama simpan masih berjalan ikut tersimpan berikutnya dengan versi terbaru", async () => {
    let finishFirst: (value: ReturnType<typeof saved>) => void = () => {};
    vi.mocked(saveEncounterDraft)
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(saved("v3"));
    renderForm();

    const field = screen.getByLabelText("Penilaian / diagnosis");
    await userEvent.type(field, "A");
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(1));
    await userEvent.type(field, "B");
    finishFirst(saved("v2"));

    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(2));
    expect(saveEncounterDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: "v2", draft: expect.objectContaining({ assessment: "AB" }) }),
    );
    await waitFor(() => expect(status()).toHaveTextContent("Tersimpan"));
  });

  it("angka yang tidak sah tidak dikirim, dan pesannya tampil", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Sistolik (mmHg)"), "12");
    await waitFor(() => expect(status()).toHaveTextContent("Belum tersimpan: Sistolik harus 50–260 mmHg."));
    expect(saveEncounterDraft).not.toHaveBeenCalled();
  });

  it("galat jaringan dicoba ulang sampai tersimpan", async () => {
    vi.mocked(saveEncounterDraft).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(saved("v2"));
    renderForm();
    await userEvent.type(screen.getByLabelText("Rencana, program, dan resep"), "Kontrol");
    await waitFor(() => expect(status()).toHaveTextContent("Belum tersimpan, mencoba lagi"));
    await waitFor(() => expect(status()).toHaveTextContent("Tersimpan 10.42"));
    expect(saveEncounterDraft).toHaveBeenCalledTimes(2);
  });

  it("penolakan server ditampilkan dan tidak dicoba ulang", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue({
      ok: false,
      error: "Catatan ini baru diubah di tempat lain. Muat ulang halaman.",
    });
    renderForm();
    await userEvent.type(screen.getByLabelText("Pemeriksaan fisik"), "Normal");
    await waitFor(() => expect(status()).toHaveTextContent("Belum tersimpan: Catatan ini baru diubah di tempat lain."));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(saveEncounterDraft).toHaveBeenCalledTimes(1);
  });

  it("IMT dihitung dari berat dan tinggi", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    renderForm();
    expect(screen.getByText("IMT —")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    await userEvent.type(screen.getByLabelText("Tinggi badan (cm)"), "160");
    expect(screen.getByText("IMT 28,3")).toBeInTheDocument();
  });

  it("treatment baru memakai layanan booking dan tenaga terjadwal sebagai usulan", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Tambah treatment" }));
    const row = screen.getByRole("group", { name: "Treatment 1" });
    expect(within(row).getByLabelText("Treatment")).toHaveValue("svc-konsul");
    expect(within(row).getByLabelText("Pelaksana")).toHaveValue("st-diane");

    await userEvent.selectOptions(within(row).getByLabelText("Treatment"), "svc-meso");
    await userEvent.type(within(row).getByLabelText("Area"), "Perut");
    await waitFor(() =>
      expect(saveEncounterDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({
            treatments: [{ serviceId: "svc-meso", area: "Perut", dose: "", performerId: "st-diane", notes: "" }],
          }),
        }),
      ),
    );

    await userEvent.click(within(row).getByRole("button", { name: "Hapus treatment 1" }));
    expect(screen.queryByRole("group", { name: "Treatment 1" })).not.toBeInTheDocument();
  });

  it("finalisasi tanpa penilaian ditolak sebelum dialog terbuka", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Finalisasi" }));
    expect(toast.error).toHaveBeenCalledWith("Isi penilaian (A) sebelum finalisasi.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(finalizeEncounter).not.toHaveBeenCalled();
  });

  it("finalisasi sesaat setelah mengetik mengirim isian terakhir, lalu memuat ulang halaman", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    vi.mocked(finalizeEncounter).mockResolvedValue({ ok: true, data: undefined });
    renderForm();

    await userEvent.type(screen.getByLabelText("Penilaian / diagnosis"), "Obesitas");
    await userEvent.click(screen.getByRole("button", { name: "Finalisasi" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Finalisasi" }));

    await waitFor(() => expect(finalizeEncounter).toHaveBeenCalledTimes(1));
    expect(finalizeEncounter).toHaveBeenCalledWith(
      expect.objectContaining({ encounterId: "e1", draft: expect.objectContaining({ assessment: "Obesitas" }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("buang draf mengirim versi terakhir lalu kembali ke dasbor", async () => {
    vi.mocked(discardEncounterDraft).mockResolvedValue({ ok: true, data: undefined });
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Buang draf" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Buang draf" }));
    await waitFor(() => expect(discardEncounterDraft).toHaveBeenCalledWith({ encounterId: "e1", version: "v1" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/components/encounter-form.test.tsx`
Expected: FAIL. Modul `@/components/admin/encounter-form` belum ada.

- [ ] **Step 3: Tulis `src/components/admin/use-draft-autosave.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

export const AUTOSAVE_DELAY_MS = 1500;
export const AUTOSAVE_RETRY_DELAYS_MS: readonly number[] = [2000, 4000, 8000, 16000, 30000];

export type SavedDraft = { version: string; savedAt: string };

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saved"; savedAt: string }
  | { kind: "retrying" }
  | { kind: "rejected"; message: string };

type Options<T> = {
  initialVersion: string;
  save: (version: string, value: T) => Promise<ActionResult<SavedDraft>>;
  /** Pesan bila nilai belum boleh dikirim, atau null. */
  validate: (value: T) => string | null;
  delayMs?: number;
  retryDelaysMs?: readonly number[];
};

/**
 * Simpan otomatis draf (spec 7). Pada satu waktu hanya ada satu permintaan,
 * selalu dengan versi terakhir dari server, dan nilai terbaru yang menang.
 * Galat jaringan dicoba ulang dengan jeda bertambah. Penolakan server (isian
 * tidak sah, diubah di tempat lain, sudah final) ditampilkan dan menunggu
 * perubahan berikutnya.
 */
class DraftSaver<T> {
  options: Options<T>;
  private version: string;
  private unsaved: { value: T } | null = null;
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;

  constructor(
    options: Options<T>,
    private readonly report: (status: AutosaveStatus) => void,
  ) {
    this.options = options;
    this.version = options.initialVersion;
  }

  change(value: T) {
    this.unsaved = { value };
    this.report({ kind: "pending" });
    this.schedule(this.options.delayMs ?? AUTOSAVE_DELAY_MS);
  }

  /** Membatalkan simpan terjadwal dan menunggu yang sedang berjalan; mengembalikan versi terakhir. */
  async settle(): Promise<string> {
    this.cancelTimer();
    await this.queue;
    return this.version;
  }

  /** Setelah finalisasi atau pembuangan berhasil: tidak ada lagi yang perlu disimpan. */
  forget() {
    this.cancelTimer();
    this.unsaved = null;
    this.report({ kind: "idle" });
  }

  dispose() {
    this.cancelTimer();
  }

  private schedule(delay: number) {
    this.cancelTimer();
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  private cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private flush(): Promise<void> {
    this.queue = this.queue.then(() => this.attempt());
    return this.queue;
  }

  private async attempt() {
    const pending = this.unsaved;
    if (!pending) return;
    const problem = this.options.validate(pending.value);
    if (problem) {
      this.report({ kind: "rejected", message: problem });
      return;
    }
    this.unsaved = null;
    try {
      const result = await this.options.save(this.version, pending.value);
      if (!result.ok) {
        this.unsaved ??= pending;
        this.report({ kind: "rejected", message: result.error });
        return;
      }
      this.failures = 0;
      this.version = result.data.version;
      this.report(this.unsaved ? { kind: "pending" } : { kind: "saved", savedAt: result.data.savedAt });
    } catch {
      // Ketikan yang lebih baru (bila ada) menang atas nilai yang gagal dikirim.
      this.unsaved ??= pending;
      const delays = this.options.retryDelaysMs ?? AUTOSAVE_RETRY_DELAYS_MS;
      const delay = delays[Math.min(this.failures, delays.length - 1)];
      this.failures += 1;
      this.report({ kind: "retrying" });
      this.schedule(delay);
    }
  }
}

export function useDraftAutosave<T>(options: Options<T>) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  const [saver] = useState(() => new DraftSaver<T>(options, setStatus));

  useEffect(() => {
    saver.options = options;
  });
  useEffect(() => () => saver.dispose(), [saver]);

  // Peringatkan sebelum halaman ditutup selama ada perubahan yang belum tersimpan.
  useEffect(() => {
    if (status.kind === "idle" || status.kind === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status.kind]);

  return {
    status,
    change: (value: T) => saver.change(value),
    settle: () => saver.settle(),
    forget: () => saver.forget(),
  };
}
```

- [ ] **Step 4: Tulis `src/components/admin/encounter-form.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ENCOUNTER_TEXT_MAX,
  FINALIZE_NEEDS_ASSESSMENT,
  TEXT_FIELDS,
  TREATMENT_TEXT_MAX,
  VITALS,
  VITAL_KEYS,
  bmi,
  formatDecimal,
  parseEncounterDraft,
  parseVital,
  type EncounterDraftInput,
  type EncounterOptions,
  type TextKey,
  type TreatmentInput,
  type VitalKey,
} from "@/lib/encounter";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { discardEncounterDraft, finalizeEncounter, saveEncounterDraft } from "@/server/encounter";
import { useDraftAutosave, type AutosaveStatus } from "./use-draft-autosave";

const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function statusText(status: AutosaveStatus): string {
  switch (status.kind) {
    case "idle":
      return "Draf tersimpan otomatis saat Anda mengetik.";
    case "pending":
      return "Menyimpan…";
    case "saved":
      return `Tersimpan ${minutesToTimeLabel(witaMinutesOfDay(new Date(status.savedAt)))}`;
    case "retrying":
      return "Belum tersimpan, mencoba lagi…";
    case "rejected":
      return `Belum tersimpan: ${status.message}`;
  }
}

function TextField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        maxLength={ENCOUNTER_TEXT_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass}
      />
    </div>
  );
}

function VitalField({ vital, value, onChange }: { vital: VitalKey; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const spec = VITALS[vital];
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {spec.label} ({spec.unit})
      </Label>
      <Input
        id={id}
        inputMode={spec.decimals === 0 ? "numeric" : "decimal"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TreatmentFields(props: {
  index: number;
  value: TreatmentInput;
  options: EncounterOptions;
  onChange: (patch: Partial<TreatmentInput>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const { index, value, options } = props;
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Treatment {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-service`}>Treatment</Label>
          <select
            id={`${id}-service`}
            className={selectClass}
            value={value.serviceId}
            onChange={(e) => props.onChange({ serviceId: e.target.value })}
          >
            {options.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-performer`}>Pelaksana</Label>
          <select
            id={`${id}-performer`}
            className={selectClass}
            value={value.performerId}
            onChange={(e) => props.onChange({ performerId: e.target.value })}
          >
            {options.performers.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-area`}>Area</Label>
          <Input
            id={`${id}-area`}
            maxLength={TREATMENT_TEXT_MAX.area}
            value={value.area}
            onChange={(e) => props.onChange({ area: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-dose`}>Dosis</Label>
          <Input
            id={`${id}-dose`}
            maxLength={TREATMENT_TEXT_MAX.dose}
            placeholder="mis. 12 unit"
            value={value.dose}
            onChange={(e) => props.onChange({ dose: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-notes`}>Catatan pasca-tindakan</Label>
        <textarea
          id={`${id}-notes`}
          rows={2}
          maxLength={TREATMENT_TEXT_MAX.notes}
          value={value.notes}
          onChange={(e) => props.onChange({ notes: e.target.value })}
          className={textareaClass}
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={props.onRemove}>
        Hapus treatment {index + 1}
      </Button>
    </fieldset>
  );
}

export type EncounterFormProps = {
  encounterId: string;
  initialVersion: string;
  initialDraft: EncounterDraftInput;
  options: EncounterOptions;
  /** Isian kuis kunjungan ini, ditampilkan di bagian S. */
  intakeSlot: ReactNode;
  autosaveDelayMs?: number;
  retryDelaysMs?: readonly number[];
};

/** Catatan draf S/O/A/P + treatment dengan simpan otomatis (spec 4–5, 7). */
export function EncounterForm(props: EncounterFormProps) {
  const { encounterId, options } = props;
  const router = useRouter();
  const [draft, setDraft] = useState(props.initialDraft);
  const [confirm, setConfirm] = useState<"finalize" | "discard" | null>(null);
  const [busy, startTransition] = useTransition();
  const autosave = useDraftAutosave<EncounterDraftInput>({
    initialVersion: props.initialVersion,
    save: (version, value) => saveEncounterDraft({ encounterId, version, draft: value }),
    validate: (value) => {
      const parsed = parseEncounterDraft(value);
      return parsed.ok ? null : parsed.message;
    },
    delayMs: props.autosaveDelayMs,
    retryDelaysMs: props.retryDelaysMs,
  });

  function update(next: EncounterDraftInput) {
    setDraft(next);
    autosave.change(next);
  }
  const setText = (key: TextKey, value: string) => update({ ...draft, [key]: value });
  const setVital = (key: VitalKey, value: string) => update({ ...draft, vitals: { ...draft.vitals, [key]: value } });
  const setTreatment = (index: number, patch: Partial<TreatmentInput>) =>
    update({ ...draft, treatments: draft.treatments.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const addTreatment = () =>
    update({
      ...draft,
      treatments: [
        ...draft.treatments,
        { serviceId: options.defaultServiceId, area: "", dose: "", performerId: options.defaultPerformerId, notes: "" },
      ],
    });
  const removeTreatment = (index: number) =>
    update({ ...draft, treatments: draft.treatments.filter((_, i) => i !== index) });

  const weight = parseVital("weightKg", draft.vitals.weightKg);
  const height = parseVital("heightCm", draft.vitals.heightCm);
  const index = weight.ok && height.ok ? bmi(weight.value, height.value) : null;

  function requestFinalize() {
    const parsed = parseEncounterDraft(draft);
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    if (!parsed.value.assessment) {
      toast.error(FINALIZE_NEEDS_ASSESSMENT);
      return;
    }
    setConfirm("finalize");
  }

  function finalize() {
    setConfirm(null);
    startTransition(async () => {
      const version = await autosave.settle();
      try {
        const result = await finalizeEncounter({ encounterId, version, draft });
        if (!result.ok) {
          toast.error(result.error);
          autosave.change(draft);
          return;
        }
        autosave.forget();
        toast.success("Catatan difinalisasi.");
        router.refresh();
      } catch {
        toast.error("Gagal memfinalisasi. Coba lagi.");
        autosave.change(draft);
      }
    });
  }

  function discard() {
    setConfirm(null);
    startTransition(async () => {
      const version = await autosave.settle();
      try {
        const result = await discardEncounterDraft({ encounterId, version });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        autosave.forget();
        toast.success("Draf dibuang.");
        router.push("/admin");
      } catch {
        toast.error("Gagal membuang draf. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="bagian-s" className="space-y-3">
        <h2 id="bagian-s" className="text-base font-medium">
          S — Subjective
        </h2>
        {props.intakeSlot}
        <TextField label={TEXT_FIELDS.subjective} value={draft.subjective} onChange={(v) => setText("subjective", v)} rows={4} />
      </section>

      <section aria-labelledby="bagian-o" className="space-y-3">
        <h2 id="bagian-o" className="text-base font-medium">
          O — Objective
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VITAL_KEYS.map((key) => (
            <VitalField key={key} vital={key} value={draft.vitals[key]} onChange={(v) => setVital(key, v)} />
          ))}
        </div>
        <p className="text-sm">IMT {index === null ? "—" : formatDecimal(index)}</p>
        <TextField label={TEXT_FIELDS.physicalExam} value={draft.physicalExam} onChange={(v) => setText("physicalExam", v)} />
      </section>

      <section aria-labelledby="bagian-a" className="space-y-3">
        <h2 id="bagian-a" className="text-base font-medium">
          A — Assessment
        </h2>
        <TextField label={TEXT_FIELDS.assessment} value={draft.assessment} onChange={(v) => setText("assessment", v)} />
      </section>

      <section aria-labelledby="bagian-p" className="space-y-3">
        <h2 id="bagian-p" className="text-base font-medium">
          P — Plan
        </h2>
        <TextField label={TEXT_FIELDS.plan} value={draft.plan} onChange={(v) => setText("plan", v)} />
      </section>

      <section aria-labelledby="bagian-treatment" className="space-y-3">
        <h2 id="bagian-treatment" className="text-base font-medium">
          Treatment yang dilakukan
        </h2>
        {draft.treatments.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada treatment di kunjungan ini.</p>
        )}
        {draft.treatments.map((row, i) => (
          <TreatmentFields
            key={i}
            index={i}
            value={row}
            options={options}
            onChange={(patch) => setTreatment(i, patch)}
            onRemove={() => removeTreatment(i)}
          />
        ))}
        <Button type="button" variant="outline" onClick={addTreatment}>
          Tambah treatment
        </Button>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button onClick={requestFinalize} disabled={busy}>
          Finalisasi
        </Button>
        <Button variant="outline" onClick={() => setConfirm("discard")} disabled={busy}>
          Buang draf
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {statusText(autosave.status)}
        </p>
      </div>

      <AlertDialog open={confirm === "finalize"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalisasi catatan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Catatan yang sudah final tidak bisa diubah, hanya bisa ditambah adendum. Booking ditandai Selesai.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={finalize}>Finalisasi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "discard"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buang draf kunjungan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Isi draf dan treatment-nya dihapus. Pasien kembali tampil sebagai belum diperiksa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discard}>
              Buang draf
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 5: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/components/encounter-form.test.tsx`
Expected: PASS (10 uji).

Bila uji "menyimpan otomatis…" memanggil simpan lebih dari sekali karena ketikan user-event lebih lambat dari 50 ms, naikkan `autosaveDelayMs` di `renderForm` menjadi 150. Jangan melonggarkan pernyataannya.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/use-draft-autosave.ts src/components/admin/encounter-form.tsx tests/unit/components/encounter-form.test.tsx
git commit -m "feat: visit draft form with serialized autosave, retry and finalize"
```

---

### Task 7: Halaman kunjungan

**Files:**
- Create: `src/components/admin/intake-clinical-content.tsx`, `src/components/admin/encounter-warnings.tsx`, `src/components/admin/encounter-intake-content.tsx`, `src/components/admin/encounter-record.tsx`, `src/components/admin/addendum-form.tsx`, `src/components/admin/audit-trail.tsx`, `src/components/admin/encounter-page-view.tsx`
- Create: `src/app/(admin)/admin/kunjungan/[id]/page.tsx`
- Modify: `src/components/admin/intake-view.tsx`
- Test: `tests/unit/components/encounter-page-view.test.tsx` (uji `intake-view.test.tsx` yang lama harus tetap hijau)

**Interfaces:**
- Consumes: `EncounterDetail`, `EncounterIntake`, `EncounterWarnings`, `getEncounterForStaff` (Task 4); `EncounterForm` (Task 6); `addEncounterAddendum` (Task 3); `AuditTrailRow` (Task 3); `IntakeClinical` (Task 4); `TEXT_FIELDS` (Task 2).
- Produces:
  - `IntakeClinicalContent({ clinical: IntakeClinical; level?: 2 | 3 })`
  - `EncounterPageView({ encounter: EncounterDetail; canWrite: boolean })`
  - rute `/admin/kunjungan/[id]`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/encounter-page-view.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EncounterPageView } from "@/components/admin/encounter-page-view";
import { emptyDraftInput } from "@/lib/encounter";
import type { EncounterDetail } from "@/server/encounter-read";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/encounter", () => ({
  saveEncounterDraft: vi.fn(),
  finalizeEncounter: vi.fn(),
  discardEncounterDraft: vi.fn(),
  addEncounterAddendum: vi.fn(),
}));

const base: EncounterDetail = {
  id: "e1",
  status: "DRAF",
  version: "2026-10-01T02:00:00.000Z",
  createdByName: "dr. Diane",
  finalized: null,
  appointment: {
    id: "a1",
    code: "SDY-8F3K",
    startAt: new Date("2026-10-01T07:00:00Z"),
    serviceName: "Konsultasi Dokter",
    staffName: "dr. Diane",
    branchName: "SunDY Mahakeret",
  },
  patient: { id: "p1", name: "Siti Rahayu", medicalRecordNumber: "SDY-2026-0001", ageLabel: "34 tahun", genderLabel: "Perempuan" },
  warnings: { allergies: "Udang", medicalHistory: null, importantNotes: "Takut jarum", paperRecordNumber: "RM-0457", pregnancy: true },
  intake: null,
  draft: emptyDraftInput(),
  vitalLines: [],
  treatments: [],
  addenda: [],
  options: { services: [{ id: "s1", name: "Konsultasi Dokter" }], performers: [{ id: "d1", name: "dr. Diane" }], defaultServiceId: "s1", defaultPerformerId: "d1" },
  trail: null,
};

const final: EncounterDetail = {
  ...base,
  status: "FINAL",
  finalized: { byName: "dr. Diane", at: new Date("2026-10-01T08:00:00Z") },
  draft: { ...emptyDraftInput(), subjective: "Berat naik", assessment: "Obesitas derajat 1", plan: "Program MAX" },
  vitalLines: ["Tekanan darah: 120/80 mmHg", "IMT 28,3"],
  treatments: [{ serviceName: "Meso", area: "Perut", dose: null, performerName: "dr. Diane", notes: null }],
  addenda: [{ id: "ad1", text: "Tensi diukur ulang: 118/78.", authorName: "dr. Diane", createdAt: new Date("2026-10-02T01:00:00Z") }],
};

describe("EncounterPageView", () => {
  it("menampilkan identitas dan semua peringatan", () => {
    render(<EncounterPageView encounter={base} canWrite />);
    expect(screen.getByRole("heading", { name: "Siti Rahayu" })).toBeInTheDocument();
    expect(screen.getByText(/SDY-2026-0001 · 34 tahun · Perempuan/)).toBeInTheDocument();
    const warnings = screen.getByRole("region", { name: "Peringatan" });
    expect(within(warnings).getByText("Udang")).toBeInTheDocument();
    expect(within(warnings).getByText("Takut jarum")).toBeInTheDocument();
    expect(within(warnings).getByText("Hamil, merencanakan kehamilan, atau menyusui (dari isian kunjungan ini)")).toBeInTheDocument();
    expect(within(warnings).getByText("Ada berkas kertas: RM-0457")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data pasien" })).toHaveAttribute("href", "/admin/pasien/p1");
  });

  it("menyebut bila alergi dan riwayat penyakit belum dicatat", () => {
    render(
      <EncounterPageView
        encounter={{ ...base, warnings: { allergies: null, medicalHistory: null, importantNotes: null, paperRecordNumber: null, pregnancy: false } }}
        canWrite
      />,
    );
    expect(screen.getByText("Alergi dan riwayat penyakit belum dicatat.")).toBeInTheDocument();
  });

  it("draf untuk penulis: formulir tampil, tanpa bagian adendum", () => {
    render(<EncounterPageView encounter={base} canWrite />);
    expect(screen.getByLabelText("Keluhan dan anamnesis dokter")).toBeInTheDocument();
    expect(screen.getByText("Draf")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Adendum" })).not.toBeInTheDocument();
  });

  it("final: baca-saja dengan tanda vital, treatment, adendum, dan formulir adendum", () => {
    render(<EncounterPageView encounter={final} canWrite />);
    expect(screen.queryByLabelText("Keluhan dan anamnesis dokter")).not.toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.getByText("Tekanan darah: 120/80 mmHg")).toBeInTheDocument();
    expect(screen.getByText("Obesitas derajat 1")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Meso" })).toBeInTheDocument();
    expect(screen.getByText(/Difinalisasi oleh dr\. Diane/)).toBeInTheDocument();
    const addenda = screen.getByRole("region", { name: "Adendum" });
    expect(within(addenda).getByText("Tensi diukur ulang: 118/78.")).toBeInTheDocument();
    expect(within(addenda).getByLabelText("Isi adendum")).toBeInTheDocument();
  });

  it("jejak catatan hanya tampil bila diberikan (Super Admin)", () => {
    const { unmount } = render(<EncounterPageView encounter={final} canWrite />);
    expect(screen.queryByText("Jejak catatan ini")).not.toBeInTheDocument();
    unmount();

    render(
      <EncounterPageView
        encounter={{
          ...final,
          trail: [{ id: "t1", at: new Date("2026-10-01T08:00:00Z"), actorName: "dr. Diane", roleLabel: "Dokter", actionLabel: "memfinalisasi" }],
        }}
        canWrite
      />,
    );
    expect(screen.getByText("Jejak catatan ini")).toBeInTheDocument();
    expect(screen.getByText("memfinalisasi")).toBeInTheDocument();
  });

  it("isian kuis di bagian S: belum diisi, galat versi, dan siap dengan tautan persetujuan", () => {
    const { unmount } = render(<EncounterPageView encounter={{ ...base, intake: { id: "i1", state: "pending" } }} canWrite />);
    expect(screen.getByText("Isian belum diisi pasien.")).toBeInTheDocument();
    unmount();

    const second = render(
      <EncounterPageView
        encounter={{ ...base, intake: { id: "i1", state: "error", message: "Isian dengan kuis versi 9 belum bisa ditampilkan." } }}
        canWrite
      />,
    );
    expect(screen.getByText(/Isian dengan kuis versi 9 belum bisa ditampilkan\./)).toBeInTheDocument();
    second.unmount();

    render(
      <EncounterPageView
        encounter={{
          ...base,
          intake: {
            id: "i1",
            state: "ready",
            needsApproval: true,
            clinical: { sections: [{ title: "Kesehatan", lines: ["Diabetes: Metformin"] }], activities: null, activityDateLabel: null, habits: null },
          },
        }}
        canWrite
      />,
    );
    expect(screen.getByText("Diabetes: Metformin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setujui ke data pasien" })).toHaveAttribute("href", "/admin/isian/i1");
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/components/encounter-page-view.test.tsx`
Expected: FAIL. `@/components/admin/encounter-page-view` belum ada.

- [ ] **Step 3: Pindahkan isi klinis isian ke `src/components/admin/intake-clinical-content.tsx`**

Pindahkan tiga blok dari `IntakeView` (daftar `clinical.sections`, tabel kebiasaan, dan tabel aktivitas) ke komponen baru, dengan level judul yang bisa diatur:

```tsx
import type { IntakeClinical } from "@/server/intake-clinical";

/**
 * Jawaban kuis untuk staf: bagian jawaban, tabel kebiasaan (form recall), dan
 * tabel aktivitas kemarin. Dipakai halaman isian dan bagian S halaman kunjungan.
 */
export function IntakeClinicalContent({ clinical, level = 2 }: { clinical: IntakeClinical; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <>
      {clinical.sections.map((section) => (
        <section key={section.title} className="space-y-1">
          <Heading className="text-base font-medium">{section.title}</Heading>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
      {clinical.habits && (
        <section className="space-y-2">
          <Heading className="text-base font-medium">Kebiasaan sehari (form recall)</Heading>
          <table aria-label="Kebiasaan sehari" className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-16 py-1">Jam</th>
                <th className="py-1">Jenis dan jumlah</th>
              </tr>
            </thead>
            <tbody>
              {clinical.habits.rows.map((row) => (
                <tr key={row.label} className="border-b align-top">
                  <td className="py-1 tabular-nums text-muted-foreground">{row.label}</td>
                  <td className="py-1">{row.entries.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {clinical.habits.notes.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {clinical.habits.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {clinical.activities && (
        <section className="space-y-2">
          <Heading className="text-base font-medium">Aktivitas {clinical.activityDateLabel ?? "kemarin"}</Heading>
          <table aria-label={`Aktivitas ${clinical.activityDateLabel ?? "kemarin"}`} className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-16 py-1">Jam</th>
                <th className="py-1">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {clinical.activities.map((row) => (
                <tr key={row.hour} className="border-b align-top">
                  <td className="py-1 tabular-nums text-muted-foreground">{row.label}</td>
                  <td className="py-1">
                    {row.entries.map((entry, index) => (
                      <span key={index} className="mr-2 inline-block">
                        <span className="text-muted-foreground">{entry.kindLabel}:</span> {entry.text}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
```

Isinya sama persis dengan blok yang dipindah dari `intake-view.tsx`. Hanya judul `<h2>` yang kini mengikuti `level`.

Di `src/components/admin/intake-view.tsx`, ganti ketiga blok itu dengan `<IntakeClinicalContent clinical={clinical} />`, lalu tambahkan `import { IntakeClinicalContent } from "./intake-clinical-content";`.

Run: `npx vitest run tests/unit/components/intake-view.test.tsx`
Expected: PASS tanpa mengubah ujinya.

- [ ] **Step 4: Tulis komponen halaman kunjungan**

`src/components/admin/encounter-warnings.tsx`:

```tsx
import type { EncounterWarnings } from "@/server/encounter-read";

function Warning({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

/** Kotak peringatan di atas setiap kunjungan (spec R6, bagian 5). Bagian kosong tidak ditampilkan. */
export function EncounterWarningsBox({ warnings }: { warnings: EncounterWarnings }) {
  const recordMissing = !warnings.allergies && !warnings.medicalHistory;
  return (
    <section
      aria-labelledby="peringatan"
      className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <h2 id="peringatan" className="text-base font-medium">
        Peringatan
      </h2>
      {recordMissing ? (
        <p>Alergi dan riwayat penyakit belum dicatat.</p>
      ) : (
        <>
          {warnings.allergies && <Warning label="Alergi" text={warnings.allergies} />}
          {warnings.medicalHistory && <Warning label="Riwayat penyakit & obat" text={warnings.medicalHistory} />}
        </>
      )}
      {warnings.importantNotes && <Warning label="Catatan penting" text={warnings.importantNotes} />}
      {warnings.pregnancy && <p className="font-medium">Hamil, merencanakan kehamilan, atau menyusui (dari isian kunjungan ini)</p>}
      {warnings.paperRecordNumber && <p>Ada berkas kertas: {warnings.paperRecordNumber}</p>}
    </section>
  );
}
```

`src/components/admin/encounter-intake-content.tsx`:

```tsx
import Link from "next/link";
import type { EncounterIntake } from "@/server/encounter-read";
import { IntakeClinicalContent } from "./intake-clinical-content";

/** Isian kuis booking ini di bagian S (spec bagian 5). */
export function EncounterIntakeContent({ intake }: { intake: EncounterIntake | null }) {
  if (!intake) return <p className="text-sm text-muted-foreground">Tidak ada isian kuis untuk kunjungan ini.</p>;
  if (intake.state === "pending") return <p className="text-sm text-muted-foreground">Isian belum diisi pasien.</p>;

  const pageLink = (
    <Link href={`/admin/isian/${intake.id}`} className="underline underline-offset-4">
      Buka halaman isian
    </Link>
  );
  if (intake.state === "error") {
    return (
      <p className="text-sm text-destructive">
        {intake.message} {pageLink}
      </p>
    );
  }
  return (
    <details open className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">Isian pendaftaran</summary>
      <div className="mt-3 space-y-4">
        <IntakeClinicalContent clinical={intake.clinical} level={3} />
        <p className="text-sm">
          {intake.needsApproval ? (
            <Link href={`/admin/isian/${intake.id}`} className="underline underline-offset-4">
              Setujui ke data pasien
            </Link>
          ) : (
            pageLink
          )}
        </p>
      </div>
    </details>
  );
}
```

`src/components/admin/encounter-record.tsx`:

```tsx
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TEXT_FIELDS } from "@/lib/encounter";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { EncounterDetail } from "@/server/encounter-read";

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-base font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RecordText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h3 className="text-xs text-muted-foreground">{label}</h3>
      <p className="whitespace-pre-line text-sm">{value || "—"}</p>
    </div>
  );
}

/** Catatan kunjungan baca-saja: final, atau draf yang dibuka tanpa hak menulis. */
export function EncounterRecord({ encounter, intakeSlot }: { encounter: EncounterDetail; intakeSlot: ReactNode }) {
  const { draft } = encounter;
  return (
    <div className="space-y-6">
      <Part id="bagian-s" title="S — Subjective">
        {intakeSlot}
        <RecordText label={TEXT_FIELDS.subjective} value={draft.subjective} />
      </Part>
      <Part id="bagian-o" title="O — Objective">
        {encounter.vitalLines.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {encounter.vitalLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Tanda vital tidak diukur.</p>
        )}
        <RecordText label={TEXT_FIELDS.physicalExam} value={draft.physicalExam} />
      </Part>
      <Part id="bagian-a" title="A — Assessment">
        <RecordText label={TEXT_FIELDS.assessment} value={draft.assessment} />
      </Part>
      <Part id="bagian-p" title="P — Plan">
        <RecordText label={TEXT_FIELDS.plan} value={draft.plan} />
      </Part>
      <Part id="bagian-treatment" title="Treatment yang dilakukan">
        {encounter.treatments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada treatment di kunjungan ini.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Treatment</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Dosis</TableHead>
                <TableHead>Pelaksana</TableHead>
                <TableHead>Catatan pasca-tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {encounter.treatments.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{row.serviceName}</TableCell>
                  <TableCell>{row.area ?? "—"}</TableCell>
                  <TableCell>{row.dose ?? "—"}</TableCell>
                  <TableCell>{row.performerName}</TableCell>
                  <TableCell className="whitespace-pre-line">{row.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Part>
      {encounter.finalized && (
        <p className="text-sm text-muted-foreground">
          Difinalisasi oleh {encounter.finalized.byName}, {formatIndonesianDate(encounter.finalized.at)}{" "}
          {minutesToTimeLabel(witaMinutesOfDay(encounter.finalized.at))} WITA
        </p>
      )}
    </div>
  );
}
```

`src/components/admin/addendum-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ENCOUNTER_TEXT_MAX } from "@/lib/encounter";
import { addEncounterAddendum } from "@/server/encounter";

const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Tambah adendum pada catatan final (PRD F12). */
export function AddendumForm({ encounterId }: { encounterId: string }) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        const result = await addEncounterAddendum({ encounterId, text });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setText("");
        toast.success("Adendum ditambahkan.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan adendum. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Tambah adendum</h3>
      <Label htmlFor={id}>Isi adendum</Label>
      <textarea
        id={id}
        rows={3}
        maxLength={ENCOUNTER_TEXT_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={textareaClass}
      />
      <Button onClick={submit} disabled={pending || text.trim() === ""}>
        Simpan adendum
      </Button>
    </div>
  );
}
```

`src/components/admin/audit-trail.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { AuditTrailRow } from "@/server/audit";

/** "Jejak catatan ini" (spec bagian 9) — hanya diberikan untuk audit:read. */
export function AuditTrail({ rows }: { rows: AuditTrailRow[] }) {
  return (
    <details className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">Jejak catatan ini</summary>
      <div className="mt-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Waktu (WITA)</TableHead>
            <TableHead>Staf</TableHead>
            <TableHead>Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                {formatShortIndonesianDate(row.at)}, {minutesToTimeLabel(witaMinutesOfDay(row.at))}
              </TableCell>
              <TableCell>
                {row.actorName} ({row.roleLabel})
              </TableCell>
              <TableCell>{row.actionLabel}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </details>
  );
}
```

Prettier akan merapikan indentasi `<div>` pembungkus.

`src/components/admin/encounter-page-view.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { EncounterDetail } from "@/server/encounter-read";
import { AddendumForm } from "./addendum-form";
import { AuditTrail } from "./audit-trail";
import { EncounterForm } from "./encounter-form";
import { EncounterIntakeContent } from "./encounter-intake-content";
import { EncounterRecord } from "./encounter-record";
import { EncounterWarningsBox } from "./encounter-warnings";

/** Halaman kunjungan (spec 4–5): kepala, peringatan, catatan, adendum, dan jejak. */
export function EncounterPageView({ encounter, canWrite }: { encounter: EncounterDetail; canWrite: boolean }) {
  const { appointment, patient } = encounter;
  const time = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));
  const intakeSlot = <EncounterIntakeContent intake={encounter.intake} />;
  const isFinal = encounter.status === "FINAL";
  const identity = [`No. RM ${patient.medicalRecordNumber}`, patient.ageLabel, patient.genderLabel].filter(Boolean).join(" · ");

  return (
    <div className="max-w-4xl space-y-6">
      <section className="space-y-1 rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-medium">{patient.name}</h2>
          <Badge variant={isFinal ? "default" : "outline"}>{isFinal ? "Final" : "Draf"}</Badge>
        </div>
        <p>{identity}</p>
        <p>
          {formatIndonesianDate(appointment.startAt)}, {time} WITA · {appointment.branchName} · {appointment.serviceName} ·{" "}
          {appointment.staffName}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{appointment.code}</p>
        <Link href={`/admin/pasien/${patient.id}`} className="underline underline-offset-4">
          Data pasien
        </Link>
      </section>

      <EncounterWarningsBox warnings={encounter.warnings} />

      {!isFinal && canWrite ? (
        <EncounterForm
          encounterId={encounter.id}
          initialVersion={encounter.version}
          initialDraft={encounter.draft}
          options={encounter.options}
          intakeSlot={intakeSlot}
        />
      ) : (
        <EncounterRecord encounter={encounter} intakeSlot={intakeSlot} />
      )}

      {isFinal && (
        <section aria-labelledby="adendum" className="space-y-3">
          <h2 id="adendum" className="text-base font-medium">
            Adendum
          </h2>
          {encounter.addenda.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada adendum.</p>
          ) : (
            <ol className="space-y-2">
              {encounter.addenda.map((addendum) => (
                <li key={addendum.id} className="rounded-md border p-3 text-sm">
                  <p className="whitespace-pre-line">{addendum.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {addendum.authorName} · {formatIndonesianDate(addendum.createdAt)},{" "}
                    {minutesToTimeLabel(witaMinutesOfDay(addendum.createdAt))} WITA
                  </p>
                </li>
              ))}
            </ol>
          )}
          {canWrite && <AddendumForm encounterId={encounter.id} />}
        </section>
      )}

      {encounter.trail && <AuditTrail rows={encounter.trail} />}
    </div>
  );
}
```

`src/app/(admin)/admin/kunjungan/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EncounterPageView } from "@/components/admin/encounter-page-view";
import { can } from "@/lib/permissions";
import { getEncounterForStaff } from "@/server/encounter-read";
import { requireCapability } from "@/server/session";

/** Halaman untuk pembaca rekam medis saja; resepsionis ditolak di sini (spec bagian 8). */
export default async function EncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("record:read");
  const { id } = await params;
  const encounter = await getEncounterForStaff(id);
  if (!encounter) notFound();

  return (
    <>
      <AdminHeader title="Kunjungan" />
      <div className="p-6">
        <EncounterPageView encounter={encounter} canWrite={can(staff.role, "record:write")} />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/components/encounter-page-view.test.tsx tests/unit/components/intake-view.test.tsx tests/unit/architecture.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/intake-clinical-content.tsx src/components/admin/intake-view.tsx src/components/admin/encounter-warnings.tsx src/components/admin/encounter-intake-content.tsx src/components/admin/encounter-record.tsx src/components/admin/addendum-form.tsx src/components/admin/audit-trail.tsx src/components/admin/encounter-page-view.tsx "src/app/(admin)/admin/kunjungan/[id]/page.tsx" tests/unit/components/encounter-page-view.test.tsx
git commit -m "feat: visit page with warnings, read-only record, addenda and audit trail"
```

---

### Task 8: Dasbor dokter

**Files:**
- Create: `src/components/admin/open-encounter-button.tsx`, `src/components/admin/doctor-worklist.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`
- Test: `tests/unit/components/doctor-worklist.test.tsx`

**Interfaces:**
- Consumes: `listDoctorWorklist`, `type DoctorWorklist`, `type WorklistRow` (Task 4); `openEncounter` (Task 3).
- Produces: `DoctorWorklistView({ worklist: DoctorWorklist })`, `OpenEncounterButton({ appointmentId: string })`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/doctor-worklist.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DoctorWorklistView } from "@/components/admin/doctor-worklist";
import { openEncounter } from "@/server/encounter";
import type { WorklistRow } from "@/server/encounter-read";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/encounter", () => ({ openEncounter: vi.fn() }));

const row = (patch: Partial<WorklistRow>): WorklistRow => ({
  appointmentId: "a1",
  code: "SDY-8F3K",
  startAt: new Date("2026-10-01T07:00:00Z"),
  patientName: "Siti Rahayu",
  patientRecordNumber: "SDY-2026-0001",
  serviceName: "Konsultasi Dokter",
  branchName: "SunDY Mahakeret",
  encounterId: null,
  state: "BELUM",
  ...patch,
});

describe("DoctorWorklistView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pasien hari ini: Periksa, Lanjutkan, atau Lihat sesuai status kunjungan", () => {
    render(
      <DoctorWorklistView
        worklist={{
          today: [
            row({}),
            row({ appointmentId: "a2", patientName: "Budi", state: "DRAF", encounterId: "e2" }),
            row({ appointmentId: "a3", patientName: "Rina", state: "FINAL", encounterId: "e3" }),
          ],
          unfinished: [],
        }}
      />,
    );
    const today = screen.getByRole("region", { name: "Pasien hari ini" });
    const rows = within(today).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("15.00");
    expect(rows[1]).toHaveTextContent("Belum diperiksa");
    expect(within(rows[1]).getByRole("button", { name: "Periksa" })).toBeInTheDocument();
    expect(within(rows[2]).getByRole("link", { name: "Lanjutkan" })).toHaveAttribute("href", "/admin/kunjungan/e2");
    expect(within(rows[3]).getByRole("link", { name: "Lihat" })).toHaveAttribute("href", "/admin/kunjungan/e3");
    expect(screen.getByText("Tidak ada catatan yang tertinggal.")).toBeInTheDocument();
  });

  it("catatan belum final menampilkan tanggalnya", () => {
    render(
      <DoctorWorklistView
        worklist={{ today: [], unfinished: [row({ startAt: new Date("2026-09-28T07:00:00Z"), state: "DRAF", encounterId: "e9" })] }}
      />,
    );
    expect(screen.getByText("Belum ada pasien yang ditandai hadir hari ini.")).toBeInTheDocument();
    const unfinished = screen.getByRole("region", { name: "Catatan belum final" });
    expect(within(unfinished).getByText(/28 Sep/)).toBeInTheDocument();
    expect(within(unfinished).getByRole("link", { name: "Lanjutkan" })).toHaveAttribute("href", "/admin/kunjungan/e9");
  });

  it("Periksa membuka kunjungan lalu pindah ke halamannya; galat ditampilkan", async () => {
    vi.mocked(openEncounter).mockResolvedValueOnce({ ok: true, data: { encounterId: "e1" } });
    render(<DoctorWorklistView worklist={{ today: [row({})], unfinished: [] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Periksa" }));
    expect(openEncounter).toHaveBeenCalledWith("a1");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kunjungan/e1"));

    vi.mocked(openEncounter).mockResolvedValueOnce({ ok: false, error: "Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir." });
    await userEvent.click(screen.getByRole("button", { name: "Periksa" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir."),
    );
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/components/doctor-worklist.test.tsx`
Expected: FAIL. `@/components/admin/doctor-worklist` belum ada.

- [ ] **Step 3: Tulis komponen dan dasbor**

`src/components/admin/open-encounter-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openEncounter } from "@/server/encounter";

/** Tombol Periksa (spec 4.3): membuat atau membuka kunjungan, lalu pindah ke halamannya. */
export function OpenEncounterButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      try {
        const result = await openEncounter(appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        router.push(`/admin/kunjungan/${result.data.encounterId}`);
      } catch {
        toast.error("Gagal membuka kunjungan. Coba lagi.");
      }
    });
  }

  return (
    <Button size="sm" onClick={open} disabled={pending}>
      Periksa
    </Button>
  );
}
```

`src/components/admin/doctor-worklist.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { DoctorWorklist, WorklistRow, WorklistState } from "@/server/encounter-read";
import { OpenEncounterButton } from "./open-encounter-button";

const STATE_LABEL: Record<WorklistState, string> = { BELUM: "Belum diperiksa", DRAF: "Draf", FINAL: "Final" };

function Action({ row }: { row: WorklistRow }) {
  if (row.state === "BELUM" || !row.encounterId) return <OpenEncounterButton appointmentId={row.appointmentId} />;
  return (
    <Link href={`/admin/kunjungan/${row.encounterId}`} className="text-sm underline underline-offset-4">
      {row.state === "DRAF" ? "Lanjutkan" : "Lihat"}
    </Link>
  );
}

function WorklistTable({ rows, withDate }: { rows: WorklistRow[]; withDate: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{withDate ? "Jadwal" : "Jam"}</TableHead>
          <TableHead>Pasien</TableHead>
          <TableHead>Layanan</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const time = minutesToTimeLabel(witaMinutesOfDay(row.startAt));
          return (
            <TableRow key={row.appointmentId}>
              <TableCell className="whitespace-nowrap">{withDate ? `${formatShortIndonesianDate(row.startAt)}, ${time}` : time}</TableCell>
              <TableCell>
                <div className="font-medium">{row.patientName}</div>
                <div className="font-mono text-xs text-muted-foreground">{row.patientRecordNumber}</div>
              </TableCell>
              <TableCell>{row.serviceName}</TableCell>
              <TableCell>{row.branchName}</TableCell>
              <TableCell>
                <Badge variant={row.state === "FINAL" ? "default" : "outline"}>{STATE_LABEL[row.state]}</Badge>
              </TableCell>
              <TableCell>
                <Action row={row} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Dasbor dokter (spec 4.2): pasien hari ini dan catatan yang tertinggal. */
export function DoctorWorklistView({ worklist }: { worklist: DoctorWorklist }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="pasien-hari-ini" className="space-y-2">
        <h2 id="pasien-hari-ini" className="text-base font-medium">
          Pasien hari ini
        </h2>
        {worklist.today.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pasien yang ditandai hadir hari ini.</p>
        ) : (
          <WorklistTable rows={worklist.today} withDate={false} />
        )}
      </section>
      <section aria-labelledby="catatan-belum-final" className="space-y-2">
        <h2 id="catatan-belum-final" className="text-base font-medium">
          Catatan belum final
        </h2>
        {worklist.unfinished.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada catatan yang tertinggal.</p>
        ) : (
          <WorklistTable rows={worklist.unfinished} withDate />
        )}
      </section>
    </div>
  );
}
```

Ganti isi `src/app/(admin)/admin/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { DoctorWorklistView } from "@/components/admin/doctor-worklist";
import { can } from "@/lib/permissions";
import { listDoctorWorklist } from "@/server/encounter-read";
import { requireStaff } from "@/server/session";

export default async function AdminDashboardPage() {
  const staff = await requireStaff();
  // Dasbor dokter hanya untuk pembaca rekam medis (spec 4.2); resepsionis tetap seperti biasa.
  const worklist = can(staff.role, "record:read") ? await listDoctorWorklist() : null;

  return (
    <>
      <AdminHeader title="Dasbor" />
      <div className="space-y-8 p-6">
        <div>
          <h2 className="font-display text-3xl">Selamat datang, {staff.name}</h2>
          {!worklist && (
            <p className="mt-2 text-sm text-muted-foreground">
              Kelola booking dan kedatangan pasien lewat menu Booking, dan data pasien lewat menu Pasien.
            </p>
          )}
        </div>
        {worklist && <DoctorWorklistView worklist={worklist} />}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/components/doctor-worklist.test.tsx`
Expected: PASS (3 uji).

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: seluruh uji unit PASS dan bersih.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/open-encounter-button.tsx src/components/admin/doctor-worklist.tsx "src/app/(admin)/admin/page.tsx" tests/unit/components/doctor-worklist.test.tsx
git commit -m "feat: doctor dashboard with today's patients and unfinished notes"
```

---

### Task 9: Uji ujung-ke-ujung dan dokumen

**Files:**
- Modify: `tests/e2e/prepare-db.mts`
- Create: `tests/e2e/kunjungan.spec.ts`
- Modify: `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md` (baris Status), `docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md` (F12), `docs/operasional/server-sundy.md` (§4)

**Interfaces:**
- Consumes: seluruh fitur dari Task 1–8; seed `mahakeret`, `diane-paparang`, `konsultasi-dokter`; akun `E2E_ADMIN` (Super Admin) dan `E2E_RESEPSIONIS`.

- [ ] **Step 1: Fixture pasien hadir hari ini**

Tambahkan di akhir `tests/e2e/prepare-db.mts`, sebelum `await prisma.$disconnect();`:

```ts
// Kunjungan e2e (tests/e2e/kunjungan.spec.ts): satu pasien hadir HARI INI per
// proyek (desktop/mobile), dibuat langsung karena admin tidak bisa memesan jam
// yang sudah lewat. Jam 06.00/06.30 di luar jam buka agar tidak bentrok dengan
// slot yang dipesan uji lain.
const today = witaDateString(new Date());
const visitBranch = await prisma.branch.findUniqueOrThrow({ where: { slug: "mahakeret" } });
const visitDoctor = await prisma.staff.findUniqueOrThrow({ where: { slug: "diane-paparang" } });
const visitService = await prisma.service.findUniqueOrThrow({ where: { slug: "konsultasi-dokter" } });
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-KUNJ-${index + 1}`,
      name: `Pasien Kunjungan ${project}`,
      whatsapp: `6281200077${index}01`,
      birthDate: new Date("1990-05-17T00:00:00Z"),
      gender: "P",
      allergies: "Udang",
    },
  });
  const startAt = combineWitaDateAndMinutes(today, 6 * 60 + index * 30);
  await prisma.appointment.create({
    data: {
      code: `E2E-KUNJ-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: "WALK_IN",
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: patient.id,
    },
  });
}
```

Tambahkan impor di atas berkas: `import { combineWitaDateAndMinutes, witaDateString } from "../../src/lib/time";`.

- [ ] **Step 2: Tulis uji e2e**

`tests/e2e/kunjungan.spec.ts`:

```ts
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";

test.setTimeout(120_000);

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Kata Sandi").fill(account.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

/** Pasien hadir hari ini dari prepare-db.mts, satu per proyek agar desktop dan ponsel tidak berebut. */
const patientName = (testInfo: TestInfo) => `Pasien Kunjungan ${testInfo.project.name}`;

test("dokter memeriksa pasien hadir, memfinalisasi, lalu menambah adendum", async ({ page }, testInfo) => {
  await signIn(page, E2E_ADMIN);

  const today = page.getByRole("region", { name: "Pasien hari ini" });
  await today.getByRole("row").filter({ hasText: patientName(testInfo) }).getByRole("button", { name: "Periksa" }).click();
  await expect(page).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Peringatan" })).toContainText("Udang");

  await page.getByLabel("Keluhan dan anamnesis dokter").fill("Berat naik 3 kg sejak Juli.");
  await page.getByLabel("Sistolik (mmHg)").fill("120");
  await page.getByLabel("Diastolik (mmHg)").fill("80");
  await page.getByLabel("Berat badan (kg)").fill("72,5");
  await page.getByLabel("Tinggi badan (cm)").fill("160");
  await expect(page.getByText("IMT 28,3")).toBeVisible();
  // Tanda simpan otomatis; bukan getByRole("status"), karena toast juga bisa berperan status.
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });

  // Draf bertahan setelah halaman dimuat ulang.
  await page.reload();
  await expect(page.getByLabel("Keluhan dan anamnesis dokter")).toHaveValue("Berat naik 3 kg sejak Juli.");
  await expect(page.getByLabel("Berat badan (kg)")).toHaveValue("72,5");

  await page.getByRole("button", { name: "Tambah treatment" }).click();
  await page.getByRole("group", { name: "Treatment 1" }).getByLabel("Area").fill("Perut");
  await page.getByLabel("Penilaian / diagnosis").fill("Obesitas derajat 1");
  await page.getByLabel("Rencana, program, dan resep").fill("Program MAX, kontrol 1 minggu.");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Finalisasi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Keluhan dan anamnesis dokter")).toHaveCount(0);
  await expect(page.getByText("Tekanan darah: 120/80 mmHg")).toBeVisible();

  await page.getByLabel("Isi adendum").fill("Tensi diukur ulang: 118/78.");
  await page.getByRole("button", { name: "Simpan adendum" }).click();
  await expect(page.getByText("Tensi diukur ulang: 118/78.")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Data pasien" }).click();
  await expect(page).toHaveURL(/\/admin\/pasien\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Riwayat kunjungan" })).toContainText("Obesitas derajat 1");
});

test("resepsionis tidak melihat daftar pasien hari ini dan tidak bisa membuka kunjungan", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await expect(page.getByRole("region", { name: "Pasien hari ini" })).toHaveCount(0);

  const response = await page.goto("/admin/kunjungan/sembarang");
  expect(response?.status()).toBe(403);
  await expect(page.getByLabel("Keluhan dan anamnesis dokter")).toHaveCount(0);
});
```

- [ ] **Step 3: Jalankan uji e2e**

Pastikan uji integrasi tidak sedang berjalan.

Run: `npx playwright test tests/e2e/kunjungan.spec.ts`
Expected: PASS (2 uji × 2 proyek).

Run: `npm run test:e2e`
Expected: PASS. `public-site.spec.ts` :9/:51 yang kadang kehabisan waktu karena `next dev` lambat dengan 3 worker: jalankan ulang berkas itu sendirian dengan `npx playwright test tests/e2e/public-site.spec.ts`, dan catat hasilnya.

- [ ] **Step 4: Perbarui dokumen**

Di `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md`, ganti baris status menjadi:

```markdown
- **Status:** Disetujui pemilik (30 September 2026) · terlaksana (<tanggal hari ini, mis. 1 Oktober 2026>)
```

Di `docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md`, sesudah paragraf "**Aturan integritas:** …" di F12, tambahkan:

```markdown
**Status pelaksanaan (Oktober 2026):** kunjungan dan catatan SOAP, tanda vital, treatment per kunjungan, finalisasi, adendum, dan jejak audit dibangun lebih dulu sebagai rekam medis bagian 1 (`docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md`). Catatan final dikunci basis data. Check-in klinik (NIK, food recall H-1), hasil BIA dan grafik progres (F13), order obat, dan pengingat kontrol (F17) menyusul sebagai sub-proyek terpisah.
```

Di `docs/operasional/server-sundy.md` §4, sesudah butir "**Sejak kuis v2, jangan `deploy.sh kembali`…**", tambahkan:

```markdown
- **Sejak catatan dokter per kunjungan, jangan `deploy.sh kembali` ke rilis sebelumnya setelah ada kunjungan di produksi.** Rilis lama tidak menampilkan kunjungan, dan tidak tahu bahwa booking Selesai berasal dari catatan dokter. Tabel kunjungan dan trigger penguncinya tetap utuh di basis data; jangan pernah mematikan trigger `encounter_*` di produksi.
```

- [ ] **Step 5: Verifikasi akhir**

Run, berurutan dan tidak bersamaan:

```bash
npx vitest run
npm run test:integration
npx tsc --noEmit
npm run lint
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: semuanya PASS atau bersih, dan `migrate diff` keluar dengan kode 0.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/prepare-db.mts tests/e2e/kunjungan.spec.ts docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md docs/operasional/server-sundy.md
git commit -m "test: end-to-end doctor visit flow; docs for visit notes and rollback"
```

Pastikan `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md` **tidak** ikut ter-stage.
