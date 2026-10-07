# Penyerahan Obat oleh Apoteker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dokter meninggalkan "Catatan untuk Apoteker"; Apoteker mencatat obat yang diserahkan (jumlah, aturan pakai) yang otomatis menjadi baris tagihan; tagihan kunjungan dengan obat tertahan sampai penyerahan selesai; etiket cetak untuk customer; Dokter melihat stok tanpa harga.

**Architecture:**
- **Data:** kolom `Encounter.pharmacyNote`, tabel `Dispensing` (satu per kunjungan, status Menunggu/Selesai/Tanpa obat, nomor versi) dan `DispensingLine`, serta `InvoiceLine.dispensingLineId` (unik) yang menandai baris tagihan asal penyerahan. Dibuat otomatis saat catatan dokter difinalkan bila `pharmacyNote` terisi.
- **Pembagian kode:** aturan murni di `src/lib/dispensing.ts`; pembantu transaksi (kunci, penyambungan ke tagihan) di `src/server/dispensing-store.ts` (tanpa `"use server"`); pembacaan di `src/server/dispensing-read.ts`; aksi dibagi `dispensing-drafts.ts` (ubah daftar obat) dan `dispensing-lifecycle.ts` (selesai, tanpa obat, buka kembali). Tagihan (`invoice-drafts.ts`, `invoice-lifecycle.ts`) hanya ditambah penahanan finalisasi, penguncian baris, dan pelepasan saat batal.
- **Urutan kunci (hindari deadlock):** selalu **tagihan lebih dulu, lalu penyerahan**. Aksi Apoteker membaca tagihan aktif tanpa kunci, mengunci tagihan itu (bila ada), mengunci baris penyerahan, lalu membaca ulang tagihan aktif; bila berbeda, ditolak dengan pesan "muat ulang". Pembuatan tagihan hanya mengunci baris penyerahan. Finalisasi tagihan tidak mengunci penyerahan (hanya membaca statusnya setelah mengunci tagihan).

**Tech Stack:** Next.js 15.5 App Router, React 19, Prisma 7 + PostgreSQL, Zod 4, shadcn/ui (Radix), Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md`

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi berbahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar.
- **Zona waktu:** WITA; "hari ini" selalu `witaDateString(new Date())`. Jumlah obat bilangan bulat.
- **Angka dari spec:** Catatan untuk Apoteker paling banyak **1.000** karakter; aturan pakai wajib, paling banyak **200** karakter.
- **Hak akses (spec 5):** `dispense:read`, `dispense:manage`, `stock:availability`. Apoteker memegang ketiganya (di samping `stock:read`/`stock:manage`); Dokter hanya `stock:availability` (di samping `record:*`); Super Admin ketiganya; Resepsionis, Admin Keuangan, Terapis tidak.
- **Setiap halaman dan aksi server** memanggil `requireCapability` sendiri.
- **Data klinis:** Apoteker hanya melihat Catatan untuk Apoteker, nama pasien, cabang, dan waktu kunjungan. Resepsionis tidak pernah menerima isi catatan: `getInvoiceDetail` hanya membawa status penyerahan. Dokter tidak pernah menerima harga beli atau harga jual stok.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (tipe boleh). Konstanta dan fungsi murni di `src/lib`; pembantu server biasa di modul tanpa `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`; komponen tidak mengimpor `@/lib/db`; komponen server hanya mengambil komponen dari modul `"use client"` (dijaga `tests/unit/architecture.test.ts`).
- **Riwayat tidak dihapus:** penyerahan dibuka kembali, tidak dihapus. Baris tagihan asal penyerahan di tagihan yang dibatalkan dilepas (`dispensingLineId` dikosongkan) agar penyerahan bisa ditagih lagi.
- **Jejak audit:** `dispensing.create`, `dispensing.update`, `dispensing.complete`, `dispensing.none`, `dispensing.reopen`. Ringkasan memuat pasien dan obat, tidak memuat isi Catatan untuk Apoteker.
- **Migrasi hanya menambah.** Diterapkan berurutan: `npx prisma migrate deploy`, `npm run db:migrate:test`, `npx prisma generate`, lalu `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (kode 0).
- **Tanpa dependensi baru.** Repo tidak memakai Prettier; ikuti format di sekitarnya.
- **Log uji:** `WS` adalah direktori kerja rencana (`.superpowers/sdd/2026-10-07-plan-penyerahan-obat/`). Output panjang ditulis ke sana.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`); jangan bersamaan dengan e2e; setelah e2e kosongkan data e2e (jalankan `tests/e2e/prepare-db.mts` dengan env uji) sebelum integrasi lagi. E2E per berkas/proyek (laptop 8 GB).
- **Uji yang sudah gagal sebelum rencana ini:** 3 uji di `tests/integration/schedule.test.ts` (tanggal tetap 2026-10-05). Jangan diubah.
- **Commit:** Conventional Commits berbahasa Inggris dengan baris penutup `Co-Authored-By` yang menyebut model yang menulis commit itu. **Jangan pernah mengubah atau men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Dua Apoteker menyelesaikan penyerahan yang sama bersamaan.** Tepat satu berhasil; baris tagihan tidak ganda → uji bersamaan di Task 5.
2. **Pembuatan tagihan dan penyelesaian penyerahan bersamaan.** Baris obat tidak hilang dan tidak ganda, apa pun urutannya → uji di Task 5.
3. **Buka kembali penyerahan bersamaan dengan finalisasi tagihan.** Salah satu menang; tagihan final tidak pernah memuat baris dari penyerahan yang sudah dibuka kembali → uji di Task 6.
4. **Tagihan final dibatalkan lalu dibuat ulang.** Penyerahan kembali Menunggu; tidak ada pelanggaran keunikan `dispensingLineId`; tidak ada obat yang ditagih dua kali → uji di Task 6.
5. **Kebocoran data.** Apoteker tidak menerima data klinis lain; Resepsionis tidak menerima isi catatan; Dokter tidak menerima harga stok → uji hak akses dan bentuk hasil di Task 4, 6, 9.

---

## Struktur berkas

**Baru**

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `prisma/migrations/20261007200000_penyerahan_obat/migration.sql` | Kolom, tabel, enum, CHECK | 1 |
| `src/lib/dispensing.ts` | Status, label, validasi baris, ringkasan per barang | 2 |
| `src/server/dispensing-store.ts` | Kunci, konteks tagihan, penyambungan baris ke tagihan (tanpa `"use server"`) | 4, 5 |
| `src/server/dispensing-read.ts` | Antrean, rincian, pilihan obat, ketersediaan stok Dokter, hitungan | 4, 9 |
| `src/server/dispensing-drafts.ts` | Aksi ubah daftar obat di penyerahan Menunggu | 4 |
| `src/server/dispensing-lifecycle.ts` | Aksi selesai, tanpa obat, buka kembali | 5 |
| `src/components/admin/dispensing/*` | Antrean, formulir obat, ringkasan, etiket, tabel stok Dokter | 7, 9 |
| `src/app/(admin)/admin/resep/**`, `src/app/(admin)/admin/stok-dokter/page.tsx` | Halaman | 7, 9 |
| `tests/integration/dispensing-*.test.ts` | Uji integrasi | 1, 3–6, 9 |

**Diubah**

| Berkas | Perubahan | Task |
|---|---|---|
| `prisma/schema.prisma` | Model dan enum baru, `pharmacyNote`, `dispensingLineId` | 1 |
| `src/lib/permissions.ts` | Kemampuan baru | 1 |
| `src/lib/encounter.ts`, `src/server/encounter.ts`, `src/server/encounter-read.ts`, `src/components/admin/encounter-form.tsx`, `encounter-record.tsx` | Kolom Catatan untuk Apoteker; pembuatan penyerahan saat final | 3 |
| `src/server/invoice-drafts.ts`, `invoice-lifecycle.ts`, `invoice-read.ts` | Isi tagihan dari penyerahan, penahanan, penguncian baris, pelepasan saat batal, status penyerahan | 5, 6 |
| `src/components/admin/billing/invoice-draft-editor.tsx` | Pita status, baris terkunci | 8 |
| `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/layout.tsx`, `page.tsx` | Menu Resep, Stok (Dokter), lencana, kotak dasbor | 7, 9 |
| `tests/integration/invoice-world.ts`, `tests/e2e/prepare-db.mts` | Pembantu uji dan fixture | 1, 10 |

---

### Task 1: Fondasi — tabel penyerahan, kolom catatan, kemampuan baru, pembantu uji

**Files:**
- Create: `prisma/migrations/20261007200000_penyerahan_obat/migration.sql`, `tests/integration/dispensing-schema.test.ts`
- Modify: `prisma/schema.prisma`, `src/lib/permissions.ts`, `tests/unit/permissions.test.ts`, `tests/unit/migrations.test.ts`, `tests/integration/invoice-world.ts`

**Interfaces:**
- Consumes: model `Encounter`, `Appointment`, `Branch`, `StockItem`, `InvoiceLine` (sub-proyek tagihan), `invoice-world.ts` (`BillingWorld`, `finalVisit`, `cleanupBillingWorld`).
- Produces:
  - Prisma: enum `DispensingStatus` (`MENUNGGU`, `SELESAI`, `TANPA_OBAT`); `Encounter.pharmacyNote String?`; model `Dispensing`, `DispensingLine`; `InvoiceLine.dispensingLineId String? @unique`;
  - CHECK: `dispensing_status_fields`, `dispensing_line_values`, `encounter_pharmacy_note_length`;
  - `Capability` + `"dispense:read" | "dispense:manage" | "stock:availability"`;
  - `invoice-world.ts`: `finalVisit(world, { …, pharmacyNote?: string })` dan `seedDispensing(world, appointmentId, input?: { status?: "MENUNGGU" | "SELESAI" | "TANPA_OBAT"; lines?: { itemId: string; quantity: number; usage?: string }[] }): Promise<{ id: string; lineIds: string[] }>`; `cleanupBillingWorld` ikut menghapus penyerahan.

- [ ] **Step 1: Pembantu uji dan uji skema (gagal)**

Di `tests/integration/invoice-world.ts`:
1. Tambahkan `pharmacyNote?: string;` ke tipe `input` pada `finalVisit` (setelah `finalizedAt?: Date;`) dan `pharmacyNote: input.pharmacyNote ?? null,` ke `data` pada `prisma.encounter.create` (setelah `createdByName: "dr. Uji",`).
2. Tambahkan fungsi baru sebelum `cleanupBillingWorld`:

```ts
/** Penyerahan langsung di basis data (tanpa aksi server). `lines` bawaan kosong; status bawaan MENUNGGU. */
export async function seedDispensing(
  world: BillingWorld,
  appointmentId: string,
  input: { status?: "MENUNGGU" | "SELESAI" | "TANPA_OBAT"; lines?: { itemId: string; quantity: number; usage?: string }[] } = {},
): Promise<{ id: string; lineIds: string[] }> {
  const status = input.status ?? "MENUNGGU";
  const done = status === "MENUNGGU" ? {} : { completedAt: new Date(), completedById: world.doctorId, completedByName: "Apoteker Uji" };
  const names = new Map(
    (await prisma.stockItem.findMany({ select: { id: true, name: true } })).map((item) => [item.id, item.name] as const),
  );
  const dispensing = await prisma.dispensing.create({
    data: {
      appointmentId,
      branchId: world.branchId,
      status,
      ...done,
      lines: {
        create: (input.lines ?? []).map((line, index) => ({
          itemId: line.itemId,
          itemName: names.get(line.itemId) ?? "Obat",
          quantity: line.quantity,
          usage: line.usage ?? "3 x 1 sesudah makan",
          sortOrder: index,
        })),
      },
    },
    select: { id: true, lines: { orderBy: { sortOrder: "asc" }, select: { id: true } } },
  });
  return { id: dispensing.id, lineIds: dispensing.lines.map((line) => line.id) };
}
```

3. Di `cleanupBillingWorld`, sesudah baris `await prisma.invoice.deleteMany({ where: { branch } });` tambahkan:

```ts
  await prisma.dispensingLine.deleteMany({ where: { dispensing: { branch } } });
  await prisma.dispensing.deleteMany({ where: { branch } });
```

Buat `tests/integration/dispensing-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

const SLUG = "skema-penyerahan";
const WA = "6281200008900";

describe("skema penyerahan obat", () => {
  let world: BillingWorld;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });

  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("penyerahan baru berstatus Menunggu, versi 1; satu per kunjungan", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await seedDispensing(world, appointmentId);
    expect(await prisma.dispensing.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "MENUNGGU", version: 1, completedAt: null });
    await expect(seedDispensing(world, appointmentId)).rejects.toThrow(/Unique constraint/);
  });

  it("status dan data penyelesai harus sejalan", async () => {
    const { appointmentId } = await finalVisit(world);
    const base = { appointmentId, branchId: world.branchId };
    await expect(prisma.dispensing.create({ data: { ...base, status: "SELESAI" } })).rejects.toThrow(/dispensing_status_fields/);
    await expect(prisma.dispensing.create({ data: { ...base, completedAt: new Date(), completedById: "s1", completedByName: "x" } })).rejects.toThrow(
      /dispensing_status_fields/,
    );
    expect((await seedDispensing(world, appointmentId, { status: "TANPA_OBAT" })).id).toBeTruthy();
  });

  it("baris: jumlah positif dan aturan pakai tidak kosong", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await seedDispensing(world, appointmentId);
    const line = (data: Record<string, unknown>) =>
      prisma.dispensingLine.create({ data: { dispensingId: id, itemId: world.drugId, itemName: "Obat", quantity: 1, usage: "2 x 1", ...data } });
    await expect(line({ quantity: 0 })).rejects.toThrow(/dispensing_line_values/);
    await expect(line({ usage: "   " })).rejects.toThrow(/dispensing_line_values/);
    expect((await line({})).quantity).toBe(1);
  });

  it("satu baris penyerahan hanya bisa masuk satu baris tagihan", async () => {
    const { appointmentId } = await finalVisit(world);
    const { lineIds } = await seedDispensing(world, appointmentId, { lines: [{ itemId: world.drugId, quantity: 2 }] });
    const invoice = (await prisma.invoice.create({
      data: { patientId: world.patientId, branchId: world.branchId, createdById: "s1", createdByName: "Uji" },
    })).id;
    const row = { invoiceId: invoice, kind: "BARANG" as const, itemId: world.drugId, name: "Obat", quantity: 2, unitPrice: 2000, dispensingLineId: lineIds[0] };
    await prisma.invoiceLine.create({ data: row });
    await expect(prisma.invoiceLine.create({ data: row })).rejects.toThrow(/Unique constraint/);
  });

  it("Catatan untuk Apoteker paling banyak 1.000 karakter di basis data", async () => {
    // Kunjungan final terkunci (trigger encounter_locked), jadi uji memakai kunjungan draf.
    const startAt = new Date(Date.UTC(2032, 0, 1, 1, 0));
    const appointment = await prisma.appointment.create({
      data: {
        code: "SKP-1",
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: "HADIR",
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: world.patientId,
      },
    });
    const encounter = await prisma.encounter.create({
      data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji" },
    });
    await expect(prisma.encounter.update({ where: { id: encounter.id }, data: { pharmacyNote: "x".repeat(1001) } })).rejects.toThrow(
      /encounter_pharmacy_note_length/,
    );
    expect((await prisma.encounter.update({ where: { id: encounter.id }, data: { pharmacyNote: "x".repeat(1000) } })).pharmacyNote).toHaveLength(1000);
  });
});
```

Tambahkan di akhir `tests/unit/permissions.test.ts`:

```ts
describe("hak akses penyerahan obat (spec penyerahan 5)", () => {
  it("Apoteker menyerahkan obat dan melihat stok; tidak membaca catatan klinis", () => {
    for (const capability of ["dispense:read", "dispense:manage", "stock:availability"] as const) {
      expect(can("APOTEKER", capability)).toBe(true);
    }
    expect(can("APOTEKER", "record:read")).toBe(false);
  });

  it("Dokter hanya melihat ketersediaan stok", () => {
    expect(can("DOKTER", "stock:availability")).toBe(true);
    expect(can("DOKTER", "dispense:read")).toBe(false);
    expect(can("DOKTER", "dispense:manage")).toBe(false);
    expect(can("DOKTER", "stock:read")).toBe(false);
  });

  it("Resepsionis, Admin Keuangan, dan Terapis tidak punya akses; Super Admin semuanya", () => {
    for (const role of ["RESEPSIONIS", "ADMIN_KEUANGAN", "TERAPIS"] as const) {
      for (const capability of ["dispense:read", "dispense:manage", "stock:availability"] as const) {
        expect(can(role, capability)).toBe(false);
      }
    }
    for (const capability of ["dispense:read", "dispense:manage", "stock:availability"] as const) {
      expect(can("SUPER_ADMIN", capability)).toBe(true);
    }
  });
});
```

Run: `npx vitest run tests/unit/permissions.test.ts; npm run test:integration -- tests/integration/dispensing-schema.test.ts`
Expected: FAIL (kemampuan belum ada; model `dispensing` belum ada di klien Prisma).

- [ ] **Step 2: Skema Prisma**

Di `prisma/schema.prisma`:
1. Di `model Encounter`, tambahkan setelah `plan String?`:

```prisma
  /// Catatan dokter untuk Apoteker (spec penyerahan 3.1); terkunci saat final. Paling banyak 1.000 karakter.
  pharmacyNote String?
```

2. Tambahkan satu baris tepat setelah baris pembuka `model Appointment {`: `  dispensing Dispensing?`; setelah `model Branch {`: `  dispensings Dispensing[]`; setelah `model StockItem {`: `  dispensingLines DispensingLine[]`.
3. Di `model InvoiceLine`, tambahkan setelah `priceNote String?`:

```prisma
  /// Baris penyerahan asal baris ini (spec penyerahan 4.3); kosong untuk baris biasa. Dilepas bila tagihan dibatalkan.
  dispensingLineId String?          @unique
  dispensingLine   DispensingLine?  @relation(fields: [dispensingLineId], references: [id], onDelete: Restrict)
```

4. Tambahkan di **akhir** berkas:

```prisma
// ---------------------------------------------------------------------------
// Penyerahan obat (spec docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md)
// ---------------------------------------------------------------------------

enum DispensingStatus {
  MENUNGGU
  SELESAI
  TANPA_OBAT
}

/// Penyerahan obat satu kunjungan; dibuat otomatis saat catatan dokter final dengan Catatan untuk Apoteker.
model Dispensing {
  id            String           @id @default(cuid())
  appointmentId String           @unique
  appointment   Appointment      @relation(fields: [appointmentId], references: [id], onDelete: Restrict)
  branchId      String
  branch        Branch           @relation(fields: [branchId], references: [id], onDelete: Restrict)
  status        DispensingStatus @default(MENUNGGU)
  /// Naik setiap perubahan; menolak suntingan dari halaman yang usang.
  version       Int              @default(1)

  completedAt     DateTime?
  completedById   String?
  completedByName String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  lines DispensingLine[]

  @@index([status, createdAt])
}

model DispensingLine {
  id           String     @id @default(cuid())
  dispensingId String
  dispensing   Dispensing @relation(fields: [dispensingId], references: [id], onDelete: Restrict)
  itemId       String
  item         StockItem  @relation(fields: [itemId], references: [id], onDelete: Restrict)
  /// Disalin saat baris dibuat, agar riwayat tidak ikut berubah.
  itemName     String
  quantity     Int
  /// Aturan pakai, mis. "3 x 1 sesudah makan".
  usage        String
  sortOrder    Int        @default(0)

  invoiceLine InvoiceLine?

  @@index([dispensingId])
}
```

5. Jalankan `npx prisma format`.

- [ ] **Step 3: Migrasi**

```bash
npx prisma migrate deploy
mkdir -p prisma/migrations/20261007200000_penyerahan_obat
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  > prisma/migrations/20261007200000_penyerahan_obat/migration.sql
cat prisma/migrations/20261007200000_penyerahan_obat/migration.sql
```

Expected: SQL berisi `CREATE TYPE "DispensingStatus"`, `ALTER TABLE "Encounter" ADD COLUMN "pharmacyNote"`, `ALTER TABLE "InvoiceLine" ADD COLUMN "dispensingLineId"`, `CREATE TABLE "Dispensing"`, `CREATE TABLE "DispensingLine"`, indeks dan unik, dan `ADD CONSTRAINT … FOREIGN KEY`. Tidak ada `DROP`. **Hasil generate yang dipakai.**

Tambahkan di **awal** berkas:

```sql
-- Penyerahan obat oleh Apoteker (sub-proyek keuangan 3).
-- Spec: docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md bagian 3.
-- Migrasi ini hanya menambah: kolom, tabel, enum, dan CHECK.

```

Lalu tambahkan di **akhir** berkas:

```sql

-- Penjagaan nilai di basis data (spec penyerahan 3.2).
ALTER TABLE "Dispensing" ADD CONSTRAINT dispensing_status_fields CHECK (
  ("status" = 'MENUNGGU' AND "completedAt" IS NULL AND "completedById" IS NULL AND "completedByName" IS NULL)
  OR ("status" IN ('SELESAI', 'TANPA_OBAT') AND "completedAt" IS NOT NULL AND "completedById" IS NOT NULL AND "completedByName" IS NOT NULL)
);

ALTER TABLE "DispensingLine" ADD CONSTRAINT dispensing_line_values CHECK ("quantity" > 0 AND btrim("usage") <> '');

ALTER TABLE "Encounter" ADD CONSTRAINT encounter_pharmacy_note_length CHECK ("pharmacyNote" IS NULL OR char_length("pharmacyNote") <= 1000);
```

Terapkan:

```bash
npx prisma migrate deploy
npm run db:migrate:test
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: tiga perintah pertama berhasil; yang terakhir keluar dengan kode 0.

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi penyerahan obat", () => {
  const sql = readFileSync("prisma/migrations/20261007200000_penyerahan_obat/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga status, baris, dan panjang catatan di basis data", () => {
    for (const name of ["dispensing_status_fields", "dispensing_line_values", "encounter_pharmacy_note_length"]) {
      expect(sql).toContain(name);
    }
  });
});
```

- [ ] **Step 4: Kemampuan**

Di `src/lib/permissions.ts`:
1. Tambahkan ke tipe `Capability` (setelah `| "invoice:correct"`): `| "dispense:read"\n  | "dispense:manage"\n  | "stock:availability"`.
2. Pada `SUPER_ADMIN`, tambahkan `"dispense:read", "dispense:manage", "stock:availability",` setelah `"invoice:correct",`.
3. Ganti `DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write"],` dengan `DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write", "stock:availability"],`.
4. Ganti `APOTEKER: ["stock:read", "stock:manage"],` dengan `APOTEKER: ["stock:read", "stock:manage", "dispense:read", "dispense:manage", "stock:availability"],`.

Run: `npx tsc --noEmit -p . > "$WS/t1-tsc.log" 2>&1; echo "tsc exit $?"; tail -10 "$WS/t1-tsc.log"`
Expected: `tsc exit 0`. (Uji lama di `tests/unit/permissions.test.ts` yang memeriksa daftar Apoteker/Dokter persis akan gagal pada Step 5; perbarui ekspektasinya, bukan kodenya: Apoteker kini punya tiga kemampuan baru dan Dokter `stock:availability`.)

- [ ] **Step 5: Jalankan uji dan commit**

Run: `npx vitest run tests/unit/permissions.test.ts tests/unit/migrations.test.ts; npm run test:integration -- tests/integration/dispensing-schema.test.ts tests/integration/invoice-schema.test.ts`
Expected: PASS semua.

Run: `npx vitest run > "$WS/t1.log" 2>&1; grep -E "Test Files|Tests " "$WS/t1.log"; npx eslint src/lib tests/integration/invoice-world.ts tests/integration/dispensing-schema.test.ts`
Expected: semua PASS, eslint bersih.

```bash
git add prisma/schema.prisma prisma/migrations/20261007200000_penyerahan_obat src/lib/permissions.ts \
  tests/integration/invoice-world.ts tests/integration/dispensing-schema.test.ts \
  tests/unit/migrations.test.ts tests/unit/permissions.test.ts
git commit -m "feat: add dispensing tables, the pharmacist note column, and dispensing capabilities"
```

---

### Task 2: Aturan penyerahan — status, validasi baris, ringkasan per barang, kekurangan stok

**Files:**
- Create: `src/lib/dispensing.ts`, `tests/unit/dispensing.test.ts`

**Interfaces:**
- Consumes: `MAX_QUANTITY`, `Validation` dari `src/lib/stock.ts`.
- Produces (`src/lib/dispensing.ts`, murni):
  - `DispensingStatusValue`, `DISPENSING_STATUS_LABEL`, `DispensingView`, `DISPENSING_VIEWS`, `isDispensingView(value: unknown): value is DispensingView`, `USAGE_MAX = 200`;
  - `DispensingLineInput = { itemId: string; quantity: number; usage: string }`, `validateDispensingLine(raw: unknown): Validation<DispensingLineInput>`;
  - `ItemQuantity = { itemId: string; itemName: string; quantity: number }`, `totalsByItem(lines: readonly ItemQuantity[]): ItemQuantity[]`, `stockShortage(needed: readonly ItemQuantity[], available: ReadonlyMap<string, number>): { itemName: string; available: number } | null`, `shortageMessage(shortage): string`;
  - `HOLD_MESSAGE = "Menunggu Apoteker menyerahkan obat."`, `dispensingNotice(status: DispensingStatusValue | null): string | null`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/unit/dispensing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DISPENSING_STATUS_LABEL,
  dispensingNotice,
  HOLD_MESSAGE,
  isDispensingView,
  shortageMessage,
  stockShortage,
  totalsByItem,
  USAGE_MAX,
  validateDispensingLine,
} from "@/lib/dispensing";

describe("validateDispensingLine", () => {
  const ok = { itemId: "it1", quantity: 2, usage: "3 x 1 sesudah makan" };

  it("menerima baris yang sah dan memangkas aturan pakai", () => {
    expect(validateDispensingLine({ ...ok, usage: "  3 x 1  " })).toEqual({ ok: true, value: { itemId: "it1", quantity: 2, usage: "3 x 1" } });
  });

  it("menolak jumlah pecahan, nol, negatif, atau bukan angka", () => {
    for (const quantity of [0, -1, 1.5, Number.NaN, "2", null]) {
      expect(validateDispensingLine({ ...ok, quantity })).toEqual({ ok: false, message: "Jumlah harus bilangan bulat lebih dari 0." });
    }
  });

  it("menolak aturan pakai kosong atau terlalu panjang", () => {
    expect(validateDispensingLine({ ...ok, usage: "   " })).toEqual({ ok: false, message: "Isi aturan pakai." });
    expect(validateDispensingLine({ ...ok, usage: undefined })).toEqual({ ok: false, message: "Isi aturan pakai." });
    expect(validateDispensingLine({ ...ok, usage: "x".repeat(USAGE_MAX + 1) })).toEqual({
      ok: false,
      message: "Aturan pakai paling banyak 200 karakter.",
    });
    expect(validateDispensingLine({ ...ok, usage: "x".repeat(USAGE_MAX) }).ok).toBe(true);
  });

  it("menolak barang kosong dan masukan buatan", () => {
    expect(validateDispensingLine({ ...ok, itemId: "" })).toEqual({ ok: false, message: "Pilih obat dari daftar." });
    expect(validateDispensingLine({ ...ok, itemId: 7 })).toEqual({ ok: false, message: "Pilih obat dari daftar." });
    expect(validateDispensingLine(null)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
    expect(validateDispensingLine([])).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("ringkasan per barang dan kekurangan stok", () => {
  const lines = [
    { itemId: "a", itemName: "Amoxicillin", quantity: 5 },
    { itemId: "b", itemName: "Vitamin C", quantity: 2 },
    { itemId: "a", itemName: "Amoxicillin", quantity: 4 },
  ];

  it("menjumlahkan barang yang sama di beberapa baris, urutan kemunculan pertama", () => {
    expect(totalsByItem(lines)).toEqual([
      { itemId: "a", itemName: "Amoxicillin", quantity: 9 },
      { itemId: "b", itemName: "Vitamin C", quantity: 2 },
    ]);
  });

  it("mendeteksi kekurangan dengan jumlah gabungan, bukan per baris", () => {
    const available = new Map([["a", 8], ["b", 10]]);
    expect(stockShortage(totalsByItem(lines), available)).toEqual({ itemName: "Amoxicillin", available: 8 });
    expect(shortageMessage({ itemName: "Amoxicillin", available: 8 })).toBe("Stok Amoxicillin tidak cukup (tersedia 8).");
  });

  it("barang yang tidak ada di peta dianggap tersedia 0; cukup berarti tidak ada kekurangan", () => {
    expect(stockShortage([{ itemId: "z", itemName: "Z", quantity: 1 }], new Map())).toEqual({ itemName: "Z", available: 0 });
    expect(stockShortage(totalsByItem(lines), new Map([["a", 9], ["b", 2]]))).toBeNull();
  });
});

describe("status dan pemberitahuan", () => {
  it("label dan tampilan", () => {
    expect(DISPENSING_STATUS_LABEL).toEqual({ MENUNGGU: "Menunggu", SELESAI: "Selesai", TANPA_OBAT: "Tanpa obat" });
    expect(isDispensingView("SELESAI")).toBe(true);
    expect(isDispensingView("lain")).toBe(false);
  });

  it("pemberitahuan di tagihan: hanya bila kunjungan punya penyerahan", () => {
    expect(dispensingNotice(null)).toBeNull();
    expect(dispensingNotice("MENUNGGU")).toBe(HOLD_MESSAGE);
    expect(dispensingNotice("SELESAI")).toBe("Obat sudah diserahkan.");
    expect(dispensingNotice("TANPA_OBAT")).toBe("Apoteker menandai tanpa obat.");
  });
});
```

Run: `npx vitest run tests/unit/dispensing.test.ts`
Expected: FAIL, karena modul `@/lib/dispensing` tidak ditemukan.

- [ ] **Step 2: Modul**

Buat `src/lib/dispensing.ts`:

```ts
import { MAX_QUANTITY, type Validation } from "./stock";

// Aturan murni penyerahan obat (spec penyerahan). Dipakai server dan browser; tanpa akses basis data.

export type DispensingStatusValue = "MENUNGGU" | "SELESAI" | "TANPA_OBAT";
export type DispensingView = DispensingStatusValue;

export const DISPENSING_STATUS_LABEL: Record<DispensingStatusValue, string> = {
  MENUNGGU: "Menunggu",
  SELESAI: "Selesai",
  TANPA_OBAT: "Tanpa obat",
};
export const DISPENSING_VIEWS = Object.keys(DISPENSING_STATUS_LABEL) as DispensingView[];

export function isDispensingView(value: unknown): value is DispensingView {
  return typeof value === "string" && (DISPENSING_VIEWS as string[]).includes(value);
}

export const USAGE_MAX = 200;
export const HOLD_MESSAGE = "Menunggu Apoteker menyerahkan obat.";

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

export type DispensingLineInput = { itemId: string; quantity: number; usage: string };

/** Satu baris obat dari formulir Apoteker (spec penyerahan 4.2). */
export function validateDispensingLine(raw: unknown): Validation<DispensingLineInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(INVALID_FORM);
  const row = raw as Record<string, unknown>;
  if (typeof row.itemId !== "string" || row.itemId === "" || row.itemId.length > 100) return fail("Pilih obat dari daftar.");
  const quantity = row.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return fail("Jumlah harus bilangan bulat lebih dari 0.");
  }
  const usage = typeof row.usage === "string" ? row.usage.trim() : row.usage === undefined || row.usage === null ? "" : null;
  if (usage === null) return fail(INVALID_FORM);
  if (usage === "") return fail("Isi aturan pakai.");
  if (usage.length > USAGE_MAX) return fail(`Aturan pakai paling banyak ${USAGE_MAX} karakter.`);
  return { ok: true, value: { itemId: row.itemId, quantity, usage } };
}

export type ItemQuantity = { itemId: string; itemName: string; quantity: number };

/** Jumlah per barang; barang yang sama di beberapa baris digabung, urutan kemunculan pertama. */
export function totalsByItem(lines: readonly ItemQuantity[]): ItemQuantity[] {
  const totals = new Map<string, ItemQuantity>();
  for (const line of lines) {
    const existing = totals.get(line.itemId);
    if (existing) existing.quantity += line.quantity;
    else totals.set(line.itemId, { ...line });
  }
  return [...totals.values()];
}

/** Barang pertama yang kebutuhannya melebihi stok tersedia, atau null bila semuanya cukup. */
export function stockShortage(
  needed: readonly ItemQuantity[],
  available: ReadonlyMap<string, number>,
): { itemName: string; available: number } | null {
  for (const line of needed) {
    const have = available.get(line.itemId) ?? 0;
    if (line.quantity > have) return { itemName: line.itemName, available: have };
  }
  return null;
}

export function shortageMessage(shortage: { itemName: string; available: number }): string {
  return `Stok ${shortage.itemName} tidak cukup (tersedia ${shortage.available}).`;
}

/** Pemberitahuan di editor tagihan (spec penyerahan 4.4); null bila kunjungan tidak punya penyerahan. */
export function dispensingNotice(status: DispensingStatusValue | null): string | null {
  switch (status) {
    case null:
      return null;
    case "MENUNGGU":
      return HOLD_MESSAGE;
    case "SELESAI":
      return "Obat sudah diserahkan.";
    case "TANPA_OBAT":
      return "Apoteker menandai tanpa obat.";
  }
}
```

Run: `npx vitest run tests/unit/dispensing.test.ts`
Expected: PASS semua.

- [ ] **Step 3: Lint, tipe, commit**

Run: `npx eslint src/lib/dispensing.ts tests/unit/dispensing.test.ts; npx tsc --noEmit -p . > "$WS/t2-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: eslint bersih, `tsc exit 0`.

```bash
git add src/lib/dispensing.ts tests/unit/dispensing.test.ts
git commit -m "feat: add pure dispensing rules for lines, totals, shortages, and notices"
```

---

### Task 3: Catatan untuk Apoteker di catatan dokter, dan pembuatan penyerahan saat final

**Files:**
- Modify: `src/lib/encounter.ts`, `src/server/encounter.ts`, `src/server/encounter-read.ts`, `src/components/admin/encounter-form.tsx`, `src/components/admin/encounter-record.tsx`, `tests/fixtures/encounter-detail.ts`, `tests/unit/encounter.test.ts`, `tests/integration/encounter.test.ts`, `tests/unit/components/encounter-form.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`Encounter.pharmacyNote`, model `Dispensing`), `finalizeEncounter`, `saveEncounterDraft`, `writeDraft`, `parseEncounterDraft`, `emptyDraftInput`.
- Produces:
  - `PHARMACY_NOTE_MAX = 1000` dan `TEXT_FIELDS.pharmacyNote = "Catatan untuk Apoteker"` di `src/lib/encounter.ts`; `pharmacyNote` ada di `EncounterDraftInput`, `EncounterDraft`, `encounterDraftInputSchema`, dan `emptyDraftInput()`;
  - `finalizeEncounter` membuat `Dispensing` (`MENUNGGU`, `branchId` booking) di transaksi yang sama bila `pharmacyNote` (setelah dipangkas) tidak kosong, dan mencatat audit `dispensing.create`.

- [ ] **Step 1: Tulis uji (gagal)**

Di `tests/unit/encounter.test.ts`, tambahkan di dalam blok `describe` yang menguji `parseEncounterDraft` (cari `parseEncounterDraft(draft({ subjective: "  Pusing  "`):

```ts
  it("Catatan untuk Apoteker: dipangkas, kosong menjadi null, paling banyak 1.000 karakter", () => {
    expect(parseEncounterDraft(draft({ pharmacyNote: "  Amoxicillin 3x1  " }))).toMatchObject({ ok: true, value: { pharmacyNote: "Amoxicillin 3x1" } });
    expect(parseEncounterDraft(draft({ pharmacyNote: "   " }))).toMatchObject({ ok: true, value: { pharmacyNote: null } });
    expect(parseEncounterDraft(draft({ pharmacyNote: "x".repeat(1000) })).ok).toBe(true);
    expect(parseEncounterDraft(draft({ pharmacyNote: "x".repeat(1001) }))).toEqual({
      ok: false,
      message: "Catatan untuk Apoteker terlalu panjang (maks. 1.000 karakter).",
    });
    expect(emptyDraftInput().pharmacyNote).toBe("");
  });
```

Di `tests/integration/encounter.test.ts`: tambahkan di `beforeAll` dan `afterAll` (sebelum `cleanupBookingWorld(...)`) baris `await prisma.dispensingLine.deleteMany({ where: { dispensing: { branchId: world?.branchId ?? "" } } }); await prisma.dispensing.deleteMany({ where: { branchId: world?.branchId ?? "" } });` (di `beforeAll` cukup `afterAll`, karena `world` baru ada sesudahnya; bungkus dengan `if (world)`). Lalu tambahkan sesudah uji "finalisasi menyimpan isian yang dikirim…":

```ts
  it("finalisasi dengan Catatan untuk Apoteker membuat satu penyerahan Menunggu di cabang booking", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    await unwrap(
      finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Infeksi", pharmacyNote: "  Amoxicillin 3x1 selama 5 hari  " }) }),
    );
    const row = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(row.pharmacyNote).toBe("Amoxicillin 3x1 selama 5 hari");
    const dispensing = await prisma.dispensing.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    expect(dispensing).toMatchObject({ status: "MENUNGGU", version: 1, branchId: world.branchId, completedAt: null });
    expect(await auditCount("dispensing.create", dispensing.id)).toBe(1);
  });

  it("tanpa Catatan untuk Apoteker (kosong atau spasi) tidak ada penyerahan", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol", pharmacyNote: "   " }) }));
    expect(await prisma.dispensing.count({ where: { appointmentId: appointment.id } })).toBe(0);
  });

  it("finalisasi yang gagal tidak meninggalkan penyerahan, dan catatan terlalu panjang ditolak", async () => {
    actAs("DOKTER");
    const { appointment, encounterId } = await opened();
    const stale = new Date(0).toISOString();
    const result = await finalizeEncounter({ encounterId, version: stale, draft: draftWith({ assessment: "x", pharmacyNote: "Obat" }) });
    expect(result.ok).toBe(false);
    expect(await prisma.dispensing.count({ where: { appointmentId: appointment.id } })).toBe(0);

    const fresh = (await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).updatedAt.toISOString();
    expect(await finalizeEncounter({ encounterId, version: fresh, draft: draftWith({ assessment: "x", pharmacyNote: "x".repeat(1001) }) })).toEqual({
      ok: false,
      error: "Catatan untuk Apoteker terlalu panjang (maks. 1.000 karakter).",
    });
  });
```

Di `tests/unit/components/encounter-form.test.tsx`, tambahkan satu uji (ikuti cara uji lain di berkas itu merender formulir dengan `encounterDetail()`; kolom ditemukan lewat label):

```tsx
  it("ada kolom Catatan untuk Apoteker di bagian Plan, dan ketikan ikut tersimpan otomatis", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValueOnce(saved("v2"));
    renderForm();
    const field = screen.getByLabelText("Catatan untuk Apoteker");
    expect(field).toHaveAttribute("maxlength", "1000");
    await userEvent.type(field, "Amoxicillin 3x1");
    expect(field).toHaveValue("Amoxicillin 3x1");
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveEncounterDraft).mock.calls[0][0].draft.pharmacyNote).toBe("Amoxicillin 3x1");
  });
```

Run: `npx vitest run tests/unit/encounter.test.ts tests/unit/components/encounter-form.test.tsx; npm run test:integration -- tests/integration/encounter.test.ts`
Expected: FAIL (kolom belum ada; `pharmacyNote` tidak dikenal; tsc juga akan gagal di berkas fixture).

- [ ] **Step 2: Aturan dan skema isian**

Di `src/lib/encounter.ts`:
1. Setelah `export const ENCOUNTER_TEXT_MAX = 5000;` tambahkan `export const PHARMACY_NOTE_MAX = 1000;`.
2. Tambahkan ke `TEXT_FIELDS` (setelah `plan: …`): `  pharmacyNote: "Catatan untuk Apoteker",`.
3. Di `encounterDraftInputSchema`, tambahkan `    pharmacyNote: text,` setelah `plan: text,`.
4. Di `parseEncounterDraft`, ganti baris
   `if (value && value.length > ENCOUNTER_TEXT_MAX) return { ok: false, message: tooLong(TEXT_FIELDS[key], ENCOUNTER_TEXT_MAX) };`
   dengan
   ```ts
    const max = key === "pharmacyNote" ? PHARMACY_NOTE_MAX : ENCOUNTER_TEXT_MAX;
    if (value && value.length > max) return { ok: false, message: tooLong(TEXT_FIELDS[key], max) };
   ```
5. Di `emptyDraftInput()`, tambahkan `    pharmacyNote: "",` setelah `plan: "",`.

- [ ] **Step 3: Server — simpan, baca, dan buat penyerahan**

Di `src/server/encounter.ts`:
1. `writeDraft`: tambahkan `      pharmacyNote: draft.pharmacyNote,` ke `data` pada `tx.encounter.updateMany` (setelah `plan: draft.plan,`).
2. `finalizeEncounter`: ubah `select` appointment menjadi `{ id: true, code: true, startAt: true, patientId: true, branchId: true }`. Ubah pemanggilan transaksi supaya mengembalikan id penyerahan:

```ts
    const dispensingId = await guardLocked(() =>
      prisma.$transaction(async (tx) => {
        // … isi blok yang sudah ada tidak berubah, sampai sebelum `}),` penutup …
        // Catatan untuk Apoteker terisi: satu penyerahan Menunggu di cabang booking (spec penyerahan 3.3).
        if (!draft.pharmacyNote) return null;
        const created = await tx.dispensing.create({
          data: { appointmentId: appointment.id, branchId: appointment.branchId },
          select: { id: true },
        });
        return created.id;
      }),
    );
```

   (semua pernyataan lama di dalam transaksi — `writeDraft`, `tx.encounter.update`, `tx.appointment.updateMany`, `tx.patient.updateMany` — tetap, dan `return null`/`return created.id` ditambahkan di akhir.) Sesudah `recordAudit(... "encounter.finalize" ...)` tambahkan:

```ts
    if (dispensingId) {
      await recordAudit({ actor, action: "dispensing.create", entity: "Dispensing", entityId: dispensingId, summary: appointment.code });
      safeRevalidatePath("/admin/resep");
    }
```

Di `src/server/encounter-read.ts`: pada `select` rincian kunjungan (yang memuat `plan: true,` di sekitar baris 274, bukan yang untuk riwayat) tambahkan `pharmacyNote: true,`, dan pada objek `draft` (sekitar baris 379) tambahkan `pharmacyNote: row.pharmacyNote ?? "",` setelah `plan: row.plan ?? "",`. Riwayat kunjungan (`EncounterHistoryItem`) tidak memuat kolom ini.

- [ ] **Step 4: Formulir dan tampilan catatan**

Di `src/components/admin/encounter-form.tsx`:
1. Ubah `TextField` menerima `maxLength` dan `hint` (opsional):

```tsx
function TextField({
  label,
  value,
  onChange,
  rows = 3,
  maxLength = ENCOUNTER_TEXT_MAX,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} rows={rows} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} className={textareaClass} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
```

2. Impor `PHARMACY_NOTE_MAX` dari `@/lib/encounter` dan tambahkan sesudah `TextField` untuk plan (di dalam `<section aria-labelledby="bagian-p">`):

```tsx
        <TextField
          label={TEXT_FIELDS.pharmacyNote}
          value={draft.pharmacyNote}
          onChange={(v) => setText("pharmacyNote", v)}
          rows={2}
          maxLength={PHARMACY_NOTE_MAX}
          hint="Diisi bila pasien perlu obat. Apoteker hanya membaca kolom ini, bukan catatan klinis lain."
        />
```

Di `src/components/admin/encounter-record.tsx`, tepat setelah `<RecordText label={TEXT_FIELDS.plan} value={draft.plan} />` tambahkan `        <RecordText label={TEXT_FIELDS.pharmacyNote} value={draft.pharmacyNote} />`.

Di `tests/fixtures/encounter-detail.ts` dan setiap literal `EncounterDraftInput` lain yang ditandai `tsc`, tambahkan `pharmacyNote: "",` (jalankan `npx tsc --noEmit -p .` dan perbaiki satu per satu; jangan mengubah kode produksi untuk menenangkan `tsc`).

- [ ] **Step 5: Jalankan uji dan commit**

Run: `npx vitest run tests/unit/encounter.test.ts tests/unit/components/encounter-form.test.tsx tests/unit/components/encounter-page-view.test.tsx; npm run test:integration -- tests/integration/encounter.test.ts tests/integration/encounter-read.test.ts tests/integration/patient-records.test.ts`
Expected: PASS semua.

Run: `npx vitest run > "$WS/t3.log" 2>&1; grep -E "Test Files|Tests " "$WS/t3.log"; npx eslint src tests/unit tests/integration tests/fixtures; npx tsc --noEmit -p . > "$WS/t3-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS (satu uji `encounter-form` yang kadang flake boleh diulang), eslint bersih, `tsc exit 0`.

```bash
git add src tests
git commit -m "feat: let doctors leave a pharmacist note and open a dispensing when the visit is finalized"
```

---

### Task 4: Server — antrean, rincian, pilihan obat, dan ubah daftar obat penyerahan

**Files:**
- Create: `src/server/dispensing-store.ts`, `src/server/dispensing-read.ts`, `src/server/dispensing-drafts.ts`
- Test: `tests/integration/dispensing-draft.test.ts`, `tests/integration/dispensing-read.test.ts`

**Interfaces:**
- Consumes: Task 1 (model, `seedDispensing`), Task 2 (`validateDispensingLine`, `DispensingStatusValue`, `DispensingView`), `stockFlags` (`@/lib/stock`), `requireCapability`, `recordAudit`, `safeRevalidatePath`, `runAction`, `UserFacingError`.
- Produces:
  - `dispensing-store.ts` (tanpa `"use server"`): `STALE_DISPENSING`, `lockDispensingRow(tx, dispensingId): Promise<void>`, `touchDispensing(tx, dispensingId, version: unknown): Promise<number>` (mengunci baris, harus `MENUNGGU`, versi harus sama, menaikkan versi, mengembalikan versi baru);
  - `dispensing-read.ts`: `DispensingRow`, `listDispensings(filter: { view: DispensingView; q?: string }): Promise<DispensingRow[]>`, `countPendingDispensings(): Promise<number>`, `DispensingDetail`, `getDispensingDetail(id: string): Promise<DispensingDetail | null>`, `DispenseItem`, `listDispenseItems(branchId: string): Promise<DispenseItem[]>` (semuanya `dispense:read`; `listDispenseItems` `dispense:manage`);
  - `dispensing-drafts.ts` (`"use server"`, `dispense:manage`): `addDispensingLine(input: { dispensingId: string; version: number; itemId: string; quantity: number; usage: string })`, `updateDispensingLine(input: { dispensingId; version; lineId: string; quantity: number; usage: string })`, `removeDispensingLine(input: { dispensingId; version; lineId: string })`, semuanya `Promise<ActionResult<{ version: number }>>`; audit `dispensing.update`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/dispensing-draft.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDispensingLine, removeDispensingLine, updateDispensingLine } from "@/server/dispensing-drafts";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Apoteker Uji", role: "APOTEKER" as Role, email: "uji@sundy.test" },
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

const SLUG = "draf-penyerahan";
const WA = "6281200008901";

describe("mengubah daftar obat penyerahan", () => {
  let world: BillingWorld;

  async function waiting() {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "Amoxicillin" });
    return seedDispensing(world, appointmentId);
  }
  const add = (id: string, version: number, patch: Record<string, unknown> = {}) =>
    addDispensingLine({ dispensingId: id, version, itemId: world.drugId, quantity: 3, usage: "3 x 1 sesudah makan", ...patch });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });
  beforeEach(() => {
    actor.role = "APOTEKER";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("menambah obat: nama disalin, versi naik, audit tercatat", async () => {
    const { id } = await waiting();
    const first = await unwrap(add(id, 1));
    expect(first.version).toBe(2);
    const second = await unwrap(add(id, 2, { itemId: world.productId, quantity: 1, usage: "1 x 1 pagi" }));
    expect(second.version).toBe(3);
    const lines = await prisma.dispensingLine.findMany({ where: { dispensingId: id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((l) => [l.itemName, l.quantity, l.usage, l.sortOrder])).toEqual([
      [`${SLUG} Amoxicillin`, 3, "3 x 1 sesudah makan", 0],
      [`${SLUG} Serum C`, 1, "1 x 1 pagi", 1],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "dispensing.update", entityId: id } })).toBe(2);
  });

  it("versi usang ditolak dan tidak mengubah apa pun", async () => {
    const { id } = await waiting();
    await unwrap(add(id, 1));
    expect(await add(id, 1)).toEqual({ ok: false, error: "Penyerahan ini baru diubah orang lain. Muat ulang halaman." });
    expect(await prisma.dispensingLine.count({ where: { dispensingId: id } })).toBe(1);
  });

  it("menolak permintaan buatan: jumlah, aturan pakai, dan obat yang tidak sah", async () => {
    const { id } = await waiting();
    for (const quantity of [0, -2, 1.5]) {
      expect(await add(id, 1, { quantity })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat lebih dari 0." });
    }
    expect(await add(id, 1, { usage: " " })).toEqual({ ok: false, error: "Isi aturan pakai." });
    expect(await add(id, 1, { itemId: "tidak-ada" })).toEqual({ ok: false, error: "Obat tidak ditemukan atau tidak dijual." });
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: false } });
    expect(await add(id, 1, { itemId: world.productId })).toEqual({ ok: false, error: "Obat tidak ditemukan atau tidak dijual." });
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: true, sellPrice: null } });
    expect(await add(id, 1, { itemId: world.productId })).toEqual({ ok: false, error: "Obat tidak ditemukan atau tidak dijual." });
    await prisma.stockItem.update({ where: { id: world.productId }, data: { sellPrice: 150000 } });
    expect(await prisma.dispensingLine.count({ where: { dispensingId: id } })).toBe(0);
    expect((await prisma.dispensing.findUniqueOrThrow({ where: { id } })).version).toBe(1);
  });

  it("mengubah jumlah dan aturan pakai, dan menghapus baris", async () => {
    const { id } = await waiting();
    const a = await unwrap(add(id, 1));
    const lineId = (await prisma.dispensingLine.findFirstOrThrow({ where: { dispensingId: id } })).id;
    const b = await unwrap(updateDispensingLine({ dispensingId: id, version: a.version, lineId, quantity: 5, usage: "2 x 1" }));
    expect(await prisma.dispensingLine.findUniqueOrThrow({ where: { id: lineId } })).toMatchObject({ quantity: 5, usage: "2 x 1" });
    expect(await updateDispensingLine({ dispensingId: id, version: b.version, lineId, quantity: 0, usage: "2 x 1" })).toEqual({
      ok: false,
      error: "Jumlah harus bilangan bulat lebih dari 0.",
    });
    expect(await removeDispensingLine({ dispensingId: id, version: b.version, lineId: "tidak-ada" })).toEqual({ ok: false, error: "Baris tidak ditemukan." });
    await unwrap(removeDispensingLine({ dispensingId: id, version: b.version, lineId }));
    expect(await prisma.dispensingLine.count({ where: { dispensingId: id } })).toBe(0);
  });

  it("penyerahan yang sudah selesai tidak bisa diubah", async () => {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "x" });
    const { id } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 1 }] });
    expect(await add(id, 1)).toEqual({ ok: false, error: "Penyerahan ini sudah selesai. Buka kembali dulu untuk mengubahnya." });
  });

  it("hak akses: hanya Apoteker (dispense:manage)", async () => {
    const { id } = await waiting();
    for (const role of ["RESEPSIONIS", "DOKTER", "ADMIN_KEUANGAN"] as const) {
      actor.role = role;
      await expect(add(id, 1)).rejects.toThrow(/forbidden: dispense:manage/);
    }
    expect(await prisma.dispensingLine.count({ where: { dispensingId: id } })).toBe(0);
  });
});
```

Buat `tests/integration/dispensing-read.test.ts` (pola mock dan `beforeAll` sama dengan berkas di atas; slug `baca-penyerahan`, WA `6281200008902`):

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { countPendingDispensings, getDispensingDetail, listDispenseItems, listDispensings } from "@/server/dispensing-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Apoteker Uji", role: "APOTEKER" as Role, email: "uji@sundy.test" },
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

const SLUG = "baca-penyerahan";
const WA = "6281200008902";
const today = witaDateString(new Date());

describe("membaca penyerahan", () => {
  let world: BillingWorld;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });
  beforeEach(() => {
    actor.role = "APOTEKER";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("antrean per tampilan, dengan pencarian nama pasien; hitungan Menunggu", async () => {
    const waitingVisit = await finalVisit(world, { pharmacyNote: "Obat A" });
    const doneVisit = await finalVisit(world, { pharmacyNote: "Obat B" });
    const noneVisit = await finalVisit(world, { pharmacyNote: "Anjuran saja" });
    const waiting = await seedDispensing(world, waitingVisit.appointmentId);
    const done = await seedDispensing(world, doneVisit.appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 2 }] });
    const none = await seedDispensing(world, noneVisit.appointmentId, { status: "TANPA_OBAT" });

    expect((await listDispensings({ view: "MENUNGGU" })).map((r) => r.id)).toContain(waiting.id);
    expect((await listDispensings({ view: "MENUNGGU" })).map((r) => r.id)).not.toContain(done.id);
    expect((await listDispensings({ view: "SELESAI" })).find((r) => r.id === done.id)).toMatchObject({
      patientName: `Pasien ${SLUG}`,
      status: "SELESAI",
      lineCount: 1,
    });
    expect((await listDispensings({ view: "TANPA_OBAT" })).map((r) => r.id)).toContain(none.id);
    expect((await listDispensings({ view: "MENUNGGU", q: `pasien ${SLUG}` })).map((r) => r.id)).toContain(waiting.id);
    expect((await listDispensings({ view: "MENUNGGU", q: "tidak-ada-orang-ini" })).map((r) => r.id)).not.toContain(waiting.id);
    expect(await countPendingDispensings()).toBeGreaterThanOrEqual(1);
  });

  it("rincian hanya memuat catatan Apoteker; data klinis lain tidak ikut", async () => {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "Amoxicillin 3x1" });
    const { id } = await seedDispensing(world, appointmentId, { lines: [{ itemId: world.drugId, quantity: 4, usage: "3 x 1" }] });
    const detail = await getDispensingDetail(id);
    expect(detail).toMatchObject({
      id,
      status: "MENUNGGU",
      version: 1,
      note: "Amoxicillin 3x1",
      patientName: `Pasien ${SLUG}`,
      invoiceState: "NONE",
      canReopen: false,
      lines: [{ itemId: world.drugId, quantity: 4, usage: "3 x 1" }],
    });
    // Nama kolom klinis dan kontak tidak boleh ikut terbawa di hasil.
    const json = JSON.stringify(detail);
    for (const secret of ["assessment", "subjective", "physicalExam", "medicalHistory", "allergies", "whatsapp"]) {
      expect(json).not.toContain(secret);
    }
    expect(await getDispensingDetail("tidak-ada")).toBeNull();
  });

  it("canReopen: selesai dan tagihan belum final; tidak bila tagihan final", async () => {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "x" });
    const { id } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 1 }] });
    expect(await getDispensingDetail(id)).toMatchObject({ canReopen: true, invoiceState: "NONE" });
    const invoice = await prisma.invoice.create({
      data: { patientId: world.patientId, appointmentId, branchId: world.branchId, createdById: "s1", createdByName: "x" },
    });
    expect(await getDispensingDetail(id)).toMatchObject({ canReopen: true, invoiceState: "DRAF" });
    await prisma.invoiceLine.create({ data: { invoiceId: invoice.id, kind: "LAYANAN", name: "x", quantity: 1, unitPrice: 1 } });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "FINAL", number: `TG-2032-${Date.now() % 100000}`, finalizedAt: new Date() } });
    expect(await getDispensingDetail(id)).toMatchObject({ canReopen: false, invoiceState: "FINAL" });
  });

  it("pilihan obat: aktif, berharga jual, dengan stok tersedia (tanpa batch kedaluwarsa); tanpa harga", async () => {
    await billingBatch(world, { invoiceNumber: "BP-1", itemId: world.drugId, quantity: 8, expiryDate: addDaysToDateString(today, 100) });
    await billingBatch(world, { invoiceNumber: "BP-2", itemId: world.drugId, quantity: 3, expiryDate: addDaysToDateString(today, -1) });
    const items = await listDispenseItems(world.branchId);
    const drug = items.find((i) => i.id === world.drugId);
    expect(drug).toEqual({ id: world.drugId, code: `${SLUG.toUpperCase()}-OBT`, name: `${SLUG} Amoxicillin`, unit: "kapsul", available: 8 });
    expect(Object.keys(drug!).sort()).toEqual(["available", "code", "id", "name", "unit"]);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { sellPrice: null } });
    expect((await listDispenseItems(world.branchId)).map((i) => i.id)).not.toContain(world.productId);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { sellPrice: 150000 } });
  });

  it("hak akses: Resepsionis, Dokter, dan Admin Keuangan ditolak", async () => {
    for (const role of ["RESEPSIONIS", "DOKTER", "ADMIN_KEUANGAN"] as const) {
      actor.role = role;
      await expect(listDispensings({ view: "MENUNGGU" })).rejects.toThrow(/forbidden: dispense:read/);
      await expect(getDispensingDetail("x")).rejects.toThrow(/forbidden: dispense:read/);
      await expect(countPendingDispensings()).rejects.toThrow(/forbidden: dispense:read/);
      await expect(listDispenseItems(world.branchId)).rejects.toThrow(/forbidden: dispense:manage/);
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/dispensing-draft.test.ts tests/integration/dispensing-read.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 2: Pembantu server**

Buat `src/server/dispensing-store.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";

// Tanpa "use server": pembantu server untuk penyerahan, tidak dipanggil browser.

export const STALE_DISPENSING = "Penyerahan ini baru diubah orang lain. Muat ulang halaman.";
export const NOT_WAITING = "Penyerahan ini sudah selesai. Buka kembali dulu untuk mengubahnya.";

/** Mengunci baris penyerahan sampai transaksi selesai (spec penyerahan 4.2). */
export async function lockDispensingRow(tx: Prisma.TransactionClient, dispensingId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Dispensing" WHERE id = ${dispensingId} FOR UPDATE`;
}

/**
 * Setiap perubahan daftar obat lewat sini: baris dikunci, penyerahan harus Menunggu, dan versi yang
 * dikirim harus sama dengan versi sekarang. Mengembalikan versi baru.
 */
export async function touchDispensing(tx: Prisma.TransactionClient, dispensingId: string, version: unknown): Promise<number> {
  await lockDispensingRow(tx, dispensingId);
  const row = await tx.dispensing.findUnique({ where: { id: dispensingId }, select: { status: true, version: true } });
  if (!row) throw new UserFacingError("Penyerahan tidak ditemukan.");
  if (row.status !== "MENUNGGU") throw new UserFacingError(NOT_WAITING);
  if (row.version !== version) throw new UserFacingError(STALE_DISPENSING);
  await tx.dispensing.update({ where: { id: dispensingId }, data: { version: { increment: 1 } } });
  return row.version + 1;
}
```

Buat `src/server/dispensing-read.ts`:

```ts
import { prisma } from "@/lib/db";
import type { DispensingStatusValue, DispensingView } from "@/lib/dispensing";
import { stockFlags } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

export type DispensingRow = {
  id: string;
  status: DispensingStatusValue;
  patientName: string;
  branchName: string;
  startAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  lineCount: number;
};

/** Antrean penyerahan (spec penyerahan 6): Menunggu terlama di atas; lainnya terbaru di atas; paling banyak 300. */
export async function listDispensings(filter: { view: DispensingView; q?: string }): Promise<DispensingRow[]> {
  await requireCapability("dispense:read");
  const q = filter.q?.trim();
  const rows = await prisma.dispensing.findMany({
    where: {
      status: filter.view,
      ...(q
        ? {
            appointment: {
              patient: {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { medicalRecordNumber: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          }
        : {}),
    },
    orderBy: filter.view === "MENUNGGU" ? { createdAt: "asc" } : { completedAt: "desc" },
    take: 300,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      branch: { select: { name: true } },
      appointment: { select: { startAt: true, patient: { select: { name: true } } } },
      _count: { select: { lines: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    patientName: row.appointment.patient?.name ?? "-",
    branchName: row.branch.name,
    startAt: row.appointment.startAt,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    lineCount: row._count.lines,
  }));
}

/** Jumlah penyerahan Menunggu, untuk lencana menu dan kotak dasbor. */
export async function countPendingDispensings(): Promise<number> {
  await requireCapability("dispense:read");
  return prisma.dispensing.count({ where: { status: "MENUNGGU" } });
}

export type DispensingDetail = {
  id: string;
  version: number;
  status: DispensingStatusValue;
  appointmentId: string;
  branchId: string;
  branchName: string;
  startAt: Date;
  patientName: string;
  /** Catatan untuk Apoteker: satu-satunya isi klinis yang dibuka untuk Apoteker. */
  note: string;
  completedAt: Date | null;
  completedByName: string | null;
  lines: { id: string; itemId: string; itemName: string; quantity: number; usage: string }[];
  /** Status tagihan aktif kunjungan ini; NONE bila belum ada. */
  invoiceState: "NONE" | "DRAF" | "FINAL";
  /** Boleh dibuka kembali: sudah diproses dan tagihan belum final (spec penyerahan 4.5). */
  canReopen: boolean;
};

/** Rincian satu penyerahan. Sengaja tidak memilih kolom klinis selain pharmacyNote. */
export async function getDispensingDetail(id: string): Promise<DispensingDetail | null> {
  await requireCapability("dispense:read");
  const row = await prisma.dispensing.findUnique({
    where: { id: String(id ?? "") },
    select: {
      id: true,
      version: true,
      status: true,
      appointmentId: true,
      branchId: true,
      completedAt: true,
      completedByName: true,
      branch: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { id: true, itemId: true, itemName: true, quantity: true, usage: true } },
      appointment: {
        select: {
          startAt: true,
          patient: { select: { name: true } },
          encounter: { select: { pharmacyNote: true } },
          invoices: { where: { status: { not: "DIBATALKAN" } }, select: { status: true } },
        },
      },
    },
  });
  if (!row) return null;
  const invoiceStatus = row.appointment.invoices[0]?.status;
  const invoiceState = invoiceStatus === "FINAL" ? "FINAL" : invoiceStatus === "DRAF" ? "DRAF" : "NONE";
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    appointmentId: row.appointmentId,
    branchId: row.branchId,
    branchName: row.branch.name,
    startAt: row.appointment.startAt,
    patientName: row.appointment.patient?.name ?? "-",
    note: row.appointment.encounter?.pharmacyNote ?? "",
    completedAt: row.completedAt,
    completedByName: row.completedByName,
    lines: row.lines,
    invoiceState,
    canReopen: row.status !== "MENUNGGU" && invoiceState !== "FINAL",
  };
}

export type DispenseItem = { id: string; code: string; name: string; unit: string; available: number };

/** Pilihan obat untuk Apoteker: aktif, berharga jual, dengan stok tersedia di cabang. Tanpa harga dan tanpa batch. */
export async function listDispenseItems(branchId: string): Promise<DispenseItem[]> {
  await requireCapability("dispense:manage");
  const today = witaDateString(new Date());
  const items = await prisma.stockItem.findMany({
    where: { isActive: true, sellPrice: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      batches: {
        where: { branchId: String(branchId ?? ""), quantityRemaining: { gt: 0 } },
        select: { quantityRemaining: true, expiryDate: true, unitCost: true },
      },
    },
  });
  return items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    available: stockFlags(item.batches, 0, today).available,
  }));
}
```

- [ ] **Step 3: Aksi ubah daftar obat**

Buat `src/server/dispensing-drafts.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { validateDispensingLine } from "@/lib/dispensing";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { touchDispensing } from "@/server/dispensing-store";
import { requireCapability } from "@/server/session";

type EditResult = ActionResult<{ version: number }>;

function revalidateDispensing(dispensingId: string) {
  safeRevalidatePath("/admin/resep");
  safeRevalidatePath(`/admin/resep/${dispensingId}`);
}

/** Tambah obat ke penyerahan Menunggu (spec penyerahan 4.2). Nama obat disalin dari katalog. */
export async function addDispensingLine(input: {
  dispensingId: string;
  version: number;
  itemId: string;
  quantity: number;
  usage: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const checked = validateDispensingLine(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const dispensingId = String(input.dispensingId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDispensing(tx, dispensingId, input.version);
      const item = await tx.stockItem.findUnique({ where: { id: checked.value.itemId }, select: { name: true, isActive: true, sellPrice: true } });
      if (!item || !item.isActive || item.sellPrice === null) throw new UserFacingError("Obat tidak ditemukan atau tidak dijual.");
      const last = await tx.dispensingLine.aggregate({ where: { dispensingId }, _max: { sortOrder: true } });
      await tx.dispensingLine.create({
        data: {
          dispensingId,
          itemId: checked.value.itemId,
          itemName: item.name,
          quantity: checked.value.quantity,
          usage: checked.value.usage,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      return { version, summary: `Tambah ${item.name} ×${checked.value.quantity}` };
    });

    await recordAudit({ actor, action: "dispensing.update", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId);
    return { version: result.version };
  });
}

export async function updateDispensingLine(input: {
  dispensingId: string;
  version: number;
  lineId: string;
  quantity: number;
  usage: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input.dispensingId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDispensing(tx, dispensingId, input.version);
      const line = await tx.dispensingLine.findFirst({ where: { id: String(input.lineId ?? ""), dispensingId }, select: { id: true, itemId: true, itemName: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      const checked = validateDispensingLine({ itemId: line.itemId, quantity: input.quantity, usage: input.usage });
      if (!checked.ok) throw new UserFacingError(checked.message);
      await tx.dispensingLine.update({ where: { id: line.id }, data: { quantity: checked.value.quantity, usage: checked.value.usage } });
      return { version, summary: `Ubah ${line.itemName} ×${checked.value.quantity}` };
    });

    await recordAudit({ actor, action: "dispensing.update", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId);
    return { version: result.version };
  });
}

export async function removeDispensingLine(input: { dispensingId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input.dispensingId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDispensing(tx, dispensingId, input.version);
      const line = await tx.dispensingLine.findFirst({ where: { id: String(input.lineId ?? ""), dispensingId }, select: { id: true, itemName: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      await tx.dispensingLine.delete({ where: { id: line.id } });
      return { version, summary: `Hapus ${line.itemName}` };
    });

    await recordAudit({ actor, action: "dispensing.update", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId);
    return { version: result.version };
  });
}
```

Run: `npm run test:integration -- tests/integration/dispensing-draft.test.ts tests/integration/dispensing-read.test.ts`
Expected: PASS semua. (Pada uji `updateDispensingLine` dengan jumlah 0, versi sudah naik di dalam transaksi yang digulung kembali karena galat; baris dan versi tidak berubah.)

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t4.log" 2>&1; grep -E "Test Files|Tests " "$WS/t4.log"; npx eslint src/server/dispensing-*.ts tests/integration/dispensing-*.test.ts; npx tsc --noEmit -p . > "$WS/t4-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/dispensing-store.ts src/server/dispensing-read.ts src/server/dispensing-drafts.ts tests/integration/dispensing-draft.test.ts tests/integration/dispensing-read.test.ts
git commit -m "feat: read the dispensing queue and edit the medicine list with versioned drafts"
```

---

### Task 5: Server — selesai, tanpa obat, buka kembali, dan penyambungan ke tagihan

**Files:**
- Modify: `src/server/dispensing-store.ts`, `src/server/invoice-drafts.ts` (`createInvoiceFromVisit`)
- Create: `src/server/dispensing-lifecycle.ts`
- Test: `tests/integration/dispensing-lifecycle.test.ts`

**Interfaces:**
- Consumes: Task 1–4 (`seedDispensing`, `lockDispensingRow`, `getDispensingDetail`), Task 2 (`totalsByItem`, `stockShortage`, `shortageMessage`), `lockInvoiceRow` (`@/server/invoice-store`), `stockFlags`, `createInvoiceFromVisit`, `finalizeInvoice`.
- Produces:
  - `dispensing-store.ts` tambahan: `CONTEXT_CHANGED`, `activeInvoiceOf(tx, appointmentId): Promise<{ id: string; status: "DRAF" | "FINAL" } | null>`, `lockDispensingContext(tx, dispensingId, appointmentId): Promise<{ invoice: { id: string; status: "DRAF" | "FINAL" } | null }>` (urutan kunci tagihan → penyerahan, lihat Architecture), `handedInvoiceLines(tx, dispensingId): Promise<HandedLine[]>` (baris tagihan dari penyerahan `SELESAI`, kosong bila bukan), `appendDispensingLines(tx, invoiceId, dispensingId): Promise<void>`, `removeDispensingLines(tx, invoiceId, dispensingId): Promise<void>` (keduanya menaikkan versi draf);
  - `dispensing-lifecycle.ts` (`"use server"`, `dispense:manage`): `completeDispensing(input: { dispensingId: string; version: number }): Promise<ActionResult<void>>`, `markNoDispensing(input: { dispensingId: string; version: number }): Promise<ActionResult<void>>`, `reopenDispensing(input: { dispensingId: string }): Promise<ActionResult<void>>`; audit `dispensing.complete`, `dispensing.none`, `dispensing.reopen`;
  - `createInvoiceFromVisit` mengisi baris dari penyerahan `SELESAI` (dalam satu transaksi, dengan kunci baris penyerahan).

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/dispensing-lifecycle.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addDispensingLine, removeDispensingLine } from "@/server/dispensing-drafts";
import { completeDispensing, markNoDispensing, reopenDispensing } from "@/server/dispensing-lifecycle";
import { createInvoiceFromVisit } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Apoteker Uji", role: "APOTEKER" as Role, email: "uji@sundy.test" },
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

const SLUG = "siklus-penyerahan";
const WA = "6281200008903";
const today = witaDateString(new Date());

describe("siklus penyerahan obat", () => {
  let world: BillingWorld;

  const as = (role: Role) => {
    actor.role = role;
  };

  /** Kunjungan final bercatatan Apoteker + penyerahan Menunggu. */
  async function visit() {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "Amoxicillin" });
    const { id } = await seedDispensing(world, appointmentId);
    return { appointmentId, dispensingId: id };
  }
  /** Menambah obat lewat aksi (sebagai Apoteker); mengembalikan versi terbaru. */
  async function addDrug(dispensingId: string, version: number, patch: Record<string, unknown> = {}) {
    as("APOTEKER");
    const result = await unwrap(
      addDispensingLine({ dispensingId, version, itemId: world.drugId, quantity: 3, usage: "3 x 1 sesudah makan", ...patch }),
    );
    return result.version;
  }
  const status = async (dispensingId: string) => prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } });
  const linked = (invoiceId: string) => prisma.invoiceLine.findMany({ where: { invoiceId, dispensingLineId: { not: null } } });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    await billingBatch(world, { invoiceNumber: "SP-1", itemId: world.drugId, quantity: 50, expiryDate: addDaysToDateString(today, 365) });
  });
  beforeEach(() => as("APOTEKER"));
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("selesai tanpa tagihan: status Selesai; saat tagihan dibuat, baris obat ikut terisi dengan harga jual", async () => {
    const { appointmentId, dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId, version }));
    expect(await status(dispensingId)).toMatchObject({ status: "SELESAI", completedByName: "Apoteker Uji", version: version + 1 });
    expect(await prisma.invoice.count({ where: { appointmentId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "dispensing.complete", entityId: dispensingId } })).toBe(1);

    as("RESEPSIONIS");
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const lines = await linked(id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: "BARANG", itemId: world.drugId, quantity: 3, unitPrice: 2000, name: `${SLUG} Amoxicillin` });
  });

  it("selesai saat draf tagihan sudah ada: baris ditambahkan dan versi draf naik", async () => {
    const { appointmentId, dispensingId } = await visit();
    as("RESEPSIONIS");
    const { id: invoiceId } = await unwrap(createInvoiceFromVisit(appointmentId));
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(await linked(invoiceId)).toHaveLength(0);

    const version = await addDrug(dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId, version }));
    expect(await linked(invoiceId)).toHaveLength(1);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version).toBe(before.version + 1);
  });

  it("menolak selesai tanpa obat, stok kurang (termasuk jumlah gabungan), versi usang, dan penyerahan yang sudah diproses", async () => {
    const { dispensingId } = await visit();
    expect(await completeDispensing({ dispensingId, version: 1 })).toEqual({ ok: false, error: "Tambahkan obat dulu, atau pilih Tanpa obat." });

    let version = await addDrug(dispensingId, 1, { itemId: world.productId, quantity: 1 });
    expect(await completeDispensing({ dispensingId, version })).toEqual({ ok: false, error: `Stok ${SLUG} Serum C tidak cukup (tersedia 0).` });

    as("APOTEKER");
    const lines = await prisma.dispensingLine.findMany({ where: { dispensingId } });
    version = (await unwrap(removeDispensingLine({ dispensingId, version, lineId: lines[0].id }))).version;
    version = await addDrug(dispensingId, version, { quantity: 30 });
    version = await addDrug(dispensingId, version, { quantity: 30 });
    expect((await completeDispensing({ dispensingId, version })).ok).toBe(false);
    expect(await completeDispensing({ dispensingId, version: version - 1 })).toEqual({
      ok: false,
      error: "Penyerahan ini baru diubah orang lain. Muat ulang halaman.",
    });
    expect((await status(dispensingId)).status).toBe("MENUNGGU");

    const done = await visit();
    const v = await addDrug(done.dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId: done.dispensingId, version: v }));
    expect(await completeDispensing({ dispensingId: done.dispensingId, version: v + 1 })).toEqual({
      ok: false,
      error: "Penyerahan ini sudah diproses. Muat ulang halaman.",
    });
  });

  it("tanpa obat: hanya bila tidak ada obat; melepas penahanan; audit tercatat", async () => {
    const { dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    expect(await markNoDispensing({ dispensingId, version })).toEqual({
      ok: false,
      error: "Penyerahan ini punya obat. Hapus obatnya dulu, atau pilih Selesai.",
    });
    const only = await visit();
    await unwrap(markNoDispensing({ dispensingId: only.dispensingId, version: 1 }));
    expect(await status(only.dispensingId)).toMatchObject({ status: "TANPA_OBAT", completedByName: "Apoteker Uji" });
    expect(await prisma.auditLog.count({ where: { action: "dispensing.none", entityId: only.dispensingId } })).toBe(1);
  });

  it("buka kembali mencabut baris dari draf tagihan dan mengembalikan status Menunggu", async () => {
    const { appointmentId, dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId, version }));
    as("RESEPSIONIS");
    const { id: invoiceId } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(await linked(invoiceId)).toHaveLength(1);
    const invoiceVersion = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

    as("APOTEKER");
    await unwrap(reopenDispensing({ dispensingId }));
    expect(await status(dispensingId)).toMatchObject({ status: "MENUNGGU", completedAt: null, completedByName: null });
    expect(await linked(invoiceId)).toHaveLength(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version).toBe(invoiceVersion + 1);
    expect(await prisma.auditLog.count({ where: { action: "dispensing.reopen", entityId: dispensingId } })).toBe(1);
    expect(await reopenDispensing({ dispensingId })).toEqual({ ok: false, error: "Penyerahan ini masih menunggu." });
  });

  it("tidak bisa dibuka kembali setelah tagihan final", async () => {
    const { appointmentId, dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId, version }));
    as("RESEPSIONIS");
    const { id: invoiceId } = await unwrap(createInvoiceFromVisit(appointmentId));
    await unwrap(finalizeInvoice({ invoiceId, version: 1 }));
    as("APOTEKER");
    expect(await reopenDispensing({ dispensingId })).toEqual({
      ok: false,
      error: "Tagihan kunjungan ini sudah final. Penyerahan tidak bisa dibuka kembali.",
    });
    expect((await status(dispensingId)).status).toBe("SELESAI");
  });

  it("dua Apoteker menyelesaikan bersamaan: hanya satu berhasil, baris tagihan tidak ganda", async () => {
    const { appointmentId, dispensingId } = await visit();
    as("RESEPSIONIS");
    const { id: invoiceId } = await unwrap(createInvoiceFromVisit(appointmentId));
    const version = await addDrug(dispensingId, 1);
    const results = await Promise.all([completeDispensing({ dispensingId, version }), completeDispensing({ dispensingId, version })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await linked(invoiceId)).toHaveLength(1);
  });

  it("membuat tagihan bersamaan dengan penyelesaian: baris obat tidak hilang dan tidak ganda", async () => {
    const { appointmentId, dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    as("SUPER_ADMIN");
    const [created, completed] = await Promise.all([createInvoiceFromVisit(appointmentId), completeDispensing({ dispensingId, version })]);
    const { id: invoiceId } = await unwrap(Promise.resolve(created));

    const row = await status(dispensingId);
    if (completed.ok) {
      expect(row.status).toBe("SELESAI");
      expect(await linked(invoiceId)).toHaveLength(1);
    } else {
      // Kalah balapan: penyerahan tetap Menunggu dan tagihan tanpa baris obat; mengulang berhasil.
      expect(completed).toEqual({ ok: false, error: "Tagihan kunjungan ini baru berubah. Muat ulang halaman lalu coba lagi." });
      expect(row.status).toBe("MENUNGGU");
      expect(await linked(invoiceId)).toHaveLength(0);
      await unwrap(completeDispensing({ dispensingId, version }));
      expect(await linked(invoiceId)).toHaveLength(1);
    }
  });

  it("hak akses: Resepsionis, Dokter, dan Admin Keuangan tidak bisa menyelesaikan, menandai, atau membuka kembali", async () => {
    const { dispensingId } = await visit();
    for (const role of ["RESEPSIONIS", "DOKTER", "ADMIN_KEUANGAN"] as const) {
      as(role);
      await expect(completeDispensing({ dispensingId, version: 1 })).rejects.toThrow(/forbidden: dispense:manage/);
      await expect(markNoDispensing({ dispensingId, version: 1 })).rejects.toThrow(/forbidden: dispense:manage/);
      await expect(reopenDispensing({ dispensingId })).rejects.toThrow(/forbidden: dispense:manage/);
    }
    expect((await status(dispensingId)).status).toBe("MENUNGGU");
  });
});
```

Run: `npm run test:integration -- tests/integration/dispensing-lifecycle.test.ts`
Expected: FAIL (modul `dispensing-lifecycle` belum ada).

- [ ] **Step 2: Pembantu transaksi**

Tambahkan di `src/server/dispensing-store.ts` (impor tambahan di bagian atas: `import { lockInvoiceRow } from "@/server/invoice-store";`):

```ts
export const CONTEXT_CHANGED = "Tagihan kunjungan ini baru berubah. Muat ulang halaman lalu coba lagi.";

type ActiveInvoice = { id: string; status: "DRAF" | "FINAL" };

/** Tagihan aktif (bukan dibatalkan) kunjungan ini; tanpa kunci. */
export async function activeInvoiceOf(tx: Prisma.TransactionClient, appointmentId: string): Promise<ActiveInvoice | null> {
  const invoice = await tx.invoice.findFirst({
    where: { appointmentId, status: { not: "DIBATALKAN" } },
    select: { id: true, status: true },
  });
  return invoice ? { id: invoice.id, status: invoice.status === "FINAL" ? "FINAL" : "DRAF" } : null;
}

/**
 * Urutan kunci yang seragam: tagihan lebih dulu, lalu penyerahan. Tagihan aktif dibaca tanpa kunci,
 * dikunci, baris penyerahan dikunci, lalu tagihan aktif dibaca ulang; bila berubah di sela-sela,
 * aksi ditolak dan pengguna mengulang. Dengan begitu pembatalan tagihan (tagihan → penyerahan) dan
 * buka kembali (tagihan → penyerahan) tidak pernah saling menunggu secara silang.
 */
export async function lockDispensingContext(
  tx: Prisma.TransactionClient,
  dispensingId: string,
  appointmentId: string,
): Promise<{ invoice: ActiveInvoice | null }> {
  const before = await activeInvoiceOf(tx, appointmentId);
  if (before) await lockInvoiceRow(tx, before.id);
  await lockDispensingRow(tx, dispensingId);
  const after = await activeInvoiceOf(tx, appointmentId);
  if ((before?.id ?? null) !== (after?.id ?? null)) throw new UserFacingError(CONTEXT_CHANGED);
  return { invoice: after };
}

export type HandedLine = {
  kind: "BARANG";
  name: string;
  quantity: number;
  unitPrice: number;
  serviceId: null;
  encounterTreatmentId: null;
  itemId: string;
  dispensingLineId: string;
};

/** Baris tagihan dari penyerahan SELESAI (harga jual katalog saat ini); kosong untuk status lain. Panggil setelah baris dikunci. */
export async function handedInvoiceLines(tx: Prisma.TransactionClient, dispensingId: string): Promise<HandedLine[]> {
  const dispensing = await tx.dispensing.findUnique({
    where: { id: dispensingId },
    select: { status: true, lines: { orderBy: { sortOrder: "asc" }, select: { id: true, itemId: true, itemName: true, quantity: true } } },
  });
  if (!dispensing || dispensing.status !== "SELESAI") return [];
  const prices = new Map(
    (await tx.stockItem.findMany({ where: { id: { in: dispensing.lines.map((l) => l.itemId) } }, select: { id: true, sellPrice: true } })).map((item) => [
      item.id,
      item.sellPrice,
    ]),
  );
  return dispensing.lines.map((line) => {
    const unitPrice = prices.get(line.itemId);
    if (unitPrice === null || unitPrice === undefined) throw new UserFacingError(`Harga jual ${line.itemName} belum diisi.`);
    return {
      kind: "BARANG" as const,
      name: line.itemName,
      quantity: line.quantity,
      unitPrice,
      serviceId: null,
      encounterTreatmentId: null,
      itemId: line.itemId,
      dispensingLineId: line.id,
    };
  });
}

/** Menambahkan baris penyerahan ke draf tagihan (tagihan sudah dikunci pemanggil) dan menaikkan versi draf. */
export async function appendDispensingLines(tx: Prisma.TransactionClient, invoiceId: string, dispensingId: string): Promise<void> {
  const handed = await handedInvoiceLines(tx, dispensingId);
  const last = await tx.invoiceLine.aggregate({ where: { invoiceId }, _max: { sortOrder: true } });
  let order = (last._max.sortOrder ?? -1) + 1;
  for (const line of handed) {
    await tx.invoiceLine.create({ data: { ...line, invoiceId, sortOrder: order++ } });
  }
  await tx.invoice.update({ where: { id: invoiceId }, data: { version: { increment: 1 } } });
}

/** Mencabut baris penyerahan dari draf tagihan (tagihan sudah dikunci pemanggil) dan menaikkan versi draf. */
export async function removeDispensingLines(tx: Prisma.TransactionClient, invoiceId: string, dispensingId: string): Promise<void> {
  await tx.invoiceLine.deleteMany({ where: { invoiceId, dispensingLine: { dispensingId } } });
  await tx.invoice.update({ where: { id: invoiceId }, data: { version: { increment: 1 } } });
}
```

- [ ] **Step 3: Aksi siklus**

Buat `src/server/dispensing-lifecycle.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { shortageMessage, stockShortage, totalsByItem } from "@/lib/dispensing";
import { safeRevalidatePath } from "@/lib/revalidate";
import { stockFlags } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { appendDispensingLines, lockDispensingContext, removeDispensingLines, STALE_DISPENSING } from "@/server/dispensing-store";
import { requireCapability } from "@/server/session";

const ALREADY_PROCESSED = "Penyerahan ini sudah diproses. Muat ulang halaman.";

function revalidateDispensing(dispensingId: string, invoiceId?: string) {
  safeRevalidatePath("/admin/resep");
  safeRevalidatePath(`/admin/resep/${dispensingId}`);
  safeRevalidatePath("/admin");
  safeRevalidatePath("/admin/tagihan");
  if (invoiceId) safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

const SELECT = {
  appointmentId: true,
  branchId: true,
  status: true,
  version: true,
  appointment: { select: { patient: { select: { name: true } } } },
  lines: { orderBy: { sortOrder: "asc" as const }, select: { itemId: true, itemName: true, quantity: true } },
} as const;

/**
 * Selesai (spec penyerahan 4.2–4.3): obat dicek terhadap stok cabang, status menjadi Selesai, dan
 * barisnya masuk ke draf tagihan kunjungan bila ada (bila belum ada, terisi saat tagihan dibuat).
 */
export async function completeDispensing(input: { dispensingId: string; version: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input?.dispensingId ?? "");
    const today = witaDateString(new Date());

    const result = await prisma.$transaction(async (tx) => {
      const probe = await tx.dispensing.findUnique({ where: { id: dispensingId }, select: { appointmentId: true } });
      if (!probe) throw new UserFacingError("Penyerahan tidak ditemukan.");
      const { invoice } = await lockDispensingContext(tx, dispensingId, probe.appointmentId);
      const row = await tx.dispensing.findUniqueOrThrow({ where: { id: dispensingId }, select: SELECT });
      if (row.status !== "MENUNGGU") throw new UserFacingError(ALREADY_PROCESSED);
      if (row.version !== input.version) throw new UserFacingError(STALE_DISPENSING);
      if (row.lines.length === 0) throw new UserFacingError("Tambahkan obat dulu, atau pilih Tanpa obat.");

      const needed = totalsByItem(row.lines.map((l) => ({ itemId: l.itemId, itemName: l.itemName, quantity: l.quantity })));
      const batches = await tx.stockBatch.findMany({
        where: { itemId: { in: needed.map((n) => n.itemId) }, branchId: row.branchId, quantityRemaining: { gt: 0 } },
        select: { itemId: true, quantityRemaining: true, expiryDate: true, unitCost: true },
      });
      const available = new Map(needed.map((n) => [n.itemId, stockFlags(batches.filter((b) => b.itemId === n.itemId), 0, today).available]));
      const shortage = stockShortage(needed, available);
      if (shortage) throw new UserFacingError(shortageMessage(shortage));

      await tx.dispensing.update({
        where: { id: dispensingId },
        data: { status: "SELESAI", completedAt: new Date(), completedById: actor.staffId, completedByName: actor.name, version: { increment: 1 } },
      });
      if (invoice) {
        if (invoice.status !== "DRAF") throw new UserFacingError("Tagihan kunjungan ini sudah final. Muat ulang halaman.");
        await appendDispensingLines(tx, invoice.id, dispensingId);
      }
      return {
        invoiceId: invoice?.id,
        summary: `${row.appointment.patient?.name ?? "-"}: ${row.lines.map((l) => `${l.itemName} ×${l.quantity}`).join(", ")}`,
      };
    });

    await recordAudit({ actor, action: "dispensing.complete", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId, result.invoiceId);
  });
}

/** Tanpa obat (spec penyerahan 4.2): hanya bila daftar obat kosong; melepas penahanan finalisasi tagihan. */
export async function markNoDispensing(input: { dispensingId: string; version: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input?.dispensingId ?? "");

    const summary = await prisma.$transaction(async (tx) => {
      const probe = await tx.dispensing.findUnique({ where: { id: dispensingId }, select: { appointmentId: true } });
      if (!probe) throw new UserFacingError("Penyerahan tidak ditemukan.");
      await lockDispensingContext(tx, dispensingId, probe.appointmentId);
      const row = await tx.dispensing.findUniqueOrThrow({ where: { id: dispensingId }, select: SELECT });
      if (row.status !== "MENUNGGU") throw new UserFacingError(ALREADY_PROCESSED);
      if (row.version !== input.version) throw new UserFacingError(STALE_DISPENSING);
      if (row.lines.length > 0) throw new UserFacingError("Penyerahan ini punya obat. Hapus obatnya dulu, atau pilih Selesai.");
      await tx.dispensing.update({
        where: { id: dispensingId },
        data: { status: "TANPA_OBAT", completedAt: new Date(), completedById: actor.staffId, completedByName: actor.name, version: { increment: 1 } },
      });
      return row.appointment.patient?.name ?? "-";
    });

    await recordAudit({ actor, action: "dispensing.none", entity: "Dispensing", entityId: dispensingId, summary });
    revalidateDispensing(dispensingId);
  });
}

/**
 * Buka kembali (spec penyerahan 4.5): hanya bila tagihan kunjungan belum final. Baris asal penyerahan
 * dicabut dari draf tagihan, lalu penyerahan kembali Menunggu.
 */
export async function reopenDispensing(input: { dispensingId: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input?.dispensingId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const probe = await tx.dispensing.findUnique({ where: { id: dispensingId }, select: { appointmentId: true } });
      if (!probe) throw new UserFacingError("Penyerahan tidak ditemukan.");
      const { invoice } = await lockDispensingContext(tx, dispensingId, probe.appointmentId);
      const row = await tx.dispensing.findUniqueOrThrow({ where: { id: dispensingId }, select: SELECT });
      if (row.status === "MENUNGGU") throw new UserFacingError("Penyerahan ini masih menunggu.");
      if (invoice?.status === "FINAL") throw new UserFacingError("Tagihan kunjungan ini sudah final. Penyerahan tidak bisa dibuka kembali.");
      await tx.dispensing.update({
        where: { id: dispensingId },
        data: { status: "MENUNGGU", completedAt: null, completedById: null, completedByName: null, version: { increment: 1 } },
      });
      if (invoice) await removeDispensingLines(tx, invoice.id, dispensingId);
      return { invoiceId: invoice?.id, summary: row.appointment.patient?.name ?? "-" };
    });

    await recordAudit({ actor, action: "dispensing.reopen", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId, result.invoiceId);
  });
}
```

- [ ] **Step 4: Tagihan dari kunjungan ikut mengisi baris penyerahan**

Di `src/server/invoice-drafts.ts`:
1. Tambahkan impor `import { handedInvoiceLines, lockDispensingRow } from "@/server/dispensing-store";`.
2. Dalam `createInvoiceFromVisit`, ganti pemanggilan `prisma.invoice.create({ … })` (di dalam `try`) dengan transaksi:

```ts
    try {
      const created = await prisma.$transaction(async (tx) => {
        // Baris penyerahan dikunci dulu, supaya pembuatan tagihan dan penyelesaian penyerahan bergiliran
        // (spec penyerahan 4.3): yang kedua selalu melihat hasil yang pertama.
        const dispensing = await tx.dispensing.findUnique({ where: { appointmentId: id }, select: { id: true } });
        let handed: Awaited<ReturnType<typeof handedInvoiceLines>> = [];
        if (dispensing) {
          await lockDispensingRow(tx, dispensing.id);
          handed = await handedInvoiceLines(tx, dispensing.id);
        }
        const all = [...lines.map((line) => ({ ...line, dispensingLineId: null as string | null })), ...handed];
        return tx.invoice.create({
          data: {
            patientId: appointment.patientId!,
            appointmentId: id,
            branchId: appointment.branchId,
            createdById: actor.staffId,
            createdByName: actor.name,
            lines: { create: all.map((line, index) => ({ ...line, sortOrder: index })) },
          },
          select: { id: true },
        });
      });
```

   Sisa blok (`recordAudit` dengan `summary: ... ${lines.length} baris`, `revalidateInvoices`, `return`, dan `catch` untuk `isExclusionViolation`) tetap; ubah `${lines.length}` pada ringkasan audit menjadi `${lines.length}` + (bila ada baris penyerahan) tidak perlu diubah.

Run: `npm run test:integration -- tests/integration/dispensing-lifecycle.test.ts tests/integration/invoice-create.test.ts tests/integration/invoice-draft.test.ts tests/integration/invoice-lifecycle.test.ts`
Expected: PASS semua. (Uji "membuat tagihan bersamaan dengan penyelesaian" menerima dua hasil sah: menang dan kalah-lalu-ulang. Kalau yang kalah tidak pernah terjadi di mesin Anda, itu juga lulus.)

- [ ] **Step 5: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t5.log" 2>&1; grep -E "Test Files|Tests " "$WS/t5.log"; npx eslint src/server tests/integration/dispensing-lifecycle.test.ts; npx tsc --noEmit -p . > "$WS/t5-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server tests/integration/dispensing-lifecycle.test.ts
git commit -m "feat: complete, skip, and reopen dispensing and carry handed medicines into invoices"
```

---

### Task 6: Tagihan — penahanan finalisasi, baris terkunci, pelepasan saat batal, status penyerahan di rincian

**Files:**
- Modify: `src/server/invoice-lifecycle.ts`, `src/server/invoice-drafts.ts`, `src/server/invoice-read.ts`
- Test: `tests/integration/dispensing-invoice.test.ts`

**Interfaces:**
- Consumes: Task 1–5 (`seedDispensing`, `completeDispensing`, `reopenDispensing`, `markNoDispensing`, `addDispensingLine`, `createInvoiceFromVisit`, `finalizeInvoice`, `cancelInvoice`, `updateInvoiceLine`, `removeInvoiceLine`, `getInvoiceDetail`), `HOLD_MESSAGE` dan `DispensingStatusValue` (Task 2).
- Produces:
  - `finalizeInvoice` menolak tagihan yang kunjungannya punya penyerahan `MENUNGGU` dengan `HOLD_MESSAGE`, diperiksa setelah tagihan dikunci;
  - `updateInvoiceLine` menolak perubahan jumlah dan `removeInvoiceLine` menolak penghapusan baris yang punya `dispensingLineId`; harga tetap bisa diubah;
  - `cancelInvoice` mengosongkan `dispensingLineId` pada semua baris tagihan yang dibatalkan, dan untuk tagihan `FINAL` mengembalikan penyerahan kunjungan itu ke `MENUNGGU`;
  - `InvoiceLineRow.fromDispensing: boolean` dan `InvoiceDetail.dispensing: DispensingStatusValue | null` (status saja, tanpa isi catatan).

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/dispensing-invoice.test.ts` (pola mock aktor dan `beforeAll` sama dengan `dispensing-lifecycle.test.ts`; slug `tagihan-penyerahan`, WA `6281200008904`, batch awal 50 obat dengan nomor faktur `TP-1`). Impor yang dipakai berkas ini (di atas `vi.hoisted`/`vi.mock` yang sama dengan berkas lifecycle):

```ts
import { addDispensingLine } from "@/server/dispensing-drafts";
import { completeDispensing, markNoDispensing, reopenDispensing } from "@/server/dispensing-lifecycle";
import { createDirectSale, createInvoiceFromVisit, removeInvoiceLine, updateInvoiceLine } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";
```

Pembantu (`as(role)` sama dengan berkas lifecycle):

```ts
  async function visit(note = "Amoxicillin") {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: note });
    const { id } = await seedDispensing(world, appointmentId);
    return { appointmentId, dispensingId: id };
  }
  async function handed(dispensingId: string, qty = 2) {
    as("APOTEKER");
    const added = await unwrap(addDispensingLine({ dispensingId, version: 1, itemId: world.drugId, quantity: qty, usage: "3 x 1" }));
    await unwrap(completeDispensing({ dispensingId, version: added.version }));
  }
  const draftOf = async (appointmentId: string) => {
    as("RESEPSIONIS");
    return (await unwrap(createInvoiceFromVisit(appointmentId))).id;
  };
  const lineOf = (invoiceId: string) => prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, dispensingLineId: { not: null } } });
  const stockLeft = async () =>
    (await prisma.stockBatch.aggregate({ where: { itemId: world.drugId, branchId: world.branchId }, _sum: { quantityRemaining: true } }))._sum.quantityRemaining;
```

Kasus (semuanya di `describe("tagihan dan penyerahan obat", …)`):

```ts
  it("finalisasi tertahan selama penyerahan Menunggu; lepas setelah Tanpa obat atau Selesai", async () => {
    const waiting = await visit();
    const invoiceId = await draftOf(waiting.appointmentId);
    expect(await finalizeInvoice({ invoiceId, version: 1 })).toEqual({ ok: false, error: "Menunggu Apoteker menyerahkan obat." });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("DRAF");

    as("APOTEKER");
    const dispensing = await prisma.dispensing.findUniqueOrThrow({ where: { id: waiting.dispensingId } });
    await unwrap(markNoDispensing({ dispensingId: waiting.dispensingId, version: dispensing.version }));
    as("RESEPSIONIS");
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect((await finalizeInvoice({ invoiceId, version: invoice.version })).ok).toBe(true);

    const done = await visit();
    await handed(done.dispensingId);
    const id2 = await draftOf(done.appointmentId);
    const v2 = (await prisma.invoice.findUniqueOrThrow({ where: { id: id2 } })).version;
    expect((await finalizeInvoice({ invoiceId: id2, version: v2 })).ok).toBe(true);
  });

  it("penjualan langsung dan kunjungan tanpa penyerahan tidak tertahan", async () => {
    const { appointmentId } = await finalVisit(world);
    const invoiceId = await draftOf(appointmentId);
    expect((await finalizeInvoice({ invoiceId, version: 1 })).ok).toBe(true);
  });

  it("resepsionis tidak bisa menghapus atau mengubah jumlah baris obat; harga bisa diubah dengan catatan", async () => {
    const { appointmentId, dispensingId } = await visit();
    await handed(dispensingId, 2);
    const invoiceId = await draftOf(appointmentId);
    const line = await lineOf(invoiceId);
    let version = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

    expect(await removeInvoiceLine({ invoiceId, version, lineId: line.id })).toEqual({
      ok: false,
      error: "Obat dari penyerahan tidak bisa dihapus. Minta Apoteker membuka kembali penyerahan.",
    });
    expect(await updateInvoiceLine({ invoiceId, version, lineId: line.id, quantity: 5, unitPrice: 2000, priceNote: "" })).toEqual({
      ok: false,
      error: "Jumlah obat dari penyerahan tidak bisa diubah. Minta Apoteker membuka kembali penyerahan.",
    });
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ quantity: 2, unitPrice: 2000 });
    version = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
    await unwrap(updateInvoiceLine({ invoiceId, version, lineId: line.id, quantity: 2, unitPrice: 1500, priceNote: "Promo apotek" }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ unitPrice: 1500, priceNote: "Promo apotek" });
  });

  it("batalkan draf: baris dilepas; penyerahan tetap Selesai; tagihan baru terisi lagi", async () => {
    const { appointmentId, dispensingId } = await visit();
    await handed(dispensingId);
    const first = await draftOf(appointmentId);
    await unwrap(cancelInvoice({ invoiceId: first, reason: "Salah buat" }));
    expect(await prisma.invoiceLine.count({ where: { invoiceId: first, dispensingLineId: { not: null } } })).toBe(0);
    expect((await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } })).status).toBe("SELESAI");
    const second = await draftOf(appointmentId);
    expect((await lineOf(second)).quantity).toBe(2);
  });

  it("batalkan tagihan final: penyerahan kembali Menunggu, stok kembali, dan ditagih sekali saja", async () => {
    const { appointmentId, dispensingId } = await visit();
    await handed(dispensingId, 2);
    const first = await draftOf(appointmentId);
    const before = await stockLeft();
    const v1 = (await prisma.invoice.findUniqueOrThrow({ where: { id: first } })).version;
    await unwrap(finalizeInvoice({ invoiceId: first, version: v1 }));
    expect(await stockLeft()).toBe((before ?? 0) - 2);

    await unwrap(cancelInvoice({ invoiceId: first, reason: "Pelanggan batal" }));
    expect(await stockLeft()).toBe(before);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: first, dispensingLineId: { not: null } } })).toBe(0);
    expect(await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } })).toMatchObject({ status: "MENUNGGU", completedAt: null });

    // Tagihan baru: tanpa baris obat dan tertahan, sampai Apoteker menyerahkan lagi.
    const second = await draftOf(appointmentId);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: second, dispensingLineId: { not: null } } })).toBe(0);
    const v2 = (await prisma.invoice.findUniqueOrThrow({ where: { id: second } })).version;
    expect(await finalizeInvoice({ invoiceId: second, version: v2 })).toEqual({ ok: false, error: "Menunggu Apoteker menyerahkan obat." });
    as("APOTEKER");
    const d = await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } });
    await unwrap(completeDispensing({ dispensingId, version: d.version }));
    expect(await prisma.invoiceLine.count({ where: { invoiceId: second, dispensingLineId: { not: null } } })).toBe(1);
    as("RESEPSIONIS");
    const v3 = (await prisma.invoice.findUniqueOrThrow({ where: { id: second } })).version;
    await unwrap(finalizeInvoice({ invoiceId: second, version: v3 }));
    expect(await stockLeft()).toBe((before ?? 0) - 2);
  });

  it("buka kembali dan finalisasi bersamaan: salah satu menang, tagihan final tidak pernah memuat baris obat yang dibuka kembali", async () => {
    const { appointmentId, dispensingId } = await visit();
    await handed(dispensingId);
    const invoiceId = await draftOf(appointmentId);
    const version = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
    as("SUPER_ADMIN");
    const [reopened, finalized] = await Promise.all([reopenDispensing({ dispensingId }), finalizeInvoice({ invoiceId, version })]);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const dispensing = await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } });
    const linked = await prisma.invoiceLine.count({ where: { invoiceId, dispensingLineId: { not: null } } });
    expect(reopened.ok !== finalized.ok).toBe(true);
    if (finalized.ok) {
      expect(invoice.status).toBe("FINAL");
      expect(dispensing.status).toBe("SELESAI");
      expect(linked).toBe(1);
    } else {
      expect(invoice.status).toBe("DRAF");
      expect(dispensing.status).toBe("MENUNGGU");
      expect(linked).toBe(0);
    }
  });

  it("rincian tagihan: status penyerahan dan tanda baris obat, tanpa isi Catatan untuk Apoteker", async () => {
    const { appointmentId, dispensingId } = await visit("RAHASIA-CATATAN-DOKTER");
    await handed(dispensingId);
    const invoiceId = await draftOf(appointmentId);
    const detail = await getInvoiceDetail(invoiceId);
    expect(detail?.dispensing).toBe("SELESAI");
    expect(detail?.lines.filter((l) => l.fromDispensing)).toHaveLength(1);
    expect(detail?.lines.filter((l) => !l.fromDispensing).length).toBeGreaterThan(0);
    expect(JSON.stringify(detail)).not.toContain("RAHASIA-CATATAN-DOKTER");

    const direct = await unwrap(createDirectSale({ patientId: world.patientId }));
    expect((await getInvoiceDetail(direct.id))?.dispensing).toBeNull();
  });
```

Run: `npm run test:integration -- tests/integration/dispensing-invoice.test.ts`
Expected: FAIL (penahanan belum ada; `fromDispensing`/`dispensing` belum ada di rincian).

- [ ] **Step 2: Penahanan dan pelepasan**

Di `src/server/invoice-lifecycle.ts`:
1. Impor `import { HOLD_MESSAGE } from "@/lib/dispensing";`.
2. Di `finalizeInvoice`, tambahkan `appointmentId: true,` ke `select` tagihan (setelah `branchId: true,`), dan tepat sesudah baris `if (invoice.version !== input.version) throw new UserFacingError(STALE_DRAFT);` (sebelum pemeriksaan "Tagihan kosong"):

```ts
      // Penyerahan obat harus selesai lebih dulu (spec penyerahan 4.4); status dibaca setelah tagihan dikunci.
      if (invoice.appointmentId) {
        const hold = await tx.dispensing.findUnique({ where: { appointmentId: invoice.appointmentId }, select: { status: true } });
        if (hold?.status === "MENUNGGU") throw new UserFacingError(HOLD_MESSAGE);
      }
```

3. Di `cancelInvoice`, tambahkan `appointmentId: true,` ke `select` tagihan, dan tepat sebelum `await tx.invoice.update({ where: { id: invoiceId }, data: { status: "DIBATALKAN", … } });`:

```ts
      // Baris asal penyerahan dilepas supaya penyerahan bisa ditagih lagi; penyerahan tagihan final kembali Menunggu
      // (spec penyerahan 4.6). Urutan kunci tetap tagihan → penyerahan.
      await tx.invoiceLine.updateMany({ where: { invoiceId, dispensingLineId: { not: null } }, data: { dispensingLineId: null } });
      if (invoice.status === "FINAL" && invoice.appointmentId) {
        await tx.dispensing.updateMany({
          where: { appointmentId: invoice.appointmentId, status: { not: "MENUNGGU" } },
          data: { status: "MENUNGGU", completedAt: null, completedById: null, completedByName: null, version: { increment: 1 } },
        });
      }
```

Di `src/server/invoice-drafts.ts`:
1. Tambahkan konstanta di bawah impor:

```ts
const DISPENSED_QUANTITY = "Jumlah obat dari penyerahan tidak bisa diubah. Minta Apoteker membuka kembali penyerahan.";
const DISPENSED_REMOVE = "Obat dari penyerahan tidak bisa dihapus. Minta Apoteker membuka kembali penyerahan.";
```

2. `updateInvoiceLine`: tambahkan `quantity: true, dispensingLineId: true` ke `select` baris dan, tepat sesudah `if (!line) throw new UserFacingError("Baris tidak ditemukan.");`, `if (line.dispensingLineId && input.quantity !== line.quantity) throw new UserFacingError(DISPENSED_QUANTITY);`.
3. `removeInvoiceLine`: ubah `select` menjadi `{ id: true, name: true, dispensingLineId: true }` dan sesudah pemeriksaan `!line`, `if (line.dispensingLineId) throw new UserFacingError(DISPENSED_REMOVE);`.

- [ ] **Step 3: Rincian tagihan**

Di `src/server/invoice-read.ts`:
1. Tambah tipe: `import type { DispensingStatusValue } from "@/lib/dispensing";`; pada `InvoiceLineRow` tambahkan sesudah `catalogLinked: boolean;`: `/** Berasal dari penyerahan Apoteker: jumlah terkunci dan tidak bisa dihapus resepsionis. */\n  fromDispensing: boolean;`; pada `InvoiceDetail` tambahkan sesudah `appointmentId: string | null;`: `/** Status penyerahan obat kunjungan ini; null bila tidak ada. Tidak pernah memuat isi catatan. */\n  dispensing: DispensingStatusValue | null;`.
2. `select` tagihan: ubah `appointment: { select: { startAt: true } },` menjadi `appointment: { select: { startAt: true, dispensing: { select: { status: true } } } },` dan tambahkan `dispensingLineId: true,` ke `select` baris.
3. Pada pemetaan `lines` tambahkan `fromDispensing: line.dispensingLineId !== null,` (setelah `catalogLinked`), dan pada objek hasil tambahkan `dispensing: invoice.appointment?.dispensing?.status ?? null,` sesudah `appointmentId: invoice.appointmentId,`.
4. Perbaiki literal `InvoiceLineRow`/`InvoiceDetail` di uji komponen yang ditandai `tsc` (`tests/unit/invoice-draft-editor.test.tsx`, `tests/unit/invoice-final-view.test.tsx`): tambahkan `fromDispensing: false` pada setiap baris dan `dispensing: null` pada detail.

Run: `npm run test:integration -- tests/integration/dispensing-invoice.test.ts tests/integration/dispensing-lifecycle.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/invoice-draft.test.ts tests/integration/invoice-create.test.ts tests/integration/invoice-payments.test.ts`
Expected: PASS semua.

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t6.log" 2>&1; grep -E "Test Files|Tests " "$WS/t6.log"; npx eslint src tests/unit tests/integration; npx tsc --noEmit -p . > "$WS/t6-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src tests
git commit -m "feat: hold invoice finalization until dispensing is done and lock dispensed lines"
```

---

### Task 7: UI Apoteker — antrean Resep, rincian, etiket, menu, dan dasbor

**Files:**
- Create: `src/components/admin/dispensing/dispensing-status-badge.tsx`, `dispensing-table.tsx`, `use-dispensing-action.ts`, `dispensing-editor.tsx`, `dispensing-summary.tsx`, `reopen-dispensing-button.tsx`, `dispensing-label.tsx`, `dispensing-tiles.tsx`
- Create: `src/app/(admin)/admin/resep/page.tsx`, `src/app/(admin)/admin/resep/[id]/page.tsx`, `src/app/(admin)/admin/resep/[id]/etiket/page.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/page.tsx`, `tests/unit/admin-dashboard-page.test.tsx`
- Test: `tests/unit/dispensing-ui.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`DISPENSING_STATUS_LABEL`, `DISPENSING_VIEWS`, `isDispensingView`, `validateDispensingLine`), Task 4 (`listDispensings`, `getDispensingDetail`, `listDispenseItems`, `countPendingDispensings`, `addDispensingLine`, `updateDispensingLine`, `removeDispensingLine`, tipe `DispensingRow`/`DispensingDetail`/`DispenseItem`), Task 5 (`completeDispensing`, `markNoDispensing`, `reopenDispensing`), `PrintButton` (`@/components/admin/billing/print-button`), `CLINIC_NAME`.
- Produces: halaman `/admin/resep?lihat=<DispensingView>` (bawaan `MENUNGGU`), `/admin/resep/[id]`, `/admin/resep/[id]/etiket`; komponen `DispensingStatusBadge({ status })`, `DispensingTable({ rows })`, `DispensingEditor({ detail, items })`, `DispensingSummary({ detail })`, `ReopenDispensingButton({ dispensingId })`, `DispensingLabel({ detail, clinicName })`, `DispensingTiles({ pending })`; prop `pendingDispensing?: number` pada `AppSidebar`.

- [ ] **Step 1: Tulis uji komponen (gagal)**

Buat `tests/unit/dispensing-ui.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DispensingEditor } from "@/components/admin/dispensing/dispensing-editor";
import { DispensingLabel } from "@/components/admin/dispensing/dispensing-label";
import { DispensingSummary } from "@/components/admin/dispensing/dispensing-summary";
import { DispensingTable } from "@/components/admin/dispensing/dispensing-table";
import { DispensingTiles } from "@/components/admin/dispensing/dispensing-tiles";
import { ReopenDispensingButton } from "@/components/admin/dispensing/reopen-dispensing-button";
import type { DispenseItem, DispensingDetail, DispensingRow } from "@/server/dispensing-read";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  addDispensingLine: vi.fn(),
  updateDispensingLine: vi.fn(),
  removeDispensingLine: vi.fn(),
  completeDispensing: vi.fn(),
  markNoDispensing: vi.fn(),
  reopenDispensing: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/dispensing-drafts", () => ({
  addDispensingLine: mocks.addDispensingLine,
  updateDispensingLine: mocks.updateDispensingLine,
  removeDispensingLine: mocks.removeDispensingLine,
}));
vi.mock("@/server/dispensing-lifecycle", () => ({
  completeDispensing: mocks.completeDispensing,
  markNoDispensing: mocks.markNoDispensing,
  reopenDispensing: mocks.reopenDispensing,
}));

const items: DispenseItem[] = [
  { id: "it1", code: "AMX", name: "Amoxicillin", unit: "kapsul", available: 40 },
  { id: "it2", code: "VITC", name: "Vitamin C", unit: "tablet", available: 0 },
];

function detail(patch: Partial<DispensingDetail> = {}): DispensingDetail {
  return {
    id: "d1",
    version: 3,
    status: "MENUNGGU",
    appointmentId: "a1",
    branchId: "b1",
    branchName: "Manado",
    startAt: new Date("2026-10-07T03:00:00Z"),
    patientName: "Ani Uji",
    note: "Amoxicillin 3x1 selama 5 hari",
    completedAt: null,
    completedByName: null,
    lines: [{ id: "l1", itemId: "it1", itemName: "Amoxicillin", quantity: 15, usage: "3 x 1 sesudah makan" }],
    invoiceState: "NONE",
    canReopen: false,
    ...patch,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("antrean resep", () => {
  const row: DispensingRow = {
    id: "d1",
    status: "MENUNGGU",
    patientName: "Ani Uji",
    branchName: "Manado",
    startAt: new Date("2026-10-07T03:00:00Z"),
    createdAt: new Date("2026-10-07T03:30:00Z"),
    completedAt: null,
    lineCount: 0,
  };

  it("menampilkan pasien, cabang, dan tautan ke rincian", () => {
    render(<DispensingTable rows={[row]} />);
    expect(screen.getByRole("link", { name: "Ani Uji" })).toHaveAttribute("href", "/admin/resep/d1");
    expect(screen.getByText("Manado")).toBeInTheDocument();
    expect(screen.getByText("Menunggu")).toBeInTheDocument();
  });

  it("kosong menampilkan keterangan", () => {
    render(<DispensingTable rows={[]} />);
    expect(screen.getByText("Tidak ada resep di tampilan ini.")).toBeInTheDocument();
  });

  it("kotak dasbor Resep menunggu", () => {
    render(<DispensingTiles pending={3} />);
    const tile = screen.getByRole("link", { name: /Resep menunggu/ });
    expect(tile).toHaveAttribute("href", "/admin/resep");
    expect(tile).toHaveTextContent("3");
  });
});

describe("editor penyerahan", () => {
  it("menampilkan Catatan untuk Apoteker (hanya baca) dan daftar obat", () => {
    render(<DispensingEditor detail={detail()} items={items} />);
    expect(screen.getByText("Amoxicillin 3x1 selama 5 hari")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah Amoxicillin")).toHaveValue(15);
    expect(screen.getByLabelText("Aturan pakai Amoxicillin")).toHaveValue("3 x 1 sesudah makan");
  });

  it("menambah obat dengan nomor versi; aturan pakai kosong ditolak di layar", async () => {
    mocks.addDispensingLine.mockResolvedValue({ ok: true, data: { version: 4 } });
    render(<DispensingEditor detail={detail({ lines: [] })} items={items} />);
    await userEvent.selectOptions(screen.getByLabelText("Obat"), "it1");
    await userEvent.clear(screen.getByLabelText("Jumlah"));
    await userEvent.type(screen.getByLabelText("Jumlah"), "10");
    await userEvent.click(screen.getByRole("button", { name: "+ Tambah obat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Isi aturan pakai.");
    expect(mocks.addDispensingLine).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Aturan pakai"), "2 x 1");
    await userEvent.click(screen.getByRole("button", { name: "+ Tambah obat" }));
    await waitFor(() =>
      expect(mocks.addDispensingLine).toHaveBeenCalledWith({ dispensingId: "d1", version: 3, itemId: "it1", quantity: 10, usage: "2 x 1" }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("obat yang stoknya habis tidak bisa dipilih", () => {
    render(<DispensingEditor detail={detail()} items={items} />);
    expect(screen.getByRole("option", { name: /Vitamin C/ })).toBeDisabled();
  });

  it("menyimpan dan menghapus baris dengan nomor versi", async () => {
    mocks.updateDispensingLine.mockResolvedValue({ ok: true, data: { version: 4 } });
    mocks.removeDispensingLine.mockResolvedValue({ ok: true, data: { version: 5 } });
    render(<DispensingEditor detail={detail()} items={items} />);
    const quantity = screen.getByLabelText("Jumlah Amoxicillin");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "20");
    await userEvent.click(screen.getByRole("button", { name: "Simpan Amoxicillin" }));
    await waitFor(() =>
      expect(mocks.updateDispensingLine).toHaveBeenCalledWith({ dispensingId: "d1", version: 3, lineId: "l1", quantity: 20, usage: "3 x 1 sesudah makan" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Hapus Amoxicillin" }));
    await waitFor(() => expect(mocks.removeDispensingLine).toHaveBeenCalledWith({ dispensingId: "d1", version: 3, lineId: "l1" }));
  });

  it("Selesai memanggil server dengan versi; pesan stok kurang dari server ditampilkan", async () => {
    mocks.completeDispensing.mockResolvedValue({ ok: false, error: "Stok Amoxicillin tidak cukup (tersedia 8)." });
    render(<DispensingEditor detail={detail()} items={items} />);
    await userEvent.click(screen.getByRole("button", { name: "Selesai" }));
    await waitFor(() => expect(mocks.completeDispensing).toHaveBeenCalledWith({ dispensingId: "d1", version: 3 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stok Amoxicillin tidak cukup (tersedia 8).");
  });

  it("Selesai nonaktif tanpa obat; Tanpa obat nonaktif bila ada obat", async () => {
    mocks.markNoDispensing.mockResolvedValue({ ok: true, data: undefined });
    const { rerender } = render(<DispensingEditor detail={detail({ lines: [] })} items={items} />);
    expect(screen.getByRole("button", { name: "Selesai" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Tanpa obat" }));
    await waitFor(() => expect(mocks.markNoDispensing).toHaveBeenCalledWith({ dispensingId: "d1", version: 3 }));
    rerender(<DispensingEditor detail={detail()} items={items} />);
    expect(screen.getByRole("button", { name: "Tanpa obat" })).toBeDisabled();
  });
});

describe("ringkasan, buka kembali, dan etiket", () => {
  const done = detail({
    status: "SELESAI",
    completedAt: new Date("2026-10-07T04:00:00Z"),
    completedByName: "Apoteker Uji",
    canReopen: true,
  });

  it("ringkasan menampilkan obat, tautan etiket, dan Buka kembali bila boleh", () => {
    render(<DispensingSummary detail={done} />);
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cetak etiket" })).toHaveAttribute("href", "/admin/resep/d1/etiket");
    expect(screen.getByRole("button", { name: "Buka kembali" })).toBeInTheDocument();
  });

  it("tanpa hak buka kembali (tagihan final) tombolnya tidak ada dan alasannya ditulis", () => {
    render(<DispensingSummary detail={{ ...done, canReopen: false, invoiceState: "FINAL" }} />);
    expect(screen.queryByRole("button", { name: "Buka kembali" })).toBeNull();
    expect(screen.getByText(/tagihan sudah final/i)).toBeInTheDocument();
  });

  it("Buka kembali memanggil server", async () => {
    mocks.reopenDispensing.mockResolvedValue({ ok: true, data: undefined });
    render(<ReopenDispensingButton dispensingId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Buka kembali" }));
    await waitFor(() => expect(mocks.reopenDispensing).toHaveBeenCalledWith({ dispensingId: "d1" }));
  });

  it("etiket memuat klinik, pasien, obat, jumlah, dan aturan pakai, tanpa harga", () => {
    render(<DispensingLabel detail={done} clinicName="SunDY Clinic" />);
    expect(screen.getByText("SunDY Clinic")).toBeInTheDocument();
    expect(screen.getByText("Ani Uji")).toBeInTheDocument();
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText(/15/)).toBeInTheDocument();
    expect(screen.getByText("3 x 1 sesudah makan")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Rp");
    expect(document.body.textContent).not.toContain("Amoxicillin 3x1 selama 5 hari");
  });
});
```

Run: `npx vitest run tests/unit/dispensing-ui.test.tsx`
Expected: FAIL (komponen belum ada).

- [ ] **Step 2: Komponen**

`src/components/admin/dispensing/dispensing-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { DISPENSING_STATUS_LABEL, type DispensingStatusValue } from "@/lib/dispensing";

export function DispensingStatusBadge({ status }: { status: DispensingStatusValue }) {
  return <Badge variant={status === "MENUNGGU" ? "outline" : "default"}>{DISPENSING_STATUS_LABEL[status]}</Badge>;
}
```

`src/components/admin/dispensing/dispensing-table.tsx`:

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear } from "@/lib/format";
import type { DispensingRow } from "@/server/dispensing-read";
import { EmptyState } from "../page-layout";
import { DispensingStatusBadge } from "./dispensing-status-badge";

/** Antrean resep (spec penyerahan 6). */
export function DispensingTable({ rows }: { rows: DispensingRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada resep di tampilan ini.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pasien</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead>Kunjungan</TableHead>
          <TableHead className="text-right">Obat</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/admin/resep/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.patientName}
              </Link>
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDateWithYear(row.startAt)}</TableCell>
            <TableCell className="text-right">{row.lineCount}</TableCell>
            <TableCell>
              <DispensingStatusBadge status={row.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

`src/components/admin/dispensing/dispensing-tiles.tsx`:

```tsx
import { StatTile } from "../stat-tile";

/** Kotak Resep menunggu di dasbor Apoteker (spec penyerahan 6). */
export function DispensingTiles({ pending }: { pending: number }) {
  return (
    <section aria-label="Resep" className="grid gap-4 sm:grid-cols-2">
      <StatTile label="Resep menunggu" value={pending} note="kunjungan" href="/admin/resep" attention={pending > 0} />
    </section>
  );
}
```

`src/components/admin/dispensing/use-dispensing-action.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";

/** Jalankan aksi server: tampilkan kesalahan apa adanya, muat ulang halaman bila berhasil. */
export function useDispensingAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run<T>(action: () => Promise<ActionResult<T>>, onDone?: (data: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.(result.data);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }
  return { run, error, setError, pending };
}
```

`src/components/admin/dispensing/dispensing-editor.tsx` (client): bagian atas menampilkan `detail.note` di dalam `<p className="whitespace-pre-wrap">` berjudul "Catatan untuk Apoteker" (hanya baca), lalu tabel baris (komponen `LineRow` dengan input `Jumlah {itemName}` bertipe number dan `Aturan pakai {itemName}`, tombol `Simpan {itemName}` dan `Hapus {itemName}`), lalu `<fieldset>` "Tambah obat" berisi `select` berlabel "Obat" (opsi `"{name} ({code}) — sisa {available} {unit}"`, `disabled` bila `available <= 0`), input "Jumlah" (default "1"), input "Aturan pakai", tombol "+ Tambah obat"; di bawah `role="alert"` untuk galat dan tombol "Selesai" (`disabled` bila `detail.lines.length === 0`) dan "Tanpa obat" (`disabled` bila ada baris). Validasi lokal memakai `validateDispensingLine` sebelum memanggil server. Kode lengkap:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validateDispensingLine } from "@/lib/dispensing";
import { addDispensingLine, removeDispensingLine, updateDispensingLine } from "@/server/dispensing-drafts";
import { completeDispensing, markNoDispensing } from "@/server/dispensing-lifecycle";
import type { DispenseItem, DispensingDetail } from "@/server/dispensing-read";
import { useDispensingAction } from "./use-dispensing-action";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function LineRow({
  detail,
  line,
  disabled,
  run,
  fail,
}: {
  detail: DispensingDetail;
  line: DispensingDetail["lines"][number];
  disabled: boolean;
  run: ReturnType<typeof useDispensingAction>["run"];
  fail: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [usage, setUsage] = useState(line.usage);

  function save() {
    const checked = validateDispensingLine({ itemId: line.itemId, quantity: Number(quantity), usage });
    if (!checked.ok) return fail(checked.message);
    run(() =>
      updateDispensingLine({ dispensingId: detail.id, version: detail.version, lineId: line.id, quantity: checked.value.quantity, usage: checked.value.usage }),
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{line.itemName}</TableCell>
      <TableCell className="w-28">
        <Input aria-label={`Jumlah ${line.itemName}`} type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input aria-label={`Aturan pakai ${line.itemName}`} value={usage} onChange={(e) => setUsage(e.target.value)} />
      </TableCell>
      <TableCell className="space-x-1 whitespace-nowrap text-right">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={save} aria-label={`Simpan ${line.itemName}`}>
          Simpan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          aria-label={`Hapus ${line.itemName}`}
          onClick={() => run(() => removeDispensingLine({ dispensingId: detail.id, version: detail.version, lineId: line.id }))}
        >
          Hapus
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Formulir penyerahan Menunggu (spec penyerahan 4.2): catatan dokter, daftar obat, lalu Selesai atau Tanpa obat. */
export function DispensingEditor({ detail, items }: { detail: DispensingDetail; items: DispenseItem[] }) {
  const { run, error, setError, pending } = useDispensingAction();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [usage, setUsage] = useState("");

  function add() {
    const input = { itemId, quantity: Number(quantity), usage };
    const checked = validateDispensingLine(input);
    if (!checked.ok) return setError(checked.message);
    run(
      () => addDispensingLine({ dispensingId: detail.id, version: detail.version, ...checked.value }),
      () => {
        setItemId("");
        setQuantity("1");
        setUsage("");
      },
    );
  }

  return (
    <div className="space-y-6">
      <section aria-label="Catatan untuk Apoteker" className="space-y-1 rounded-md border bg-muted/30 p-3">
        <h2 className="text-sm font-medium">Catatan untuk Apoteker</h2>
        <p className="whitespace-pre-wrap text-sm">{detail.note || "Tidak ada catatan."}</p>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Obat</TableHead>
            <TableHead>Jumlah</TableHead>
            <TableHead>Aturan pakai</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                Belum ada obat. Tambahkan di bawah, atau pilih Tanpa obat.
              </TableCell>
            </TableRow>
          ) : (
            detail.lines.map((line) => <LineRow key={`${line.id}-${detail.version}`} detail={detail} line={line} disabled={pending} run={run} fail={setError} />)
          )}
        </TableBody>
      </Table>

      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Tambah obat</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr]">
          <div className="space-y-1">
            <Label htmlFor="dispense-item">Obat</Label>
            <select id="dispense-item" className={selectClass} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Pilih obat…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id} disabled={item.available <= 0}>
                  {item.name} ({item.code}) — sisa {item.available} {item.unit}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dispense-quantity">Jumlah</Label>
            <Input id="dispense-quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dispense-usage">Aturan pakai</Label>
            <Input id="dispense-usage" value={usage} onChange={(e) => setUsage(e.target.value)} placeholder="mis. 3 x 1 sesudah makan" />
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={pending}>
          + Tambah obat
        </Button>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || detail.lines.length > 0}
          onClick={() =>
            run(() => markNoDispensing({ dispensingId: detail.id, version: detail.version }), () => toast.success("Ditandai tanpa obat."))
          }
        >
          Tanpa obat
        </Button>
        <Button
          type="button"
          disabled={pending || detail.lines.length === 0}
          onClick={() => run(() => completeDispensing({ dispensingId: detail.id, version: detail.version }), () => toast.success("Penyerahan selesai."))}
        >
          Selesai
        </Button>
      </div>
    </div>
  );
}
```

`src/components/admin/dispensing/reopen-dispensing-button.tsx`:

```tsx
"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reopenDispensing } from "@/server/dispensing-lifecycle";
import { useDispensingAction } from "./use-dispensing-action";

/** Buka kembali penyerahan (spec penyerahan 4.5); baris asal penyerahan di draf tagihan dicabut. */
export function ReopenDispensingButton({ dispensingId }: { dispensingId: string }) {
  const { run, error, pending } = useDispensingAction();
  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => reopenDispensing({ dispensingId }), () => toast.success("Penyerahan dibuka kembali."))}>
        Buka kembali
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

`src/components/admin/dispensing/dispensing-summary.tsx`:

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear } from "@/lib/format";
import type { DispensingDetail } from "@/server/dispensing-read";
import { DispensingStatusBadge } from "./dispensing-status-badge";
import { ReopenDispensingButton } from "./reopen-dispensing-button";

/** Penyerahan yang sudah diproses (Selesai atau Tanpa obat). */
export function DispensingSummary({ detail }: { detail: DispensingDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <DispensingStatusBadge status={detail.status} />
        {detail.completedAt && (
          <span className="text-muted-foreground">
            {formatDateWithYear(detail.completedAt)} oleh {detail.completedByName}
          </span>
        )}
      </div>
      {detail.lines.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obat</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Aturan pakai</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.itemName}</TableCell>
                <TableCell className="text-right">{line.quantity}</TableCell>
                <TableCell>{line.usage}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {detail.lines.length > 0 && (
          <Link href={`/admin/resep/${detail.id}/etiket`} className="text-sm underline underline-offset-4">
            Cetak etiket
          </Link>
        )}
        {detail.canReopen ? (
          <ReopenDispensingButton dispensingId={detail.id} />
        ) : (
          <p className="text-sm text-muted-foreground">Tidak bisa dibuka kembali karena tagihan sudah final.</p>
        )}
      </div>
    </div>
  );
}
```

`src/components/admin/dispensing/dispensing-label.tsx` (server-compatible):

```tsx
import { formatDateWithYear } from "@/lib/format";
import type { DispensingDetail } from "@/server/dispensing-read";

/** Etiket obat untuk customer (spec penyerahan 6): tanpa harga dan tanpa data klinis. */
export function DispensingLabel({ detail, clinicName }: { detail: DispensingDetail; clinicName: string }) {
  return (
    <article aria-label="Etiket obat" className="mx-auto max-w-md space-y-3 rounded-md border p-4 text-sm print:border-0">
      <header className="space-y-0.5 border-b pb-2">
        <p className="text-base font-semibold">{clinicName}</p>
        <p className="font-medium">{detail.patientName}</p>
        <p className="text-muted-foreground">{formatDateWithYear(detail.startAt)}</p>
      </header>
      <ul className="space-y-2">
        {detail.lines.map((line) => (
          <li key={line.id}>
            <p className="font-medium">{line.itemName}</p>
            <p>Jumlah: {line.quantity}</p>
            <p>{line.usage}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}
```

- [ ] **Step 3: Halaman**

`src/app/(admin)/admin/resep/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { DispensingTable } from "@/components/admin/dispensing/dispensing-table";
import { PageTabs } from "@/components/admin/page-tabs";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { DISPENSING_STATUS_LABEL, DISPENSING_VIEWS, isDispensingView, type DispensingView } from "@/lib/dispensing";
import { listDispensings } from "@/server/dispensing-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Resep" };

export default async function DispensingPage({ searchParams }: { searchParams: Promise<{ lihat?: string }> }) {
  await requireCapability("dispense:read");
  const params = await searchParams;
  const view: DispensingView = isDispensingView(params.lihat) ? params.lihat : "MENUNGGU";
  const rows = await listDispensings({ view });

  return (
    <>
      <AdminHeader title="Resep" />
      <PageBody>
        <PageHeader title="Resep" description="Obat yang perlu diserahkan, dari catatan dokter untuk Apoteker." />
        <PageTabs
          label="Tampilan resep"
          active={view}
          tabs={DISPENSING_VIEWS.map((value) => ({
            id: value,
            label: DISPENSING_STATUS_LABEL[value],
            href: value === "MENUNGGU" ? "/admin/resep" : `/admin/resep?lihat=${value}`,
          }))}
        />
        <SectionCard title={DISPENSING_STATUS_LABEL[view]} flush>
          <DispensingTable rows={rows} />
        </SectionCard>
      </PageBody>
    </>
  );
}
```

`src/app/(admin)/admin/resep/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { DispensingEditor } from "@/components/admin/dispensing/dispensing-editor";
import { DispensingSummary } from "@/components/admin/dispensing/dispensing-summary";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { formatDateWithYear } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getDispensingDetail, listDispenseItems } from "@/server/dispensing-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Resep" };

export default async function DispensingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("dispense:read");
  const detail = await getDispensingDetail((await params).id);
  if (!detail) notFound();
  const canManage = can(staff.role, "dispense:manage");

  return (
    <>
      <AdminHeader title="Resep" />
      <PageBody>
        <PageHeader
          title={detail.patientName}
          trail={[{ label: "Resep", href: "/admin/resep" }, { label: detail.patientName }]}
          description={`${detail.branchName} · kunjungan ${formatDateWithYear(detail.startAt)}`}
        />
        {detail.status === "MENUNGGU" ? (
          canManage ? (
            <DispensingEditor detail={detail} items={await listDispenseItems(detail.branchId)} />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">Penyerahan ini masih menunggu Apoteker.</p>
          )
        ) : (
          <DispensingSummary detail={detail} />
        )}
      </PageBody>
    </>
  );
}
```

`src/app/(admin)/admin/resep/[id]/etiket/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PrintButton } from "@/components/admin/billing/print-button";
import { DispensingLabel } from "@/components/admin/dispensing/dispensing-label";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { CLINIC_NAME } from "@/lib/clinic";
import { getDispensingDetail } from "@/server/dispensing-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Etiket obat" };

export default async function DispensingLabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("dispense:read");
  const detail = await getDispensingDetail((await params).id);
  if (!detail || detail.status !== "SELESAI") notFound();

  return (
    <>
      <div className="print:hidden">
        <AdminHeader title="Resep" />
      </div>
      <PageBody>
        <div className="print:hidden">
          <PageHeader
            title="Etiket obat"
            trail={[{ label: "Resep", href: "/admin/resep" }, { label: detail.patientName, href: `/admin/resep/${detail.id}` }, { label: "Etiket" }]}
            actions={<PrintButton />}
          />
        </div>
        <DispensingLabel detail={detail} clinicName={CLINIC_NAME} />
      </PageBody>
    </>
  );
}
```

- [ ] **Step 4: Menu, lencana, dan dasbor**

- `src/components/admin/app-sidebar.tsx`: impor `Pill` dari `lucide-react` (bila tidak ada di versi terpasang, pakai `ClipboardList`), tambahkan item `{ title: "Resep", url: "/admin/resep", icon: Pill, needs: "dispense:read" }` di grup "Persediaan & keuangan" sebelum "Stok"; prop `pendingDispensing = 0` (dokumentasi: "Resep menunggu penyerahan, angka di menu Resep"); entri lencana `"/admin/resep": { count: pendingDispensing, label: `${pendingDispensing} resep menunggu` }`.
- `src/app/(admin)/admin/layout.tsx`: tambahkan ke `Promise.all` yang ada `can(staff.role, "dispense:read") ? countPendingDispensings() : 0` (impor dari `@/server/dispensing-read`) dan teruskan `pendingDispensing={pendingDispensing}`.
- `src/app/(admin)/admin/page.tsx`: tambahkan ke `Promise.all`: `can(staff.role, "dispense:read") ? settle(countPendingDispensings(), "resep") : null`, dan render di bawah kotak Tagihan: `{dispensing && (dispensing.ok ? <DispensingTiles pending={dispensing.data} /> : <FailedSection title="Resep" />)}`.
- `tests/unit/admin-dashboard-page.test.tsx`: tambahkan `vi.mock("@/server/dispensing-read", () => ({ countPendingDispensings: vi.fn() }));`, impor `countPendingDispensings`, set `vi.mocked(countPendingDispensings).mockResolvedValue(0)` di `beforeEach`, dan tambahkan satu uji: untuk peran `APOTEKER` dengan `countStockAlerts` terisi dan `countPendingDispensings` bernilai 2, region "Resep" tampil dengan tautan `/admin/resep` bernilai 2, sedangkan untuk `RESEPSIONIS` `countPendingDispensings` tidak dipanggil.

Run: `npx vitest run tests/unit/dispensing-ui.test.tsx tests/unit/admin-dashboard-page.test.tsx tests/unit/architecture.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Lint, tipe, uji penuh, commit**

Run: `npx eslint src tests/unit; npx tsc --noEmit -p . > "$WS/t7-tsc.log" 2>&1; echo "tsc exit $?"; npx vitest run > "$WS/t7.log" 2>&1; grep -E "Test Files|Tests " "$WS/t7.log"`
Expected: eslint bersih, `tsc exit 0`, semua uji PASS.

```bash
git add src tests
git commit -m "feat: add the pharmacist prescription queue, dispensing form, label, menu, and dashboard tile"
```

---

### Task 8: Editor tagihan — pita status penyerahan dan baris obat terkunci

**Files:**
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`
- Test: `tests/unit/invoice-draft-editor.test.tsx` (tambahan)

**Interfaces:**
- Consumes: Task 2 (`dispensingNotice`), Task 6 (`InvoiceDetail.dispensing`, `InvoiceLineRow.fromDispensing`).
- Produces: pita `role="status"` berisi `dispensingNotice(detail.dispensing)` di editor draf; tombol "Finalkan tagihan" nonaktif selama `detail.dispensing === "MENUNGGU"`; baris `fromDispensing` menampilkan tanda "Dari penyerahan Apoteker", input jumlahnya nonaktif, dan tidak punya tombol Hapus.

- [ ] **Step 1: Tulis uji (gagal)**

Tambahkan di `tests/unit/invoice-draft-editor.test.tsx` (di dalam `describe("editor draf tagihan", …)`; fixture `detail()` sudah punya `fromDispensing: false` dan `dispensing: null` dari Task 6):

```tsx
  it("selama penyerahan Menunggu: pita status tampil dan Finalkan nonaktif", () => {
    render(<InvoiceDraftEditor detail={detail({ dispensing: "MENUNGGU" })} items={items} canExceedDiscount={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Menunggu Apoteker menyerahkan obat.");
    expect(screen.getByRole("button", { name: "Finalkan tagihan" })).toBeDisabled();
  });

  it("penyerahan Selesai: pita 'Obat sudah diserahkan' dan Finalkan aktif; tanpa penyerahan: tanpa pita", () => {
    const { unmount } = render(<InvoiceDraftEditor detail={detail({ dispensing: "SELESAI" })} items={items} canExceedDiscount={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Obat sudah diserahkan.");
    expect(screen.getByRole("button", { name: "Finalkan tagihan" })).toBeEnabled();
    unmount();
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("baris dari penyerahan: ada tanda, jumlah terkunci, tanpa tombol Hapus; baris lain tetap bisa diubah", () => {
    const base = detail();
    const lines = base.lines.map((line) => (line.id === "l2" ? { ...line, fromDispensing: true } : line));
    render(<InvoiceDraftEditor detail={{ ...base, lines }} items={items} canExceedDiscount={false} />);
    expect(screen.getByLabelText("Dari penyerahan Apoteker")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah Vitamin C")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Hapus Vitamin C" })).toBeNull();
    expect(screen.getByLabelText("Harga Vitamin C")).toBeEnabled();
    expect(screen.getByLabelText("Jumlah Konsultasi Gizi")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Hapus Konsultasi Gizi" })).toBeInTheDocument();
  });
```

Run: `npx vitest run tests/unit/invoice-draft-editor.test.tsx`
Expected: tiga uji baru FAIL (pita dan penguncian belum ada).

- [ ] **Step 2: Editor**

Di `src/components/admin/billing/invoice-draft-editor.tsx`:
1. Impor `import { Lock } from "lucide-react";` dan `import { dispensingNotice } from "@/lib/dispensing";`.
2. Pada `LineRow`, di sel nama (setelah teks jenis baris, di dalam `<TableCell>` pertama) tambahkan:

```tsx
        {line.fromDispensing && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock aria-label="Dari penyerahan Apoteker" className="size-3" /> Dari penyerahan Apoteker
          </span>
        )}
```

   Pada input jumlah tambahkan `disabled={line.fromDispensing}`; bungkus tombol Hapus: `{!line.fromDispensing && ( <Button …Hapus…/> )}`.
3. Pada `InvoiceDraftEditor`, tepat sebelum `<Table>` tambahkan:

```tsx
      {dispensingNotice(detail.dispensing) && (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          {dispensingNotice(detail.dispensing)}
        </p>
      )}
```

   dan ubah `disabled` tombol "Finalkan tagihan" menjadi `pending || detail.lines.length === 0 || detail.dispensing === "MENUNGGU"`.

Run: `npx vitest run tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/billing-list.test.tsx`
Expected: PASS semua. (Server tetap menjadi penjaga utama: `finalizeInvoice` menolak dengan `HOLD_MESSAGE` walau tombol dibuka lewat devtools.)

- [ ] **Step 3: Lint, tipe, commit**

Run: `npx eslint src/components/admin/billing tests/unit/invoice-draft-editor.test.tsx; npx tsc --noEmit -p . > "$WS/t8-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: eslint bersih, `tsc exit 0`.

```bash
git add src/components/admin/billing tests/unit/invoice-draft-editor.test.tsx
git commit -m "feat: show dispensing status and lock dispensed lines in the invoice draft editor"
```

---

### Task 9: Dokter melihat stok tanpa harga (`/admin/stok-dokter`)

**Files:**
- Create: `src/server/stock-availability.ts`, `src/components/admin/dispensing/stock-availability-table.tsx`, `src/app/(admin)/admin/stok-dokter/page.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`
- Test: `tests/integration/stock-availability.test.ts`, `tests/unit/stock-availability-ui.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`stock:availability`), `stockFlags`, `STOCK_ITEM_KIND_LABEL`, `getBranches`, `PageTabs` tidak dipakai.
- Produces:
  - `src/server/stock-availability.ts`: `AvailabilityRow = { id: string; name: string; kind: StockItemKindValue; unit: string; available: number }`, `listStockAvailability(filter: { branchId: string; q?: string }): Promise<AvailabilityRow[]>` (`stock:availability`; barang aktif; tanpa harga beli, harga jual, kode batch, atau tanggal kedaluwarsa);
  - `StockAvailabilityTable({ rows })`;
  - `src/components/admin/app-sidebar.tsx`: `NAV_GROUPS` dan `isNavItemVisible(role, item)` diekspor; `NavItem.hideWith?: Capability` menyembunyikan menu bagi peran yang memegang kemampuan itu; item "Stok obat" (`/admin/stok-dokter`, `needs: "stock:availability"`, `hideWith: "stock:read"`) agar Apoteker dan Super Admin tidak melihat dua menu stok.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/integration/stock-availability.test.ts` (pola mock aktor dan `beforeAll` seperti `dispensing-read.test.ts`; slug `stok-dokter`, WA `6281200008905`, peran awal `DOKTER`):

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { listStockAvailability } from "@/server/stock-availability";
import { billingBatch, cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Dokter Uji", role: "DOKTER" as Role, email: "uji@sundy.test" },
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

const SLUG = "stok-dokter";
const WA = "6281200008905";
const today = witaDateString(new Date());

describe("ketersediaan stok untuk Dokter", () => {
  let world: BillingWorld;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    await billingBatch(world, { invoiceNumber: "SD-1", itemId: world.drugId, quantity: 9, unitCost: 1234, expiryDate: addDaysToDateString(today, 100) });
    await billingBatch(world, { invoiceNumber: "SD-2", itemId: world.drugId, quantity: 4, expiryDate: addDaysToDateString(today, -2) });
  });
  beforeEach(() => {
    actor.role = "DOKTER";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("Dokter melihat nama, jenis, satuan, dan sisa tersedia (tanpa batch kedaluwarsa); tanpa harga atau batch", async () => {
    const rows = await listStockAvailability({ branchId: world.branchId });
    const drug = rows.find((r) => r.id === world.drugId);
    expect(drug).toEqual({ id: world.drugId, name: `${SLUG} Amoxicillin`, kind: "OBAT", unit: "kapsul", available: 9 });
    expect(Object.keys(drug!).sort()).toEqual(["available", "id", "kind", "name", "unit"]);
    const json = JSON.stringify(rows);
    for (const secret of ["unitCost", "sellPrice", "expiry", "batch"]) expect(json).not.toContain(secret);
    expect(rows.find((r) => r.id === world.productId)).toMatchObject({ available: 0 });
  });

  it("pencarian, barang nonaktif, dan cabang lain", async () => {
    expect((await listStockAvailability({ branchId: world.branchId, q: "amoxi" })).map((r) => r.id)).toEqual([world.drugId]);
    expect(await listStockAvailability({ branchId: world.branchId, q: "tidak-ada-barang-ini" })).toEqual([]);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: false } });
    expect((await listStockAvailability({ branchId: world.branchId })).map((r) => r.id)).not.toContain(world.productId);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { isActive: true } });
    expect((await listStockAvailability({ branchId: "cabang-lain" })).find((r) => r.id === world.drugId)?.available).toBe(0);
  });

  it("hak akses: Dokter, Apoteker, Super Admin boleh; Resepsionis dan Admin Keuangan ditolak", async () => {
    for (const role of ["APOTEKER", "SUPER_ADMIN"] as const) {
      actor.role = role;
      expect((await listStockAvailability({ branchId: world.branchId })).length).toBeGreaterThan(0);
    }
    for (const role of ["RESEPSIONIS", "ADMIN_KEUANGAN"] as const) {
      actor.role = role;
      await expect(listStockAvailability({ branchId: world.branchId })).rejects.toThrow(/forbidden: stock:availability/);
    }
  });
});
```

Buat `tests/unit/stock-availability-ui.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isNavItemVisible, NAV_GROUPS } from "@/components/admin/app-sidebar";
import { StockAvailabilityTable } from "@/components/admin/dispensing/stock-availability-table";

const titlesFor = (role: Parameters<typeof isNavItemVisible>[0]) =>
  NAV_GROUPS.flatMap((group) => group.items).filter((item) => isNavItemVisible(role, item)).map((item) => item.title);

describe("tabel ketersediaan stok", () => {
  it("menampilkan nama, jenis, sisa, satuan; Habis ditandai; tanpa harga", () => {
    render(
      <StockAvailabilityTable
        rows={[
          { id: "a", name: "Amoxicillin", kind: "OBAT", unit: "kapsul", available: 9 },
          { id: "b", name: "Serum C", kind: "PRODUK", unit: "botol", available: 0 },
        ]}
      />,
    );
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText("9 kapsul")).toBeInTheDocument();
    expect(screen.getByText("Habis")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Rp");
  });

  it("kosong menampilkan keterangan", () => {
    render(<StockAvailabilityTable rows={[]} />);
    expect(screen.getByText("Tidak ada barang yang cocok.")).toBeInTheDocument();
  });
});

describe("menu stok per peran", () => {
  it("Dokter melihat Stok obat, bukan Stok; Apoteker dan Super Admin melihat Stok dan Resep, bukan Stok obat", () => {
    expect(titlesFor("DOKTER")).toContain("Stok obat");
    expect(titlesFor("DOKTER")).not.toContain("Stok");
    expect(titlesFor("DOKTER")).not.toContain("Resep");
    for (const role of ["APOTEKER", "SUPER_ADMIN"] as const) {
      expect(titlesFor(role)).toContain("Stok");
      expect(titlesFor(role)).toContain("Resep");
      expect(titlesFor(role)).not.toContain("Stok obat");
    }
  });

  it("Resepsionis dan Admin Keuangan tidak melihat Resep maupun Stok obat", () => {
    for (const role of ["RESEPSIONIS", "ADMIN_KEUANGAN"] as const) {
      expect(titlesFor(role)).not.toContain("Resep");
      expect(titlesFor(role)).not.toContain("Stok obat");
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/stock-availability.test.ts; npx vitest run tests/unit/stock-availability-ui.test.tsx`
Expected: FAIL (modul dan ekspor belum ada).

- [ ] **Step 2: Server dan komponen**

Buat `src/server/stock-availability.ts`:

```ts
import { prisma } from "@/lib/db";
import { stockFlags, type StockItemKindValue } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

export type AvailabilityRow = { id: string; name: string; kind: StockItemKindValue; unit: string; available: number };

/**
 * Ketersediaan stok untuk Dokter (spec penyerahan 5–6): hanya nama, jenis, satuan, dan sisa tersedia
 * (batch kedaluwarsa tidak dihitung). Harga beli, harga jual, dan batch sengaja tidak dipilih dari basis data.
 */
export async function listStockAvailability(filter: { branchId: string; q?: string }): Promise<AvailabilityRow[]> {
  await requireCapability("stock:availability");
  const today = witaDateString(new Date());
  const q = filter.q?.trim();
  const items = await prisma.stockItem.findMany({
    where: {
      isActive: true,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q.toUpperCase() } }] } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      kind: true,
      unit: true,
      batches: {
        where: { branchId: String(filter.branchId ?? ""), quantityRemaining: { gt: 0 } },
        select: { quantityRemaining: true, expiryDate: true },
      },
    },
  });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    available: stockFlags(item.batches.map((b) => ({ ...b, unitCost: 0 })), 0, today).available,
  }));
}
```

Buat `src/components/admin/dispensing/stock-availability-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STOCK_ITEM_KIND_LABEL } from "@/lib/stock";
import type { AvailabilityRow } from "@/server/stock-availability";
import { EmptyState } from "../page-layout";

/** Tabel baca saja untuk Dokter: tanpa harga dan tanpa batch. */
export function StockAvailabilityTable({ rows }: { rows: AvailabilityRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada barang yang cocok.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Barang</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead className="text-right">Tersedia</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{STOCK_ITEM_KIND_LABEL[row.kind]}</TableCell>
            <TableCell className="text-right">
              {row.available > 0 ? `${row.available} ${row.unit}` : <Badge variant="destructive">Habis</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Buat `src/app/(admin)/admin/stok-dokter/page.tsx`:

```tsx
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { StockAvailabilityTable } from "@/components/admin/dispensing/stock-availability-table";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBranches } from "@/server/catalog";
import { requireCapability } from "@/server/session";
import { listStockAvailability } from "@/server/stock-availability";

export const metadata = { title: "Stok obat" };

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export default async function StockAvailabilityPage({ searchParams }: { searchParams: Promise<{ cabang?: string; cari?: string }> }) {
  await requireCapability("stock:availability");
  const params = await searchParams;
  const branches = (await getBranches()).filter((branch) => branch.status === "AKTIF");
  const branch = branches.find((b) => b.id === params.cabang) ?? branches[0];
  const q = params.cari?.trim() || undefined;

  return (
    <>
      <AdminHeader title="Stok obat" />
      <PageBody>
        <PageHeader title="Stok obat" description="Ketersediaan obat dan produk di cabang, untuk menulis catatan kunjungan." />
        {!branch ? (
          <EmptyState>Belum ada cabang aktif.</EmptyState>
        ) : (
          <>
            <Form action="/admin/stok-dokter" className="flex flex-wrap items-end gap-2">
              <select name="cabang" defaultValue={branch.id} aria-label="Cabang" className={selectClass}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <Input name="cari" defaultValue={q ?? ""} placeholder="Cari nama atau kode" aria-label="Cari barang" className="max-w-xs" />
              <Button type="submit" variant="outline">
                Cari
              </Button>
            </Form>
            <SectionCard title={branch.name} flush>
              <StockAvailabilityTable rows={await listStockAvailability({ branchId: branch.id, q })} />
            </SectionCard>
          </>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 3: Menu**

Di `src/components/admin/app-sidebar.tsx`:
1. Ubah `type NavItem` menjadi `export type NavItem = { …; needs?: Capability; /** Menu disembunyikan bagi peran yang memegang kemampuan ini (mis. Apoteker sudah punya menu Stok penuh). */ hideWith?: Capability };`.
2. Ekspor `NAV_GROUPS` (`export const NAV_GROUPS …`) dan tambahkan di grup "Persediaan & keuangan", setelah item "Stok": `{ title: "Stok obat", url: "/admin/stok-dokter", icon: PillBottle, needs: "stock:availability", hideWith: "stock:read" },` (impor `PillBottle` dari `lucide-react`).
3. Tambahkan fungsi yang diekspor dan pakai di filter menu:

```tsx
export function isNavItemVisible(role: CurrentStaff["role"], item: NavItem): boolean {
  if (item.needs && !can(role, item.needs)) return false;
  if (item.hideWith && can(role, item.hideWith)) return false;
  return true;
}
```

   dan ganti `group.items.filter((item) => !item.needs || can(staff.role, item.needs))` menjadi `group.items.filter((item) => isNavItemVisible(staff.role, item))`.

Run: `npm run test:integration -- tests/integration/stock-availability.test.ts; npx vitest run tests/unit/stock-availability-ui.test.tsx tests/unit/architecture.test.ts`
Expected: PASS semua.

- [ ] **Step 4: Lint, tipe, uji penuh, commit**

Run: `npx eslint src tests/unit tests/integration; npx tsc --noEmit -p . > "$WS/t9-tsc.log" 2>&1; echo "tsc exit $?"; npx vitest run > "$WS/t9.log" 2>&1; grep -E "Test Files|Tests " "$WS/t9.log"`
Expected: eslint bersih, `tsc exit 0`, semua uji PASS.

```bash
git add src tests
git commit -m "feat: let doctors see stock availability without prices"
```

---

### Task 10: E2E, fixture, verifikasi penuh, tandai spec dibangun

**Files:**
- Create: `tests/e2e/resep.spec.ts`
- Modify: `tests/e2e/prepare-db.mts`, `docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md` (status)

**Interfaces:**
- Consumes: semua task sebelumnya; kredensial `E2E_ADMIN` (berperan dokter, punya `record:write`), `E2E_APOTEKER`, `E2E_RESEPSIONIS` (`tests/e2e/credentials.ts`); `signIn` dari `./helpers/quiz`.
- Produces: satu cerita E2E berurutan per proyek (desktop/ponsel).

- [ ] **Step 1: Fixture**

Di `tests/e2e/prepare-db.mts`:
1. Pada blok pembersihan tagihan di awal (sesudah `await prisma.invoiceNumberCounter.deleteMany();`) tambahkan:

```ts
// Penyerahan obat (resep.spec.ts) merujuk booking dan baris tagihan, jadi dibuang sesudah tagihan dan sebelum booking.
await prisma.dispensingLine.deleteMany();
await prisma.dispensing.deleteMany();
```

2. Di akhir bagian kunjungan (sesudah loop "Persetujuan isian…", sebelum bagian "Pengingat H-1") tambahkan:

```ts
// Penyerahan obat (resep.spec.ts): satu pasien hadir hari ini per proyek, pukul 03.00/03.30
// (di luar jam buka, tidak bentrok dengan seed lain).
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-RESEP-${index + 1}`,
      name: `Pasien Resep ${project}`,
      whatsapp: `6281200081${index}01`,
      birthDate: new Date("1991-03-17T00:00:00Z"),
      gender: "P",
    },
  });
  const startAt = combineWitaDateAndMinutes(today, 3 * 60 + index * 30);
  await prisma.appointment.create({
    data: {
      code: `E2E-RESEP-${index + 1}`,
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

- [ ] **Step 2: Cerita E2E**

Buat `tests/e2e/resep.spec.ts` dengan pola `tagihan.spec.ts` (`test.describe.configure({ mode: "serial" })`, `test.setTimeout(180_000)`, `tag(testInfo)` D/M, `dayFromToday`). Cerita:

1. **Apoteker menyiapkan stok** (`E2E_APOTEKER`): `/admin/stok` → "+ Barang" → kode `E2E-{t}-RSP`, nama `Amoxicillin Resep {t}`, satuan `kapsul`, batas menipis `2`, harga jual `3000`; lalu `/admin/stok/masuk/baru` → supplier baru `Supplier Resep {t}`, nomor faktur `RSP-E2E-{t}-001`, barang baris 1 (opsi `Amoxicillin Resep {t} (E2E-{t}-RSP)`), jumlah `10`, harga beli `1000`, batch `B-01`, kedaluwarsa `dayFromToday(365)`, "Simpan barang masuk" (sama seperti `tagihan.spec.ts`).
2. **Dokter memfinalkan dengan catatan** (`E2E_ADMIN`): dari region "Pasien hari ini" baris `Pasien Resep {project}` → "Periksa" → isi `Penilaian / diagnosis` "Infeksi saluran napas" dan `Catatan untuk Apoteker` "Amoxicillin 3x1 selama 5 hari"; tunggu teks `Tersimpan HH.MM`; "Finalisasi" → di `alertdialog` "Finalisasi"; tunggu teks "Final".
3. **Resepsionis menagih, tertahan** (`E2E_RESEPSIONIS`): `/admin/tagihan` → tombol `Buat tagihan Pasien Resep {project}` → halaman draf; pita status memuat "Menunggu Apoteker menyerahkan obat."; tombol "Finalkan tagihan" nonaktif; **resepsionis tidak melihat isi catatan**: `page.getByText("Amoxicillin 3x1")` berjumlah 0. Simpan `invoicePath`.
4. **Apoteker menyerahkan** (`E2E_APOTEKER`): `/admin/resep` → lencana/baris `Pasien Resep {project}` → buka; region "Catatan untuk Apoteker" memuat "Amoxicillin 3x1 selama 5 hari"; halaman **tidak** memuat "Infeksi saluran napas" (data klinis lain tertutup); pilih obat (`Obat` → opsi `Amoxicillin Resep {t} (E2E-{t}-RSP) — sisa 10 kapsul`), `Jumlah` 2, `Aturan pakai` "3 x 1 sesudah makan", "+ Tambah obat" (tunggu baris `Jumlah Amoxicillin Resep {t}`); "Selesai"; badge "Selesai" tampil; klik "Cetak etiket" → halaman etiket memuat "3 x 1 sesudah makan" dan nama pasien, dan `body` tidak memuat "Rp".
5. **Resepsionis memfinalkan** (`E2E_RESEPSIONIS`): `page.goto(invoicePath)`; pita "Obat sudah diserahkan."; baris obat bertanda "Dari penyerahan Apoteker" dan input `Jumlah Amoxicillin Resep {t}` nonaktif; tombol "Hapus Amoxicillin Resep {t}" tidak ada; "Finalkan tagihan" → dialog "Finalkan" → judul `Tagihan TG-…`.
6. **Stok berkurang** (`E2E_APOTEKER`): `/admin/stok` baris `Amoxicillin Resep {t}` memuat "8 kapsul".
7. **Hak akses**: `E2E_RESEPSIONIS`: `page.goto("/admin/resep")` status 403 dan `/admin/stok-dokter` status 403; `E2E_APOTEKER`: `/admin/tagihan` status 403 (sudah dijaga `tagihan.spec.ts`; di sini cukup `/admin/resep` untuk Resepsionis dan `/admin/stok-dokter` untuk Admin Keuangan `E2E_KEUANGAN`).

Gunakan `{ timeout: 30_000 }` pada tunggu navigasi seperti spek lain dan pola URL `/\/admin\/tagihan\/[^/?]+$/` serta `/\/admin\/resep\/[^/?]+$/`.

- [ ] **Step 3: Jalankan E2E per proyek**

Run (satu proyek sekali jalan): `npx playwright test tests/e2e/resep.spec.ts --project=desktop > "$WS/e2e-d.log" 2>&1; tail -20 "$WS/e2e-d.log"` lalu `--project=mobile` dengan log `e2e-m.log`; lalu `npx playwright test tests/e2e/admin-sidebar.spec.ts tests/e2e/dasbor.spec.ts tests/e2e/kunjungan.spec.ts tests/e2e/tagihan.spec.ts --project=desktop > "$WS/e2e-other.log" 2>&1; grep -E "passed|failed|flaky" "$WS/e2e-other.log"`.
Expected: semua lulus. Setelah e2e, kosongkan data e2e di `sundy_test` (jalankan `prepare-db.mts` dengan env uji, mis. lewat skrip `tests/e2e/.clean-tmp.mts` sementara yang memanggil `execFileSync("npx", ["tsx", "tests/e2e/prepare-db.mts"], { env: { ...process.env, ...e2eDatabaseEnv() } })`, lalu hapus skrip itu) sebelum integrasi.

- [ ] **Step 4: Verifikasi penuh**

Run berurutan (jangan bersamaan):

```bash
npx vitest run > "$WS/final-unit.log" 2>&1; grep -E "Test Files|Tests " "$WS/final-unit.log"
npm run test:integration > "$WS/final-int.log" 2>&1; grep -E "Test Files|Tests |FAIL" "$WS/final-int.log" | head
npx eslint . > "$WS/final-lint.log" 2>&1; echo "eslint exit $?"
npx tsc --noEmit -p . > "$WS/final-tsc.log" 2>&1; echo "tsc exit $?"
npx next build > "$WS/final-build.log" 2>&1; echo "build exit $?"
```

Expected: unit dan integrasi lulus (satu-satunya kegagalan yang boleh ada: 3 uji `schedule.test.ts`), `eslint exit 0`, `tsc exit 0`, `build exit 0`. Setiap kegagalan lain disebut dengan namanya di laporan.

- [ ] **Step 5: Tandai spec dibangun dan commit**

Di `docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md` ganti baris status "Menunggu tinjauan pemilik" menjadi "Dibangun (belum dideploy)".

```bash
git add tests/e2e/resep.spec.ts tests/e2e/prepare-db.mts docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md
git commit -m "test: cover pharmacist dispensing end to end and mark the design as built"
```
