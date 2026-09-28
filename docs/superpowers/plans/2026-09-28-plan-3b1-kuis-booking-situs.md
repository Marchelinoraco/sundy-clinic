# Plan 3b-1 — Kuis Pendaftaran, Booking Situs, Cek Status & Pencocokan Pasien

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasien bisa mendaftar sendiri di `sundyclinic.com/daftar` lewat kuis bergaya BetterMe, lalu mengecek atau membatalkan booking di `/cek-booking`. Admin mencocokkan booking situs dengan data pasien sebelum memverifikasi biaya booking. Dokter membaca isian pasien (baca saja).

**Architecture:**
- **Kuis versi 1** adalah data dan fungsi murni di `src/lib/kuis/v1/`: pilihan, skema zod, urutan langkah, dan aturan wajib isi. Satu definisi ini dipakai tiga pihak: layar kuis di browser, pemeriksaan ulang di server, dan tampilan isian untuk dokter.
- **Kirim** berjalan dalam satu transaksi: hold dilepas, lalu Appointment `SITUS` dibuat **tanpa pasien**, lalu `Intake` dibuat.
  - Exclusion constraint yang sudah ada tetap menjadi jaminan anti-bentrok.
  - CHECK constraint baru memastikan booking tanpa pasien tidak pernah bisa terkonfirmasi.
- **Admin mencocokkan** booking dengan pasien lama, atau membuat pasien baru dari isian.
- **Booking situs kedaluwarsa** diperiksa tepat sebelum slot dibutuhkan. Tidak ada cron.

**Tech Stack:** Next.js 15.5 App Router (server actions) · React 19 · Prisma 7.10 + `@prisma/adapter-pg` · PostgreSQL 18 (lokal `sundy_dev`/`sundy_test`, produksi di VPS) · zod 4 · shadcn/ui · Vitest 4 + Testing Library · Playwright

**Spec:** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md` (disetujui pemilik 28 Sep 2026). Bagian yang dikerjakan plan ini: 3.1–3.3, 5, 6.1–6.3, 7, 8, serta K1–K18 yang menyangkutnya. **Bagian 4 (link WA & QR), 6.4 (Setujui ke data pasien), dan 6.5 → Plan 3b-2.**

**Base branch:** `main` (setelah PR `desain-pendaftaran-pasien` di-merge). Kerjakan di branch baru `pendaftaran-pasien-3b1`.

**Prasyarat sebelum Task 5:** kata-kata kuis versi 1 (spec bagian 3.2) sudah ditinjau dr. Diane. Koreksi kata cukup diterapkan langsung ke `src/lib/kuis/v1/options.ts` dan `texts.ts` pada task yang membuatnya. Koreksi seperti ini tidak mengubah desain.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna, segmen URL (`/daftar`, `/cek-booking`, `/admin/isian`, `/admin/pengaturan`), dan komentar. Folder `src/lib/kuis/` sengaja berbahasa Indonesia karena ia adalah isi kuis.
- **Zona waktu:** WITA (`Asia/Makassar`, `CLINIC_TIMEZONE`). DateTime disimpan UTC. Tanggal dihitung dengan `src/lib/time.ts`.
- **Booking publik:** paling cepat **2 jam** dari sekarang, paling jauh **30 hari** ke depan, hold **10 menit**. Batal atau pindah jadwal oleh pasien paling lambat **2 jam** sebelum jadwal.
- **Biaya booking:** **Rp 100.000** (awal), dibaca dari `ClinicSetting`. Biaya ini terpisah dari biaya layanan dan tidak dikembalikan. Biaya berlaku untuk sumber `SITUS`, `WHATSAPP`, dan `TELEPON`, tetapi **tidak** untuk `WALK_IN`.
- **Kedaluwarsa:** hanya booking `SITUS` berstatus `MENUNGGU_KONFIRMASI` yang lebih tua dari **24 jam**.
- **Pasien baru** hanya memesan layanan `konsultasi-dokter`. Hanya pasien lama dengan tujuan Aesthetic yang boleh memilih treatment (layanan aktif di luar kategori `slimming`).
- **Situs tidak pernah memberi tahu** apakah sebuah nomor WA pernah berobat. Halaman publik tidak pernah menampilkan data klinis. Nomor WA di halaman publik selalu disamarkan (`0812-****-7890`).
- **Resepsionis tidak pernah menerima kolom klinis isian** (`answers`, `selfWeightKg`, `selfHeightCm`, `activityDate`). Aturan ini ditegakkan di kueri server, bukan di tampilan.
- **Isian tidak pernah dihapus, dan jawabannya tidak pernah diubah setelah `TERISI`.** Booking juga tidak pernah dihapus.
- **Berkas `"use server"`** hanya boleh mengekspor fungsi `async`, dan setiap ekspornya bisa dipanggil siapa pun dari browser. Karena itu:
  - fungsi internal (kedaluwarsa, perhitungan slot, pembuatan pasien) ditaruh di modul biasa tanpa direktif;
  - setiap aksi publik wajib memeriksa input dan pembatasan laju.
- **Halaman di `src/app`** tidak boleh mengimpor `@/lib/db` atau `@prisma/client`. Halaman publik juga tidak boleh mengimpor `@/server/session`, `@/server/staff`, `@/server/audit`, atau `@/lib/auth` (`tests/unit/architecture.test.ts`).
- **Pesan galat untuk pengguna** dikembalikan lewat `runAction` + `UserFacingError`, tidak dilempar sampai ke client.
- **Migrasi:** `npx prisma migrate dev --name <nama> --create-only`, sunting SQL-nya, lalu `npx prisma migrate dev`, lalu `npm run db:migrate:test`. Perubahan skema harus tetap cocok dengan rilis sebelumnya (runbook bagian 4).
- **Uji integrasi** berjalan ke `sundy_test` lewat `npm run test:integration`. Jangan menjalankannya bersamaan dengan `npm run test:e2e`, karena keduanya memakai basis data yang sama.
- **Setiap task** diakhiri commit Conventional Commits berbahasa Inggris dengan baris penutup `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Pasien mengganti tujuan di tengah kuis** (mis. sudah mengisi jalur Slimming, lalu kembali ke U2 dan memilih Aesthetic). Jawaban jalur lama tidak boleh ikut terkirim, dan dokter tidak boleh melihatnya. Diuji di Task 6 (`pruneAnswers`) dan Task 10 (isian tersimpan tanpa blok `slimming`).
2. **Refresh atau tombol kembali di HP di tengah kuis.** Jawaban tetap ada. Setelah Kirim berhasil, membuka `/daftar` lagi harus mulai dari awal, bukan menampilkan jawaban pasien sebelumnya. Diuji di Task 14 (uji komponen `sessionStorage`).
3. **Hold habis (lebih dari 10 menit) sebelum Kirim.** Booking tetap dibuat bila jamnya masih kosong. Kirim dua kali dengan token yang sama menghasilkan satu booking. Diuji di Task 10.
4. **Nomor WA diketik dalam berbagai bentuk** (`+62 812-3456-7890`, `0812 3456 7890`). Empat digit terakhir di `/cek-booking` tetap cocok. Diuji di Task 11.
5. **Tanggal di luar rentang dikirim langsung ke server** (kemarin, 31 hari lagi, atau jam yang tidak ditawarkan), atau jam HP pasien tidak dalam WITA. Server menolak, karena server satu-satunya penentu. Diuji di Task 9.

---

## Struktur Berkas

```
prisma/schema.prisma                         Intake, ClinicSetting, enum Intake*; Appointment.patientId
                                             boleh kosong + bookingFee; relasi balik di Patient & Staff
prisma/migrations/<ts>_pendaftaran_pasien/   + CHECK appointment_patient_required,
                                             CHECK clinic_setting_single_row, INSERT baris pengaturan

src/lib/kuis/v1/options.ts                   Pilihan & label kuis v1 (satu-satunya tempat kata pilihan)
src/lib/kuis/v1/answers.ts                   Skema zod bentuk jawaban + tipe QuizAnswers
src/lib/kuis/v1/identity.ts                  Pemeriksaan data diri (baru/lama)
src/lib/kuis/v1/steps.ts                     Urutan langkah, aturan wajib isi, pruneAnswers, validateQuizAnswers
src/lib/kuis/v1/texts.ts                     Judul & petunjuk tiap layar
src/lib/kuis/v1/describe.ts                  Ringkasan jawaban per bagian, IMT, tabel aktivitas 06–22
src/lib/booking-rules.ts                     Konstanta & aturan tanggal booking publik
src/lib/payment.ts                           Format rekening, biaya per sumber booking
src/lib/privacy.ts                           Versi Kebijakan Privasi yang disetujui pasien
src/lib/rate-limit.ts                        Pembatas laju jendela geser di memori
src/lib/whatsapp.ts                          + maskWhatsapp, siteBookingWhatsAppMessage, rescheduleRequestMessage

src/server/audit.ts                          + AuditActor, SYSTEM_ACTOR, SITE_PATIENT_ACTOR
src/server/booking-expiry.ts                 expireStaleSiteBookings (modul biasa)
src/server/availability.ts                   computeAvailability dipindah dari schedule.ts, + hold (modul biasa)
src/server/db-errors.ts                      isExclusionViolation, isUniqueViolation (modul biasa)
src/server/patient-store.ts                  insertPatient + nomor RM atomik (modul biasa)
src/server/request-guard.ts                  clientIp, guardRate
src/server/clinic-setting.ts                 "use server": getClinicSetting, updateClinicSetting
src/server/public-booking-data.ts            getBookingOptions untuk halaman /daftar (modul biasa)
src/server/public-booking.ts                 "use server": getPublicSlots, holdSlot, submitSiteBooking,
                                             findBookingStatus, cancelSiteBooking
src/server/intake.ts                         "use server": getMatchCandidates, matchPatient,
                                             createPatientFromIntake, getIntakeForStaff
src/server/appointment.ts                    bookingFee saat dibuat, panggil kedaluwarsa, penjaga pencocokan
src/server/patient.ts                        createPatient memakai patient-store
src/server/schedule.ts                       memakai availability.ts

src/components/kuis/quiz-screen.tsx          Kerangka layar: progres, kembali, judul, Lanjut
src/components/kuis/choice.tsx               SingleChoice, MultiChoice, Segmented
src/components/kuis/fields.tsx               TextAnswer, MedicationFields, YesNoWithText, DietResultFields,
                                             MeasureFields, FoodRecallFields
src/components/kuis/activity-list.tsx        Daftar catatan aktivitas H-1
src/components/kuis/quiz-step.tsx            Menampilkan satu langkah kuis sesuai StepId
src/components/pendaftaran/registration-flow.tsx   Orkestra /daftar: kuis → R → L → J → D → kwitansi
src/components/pendaftaran/summary-step.tsx
src/components/pendaftaran/service-step.tsx
src/components/pendaftaran/schedule-step.tsx
src/components/pendaftaran/identity-step.tsx
src/components/pendaftaran/receipt.tsx
src/components/pendaftaran/booking-status-lookup.tsx
src/components/admin/clinic-setting-form.tsx
src/components/admin/match-patient-dialog.tsx
src/components/admin/intake-view.tsx
src/components/admin/appointment-table.tsx   + Belum dicocokkan, Cocokkan pasien, Lihat isian
src/components/admin/app-sidebar.tsx         + Pengaturan

src/app/(public)/daftar/page.tsx
src/app/(public)/cek-booking/page.tsx
src/app/(public)/kebijakan-privasi/page.tsx  teks baru + versi
src/app/(admin)/admin/pengaturan/page.tsx
src/app/(admin)/admin/isian/[id]/page.tsx
src/app/(admin)/admin/booking/page.tsx       baris booking tanpa pasien

tests/fixtures/quiz-answers.ts               Contoh jawaban lengkap per jalur (dipakai unit & integrasi)
tests/unit/…, tests/integration/…, tests/e2e/public-registration.spec.ts
```

**Urutan task:** 1 skema → 2 kedaluwarsa & audit → 3 pengaturan biaya → 4 pembatas laju → 5–7 kuis murni → 8 kebijakan privasi → 9–11 server publik → 12–15 tampilan publik → 16–17 admin → 18 E2E → 19 dokumen → 20 tombol Daftar (setelah pemilik mencoba).

---
### Task 1: Skema isian pendaftaran, pengaturan klinik, dan booking tanpa pasien

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_pendaftaran_pasien/migration.sql` (dibuat Prisma, lalu ditambah SQL)
- Modify: `src/app/(admin)/admin/booking/page.tsx`
- Modify: `tests/e2e/prepare-db.mts`
- Test: `tests/integration/intake-schema.test.ts`

**Interfaces:**
- Produces:
  - model `Intake`, dengan enum `IntakeStatus` (`MENUNGGU_DIISI | TERISI | DIPERIKSA`), `IntakeKind` (`LENGKAP | PENDEK`), dan `IntakePurpose` (`SLIMMING | AESTHETIC | BELUM_YAKIN`);
  - model `ClinicSetting`, selalu satu baris dengan `id = 1`;
  - `Appointment.patientId: string | null`, `Appointment.patient: Patient | null`, `Appointment.bookingFee: number | null`, dan `Appointment.intake: Intake | null`.

- [ ] **Step 1: Tulis uji skema yang gagal**

`tests/integration/intake-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";

const SLUG = "skema-isian-uji";

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-6601" } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("skema pendaftaran pasien", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let hour = 0;

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Skema", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Skema",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-6601", name: "Pasien Skema", whatsapp: "6281200006601" },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // Setiap booking di jam berbeda agar exclusion constraint tidak ikut campur.
  function booking(input: {
    patientId: string | null;
    source: BookingSource;
    status?: AppointmentStatus;
  }) {
    hour += 1;
    return prisma.appointment.create({
      data: {
        code: `SKEMA-${hour}`,
        type: "KONSULTASI",
        startAt: new Date(Date.UTC(2031, 0, 6, hour)),
        endAt: new Date(Date.UTC(2031, 0, 6, hour, 30)),
        source: input.source,
        status: input.status ?? "MENUNGGU_KONFIRMASI",
        branchId,
        staffId,
        patientId: input.patientId,
      },
    });
  }

  it("menerima booking situs tanpa pasien selama menunggu konfirmasi", async () => {
    const created = await booking({ patientId: null, source: "SITUS" });
    expect(created.patientId).toBeNull();
  });

  it("menolak booking admin tanpa pasien", async () => {
    await expect(booking({ patientId: null, source: "WHATSAPP" })).rejects.toThrow();
  });

  it("menolak booking situs tanpa pasien yang langsung terkonfirmasi", async () => {
    await expect(
      booking({ patientId: null, source: "SITUS", status: "TERKONFIRMASI" }),
    ).rejects.toThrow();
  });

  it("menolak verifikasi booking situs yang belum dicocokkan", async () => {
    const created = await booking({ patientId: null, source: "SITUS" });
    await expect(
      prisma.appointment.update({ where: { id: created.id }, data: { status: "TERKONFIRMASI" } }),
    ).rejects.toThrow();
  });

  it("mengizinkan pembatalan dan kedaluwarsa booking situs yang belum dicocokkan", async () => {
    const first = await booking({ patientId: null, source: "SITUS" });
    const second = await booking({ patientId: null, source: "SITUS" });
    await prisma.appointment.update({ where: { id: first.id }, data: { status: "DIBATALKAN" } });
    await prisma.appointment.update({ where: { id: second.id }, data: { status: "KEDALUWARSA" } });
  });

  it("mengizinkan verifikasi setelah pasien dicocokkan", async () => {
    const created = await booking({ patientId: null, source: "SITUS" });
    const verified = await prisma.appointment.update({
      where: { id: created.id },
      data: { patientId, status: "TERKONFIRMASI" },
    });
    expect(verified.status).toBe("TERKONFIRMASI");
  });

  it("hanya menerima satu isian per booking", async () => {
    const created = await booking({ patientId: null, source: "SITUS" });
    const intake = { appointmentId: created.id, status: "TERISI" as const, kind: "LENGKAP" as const };
    await prisma.intake.create({ data: intake });
    await expect(prisma.intake.create({ data: intake })).rejects.toThrow();
  });

  it("menyimpan pengaturan klinik sebagai satu baris dengan biaya booking awal Rp 100.000", async () => {
    const setting = await prisma.clinicSetting.findUniqueOrThrow({ where: { id: 1 } });
    expect(setting.bookingFee).toBe(100000);
    await expect(prisma.clinicSetting.create({ data: { id: 2 } })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan gagal**

Run: `npm run test:integration -- tests/integration/intake-schema.test.ts`
Expected: FAIL. TypeScript atau Vitest melaporkan `prisma.intake` dan `prisma.clinicSetting` tidak ada.

- [ ] **Step 3: Ubah skema**

Di `prisma/schema.prisma`, pada `model Patient` tambahkan relasi balik di bawah `appointments Appointment[]`:

```prisma
  intakes      Intake[]
```

Pada `model Staff`, di bawah `slotHolds SlotHold[]`:

```prisma
  reviewedIntakes Intake[]
```

Pada `model Appointment`, ganti dua baris pasien:

```prisma
  patientId String
  patient   Patient  @relation(fields: [patientId], references: [id])
```

menjadi:

```prisma
  /// Kosong hanya untuk booking situs yang belum dicocokkan admin — dijaga
  /// CHECK appointment_patient_required di migrasi pendaftaran_pasien.
  patientId String?
  patient   Patient? @relation(fields: [patientId], references: [id])
```

lalu tambahkan di bawah `notes String?`:

```prisma
  /// Salinan biaya booking (rupiah) saat booking dibuat. Kosong untuk walk-in.
  /// Perubahan pengaturan tidak mengubah booking lama.
  bookingFee Int?
  intake     Intake?
```

Tambahkan di akhir berkas:

```prisma
enum IntakeStatus {
  MENUNGGU_DIISI
  TERISI
  DIPERIKSA
}

enum IntakeKind {
  LENGKAP
  PENDEK
}

enum IntakePurpose {
  SLIMMING
  AESTHETIC
  BELUM_YAKIN
}

/// Isian Pendaftaran: jawaban kuis & data diri pasien untuk satu booking.
/// Tidak pernah dihapus; setelah TERISI, jawabannya tidak pernah diubah —
/// yang boleh berubah hanya patientId (pencocokan) dan kolom pemeriksaan
/// dokter. Spec: docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md 5.1.
model Intake {
  id              String         @id @default(cuid())
  status          IntakeStatus
  kind            IntakeKind
  purpose         IntakePurpose?
  /// Pengakuan pasien di pertanyaan "Pernah berobat?" (booking situs saja).
  claimsReturning Boolean?
  quizVersion     Int?
  /// Jawaban kuis selain kolom bertipe di bawah. Bentuknya dikunci skema
  /// src/lib/kuis/v<quizVersion>/answers.ts.
  answers         Json?

  name       String?
  whatsapp   String?
  birthDate  DateTime? @db.Date
  gender     Gender?
  occupation String?
  address    String?

  /// Ukuran mandiri pasien — berbeda dari hasil Timbang BIA di klinik.
  selfWeightKg Decimal?  @db.Decimal(5, 1)
  selfHeightCm Decimal?  @db.Decimal(5, 1)
  /// Tanggal yang dimaksud "kemarin" pada pertanyaan aktivitas H-1.
  activityDate DateTime? @db.Date

  consentAt      DateTime?
  consentVersion String?
  submittedAt    DateTime?
  /// Token hold yang dipakai saat Kirim. Kirim ganda dengan token yang sama
  /// mengembalikan booking yang sudah dibuat, bukan booking kedua.
  submissionKey  String?   @unique

  reviewedAt        DateTime?
  reviewedByStaffId String?
  reviewedBy        Staff?    @relation(fields: [reviewedByStaffId], references: [id], onDelete: Restrict)

  /// Link WA pribadi (Plan 3b-2): hanya hash SHA-256 token yang disimpan.
  linkTokenHash String?   @unique
  linkExpiresAt DateTime?

  appointmentId String      @unique
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Restrict)
  patientId     String?
  patient       Patient?    @relation(fields: [patientId], references: [id], onDelete: Restrict)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([patientId])
  @@index([status])
}

/// Pengaturan klinik yang diubah Super Admin tanpa developer. Selalu tepat
/// satu baris (id = 1) — dijaga CHECK clinic_setting_single_row.
model ClinicSetting {
  id                Int     @id @default(1)
  /// Biaya booking dalam rupiah penuh (spec K15).
  bookingFee        Int     @default(100000)
  bankName          String?
  bankAccountNumber String?
  bankAccountHolder String?

  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 4: Buat migrasi, tambahkan SQL CHECK dan baris pengaturan**

Run: `npx prisma migrate dev --name pendaftaran_pasien --create-only`

Buka berkas `prisma/migrations/<timestamp>_pendaftaran_pasien/migration.sql` yang baru dibuat, lalu tambahkan di **akhir** berkas:

```sql
-- Booking tanpa pasien hanya boleh berasal dari situs dan belum pernah
-- terkonfirmasi/hadir. Admin wajib mencocokkan pasien lebih dulu (spec 5.3).
ALTER TABLE "Appointment" ADD CONSTRAINT appointment_patient_required CHECK (
  "patientId" IS NOT NULL
  OR ("source" = 'SITUS' AND "status" IN ('MENUNGGU_KONFIRMASI', 'DIBATALKAN', 'KEDALUWARSA'))
);

-- Pengaturan klinik selalu tepat satu baris, dibuat di sini agar produksi
-- langsung punya nilainya tanpa menjalankan seed.
ALTER TABLE "ClinicSetting" ADD CONSTRAINT clinic_setting_single_row CHECK ("id" = 1);
INSERT INTO "ClinicSetting" ("id", "bookingFee", "updatedAt") VALUES (1, 100000, CURRENT_TIMESTAMP);
```

Run: `npx prisma migrate dev && npm run db:migrate:test`
Expected: migrasi terterapkan ke `sundy_dev` dan `sundy_test`, lalu Prisma Client dibuat ulang.

- [ ] **Step 5: Sesuaikan kode yang menganggap pasien selalu ada**

Run: `npx tsc --noEmit`
Expected: galat hanya di `src/app/(admin)/admin/booking/page.tsx` (`a.patient` mungkin null).

Di `src/app/(admin)/admin/booking/page.tsx`, ganti isi `appointments.map((a) => { ... })` sampai `return { ... };` dengan:

```tsx
  const rows: BookingRow[] = appointments.map((a) => {
    const serviceName = a.service?.name ?? (a.type === "KONSULTASI" ? "Konsultasi" : "Treatment");
    const start = timeLabel(a.startAt);
    // Booking situs boleh belum punya pasien sampai admin mencocokkannya;
    // CHECK di basis data menjamin booking terkonfirmasi selalu punya pasien.
    const patient = a.patient;
    const confirmationText =
      a.status === "TERKONFIRMASI" && patient
        ? patientBookingConfirmationMessage({
            patientName: patient.name,
            code: a.code,
            serviceName,
            staffName: a.staff.name,
            branchName: a.branch.name,
            dateLabel,
            timeLabel: start,
          })
        : null;

    return {
      id: a.id,
      code: a.code,
      status: a.status,
      timeLabel: `${start}–${timeLabel(a.endAt)}`,
      patientName: patient?.name ?? "Belum dicocokkan",
      patientRecordNumber: patient?.medicalRecordNumber ?? "—",
      serviceName,
      staffName: a.staff.name,
      branchName: a.branch.name,
      sourceLabel: SOURCE_LABEL[a.source] ?? a.source,
      notes: a.notes,
      confirmation:
        confirmationText && patient
          ? {
              text: confirmationText,
              link: buildWhatsAppLinkTo(patient.whatsapp, confirmationText),
            }
          : null,
    };
  });
```

Di `tests/e2e/prepare-db.mts`, tambahkan baris ini **sebelum** `await prisma.appointment.deleteMany();`. Isian mereferensi booking dengan `onDelete: Restrict`, jadi isian harus dihapus lebih dulu:

```ts
await prisma.intake.deleteMany();
```

Run: `npx tsc --noEmit`
Expected: tanpa galat.

- [ ] **Step 6: Jalankan uji dan pastikan lulus**

Run: `npm run test:integration -- tests/integration/intake-schema.test.ts`
Expected: PASS (8 uji).

Run: `npm run test:integration`
Expected: semua lulus. Uji lama tidak tersentuh CHECK, karena semuanya membuat booking dengan pasien.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/app/\(admin\)/admin/booking/page.tsx tests/e2e/prepare-db.mts tests/integration/intake-schema.test.ts
git commit -m "feat: add Intake and ClinicSetting, allow unmatched site bookings

Site bookings may exist without a patient until an admin matches them; a
CHECK constraint keeps such bookings from ever being confirmed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pelaku audit non-staf dan kedaluwarsa booking situs

**Files:**
- Modify: `src/server/audit.ts`
- Create: `src/server/booking-expiry.ts`
- Modify: `src/server/appointment.ts` (`createAppointment`, `listAppointments`)
- Modify: `src/server/schedule.ts` (`computeAvailability`)
- Test: `tests/integration/booking-expiry.test.ts`

**Interfaces:**
- Consumes: skema Task 1.
- Produces:
  - `type AuditActor = { staffId: string; name: string; role: string }`;
  - `SYSTEM_ACTOR: AuditActor`;
  - `SITE_PATIENT_ACTOR: AuditActor`;
  - `recordAudit({ actor: AuditActor, ... })`;
  - `expireStaleSiteBookings(now?: Date): Promise<number>`;
  - `SITE_BOOKING_CONFIRMATION_WINDOW_MS = 86_400_000`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/integration/booking-expiry.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { expireStaleSiteBookings } from "@/server/booking-expiry";
import { listAppointments } from "@/server/appointment";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "kedaluwarsa-uji";
const HOUR = 60 * 60 * 1000;

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.auditLog.deleteMany({ where: { action: "appointment.expire" } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-6602" } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("kedaluwarsa booking situs", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Kedaluwarsa", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Kedaluwarsa",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-6602", name: "Pasien Kedaluwarsa", whatsapp: "6281200006602" },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  function booking(input: {
    source: BookingSource;
    status: AppointmentStatus;
    ageHours: number;
    withPatient: boolean;
  }) {
    slot += 1;
    return prisma.appointment.create({
      data: {
        code: `KDL-${slot}`,
        type: "KONSULTASI",
        startAt: new Date(Date.UTC(2031, 1, 3, slot)),
        endAt: new Date(Date.UTC(2031, 1, 3, slot, 30)),
        source: input.source,
        status: input.status,
        branchId,
        staffId,
        patientId: input.withPatient ? patientId : null,
        createdAt: new Date(Date.now() - input.ageHours * HOUR),
      },
    });
  }

  it("menandai booking situs yang tidak dikonfirmasi 24 jam sebagai kedaluwarsa", async () => {
    const stale = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", ageHours: 25, withPatient: false });

    expect(await expireStaleSiteBookings()).toBe(1);

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: stale.id } });
    expect(after.status).toBe("KEDALUWARSA");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: stale.id } });
    expect(audit).toMatchObject({ action: "appointment.expire", actorName: "Sistem", actorRole: "SISTEM" });
  });

  it("membiarkan booking situs yang belum 24 jam", async () => {
    const fresh = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", ageHours: 23, withPatient: false });

    expect(await expireStaleSiteBookings()).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe(
      "MENUNGGU_KONFIRMASI",
    );
  });

  it("tidak pernah menyentuh booking yang dicatat admin (K13)", async () => {
    const adminBooking = await booking({ source: "WHATSAPP", status: "MENUNGGU_KONFIRMASI", ageHours: 72, withPatient: true });

    await expireStaleSiteBookings();

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: adminBooking.id } })).status).toBe(
      "MENUNGGU_KONFIRMASI",
    );
  });

  it("tidak menyentuh booking situs yang sudah diverifikasi", async () => {
    const verified = await booking({ source: "SITUS", status: "TERKONFIRMASI", ageHours: 72, withPatient: true });

    await expireStaleSiteBookings();

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: verified.id } })).status).toBe(
      "TERKONFIRMASI",
    );
  });

  it("dijalankan saat admin membuka daftar booking", async () => {
    const stale = await booking({ source: "SITUS", status: "MENUNGGU_KONFIRMASI", ageHours: 30, withPatient: false });

    await listAppointments({ date: "2031-02-03" });

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("KEDALUWARSA");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan gagal**

Run: `npm run test:integration -- tests/integration/booking-expiry.test.ts`
Expected: FAIL, "Cannot find module '@/server/booking-expiry'".

- [ ] **Step 3: Perluas pelaku audit**

Di `src/server/audit.ts`, ganti blok `type AuditInput = { actor: CurrentStaff; ... }` dengan:

```ts
/**
 * Pelaku yang tercatat di jejak audit: staf yang sedang login (CurrentStaff
 * memenuhi bentuk ini), atau salah satu pelaku tetap di bawah. Kolom
 * actorStaffId tidak berelasi, jadi penanda tetap aman disimpan di sana.
 */
export type AuditActor = Pick<CurrentStaff, "staffId" | "name"> & { role: string };

/** Perubahan yang dilakukan sistem sendiri, mis. booking situs yang kedaluwarsa. */
export const SYSTEM_ACTOR: AuditActor = { staffId: "sistem", name: "Sistem", role: "SISTEM" };

/** Pasien yang memesan atau membatalkan lewat situs publik. */
export const SITE_PATIENT_ACTOR: AuditActor = {
  staffId: "pasien",
  name: "Pasien (situs)",
  role: "PASIEN",
};

type AuditInput = {
  actor: AuditActor;
  action: string;
  entity: string;
  entityId: string;
  summary?: string;
};
```

- [ ] **Step 4: Buat modul kedaluwarsa**

`src/server/booking-expiry.ts`:

```ts
import { prisma } from "@/lib/db";
import { recordAudit, SYSTEM_ACTOR } from "@/server/audit";

/** Booking situs yang belum diverifikasi selama ini menjadi KEDALUWARSA (PRD bagian 8, spec K13). */
export const SITE_BOOKING_CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Menandai booking situs yang melewati batas konfirmasi sebagai KEDALUWARSA,
 * sehingga slotnya lepas dari exclusion constraint.
 *
 * Tidak ada cron. Fungsi ini dipanggil tepat sebelum slot dihitung, sebelum
 * booking atau hold dibuat, dan saat daftar booking dibuka — persis saat slot
 * itu dibutuhkan orang lain. Booking yang dicatat admin tidak pernah disentuh.
 * Satu UPDATE bersyarat: booking yang baru saja diverifikasi admin tidak ikut
 * berubah, dan hanya baris yang benar-benar berubah yang dicatat di audit.
 *
 * Modul biasa (bukan "use server") agar tidak bisa dipanggil dari browser.
 */
export async function expireStaleSiteBookings(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SITE_BOOKING_CONFIRMATION_WINDOW_MS);

  const expired = await prisma.appointment.updateManyAndReturn({
    where: { source: "SITUS", status: "MENUNGGU_KONFIRMASI", createdAt: { lt: cutoff } },
    data: { status: "KEDALUWARSA" },
    select: { id: true, code: true },
  });

  for (const appointment of expired) {
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: "appointment.expire",
      entity: "Appointment",
      entityId: appointment.id,
      summary: `${appointment.code} — tidak dikonfirmasi dalam 24 jam`,
    });
  }

  return expired.length;
}
```

- [ ] **Step 5: Panggil kedaluwarsa di tempat slot dibutuhkan**

Di `src/server/appointment.ts`, tambahkan import:

```ts
import { expireStaleSiteBookings } from "@/server/booking-expiry";
```

Di `createAppointment`, tepat setelah `const actor = await requireCapability("booking:manage");`:

```ts
    // Booking situs basi masih memblokir slot di exclusion constraint.
    await expireStaleSiteBookings();
```

Di `listAppointments`, tepat setelah `await requireCapability("booking:manage");`:

```ts
  await expireStaleSiteBookings();
```

Di `src/server/schedule.ts`, tambahkan import yang sama, lalu jadikan baris pertama isi `computeAvailability`:

```ts
  await expireStaleSiteBookings();
```

- [ ] **Step 6: Jalankan uji dan pastikan lulus**

Run: `npm run test:integration -- tests/integration/booking-expiry.test.ts`
Expected: PASS (5 uji).

Run: `npx tsc --noEmit && npm run test:integration`
Expected: tanpa galat tipe, dan semua uji lulus.

- [ ] **Step 7: Commit**

```bash
git add src/server/audit.ts src/server/booking-expiry.ts src/server/appointment.ts src/server/schedule.ts tests/integration/booking-expiry.test.ts
git commit -m "feat: expire unconfirmed site bookings after 24 hours

Checked right before a slot is needed instead of on a timer, and logged
under a fixed Sistem actor. Admin-recorded bookings are never expired.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pengaturan biaya booking & rekening

**Files:**
- Create: `src/lib/payment.ts`
- Create: `src/server/clinic-setting.ts`
- Create: `src/components/admin/clinic-setting-form.tsx`
- Create: `src/app/(admin)/admin/pengaturan/page.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`
- Modify: `src/server/appointment.ts` (`createAppointment`)
- Test: `tests/unit/payment.test.ts`, `tests/integration/clinic-setting.test.ts`

**Interfaces:**
- Consumes: `ClinicSetting` (Task 1), `recordAudit` (Task 2).
- Produces:
  - `type BankAccount = { bankName: string | null; bankAccountNumber: string | null; bankAccountHolder: string | null }`;
  - `formatBankAccount(account: BankAccount): string | null`;
  - `bookingFeeFor(source: BookingSourceValue, fee: number): number | null`;
  - `type ClinicSettingView = BankAccount & { bookingFee: number }`;
  - `getClinicSetting(): Promise<ClinicSettingView>`;
  - `updateClinicSetting(input: { bookingFee: number; bankName: string; bankAccountNumber: string; bankAccountHolder: string }): Promise<ActionResult<ClinicSettingView>>`.

- [ ] **Step 1: Tulis uji unit yang gagal**

`tests/unit/payment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bookingFeeFor, formatBankAccount } from "@/lib/payment";

describe("formatBankAccount", () => {
  it("menulis bank, nomor, dan pemilik rekening", () => {
    expect(
      formatBankAccount({ bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" }),
    ).toBe("BCA 1234567890 a.n. SunDY Clinic");
  });

  it("mengembalikan null bila salah satu bagian belum diisi", () => {
    expect(formatBankAccount({ bankName: "BCA", bankAccountNumber: null, bankAccountHolder: "SunDY" })).toBeNull();
  });
});

describe("bookingFeeFor", () => {
  it("mengenakan biaya booking untuk situs, WhatsApp, dan telepon (K15, K18)", () => {
    expect(bookingFeeFor("SITUS", 100000)).toBe(100000);
    expect(bookingFeeFor("WHATSAPP", 100000)).toBe(100000);
    expect(bookingFeeFor("TELEPON", 100000)).toBe(100000);
  });

  it("tidak mengenakan biaya booking untuk walk-in", () => {
    expect(bookingFeeFor("WALK_IN", 100000)).toBeNull();
  });
});
```

Run: `npx vitest run tests/unit/payment.test.ts`
Expected: FAIL, "Cannot find module '@/lib/payment'".

- [ ] **Step 2: Implementasi `src/lib/payment.ts`**

```ts
export type BankAccount = {
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
};

export type BookingSourceValue = "SITUS" | "WHATSAPP" | "TELEPON" | "WALK_IN";

/** "BCA 1234567890 a.n. SunDY Clinic", atau null bila rekening belum lengkap di pengaturan. */
export function formatBankAccount(account: BankAccount): string | null {
  if (!account.bankName || !account.bankAccountNumber || !account.bankAccountHolder) return null;
  return `${account.bankName} ${account.bankAccountNumber} a.n. ${account.bankAccountHolder}`;
}

/** Biaya booking dikenakan pada semua sumber kecuali walk-in (spec K15, K18). */
export function bookingFeeFor(source: BookingSourceValue, fee: number): number | null {
  return source === "WALK_IN" ? null : fee;
}
```

Run: `npx vitest run tests/unit/payment.test.ts`
Expected: PASS (4 uji).

- [ ] **Step 3: Tulis uji integrasi yang gagal**

`tests/integration/clinic-setting.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getClinicSetting, updateClinicSetting } from "@/server/clinic-setting";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Pemilik Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const DEFAULTS = { bookingFee: 100000, bankName: null, bankAccountNumber: null, bankAccountHolder: null };

describe("pengaturan klinik", () => {
  beforeEach(async () => {
    await prisma.clinicSetting.update({ where: { id: 1 }, data: DEFAULTS });
    await prisma.auditLog.deleteMany({ where: { action: "clinic-setting.update" } });
  });

  afterAll(async () => {
    await prisma.clinicSetting.update({ where: { id: 1 }, data: DEFAULTS });
    await prisma.auditLog.deleteMany({ where: { action: "clinic-setting.update" } });
    await prisma.$disconnect();
  });

  it("membaca biaya booking awal", async () => {
    expect(await getClinicSetting()).toEqual(DEFAULTS);
  });

  it("menyimpan biaya dan rekening, lalu mencatatnya di audit", async () => {
    const saved = await unwrap(
      updateClinicSetting({
        bookingFee: 150000,
        bankName: " BCA ",
        bankAccountNumber: "1234567890",
        bankAccountHolder: "SunDY Clinic",
      }),
    );

    expect(saved).toEqual({
      bookingFee: 150000,
      bankName: "BCA",
      bankAccountNumber: "1234567890",
      bankAccountHolder: "SunDY Clinic",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "clinic-setting.update" } });
    expect(audit.actorName).toBe("Pemilik Uji");
  });

  it("mengosongkan rekening bila kolomnya dikosongkan", async () => {
    await unwrap(updateClinicSetting({ bookingFee: 100000, bankName: "BCA", bankAccountNumber: "1", bankAccountHolder: "X" }));
    const saved = await unwrap(
      updateClinicSetting({ bookingFee: 100000, bankName: "", bankAccountNumber: " ", bankAccountHolder: "" }),
    );
    expect(saved).toEqual(DEFAULTS);
  });

  it("menolak biaya yang bukan rupiah bulat", async () => {
    for (const bookingFee of [-1, 1.5, Number.NaN, 20_000_000]) {
      const result = await updateClinicSetting({ bookingFee, bankName: "", bankAccountNumber: "", bankAccountHolder: "" });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("Biaya booking") });
    }
  });
});
```

Tambahkan juga uji salinan biaya di `createAppointment`, di berkas baru `tests/integration/appointment-booking-fee.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createAppointment } from "@/server/appointment";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "biaya-booking-uji";

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-6603" } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("biaya booking pada booking admin", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;

  beforeEach(async () => {
    await cleanup();
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 100000 } });
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Biaya", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Biaya",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-6603", name: "Pasien Biaya", whatsapp: "6281200006603" },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  function create(source: "WHATSAPP" | "TELEPON" | "WALK_IN", hour: number) {
    return unwrap(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date(Date.UTC(2031, 2, 4, hour)),
        endAt: new Date(Date.UTC(2031, 2, 4, hour, 30)),
        source,
      }),
    );
  }

  it("menyalin biaya booking saat booking lewat WhatsApp atau telepon", async () => {
    expect((await create("WHATSAPP", 3)).bookingFee).toBe(100000);
    expect((await create("TELEPON", 4)).bookingFee).toBe(100000);
  });

  it("tidak mengenakan biaya booking pada walk-in", async () => {
    expect((await create("WALK_IN", 5)).bookingFee).toBeNull();
  });

  it("tidak mengubah booking lama saat biaya diubah", async () => {
    const before = await create("WHATSAPP", 6);
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 150000 } });
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 100000 } });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: before.id } })).bookingFee).toBe(100000);
  });
});
```

Run: `npm run test:integration -- tests/integration/clinic-setting.test.ts tests/integration/appointment-booking-fee.test.ts`
Expected: FAIL, "Cannot find module '@/server/clinic-setting'".

- [ ] **Step 4: Implementasi server pengaturan**

`src/server/clinic-setting.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import type { BankAccount } from "@/lib/payment";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export type ClinicSettingView = BankAccount & { bookingFee: number };

const SETTING_SELECT = {
  bookingFee: true,
  bankName: true,
  bankAccountNumber: true,
  bankAccountHolder: true,
} as const;

const MAX_BOOKING_FEE = 10_000_000;

/** Tidak rahasia: biaya dan rekening memang ditampilkan ke pasien setelah booking. */
export async function getClinicSetting(): Promise<ClinicSettingView> {
  return prisma.clinicSetting.findUniqueOrThrow({ where: { id: 1 }, select: SETTING_SELECT });
}

function optionalText(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 100) {
    throw new UserFacingError(`${label} terlalu panjang (maksimal 100 karakter).`);
  }
  return trimmed || null;
}

export async function updateClinicSetting(input: {
  bookingFee: number;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}): Promise<ActionResult<ClinicSettingView>> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");

    if (
      !Number.isInteger(input.bookingFee) ||
      input.bookingFee < 0 ||
      input.bookingFee > MAX_BOOKING_FEE
    ) {
      throw new UserFacingError(
        "Biaya booking harus berupa angka rupiah bulat antara 0 dan 10.000.000.",
      );
    }

    const data = {
      bookingFee: input.bookingFee,
      bankName: optionalText(input.bankName, "Nama bank"),
      bankAccountNumber: optionalText(input.bankAccountNumber, "Nomor rekening"),
      bankAccountHolder: optionalText(input.bankAccountHolder, "Nama pemilik rekening"),
    };

    const updated = await prisma.clinicSetting.update({
      where: { id: 1 },
      data,
      select: SETTING_SELECT,
    });

    await recordAudit({
      actor,
      action: "clinic-setting.update",
      entity: "ClinicSetting",
      entityId: "1",
      summary: `biaya booking ${data.bookingFee}; rekening ${data.bankName ?? "-"} ${data.bankAccountNumber ?? "-"}`,
    });

    safeRevalidatePath("/admin/pengaturan");
    return updated;
  });
}
```

Di `src/server/appointment.ts`, tambahkan import:

```ts
import { bookingFeeFor } from "@/lib/payment";
import { getClinicSetting } from "@/server/clinic-setting";
```

Di `createAppointment`, tepat setelah baris `await expireStaleSiteBookings();` (Task 2):

```ts
    const setting = await getClinicSetting();
```

Pada objek `data` di `prisma.appointment.create(...)`, tambahkan setelah `notes: input.notes,`:

```ts
          bookingFee: bookingFeeFor(input.source, setting.bookingFee),
```

Run: `npm run test:integration -- tests/integration/clinic-setting.test.ts tests/integration/appointment-booking-fee.test.ts`
Expected: PASS (7 uji).

- [ ] **Step 5: Halaman pengaturan dan menu**

`src/components/admin/clinic-setting-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClinicSetting, type ClinicSettingView } from "@/server/clinic-setting";

export function ClinicSettingForm({ setting }: { setting: ClinicSettingView }) {
  const [bookingFee, setBookingFee] = useState(String(setting.bookingFee));
  const [bankName, setBankName] = useState(setting.bankName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(setting.bankAccountNumber ?? "");
  const [bankAccountHolder, setBankAccountHolder] = useState(setting.bankAccountHolder ?? "");
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await updateClinicSetting({
          bookingFee: Number(bookingFee),
          bankName,
          bankAccountNumber,
          bankAccountHolder,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Pengaturan tersimpan.");
      } catch {
        toast.error("Pengaturan gagal disimpan. Coba lagi.");
      }
    });
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-1">
        <Label htmlFor="booking-fee">Biaya booking (rupiah)</Label>
        <Input
          id="booking-fee"
          inputMode="numeric"
          value={bookingFee}
          onChange={(e) => setBookingFee(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Berlaku untuk booking baru dari situs, WhatsApp, dan telepon. Walk-in tidak dikenai biaya.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="bank-name">Nama bank</Label>
        <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bank-number">Nomor rekening</Label>
        <Input
          id="bank-number"
          inputMode="numeric"
          value={bankAccountNumber}
          onChange={(e) => setBankAccountNumber(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bank-holder">Atas nama</Label>
        <Input
          id="bank-holder"
          value={bankAccountHolder}
          onChange={(e) => setBankAccountHolder(e.target.value)}
        />
      </div>
      <Button onClick={handleSave} disabled={pending}>
        Simpan Pengaturan
      </Button>
    </div>
  );
}
```

`src/app/(admin)/admin/pengaturan/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicSettingForm } from "@/components/admin/clinic-setting-form";
import { getClinicSetting } from "@/server/clinic-setting";
import { requireCapability } from "@/server/session";

export default async function ClinicSettingPage() {
  await requireCapability("content:manage");
  const setting = await getClinicSetting();

  return (
    <>
      <AdminHeader title="Pengaturan" />
      <div className="space-y-6 p-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Biaya booking dan rekening tampil ke pasien setelah mereka mendaftar di situs. Biaya
          booking terpisah dari biaya layanan, tidak dikembalikan, dan tetap berlaku bila pasien
          pindah jadwal paling lambat 2 jam sebelum jadwal. Setiap perubahan tercatat di jejak audit.
        </p>
        <ClinicSettingForm setting={setting} />
      </div>
    </>
  );
}
```

Di `src/components/admin/app-sidebar.tsx`, tambahkan `Settings` ke import dari `lucide-react`, lalu tambahkan item ini di akhir kelompok "Kelola" (setelah "Jejak Audit"):

```ts
      { title: "Pengaturan", url: "/admin/pengaturan", icon: Settings, needs: "content:manage" },
```

Run: `npx tsc --noEmit && npm run lint`
Expected: tanpa galat.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payment.ts src/server/clinic-setting.ts src/server/appointment.ts src/components/admin/clinic-setting-form.tsx src/components/admin/app-sidebar.tsx "src/app/(admin)/admin/pengaturan" tests/unit/payment.test.ts tests/integration/clinic-setting.test.ts tests/integration/appointment-booking-fee.test.ts
git commit -m "feat: booking fee and bank account settings for the owner

Every booking except walk-ins keeps a copy of the fee in force when it
was made, so later changes never rewrite old bookings.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pembatas laju dan IP pengunjung

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/server/request-guard.ts`
- Modify: `playwright.config.ts` (matikan pembatas di server uji)
- Test: `tests/unit/rate-limit.test.ts`, `tests/unit/request-guard.test.ts`

**Interfaces:**
- Produces:
  - `createRateLimiter({ limit, windowMs }): RateLimiter`, dengan `RateLimiter.take(key: string, now?: number): boolean`;
  - `clientIp(): Promise<string>`;
  - `guardRate(limiter: RateLimiter): Promise<void>`, yang melempar `UserFacingError` bila batas terlampaui.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("mengizinkan sampai batas lalu menolak", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect([1, 2, 3, 4].map(() => limiter.take("1.2.3.4", 1_000))).toEqual([true, true, true, false]);
  });

  it("menghitung setiap kunci secara terpisah", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("b", 0)).toBe(true);
    expect(limiter.take("a", 0)).toBe(false);
  });

  it("mengizinkan lagi setelah jendela waktu lewat", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 59_999)).toBe(false);
    expect(limiter.take("a", 60_000)).toBe(true);
  });
});
```

`tests/unit/request-guard.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const headerValues = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues.get(name) ?? null }),
}));

import { createRateLimiter } from "@/lib/rate-limit";
import { clientIp, guardRate } from "@/server/request-guard";

afterEach(() => {
  headerValues.clear();
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("memakai X-Real-IP yang diisi Nginx", async () => {
    headerValues.set("x-real-ip", "36.85.1.2");
    headerValues.set("x-forwarded-for", "9.9.9.9");
    expect(await clientIp()).toBe("36.85.1.2");
  });

  it("jatuh ke alamat pertama X-Forwarded-For", async () => {
    headerValues.set("x-forwarded-for", "36.85.1.2, 10.0.0.1");
    expect(await clientIp()).toBe("36.85.1.2");
  });
});

describe("guardRate", () => {
  it("melempar pesan untuk pengguna setelah batas terlampaui", async () => {
    headerValues.set("x-real-ip", "36.85.1.2");
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    await guardRate(limiter);
    await expect(guardRate(limiter)).rejects.toThrow("Terlalu banyak percobaan");
  });

  it("dapat dimatikan untuk server uji ujung-ke-ujung", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    const limiter = createRateLimiter({ limit: 0, windowMs: 60_000 });
    await expect(guardRate(limiter)).resolves.toBeUndefined();
  });
});
```

Run: `npx vitest run tests/unit/rate-limit.test.ts tests/unit/request-guard.test.ts`
Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 2: Implementasi**

`src/lib/rate-limit.ts`:

```ts
export type RateLimiter = { take(key: string, now?: number): boolean };

/**
 * Pembatas laju jendela geser di memori proses.
 *
 * Cukup karena aplikasi berjalan sebagai satu proses PM2
 * (scripts/server/ecosystem.config.cjs). Bila kelak dijalankan sebagai
 * cluster, tiap proses punya hitungannya sendiri dan penghitung harus pindah
 * ke basis data. Hitungan hilang saat rilis/restart — dapat diterima karena
 * jendelanya pendek (≤ 10 menit).
 */
export function createRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  // Membuang kunci yang semua catatannya sudah lewat, agar peta tidak tumbuh
  // tanpa batas dari IP yang hanya mampir sekali.
  function sweep(now: number) {
    if (now - lastSweep < options.windowMs) return;
    lastSweep = now;
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= options.windowMs)) hits.delete(key);
    }
  }

  return {
    take(key, now = Date.now()) {
      sweep(now);
      const recent = (hits.get(key) ?? []).filter((time) => now - time < options.windowMs);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}
```

`src/server/request-guard.ts`:

```ts
import { headers } from "next/headers";
import { UserFacingError } from "@/lib/action-result";
import type { RateLimiter } from "@/lib/rate-limit";

/**
 * IP asli pengunjung. Di produksi Nginx menimpa X-Real-IP dengan alamat dari
 * CF-Connecting-IP (scripts/server/nginx/cloudflare-realip.sh), dan aplikasi
 * hanya menerima koneksi dari Nginx (127.0.0.1:3000) — jadi pengunjung tidak
 * bisa memalsukannya.
 */
export async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-real-ip")?.trim() ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "tanpa-ip"
  );
}

/**
 * Menolak permintaan publik yang melewati batas laju (PRD bagian 10).
 * RATE_LIMIT_DISABLED=1 hanya dipasang di server uji Playwright, yang semua
 * permintaannya datang dari satu alamat.
 */
export async function guardRate(limiter: RateLimiter): Promise<void> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return;
  if (!limiter.take(await clientIp())) {
    throw new UserFacingError("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.");
  }
}
```

Di `playwright.config.ts`, pada `webServer.env`, tambahkan setelah `NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,`:

```ts
      // Semua permintaan uji datang dari satu alamat; tanpa ini pembatas laju
      // situs publik menolak uji kedua dan seterusnya.
      RATE_LIMIT_DISABLED: "1",
```

Run: `npx vitest run tests/unit/rate-limit.test.ts tests/unit/request-guard.test.ts`
Expected: PASS (7 uji).

- [ ] **Step 3: Commit**

```bash
git add src/lib/rate-limit.ts src/server/request-guard.ts playwright.config.ts tests/unit/rate-limit.test.ts tests/unit/request-guard.test.ts
git commit -m "feat: in-memory rate limiter keyed by the visitor's real IP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Kuis v1 — pilihan, bentuk jawaban, dan data diri

**Prasyarat:** kata-kata kuis v1 sudah ditinjau dr. Diane (lihat header plan). Pakai kata-kata hasil tinjauan di `options.ts`. Kuncinya (`TURUN_BERAT`, `DARAH_TINGGI`, …) tetap sama.

**Files:**
- Modify: `package.json`, `package-lock.json` (`zod` menjadi dependensi langsung)
- Create: `src/lib/kuis/v1/options.ts`
- Create: `src/lib/kuis/v1/answers.ts`
- Create: `src/lib/kuis/v1/identity.ts`
- Create: `tests/fixtures/quiz-answers.ts`
- Test: `tests/unit/kuis/answers.test.ts`, `tests/unit/kuis/identity.test.ts`

**Interfaces:**
- Produces:
  - `QUIZ_VERSION = 1`, beserta objek label `PATIENT_TYPES`, `PURPOSES`, `PURPOSE_HINTS`, `SLIMMING_GOALS`, `WEIGHT_TARGETS`, `BODY_AREAS`, `DIET_HISTORY`, `DIET_PROGRAMS`, `DIET_OUTCOMES`, `WEIGHT_AFTER_DIET`, `MEALS`, `MAIN_MEALS`, `SKIN_COMPLAINTS`, `SKIN_TYPES`, `COMPLAINT_DURATIONS`, `PRIOR_TREATMENTS`, `CONDITIONS`, `PREGNANCY`, `HEALTH_CHANGE`, `ACTIVITY_KINDS`, `ACTIVITY_FIRST_HOUR`, `ACTIVITY_LAST_HOUR`, `EXCLUSIVE`, `TEXT_LIMITS`, dan `MEASURE_LIMITS`;
  - `quizAnswersSchema`, `activityEntrySchema`;
  - tipe `QuizAnswers`, `ActivityEntry`, `SlimmingAnswers`, `AestheticAnswers`, `HealthAnswers`, `ReturningAnswers`;
  - `validateIdentity(raw: unknown, patientType: "BARU" | "LAMA", now?: Date): IdentityValidation`, dengan `type Identity = { name: string; whatsapp: string; birthDate: string; gender?: "L" | "P"; occupation?: string; address?: string }`;
  - fixture `slimmingNewPatient`, `aestheticNewPatient`, `unsureNewPatient`, `slimmingReturningPatient`, `aestheticReturningPatient`, `newPatientIdentity`, dan `returningPatientIdentity`.

- [ ] **Step 1: Pasang zod sebagai dependensi langsung**

Run: `npm install zod@^4.6.5`
Expected: `"zod": "^4.6.5"` muncul di `dependencies` pada `package.json`.

- [ ] **Step 2: Tulis pilihan kuis**

`src/lib/kuis/v1/options.ts`:

```ts
/**
 * Kuis pendaftaran versi 1 — satu-satunya tempat kata-kata pilihan kuis.
 *
 * Kunci (mis. "TURUN_BERAT") yang disimpan di basis data; label hanya untuk
 * tampilan. Mengubah arti pilihan atau menambah pertanyaan berarti membuat
 * versi baru (src/lib/kuis/v2/…) agar isian lama tetap tampil dengan
 * pertanyaan aslinya (spec pendaftaran pasien 5.2).
 */
export const QUIZ_VERSION = 1;

export const PATIENT_TYPES = { BARU: "Belum, ini pertama kali", LAMA: "Sudah pernah" } as const;

export const PURPOSES = {
  SLIMMING: "Slimming",
  AESTHETIC: "Aesthetic",
  BELUM_YAKIN: "Belum yakin, tanya dokter saja",
} as const;

export const PURPOSE_HINTS = {
  SLIMMING: "Berat badan & bentuk tubuh",
  AESTHETIC: "Kulit & wajah",
  BELUM_YAKIN: "Ceritakan keluhan Anda, dokter yang menentukan",
} as const;

export const SLIMMING_GOALS = {
  TURUN_BERAT: "Menurunkan berat badan",
  KECILKAN_LINGKAR: "Mengecilkan lingkar tubuh",
  PASCA_MELAHIRKAN: "Kembali ideal setelah melahirkan",
  HIDUP_SEHAT: "Hidup lebih sehat & bugar",
} as const;

export const WEIGHT_TARGETS = {
  KG_1_5: "1–5 kg",
  KG_5_10: "5–10 kg",
  KG_10_20: "10–20 kg",
  KG_20_LEBIH: "Lebih dari 20 kg",
  BELUM_TAHU: "Belum tahu",
} as const;

export const BODY_AREAS = {
  PERUT: "Perut",
  LENGAN: "Lengan",
  PAHA: "Paha",
  PIPI_DAGU: "Pipi & dagu",
  TIDAK_ADA: "Tidak ada area khusus",
} as const;

export const DIET_HISTORY = {
  BELUM: "Belum pernah",
  PERNAH: "Pernah",
  SEDANG: "Sedang menjalani sekarang",
} as const;

export const DIET_PROGRAMS = {
  KURANGI_KARBO: "Kurangi nasi / karbo",
  KETO: "Keto",
  INTERMITTENT_FASTING: "Intermittent fasting",
  HITUNG_KALORI: "Hitung kalori",
  KATERING_DIET: "Katering diet",
  OLAHRAGA: "Olahraga / gym",
  OBAT_PELANGSING: "Obat / suplemen pelangsing",
  KLINIK_LAIN: "Program klinik lain",
  LAINNYA: "Lainnya",
} as const;

export const DIET_OUTCOMES = {
  BERHASIL: "Berhasil",
  TIDAK_BERHASIL: "Tidak berhasil",
  MASIH_JALAN: "Masih jalan",
} as const;

export const WEIGHT_AFTER_DIET = {
  BERTAHAN: "Bertahan",
  NAIK_SEBAGIAN: "Naik sebagian",
  NAIK_SEMUA: "Naik lagi semua",
} as const;

export const MEALS = {
  pagi: "Pagi",
  siang: "Siang",
  malam: "Malam",
  snack: "Snack",
  minuman: "Minuman",
  cemilan: "Cemilan",
} as const;

/** Minimal satu dari ketiganya wajib terisi pada food recall. */
export const MAIN_MEALS = ["pagi", "siang", "malam"] as const;

export const SKIN_COMPLAINTS = {
  JERAWAT: "Jerawat & bekasnya",
  FLEK_KUSAM: "Flek & kulit kusam",
  KERUTAN: "Kerutan & garis halus",
  PORI_BESAR: "Pori-pori besar",
  KENDUR: "Kulit kendur / double chin",
  LAINNYA: "Lainnya",
} as const;

export const SKIN_TYPES = {
  BERMINYAK: "Berminyak",
  KERING: "Kering",
  KOMBINASI: "Kombinasi",
  SENSITIF: "Sensitif / mudah merah",
  TIDAK_TAHU: "Tidak tahu",
} as const;

export const COMPLAINT_DURATIONS = {
  KURANG_3_BULAN: "Kurang dari 3 bulan",
  BULAN_3_12: "3–12 bulan",
  LEBIH_1_TAHUN: "Lebih dari 1 tahun",
} as const;

export const PRIOR_TREATMENTS = {
  BELUM: "Belum pernah",
  FACIAL_PEELING: "Facial / peeling",
  LASER_INJEKSI: "Laser / injeksi",
  LAINNYA: "Lainnya",
} as const;

export const CONDITIONS = {
  DARAH_TINGGI: "Darah tinggi",
  DIABETES: "Diabetes",
  JANTUNG: "Penyakit jantung",
  TIROID: "Gangguan tiroid",
  LAMBUNG: "Asam lambung / maag",
  LAINNYA: "Penyakit lain",
  TIDAK_ADA: "Tidak ada",
} as const;

export const PREGNANCY = { YA: "Ya", TIDAK: "Tidak", TIDAK_BERLAKU: "Tidak berlaku" } as const;

/** Jawaban P2: pilihan ya/tidak ditampilkan sebagai kartu seperti pertanyaan lain. */
export const HEALTH_CHANGE = { TIDAK: "Tidak ada", ADA: "Ada" } as const;

export const ACTIVITY_KINDS = {
  MAKAN_MINUM: "Makan/minum",
  KAPSUL_OBAT: "Kapsul/obat",
  OLAHRAGA: "Olahraga",
} as const;

/** Tabel aktivitas yang dilihat dokter: 06.00 sampai 22.00, per jam. */
export const ACTIVITY_FIRST_HOUR = 6;
export const ACTIVITY_LAST_HOUR = 22;

/** Pilihan yang meniadakan pilihan lain dalam satu pertanyaan pilihan ganda. */
export const EXCLUSIVE = { areas: "TIDAK_ADA", priorTreatments: "BELUM", conditions: "TIDAK_ADA" } as const;

export const TEXT_LIMITS = { short: 100, long: 300, medication: 200, activity: 200, story: 1000 } as const;

export const MEASURE_LIMITS = {
  weightKg: { min: 30, max: 250 },
  heightCm: { min: 120, max: 220 },
  lostKg: { min: 0.5, max: 100 },
} as const;
```

- [ ] **Step 3: Tulis fixture dan uji yang gagal**

`tests/fixtures/quiz-answers.ts`:

```ts
import type { QuizAnswers } from "@/lib/kuis/v1/answers";

export const slimmingNewPatient = {
  patientType: "BARU",
  purpose: "SLIMMING",
  slimming: {
    goal: "TURUN_BERAT",
    weightTarget: "KG_5_10",
    areas: ["PERUT", "PAHA"],
    dietHistory: "PERNAH",
    dietPrograms: ["KURANGI_KARBO", "INTERMITTENT_FASTING"],
    dietResults: {
      KURANGI_KARBO: { outcome: "BERHASIL", lostKg: 8, weightAfter: "NAIK_SEBAGIAN" },
      INTERMITTENT_FASTING: { outcome: "TIDAK_BERHASIL" },
    },
    weightKg: 72,
    heightCm: 158,
    foodRecall: { pagi: "Nasi kuning, teh manis", siang: "Nasi, ikan bakar" },
  },
  health: {
    conditions: ["DARAH_TINGGI", "DIABETES"],
    medications: {
      DARAH_TINGGI: { text: "Amlodipine 5 mg, 1× sehari" },
      DIABETES: { none: true },
    },
    otherMeds: { has: true, text: "Vitamin D, pil KB" },
    allergies: { has: true, text: "Amoxicillin (gatal-gatal)" },
    pregnancy: "TIDAK",
  },
} satisfies QuizAnswers;

export const aestheticNewPatient = {
  patientType: "BARU",
  purpose: "AESTHETIC",
  aesthetic: {
    complaints: ["JERAWAT", "PORI_BESAR"],
    skinType: "BERMINYAK",
    duration: "BULAN_3_12",
    priorTreatments: ["FACIAL_PEELING"],
    skincare: "Sabun cuci muka, sunscreen",
  },
  health: {
    conditions: ["TIDAK_ADA"],
    otherMeds: { has: false },
    allergies: { has: false },
    pregnancy: "TIDAK",
  },
} satisfies QuizAnswers;

export const unsureNewPatient = {
  patientType: "BARU",
  purpose: "BELUM_YAKIN",
  unsure: { story: "Ingin konsultasi soal berat badan dan jerawat." },
  health: {
    conditions: ["TIDAK_ADA"],
    otherMeds: { has: false },
    allergies: { has: false },
    pregnancy: "TIDAK_BERLAKU",
  },
} satisfies QuizAnswers;

export const slimmingReturningPatient = {
  patientType: "LAMA",
  purpose: "SLIMMING",
  returning: {
    story: "Berat turun 2 kg, sering lapar malam.",
    healthChanged: true,
    activities: [
      { hour: 6, kind: "KAPSUL_OBAT", text: "Kapsul M" },
      { hour: 7, kind: "MAKAN_MINUM", text: "Roti gandum, kopi" },
      { hour: 12, kind: "MAKAN_MINUM", text: "Nasi ½, ikan bakar" },
      { hour: 12, kind: "KAPSUL_OBAT", text: "Fat Blocker" },
      { hour: 13, kind: "OLAHRAGA", text: "Jalan kaki 30 menit" },
    ],
  },
  health: {
    conditions: ["DARAH_TINGGI"],
    medications: { DARAH_TINGGI: { text: "Amlodipine 5 mg, 1× sehari" } },
    otherMeds: { has: false },
    allergies: { has: false },
  },
} satisfies QuizAnswers;

export const aestheticReturningPatient = {
  patientType: "LAMA",
  purpose: "AESTHETIC",
  returning: { story: "Ingin facial lagi, jerawat muncul di dagu.", healthChanged: false },
} satisfies QuizAnswers;

export const newPatientIdentity = {
  name: "Siti Rahayu",
  whatsapp: "0812-3456-7890",
  birthDate: "1992-04-17",
  gender: "P",
  occupation: "Guru",
  address: "Jl. Sam Ratulangi No. 5, Manado",
};

export const returningPatientIdentity = {
  name: "Siti Rahayu",
  whatsapp: "081234567890",
  birthDate: "1992-04-17",
};
```

`tests/unit/kuis/answers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { quizAnswersSchema } from "@/lib/kuis/v1/answers";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
  unsureNewPatient,
} from "../../fixtures/quiz-answers";

describe("quizAnswersSchema", () => {
  it.each([
    ["Slimming baru", slimmingNewPatient],
    ["Aesthetic baru", aestheticNewPatient],
    ["Belum yakin baru", unsureNewPatient],
    ["Slimming lama", slimmingReturningPatient],
    ["Aesthetic lama", aestheticReturningPatient],
  ])("menerima jawaban lengkap %s", (_, answers) => {
    expect(quizAnswersSchema.safeParse(answers).success).toBe(true);
  });

  it("menerima draf kosong, karena setiap bagian diisi bertahap", () => {
    expect(quizAnswersSchema.safeParse({}).success).toBe(true);
  });

  it("menolak kunci yang tidak dikenal", () => {
    expect(quizAnswersSchema.safeParse({ ...slimmingNewPatient, extra: 1 }).success).toBe(false);
    expect(
      quizAnswersSchema.safeParse({ slimming: { goal: "TURUN_BERAT", catatan: "x" } }).success,
    ).toBe(false);
  });

  it("menolak pilihan di luar daftar dan pilihan ganda", () => {
    expect(quizAnswersSchema.safeParse({ purpose: "GIGI" }).success).toBe(false);
    expect(quizAnswersSchema.safeParse({ slimming: { areas: ["PERUT", "PERUT"] } }).success).toBe(false);
  });

  it("menolak berat, tinggi, dan jam aktivitas di luar batas", () => {
    expect(quizAnswersSchema.safeParse({ slimming: { weightKg: 20 } }).success).toBe(false);
    expect(quizAnswersSchema.safeParse({ slimming: { heightCm: 260 } }).success).toBe(false);
    expect(
      quizAnswersSchema.safeParse({ returning: { activities: [{ hour: 23, kind: "OLAHRAGA", text: "Lari" }] } })
        .success,
    ).toBe(false);
  });

  it("menolak teks yang melewati batas panjang dan merapikan spasi", () => {
    expect(quizAnswersSchema.safeParse({ unsure: { story: "a".repeat(1001) } }).success).toBe(false);
    const parsed = quizAnswersSchema.parse({ unsure: { story: "  sakit kepala  " } });
    expect(parsed.unsure?.story).toBe("sakit kepala");
  });
});
```

`tests/unit/kuis/identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateIdentity } from "@/lib/kuis/v1/identity";
import { newPatientIdentity, returningPatientIdentity } from "../../fixtures/quiz-answers";

const NOW = new Date("2026-09-28T03:00:00Z");

describe("validateIdentity", () => {
  it("menerima data lengkap pasien baru dan menyeragamkan nomor WA", () => {
    expect(validateIdentity(newPatientIdentity, "BARU", NOW)).toEqual({
      ok: true,
      identity: {
        name: "Siti Rahayu",
        whatsapp: "6281234567890",
        birthDate: "1992-04-17",
        gender: "P",
        occupation: "Guru",
        address: "Jl. Sam Ratulangi No. 5, Manado",
      },
    });
  });

  it("cukup nama, WA, dan tanggal lahir untuk pasien lama", () => {
    expect(validateIdentity(returningPatientIdentity, "LAMA", NOW)).toEqual({
      ok: true,
      identity: { name: "Siti Rahayu", whatsapp: "6281234567890", birthDate: "1992-04-17" },
    });
  });

  it("mewajibkan jenis kelamin, pekerjaan, dan alamat untuk pasien baru", () => {
    expect(validateIdentity(returningPatientIdentity, "BARU", NOW)).toMatchObject({ ok: false, field: "gender" });
    expect(validateIdentity({ ...newPatientIdentity, occupation: " " }, "BARU", NOW)).toMatchObject({
      ok: false,
      field: "occupation",
    });
  });

  it("menolak nomor WA dan tanggal lahir yang tidak sah", () => {
    expect(validateIdentity({ ...returningPatientIdentity, whatsapp: "12" }, "LAMA", NOW)).toMatchObject({
      ok: false,
      field: "whatsapp",
    });
    for (const birthDate of ["1992-02-30", "2026-09-28", "1900-01-01", "17-04-1992"]) {
      expect(validateIdentity({ ...returningPatientIdentity, birthDate }, "LAMA", NOW)).toMatchObject({
        ok: false,
        field: "birthDate",
      });
    }
  });

  it("menolak bentuk data yang tidak dikenal", () => {
    expect(validateIdentity({ ...returningPatientIdentity, nik: "123" }, "LAMA", NOW)).toMatchObject({ ok: false });
    expect(validateIdentity(null, "LAMA", NOW)).toMatchObject({ ok: false });
  });
});
```

Run: `npx vitest run tests/unit/kuis`
Expected: FAIL, modul `@/lib/kuis/v1/answers` tidak ditemukan.

- [ ] **Step 4: Implementasi skema jawaban**

`src/lib/kuis/v1/answers.ts`:

```ts
import { z } from "zod";
import {
  ACTIVITY_FIRST_HOUR,
  ACTIVITY_KINDS,
  ACTIVITY_LAST_HOUR,
  BODY_AREAS,
  COMPLAINT_DURATIONS,
  CONDITIONS,
  DIET_HISTORY,
  DIET_OUTCOMES,
  DIET_PROGRAMS,
  MEALS,
  MEASURE_LIMITS,
  PATIENT_TYPES,
  PREGNANCY,
  PRIOR_TREATMENTS,
  PURPOSES,
  SKIN_COMPLAINTS,
  SKIN_TYPES,
  SLIMMING_GOALS,
  TEXT_LIMITS,
  WEIGHT_AFTER_DIET,
  WEIGHT_TARGETS,
} from "./options";

/** z.enum dari kunci objek label, mis. { PERUT: "Perut" } menerima "PERUT". */
function keysOf<T extends Record<string, string>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

function choices<T extends z.ZodType<string>>(item: T) {
  return z.array(item).refine((values) => new Set(values).size === values.length, "Pilihan ganda.");
}

const text = (max: number) => z.string().trim().max(max);

const between = (limits: { min: number; max: number }) => z.number().min(limits.min).max(limits.max);

const dietResult = z.strictObject({
  outcome: keysOf(DIET_OUTCOMES).optional(),
  lostKg: between(MEASURE_LIMITS.lostKg).optional(),
  weightAfter: keysOf(WEIGHT_AFTER_DIET).optional(),
});

const medication = z.strictObject({
  text: text(TEXT_LIMITS.medication).optional(),
  none: z.boolean().optional(),
});

const yesNoText = z.strictObject({
  has: z.boolean().optional(),
  text: text(TEXT_LIMITS.long).optional(),
});

export const activityEntrySchema = z.strictObject({
  hour: z.number().int().min(ACTIVITY_FIRST_HOUR).max(ACTIVITY_LAST_HOUR),
  kind: keysOf(ACTIVITY_KINDS),
  text: text(TEXT_LIMITS.activity).min(1),
});

/**
 * Bentuk jawaban kuis v1. Semua bagian opsional karena draf diisi bertahap;
 * aturan wajib isi per layar ada di steps.ts (stepError), dan
 * validateQuizAnswers menggabungkan keduanya. strictObject menolak kunci
 * yang tidak dikenal — data asing tidak pernah masuk ke rekam medis.
 */
export const quizAnswersSchema = z.strictObject({
  patientType: keysOf(PATIENT_TYPES).optional(),
  purpose: keysOf(PURPOSES).optional(),
  slimming: z
    .strictObject({
      goal: keysOf(SLIMMING_GOALS).optional(),
      weightTarget: keysOf(WEIGHT_TARGETS).optional(),
      areas: choices(keysOf(BODY_AREAS)).optional(),
      dietHistory: keysOf(DIET_HISTORY).optional(),
      dietPrograms: choices(keysOf(DIET_PROGRAMS)).optional(),
      dietProgramOther: text(TEXT_LIMITS.short).optional(),
      dietResults: z.partialRecord(keysOf(DIET_PROGRAMS), dietResult).optional(),
      weightKg: between(MEASURE_LIMITS.weightKg).optional(),
      heightCm: between(MEASURE_LIMITS.heightCm).optional(),
      foodRecall: z.partialRecord(keysOf(MEALS), text(TEXT_LIMITS.long)).optional(),
    })
    .optional(),
  aesthetic: z
    .strictObject({
      complaints: choices(keysOf(SKIN_COMPLAINTS)).optional(),
      complaintOther: text(TEXT_LIMITS.short).optional(),
      skinType: keysOf(SKIN_TYPES).optional(),
      duration: keysOf(COMPLAINT_DURATIONS).optional(),
      priorTreatments: choices(keysOf(PRIOR_TREATMENTS)).optional(),
      priorTreatmentOther: text(TEXT_LIMITS.short).optional(),
      skincare: text(TEXT_LIMITS.long).optional(),
    })
    .optional(),
  unsure: z.strictObject({ story: text(TEXT_LIMITS.story).optional() }).optional(),
  health: z
    .strictObject({
      conditions: choices(keysOf(CONDITIONS)).optional(),
      conditionOther: text(TEXT_LIMITS.short).optional(),
      medications: z.partialRecord(keysOf(CONDITIONS), medication).optional(),
      otherMeds: yesNoText.optional(),
      allergies: yesNoText.optional(),
      pregnancy: keysOf(PREGNANCY).optional(),
    })
    .optional(),
  returning: z
    .strictObject({
      story: text(TEXT_LIMITS.story).optional(),
      healthChanged: z.boolean().optional(),
      activities: z.array(activityEntrySchema).max(40).optional(),
    })
    .optional(),
});

export type QuizAnswers = z.infer<typeof quizAnswersSchema>;
export type ActivityEntry = z.infer<typeof activityEntrySchema>;
export type SlimmingAnswers = NonNullable<QuizAnswers["slimming"]>;
export type AestheticAnswers = NonNullable<QuizAnswers["aesthetic"]>;
export type HealthAnswers = NonNullable<QuizAnswers["health"]>;
export type ReturningAnswers = NonNullable<QuizAnswers["returning"]>;
```

- [ ] **Step 5: Implementasi pemeriksaan data diri**

`src/lib/kuis/v1/identity.ts`:

```ts
import { z } from "zod";
import { witaDateString } from "@/lib/time";
import { normalizeWhatsapp } from "@/lib/whatsapp";

export type Identity = {
  name: string;
  /** Sudah diseragamkan ke bentuk "62…". */
  whatsapp: string;
  /** "YYYY-MM-DD". */
  birthDate: string;
  gender?: "L" | "P";
  occupation?: string;
  address?: string;
};

export type IdentityValidation =
  | { ok: true; identity: Identity }
  | { ok: false; field: keyof Identity | null; message: string };

const identityShape = z.strictObject({
  name: z.string(),
  whatsapp: z.string(),
  birthDate: z.string(),
  gender: z.enum(["L", "P"]).optional(),
  occupation: z.string().optional(),
  address: z.string().optional(),
});

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  // Tanggal seperti 30 Februari "digulirkan" Date ke Maret — bandingkan balik.
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function fail(field: keyof Identity | null, message: string): IdentityValidation {
  return { ok: false, field, message };
}

/**
 * Data diri langkah D (spec 3.1). Pasien lama cukup nama, WA, dan tanggal
 * lahir — hanya untuk dicocokkan admin; pasien baru melengkapi sisanya.
 */
export function validateIdentity(
  raw: unknown,
  patientType: "BARU" | "LAMA",
  now: Date = new Date(),
): IdentityValidation {
  const parsed = identityShape.safeParse(raw);
  if (!parsed.success) return fail(null, "Data diri tidak sah. Muat ulang halaman lalu coba lagi.");
  const data = parsed.data;

  const name = data.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) return fail("name", "Tulis nama lengkap Anda.");

  const whatsapp = normalizeWhatsapp(data.whatsapp);
  if (!whatsapp) return fail("whatsapp", "Nomor WhatsApp tidak sah. Contoh: 081234567890.");

  const today = witaDateString(now);
  const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;
  if (!isRealDate(data.birthDate) || data.birthDate >= today || data.birthDate < oldest) {
    return fail("birthDate", "Isi tanggal lahir yang benar.");
  }

  if (patientType === "LAMA") {
    return { ok: true, identity: { name, whatsapp, birthDate: data.birthDate } };
  }

  const occupation = data.occupation?.trim() ?? "";
  const address = data.address?.trim() ?? "";
  if (!data.gender) return fail("gender", "Pilih jenis kelamin.");
  if (!occupation || occupation.length > 100) return fail("occupation", "Isi pekerjaan Anda.");
  if (!address || address.length > 200) return fail("address", "Isi alamat Anda (maksimal 200 karakter).");

  return {
    ok: true,
    identity: { name, whatsapp, birthDate: data.birthDate, gender: data.gender, occupation, address },
  };
}
```

- [ ] **Step 6: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/kuis`
Expected: PASS (answers 10, identity 5).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/kuis/v1/options.ts src/lib/kuis/v1/answers.ts src/lib/kuis/v1/identity.ts tests/fixtures/quiz-answers.ts tests/unit/kuis
git commit -m "feat: quiz v1 options, answer schema and identity checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Kuis v1 — urutan langkah, aturan wajib isi, dan pembersihan jawaban

**Files:**
- Create: `src/lib/kuis/v1/steps.ts`
- Create: `src/lib/kuis/v1/texts.ts`
- Test: `tests/unit/kuis/steps.test.ts`

**Interfaces:**
- Consumes: `QuizAnswers` dan label dari Task 5.
- Produces:
  - `type StepId = "U1" | "U2" | "S1" … "S8" | "A1" … "A4" | "B1" | "K1" … "K4" | "P1" | "P2" | "P3"`;
  - `type QuizMode = { askPatientType: boolean }`;
  - `visibleSteps(a: QuizAnswers, mode: QuizMode): StepId[]`;
  - `stepError(step: StepId, a: QuizAnswers): string | null`;
  - `pruneAnswers(a: QuizAnswers): QuizAnswers`;
  - `validateQuizAnswers(raw: unknown, mode: QuizMode): QuizValidation`, dengan `QuizValidation = { ok: true; answers: QuizAnswers } | { ok: false; step: StepId | null; message: string }`;
  - `selectedConditions(a)`, `conditionName(a, key)`, `dietProgramName(a, key)`;
  - `stepText(step: StepId, a: QuizAnswers): { title: string; hint?: string }`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/kuis/steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { pruneAnswers, stepError, validateQuizAnswers, visibleSteps } from "@/lib/kuis/v1/steps";
import { stepText } from "@/lib/kuis/v1/texts";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
  unsureNewPatient,
} from "../../fixtures/quiz-answers";

const SITE = { askPatientType: true };
const LINK = { askPatientType: false };

describe("visibleSteps", () => {
  it("berhenti di dua pertanyaan awal sampai tipe pasien dan tujuan dipilih", () => {
    expect(visibleSteps({}, SITE)).toEqual(["U1", "U2"]);
    expect(visibleSteps({ patientType: "BARU" }, SITE)).toEqual(["U1", "U2"]);
  });

  it("tidak menanyakan tipe pasien bila sudah ditentukan sistem (link WA)", () => {
    expect(visibleSteps({}, LINK)).toEqual(["U2"]);
  });

  it("jalur Slimming pasien baru dengan riwayat diet", () => {
    expect(visibleSteps(slimmingNewPatient, SITE)).toEqual([
      "U1", "U2", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "K1", "K2", "K3", "K4",
    ]);
  });

  it("melewati pertanyaan program diet bila belum pernah diet dan obat bila tidak ada penyakit", () => {
    const answers: QuizAnswers = {
      ...slimmingNewPatient,
      slimming: { ...slimmingNewPatient.slimming, dietHistory: "BELUM" },
      health: { ...slimmingNewPatient.health, conditions: ["TIDAK_ADA"] },
    };
    expect(visibleSteps(answers, SITE)).toEqual(["U1", "U2", "S1", "S2", "S3", "S4", "S7", "S8", "K1", "K3", "K4"]);
  });

  it("jalur Aesthetic dan Belum yakin pasien baru", () => {
    expect(visibleSteps(aestheticNewPatient, SITE)).toEqual(["U1", "U2", "A1", "A2", "A3", "A4", "K1", "K3", "K4"]);
    expect(visibleSteps(unsureNewPatient, SITE)).toEqual(["U1", "U2", "B1", "K1", "K3", "K4"]);
  });

  it("kuis pendek pasien lama: kesehatan hanya bila ada perubahan, aktivitas hanya untuk Slimming", () => {
    expect(visibleSteps(slimmingReturningPatient, SITE)).toEqual(["U1", "U2", "P1", "P2", "K1", "K2", "K3", "P3"]);
    expect(visibleSteps(aestheticReturningPatient, SITE)).toEqual(["U1", "U2", "P1", "P2"]);
  });
});

describe("stepError", () => {
  it("mewajibkan obat atau 'Tidak minum obat' untuk setiap penyakit (K5)", () => {
    const answers: QuizAnswers = {
      health: { conditions: ["DARAH_TINGGI", "DIABETES"], medications: { DARAH_TINGGI: { text: "Amlodipine" } } },
    };
    expect(stepError("K2", answers)).toBe("Tulis obat untuk Diabetes, atau centang “Tidak minum obat”.");
    answers.health!.medications!.DIABETES = { none: true };
    expect(stepError("K2", answers)).toBeNull();
  });

  it("memakai nama penyakit lain yang diketik pasien di pesan", () => {
    const answers: QuizAnswers = { health: { conditions: ["LAINNYA"], conditionOther: "Asma" } };
    expect(stepError("K2", answers)).toBe("Tulis obat untuk Asma, atau centang “Tidak minum obat”.");
  });

  it("mewajibkan hasil setiap program diet, kg bila berhasil/masih jalan, dan berat sekarang bila berhasil (K6)", () => {
    const answers: QuizAnswers = {
      slimming: { dietHistory: "PERNAH", dietPrograms: ["KETO"], dietResults: { KETO: { outcome: "BERHASIL" } } },
    };
    expect(stepError("S6", answers)).toBe("Isi berapa kg turun untuk Keto.");
    answers.slimming!.dietResults!.KETO = { outcome: "BERHASIL", lostKg: 5 };
    expect(stepError("S6", answers)).toBe("Pilih keadaan berat sekarang untuk Keto.");
    answers.slimming!.dietResults!.KETO = { outcome: "MASIH_JALAN", lostKg: 2 };
    expect(stepError("S6", answers)).toBeNull();
  });

  it("menolak pilihan eksklusif yang digabung", () => {
    expect(stepError("K1", { health: { conditions: ["TIDAK_ADA", "DIABETES"] } })).toBe(
      "“Tidak ada” tidak bisa digabung dengan pilihan lain.",
    );
  });

  it("mewajibkan teks untuk pilihan Lainnya", () => {
    expect(stepError("S5", { slimming: { dietPrograms: ["LAINNYA"] } })).toBe("Tulis nama program diet lainnya.");
    expect(stepError("A1", { aesthetic: { complaints: ["LAINNYA"], complaintOther: "  " } })).toBe(
      "Tulis keluhan lainnya.",
    );
  });

  it("food recall cukup satu dari pagi, siang, atau malam", () => {
    expect(stepError("S8", { slimming: { foodRecall: { snack: "Keripik" } } })).toBe(
      "Isi minimal satu: pagi, siang, atau malam.",
    );
    expect(stepError("S8", { slimming: { foodRecall: { malam: "Nasi" } } })).toBeNull();
  });

  it("aktivitas H-1 minimal satu catatan", () => {
    expect(stepError("P3", { returning: { activities: [] } })).toBe("Tambahkan minimal satu catatan.");
  });
});

describe("pruneAnswers", () => {
  it("membuang jawaban jalur lain bila pasien mengganti tujuan (Review Focus 1)", () => {
    const switched = { ...slimmingNewPatient, purpose: "AESTHETIC", aesthetic: aestheticNewPatient.aesthetic } as QuizAnswers;
    const pruned = pruneAnswers(switched);
    expect(pruned.slimming).toBeUndefined();
    expect(pruned.aesthetic).toEqual(aestheticNewPatient.aesthetic);
  });

  it("membuang obat penyakit yang tidak lagi dicentang dan teks milik pilihan yang dibatalkan", () => {
    const answers: QuizAnswers = {
      ...slimmingNewPatient,
      health: {
        ...slimmingNewPatient.health,
        conditions: ["DIABETES"],
        conditionOther: "Asma",
        otherMeds: { has: false, text: "Vitamin D" },
      },
    };
    const pruned = pruneAnswers(answers);
    expect(pruned.health?.medications).toEqual({ DIABETES: { none: true } });
    expect(pruned.health?.conditionOther).toBeUndefined();
    expect(pruned.health?.otherMeds).toEqual({ has: false });
  });

  it("membuang riwayat program diet bila pasien memilih Belum pernah", () => {
    const answers: QuizAnswers = { ...slimmingNewPatient, slimming: { ...slimmingNewPatient.slimming, dietHistory: "BELUM" } };
    const pruned = pruneAnswers(answers);
    expect(pruned.slimming?.dietPrograms).toBeUndefined();
    expect(pruned.slimming?.dietResults).toBeUndefined();
  });

  it("pasien lama: membuang kesehatan bila tidak ada perubahan, dan aktivitas bila bukan Slimming", () => {
    const answers = {
      ...aestheticReturningPatient,
      returning: { ...aestheticReturningPatient.returning, activities: [{ hour: 7, kind: "OLAHRAGA", text: "Lari" }] },
      health: slimmingReturningPatient.health,
    } as QuizAnswers;
    const pruned = pruneAnswers(answers);
    expect(pruned.health).toBeUndefined();
    expect(pruned.returning?.activities).toBeUndefined();
  });
});

describe("validateQuizAnswers", () => {
  it.each([
    ["Slimming baru", slimmingNewPatient],
    ["Aesthetic baru", aestheticNewPatient],
    ["Belum yakin baru", unsureNewPatient],
    ["Slimming lama", slimmingReturningPatient],
    ["Aesthetic lama", aestheticReturningPatient],
  ])("menerima jawaban lengkap %s", (_, answers) => {
    expect(validateQuizAnswers(answers, SITE)).toEqual({ ok: true, answers: pruneAnswers(answers) });
  });

  it("menunjuk langkah pertama yang belum lengkap", () => {
    const answers = { ...slimmingNewPatient, health: { ...slimmingNewPatient.health, pregnancy: undefined } };
    expect(validateQuizAnswers(answers, SITE)).toEqual({ ok: false, step: "K4", message: "Pilih salah satu." });
  });

  it("menolak jawaban yang berhenti sebelum tujuan dipilih", () => {
    expect(validateQuizAnswers({ patientType: "BARU" }, SITE)).toMatchObject({ ok: false, step: "U2" });
  });

  it("menolak bentuk yang tidak sah tanpa membocorkan detail skema", () => {
    expect(validateQuizAnswers({ purpose: "GIGI" }, SITE)).toEqual({
      ok: false,
      step: null,
      message: "Jawaban tidak sah. Muat ulang halaman lalu coba lagi.",
    });
  });
});

describe("stepText", () => {
  it("menyesuaikan pertanyaan pasien lama dengan tujuannya", () => {
    expect(stepText("P1", { purpose: "SLIMMING" }).title).toBe("Bagaimana perkembangan program Anda? Ada keluhan?");
    expect(stepText("P1", { purpose: "AESTHETIC" }).title).toBe("Keluhan atau treatment yang diinginkan kali ini?");
  });
});
```

Run: `npx vitest run tests/unit/kuis/steps.test.ts`
Expected: FAIL, modul `@/lib/kuis/v1/steps` tidak ditemukan.

- [ ] **Step 2: Implementasi langkah dan aturan**

`src/lib/kuis/v1/steps.ts`:

```ts
import {
  quizAnswersSchema,
  type HealthAnswers,
  type QuizAnswers,
  type SlimmingAnswers,
} from "./answers";
import { CONDITIONS, DIET_PROGRAMS, EXCLUSIVE, MAIN_MEALS } from "./options";

export const STEP_IDS = [
  "U1", "U2",
  "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8",
  "A1", "A2", "A3", "A4",
  "B1",
  "K1", "K2", "K3", "K4",
  "P1", "P2", "P3",
] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Situs menanyakan "Pernah berobat?"; link WA (Plan 3b-2) sudah tahu jawabannya. */
export type QuizMode = { askPatientType: boolean };

type ConditionKey = keyof typeof CONDITIONS;
type DietProgramKey = keyof typeof DIET_PROGRAMS;

const CHOOSE_ONE = "Pilih salah satu.";

export function selectedConditions(a: QuizAnswers): ConditionKey[] {
  return (a.health?.conditions ?? []).filter((c) => c !== "TIDAK_ADA");
}

function hasDietHistory(a: QuizAnswers): boolean {
  return a.slimming?.dietHistory === "PERNAH" || a.slimming?.dietHistory === "SEDANG";
}

export function conditionName(a: QuizAnswers, key: ConditionKey): string {
  return key === "LAINNYA" ? a.health?.conditionOther?.trim() || CONDITIONS.LAINNYA : CONDITIONS[key];
}

export function dietProgramName(a: QuizAnswers, key: DietProgramKey): string {
  return key === "LAINNYA" ? a.slimming?.dietProgramOther?.trim() || DIET_PROGRAMS.LAINNYA : DIET_PROGRAMS[key];
}

function healthSteps(a: QuizAnswers, includePregnancy: boolean): StepId[] {
  const steps: StepId[] = ["K1"];
  if (selectedConditions(a).length > 0) steps.push("K2");
  steps.push("K3");
  if (includePregnancy) steps.push("K4");
  return steps;
}

/** Layar kuis yang berlaku untuk jawaban saat ini, berurutan (spec 3.2). */
export function visibleSteps(a: QuizAnswers, mode: QuizMode): StepId[] {
  const steps: StepId[] = mode.askPatientType ? ["U1", "U2"] : ["U2"];
  if (!a.patientType || !a.purpose) return steps;

  if (a.patientType === "LAMA") {
    steps.push("P1", "P2");
    if (a.returning?.healthChanged) steps.push(...healthSteps(a, false));
    if (a.purpose === "SLIMMING") steps.push("P3");
    return steps;
  }

  if (a.purpose === "SLIMMING") {
    steps.push("S1", "S2", "S3", "S4");
    if (hasDietHistory(a)) steps.push("S5", "S6");
    steps.push("S7", "S8");
  } else if (a.purpose === "AESTHETIC") {
    steps.push("A1", "A2", "A3", "A4");
  } else {
    steps.push("B1");
  }
  steps.push(...healthSteps(a, true));
  return steps;
}

const filled = (value?: string) => Boolean(value?.trim());

function multiError(values: readonly string[] | undefined, exclusive?: string, exclusiveLabel?: string) {
  if (!values || values.length === 0) return "Pilih minimal satu.";
  if (exclusive && values.includes(exclusive) && values.length > 1) {
    return `“${exclusiveLabel}” tidak bisa digabung dengan pilihan lain.`;
  }
  return null;
}

/** Pesan untuk pasien bila layar ini belum lengkap, atau null bila boleh lanjut. */
export function stepError(step: StepId, a: QuizAnswers): string | null {
  const s = a.slimming;
  const ae = a.aesthetic;
  const h = a.health;
  const r = a.returning;

  switch (step) {
    case "U1":
      return a.patientType ? null : CHOOSE_ONE;
    case "U2":
      return a.purpose ? null : CHOOSE_ONE;
    case "S1":
      return s?.goal ? null : CHOOSE_ONE;
    case "S2":
      return s?.weightTarget ? null : CHOOSE_ONE;
    case "S3":
      return multiError(s?.areas, EXCLUSIVE.areas, "Tidak ada area khusus");
    case "S4":
      return s?.dietHistory ? null : CHOOSE_ONE;
    case "S5":
      return (
        multiError(s?.dietPrograms) ??
        (s?.dietPrograms?.includes("LAINNYA") && !filled(s.dietProgramOther)
          ? "Tulis nama program diet lainnya."
          : null)
      );
    case "S6":
      for (const program of s?.dietPrograms ?? []) {
        const result = s?.dietResults?.[program];
        const name = dietProgramName(a, program);
        if (!result?.outcome) return `Pilih hasil untuk ${name}.`;
        const lost = result.outcome === "BERHASIL" || result.outcome === "MASIH_JALAN";
        if (lost && result.lostKg === undefined) return `Isi berapa kg turun untuk ${name}.`;
        if (result.outcome === "BERHASIL" && !result.weightAfter) {
          return `Pilih keadaan berat sekarang untuk ${name}.`;
        }
      }
      return null;
    case "S7":
      return s?.weightKg === undefined || s?.heightCm === undefined ? "Isi berat dan tinggi badan." : null;
    case "S8":
      return MAIN_MEALS.some((meal) => filled(s?.foodRecall?.[meal]))
        ? null
        : "Isi minimal satu: pagi, siang, atau malam.";
    case "A1":
      return (
        multiError(ae?.complaints) ??
        (ae?.complaints?.includes("LAINNYA") && !filled(ae.complaintOther) ? "Tulis keluhan lainnya." : null)
      );
    case "A2":
      return ae?.skinType ? null : CHOOSE_ONE;
    case "A3":
      return ae?.duration ? null : CHOOSE_ONE;
    case "A4":
      return (
        multiError(ae?.priorTreatments, EXCLUSIVE.priorTreatments, "Belum pernah") ??
        (ae?.priorTreatments?.includes("LAINNYA") && !filled(ae.priorTreatmentOther)
          ? "Tulis treatment lainnya."
          : null)
      );
    case "B1":
      return filled(a.unsure?.story) ? null : "Ceritakan keluhan atau tujuan Anda.";
    case "K1":
      return (
        multiError(h?.conditions, EXCLUSIVE.conditions, "Tidak ada") ??
        (h?.conditions?.includes("LAINNYA") && !filled(h.conditionOther) ? "Tulis nama penyakit lainnya." : null)
      );
    case "K2":
      for (const condition of selectedConditions(a)) {
        const medication = h?.medications?.[condition];
        if (!medication?.none && !filled(medication?.text)) {
          return `Tulis obat untuk ${conditionName(a, condition)}, atau centang “Tidak minum obat”.`;
        }
      }
      return null;
    case "K3":
      if (h?.otherMeds?.has === undefined) return "Jawab pertanyaan obat atau suplemen lain.";
      if (h.otherMeds.has && !filled(h.otherMeds.text)) return "Tulis obat atau suplemen lain yang Anda minum.";
      if (h.allergies?.has === undefined) return "Jawab pertanyaan alergi.";
      if (h.allergies.has && !filled(h.allergies.text)) return "Tulis alergi Anda.";
      return null;
    case "K4":
      return h?.pregnancy ? null : CHOOSE_ONE;
    case "P1":
      return filled(r?.story) ? null : "Ceritakan keluhan atau tujuan kunjungan ini.";
    case "P2":
      return r?.healthChanged === undefined ? CHOOSE_ONE : null;
    case "P3":
      return (r?.activities?.length ?? 0) > 0 ? null : "Tambahkan minimal satu catatan.";
  }
}

// JSON bolak-balik membuang kunci bernilai undefined, agar jawaban tersimpan
// tidak memuat kunci kosong.
function compact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pruneSlimming(s: SlimmingAnswers): SlimmingAnswers {
  const programs = s.dietHistory === "PERNAH" || s.dietHistory === "SEDANG" ? s.dietPrograms ?? [] : [];
  const results = Object.fromEntries(
    programs.flatMap((program) => {
      const result = s.dietResults?.[program];
      if (!result) return [];
      const lost = result.outcome === "BERHASIL" || result.outcome === "MASIH_JALAN";
      return [
        [
          program,
          {
            outcome: result.outcome,
            lostKg: lost ? result.lostKg : undefined,
            weightAfter: result.outcome === "BERHASIL" ? result.weightAfter : undefined,
          },
        ],
      ];
    }),
  ) as SlimmingAnswers["dietResults"];

  return {
    goal: s.goal,
    weightTarget: s.weightTarget,
    areas: s.areas,
    dietHistory: s.dietHistory,
    dietPrograms: programs.length > 0 ? programs : undefined,
    dietProgramOther: programs.includes("LAINNYA") ? s.dietProgramOther : undefined,
    dietResults: programs.length > 0 ? results : undefined,
    weightKg: s.weightKg,
    heightCm: s.heightCm,
    foodRecall: s.foodRecall,
  };
}

function pruneHealth(h: HealthAnswers, includePregnancy: boolean): HealthAnswers {
  const conditions = h.conditions ?? [];
  const withMedication = conditions.filter((c) => c !== "TIDAK_ADA");
  const medications = Object.fromEntries(
    withMedication.flatMap((condition) => {
      const medication = h.medications?.[condition];
      if (!medication) return [];
      return [[condition, medication.none ? { none: true } : { text: medication.text }]];
    }),
  ) as HealthAnswers["medications"];
  const yesNo = (value: HealthAnswers["otherMeds"]) =>
    value && { has: value.has, text: value.has ? value.text : undefined };

  return {
    conditions: h.conditions,
    conditionOther: conditions.includes("LAINNYA") ? h.conditionOther : undefined,
    medications: withMedication.length > 0 ? medications : undefined,
    otherMeds: yesNo(h.otherMeds),
    allergies: yesNo(h.allergies),
    pregnancy: includePregnancy ? h.pregnancy : undefined,
  };
}

/**
 * Menyisakan hanya jawaban yang berlaku untuk pilihan pasien saat ini.
 * Pasien yang mengganti tujuan atau membatalkan centang tidak boleh
 * mengirim jawaban lama yang tidak pernah ia lihat lagi (Review Focus 1).
 */
export function pruneAnswers(a: QuizAnswers): QuizAnswers {
  const out: QuizAnswers = { patientType: a.patientType, purpose: a.purpose };

  if (a.patientType === "LAMA" && a.returning) {
    out.returning = {
      story: a.returning.story,
      healthChanged: a.returning.healthChanged,
      activities: a.purpose === "SLIMMING" ? a.returning.activities : undefined,
    };
    if (a.returning.healthChanged && a.health) out.health = pruneHealth(a.health, false);
  }

  if (a.patientType === "BARU") {
    if (a.purpose === "SLIMMING" && a.slimming) out.slimming = pruneSlimming(a.slimming);
    if (a.purpose === "AESTHETIC" && a.aesthetic) {
      out.aesthetic = {
        ...a.aesthetic,
        complaintOther: a.aesthetic.complaints?.includes("LAINNYA") ? a.aesthetic.complaintOther : undefined,
        priorTreatmentOther: a.aesthetic.priorTreatments?.includes("LAINNYA")
          ? a.aesthetic.priorTreatmentOther
          : undefined,
      };
    }
    if (a.purpose === "BELUM_YAKIN" && a.unsure) out.unsure = a.unsure;
    if (a.health) out.health = pruneHealth(a.health, true);
  }

  return compact(out);
}

export type QuizValidation =
  | { ok: true; answers: QuizAnswers }
  | { ok: false; step: StepId | null; message: string };

/**
 * Pemeriksaan akhir di server: bentuk (zod) lalu aturan setiap layar yang
 * berlaku. Mengembalikan jawaban yang sudah dibersihkan — hanya itu yang
 * boleh disimpan.
 */
export function validateQuizAnswers(raw: unknown, mode: QuizMode): QuizValidation {
  const parsed = quizAnswersSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, step: null, message: "Jawaban tidak sah. Muat ulang halaman lalu coba lagi." };
  }
  const answers = pruneAnswers(parsed.data);
  for (const step of visibleSteps(answers, mode)) {
    const message = stepError(step, answers);
    if (message) return { ok: false, step, message };
  }
  return { ok: true, answers };
}
```

`src/lib/kuis/v1/texts.ts`:

```ts
import type { QuizAnswers } from "./answers";
import type { StepId } from "./steps";

const MULTI = "Boleh pilih lebih dari satu.";

/** Judul dan petunjuk tiap layar kuis v1 — bagian dari kata-kata yang ditinjau dokter. */
export function stepText(step: StepId, a: QuizAnswers): { title: string; hint?: string } {
  switch (step) {
    case "U1":
      return { title: "Pernah berobat di SunDY Clinic?" };
    case "U2":
      return { title: "Apa yang ingin Anda konsultasikan?" };
    case "S1":
      return { title: "Apa tujuan utama Anda?" };
    case "S2":
      return { title: "Berapa kg yang ingin diturunkan?" };
    case "S3":
      return { title: "Area mana yang paling ingin dikecilkan?", hint: MULTI };
    case "S4":
      return { title: "Pernah menjalani program diet?" };
    case "S5":
      return { title: "Program diet apa yang pernah dijalani?", hint: MULTI };
    case "S6":
      return { title: "Bagaimana hasilnya?", hint: "Perkiraan juga boleh." };
    case "S7":
      return {
        title: "Berat & tinggi badan Anda",
        hint: "Ukuran sendiri saja. Dokter akan memastikannya dengan Timbang BIA di klinik.",
      };
    case "S8":
      return { title: "Apa yang biasa Anda makan sehari?", hint: "Isi minimal satu: pagi, siang, atau malam." };
    case "A1":
      return { title: "Apa yang paling mengganggu Anda?", hint: MULTI };
    case "A2":
      return { title: "Bagaimana kulit wajah Anda?" };
    case "A3":
      return { title: "Sudah berapa lama keluhan ini?" };
    case "A4":
      return { title: "Pernah treatment di klinik lain?", hint: MULTI };
    case "B1":
      return { title: "Ceritakan keluhan atau tujuan Anda", hint: "Dokter kami membacanya sebelum Anda datang." };
    case "K1":
      return {
        title:
          a.patientType === "LAMA"
            ? "Penyakit atau kondisi Anda saat ini"
            : "Punya riwayat penyakit atau kondisi ini?",
        hint: MULTI,
      };
    case "K2":
      return {
        title: "Obat apa yang Anda minum?",
        hint: "Tulis nama obat & aturan minumnya, sebisanya. Tidak ingat namanya? Tulis “lupa”; dokter akan menanyakannya saat konsultasi.",
      };
    case "K3":
      return {
        title: "Ada obat lain atau alergi?",
        hint: "Termasuk vitamin, suplemen, obat pelangsing, KB, atau obat jerawat.",
      };
    case "K4":
      return { title: "Sedang hamil, merencanakan kehamilan, atau menyusui?" };
    case "P1":
      if (a.purpose === "SLIMMING") return { title: "Bagaimana perkembangan program Anda? Ada keluhan?" };
      if (a.purpose === "AESTHETIC") return { title: "Keluhan atau treatment yang diinginkan kali ini?" };
      return { title: "Ceritakan keluhan atau tujuan Anda" };
    case "P2":
      return { title: "Ada perubahan penyakit atau obat sejak kunjungan terakhir?" };
    case "P3":
      return {
        title: "Apa saja yang Anda lakukan kemarin?",
        hint: "Tambahkan makan, kapsul/obat, dan olahraga beserta jamnya.",
      };
  }
}
```

- [ ] **Step 3: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/kuis/steps.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: tanpa galat.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kuis/v1/steps.ts src/lib/kuis/v1/texts.ts tests/unit/kuis/steps.test.ts
git commit -m "feat: quiz v1 step order, required-answer rules and pruning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kuis v1 — ringkasan jawaban, IMT, dan tabel aktivitas

**Files:**
- Create: `src/lib/kuis/v1/describe.ts`
- Test: `tests/unit/kuis/describe.test.ts`

**Interfaces:**
- Consumes: Task 5–6.
- Produces:
  - `type IntakeSection = { title: string; step: StepId; lines: string[] }`;
  - `describeAnswers(a: QuizAnswers): IntakeSection[]`;
  - `bodyMassIndex(weightKg: number, heightCm: number): number`;
  - `type ActivityRow = { hour: number; label: string; entries: { kindLabel: string; text: string }[] }`;
  - `activityTable(activities: ActivityEntry[]): ActivityRow[]`;
  - `formatDecimal(value: number): string`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/kuis/describe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { activityTable, bodyMassIndex, describeAnswers } from "@/lib/kuis/v1/describe";
import {
  aestheticNewPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
  unsureNewPatient,
} from "../../fixtures/quiz-answers";

describe("bodyMassIndex", () => {
  it("dibulatkan satu angka di belakang koma", () => {
    expect(bodyMassIndex(72, 158)).toBe(28.8);
  });
});

describe("activityTable", () => {
  it("selalu berisi 17 baris jam 06.00–22.00, dan jam kosong tetap tampil", () => {
    const rows = activityTable(slimmingReturningPatient.returning.activities);
    expect(rows).toHaveLength(17);
    expect(rows[0]).toEqual({ hour: 6, label: "06.00", entries: [{ kindLabel: "Kapsul/obat", text: "Kapsul M" }] });
    expect(rows[2]).toEqual({ hour: 8, label: "08.00", entries: [] });
    expect(rows[6].entries.map((e) => e.text)).toEqual(["Nasi ½, ikan bakar", "Fat Blocker"]);
    expect(rows[16].label).toBe("22.00");
  });
});

describe("describeAnswers", () => {
  it("merangkum pasien baru Slimming seperti yang dibaca dokter", () => {
    const sections = describeAnswers(slimmingNewPatient);
    expect(sections.map((s) => [s.title, s.step])).toEqual([
      ["Tujuan konsultasi", "U2"],
      ["Tujuan & target", "S1"],
      ["Riwayat diet", "S4"],
      ["Berat & tinggi (ukuran mandiri)", "S7"],
      ["Pola makan sehari", "S8"],
      ["Kesehatan", "K1"],
    ]);
    const lines = Object.fromEntries(sections.map((s) => [s.title, s.lines]));
    expect(lines["Tujuan konsultasi"]).toEqual(["Slimming · pasien baru"]);
    expect(lines["Riwayat diet"]).toEqual([
      "Pernah",
      "Kurangi nasi / karbo: berhasil −8 kg, naik sebagian",
      "Intermittent fasting: tidak berhasil",
    ]);
    expect(lines["Berat & tinggi (ukuran mandiri)"]).toEqual(["72 kg · 158 cm · IMT 28,8"]);
    expect(lines["Pola makan sehari"]).toEqual(["Pagi: Nasi kuning, teh manis", "Siang: Nasi, ikan bakar"]);
    expect(lines["Kesehatan"]).toEqual([
      "Darah tinggi: Amlodipine 5 mg, 1× sehari",
      "Diabetes: tidak minum obat",
      "Obat/suplemen lain: Vitamin D, pil KB",
      "Alergi: Amoxicillin (gatal-gatal)",
      "Hamil/menyusui: Tidak",
    ]);
  });

  it("merangkum Aesthetic dan Belum yakin", () => {
    const aesthetic = Object.fromEntries(describeAnswers(aestheticNewPatient).map((s) => [s.title, s.lines]));
    expect(aesthetic["Keluhan kulit"]).toEqual([
      "Keluhan: Jerawat & bekasnya, Pori-pori besar",
      "Jenis kulit: Berminyak",
      "Lama keluhan: 3–12 bulan",
    ]);
    expect(aesthetic["Perawatan sebelumnya"]).toEqual([
      "Treatment: Facial / peeling",
      "Skincare: Sabun cuci muka, sunscreen",
    ]);
    expect(aesthetic["Kesehatan"][0]).toBe("Riwayat penyakit: tidak ada");

    const unsure = describeAnswers(unsureNewPatient);
    expect(unsure[1]).toEqual({
      title: "Cerita pasien",
      step: "B1",
      lines: ["Ingin konsultasi soal berat badan dan jerawat."],
    });
  });

  it("merangkum kuis pendek pasien lama beserta aktivitasnya", () => {
    const sections = Object.fromEntries(describeAnswers(slimmingReturningPatient).map((s) => [s.title, s.lines]));
    expect(sections["Tujuan konsultasi"]).toEqual(["Slimming · pasien lama"]);
    expect(sections["Kunjungan ini"]).toEqual([
      "Berat turun 2 kg, sering lapar malam.",
      "Ada perubahan penyakit atau obat",
    ]);
    expect(sections["Aktivitas kemarin"][0]).toBe("06.00 · Kapsul/obat · Kapsul M");
  });
});
```

Run: `npx vitest run tests/unit/kuis/describe.test.ts`
Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 2: Implementasi**

`src/lib/kuis/v1/describe.ts`:

```ts
import { minutesToTimeLabel } from "@/lib/time";
import type { ActivityEntry, QuizAnswers } from "./answers";
import {
  ACTIVITY_FIRST_HOUR,
  ACTIVITY_KINDS,
  ACTIVITY_LAST_HOUR,
  BODY_AREAS,
  COMPLAINT_DURATIONS,
  DIET_HISTORY,
  MEALS,
  PREGNANCY,
  PRIOR_TREATMENTS,
  PURPOSES,
  SKIN_COMPLAINTS,
  SKIN_TYPES,
  SLIMMING_GOALS,
  WEIGHT_AFTER_DIET,
  WEIGHT_TARGETS,
} from "./options";
import { conditionName, dietProgramName, selectedConditions, type StepId } from "./steps";

export type IntakeSection = { title: string; step: StepId; lines: string[] };

const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** 28.8 → "28,8" — tanda desimal Indonesia. */
export function formatDecimal(value: number): string {
  return decimal.format(value);
}

export function bodyMassIndex(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

export type ActivityRow = {
  hour: number;
  label: string;
  entries: { kindLabel: string; text: string }[];
};

/** Tabel 06.00–22.00 yang dilihat dokter (K7); jam tanpa catatan tetap tampil kosong. */
export function activityTable(activities: ActivityEntry[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (let hour = ACTIVITY_FIRST_HOUR; hour <= ACTIVITY_LAST_HOUR; hour++) {
    rows.push({
      hour,
      label: minutesToTimeLabel(hour * 60),
      entries: activities
        .filter((entry) => entry.hour === hour)
        .map((entry) => ({ kindLabel: ACTIVITY_KINDS[entry.kind], text: entry.text })),
    });
  }
  return rows;
}

function labels<T extends Record<string, string>>(map: T, keys: readonly (keyof T)[] | undefined): string {
  return (keys ?? []).map((key) => map[key]).join(", ");
}

/**
 * Jawaban per bagian dalam kalimat yang dibaca pasien (layar Ringkasan) dan
 * dokter (halaman isian). `step` menunjuk layar pertama bagian itu — dipakai
 * tombol "Ubah" di Ringkasan.
 */
export function describeAnswers(a: QuizAnswers): IntakeSection[] {
  const sections: IntakeSection[] = [];
  if (!a.purpose || !a.patientType) return sections;

  sections.push({
    title: "Tujuan konsultasi",
    step: "U2",
    lines: [`${PURPOSES[a.purpose]} · ${a.patientType === "LAMA" ? "pasien lama" : "pasien baru"}`],
  });

  const s = a.slimming;
  if (s) {
    sections.push({
      title: "Tujuan & target",
      step: "S1",
      lines: [
        s.goal && `Tujuan utama: ${SLIMMING_GOALS[s.goal]}`,
        s.weightTarget && `Target turun: ${WEIGHT_TARGETS[s.weightTarget]}`,
        s.areas?.length && `Area: ${labels(BODY_AREAS, s.areas)}`,
      ].filter((line): line is string => Boolean(line)),
    });

    const dietLines = s.dietHistory ? [DIET_HISTORY[s.dietHistory]] : [];
    for (const program of s.dietPrograms ?? []) {
      const result = s.dietResults?.[program];
      const name = dietProgramName(a, program);
      if (result?.outcome === "BERHASIL") {
        const after = result.weightAfter ? `, ${WEIGHT_AFTER_DIET[result.weightAfter].toLowerCase()}` : "";
        dietLines.push(`${name}: berhasil −${formatDecimal(result.lostKg ?? 0)} kg${after}`);
      } else if (result?.outcome === "MASIH_JALAN") {
        dietLines.push(`${name}: masih jalan −${formatDecimal(result.lostKg ?? 0)} kg`);
      } else if (result?.outcome === "TIDAK_BERHASIL") {
        dietLines.push(`${name}: tidak berhasil`);
      }
    }
    sections.push({ title: "Riwayat diet", step: "S4", lines: dietLines });

    if (s.weightKg !== undefined && s.heightCm !== undefined) {
      sections.push({
        title: "Berat & tinggi (ukuran mandiri)",
        step: "S7",
        lines: [
          `${formatDecimal(s.weightKg)} kg · ${formatDecimal(s.heightCm)} cm · IMT ${formatDecimal(bodyMassIndex(s.weightKg, s.heightCm))}`,
        ],
      });
    }

    sections.push({
      title: "Pola makan sehari",
      step: "S8",
      lines: (Object.keys(MEALS) as (keyof typeof MEALS)[])
        .filter((meal) => s.foodRecall?.[meal])
        .map((meal) => `${MEALS[meal]}: ${s.foodRecall?.[meal]}`),
    });
  }

  const ae = a.aesthetic;
  if (ae) {
    const complaints = (ae.complaints ?? []).map((c) =>
      c === "LAINNYA" && ae.complaintOther ? ae.complaintOther : SKIN_COMPLAINTS[c],
    );
    sections.push({
      title: "Keluhan kulit",
      step: "A1",
      lines: [
        `Keluhan: ${complaints.join(", ")}`,
        ae.skinType && `Jenis kulit: ${SKIN_TYPES[ae.skinType]}`,
        ae.duration && `Lama keluhan: ${COMPLAINT_DURATIONS[ae.duration]}`,
      ].filter((line): line is string => Boolean(line)),
    });
    const treatments = (ae.priorTreatments ?? []).map((t) =>
      t === "LAINNYA" && ae.priorTreatmentOther ? ae.priorTreatmentOther : PRIOR_TREATMENTS[t],
    );
    sections.push({
      title: "Perawatan sebelumnya",
      step: "A4",
      lines: [`Treatment: ${treatments.join(", ")}`, ae.skincare && `Skincare: ${ae.skincare}`].filter(
        (line): line is string => Boolean(line),
      ),
    });
  }

  if (a.unsure?.story) {
    sections.push({ title: "Cerita pasien", step: "B1", lines: [a.unsure.story] });
  }

  const r = a.returning;
  if (r) {
    sections.push({
      title: "Kunjungan ini",
      step: "P1",
      lines: [
        r.story ?? "",
        r.healthChanged ? "Ada perubahan penyakit atau obat" : "Tidak ada perubahan penyakit atau obat",
      ].filter(Boolean),
    });
  }

  const h = a.health;
  if (h) {
    const conditions = selectedConditions(a);
    const lines =
      conditions.length === 0
        ? ["Riwayat penyakit: tidak ada"]
        : conditions.map((condition) => {
            const medication = h.medications?.[condition];
            return `${conditionName(a, condition)}: ${medication?.none ? "tidak minum obat" : medication?.text ?? "-"}`;
          });
    lines.push(`Obat/suplemen lain: ${h.otherMeds?.has ? h.otherMeds.text : "tidak ada"}`);
    lines.push(`Alergi: ${h.allergies?.has ? h.allergies.text : "tidak ada"}`);
    if (h.pregnancy) lines.push(`Hamil/menyusui: ${PREGNANCY[h.pregnancy]}`);
    sections.push({ title: "Kesehatan", step: "K1", lines });
  }

  if (r?.activities?.length) {
    sections.push({
      title: "Aktivitas kemarin",
      step: "P3",
      lines: [...r.activities]
        .sort((x, y) => x.hour - y.hour)
        .map((entry) => `${minutesToTimeLabel(entry.hour * 60)} · ${ACTIVITY_KINDS[entry.kind]} · ${entry.text}`),
    });
  }

  return sections;
}
```

- [ ] **Step 3: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/kuis/describe.test.ts && npx tsc --noEmit`
Expected: PASS dan tanpa galat tipe.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kuis/v1/describe.ts tests/unit/kuis/describe.test.ts
git commit -m "feat: describe quiz answers for the summary and doctor view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Versi Kebijakan Privasi dan teks tentang kuis & biaya booking

**Files:**
- Create: `src/lib/privacy.ts`
- Modify: `src/app/(public)/kebijakan-privasi/page.tsx`
- Test: `tests/unit/components/privacy-page.test.tsx`

**Interfaces:**
- Produces: `PRIVACY_POLICY_VERSION = "2026-09-28"` dan `PRIVACY_POLICY_VERSION_LABEL = "28 September 2026"`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/privacy-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPolicyPage from "@/app/(public)/kebijakan-privasi/page";

describe("halaman Kebijakan Privasi", () => {
  it("menyebut versi yang disetujui pasien saat mendaftar", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/Versi 28 September 2026/)).toBeInTheDocument();
  });

  it("menjelaskan kuis pendaftaran dan biaya booking", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole("heading", { name: "Kuis pendaftaran" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Biaya booking" })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/components/privacy-page.test.tsx`
Expected: FAIL. Teks versi dan kedua judul belum ada.

- [ ] **Step 2: Implementasi**

`src/lib/privacy.ts`:

```ts
/**
 * Versi Kebijakan Privasi yang berlaku. Naikkan setiap kali isi kebijakan
 * berubah — versi yang disetujui pasien disimpan di Intake.consentVersion,
 * jadi klinik selalu tahu teks mana yang disetujui tiap pasien (UU PDP).
 */
export const PRIVACY_POLICY_VERSION = "2026-09-28";
export const PRIVACY_POLICY_VERSION_LABEL = "28 September 2026";
```

Di `src/app/(public)/kebijakan-privasi/page.tsx`:

1. Tambahkan import `import { PRIVACY_POLICY_VERSION_LABEL } from "@/lib/privacy";`.
2. Tepat di bawah `<h1 …>Kebijakan Privasi</h1>`, tambahkan:

```tsx
      <p className="mt-2 text-sm text-brown-600">Versi {PRIVACY_POLICY_VERSION_LABEL}</p>
```

3. Ganti paragraf di bagian "Data yang kami kumpulkan" dengan:

```tsx
          <p className="mt-2">
            Kami menerima data pribadi Anda ketika Anda mendaftar lewat situs ini, menghubungi kami
            lewat WhatsApp, atau datang ke klinik: nama, nomor WhatsApp, tanggal lahir, jenis
            kelamin, pekerjaan, alamat, serta informasi kesehatan yang Anda isi di kuis pendaftaran
            atau sampaikan kepada dokter. Situs ini tidak mengumpulkan data pribadi secara otomatis.
          </p>
```

4. Tambahkan dua bagian ini tepat **setelah** `</section>` milik bagian "Data kesehatan":

```tsx
        <section>
          <h2 className="font-display text-2xl text-brown-900">Kuis pendaftaran</h2>
          <p className="mt-2">
            Jawaban kuis — keluhan, tujuan, riwayat penyakit dan obat, alergi, riwayat diet, pola
            makan, dan aktivitas harian — dikirim ke klinik hanya setelah Anda menekan tombol Kirim
            dan menyetujui kebijakan ini. Sebelum itu jawaban hanya tersimpan sementara di browser
            Anda dan terhapus saat tab ditutup. Jawaban dibaca dokter untuk mempersiapkan
            konsultasi dan menjadi bagian dari rekam medis Anda. Petugas pendaftaran hanya melihat
            data diri Anda, bukan jawaban kesehatan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Biaya booking</h2>
          <p className="mt-2">
            Jadwal dari situs, WhatsApp, atau telepon dikunci dengan biaya booking yang
            ditransfer ke rekening klinik. Biaya ini terpisah dari biaya layanan, tidak
            dikembalikan, dan tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelum
            jadwal. Booking dari situs yang belum dikonfirmasi dalam 24 jam dibatalkan otomatis.
          </p>
        </section>
```

Run: `npx vitest run tests/unit/components/privacy-page.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/privacy.ts "src/app/(public)/kebijakan-privasi/page.tsx" tests/unit/components/privacy-page.test.tsx
git commit -m "docs: version the privacy policy and cover the quiz and booking fee

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ketersediaan publik dan penahanan slot

**Files:**
- Create: `src/lib/booking-rules.ts`
- Create: `src/server/db-errors.ts`
- Create: `src/server/availability.ts`
- Create: `src/server/public-booking-data.ts`
- Create: `src/server/public-booking.ts`
- Modify: `src/server/schedule.ts` (pindahkan `computeAvailability` dan `BLOCKING_STATUSES`)
- Modify: `src/server/appointment.ts` (impor `isExclusionViolation`)
- Create: `tests/integration/public-booking-world.ts`
- Test: `tests/unit/booking-rules.test.ts`, `tests/integration/public-slots.test.ts`

**Interfaces:**
- Consumes: `expireStaleSiteBookings` (Task 2), `getClinicSetting` (Task 3), `guardRate` dan `createRateLimiter` (Task 4).
- Produces:
  - `HOLD_MINUTES`, `PUBLIC_MIN_LEAD_MINUTES`, `PUBLIC_MAX_DAYS_AHEAD`, `PATIENT_CHANGE_CUTOFF_MINUTES`, `CONSULTATION_SERVICE_SLUG`, `SLIMMING_CATEGORY_SLUG`;
  - `isBookableDate(date: string, now: Date): boolean` dan `canPatientChange(startAt: Date, now: Date): boolean`;
  - `isExclusionViolation(error)` dan `isUniqueViolation(error)`;
  - `computeAvailability(input: AvailabilityInput, options: { minLeadMinutes: number; holds?: { excludeToken: string | null } }): Promise<SlotOption[]>`;
  - `getBookingOptions(): Promise<BookingOptions>`, beserta tipe `BookingOptions`, `PublicService`, `PublicStaff`, `PublicBranch`;
  - `getPublicSlots(input: { serviceId; staffId: string | null; branchId; date; holdToken: string | null }): Promise<ActionResult<PublicSlot[]>>`;
  - `holdSlot(input: { serviceId; staffId; branchId; startAt: string; previousToken: string | null }): Promise<ActionResult<SlotHoldReceipt>>`;
  - `type PublicSlot = SlotOption & { staffId: string; staffName: string }` dan `type SlotHoldReceipt = { token: string; expiresAt: Date }`;
  - helper uji `createBookingWorld(slug)`, `cleanupBookingWorld(slug)`, `bookableDate()`, `at(date, "HH:MM")`.

- [ ] **Step 1: Tulis uji aturan tanggal yang gagal**

`tests/unit/booking-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canPatientChange, isBookableDate } from "@/lib/booking-rules";

// Senin 28 Sep 2026 pukul 23.30 WITA = 15.30 UTC.
const NOW = new Date("2026-09-28T15:30:00Z");

describe("isBookableDate", () => {
  it("menerima hari ini sampai 30 hari ke depan menurut WITA", () => {
    expect(isBookableDate("2026-09-28", NOW)).toBe(true);
    expect(isBookableDate("2026-10-28", NOW)).toBe(true);
  });

  it("menolak kemarin, hari ke-31, dan format yang salah", () => {
    expect(isBookableDate("2026-09-27", NOW)).toBe(false);
    expect(isBookableDate("2026-10-29", NOW)).toBe(false);
    expect(isBookableDate("28-09-2026", NOW)).toBe(false);
  });
});

describe("canPatientChange", () => {
  it("mengizinkan batal atau pindah paling lambat 2 jam sebelum jadwal", () => {
    expect(canPatientChange(new Date("2026-09-28T17:30:00Z"), NOW)).toBe(true);
    expect(canPatientChange(new Date("2026-09-28T17:29:00Z"), NOW)).toBe(false);
  });
});
```

Run: `npx vitest run tests/unit/booking-rules.test.ts`
Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 2: Implementasi aturan booking**

`src/lib/booking-rules.ts`:

```ts
import { addDaysToDateString, witaDateString } from "./time";

/** Aturan booking publik (PRD F4, spec pendaftaran pasien 3.1). */
export const HOLD_MINUTES = 10;
export const PUBLIC_MIN_LEAD_MINUTES = 120;
export const PUBLIC_MAX_DAYS_AHEAD = 30;
/** Pasien boleh batal/pindah jadwal paling lambat sekian menit sebelum jadwal (F6, K16). */
export const PATIENT_CHANGE_CUTOFF_MINUTES = 120;

/** Pasien baru selalu memesan layanan ini (K9). */
export const CONSULTATION_SERVICE_SLUG = "konsultasi-dokter";
/** Layanan kategori ini tidak ditawarkan sebagai treatment untuk pasien Aesthetic lama. */
export const SLIMMING_CATEGORY_SLUG = "slimming";

/** Tanggal WITA "YYYY-MM-DD" yang boleh dipilih pasien: hari ini s/d 30 hari ke depan. */
export function isBookableDate(date: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = witaDateString(now);
  return date >= today && date <= addDaysToDateString(today, PUBLIC_MAX_DAYS_AHEAD);
}

export function canPatientChange(startAt: Date, now: Date): boolean {
  return startAt.getTime() - now.getTime() >= PATIENT_CHANGE_CUTOFF_MINUTES * 60_000;
}
```

Run: `npx vitest run tests/unit/booking-rules.test.ts`
Expected: PASS.

- [ ] **Step 3: Pindahkan deteksi galat basis data dan perhitungan slot ke modul biasa**

`src/server/db-errors.ts` berisi fungsi `isExclusionViolation` yang **dipindah apa adanya** dari `src/server/appointment.ts`, lengkap dengan komentarnya. Tambahkan juga `isUniqueViolation`:

```ts
import { Prisma } from "@prisma/client";

/**
 * Kode Postgres untuk pelanggaran exclusion constraint adalah "23P01".
 * Setiap tempat yang bisa memicu exclusion constraint Appointment atau
 * SlotHold menerjemahkannya lewat fungsi ini — galat SQL mentah tidak boleh
 * sampai ke layar.
 */
export function isExclusionViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      typeof error.meta?.code === "string" &&
      error.meta.code === "23P01") ||
    (error instanceof Error && error.message.includes("23P01"))
  );
}

/** Pelanggaran batasan unik (Prisma P2002), mis. kode booking atau submissionKey kembar. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
```

Di `src/server/appointment.ts`:
- hapus fungsi `isExclusionViolation` beserta komentarnya;
- hapus `import { Prisma } from "@prisma/client";` bila tidak dipakai lagi;
- tambahkan `import { isExclusionViolation } from "@/server/db-errors";`.

`src/server/availability.ts` berisi `computeAvailability` dan `BLOCKING_STATUSES` yang dipindah dari `src/server/schedule.ts`, ditambah dukungan hold:

```ts
import { getAvailableSlots, type SlotOption } from "@/lib/slot";
import { combineWitaDateAndMinutes, witaWeekday } from "@/lib/time";
import { prisma } from "@/lib/db";
import { expireStaleSiteBookings } from "@/server/booking-expiry";
import { isHoliday } from "@/server/holiday";

// Status Appointment yang benar-benar memblokir slot — sejalan dengan klausa
// WHERE pada exclusion constraint di migrasi appointment_slothold_exclusion.
export const BLOCKING_STATUSES = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "HADIR"] as const;

export type AvailabilityInput = {
  staffId: string;
  branchId: string;
  date: string;
  durationMinutes: number;
};

export type AvailabilityOptions = {
  minLeadMinutes: number;
  /**
   * Jalur publik: hold aktif milik pasien lain dihitung sibuk; hold dengan
   * token ini (milik pasien yang sedang memilih) tidak. Jalur admin
   * mengabaikan hold — hold tidak mengikat admin (spec bagian 7).
   */
  holds?: { excludeToken: string | null };
};

/**
 * Menyambungkan mesin murni getAvailableSlots ke data nyata: template hari
 * itu, pengecualian, status libur, booking yang memblokir, dan (jalur
 * publik) hold aktif. Modul biasa, bukan "use server": hanya dipanggil dari
 * server action yang sudah memeriksa hak akses atau input.
 */
export async function computeAvailability(
  input: AvailabilityInput,
  options: AvailabilityOptions,
): Promise<SlotOption[]> {
  await expireStaleSiteBookings();

  const weekday = witaWeekday(new Date(`${input.date}T12:00:00Z`));
  const dayStart = combineWitaDateAndMinutes(input.date, 0);
  const dayEnd = combineWitaDateAndMinutes(input.date, 24 * 60);
  const now = new Date();

  const [template, exceptions, holiday, busyAppointments, activeHolds] = await Promise.all([
    prisma.scheduleTemplate.findUnique({
      where: { staffId_weekday: { staffId: input.staffId, weekday } },
    }),
    prisma.scheduleException.findMany({
      where: { staffId: input.staffId, date: new Date(`${input.date}T00:00:00Z`) },
    }),
    isHoliday(input.date),
    prisma.appointment.findMany({
      where: {
        staffId: input.staffId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
    }),
    options.holds
      ? prisma.slotHold.findMany({
          where: {
            staffId: input.staffId,
            expiresAt: { gt: now },
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
            ...(options.holds.excludeToken ? { token: { not: options.holds.excludeToken } } : {}),
          },
          select: { startAt: true, endAt: true },
        })
      : Promise.resolve([]),
  ]);

  return getAvailableSlots({
    date: input.date,
    durationMinutes: input.durationMinutes,
    template:
      template && template.branchId === input.branchId
        ? { startMinute: template.startMinute, endMinute: template.endMinute }
        : null,
    exceptions: exceptions.map((e) => ({
      kind: e.kind,
      startMinute: e.startMinute,
      endMinute: e.endMinute,
    })),
    isHoliday: holiday,
    busy: [...busyAppointments, ...activeHolds],
    now,
    minLeadMinutes: options.minLeadMinutes,
  });
}
```

Di `src/server/schedule.ts`:
- hapus `BLOCKING_STATUSES`, tipe `AvailabilityInput`, fungsi `computeAvailability`, dan import `expireStaleSiteBookings`;
- hapus import `getAvailableSlots`, `combineWitaDateAndMinutes`, `witaWeekday`, dan `isHoliday` bila tidak dipakai lagi (`SlotOption` tetap diimpor dari `@/lib/slot`);
- tambahkan `import { computeAvailability, type AvailabilityInput } from "@/server/availability";`;
- ubah kedua fungsi ketersediaan menjadi:

```ts
/** Untuk pendaftaran mandiri publik: paling cepat 2 jam dari sekarang, hold pasien lain dihitung sibuk. */
export async function getStaffAvailability(input: AvailabilityInput): Promise<SlotOption[]> {
  return computeAvailability(input, { minLeadMinutes: 120, holds: { excludeToken: null } });
}

/**
 * Untuk admin yang mencatat booking: tanpa batas 2 jam, karena pasien
 * walk-in dan penelepon sering minta jam terdekat (PRD F9). Slot yang
 * sudah lewat tetap tidak ditawarkan. Hold pasien tidak mengikat admin.
 */
export async function getStaffAvailabilityForAdmin(
  input: AvailabilityInput,
): Promise<SlotOption[]> {
  await requireCapability("booking:manage");
  return computeAvailability(input, { minLeadMinutes: 0 });
}
```

Run: `npx tsc --noEmit && npm run test:integration -- tests/integration/schedule.test.ts tests/integration/appointment.test.ts tests/integration/appointment-exclusion.test.ts`
Expected: tanpa galat tipe, dan uji jadwal serta booking lama tetap lulus.

- [ ] **Step 4: Tulis helper uji dan uji integrasi yang gagal**

`tests/integration/public-booking-world.ts`:

```ts
import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";

export type BookingWorld = {
  branchId: string;
  doctorId: string;
  therapistId: string;
  consultationId: string;
  treatmentId: string;
  slimmingTreatmentId: string;
};

/**
 * Cabang, dokter, dan terapis uji yang bekerja setiap hari 11.00–19.00,
 * sehingga uji tidak bergantung pada hari dalam minggu. Layanan
 * `konsultasi-dokter` dan kategori `slimming` di-upsert, karena keduanya
 * juga milik seed; sisanya memakai slug uji.
 */
export async function createBookingWorld(slug: string): Promise<BookingWorld> {
  const branch = await prisma.branch.create({
    data: {
      slug,
      name: "Cabang Publik Uji",
      address: "Alamat",
      whatsapp: "6285172228900",
      openingHours: "Setiap hari, 11.00–19.00",
      status: "AKTIF",
    },
  });
  const doctor = await prisma.staff.create({
    data: { slug: `${slug}-dokter`, name: "dr. Uji Publik", role: "DOKTER", sortOrder: 1 },
  });
  const therapist = await prisma.staff.create({
    data: { slug: `${slug}-terapis`, name: "Terapis Uji Publik", role: "TERAPIS", sortOrder: 2 },
  });
  for (const staffId of [doctor.id, therapist.id]) {
    await prisma.scheduleTemplate.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        staffId,
        branchId: branch.id,
        weekday,
        startMinute: 660,
        endMinute: 1140,
      })),
    });
  }

  const slimming = await prisma.serviceCategory.upsert({
    where: { slug: "slimming" },
    update: {},
    create: { slug: "slimming", name: "Slimming & Wellness" },
  });
  const consultation = await prisma.service.upsert({
    where: { slug: "konsultasi-dokter" },
    update: { isActive: true, requiresDoctor: true, durationMin: 30 },
    create: {
      slug: "konsultasi-dokter",
      name: "Konsultasi Dokter",
      promoPrice: 200000,
      durationMin: 30,
      requiresDoctor: true,
      categoryId: slimming.id,
    },
  });
  const aesthetic = await prisma.serviceCategory.create({
    data: { slug: `${slug}-aesthetic`, name: "Aesthetic Uji" },
  });
  const treatment = await prisma.service.create({
    data: {
      slug: `${slug}-facial`,
      name: "Facial Uji",
      promoPrice: 250000,
      durationMin: 60,
      requiresDoctor: false,
      categoryId: aesthetic.id,
    },
  });
  const slimmingTreatment = await prisma.service.create({
    data: {
      slug: `${slug}-meso`,
      name: "Meso Uji",
      promoPrice: 550000,
      durationMin: 30,
      requiresDoctor: true,
      categoryId: slimming.id,
    },
  });

  return {
    branchId: branch.id,
    doctorId: doctor.id,
    therapistId: therapist.id,
    consultationId: consultation.id,
    treatmentId: treatment.id,
    slimmingTreatmentId: slimmingTreatment.id,
  };
}

export async function cleanupBookingWorld(slug: string, patientWhatsapps: string[] = []) {
  const staff = { staff: { slug: { startsWith: slug } } };
  await prisma.intake.deleteMany({ where: { appointment: staff } });
  await prisma.appointment.deleteMany({ where: staff });
  await prisma.slotHold.deleteMany({ where: staff });
  await prisma.patient.deleteMany({ where: { whatsapp: { in: patientWhatsapps } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: `${slug}-aesthetic` } });
  await prisma.staff.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.branch.deleteMany({ where: { slug } });
}

/** Tanggal WITA paling cepat `offsetDays` hari lagi yang bukan hari libur di basis data uji. */
export async function bookableDate(offsetDays = 2): Promise<string> {
  let date = addDaysToDateString(witaDateString(new Date()), offsetDays);
  while (await prisma.holiday.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } })) {
    date = addDaysToDateString(date, 1);
  }
  return date;
}

/** Instant UTC untuk jam WITA "HH:MM" pada tanggal itu. */
export function at(date: string, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return combineWitaDateAndMinutes(date, hours * 60 + minutes);
}
```

`tests/integration/public-slots.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getPublicSlots, holdSlot } from "@/server/public-booking";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "slot-publik-uji";

describe("slot dan hold publik", () => {
  let world: BookingWorld;
  let date: string;

  beforeEach(async () => {
    await cleanupBookingWorld(SLUG);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG);
    await prisma.$disconnect();
  });

  const consultationSlots = (holdToken: string | null = null) =>
    unwrap(
      getPublicSlots({
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        date,
        holdToken,
      }),
    );

  const hold = (time: string, previousToken: string | null = null) =>
    holdSlot({
      serviceId: world.consultationId,
      staffId: world.doctorId,
      branchId: world.branchId,
      startAt: at(date, time).toISOString(),
      previousToken,
    });

  it("menawarkan setiap setengah jam dari jadwal dokter", async () => {
    const slots = await consultationSlots();
    expect(slots).toHaveLength(16);
    expect(slots[0]).toMatchObject({ label: "11.00", staffId: world.doctorId, staffName: "dr. Uji Publik" });
  });

  it("menolak tanggal kemarin dan 31 hari lagi (Review Focus 5)", async () => {
    const today = witaDateString(new Date());
    for (const day of [addDaysToDateString(today, -1), addDaysToDateString(today, 31)]) {
      const result = await getPublicSlots({
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        date: day,
        holdToken: null,
      });
      expect(result).toEqual({ ok: false, error: "Pilih tanggal antara hari ini dan 30 hari ke depan." });
    }
  });

  it("tidak menawarkan konsultasi dokter pada terapis", async () => {
    const result = await getPublicSlots({
      serviceId: world.consultationId,
      staffId: world.therapistId,
      branchId: world.branchId,
      date,
      holdToken: null,
    });
    expect(result).toEqual({ ok: false, error: "Tenaga ini tidak menangani layanan tersebut." });
  });

  it("menggabungkan tenaga yang boleh untuk 'siapa saja' tanpa jam ganda", async () => {
    const slots = await unwrap(
      getPublicSlots({ serviceId: world.treatmentId, staffId: null, branchId: world.branchId, date, holdToken: null }),
    );
    const starts = slots.map((s) => s.startAt.getTime());
    expect(new Set(starts).size).toBe(starts.length);
    expect(slots[0].staffId).toBe(world.doctorId);
  });

  it("menyembunyikan jam yang ditahan dari pasien lain, tetapi tidak dari pemegangnya", async () => {
    const { token } = await unwrap(hold("15:00"));
    const hasFifteen = (slots: { label: string }[]) => slots.some((s) => s.label === "15.00");

    expect(hasFifteen(await consultationSlots())).toBe(false);
    expect(hasFifteen(await consultationSlots(token))).toBe(true);
  });

  it("menolak menahan jam yang tidak ditawarkan (Review Focus 5)", async () => {
    for (const time of ["10:00", "15:15"]) {
      expect(await hold(time)).toEqual({ ok: false, error: "Jam ini baru saja dipilih orang lain. Pilih jam lain." });
    }
  });

  it("dua pasien tidak bisa menahan jam yang sama", async () => {
    await unwrap(hold("16:00"));
    expect(await hold("16:00")).toMatchObject({ ok: false });
  });

  it("hold kedaluwarsa tidak menghalangi, dan barisnya dibersihkan saat jam itu ditahan lagi", async () => {
    await prisma.slotHold.create({
      data: {
        token: "hold-basi-uji-0000000000",
        startAt: at(date, "17:00"),
        endAt: at(date, "17:30"),
        expiresAt: new Date(Date.now() - 60_000),
        staffId: world.doctorId,
        branchId: world.branchId,
      },
    });

    expect((await consultationSlots()).some((s) => s.label === "17.00")).toBe(true);
    await unwrap(hold("17:00"));
    expect(await prisma.slotHold.count({ where: { token: "hold-basi-uji-0000000000" } })).toBe(0);
  });

  it("memilih jam lain melepas hold sebelumnya", async () => {
    const first = await unwrap(hold("13:00"));
    const second = await unwrap(hold("13:30", first.token));

    const holds = await prisma.slotHold.findMany({ where: { staffId: world.doctorId } });
    expect(holds.map((h) => h.token)).toEqual([second.token]);
    expect(second.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
  });
});
```

Run: `npm run test:integration -- tests/integration/public-slots.test.ts`
Expected: FAIL, "Cannot find module '@/server/public-booking'".

- [ ] **Step 5: Implementasi data halaman dan aksi slot publik**

`src/server/public-booking-data.ts`:

```ts
import { prisma } from "@/lib/db";
import { CONSULTATION_SERVICE_SLUG, SLIMMING_CATEGORY_SLUG } from "@/lib/booking-rules";
import { getClinicSetting } from "@/server/clinic-setting";

export type PublicService = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  requiresDoctor: boolean;
};
export type PublicStaff = { id: string; name: string; role: "DOKTER" | "TERAPIS"; branchIds: string[] };
export type PublicBranch = { id: string; name: string; status: "AKTIF" | "SEGERA_HADIR" };
export type BookingOptions = {
  branches: PublicBranch[];
  consultation: PublicService;
  /** Treatment untuk pasien Aesthetic lama (K9): aktif, di luar kategori slimming. */
  treatments: PublicService[];
  staff: PublicStaff[];
  bookingFee: number;
};

const SERVICE_SELECT = {
  id: true,
  name: true,
  promoPrice: true,
  durationMin: true,
  requiresDoctor: true,
} as const;

function toPublicService(service: {
  id: string;
  name: string;
  promoPrice: number;
  durationMin: number;
  requiresDoctor: boolean;
}): PublicService {
  return {
    id: service.id,
    name: service.name,
    price: service.promoPrice,
    durationMin: service.durationMin,
    requiresDoctor: service.requiresDoctor,
  };
}

/**
 * Data halaman /daftar sebelum pasien memilih apa pun. Modul biasa yang
 * dipanggil server component — tidak terbuka sebagai server action. Tidak
 * memuat data pasien sama sekali.
 */
export async function getBookingOptions(): Promise<BookingOptions> {
  const [branches, consultation, treatments, staff, setting] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, status: true } }),
    prisma.service.findUniqueOrThrow({ where: { slug: CONSULTATION_SERVICE_SLUG }, select: SERVICE_SELECT }),
    prisma.service.findMany({
      where: {
        isActive: true,
        slug: { not: CONSULTATION_SERVICE_SLUG },
        category: { slug: { not: SLIMMING_CATEGORY_SLUG } },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: SERVICE_SELECT,
    }),
    prisma.staff.findMany({
      where: { isActive: true, role: { in: ["DOKTER", "TERAPIS"] } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true, scheduleTemplates: { select: { branchId: true } } },
    }),
    getClinicSetting(),
  ]);

  return {
    branches,
    consultation: toPublicService(consultation),
    treatments: treatments.map(toPublicService),
    staff: staff.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role === "TERAPIS" ? "TERAPIS" : "DOKTER",
      branchIds: [...new Set(person.scheduleTemplates.map((t) => t.branchId))],
    })),
    bookingFee: setting.bookingFee,
  };
}
```

`src/server/public-booking.ts`:

```ts
"use server";

import { randomBytes } from "node:crypto";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { HOLD_MINUTES, PUBLIC_MIN_LEAD_MINUTES, isBookableDate } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import type { SlotOption } from "@/lib/slot";
import { witaDateString } from "@/lib/time";
import { computeAvailability } from "@/server/availability";
import { isExclusionViolation } from "@/server/db-errors";
import { guardRate } from "@/server/request-guard";

// Setiap ekspor berkas ini bisa dipanggil siapa pun dari browser tanpa login.
// Karena itu setiap aksi memeriksa pembatasan laju dan inputnya sendiri.

export type PublicSlot = SlotOption & { staffId: string; staffName: string };
export type SlotHoldReceipt = { token: string; expiresAt: Date };

const slotLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const holdLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

const DATE_OUT_OF_RANGE = "Pilih tanggal antara hari ini dan 30 hari ke depan.";
const SLOT_GONE = "Jam ini baru saja dipilih orang lain. Pilih jam lain.";

async function loadServiceAndBranch(serviceId: string, branchId: string) {
  const [service, branch] = await Promise.all([
    prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, durationMin: true, requiresDoctor: true, isActive: true },
    }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { status: true } }),
  ]);
  if (!service?.isActive) throw new UserFacingError("Layanan ini tidak tersedia untuk booking.");
  if (branch?.status !== "AKTIF") throw new UserFacingError("Cabang ini belum menerima booking.");
  return service;
}

/** Tenaga yang boleh menangani layanan: dokter saja bila requiresDoctor (PRD F4a). */
async function eligibleStaff(service: { requiresDoctor: boolean }, staffId: string | null) {
  const staff = await prisma.staff.findMany({
    where: {
      isActive: true,
      role: service.requiresDoctor ? "DOKTER" : { in: ["DOKTER", "TERAPIS"] },
      ...(staffId ? { id: staffId } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  if (staff.length === 0) throw new UserFacingError("Tenaga ini tidak menangani layanan tersebut.");
  return staff;
}

export async function getPublicSlots(input: {
  serviceId: string;
  /** null = "siapa saja yang tersedia". */
  staffId: string | null;
  branchId: string;
  date: string;
  holdToken: string | null;
}): Promise<ActionResult<PublicSlot[]>> {
  return runAction(async () => {
    await guardRate(slotLimiter);
    if (!isBookableDate(input.date, new Date())) throw new UserFacingError(DATE_OUT_OF_RANGE);

    const service = await loadServiceAndBranch(input.serviceId, input.branchId);
    const staff = await eligibleStaff(service, input.staffId);

    const perStaff = await Promise.all(
      staff.map(async (person) => {
        const slots = await computeAvailability(
          { staffId: person.id, branchId: input.branchId, date: input.date, durationMinutes: service.durationMin },
          { minLeadMinutes: PUBLIC_MIN_LEAD_MINUTES, holds: { excludeToken: input.holdToken } },
        );
        return slots.map((slot) => ({ ...slot, staffId: person.id, staffName: person.name }));
      }),
    );

    // "Siapa saja": satu tombol per jam, diisi tenaga pertama (sortOrder) yang kosong.
    const byStart = new Map<number, PublicSlot>();
    for (const slots of perStaff) {
      for (const slot of slots) {
        if (!byStart.has(slot.startAt.getTime())) byStart.set(slot.startAt.getTime(), slot);
      }
    }
    return [...byStart.values()].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  });
}

export async function holdSlot(input: {
  serviceId: string;
  staffId: string;
  branchId: string;
  /** ISO string dari PublicSlot.startAt. */
  startAt: string;
  /** Hold pasien ini sebelumnya — dilepas saat ia memilih jam lain. */
  previousToken: string | null;
}): Promise<ActionResult<SlotHoldReceipt>> {
  return runAction(async () => {
    await guardRate(holdLimiter);

    const startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime())) throw new UserFacingError(SLOT_GONE);
    const now = new Date();
    const date = witaDateString(startAt);
    if (!isBookableDate(date, now)) throw new UserFacingError(DATE_OUT_OF_RANGE);

    const service = await loadServiceAndBranch(input.serviceId, input.branchId);
    const [staff] = await eligibleStaff(service, input.staffId);

    // Hanya jam yang memang ditawarkan boleh ditahan: permintaan buatan tidak
    // bisa menahan jam di luar jadwal, di antara grid, atau kurang dari 2 jam lagi.
    const offered = await computeAvailability(
      { staffId: staff.id, branchId: input.branchId, date, durationMinutes: service.durationMin },
      { minLeadMinutes: PUBLIC_MIN_LEAD_MINUTES, holds: { excludeToken: input.previousToken } },
    );
    const slot = offered.find((candidate) => candidate.startAt.getTime() === startAt.getTime());
    if (!slot) throw new UserFacingError(SLOT_GONE);

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);

    try {
      await prisma.$transaction([
        // Hold basi tetap ikut exclusion constraint sampai barisnya dihapus
        // (catatan risiko Plan 3a) — bersihkan milik tenaga ini lebih dulu.
        prisma.slotHold.deleteMany({ where: { staffId: staff.id, expiresAt: { lte: now } } }),
        ...(input.previousToken ? [prisma.slotHold.deleteMany({ where: { token: input.previousToken } })] : []),
        prisma.slotHold.create({
          data: {
            token,
            startAt: slot.startAt,
            endAt: slot.endAt,
            expiresAt,
            staffId: staff.id,
            branchId: input.branchId,
          },
        }),
      ]);
    } catch (error) {
      if (isExclusionViolation(error)) throw new UserFacingError(SLOT_GONE);
      throw error;
    }

    return { token, expiresAt };
  });
}
```

- [ ] **Step 6: Jalankan uji dan pastikan lulus**

Run: `npm run test:integration -- tests/integration/public-slots.test.ts`
Expected: PASS (9 uji).

Run: `npx tsc --noEmit && npm run test:integration`
Expected: semua lulus.

- [ ] **Step 7: Commit**

```bash
git add src/lib/booking-rules.ts src/server/db-errors.ts src/server/availability.ts src/server/schedule.ts src/server/appointment.ts src/server/public-booking-data.ts src/server/public-booking.ts tests/unit/booking-rules.test.ts tests/integration/public-booking-world.ts tests/integration/public-slots.test.ts
git commit -m "feat: public slot lookup and 10-minute slot holds

Holds of other visitors count as busy on the public path, stale holds are
deleted in the same transaction that takes the slot, and only slots the
site actually offers can be held.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Kirim pendaftaran dari situs

**Files:**
- Modify: `src/lib/whatsapp.ts` (`maskWhatsapp`, `siteBookingWhatsAppMessage`, `rescheduleRequestMessage`)
- Modify: `src/server/public-booking.ts` (`submitSiteBooking`)
- Test: `tests/unit/whatsapp-booking.test.ts`, `tests/integration/site-booking.test.ts`

**Interfaces:**
- Consumes: Task 3 (`getClinicSetting`, `bookingFeeFor`, `formatBankAccount`), Task 5–6 (`validateQuizAnswers`, `validateIdentity`, `QUIZ_VERSION`), Task 8 (`PRIVACY_POLICY_VERSION`), dan Task 9.
- Produces:
  - `maskWhatsapp(normalized: string): string`;
  - `siteBookingWhatsAppMessage(input): string`;
  - `rescheduleRequestMessage(input: { code: string; dateLabel: string; timeLabel: string }): string`;
  - `type SiteBookingInput = { holdToken; serviceId; staffId; branchId; startAt: string; answers: unknown; identity: unknown; consentData: boolean; consentFee: boolean; website: string }`;
  - `type BookingReceipt = { code; patientName; serviceName; staffName; branchName; startAt: Date; bookingFee: number | null; bankAccount: string | null; confirmationLink: string }`;
  - `type SubmitOutcome = { kind: "booked"; receipt: BookingReceipt } | { kind: "slot-taken" }`;
  - `submitSiteBooking(input: SiteBookingInput): Promise<ActionResult<SubmitOutcome>>`.

- [ ] **Step 1: Tulis uji pesan WA yang gagal**

`tests/unit/whatsapp-booking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maskWhatsapp, rescheduleRequestMessage, siteBookingWhatsAppMessage } from "@/lib/whatsapp";

describe("maskWhatsapp", () => {
  it("menyamarkan bagian tengah nomor", () => {
    expect(maskWhatsapp("6281234567890")).toBe("0812-****-7890");
  });
});

describe("siteBookingWhatsAppMessage", () => {
  const base = {
    patientName: "Siti Rahayu",
    code: "SDY-8F3K",
    serviceName: "Konsultasi Dokter",
    staffName: "Dr. Diane Paparang, Sp.GK, AIFO-K",
    branchName: "SunDY Mahakeret",
    dateLabel: "Kamis, 1 Oktober 2026",
    timeLabel: "15.00",
  };

  it("mengantar bukti transfer biaya booking", () => {
    expect(siteBookingWhatsAppMessage({ ...base, bookingFee: 100000 })).toBe(
      "Halo SunDY Clinic, saya sudah booking Konsultasi Dokter. Kode: SDY-8F3K, atas nama Siti Rahayu, " +
        "dengan Dr. Diane Paparang, Sp.GK, AIFO-K di SunDY Mahakeret, Kamis, 1 Oktober 2026 pukul 15.00. " +
        "Berikut bukti transfer biaya booking Rp 100.000.",
    );
  });

  it("tanpa kalimat transfer bila tidak ada biaya booking", () => {
    expect(siteBookingWhatsAppMessage({ ...base, bookingFee: null })).not.toContain("transfer");
  });
});

describe("rescheduleRequestMessage", () => {
  it("menyebut kode dan jadwal lama", () => {
    expect(rescheduleRequestMessage({ code: "SDY-8F3K", dateLabel: "Kamis, 1 Oktober 2026", timeLabel: "15.00" })).toBe(
      "Halo SunDY Clinic, saya ingin pindah jadwal booking SDY-8F3K (Kamis, 1 Oktober 2026 pukul 15.00).",
    );
  });
});
```

Run: `npx vitest run tests/unit/whatsapp-booking.test.ts`
Expected: FAIL, fungsi belum ada.

- [ ] **Step 2: Implementasi pesan WA**

Di `src/lib/whatsapp.ts`, tambahkan import `import { formatRupiah } from "./format";`, lalu tambahkan di akhir berkas:

```ts
/** "6281234567890" → "0812-****-7890". Halaman publik tidak pernah menampilkan nomor utuh (PRD bagian 10). */
export function maskWhatsapp(normalized: string): string {
  const local = normalized.startsWith("62") ? `0${normalized.slice(2)}` : normalized;
  return `${local.slice(0, 4)}-****-${local.slice(-4)}`;
}

/** Pesan pasien ke klinik setelah booking di situs, untuk mengantar bukti transfer (spec 3.1). */
export function siteBookingWhatsAppMessage(input: {
  patientName: string;
  code: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  dateLabel: string;
  timeLabel: string;
  bookingFee: number | null;
}): string {
  const transfer = input.bookingFee
    ? ` Berikut bukti transfer biaya booking ${formatRupiah(input.bookingFee)}.`
    : "";
  return (
    `Halo ${CLINIC_NAME}, saya sudah booking ${input.serviceName}. Kode: ${input.code}, ` +
    `atas nama ${input.patientName}, dengan ${input.staffName} di ${input.branchName}, ` +
    `${input.dateLabel} pukul ${input.timeLabel}.${transfer}`
  );
}

/** Permintaan pindah jadwal dari /cek-booking; admin memindahkannya di panel (spec 3.3). */
export function rescheduleRequestMessage(input: { code: string; dateLabel: string; timeLabel: string }): string {
  return `Halo ${CLINIC_NAME}, saya ingin pindah jadwal booking ${input.code} (${input.dateLabel} pukul ${input.timeLabel}).`;
}
```

Run: `npx vitest run tests/unit/whatsapp-booking.test.ts tests/unit/whatsapp.test.ts`
Expected: PASS.

- [ ] **Step 3: Tulis uji integrasi Kirim yang gagal**

`tests/integration/site-booking.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { holdSlot, submitSiteBooking, type SiteBookingInput } from "@/server/public-booking";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  newPatientIdentity,
  returningPatientIdentity,
  slimmingNewPatient,
  slimmingReturningPatient,
} from "../fixtures/quiz-answers";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "kirim-situs-uji";
const PATIENT_WA = "6281234567890";

describe("Kirim pendaftaran situs", () => {
  let world: BookingWorld;
  let date: string;

  beforeEach(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.auditLog.deleteMany({ where: { action: "appointment.site-create" } });
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 100000 } });
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  async function holdFor(time: string, serviceId = world.consultationId, staffId = world.doctorId) {
    const { token } = await unwrap(
      holdSlot({ serviceId, staffId, branchId: world.branchId, startAt: at(date, time).toISOString(), previousToken: null }),
    );
    return token;
  }

  function input(token: string, time: string, overrides: Partial<SiteBookingInput> = {}): SiteBookingInput {
    return {
      holdToken: token,
      serviceId: world.consultationId,
      staffId: world.doctorId,
      branchId: world.branchId,
      startAt: at(date, time).toISOString(),
      answers: slimmingNewPatient,
      identity: newPatientIdentity,
      consentData: true,
      consentFee: true,
      website: "",
      ...overrides,
    };
  }

  it("pasien baru Slimming: booking situs tanpa pasien, isian lengkap, dan kwitansi", async () => {
    const token = await holdFor("11:00");
    const outcome = await unwrap(submitSiteBooking(input(token, "11:00")));

    expect(outcome.kind).toBe("booked");
    if (outcome.kind !== "booked") return;
    const { receipt } = outcome;
    expect(receipt).toMatchObject({
      patientName: "Siti Rahayu",
      serviceName: "Konsultasi Dokter",
      staffName: "dr. Uji Publik",
      bookingFee: 100000,
    });
    expect(receipt.code).toMatch(/^SDY-[2-9A-HJ-NP-Z]{4}$/);
    expect(decodeURIComponent(receipt.confirmationLink)).toContain(`Kode: ${receipt.code}`);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { code: receipt.code },
      include: { intake: true },
    });
    expect(appointment).toMatchObject({
      source: "SITUS",
      status: "MENUNGGU_KONFIRMASI",
      type: "KONSULTASI",
      patientId: null,
      bookingFee: 100000,
    });
    const intake = appointment.intake!;
    expect(intake).toMatchObject({
      status: "TERISI",
      kind: "LENGKAP",
      purpose: "SLIMMING",
      claimsReturning: false,
      quizVersion: 1,
      name: "Siti Rahayu",
      whatsapp: PATIENT_WA,
      gender: "P",
      consentVersion: PRIVACY_POLICY_VERSION,
      submissionKey: token,
    });
    expect(Number(intake.selfWeightKg)).toBe(72);
    expect(Number(intake.selfHeightCm)).toBe(158);
    expect((intake.answers as { slimming: Record<string, unknown> }).slimming.weightKg).toBeUndefined();
    expect(await prisma.slotHold.count({ where: { token } })).toBe(0);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: appointment.id } });
    expect(audit).toMatchObject({ action: "appointment.site-create", actorName: "Pasien (situs)" });
  });

  it("Kirim ganda dengan token yang sama menghasilkan satu booking (Review Focus 3)", async () => {
    const token = await holdFor("11:30");
    const first = await unwrap(submitSiteBooking(input(token, "11:30")));
    const second = await unwrap(submitSiteBooking(input(token, "11:30")));

    expect(first).toEqual(second);
    expect(await prisma.appointment.count({ where: { staffId: world.doctorId } })).toBe(1);
  });

  it("hold yang sudah habis tetap menjadi booking bila jamnya masih kosong (Review Focus 3)", async () => {
    const token = await holdFor("12:00");
    await prisma.slotHold.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    expect((await unwrap(submitSiteBooking(input(token, "12:00")))).kind).toBe("booked");
  });

  it("melaporkan slot terisi bila admin lebih dulu mengambil jam itu", async () => {
    const token = await holdFor("12:30");
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6604", name: "Pasien Telepon", whatsapp: PATIENT_WA },
    });
    await prisma.appointment.create({
      data: {
        code: "KIRIM-ADMIN",
        type: "KONSULTASI",
        startAt: at(date, "12:30"),
        endAt: at(date, "13:00"),
        source: "TELEPON",
        branchId: world.branchId,
        staffId: world.doctorId,
        patientId: patient.id,
      },
    });

    expect(await unwrap(submitSiteBooking(input(token, "12:30")))).toEqual({ kind: "slot-taken" });
    expect(await prisma.intake.count({ where: { submissionKey: token } })).toBe(0);
  });

  it("pasien baru hanya boleh memesan Konsultasi Dokter", async () => {
    const token = await holdFor("13:00", world.treatmentId, world.therapistId);
    const result = await submitSiteBooking(
      input(token, "13:00", { serviceId: world.treatmentId, staffId: world.therapistId }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Pasien baru mendaftar untuk Konsultasi Dokter lebih dulu. Treatment ditentukan dokter setelah pemeriksaan.",
    });
  });

  it("pasien Aesthetic lama boleh memesan treatment dengan isian pendek", async () => {
    const token = await holdFor("13:00", world.treatmentId, world.therapistId);
    const outcome = await unwrap(
      submitSiteBooking(
        input(token, "13:00", {
          serviceId: world.treatmentId,
          staffId: world.therapistId,
          answers: aestheticReturningPatient,
          identity: returningPatientIdentity,
        }),
      ),
    );
    if (outcome.kind !== "booked") throw new Error("seharusnya terbooking");

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { code: outcome.receipt.code },
      include: { intake: true },
    });
    expect(appointment.type).toBe("TREATMENT");
    expect(appointment.intake).toMatchObject({ kind: "PENDEK", purpose: "AESTHETIC", claimsReturning: true, gender: null });
  });

  it("tidak menawarkan treatment kategori slimming kepada pasien Aesthetic lama", async () => {
    const token = await holdFor("14:00", world.slimmingTreatmentId);
    const result = await submitSiteBooking(
      input(token, "14:00", {
        serviceId: world.slimmingTreatmentId,
        answers: aestheticReturningPatient,
        identity: returningPatientIdentity,
      }),
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("menyimpan tanggal 'kemarin' untuk aktivitas pasien Slimming lama", async () => {
    const token = await holdFor("14:30");
    const outcome = await unwrap(
      submitSiteBooking(input(token, "14:30", { answers: slimmingReturningPatient, identity: returningPatientIdentity })),
    );
    if (outcome.kind !== "booked") throw new Error("seharusnya terbooking");

    const intake = await prisma.intake.findFirstOrThrow({ where: { submissionKey: token } });
    const yesterday = addDaysToDateString(witaDateString(new Date()), -1);
    expect(intake.activityDate?.toISOString().slice(0, 10)).toBe(yesterday);
  });

  it("hanya menyimpan jawaban jalur yang akhirnya dipilih (Review Focus 1)", async () => {
    const token = await holdFor("15:00");
    const switched = { ...slimmingNewPatient, purpose: "AESTHETIC", aesthetic: aestheticNewPatient.aesthetic };
    await unwrap(submitSiteBooking(input(token, "15:00", { answers: switched })));

    const intake = await prisma.intake.findFirstOrThrow({ where: { submissionKey: token } });
    expect(intake.purpose).toBe("AESTHETIC");
    expect(intake.answers).not.toHaveProperty("slimming");
    expect(intake.selfWeightKg).toBeNull();
  });

  it("menolak tanpa persetujuan, dengan jawaban yang belum lengkap, atau dengan kolom jebakan terisi", async () => {
    const token = await holdFor("15:30");
    expect(await submitSiteBooking(input(token, "15:30", { consentFee: false }))).toEqual({
      ok: false,
      error: "Centang kedua persetujuan untuk melanjutkan.",
    });
    const incomplete = { ...slimmingNewPatient, health: { ...slimmingNewPatient.health, pregnancy: undefined } };
    expect(await submitSiteBooking(input(token, "15:30", { answers: incomplete }))).toEqual({
      ok: false,
      error: "Pilih salah satu.",
    });
    expect(await submitSiteBooking(input(token, "15:30", { website: "http://spam" }))).toMatchObject({ ok: false });
    expect(await prisma.appointment.count({ where: { staffId: world.doctorId } })).toBe(0);
  });
});
```

Run: `npm run test:integration -- tests/integration/site-booking.test.ts`
Expected: FAIL, `submitSiteBooking` tidak diekspor.

- [ ] **Step 4: Implementasi Kirim**

Di `src/server/public-booking.ts`, tambahkan import berikut ke daftar yang sudah ada:

```ts
import type { Prisma } from "@prisma/client";
import { generateBookingCode } from "@/lib/booking-code";
import {
  CONSULTATION_SERVICE_SLUG,
  SLIMMING_CATEGORY_SLUG,
} from "@/lib/booking-rules";
import { formatIndonesianDate } from "@/lib/format";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { validateIdentity } from "@/lib/kuis/v1/identity";
import { QUIZ_VERSION } from "@/lib/kuis/v1/options";
import { validateQuizAnswers } from "@/lib/kuis/v1/steps";
import { bookingFeeFor, formatBankAccount } from "@/lib/payment";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import { safeRevalidatePath } from "@/lib/revalidate";
import { addDaysToDateString, minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { buildWhatsAppLink, siteBookingWhatsAppMessage } from "@/lib/whatsapp";
import { recordAudit, SITE_PATIENT_ACTOR } from "@/server/audit";
import { expireStaleSiteBookings } from "@/server/booking-expiry";
import { getClinicSetting } from "@/server/clinic-setting";
import { isUniqueViolation } from "@/server/db-errors";
```

(Gabungkan import `@/lib/booking-rules`, `@/lib/time`, dan `@/server/db-errors` dengan baris yang sudah ada.)

Lalu tambahkan di akhir berkas:

```ts
export type SiteBookingInput = {
  holdToken: string;
  serviceId: string;
  staffId: string;
  branchId: string;
  /** ISO string dari slot yang ditahan. */
  startAt: string;
  answers: unknown;
  identity: unknown;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan: tersembunyi dari manusia, diisi bot. */
  website: string;
};

export type BookingReceipt = {
  code: string;
  patientName: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  startAt: Date;
  bookingFee: number | null;
  /** "BCA 123… a.n. …", atau null bila rekening belum diisi di pengaturan. */
  bankAccount: string | null;
  confirmationLink: string;
};

export type SubmitOutcome = { kind: "booked"; receipt: BookingReceipt } | { kind: "slot-taken" };

const submitLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
const GENERIC_FAILURE = "Pendaftaran gagal dikirim. Muat ulang halaman lalu coba lagi.";

async function findSubmitted(holdToken: string): Promise<string | null> {
  const intake = await prisma.intake.findUnique({
    where: { submissionKey: holdToken },
    select: { appointmentId: true },
  });
  return intake?.appointmentId ?? null;
}

async function buildReceipt(appointmentId: string): Promise<BookingReceipt> {
  const [appointment, setting] = await Promise.all([
    prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: {
        code: true,
        startAt: true,
        bookingFee: true,
        service: { select: { name: true } },
        staff: { select: { name: true } },
        branch: { select: { name: true } },
        intake: { select: { name: true } },
      },
    }),
    getClinicSetting(),
  ]);
  const patientName = appointment.intake?.name ?? "";
  const serviceName = appointment.service?.name ?? "Konsultasi Dokter";
  const timeLabel = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));

  return {
    code: appointment.code,
    patientName,
    serviceName,
    staffName: appointment.staff.name,
    branchName: appointment.branch.name,
    startAt: appointment.startAt,
    bookingFee: appointment.bookingFee,
    bankAccount: formatBankAccount(setting),
    confirmationLink: buildWhatsAppLink(
      siteBookingWhatsAppMessage({
        patientName,
        code: appointment.code,
        serviceName,
        staffName: appointment.staff.name,
        branchName: appointment.branch.name,
        dateLabel: formatIndonesianDate(appointment.startAt),
        timeLabel,
        bookingFee: appointment.bookingFee,
      }),
    ),
  };
}

/** Pasien baru dan pasien non-Aesthetic hanya memesan Konsultasi Dokter (K9). */
function assertServiceFits(service: { slug: string; category: { slug: string } }, answers: QuizAnswers) {
  if (service.slug === CONSULTATION_SERVICE_SLUG) return;
  const mayChooseTreatment = answers.patientType === "LAMA" && answers.purpose === "AESTHETIC";
  if (!mayChooseTreatment || service.category.slug === SLIMMING_CATEGORY_SLUG) {
    throw new UserFacingError(
      "Pasien baru mendaftar untuk Konsultasi Dokter lebih dulu. Treatment ditentukan dokter setelah pemeriksaan.",
    );
  }
}

/** Berat & tinggi disimpan di kolom bertipe, bukan di JSON jawaban (spec 5.1). */
function storedAnswers(answers: QuizAnswers): Prisma.InputJsonValue {
  const copy = structuredClone(answers);
  if (copy.slimming) {
    delete copy.slimming.weightKg;
    delete copy.slimming.heightCm;
  }
  return copy as Prisma.InputJsonValue;
}

/**
 * Satu transaksi: hold dilepas, booking dibuat, isian dibuat. Exclusion
 * constraint Appointment tetap jaminan akhir anti-bentrok. Kode SDY-XXXX
 * kembar (±1 per sejuta) dicoba ulang dengan kode lain.
 */
async function createSiteBooking(
  appointment: Omit<Prisma.AppointmentUncheckedCreateInput, "code">,
  intake: Omit<Prisma.IntakeUncheckedCreateInput, "appointmentId">,
  holdToken: string,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.slotHold.deleteMany({ where: { token: holdToken } });
        const created = await tx.appointment.create({
          data: { ...appointment, code: generateBookingCode() },
          select: { id: true },
        });
        await tx.intake.create({ data: { ...intake, appointmentId: created.id } });
        return created.id;
      });
    } catch (error) {
      const codeCollision = isUniqueViolation(error) && !(await findSubmitted(holdToken));
      if (codeCollision && attempt < 3) continue;
      throw error;
    }
  }
}

export async function submitSiteBooking(input: SiteBookingInput): Promise<ActionResult<SubmitOutcome>> {
  return runAction(async () => {
    await guardRate(submitLimiter);
    if (input.website) throw new UserFacingError(GENERIC_FAILURE);
    if (typeof input.holdToken !== "string" || input.holdToken.length < 16) {
      throw new UserFacingError("Pilih jadwal lebih dulu.");
    }

    // Kirim ulang (sinyal putus, tombol ditekan dua kali): kembalikan booking yang sama.
    const previous = await findSubmitted(input.holdToken);
    if (previous) return { kind: "booked", receipt: await buildReceipt(previous) };

    if (input.consentData !== true || input.consentFee !== true) {
      throw new UserFacingError("Centang kedua persetujuan untuk melanjutkan.");
    }

    const quiz = validateQuizAnswers(input.answers, { askPatientType: true });
    if (!quiz.ok) throw new UserFacingError(quiz.message);
    const answers = quiz.answers;
    const patientType = answers.patientType;
    if (!patientType) throw new UserFacingError(GENERIC_FAILURE);

    const checked = validateIdentity(input.identity, patientType);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const identity = checked.identity;

    const now = new Date();
    const startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime()) || startAt <= now || !isBookableDate(witaDateString(startAt), now)) {
      throw new UserFacingError("Jadwal ini sudah lewat. Pilih jam lain.");
    }

    const [service, staff, branch, setting] = await Promise.all([
      prisma.service.findUnique({
        where: { id: input.serviceId },
        select: {
          id: true,
          slug: true,
          durationMin: true,
          requiresDoctor: true,
          isActive: true,
          category: { select: { slug: true } },
        },
      }),
      prisma.staff.findUnique({ where: { id: input.staffId }, select: { id: true, role: true, isActive: true } }),
      prisma.branch.findUnique({ where: { id: input.branchId }, select: { status: true } }),
      getClinicSetting(),
    ]);
    if (!service?.isActive) throw new UserFacingError("Layanan ini tidak tersedia untuk booking.");
    assertServiceFits(service, answers);
    if (branch?.status !== "AKTIF") throw new UserFacingError("Cabang ini belum menerima booking.");
    const staffAllowed =
      staff?.isActive && (staff.role === "DOKTER" || (staff.role === "TERAPIS" && !service.requiresDoctor));
    if (!staff || !staffAllowed) throw new UserFacingError("Tenaga ini tidak menangani layanan tersebut.");

    await expireStaleSiteBookings(now);

    let appointmentId: string;
    try {
      appointmentId = await createSiteBooking(
        {
          type: service.slug === CONSULTATION_SERVICE_SLUG ? "KONSULTASI" : "TREATMENT",
          startAt,
          endAt: new Date(startAt.getTime() + service.durationMin * 60_000),
          source: "SITUS",
          branchId: input.branchId,
          staffId: staff.id,
          serviceId: service.id,
          patientId: null,
          bookingFee: bookingFeeFor("SITUS", setting.bookingFee),
        },
        {
          status: "TERISI",
          kind: patientType === "LAMA" ? "PENDEK" : "LENGKAP",
          purpose: answers.purpose,
          claimsReturning: patientType === "LAMA",
          quizVersion: QUIZ_VERSION,
          answers: storedAnswers(answers),
          name: identity.name,
          whatsapp: identity.whatsapp,
          birthDate: new Date(`${identity.birthDate}T00:00:00Z`),
          gender: identity.gender,
          occupation: identity.occupation,
          address: identity.address,
          selfWeightKg: answers.slimming?.weightKg,
          selfHeightCm: answers.slimming?.heightCm,
          activityDate: answers.returning?.activities
            ? new Date(`${addDaysToDateString(witaDateString(now), -1)}T00:00:00Z`)
            : null,
          consentAt: now,
          consentVersion: PRIVACY_POLICY_VERSION,
          submittedAt: now,
          submissionKey: input.holdToken,
        },
        input.holdToken,
      );
    } catch (error) {
      if (isExclusionViolation(error)) return { kind: "slot-taken" };
      // Dua Kirim bersamaan dengan token yang sama: yang kalah mengembalikan booking pemenang.
      const raced = isUniqueViolation(error) ? await findSubmitted(input.holdToken) : null;
      if (raced) return { kind: "booked", receipt: await buildReceipt(raced) };
      throw error;
    }

    const receipt = await buildReceipt(appointmentId);
    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "appointment.site-create",
      entity: "Appointment",
      entityId: appointmentId,
      summary: `${receipt.code} — ${startAt.toISOString()}`,
    });
    safeRevalidatePath("/admin/booking");
    return { kind: "booked", receipt };
  });
}
```

- [ ] **Step 5: Jalankan uji dan pastikan lulus**

Run: `npm run test:integration -- tests/integration/site-booking.test.ts`
Expected: PASS (10 uji).

Run: `npx tsc --noEmit && npm run lint`
Expected: tanpa galat.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp.ts src/server/public-booking.ts tests/unit/whatsapp-booking.test.ts tests/integration/site-booking.test.ts
git commit -m "feat: submit a site booking with its intake in one transaction

The booking has no patient until an admin matches it. Resubmitting with
the same hold token returns the same booking, an expired hold still books
a free slot, and a slot taken meanwhile is reported, not raised.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Cek status dan batal dari situs

**Files:**
- Modify: `src/server/public-booking.ts` (`findBookingStatus`, `cancelSiteBooking`)
- Test: `tests/integration/booking-status.test.ts`

**Interfaces:**
- Consumes: Task 9–10, `STATUS_LABEL` dari `src/lib/appointment-status.ts`, dan `canPatientChange`.
- Produces:
  - `type PublicBookingStatus = { code; status: AppointmentStatusValue; statusLabel; serviceName; staffName; branchName; startAt: Date; maskedWhatsapp; bookingFee: number | null; canCancel: boolean; canReschedule: boolean; rescheduleLink: string | null }`;
  - `findBookingStatus(input: { code: string; last4: string }): Promise<ActionResult<PublicBookingStatus | null>>`;
  - `cancelSiteBooking(input: { code: string; last4: string }): Promise<ActionResult<PublicBookingStatus>>`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/integration/booking-status.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { cancelSiteBooking, findBookingStatus, holdSlot, submitSiteBooking } from "@/server/public-booking";
import { newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "status-situs-uji";
const PATIENT_WA = "6281234567890";

describe("cek status dan batal dari situs", () => {
  let world: BookingWorld;
  let date: string;

  beforeEach(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  async function bookAt(time: string, whatsapp = newPatientIdentity.whatsapp) {
    const { token } = await unwrap(
      holdSlot({
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        startAt: at(date, time).toISOString(),
        previousToken: null,
      }),
    );
    const outcome = await unwrap(
      submitSiteBooking({
        holdToken: token,
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        startAt: at(date, time).toISOString(),
        answers: slimmingNewPatient,
        identity: { ...newPatientIdentity, whatsapp },
        consentData: true,
        consentFee: true,
        website: "",
      }),
    );
    if (outcome.kind !== "booked") throw new Error("seharusnya terbooking");
    return outcome.receipt.code;
  }

  it("menemukan booking dengan kode dan 4 digit terakhir WA, apa pun cara nomornya diketik (Review Focus 4)", async () => {
    const code = await bookAt("11:00", "+62 812-3456-7890");

    const status = await unwrap(findBookingStatus({ code: code.toLowerCase(), last4: "7890" }));
    expect(status).toMatchObject({
      code,
      status: "MENUNGGU_KONFIRMASI",
      statusLabel: "Menunggu Konfirmasi",
      serviceName: "Konsultasi Dokter",
      maskedWhatsapp: "0812-****-7890",
      bookingFee: 100000,
      canCancel: true,
      canReschedule: false,
      rescheduleLink: null,
    });
    // Tidak ada data klinis di jawaban publik.
    expect(JSON.stringify(status)).not.toMatch(/Amlodipine|slimming|answers/i);
  });

  it("memberi jawaban yang sama untuk kode salah dan 4 digit salah", async () => {
    const code = await bookAt("11:30");
    expect(await unwrap(findBookingStatus({ code, last4: "0000" }))).toBeNull();
    expect(await unwrap(findBookingStatus({ code: "SDY-ZZZZ", last4: "7890" }))).toBeNull();
    expect(await findBookingStatus({ code, last4: "78" })).toEqual({
      ok: false,
      error: "Isi kode booking dan 4 digit terakhir nomor WhatsApp.",
    });
  });

  it("menawarkan pindah jadwal setelah booking diverifikasi", async () => {
    const code = await bookAt("12:00");
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6605", name: "Siti Rahayu", whatsapp: PATIENT_WA },
    });
    await prisma.appointment.update({ where: { code }, data: { patientId: patient.id, status: "TERKONFIRMASI" } });

    const status = await unwrap(findBookingStatus({ code, last4: "7890" }));
    expect(status).toMatchObject({ canCancel: true, canReschedule: true });
    expect(decodeURIComponent(status!.rescheduleLink!)).toContain(`pindah jadwal booking ${code}`);
  });

  it("membatalkan booking dan mencatat pasien sebagai pelaku", async () => {
    const code = await bookAt("12:30");

    const cancelled = await unwrap(cancelSiteBooking({ code, last4: "7890" }));
    expect(cancelled).toMatchObject({ status: "DIBATALKAN", canCancel: false });

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { code }, include: { intake: true } });
    expect(appointment.intake).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: appointment.id, action: "appointment.cancel-by-patient" },
    });
    expect(audit.actorName).toBe("Pasien (situs)");
  });

  it("menolak pembatalan kurang dari 2 jam sebelum jadwal", async () => {
    const soon = new Date(Date.now() + 60 * 60_000);
    const appointment = await prisma.appointment.create({
      data: {
        code: "STATUS-DEKAT",
        type: "KONSULTASI",
        startAt: soon,
        endAt: new Date(soon.getTime() + 30 * 60_000),
        source: "SITUS",
        branchId: world.branchId,
        staffId: world.doctorId,
        patientId: null,
      },
    });
    await prisma.intake.create({
      data: { appointmentId: appointment.id, status: "TERISI", kind: "LENGKAP", whatsapp: PATIENT_WA },
    });

    expect(await cancelSiteBooking({ code: "STATUS-DEKAT", last4: "7890" })).toEqual({
      ok: false,
      error: "Pembatalan lewat situs hanya sampai 2 jam sebelum jadwal. Hubungi kami lewat WhatsApp.",
    });
  });

  it("menemukan booking yang dicatat admin lewat nomor WA pasiennya", async () => {
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6606", name: "Pasien Telepon", whatsapp: PATIENT_WA },
    });
    await prisma.appointment.create({
      data: {
        code: "STATUS-ADMIN",
        type: "KONSULTASI",
        startAt: at(date, "16:00"),
        endAt: at(date, "16:30"),
        source: "TELEPON",
        branchId: world.branchId,
        staffId: world.doctorId,
        patientId: patient.id,
      },
    });

    expect(await unwrap(findBookingStatus({ code: "STATUS-ADMIN", last4: "7890" }))).toMatchObject({
      code: "STATUS-ADMIN",
      maskedWhatsapp: "0812-****-7890",
    });
  });
});
```

Run: `npm run test:integration -- tests/integration/booking-status.test.ts`
Expected: FAIL, fungsi belum diekspor.

- [ ] **Step 2: Implementasi**

Di `src/server/public-booking.ts`, tambahkan import:

```ts
import { STATUS_LABEL, type AppointmentStatusValue } from "@/lib/appointment-status";
import { buildWhatsAppLink, maskWhatsapp, rescheduleRequestMessage, siteBookingWhatsAppMessage } from "@/lib/whatsapp";
import { canPatientChange } from "@/lib/booking-rules";
```

(Gabungkan dengan baris import `@/lib/whatsapp` dan `@/lib/booking-rules` yang sudah ada.)

Lalu tambahkan di akhir berkas:

```ts
export type PublicBookingStatus = {
  code: string;
  status: AppointmentStatusValue;
  statusLabel: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  startAt: Date;
  maskedWhatsapp: string;
  bookingFee: number | null;
  canCancel: boolean;
  canReschedule: boolean;
  rescheduleLink: string | null;
};

const lookupLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const cancelLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

const ACTIVE: AppointmentStatusValue[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

function parseLookup(input: { code: string; last4: string }) {
  const code = String(input.code ?? "").trim().toUpperCase();
  const last4 = String(input.last4 ?? "").trim();
  if (!code || !/^\d{4}$/.test(last4)) {
    throw new UserFacingError("Isi kode booking dan 4 digit terakhir nomor WhatsApp.");
  }
  return { code, last4 };
}

/**
 * Booking yang cocok dengan kode DAN 4 digit terakhir WA, atau null.
 * Kode salah dan digit salah sengaja memberi jawaban yang sama, agar kode
 * orang lain tidak bisa ditebak lewat perbedaan pesan (PRD F6).
 */
async function findOwnBooking(code: string, last4: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      status: true,
      startAt: true,
      bookingFee: true,
      service: { select: { name: true } },
      staff: { select: { name: true } },
      branch: { select: { name: true } },
      patient: { select: { whatsapp: true } },
      intake: { select: { whatsapp: true } },
    },
  });
  const whatsapp = appointment?.patient?.whatsapp ?? appointment?.intake?.whatsapp;
  if (!appointment || !whatsapp || !whatsapp.endsWith(last4)) return null;
  return { ...appointment, whatsapp };
}

function toPublicStatus(
  booking: NonNullable<Awaited<ReturnType<typeof findOwnBooking>>>,
  now: Date,
): PublicBookingStatus {
  const changeable = canPatientChange(booking.startAt, now);
  const canReschedule = booking.status === "TERKONFIRMASI" && changeable;
  return {
    code: booking.code,
    status: booking.status,
    statusLabel: STATUS_LABEL[booking.status],
    serviceName: booking.service?.name ?? "Konsultasi Dokter",
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    startAt: booking.startAt,
    maskedWhatsapp: maskWhatsapp(booking.whatsapp),
    bookingFee: booking.bookingFee,
    canCancel: ACTIVE.includes(booking.status) && changeable,
    canReschedule,
    rescheduleLink: canReschedule
      ? buildWhatsAppLink(
          rescheduleRequestMessage({
            code: booking.code,
            dateLabel: formatIndonesianDate(booking.startAt),
            timeLabel: minutesToTimeLabel(witaMinutesOfDay(booking.startAt)),
          }),
        )
      : null,
  };
}

export async function findBookingStatus(input: {
  code: string;
  last4: string;
}): Promise<ActionResult<PublicBookingStatus | null>> {
  return runAction(async () => {
    await guardRate(lookupLimiter);
    const { code, last4 } = parseLookup(input);
    await expireStaleSiteBookings();
    const booking = await findOwnBooking(code, last4);
    return booking ? toPublicStatus(booking, new Date()) : null;
  });
}

export async function cancelSiteBooking(input: {
  code: string;
  last4: string;
}): Promise<ActionResult<PublicBookingStatus>> {
  return runAction(async () => {
    await guardRate(cancelLimiter);
    const { code, last4 } = parseLookup(input);
    await expireStaleSiteBookings();

    const booking = await findOwnBooking(code, last4);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan. Periksa kode dan nomor WhatsApp.");
    const now = new Date();
    if (!ACTIVE.includes(booking.status)) {
      throw new UserFacingError(`Booking ini sudah berstatus ${STATUS_LABEL[booking.status].toLowerCase()}.`);
    }
    if (!canPatientChange(booking.startAt, now)) {
      throw new UserFacingError(
        "Pembatalan lewat situs hanya sampai 2 jam sebelum jadwal. Hubungi kami lewat WhatsApp.",
      );
    }

    const { count } = await prisma.appointment.updateMany({
      where: { id: booking.id, status: { in: ACTIVE } },
      data: { status: "DIBATALKAN" },
    });
    if (count === 0) throw new UserFacingError("Status booking baru saja berubah. Muat ulang halaman.");

    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "appointment.cancel-by-patient",
      entity: "Appointment",
      entityId: booking.id,
      summary: booking.code,
    });
    safeRevalidatePath("/admin/booking");
    return toPublicStatus({ ...booking, status: "DIBATALKAN" }, now);
  });
}
```

- [ ] **Step 3: Jalankan uji dan pastikan lulus**

Run: `npm run test:integration -- tests/integration/booking-status.test.ts`
Expected: PASS (6 uji).

Run: `npx tsc --noEmit && npm run test:integration`
Expected: semua lulus.

- [ ] **Step 4: Commit**

```bash
git add src/server/public-booking.ts tests/integration/booking-status.test.ts
git commit -m "feat: public booking status lookup and patient cancellation

A wrong code and a wrong last-four digits get the same answer, clinical
data never leaves the server, and cancellation closes two hours before
the appointment.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Komponen dasar kuis

**Files:**
- Create: `src/components/kuis/quiz-screen.tsx`
- Create: `src/components/kuis/choice.tsx`
- Create: `src/components/kuis/fields.tsx`
- Create: `src/components/kuis/activity-list.tsx`
- Test: `tests/unit/components/kuis-basics.test.tsx`

**Interfaces:**
- Consumes: label dan tipe dari Task 5, `bodyMassIndex` dan `formatDecimal` dari Task 7.
- Produces:
  - `QuizScreen({ title, hint?, progress, onBack?, onNext?, nextLabel?, error?, pending?, children })`;
  - `SingleChoice`, `MultiChoice` (dengan `exclusive?`), `Segmented`, `optionsOf(labels, hints?)`, dan tipe `ChoiceOption<T>`;
  - `TextAnswer`, `ShortText`, `NumberInput`, `MedicationFields`, `YesNoWithText`, `DietResultFields`, `MeasureFields`, `FoodRecallFields`;
  - `ActivityList({ entries, onChange })`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/kuis-basics.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityList } from "@/components/kuis/activity-list";
import { MultiChoice, SingleChoice, optionsOf } from "@/components/kuis/choice";
import { MedicationFields } from "@/components/kuis/fields";
import { QuizScreen } from "@/components/kuis/quiz-screen";
import { BODY_AREAS, PURPOSES } from "@/lib/kuis/v1/options";

describe("QuizScreen", () => {
  it("baru menampilkan pesan setelah Lanjut ditekan, dan tidak maju bila belum lengkap", async () => {
    const onNext = vi.fn();
    render(
      <QuizScreen title="Judul" progress={0.5} onNext={onNext} error="Pilih minimal satu.">
        isi
      </QuizScreen>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

    await userEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pilih minimal satu.");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("maju bila layar lengkap", async () => {
    const onNext = vi.fn();
    render(<QuizScreen title="Judul" progress={0.5} onNext={onNext} error={null}>isi</QuizScreen>);
    await userEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("SingleChoice & MultiChoice", () => {
  it("mengirim pilihan yang diketuk", async () => {
    const onChange = vi.fn();
    render(<SingleChoice label="Tujuan" options={optionsOf(PURPOSES)} value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /Slimming/ }));
    expect(onChange).toHaveBeenCalledWith("SLIMMING");
  });

  it("pilihan eksklusif menghapus pilihan lain, dan sebaliknya", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MultiChoice label="Area" options={optionsOf(BODY_AREAS)} values={["PERUT"]} exclusive="TIDAK_ADA" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Tidak ada area khusus/ }));
    expect(onChange).toHaveBeenLastCalledWith(["TIDAK_ADA"]);

    rerender(
      <MultiChoice label="Area" options={optionsOf(BODY_AREAS)} values={["TIDAK_ADA"]} exclusive="TIDAK_ADA" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Perut/ }));
    expect(onChange).toHaveBeenLastCalledWith(["PERUT"]);
  });
});

describe("MedicationFields", () => {
  it("satu kelompok per penyakit; 'Tidak minum obat' mengosongkan dan mengunci kolom obat", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MedicationFields
        conditions={[{ key: "DARAH_TINGGI", name: "Darah tinggi" }, { key: "LAINNYA", name: "Asma" }]}
        value={{ DARAH_TINGGI: { text: "Amlodipine" } }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Asma" })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("checkbox", { name: "Tidak minum obat" })[0]);
    expect(onChange).toHaveBeenLastCalledWith({ DARAH_TINGGI: { none: true } });

    rerender(
      <MedicationFields
        conditions={[{ key: "DARAH_TINGGI", name: "Darah tinggi" }]}
        value={{ DARAH_TINGGI: { none: true } }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Obat untuk Darah tinggi")).toBeDisabled();
  });
});

describe("ActivityList", () => {
  it("menambah catatan dengan jam dan jenis, lalu menampilkannya urut jam", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ActivityList entries={[]} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText("Jam"), "13");
    await userEvent.click(screen.getByRole("radio", { name: "Olahraga" }));
    await userEvent.type(screen.getByLabelText("Isi catatan"), "Jalan kaki 30 menit");
    await userEvent.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    expect(onChange).toHaveBeenLastCalledWith([{ hour: 13, kind: "OLAHRAGA", text: "Jalan kaki 30 menit" }]);

    rerender(
      <ActivityList
        entries={[
          { hour: 13, kind: "OLAHRAGA", text: "Jalan kaki" },
          { hour: 7, kind: "MAKAN_MINUM", text: "Roti" },
        ]}
        onChange={onChange}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("07.00");
    expect(items[1]).toHaveTextContent("13.00");

    await userEvent.click(screen.getByRole("button", { name: "Hapus Roti" }));
    expect(onChange).toHaveBeenLastCalledWith([{ hour: 13, kind: "OLAHRAGA", text: "Jalan kaki" }]);
  });
});
```

Run: `npx vitest run tests/unit/components/kuis-basics.test.tsx`
Expected: FAIL, modul komponen tidak ditemukan.

- [ ] **Step 2: Implementasi kerangka layar dan pilihan**

`src/components/kuis/quiz-screen.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type QuizScreenProps = {
  title: string;
  hint?: string;
  /** 0–1: seberapa jauh pasien di seluruh alur pendaftaran. */
  progress: number;
  onBack?: () => void;
  /** Tanpa onNext tombol Lanjut tidak tampil — layar pilihan tunggal maju sendiri. */
  onNext?: () => void;
  nextLabel?: string;
  /** Pesan bila layar belum lengkap. Baru ditampilkan setelah pasien menekan Lanjut. */
  error?: string | null;
  pending?: boolean;
  children: ReactNode;
};

/**
 * Satu layar kuis bergaya BetterMe: batang progres, satu pertanyaan, kartu
 * jawaban besar. Beri `key` per layar agar status "sudah mencoba Lanjut"
 * tidak terbawa ke layar berikutnya.
 */
export function QuizScreen({
  title,
  hint,
  progress,
  onBack,
  onNext,
  nextLabel = "Lanjut",
  error,
  pending,
  children,
}: QuizScreenProps) {
  const [attempted, setAttempted] = useState(false);
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);

  function handleNext() {
    if (error) {
      setAttempted(true);
      return;
    }
    onNext?.();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col px-4 py-6">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-brown-600 hover:text-brown-900"
            aria-label="Kembali"
          >
            ‹ Kembali
          </button>
        ) : (
          <span className="w-16" />
        )}
        <div
          role="progressbar"
          aria-label="Kemajuan pendaftaran"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-200"
        >
          <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <h1 className="mt-6 font-display text-3xl leading-tight text-brown-900">{title}</h1>
      {hint && <p className="mt-2 text-sm text-brown-600">{hint}</p>}

      <div className="mt-6 flex-1 space-y-3">{children}</div>

      {attempted && error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {onNext && (
        <Button
          type="button"
          size="lg"
          className="mt-6 h-12 rounded-full text-base"
          onClick={handleNext}
          disabled={pending}
        >
          {nextLabel}
        </Button>
      )}
    </div>
  );
}
```

`src/components/kuis/choice.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

export type ChoiceOption<T extends string> = { value: T; label: string; hint?: string };

/** { KUNCI: "Label" } → daftar pilihan dengan urutan yang sama. */
export function optionsOf<T extends Record<string, string>>(
  labels: T,
  hints?: Partial<Record<keyof T, string>>,
): ChoiceOption<keyof T & string>[] {
  return (Object.keys(labels) as (keyof T & string)[]).map((value) => ({
    value,
    label: labels[value],
    hint: hints?.[value],
  }));
}

const cardClass = (selected: boolean) =>
  cn(
    "w-full rounded-2xl border bg-white px-4 py-4 text-left transition",
    selected ? "border-gold-500 bg-cream-100 font-semibold" : "border-cream-300 hover:border-gold-400",
  );

export function SingleChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cardClass(option.value === value)}
        >
          <span className="block text-base text-brown-900">{option.label}</span>
          {option.hint && <span className="mt-0.5 block text-sm font-normal text-brown-600">{option.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function MultiChoice<T extends string>({
  label,
  options,
  values,
  onChange,
  exclusive,
}: {
  label: string;
  options: ChoiceOption<T>[];
  values: readonly T[] | undefined;
  onChange: (values: T[]) => void;
  /** Pilihan seperti "Tidak ada" yang meniadakan pilihan lain. */
  exclusive?: T;
}) {
  const current = values ?? [];

  function toggle(value: T) {
    if (current.includes(value)) return onChange(current.filter((v) => v !== value));
    if (value === exclusive) return onChange([value]);
    onChange([...current.filter((v) => v !== exclusive), value]);
  }

  return (
    <div role="group" aria-label={label} className="space-y-3">
      {options.map((option) => {
        const selected = current.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => toggle(option.value)}
            className={cardClass(selected)}
          >
            <span aria-hidden className="mr-2">
              {selected ? "☑" : "☐"}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pilihan pendek berjajar, mis. Berhasil / Tidak berhasil / Masih jalan. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-lg border px-2 py-2 text-sm",
            option.value === value
              ? "border-gold-500 bg-gold-500 font-semibold text-white"
              : "border-cream-300 bg-white text-brown-800",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Implementasi kolom isian dan daftar aktivitas**

`src/components/kuis/fields.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HealthAnswers, SlimmingAnswers } from "@/lib/kuis/v1/answers";
import { bodyMassIndex, formatDecimal } from "@/lib/kuis/v1/describe";
import {
  CONDITIONS,
  DIET_OUTCOMES,
  DIET_PROGRAMS,
  MEALS,
  MEASURE_LIMITS,
  TEXT_LIMITS,
  WEIGHT_AFTER_DIET,
} from "@/lib/kuis/v1/options";
import { Segmented, optionsOf } from "./choice";

const textareaClass =
  "w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-base text-brown-900 focus:border-gold-500 focus:outline-none";

export function TextAnswer({
  label,
  value,
  onChange,
  maxLength,
  rows = 5,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass}
      />
    </div>
  );
}

export function ShortText({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Angka dengan koma atau titik desimal; di luar batas dianggap belum diisi. */
export function NumberInput({
  label,
  value,
  onChange,
  unit,
  min,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  unit: string;
  min: number;
  max: number;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? "" : String(value).replace(".", ","));

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          className="max-w-32"
          placeholder={`${min}–${max}`}
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const parsed = Number(raw.replace(",", "."));
            onChange(raw.trim() && Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined);
          }}
        />
        <span className="text-sm text-brown-600">{unit}</span>
      </div>
    </div>
  );
}

type ConditionKey = keyof typeof CONDITIONS;

/** K2: satu kelompok per penyakit — obat & aturan minum, atau "Tidak minum obat" (K5). */
export function MedicationFields({
  conditions,
  value,
  onChange,
}: {
  conditions: { key: ConditionKey; name: string }[];
  value: HealthAnswers["medications"];
  onChange: (next: NonNullable<HealthAnswers["medications"]>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-3">
      {conditions.map(({ key, name }) => {
        const medication = current[key] ?? {};
        return (
          <fieldset key={key} className="space-y-2 rounded-2xl border border-gold-300 bg-cream-100 p-3">
            <legend className="px-1 text-sm font-semibold text-brown-900">{name}</legend>
            <Input
              aria-label={`Obat untuk ${name}`}
              placeholder="Nama obat & aturan minum"
              maxLength={TEXT_LIMITS.medication}
              value={medication.none ? "" : (medication.text ?? "")}
              disabled={medication.none}
              onChange={(e) => onChange({ ...current, [key]: { text: e.target.value } })}
            />
            <label className="flex items-center gap-2 text-sm text-brown-700">
              <input
                type="checkbox"
                checked={medication.none ?? false}
                onChange={(e) => onChange({ ...current, [key]: e.target.checked ? { none: true } : {} })}
              />
              Tidak minum obat
            </label>
          </fieldset>
        );
      })}
    </div>
  );
}

/** K3: "Tidak ada" atau "Ada" + teks yang wajib diisi bila Ada. */
export function YesNoWithText({
  question,
  placeholder,
  value,
  onChange,
}: {
  question: string;
  placeholder: string;
  value: { has?: boolean; text?: string } | undefined;
  onChange: (next: { has?: boolean; text?: string }) => void;
}) {
  const answer = value?.has === undefined ? undefined : value.has ? "ADA" : "TIDAK";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-brown-900">{question}</legend>
      <Segmented
        label={question}
        options={[
          { value: "TIDAK", label: "Tidak ada" },
          { value: "ADA", label: "Ada" },
        ]}
        value={answer}
        onChange={(choice) => onChange(choice === "ADA" ? { has: true, text: value?.text } : { has: false })}
      />
      {value?.has && (
        <Input
          aria-label={placeholder}
          placeholder={placeholder}
          maxLength={TEXT_LIMITS.long}
          value={value.text ?? ""}
          onChange={(e) => onChange({ has: true, text: e.target.value })}
        />
      )}
    </fieldset>
  );
}

type DietProgramKey = keyof typeof DIET_PROGRAMS;

/** S6: hasil setiap program diet yang dipilih (K6). */
export function DietResultFields({
  programs,
  value,
  onChange,
}: {
  programs: { key: DietProgramKey; name: string }[];
  value: SlimmingAnswers["dietResults"];
  onChange: (next: NonNullable<SlimmingAnswers["dietResults"]>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-3">
      {programs.map(({ key, name }) => {
        const result = current[key] ?? {};
        const update = (patch: Partial<typeof result>) => onChange({ ...current, [key]: { ...result, ...patch } });
        const showKg = result.outcome === "BERHASIL" || result.outcome === "MASIH_JALAN";
        return (
          <fieldset key={key} className="space-y-2 rounded-2xl border border-gold-300 bg-cream-100 p-3">
            <legend className="px-1 text-sm font-semibold text-brown-900">{name}</legend>
            <Segmented
              label={`Hasil ${name}`}
              options={optionsOf(DIET_OUTCOMES)}
              value={result.outcome}
              onChange={(outcome) => update({ outcome })}
            />
            {showKg && (
              <NumberInput
                label={`Turun berapa kg? (${name})`}
                unit="kg"
                min={MEASURE_LIMITS.lostKg.min}
                max={MEASURE_LIMITS.lostKg.max}
                value={result.lostKg}
                onChange={(lostKg) => update({ lostKg })}
              />
            )}
            {result.outcome === "BERHASIL" && (
              <div className="space-y-1">
                <p className="text-sm text-brown-700">Sekarang beratnya?</p>
                <Segmented
                  label={`Berat sekarang setelah ${name}`}
                  options={optionsOf(WEIGHT_AFTER_DIET)}
                  value={result.weightAfter}
                  onChange={(weightAfter) => update({ weightAfter })}
                />
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

/** S7: berat & tinggi mandiri, dengan IMT sebagai gambaran awal. */
export function MeasureFields({
  weightKg,
  heightCm,
  onChange,
}: {
  weightKg: number | undefined;
  heightCm: number | undefined;
  onChange: (next: { weightKg?: number; heightCm?: number }) => void;
}) {
  return (
    <div className="space-y-4">
      <NumberInput
        label="Berat badan"
        unit="kg"
        min={MEASURE_LIMITS.weightKg.min}
        max={MEASURE_LIMITS.weightKg.max}
        value={weightKg}
        onChange={(next) => onChange({ weightKg: next, heightCm })}
      />
      <NumberInput
        label="Tinggi badan"
        unit="cm"
        min={MEASURE_LIMITS.heightCm.min}
        max={MEASURE_LIMITS.heightCm.max}
        value={heightCm}
        onChange={(next) => onChange({ weightKg, heightCm: next })}
      />
      {weightKg !== undefined && heightCm !== undefined && (
        <p className="rounded-xl bg-cream-100 p-3 text-sm text-brown-700">
          IMT Anda ± <strong>{formatDecimal(bodyMassIndex(weightKg, heightCm))}</strong>. Dokter akan
          memastikannya dengan Timbang BIA di klinik.
        </p>
      )}
    </div>
  );
}

/** S8: food recall seperti Google Form lama (PRD Lampiran C). */
export function FoodRecallFields({
  value,
  onChange,
}: {
  value: SlimmingAnswers["foodRecall"];
  onChange: (next: NonNullable<SlimmingAnswers["foodRecall"]>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-3">
      {(Object.keys(MEALS) as (keyof typeof MEALS)[]).map((meal) => (
        <ShortText
          key={meal}
          label={MEALS[meal]}
          maxLength={TEXT_LIMITS.long}
          value={current[meal]}
          onChange={(text) => onChange({ ...current, [meal]: text })}
        />
      ))}
    </div>
  );
}
```

`src/components/kuis/activity-list.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { ACTIVITY_FIRST_HOUR, ACTIVITY_KINDS, ACTIVITY_LAST_HOUR, TEXT_LIMITS } from "@/lib/kuis/v1/options";
import { minutesToTimeLabel } from "@/lib/time";
import { Segmented, optionsOf } from "./choice";

const HOURS = Array.from(
  { length: ACTIVITY_LAST_HOUR - ACTIVITY_FIRST_HOUR + 1 },
  (_, index) => ACTIVITY_FIRST_HOUR + index,
);

/**
 * P3 (K7): pasien hanya menambah yang benar-benar terjadi kemarin. Dokter
 * melihatnya sebagai tabel 06.00–22.00 (describe.ts → activityTable).
 */
export function ActivityList({
  entries,
  onChange,
}: {
  entries: ActivityEntry[];
  onChange: (entries: ActivityEntry[]) => void;
}) {
  const [hour, setHour] = useState(7);
  const [kind, setKind] = useState<ActivityEntry["kind"]>("MAKAN_MINUM");
  const [text, setText] = useState("");
  const hourId = useId();
  const textId = useId();

  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.hour - b.entry.hour);

  function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange([...entries, { hour, kind, text: trimmed.slice(0, TEXT_LIMITS.activity) }]);
    setText("");
  }

  return (
    <div className="space-y-4">
      {sorted.length > 0 && (
        <ul aria-label="Catatan aktivitas" className="space-y-2">
          {sorted.map(({ entry, index }) => (
            <li
              key={index}
              className="flex items-center gap-3 rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm"
            >
              <span className="w-12 font-semibold">{minutesToTimeLabel(entry.hour * 60)}</span>
              <span className="text-brown-600">{ACTIVITY_KINDS[entry.kind]}</span>
              <span className="flex-1">{entry.text}</span>
              <button
                type="button"
                aria-label={`Hapus ${entry.text}`}
                onClick={() => onChange(entries.filter((_, i) => i !== index))}
                className="text-brown-500 hover:text-brown-900"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-2xl border border-dashed border-gold-500 p-3">
        <div className="flex items-center gap-2">
          <Label htmlFor={hourId}>Jam</Label>
          <select
            id={hourId}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="rounded-lg border border-cream-300 bg-white px-2 py-1"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {minutesToTimeLabel(h * 60)}
              </option>
            ))}
          </select>
        </div>
        <Segmented label="Jenis catatan" options={optionsOf(ACTIVITY_KINDS)} value={kind} onChange={setKind} />
        <div className="space-y-1">
          <Label htmlFor={textId}>Isi catatan</Label>
          <Input
            id={textId}
            placeholder="mis. Nasi ½, ikan bakar"
            maxLength={TEXT_LIMITS.activity}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={!text.trim()}>
          ＋ Tambah catatan
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/components/kuis-basics.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS (6 uji), tanpa galat tipe, lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/components/kuis tests/unit/components/kuis-basics.test.tsx
git commit -m "feat: quiz screen, choice cards and answer fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Layar kuis per langkah

**Files:**
- Create: `src/components/kuis/quiz-step.tsx`
- Test: `tests/unit/components/quiz-step.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`StepId`, `selectedConditions`, `conditionName`, `dietProgramName`, `stepText`), Task 12.
- Produces:
  - `type AnswerPatch = (answers: QuizAnswers) => QuizAnswers`;
  - `AUTO_ADVANCE_STEPS: readonly StepId[]`;
  - `QuizStep({ step, answers, onChange(patch), onChoose(patch) })`. `onChoose` dipakai layar pilihan tunggal yang maju sendiri.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/quiz-step.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuizStep, type AnswerPatch } from "@/components/kuis/quiz-step";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";

function lastPatch(mock: ReturnType<typeof vi.fn>, from: QuizAnswers): QuizAnswers {
  const patch = mock.mock.calls.at(-1)?.[0] as AnswerPatch;
  return patch(from);
}

describe("QuizStep", () => {
  it("U2: pilihan tunggal memakai onChoose agar layar maju sendiri", async () => {
    const onChoose = vi.fn();
    render(<QuizStep step="U2" answers={{ patientType: "BARU" }} onChange={vi.fn()} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("radio", { name: /Aesthetic/ }));
    expect(lastPatch(onChoose, { patientType: "BARU" })).toEqual({ patientType: "BARU", purpose: "AESTHETIC" });
  });

  it("K2: satu kelompok obat per penyakit, dengan nama penyakit lain yang diketik pasien", () => {
    render(
      <QuizStep
        step="K2"
        answers={{ health: { conditions: ["DIABETES", "LAINNYA"], conditionOther: "Asma" } }}
        onChange={vi.fn()}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole("group", { name: "Diabetes" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Asma" })).toBeInTheDocument();
  });

  it("S6: satu kelompok hasil per program diet yang dipilih", async () => {
    const onChange = vi.fn();
    const answers: QuizAnswers = { slimming: { dietHistory: "PERNAH", dietPrograms: ["KETO"] } };
    render(<QuizStep step="S6" answers={answers} onChange={onChange} onChoose={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Berhasil" }));
    expect(lastPatch(onChange, answers).slimming?.dietResults).toEqual({ KETO: { outcome: "BERHASIL" } });
  });

  it("P2: 'Ada' menyalakan pertanyaan kesehatan pasien lama", async () => {
    const onChoose = vi.fn();
    render(<QuizStep step="P2" answers={{ patientType: "LAMA" }} onChange={vi.fn()} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }));
    expect(lastPatch(onChoose, {}).returning).toEqual({ healthChanged: true });
  });
});
```

Run: `npx vitest run tests/unit/components/quiz-step.test.tsx`
Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 2: Implementasi**

`src/components/kuis/quiz-step.tsx`:

```tsx
"use client";

import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import {
  BODY_AREAS,
  COMPLAINT_DURATIONS,
  CONDITIONS,
  DIET_HISTORY,
  DIET_PROGRAMS,
  EXCLUSIVE,
  HEALTH_CHANGE,
  PATIENT_TYPES,
  PREGNANCY,
  PRIOR_TREATMENTS,
  PURPOSE_HINTS,
  PURPOSES,
  SKIN_COMPLAINTS,
  SKIN_TYPES,
  SLIMMING_GOALS,
  TEXT_LIMITS,
  WEIGHT_TARGETS,
} from "@/lib/kuis/v1/options";
import { conditionName, dietProgramName, selectedConditions, type StepId } from "@/lib/kuis/v1/steps";
import { stepText } from "@/lib/kuis/v1/texts";
import { ActivityList } from "./activity-list";
import { MultiChoice, SingleChoice, optionsOf } from "./choice";
import {
  DietResultFields,
  FoodRecallFields,
  MeasureFields,
  MedicationFields,
  ShortText,
  TextAnswer,
  YesNoWithText,
} from "./fields";

export type AnswerPatch = (answers: QuizAnswers) => QuizAnswers;

/** Layar pilihan tunggal: maju sendiri setelah diketuk, seperti BetterMe. */
export const AUTO_ADVANCE_STEPS: readonly StepId[] = ["U1", "U2", "S1", "S2", "S4", "A2", "A3", "K4", "P2"];

type Slimming = NonNullable<QuizAnswers["slimming"]>;
type Aesthetic = NonNullable<QuizAnswers["aesthetic"]>;
type Health = NonNullable<QuizAnswers["health"]>;
type Returning = NonNullable<QuizAnswers["returning"]>;

const slimming = (patch: Partial<Slimming>): AnswerPatch => (a) => ({ ...a, slimming: { ...a.slimming, ...patch } });
const aesthetic = (patch: Partial<Aesthetic>): AnswerPatch => (a) => ({ ...a, aesthetic: { ...a.aesthetic, ...patch } });
const health = (patch: Partial<Health>): AnswerPatch => (a) => ({ ...a, health: { ...a.health, ...patch } });
const returning = (patch: Partial<Returning>): AnswerPatch => (a) => ({ ...a, returning: { ...a.returning, ...patch } });

type Props = {
  step: StepId;
  answers: QuizAnswers;
  onChange: (patch: AnswerPatch) => void;
  onChoose: (patch: AnswerPatch) => void;
};

export function QuizStep({ step, answers: a, onChange, onChoose }: Props) {
  const label = stepText(step, a).title;

  switch (step) {
    case "U1":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(PATIENT_TYPES)}
          value={a.patientType}
          onChange={(patientType) => onChoose((x) => ({ ...x, patientType }))}
        />
      );
    case "U2":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(PURPOSES, PURPOSE_HINTS)}
          value={a.purpose}
          onChange={(purpose) => onChoose((x) => ({ ...x, purpose }))}
        />
      );
    case "S1":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(SLIMMING_GOALS)}
          value={a.slimming?.goal}
          onChange={(goal) => onChoose(slimming({ goal }))}
        />
      );
    case "S2":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(WEIGHT_TARGETS)}
          value={a.slimming?.weightTarget}
          onChange={(weightTarget) => onChoose(slimming({ weightTarget }))}
        />
      );
    case "S3":
      return (
        <MultiChoice
          label={label}
          options={optionsOf(BODY_AREAS)}
          values={a.slimming?.areas}
          exclusive={EXCLUSIVE.areas}
          onChange={(areas) => onChange(slimming({ areas }))}
        />
      );
    case "S4":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(DIET_HISTORY)}
          value={a.slimming?.dietHistory}
          onChange={(dietHistory) => onChoose(slimming({ dietHistory }))}
        />
      );
    case "S5":
      return (
        <>
          <MultiChoice
            label={label}
            options={optionsOf(DIET_PROGRAMS)}
            values={a.slimming?.dietPrograms}
            onChange={(dietPrograms) => onChange(slimming({ dietPrograms }))}
          />
          {a.slimming?.dietPrograms?.includes("LAINNYA") && (
            <ShortText
              label="Nama program diet lainnya"
              maxLength={TEXT_LIMITS.short}
              value={a.slimming.dietProgramOther}
              onChange={(dietProgramOther) => onChange(slimming({ dietProgramOther }))}
            />
          )}
        </>
      );
    case "S6":
      return (
        <DietResultFields
          programs={(a.slimming?.dietPrograms ?? []).map((key) => ({ key, name: dietProgramName(a, key) }))}
          value={a.slimming?.dietResults}
          onChange={(dietResults) => onChange(slimming({ dietResults }))}
        />
      );
    case "S7":
      return (
        <MeasureFields
          weightKg={a.slimming?.weightKg}
          heightCm={a.slimming?.heightCm}
          onChange={(measures) => onChange(slimming(measures))}
        />
      );
    case "S8":
      return (
        <FoodRecallFields
          value={a.slimming?.foodRecall}
          onChange={(foodRecall) => onChange(slimming({ foodRecall }))}
        />
      );
    case "A1":
      return (
        <>
          <MultiChoice
            label={label}
            options={optionsOf(SKIN_COMPLAINTS)}
            values={a.aesthetic?.complaints}
            onChange={(complaints) => onChange(aesthetic({ complaints }))}
          />
          {a.aesthetic?.complaints?.includes("LAINNYA") && (
            <ShortText
              label="Keluhan lainnya"
              maxLength={TEXT_LIMITS.short}
              value={a.aesthetic.complaintOther}
              onChange={(complaintOther) => onChange(aesthetic({ complaintOther }))}
            />
          )}
        </>
      );
    case "A2":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(SKIN_TYPES)}
          value={a.aesthetic?.skinType}
          onChange={(skinType) => onChoose(aesthetic({ skinType }))}
        />
      );
    case "A3":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(COMPLAINT_DURATIONS)}
          value={a.aesthetic?.duration}
          onChange={(duration) => onChoose(aesthetic({ duration }))}
        />
      );
    case "A4":
      return (
        <>
          <MultiChoice
            label={label}
            options={optionsOf(PRIOR_TREATMENTS)}
            values={a.aesthetic?.priorTreatments}
            exclusive={EXCLUSIVE.priorTreatments}
            onChange={(priorTreatments) => onChange(aesthetic({ priorTreatments }))}
          />
          {a.aesthetic?.priorTreatments?.includes("LAINNYA") && (
            <ShortText
              label="Treatment lainnya"
              maxLength={TEXT_LIMITS.short}
              value={a.aesthetic.priorTreatmentOther}
              onChange={(priorTreatmentOther) => onChange(aesthetic({ priorTreatmentOther }))}
            />
          )}
          <TextAnswer
            label="Skincare yang dipakai sekarang (opsional)"
            rows={2}
            maxLength={TEXT_LIMITS.long}
            value={a.aesthetic?.skincare}
            onChange={(skincare) => onChange(aesthetic({ skincare }))}
          />
        </>
      );
    case "B1":
      return (
        <TextAnswer
          label="Jawaban Anda"
          maxLength={TEXT_LIMITS.story}
          value={a.unsure?.story}
          onChange={(story) => onChange((x) => ({ ...x, unsure: { story } }))}
        />
      );
    case "K1":
      return (
        <>
          <MultiChoice
            label={label}
            options={optionsOf(CONDITIONS)}
            values={a.health?.conditions}
            exclusive={EXCLUSIVE.conditions}
            onChange={(conditions) => onChange(health({ conditions }))}
          />
          {a.health?.conditions?.includes("LAINNYA") && (
            <ShortText
              label="Nama penyakit lainnya"
              maxLength={TEXT_LIMITS.short}
              value={a.health.conditionOther}
              onChange={(conditionOther) => onChange(health({ conditionOther }))}
            />
          )}
        </>
      );
    case "K2":
      return (
        <MedicationFields
          conditions={selectedConditions(a).map((key) => ({ key, name: conditionName(a, key) }))}
          value={a.health?.medications}
          onChange={(medications) => onChange(health({ medications }))}
        />
      );
    case "K3":
      return (
        <div className="space-y-5">
          <YesNoWithText
            question="Obat atau suplemen lain"
            placeholder="Tulis obat/suplemen, mis. Vitamin D"
            value={a.health?.otherMeds}
            onChange={(otherMeds) => onChange(health({ otherMeds }))}
          />
          <YesNoWithText
            question="Alergi obat, makanan, atau kosmetik"
            placeholder="Tulis alerginya, mis. Amoxicillin"
            value={a.health?.allergies}
            onChange={(allergies) => onChange(health({ allergies }))}
          />
        </div>
      );
    case "K4":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(PREGNANCY)}
          value={a.health?.pregnancy}
          onChange={(pregnancy) => onChoose(health({ pregnancy }))}
        />
      );
    case "P1":
      return (
        <TextAnswer
          label="Jawaban Anda"
          maxLength={TEXT_LIMITS.story}
          value={a.returning?.story}
          onChange={(story) => onChange(returning({ story }))}
        />
      );
    case "P2":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(HEALTH_CHANGE)}
          value={a.returning?.healthChanged === undefined ? undefined : a.returning.healthChanged ? "ADA" : "TIDAK"}
          onChange={(choice) => onChoose(returning({ healthChanged: choice === "ADA" }))}
        />
      );
    case "P3":
      return (
        <ActivityList
          entries={a.returning?.activities ?? []}
          onChange={(activities) => onChange(returning({ activities }))}
        />
      );
  }
}
```

- [ ] **Step 3: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/components/quiz-step.test.tsx && npx tsc --noEmit`
Expected: PASS (4 uji) dan tanpa galat tipe.

- [ ] **Step 4: Commit**

```bash
git add src/components/kuis/quiz-step.tsx tests/unit/components/quiz-step.test.tsx
git commit -m "feat: render each quiz v1 step from its StepId

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Halaman `/daftar` — kuis, ringkasan, layanan, jadwal, data diri, kwitansi

**Files:**
- Modify: `src/lib/payment.ts` (`BOOKING_FEE_TERMS`)
- Create: `src/components/pendaftaran/summary-step.tsx`
- Create: `src/components/pendaftaran/service-step.tsx`
- Create: `src/components/pendaftaran/schedule-step.tsx`
- Create: `src/components/pendaftaran/identity-step.tsx`
- Create: `src/components/pendaftaran/receipt.tsx`
- Create: `src/components/pendaftaran/registration-flow.tsx`
- Create: `src/app/(public)/daftar/page.tsx`
- Test: `tests/unit/components/registration-flow.test.tsx`

**Interfaces:**
- Consumes: Task 6–7, Task 9–10 (`getPublicSlots`, `holdSlot`, `submitSiteBooking`, `BookingOptions`, `PublicService`, `PublicSlot`, `BookingReceipt`), Task 12–13.
- Produces:
  - `RegistrationFlow({ options: BookingOptions })` dan `DRAFT_STORAGE_KEY = "sundy-daftar-v1"`;
  - `type IdentityDraft`, `EMPTY_IDENTITY`, `identityPayload(draft, patientType)`, `identityError(draft, patientType)`;
  - `type ScheduleDraft = { branchId: string | null; staffId: string | null; date: string | null; hold: HeldSlot | null }`;
  - `type HeldSlot = { token; expiresAt: string; startAt: string; staffId; staffName; label }`;
  - `BOOKING_FEE_TERMS: string`.

- [ ] **Step 1: Tulis uji alur yang gagal (Review Focus 2)**

`tests/unit/components/registration-flow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY, RegistrationFlow } from "@/components/pendaftaran/registration-flow";
import type { BookingOptions } from "@/server/public-booking-data";
import { slimmingNewPatient } from "../../fixtures/quiz-answers";

const actions = vi.hoisted(() => ({
  getPublicSlots: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  holdSlot: vi.fn(),
  submitSiteBooking: vi.fn(),
}));
vi.mock("@/server/public-booking", () => actions);

const options: BookingOptions = {
  branches: [
    { id: "b1", name: "SunDY Mahakeret", status: "AKTIF" },
    { id: "b2", name: "SunDY Citraland", status: "SEGERA_HADIR" },
  ],
  consultation: { id: "konsul", name: "Konsultasi Dokter", price: 200000, durationMin: 30, requiresDoctor: true },
  treatments: [],
  staff: [{ id: "diane", name: "Dr. Diane", role: "DOKTER", branchIds: ["b1"] }],
  bookingFee: 100000,
};

const readyDraft = {
  answers: slimmingNewPatient,
  screen: "D",
  serviceId: "konsul",
  schedule: {
    branchId: "b1",
    staffId: null,
    date: "2026-10-01",
    hold: {
      token: "token-hold-uji-000000",
      expiresAt: "2026-10-01T07:10:00.000Z",
      startAt: "2026-10-01T07:00:00.000Z",
      staffId: "diane",
      staffName: "Dr. Diane",
      label: "15.00",
    },
  },
  identity: {
    name: "Siti Rahayu",
    whatsapp: "081234567890",
    birthDate: "1992-04-17",
    gender: "P",
    occupation: "Guru",
    address: "Jl. Sam Ratulangi",
    consentData: true,
    consentFee: true,
    website: "",
  },
};

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.clearAllMocks());

describe("RegistrationFlow", () => {
  it("menyimpan jawaban dan memulihkannya setelah halaman dimuat ulang", async () => {
    const { unmount } = render(<RegistrationFlow options={options} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Belum, ini pertama kali/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Slimming/ }));
    expect(await screen.findByRole("heading", { name: "Apa tujuan utama Anda?" })).toBeInTheDocument();
    unmount();

    render(<RegistrationFlow options={options} />);
    expect(await screen.findByRole("heading", { name: "Apa tujuan utama Anda?" })).toBeInTheDocument();
  });

  it("setelah Kirim berhasil, jawaban dihapus dan kunjungan berikutnya mulai dari awal", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(readyDraft));
    actions.submitSiteBooking.mockResolvedValue({
      ok: true,
      data: {
        kind: "booked",
        receipt: {
          code: "SDY-8F3K",
          patientName: "Siti Rahayu",
          serviceName: "Konsultasi Dokter",
          staffName: "Dr. Diane",
          branchName: "SunDY Mahakeret",
          startAt: new Date("2026-10-01T07:00:00Z"),
          bookingFee: 100000,
          bankAccount: "BCA 1234567890 a.n. SunDY Clinic",
          confirmationLink: "https://wa.me/6285172228900?text=x",
        },
      },
    });

    const { unmount } = render(<RegistrationFlow options={options} />);
    await userEvent.click(await screen.findByRole("button", { name: "Kirim pendaftaran" }));

    expect(await screen.findByText("SDY-8F3K")).toBeInTheDocument();
    expect(screen.getByText(/BCA 1234567890 a.n. SunDY Clinic/)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(actions.submitSiteBooking).toHaveBeenCalledWith(
      expect.objectContaining({ holdToken: "token-hold-uji-000000", serviceId: "konsul", branchId: "b1" }),
    );
    unmount();

    render(<RegistrationFlow options={options} />);
    expect(await screen.findByRole("heading", { name: "Pernah berobat di SunDY Clinic?" })).toBeInTheDocument();
  });

  it("slot yang terisi mengembalikan pasien ke langkah jadwal tanpa kehilangan jawaban", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(readyDraft));
    actions.submitSiteBooking.mockResolvedValue({ ok: true, data: { kind: "slot-taken" } });

    render(<RegistrationFlow options={options} />);
    await userEvent.click(await screen.findByRole("button", { name: "Kirim pendaftaran" }));

    expect(await screen.findByRole("heading", { name: "Pilih jadwal" })).toBeInTheDocument();
    const saved = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)!);
    expect(saved.answers).toEqual(slimmingNewPatient);
    expect(saved.schedule.hold).toBeNull();
  });
});
```

Run: `npx vitest run tests/unit/components/registration-flow.test.tsx`
Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 2: Teks aturan biaya booking**

Tambahkan di akhir `src/lib/payment.ts`:

```ts
/** Aturan biaya booking yang ditampilkan ke pasien (spec K15, K16). */
export const BOOKING_FEE_TERMS =
  "Biaya booking mengunci jadwal Anda. Biaya ini terpisah dari biaya layanan dan tidak dikembalikan, tetapi tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelum jadwal.";
```

- [ ] **Step 3: Layar Ringkasan, Layanan, dan kwitansi**

`src/components/pendaftaran/summary-step.tsx`:

```tsx
"use client";

import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { describeAnswers } from "@/lib/kuis/v1/describe";
import { pruneAnswers, type StepId } from "@/lib/kuis/v1/steps";

/** Layar R (K8): jawaban diulang per bagian, masing-masing bisa diubah. Tanpa diagnosis, tanpa janji hasil. */
export function SummaryStep({ answers, onEdit }: { answers: QuizAnswers; onEdit: (step: StepId) => void }) {
  const sections = describeAnswers(pruneAnswers(answers));
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <section key={section.title} className="rounded-2xl border border-cream-300 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-brown-900">{section.title}</h2>
            <button
              type="button"
              className="text-sm text-gold-600 underline underline-offset-4"
              aria-label={`Ubah ${section.title}`}
              onClick={() => onEdit(section.step)}
            >
              Ubah
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-brown-700">
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-brown-600">Dokter kami akan membahas ini bersama Anda saat konsultasi.</p>
    </div>
  );
}
```

`src/components/pendaftaran/service-step.tsx`:

```tsx
"use client";

import { SingleChoice } from "@/components/kuis/choice";
import { formatRupiah } from "@/lib/format";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { BOOKING_FEE_TERMS } from "@/lib/payment";
import type { BookingOptions, PublicService } from "@/server/public-booking-data";

/** Hanya pasien Aesthetic lama yang boleh memilih treatment (K9). */
export function servicesFor(options: BookingOptions, answers: QuizAnswers): PublicService[] {
  const mayChooseTreatment = answers.patientType === "LAMA" && answers.purpose === "AESTHETIC";
  return mayChooseTreatment ? [options.consultation, ...options.treatments] : [options.consultation];
}

export function ServiceStep({
  options,
  answers,
  service,
  onSelect,
}: {
  options: BookingOptions;
  answers: QuizAnswers;
  service: PublicService;
  onSelect: (serviceId: string) => void;
}) {
  const services = servicesFor(options, answers);

  return (
    <div className="space-y-4">
      {services.length > 1 ? (
        <SingleChoice
          label="Layanan"
          options={services.map((s) => ({
            value: s.id,
            label: s.name,
            hint: `${s.durationMin} menit · ${formatRupiah(s.price)}`,
          }))}
          value={service.id}
          onChange={onSelect}
        />
      ) : (
        <div className="rounded-2xl border border-gold-500 bg-cream-100 p-4">
          <p className="font-semibold text-brown-900">{service.name}</p>
          <p className="mt-1 text-sm text-brown-600">
            {service.durationMin} menit bersama dokter. Treatment ditentukan dokter setelah pemeriksaan.
          </p>
        </div>
      )}

      <dl className="space-y-3 rounded-2xl border border-cream-300 bg-white p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-brown-900">{service.name}</dt>
          <dd className="text-right">
            {formatRupiah(service.price)}
            <span className="block text-brown-600">dibayar di klinik</span>
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-brown-900">Biaya booking</dt>
          <dd className="text-right">
            {formatRupiah(options.bookingFee)}
            <span className="block text-brown-600">ditransfer setelah mendaftar</span>
          </dd>
        </div>
      </dl>
      <p className="text-sm text-brown-600">{BOOKING_FEE_TERMS}</p>
    </div>
  );
}
```

`src/components/pendaftaran/receipt.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatIndonesianDate, formatRupiah } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { BookingReceipt } from "@/server/public-booking";

export function Receipt({ receipt }: { receipt: BookingReceipt }) {
  const time = minutesToTimeLabel(witaMinutesOfDay(receipt.startAt));
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-10 text-center">
      <h1 className="font-display text-3xl text-brown-900">Pendaftaran diterima</h1>

      <div className="rounded-2xl bg-cream-100 p-5">
        <p className="text-sm text-brown-600">Kode booking</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-wider text-brown-900">{receipt.code}</p>
      </div>

      <dl className="space-y-1 text-left text-sm text-brown-700">
        <div><dt className="inline font-semibold">Layanan: </dt><dd className="inline">{receipt.serviceName}</dd></div>
        <div><dt className="inline font-semibold">Dengan: </dt><dd className="inline">{receipt.staffName}</dd></div>
        <div><dt className="inline font-semibold">Cabang: </dt><dd className="inline">{receipt.branchName}</dd></div>
        <div>
          <dt className="inline font-semibold">Jadwal: </dt>
          <dd className="inline">{formatIndonesianDate(receipt.startAt)}, pukul {time} WITA</dd>
        </div>
      </dl>

      {receipt.bookingFee !== null && (
        <div className="rounded-2xl border border-gold-500 p-4 text-left text-sm text-brown-800">
          {receipt.bankAccount ? (
            <p>
              Transfer biaya booking <strong>{formatRupiah(receipt.bookingFee)}</strong> ke{" "}
              <strong>{receipt.bankAccount}</strong>, lalu kirim bukti transfernya lewat tombol di bawah.
            </p>
          ) : (
            <p>
              Admin kami akan mengirim nomor rekening untuk biaya booking {formatRupiah(receipt.bookingFee)} lewat
              WhatsApp.
            </p>
          )}
          <p className="mt-2 text-brown-600">Booking yang belum dikonfirmasi dalam 24 jam dibatalkan otomatis.</p>
        </div>
      )}

      <Button asChild size="lg" className="h-12 w-full rounded-full text-base">
        <a href={receipt.confirmationLink} target="_blank" rel="noopener noreferrer">
          Konfirmasi via WhatsApp
        </a>
      </Button>
      <Link href="/cek-booking" className="block text-sm text-brown-700 underline underline-offset-4">
        Cek status booking
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Layar jadwal dan data diri**

`src/components/pendaftaran/schedule-step.tsx`:

```tsx
"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PUBLIC_MAX_DAYS_AHEAD } from "@/lib/booking-rules";
import { addDaysToDateString, minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "@/lib/time";
import { branchNotifyMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { getPublicSlots, holdSlot, type PublicSlot } from "@/server/public-booking";
import type { BookingOptions, PublicService } from "@/server/public-booking-data";

export type HeldSlot = {
  token: string;
  expiresAt: string;
  startAt: string;
  staffId: string;
  staffName: string;
  label: string;
};

export type ScheduleDraft = {
  branchId: string | null;
  /** null = "siapa saja yang tersedia". */
  staffId: string | null;
  date: string | null;
  hold: HeldSlot | null;
};

type SlotsState = { key: string; slots: PublicSlot[]; error: string | null };

export function ScheduleStep({
  options,
  service,
  value,
  onChange,
}: {
  options: BookingOptions;
  service: PublicService;
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
}) {
  const activeBranches = options.branches.filter((b) => b.status === "AKTIF");
  // Selama hanya satu cabang aktif, cabang dipilih otomatis (PRD F5).
  const branchId = value.branchId ?? (activeBranches.length === 1 ? activeBranches[0].id : null);
  const staffChoices = options.staff.filter(
    (s) => branchId !== null && s.branchIds.includes(branchId) && (!service.requiresDoctor || s.role === "DOKTER"),
  );
  const today = witaDateString(new Date());
  const staffSelectId = useId();
  const dateId = useId();
  const [refresh, setRefresh] = useState(0);
  const [slotsState, setSlotsState] = useState<SlotsState>({ key: "", slots: [], error: null });
  const [holding, startHolding] = useTransition();

  const holdToken = value.hold?.token ?? null;
  const requestKey = branchId && value.date ? `${service.id}|${branchId}|${value.staffId ?? "*"}|${value.date}|${refresh}` : "";

  useEffect(() => {
    if (!requestKey || !branchId || !value.date) return;
    let cancelled = false;
    getPublicSlots({ serviceId: service.id, staffId: value.staffId, branchId, date: value.date, holdToken })
      .then((result) => {
        if (cancelled) return;
        setSlotsState({ key: requestKey, slots: result.ok ? result.data : [], error: result.ok ? null : result.error });
      })
      .catch(() => {
        if (!cancelled) setSlotsState({ key: requestKey, slots: [], error: "Gagal memuat jam. Coba lagi." });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, branchId, service.id, value.staffId, value.date, holdToken]);

  function select(slot: PublicSlot) {
    if (!branchId) return;
    startHolding(async () => {
      try {
        const result = await holdSlot({
          serviceId: service.id,
          staffId: slot.staffId,
          branchId,
          startAt: slot.startAt.toISOString(),
          previousToken: holdToken,
        });
        if (!result.ok) {
          toast.error(result.error);
          setRefresh((n) => n + 1);
          return;
        }
        onChange({
          ...value,
          branchId,
          hold: {
            token: result.data.token,
            expiresAt: result.data.expiresAt.toISOString(),
            startAt: slot.startAt.toISOString(),
            staffId: slot.staffId,
            staffName: slot.staffName,
            label: slot.label,
          },
        });
      } catch {
        toast.error("Gagal menahan jam. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {options.branches.length > 1 && (
        <div role="radiogroup" aria-label="Cabang" className="space-y-2">
          {options.branches.map((branch) =>
            branch.status === "AKTIF" ? (
              <button
                key={branch.id}
                type="button"
                role="radio"
                aria-checked={branch.id === branchId}
                onClick={() => onChange({ ...value, branchId: branch.id, staffId: null, hold: null })}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left",
                  branch.id === branchId ? "border-gold-500 bg-cream-100 font-semibold" : "border-cream-300 bg-white",
                )}
              >
                {branch.name}
              </button>
            ) : (
              <div key={branch.id} className="rounded-2xl border border-cream-300 bg-cream-100 px-4 py-3 text-brown-500">
                {branch.name} · <span className="font-semibold">Segera Hadir</span>{" "}
                <a
                  href={buildWhatsAppLink(branchNotifyMessage(branch.name))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  Beri tahu saya saat buka
                </a>
              </div>
            ),
          )}
        </div>
      )}

      {staffChoices.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor={staffSelectId}>Dengan</Label>
          <select
            id={staffSelectId}
            value={value.staffId ?? ""}
            onChange={(e) => onChange({ ...value, branchId, staffId: e.target.value || null, hold: null })}
            className="w-full rounded-lg border border-cream-300 bg-white px-3 py-2"
          >
            <option value="">Siapa saja yang tersedia</option>
            {staffChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {staffChoices.length === 1 && <p className="text-sm text-brown-700">Dengan {staffChoices[0].name}</p>}

      <div className="space-y-1">
        <Label htmlFor={dateId}>Tanggal</Label>
        <Input
          id={dateId}
          type="date"
          min={today}
          max={addDaysToDateString(today, PUBLIC_MAX_DAYS_AHEAD)}
          value={value.date ?? ""}
          onChange={(e) => onChange({ ...value, branchId, date: e.target.value || null, hold: null })}
        />
      </div>

      {!value.date ? (
        <p className="text-sm text-brown-600">Pilih tanggal untuk melihat jam yang kosong.</p>
      ) : slotsState.key !== requestKey ? (
        <p className="text-sm text-brown-600">Memuat jam…</p>
      ) : slotsState.error ? (
        <p className="text-sm text-destructive">{slotsState.error}</p>
      ) : slotsState.slots.length === 0 ? (
        <p className="text-sm text-brown-600">
          Tidak ada jam kosong pada tanggal ini — hari libur, di luar jadwal, atau sudah penuh. Coba tanggal lain.
        </p>
      ) : (
        <div role="group" aria-label="Pilih jam" className="flex flex-wrap gap-2">
          {slotsState.slots.map((slot) => {
            const selected = value.hold?.startAt === slot.startAt.toISOString();
            return (
              <Button
                key={`${slot.staffId}-${slot.startAt.toISOString()}`}
                type="button"
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                disabled={holding}
                onClick={() => select(slot)}
              >
                {slot.label}
              </Button>
            );
          })}
        </div>
      )}

      {value.hold && (
        <p className="rounded-xl bg-cream-100 p-3 text-sm text-brown-800">
          Jam {value.hold.label} bersama {value.hold.staffName} ditahan untuk Anda sampai pukul{" "}
          {minutesToTimeLabel(witaMinutesOfDay(new Date(value.hold.expiresAt)))} WITA.
        </p>
      )}
    </div>
  );
}
```

`src/components/pendaftaran/identity-step.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Segmented } from "@/components/kuis/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { validateIdentity } from "@/lib/kuis/v1/identity";
import { BOOKING_FEE_TERMS } from "@/lib/payment";
import { witaDateString } from "@/lib/time";

export type IdentityDraft = {
  name: string;
  whatsapp: string;
  birthDate: string;
  gender: "" | "L" | "P";
  occupation: string;
  address: string;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan untuk bot (spec bagian 8). */
  website: string;
};

export const EMPTY_IDENTITY: IdentityDraft = {
  name: "",
  whatsapp: "",
  birthDate: "",
  gender: "",
  occupation: "",
  address: "",
  consentData: false,
  consentFee: false,
  website: "",
};

/** Pasien lama cukup nama, WA, dan tanggal lahir — hanya untuk dicocokkan admin. */
export function identityPayload(draft: IdentityDraft, patientType: "BARU" | "LAMA") {
  const base = { name: draft.name, whatsapp: draft.whatsapp, birthDate: draft.birthDate };
  if (patientType === "LAMA") return base;
  return { ...base, gender: draft.gender || undefined, occupation: draft.occupation, address: draft.address };
}

export function identityError(draft: IdentityDraft, patientType: "BARU" | "LAMA"): string | null {
  const checked = validateIdentity(identityPayload(draft, patientType), patientType);
  if (!checked.ok) return checked.message;
  if (!draft.consentData || !draft.consentFee) return "Centang kedua persetujuan untuk melanjutkan.";
  return null;
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

export function IdentityStep({
  patientType,
  value,
  onChange,
  bookingFee,
}: {
  patientType: "BARU" | "LAMA";
  value: IdentityDraft;
  onChange: (next: IdentityDraft) => void;
  bookingFee: number;
}) {
  const set = <K extends keyof IdentityDraft>(key: K, next: IdentityDraft[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      <Field label="Nama lengkap">
        {(id) => <Input id={id} autoComplete="name" value={value.name} onChange={(e) => set("name", e.target.value)} />}
      </Field>
      <Field label="Nomor WhatsApp">
        {(id) => (
          <Input
            id={id}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812…"
            value={value.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
          />
        )}
      </Field>
      <Field label="Tanggal lahir">
        {(id) => (
          <Input
            id={id}
            type="date"
            max={witaDateString(new Date())}
            value={value.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
          />
        )}
      </Field>

      {patientType === "BARU" ? (
        <>
          <div className="space-y-1">
            <p className="text-sm font-medium">Jenis kelamin</p>
            <Segmented
              label="Jenis kelamin"
              options={[
                { value: "P", label: "Perempuan" },
                { value: "L", label: "Laki-laki" },
              ]}
              value={value.gender || undefined}
              onChange={(gender) => set("gender", gender)}
            />
          </div>
          <Field label="Pekerjaan">
            {(id) => <Input id={id} value={value.occupation} onChange={(e) => set("occupation", e.target.value)} />}
          </Field>
          <Field label="Alamat">
            {(id) => (
              <textarea
                id={id}
                rows={3}
                maxLength={200}
                value={value.address}
                onChange={(e) => set("address", e.target.value)}
                className="w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-base"
              />
            )}
          </Field>
        </>
      ) : (
        <p className="text-sm text-brown-600">Data ini hanya untuk mencocokkan dengan rekam medis Anda di klinik.</p>
      )}

      <label className="flex items-start gap-2 text-sm text-brown-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.consentData}
          onChange={(e) => set("consentData", e.target.checked)}
        />
        <span>
          Saya setuju data saya, termasuk jawaban kesehatan, dipakai untuk pelayanan di SunDY Clinic sesuai{" "}
          <Link href="/kebijakan-privasi" target="_blank" className="underline underline-offset-4">
            Kebijakan Privasi
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-brown-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.consentFee}
          onChange={(e) => set("consentFee", e.target.checked)}
        />
        <span>
          Saya akan mentransfer biaya booking {formatRupiah(bookingFee)}. {BOOKING_FEE_TERMS}
        </span>
      </label>

      {/* Kolom jebakan: tersembunyi dari manusia dan pembaca layar, diisi bot. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Situs web
          <input
            tabIndex={-1}
            autoComplete="off"
            name="website"
            value={value.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Orkestra alur dan halaman**

`src/components/pendaftaran/registration-flow.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { QuizScreen } from "@/components/kuis/quiz-screen";
import { AUTO_ADVANCE_STEPS, QuizStep, type AnswerPatch } from "@/components/kuis/quiz-step";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { QUIZ_VERSION } from "@/lib/kuis/v1/options";
import { pruneAnswers, stepError, visibleSteps, type StepId } from "@/lib/kuis/v1/steps";
import { stepText } from "@/lib/kuis/v1/texts";
import { submitSiteBooking, type BookingReceipt } from "@/server/public-booking";
import type { BookingOptions } from "@/server/public-booking-data";
import { EMPTY_IDENTITY, IdentityStep, identityError, identityPayload, type IdentityDraft } from "./identity-step";
import { Receipt } from "./receipt";
import { ScheduleStep, type ScheduleDraft } from "./schedule-step";
import { ServiceStep, servicesFor } from "./service-step";
import { SummaryStep } from "./summary-step";

type Screen = StepId | "R" | "L" | "J" | "D";

type Draft = {
  answers: QuizAnswers;
  screen: Screen;
  serviceId: string | null;
  schedule: ScheduleDraft;
  identity: IdentityDraft;
};

/** Jawaban tersimpan per tab (sessionStorage), terhapus saat tab ditutup atau setelah Kirim (spec bagian 8). */
export const DRAFT_STORAGE_KEY = `sundy-daftar-v${QUIZ_VERSION}`;
const MODE = { askPatientType: true };
const EMPTY_SCHEDULE: ScheduleDraft = { branchId: null, staffId: null, date: null, hold: null };

function emptyDraft(): Draft {
  return { answers: {}, screen: "U1", serviceId: null, schedule: EMPTY_SCHEDULE, identity: EMPTY_IDENTITY };
}

function screensFor(answers: QuizAnswers): Screen[] {
  return [...visibleSteps(answers, MODE), "R", "L", "J", "D"];
}

function readDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Mode privat atau penyimpanan penuh: kuis tetap jalan, hanya tidak bertahan saat refresh.
  }
}

type HistoryState = { daftar?: Screen; depth?: number } | null;

export function RegistrationFlow({ options }: { options: BookingOptions }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  // Pulihkan draf setelah hidrasi — server tidak tahu isi sessionStorage.
  useEffect(() => {
    const saved = readDraft();
    const initial = saved ?? emptyDraft();
    if (saved) setDraft(saved);
    window.history.replaceState({ daftar: initial.screen, depth: 0 }, "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !receipt) writeDraft(draft);
  }, [draft, ready, receipt]);

  useEffect(() => {
    function onPop(event: PopStateEvent) {
      const screen = (event.state as HistoryState)?.daftar;
      if (screen) setDraft((d) => ({ ...d, screen }));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const screens = useMemo(() => screensFor(draft.answers), [draft.answers]);
  const index = Math.max(0, screens.indexOf(draft.screen));
  const screen = screens[index];
  const patientType = draft.answers.patientType ?? "BARU";
  const service =
    servicesFor(options, draft.answers).find((s) => s.id === draft.serviceId) ?? options.consultation;

  function goTo(next: Screen) {
    const depth = ((window.history.state as HistoryState)?.depth ?? 0) + 1;
    window.history.pushState({ daftar: next, depth }, "");
    setDraft((d) => ({ ...d, screen: next }));
    topRef.current?.scrollIntoView?.({ block: "start" });
  }

  function goBack() {
    if (((window.history.state as HistoryState)?.depth ?? 0) > 0) {
      window.history.back();
      return;
    }
    const previous = screens[index - 1];
    if (!previous) return;
    window.history.replaceState({ daftar: previous, depth: 0 }, "");
    setDraft((d) => ({ ...d, screen: previous }));
  }

  // Mengganti tipe pasien atau tujuan bisa mengganti layanan — lepaskan pilihan layanan & jam.
  function withAnswers(d: Draft, answers: QuizAnswers): Draft {
    const serviceChanged =
      answers.patientType !== d.answers.patientType || answers.purpose !== d.answers.purpose;
    return serviceChanged
      ? { ...d, answers, serviceId: null, schedule: { ...d.schedule, hold: null } }
      : { ...d, answers };
  }

  function change(patch: AnswerPatch) {
    setDraft((d) => withAnswers(d, patch(d.answers)));
  }

  function choose(patch: AnswerPatch) {
    const answers = patch(draft.answers);
    const nextScreens = screensFor(answers);
    const next = nextScreens[nextScreens.indexOf(screen) + 1];
    setDraft((d) => withAnswers(d, answers));
    if (next) goTo(next);
  }

  function restart() {
    writeDraft(null);
    setDraft(emptyDraft());
    window.history.replaceState({ daftar: "U1", depth: 0 }, "");
  }

  function submit() {
    const hold = draft.schedule.hold;
    const branchId = draft.schedule.branchId;
    if (!hold || !branchId) {
      goTo("J");
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitSiteBooking({
          holdToken: hold.token,
          serviceId: service.id,
          staffId: hold.staffId,
          branchId,
          startAt: hold.startAt,
          answers: pruneAnswers(draft.answers),
          identity: identityPayload(draft.identity, patientType),
          consentData: draft.identity.consentData,
          consentFee: draft.identity.consentFee,
          website: draft.identity.website,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        if (result.data.kind === "slot-taken") {
          toast.error("Jam itu baru saja terisi. Pilih jam lain — jawaban Anda tetap tersimpan.");
          setDraft((d) => ({ ...d, schedule: { ...d.schedule, hold: null } }));
          goTo("J");
          return;
        }
        writeDraft(null);
        setDraft(emptyDraft());
        setReceipt(result.data.receipt);
      } catch {
        toast.error("Pendaftaran gagal dikirim. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  if (receipt) return <Receipt receipt={receipt} />;
  if (!ready) return <p className="px-4 py-16 text-center text-brown-600">Memuat…</p>;

  const common = { progress: (index + 1) / screens.length, onBack: index > 0 ? goBack : undefined };
  let content: ReactNode;

  if (screen === "R") {
    content = (
      <QuizScreen key="R" title="Ringkasan jawaban Anda" hint="Periksa sekali lagi. Ketuk “Ubah” untuk memperbaiki." {...common} onNext={() => goTo("L")} nextLabel="Pilih layanan & jadwal">
        <SummaryStep answers={draft.answers} onEdit={goTo} />
      </QuizScreen>
    );
  } else if (screen === "L") {
    content = (
      <QuizScreen key="L" title="Layanan & biaya" {...common} onNext={() => goTo("J")}>
        <ServiceStep
          options={options}
          answers={draft.answers}
          service={service}
          onSelect={(serviceId) => setDraft((d) => ({ ...d, serviceId, schedule: { ...d.schedule, hold: null } }))}
        />
      </QuizScreen>
    );
  } else if (screen === "J") {
    content = (
      <QuizScreen
        key="J"
        title="Pilih jadwal"
        hint="Jam yang Anda pilih ditahan 10 menit selama Anda mengisi data diri."
        {...common}
        error={draft.schedule.hold ? null : "Pilih tanggal dan jam lebih dulu."}
        onNext={() => goTo("D")}
      >
        <ScheduleStep
          options={options}
          service={service}
          value={draft.schedule}
          onChange={(schedule) => setDraft((d) => ({ ...d, schedule }))}
        />
      </QuizScreen>
    );
  } else if (screen === "D") {
    content = (
      <QuizScreen
        key="D"
        title="Terakhir, data diri Anda"
        {...common}
        error={identityError(draft.identity, patientType)}
        onNext={submit}
        nextLabel="Kirim pendaftaran"
        pending={pending}
      >
        <IdentityStep
          patientType={patientType}
          value={draft.identity}
          bookingFee={options.bookingFee}
          onChange={(identity) => setDraft((d) => ({ ...d, identity }))}
        />
      </QuizScreen>
    );
  } else {
    const text = stepText(screen, draft.answers);
    const auto = AUTO_ADVANCE_STEPS.includes(screen);
    content = (
      <QuizScreen
        key={screen}
        title={text.title}
        hint={text.hint}
        {...common}
        error={stepError(screen, draft.answers)}
        onNext={auto ? undefined : () => goTo(screens[index + 1])}
      >
        <QuizStep step={screen} answers={draft.answers} onChange={change} onChoose={choose} />
      </QuizScreen>
    );
  }

  return (
    <div ref={topRef} className="relative">
      {index > 0 && (
        <button
          type="button"
          onClick={restart}
          className="absolute right-4 top-6 text-xs text-brown-500 underline underline-offset-4"
        >
          Mulai ulang
        </button>
      )}
      {content}
    </div>
  );
}
```

`src/app/(public)/daftar/page.tsx`:

```tsx
import type { Metadata } from "next";
import { RegistrationFlow } from "@/components/pendaftaran/registration-flow";
import { getBookingOptions } from "@/server/public-booking-data";

export const metadata: Metadata = {
  title: "Daftar Konsultasi",
  description: "Daftar konsultasi Slimming atau Aesthetic di SunDY Clinic secara online.",
  // Dibuka untuk mesin pencari di Task 20, setelah pemilik mencoba alurnya.
  robots: { index: false, follow: false },
};

// Biaya booking dan layanan dibaca langsung dari basis data setiap kali.
export const dynamic = "force-dynamic";

export default async function RegistrationPage() {
  const options = await getBookingOptions();
  return <RegistrationFlow options={options} />;
}
```

- [ ] **Step 6: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/components/registration-flow.test.tsx`
Expected: PASS (3 uji).

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tanpa galat, dan seluruh uji unit lulus (termasuk `architecture.test.ts`).

- [ ] **Step 7: Coba di browser**

Run: `npm run dev`, lalu buka `http://localhost:3000/daftar` di lebar ponsel (DevTools → 390 px). Tempuh jalur Slimming sampai halaman jadwal, lalu cek hal berikut:
- refresh di tengah kuis mengembalikan layar yang sama;
- tombol kembali browser mundur satu layar;
- "Mulai ulang" mengosongkan jawaban.

Hentikan server setelah selesai.

- [ ] **Step 8: Commit**

```bash
git add src/lib/payment.ts src/components/pendaftaran "src/app/(public)/daftar" tests/unit/components/registration-flow.test.tsx
git commit -m "feat: /daftar registration flow from quiz to booking receipt

Answers live in sessionStorage until submit and are cleared right after,
the phone back button steps back one screen, and a slot lost at submit
returns the visitor to the schedule with every answer intact.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Halaman `/cek-booking`

**Files:**
- Create: `src/components/pendaftaran/booking-status-lookup.tsx`
- Create: `src/app/(public)/cek-booking/page.tsx`
- Test: `tests/unit/components/booking-status-lookup.test.tsx`

**Interfaces:**
- Consumes: `findBookingStatus`, `cancelSiteBooking`, `PublicBookingStatus` (Task 11).
- Produces: `BookingStatusLookup()`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/booking-status-lookup.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingStatusLookup } from "@/components/pendaftaran/booking-status-lookup";

const actions = vi.hoisted(() => ({ findBookingStatus: vi.fn(), cancelSiteBooking: vi.fn() }));
vi.mock("@/server/public-booking", () => actions);

const confirmed = {
  code: "SDY-8F3K",
  status: "TERKONFIRMASI",
  statusLabel: "Terkonfirmasi",
  serviceName: "Konsultasi Dokter",
  staffName: "Dr. Diane",
  branchName: "SunDY Mahakeret",
  startAt: new Date("2026-10-01T07:00:00Z"),
  maskedWhatsapp: "0812-****-7890",
  bookingFee: 100000,
  canCancel: true,
  canReschedule: true,
  rescheduleLink: "https://wa.me/6285172228900?text=pindah",
};

afterEach(() => vi.clearAllMocks());

async function lookUp() {
  await userEvent.type(screen.getByLabelText("Kode booking"), "sdy-8f3k");
  await userEvent.type(screen.getByLabelText("4 digit terakhir nomor WhatsApp"), "7890");
  await userEvent.click(screen.getByRole("button", { name: "Cek Status" }));
}

describe("BookingStatusLookup", () => {
  it("menampilkan status, jadwal, dan tawaran pindah jadwal", async () => {
    actions.findBookingStatus.mockResolvedValue({ ok: true, data: confirmed });
    render(<BookingStatusLookup />);
    await lookUp();

    expect(await screen.findByText("Terkonfirmasi")).toBeInTheDocument();
    expect(screen.getByText("0812-****-7890")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pindah jadwal via WhatsApp" })).toHaveAttribute(
      "href",
      confirmed.rescheduleLink,
    );
    expect(actions.findBookingStatus).toHaveBeenCalledWith({ code: "sdy-8f3k", last4: "7890" });
  });

  it("memberi tahu bila booking tidak ditemukan", async () => {
    actions.findBookingStatus.mockResolvedValue({ ok: true, data: null });
    render(<BookingStatusLookup />);
    await lookUp();
    expect(await screen.findByText(/Booking tidak ditemukan/)).toBeInTheDocument();
  });

  it("memperingatkan bahwa biaya booking tidak dikembalikan sebelum membatalkan", async () => {
    actions.findBookingStatus.mockResolvedValue({ ok: true, data: confirmed });
    actions.cancelSiteBooking.mockResolvedValue({
      ok: true,
      data: { ...confirmed, status: "DIBATALKAN", statusLabel: "Dibatalkan", canCancel: false, canReschedule: false, rescheduleLink: null },
    });
    render(<BookingStatusLookup />);
    await lookUp();

    await userEvent.click(await screen.findByRole("button", { name: "Batalkan booking" }));
    expect(screen.getByText(/Biaya booking Rp 100.000 tidak dikembalikan/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ya, batalkan" }));

    expect(await screen.findByText("Dibatalkan")).toBeInTheDocument();
    expect(actions.cancelSiteBooking).toHaveBeenCalledWith({ code: "SDY-8F3K", last4: "7890" });
  });
});
```

Run: `npx vitest run tests/unit/components/booking-status-lookup.test.tsx`
Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 2: Implementasi**

`src/components/pendaftaran/booking-status-lookup.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
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
import { formatIndonesianDate, formatRupiah } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { cancelSiteBooking, findBookingStatus, type PublicBookingStatus } from "@/server/public-booking";

const ACTIVE = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

export function BookingStatusLookup() {
  const [code, setCode] = useState("");
  const [last4, setLast4] = useState("");
  const [status, setStatus] = useState<PublicBookingStatus | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function lookup(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await findBookingStatus({ code, last4 });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setStatus(result.data);
        setNotFound(result.data === null);
      } catch {
        toast.error("Gagal memeriksa status. Coba lagi.");
      }
    });
  }

  function cancel() {
    if (!status) return;
    const bookingCode = status.code;
    setConfirming(false);
    startTransition(async () => {
      try {
        const result = await cancelSiteBooking({ code: bookingCode, last4 });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setStatus(result.data);
        toast.success("Booking dibatalkan.");
      } catch {
        toast.error("Pembatalan gagal. Coba lagi.");
      }
    });
  }

  const paidFee = status?.status === "TERKONFIRMASI" && status.bookingFee;

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl text-brown-900">Cek Status Booking</h1>

      <form onSubmit={lookup} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="kode-booking">Kode booking</Label>
          <Input
            id="kode-booking"
            placeholder="SDY-XXXX"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="empat-digit">4 digit terakhir nomor WhatsApp</Label>
          <Input
            id="empat-digit"
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button type="submit" disabled={pending}>
          Cek Status
        </Button>
      </form>

      {notFound && (
        <p role="status" className="text-sm text-brown-700">
          Booking tidak ditemukan. Periksa kode dan 4 digit terakhir nomor WhatsApp Anda.
        </p>
      )}

      {status && (
        <section aria-label="Status booking" className="space-y-3 rounded-2xl border border-cream-300 bg-white p-4">
          <p className="font-mono text-sm text-brown-600">{status.code}</p>
          <p className="text-xl font-semibold text-brown-900">{status.statusLabel}</p>
          <dl className="space-y-1 text-sm text-brown-700">
            <div>{status.serviceName} · {status.staffName}</div>
            <div>{status.branchName}</div>
            <div>
              {formatIndonesianDate(status.startAt)}, pukul {minutesToTimeLabel(witaMinutesOfDay(status.startAt))} WITA
            </div>
            <div>{status.maskedWhatsapp}</div>
          </dl>

          {status.status === "KEDALUWARSA" && (
            <p className="text-sm text-brown-700">
              Booking ini kedaluwarsa karena belum dikonfirmasi dalam 24 jam.{" "}
              <Link href="/daftar" className="underline underline-offset-4">
                Booking ulang
              </Link>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {status.canReschedule && status.rescheduleLink && (
              <Button asChild variant="outline">
                <a href={status.rescheduleLink} target="_blank" rel="noopener noreferrer">
                  Pindah jadwal via WhatsApp
                </a>
              </Button>
            )}
            {status.canCancel && (
              <Button variant="destructive" onClick={() => setConfirming(true)} disabled={pending}>
                Batalkan booking
              </Button>
            )}
          </div>

          {!status.canCancel && ACTIVE.includes(status.status) && (
            <p className="text-sm text-brown-700">
              Kurang dari 2 jam sebelum jadwal. Untuk batal atau pindah jadwal, hubungi kami lewat{" "}
              <a
                href={buildWhatsAppLink(`Halo SunDY Clinic, saya ingin mengubah booking ${status.code}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                WhatsApp
              </a>
              .
            </p>
          )}
        </section>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan booking {status?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {paidFee
                ? `Biaya booking ${formatRupiah(paidFee)} tidak dikembalikan. Ingin pindah jadwal saja? Biaya tetap berlaku bila jadwal dipindah paling lambat 2 jam sebelumnya.`
                : "Jam Anda akan dilepas untuk pasien lain."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={cancel}>
              Ya, batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

`src/app/(public)/cek-booking/page.tsx`:

```tsx
import type { Metadata } from "next";
import { BookingStatusLookup } from "@/components/pendaftaran/booking-status-lookup";

export const metadata: Metadata = {
  title: "Cek Status Booking",
  description: "Cek status booking SunDY Clinic dengan kode booking dan 4 digit terakhir nomor WhatsApp.",
};

export default function BookingStatusPage() {
  return <BookingStatusLookup />;
}
```

- [ ] **Step 3: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/components/booking-status-lookup.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS (3 uji), tanpa galat.

- [ ] **Step 4: Commit**

```bash
git add src/components/pendaftaran/booking-status-lookup.tsx "src/app/(public)/cek-booking" tests/unit/components/booking-status-lookup.test.tsx
git commit -m "feat: /cek-booking status page with patient cancellation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 16: Admin — mencocokkan booking situs dengan pasien

**Files:**
- Create: `src/server/patient-store.ts`
- Modify: `src/server/patient.ts` (`createPatient` memakai `insertPatient`)
- Create: `src/server/intake.ts` (`getMatchCandidates`, `matchPatient`, `createPatientFromIntake`)
- Modify: `src/server/appointment.ts` (`setStatus` wajib pasien; `listAppointments` memuat identitas isian)
- Create: `src/components/admin/match-patient-dialog.tsx`
- Modify: `src/components/admin/appointment-table.tsx`
- Modify: `src/app/(admin)/admin/booking/page.tsx`
- Test: `tests/integration/intake-matching.test.ts`

**Interfaces:**
- Consumes: Task 1 (skema), Task 10 (booking situs).
- Produces:
  - `insertPatient(db: Prisma.TransactionClient | PrismaClient, data): Promise<Patient>`;
  - `type MatchCandidates = { code; intake: { name; whatsapp; birthDateLabel: string | null; claimsReturning: boolean }; candidates: MatchCandidate[] }`;
  - `getMatchCandidates(appointmentId): Promise<ActionResult<MatchCandidates>>`;
  - `matchPatient(appointmentId, patientId): Promise<ActionResult<void>>`;
  - `createPatientFromIntake(appointmentId): Promise<ActionResult<{ patientId: string; medicalRecordNumber: string }>>`;
  - `BookingRow` mendapat `needsMatch: boolean` dan `intakeId: string | null`, dan `AppointmentTable` menerima prop `canReadRecords: boolean`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/integration/intake-matching.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  cancelAppointment,
  listAppointments,
  markAttended,
  markNoShow,
  verifyAppointment,
} from "@/server/appointment";
import { createPatientFromIntake, getMatchCandidates, matchPatient } from "@/server/intake";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "cocokkan-uji";
const FAMILY_WA = "6281200006610";
const OTHER_WA = "6281200006611";

describe("mencocokkan booking situs dengan pasien", () => {
  let world: BookingWorld;
  let date: string;
  let hour = 10;

  beforeEach(async () => {
    await cleanupBookingWorld(SLUG, [FAMILY_WA, OTHER_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [FAMILY_WA, OTHER_WA]);
    await prisma.$disconnect();
  });

  /** Booking situs yang belum dicocokkan, seperti hasil submitSiteBooking. */
  async function siteBooking(name = "Siti Rahayu", whatsapp = FAMILY_WA) {
    hour += 1;
    const appointment = await prisma.appointment.create({
      data: {
        code: `COCOK-${hour}`,
        type: "KONSULTASI",
        startAt: at(date, `${hour}:00`),
        endAt: at(date, `${hour}:30`),
        source: "SITUS",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: null,
        bookingFee: 100000,
      },
    });
    await prisma.intake.create({
      data: {
        appointmentId: appointment.id,
        status: "TERISI",
        kind: "LENGKAP",
        purpose: "SLIMMING",
        claimsReturning: true,
        quizVersion: 1,
        answers: { patientType: "BARU", purpose: "SLIMMING" },
        name,
        whatsapp,
        birthDate: new Date("1992-04-17T00:00:00Z"),
        gender: "P",
        occupation: "Guru",
        address: "Jl. Sam Ratulangi",
      },
    });
    return appointment;
  }

  it("menyarankan pasien dengan nomor WA sama, atau nama & tanggal lahir sama, tanpa data klinis", async () => {
    const booking = await siteBooking();
    await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6610", name: "Ibu Maria", whatsapp: FAMILY_WA },
    });
    await prisma.patient.create({
      data: {
        medicalRecordNumber: "SDY-2026-6611",
        name: "Siti Rahayu Lumban",
        whatsapp: OTHER_WA,
        birthDate: new Date("1992-04-17T00:00:00Z"),
      },
    });

    const result = await unwrap(getMatchCandidates(booking.id));
    expect(result.intake).toEqual({
      name: "Siti Rahayu",
      whatsapp: FAMILY_WA,
      birthDateLabel: "17/04/1992",
      claimsReturning: true,
    });
    expect(result.candidates.map((c) => c.medicalRecordNumber).sort()).toEqual(["SDY-2026-6610", "SDY-2026-6611"]);
    expect(JSON.stringify(result)).not.toMatch(/answers|SLIMMING/);
  });

  it("menautkan pasien lama ke booking dan isiannya, lalu booking bisa diverifikasi", async () => {
    const booking = await siteBooking();
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6612", name: "Siti Rahayu", whatsapp: FAMILY_WA },
    });

    await unwrap(matchPatient(booking.id, patient.id));

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id }, include: { intake: true } });
    expect(after.patientId).toBe(patient.id);
    expect(after.intake?.patientId).toBe(patient.id);
    expect((await unwrap(verifyAppointment(booking.id))).status).toBe("TERKONFIRMASI");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: booking.id, action: "appointment.match-patient" },
    });
    expect(audit.summary).toContain("SDY-2026-6612");
  });

  it("membuat pasien baru dari identitas isian", async () => {
    const booking = await siteBooking();

    const { patientId, medicalRecordNumber } = await unwrap(createPatientFromIntake(booking.id));

    expect(medicalRecordNumber).toMatch(/^SDY-\d{4}-\d{4}$/);
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(patient).toMatchObject({ name: "Siti Rahayu", whatsapp: FAMILY_WA, gender: "P", occupation: "Guru" });
    expect(patient.birthDate?.toISOString().slice(0, 10)).toBe("1992-04-17");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id } })).patientId).toBe(patientId);
  });

  it("menolak verifikasi, hadir, dan tidak hadir sebelum dicocokkan, tetapi mengizinkan pembatalan", async () => {
    const booking = await siteBooking();
    const message = "Cocokkan booking ini dengan data pasien lebih dulu.";

    expect(await verifyAppointment(booking.id)).toEqual({ ok: false, error: message });
    expect(await markAttended(booking.id)).toEqual({ ok: false, error: message });
    expect(await markNoShow(booking.id)).toEqual({ ok: false, error: message });
    expect((await unwrap(cancelAppointment(booking.id))).status).toBe("DIBATALKAN");
  });

  it("pencocokan bisa diganti sebelum verifikasi, tetapi tidak sesudahnya", async () => {
    const booking = await siteBooking();
    const first = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6613", name: "Siti A", whatsapp: FAMILY_WA },
    });
    const second = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-6614", name: "Siti B", whatsapp: FAMILY_WA },
    });

    await unwrap(matchPatient(booking.id, first.id));
    await unwrap(matchPatient(booking.id, second.id));
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id } })).patientId).toBe(second.id);

    await unwrap(verifyAppointment(booking.id));
    expect(await matchPatient(booking.id, first.id)).toEqual({
      ok: false,
      error: "Pasien hanya bisa dicocokkan sebelum booking diverifikasi.",
    });
  });

  it("daftar booking hanya membawa identitas isian, bukan jawaban klinis", async () => {
    await siteBooking();
    const rows = await listAppointments({ date });
    const row = rows.find((r) => r.code.startsWith("COCOK-"))!;
    expect(row.intake).toEqual({ id: expect.any(String), name: "Siti Rahayu", whatsapp: FAMILY_WA, status: "TERISI" });
  });
});
```

Run: `npm run test:integration -- tests/integration/intake-matching.test.ts`
Expected: FAIL, "Cannot find module '@/server/intake'".

- [ ] **Step 2: Pindahkan pembuatan pasien ke modul biasa**

`src/server/patient-store.ts`:

```ts
import type { Gender, Patient, Prisma, PrismaClient } from "@prisma/client";
import { formatMedicalRecordNumber } from "@/lib/medical-record-number";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Mengalokasikan nomor urut berikutnya untuk tahun ini secara atomik.
 *
 * INSERT ... ON CONFLICT DO UPDATE adalah satu pernyataan tunggal di
 * PostgreSQL — baris dikunci selama pernyataan itu berjalan, sehingga dua
 * panggilan bersamaan tidak akan pernah membaca nilai yang sama sebelum
 * menulis. Di dalam transaksi, nomor ikut batal bila transaksi batal.
 */
async function nextMedicalRecordSequence(db: Db, year: number): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "PatientNumberCounter" ("year", "value")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "PatientNumberCounter"."value" + 1
    RETURNING "value"
  `;
  return rows[0].value;
}

/**
 * Membuat pasien dengan nomor rekam medis baru. Modul biasa (bukan
 * "use server"): pemanggil wajib sudah memeriksa hak akses dan memvalidasi
 * input, karena nomor urut yang sudah diambil tidak pernah dikembalikan.
 */
export async function insertPatient(
  db: Db,
  data: {
    name: string;
    whatsapp: string;
    birthDate: Date | null;
    gender?: Gender | null;
    occupation?: string | null;
    address?: string | null;
  },
): Promise<Patient> {
  const year = new Date().getFullYear();
  const sequence = await nextMedicalRecordSequence(db, year);
  return db.patient.create({
    data: { medicalRecordNumber: formatMedicalRecordNumber(year, sequence), ...data },
  });
}
```

Di `src/server/patient.ts`:
- hapus fungsi `nextMedicalRecordSequence` beserta komentarnya, juga import `formatMedicalRecordNumber`;
- tambahkan `import { insertPatient } from "@/server/patient-store";`;
- di `createPatient`, ganti tiga baris `year`/`sequence`/`medicalRecordNumber` dan pemanggilan `prisma.patient.create(...)` dengan:

```ts
    const patient = await insertPatient(prisma, {
      name,
      whatsapp,
      birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null,
      gender: input.gender,
      occupation: input.occupation,
      address: input.address,
    });
```

Run: `npm run test:integration -- tests/integration/patient.test.ts`
Expected: PASS. Perilaku pembuatan pasien tidak berubah.

- [ ] **Step 3: Penjaga status di `appointment.ts`**

Di `src/server/appointment.ts`, ganti fungsi `staleStatusError` dan `setStatus` dengan:

```ts
/**
 * Pesan untuk UPDATE bersyarat yang tidak mengubah apa pun: pasien belum
 * dicocokkan (booking situs), atau statusnya sudah berubah.
 */
async function rejectedChangeError(id: string, needsPatient = false): Promise<UserFacingError> {
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

/**
 * Pembaruan bersyarat: baris hanya berubah bila statusnya saat ini masih
 * salah satu dari `from`. Satu pernyataan UPDATE ... WHERE status IN (...)
 * bersifat atomik, sehingga dua admin yang mengklik bersamaan tidak saling
 * menimpa, dan booking yang sudah dibatalkan tidak bisa "hidup lagi" lewat
 * tombol Hadir — yang juga akan menabrak exclusion constraint bila slotnya
 * sudah diisi orang lain. Selain pembatalan, booking wajib sudah punya
 * pasien (CHECK appointment_patient_required menjaga hal yang sama di basis data).
 */
async function setStatus(
  id: string,
  from: AppointmentStatus[],
  to: AppointmentStatus,
  action: string,
  summary?: string,
): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const needsPatient = to !== "DIBATALKAN";

    const { count } = await prisma.appointment.updateMany({
      where: { id, status: { in: from }, ...(needsPatient ? { patientId: { not: null } } : {}) },
      data: { status: to },
    });
    if (count === 0) throw await rejectedChangeError(id, needsPatient);

    await recordAudit({ actor, action, entity: "Appointment", entityId: id, summary });

    safeRevalidatePath("/admin/booking");
    return prisma.appointment.findUniqueOrThrow({ where: { id } });
  });
}
```

Di `rescheduleAppointment`, ganti `throw await staleStatusError(id);` dengan `throw await rejectedChangeError(id);`.

Di `listAppointments`, ganti `include: { patient: true, staff: true, branch: true, service: true },` dengan:

```ts
    // Isian hanya membawa identitas: daftar booking juga dibuka resepsionis,
    // yang tidak boleh menerima jawaban klinis (spec 6.2).
    include: {
      patient: true,
      staff: true,
      branch: true,
      service: true,
      intake: { select: { id: true, name: true, whatsapp: true, status: true } },
    },
```

- [ ] **Step 4: Aksi pencocokan**

`src/server/intake.ts`:

```ts
"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { insertPatient } from "@/server/patient-store";
import { requireCapability } from "@/server/session";

export type MatchCandidate = {
  id: string;
  medicalRecordNumber: string;
  name: string;
  whatsapp: string;
  birthDateLabel: string | null;
  lastVisitLabel: string | null;
};

export type MatchCandidates = {
  code: string;
  intake: { name: string; whatsapp: string; birthDateLabel: string | null; claimsReturning: boolean };
  candidates: MatchCandidate[];
};

/** Kolom @db.Date → "17/04/1992". */
function dateLabel(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10).split("-").reverse().join("/") : null;
}

/** Hanya booking situs yang belum diverifikasi yang boleh dicocokkan (spec 6.1). */
async function loadMatchable(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      code: true,
      source: true,
      status: true,
      intake: {
        select: {
          id: true,
          name: true,
          whatsapp: true,
          birthDate: true,
          gender: true,
          occupation: true,
          address: true,
          claimsReturning: true,
        },
      },
    },
  });
  if (!appointment || appointment.source !== "SITUS" || !appointment.intake) {
    throw new UserFacingError("Hanya booking dari situs yang perlu dicocokkan.");
  }
  if (appointment.status !== "MENUNGGU_KONFIRMASI") {
    throw new UserFacingError("Pasien hanya bisa dicocokkan sebelum booking diverifikasi.");
  }
  return { ...appointment, intake: appointment.intake };
}

async function linkPatient(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  intakeId: string,
  patientId: string,
) {
  const { count } = await tx.appointment.updateMany({
    where: { id: appointmentId, source: "SITUS", status: "MENUNGGU_KONFIRMASI" },
    data: { patientId },
  });
  if (count === 0) throw new UserFacingError("Status booking baru saja berubah. Muat ulang halaman.");
  await tx.intake.update({ where: { id: intakeId }, data: { patientId } });
}

/**
 * Saran pasien yang mirip: nomor WA sama, atau nama depan & tanggal lahir
 * sama. Tidak ada pencocokan otomatis — satu nomor WA sering dipakai
 * sekeluarga, jadi admin yang memutuskan (spec K4, bagian 7).
 */
export async function getMatchCandidates(appointmentId: string): Promise<ActionResult<MatchCandidates>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const { code, intake } = await loadMatchable(appointmentId);

    const firstName = intake.name?.trim().split(/\s+/)[0] ?? "";
    const patients = await prisma.patient.findMany({
      where: {
        OR: [
          ...(intake.whatsapp ? [{ whatsapp: intake.whatsapp }] : []),
          ...(intake.birthDate && firstName
            ? [{ birthDate: intake.birthDate, name: { contains: firstName, mode: "insensitive" as const } }]
            : []),
        ],
      },
      orderBy: { name: "asc" },
      take: 10,
      select: {
        id: true,
        medicalRecordNumber: true,
        name: true,
        whatsapp: true,
        birthDate: true,
        appointments: {
          where: { status: { in: ["HADIR", "SELESAI"] } },
          orderBy: { startAt: "desc" },
          take: 1,
          select: { startAt: true },
        },
      },
    });

    return {
      code,
      intake: {
        name: intake.name ?? "",
        whatsapp: intake.whatsapp ?? "",
        birthDateLabel: dateLabel(intake.birthDate),
        claimsReturning: intake.claimsReturning ?? false,
      },
      candidates: patients.map((patient) => ({
        id: patient.id,
        medicalRecordNumber: patient.medicalRecordNumber,
        name: patient.name,
        whatsapp: patient.whatsapp,
        birthDateLabel: dateLabel(patient.birthDate),
        lastVisitLabel: patient.appointments[0] ? formatIndonesianDate(patient.appointments[0].startAt) : null,
      })),
    };
  });
}

export async function matchPatient(appointmentId: string, patientId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const appointment = await loadMatchable(appointmentId);
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, medicalRecordNumber: true },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");

    await prisma.$transaction((tx) => linkPatient(tx, appointment.id, appointment.intake.id, patient.id));

    await recordAudit({
      actor,
      action: "appointment.match-patient",
      entity: "Appointment",
      entityId: appointment.id,
      summary: `${appointment.code} → ${patient.medicalRecordNumber}`,
    });
    safeRevalidatePath("/admin/booking");
  });
}

export async function createPatientFromIntake(
  appointmentId: string,
): Promise<ActionResult<{ patientId: string; medicalRecordNumber: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const appointment = await loadMatchable(appointmentId);
    const { intake } = appointment;
    const name = intake.name;
    const whatsapp = intake.whatsapp;
    if (!name || !whatsapp) throw new UserFacingError("Isian ini belum memuat nama dan nomor WhatsApp.");

    // Nomor RM dialokasikan di dalam transaksi yang sama: bila pencocokan
    // gagal, nomornya ikut batal dan tidak terbuang.
    const patient = await prisma.$transaction(async (tx) => {
      const created = await insertPatient(tx, {
        name,
        whatsapp,
        birthDate: intake.birthDate,
        gender: intake.gender,
        occupation: intake.occupation,
        address: intake.address,
      });
      await linkPatient(tx, appointment.id, intake.id, created.id);
      return created;
    });

    await recordAudit({
      actor,
      action: "patient.create",
      entity: "Patient",
      entityId: patient.id,
      summary: `${patient.name} (${patient.medicalRecordNumber}) dari booking ${appointment.code}`,
    });
    await recordAudit({
      actor,
      action: "appointment.match-patient",
      entity: "Appointment",
      entityId: appointment.id,
      summary: `${appointment.code} → ${patient.medicalRecordNumber} (pasien baru)`,
    });
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin/pasien");
    return { patientId: patient.id, medicalRecordNumber: patient.medicalRecordNumber };
  });
}
```

Run: `npm run test:integration -- tests/integration/intake-matching.test.ts`
Expected: PASS (6 uji).

- [ ] **Step 5: Dialog pencocokan dan daftar booking**

`src/components/admin/match-patient-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import {
  createPatientFromIntake,
  getMatchCandidates,
  matchPatient,
  type MatchCandidates,
} from "@/server/intake";

export function MatchPatientDialog({ appointmentId, code }: { appointmentId: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MatchCandidates | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setData(null);
    startTransition(async () => {
      try {
        const result = await getMatchCandidates(appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          setOpen(false);
          return;
        }
        setData(result.data);
      } catch {
        toast.error("Gagal memuat data pasien. Coba lagi.");
        setOpen(false);
      }
    });
  }

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        setOpen(false);
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Cocokkan pasien</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cocokkan pasien — {code}</DialogTitle>
          <DialogDescription>
            Pilih pasien lama yang benar-benar orang yang sama, atau buat pasien baru dari isian. Satu nomor
            WhatsApp sering dipakai sekeluarga — periksa nama dan tanggal lahir.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{data.intake.name}</p>
              <p>
                {data.intake.whatsapp} · lahir {data.intake.birthDateLabel ?? "—"}
              </p>
              <p className="text-muted-foreground">
                {data.intake.claimsReturning ? "Mengaku pernah berobat di sini" : "Mengaku pasien baru"}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Pasien yang mirip</p>
              {data.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada pasien dengan nomor WhatsApp, atau nama & tanggal lahir, yang sama.
                </p>
              ) : (
                data.candidates.map((candidate) => (
                  <div key={candidate.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <div>
                      <p className="font-medium">{candidate.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {candidate.medicalRecordNumber} · {candidate.whatsapp} · lahir {candidate.birthDateLabel ?? "—"} ·
                        kunjungan terakhir {candidate.lastVisitLabel ?? "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(() => matchPatient(appointmentId, candidate.id), `${code} dicocokkan dengan ${candidate.name}.`)
                      }
                    >
                      Pilih pasien ini
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending || !data}
            onClick={() => run(() => createPatientFromIntake(appointmentId), `Pasien baru dibuat untuk ${code}.`)}
          >
            Buat pasien baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Di `src/components/admin/appointment-table.tsx`:

1. Tambahkan import:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MatchPatientDialog } from "./match-patient-dialog";
```

2. Pada tipe `BookingRow`, tambahkan setelah `notes: string | null;`:

```ts
  /** Booking situs yang belum dicocokkan dengan data pasien (spec 6.1). */
  needsMatch: boolean;
  /** Isian pendaftaran booking ini, bila ada. */
  intakeId: string | null;
```

3. Ubah tanda tangan komponen menjadi:

```tsx
export function AppointmentTable({ rows, canReadRecords }: { rows: BookingRow[]; canReadRecords: boolean }) {
```

4. Di sel pasien, tepat setelah `<div className="font-medium">{row.patientName}</div>`, tambahkan:

```tsx
                {row.needsMatch && (
                  <Badge variant="outline" className="mt-1">
                    Belum dicocokkan
                  </Badge>
                )}
```

5. Di sel aksi, ganti blok `{row.status === "MENUNGGU_KONFIRMASI" && ( … Verifikasi … )}` dengan:

```tsx
                  {row.status === "MENUNGGU_KONFIRMASI" && row.needsMatch && (
                    <MatchPatientDialog appointmentId={row.id} code={row.code} />
                  )}
                  {row.status === "MENUNGGU_KONFIRMASI" && !row.needsMatch && (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() => verifyAppointment(row.id), `Booking ${row.code} terkonfirmasi.`)
                      }
                    >
                      Verifikasi
                    </Button>
                  )}
                  {row.intakeId && canReadRecords && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/admin/isian/${row.intakeId}`}>Lihat isian</Link>
                    </Button>
                  )}
```

6. Di blok `{ACTIVE.includes(row.status) && ( <> … Hadir … Tidak Hadir … Batalkan … </> )}`, bungkus tombol **Hadir** dan **Tidak Hadir** dengan `{!row.needsMatch && ( <> … </> )}`. Tombol **Batalkan** tetap tampil untuk semua booking aktif.

Di `src/app/(admin)/admin/booking/page.tsx`:
- tambahkan `import { can } from "@/lib/permissions";`;
- ganti `await requireCapability("booking:manage");` dengan `const staff = await requireCapability("booking:manage");`;
- pada objek yang dikembalikan `appointments.map`, ganti baris `patientName` dan `patientRecordNumber` dari Task 1 dengan:

```tsx
      patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
      patientRecordNumber: patient?.medicalRecordNumber ?? "—",
      needsMatch: patient === null,
      intakeId: a.intake?.id ?? null,
```

- ganti `<AppointmentTable rows={rows} />` dengan:

```tsx
          <AppointmentTable rows={rows} canReadRecords={can(staff.role, "record:read")} />
```

Run: `npx tsc --noEmit && npm run lint && npm run test:integration && npm test`
Expected: semua lulus.

- [ ] **Step 6: Commit**

```bash
git add src/server/patient-store.ts src/server/patient.ts src/server/intake.ts src/server/appointment.ts src/components/admin/match-patient-dialog.tsx src/components/admin/appointment-table.tsx "src/app/(admin)/admin/booking/page.tsx" tests/integration/intake-matching.test.ts
git commit -m "feat: admins match site bookings to a patient before verifying

Suggests patients sharing the WhatsApp number or first name and birth
date, never matches on its own, and blocks verify/attend/no-show until a
patient is linked. The booking list carries only the intake's identity.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Halaman isian untuk dokter (baca saja)

**Files:**
- Modify: `src/server/intake.ts` (`getIntakeForStaff`)
- Create: `src/components/admin/intake-view.tsx`
- Create: `src/app/(admin)/admin/isian/[id]/page.tsx`
- Test: `tests/integration/intake-access.test.ts`, `tests/unit/components/intake-view.test.tsx`

**Interfaces:**
- Consumes: Task 7 (`describeAnswers`, `activityTable`), Task 10 (isian tersimpan), Task 16.
- Produces:
  - `type IntakeDetail`;
  - `getIntakeForStaff(intakeId: string): Promise<IntakeDetail | null>`. Nilai `clinical` bernilai `null` untuk peran tanpa `record:read`;
  - `IntakeView({ intake: IntakeDetail })`.

- [ ] **Step 1: Tulis uji akses yang gagal**

`tests/integration/intake-access.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getIntakeForStaff } from "@/server/intake";
import { holdSlot, submitSiteBooking } from "@/server/public-booking";
import { requireCapability } from "@/server/session";
import { newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));
vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "akses-isian-uji";

function actAs(role: "DOKTER" | "RESEPSIONIS") {
  vi.mocked(requireCapability).mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: `${role} Uji`,
    role,
    email: "uji@sundy.test",
  });
}

describe("akses isian pendaftaran", () => {
  let intakeId: string;

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG);
    const world = await createBookingWorld(SLUG);
    const date = await bookableDate();
    const startAt = at(date, "11:00").toISOString();
    const { token } = await unwrap(
      holdSlot({ serviceId: world.consultationId, staffId: world.doctorId, branchId: world.branchId, startAt, previousToken: null }),
    );
    await unwrap(
      submitSiteBooking({
        holdToken: token,
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        startAt,
        answers: slimmingNewPatient,
        identity: newPatientIdentity,
        consentData: true,
        consentFee: true,
        website: "",
      }),
    );
    intakeId = (await prisma.intake.findFirstOrThrow({ where: { submissionKey: token } })).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG);
    await prisma.$disconnect();
  });

  it("dokter menerima jawaban klinis lengkap, termasuk berat & tinggi dari kolom bertipe", async () => {
    actAs("DOKTER");
    const intake = await getIntakeForStaff(intakeId);

    const lines = intake!.clinical!.sections.flatMap((s) => s.lines);
    expect(lines).toContain("Darah tinggi: Amlodipine 5 mg, 1× sehari");
    expect(lines).toContain("72 kg · 158 cm · IMT 28,8");
    expect(intake!.identity.name).toBe("Siti Rahayu");
  });

  it("resepsionis hanya menerima identitas, tanpa bagian klinis sama sekali", async () => {
    actAs("RESEPSIONIS");
    const intake = await getIntakeForStaff(intakeId);

    expect(intake!.clinical).toBeNull();
    expect(JSON.stringify(intake)).not.toMatch(/Amlodipine|IMT|Nasi kuning/);
    expect(intake!.identity.name).toBe("Siti Rahayu");
  });

  it("mengembalikan null untuk isian yang tidak ada", async () => {
    actAs("DOKTER");
    expect(await getIntakeForStaff("tidak-ada")).toBeNull();
  });
});
```

Run: `npm run test:integration -- tests/integration/intake-access.test.ts`
Expected: FAIL, `getIntakeForStaff` tidak diekspor.

- [ ] **Step 2: Implementasi `getIntakeForStaff`**

Di `src/server/intake.ts`, tambahkan import:

```ts
import type { ActivityRow, IntakeSection } from "@/lib/kuis/v1/describe";
import { activityTable, describeAnswers } from "@/lib/kuis/v1/describe";
import { quizAnswersSchema } from "@/lib/kuis/v1/answers";
import { PURPOSES, QUIZ_VERSION } from "@/lib/kuis/v1/options";
import { can } from "@/lib/permissions";
```

Lalu tambahkan di akhir berkas:

```ts
export type IntakeDetail = {
  id: string;
  status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA";
  kind: "LENGKAP" | "PENDEK";
  purposeLabel: string | null;
  submittedAt: Date | null;
  appointment: { code: string; startAt: Date; serviceName: string; staffName: string };
  patient: { name: string; medicalRecordNumber: string } | null;
  identity: {
    name: string | null;
    whatsapp: string | null;
    birthDateLabel: string | null;
    genderLabel: string | null;
    occupation: string | null;
    address: string | null;
  };
  /** null untuk peran tanpa record:read, atau bila pasien belum mengisi. */
  clinical: {
    sections: IntakeSection[];
    activities: ActivityRow[] | null;
    activityDateLabel: string | null;
  } | null;
};

/** Kolom klinis dibaca dengan kueri terpisah, hanya untuk yang berhak (spec 6.2). */
async function loadClinical(intakeId: string): Promise<IntakeDetail["clinical"]> {
  const row = await prisma.intake.findUniqueOrThrow({
    where: { id: intakeId },
    select: { quizVersion: true, answers: true, selfWeightKg: true, selfHeightCm: true, activityDate: true },
  });
  if (row.answers === null) return null;
  if (row.quizVersion !== QUIZ_VERSION) {
    throw new Error(`Isian dengan kuis versi ${row.quizVersion} belum bisa ditampilkan.`);
  }

  const answers = quizAnswersSchema.parse(row.answers);
  // Berat & tinggi disimpan di kolom bertipe, bukan di JSON (spec 5.1).
  if (answers.slimming && row.selfWeightKg !== null && row.selfHeightCm !== null) {
    answers.slimming.weightKg = Number(row.selfWeightKg);
    answers.slimming.heightCm = Number(row.selfHeightCm);
  }

  return {
    // Aktivitas tampil sebagai tabel 06.00–22.00, bukan daftar baris.
    sections: describeAnswers(answers).filter((section) => section.step !== "P3"),
    activities: answers.returning?.activities ? activityTable(answers.returning.activities) : null,
    activityDateLabel: row.activityDate ? formatIndonesianDate(row.activityDate) : null,
  };
}

export async function getIntakeForStaff(intakeId: string): Promise<IntakeDetail | null> {
  const staff = await requireCapability("booking:manage");

  const row = await prisma.intake.findUnique({
    where: { id: intakeId },
    select: {
      id: true,
      status: true,
      kind: true,
      purpose: true,
      submittedAt: true,
      name: true,
      whatsapp: true,
      birthDate: true,
      gender: true,
      occupation: true,
      address: true,
      appointment: {
        select: {
          code: true,
          startAt: true,
          service: { select: { name: true } },
          staff: { select: { name: true } },
        },
      },
      patient: { select: { name: true, medicalRecordNumber: true } },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    purposeLabel: row.purpose ? PURPOSES[row.purpose] : null,
    submittedAt: row.submittedAt,
    appointment: {
      code: row.appointment.code,
      startAt: row.appointment.startAt,
      serviceName: row.appointment.service?.name ?? "Konsultasi",
      staffName: row.appointment.staff.name,
    },
    patient: row.patient,
    identity: {
      name: row.name,
      whatsapp: row.whatsapp,
      birthDateLabel: dateLabel(row.birthDate),
      genderLabel: row.gender === "P" ? "Perempuan" : row.gender === "L" ? "Laki-laki" : null,
      occupation: row.occupation,
      address: row.address,
    },
    clinical: can(staff.role, "record:read") ? await loadClinical(row.id) : null,
  };
}
```

Run: `npm run test:integration -- tests/integration/intake-access.test.ts`
Expected: PASS (3 uji).

- [ ] **Step 3: Tulis uji tampilan yang gagal**

`tests/unit/components/intake-view.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntakeView } from "@/components/admin/intake-view";
import { activityTable, describeAnswers } from "@/lib/kuis/v1/describe";
import type { IntakeDetail } from "@/server/intake";
import { slimmingReturningPatient } from "../../fixtures/quiz-answers";

const intake: IntakeDetail = {
  id: "i1",
  status: "TERISI",
  kind: "PENDEK",
  purposeLabel: "Slimming",
  submittedAt: new Date("2026-09-28T02:00:00Z"),
  appointment: { code: "SDY-8F3K", startAt: new Date("2026-10-01T07:00:00Z"), serviceName: "Konsultasi Dokter", staffName: "Dr. Diane" },
  patient: null,
  identity: {
    name: "Siti Rahayu",
    whatsapp: "6281234567890",
    birthDateLabel: "17/04/1992",
    genderLabel: null,
    occupation: null,
    address: null,
  },
  clinical: {
    sections: describeAnswers(slimmingReturningPatient).filter((s) => s.step !== "P3"),
    activities: activityTable(slimmingReturningPatient.returning.activities),
    activityDateLabel: "Minggu, 27 September 2026",
  },
};

describe("IntakeView", () => {
  it("menampilkan bagian jawaban dan status pencocokan", () => {
    render(<IntakeView intake={intake} />);
    expect(screen.getByText("Belum dicocokkan")).toBeInTheDocument();
    expect(screen.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari")).toBeInTheDocument();
  });

  it("menampilkan tabel aktivitas 06.00–22.00 dengan jam kosong tetap ada", () => {
    render(<IntakeView intake={intake} />);
    const table = screen.getByRole("table", { name: /Aktivitas Minggu, 27 September 2026/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(18); // judul + 17 jam
    expect(rows[1]).toHaveTextContent("06.00");
    expect(rows[1]).toHaveTextContent("Kapsul M");
    expect(rows[3]).toHaveTextContent("08.00");
  });
});
```

Run: `npx vitest run tests/unit/components/intake-view.test.tsx`
Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 4: Komponen dan halaman**

`src/components/admin/intake-view.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { IntakeDetail } from "@/server/intake";

const STATUS_LABEL: Record<IntakeDetail["status"], string> = {
  MENUNGGU_DIISI: "Menunggu diisi pasien",
  TERISI: "Terisi — belum diperiksa dokter",
  DIPERIKSA: "Sudah diperiksa dokter",
};

export function IntakeView({ intake }: { intake: IntakeDetail }) {
  const { appointment, identity, clinical } = intake;
  const time = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));

  return (
    <div className="max-w-3xl space-y-6">
      <section className="space-y-1 rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{appointment.code}</span>
          <Badge variant="outline">{STATUS_LABEL[intake.status]}</Badge>
          <Badge variant="secondary">{intake.kind === "LENGKAP" ? "Kuis lengkap" : "Kuis pendek"}</Badge>
        </div>
        <p>
          {appointment.serviceName} · {appointment.staffName} · {formatIndonesianDate(appointment.startAt)}, {time} WITA
        </p>
        <p>
          Pasien:{" "}
          {intake.patient ? (
            `${intake.patient.name} (${intake.patient.medicalRecordNumber})`
          ) : (
            <Badge variant="outline">Belum dicocokkan</Badge>
          )}
        </p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="text-base font-medium">Data diri dari isian</h2>
        <p>{identity.name ?? "—"} · {identity.whatsapp ?? "—"} · lahir {identity.birthDateLabel ?? "—"}</p>
        {identity.genderLabel && <p>{identity.genderLabel} · {identity.occupation ?? "—"}</p>}
        {identity.address && <p>{identity.address}</p>}
      </section>

      {!clinical ? (
        <p className="text-sm text-muted-foreground">Pasien belum mengisi kuis.</p>
      ) : (
        <>
          {clinical.sections.map((section) => (
            <section key={section.title} className="space-y-1">
              <h2 className="text-base font-medium">{section.title}</h2>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {section.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}

          {clinical.activities && (
            <section className="space-y-2">
              <h2 className="text-base font-medium">Aktivitas {clinical.activityDateLabel ?? "kemarin"}</h2>
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
      )}
    </div>
  );
}
```

`src/app/(admin)/admin/isian/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { IntakeView } from "@/components/admin/intake-view";
import { getIntakeForStaff } from "@/server/intake";
import { requireCapability } from "@/server/session";

/** Halaman ini untuk pembaca rekam medis saja; resepsionis ditolak di sini (spec 6.2). */
export default async function IntakePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("record:read");
  const { id } = await params;
  const intake = await getIntakeForStaff(id);
  if (!intake) notFound();

  return (
    <>
      <AdminHeader title="Isian Pendaftaran" />
      <div className="p-6">
        <IntakeView intake={intake} />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/components/intake-view.test.tsx && npx tsc --noEmit && npm run lint && npm test && npm run test:integration`
Expected: semua lulus.

- [ ] **Step 6: Commit**

```bash
git add src/server/intake.ts src/components/admin/intake-view.tsx "src/app/(admin)/admin/isian" tests/integration/intake-access.test.ts tests/unit/components/intake-view.test.tsx
git commit -m "feat: read-only intake page for doctors

Clinical answers are queried only for roles that may read medical
records; receptionists get the identity alone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Uji ujung-ke-ujung alur pendaftaran

**Files:**
- Modify: `tests/e2e/credentials.ts` (`E2E_RESEPSIONIS`)
- Modify: `tests/e2e/prepare-db.mts` (akun resepsionis, rekening uji)
- Create: `tests/e2e/public-registration.spec.ts`

**Interfaces:**
- Consumes: seluruh task sebelumnya dan teks antarmuka persis seperti di Task 12–17.

- [ ] **Step 1: Akun resepsionis dan rekening untuk uji**

Di `tests/e2e/credentials.ts`, tambahkan:

```ts
/** Akun resepsionis khusus uji — memastikan bagian klinis isian tidak terlihat olehnya. */
export const E2E_RESEPSIONIS = {
  email: process.env.E2E_RESEPSIONIS_EMAIL ?? "resepsionis-e2e@sundy.test",
  password: process.env.E2E_RESEPSIONIS_PASSWORD ?? "kataSandiResepsionisE2e123",
  name: "Resepsionis E2E",
};
```

Ganti isi `tests/e2e/prepare-db.mts` mulai dari baris `const existing = …` sampai sebelum `await prisma.$disconnect();` dengan:

```ts
async function ensureAccount(
  account: { email: string; password: string; name: string },
  slug: string,
  role: "SUPER_ADMIN" | "RESEPSIONIS",
) {
  const existing = await prisma.user.findFirst({ where: { email: account.email } });
  if (existing) return;
  const created = await auth.api.signUpEmail({
    body: { email: account.email, password: account.password, name: account.name },
  });
  const staff = await prisma.staff.upsert({
    where: { slug },
    update: { role, isActive: true },
    create: { slug, name: account.name, role },
  });
  await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });
}

await ensureAccount(E2E_ADMIN, "staf-e2e", "SUPER_ADMIN");
await ensureAccount(E2E_RESEPSIONIS, "resepsionis-e2e", "RESEPSIONIS");

// Rekening uji: halaman sukses menampilkan instruksi transfer yang lengkap.
await prisma.clinicSetting.update({
  where: { id: 1 },
  data: { bookingFee: 100000, bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" },
});
```

Ubah import di bagian atas berkas menjadi `import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";`.

Pastikan `await prisma.intake.deleteMany();` (Task 1) tetap berada sebelum `await prisma.appointment.deleteMany();`.

- [ ] **Step 2: Tulis uji E2E**

`tests/e2e/public-registration.spec.ts`:

```ts
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";

// Satu cerita berurutan: pasien mendaftar → admin mencocokkan & memverifikasi
// → resepsionis tidak melihat isi klinis → pasien membatalkan. Proyek desktop
// dan ponsel berjalan paralel, masing-masing dengan hari dan pasien sendiri.
// admin-booking.spec memakai Senin & Selasa; berkas ini Rabu & Kamis.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

function bookingDate(testInfo: TestInfo): string {
  const weekday = testInfo.project.name === "mobile" ? 4 : 3;
  const nowWita = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(nowWita.getUTCFullYear(), nowWita.getUTCMonth(), nowWita.getUTCDate()));
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== weekday);
  return date.toISOString().slice(0, 10);
}

function patientFor(testInfo: TestInfo) {
  return testInfo.project.name === "mobile"
    ? { name: "Pasien Ponsel E2E", whatsapp: "081299990002" }
    : { name: "Pasien Desktop E2E", whatsapp: "081299990001" };
}

let booking: { code: string; date: string } | null = null;
let intakeUrl: string | null = null;

const choose = (page: Page, name: string | RegExp) =>
  page.getByRole("radio", typeof name === "string" ? { name, exact: true } : { name }).click();
const tick = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true }).click();
const next = (page: Page) => page.getByRole("button", { name: "Lanjut", exact: true }).click();
const inGroup = (page: Page, group: string, option: string) =>
  page.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name: option, exact: true }).click();

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Kata Sandi").fill(account.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test("pasien baru Slimming mendaftar sampai mendapat kode booking", async ({ page }, testInfo) => {
  const date = bookingDate(testInfo);
  const patient = patientFor(testInfo);

  await page.goto("/daftar");
  await choose(page, "Belum, ini pertama kali");
  await choose(page, /^Slimming/);
  await choose(page, "Menurunkan berat badan");
  await choose(page, "5–10 kg");
  await tick(page, "Perut");
  await next(page);
  await choose(page, "Pernah");
  await tick(page, "Kurangi nasi / karbo");
  await next(page);
  await inGroup(page, "Hasil Kurangi nasi / karbo", "Berhasil");
  await page.getByLabel("Turun berapa kg? (Kurangi nasi / karbo)").fill("8");
  await inGroup(page, "Berat sekarang setelah Kurangi nasi / karbo", "Naik sebagian");
  await next(page);
  await page.getByLabel("Berat badan").fill("72");
  await page.getByLabel("Tinggi badan").fill("158");
  await expect(page.getByText(/IMT Anda ± 28,8/)).toBeVisible();
  await next(page);
  await page.getByLabel("Pagi", { exact: true }).fill("Nasi kuning, teh manis");
  await next(page);
  await tick(page, "Darah tinggi");
  await next(page);
  await page.getByLabel("Obat untuk Darah tinggi").fill("Amlodipine 5 mg, 1× sehari");
  await next(page);
  await inGroup(page, "Obat atau suplemen lain", "Tidak ada");
  await inGroup(page, "Alergi obat, makanan, atau kosmetik", "Tidak ada");
  await next(page);
  await choose(page, "Tidak");

  await expect(page.getByRole("heading", { name: "Ringkasan jawaban Anda" })).toBeVisible();
  await expect(page.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari")).toBeVisible();
  await page.getByRole("button", { name: "Pilih layanan & jadwal" }).click();

  await expect(page.getByText("Rp 100.000").first()).toBeVisible();
  await next(page);

  await page.getByLabel("Tanggal", { exact: true }).fill(date);
  await page.getByRole("group", { name: "Pilih jam" }).getByRole("button").first().click();
  await expect(page.getByText(/ditahan untuk Anda sampai pukul/)).toBeVisible();
  await next(page);

  await page.getByLabel("Nama lengkap").fill(patient.name);
  await page.getByLabel("Nomor WhatsApp").fill(patient.whatsapp);
  await page.getByLabel("Tanggal lahir").fill("1992-04-17");
  await inGroup(page, "Jenis kelamin", "Perempuan");
  await page.getByLabel("Pekerjaan").fill("Guru");
  await page.getByLabel("Alamat").fill("Jl. Uji E2E No. 1, Manado");
  await page.getByRole("checkbox", { name: /Kebijakan Privasi/ }).check();
  await page.getByRole("checkbox", { name: /mentransfer biaya booking/ }).check();
  await page.getByRole("button", { name: "Kirim pendaftaran" }).click();

  await expect(page.getByRole("heading", { name: "Pendaftaran diterima" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/BCA 1234567890 a\.n\. SunDY Clinic/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Konfirmasi via WhatsApp" })).toHaveAttribute("href", /wa\.me/);
  const code = (await page.getByText(/^SDY-[A-Z0-9]{4}$/).textContent())?.trim();
  expect(code).toMatch(/^SDY-[A-Z0-9]{4}$/);
  booking = { code: code!, date };
});

test("admin mencocokkan pasien, memverifikasi, lalu membaca isiannya", async ({ page }, testInfo) => {
  test.skip(!booking, "Butuh booking dari uji sebelumnya.");
  await signIn(page, E2E_ADMIN);
  await page.goto(`/admin/booking?tanggal=${booking!.date}`);

  const row = page.getByRole("row").filter({ hasText: booking!.code });
  await expect(row.getByText("Belum dicocokkan", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Cocokkan pasien" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(patientFor(testInfo).name).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Buat pasien baru" }).click();
  await expect(row.getByText("Belum dicocokkan", { exact: true })).toBeHidden({ timeout: 30_000 });

  await row.getByRole("button", { name: "Verifikasi" }).click();
  await expect(row.getByText("Terkonfirmasi", { exact: true })).toBeVisible({ timeout: 30_000 });

  await row.getByRole("link", { name: "Lihat isian" }).click();
  await expect(page.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari")).toBeVisible();
  await expect(page.getByText("72 kg · 158 cm · IMT 28,8")).toBeVisible();
  intakeUrl = page.url();
});

test("resepsionis melihat booking tanpa isi klinis isian", async ({ page }) => {
  test.skip(!booking || !intakeUrl, "Butuh booking dan isian dari uji sebelumnya.");
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto(`/admin/booking?tanggal=${booking!.date}`);

  const row = page.getByRole("row").filter({ hasText: booking!.code });
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: "Lihat isian" })).toHaveCount(0);

  await page.goto(intakeUrl!);
  await expect(page.getByText(/Amlodipine/)).toHaveCount(0);
});

test("pasien membatalkan booking lewat cek booking", async ({ page }, testInfo) => {
  test.skip(!booking, "Butuh booking dari uji sebelumnya.");
  await page.goto("/cek-booking");
  await page.getByLabel("Kode booking").fill(booking!.code);
  await page.getByLabel("4 digit terakhir nomor WhatsApp").fill(patientFor(testInfo).whatsapp.slice(-4));
  await page.getByRole("button", { name: "Cek Status" }).click();

  await expect(page.getByText("Terkonfirmasi", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pindah jadwal via WhatsApp" })).toBeVisible();

  await page.getByRole("button", { name: "Batalkan booking" }).click();
  await expect(page.getByText(/tidak dikembalikan/)).toBeVisible();
  await page.getByRole("button", { name: "Ya, batalkan" }).click();
  await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
});
```

- [ ] **Step 3: Jalankan seluruh uji E2E**

Run: `caffeinate -i npm run test:e2e`
Expected: semua uji lama lulus, ditambah 8 uji baru (4 × desktop/ponsel). Uji ini tidak boleh berjalan bersamaan dengan `npm run test:integration`.

Bila sebuah uji gagal karena hari Rabu/Kamis berikutnya adalah tanggal merah di data seed, periksa `prisma/seed.ts` (daftar libur 2026) dan jalankan ulang setelah tanggal itu lewat. Jangan mengubah hari uji tanpa memeriksa bentrok dengan `admin-booking.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/credentials.ts tests/e2e/prepare-db.mts tests/e2e/public-registration.spec.ts
git commit -m "test: end-to-end site registration, matching, access and cancellation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Perbarui PRD, spec, dan runbook

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md`
- Modify: `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`
- Modify: `docs/operasional/server-sundy.md`

- [ ] **Step 1: PRD v1.7**

Di header PRD:
- ubah `**Versi:** 1.6` menjadi `**Versi:** 1.7`;
- ubah tanggal pembaruan menjadi tanggal task ini dikerjakan;
- tambahkan paragraf ini setelah paragraf "Perubahan dari versi 1.5":

```markdown
**Perubahan dari versi 1.6:** pendaftaran pasien dirancang ulang sebagai **kuis bergaya BetterMe** — pasien memilih Slimming/Aesthetic lalu menjawab keluhan, tujuan, riwayat penyakit & obat, dan riwayat diet sebelum data pribadi. Booking situs disimpan bersama **Isian Pendaftaran** dan boleh belum terhubung ke pasien sampai **admin mencocokkannya**; sistem hanya menyarankan pasien yang mirip. **Biaya booking Rp 100.000** (terpisah dari biaya layanan, tidak dikembalikan, tetap berlaku bila pindah jadwal) menjawab D5. Rincian: `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.
```

Di **F5**, ganti daftar "Alur 4 langkah" beserta paragraf skriningnya dengan:

```markdown
Alur kuis mobile-first (rincian dan isi pertanyaan: spec pendaftaran pasien bagian 3):

1. **Kuis** — pernah berobat? → tujuan (Slimming / Aesthetic / Belum yakin) → pertanyaan jalur satu per layar (pasien lama: kuis pendek) → kesehatan & obat per penyakit.
2. **Ringkasan** jawaban, bisa diubah per bagian.
3. **Layanan & biaya** — pasien baru selalu Konsultasi Dokter; pasien Aesthetic lama boleh memilih treatment. Biaya layanan dibayar di klinik; **biaya booking** ditransfer setelah mendaftar.
4. **Jadwal** — cabang (Citraland "Segera Hadir"), tenaga, tanggal & slot; slot ditahan 10 menit.
5. **Data diri & persetujuan** — pasien baru: nama, WA, tanggal lahir, jenis kelamin, pekerjaan, alamat; pasien lama: nama, WA, tanggal lahir. Persetujuan data (UU PDP) dan aturan biaya booking wajib dicentang.
```

Di **F5**, pada contoh pesan WhatsApp, ganti kalimat penutup "Berikut bukti transfernya." dengan "Berikut bukti transfer biaya booking Rp 100.000.".

Di **F6**, tambahkan kalimat berikut di akhir paragraf:

```markdown
Booking terkonfirmasi menawarkan **Pindah jadwal via WhatsApp** (admin memindahkannya di panel; biaya booking tetap melekat). Sebelum membatalkan booking yang biayanya sudah dibayar, pasien diingatkan bahwa biaya booking tidak dikembalikan.
```

Di tabel aksi **F9**, tambahkan baris setelah "Verifikasi":

```markdown
| **Cocokkan pasien** | Booking dari situs: pilih pasien lama dari saran (WA sama, atau nama & tanggal lahir sama) atau buat pasien baru dari isian. Wajib sebelum Verifikasi, Hadir, atau Tidak Hadir. |
```

Di tabel kasus khusus bagian 8, ganti isi baris "Pasien lama booking lagi" dengan:

```markdown
| Pasien lama booking lagi | Situs tidak memeriksa nomor WA. Sistem **menyarankan** pasien yang cocok saat admin memverifikasi, dan **admin yang memutuskan** — satu nomor WA sering dipakai sekeluarga. |
```

Ganti isi **Lampiran C** (di bawah judulnya) dengan:

```markdown
Digantikan kuis pendaftaran versi 1 — daftar pertanyaan lengkap di spec `2026-09-28-pendaftaran-pasien-design.md` bagian 3.2. Jawaban tersimpan sebagai Isian Pendaftaran per booking; berat & tinggi mandiri disimpan terpisah dan dibedakan dari hasil Timbang BIA.
```

Di tabel keputusan bagian 12, ganti baris **D5** dengan:

```markdown
| D5 | ~~Biaya konsultasi & DP~~ | **Selesai (28 Sep 2026).** Biaya booking **Rp 100.000** untuk booking situs, WhatsApp, dan telepon (walk-in tidak); terpisah dari biaya layanan, tidak dikembalikan, tetap berlaku bila pindah jadwal paling lambat 2 jam sebelumnya. Angka dan rekening diubah Super Admin di panel. | Konsultasi Dokter Rp 200.000 tetap dibayar di klinik. |
```

- [ ] **Step 2: Status spec dan runbook**

Di spec `2026-09-28-pendaftaran-pasien-design.md`, ubah baris status menjadi:

```markdown
- **Status:** Disetujui pemilik (28 September 2026) · Plan 3b-1 terlaksana (<tanggal>) · Plan 3b-2 menyusul
```

Di runbook `docs/operasional/server-sundy.md` bagian 4, tambahkan butir:

```markdown
- **Sejak Plan 3b-1 (pendaftaran situs), jangan `deploy.sh kembali` ke rilis sebelum 3b-1 setelah ada booking dari situs.** Booking situs boleh belum punya pasien, dan kode lama menganggap pasien selalu ada — daftar booking akan rusak. Bila terpaksa, cocokkan dulu semua booking berlabel "Belum dicocokkan".
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md docs/operasional/server-sundy.md
git commit -m "docs: PRD 1.7 for quiz registration and the booking fee; rollback note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Tampilkan tombol "Daftar Konsultasi" (setelah pemilik mencoba)

**Kerjakan task ini hanya setelah:**
1. Task 1–19 dirilis ke produksi;
2. pemilik mencoba `https://sundyclinic.com/daftar` dari HP sampai halaman sukses, lalu membatalkan booking uji itu lewat `/cek-booking`;
3. pemilik mengisi rekening di `/admin/pengaturan`.

Sampai saat itu `/daftar` hanya bisa dibuka lewat alamat langsung, dan tidak diindeks mesin pencari (spec bagian 13).

**Files:**
- Create: `src/components/layout/register-cta.tsx`
- Modify: `src/components/layout/site-header.tsx`
- Modify: `src/app/(public)/page.tsx`, `src/app/(public)/layanan/[slug]/page.tsx`, `src/app/(public)/program-slimming/page.tsx`
- Modify: `src/app/(public)/daftar/page.tsx` (buang `robots: noindex`)
- Modify: `src/app/sitemap.ts`
- Test: `tests/unit/components/register-cta.test.tsx`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/register-cta.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegisterCta } from "@/components/layout/register-cta";

describe("RegisterCta", () => {
  it("mengarah ke halaman pendaftaran", () => {
    render(<RegisterCta />);
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
  });
});
```

Run: `npx vitest run tests/unit/components/register-cta.test.tsx`
Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 2: Implementasi**

`src/components/layout/register-cta.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tombol utama menuju kuis pendaftaran. WhatsApp tetap tersedia lewat tombol melayang. */
export function RegisterCta({ className }: { className?: string }) {
  return (
    <Link
      href="/daftar"
      className={cn(
        "inline-block rounded-full bg-gold-500 px-7 py-3 font-medium text-white hover:bg-gold-600",
        className,
      )}
    >
      Daftar Konsultasi
    </Link>
  );
}
```

Di `src/components/layout/site-header.tsx`:
- tambahkan `import { RegisterCta } from "./register-cta";`;
- di dalam `<div className="mx-auto flex max-w-6xl …">`, tambahkan `<RegisterCta className="px-4 py-2 text-sm" />` sebagai anak terakhir, setelah `</nav>` desktop.

Di `src/app/(public)/page.tsx`, di dalam `<div className="mt-10 flex flex-wrap justify-center gap-3">`, tambahkan `<RegisterCta />` sebagai anak **pertama**, sebelum tautan "Lihat Layanan & Harga". Tambahkan importnya.

Di `src/app/(public)/layanan/[slug]/page.tsx`:
- ganti komentar `{/* Pendaftaran konsultasi daring dibangun pada Plan 3. … */}` dengan `<RegisterCta className="mt-8 mr-3" />`;
- ubah kelas tautan WhatsApp di bawahnya dari `bg-gold-500 … text-white hover:bg-gold-600` menjadi `border border-gold-500 text-gold-600 hover:bg-cream-100`, supaya tombol daftar menjadi tombol utama;
- ubah teksnya menjadi `Tanya via WhatsApp`.

Di `src/app/(public)/program-slimming/page.tsx`, tambahkan `<div className="mt-10 text-center"><RegisterCta /></div>` sebagai elemen terakhir di dalam pembungkus halaman. Tambahkan importnya.

Di `src/app/(public)/daftar/page.tsx`, hapus baris `robots` beserta komentarnya dari `metadata`.

Di `src/app/sitemap.ts`, tambahkan `"/daftar"` dan `"/cek-booking"` ke `STATIC_ROUTES`.

- [ ] **Step 3: Jalankan uji**

Run: `npx vitest run tests/unit/components/register-cta.test.tsx && npm test && npx tsc --noEmit && npm run lint`
Expected: semua lulus. Bila uji `public-site.spec.ts` bergantung pada teks "Tanya & Daftar via WhatsApp", sesuaikan uji itu ke "Tanya via WhatsApp".

- [ ] **Step 4: Commit**

```bash
git add src/components/layout src/app tests/unit/components/register-cta.test.tsx
git commit -m "feat: show Daftar Konsultasi across the public site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Definisi Selesai untuk Plan 3b-1

- [ ] `npm test`, `npm run test:integration`, `npm run test:e2e` (berurutan, tidak bersamaan), `npx tsc --noEmit`, dan `npm run lint` semuanya bersih.
- [ ] Rilis ke produksi lewat `deploy.sh` (runbook bagian 4). Migrasi `pendaftaran_pasien` harus terterapkan tanpa galat, dan baris `ClinicSetting` harus ada.
- [ ] `bash scripts/server/cek-situs.sh https://sundyclinic.com` menampilkan semua ✓, dan `https://sundyclinic.com/daftar` serta `/cek-booking` terbuka dari HP.
- [ ] Pemilik sudah mengisi rekening di `/admin/pengaturan`, mencoba satu pendaftaran penuh, mencocokkannya di panel, lalu membatalkannya.
- [ ] Task 20 dikerjakan setelah percobaan pemilik.

## Yang Sengaja Tidak Dikerjakan di Plan 3b-1 (→ Plan 3b-2)

- **Link WA pribadi & QR** untuk booking yang dicatat admin (spec bagian 4). Kolom `linkTokenHash`/`linkExpiresAt` dan status `MENUNGGU_DIISI` sudah ada di skema, tetapi belum dipakai.
- **Setujui ke data pasien** oleh dokter (spec 6.4), termasuk status `DIPERIKSA`. Halaman isian di plan ini masih baca saja.
- **Filter "Isian belum diperiksa"** dan **riwayat isian di halaman pasien** (spec 6.5).
- **Tombol "Kirim form"** untuk pasien yang dicocokkan tetapi belum punya isian lengkap (spec bagian 4).
