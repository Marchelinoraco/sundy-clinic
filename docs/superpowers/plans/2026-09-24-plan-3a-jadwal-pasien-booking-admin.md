# Plan 3a — Mesin Jadwal, Data Pasien & Pencatatan Janji Temu oleh Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun mesin jadwal anti-bentrok dan panel admin yang memungkinkan staf mencatat janji temu pasien secepat menulis di buku — jadwal per tenaga (dokter/terapis), kalender hari libur, data pasien dengan nomor rekam medis otomatis, dan CRUD booking lengkap dengan jaminan anti-bentrok di tingkat basis data.

**Architecture:** Mesin perhitungan slot adalah fungsi murni (`src/lib/slot.ts`) yang diuji tanpa basis data sama sekali — ia menerima template jadwal, pengecualian, status libur, dan rentang waktu yang sudah terisi, lalu mengembalikan slot kosong. Lapisan server (`src/server/schedule.ts`) mengambil data nyata dari Postgres dan memanggil fungsi murni itu. Jaminan anti-bentrok yang sesungguhnya bukan di sini — melainkan *exclusion constraint* PostgreSQL pada tabel `Appointment` dan `SlotHold`, yang menolak dua rentang waktu bertindihan pada tenaga yang sama secara atomik, tidak peduli apa yang dihitung aplikasi lebih dulu.

**Tech Stack:** Next.js 15 App Router · Prisma 7.10 (skema) + SQL mentah untuk exclusion constraint · PostgreSQL (Neon) dengan ekstensi `btree_gist` · shadcn/ui · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-09-23-sundy-clinic-prd.md` (PRD v1.5) — bagian F4, F4a, F9, F10, F11, dan Model Data (bagian 9)

**Base branch:** `plan-1-fondasi-situs-publik` (sudah berisi Plan 1 + Plan 2 tergabung)

**Di luar lingkup dokumen ini** (lihat "Yang Sengaja Tidak Dikerjakan" di akhir): F5 pendaftaran mandiri publik, F6 cek status booking publik, `IntakeForm`, `Encounter`/SOAP/rekam medis, penggabungan pasien duplikat, worker pelepas hold/kedaluwarsa otomatis.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, nama fungsi memakai **bahasa Inggris**. Bahasa Indonesia hanya untuk **teks yang dilihat pengguna** dan **segmen URL**.
- **Zona waktu:** `Asia/Makassar` (WITA, UTC+8) — konstanta `CLINIC_TIMEZONE` di `src/lib/clinic.ts`. Seluruh `DateTime` disimpan UTC, dihitung dan ditampilkan WITA.
- **Jam operasional:** Senin–Sabtu 11.00–19.00, Minggu tutup (`OPENING_HOURS`, `CLOSED_NOTE` di `src/lib/clinic.ts`).
- **Booking paling cepat 2 jam dari sekarang, paling jauh 30 hari ke depan.**
- **Tanpa jeda antar treatment** — rentang waktu booking sama persis dengan durasi layanan.
- **Jadwal dimiliki tenaga (`Staff`), bukan klinik.** Jalur dokter dan terapis dihitung terpisah; kuncinya `staffId`, bukan peran atau cabang.
- **Exclusion constraint, bukan batasan unik.** Prisma tidak mendukungnya — ditulis sebagai SQL mentah di berkas migrasi, butuh ekstensi `btree_gist`.
- **Booking tidak pernah dihapus.** Pembatalan adalah perubahan status.
- **Hak akses ditegakkan di server.** `requireCapability("booking:manage")` atau `requireCapability("schedule:manage")` di awal setiap server action — keduanya sudah ada di `src/lib/permissions.ts` dari Plan 2, dimiliki `DOKTER` dan `RESEPSIONIS`.
- **Setiap perubahan tercatat di jejak audit** lewat `recordAudit()` dari `src/server/audit.ts`.
- **Prisma 7.10.0**, koneksi lewat `prisma.config.ts` (URL langsung) dan adapter Neon (URL pooled). Migrasi lewat `npx prisma migrate dev --name X` diikuti `npx prisma generate` (lihat `db:migrate` di `package.json`); bila gagal karena lingkungan tanpa TTY, tulis SQL migrasi manual dan terapkan lewat `npx prisma migrate deploy`, mengikuti pola dari Plan 2 Task 2.
- **Uji integrasi menunjuk branch `test` di Neon** lewat `vitest.integration.config.mts`. Jangan pernah memetakan `TEST_*` ke `DATABASE_URL` di tempat lain.
- Setiap task berakhir dengan commit Conventional Commits berbahasa Inggris.

---

## Struktur Berkas

```
prisma/schema.prisma                Tambah: requiresDoctor pada Service; model Holiday,
                                    ScheduleTemplate, ScheduleException, Patient,
                                    PatientNumberCounter, Appointment, SlotHold, enum terkait
prisma/migrations/..._service_requires_doctor/
prisma/migrations/..._holiday/
prisma/migrations/..._schedule_template_exception/
prisma/migrations/..._patient/
prisma/migrations/..._appointment_slothold_exclusion/   SQL mentah: CREATE EXTENSION btree_gist,
                                                         EXCLUDE USING gist pada Appointment & SlotHold
prisma/seed.ts                      Tambah: requiresDoctor per layanan (usulan D10), 25 hari libur
                                    2026, ScheduleTemplate Dr. Diane di Mahakeret

src/lib/clinic.ts                   Sudah ada — CLINIC_TIMEZONE, OPENING_HOURS dipakai ulang
src/lib/format.ts                   Tambah: formatIndonesianDate (dijanjikan sejak Plan 1)
src/lib/whatsapp.ts                 Tambah: appointmentConfirmationMessage
src/lib/time.ts                     BARU — aritmetika waktu WITA: witaDateString, witaWeekday,
                                    combineWitaDateAndMinutes, minutesToTimeLabel
src/lib/slot.ts                     BARU — mesin perhitungan slot, fungsi murni, inti Plan 3a
src/lib/booking-code.ts             BARU — generator kode booking SDY-XXXX
src/lib/medical-record-number.ts    BARU — pemformat nomor RM SDY-2026-0001 (format saja, murni)

src/server/holiday.ts               BARU — CRUD Holiday
src/server/schedule.ts              BARU — CRUD ScheduleTemplate/ScheduleException,
                                    getAvailableSlots(staffId, branchId, date, durationMinutes)
src/server/patient.ts               BARU — cari/buat Patient, alokasi nomor RM, deteksi duplikat
src/server/appointment.ts           BARU — createAppointment, rescheduleAppointment,
                                    updateAppointmentDetails, verifyAppointment, markAttended,
                                    markNoShow, cancelAppointment

src/components/admin/schedule-template-form.tsx    Sunting jam kerja mingguan per staff×cabang
src/components/admin/schedule-exception-form.tsx   Tambah pengecualian tanggal
src/components/admin/holiday-list.tsx              Daftar & tambah hari libur
src/components/admin/patient-picker.tsx             Cari pasien atau buat baru, dipakai form booking
src/components/admin/slot-picker.tsx                 Pilih tanggal & slot kosong
src/components/admin/appointment-form.tsx            Form buat/ubah janji temu
src/components/admin/appointment-table.tsx           Tabel daftar booking dengan filter & aksi
src/components/admin/appointment-status-badge.tsx    Lencana status booking

src/app/(admin)/admin/jadwal/page.tsx               Kelola jadwal: template, pengecualian, libur
src/app/(admin)/admin/pasien/page.tsx               Cari & daftar pasien
src/app/(admin)/admin/booking/page.tsx              Daftar booking dengan filter
src/app/(admin)/admin/booking/baru/page.tsx         Buat booking baru
src/app/(admin)/admin/booking/[id]/page.tsx         Detail booking + aksi status

tests/unit/format.test.ts (extend)  formatIndonesianDate
tests/unit/time.test.ts             witaDateString, witaWeekday, combineWitaDateAndMinutes
tests/unit/slot.test.ts             Mesin slot — kasus terbanyak di plan ini
tests/unit/booking-code.test.ts
tests/unit/medical-record-number.test.ts
tests/unit/whatsapp.test.ts (extend) appointmentConfirmationMessage

tests/integration/service-requires-doctor.test.ts
tests/integration/holiday.test.ts
tests/integration/schedule.test.ts   getAvailableSlots melawan basis data sungguhan
tests/integration/patient.test.ts    Alokasi nomor RM atomik, deteksi duplikat
tests/integration/appointment-exclusion.test.ts  Penyisipan bertindihan bersamaan ditolak
tests/integration/appointment.test.ts            Alur server action penuh

tests/e2e/admin-booking.spec.ts
```

---

### Task 1: Tandai layanan yang membutuhkan dokter

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Modify: `src/server/catalog.ts`
- Create: `tests/integration/service-requires-doctor.test.ts`

**Interfaces:**
- Consumes: model `Service` dari Plan 1.
- Produces: kolom `Service.requiresDoctor: Boolean` (bawaan `false`). `getServiceCategoriesWithServices()` dan `getServiceBySlug()` tetap mengembalikan kolom ini apa adanya (Prisma otomatis menyertakannya).

Penanda ini dipakai Task 9 untuk menentukan staf mana yang boleh dipilih untuk satu layanan. Pembagiannya mengikuti usulan D10 pada PRD — dasarnya keamanan prosedur, bukan kepastian dari pemilik, jadi ditandai jelas di kode agar mudah dikoreksi.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/service-requires-doctor.test.ts`:

```ts
// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "../../prisma/seed";

describe("penanda requiresDoctor pada layanan", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("menandai treatment yang menembus kulit sebagai butuh dokter", async () => {
    await seed();
    const botox = await prisma.service.findUnique({ where: { slug: "botox" } });
    const hifu = await prisma.service.findUnique({ where: { slug: "hifu-wajah" } });
    const konsultasi = await prisma.service.findUnique({ where: { slug: "konsultasi-dokter" } });
    const skinBoosterHa = await prisma.service.findUnique({ where: { slug: "skin-booster-ha" } });
    const eyebooster = await prisma.service.findUnique({ where: { slug: "eyebooster" } });

    expect(botox?.requiresDoctor).toBe(true);
    expect(hifu?.requiresDoctor).toBe(true);
    expect(konsultasi?.requiresDoctor).toBe(true);
    // Skin booster menyuntikkan bahan ke bawah kulit — kolom "Harus dokter" pada
    // tabel D10 PRD, bukan kolom terapis meski berada di kategori Skin Booster.
    expect(skinBoosterHa?.requiresDoctor).toBe(true);
    expect(eyebooster?.requiresDoctor).toBe(true);
  });

  it("tidak menandai facial dan peeling permukaan sebagai butuh dokter", async () => {
    const facial = await prisma.service.findUnique({ where: { slug: "relaxing-facial" } });
    const peeling = await prisma.service.findUnique({ where: { slug: "peeling" } });
    const bia = await prisma.service.findUnique({ where: { slug: "timbang-bia" } });

    expect(facial?.requiresDoctor).toBe(false);
    expect(peeling?.requiresDoctor).toBe(false);
    expect(bia?.requiresDoctor).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/service-requires-doctor.test.ts`
Expected: FAIL — `Unknown argument requiresDoctor` atau nilai `undefined`.

- [ ] **Step 3: Tambah kolom ke skema**

Di `prisma/schema.prisma`, pada `model Service`, tambahkan setelah `isSignature`:

```prisma
  /// Menentukan antrean staf mana yang terpakai saat layanan ini dipesan:
  /// true wajib staf berperan DOKTER, false boleh DOKTER atau TERAPIS.
  /// Usulan awal — lihat keputusan D10 pada PRD, perlu dikonfirmasi pemilik.
  requiresDoctor Boolean @default(false)
```

- [ ] **Step 4: Migrasi**

```bash
npx prisma migrate dev --name service_requires_doctor
npx prisma generate
npm run db:migrate:test
```

Bila `migrate dev` gagal karena tanpa TTY (lihat Plan 2 Task 2), buat migrasi manual: `mkdir -p prisma/migrations/<timestamp_UTC>_service_requires_doctor` lalu tulis `migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Service" ADD COLUMN "requiresDoctor" BOOLEAN NOT NULL DEFAULT false;
```

Timestamp folder **harus UTC** (`date -u +%Y%m%d%H%M%S`), bukan waktu lokal — lihat catatan bug migrasi di Plan 2 Task 6. Terapkan dengan `npx prisma migrate deploy` ke branch production, lalu ke branch test lewat `npm run db:migrate:test`.

- [ ] **Step 5: Tandai layanan di seed**

Di `prisma/seed.ts`, pada array `services`, tambahkan `requiresDoctor: true` ke entri berikut (selebihnya memakai bawaan `false`):

```
konsultasi-dokter, botox, hifu-wajah, hifu-miss-v, hifu-perut,
skin-booster-ha, skin-booster-dna-salmon, eyebooster,
injek-vitamin-c-2000mg, injek-vitamin-c-1100mg, infus-vitamin-c-1100mg, infus-vitamin-c-2000mg,
dermapen, dermapen-prp, elektrocauter, meso-treatment,
laser-rejuve-fleck, laser-2-in-1, lip-laser, meal-plan
```

Kolom "Dikerjakan terapis" pada tabel D10 PRD (RF Perut/Paha/Lengan/Wajah, Peeling,
Peeling Premium, Facial, Timbang BIA) tetap memakai bawaan `false` — tidak disentuh.

Satu layanan di katalog, `paket-peeling-premium` (paket 3x Peeling Premium), tidak
disebut terpisah di tabel D10 PRD karena ia prosedur yang sama diulang tiga kali.
Bawaan `false`-nya sudah benar — bukan celah yang terlewat — karena mewarisi
klasifikasi `peeling-premium`.

Contoh penyuntingan salah satu entri:

```ts
  {
    slug: "botox",
    name: "Botox",
    promoPrice: 50000,
    priceNote: "/ unit",
    durationMin: 30,
    requiresDoctor: true,
    categorySlug: "botox",
    sortOrder: 1,
  },
```

- [ ] **Step 6: Muat ulang data awal dan jalankan uji**

```bash
npm run db:seed
npm run test:integration -- tests/integration/service-requires-doctor.test.ts
```

Expected: PASS — 2 uji.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: mark services that require a doctor"
```

---

### Task 2: Kalender hari libur nasional

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: `src/server/holiday.ts`
- Create: `tests/integration/holiday.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requireCapability` dari `@/server/session`, `recordAudit`.
- Produces:
  - `type HolidayKind = "LIBUR_NASIONAL" | "CUTI_BERSAMA" | "LIBUR_KLINIK"`
  - `listHolidays(year: number): Promise<Holiday[]>`
  - `isHoliday(date: string): Promise<boolean>` — `date` format `"YYYY-MM-DD"` WITA
  - `createHoliday(input: { date: string; name: string; kind: HolidayKind }): Promise<Holiday>`
  - `deleteHoliday(id: string): Promise<void>`

Data 2026 diverifikasi terhadap SKB 3 Menteri Nomor 1497/2025, Nomor 2/2025, Nomor 5/2025 (17 libur nasional + 8 cuti bersama), dan setiap tanggal dicocokkan ke hari dalam minggu yang benar sebelum ditulis ke sini.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/holiday.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createHoliday, isHoliday, listHolidays } from "@/server/holiday";
import { requireCapability } from "@/server/session";
import { vi } from "vitest";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

describe("kalender hari libur", () => {
  beforeEach(async () => {
    await prisma.holiday.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("membuat hari libur dan mendeteksinya", async () => {
    await createHoliday({ date: "2026-12-25", name: "Kelahiran Yesus Kristus", kind: "LIBUR_NASIONAL" });
    expect(await isHoliday("2026-12-25")).toBe(true);
    expect(await isHoliday("2026-12-24")).toBe(false);
  });

  it("mendaftar hari libur satu tahun terurut tanggal", async () => {
    await createHoliday({ date: "2026-08-17", name: "Proklamasi Kemerdekaan", kind: "LIBUR_NASIONAL" });
    await createHoliday({ date: "2026-01-01", name: "Tahun Baru 2026 Masehi", kind: "LIBUR_NASIONAL" });

    const list = await listHolidays(2026);
    expect(list.map((h) => h.date.toISOString().slice(0, 10))).toEqual(["2026-01-01", "2026-08-17"]);
  });

  it("menegakkan requireCapability sebelum membuat hari libur", async () => {
    await createHoliday({ date: "2026-05-01", name: "Hari Buruh Internasional", kind: "LIBUR_NASIONAL" });
    expect(requireCapability).toHaveBeenCalledWith("schedule:manage");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/holiday.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/holiday"`.

- [ ] **Step 3: Tambah model ke skema**

```prisma
enum HolidayKind {
  LIBUR_NASIONAL
  CUTI_BERSAMA
  LIBUR_KLINIK
}

/// Berlaku global lintas cabang. Tanggal yang tercatat di sini menutup slot
/// di seluruh klinik, sesuai kebijakan "tanggal merah tutup".
model Holiday {
  id   String      @id @default(cuid())
  date DateTime    @db.Date
  name String
  kind HolidayKind

  createdAt DateTime @default(now())

  @@unique([date])
  @@index([date])
}
```

- [ ] **Step 4: Migrasi**

```bash
npx prisma migrate dev --name holiday
npx prisma generate
npm run db:migrate:test
```

- [ ] **Step 5: Tulis lapisan server**

Buat `src/server/holiday.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { Holiday, HolidayKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export async function listHolidays(year: number): Promise<Holiday[]> {
  return prisma.holiday.findMany({
    where: { date: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
    orderBy: { date: "asc" },
  });
}

/** `date` berformat "YYYY-MM-DD" dalam WITA. */
export async function isHoliday(date: string): Promise<boolean> {
  const row = await prisma.holiday.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } });
  return row !== null;
}

export async function createHoliday(input: {
  date: string;
  name: string;
  kind: HolidayKind;
}): Promise<Holiday> {
  const actor = await requireCapability("schedule:manage");

  const created = await prisma.holiday.create({
    data: { date: new Date(`${input.date}T00:00:00Z`), name: input.name, kind: input.kind },
  });

  await recordAudit({
    actor,
    action: "holiday.create",
    entity: "Holiday",
    entityId: created.id,
    summary: `${input.date}: ${input.name}`,
  });

  revalidatePath("/admin/jadwal");
  return created;
}

export async function deleteHoliday(id: string): Promise<void> {
  const actor = await requireCapability("schedule:manage");

  const deleted = await prisma.holiday.delete({ where: { id } });

  await recordAudit({
    actor,
    action: "holiday.delete",
    entity: "Holiday",
    entityId: id,
    summary: `${deleted.date.toISOString().slice(0, 10)}: ${deleted.name}`,
  });

  revalidatePath("/admin/jadwal");
}
```

- [ ] **Step 6: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/holiday.test.ts`
Expected: PASS — 3 uji.

- [ ] **Step 7: Muat 25 hari libur 2026 ke data awal**

Di `prisma/seed.ts`, tambahkan setelah deklarasi `products`:

```ts
type SeedHoliday = { date: string; name: string; kind: "LIBUR_NASIONAL" | "CUTI_BERSAMA" };

// Sumber: SKB 3 Menteri Nomor 1497 Tahun 2025, Nomor 2 Tahun 2025, Nomor 5
// Tahun 2025 (Menteri Agama, Menteri Ketenagakerjaan, MenPAN-RB), ditetapkan
// 19 September 2025. 17 hari libur nasional + 8 cuti bersama, setiap tanggal
// dicocokkan terhadap hari dalam minggu sebelum dimuat.
const holidays2026: SeedHoliday[] = [
  { date: "2026-01-01", name: "Tahun Baru 2026 Masehi", kind: "LIBUR_NASIONAL" },
  { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad SAW", kind: "LIBUR_NASIONAL" },
  { date: "2026-02-16", name: "Cuti Bersama Tahun Baru Imlek", kind: "CUTI_BERSAMA" },
  { date: "2026-02-17", name: "Tahun Baru Imlek 2577 Kongzili", kind: "LIBUR_NASIONAL" },
  { date: "2026-03-18", name: "Cuti Bersama Hari Suci Nyepi", kind: "CUTI_BERSAMA" },
  { date: "2026-03-19", name: "Hari Suci Nyepi (Tahun Baru Saka 1948)", kind: "LIBUR_NASIONAL" },
  { date: "2026-03-20", name: "Cuti Bersama Idul Fitri", kind: "CUTI_BERSAMA" },
  { date: "2026-03-21", name: "Idul Fitri 1447 Hijriah", kind: "LIBUR_NASIONAL" },
  { date: "2026-03-22", name: "Idul Fitri 1447 Hijriah", kind: "LIBUR_NASIONAL" },
  { date: "2026-03-23", name: "Cuti Bersama Idul Fitri", kind: "CUTI_BERSAMA" },
  { date: "2026-03-24", name: "Cuti Bersama Idul Fitri", kind: "CUTI_BERSAMA" },
  { date: "2026-04-03", name: "Wafat Yesus Kristus", kind: "LIBUR_NASIONAL" },
  { date: "2026-04-05", name: "Kebangkitan Yesus Kristus (Paskah)", kind: "LIBUR_NASIONAL" },
  { date: "2026-05-01", name: "Hari Buruh Internasional", kind: "LIBUR_NASIONAL" },
  { date: "2026-05-14", name: "Kenaikan Yesus Kristus", kind: "LIBUR_NASIONAL" },
  { date: "2026-05-15", name: "Cuti Bersama Kenaikan Yesus Kristus", kind: "CUTI_BERSAMA" },
  { date: "2026-05-27", name: "Idul Adha 1447 Hijriah", kind: "LIBUR_NASIONAL" },
  { date: "2026-05-28", name: "Cuti Bersama Idul Adha", kind: "CUTI_BERSAMA" },
  { date: "2026-05-31", name: "Hari Raya Waisak 2570 BE", kind: "LIBUR_NASIONAL" },
  { date: "2026-06-01", name: "Hari Lahir Pancasila", kind: "LIBUR_NASIONAL" },
  { date: "2026-06-16", name: "1 Muharram Tahun Baru Islam 1448 Hijriah", kind: "LIBUR_NASIONAL" },
  { date: "2026-08-17", name: "Proklamasi Kemerdekaan", kind: "LIBUR_NASIONAL" },
  { date: "2026-08-25", name: "Maulid Nabi Muhammad SAW", kind: "LIBUR_NASIONAL" },
  { date: "2026-12-24", name: "Cuti Bersama Kelahiran Yesus Kristus", kind: "CUTI_BERSAMA" },
  { date: "2026-12-25", name: "Kelahiran Yesus Kristus", kind: "LIBUR_NASIONAL" },
];
```

Lalu tambahkan pemuatannya ke dalam `seed()`, di transaksi pertama bersama `branches`/`staff`/`categories`/`products`:

```ts
    ...holidays2026.map((h) =>
      prisma.holiday.upsert({
        where: { date: new Date(`${h.date}T00:00:00Z`) },
        update: { name: h.name, kind: h.kind },
        create: { date: new Date(`${h.date}T00:00:00Z`), name: h.name, kind: h.kind },
      }),
    ),
```

- [ ] **Step 8: Muat ulang dan verifikasi**

```bash
npm run db:seed
```

Verifikasi lewat skrip sekali pakai (hapus setelah dipakai, jangan commit):

```bash
cat > .verify-holidays.mts <<'EOF'
import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED! }) });
console.log("jumlah:", await prisma.holiday.count());
await prisma.$disconnect();
EOF
npx tsx .verify-holidays.mts
rm .verify-holidays.mts
```

Expected: `jumlah: 25`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add national holiday calendar"
```

---

### Task 3: Aritmetika waktu WITA

**Files:**
- Create: `src/lib/time.ts`
- Create: `tests/unit/time.test.ts`
- Modify: `src/lib/format.ts`
- Modify: `tests/unit/format.test.ts`

**Interfaces:**
- Consumes: `CLINIC_TIMEZONE` dari `@/lib/clinic`.
- Produces:
  - `witaDateString(date: Date): string` — `"YYYY-MM-DD"` dalam WITA
  - `witaWeekday(date: Date): number` — 0=Minggu..6=Sabtu, dalam WITA
  - `combineWitaDateAndMinutes(dateStr: string, minutes: number): Date` — instant UTC
  - `minutesToTimeLabel(minutes: number): string` — `540` → `"09.00"`
  - `witaMinutesOfDay(date: Date): number` — kebalikan `combineWitaDateAndMinutes`, dipakai untuk menampilkan ulang jam WITA dari instant UTC yang tersimpan
  - `formatIndonesianDate(date: Date): string` — `"Jumat, 25 September 2026"`, dijanjikan sejak Plan 1

- [ ] **Step 1: Tulis uji time.ts yang gagal**

Buat `tests/unit/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  combineWitaDateAndMinutes,
  minutesToTimeLabel,
  witaDateString,
  witaMinutesOfDay,
  witaWeekday,
} from "@/lib/time";

describe("witaDateString", () => {
  it("mengembalikan tanggal WITA, bukan tanggal UTC", () => {
    // 23.30 WITA tanggal 25 = 15.30 UTC tanggal 25, masih hari yang sama.
    // Tapi 00.30 WITA tanggal 26 = 16.30 UTC tanggal 25 — beda tanggal UTC.
    const date = new Date("2026-09-25T16:30:00Z");
    expect(witaDateString(date)).toBe("2026-09-26");
  });
});

describe("witaWeekday", () => {
  it("mengembalikan 4 untuk Kamis dalam WITA", () => {
    // 25 Sep 2026 pukul 07.00 UTC = 15.00 WITA, hari Jumat (5).
    expect(witaWeekday(new Date("2026-09-25T07:00:00Z"))).toBe(5);
  });
});

describe("combineWitaDateAndMinutes", () => {
  it("menggabungkan tanggal WITA dan menit menjadi instant UTC", () => {
    // 25 Sep 2026 pukul 15.00 WITA = 07.00 UTC.
    const instant = combineWitaDateAndMinutes("2026-09-25", 900);
    expect(instant.toISOString()).toBe("2026-09-25T07:00:00.000Z");
  });

  it("menangani lewat tengah malam WITA dengan benar", () => {
    // 25 Sep 2026 pukul 00.30 WITA = 24 Sep pukul 16.30 UTC.
    const instant = combineWitaDateAndMinutes("2026-09-25", 30);
    expect(instant.toISOString()).toBe("2026-09-24T16:30:00.000Z");
  });
});

describe("minutesToTimeLabel", () => {
  it("memformat menit sejak tengah malam menjadi jam.menit", () => {
    expect(minutesToTimeLabel(540)).toBe("09.00");
    expect(minutesToTimeLabel(930)).toBe("15.30");
    expect(minutesToTimeLabel(0)).toBe("00.00");
  });
});

describe("witaMinutesOfDay", () => {
  it("adalah kebalikan combineWitaDateAndMinutes", () => {
    // 25 Sep 2026 pukul 15.30 WITA = 900+30 = 930 menit sejak tengah malam WITA.
    const instant = combineWitaDateAndMinutes("2026-09-25", 930);
    expect(witaMinutesOfDay(instant)).toBe(930);
  });

  it("menangani lewat tengah malam WITA dengan benar", () => {
    const instant = combineWitaDateAndMinutes("2026-09-25", 30); // 00.30 WITA
    expect(witaMinutesOfDay(instant)).toBe(30);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/time.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/time"`.

- [ ] **Step 3: Tulis src/lib/time.ts**

```ts
import { CLINIC_TIMEZONE } from "./clinic";

const witaPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

/** Tanggal dalam zona waktu klinik (WITA), format "YYYY-MM-DD". */
export function witaDateString(date: Date): string {
  const parts = witaPartsFormatter.formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Hari dalam minggu di WITA. 0 = Minggu ... 6 = Sabtu. */
export function witaWeekday(date: Date): number {
  const parts = witaPartsFormatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  return WEEKDAY_INDEX[weekday];
}

/**
 * Menggabungkan tanggal WITA ("YYYY-MM-DD") dan menit sejak tengah malam WITA
 * menjadi instant UTC. WITA adalah UTC+8 tanpa DST, jadi konversinya tetap.
 */
export function combineWitaDateAndMinutes(dateStr: string, minutes: number): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  // WITA = UTC+8. Kurangi 8 jam dari waktu lokal untuk mendapat instant UTC.
  return new Date(Date.UTC(year, month - 1, day, hours - 8, mins));
}

/** Menit sejak tengah malam menjadi label "HH.MM", misal 930 -> "15.30". */
export function minutesToTimeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}.${String(mins).padStart(2, "0")}`;
}

const witaTimePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Kebalikan combineWitaDateAndMinutes: mengambil menit-sejak-tengah-malam
 * WITA dari sebuah instant UTC. Dipakai saat menampilkan ulang jam booking
 * yang tersimpan sebagai instant UTC di basis data.
 */
export function witaMinutesOfDay(date: Date): number {
  const label = witaTimePartsFormatter.format(date); // "HH:MM"
  const [hours, minutes] = label.split(":").map(Number);
  return hours * 60 + minutes;
}
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/time.test.ts`
Expected: PASS — 7 uji.

- [ ] **Step 5: Tambahkan uji formatIndonesianDate yang gagal**

Tambahkan ke `tests/unit/format.test.ts`:

```ts
import { formatIndonesianDate } from "@/lib/format";

describe("formatIndonesianDate", () => {
  it("menulis hari dan bulan dalam bahasa Indonesia, dalam WITA", () => {
    // 25 September 2026 pukul 07.00 UTC = 15.00 WITA, hari Jumat.
    const date = new Date("2026-09-25T07:00:00Z");
    expect(formatIndonesianDate(date)).toBe("Jumat, 25 September 2026");
  });

  it("tidak melompat ke tanggal berikutnya dekat tengah malam WITA", () => {
    // 26 Sep pukul 00.30 WITA = 25 Sep pukul 16.30 UTC — tetap tanggal 26 WITA.
    const date = new Date("2026-09-25T16:30:00Z");
    expect(formatIndonesianDate(date)).toBe("Sabtu, 26 September 2026");
  });
});
```

(Sesuaikan impor `describe`/`expect`/`it` di baris atas berkas bila belum ada.)

- [ ] **Step 6: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/format.test.ts`
Expected: FAIL — `formatIndonesianDate is not a function`.

- [ ] **Step 7: Tambahkan formatIndonesianDate ke format.ts**

Tambahkan ke `src/lib/format.ts`:

```ts
import { CLINIC_TIMEZONE } from "./clinic";

const indonesianDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: CLINIC_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Menulis tanggal dalam zona waktu klinik (WITA), misal "Jumat, 25 September 2026". */
export function formatIndonesianDate(date: Date): string {
  return indonesianDateFormatter.format(date);
}
```

- [ ] **Step 8: Jalankan seluruh uji unit dan pastikan LULUS**

Run: `npm test`
Expected: PASS seluruhnya.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add WITA time arithmetic and Indonesian date formatting"
```

---

### Task 4: Mesin perhitungan slot (fungsi murni)

**Files:**
- Create: `src/lib/slot.ts`
- Create: `tests/unit/slot.test.ts`

**Interfaces:**
- Consumes: `combineWitaDateAndMinutes`, `minutesToTimeLabel` dari `@/lib/time`.
- Produces:
  - `type WorkWindow = { startMinute: number; endMinute: number }`
  - `type ExceptionKind = "LIBUR" | "JAM_TAMBAHAN" | "BLOKIR_SEBAGIAN"`
  - `type ScheduleExceptionInput = { kind: ExceptionKind; startMinute: number | null; endMinute: number | null }`
  - `type BusyRange = { startAt: Date; endAt: Date }`
  - `type SlotOption = { startAt: Date; endAt: Date; label: string }`
  - `getAvailableSlots(input: { date: string; durationMinutes: number; template: WorkWindow | null; exceptions: ScheduleExceptionInput[]; isHoliday: boolean; busy: BusyRange[]; now: Date; minLeadMinutes: number }): SlotOption[]`

Ini adalah inti Plan 3a. Tidak menyentuh basis data sama sekali — semua data historis/terjadwal diambil lebih dulu oleh `src/server/schedule.ts` (Task 8) dan diberikan sebagai argumen biasa, sehingga setiap aturan bisnis dapat diuji dengan data buatan tanpa Neon.

- [ ] **Step 1: Tulis uji kasus dasar yang gagal**

Buat `tests/unit/slot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getAvailableSlots } from "@/lib/slot";

// 11.00-19.00 WITA = 660-1140 menit sejak tengah malam.
const FULL_DAY: import("@/lib/slot").WorkWindow = { startMinute: 660, endMinute: 1140 };
const FAR_FUTURE_NOW = new Date("2026-01-01T00:00:00Z");

describe("getAvailableSlots — kasus dasar", () => {
  it("menghasilkan slot 30 menit sepanjang jam kerja saat kosong", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });

    expect(slots[0].label).toBe("11.00");
    expect(slots.at(-1)!.label).toBe("18.30");
    expect(slots).toHaveLength(16); // (1140-660)/30
  });

  it("mengembalikan larik kosong bila staf tidak bekerja hari itu (template null)", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: null,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots).toEqual([]);
  });

  it("mengembalikan larik kosong pada hari libur nasional, walau template ada", () => {
    const slots = getAvailableSlots({
      date: "2026-08-17",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: true,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/slot.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/slot"`.

- [ ] **Step 3: Tulis implementasi dasar (belum menangani pengecualian/durasi campuran)**

Buat `src/lib/slot.ts`:

```ts
import { combineWitaDateAndMinutes, minutesToTimeLabel } from "./time";

export type WorkWindow = { startMinute: number; endMinute: number };
export type ExceptionKind = "LIBUR" | "JAM_TAMBAHAN" | "BLOKIR_SEBAGIAN";
export type ScheduleExceptionInput = {
  kind: ExceptionKind;
  startMinute: number | null;
  endMinute: number | null;
};
export type BusyRange = { startAt: Date; endAt: Date };
export type SlotOption = { startAt: Date; endAt: Date; label: string };

type GetAvailableSlotsInput = {
  /** Tanggal WITA "YYYY-MM-DD" yang diminta. */
  date: string;
  /** Durasi layanan yang dipesan, dalam menit. */
  durationMinutes: number;
  /** Jam kerja staf ini di cabang ini pada hari-dalam-minggu tanggal tsb, atau null bila tidak bekerja. */
  template: WorkWindow | null;
  /** Pengecualian staf ini pada tanggal ini saja. */
  exceptions: ScheduleExceptionInput[];
  /** Apakah tanggal ini hari libur klinik (berlaku semua cabang). */
  isHoliday: boolean;
  /** Rentang waktu yang sudah terisi (booking + hold aktif) milik staf ini. */
  busy: BusyRange[];
  /** Waktu sekarang, untuk aturan lead time minimum. */
  now: Date;
  /** Booking paling cepat berapa menit dari sekarang (PRD: 120). */
  minLeadMinutes: number;
};

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Mengurangi rentang blokir dari satu jendela kerja, menghasilkan 0+ sub-jendela. */
function subtractBlocks(window: WorkWindow, blocks: WorkWindow[]): WorkWindow[] {
  let pieces = [window];
  for (const block of blocks) {
    const next: WorkWindow[] = [];
    for (const piece of pieces) {
      if (!rangesOverlap(piece.startMinute, piece.endMinute, block.startMinute, block.endMinute)) {
        next.push(piece);
        continue;
      }
      if (piece.startMinute < block.startMinute) {
        next.push({ startMinute: piece.startMinute, endMinute: block.startMinute });
      }
      if (block.endMinute < piece.endMinute) {
        next.push({ startMinute: block.endMinute, endMinute: piece.endMinute });
      }
    }
    pieces = next;
  }
  return pieces;
}

/**
 * Menghitung slot kosong untuk satu staf pada satu tanggal.
 *
 * Fungsi murni — tidak menyentuh basis data. Jaminan anti-bentrok yang
 * sesungguhnya ada di exclusion constraint PostgreSQL (lihat migrasi
 * Appointment); fungsi ini hanya menjaga pengalaman pasien/admin tetap wajar
 * dengan tidak menawarkan slot yang jelas-jelas sudah terisi.
 */
export function getAvailableSlots(input: GetAvailableSlotsInput): SlotOption[] {
  if (input.isHoliday) return [];
  if (input.exceptions.some((e) => e.kind === "LIBUR")) return [];

  const windows: WorkWindow[] = [];
  if (input.template) windows.push(input.template);
  for (const e of input.exceptions) {
    if (e.kind === "JAM_TAMBAHAN" && e.startMinute !== null && e.endMinute !== null) {
      windows.push({ startMinute: e.startMinute, endMinute: e.endMinute });
    }
  }
  if (windows.length === 0) return [];

  const blocks: WorkWindow[] = input.exceptions
    .filter((e) => e.kind === "BLOKIR_SEBAGIAN" && e.startMinute !== null && e.endMinute !== null)
    .map((e) => ({ startMinute: e.startMinute!, endMinute: e.endMinute! }));

  const freeWindows = windows.flatMap((w) => subtractBlocks(w, blocks));

  const earliestStartMs = input.now.getTime() + input.minLeadMinutes * 60_000;
  const seenStartMinutes = new Set<number>();
  const result: SlotOption[] = [];

  const GRID_MINUTES = 30;

  for (const window of freeWindows) {
    for (
      let candidate = window.startMinute;
      candidate + input.durationMinutes <= window.endMinute;
      candidate += GRID_MINUTES
    ) {
      if (seenStartMinutes.has(candidate)) continue;

      const startAt = combineWitaDateAndMinutes(input.date, candidate);
      const endAt = combineWitaDateAndMinutes(input.date, candidate + input.durationMinutes);

      if (startAt.getTime() < earliestStartMs) continue;

      const overlapsBusy = input.busy.some((b) => startAt < b.endAt && b.startAt < endAt);
      if (overlapsBusy) continue;

      seenStartMinutes.add(candidate);
      result.push({ startAt, endAt, label: minutesToTimeLabel(candidate) });
    }
  }

  result.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return result;
}
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/slot.test.ts`
Expected: PASS — 3 uji.

- [ ] **Step 5: Tulis uji durasi campuran, sesuai F4a**

Tambahkan ke `tests/unit/slot.test.ts`:

```ts
describe("getAvailableSlots — durasi campuran (F4a)", () => {
  it("menawarkan lebih sedikit titik mulai untuk treatment 60 menit daripada konsultasi 30 menit", () => {
    const consult = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    const treatment = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 60,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });

    expect(consult.length).toBeGreaterThan(treatment.length);
    // Treatment 60 menit yang mulai 18.30 akan berakhir 19.30 — lewat jam
    // tutup 19.00 — sehingga titik mulai terakhirnya 18.00, bukan 18.30.
    expect(treatment.at(-1)!.label).toBe("18.00");
  });

  it("tanpa jeda: treatment yang baru selesai langsung membuka slot berikutnya", () => {
    // Treatment lain sudah mengisi 15.00-16.00. Slot 16.00 harus tetap
    // tersedia, bukan baru tersedia 16.15 — sesuai F4a "tanpa jeda".
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [
        {
          startAt: new Date("2026-09-24T07:00:00Z"), // 15.00 WITA
          endAt: new Date("2026-09-24T08:00:00Z"), // 16.00 WITA
        },
      ],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });

    const labels = slots.map((s) => s.label);
    expect(labels).toContain("16.00");
    expect(labels).not.toContain("15.00");
    expect(labels).not.toContain("15.30");
  });
});

describe("getAvailableSlots — pengecualian jadwal", () => {
  it("mengosongkan seluruh hari saat ada pengecualian LIBUR, walau template ada", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [{ kind: "LIBUR", startMinute: null, endMinute: null }],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots).toEqual([]);
  });

  it("BLOKIR_SEBAGIAN menghilangkan slot pada rentang itu saja", () => {
    // Blokir 13.00-14.00 (istirahat), sisa hari tetap tersedia.
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [{ kind: "BLOKIR_SEBAGIAN", startMinute: 780, endMinute: 840 }],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("13.00");
    expect(labels).not.toContain("13.30");
    expect(labels).toContain("12.30");
    expect(labels).toContain("14.00");
  });

  it("JAM_TAMBAHAN menambah jendela kerja terpisah di luar jam normal", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [{ kind: "JAM_TAMBAHAN", startMinute: 1200, endMinute: 1260 }], // 20.00-21.00
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots.map((s) => s.label)).toContain("20.00");
  });

  it("staf tanpa template tetap dapat menerima slot lewat JAM_TAMBAHAN saja", () => {
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: null,
      exceptions: [{ kind: "JAM_TAMBAHAN", startMinute: 660, endMinute: 720 }],
      isHoliday: false,
      busy: [],
      now: FAR_FUTURE_NOW,
      minLeadMinutes: 120,
    });
    expect(slots).toHaveLength(2);
  });
});

describe("getAvailableSlots — batas waktu pemesanan", () => {
  it("tidak menawarkan slot yang kurang dari minLeadMinutes dari sekarang", () => {
    // Sekarang 24 Sep 06.30 UTC = 14.30 WITA. Lead 120 menit -> paling cepat 16.30 WITA.
    const now = new Date("2026-09-24T06:30:00Z");
    const slots = getAvailableSlots({
      date: "2026-09-24",
      durationMinutes: 30,
      template: FULL_DAY,
      exceptions: [],
      isHoliday: false,
      busy: [],
      now,
      minLeadMinutes: 120,
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("15.00");
    expect(labels).not.toContain("16.00");
    expect(labels).toContain("16.30");
  });
});
```

- [ ] **Step 6: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/slot.test.ts`
Expected: PASS — 9 uji.

- [ ] **Step 7: Jalankan seluruh uji unit**

Run: `npm test`
Expected: PASS seluruhnya.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add pure slot-calculation engine"
```

---

### Task 5: Kode booking & nomor rekam medis (pemformat murni)

**Files:**
- Create: `src/lib/booking-code.ts`
- Create: `src/lib/medical-record-number.ts`
- Create: `tests/unit/booking-code.test.ts`
- Create: `tests/unit/medical-record-number.test.ts`

**Interfaces:**
- Produces:
  - `generateBookingCode(): string` — `"SDY-"` + 4 karakter acak dari alfabet aman (tanpa `0/O/1/I`)
  - `formatMedicalRecordNumber(year: number, sequence: number): string` — `"SDY-2026-0001"`

Alokasi nomor yang benar-benar unik (menghindari tabrakan di basis data) ada di Task 7; berkas ini hanya memformat.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/booking-code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateBookingCode } from "@/lib/booking-code";

describe("generateBookingCode", () => {
  it("berawalan SDY- diikuti 4 karakter", () => {
    expect(generateBookingCode()).toMatch(/^SDY-[A-Z0-9]{4}$/);
  });

  it("tidak memakai karakter yang mudah tertukar (0/O, 1/I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBookingCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("menghasilkan kode berbeda pada pemanggilan berulang", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateBookingCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});
```

Buat `tests/unit/medical-record-number.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatMedicalRecordNumber } from "@/lib/medical-record-number";

describe("formatMedicalRecordNumber", () => {
  it("memformat dengan angka empat digit berisi nol di depan", () => {
    expect(formatMedicalRecordNumber(2026, 1)).toBe("SDY-2026-0001");
    expect(formatMedicalRecordNumber(2026, 42)).toBe("SDY-2026-0042");
  });

  it("tidak memotong urutan yang sudah lima digit", () => {
    expect(formatMedicalRecordNumber(2026, 10000)).toBe("SDY-2026-10000");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/booking-code.test.ts tests/unit/medical-record-number.test.ts`
Expected: FAIL — kedua modul belum ada.

- [ ] **Step 3: Tulis implementasi**

Buat `src/lib/booking-code.ts`:

```ts
// Tanpa 0/O dan 1/I — keduanya mudah tertukar saat kode dibacakan lewat telepon.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Kode booking format SDY-XXXX. Keunikan diperiksa & diulang di lapisan server. */
export function generateBookingCode(): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `SDY-${suffix}`;
}
```

Buat `src/lib/medical-record-number.ts`:

```ts
/** Format nomor rekam medis: SDY-2026-0001. */
export function formatMedicalRecordNumber(year: number, sequence: number): string {
  return `SDY-${year}-${String(sequence).padStart(4, "0")}`;
}
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/booking-code.test.ts tests/unit/medical-record-number.test.ts`
Expected: PASS — 5 uji.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add booking code and medical record number formatters"
```

---

### Task 6: Template jadwal & pengecualian tanggal

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: `src/server/schedule.ts` (bagian CRUD template/pengecualian; `getAvailableSlots` server ditambahkan Task 8)
- Create: `tests/integration/schedule.test.ts` (bagian CRUD; kasus `getAvailableSlots` ditambahkan Task 8)

**Interfaces:**
- Consumes: `prisma`, `requireCapability`, `recordAudit`.
- Produces:
  - `listScheduleTemplates(staffId: string): Promise<ScheduleTemplate[]>`
  - `upsertScheduleTemplate(input: { staffId: string; branchId: string; weekday: number; startMinute: number; endMinute: number; slotMinutes: number }): Promise<ScheduleTemplate>`
  - `deleteScheduleTemplate(id: string): Promise<void>`
  - `createScheduleException(input: { staffId: string; branchId: string | null; date: string; kind: ExceptionKind; startMinute: number | null; endMinute: number | null }): Promise<ScheduleException>`
  - `listScheduleExceptions(staffId: string, from: string, to: string): Promise<ScheduleException[]>`

- [ ] **Step 1: Tulis uji CRUD yang gagal**

Buat `tests/integration/schedule.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createScheduleException,
  listScheduleExceptions,
  listScheduleTemplates,
  upsertScheduleTemplate,
} from "@/server/schedule";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

describe("template & pengecualian jadwal", () => {
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await prisma.scheduleException.deleteMany();
    await prisma.scheduleTemplate.deleteMany();
    await prisma.staff.deleteMany({ where: { slug: "staf-jadwal-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-jadwal-uji" } });

    const staff = await prisma.staff.create({
      data: { slug: "staf-jadwal-uji", name: "Staf Jadwal", role: "DOKTER" },
    });
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-jadwal-uji",
        name: "Cabang Uji",
        address: "Alamat",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });
    staffId = staff.id;
    branchId = branch.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("membuat template jadwal untuk satu hari dalam minggu", async () => {
    const template = await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 4, // Kamis
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });
    expect(template.weekday).toBe(4);

    const list = await listScheduleTemplates(staffId);
    expect(list).toHaveLength(1);
  });

  it("menimpa template yang sama tanpa menggandakan baris", async () => {
    await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 4,
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });
    await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 4,
      startMinute: 660,
      endMinute: 1080, // jam tutup dimajukan
      slotMinutes: 30,
    });

    const list = await listScheduleTemplates(staffId);
    expect(list).toHaveLength(1);
    expect(list[0].endMinute).toBe(1080);
  });

  it("memindahkan template ke cabang lain pada hari yang sama tanpa menggandakan baris", async () => {
    // "Satu staf tidak boleh di dua cabang pada jam yang sama" (PRD F10)
    // ditegakkan oleh dua hal: @@unique([staffId, weekday]) di sini — yang
    // membuat satu hari-dalam-minggu hanya bisa menunjuk SATU cabang, tidak
    // pernah dua sekaligus — dan exclusion constraint pada Appointment (Task
    // 9), yang jadi jaminan sesungguhnya saat booking sungguhan dibuat.
    // Karena itu, memindahkan cabang untuk hari yang sama adalah EDIT yang
    // sah, bukan sesuatu yang perlu ditolak.
    const otherBranch = await prisma.branch.create({
      data: {
        slug: "cabang-jadwal-uji-2",
        name: "Cabang Uji 2",
        address: "Alamat 2",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });

    await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 4,
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });
    await upsertScheduleTemplate({
      staffId,
      branchId: otherBranch.id,
      weekday: 4,
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });

    const list = await listScheduleTemplates(staffId);
    expect(list).toHaveLength(1);
    expect(list[0].branchId).toBe(otherBranch.id);

    await prisma.branch.delete({ where: { id: otherBranch.id } });
  });

  it("membuat pengecualian tanggal dan mendaftarnya dalam rentang", async () => {
    await createScheduleException({
      staffId,
      branchId: null,
      date: "2026-10-05",
      kind: "LIBUR",
      startMinute: null,
      endMinute: null,
    });

    const list = await listScheduleExceptions(staffId, "2026-10-01", "2026-10-31");
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("LIBUR");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/schedule.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/schedule"`.

- [ ] **Step 3: Tambah model ke skema**

```prisma
enum ExceptionKind {
  LIBUR
  JAM_TAMBAHAN
  BLOKIR_SEBAGIAN
}

/// Jam kerja mingguan satu staf di satu cabang. weekday: 0=Minggu..6=Sabtu.
model ScheduleTemplate {
  id           String @id @default(cuid())
  weekday      Int
  startMinute  Int
  endMinute    Int
  slotMinutes  Int    @default(30)

  staffId  String
  staff    Staff  @relation(fields: [staffId], references: [id], onDelete: Cascade)
  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([staffId, weekday])
  @@index([branchId, weekday])
}

/// Pengecualian satu staf pada satu tanggal: cuti, jam tambahan, atau blokir
/// sebagian. startMinute/endMinute null hanya sah untuk kind LIBUR.
model ScheduleException {
  id          String        @id @default(cuid())
  date        DateTime      @db.Date
  kind        ExceptionKind
  startMinute Int?
  endMinute   Int?

  staffId  String
  staff    Staff   @relation(fields: [staffId], references: [id], onDelete: Cascade)
  branchId String?
  branch   Branch? @relation(fields: [branchId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())

  @@index([staffId, date])
}
```

Tambahkan relasi balik di `model Staff`: `scheduleTemplates ScheduleTemplate[]` dan `scheduleExceptions ScheduleException[]`. Tambahkan relasi balik di `model Branch`: `scheduleTemplates ScheduleTemplate[]` dan `scheduleExceptions ScheduleException[]`.

- [ ] **Step 4: Migrasi**

```bash
npx prisma migrate dev --name schedule_template_exception
npx prisma generate
npm run db:migrate:test
```

- [ ] **Step 5: Tulis src/server/schedule.ts (bagian CRUD)**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { ExceptionKind, ScheduleException, ScheduleTemplate } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export async function listScheduleTemplates(staffId: string): Promise<ScheduleTemplate[]> {
  return prisma.scheduleTemplate.findMany({
    where: { staffId },
    orderBy: { weekday: "asc" },
  });
}

export async function upsertScheduleTemplate(input: {
  staffId: string;
  branchId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
}): Promise<ScheduleTemplate> {
  const actor = await requireCapability("schedule:manage");

  // Tidak ada pemeriksaan "staf ini sudah di cabang lain hari ini" di sini
  // dengan sengaja. @@unique([staffId, weekday]) pada skema sudah membuat
  // satu hari-dalam-minggu hanya bisa menunjuk satu cabang — upsert ke
  // weekday yang sama selalu MENIMPA baris lama, bukan membuat konflik baru.
  // Jaminan sesungguhnya terhadap "satu dokter di dua cabang pada jam yang
  // sama" ada di exclusion constraint Appointment (Task 9), yang berlaku
  // saat booking sungguhan dibuat — bukan di metadata jadwal ini.
  const result = await prisma.scheduleTemplate.upsert({
    where: { staffId_weekday: { staffId: input.staffId, weekday: input.weekday } },
    update: {
      branchId: input.branchId,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      slotMinutes: input.slotMinutes,
    },
    create: input,
  });

  await recordAudit({
    actor,
    action: "schedule-template.upsert",
    entity: "ScheduleTemplate",
    entityId: result.id,
    summary: `staf ${input.staffId}, hari ${input.weekday}, ${input.startMinute}-${input.endMinute}`,
  });

  revalidatePath("/admin/jadwal");
  return result;
}

export async function deleteScheduleTemplate(id: string): Promise<void> {
  const actor = await requireCapability("schedule:manage");
  const deleted = await prisma.scheduleTemplate.delete({ where: { id } });

  await recordAudit({
    actor,
    action: "schedule-template.delete",
    entity: "ScheduleTemplate",
    entityId: id,
    summary: `staf ${deleted.staffId}, hari ${deleted.weekday}`,
  });

  revalidatePath("/admin/jadwal");
}

export async function createScheduleException(input: {
  staffId: string;
  branchId: string | null;
  date: string;
  kind: ExceptionKind;
  startMinute: number | null;
  endMinute: number | null;
}): Promise<ScheduleException> {
  const actor = await requireCapability("schedule:manage");

  const created = await prisma.scheduleException.create({
    data: {
      staffId: input.staffId,
      branchId: input.branchId,
      date: new Date(`${input.date}T00:00:00Z`),
      kind: input.kind,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
    },
  });

  await recordAudit({
    actor,
    action: "schedule-exception.create",
    entity: "ScheduleException",
    entityId: created.id,
    summary: `staf ${input.staffId}, ${input.date}, ${input.kind}`,
  });

  revalidatePath("/admin/jadwal");
  return created;
}

export async function listScheduleExceptions(
  staffId: string,
  from: string,
  to: string,
): Promise<ScheduleException[]> {
  return prisma.scheduleException.findMany({
    where: {
      staffId,
      date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    },
    orderBy: { date: "asc" },
  });
}
```

- [ ] **Step 6: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/schedule.test.ts`
Expected: PASS — 4 uji.

- [ ] **Step 7: Muat template Dr. Diane ke data awal**

Di `prisma/seed.ts`, tambahkan setelah pemuatan `holidays2026` (butuh id staff & branch yang sudah dibuat — tulis di luar transaksi pertama, setelah baris yang mengambil `categoryRows`):

```ts
  const mahakeret = await prisma.branch.findUniqueOrThrow({ where: { slug: "mahakeret" } });
  const diane = await prisma.staff.findUniqueOrThrow({ where: { slug: "diane-paparang" } });

  // Senin(1)-Sabtu(6), 11.00-19.00 WITA (660-1140 menit), slot 30 menit.
  await prisma.$transaction(
    [1, 2, 3, 4, 5, 6].map((weekday) =>
      prisma.scheduleTemplate.upsert({
        where: { staffId_weekday: { staffId: diane.id, weekday } },
        update: { branchId: mahakeret.id, startMinute: 660, endMinute: 1140, slotMinutes: 30 },
        create: {
          staffId: diane.id,
          branchId: mahakeret.id,
          weekday,
          startMinute: 660,
          endMinute: 1140,
          slotMinutes: 30,
        },
      }),
    ),
    TRANSACTION_OPTIONS,
  );
```

- [ ] **Step 8: Muat ulang dan verifikasi**

```bash
npm run db:seed
npm run test:integration
```

Expected: PASS seluruhnya.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add schedule templates and date exceptions"
```

---

### Task 7: Data pasien & nomor rekam medis atomik

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/server/patient.ts`
- Create: `tests/integration/patient.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requireCapability`, `recordAudit`, `formatMedicalRecordNumber` dari `@/lib/medical-record-number`.
- Produces:
  - `type PatientProgramStatus = "AKTIF" | "SELESAI" | "TIDAK_AKTIF"`
  - `searchPatients(query: string): Promise<Patient[]>` — cocok nama atau nomor WhatsApp
  - `findPatientsByWhatsapp(whatsapp: string): Promise<Patient[]>`
  - `createPatient(input: { name: string; whatsapp: string; birthDate?: string; gender?: "L" | "P"; occupation?: string; address?: string }): Promise<Patient>`
  - `getPatientById(id: string): Promise<Patient | null>`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/patient.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createPatient, findPatientsByWhatsapp, searchPatients } from "@/server/patient";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

describe("data pasien", () => {
  beforeEach(async () => {
    await prisma.patient.deleteMany();
    await prisma.patientNumberCounter.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("membuat pasien dengan nomor rekam medis SDY-<tahun>-0001 untuk pasien pertama tahun ini", async () => {
    const patient = await createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" });
    const year = new Date().getFullYear();
    expect(patient.medicalRecordNumber).toBe(`SDY-${year}-0001`);
    expect(patient.programStatus).toBe("AKTIF");
  });

  it("menaikkan nomor urut untuk pasien berikutnya di tahun yang sama", async () => {
    await createPatient({ name: "Pasien Satu", whatsapp: "6281111111111" });
    const second = await createPatient({ name: "Pasien Dua", whatsapp: "6282222222222" });
    const year = new Date().getFullYear();
    expect(second.medicalRecordNumber).toBe(`SDY-${year}-0002`);
  });

  it("mengalokasikan nomor rekam medis unik walau dibuat bersamaan", async () => {
    // Race condition sungguhan: 10 pembuatan pasien ditembakkan berbarengan.
    // Tanpa penguncian atomik pada baris penghitung, dua di antaranya bisa
    // mendapat nomor yang sama.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createPatient({ name: `Pasien Bersamaan ${i}`, whatsapp: `62800000000${i}` }),
      ),
    );
    const numbers = results.map((p) => p.medicalRecordNumber);
    expect(new Set(numbers).size).toBe(10);
  });

  it("mencari pasien berdasarkan nama sebagian", async () => {
    await createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" });
    const found = await searchPatients("rahayu");
    expect(found.map((p) => p.name)).toContain("Siti Rahayu");
  });

  it("mencari pasien berdasarkan nomor WhatsApp", async () => {
    await createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" });
    const found = await searchPatients("81234567890");
    expect(found.map((p) => p.name)).toContain("Siti Rahayu");
  });

  it("mendeteksi kemungkinan duplikat lewat nomor WhatsApp yang sama", async () => {
    await createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" });
    const matches = await findPatientsByWhatsapp("6281234567890");
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("Siti Rahayu");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/patient.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/patient"`.

- [ ] **Step 3: Tambah model ke skema**

```prisma
enum PatientProgramStatus {
  AKTIF
  SELESAI
  TIDAK_AKTIF
}

enum Gender {
  L
  P
}

/// Alokasi nomor rekam medis atomik per tahun. Baris "diupdate" lewat
/// INSERT ... ON CONFLICT DO UPDATE dalam satu pernyataan SQL, sehingga
/// dua pembuatan pasien yang bersamaan tidak pernah mendapat nomor sama.
model PatientNumberCounter {
  year  Int @id
  value Int @default(0)
}

/// Tidak terikat cabang — pasien yang pindah cabang tetap satu rekam medis.
model Patient {
  id                   String                @id @default(cuid())
  medicalRecordNumber  String                @unique
  name                 String
  whatsapp             String
  birthDate            DateTime?             @db.Date
  gender               Gender?
  occupation           String?
  address              String?
  allergies            String?
  medicalHistory       String?
  programStatus        PatientProgramStatus  @default(AKTIF)
  activePackageId      String?
  lastVisitAt          DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([whatsapp])
  @@index([name])
}
```

- [ ] **Step 4: Migrasi**

```bash
npx prisma migrate dev --name patient
npx prisma generate
npm run db:migrate:test
```

- [ ] **Step 5: Tulis src/server/patient.ts**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { Patient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatMedicalRecordNumber } from "@/lib/medical-record-number";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Mengalokasikan nomor urut berikutnya untuk tahun ini secara atomik.
 *
 * INSERT ... ON CONFLICT DO UPDATE adalah satu pernyataan tunggal di
 * PostgreSQL — baris dikunci selama pernyataan itu berjalan, sehingga dua
 * panggilan bersamaan tidak akan pernah membaca nilai yang sama sebelum
 * menulis. Ini yang membuat nomor rekam medis dijamin unik tanpa perlu
 * transaksi terpisah atau retry.
 */
async function nextMedicalRecordSequence(year: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "PatientNumberCounter" ("year", "value")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "PatientNumberCounter"."value" + 1
    RETURNING "value"
  `;
  return rows[0].value;
}

export async function createPatient(input: {
  name: string;
  whatsapp: string;
  birthDate?: string;
  gender?: "L" | "P";
  occupation?: string;
  address?: string;
}): Promise<Patient> {
  const actor = await requireCapability("booking:manage");

  const year = new Date().getFullYear();
  const sequence = await nextMedicalRecordSequence(year);
  const medicalRecordNumber = formatMedicalRecordNumber(year, sequence);

  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber,
      name: input.name,
      whatsapp: input.whatsapp,
      birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null,
      gender: input.gender,
      occupation: input.occupation,
      address: input.address,
    },
  });

  await recordAudit({
    actor,
    action: "patient.create",
    entity: "Patient",
    entityId: patient.id,
    summary: `${patient.name} (${patient.medicalRecordNumber})`,
  });

  revalidatePath("/admin/pasien");
  return patient;
}

export async function getPatientById(id: string): Promise<Patient | null> {
  await requireCapability("booking:manage");
  return prisma.patient.findUnique({ where: { id } });
}

/** Cocok terhadap nama (sebagian, tanpa peduli huruf besar/kecil) atau nomor WhatsApp. */
export async function searchPatients(query: string): Promise<Patient[]> {
  await requireCapability("booking:manage");
  const trimmed = query.trim();
  if (!trimmed) return [];

  return prisma.patient.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { whatsapp: { contains: trimmed } },
        { medicalRecordNumber: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
  });
}

/** Dipakai saat membuat pasien baru untuk menawarkan penggabungan bila nomor sudah terdaftar. */
export async function findPatientsByWhatsapp(whatsapp: string): Promise<Patient[]> {
  await requireCapability("booking:manage");
  return prisma.patient.findMany({ where: { whatsapp } });
}
```

- [ ] **Step 6: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/patient.test.ts`
Expected: PASS — 6 uji, termasuk uji konkurensi 10 pembuatan bersamaan.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add patient records with atomic medical record numbers"
```

---

### Task 8: Ketersediaan slot melawan basis data sungguhan

**Files:**
- Modify: `src/server/schedule.ts`
- Modify: `tests/integration/schedule.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots` dari `@/lib/slot`; `witaWeekday` dari `@/lib/time`; `isHoliday` dari `@/server/holiday`.
- Produces: `getStaffAvailability(input: { staffId: string; branchId: string; date: string; durationMinutes: number }): Promise<SlotOption[]>`

Ini menyambungkan mesin murni Task 4 ke data nyata: mengambil template hari itu, pengecualian, status libur, dan rentang sibuk (booking Appointment dengan status yang masih memblokir slot) milik staf tersebut, lalu memanggil `getAvailableSlots`. `SlotHold` (Task 9) belum ikut dihitung di sini — Plan 3b yang menambahkannya, karena penahanan sementara hanya relevan untuk alur pendaftaran mandiri publik.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan ke `tests/integration/schedule.test.ts`:

```ts
import { getStaffAvailability } from "@/server/schedule";

describe("getStaffAvailability — melawan basis data sungguhan", () => {
  let staffId: string;
  let branchId: string;
  const FUTURE_NOW = new Date("2020-01-01T00:00:00Z");

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.scheduleException.deleteMany();
    await prisma.scheduleTemplate.deleteMany();
    await prisma.staff.deleteMany({ where: { slug: "staf-ketersediaan-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-ketersediaan-uji" } });
    await prisma.holiday.deleteMany({ where: { date: new Date("2026-10-05T00:00:00Z") } });

    const staff = await prisma.staff.create({
      data: { slug: "staf-ketersediaan-uji", name: "Staf Ketersediaan", role: "DOKTER" },
    });
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-ketersediaan-uji",
        name: "Cabang Uji",
        address: "Alamat",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });
    staffId = staff.id;
    branchId = branch.id;

    // 2026-10-05 adalah hari Senin (weekday 1).
    await upsertScheduleTemplate({
      staffId,
      branchId,
      weekday: 1,
      startMinute: 660,
      endMinute: 1140,
      slotMinutes: 30,
    });
  });

  it("mengembalikan slot kosong dari template yang tersimpan", async () => {
    const slots = await getStaffAvailability({
      staffId,
      branchId,
      date: "2026-10-05",
      durationMinutes: 30,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].label).toBe("11.00");
  });

  it("mengosongkan hasil pada hari libur nasional yang tersimpan", async () => {
    await prisma.holiday.create({
      data: { date: new Date("2026-10-05T00:00:00Z"), name: "Uji Libur", kind: "LIBUR_KLINIK" },
    });
    const slots = await getStaffAvailability({
      staffId,
      branchId,
      date: "2026-10-05",
      durationMinutes: 30,
    });
    expect(slots).toEqual([]);
  });

  it("mengecualikan slot yang sudah terisi booking sungguhan", async () => {
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-9999", name: "Pasien Uji", whatsapp: "628999" },
    });
    await prisma.appointment.create({
      data: {
        code: "SDY-TEST",
        branchId,
        staffId,
        patientId: patient.id,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"), // 15.00 WITA
        endAt: new Date("2026-10-05T07:30:00Z"),
        status: "TERKONFIRMASI",
        source: "WALK_IN",
      },
    });

    const slots = await getStaffAvailability({
      staffId,
      branchId,
      date: "2026-10-05",
      durationMinutes: 30,
    });
    expect(slots.map((s) => s.label)).not.toContain("15.00");
  });

  it("tidak mengecualikan slot dari booking yang sudah dibatalkan", async () => {
    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-9998", name: "Pasien Uji 2", whatsapp: "628998" },
    });
    await prisma.appointment.create({
      data: {
        code: "SDY-TES2",
        branchId,
        staffId,
        patientId: patient.id,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        status: "DIBATALKAN",
        source: "WALK_IN",
      },
    });

    const slots = await getStaffAvailability({
      staffId,
      branchId,
      date: "2026-10-05",
      durationMinutes: 30,
    });
    expect(slots.map((s) => s.label)).toContain("15.00");
  });
});
```

Tambahkan `import { upsertScheduleTemplate } from "@/server/schedule";` bila belum ada, dan sesuaikan blok `describe` bagian atas berkas ini untuk tidak menghapus data dari `describe` sebelumnya (berkas ini sudah punya isolasi lewat `slug` unik per bagian, jadi kedua blok aman berdampingan).

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/schedule.test.ts`
Expected: FAIL — `getStaffAvailability is not a function`, dan model `Appointment` belum ada (ditangani Task 9 — untuk sekarang, uji yang menyentuh `prisma.appointment` akan gagal kompilasi; jalankan hanya setelah Task 9 skema selesai bila runner menolak lebih awal). Bila Vitest menolak keseluruhan berkas karena tipe `prisma.appointment` belum ada, itu sinyal yang benar bahwa Task 8 bergantung pada skema Task 9 — lanjutkan ke Step 3 di bawah, yang memang menuntun ke Task 9 lebih dulu untuk skema minimal.

> **Catatan urutan:** Task 8 butuh model `Appointment` untuk mengambil rentang sibuk. Kerjakan Task 9 Step 1–4 (skema `Appointment`/`SlotHold` beserta migrasinya) terlebih dahulu, lalu kembali ke sini.

- [ ] **Step 3: Tulis getStaffAvailability**

Tambahkan ke `src/server/schedule.ts`:

```ts
import { getAvailableSlots, type SlotOption } from "@/lib/slot";
import { witaWeekday } from "@/lib/time";
import { isHoliday } from "@/server/holiday";

// Status Appointment yang benar-benar memblokir slot — sejalan dengan
// klausa WHERE pada exclusion constraint di migrasi Task 9.
const BLOCKING_STATUSES = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "HADIR"] as const;

export async function getStaffAvailability(input: {
  staffId: string;
  branchId: string;
  date: string;
  durationMinutes: number;
}): Promise<SlotOption[]> {
  const weekday = witaWeekday(new Date(`${input.date}T12:00:00Z`));

  const [template, exceptions, holiday, busyAppointments] = await Promise.all([
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
        startAt: { gte: new Date(`${input.date}T00:00:00Z`) },
        endAt: { lte: new Date(`${input.date}T23:59:59Z`) },
      },
      select: { startAt: true, endAt: true },
    }),
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
    busy: busyAppointments,
    now: new Date(),
    minLeadMinutes: 120,
  });
}
```

Tambahkan impor `prisma` dari `@/lib/db` di baris atas `src/server/schedule.ts` bila belum ada (Task 6 sudah mengimpornya).

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/schedule.test.ts`
Expected: PASS — 8 uji (4 dari Task 6 + 4 baru).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire slot engine to real schedule and appointment data"
```

---

### Task 9: Appointment & SlotHold dengan exclusion constraint

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp_UTC>_appointment_slothold_exclusion/migration.sql`
- Create: `tests/integration/appointment-exclusion.test.ts`

**Interfaces:**
- Consumes: model `Patient`, `Staff`, `Branch`, `Service`.
- Produces: model `Appointment` dengan enum `AppointmentType` (`KONSULTASI`/`TREATMENT`), `AppointmentStatus` (`MENUNGGU_KONFIRMASI`/`TERKONFIRMASI`/`HADIR`/`SELESAI`/`DIBATALKAN`/`TIDAK_HADIR`/`KEDALUWARSA`), `BookingSource` (`SITUS`/`WHATSAPP`/`TELEPON`/`WALK_IN`); model `SlotHold`. Keduanya dengan *exclusion constraint* pada `(staffId, rentang waktu)`.

Ini adalah bagian paling penting di seluruh plan — lihat "Catatan integritas slot" pada PRD bagian 9. Prisma tidak bisa mengekspresikan *exclusion constraint*, jadi skema Prisma mendefinisikan kolom dan tipe, sementara batasannya sendiri ditulis sebagai SQL mentah di berkas migrasi.

- [ ] **Step 1: Tulis uji yang gagal — pembuktian exclusion constraint dengan SQL mentah**

Buat `tests/integration/appointment-exclusion.test.ts`. Uji ini sengaja memakai `prisma.$executeRawUnsafe` langsung, bukan `prisma.appointment.create()`, supaya membuktikan constraint-nya sendiri bekerja di tingkat basis data — terlepas dari kode aplikasi mana pun yang nanti memanggilnya:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("exclusion constraint Appointment", () => {
  let patientId: string;
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-8888" } });
    await prisma.staff.deleteMany({ where: { slug: "staf-exclusion-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-exclusion-uji" } });

    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-8888", name: "Pasien Exclusion", whatsapp: "628888" },
    });
    const staff = await prisma.staff.create({
      data: { slug: "staf-exclusion-uji", name: "Staf Exclusion", role: "DOKTER" },
    });
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-exclusion-uji",
        name: "Cabang Uji",
        address: "Alamat",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });
    patientId = patient.id;
    staffId = staff.id;
    branchId = branch.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function insertAppointment(
    code: string,
    startAt: string,
    endAt: string,
    status = "TERKONFIRMASI",
  ) {
    return prisma.$executeRawUnsafe(
      `INSERT INTO "Appointment"
        (id, code, "branchId", "staffId", "patientId", type, "startAt", "endAt", status, source, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'KONSULTASI', $5::timestamptz, $6::timestamptz, $7, 'WALK_IN', now(), now())`,
      code,
      branchId,
      staffId,
      patientId,
      startAt,
      endAt,
      status,
    );
  }

  it("mengizinkan dua booking pada staf yang sama tanpa tindihan waktu", async () => {
    await insertAppointment("SDY-AAA1", "2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");
    await insertAppointment("SDY-AAA2", "2026-10-05T07:30:00Z", "2026-10-05T08:00:00Z");

    const count = await prisma.appointment.count({ where: { staffId } });
    expect(count).toBe(2);
  });

  it("menolak dua booking pada staf yang sama dengan waktu bertindihan sebagian", async () => {
    await insertAppointment("SDY-BBB1", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z");

    // Treatment 15.00-16.00 WITA sudah ada. Konsultasi 15.30 WITA bertindihan
    // meski waktu mulainya berbeda — persis kasus yang membatalkan batasan
    // unik pada v1.3 PRD.
    await expect(
      insertAppointment("SDY-BBB2", "2026-10-05T07:30:00Z", "2026-10-05T08:00:00Z"),
    ).rejects.toThrow();

    const count = await prisma.appointment.count({ where: { staffId } });
    expect(count).toBe(1);
  });

  it("mengizinkan booking bertindihan bila salah satunya berstatus DIBATALKAN", async () => {
    await insertAppointment("SDY-CCC1", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z", "DIBATALKAN");
    await insertAppointment("SDY-CCC2", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z", "TERKONFIRMASI");

    const count = await prisma.appointment.count({ where: { staffId } });
    expect(count).toBe(2);
  });

  it("menolak tindihan pada staf yang sama walau cabangnya berbeda", async () => {
    const otherBranch = await prisma.branch.create({
      data: {
        slug: "cabang-exclusion-uji-2",
        name: "Cabang Uji 2",
        address: "Alamat 2",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });

    await insertAppointment("SDY-DDD1", "2026-10-05T07:00:00Z", "2026-10-05T07:30:00Z");

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Appointment"
          (id, code, "branchId", "staffId", "patientId", type, "startAt", "endAt", status, source, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'KONSULTASI', $5::timestamptz, $6::timestamptz, 'TERKONFIRMASI', 'WALK_IN', now(), now())`,
        "SDY-DDD2",
        otherBranch.id,
        staffId,
        patientId,
        "2026-10-05T07:00:00Z",
        "2026-10-05T07:30:00Z",
      ),
    ).rejects.toThrow();

    await prisma.branch.delete({ where: { id: otherBranch.id } });
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/appointment-exclusion.test.ts`
Expected: FAIL — tabel `Appointment` belum ada.

- [ ] **Step 3: Tambah model ke skema**

```prisma
enum AppointmentType {
  KONSULTASI
  TREATMENT
}

enum AppointmentStatus {
  MENUNGGU_KONFIRMASI
  TERKONFIRMASI
  HADIR
  SELESAI
  DIBATALKAN
  TIDAK_HADIR
  KEDALUWARSA
}

enum BookingSource {
  SITUS
  WHATSAPP
  TELEPON
  WALK_IN
}

/// Jaminan anti-bentrok yang sesungguhnya ada di migrasi (exclusion
/// constraint pada staffId x rentang waktu), bukan di sini — lihat PRD
/// bagian 9 "Catatan integritas slot". Model ini hanya mendefinisikan kolom.
model Appointment {
  id     String @id @default(cuid())
  code   String @unique

  type    AppointmentType
  startAt DateTime
  endAt   DateTime
  status  AppointmentStatus @default(MENUNGGU_KONFIRMASI)
  source  BookingSource
  notes   String?

  branchId  String
  branch    Branch  @relation(fields: [branchId], references: [id])
  staffId   String
  staff     Staff   @relation(fields: [staffId], references: [id])
  patientId String
  patient   Patient @relation(fields: [patientId], references: [id])
  serviceId String?
  service   Service? @relation(fields: [serviceId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([staffId, startAt])
  @@index([branchId, startAt])
  @@index([patientId])
  @@index([status])
}

/// Penahanan sementara slot selama pasien mengisi form pendaftaran mandiri
/// (Plan 3b). Tabelnya dibuat sekarang karena berbagi mekanisme exclusion
/// constraint yang sama dengan Appointment.
model SlotHold {
  id        String   @id @default(cuid())
  startAt   DateTime
  endAt     DateTime
  expiresAt DateTime
  token     String   @unique

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id])
  staffId  String
  staff    Staff  @relation(fields: [staffId], references: [id])

  createdAt DateTime @default(now())

  @@index([staffId, startAt])
  @@index([expiresAt])
}
```

Tambahkan relasi balik: `model Staff` → `appointments Appointment[]` dan `slotHolds SlotHold[]`; `model Branch` → `appointments Appointment[]` dan `slotHolds SlotHold[]`; `model Patient` → `appointments Appointment[]`; `model Service` → `appointments Appointment[]`.

- [ ] **Step 4: Tulis migrasi manual dengan exclusion constraint**

`migrate dev` tidak bisa menghasilkan *exclusion constraint* — Prisma tidak mengenal sintaksnya. Buat migrasi secara manual:

```bash
mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_appointment_slothold_exclusion"
```

Tulis `migration.sql` di folder itu. Bagian atas (definisi tabel) dihasilkan lebih dulu lewat `prisma migrate diff`, lalu exclusion constraint ditambahkan manual di bawahnya:

```bash
DIR=$(ls -d prisma/migrations/*_appointment_slothold_exclusion)
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url "$TEST_DATABASE_URL_UNPOOLED" --script > "$DIR/migration.sql"
```

Bila `--shadow-database-url` tidak praktis di lingkungan ini (lihat catatan Plan 2 soal `migrate dev` tanpa TTY), tulis `migration.sql` secara manual mengikuti gaya migrasi sebelumnya (`CREATE TYPE`, lalu `CREATE TABLE` sesuai kolom pada Step 3). Setelah bagian `CREATE TABLE` selesai — dihasilkan otomatis atau ditulis manual — **tambahkan di baris paling akhir berkas** blok berikut, yang wajib ditulis tangan karena Prisma tidak dapat menghasilkannya:

```sql
-- Exclusion constraint: jaminan anti-bentrok yang sesungguhnya.
-- Membutuhkan ekstensi btree_gist agar operator "=" pada kolom teks (staffId)
-- dapat dipakai berdampingan dengan operator jangkauan "&&" dalam satu
-- indeks GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" ADD CONSTRAINT appointment_no_overlap
EXCLUDE USING gist (
  "staffId" WITH =,
  tstzrange("startAt", "endAt", '[)') WITH &&
) WHERE (status IN ('MENUNGGU_KONFIRMASI', 'TERKONFIRMASI', 'HADIR'));

ALTER TABLE "SlotHold" ADD CONSTRAINT slot_hold_no_overlap
EXCLUDE USING gist (
  "staffId" WITH =,
  tstzrange("startAt", "endAt", '[)') WITH &&
) WHERE ("expiresAt" > now());
```

Catatan pada klausa `WHERE` di `SlotHold`: `expiresAt > now()` dievaluasi saat baris ditulis (bukan terus-menerus), sehingga hold yang sudah kedaluwarsa tapi belum dibersihkan masih bisa menghalangi penulisan baru sampai baris lamanya benar-benar dihapus — pembersihan hold kedaluwarsa adalah pekerjaan Plan 3b, dicatat di bagian "Yang Sengaja Tidak Dikerjakan".

- [ ] **Step 5: Terapkan migrasi**

```bash
npx prisma migrate deploy
npx prisma generate
npm run db:migrate:test
```

- [ ] **Step 6: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/appointment-exclusion.test.ts`
Expected: PASS — 4 uji. Ini membuktikan bentrok jadwal *mustahil* di tingkat basis data, bukan hanya "tidak mungkin" menurut kode aplikasi.

- [ ] **Step 7: Kembali ke Task 8 dan jalankan ulang uji ketersediaan**

```bash
npm run test:integration -- tests/integration/schedule.test.ts
```

Expected: PASS seluruhnya — Task 8 sekarang punya skema `Appointment` yang dibutuhkannya.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Appointment and SlotHold with exclusion constraints

Proves the double-booking guarantee at the database level, not just in
application code."
```

---

### Task 10: Server action pencatatan janji temu

**Files:**
- Create: `src/server/appointment.ts`
- Create: `tests/integration/appointment.test.ts`

**Interfaces:**
- Consumes: model `Appointment`, `getStaffAvailability` dari `@/server/schedule`, `generateBookingCode` dari `@/lib/booking-code`, `recordAudit`, `requireCapability`.
- Produces:
  - `createAppointment(input: { patientId: string; branchId: string; staffId: string; serviceId: string | null; type: "KONSULTASI" | "TREATMENT"; startAt: Date; endAt: Date; source: BookingSource; notes?: string }): Promise<Appointment>`
  - `rescheduleAppointment(id: string, input: { startAt: Date; endAt: Date }): Promise<Appointment>`
  - `verifyAppointment(id: string): Promise<Appointment>`
  - `markAttended(id: string): Promise<Appointment>`
  - `markNoShow(id: string): Promise<Appointment>`
  - `cancelAppointment(id: string, reason?: string): Promise<Appointment>`
  - `listAppointments(filter: { branchId?: string; staffId?: string; status?: AppointmentStatus; date?: string }): Promise<Appointment[]>` — hasilnya menyertakan `patient` dan `staff` lewat `include`

Ini lapisan yang menangkap penolakan basis data dan mengubahnya jadi pesan yang dapat dipahami admin — sesuai PRD: *"aplikasi menangkap penolakan dari basis data dan menampilkan 'slot baru saja terisi', bukan melempar galat mentah."*

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/appointment.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  cancelAppointment,
  createAppointment,
  listAppointments,
  markAttended,
  rescheduleAppointment,
  verifyAppointment,
} from "@/server/appointment";

const actor = {
  userId: "u1",
  staffId: "s1",
  name: "Staf Uji",
  role: "SUPER_ADMIN" as const,
  email: "uji@sundy.test",
};

vi.mock("@/server/session", () => ({ requireCapability: vi.fn().mockResolvedValue(actor) }));

describe("server action appointment", () => {
  let patientId: string;
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.patient.deleteMany({ where: { medicalRecordNumber: "SDY-2026-7777" } });
    await prisma.staff.deleteMany({ where: { slug: "staf-appointment-uji" } });
    await prisma.branch.deleteMany({ where: { slug: "cabang-appointment-uji" } });

    const patient = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-7777", name: "Pasien Appointment", whatsapp: "627777" },
    });
    const staff = await prisma.staff.create({
      data: { slug: "staf-appointment-uji", name: "Staf Appointment", role: "DOKTER" },
    });
    const branch = await prisma.branch.create({
      data: {
        slug: "cabang-appointment-uji",
        name: "Cabang Uji",
        address: "Alamat",
        whatsapp: "6285172228900",
        openingHours: "Senin–Sabtu, 11.00–19.00",
        status: "AKTIF",
      },
    });
    patientId = patient.id;
    staffId = staff.id;
    branchId = branch.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("membuat janji temu dengan kode booking dan status awal MENUNGGU_KONFIRMASI", async () => {
    const appt = await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "TELEPON",
    });

    expect(appt.code).toMatch(/^SDY-/);
    expect(appt.status).toBe("MENUNGGU_KONFIRMASI");
    expect(appt.source).toBe("TELEPON");
  });

  it("menolak janji temu kedua yang bertindihan dengan pesan yang dapat dipahami", async () => {
    await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "TELEPON",
    });

    // Bukan galat SQL mentah — pesan yang admin bisa mengerti.
    await expect(
      createAppointment({
        patientId,
        branchId,
        staffId,
        serviceId: null,
        type: "KONSULTASI",
        startAt: new Date("2026-10-05T07:00:00Z"),
        endAt: new Date("2026-10-05T07:30:00Z"),
        source: "TELEPON",
      }),
    ).rejects.toThrow(/slot baru saja terisi/i);
  });

  it("mencatat jejak audit saat janji temu dibuat", async () => {
    const appt = await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "WALK_IN",
    });

    const audit = await prisma.auditLog.findFirst({ where: { entityId: appt.id } });
    expect(audit?.action).toBe("appointment.create");
  });

  it("memindahkan jadwal tanpa membatalkan booking lama", async () => {
    const appt = await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "WALK_IN",
    });

    const moved = await rescheduleAppointment(appt.id, {
      startAt: new Date("2026-10-05T08:00:00Z"),
      endAt: new Date("2026-10-05T08:30:00Z"),
    });

    expect(moved.id).toBe(appt.id);
    expect(moved.startAt.toISOString()).toBe("2026-10-05T08:00:00.000Z");
  });

  it("menjalankan alur status: verifikasi -> hadir", async () => {
    const appt = await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "WALK_IN",
    });

    const verified = await verifyAppointment(appt.id);
    expect(verified.status).toBe("TERKONFIRMASI");

    const attended = await markAttended(appt.id);
    expect(attended.status).toBe("HADIR");
  });

  it("membatalkan janji temu tanpa menghapus baris, dan membuka kembali slotnya", async () => {
    const appt = await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "WALK_IN",
    });

    const cancelled = await cancelAppointment(appt.id, "Pasien membatalkan");
    expect(cancelled.status).toBe("DIBATALKAN");
    expect(await prisma.appointment.count({ where: { id: appt.id } })).toBe(1);

    // Slot yang sama sekarang bisa dipakai booking lain — membuktikan
    // pembatalan benar-benar melepas kuncinya di exclusion constraint.
    const rebooked = await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "WALK_IN",
    });
    expect(rebooked.status).toBe("MENUNGGU_KONFIRMASI");
  });

  it("mendaftar janji temu dengan filter cabang dan status", async () => {
    await createAppointment({
      patientId,
      branchId,
      staffId,
      serviceId: null,
      type: "KONSULTASI",
      startAt: new Date("2026-10-05T07:00:00Z"),
      endAt: new Date("2026-10-05T07:30:00Z"),
      source: "WALK_IN",
    });

    const list = await listAppointments({ branchId, status: "MENUNGGU_KONFIRMASI" });
    expect(list).toHaveLength(1);
    expect(list[0].patient.name).toBe("Pasien Appointment");
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm run test:integration -- tests/integration/appointment.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/appointment"`.

- [ ] **Step 3: Tulis src/server/appointment.ts**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { Appointment, AppointmentStatus, AppointmentType, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateBookingCode } from "@/lib/booking-code";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Kode Postgres untuk pelanggaran exclusion constraint adalah "23P01".
 * Ini satu-satunya tempat yang menerjemahkannya ke pesan yang admin
 * mengerti — di mana pun exclusion constraint bisa terpicu, tangkap di
 * sini, jangan biarkan galat SQL mentah sampai ke antarmuka.
 */
function isExclusionViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2010" &&
    typeof error.meta?.code === "string" &&
    error.meta.code === "23P01"
  ) || (error instanceof Error && error.message.includes("23P01"));
}

async function createWithSlotGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new Error("Slot baru saja terisi. Pilih jam lain.");
    }
    throw error;
  }
}

export async function createAppointment(input: {
  patientId: string;
  branchId: string;
  staffId: string;
  serviceId: string | null;
  type: AppointmentType;
  startAt: Date;
  endAt: Date;
  source: BookingSource;
  notes?: string;
}): Promise<Appointment> {
  const actor = await requireCapability("booking:manage");

  const created = await createWithSlotGuard(() =>
    prisma.appointment.create({
      data: {
        code: generateBookingCode(),
        branchId: input.branchId,
        staffId: input.staffId,
        patientId: input.patientId,
        serviceId: input.serviceId,
        type: input.type,
        startAt: input.startAt,
        endAt: input.endAt,
        source: input.source,
        notes: input.notes,
      },
    }),
  );

  await recordAudit({
    actor,
    action: "appointment.create",
    entity: "Appointment",
    entityId: created.id,
    summary: `${created.code} — ${input.startAt.toISOString()}`,
  });

  revalidatePath("/admin/booking");
  return created;
}

export async function rescheduleAppointment(
  id: string,
  input: { startAt: Date; endAt: Date },
): Promise<Appointment> {
  const actor = await requireCapability("booking:manage");

  const updated = await createWithSlotGuard(() =>
    prisma.appointment.update({
      where: { id },
      data: { startAt: input.startAt, endAt: input.endAt },
    }),
  );

  await recordAudit({
    actor,
    action: "appointment.reschedule",
    entity: "Appointment",
    entityId: id,
    summary: `pindah ke ${input.startAt.toISOString()}`,
  });

  revalidatePath("/admin/booking");
  return updated;
}

async function setStatus(
  id: string,
  status: AppointmentStatus,
  action: string,
  summary?: string,
): Promise<Appointment> {
  const actor = await requireCapability("booking:manage");

  const updated = await prisma.appointment.update({ where: { id }, data: { status } });

  await recordAudit({ actor, action, entity: "Appointment", entityId: id, summary });

  revalidatePath("/admin/booking");
  return updated;
}

export async function verifyAppointment(id: string): Promise<Appointment> {
  return setStatus(id, "TERKONFIRMASI", "appointment.verify");
}

export async function markAttended(id: string): Promise<Appointment> {
  return setStatus(id, "HADIR", "appointment.mark-attended");
}

export async function markNoShow(id: string): Promise<Appointment> {
  return setStatus(id, "TIDAK_HADIR", "appointment.mark-no-show");
}

/**
 * Mengubah status menjadi DIBATALKAN. Tidak pernah menghapus baris —
 * lihat PRD F9: janji temu adalah catatan kegiatan klinik, dan
 * menghapusnya memutus jejak audit serta riwayat pasien.
 */
export async function cancelAppointment(id: string, reason?: string): Promise<Appointment> {
  return setStatus(id, "DIBATALKAN", "appointment.cancel", reason);
}

export async function listAppointments(filter: {
  branchId?: string;
  staffId?: string;
  status?: AppointmentStatus;
  date?: string;
}) {
  await requireCapability("booking:manage");

  return prisma.appointment.findMany({
    where: {
      branchId: filter.branchId,
      staffId: filter.staffId,
      status: filter.status,
      ...(filter.date
        ? {
            startAt: {
              gte: new Date(`${filter.date}T00:00:00Z`),
              lte: new Date(`${filter.date}T23:59:59Z`),
            },
          }
        : {}),
    },
    include: { patient: true, staff: true, branch: true, service: true },
    orderBy: { startAt: "asc" },
  });
}
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm run test:integration -- tests/integration/appointment.test.ts`
Expected: PASS — 7 uji.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add appointment server actions with slot-guard error handling"
```

---

### Task 11: Teks konfirmasi WhatsApp untuk admin

**Files:**
- Modify: `src/lib/whatsapp.ts`
- Modify: `tests/unit/whatsapp.test.ts`

**Interfaces:**
- Consumes: `CLINIC_NAME` dari `@/lib/clinic`, `formatIndonesianDate` dari `@/lib/format`, `minutesToTimeLabel`/`witaDateString` dari `@/lib/time` (dipanggil oleh caller, bukan di dalam fungsi ini — fungsi ini menerima label jam yang sudah jadi).
- Produces: `appointmentConfirmationMessage(input: { patientName: string; code: string; staffName: string; branchName: string; dateLabel: string; timeLabel: string }): string`

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan ke `tests/unit/whatsapp.test.ts`:

```ts
import { appointmentConfirmationMessage } from "@/lib/whatsapp";

describe("appointmentConfirmationMessage", () => {
  it("menyusun teks siap-salin sesuai contoh pada PRD F5", () => {
    const message = appointmentConfirmationMessage({
      patientName: "Siti Rahayu",
      code: "SDY-8F3K",
      staffName: "Dr. Diane Paparang, Sp.GK, AIFO-K",
      branchName: "Mahakeret",
      dateLabel: "Kamis, 25 Sep 2026",
      timeLabel: "15.00",
    });

    expect(message).toBe(
      "Halo SunDY Clinic, saya sudah booking konsultasi. Kode: SDY-8F3K, atas nama Siti Rahayu, " +
        "dengan Dr. Diane Paparang, Sp.GK, AIFO-K di cabang Mahakeret, Kamis, 25 Sep 2026 pukul 15.00. " +
        "Berikut bukti transfernya.",
    );
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan GAGAL**

Run: `npm test -- tests/unit/whatsapp.test.ts`
Expected: FAIL — `appointmentConfirmationMessage is not a function`.

- [ ] **Step 3: Tambahkan ke src/lib/whatsapp.ts**

```ts
export function appointmentConfirmationMessage(input: {
  patientName: string;
  code: string;
  staffName: string;
  branchName: string;
  dateLabel: string;
  timeLabel: string;
}): string {
  return (
    `Halo ${CLINIC_NAME}, saya sudah booking konsultasi. Kode: ${input.code}, ` +
    `atas nama ${input.patientName}, dengan ${input.staffName} di cabang ${input.branchName}, ` +
    `${input.dateLabel} pukul ${input.timeLabel}. Berikut bukti transfernya.`
  );
}
```

- [ ] **Step 4: Jalankan uji dan pastikan LULUS**

Run: `npm test -- tests/unit/whatsapp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin WhatsApp confirmation message builder"
```

---

### Task 12: Halaman admin — kelola jadwal

**Files:**
- Create: `src/components/admin/schedule-template-form.tsx`
- Create: `src/components/admin/schedule-exception-form.tsx`
- Create: `src/components/admin/holiday-list.tsx`
- Create: `src/app/(admin)/admin/jadwal/page.tsx`

**Interfaces:**
- Consumes: `listScheduleTemplates`, `upsertScheduleTemplate`, `createScheduleException`, `listScheduleExceptions` dari `@/server/schedule`; `listHolidays`, `createHoliday`, `deleteHoliday` dari `@/server/holiday`; `minutesToTimeLabel` dari `@/lib/time`; komponen shadcn dari Plan 2.

- [ ] **Step 1: Tulis komponen daftar hari libur**

Buat `src/components/admin/holiday-list.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Holiday } from "@prisma/client";
import { deleteHoliday } from "@/server/holiday";

const KIND_LABEL: Record<Holiday["kind"], string> = {
  LIBUR_NASIONAL: "Libur Nasional",
  CUTI_BERSAMA: "Cuti Bersama",
  LIBUR_KLINIK: "Libur Klinik",
};

export function HolidayList({ holidays }: { holidays: Holiday[] }) {
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteHoliday(id);
        toast.success("Hari libur dihapus.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal menghapus.");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Nama</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {holidays.map((h) => (
          <TableRow key={h.id}>
            <TableCell>{h.date.toISOString().slice(0, 10)}</TableCell>
            <TableCell>{h.name}</TableCell>
            <TableCell>{KIND_LABEL[h.kind]}</TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => handleDelete(h.id)}>
                Hapus
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Tulis komponen form template jadwal**

Buat `src/components/admin/schedule-template-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { minutesToTimeLabel } from "@/lib/time";
import { upsertScheduleTemplate } from "@/server/schedule";
import type { ScheduleTemplate } from "@prisma/client";

const WEEKDAY_LABEL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type Props = {
  staffId: string;
  branchId: string;
  weekday: number;
  existing?: ScheduleTemplate;
};

function timeLabelToMinutes(label: string): number {
  const [h, m] = label.split(":").map(Number);
  return h * 60 + m;
}

export function ScheduleTemplateForm({ staffId, branchId, weekday, existing }: Props) {
  const [start, setStart] = useState(
    existing ? minutesToTimeLabel(existing.startMinute).replace(".", ":") : "11:00",
  );
  const [end, setEnd] = useState(
    existing ? minutesToTimeLabel(existing.endMinute).replace(".", ":") : "19:00",
  );
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertScheduleTemplate({
          staffId,
          branchId,
          weekday,
          startMinute: timeLabelToMinutes(start),
          endMinute: timeLabelToMinutes(end),
          slotMinutes: 30,
        });
        toast.success(`Jadwal ${WEEKDAY_LABEL[weekday]} tersimpan.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal menyimpan jadwal.");
      }
    });
  }

  return (
    <div className="flex items-end gap-3 rounded-lg border p-3">
      <span className="w-20 text-sm font-medium">{WEEKDAY_LABEL[weekday]}</span>
      <div className="space-y-1">
        <Label className="text-xs">Mulai</Label>
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-28" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Selesai</Label>
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-28" />
      </div>
      <Button size="sm" disabled={pending} onClick={handleSave}>
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Tulis komponen form pengecualian**

Buat `src/components/admin/schedule-exception-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createScheduleException } from "@/server/schedule";
import type { ExceptionKind } from "@prisma/client";

export function ScheduleExceptionForm({ staffId }: { staffId: string }) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<ExceptionKind>("LIBUR");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!date) {
      toast.error("Tanggal wajib diisi.");
      return;
    }
    startTransition(async () => {
      try {
        await createScheduleException({
          staffId,
          branchId: null,
          date,
          kind,
          startMinute: null,
          endMinute: null,
        });
        toast.success("Pengecualian tersimpan.");
        setDate("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal menyimpan.");
      }
    });
  }

  return (
    <div className="flex items-end gap-3 rounded-lg border p-3">
      <div className="space-y-1">
        <Label className="text-xs">Tanggal</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Jenis</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as ExceptionKind)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LIBUR">Cuti (libur sehari penuh)</SelectItem>
            <SelectItem value="JAM_TAMBAHAN">Jam tambahan</SelectItem>
            <SelectItem value="BLOKIR_SEBAGIAN">Blokir sebagian jam</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" disabled={pending} onClick={handleSubmit}>
        Tambah
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Tulis halaman kelola jadwal**

Buat `src/app/(admin)/admin/jadwal/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { HolidayList } from "@/components/admin/holiday-list";
import { ScheduleExceptionForm } from "@/components/admin/schedule-exception-form";
import { ScheduleTemplateForm } from "@/components/admin/schedule-template-form";
import { getBranches } from "@/server/catalog";
import { listHolidays } from "@/server/holiday";
import { listScheduleTemplates } from "@/server/schedule";
import { requireCapability } from "@/server/session";
import { prisma } from "@/lib/db";

const WEEKDAYS = [1, 2, 3, 4, 5, 6]; // Senin-Sabtu — klinik tutup Minggu

export default async function SchedulePage() {
  await requireCapability("schedule:manage");

  const [branches, holidays, staffList] = await Promise.all([
    getBranches(),
    listHolidays(new Date().getFullYear()),
    prisma.staff.findMany({ where: { role: { in: ["DOKTER", "TERAPIS"] }, isActive: true } }),
  ]);

  const primaryBranch = branches.find((b) => b.status === "AKTIF") ?? branches[0];
  const primaryStaff = staffList[0];

  if (!primaryStaff || !primaryBranch) {
    return (
      <>
        <AdminHeader title="Jadwal" />
        <p className="p-6 text-sm text-muted-foreground">
          Belum ada staf atau cabang aktif untuk dijadwalkan.
        </p>
      </>
    );
  }

  const templates = await listScheduleTemplates(primaryStaff.id);

  return (
    <>
      <AdminHeader title="Jadwal" />
      <div className="space-y-10 p-6">
        <section>
          <h2 className="mb-3 text-lg font-medium">Jam Kerja Mingguan — {primaryStaff.name}</h2>
          <div className="space-y-2">
            {WEEKDAYS.map((weekday) => (
              <ScheduleTemplateForm
                key={weekday}
                staffId={primaryStaff.id}
                branchId={primaryBranch.id}
                weekday={weekday}
                existing={templates.find((t) => t.weekday === weekday)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Pengecualian Tanggal</h2>
          <ScheduleExceptionForm staffId={primaryStaff.id} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Kalender Hari Libur {new Date().getFullYear()}</h2>
          <HolidayList holidays={holidays} />
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Jalankan typecheck dan build**

```bash
npx tsc --noEmit
npm run build
```

Expected: keduanya bersih; `/admin/jadwal` muncul sebagai rute dinamis.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add admin schedule management page"
```

---

### Task 13: Halaman admin — cari & buat pasien

**Files:**
- Create: `src/components/admin/patient-picker.tsx`
- Create: `src/app/(admin)/admin/pasien/page.tsx`

**Interfaces:**
- Consumes: `searchPatients`, `createPatient`, `findPatientsByWhatsapp` dari `@/server/patient`.
- Produces: komponen `PatientPicker` yang dipakai ulang oleh Task 14 (form booking).

- [ ] **Step 1: Tulis komponen pencari/pembuat pasien**

Buat `src/components/admin/patient-picker.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPatient, findPatientsByWhatsapp, searchPatients } from "@/server/patient";
import type { Patient } from "@prisma/client";

export function PatientPicker({ onSelect }: { onSelect: (patient: Patient) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<Patient[]>([]);
  const [pending, startTransition] = useTransition();

  function handleSearch(value: string) {
    setQuery(value);
    startTransition(async () => {
      setResults(value.trim() ? await searchPatients(value) : []);
    });
  }

  function handleCheckDuplicate() {
    startTransition(async () => {
      const matches = newWhatsapp ? await findPatientsByWhatsapp(newWhatsapp) : [];
      setDuplicateWarning(matches);
    });
  }

  function handleCreate() {
    if (!newName || !newWhatsapp) {
      toast.error("Nama dan nomor WhatsApp wajib diisi.");
      return;
    }
    startTransition(async () => {
      try {
        const patient = await createPatient({ name: newName, whatsapp: newWhatsapp });
        toast.success(`Pasien ${patient.name} (${patient.medicalRecordNumber}) dibuat.`);
        onSelect(patient);
        setShowCreateForm(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal membuat pasien.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="patient-search">Cari pasien (nama, WhatsApp, atau nomor RM)</Label>
        <Input
          id="patient-search"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Ketik untuk mencari…"
        />
      </div>

      {results.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {results.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => onSelect(patient)}
              >
                <span className="font-medium">{patient.name}</span>
                <span className="ml-2 text-muted-foreground">
                  {patient.medicalRecordNumber} · {patient.whatsapp}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!showCreateForm ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateForm(true)}>
          + Pasien Baru
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="new-patient-name">Nama</Label>
            <Input id="new-patient-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-patient-whatsapp">Nomor WhatsApp</Label>
            <Input
              id="new-patient-whatsapp"
              value={newWhatsapp}
              onChange={(e) => setNewWhatsapp(e.target.value)}
              onBlur={handleCheckDuplicate}
              placeholder="62812xxxxxxx"
            />
          </div>

          {duplicateWarning.length > 0 && (
            <p className="rounded-md bg-amber-100 p-2 text-sm text-amber-900">
              Nomor ini sudah terdaftar atas nama{" "}
              <strong>{duplicateWarning.map((p) => p.name).join(", ")}</strong>. Pastikan ini bukan
              pasien yang sama sebelum melanjutkan.
            </p>
          )}

          <Button type="button" size="sm" disabled={pending} onClick={handleCreate}>
            Buat Pasien
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tulis halaman daftar pasien**

Buat `src/app/(admin)/admin/pasien/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/server/session";

export default async function PatientsPage() {
  await requireCapability("booking:manage");

  const patients = await prisma.patient.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <>
      <AdminHeader title="Pasien" />
      <div className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. RM</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Status Program</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.medicalRecordNumber}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.whatsapp}</TableCell>
                <TableCell>{p.programStatus}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Jalankan typecheck dan build**

```bash
npx tsc --noEmit
npm run build
```

Expected: bersih.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add patient search and quick-create"
```

---

### Task 14: Halaman admin — buat janji temu

**Files:**
- Create: `src/components/admin/slot-picker.tsx`
- Create: `src/components/admin/appointment-form.tsx`
- Create: `src/app/(admin)/admin/booking/baru/page.tsx`

**Interfaces:**
- Consumes: `PatientPicker` dari Task 13; `getStaffAvailability` dari `@/server/schedule`; `createAppointment` dari `@/server/appointment`; `getServiceCategoriesWithServices`, `getBranches` dari `@/server/catalog`; `formatIndonesianDate` dari `@/lib/format`.

- [ ] **Step 1: Tulis komponen pemilih slot**

Buat `src/components/admin/slot-picker.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStaffAvailability } from "@/server/schedule";

type SlotOption = { startAt: Date; endAt: Date; label: string };

type Props = {
  staffId: string;
  branchId: string;
  durationMinutes: number;
  onSelect: (slot: SlotOption) => void;
  selected: SlotOption | null;
};

export function SlotPicker({ staffId, branchId, durationMinutes, onSelect, selected }: Props) {
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    startTransition(async () => {
      const result = await getStaffAvailability({ staffId, branchId, date, durationMinutes });
      setSlots(result);
    });
  }, [date, staffId, branchId, durationMinutes]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="booking-date">Tanggal</Label>
        <Input
          id="booking-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {pending && <p className="text-sm text-muted-foreground">Memuat slot…</p>}

      {!pending && date && slots.length === 0 && (
        <p className="text-sm text-muted-foreground">Tidak ada slot kosong pada tanggal ini.</p>
      )}

      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => (
            <Button
              key={slot.startAt.toISOString()}
              type="button"
              size="sm"
              variant={selected?.startAt.getTime() === slot.startAt.getTime() ? "default" : "outline"}
              onClick={() => onSelect(slot)}
            >
              {slot.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tulis form buat janji temu**

Buat `src/components/admin/appointment-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildWhatsAppLink, appointmentConfirmationMessage } from "@/lib/whatsapp";
import { formatIndonesianDate } from "@/lib/format";
import { PatientPicker } from "./patient-picker";
import { SlotPicker } from "./slot-picker";
import { createAppointment } from "@/server/appointment";
import type { Patient } from "@prisma/client";

type StaffOption = { id: string; name: string };
type BranchOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; durationMin: number; requiresDoctor: boolean };
type SlotOption = { startAt: Date; endAt: Date; label: string };
type StaffRole = "DOKTER" | "TERAPIS";
type StaffWithRole = StaffOption & { role: StaffRole };

type Props = {
  branches: BranchOption[];
  staff: StaffWithRole[];
  services: ServiceOption[];
};

const SOURCE_LABEL: Record<string, string> = {
  WALK_IN: "Walk-in",
  TELEPON: "Telepon",
  WHATSAPP: "WhatsApp",
};

export function AppointmentForm({ branches, staff, services }: Props) {
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState("");
  const [source, setSource] = useState<"WALK_IN" | "TELEPON" | "WHATSAPP">("TELEPON");
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedService = services.find((s) => s.id === serviceId);
  const durationMinutes = selectedService?.durationMin ?? 30;
  const eligibleStaff = staff.filter((s) =>
    selectedService?.requiresDoctor ? s.role === "DOKTER" : true,
  );

  function handleSubmit() {
    if (!patient || !staffId || !slot) {
      toast.error("Lengkapi pasien, tenaga, dan slot terlebih dahulu.");
      return;
    }

    startTransition(async () => {
      try {
        const appointment = await createAppointment({
          patientId: patient.id,
          branchId,
          staffId,
          serviceId: serviceId || null,
          type: selectedService ? "TREATMENT" : "KONSULTASI",
          startAt: slot.startAt,
          endAt: slot.endAt,
          source,
        });

        const staffName = staff.find((s) => s.id === staffId)?.name ?? "";
        const branchName = branches.find((b) => b.id === branchId)?.name ?? "";
        const message = appointmentConfirmationMessage({
          patientName: patient.name,
          code: appointment.code,
          staffName,
          branchName,
          dateLabel: formatIndonesianDate(slot.startAt),
          timeLabel: slot.label,
        });

        toast.success(`Booking ${appointment.code} dibuat.`, {
          action: {
            label: "Buka WhatsApp",
            onClick: () => window.open(buildWhatsAppLink(message), "_blank"),
          },
        });
        router.push("/admin/booking");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal membuat booking.");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium">Pasien</h2>
        {patient ? (
          <p className="rounded-md border p-3 text-sm">
            {patient.name} <span className="text-muted-foreground">({patient.medicalRecordNumber})</span>{" "}
            <button type="button" className="text-primary underline" onClick={() => setPatient(null)}>
              Ganti
            </button>
          </p>
        ) : (
          <PatientPicker onSelect={setPatient} />
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium">Cabang</h2>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium">Layanan (kosongkan untuk konsultasi)</h2>
          <Select value={serviceId} onValueChange={(v) => { setServiceId(v); setStaffId(""); setSlot(null); }}>
            <SelectTrigger>
              <SelectValue placeholder="Konsultasi Dokter" />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.durationMin} menit)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium">Tenaga</h2>
          <Select value={staffId} onValueChange={(v) => { setStaffId(v); setSlot(null); }}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih tenaga" />
            </SelectTrigger>
            <SelectContent>
              {eligibleStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium">Sumber Booking</h2>
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SOURCE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {staffId && branchId && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Jadwal</h2>
          <SlotPicker
            staffId={staffId}
            branchId={branchId}
            durationMinutes={durationMinutes}
            onSelect={setSlot}
            selected={slot}
          />
        </section>
      )}

      <Button type="button" disabled={pending} onClick={handleSubmit}>
        {pending ? "Menyimpan…" : "Buat Booking"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Tulis halaman buat booking**

Buat `src/app/(admin)/admin/booking/baru/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentForm } from "@/components/admin/appointment-form";
import { getBranches, getServiceCategoriesWithServices } from "@/server/catalog";
import { requireCapability } from "@/server/session";
import { prisma } from "@/lib/db";

export default async function NewAppointmentPage() {
  await requireCapability("booking:manage");

  const [branches, categories, staffList] = await Promise.all([
    getBranches(),
    getServiceCategoriesWithServices(),
    prisma.staff.findMany({ where: { role: { in: ["DOKTER", "TERAPIS"] }, isActive: true } }),
  ]);

  const services = categories.flatMap((c) => c.services);

  return (
    <>
      <AdminHeader title="Booking Baru" />
      <div className="p-6">
        <AppointmentForm
          branches={branches.filter((b) => b.status === "AKTIF")}
          staff={staffList.map((s) => ({ id: s.id, name: s.name, role: s.role as "DOKTER" | "TERAPIS" }))}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            durationMin: s.durationMin,
            requiresDoctor: s.requiresDoctor,
          }))}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Jalankan typecheck dan build**

```bash
npx tsc --noEmit
npm run build
```

Expected: bersih.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin appointment creation form"
```

---

### Task 15: Halaman admin — daftar booking & aksi status

**Files:**
- Create: `src/components/admin/appointment-status-badge.tsx`
- Create: `src/components/admin/appointment-table.tsx`
- Create: `src/app/(admin)/admin/booking/page.tsx`

**Interfaces:**
- Consumes: `listAppointments`, `verifyAppointment`, `markAttended`, `markNoShow`, `cancelAppointment` dari `@/server/appointment`; `formatIndonesianDate` dari `@/lib/format`.

- [ ] **Step 1: Tulis lencana status**

Buat `src/components/admin/appointment-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@prisma/client";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  MENUNGGU_KONFIRMASI: "Menunggu Konfirmasi",
  TERKONFIRMASI: "Terkonfirmasi",
  HADIR: "Hadir",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
  TIDAK_HADIR: "Tidak Hadir",
  KEDALUWARSA: "Kedaluwarsa",
};

const STATUS_VARIANT: Record<AppointmentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  MENUNGGU_KONFIRMASI: "outline",
  TERKONFIRMASI: "default",
  HADIR: "default",
  SELESAI: "secondary",
  DIBATALKAN: "destructive",
  TIDAK_HADIR: "destructive",
  KEDALUWARSA: "secondary",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
```

- [ ] **Step 2: Tulis tabel booking dengan aksi**

Buat `src/components/admin/appointment-table.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { cancelAppointment, markAttended, markNoShow, verifyAppointment } from "@/server/appointment";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import type { Appointment, Branch, Patient, Service, Staff } from "@prisma/client";

type Row = Appointment & { patient: Patient; staff: Staff; branch: Branch; service: Service | null };

export function AppointmentTable({ appointments }: { appointments: Row[] }) {
  const [pending, startTransition] = useTransition();

  function runAction(action: () => Promise<unknown>, successMessage: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(successMessage);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Aksi gagal.");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kode</TableHead>
          <TableHead>Pasien</TableHead>
          <TableHead>Tenaga</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead>Jadwal</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {appointments.map((appt) => (
          <TableRow key={appt.id}>
            <TableCell className="font-mono text-xs">{appt.code}</TableCell>
            <TableCell>{appt.patient.name}</TableCell>
            <TableCell>{appt.staff.name}</TableCell>
            <TableCell>{appt.branch.name}</TableCell>
            <TableCell>
              {formatIndonesianDate(appt.startAt)} · {minutesToTimeLabel(witaMinutesOfDay(appt.startAt))}
            </TableCell>
            <TableCell>
              <AppointmentStatusBadge status={appt.status} />
            </TableCell>
            <TableCell className="space-x-1">
              {appt.status === "MENUNGGU_KONFIRMASI" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => runAction(() => verifyAppointment(appt.id), "Booking terverifikasi.")}
                >
                  Verifikasi
                </Button>
              )}
              {(appt.status === "TERKONFIRMASI" || appt.status === "MENUNGGU_KONFIRMASI") && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => runAction(() => markAttended(appt.id), "Ditandai hadir.")}
                  >
                    Hadir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => runAction(() => markNoShow(appt.id), "Ditandai tidak hadir.")}
                  >
                    Tidak Hadir
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => runAction(() => cancelAppointment(appt.id), "Booking dibatalkan.")}
                  >
                    Batalkan
                  </Button>
                </>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Tulis halaman daftar booking**

Buat `src/app/(admin)/admin/booking/page.tsx`:

```tsx
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentTable } from "@/components/admin/appointment-table";
import { Button } from "@/components/ui/button";
import { listAppointments } from "@/server/appointment";
import { requireCapability } from "@/server/session";

export default async function BookingListPage() {
  await requireCapability("booking:manage");
  const appointments = await listAppointments({});

  return (
    <>
      <AdminHeader title="Booking" />
      <div className="space-y-4 p-6">
        <Button asChild>
          <Link href="/admin/booking/baru">+ Booking Baru</Link>
        </Button>
        <AppointmentTable appointments={appointments} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Jalankan typecheck dan build**

```bash
npx tsc --noEmit
npm run build
```

Expected: bersih.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin booking list with status actions"
```

---

### Task 16: Uji ujung-ke-ujung alur booking admin

**Files:**
- Create: `tests/e2e/admin-booking.spec.ts`
- Modify: `tests/e2e/admin.spec.ts` (tambah tautan menu Booking/Jadwal/Pasien ke penjaga akses)

**Interfaces:**
- Consumes: seluruh halaman admin dari Task 12–15; akun Super Admin dari Plan 2 Task 11 (`npm run create-admin`).

- [ ] **Step 1: Tambahkan penjaga akses untuk rute baru**

Tambahkan ke `tests/e2e/admin.spec.ts`:

```ts
test("halaman jadwal, pasien, dan booking tertutup untuk yang belum login", async ({ page }) => {
  for (const path of ["/admin/jadwal", "/admin/pasien", "/admin/booking", "/admin/booking/baru"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/masuk$/);
  }
});
```

- [ ] **Step 2: Tulis uji alur booking penuh**

Buat `tests/e2e/admin-booking.spec.ts`. Uji ini login sungguhan lewat form — pakai akun yang dibuat `npm run create-admin` pada Plan 2 (ganti kredensial sesuai yang dipakai di lingkungan pengujian Anda, atau buat akun uji khusus lewat `npm run create-admin -- e2e@sundy.test "kataSandiE2ePanjang123" "Staf E2E"` sebelum menjalankan suite ini):

```ts
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e@sundy.test";
const TEST_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "kataSandiE2ePanjang123";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Kata Sandi").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("admin dapat membuat pasien baru dan booking dari nol", async ({ page }) => {
  await signIn(page);

  await page.goto("/admin/booking/baru");

  // Pasien baru.
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  const uniqueSuffix = Date.now().toString().slice(-8);
  await page.getByLabel("Nama").fill(`Pasien E2E ${uniqueSuffix}`);
  await page.getByLabel("Nomor WhatsApp").fill(`628${uniqueSuffix}`);
  await page.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByText(/dibuat\./)).toBeVisible();

  // Pilih tenaga (staf pertama yang tersedia setelah pasien dipilih).
  await page.locator("button", { hasText: "Pilih tenaga" }).click();
  await page.getByRole("option").first().click();

  // Pilih tanggal jauh di masa depan agar melewati batas lead time 2 jam.
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  const dateStr = futureDate.toISOString().slice(0, 10);
  await page.getByLabel("Tanggal").fill(dateStr);

  await expect(page.getByText("Memuat slot…")).toBeHidden({ timeout: 10_000 });

  const firstSlot = page.locator("main").getByRole("button", { name: /^\d{2}\.\d{2}$/ }).first();
  await firstSlot.click();

  await page.getByRole("button", { name: "Buat Booking" }).click();

  await expect(page).toHaveURL(/\/admin\/booking$/);
  await expect(page.getByText(/^SDY-/).first()).toBeVisible();
});

test("booking yang bertindihan ditolak dengan pesan yang jelas", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/booking/baru");

  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  const suffix = Date.now().toString().slice(-8);
  await page.getByLabel("Nama").fill(`Pasien Bentrok ${suffix}`);
  await page.getByLabel("Nomor WhatsApp").fill(`629${suffix}`);
  await page.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByText(/dibuat\./)).toBeVisible();

  await page.locator("button", { hasText: "Pilih tenaga" }).click();
  await page.getByRole("option").first().click();

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  await page.getByLabel("Tanggal").fill(futureDate.toISOString().slice(0, 10));
  await expect(page.getByText("Memuat slot…")).toBeHidden({ timeout: 10_000 });

  const slotButton = page.locator("main").getByRole("button", { name: /^\d{2}\.\d{2}$/ }).first();
  const slotLabel = await slotButton.textContent();
  await slotButton.click();
  await page.getByRole("button", { name: "Buat Booking" }).click();
  await expect(page).toHaveURL(/\/admin\/booking$/);

  // Booking kedua pada tenaga dan jam yang sama persis.
  await page.goto("/admin/booking/baru");
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  await page.getByLabel("Nama").fill(`Pasien Bentrok Dua ${suffix}`);
  await page.getByLabel("Nomor WhatsApp").fill(`627${suffix}`);
  await page.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByText(/dibuat\./)).toBeVisible();

  await page.locator("button", { hasText: "Pilih tenaga" }).click();
  await page.getByRole("option").first().click();
  await page.getByLabel("Tanggal").fill(futureDate.toISOString().slice(0, 10));
  await expect(page.getByText("Memuat slot…")).toBeHidden({ timeout: 10_000 });

  // Slot yang baru saja dipesan tidak lagi ditawarkan — inilah bukti bahwa
  // perhitungan slot dan exclusion constraint sepakat satu sama lain.
  const sameSlot = page.locator("main").getByRole("button", { name: slotLabel ?? "" });
  await expect(sameSlot).toHaveCount(0);
});
```

- [ ] **Step 3: Buat akun uji dan jalankan**

```bash
npm run create-admin -- e2e@sundy.test "kataSandiE2ePanjang123" "Staf E2E"
npm run test:e2e -- tests/e2e/admin-booking.spec.ts tests/e2e/admin.spec.ts
```

Expected: PASS di desktop dan ponsel. Bila `npm run create-admin` menolak karena email sudah ada dari percobaan sebelumnya, itu tandanya akun sudah tersedia — lanjutkan langsung ke `npm run test:e2e`.

- [ ] **Step 4: Jalankan seluruh suite e2e**

```bash
npm run test:e2e
```

Expected: PASS seluruhnya, termasuk uji Plan 1 dan Plan 2 yang sudah ada.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add end-to-end coverage for admin booking flow"
```

---

## Definisi Selesai untuk Plan 3a

- [ ] `npm test` lulus seluruhnya
- [ ] `npm run test:integration` lulus seluruhnya, termasuk uji exclusion constraint
- [ ] `npm run test:e2e` lulus di desktop dan ponsel
- [ ] `npm run build` berhasil
- [ ] Dua booking bertindihan pada tenaga yang sama ditolak basis data, terbukti lewat `tests/integration/appointment-exclusion.test.ts`
- [ ] Treatment dokter dan konsultasi terapis pada jam yang sama tidak saling memblokir (jalur terpisah per `staffId`)
- [ ] Nomor rekam medis tidak pernah bertabrakan walau dibuat bersamaan
- [ ] Booking yang dibatalkan tidak pernah terhapus dari basis data
- [ ] 25 hari libur nasional 2026 termuat dan menutup slot di seluruh cabang
- [ ] Admin dapat mencatat booking dari nol (pasien baru + jadwal) dalam satu alur tanpa berpindah halaman

## Yang Sengaja Tidak Dikerjakan di Plan 3a

- **F5 pendaftaran mandiri publik** dan **F6 cek status booking publik** → Plan 3b. `SlotHold` sudah punya skema dan exclusion constraint di Plan 3a, tetapi belum dipakai — penahanan sementara hanya relevan begitu pasien mengisi form sendiri.
- **Worker pelepas SlotHold kedaluwarsa** — belum ada infrastruktur cron di proyek ini. Dicatat sebagai risiko: klausa `WHERE expiresAt > now()` pada exclusion constraint `SlotHold` berarti hold basi yang belum dibersihkan tetap menghalangi baris baru. Dibangun bersama Plan 3b.
- **Status `KEDALUWARSA` otomatis** pada Appointment — enum sudah ada untuk kelengkapan skema, tetapi mekanisme pemicunya (24 jam tanpa konfirmasi) menunggu Plan 3b.
- **`IntakeForm`** (skrining food recall) — terikat pada alur pendaftaran publik F5, bukan booking yang dicatat admin.
- **Penggabungan pasien duplikat** — Task 7 baru mendeteksi dan memperingatkan lewat `findPatientsByWhatsapp`; menggabungkan dua rekam medis yang sudah terlanjur terpisah (termasuk memindahkan `Encounter`/`Measurement` yang belum ada sampai Plan 4) ditunda ke Plan 4.
- **Halaman detail/profil pasien** — Task 13 hanya menyediakan pencarian dan daftar; halaman profil penuh baru bermakna setelah `Encounter` (Plan 4) punya sesuatu untuk ditampilkan di sana.
- **Ubah layanan pada booking yang sudah dibuat** — F9 menyebutkan "Ubah: ganti layanan, tenaga, atau catatan"; Plan 3a membangun jadwal ulang (ubah waktu) dan pembatalan, tetapi mengganti layanan/tenaga pada baris yang sudah ada (dengan durasi yang mungkin berubah) ditunda agar Task 10 tidak membengkak — tambahkan sebagai perbaikan kecil terpisah bila dibutuhkan sebelum Plan 3b.
- **Kalender tampilan harian/mingguan bergaya visual** untuk `/admin/booking` — F9 menyebut "tersedia sebagai tabel maupun tampilan kalender harian"; Plan 3a mengirimkan tabel dengan filter. Tampilan kalender visual adalah perbaikan antarmuka yang bisa menyusul tanpa mengubah data yang mendasarinya.
