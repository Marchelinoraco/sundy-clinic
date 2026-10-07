# Pengeluaran dan Laporan Untung-Rugi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin Keuangan mencatat pengeluaran (per kategori, termasuk berulang bulanan) dan pemilik membuka laporan untung-rugi per periode dan cabang, lengkap dengan arus kas, perbandingan, tren 12 bulan, dan unduhan CSV.

**Architecture:**
- **Data:** tiga tabel baru (`ExpenseCategory`, `Expense`, `RecurringExpense`) dan dua kemampuan (`expense:manage`, `profit:read`). Laporan tidak punya tabel ringkasan: dihitung langsung dari tagihan final, baris dan pemakaian stok tagihan, booking yang diverifikasi (jejak audit `appointment.verify`), pembayaran customer, pembayaran hutang supplier, dan pengeluaran.
- **Pembagian kode:** rumus, periode, validasi, dan CSV murni di `src/lib/expense.ts` dan `src/lib/report.ts`; pembantu server (susulan pengeluaran berulang) di `src/server/expense-store.ts` tanpa `"use server"`; pembacaan di `expense-read.ts` dan `report-read.ts`; aksi di `expense-actions.ts` dan `expense-recurring.ts`; unduhan di `report-export.ts` plus rute tipis `GET /admin/laporan/unduh`.
- **Pengeluaran berulang tanpa penjadwal:** `ensureRecurringExpenses` membuat catatan bulan yang belum ada lewat `createMany({ skipDuplicates: true })` di atas keunikan `(recurringId, recurringMonth)`, dipanggil setiap daftar pengeluaran atau laporan dibuka; dua pemanggil bersamaan tidak membuat catatan ganda.

**Tech Stack:** Next.js 15.5 App Router, React 19, Prisma 7 + PostgreSQL, Zod 4, shadcn/ui (Radix), Vitest 4 + Testing Library, Playwright. Grafik tren digambar dengan SVG sendiri (tanpa dependensi baru).

**Spec:** `docs/superpowers/specs/2026-10-07-pengeluaran-laporan-untung-rugi-design.md`

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi berbahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar.
- **Zona waktu:** WITA. Periode adalah rentang tanggal inklusif `"YYYY-MM-DD"`; instant batasnya `combineWitaDateAndMinutes(dari, 0)` sampai (eksklusif) `combineWitaDateAndMinutes(sampai + 1 hari, 0)`. Kolom `@db.Date` dipertukarkan sebagai teks lewat `dateOnly`/`dateOnlyString` (`src/lib/stock.ts`).
- **Uang:** rupiah penuh (`Int`), tampil lewat `formatRupiah`; batas atas `MAX_AMOUNT` (2.000.000.000).
- **Angka dari spec:** keterangan pengeluaran ≤ **300** karakter; `dayOfMonth` **1–28**; rentang laporan ≤ **366** hari; `startMonth` templat paling jauh **24** bulan ke belakang; tren **12** bulan.
- **Rumus (spec 3):** pendapatan = baris tagihan `FINAL` (per jenis) − diskon + pendapatan di muka (biaya booking + harga Konsultasi Online dari booking diverifikasi); harga pokok = Σ `InvoiceStockUse.quantity × unitCost`; laba kotor = pendapatan − harga pokok; laba bersih = laba kotor − pengeluaran tidak dibatalkan; "belum tertagih" hanya informasi; **pembayaran hutang supplier tidak mengurangi laba**, hanya tampil di arus kas.
- **Hak akses (spec 6):** `expense:manage` dan `profit:read` dipegang **Admin Keuangan** dan **Super Admin** saja. Setiap halaman, aksi, dan rute unduhan memanggil pemeriksaan sendiri.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (tipe boleh). Konstanta dan fungsi murni di `src/lib`; pembantu server di modul tanpa `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`; komponen tidak mengimpor `@/lib/db`; komponen server hanya mengambil komponen dari modul `"use client"` (dijaga `tests/unit/architecture.test.ts`).
- **Riwayat tidak dihapus:** pengeluaran dibatalkan dengan alasan, kategori dinonaktifkan.
- **Jejak audit** nama persis: `expense.create`, `expense.void`, `expense-category.create`, `expense-category.update`, `expense-recurring.create`, `expense-recurring.update`, `expense-recurring.stop`, `report.export`. Ringkasan memuat kategori dan nominal, bukan keterangan bebas.
- **Migrasi hanya menambah.** Diterapkan berurutan: `npx prisma migrate deploy`, `npm run db:migrate:test`, `npx prisma generate`, lalu `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (kode 0).
- **Tanpa dependensi baru.** Repo tidak memakai Prettier; ikuti format di sekitarnya.
- **Log uji:** `WS` adalah direktori kerja rencana (`.superpowers/sdd/2026-10-07-plan-pengeluaran-laporan/`). Output panjang ditulis ke sana.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`); jangan bersamaan dengan e2e; setelah e2e kosongkan data e2e (jalankan `tests/e2e/prepare-db.mts` dengan env uji) sebelum integrasi lagi. E2E per proyek (laptop 8 GB). Uji laporan memakai periode di tahun **2035** dan cabang dunia uji sendiri agar tidak tercampur data uji lain.
- **Uji yang sudah gagal sebelum rencana ini:** 3 uji di `tests/integration/schedule.test.ts` (tanggal tetap 2026-10-05). Jangan diubah. Satu uji `encounter-form.test.tsx` kadang flake di suite penuh (lulus saat diulang).
- **Commit:** Conventional Commits berbahasa Inggris dengan baris penutup `Co-Authored-By` yang menyebut model yang menulis commit itu. **Jangan pernah mengubah atau men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Biaya atau pendapatan terhitung dua kali.** Booking dan tagihan tidak tumpang tindih (Konsultasi Online hanya di muka); harga pokok tidak ditambah pembayaran hutang; booking yang diverifikasi dua kali tercatat sekali; booking yang diverifikasi di periode lain tidak ikut → uji di Task 5.
2. **Batas periode dan zona waktu.** Tagihan yang difinalkan pukul 23.59 WITA hari terakhir ikut, 00.00 hari berikutnya tidak; bulan kalender penuh dibanding bulan sebelumnya; rentang terbalik atau > 366 hari ditolak → uji di Task 3 dan 5.
3. **Pengeluaran berulang dobel atau terlewat.** Dua orang membuka halaman bersamaan, susulan beberapa bulan, templat dihentikan atau berakhir, mengubah templat tidak mengubah catatan lama → uji di Task 6.
4. **Kebocoran angka keuangan.** Dokter, Apoteker, Resepsionis, dan Terapis ditolak di semua pembacaan, aksi, halaman, dan unduhan CSV → uji hak akses di Task 4–9.
5. **CSV yang dijalankan sebagai rumus.** Keterangan bebas yang diawali `=`, `+`, `-`, `@` dinetralkan; BOM ada; sel bertanda kutip dan koma aman → uji di Task 3 dan 7.

---

## Struktur berkas

**Baru**

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `prisma/migrations/20261007220000_pengeluaran/migration.sql` | Tabel, CHECK, indeks unik, kategori bawaan | 1 |
| `src/lib/expense.ts` | Validasi pengeluaran, kategori, templat; bulan berulang | 2 |
| `src/lib/report.ts` | Periode, rumus laba, arus kas, perbandingan, CSV | 3 |
| `src/server/expense-store.ts` | Susulan pengeluaran berulang (tanpa `"use server"`) | 6 |
| `src/server/expense-read.ts` | Daftar pengeluaran, kategori, templat | 4, 6 |
| `src/server/expense-actions.ts` | Catat dan batalkan pengeluaran, kelola kategori | 4 |
| `src/server/expense-recurring.ts` | Aksi templat berulang | 6 |
| `src/server/report-read.ts` | Laporan, perbandingan, tren, laba bulan ini | 5 |
| `src/server/report-export.ts`, `src/app/(admin)/admin/laporan/unduh/route.ts` | Unduh CSV | 7 |
| `src/components/admin/expenses/*`, `src/components/admin/report/*` | Komponen | 8, 9 |
| `src/app/(admin)/admin/pengeluaran/page.tsx`, `src/app/(admin)/admin/laporan/page.tsx` | Halaman | 8, 9 |

**Diubah**

| Berkas | Perubahan | Task |
|---|---|---|
| `prisma/schema.prisma`, `src/lib/permissions.ts`, `tests/integration/invoice-world.ts` | Model, kemampuan, pembersihan uji | 1 |
| `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/page.tsx` | Menu, kotak dasbor | 9 |
| `tests/e2e/prepare-db.mts` | Fixture e2e | 10 |

---

### Task 1: Fondasi — tabel pengeluaran, kategori bawaan, kemampuan baru, pembantu uji

**Files:**
- Create: `prisma/migrations/20261007220000_pengeluaran/migration.sql`, `tests/integration/expense-schema.test.ts`
- Modify: `prisma/schema.prisma`, `src/lib/permissions.ts`, `tests/unit/permissions.test.ts`, `tests/unit/migrations.test.ts`, `tests/integration/invoice-world.ts`

**Interfaces:**
- Consumes: model `Branch`; `createBillingWorld`, `cleanupBillingWorld` (`tests/integration/invoice-world.ts`).
- Produces:
  - Prisma: model `ExpenseCategory` (`id`, `name`, `isActive`, `sortOrder`, `createdAt`), `Expense` (`id`, `date @db.Date`, `categoryId`, `amount`, `note?`, `branchId?`, `recurringId?`, `recurringMonth?`, `createdById`, `createdByName`, `createdAt`, `voidedAt?`, `voidedByName?`, `voidReason?`; `@@unique([recurringId, recurringMonth])`), `RecurringExpense` (`id`, `categoryId`, `amount`, `note?`, `branchId?`, `dayOfMonth`, `startMonth`, `endMonth?`, `isActive`, `createdById`, `createdByName`, `createdAt`);
  - CHECK: `expense_amount_positive`, `expense_void_fields`, `recurring_expense_values`; indeks unik `expense_category_name_lower` pada `lower("name")`;
  - tujuh kategori bawaan (Gaji, Sewa, Listrik dan air, Internet dan telepon, Perlengkapan, Pemasaran, Lain-lain) terisi lewat migrasi;
  - `Capability` + `"expense:manage" | "profit:read"` untuk `SUPER_ADMIN` dan `ADMIN_KEUANGAN`;
  - `cleanupBillingWorld` ikut menghapus `Expense` dan `RecurringExpense` milik cabang dunia uji.

- [ ] **Step 1: Uji skema dan hak akses (gagal)**

Buat `tests/integration/expense-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "skema-pengeluaran";
const WA = "6281200009000";

describe("skema pengeluaran", () => {
  let world: BillingWorld;
  let categoryId: string;

  const expense = (data: Record<string, unknown> = {}) =>
    prisma.expense.create({
      data: { date: new Date("2035-01-10T00:00:00Z"), categoryId, amount: 100000, createdById: "s1", createdByName: "Uji", branchId: world.branchId, ...data },
    });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
    world = await createBillingWorld(SLUG, WA);
    categoryId = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Sewa` } })).id;
  });

  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
    await prisma.$disconnect();
  });

  it("kategori bawaan terisi dari migrasi", async () => {
    const names = (await prisma.expenseCategory.findMany({ select: { name: true } })).map((c) => c.name);
    for (const name of ["Gaji", "Sewa", "Listrik dan air", "Internet dan telepon", "Perlengkapan", "Pemasaran", "Lain-lain"]) {
      expect(names).toContain(name);
    }
  });

  it("nama kategori unik tanpa membedakan huruf besar-kecil", async () => {
    await expect(prisma.expenseCategory.create({ data: { name: `${SLUG.toUpperCase()} SEWA` } })).rejects.toThrow(/Unique constraint|expense_category_name_lower/);
  });

  it("nominal harus lebih dari 0", async () => {
    await expect(expense({ amount: 0 })).rejects.toThrow(/expense_amount_positive/);
    await expect(expense({ amount: -5 })).rejects.toThrow(/expense_amount_positive/);
    expect((await expense()).amount).toBe(100000);
  });

  it("data pembatalan harus lengkap atau kosong semuanya", async () => {
    await expect(expense({ voidedAt: new Date() })).rejects.toThrow(/expense_void_fields/);
    await expect(expense({ voidedAt: new Date(), voidedByName: "x" })).rejects.toThrow(/expense_void_fields/);
    expect((await expense({ voidedAt: new Date(), voidedByName: "x", voidReason: "Salah" })).voidReason).toBe("Salah");
  });

  it("satu templat tidak bisa membuat dua catatan untuk bulan yang sama; catatan manual tidak dibatasi", async () => {
    const recurring = await prisma.recurringExpense.create({
      data: { categoryId, amount: 500000, dayOfMonth: 5, startMonth: "2035-01", createdById: "s1", createdByName: "Uji", branchId: world.branchId },
    });
    await expense({ recurringId: recurring.id, recurringMonth: "2035-01" });
    await expect(expense({ recurringId: recurring.id, recurringMonth: "2035-01" })).rejects.toThrow(/Unique constraint/);
    await expense({ recurringId: recurring.id, recurringMonth: "2035-02" });
    await expense();
    await expense();
  });

  it("templat: tanggal 1–28, nominal positif, bulan berakhir tidak lebih awal dari mulai", async () => {
    const base = { categoryId, amount: 1000, dayOfMonth: 1, startMonth: "2035-03", createdById: "s1", createdByName: "Uji" };
    await expect(prisma.recurringExpense.create({ data: { ...base, dayOfMonth: 29 } })).rejects.toThrow(/recurring_expense_values/);
    await expect(prisma.recurringExpense.create({ data: { ...base, dayOfMonth: 0 } })).rejects.toThrow(/recurring_expense_values/);
    await expect(prisma.recurringExpense.create({ data: { ...base, amount: 0 } })).rejects.toThrow(/recurring_expense_values/);
    await expect(prisma.recurringExpense.create({ data: { ...base, endMonth: "2035-02" } })).rejects.toThrow(/recurring_expense_values/);
    expect((await prisma.recurringExpense.create({ data: { ...base, endMonth: "2035-03" } })).endMonth).toBe("2035-03");
  });
});
```

Tambahkan di akhir `tests/unit/permissions.test.ts`:

```ts
describe("hak akses pengeluaran dan laporan (spec laporan 6)", () => {
  it("Admin Keuangan dan Super Admin mencatat pengeluaran dan melihat laporan", () => {
    for (const role of ["ADMIN_KEUANGAN", "SUPER_ADMIN"] as const) {
      expect(can(role, "expense:manage")).toBe(true);
      expect(can(role, "profit:read")).toBe(true);
    }
  });

  it("Dokter, Apoteker, Resepsionis, dan Terapis tidak punya akses", () => {
    for (const role of ["DOKTER", "APOTEKER", "RESEPSIONIS", "TERAPIS"] as const) {
      expect(can(role, "expense:manage")).toBe(false);
      expect(can(role, "profit:read")).toBe(false);
    }
  });
});
```

Run: `npx vitest run tests/unit/permissions.test.ts; npm run test:integration -- tests/integration/expense-schema.test.ts`
Expected: FAIL (kemampuan belum ada; model `expense` belum ada di klien Prisma).

- [ ] **Step 2: Skema Prisma**

Di `prisma/schema.prisma`:
1. Tambahkan satu baris setelah baris pembuka `model Branch {`: `  expenses Expense[]`; dan `  recurringExpenses RecurringExpense[]`.
2. Tambahkan di **akhir** berkas:

```prisma
// ---------------------------------------------------------------------------
// Pengeluaran dan laporan untung-rugi (spec docs/superpowers/specs/2026-10-07-pengeluaran-laporan-untung-rugi-design.md)
// ---------------------------------------------------------------------------

model ExpenseCategory {
  id        String   @id @default(cuid())
  /// Unik tanpa membedakan huruf besar-kecil (indeks expense_category_name_lower di migrasi).
  name      String
  isActive  Boolean  @default(true)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  expenses   Expense[]
  recurrings RecurringExpense[]
}

/// Satu pengeluaran. Salah catat dibatalkan (voidedAt), tidak dihapus.
model Expense {
  id          String          @id @default(cuid())
  date        DateTime        @db.Date
  categoryId  String
  category    ExpenseCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  amount      Int
  note        String?
  /// Kosong = pengeluaran umum (hanya ikut laporan "semua cabang").
  branchId    String?
  branch      Branch?         @relation(fields: [branchId], references: [id], onDelete: Restrict)
  /// Terisi bila catatan dibuat dari templat berulang; unik per bulan.
  recurringId    String?
  recurring      RecurringExpense? @relation(fields: [recurringId], references: [id], onDelete: Restrict)
  recurringMonth String?

  createdById   String
  createdByName String
  createdAt     DateTime @default(now())
  voidedAt      DateTime?
  voidedByName  String?
  voidReason    String?

  @@unique([recurringId, recurringMonth])
  @@index([date])
  @@index([categoryId])
}

/// Templat pengeluaran bulanan; catatannya dibuat susulan saat daftar atau laporan dibuka.
model RecurringExpense {
  id          String          @id @default(cuid())
  categoryId  String
  category    ExpenseCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  amount      Int
  note        String?
  branchId    String?
  branch      Branch?         @relation(fields: [branchId], references: [id], onDelete: Restrict)
  /// 1–28 agar bulan pendek tidak bermasalah.
  dayOfMonth  Int
  /// "YYYY-MM".
  startMonth  String
  endMonth    String?
  isActive    Boolean         @default(true)

  createdById   String
  createdByName String
  createdAt     DateTime @default(now())

  expenses Expense[]
}
```

3. Jalankan `npx prisma format`.

- [ ] **Step 3: Migrasi**

```bash
npx prisma migrate deploy
mkdir -p prisma/migrations/20261007220000_pengeluaran
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  > prisma/migrations/20261007220000_pengeluaran/migration.sql
cat prisma/migrations/20261007220000_pengeluaran/migration.sql
```

Expected: SQL berisi tiga `CREATE TABLE` (`ExpenseCategory`, `Expense`, `RecurringExpense`), indeks, unik `Expense_recurringId_recurringMonth_key`, dan `ADD CONSTRAINT … FOREIGN KEY`. Tidak ada `DROP`. **Hasil generate yang dipakai.**

Tambahkan di **awal** berkas:

```sql
-- Pengeluaran dan laporan untung-rugi (sub-proyek keuangan 4).
-- Spec: docs/superpowers/specs/2026-10-07-pengeluaran-laporan-untung-rugi-design.md bagian 4.
-- Migrasi ini hanya menambah: tabel, CHECK, indeks unik, dan kategori bawaan.

```

Lalu tambahkan di **akhir** berkas:

```sql

-- Penjagaan nilai di basis data (spec laporan 4).
CREATE UNIQUE INDEX expense_category_name_lower ON "ExpenseCategory" (lower("name"));

ALTER TABLE "Expense" ADD CONSTRAINT expense_amount_positive CHECK ("amount" > 0);

ALTER TABLE "Expense" ADD CONSTRAINT expense_void_fields CHECK (
  ("voidedAt" IS NULL AND "voidedByName" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "voidedByName" IS NOT NULL AND "voidReason" IS NOT NULL)
);

ALTER TABLE "RecurringExpense" ADD CONSTRAINT recurring_expense_values CHECK (
  "amount" > 0 AND "dayOfMonth" BETWEEN 1 AND 28 AND ("endMonth" IS NULL OR "endMonth" >= "startMonth")
);

-- Kategori bawaan (spec laporan 4.1).
INSERT INTO "ExpenseCategory" ("id", "name", "sortOrder") VALUES
  ('kat-gaji', 'Gaji', 1),
  ('kat-sewa', 'Sewa', 2),
  ('kat-listrik-air', 'Listrik dan air', 3),
  ('kat-internet-telepon', 'Internet dan telepon', 4),
  ('kat-perlengkapan', 'Perlengkapan', 5),
  ('kat-pemasaran', 'Pemasaran', 6),
  ('kat-lain-lain', 'Lain-lain', 7);
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
describe("migrasi pengeluaran", () => {
  const sql = readFileSync("prisma/migrations/20261007220000_pengeluaran/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga nominal, pembatalan, templat, dan nama kategori di basis data", () => {
    for (const name of ["expense_amount_positive", "expense_void_fields", "recurring_expense_values", "expense_category_name_lower"]) {
      expect(sql).toContain(name);
    }
  });

  it("mengisi tujuh kategori bawaan", () => {
    expect(sql).toMatch(/INSERT INTO "ExpenseCategory"/);
    for (const name of ["Gaji", "Sewa", "Listrik dan air", "Internet dan telepon", "Perlengkapan", "Pemasaran", "Lain-lain"]) {
      expect(sql).toContain(`'${name}'`);
    }
  });
});
```

- [ ] **Step 4: Kemampuan dan pembersihan uji**

Di `src/lib/permissions.ts`:
1. Tambahkan ke tipe `Capability` (setelah `| "stock:availability"`): `| "expense:manage"\n  | "profit:read"`.
2. Pada `SUPER_ADMIN`, tambahkan `"expense:manage", "profit:read",` setelah `"stock:availability",`.
3. Ganti `ADMIN_KEUANGAN: ["stock:read", "payable:manage", "report:read", "invoice:read", "invoice:correct"],` dengan `ADMIN_KEUANGAN: ["stock:read", "payable:manage", "report:read", "invoice:read", "invoice:correct", "expense:manage", "profit:read"],`.

Di `tests/integration/invoice-world.ts`, pada `cleanupBillingWorld`, tepat sebelum baris `await prisma.dispensingLine.deleteMany(...)` tambahkan:

```ts
  await prisma.expense.deleteMany({ where: { branch } });
  await prisma.recurringExpense.deleteMany({ where: { branch } });
```

Run: `npx tsc --noEmit -p . > "$WS/t1-tsc.log" 2>&1; echo "tsc exit $?"; tail -10 "$WS/t1-tsc.log"`
Expected: `tsc exit 0`. (Uji lama yang memeriksa daftar kemampuan Admin Keuangan persis akan gagal pada Step 5; perbarui ekspektasinya, bukan kodenya.)

- [ ] **Step 5: Jalankan uji dan commit**

Run: `npx vitest run tests/unit/permissions.test.ts tests/unit/migrations.test.ts; npm run test:integration -- tests/integration/expense-schema.test.ts tests/integration/invoice-schema.test.ts`
Expected: PASS semua.

Run: `npx vitest run > "$WS/t1.log" 2>&1; grep -E "Test Files|Tests " "$WS/t1.log"; npx eslint src/lib tests/integration/invoice-world.ts tests/integration/expense-schema.test.ts`
Expected: semua PASS, eslint bersih.

```bash
git add prisma/schema.prisma prisma/migrations/20261007220000_pengeluaran src/lib/permissions.ts \
  tests/integration/invoice-world.ts tests/integration/expense-schema.test.ts \
  tests/unit/migrations.test.ts tests/unit/permissions.test.ts
git commit -m "feat: add expense tables, default categories, and finance report capabilities"
```

---

### Task 2: Aturan pengeluaran — validasi dan bulan berulang

**Files:**
- Create: `src/lib/expense.ts`, `tests/unit/expense.test.ts`

**Interfaces:**
- Consumes: `isDateString`, `MAX_AMOUNT`, `Validation` (`src/lib/stock.ts`).
- Produces (`src/lib/expense.ts`, murni):
  - konstanta `EXPENSE_NOTE_MAX = 300`, `CATEGORY_NAME_MAX = 60`;
  - bulan: `isMonthString(value: unknown): value is string`, `currentMonthOf(today: string): string`, `addMonths(month: string, count: number): string`, `monthsBetween(from: string, to: string): string[]` (inklusif, naik; kosong bila `from > to`), `dueMonths(template: { startMonth: string; endMonth: string | null }, currentMonth: string): string[]`, `recurringDate(month: string, dayOfMonth: number): string`;
  - `ExpenseData = { date: string; categoryId: string; amount: number; note: string | null; branchId: string | null }`, `validateExpense(raw: unknown, ctx: { today: string }): Validation<ExpenseData>`;
  - `validateCategoryName(raw: unknown): Validation<string>`;
  - `RecurringData = { categoryId: string; amount: number; note: string | null; branchId: string | null; dayOfMonth: number; startMonth: string; endMonth: string | null }`, `validateRecurring(raw: unknown, ctx: { currentMonth: string }): Validation<RecurringData>`;
  - `RecurringUpdateData = { amount: number; note: string | null; dayOfMonth: number; endMonth: string | null }`, `validateRecurringUpdate(raw: unknown, ctx: { startMonth: string }): Validation<RecurringUpdateData>`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/unit/expense.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addMonths,
  currentMonthOf,
  dueMonths,
  isMonthString,
  monthsBetween,
  recurringDate,
  validateCategoryName,
  validateExpense,
  validateRecurring,
  validateRecurringUpdate,
} from "@/lib/expense";

describe("bulan", () => {
  it("mengenali dan menggeser bulan, melewati batas tahun", () => {
    expect(isMonthString("2026-10")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "2026-1", "26-10", "2026-10-01", 202610, null]) expect(isMonthString(bad)).toBe(false);
    expect(currentMonthOf("2026-10-07")).toBe("2026-10");
    expect(addMonths("2026-10", 1)).toBe("2026-11");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", -24)).toBe("2024-10");
  });

  it("daftar bulan inklusif; kosong bila terbalik", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-10", "2026-10")).toEqual(["2026-10"]);
    expect(monthsBetween("2026-11", "2026-10")).toEqual([]);
  });

  it("bulan jatuh tempo templat: dari mulai sampai bulan berjalan atau berakhir yang lebih awal", () => {
    expect(dueMonths({ startMonth: "2026-08", endMonth: null }, "2026-10")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(dueMonths({ startMonth: "2026-08", endMonth: "2026-09" }, "2026-10")).toEqual(["2026-08", "2026-09"]);
    expect(dueMonths({ startMonth: "2026-08", endMonth: "2027-03" }, "2026-10")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(dueMonths({ startMonth: "2026-12", endMonth: null }, "2026-10")).toEqual([]);
  });

  it("tanggal catatan berulang", () => {
    expect(recurringDate("2026-10", 5)).toBe("2026-10-05");
    expect(recurringDate("2026-02", 28)).toBe("2026-02-28");
  });
});

describe("validateExpense", () => {
  const ctx = { today: "2026-10-07" };
  const ok = { date: "2026-10-01", categoryId: "kat1", amount: 500000, note: "Sewa Oktober", branchId: "b1" };

  it("menerima isian yang sah; keterangan dan cabang kosong menjadi null", () => {
    expect(validateExpense(ok, ctx)).toEqual({ ok: true, value: ok });
    expect(validateExpense({ ...ok, note: "   ", branchId: "" }, ctx)).toEqual({ ok: true, value: { ...ok, note: null, branchId: null } });
    expect(validateExpense({ ...ok, note: undefined, branchId: null }, ctx)).toMatchObject({ ok: true, value: { note: null, branchId: null } });
    expect(validateExpense({ ...ok, date: "2026-10-07" }, ctx).ok).toBe(true);
  });

  it("menolak tanggal tidak ada atau di masa depan", () => {
    expect(validateExpense({ ...ok, date: "2026-10-08" }, ctx)).toEqual({ ok: false, message: "Tanggal pengeluaran tidak boleh di masa depan." });
    for (const date of ["2026-02-31", "kemarin", "", null]) {
      expect(validateExpense({ ...ok, date }, ctx)).toEqual({ ok: false, message: "Isi tanggal pengeluaran." });
    }
  });

  it("menolak nominal pecahan, nol, negatif, terlalu besar, atau bukan angka", () => {
    for (const amount of [0, -1, 1.5, Number.NaN, "100", null, 2_000_000_001]) {
      expect(validateExpense({ ...ok, amount }, ctx)).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
    }
    expect(validateExpense({ ...ok, amount: 2_000_000_000 }, ctx).ok).toBe(true);
  });

  it("menolak kategori kosong, keterangan terlalu panjang, dan masukan buatan", () => {
    expect(validateExpense({ ...ok, categoryId: "" }, ctx)).toEqual({ ok: false, message: "Pilih kategori." });
    expect(validateExpense({ ...ok, note: "x".repeat(301) }, ctx)).toEqual({ ok: false, message: "Keterangan paling banyak 300 karakter." });
    expect(validateExpense({ ...ok, note: "x".repeat(300) }, ctx).ok).toBe(true);
    expect(validateExpense(null, ctx)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
    expect(validateExpense({ ...ok, note: 5 }, ctx)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("validateCategoryName", () => {
  it("memangkas, menolak kosong dan terlalu panjang", () => {
    expect(validateCategoryName("  Servis AC ")).toEqual({ ok: true, value: "Servis AC" });
    expect(validateCategoryName("   ")).toEqual({ ok: false, message: "Isi nama kategori." });
    expect(validateCategoryName(undefined)).toEqual({ ok: false, message: "Isi nama kategori." });
    expect(validateCategoryName("x".repeat(61))).toEqual({ ok: false, message: "Nama kategori paling banyak 60 karakter." });
    expect(validateCategoryName(5)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("validateRecurring", () => {
  const ctx = { currentMonth: "2026-10" };
  const ok = { categoryId: "kat1", amount: 1000000, note: "Gaji", branchId: null, dayOfMonth: 25, startMonth: "2026-10", endMonth: null };

  it("menerima templat yang sah", () => {
    expect(validateRecurring(ok, ctx)).toEqual({ ok: true, value: ok });
    expect(validateRecurring({ ...ok, startMonth: "2024-10", endMonth: "2026-12" }, ctx).ok).toBe(true);
    expect(validateRecurring({ ...ok, startMonth: "2027-10" }, ctx).ok).toBe(true);
  });

  it("tanggal tiap bulan 1 sampai 28", () => {
    for (const dayOfMonth of [0, 29, 31, 1.5, "5", null]) {
      expect(validateRecurring({ ...ok, dayOfMonth }, ctx)).toEqual({ ok: false, message: "Tanggal tiap bulan harus 1 sampai 28." });
    }
    expect(validateRecurring({ ...ok, dayOfMonth: 1 }, ctx).ok).toBe(true);
    expect(validateRecurring({ ...ok, dayOfMonth: 28 }, ctx).ok).toBe(true);
  });

  it("bulan mulai: sah, paling jauh 24 bulan ke belakang dan 12 bulan ke depan", () => {
    expect(validateRecurring({ ...ok, startMonth: "oktober" }, ctx)).toEqual({ ok: false, message: "Isi bulan mulai." });
    expect(validateRecurring({ ...ok, startMonth: "2024-09" }, ctx)).toEqual({ ok: false, message: "Bulan mulai paling jauh 24 bulan ke belakang." });
    expect(validateRecurring({ ...ok, startMonth: "2027-11" }, ctx)).toEqual({ ok: false, message: "Bulan mulai paling jauh 12 bulan ke depan." });
  });

  it("bulan berakhir tidak boleh lebih awal dari mulai", () => {
    expect(validateRecurring({ ...ok, endMonth: "2026-09" }, ctx)).toEqual({
      ok: false,
      message: "Bulan berakhir tidak boleh lebih awal dari bulan mulai.",
    });
    expect(validateRecurring({ ...ok, endMonth: "x" }, ctx)).toEqual({ ok: false, message: "Bulan berakhir tidak sah." });
    expect(validateRecurring({ ...ok, endMonth: "2026-10" }, ctx).ok).toBe(true);
  });

  it("nominal harus bilangan bulat positif", () => {
    expect(validateRecurring({ ...ok, amount: 0 }, ctx)).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
  });
});

describe("validateRecurringUpdate", () => {
  it("memeriksa nominal, tanggal, dan bulan berakhir terhadap bulan mulai templat", () => {
    const ok = { amount: 1200000, note: "Gaji naik", dayOfMonth: 26, endMonth: null };
    expect(validateRecurringUpdate(ok, { startMonth: "2026-10" })).toEqual({ ok: true, value: ok });
    expect(validateRecurringUpdate({ ...ok, endMonth: "2026-09" }, { startMonth: "2026-10" })).toEqual({
      ok: false,
      message: "Bulan berakhir tidak boleh lebih awal dari bulan mulai.",
    });
    expect(validateRecurringUpdate({ ...ok, dayOfMonth: 30 }, { startMonth: "2026-10" })).toEqual({
      ok: false,
      message: "Tanggal tiap bulan harus 1 sampai 28.",
    });
  });
});
```

Run: `npx vitest run tests/unit/expense.test.ts`
Expected: FAIL, karena modul `@/lib/expense` tidak ditemukan.

- [ ] **Step 2: Modul**

Buat `src/lib/expense.ts`:

```ts
import { isDateString, MAX_AMOUNT, type Validation } from "./stock";

// Aturan murni pengeluaran (spec laporan 4, 5, 9). Dipakai server dan browser; tanpa akses basis data.

export const EXPENSE_NOTE_MAX = 300;
export const CATEGORY_NAME_MAX = 60;
export const RECURRING_BACK_MONTHS = 24;
export const RECURRING_AHEAD_MONTHS = 12;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const AMOUNT_MESSAGE = "Nominal harus bilangan bulat lebih dari 0.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
/** Teks dipangkas; kosong/null/undefined → "", bukan teks → null. */
function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : null;
}

// ---- Bulan ("YYYY-MM") --------------------------------------------------------------------

export function isMonthString(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

export function currentMonthOf(today: string): string {
  return today.slice(0, 7);
}

export function addMonths(month: string, count: number): string {
  const [year, mon] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Bulan dari `from` sampai `to`, inklusif dan naik; kosong bila `from` lebih akhir dari `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) months.push(month);
  return months;
}

/** Bulan yang harus sudah punya catatan: dari bulan mulai sampai bulan berjalan (atau bulan berakhir bila lebih awal). */
export function dueMonths(template: { startMonth: string; endMonth: string | null }, currentMonth: string): string[] {
  const last = template.endMonth !== null && template.endMonth < currentMonth ? template.endMonth : currentMonth;
  return monthsBetween(template.startMonth, last);
}

export function recurringDate(month: string, dayOfMonth: number): string {
  return `${month}-${String(dayOfMonth).padStart(2, "0")}`;
}

// ---- Pengeluaran ----------------------------------------------------------------------------

export type ExpenseData = { date: string; categoryId: string; amount: number; note: string | null; branchId: string | null };

/** Satu pengeluaran manual (spec laporan 9). Tanggal tidak boleh di masa depan. */
export function validateExpense(raw: unknown, ctx: { today: string }): Validation<ExpenseData> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (!isDateString(raw.date)) return fail("Isi tanggal pengeluaran.");
  if (raw.date > ctx.today) return fail("Tanggal pengeluaran tidak boleh di masa depan.");
  if (typeof raw.categoryId !== "string" || raw.categoryId === "" || raw.categoryId.length > 100) return fail("Pilih kategori.");
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail(AMOUNT_MESSAGE);
  const note = cleanText(raw.note);
  const branch = cleanText(raw.branchId);
  if (note === null || branch === null || branch.length > 100) return fail(INVALID_FORM);
  if (note.length > EXPENSE_NOTE_MAX) return fail(`Keterangan paling banyak ${EXPENSE_NOTE_MAX} karakter.`);
  return {
    ok: true,
    value: { date: raw.date, categoryId: raw.categoryId, amount: raw.amount, note: note === "" ? null : note, branchId: branch === "" ? null : branch },
  };
}

export function validateCategoryName(raw: unknown): Validation<string> {
  const name = cleanText(raw);
  if (name === null) return fail(INVALID_FORM);
  if (name === "") return fail("Isi nama kategori.");
  if (name.length > CATEGORY_NAME_MAX) return fail(`Nama kategori paling banyak ${CATEGORY_NAME_MAX} karakter.`);
  return { ok: true, value: name };
}

// ---- Templat berulang ------------------------------------------------------------------------

export type RecurringData = {
  categoryId: string;
  amount: number;
  note: string | null;
  branchId: string | null;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
};

const DAY_MESSAGE = "Tanggal tiap bulan harus 1 sampai 28.";

function endMonthOf(raw: unknown, startMonth: string): Validation<string | null> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (!isMonthString(raw)) return fail("Bulan berakhir tidak sah.");
  if (raw < startMonth) return fail("Bulan berakhir tidak boleh lebih awal dari bulan mulai.");
  return { ok: true, value: raw };
}

/** Templat baru (spec laporan 5, 9): tanggal 1–28, mulai paling jauh 24 bulan ke belakang dan 12 bulan ke depan. */
export function validateRecurring(raw: unknown, ctx: { currentMonth: string }): Validation<RecurringData> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (typeof raw.categoryId !== "string" || raw.categoryId === "" || raw.categoryId.length > 100) return fail("Pilih kategori.");
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail(AMOUNT_MESSAGE);
  if (!isWhole(raw.dayOfMonth, 1, 28)) return fail(DAY_MESSAGE);
  if (!isMonthString(raw.startMonth)) return fail("Isi bulan mulai.");
  if (raw.startMonth < addMonths(ctx.currentMonth, -RECURRING_BACK_MONTHS)) {
    return fail(`Bulan mulai paling jauh ${RECURRING_BACK_MONTHS} bulan ke belakang.`);
  }
  if (raw.startMonth > addMonths(ctx.currentMonth, RECURRING_AHEAD_MONTHS)) {
    return fail(`Bulan mulai paling jauh ${RECURRING_AHEAD_MONTHS} bulan ke depan.`);
  }
  const end = endMonthOf(raw.endMonth, raw.startMonth);
  if (!end.ok) return end;
  const note = cleanText(raw.note);
  const branch = cleanText(raw.branchId);
  if (note === null || branch === null || branch.length > 100) return fail(INVALID_FORM);
  if (note.length > EXPENSE_NOTE_MAX) return fail(`Keterangan paling banyak ${EXPENSE_NOTE_MAX} karakter.`);
  return {
    ok: true,
    value: {
      categoryId: raw.categoryId,
      amount: raw.amount,
      note: note === "" ? null : note,
      branchId: branch === "" ? null : branch,
      dayOfMonth: raw.dayOfMonth,
      startMonth: raw.startMonth,
      endMonth: end.value,
    },
  };
}

export type RecurringUpdateData = { amount: number; note: string | null; dayOfMonth: number; endMonth: string | null };

/** Perubahan templat (spec laporan 7): kategori, cabang, dan bulan mulai tidak diubah. */
export function validateRecurringUpdate(raw: unknown, ctx: { startMonth: string }): Validation<RecurringUpdateData> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail(AMOUNT_MESSAGE);
  if (!isWhole(raw.dayOfMonth, 1, 28)) return fail(DAY_MESSAGE);
  const end = endMonthOf(raw.endMonth, ctx.startMonth);
  if (!end.ok) return end;
  const note = cleanText(raw.note);
  if (note === null) return fail(INVALID_FORM);
  if (note.length > EXPENSE_NOTE_MAX) return fail(`Keterangan paling banyak ${EXPENSE_NOTE_MAX} karakter.`);
  return { ok: true, value: { amount: raw.amount, note: note === "" ? null : note, dayOfMonth: raw.dayOfMonth, endMonth: end.value } };
}
```

Run: `npx vitest run tests/unit/expense.test.ts`
Expected: PASS semua.

- [ ] **Step 3: Lint, tipe, commit**

Run: `npx eslint src/lib/expense.ts tests/unit/expense.test.ts; npx tsc --noEmit -p . > "$WS/t2-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: eslint bersih, `tsc exit 0`.

```bash
git add src/lib/expense.ts tests/unit/expense.test.ts
git commit -m "feat: add pure expense rules for validation and recurring months"
```

---

### Task 3: Aturan laporan — periode, laba, arus kas, perbandingan, tren, dan CSV

**Files:**
- Create: `src/lib/report.ts`, `tests/unit/report.test.ts`

**Interfaces:**
- Consumes: `addMonths`, `currentMonthOf`, `monthsBetween` (Task 2); `addDaysToDateString`, `combineWitaDateAndMinutes` (`src/lib/time.ts`); `isDateString`, `dateLabel`, `Validation` (`src/lib/stock.ts`).
- Produces (`src/lib/report.ts`, murni):
  - periode: `ReportPeriod = { from: string; to: string }`, `MAX_REPORT_DAYS = 366`, `ReportPreset` (`"BULAN_INI" | "BULAN_LALU" | "TAHUN_INI" | "RENTANG"`), `REPORT_PRESETS`, `REPORT_PRESET_LABEL`, `isReportPreset(value: unknown): value is ReportPreset`, `monthPeriod(month: string): ReportPeriod`, `presetPeriod(preset: Exclude<ReportPreset, "RENTANG">, today: string): ReportPeriod`, `periodDays(period): number`, `validatePeriod(raw: unknown): Validation<ReportPeriod>`, `previousPeriod(period): ReportPeriod`, `periodInstants(period): { start: Date; end: Date }` (`end` eksklusif), `trendMonths(today: string, count?: number): string[]`, `periodLabel(period): string`;
  - angka: `RawReport`, `ReportTotals`, `CashFlow`, `ReportView`, `summarizeReport(raw: RawReport): ReportView`, `Delta`, `delta(current: number, previous: number): Delta`, `Comparison`, `compareReports(current: ReportTotals, previous: ReportTotals): Comparison`, `TrendPoint`, `trendPoint(month: string, view: ReportView): TrendPoint`, `profitLabel(netProfit: number): "Laba" | "Rugi"`;
  - CSV: `csvCell(value: string | number): string`, `toCsv(rows: (string | number)[][]): string`, `reportCsvRows(meta: { period: ReportPeriod; branchName: string }, view: ReportView): (string | number)[][]`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/unit/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  compareReports,
  csvCell,
  delta,
  monthPeriod,
  periodDays,
  periodInstants,
  presetPeriod,
  previousPeriod,
  profitLabel,
  reportCsvRows,
  summarizeReport,
  toCsv,
  trendMonths,
  trendPoint,
  validatePeriod,
  type RawReport,
} from "@/lib/report";

describe("periode", () => {
  it("preset: bulan ini, bulan lalu, tahun ini; Februari kabisat", () => {
    expect(presetPeriod("BULAN_INI", "2026-10-07")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetPeriod("BULAN_LALU", "2026-10-07")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetPeriod("BULAN_LALU", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetPeriod("TAHUN_INI", "2026-10-07")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(monthPeriod("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthPeriod("2027-02").to).toBe("2027-02-28");
  });

  it("jumlah hari inklusif", () => {
    expect(periodDays({ from: "2026-10-01", to: "2026-10-01" })).toBe(1);
    expect(periodDays({ from: "2026-10-01", to: "2026-10-31" })).toBe(31);
    expect(periodDays({ from: "2026-01-01", to: "2026-12-31" })).toBe(365);
  });

  it("validasi rentang: tanggal sah, tidak terbalik, paling lama 366 hari", () => {
    expect(validatePeriod({ from: "2026-10-01", to: "2026-10-07" })).toEqual({ ok: true, value: { from: "2026-10-01", to: "2026-10-07" } });
    expect(validatePeriod({ from: "2026-01-01", to: "2027-01-01" }).ok).toBe(true); // 366 hari
    expect(validatePeriod({ from: "2026-01-01", to: "2027-01-02" })).toEqual({ ok: false, message: "Rentang laporan paling lama 366 hari." });
    expect(validatePeriod({ from: "2026-10-08", to: "2026-10-07" })).toEqual({
      ok: false,
      message: "Tanggal dari tidak boleh setelah tanggal sampai.",
    });
    for (const raw of [{ from: "2026-02-31", to: "2026-03-01" }, { from: "", to: "2026-03-01" }, { from: "2026-03-01" }, null, "x"]) {
      expect(validatePeriod(raw)).toEqual({ ok: false, message: "Isi tanggal dari dan sampai." });
    }
  });

  it("periode sebelumnya: bulan penuh → bulan sebelumnya; tahun penuh → tahun sebelumnya; lainnya sepanjang sama", () => {
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-31" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousPeriod({ from: "2026-01-01", to: "2026-01-31" })).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousPeriod({ from: "2028-01-01", to: "2028-12-31" })).toEqual({ from: "2027-01-01", to: "2027-12-31" });
    expect(previousPeriod({ from: "2026-10-05", to: "2026-10-11" })).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(previousPeriod({ from: "2026-10-10", to: "2026-10-10" })).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-15" })).toEqual({ from: "2026-09-16", to: "2026-09-30" });
  });

  it("batas waktu WITA: dari pukul 00.00 WITA sampai (eksklusif) 00.00 WITA hari berikutnya", () => {
    const { start, end } = periodInstants({ from: "2035-01-01", to: "2035-01-31" });
    expect(start.toISOString()).toBe("2034-12-31T16:00:00.000Z");
    expect(end.toISOString()).toBe("2035-01-31T16:00:00.000Z");
    // 23.59 WITA tanggal terakhir masih di dalam; 00.00 WITA hari berikutnya di luar.
    expect(new Date("2035-01-31T15:59:00Z") < end).toBe(true);
    expect(new Date("2035-01-31T16:00:00Z") < end).toBe(false);
  });

  it("tren: 12 bulan berakhir di bulan berjalan", () => {
    const months = trendMonths("2026-10-07");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-11");
    expect(months[11]).toBe("2026-10");
    expect(trendMonths("2026-02-01", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

const RAW: RawReport = {
  service: 1_000_000,
  treatment: 500_000,
  goods: 300_000,
  discount: 100_000,
  upfrontFee: 200_000,
  upfrontOnline: 250_000,
  cogs: 120_000,
  outstanding: 50_000,
  invoiceCount: 12,
  expenses: [
    { categoryId: "k1", name: "Sewa", isActive: true, amount: 400_000 },
    { categoryId: "k2", name: "Gaji", isActive: true, amount: 600_000 },
  ],
  customerPaid: 1_500_000,
  supplierPaid: 300_000,
  supplierRefunded: 50_000,
};

describe("rumus laporan", () => {
  it("pendapatan, laba kotor, dan laba bersih", () => {
    const { totals } = summarizeReport(RAW);
    expect(totals).toMatchObject({
      service: 1_000_000,
      treatment: 500_000,
      goods: 300_000,
      discount: 100_000,
      upfront: 450_000,
      revenue: 2_150_000, // 1.000.000 + 500.000 + 300.000 − 100.000 + 450.000
      cogs: 120_000,
      grossProfit: 2_030_000,
      expenses: 1_000_000,
      netProfit: 1_030_000,
      outstanding: 50_000,
    });
  });

  it("pembayaran hutang supplier tidak mengurangi laba, hanya masuk arus kas", () => {
    const base = summarizeReport(RAW).totals.netProfit;
    expect(summarizeReport({ ...RAW, supplierPaid: 9_000_000 }).totals.netProfit).toBe(base);
    expect(summarizeReport({ ...RAW, customerPaid: 0 }).totals.netProfit).toBe(base);
  });

  it("arus kas: masuk = pembayaran customer + di muka; keluar = hutang neto + pengeluaran", () => {
    expect(summarizeReport(RAW).cash).toEqual({
      customer: 1_500_000,
      upfront: 450_000,
      inflow: 1_950_000,
      supplier: 250_000,
      expenses: 1_000_000,
      outflow: 1_250_000,
      net: 700_000,
    });
  });

  it("rugi: pengeluaran tanpa pendapatan; label Rugi bila negatif dan Laba bila nol atau positif", () => {
    const empty: RawReport = { ...RAW, service: 0, treatment: 0, goods: 0, discount: 0, upfrontFee: 0, upfrontOnline: 0, cogs: 0, outstanding: 0, invoiceCount: 0, customerPaid: 0, supplierPaid: 0, supplierRefunded: 0 };
    const view = summarizeReport(empty);
    expect(view.totals.netProfit).toBe(-1_000_000);
    expect(profitLabel(view.totals.netProfit)).toBe("Rugi");
    expect(profitLabel(0)).toBe("Laba");
    expect(profitLabel(5)).toBe("Laba");
    expect(summarizeReport({ ...empty, expenses: [] }).totals.netProfit).toBe(0);
  });

  it("perbandingan: selisih dan persen satu desimal; pembanding 0 tanpa persen", () => {
    expect(delta(110, 100)).toEqual({ amount: 10, percent: 10 });
    expect(delta(0, 100)).toEqual({ amount: -100, percent: -100 });
    expect(delta(5, 0)).toEqual({ amount: 5, percent: null });
    expect(delta(0, 0)).toEqual({ amount: 0, percent: null });
    expect(delta(-50, -100)).toEqual({ amount: 50, percent: 50 });
    expect(delta(1, 3)).toEqual({ amount: -2, percent: -66.7 });
  });

  it("compareReports membandingkan lima angka utama", () => {
    const current = summarizeReport(RAW).totals;
    const previous = summarizeReport({ ...RAW, service: 500_000 }).totals;
    const comparison = compareReports(current, previous);
    expect(comparison.revenue).toEqual({ amount: 500_000, percent: 30.3 });
    expect(comparison.expenses).toEqual({ amount: 0, percent: 0 });
    expect(Object.keys(comparison).sort()).toEqual(["cogs", "expenses", "grossProfit", "netProfit", "revenue"]);
  });

  it("titik tren: biaya = harga pokok + pengeluaran", () => {
    expect(trendPoint("2026-10", summarizeReport(RAW))).toEqual({ month: "2026-10", revenue: 2_150_000, cost: 1_120_000, netProfit: 1_030_000 });
  });
});

describe("CSV", () => {
  it("sel biasa tidak diubah; koma, kutip, dan baris baru dikutip", () => {
    expect(csvCell("Sewa")).toBe("Sewa");
    expect(csvCell(1500)).toBe("1500");
    expect(csvCell(-200)).toBe("-200");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('dia "bos"')).toBe('"dia ""bos"""');
    expect(csvCell("baris1\nbaris2")).toBe('"baris1\nbaris2"');
  });

  it("sel teks yang diawali karakter rumus dinetralkan", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+62812")).toBe("'+62812");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
    expect(csvCell("tidak =rumus")).toBe("tidak =rumus");
  });

  it("toCsv: BOM, pemisah koma, akhir baris CRLF", () => {
    const csv = toCsv([["a", 1], ["b,c", 2]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿a,1\r\n"b,c",2\r\n');
  });

  it("baris laporan: ringkasan, kategori, dan arus kas; diskon negatif; kategori berbahaya dinetralkan", () => {
    const view = summarizeReport({ ...RAW, expenses: [{ categoryId: "x", name: "=HACK()", isActive: true, amount: 1000 }] });
    const rows = reportCsvRows({ period: { from: "2026-10-01", to: "2026-10-31" }, branchName: "Semua cabang" }, view);
    const flat = toCsv(rows);
    expect(rows[0]).toEqual(["Laporan untung-rugi"]);
    expect(rows).toContainEqual(["Periode", "2026-10-01", "2026-10-31"]);
    expect(rows).toContainEqual(["Cabang", "Semua cabang"]);
    expect(rows).toContainEqual(["Diskon", -100_000]);
    expect(rows).toContainEqual(["Total pendapatan", 2_150_000]);
    expect(rows).toContainEqual(["Harga pokok", 120_000]);
    expect(rows).toContainEqual(["Laba kotor", 2_030_000]);
    expect(rows).toContainEqual(["Kas bersih", 1_950_000 - 250_000 - 1000]);
    expect(flat).toContain("'=HACK()");
    expect(flat).not.toMatch(/(^|,|\r\n)=HACK/);
  });
});
```

Run: `npx vitest run tests/unit/report.test.ts`
Expected: FAIL, karena modul `@/lib/report` tidak ditemukan.

- [ ] **Step 2: Modul**

Buat `src/lib/report.ts`:

```ts
import { addMonths, currentMonthOf, monthsBetween } from "./expense";
import { dateLabel, isDateString, type Validation } from "./stock";
import { addDaysToDateString, combineWitaDateAndMinutes } from "./time";

// Aturan murni laporan untung-rugi (spec laporan 3, 8). Dipakai server dan browser; tanpa akses basis data.

export const MAX_REPORT_DAYS = 366;

export type ReportPeriod = { from: string; to: string };
export type ReportPreset = "BULAN_INI" | "BULAN_LALU" | "TAHUN_INI" | "RENTANG";
export const REPORT_PRESET_LABEL: Record<ReportPreset, string> = {
  BULAN_INI: "Bulan ini",
  BULAN_LALU: "Bulan lalu",
  TAHUN_INI: "Tahun ini",
  RENTANG: "Rentang bebas",
};
export const REPORT_PRESETS = Object.keys(REPORT_PRESET_LABEL) as ReportPreset[];

export function isReportPreset(value: unknown): value is ReportPreset {
  return typeof value === "string" && (REPORT_PRESETS as string[]).includes(value);
}

const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const DAY_MS = 24 * 3600_000;

// ---- Periode ---------------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Satu bulan kalender penuh ("YYYY-MM"). */
export function monthPeriod(month: string): ReportPeriod {
  const [year, mon] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(year, mon)).padStart(2, "0")}` };
}

export function presetPeriod(preset: Exclude<ReportPreset, "RENTANG">, today: string): ReportPeriod {
  const month = currentMonthOf(today);
  if (preset === "BULAN_INI") return monthPeriod(month);
  if (preset === "BULAN_LALU") return monthPeriod(addMonths(month, -1));
  const year = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Jumlah hari, inklusif. */
export function periodDays(period: ReportPeriod): number {
  return Math.round((Date.parse(period.to) - Date.parse(period.from)) / DAY_MS) + 1;
}

export function validatePeriod(raw: unknown): Validation<ReportPeriod> {
  if (typeof raw !== "object" || raw === null) return fail("Isi tanggal dari dan sampai.");
  const { from, to } = raw as Record<string, unknown>;
  if (!isDateString(from) || !isDateString(to)) return fail("Isi tanggal dari dan sampai.");
  if (from > to) return fail("Tanggal dari tidak boleh setelah tanggal sampai.");
  if (periodDays({ from, to }) > MAX_REPORT_DAYS) return fail(`Rentang laporan paling lama ${MAX_REPORT_DAYS} hari.`);
  return { ok: true, value: { from, to } };
}

function isFullMonth(period: ReportPeriod): boolean {
  return period.from.endsWith("-01") && monthPeriod(period.from.slice(0, 7)).to === period.to;
}

function isFullYear(period: ReportPeriod): boolean {
  const year = period.from.slice(0, 4);
  return period.from === `${year}-01-01` && period.to === `${year}-12-31`;
}

/** Periode pembanding (spec laporan 3.4): bulan penuh → bulan sebelumnya, tahun penuh → tahun sebelumnya, lainnya sepanjang sama. */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  if (isFullMonth(period)) return monthPeriod(addMonths(period.from.slice(0, 7), -1));
  if (isFullYear(period)) {
    const year = Number(period.from.slice(0, 4)) - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  const days = periodDays(period);
  const to = addDaysToDateString(period.from, -1);
  return { from: addDaysToDateString(to, -(days - 1)), to };
}

/** Batas instant periode di WITA; `end` eksklusif. */
export function periodInstants(period: ReportPeriod): { start: Date; end: Date } {
  return {
    start: combineWitaDateAndMinutes(period.from, 0),
    end: combineWitaDateAndMinutes(addDaysToDateString(period.to, 1), 0),
  };
}

/** Bulan-bulan tren, naik, berakhir di bulan berjalan. */
export function trendMonths(today: string, count = 12): string[] {
  const current = currentMonthOf(today);
  return monthsBetween(addMonths(current, -(count - 1)), current);
}

export function periodLabel(period: ReportPeriod): string {
  return period.from === period.to ? dateLabel(period.from) : `${dateLabel(period.from)} – ${dateLabel(period.to)}`;
}

// ---- Angka ------------------------------------------------------------------------------------

/** Angka mentah satu periode, dikumpulkan server dari basis data. */
export type RawReport = {
  service: number;
  treatment: number;
  goods: number;
  discount: number;
  upfrontFee: number;
  upfrontOnline: number;
  cogs: number;
  outstanding: number;
  invoiceCount: number;
  expenses: { categoryId: string; name: string; isActive: boolean; amount: number }[];
  customerPaid: number;
  supplierPaid: number;
  supplierRefunded: number;
};

export type ReportTotals = {
  service: number;
  treatment: number;
  goods: number;
  discount: number;
  upfront: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  outstanding: number;
};

export type CashFlow = {
  customer: number;
  upfront: number;
  inflow: number;
  supplier: number;
  expenses: number;
  outflow: number;
  net: number;
};

export type ReportView = {
  totals: ReportTotals;
  expensesByCategory: RawReport["expenses"];
  cash: CashFlow;
  invoiceCount: number;
  upfrontFee: number;
  upfrontOnline: number;
};

/** Rumus spec laporan 3.1–3.3. Pembayaran hutang supplier hanya masuk arus kas, tidak mengurangi laba. */
export function summarizeReport(raw: RawReport): ReportView {
  const upfront = raw.upfrontFee + raw.upfrontOnline;
  const revenue = raw.service + raw.treatment + raw.goods - raw.discount + upfront;
  const expenses = raw.expenses.reduce((sum, row) => sum + row.amount, 0);
  const grossProfit = revenue - raw.cogs;
  const supplier = raw.supplierPaid - raw.supplierRefunded;
  const inflow = raw.customerPaid + upfront;
  const outflow = supplier + expenses;
  return {
    totals: {
      service: raw.service,
      treatment: raw.treatment,
      goods: raw.goods,
      discount: raw.discount,
      upfront,
      revenue,
      cogs: raw.cogs,
      grossProfit,
      expenses,
      netProfit: grossProfit - expenses,
      outstanding: raw.outstanding,
    },
    expensesByCategory: raw.expenses,
    cash: { customer: raw.customerPaid, upfront, inflow, supplier, expenses, outflow, net: inflow - outflow },
    invoiceCount: raw.invoiceCount,
    upfrontFee: raw.upfrontFee,
    upfrontOnline: raw.upfrontOnline,
  };
}

export function profitLabel(netProfit: number): "Laba" | "Rugi" {
  return netProfit < 0 ? "Rugi" : "Laba";
}

export type Delta = { amount: number; percent: number | null };

/** Selisih dan persen perubahan (satu desimal); persen kosong bila pembanding 0. */
export function delta(current: number, previous: number): Delta {
  const amount = current - previous;
  if (previous === 0) return { amount, percent: null };
  return { amount, percent: Math.round((amount / Math.abs(previous)) * 1000) / 10 };
}

export type Comparison = Record<"revenue" | "cogs" | "grossProfit" | "expenses" | "netProfit", Delta>;

export function compareReports(current: ReportTotals, previous: ReportTotals): Comparison {
  return {
    revenue: delta(current.revenue, previous.revenue),
    cogs: delta(current.cogs, previous.cogs),
    grossProfit: delta(current.grossProfit, previous.grossProfit),
    expenses: delta(current.expenses, previous.expenses),
    netProfit: delta(current.netProfit, previous.netProfit),
  };
}

export type TrendPoint = { month: string; revenue: number; cost: number; netProfit: number };

/** Satu titik tren: biaya = harga pokok + pengeluaran. */
export function trendPoint(month: string, view: ReportView): TrendPoint {
  return { month, revenue: view.totals.revenue, cost: view.totals.cogs + view.totals.expenses, netProfit: view.totals.netProfit };
}

// ---- CSV (spec laporan 8) ----------------------------------------------------------------------

/** Sel CSV: teks yang diawali karakter rumus diberi awalan `'`; sel berisi koma, kutip, atau baris baru dikutip. */
export function csvCell(value: string | number): string {
  let text = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && /^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** UTF-8 dengan BOM, pemisah koma, akhir baris CRLF. */
export function toCsv(rows: (string | number)[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function reportCsvRows(meta: { period: ReportPeriod; branchName: string }, view: ReportView): (string | number)[][] {
  const { totals, cash } = view;
  return [
    ["Laporan untung-rugi"],
    ["Periode", meta.period.from, meta.period.to],
    ["Cabang", meta.branchName],
    [],
    ["Ringkasan", "Jumlah (Rp)"],
    ["Layanan", totals.service],
    ["Treatment", totals.treatment],
    ["Obat dan produk", totals.goods],
    ["Diskon", -totals.discount],
    ["Biaya booking (di muka)", view.upfrontFee],
    ["Konsultasi Online (di muka)", view.upfrontOnline],
    ["Total pendapatan", totals.revenue],
    ["Harga pokok", totals.cogs],
    ["Laba kotor", totals.grossProfit],
    ["Pengeluaran", totals.expenses],
    [profitLabel(totals.netProfit) === "Rugi" ? "Rugi bersih" : "Laba bersih", totals.netProfit],
    ["Belum tertagih (informasi)", totals.outstanding],
    [],
    ["Pengeluaran per kategori", "Jumlah (Rp)"],
    ...view.expensesByCategory.map((row) => [row.name, row.amount]),
    [],
    ["Arus kas", "Jumlah (Rp)"],
    ["Pembayaran customer", cash.customer],
    ["Pendapatan di muka", cash.upfront],
    ["Total masuk", cash.inflow],
    ["Pembayaran hutang supplier (neto)", cash.supplier],
    ["Pengeluaran", cash.expenses],
    ["Total keluar", cash.outflow],
    ["Kas bersih", cash.net],
  ];
}
```

Run: `npx vitest run tests/unit/report.test.ts`
Expected: PASS semua. 
- [ ] **Step 3: Lint, tipe, commit**

Run: `npx eslint src/lib/report.ts tests/unit/report.test.ts; npx tsc --noEmit -p . > "$WS/t3-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: eslint bersih, `tsc exit 0`.

```bash
git add src/lib/report.ts tests/unit/report.test.ts
git commit -m "feat: add pure report rules for periods, profit, cash flow, comparison, and CSV"
```

---

### Task 4: Server — daftar, catat, dan batalkan pengeluaran; kelola kategori

**Files:**
- Create: `src/server/expense-read.ts`, `src/server/expense-actions.ts`
- Test: `tests/integration/expense-actions.test.ts`

**Interfaces:**
- Consumes: Task 1 (model dan kemampuan), Task 2 (`validateExpense`, `validateCategoryName`, `isMonthString`), Task 3 (`monthPeriod`), `validateReason`, `dateOnly`, `dateOnlyString` (`src/lib/stock.ts`), `formatRupiah`, `isUniqueViolation` (`@/server/db-errors`), `recordAudit`, `safeRevalidatePath`, `runAction`, `UserFacingError`, `requireCapability`.
- Produces:
  - `expense-read.ts` (`expense:manage`): `ExpenseRow = { id: string; date: string; categoryId: string; categoryName: string; amount: number; note: string | null; branchId: string | null; branchName: string | null; recurring: boolean; createdByName: string; voided: { at: Date; by: string; reason: string } | null }`, `listExpenses(filter: { month: string; categoryId?: string; branchId?: string }): Promise<ExpenseRow[]>` (tanggal turun; bulan tidak sah → kosong), `CategoryRow = { id: string; name: string; isActive: boolean }`, `listCategories(options?: { includeInactive?: boolean }): Promise<CategoryRow[]>` (bawaan hanya aktif);
  - `expense-actions.ts` (`"use server"`, `expense:manage`): `createExpense(input: { date: string; categoryId: string; amount: number; note?: string; branchId?: string | null }): Promise<ActionResult<{ id: string }>>`, `voidExpense(input: { id: string; reason: string }): Promise<ActionResult<void>>`, `createExpenseCategory(input: { name: string }): Promise<ActionResult<{ id: string }>>`, `setExpenseCategoryActive(input: { id: string; active: boolean }): Promise<ActionResult<void>>`; audit `expense.create`, `expense.void`, `expense-category.create`, `expense-category.update`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/expense-actions.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { createExpense, createExpenseCategory, setExpenseCategoryActive, voidExpense } from "@/server/expense-actions";
import { listCategories, listExpenses } from "@/server/expense-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "uji@sundy.test" },
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

const SLUG = "aksi-pengeluaran";
const WA = "6281200009001";
const today = witaDateString(new Date());

describe("pengeluaran dan kategori", () => {
  let world: BillingWorld;
  let categoryId: string;
  let comingSoonBranchId: string;
  let branchName: string;

  const input = (patch: Record<string, unknown> = {}) => ({ date: today, categoryId, amount: 250000, note: "Sewa Oktober", branchId: world.branchId, ...patch });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
    world = await createBillingWorld(SLUG, WA);
    branchName = (await prisma.branch.findUniqueOrThrow({ where: { id: world.branchId } })).name;
    categoryId = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Sewa` } })).id;
    comingSoonBranchId = (
      await prisma.branch.create({
        data: { slug: `${SLUG}-segera`, name: `Cabang ${SLUG} segera`, address: "Jl. Uji", whatsapp: "6285172228900", openingHours: "-", status: "SEGERA_HADIR", sortOrder: 91 },
      })
    ).id;
  });
  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.branch.deleteMany({ where: { slug: `${SLUG}-segera` } });
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
    await prisma.$disconnect();
  });

  it("mencatat pengeluaran: data tersimpan, pelaku tercatat, audit tanpa keterangan bebas", async () => {
    const { id } = await unwrap(createExpense(input({ note: "  Sewa  Oktober  " })));
    expect(await prisma.expense.findUniqueOrThrow({ where: { id } })).toMatchObject({
      amount: 250000,
      note: "Sewa  Oktober",
      branchId: world.branchId,
      createdByName: "Keuangan Uji",
      voidedAt: null,
      recurringId: null,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "expense.create", entityId: id } });
    expect(audit.summary).toContain(`${SLUG} Sewa`);
    expect(audit.summary).toContain("250.000");
    expect(audit.summary).not.toContain("Oktober");
  });

  it("pengeluaran umum (tanpa cabang) diterima", async () => {
    const { id } = await unwrap(createExpense(input({ branchId: null, note: "" })));
    expect(await prisma.expense.findUniqueOrThrow({ where: { id } })).toMatchObject({ branchId: null, note: null });
  });

  it("menolak permintaan buatan: tanggal, nominal, kategori, dan cabang yang tidak sah", async () => {
    expect(await createExpense(input({ date: addDaysToDateString(today, 1) }))).toEqual({
      ok: false,
      error: "Tanggal pengeluaran tidak boleh di masa depan.",
    });
    expect(await createExpense(input({ amount: 0 }))).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await createExpense(input({ amount: 10.5 }))).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await createExpense(input({ categoryId: "tidak-ada" }))).toEqual({ ok: false, error: "Kategori tidak ditemukan atau sudah nonaktif." });
    expect(await createExpense(input({ branchId: "tidak-ada" }))).toEqual({ ok: false, error: "Cabang tidak ditemukan atau belum aktif." });
    expect(await createExpense(input({ branchId: comingSoonBranchId }))).toEqual({ ok: false, error: "Cabang tidak ditemukan atau belum aktif." });
    await prisma.expenseCategory.update({ where: { id: categoryId }, data: { isActive: false } });
    expect(await createExpense(input())).toEqual({ ok: false, error: "Kategori tidak ditemukan atau sudah nonaktif." });
    await prisma.expenseCategory.update({ where: { id: categoryId }, data: { isActive: true } });
  });

  it("membatalkan pengeluaran: butuh alasan, tidak bisa dua kali, tidak dihapus", async () => {
    const { id } = await unwrap(createExpense(input()));
    expect(await voidExpense({ id, reason: "  " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(voidExpense({ id, reason: "Salah catat nominal" }));
    expect(await prisma.expense.findUniqueOrThrow({ where: { id } })).toMatchObject({ voidedByName: "Keuangan Uji", voidReason: "Salah catat nominal" });
    expect(await voidExpense({ id, reason: "lagi" })).toEqual({ ok: false, error: "Pengeluaran ini sudah dibatalkan." });
    expect(await voidExpense({ id: "tidak-ada", reason: "x" })).toEqual({ ok: false, error: "Pengeluaran tidak ditemukan." });
    expect(await prisma.auditLog.count({ where: { action: "expense.void", entityId: id } })).toBe(1);
  });

  it("kategori: tambah, nama kembar (tanpa membedakan huruf) ditolak, nonaktifkan dan aktifkan lagi", async () => {
    const { id } = await unwrap(createExpenseCategory({ name: `  ${SLUG} Servis AC ` }));
    expect((await prisma.expenseCategory.findUniqueOrThrow({ where: { id } })).name).toBe(`${SLUG} Servis AC`);
    expect(await createExpenseCategory({ name: `${SLUG.toUpperCase()} SERVIS AC` })).toEqual({ ok: false, error: "Kategori ini sudah ada." });
    expect(await createExpenseCategory({ name: "   " })).toEqual({ ok: false, error: "Isi nama kategori." });
    await unwrap(setExpenseCategoryActive({ id, active: false }));
    expect((await listCategories()).map((c) => c.id)).not.toContain(id);
    expect((await listCategories({ includeInactive: true })).map((c) => c.id)).toContain(id);
    await unwrap(setExpenseCategoryActive({ id, active: true }));
    expect((await listCategories()).map((c) => c.id)).toContain(id);
    expect(await setExpenseCategoryActive({ id: "tidak-ada", active: false })).toEqual({ ok: false, error: "Kategori tidak ditemukan." });
    expect(await prisma.auditLog.count({ where: { action: "expense-category.update", entityId: id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "expense-category.create", entityId: id } })).toBe(1);
  });

  it("daftar per bulan: urut tanggal turun, saringan kategori dan cabang, yang dibatalkan ikut dengan tandanya", async () => {
    const other = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Listrik` } })).id;
    const mk = (date: string, categoryId: string, amount: number, extra: Record<string, unknown> = {}) =>
      prisma.expense.create({ data: { date: new Date(`${date}T00:00:00Z`), categoryId, amount, createdById: "s1", createdByName: "Uji", branchId: world.branchId, ...extra } });
    const a = await mk("2035-03-05", categoryId, 100);
    const b = await mk("2035-03-20", other, 200);
    const c = await mk("2035-03-12", categoryId, 300, { voidedAt: new Date(), voidedByName: "Uji", voidReason: "Salah" });
    await mk("2035-04-01", categoryId, 400);
    await mk("2035-03-31", categoryId, 500, { branchId: null });

    const march = await listExpenses({ month: "2035-03", branchId: world.branchId });
    expect(march.map((r) => r.id)).toEqual([b.id, c.id, a.id]);
    expect(march.find((r) => r.id === c.id)?.voided).toMatchObject({ by: "Uji", reason: "Salah" });
    expect(march.find((r) => r.id === a.id)).toMatchObject({ date: "2035-03-05", categoryName: `${SLUG} Sewa`, branchName, voided: null, recurring: false });
    expect((await listExpenses({ month: "2035-03", branchId: world.branchId, categoryId: other })).map((r) => r.id)).toEqual([b.id]);
    expect((await listExpenses({ month: "2035-04", branchId: world.branchId })).map((r) => r.amount)).toEqual([400]);
    expect(await listExpenses({ month: "bukan-bulan" })).toEqual([]);
  });

  it("hak akses: Resepsionis, Dokter, dan Apoteker ditolak; Super Admin boleh", async () => {
    for (const role of ["RESEPSIONIS", "DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      await expect(createExpense(input())).rejects.toThrow(/forbidden: expense:manage/);
      await expect(voidExpense({ id: "x", reason: "x" })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(createExpenseCategory({ name: "x" })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(setExpenseCategoryActive({ id: "x", active: false })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(listExpenses({ month: "2035-03" })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(listCategories()).rejects.toThrow(/forbidden: expense:manage/);
    }
    actor.role = "SUPER_ADMIN";
    expect((await createExpense(input())).ok).toBe(true);
  });
});
```

Run: `npm run test:integration -- tests/integration/expense-actions.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 2: Pembacaan**

Buat `src/server/expense-read.ts`:

```ts
import { prisma } from "@/lib/db";
import { isMonthString } from "@/lib/expense";
import { monthPeriod } from "@/lib/report";
import { dateOnly, dateOnlyString } from "@/lib/stock";
import { requireCapability } from "@/server/session";

export type ExpenseRow = {
  id: string;
  date: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  note: string | null;
  branchId: string | null;
  branchName: string | null;
  recurring: boolean;
  createdByName: string;
  voided: { at: Date; by: string; reason: string } | null;
};

/** Daftar pengeluaran satu bulan (spec laporan 7): tanggal turun; yang dibatalkan ikut dengan tandanya. */
export async function listExpenses(filter: { month: string; categoryId?: string; branchId?: string }): Promise<ExpenseRow[]> {
  await requireCapability("expense:manage");
  if (!isMonthString(filter.month)) return [];
  const period = monthPeriod(filter.month);
  const rows = await prisma.expense.findMany({
    where: {
      date: { gte: dateOnly(period.from), lte: dateOnly(period.to) },
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      date: true,
      categoryId: true,
      amount: true,
      note: true,
      branchId: true,
      recurringId: true,
      createdByName: true,
      voidedAt: true,
      voidedByName: true,
      voidReason: true,
      category: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    date: dateOnlyString(row.date),
    categoryId: row.categoryId,
    categoryName: row.category.name,
    amount: row.amount,
    note: row.note,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    recurring: row.recurringId !== null,
    createdByName: row.createdByName,
    voided: row.voidedAt ? { at: row.voidedAt, by: row.voidedByName ?? "", reason: row.voidReason ?? "" } : null,
  }));
}

export type CategoryRow = { id: string; name: string; isActive: boolean };

/** Kategori pengeluaran; bawaannya hanya yang aktif (untuk formulir). */
export async function listCategories(options: { includeInactive?: boolean } = {}): Promise<CategoryRow[]> {
  await requireCapability("expense:manage");
  return prisma.expenseCategory.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });
}
```

- [ ] **Step 3: Aksi**

Buat `src/server/expense-actions.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { validateCategoryName, validateExpense } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

function revalidateExpenses() {
  safeRevalidatePath("/admin/pengeluaran");
  safeRevalidatePath("/admin/laporan");
  safeRevalidatePath("/admin");
}

/** Catat satu pengeluaran (spec laporan 7, 9). Ringkasan audit memuat kategori dan nominal, bukan keterangan. */
export async function createExpense(input: {
  date: string;
  categoryId: string;
  amount: number;
  note?: string;
  branchId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const checked = validateExpense(input, { today: witaDateString(new Date()) });
    if (!checked.ok) throw new UserFacingError(checked.message);
    const data = checked.value;

    const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId }, select: { name: true, isActive: true } });
    if (!category || !category.isActive) throw new UserFacingError("Kategori tidak ditemukan atau sudah nonaktif.");
    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId }, select: { status: true } });
      if (!branch || branch.status !== "AKTIF") throw new UserFacingError("Cabang tidak ditemukan atau belum aktif.");
    }

    const created = await prisma.expense.create({
      data: {
        date: dateOnly(data.date),
        categoryId: data.categoryId,
        amount: data.amount,
        note: data.note,
        branchId: data.branchId,
        createdById: actor.staffId,
        createdByName: actor.name,
      },
      select: { id: true },
    });
    await recordAudit({
      actor,
      action: "expense.create",
      entity: "Expense",
      entityId: created.id,
      summary: `${category.name} ${formatRupiah(data.amount)}`,
    });
    revalidateExpenses();
    return { id: created.id };
  });
}

/** Batalkan pengeluaran salah catat (spec laporan 9): tidak dihapus, wajib beralasan, tidak bisa dua kali. */
export async function voidExpense(input: { id: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.id ?? "");

    const { count } = await prisma.expense.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidedByName: actor.name, voidReason: reason.value },
    });
    const row = await prisma.expense.findUnique({ where: { id }, select: { amount: true, category: { select: { name: true } } } });
    if (!row) throw new UserFacingError("Pengeluaran tidak ditemukan.");
    if (count === 0) throw new UserFacingError("Pengeluaran ini sudah dibatalkan.");

    await recordAudit({ actor, action: "expense.void", entity: "Expense", entityId: id, summary: `${row.category.name} ${formatRupiah(row.amount)}` });
    revalidateExpenses();
  });
}

export async function createExpenseCategory(input: { name: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const checked = validateCategoryName(input?.name);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const last = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
    try {
      const created = await prisma.expenseCategory.create({
        data: { name: checked.value, sortOrder: (last._max.sortOrder ?? 0) + 1 },
        select: { id: true },
      });
      await recordAudit({ actor, action: "expense-category.create", entity: "ExpenseCategory", entityId: created.id, summary: checked.value });
      revalidateExpenses();
      return { id: created.id };
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError("Kategori ini sudah ada.");
      throw error;
    }
  });
}

export async function setExpenseCategoryActive(input: { id: string; active: boolean }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const id = String(input?.id ?? "");
    const category = await prisma.expenseCategory.findUnique({ where: { id }, select: { name: true } });
    if (!category) throw new UserFacingError("Kategori tidak ditemukan.");
    const active = input.active === true;
    await prisma.expenseCategory.update({ where: { id }, data: { isActive: active } });
    await recordAudit({
      actor,
      action: "expense-category.update",
      entity: "ExpenseCategory",
      entityId: id,
      summary: `${category.name}: ${active ? "diaktifkan" : "dinonaktifkan"}`,
    });
    revalidateExpenses();
  });
}
```

Run: `npm run test:integration -- tests/integration/expense-actions.test.ts`
Expected: PASS semua. (`isUniqueViolation` harus mengenali pelanggaran indeks unik `lower(name)`: kode Postgres 23505. Bila tidak, periksa implementasi `src/server/db-errors.ts` dan sesuaikan uji pada pesan galat yang sebenarnya, bukan sebaliknya.)

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t4.log" 2>&1; grep -E "Test Files|Tests " "$WS/t4.log"; npx eslint src/server/expense-*.ts tests/integration/expense-actions.test.ts; npx tsc --noEmit -p . > "$WS/t4-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/expense-read.ts src/server/expense-actions.ts tests/integration/expense-actions.test.ts
git commit -m "feat: record, void, and list expenses and manage expense categories"
```

---

### Task 5: Server — laporan untung-rugi, perbandingan, tren, dan laba bulan ini

**Files:**
- Create: `src/server/report-read.ts`
- Modify: `tests/integration/invoice-world.ts` (pembersihan pembayaran supplier)
- Test: `tests/integration/report-read.test.ts`

**Interfaces:**
- Consumes: Task 1 (model, kemampuan), Task 2 (`currentMonthOf`), Task 3 (`validatePeriod`, `periodInstants`, `previousPeriod`, `monthPeriod`, `trendMonths`, `summarizeReport`, `compareReports`, `trendPoint`, tipe `RawReport`/`ReportView`/`Comparison`/`TrendPoint`/`ReportPeriod`), `discountAmount`, `invoiceTotals` (`src/lib/invoice.ts`), `dateOnly` (`src/lib/stock.ts`), `witaDateString`, `requireCapability`.
- Produces (`report-read.ts`, tanpa `"use server"`, kemampuan `profit:read`):
  - `ProfitReport = { period: ReportPeriod; previousPeriod: ReportPeriod; branchId: string | null; branchName: string; current: ReportView; previous: ReportView; comparison: Comparison; trend: TrendPoint[] }`;
  - `getProfitReport(filter: { period: ReportPeriod; branchId: string | null }, now?: Date): Promise<ProfitReport>` (periode tidak sah atau cabang tidak ada → `Error` berpesan jelas);
  - `getMonthProfit(now?: Date): Promise<{ month: string; revenue: number; netProfit: number }>` (semua cabang, bulan berjalan);
  - `collectReport(period: ReportPeriod, branchId: string | null): Promise<RawReport>` (dipakai ekspor CSV di Task 7).

- [ ] **Step 1: Pembersihan uji dan uji integrasi (gagal)**

Di `tests/integration/invoice-world.ts`, pada `cleanupBillingWorld`, tepat sebelum baris `await prisma.purchaseLine.deleteMany(...)` tambahkan:

```ts
  await prisma.supplierPayment.deleteMany({ where: { invoice: { branch } } });
```

Buat `tests/integration/report-read.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getMonthProfit, getProfitReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER" | "TERAPIS";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "uji@sundy.test" },
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

const SLUG = "baca-laporan";
const WA = "6281200009002";
/** Waktu WITA (UTC+8). */
const at = (date: string, time = "12:00") => new Date(`${date}T${time}:00+08:00`);
const day = (date: string) => new Date(`${date}T00:00:00Z`);
const MARCH = { from: "2035-03-01", to: "2035-03-31" };
const NOW = at("2035-03-15");

describe("laporan untung-rugi", () => {
  let world: BillingWorld;
  let otherBranchId: string;
  let sewa: string;
  let gaji: string;
  let retired: string;
  let seq = 0;
  const appointmentIds: string[] = [];

  async function invoice(input: {
    status?: "FINAL" | "DRAF" | "DIBATALKAN";
    finalizedAt?: Date;
    branchId?: string;
    lines: { kind: "LAYANAN" | "TREATMENT" | "BARANG"; quantity: number; unitPrice: number; cost?: number }[];
    discount?: number;
    payments?: { amount: number; paidAt: string; revoked?: boolean }[];
  }) {
    const status = input.status ?? "FINAL";
    seq += 1;
    return prisma.invoice.create({
      data: {
        patientId: world.patientId,
        branchId: input.branchId ?? world.branchId,
        status,
        number: status === "DRAF" ? null : `TG-2035-${String(seq).padStart(4, "0")}`,
        finalizedAt: status === "FINAL" ? (input.finalizedAt ?? at("2035-03-10")) : null,
        cancelledAt: status === "DIBATALKAN" ? new Date() : null,
        discountKind: input.discount ? "NOMINAL" : null,
        discountValue: input.discount ?? 0,
        discountReason: input.discount ? "Uji" : null,
        createdById: "s1",
        createdByName: "Uji",
        lines: {
          create: input.lines.map((line, index) => ({
            kind: line.kind,
            name: `Baris ${index}`,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            sortOrder: index,
            ...(line.kind === "BARANG"
              ? { itemId: world.drugId, stockUses: { create: [{ batchId: "batch-uji", quantity: line.quantity, unitCost: line.cost ?? 0 }] } }
              : {}),
          })),
        },
        payments: {
          create: (input.payments ?? []).map((p) => ({
            amount: p.amount,
            method: "TUNAI" as const,
            paidAt: day(p.paidAt),
            staffId: "s1",
            staffName: "Uji",
            ...(p.revoked ? { revokedAt: new Date(), revokedByName: "Uji", revokeReason: "Salah" } : {}),
          })),
        },
      },
      select: { id: true },
    });
  }

  const expense = (date: string, categoryId: string, amount: number, extra: Record<string, unknown> = {}) =>
    prisma.expense.create({
      data: { date: day(date), categoryId, amount, createdById: "s1", createdByName: "Uji", branchId: world.branchId, ...extra },
    });

  const verify = (appointmentId: string, date: string) =>
    prisma.auditLog.create({
      data: { actorStaffId: "s1", actorName: "Uji", actorRole: "ADMIN_KEUANGAN", action: "appointment.verify", entity: "Appointment", entityId: appointmentId, createdAt: at(date) },
    });

  async function clean() {
    await prisma.auditLog.deleteMany({ where: { action: "appointment.verify", entityId: { in: appointmentIds } } });
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.branch.deleteMany({ where: { slug: `${SLUG}-b2` } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
  }

  beforeAll(async () => {
    await clean();
    world = await createBillingWorld(SLUG, WA);
    otherBranchId = (
      await prisma.branch.create({
        data: { slug: `${SLUG}-b2`, name: `Cabang ${SLUG} dua`, address: "Jl. Uji", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF", sortOrder: 92 },
      })
    ).id;
    sewa = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Sewa`, sortOrder: 1 } })).id;
    gaji = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Gaji`, sortOrder: 2 } })).id;
    retired = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Lama`, sortOrder: 3, isActive: false } })).id;

    // Tagihan Maret 2035 (cabang uji).
    await invoice({
      lines: [
        { kind: "LAYANAN", quantity: 1, unitPrice: 1_000_000 },
        { kind: "TREATMENT", quantity: 2, unitPrice: 250_000 },
        { kind: "BARANG", quantity: 3, unitPrice: 100_000, cost: 40_000 },
      ],
      discount: 100_000,
      payments: [
        { amount: 1_200_000, paidAt: "2035-03-12" },
        { amount: 500_000, paidAt: "2035-03-12", revoked: true },
      ],
    }); // total 1.700.000, dibayar 1.200.000, belum tertagih 500.000
    await invoice({ finalizedAt: at("2035-03-31", "23:59"), lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 200_000 }] });
    await invoice({ finalizedAt: at("2035-04-01", "00:00"), lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 999_999 }] }); // di luar: April
    await invoice({ finalizedAt: at("2035-02-28", "23:59"), lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 321_000 }] }); // Februari
    await invoice({ status: "DIBATALKAN", lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 777_777 }] });
    await invoice({ status: "DRAF", lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 555_555 }] });
    await invoice({
      branchId: otherBranchId,
      lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 5_000_000 }],
      payments: [{ amount: 1_000_000, paidAt: "2035-03-20" }],
    }); // cabang lain: belum tertagih 4.000.000

    // Pembayaran di muka: booking diverifikasi.
    const klinik1 = await finalVisit(world);
    const online = await finalVisit(world, { channel: "ONLINE", treatments: [] });
    const klinik2 = await finalVisit(world);
    const klinik3 = await finalVisit(world);
    appointmentIds.push(klinik1.appointmentId, online.appointmentId, klinik2.appointmentId, klinik3.appointmentId);
    await prisma.appointment.updateMany({ where: { id: { in: appointmentIds } }, data: { bookingFee: 100_000 } });
    await verify(klinik1.appointmentId, "2035-03-05");
    await verify(online.appointmentId, "2035-03-08");
    await verify(online.appointmentId, "2035-03-09"); // diverifikasi dua kali: dihitung sekali
    await verify(klinik2.appointmentId, "2035-02-20"); // pertama kali di Februari
    await verify(klinik2.appointmentId, "2035-03-15"); // diverifikasi ulang di Maret: tidak dihitung lagi
    await verify(klinik3.appointmentId, "2035-04-03"); // April

    // Pengeluaran.
    await expense("2035-03-02", sewa, 400_000);
    await expense("2035-03-25", gaji, 600_000);
    await expense("2035-03-26", sewa, 999_999, { voidedAt: new Date(), voidedByName: "Uji", voidReason: "Salah" });
    await expense("2035-03-20", gaji, 70_000, { branchId: null }); // umum
    await expense("2035-03-21", sewa, 30_000, { branchId: otherBranchId });
    await expense("2035-04-01", sewa, 5_000);

    // Pembayaran hutang supplier.
    const purchase = await prisma.purchaseInvoice.create({
      data: {
        supplierId: world.supplierId,
        branchId: world.branchId,
        invoiceNumber: "SPR-1",
        invoiceDate: day("2035-03-01"),
        dueDate: day("2035-04-01"),
        total: 1_000_000,
        createdById: "s1",
        createdByName: "Uji",
      },
    });
    const supplierPayment = (kind: "BAYAR" | "PENGEMBALIAN", amount: number, paidAt: string, revoked = false) =>
      prisma.supplierPayment.create({
        data: {
          invoiceId: purchase.id,
          kind,
          amount,
          method: "TRANSFER",
          paidAt: day(paidAt),
          staffId: "s1",
          staffName: "Uji",
          ...(revoked ? { revokedAt: new Date(), revokedByName: "Uji", revokeReason: "Salah" } : {}),
        },
      });
    await supplierPayment("BAYAR", 300_000, "2035-03-10");
    await supplierPayment("BAYAR", 100_000, "2035-03-11", true);
    await supplierPayment("PENGEMBALIAN", 50_000, "2035-03-15");
    await supplierPayment("BAYAR", 77_000, "2035-04-02");
  });

  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
  });

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("satu cabang: pendapatan, harga pokok, pengeluaran, laba, dan belum tertagih", async () => {
    const report = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    expect(report.branchName).toBe((await prisma.branch.findUniqueOrThrow({ where: { id: world.branchId } })).name);
    expect(report.current.totals).toEqual({
      service: 1_200_000,
      treatment: 500_000,
      goods: 300_000,
      discount: 100_000,
      upfront: 450_000, // biaya booking 200.000 + Konsultasi Online 250.000
      revenue: 2_350_000,
      cogs: 120_000,
      grossProfit: 2_230_000,
      expenses: 1_000_000, // yang dibatalkan, umum, cabang lain, dan April tidak ikut
      netProfit: 1_230_000,
      outstanding: 700_000,
    });
    expect(report.current.invoiceCount).toBe(2);
    expect(report.current.upfrontFee).toBe(200_000);
    expect(report.current.upfrontOnline).toBe(250_000);
    expect(report.current.expensesByCategory.map((c) => [c.name, c.amount])).toEqual([[`${SLUG} Sewa`, 400_000], [`${SLUG} Gaji`, 600_000]]);
  });

  it("arus kas: pembayaran customer yang berlaku + di muka; hutang supplier neto + pengeluaran; laba tidak berubah karenanya", async () => {
    const { current } = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    expect(current.cash).toEqual({
      customer: 1_200_000, // yang dibatalkan dan di cabang lain tidak ikut
      upfront: 450_000,
      inflow: 1_650_000,
      supplier: 250_000, // 300.000 bayar − 50.000 pengembalian; yang dibatalkan dan April tidak ikut
      expenses: 1_000_000,
      outflow: 1_250_000,
      net: 400_000,
    });
    expect(current.totals.netProfit).toBe(current.totals.grossProfit - current.totals.expenses);
  });

  it("semua cabang: ikut tagihan cabang lain, pengeluaran cabang lain, dan pengeluaran umum", async () => {
    const report = await getProfitReport({ period: MARCH, branchId: null }, NOW);
    expect(report.branchName).toBe("Semua cabang");
    expect(report.current.totals).toMatchObject({
      service: 6_200_000,
      revenue: 7_350_000,
      cogs: 120_000,
      expenses: 1_100_000, // 400.000 + 600.000 + umum 70.000 + cabang lain 30.000
      outstanding: 4_700_000,
    });
    expect(report.current.cash.customer).toBe(2_200_000);
    expect(report.current.invoiceCount).toBe(3);
  });

  it("batas hari WITA: 23.59 tanggal terakhir ikut, 00.00 hari berikutnya dan 23.59 sebelum periode tidak", async () => {
    const lastDay = await getProfitReport({ period: { from: "2035-03-31", to: "2035-03-31" }, branchId: world.branchId }, NOW);
    expect(lastDay.current.totals.revenue).toBe(200_000);
    const firstApril = await getProfitReport({ period: { from: "2035-04-01", to: "2035-04-01" }, branchId: world.branchId }, NOW);
    expect(firstApril.current.totals.service).toBe(999_999);
    const lastFeb = await getProfitReport({ period: { from: "2035-02-28", to: "2035-02-28" }, branchId: world.branchId }, NOW);
    expect(lastFeb.current.totals.service).toBe(321_000);
  });

  it("pendapatan di muka: diverifikasi dua kali dihitung sekali; dihitung di periode verifikasi pertamanya", async () => {
    const march = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    expect(march.current.upfrontFee).toBe(200_000); // klinik1 + online; klinik2 (Februari) dan klinik3 (April) tidak
    const feb = await getProfitReport({ period: { from: "2035-02-01", to: "2035-02-28" }, branchId: world.branchId }, NOW);
    expect(feb.current.upfrontFee).toBe(100_000); // klinik2
    expect(feb.current.upfrontOnline).toBe(0);
    const april = await getProfitReport({ period: { from: "2035-04-01", to: "2035-04-30" }, branchId: world.branchId }, NOW);
    expect(april.current.upfrontFee).toBe(100_000); // klinik3
  });

  it("perbandingan dengan bulan sebelumnya dan tren 12 bulan", async () => {
    const report = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    expect(report.previousPeriod).toEqual({ from: "2035-02-01", to: "2035-02-28" });
    expect(report.previous.totals).toMatchObject({ service: 321_000, upfront: 100_000, revenue: 421_000, expenses: 0, netProfit: 421_000 });
    expect(report.comparison.revenue).toEqual({ amount: 1_929_000, percent: 458.2 });
    expect(report.comparison.expenses).toEqual({ amount: 1_000_000, percent: null });

    expect(report.trend).toHaveLength(12);
    expect(report.trend[0].month).toBe("2034-04");
    expect(report.trend[11]).toEqual({ month: "2035-03", revenue: 2_350_000, cost: 1_120_000, netProfit: 1_230_000 });
    expect(report.trend[10]).toEqual({ month: "2035-02", revenue: 421_000, cost: 0, netProfit: 421_000 });
    expect(report.trend[9]).toEqual({ month: "2035-01", revenue: 0, cost: 0, netProfit: 0 });
  });

  it("periode kosong menghasilkan nol, bukan galat; kategori nonaktif tetap tampil", async () => {
    const empty = await getProfitReport({ period: { from: "2036-01-01", to: "2036-01-31" }, branchId: world.branchId }, NOW);
    expect(empty.current.totals.revenue).toBe(0);
    expect(empty.current.totals.netProfit).toBe(0);
    expect(empty.comparison.revenue).toEqual({ amount: 0, percent: null });

    await expense("2035-05-05", retired, 12_000);
    const may = await getProfitReport({ period: { from: "2035-05-01", to: "2035-05-31" }, branchId: world.branchId }, NOW);
    expect(may.current.expensesByCategory).toEqual([{ categoryId: retired, name: `${SLUG} Lama`, isActive: false, amount: 12_000 }]);
  });

  it("rentang tidak sah dan cabang yang tidak ada ditolak", async () => {
    await expect(getProfitReport({ period: { from: "2035-01-01", to: "2036-06-01" }, branchId: null }, NOW)).rejects.toThrow(
      "Rentang laporan paling lama 366 hari.",
    );
    await expect(getProfitReport({ period: { from: "2035-03-10", to: "2035-03-01" }, branchId: null }, NOW)).rejects.toThrow(
      "Tanggal dari tidak boleh setelah tanggal sampai.",
    );
    await expect(getProfitReport({ period: MARCH, branchId: "tidak-ada" }, NOW)).rejects.toThrow("Cabang tidak ditemukan.");
  });

  it("laba bulan ini (semua cabang) untuk dasbor", async () => {
    const month = await getMonthProfit(NOW);
    expect(month).toEqual({ month: "2035-03", revenue: 7_350_000, netProfit: 7_350_000 - 120_000 - 1_100_000 });
  });

  it("hak akses: hanya Admin Keuangan dan Super Admin", async () => {
    for (const role of ["DOKTER", "APOTEKER", "RESEPSIONIS", "TERAPIS"] as const) {
      actor.role = role;
      await expect(getProfitReport({ period: MARCH, branchId: null }, NOW)).rejects.toThrow(/forbidden: profit:read/);
      await expect(getMonthProfit(NOW)).rejects.toThrow(/forbidden: profit:read/);
    }
    actor.role = "SUPER_ADMIN";
    expect((await getProfitReport({ period: MARCH, branchId: null }, NOW)).current.totals.revenue).toBeGreaterThan(0);
  });
});
```

Run: `npm run test:integration -- tests/integration/report-read.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 2: Pembacaan laporan**

Buat `src/server/report-read.ts`:

```ts
import { prisma } from "@/lib/db";
import { currentMonthOf } from "@/lib/expense";
import { discountAmount, invoiceTotals } from "@/lib/invoice";
import {
  compareReports,
  monthPeriod,
  periodInstants,
  previousPeriod,
  summarizeReport,
  trendMonths,
  trendPoint,
  validatePeriod,
  type Comparison,
  type RawReport,
  type ReportPeriod,
  type ReportView,
  type TrendPoint,
} from "@/lib/report";
import { dateOnly } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

/**
 * Mengumpulkan angka mentah satu periode dan cabang (spec laporan 3). Tanpa tabel ringkasan:
 * semuanya dihitung langsung dari data sumber. `branchId` null = semua cabang (termasuk pengeluaran umum).
 */
export async function collectReport(period: ReportPeriod, branchId: string | null): Promise<RawReport> {
  const { start, end } = periodInstants(period);
  const dates = { gte: dateOnly(period.from), lte: dateOnly(period.to) };
  const branch = branchId ? { branchId } : {};

  const [invoices, expenseGroups, upfront, customerPaid, supplierGroups] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: "FINAL", finalizedAt: { gte: start, lt: end }, ...branch },
      select: {
        status: true,
        discountKind: true,
        discountValue: true,
        lines: { select: { kind: true, quantity: true, unitPrice: true, stockUses: { select: { quantity: true, unitCost: true } } } },
        payments: { select: { amount: true, revokedAt: true } },
      },
    }),
    prisma.expense.groupBy({ by: ["categoryId"], where: { voidedAt: null, date: dates, ...branch }, _sum: { amount: true } }),
    upfrontFor(start, end, branch),
    prisma.invoicePayment.aggregate({ where: { revokedAt: null, paidAt: dates, invoice: branch }, _sum: { amount: true } }),
    prisma.supplierPayment.groupBy({ by: ["kind"], where: { revokedAt: null, paidAt: dates, invoice: branch }, _sum: { amount: true } }),
  ]);

  const raw: RawReport = {
    service: 0,
    treatment: 0,
    goods: 0,
    discount: 0,
    upfrontFee: upfront.fee,
    upfrontOnline: upfront.online,
    cogs: 0,
    outstanding: 0,
    invoiceCount: invoices.length,
    expenses: [],
    customerPaid: customerPaid._sum.amount ?? 0,
    supplierPaid: supplierGroups.find((g) => g.kind === "BAYAR")?._sum.amount ?? 0,
    supplierRefunded: supplierGroups.find((g) => g.kind === "PENGEMBALIAN")?._sum.amount ?? 0,
  };

  for (const invoice of invoices) {
    let subtotal = 0;
    for (const line of invoice.lines) {
      const amount = line.quantity * line.unitPrice;
      subtotal += amount;
      if (line.kind === "LAYANAN") raw.service += amount;
      else if (line.kind === "TREATMENT") raw.treatment += amount;
      else raw.goods += amount;
      for (const use of line.stockUses) raw.cogs += use.quantity * use.unitCost;
    }
    raw.discount += discountAmount(subtotal, invoice.discountKind, invoice.discountValue);
    raw.outstanding += Math.max(0, invoiceTotals(invoice).balance);
  }

  if (expenseGroups.length > 0) {
    const categories = await prisma.expenseCategory.findMany({
      where: { id: { in: expenseGroups.map((g) => g.categoryId) } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true },
    });
    for (const category of categories) {
      const amount = expenseGroups.find((g) => g.categoryId === category.id)?._sum.amount ?? 0;
      raw.expenses.push({ categoryId: category.id, name: category.name, isActive: category.isActive, amount });
    }
  }
  return raw;
}

/**
 * Pendapatan di muka (spec laporan 3.1): biaya booking dan, untuk Konsultasi Online, harga layanannya, dari
 * booking yang PERTAMA kali diverifikasi di rentang ini. Satu booking dihitung sekali walau diverifikasi lagi.
 */
async function upfrontFor(start: Date, end: Date, branch: { branchId?: string }): Promise<{ fee: number; online: number }> {
  const inRange = await prisma.auditLog.findMany({
    where: { action: "appointment.verify", createdAt: { gte: start, lt: end } },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  if (inRange.length === 0) return { fee: 0, online: 0 };
  const earliest = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: { action: "appointment.verify", entityId: { in: inRange.map((row) => row.entityId) } },
    _min: { createdAt: true },
  });
  const firstHere = earliest
    .filter((row) => row._min.createdAt !== null && row._min.createdAt >= start && row._min.createdAt < end)
    .map((row) => row.entityId);
  if (firstHere.length === 0) return { fee: 0, online: 0 };
  const appointments = await prisma.appointment.findMany({
    where: { id: { in: firstHere }, ...branch },
    select: { bookingFee: true, servicePrice: true, channel: true },
  });
  let fee = 0;
  let online = 0;
  for (const appointment of appointments) {
    fee += appointment.bookingFee ?? 0;
    if (appointment.channel === "ONLINE") online += appointment.servicePrice ?? 0;
  }
  return { fee, online };
}

export type ProfitReport = {
  period: ReportPeriod;
  previousPeriod: ReportPeriod;
  branchId: string | null;
  branchName: string;
  current: ReportView;
  previous: ReportView;
  comparison: Comparison;
  trend: TrendPoint[];
};

/** Laporan satu periode dan cabang, dengan pembanding dan tren 12 bulan (spec laporan 3, 7). */
export async function getProfitReport(filter: { period: ReportPeriod; branchId: string | null }, now: Date = new Date()): Promise<ProfitReport> {
  await requireCapability("profit:read");
  const checked = validatePeriod(filter.period);
  if (!checked.ok) throw new Error(checked.message);
  let branchName = "Semua cabang";
  if (filter.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: filter.branchId }, select: { name: true } });
    if (!branch) throw new Error("Cabang tidak ditemukan.");
    branchName = branch.name;
  }

  const previous = previousPeriod(checked.value);
  const months = trendMonths(witaDateString(now));
  const [current, before, ...monthly] = await Promise.all([
    collectReport(checked.value, filter.branchId),
    collectReport(previous, filter.branchId),
    ...months.map((month) => collectReport(monthPeriod(month), filter.branchId)),
  ]);
  const currentView = summarizeReport(current);
  const previousView = summarizeReport(before);
  return {
    period: checked.value,
    previousPeriod: previous,
    branchId: filter.branchId,
    branchName,
    current: currentView,
    previous: previousView,
    comparison: compareReports(currentView.totals, previousView.totals),
    trend: months.map((month, index) => trendPoint(month, summarizeReport(monthly[index]))),
  };
}

/** Pendapatan dan laba bersih bulan berjalan, semua cabang, untuk kotak dasbor. */
export async function getMonthProfit(now: Date = new Date()): Promise<{ month: string; revenue: number; netProfit: number }> {
  await requireCapability("profit:read");
  const month = currentMonthOf(witaDateString(now));
  const view = summarizeReport(await collectReport(monthPeriod(month), null));
  return { month, revenue: view.totals.revenue, netProfit: view.totals.netProfit };
}
```

Run: `npm run test:integration -- tests/integration/report-read.test.ts`
Expected: PASS semua. Bila angka persen perbandingan (`458.2`) berbeda, hitung ulang: (2.350.000 − 421.000) / 421.000 = 4,5819 → `458.2`; perbaiki angka di uji hanya bila perhitungan tangan Anda berbeda.

- [ ] **Step 3: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t5.log" 2>&1; grep -E "Test Files|Tests " "$WS/t5.log"; npx eslint src/server/report-read.ts tests/integration/report-read.test.ts tests/integration/invoice-world.ts; npx tsc --noEmit -p . > "$WS/t5-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/report-read.ts tests/integration/report-read.test.ts tests/integration/invoice-world.ts
git commit -m "feat: compute the profit and loss report, cash flow, comparison, and trend from source data"
```

---

### Task 6: Server — pengeluaran berulang (susulan otomatis, tambah, ubah, hentikan)

**Files:**
- Create: `src/server/expense-store.ts`, `src/server/expense-recurring.ts`
- Modify: `src/server/expense-read.ts` (`listExpenses` memanggil susulan; tambah `listRecurring`), `src/server/report-read.ts` (`getProfitReport` dan `getMonthProfit` memanggil susulan)
- Test: `tests/integration/expense-recurring.test.ts`

**Interfaces:**
- Consumes: Task 1 (`RecurringExpense`, `Expense`, keunikan `(recurringId, recurringMonth)`), Task 2 (`validateRecurring`, `validateRecurringUpdate`, `currentMonthOf`, `dueMonths`, `recurringDate`, `addMonths`), Task 4 (`listExpenses`), Task 5 (`getProfitReport`, `getMonthProfit`), `recordAudit`, `formatRupiah`, `requireCapability`.
- Produces:
  - `expense-store.ts` (tanpa `"use server"`): `ensureRecurringExpenses(today: string, db?: Prisma.TransactionClient | typeof prisma, onlyTemplateId?: string): Promise<number>` — membuat catatan bulan yang belum ada untuk templat aktif (dari bulan mulai sampai bulan berjalan atau bulan berakhir bila lebih awal) lewat `createMany({ skipDuplicates: true })`; mengembalikan jumlah catatan baru. Catatan baru bernama pembuat `"Berulang (otomatis)"` (`createdById: "sistem"`) dan menyalin kategori, nominal, keterangan, dan cabang dari templat;
  - `expense-read.ts`: `RecurringRow = { id: string; categoryId: string; categoryName: string; amount: number; note: string | null; branchId: string | null; branchName: string | null; dayOfMonth: number; startMonth: string; endMonth: string | null; isActive: boolean }`, `listRecurring(): Promise<RecurringRow[]>` (`expense:manage`; aktif lebih dulu); `listExpenses`, `getProfitReport`, dan `getMonthProfit` memanggil `ensureRecurringExpenses` sebelum membaca;
  - `expense-recurring.ts` (`"use server"`, `expense:manage`): `createRecurringExpense(input: { categoryId: string; amount: number; note?: string; branchId?: string | null; dayOfMonth: number; startMonth: string; endMonth?: string | null }): Promise<ActionResult<{ id: string; generated: number }>>`, `updateRecurringExpense(input: { id: string; amount: number; note?: string; dayOfMonth: number; endMonth?: string | null }): Promise<ActionResult<void>>`, `stopRecurringExpense(input: { id: string }): Promise<ActionResult<void>>`; audit `expense-recurring.create`, `expense-recurring.update`, `expense-recurring.stop`. Ubah dan hentikan menyusul bulan yang sudah jatuh tempo lebih dulu, supaya catatan bulan-bulan itu memakai nilai lama.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/expense-recurring.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addMonths, currentMonthOf } from "@/lib/expense";
import { witaDateString } from "@/lib/time";
import { createRecurringExpense, stopRecurringExpense, updateRecurringExpense } from "@/server/expense-recurring";
import { voidExpense } from "@/server/expense-actions";
import { ensureRecurringExpenses } from "@/server/expense-store";
import { listExpenses, listRecurring } from "@/server/expense-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "uji@sundy.test" },
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

const SLUG = "berulang-uji";
const WA = "6281200009003";
const today = witaDateString(new Date());
const thisMonth = currentMonthOf(today);

describe("pengeluaran berulang", () => {
  let world: BillingWorld;
  let categoryId: string;

  const make = (patch: Record<string, unknown> = {}) =>
    createRecurringExpense({ categoryId, amount: 1_000_000, note: "Gaji staf", branchId: world.branchId, dayOfMonth: 25, startMonth: addMonths(thisMonth, -2), ...patch });
  const rowsOf = (recurringId: string) =>
    prisma.expense.findMany({ where: { recurringId }, orderBy: { recurringMonth: "asc" } });

  async function clean() {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.recurringExpense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
  }

  beforeAll(async () => {
    await clean();
    world = await createBillingWorld(SLUG, WA);
    categoryId = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Gaji` } })).id;
  });
  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("templat baru langsung membuat catatan dari bulan mulai sampai bulan berjalan, dengan nilai disalin dari templat", async () => {
    const { id, generated } = await unwrap(make());
    expect(generated).toBe(3);
    const rows = await rowsOf(id);
    expect(rows.map((r) => r.recurringMonth)).toEqual([addMonths(thisMonth, -2), addMonths(thisMonth, -1), thisMonth]);
    expect(rows[2]).toMatchObject({
      amount: 1_000_000,
      note: "Gaji staf",
      branchId: world.branchId,
      categoryId,
      createdByName: "Berulang (otomatis)",
      voidedAt: null,
    });
    expect(rows[2].date.toISOString().slice(0, 10)).toBe(`${thisMonth}-25`);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "expense-recurring.create", entityId: id } });
    expect(audit.summary).toContain(`${SLUG} Gaji`);
    expect(audit.summary).not.toContain("Gaji staf");

    const listed = await listExpenses({ month: thisMonth, branchId: world.branchId });
    expect(listed.find((r) => r.recurring)).toMatchObject({ amount: 1_000_000, categoryName: `${SLUG} Gaji`, recurring: true });
  });

  it("susulan idempoten dan aman dipanggil bersamaan: tidak pernah ada catatan ganda", async () => {
    const { id } = await unwrap(make({ note: "Sewa ruko" }));
    await Promise.all(Array.from({ length: 6 }, () => ensureRecurringExpenses(today)));
    await ensureRecurringExpenses(today);
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(3);
    expect(await ensureRecurringExpenses(today, prisma, id)).toBe(0);
  });

  it("membuka daftar menyusul bulan yang terlewat; catatan yang sudah dibatalkan tidak dibuat lagi", async () => {
    const { id } = await unwrap(make({ note: "Internet" }));
    const rows = await rowsOf(id);
    await prisma.expense.delete({ where: { id: rows[2].id } }); // bulan berjalan terlewat
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(2);
    await listExpenses({ month: thisMonth });
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(3);

    const first = (await rowsOf(id))[0];
    await unwrap(voidExpense({ id: first.id, reason: "Tidak jadi" }));
    await listExpenses({ month: thisMonth });
    const after = await rowsOf(id);
    expect(after).toHaveLength(3);
    expect(after[0].voidedAt).not.toBeNull();
  });

  it("mengubah templat: bulan yang sudah jatuh tempo memakai nilai lama, bulan depan memakai nilai baru", async () => {
    const { id } = await unwrap(make({ note: "Listrik" }));
    const rows = await rowsOf(id);
    await prisma.expense.delete({ where: { id: rows[2].id } }); // belum sempat dibuat
    await unwrap(updateRecurringExpense({ id, amount: 1_200_000, note: "Listrik naik", dayOfMonth: 10, endMonth: null }));

    const after = await rowsOf(id);
    expect(after).toHaveLength(3);
    expect(after.map((r) => r.amount)).toEqual([1_000_000, 1_000_000, 1_000_000]); // susulan memakai nilai lama
    expect(await prisma.recurringExpense.findUniqueOrThrow({ where: { id } })).toMatchObject({ amount: 1_200_000, note: "Listrik naik", dayOfMonth: 10 });

    const nextMonth = addMonths(thisMonth, 1);
    expect(await ensureRecurringExpenses(`${nextMonth}-02`, prisma, id)).toBe(1);
    const next = (await rowsOf(id)).at(-1)!;
    expect(next).toMatchObject({ recurringMonth: nextMonth, amount: 1_200_000, note: "Listrik naik" });
    expect(next.date.toISOString().slice(0, 10)).toBe(`${nextMonth}-10`);
    expect(await prisma.auditLog.count({ where: { action: "expense-recurring.update", entityId: id } })).toBe(1);
  });

  it("menghentikan templat: catatan lama tetap, tidak ada catatan baru, tidak bisa diubah atau dihentikan lagi", async () => {
    const { id } = await unwrap(make({ note: "Pemasaran" }));
    await unwrap(stopRecurringExpense({ id }));
    expect((await prisma.recurringExpense.findUniqueOrThrow({ where: { id } })).isActive).toBe(false);
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(3);
    expect(await ensureRecurringExpenses(`${addMonths(thisMonth, 3)}-01`)).toBeGreaterThanOrEqual(0);
    expect(await prisma.expense.count({ where: { recurringId: id } })).toBe(3);
    expect(await stopRecurringExpense({ id })).toEqual({ ok: false, error: "Templat ini sudah dihentikan." });
    expect(await updateRecurringExpense({ id, amount: 5, note: "", dayOfMonth: 1, endMonth: null })).toEqual({ ok: false, error: "Templat ini sudah dihentikan." });
    expect(await stopRecurringExpense({ id: "tidak-ada" })).toEqual({ ok: false, error: "Templat tidak ditemukan." });
    expect(await prisma.auditLog.count({ where: { action: "expense-recurring.stop", entityId: id } })).toBe(1);
    expect((await listRecurring()).find((r) => r.id === id)).toMatchObject({ isActive: false, categoryName: `${SLUG} Gaji` });
  });

  it("bulan berakhir membatasi susulan, dan bulan mulai di masa depan belum membuat apa pun", async () => {
    const ended = await unwrap(make({ note: "Kontrak", endMonth: addMonths(thisMonth, -1) }));
    expect(ended.generated).toBe(2);
    await ensureRecurringExpenses(`${addMonths(thisMonth, 6)}-01`);
    expect(await prisma.expense.count({ where: { recurringId: ended.id } })).toBe(2);

    const future = await unwrap(make({ note: "Sewa baru", startMonth: addMonths(thisMonth, 1) }));
    expect(future.generated).toBe(0);
    expect(await ensureRecurringExpenses(`${addMonths(thisMonth, 1)}-01`, prisma, future.id)).toBe(1);
  });

  it("menolak templat yang tidak sah: tanggal, bulan mulai, nominal, kategori, dan cabang", async () => {
    expect(await make({ dayOfMonth: 29 })).toEqual({ ok: false, error: "Tanggal tiap bulan harus 1 sampai 28." });
    expect(await make({ startMonth: addMonths(thisMonth, -25) })).toEqual({ ok: false, error: "Bulan mulai paling jauh 24 bulan ke belakang." });
    expect(await make({ amount: 0 })).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await make({ endMonth: addMonths(thisMonth, -5) })).toEqual({ ok: false, error: "Bulan berakhir tidak boleh lebih awal dari bulan mulai." });
    expect(await make({ categoryId: "tidak-ada" })).toEqual({ ok: false, error: "Kategori tidak ditemukan atau sudah nonaktif." });
    expect(await make({ branchId: "tidak-ada" })).toEqual({ ok: false, error: "Cabang tidak ditemukan atau belum aktif." });
  });

  it("hak akses: hanya Admin Keuangan dan Super Admin", async () => {
    for (const role of ["RESEPSIONIS", "DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      await expect(make()).rejects.toThrow(/forbidden: expense:manage/);
      await expect(updateRecurringExpense({ id: "x", amount: 1, note: "", dayOfMonth: 1, endMonth: null })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(stopRecurringExpense({ id: "x" })).rejects.toThrow(/forbidden: expense:manage/);
      await expect(listRecurring()).rejects.toThrow(/forbidden: expense:manage/);
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/expense-recurring.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 2: Susulan**

Buat `src/server/expense-store.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentMonthOf, dueMonths, recurringDate } from "@/lib/expense";
import { dateOnly } from "@/lib/stock";

// Tanpa "use server": pembantu server untuk pengeluaran, tidak dipanggil browser.

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Membuat catatan pengeluaran bulan-bulan yang belum ada untuk templat aktif (spec laporan 5): dari bulan
 * mulai sampai bulan berjalan, atau bulan berakhir bila lebih awal. Aman dipanggil bersamaan dan berulang:
 * keunikan `(recurringId, recurringMonth)` di basis data membuat penyisipan ganda dilewati
 * (`skipDuplicates` = ON CONFLICT DO NOTHING). Catatan yang sudah dibatalkan tidak dibuat lagi.
 * Mengembalikan jumlah catatan baru.
 */
export async function ensureRecurringExpenses(today: string, db: Db = prisma, onlyTemplateId?: string): Promise<number> {
  const month = currentMonthOf(today);
  const templates = await db.recurringExpense.findMany({ where: { isActive: true, ...(onlyTemplateId ? { id: onlyTemplateId } : {}) } });
  let created = 0;
  for (const template of templates) {
    const rows = dueMonths(template, month).map((recurringMonth) => ({
      date: dateOnly(recurringDate(recurringMonth, template.dayOfMonth)),
      categoryId: template.categoryId,
      amount: template.amount,
      note: template.note,
      branchId: template.branchId,
      recurringId: template.id,
      recurringMonth,
      createdById: "sistem",
      createdByName: "Berulang (otomatis)",
    }));
    if (rows.length === 0) continue;
    created += (await db.expense.createMany({ data: rows, skipDuplicates: true })).count;
  }
  return created;
}
```

Di `src/server/expense-read.ts`:
1. Impor `import { witaDateString } from "@/lib/time";` dan `import { ensureRecurringExpenses } from "@/server/expense-store";`.
2. Pada `listExpenses`, tepat sesudah `await requireCapability("expense:manage");`, tambahkan `await ensureRecurringExpenses(witaDateString(new Date()));`.
3. Tambahkan di akhir berkas:

```ts
export type RecurringRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  note: string | null;
  branchId: string | null;
  branchName: string | null;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  isActive: boolean;
};

/** Templat pengeluaran berulang; yang aktif lebih dulu. */
export async function listRecurring(): Promise<RecurringRow[]> {
  await requireCapability("expense:manage");
  const rows = await prisma.recurringExpense.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      categoryId: true,
      amount: true,
      note: true,
      branchId: true,
      dayOfMonth: true,
      startMonth: true,
      endMonth: true,
      isActive: true,
      category: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  return rows.map(({ category, branch, ...row }) => ({ ...row, categoryName: category.name, branchName: branch?.name ?? null }));
}
```

Di `src/server/report-read.ts`: impor `import { ensureRecurringExpenses } from "@/server/expense-store";`; pada `getProfitReport` tepat sesudah `await requireCapability("profit:read");` tambahkan `await ensureRecurringExpenses(witaDateString(now));`, dan pada `getMonthProfit` tambahkan baris yang sama sesudah `requireCapability`.

- [ ] **Step 3: Aksi templat**

Buat `src/server/expense-recurring.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { currentMonthOf, validateRecurring, validateRecurringUpdate } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { ensureRecurringExpenses } from "@/server/expense-store";
import { requireCapability } from "@/server/session";

function revalidateRecurring() {
  safeRevalidatePath("/admin/pengeluaran");
  safeRevalidatePath("/admin/laporan");
  safeRevalidatePath("/admin");
}

/** Tambah templat berulang (spec laporan 5, 9). Catatan bulan yang sudah jatuh tempo langsung dibuat. */
export async function createRecurringExpense(input: {
  categoryId: string;
  amount: number;
  note?: string;
  branchId?: string | null;
  dayOfMonth: number;
  startMonth: string;
  endMonth?: string | null;
}): Promise<ActionResult<{ id: string; generated: number }>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const today = witaDateString(new Date());
    const checked = validateRecurring(input, { currentMonth: currentMonthOf(today) });
    if (!checked.ok) throw new UserFacingError(checked.message);
    const data = checked.value;

    const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId }, select: { name: true, isActive: true } });
    if (!category || !category.isActive) throw new UserFacingError("Kategori tidak ditemukan atau sudah nonaktif.");
    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId }, select: { status: true } });
      if (!branch || branch.status !== "AKTIF") throw new UserFacingError("Cabang tidak ditemukan atau belum aktif.");
    }

    const created = await prisma.recurringExpense.create({
      data: { ...data, createdById: actor.staffId, createdByName: actor.name },
      select: { id: true },
    });
    const generated = await ensureRecurringExpenses(today, prisma, created.id);
    await recordAudit({
      actor,
      action: "expense-recurring.create",
      entity: "RecurringExpense",
      entityId: created.id,
      summary: `${category.name} ${formatRupiah(data.amount)} tiap tanggal ${data.dayOfMonth}`,
    });
    revalidateRecurring();
    return { id: created.id, generated };
  });
}

/**
 * Ubah nominal, keterangan, tanggal, atau bulan berakhir templat. Bulan yang sudah jatuh tempo disusul lebih dulu
 * dengan nilai lama; perubahan hanya berlaku untuk bulan-bulan berikutnya (spec laporan 5).
 */
export async function updateRecurringExpense(input: {
  id: string;
  amount: number;
  note?: string;
  dayOfMonth: number;
  endMonth?: string | null;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const id = String(input?.id ?? "");
    const template = await prisma.recurringExpense.findUnique({
      where: { id },
      select: { isActive: true, startMonth: true, category: { select: { name: true } } },
    });
    if (!template) throw new UserFacingError("Templat tidak ditemukan.");
    if (!template.isActive) throw new UserFacingError("Templat ini sudah dihentikan.");
    const checked = validateRecurringUpdate(input, { startMonth: template.startMonth });
    if (!checked.ok) throw new UserFacingError(checked.message);

    await ensureRecurringExpenses(witaDateString(new Date()), prisma, id);
    const { count } = await prisma.recurringExpense.updateMany({ where: { id, isActive: true }, data: checked.value });
    if (count === 0) throw new UserFacingError("Templat ini sudah dihentikan.");
    await recordAudit({
      actor,
      action: "expense-recurring.update",
      entity: "RecurringExpense",
      entityId: id,
      summary: `${template.category.name} ${formatRupiah(checked.value.amount)} tiap tanggal ${checked.value.dayOfMonth}`,
    });
    revalidateRecurring();
  });
}

/** Hentikan templat: bulan yang sudah jatuh tempo disusul lebih dulu; catatan lama tetap. */
export async function stopRecurringExpense(input: { id: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("expense:manage");
    const id = String(input?.id ?? "");
    const template = await prisma.recurringExpense.findUnique({ where: { id }, select: { isActive: true, amount: true, category: { select: { name: true } } } });
    if (!template) throw new UserFacingError("Templat tidak ditemukan.");
    if (!template.isActive) throw new UserFacingError("Templat ini sudah dihentikan.");

    await ensureRecurringExpenses(witaDateString(new Date()), prisma, id);
    const { count } = await prisma.recurringExpense.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
    if (count === 0) throw new UserFacingError("Templat ini sudah dihentikan.");
    await recordAudit({
      actor,
      action: "expense-recurring.stop",
      entity: "RecurringExpense",
      entityId: id,
      summary: `${template.category.name} ${formatRupiah(template.amount)}`,
    });
    revalidateRecurring();
  });
}
```

Run: `npm run test:integration -- tests/integration/expense-recurring.test.ts tests/integration/expense-actions.test.ts tests/integration/report-read.test.ts`
Expected: PASS semua.

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t6.log" 2>&1; grep -E "Test Files|Tests " "$WS/t6.log"; npx eslint src/server tests/integration/expense-recurring.test.ts; npx tsc --noEmit -p . > "$WS/t6-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server tests/integration/expense-recurring.test.ts
git commit -m "feat: generate recurring expenses idempotently and manage recurring templates"
```

---


### Task 7: Unduh CSV — ekspor laporan dan rute unduhan

**Files:**
- Create: `src/server/report-export.ts`, `src/app/(admin)/admin/laporan/unduh/route.ts`
- Test: `tests/integration/report-export.test.ts`

**Interfaces:**
- Consumes: Task 3 (`validatePeriod`, `summarizeReport`, `toCsv`, `reportCsvRows`, `ReportPeriod`), Task 5 (`collectReport`), Task 6 (`ensureRecurringExpenses`), `recordAudit`, `requireCapability`, `getCurrentStaff` (`@/server/session`), `can` (`@/lib/permissions`).
- Produces:
  - `report-export.ts` (tanpa `"use server"`, `profit:read`): `exportReportCsv(filter: { period: ReportPeriod; branchId: string | null }): Promise<{ filename: string; csv: string }>` — nama berkas `laporan-untung-rugi-{dari}-{sampai}.csv`; mencatat audit `report.export` (entitas `Report`, ringkasan periode dan cabang);
  - rute `GET /admin/laporan/unduh?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&cabang=<id>`: 401 bila belum masuk, **403** bila tidak punya `profit:read`, 400 dengan pesan bila periode tidak sah atau cabang tidak ada, selain itu `text/csv; charset=utf-8` dengan `Content-Disposition: attachment` dan `Cache-Control: no-store`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/integration/report-export.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(admin)/admin/laporan/unduh/route";
import { prisma } from "@/lib/db";
import { exportReportCsv } from "@/server/report-export";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor, session } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "uji@sundy.test" },
  session: { signedIn: true },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    getCurrentStaff: vi.fn(async () => (session.signedIn ? actor : null)),
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "ekspor-laporan";
const WA = "6281200009004";
const MARCH = { from: "2035-03-01", to: "2035-03-31" };
const URL_BASE = "http://localhost/admin/laporan/unduh";

describe("ekspor laporan CSV", () => {
  let world: BillingWorld;
  let categoryId: string;

  async function clean() {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { contains: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { contains: SLUG } } });
    await prisma.auditLog.deleteMany({ where: { action: "report.export", summary: { contains: SLUG } } });
  }

  beforeAll(async () => {
    await clean();
    world = await createBillingWorld(SLUG, WA);
    // Nama kategori berbahaya: diawali "=" agar sel CSV-nya harus dinetralkan.
    categoryId = (await prisma.expenseCategory.create({ data: { name: `=HACK() ${SLUG}` } })).id;
    await prisma.expense.create({
      data: { date: new Date("2035-03-10T00:00:00Z"), categoryId, amount: 123_000, createdById: "s1", createdByName: "Uji", branchId: world.branchId },
    });
    await prisma.invoice.create({
      data: {
        patientId: world.patientId,
        branchId: world.branchId,
        status: "FINAL",
        number: "TG-2035-9001",
        finalizedAt: new Date("2035-03-10T12:00:00+08:00"),
        createdById: "s1",
        createdByName: "Uji",
        lines: { create: [{ kind: "LAYANAN", name: "Konsultasi", quantity: 1, unitPrice: 400_000 }] },
      },
    });
  });
  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
    session.signedIn = true;
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("CSV: BOM, ringkasan, kategori berbahaya dinetralkan, nama berkas, dan audit tanpa data sensitif", async () => {
    const { filename, csv } = await exportReportCsv({ period: MARCH, branchId: world.branchId });
    expect(filename).toBe("laporan-untung-rugi-2035-03-01-2035-03-31.csv");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Laporan untung-rugi\r\n");
    expect(csv).toContain("Periode,2035-03-01,2035-03-31");
    expect(csv).toContain("Total pendapatan,400000");
    expect(csv).toContain("Pengeluaran,123000");
    expect(csv).toContain(`'=HACK() ${SLUG},123000`);
    expect(csv).not.toMatch(/(^|\r\n)=HACK/);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "report.export", summary: { contains: SLUG } } });
    expect(audit.entity).toBe("Report");
    expect(audit.summary).toContain("2035-03-01");
  });

  it("periode tidak sah dan cabang yang tidak ada ditolak", async () => {
    await expect(exportReportCsv({ period: { from: "2035-03-10", to: "2035-03-01" }, branchId: null })).rejects.toThrow(
      "Tanggal dari tidak boleh setelah tanggal sampai.",
    );
    await expect(exportReportCsv({ period: MARCH, branchId: "tidak-ada" })).rejects.toThrow("Cabang tidak ditemukan.");
  });

  it("rute: 200 untuk Admin Keuangan dengan header unduhan", async () => {
    const response = await GET(new Request(`${URL_BASE}?dari=2035-03-01&sampai=2035-03-31&cabang=${world.branchId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="laporan-untung-rugi-2035-03-01-2035-03-31.csv"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("Total pendapatan,400000");
  });

  it("rute: 401 bila belum masuk, 403 untuk peran lain, 400 untuk periode atau cabang tidak sah", async () => {
    session.signedIn = false;
    expect((await GET(new Request(`${URL_BASE}?dari=2035-03-01&sampai=2035-03-31`))).status).toBe(401);
    session.signedIn = true;
    for (const role of ["RESEPSIONIS", "DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      expect((await GET(new Request(`${URL_BASE}?dari=2035-03-01&sampai=2035-03-31`))).status).toBe(403);
    }
    actor.role = "SUPER_ADMIN";
    expect((await GET(new Request(`${URL_BASE}?dari=2035-03-31&sampai=2035-03-01`))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?dari=2035-03-01&sampai=2035-03-31&cabang=tidak-ada`))).status).toBe(400);
    expect((await GET(new Request(URL_BASE))).status).toBe(400);
  });
});
```

Run: `npm run test:integration -- tests/integration/report-export.test.ts`
Expected: FAIL (modul dan rute belum ada).

- [ ] **Step 2: Ekspor dan rute**

Buat `src/server/report-export.ts`:

```ts
import { prisma } from "@/lib/db";
import { reportCsvRows, summarizeReport, toCsv, validatePeriod, type ReportPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { ensureRecurringExpenses } from "@/server/expense-store";
import { collectReport } from "@/server/report-read";
import { requireCapability } from "@/server/session";

/** CSV laporan untuk satu periode dan cabang (spec laporan 8). Unduhan dicatat di jejak audit. */
export async function exportReportCsv(filter: { period: ReportPeriod; branchId: string | null }): Promise<{ filename: string; csv: string }> {
  const actor = await requireCapability("profit:read");
  const checked = validatePeriod(filter.period);
  if (!checked.ok) throw new Error(checked.message);
  let branchName = "Semua cabang";
  if (filter.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: filter.branchId }, select: { name: true } });
    if (!branch) throw new Error("Cabang tidak ditemukan.");
    branchName = branch.name;
  }
  await ensureRecurringExpenses(witaDateString(new Date()));
  const view = summarizeReport(await collectReport(checked.value, filter.branchId));
  const { from, to } = checked.value;
  await recordAudit({
    actor,
    action: "report.export",
    entity: "Report",
    entityId: `${from}_${to}`,
    summary: `${from} sampai ${to} · ${branchName}`,
  });
  return { filename: `laporan-untung-rugi-${from}-${to}.csv`, csv: toCsv(reportCsvRows({ period: checked.value, branchName }, view)) };
}
```

Buat `src/app/(admin)/admin/laporan/unduh/route.ts`:

```ts
import { can } from "@/lib/permissions";
import { exportReportCsv } from "@/server/report-export";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Unduh CSV laporan. Pemeriksaan hak akses dilakukan di sini dan lagi di `exportReportCsv`. */
export async function GET(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Masuk dulu.", { status: 401 });
  if (!can(staff.role, "profit:read")) return new Response("Anda tidak berhak mengunduh laporan.", { status: 403 });

  const params = new URL(request.url).searchParams;
  try {
    const { filename, csv } = await exportReportCsv({
      period: { from: params.get("dari") ?? "", to: params.get("sampai") ?? "" },
      branchId: params.get("cabang") || null,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Gagal membuat laporan.", { status: 400 });
  }
}
```

Run: `npm run test:integration -- tests/integration/report-export.test.ts`
Expected: PASS semua. (Bila laporan pada uji pertama memuat baris `Pengeluaran,123000` dua kali — di ringkasan dan arus kas — `toContain` tetap benar; yang penting `'=HACK()` ada di bagian kategori.)

- [ ] **Step 3: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t7.log" 2>&1; grep -E "Test Files|Tests " "$WS/t7.log"; npx eslint src/server/report-export.ts "src/app/(admin)/admin/laporan" tests/integration/report-export.test.ts; npx tsc --noEmit -p . > "$WS/t7-tsc.log" 2>&1; echo "tsc exit $?"; npx vitest run tests/unit/architecture.test.ts`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/report-export.ts "src/app/(admin)/admin/laporan" tests/integration/report-export.test.ts
git commit -m "feat: export the profit and loss report as CSV with an authorized download route"
```

---

### Task 8: UI — halaman Pengeluaran (catatan, berulang, kategori)

**Files:**
- Create: `src/components/admin/expenses/expense-form-dialog.tsx`, `void-expense-dialog.tsx`, `expense-table.tsx`, `category-manager.tsx`, `recurring-dialog.tsx`, `recurring-table.tsx`, `stop-recurring-button.tsx`
- Create: `src/app/(admin)/admin/pengeluaran/page.tsx`
- Test: `tests/unit/expense-ui.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`validateExpense`, `validateRecurring`, `validateRecurringUpdate`, `currentMonthOf`, `addMonths`, `isMonthString`), Task 4 (`createExpense`, `voidExpense`, `createExpenseCategory`, `setExpenseCategoryActive`, `listExpenses`, `listCategories`, tipe `ExpenseRow`/`CategoryRow`), Task 6 (`createRecurringExpense`, `updateRecurringExpense`, `stopRecurringExpense`, `listRecurring`, tipe `RecurringRow`), `validateReason`, `RupiahInput` (`src/components/admin/rupiah-input.tsx`), `dateLabel`, `formatRupiah`, `getBranches` (`@/server/catalog`), `PageTabs`, `PageHeader`, `SectionCard`, `EmptyState`.
- Produces: halaman `/admin/pengeluaran?tab=catatan|berulang|kategori&bulan=YYYY-MM&kategori=<id>&cabang=<id>`; komponen `ExpenseFormDialog({ categories, branches, today })`, `VoidExpenseDialog({ id, label })`, `ExpenseTable({ rows })`, `CategoryManager({ categories })`, `RecurringDialog({ categories, branches, currentMonth, row? })`, `RecurringTable({ rows, categories, branches, currentMonth })`, `StopRecurringButton({ id, label })`.

- [ ] **Step 1: Tulis uji komponen (gagal)**

Buat `tests/unit/expense-ui.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryManager } from "@/components/admin/expenses/category-manager";
import { ExpenseFormDialog } from "@/components/admin/expenses/expense-form-dialog";
import { ExpenseTable } from "@/components/admin/expenses/expense-table";
import { RecurringDialog } from "@/components/admin/expenses/recurring-dialog";
import { StopRecurringButton } from "@/components/admin/expenses/stop-recurring-button";
import { VoidExpenseDialog } from "@/components/admin/expenses/void-expense-dialog";
import type { CategoryRow, ExpenseRow, RecurringRow } from "@/server/expense-read";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  createExpense: vi.fn(),
  voidExpense: vi.fn(),
  createExpenseCategory: vi.fn(),
  setExpenseCategoryActive: vi.fn(),
  createRecurringExpense: vi.fn(),
  updateRecurringExpense: vi.fn(),
  stopRecurringExpense: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/expense-actions", () => ({
  createExpense: mocks.createExpense,
  voidExpense: mocks.voidExpense,
  createExpenseCategory: mocks.createExpenseCategory,
  setExpenseCategoryActive: mocks.setExpenseCategoryActive,
}));
vi.mock("@/server/expense-recurring", () => ({
  createRecurringExpense: mocks.createRecurringExpense,
  updateRecurringExpense: mocks.updateRecurringExpense,
  stopRecurringExpense: mocks.stopRecurringExpense,
}));

const categories: CategoryRow[] = [
  { id: "kat1", name: "Sewa", isActive: true },
  { id: "kat2", name: "Gaji", isActive: true },
  { id: "kat3", name: "Servis lama", isActive: false },
];
const branches = [{ id: "b1", name: "Mahakeret" }];

beforeEach(() => vi.clearAllMocks());

describe("formulir pengeluaran", () => {
  it("nominal kosong ditolak di layar tanpa memanggil server", async () => {
    render(<ExpenseFormDialog categories={categories.filter((c) => c.isActive)} branches={branches} today="2026-10-07" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Pengeluaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pengeluaran" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Kategori"), "kat1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nominal harus bilangan bulat lebih dari 0.");
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it("mengirim isian yang sah (tanggal hari ini, cabang umum bila tidak dipilih)", async () => {
    mocks.createExpense.mockResolvedValue({ ok: true, data: { id: "e1" } });
    render(<ExpenseFormDialog categories={categories.filter((c) => c.isActive)} branches={branches} today="2026-10-07" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Pengeluaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pengeluaran" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Kategori"), "kat1");
    await userEvent.type(within(dialog).getByLabelText("Nominal"), "500000");
    await userEvent.type(within(dialog).getByLabelText("Keterangan (opsional)"), "Sewa Oktober");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(mocks.createExpense).toHaveBeenCalledWith({ date: "2026-10-07", categoryId: "kat1", amount: 500000, note: "Sewa Oktober", branchId: null }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("galat dari server ditampilkan di dalam dialog", async () => {
    mocks.createExpense.mockResolvedValue({ ok: false, error: "Kategori tidak ditemukan atau sudah nonaktif." });
    render(<ExpenseFormDialog categories={categories.filter((c) => c.isActive)} branches={branches} today="2026-10-07" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Pengeluaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pengeluaran" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Kategori"), "kat2");
    await userEvent.type(within(dialog).getByLabelText("Nominal"), "1000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Kategori tidak ditemukan atau sudah nonaktif.");
  });
});

describe("daftar dan pembatalan pengeluaran", () => {
  const rows: ExpenseRow[] = [
    { id: "e1", date: "2026-10-05", categoryId: "kat1", categoryName: "Sewa", amount: 400000, note: "Sewa ruko", branchId: "b1", branchName: "Mahakeret", recurring: false, createdByName: "Keuangan", voided: null },
    { id: "e2", date: "2026-10-25", categoryId: "kat2", categoryName: "Gaji", amount: 600000, note: null, branchId: null, branchName: null, recurring: true, createdByName: "Berulang (otomatis)", voided: null },
    { id: "e3", date: "2026-10-06", categoryId: "kat1", categoryName: "Sewa", amount: 999000, note: null, branchId: null, branchName: null, recurring: false, createdByName: "Keuangan", voided: { at: new Date("2026-10-07T03:00:00Z"), by: "Keuangan", reason: "Salah catat nominal" } },
  ];

  it("menampilkan baris, tanda Berulang, cabang umum, dan total tanpa yang dibatalkan", () => {
    render(<ExpenseTable rows={rows} />);
    expect(screen.getByText("Sewa ruko")).toBeInTheDocument();
    expect(screen.getByText("Berulang")).toBeInTheDocument();
    expect(screen.getAllByText("Umum").length).toBeGreaterThan(0);
    expect(screen.getByText("Salah catat nominal", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Total (tanpa yang dibatalkan)").closest("tr")).toHaveTextContent("Rp 1.000.000");
    expect(screen.queryByRole("button", { name: /Batalkan Sewa Rp 999.000/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Batalkan Sewa Rp 400.000/ })).toBeInTheDocument();
  });

  it("kosong menampilkan keterangan", () => {
    render(<ExpenseTable rows={[]} />);
    expect(screen.getByText("Belum ada pengeluaran di bulan ini.")).toBeInTheDocument();
  });

  it("pembatalan butuh alasan, lalu memanggil server", async () => {
    mocks.voidExpense.mockResolvedValue({ ok: true, data: undefined });
    render(<VoidExpenseDialog id="e1" label="Sewa Rp 400.000" />);
    await userEvent.click(screen.getByRole("button", { name: "Batalkan Sewa Rp 400.000" }));
    const dialog = await screen.findByRole("dialog", { name: "Batalkan pengeluaran?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Batalkan pengeluaran" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Isi alasan.");
    expect(mocks.voidExpense).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText("Alasan"), "Salah catat");
    await userEvent.click(within(dialog).getByRole("button", { name: "Batalkan pengeluaran" }));
    await waitFor(() => expect(mocks.voidExpense).toHaveBeenCalledWith({ id: "e1", reason: "Salah catat" }));
  });
});

describe("kategori", () => {
  it("menambah kategori, menampilkan galat nama kembar, dan menonaktifkan atau mengaktifkan", async () => {
    mocks.createExpenseCategory.mockResolvedValueOnce({ ok: false, error: "Kategori ini sudah ada." }).mockResolvedValueOnce({ ok: true, data: { id: "k9" } });
    mocks.setExpenseCategoryActive.mockResolvedValue({ ok: true, data: undefined });
    render(<CategoryManager categories={categories} />);
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Nama kategori baru"), "Sewa");
    await userEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kategori ini sudah ada.");
    await userEvent.clear(screen.getByLabelText("Nama kategori baru"));
    await userEvent.type(screen.getByLabelText("Nama kategori baru"), "Servis AC");
    await userEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    await waitFor(() => expect(mocks.createExpenseCategory).toHaveBeenLastCalledWith({ name: "Servis AC" }));

    await userEvent.click(screen.getByRole("button", { name: "Nonaktifkan Sewa" }));
    await waitFor(() => expect(mocks.setExpenseCategoryActive).toHaveBeenCalledWith({ id: "kat1", active: false }));
    await userEvent.click(screen.getByRole("button", { name: "Aktifkan Servis lama" }));
    await waitFor(() => expect(mocks.setExpenseCategoryActive).toHaveBeenCalledWith({ id: "kat3", active: true }));
  });
});

describe("pengeluaran berulang", () => {
  const active = categories.filter((c) => c.isActive);
  const row: RecurringRow = {
    id: "r1", categoryId: "kat2", categoryName: "Gaji", amount: 1000000, note: "Gaji staf", branchId: null, branchName: null,
    dayOfMonth: 25, startMonth: "2026-08", endMonth: null, isActive: true,
  };

  it("tanggal di luar 1–28 ditolak di layar; templat sah dikirim lengkap", async () => {
    mocks.createRecurringExpense.mockResolvedValue({ ok: true, data: { id: "r2", generated: 1 } });
    render(<RecurringDialog categories={active} branches={branches} currentMonth="2026-10" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Berulang" }));
    const dialog = await screen.findByRole("dialog", { name: "Pengeluaran berulang" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Kategori"), "kat2");
    await userEvent.type(within(dialog).getByLabelText("Nominal"), "1000000");
    await userEvent.clear(within(dialog).getByLabelText("Tanggal tiap bulan"));
    await userEvent.type(within(dialog).getByLabelText("Tanggal tiap bulan"), "29");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Tanggal tiap bulan harus 1 sampai 28.");
    expect(mocks.createRecurringExpense).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText("Tanggal tiap bulan"));
    await userEvent.type(within(dialog).getByLabelText("Tanggal tiap bulan"), "25");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(mocks.createRecurringExpense).toHaveBeenCalledWith({
        categoryId: "kat2", amount: 1000000, note: "", branchId: null, dayOfMonth: 25, startMonth: "2026-10", endMonth: null,
      }),
    );
  });

  it("mengubah templat: hanya nominal, keterangan, tanggal, dan bulan berakhir", async () => {
    mocks.updateRecurringExpense.mockResolvedValue({ ok: true, data: undefined });
    render(<RecurringDialog categories={active} branches={branches} currentMonth="2026-10" row={row} />);
    await userEvent.click(screen.getByRole("button", { name: "Ubah Gaji" }));
    const dialog = await screen.findByRole("dialog", { name: "Ubah pengeluaran berulang" });
    expect(within(dialog).queryByLabelText("Kategori")).toBeNull();
    const amount = within(dialog).getByLabelText("Nominal");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1200000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(mocks.updateRecurringExpense).toHaveBeenCalledWith({ id: "r1", amount: 1200000, note: "Gaji staf", dayOfMonth: 25, endMonth: null }),
    );
  });

  it("menghentikan templat lewat dialog konfirmasi", async () => {
    mocks.stopRecurringExpense.mockResolvedValue({ ok: true, data: undefined });
    render(<StopRecurringButton id="r1" label="Gaji" />);
    await userEvent.click(screen.getByRole("button", { name: "Hentikan Gaji" }));
    const dialog = await screen.findByRole("dialog", { name: "Hentikan pengeluaran berulang?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Hentikan" }));
    await waitFor(() => expect(mocks.stopRecurringExpense).toHaveBeenCalledWith({ id: "r1" }));
  });
});
```

Run: `npx vitest run tests/unit/expense-ui.test.tsx`
Expected: FAIL (komponen belum ada).

- [ ] **Step 2: Komponen formulir dan pembatalan**

`src/components/admin/expenses/expense-form-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_NOTE_MAX, validateExpense } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { createExpense } from "@/server/expense-actions";
import type { CategoryRow } from "@/server/expense-read";
import { RupiahInput } from "../rupiah-input";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Catat satu pengeluaran (spec laporan 7). Cabang kosong berarti pengeluaran umum. */
export function ExpenseFormDialog({ categories, branches, today }: { categories: CategoryRow[]; branches: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [branchId, setBranchId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setDate(today);
    setCategoryId("");
    setAmount(null);
    setBranchId("");
    setNote("");
    setError(null);
  }

  function save() {
    const input = { date, categoryId, amount: amount ?? Number.NaN, note, branchId: branchId || null };
    const checked = validateExpense(input, { today });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createExpense(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Pengeluaran ${formatRupiah(checked.value.amount)} dicatat.`);
        setOpen(false);
        reset();
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">+ Pengeluaran</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat pengeluaran</DialogTitle>
          <DialogDescription>Salah catat dibatalkan dengan alasan, tidak dihapus.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="expense-date">Tanggal</Label>
            <Input id="expense-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expense-category">Kategori</Label>
            <select id="expense-category" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Pilih kategori…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="expense-amount">Nominal</Label>
            <RupiahInput id="expense-amount" value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expense-branch">Cabang</Label>
            <select id="expense-branch" className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Umum (semua cabang)</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="expense-note">Keterangan (opsional)</Label>
            <Input id="expense-note" maxLength={EXPENSE_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/admin/expenses/void-expense-dialog.tsx` (salin pola `src/components/admin/billing/cancel-invoice-dialog.tsx`):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateReason } from "@/lib/stock";
import { voidExpense } from "@/server/expense-actions";

/** Batalkan pengeluaran salah catat: tetap tercatat dengan tanda dibatalkan dan alasannya (spec laporan 9). */
export function VoidExpenseDialog({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    const checked = validateReason(reason);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await voidExpense({ id, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Pengeluaran dibatalkan.");
        setOpen(false);
        setReason("");
        router.refresh();
      } catch {
        setError("Gagal membatalkan. Coba lagi.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" aria-label={`Batalkan ${label}`}>
          Batalkan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan pengeluaran?</DialogTitle>
          <DialogDescription>{label}. Catatan tetap tersimpan dengan tanda dibatalkan dan tidak dihitung di laporan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor={`void-${id}`}>Alasan</Label>
          <Input id={`void-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            Batalkan pengeluaran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/admin/expenses/expense-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { dateLabel } from "@/lib/stock";
import type { ExpenseRow } from "@/server/expense-read";
import { EmptyState } from "../page-layout";
import { VoidExpenseDialog } from "./void-expense-dialog";

/** Daftar pengeluaran satu bulan; total tidak menghitung yang dibatalkan. */
export function ExpenseTable({ rows }: { rows: ExpenseRow[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada pengeluaran di bulan ini.</EmptyState>;
  const total = rows.reduce((sum, row) => (row.voided ? sum : sum + row.amount), 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Kategori</TableHead>
          <TableHead>Keterangan</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Nominal</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className={row.voided ? "text-muted-foreground" : undefined}>
            <TableCell className="whitespace-nowrap">{dateLabel(row.date)}</TableCell>
            <TableCell>
              {row.categoryName} {row.recurring && <Badge variant="outline">Berulang</Badge>}
            </TableCell>
            <TableCell>
              <span className={row.voided ? "line-through" : undefined}>{row.note ?? "-"}</span>
              {row.voided && <div className="text-xs text-destructive">Dibatalkan oleh {row.voided.by}: {row.voided.reason}</div>}
            </TableCell>
            <TableCell>{row.branchName ?? "Umum"}</TableCell>
            <TableCell className={row.voided ? "text-right line-through" : "text-right"}>{formatRupiah(row.amount)}</TableCell>
            <TableCell className="text-right">
              {!row.voided && <VoidExpenseDialog id={row.id} label={`${row.categoryName} ${formatRupiah(row.amount)}`} />}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4}>Total (tanpa yang dibatalkan)</TableCell>
          <TableCell className="text-right font-semibold">{formatRupiah(total)}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
```


- [ ] **Step 3: Komponen kategori dan berulang**

`src/components/admin/expenses/category-manager.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_NAME_MAX } from "@/lib/expense";
import { createExpenseCategory, setExpenseCategoryActive } from "@/server/expense-actions";
import type { CategoryRow } from "@/server/expense-read";

/** Tambah dan nonaktifkan kategori pengeluaran (spec laporan 7). Kategori tidak dihapus. */
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.();
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="Nama kategori baru" className="max-w-xs" maxLength={CATEGORY_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kategori baru" />
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => createExpenseCategory({ name }), () => setName(""))}>
          Tambah kategori
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="divide-y rounded-md border text-sm">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className={category.isActive ? undefined : "text-muted-foreground"}>
              {category.name} {!category.isActive && <Badge variant="outline">Nonaktif</Badge>}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={`${category.isActive ? "Nonaktifkan" : "Aktifkan"} ${category.name}`}
              onClick={() => run(() => setExpenseCategoryActive({ id: category.id, active: !category.isActive }))}
            >
              {category.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

(Tipe argumen `run` harus cocok dengan `ActionResult<…>`; bila `tsc` menolak, ubah tipe parameter menjadi `() => Promise<ActionResult<unknown>>` dan impor `ActionResult` dari `@/lib/action-result`.)

`src/components/admin/expenses/recurring-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_NOTE_MAX, validateRecurring, validateRecurringUpdate } from "@/lib/expense";
import { createRecurringExpense, updateRecurringExpense } from "@/server/expense-recurring";
import type { CategoryRow, RecurringRow } from "@/server/expense-read";
import { RupiahInput } from "../rupiah-input";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Tambah (tanpa `row`) atau ubah (dengan `row`) templat pengeluaran berulang. Mengubah tidak menyentuh catatan lama. */
export function RecurringDialog({
  categories,
  branches,
  currentMonth,
  row,
}: {
  categories: CategoryRow[];
  branches: { id: string; name: string }[];
  currentMonth: string;
  row?: RecurringRow;
}) {
  const router = useRouter();
  const editing = Boolean(row);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(row?.categoryId ?? "");
  const [amount, setAmount] = useState<number | null>(row?.amount ?? null);
  const [branchId, setBranchId] = useState(row?.branchId ?? "");
  const [note, setNote] = useState(row?.note ?? "");
  const [day, setDay] = useState(String(row?.dayOfMonth ?? 1));
  const [startMonth, setStartMonth] = useState(row?.startMonth ?? currentMonth);
  const [endMonth, setEndMonth] = useState(row?.endMonth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const common = { amount: amount ?? Number.NaN, note, dayOfMonth: Number(day), endMonth: endMonth || null };
    const checked = row
      ? validateRecurringUpdate(common, { startMonth: row.startMonth })
      : validateRecurring({ ...common, categoryId, branchId: branchId || null, startMonth }, { currentMonth });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = row
          ? await updateRecurringExpense({ id: row.id, ...common })
          : await createRecurringExpense({ ...common, categoryId, branchId: branchId || null, startMonth });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(row ? "Templat diperbarui." : "Templat dibuat.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        {row ? (
          <Button type="button" size="sm" variant="ghost" aria-label={`Ubah ${row.categoryName}`}>
            Ubah
          </Button>
        ) : (
          <Button type="button">+ Berulang</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Ubah pengeluaran berulang" : "Pengeluaran berulang"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Perubahan hanya berlaku untuk bulan-bulan berikutnya; catatan yang sudah ada tidak berubah."
              : "Catatan dibuat otomatis tiap bulan, mulai dari bulan mulai (bulan yang sudah lewat langsung disusulkan)."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!editing && (
            <div className="space-y-1">
              <Label htmlFor="recurring-category">Kategori</Label>
              <select id="recurring-category" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Pilih kategori…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="recurring-amount">Nominal</Label>
            <RupiahInput id="recurring-amount" value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="recurring-day">Tanggal tiap bulan</Label>
            <Input id="recurring-day" type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          {!editing && (
            <div className="space-y-1">
              <Label htmlFor="recurring-start">Bulan mulai</Label>
              <Input id="recurring-start" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="recurring-end">Bulan berakhir (opsional)</Label>
            <Input id="recurring-end" type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </div>
          {!editing && (
            <div className="space-y-1">
              <Label htmlFor="recurring-branch">Cabang</Label>
              <select id="recurring-branch" className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Umum (semua cabang)</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="recurring-note">Keterangan (opsional)</Label>
            <Input id="recurring-note" maxLength={EXPENSE_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/admin/expenses/stop-recurring-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { stopRecurringExpense } from "@/server/expense-recurring";

/** Hentikan templat berulang; catatan yang sudah dibuat tetap (spec laporan 5). */
export function StopRecurringButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function stop() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await stopRecurringExpense({ id });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Templat dihentikan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menghentikan. Coba lagi.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" aria-label={`Hentikan ${label}`}>
          Hentikan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hentikan pengeluaran berulang?</DialogTitle>
          <DialogDescription>{label}. Tidak ada catatan baru yang dibuat; catatan yang sudah ada tetap.</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={stop} disabled={pending}>
            Hentikan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/admin/expenses/recurring-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { CategoryRow, RecurringRow } from "@/server/expense-read";
import { EmptyState } from "../page-layout";
import { RecurringDialog } from "./recurring-dialog";
import { StopRecurringButton } from "./stop-recurring-button";

/** Templat pengeluaran berulang (spec laporan 7). */
export function RecurringTable({
  rows,
  categories,
  branches,
  currentMonth,
}: {
  rows: RecurringRow[];
  categories: CategoryRow[];
  branches: { id: string; name: string }[];
  currentMonth: string;
}) {
  if (rows.length === 0) return <EmptyState>Belum ada pengeluaran berulang.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kategori</TableHead>
          <TableHead className="text-right">Nominal</TableHead>
          <TableHead>Jadwal</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              {row.categoryName}
              {row.note && <div className="text-xs text-muted-foreground">{row.note}</div>}
            </TableCell>
            <TableCell className="text-right">{formatRupiah(row.amount)}</TableCell>
            <TableCell>
              Tiap tanggal {row.dayOfMonth}, dari {row.startMonth}
              {row.endMonth ? ` sampai ${row.endMonth}` : ""}
            </TableCell>
            <TableCell>{row.branchName ?? "Umum"}</TableCell>
            <TableCell>
              <Badge variant={row.isActive ? "default" : "outline"}>{row.isActive ? "Aktif" : "Dihentikan"}</Badge>
            </TableCell>
            <TableCell className="space-x-1 whitespace-nowrap text-right">
              {row.isActive && (
                <>
                  <RecurringDialog categories={categories} branches={branches} currentMonth={currentMonth} row={row} />
                  <StopRecurringButton id={row.id} label={row.categoryName} />
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

- [ ] **Step 4: Halaman**

Buat `src/app/(admin)/admin/pengeluaran/page.tsx`:

```tsx
import Form from "next/form";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { CategoryManager } from "@/components/admin/expenses/category-manager";
import { ExpenseFormDialog } from "@/components/admin/expenses/expense-form-dialog";
import { ExpenseTable } from "@/components/admin/expenses/expense-table";
import { RecurringDialog } from "@/components/admin/expenses/recurring-dialog";
import { RecurringTable } from "@/components/admin/expenses/recurring-table";
import { PageTabs } from "@/components/admin/page-tabs";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMonths, currentMonthOf, isMonthString } from "@/lib/expense";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { listCategories, listExpenses, listRecurring } from "@/server/expense-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Pengeluaran" };

type Search = { tab?: string; bulan?: string; kategori?: string; cabang?: string };
type Tab = "catatan" | "berulang" | "kategori";

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireCapability("expense:manage");
  const params = await searchParams;
  const tab: Tab = params.tab === "berulang" || params.tab === "kategori" ? params.tab : "catatan";
  const today = witaDateString(new Date());
  const thisMonth = currentMonthOf(today);
  const month = isMonthString(params.bulan) ? params.bulan : thisMonth;
  const branches = (await getBranches()).filter((b) => b.status === "AKTIF").map((b) => ({ id: b.id, name: b.name }));
  const allCategories = await listCategories({ includeInactive: true });
  const activeCategories = allCategories.filter((c) => c.isActive);

  const actions =
    tab === "catatan" ? (
      <ExpenseFormDialog categories={activeCategories} branches={branches} today={today} />
    ) : tab === "berulang" ? (
      <RecurringDialog categories={activeCategories} branches={branches} currentMonth={thisMonth} />
    ) : undefined;

  return (
    <>
      <AdminHeader title="Pengeluaran" />
      <PageBody>
        <PageHeader title="Pengeluaran" description="Biaya klinik di luar harga pokok obat: gaji, sewa, listrik, dan sejenisnya." actions={actions} />
        <PageTabs
          label="Bagian pengeluaran"
          active={tab}
          tabs={[
            { id: "catatan", label: "Catatan", href: "/admin/pengeluaran" },
            { id: "berulang", label: "Berulang", href: "/admin/pengeluaran?tab=berulang" },
            { id: "kategori", label: "Kategori", href: "/admin/pengeluaran?tab=kategori" },
          ]}
        />
        {tab === "catatan" && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Form action="/admin/pengeluaran" className="flex flex-wrap items-end gap-2">
                <Input name="bulan" type="month" defaultValue={month} aria-label="Bulan" className="w-44" />
                <select name="kategori" defaultValue={params.kategori ?? ""} aria-label="Kategori" className={selectClass}>
                  <option value="">Semua kategori</option>
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select name="cabang" defaultValue={params.cabang ?? ""} aria-label="Cabang" className={selectClass}>
                  <option value="">Semua cabang</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline">
                  Terapkan
                </Button>
              </Form>
              <nav aria-label="Pindah bulan" className="flex gap-3 text-sm">
                <Link className="underline underline-offset-4" href={`/admin/pengeluaran?bulan=${addMonths(month, -1)}`}>
                  ← Bulan sebelumnya
                </Link>
                <Link className="underline underline-offset-4" href={`/admin/pengeluaran?bulan=${addMonths(month, 1)}`}>
                  Bulan berikutnya →
                </Link>
              </nav>
            </div>
            <SectionCard title={`Pengeluaran ${month}`} flush>
              <ExpenseTable rows={await listExpenses({ month, categoryId: params.kategori || undefined, branchId: params.cabang || undefined })} />
            </SectionCard>
          </>
        )}
        {tab === "berulang" && (
          <SectionCard title="Pengeluaran berulang" flush>
            <RecurringTable rows={await listRecurring()} categories={activeCategories} branches={branches} currentMonth={thisMonth} />
          </SectionCard>
        )}
        {tab === "kategori" && (
          <SectionCard title="Kategori pengeluaran" flush>
            <CategoryManager categories={allCategories} />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}
```

Run: `npx vitest run tests/unit/expense-ui.test.tsx tests/unit/architecture.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Lint, tipe, commit**

Run: `npx eslint src/components/admin/expenses "src/app/(admin)/admin/pengeluaran" tests/unit/expense-ui.test.tsx; npx tsc --noEmit -p . > "$WS/t8-tsc.log" 2>&1; echo "tsc exit $?"; npx vitest run > "$WS/t8.log" 2>&1; grep -E "Test Files|Tests " "$WS/t8.log"`
Expected: eslint bersih, `tsc exit 0`, semua uji PASS.

```bash
git add src/components/admin/expenses "src/app/(admin)/admin/pengeluaran" tests/unit/expense-ui.test.tsx
git commit -m "feat: add the Pengeluaran page for expenses, recurring templates, and categories"
```

---

### Task 9: UI — halaman Laporan, menu, dan kotak dasbor

**Files:**
- Create: `src/components/admin/report/report-summary.tsx`, `report-detail.tsx`, `cash-flow-card.tsx`, `trend-chart.tsx`, `report-filter.tsx`, `profit-tiles.tsx`
- Create: `src/app/(admin)/admin/laporan/page.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/page.tsx`, `tests/unit/admin-dashboard-page.test.tsx`
- Test: `tests/unit/report-ui.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`ReportView`, `Comparison`, `Delta`, `TrendPoint`, `ReportPeriod`, `profitLabel`, `presetPeriod`, `validatePeriod`, `isReportPreset`, `REPORT_PRESETS`, `REPORT_PRESET_LABEL`, `periodLabel`, `previousPeriod` hasil `ProfitReport`), Task 5 (`getProfitReport`, `getMonthProfit`), `formatRupiah`, `StatTile`, `PageHeader`, `SectionCard`, `getBranches`.
- Produces: halaman `/admin/laporan?periode=BULAN_INI|BULAN_LALU|TAHUN_INI|RENTANG&dari=&sampai=&cabang=`; komponen `ReportSummary({ view, comparison })`, `deltaText(delta: Delta): string`, `ReportDetail({ current, previous })`, `CashFlowCard({ cash })`, `TrendChart({ points })`, `chartGeometry(points, size)`, `ReportFilter({ preset, period, branchId, branches })`, `ProfitTiles({ profit })`; prop dan menu "Pengeluaran" (`expense:manage`) dan "Laporan" (`profit:read`).

- [ ] **Step 1: Tulis uji komponen (gagal)**

Buat `tests/unit/report-ui.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CashFlowCard } from "@/components/admin/report/cash-flow-card";
import { ProfitTiles } from "@/components/admin/report/profit-tiles";
import { ReportDetail } from "@/components/admin/report/report-detail";
import { deltaText, ReportSummary } from "@/components/admin/report/report-summary";
import { chartGeometry, TrendChart } from "@/components/admin/report/trend-chart";
import { compareReports, summarizeReport, type RawReport } from "@/lib/report";

const RAW: RawReport = {
  service: 1_000_000, treatment: 500_000, goods: 300_000, discount: 100_000, upfrontFee: 200_000, upfrontOnline: 250_000,
  cogs: 120_000, outstanding: 50_000, invoiceCount: 12,
  expenses: [
    { categoryId: "k1", name: "Sewa", isActive: true, amount: 400_000 },
    { categoryId: "k2", name: "Gaji lama", isActive: false, amount: 600_000 },
  ],
  customerPaid: 1_500_000, supplierPaid: 300_000, supplierRefunded: 50_000,
};
const PREVIOUS: RawReport = { ...RAW, service: 500_000, expenses: [{ categoryId: "k1", name: "Sewa", isActive: true, amount: 300_000 }] };
const LOSS: RawReport = { ...RAW, service: 0, treatment: 0, goods: 0, discount: 0, upfrontFee: 0, upfrontOnline: 0, cogs: 0, outstanding: 0, customerPaid: 0, supplierPaid: 0, supplierRefunded: 0 };

describe("teks perbandingan", () => {
  it("naik, turun, sama, dan tanpa persen", () => {
    expect(deltaText({ amount: 10, percent: 10 })).toBe("naik 10% (Rp 10) dari periode sebelumnya");
    expect(deltaText({ amount: -100, percent: -66.7 })).toBe("turun 66,7% (Rp 100) dari periode sebelumnya");
    expect(deltaText({ amount: 5, percent: null })).toBe("naik Rp 5 dari periode sebelumnya");
    expect(deltaText({ amount: 0, percent: null })).toBe("sama dengan periode sebelumnya");
    expect(deltaText({ amount: 0, percent: 0 })).toBe("sama dengan periode sebelumnya");
  });
});

describe("ringkasan laporan", () => {
  it("menampilkan lima angka utama dengan perbandingan; Laba bersih saat positif", () => {
    const current = summarizeReport(RAW);
    render(<ReportSummary view={current} comparison={compareReports(current.totals, summarizeReport(PREVIOUS).totals)} />);
    const section = screen.getByRole("region", { name: "Ringkasan laporan" });
    for (const label of ["Pendapatan", "Harga pokok", "Laba kotor", "Pengeluaran", "Laba bersih"]) {
      expect(within(section).getByText(label)).toBeInTheDocument();
    }
    expect(within(section).getByText("Laba bersih").parentElement).toHaveTextContent("Rp 1.030.000");
    expect(within(section).getByText("Pendapatan").parentElement).toHaveTextContent("Rp 2.150.000");
    expect(within(section).getByText("Pendapatan").parentElement).toHaveTextContent("naik");
  });

  it("menulis Rugi bersih bila negatif", () => {
    const view = summarizeReport(LOSS);
    render(<ReportSummary view={view} comparison={compareReports(view.totals, view.totals)} />);
    expect(screen.getByText("Rugi bersih")).toBeInTheDocument();
    expect(screen.queryByText("Laba bersih")).toBeNull();
    expect(screen.getByText("Rugi bersih").parentElement).toHaveTextContent("1.000.000");
  });
});

describe("rincian laporan", () => {
  it("rincian pendapatan, pengeluaran per kategori (nonaktif bertanda), dan belum tertagih untuk dua periode", () => {
    render(<ReportDetail current={summarizeReport(RAW)} previous={summarizeReport(PREVIOUS)} />);
    const table = screen.getByRole("table", { name: "Rincian laporan" });
    const row = (name: string) => within(table).getByText(name).closest("tr")!;
    expect(row("Layanan")).toHaveTextContent("Rp 1.000.000");
    expect(row("Layanan")).toHaveTextContent("Rp 500.000");
    expect(row("Diskon")).toHaveTextContent("Rp 100.000");
    expect(row("Total pendapatan")).toHaveTextContent("Rp 2.150.000");
    expect(row("Harga pokok")).toHaveTextContent("Rp 120.000");
    expect(row("Sewa")).toHaveTextContent("Rp 400.000");
    expect(row("Sewa")).toHaveTextContent("Rp 300.000");
    expect(row("Gaji lama (nonaktif)")).toHaveTextContent("Rp 600.000");
    expect(row("Total pengeluaran")).toHaveTextContent("Rp 1.000.000");
    expect(row("Laba bersih")).toHaveTextContent("Rp 1.030.000");
    expect(row("Belum tertagih (informasi)")).toHaveTextContent("Rp 50.000");
  });
});

describe("arus kas", () => {
  it("menampilkan masuk, keluar, dan kas bersih; hutang supplier terpisah dari laba", () => {
    render(<CashFlowCard cash={summarizeReport(RAW).cash} />);
    const section = screen.getByRole("region", { name: "Arus kas" });
    expect(within(section).getByText("Total masuk").closest("tr")).toHaveTextContent("Rp 1.950.000");
    expect(within(section).getByText("Pembayaran hutang supplier (neto)").closest("tr")).toHaveTextContent("Rp 250.000");
    expect(within(section).getByText("Total keluar").closest("tr")).toHaveTextContent("Rp 1.250.000");
    expect(within(section).getByText("Kas bersih").closest("tr")).toHaveTextContent("Rp 700.000");
    expect(within(section).getByText(/tidak mengurangi laba/i)).toBeInTheDocument();
  });
});

describe("grafik tren", () => {
  const points = [
    { month: "2026-08", revenue: 1000, cost: 400, netProfit: 600 },
    { month: "2026-09", revenue: 500, cost: 900, netProfit: -400 },
    { month: "2026-10", revenue: 0, cost: 0, netProfit: 0 },
  ];

  it("geometri: skala bersama, batang laba negatif di bawah garis dasar, tanpa NaN walau semuanya nol", () => {
    const geometry = chartGeometry(points, { width: 600, height: 200 });
    expect(geometry.bars).toHaveLength(9); // tiga batang per bulan
    const revenue = geometry.bars.find((b) => b.month === "2026-08" && b.series === "revenue")!;
    const loss = geometry.bars.find((b) => b.month === "2026-09" && b.series === "net")!;
    expect(revenue.y + revenue.height).toBeCloseTo(geometry.baselineY);
    expect(loss.y).toBeCloseTo(geometry.baselineY);
    expect(loss.negative).toBe(true);
    for (const bar of geometry.bars) {
      for (const value of [bar.x, bar.y, bar.width, bar.height]) expect(Number.isFinite(value)).toBe(true);
    }
    const zero = chartGeometry([{ month: "2026-10", revenue: 0, cost: 0, netProfit: 0 }], { width: 600, height: 200 });
    for (const bar of zero.bars) expect(Number.isFinite(bar.height)).toBe(true);
  });

  it("gambar dengan nama dan tabel tersembunyi berisi angka tiap bulan", () => {
    render(<TrendChart points={points} />);
    expect(screen.getByRole("img", { name: "Grafik tren 12 bulan" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Data tren bulanan" });
    expect(within(table).getByText("Ags 2026").closest("tr")).toHaveTextContent("Rp 1.000");
    expect(within(table).getByText("Sep 2026").closest("tr")).toHaveTextContent("400");
  });
});

describe("kotak dasbor", () => {
  it("laba bulan ini dan rugi bulan ini", () => {
    const { rerender } = render(<ProfitTiles profit={{ month: "2026-10", revenue: 2_000_000, netProfit: 750_000 }} />);
    const profit = screen.getByRole("link", { name: /Laba bersih bulan ini/ });
    expect(profit).toHaveAttribute("href", "/admin/laporan");
    expect(profit).toHaveTextContent("750.000");
    rerender(<ProfitTiles profit={{ month: "2026-10", revenue: 0, netProfit: -300_000 }} />);
    expect(screen.getByRole("link", { name: /Rugi bersih bulan ini/ })).toHaveTextContent("300.000");
  });
});
```

Run: `npx vitest run tests/unit/report-ui.test.tsx`
Expected: FAIL (komponen belum ada).

- [ ] **Step 2: Komponen**

`src/components/admin/report/report-summary.tsx`:

```tsx
import { formatRupiah } from "@/lib/format";
import { profitLabel, type Comparison, type Delta, type ReportView } from "@/lib/report";
import { cn } from "@/lib/utils";

/** Teks perbandingan dengan periode sebelumnya, mis. "naik 10% (Rp 10) dari periode sebelumnya". */
export function deltaText(delta: Delta): string {
  if (delta.amount === 0) return "sama dengan periode sebelumnya";
  const direction = delta.amount > 0 ? "naik" : "turun";
  const amount = formatRupiah(Math.abs(delta.amount));
  if (delta.percent === null) return `${direction} ${amount} dari periode sebelumnya`;
  return `${direction} ${String(Math.abs(delta.percent)).replace(".", ",")}% (${amount}) dari periode sebelumnya`;
}

function Card({ label, value, delta, negative = false }: { label: string; value: number; delta: Delta; negative?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold", negative && "text-destructive")}>{formatRupiah(value)}</p>
      <p className="text-xs text-muted-foreground">{deltaText(delta)}</p>
    </div>
  );
}

/** Lima angka utama (spec laporan 7); laba bersih ditulis "Rugi bersih" bila negatif. */
export function ReportSummary({ view, comparison }: { view: ReportView; comparison: Comparison }) {
  const { totals } = view;
  const net = profitLabel(totals.netProfit);
  return (
    <section aria-label="Ringkasan laporan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card label="Pendapatan" value={totals.revenue} delta={comparison.revenue} />
      <Card label="Harga pokok" value={totals.cogs} delta={comparison.cogs} />
      <Card label="Laba kotor" value={totals.grossProfit} delta={comparison.grossProfit} negative={totals.grossProfit < 0} />
      <Card label="Pengeluaran" value={totals.expenses} delta={comparison.expenses} />
      <Card label={`${net} bersih`} value={totals.netProfit} delta={comparison.netProfit} negative={net === "Rugi"} />
    </section>
  );
}
```

`src/components/admin/report/report-detail.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { profitLabel, type ReportView } from "@/lib/report";
import { cn } from "@/lib/utils";

type Line = { label: string; current: number; previous: number; strong?: boolean; note?: string };

function categoryLines(current: ReportView, previous: ReportView): Line[] {
  const names = new Map<string, { name: string; isActive: boolean }>();
  for (const row of [...current.expensesByCategory, ...previous.expensesByCategory]) names.set(row.categoryId, { name: row.name, isActive: row.isActive });
  const amountOf = (view: ReportView, id: string) => view.expensesByCategory.find((row) => row.categoryId === id)?.amount ?? 0;
  return [...names.entries()].map(([id, category]) => ({
    label: category.isActive ? category.name : `${category.name} (nonaktif)`,
    current: amountOf(current, id),
    previous: amountOf(previous, id),
  }));
}

/** Rincian pendapatan, harga pokok, dan pengeluaran per kategori untuk periode ini dan sebelumnya (spec laporan 7). */
export function ReportDetail({ current, previous }: { current: ReportView; previous: ReportView }) {
  const c = current.totals;
  const p = previous.totals;
  const lines: Line[] = [
    { label: "Layanan", current: c.service, previous: p.service },
    { label: "Treatment", current: c.treatment, previous: p.treatment },
    { label: "Obat dan produk", current: c.goods, previous: p.goods },
    { label: "Diskon", current: c.discount, previous: p.discount, note: "pengurang" },
    { label: "Biaya booking (di muka)", current: current.upfrontFee, previous: previous.upfrontFee },
    { label: "Konsultasi Online (di muka)", current: current.upfrontOnline, previous: previous.upfrontOnline },
    { label: "Total pendapatan", current: c.revenue, previous: p.revenue, strong: true },
    { label: "Harga pokok", current: c.cogs, previous: p.cogs },
    { label: "Laba kotor", current: c.grossProfit, previous: p.grossProfit, strong: true },
    ...categoryLines(current, previous),
    { label: "Total pengeluaran", current: c.expenses, previous: p.expenses, strong: true },
    { label: `${profitLabel(c.netProfit)} bersih`, current: c.netProfit, previous: p.netProfit, strong: true },
    { label: "Belum tertagih (informasi)", current: c.outstanding, previous: p.outstanding, note: "tidak mengurangi laba" },
  ];
  return (
    <Table aria-label="Rincian laporan">
      <TableHeader>
        <TableRow>
          <TableHead>Rincian</TableHead>
          <TableHead className="text-right">Periode ini</TableHead>
          <TableHead className="text-right">Periode sebelumnya</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.label} className={cn(line.strong && "font-semibold")}>
            <TableCell>
              {line.label}
              {line.note && <span className="ml-2 text-xs font-normal text-muted-foreground">{line.note}</span>}
            </TableCell>
            <TableCell className="text-right">{formatRupiah(line.current)}</TableCell>
            <TableCell className="text-right">{formatRupiah(line.previous)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

`src/components/admin/report/cash-flow-card.tsx`:

```tsx
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { CashFlow } from "@/lib/report";
import { cn } from "@/lib/utils";

/** Arus kas periode (spec laporan 3.3): terpisah dari laba; pembayaran hutang supplier ada di sini. */
export function CashFlowCard({ cash }: { cash: CashFlow }) {
  const rows: { label: string; value: number; strong?: boolean }[] = [
    { label: "Pembayaran customer", value: cash.customer },
    { label: "Pendapatan di muka", value: cash.upfront },
    { label: "Total masuk", value: cash.inflow, strong: true },
    { label: "Pembayaran hutang supplier (neto)", value: cash.supplier },
    { label: "Pengeluaran", value: cash.expenses },
    { label: "Total keluar", value: cash.outflow, strong: true },
    { label: "Kas bersih", value: cash.net, strong: true },
  ];
  return (
    <section aria-label="Arus kas" className="space-y-2">
      <Table>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label} className={cn(row.strong && "font-semibold")}>
              <TableCell>{row.label}</TableCell>
              <TableCell className="text-right">{formatRupiah(row.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="px-4 pb-3 text-xs text-muted-foreground">Pembayaran hutang supplier tampil di sini saja dan tidak mengurangi laba (biaya barang sudah masuk lewat harga pokok).</p>
    </section>
  );
}
```

`src/components/admin/report/trend-chart.tsx` (komponen server, SVG murni):

```tsx
import { formatRupiah } from "@/lib/format";
import type { TrendPoint } from "@/lib/report";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

/** "2026-08" → "Ags 2026". */
function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${MONTH_SHORT[mon - 1]} ${year}`;
}

export type Series = "revenue" | "cost" | "net";
export type Bar = { month: string; series: Series; x: number; y: number; width: number; height: number; negative: boolean };

/**
 * Geometri grafik: tiga batang per bulan (pendapatan, biaya, laba bersih) dengan skala bersama. Batang laba
 * negatif digambar di bawah garis dasar. Semua nilai selalu berhingga (data nol tidak menghasilkan NaN).
 */
export function chartGeometry(points: TrendPoint[], size: { width: number; height: number }): { bars: Bar[]; baselineY: number } {
  const maxUp = Math.max(0, ...points.flatMap((p) => [p.revenue, p.cost, p.netProfit]));
  const maxDown = Math.max(0, ...points.map((p) => -p.netProfit));
  const total = maxUp + maxDown || 1;
  const baselineY = (maxUp / total) * size.height;
  const group = size.width / Math.max(points.length, 1);
  const barWidth = (group * 0.8) / 3;
  const bars: Bar[] = [];
  points.forEach((point, index) => {
    const x0 = index * group + group * 0.1;
    (["revenue", "cost", "net"] as const).forEach((series, seriesIndex) => {
      const value = series === "revenue" ? point.revenue : series === "cost" ? point.cost : point.netProfit;
      const height = (Math.abs(value) / total) * size.height;
      const negative = value < 0;
      bars.push({ month: point.month, series, x: x0 + seriesIndex * barWidth, y: negative ? baselineY : baselineY - height, width: barWidth, height, negative });
    });
  });
  return { bars, baselineY };
}

const FILL: Record<Series, string> = { revenue: "fill-amber-500", cost: "fill-stone-500", net: "fill-emerald-600" };

/** Grafik tren 12 bulan (spec laporan 7), digambar dengan SVG; angka lengkapnya ada di tabel yang tersembunyi secara visual. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const size = { width: 720, height: 200 };
  const { bars, baselineY } = chartGeometry(points, size);
  const group = size.width / Math.max(points.length, 1);
  return (
    <div className="space-y-2">
      <svg role="img" aria-label="Grafik tren 12 bulan" viewBox={`0 0 ${size.width} ${size.height + 24}`} className="h-auto w-full">
        <line x1={0} x2={size.width} y1={baselineY} y2={baselineY} className="stroke-border" />
        {bars.map((bar) => (
          <rect key={`${bar.month}-${bar.series}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} className={bar.series === "net" && bar.negative ? "fill-red-600" : FILL[bar.series]} />
        ))}
        {points.map((point, index) => (
          <text key={point.month} x={index * group + group / 2} y={size.height + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {MONTH_SHORT[Number(point.month.slice(5, 7)) - 1]}
          </text>
        ))}
      </svg>
      <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden>
        <li>
          <span className="mr-1 inline-block size-2 rounded-sm bg-amber-500" />
          Pendapatan
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-sm bg-stone-500" />
          Biaya (harga pokok + pengeluaran)
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-sm bg-emerald-600" />
          Laba bersih
        </li>
      </ul>
      <table aria-label="Data tren bulanan" className="sr-only">
        <thead>
          <tr>
            <th>Bulan</th>
            <th>Pendapatan</th>
            <th>Biaya</th>
            <th>Laba bersih</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <td>{monthLabel(point.month)}</td>
              <td>{formatRupiah(point.revenue)}</td>
              <td>{formatRupiah(point.cost)}</td>
              <td>{formatRupiah(point.netProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`src/components/admin/report/profit-tiles.tsx`:

```tsx
import { formatRupiah } from "@/lib/format";
import { profitLabel } from "@/lib/report";
import { StatTile } from "../stat-tile";

/** Kotak Laba bersih bulan ini di dasbor (spec laporan 7) untuk pemegang profit:read. */
export function ProfitTiles({ profit }: { profit: { month: string; revenue: number; netProfit: number } }) {
  return (
    <section aria-label="Laporan" className="grid gap-4 sm:grid-cols-2">
      <StatTile
        label={`${profitLabel(profit.netProfit)} bersih bulan ini`}
        value={formatRupiah(Math.abs(profit.netProfit))}
        note={`pendapatan ${formatRupiah(profit.revenue)}`}
        href="/admin/laporan"
        attention={profit.netProfit < 0}
      />
    </section>
  );
}
```

`src/components/admin/report/report-filter.tsx` (komponen server, memakai `next/form`):

```tsx
import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REPORT_PRESET_LABEL, REPORT_PRESETS, type ReportPeriod, type ReportPreset } from "@/lib/report";

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

/** Pilihan periode dan cabang (spec laporan 7). Tanggal "dari" dan "sampai" dipakai bila periode = Rentang bebas. */
export function ReportFilter({
  preset,
  period,
  branchId,
  branches,
}: {
  preset: ReportPreset;
  period: ReportPeriod;
  branchId: string | null;
  branches: { id: string; name: string }[];
}) {
  return (
    <Form action="/admin/laporan" className="flex flex-wrap items-end gap-2">
      <select name="periode" aria-label="Periode" defaultValue={preset} className={selectClass}>
        {REPORT_PRESETS.map((value) => (
          <option key={value} value={value}>
            {REPORT_PRESET_LABEL[value]}
          </option>
        ))}
      </select>
      <Input name="dari" type="date" aria-label="Dari tanggal" defaultValue={period.from} className="w-40" />
      <Input name="sampai" type="date" aria-label="Sampai tanggal" defaultValue={period.to} className="w-40" />
      <select name="cabang" aria-label="Cabang" defaultValue={branchId ?? ""} className={selectClass}>
        <option value="">Semua cabang</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline">
        Tampilkan
      </Button>
    </Form>
  );
}
```

- [ ] **Step 3: Halaman, menu, dan dasbor**

Buat `src/app/(admin)/admin/laporan/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { CashFlowCard } from "@/components/admin/report/cash-flow-card";
import { ReportDetail } from "@/components/admin/report/report-detail";
import { ReportFilter } from "@/components/admin/report/report-filter";
import { ReportSummary } from "@/components/admin/report/report-summary";
import { TrendChart } from "@/components/admin/report/trend-chart";
import { Button } from "@/components/ui/button";
import { isReportPreset, periodLabel, presetPeriod, validatePeriod, type ReportPeriod, type ReportPreset } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { getProfitReport } from "@/server/report-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Laporan" };

type Search = { periode?: string; dari?: string; sampai?: string; cabang?: string };

export default async function ReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireCapability("profit:read");
  const params = await searchParams;
  const today = witaDateString(new Date());
  const preset: ReportPreset = isReportPreset(params.periode) ? params.periode : "BULAN_INI";

  let period: ReportPeriod = presetPeriod("BULAN_INI", today);
  let notice: string | null = null;
  if (preset === "RENTANG") {
    const checked = validatePeriod({ from: params.dari, to: params.sampai });
    if (checked.ok) period = checked.value;
    else notice = `${checked.message} Menampilkan bulan ini.`;
  } else {
    period = presetPeriod(preset, today);
  }

  const branches = (await getBranches()).filter((b) => b.status === "AKTIF").map((b) => ({ id: b.id, name: b.name }));
  const branchId = branches.some((b) => b.id === params.cabang) ? (params.cabang ?? null) : null;
  const report = await getProfitReport({ period, branchId });
  const query = new URLSearchParams({ dari: period.from, sampai: period.to, ...(branchId ? { cabang: branchId } : {}) });

  return (
    <>
      <AdminHeader title="Laporan" />
      <PageBody>
        <PageHeader
          title="Laporan untung-rugi"
          description={`${periodLabel(period)} · ${report.branchName} · dibandingkan dengan ${periodLabel(report.previousPeriod)}`}
          actions={
            <Button asChild variant="outline">
              <a href={`/admin/laporan/unduh?${query.toString()}`} download>
                Unduh CSV
              </a>
            </Button>
          }
        />
        <ReportFilter preset={preset} period={period} branchId={branchId} branches={branches} />
        {notice && (
          <p role="alert" className="text-sm text-destructive">
            {notice}
          </p>
        )}
        <ReportSummary view={report.current} comparison={report.comparison} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <SectionCard title="Rincian" flush>
            <ReportDetail current={report.current} previous={report.previous} />
          </SectionCard>
          <SectionCard title="Arus kas" flush>
            <CashFlowCard cash={report.current.cash} />
          </SectionCard>
        </div>
        <SectionCard title="Tren 12 bulan">
          <TrendChart points={report.trend} />
        </SectionCard>
      </PageBody>
    </>
  );
}
```

Di `src/components/admin/app-sidebar.tsx`: impor `Banknote` dan `ChartColumn` dari `lucide-react`, dan tambahkan di grup "Persediaan & keuangan" setelah item "Hutang": `{ title: "Pengeluaran", url: "/admin/pengeluaran", icon: Banknote, needs: "expense:manage" },` dan `{ title: "Laporan", url: "/admin/laporan", icon: ChartColumn, needs: "profit:read" },`.

Di `src/app/(admin)/admin/page.tsx`: impor `ProfitTiles` (`@/components/admin/report/profit-tiles`) dan `getMonthProfit` (`@/server/report-read`); tambahkan ke `Promise.all`: `can(staff.role, "profit:read") ? settle(getMonthProfit(), "laporan") : null` (variabel `profit`), dan render sesudah kotak Resep: `{profit && (profit.ok ? <ProfitTiles profit={profit.data} /> : <FailedSection title="Laporan" />)}`.

Di `tests/unit/admin-dashboard-page.test.tsx`: tambahkan `vi.mock("@/server/report-read", () => ({ getMonthProfit: vi.fn() }));`, impor `getMonthProfit`, set `vi.mocked(getMonthProfit).mockResolvedValue({ month: "2026-10", revenue: 0, netProfit: 0 })` di `beforeEach`, dan tambahkan satu uji: untuk `ADMIN_KEUANGAN` dengan `getMonthProfit` mengembalikan `{ month: "2026-10", revenue: 2_000_000, netProfit: 750_000 }`, region "Laporan" tampil dengan tautan `/admin/laporan` bernilai `750.000`; untuk `RESEPSIONIS` `getMonthProfit` tidak dipanggil.

Run: `npx vitest run tests/unit/report-ui.test.tsx tests/unit/admin-dashboard-page.test.tsx tests/unit/stock-availability-ui.test.tsx tests/unit/architecture.test.ts`
Expected: PASS semua. (Uji menu per peran di `stock-availability-ui.test.tsx` tidak terpengaruh; tambahkan di sana satu uji bahwa Admin Keuangan melihat "Pengeluaran" dan "Laporan" sementara Resepsionis, Dokter, dan Apoteker tidak.)

- [ ] **Step 4: Lint, tipe, uji penuh, commit**

Run: `npx eslint src tests/unit; npx tsc --noEmit -p . > "$WS/t9-tsc.log" 2>&1; echo "tsc exit $?"; npx vitest run > "$WS/t9.log" 2>&1; grep -E "Test Files|Tests " "$WS/t9.log"`
Expected: eslint bersih, `tsc exit 0`, semua uji PASS.

```bash
git add src tests
git commit -m "feat: add the profit and loss report page, menu entries, and dashboard tile"
```

---

### Task 10: E2E, fixture, verifikasi penuh, tandai spec dibangun

**Files:**
- Create: `tests/e2e/laporan.spec.ts`
- Modify: `tests/e2e/prepare-db.mts`, `docs/superpowers/specs/2026-10-07-pengeluaran-laporan-untung-rugi-design.md` (status)

**Interfaces:**
- Consumes: semua task sebelumnya; kredensial `E2E_KEUANGAN`, `E2E_RESEPSIONIS`, `E2E_APOTEKER` (`tests/e2e/credentials.ts`); `signIn` dari `./helpers/quiz`.
- Produces: satu cerita E2E berurutan per proyek (desktop/ponsel).

- [ ] **Step 1: Fixture**

Di `tests/e2e/prepare-db.mts`, di awal berkas sesudah `await purgeEncounters(prisma);` tambahkan pembersihan pengeluaran e2e (kategori bawaan tetap):

```ts
// Pengeluaran dan kategori buatan e2e (laporan.spec.ts) dibuang tiap putaran; kategori bawaan dari migrasi tetap.
await prisma.expense.deleteMany();
await prisma.recurringExpense.deleteMany();
await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: "E2E" } } });
```

- [ ] **Step 2: Cerita E2E**

Buat `tests/e2e/laporan.spec.ts` dengan pola `tagihan.spec.ts` (`test.describe.configure({ mode: "serial" })`, `test.setTimeout(180_000)`, `tag(testInfo)` D/M, `import { readFileSync } from "node:fs"`). Cerita (semuanya sebagai Admin Keuangan, kecuali bagian hak akses):

1. **Kategori dan pengeluaran:** `signIn(E2E_KEUANGAN)`; dasbor memuat region "Laporan" dengan tautan `/Bulan ini/` (kotak laba atau rugi). `/admin/pengeluaran?tab=kategori` → isi `Nama kategori baru` dengan `E2E Kategori {t}` → "Tambah kategori" → daftar memuat nama itu. Tab Catatan (`/admin/pengeluaran`) → "+ Pengeluaran" → kategori `Sewa`, nominal `500000` (desktop) atau `700000` (ponsel), keterangan `Sewa E2E {t}` → "Simpan" → baris dengan keterangan itu tampil. Tambah satu lagi: kategori `E2E Kategori {t}`, nominal `123000`, keterangan `Salah catat E2E {t}` → tombol `Batalkan E2E Kategori {t} Rp 123.000` → dialog "Batalkan pengeluaran?" → alasan `Salah catat nominal` → baris menampilkan "Dibatalkan oleh" dan alasan itu.
2. **Pengeluaran berulang:** tab Berulang → "+ Berulang" → kategori `Gaji`, nominal `1000000`, tanggal tiap bulan `25`, bulan mulai (bawaan bulan ini) → "Simpan" → daftar templat memuat "Tiap tanggal 25". Kembali ke tab Catatan: baris `Gaji` bertanda "Berulang" (bulan ini). Ubah templat: tombol `Ubah Gaji` → nominal `1200000` → "Simpan" → templat menampilkan `Rp 1.200.000`, sedangkan baris bulan ini tetap `Rp 1.000.000` (catatan lama tidak berubah).
3. **Laporan:** `/admin/laporan` → region "Ringkasan laporan" tampil; tabel "Rincian laporan" memuat baris `Sewa` dan `Gaji`, tetapi **tidak** memuat `E2E Kategori {t}` (pengeluaran yang dibatalkan tidak dihitung); gambar `Grafik tren 12 bulan` tampil; ganti periode ke `Tahun ini` lewat pilihan "Periode" dan "Tampilkan" → URL memuat `periode=TAHUN_INI`; periode `Rentang bebas` dengan `dari` setelah `sampai` → pesan "Tanggal dari tidak boleh setelah tanggal sampai." dan halaman tetap tampil.
4. **Unduh CSV:** di `/admin/laporan` klik tautan "Unduh CSV" dengan `page.waitForEvent("download")`; isi berkas (`readFileSync(await download.path(), "utf8")`) diawali BOM, memuat `Laporan untung-rugi`, baris `Sewa,` dan `Gaji,`, dan nama berkas berawalan `laporan-untung-rugi-`.
5. **Hak akses:** `signIn(E2E_RESEPSIONIS)`: `page.goto("/admin/pengeluaran")` dan `/admin/laporan` berstatus 403, dan `page.request.get("/admin/laporan/unduh?dari=2026-01-01&sampai=2026-01-31")` berstatus 403; dasbor tidak memuat region "Laporan". `signIn(E2E_APOTEKER)`: `/admin/laporan` berstatus 403.

Gunakan `{ timeout: 30_000 }` pada tunggu navigasi seperti spek lain. Karena data e2e dibersihkan di awal tiap putaran, jangan menegaskan total angka lintas proyek; tegaskan keberadaan baris dan teks seperti di atas.

- [ ] **Step 3: Jalankan E2E per proyek**

Run (satu proyek sekali jalan): `npx playwright test tests/e2e/laporan.spec.ts --project=desktop > "$WS/e2e-d.log" 2>&1; tail -20 "$WS/e2e-d.log"` lalu `--project=mobile` dengan log `e2e-m.log`; lalu `npx playwright test tests/e2e/admin-sidebar.spec.ts tests/e2e/dasbor.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/resep.spec.ts --project=desktop > "$WS/e2e-other.log" 2>&1; grep -E "passed|failed|flaky" "$WS/e2e-other.log"`.
Expected: semua lulus. Setelah e2e, kosongkan data e2e di `sundy_test` (jalankan `prepare-db.mts` dengan env uji, mis. lewat skrip sementara `tests/e2e/.clean-tmp.mts` yang memanggil `execFileSync("npx", ["tsx", "tests/e2e/prepare-db.mts"], { env: { ...process.env, ...e2eDatabaseEnv() } })`, lalu hapus skrip itu) sebelum integrasi.

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

Di `docs/superpowers/specs/2026-10-07-pengeluaran-laporan-untung-rugi-design.md` ganti baris status "Menunggu tinjauan pemilik" menjadi "Dibangun (belum dideploy)".

```bash
git add tests/e2e/laporan.spec.ts tests/e2e/prepare-db.mts docs/superpowers/specs/2026-10-07-pengeluaran-laporan-untung-rugi-design.md
git commit -m "test: cover expenses and the profit report end to end and mark the design as built"
```
