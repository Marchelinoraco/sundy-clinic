# Hasil Timbang BIA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staf klinik mengunggah berkas hasil Timbang BIA (foto/PDF) untuk kunjungan hari itu, dokter mengisi tujuh angka komposisi tubuh, dan angka itu tampil sebagai grafik progres per pasien.

**Architecture:** Dua tabel baru (`BiaMeasurement`, `BiaFile`) di PostgreSQL dengan CHECK, indeks unik sebagian, dan pemicu kunci. Berkas ditulis ke `PATIENT_FILES_DIR/bia/<tahun>/<bulan>/<uuid>.<ext>` (sudah masuk backup harian) dan hanya bisa dibuka lewat rute yang memeriksa login dan hak. Aturan murni (rentang angka, jenis berkas dari byte awal, matriks hak) ada di `src/lib/bia.ts`; layanan unggah, aksi server, dan pembacaan di `src/server/bia-*.ts`; layar MUI di `src/components/admin/bia/`.

**Tech Stack:** Next.js 15 (route handler multipart), Prisma 7 + PostgreSQL, Vitest (unit + integrasi), Playwright, Material UI + MUI X Charts (grafik), `node:fs/promises` untuk berkas.

**Spec:** `docs/superpowers/specs/2026-10-09-hasil-bia-design.md` (disetujui pemilik). Baca juga spec Material UI `docs/superpowers/specs/2026-10-08-admin-material-ui-design.md` untuk gaya komponen admin.

## Global Constraints

- **Bahasa:** semua teks yang dilihat pengguna, pesan galat, nama uji, dan komentar kode dalam Bahasa Indonesia (mengikuti kode yang ada). Nama berkas, fungsi, dan commit dalam bahasa Inggris.
- **Angka BIA (spec 3.1):** `bodyFatPercent` Desimal(4,1) 2–70; `muscleMassKg` Desimal(5,1) 5–120; `visceralFat` bulat 1–59; `bmr` bulat 500–5000; `metabolicAge` bulat 5–110; `bodyWaterPercent` Desimal(4,1) 20–80; `boneMassKg` Desimal(3,1) 0,5–10. Semua boleh kosong, tetapi simpan kosong semuanya ditolak. Koma dan titik sama-sama tanda desimal; paling banyak satu angka di belakang koma.
- **Berkas (spec 4.1):** JPG, PNG, WebP, HEIC, PDF; **10 MB** (`10 * 1024 * 1024` byte) per berkas; paling banyak **5 berkas aktif** per pengukuran; jenis ditentukan dari byte awal, bukan nama atau ekstensi.
- **Penyimpanan (spec 4.2):** `<PATIENT_FILES_DIR>/bia/<tahun>/<bulan>/<uuid>.<ext>`, bawaan `PATIENT_FILES_DIR=/www/sundy-files`; berkas izin 0600, folder 0700; ditulis ke nama sementara lalu `rename`; nama asli tidak pernah menjadi bagian jalur disk.
- **Rute (spec 4.3):** `POST /admin/bia/unggah` (satu berkas per permintaan, periksa `Origin`), `GET /admin/bia/berkas/<id>` (`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`). Tidak ada alamat publik dan tidak ada pemetaan nginx ke folder berkas.
- **Hak (spec 5):** kemampuan baru `bia:upload` untuk SUPER_ADMIN, DOKTER, RESEPSIONIS. Membuka berkas dan angka memakai `record:read`; mengisi/mengubah angka memakai `record:write`. Resepsionis hanya melihat status ("BIA terunggah", jam, nama), tidak tautan ke berkas dan tidak angka.
- **Tanpa penghapusan sungguhan (B6):** berkas dan pengukuran yang salah ditandai **dibatalkan** (alasan wajib, paling banyak 300 karakter lewat `validateReason` dari `@/lib/stock`); berkas tetap di disk.
- **Hanya kanal klinik, status `HADIR` atau `SELESAI`** (spec 3.3). Konsultasi online tidak punya BIA.
- **Pola kode yang ada:** aksi server memakai `runAction`/`UserFacingError` dari `@/lib/action-result` dan `requireCapability` dari `@/server/session`; audit lewat `recordAudit`/`recordAuditThrottled` dari `@/server/audit`; nama staf disalin sebagai `xxxById` + `xxxByName` tanpa relasi (seperti `Encounter` dan `Expense`); komponen admin memakai MUI per berkas (`import Button from "@mui/material/Button"`), tanpa shadcn, tanpa lucide, tanpa kelas warna Tailwind (dijaga `tests/unit/architecture.test.ts`).
- **Pengujian:** unit `npx vitest run <berkas>`; integrasi `npm run test:integration -- <berkas>` (basis data uji; **jangan** bersamaan dengan E2E); E2E `npx playwright test <berkas> --project=desktop` lalu `--project=mobile` (laptop 8 GB: per berkas dan per proyek). Setelah mengubah `prisma/schema.prisma`: `npx prisma generate`; setelah menambah migrasi: `npm run db:migrate:test`.
- **Uji yang sudah gagal sebelumnya:** 3 uji `tests/integration/schedule.test.ts`. Jangan diubah.
- **Commit:** Conventional Commits berbahasa Inggris, diakhiri baris `Co-Authored-By` yang menyebut model penulis commit. **Jangan pernah men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Push, merge, dan deploy hanya atas permintaan pemilik.
- **Log kerja:** `WS` = `.superpowers/sdd/2026-10-09-plan-hasil-bia/` (git-ignored).

## Keputusan perencana (penyimpangan kecil dari spec, sudah dipertimbangkan)

1. **Kunci angka per pengukuran, bukan per kunjungan.** Spec 3.3 menulis "setelah SELESAI angka tidak bisa diubah" dan juga "boleh menambah pengukuran baru setelah final". Agar keduanya konsisten: angka yang **sudah pernah disimpan** (`numbersAt` terisi) terkunci begitu booking `SELESAI`; pengukuran yang angkanya belum pernah diisi boleh diisi **satu kali** setelah final (dokter lupa mengisi, atau pengukuran koreksi). Pemicu basis data dan aksi server memakai aturan yang sama.
2. **Tanpa relasi ke `Staff`** untuk pengunggah, pengisi angka, dan pembatal: `…ById` dan `…ByName` disalin, mengikuti `Encounter`/`Expense`, supaya catatan tetap terbaca bila staf dinonaktifkan. Spec menulis `…StaffId`; nama kolom di rencana ini (`createdById`, `numbersById`, `voidedById`, `uploadedById`) yang berlaku.
3. **Resepsionis membatalkan unggahan sendiri:** UI menampilkan tombol Batalkan pada setiap berkas di dialog; server yang menolak bila berkas bukan miliknya ("Anda hanya bisa membatalkan unggahan Anda sendiri.").
4. **Pembukaan berkas dibaca utuh ke memori** (maks. 10 MB) lalu dikirim sebagai `Response`, bukan dialirkan: cukup untuk volume klinik dan lebih sederhana. HEIC dikirim sebagai unduhan.

## Review Focus

Masukan dan keadaan yang tidak disebut spec tetapi paling mungkin menggigit; tiap baris sudah punya uji di tugas yang tertulis di kanan.

1. **Berkas palsu**: file HTML/skrip/SVG berekstensi `.jpg` atau bermime `image/jpeg` harus ditolak dari byte awalnya, dan berkas yang disajikan selalu bermime dari jenis terdeteksi dengan `nosniff` → Task 2 (deteksi), Task 4 (rute).
2. **Menebak alamat berkas**: resepsionis atau pengunjung tanpa login yang membuka `/admin/bia/berkas/<id>` harus 403/401, termasuk untuk id yang benar → Task 4.
3. **Dua unggahan serentak** pada booking yang belum punya pengukuran, dan unggahan ke-6 serentak: tidak boleh ada dua pengukuran aktif atau lebih dari 5 berkas aktif → Task 4.
4. **Unggahan setengah jalan**: bila basis data menolak setelah berkas tertulis (mis. berkas ke-6), berkas di disk dihapus dan tidak ada baris yatim → Task 4.
5. **Angka salah ketik dan simpan basi**: "28,5", "28.5", "2.85e1", "-5", "abc", kosong semua, di luar rentang; simpan dengan versi lama ditolak; angka tersimpan tidak bisa diubah setelah final → Task 2, Task 5.

---

### Task 1: Skema, migrasi, dan pemicu kunci

**Files:**
- Modify: `prisma/schema.prisma` (dua model baru + relasi balik di `Appointment` dan `Patient`)
- Create: `prisma/migrations/20261009120000_hasil_bia/migration.sql`
- Create: `tests/integration/bia-schema.test.ts`
- Modify: `tests/unit/migrations.test.ts` (blok baru di akhir berkas)
- Modify: `tests/purge-encounters.ts` (tabel BIA ikut dibersihkan)
- Modify: `tests/integration/invoice-world.ts` (`cleanupBillingWorld` menghapus baris BIA)

**Interfaces:**
- Consumes: —
- Produces: model Prisma `BiaMeasurement` (`prisma.biaMeasurement`) dan `BiaFile` (`prisma.biaFile`) dengan kolom persis seperti di Step 1; relasi `Appointment.biaMeasurements`, `Patient.biaMeasurements`; kesalahan basis data bernama `bia_body_fat_range`, `bia_muscle_range`, `bia_visceral_range`, `bia_bmr_range`, `bia_metabolic_age_range`, `bia_water_range`, `bia_bone_range`, `bia_void_fields`, `bia_file_void_fields`, `bia_file_size`, indeks unik `BiaMeasurement_one_active_per_appointment`, dan pesan pemicu berawalan `bia_terkunci`.

- [ ] **Step 1: Tambahkan model ke `prisma/schema.prisma`**

Di model `Appointment`, setelah baris `encounter   Encounter?` tambahkan satu baris `biaMeasurements BiaMeasurement[]`. Di model `Patient`, setelah baris pertama `invoices            Invoice[]` tambahkan `biaMeasurements     BiaMeasurement[]`. Lalu tambahkan di akhir berkas:

```prisma
/// Satu pengukuran Timbang BIA untuk satu booking klinik (spec hasil BIA 3.1). Hanya satu yang aktif per booking
/// (indeks unik sebagian di migrasi). Dibatalkan, tidak dihapus.
model BiaMeasurement {
  id            String      @id @default(cuid())
  appointmentId String
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Restrict)
  patientId     String
  patient       Patient     @relation(fields: [patientId], references: [id], onDelete: Restrict)

  bodyFatPercent   Decimal? @db.Decimal(4, 1)
  muscleMassKg     Decimal? @db.Decimal(5, 1)
  visceralFat      Int?
  bmr              Int?
  metabolicAge     Int?
  bodyWaterPercent Decimal? @db.Decimal(4, 1)
  boneMassKg       Decimal? @db.Decimal(3, 1)
  note             String?

  /// Siapa dan kapan angka terakhir disimpan; `numbersAt` kosong = angka belum pernah diisi.
  numbersById   String?
  numbersByName String?
  numbersAt     DateTime?
  /// Naik tiap angka disimpan; simpan dengan versi lama ditolak.
  version       Int       @default(1)

  /// Id dan nama staf disalin tanpa relasi (seperti Encounter) agar catatan tetap terbaca bila staf dinonaktifkan.
  createdById   String
  createdByName String
  voidedAt      DateTime?
  voidedById    String?
  voidedByName  String?
  voidReason    String?

  files BiaFile[]

  createdAt DateTime @default(now())

  @@index([patientId, createdAt])
  @@index([appointmentId])
}

/// Satu berkas hasil BIA (foto/PDF) milik satu pengukuran. Isinya di disk (`PATIENT_FILES_DIR/bia/<storageName>`).
model BiaFile {
  id            String         @id @default(cuid())
  measurementId String
  measurement   BiaMeasurement @relation(fields: [measurementId], references: [id], onDelete: Restrict)

  /// Jalur relatif di bawah `bia/`: `<tahun>/<bulan>/<uuid>.<ext>`. Acak; nama asli tidak dipakai di disk.
  storageName  String @unique
  originalName String
  mimeType     String
  sizeBytes    Int
  sha256       String

  uploadedById   String
  uploadedByName String
  uploadedAt     DateTime @default(now())
  voidedAt       DateTime?
  voidedById     String?
  voidedByName   String?
  voidReason     String?

  @@index([measurementId])
}
```

- [ ] **Step 2: Buat klien Prisma dan tulis uji skema (RED)**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`.

`tests/integration/bia-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

const SLUG = "skema-bia";
const WA = "6281200009100";

describe("skema hasil BIA", () => {
  let world: BillingWorld;
  let hadir: string;
  let selesai: string;

  const measurement = (data: Record<string, unknown> = {}, appointmentId = hadir) =>
    prisma.biaMeasurement.create({
      data: { appointmentId, patientId: world.patientId, createdById: "s1", createdByName: "Uji", ...data },
    });
  const file = (measurementId: string, data: Record<string, unknown> = {}) =>
    prisma.biaFile.create({
      data: {
        measurementId,
        storageName: `2035/01/${crypto.randomUUID()}.jpg`,
        originalName: "bia.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        sha256: "a".repeat(64),
        uploadedById: "s1",
        uploadedByName: "Uji",
        ...data,
      },
    });
  const clear = async () => {
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
  };

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    hadir = (await finalVisit(world)).appointmentId;
    selesai = (await finalVisit(world)).appointmentId;
    // Finalisasi sungguhan memindahkan booking HADIR → SELESAI dalam transaksi yang sama.
    await prisma.appointment.update({ where: { id: selesai }, data: { status: "SELESAI" } });
  });
  beforeEach(clear);
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("setiap angka dijaga rentangnya di basis data", async () => {
    await expect(measurement({ bodyFatPercent: 1.9 })).rejects.toThrow(/bia_body_fat_range/);
    await expect(measurement({ bodyFatPercent: 70.1 })).rejects.toThrow(/bia_body_fat_range/);
    await expect(measurement({ muscleMassKg: 4.9 })).rejects.toThrow(/bia_muscle_range/);
    await expect(measurement({ visceralFat: 0 })).rejects.toThrow(/bia_visceral_range/);
    await expect(measurement({ visceralFat: 60 })).rejects.toThrow(/bia_visceral_range/);
    await expect(measurement({ bmr: 499 })).rejects.toThrow(/bia_bmr_range/);
    await expect(measurement({ metabolicAge: 4 })).rejects.toThrow(/bia_metabolic_age_range/);
    await expect(measurement({ bodyWaterPercent: 19.9 })).rejects.toThrow(/bia_water_range/);
    await expect(measurement({ boneMassKg: 0.4 })).rejects.toThrow(/bia_bone_range/);
    const ok = await measurement({ bodyFatPercent: 28.5, muscleMassKg: 41, visceralFat: 9, bmr: 1450, metabolicAge: 38, bodyWaterPercent: 47.5, boneMassKg: 2.6 });
    expect(Number(ok.bodyFatPercent)).toBe(28.5);
  });

  it("satu booking hanya boleh punya satu pengukuran aktif; yang dibatalkan tidak menghalangi", async () => {
    const first = await measurement();
    await expect(measurement()).rejects.toThrow(/BiaMeasurement_one_active_per_appointment|Unique constraint/);
    await prisma.biaMeasurement.update({
      where: { id: first.id },
      data: { voidedAt: new Date(), voidedById: "s1", voidedByName: "Uji", voidReason: "Salah timbang" },
    });
    expect((await measurement()).voidedAt).toBeNull();
  });

  it("data pembatalan harus lengkap atau kosong semuanya", async () => {
    await expect(measurement({ voidedAt: new Date() })).rejects.toThrow(/bia_void_fields/);
    await expect(measurement({ voidedAt: new Date(), voidedByName: "x" })).rejects.toThrow(/bia_void_fields/);
    const m = await measurement({ voidedAt: new Date(), voidedById: "s1", voidedByName: "Uji", voidReason: "Salah" });
    await expect(file(m.id, { voidedAt: new Date() })).rejects.toThrow(/bia_file_void_fields/);
  });

  it("ukuran berkas harus lebih dari 0 dan paling besar 10 MB", async () => {
    const m = await measurement();
    await expect(file(m.id, { sizeBytes: 0 })).rejects.toThrow(/bia_file_size/);
    await expect(file(m.id, { sizeBytes: 10 * 1024 * 1024 + 1 })).rejects.toThrow(/bia_file_size/);
    expect((await file(m.id, { sizeBytes: 10 * 1024 * 1024 })).sizeBytes).toBe(10 * 1024 * 1024);
  });

  it("angka yang sudah tersimpan terkunci setelah booking SELESAI; yang belum pernah diisi boleh diisi satu kali", async () => {
    const filled = await measurement({ bodyFatPercent: 30, numbersAt: new Date(), numbersById: "s1", numbersByName: "Uji" }, selesai);
    await expect(prisma.biaMeasurement.update({ where: { id: filled.id }, data: { bodyFatPercent: 25 } })).rejects.toThrow(/bia_terkunci/);
    await expect(prisma.biaMeasurement.update({ where: { id: filled.id }, data: { note: "Ubah" } })).rejects.toThrow(/bia_terkunci/);
    // Pembatalan tetap boleh.
    await prisma.biaMeasurement.update({ where: { id: filled.id }, data: { voidedAt: new Date(), voidedById: "s1", voidedByName: "Uji", voidReason: "Koreksi" } });

    const empty = await measurement({}, selesai);
    const first = await prisma.biaMeasurement.update({
      where: { id: empty.id },
      data: { bodyFatPercent: 27, numbersAt: new Date(), numbersById: "s1", numbersByName: "Uji" },
    });
    expect(Number(first.bodyFatPercent)).toBe(27);
    await expect(prisma.biaMeasurement.update({ where: { id: empty.id }, data: { bodyFatPercent: 26 } })).rejects.toThrow(/bia_terkunci/);
  });

  it("selama booking HADIR angka boleh diubah", async () => {
    const m = await measurement({ bodyFatPercent: 30, numbersAt: new Date(), numbersById: "s1", numbersByName: "Uji" });
    const updated = await prisma.biaMeasurement.update({ where: { id: m.id }, data: { bodyFatPercent: 29, version: { increment: 1 } } });
    expect(Number(updated.bodyFatPercent)).toBe(29);
  });
});
```

Run: `npm run test:integration -- tests/integration/bia-schema.test.ts`
Expected: FAIL (tabel `BiaMeasurement` belum ada di basis data uji).

- [ ] **Step 3: Susun migrasi**

Prisma 7 membuat SQL dasar tanpa basis data:

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-sebelum.prisma
npx prisma migrate diff --from-schema /tmp/schema-sebelum.prisma --to-schema prisma/schema.prisma --script > /tmp/bia-dasar.sql
mkdir -p prisma/migrations/20261009120000_hasil_bia
```

Buat `prisma/migrations/20261009120000_hasil_bia/migration.sql` berisi komentar kepala di bawah, lalu **isi `/tmp/bia-dasar.sql` apa adanya** (CREATE TABLE, indeks, kunci asing), lalu bagian "penjaga" di bawahnya. Periksa bahwa `/tmp/bia-dasar.sql` hanya berisi `CREATE TABLE "BiaMeasurement"`, `CREATE TABLE "BiaFile"`, `CREATE INDEX`/`CREATE UNIQUE INDEX "BiaFile_storageName_key"`, dan `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`; bila ada `DROP` atau `ALTER … DROP`, berhenti dan periksa `git status`/`git stash` (skema sebelum tidak sama dengan `HEAD`).

Kepala berkas:

```sql
-- Hasil Timbang BIA (spec hasil BIA 3). Migrasi hanya menambah: dua tabel baru, tanpa mengubah tabel lama,
-- sehingga rilis sebelumnya tetap berjalan dan `deploy.sh kembali` aman.
```

Bagian penjaga (tempel setelah SQL Prisma):

```sql
-- Rentang angka (spec 3.1): terakhir diperiksa lagi di server dan formulir; di sini jaring pengaman terakhir.
ALTER TABLE "BiaMeasurement"
  ADD CONSTRAINT bia_body_fat_range CHECK ("bodyFatPercent" IS NULL OR ("bodyFatPercent" >= 2 AND "bodyFatPercent" <= 70)),
  ADD CONSTRAINT bia_muscle_range CHECK ("muscleMassKg" IS NULL OR ("muscleMassKg" >= 5 AND "muscleMassKg" <= 120)),
  ADD CONSTRAINT bia_visceral_range CHECK ("visceralFat" IS NULL OR ("visceralFat" >= 1 AND "visceralFat" <= 59)),
  ADD CONSTRAINT bia_bmr_range CHECK ("bmr" IS NULL OR ("bmr" >= 500 AND "bmr" <= 5000)),
  ADD CONSTRAINT bia_metabolic_age_range CHECK ("metabolicAge" IS NULL OR ("metabolicAge" >= 5 AND "metabolicAge" <= 110)),
  ADD CONSTRAINT bia_water_range CHECK ("bodyWaterPercent" IS NULL OR ("bodyWaterPercent" >= 20 AND "bodyWaterPercent" <= 80)),
  ADD CONSTRAINT bia_bone_range CHECK ("boneMassKg" IS NULL OR ("boneMassKg" >= 0.5 AND "boneMassKg" <= 10)),
  ADD CONSTRAINT bia_void_fields CHECK (
    ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidedByName" IS NULL AND "voidReason" IS NULL)
    OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidedByName" IS NOT NULL AND "voidReason" IS NOT NULL)
  );

ALTER TABLE "BiaFile"
  ADD CONSTRAINT bia_file_size CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
  ADD CONSTRAINT bia_file_void_fields CHECK (
    ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidedByName" IS NULL AND "voidReason" IS NULL)
    OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidedByName" IS NOT NULL AND "voidReason" IS NOT NULL)
  );

-- Hanya satu pengukuran aktif per booking; yang dibatalkan tidak dihitung.
CREATE UNIQUE INDEX "BiaMeasurement_one_active_per_appointment" ON "BiaMeasurement"("appointmentId") WHERE "voidedAt" IS NULL;

-- Angka yang sudah tersimpan tidak bisa diubah setelah booking SELESAI (spec 3.3, keputusan perencana 1).
-- Pembatalan (kolom void*) dan pengisian pertama (numbersAt masih kosong) tetap boleh.
CREATE FUNCTION bia_numbers_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."numbersAt" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "Appointment" WHERE "id" = OLD."appointmentId" AND "status" = 'SELESAI')
     AND (
       NEW."bodyFatPercent" IS DISTINCT FROM OLD."bodyFatPercent"
       OR NEW."muscleMassKg" IS DISTINCT FROM OLD."muscleMassKg"
       OR NEW."visceralFat" IS DISTINCT FROM OLD."visceralFat"
       OR NEW."bmr" IS DISTINCT FROM OLD."bmr"
       OR NEW."metabolicAge" IS DISTINCT FROM OLD."metabolicAge"
       OR NEW."bodyWaterPercent" IS DISTINCT FROM OLD."bodyWaterPercent"
       OR NEW."boneMassKg" IS DISTINCT FROM OLD."boneMassKg"
       OR NEW."note" IS DISTINCT FROM OLD."note"
     ) THEN
    RAISE EXCEPTION 'bia_terkunci: angka BIA milik kunjungan final tidak bisa diubah (%)', OLD."id";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bia_numbers_locked
BEFORE UPDATE ON "BiaMeasurement"
FOR EACH ROW EXECUTE FUNCTION bia_numbers_locked();
```

- [ ] **Step 4: Terapkan ke basis data uji dan jalankan uji (GREEN)**

Run: `npm run db:migrate:test`
Expected: `Applying migration `20261009120000_hasil_bia``.

Run: `npm run test:integration -- tests/integration/bia-schema.test.ts`
Expected: PASS (5 uji). Bila `prisma migrate dev` kelak mengeluh drift, bandingkan SQL migrasi dengan `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` (harus kosong selain objek penjaga yang tidak dikenal Prisma).

- [ ] **Step 5: Bersihkan tabel BIA di pembantu uji**

`tests/purge-encounters.ts`: ganti daftar `TABLES` dengan (BIA lebih dulu karena merujuk booking, `BiaFile` sebelum `BiaMeasurement`):

```ts
// BiaFile lalu BiaMeasurement lebih dulu: keduanya merujuk booking. FoodRecall sebelum kunjungan: trigger kuncinya membaca status kunjungan.
const TABLES = ['"BiaFile"', '"BiaMeasurement"', '"FoodRecall"', '"EncounterAddendum"', '"EncounterTreatment"', '"Encounter"'] as const;
```

`tests/integration/invoice-world.ts`, di `cleanupBillingWorld`, tepat sebelum baris `await cleanupBookingWorld(slug, patientWhatsapps);`:

```ts
  await prisma.biaFile.deleteMany({ where: { measurement: { appointment: { branch } } } });
  await prisma.biaMeasurement.deleteMany({ where: { appointment: { branch } } });
```

`tests/unit/migrations.test.ts`, tambahkan di akhir berkas:

```ts
describe("migrasi hasil BIA", () => {
  const sql = readFileSync("prisma/migrations/20261009120000_hasil_bia/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga rentang angka, pembatalan, ukuran berkas, satu pengukuran aktif, dan kunci setelah final", () => {
    for (const name of ["bia_body_fat_range", "bia_muscle_range", "bia_visceral_range", "bia_bmr_range", "bia_metabolic_age_range", "bia_water_range", "bia_bone_range", "bia_void_fields", "bia_file_void_fields", "bia_file_size"]) {
      expect(sql).toContain(name);
    }
    expect(sql).toMatch(/CREATE UNIQUE INDEX "BiaMeasurement_one_active_per_appointment"[\s\S]*WHERE "voidedAt" IS NULL/);
    expect(sql).toMatch(/CREATE TRIGGER bia_numbers_locked/);
  });
});
```

Run: `npx vitest run tests/unit/migrations.test.ts` → PASS. Lalu `npm run test:integration -- tests/integration/bia-schema.test.ts tests/integration/encounter-schema.test.ts` → PASS (memastikan pembersihan bersama tidak merusak uji lain).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261009120000_hasil_bia tests/integration/bia-schema.test.ts tests/unit/migrations.test.ts tests/purge-encounters.ts tests/integration/invoice-world.ts
git commit -m "feat: add BIA measurement and file tables with range checks and a lock after the visit is final"
```

---

### Task 2: Aturan murni `src/lib/bia.ts` dan kemampuan `bia:upload`

**Files:**
- Create: `src/lib/bia.ts`
- Modify: `src/lib/permissions.ts` (kemampuan `bia:upload`)
- Test: `tests/unit/bia.test.ts` (baru), `tests/unit/permissions.test.ts` (tambah blok)

**Interfaces:**
- Consumes: `formatDecimal(value: number, maxFractionDigits: 0 | 1 = 1): string` dari `@/lib/encounter`; `can(role, capability)` dari `@/lib/permissions`.
- Produces (semua dari `@/lib/bia`):
  - `type BiaKey = "bodyFatPercent" | "muscleMassKg" | "visceralFat" | "bmr" | "metabolicAge" | "bodyWaterPercent" | "boneMassKg"`; `type BiaNumbers = Record<BiaKey, number | null>`; `type BiaInput = Record<BiaKey, string>`.
  - `BIA_FIELDS: readonly { key: BiaKey; label: string; unit: string; min: number; max: number; decimals: 0 | 1 }[]` (urutan seperti di spec); `BIA_KEYS: BiaKey[]`; `EMPTY_BIA_NUMBERS`, `EMPTY_BIA_INPUT`.
  - `BIA_NOTE_MAX = 500`, `BIA_MAX_FILES = 5`, `BIA_MAX_BYTES = 10 * 1024 * 1024`, `BIA_ACCEPT: string`.
  - `parseBiaNumber(spec, raw): { ok: true; value: number | null } | { ok: false; message: string }`.
  - `parseBiaInput(input: BiaInput, note: string): { ok: true; value: { numbers: BiaNumbers; note: string | null } } | { ok: false; message: string }`.
  - `biaInputValue(key: BiaKey, value: number | null): string`; `biaFieldLabel(spec): string` (`"Lemak tubuh (%)"`, untuk lemak viseral hanya `"Lemak viseral"`).
  - `type BiaFileType = { mime: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf"; ext: "jpg" | "png" | "webp" | "heic" | "pdf"; previewable: boolean }`; `detectBiaFileType(bytes: Uint8Array): BiaFileType | null`.
  - `safeOriginalName(name: string): string`; `contentDisposition(name: string, disposition: "inline" | "attachment"): string`.
  - `type BiaAccess = { upload: boolean; editNumbers: boolean; voidAny: boolean; voidOwnFile: boolean; view: boolean }`; `biaAccess(role: StaffRole, appointment: { status: string; channel: "KLINIK" | "ONLINE" }): BiaAccess`.
  - `type BiaPoint = { at: Date; bodyFatPercent: number | null; muscleMassKg: number | null }`.

- [ ] **Step 1: Tulis uji (RED)**

`tests/unit/bia.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BIA_FIELDS,
  BIA_MAX_BYTES,
  EMPTY_BIA_INPUT,
  biaAccess,
  biaFieldLabel,
  biaInputValue,
  contentDisposition,
  detectBiaFileType,
  parseBiaInput,
  parseBiaNumber,
  safeOriginalName,
} from "@/lib/bia";

const spec = (key: string) => BIA_FIELDS.find((field) => field.key === key)!;
const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

describe("angka BIA", () => {
  it("menerima koma dan titik, satu angka di belakang koma, dan kosong", () => {
    expect(parseBiaNumber(spec("bodyFatPercent"), "28,5")).toEqual({ ok: true, value: 28.5 });
    expect(parseBiaNumber(spec("bodyFatPercent"), " 28.5 ")).toEqual({ ok: true, value: 28.5 });
    expect(parseBiaNumber(spec("bodyFatPercent"), "")).toEqual({ ok: true, value: null });
    expect(parseBiaNumber(spec("visceralFat"), "9")).toEqual({ ok: true, value: 9 });
  });

  it("menolak huruf, notasi ilmiah, negatif, desimal pada angka bulat, dan dua angka di belakang koma", () => {
    for (const raw of ["abc", "2.85e1", "-5", "28,5,1", "28,"]) {
      expect(parseBiaNumber(spec("bodyFatPercent"), raw).ok).toBe(false);
    }
    expect(parseBiaNumber(spec("visceralFat"), "9,5")).toEqual({ ok: false, message: "Lemak viseral harus bilangan bulat." });
    expect(parseBiaNumber(spec("bodyFatPercent"), "28,55")).toEqual({ ok: false, message: "Lemak tubuh paling banyak satu angka di belakang koma." });
  });

  it("menolak di luar rentang dengan pesan yang menyebut nama dan rentangnya", () => {
    expect(parseBiaNumber(spec("bodyFatPercent"), "1,9")).toEqual({ ok: false, message: "Lemak tubuh harus 2–70 %." });
    expect(parseBiaNumber(spec("boneMassKg"), "0,4")).toEqual({ ok: false, message: "Massa tulang harus 0,5–10 kg." });
    expect(parseBiaNumber(spec("visceralFat"), "60")).toEqual({ ok: false, message: "Lemak viseral harus 1–59." });
    const bmr = parseBiaNumber(spec("bmr"), "5001");
    expect(bmr.ok).toBe(false);
    expect(!bmr.ok && bmr.message).toMatch(/^Metabolisme basal harus 500–5\.?000 kkal\.$/);
  });

  it("menyimpan semua angka yang diisi dan menolak simpan yang kosong semuanya", () => {
    const parsed = parseBiaInput({ ...EMPTY_BIA_INPUT, bodyFatPercent: "28,5", muscleMassKg: "41", bmr: "1450" }, "  Puasa 8 jam ");
    expect(parsed).toEqual({
      ok: true,
      value: {
        numbers: { bodyFatPercent: 28.5, muscleMassKg: 41, visceralFat: null, bmr: 1450, metabolicAge: null, bodyWaterPercent: null, boneMassKg: null },
        note: "Puasa 8 jam",
      },
    });
    expect(parseBiaInput(EMPTY_BIA_INPUT, "")).toEqual({ ok: false, message: "Isi minimal satu angka BIA." });
    expect(parseBiaInput({ ...EMPTY_BIA_INPUT, bmr: "20" }, "")).toEqual({ ok: false, message: expect.stringContaining("Metabolisme basal harus") });
    expect(parseBiaInput({ ...EMPTY_BIA_INPUT, bmr: "1450" }, "x".repeat(501))).toEqual({ ok: false, message: "Catatan paling banyak 500 karakter." });
  });

  it("menulis angka kembali ke isian dengan koma desimal, dan label memuat satuan", () => {
    expect(biaInputValue("bodyFatPercent", 28.5)).toBe("28,5");
    expect(biaInputValue("visceralFat", 9)).toBe("9");
    expect(biaInputValue("boneMassKg", null)).toBe("");
    expect(biaFieldLabel(spec("bodyFatPercent"))).toBe("Lemak tubuh (%)");
    expect(biaFieldLabel(spec("visceralFat"))).toBe("Lemak viseral");
    expect(biaFieldLabel(spec("bmr"))).toBe("Metabolisme basal (kkal)");
  });
});

describe("jenis berkas dari byte awal", () => {
  it("mengenali JPEG, PNG, WebP, HEIC, dan PDF", () => {
    expect(detectBiaFileType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toEqual({ mime: "image/jpeg", ext: "jpg", previewable: true });
    expect(detectBiaFileType(bytes(0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({ mime: "image/png", ext: "png", previewable: true });
    expect(detectBiaFileType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toEqual({ mime: "image/webp", ext: "webp", previewable: true });
    expect(detectBiaFileType(bytes(0, 0, 0, 24, ...ascii("ftypheic"), 0))).toEqual({ mime: "image/heic", ext: "heic", previewable: false });
    expect(detectBiaFileType(bytes(0, 0, 0, 24, ...ascii("ftypmif1"), 0))).toEqual({ mime: "image/heic", ext: "heic", previewable: false });
    expect(detectBiaFileType(bytes(...ascii("%PDF-1.7")))).toEqual({ mime: "application/pdf", ext: "pdf", previewable: true });
  });

  it("menolak HTML, SVG, skrip, dan berkas pendek walau diberi nama atau mime gambar", () => {
    expect(detectBiaFileType(bytes(...ascii("<!doctype html><script>alert(1)</script>")))).toBeNull();
    expect(detectBiaFileType(bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBeNull();
    expect(detectBiaFileType(bytes(...ascii("MZ\x90\x00")))).toBeNull();
    expect(detectBiaFileType(bytes(0xff, 0xd8))).toBeNull();
    expect(detectBiaFileType(new Uint8Array(0))).toBeNull();
    // MP4 punya "ftyp" juga, tetapi mereknya bukan HEIC.
    expect(detectBiaFileType(bytes(0, 0, 0, 24, ...ascii("ftypisom"), 0))).toBeNull();
  });

  it("batas ukuran 10 MB", () => {
    expect(BIA_MAX_BYTES).toBe(10_485_760);
  });
});

describe("nama berkas", () => {
  it("membuang jalur, karakter kendali, dan tanda kutip; menjaga ekstensi saat dipotong", () => {
    expect(safeOriginalName("C:\\Users\\Rina\\hasil bia.png")).toBe("hasil bia.png");
    expect(safeOriginalName("../../etc/passwd")).toBe("passwd");
    expect(safeOriginalName('a"b\u0000c.pdf')).toBe("abc.pdf");
    expect(safeOriginalName("   ")).toBe("berkas");
    expect(safeOriginalName("..")).toBe("berkas");
    const long = safeOriginalName(`${"a".repeat(300)}.jpeg`);
    expect(long.length).toBe(120);
    expect(long.endsWith(".jpeg")).toBe(true);
  });

  it("header Content-Disposition memuat nama aman dan versi UTF-8", () => {
    expect(contentDisposition("hasil bia.png", "inline")).toBe(`inline; filename="hasil bia.png"; filename*=UTF-8''hasil%20bia.png`);
    expect(contentDisposition("hasil β.pdf", "attachment")).toBe(`attachment; filename="hasil _.pdf"; filename*=UTF-8''hasil%20%CE%B2.pdf`);
  });
});

describe("hak atas BIA per peran dan status booking", () => {
  const klinik = (status: string) => ({ status, channel: "KLINIK" as const });

  it("HADIR: dokter dan Super Admin mengunggah, mengisi angka, dan membatalkan apa saja; resepsionis hanya mengunggah dan membatalkan miliknya", () => {
    for (const role of ["DOKTER", "SUPER_ADMIN"] as const) {
      expect(biaAccess(role, klinik("HADIR"))).toEqual({ upload: true, editNumbers: true, voidAny: true, voidOwnFile: true, view: true });
    }
    expect(biaAccess("RESEPSIONIS", klinik("HADIR"))).toEqual({ upload: true, editNumbers: false, voidAny: false, voidOwnFile: true, view: false });
  });

  it("SELESAI: hanya dokter dan Super Admin yang menambah atau membatalkan; resepsionis tidak bisa apa-apa", () => {
    expect(biaAccess("DOKTER", klinik("SELESAI"))).toEqual({ upload: true, editNumbers: true, voidAny: true, voidOwnFile: false, view: true });
    expect(biaAccess("RESEPSIONIS", klinik("SELESAI"))).toEqual({ upload: false, editNumbers: false, voidAny: false, voidOwnFile: false, view: false });
  });

  it("peran lain, booking online, dan status lain tidak punya akses menulis", () => {
    for (const role of ["APOTEKER", "ADMIN_KEUANGAN", "TERAPIS"] as const) {
      expect(biaAccess(role, klinik("HADIR"))).toEqual({ upload: false, editNumbers: false, voidAny: false, voidOwnFile: false, view: false });
    }
    const online = biaAccess("DOKTER", { status: "HADIR", channel: "ONLINE" });
    expect(online).toMatchObject({ upload: false, editNumbers: false, voidAny: false, voidOwnFile: false });
    for (const status of ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "DIBATALKAN", "TIDAK_HADIR", "KEDALUWARSA"]) {
      expect(biaAccess("DOKTER", klinik(status))).toMatchObject({ upload: false, editNumbers: false, voidAny: false });
    }
  });
});
```

`tests/unit/permissions.test.ts`, tambahkan di akhir berkas:

```ts
describe("hak akses hasil BIA (spec hasil BIA 5)", () => {
  it("Super Admin, Dokter, dan Resepsionis boleh mengunggah; peran lain tidak", () => {
    for (const role of ["SUPER_ADMIN", "DOKTER", "RESEPSIONIS"] as const) expect(can(role, "bia:upload")).toBe(true);
    for (const role of ["APOTEKER", "ADMIN_KEUANGAN", "TERAPIS"] as const) expect(can(role, "bia:upload")).toBe(false);
  });

  it("Resepsionis tetap tidak membaca rekam medis", () => {
    expect(can("RESEPSIONIS", "record:read")).toBe(false);
  });
});
```

Run: `npx vitest run tests/unit/bia.test.ts tests/unit/permissions.test.ts`
Expected: FAIL (`@/lib/bia` belum ada; `bia:upload` bukan `Capability`).

- [ ] **Step 2: Tambahkan kemampuan `bia:upload`**

`src/lib/permissions.ts`: tambahkan `| "bia:upload"` pada tipe `Capability`; tambahkan `"bia:upload",` di akhir daftar `SUPER_ADMIN`; ganti baris `DOKTER` menjadi `DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write", "stock:availability", "bia:upload"],` dan baris `RESEPSIONIS` menjadi `RESEPSIONIS: ["booking:manage", "schedule:manage", "invoice:read", "invoice:manage", "bia:upload"],`.

- [ ] **Step 3: Tulis `src/lib/bia.ts`**

```ts
import type { StaffRole } from "@prisma/client";
import { formatDecimal } from "./encounter";
import { can } from "./permissions";

/** Aturan murni hasil Timbang BIA (spec hasil BIA 3–5): angka, jenis berkas, nama berkas, dan hak. Tanpa basis data. */

export type BiaKey =
  | "bodyFatPercent"
  | "muscleMassKg"
  | "visceralFat"
  | "bmr"
  | "metabolicAge"
  | "bodyWaterPercent"
  | "boneMassKg";
export type BiaNumbers = Record<BiaKey, number | null>;
export type BiaInput = Record<BiaKey, string>;
type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export type BiaFieldSpec = { key: BiaKey; label: string; unit: string; min: number; max: number; decimals: 0 | 1 };

export const BIA_FIELDS: readonly BiaFieldSpec[] = [
  { key: "bodyFatPercent", label: "Lemak tubuh", unit: "%", min: 2, max: 70, decimals: 1 },
  { key: "muscleMassKg", label: "Massa otot", unit: "kg", min: 5, max: 120, decimals: 1 },
  { key: "visceralFat", label: "Lemak viseral", unit: "", min: 1, max: 59, decimals: 0 },
  { key: "bmr", label: "Metabolisme basal", unit: "kkal", min: 500, max: 5000, decimals: 0 },
  { key: "metabolicAge", label: "Usia metabolik", unit: "tahun", min: 5, max: 110, decimals: 0 },
  { key: "bodyWaterPercent", label: "Air tubuh", unit: "%", min: 20, max: 80, decimals: 1 },
  { key: "boneMassKg", label: "Massa tulang", unit: "kg", min: 0.5, max: 10, decimals: 1 },
];
export const BIA_KEYS: BiaKey[] = BIA_FIELDS.map((field) => field.key);

export const EMPTY_BIA_NUMBERS: BiaNumbers = {
  bodyFatPercent: null,
  muscleMassKg: null,
  visceralFat: null,
  bmr: null,
  metabolicAge: null,
  bodyWaterPercent: null,
  boneMassKg: null,
};
export const EMPTY_BIA_INPUT: BiaInput = {
  bodyFatPercent: "",
  muscleMassKg: "",
  visceralFat: "",
  bmr: "",
  metabolicAge: "",
  bodyWaterPercent: "",
  boneMassKg: "",
};

export const BIA_NOTE_MAX = 500;
export const BIA_MAX_FILES = 5;
export const BIA_MAX_BYTES = 10 * 1024 * 1024;
/** Untuk atribut `accept` kotak pilih berkas (HEIF/HEIC dari iPhone ikut). */
export const BIA_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

function rangeText(spec: BiaFieldSpec): string {
  const unit = spec.unit ? ` ${spec.unit}` : "";
  return `${formatDecimal(spec.min)}–${formatDecimal(spec.max)}${unit}`;
}

/** Label isian: nama dan satuan, mis. "Lemak tubuh (%)". */
export function biaFieldLabel(spec: BiaFieldSpec): string {
  return spec.unit ? `${spec.label} (${spec.unit})` : spec.label;
}

/** Satu angka dari teks isian. Koma dan titik sama-sama tanda desimal. */
export function parseBiaNumber(spec: BiaFieldSpec, raw: string): Parsed<number | null> {
  const value = raw.trim().replace(",", ".");
  if (value === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(value)) return fail(`${spec.label} harus berupa angka.`);
  const fraction = value.split(".")[1] ?? "";
  if (spec.decimals === 0 && fraction.length > 0) return fail(`${spec.label} harus bilangan bulat.`);
  if (fraction.length > 1) return fail(`${spec.label} paling banyak satu angka di belakang koma.`);
  const number = Number(value);
  if (number < spec.min || number > spec.max) return fail(`${spec.label} harus ${rangeText(spec)}.`);
  return { ok: true, value: number };
}

/** Seluruh isian: pesan pertama yang ditemukan dikembalikan apa adanya ke pengguna. */
export function parseBiaInput(input: BiaInput, note: string): Parsed<{ numbers: BiaNumbers; note: string | null }> {
  const numbers: BiaNumbers = { ...EMPTY_BIA_NUMBERS };
  for (const spec of BIA_FIELDS) {
    const parsed = parseBiaNumber(spec, input[spec.key] ?? "");
    if (!parsed.ok) return parsed;
    numbers[spec.key] = parsed.value;
  }
  if (BIA_KEYS.every((key) => numbers[key] === null)) return fail("Isi minimal satu angka BIA.");
  const cleanNote = String(note ?? "").trim();
  if (cleanNote.length > BIA_NOTE_MAX) return fail(`Catatan paling banyak ${BIA_NOTE_MAX} karakter.`);
  return { ok: true, value: { numbers, note: cleanNote || null } };
}

export function biaInputValue(key: BiaKey, value: number | null): string {
  const spec = BIA_FIELDS.find((field) => field.key === key)!;
  return value === null ? "" : formatDecimal(value, spec.decimals);
}

export type BiaFileType = {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf";
  ext: "jpg" | "png" | "webp" | "heic" | "pdf";
  /** Bisa ditampilkan peramban; HEIC hanya bisa diunduh. */
  previewable: boolean;
};

const HEIC_BRANDS = ["heic", "heix", "hevc", "mif1", "msf1"];

/** Jenis berkas dari byte awalnya, bukan dari nama atau mime kiriman klien. */
export function detectBiaFileType(bytes: Uint8Array): BiaFileType | null {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg", previewable: true };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && text(1, 4) === "PNG") return { mime: "image/png", ext: "png", previewable: true };
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp", previewable: true };
  if (bytes.length >= 12 && text(4, 8) === "ftyp" && HEIC_BRANDS.includes(text(8, 12))) {
    return { mime: "image/heic", ext: "heic", previewable: false };
  }
  if (bytes.length >= 5 && text(0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf", previewable: true };
  return null;
}

/** Nama asli untuk tampilan: tanpa jalur, karakter kendali, dan tanda kutip; paling panjang 120 karakter (ekstensi dijaga). */
export function safeOriginalName(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "berkas";
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 8 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - ext.length) + ext;
}

/** Header Content-Disposition: nama ASCII untuk peramban lama, versi UTF-8 (RFC 5987) untuk yang lain. */
export function contentDisposition(name: string, disposition: "inline" | "attachment"): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export type BiaAccess = { upload: boolean; editNumbers: boolean; voidAny: boolean; voidOwnFile: boolean; view: boolean };

/**
 * Hak atas BIA satu booking (spec hasil BIA 3.3 dan 5). `editNumbers` hanya berarti peran dan status mengizinkan;
 * angka yang sudah pernah tersimpan masih dikunci setelah SELESAI oleh aksi server dan pemicu basis data.
 */
export function biaAccess(role: StaffRole, appointment: { status: string; channel: "KLINIK" | "ONLINE" }): BiaAccess {
  const view = can(role, "record:read");
  const none: BiaAccess = { upload: false, editNumbers: false, voidAny: false, voidOwnFile: false, view };
  if (appointment.channel !== "KLINIK") return none;
  const clinical = can(role, "record:write");
  const uploader = can(role, "bia:upload");
  if (appointment.status === "HADIR") {
    return { upload: uploader, editNumbers: clinical, voidAny: clinical, voidOwnFile: uploader, view };
  }
  if (appointment.status === "SELESAI") {
    return { upload: uploader && clinical, editNumbers: clinical, voidAny: clinical, voidOwnFile: false, view };
  }
  return none;
}

/** Satu titik grafik komposisi tubuh. */
export type BiaPoint = { at: Date; bodyFatPercent: number | null; muscleMassKg: number | null };
```

- [ ] **Step 4: Jalankan uji (GREEN)**

Run: `npx vitest run tests/unit/bia.test.ts tests/unit/permissions.test.ts`
Expected: PASS. Bila satu uji pesan rentang gagal karena format angka (`5.000` vs `5000`), sesuaikan **hanya** ekspektasi uji `bmr` yang sudah memakai `\.?`; jangan melonggarkan uji lain.

Run: `npx tsc --noEmit -p .` → bersih.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bia.ts src/lib/permissions.ts tests/unit/bia.test.ts tests/unit/permissions.test.ts
git commit -m "feat: add BIA rules for numbers, file types, and access, plus the bia:upload capability"
```

---

### Task 3: Penyimpanan berkas di disk

**Files:**
- Create: `src/server/bia-storage.ts`
- Test: `tests/unit/bia-storage.test.ts`

**Interfaces:**
- Consumes: —
- Produces (dari `@/server/bia-storage`):
  - `patientFilesDir(): string` (membaca `process.env.PATIENT_FILES_DIR` tiap dipanggil, bawaan `/www/sundy-files`).
  - `BIA_STORAGE_NAME: RegExp` (`^\d{4}/\d{2}/<uuid>.(jpg|png|webp|heic|pdf)$`).
  - `writeBiaFile(bytes: Uint8Array, ext: string, now?: Date): Promise<string>` → mengembalikan `storageName` relatif (`2026/10/<uuid>.jpg`).
  - `readBiaFile(storageName: string): Promise<Buffer>`; `removeBiaFile(storageName: string): Promise<void>` (tidak galat bila tidak ada).
  - Ketiganya melempar `Error("Nama berkas BIA tidak sah.")` bila nama tidak cocok `BIA_STORAGE_NAME` (cegah penyusupan jalur).

- [ ] **Step 1: Tulis uji (RED)**

`tests/unit/bia-storage.test.ts`:

```ts
// @vitest-environment node
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BIA_STORAGE_NAME, patientFilesDir, readBiaFile, removeBiaFile, writeBiaFile } from "@/server/bia-storage";

let root: string;
const original = process.env.PATIENT_FILES_DIR;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sundy-bia-"));
  process.env.PATIENT_FILES_DIR = root;
});
afterEach(async () => {
  await rm(path.join(root, "bia"), { recursive: true, force: true });
});
afterAll(async () => {
  if (original === undefined) delete process.env.PATIENT_FILES_DIR;
  else process.env.PATIENT_FILES_DIR = original;
  await rm(root, { recursive: true, force: true });
});

describe("penyimpanan berkas BIA", () => {
  it("memakai folder dari lingkungan, dan /www/sundy-files bila tidak diisi", () => {
    expect(patientFilesDir()).toBe(root);
    delete process.env.PATIENT_FILES_DIR;
    expect(patientFilesDir()).toBe("/www/sundy-files");
    process.env.PATIENT_FILES_DIR = root;
  });

  it("menulis berkas bernama acak di bawah tahun/bulan, dengan izin 0600 dan folder 0700, tanpa sisa berkas sementara", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const name = await writeBiaFile(bytes, "jpg", new Date("2026-10-09T03:00:00Z"));
    expect(name).toMatch(BIA_STORAGE_NAME);
    expect(name.startsWith("2026/10/")).toBe(true);
    const file = path.join(root, "bia", name);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);
    expect([...(await readBiaFile(name))]).toEqual([...bytes]);
    expect(await readdir(path.dirname(file))).toEqual([path.basename(file)]);
  });

  it("dua penulisan menghasilkan dua nama berbeda", async () => {
    const a = await writeBiaFile(new Uint8Array([1]), "pdf");
    const b = await writeBiaFile(new Uint8Array([1]), "pdf");
    expect(a).not.toBe(b);
  });

  it("menghapus berkas, dan menghapus yang tidak ada tidak galat", async () => {
    const name = await writeBiaFile(new Uint8Array([1, 2]), "png");
    await removeBiaFile(name);
    await expect(readBiaFile(name)).rejects.toThrow();
    await expect(removeBiaFile(name)).resolves.toBeUndefined();
  });

  it("menolak nama yang mencoba keluar dari folder atau tidak berbentuk yang kita buat", async () => {
    for (const bad of ["../../etc/passwd", "2026/10/../../x.jpg", "/etc/passwd", "2026/10/abc.jpg", "2026/10/00000000-0000-4000-8000-000000000000.exe"]) {
      await expect(readBiaFile(bad)).rejects.toThrow("Nama berkas BIA tidak sah.");
      await expect(removeBiaFile(bad)).rejects.toThrow("Nama berkas BIA tidak sah.");
    }
    await expect(writeBiaFile(new Uint8Array([1]), "exe")).rejects.toThrow("Ekstensi berkas BIA tidak sah.");
  });
});
```

Run: `npx vitest run tests/unit/bia-storage.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 2: Implementasi `src/server/bia-storage.ts`**

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Berkas hasil BIA di disk (spec hasil BIA 4.2). Folder dasarnya `PATIENT_FILES_DIR` (bawaan /www/sundy-files),
 * di luar folder rilis dan sudah masuk backup harian. Nama di disk selalu acak; nama asli hanya ada di basis data.
 */
export const BIA_STORAGE_NAME = /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|pdf)$/;
const EXTENSIONS = new Set(["jpg", "png", "webp", "heic", "pdf"]);

export function patientFilesDir(): string {
  return process.env.PATIENT_FILES_DIR || "/www/sundy-files";
}

function pathOf(storageName: string): string {
  if (!BIA_STORAGE_NAME.test(storageName)) throw new Error("Nama berkas BIA tidak sah.");
  return path.join(patientFilesDir(), "bia", storageName);
}

/** Menulis ke nama sementara lalu memindahkannya, sehingga berkas yang terbaca selalu utuh. Mengembalikan nama relatif. */
export async function writeBiaFile(bytes: Uint8Array, ext: string, now: Date = new Date()): Promise<string> {
  if (!EXTENSIONS.has(ext)) throw new Error("Ekstensi berkas BIA tidak sah.");
  const storageName = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  const target = pathOf(storageName);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return storageName;
}

export async function readBiaFile(storageName: string): Promise<Buffer> {
  return readFile(pathOf(storageName));
}

/** Hanya untuk membatalkan penulisan yang gagal di tengah jalan; aplikasi tidak pernah menghapus berkas yang sudah tercatat. */
export async function removeBiaFile(storageName: string): Promise<void> {
  await rm(pathOf(storageName), { force: true });
}
```

- [ ] **Step 3: Jalankan uji (GREEN)**

Run: `npx vitest run tests/unit/bia-storage.test.ts`
Expected: PASS (5 uji). Run: `npx tsc --noEmit -p . && npx eslint src/server/bia-storage.ts tests/unit/bia-storage.test.ts` → bersih.

- [ ] **Step 4: Commit**

```bash
git add src/server/bia-storage.ts tests/unit/bia-storage.test.ts
git commit -m "feat: store BIA files on disk under random names with private permissions"
```

---

### Task 4: Layanan unggah, aksi server, pembacaan, dan rute

**Files:**
- Create: `src/server/bia-upload.ts` (layanan unggah, biasa, bukan `"use server"`)
- Create: `src/server/bia-actions.ts` (`"use server"`)
- Create: `src/server/bia-read.ts`
- Create: `src/app/(admin)/admin/bia/unggah/route.ts`
- Create: `src/app/(admin)/admin/bia/berkas/[id]/route.ts`
- Test: `tests/integration/bia-upload.test.ts`, `tests/integration/bia-actions.test.ts`, `tests/integration/bia-routes.test.ts`

**Interfaces:**
- Consumes: `biaAccess`, `detectBiaFileType`, `safeOriginalName`, `parseBiaInput`, `BIA_*`, `BiaInput`, `BiaNumbers`, `BiaPoint`, `contentDisposition` dari `@/lib/bia` (Task 2); `writeBiaFile`, `readBiaFile`, `removeBiaFile` (Task 3); `recordAudit`, `recordAuditThrottled` dari `@/server/audit`; `isUniqueViolation` dari `@/server/db-errors`; `validateReason` dari `@/lib/stock`; `runAction`, `UserFacingError`, `ActionResult` dari `@/lib/action-result`; `CurrentStaff`, `getCurrentStaff`, `requireCapability` dari `@/server/session`; model Prisma Task 1.
- Produces:
  - `uploadBiaFile(input: { actor: CurrentStaff; appointmentId: string; originalName: string; bytes: Uint8Array }): Promise<{ fileId: string; measurementId: string }>` — melempar `UserFacingError` berpesan Indonesia untuk setiap penolakan.
  - Aksi server (semua `Promise<ActionResult<…>>`): `startBiaMeasurement(appointmentId: string): Promise<ActionResult<{ measurementId: string }>>`; `saveBiaNumbers(input: { measurementId: string; version: number; numbers: BiaInput; note: string }): Promise<ActionResult<{ version: number }>>`; `voidBiaMeasurement(input: { measurementId: string; reason: string }): Promise<ActionResult<void>>`; `voidBiaFile(input: { fileId: string; reason: string }): Promise<ActionResult<void>>`.
  - Tipe baca: `BiaFileView`, `BiaMeasurementView`, `BiaVisitView`, `BiaHistory`, dan fungsi `getBiaForVisit(appointmentId: string): Promise<BiaVisitView>` (butuh `record:read`), `getBiaHistory(patientId: string): Promise<BiaHistory>` (butuh `record:read`) — bentuk persisnya di Step 4.
  - Rute: `POST /admin/bia/unggah` → JSON `{ ok: true; fileId: string } | { ok: false; error: string }` (status 200/401/403/413/422/500); `GET /admin/bia/berkas/<id>[?unduh=1]` → isi berkas.

- [ ] **Step 1: Tulis uji layanan unggah (RED)**

`tests/integration/bia-upload.test.ts`:

```ts
// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/action-result";
import { BIA_MAX_BYTES } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { uploadBiaFile } from "@/server/bia-upload";
import type { CurrentStaff } from "@/server/session";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

const SLUG = "unggah-bia";
const WA = "6281200009101";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);

const staff = (role: CurrentStaff["role"], staffId = "s-" + role): CurrentStaff => ({ userId: "u-" + role, staffId, name: `Uji ${role}`, role, email: `${role}@uji.test` });
const resepsionis = staff("RESEPSIONIS");
const dokter = staff("DOKTER");

describe("layanan unggah hasil BIA", () => {
  let world: BillingWorld;
  let hadir: string;
  let selesai: string;
  let root: string;
  const previous = process.env.PATIENT_FILES_DIR;

  const upload = (actor: CurrentStaff, appointmentId = hadir, bytes: Uint8Array = JPEG, originalName = "hasil.jpg") =>
    uploadBiaFile({ actor, appointmentId, originalName, bytes });
  const filesOnDisk = async () => {
    try {
      const years = await readdir(path.join(root, "bia"));
      const all: string[] = [];
      for (const year of years) for (const month of await readdir(path.join(root, "bia", year))) all.push(...(await readdir(path.join(root, "bia", year, month))));
      return all;
    } catch {
      return [];
    }
  };
  const refuse = async (promise: Promise<unknown>, message: string | RegExp) => {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(UserFacingError);
    expect((error as UserFacingError).message).toMatch(message);
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-bia-int-"));
    process.env.PATIENT_FILES_DIR = root;
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    hadir = (await finalVisit(world)).appointmentId;
    selesai = (await finalVisit(world)).appointmentId;
    await prisma.appointment.update({ where: { id: selesai }, data: { status: "SELESAI" } });
  });
  beforeEach(async () => {
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
    await rm(path.join(root, "bia"), { recursive: true, force: true });
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("resepsionis mengunggah ke booking HADIR: pengukuran dibuat, berkas tercatat lengkap, ada di disk, dan terekam di audit", async () => {
    const { fileId, measurementId } = await upload(resepsionis, hadir, JPEG, "C:\\Users\\Rina\\hasil bia.jpg");
    const row = await prisma.biaFile.findUniqueOrThrow({ where: { id: fileId }, include: { measurement: true } });
    expect(row).toMatchObject({ measurementId, originalName: "hasil bia.jpg", mimeType: "image/jpeg", sizeBytes: JPEG.length, uploadedByName: "Uji RESEPSIONIS", voidedAt: null });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.storageName).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(row.measurement).toMatchObject({ appointmentId: hadir, patientId: world.patientId, createdByName: "Uji RESEPSIONIS", numbersAt: null });
    expect(await filesOnDisk()).toHaveLength(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "bia.upload", entityId: measurementId } });
    expect(audit.summary).toContain("hasil bia.jpg");
  });

  it("berkas berikutnya masuk ke pengukuran aktif yang sama", async () => {
    const first = await upload(resepsionis);
    const second = await upload(dokter);
    expect(second.measurementId).toBe(first.measurementId);
    expect(await prisma.biaMeasurement.count({ where: { appointmentId: hadir } })).toBe(1);
  });

  it("menolak berkas ke-6, dan berkas yang sudah tertulis di disk dihapus (tidak ada yatim)", async () => {
    for (let i = 0; i < 5; i += 1) await upload(dokter);
    await refuse(upload(dokter), /paling banyak 5 berkas/);
    expect(await prisma.biaFile.count({ where: { measurement: { appointmentId: hadir } } })).toBe(5);
    expect(await filesOnDisk()).toHaveLength(5);
  });

  it("berkas yang dibatalkan tidak dihitung dalam batas 5", async () => {
    const files = [];
    for (let i = 0; i < 5; i += 1) files.push(await upload(dokter));
    await prisma.biaFile.update({ where: { id: files[0].fileId }, data: { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Salah foto" } });
    await expect(upload(dokter)).resolves.toBeTruthy();
  });

  it("unggahan serentak: tetap satu pengukuran aktif dan paling banyak 5 berkas", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => upload(dokter)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await prisma.biaMeasurement.count({ where: { appointmentId: hadir, voidedAt: null } })).toBe(1);
    expect(await prisma.biaFile.count({ where: { measurement: { appointmentId: hadir }, voidedAt: null } })).toBe(5);
    expect(await filesOnDisk()).toHaveLength(5);
  });

  it("menolak berkas kosong, terlalu besar, dan berjenis tidak dikenal (isi HTML berekstensi .jpg)", async () => {
    await refuse(upload(dokter, hadir, new Uint8Array(0)), /Berkas kosong/);
    await refuse(upload(dokter, hadir, new Uint8Array(BIA_MAX_BYTES + 1).fill(0xff)), /terlalu besar \(maks\. 10 MB\)/);
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    await refuse(upload(dokter, hadir, html, "hasil.jpg"), /Jenis berkas tidak didukung/);
    expect(await filesOnDisk()).toHaveLength(0);
    expect(await prisma.biaMeasurement.count({ where: { appointmentId: hadir } })).toBe(0);
  });

  it("menolak booking tak dikenal, booking online, status belum check-in, dan peran tanpa hak", async () => {
    await refuse(upload(dokter, "tidak-ada"), /Booking tidak ditemukan/);
    const waiting = await prisma.appointment.findUniqueOrThrow({ where: { id: hadir } });
    const other = await prisma.appointment.create({
      data: { ...pick(waiting), code: `BIA-${SLUG.toUpperCase()}-X1`, status: "TERKONFIRMASI", startAt: new Date("2031-02-01T01:00:00Z"), endAt: new Date("2031-02-01T01:30:00Z") },
    });
    await refuse(upload(dokter, other.id), /setelah pasien check-in/);
    const online = await prisma.appointment.create({
      data: { ...pick(waiting), code: `BIA-${SLUG.toUpperCase()}-X2`, channel: "ONLINE", servicePrice: 250000, status: "HADIR", startAt: new Date("2031-02-02T01:00:00Z"), endAt: new Date("2031-02-02T01:30:00Z") },
    });
    await refuse(upload(dokter, online.id), /tidak ditimbang/);
    await refuse(upload(staff("APOTEKER"), hadir), /tidak bisa mengunggah/);
    await prisma.appointment.deleteMany({ where: { id: { in: [other.id, online.id] } } });
  });

  it("setelah kunjungan SELESAI: dokter boleh menambah ke pengukuran yang angkanya belum tersimpan, resepsionis tidak", async () => {
    await refuse(upload(resepsionis, selesai), /sudah final/);
    const { measurementId } = await upload(dokter, selesai);
    await prisma.biaMeasurement.update({ where: { id: measurementId }, data: { bodyFatPercent: 30, numbersAt: new Date(), numbersById: "s", numbersByName: "dr. Uji" } });
    await refuse(upload(dokter, selesai), /Batalkan pengukuran lalu tambah yang baru/);
    expect(await filesOnDisk()).toHaveLength(1);
  });
});

function pick(a: { type: unknown; servicePrice: unknown; source: unknown; branchId: string; staffId: string; serviceId: string | null; patientId: string | null }) {
  return { type: a.type as "KONSULTASI", source: a.source as "WALK_IN", branchId: a.branchId, staffId: a.staffId, serviceId: a.serviceId, patientId: a.patientId };
}
```

Run: `npm run test:integration -- tests/integration/bia-upload.test.ts`
Expected: FAIL (`@/server/bia-upload` belum ada).

- [ ] **Step 2: Implementasi `src/server/bia-upload.ts`**

```ts
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import { BIA_MAX_BYTES, BIA_MAX_FILES, biaAccess, detectBiaFileType, safeOriginalName } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { removeBiaFile, writeBiaFile } from "@/server/bia-storage";
import { isUniqueViolation } from "@/server/db-errors";
import type { CurrentStaff } from "@/server/session";

type AppointmentForBia = { status: string; channel: "KLINIK" | "ONLINE" };

/** Alasan yang dibaca staf bila unggahan ditolak (spec hasil BIA 3.3 dan 5). */
function uploadDenial(role: CurrentStaff["role"], appointment: AppointmentForBia): string {
  if (appointment.channel !== "KLINIK") return "Konsultasi online tidak ditimbang, jadi tidak punya hasil BIA.";
  if (appointment.status !== "HADIR" && appointment.status !== "SELESAI") return "Hasil BIA hanya bisa diunggah setelah pasien check-in.";
  if (appointment.status === "SELESAI" && role === "RESEPSIONIS") return "Kunjungan sudah final. Minta dokter menambahkan hasil BIA.";
  return "Anda tidak bisa mengunggah hasil BIA untuk booking ini.";
}

type Tx = Prisma.TransactionClient;

/** Pengukuran aktif booking ini; dibuat bila belum ada. Dua pembuatan serentak: yang kalah kena indeks unik dan diulang oleh pemanggil. */
export async function ensureActiveMeasurement(
  tx: Tx,
  input: { appointmentId: string; patientId: string; actor: Pick<CurrentStaff, "staffId" | "name"> },
): Promise<string> {
  const existing = await tx.biaMeasurement.findFirst({ where: { appointmentId: input.appointmentId, voidedAt: null }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.biaMeasurement.create({
    data: { appointmentId: input.appointmentId, patientId: input.patientId, createdById: input.actor.staffId, createdByName: input.actor.name },
    select: { id: true },
  });
  return created.id;
}

/**
 * Menyimpan satu berkas hasil BIA (spec hasil BIA 4). Urutan: periksa → tulis ke disk → catat di basis data dalam satu
 * transaksi (dengan kunci baris pengukuran supaya batas 5 berkas tidak bisa dilewati serentak). Bila pencatatan gagal,
 * berkas di disk dihapus lagi.
 */
export async function uploadBiaFile(input: {
  actor: CurrentStaff;
  appointmentId: string;
  originalName: string;
  bytes: Uint8Array;
}): Promise<{ fileId: string; measurementId: string }> {
  const { actor, bytes } = input;
  const appointment = await prisma.appointment.findUnique({
    where: { id: String(input.appointmentId ?? "") },
    select: { id: true, code: true, status: true, channel: true, patientId: true },
  });
  if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
  if (!appointment.patientId) throw new UserFacingError("Booking ini belum punya pasien. Cocokkan pasien dulu.");
  if (!biaAccess(actor.role, appointment).upload) throw new UserFacingError(uploadDenial(actor.role, appointment));

  if (bytes.length === 0) throw new UserFacingError("Berkas kosong.");
  if (bytes.length > BIA_MAX_BYTES) throw new UserFacingError("Berkas terlalu besar (maks. 10 MB).");
  const type = detectBiaFileType(bytes);
  if (!type) throw new UserFacingError("Jenis berkas tidak didukung. Gunakan foto (JPG, PNG, WebP, HEIC) atau PDF.");

  const originalName = safeOriginalName(input.originalName);
  const storageName = await writeBiaFile(bytes, type.ext);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const patientId = appointment.patientId;

  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const saved = await prisma.$transaction(async (tx) => {
          const measurementId = await ensureActiveMeasurement(tx, { appointmentId: appointment.id, patientId, actor });
          await tx.$queryRaw`SELECT "id" FROM "BiaMeasurement" WHERE "id" = ${measurementId} FOR UPDATE`;
          if (appointment.status === "SELESAI") {
            // Setelah final, berkas hanya boleh masuk ke pengukuran koreksi yang angkanya belum tersimpan (spec 3.3).
            const current = await tx.biaMeasurement.findUniqueOrThrow({ where: { id: measurementId }, select: { numbersAt: true } });
            if (current.numbersAt) throw new UserFacingError("Kunjungan sudah final dan angka BIA sudah tersimpan. Batalkan pengukuran lalu tambah yang baru.");
          }
          const active = await tx.biaFile.count({ where: { measurementId, voidedAt: null } });
          if (active >= BIA_MAX_FILES) throw new UserFacingError(`Satu pengukuran paling banyak ${BIA_MAX_FILES} berkas. Batalkan salah satu dulu.`);
          const file = await tx.biaFile.create({
            data: {
              measurementId,
              storageName,
              originalName,
              mimeType: type.mime,
              sizeBytes: bytes.length,
              sha256,
              uploadedById: actor.staffId,
              uploadedByName: actor.name,
            },
            select: { id: true },
          });
          return { fileId: file.id, measurementId };
        });
        await recordAudit({
          actor,
          action: "bia.upload",
          entity: "BiaMeasurement",
          entityId: saved.measurementId,
          summary: `${appointment.code} · ${originalName}`,
        });
        return saved;
      } catch (error) {
        // Dua unggahan pertama serentak: yang kalah membuat pengukuran kedua dan kena indeks unik; ulang sekali, kini pengukurannya ada.
        if (isUniqueViolation(error) && attempt === 0) continue;
        throw error;
      }
    }
  } catch (error) {
    await removeBiaFile(storageName).catch(() => undefined);
    throw error;
  }
}
```

Run: `npm run test:integration -- tests/integration/bia-upload.test.ts`
Expected: PASS (8 uji). Bila uji serentak sesekali gagal karena batas 5 tidak tepat, periksa bahwa `FOR UPDATE` berjalan di dalam transaksi yang sama dengan `count` (jangan mengendurkan uji).

- [ ] **Step 3: Tulis uji aksi server (RED) dan implementasinya**

`tests/integration/bia-actions.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BIA_INPUT } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { saveBiaNumbers, startBiaMeasurement, voidBiaFile, voidBiaMeasurement } from "@/server/bia-actions";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS" | "APOTEKER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s-dokter", name: "dr. Uji", role: "DOKTER" as Role, email: "uji@sundy.test" },
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

const SLUG = "aksi-bia";
const WA = "6281200009102";
const numbers = (patch: Partial<typeof EMPTY_BIA_INPUT> = {}) => ({ ...EMPTY_BIA_INPUT, bodyFatPercent: "28,5", muscleMassKg: "41", ...patch });

describe("aksi hasil BIA", () => {
  let world: BillingWorld;
  let hadir: string;
  let selesai: string;

  const measurementFor = async (appointmentId: string) => unwrap(startBiaMeasurement(appointmentId)).then((r) => r.measurementId);
  const addFile = (measurementId: string, uploadedById = "s-resepsionis") =>
    prisma.biaFile.create({
      data: { measurementId, storageName: `2035/01/${crypto.randomUUID()}.jpg`, originalName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 10, sha256: "a".repeat(64), uploadedById, uploadedByName: "Rina" },
    });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    hadir = (await finalVisit(world)).appointmentId;
    selesai = (await finalVisit(world)).appointmentId;
    await prisma.appointment.update({ where: { id: selesai }, data: { status: "SELESAI" } });
  });
  beforeEach(async () => {
    actor.role = "DOKTER";
    actor.staffId = "s-dokter";
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("memulai pengukuran: dibuat sekali, panggilan kedua mengembalikan yang sama", async () => {
    const a = await measurementFor(hadir);
    const b = await measurementFor(hadir);
    expect(b).toBe(a);
    expect(await prisma.biaMeasurement.count({ where: { appointmentId: hadir } })).toBe(1);
  });

  it("menyimpan angka: tersimpan dengan pelaku, versi naik, audit tanpa isi angka", async () => {
    const id = await measurementFor(hadir);
    const saved = await unwrap(saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers({ visceralFat: "9", bmr: "1450" }), note: " Puasa " }));
    expect(saved.version).toBe(2);
    const row = await prisma.biaMeasurement.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ visceralFat: 9, bmr: 1450, note: "Puasa", numbersByName: "dr. Uji", version: 2 });
    expect(Number(row.bodyFatPercent)).toBe(28.5);
    expect(row.numbersAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "bia.numbers.save", entityId: id } });
    expect(audit.summary).not.toMatch(/28[,.]5/);
  });

  it("menolak angka tidak sah dan simpan dengan versi lama", async () => {
    const id = await measurementFor(hadir);
    expect(await saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers({ bodyFatPercent: "1" }), note: "" })).toEqual({ ok: false, error: "Lemak tubuh harus 2–70 %." });
    expect(await saveBiaNumbers({ measurementId: id, version: 1, numbers: EMPTY_BIA_INPUT, note: "" })).toEqual({ ok: false, error: "Isi minimal satu angka BIA." });
    await unwrap(saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers(), note: "" }));
    expect(await saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers({ bodyFatPercent: "27" }), note: "" })).toEqual({
      ok: false,
      error: "Angka BIA baru diubah di tempat lain. Muat ulang halaman.",
    });
  });

  it("hanya peran yang boleh menulis catatan klinis yang mengisi angka", async () => {
    const id = await measurementFor(hadir);
    actor.role = "RESEPSIONIS";
    await expect(saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers(), note: "" })).rejects.toThrow("forbidden: record:write");
    await expect(startBiaMeasurement(hadir)).rejects.toThrow("forbidden: record:write");
  });

  it("setelah SELESAI: angka yang sudah tersimpan tidak bisa diubah; pengukuran kosong boleh diisi sekali; batalkan lalu mulai yang baru", async () => {
    const id = await measurementFor(selesai);
    await unwrap(saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers(), note: "" }));
    const locked = await saveBiaNumbers({ measurementId: id, version: 2, numbers: numbers({ bodyFatPercent: "27" }), note: "" });
    expect(locked).toEqual({ ok: false, error: "Kunjungan sudah final. Angka yang sudah tersimpan tidak bisa diubah; batalkan pengukuran lalu isi yang baru." });
    await unwrap(voidBiaMeasurement({ measurementId: id, reason: "Salah timbang" }));
    const fresh = await measurementFor(selesai);
    expect(fresh).not.toBe(id);
    await unwrap(saveBiaNumbers({ measurementId: fresh, version: 1, numbers: numbers({ bodyFatPercent: "27" }), note: "" }));
    expect(await saveBiaNumbers({ measurementId: fresh, version: 2, numbers: numbers({ bodyFatPercent: "26" }), note: "" })).toMatchObject({ ok: false });
  });

  it("membatalkan pengukuran: alasan wajib, tidak bisa dua kali, tidak bisa disimpan lagi, berkas tetap tercatat", async () => {
    const id = await measurementFor(hadir);
    const file = await addFile(id);
    expect(await voidBiaMeasurement({ measurementId: id, reason: "  " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(voidBiaMeasurement({ measurementId: id, reason: "Pasien salah" }));
    expect(await voidBiaMeasurement({ measurementId: id, reason: "Lagi" })).toEqual({ ok: false, error: "Pengukuran ini sudah dibatalkan." });
    expect(await saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers(), note: "" })).toEqual({ ok: false, error: "Pengukuran ini sudah dibatalkan." });
    expect(await prisma.biaFile.findUnique({ where: { id: file.id } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "bia.void", entityId: id } })).toBe(1);
  });

  it("membatalkan berkas: dokter mana saja; resepsionis hanya miliknya sendiri dan hanya selama HADIR", async () => {
    const id = await measurementFor(hadir);
    const mine = await addFile(id, "s-resepsionis");
    const theirs = await addFile(id, "s-lain");
    actor.role = "RESEPSIONIS";
    actor.staffId = "s-resepsionis";
    expect(await voidBiaFile({ fileId: theirs.id, reason: "Salah" })).toEqual({ ok: false, error: "Anda hanya bisa membatalkan unggahan Anda sendiri." });
    await unwrap(voidBiaFile({ fileId: mine.id, reason: "Foto buram" }));
    expect(await voidBiaFile({ fileId: mine.id, reason: "Lagi" })).toEqual({ ok: false, error: "Berkas ini sudah dibatalkan." });
    actor.role = "DOKTER";
    actor.staffId = "s-dokter";
    await unwrap(voidBiaFile({ fileId: theirs.id, reason: "Bukan hasil pasien ini" }));
    expect(await prisma.biaFile.count({ where: { measurementId: id, voidedAt: { not: null } } })).toBe(2);

    const afterFinal = await addFile(await measurementFor(selesai), "s-resepsionis");
    actor.role = "RESEPSIONIS";
    actor.staffId = "s-resepsionis";
    expect(await voidBiaFile({ fileId: afterFinal.id, reason: "Salah" })).toMatchObject({ ok: false });
  });

  it("peran tanpa hak unggah ditolak", async () => {
    const id = await measurementFor(hadir);
    const file = await addFile(id);
    actor.role = "APOTEKER";
    await expect(voidBiaFile({ fileId: file.id, reason: "x" })).rejects.toThrow("forbidden: bia:upload");
  });
});
```

Run: `npm run test:integration -- tests/integration/bia-actions.test.ts` → Expected: FAIL (modul belum ada).

`src/server/bia-actions.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { biaAccess, parseBiaInput, type BiaInput } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { validateReason } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { ensureActiveMeasurement } from "@/server/bia-upload";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

function revalidate(patientId: string) {
  safeRevalidatePath("/admin/booking");
  safeRevalidatePath("/admin/kunjungan");
  safeRevalidatePath(`/admin/pasien/${patientId}`);
}

/** Memulai pengukuran untuk booking ini (atau mengembalikan yang aktif). Hanya peran yang menulis catatan klinis. */
export async function startBiaMeasurement(appointmentId: string): Promise<ActionResult<{ measurementId: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const appointment = await prisma.appointment.findUnique({
      where: { id: String(appointmentId ?? "") },
      select: { id: true, status: true, channel: true, patientId: true },
    });
    if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
    if (!appointment.patientId) throw new UserFacingError("Booking ini belum punya pasien. Cocokkan pasien dulu.");
    if (!biaAccess(actor.role, appointment).editNumbers) throw new UserFacingError("Hasil BIA hanya untuk booking klinik yang pasiennya sudah check-in.");
    const patientId = appointment.patientId;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const measurementId = await prisma.$transaction((tx) => ensureActiveMeasurement(tx, { appointmentId: appointment.id, patientId, actor }));
        revalidate(patientId);
        return { measurementId };
      } catch (error) {
        if (isUniqueViolation(error) && attempt === 0) continue;
        throw error;
      }
    }
  });
}

/** Menyimpan tujuh angka (spec hasil BIA 6.2). Versi lama ditolak; angka yang sudah tersimpan terkunci setelah kunjungan final. */
export async function saveBiaNumbers(input: {
  measurementId: string;
  version: number;
  numbers: BiaInput;
  note: string;
}): Promise<ActionResult<{ version: number }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const parsed = parseBiaInput(input?.numbers, input?.note ?? "");
    if (!parsed.ok) throw new UserFacingError(parsed.message);
    const id = String(input?.measurementId ?? "");

    const row = await prisma.biaMeasurement.findUnique({
      where: { id },
      select: { id: true, patientId: true, voidedAt: true, numbersAt: true, appointment: { select: { code: true, status: true, channel: true } } },
    });
    if (!row) throw new UserFacingError("Pengukuran tidak ditemukan.");
    if (row.voidedAt) throw new UserFacingError("Pengukuran ini sudah dibatalkan.");
    if (!biaAccess(actor.role, row.appointment).editNumbers) throw new UserFacingError("Anda tidak bisa mengisi angka BIA untuk booking ini.");
    if (row.appointment.status === "SELESAI" && row.numbersAt) {
      throw new UserFacingError("Kunjungan sudah final. Angka yang sudah tersimpan tidak bisa diubah; batalkan pengukuran lalu isi yang baru.");
    }

    const { count } = await prisma.biaMeasurement.updateMany({
      where: { id, version: Number(input.version), voidedAt: null },
      data: {
        ...parsed.value.numbers,
        note: parsed.value.note,
        numbersById: actor.staffId,
        numbersByName: actor.name,
        numbersAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new UserFacingError("Angka BIA baru diubah di tempat lain. Muat ulang halaman.");
    await recordAudit({ actor, action: "bia.numbers.save", entity: "BiaMeasurement", entityId: id, summary: row.appointment.code });
    revalidate(row.patientId);
    return { version: Number(input.version) + 1 };
  });
}

/** Membatalkan pengukuran beserta alasannya (tidak dihapus; berkasnya tetap tercatat). */
export async function voidBiaMeasurement(input: { measurementId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.measurementId ?? "");
    const row = await prisma.biaMeasurement.findUnique({
      where: { id },
      select: { patientId: true, voidedAt: true, appointment: { select: { code: true, status: true, channel: true } } },
    });
    if (!row) throw new UserFacingError("Pengukuran tidak ditemukan.");
    if (row.voidedAt) throw new UserFacingError("Pengukuran ini sudah dibatalkan.");
    if (!biaAccess(actor.role, row.appointment).voidAny) throw new UserFacingError("Anda tidak bisa membatalkan hasil BIA untuk booking ini.");
    const { count } = await prisma.biaMeasurement.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: actor.staffId, voidedByName: actor.name, voidReason: reason.value },
    });
    if (count === 0) throw new UserFacingError("Pengukuran ini sudah dibatalkan.");
    await recordAudit({ actor, action: "bia.void", entity: "BiaMeasurement", entityId: id, summary: row.appointment.code });
    revalidate(row.patientId);
  });
}

/** Membatalkan satu berkas. Resepsionis hanya untuk unggahannya sendiri dan hanya selama booking HADIR. */
export async function voidBiaFile(input: { fileId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("bia:upload");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.fileId ?? "");
    const file = await prisma.biaFile.findUnique({
      where: { id },
      select: {
        voidedAt: true,
        uploadedById: true,
        originalName: true,
        measurement: { select: { id: true, patientId: true, appointment: { select: { code: true, status: true, channel: true } } } },
      },
    });
    if (!file) throw new UserFacingError("Berkas tidak ditemukan.");
    if (file.voidedAt) throw new UserFacingError("Berkas ini sudah dibatalkan.");
    const access = biaAccess(actor.role, file.measurement.appointment);
    if (!access.voidAny) {
      if (!access.voidOwnFile) throw new UserFacingError("Anda tidak bisa membatalkan berkas ini.");
      if (file.uploadedById !== actor.staffId) throw new UserFacingError("Anda hanya bisa membatalkan unggahan Anda sendiri.");
    }
    const { count } = await prisma.biaFile.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: actor.staffId, voidedByName: actor.name, voidReason: reason.value },
    });
    if (count === 0) throw new UserFacingError("Berkas ini sudah dibatalkan.");
    await recordAudit({
      actor,
      action: "bia.file.void",
      entity: "BiaMeasurement",
      entityId: file.measurement.id,
      summary: `${file.measurement.appointment.code} · ${file.originalName}`,
    });
    revalidate(file.measurement.patientId);
  });
}
```

Run: `npm run test:integration -- tests/integration/bia-actions.test.ts` → Expected: PASS (8 uji).

- [ ] **Step 4: Pembacaan `src/server/bia-read.ts` dan uji (RED → GREEN)**

`tests/integration/bia-read.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getBiaForVisit, getBiaHistory } from "@/server/bia-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s-dokter", name: "dr. Uji", role: "DOKTER" as Role, email: "uji@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-bia";
const WA = "6281200009103";

describe("pembacaan hasil BIA", () => {
  let world: BillingWorld;
  let first: string;
  let second: string;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    first = (await finalVisit(world)).appointmentId;
    second = (await finalVisit(world)).appointmentId;
  });
  beforeEach(async () => {
    actor.role = "DOKTER";
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  const create = (appointmentId: string, data: Record<string, unknown> = {}) =>
    prisma.biaMeasurement.create({ data: { appointmentId, patientId: world.patientId, createdById: "s1", createdByName: "Uji", ...data } });

  it("kunjungan tanpa pengukuran: kosong, hak tetap dihitung dari peran dan status", async () => {
    const view = await getBiaForVisit(first);
    expect(view.active).toBeNull();
    expect(view.voided).toEqual([]);
    expect(view.access).toMatchObject({ upload: true, editNumbers: true, view: true });
    expect(view.final).toBe(false);
  });

  it("memuat pengukuran aktif dengan angka sebagai bilangan, berkas aktif dan dibatalkan, serta yang dibatalkan terpisah", async () => {
    const old = await create(first, { voidedAt: new Date("2031-01-01T00:00:00Z"), voidedById: "s", voidedByName: "Uji", voidReason: "Salah" });
    const active = await create(first, { bodyFatPercent: 28.5, muscleMassKg: 41, bmr: 1450, numbersAt: new Date(), numbersById: "s1", numbersByName: "dr. Uji" });
    await prisma.biaFile.create({
      data: { measurementId: active.id, storageName: `2035/01/${crypto.randomUUID()}.pdf`, originalName: "a.pdf", mimeType: "application/pdf", sizeBytes: 5, sha256: "b".repeat(64), uploadedById: "s", uploadedByName: "Rina" },
    });
    await prisma.biaFile.create({
      data: { measurementId: active.id, storageName: `2035/01/${crypto.randomUUID()}.heic`, originalName: "b.heic", mimeType: "image/heic", sizeBytes: 5, sha256: "c".repeat(64), uploadedById: "s", uploadedByName: "Rina", voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Buram" },
    });
    const view = await getBiaForVisit(first);
    expect(view.active).toMatchObject({ id: active.id, version: 1, numbers: { bodyFatPercent: 28.5, muscleMassKg: 41, bmr: 1450, visceralFat: null }, numbersByName: "dr. Uji" });
    expect(view.active?.files.map((f) => [f.originalName, f.previewable, f.voided?.reason ?? null])).toEqual([
      ["a.pdf", true, null],
      ["b.heic", false, "Buram"],
    ]);
    expect(view.voided.map((m) => m.id)).toEqual([old.id]);
  });

  it("riwayat pasien: titik grafik berurutan menurut waktu hanya dari pengukuran aktif yang punya angka, dan daftar berisi semuanya", async () => {
    await create(first, { bodyFatPercent: 32, muscleMassKg: 40, numbersAt: new Date(), numbersById: "s", numbersByName: "x", createdAt: new Date("2031-03-01T03:00:00Z") });
    await create(second, { bodyFatPercent: 30, muscleMassKg: 41.5, numbersAt: new Date(), numbersById: "s", numbersByName: "x", createdAt: new Date("2031-04-01T03:00:00Z") });
    await create(second, { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Dobel", createdAt: new Date("2031-04-02T03:00:00Z") }).catch(() => undefined);
    const history = await getBiaHistory(world.patientId);
    expect(history.points.map((p) => [p.bodyFatPercent, p.muscleMassKg])).toEqual([[32, 40], [30, 41.5]]);
    expect(history.points[0].at.getTime()).toBeLessThan(history.points[1].at.getTime());
    expect(history.items.length).toBeGreaterThanOrEqual(2);
  });

  it("resepsionis tidak boleh membaca", async () => {
    actor.role = "RESEPSIONIS";
    await expect(getBiaForVisit(first)).rejects.toThrow("forbidden: record:read");
    await expect(getBiaHistory(world.patientId)).rejects.toThrow("forbidden: record:read");
  });
});
```

Run: `npm run test:integration -- tests/integration/bia-read.test.ts` → FAIL.

`src/server/bia-read.ts`:

```ts
import type { BiaMeasurement, BiaFile } from "@prisma/client";
import { biaAccess, type BiaAccess, type BiaNumbers, type BiaPoint, detectBiaFileType } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/server/session";

export type BiaFileView = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedAt: Date;
  /** Bisa ditampilkan peramban (bukan HEIC). */
  previewable: boolean;
  voided: { at: Date; by: string; reason: string } | null;
};

export type BiaMeasurementView = {
  id: string;
  version: number;
  createdAt: Date;
  createdByName: string;
  appointmentId: string;
  appointmentCode: string;
  numbers: BiaNumbers;
  note: string | null;
  numbersAt: Date | null;
  numbersByName: string | null;
  voided: { at: Date; by: string; reason: string } | null;
  files: BiaFileView[];
};

/** BIA satu kunjungan, untuk halaman Kunjungan (butuh record:read). */
export type BiaVisitView = {
  active: BiaMeasurementView | null;
  /** Pengukuran yang dibatalkan, terbaru dulu. */
  voided: BiaMeasurementView[];
  access: BiaAccess;
  /** Booking sudah SELESAI (kunjungan final): angka yang sudah tersimpan terkunci. */
  final: boolean;
  /** Seluruh titik grafik pasien ini (pengukuran aktif beserta angka), terlama dulu. */
  points: BiaPoint[];
};

/** BIA seluruh kunjungan satu pasien, untuk halaman Data Pasien (butuh record:read). */
export type BiaHistory = { items: BiaMeasurementView[]; points: BiaPoint[] };

const num = (value: { toString(): string } | null): number | null => (value === null ? null : Number(value.toString()));

const MEASUREMENT_SELECT = {
  id: true,
  version: true,
  createdAt: true,
  createdByName: true,
  appointmentId: true,
  bodyFatPercent: true,
  muscleMassKg: true,
  visceralFat: true,
  bmr: true,
  metabolicAge: true,
  bodyWaterPercent: true,
  boneMassKg: true,
  note: true,
  numbersAt: true,
  numbersByName: true,
  voidedAt: true,
  voidedByName: true,
  voidReason: true,
  appointment: { select: { code: true } },
  files: { orderBy: { uploadedAt: "asc" as const } },
} as const;

type Row = Pick<
  BiaMeasurement,
  | "id" | "version" | "createdAt" | "createdByName" | "appointmentId" | "visceralFat" | "bmr" | "metabolicAge" | "note"
  | "numbersAt" | "numbersByName" | "voidedAt" | "voidedByName" | "voidReason"
> & {
  bodyFatPercent: { toString(): string } | null;
  muscleMassKg: { toString(): string } | null;
  bodyWaterPercent: { toString(): string } | null;
  boneMassKg: { toString(): string } | null;
  appointment: { code: string };
  files: BiaFile[];
};

function toFileView(file: BiaFile): BiaFileView {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    uploadedByName: file.uploadedByName,
    uploadedAt: file.uploadedAt,
    previewable: file.mimeType !== "image/heic",
    voided: file.voidedAt ? { at: file.voidedAt, by: file.voidedByName ?? "", reason: file.voidReason ?? "" } : null,
  };
}

function toView(row: Row): BiaMeasurementView {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
    appointmentId: row.appointmentId,
    appointmentCode: row.appointment.code,
    numbers: {
      bodyFatPercent: num(row.bodyFatPercent),
      muscleMassKg: num(row.muscleMassKg),
      visceralFat: row.visceralFat,
      bmr: row.bmr,
      metabolicAge: row.metabolicAge,
      bodyWaterPercent: num(row.bodyWaterPercent),
      boneMassKg: num(row.boneMassKg),
    },
    note: row.note,
    numbersAt: row.numbersAt,
    numbersByName: row.numbersByName,
    voided: row.voidedAt ? { at: row.voidedAt, by: row.voidedByName ?? "", reason: row.voidReason ?? "" } : null,
    files: row.files.map(toFileView),
  };
}

function pointsOf(items: BiaMeasurementView[]): BiaPoint[] {
  return items
    .filter((m) => !m.voided && m.numbersAt !== null)
    .map((m) => ({ at: m.createdAt, bodyFatPercent: m.numbers.bodyFatPercent, muscleMassKg: m.numbers.muscleMassKg }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** BIA satu kunjungan. Tidak mencatat audit: halaman Kunjungan sudah mencatat `encounter.view`; berkasnya dicatat saat dibuka. */
export async function getBiaForVisit(appointmentId: string): Promise<BiaVisitView> {
  const staff = await requireCapability("record:read");
  const appointment = await prisma.appointment.findUnique({
    where: { id: String(appointmentId ?? "") },
    select: { status: true, channel: true, patientId: true },
  });
  const [rows, patientRows] = await Promise.all([
    prisma.biaMeasurement.findMany({ where: { appointmentId: String(appointmentId ?? "") }, select: MEASUREMENT_SELECT, orderBy: { createdAt: "desc" } }),
    appointment?.patientId
      ? prisma.biaMeasurement.findMany({ where: { patientId: appointment.patientId, voidedAt: null }, select: MEASUREMENT_SELECT })
      : Promise.resolve([]),
  ]);
  const views = rows.map(toView);
  return {
    active: views.find((m) => !m.voided) ?? null,
    voided: views.filter((m) => m.voided),
    access: biaAccess(staff.role, appointment ?? { status: "", channel: "KLINIK" }),
    final: appointment?.status === "SELESAI",
    points: pointsOf(patientRows.map(toView)),
  };
}

/** Riwayat BIA satu pasien (halaman Data Pasien), terbaru dulu. */
export async function getBiaHistory(patientId: string): Promise<BiaHistory> {
  await requireCapability("record:read");
  const rows = await prisma.biaMeasurement.findMany({
    where: { patientId: String(patientId ?? "") },
    select: MEASUREMENT_SELECT,
    orderBy: { createdAt: "desc" },
  });
  const items = rows.map(toView);
  return { items, points: pointsOf(items) };
}

export { detectBiaFileType };
```

Hapus baris terakhir `export { detectBiaFileType };` dan impor `detectBiaFileType` (tidak dipakai; ada hanya agar rencana mengingatkan bahwa jenis berkas tidak dideteksi ulang saat membaca). Run: `npm run test:integration -- tests/integration/bia-read.test.ts` → PASS; `npx tsc --noEmit -p .` → bersih.

- [ ] **Step 5: Tulis uji rute (RED)**

`tests/integration/bia-routes.test.ts`:

```ts
// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "@/app/(admin)/admin/bia/berkas/[id]/route";
import { POST } from "@/app/(admin)/admin/bia/unggah/route";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS" | "APOTEKER";
const { state } = vi.hoisted(() => ({
  state: { staff: null as null | { userId: string; staffId: string; name: string; role: Role; email: string } },
}));
vi.mock("@/server/session", () => ({ getCurrentStaff: vi.fn(async () => state.staff) }));

const SLUG = "rute-bia";
const WA = "6281200009104";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const as = (role: Role | null) => {
  state.staff = role ? { userId: "u", staffId: `s-${role}`, name: `Uji ${role}`, role, email: "u@uji.test" } : null;
};
const ORIGIN = "https://sundyclinic.com";

function form(appointmentId: string, bytes: Uint8Array = PNG, name = "hasil.png", type = "image/png") {
  const body = new FormData();
  body.set("appointmentId", appointmentId);
  body.set("file", new File([bytes as BlobPart], name, { type }));
  return body;
}
const post = (body: FormData | string, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/bia/unggah`, { method: "POST", body, headers }));
const get = (id: string, query = "") => GET(new Request(`${ORIGIN}/admin/bia/berkas/${id}${query}`), { params: Promise.resolve({ id }) });

describe("rute hasil BIA", () => {
  let world: BillingWorld;
  let hadir: string;
  let root: string;
  const previous = process.env.PATIENT_FILES_DIR;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-bia-rute-"));
    process.env.PATIENT_FILES_DIR = root;
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    hadir = (await finalVisit(world)).appointmentId;
  });
  beforeEach(async () => {
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
    await prisma.auditLog.deleteMany({ where: { action: "bia.view" } });
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("unggah: tanpa login 401, peran tanpa hak 403, asal asing atau tanpa Origin 403, bukan multipart 400", async () => {
    as(null);
    expect((await post(form(hadir))).status).toBe(401);
    as("APOTEKER");
    expect((await post(form(hadir))).status).toBe(403);
    as("RESEPSIONIS");
    expect((await post(form(hadir), { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form(hadir), { host: "sundyclinic.com" })).status).toBe(403);
    expect((await post("bukan multipart")).status).toBe(400);
    expect(await prisma.biaFile.count()).toBe(0);
  });

  it("unggah: resepsionis berhasil; berkas palsu 422 dengan pesan Indonesia; berkas melebihi batas 413", async () => {
    as("RESEPSIONIS");
    const ok = await post(form(hadir));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, fileId: expect.any(String) });

    const fake = await post(form(hadir, new TextEncoder().encode("<script>alert(1)</script>"), "hasil.jpg", "image/jpeg"));
    expect(fake.status).toBe(422);
    expect(await fake.json()).toEqual({ ok: false, error: "Jenis berkas tidak didukung. Gunakan foto (JPG, PNG, WebP, HEIC) atau PDF." });

    const big = await post(form(hadir, new Uint8Array(10 * 1024 * 1024 + 1), "besar.png"));
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ ok: false, error: "Berkas terlalu besar (maks. 10 MB)." });
    expect(await prisma.biaFile.count({ where: { measurement: { appointmentId: hadir } } })).toBe(1);
  });

  it("buka berkas: tanpa login 401, resepsionis dan apoteker 403 (walau id benar), dokter 200 dengan header aman dan audit", async () => {
    as("RESEPSIONIS");
    const { fileId } = (await (await post(form(hadir))).json()) as { fileId: string };

    as(null);
    expect((await get(fileId)).status).toBe(401);
    as("RESEPSIONIS");
    expect((await get(fileId)).status).toBe(403);
    as("APOTEKER");
    expect((await get(fileId)).status).toBe(403);

    as("DOKTER");
    const response = await get(fileId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(`inline; filename="hasil.png"; filename*=UTF-8''hasil.png`);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...PNG]);
    expect((await get(fileId, "?unduh=1")).headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(await prisma.auditLog.count({ where: { action: "bia.view" } })).toBe(1);
  });

  it("buka berkas: id tak dikenal 404; berkas yang dibatalkan tetap bisa dibuka dokter; berkas hilang dari disk 404", async () => {
    as("DOKTER");
    expect((await get("tidak-ada")).status).toBe(404);
    as("RESEPSIONIS");
    const { fileId } = (await (await post(form(hadir))).json()) as { fileId: string };
    await prisma.biaFile.update({ where: { id: fileId }, data: { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Buram" } });
    as("DOKTER");
    expect((await get(fileId)).status).toBe(200);
    const stored = await prisma.biaFile.findUniqueOrThrow({ where: { id: fileId } });
    await rm(path.join(root, "bia", stored.storageName));
    expect((await get(fileId)).status).toBe(404);
  });

  it("HEIC dikirim sebagai unduhan walau tanpa ?unduh=1", async () => {
    as("DOKTER");
    const heic = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0]);
    const { fileId } = (await (await post(form(hadir, heic, "foto.heic", "image/heic"))).json()) as { fileId: string };
    const response = await get(fileId);
    expect(response.headers.get("content-type")).toBe("image/heic");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
  });
});
```

Run: `npm run test:integration -- tests/integration/bia-routes.test.ts` → Expected: FAIL (rute belum ada).

- [ ] **Step 6: Implementasi rute**

`src/app/(admin)/admin/bia/unggah/route.ts`:

```ts
import { UserFacingError } from "@/lib/action-result";
import { BIA_MAX_BYTES } from "@/lib/bia";
import { can } from "@/lib/permissions";
import { uploadBiaFile } from "@/server/bia-upload";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

const json = (body: { ok: true; fileId: string } | { ok: false; error: string }, status: number) => Response.json(body, { status });

/** Asal permintaan harus situs ini sendiri (cookie sesi saja tidak cukup bagi rute yang menulis). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Satu berkas hasil BIA per permintaan (spec hasil BIA 4.3). Pemeriksaan hak diulang di `uploadBiaFile`. */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return json({ ok: false, error: "Masuk dulu." }, 401);
  if (!can(staff.role, "bia:upload")) return json({ ok: false, error: "Anda tidak berhak mengunggah hasil BIA." }, 403);
  if (!sameOrigin(request)) return json({ ok: false, error: "Permintaan tidak sah." }, 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Permintaan bukan unggahan berkas." }, 400);
  }
  const appointmentId = form.get("appointmentId");
  const file = form.get("file");
  if (typeof appointmentId !== "string" || !(file instanceof File)) return json({ ok: false, error: "Pilih berkas yang akan diunggah." }, 400);
  if (file.size > BIA_MAX_BYTES) return json({ ok: false, error: "Berkas terlalu besar (maks. 10 MB)." }, 413);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await uploadBiaFile({ actor: staff, appointmentId, originalName: file.name, bytes });
    return json({ ok: true, fileId: saved.fileId }, 200);
  } catch (error) {
    if (error instanceof UserFacingError) return json({ ok: false, error: error.message }, 422);
    console.error("Gagal menyimpan hasil BIA", error);
    return json({ ok: false, error: "Gagal menyimpan berkas. Coba lagi." }, 500);
  }
}
```

`src/app/(admin)/admin/bia/berkas/[id]/route.ts`:

```ts
import { contentDisposition } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { recordAuditThrottled } from "@/server/audit";
import { readBiaFile } from "@/server/bia-storage";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Membuka satu berkas hasil BIA. Tidak ada alamat publik: login dan hak rekam medis diperiksa di sini (spec hasil BIA 4.3). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Masuk dulu.", { status: 401 });
  if (!can(staff.role, "record:read")) return new Response("Anda tidak berhak membuka hasil BIA.", { status: 403 });

  const { id } = await params;
  const file = await prisma.biaFile.findUnique({
    where: { id: String(id ?? "") },
    select: { storageName: true, originalName: true, mimeType: true, measurement: { select: { id: true, appointment: { select: { code: true } } } } },
  });
  if (!file) return new Response("Berkas tidak ditemukan.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readBiaFile(file.storageName);
  } catch (error) {
    console.error("Berkas BIA hilang dari penyimpanan", id, error);
    return new Response("Berkas tidak ditemukan di penyimpanan.", { status: 404 });
  }

  await recordAuditThrottled({
    actor: staff,
    action: "bia.view",
    entity: "BiaMeasurement",
    entityId: file.measurement.id,
    summary: `${file.measurement.appointment.code} · ${file.originalName}`,
  });
  const forceDownload = new URL(request.url).searchParams.get("unduh") === "1" || file.mimeType === "image/heic";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": contentDisposition(file.originalName, forceDownload ? "attachment" : "inline"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
```

Run: `npm run test:integration -- tests/integration/bia-routes.test.ts` → Expected: PASS (5 uji). Bila `File`/`FormData` di lingkungan node vitest bermasalah untuk berkas 10 MB lebih, kecilkan hanya ukuran dengan konstanta `BIA_MAX_BYTES + 1` (jangan menurunkan batas).

- [ ] **Step 7: Verifikasi tugas dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npm run test:integration -- tests/integration/bia-upload.test.ts tests/integration/bia-actions.test.ts tests/integration/bia-read.test.ts tests/integration/bia-routes.test.ts tests/integration/bia-schema.test.ts && npx vitest run`
Expected: semua lulus.

```bash
git add src/server/bia-upload.ts src/server/bia-actions.ts src/server/bia-read.ts "src/app/(admin)/admin/bia" tests/integration/bia-upload.test.ts tests/integration/bia-actions.test.ts tests/integration/bia-read.test.ts tests/integration/bia-routes.test.ts
git commit -m "feat: upload, read, and void BIA results through guarded server code and routes"
```


---

### Task 5: Daftar Booking — "Unggah hasil BIA" dan penanda "BIA terunggah"

**Files:**
- Modify: `src/lib/booking-actions.ts` (aksi `UPLOAD_BIA`)
- Modify: `src/server/appointment.ts` (`BOOKING_LIST_INCLUDE` memuat ringkasan BIA tanpa isi klinis)
- Modify: `src/server/bia-actions.ts` (aksi `listBiaUploads`)
- Create: `src/components/admin/bia/send-files.ts` (kirim berkas ke rute, satu per satu)
- Create: `src/components/admin/bia/bia-file-picker.tsx`
- Create: `src/components/admin/bia/bia-void-dialog.tsx`
- Create: `src/components/admin/bia/bia-upload-dialog.tsx`
- Modify: `src/components/admin/booking-dialogs.tsx` (`openBiaUpload`)
- Modify: `src/components/admin/appointment-table.tsx` (kolom `BookingRow`, aksi, penanda)
- Modify: `src/app/(admin)/admin/booking/page.tsx` (`toRow`)
- Test: `tests/unit/booking-actions.test.ts`, `tests/unit/bia-send-files.test.ts` (baru), `tests/unit/components/bia-upload-dialog.test.tsx` (baru), `tests/unit/components/appointment-table.test.tsx`, `tests/integration/bia-actions.test.ts` (tambah blok)

**Interfaces:**
- Consumes: `biaAccess`, `BIA_ACCEPT`, `BIA_MAX_BYTES` (Task 2); `voidBiaFile` (Task 4); rute `POST /admin/bia/unggah` → `{ ok: true; fileId } | { ok: false; error }` (Task 4).
- Produces:
  - `BookingAction` baru `"UPLOAD_BIA"` berlabel `"Unggah hasil BIA"`; `BookingActionRow.biaUploadAvailable?: boolean`.
  - `BookingRow.biaUploadAvailable: boolean` dan `BookingRow.bia: { fileCount: number; lastLabel: string } | null`.
  - `listBiaUploads(appointmentId: string): Promise<ActionResult<BiaUploadSummary>>` dengan `type BiaUploadSummary = { canUpload: boolean; files: { id: string; originalName: string; uploadedAt: Date; uploadedByName: string; canVoid: boolean }[] }` (diekspor dari `@/server/bia-actions` sebagai tipe).
  - `sendBiaFile(appointmentId: string, file: File): Promise<SendResult>`; `type SendResult = { name: string; ok: true } | { name: string; ok: false; error: string }` dari `@/components/admin/bia/send-files`.
  - `BiaFilePicker({ appointmentId, onUploaded }: { appointmentId: string; onUploaded: () => void })` — tombol "Pilih foto atau PDF" dengan `<input type="file">` berlabel "Berkas hasil BIA", daftar hasil per berkas ("Terunggah" atau pesan galat).
  - `BiaVoidDialog({ open, title, description, onClose, onConfirm }: { open: boolean; title: string; description: string; onClose: () => void; onConfirm: (reason: string) => Promise<ActionResult<void>> })` — dialog alasan pembatalan, dipakai Task 6 juga.
  - `BiaUploadDialog({ target, open, onOpenChange })`, `type BiaUploadTarget = { appointmentId: string; code: string; patientName: string }`; judul dialog `Hasil BIA — <kode>`.

- [ ] **Step 1: Uji aturan aksi (RED)**

`tests/unit/booking-actions.test.ts`, tambahkan di dalam `describe` yang memuat uji "customer yang sudah check-in hari ini" (pakai objek `site` yang sama):

```ts
  it("Unggah hasil BIA di menu booking hadir, setelah Food recall dan sebelum Lihat isian", () => {
    expect(BOOKING_ACTION_LABEL.UPLOAD_BIA).toBe("Unggah hasil BIA");
    expect(bookingRowActions({ ...site, status: "HADIR", foodRecallAvailable: true, biaUploadAvailable: true }, true)).toEqual({
      primary: [],
      menu: ["FOOD_RECALL", "UPLOAD_BIA", "VIEW_INTAKE"],
    });
    expect(bookingRowActions({ ...site, status: "HADIR", biaUploadAvailable: true }, false).menu).toEqual(["UPLOAD_BIA"]);
    expect(bookingRowActions({ ...site, status: "HADIR", biaUploadAvailable: false }, false).menu).toEqual([]);
  });
```

Run: `npx vitest run tests/unit/booking-actions.test.ts` → FAIL (`UPLOAD_BIA` tidak dikenal).

- [ ] **Step 2: Aksi `UPLOAD_BIA`**

`src/lib/booking-actions.ts`: tambahkan `| "UPLOAD_BIA"` setelah `| "FOOD_RECALL"` di tipe `BookingAction`; tambahkan `UPLOAD_BIA: "Unggah hasil BIA",` setelah `FOOD_RECALL: "Food recall",`; tambahkan di `BookingActionRow` setelah `foodRecallAvailable?: boolean;`:

```ts
  /** Staf boleh mengunggah hasil BIA untuk booking klinik yang sudah check-in (spec hasil BIA 6.1). */
  biaUploadAvailable?: boolean;
```

Ganti baris terakhir `baseRowActions`:

```ts
  return { primary: [], menu: row.foodRecallAvailable ? ["FOOD_RECALL", ...intake] : intake };
```

menjadi:

```ts
  const menu: BookingAction[] = [];
  if (row.foodRecallAvailable) menu.push("FOOD_RECALL");
  if (row.biaUploadAvailable) menu.push("UPLOAD_BIA");
  return { primary: [], menu: [...menu, ...intake] };
```

Run: `npx vitest run tests/unit/booking-actions.test.ts` → PASS.

- [ ] **Step 3: Uji `listBiaUploads` (RED) dan implementasinya**

`tests/integration/bia-actions.test.ts`: tambahkan `listBiaUploads` ke impor dari `@/server/bia-actions`, lalu tambahkan uji di akhir `describe`:

```ts
  it("daftar unggahan untuk dialog resepsionis: hanya berkas aktif, nama dan pengunggah, hak batal per berkas", async () => {
    const id = await measurementFor(hadir);
    const mine = await addFile(id, "s-resepsionis");
    await addFile(id, "s-lain");
    const voided = await addFile(id, "s-resepsionis");
    await prisma.biaFile.update({ where: { id: voided.id }, data: { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "x" } });
    actor.role = "RESEPSIONIS";
    actor.staffId = "s-resepsionis";
    const summary = await unwrap(listBiaUploads(hadir));
    expect(summary.canUpload).toBe(true);
    expect(summary.files.map((f) => [f.id === mine.id, f.canVoid])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(Object.keys(summary.files[0]).sort()).toEqual(["canVoid", "id", "originalName", "uploadedAt", "uploadedByName"]);
    actor.role = "APOTEKER";
    await expect(listBiaUploads(hadir)).rejects.toThrow("forbidden: bia:upload");
  });
```

Run: `npm run test:integration -- tests/integration/bia-actions.test.ts` → FAIL (`listBiaUploads` belum ada).

Tambahkan di akhir `src/server/bia-actions.ts`:

```ts
export type BiaUploadSummary = {
  canUpload: boolean;
  files: { id: string; originalName: string; uploadedAt: Date; uploadedByName: string; canVoid: boolean }[];
};

/** Berkas aktif satu booking untuk dialog unggah. Tanpa angka dan tanpa tautan berkas: resepsionis tidak membaca rekam medis. */
export async function listBiaUploads(appointmentId: string): Promise<ActionResult<BiaUploadSummary>> {
  return runAction(async () => {
    const actor = await requireCapability("bia:upload");
    const id = String(appointmentId ?? "");
    const appointment = await prisma.appointment.findUnique({ where: { id }, select: { status: true, channel: true } });
    if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
    const access = biaAccess(actor.role, appointment);
    const files = await prisma.biaFile.findMany({
      where: { voidedAt: null, measurement: { appointmentId: id, voidedAt: null } },
      orderBy: { uploadedAt: "asc" },
      select: { id: true, originalName: true, uploadedAt: true, uploadedByName: true, uploadedById: true },
    });
    return {
      canUpload: access.upload,
      files: files.map(({ uploadedById, ...file }) => ({
        ...file,
        canVoid: access.voidAny || (access.voidOwnFile && uploadedById === actor.staffId),
      })),
    };
  });
}
```

Run lagi → PASS.

- [ ] **Step 4: Uji pengirim berkas (RED) dan implementasinya**

`tests/unit/bia-send-files.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBiaFile } from "@/components/admin/bia/send-files";

const file = (size = 10, name = "hasil.png") => new File([new Uint8Array(size)], name, { type: "image/png" });

afterEach(() => vi.unstubAllGlobals());

describe("mengirim berkas BIA", () => {
  it("mengirim satu berkas dan id booking ke rute unggah", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, fileId: "f1" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendBiaFile("a1", file())).toEqual({ name: "hasil.png", ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/admin/bia/unggah");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("appointmentId")).toBe("a1");
    expect((body.get("file") as File).name).toBe("hasil.png");
  });

  it("meneruskan pesan penolakan server, dan pesan umum bila jawaban bukan JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "Jenis berkas tidak didukung." }, { status: 422 })));
    expect(await sendBiaFile("a1", file())).toEqual({ name: "hasil.png", ok: false, error: "Jenis berkas tidak didukung." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>413</html>", { status: 413 })));
    expect(await sendBiaFile("a1", file())).toEqual({ name: "hasil.png", ok: false, error: "Gagal mengunggah. Coba lagi." });
  });

  it("menolak berkas di atas 10 MB tanpa mengirimnya, dan melaporkan koneksi terputus", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendBiaFile("a1", file(10 * 1024 * 1024 + 1, "besar.png"))).toEqual({ name: "besar.png", ok: false, error: "Berkas terlalu besar (maks. 10 MB)." });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await sendBiaFile("a1", file())).toEqual({ name: "hasil.png", ok: false, error: "Koneksi terputus. Coba lagi." });
  });
});
```

Run: `npx vitest run tests/unit/bia-send-files.test.ts` → FAIL.

`src/components/admin/bia/send-files.ts`:

```ts
import { BIA_MAX_BYTES } from "@/lib/bia";

export type SendResult = { name: string; ok: true } | { name: string; ok: false; error: string };

/** Satu berkas per permintaan (spec hasil BIA 4.3), sehingga tiap permintaan di bawah batas nginx. */
export async function sendBiaFile(appointmentId: string, file: File): Promise<SendResult> {
  if (file.size > BIA_MAX_BYTES) return { name: file.name, ok: false, error: "Berkas terlalu besar (maks. 10 MB)." };
  const body = new FormData();
  body.set("appointmentId", appointmentId);
  body.set("file", file);
  try {
    const response = await fetch("/admin/bia/unggah", { method: "POST", body });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (response.ok && data?.ok) return { name: file.name, ok: true };
    return { name: file.name, ok: false, error: data?.error ?? "Gagal mengunggah. Coba lagi." };
  } catch {
    return { name: file.name, ok: false, error: "Koneksi terputus. Coba lagi." };
  }
}
```

Run → PASS (3 uji).

- [ ] **Step 5: Uji dialog unggah (RED)**

`tests/unit/components/bia-upload-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BiaUploadDialog } from "@/components/admin/bia/bia-upload-dialog";
import { sendBiaFile } from "@/components/admin/bia/send-files";
import { listBiaUploads, voidBiaFile } from "@/server/bia-actions";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/bia-actions", () => ({ listBiaUploads: vi.fn(), voidBiaFile: vi.fn() }));
vi.mock("@/components/admin/bia/send-files", () => ({ sendBiaFile: vi.fn() }));

const target = { appointmentId: "a1", code: "SDY-8F3K", patientName: "Siti Rahayu" };
const summary = (files: { id: string; originalName: string; canVoid: boolean }[], canUpload = true) => ({
  ok: true as const,
  data: { canUpload, files: files.map((f) => ({ ...f, uploadedAt: new Date("2026-10-09T02:42:00Z"), uploadedByName: "Rina" })) },
});

beforeEach(() => {
  vi.mocked(listBiaUploads).mockReset();
  vi.mocked(sendBiaFile).mockReset();
  vi.mocked(voidBiaFile).mockReset();
});

describe("dialog unggah hasil BIA", () => {
  it("mengunggah berkas satu per satu, menampilkan hasil per berkas, lalu memuat ulang daftar", async () => {
    vi.mocked(listBiaUploads).mockResolvedValueOnce(summary([])).mockResolvedValueOnce(summary([{ id: "f1", originalName: "hasil.png", canVoid: true }]));
    vi.mocked(sendBiaFile)
      .mockResolvedValueOnce({ name: "hasil.png", ok: true })
      .mockResolvedValueOnce({ name: "palsu.jpg", ok: false, error: "Jenis berkas tidak didukung." });
    renderAdmin(<BiaUploadDialog target={target} open onOpenChange={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Hasil BIA — SDY-8F3K" });
    expect(await within(dialog).findByText("Belum ada berkas BIA untuk booking ini.")).toBeInTheDocument();
    await userEvent.upload(within(dialog).getByLabelText("Berkas hasil BIA"), [
      new File(["x"], "hasil.png", { type: "image/png" }),
      new File(["y"], "palsu.jpg", { type: "image/jpeg" }),
    ]);
    expect(await within(dialog).findByText("hasil.png: terunggah")).toBeInTheDocument();
    expect(within(dialog).getByText("palsu.jpg: Jenis berkas tidak didukung.")).toBeInTheDocument();
    expect(vi.mocked(sendBiaFile).mock.calls.map(([id, file]) => [id, file.name])).toEqual([["a1", "hasil.png"], ["a1", "palsu.jpg"]]);
    await waitFor(() => expect(listBiaUploads).toHaveBeenCalledTimes(2));
    expect(within(dialog).getByRole("listitem", { name: /hasil\.png/ })).toHaveTextContent("Rina");
    // Resepsionis tidak mendapat tautan ke berkas.
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("membatalkan berkas dengan alasan; tombol Batalkan hanya untuk berkas yang boleh", async () => {
    vi.mocked(listBiaUploads).mockResolvedValue(summary([{ id: "f1", originalName: "milik-saya.png", canVoid: true }, { id: "f2", originalName: "milik-lain.png", canVoid: false }]));
    vi.mocked(voidBiaFile).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<BiaUploadDialog target={target} open onOpenChange={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Hasil BIA — SDY-8F3K" });
    await within(dialog).findByText("milik-saya.png");
    expect(within(dialog).getAllByRole("button", { name: /^Batalkan / })).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Batalkan milik-saya.png" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Batalkan berkas milik-saya.png?" });
    await userEvent.type(within(confirm).getByLabelText("Alasan pembatalan"), "Foto buram");
    await userEvent.click(within(confirm).getByRole("button", { name: "Batalkan berkas" }));
    await waitFor(() => expect(voidBiaFile).toHaveBeenCalledWith({ fileId: "f1", reason: "Foto buram" }));
  });

  it("tanpa hak mengunggah (kunjungan final untuk resepsionis): kotak pilih berkas tidak tampil dan alasannya ditulis", async () => {
    vi.mocked(listBiaUploads).mockResolvedValue(summary([], false));
    renderAdmin(<BiaUploadDialog target={target} open onOpenChange={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Hasil BIA — SDY-8F3K" });
    expect(await within(dialog).findByText("Unggahan sudah ditutup untuk booking ini. Minta dokter menambahkan hasil BIA.")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Berkas hasil BIA")).toBeNull();
  });
});
```

Run: `npx vitest run tests/unit/components/bia-upload-dialog.test.tsx` → FAIL (komponen belum ada).

- [ ] **Step 6: Komponen pemilih berkas, dialog batal, dan dialog unggah (GREEN)**

`src/components/admin/bia/bia-file-picker.tsx`:

```tsx
"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { BIA_ACCEPT } from "@/lib/bia";
import { sendBiaFile, type SendResult } from "./send-files";

/**
 * Pilih satu atau beberapa foto/PDF hasil BIA (spec hasil BIA 6.1). Di ponsel dan tablet kotak pilih berkas
 * langsung menawarkan kamera atau galeri. Berkas dikirim berurutan; hasil tiap berkas ditulis di bawahnya.
 */
export function BiaFilePicker({ appointmentId, onUploaded }: { appointmentId: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);

  async function send(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setResults([]);
    const done: SendResult[] = [];
    for (const file of files) {
      done.push(await sendBiaFile(appointmentId, file));
      setResults([...done]);
    }
    setBusy(false);
    if (done.some((result) => result.ok)) onUploaded();
  }

  return (
    <Stack spacing={1}>
      <Box>
        <Button component="label" variant="outlined" disabled={busy}>
          {busy ? "Mengunggah…" : "Pilih foto atau PDF"}
          <input
            hidden
            type="file"
            multiple
            accept={BIA_ACCEPT}
            aria-label="Berkas hasil BIA"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void send(files);
            }}
          />
        </Button>
      </Box>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        JPG, PNG, WebP, HEIC, atau PDF; paling besar 10 MB per berkas, paling banyak 5 berkas.
      </Typography>
      {results.length > 0 && (
        <Box component="ul" aria-label="Hasil unggahan" sx={{ m: 0, pl: 2.5, fontSize: "0.875rem" }}>
          {results.map((result, index) => (
            <Box component="li" key={`${result.name}-${index}`} sx={{ color: result.ok ? "success.main" : "error.main" }}>
              {result.ok ? `${result.name}: terunggah` : `${result.name}: ${result.error}`}
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}
```

`src/components/admin/bia/bia-void-dialog.tsx`:

```tsx
"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useId, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

/** Pembatalan beralasan (spec hasil BIA B6): tidak ada yang dihapus, alasan wajib. */
export function BiaVoidDialog({
  open,
  title,
  description,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<ActionResult<void>>;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    const result = await onConfirm(reason);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReason("");
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-describedby={`${id}-desc`} slotProps={{ paper: { role: "alertdialog" } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${id}-desc`} sx={{ mb: 2 }}>
          {description}
        </DialogContentText>
        <TextField
          label="Alasan pembatalan"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={error !== null}
          helperText={error ?? " "}
          fullWidth
          autoFocus
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Kembali</Button>
        <Button color="error" variant="contained" disabled={pending || reason.trim() === ""} onClick={() => void confirm()}>
          {title.startsWith("Batalkan pengukuran") ? "Batalkan pengukuran" : "Batalkan berkas"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

`src/components/admin/bia/bia-upload-dialog.tsx`:

```tsx
"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { listBiaUploads, voidBiaFile, type BiaUploadSummary } from "@/server/bia-actions";
import { BiaFilePicker } from "./bia-file-picker";
import { BiaVoidDialog } from "./bia-void-dialog";

export type BiaUploadTarget = { appointmentId: string; code: string; patientName: string };

/** Dialog resepsionis di daftar Booking (spec hasil BIA 6.1): unggah dan batalkan unggahan sendiri, tanpa membuka isi berkas. */
export function BiaUploadDialog({ target, open, onOpenChange }: { target: BiaUploadTarget; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [summary, setSummary] = useState<BiaUploadSummary | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    listBiaUploads(target.appointmentId)
      .then((result) => (result.ok ? setSummary(result.data) : toast.error(result.error)))
      .catch(() => toast.error("Daftar berkas gagal dimuat. Coba lagi."));
  }, [target.appointmentId]);
  useEffect(load, [load]);

  const refresh = () => {
    load();
    router.refresh();
  };

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} fullWidth maxWidth="sm">
      <DialogTitle>Hasil BIA — {target.code}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {target.patientName}
          </Typography>
          {summary === null ? (
            <Typography variant="body2">Memuat…</Typography>
          ) : (
            <>
              {summary.files.length === 0 ? (
                <Typography variant="body2">Belum ada berkas BIA untuk booking ini.</Typography>
              ) : (
                <Box component="ul" aria-label="Berkas BIA terunggah" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
                  {summary.files.map((file) => (
                    <Box
                      component="li"
                      key={file.id}
                      aria-label={file.originalName}
                      sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", fontSize: "0.875rem" }}
                    >
                      <Box component="span" sx={{ fontWeight: 500, overflowWrap: "anywhere", minWidth: 0 }}>
                        {file.originalName}
                      </Box>
                      <Box component="span" sx={{ color: "text.secondary" }}>
                        {minutesToTimeLabel(witaMinutesOfDay(file.uploadedAt))} · {file.uploadedByName}
                      </Box>
                      {file.canVoid && (
                        <Button size="small" color="error" sx={{ ml: "auto" }} aria-label={`Batalkan ${file.originalName}`} onClick={() => setVoiding({ id: file.id, name: file.originalName })}>
                          Batalkan
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              {summary.canUpload ? (
                <BiaFilePicker appointmentId={target.appointmentId} onUploaded={refresh} />
              ) : (
                <Typography variant="body2">Unggahan sudah ditutup untuk booking ini. Minta dokter menambahkan hasil BIA.</Typography>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onOpenChange(false)}>Tutup</Button>
      </DialogActions>
      {voiding && (
        <BiaVoidDialog
          open
          title={`Batalkan berkas ${voiding.name}?`}
          description="Berkas tidak dihapus; ia ditandai dibatalkan beserta alasannya."
          onClose={() => setVoiding(null)}
          onConfirm={async (reason) => {
            const result = await voidBiaFile({ fileId: voiding.id, reason });
            if (result.ok) {
              toast.success("Berkas dibatalkan.");
              refresh();
            }
            return result;
          }}
        />
      )}
    </Dialog>
  );
}
```

Run: `npx vitest run tests/unit/components/bia-upload-dialog.test.tsx` → PASS (3 uji). `witaMinutesOfDay(Date)` dan `minutesToTimeLabel(number)` sudah ada di `@/lib/time` (dipakai `booking/page.tsx`).

- [ ] **Step 7: Sambungkan ke daftar Booking (RED → GREEN)**

`tests/unit/components/appointment-table.test.tsx`:
- Tambahkan `biaUploadAvailable: false,` dan `bia: null,` ke objek `base` (setelah `foodRecallAvailable: false,`).
- Tambahkan mock `vi.mock("@/server/bia-actions", () => ({ listBiaUploads: vi.fn().mockResolvedValue({ ok: true, data: { canUpload: true, files: [] } }), voidBiaFile: vi.fn() }));` di samping mock lain.
- Tambahkan uji (gunakan pola `renderTable` dan menu "Aksi lain" yang sudah ada di berkas itu, seperti uji Food recall di baris ±483):

```tsx
  it("booking hadir: penanda BIA terunggah dan menu Unggah hasil BIA membuka dialognya", async () => {
    renderTable([{ ...base, status: "HADIR", biaUploadAvailable: true, bia: { fileCount: 2, lastLabel: "10.42 · Rina" } }]);
    expect(screen.getByText("BIA terunggah: 2 berkas · 10.42 · Rina")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aksi lain SDY-8F3K" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Unggah hasil BIA" }));
    expect(await screen.findByRole("dialog", { name: "Hasil BIA — SDY-8F3K" })).toBeInTheDocument();
  });
```

Run: `npx vitest run tests/unit/components/appointment-table.test.tsx` → FAIL (tipe dan tampilan belum ada).

`src/components/admin/appointment-table.tsx`:
- Di tipe `BookingRow`, setelah `foodRecallAvailable: boolean;`:

```ts
  /** Aksi "Unggah hasil BIA" tersedia (spec hasil BIA 6.1). */
  biaUploadAvailable: boolean;
  /** Ringkasan unggahan BIA aktif tanpa isi klinis, mis. { fileCount: 2, lastLabel: "10.42 · Rina" }. */
  bia: { fileCount: number; lastLabel: string } | null;
```

- Di `actionTarget`, setelah `case "FOOD_RECALL": …`:

```ts
      case "UPLOAD_BIA":
        return {
          onSelect: () => dialogs.openBiaUpload({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
```

- Tepat setelah baris `{row.foodRecall && <Box sx={{ ...small, mt: 0.5 }}>Food recall: …</Box>}` tambahkan:

```tsx
          {row.bia && (
            <Box sx={{ ...small, mt: 0.5 }}>
              BIA terunggah: {row.bia.fileCount} berkas · {row.bia.lastLabel}
            </Box>
          )}
```

`src/components/admin/booking-dialogs.tsx`: impor `import { BiaUploadDialog, type BiaUploadTarget } from "./bia/bia-upload-dialog";`; tambahkan ke tipe `BookingDialogs` `/** Dialog "Unggah hasil BIA" (spec hasil BIA 6.1). */ openBiaUpload: (target: BiaUploadTarget) => void;`; tambahkan state `const [biaUpload, setBiaUpload] = useState<BiaUploadTarget | null>(null);`, `openBiaUpload: setBiaUpload,` di `useMemo`, dan setelah blok `{foodRecall && (…)}`:

```tsx
      {biaUpload && (
        <BiaUploadDialog
          key={biaUpload.appointmentId}
          target={biaUpload}
          open
          onOpenChange={(open) => {
            if (!open) setBiaUpload(null);
          }}
        />
      )}
```

Cari pemakai lain tipe `BookingDialogs` (mis. mock di uji): `grep -rn "openFoodRecall" tests src` dan tambahkan `openBiaUpload: vi.fn()` di setiap tiruan konteks yang ditemukan.

`src/server/appointment.ts`, di `BOOKING_LIST_INCLUDE` setelah `encounter: { select: { status: true } },`:

```ts
  // Hanya hitungan, jam, dan nama pengunggah: tanpa angka dan tanpa nama berkas (spec hasil BIA 5).
  biaMeasurements: {
    where: { voidedAt: null },
    select: { files: { where: { voidedAt: null }, select: { uploadedAt: true, uploadedByName: true }, orderBy: { uploadedAt: "desc" as const } } },
  },
```

`src/app/(admin)/admin/booking/page.tsx`:
- `type RowContext = { bank: BankAccount; siteUrl: string; now: Date; canUploadBia: boolean };`
- Di `toRow`, setelah `foodRecallAvailable: …,`:

```ts
    biaUploadAvailable: context.canUploadBia && a.channel === "KLINIK" && a.status === "HADIR" && patient !== null,
    bia: biaSummary(a.biaMeasurements.flatMap((m) => m.files)),
```

- Di atas `toRow`:

```ts
function biaSummary(files: { uploadedAt: Date; uploadedByName: string }[]): BookingRow["bia"] {
  if (files.length === 0) return null;
  const last = files.reduce((a, b) => (a.uploadedAt > b.uploadedAt ? a : b));
  return { fileCount: files.length, lastLabel: `${timeLabel(last.uploadedAt)} · ${last.uploadedByName}` };
}
```

- Di pembuatan `context`: `const context: RowContext = { bank: setting, siteUrl: publicSiteUrl(), now, canUploadBia: can(staff.role, "bia:upload") };`

`listPendingBookings`, `listOnlineBookings`, dan `searchBookings` juga memakai `BOOKING_LIST_INCLUDE`, sehingga `a.biaMeasurements` selalu ada; bila `tsc` menyebut sumber baris lain yang tidak memakai include ini, tambahkan include yang sama di sana.

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/components/appointment-table.test.tsx tests/unit/booking-actions.test.ts tests/unit/components/bia-upload-dialog.test.tsx tests/unit/bia-send-files.test.ts tests/unit/architecture.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/booking-actions.ts src/server/appointment.ts src/server/bia-actions.ts src/components/admin/bia src/components/admin/booking-dialogs.tsx src/components/admin/appointment-table.tsx "src/app/(admin)/admin/booking/page.tsx" tests/unit/booking-actions.test.ts tests/unit/bia-send-files.test.ts tests/unit/components/bia-upload-dialog.test.tsx tests/unit/components/appointment-table.test.tsx tests/integration/bia-actions.test.ts
git commit -m "feat: let front desk staff upload BIA results from the booking list"
```

---

### Task 6: Halaman Kunjungan — tab BIA

**Files:**
- Modify: `src/lib/encounter.ts` (`ContextTab` + `"bia"`)
- Create: `src/components/admin/bia/bia-tab.tsx`
- Create: `tests/fixtures/bia.ts`
- Modify: `src/components/admin/encounter-context-panel.tsx`, `src/components/admin/encounter-workspace.tsx`, `src/components/admin/encounter-page-view.tsx`, `src/app/(admin)/admin/kunjungan/[id]/page.tsx`
- Test: `tests/unit/components/bia-tab.test.tsx` (baru), uji komponen yang merender `EncounterContextPanel`/`EncounterWorkspace`/`EncounterPageView`

**Interfaces:**
- Consumes: `BiaVisitView`, `BiaMeasurementView`, `getBiaForVisit` (Task 4, termasuk `final`); `saveBiaNumbers`, `startBiaMeasurement`, `voidBiaMeasurement`, `voidBiaFile` (Task 4); `BiaFilePicker`, `BiaVoidDialog` (Task 5); `BIA_FIELDS`, `biaFieldLabel`, `biaInputValue`, `EMPTY_BIA_INPUT`, `BiaInput` (Task 2).
- Produces: `BiaTab({ bia, appointmentId }: { bia: BiaVisitView; appointmentId: string })`; prop baru `bia: BiaVisitView` pada `EncounterPageView`, `EncounterWorkspace`, dan `EncounterContextPanel`; fixture `biaVisit(patch?: Partial<BiaVisitView>): BiaVisitView` dan `biaMeasurement(patch?: Partial<BiaMeasurementView>): BiaMeasurementView` di `tests/fixtures/bia.ts`.

- [ ] **Step 1: Fixture dan uji tab (RED)**

`tests/fixtures/bia.ts`:

```ts
import { EMPTY_BIA_NUMBERS } from "@/lib/bia";
import type { BiaMeasurementView, BiaVisitView } from "@/server/bia-read";

export function biaMeasurement(patch: Partial<BiaMeasurementView> = {}): BiaMeasurementView {
  return {
    id: "m1",
    version: 1,
    createdAt: new Date("2026-10-09T02:40:00Z"),
    createdByName: "Rina",
    appointmentId: "a1",
    appointmentCode: "SDY-8F3K",
    numbers: { ...EMPTY_BIA_NUMBERS },
    note: null,
    numbersAt: null,
    numbersByName: null,
    voided: null,
    files: [],
    ...patch,
  };
}

export function biaVisit(patch: Partial<BiaVisitView> = {}): BiaVisitView {
  return {
    active: null,
    voided: [],
    access: { upload: true, editNumbers: true, voidAny: true, voidOwnFile: true, view: true },
    final: false,
    points: [],
    ...patch,
  };
}
```

`tests/unit/components/bia-tab.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BiaTab } from "@/components/admin/bia/bia-tab";
import { saveBiaNumbers, startBiaMeasurement, voidBiaMeasurement } from "@/server/bia-actions";
import { biaMeasurement, biaVisit } from "../../fixtures/bia";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/bia-actions", () => ({
  saveBiaNumbers: vi.fn(),
  startBiaMeasurement: vi.fn(),
  voidBiaMeasurement: vi.fn(),
  voidBiaFile: vi.fn(),
}));
vi.mock("@/components/admin/bia/send-files", () => ({ sendBiaFile: vi.fn() }));

const file = (patch: Record<string, unknown> = {}) => ({
  id: "f1",
  originalName: "hasil.png",
  mimeType: "image/png",
  sizeBytes: 2048,
  uploadedByName: "Rina",
  uploadedAt: new Date("2026-10-09T02:42:00Z"),
  previewable: true,
  voided: null,
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("tab BIA halaman kunjungan", () => {
  it("tanpa pengukuran: keterangan kosong, pemilih berkas, dan tombol mengisi angka tanpa berkas", async () => {
    vi.mocked(startBiaMeasurement).mockResolvedValue({ ok: true, data: { measurementId: "m1" } });
    renderAdmin(<BiaTab bia={biaVisit()} appointmentId="a1" />);
    expect(screen.getByText("Belum ada hasil BIA untuk kunjungan ini.")).toBeInTheDocument();
    expect(screen.getByLabelText("Berkas hasil BIA")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Isi angka tanpa berkas" }));
    await waitFor(() => expect(startBiaMeasurement).toHaveBeenCalledWith("a1"));
    expect(refresh).toHaveBeenCalled();
  });

  it("berkas: gambar dibuka di dialog, PDF di tab baru, HEIC sebagai unduhan; berkas dibatalkan diberi tanda", async () => {
    const active = biaMeasurement({
      files: [
        file(),
        file({ id: "f2", originalName: "hasil.pdf", mimeType: "application/pdf" }),
        file({ id: "f3", originalName: "foto.heic", mimeType: "image/heic", previewable: false }),
        file({ id: "f4", originalName: "buram.jpg", voided: { at: new Date(), by: "dr. Diane", reason: "Buram" } }),
      ],
    });
    renderAdmin(<BiaTab bia={biaVisit({ active })} appointmentId="a1" />);
    expect(screen.getByRole("link", { name: "Buka hasil.pdf" })).toHaveAttribute("href", "/admin/bia/berkas/f2");
    expect(screen.getByRole("link", { name: "Buka hasil.pdf" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Unduh foto.heic" })).toHaveAttribute("href", "/admin/bia/berkas/f3?unduh=1");
    expect(screen.getByText("Dibatalkan: Buram")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Buka hasil.png" }));
    const preview = await screen.findByRole("dialog", { name: "hasil.png" });
    expect(within(preview).getByRole("img", { name: "Hasil BIA hasil.png" })).toHaveAttribute("src", "/admin/bia/berkas/f1");
  });

  it("menyimpan angka dengan koma desimal, lalu memakai versi baru untuk simpan berikutnya", async () => {
    vi.mocked(saveBiaNumbers).mockResolvedValueOnce({ ok: true, data: { version: 2 } }).mockResolvedValueOnce({ ok: false, error: "Lemak tubuh harus 2–70 %." });
    renderAdmin(<BiaTab bia={biaVisit({ active: biaMeasurement() })} appointmentId="a1" />);
    await userEvent.type(screen.getByLabelText("Lemak tubuh (%)"), "28,5");
    await userEvent.type(screen.getByLabelText("Massa otot (kg)"), "41");
    await userEvent.click(screen.getByRole("button", { name: "Simpan angka BIA" }));
    await waitFor(() =>
      expect(saveBiaNumbers).toHaveBeenCalledWith({
        measurementId: "m1",
        version: 1,
        numbers: { bodyFatPercent: "28,5", muscleMassKg: "41", visceralFat: "", bmr: "", metabolicAge: "", bodyWaterPercent: "", boneMassKg: "" },
        note: "",
      }),
    );
    await userEvent.clear(screen.getByLabelText("Lemak tubuh (%)"));
    await userEvent.type(screen.getByLabelText("Lemak tubuh (%)"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Simpan angka BIA" }));
    await waitFor(() => expect(vi.mocked(saveBiaNumbers).mock.calls[1][0].version).toBe(2));
    expect(await screen.findByText("Lemak tubuh harus 2–70 %.")).toBeInTheDocument();
  });

  it("kunjungan final dengan angka tersimpan: baca-saja, tanpa pemilih berkas, dan hanya bisa dibatalkan", async () => {
    vi.mocked(voidBiaMeasurement).mockResolvedValue({ ok: true, data: undefined });
    const active = biaMeasurement({ numbers: { bodyFatPercent: 28.5, muscleMassKg: 41, visceralFat: 9, bmr: null, metabolicAge: null, bodyWaterPercent: null, boneMassKg: null }, numbersAt: new Date(), numbersByName: "dr. Diane" });
    renderAdmin(<BiaTab bia={biaVisit({ active, final: true })} appointmentId="a1" />);
    expect(screen.queryByRole("button", { name: "Simpan angka BIA" })).toBeNull();
    expect(screen.queryByLabelText("Berkas hasil BIA")).toBeNull();
    expect(screen.getByText("Lemak tubuh")).toBeInTheDocument();
    expect(screen.getByText("28,5 %")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Batalkan pengukuran" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Batalkan pengukuran BIA ini?" });
    await userEvent.type(within(confirm).getByLabelText("Alasan pembatalan"), "Salah pasien");
    await userEvent.click(within(confirm).getByRole("button", { name: "Batalkan pengukuran" }));
    await waitFor(() => expect(voidBiaMeasurement).toHaveBeenCalledWith({ measurementId: "m1", reason: "Salah pasien" }));
  });

  it("tanpa hak menulis (mis. booking online): hanya tampilan, tanpa formulir dan tanpa pembatalan", () => {
    renderAdmin(
      <BiaTab bia={biaVisit({ active: biaMeasurement(), access: { upload: false, editNumbers: false, voidAny: false, voidOwnFile: false, view: true } })} appointmentId="a1" />,
    );
    expect(screen.queryByRole("button", { name: "Simpan angka BIA" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Batalkan pengukuran" })).toBeNull();
    expect(screen.getByText("Angka BIA belum diisi.")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/components/bia-tab.test.tsx` → FAIL (komponen belum ada).

- [ ] **Step 2: Komponen `src/components/admin/bia/bia-tab.tsx` (GREEN)**

```tsx
"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BIA_FIELDS, BIA_KEYS, biaFieldLabel, biaInputValue, type BiaInput } from "@/lib/bia";
import { formatDecimal } from "@/lib/encounter";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { BiaFileView, BiaMeasurementView, BiaVisitView } from "@/server/bia-read";
import { saveBiaNumbers, startBiaMeasurement, voidBiaFile, voidBiaMeasurement } from "@/server/bia-actions";
import { BiaFilePicker } from "./bia-file-picker";
import { BiaVoidDialog } from "./bia-void-dialog";

const fileUrl = (id: string, download = false) => `/admin/bia/berkas/${id}${download ? "?unduh=1" : ""}`;
const clock = (date: Date) => minutesToTimeLabel(witaMinutesOfDay(date));

function inputsOf(measurement: BiaMeasurementView): BiaInput {
  return Object.fromEntries(BIA_KEYS.map((key) => [key, biaInputValue(key, measurement.numbers[key])])) as BiaInput;
}

function FileList({ files, canVoid, onPreview, onVoid }: { files: BiaFileView[]; canVoid: boolean; onPreview: (file: BiaFileView) => void; onVoid: (file: BiaFileView) => void }) {
  if (files.length === 0) return <Typography variant="body2">Belum ada berkas untuk pengukuran ini.</Typography>;
  return (
    <Box component="ul" aria-label="Berkas hasil BIA" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
      {files.map((file) => (
        <Box component="li" key={file.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, fontSize: "0.875rem", opacity: file.voided ? 0.7 : 1 }}>
          <Box component="span" sx={{ fontWeight: 500, overflowWrap: "anywhere", minWidth: 0, textDecoration: file.voided ? "line-through" : "none" }}>
            {file.originalName}
          </Box>
          <Box component="span" sx={{ color: "text.secondary" }}>
            {clock(file.uploadedAt)} · {file.uploadedByName}
          </Box>
          {file.voided && (
            <Box component="span" sx={{ color: "error.main" }}>
              Dibatalkan: {file.voided.reason}
            </Box>
          )}
          <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
            {!file.previewable ? (
              <Link href={fileUrl(file.id, true)} aria-label={`Unduh ${file.originalName}`}>
                Unduh
              </Link>
            ) : file.mimeType === "application/pdf" ? (
              <Link href={fileUrl(file.id)} target="_blank" rel="noopener" aria-label={`Buka ${file.originalName}`}>
                Buka
              </Link>
            ) : (
              <Button size="small" aria-label={`Buka ${file.originalName}`} onClick={() => onPreview(file)}>
                Buka
              </Button>
            )}
            {canVoid && !file.voided && (
              <Button size="small" color="error" aria-label={`Batalkan ${file.originalName}`} onClick={() => onVoid(file)}>
                Batalkan
              </Button>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function NumbersReadOnly({ measurement }: { measurement: BiaMeasurementView }) {
  if (!measurement.numbersAt) return <Typography variant="body2">Angka BIA belum diisi.</Typography>;
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5, fontSize: "0.875rem" }}>
      {BIA_FIELDS.filter((spec) => measurement.numbers[spec.key] !== null).map((spec) => (
        <Box key={spec.key} sx={{ display: "contents" }}>
          <Box component="dt" sx={{ color: "text.secondary" }}>
            {spec.label}
          </Box>
          <Box component="dd" sx={{ m: 0, fontVariantNumeric: "tabular-nums" }}>
            {formatDecimal(measurement.numbers[spec.key]!, spec.decimals)}
            {spec.unit ? ` ${spec.unit}` : ""}
          </Box>
        </Box>
      ))}
      {measurement.note && (
        <Box sx={{ gridColumn: "1 / -1", whiteSpace: "pre-line" }}>Catatan: {measurement.note}</Box>
      )}
    </Box>
  );
}

function NumbersForm({ measurement, onSaved }: { measurement: BiaMeasurementView; onSaved: () => void }) {
  const [values, setValues] = useState<BiaInput>(() => inputsOf(measurement));
  const [note, setNote] = useState(measurement.note ?? "");
  const [version, setVersion] = useState(measurement.version);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const result = await saveBiaNumbers({ measurementId: measurement.id, version, numbers: values, note });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setVersion(result.data.version);
    toast.success("Angka BIA tersimpan.");
    onSaved();
  }

  return (
    <Stack component="form" spacing={1.5} onSubmit={(event) => { event.preventDefault(); void save(); }} aria-label="Angka BIA">
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" } }}>
        {BIA_FIELDS.map((spec) => (
          <TextField
            key={spec.key}
            label={biaFieldLabel(spec)}
            value={values[spec.key]}
            onChange={(event) => setValues((current) => ({ ...current, [spec.key]: event.target.value }))}
            slotProps={{ htmlInput: { inputMode: spec.decimals === 0 ? "numeric" : "decimal" } }}
          />
        ))}
      </Box>
      <TextField label="Catatan BIA (opsional)" value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 500 } }} />
      {error && (
        <Typography role="alert" variant="body2" sx={{ color: "error.main" }}>
          {error}
        </Typography>
      )}
      <Box>
        <Button type="submit" variant="contained" disabled={pending}>
          Simpan angka BIA
        </Button>
      </Box>
    </Stack>
  );
}

/** Tab BIA halaman kunjungan (spec hasil BIA 6.2). */
export function BiaTab({ bia, appointmentId }: { bia: BiaVisitView; appointmentId: string }) {
  const router = useRouter();
  const { active, access, final } = bia;
  const locked = final && active?.numbersAt != null;
  const [preview, setPreview] = useState<BiaFileView | null>(null);
  const [voidingFile, setVoidingFile] = useState<BiaFileView | null>(null);
  const [voidingMeasurement, setVoidingMeasurement] = useState(false);
  const refresh = () => router.refresh();

  async function start() {
    const result = await startBiaMeasurement(appointmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    refresh();
  }

  return (
    <Stack spacing={2}>
      {!active ? (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography variant="body2">Belum ada hasil BIA untuk kunjungan ini.</Typography>
          {access.editNumbers && (
            <Button size="small" onClick={() => void start()}>
              Isi angka tanpa berkas
            </Button>
          )}
        </Stack>
      ) : (
        <>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Diukur {clock(active.createdAt)} · dicatat {active.createdByName}
            {active.numbersByName ? ` · angka oleh ${active.numbersByName}` : ""}
          </Typography>
          <FileList files={active.files} canVoid={access.voidAny} onPreview={setPreview} onVoid={setVoidingFile} />
        </>
      )}
      {access.upload && !locked && <BiaFilePicker appointmentId={appointmentId} onUploaded={refresh} />}
      {active && (access.editNumbers && !locked ? <NumbersForm key={`${active.id}-${active.version}`} measurement={active} onSaved={refresh} /> : <NumbersReadOnly measurement={active} />)}
      {active && access.voidAny && (
        <Box>
          <Button color="error" size="small" onClick={() => setVoidingMeasurement(true)}>
            Batalkan pengukuran
          </Button>
        </Box>
      )}
      {bia.voided.length > 0 && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {bia.voided.length} pengukuran dibatalkan: {bia.voided.map((m) => m.voided?.reason).join("; ")}
        </Typography>
      )}

      <Dialog open={preview !== null} onClose={() => setPreview(null)} maxWidth="md" fullWidth aria-labelledby="bia-preview-title">
        <DialogTitle id="bia-preview-title">{preview?.originalName}</DialogTitle>
        <DialogContent>
          {preview && <Box component="img" src={fileUrl(preview.id)} alt={`Hasil BIA ${preview.originalName}`} sx={{ display: "block", maxWidth: "100%", mx: "auto" }} />}
        </DialogContent>
        <DialogActions>
          {preview && <Link href={fileUrl(preview.id, true)}>Unduh</Link>}
          <Button onClick={() => setPreview(null)}>Tutup</Button>
        </DialogActions>
      </Dialog>

      {voidingFile && (
        <BiaVoidDialog
          open
          title={`Batalkan berkas ${voidingFile.originalName}?`}
          description="Berkas tidak dihapus; ia ditandai dibatalkan beserta alasannya."
          onClose={() => setVoidingFile(null)}
          onConfirm={async (reason) => {
            const result = await voidBiaFile({ fileId: voidingFile.id, reason });
            if (result.ok) refresh();
            return result;
          }}
        />
      )}
      {active && voidingMeasurement && (
        <BiaVoidDialog
          open
          title="Batalkan pengukuran BIA ini?"
          description="Angka dan berkasnya tetap tersimpan sebagai dibatalkan. Setelah itu Anda bisa mengisi pengukuran baru."
          onClose={() => setVoidingMeasurement(false)}
          onConfirm={async (reason) => {
            const result = await voidBiaMeasurement({ measurementId: active.id, reason });
            if (result.ok) refresh();
            return result;
          }}
        />
      )}
    </Stack>
  );
}
```

Catatan untuk `BiaVoidDialog` (Task 5): judul "Batalkan pengukuran BIA ini?" berawalan "Batalkan pengukuran", sehingga tombolnya bertuliskan "Batalkan pengukuran" sesuai uji.

Run: `npx vitest run tests/unit/components/bia-tab.test.tsx` → PASS (5 uji). Bila `getByText("Lemak tubuh")` menemukan dua elemen (label isian dan `dt`), periksa bahwa isian tidak ikut tampil saat terkunci; jangan melonggarkan uji.

- [ ] **Step 3: Tab BIA di panel konteks (RED → GREEN)**

Cari uji yang merender ketiga komponen: `grep -rln "EncounterContextPanel\|EncounterWorkspace\|EncounterPageView" tests/unit`. Di setiap pemanggilan render, tambahkan prop `bia={biaVisit()}` (impor dari `../../fixtures/bia`), dan mock `@/server/bia-actions` serta `@/components/admin/bia/send-files` seperti di `bia-tab.test.tsx` bila berkas itu belum memalsukan modul server. Tambahkan satu uji di `tests/unit/components/encounter-context-panel.test.tsx`:

```tsx
  it("tab BIA ada di antara Food recall dan Sebelumnya, dan isinya tab BIA", async () => {
    renderAdmin(<EncounterContextPanel encounter={encounterDetail()} currentVitals={encounterDetail().vitals} bia={biaVisit()} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Isian kuis", "Food recall", "BIA", "Sebelumnya", "Tren"]);
    await userEvent.click(screen.getByRole("tab", { name: "BIA" }));
    expect(screen.getByRole("tabpanel", { name: "BIA" })).toHaveTextContent("Belum ada hasil BIA untuk kunjungan ini.");
  });
```

Run: `npx vitest run tests/unit/components/encounter-context-panel.test.tsx` → FAIL.

Ubah:
- `src/lib/encounter.ts`: `export type ContextTab = "intake" | "foodRecall" | "bia" | "previous" | "trend";` (`initialContextTab` tidak berubah: tab BIA tidak pernah terbuka pertama).
- `encounter-context-panel.tsx`: tambahkan `{ key: "bia", label: "BIA" },` di `TABS` setelah `foodRecall`; tambahkan prop `bia: BiaVisitView` (impor tipe dari `@/server/bia-read`) dan `import { BiaTab } from "./bia/bia-tab";`; di dalam panel: `{item.key === "bia" && <BiaTab bia={bia} appointmentId={encounter.appointment.id} />}`. Ubah ringkasan `<summary>` menjadi `Isian, BIA, kunjungan sebelumnya, dan tren`.
- `encounter-workspace.tsx`: tambahkan prop `bia: BiaVisitView` dan teruskan `bia={bia}` ke `EncounterContextPanel`.
- `encounter-page-view.tsx`: tambahkan prop `bia: BiaVisitView` dan teruskan ke `EncounterWorkspace`.
- `src/app/(admin)/admin/kunjungan/[id]/page.tsx`: setelah `if (!encounter) notFound();` tambahkan `const bia = await getBiaForVisit(encounter.appointment.id);` (impor dari `@/server/bia-read`) dan render `<EncounterPageView encounter={encounter} bia={bia} canWrite={…} />`.

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/components tests/unit/encounter.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/encounter.ts src/components/admin/bia/bia-tab.tsx src/components/admin/encounter-context-panel.tsx src/components/admin/encounter-workspace.tsx src/components/admin/encounter-page-view.tsx "src/app/(admin)/admin/kunjungan/[id]/page.tsx" tests/fixtures/bia.ts tests/unit/components
git commit -m "feat: add a BIA tab to the visit page for files and body composition numbers"
```

---

### Task 7: Grafik komposisi tubuh (tab Tren) dan bagian BIA di Data Pasien

**Files:**
- Create: `src/components/admin/bia/bia-trend-chart.tsx`
- Create: `src/components/admin/bia/bia-history-table.tsx`
- Modify: `src/components/admin/encounter-context-panel.tsx` (grafik di tab Tren), `src/components/admin/vitals-trend-tab.tsx` (keterangan)
- Modify: `src/components/admin/patient-detail-view.tsx`, `src/app/(admin)/admin/pasien/[id]/page.tsx`
- Test: `tests/unit/components/bia-trend-chart.test.tsx` (baru), `tests/unit/components/patient-detail-view.test.tsx`

**Interfaces:**
- Consumes: `BiaPoint`, `BIA_FIELDS` (Task 2); `BiaHistory`, `BiaMeasurementView`, `getBiaHistory` (Task 4); `DARK`, `STATUS`, `SUNDY` dari `src/components/admin/mui/theme`.
- Produces: `BiaTrendChart({ points }: { points: BiaPoint[] })` — `role="img"` bernama "Grafik komposisi tubuh" dan tabel tersembunyi "Data komposisi tubuh"; `BiaHistoryTable({ items }: { items: BiaMeasurementView[] })`; prop baru `bia?: BiaHistory | null` pada `PatientDetailView` dan tab `?tab=bia`.

- [ ] **Step 1: Uji grafik (RED)**

`tests/unit/components/bia-trend-chart.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BiaTrendChart } from "@/components/admin/bia/bia-trend-chart";
import { renderAdmin } from "../helpers/render-admin";

describe("grafik komposisi tubuh", () => {
  it("tanpa titik: keterangan kosong, tanpa grafik", () => {
    renderAdmin(<BiaTrendChart points={[]} />);
    expect(screen.getByText("Belum ada hasil BIA.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Grafik komposisi tubuh" })).toBeNull();
  });

  it("grafik bernama dan tabel tersembunyi berisi angka tiap pengukuran, terlama dulu", () => {
    renderAdmin(
      <BiaTrendChart
        points={[
          { at: new Date("2026-09-02T02:00:00Z"), bodyFatPercent: 32, muscleMassKg: 40 },
          { at: new Date("2026-10-09T02:00:00Z"), bodyFatPercent: 28.5, muscleMassKg: null },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Grafik komposisi tubuh" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Data komposisi tubuh" });
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual([expect.stringMatching(/2 Sep.*32 %.*40 kg/), expect.stringMatching(/9 Okt.*28,5 %.*—/)]);
  });
});
```

Run: `npx vitest run tests/unit/components/bia-trend-chart.test.tsx` → FAIL.

- [ ] **Step 2: `src/components/admin/bia/bia-trend-chart.tsx` (GREEN)**

```tsx
"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useColorScheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import { ChartsDataProvider } from "@mui/x-charts/ChartsDataProvider";
import { ChartsGrid } from "@mui/x-charts/ChartsGrid";
import { ChartsLegend } from "@mui/x-charts/ChartsLegend";
import { ChartsSurface } from "@mui/x-charts/ChartsSurface";
import { ChartsTooltip } from "@mui/x-charts/ChartsTooltip";
import { ChartsXAxis } from "@mui/x-charts/ChartsXAxis";
import { ChartsYAxis } from "@mui/x-charts/ChartsYAxis";
import { LinePlot, MarkPlot } from "@mui/x-charts/LineChart";
import type { BiaPoint } from "@/lib/bia";
import { formatDecimal } from "@/lib/encounter";
import { formatShortIndonesianDate } from "@/lib/format";
import { DARK, STATUS, SUNDY } from "../mui/theme";

const show = (value: number | null, unit: string) => (value === null ? "—" : `${formatDecimal(value)} ${unit}`);

/**
 * Grafik progres komposisi tubuh (spec hasil BIA 6.2, PRD: penurunan lemak dan kenaikan massa otot): % lemak tubuh
 * dan massa otot per pengukuran. Angka lengkapnya ada di tabel yang tersembunyi secara visual, seperti grafik laporan.
 */
export function BiaTrendChart({ points }: { points: BiaPoint[] }) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  if (points.length === 0) return <Typography variant="body2">Belum ada hasil BIA.</Typography>;
  const color = dark ? { fat: DARK.primary, muscle: STATUS.dark.success } : { fat: SUNDY.brown600, muscle: STATUS.light.success };
  return (
    <Stack spacing={1}>
      <Box role="img" aria-label="Grafik komposisi tubuh" sx={{ width: "100%", minHeight: 240 }}>
        <ChartsDataProvider
          height={220}
          xAxis={[{ id: "tanggal", scaleType: "point", data: points.map((p) => formatShortIndonesianDate(p.at)) }]}
          yAxis={[{ id: "nilai", width: 40 }]}
          series={[
            { type: "line", id: "fat", label: "Lemak tubuh (%)", data: points.map((p) => p.bodyFatPercent), color: color.fat, connectNulls: true },
            { type: "line", id: "muscle", label: "Massa otot (kg)", data: points.map((p) => p.muscleMassKg), color: color.muscle, connectNulls: true },
          ]}
        >
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <LinePlot />
            <MarkPlot />
            <ChartsXAxis />
            <ChartsYAxis />
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsDataProvider>
      </Box>
      <Box component="table" aria-label="Data komposisi tubuh" sx={visuallyHidden}>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Lemak tubuh</th>
            <th>Massa otot</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.at.toISOString()}>
              <td>{formatShortIndonesianDate(point.at)}</td>
              <td>{show(point.bodyFatPercent, "%")}</td>
              <td>{show(point.muscleMassKg, "kg")}</td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Stack>
  );
}
```

Run → PASS. Bila `formatShortIndonesianDate` tidak menerima `Date` (periksa tanda tangannya di `src/lib/format.ts`), pakai fungsi tanggal pendek yang dipakai `vitals-trend-tab.tsx` dan sesuaikan pola uji tanggal (`2 Sep`) dengan keluarannya; catat sebagai Ruling.

- [ ] **Step 3: Grafik di tab Tren**

`encounter-context-panel.tsx`: impor `BiaTrendChart`; ganti baris panel Tren menjadi:

```tsx
            {item.key === "trend" && (
              <Stack spacing={2}>
                <VitalsTrendTab current={currentVitals} history={trendSource} />
                <Typography component="h3" variant="subtitle2">
                  Komposisi tubuh (BIA)
                </Typography>
                <BiaTrendChart points={bia.points} />
              </Stack>
            )}
```

(impor `Typography` dari `@mui/material/Typography` bila belum ada). `vitals-trend-tab.tsx`: ganti teks `Dari kunjungan final. Grafik lengkap menyusul di bagian BIA.` menjadi `Dari kunjungan final.`. Jalankan `grep -rn "menyusul di bagian BIA" tests` dan sesuaikan uji yang menyebut teks lama.

Tambahkan di `encounter-context-panel.test.tsx`:

```tsx
  it("tab Tren memuat grafik komposisi tubuh dari titik BIA pasien", async () => {
    renderAdmin(
      <EncounterContextPanel
        encounter={encounterDetail()}
        currentVitals={encounterDetail().vitals}
        bia={biaVisit({ points: [{ at: new Date("2026-10-09T02:00:00Z"), bodyFatPercent: 28.5, muscleMassKg: 41 }] })}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Tren" }));
    expect(screen.getByRole("img", { name: "Grafik komposisi tubuh" })).toBeInTheDocument();
  });
```

Run: `npx vitest run tests/unit/components/encounter-context-panel.test.tsx tests/unit/components/bia-trend-chart.test.tsx` → PASS. (Bila jsdom memerlukan `mockGridLayout`/ResizeObserver untuk grafik, ikuti uji `report-ui.test.tsx` yang sudah merender `TrendChart`.)

- [ ] **Step 4: Bagian BIA di Data Pasien (RED → GREEN)**

`tests/unit/components/patient-detail-view.test.tsx`, tambahkan (pakai fixture pasien yang sudah ada di berkas itu; sebut `patient` di bawah):

```tsx
  it("pembaca rekam medis: tab BIA berisi grafik dan tabel pengukuran dengan tautan berkas; pengukuran dibatalkan diberi tanda", () => {
    const items = [
      biaMeasurement({
        id: "m2",
        appointmentCode: "SDY-0002",
        numbers: { bodyFatPercent: 28.5, muscleMassKg: 41, visceralFat: 9, bmr: 1450, metabolicAge: 38, bodyWaterPercent: 47.5, boneMassKg: 2.6 },
        numbersAt: new Date(),
        files: [{ id: "f1", originalName: "hasil.pdf", mimeType: "application/pdf", sizeBytes: 10, uploadedByName: "Rina", uploadedAt: new Date(), previewable: true, voided: null }],
      }),
      biaMeasurement({ id: "m1", appointmentCode: "SDY-0001", voided: { at: new Date(), by: "dr. Diane", reason: "Salah pasien" } }),
    ];
    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords tab="bia" bia={{ items, points: [{ at: new Date(), bodyFatPercent: 28.5, muscleMassKg: 41 }] }} />);
    expect(screen.getByRole("tab", { name: "BIA (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: "Grafik komposisi tubuh" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Riwayat BIA" });
    expect(within(table).getByRole("link", { name: "hasil.pdf" })).toHaveAttribute("href", "/admin/bia/berkas/f1");
    expect(within(table).getByText("Dibatalkan: Salah pasien")).toBeInTheDocument();
  });

  it("tanpa data BIA (resepsionis): tidak ada tab BIA", () => {
    renderAdmin(<PatientDetailView patient={patient} canReadRecords={false} canWriteRecords={false} />);
    expect(screen.queryByRole("tab", { name: /^BIA/ })).toBeNull();
  });
```

Impor `biaMeasurement` dari `../../fixtures/bia` dan `within` dari `@testing-library/react`. Sesuaikan nama fixture pasien dengan yang ada di berkas uji (`grep -n "const patient\|function patient" tests/unit/components/patient-detail-view.test.tsx`). Bila `PageTabs` merender tautan (bukan `role="tab"`), cocokkan peran yang dipakai uji tab lain di berkas itu.

Run: `npx vitest run tests/unit/components/patient-detail-view.test.tsx` → FAIL.

`src/components/admin/bia/bia-history-table.tsx`:

```tsx
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { BIA_FIELDS } from "@/lib/bia";
import { formatDecimal } from "@/lib/encounter";
import { formatIndonesianDate } from "@/lib/format";
import type { BiaMeasurementView } from "@/server/bia-read";

/** Riwayat pengukuran BIA satu pasien (spec hasil BIA 6.3), terbaru dulu. */
export function BiaHistoryTable({ items }: { items: BiaMeasurementView[] }) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Riwayat BIA">
        <TableHead>
          <TableRow>
            <TableCell>Tanggal</TableCell>
            <TableCell>Booking</TableCell>
            {BIA_FIELDS.map((spec) => (
              <TableCell key={spec.key} align="right">
                {spec.label}
                {spec.unit ? ` (${spec.unit})` : ""}
              </TableCell>
            ))}
            <TableCell>Berkas</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} sx={item.voided ? { opacity: 0.7 } : undefined}>
              <TableCell>
                {formatIndonesianDate(item.createdAt)}
                {item.voided && <div>Dibatalkan: {item.voided.reason}</div>}
              </TableCell>
              <TableCell sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>{item.appointmentCode}</TableCell>
              {BIA_FIELDS.map((spec) => (
                <TableCell key={spec.key} align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {item.numbers[spec.key] === null ? "—" : formatDecimal(item.numbers[spec.key]!, spec.decimals)}
                </TableCell>
              ))}
              <TableCell>
                {item.files.length === 0
                  ? "—"
                  : item.files.map((file) => (
                      <div key={file.id}>
                        <Link href={`/admin/bia/berkas/${file.id}${file.previewable ? "" : "?unduh=1"}`} target="_blank" rel="noopener">
                          {file.originalName}
                        </Link>
                      </div>
                    ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

`src/components/admin/patient-detail-view.tsx`:
- `type PatientTab = "kunjungan" | "bia" | "booking" | "isian";`
- prop baru `bia?: BiaHistory | null` (impor tipe dari `@/server/bia-read`), impor `BiaTrendChart` dan `BiaHistoryTable` dari `./bia/…`.
- `const tabs: PatientTab[] = [...(patient.encounters ? ["kunjungan" as const] : []), ...(bia ? ["bia" as const] : []), "booking", "isian"];` (urutan tab: Kunjungan, BIA, Booking, Isian; bawaan tetap seperti sebelumnya).
- Di daftar `PageTabs`, setelah tab kunjungan: `...(bia ? [{ id: "bia", label: `BIA (${bia.items.filter((m) => !m.voided).length})`, href: href("bia") }] : []),`.
- Setelah blok `{active === "kunjungan" && …}`:

```tsx
      {active === "bia" && bia && (
        <SectionCard title="Hasil BIA">
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <BiaTrendChart points={bia.points} />
            {bia.items.length > 0 && <BiaHistoryTable items={bia.items} />}
          </Box>
        </SectionCard>
      )}
```

`src/app/(admin)/admin/pasien/[id]/page.tsx`: setelah `if (!patient) notFound();` tambahkan `const bia = can(staff.role, "record:read") ? await getBiaHistory(patient.id) : null;` (impor dari `@/server/bia-read`) dan prop `bia={bia}` pada `PatientDetailView`.

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/components tests/unit/architecture.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/bia/bia-trend-chart.tsx src/components/admin/bia/bia-history-table.tsx src/components/admin/encounter-context-panel.tsx src/components/admin/vitals-trend-tab.tsx src/components/admin/patient-detail-view.tsx "src/app/(admin)/admin/pasien/[id]/page.tsx" tests/unit/components
git commit -m "feat: chart body fat and muscle mass from BIA results on the visit and patient pages"
```

---

### Task 8: E2E, uji pemulihan, dan runbook

**Files:**
- Modify: `playwright.config.ts` (`PATIENT_FILES_DIR` uji)
- Modify: `tests/e2e/prepare-db.mts` (pasien BIA per proyek)
- Create: `tests/e2e/hasil-bia.spec.ts`
- Modify: `tests/e2e/helpers/admin-pages.ts` (bila memuat daftar halaman yang dipotret; lihat Step 4)
- Modify: `scripts/server/restore-test.sh`, `docs/operasional/server-sundy.md`

**Interfaces:**
- Consumes: semua tugas sebelumnya; `signIn` dari `tests/e2e/helpers/quiz`, `tungguHidrasi` dari `tests/e2e/helpers/mui`, `E2E_ADMIN`/`E2E_RESEPSIONIS` dari `tests/e2e/credentials`, `E2E_BASE_URL` dari `tests/e2e/test-env`.
- Produces: booking `E2E-BIA-1` (desktop) dan `E2E-BIA-2` (ponsel) berstatus HADIR hari ini, masing-masing dengan catatan draf ber-id `e2e-bia-desktop` / `e2e-bia-mobile`.

- [ ] **Step 1: Lingkungan dan data uji**

`playwright.config.ts`: di `webServer.env` tambahkan (berkas uji tidak boleh ke `/www/sundy-files`, yang tidak ada di Mac):

```ts
      // Berkas hasil BIA dari uji ditulis di sini, bukan ke folder server.
      PATIENT_FILES_DIR: `${process.cwd()}/.playwright/bia-files`,
```

`tests/e2e/prepare-db.mts`, setelah blok "Persetujuan isian dari halaman kunjungan" (tetap memakai `today`, `visitBranch`, `visitDoctor`, `visitService` yang sudah ada):

```ts
// Hasil BIA (hasil-bia.spec.ts): pasien hadir hari ini dengan catatan draf ber-id tetap, satu per proyek,
// pukul 05.00/05.30 (di luar jam buka agar tidak bentrok dengan slot uji lain).
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-BIA-${index + 1}`, name: `Pasien BIA ${project}`, whatsapp: `6281200078${index}01`, gender: "P" },
  });
  const startAt = combineWitaDateAndMinutes(today, 5 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-BIA-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: "WALK_IN",
      checkedInAt: startAt,
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: patient.id,
    },
  });
  await prisma.encounter.create({
    data: { id: `e2e-bia-${project}`, appointmentId: appointment.id, createdById: visitDoctor.id, createdByName: visitDoctor.name },
  });
}
```

Bila `checkedInAt` ditolak oleh CHECK check-in (mis. butuh kolom lain), hapus baris itu; booking `HADIR` saja cukup untuk uji ini.

- [ ] **Step 2: Tulis uji E2E**

`tests/e2e/hasil-bia.spec.ts`:

```ts
import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Booking dan catatan draf dari prepare-db.mts, satu per proyek agar desktop dan ponsel tidak berebut.
test.setTimeout(180_000);

const code = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "E2E-BIA-2" : "E2E-BIA-1");
// PNG 1×1 piksel yang sah.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f30000000049454e44ae426082",
  "hex",
);

test("resepsionis mengunggah hasil BIA dari daftar booking; dokter membuka, mengisi angka, dan melihat grafik", async ({ page, browser }, testInfo) => {
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/booking");
  await tungguHidrasi(page);
  const row = page.getByRole("row").filter({ hasText: code(testInfo) });
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await page.getByRole("menuitem", { name: "Unggah hasil BIA" }).click();
  const dialog = page.getByRole("dialog", { name: `Hasil BIA — ${code(testInfo)}` });
  await expect(dialog.getByText("Belum ada berkas BIA untuk booking ini.")).toBeVisible({ timeout: 30_000 });

  await dialog.getByLabel("Berkas hasil BIA").setInputFiles({ name: "hasil-bia.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByText("hasil-bia.png: terunggah")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("listitem", { name: "hasil-bia.png" })).toBeVisible();

  // Berkas palsu bernama .jpg ditolak dari isinya.
  await dialog.getByLabel("Berkas hasil BIA").setInputFiles({ name: "palsu.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(dialog.getByText(/palsu\.jpg: Jenis berkas tidak didukung/)).toBeVisible({ timeout: 30_000 });
  // Resepsionis tidak mendapat tautan ke berkas.
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Tutup" }).click();
  await expect(row).toContainText("BIA terunggah: 1 berkas", { timeout: 30_000 });

  // Resepsionis tidak bisa membuka halaman kunjungan (tempat berkas dibuka).
  const forbidden = await page.request.get(`/admin/kunjungan/e2e-bia-${testInfo.project.name}`);
  expect(forbidden.status()).toBe(403);

  // Dokter (Super Admin, sesi sendiri, ukuran layar proyek yang sama).
  const doctorContext = await browser.newContext({ ...testInfo.project.use, baseURL: E2E_BASE_URL });
  const doctor = await doctorContext.newPage();
  await signIn(doctor, E2E_ADMIN);
  await doctor.goto(`/admin/kunjungan/e2e-bia-${testInfo.project.name}`);
  await tungguHidrasi(doctor);
  await doctor.getByRole("tab", { name: "BIA" }).click();
  const panel = doctor.getByRole("tabpanel", { name: "BIA" });
  await expect(panel.getByText("hasil-bia.png")).toBeVisible();

  await panel.getByRole("button", { name: "Buka hasil-bia.png" }).click();
  const preview = doctor.getByRole("dialog", { name: "hasil-bia.png" });
  const image = preview.getByRole("img", { name: "Hasil BIA hasil-bia.png" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await preview.getByRole("button", { name: "Tutup" }).click();

  await panel.getByLabel("Lemak tubuh (%)").fill("28,5");
  await panel.getByLabel("Massa otot (kg)").fill("41");
  await panel.getByRole("button", { name: "Simpan angka BIA" }).click();
  await expect(doctor.getByText("Angka BIA tersimpan.")).toBeVisible({ timeout: 30_000 });

  await doctor.reload();
  await tungguHidrasi(doctor);
  await doctor.getByRole("tab", { name: "BIA" }).click();
  await expect(doctor.getByRole("tabpanel", { name: "BIA" }).getByLabel("Lemak tubuh (%)")).toHaveValue("28,5");
  await doctor.getByRole("tab", { name: "Tren" }).click();
  await expect(doctor.getByRole("img", { name: "Grafik komposisi tubuh" })).toBeVisible();

  // Tidak ada gulir mendatar halaman (terutama di ponsel).
  const overflow = await doctor.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await doctorContext.close();
});
```

- [ ] **Step 3: Jalankan E2E per proyek**

Run (di latar belakang; laptop 8 GB): `npx playwright test tests/e2e/hasil-bia.spec.ts --project=desktop > "$WS/e2e-bia-desktop.log" 2>&1; tail -20 "$WS/e2e-bia-desktop.log"`
Expected: `1 passed`. Lalu `--project=mobile` → `1 passed`. Bila gagal karena klik sebelum hidrasi, tambahkan `tungguHidrasi` di titik itu (bukan menambah batas waktu), dan catat Ruling.

Run juga `npx playwright test tests/e2e/check-in.spec.ts tests/e2e/kunjungan.spec.ts --project=desktop` → lulus (data dan menu booking hadir ikut berubah).

- [ ] **Step 4: Foto halaman (opsional, bila ada spek foto)**

`grep -n "kunjungan" tests/e2e/helpers/admin-pages.ts`: bila halaman kunjungan dipotret, tidak perlu entri baru (tab BIA tidak dibuka di foto). Tidak ada halaman baru di menu, jadi `ADMIN_PAGES` tidak berubah.

- [ ] **Step 5: Uji pemulihan memeriksa satu berkas BIA**

`scripts/server/restore-test.sh`: setelah baris `sudo -u postgres pg_restore … "$KERJA/$DB.dump"` tambahkan:

```bash
# Hasil BIA (spec hasil BIA 9): satu berkas yang tercatat di backup harus ada di arsip file dengan sidik jari yang sama.
FILES_DIR=${PATIENT_FILES_DIR:-/www/sundy-files}
CONTOH=$(printf '%s\n' 'SELECT "storageName" || chr(124) || "sha256" FROM "BiaFile" ORDER BY "uploadedAt" LIMIT 1;' \
  | sudo -u postgres psql -At -d "$UJI" 2>/dev/null || true)
if [ -n "$CONTOH" ]; then
  NAMA=${CONTOH%%|*}
  SIDIK=${CONTOH##*|}
  HASIL=$(tar -xzOf "$KERJA/file-pasien.tar.gz" "$(basename "$FILES_DIR")/bia/$NAMA" | sha256sum | cut -d' ' -f1)
  if [ "$HASIL" != "$SIDIK" ]; then
    echo "GAGAL: berkas BIA $NAMA di arsip tidak sama dengan catatan database." >&2
    exit 1
  fi
  echo "Berkas BIA contoh utuh: $NAMA"
else
  echo "Belum ada berkas BIA di backup ini; pemeriksaan berkas BIA dilewati."
fi
```

Run: `bash -n scripts/server/restore-test.sh && npm run test:server`
Expected: tanpa galat sintaks; `deploy.test.sh` dan `backup.test.sh` lulus.

- [ ] **Step 6: Runbook**

`docs/operasional/server-sundy.md`, bagian 7 (Backup), setelah baris tabel `Isi`, tambahkan paragraf:

```markdown
**Berkas hasil BIA** (spec hasil BIA) ada di `/www/sundy-files/bia/<tahun>/<bulan>/` (pemilik `sundyapp`, folder 0700, berkas 0600) dan ikut
`file-pasien.tar.gz`. Nama di disk acak; nama asli hanya di basis data (`BiaFile`). Aplikasi tidak pernah menghapus berkas: yang salah
ditandai dibatalkan. Uji pemulihan bulanan memeriksa satu berkas BIA dari backup terhadap sidik jari SHA-256 di database.
Pantau pertumbuhannya di pemeriksaan disk rutin (`sudo du -sh /www/sundy-files`).
```

Dan di bagian 9 (pemeriksaan rutin), di baris `Disk > 80%`, tambahkan `; periksa juga /www/sundy-files (hasil BIA)` di akhir sel tindakan.

- [ ] **Step 7: Verifikasi dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/unit.log" 2>&1; tail -5 "$WS/unit.log"` → semua lulus. Integrasi terpisah (bukan bersamaan dengan E2E): `npm run test:integration > "$WS/int.log" 2>&1; tail -8 "$WS/int.log"` → lulus kecuali 3 uji lama `schedule.test.ts`.

```bash
git add playwright.config.ts tests/e2e/prepare-db.mts tests/e2e/hasil-bia.spec.ts scripts/server/restore-test.sh docs/operasional/server-sundy.md
git commit -m "test: cover BIA upload end to end and check a BIA file in the monthly restore test"
```

---

## Catatan rilis (bukan tugas; hanya atas permintaan pemilik)

- Migrasi hanya menambah tabel; `deploy.sh` menjalankannya sebelum build. `deploy.sh kembali` tetap aman (kode lama tidak membaca tabel BIA).
- Server tidak perlu `PATIENT_FILES_DIR` di `shared/.env` (bawaan `/www/sundy-files`, folder sudah ada, pemilik `sundyapp`, 0700).
- Setelah rilis: unggah satu berkas uji lewat akun pemilik, pastikan muncul di `/www/sundy-files/bia/…` dengan izin 0600, lalu batalkan berkas uji itu.
- Untuk pengembangan lokal, isi `PATIENT_FILES_DIR` di `.env` lokal dengan folder di luar repo (mis. `~/sundy-files`); tanpa itu unggahan di `npm run dev` gagal karena `/www` tidak ada di Mac.
