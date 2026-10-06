# Konsultasi Online (Booking Tanpa Slot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customer (dari `/daftar`) dan resepsionis (dari panel) bisa membuat booking konsultasi online berkanal `ONLINE` yang tidak mengunci slot klinik, berisi 1–3 rentang waktu luang customer; dokter melihat daftarnya, menelepon lewat WhatsApp, menekan "Mulai konsultasi", lalu menulis catatan dokter seperti kunjungan klinik.

**Architecture:**
- **Data:** `Appointment` mendapat `channel` (`KLINIK`/`ONLINE`) dan `servicePrice`; dua tabel baru `ContactWindow` (rentang waktu luang) dan `ContactAttempt` (percobaan menghubungi yang gagal). Penjaga anti-bentrok slot dibuat ulang hanya untuk kanal `KLINIK`.
- **Dipakai ulang:** verifikasi transfer, pesan WA, link kuis, kuis v2, kunjungan/catatan dokter, riwayat. Booking online tetap satu baris `Appointment` dengan layanan "Konsultasi Online".
- **Pembagian kode:** logika murni (aturan rentang, pengelompokan, teks pesan) di `src/lib/online-consultation.ts`; aksi admin dan dokter di `src/server/online-consultation.ts`; aksi publik di `src/server/public-booking.ts` yang sudah ada.

**Tech Stack:** Next.js 15.5 App Router, React 19, Prisma 7 + PostgreSQL, Zod 4, shadcn/ui (Radix), Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-konsultasi-online-design.md`

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar.
- **Kata di halaman customer:** panel admin memakai "pasien". Halaman publik (`/daftar`, `/cek-booking`) dan pesan WA memakai "Anda" dan "customer", **tanpa kata "pasien" atau "berobat"**.
- **Zona waktu:** WITA. Tanggal rentang adalah tanggal WITA; semua `DateTime` disimpan sebagai instan UTC.
- **Rentang waktu luang (spec 3.2):**
  - jam 08.00–21.00 WITA, kelipatan 30 menit, panjang minimal 1 jam;
  - 1–3 rentang per booking, tidak boleh tumpang tindih;
  - customer: paling cepat 2 jam dari sekarang; resepsionis: rentang belum berakhir (boleh sudah mulai);
  - paling lambat 14 hari ke depan (tanggal WITA); hari Minggu dan libur **boleh**.
- **Biaya (spec 3.3):** `bookingFee` + `servicePrice` disalin ke booking saat dibuat; customer mentransfer totalnya. Layanan `konsultasi-online` dibuat **nonaktif**; pilihan online hanya ada bila layanan itu aktif dan harganya lebih dari 0.
- **Tidak mengunci slot (spec 3.7):** booking online tidak ikut penjaga anti-bentrok, tidak mengurangi slot kosong, tidak masuk garis waktu dasbor.
- **Cabang (spec 3.6):** kolom cabang tetap diisi (cabang aktif pertama), tetapi semua tampilan dan pesan menulis **"Online (WhatsApp)"**.
- **Hak akses (spec 8.3):**

  | Aksi | Kemampuan |
  |---|---|
  | Buat booking online, verifikasi, ubah waktu luang, minta waktu baru, batalkan | `booking:manage` |
  | Daftar "Konsultasi online" di dasbor dokter, Mulai konsultasi, Tidak terhubung | `record:write` |

- **Aksi publik di `public-booking.ts`:** tanpa login, dibatasi `guardRate`, semua input diperiksa ulang di server.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (ekspor tipe boleh). Konstanta dan fungsi murni tinggal di `src/lib`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`, dan komponen tidak mengimpor `@/lib/db`.
- **Fungsi dari modul `"use client"` tidak dipanggil komponen server** (dijaga uji arsitektur yang sudah ada).
- **Migrasi:** menambah, kecuali satu hal yang disengaja: `appointment_no_overlap` dihapus lalu dibuat ulang (dalam migrasi yang sama) agar hanya berlaku untuk `KLINIK`. Diterapkan berurutan:
  - `npx prisma migrate deploy`;
  - `npm run db:migrate:test`;
  - `npx prisma generate`;
  - `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` harus keluar dengan kode 0.
- **Tanpa dependensi baru.**
- **Format kode:** repo tidak memakai Prettier. Ikuti format kode di sekitarnya.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`). Jangan jalankan bersamaan dengan `npm run test:e2e`, dan setelah e2e selesai kosongkan data e2e di `sundy_test` sebelum menjalankan uji integrasi lagi (lihat Task 12). Laptop 8 GB: e2e dijalankan **per berkas atau kelompok**.
- **Pesan pengingat (keputusan rencana):** teks pengingat online menulis tanggal lengkap ("pada Senin, 7 Oktober"), bukan "besok", karena pengingat bisa dikirim lebih awal saat tanggalnya jatuh pada hari Minggu atau libur (mekanisme `reminderDay` yang ada).
- **Commit:** Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. **Jangan pernah mengubah atau men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Permintaan buatan yang melanggar aturan rentang** (jam di luar 08.00–21.00, bukan kelipatan 30 menit, kurang dari 1 jam, tumpang tindih, lebih dari 3, di luar 14 hari, kurang dari 2 jam bagi customer). Ditolak di server walau browser sudah memeriksanya → uji di Task 2 (aturan), Task 4 (aksi admin), dan Task 5 (aksi publik).
2. **Booking online saat semua slot klinik dokter itu penuh.** Tetap berhasil, tidak ditolak penjaga anti-bentrok, dan tidak mengurangi slot klinik → uji di Task 1 (database) dan Task 3 (ketersediaan).
3. **Dokter menekan Mulai konsultasi dua kali, atau dua dokter bersamaan.** Hanya satu perpindahan status dan satu kunjungan; yang kedua dibawa ke kunjungan yang sama → uji di Task 7.
4. **Semua rentang sudah lewat.** Booking terkonfirmasi tampil "Perlu waktu baru" di resepsionis, hilang dari daftar dokter, dan kembali ke daftar dokter setelah Ubah waktu luang → uji di Task 2 (pengelompokan), Task 4 (ubah), dan Task 12 (e2e).
5. **Layanan Konsultasi Online dinonaktifkan atau harganya 0 setelah customer membuka form.** Kirim ditolak dengan pesan jelas, dan harga yang berubah setelah booking dibuat tidak mengubah booking lama → uji di Task 5.

---

## Struktur berkas

**Baru**

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `prisma/migrations/20261006120000_konsultasi_online/migration.sql` | Kanal, harga layanan, rentang, percobaan, CHECK, penjaga anti-bentrok hanya `KLINIK`, baris layanan | 1 |
| `src/lib/online-consultation.ts` | Aturan rentang, keadaan (Sekarang/Hari ini/Mendatang/Perlu waktu baru), total, label, teks pesan WA | 2, 7, 8 |
| `src/server/online-store.ts` | Penyaring kanal (`DAY_LIST_CHANNEL`), layanan dan cabang online (tanpa `"use server"`) | 3, 4 |
| `src/server/online-consultation.ts` | Aksi admin dan dokter: buat, ubah waktu luang, mulai konsultasi, tidak terhubung | 4, 7 |
| `src/server/encounter-store.ts` | `lastHeightCm`, dipakai bersama `openEncounter` dan Mulai konsultasi | 7 |
| `src/components/online/contact-windows-editor.tsx` | Editor 1–3 rentang, dipakai situs dan panel | 8 |
| `src/components/pendaftaran/contact-windows-step.tsx` | Layar "Kapan Anda bisa dihubungi?" | 8 |
| `src/components/admin/online-service-card.tsx` | Harga, durasi, dan status aktif Konsultasi Online | 9 |
| `src/components/admin/online-appointment-form.tsx` | Booking Baru versi online | 10 |
| `src/components/admin/contact-windows-dialog.tsx` | Dialog Ubah waktu luang | 10 |
| `src/components/admin/online-work.tsx` | Bagian "Konsultasi online" di dasbor dokter | 11 |

**Diubah**

| Berkas | Perubahan | Task |
|---|---|---|
| `prisma/schema.prisma`, `prisma/seed.ts` | Enum kanal, kolom, dua model, baris layanan | 1 |
| `src/server/availability.ts`, `dashboard.ts`, `appointment.ts`, `appointment-guard.ts`, `check-in.ts`, `catalog.ts`, `public-booking-data.ts` | Keluarkan booking online dari slot, garis waktu, daftar per tanggal, check-in, dan katalog | 3, 4, 5 |
| `src/server/public-booking.ts`, `src/lib/whatsapp.ts` | `submitOnlineBooking`, kwitansi, cek booking, pesan WA situs | 5 |
| `src/lib/transfer-instruction.ts`, `booking-messages.ts`, `reminder-work.ts`, `src/server/reminder.ts`, `appointment-message.ts` | Pesan dan pengingat versi online | 6 |
| `src/server/encounter-read.ts`, `patient.ts` | Daftar dokter, label Online, `listOnlineWork` | 7 |
| `src/components/pendaftaran/*` | Cara konsultasi, total transfer, kwitansi, alur | 8 |
| `src/components/pendaftaran/booking-status-lookup.tsx` | Tampilan cek booking online | 8 |
| `src/server/service-admin.ts`, halaman `layanan` | Pengaturan layanan online | 9 |
| Halaman `booking`, `booking/baru`, `appointment-table.tsx`, `booking-dialogs.tsx`, `booking-created-panel.tsx`, `reminder-worklist.tsx`, `src/lib/booking-actions.ts` | Panel resepsionis | 10 |
| Halaman dasbor, `doctor-worklist.tsx`, `encounter-page-view.tsx` | Panel dokter | 11 |
| `tests/e2e/prepare-db.mts`, spec | Fixture e2e dan penandaan spec | 12 |

**Uji baru:** `tests/unit/online-consultation.test.ts`, `online-messages.test.ts`; komponen `contact-windows-editor`, `online-service-card`, `contact-windows-dialog`, `online-appointment-form`, `online-work`; integrasi `online-schema`, `online-isolation`, `online-admin`, `online-public`, `online-reminder`, `online-doctor`, `online-service-admin`; e2e `online-consultation.spec.ts`.


---

### Task 1: Fondasi data — kanal, rentang waktu luang, penjaga slot hanya untuk klinik

**Files:**
- Create: `prisma/migrations/20261006120000_konsultasi_online/migration.sql`
- Modify: `prisma/schema.prisma`, `prisma/seed.ts`, `tests/unit/migrations.test.ts`
- Test: `tests/integration/online-schema.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - Prisma: enum `AppointmentChannel` (`KLINIK`, `ONLINE`); `Appointment.channel AppointmentChannel @default(KLINIK)`, `Appointment.servicePrice Int?`, relasi `Appointment.contactWindows ContactWindow[]` dan `Appointment.contactAttempts ContactAttempt[]`;
  - model `ContactWindow { id, appointmentId, startAt, endAt, createdAt }` (onDelete Cascade, indeks `[appointmentId, startAt]`);
  - model `ContactAttempt { id, appointmentId, at, staffId, staffName }` (onDelete Cascade, indeks `[appointmentId, at]`);
  - Database: CHECK `appointment_online_consultation` dan `contact_window_range`; `appointment_no_overlap` dibuat ulang dengan syarat `channel = 'KLINIK'`;
  - layanan `konsultasi-online` (nonaktif, harga 0) dibuat oleh migrasi (bila `konsultasi-dokter` sudah ada) dan oleh `seed.ts` (hanya bila belum ada).

- [ ] **Step 1: Tulis uji skema (gagal)**

Buat `tests/integration/online-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isExclusionViolation } from "@/server/db-errors";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

const SLUG = "skema-online-uji";
const WA = "6281200007700";

describe("skema konsultasi online: kanal, rentang waktu luang, penjaga slot", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let n = 0;

  function booking(overrides: Record<string, unknown> = {}) {
    n += 1;
    return prisma.appointment.create({
      data: {
        code: `SOL-${n}`,
        type: "KONSULTASI",
        startAt: at(date, "10:00"),
        endAt: at(date, "10:30"),
        status: "TERKONFIRMASI",
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
        ...overrides,
      },
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7700", name: "Pasien Skema Online", whatsapp: WA } })).id;
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("booking tanpa kanal tetap kanal klinik", async () => {
    const row = await booking();
    expect(row).toMatchObject({ channel: "KLINIK", servicePrice: null });
  });

  it("booking online wajib berjenis konsultasi dan membawa harga layanan; booking klinik tidak boleh", async () => {
    await expect(booking({ channel: "ONLINE" })).rejects.toThrow(/appointment_online_consultation/);
    await expect(booking({ channel: "ONLINE", servicePrice: 250000, type: "TREATMENT" })).rejects.toThrow(
      /appointment_online_consultation/,
    );
    await expect(booking({ servicePrice: 250000 })).rejects.toThrow(/appointment_online_consultation/);
    expect(await booking({ channel: "ONLINE", servicePrice: 250000 })).toMatchObject({ channel: "ONLINE", servicePrice: 250000 });
  });

  it("booking online tidak ikut penjaga anti-bentrok, booking klinik tetap saling bentrok", async () => {
    await booking({ channel: "ONLINE", servicePrice: 250000 });
    await booking({ channel: "ONLINE", servicePrice: 250000 });
    const klinik = await booking();
    expect(klinik.channel).toBe("KLINIK");

    const clash = await booking().catch((error: unknown) => error);
    expect(isExclusionViolation(clash)).toBe(true);
  });

  it("rentang waktu luang: akhir harus setelah awal, dan ikut terhapus bersama booking", async () => {
    const online = await booking({ channel: "ONLINE", servicePrice: 250000 });
    await expect(
      prisma.contactWindow.create({ data: { appointmentId: online.id, startAt: at(date, "19:00"), endAt: at(date, "19:00") } }),
    ).rejects.toThrow(/contact_window_range/);

    await prisma.contactWindow.create({ data: { appointmentId: online.id, startAt: at(date, "19:00"), endAt: at(date, "21:00") } });
    await prisma.contactAttempt.create({ data: { appointmentId: online.id, at: at(date, "19:40"), staffId: world.doctorId, staffName: "dr. Uji" } });

    await prisma.appointment.delete({ where: { id: online.id } });
    expect(await prisma.contactWindow.count({ where: { appointmentId: online.id } })).toBe(0);
    expect(await prisma.contactAttempt.count({ where: { appointmentId: online.id } })).toBe(0);
  });
});
```

Run: `npm run test:integration -- tests/integration/online-schema.test.ts`
Expected: FAIL, karena kolom `channel` dan model `contactWindow` belum ada.

- [ ] **Step 2: Ubah skema Prisma**

Di `prisma/schema.prisma`:

1. Di blok `model Appointment`, tepat setelah `checkedInAt DateTime?`, tambahkan:

```prisma
  /// KLINIK: kunjungan ke klinik yang mengunci satu slot. ONLINE: konsultasi lewat
  /// WhatsApp berdasarkan rentang waktu luang customer, tanpa slot (spec konsultasi online 3.1).
  channel         AppointmentChannel @default(KLINIK)
  /// Salinan harga layanan Konsultasi Online saat booking dibuat; hanya terisi untuk kanal ONLINE
  /// (CHECK appointment_online_consultation).
  servicePrice    Int?
  contactWindows  ContactWindow[]
  contactAttempts ContactAttempt[]
```

2. Tambahkan setelah `enum BookingSource { … }`:

```prisma
enum AppointmentChannel {
  KLINIK
  ONLINE
}

/// Rentang waktu customer bisa dihubungi dokter (1–3 per booking online, spec 3.2).
/// Disimpan sebagai instan UTC dari tanggal dan jam WITA. Booking menyalin awal rentang
/// pertama ke startAt/endAt untuk pengurutan; aturan rentangnya dijaga src/lib/online-consultation.ts.
model ContactWindow {
  id            String      @id @default(cuid())
  appointmentId String
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  startAt       DateTime
  endAt         DateTime
  createdAt     DateTime    @default(now())

  @@index([appointmentId, startAt])
}

/// Percobaan dokter menghubungi customer yang tidak tersambung (spec 6.3).
/// Id dan nama staf disalin seperti AuditLog, tanpa relasi.
model ContactAttempt {
  id            String      @id @default(cuid())
  appointmentId String
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  at            DateTime
  staffId       String
  staffName     String

  @@index([appointmentId, at])
}
```

3. Jalankan `npx prisma format`.

- [ ] **Step 3: Buat migrasi**

Hasilkan SQL dari skema:

```bash
npx prisma migrate deploy
mkdir -p prisma/migrations/20261006120000_konsultasi_online
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  > prisma/migrations/20261006120000_konsultasi_online/migration.sql
cat prisma/migrations/20261006120000_konsultasi_online/migration.sql
```

Expected: SQL berisi `CREATE TYPE "AppointmentChannel"`, `ALTER TABLE "Appointment" ADD COLUMN "channel" … DEFAULT 'KLINIK'` dan `"servicePrice" INTEGER`, `CREATE TABLE "ContactWindow"`, `CREATE TABLE "ContactAttempt"`, dua `CREATE INDEX`, dan dua `ADD FOREIGN KEY … ON DELETE CASCADE`. **Hasil generate yang dipakai.**

Tambahkan komentar ini di **awal** berkas:

```sql
-- Konsultasi online: booking berkanal ONLINE tanpa slot, berdasarkan rentang waktu luang customer.
-- Spec: docs/superpowers/specs/2026-10-06-konsultasi-online-design.md bagian 8.
--
-- Satu-satunya yang dihapus adalah aturan appointment_no_overlap, dibuat ulang di bawah dalam
-- migrasi yang sama (satu transaksi implisit). Rilis lama tetap aman selama deploy: ia tidak
-- pernah membuat booking online, dan untuk booking klinik aturan barunya sama persis.

```

Lalu tambahkan di **akhir** berkas:

```sql

-- Booking online berjenis konsultasi dan membawa harga layanan; booking klinik tidak.
ALTER TABLE "Appointment" ADD CONSTRAINT appointment_online_consultation CHECK (
  ("channel" = 'ONLINE' AND "type" = 'KONSULTASI' AND "servicePrice" IS NOT NULL)
  OR ("channel" = 'KLINIK' AND "servicePrice" IS NULL)
);

ALTER TABLE "ContactWindow" ADD CONSTRAINT contact_window_range CHECK ("endAt" > "startAt");

-- Penjaga anti-bentrok hanya untuk kunjungan klinik (spec 3.7). Syarat status tetap sama.
ALTER TABLE "Appointment" DROP CONSTRAINT appointment_no_overlap;
ALTER TABLE "Appointment" ADD CONSTRAINT appointment_no_overlap
EXCLUDE USING gist (
  "staffId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
) WHERE ("channel" = 'KLINIK' AND status IN ('MENUNGGU_KONFIRMASI', 'TERKONFIRMASI', 'HADIR'));

-- Layanan Konsultasi Online: nonaktif dan berharga 0 sampai pemilik mengaturnya di halaman Layanan
-- (spec 3.3). Dibuat hanya bila Konsultasi Dokter sudah ada (database baru memakai seed.ts).
INSERT INTO "Service" (
  "id", "slug", "name", "description", "promoPrice", "durationMin", "isSignature", "isActive",
  "sortOrder", "requiresDoctor", "categoryId", "createdAt", "updatedAt"
)
SELECT
  'konsultasi_online_svc', 'konsultasi-online', 'Konsultasi Online',
  'Konsultasi dokter lewat WhatsApp (telepon atau video).',
  0, 30, false, false, 99, true, "categoryId", NOW(), NOW()
FROM "Service"
WHERE "slug" = 'konsultasi-dokter'
ON CONFLICT ("slug") DO NOTHING;
```

Terapkan:

```bash
npx prisma migrate deploy
npm run db:migrate:test
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: ketiga perintah pertama berhasil, dan perintah terakhir keluar dengan kode 0.

- [ ] **Step 4: Seed untuk database baru**

Di `prisma/seed.ts`, tepat setelah blok `await prisma.$transaction(services.map(…), TRANSACTION_OPTIONS);` (yang mengisi layanan), tambahkan:

```ts
    // Konsultasi Online dibuat nonaktif dan sengaja tidak ada di daftar `services` di atas: seed
    // mengulang upsert dengan `update: data` dan akan menimpa harga/status yang diatur pemilik.
    const slimmingCategoryId = categoryIdBySlug.get("slimming");
    if (slimmingCategoryId) {
      await prisma.service.upsert({
        where: { slug: "konsultasi-online" },
        update: {},
        create: {
          slug: "konsultasi-online",
          name: "Konsultasi Online",
          description: "Konsultasi dokter lewat WhatsApp (telepon atau video).",
          promoPrice: 0,
          durationMin: 30,
          requiresDoctor: true,
          isActive: false,
          sortOrder: 99,
          categoryId: slimmingCategoryId,
        },
      });
    }
```

- [ ] **Step 5: Kunci isi migrasi di uji unit**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi konsultasi online", () => {
  const sql = readFileSync("prisma/migrations/20261006120000_konsultasi_online/migration.sql", "utf8");

  it("hanya menghapus penjaga anti-bentrok lama, lalu membuatnya lagi di berkas yang sama", () => {
    const drops = sql.match(/\bDROP\b[^;]*;/gi) ?? [];
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatch(/DROP CONSTRAINT appointment_no_overlap/);
    expect(sql).toMatch(/ADD CONSTRAINT appointment_no_overlap[\s\S]*"channel" = 'KLINIK'/);
  });

  it("menjaga kanal online dan rentang waktu luang di basis data", () => {
    expect(sql).toMatch(/appointment_online_consultation/);
    expect(sql).toMatch(/contact_window_range/);
  });

  it("membuat layanan Konsultasi Online dalam keadaan nonaktif", () => {
    expect(sql).toMatch(/'konsultasi-online'[\s\S]*false, false, 99/);
  });
});
```

- [ ] **Step 6: Jalankan uji dan commit**

Run: `npm run test:integration -- tests/integration/online-schema.test.ts tests/integration/appointment.test.ts tests/integration/check-in-schema.test.ts`
Expected: PASS semua.

Run: `npx vitest run > "$WS/t1.log" 2>&1; grep -E "Test Files|Tests " "$WS/t1.log"; npx tsc --noEmit -p . > "$WS/t1-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, `tsc` keluar 0.

```bash
git add prisma/schema.prisma prisma/migrations/20261006120000_konsultasi_online prisma/seed.ts \
  tests/unit/migrations.test.ts tests/integration/online-schema.test.ts
git commit -m "feat: add the online channel, contact windows and attempts, and limit the slot guard to clinic bookings"
```

---

### Task 2: Logika konsultasi online — aturan rentang, keadaan, dan teks pesan

**Files:**
- Create: `src/lib/online-consultation.ts`
- Test: `tests/unit/online-consultation.test.ts`

**Interfaces:**
- Consumes (sudah ada): `formatIndonesianDate`, `formatRupiah`, `formatScheduleForMessage`, `formatShortIndonesianDate` (`@/lib/format`); `firstName` (`@/lib/quiz-link`); `addDaysToDateString`, `combineWitaDateAndMinutes`, `minutesToTimeLabel`, `witaDateString`, `witaMinutesOfDay` (`@/lib/time`); `CLINIC_NAME` (`@/lib/clinic`).
- Produces (`src/lib/online-consultation.ts`):
  - konstanta: `ONLINE_SERVICE_SLUG = "konsultasi-online"`, `ONLINE_BRANCH_LABEL = "Online (WhatsApp)"`, `ONLINE_MAX_WINDOWS = 3`, `ONLINE_FIRST_MINUTE = 480`, `ONLINE_LAST_MINUTE = 1260`, `ONLINE_STEP_MINUTES = 30`, `ONLINE_MIN_WINDOW_MINUTES = 60`, `ONLINE_MAX_DAYS_AHEAD = 14`, `ONLINE_CUSTOMER_LEAD_MINUTES = 120`;
  - tipe: `WindowDraft = { date: string; startMinute: number; endMinute: number }`, `ContactRange = { startAt: Date; endAt: Date }`, `WindowAudience = "CUSTOMER" | "STAFF"`, `WindowsValidation = { ok: true; windows: ContactRange[] } | { ok: false; message: string }`, `OnlinePhase = "NOW" | "TODAY" | "UPCOMING" | "NEEDS_NEW"`;
  - `validateContactWindows(raw: unknown, input: { now: Date; audience: WindowAudience }): WindowsValidation` (hasil terurut menurut awal);
  - `windowDrafts(windows: readonly ContactRange[]): WindowDraft[]`, `windowLabel(range: ContactRange): string`, `windowLines(windows: readonly ContactRange[]): string[]`;
  - `boundsOf(windows: readonly ContactRange[]): ContactRange` (rentang paling awal), `nextOpenWindow(windows, now): ContactRange | null`, `onlinePhase(windows, now): OnlinePhase`;
  - `onlineTotal(input: { bookingFee: number | null; servicePrice: number | null }): number`;
  - `lastAttemptLabel(attempts: readonly { at: Date; staffName: string }[]): string | null`;
  - teks pesan: `onlineTransferText`, `onlineConfirmationText`, `onlineRequestNewTimeText`, `onlineReminderText`, `reminderWindowsOn(windows, date): ContactRange[]`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/unit/online-consultation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  boundsOf,
  lastAttemptLabel,
  nextOpenWindow,
  onlineConfirmationText,
  onlinePhase,
  onlineReminderText,
  onlineRequestNewTimeText,
  onlineTotal,
  onlineTransferText,
  reminderWindowsOn,
  validateContactWindows,
  windowDrafts,
  windowLabel,
  windowLines,
  type ContactRange,
} from "@/lib/online-consultation";
import { combineWitaDateAndMinutes } from "@/lib/time";

// Selasa 6 Oktober 2026, 10.00 WITA.
const NOW = combineWitaDateAndMinutes("2026-10-06", 10 * 60);
const range = (date: string, from: number, to: number): ContactRange => ({
  startAt: combineWitaDateAndMinutes(date, from),
  endAt: combineWitaDateAndMinutes(date, to),
});
const draft = (date: string, startMinute: number, endMinute: number) => ({ date, startMinute, endMinute });
const customer = (raw: unknown) => validateContactWindows(raw, { now: NOW, audience: "CUSTOMER" });
const staff = (raw: unknown) => validateContactWindows(raw, { now: NOW, audience: "STAFF" });

describe("validateContactWindows", () => {
  it("menerima 1–3 rentang sah dan mengurutkannya menurut awal", () => {
    const result = customer([draft("2026-10-09", 600, 720), draft("2026-10-07", 1140, 1260)]);
    expect(result).toEqual({
      ok: true,
      windows: [range("2026-10-07", 1140, 1260), range("2026-10-09", 600, 720)],
    });
  });

  it("menolak jumlah yang bukan 1–3 dan bentuk yang rusak", () => {
    const message = "Tambahkan 1 sampai 3 waktu Anda bisa dihubungi.";
    expect(customer([])).toEqual({ ok: false, message });
    expect(customer("bukan larik")).toEqual({ ok: false, message });
    const four = Array.from({ length: 4 }, (_, i) => draft(`2026-10-1${i}`, 600, 720));
    expect(customer(four)).toEqual({ ok: false, message });
    const broken = "Waktu tidak sah. Muat ulang halaman lalu coba lagi.";
    expect(customer([null])).toEqual({ ok: false, message: broken });
    expect(customer([{ date: "2026-10-07", startMinute: "600", endMinute: 720 }])).toEqual({ ok: false, message: broken });
    expect(customer([draft("2026-02-31", 600, 720)])).toEqual({ ok: false, message: broken });
  });

  it("menolak jam di luar 08.00–21.00 atau bukan kelipatan 30 menit", () => {
    const message = "Jam harus antara 08.00 dan 21.00, kelipatan 30 menit.";
    expect(customer([draft("2026-10-08", 450, 600)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-08", 1200, 1290)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-08", 610, 720)])).toEqual({ ok: false, message });
  });

  it("menolak rentang kurang dari 1 jam", () => {
    const message = "Setiap waktu minimal 1 jam.";
    expect(customer([draft("2026-10-08", 600, 630)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-08", 720, 600)])).toEqual({ ok: false, message });
  });

  it("menolak tanggal di luar hari ini sampai 14 hari ke depan", () => {
    const message = "Pilih tanggal antara hari ini dan 14 hari ke depan.";
    expect(customer([draft("2026-10-05", 600, 720)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-21", 600, 720)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-20", 600, 720)]).ok).toBe(true);
  });

  it("customer: paling cepat 2 jam dari sekarang; resepsionis boleh rentang yang sudah mulai", () => {
    const lead = "Pilih waktu paling cepat 2 jam dari sekarang.";
    expect(customer([draft("2026-10-06", 11 * 60, 13 * 60)])).toEqual({ ok: false, message: lead });
    expect(customer([draft("2026-10-06", 12 * 60, 14 * 60)]).ok).toBe(true);
    expect(staff([draft("2026-10-06", 9 * 60, 11 * 60)]).ok).toBe(true);
    expect(staff([draft("2026-10-06", 8 * 60, 10 * 60)])).toEqual({ ok: false, message: "Waktu yang dipilih sudah lewat." });
  });

  it("menolak rentang yang tumpang tindih, tetapi menerima yang bersambung", () => {
    const message = "Waktu-waktu yang dipilih tidak boleh tumpang tindih.";
    expect(customer([draft("2026-10-08", 600, 720), draft("2026-10-08", 660, 780)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-08", 600, 720), draft("2026-10-08", 720, 840)]).ok).toBe(true);
  });

  it("hari Minggu dan libur boleh", () => {
    // 11 Oktober 2026 adalah Minggu.
    expect(customer([draft("2026-10-11", 600, 720)]).ok).toBe(true);
  });
});

describe("rentang: label, bentuk edit, dan keadaan", () => {
  const first = range("2026-10-07", 1140, 1260);
  const second = range("2026-10-09", 600, 720);

  it("label dan baris pesan", () => {
    expect(windowLabel(first)).toBe("Rabu, 7 Oktober 2026, 19.00–21.00");
    expect(windowLines([first, second])).toEqual([
      "• Rabu, 7 Oktober 2026, 19.00–21.00",
      "• Jumat, 9 Oktober 2026, 10.00–12.00",
    ]);
  });

  it("bentuk untuk dialog ubah, dan batas booking = rentang paling awal", () => {
    expect(windowDrafts([first, second])).toEqual([draft("2026-10-07", 1140, 1260), draft("2026-10-09", 600, 720)]);
    expect(boundsOf([second, first])).toEqual(first);
  });

  it("keadaan: Sekarang, Hari ini, Mendatang, dan Perlu waktu baru", () => {
    const evening = range("2026-10-06", 19 * 60, 21 * 60);
    expect(onlinePhase([evening], combineWitaDateAndMinutes("2026-10-06", 20 * 60))).toBe("NOW");
    expect(onlinePhase([evening], NOW)).toBe("TODAY");
    expect(onlinePhase([first], NOW)).toBe("UPCOMING");
    expect(onlinePhase([evening], combineWitaDateAndMinutes("2026-10-06", 21 * 60))).toBe("NEEDS_NEW");
    expect(onlinePhase([evening, first], combineWitaDateAndMinutes("2026-10-06", 21 * 60))).toBe("UPCOMING");
  });

  it("rentang terbuka berikutnya melewati yang sudah berakhir", () => {
    const early = range("2026-10-06", 8 * 60, 9 * 60);
    expect(nextOpenWindow([early, first], NOW)).toEqual(first);
    expect(nextOpenWindow([early], NOW)).toBeNull();
  });

  it("jumlah transfer dan keterangan percobaan terakhir", () => {
    expect(onlineTotal({ bookingFee: 100000, servicePrice: 250000 })).toBe(350000);
    expect(onlineTotal({ bookingFee: null, servicePrice: 250000 })).toBe(250000);
    expect(lastAttemptLabel([])).toBeNull();
    expect(
      lastAttemptLabel([
        { at: combineWitaDateAndMinutes("2026-10-05", 19 * 60 + 40), staffName: "dr. Diane" },
        { at: combineWitaDateAndMinutes("2026-10-06", 8 * 60 + 10), staffName: "dr. Diane" },
      ]),
    ).toBe("Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)");
  });
});

describe("teks pesan WhatsApp", () => {
  const windows = [range("2026-10-07", 1140, 1260), range("2026-10-09", 600, 720)];
  const deadline = combineWitaDateAndMinutes("2026-10-07", 12 * 60);

  it("instruksi transfer: total, rincian, rentang, rekening, dan link kuis", () => {
    const text = onlineTransferText({
      patientName: "Siti Rahayu",
      code: "SDY-AB12",
      doctorName: "dr. Diane",
      windows,
      bookingFee: 100000,
      servicePrice: 250000,
      deadline,
      bankLine: "BCA 123 a.n. SunDY Clinic",
      quizLink: "https://sundyclinic.com/isi#kode",
    });
    expect(text).toContain("Halo Siti, konsultasi online Anda di SunDY Clinic sudah kami catat.");
    expect(text).toContain("Kode: SDY-AB12");
    expect(text).toContain("• Rabu, 7 Oktober 2026, 19.00–21.00");
    expect(text).toContain("transfer Rp 350.000 (biaya booking Rp 100.000 + Konsultasi Online Rp 250.000)");
    expect(text).toContain("BCA 123 a.n. SunDY Clinic");
    expect(text).toContain("https://sundyclinic.com/isi#kode");
    expect(text).not.toMatch(/pasien|berobat/i);
  });

  it("konfirmasi: dokter akan menghubungi di salah satu waktu", () => {
    const text = onlineConfirmationText({ patientName: "Siti Rahayu", code: "SDY-AB12", doctorName: "dr. Diane", windows });
    expect(text).toContain("pembayaran konsultasi online Anda (SDY-AB12) sudah kami terima");
    expect(text).toContain("dr. Diane akan menelepon atau video call lewat WhatsApp");
    expect(text).toContain("• Jumat, 9 Oktober 2026, 10.00–12.00");
    expect(text).not.toMatch(/pasien|berobat/i);
  });

  it("minta waktu baru: dengan dan tanpa percobaan", () => {
    const tried = onlineRequestNewTimeText({ patientName: "Siti Rahayu", code: "SDY-AB12", doctorName: "dr. Diane", hadAttempt: true });
    expect(tried).toContain("dr. Diane sudah mencoba menghubungi Anda untuk konsultasi online (SDY-AB12), tetapi belum tersambung.");
    expect(tried).toContain("Biaya yang sudah dibayar tetap berlaku.");
    const untried = onlineRequestNewTimeText({ patientName: "Siti Rahayu", code: "SDY-AB12", doctorName: "dr. Diane", hadAttempt: false });
    expect(untried).toContain("waktu yang Anda pilih untuk konsultasi online (SDY-AB12) sudah lewat.");
  });

  it("pengingat: satu atau beberapa rentang di hari itu, dengan tanggal lengkap", () => {
    const sameDay = [range("2026-10-07", 600, 720), range("2026-10-07", 1140, 1260)];
    expect(reminderWindowsOn([...sameDay, windows[1]], "2026-10-07")).toEqual(sameDay);
    const text = onlineReminderText({ patientName: "Siti Rahayu", code: "SDY-AB12", doctorName: "dr. Diane", windows: sameDay });
    expect(text).toContain("pada Rabu, 7 Oktober 2026, dr. Diane akan menghubungi Anda lewat WhatsApp antara 10.00–12.00 atau 19.00–21.00");
    expect(text).not.toMatch(/besok|pasien|berobat/i);
  });
});
```

Run: `npx vitest run tests/unit/online-consultation.test.ts`
Expected: FAIL, karena modul `@/lib/online-consultation` tidak ditemukan.

- [ ] **Step 2: Tulis logikanya**

Buat `src/lib/online-consultation.ts`:

```ts
import { CLINIC_NAME } from "./clinic";
import { formatIndonesianDate, formatRupiah, formatScheduleForMessage, formatShortIndonesianDate } from "./format";
import { firstName } from "./quiz-link";
import { addDaysToDateString, combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "./time";

/** Konsultasi online (spec 3): booking tanpa slot, berdasarkan rentang waktu luang customer. */
export const ONLINE_SERVICE_SLUG = "konsultasi-online";
/** Pengganti nama cabang di semua tampilan dan pesan booking online (spec 3.6). */
export const ONLINE_BRANCH_LABEL = "Online (WhatsApp)";
export const ONLINE_MAX_WINDOWS = 3;
export const ONLINE_FIRST_MINUTE = 8 * 60;
export const ONLINE_LAST_MINUTE = 21 * 60;
export const ONLINE_STEP_MINUTES = 30;
export const ONLINE_MIN_WINDOW_MINUTES = 60;
export const ONLINE_MAX_DAYS_AHEAD = 14;
export const ONLINE_CUSTOMER_LEAD_MINUTES = 120;

/** Rentang seperti diisi di form: tanggal WITA dan menit sejak tengah malam WITA. */
export type WindowDraft = { date: string; startMinute: number; endMinute: number };
export type ContactRange = { startAt: Date; endAt: Date };
export type WindowAudience = "CUSTOMER" | "STAFF";
export type WindowsValidation = { ok: true; windows: ContactRange[] } | { ok: false; message: string };
export type OnlinePhase = "NOW" | "TODAY" | "UPCOMING" | "NEEDS_NEW";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WINDOWS_COUNT = "Tambahkan 1 sampai 3 waktu Anda bisa dihubungi.";
const WINDOWS_INVALID = "Waktu tidak sah. Muat ulang halaman lalu coba lagi.";
const WINDOWS_DATE = "Pilih tanggal antara hari ini dan 14 hari ke depan.";
const WINDOWS_HOURS = "Jam harus antara 08.00 dan 21.00, kelipatan 30 menit.";
const WINDOWS_SHORT = "Setiap waktu minimal 1 jam.";
const WINDOWS_LEAD = "Pilih waktu paling cepat 2 jam dari sekarang.";
const WINDOWS_OVER = "Waktu yang dipilih sudah lewat.";
const WINDOWS_OVERLAP = "Waktu-waktu yang dipilih tidak boleh tumpang tindih.";

const fail = (message: string): WindowsValidation => ({ ok: false, message });

/**
 * Memeriksa 1–3 rentang waktu luang (spec 3.2). Customer paling cepat 2 jam dari
 * sekarang; resepsionis boleh rentang yang sudah mulai selama belum berakhir. Hasilnya
 * terurut menurut awal rentang.
 */
export function validateContactWindows(raw: unknown, input: { now: Date; audience: WindowAudience }): WindowsValidation {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > ONLINE_MAX_WINDOWS) return fail(WINDOWS_COUNT);

  const today = witaDateString(input.now);
  const lastDate = addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD);
  const ranges: ContactRange[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) return fail(WINDOWS_INVALID);
    const { date, startMinute, endMinute } = item as Record<string, unknown>;
    if (
      typeof date !== "string" ||
      !DATE_PATTERN.test(date) ||
      addDaysToDateString(date, 0) !== date ||
      typeof startMinute !== "number" ||
      typeof endMinute !== "number" ||
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute)
    ) {
      return fail(WINDOWS_INVALID);
    }
    if (date < today || date > lastDate) return fail(WINDOWS_DATE);
    if (
      startMinute % ONLINE_STEP_MINUTES !== 0 ||
      endMinute % ONLINE_STEP_MINUTES !== 0 ||
      startMinute < ONLINE_FIRST_MINUTE ||
      endMinute > ONLINE_LAST_MINUTE
    ) {
      return fail(WINDOWS_HOURS);
    }
    if (endMinute - startMinute < ONLINE_MIN_WINDOW_MINUTES) return fail(WINDOWS_SHORT);

    const startAt = combineWitaDateAndMinutes(date, startMinute);
    const endAt = combineWitaDateAndMinutes(date, endMinute);
    if (input.audience === "CUSTOMER") {
      if (startAt.getTime() < input.now.getTime() + ONLINE_CUSTOMER_LEAD_MINUTES * 60_000) return fail(WINDOWS_LEAD);
    } else if (endAt.getTime() <= input.now.getTime()) {
      return fail(WINDOWS_OVER);
    }
    ranges.push({ startAt, endAt });
  }

  ranges.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  for (let i = 0; i < ranges.length - 1; i++) {
    if (ranges[i].endAt.getTime() > ranges[i + 1].startAt.getTime()) return fail(WINDOWS_OVERLAP);
  }
  return { ok: true, windows: ranges };
}

export function windowDrafts(windows: readonly ContactRange[]): WindowDraft[] {
  return windows.map((w) => ({
    date: witaDateString(w.startAt),
    startMinute: witaMinutesOfDay(w.startAt),
    endMinute: witaMinutesOfDay(w.endAt),
  }));
}

/** "Rabu, 7 Oktober 2026, 19.00–21.00" */
export function windowLabel(range: ContactRange): string {
  const from = minutesToTimeLabel(witaMinutesOfDay(range.startAt));
  const to = minutesToTimeLabel(witaMinutesOfDay(range.endAt));
  return `${formatIndonesianDate(range.startAt)}, ${from}–${to}`;
}

export function windowLines(windows: readonly ContactRange[]): string[] {
  return windows.map((w) => `• ${windowLabel(w)}`);
}

/** Rentang paling awal: dipakai sebagai startAt/endAt booking sebelum konsultasi dimulai (spec 3.5). */
export function boundsOf(windows: readonly ContactRange[]): ContactRange {
  return windows.reduce((a, b) => (b.startAt.getTime() < a.startAt.getTime() ? b : a));
}

/** Rentang paling awal yang belum berakhir, atau null bila semuanya sudah lewat. */
export function nextOpenWindow(windows: readonly ContactRange[], now: Date): ContactRange | null {
  const open = windows.filter((w) => w.endAt.getTime() > now.getTime());
  return open.length > 0 ? boundsOf(open) : null;
}

/** Keadaan dasbor dokter (spec 6.1) dan "Perlu waktu baru" (spec 3.4). */
export function onlinePhase(windows: readonly ContactRange[], now: Date): OnlinePhase {
  const next = nextOpenWindow(windows, now);
  if (!next) return "NEEDS_NEW";
  if (windows.some((w) => w.startAt.getTime() <= now.getTime() && w.endAt.getTime() > now.getTime())) return "NOW";
  return witaDateString(next.startAt) === witaDateString(now) ? "TODAY" : "UPCOMING";
}

/** Jumlah yang ditransfer customer: biaya booking + harga Konsultasi Online (spec 3.3). */
export function onlineTotal(input: { bookingFee: number | null; servicePrice: number | null }): number {
  return (input.bookingFee ?? 0) + (input.servicePrice ?? 0);
}

/** "Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)" untuk percobaan terakhir. */
export function lastAttemptLabel(attempts: readonly { at: Date; staffName: string }[]): string | null {
  if (attempts.length === 0) return null;
  const last = attempts.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a));
  const time = minutesToTimeLabel(witaMinutesOfDay(last.at));
  return `Dicoba ${formatShortIndonesianDate(last.at)} ${time} — tidak terhubung (${last.staffName})`;
}

/** Link kuis untuk booking online: kalimatnya tidak menyebut "datang". */
function onlineQuizLines(link: string): string[] {
  return [`Sebelum konsultasi, mohon isi form singkat ini (±5 menit): ${link}`, "Jawaban Anda hanya dibaca dokter kami."];
}

export function onlineTransferText(input: {
  patientName: string;
  code: string;
  doctorName: string;
  windows: readonly ContactRange[];
  bookingFee: number;
  servicePrice: number;
  deadline: Date;
  /** Baris rekening siap tampil, atau kalimat pengganti bila rekening belum lengkap. */
  bankLine: string;
  quizLink?: string | null;
}): string {
  const total = onlineTotal({ bookingFee: input.bookingFee, servicePrice: input.servicePrice });
  const lines = [
    `Halo ${firstName(input.patientName)}, konsultasi online Anda di ${CLINIC_NAME} sudah kami catat.`,
    `Kode: ${input.code}`,
    `Layanan: Konsultasi Online lewat WhatsApp dengan ${input.doctorName}`,
    "Waktu Anda bisa dihubungi:",
    ...windowLines(input.windows),
    "",
    `Mohon transfer ${formatRupiah(total)} (biaya booking ${formatRupiah(input.bookingFee)} + Konsultasi Online ${formatRupiah(input.servicePrice)}) paling lambat ${formatScheduleForMessage(input.deadline)} ke:`,
    input.bankLine,
    "lalu kirim bukti transfer di chat ini.",
    "",
    "Biaya ini dibayar di muka dan tidak dikembalikan, tetapi tetap berlaku bila waktu Anda perlu diganti.",
  ];
  if (input.quizLink) lines.push("", ...onlineQuizLines(input.quizLink));
  return lines.join("\n");
}

export function onlineConfirmationText(input: {
  patientName: string;
  code: string;
  doctorName: string;
  windows: readonly ContactRange[];
  quizLink?: string | null;
}): string {
  const lines = [
    `Halo ${firstName(input.patientName)}, pembayaran konsultasi online Anda (${input.code}) sudah kami terima.`,
    `${input.doctorName} akan menelepon atau video call lewat WhatsApp ke nomor ini kapan saja di dalam salah satu waktu berikut:`,
    ...windowLines(input.windows),
    "Mohon pastikan nomor ini aktif dan bisa menerima panggilan. Bila waktu Anda berubah, balas pesan ini.",
  ];
  if (input.quizLink) lines.push("", ...onlineQuizLines(input.quizLink));
  return lines.join("\n");
}

/** Pesan "Minta waktu baru" (spec 7.3). `hadAttempt`: dokter sudah mencatat percobaan menelepon. */
export function onlineRequestNewTimeText(input: {
  patientName: string;
  code: string;
  doctorName: string;
  hadAttempt: boolean;
}): string {
  const name = firstName(input.patientName);
  const opening = input.hadAttempt
    ? `Halo ${name}, ${input.doctorName} sudah mencoba menghubungi Anda untuk konsultasi online (${input.code}), tetapi belum tersambung.`
    : `Halo ${name}, waktu yang Anda pilih untuk konsultasi online (${input.code}) sudah lewat.`;
  return [
    opening,
    'Mohon kirim 1–3 pilihan hari dan jam Anda bisa dihubungi (mis. "Senin 19.00–21.00"). Biaya yang sudah dibayar tetap berlaku.',
  ].join("\n");
}

/** Rentang yang jatuh pada tanggal WITA tertentu, terurut. */
export function reminderWindowsOn(windows: readonly ContactRange[], date: string): ContactRange[] {
  return windows.filter((w) => witaDateString(w.startAt) === date).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Pengingat H-1 (spec 7.4). Memakai tanggal lengkap: pengingat bisa terkirim lebih awal bila tanggalnya Minggu atau libur. */
export function onlineReminderText(input: {
  patientName: string;
  code: string;
  doctorName: string;
  /** Rentang pada satu tanggal yang sama. */
  windows: readonly ContactRange[];
}): string {
  const times = input.windows
    .map((w) => `${minutesToTimeLabel(witaMinutesOfDay(w.startAt))}–${minutesToTimeLabel(witaMinutesOfDay(w.endAt))}`)
    .join(" atau ");
  return `Halo ${firstName(input.patientName)}, mengingatkan: pada ${formatIndonesianDate(input.windows[0].startAt)}, ${input.doctorName} akan menghubungi Anda lewat WhatsApp antara ${times} untuk konsultasi online (${input.code}). Mohon pastikan nomor ini aktif.`;
}
```

Run: `npx vitest run tests/unit/online-consultation.test.ts`
Expected: PASS semua.

- [ ] **Step 3: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t2.log" 2>&1; grep -E "Test Files|Tests " "$WS/t2.log"; npx eslint src/lib/online-consultation.ts; npx tsc --noEmit -p . > "$WS/t2-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/lib/online-consultation.ts tests/unit/online-consultation.test.ts
git commit -m "feat: add online consultation rules (contact windows, phases, totals) and WhatsApp texts"
```

---

### Task 3: Booking online keluar dari jalur klinik — slot, garis waktu, daftar per tanggal, check-in, katalog

**Files:**
- Create: `src/server/online-store.ts`
- Modify:
  - `src/server/availability.ts`, `src/server/dashboard.ts`, `src/server/appointment-guard.ts`, `src/server/appointment.ts`, `src/server/check-in.ts`;
  - `src/server/catalog.ts`, `src/server/public-booking-data.ts`;
  - `tests/integration/public-booking-world.ts` (pembantu `setOnlineService`).
- Test: `tests/integration/online-isolation.test.ts`

**Interfaces:**
- Consumes: Task 1 (`channel`, `servicePrice`), Task 2 (`ONLINE_SERVICE_SLUG`).
- Produces:
  - `src/server/online-store.ts` (tanpa `"use server"`): `DAY_LIST_CHANNEL: Prisma.AppointmentWhereInput` (klinik, atau online yang sudah *Hadir*/*Selesai*);
  - `appointment-guard.ts`: `ONLINE_NOT_ALLOWED` (string) dan `rejectedClinicOnlyError(id: string, needsPatient?: boolean): Promise<UserFacingError>`;
  - pembantu uji `setOnlineService(input: { price: number; active: boolean }): Promise<string>` (mengembalikan id layanan `konsultasi-online`).
  - Perilaku: booking online tidak mengurangi slot (`computeAvailability`, `computeAvailabilityRange`), tidak tampil di garis waktu dan hitungan "hari ini" dasbor selama belum dimulai, tidak tampil di daftar per tanggal selama belum dimulai; Tidak hadir, Pindah jadwal, dan Check-in menolak booking online; layanan `konsultasi-online` tidak pernah tampil di katalog publik.

- [ ] **Step 1: Pembantu uji layanan online**

Tambahkan di akhir `tests/integration/public-booking-world.ts`:

```ts
/**
 * Layanan Konsultasi Online bersama semua berkas uji (slug tetap). Berkas yang
 * mengaktifkannya wajib mematikannya lagi di afterAll agar berkas lain tidak terpengaruh.
 */
export async function setOnlineService(input: { price: number; active: boolean }): Promise<string> {
  const slimming = await prisma.serviceCategory.upsert({
    where: { slug: "slimming" },
    update: {},
    create: { slug: "slimming", name: "Slimming & Wellness" },
  });
  const service = await prisma.service.upsert({
    where: { slug: "konsultasi-online" },
    update: { promoPrice: input.price, isActive: input.active, requiresDoctor: true, durationMin: 30 },
    create: {
      slug: "konsultasi-online",
      name: "Konsultasi Online",
      promoPrice: input.price,
      durationMin: 30,
      requiresDoctor: true,
      isActive: input.active,
      sortOrder: 99,
      categoryId: slimming.id,
    },
  });
  return service.id;
}
```

- [ ] **Step 2: Tulis uji integrasi (gagal)**

Buat `tests/integration/online-isolation.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { listAppointments, markNoShow, rescheduleAppointment } from "@/server/appointment";
import { ONLINE_NOT_ALLOWED } from "@/server/appointment-guard";
import { computeAvailability, computeAvailabilityRange } from "@/server/availability";
import { getAllServiceSlugs, getServiceBySlug, getServiceCategoriesWithServices } from "@/server/catalog";
import { getCheckInForm } from "@/server/check-in";
import { getTodaySchedule } from "@/server/dashboard";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Admin Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "isolasi-online-uji";
const WA = "6281200007710";

describe("booking online tidak ikut jalur klinik", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let onlineServiceId: string;
  let n = 0;

  function booking(input: { channel: "KLINIK" | "ONLINE"; time: string; day?: string; status?: "TERKONFIRMASI" | "HADIR" }) {
    n += 1;
    const day = input.day ?? date;
    const startAt = at(day, input.time);
    return prisma.appointment.create({
      data: {
        code: `ISO-${n}`,
        type: "KONSULTASI",
        channel: input.channel,
        servicePrice: input.channel === "ONLINE" ? 250000 : null,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: input.status ?? "TERKONFIRMASI",
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: input.channel === "ONLINE" ? onlineServiceId : world.consultationId,
        patientId,
      },
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7710", name: "Pasien Isolasi", whatsapp: WA } })).id;
    onlineServiceId = await setOnlineService({ price: 250000, active: true });
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("booking online tidak mengurangi slot klinik dokter yang sama", async () => {
    const rangeInput = { staffId: world.doctorId, branchId: world.branchId, durationMinutes: 30, from: date, days: 1 };
    const empty = await computeAvailabilityRange(rangeInput, { minLeadMinutes: 0 });

    await booking({ channel: "ONLINE", time: "11:00" });
    const slots = await computeAvailability(
      { staffId: world.doctorId, branchId: world.branchId, date, durationMinutes: 30 },
      { minLeadMinutes: 0 },
    );
    expect(slots.map((slot) => slot.startAt.getTime())).toContain(at(date, "11:00").getTime());
    expect((await computeAvailabilityRange(rangeInput, { minLeadMinutes: 0 }))[0].openCount).toBe(empty[0].openCount);

    await booking({ channel: "KLINIK", time: "11:00" });
    const after = await computeAvailability(
      { staffId: world.doctorId, branchId: world.branchId, date, durationMinutes: 30 },
      { minLeadMinutes: 0 },
    );
    expect(after.map((slot) => slot.startAt.getTime())).not.toContain(at(date, "11:00").getTime());
  });

  it("daftar per tanggal: online belum dimulai tidak tampil, online yang sudah dimulai tampil", async () => {
    const waiting = await booking({ channel: "ONLINE", time: "12:00" });
    const started = await booking({ channel: "ONLINE", time: "13:00", status: "HADIR" });
    const clinic = await booking({ channel: "KLINIK", time: "14:00" });
    const ids = (await listAppointments({ date })).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([started.id, clinic.id]));
    expect(ids).not.toContain(waiting.id);
  });

  it("garis waktu dasbor hari ini tidak memuat booking online yang belum dimulai", async () => {
    const today = witaDateString(new Date());
    const online = await booking({ channel: "ONLINE", time: "06:00", day: today });
    const schedule = await getTodaySchedule();
    expect(schedule.lanes.flatMap((lane) => lane.bookings).map((block) => block.id)).not.toContain(online.id);
  });

  it("Tidak hadir, Pindah jadwal, dan Check-in menolak booking online", async () => {
    const online = await booking({ channel: "ONLINE", time: "15:00" });
    expect(await markNoShow(online.id)).toEqual({ ok: false, error: ONLINE_NOT_ALLOWED });
    expect(
      await rescheduleAppointment(online.id, { startAt: at(addDaysToDateString(date, 1), "15:00"), endAt: at(addDaysToDateString(date, 1), "15:30") }),
    ).toEqual({ ok: false, error: ONLINE_NOT_ALLOWED });
    expect(await getCheckInForm(online.id)).toEqual({
      ok: false,
      error: "Konsultasi online tidak memakai check-in. Dokter memulainya dari dasbor.",
    });

    const clinic = await booking({ channel: "KLINIK", time: "16:00" });
    expect((await markNoShow(clinic.id)).ok).toBe(true);
  });

  it("layanan Konsultasi Online tidak pernah tampil di katalog situs", async () => {
    expect(await getAllServiceSlugs()).not.toContain("konsultasi-online");
    expect(await getServiceBySlug("konsultasi-online")).toBeNull();
    const slugs = (await getServiceCategoriesWithServices()).flatMap((category) => category.services.map((s) => s.slug));
    expect(slugs).not.toContain("konsultasi-online");
  });
});
```

Run: `npm run test:integration -- tests/integration/online-isolation.test.ts`
Expected: FAIL, karena `ONLINE_NOT_ALLOWED` belum diekspor dan booking online masih mengurangi slot.

- [ ] **Step 3: Penyaring bersama dan penolakan khusus klinik**

Buat `src/server/online-store.ts`:

```ts
import type { Prisma } from "@prisma/client";

// Tanpa "use server": pembantu server untuk konsultasi online, tidak dipanggil browser.

/**
 * Booking yang punya tempat di daftar per tanggal dan hitungan "hari ini" (spec 5.2):
 * semua booking klinik, dan booking online yang konsultasinya sudah dimulai. Booking
 * online yang belum dimulai belum punya jam yang berarti.
 */
export const DAY_LIST_CHANNEL: Prisma.AppointmentWhereInput = {
  OR: [{ channel: "KLINIK" }, { channel: "ONLINE", status: { in: ["HADIR", "SELESAI"] } }],
};
```

Tambahkan di akhir `src/server/appointment-guard.ts`:

```ts
/** Aksi khusus kunjungan klinik (Tidak hadir, Pindah jadwal) pada booking online (spec 5.3). */
export const ONLINE_NOT_ALLOWED = "Booking online tidak memakai aksi ini. Pakai Ubah waktu luang atau Batalkan.";

/** Seperti rejectedChangeError, tetapi menyebut alasan yang tepat bila bookingnya online. */
export async function rejectedClinicOnlyError(id: string, needsPatient = false): Promise<UserFacingError> {
  const row = await prisma.appointment.findUnique({ where: { id }, select: { channel: true } });
  if (row?.channel === "ONLINE") return new UserFacingError(ONLINE_NOT_ALLOWED);
  return rejectedChangeError(id, needsPatient);
}
```

- [ ] **Step 4: Slot, garis waktu, dan daftar per tanggal**

Di `src/server/availability.ts`, pada **kedua** kueri `prisma.appointment.findMany` (di `computeAvailability` dan `computeAvailabilityRange`), tambahkan `channel: "KLINIK",` tepat sebelum baris `status: { in: [...BLOCKING_STATUSES] },`, lalu tambahkan komentar di atasnya:

```ts
        // Booking online tidak memakai slot (spec konsultasi online 3.7).
        channel: "KLINIK",
```

Di `src/server/dashboard.ts`:
1. Tambahkan import `import { DAY_LIST_CHANNEL } from "@/server/online-store";`.
2. Di `getTodayWork`, ganti `where: { startAt: { gte: start, lt: end }, status: { notIn: HIDDEN_STATUSES } },` dengan:

```ts
      where: { startAt: { gte: start, lt: end }, status: { notIn: HIDDEN_STATUSES }, ...DAY_LIST_CHANNEL },
```

3. Di `getTodaySchedule`, pada kueri `bookings`, tambahkan `channel: "KLINIK",` setelah `staffId: { in: staffList.map((s) => s.id) },`. Garis waktu hanya untuk kunjungan klinik (spec 3.7).

Di `src/server/appointment.ts`:
1. Ganti import `import { ACTIVE_STATUSES, rejectedChangeError } from "@/server/appointment-guard";` dengan `import { ACTIVE_STATUSES, rejectedChangeError, rejectedClinicOnlyError } from "@/server/appointment-guard";` dan tambahkan `import { DAY_LIST_CHANNEL } from "@/server/online-store";` di blok import `@/server/…`.
2. Di `listAppointments`, tambahkan `AND: [DAY_LIST_CHANNEL],` sebagai kunci pertama objek `where`.
3. Di `rescheduleAppointment`, ganti `where: { id, status: { in: ACTIVE_STATUSES } },` dengan `where: { id, status: { in: ACTIVE_STATUSES }, channel: "KLINIK" },`, dan ganti `if (count === 0) throw await rejectedChangeError(id);` dengan `if (count === 0) throw await rejectedClinicOnlyError(id);`.
4. Ubah `setStatus` agar bisa dibatasi ke kunjungan klinik. Ganti tanda tangan dan isinya sampai `if (count === 0) …` dengan:

```ts
async function setStatus(
  id: string,
  from: AppointmentStatus[],
  to: AppointmentStatus,
  action: string,
  summary?: string,
  options: { clinicOnly?: boolean } = {},
): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const needsPatient = to !== "DIBATALKAN";

    const { count } = await prisma.appointment.updateMany({
      where: {
        id,
        status: { in: from },
        ...(needsPatient ? { patientId: { not: null } } : {}),
        ...(options.clinicOnly ? { channel: "KLINIK" as const } : {}),
      },
      data: { status: to },
    });
    if (count === 0) {
      throw options.clinicOnly ? await rejectedClinicOnlyError(id, needsPatient) : await rejectedChangeError(id, needsPatient);
    }
```

   (sisa fungsi tetap). Lalu ganti `markNoShow` dengan:

```ts
export async function markNoShow(id: string): Promise<ActionResult<Appointment>> {
  return setStatus(id, ACTIVE_STATUSES, "TIDAK_HADIR", "appointment.mark-no-show", undefined, { clinicOnly: true });
}
```

- [ ] **Step 5: Check-in menolak booking online**

Di `src/server/check-in.ts`:
1. Di `BOOKING_SELECT`, tambahkan `channel: true,` setelah `type: true,`.
2. Di `checkableBooking`, tambahkan tepat setelah baris `if (!booking.patient) throw …`:

```ts
  if (booking.channel === "ONLINE") {
    throw new UserFacingError("Konsultasi online tidak memakai check-in. Dokter memulainya dari dasbor.");
  }
```

- [ ] **Step 6: Katalog publik tanpa layanan online**

Di `src/server/catalog.ts`:
1. Tambahkan import `import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";`.
2. Tambahkan di bawah import:

```ts
/** Konsultasi Online hanya dipilih lewat /daftar, tidak tampil di katalog layanan (spec 3.3). */
const CATALOG_SERVICE = { isActive: true, slug: { not: ONLINE_SERVICE_SLUG } } as const;
```

3. Ganti `where: { isActive: true }` dengan `where: CATALOG_SERVICE` di `getServiceCategoriesWithServices` (pada `services`), `countActiveServices`, dan `getAllServiceSlugs`.
4. Di `getServiceBySlug`, ganti `where: { slug, isActive: true },` dengan `where: { isActive: true, AND: [{ slug }, { slug: { not: ONLINE_SERVICE_SLUG } }] },` (kunci `slug` tidak boleh ditimpa `CATALOG_SERVICE`).
5. Di `getRelatedServices`, ganti `where: { categoryId, isActive: true, id: { not: excludeServiceId } },` dengan `where: { categoryId, ...CATALOG_SERVICE, id: { not: excludeServiceId } },`.

Di `src/server/public-booking-data.ts`, pada kueri `treatments`, ganti `slug: { not: CONSULTATION_SERVICE_SLUG },` dengan `slug: { notIn: [CONSULTATION_SERVICE_SLUG, ONLINE_SERVICE_SLUG] },` dan tambahkan import `import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";`.

- [ ] **Step 7: Jalankan uji**

Run: `npm run test:integration -- tests/integration/online-isolation.test.ts tests/integration/appointment.test.ts tests/integration/check-in.test.ts tests/integration/availability-range.test.ts tests/integration/dashboard.test.ts`
Expected: PASS semua.

Run: `npx vitest run > "$WS/t3.log" 2>&1; grep -E "Test Files|Tests " "$WS/t3.log"; npx eslint src/server; npx tsc --noEmit -p . > "$WS/t3-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

- [ ] **Step 8: Commit**

```bash
git add src/server/online-store.ts src/server/availability.ts src/server/dashboard.ts src/server/appointment-guard.ts \
  src/server/appointment.ts src/server/check-in.ts src/server/catalog.ts src/server/public-booking-data.ts \
  tests/integration/public-booking-world.ts tests/integration/online-isolation.test.ts
git commit -m "feat: keep online bookings out of clinic slots, the timeline, the day list, check-in, no-show, reschedule, and the public catalog"
```

---

### Task 4: Aksi resepsionis — buat booking online, ubah waktu luang, daftar "Konsultasi online"

**Files:**
- Create: `src/server/online-consultation.ts`
- Modify: `src/server/online-store.ts`, `src/server/appointment.ts`
- Test: `tests/integration/online-admin.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `validateContactWindows`, `boundsOf`, `windowLabel`, `onlinePhase`, `nextOpenWindow`, `ONLINE_SERVICE_SLUG`;
  - Task 3: `DAY_LIST_CHANNEL`, pembantu uji `setOnlineService`;
  - sudah ada: `generateBookingCode`, `bookingFeeFor`, `getClinicSetting`, `recordAudit`, `ACTIVE_STATUSES`, `rejectedChangeError`.
- Produces:
  - `online-store.ts`: `ONLINE_SERVICE_OFF` (string), `loadOnlineService(): Promise<{ id: string; name: string; promoPrice: number; durationMin: number } | null>` (null bila tidak ada, nonaktif, atau harga 0), `onlineBranchId(): Promise<string | null>`;
  - `online-consultation.ts` (`"use server"`):
    - `createOnlineAppointment(input: { patientId: string; staffId: string; source: "WHATSAPP" | "TELEPON"; windows: unknown; notes?: string }): Promise<ActionResult<Appointment>>`;
    - `updateContactWindows(input: { appointmentId: string; windows: unknown }): Promise<ActionResult<void>>`;
  - `appointment.ts`: `BOOKING_LIST_INCLUDE` membawa `contactWindows` (`startAt`, `endAt`, terurut) dan `contactAttempts` (`at`, `staffName`, terurut); `listOnlineBookings()` mengembalikan booking online *Terkonfirmasi* dengan `phase: OnlinePhase`, "Perlu waktu baru" paling atas, lalu menurut rentang terbuka terdekat;
  - audit: `appointment.create` (ringkasan memuat "online"), `appointment.update-windows`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/online-admin.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { listOnlineBookings } from "@/server/appointment";
import { createOnlineAppointment, updateContactWindows } from "@/server/online-consultation";
import { cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";
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

const SLUG = "admin-online-uji";
const WA = ["6281200007720", "6281200007721"];
const today = witaDateString(new Date());
const day = (offset: number) => addDaysToDateString(today, offset);
const draft = (date: string, startMinute: number, endMinute: number) => ({ date, startMinute, endMinute });

describe("booking online dari panel admin", () => {
  let world: BookingWorld;
  let patientId: string;

  const create = (overrides: Record<string, unknown> = {}) =>
    createOnlineAppointment({
      patientId,
      staffId: world.doctorId,
      source: "WHATSAPP",
      windows: [draft(day(3), 600, 720), draft(day(2), 1140, 1260)],
      ...overrides,
    } as Parameters<typeof createOnlineAppointment>[0]);

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, WA);
    world = await createBookingWorld(SLUG);
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7720", name: "Siti Online", whatsapp: WA[0] } })).id;
  });

  beforeEach(async () => {
    await setOnlineService({ price: 250000, active: true });
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, WA);
    await prisma.$disconnect();
  });

  it("membuat booking online: kanal, biaya yang disalin, rentang terurut, dan jadwal = rentang pertama", async () => {
    const created = await unwrap(create());
    const setting = await prisma.clinicSetting.findUniqueOrThrow({ where: { id: 1 } });
    const firstBranch = await prisma.branch.findFirstOrThrow({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" } });

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
      include: { contactWindows: { orderBy: { startAt: "asc" } }, service: true },
    });
    expect(row).toMatchObject({
      channel: "ONLINE",
      type: "KONSULTASI",
      status: "MENUNGGU_KONFIRMASI",
      source: "WHATSAPP",
      servicePrice: 250000,
      bookingFee: setting.bookingFee,
      branchId: firstBranch.id,
      staffId: world.doctorId,
    });
    expect(row.service?.slug).toBe("konsultasi-online");
    expect(row.contactWindows.map((w) => [w.startAt, w.endAt])).toEqual([
      [combineWitaDateAndMinutes(day(2), 1140), combineWitaDateAndMinutes(day(2), 1260)],
      [combineWitaDateAndMinutes(day(3), 600), combineWitaDateAndMinutes(day(3), 720)],
    ]);
    expect(row.startAt).toEqual(combineWitaDateAndMinutes(day(2), 1140));
    expect(row.endAt).toEqual(combineWitaDateAndMinutes(day(2), 1260));

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "appointment.create", entityId: created.id } });
    expect(audit.summary).toContain("online");
  });

  it("menolak bila layanan online nonaktif atau berharga 0", async () => {
    await setOnlineService({ price: 250000, active: false });
    const off = "Konsultasi Online belum diaktifkan. Atur harganya dan aktifkan di halaman Layanan.";
    expect(await create()).toEqual({ ok: false, error: off });
    await setOnlineService({ price: 0, active: true });
    expect(await create()).toEqual({ ok: false, error: off });
  });

  it("menolak sumber walk-in, terapis, rentang tidak sah, dan pasien rangkap", async () => {
    expect(await create({ source: "WALK_IN" })).toEqual({ ok: false, error: "Booking online dicatat dari WhatsApp atau telepon." });
    expect(await create({ staffId: world.therapistId })).toEqual({ ok: false, error: "Konsultasi online harus ditangani dokter." });
    expect(await create({ windows: [draft(day(2), 600, 630)] })).toEqual({ ok: false, error: "Setiap waktu minimal 1 jam." });

    const owner = await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7721", name: "Siti Lama", whatsapp: WA[1] } });
    await prisma.patient.update({ where: { id: patientId }, data: { mergedIntoId: owner.id } });
    try {
      expect(await create()).toEqual({
        ok: false,
        error: "Pasien ini rangkap dari Siti Lama (SDY-2026-7721). Buat booking untuk pasien itu.",
      });
    } finally {
      await prisma.patient.update({ where: { id: patientId }, data: { mergedIntoId: null } });
      await prisma.patient.delete({ where: { id: owner.id } });
    }
  });

  it("resepsionis boleh membuat rentang yang sudah mulai selama belum berakhir", async () => {
    const now = new Date();
    const minute = Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes() + 8 * 60) % (24 * 60) / 30) * 30;
    // Hanya bisa diuji saat jam WITA sekarang berada di 08.00–20.00.
    if (minute < 480 || minute + 60 > 1260) return;
    expect((await create({ windows: [draft(today, minute, minute + 60)] })).ok).toBe(true);
  });

  it("ubah waktu luang: mengganti semua rentang dan menggeser jadwal ke rentang pertama", async () => {
    const created = await unwrap(create());
    await unwrap(updateContactWindows({ appointmentId: created.id, windows: [draft(day(5), 780, 900)] }));

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id }, include: { contactWindows: true } });
    expect(row.contactWindows).toHaveLength(1);
    expect(row.startAt).toEqual(combineWitaDateAndMinutes(day(5), 780));
    expect(row.endAt).toEqual(combineWitaDateAndMinutes(day(5), 900));
    expect(await prisma.auditLog.count({ where: { action: "appointment.update-windows", entityId: created.id } })).toBe(1);
  });

  it("ubah waktu luang menolak booking klinik dan booking yang sudah dibatalkan", async () => {
    const created = await unwrap(create());
    await prisma.appointment.update({ where: { id: created.id }, data: { status: "DIBATALKAN" } });
    expect(await updateContactWindows({ appointmentId: created.id, windows: [draft(day(5), 780, 900)] })).toEqual({
      ok: false,
      error: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman.",
    });

    const clinic = await prisma.appointment.create({
      data: {
        code: "ADM-KLINIK-1",
        type: "KONSULTASI",
        startAt: combineWitaDateAndMinutes(day(2), 660),
        endAt: combineWitaDateAndMinutes(day(2), 690),
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
    expect(await updateContactWindows({ appointmentId: clinic.id, windows: [draft(day(5), 780, 900)] })).toEqual({
      ok: false,
      error: "Hanya booking online yang punya waktu luang.",
    });
  });

  it("daftar Konsultasi online: hanya yang terkonfirmasi, Perlu waktu baru paling atas", async () => {
    const later = await unwrap(create({ windows: [draft(day(4), 600, 720)] }));
    const sooner = await unwrap(create({ windows: [draft(day(2), 600, 720)] }));
    const lapsed = await unwrap(create({ windows: [draft(day(2), 780, 900)] }));
    const waiting = await unwrap(create());
    await prisma.appointment.updateMany({ where: { id: { in: [later.id, sooner.id, lapsed.id] } }, data: { status: "TERKONFIRMASI" } });
    // Semua rentang booking ini sudah lewat.
    await prisma.contactWindow.updateMany({
      where: { appointmentId: lapsed.id },
      data: { startAt: combineWitaDateAndMinutes(day(-1), 600), endAt: combineWitaDateAndMinutes(day(-1), 720) },
    });

    const rows = (await listOnlineBookings()).filter((row) => [later.id, sooner.id, lapsed.id, waiting.id].includes(row.id));
    expect(rows.map((row) => [row.id, row.phase])).toEqual([
      [lapsed.id, "NEEDS_NEW"],
      [sooner.id, "UPCOMING"],
      [later.id, "UPCOMING"],
    ]);
  });
});
```

Run: `npm run test:integration -- tests/integration/online-admin.test.ts`
Expected: FAIL, karena modul `@/server/online-consultation` tidak ditemukan.

- [ ] **Step 2: Pembantu layanan dan cabang online**

Tambahkan di `src/server/online-store.ts` (di bawah import yang sudah ada, tambahkan `import { prisma } from "@/lib/db";` dan `import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";`):

```ts
export const ONLINE_SERVICE_OFF = "Konsultasi Online belum diaktifkan. Atur harganya dan aktifkan di halaman Layanan.";

/** Layanan Konsultasi Online yang boleh dipesan: ada, aktif, dan berharga (spec 3.3). */
export async function loadOnlineService() {
  const service = await prisma.service.findUnique({
    where: { slug: ONLINE_SERVICE_SLUG },
    select: { id: true, name: true, promoPrice: true, durationMin: true, isActive: true },
  });
  if (!service || !service.isActive || service.promoPrice <= 0) return null;
  return { id: service.id, name: service.name, promoPrice: service.promoPrice, durationMin: service.durationMin };
}

/** Cabang administrasi booking online: cabang aktif pertama (spec 3.6). */
export async function onlineBranchId(): Promise<string | null> {
  const branch = await prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  return branch?.id ?? null;
}
```

- [ ] **Step 3: Aksi buat dan ubah waktu luang**

Buat `src/server/online-consultation.ts`:

```ts
"use server";

import type { Appointment } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { generateBookingCode } from "@/lib/booking-code";
import { prisma } from "@/lib/db";
import { boundsOf, validateContactWindows, windowLabel } from "@/lib/online-consultation";
import { bookingFeeFor } from "@/lib/payment";
import { safeRevalidatePath } from "@/lib/revalidate";
import { ACTIVE_STATUSES, rejectedChangeError } from "@/server/appointment-guard";
import { recordAudit } from "@/server/audit";
import { getClinicSetting } from "@/server/clinic-setting";
import { loadOnlineService, ONLINE_SERVICE_OFF, onlineBranchId } from "@/server/online-store";
import { requireCapability } from "@/server/session";

const ONLINE_SOURCES: readonly string[] = ["WHATSAPP", "TELEPON"];
const NOT_ONLINE = "Hanya booking online yang punya waktu luang.";

class StatusChanged extends Error {}

function revalidateOnlineViews() {
  safeRevalidatePath("/admin/booking");
  safeRevalidatePath("/admin/pengingat");
  safeRevalidatePath("/admin");
}

/** Booking online dari panel (spec 5.1): tanpa slot, dengan 1–3 rentang waktu luang. */
export async function createOnlineAppointment(input: {
  patientId: string;
  staffId: string;
  source: "WHATSAPP" | "TELEPON";
  windows: unknown;
  notes?: string;
}): Promise<ActionResult<Appointment>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    if (!ONLINE_SOURCES.includes(String(input?.source))) {
      throw new UserFacingError("Booking online dicatat dari WhatsApp atau telepon.");
    }
    const checked = validateContactWindows(input?.windows, { now: new Date(), audience: "STAFF" });
    if (!checked.ok) throw new UserFacingError(checked.message);

    const [service, branchId, setting, staff, patient] = await Promise.all([
      loadOnlineService(),
      onlineBranchId(),
      getClinicSetting(),
      prisma.staff.findUnique({ where: { id: String(input?.staffId ?? "") }, select: { id: true, role: true, isActive: true } }),
      prisma.patient.findUnique({
        where: { id: String(input?.patientId ?? "") },
        select: { id: true, mergedInto: { select: { name: true, medicalRecordNumber: true } } },
      }),
    ]);
    if (!service) throw new UserFacingError(ONLINE_SERVICE_OFF);
    if (!branchId) throw new UserFacingError("Belum ada cabang aktif.");
    if (!staff || !staff.isActive || staff.role !== "DOKTER") {
      throw new UserFacingError("Konsultasi online harus ditangani dokter.");
    }
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
    if (patient.mergedInto) {
      throw new UserFacingError(
        `Pasien ini rangkap dari ${patient.mergedInto.name} (${patient.mergedInto.medicalRecordNumber}). Buat booking untuk pasien itu.`,
      );
    }

    const source = input.source;
    const first = boundsOf(checked.windows);
    const created = await prisma.appointment.create({
      data: {
        code: generateBookingCode(),
        type: "KONSULTASI",
        channel: "ONLINE",
        startAt: first.startAt,
        endAt: first.endAt,
        source,
        notes: input.notes?.trim() || undefined,
        bookingFee: bookingFeeFor(source, setting.bookingFee),
        servicePrice: service.promoPrice,
        branchId,
        staffId: staff.id,
        patientId: patient.id,
        serviceId: service.id,
        contactWindows: { create: checked.windows.map((w) => ({ startAt: w.startAt, endAt: w.endAt })) },
      },
    });

    await recordAudit({
      actor,
      action: "appointment.create",
      entity: "Appointment",
      entityId: created.id,
      summary: `${created.code} — online, ${checked.windows.length} waktu luang mulai ${windowLabel(first)}`,
    });
    revalidateOnlineViews();
    return created;
  });
}

/**
 * Ubah waktu luang (spec 5.3): seluruh rentang diganti dalam satu transaksi, dan jadwal
 * booking mengikuti rentang pertama. Hanya untuk booking online yang masih aktif.
 */
export async function updateContactWindows(input: { appointmentId: string; windows: unknown }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const id = String(input?.appointmentId ?? "");
    const booking = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, code: true, channel: true, _count: { select: { contactWindows: true } } },
    });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.channel !== "ONLINE") throw new UserFacingError(NOT_ONLINE);
    const checked = validateContactWindows(input?.windows, { now: new Date(), audience: "STAFF" });
    if (!checked.ok) throw new UserFacingError(checked.message);
    const first = boundsOf(checked.windows);

    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.appointment.updateMany({
          where: { id, channel: "ONLINE", status: { in: ACTIVE_STATUSES } },
          data: { startAt: first.startAt, endAt: first.endAt },
        });
        if (count === 0) throw new StatusChanged();
        await tx.contactWindow.deleteMany({ where: { appointmentId: id } });
        await tx.contactWindow.createMany({
          data: checked.windows.map((w) => ({ appointmentId: id, startAt: w.startAt, endAt: w.endAt })),
        });
      });
    } catch (error) {
      if (error instanceof StatusChanged) throw await rejectedChangeError(id);
      throw error;
    }

    await recordAudit({
      actor,
      action: "appointment.update-windows",
      entity: "Appointment",
      entityId: id,
      summary: `${booking.code}: ${booking._count.contactWindows} → ${checked.windows.length} waktu luang, mulai ${windowLabel(first)}`,
    });
    revalidateOnlineViews();
  });
}
```

- [ ] **Step 4: Daftar "Konsultasi online" untuk resepsionis**

Di `src/server/appointment.ts`:
1. Tambahkan import `import { nextOpenWindow, onlinePhase, type OnlinePhase } from "@/lib/online-consultation";`.
2. Di `BOOKING_LIST_INCLUDE`, tambahkan sebelum `// Catatan pesan …`:

```ts
  // Rentang waktu luang dan percobaan menghubungi booking online (spec 5.2); tanpa data klinis.
  contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },
  contactAttempts: { orderBy: { at: "asc" }, select: { at: true, staffName: true } },
```

3. Tambahkan setelah `countPendingBookings`:

```ts
const PHASE_ORDER: Record<OnlinePhase, number> = { NEEDS_NEW: 0, NOW: 1, TODAY: 2, UPCOMING: 3 };

/**
 * Bagian "Konsultasi online" di halaman Booking (spec 5.2): booking online yang sudah
 * diverifikasi dan menunggu dihubungi. "Perlu waktu baru" paling atas, lalu menurut
 * rentang terbuka terdekat.
 */
export async function listOnlineBookings() {
  await requireCapability("booking:manage");
  const now = new Date();
  const rows = await withTransferDeadlines(
    await prisma.appointment.findMany({
      where: { channel: "ONLINE", status: "TERKONFIRMASI" },
      include: BOOKING_LIST_INCLUDE,
    }),
  );
  return rows
    .map((row) => ({ ...row, phase: onlinePhase(row.contactWindows, now) }))
    .sort((a, b) => {
      const byPhase = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
      if (byPhase !== 0) return byPhase;
      const next = (row: typeof a) => nextOpenWindow(row.contactWindows, now)?.startAt.getTime() ?? row.startAt.getTime();
      return next(a) - next(b);
    });
}
```

Run: `npm run test:integration -- tests/integration/online-admin.test.ts tests/integration/online-isolation.test.ts tests/integration/appointment.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t4.log" 2>&1; grep -E "Test Files|Tests " "$WS/t4.log"; npx eslint src/server; npx tsc --noEmit -p . > "$WS/t4-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/server/online-consultation.ts src/server/online-store.ts src/server/appointment.ts tests/integration/online-admin.test.ts
git commit -m "feat: let staff create online bookings with contact windows, change those windows, and list confirmed online bookings"
```

---

### Task 5: Aksi publik — pilihan online di `/daftar`, kirim booking online, kwitansi, dan cek booking

**Files:**
- Modify:
  - `src/server/public-booking-data.ts` (`BookingOptions.online`);
  - `src/server/public-booking.ts` (`submitOnlineBooking`, kwitansi, status cek booking, batal);
  - `src/lib/whatsapp.ts` (dua teks pesan customer ke klinik);
  - fixture uji: `tests/unit/components/registration-flow.test.tsx`, `tests/unit/components/booking-status-lookup.test.tsx`.
- Test: `tests/integration/online-public.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `validateContactWindows`, `boundsOf`, `windowLines`, `onlineTotal`, `ONLINE_BRANCH_LABEL`;
  - Task 4: `loadOnlineService`, `onlineBranchId`; pembantu uji `setOnlineService` (Task 3).
- Produces:
  - `BookingOptions.online: OnlineOption | null` dengan `OnlineOption = { serviceId: string; serviceName: string; price: number; doctors: { id: string; name: string }[] }` (null bila layanan tidak aktif, harga 0, atau tidak ada dokter aktif);
  - `submitOnlineBooking(input: OnlineBookingInput): Promise<ActionResult<{ receipt: BookingReceipt }>>`, dengan `OnlineBookingInput = { submissionKey: string; staffId: string; windows: unknown; answers: unknown; identity: unknown; consentData: boolean; consentFee: boolean; website: string }`;
  - `BookingReceipt.online: OnlineReceipt | null`, `OnlineReceipt = { windowLines: string[]; servicePrice: number; total: number; maskedWhatsapp: string }`; untuk booking online `branchName` = "Online (WhatsApp)";
  - `PublicBookingStatus.channel: "KLINIK" | "ONLINE"`, `.windowLines: string[]`, `.onlineChangeLink: string | null`; booking online tidak bisa dibatalkan atau dipindah dari situs;
  - `whatsapp.ts`: `onlineSiteBookingWhatsAppMessage(input: { patientName: string; code: string; staffName: string; total: number }): string`, `onlineChangeRequestMessage(code: string): string`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/online-public.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { cancelSiteBooking, findBookingStatus, submitOnlineBooking, type OnlineBookingInput } from "@/server/public-booking";
import { getBookingOptions } from "@/server/public-booking-data";
import { aestheticNewPatient, newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers-v2";
import { cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "publik-online-uji";
const PATIENT_WA = "6281234567890";
const today = witaDateString(new Date());
const day = (offset: number) => addDaysToDateString(today, offset);
const draft = (date: string, startMinute: number, endMinute: number) => ({ date, startMinute, endMinute });
let keySeq = 0;

describe("konsultasi online dari situs", () => {
  let world: BookingWorld;

  function input(overrides: Partial<OnlineBookingInput> = {}): OnlineBookingInput {
    keySeq += 1;
    return {
      submissionKey: `kunci-kiriman-online-${keySeq}-${Date.now()}`,
      staffId: world.doctorId,
      windows: [draft(day(3), 600, 720), draft(day(2), 1140, 1260)],
      answers: slimmingNewPatient,
      identity: newPatientIdentity,
      consentData: true,
      consentFee: true,
      website: "",
      ...overrides,
    };
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bookingFee: 100000 } });
    world = await createBookingWorld(SLUG);
  });

  beforeEach(async () => {
    await setOnlineService({ price: 250000, active: true });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("pilihan online di /daftar mengikuti layanan Konsultasi Online", async () => {
    const options = await getBookingOptions();
    expect(options.online).toMatchObject({ serviceName: "Konsultasi Online", price: 250000 });
    expect(options.online?.doctors).toContainEqual({ id: world.doctorId, name: "dr. Uji Publik" });
    expect(options.online?.doctors.map((d) => d.id)).not.toContain(world.therapistId);

    await setOnlineService({ price: 250000, active: false });
    expect((await getBookingOptions()).online).toBeNull();
    await setOnlineService({ price: 0, active: true });
    expect((await getBookingOptions()).online).toBeNull();
  });

  it("kirim booking online: kanal, biaya, rentang, isian, dan kwitansi berisi total", async () => {
    const sent = input();
    const { receipt } = await unwrap(submitOnlineBooking(sent));

    expect(receipt).toMatchObject({
      patientName: "Siti Rahayu",
      serviceName: "Konsultasi Online",
      staffName: "dr. Uji Publik",
      branchName: "Online (WhatsApp)",
      bookingFee: 100000,
      online: { servicePrice: 250000, total: 350000, maskedWhatsapp: "0812-****-7890" },
    });
    expect(receipt.online?.windowLines).toHaveLength(2);
    expect(receipt.online?.windowLines[0]).toMatch(/^• .*19\.00–21\.00$/);
    expect(decodeURIComponent(receipt.confirmationLink)).toContain("konsultasi online");

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { code: receipt.code },
      include: { contactWindows: true, intake: true },
    });
    expect(row).toMatchObject({ channel: "ONLINE", source: "SITUS", status: "MENUNGGU_KONFIRMASI", patientId: null, servicePrice: 250000 });
    expect(row.contactWindows).toHaveLength(2);
    expect(row.intake).toMatchObject({ status: "TERISI", purpose: "SLIMMING", submissionKey: sent.submissionKey });
  });

  it("kirim ulang dengan kunci yang sama mengembalikan booking yang sama", async () => {
    const sent = input();
    const first = await unwrap(submitOnlineBooking(sent));
    const again = await unwrap(submitOnlineBooking(sent));
    expect(again.receipt.code).toBe(first.receipt.code);
    expect(await prisma.intake.count({ where: { submissionKey: sent.submissionKey } })).toBe(1);
  });

  it("semua tujuan kuis boleh online, termasuk Aesthetic", async () => {
    const { receipt } = await unwrap(submitOnlineBooking(input({ answers: aestheticNewPatient })));
    expect((await prisma.intake.findFirstOrThrow({ where: { appointment: { code: receipt.code } } })).purpose).toBe("AESTHETIC");
  });

  it("menolak layanan nonaktif, terapis, rentang tidak sah, persetujuan kosong, dan bot", async () => {
    await setOnlineService({ price: 250000, active: false });
    expect(await submitOnlineBooking(input())).toEqual({
      ok: false,
      error: "Konsultasi online sedang tidak tersedia. Silakan pilih datang ke klinik.",
    });
    await setOnlineService({ price: 250000, active: true });

    expect(await submitOnlineBooking(input({ staffId: world.therapistId }))).toEqual({
      ok: false,
      error: "Tenaga ini tidak menangani layanan tersebut.",
    });
    expect(await submitOnlineBooking(input({ windows: [draft(day(15), 600, 720)] }))).toEqual({
      ok: false,
      error: "Pilih tanggal antara hari ini dan 14 hari ke depan.",
    });
    expect(await submitOnlineBooking(input({ windows: [draft(day(2), 600, 720), draft(day(2), 660, 780)] }))).toEqual({
      ok: false,
      error: "Waktu-waktu yang dipilih tidak boleh tumpang tindih.",
    });
    expect(await submitOnlineBooking(input({ consentFee: false }))).toEqual({
      ok: false,
      error: "Centang kedua persetujuan untuk melanjutkan.",
    });
    expect((await submitOnlineBooking(input({ website: "spam" }))).ok).toBe(false);
  });

  it("cek booking: rentang tampil, tanpa batal atau pindah dari situs", async () => {
    const { receipt } = await unwrap(submitOnlineBooking(input()));
    const status = await unwrap(findBookingStatus({ code: receipt.code, last4: "7890" }));
    expect(status).toMatchObject({
      channel: "ONLINE",
      branchName: "Online (WhatsApp)",
      canCancel: false,
      canReschedule: false,
      rescheduleLink: null,
    });
    expect(status?.windowLines).toHaveLength(2);
    expect(decodeURIComponent(status?.onlineChangeLink ?? "")).toContain(receipt.code);

    expect(await cancelSiteBooking({ code: receipt.code, last4: "7890" })).toEqual({
      ok: false,
      error: "Untuk membatalkan konsultasi online, hubungi kami lewat WhatsApp.",
    });
  });
});
```

Run: `npm run test:integration -- tests/integration/online-public.test.ts`
Expected: FAIL, karena `submitOnlineBooking` belum diekspor.

- [ ] **Step 2: Pilihan online di data `/daftar`**

Di `src/server/public-booking-data.ts`:
1. Tambahkan import `import { loadOnlineService } from "@/server/online-store";`.
2. Tambahkan tipe dan ubah `BookingOptions`:

```ts
/** Pilihan "Online lewat WhatsApp" di layar Layanan & biaya (spec 4.1); null bila tidak tersedia. */
export type OnlineOption = { serviceId: string; serviceName: string; price: number; doctors: { id: string; name: string }[] };
```

   lalu tambahkan `online: OnlineOption | null;` di tipe `BookingOptions` setelah `bookingFee: number;`.
3. Di `getBookingOptions`, tambahkan `loadOnlineService()` sebagai elemen terakhir `Promise.all` (`const [branches, consultation, treatments, staff, setting, onlineService] = …`), lalu sebelum `return` tambahkan:

```ts
  const doctors = staff.filter((person) => person.role === "DOKTER").map((person) => ({ id: person.id, name: person.name }));
  const online: OnlineOption | null =
    onlineService && doctors.length > 0
      ? { serviceId: onlineService.id, serviceName: onlineService.name, price: onlineService.promoPrice, doctors }
      : null;
```

   dan tambahkan `online,` di objek yang dikembalikan setelah `bookingFee: setting.bookingFee,`.

- [ ] **Step 3: Teks pesan customer ke klinik**

Tambahkan di akhir `src/lib/whatsapp.ts`:

```ts
/** Pesan customer ke klinik setelah mendaftar konsultasi online di situs, untuk mengantar bukti transfer. */
export function onlineSiteBookingWhatsAppMessage(input: {
  patientName: string;
  code: string;
  staffName: string;
  total: number;
}): string {
  return (
    `Halo ${CLINIC_NAME}, saya sudah mendaftar konsultasi online. Kode: ${input.code}, ` +
    `atas nama ${input.patientName}, dengan ${input.staffName}. Berikut bukti transfer ${formatRupiah(input.total)}.`
  );
}

/** Dari /cek-booking: customer meminta ganti waktu atau batal konsultasi online lewat WA (spec 4.5). */
export function onlineChangeRequestMessage(code: string): string {
  return `Halo ${CLINIC_NAME}, saya ingin mengganti waktu atau membatalkan konsultasi online ${code}.`;
}
```

- [ ] **Step 4: Kirim booking online, kwitansi, dan cek booking**

Di `src/server/public-booking.ts`:

1. **Import:** tambahkan

```ts
import { boundsOf, ONLINE_BRANCH_LABEL, onlineTotal, validateContactWindows, windowLines } from "@/lib/online-consultation";
import { loadOnlineService, onlineBranchId } from "@/server/online-store";
```

   dan tambahkan `onlineChangeRequestMessage, onlineSiteBookingWhatsAppMessage,` ke import dari `@/lib/whatsapp`.

2. **Tipe kwitansi:** tambahkan sebelum `export type BookingReceipt`:

```ts
/** Bagian kwitansi khusus konsultasi online (spec 4.4). Hanya teks dan angka, aman disimpan di sessionStorage. */
export type OnlineReceipt = { windowLines: string[]; servicePrice: number; total: number; maskedWhatsapp: string };
```

   lalu tambahkan `online: OnlineReceipt | null;` di `BookingReceipt` setelah `confirmationLink: string;`.

3. **`buildReceipt`:** ganti seluruh fungsi dengan:

```ts
async function buildReceipt(appointmentId: string): Promise<BookingReceipt> {
  const [appointment, setting] = await Promise.all([
    prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: {
        code: true,
        channel: true,
        startAt: true,
        bookingFee: true,
        servicePrice: true,
        service: { select: { name: true } },
        staff: { select: { name: true } },
        branch: { select: { name: true } },
        intake: { select: { name: true, whatsapp: true } },
        contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },
      },
    }),
    getClinicSetting(),
  ]);
  const patientName = appointment.intake?.name ?? "";
  const serviceName = appointment.service?.name ?? "Konsultasi Dokter";

  if (appointment.channel === "ONLINE") {
    const total = onlineTotal(appointment);
    return {
      code: appointment.code,
      patientName,
      serviceName,
      staffName: appointment.staff.name,
      branchName: ONLINE_BRANCH_LABEL,
      startAt: appointment.startAt,
      bookingFee: appointment.bookingFee,
      bankAccount: formatBankAccount(setting),
      confirmationLink: buildWhatsAppLink(
        onlineSiteBookingWhatsAppMessage({ patientName, code: appointment.code, staffName: appointment.staff.name, total }),
      ),
      online: {
        windowLines: windowLines(appointment.contactWindows),
        servicePrice: appointment.servicePrice ?? 0,
        total,
        maskedWhatsapp: maskWhatsapp(appointment.intake?.whatsapp ?? ""),
      },
    };
  }

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
    online: null,
  };
}
```

4. **Isian dipakai bersama:** tambahkan sebelum `createSiteBooking`:

```ts
/** Isian dari kiriman /daftar, sama untuk booking klinik dan online. */
function siteIntake(
  answers: QuizAnswers,
  identity: ValidIdentity,
  patientType: "BARU" | "LAMA",
  now: Date,
  submissionKey: string,
): Omit<Prisma.IntakeUncheckedCreateInput, "appointmentId"> {
  return {
    status: "TERISI",
    kind: patientType === "LAMA" ? "PENDEK" : "LENGKAP",
    purpose: answers.purpose,
    claimsReturning: patientType === "LAMA",
    quizVersion: QUIZ_VERSION,
    answers: answersForStorage(answers) as Prisma.InputJsonValue,
    name: identity.name,
    whatsapp: identity.whatsapp,
    birthDate: new Date(`${identity.birthDate}T00:00:00Z`),
    gender: identity.gender,
    occupation: identity.occupation,
    address: identity.address,
    selfWeightKg: answers.body?.weightKg,
    selfHeightCm: answers.body?.heightCm,
    consentAt: now,
    consentVersion: PRIVACY_POLICY_VERSION,
    submittedAt: now,
    submissionKey,
  };
}
```

   dengan `type ValidIdentity = Extract<ReturnType<typeof validateIdentity>, { ok: true }>["identity"];` ditulis tepat di atasnya. Di `submitSiteBooking`, ganti objek isian kedua yang dikirim ke `createSiteBooking` (dari `{ status: "TERISI", … submissionKey: input.holdToken, }`) dengan `siteIntake(answers, identity, patientType, now, input.holdToken)`.

5. **Kirim booking online:** tambahkan setelah `submitSiteBooking`:

```ts
export type OnlineBookingInput = {
  /** Kunci kiriman buatan browser; kiriman ulang dengan kunci yang sama mengembalikan booking yang sama. */
  submissionKey: string;
  staffId: string;
  windows: unknown;
  answers: unknown;
  identity: unknown;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan: tersembunyi dari manusia, diisi bot. */
  website: string;
};

const ONLINE_UNAVAILABLE = "Konsultasi online sedang tidak tersedia. Silakan pilih datang ke klinik.";

/**
 * Konsultasi online dari /daftar (spec 4): tanpa slot dan tanpa hold. Rentang waktu luang,
 * dokter, layanan, dan biaya diperiksa ulang di sini; booking dan isian dibuat dalam satu transaksi.
 */
export async function submitOnlineBooking(input: OnlineBookingInput): Promise<ActionResult<{ receipt: BookingReceipt }>> {
  return runAction(async () => {
    await guardRate(submitLimiter);
    if (input.website) throw new UserFacingError(GENERIC_FAILURE);
    const key = input.submissionKey;
    if (typeof key !== "string" || key.length < 16 || key.length > 100) throw new UserFacingError(GENERIC_FAILURE);

    const previous = await findSubmitted(key);
    if (previous) return { receipt: await buildReceipt(previous) };

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

    const now = new Date();
    const windows = validateContactWindows(input.windows, { now, audience: "CUSTOMER" });
    if (!windows.ok) throw new UserFacingError(windows.message);
    if (typeof input.staffId !== "string" || !input.staffId) throw new UserFacingError("Pilih dokter lebih dulu.");

    const [service, branchId, setting] = await Promise.all([loadOnlineService(), onlineBranchId(), getClinicSetting()]);
    if (!service || !branchId) throw new UserFacingError(ONLINE_UNAVAILABLE);
    const [doctor] = await eligibleStaff({ requiresDoctor: true }, input.staffId);
    const first = boundsOf(windows.windows);

    let appointmentId: string;
    try {
      appointmentId = await createSiteBooking(
        {
          type: "KONSULTASI",
          channel: "ONLINE",
          startAt: first.startAt,
          endAt: first.endAt,
          source: "SITUS",
          branchId,
          staffId: doctor.id,
          serviceId: service.id,
          patientId: null,
          bookingFee: bookingFeeFor("SITUS", setting.bookingFee),
          servicePrice: service.promoPrice,
          contactWindows: { create: windows.windows.map((w) => ({ startAt: w.startAt, endAt: w.endAt })) },
        },
        siteIntake(answers, checked.identity, patientType, now, key),
        key,
      );
    } catch (error) {
      // Dua Kirim bersamaan dengan kunci yang sama: yang kalah gagal di batas unik isian.
      const raced = isUniqueViolation(error) ? await findSubmitted(key) : null;
      if (raced) return { receipt: await buildReceipt(raced) };
      throw error;
    }

    const receipt = await buildReceipt(appointmentId);
    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "appointment.site-create",
      entity: "Appointment",
      entityId: appointmentId,
      summary: `${receipt.code} — online, ${windows.windows.length} waktu luang`,
    });
    safeRevalidatePath("/admin/booking");
    return { receipt };
  });
}
```

6. **Status cek booking:**
   - di `PublicBookingStatus`, tambahkan setelah `rescheduleLink: string | null;`:

```ts
  channel: "KLINIK" | "ONLINE";
  /** Rentang waktu luang booking online (spec 4.5); kosong untuk booking klinik. */
  windowLines: string[];
  /** Tautan WA ke klinik untuk mengganti waktu atau membatalkan konsultasi online. */
  onlineChangeLink: string | null;
```

   - di `findOwnBooking`, tambahkan `channel: true,` dan `contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },` di `select`;
   - di `toPublicStatus`, tambahkan di awal fungsi:

```ts
  if (booking.channel === "ONLINE") {
    return {
      code: booking.code,
      status: booking.status,
      statusLabel: STATUS_LABEL[booking.status],
      serviceName: booking.service?.name ?? "Konsultasi Online",
      staffName: booking.staff.name,
      branchName: ONLINE_BRANCH_LABEL,
      startAt: booking.startAt,
      maskedWhatsapp: maskWhatsapp(booking.whatsapp),
      bookingFee: booking.bookingFee,
      canCancel: false,
      canReschedule: false,
      rescheduleLink: null,
      channel: "ONLINE",
      windowLines: windowLines(booking.contactWindows),
      onlineChangeLink: ACTIVE.includes(booking.status) ? buildWhatsAppLink(onlineChangeRequestMessage(booking.code)) : null,
    };
  }
```

     dan tambahkan `channel: "KLINIK", windowLines: [], onlineChangeLink: null,` di objek yang dikembalikan untuk booking klinik.
   - di `cancelSiteBooking`, tambahkan tepat setelah `if (!booking) throw …`:

```ts
    if (booking.channel === "ONLINE") {
      throw new UserFacingError("Untuk membatalkan konsultasi online, hubungi kami lewat WhatsApp.");
    }
```

- [ ] **Step 5: Fixture uji yang sudah ada**

- `tests/unit/components/registration-flow.test.tsx`: di objek `receipt` hasil tiruan `submitSiteBooking`, tambahkan `online: null,` setelah `confirmationLink: …,`. Tambahkan `online: null,` juga di objek `options` (tipe `BookingOptions`) bila berkas itu mendefinisikannya, setelah `bookingFee: …,`.
- `tests/unit/components/booking-status-lookup.test.tsx`: di objek `confirmed`, tambahkan `channel: "KLINIK" as const, windowLines: [], onlineChangeLink: null,` setelah `rescheduleLink: …,`.

Lalu cari fixture lain yang membangun `BookingOptions` atau `PublicBookingStatus`:

Run: `grep -rln "bookingFee: 100000,\|rescheduleLink:" tests/unit | xargs grep -ln "branches:\|canReschedule"`
Expected: setiap berkas yang muncul mendapat `online: null` (untuk `BookingOptions`) atau tiga kolom status di atas. `npx tsc --noEmit -p .` di Step 6 memastikan tidak ada yang tertinggal.

- [ ] **Step 6: Jalankan uji dan commit**

Run: `npm run test:integration -- tests/integration/online-public.test.ts tests/integration/site-booking.test.ts tests/integration/booking-status.test.ts`
Expected: PASS semua.

Run: `npx vitest run > "$WS/t5.log" 2>&1; grep -E "Test Files|Tests " "$WS/t5.log"; npx eslint src/server src/lib/whatsapp.ts; npx tsc --noEmit -p . > "$WS/t5-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/server/public-booking-data.ts src/server/public-booking.ts src/lib/whatsapp.ts tests/integration/online-public.test.ts \
  tests/unit/components/registration-flow.test.tsx tests/unit/components/booking-status-lookup.test.tsx
git commit -m "feat: accept online consultation bookings from /daftar with contact windows, and show them on the receipt and booking lookup"
```

---

### Task 6: Pesan WhatsApp versi online — instruksi transfer, konfirmasi, pengingat, minta waktu baru

**Files:**
- Modify: `src/lib/transfer-instruction.ts`, `src/lib/booking-messages.ts`, `src/lib/reminder-work.ts`, `src/server/reminder.ts`, `src/server/appointment-message.ts`
- Test:
  - baru: `tests/unit/online-messages.test.ts`, `tests/integration/online-reminder.test.ts`;
  - diubah: `tests/unit/reminder-work.test.ts`.

**Interfaces:**
- Consumes: Task 2 (`onlineTransferText`, `onlineConfirmationText`, `onlineReminderText`, `onlineRequestNewTimeText`, `nextOpenWindow`, `reminderWindowsOn`, `windowLabel`, `ONLINE_BRANCH_LABEL`).
- Produces:
  - `TransferBooking` dan `MessageBooking` menerima kolom opsional `channel?: "KLINIK" | "ONLINE"`, `servicePrice?: number | null`, `contactWindows?: readonly { startAt: Date; endAt: Date }[]`, `contactAttempts?: readonly { at: Date; staffName: string }[]`. Untuk kanal `ONLINE`, `transferInstructionFor`, `confirmationMessageFor`, dan `reminderMessageFor` memakai teks online; kanal lain tidak berubah;
  - `reminderMessageFor(booking, quizLink?, now?)` — parameter ketiga baru `now: Date = new Date()`;
  - `requestNewTimeMessageFor(booking: MessageBooking): WhatsAppMessage | null` (pesan "Minta waktu baru", spec 7.3);
  - `WorkBooking.reminderAt?: Date` — tanggal yang diingatkan; bila ada, menggantikan `startAt` untuk hari pengingat, dan pemanggil sudah menyaring booking yang tidak punya rentang terbuka;
  - `ReminderRow.channel: "KLINIK" | "ONLINE"` dan `ReminderRow.onlineLabel: string | null` ("Online · {rentang terbuka berikutnya}"); `branchName` booking online = "Online (WhatsApp)".

- [ ] **Step 1: Tulis uji unit (gagal)**

Buat `tests/unit/online-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { confirmationMessageFor, reminderMessageFor, requestNewTimeMessageFor, type MessageBooking } from "@/lib/booking-messages";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { transferInstructionFor, type TransferBooking } from "@/lib/transfer-instruction";

const NOW = combineWitaDateAndMinutes("2026-10-06", 10 * 60);
const windows = [
  { startAt: combineWitaDateAndMinutes("2026-10-07", 600), endAt: combineWitaDateAndMinutes("2026-10-07", 720) },
  { startAt: combineWitaDateAndMinutes("2026-10-07", 1140), endAt: combineWitaDateAndMinutes("2026-10-07", 1260) },
  { startAt: combineWitaDateAndMinutes("2026-10-09", 600), endAt: combineWitaDateAndMinutes("2026-10-09", 720) },
];
const online: MessageBooking & TransferBooking = {
  code: "SDY-AB12",
  type: "KONSULTASI",
  startAt: windows[0].startAt,
  bookingFee: 100000,
  transferDeadline: combineWitaDateAndMinutes("2026-10-07", 9 * 60),
  service: { name: "Konsultasi Online" },
  staff: { name: "dr. Diane" },
  branch: { name: "SunDY Mahakeret", address: "Jl. Mahakeret", mapsUrl: null },
  patient: { name: "Siti Rahayu", whatsapp: "6281234567890" },
  channel: "ONLINE",
  servicePrice: 250000,
  contactWindows: windows,
  contactAttempts: [],
};
const bank = { bankName: "BCA", bankAccountNumber: "123", bankAccountHolder: "SunDY Clinic" };

describe("pesan booking online", () => {
  it("instruksi transfer memakai total dan rentang, bukan jam dan cabang", () => {
    const instruction = transferInstructionFor(online, bank);
    expect(instruction?.text).toContain("transfer Rp 350.000 (biaya booking Rp 100.000 + Konsultasi Online Rp 250.000)");
    expect(instruction?.text).toContain("• Rabu, 7 Oktober 2026, 10.00–12.00");
    expect(instruction?.text).not.toContain("SunDY Mahakeret");
    expect(instruction?.link).toContain("wa.me/6281234567890");
  });

  it("instruksi transfer tanpa rekening memakai kalimat pengganti", () => {
    const instruction = transferInstructionFor(online, { bankName: null, bankAccountNumber: null, bankAccountHolder: null });
    expect(instruction?.text).toContain("(rekening akan kami kirimkan)");
    expect(instruction?.missingBankAccount).toBe(true);
  });

  it("konfirmasi menyebut dokter dan rentang, tanpa alamat klinik", () => {
    const message = confirmationMessageFor(online, "https://sundyclinic.com");
    expect(message?.text).toContain("dr. Diane akan menelepon atau video call lewat WhatsApp");
    expect(message?.text).not.toContain("Jl. Mahakeret");
  });

  it("pengingat memakai semua rentang pada tanggal rentang terbuka berikutnya", () => {
    const message = reminderMessageFor(online, null, NOW);
    expect(message?.text).toContain("antara 10.00–12.00 atau 19.00–21.00");
    const afterFirstDay = reminderMessageFor(online, null, combineWitaDateAndMinutes("2026-10-07", 22 * 60));
    expect(afterFirstDay?.text).toContain("pada Jumat, 9 Oktober 2026");
    expect(reminderMessageFor(online, null, combineWitaDateAndMinutes("2026-10-10", 9 * 60))).toBeNull();
  });

  it("minta waktu baru: menyebut percobaan bila ada", () => {
    expect(requestNewTimeMessageFor(online)?.text).toContain("sudah lewat");
    const tried = requestNewTimeMessageFor({ ...online, contactAttempts: [{ at: NOW, staffName: "dr. Diane" }] });
    expect(tried?.text).toContain("belum tersambung");
    expect(tried?.link).toContain("wa.me/6281234567890");
  });

  it("booking klinik tidak berubah", () => {
    const clinic = { ...online, channel: "KLINIK" as const, servicePrice: null, contactWindows: undefined };
    expect(transferInstructionFor(clinic, bank)?.text).toContain("Mohon transfer biaya booking Rp 100.000");
    expect(confirmationMessageFor(clinic, "https://sundyclinic.com")?.text).toContain("Jl. Mahakeret");
    expect(requestNewTimeMessageFor(clinic)).toBeNull();
  });
});
```

Tambahkan di akhir `describe("groupReminderWork", …)` di `tests/unit/reminder-work.test.ts`:

```ts
  it("reminderAt menggantikan jadwal untuk hari pengingat; pesan tetap dicocokkan dengan jadwal booking", () => {
    // Sabtu 8 Feb 2031 10.00: rentang pertama sudah lewat, rentang terbuka berikutnya Selasa 11.
    const now = wita(8, 10);
    const start = wita(6, 11);
    const confirmed = msg("KONFIRMASI", start, wita(5, 9));
    const online = { ...booking("online", start, [confirmed]), reminderAt: wita(11, 19) };
    const groups = groupReminderWork([online], { now, closedDates: NO_HOLIDAYS });
    expect(groups.remind).toHaveLength(0);

    const due = groupReminderWork([online], { now: wita(10, 10), closedDates: NO_HOLIDAYS });
    expect(due.remind.map((b) => [b.id, b.reminderDay])).toEqual([["online", "2031-02-10"]]);
  });
```

Run: `npx vitest run tests/unit/online-messages.test.ts tests/unit/reminder-work.test.ts`
Expected: FAIL, karena `requestNewTimeMessageFor` belum ada dan teks online belum dipakai.

- [ ] **Step 2: Instruksi transfer versi online**

Di `src/lib/transfer-instruction.ts`:
1. Tambahkan import `import { onlineTransferText } from "./online-consultation";`.
2. Di tipe `TransferBooking`, tambahkan setelah `patient: …;`:

```ts
  /** Konsultasi online (spec konsultasi online 7.1): teksnya memakai total dan rentang waktu luang. */
  channel?: "KLINIK" | "ONLINE";
  servicePrice?: number | null;
  contactWindows?: readonly { startAt: Date; endAt: Date }[];
```

3. Di `transferInstructionFor`, ganti `const text = transferInstructionText({ … });` dengan:

```ts
  const text =
    booking.channel === "ONLINE"
      ? onlineTransferText({
          patientName: booking.patient.name,
          code: booking.code,
          doctorName: booking.staff.name,
          windows: booking.contactWindows ?? [],
          bookingFee: booking.bookingFee,
          servicePrice: booking.servicePrice ?? 0,
          deadline: booking.transferDeadline,
          bankLine: bankAccount ?? MISSING_BANK_ACCOUNT_LINE,
          quizLink,
        })
      : transferInstructionText({
          patientName: booking.patient.name,
          code: booking.code,
          serviceName: bookingServiceName(booking),
          startAt: booking.startAt,
          staffName: booking.staff.name,
          branchName: booking.branch.name,
          fee: booking.bookingFee,
          deadline: booking.transferDeadline,
          bankAccount,
          quizLink,
        });
```

- [ ] **Step 3: Konfirmasi, pengingat, dan minta waktu baru**

Di `src/lib/booking-messages.ts`:
1. Tambahkan import:

```ts
import {
  nextOpenWindow,
  onlineConfirmationText,
  onlineReminderText,
  onlineRequestNewTimeText,
  reminderWindowsOn,
} from "./online-consultation";
import { witaDateString } from "./time";
```

2. Di tipe `MessageBooking`, tambahkan setelah `patient: …;`:

```ts
  channel?: "KLINIK" | "ONLINE";
  contactWindows?: readonly { startAt: Date; endAt: Date }[];
  contactAttempts?: readonly { at: Date; staffName: string }[];
```

3. Di `confirmationMessageFor`, tambahkan tepat setelah `if (!booking.patient) return null;`:

```ts
  if (booking.channel === "ONLINE") {
    const text = onlineConfirmationText({
      patientName: booking.patient.name,
      code: booking.code,
      doctorName: booking.staff.name,
      windows: booking.contactWindows ?? [],
      quizLink,
    });
    return { text, link: buildWhatsAppLinkTo(booking.patient.whatsapp, text) };
  }
```

4. Ganti `reminderMessageFor` dengan:

```ts
export function reminderMessageFor(
  booking: MessageBooking,
  quizLink: string | null = null,
  now: Date = new Date(),
): WhatsAppMessage | null {
  if (!booking.patient) return null;
  if (booking.channel === "ONLINE") {
    const windows = booking.contactWindows ?? [];
    const next = nextOpenWindow(windows, now);
    if (!next) return null;
    const text = onlineReminderText({
      patientName: booking.patient.name,
      code: booking.code,
      doctorName: booking.staff.name,
      windows: reminderWindowsOn(windows, witaDateString(next.startAt)),
    });
    return { text, link: buildWhatsAppLinkTo(booking.patient.whatsapp, text) };
  }
  const text = reminderText({
    patientName: booking.patient.name,
    serviceName: bookingServiceName(booking),
    startAt: booking.startAt,
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    branchAddress: booking.branch.address,
    mapsUrl: booking.branch.mapsUrl,
    quizLink,
  });
  return { text, link: buildWhatsAppLinkTo(booking.patient.whatsapp, text) };
}

/** "Minta waktu baru via WA" untuk booking online yang semua rentangnya lewat (spec 5.3, 7.3). */
export function requestNewTimeMessageFor(booking: MessageBooking): WhatsAppMessage | null {
  if (booking.channel !== "ONLINE" || !booking.patient) return null;
  const text = onlineRequestNewTimeText({
    patientName: booking.patient.name,
    code: booking.code,
    doctorName: booking.staff.name,
    hadAttempt: (booking.contactAttempts ?? []).length > 0,
  });
  return { text, link: buildWhatsAppLinkTo(booking.patient.whatsapp, text) };
}
```

- [ ] **Step 4: Kotak pengingat untuk booking online**

Di `src/lib/reminder-work.ts`:
1. Ganti tipe `WorkBooking` dengan:

```ts
export type WorkBooking = {
  startAt: Date;
  messages: readonly MessageRecord[];
  /**
   * Konsultasi online: awal rentang terbuka berikutnya (spec konsultasi online 7.4). Menggantikan
   * startAt untuk hari pengingat; pesan tetap dicocokkan dengan startAt booking. Pemanggil hanya
   * mengirim booking online yang masih punya rentang terbuka.
   */
  reminderAt?: Date;
};
```

2. Di `groupReminderWork`, ganti `if (booking.startAt.getTime() <= context.now.getTime()) continue;` dengan:

```ts
    if (booking.reminderAt === undefined && booking.startAt.getTime() <= context.now.getTime()) continue;
```

   dan ganti `const date = witaDateString(booking.startAt);` dengan `const date = witaDateString(booking.reminderAt ?? booking.startAt);`.

Di `src/server/reminder.ts`:
1. Tambahkan import `import { nextOpenWindow, ONLINE_BRANCH_LABEL, windowLabel } from "@/lib/online-consultation";`.
2. Di tipe `ReminderRow`, tambahkan setelah `branchName: string;`:

```ts
  channel: "KLINIK" | "ONLINE";
  /** "Online · {rentang terbuka berikutnya}" untuk booking online; null untuk klinik. */
  onlineLabel: string | null;
```

3. Di `WORK_INCLUDE`, tambahkan `contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },`.
4. Ganti `loadReminderGroups` dengan:

```ts
async function loadReminderGroups(now: Date) {
  const rows = await prisma.appointment.findMany({
    where: {
      status: "TERKONFIRMASI",
      patientId: { not: null },
      OR: [
        { channel: "KLINIK", startAt: { gt: now } },
        { channel: "ONLINE", contactWindows: { some: { endAt: { gt: now } } } },
      ],
    },
    include: WORK_INCLUDE,
    orderBy: { startAt: "asc" },
  });
  // Booking online diingatkan untuk rentang terbuka berikutnya (spec konsultasi online 7.4).
  const bookings = rows.map((row) =>
    row.channel === "ONLINE" ? { ...row, reminderAt: nextOpenWindow(row.contactWindows, now)!.startAt } : row,
  );
  const latest = bookings.reduce(
    (max, b) => Math.max(max, ("reminderAt" in b && b.reminderAt ? b.reminderAt : b.startAt).getTime()),
    now.getTime(),
  );
  const closedDates = await closedDatesBetween(new Date(now.getTime() - MAX_LOOKBACK_DAYS * DAY_MS), new Date(latest));
  return groupReminderWork(bookings, { now, closedDates });
}
```

5. Di `getReminderWorklist`, di dalam `toRow`, ganti baris `branchName: booking.branch.name,` dengan:

```ts
    branchName: booking.channel === "ONLINE" ? ONLINE_BRANCH_LABEL : booking.branch.name,
    channel: booking.channel,
    onlineLabel:
      booking.channel === "ONLINE"
        ? `Online · ${windowLabel(nextOpenWindow(booking.contactWindows, now) ?? booking.contactWindows[0])}`
        : null,
```

   dan ganti `reminder: reminderMessageFor(booking, quizLinkFor(booking, siteUrl, now)),` dengan `reminder: reminderMessageFor(booking, quizLinkFor(booking, siteUrl, now), now),`.

Di `src/server/appointment-message.ts`, tambahkan `contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },` di `MESSAGE_BOOKING_INCLUDE`. (Kolom `channel` dan `servicePrice` sudah ikut karena `include` membawa semua kolom booking.)

Run: `npx vitest run tests/unit/online-messages.test.ts tests/unit/reminder-work.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Uji integrasi pengingat**

Buat `tests/integration/online-reminder.test.ts`:

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { getReminderWorklist } from "@/server/reminder";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "pengingat-online-uji";
const MRN = "SDY-2026-7760";
// April 2032: Selasa 6, Rabu 7, Kamis 8. "Sekarang" = Rabu 7 April 10.00 WITA.
const NOW = combineWitaDateAndMinutes("2032-04-07", 10 * 60);
const at = (date: string, minute: number) => combineWitaDateAndMinutes(date, minute);

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: MRN } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("pengingat untuk konsultasi online", () => {
  let lapsedFirstId: string;
  let unconfirmedId: string;

  beforeAll(async () => {
    await cleanup();
    const staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "dr. Online Pengingat", role: "DOKTER" } })).id;
    const branchId = (
      await prisma.branch.create({
        data: { slug: SLUG, name: "Cabang Online", address: "Jl. Uji", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF" },
      })
    ).id;
    const patientId = (await prisma.patient.create({ data: { medicalRecordNumber: MRN, name: "Rina Online", whatsapp: "6281277600001" } })).id;

    const online = (code: string, windows: [string, number, number][]) =>
      prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          channel: "ONLINE",
          servicePrice: 250000,
          bookingFee: 100000,
          startAt: at(windows[0][0], windows[0][1]),
          endAt: at(windows[0][0], windows[0][2]),
          status: "TERKONFIRMASI",
          source: "WHATSAPP",
          branchId,
          staffId,
          patientId,
          contactWindows: { create: windows.map(([date, from, to]) => ({ startAt: at(date, from), endAt: at(date, to) })) },
        },
      });

    // Rentang pertama (Selasa) sudah lewat; rentang berikutnya Kamis besok → masuk "Ingatkan sekarang".
    const lapsedFirst = await online("PNO-1", [["2032-04-06", 600, 720], ["2032-04-08", 1140, 1260]]);
    lapsedFirstId = lapsedFirst.id;
    await prisma.appointmentMessage.create({
      data: { appointmentId: lapsedFirst.id, kind: "KONFIRMASI", scheduledFor: lapsedFirst.startAt, sentAt: at("2032-04-05", 600), sentById: "s1", sentByName: "Rina" },
    });
    // Belum ada konfirmasi → kotak "Konfirmasi belum dikirim".
    unconfirmedId = (await online("PNO-2", [["2032-04-09", 600, 720]])).id;
    // Semua rentang sudah lewat → tidak tampil sama sekali.
    await online("PNO-3", [["2032-04-06", 780, 900]]);
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("menyusun kotak pengingat dari rentang terbuka berikutnya, dengan teks dan label online", async () => {
    const worklist = await getReminderWorklist();
    const all = [...worklist.confirm, ...worklist.remind, ...worklist.reminded].filter((row) => row.code.startsWith("PNO-"));
    expect(all.map((row) => row.code).sort()).toEqual(["PNO-1", "PNO-2"]);

    const remind = worklist.remind.find((row) => row.appointmentId === lapsedFirstId);
    expect(remind).toMatchObject({ channel: "ONLINE", branchName: "Online (WhatsApp)" });
    expect(remind?.onlineLabel).toBe("Online · Kamis, 8 April 2032, 19.00–21.00");
    expect(remind?.reminder?.text).toContain("pada Kamis, 8 April 2032, dr. Online Pengingat akan menghubungi Anda lewat WhatsApp antara 19.00–21.00");

    const confirm = worklist.confirm.find((row) => row.appointmentId === unconfirmedId);
    expect(confirm?.confirmation?.text).toContain("pembayaran konsultasi online Anda (PNO-2) sudah kami terima");
  });
});
```

Run: `npm run test:integration -- tests/integration/online-reminder.test.ts tests/integration/reminder-worklist.test.ts tests/integration/appointment-message.test.ts`
Expected: PASS semua.

- [ ] **Step 6: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t6.log" 2>&1; grep -E "Test Files|Tests " "$WS/t6.log"; npx eslint src/lib src/server/reminder.ts src/server/appointment-message.ts; npx tsc --noEmit -p . > "$WS/t6-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0. Bila `tsc` menandai fixture `ReminderRow` di uji komponen (mis. `tests/unit/components/reminder-worklist.test.tsx`), tambahkan `channel: "KLINIK", onlineLabel: null,` di fixture itu.

```bash
git add src/lib/transfer-instruction.ts src/lib/booking-messages.ts src/lib/reminder-work.ts src/server/reminder.ts \
  src/server/appointment-message.ts tests/unit/online-messages.test.ts tests/unit/reminder-work.test.ts \
  tests/integration/online-reminder.test.ts tests/unit/components
git commit -m "feat: send online versions of the transfer, confirmation, reminder, and new-time WhatsApp messages"
```

---

### Task 7: Sisi dokter di server — Mulai konsultasi, Tidak terhubung, daftar "Konsultasi online", label Online

**Files:**
- Create: `src/server/encounter-store.ts`
- Modify:
  - `src/lib/online-consultation.ts` (`placeLabel`);
  - `src/server/online-consultation.ts` (aksi dokter), `src/server/encounter.ts` (pakai `lastHeightCm`), `src/server/encounter-read.ts` (`listOnlineWork`, label tempat, `online` di daftar dokter), `src/server/patient.ts` (label tempat di riwayat);
  - fixture: `tests/fixtures/encounter-detail.ts`, `tests/unit/components/doctor-worklist.test.tsx`.
- Test: `tests/integration/online-doctor.test.ts`, tambahan di `tests/unit/online-consultation.test.ts`

**Interfaces:**
- Consumes: Task 2 (`onlinePhase`, `nextOpenWindow`, `windowLabel`, `lastAttemptLabel`, `ONLINE_BRANCH_LABEL`), Task 4 (`online-consultation.ts`), sudah ada: `rejectedChangeError`, `INTAKE_PURPOSE_LABEL`.
- Produces:
  - `placeLabel(channel: "KLINIK" | "ONLINE", branchName: string): string` (lib);
  - `encounter-store.ts` (tanpa `"use server"`): `lastHeightCm(db: Prisma.TransactionClient, patientId: string): Promise<Prisma.Decimal | null>`;
  - `startOnlineConsultation(appointmentId: string): Promise<ActionResult<{ encounterId: string }>>` (`record:write`): *Terkonfirmasi* → *Hadir*, `startAt` = sekarang, `endAt` = sekarang + durasi layanan, kunjungan dibuat dalam transaksi yang sama; klik kedua/bersamaan mengembalikan kunjungan yang sama;
  - `recordContactAttempt(appointmentId: string): Promise<ActionResult<void>>` (`record:write`);
  - `listOnlineWork(): Promise<OnlineWorkRow[]>` (`record:write`), dengan

    ```ts
    type OnlineWorkRow = {
      appointmentId: string;
      code: string;
      phase: "NOW" | "TODAY" | "UPCOMING";
      patientName: string;
      patientRecordNumber: string;
      whatsapp: string;
      /** https://wa.me/<nomor> untuk chat atau panggilan WA. */
      whatsappLink: string;
      doctorName: string;
      purposeLabel: string | null;
      /** Isian kuis yang sudah dikirim, untuk tautan "Lihat isian". */
      intakeId: string | null;
      windows: { label: string; current: boolean }[];
      lastAttempt: string | null;
    };
    ```

  - `WorklistRow.online: boolean`; `EncounterDetail.appointment.channel: "KLINIK" | "ONLINE"`; `branchName` di detail kunjungan, riwayat kunjungan, daftar dokter, dan data pasien memakai `placeLabel`;
  - audit: `appointment.start-online`, `appointment.contact-failed`.

- [ ] **Step 1: Tulis uji (gagal)**

Tambahkan di `tests/unit/online-consultation.test.ts` (dan tambahkan `placeLabel` ke import):

```ts
describe("placeLabel", () => {
  it("booking online memakai Online (WhatsApp), booking klinik memakai nama cabang", () => {
    expect(placeLabel("ONLINE", "SunDY Mahakeret")).toBe("Online (WhatsApp)");
    expect(placeLabel("KLINIK", "SunDY Mahakeret")).toBe("SunDY Mahakeret");
  });
});
```

Buat `tests/integration/online-doctor.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { getEncounterForStaff, listDoctorWorklist, listOnlineWork } from "@/server/encounter-read";
import { recordContactAttempt, startOnlineConsultation } from "@/server/online-consultation";
import { purgeEncounters } from "../purge-encounters";
import { cleanupBookingWorld, createBookingWorld, setOnlineService, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({
  actor: {
    userId: "u1",
    staffId: "s1",
    name: "dr. Uji Online",
    role: "DOKTER" as "DOKTER" | "RESEPSIONIS",
    email: "uji@sundy.test",
  },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "dokter-online-uji";
const WA = "6281200007730";
const today = witaDateString(new Date());
const MINUTE = 60_000;

describe("konsultasi online di sisi dokter", () => {
  let world: BookingWorld;
  let patientId: string;
  let serviceId: string;
  let n = 0;

  async function online(windows: { startAt: Date; endAt: Date }[], status: "TERKONFIRMASI" | "MENUNGGU_KONFIRMASI" | "DIBATALKAN" = "TERKONFIRMASI") {
    n += 1;
    return prisma.appointment.create({
      data: {
        code: `DOL-${n}`,
        type: "KONSULTASI",
        channel: "ONLINE",
        servicePrice: 250000,
        bookingFee: 100000,
        startAt: windows[0].startAt,
        endAt: windows[0].endAt,
        status,
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId,
        patientId,
        contactWindows: { create: windows },
      },
    });
  }

  const around = () => ({ startAt: new Date(Date.now() - 30 * MINUTE), endAt: new Date(Date.now() + 90 * MINUTE) });
  const later = (days: number) => ({
    startAt: combineWitaDateAndMinutes(addDaysToDateString(today, days), 600),
    endAt: combineWitaDateAndMinutes(addDaysToDateString(today, days), 720),
  });

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    serviceId = await setOnlineService({ price: 250000, active: true });
    patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7730", name: "Rani Online", whatsapp: WA } })).id;
  });

  beforeEach(async () => {
    actor.role = "DOKTER";
    await purgeEncounters(prisma);
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("Mulai konsultasi: booking Hadir dengan jam sekarang, dan kunjungan langsung dibuat", async () => {
    const booking = await online([later(2)]);
    const before = Date.now();
    const { encounterId } = await unwrap(startOnlineConsultation(booking.id));

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id }, include: { encounter: true } });
    expect(row.status).toBe("HADIR");
    expect(row.encounter?.id).toBe(encounterId);
    expect(row.startAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.endAt.getTime() - row.startAt.getTime()).toBe(30 * MINUTE);
    expect(row.checkedInAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "appointment.start-online", entityId: booking.id } })).toBe(1);

    const detail = await getEncounterForStaff(encounterId);
    expect(detail?.appointment).toMatchObject({ channel: "ONLINE", branchName: "Online (WhatsApp)" });
    const worklist = await listDoctorWorklist();
    expect(worklist.today.find((r) => r.appointmentId === booking.id)).toMatchObject({ online: true, branchName: "Online (WhatsApp)" });
  });

  it("dua klik atau dua dokter bersamaan menghasilkan satu kunjungan", async () => {
    const booking = await online([later(2)]);
    const [a, b] = await Promise.all([startOnlineConsultation(booking.id), startOnlineConsultation(booking.id)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data.encounterId).toBe(b.data.encounterId);
    expect(await prisma.encounter.count({ where: { appointmentId: booking.id } })).toBe(1);
    expect((await unwrap(startOnlineConsultation(booking.id))).encounterId).toBe(a.data.encounterId);
  });

  it("menolak booking klinik, booking yang dibatalkan, dan resepsionis", async () => {
    const clinic = await prisma.appointment.create({
      data: {
        code: `DOL-K-${Date.now()}`,
        type: "KONSULTASI",
        startAt: later(2).startAt,
        endAt: new Date(later(2).startAt.getTime() + 30 * MINUTE),
        status: "TERKONFIRMASI",
        source: "WHATSAPP",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
    expect(await startOnlineConsultation(clinic.id)).toEqual({ ok: false, error: "Hanya untuk konsultasi online." });

    const cancelled = await online([later(3)], "DIBATALKAN");
    expect(await startOnlineConsultation(cancelled.id)).toEqual({
      ok: false,
      error: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman.",
    });

    actor.role = "RESEPSIONIS";
    const booking = await online([later(2)]);
    await expect(startOnlineConsultation(booking.id)).rejects.toThrow(/forbidden: record:write/);
    await expect(recordContactAttempt(booking.id)).rejects.toThrow(/forbidden: record:write/);
  });

  it("Tidak terhubung mencatat percobaan tanpa mengubah status", async () => {
    const booking = await online([later(2)]);
    await unwrap(recordContactAttempt(booking.id));
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: booking.id }, include: { contactAttempts: true } });
    expect(row.status).toBe("TERKONFIRMASI");
    expect(row.contactAttempts).toMatchObject([{ staffName: "dr. Uji Online" }]);
    expect(await prisma.auditLog.count({ where: { action: "appointment.contact-failed", entityId: booking.id } })).toBe(1);

    const waiting = await online([later(2)], "MENUNGGU_KONFIRMASI");
    expect(await recordContactAttempt(waiting.id)).toEqual({
      ok: false,
      error: "Booking ini sudah berstatus menunggu konfirmasi. Muat ulang halaman.",
    });
  });

  it("daftar Konsultasi online: Sekarang di atas, tanpa yang belum diverifikasi atau semua rentangnya lewat", async () => {
    const upcoming = await online([later(3)]);
    const now = await online([around()]);
    await online([later(2)], "MENUNGGU_KONFIRMASI");
    const lapsed = await online([{ startAt: new Date(Date.now() - 3 * 60 * MINUTE), endAt: new Date(Date.now() - 60 * MINUTE) }]);
    await prisma.intake.create({
      data: { appointmentId: now.id, patientId, status: "TERISI", kind: "LENGKAP", purpose: "SLIMMING", submittedAt: new Date() },
    });
    await unwrap(recordContactAttempt(upcoming.id));

    const rows = (await listOnlineWork()).filter((row) => row.code.startsWith("DOL-"));
    expect(rows.map((row) => [row.appointmentId, row.phase])).toEqual([
      [now.id, "NOW"],
      [upcoming.id, "UPCOMING"],
    ]);
    expect(rows.map((row) => row.appointmentId)).not.toContain(lapsed.id);
    expect(rows[0]).toMatchObject({
      patientName: "Rani Online",
      patientRecordNumber: "SDY-2026-7730",
      whatsapp: WA,
      whatsappLink: `https://wa.me/${WA}`,
      doctorName: "dr. Uji Publik",
      purposeLabel: "Slimming",
    });
    expect(rows[0].intakeId).not.toBeNull();
    expect(rows[0].windows).toEqual([expect.objectContaining({ current: true })]);
    expect(rows[1].lastAttempt).toMatch(/^Dicoba .* — tidak terhubung \(dr\. Uji Online\)$/);
  });
});
```

Run: `npx vitest run tests/unit/online-consultation.test.ts; npm run test:integration -- tests/integration/online-doctor.test.ts`
Expected: FAIL, karena `placeLabel`, `startOnlineConsultation`, dan `listOnlineWork` belum ada.

- [ ] **Step 2: Label tempat dan tinggi badan terakhir**

Tambahkan di akhir `src/lib/online-consultation.ts`:

```ts
/** Nama tempat di daftar dan riwayat: booking online memakai "Online (WhatsApp)" (spec 3.6). */
export function placeLabel(channel: "KLINIK" | "ONLINE", branchName: string): string {
  return channel === "ONLINE" ? ONLINE_BRANCH_LABEL : branchName;
}
```

Buat `src/server/encounter-store.ts`:

```ts
import type { Prisma } from "@prisma/client";

// Tanpa "use server": pembantu kunjungan yang memakai transaksi, tidak dipanggil browser.

/** Tinggi badan dari kunjungan final terakhir pasien, untuk diisi lebih dulu di kunjungan baru. */
export async function lastHeightCm(db: Prisma.TransactionClient, patientId: string): Promise<Prisma.Decimal | null> {
  const last = await db.encounter.findFirst({
    where: { status: "FINAL", heightCm: { not: null }, appointment: { patientId } },
    orderBy: { appointment: { startAt: "desc" } },
    select: { heightCm: true },
  });
  return last?.heightCm ?? null;
}
```

Di `src/server/encounter.ts`:
1. Tambahkan import `import { lastHeightCm } from "@/server/encounter-store";`.
2. Di `openEncounter`, ganti blok `const lastHeight = await prisma.encounter.findFirst({ … });` dengan `const heightCm = await lastHeightCm(prisma, appointment.patientId);`, dan di `prisma.encounter.create`, ganti `heightCm: lastHeight?.heightCm ?? null,` dengan `heightCm,`.

- [ ] **Step 3: Aksi dokter**

Di `src/server/online-consultation.ts`:
1. Tambahkan import `import { lastHeightCm } from "@/server/encounter-store";`.
2. Tambahkan di akhir berkas:

```ts
/**
 * Mulai konsultasi (spec 6.2): Terkonfirmasi → Hadir dengan jam sebenarnya, lalu kunjungan
 * dibuat dalam transaksi yang sama. Klik kedua atau dokter lain mendapat kunjungan yang sama.
 */
export async function startOnlineConsultation(appointmentId: string): Promise<ActionResult<{ encounterId: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const id = String(appointmentId ?? "");
    const booking = await prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        channel: true,
        patientId: true,
        service: { select: { durationMin: true } },
        encounter: { select: { id: true } },
      },
    });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.channel !== "ONLINE") throw new UserFacingError("Hanya untuk konsultasi online.");
    if (booking.encounter) return { encounterId: booking.encounter.id };

    const now = new Date();
    const endAt = new Date(now.getTime() + (booking.service?.durationMin ?? 30) * 60_000);
    const encounterId = await prisma.$transaction(async (tx) => {
      const { count } = await tx.appointment.updateMany({
        where: { id, channel: "ONLINE", status: "TERKONFIRMASI", patientId: { not: null } },
        data: { status: "HADIR", startAt: now, endAt },
      });
      if (count === 0) return null;
      const created = await tx.encounter.create({
        data: {
          appointmentId: id,
          createdById: actor.staffId,
          createdByName: actor.name,
          heightCm: await lastHeightCm(tx, booking.patientId!),
        },
        select: { id: true },
      });
      return created.id;
    });

    if (encounterId === null) {
      // Kalah dari klik lain yang sudah memulai: pakai kunjungannya.
      const existing = await prisma.encounter.findUnique({ where: { appointmentId: id }, select: { id: true } });
      if (existing) return { encounterId: existing.id };
      throw await rejectedChangeError(id, true);
    }

    await recordAudit({ actor, action: "appointment.start-online", entity: "Appointment", entityId: id, summary: booking.code });
    await recordAudit({ actor, action: "encounter.create", entity: "Encounter", entityId: encounterId, summary: booking.code });
    revalidateOnlineViews();
    safeRevalidatePath(`/admin/kunjungan/${encounterId}`);
    if (booking.patientId) safeRevalidatePath(`/admin/pasien/${booking.patientId}`);
    return { encounterId };
  });
}

/** Tidak terhubung (spec 6.3): satu percobaan tercatat, status booking tetap. */
export async function recordContactAttempt(appointmentId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const id = String(appointmentId ?? "");
    const booking = await prisma.appointment.findUnique({ where: { id }, select: { code: true, channel: true, status: true } });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.channel !== "ONLINE") throw new UserFacingError("Hanya untuk konsultasi online.");
    if (booking.status !== "TERKONFIRMASI") throw await rejectedChangeError(id);

    await prisma.contactAttempt.create({ data: { appointmentId: id, at: new Date(), staffId: actor.staffId, staffName: actor.name } });
    await recordAudit({ actor, action: "appointment.contact-failed", entity: "Appointment", entityId: id, summary: booking.code });
    revalidateOnlineViews();
  });
}
```

- [ ] **Step 4: Daftar dokter, detail kunjungan, riwayat, dan data pasien**

Di `src/server/encounter-read.ts`:
1. Tambahkan import:

```ts
import { INTAKE_PURPOSE_LABEL } from "@/lib/intake-purpose";
import { lastAttemptLabel, nextOpenWindow, onlinePhase, placeLabel, windowLabel } from "@/lib/online-consultation";
```

   (bila `INTAKE_PURPOSE_LABEL` sudah diimpor, jangan diulang).
2. **Riwayat:** di `findHistory`, tambahkan `channel: true,` di `appointment.select`; di `toHistoryItem`, ganti `branchName: row.appointment.branch.name,` dengan `branchName: placeLabel(row.appointment.channel, row.appointment.branch.name),`.
3. **Detail:** di tipe `EncounterDetail`, ganti baris `appointment: { … branchName: string };` dengan:

```ts
  appointment: {
    id: string;
    code: string;
    startAt: Date;
    serviceName: string;
    staffName: string;
    branchName: string;
    /** Konsultasi online diberi label di kepala halaman (spec 6.4). */
    channel: "KLINIK" | "ONLINE";
  };
```

   Di `getEncounterForStaff`, tambahkan `channel: true,` di `appointment.select` (setelah `type: true,`), dan di objek `appointment` yang dikembalikan ganti `branchName: appointment.branch.name,` dengan:

```ts
      branchName: placeLabel(appointment.channel, appointment.branch.name),
      channel: appointment.channel,
```

4. **Daftar dokter:** di tipe `WorklistRow`, tambahkan `/** Konsultasi online (spec 6.4). */ online: boolean;`. Di `findWorklist`, tambahkan `channel: true,` di `select`. Di `toWorklistRow`, ganti `branchName: row.branch.name,` dengan `branchName: placeLabel(row.channel, row.branch.name),` dan tambahkan `online: row.channel === "ONLINE",`.
5. **Daftar "Konsultasi online":** tambahkan di akhir berkas:

```ts
export type OnlineWorkRow = {
  appointmentId: string;
  code: string;
  phase: "NOW" | "TODAY" | "UPCOMING";
  patientName: string;
  patientRecordNumber: string;
  whatsapp: string;
  /** https://wa.me/<nomor> untuk chat atau panggilan WA. */
  whatsappLink: string;
  doctorName: string;
  purposeLabel: string | null;
  /** Isian kuis yang sudah dikirim, untuk tautan "Lihat isian". */
  intakeId: string | null;
  windows: { label: string; current: boolean }[];
  lastAttempt: string | null;
};

const ONLINE_PHASE_ORDER = { NOW: 0, TODAY: 1, UPCOMING: 2 } as const;

/**
 * Bagian "Konsultasi online" di dasbor dokter (spec 6.1): booking online terkonfirmasi yang
 * masih punya rentang terbuka. Booking yang semua rentangnya lewat pindah ke resepsionis.
 */
export async function listOnlineWork(): Promise<OnlineWorkRow[]> {
  await requireCapability("record:write");
  const now = new Date();
  const rows = await prisma.appointment.findMany({
    where: { channel: "ONLINE", status: "TERKONFIRMASI", patientId: { not: null } },
    select: {
      id: true,
      code: true,
      patient: { select: { name: true, medicalRecordNumber: true, whatsapp: true } },
      staff: { select: { name: true } },
      intake: { select: { id: true, status: true, purpose: true } },
      contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },
      contactAttempts: { select: { at: true, staffName: true } },
    },
  });

  const work: OnlineWorkRow[] = [];
  for (const row of rows) {
    const phase = onlinePhase(row.contactWindows, now);
    if (phase === "NEEDS_NEW" || !row.patient) continue;
    work.push({
      appointmentId: row.id,
      code: row.code,
      phase,
      patientName: row.patient.name,
      patientRecordNumber: row.patient.medicalRecordNumber,
      whatsapp: row.patient.whatsapp,
      whatsappLink: `https://wa.me/${row.patient.whatsapp}`,
      doctorName: row.staff.name,
      purposeLabel: row.intake?.purpose ? INTAKE_PURPOSE_LABEL[row.intake.purpose] : null,
      intakeId: row.intake && row.intake.status !== "MENUNGGU_DIISI" ? row.intake.id : null,
      windows: row.contactWindows
        .filter((w) => w.endAt.getTime() > now.getTime())
        .map((w) => ({ label: windowLabel(w), current: w.startAt.getTime() <= now.getTime() })),
      lastAttempt: lastAttemptLabel(row.contactAttempts),
    });
  }
  const nextStart = (row: (typeof rows)[number]) => nextOpenWindow(row.contactWindows, now)?.startAt.getTime() ?? 0;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return work.sort(
    (a, b) =>
      ONLINE_PHASE_ORDER[a.phase] - ONLINE_PHASE_ORDER[b.phase] ||
      nextStart(byId.get(a.appointmentId)!) - nextStart(byId.get(b.appointmentId)!),
  );
}
```

Di `src/server/patient.ts`:
1. Tambahkan import `import { placeLabel } from "@/lib/online-consultation";`.
2. Di kueri `appointments` pasien, tambahkan `channel: true,` di `select` (setelah `status: true,`); di pemetaannya ganti `branchName: a.branch.name,` dengan `branchName: placeLabel(a.channel, a.branch.name),`.
3. Di kueri `encounters`, tambahkan `channel: true,` di `appointment.select`; di pemetaannya ganti `branchName: encounter.appointment.branch.name,` dengan `branchName: placeLabel(encounter.appointment.channel, encounter.appointment.branch.name),`.

Fixture:
- `tests/fixtures/encounter-detail.ts`: di `appointment` milik `encounterDetail`, tambahkan `channel: "KLINIK",` setelah `branchName: …,`.
- `tests/unit/components/doctor-worklist.test.tsx`: di pembantu `row`, tambahkan `online: false,` sebelum `...patch`.

Run: `npx vitest run tests/unit/online-consultation.test.ts; npm run test:integration -- tests/integration/online-doctor.test.ts tests/integration/encounter.test.ts tests/integration/encounter-read.test.ts tests/integration/patient-detail.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t7.log" 2>&1; grep -E "Test Files|Tests " "$WS/t7.log"; npx eslint src/server src/lib/online-consultation.ts; npx tsc --noEmit -p . > "$WS/t7-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/lib/online-consultation.ts src/server/encounter-store.ts src/server/online-consultation.ts src/server/encounter.ts \
  src/server/encounter-read.ts src/server/patient.ts tests/unit/online-consultation.test.ts tests/integration/online-doctor.test.ts \
  tests/fixtures/encounter-detail.ts tests/unit/components/doctor-worklist.test.tsx
git commit -m "feat: let doctors start online consultations, log failed calls, and see online bookings by contact window"
```

---

### Task 8: Tampilan customer — pilihan "Cara konsultasi", waktu luang, kwitansi, dan cek booking

**Files:**
- Create: `src/components/online/contact-windows-editor.tsx`, `src/components/pendaftaran/contact-windows-step.tsx`
- Modify:
  - `src/lib/online-consultation.ts` (`EMPTY_WINDOW_DRAFT`, `ONLINE_FEE_TERMS`, `windowDraftsError`);
  - `src/components/pendaftaran/registration-flow.tsx`, `service-step.tsx`, `identity-step.tsx`, `receipt.tsx`, `booking-status-lookup.tsx`.
- Test:
  - baru: `tests/unit/components/contact-windows-editor.test.tsx`;
  - diubah: `tests/unit/online-consultation.test.ts`, `tests/unit/components/registration-flow.test.tsx`, `tests/unit/components/booking-status-lookup.test.tsx`.

**Interfaces:**
- Consumes: Task 2 (`WindowDraft`, aturan rentang, `onlineTotal`), Task 5 (`submitOnlineBooking`, `OnlineOption`, `OnlineReceipt`, `PublicBookingStatus.channel/windowLines/onlineChangeLink`).
- Produces:
  - lib: `EMPTY_WINDOW_DRAFT: WindowDraft` (tanggal kosong, 19.00–21.00), `ONLINE_FEE_TERMS` (string), `windowDraftsError(windows: readonly WindowDraft[], audience: WindowAudience, now: Date): string | null`;
  - `ContactWindowsEditor({ value, onChange, minDate, maxDate })` — dipakai juga oleh panel admin (Task 10). Nama aksesibel: "Tanggal waktu {n}", "Jam mulai waktu {n}", "Jam selesai waktu {n}", tombol "Hapus waktu {n}" dan "+ Tambah waktu";
  - `ContactWindowsStep({ online, value, onChange })`;
  - draf `/daftar` (sessionStorage) mendapat `mode: "KLINIK" | "ONLINE"` dan `online: { staffId: string | null; windows: WindowDraft[]; submissionKey: string }`; draf lama tanpa kolom ini tetap terbaca.

- [ ] **Step 1: Tulis uji (gagal)**

Tambahkan di `tests/unit/online-consultation.test.ts` (dan tambahkan `windowDraftsError` ke import):

```ts
describe("windowDraftsError", () => {
  it("meminta tanggal lebih dulu, lalu memakai aturan rentang", () => {
    expect(windowDraftsError([{ date: "", startMinute: 600, endMinute: 720 }], "CUSTOMER", NOW)).toBe(
      "Pilih tanggal untuk setiap waktu.",
    );
    expect(windowDraftsError([draft("2026-10-08", 600, 630)], "CUSTOMER", NOW)).toBe("Setiap waktu minimal 1 jam.");
    expect(windowDraftsError([draft("2026-10-08", 600, 720)], "CUSTOMER", NOW)).toBeNull();
  });
});
```

Buat `tests/unit/components/contact-windows-editor.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ContactWindowsEditor } from "@/components/online/contact-windows-editor";
import { EMPTY_WINDOW_DRAFT, type WindowDraft } from "@/lib/online-consultation";

function Harness({ onValue }: { onValue?: (value: WindowDraft[]) => void }) {
  const [value, setValue] = useState<WindowDraft[]>([EMPTY_WINDOW_DRAFT]);
  return (
    <ContactWindowsEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      minDate="2026-10-06"
      maxDate="2026-10-20"
    />
  );
}

describe("ContactWindowsEditor", () => {
  it("satu rentang di awal, bisa ditambah sampai tiga lalu dihapus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText("Tanggal waktu 1")).toHaveAttribute("min", "2026-10-06");
    expect(screen.getByLabelText("Tanggal waktu 1")).toHaveAttribute("max", "2026-10-20");
    expect(screen.queryByRole("button", { name: "Hapus waktu 1" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Tambah waktu" }));
    await user.click(screen.getByRole("button", { name: "+ Tambah waktu" }));
    expect(screen.getByLabelText("Tanggal waktu 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Tambah waktu" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hapus waktu 2" }));
    expect(screen.queryByLabelText("Tanggal waktu 3")).not.toBeInTheDocument();
  });

  it("jam dipilih per 30 menit dalam batas 08.00–21.00", async () => {
    const user = userEvent.setup();
    const seen: WindowDraft[][] = [];
    render(<Harness onValue={(value) => seen.push(value)} />);
    const start = screen.getByLabelText("Jam mulai waktu 1");
    expect(screen.getAllByRole("option", { name: "08.00" }).length).toBeGreaterThan(0);
    expect(start.querySelectorAll("option")[0]).toHaveTextContent("08.00");
    expect(start.querySelectorAll("option")[start.querySelectorAll("option").length - 1]).toHaveTextContent("20.00");

    await user.selectOptions(start, "600");
    await user.selectOptions(screen.getByLabelText("Jam selesai waktu 1"), "720");
    expect(seen.at(-1)).toEqual([{ date: "", startMinute: 600, endMinute: 720 }]);
  });
});
```

Di `tests/unit/components/registration-flow.test.tsx`:
1. Tambahkan `submitOnlineBooking: vi.fn(),` di objek `actions`.
2. Tambahkan import `import { addDaysToDateString, witaDateString } from "@/lib/time";`.
3. Tambahkan setelah `const readyDraft = …;`:

```ts
const onlineOptions: BookingOptions = {
  ...options,
  online: { serviceId: "online", serviceName: "Konsultasi Online", price: 250000, doctors: [{ id: "diane", name: "Dr. Diane" }] },
};
const inTwoDays = addDaysToDateString(witaDateString(new Date()), 2);
const onlineDraft = {
  ...readyDraft,
  mode: "ONLINE",
  online: {
    staffId: null,
    windows: [{ date: inTwoDays, startMinute: 1140, endMinute: 1260 }],
    submissionKey: "kunci-kiriman-online-uji-0001",
  },
};
```

4. Tambahkan di akhir `describe("RegistrationFlow", …)`:

```tsx
  it("layar Layanan menawarkan konsultasi online beserta total transfer", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...readyDraft, screen: "L" }));
    render(<RegistrationFlow options={onlineOptions} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Online lewat WhatsApp/ }));
    expect(screen.getByText("Rp 350.000")).toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)!).mode).toBe("ONLINE");
  });

  it("tanpa layanan online aktif, pilihan Cara konsultasi tidak muncul", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...readyDraft, screen: "L" }));
    render(<RegistrationFlow options={options} />);
    expect(await screen.findByRole("heading", { name: "Layanan & biaya" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Cara konsultasi" })).not.toBeInTheDocument();
  });

  it("mode online: langkah jadwal menjadi waktu luang", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...onlineDraft, screen: "J" }));
    render(<RegistrationFlow options={onlineOptions} />);
    expect(await screen.findByRole("heading", { name: "Kapan Anda bisa dihubungi?" })).toBeInTheDocument();
    expect(screen.getByText("Dengan Dr. Diane")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanggal waktu 1")).toHaveValue(inTwoDays);
  });

  it("Kirim online memanggil submitOnlineBooking, lalu kwitansi online bertahan saat dimuat ulang", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(onlineDraft));
    actions.submitOnlineBooking.mockResolvedValue({
      ok: true,
      data: {
        receipt: {
          code: "SDY-ON12",
          patientName: "Siti Rahayu",
          serviceName: "Konsultasi Online",
          staffName: "Dr. Diane",
          branchName: "Online (WhatsApp)",
          startAt: new Date("2026-10-08T11:00:00Z"),
          bookingFee: 100000,
          bankAccount: "BCA 1234567890 a.n. SunDY Clinic",
          confirmationLink: "https://wa.me/6285172228900?text=x",
          online: {
            windowLines: ["• Kamis, 8 Oktober 2026, 19.00–21.00"],
            servicePrice: 250000,
            total: 350000,
            maskedWhatsapp: "0812-****-7890",
          },
        },
      },
    });

    const { unmount } = render(<RegistrationFlow options={onlineOptions} />);
    await userEvent.click(await screen.findByRole("button", { name: "Kirim pendaftaran" }));
    expect(actions.submitOnlineBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionKey: "kunci-kiriman-online-uji-0001",
        staffId: "diane",
        windows: [{ date: inTwoDays, startMinute: 1140, endMinute: 1260 }],
      }),
    );
    expect(actions.submitSiteBooking).not.toHaveBeenCalled();
    expect(await screen.findByText("SDY-ON12")).toBeInTheDocument();
    expect(screen.getByText("Kamis, 8 Oktober 2026, 19.00–21.00")).toBeInTheDocument();
    expect(screen.getByText(/Rp 350.000/)).toBeInTheDocument();
    unmount();

    render(<RegistrationFlow options={onlineOptions} />);
    expect(await screen.findByText("Kamis, 8 Oktober 2026, 19.00–21.00")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pasien|berobat/i);
  });
```

Di `tests/unit/components/booking-status-lookup.test.tsx`, tambahkan di akhir `describe("BookingStatusLookup", …)`:

```tsx
  it("konsultasi online: rentang waktu dan tautan WA, tanpa batal atau pindah jadwal", async () => {
    actions.findBookingStatus.mockResolvedValue({
      ok: true,
      data: {
        ...confirmed,
        branchName: "Online (WhatsApp)",
        serviceName: "Konsultasi Online",
        canCancel: false,
        canReschedule: false,
        rescheduleLink: null,
        channel: "ONLINE",
        windowLines: ["• Kamis, 8 Oktober 2026, 19.00–21.00"],
        onlineChangeLink: "https://wa.me/6285172228900?text=ganti",
      },
    });
    render(<BookingStatusLookup />);
    await lookUp();
    expect(await screen.findByText("Kamis, 8 Oktober 2026, 19.00–21.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ganti waktu atau batalkan via WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/6285172228900?text=ganti",
    );
    expect(screen.queryByRole("button", { name: "Batalkan booking" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Kurang dari 2 jam/)).not.toBeInTheDocument();
  });
```

Run: `npx vitest run tests/unit/online-consultation.test.ts tests/unit/components/contact-windows-editor.test.tsx tests/unit/components/registration-flow.test.tsx tests/unit/components/booking-status-lookup.test.tsx`
Expected: FAIL, karena `windowDraftsError`, editor rentang, dan alur online belum ada.

- [ ] **Step 2: Pembantu lib**

Tambahkan di akhir `src/lib/online-consultation.ts`:

```ts
/** Rentang baru di form: tanggal dipilih customer, jam awal 19.00–21.00. */
export const EMPTY_WINDOW_DRAFT: WindowDraft = { date: "", startMinute: 19 * 60, endMinute: 21 * 60 };

/** Aturan biaya versi online di /daftar (spec 4.3). */
export const ONLINE_FEE_TERMS =
  "Total biaya (biaya booking + Konsultasi Online) dibayar di muka dan tidak dikembalikan, tetapi tetap berlaku bila waktu Anda perlu diganti.";

/** Pesan galat form waktu luang: tanggal kosong lebih dulu, lalu aturan rentang. */
export function windowDraftsError(windows: readonly WindowDraft[], audience: WindowAudience, now: Date): string | null {
  if (windows.some((w) => !w.date)) return "Pilih tanggal untuk setiap waktu.";
  const checked = validateContactWindows(windows, { now, audience });
  return checked.ok ? null : checked.message;
}
```

- [ ] **Step 3: Editor rentang (dipakai situs dan panel)**

Buat `src/components/online/contact-windows-editor.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  EMPTY_WINDOW_DRAFT,
  ONLINE_FIRST_MINUTE,
  ONLINE_LAST_MINUTE,
  ONLINE_MAX_WINDOWS,
  ONLINE_MIN_WINDOW_MINUTES,
  ONLINE_STEP_MINUTES,
  type WindowDraft,
} from "@/lib/online-consultation";
import { minutesToTimeLabel } from "@/lib/time";

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function minutesBetween(from: number, to: number): number[] {
  const list: number[] = [];
  for (let minute = from; minute <= to; minute += ONLINE_STEP_MINUTES) list.push(minute);
  return list;
}

const START_CHOICES = minutesBetween(ONLINE_FIRST_MINUTE, ONLINE_LAST_MINUTE - ONLINE_MIN_WINDOW_MINUTES);
const END_CHOICES = minutesBetween(ONLINE_FIRST_MINUTE + ONLINE_MIN_WINDOW_MINUTES, ONLINE_LAST_MINUTE);

/**
 * 1–3 rentang waktu luang (spec konsultasi online 3.2). Aturan lengkapnya diperiksa
 * windowDraftsError dan ulang di server; di sini hanya pilihan jam yang sah ditawarkan.
 */
export function ContactWindowsEditor({
  value,
  onChange,
  minDate,
  maxDate,
}: {
  value: WindowDraft[];
  onChange: (next: WindowDraft[]) => void;
  /** Tanggal WITA "YYYY-MM-DD". */
  minDate: string;
  maxDate: string;
}) {
  const update = (index: number, patch: Partial<WindowDraft>) =>
    onChange(value.map((window, i) => (i === index ? { ...window, ...patch } : window)));

  return (
    <div className="space-y-3">
      {value.map((window, index) => {
        const n = index + 1;
        return (
          <fieldset key={index} className="grid gap-3 rounded-xl border border-cream-300 bg-white p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">Waktu {n}</legend>
            <label className="space-y-1 text-sm">
              <span>Tanggal</span>
              <input
                type="date"
                aria-label={`Tanggal waktu ${n}`}
                min={minDate}
                max={maxDate}
                value={window.date}
                onChange={(e) => update(index, { date: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Mulai</span>
              <select
                aria-label={`Jam mulai waktu ${n}`}
                value={window.startMinute}
                onChange={(e) => update(index, { startMinute: Number(e.target.value) })}
                className={fieldClass}
              >
                {START_CHOICES.map((minute) => (
                  <option key={minute} value={minute}>
                    {minutesToTimeLabel(minute)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Selesai</span>
              <select
                aria-label={`Jam selesai waktu ${n}`}
                value={window.endMinute}
                onChange={(e) => update(index, { endMinute: Number(e.target.value) })}
                className={fieldClass}
              >
                {END_CHOICES.map((minute) => (
                  <option key={minute} value={minute}>
                    {minutesToTimeLabel(minute)}
                  </option>
                ))}
              </select>
            </label>
            {value.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-start sm:col-span-3"
                aria-label={`Hapus waktu ${n}`}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                Hapus
              </Button>
            )}
          </fieldset>
        );
      })}
      {value.length < ONLINE_MAX_WINDOWS && (
        <Button type="button" variant="outline" onClick={() => onChange([...value, EMPTY_WINDOW_DRAFT])}>
          + Tambah waktu
        </Button>
      )}
    </div>
  );
}
```

Buat `src/components/pendaftaran/contact-windows-step.tsx`:

```tsx
"use client";

import { SingleChoice } from "@/components/kuis/choice";
import { ContactWindowsEditor } from "@/components/online/contact-windows-editor";
import { ONLINE_MAX_DAYS_AHEAD, type WindowDraft } from "@/lib/online-consultation";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import type { OnlineOption } from "@/server/public-booking-data";

export type OnlineScheduleDraft = { staffId: string | null; windows: WindowDraft[] };

/** Langkah "Kapan Anda bisa dihubungi?" untuk konsultasi online (spec 4.2). */
export function ContactWindowsStep({
  online,
  value,
  onChange,
}: {
  online: OnlineOption;
  value: OnlineScheduleDraft;
  onChange: (patch: Partial<OnlineScheduleDraft>) => void;
}) {
  const today = witaDateString(new Date());
  return (
    <div className="space-y-5">
      {online.doctors.length > 1 ? (
        <SingleChoice
          label="Dokter"
          options={online.doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
          value={value.staffId ?? undefined}
          onChange={(staffId) => onChange({ staffId })}
        />
      ) : (
        <p className="text-sm text-brown-700">Dengan {online.doctors[0]?.name}</p>
      )}
      <ContactWindowsEditor
        value={value.windows}
        onChange={(windows) => onChange({ windows })}
        minDate={today}
        maxDate={addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Layanan, data diri, dan kwitansi**

Di `src/components/pendaftaran/service-step.tsx`:
1. Tambahkan import `import { ONLINE_FEE_TERMS, onlineTotal } from "@/lib/online-consultation";`.
2. Tambahkan dua prop:

```ts
  /** Cara konsultasi yang dipilih (spec 4.1); hanya berarti untuk konsultasi. */
  mode: "KLINIK" | "ONLINE";
  onModeChange: (mode: "KLINIK" | "ONLINE") => void;
```

3. Di badan komponen, setelah `const services = servicesFor(options, answers);`, tambahkan:

```tsx
  const canGoOnline = options.online !== null && service.id === options.consultation.id;
  const online = canGoOnline && mode === "ONLINE" ? options.online : null;
```

4. Tambahkan tepat sebelum `<dl className="space-y-3 rounded-2xl …">`:

```tsx
      {canGoOnline && (
        <SingleChoice
          label="Cara konsultasi"
          options={[
            { value: "KLINIK", label: "Datang ke klinik", hint: "Bertemu dokter di klinik. Biaya konsultasi dibayar di klinik." },
            {
              value: "ONLINE",
              label: "Online lewat WhatsApp (telepon/video)",
              hint: "Dokter menelepon atau video call di waktu yang Anda pilih. Dibayar di muka.",
            },
          ]}
          value={mode}
          onChange={onModeChange}
        />
      )}
```

5. Ganti blok `<dl …>…</dl>` dan paragraf `{BOOKING_FEE_TERMS}` sesudahnya dengan:

```tsx
      {online ? (
        <>
          <dl className="space-y-3 rounded-2xl border border-cream-300 bg-white p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-brown-900">{online.serviceName}</dt>
              <dd className="text-right">{formatRupiah(online.price)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-brown-900">Biaya booking</dt>
              <dd className="text-right">{formatRupiah(options.bookingFee)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-cream-300 pt-3 font-semibold">
              <dt className="text-brown-900">Total transfer di muka</dt>
              <dd className="text-right">
                {formatRupiah(onlineTotal({ bookingFee: options.bookingFee, servicePrice: online.price }))}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-brown-600">{ONLINE_FEE_TERMS}</p>
        </>
      ) : (
        <>
          {/* blok <dl> lama (harga di klinik + biaya booking) tanpa perubahan */}
          <p className="text-sm text-brown-600">{BOOKING_FEE_TERMS}</p>
        </>
      )}
```

   (Pindahkan blok `<dl>` lama apa adanya ke tempat komentar di atas, lalu hapus komentarnya.)

Di `src/components/pendaftaran/identity-step.tsx`:
1. Tambahkan import `import { ONLINE_FEE_TERMS } from "@/lib/online-consultation";`.
2. Tambahkan prop `onlineTotal?: number;` (dengan komentar `/** Diisi untuk konsultasi online: total yang ditransfer di muka (spec 4.3). */`).
3. Ganti isi `<span>` kotak persetujuan biaya dengan:

```tsx
        <span>
          {onlineTotal !== undefined ? (
            <>
              Saya akan mentransfer {formatRupiah(onlineTotal)} (biaya booking + Konsultasi Online). {ONLINE_FEE_TERMS}
            </>
          ) : (
            <>
              Saya akan mentransfer biaya booking {formatRupiah(bookingFee)}. {BOOKING_FEE_TERMS}
            </>
          )}
        </span>
```

Di `src/components/pendaftaran/receipt.tsx`:
1. Ganti blok `<dl className="space-y-1 text-left …">…</dl>` dengan:

```tsx
      {receipt.online ? (
        <dl className="space-y-1 text-left text-sm text-brown-700">
          <div><dt className="inline font-semibold">Layanan: </dt><dd className="inline">{receipt.serviceName}</dd></div>
          <div><dt className="inline font-semibold">Dengan: </dt><dd className="inline">{receipt.staffName}</dd></div>
          <div><dt className="inline font-semibold">Cara: </dt><dd className="inline">Online lewat WhatsApp (telepon/video)</dd></div>
          <div>
            <dt className="font-semibold">Waktu Anda bisa dihubungi:</dt>
            <dd>
              <ul className="list-disc pl-5">
                {receipt.online.windowLines.map((line) => (
                  <li key={line}>{line.replace(/^• /, "")}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>Dokter akan menghubungi nomor {receipt.online.maskedWhatsapp} lewat WhatsApp.</div>
        </dl>
      ) : (
        <dl className="space-y-1 text-left text-sm text-brown-700">
          {/* isi <dl> lama (Layanan, Dengan, Cabang, Jadwal) tanpa perubahan */}
        </dl>
      )}
```

   (Pindahkan empat baris `<div>` lama ke tempat komentar, lalu hapus komentarnya.)
2. Di kotak transfer, ganti paragraf pertama yang memakai `receipt.bankAccount` dengan:

```tsx
          {receipt.bankAccount ? (
            <p>
              Transfer{" "}
              {receipt.online ? (
                <>
                  total <strong>{formatRupiah(receipt.online.total)}</strong> (biaya booking {formatRupiah(receipt.bookingFee)} +{" "}
                  {receipt.serviceName} {formatRupiah(receipt.online.servicePrice)})
                </>
              ) : (
                <>
                  biaya booking <strong>{formatRupiah(receipt.bookingFee)}</strong>
                </>
              )}{" "}
              ke <strong>{receipt.bankAccount}</strong>, lalu kirim bukti transfernya lewat tombol di bawah.
            </p>
          ) : (
            <p>
              Admin kami akan mengirim nomor rekening untuk{" "}
              {receipt.online ? `total ${formatRupiah(receipt.online.total)}` : `biaya booking ${formatRupiah(receipt.bookingFee)}`} lewat
              WhatsApp.
            </p>
          )}
```

- [ ] **Step 5: Alur `/daftar`**

Di `src/components/pendaftaran/registration-flow.tsx`:

1. **Import:** ganti import `@/server/public-booking` menjadi `import { submitOnlineBooking, submitSiteBooking, type BookingReceipt, type OnlineReceipt } from "@/server/public-booking";`, lalu tambahkan:

```ts
import { EMPTY_WINDOW_DRAFT, onlineTotal, windowDraftsError, type WindowDraft } from "@/lib/online-consultation";
import { ContactWindowsStep } from "./contact-windows-step";
```

2. **Draf:** ganti tipe `Draft` dan `emptyDraft` dengan:

```ts
type ConsultMode = "KLINIK" | "ONLINE";
type OnlineDraft = { staffId: string | null; windows: WindowDraft[]; submissionKey: string };

type Draft = {
  answers: QuizAnswers;
  screen: Screen;
  serviceId: string | null;
  schedule: ScheduleDraft;
  identity: IdentityDraft;
  /** Cara konsultasi (spec konsultasi online 4.1). */
  mode: ConsultMode;
  online: OnlineDraft;
};

/** Kunci kiriman online: kiriman ulang dengan kunci yang sama tidak membuat booking kedua. */
function newSubmissionKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function emptyOnline(): OnlineDraft {
  return { staffId: null, windows: [EMPTY_WINDOW_DRAFT], submissionKey: newSubmissionKey() };
}

function emptyDraft(): Draft {
  return {
    answers: {},
    screen: "U1",
    serviceId: null,
    schedule: EMPTY_SCHEDULE,
    identity: EMPTY_IDENTITY,
    mode: "KLINIK",
    online: emptyOnline(),
  };
}
```

   dan di `readDraft`, ganti `return raw ? (JSON.parse(raw) as Draft) : null;` dengan:

```ts
    if (!raw) return null;
    // Draf dari sebelum konsultasi online tidak punya mode/online: isi dengan bawaan.
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { ...emptyDraft(), ...parsed, mode: parsed.mode ?? "KLINIK", online: parsed.online ?? emptyOnline() };
```

3. **Kwitansi tersimpan:**
   - di `isReceiptShape`, ganti tipe kembaliannya menjadi `value is Omit<BookingReceipt, "startAt" | "online"> & { startAt: string; online?: OnlineReceipt | null }`, dan tambahkan syarat terakhir `&& (r.online === undefined || r.online === null || isOnlineReceipt(r.online))` dengan pembantu:

```ts
function isOnlineReceipt(value: unknown): value is OnlineReceipt {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.windowLines) &&
    o.windowLines.every((line) => typeof line === "string") &&
    typeof o.servicePrice === "number" &&
    typeof o.total === "number" &&
    typeof o.maskedWhatsapp === "string"
  );
}
```

   - di `readReceipt`, ganti `{ ...parsed, startAt: new Date(parsed.startAt) }` dengan `{ ...parsed, startAt: new Date(parsed.startAt), online: parsed.online ?? null }`;
   - di `writeReceipt`, tambahkan `online` ke destrukturisasi dan ke objek yang disimpan (`online,` setelah `confirmationLink,`).

4. **Di dalam `RegistrationFlow`**, setelah `const service = …;`, tambahkan:

```ts
  const online = options.online;
  const mode: ConsultMode = online && service.id === options.consultation.id ? draft.mode : "KLINIK";
  const onlineStaffId = draft.online.staffId ?? (online?.doctors.length === 1 ? online.doctors[0].id : null);
  const onlineScheduleError = !onlineStaffId ? "Pilih dokter lebih dulu." : windowDraftsError(draft.online.windows, "CUSTOMER", new Date());

  function finish(next: BookingReceipt) {
    writeDraft(null);
    writeReceipt(next);
    setDraft(emptyDraft());
    setReceipt(next);
  }

  function submitOnline() {
    if (!onlineStaffId || onlineScheduleError) {
      goTo("J");
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitOnlineBooking({
          submissionKey: draft.online.submissionKey,
          staffId: onlineStaffId,
          windows: draft.online.windows,
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
        finish(result.data.receipt);
      } catch {
        toast.error("Pendaftaran gagal dikirim. Periksa koneksi lalu coba lagi.");
      }
    });
  }
```

5. **`submit`:** tambahkan di baris pertama fungsi `if (mode === "ONLINE") { submitOnline(); return; }`, dan ganti empat baris penutup jalur sukses (`writeDraft(null); writeReceipt(…); setDraft(emptyDraft()); setReceipt(…);`) dengan `finish(result.data.receipt);`.
6. **Layar L:** tambahkan prop `mode={mode}` dan `onModeChange={(next) => setDraft((d) => ({ ...d, mode: next }))}` ke `<ServiceStep …>`.
7. **Layar J:** ganti `} else if (screen === "J") {` dengan:

```tsx
  } else if (screen === "J" && mode === "ONLINE" && online) {
    content = (
      <QuizScreen
        key="J-online"
        title="Kapan Anda bisa dihubungi?"
        hint="Dokter akan menelepon atau video call lewat WhatsApp kapan saja di dalam salah satu rentang ini. Pilih waktu Anda benar-benar bisa menjawab."
        {...common}
        error={onlineScheduleError}
        onNext={() => goTo("D")}
      >
        <ContactWindowsStep
          online={online}
          value={{ staffId: onlineStaffId, windows: draft.online.windows }}
          onChange={(patch) => setDraft((d) => ({ ...d, online: { ...d.online, ...patch } }))}
        />
      </QuizScreen>
    );
  } else if (screen === "J") {
```

8. **Layar D:** tambahkan prop `onlineTotal={mode === "ONLINE" && online ? onlineTotal({ bookingFee: options.bookingFee, servicePrice: online.price }) : undefined}` ke `<IdentityStep …>`.

- [ ] **Step 6: Cek booking**

Di `src/components/pendaftaran/booking-status-lookup.tsx`, di dalam `<section aria-label="Status booking">`:
1. Ganti tiga baris `<div>{status.branchName}</div>` dan `<div>{formatIndonesianDate(…)}, pukul … WITA</div>` dengan:

```tsx
            <div>{status.branchName}</div>
            {status.channel === "ONLINE" ? (
              <div>
                Waktu Anda bisa dihubungi:
                <ul className="list-disc pl-5">
                  {status.windowLines.map((line) => (
                    <li key={line}>{line.replace(/^• /, "")}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>
                {formatIndonesianDate(status.startAt)}, pukul {minutesToTimeLabel(witaMinutesOfDay(status.startAt))} WITA
              </div>
            )}
```

2. Di `<div className="flex flex-wrap gap-2">`, tambahkan sebagai anak pertama:

```tsx
            {status.channel === "ONLINE" && status.onlineChangeLink && (
              <Button asChild variant="outline">
                <a href={status.onlineChangeLink} target="_blank" rel="noopener noreferrer">
                  Ganti waktu atau batalkan via WhatsApp
                </a>
              </Button>
            )}
```

3. Ganti syarat paragraf "Kurang dari 2 jam …" menjadi `{status.channel === "KLINIK" && !status.canCancel && ACTIVE.includes(status.status) && (`.

Run: `npx vitest run tests/unit/online-consultation.test.ts tests/unit/components/contact-windows-editor.test.tsx tests/unit/components/registration-flow.test.tsx tests/unit/components/booking-status-lookup.test.tsx`
Expected: PASS semua.

- [ ] **Step 7: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t8.log" 2>&1; grep -E "Test Files|Tests " "$WS/t8.log"; npx eslint src/components/pendaftaran src/components/online src/lib/online-consultation.ts; npx tsc --noEmit -p . > "$WS/t8-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS (termasuk uji arsitektur dan "tanpa kata pasien/berobat"), eslint bersih, `tsc` keluar 0.

```bash
git add src/lib/online-consultation.ts src/components/online src/components/pendaftaran \
  tests/unit/online-consultation.test.ts tests/unit/components/contact-windows-editor.test.tsx \
  tests/unit/components/registration-flow.test.tsx tests/unit/components/booking-status-lookup.test.tsx
git commit -m "feat: let customers choose an online consultation in /daftar, pick contact windows, and see them on the receipt and booking lookup"
```

---

### Task 9: Halaman Layanan & Harga — kartu "Konsultasi Online" (harga, durasi, aktif)

Halaman Layanan & Harga hanya menampilkan layanan aktif dari katalog, dan Task 3 mengeluarkan layanan online dari katalog. Tanpa kartu ini pemilik tidak bisa mengisi harga dan mengaktifkan konsultasi online (spec 3.3).

**Files:**
- Create: `src/components/admin/online-service-card.tsx`
- Modify: `src/server/service-admin.ts`, `src/app/(admin)/admin/layanan/page.tsx`
- Test: `tests/integration/online-service-admin.test.ts`, `tests/unit/components/online-service-card.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`ONLINE_SERVICE_SLUG`), pembantu uji `setOnlineService` (Task 3), sudah ada: `RupiahInput`, `SectionCard`, `recordAudit`.
- Produces:
  - `service-admin.ts`: `getOnlineServiceSettings(): Promise<OnlineServiceSettings | null>` dan `updateOnlineService(input: { price: number; durationMin: number; active: boolean }): Promise<ActionResult>` (keduanya `content:manage`), dengan `OnlineServiceSettings = { price: number; durationMin: number; active: boolean }`;
  - aturan: harga minimal Rp 1; durasi 15, 30, 45, atau 60 menit; layanan tidak bisa diaktifkan dengan harga 0;
  - audit `service.online.update`;
  - `OnlineServiceCard({ settings })`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/integration/online-service-admin.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getOnlineServiceSettings, updateOnlineService } from "@/server/service-admin";
import { setOnlineService } from "./public-booking-world";
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

describe("pengaturan layanan Konsultasi Online", () => {
  beforeEach(async () => {
    await setOnlineService({ price: 0, active: false });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await prisma.$disconnect();
  });

  it("membaca harga, durasi, dan status aktif", async () => {
    expect(await getOnlineServiceSettings()).toEqual({ price: 0, durationMin: 30, active: false });
  });

  it("menyimpan harga, durasi, dan aktif, lalu mencatatnya di jejak audit", async () => {
    await unwrap(updateOnlineService({ price: 250000, durationMin: 45, active: true }));
    expect(await getOnlineServiceSettings()).toEqual({ price: 250000, durationMin: 45, active: true });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "service.online.update" }, orderBy: { createdAt: "desc" } });
    expect(audit.summary).toBe("Konsultasi Online: Rp 250.000, 45 menit, aktif");
  });

  it("menolak harga 0 saat diaktifkan dan durasi di luar pilihan", async () => {
    expect(await updateOnlineService({ price: 0, durationMin: 30, active: true })).toEqual({
      ok: false,
      error: "Isi harga Konsultasi Online sebelum mengaktifkannya.",
    });
    expect(await updateOnlineService({ price: 250000, durationMin: 20, active: true })).toEqual({
      ok: false,
      error: "Durasi harus 15, 30, 45, atau 60 menit.",
    });
    expect((await updateOnlineService({ price: 0, durationMin: 30, active: false })).ok).toBe(true);
  });
});
```

Buat `tests/unit/components/online-service-card.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineServiceCard } from "@/components/admin/online-service-card";
import { updateOnlineService } from "@/server/service-admin";

vi.mock("@/server/service-admin", () => ({ updateOnlineService: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

describe("OnlineServiceCard", () => {
  it("menyimpan harga, durasi, dan status aktif", async () => {
    const user = userEvent.setup();
    vi.mocked(updateOnlineService).mockResolvedValue({ ok: true, data: undefined });
    render(<OnlineServiceCard settings={{ price: 0, durationMin: 30, active: false }} />);

    expect(screen.getByRole("region", { name: "Konsultasi Online" })).toHaveTextContent("Belum aktif");
    await user.type(screen.getByLabelText("Harga Konsultasi Online"), "250000");
    await user.selectOptions(screen.getByLabelText("Durasi"), "45");
    await user.click(screen.getByLabelText("Aktifkan konsultasi online"));
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(updateOnlineService).toHaveBeenCalledWith({ price: 250000, durationMin: 45, active: true }));
  });

  it("menampilkan galat dari server", async () => {
    const user = userEvent.setup();
    vi.mocked(updateOnlineService).mockResolvedValue({ ok: false, error: "Isi harga Konsultasi Online sebelum mengaktifkannya." });
    render(<OnlineServiceCard settings={{ price: 0, durationMin: 30, active: false }} />);
    await user.click(screen.getByLabelText("Aktifkan konsultasi online"));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Isi harga Konsultasi Online sebelum mengaktifkannya.");
  });
});
```

Run: `npm run test:integration -- tests/integration/online-service-admin.test.ts; npx vitest run tests/unit/components/online-service-card.test.tsx`
Expected: FAIL, karena `getOnlineServiceSettings`, `updateOnlineService`, dan komponennya belum ada.

- [ ] **Step 2: Aksi server**

Tambahkan di `src/server/service-admin.ts` (dan tambahkan import `import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";`):

```ts
export type OnlineServiceSettings = { price: number; durationMin: number; active: boolean };

const ONLINE_DURATIONS = [15, 30, 45, 60];

/** Pengaturan layanan Konsultasi Online (spec konsultasi online 3.3); null bila barisnya belum ada. */
export async function getOnlineServiceSettings(): Promise<OnlineServiceSettings | null> {
  await requireCapability("content:manage");
  const service = await prisma.service.findUnique({
    where: { slug: ONLINE_SERVICE_SLUG },
    select: { promoPrice: true, durationMin: true, isActive: true },
  });
  return service ? { price: service.promoPrice, durationMin: service.durationMin, active: service.isActive } : null;
}

export async function updateOnlineService(input: OnlineServiceSettings): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    const price = Number(input?.price);
    const durationMin = Number(input?.durationMin);
    const active = input?.active === true;
    if (!Number.isInteger(price) || price < 0) throw new UserFacingError("Harga tidak sah.");
    if (!ONLINE_DURATIONS.includes(durationMin)) throw new UserFacingError("Durasi harus 15, 30, 45, atau 60 menit.");
    if (active && price <= 0) throw new UserFacingError("Isi harga Konsultasi Online sebelum mengaktifkannya.");

    const updated = await prisma.service.update({
      where: { slug: ONLINE_SERVICE_SLUG },
      data: { promoPrice: price, durationMin, isActive: active },
    });
    await recordAudit({
      actor,
      action: "service.online.update",
      entity: "Service",
      entityId: updated.id,
      summary: `${updated.name}: ${formatRupiah(price)}, ${durationMin} menit, ${active ? "aktif" : "nonaktif"}`,
    });
    safeRevalidatePath("/admin/layanan");
    safeRevalidatePath("/daftar");
    safeRevalidatePath("/admin/booking/baru");
  });
}
```

- [ ] **Step 3: Kartu dan halaman**

Buat `src/components/admin/online-service-card.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { updateOnlineService, type OnlineServiceSettings } from "@/server/service-admin";
import { SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";

const DURATIONS = [15, 30, 45, 60];

/** Konsultasi Online tidak ada di katalog layanan, jadi diatur di kartu sendiri (spec 3.3). */
export function OnlineServiceCard({ settings }: { settings: OnlineServiceSettings }) {
  const router = useRouter();
  const [price, setPrice] = useState<number | null>(settings.price || null);
  const [durationMin, setDurationMin] = useState(settings.durationMin);
  const [active, setActive] = useState(settings.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateOnlineService({ price: price ?? 0, durationMin, active });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Pengaturan Konsultasi Online tersimpan.");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard
      title="Konsultasi Online"
      description="Konsultasi lewat WhatsApp tanpa slot jadwal. Customer membayar biaya booking ditambah harga ini di muka."
    >
      <div className="space-y-4 text-sm">
        <p>
          Status: <strong>{settings.active ? `Aktif · ${formatRupiah(settings.price)}` : "Belum aktif"}</strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="online-price">Harga</Label>
            <RupiahInput id="online-price" aria-label="Harga Konsultasi Online" value={price} onChange={setPrice} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="online-duration">Durasi</Label>
            <select
              id="online-duration"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} menit
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Aktifkan konsultasi online
        </label>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button type="button" onClick={save} disabled={pending}>
          Simpan
        </Button>
      </div>
    </SectionCard>
  );
}
```

`SectionCard` sudah memberi `aria-label={title}` pada `<section>`-nya, jadi uji `getByRole("region", { name: "Konsultasi Online" })` menemukannya.

Di `src/app/(admin)/admin/layanan/page.tsx`:
1. Ganti import `@/server/catalog` menjadi dua baris: tetap `import { getServiceCategoriesWithServices } from "@/server/catalog";` dan tambahkan `import { getOnlineServiceSettings } from "@/server/service-admin";` serta `import { OnlineServiceCard } from "@/components/admin/online-service-card";`.
2. Ganti `const categories = await getServiceCategoriesWithServices();` dengan:

```ts
  const [categories, online] = await Promise.all([getServiceCategoriesWithServices(), getOnlineServiceSettings()]);
```

3. Tambahkan tepat sebelum `<ServicePriceTable …/>`:

```tsx
        {online && <OnlineServiceCard settings={online} />}
```

Run: `npm run test:integration -- tests/integration/online-service-admin.test.ts; npx vitest run tests/unit/components/online-service-card.test.tsx tests/unit/components/service-price-table.test.tsx`
Expected: PASS semua.

- [ ] **Step 4: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t9.log" 2>&1; grep -E "Test Files|Tests " "$WS/t9.log"; npx eslint src/server/service-admin.ts src/components/admin/online-service-card.tsx "src/app/(admin)/admin/layanan"; npx tsc --noEmit -p . > "$WS/t9-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/server/service-admin.ts src/components/admin/online-service-card.tsx "src/app/(admin)/admin/layanan/page.tsx" \
  tests/integration/online-service-admin.test.ts tests/unit/components/online-service-card.test.tsx
git commit -m "feat: let the owner set the online consultation price and duration and switch it on from the services page"
```

---

### Task 10: Panel resepsionis — Booking Baru online, bagian "Konsultasi online", aksi baris, dialog Ubah waktu luang, Pengingat

**Files:**
- Create: `src/components/admin/online-appointment-form.tsx`, `src/components/admin/contact-windows-dialog.tsx`
- Modify: `src/app/(admin)/admin/booking/baru/page.tsx`, `src/app/(admin)/admin/booking/page.tsx`, `src/components/admin/appointment-table.tsx`, `src/components/admin/booking-dialogs.tsx`, `src/components/admin/booking-created-panel.tsx`, `src/components/admin/reminder-worklist.tsx`, `src/lib/booking-actions.ts`
- Test: `tests/unit/booking-actions.test.ts`, `tests/unit/components/appointment-table.test.tsx`, `tests/unit/components/contact-windows-dialog.test.tsx`, `tests/unit/components/online-appointment-form.test.tsx`, `tests/unit/components/reminder-worklist.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`windowDrafts`, `windowLabel`, `windowLines`, `onlineTotal`, `onlinePhase`, `lastAttemptLabel`, `ONLINE_MAX_DAYS_AHEAD`), Task 7 (`placeLabel`), Task 8 (`EMPTY_WINDOW_DRAFT`, `windowDraftsError`), Task 4 (`createOnlineAppointment`, `updateContactWindows`, `listOnlineBookings`, `loadOnlineService`), Task 6 (`requestNewTimeMessageFor`, `ReminderRow.channel/onlineLabel`), Task 8 (`ContactWindowsEditor`), sudah ada: `getTransferInstruction`, `BookingCreatedPanel`, `PageTabs`, `PatientPicker`, `BookingSummary`.
- Produces:
  - `booking-actions.ts`: `BookingAction` bertambah `"CHANGE_WINDOWS"` ("Ubah waktu luang") dan `"REQUEST_NEW_TIME"` ("Minta waktu baru via WA"); `BookingActionRow` bertambah `channel?: "KLINIK" | "ONLINE"` dan `requestNewTime?: { link: string | null } | null`; `showsContactWindows(row: { status: AppointmentStatusValue; online: unknown | null }): boolean` (rentang ditampilkan menggantikan jam bagi booking online yang belum dimulai); `ContactWindowsTarget = { appointmentId: string; code: string; patientName: string; windows: WindowDraft[] }`;
  - `BookingRow.online: OnlineRowInfo | null`, `OnlineRowInfo = { windowLines: string[]; phase: OnlinePhase | null; lastAttempt: string | null; requestNewTime: { link: string | null } | null; contactWindows: ContactWindowsTarget }`;
  - `useBookingDialogs().openContactWindows(target: ContactWindowsTarget)`;
  - `OnlineAppointmentForm`, `ContactWindowsDialog`; `BookingCreatedPanel` menerima `listHref?: string`.

- [ ] **Step 1: Tulis uji (gagal)**

Tambahkan di `tests/unit/booking-actions.test.ts`:

```ts
describe("bookingRowActions untuk booking online (spec konsultasi online 5.3)", () => {
  const onlineWaiting: BookingActionRow = { ...waiting, channel: "ONLINE" };
  const onlineConfirmed: BookingActionRow = {
    ...waiting,
    channel: "ONLINE",
    status: "TERKONFIRMASI",
    transferInstruction: null,
    confirmation: { link: "https://wa.me/6281234567890?text=k" },
  };

  it("menunggu: tanpa Check-in, Tidak hadir, dan Pindah jadwal; Ubah waktu luang sebelum Batalkan", () => {
    expect(bookingRowActions(onlineWaiting, true)).toEqual({
      primary: ["VERIFY", "SEND_TRANSFER"],
      menu: ["COPY_TRANSFER", "CHANGE_WINDOWS", "CANCEL"],
    });
  });

  it("terkonfirmasi: Kirim konfirmasi terlihat, Ubah waktu luang di menu", () => {
    expect(bookingRowActions(onlineConfirmed, true)).toEqual({
      primary: ["SEND_CONFIRMATION"],
      menu: ["COPY_CONFIRMATION", "CHANGE_WINDOWS", "CANCEL"],
    });
  });

  it("Perlu waktu baru: Minta waktu baru via WA dan Ubah waktu luang terlihat", () => {
    const row = { ...onlineConfirmed, requestNewTime: { link: "https://wa.me/6281234567890?text=b" } };
    expect(bookingRowActions(row, true)).toEqual({
      primary: ["REQUEST_NEW_TIME", "CHANGE_WINDOWS"],
      menu: ["SEND_CONFIRMATION", "COPY_CONFIRMATION", "CANCEL"],
    });
  });

  it("sudah dimulai: tidak ada Ubah waktu luang", () => {
    expect(bookingRowActions({ ...onlineConfirmed, status: "HADIR" }, true)).toEqual({ primary: [], menu: [] });
  });

  it("booking klinik tidak berubah", () => {
    expect(bookingRowActions({ ...waiting, channel: "KLINIK" }, true).menu).toContain("RESCHEDULE");
  });
});
```

Tambahkan di `tests/unit/components/appointment-table.test.tsx` (di bawah fixture `waRow`, dan tambahkan `import { windowDrafts } from "@/lib/online-consultation";` serta mock `vi.mock("@/server/online-consultation", () => ({ updateContactWindows: vi.fn() }));` di blok mock):

```tsx
const day = (offset: number) => combineWitaDateAndMinutes(`2026-10-${String(5 + offset).padStart(2, "0")}`, 0);
const onlineWindows = [
  { startAt: new Date(day(2).getTime() + 10 * 3600_000), endAt: new Date(day(2).getTime() + 12 * 3600_000) },
];
const onlineRow: BookingRow = {
  ...waRow,
  id: "a3",
  code: "SDY-ON01",
  status: "TERKONFIRMASI",
  timeLabel: "Online",
  branchName: "Online (WhatsApp)",
  transferInstruction: null,
  confirmation: { text: "Halo Siti, pembayaran…", link: "https://wa.me/6281234567890?text=k" },
  reschedule: { ...base.reschedule, appointmentId: "a3", code: "SDY-ON01" },
  online: {
    windowLines: ["• Rabu, 7 Oktober 2026, 10.00–12.00"],
    phase: "UPCOMING",
    lastAttempt: null,
    requestNewTime: null,
    contactWindows: { appointmentId: "a3", code: "SDY-ON01", patientName: "Siti Rahayu", windows: windowDrafts(onlineWindows) },
  },
};

describe("AppointmentTable booking online", () => {
  it("menampilkan rentang waktu luang menggantikan jam, tanpa Check-in", () => {
    renderTable([onlineRow]);
    expect(screen.getByText("• Rabu, 7 Oktober 2026, 10.00–12.00")).toBeInTheDocument();
    expect(screen.getByText("Online (WhatsApp)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check-in" })).not.toBeInTheDocument();
  });

  it("Perlu waktu baru: tanda, percobaan terakhir, dan tautan Minta waktu baru via WA", () => {
    renderTable([
      {
        ...onlineRow,
        online: {
          ...onlineRow.online!,
          phase: "NEEDS_NEW",
          lastAttempt: "Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)",
          requestNewTime: { link: "https://wa.me/6281234567890?text=baru" },
        },
      },
    ]);
    expect(screen.getByText("Perlu waktu baru")).toBeInTheDocument();
    expect(screen.getByText("Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Minta waktu baru via WA" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567890?text=baru",
    );
  });

  it("Ubah waktu luang dari menu membuka dialog untuk booking itu", async () => {
    const user = userEvent.setup();
    renderTable([onlineRow]);
    await openMenu(user, "SDY-ON01");
    await user.click(await screen.findByRole("menuitem", { name: "Ubah waktu luang" }));
    expect(await screen.findByRole("dialog", { name: "Ubah waktu luang — SDY-ON01" })).toBeInTheDocument();
  });
});
```

Dan tambahkan `online: null,` pada fixture `base` di file itu (kolom baru `BookingRow.online` wajib).

Buat `tests/unit/components/contact-windows-dialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactWindowsDialog } from "@/components/admin/contact-windows-dialog";
import { updateContactWindows } from "@/server/online-consultation";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/online-consultation", () => ({ updateContactWindows: vi.fn() }));

const target = {
  appointmentId: "a3",
  code: "SDY-ON01",
  patientName: "Siti Rahayu",
  windows: [{ date: "2026-10-01", startMinute: 600, endMinute: 720 }],
};

beforeEach(() => vi.clearAllMocks());

describe("ContactWindowsDialog", () => {
  it("mengganti rentang dan menyimpannya", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(updateContactWindows).mockResolvedValue({ ok: true, data: undefined });
    render(<ContactWindowsDialog target={target} today="2026-10-06" open onOpenChange={onOpenChange} />);

    expect(screen.getByRole("dialog", { name: "Ubah waktu luang — SDY-ON01" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tanggal waktu 1"), { target: { value: "2026-10-08" } });
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(updateContactWindows).toHaveBeenCalledWith({
        appointmentId: "a3",
        windows: [{ date: "2026-10-08", startMinute: 600, endMinute: 720 }],
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("menolak rentang tidak sah tanpa memanggil server", async () => {
    const user = userEvent.setup();
    render(<ContactWindowsDialog target={target} today="2026-10-06" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Waktu yang dipilih sudah lewat.");
    expect(updateContactWindows).not.toHaveBeenCalled();
  });
});
```

Buat `tests/unit/components/online-appointment-form.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineAppointmentForm } from "@/components/admin/online-appointment-form";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { getTransferInstruction } from "@/server/appointment";
import { createOnlineAppointment } from "@/server/online-consultation";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({ getTransferInstruction: vi.fn() }));
vi.mock("@/server/online-consultation", () => ({ createOnlineAppointment: vi.fn() }));
vi.mock("@/server/appointment-message", () => ({ recordAppointmentMessage: vi.fn() }));
vi.mock("@/server/patient", () => ({ searchPatients: vi.fn(), createPatient: vi.fn() }));

const patient = {
  id: "p1",
  name: "Siti Rahayu",
  medicalRecordNumber: "SDY-2026-0001",
  whatsapp: "6281234567890",
} as never;

function renderForm() {
  return render(
    <OnlineAppointmentForm
      doctors={[{ id: "d1", name: "dr. Diane" }]}
      today="2026-10-06"
      maxDate="2026-10-20"
      bookingFee={100000}
      servicePrice={250000}
      initialPatient={patient}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("OnlineAppointmentForm", () => {
  it("ringkasan memuat total transfer: biaya booking + harga konsultasi", () => {
    renderForm();
    const summary = screen.getByRole("complementary", { name: "Ringkasan booking" });
    expect(summary).toHaveTextContent("Rp 100.000");
    expect(summary).toHaveTextContent("Rp 250.000");
    expect(summary).toHaveTextContent("Rp 350.000");
  });

  it("membuat booking online lalu menampilkan panel instruksi transfer", async () => {
    const user = userEvent.setup();
    const startAt = combineWitaDateAndMinutes("2026-10-08", 19 * 60);
    vi.mocked(createOnlineAppointment).mockResolvedValue({ ok: true, data: { id: "a9", code: "SDY-ON09", startAt } as never });
    vi.mocked(getTransferInstruction).mockResolvedValue({
      ok: true,
      data: { text: "Halo Siti…", link: "https://wa.me/6281234567890?text=x", missingBankAccount: false } as never,
    });
    renderForm();

    fireEvent.change(screen.getByLabelText("Tanggal waktu 1"), { target: { value: "2026-10-08" } });
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));

    await waitFor(() =>
      expect(createOnlineAppointment).toHaveBeenCalledWith({
        patientId: "p1",
        staffId: "d1",
        source: "WHATSAPP",
        windows: [{ date: "2026-10-08", startMinute: 1140, endMinute: 1260 }],
        notes: undefined,
      }),
    );
    expect(await screen.findByText("✓ Booking SDY-ON09 dibuat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kirim instruksi transfer via WA/ })).toBeInTheDocument();
  });

  it("tanggal kosong ditolak di browser tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    expect(createOnlineAppointment).not.toHaveBeenCalled();
  });
});
```

Tambahkan di `tests/unit/components/reminder-worklist.test.tsx` satu uji (sesuaikan nama fixture dengan yang sudah ada di berkas itu: ganti `ONLINE_ROW` dengan salinan baris fixture "diingatkan" yang ada, ditambah `channel: "ONLINE"`, `onlineLabel: "Online · Kamis, 8 April 2032, 19.00–21.00"`, dan `reminderSent.reply: "MINTA_PINDAH"`):

```tsx
  it("booking online: menampilkan rentang, tanpa tombol Pindah jadwal", () => {
    render(<ReminderWorklistView worklist={{ ...worklist, reminded: [ONLINE_ROW] }} />);
    expect(screen.getByText(/Online · Kamis, 8 April 2032, 19.00–21.00/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pindah jadwal" })).not.toBeInTheDocument();
  });
```

Run: `npx vitest run tests/unit/booking-actions.test.ts tests/unit/components/appointment-table.test.tsx tests/unit/components/contact-windows-dialog.test.tsx tests/unit/components/online-appointment-form.test.tsx tests/unit/components/reminder-worklist.test.tsx`
Expected: FAIL (aksi, komponen, dan kolom `online` belum ada).

- [ ] **Step 2: Aksi baris untuk booking online**

Di `src/lib/booking-actions.ts`:
1. Tambahkan import `import type { WindowDraft } from "./online-consultation";`.
2. Tambahkan `| "CHANGE_WINDOWS" | "REQUEST_NEW_TIME"` pada `BookingAction` (sebelum `| "CANCEL"`), dan di `BOOKING_ACTION_LABEL`: `CHANGE_WINDOWS: "Ubah waktu luang", REQUEST_NEW_TIME: "Minta waktu baru via WA",`.
3. Di `BookingActionRow`, tambahkan:

```ts
  /** Kanal booking; kosong dianggap klinik. */
  channel?: "KLINIK" | "ONLINE";
  /** Booking online yang semua rentangnya lewat: tautan WA "Minta waktu baru" (spec konsultasi online 5.3). */
  requestNewTime?: { link: string | null } | null;
```

4. Tambahkan setelah `RescheduleTarget`:

```ts
/** Data dialog Ubah waktu luang booking online. */
export type ContactWindowsTarget = { appointmentId: string; code: string; patientName: string; windows: WindowDraft[] };

/** Booking online yang belum dimulai menampilkan rentang waktu luang menggantikan jam. */
export function showsContactWindows(row: { status: AppointmentStatusValue; online: unknown | null }): boolean {
  return row.online !== null && (row.status === "MENUNGGU_KONFIRMASI" || row.status === "TERKONFIRMASI");
}

const CLINIC_ONLY: ReadonlySet<BookingAction> = new Set(["ATTEND", "NO_SHOW", "RESCHEDULE"]);

/** Booking online: tanpa Check-in, Tidak hadir, dan Pindah jadwal; ada Ubah waktu luang (spec 5.3). */
function onlineRowActions(
  row: BookingActionRow,
  actions: { primary: BookingAction[]; menu: BookingAction[] },
): { primary: BookingAction[]; menu: BookingAction[] } {
  let primary = actions.primary.filter((a) => !CLINIC_ONLY.has(a));
  let menu = actions.menu.filter((a) => !CLINIC_ONLY.has(a));
  if (row.status !== "MENUNGGU_KONFIRMASI" && row.status !== "TERKONFIRMASI") return { primary, menu };

  const cancelAt = menu.indexOf("CANCEL");
  menu = cancelAt === -1 ? [...menu, "CHANGE_WINDOWS"] : [...menu.slice(0, cancelAt), "CHANGE_WINDOWS", ...menu.slice(cancelAt)];
  if (row.requestNewTime) {
    menu = [...primary, ...menu.filter((a) => a !== "CHANGE_WINDOWS")];
    primary = ["REQUEST_NEW_TIME", "CHANGE_WINDOWS"];
  }
  return { primary, menu };
}
```

5. Ganti dua baris terakhir `bookingRowActions` (`const actions = …` dan `return …`) dengan:

```ts
  const base = baseRowActions(row, canReadRecords);
  const actions = row.channel === "ONLINE" ? onlineRowActions(row, base) : base;
  return row.quizLink ? { ...actions, menu: ["QUIZ_LINK", ...actions.menu] } : actions;
```

Run: `npx vitest run tests/unit/booking-actions.test.ts`
Expected: PASS.

- [ ] **Step 3: Tabel, dialog, dan panel**

Di `src/components/admin/appointment-table.tsx`:
1. Tambahkan ke import `@/lib/booking-actions`: `showsContactWindows` dan `type ContactWindowsTarget`; tambahkan `import type { OnlinePhase } from "@/lib/online-consultation";`.
2. Tambahkan setelah tipe `BookingRow`'s kolom `foodRecallAvailable` (di dalam tipe):

```ts
  /** Booking online (spec konsultasi online 5.2); null untuk booking klinik. */
  online: OnlineRowInfo | null;
```

   dan sebelum `export type BookingRow`:

```ts
/** Keterangan baris booking online; rentang dan percobaan tanpa data klinis. */
export type OnlineRowInfo = {
  windowLines: string[];
  /** Hanya untuk booking terkonfirmasi; null selain itu. */
  phase: OnlinePhase | null;
  lastAttempt: string | null;
  /** Tautan WA "Minta waktu baru"; hanya saat Perlu waktu baru. */
  requestNewTime: { link: string | null } | null;
  contactWindows: ContactWindowsTarget;
};
```

3. Di `actionTarget`, tambahkan sebelum `case "CANCEL":`:

```ts
      case "CHANGE_WINDOWS":
        return { onSelect: () => row.online && dialogs.openContactWindows(row.online.contactWindows) };
      case "REQUEST_NEW_TIME":
        return { href: row.online?.requestNewTime?.link ?? "", external: true };
```

4. Di `primaryAction`, ubah `variant` menjadi `action === "VERIFY" || action === "MATCH" || action === "REQUEST_NEW_TIME" ? "default" : "outline"`.
5. Di sel pertama (kolom Jam), ganti `<div className="font-medium">{row.timeLabel}</div>` dengan:

```tsx
                  {showsContactWindows(row) && row.online ? (
                    <div className="space-y-0.5 whitespace-normal">
                      <Badge variant="outline">Online</Badge>
                      {row.online.windowLines.map((line) => (
                        <div key={line} className="text-sm font-medium">
                          {line}
                        </div>
                      ))}
                      {row.online.phase === "NEEDS_NEW" && (
                        <Badge variant="destructive">Perlu waktu baru</Badge>
                      )}
                      {row.online.lastAttempt && (
                        <div className="text-xs text-muted-foreground">{row.online.lastAttempt}</div>
                      )}
                    </div>
                  ) : (
                    <div className="font-medium">
                      {row.online && <Badge variant="outline" className="mr-1">Online</Badge>}
                      {row.timeLabel}
                    </div>
                  )}
```

   Pastikan `Badge` punya varian `destructive` (periksa `src/components/ui/badge.tsx`); bila tidak, pakai `variant="outline"` dengan `className="border-destructive text-destructive"`.

Di `src/components/admin/booking-dialogs.tsx`:
1. Tambahkan import `import type { ContactWindowsTarget, RescheduleTarget } from "@/lib/booking-actions";` (ganti import `RescheduleTarget` yang ada) dan `import { ContactWindowsDialog } from "./contact-windows-dialog";`.
2. Tipe `BookingDialogs` bertambah `openContactWindows: (target: ContactWindowsTarget) => void;`.
3. Tambahkan state `const [contactWindows, setContactWindows] = useState<ContactWindowsTarget | null>(null);`, isi `useMemo` bertambah `openContactWindows: setContactWindows,`, dan sebelum penutup `</BookingDialogsContext.Provider>`:

```tsx
      {contactWindows && (
        <ContactWindowsDialog
          key={contactWindows.appointmentId}
          target={contactWindows}
          today={today}
          open
          onOpenChange={(open) => {
            if (!open) setContactWindows(null);
          }}
        />
      )}
```

Buat `src/components/admin/contact-windows-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ContactWindowsEditor } from "@/components/online/contact-windows-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContactWindowsTarget } from "@/lib/booking-actions";
import { ONLINE_MAX_DAYS_AHEAD, windowDraftsError, type WindowDraft } from "@/lib/online-consultation";
import { addDaysToDateString } from "@/lib/time";
import { updateContactWindows } from "@/server/online-consultation";

/**
 * Mengganti seluruh rentang waktu luang booking online (spec konsultasi online 5.3).
 * Aturan versi resepsionis: boleh mulai sekarang, paling jauh 14 hari.
 */
export function ContactWindowsDialog({
  target,
  today,
  open,
  onOpenChange,
}: {
  target: ContactWindowsTarget;
  /** Hari ini dalam WITA, dari server. */
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [windows, setWindows] = useState<WindowDraft[]>(target.windows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const problem = windowDraftsError(windows, "STAFF", new Date());
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateContactWindows({ appointmentId: target.appointmentId, windows });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Waktu luang ${target.code} diperbarui.`);
        onOpenChange(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ubah waktu luang — {target.code}</DialogTitle>
          <DialogDescription>
            {target.patientName}. Rentang di bawah menggantikan semua rentang yang lama. Pesan konfirmasi dan pengingat
            lama tidak berlaku lagi; kirim yang baru dari daftar.
          </DialogDescription>
        </DialogHeader>
        <ContactWindowsEditor
          value={windows}
          onChange={setWindows}
          minDate={today}
          maxDate={addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Di `src/components/admin/booking-created-panel.tsx`: tambahkan prop `listHref?: string` (komentar: "Tautan daftar; bawaannya daftar tanggal jadwal. Booking online belum punya jam, jadi memakai daftar Menunggu konfirmasi.") dan ganti `href={\`/admin/booking?tanggal=${booking.date}&sorot=${booking.id}\`}` dengan `href={listHref ?? \`/admin/booking?tanggal=${booking.date}&sorot=${booking.id}\`}`. Untuk daftar yang disebut `listHref`, `sorot` ditambahkan pemanggil.

- [ ] **Step 4: Form Booking Baru online**

Buat `src/components/admin/online-appointment-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ContactWindowsEditor } from "@/components/online/contact-windows-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import {
  EMPTY_WINDOW_DRAFT,
  ONLINE_MAX_DAYS_AHEAD,
  onlineTotal,
  windowDraftsError,
  windowLabel,
  type WindowDraft,
} from "@/lib/online-consultation";
import { bookingFeeFor } from "@/lib/payment";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import type { TransferInstruction } from "@/lib/transfer-instruction";
import { getTransferInstruction } from "@/server/appointment";
import { createOnlineAppointment } from "@/server/online-consultation";
import type { PatientSummary } from "@/server/patient";
import { BookingCreatedPanel, type CreatedBooking } from "./booking-created-panel";
import { BookingSummary, type SummaryItem } from "./booking-summary";
import { PatientBookingInfo, PatientPicker } from "./patient-picker";

type OnlineSource = "WHATSAPP" | "TELEPON";
const SOURCE_LABEL: Record<OnlineSource, string> = { WHATSAPP: "WhatsApp", TELEPON: "Telepon" };

/**
 * Booking Baru versi konsultasi online (spec konsultasi online 5.1): pasien, dokter, sumber,
 * dan 1–3 rentang waktu luang. Tanpa pilihan cabang, tanggal, atau jam klinik.
 */
export function OnlineAppointmentForm({
  doctors,
  today,
  maxDate = addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD),
  bookingFee,
  servicePrice,
  initialPatient = null,
}: {
  doctors: { id: string; name: string }[];
  /** Hari ini dalam WITA, dari server. */
  today: string;
  maxDate?: string;
  /** Biaya booking dari Pengaturan; yang tersimpan disalin server saat booking dibuat. */
  bookingFee: number;
  /** Harga Konsultasi Online saat ini; yang tersimpan disalin server. */
  servicePrice: number;
  initialPatient?: PatientSummary | null;
}) {
  const [patient, setPatient] = useState<PatientSummary | null>(initialPatient);
  const [staffId, setStaffId] = useState(doctors.length === 1 ? doctors[0].id : "");
  const [source, setSource] = useState<OnlineSource>("WHATSAPP");
  const [windows, setWindows] = useState<WindowDraft[]>([EMPTY_WINDOW_DRAFT]);
  const [notes, setNotes] = useState("");
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [pending, startTransition] = useTransition();

  const fee = bookingFeeFor(source, bookingFee);
  const total = onlineTotal({ bookingFee: fee, servicePrice });
  const locked = created !== null;
  const doctorName = doctors.find((d) => d.id === staffId)?.name ?? null;
  const windowText = windows
    .filter((w) => w.date)
    .map((w) =>
      windowLabel({
        startAt: combineWitaDateAndMinutes(w.date, w.startMinute),
        endAt: combineWitaDateAndMinutes(w.date, w.endMinute),
      }),
    )
    .join("; ");

  const items: SummaryItem[] = [
    { label: "Pasien", value: patient?.name ?? null },
    { label: "Layanan", value: "Konsultasi Online" },
    { label: "Dokter", value: doctorName },
    { label: "Waktu luang", value: windowText || null },
    { label: "Sumber", value: SOURCE_LABEL[source] },
    { label: "Biaya booking", value: fee === null ? "tanpa biaya booking" : formatRupiah(fee) },
    { label: "Konsultasi Online", value: formatRupiah(servicePrice) },
    { label: "Total transfer", value: formatRupiah(total) },
  ];

  function startNew() {
    setCreated(null);
    setPatient(null);
    setWindows([EMPTY_WINDOW_DRAFT]);
    setNotes("");
    // Dokter dan sumber tetap: resepsionis biasanya mencatat beberapa booking berturut-turut.
  }

  function handleSubmit() {
    if (!patient) {
      toast.error("Pilih atau buat pasien terlebih dahulu.");
      return;
    }
    if (!staffId) {
      toast.error("Pilih dokter terlebih dahulu.");
      return;
    }
    const problem = windowDraftsError(windows, "STAFF", new Date());
    if (problem) {
      toast.error(problem);
      return;
    }

    startTransition(async () => {
      try {
        const result = await createOnlineAppointment({
          patientId: patient.id,
          staffId,
          source,
          windows,
          notes: notes.trim() || undefined,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        // Booking sudah tersimpan; instruksi yang gagal dimuat tidak membatalkannya.
        let instruction: TransferInstruction | null = null;
        let instructionFailed = false;
        try {
          const transfer = await getTransferInstruction(result.data.id);
          if (transfer.ok) instruction = transfer.data;
          else instructionFailed = true;
        } catch {
          instructionFailed = true;
        }
        setCreated({
          id: result.data.id,
          code: result.data.code,
          date: witaDateString(result.data.startAt),
          startAt: result.data.startAt,
          instruction,
          instructionFailed,
        });
      } catch {
        toast.error("Gagal membuat booking. Coba lagi.");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <fieldset disabled={locked} className="min-w-0 space-y-8 disabled:opacity-60">
        <section className="space-y-2">
          <h2 className="text-sm font-medium">1 · Pasien</h2>
          {patient ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>
                <span className="font-medium">{patient.name}</span>{" "}
                <span className="text-muted-foreground">
                  ({patient.medicalRecordNumber} · {patient.whatsapp})
                </span>
                <PatientBookingInfo patient={patient} />
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPatient(null)}>
                Ganti pasien
              </Button>
            </div>
          ) : (
            <PatientPicker onSelect={setPatient} />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">2 · Dokter & sumber</h2>
          <div className="space-y-1">
            <Label htmlFor="online-doctor">Dokter</Label>
            <select
              id="online-doctor"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-96"
            >
              <option value="">Pilih dokter</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p id="online-source-label" className="text-sm font-medium">
              Sumber booking
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="online-source-label">
              {(Object.keys(SOURCE_LABEL) as OnlineSource[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={source === value ? "default" : "outline"}
                  aria-pressed={source === value}
                  onClick={() => setSource(value)}
                >
                  {SOURCE_LABEL[value]}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">3 · Waktu pasien bisa dihubungi</h2>
          <p className="text-xs text-muted-foreground">
            1–3 waktu, jam 08.00–21.00, paling jauh {ONLINE_MAX_DAYS_AHEAD} hari ke depan. Dokter menelepon kapan saja di
            dalam rentang itu.
          </p>
          <ContactWindowsEditor value={windows} onChange={setWindows} minDate={today} maxDate={maxDate} />
        </section>

        <section className="space-y-1">
          <Label htmlFor="online-notes">Catatan (opsional)</Label>
          <Input
            id="online-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Misal: keluhan utama, permintaan khusus"
          />
        </section>
      </fieldset>

      <aside aria-label="Ringkasan booking" className="space-y-4 lg:sticky lg:top-4">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-medium">Ringkasan</h2>
          <BookingSummary items={items} />
          {!created && (
            <Button type="button" className="w-full" disabled={pending} onClick={handleSubmit}>
              {pending ? "Menyimpan…" : "Buat Booking"}
            </Button>
          )}
        </div>
        {created && (
          <BookingCreatedPanel
            booking={created}
            dateLabel="Menunggu konfirmasi"
            listHref={`/admin/booking?sorot=${created.id}`}
            onNew={startNew}
          />
        )}
      </aside>
    </div>
  );
}
```

Di `src/app/(admin)/admin/booking/baru/page.tsx`:
1. Tambahkan import:

```ts
import { OnlineAppointmentForm } from "@/components/admin/online-appointment-form";
import { PageTabs } from "@/components/admin/page-tabs";
import { loadOnlineService } from "@/server/online-store";
```

2. Ubah `Promise.all` agar juga memuat `loadOnlineService()` (nama hasil `onlineService`), lalu setelah `activeBranches` tambahkan:

```ts
  const online = one(params.jenis) === "online" && onlineService !== null;
  const doctors = staffList.filter((s) => s.role === "DOKTER").map((s) => ({ id: s.id, name: s.name }));
```

3. Tepat di bawah `<PageHeader … />`, tambahkan (tab hanya bila layanan aktif):

```tsx
        {onlineService && (
          <PageTabs
            label="Jenis konsultasi"
            active={online ? "online" : "klinik"}
            tabs={[
              { id: "klinik", label: "Konsultasi di klinik", href: "/admin/booking/baru" },
              { id: "online", label: "Konsultasi online", href: "/admin/booking/baru?jenis=online" },
            ]}
          />
        )}
```

4. Ganti isi cabang `activeBranches.length === 0 || staffList.length === 0 ? … : <AppointmentForm …/>` menjadi tiga cabang: bila `online`, render

```tsx
          <OnlineAppointmentForm
            doctors={doctors}
            today={witaDateString(new Date())}
            bookingFee={setting.bookingFee}
            servicePrice={onlineService.promoPrice}
            initialPatient={prefill.initial?.patient ?? null}
          />
```

   (tampilkan pesan "Belum ada dokter yang dapat dijadwalkan." bila `doctors.length === 0`), selain itu form klinik seperti sebelumnya.

- [ ] **Step 5: Halaman Booking dan Pengingat**

Di `src/app/(admin)/admin/booking/page.tsx`:
1. Tambahkan import `import { lastAttemptLabel, onlinePhase, placeLabel, windowDrafts, windowLines } from "@/lib/online-consultation";` (dan `placeLabel` dari modul yang sama — tempat definisinya di lib Task 7), `showsContactWindows` dari `@/lib/booking-actions`, `requestNewTimeMessageFor` ke import `@/lib/booking-messages`, dan `listOnlineBookings` ke import `@/server/appointment`.
2. Di `toRow`: ganti `branchName: a.branch.name,` dengan `branchName: placeLabel(a.channel, a.branch.name),`, dan tambahkan kolom (sebelum `}` penutup objek yang dikembalikan):

```ts
    online:
      a.channel === "ONLINE"
        ? {
            windowLines: windowLines(a.contactWindows),
            phase: a.status === "TERKONFIRMASI" ? onlinePhase(a.contactWindows, context.now) : null,
            lastAttempt: lastAttemptLabel(a.contactAttempts),
            requestNewTime:
              a.status === "TERKONFIRMASI" && onlinePhase(a.contactWindows, context.now) === "NEEDS_NEW"
                ? { link: requestNewTimeMessageFor(a)?.link ?? null }
                : null,
            contactWindows: {
              appointmentId: a.id,
              code: a.code,
              patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
              windows: windowDrafts(a.contactWindows),
            },
          }
        : null,
```

   Booking online mengisi `channel: "ONLINE"` pada `bookingRowActions`; `BookingRow` tidak memuat `channel`, jadi tambahkan di `BookingRow` (appointment-table.tsx) kolom `channel: "KLINIK" | "ONLINE";`, isi `channel: a.channel,` di `toRow`, dan tambahkan `channel: "KLINIK",` pada fixture `base` di `appointment-table.test.tsx` (`bookingRowActions(row, …)` menerima `BookingRow` karena `requestNewTime` dibaca dari `row.online?.requestNewTime`; tambahkan di appointment-table.tsx pemanggilan `bookingRowActions({ ...row, requestNewTime: row.online?.requestNewTime ?? null }, canReadRecords)`).
3. Ganti `withDate` dengan:

```ts
/** Daftar tanpa batas satu tanggal: jam jadwal ditulis bersama tanggalnya. Booking online yang belum dimulai tidak punya jam. */
function withDate(row: BookingRow, startAt: Date): BookingRow {
  if (showsContactWindows(row)) return row;
  return { ...row, timeLabel: `${formatShortIndonesianDate(startAt)} · ${row.timeLabel}` };
}
```

   dan di `toRow` ganti `timeLabel: \`${timeLabel(a.startAt)}–${timeLabel(a.endAt)}\`,` dengan `timeLabel: a.channel === "ONLINE" && a.status !== "HADIR" && a.status !== "SELESAI" ? "Online" : \`${timeLabel(a.startAt)}–${timeLabel(a.endAt)}\`,` (yang sudah dimulai memakai jam sebenarnya, spec 3.5).
4. Tambahkan `listOnlineBookings()` ke `Promise.all` (hasil `onlineBookings`) dan `const onlineRows = onlineBookings.map((a) => toRow(a, context));`.
5. Di JSX, tepat sebelum `<div className="flex flex-wrap items-center gap-3">` (kotak cari), tambahkan:

```tsx
        {onlineRows.length > 0 && !query && (
          <section aria-labelledby="booking-online" className="space-y-3 rounded-lg border border-sky-300 bg-sky-50/60 p-4">
            <div>
              <h2 id="booking-online" className="text-lg font-medium">
                Konsultasi online ({onlineRows.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                Sudah diverifikasi dan menunggu dihubungi dokter. Yang waktunya sudah lewat ada di atas.
              </p>
            </div>
            <AppointmentTable rows={onlineRows} canReadRecords={canReadRecords} highlightId={params.sorot ?? null} />
          </section>
        )}
```

   Pada tabel "Menunggu konfirmasi", tambahkan `highlightId={params.sorot ?? null}`.

Di `src/components/admin/reminder-worklist.tsx`:
1. Di `Who`, ganti `· {row.code} · {schedule(row.startAt)} · {row.staffName}` dengan `· {row.code} · {row.onlineLabel ?? schedule(row.startAt)} · {row.staffName}`.
2. Ganti `{sent.reply === "MINTA_PINDAH" && (` dengan `{sent.reply === "MINTA_PINDAH" && row.channel === "KLINIK" && (`.

Run: `npx vitest run tests/unit/booking-actions.test.ts tests/unit/components/appointment-table.test.tsx tests/unit/components/contact-windows-dialog.test.tsx tests/unit/components/online-appointment-form.test.tsx tests/unit/components/reminder-worklist.test.tsx tests/unit/components/booking-created-panel.test.tsx`
Expected: PASS semua.

- [ ] **Step 6: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t10.log" 2>&1; grep -E "Test Files|Tests " "$WS/t10.log"; npx eslint src "tests/unit"; npx tsc --noEmit -p . > "$WS/t10-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0. Bila `tsc` menandai fixture `BookingRow` di uji lain (mis. `tests/unit/admin-dashboard-page.test.tsx`), tambahkan `channel: "KLINIK", online: null,` di fixture itu.

```bash
git add src/components/admin src/app/\(admin\)/admin/booking src/lib/booking-actions.ts \
  tests/unit/booking-actions.test.ts tests/unit/components
git commit -m "feat: let staff book, list, and re-time online consultations from the admin booking pages"
```

---

### Task 11: Dasbor dokter — bagian "Konsultasi online", Mulai konsultasi, Tidak terhubung, label di catatan dokter

**Files:**
- Create: `src/components/admin/online-work.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`, `src/components/admin/doctor-worklist.tsx`, `src/components/admin/encounter-page-view.tsx`
- Test: `tests/unit/components/online-work.test.tsx`, `tests/unit/admin-dashboard-page.test.tsx`, `tests/unit/components/doctor-worklist.test.tsx`, `tests/unit/components/encounter-page-view.test.tsx`

**Interfaces:**
- Consumes: Task 7 (`listOnlineWork`, `OnlineWorkRow`, `startOnlineConsultation`, `recordContactAttempt`, `WorklistRow.online`, `EncounterDetail.appointment.channel`), sudah ada: `SectionCard`, `EmptyState`, `FailedSection`, `settle`, `can`.
- Produces: `OnlineWorkView({ rows }: { rows: OnlineWorkRow[] })`, tampil di dasbor untuk pemegang `record:write`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/unit/components/online-work.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { OnlineWorkView } from "@/components/admin/online-work";
import type { OnlineWorkRow } from "@/server/encounter-read";
import { recordContactAttempt, startOnlineConsultation } from "@/server/online-consultation";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/online-consultation", () => ({ startOnlineConsultation: vi.fn(), recordContactAttempt: vi.fn() }));

const row = (patch: Partial<OnlineWorkRow>): OnlineWorkRow => ({
  appointmentId: "a1",
  code: "SDY-ON01",
  phase: "UPCOMING",
  patientName: "Siti Rahayu",
  patientRecordNumber: "SDY-2026-0001",
  whatsapp: "6281234567890",
  whatsappLink: "https://wa.me/6281234567890",
  doctorName: "dr. Diane",
  purposeLabel: "Slimming",
  intakeId: "i1",
  windows: [{ label: "Rabu, 7 Oktober 2026, 19.00–21.00", current: false }],
  lastAttempt: null,
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("OnlineWorkView", () => {
  it("mengelompokkan Sekarang, Hari ini, dan Mendatang, dengan rentang yang berlangsung ditandai", () => {
    render(
      <OnlineWorkView
        rows={[
          row({ appointmentId: "n", patientName: "Rina", phase: "NOW", windows: [{ label: "Selasa, 6 Oktober 2026, 10.00–12.00", current: true }] }),
          row({ appointmentId: "t", patientName: "Budi", phase: "TODAY" }),
          row({}),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Sekarang" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hari ini" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mendatang" })).toBeInTheDocument();
    const now = screen.getByText("Rina").closest("li")!;
    expect(within(now).getByText("sedang berlangsung")).toBeInTheDocument();
  });

  it("menampilkan WA yang bisa diketuk, tujuan, percobaan terakhir, dan Lihat isian", () => {
    render(<OnlineWorkView rows={[row({ lastAttempt: "Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)" })]} />);
    expect(screen.getByRole("link", { name: /6281234567890/ })).toHaveAttribute("href", "https://wa.me/6281234567890");
    expect(screen.getByText("Slimming")).toBeInTheDocument();
    expect(screen.getByText("Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
  });

  it("nama dokter hanya tampil bila ada lebih dari satu dokter", () => {
    const { rerender } = render(<OnlineWorkView rows={[row({})]} />);
    expect(screen.queryByText("dr. Diane")).not.toBeInTheDocument();
    rerender(<OnlineWorkView rows={[row({}), row({ appointmentId: "a2", doctorName: "dr. Budi" })]} />);
    expect(screen.getByText("dr. Diane")).toBeInTheDocument();
  });

  it("Mulai konsultasi membuka halaman kunjungan yang dikembalikan server", async () => {
    const user = userEvent.setup();
    vi.mocked(startOnlineConsultation).mockResolvedValue({ ok: true, data: { encounterId: "e9" } });
    render(<OnlineWorkView rows={[row({})]} />);
    await user.click(screen.getByRole("button", { name: "Mulai konsultasi" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kunjungan/e9"));
    expect(startOnlineConsultation).toHaveBeenCalledWith("a1");
  });

  it("Mulai konsultasi yang ditolak menampilkan galat dan tidak berpindah halaman", async () => {
    const user = userEvent.setup();
    vi.mocked(startOnlineConsultation).mockResolvedValue({
      ok: false,
      error: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman.",
    });
    render(<OnlineWorkView rows={[row({})]} />);
    await user.click(screen.getByRole("button", { name: "Mulai konsultasi" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Booking ini sudah berstatus dibatalkan. Muat ulang halaman."));
    expect(push).not.toHaveBeenCalled();
  });

  it("Tidak terhubung mencatat percobaan lalu memuat ulang daftar", async () => {
    const user = userEvent.setup();
    vi.mocked(recordContactAttempt).mockResolvedValue({ ok: true, data: undefined });
    render(<OnlineWorkView rows={[row({})]} />);
    await user.click(screen.getByRole("button", { name: "Tidak terhubung" }));
    await waitFor(() => expect(recordContactAttempt).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("tanpa booking: keterangan kosong", () => {
    render(<OnlineWorkView rows={[]} />);
    expect(screen.getByText("Tidak ada konsultasi online yang menunggu.")).toBeInTheDocument();
  });
});
```

Tambahkan di `tests/unit/admin-dashboard-page.test.tsx`:
1. Ubah mock `encounter-read` menjadi `vi.mock("@/server/encounter-read", () => ({ listDoctorWorklist: vi.fn(), listOnlineWork: vi.fn() }));`, tambahkan `vi.mock("@/server/online-consultation", () => ({ startOnlineConsultation: vi.fn(), recordContactAttempt: vi.fn() }));`, `import { listDoctorWorklist, listOnlineWork } from "@/server/encounter-read";`, dan di `beforeEach`: `vi.mocked(listOnlineWork).mockResolvedValue([]);`.
2. Dua uji baru dalam `describe`:

```tsx
  it("dokter melihat bagian Konsultasi online di luar kisi daftar dokter", async () => {
    await renderPage();
    const online = screen.getByRole("region", { name: "Konsultasi online" });
    expect(online).toHaveTextContent("Tidak ada konsultasi online yang menunggu.");
    expect(online.closest("div.grid")).toBeNull();
  });

  it("resepsionis (tanpa record:write) tidak melihat bagian Konsultasi online", async () => {
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u2", staffId: "s2", name: "Rina", role: "RESEPSIONIS", email: "r@sundy.test" } as never);
    await renderPage();
    expect(screen.queryByRole("region", { name: "Konsultasi online" })).not.toBeInTheDocument();
    expect(listOnlineWork).not.toHaveBeenCalled();
  });

  it("bagian Konsultasi online gagal dimuat: bagian lain tetap tampil", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listOnlineWork).mockRejectedValue(new Error("putus"));
    await renderPage();
    expect(within(screen.getByRole("region", { name: "Konsultasi online" })).getByText("Gagal dimuat. Muat ulang halaman.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pasien hari ini" })).toBeInTheDocument();
    log.mockRestore();
  });
```

Tambahkan di `tests/unit/components/doctor-worklist.test.tsx` (pembantu `row` sudah membawa `online: false` dari Task 7):

```tsx
  it("booking online yang sudah dimulai diberi label Online", () => {
    render(
      <DoctorWorklistView
        worklist={{
          today: [row({ online: true, branchName: "Online (WhatsApp)", state: "DRAF", encounterId: "e2" })],
          unfinished: [],
        }}
      />,
    );
    expect(screen.getByText("Online (WhatsApp)")).toBeInTheDocument();
    expect(screen.getByText("Online", { exact: true })).toBeInTheDocument();
  });
```

Tambahkan di `tests/unit/components/encounter-page-view.test.tsx`:

```tsx
  it("konsultasi online diberi label di kepala halaman dan Online (WhatsApp) di tempat cabang", () => {
    const base = encounterDetail();
    render(
      <EncounterPageView
        encounter={{ ...base, appointment: { ...base.appointment, channel: "ONLINE", branchName: "Online (WhatsApp)" } }}
        canWrite
      />,
    );
    expect(screen.getByText("Konsultasi online", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Online \(WhatsApp\)/)).toBeInTheDocument();
  });

  it("kunjungan klinik tidak berlabel konsultasi online", () => {
    render(<EncounterPageView encounter={encounterDetail()} canWrite />);
    expect(screen.queryByText("Konsultasi online", { exact: true })).not.toBeInTheDocument();
  });
```

Run: `npx vitest run tests/unit/components/online-work.test.tsx tests/unit/admin-dashboard-page.test.tsx tests/unit/components/doctor-worklist.test.tsx tests/unit/components/encounter-page-view.test.tsx`
Expected: FAIL (komponen dan bagian dasbor belum ada).

- [ ] **Step 2: Komponen bagian Konsultasi online**

Buat `src/components/admin/online-work.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OnlineWorkRow } from "@/server/encounter-read";
import { recordContactAttempt, startOnlineConsultation } from "@/server/online-consultation";
import { EmptyState, SectionCard } from "./page-layout";

const PHASES = [
  { phase: "NOW", title: "Sekarang" },
  { phase: "TODAY", title: "Hari ini" },
  { phase: "UPCOMING", title: "Mendatang" },
] as const;

function WorkItem({ row, showDoctor }: { row: OnlineWorkRow; showDoctor: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      try {
        const result = await startOnlineConsultation(row.appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        router.push(`/admin/kunjungan/${result.data.encounterId}`);
      } catch {
        toast.error("Gagal memulai konsultasi. Coba lagi.");
      }
    });
  }

  function notReached() {
    startTransition(async () => {
      try {
        const result = await recordContactAttempt(row.appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`Percobaan menghubungi ${row.patientName} dicatat.`);
        router.refresh();
      } catch {
        toast.error("Gagal mencatat. Coba lagi.");
      }
    });
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{row.patientName}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {row.patientRecordNumber} · {row.code}
        </span>
        {row.purposeLabel && <Badge variant="outline">{row.purposeLabel}</Badge>}
        {showDoctor && <span className="text-xs text-muted-foreground">{row.doctorName}</span>}
      </div>
      <ul className="space-y-0.5 text-sm">
        {row.windows.map((window) => (
          <li key={window.label} className={window.current ? "font-medium text-emerald-700" : undefined}>
            • {window.label}
            {window.current && <span className="ml-2 text-xs">sedang berlangsung</span>}
          </li>
        ))}
      </ul>
      {row.lastAttempt && <p className="text-xs text-muted-foreground">{row.lastAttempt}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={start} disabled={pending}>
          Mulai konsultasi
        </Button>
        <Button size="sm" variant="outline" onClick={notReached} disabled={pending}>
          Tidak terhubung
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={row.whatsappLink} target="_blank" rel="noopener noreferrer">
            WhatsApp {row.whatsapp}
          </a>
        </Button>
        {row.intakeId && (
          <Link href={`/admin/isian/${row.intakeId}`} className="text-sm underline underline-offset-4">
            Lihat isian
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Bagian "Konsultasi online" di dasbor dokter (spec konsultasi online 6.1): booking terkonfirmasi
 * yang masih punya rentang terbuka, dikelompokkan Sekarang / Hari ini / Mendatang. Dokter menelepon
 * lewat WhatsApp, lalu menekan Mulai konsultasi (boleh di luar rentang) atau Tidak terhubung.
 */
export function OnlineWorkView({ rows }: { rows: OnlineWorkRow[] }) {
  const showDoctor = new Set(rows.map((row) => row.doctorName)).size > 1;
  return (
    <SectionCard title="Konsultasi online">
      {rows.length === 0 ? (
        <EmptyState>Tidak ada konsultasi online yang menunggu.</EmptyState>
      ) : (
        <div className="space-y-4">
          {PHASES.map(({ phase, title }) => {
            const group = rows.filter((row) => row.phase === phase);
            if (group.length === 0) return null;
            return (
              <section key={phase} className="space-y-1">
                <h3 className="text-sm font-semibold text-brown-900">{title}</h3>
                <ul className="divide-y">
                  {group.map((row) => (
                    <WorkItem key={row.appointmentId} row={row} showDoctor={showDoctor} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 3: Dasbor, daftar dokter, dan halaman catatan dokter**

Di `src/app/(admin)/admin/page.tsx`:
1. Tambahkan import `import { OnlineWorkView } from "@/components/admin/online-work";` dan ubah import `@/server/encounter-read` menjadi `import { listDoctorWorklist, listOnlineWork } from "@/server/encounter-read";`.
2. Ubah `Promise.all` menjadi lima unsur dengan `online` setelah `worklist`:

```ts
  const [work, schedule, worklist, online, numbers] = await Promise.all([
    canBook ? settle(getTodayWork(now), "pekerjaan hari ini") : null,
    canBook ? settle(getTodaySchedule(now), "jadwal hari ini") : null,
    can(staff.role, "record:read") ? settle(listDoctorWorklist(), "daftar dokter") : null,
    can(staff.role, "record:write") ? settle(listOnlineWork(), "konsultasi online") : null,
    can(staff.role, "report:read") ? settle(getDashboardNumbers(period, now), "angka") : null,
  ]);
```

3. Tepat sebelum blok `{(worklist || numbers) && (`, tambahkan:

```tsx
        {online && (online.ok ? <OnlineWorkView rows={online.data} /> : <FailedSection title="Konsultasi online" />)}
```

Di `src/components/admin/doctor-worklist.tsx`, di sel nama pasien tepat setelah badge food recall, tambahkan:

```tsx
                  {row.online && (
                    <Badge variant="outline" className="ml-2 text-xs font-normal">
                      Online
                    </Badge>
                  )}
```

Di `src/components/admin/encounter-page-view.tsx`, tepat setelah `<Badge variant={isFinal ? "default" : "outline"}>…</Badge>`, tambahkan:

```tsx
        {appointment.channel === "ONLINE" && <Badge variant="outline">Konsultasi online</Badge>}
```

Run: `npx vitest run tests/unit/components/online-work.test.tsx tests/unit/admin-dashboard-page.test.tsx tests/unit/components/doctor-worklist.test.tsx tests/unit/components/encounter-page-view.test.tsx`
Expected: PASS semua.

- [ ] **Step 4: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t11.log" 2>&1; grep -E "Test Files|Tests " "$WS/t11.log"; npx eslint src tests/unit; npx tsc --noEmit -p . > "$WS/t11-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc` keluar 0.

```bash
git add src/components/admin/online-work.tsx "src/app/(admin)/admin/page.tsx" src/components/admin/doctor-worklist.tsx \
  src/components/admin/encounter-page-view.tsx tests/unit/components/online-work.test.tsx tests/unit/admin-dashboard-page.test.tsx \
  tests/unit/components/doctor-worklist.test.tsx tests/unit/components/encounter-page-view.test.tsx
git commit -m "feat: show online consultations on the doctor dashboard with start and not-reached actions"
```

---

### Task 12: Uji E2E, verifikasi penuh, dan penandaan spec

**Files:**
- Modify: `tests/e2e/prepare-db.mts`, `docs/superpowers/specs/2026-10-06-konsultasi-online-design.md`
- Create: `tests/e2e/online-consultation.spec.ts`

**Interfaces:**
- Consumes: semua task sebelumnya. Fixture e2e: layanan `konsultasi-online` aktif berharga Rp 250.000 (basis data uji, dengan biaya booking Rp 100.000 dari `prepare-db.mts`), dokter `diane-paparang`, dan akun `E2E_ADMIN` (Super Admin: `booking:manage` dan `record:write`) serta `E2E_RESEPSIONIS`.
- Produces: `prepare-db.mts` membuat satu booking online *Terkonfirmasi* per proyek (desktop/mobile) yang rentangnya sudah lewat: pasien "Pasien Online Lapsed {proyek}", kode `E2E-ONLINE-n`.

- [ ] **Step 1: Fixture e2e**

Di `tests/e2e/prepare-db.mts`, tepat sebelum komentar `// Check-in (check-in.spec.ts)`, tambahkan:

```ts
// Konsultasi online (online-consultation.spec.ts): layanan diaktifkan berharga Rp 250.000, dan satu
// booking online terkonfirmasi per proyek yang semua rentang waktu luangnya sudah lewat (kemarin),
// sehingga muncul "Perlu waktu baru". Tanpa slot klinik, jadi jamnya tidak berebut dengan uji lain.
await prisma.service.update({
  where: { slug: "konsultasi-online" },
  data: { promoPrice: 250000, durationMin: 30, isActive: true },
});
const onlineService = await prisma.service.findUniqueOrThrow({ where: { slug: "konsultasi-online" } });
const yesterday = addDaysToDateString(today, -1);
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-ONLINE-${index + 1}`,
      name: `Pasien Online Lapsed ${project}`,
      whatsapp: `6281200081${index}01`,
    },
  });
  const from = combineWitaDateAndMinutes(yesterday, 10 * 60);
  const to = combineWitaDateAndMinutes(yesterday, 12 * 60);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-ONLINE-${index + 1}`,
      type: "KONSULTASI",
      channel: "ONLINE",
      startAt: from,
      endAt: to,
      status: "TERKONFIRMASI",
      source: "WHATSAPP",
      bookingFee: 100000,
      servicePrice: 250000,
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: onlineService.id,
      patientId: patient.id,
    },
  });
  await prisma.contactWindow.create({ data: { appointmentId: appointment.id, startAt: from, endAt: to } });
}
```

- [ ] **Step 2: Spec e2e**

Buat `tests/e2e/online-consultation.spec.ts`:

```ts
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { choose, fillFormRecall, inGroup, next, signIn, tick } from "./helpers/quiz";

// Dua cerita. (1) Customer memilih konsultasi online di /daftar → admin mencocokkan dan memverifikasi →
// dokter memulai konsultasi dari dasbor dan memfinalisasi. (2) Booking online yang rentangnya lewat
// tampil "Perlu waktu baru" → resepsionis mengubah waktu luang → booking kembali ke daftar dokter.
// Desktop dan ponsel berjalan paralel, masing-masing dengan pasien sendiri.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

/** Tanggal WITA ("YYYY-MM-DD") `days` hari dari sekarang. */
function dayFromToday(days: number): string {
  const date = new Date(Date.now() + 8 * 3600_000 + days * 24 * 3600_000);
  return date.toISOString().slice(0, 10);
}

const customerFor = (testInfo: TestInfo) =>
  testInfo.project.name === "mobile"
    ? { name: "Online Ponsel E2E", whatsapp: "081299990012" }
    : { name: "Online Desktop E2E", whatsapp: "081299990011" };

let booking: { code: string } | null = null;

async function fillSlimmingQuiz(page: Page) {
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
  await next(page);
  await fillFormRecall(page);
  await tick(page, "Darah tinggi");
  await next(page);
  await page.getByLabel("Obat untuk Darah tinggi").fill("Amlodipine 5 mg, 1× sehari");
  await next(page);
  await inGroup(page, "Obat atau suplemen lain", "Tidak ada");
  await inGroup(page, "Alergi obat, makanan, atau kosmetik", "Tidak ada");
  await next(page);
  await choose(page, "Tidak");
}

test("customer mendaftar konsultasi online dua waktu sampai mendapat total transfer", async ({ page }) => {
  const customer = customerFor(test.info());
  await page.goto("/daftar");
  await fillSlimmingQuiz(page);
  await page.getByRole("button", { name: "Pilih layanan & jadwal" }).click();

  await choose(page, /^Online lewat WhatsApp/);
  await expect(page.getByText("Total transfer di muka")).toBeVisible();
  await expect(page.getByText("Rp 350.000").first()).toBeVisible();
  await next(page);

  await expect(page.getByRole("heading", { name: "Kapan Anda bisa dihubungi?" })).toBeVisible();
  const doctors = page.getByRole("radiogroup", { name: "Dokter", exact: true });
  if (await doctors.count()) await doctors.getByRole("radio").first().click();
  await page.getByLabel("Tanggal waktu 1").fill(dayFromToday(2));
  await page.getByRole("button", { name: "+ Tambah waktu" }).click();
  await page.getByLabel("Tanggal waktu 2").fill(dayFromToday(4));
  await next(page);

  await page.getByLabel("Nama lengkap").fill(customer.name);
  await page.getByLabel("Nomor WhatsApp").fill(customer.whatsapp);
  await page.getByLabel("Tanggal lahir").fill("1992-04-17");
  await inGroup(page, "Jenis kelamin", "Perempuan");
  await page.getByLabel("Pekerjaan").fill("Guru");
  await page.getByLabel("Alamat").fill("Jl. Uji E2E No. 1, Manado");
  await page.getByRole("checkbox", { name: /Kebijakan Privasi/ }).check();
  await page.getByRole("checkbox", { name: /mentransfer/ }).check();
  await page.getByRole("button", { name: "Kirim pendaftaran" }).click();

  await expect(page.getByRole("heading", { name: "Pendaftaran diterima" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Waktu Anda bisa dihubungi:")).toBeVisible();
  await expect(page.getByText(/total.*Rp 350\.000/)).toBeVisible();
  await expect(page.locator("main").getByText(/pasien|berobat/i)).toHaveCount(0);
  const code = (await page.getByText(/^SDY-[A-Z0-9]{4}$/).textContent())?.trim();
  expect(code).toMatch(/^SDY-[A-Z0-9]{4}$/);
  booking = { code: code! };
});

test("admin mencocokkan dan memverifikasi, dokter memulai konsultasi dan memfinalisasi", async ({ page }) => {
  test.skip(!booking, "Butuh booking dari uji sebelumnya.");
  const customer = customerFor(test.info());
  await signIn(page, E2E_ADMIN);

  await page.goto("/admin/booking");
  const pending = page.getByRole("region", { name: /^Menunggu konfirmasi/ });
  const pendingRow = pending.getByRole("row").filter({ hasText: booking!.code });
  await expect(pendingRow.getByText("Online", { exact: true }).first()).toBeVisible();
  await expect(pendingRow.getByText(/^•/).first()).toBeVisible();
  await pendingRow.getByRole("button", { name: "Cocokkan pasien" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(customer.name).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Buat pasien baru" }).click();
  await expect(pendingRow.getByText("Belum dicocokkan", { exact: true })).toBeHidden({ timeout: 30_000 });
  await pendingRow.getByRole("button", { name: "Verifikasi" }).click();
  await expect(pendingRow).toHaveCount(0, { timeout: 30_000 });

  // Booking terkonfirmasi pindah ke bagian "Konsultasi online"; tidak ada Check-in untuknya.
  await page.goto("/admin/booking");
  const onlineSection = page.getByRole("region", { name: /^Konsultasi online/ });
  const onlineRow = onlineSection.getByRole("row").filter({ hasText: booking!.code });
  await expect(onlineRow).toBeVisible({ timeout: 30_000 });
  await expect(onlineRow.getByRole("button", { name: "Check-in" })).toHaveCount(0);

  await page.goto("/admin");
  const work = page.getByRole("region", { name: "Konsultasi online" });
  const item = work.getByRole("listitem").filter({ hasText: customer.name });
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item.getByRole("link", { name: /^WhatsApp 62/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/62/);
  await item.getByRole("button", { name: "Tidak terhubung" }).click();
  await expect(item.getByText(/tidak terhubung/)).toBeVisible({ timeout: 30_000 });

  await item.getByRole("button", { name: "Mulai konsultasi" }).click();
  await expect(page).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByText("Konsultasi online", { exact: true })).toBeVisible();
  await expect(page.getByText(/Online \(WhatsApp\)/).first()).toBeVisible();

  await page.getByLabel("Keluhan dan anamnesis dokter").fill("Berat naik 3 kg sejak Juli.");
  await page.getByLabel("Berat badan (kg)").fill("72");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Penilaian / diagnosis").fill("Obesitas derajat 1");
  await page.getByLabel("Rencana, program, dan resep").fill("Program MAX, kontrol 1 minggu.");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Finalisasi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Sudah dimulai: keluar dari daftar Konsultasi online dokter.
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Konsultasi online" }).getByText(customer.name)).toHaveCount(0);
});

test("booking online yang rentangnya lewat: Perlu waktu baru, lalu Ubah waktu luang mengembalikannya ke dokter", async ({ page }, testInfo) => {
  const name = `Pasien Online Lapsed ${testInfo.project.name}`;
  await signIn(page, E2E_ADMIN);

  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Konsultasi online" }).getByText(name)).toHaveCount(0);

  await page.goto("/admin/booking");
  const onlineSection = page.getByRole("region", { name: /^Konsultasi online/ });
  const row = onlineSection.getByRole("row").filter({ hasText: name });
  await expect(row.getByText("Perlu waktu baru", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(row.getByRole("link", { name: "Minta waktu baru via WA" })).toHaveAttribute("href", /^https:\/\/wa\.me\/62/);

  await row.getByRole("button", { name: "Ubah waktu luang" }).click();
  const dialog = page.getByRole("dialog", { name: /^Ubah waktu luang/ });
  await dialog.getByLabel("Tanggal waktu 1").fill(dayFromToday(3));
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(onlineSection.getByRole("row").filter({ hasText: name }).getByText("Perlu waktu baru")).toHaveCount(0, { timeout: 30_000 });

  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Konsultasi online" }).getByText(name)).toBeVisible({ timeout: 30_000 });
});

test("resepsionis tidak melihat bagian Konsultasi online di dasbor", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await expect(page.getByRole("region", { name: "Konsultasi online" })).toHaveCount(0);
});
```

- [ ] **Step 3: Jalankan E2E per kelompok**

Mac 8 GB: jalankan per kelompok, matikan proses sisa dulu, dan bersihkan `sundy_test` sebelum uji integrasi sesudahnya (prepare-db mengotori basis data uji).

Run: `pkill -f "next dev -p" ; pkill -f playwright; npx playwright test tests/e2e/online-consultation.spec.ts > "$WS/e2e-online.log" 2>&1; tail -40 "$WS/e2e-online.log"`
Expected: 8 uji lulus (4 uji × desktop dan ponsel). Bila ada yang gagal, baca galat dan jejaknya, perbaiki kode (bukan melonggarkan uji), ulangi.

Run (kelompok yang bersinggungan dengan perubahan): `npx playwright test tests/e2e/public-registration.spec.ts tests/e2e/admin-booking.spec.ts > "$WS/e2e-pub.log" 2>&1; tail -20 "$WS/e2e-pub.log"` lalu `npx playwright test tests/e2e/pengingat.spec.ts tests/e2e/kunjungan.spec.ts tests/e2e/dasbor.spec.ts tests/e2e/check-in.spec.ts > "$WS/e2e-misc.log" 2>&1; tail -20 "$WS/e2e-misc.log"`
Expected: lulus, kecuali dua flake lama yang sudah diketahui (`admin.spec` ERR_NETWORK_IO_SUSPENDED dan chip gulir ponsel di `situs-publik-gerak`) bila kelompok itu ikut dijalankan.

- [ ] **Step 4: Verifikasi penuh**

Run (bersihkan dulu `sundy_test`: `pkill -f "next dev -p"; pkill -f playwright`, lalu hapus baris fixture e2e dengan skrip sementara di scratchpad yang memakai `TEST_DATABASE_URL`, atau buat ulang basis data uji lewat `npm run test:integration` yang menyiapkannya):

```bash
npx vitest run > "$WS/final-unit.log" 2>&1; grep -E "Test Files|Tests " "$WS/final-unit.log"
npm run test:integration > "$WS/final-int.log" 2>&1; grep -E "Test Files|Tests " "$WS/final-int.log"
npx eslint . > "$WS/final-lint.log" 2>&1; echo "eslint exit $?"
npx tsc --noEmit -p . > "$WS/final-tsc.log" 2>&1; echo "tsc exit $?"
npm run build > "$WS/final-build.log" 2>&1; echo "build exit $?"
```

Expected: semua uji lulus, eslint dan `tsc` keluar 0, build berhasil.

- [ ] **Step 5: Tandai spec dan commit**

Di `docs/superpowers/specs/2026-10-06-konsultasi-online-design.md`, ganti baris status "Menunggu tinjauan pemilik" menjadi "Dibangun (belum dideploy)".

```bash
git add tests/e2e/prepare-db.mts tests/e2e/online-consultation.spec.ts docs/superpowers/specs/2026-10-06-konsultasi-online-design.md
git commit -m "test: cover online consultations end to end and mark the design as built"
```

Catatan deploy (bukan bagian rencana ini, hanya atas permintaan pemilik): ada migrasi, jadi cadangkan basis data dulu, lalu pemilik mengisi harga dan mengaktifkan Konsultasi Online di Layanan & Harga. `/daftar` baru perlu dibuka kembali bila masih ditutup (`REGISTRATION_CLOSED`).
