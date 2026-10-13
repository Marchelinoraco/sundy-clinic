# Paket Treatment dan Label Deposit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Katalog paket treatment (satu treatment × N sesi atau campuran), menjual paket di tagihan (boleh DP), memakai sesi paket di tagihan kunjungan dengan buku sesi yang bisa ditelusuri, perpanjangan oleh Admin Keuangan, laporan paket, dan label "Deposit" untuk tagihan yang dibayar sebagian.

**Architecture:** Lima tabel baru (`TreatmentPackage`, `TreatmentPackageItem`, `PatientPackage`, `PatientPackageItem`, `PackageSessionEntry`) dan dua kolom baru di `InvoiceLine` (`treatmentPackageId`, `patientPackageItemId`) dengan jenis baris baru `PAKET`. Sisa sesi selalu = Σ `delta` buku sesi (tidak ada kolom sisa). Semua perubahan buku sesi terjadi di transaksi finalisasi/pembatalan tagihan dan perpanjangan, setelah `PatientPackage` dikunci `FOR UPDATE`; pembantunya di `src/server/package-store.ts`. Aturan murni di `src/lib/treatment-package.ts`.

**Tech Stack:** Next.js 15, Prisma 7/PostgreSQL, MUI 9, Vitest (unit + integrasi), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-paket-treatment-deposit-design.md` (v1.0, disetujui pemilik 13 Oktober 2026).

## Global Constraints

- **Bahasa:** teks yang dilihat pengguna, pesan galat, nama uji, dan komentar kode dalam Bahasa Indonesia; nama berkas, fungsi, dan commit dalam bahasa Inggris.
- **Sisa sesi (spec 3, 10):** sisa satu item = Σ `PackageSessionEntry.delta`. BELI +N, PAKAI −N, BATAL_PAKAI +N, BATAL_PAKET −sisa, PERPANJANG 0.
- **Kedaluwarsa (spec 5):** `expiresOn = startsOn + validDays − 1` (inklusif). Sesi bisa dipakai bila `expiresOn ≥ hari ini (WITA)`.
- **Label:** jenis baris `PAKET` = "Paket". Status tagihan `SEBAGIAN` tampil "Deposit", struk "DEPOSIT". Status hutang supplier tidak berubah.
- **Pesan galat tetap:**
  - "Paket {nama} sudah tidak dijual. Hapus barisnya."
  - "Sesi {treatment} di paket {nama} tinggal {n}. Lepas paket atau kurangi jumlahnya."
  - "Paket {nama} sudah kedaluwarsa {tanggal}. Lepas paket atau minta Admin Keuangan memperpanjang."
  - "Sesi paket {nama} sudah dipakai di tagihan {nomor}. Batalkan tagihan itu dulu."
  - "Paket ini milik customer lain."
  - "Baris sesi paket selalu Rp 0. Klik Lepas paket untuk menagih harga biasa."
  - "Baris sesi paket tidak bisa diberi diskon."
  - "Jumlah paket selalu 1. Tambahkan baris paket lagi untuk paket berikutnya."
- **Hak:** katalog `price:manage`; jual, pakai, dan lepas sesi `invoice:manage`; perpanjang `invoice:correct`; lihat paket customer `invoice:read`.
- **Migrasi hanya menambah**, dalam dua folder:
  - `20261014090000_paket_enum`: hanya `ALTER TYPE … ADD VALUE`, karena nilai enum baru tidak boleh dipakai di transaksi yang sama;
  - `20261014090100_paket_treatment`: tabel, kolom, dan CHECK.
- **Pola kode:** `runAction`/`UserFacingError`, `requireCapability`, `recordAudit`, `touchDraft`, `guardDiscount`, `lockInvoiceRow`, `safeRevalidatePath`. Berkas `"use server"` hanya mengekspor fungsi async (tipe boleh). Pembacaan untuk halaman ada di modul biasa (tanpa `"use server"`) yang memeriksa hak. Panel hanya MUI.
- **Urutan kunci:** baris `Invoice` dulu (seperti sekarang), lalu `PatientPackage` terurut menurut id (`lockPatientPackages`).
- **Pengujian:**
  - unit: `npx vitest run <berkas>`;
  - integrasi: `npm run test:integration -- <berkas>` (jangan bersamaan dengan E2E);
  - E2E: `npx playwright test <berkas> --project=desktop --workers=1`, lalu `--project=mobile`;
  - setelah mengubah skema: `npx prisma generate && npm run db:migrate:test`;
  - uji lama yang memang gagal: 3 uji di `schedule.test.ts`.
  - Sebelum suite integrasi penuh sesudah E2E, bersihkan sisa E2E di basis data uji:
    ```bash
    U=$(grep -E '^TEST_DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'); psql "$U" -qc 'begin; delete from "PackageSessionEntry"; update "InvoiceLine" set "patientPackageItemId" = null; delete from "PatientPackage"; delete from "InvoicePayment"; delete from "InvoiceStockUse"; delete from "InvoiceLine"; delete from "Invoice"; delete from "TreatmentPackage" where name like '"'"'Paket E2E%'"'"'; delete from "StockMovement"; delete from "SupplierReturnLine"; delete from "SupplierReturn"; delete from "SupplierPayment"; delete from "StockBatch"; delete from "PurchaseLine"; delete from "PurchaseInvoice"; commit;'
    ```
- **Commit:** Conventional Commits bahasa Inggris, diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Push, merge, dan deploy hanya atas permintaan pemilik.
- **Branch:** `paket-treatment`.

## Keputusan perencana (hal yang spec tidak merinci, atau perlu diluruskan)

1. **Halaman paket sendiri, `/admin/paket`, bukan tab di Layanan & Harga.**
   - Spec 4 menaruh katalog di Layanan & Harga dan spec 7 menaruh kartu paket (dengan "Perpanjang") di detail pasien. Masalahnya:
     - Layanan & Harga sekarang berhak `content:manage`, sehingga harus dibuka sebagian untuk `price:manage`;
     - detail pasien berhak `booking:manage`, yang **tidak dimiliki Admin Keuangan**, sehingga Admin Keuangan tidak akan pernah bisa memperpanjang.
   - Maka: menu **"Paket"** (`/admin/paket`, hak `invoice:read`) dengan tab:
     - **"Paket customer"**: semua peran `invoice:read`, berupa daftar dan pencarian;
     - **"Katalog paket"**: hanya `price:manage`.
   - Detail satu paket customer ada di `/admin/paket/{id}`, berisi sisa, riwayat, dan "Perpanjang".
   - Detail pasien mendapat tab **"Paket"** (bila staf punya `invoice:read`) yang menautkan ke halaman paket itu.
   - Isi, hak, dan perilakunya sama dengan spec; hanya letaknya yang berbeda.
2. **Jumlah baris PAKET selalu 1** (CHECK dan server). Paket kedua = baris kedua.
3. **`PatientPackage.price` = harga satuan baris saat final** (harga yang ditagih sebelum diskon baris).
4. **Baris PERPANJANG dicatat pada item pertama paket**, karena buku sesi per item. Riwayat menampilkannya tanpa nama treatment.
5. **"Sesi paket terpakai" di laporan = Σ −delta baris PAKAI** yang tagihannya masih FINAL di periode itu, menurut `finalizedAt` dan cabang tagihan pemakaian. PAKAI di tagihan yang dibatalkan tidak dihitung. Hasilnya sama dengan "PAKAI dikurangi BATAL_PAKAI yang berpasangan" (spec 8), dengan query yang lebih sederhana.
6. **Perkiraan sisa di layar draf** = Σ buku − Σ jumlah baris draf lain yang sudah menandai item itu (spec 6). Pengecekan yang mengikat tetap saat finalisasi.
7. **Saringan "Sebagian" di spec 8 tidak ada.** Saringan daftar tagihan adalah Perlu ditagih / Draf / Belum lunas / Lunas / Dibatalkan, jadi yang berubah hanya label status (`INVOICE_STATUS_LABEL`) dan struk.
8. **Melepas paket** mengembalikan harga katalog layanan (`Service.promoPrice`). Bila layanan tidak ditemukan, harganya 0 dengan catatan harga kosong.
9. **Nama aksi `applyPackageSession`**, bukan `usePackageSession` seperti di spec 10. Aturan ESLint `react-hooks` menganggap fungsi berawalan `use` sebagai hook dan menolak pemanggilannya di dalam handler klik. Pasangannya tetap `releasePackageSession`.
10. **Opsi paket di layar** (`listPackageOptions(patientId)`) sudah dikurangi semua baris draf yang menandai item itu, termasuk draf ini. Keterangan baris sesi "sisa n dari m" juga dihitung begitu, sehingga artinya "setelah draf ini".

## Review Focus

1. **Paket kedaluwarsa antara ditandai dan difinalkan** (draf ditandai kemarin, difinalkan sesudah tanggal kedaluwarsa): finalisasi ditolak dengan pesan kedaluwarsa, dan draf tetap utuh (Task 7).
2. **Tagihan pembelian dibatalkan sementara draf lain sudah menandai sesinya** (belum final): pembatalan boleh; finalisasi draf itu kemudian ditolak "Paket {nama} sudah dibatalkan…" (Task 7).
3. **Jumlah baris sesi dinaikkan melebihi sisa setelah ditandai:** finalisasi ditolak dengan pesan sisa (Task 7).
4. **Permintaan buatan** yang memberi harga atau diskon pada baris sesi, atau memakai paket customer lain: ditolak (Task 7).
5. **Laporan bulan dengan tagihan pemakaian yang dibatalkan:** sesi tidak terhitung, dan pendapatan paket dihitung sekali (Task 11).

---

### Task 1: Skema, migrasi, dan pembersih uji

**Files:**
- Modify: `prisma/schema.prisma` (enum `InvoiceLineKind`, model `InvoiceLine`, `Patient`, `Service`; model dan enum baru)
- Create: `prisma/migrations/20261014090000_paket_enum/migration.sql`, `prisma/migrations/20261014090100_paket_treatment/migration.sql`
- Modify: `tests/integration/invoice-world.ts` (`cleanupBillingWorld`), `tests/e2e/prepare-db.mts` (urutan hapus)
- Modify: `tests/unit/migrations.test.ts`
- Test: `tests/integration/paket-schema.test.ts`

**Interfaces:**
- Produces:
  - model `TreatmentPackage`, `TreatmentPackageItem`, `PatientPackage`, `PatientPackageItem`, `PackageSessionEntry`;
  - enum `PatientPackageStatus { AKTIF DIBATALKAN }`, `PackageEntryKind { BELI PAKAI BATAL_PAKAI PERPANJANG BATAL_PAKET }`;
  - nilai `InvoiceLineKind.PAKET`;
  - kolom `InvoiceLine.treatmentPackageId`, `InvoiceLine.patientPackageItemId`;
  - relasi `InvoiceLine.purchasedPackage` (PatientPackage, "PackagePurchase"), `InvoiceLine.patientPackageItem` ("PackageSessionLine"), `InvoiceLine.packageEntries` ("PackageEntryLine");
  - CHECK `treatment_package_values`, `treatment_package_item_sessions`, `patient_package_dates`, `package_entry_delta`, `invoice_line_package_shape`.

- [ ] **Step 1: Uji yang gagal**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi paket treatment", () => {
  const enumSql = readFileSync("prisma/migrations/20261014090000_paket_enum/migration.sql", "utf8");
  const sql = readFileSync("prisma/migrations/20261014090100_paket_treatment/migration.sql", "utf8");

  it("nilai enum PAKET ditambah di migrasi sendiri, sebelum dipakai", () => {
    expect(enumSql).toMatch(/ALTER TYPE "InvoiceLineKind" ADD VALUE 'PAKET'/);
    expect(enumSql.replace(/--.*$/gm, "").trim().split(";").filter((s) => s.trim()).length).toBe(1);
  });

  it("hanya menambah, dan menjaga bentuk paket di basis data", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    for (const name of ["treatment_package_values", "treatment_package_item_sessions", "patient_package_dates", "package_entry_delta", "invoice_line_package_shape"]) {
      expect(sql, name).toMatch(new RegExp(`ADD CONSTRAINT "${name}" CHECK`));
    }
  });
});
```

`tests/integration/paket-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "skema-paket";
const WA = "6281200009601";
let world: BillingWorld;
let packageId: string;
let invoiceId: string;

const day = (value: string) => new Date(`${value}T00:00:00Z`);

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  packageId = (
    await prisma.treatmentPackage.create({
      data: { name: `${SLUG} Facial 3x`, price: 600_000, validDays: 90, items: { create: [{ serviceId: world.treatmentId, sessions: 3 }] } },
    })
  ).id;
  invoiceId = (await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, createdById: "s", createdByName: "Uji" } })).id;
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

const line = (data: Record<string, unknown>) =>
  prisma.invoiceLine.create({ data: { invoiceId, kind: "PAKET", name: "Facial 3x", quantity: 1, unitPrice: 600_000, treatmentPackageId: packageId, ...data } });

describe("skema paket treatment", () => {
  it("katalog: harga dan masa berlaku masuk akal, sesi 1..100", async () => {
    await expect(prisma.treatmentPackage.create({ data: { name: `${SLUG} x`, price: 1, validDays: 0 } })).rejects.toThrow(/treatment_package_values/);
    await expect(prisma.treatmentPackage.create({ data: { name: `${SLUG} y`, price: -1, validDays: 30 } })).rejects.toThrow(/treatment_package_values/);
    await expect(prisma.treatmentPackageItem.create({ data: { packageId, serviceId: world.slimmingTreatmentId, sessions: 0 } })).rejects.toThrow(/treatment_package_item_sessions/);
  });

  it("baris PAKET wajib merujuk paket katalog, jumlahnya 1, tanpa barang", async () => {
    await expect(line({ treatmentPackageId: null })).rejects.toThrow(/invoice_line_package_shape/);
    await expect(line({ quantity: 2 })).rejects.toThrow(/invoice_line_package_shape/);
    await expect(line({ itemId: world.productId })).rejects.toThrow(/invoice_line_package_shape|invoice_line_values/);
    await expect(prisma.invoiceLine.create({ data: { invoiceId, kind: "LAYANAN", name: "x", quantity: 1, unitPrice: 1, treatmentPackageId: packageId } })).rejects.toThrow(/invoice_line_package_shape/);
    expect((await line({})).kind).toBe("PAKET");
  });

  it("paket customer, buku sesi, dan baris pemakaian dijaga", async () => {
    const purchase = await line({});
    const owned = await prisma.patientPackage.create({
      data: {
        patientId: world.patientId,
        packageId,
        name: "Facial 3x",
        price: 600_000,
        purchaseLineId: purchase.id,
        startsOn: day("2031-01-01"),
        expiresOn: day("2031-03-31"),
        items: { create: [{ serviceId: world.treatmentId, serviceName: "Facial Uji", sessions: 3 }] },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    const itemId = owned.items[0].id;
    await expect(
      prisma.patientPackage.create({
        data: { patientId: world.patientId, packageId, name: "x", price: 1, purchaseLineId: (await line({})).id, startsOn: day("2031-02-01"), expiresOn: day("2031-01-01") },
      }),
    ).rejects.toThrow(/patient_package_dates/);
    const entry = (data: Record<string, unknown>) => prisma.packageSessionEntry.create({ data: { patientPackageItemId: itemId, kind: "BELI", delta: 3, staffId: "s", staffName: "Uji", ...data } });
    await expect(entry({ kind: "PAKAI", delta: 1 })).rejects.toThrow(/package_entry_delta/);
    await expect(entry({ kind: "BELI", delta: 0 })).rejects.toThrow(/package_entry_delta/);
    await expect(entry({ kind: "PERPANJANG", delta: 0 })).rejects.toThrow(/package_entry_delta/);
    expect((await entry({})).delta).toBe(3);

    const use = (data: Record<string, unknown>) =>
      prisma.invoiceLine.create({ data: { invoiceId, kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 0, patientPackageItemId: itemId, ...data } });
    await expect(use({ unitPrice: 1000 })).rejects.toThrow(/invoice_line_package_shape/);
    await expect(use({ kind: "LAYANAN" })).rejects.toThrow(/invoice_line_package_shape/);
    expect((await use({})).unitPrice).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts` dan `npm run test:integration -- tests/integration/paket-schema.test.ts`
Expected: unit FAIL (`ENOENT`); integrasi FAIL (model `treatmentPackage` tidak dikenal).

- [ ] **Step 3: Skema** — di `prisma/schema.prisma`:

Tambahkan `PAKET` ke enum `InvoiceLineKind` (setelah `BARANG`).

Di model `InvoiceLine`, setelah `dispensingLine`:

```prisma
  /// Paket katalog yang dijual baris PAKET (spec paket 5). CHECK invoice_line_package_shape.
  treatmentPackageId   String?
  treatmentPackage     TreatmentPackage?   @relation(fields: [treatmentPackageId], references: [id], onDelete: Restrict)
  /// Item paket customer yang dipakai baris TREATMENT ini (spec paket 6); baris itu selalu Rp 0 tanpa diskon.
  patientPackageItemId String?
  patientPackageItem   PatientPackageItem? @relation("PackageSessionLine", fields: [patientPackageItemId], references: [id], onDelete: Restrict)
  /// Paket customer yang lahir dari baris PAKET ini saat tagihan difinalkan.
  purchasedPackage     PatientPackage?     @relation("PackagePurchase")
  packageEntries       PackageSessionEntry[] @relation("PackageEntryLine")
```

dan tambahkan `@@index([patientPackageItemId])` di samping indeks yang ada.

Di model `Patient` tambahkan `packages PatientPackage[]`. Di model `Service` tambahkan `packageItems TreatmentPackageItem[]`.

Model dan enum baru (taruh setelah model `InvoicePayment`):

```prisma
enum PatientPackageStatus {
  AKTIF
  DIBATALKAN
}

enum PackageEntryKind {
  BELI
  PAKAI
  BATAL_PAKAI
  PERPANJANG
  BATAL_PAKET
}

/// Katalog paket treatment (spec paket 3–4). Tidak pernah dihapus; dinonaktifkan.
model TreatmentPackage {
  id              String                 @id @default(cuid())
  name            String
  price           Int
  validDays       Int
  description     String?
  isActive        Boolean                @default(true)
  sortOrder       Int                    @default(0)
  items           TreatmentPackageItem[]
  invoiceLines    InvoiceLine[]
  patientPackages PatientPackage[]
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt

  @@index([isActive, sortOrder])
}

model TreatmentPackageItem {
  id        String           @id @default(cuid())
  packageId String
  package   TreatmentPackage @relation(fields: [packageId], references: [id], onDelete: Cascade)
  serviceId String
  service   Service          @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  sessions  Int
  sortOrder Int              @default(0)

  @@unique([packageId, serviceId])
}

/// Paket milik customer; nama, harga, dan isi disalin saat tagihan pembelian difinalkan.
model PatientPackage {
  id             String               @id @default(cuid())
  patientId      String
  patient        Patient              @relation(fields: [patientId], references: [id], onDelete: Restrict)
  packageId      String
  package        TreatmentPackage     @relation(fields: [packageId], references: [id], onDelete: Restrict)
  name           String
  price          Int
  purchaseLineId String               @unique
  purchaseLine   InvoiceLine          @relation("PackagePurchase", fields: [purchaseLineId], references: [id], onDelete: Restrict)
  startsOn       DateTime             @db.Date
  /// Inklusif. Kedaluwarsa dihitung dari tanggal ini, bukan disimpan sebagai status.
  expiresOn      DateTime             @db.Date
  status         PatientPackageStatus @default(AKTIF)
  items          PatientPackageItem[]
  createdAt      DateTime             @default(now())

  @@index([patientId])
}

model PatientPackageItem {
  id               String                @id @default(cuid())
  patientPackageId String
  patientPackage   PatientPackage        @relation(fields: [patientPackageId], references: [id], onDelete: Cascade)
  serviceId        String
  serviceName      String
  /// Jatah awal. Sisa = Σ delta buku sesi.
  sessions         Int
  sortOrder        Int                   @default(0)
  entries          PackageSessionEntry[]
  invoiceLines     InvoiceLine[]         @relation("PackageSessionLine")

  @@unique([patientPackageId, serviceId])
}

/// Buku sesi paket (spec paket 3): hanya ditambah, tidak pernah diubah.
model PackageSessionEntry {
  id                   String             @id @default(cuid())
  patientPackageItemId String
  item                 PatientPackageItem @relation(fields: [patientPackageItemId], references: [id], onDelete: Restrict)
  kind                 PackageEntryKind
  delta                Int
  invoiceLineId        String?
  invoiceLine          InvoiceLine?       @relation("PackageEntryLine", fields: [invoiceLineId], references: [id], onDelete: Restrict)
  reason               String?
  previousExpiresOn    DateTime?          @db.Date
  newExpiresOn         DateTime?          @db.Date
  staffId              String
  staffName            String
  createdAt            DateTime           @default(now())

  @@index([patientPackageItemId])
  @@index([invoiceLineId])
}
```

- [ ] **Step 4: Migrasi**

Buat isi migrasi dari selisih skema, lalu pisahkan:

```bash
PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/paket.sql
```

`prisma/migrations/20261014090000_paket_enum/migration.sql` berisi **hanya**:

```sql
-- Paket treatment (spec docs/superpowers/specs/2026-10-13-paket-treatment-deposit-design.md bagian 3).
-- Nilai enum baru ditambah di migrasi sendiri: PostgreSQL tidak mengizinkan nilai baru dipakai di transaksi yang menambahkannya.
ALTER TYPE "InvoiceLineKind" ADD VALUE 'PAKET';
```

`prisma/migrations/20261014090100_paket_treatment/migration.sql`:
- awal: komentar `-- Paket treatment (spec … bagian 3). Hanya menambah: rilis lama mengabaikan tabel dan kolom baru.`;
- lalu seluruh isi `/tmp/paket.sql` **kecuali** baris `ALTER TYPE "InvoiceLineKind" ADD VALUE 'PAKET';`;
- lalu tambahkan di akhir:

```sql
-- Katalog: harga 0..2 M, masa berlaku 1..3650 hari, sesi 1..100.
ALTER TABLE "TreatmentPackage" ADD CONSTRAINT "treatment_package_values" CHECK ("price" >= 0 AND "price" <= 2000000000 AND "validDays" BETWEEN 1 AND 3650);
ALTER TABLE "TreatmentPackageItem" ADD CONSTRAINT "treatment_package_item_sessions" CHECK ("sessions" BETWEEN 1 AND 100);
ALTER TABLE "PatientPackageItem" ADD CONSTRAINT "patient_package_item_sessions" CHECK ("sessions" BETWEEN 1 AND 100);

-- Paket customer: berlaku sampai tidak sebelum mulai.
ALTER TABLE "PatientPackage" ADD CONSTRAINT "patient_package_dates" CHECK ("expiresOn" >= "startsOn");

-- Buku sesi: tanda delta sesuai jenis; perpanjangan selalu membawa tanggal lama, baru, dan alasan.
ALTER TABLE "PackageSessionEntry" ADD CONSTRAINT "package_entry_delta" CHECK (
  ("kind" = 'BELI' AND "delta" > 0)
  OR ("kind" = 'PAKAI' AND "delta" < 0)
  OR ("kind" = 'BATAL_PAKAI' AND "delta" > 0)
  OR ("kind" = 'BATAL_PAKET' AND "delta" <= 0)
  OR ("kind" = 'PERPANJANG' AND "delta" = 0 AND "previousExpiresOn" IS NOT NULL AND "newExpiresOn" IS NOT NULL AND "reason" IS NOT NULL AND "reason" <> '')
);

-- Baris PAKET: merujuk paket katalog, jumlah 1, tanpa barang/sesi. Baris pemakaian: TREATMENT, Rp 0, tanpa diskon.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_package_shape" CHECK (
  (("kind" = 'PAKET') = ("treatmentPackageId" IS NOT NULL))
  AND ("kind" <> 'PAKET' OR ("quantity" = 1 AND "itemId" IS NULL AND "patientPackageItemId" IS NULL))
  AND ("patientPackageItemId" IS NULL OR ("kind" = 'TREATMENT' AND "unitPrice" = 0 AND "discountAmount" = 0))
);
```

Jalankan: `npx prisma generate && npm run db:migrate:test`, lalu `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
Expected: migrasi berhasil; diff = `-- This is an empty migration.`

- [ ] **Step 5: Pembersih uji**

Relasi baru memakai Restrict, dan baris sesi → item → paket → baris pembelian saling merujuk. Karena itu pembersih harus melepas rujukan baris dulu.

Di `tests/integration/invoice-world.ts` `cleanupBillingWorld`, **sebelum** `await prisma.invoiceStockUse.deleteMany(...)`:

```ts
  // Paket treatment (rencana paket Task 1): buku sesi → lepas baris pemakaian → paket customer → (baris tagihan) → katalog.
  await prisma.packageSessionEntry.deleteMany({
    where: { OR: [{ invoiceLine: { invoice: { branch } } }, { item: { patientPackage: { purchaseLine: { invoice: { branch } } } } }] },
  });
  await prisma.invoiceLine.updateMany({ where: { invoice: { branch }, patientPackageItemId: { not: null } }, data: { patientPackageItemId: null } });
  await prisma.patientPackage.deleteMany({ where: { purchaseLine: { invoice: { branch } } } });
```

dan **sesudah** `await prisma.invoice.deleteMany({ where: { branch } });`:

```ts
  await prisma.treatmentPackage.deleteMany({ where: { name: { startsWith: slug } } });
```

Di `tests/e2e/prepare-db.mts`, **sebelum** `await prisma.invoicePayment.deleteMany();`:

```ts
// Paket treatment (paket.spec.ts): buku sesi dan paket customer lebih dulu, karena merujuk baris tagihan.
await prisma.packageSessionEntry.deleteMany();
await prisma.invoiceLine.updateMany({ where: { patientPackageItemId: { not: null } }, data: { patientPackageItemId: null } });
await prisma.patientPackage.deleteMany();
```

dan **sesudah** `await prisma.invoiceNumberCounter.deleteMany();`:

```ts
await prisma.treatmentPackage.deleteMany({ where: { name: { startsWith: "Paket E2E" } } });
```

- [ ] **Step 6: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/migrations.test.ts && npm run test:integration -- tests/integration/paket-schema.test.ts tests/integration/invoice-schema.test.ts tests/integration/perbaikan-tagihan-schema.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS; tsc bersih.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261014090000_paket_enum prisma/migrations/20261014090100_paket_treatment tests/unit/migrations.test.ts tests/integration/paket-schema.test.ts tests/integration/invoice-world.ts tests/e2e/prepare-db.mts
git commit -m "feat: schema for treatment packages and the session ledger"
```

---

### Task 2: Aturan murni paket

**Files:**
- Create: `src/lib/treatment-package.ts`
- Test: `tests/unit/treatment-package.test.ts`

**Interfaces:**
- Consumes: `addDaysToDateString` (`src/lib/time.ts`), `dateLabel`, `isDateString`, `MAX_AMOUNT`, `Validation` (`src/lib/stock.ts`).
- Produces:
  - `PACKAGE_VALID_DAYS_MAX = 3650`, `PACKAGE_SESSIONS_MAX = 100`, `PACKAGE_REASON_MAX = 200`;
  - `type PackageEntryKindValue`, `PACKAGE_ENTRY_LABEL`;
  - `type PatientPackageState = "AKTIF" | "KEDALUWARSA" | "HABIS" | "DIBATALKAN"`, `PACKAGE_STATE_LABEL`;
  - `type TreatmentPackageInput = { name: string; price: number; validDays: number; description: string; items: { serviceId: string; sessions: number }[] }`;
  - `type ValidTreatmentPackage` (sama, dengan `description: string | null`);
  - `validateTreatmentPackage(raw: unknown): Validation<ValidTreatmentPackage>`;
  - `packageExpiresOn(startsOn: string, validDays: number): string`;
  - `packageContentsLabel(items: readonly { name: string; sessions: number }[]): string` (contoh: "3× Facial, 2× Peeling");
  - `packageState(input: { status: "AKTIF" | "DIBATALKAN"; expiresOn: string; remaining: number }, today: string): PatientPackageState`;
  - `type PackageOption = { patientPackageItemId: string; patientPackageId: string; packageName: string; serviceId: string; serviceName: string; sessions: number; remaining: number; startsOn: string; expiresOn: string }`;
  - `packageOptionsFor(options: readonly PackageOption[], serviceId: string, quantity: number): PackageOption[]` (cocok dan cukup, kedaluwarsa terdekat dulu);
  - `sessionNote(input: { packageName: string; remaining: number; sessions: number }): string`;
  - `validateExtension(raw: unknown, ctx: { currentExpiresOn: string }): Validation<{ expiresOn: string; reason: string }>`.

- [ ] **Step 1: Uji yang gagal** — `tests/unit/treatment-package.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  packageContentsLabel,
  packageExpiresOn,
  packageOptionsFor,
  packageState,
  sessionNote,
  validateExtension,
  validateTreatmentPackage,
  type PackageOption,
} from "@/lib/treatment-package";

const valid = { name: " Facial Glow 5x ", price: 1_500_000, validDays: 180, description: "", items: [{ serviceId: "s1", sessions: 5 }] };

describe("validateTreatmentPackage", () => {
  it("merapikan isian yang sah", () => {
    expect(validateTreatmentPackage(valid)).toEqual({ ok: true, value: { name: "Facial Glow 5x", price: 1_500_000, validDays: 180, description: null, items: [{ serviceId: "s1", sessions: 5 }] } });
  });

  it("menolak isian yang tidak sah dengan pesan yang jelas", () => {
    const bad = (patch: Record<string, unknown>) => validateTreatmentPackage({ ...valid, ...patch });
    expect(bad({ name: " " })).toEqual({ ok: false, message: "Isi nama paket." });
    expect(bad({ name: "x".repeat(121) })).toEqual({ ok: false, message: "Nama paket paling banyak 120 karakter." });
    expect(bad({ price: -1 })).toEqual({ ok: false, message: "Harga paket tidak sah." });
    expect(bad({ price: 1.5 })).toEqual({ ok: false, message: "Harga paket tidak sah." });
    expect(bad({ validDays: 0 })).toEqual({ ok: false, message: "Masa berlaku 1–3650 hari." });
    expect(bad({ description: "x".repeat(501) })).toEqual({ ok: false, message: "Keterangan paling banyak 500 karakter." });
    expect(bad({ items: [] })).toEqual({ ok: false, message: "Tambahkan minimal satu treatment." });
    expect(bad({ items: [{ serviceId: "", sessions: 1 }] })).toEqual({ ok: false, message: "Pilih treatment." });
    expect(bad({ items: [{ serviceId: "s1", sessions: 0 }] })).toEqual({ ok: false, message: "Jumlah sesi 1–100." });
    expect(bad({ items: [{ serviceId: "s1", sessions: 1 }, { serviceId: "s1", sessions: 2 }] })).toEqual({ ok: false, message: "Treatment yang sama tidak boleh dua kali." });
    expect(validateTreatmentPackage(null)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("tanggal dan status paket", () => {
  it("kedaluwarsa inklusif: 180 hari sejak 13 Okt 2026 = 10 Apr 2027; melewati 29 Februari", () => {
    expect(packageExpiresOn("2026-10-13", 180)).toBe("2027-04-10");
    expect(packageExpiresOn("2028-02-28", 2)).toBe("2028-02-29");
    expect(packageExpiresOn("2026-10-13", 1)).toBe("2026-10-13");
  });

  it("status: dibatalkan > habis > kedaluwarsa > aktif", () => {
    expect(packageState({ status: "DIBATALKAN", expiresOn: "2030-01-01", remaining: 3 }, "2026-10-13")).toBe("DIBATALKAN");
    expect(packageState({ status: "AKTIF", expiresOn: "2026-10-01", remaining: 0 }, "2026-10-13")).toBe("HABIS");
    expect(packageState({ status: "AKTIF", expiresOn: "2026-10-12", remaining: 2 }, "2026-10-13")).toBe("KEDALUWARSA");
    expect(packageState({ status: "AKTIF", expiresOn: "2026-10-13", remaining: 2 }, "2026-10-13")).toBe("AKTIF");
  });

  it("label isi dan catatan sesi", () => {
    expect(packageContentsLabel([{ name: "Facial", sessions: 3 }, { name: "Peeling", sessions: 2 }])).toBe("3× Facial, 2× Peeling");
    expect(sessionNote({ packageName: "Facial Glow 5x", remaining: 3, sessions: 5 })).toBe("Sesi paket Facial Glow 5x · sisa 3 dari 5");
  });
});

describe("packageOptionsFor", () => {
  const option = (patch: Partial<PackageOption>): PackageOption => ({
    patientPackageItemId: "i1",
    patientPackageId: "p1",
    packageName: "A",
    serviceId: "s1",
    serviceName: "Facial",
    sessions: 5,
    remaining: 3,
    startsOn: "2026-01-01",
    expiresOn: "2026-12-31",
    ...patch,
  });

  it("hanya treatment yang sama dengan sisa cukup, kedaluwarsa terdekat dulu", () => {
    const options = [
      option({ patientPackageItemId: "late", expiresOn: "2027-06-01" }),
      option({ patientPackageItemId: "soon", expiresOn: "2026-11-01" }),
      option({ patientPackageItemId: "other", serviceId: "s2" }),
      option({ patientPackageItemId: "short", remaining: 1 }),
    ];
    expect(packageOptionsFor(options, "s1", 2).map((o) => o.patientPackageItemId)).toEqual(["soon", "late"]);
  });
});

describe("validateExtension", () => {
  it("tanggal baru harus setelah tanggal sekarang dan alasan wajib", () => {
    const ctx = { currentExpiresOn: "2026-12-31" };
    expect(validateExtension({ expiresOn: "2027-03-31", reason: " Customer sakit " }, ctx)).toEqual({ ok: true, value: { expiresOn: "2027-03-31", reason: "Customer sakit" } });
    expect(validateExtension({ expiresOn: "", reason: "x" }, ctx)).toEqual({ ok: false, message: "Isi tanggal berlaku baru." });
    expect(validateExtension({ expiresOn: "2026-12-31", reason: "x" }, ctx)).toEqual({ ok: false, message: "Tanggal baru harus setelah 31 Des 2026." });
    expect(validateExtension({ expiresOn: "2101-01-01", reason: "x" }, ctx)).toEqual({ ok: false, message: "Tanggal berlaku tidak sah." });
    expect(validateExtension({ expiresOn: "2027-01-01", reason: " " }, ctx)).toEqual({ ok: false, message: "Isi alasan perpanjangan." });
    expect(validateExtension({ expiresOn: "2027-01-01", reason: "x".repeat(201) }, ctx)).toEqual({ ok: false, message: "Alasan paling banyak 200 karakter." });
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/treatment-package.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/treatment-package"`).

- [ ] **Step 3: Implementasi** — `src/lib/treatment-package.ts`:

```ts
import { dateLabel, isDateString, MAX_AMOUNT, type Validation } from "./stock";
import { addDaysToDateString } from "./time";

// Aturan murni paket treatment (spec paket 3–7). Dipakai server dan browser; tanpa akses basis data.

export const PACKAGE_NAME_MAX = 120;
export const PACKAGE_DESCRIPTION_MAX = 500;
export const PACKAGE_VALID_DAYS_MAX = 3650;
export const PACKAGE_SESSIONS_MAX = 100;
export const PACKAGE_REASON_MAX = 200;
const LAST_DATE = "2100-12-31";

export type PackageEntryKindValue = "BELI" | "PAKAI" | "BATAL_PAKAI" | "PERPANJANG" | "BATAL_PAKET";
export const PACKAGE_ENTRY_LABEL: Record<PackageEntryKindValue, string> = {
  BELI: "Beli",
  PAKAI: "Pakai",
  BATAL_PAKAI: "Batal pakai",
  PERPANJANG: "Perpanjang",
  BATAL_PAKET: "Paket dibatalkan",
};

export type PatientPackageState = "AKTIF" | "KEDALUWARSA" | "HABIS" | "DIBATALKAN";
export const PACKAGE_STATE_LABEL: Record<PatientPackageState, string> = {
  AKTIF: "Aktif",
  KEDALUWARSA: "Kedaluwarsa",
  HABIS: "Habis",
  DIBATALKAN: "Dibatalkan",
};

export type TreatmentPackageInput = { name: string; price: number; validDays: number; description: string; items: { serviceId: string; sessions: number }[] };
export type ValidTreatmentPackage = Omit<TreatmentPackageInput, "description"> & { description: string | null };

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const text = (value: unknown): string | null => (value === undefined || value === null ? "" : typeof value === "string" ? value.trim() : null);

export function validateTreatmentPackage(raw: unknown): Validation<ValidTreatmentPackage> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(INVALID_FORM);
  const input = raw as Record<string, unknown>;
  const name = text(input.name);
  const description = text(input.description);
  if (name === null || description === null || !Array.isArray(input.items)) return fail(INVALID_FORM);
  if (!name) return fail("Isi nama paket.");
  if (name.length > PACKAGE_NAME_MAX) return fail(`Nama paket paling banyak ${PACKAGE_NAME_MAX} karakter.`);
  if (!isWhole(input.price, 0, MAX_AMOUNT)) return fail("Harga paket tidak sah.");
  if (!isWhole(input.validDays, 1, PACKAGE_VALID_DAYS_MAX)) return fail(`Masa berlaku 1–${PACKAGE_VALID_DAYS_MAX} hari.`);
  if (description.length > PACKAGE_DESCRIPTION_MAX) return fail(`Keterangan paling banyak ${PACKAGE_DESCRIPTION_MAX} karakter.`);
  if (input.items.length === 0) return fail("Tambahkan minimal satu treatment.");
  const items: ValidTreatmentPackage["items"] = [];
  for (const raw of input.items as unknown[]) {
    if (typeof raw !== "object" || raw === null) return fail(INVALID_FORM);
    const item = raw as Record<string, unknown>;
    if (typeof item.serviceId !== "string" || !item.serviceId) return fail("Pilih treatment.");
    if (!isWhole(item.sessions, 1, PACKAGE_SESSIONS_MAX)) return fail(`Jumlah sesi 1–${PACKAGE_SESSIONS_MAX}.`);
    if (items.some((other) => other.serviceId === item.serviceId)) return fail("Treatment yang sama tidak boleh dua kali.");
    items.push({ serviceId: item.serviceId, sessions: item.sessions as number });
  }
  return { ok: true, value: { name, price: input.price as number, validDays: input.validDays as number, description: description || null, items } };
}

/** Tanggal terakhir paket berlaku, inklusif: paket 1 hari berlaku di hari pembelian saja. */
export function packageExpiresOn(startsOn: string, validDays: number): string {
  return addDaysToDateString(startsOn, validDays - 1);
}

export function packageContentsLabel(items: readonly { name: string; sessions: number }[]): string {
  return items.map((item) => `${item.sessions}× ${item.name}`).join(", ");
}

export function packageState(input: { status: "AKTIF" | "DIBATALKAN"; expiresOn: string; remaining: number }, today: string): PatientPackageState {
  if (input.status === "DIBATALKAN") return "DIBATALKAN";
  if (input.remaining <= 0) return "HABIS";
  if (input.expiresOn < today) return "KEDALUWARSA";
  return "AKTIF";
}

/** Satu item paket customer yang bisa dipakai di draf; `remaining` sudah dikurangi baris draf lain (rencana paket keputusan 6). */
export type PackageOption = {
  patientPackageItemId: string;
  patientPackageId: string;
  packageName: string;
  serviceId: string;
  serviceName: string;
  sessions: number;
  remaining: number;
  startsOn: string;
  expiresOn: string;
};

/** Paket yang bisa dipakai untuk treatment ini, kedaluwarsa terdekat lebih dulu (spec paket 6). */
export function packageOptionsFor(options: readonly PackageOption[], serviceId: string, quantity: number): PackageOption[] {
  return options
    .filter((option) => option.serviceId === serviceId && option.remaining >= quantity)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.startsOn.localeCompare(b.startsOn) || a.patientPackageItemId.localeCompare(b.patientPackageItemId));
}

export function sessionNote(input: { packageName: string; remaining: number; sessions: number }): string {
  return `Sesi paket ${input.packageName} · sisa ${input.remaining} dari ${input.sessions}`;
}

export function validateExtension(raw: unknown, ctx: { currentExpiresOn: string }): Validation<{ expiresOn: string; reason: string }> {
  if (typeof raw !== "object" || raw === null) return fail(INVALID_FORM);
  const input = raw as Record<string, unknown>;
  if (!isDateString(input.expiresOn)) return fail("Isi tanggal berlaku baru.");
  if (input.expiresOn > LAST_DATE) return fail("Tanggal berlaku tidak sah.");
  if (input.expiresOn <= ctx.currentExpiresOn) return fail(`Tanggal baru harus setelah ${dateLabel(ctx.currentExpiresOn)}.`);
  const reason = text(input.reason);
  if (reason === null) return fail(INVALID_FORM);
  if (!reason) return fail("Isi alasan perpanjangan.");
  if (reason.length > PACKAGE_REASON_MAX) return fail(`Alasan paling banyak ${PACKAGE_REASON_MAX} karakter.`);
  return { ok: true, value: { expiresOn: input.expiresOn, reason } };
}
```

Bila `dateLabel("2026-12-31")` tidak menghasilkan "31 Des 2026", sesuaikan harapan uji dengan keluaran `dateLabel` yang ada dan catat sebagai Ruling.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/treatment-package.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS; tsc bersih.

- [ ] **Step 5: Commit**

```bash
git add src/lib/treatment-package.ts tests/unit/treatment-package.test.ts
git commit -m "feat: pure rules for treatment packages"
```

---

### Task 3: Katalog paket — server

**Files:**
- Create: `src/server/treatment-package-catalog.ts`
- Create: `tests/integration/package-world.ts`
- Test: `tests/integration/treatment-package-catalog.test.ts`

**Interfaces:**
- Consumes: Task 2 `validateTreatmentPackage`, `packageContentsLabel`, `TreatmentPackageInput`.
- Produces:
  - `type TreatmentPackageView = { id; name; price; validDays; description: string | null; isActive; sortOrder; items: { serviceId; serviceName; sessions }[]; contents: string; soldCount: number }`;
  - `type SellablePackage = { id: string; name: string; price: number; validDays: number; contents: string }`;
  - `type PackageServiceOption = { id: string; name: string; categoryName: string }`;
  - `listTreatmentPackages()` dan `listPackageServices()` (`price:manage`);
  - `listSellablePackages()` (`invoice:manage`);
  - `createTreatmentPackage(input): ActionResult<{ id }>`, `updateTreatmentPackage(id, input): ActionResult<void>`, `setTreatmentPackageActive(id, active): ActionResult<void>`;
  - audit `treatment-package.create|update|activate|deactivate`;
  - pembantu uji `catalogPackage(world, input)` di `tests/integration/package-world.ts`.

- [ ] **Step 1: Pembantu uji** — `tests/integration/package-world.ts`:

```ts
import { prisma } from "@/lib/db";
import type { BillingWorld } from "./invoice-world";

/** Paket katalog langsung di basis data (tanpa aksi server); nama selalu diawali slug dunia uji agar ikut dibersihkan. */
export async function catalogPackage(
  world: BillingWorld,
  input: { name: string; price?: number; validDays?: number; items?: { serviceId: string; sessions: number }[]; isActive?: boolean },
): Promise<string> {
  const items = input.items ?? [{ serviceId: world.treatmentId, sessions: 3 }];
  const created = await prisma.treatmentPackage.create({
    data: {
      name: `${world.slug} ${input.name}`,
      price: input.price ?? 600_000,
      validDays: input.validDays ?? 90,
      isActive: input.isActive ?? true,
      items: { create: items.map((item, index) => ({ ...item, sortOrder: index })) },
    },
    select: { id: true },
  });
  return created.id;
}
```

- [ ] **Step 2: Uji yang gagal** — `tests/integration/treatment-package-catalog.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createTreatmentPackage,
  listSellablePackages,
  listTreatmentPackages,
  setTreatmentPackageActive,
  updateTreatmentPackage,
} from "@/server/treatment-package-catalog";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Paket", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "katalog-paket";
const WA = "6281200009602";
let world: BillingWorld;
const input = () => ({
  name: `${SLUG} Facial Glow 5x`,
  price: 1_500_000,
  validDays: 180,
  description: "",
  items: [
    { serviceId: world.treatmentId, sessions: 5 },
    { serviceId: world.slimmingTreatmentId, sessions: 1 },
  ],
});

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("katalog paket treatment", () => {
  it("Admin Keuangan membuat, mengubah, menonaktifkan; isi dan audit tercatat", async () => {
    const { id } = await unwrap(createTreatmentPackage(input()));
    const created = (await listTreatmentPackages()).find((row) => row.id === id)!;
    expect(created).toMatchObject({ name: `${SLUG} Facial Glow 5x`, price: 1_500_000, validDays: 180, description: null, isActive: true, soldCount: 0 });
    expect(created.contents).toBe("5× Facial Uji, 1× Meso Uji");
    expect(await prisma.auditLog.count({ where: { action: "treatment-package.create", entityId: id } })).toBe(1);

    await unwrap(updateTreatmentPackage(id, { ...input(), price: 1_200_000, items: [{ serviceId: world.treatmentId, sessions: 4 }] }));
    const updated = (await listTreatmentPackages()).find((row) => row.id === id)!;
    expect(updated).toMatchObject({ price: 1_200_000, contents: "4× Facial Uji" });
    expect(await prisma.auditLog.count({ where: { action: "treatment-package.update", entityId: id } })).toBe(1);

    expect((await listSellablePackages().catch(() => null)) ?? "forbidden").toBe("forbidden");
    actor.role = "RESEPSIONIS";
    expect((await listSellablePackages()).map((row) => row.id)).toContain(id);
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(setTreatmentPackageActive(id, false));
    actor.role = "RESEPSIONIS";
    expect((await listSellablePackages()).map((row) => row.id)).not.toContain(id);
    actor.role = "ADMIN_KEUANGAN";
    expect(await prisma.auditLog.count({ where: { action: "treatment-package.deactivate", entityId: id } })).toBe(1);
  });

  it("nama ganda di antara paket aktif dan treatment nonaktif ditolak", async () => {
    const name = `${SLUG} Ganda`;
    await unwrap(createTreatmentPackage({ ...input(), name }));
    expect(await createTreatmentPackage({ ...input(), name: name.toUpperCase() })).toEqual({ ok: false, error: "Paket dengan nama ini sudah ada." });
    await prisma.service.update({ where: { id: world.slimmingTreatmentId }, data: { isActive: false } });
    expect(await createTreatmentPackage({ ...input(), name: `${SLUG} Lain` })).toEqual({ ok: false, error: "Treatment tidak ditemukan atau nonaktif." });
    await prisma.service.update({ where: { id: world.slimmingTreatmentId }, data: { isActive: true } });
    expect(await createTreatmentPackage({ ...input(), items: [] })).toEqual({ ok: false, error: "Tambahkan minimal satu treatment." });
  });

  it("resepsionis tidak bisa mengelola katalog", async () => {
    actor.role = "RESEPSIONIS";
    await expect(createTreatmentPackage(input())).rejects.toThrow("forbidden: price:manage");
    await expect(listTreatmentPackages()).rejects.toThrow("forbidden: price:manage");
  });
});
```

Catatan: nama layanan di dunia uji adalah "Facial Uji" (`world.treatmentId`) dan "Meso Uji" (`world.slimmingTreatmentId`). Jangan memakai `world.consultationId`: layanan konsultasi itu milik seed dan dipakai uji lain.

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/treatment-package-catalog.test.ts`
Expected: FAIL (`Failed to resolve import "@/server/treatment-package-catalog"`).

- [ ] **Step 4: Implementasi** — `src/server/treatment-package-catalog.ts`:

```ts
"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { packageContentsLabel, validateTreatmentPackage, type TreatmentPackageInput, type ValidTreatmentPackage } from "@/lib/treatment-package";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export type TreatmentPackageView = {
  id: string;
  name: string;
  price: number;
  validDays: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  items: { serviceId: string; serviceName: string; sessions: number }[];
  /** "3× Facial, 2× Peeling". */
  contents: string;
  /** Berapa kali paket ini sudah difinalkan di tagihan. */
  soldCount: number;
};
export type SellablePackage = { id: string; name: string; price: number; validDays: number; contents: string };
export type PackageServiceOption = { id: string; name: string; categoryName: string };

const SELECT = {
  id: true,
  name: true,
  price: true,
  validDays: true,
  description: true,
  isActive: true,
  sortOrder: true,
  items: { orderBy: { sortOrder: "asc" }, select: { serviceId: true, sessions: true, service: { select: { name: true } } } },
  _count: { select: { patientPackages: true } },
} as const;
type Row = Prisma.TreatmentPackageGetPayload<{ select: typeof SELECT }>;

function view(row: Row): TreatmentPackageView {
  const items = row.items.map((item) => ({ serviceId: item.serviceId, serviceName: item.service.name, sessions: item.sessions }));
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    validDays: row.validDays,
    description: row.description,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    items,
    contents: packageContentsLabel(items.map((item) => ({ name: item.serviceName, sessions: item.sessions }))),
    soldCount: row._count.patientPackages,
  };
}

const summaryOf = (row: TreatmentPackageView) => `${row.name}: ${formatRupiah(row.price)} · ${row.contents} · ${row.validDays} hari`;
const itemRows = (value: ValidTreatmentPackage) => value.items.map((item, index) => ({ serviceId: item.serviceId, sessions: item.sessions, sortOrder: index }));

function revalidate() {
  safeRevalidatePath("/admin/paket");
  safeRevalidatePath("/admin/tagihan");
}

async function assertNameFree(name: string, exceptId?: string) {
  const twin = await prisma.treatmentPackage.findFirst({
    where: { isActive: true, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (twin) throw new UserFacingError("Paket dengan nama ini sudah ada.");
}

async function checkCatalog(value: ValidTreatmentPackage, exceptId?: string) {
  const services = await prisma.service.findMany({ where: { id: { in: value.items.map((item) => item.serviceId) }, isActive: true }, select: { id: true } });
  if (services.length !== value.items.length) throw new UserFacingError("Treatment tidak ditemukan atau nonaktif.");
  await assertNameFree(value.name, exceptId);
}

/** Semua paket katalog, aktif dulu (spec paket 4). */
export async function listTreatmentPackages(): Promise<TreatmentPackageView[]> {
  await requireCapability("price:manage");
  const rows = await prisma.treatmentPackage.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }], select: SELECT });
  return rows.map(view);
}

/** Layanan aktif yang bisa menjadi isi paket. */
export async function listPackageServices(): Promise<PackageServiceOption[]> {
  await requireCapability("price:manage");
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, name: true, category: { select: { name: true } } },
  });
  return services.map((service) => ({ id: service.id, name: service.name, categoryName: service.category.name }));
}

/** Paket aktif untuk dialog "Jual paket" di tagihan (spec paket 5). */
export async function listSellablePackages(): Promise<SellablePackage[]> {
  await requireCapability("invoice:manage");
  const rows = await prisma.treatmentPackage.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: SELECT });
  return rows.map(view).map(({ id, name, price, validDays, contents }) => ({ id, name, price, validDays, contents }));
}

export async function createTreatmentPackage(input: TreatmentPackageInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const checked = validateTreatmentPackage(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    await checkCatalog(value);
    const last = await prisma.treatmentPackage.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.treatmentPackage.create({
      data: {
        name: value.name,
        price: value.price,
        validDays: value.validDays,
        description: value.description,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        items: { create: itemRows(value) },
      },
      select: SELECT,
    });
    await recordAudit({ actor, action: "treatment-package.create", entity: "TreatmentPackage", entityId: created.id, summary: summaryOf(view(created)) });
    revalidate();
    return { id: created.id };
  });
}

/** Mengubah katalog tidak mengubah paket yang sudah dijual: isinya disalin saat dijual (spec paket 4). */
export async function updateTreatmentPackage(id: string, input: TreatmentPackageInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const checked = validateTreatmentPackage(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    const existing = await prisma.treatmentPackage.findUnique({ where: { id: String(id ?? "") }, select: { id: true } });
    if (!existing) throw new UserFacingError("Paket tidak ditemukan.");
    await checkCatalog(value, existing.id);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.treatmentPackageItem.deleteMany({ where: { packageId: existing.id } });
      return tx.treatmentPackage.update({
        where: { id: existing.id },
        data: { name: value.name, price: value.price, validDays: value.validDays, description: value.description, items: { create: itemRows(value) } },
        select: SELECT,
      });
    });
    await recordAudit({ actor, action: "treatment-package.update", entity: "TreatmentPackage", entityId: existing.id, summary: summaryOf(view(updated)) });
    revalidate();
  });
}

export async function setTreatmentPackageActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const on = active === true;
    const existing = await prisma.treatmentPackage.findUnique({ where: { id: String(id ?? "") }, select: { id: true, name: true } });
    if (!existing) throw new UserFacingError("Paket tidak ditemukan.");
    if (on) await assertNameFree(existing.name, existing.id);
    await prisma.treatmentPackage.update({ where: { id: existing.id }, data: { isActive: on } });
    await recordAudit({
      actor,
      action: on ? "treatment-package.activate" : "treatment-package.deactivate",
      entity: "TreatmentPackage",
      entityId: existing.id,
      summary: existing.name,
    });
    revalidate();
  });
}
```

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/treatment-package-catalog.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS; tsc bersih.

- [ ] **Step 6: Commit**

```bash
git add src/server/treatment-package-catalog.ts tests/integration/package-world.ts tests/integration/treatment-package-catalog.test.ts
git commit -m "feat: treatment package catalog actions for finance"
```

---

### Task 4: Katalog paket — halaman `/admin/paket`

**Files:**
- Create: `src/components/admin/package/treatment-package-catalog.tsx`
- Create: `src/app/(admin)/admin/paket/page.tsx`
- Modify: `src/components/admin/app-sidebar.tsx` (menu "Paket")
- Test: `tests/unit/components/treatment-package-catalog.test.tsx`

**Interfaces:**
- Consumes: Task 3 `TreatmentPackageView`, `PackageServiceOption`, `createTreatmentPackage`, `updateTreatmentPackage`, `setTreatmentPackageActive`; Task 2 `validateTreatmentPackage`.
- Produces:
  - `TreatmentPackageCatalog({ packages, services })`;
  - halaman `/admin/paket?tab=katalog`. Di task ini halaman hanya punya tab katalog dan berhak `price:manage`; Task 9 menambah tab "Paket customer" dan mengubah haknya menjadi `invoice:read`;
  - menu sidebar "Paket" (`needs: "price:manage"`; Task 9 mengubahnya menjadi `invoice:read`).

- [ ] **Step 1: Uji yang gagal** — `tests/unit/components/treatment-package-catalog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TreatmentPackageCatalog } from "@/components/admin/package/treatment-package-catalog";
import { createTreatmentPackage, setTreatmentPackageActive, updateTreatmentPackage, type TreatmentPackageView } from "@/server/treatment-package-catalog";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/treatment-package-catalog", () => ({ createTreatmentPackage: vi.fn(), updateTreatmentPackage: vi.fn(), setTreatmentPackageActive: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const services = [
  { id: "s1", name: "Relaxing Facial", categoryName: "Facial Treatment" },
  { id: "s2", name: "Peeling", categoryName: "Peeling" },
];
const glow: TreatmentPackageView = {
  id: "p1",
  name: "Facial Glow 5x",
  price: 1_500_000,
  validDays: 180,
  description: null,
  isActive: true,
  sortOrder: 0,
  items: [{ serviceId: "s1", serviceName: "Relaxing Facial", sessions: 5 }],
  contents: "5× Relaxing Facial",
  soldCount: 2,
};

beforeEach(() => vi.clearAllMocks());

describe("TreatmentPackageCatalog", () => {
  it("menampilkan paket dengan isi, harga, masa berlaku, dan status", () => {
    renderAdmin(<TreatmentPackageCatalog packages={[glow, { ...glow, id: "p2", name: "Paket Lama", isActive: false }]} services={services} />);
    const list = screen.getByRole("table", { name: "Katalog paket" });
    expect(list).toHaveTextContent("Facial Glow 5x");
    expect(list).toHaveTextContent("5× Relaxing Facial");
    expect(list).toHaveTextContent("Rp 1.500.000");
    expect(list).toHaveTextContent("180 hari");
    expect(list).toHaveTextContent("Nonaktif");
  });

  it("menambah paket campuran", async () => {
    vi.mocked(createTreatmentPackage).mockResolvedValue({ ok: true, data: { id: "p9" } });
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.type(within(dialog).getByLabelText("Nama paket"), "Paket Glowing");
    await user.type(within(dialog).getByLabelText("Harga"), "900000");
    await user.clear(within(dialog).getByLabelText("Masa berlaku (hari)"));
    await user.type(within(dialog).getByLabelText("Masa berlaku (hari)"), "90");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    await user.clear(within(dialog).getByLabelText("Sesi 1"));
    await user.type(within(dialog).getByLabelText("Sesi 1"), "3");
    await user.click(within(dialog).getByRole("button", { name: "+ Treatment" }));
    await user.selectOptions(within(dialog).getByLabelText("Treatment 2"), "s2");
    await user.clear(within(dialog).getByLabelText("Sesi 2"));
    await user.type(within(dialog).getByLabelText("Sesi 2"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createTreatmentPackage).toHaveBeenCalledWith({
        name: "Paket Glowing",
        price: 900_000,
        validDays: 90,
        description: "",
        items: [
          { serviceId: "s1", sessions: 3 },
          { serviceId: "s2", sessions: 2 },
        ],
      }),
    );
  });

  it("galat isian tampil tanpa memanggil server; ubah dan nonaktifkan memanggil aksi dengan id", async () => {
    vi.mocked(updateTreatmentPackage).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(setTreatmentPackageActive).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[glow]} services={services} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Isi nama paket.");
    expect(createTreatmentPackage).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Ubah Facial Glow 5x" }));
    const edit = await screen.findByRole("dialog", { name: "Ubah paket" });
    expect(within(edit).getByLabelText("Nama paket")).toHaveValue("Facial Glow 5x");
    await user.click(within(edit).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateTreatmentPackage).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Facial Glow 5x", items: [{ serviceId: "s1", sessions: 5 }] })));

    await user.click(screen.getByRole("button", { name: "Nonaktifkan Facial Glow 5x" }));
    await waitFor(() => expect(setTreatmentPackageActive).toHaveBeenCalledWith("p1", false));
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/treatment-package-catalog.test.tsx`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi komponen** — `src/components/admin/package/treatment-package-catalog.tsx`:

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
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { formatRupiah } from "@/lib/format";
import { validateTreatmentPackage, type TreatmentPackageInput } from "@/lib/treatment-package";
import {
  createTreatmentPackage,
  setTreatmentPackageActive,
  updateTreatmentPackage,
  type PackageServiceOption,
  type TreatmentPackageView,
} from "@/server/treatment-package-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { StatusChip } from "../mui/status-chip";
import { EmptyState, SectionCard } from "../page-layout";
import { RupiahInput } from "../rupiah-input";

type Draft = { name: string; price: number | null; validDays: string; description: string; items: { serviceId: string; sessions: string }[] };
const EMPTY: Draft = { name: "", price: null, validDays: "180", description: "", items: [{ serviceId: "", sessions: "1" }] };

function draftOf(pkg: TreatmentPackageView): Draft {
  return {
    name: pkg.name,
    price: pkg.price,
    validDays: String(pkg.validDays),
    description: pkg.description ?? "",
    items: pkg.items.map((item) => ({ serviceId: item.serviceId, sessions: String(item.sessions) })),
  };
}

function inputOf(draft: Draft): TreatmentPackageInput {
  return {
    name: draft.name,
    price: draft.price ?? Number.NaN,
    validDays: Number(draft.validDays),
    description: draft.description,
    items: draft.items.map((item) => ({ serviceId: item.serviceId, sessions: Number(item.sessions) })),
  };
}

/** Tambah atau ubah satu paket katalog (spec paket 4). */
function PackageDialog({ pkg, services, triggerLabel }: { pkg?: TreatmentPackageView; services: PackageServiceOption[]; triggerLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setItem = (index: number, patch: Partial<Draft["items"][number]>) =>
    setDraft((d) => ({ ...d, items: d.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  function openDialog() {
    setDraft(pkg ? draftOf(pkg) : EMPTY);
    setError(null);
    setOpen(true);
  }

  function save() {
    const input = inputOf(draft);
    const checked = validateTreatmentPackage(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = pkg ? await updateTreatmentPackage(pkg.id, input) : await createTreatmentPackage(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(pkg ? "Paket diperbarui." : "Paket ditambahkan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" size="small" variant={pkg ? "text" : "contained"} onClick={openDialog} aria-label={pkg ? `Ubah ${pkg.name}` : undefined}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>{pkg ? "Ubah paket" : "Tambah paket"}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id="package-name" label="Nama paket" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} fullWidth />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <RupiahInput id="package-price" label="Harga" value={draft.price} onChange={(price) => setDraft((d) => ({ ...d, price }))} fullWidth />
              <TextField
                id="package-days"
                label="Masa berlaku (hari)"
                type="number"
                value={draft.validDays}
                onChange={(e) => setDraft((d) => ({ ...d, validDays: e.target.value }))}
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: 3650, inputMode: "numeric" } }}
              />
            </Box>
            <TextField
              id="package-description"
              label="Keterangan (opsional)"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
            />
            <Typography component="h3" variant="subtitle2">
              Isi paket
            </Typography>
            {draft.items.map((item, index) => (
              <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <SelectField aria-label={`Treatment ${index + 1}`} value={item.serviceId} onChange={(serviceId) => setItem(index, { serviceId })}>
                  <option value="">Pilih treatment</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.categoryName})
                    </option>
                  ))}
                </SelectField>
                <TextField
                  type="number"
                  value={item.sessions}
                  onChange={(e) => setItem(index, { sessions: e.target.value })}
                  sx={{ width: 96, flexShrink: 0 }}
                  slotProps={{ htmlInput: { "aria-label": `Sesi ${index + 1}`, min: 1, max: 100, inputMode: "numeric" } }}
                />
                {draft.items.length > 1 && (
                  <Button
                    type="button"
                    size="small"
                    variant="text"
                    aria-label={`Hapus treatment ${index + 1}`}
                    onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))}
                  >
                    Hapus
                  </Button>
                )}
              </Stack>
            ))}
            <Box>
              <Button type="button" size="small" variant="outlined" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { serviceId: "", sessions: "1" }] }))}>
                + Treatment
              </Button>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Katalog paket treatment untuk Admin Keuangan dan Super Admin (spec paket 4). */
export function TreatmentPackageCatalog({ packages, services }: { packages: TreatmentPackageView[]; services: PackageServiceOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult<void>>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(success);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard
      title="Katalog paket"
      description="Paket yang dijual resepsionis di tagihan. Mengubah paket tidak mengubah paket yang sudah dibeli customer."
      actions={<PackageDialog services={services} triggerLabel="+ Paket" />}
      flush
    >
      {packages.length === 0 ? (
        <EmptyState>Belum ada paket.</EmptyState>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Katalog paket">
            <TableHead>
              <TableRow>
                <TableCell>Paket</TableCell>
                <TableCell>Isi</TableCell>
                <TableCell align="right">Harga</TableCell>
                <TableCell>Berlaku</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <Box component="span" sx={{ fontWeight: 500 }}>
                      {pkg.name}
                    </Box>
                    {pkg.soldCount > 0 && (
                      <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                        Terjual {pkg.soldCount}×
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{pkg.contents}</TableCell>
                  <TableCell align="right">{formatRupiah(pkg.price)}</TableCell>
                  <TableCell>{pkg.validDays} hari</TableCell>
                  <TableCell>
                    <StatusChip label={pkg.isActive ? "Aktif" : "Nonaktif"} tone={pkg.isActive ? "success" : "neutral"} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <PackageDialog pkg={pkg} services={services} triggerLabel="Ubah" />
                      <Button
                        type="button"
                        size="small"
                        variant="text"
                        disabled={pending}
                        aria-label={`${pkg.isActive ? "Nonaktifkan" : "Aktifkan"} ${pkg.name}`}
                        onClick={() => run(() => setTreatmentPackageActive(pkg.id, !pkg.isActive), pkg.isActive ? "Paket dinonaktifkan." : "Paket diaktifkan.")}
                      >
                        {pkg.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 4: Halaman dan menu**

`src/app/(admin)/admin/paket/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { TreatmentPackageCatalog } from "@/components/admin/package/treatment-package-catalog";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { listPackageServices, listTreatmentPackages } from "@/server/treatment-package-catalog";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Paket" };

export default async function PackagesPage() {
  await requireCapability("price:manage");
  const [packages, services] = await Promise.all([listTreatmentPackages(), listPackageServices()]);
  return (
    <>
      <AdminHeader title="Paket" />
      <PageBody>
        <PageHeader title="Paket treatment" description="Katalog paket dan paket yang sudah dibeli customer." />
        <PageTabs label="Bagian paket" active="katalog" tabs={[{ id: "katalog", label: "Katalog paket", href: "/admin/paket?tab=katalog" }]} />
        <TreatmentPackageCatalog packages={packages} services={services} />
      </PageBody>
    </>
  );
}
```

`src/components/admin/app-sidebar.tsx`: impor `CardGiftcardOutlined` dari `@mui/icons-material/CardGiftcardOutlined` (ikuti gaya impor ikon lain di berkas itu), lalu di grup "Persediaan & keuangan", setelah "Tagihan", tambahkan:

```ts
      { title: "Paket", url: "/admin/paket", icon: CardGiftcardOutlined, needs: "price:manage" },
```

Bila ada uji unit yang mencocokkan daftar menu per peran (cari `NAV_GROUPS` atau "Layanan & Harga" di `tests/unit`), perbarui harapannya dan catat sebagai Ruling.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/treatment-package-catalog.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/package/treatment-package-catalog.tsx "src/app/(admin)/admin/paket/page.tsx" src/components/admin/app-sidebar.tsx tests/unit/components/treatment-package-catalog.test.tsx
git commit -m "feat: treatment package catalog page"
```

---

### Task 5: Menjual paket di tagihan draf

**Files:**
- Modify: `src/lib/invoice.ts` (jenis baris `PAKET`)
- Create: `src/server/package-store.ts` (`packageLineNotes`, bagian baris PAKET)
- Modify: `src/server/invoice-drafts.ts` (`addPackageLine`; `updateInvoiceLine` dan `refreshCatalogPrices` mengenali baris PAKET)
- Modify: `src/server/invoice-read.ts` (`InvoiceLineRow` baru: `treatmentPackageId`, `packageUse`, `packageNote`)
- Create: `src/components/admin/billing/add-package-dialog.tsx`
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`, `src/components/admin/billing/invoice-final-view.tsx`, `src/app/(admin)/admin/tagihan/[id]/page.tsx`
- Modify (fixture): `tests/unit/invoice-draft-editor.test.tsx`, `tests/unit/invoice-final-view.test.tsx`
- Test: `tests/integration/package-sale.test.ts`, `tests/unit/components/add-package-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 3 `SellablePackage`, `listSellablePackages`; Task 3 `catalogPackage` (uji); Task 2 `packageContentsLabel`.
- Produces:
  - `InvoiceLineKindValue` mencakup `"PAKET"`, dengan `INVOICE_LINE_KIND_LABEL.PAKET = "Paket"`;
  - `addPackageLine({ invoiceId, version, packageId }): Promise<ActionResult<{ version: number }>>`;
  - `InvoiceLineRow.treatmentPackageId: string | null`, `InvoiceLineRow.packageUse: { patientPackageItemId: string; packageName: string } | null`, `InvoiceLineRow.packageNote: string | null`;
  - `type PackageNoteLine = { id: string; kind: string; treatmentPackageId: string | null; patientPackageItemId: string | null }`, `packageLineNotes(db, lines): Promise<Map<string, string>>` di `src/server/package-store.ts`;
  - `AddPackageDialog({ invoiceId, version, packages })`;
  - `InvoiceDraftEditor` prop `packages?: SellablePackage[]` (bawaan `[]`).

- [ ] **Step 1: Uji integrasi yang gagal** — `tests/integration/package-sale.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addPackageLine, createDirectSale, refreshCatalogPrices, setLineDiscount, updateInvoiceLine } from "@/server/invoice-drafts";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Paket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "jual-paket";
const WA = "6281200009603";
let world: BillingWorld;
let packageId: string;

const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
async function draftWithPackage() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
  const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } });
  return { id, line };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  packageId = await catalogPackage(world, { name: "Facial 3x", price: 600_000, validDays: 90 });
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await prisma.treatmentPackage.update({ where: { id: packageId }, data: { price: 600_000, isActive: true } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("menjual paket di draf", () => {
  it("baris PAKET berharga katalog, jumlah 1, dengan keterangan isi dan masa berlaku", async () => {
    const { id, line } = await draftWithPackage();
    expect(line).toMatchObject({ kind: "PAKET", name: `${SLUG} Facial 3x`, quantity: 1, unitPrice: 600_000, treatmentPackageId: packageId });
    const detail = (await getInvoiceDetail(id))!;
    expect(detail.lines[0]).toMatchObject({ kind: "PAKET", catalogLinked: true, packageNote: "3× Facial Uji · berlaku 90 hari", packageUse: null, treatmentPackageId: packageId });
    expect(detail.totals.total).toBe(600_000);
    expect(await prisma.auditLog.count({ where: { action: "invoice.update", entityId: id, summary: `Tambah paket ${SLUG} Facial 3x` } })).toBe(1);
  });

  it("jumlah paket tidak bisa diubah; diskon baris manual tetap bisa dalam batas", async () => {
    const { id, line } = await draftWithPackage();
    expect(await updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 2, unitPrice: 600_000, priceNote: "" })).toEqual({
      ok: false,
      error: "Jumlah paket selalu 1. Tambahkan baris paket lagi untuk paket berikutnya.",
    });
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: line.id, kind: "NOMINAL", value: 60_000, reason: "Member lama" }));
    expect((await getInvoiceDetail(id))!.totals.total).toBe(540_000);
  });

  it("Segarkan harga katalog memperbarui harga paket", async () => {
    const { id } = await draftWithPackage();
    await prisma.treatmentPackage.update({ where: { id: packageId }, data: { price: 700_000 } });
    expect(await unwrap(refreshCatalogPrices({ invoiceId: id, version: await versionOf(id) }))).toMatchObject({ updated: 1 });
    expect((await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } })).unitPrice).toBe(700_000);
  });

  it("paket nonaktif tidak bisa ditambahkan", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await prisma.treatmentPackage.update({ where: { id: packageId }, data: { isActive: false } });
    expect(await addPackageLine({ invoiceId: id, version: 1, packageId })).toEqual({ ok: false, error: `Paket ${SLUG} Facial 3x sudah tidak dijual.` });
    expect(await addPackageLine({ invoiceId: id, version: 1, packageId: "tidak-ada" })).toEqual({ ok: false, error: "Paket tidak ditemukan." });
  });
});
```

- [ ] **Step 2: Uji komponen yang gagal** — `tests/unit/components/add-package-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddPackageDialog } from "@/components/admin/billing/add-package-dialog";
import { addPackageLine } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ addPackageLine: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const packages = [{ id: "p1", name: "Facial Glow 5x", price: 1_500_000, validDays: 180, contents: "5× Relaxing Facial" }];

beforeEach(() => vi.clearAllMocks());

describe("AddPackageDialog", () => {
  it("memilih paket menampilkan isinya lalu menambah baris", async () => {
    vi.mocked(addPackageLine).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    renderAdmin(<AddPackageDialog invoiceId="inv" version={2} packages={packages} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Jual paket" });
    await user.selectOptions(within(dialog).getByLabelText("Paket"), "p1");
    expect(dialog).toHaveTextContent("5× Relaxing Facial · berlaku 180 hari");
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(addPackageLine).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, packageId: "p1" }));
  });

  it("tanpa paket aktif: memberi tahu dan tidak bisa menambah", async () => {
    const user = userEvent.setup();
    renderAdmin(<AddPackageDialog invoiceId="inv" version={2} packages={[]} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Jual paket" });
    expect(dialog).toHaveTextContent("Belum ada paket aktif. Minta Admin Keuangan menambahkannya di menu Paket.");
    expect(within(dialog).getByRole("button", { name: "Tambah" })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/package-sale.test.ts` dan `npx vitest run tests/unit/components/add-package-dialog.test.tsx`
Expected: keduanya FAIL (`addPackageLine` tidak ada; modul dialog tidak ada).

- [ ] **Step 4: Jenis baris** — `src/lib/invoice.ts`:

```ts
export type InvoiceLineKindValue = "LAYANAN" | "TREATMENT" | "BARANG" | "PAKET";
```

dan tambahkan `PAKET: "Paket",` di `INVOICE_LINE_KIND_LABEL`.

- [ ] **Step 5: Keterangan baris paket** — `src/server/package-store.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { dateLabel, dateOnlyString } from "@/lib/stock";
import { packageContentsLabel } from "@/lib/treatment-package";

// Tanpa "use server": pembantu server paket treatment (spec paket 5–8), dipanggil di dalam transaksi tagihan
// atau dengan klien prisma biasa untuk tampilan.

type Db = Prisma.TransactionClient;

export type PackageNoteLine = { id: string; kind: string; treatmentPackageId: string | null; patientPackageItemId: string | null };

/**
 * Keterangan di bawah nama baris (spec paket 5, 8):
 * - baris PAKET draf: "3× Facial · berlaku 90 hari";
 * - baris PAKET final: "3× Facial · berlaku s.d. 12 Apr 2027".
 */
export async function packageLineNotes(db: Db, lines: readonly PackageNoteLine[]): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  const packageLines = lines.filter((line) => line.kind === "PAKET" && line.treatmentPackageId);
  if (packageLines.length > 0) {
    const [bought, catalog] = await Promise.all([
      db.patientPackage.findMany({
        where: { purchaseLineId: { in: packageLines.map((line) => line.id) } },
        select: { purchaseLineId: true, expiresOn: true, items: { orderBy: { sortOrder: "asc" }, select: { serviceName: true, sessions: true } } },
      }),
      db.treatmentPackage.findMany({
        where: { id: { in: packageLines.map((line) => line.treatmentPackageId!) } },
        select: { id: true, validDays: true, items: { orderBy: { sortOrder: "asc" }, select: { sessions: true, service: { select: { name: true } } } } },
      }),
    ]);
    for (const line of packageLines) {
      const own = bought.find((row) => row.purchaseLineId === line.id);
      if (own) {
        const contents = packageContentsLabel(own.items.map((item) => ({ name: item.serviceName, sessions: item.sessions })));
        notes.set(line.id, `${contents} · berlaku s.d. ${dateLabel(dateOnlyString(own.expiresOn))}`);
        continue;
      }
      const pkg = catalog.find((row) => row.id === line.treatmentPackageId);
      if (pkg) notes.set(line.id, `${packageContentsLabel(pkg.items.map((item) => ({ name: item.service.name, sessions: item.sessions })))} · berlaku ${pkg.validDays} hari`);
    }
  }
  return notes;
}
```

Bila `tsc` menolak klien `prisma` dari `@/lib/db` sebagai `Prisma.TransactionClient`, ketik `Db` sebagai `Prisma.TransactionClient | typeof prisma` (impor `prisma` sebagai tipe) dan catat sebagai Ruling.

- [ ] **Step 6: Server draf** — `src/server/invoice-drafts.ts`:

Konstanta baru di samping yang lain:

```ts
const PACKAGE_QUANTITY = "Jumlah paket selalu 1. Tambahkan baris paket lagi untuk paket berikutnya.";
```

Aksi baru (setelah `addFreeLine`):

```ts
/** Jual paket dari katalog (spec paket 5): satu baris PAKET berharga katalog, jumlah 1. */
export async function addPackageLine(input: { invoiceId: string; version: number; packageId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const pkg = await tx.treatmentPackage.findUnique({ where: { id: String(input.packageId ?? "") }, select: { id: true, name: true, price: true, isActive: true } });
      if (!pkg) throw new UserFacingError("Paket tidak ditemukan.");
      if (!pkg.isActive) throw new UserFacingError(`Paket ${pkg.name} sudah tidak dijual.`);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: { invoiceId, kind: "PAKET", name: pkg.name, quantity: 1, unitPrice: pkg.price, treatmentPackageId: pkg.id, sortOrder: await nextSortOrder(tx, invoiceId) },
        });
      });
      return { version, summary: `Tambah paket ${pkg.name}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}
```

Di `updateInvoiceLine`:
- tambahkan `kind: true, treatmentPackageId: true` ke `select` baris;
- tepat setelah pengecekan `DISPENSED_QUANTITY`, tambahkan:

```ts
      if (line.kind === "PAKET" && input.quantity !== 1) throw new UserFacingError(PACKAGE_QUANTITY);
```

- ganti penentuan `catalogPrice` dan `catalogLinked` dengan:

```ts
      const catalogPrice = line.itemId
        ? (await tx.stockItem.findUnique({ where: { id: line.itemId }, select: { sellPrice: true } }))?.sellPrice ?? null
        : line.treatmentPackageId
          ? (await tx.treatmentPackage.findUnique({ where: { id: line.treatmentPackageId }, select: { price: true } }))?.price ?? null
          : line.serviceId
            ? (await tx.service.findUnique({ where: { id: line.serviceId }, select: { promoPrice: true } }))?.promoPrice ?? null
            : null;
      const catalogLinked = line.itemId !== null || line.serviceId !== null || line.treatmentPackageId !== null;
```

Di `refreshCatalogPrices`:
- `where` menjadi `{ invoiceId, OR: [{ itemId: { not: null } }, { serviceId: { not: null } }, { treatmentPackageId: { not: null } }] }`;
- `select` mendapat `treatmentPackageId: true`;
- penentuan `price` menjadi:

```ts
          const price = line.itemId
            ? (item?.sellPrice ?? null)
            : line.treatmentPackageId
              ? ((await tx.treatmentPackage.findUnique({ where: { id: line.treatmentPackageId }, select: { price: true } }))?.price ?? null)
              : ((await tx.service.findUnique({ where: { id: line.serviceId! }, select: { promoPrice: true } }))?.promoPrice ?? null);
```

- [ ] **Step 7: Baca tagihan** — `src/server/invoice-read.ts`:

Di `InvoiceLineRow` tambahkan:

```ts
  /** Baris PAKET: paket katalog yang dijual (spec paket 5). */
  treatmentPackageId: string | null;
  /** Baris TREATMENT yang memakai sesi paket customer (spec paket 6). */
  packageUse: { patientPackageItemId: string; packageName: string } | null;
  /** Keterangan paket di bawah nama baris (isi dan masa berlaku, atau sesi paket yang dipakai). */
  packageNote: string | null;
```

Di `getInvoiceDetail`:
- `select` baris mendapat `treatmentPackageId: true, patientPackageItemId: true, patientPackageItem: { select: { patientPackage: { select: { name: true } } } },`;
- setelah `if (!invoice) return null;`: `const notes = await packageLineNotes(prisma, invoice.lines);` (impor dari `@/server/package-store`);
- pemetaan baris mendapat:

```ts
    treatmentPackageId: line.treatmentPackageId,
    packageUse: line.patientPackageItemId ? { patientPackageItemId: line.patientPackageItemId, packageName: line.patientPackageItem?.patientPackage.name ?? "" } : null,
    packageNote: notes.get(line.id) ?? null,
```

- `catalogLinked` menjadi `line.serviceId !== null || line.itemId !== null || line.treatmentPackageId !== null`.

- [ ] **Step 8: Dialog jual paket** — `src/components/admin/billing/add-package-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatRupiah } from "@/lib/format";
import { addPackageLine } from "@/server/invoice-drafts";
import type { SellablePackage } from "@/server/treatment-package-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

/** Jual paket treatment dari katalog (spec paket 5). */
export function AddPackageDialog({ invoiceId, version, packages }: { invoiceId: string; version: number; packages: SellablePackage[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = packages.find((pkg) => pkg.id === packageId);

  function add() {
    if (!packageId) {
      setError("Pilih paket.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await addPackageLine({ invoiceId, version, packageId });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        setPackageId("");
        router.refresh();
      } catch {
        setError("Gagal menambah paket. Coba lagi.");
      }
    });
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button type="button" variant="outlined" onClick={() => setOpen(true)}>
        + Paket
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Jual paket</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {packages.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Belum ada paket aktif. Minta Admin Keuangan menambahkannya di menu Paket.
              </Typography>
            ) : (
              <SelectField id="sell-package" label="Paket" value={packageId} onChange={setPackageId}>
                <option value="">Pilih paket</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} — {formatRupiah(pkg.price)}
                  </option>
                ))}
              </SelectField>
            )}
            {chosen && (
              <Typography variant="body2">
                {chosen.contents} · berlaku {chosen.validDays} hari
              </Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={add} disabled={pending || packages.length === 0}>
            Tambah
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 9: Editor, tampilan final, halaman**

`src/components/admin/billing/invoice-draft-editor.tsx`:
- impor `AddPackageDialog` dan `type SellablePackage` (dari `@/server/treatment-package-catalog`);
- prop `packages = []` (`packages?: SellablePackage[]`) di `InvoiceDraftEditor`;
- tambahkan `<AddPackageDialog invoiceId={detail.id} version={detail.version} packages={packages} />` setelah `<AddFreeLineDialog … />`;
- di `LineRow`, tepat setelah `<LineDiscountNote line={line} />`:

```tsx
        {line.packageNote && (
          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
            {line.packageNote}
          </Typography>
        )}
```

- isian jumlah di `LineRow`: `disabled={line.fromDispensing || line.kind === "PAKET"}`.

`src/components/admin/billing/invoice-final-view.tsx`: tambahkan blok `line.packageNote` yang sama setelah `<LineDiscountNote line={line} />`.

`src/app/(admin)/admin/tagihan/[id]/page.tsx`: impor `listSellablePackages`. Pada `InvoiceDraftEditor` tambahkan `packages={await listSellablePackages()}`. Cabang itu hanya dirender bila `canManage`, dan `listSellablePackages` berhak `invoice:manage`.

Fixture uji unit: di setiap objek baris pada `tests/unit/invoice-draft-editor.test.tsx` dan `tests/unit/invoice-final-view.test.tsx`, tambahkan `treatmentPackageId: null, packageUse: null, packageNote: null`. Di `tests/unit/invoice-draft-editor.test.tsx`, tambahkan `addPackageLine: vi.fn()` ke mock `@/server/invoice-drafts`.

- [ ] **Step 10: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/package-sale.test.ts tests/integration/invoice-draft.test.ts tests/integration/invoice-line-discount.test.ts && npx vitest run tests/unit/components/add-package-dialog.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/invoice.test.ts tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih. 

- [ ] **Step 11: Commit**

```bash
git add src/lib/invoice.ts src/server/package-store.ts src/server/invoice-drafts.ts src/server/invoice-read.ts src/components/admin/billing/add-package-dialog.tsx src/components/admin/billing/invoice-draft-editor.tsx src/components/admin/billing/invoice-final-view.tsx "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/integration/package-sale.test.ts tests/unit/components/add-package-dialog.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx
git commit -m "feat: sell treatment packages on draft invoices"
```

---

### Task 6: Paket customer lahir saat final; pembatalan tagihan pembelian

**Files:**
- Modify: `src/server/package-store.ts` (`lockPatientPackages`, `remainingByItem`, `activatePurchasedPackages`, `cancelPurchasedPackages`)
- Modify: `src/server/invoice-lifecycle.ts` (`finalizeInvoice`, `cancelInvoice`)
- Test: `tests/integration/package-purchase.test.ts`

**Interfaces:**
- Consumes: Task 2 `packageExpiresOn`; Task 5 `addPackageLine`, `packageLineNotes`.
- Produces (di `src/server/package-store.ts`):
  - `lockPatientPackages(tx, ids: string[]): Promise<void>` mengunci `FOR UPDATE`, terurut menurut id;
  - `remainingByItem(tx, itemIds: string[]): Promise<Map<string, number>>` (Σ delta);
  - `activatePurchasedPackages(tx, invoice: { patientId: string; lines: readonly { id: string; kind: string; name: string; unitPrice: number; treatmentPackageId: string | null }[] }, actor: { staffId: string; name: string }, today: string): Promise<void>`;
  - `cancelPurchasedPackages(tx, invoiceId: string, actor): Promise<void>`.

- [ ] **Step 1: Uji yang gagal** — `tests/integration/package-purchase.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dateLabel } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addPackageLine, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Paket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "beli-paket";
const WA = "6281200009604";
let world: BillingWorld;
let packageId: string;
const today = witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

async function draftWithPackage() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
  return id;
}
async function bought() {
  const id = await draftWithPackage();
  const { number } = await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
  const owned = await prisma.patientPackage.findFirstOrThrow({
    where: { purchaseLine: { invoiceId: id } },
    include: { items: { include: { entries: true } } },
  });
  return { id, number, owned };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  packageId = await catalogPackage(world, {
    name: "Glowing",
    price: 900_000,
    validDays: 90,
    items: [
      { serviceId: world.treatmentId, sessions: 3 },
      { serviceId: world.slimmingTreatmentId, sessions: 2 },
    ],
  });
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await prisma.treatmentPackage.update({ where: { id: packageId }, data: { isActive: true } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("paket customer saat tagihan pembelian difinalkan", () => {
  it("membuat paket customer dengan salinan isi, tanggal berlaku, dan buku BELI per treatment", async () => {
    const { id, owned } = await bought();
    const expires = addDaysToDateString(today, 89);
    expect(owned).toMatchObject({ patientId: world.patientId, packageId, name: `${SLUG} Glowing`, price: 900_000, status: "AKTIF", startsOn: day(today), expiresOn: day(expires) });
    expect(owned.items.map((item) => [item.serviceName, item.sessions, item.entries.map((e) => [e.kind, e.delta])])).toEqual([
      ["Facial Uji", 3, [["BELI", 3]]],
      ["Meso Uji", 2, [["BELI", 2]]],
    ]);
    expect((await getInvoiceDetail(id))!.lines[0].packageNote).toBe(`3× Facial Uji, 2× Meso Uji · berlaku s.d. ${dateLabel(expires)}`);

    // Katalog berubah sesudahnya: paket yang sudah dibeli tetap.
    await prisma.treatmentPackageItem.updateMany({ where: { packageId }, data: { sessions: 9 } });
    expect((await prisma.patientPackageItem.findMany({ where: { patientPackageId: owned.id }, orderBy: { sortOrder: "asc" } })).map((i) => i.sessions)).toEqual([3, 2]);
    await prisma.treatmentPackageItem.updateMany({ where: { packageId, serviceId: world.treatmentId }, data: { sessions: 3 } });
    await prisma.treatmentPackageItem.updateMany({ where: { packageId, serviceId: world.slimmingTreatmentId }, data: { sessions: 2 } });
  });

  it("paket yang dinonaktifkan sesudah ditambahkan: finalisasi ditolak dan tidak ada paket customer", async () => {
    const id = await draftWithPackage();
    await prisma.treatmentPackage.update({ where: { id: packageId }, data: { isActive: false } });
    expect(await finalizeInvoice({ invoiceId: id, version: await versionOf(id) })).toEqual({ ok: false, error: `Paket ${SLUG} Glowing sudah tidak dijual. Hapus barisnya.` });
    expect(await prisma.patientPackage.count({ where: { purchaseLine: { invoiceId: id } } })).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe("DRAF");
  });

  it("DP: tagihan paket yang dibayar sebagian tetap membuat paket aktif", async () => {
    const { id, owned } = await bought();
    await unwrap(recordInvoicePayment({ invoiceId: id, amount: 300_000, method: "TUNAI", paidAt: today, reference: "" }));
    expect((await getInvoiceDetail(id))!.totals.display).toBe("SEBAGIAN");
    expect(owned.status).toBe("AKTIF");
  });
});

describe("membatalkan tagihan pembelian paket", () => {
  it("belum terpakai: paket dibatalkan dan sisa sesi dikurangi lewat BATAL_PAKET", async () => {
    const { id, owned } = await bought();
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Salah input" }));
    const after = await prisma.patientPackage.findUniqueOrThrow({ where: { id: owned.id }, include: { items: { include: { entries: { orderBy: { createdAt: "asc" } } } } } });
    expect(after.status).toBe("DIBATALKAN");
    expect(after.items.map((item) => item.entries.map((e) => [e.kind, e.delta]))).toEqual([
      [["BELI", 3], ["BATAL_PAKET", -3]],
      [["BELI", 2], ["BATAL_PAKET", -2]],
    ]);
  });

  it("sesi sudah dipakai di tagihan final lain: pembatalan ditolak dengan nomor tagihan pemakaian", async () => {
    const { id, owned } = await bought();
    // Pemakaian disimulasikan langsung di basis data (aksi pemakaian ada di Task 7).
    const usage = await prisma.invoice.create({
      data: {
        patientId: world.patientId,
        branchId: world.branchId,
        createdById: "s",
        createdByName: "Uji",
        status: "FINAL",
        number: `TG-2031-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        finalizedAt: new Date(),
        lines: { create: [{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 0, patientPackageItemId: owned.items[0].id }] },
      },
      select: { number: true, lines: { select: { id: true } } },
    });
    await prisma.packageSessionEntry.create({ data: { patientPackageItemId: owned.items[0].id, kind: "PAKAI", delta: -1, invoiceLineId: usage.lines[0].id, staffId: "s", staffName: "Uji" } });
    expect(await cancelInvoice({ invoiceId: id, reason: "Salah input" })).toEqual({
      ok: false,
      error: `Sesi paket ${SLUG} Glowing sudah dipakai di tagihan ${usage.number}. Batalkan tagihan itu dulu.`,
    });
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: owned.id } })).status).toBe("AKTIF");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/package-purchase.test.ts`
Expected: FAIL (tidak ada `PatientPackage` setelah final; pembatalan tidak menyentuh paket).

- [ ] **Step 3: Pembantu buku sesi** — tambahkan di `src/server/package-store.ts`. Impor `UserFacingError` dari `@/lib/action-result` dan `packageExpiresOn` dari `@/lib/treatment-package`.

```ts
type Actor = { staffId: string; name: string };
const day = (value: string) => new Date(`${value}T00:00:00Z`);

/** Mengunci paket customer sampai transaksi selesai, berurutan menurut id agar dua transaksi tidak saling menunggu. */
export async function lockPatientPackages(tx: Db, ids: readonly string[]): Promise<void> {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "PatientPackage" WHERE id = ANY(${sorted}::text[]) ORDER BY id FOR UPDATE`;
}

/** Sisa sesi per item = Σ delta buku sesi (spec paket 3, 10). */
export async function remainingByItem(tx: Db, itemIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return new Map();
  const sums = await tx.packageSessionEntry.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids } }, _sum: { delta: true } });
  return new Map(ids.map((id) => [id, sums.find((row) => row.patientPackageItemId === id)?._sum.delta ?? 0]));
}

/** Setiap baris PAKET menjadi satu paket customer dengan buku BELI per treatment (spec paket 5). */
export async function activatePurchasedPackages(
  tx: Db,
  invoice: { patientId: string; lines: readonly { id: string; kind: string; name: string; unitPrice: number; treatmentPackageId: string | null }[] },
  actor: Actor,
  today: string,
): Promise<void> {
  for (const line of invoice.lines) {
    if (line.kind !== "PAKET" || !line.treatmentPackageId) continue;
    const pkg = await tx.treatmentPackage.findUnique({
      where: { id: line.treatmentPackageId },
      select: { name: true, validDays: true, isActive: true, items: { orderBy: { sortOrder: "asc" }, select: { serviceId: true, sessions: true, service: { select: { name: true } } } } },
    });
    if (!pkg || !pkg.isActive) throw new UserFacingError(`Paket ${line.name} sudah tidak dijual. Hapus barisnya.`);
    const created = await tx.patientPackage.create({
      data: {
        patientId: invoice.patientId,
        packageId: line.treatmentPackageId,
        name: pkg.name,
        price: line.unitPrice,
        purchaseLineId: line.id,
        startsOn: day(today),
        expiresOn: day(packageExpiresOn(today, pkg.validDays)),
        items: { create: pkg.items.map((item, index) => ({ serviceId: item.serviceId, serviceName: item.service.name, sessions: item.sessions, sortOrder: index })) },
      },
      select: { items: { select: { id: true, sessions: true } } },
    });
    await tx.packageSessionEntry.createMany({
      data: created.items.map((item) => ({ patientPackageItemId: item.id, kind: "BELI" as const, delta: item.sessions, invoiceLineId: line.id, staffId: actor.staffId, staffName: actor.name })),
    });
  }
}

/**
 * Tagihan pembelian dibatalkan (spec paket 7): ditolak bila ada sesi yang dipakai di tagihan yang masih final;
 * bila tidak, paket dibatalkan dan sisa sesinya dikurangi lewat BATAL_PAKET.
 */
export async function cancelPurchasedPackages(tx: Db, invoiceId: string, actor: Actor): Promise<void> {
  const packages = await tx.patientPackage.findMany({ where: { purchaseLine: { invoiceId } }, select: { id: true } });
  if (packages.length === 0) return;
  const ids = packages.map((pkg) => pkg.id);
  await lockPatientPackages(tx, ids);
  const used = await tx.packageSessionEntry.findFirst({
    where: { kind: "PAKAI", item: { patientPackageId: { in: ids } }, invoiceLine: { invoice: { status: "FINAL" } } },
    orderBy: { createdAt: "asc" },
    select: { item: { select: { patientPackage: { select: { name: true } } } }, invoiceLine: { select: { invoice: { select: { number: true } } } } },
  });
  if (used) {
    throw new UserFacingError(`Sesi paket ${used.item.patientPackage.name} sudah dipakai di tagihan ${used.invoiceLine?.invoice.number ?? "lain"}. Batalkan tagihan itu dulu.`);
  }
  const items = await tx.patientPackageItem.findMany({ where: { patientPackageId: { in: ids } }, select: { id: true } });
  const remaining = await remainingByItem(tx, items.map((item) => item.id));
  const entries = items
    .map((item) => ({ item, left: remaining.get(item.id) ?? 0 }))
    .filter(({ left }) => left > 0)
    .map(({ item, left }) => ({ patientPackageItemId: item.id, kind: "BATAL_PAKET" as const, delta: -left, staffId: actor.staffId, staffName: actor.name }));
  if (entries.length > 0) await tx.packageSessionEntry.createMany({ data: entries });
  await tx.patientPackage.updateMany({ where: { id: { in: ids } }, data: { status: "DIBATALKAN" } });
}
```

- [ ] **Step 4: Siklus tagihan** — `src/server/invoice-lifecycle.ts`:

Impor `activatePurchasedPackages, cancelPurchasedPackages` dari `@/server/package-store`.

Di `finalizeInvoice`:
- `select` tagihan mendapat `patientId: true`;
- `select` baris mendapat `treatmentPackageId: true`;
- tepat sebelum `const year = Number(today.slice(0, 4));`:

```ts
      // Paket yang dijual menjadi milik customer di transaksi yang sama (spec paket 5).
      await activatePurchasedPackages(tx, { patientId: invoice.patientId, lines: invoice.lines }, actor, today);
```

Di `cancelInvoice`: setelah pengecekan pembayaran (sebelum loop pengembalian stok):

```ts
      if (invoice.status === "FINAL") await cancelPurchasedPackages(tx, invoiceId, actor);
```

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/package-purchase.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/package-sale.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS; tsc bersih.

- [ ] **Step 6: Commit**

```bash
git add src/server/package-store.ts src/server/invoice-lifecycle.ts tests/integration/package-purchase.test.ts
git commit -m "feat: create customer packages on finalize and guard purchase cancellation"
```

---

### Task 7: Memakai sesi paket — server

**Files:**
- Modify: `src/server/package-store.ts` (`consumePackageSessions`, `restoreUsedSessions`, catatan baris sesi di `packageLineNotes`)
- Modify: `src/server/invoice-drafts.ts` (`applyPackageSession`, `releasePackageSession`; penjaga di `updateInvoiceLine`, `setLineDiscount`, `refreshCatalogPrices`)
- Modify: `src/server/invoice-lifecycle.ts` (finalisasi memotong sesi; pembatalan mengembalikan)
- Create: `src/server/patient-package-read.ts` (`listPackageOptions`)
- Test: `tests/integration/package-session.test.ts`

**Interfaces:**
- Consumes: Task 6 `lockPatientPackages`, `remainingByItem`; Task 2 `PackageOption`, `sessionNote`.
- Produces:
  - `applyPackageSession({ invoiceId, version, lineId, patientPackageItemId }): Promise<ActionResult<{ version: number }>>`;
  - `releasePackageSession({ invoiceId, version, lineId }): Promise<ActionResult<{ version: number }>>`;
  - `consumePackageSessions(tx, invoice: { patientId; lines: readonly { id; name; quantity; patientPackageItemId: string | null }[] }, actor, today)`;
  - `restoreUsedSessions(tx, invoiceId, actor)`;
  - `listPackageOptions(patientId: string): Promise<PackageOption[]>` (`invoice:read`).

- [ ] **Step 1: Uji yang gagal** — `tests/integration/package-session.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dateLabel } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import {
  addPackageLine,
  applyPackageSession,
  createDirectSale,
  createInvoiceFromVisit,
  refreshCatalogPrices,
  releasePackageSession,
  setLineDiscount,
  updateInvoiceLine,
} from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { listPackageOptions } from "@/server/patient-package-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Sesi", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "sesi-paket";
const WA = "6281200009605";
const WA_OTHER = "6281200009606";
let world: BillingWorld;
let facial3: string;
const today = witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
const remaining = async (itemId: string) => (await prisma.packageSessionEntry.aggregate({ where: { patientPackageItemId: itemId }, _sum: { delta: true } }))._sum.delta ?? 0;
const finalize = async (id: string) => finalizeInvoice({ invoiceId: id, version: await versionOf(id) });

async function ownPackage(packageId: string, patientId = world.patientId) {
  const { id } = await unwrap(createDirectSale({ patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
  await unwrap(finalize(id));
  const owned = await prisma.patientPackage.findFirstOrThrow({ where: { purchaseLine: { invoiceId: id } }, select: { id: true, name: true, items: { orderBy: { sortOrder: "asc" }, select: { id: true } } } });
  return { purchaseId: id, patientPackageId: owned.id, name: owned.name, itemId: owned.items[0].id };
}
async function visitDraft() {
  const { appointmentId } = await finalVisit(world);
  const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
  const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } });
  return { id, line };
}
const apply = async (draft: { id: string; line: { id: string } }, itemId: string) =>
  applyPackageSession({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, patientPackageItemId: itemId });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, WA_OTHER]);
  world = await createBillingWorld(SLUG, WA);
  facial3 = await catalogPackage(world, { name: "Facial 3x", validDays: 90 });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, WA_OTHER]);
  await prisma.$disconnect();
});

describe("memakai sesi paket", () => {
  it("baris menjadi Rp 0 tanpa diskon; sesi terpotong saat final; keterangan sisa", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.line.id } })).toMatchObject({ unitPrice: 0, discountAmount: 0, patientPackageItemId: own.itemId });
    expect((await getInvoiceDetail(draft.id))!.lines.find((line) => line.id === draft.line.id)).toMatchObject({
      packageUse: { patientPackageItemId: own.itemId, packageName: own.name },
      packageNote: `Sesi paket ${own.name} · sisa 2 dari 3`,
    });
    expect(await remaining(own.itemId)).toBe(3);
    await unwrap(finalize(draft.id));
    expect(await remaining(own.itemId)).toBe(2);
    expect(await prisma.packageSessionEntry.findFirst({ where: { invoiceLineId: draft.line.id } })).toMatchObject({ kind: "PAKAI", delta: -1, staffName: "Resepsionis Sesi" });
  });

  it("Lepas paket mengembalikan harga katalog; Segarkan harga tidak menyentuh baris sesi", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    await unwrap(refreshCatalogPrices({ invoiceId: draft.id, version: await versionOf(draft.id) }));
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.line.id } })).unitPrice).toBe(0);
    await unwrap(releasePackageSession({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.line.id } })).toMatchObject({ unitPrice: 250_000, patientPackageItemId: null });
  });

  it("permintaan buatan: harga, diskon, paket customer lain, dan treatment lain ditolak (Review Focus 4)", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    expect(await updateInvoiceLine({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, quantity: 1, unitPrice: 1000, priceNote: "x" })).toEqual({
      ok: false,
      error: "Baris sesi paket selalu Rp 0. Klik Lepas paket untuk menagih harga biasa.",
    });
    expect(await setLineDiscount({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, kind: "NOMINAL", value: 1, reason: "x" })).toEqual({
      ok: false,
      error: "Baris sesi paket tidak bisa diberi diskon.",
    });

    const other = await prisma.patient.create({ data: { medicalRecordNumber: `SDY-PKT-${Date.now()}`, name: "Customer Lain", whatsapp: WA_OTHER } });
    const foreign = await ownPackage(facial3, other.id);
    const second = await visitDraft();
    expect(await apply(second, foreign.itemId)).toEqual({ ok: false, error: "Paket ini milik customer lain." });

    const meso = await ownPackage(await catalogPackage(world, { name: "Meso 2x", items: [{ serviceId: world.slimmingTreatmentId, sessions: 2 }] }));
    expect(await apply(second, meso.itemId)).toEqual({ ok: false, error: `Paket ${meso.name} tidak berisi treatment Facial Uji.` });
    const consult = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: second.id, kind: "LAYANAN" } });
    expect(await applyPackageSession({ invoiceId: second.id, version: await versionOf(second.id), lineId: consult.id, patientPackageItemId: own.itemId })).toEqual({
      ok: false,
      error: "Hanya baris treatment dari katalog yang bisa memakai sesi paket.",
    });
  });

  it("dua draf berebut sesi terakhir: draf kedua tidak bisa menandai; tanda bersamaan ditolak saat final", async () => {
    const own = await ownPackage(await catalogPackage(world, { name: "Facial 1x", items: [{ serviceId: world.treatmentId, sessions: 1 }] }));
    const first = await visitDraft();
    const second = await visitDraft();
    await unwrap(apply(first, own.itemId));
    expect(await apply(second, own.itemId)).toEqual({ ok: false, error: `Sesi Facial Uji di paket ${own.name} tinggal 0. Lepas paket atau kurangi jumlahnya.` });
    // Dua kasir menandai bersamaan: tanda kedua dipaksa langsung di basis data.
    await prisma.invoiceLine.update({ where: { id: second.line.id }, data: { unitPrice: 0, patientPackageItemId: own.itemId } });
    await unwrap(finalize(first.id));
    expect(await finalize(second.id)).toEqual({ ok: false, error: `Sesi Facial Uji di paket ${own.name} tinggal 0. Lepas paket atau kurangi jumlahnya.` });
    expect(await remaining(own.itemId)).toBe(0);
  });

  it("paket kedaluwarsa antara ditandai dan difinalkan: finalisasi ditolak, draf utuh (Review Focus 1)", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    const yesterday = addDaysToDateString(today, -1);
    await prisma.patientPackage.update({ where: { id: own.patientPackageId }, data: { startsOn: day(addDaysToDateString(today, -30)), expiresOn: day(yesterday) } });
    expect(await finalize(draft.id)).toEqual({
      ok: false,
      error: `Paket ${own.name} sudah kedaluwarsa ${dateLabel(yesterday)}. Lepas paket atau minta Admin Keuangan memperpanjang.`,
    });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAF");
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.line.id } })).patientPackageItemId).toBe(own.itemId);
  });

  it("tagihan pembelian dibatalkan sementara draf menandai: pembatalan boleh, finalisasi draf ditolak (Review Focus 2)", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    await unwrap(cancelInvoice({ invoiceId: own.purchaseId, reason: "Salah customer" }));
    expect(await finalize(draft.id)).toEqual({ ok: false, error: `Paket ${own.name} sudah dibatalkan. Lepas paket dari baris Facial Uji.` });
  });

  it("jumlah dinaikkan melebihi sisa setelah ditandai: finalisasi ditolak (Review Focus 3)", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    await unwrap(updateInvoiceLine({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, quantity: 5, unitPrice: 0, priceNote: "" }));
    expect(await finalize(draft.id)).toEqual({ ok: false, error: `Sesi Facial Uji di paket ${own.name} tinggal 3. Lepas paket atau kurangi jumlahnya.` });
  });

  it("membatalkan tagihan pemakaian mengembalikan sesi, walau paket sudah kedaluwarsa", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    await unwrap(finalize(draft.id));
    await prisma.patientPackage.update({ where: { id: own.patientPackageId }, data: { startsOn: day(addDaysToDateString(today, -30)), expiresOn: day(addDaysToDateString(today, -1)) } });
    await unwrap(cancelInvoice({ invoiceId: draft.id, reason: "Salah input" }));
    expect(await remaining(own.itemId)).toBe(3);
    expect((await prisma.packageSessionEntry.findMany({ where: { invoiceLineId: draft.line.id }, orderBy: { createdAt: "asc" } })).map((e) => [e.kind, e.delta])).toEqual([
      ["PAKAI", -1],
      ["BATAL_PAKAI", 1],
    ]);
  });

  it("opsi paket di layar: sisa dikurangi baris draf yang sudah menandai", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    const option = (await listPackageOptions(world.patientId)).find((o) => o.patientPackageItemId === own.itemId);
    expect(option).toMatchObject({ packageName: own.name, serviceId: world.treatmentId, serviceName: "Facial Uji", sessions: 3, remaining: 2, startsOn: today });
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/package-session.test.ts`
Expected: FAIL (`applyPackageSession` dan `@/server/patient-package-read` tidak ada).

- [ ] **Step 3: Pembantu buku sesi** — di `src/server/package-store.ts`, impor `sessionNote` dari `@/lib/treatment-package`, lalu tambahkan:

```ts
/**
 * Finalisasi tagihan pemakaian (spec paket 6): paket dikunci, lalu setiap baris sesi dicek (milik customer ini,
 * aktif, belum kedaluwarsa, sisa cukup) dan dicatat PAKAI. Gagal satu, seluruh finalisasi batal.
 */
export async function consumePackageSessions(
  tx: Db,
  invoice: { patientId: string; lines: readonly { id: string; name: string; quantity: number; patientPackageItemId: string | null }[] },
  actor: Actor,
  today: string,
): Promise<void> {
  const uses = invoice.lines.filter((line) => line.patientPackageItemId);
  if (uses.length === 0) return;
  const itemIds = uses.map((line) => line.patientPackageItemId!);
  const owners = await tx.patientPackageItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, serviceName: true, patientPackageId: true } });
  await lockPatientPackages(tx, owners.map((item) => item.patientPackageId));
  const packages = await tx.patientPackage.findMany({
    where: { id: { in: owners.map((item) => item.patientPackageId) } },
    select: { id: true, name: true, patientId: true, status: true, expiresOn: true },
  });
  const remaining = await remainingByItem(tx, itemIds);
  for (const line of uses) {
    const item = owners.find((row) => row.id === line.patientPackageItemId);
    const pkg = item ? packages.find((row) => row.id === item.patientPackageId) : undefined;
    if (!item || !pkg) throw new UserFacingError(`Paket untuk baris ${line.name} tidak ditemukan. Lepas paket lalu coba lagi.`);
    if (pkg.patientId !== invoice.patientId) throw new UserFacingError("Paket ini milik customer lain.");
    if (pkg.status !== "AKTIF") throw new UserFacingError(`Paket ${pkg.name} sudah dibatalkan. Lepas paket dari baris ${line.name}.`);
    const expires = dateOnlyString(pkg.expiresOn);
    if (expires < today) throw new UserFacingError(`Paket ${pkg.name} sudah kedaluwarsa ${dateLabel(expires)}. Lepas paket atau minta Admin Keuangan memperpanjang.`);
    const left = remaining.get(item.id) ?? 0;
    if (left < line.quantity) throw new UserFacingError(`Sesi ${item.serviceName} di paket ${pkg.name} tinggal ${left}. Lepas paket atau kurangi jumlahnya.`);
    remaining.set(item.id, left - line.quantity);
    await tx.packageSessionEntry.create({
      data: { patientPackageItemId: item.id, kind: "PAKAI", delta: -line.quantity, invoiceLineId: line.id, staffId: actor.staffId, staffName: actor.name },
    });
  }
}

/** Tagihan pemakaian dibatalkan: setiap PAKAI dikembalikan lewat BATAL_PAKAI, walau paketnya sudah kedaluwarsa (spec paket 7). */
export async function restoreUsedSessions(tx: Db, invoiceId: string, actor: Actor): Promise<void> {
  const used = await tx.packageSessionEntry.findMany({
    where: { kind: "PAKAI", invoiceLine: { invoiceId } },
    select: { patientPackageItemId: true, delta: true, invoiceLineId: true, item: { select: { patientPackageId: true } } },
  });
  if (used.length === 0) return;
  await lockPatientPackages(tx, used.map((entry) => entry.item.patientPackageId));
  await tx.packageSessionEntry.createMany({
    data: used.map((entry) => ({
      patientPackageItemId: entry.patientPackageItemId,
      kind: "BATAL_PAKAI" as const,
      delta: -entry.delta,
      invoiceLineId: entry.invoiceLineId,
      staffId: actor.staffId,
      staffName: actor.name,
    })),
  });
}
```

Di `packageLineNotes`, sebelum `return notes;`:

```ts
  // Baris sesi: "Sesi paket {nama} · sisa n dari m", sisa sesudah semua draf yang menandai item itu (rencana paket keputusan 10).
  const useLines = lines.filter((line) => line.patientPackageItemId);
  if (useLines.length > 0) {
    const ids = [...new Set(useLines.map((line) => line.patientPackageItemId!))];
    const [items, sums, pending] = await Promise.all([
      db.patientPackageItem.findMany({ where: { id: { in: ids } }, select: { id: true, sessions: true, patientPackage: { select: { name: true } } } }),
      db.packageSessionEntry.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids } }, _sum: { delta: true } }),
      db.invoiceLine.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids }, invoice: { status: "DRAF" } }, _sum: { quantity: true } }),
    ]);
    for (const line of useLines) {
      const item = items.find((row) => row.id === line.patientPackageItemId);
      if (!item) continue;
      const left = (sums.find((row) => row.patientPackageItemId === item.id)?._sum.delta ?? 0) - (pending.find((row) => row.patientPackageItemId === item.id)?._sum.quantity ?? 0);
      notes.set(line.id, sessionNote({ packageName: item.patientPackage.name, remaining: Math.max(0, left), sessions: item.sessions }));
    }
  }
```

- [ ] **Step 4: Opsi paket untuk layar** — `src/server/patient-package-read.ts`:

```ts
import { prisma } from "@/lib/db";
import { dateOnlyString } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import type { PackageOption } from "@/lib/treatment-package";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

const day = (value: string) => new Date(`${value}T00:00:00Z`);

/** Item paket aktif dan belum kedaluwarsa milik customer, dengan sisa sesudah semua draf yang menandainya (rencana paket keputusan 10). */
export async function listPackageOptions(patientId: string): Promise<PackageOption[]> {
  await requireCapability("invoice:read");
  const today = witaDateString(new Date());
  const items = await prisma.patientPackageItem.findMany({
    where: { patientPackage: { patientId: String(patientId ?? ""), status: "AKTIF", expiresOn: { gte: day(today) } } },
    orderBy: [{ patientPackage: { expiresOn: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, serviceId: true, serviceName: true, sessions: true, patientPackage: { select: { id: true, name: true, startsOn: true, expiresOn: true } } },
  });
  if (items.length === 0) return [];
  const ids = items.map((item) => item.id);
  const [sums, pending] = await Promise.all([
    prisma.packageSessionEntry.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids } }, _sum: { delta: true } }),
    prisma.invoiceLine.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: ids }, invoice: { status: "DRAF" } }, _sum: { quantity: true } }),
  ]);
  return items
    .map((item) => ({
      patientPackageItemId: item.id,
      patientPackageId: item.patientPackage.id,
      packageName: item.patientPackage.name,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      sessions: item.sessions,
      remaining:
        (sums.find((row) => row.patientPackageItemId === item.id)?._sum.delta ?? 0) - (pending.find((row) => row.patientPackageItemId === item.id)?._sum.quantity ?? 0),
      startsOn: dateOnlyString(item.patientPackage.startsOn),
      expiresOn: dateOnlyString(item.patientPackage.expiresOn),
    }))
    .filter((option) => option.remaining > 0);
}
```

- [ ] **Step 5: Aksi draf** — `src/server/invoice-drafts.ts`:

Impor `dateLabel, dateOnlyString` dari `@/lib/stock` dan `remainingByItem` dari `@/server/package-store`. Konstanta baru:

```ts
const NOT_PACKAGE_LINE = "Hanya baris treatment dari katalog yang bisa memakai sesi paket.";
const PACKAGE_PRICE = "Baris sesi paket selalu Rp 0. Klik Lepas paket untuk menagih harga biasa.";
const PACKAGE_DISCOUNT = "Baris sesi paket tidak bisa diberi diskon.";
```

Aksi baru (setelah `addPackageLine`):

```ts
/**
 * Tandai baris treatment sebagai sesi paket customer (spec paket 6): Rp 0 tanpa diskon. Sisa dicek perkiraan di sini
 * (dikurangi draf lain); yang mengikat adalah pengecekan saat finalisasi.
 */
export async function applyPackageSession(input: { invoiceId: string; version: number; lineId: string; patientPackageItemId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { patientId: true } });
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input.lineId ?? ""), invoiceId },
        select: { id: true, name: true, kind: true, quantity: true, serviceId: true, dispensingLineId: true },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (line.kind !== "TREATMENT" || !line.serviceId || line.dispensingLineId) throw new UserFacingError(NOT_PACKAGE_LINE);
      const item = await tx.patientPackageItem.findUnique({
        where: { id: String(input.patientPackageItemId ?? "") },
        select: { id: true, serviceId: true, patientPackage: { select: { name: true, patientId: true, status: true, expiresOn: true } } },
      });
      if (!item) throw new UserFacingError("Paket tidak ditemukan.");
      const pkg = item.patientPackage;
      if (pkg.patientId !== invoice.patientId) throw new UserFacingError("Paket ini milik customer lain.");
      if (pkg.status !== "AKTIF") throw new UserFacingError(`Paket ${pkg.name} sudah dibatalkan.`);
      const expires = dateOnlyString(pkg.expiresOn);
      if (expires < witaDateString(new Date())) {
        throw new UserFacingError(`Paket ${pkg.name} sudah kedaluwarsa ${dateLabel(expires)}. Lepas paket atau minta Admin Keuangan memperpanjang.`);
      }
      if (item.serviceId !== line.serviceId) throw new UserFacingError(`Paket ${pkg.name} tidak berisi treatment ${line.name}.`);
      const left = (await remainingByItem(tx, [item.id])).get(item.id) ?? 0;
      const pending = await tx.invoiceLine.aggregate({ where: { patientPackageItemId: item.id, id: { not: line.id }, invoice: { status: "DRAF" } }, _sum: { quantity: true } });
      const available = left - (pending._sum.quantity ?? 0);
      if (available < line.quantity) {
        throw new UserFacingError(`Sesi ${line.name} di paket ${pkg.name} tinggal ${Math.max(0, available)}. Lepas paket atau kurangi jumlahnya.`);
      }
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.update({ where: { id: line.id }, data: { unitPrice: 0, priceNote: null, ...NO_DISCOUNT, patientPackageItemId: item.id } });
      });
      return { version, summary: `Pakai sesi paket ${pkg.name} untuk ${line.name}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Lepas paket dari baris (rencana paket keputusan 8): harga kembali ke harga katalog layanan. */
export async function releasePackageSession(input: { invoiceId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({ where: { id: String(input.lineId ?? ""), invoiceId }, select: { id: true, name: true, serviceId: true, patientPackageItemId: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (!line.patientPackageItemId) throw new UserFacingError("Baris ini tidak memakai sesi paket.");
      const price = line.serviceId ? ((await tx.service.findUnique({ where: { id: line.serviceId }, select: { promoPrice: true } }))?.promoPrice ?? 0) : 0;
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.update({ where: { id: line.id }, data: { unitPrice: price, priceNote: null, patientPackageItemId: null } });
      });
      return { version, summary: `Lepas paket dari ${line.name}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}
```

Penjaga di aksi yang ada:
- **`updateInvoiceLine`:** tambahkan `patientPackageItemId: true` ke `select`. Tepat setelah pengecekan `PACKAGE_QUANTITY`, tambahkan `if (line.patientPackageItemId && input.unitPrice !== 0) throw new UserFacingError(PACKAGE_PRICE);`.
- **`setLineDiscount`:** `select` baris mendapat `patientPackageItemId: true`. Tepat setelah `if (!line) …`, tambahkan `if (line.patientPackageItemId) throw new UserFacingError(PACKAGE_DISCOUNT);`.
- **`refreshCatalogPrices`:** `where` menjadi `{ invoiceId, patientPackageItemId: null, OR: [...] }`.

- [ ] **Step 6: Siklus tagihan** — `src/server/invoice-lifecycle.ts`:

Impor `consumePackageSessions, restoreUsedSessions` dari `@/server/package-store`.
- **`finalizeInvoice`:** `select` baris mendapat `patientPackageItemId: true`. Tepat sebelum panggilan `activatePurchasedPackages`, tambahkan `await consumePackageSessions(tx, { patientId: invoice.patientId, lines: invoice.lines }, actor, today);`.
- **`cancelInvoice`:** ganti baris dari Task 6 dengan:

```ts
      if (invoice.status === "FINAL") {
        // Pemakaian dikembalikan dulu, lalu paket yang dibeli di tagihan ini dibatalkan (spec paket 7).
        await restoreUsedSessions(tx, invoiceId, actor);
        await cancelPurchasedPackages(tx, invoiceId, actor);
      }
```

- [ ] **Step 7: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/package-session.test.ts tests/integration/package-purchase.test.ts tests/integration/package-sale.test.ts tests/integration/invoice-line-discount.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/invoice-draft.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 8: Commit**

```bash
git add src/server/package-store.ts src/server/invoice-drafts.ts src/server/invoice-lifecycle.ts src/server/patient-package-read.ts tests/integration/package-session.test.ts
git commit -m "feat: use and release package sessions on visit invoices"
```

---

### Task 8: Memakai sesi paket — layar editor draf

**Files:**
- Modify: `src/lib/treatment-package.ts` (`packageOptionsSummary`)
- Create: `src/components/admin/billing/package-session-button.tsx`
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`, `src/app/(admin)/admin/tagihan/[id]/page.tsx`
- Test: `tests/unit/treatment-package.test.ts`, `tests/unit/components/package-session-button.test.tsx`, `tests/unit/invoice-draft-editor.test.tsx`

**Interfaces:**
- Consumes: Task 7 `applyPackageSession`, `releasePackageSession`, `listPackageOptions`; Task 2 `packageOptionsFor`, `PackageOption`; Task 5 `InvoiceLineRow.packageUse`.
- Produces:
  - `packageOptionsSummary(options: readonly PackageOption[]): string[]`, satu teks per paket, misalnya "Facial Glow 5x (sisa 3 Relaxing Facial; berlaku s.d. 12 Apr 2027)";
  - `PackageSessionButton({ invoiceId, version, line, options, disabled })`;
  - `InvoiceDraftEditor` prop `packageOptions?: PackageOption[]` (bawaan `[]`).

- [ ] **Step 1: Uji yang gagal**

Tambahkan di `tests/unit/treatment-package.test.ts` (impor `packageOptionsSummary`):

```ts
describe("packageOptionsSummary", () => {
  it("satu teks per paket, treatment digabung, kedaluwarsa tertulis", () => {
    const base = { patientPackageId: "p1", packageName: "Paket Glowing", sessions: 3, startsOn: "2026-10-01", expiresOn: "2027-04-12" };
    expect(
      packageOptionsSummary([
        { ...base, patientPackageItemId: "i1", serviceId: "s1", serviceName: "Facial", remaining: 2 },
        { ...base, patientPackageItemId: "i2", serviceId: "s2", serviceName: "Peeling", remaining: 1 },
        { ...base, patientPackageId: "p2", packageName: "Meso 2x", patientPackageItemId: "i3", serviceId: "s3", serviceName: "Meso", remaining: 2, expiresOn: "2026-12-31" },
      ]),
    ).toEqual(["Paket Glowing (sisa 2 Facial, 1 Peeling; berlaku s.d. 12 Apr 2027)", "Meso 2x (sisa 2 Meso; berlaku s.d. 31 Des 2026)"]);
  });
});
```

`tests/unit/components/package-session-button.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackageSessionButton } from "@/components/admin/billing/package-session-button";
import type { PackageOption } from "@/lib/treatment-package";
import { applyPackageSession, releasePackageSession } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ applyPackageSession: vi.fn(), releasePackageSession: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const line = { id: "l1", name: "Relaxing Facial", kind: "TREATMENT" as const, serviceId: "s1", quantity: 1, fromDispensing: false, packageUse: null };
const option = (patch: Partial<PackageOption>): PackageOption => ({
  patientPackageItemId: "i1",
  patientPackageId: "p1",
  packageName: "Facial 5x",
  serviceId: "s1",
  serviceName: "Relaxing Facial",
  sessions: 5,
  remaining: 3,
  startsOn: "2026-10-01",
  expiresOn: "2027-03-30",
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("PackageSessionButton", () => {
  it("satu paket cocok: langsung memakai paket itu", async () => {
    vi.mocked(applyPackageSession).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    renderAdmin(<PackageSessionButton invoiceId="inv" version={2} line={line} options={[option({}), option({ patientPackageItemId: "x", serviceId: "s9" })]} />);
    await user.click(screen.getByRole("button", { name: "Pakai sesi paket Relaxing Facial" }));
    await waitFor(() => expect(applyPackageSession).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", patientPackageItemId: "i1" }));
  });

  it("lebih dari satu paket: memilih di dialog, kedaluwarsa terdekat terpilih lebih dulu", async () => {
    vi.mocked(applyPackageSession).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const options = [option({ patientPackageItemId: "late", packageName: "Lama", expiresOn: "2027-06-01" }), option({ patientPackageItemId: "soon", packageName: "Segera", expiresOn: "2026-11-01" })];
    renderAdmin(<PackageSessionButton invoiceId="inv" version={2} line={line} options={options} />);
    await user.click(screen.getByRole("button", { name: "Pakai sesi paket Relaxing Facial" }));
    const dialog = await screen.findByRole("dialog", { name: "Pilih paket untuk Relaxing Facial" });
    expect(within(dialog).getByLabelText("Paket")).toHaveValue("soon");
    await user.selectOptions(within(dialog).getByLabelText("Paket"), "late");
    await user.click(within(dialog).getByRole("button", { name: "Pakai" }));
    await waitFor(() => expect(applyPackageSession).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", patientPackageItemId: "late" }));
  });

  it("baris yang memakai paket menawarkan Lepas paket; baris tanpa paket cocok tidak menampilkan tombol", async () => {
    vi.mocked(releasePackageSession).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const { unmount } = renderAdmin(
      <PackageSessionButton invoiceId="inv" version={2} line={{ ...line, packageUse: { patientPackageItemId: "i1", packageName: "Facial 5x" } }} options={[]} />,
    );
    await user.click(screen.getByRole("button", { name: "Lepas paket Relaxing Facial" }));
    await waitFor(() => expect(releasePackageSession).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1" }));
    unmount();
    renderAdmin(<PackageSessionButton invoiceId="inv" version={2} line={{ ...line, kind: "LAYANAN" }} options={[option({})]} />);
    expect(screen.queryByRole("button", { name: /sesi paket/ })).not.toBeInTheDocument();
  });
});
```

Di `tests/unit/invoice-draft-editor.test.tsx`: tambahkan `applyPackageSession: vi.fn(), releasePackageSession: vi.fn()` ke mock `@/server/invoice-drafts`, lalu uji ini:

```tsx
  it("customer berpaket: kotak info; baris sesi tampil Rp 0 tanpa tombol diskon", () => {
    const withPackage = detail();
    withPackage.lines[0] = {
      ...withPackage.lines[0],
      kind: "TREATMENT",
      unitPrice: 0,
      gross: 0,
      amount: 0,
      packageUse: { patientPackageItemId: "i1", packageName: "Facial 5x" },
      packageNote: "Sesi paket Facial 5x · sisa 2 dari 5",
    };
    const options = [
      { patientPackageItemId: "i1", patientPackageId: "p1", packageName: "Facial 5x", serviceId: "s1", serviceName: "Konsultasi Gizi", sessions: 5, remaining: 2, startsOn: "2026-10-01", expiresOn: "2027-03-30" },
    ];
    renderAdmin(<InvoiceDraftEditor detail={withPackage} items={items} canExceedDiscount={false} packageOptions={options} />);
    expect(screen.getByRole("alert", { name: "Paket customer" })).toHaveTextContent("Customer punya paket aktif: Facial 5x (sisa 2 Konsultasi Gizi; berlaku s.d. 30 Mar 2027).");
    expect(screen.getByText("Sesi paket Facial 5x · sisa 2 dari 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Lepas paket ${withPackage.lines[0].name}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Diskon ${withPackage.lines[0].name}` })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`Harga ${withPackage.lines[0].name}`)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/treatment-package.test.ts tests/unit/components/package-session-button.test.tsx tests/unit/invoice-draft-editor.test.tsx`
Expected: FAIL (`packageOptionsSummary` dan komponen belum ada; uji editor gagal).

- [ ] **Step 3: Implementasi**

`src/lib/treatment-package.ts`:

```ts
/** Kotak info editor draf (spec paket 6): satu teks per paket, urutan seperti `options`. */
export function packageOptionsSummary(options: readonly PackageOption[]): string[] {
  const groups = new Map<string, PackageOption[]>();
  for (const option of options) groups.set(option.patientPackageId, [...(groups.get(option.patientPackageId) ?? []), option]);
  return [...groups.values()].map((items) => {
    const sessions = items.map((item) => `${item.remaining} ${item.serviceName}`).join(", ");
    return `${items[0].packageName} (sisa ${sessions}; berlaku s.d. ${dateLabel(items[0].expiresOn)})`;
  });
}
```

`src/components/admin/billing/package-session-button.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { dateLabel } from "@/lib/stock";
import { packageOptionsFor, type PackageOption } from "@/lib/treatment-package";
import { applyPackageSession, releasePackageSession } from "@/server/invoice-drafts";
import type { InvoiceLineRow } from "@/server/invoice-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

type LineView = Pick<InvoiceLineRow, "id" | "name" | "kind" | "serviceId" | "quantity" | "fromDispensing" | "packageUse">;

/** "Pakai sesi paket" / "Lepas paket" untuk satu baris treatment draf (spec paket 6). */
export function PackageSessionButton({
  invoiceId,
  version,
  line,
  options,
  disabled = false,
}: {
  invoiceId: string;
  version: number;
  line: LineView;
  options: readonly PackageOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const candidates = line.kind === "TREATMENT" && line.serviceId && !line.fromDispensing ? packageOptionsFor(options, line.serviceId, line.quantity) : [];

  function call(action: () => Promise<ActionResult<{ version: number }>>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success(success);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }
  const apply = (patientPackageItemId: string) =>
    call(() => applyPackageSession({ invoiceId, version, lineId: line.id, patientPackageItemId }), "Sesi paket dipakai.");

  if (line.packageUse) {
    return (
      <Button
        type="button"
        size="small"
        variant="text"
        disabled={disabled || pending}
        aria-label={`Lepas paket ${line.name}`}
        onClick={() => call(() => releasePackageSession({ invoiceId, version, lineId: line.id }), "Paket dilepas.")}
      >
        Lepas paket
      </Button>
    );
  }
  if (candidates.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        size="small"
        variant="outlined"
        disabled={disabled || pending}
        aria-label={`Pakai sesi paket ${line.name}`}
        onClick={() => {
          if (candidates.length === 1) return apply(candidates[0].patientPackageItemId);
          setChoice(candidates[0].patientPackageItemId);
          setError(null);
          setOpen(true);
        }}
      >
        Pakai sesi paket
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Pilih paket untuk {line.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <SelectField id={`package-choice-${line.id}`} label="Paket" value={choice} onChange={setChoice}>
              {candidates.map((option) => (
                <option key={option.patientPackageItemId} value={option.patientPackageItemId}>
                  {option.packageName} · sisa {option.remaining} · berlaku s.d. {dateLabel(option.expiresOn)}
                </option>
              ))}
            </SelectField>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending || !choice} onClick={() => apply(choice)}>
            Pakai
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`src/components/admin/billing/invoice-draft-editor.tsx`:
- **Impor:** `PackageSessionButton`, `packageOptionsSummary` dan `type PackageOption` (dari `@/lib/treatment-package`).
- **Prop editor:** `InvoiceDraftEditor` mendapat prop `packageOptions = []` (`packageOptions?: PackageOption[]`) dan meneruskannya ke `LineRow` sebagai `options={packageOptions}`. `LineRow` menerima `options: readonly PackageOption[]`.
- **Kotak info:** di bawah blok `notice` penyerahan:

```tsx
      {packageOptions.length > 0 && (
        <Alert severity="info" aria-label="Paket customer">
          Customer punya paket aktif: {packageOptionsSummary(packageOptions).join("; ")}.
        </Alert>
      )}
```

- **Kolom harga di `LineRow`:** `{line.packageUse ? formatRupiah(0) : <RupiahInput … />}`.
- **Tombol di kolom aksi `LineRow`:** `<PackageSessionButton invoiceId={detail.id} version={detail.version} line={line} options={options} disabled={disabled} />` sebelum tombol diskon. `<LineDiscountDialog … />` hanya dirender bila `!line.packageUse`.
- **`save()` di `LineRow`:** harga yang dikirim untuk baris sesi selalu 0, yaitu `unitPrice: line.packageUse ? 0 : (unitPrice ?? Number.NaN)`.

`src/app/(admin)/admin/tagihan/[id]/page.tsx`: impor `listPackageOptions` dari `@/server/patient-package-read`, lalu tambahkan `packageOptions={await listPackageOptions(detail.patient.id)}` pada `InvoiceDraftEditor`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/treatment-package.test.ts tests/unit/components/package-session-button.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih. Bila `role="alert"` pada `Alert` info membuat uji lain di berkas yang sama ambigu, beri `role="status"` dan sesuaikan uji di atas, lalu catat sebagai Ruling.

- [ ] **Step 5: Commit**

```bash
git add src/lib/treatment-package.ts src/components/admin/billing/package-session-button.tsx src/components/admin/billing/invoice-draft-editor.tsx "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/unit/treatment-package.test.ts tests/unit/components/package-session-button.test.tsx tests/unit/invoice-draft-editor.test.tsx
git commit -m "feat: package session controls in the draft invoice editor"
```

---

### Task 9: Paket customer — daftar, detail, perpanjangan, tab pasien

**Files:**
- Modify: `src/server/patient-package-read.ts` (`listPatientPackages`, `searchPatientPackages`, `getPatientPackage`)
- Create: `src/server/patient-packages.ts` (`extendPatientPackage`)
- Create: `src/components/admin/package/patient-package-table.tsx`, `src/components/admin/package/extend-package-dialog.tsx`
- Modify: `src/app/(admin)/admin/paket/page.tsx` (tab "Paket customer", hak `invoice:read`)
- Create: `src/app/(admin)/admin/paket/[id]/page.tsx`
- Modify: `src/components/admin/patient-detail-view.tsx`, `src/app/(admin)/admin/pasien/[id]/page.tsx` (tab "Paket")
- Modify: `src/components/admin/app-sidebar.tsx` (menu "Paket": `needs: "invoice:read"`)
- Test: `tests/integration/patient-packages.test.ts`, `tests/unit/components/patient-package-table.test.tsx`, `tests/unit/components/extend-package-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 2 `packageState`, `validateExtension`, `PACKAGE_STATE_LABEL`, `PACKAGE_ENTRY_LABEL`; Task 6 `lockPatientPackages`.
- Produces:
  - `type PatientPackageSummary = { id; name; startsOn: string; expiresOn: string; state: PatientPackageState; items: { serviceName; sessions; remaining }[]; purchaseInvoice: { id: string; number: string | null }; patient: { id; name; medicalRecordNumber } }`;
  - `listPatientPackages(patientId)`, `searchPatientPackages(q?: string)`;
  - `type PatientPackageDetail = PatientPackageSummary & { price: number; entries: PackageEntryRow[] }`, dengan `type PackageEntryRow = { id; createdAt: Date; kind: PackageEntryKindValue; delta: number; serviceName: string | null; invoice: { id; number: string | null } | null; staffName; reason: string | null; previousExpiresOn: string | null; newExpiresOn: string | null }`;
  - `getPatientPackage(id): Promise<PatientPackageDetail | null>`;
  - `extendPatientPackage({ packageId, expiresOn, reason }): Promise<ActionResult<void>>` (`invoice:correct`, audit `patient-package.extend`);
  - `PatientPackageTable({ rows, showPatient? })`, `ExtendPackageDialog({ packageId, expiresOn })`.

- [ ] **Step 1: Uji integrasi yang gagal** — `tests/integration/patient-packages.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { getPatientPackage, listPatientPackages, searchPatientPackages } from "@/server/patient-package-read";
import { extendPatientPackage } from "@/server/patient-packages";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Paket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "paket-customer";
const WA = "6281200009607";
let world: BillingWorld;
let patientPackageId: string;
let usageNumber: string;
const today = witaDateString(new Date());
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  actor.role = "RESEPSIONIS";
  const packageId = await catalogPackage(world, { name: "Facial 3x", validDays: 90 });
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
  await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
  const owned = await prisma.patientPackage.findFirstOrThrow({ where: { purchaseLine: { invoiceId: id } }, select: { id: true, items: { select: { id: true } } } });
  patientPackageId = owned.id;
  const { appointmentId } = await finalVisit(world);
  const visit = await unwrap(createInvoiceFromVisit(appointmentId));
  const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: visit.id, kind: "TREATMENT" } });
  await unwrap(applyPackageSession({ invoiceId: visit.id, version: await versionOf(visit.id), lineId: line.id, patientPackageItemId: owned.items[0].id }));
  usageNumber = (await unwrap(finalizeInvoice({ invoiceId: visit.id, version: await versionOf(visit.id) }))).number;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("paket customer", () => {
  it("daftar per pasien dan pencarian: sisa per treatment, status, tagihan pembelian", async () => {
    const [row] = await listPatientPackages(world.patientId);
    expect(row).toMatchObject({ id: patientPackageId, name: `${SLUG} Facial 3x`, state: "AKTIF", startsOn: today, items: [{ serviceName: "Facial Uji", sessions: 3, remaining: 2 }] });
    expect(row.purchaseInvoice.number).toMatch(/^TG-\d{4}-\d{4}$/);
    expect((await searchPatientPackages(`${SLUG} facial`)).map((r) => r.id)).toContain(patientPackageId);
    expect((await searchPatientPackages("tidak ada paket begini")).length).toBe(0);
  });

  it("detail: riwayat terbaru di atas dengan tagihan pemakaian", async () => {
    const detail = (await getPatientPackage(patientPackageId))!;
    expect(detail.entries.map((e) => [e.kind, e.delta, e.invoice?.number ?? null])).toEqual([
      ["PAKAI", -1, usageNumber],
      ["BELI", 3, detail.purchaseInvoice.number],
    ]);
    expect(await getPatientPackage("tidak-ada")).toBeNull();
  });

  it("perpanjangan hanya oleh Admin Keuangan: tanggal baru, buku PERPANJANG, audit", async () => {
    const current = (await getPatientPackage(patientPackageId))!.expiresOn;
    const next = addDaysToDateString(current, 30);
    await expect(extendPatientPackage({ packageId: patientPackageId, expiresOn: next, reason: "Customer sakit" })).rejects.toThrow("forbidden: invoice:correct");
    actor.role = "ADMIN_KEUANGAN";
    expect(await extendPatientPackage({ packageId: patientPackageId, expiresOn: current, reason: "x" })).toMatchObject({ ok: false });
    await unwrap(extendPatientPackage({ packageId: patientPackageId, expiresOn: next, reason: "Customer sakit" }));
    const detail = (await getPatientPackage(patientPackageId))!;
    expect(detail.expiresOn).toBe(next);
    expect(detail.entries[0]).toMatchObject({ kind: "PERPANJANG", delta: 0, reason: "Customer sakit", previousExpiresOn: current, newExpiresOn: next, serviceName: null });
    expect(await prisma.auditLog.count({ where: { action: "patient-package.extend", entityId: patientPackageId } })).toBe(1);
  });

  it("paket yang dibatalkan tidak bisa diperpanjang", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await prisma.patientPackage.update({ where: { id: patientPackageId }, data: { status: "DIBATALKAN" } });
    expect(await extendPatientPackage({ packageId: patientPackageId, expiresOn: "2099-01-01", reason: "x" })).toEqual({ ok: false, error: "Paket yang dibatalkan tidak bisa diperpanjang." });
    expect((await listPatientPackages(world.patientId))[0].state).toBe("DIBATALKAN");
    await prisma.patientPackage.update({ where: { id: patientPackageId }, data: { status: "AKTIF" } });
  });
});
```

- [ ] **Step 2: Uji komponen yang gagal**

`tests/unit/components/patient-package-table.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientPackageTable } from "@/components/admin/package/patient-package-table";
import type { PatientPackageSummary } from "@/server/patient-package-read";
import { renderAdmin } from "../helpers/render-admin";

const row: PatientPackageSummary = {
  id: "pp1",
  name: "Paket Glowing",
  startsOn: "2026-10-13",
  expiresOn: "2027-04-10",
  state: "AKTIF",
  items: [
    { serviceName: "Facial", sessions: 3, remaining: 2 },
    { serviceName: "Peeling", sessions: 2, remaining: 2 },
  ],
  purchaseInvoice: { id: "inv1", number: "TG-2026-0042" },
  patient: { id: "p1", name: "Ani Uji", medicalRecordNumber: "SDY-2026-0001" },
};

describe("PatientPackageTable", () => {
  it("menampilkan customer, paket bertaut, sisa per treatment, berlaku, dan status", () => {
    renderAdmin(<PatientPackageTable rows={[row, { ...row, id: "pp2", name: "Paket Lama", state: "KEDALUWARSA" }]} />);
    const table = screen.getByRole("table", { name: "Paket customer" });
    expect(table).toHaveTextContent("Ani Uji");
    expect(table).toHaveTextContent("SDY-2026-0001");
    expect(screen.getByRole("link", { name: "Paket Glowing" })).toHaveAttribute("href", "/admin/paket/pp1");
    expect(table).toHaveTextContent("Facial 2 dari 3");
    expect(table).toHaveTextContent("Peeling 2 dari 2");
    expect(table).toHaveTextContent("10 Apr 2027");
    expect(table).toHaveTextContent("Aktif");
    expect(table).toHaveTextContent("Kedaluwarsa");
  });

  it("tanpa kolom customer di halaman pasien; kosong memberi tahu", () => {
    const { unmount } = renderAdmin(<PatientPackageTable rows={[row]} showPatient={false} />);
    expect(screen.queryByText("Ani Uji")).not.toBeInTheDocument();
    unmount();
    renderAdmin(<PatientPackageTable rows={[]} />);
    expect(screen.getByText("Belum ada paket.")).toBeInTheDocument();
  });
});
```

`tests/unit/components/extend-package-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtendPackageDialog } from "@/components/admin/package/extend-package-dialog";
import { extendPatientPackage } from "@/server/patient-packages";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/patient-packages", () => ({ extendPatientPackage: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

describe("ExtendPackageDialog", () => {
  it("mengirim tanggal baru dan alasan; galat isian tampil tanpa memanggil server", async () => {
    vi.mocked(extendPatientPackage).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ExtendPackageDialog packageId="pp1" expiresOn="2027-04-10" />);
    await user.click(screen.getByRole("button", { name: "Perpanjang" }));
    const dialog = await screen.findByRole("dialog", { name: "Perpanjang paket" });
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Tanggal baru harus setelah 10 Apr 2027.");
    expect(extendPatientPackage).not.toHaveBeenCalled();
    setDateField("Berlaku sampai", "2027-05-10", within(dialog));
    await user.type(within(dialog).getByLabelText("Alasan"), "Customer sakit");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(extendPatientPackage).toHaveBeenCalledWith({ packageId: "pp1", expiresOn: "2027-05-10", reason: "Customer sakit" }));
  });
});
```

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/patient-packages.test.ts` dan `npx vitest run tests/unit/components/patient-package-table.test.tsx tests/unit/components/extend-package-dialog.test.tsx`
Expected: FAIL (fungsi dan modul belum ada).

- [ ] **Step 4: Baca paket customer** — tambahkan di `src/server/patient-package-read.ts`. Impor `Prisma` (tipe) dari `@prisma/client`, serta `packageState`, `type PackageEntryKindValue`, `type PatientPackageState` dari `@/lib/treatment-package`.

```ts
export type PatientPackageSummary = {
  id: string;
  name: string;
  startsOn: string;
  expiresOn: string;
  state: PatientPackageState;
  items: { serviceName: string; sessions: number; remaining: number }[];
  purchaseInvoice: { id: string; number: string | null };
  patient: { id: string; name: string; medicalRecordNumber: string };
};
export type PackageEntryRow = {
  id: string;
  createdAt: Date;
  kind: PackageEntryKindValue;
  delta: number;
  /** Kosong untuk PERPANJANG: perpanjangan berlaku untuk seluruh paket (rencana paket keputusan 4). */
  serviceName: string | null;
  invoice: { id: string; number: string | null } | null;
  staffName: string;
  reason: string | null;
  previousExpiresOn: string | null;
  newExpiresOn: string | null;
};
export type PatientPackageDetail = PatientPackageSummary & { price: number; entries: PackageEntryRow[] };

const SUMMARY_SELECT = {
  id: true,
  name: true,
  price: true,
  startsOn: true,
  expiresOn: true,
  status: true,
  patient: { select: { id: true, name: true, medicalRecordNumber: true } },
  purchaseLine: { select: { invoice: { select: { id: true, number: true } } } },
  items: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceName: true, sessions: true } },
} as const;
type SummaryRow = Prisma.PatientPackageGetPayload<{ select: typeof SUMMARY_SELECT }>;

/** Paket aktif dulu, lalu urutan dari query (terbaru dulu). */
async function summarize(rows: SummaryRow[]): Promise<(PatientPackageSummary & { price: number })[]> {
  const itemIds = rows.flatMap((row) => row.items.map((item) => item.id));
  const sums =
    itemIds.length === 0
      ? []
      : await prisma.packageSessionEntry.groupBy({ by: ["patientPackageItemId"], where: { patientPackageItemId: { in: itemIds } }, _sum: { delta: true } });
  const today = witaDateString(new Date());
  const summaries = rows.map((row) => {
    const items = row.items.map((item) => ({
      serviceName: item.serviceName,
      sessions: item.sessions,
      remaining: sums.find((sum) => sum.patientPackageItemId === item.id)?._sum.delta ?? 0,
    }));
    const expiresOn = dateOnlyString(row.expiresOn);
    return {
      id: row.id,
      name: row.name,
      price: row.price,
      startsOn: dateOnlyString(row.startsOn),
      expiresOn,
      state: packageState({ status: row.status, expiresOn, remaining: items.reduce((sum, item) => sum + item.remaining, 0) }, today),
      items,
      purchaseInvoice: row.purchaseLine.invoice,
      patient: row.patient,
    };
  });
  return summaries.sort((a, b) => Number(b.state === "AKTIF") - Number(a.state === "AKTIF"));
}

export async function listPatientPackages(patientId: string): Promise<PatientPackageSummary[]> {
  await requireCapability("invoice:read");
  const rows = await prisma.patientPackage.findMany({ where: { patientId: String(patientId ?? "") }, orderBy: { createdAt: "desc" }, select: SUMMARY_SELECT });
  return summarize(rows);
}

/** Tab "Paket customer": paling banyak 200, terbaru dulu, cari nama paket, nama customer, atau nomor RM. */
export async function searchPatientPackages(q?: string): Promise<PatientPackageSummary[]> {
  await requireCapability("invoice:read");
  const term = q?.trim();
  const rows = await prisma.patientPackage.findMany({
    where: term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { patient: { name: { contains: term, mode: "insensitive" } } },
            { patient: { medicalRecordNumber: { contains: term, mode: "insensitive" } } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    select: SUMMARY_SELECT,
  });
  return summarize(rows);
}

export async function getPatientPackage(id: string): Promise<PatientPackageDetail | null> {
  await requireCapability("invoice:read");
  const row = await prisma.patientPackage.findUnique({ where: { id: String(id ?? "") }, select: SUMMARY_SELECT });
  if (!row) return null;
  const [summary] = await summarize([row]);
  const entries = await prisma.packageSessionEntry.findMany({
    where: { item: { patientPackageId: row.id } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      createdAt: true,
      kind: true,
      delta: true,
      staffName: true,
      reason: true,
      previousExpiresOn: true,
      newExpiresOn: true,
      item: { select: { serviceName: true } },
      invoiceLine: { select: { invoice: { select: { id: true, number: true } } } },
    },
  });
  return {
    ...summary,
    entries: entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      kind: entry.kind,
      delta: entry.delta,
      serviceName: entry.kind === "PERPANJANG" ? null : entry.item.serviceName,
      invoice: entry.invoiceLine?.invoice ?? null,
      staffName: entry.staffName,
      reason: entry.reason,
      previousExpiresOn: entry.previousExpiresOn ? dateOnlyString(entry.previousExpiresOn) : null,
      newExpiresOn: entry.newExpiresOn ? dateOnlyString(entry.newExpiresOn) : null,
    })),
  };
}
```

Catatan: BELI dan PAKAI satu transaksi bisa punya `createdAt` yang sama dalam milidetik. Urutan kedua (`id`) hanya penengah; uji di atas memakai transaksi yang berbeda.

- [ ] **Step 5: Perpanjangan** — `src/server/patient-packages.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateLabel, dateOnlyString } from "@/lib/stock";
import { validateExtension } from "@/lib/treatment-package";
import { recordAudit } from "@/server/audit";
import { lockPatientPackages } from "@/server/package-store";
import { requireCapability } from "@/server/session";

const day = (value: string) => new Date(`${value}T00:00:00Z`);

/** Perpanjang masa berlaku paket customer (spec paket 7), dengan alasan; tercatat di buku sesi dan audit. */
export async function extendPatientPackage(input: { packageId: string; expiresOn: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:correct");
    const packageId = String(input?.packageId ?? "");
    const summary = await prisma.$transaction(async (tx) => {
      await lockPatientPackages(tx, [packageId]);
      const pkg = await tx.patientPackage.findUnique({
        where: { id: packageId },
        select: { name: true, status: true, expiresOn: true, items: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } } },
      });
      if (!pkg || pkg.items.length === 0) throw new UserFacingError("Paket tidak ditemukan.");
      if (pkg.status === "DIBATALKAN") throw new UserFacingError("Paket yang dibatalkan tidak bisa diperpanjang.");
      const previous = dateOnlyString(pkg.expiresOn);
      const checked = validateExtension(input, { currentExpiresOn: previous });
      if (!checked.ok) throw new UserFacingError(checked.message);
      await tx.packageSessionEntry.create({
        data: {
          patientPackageItemId: pkg.items[0].id,
          kind: "PERPANJANG",
          delta: 0,
          reason: checked.value.reason,
          previousExpiresOn: day(previous),
          newExpiresOn: day(checked.value.expiresOn),
          staffId: actor.staffId,
          staffName: actor.name,
        },
      });
      await tx.patientPackage.update({ where: { id: packageId }, data: { expiresOn: day(checked.value.expiresOn) } });
      return `${pkg.name}: berlaku s.d. ${dateLabel(previous)} → ${dateLabel(checked.value.expiresOn)} (${checked.value.reason})`;
    });
    await recordAudit({ actor, action: "patient-package.extend", entity: "PatientPackage", entityId: packageId, summary });
    safeRevalidatePath("/admin/paket");
    safeRevalidatePath(`/admin/paket/${packageId}`);
  });
}
```

- [ ] **Step 6: Komponen**

`src/components/admin/package/patient-package-table.tsx` (komponen server, tanpa `"use client"`):

```tsx
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { dateLabel } from "@/lib/stock";
import { PACKAGE_STATE_LABEL, type PatientPackageState } from "@/lib/treatment-package";
import type { PatientPackageSummary } from "@/server/patient-package-read";
import { TextLink } from "../mui/links";
import { StatusChip, type StatusTone } from "../mui/status-chip";
import { EmptyState } from "../page-layout";

const TONE: Record<PatientPackageState, StatusTone> = { AKTIF: "success", KEDALUWARSA: "warning", HABIS: "neutral", DIBATALKAN: "error" };

/** Daftar paket customer (spec paket 7): sisa per treatment, berlaku s.d., dan status. */
export function PatientPackageTable({ rows, showPatient = true }: { rows: PatientPackageSummary[]; showPatient?: boolean }) {
  if (rows.length === 0) return <EmptyState>Belum ada paket.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Paket customer">
        <TableHead>
          <TableRow>
            {showPatient && <TableCell>Customer</TableCell>}
            <TableCell>Paket</TableCell>
            <TableCell>Sisa sesi</TableCell>
            <TableCell>Berlaku s.d.</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {showPatient && (
                <TableCell>
                  <Box component="span" sx={{ fontWeight: 500 }}>
                    {row.patient.name}
                  </Box>
                  <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                    {row.patient.medicalRecordNumber}
                  </Typography>
                </TableCell>
              )}
              <TableCell>
                <TextLink href={`/admin/paket/${row.id}`}>{row.name}</TextLink>
              </TableCell>
              <TableCell>
                {row.items.map((item) => (
                  <div key={item.serviceName}>
                    {item.serviceName} {item.remaining} dari {item.sessions}
                  </div>
                ))}
              </TableCell>
              <TableCell>{dateLabel(row.expiresOn)}</TableCell>
              <TableCell>
                <StatusChip label={PACKAGE_STATE_LABEL[row.state]} tone={TONE[row.state]} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

`src/components/admin/package/extend-package-dialog.tsx`:

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
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { validateExtension } from "@/lib/treatment-package";
import { extendPatientPackage } from "@/server/patient-packages";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Perpanjang masa berlaku paket customer, khusus Admin Keuangan (spec paket 7). */
export function ExtendPackageDialog({ packageId, expiresOn }: { packageId: string; expiresOn: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(expiresOn);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setDate(expiresOn);
    setReason("");
    setError(null);
    setOpen(true);
  }

  function save() {
    const input = { packageId, expiresOn: date, reason };
    const checked = validateExtension(input, { currentExpiresOn: expiresOn });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await extendPatientPackage(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Masa berlaku diperpanjang.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" onClick={openDialog}>
        Perpanjang
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Perpanjang paket</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DateField id="extend-date" label="Berlaku sampai" value={date} onChange={setDate} fullWidth />
            <TextField id="extend-reason" label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 7: Halaman**

`src/app/(admin)/admin/paket/page.tsx` (menggantikan versi Task 4):

```tsx
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { PatientPackageTable } from "@/components/admin/package/patient-package-table";
import { TreatmentPackageCatalog } from "@/components/admin/package/treatment-package-catalog";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { resolveTab } from "@/lib/page-tabs";
import { can } from "@/lib/permissions";
import { searchPatientPackages } from "@/server/patient-package-read";
import { requireCapability } from "@/server/session";
import { listPackageServices, listTreatmentPackages } from "@/server/treatment-package-catalog";

export const metadata = { title: "Paket" };

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; cari?: string | string[] }> }) {
  const staff = await requireCapability("invoice:read");
  const params = await searchParams;
  const canCatalog = can(staff.role, "price:manage");
  const tabs = [
    { id: "customer", label: "Paket customer", href: "/admin/paket" },
    ...(canCatalog ? [{ id: "katalog", label: "Katalog paket", href: "/admin/paket?tab=katalog" }] : []),
  ];
  const active = resolveTab(params.tab, tabs.map((tab) => tab.id));
  const q = typeof params.cari === "string" ? params.cari : "";

  return (
    <>
      <AdminHeader title="Paket" />
      <PageBody>
        <PageHeader title="Paket treatment" description="Paket yang dibeli customer dan sisa sesinya, serta katalog paket." />
        <PageTabs label="Bagian paket" active={active} tabs={tabs} />
        {active === "customer" && (
          <>
            <Form action="/admin/paket" aria-label="Cari paket">
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                <TextField
                  name="cari"
                  defaultValue={q}
                  placeholder="Cari customer, nomor RM, atau paket"
                  autoComplete="off"
                  slotProps={{ htmlInput: { "aria-label": "Cari customer, nomor RM, atau paket" } }}
                  sx={{ width: "100%", maxWidth: 320 }}
                />
                <Button type="submit" variant="outlined">
                  Cari
                </Button>
              </Stack>
            </Form>
            <SectionCard title="Paket customer" flush>
              <PatientPackageTable rows={await searchPatientPackages(q)} />
            </SectionCard>
          </>
        )}
        {active === "katalog" && canCatalog && <TreatmentPackageCatalog packages={await listTreatmentPackages()} services={await listPackageServices()} />}
      </PageBody>
    </>
  );
}
```

`src/app/(admin)/admin/paket/[id]/page.tsx`:

```tsx
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { TextLink } from "@/components/admin/mui/links";
import { StatusChip } from "@/components/admin/mui/status-chip";
import { ExtendPackageDialog } from "@/components/admin/package/extend-package-dialog";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { dateLabel } from "@/lib/stock";
import { PACKAGE_ENTRY_LABEL, PACKAGE_STATE_LABEL } from "@/lib/treatment-package";
import { getPatientPackage } from "@/server/patient-package-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Paket customer" };

export default async function PatientPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("invoice:read");
  const pkg = await getPatientPackage((await params).id);
  if (!pkg) notFound();
  const canExtend = can(staff.role, "invoice:correct") && pkg.state !== "DIBATALKAN";

  return (
    <>
      <AdminHeader title="Paket" />
      <PageBody>
        <PageHeader
          title={pkg.name}
          trail={[{ label: "Paket", href: "/admin/paket" }, { label: pkg.patient.name }]}
          description={`${pkg.patient.name} · ${pkg.patient.medicalRecordNumber} · dibeli ${dateLabel(pkg.startsOn)} (${pkg.purchaseInvoice.number ?? "draf"}) · ${formatRupiah(pkg.price)} · berlaku s.d. ${dateLabel(pkg.expiresOn)}`}
          actions={
            <>
              <StatusChip label={PACKAGE_STATE_LABEL[pkg.state]} />
              {canExtend && <ExtendPackageDialog packageId={pkg.id} expiresOn={pkg.expiresOn} />}
            </>
          }
        />
        <SectionCard title="Sisa sesi" flush>
          <TableContainer>
            <Table size="small" aria-label="Sisa sesi">
              <TableHead>
                <TableRow>
                  <TableCell>Treatment</TableCell>
                  <TableCell align="right">Sisa</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pkg.items.map((item) => (
                  <TableRow key={item.serviceName}>
                    <TableCell>{item.serviceName}</TableCell>
                    <TableCell align="right">
                      {item.remaining} dari {item.sessions}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
        <SectionCard title="Riwayat" description="Terbaru di atas." flush>
          {pkg.entries.length === 0 ? (
            <EmptyState>Belum ada riwayat.</EmptyState>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Riwayat paket">
                <TableHead>
                  <TableRow>
                    <TableCell>Tanggal</TableCell>
                    <TableCell>Jenis</TableCell>
                    <TableCell>Treatment</TableCell>
                    <TableCell align="right">Sesi</TableCell>
                    <TableCell>Keterangan</TableCell>
                    <TableCell>Staf</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pkg.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateWithYear(entry.createdAt)}</TableCell>
                      <TableCell>{PACKAGE_ENTRY_LABEL[entry.kind]}</TableCell>
                      <TableCell>{entry.serviceName ?? "—"}</TableCell>
                      <TableCell align="right">{entry.delta > 0 ? `+${entry.delta}` : entry.delta}</TableCell>
                      <TableCell>
                        {entry.invoice && <TextLink href={`/admin/tagihan/${entry.invoice.id}`}>{entry.invoice.number ?? "Draf"}</TextLink>}
                        {entry.kind === "PERPANJANG" && `${dateLabel(entry.previousExpiresOn)} → ${dateLabel(entry.newExpiresOn)} · ${entry.reason}`}
                      </TableCell>
                      <TableCell>{entry.staffName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
```

`src/components/admin/app-sidebar.tsx`: ubah menu "Paket" menjadi `needs: "invoice:read"`.

**Tab "Paket" di detail pasien:**
- `src/components/admin/patient-detail-view.tsx`:
  - impor `PatientPackageTable` dan `type PatientPackageSummary`;
  - prop baru `packages = null` (`packages?: PatientPackageSummary[] | null`);
  - `type PatientTab` mendapat `"paket"`;
  - `tabs` menjadi `[...kunjungan, ...bia, ...(packages ? ["paket" as const] : []), "booking", "isian"]`;
  - di `PageTabs`, setelah entri BIA: `...(packages ? [{ id: "paket", label: `Paket (${packages.length})`, href: href("paket") }] : []),`;
  - isi tab:

```tsx
      {active === "paket" && packages && (
        <SectionCard title="Paket treatment" description="Sisa sesi dan masa berlaku; buka paket untuk riwayat dan perpanjangan." flush>
          <PatientPackageTable rows={packages} showPatient={false} />
        </SectionCard>
      )}
```

- `src/app/(admin)/admin/pasien/[id]/page.tsx`: impor `listPatientPackages`, lalu kirim `packages={can(staff.role, "invoice:read") ? await listPatientPackages(patient.id) : null}` ke `PatientDetailView`.

- [ ] **Step 8: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/patient-packages.test.ts tests/integration/package-session.test.ts && npx vitest run tests/unit/components/patient-package-table.test.tsx tests/unit/components/extend-package-dialog.test.tsx tests/unit/components/treatment-package-catalog.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih. Bila ada uji unit `PatientDetailView` yang menghitung tab, tambahkan prop `packages={null}` pada uji itu bila perlu.

- [ ] **Step 9: Commit**

```bash
git add src/server/patient-package-read.ts src/server/patient-packages.ts src/components/admin/package/patient-package-table.tsx src/components/admin/package/extend-package-dialog.tsx "src/app/(admin)/admin/paket/page.tsx" "src/app/(admin)/admin/paket/[id]/page.tsx" src/components/admin/patient-detail-view.tsx "src/app/(admin)/admin/pasien/[id]/page.tsx" src/components/admin/app-sidebar.tsx tests/integration/patient-packages.test.ts tests/unit/components/patient-package-table.test.tsx tests/unit/components/extend-package-dialog.test.tsx
git commit -m "feat: customer packages list, detail, extension, and patient tab"
```

---

### Task 10: Label Deposit dan keterangan paket di struk

**Files:**
- Modify: `src/lib/invoice.ts` (`INVOICE_STATUS_LABEL.SEBAGIAN`)
- Modify: `src/lib/receipt.ts` (`RECEIPT_STATUS_LABEL.SEBAGIAN`, `ReceiptLine.note`, `ReceiptSource` baris `note`)
- Modify: `src/server/receipt-store.ts` (keterangan paket), `src/lib/receipt-escpos.ts`, `src/components/receipt/receipt-paper.tsx`
- Modify (uji lama): `tests/unit/billing-list.test.tsx`, `tests/unit/receipt-escpos.test.ts`, `tests/unit/components/receipt-paper.test.tsx`, `tests/e2e/tagihan.spec.ts`
- Test: `tests/unit/receipt.test.ts`, `tests/unit/receipt-escpos.test.ts`, `tests/unit/components/receipt-paper.test.tsx`, `tests/integration/package-receipt.test.ts`

**Interfaces:**
- Consumes: Task 5 dan 7 `packageLineNotes`.
- Produces:
  - `INVOICE_STATUS_LABEL.SEBAGIAN = "Deposit"`, `RECEIPT_STATUS_LABEL.SEBAGIAN = "DEPOSIT"`;
  - `ReceiptLine.note?: string | null`;
  - baris `ReceiptSource` mendapat `note?: string | null`;
  - `loadReceiptSource` menjadi async dan setiap barisnya membawa `note`.

- [ ] **Step 1: Uji yang gagal**

**Uji lama (label):**
- `tests/unit/billing-list.test.tsx`: harapan `"Sebagian"` menjadi `"Deposit"`.
- `tests/unit/receipt-escpos.test.ts` dan `tests/unit/components/receipt-paper.test.tsx`: `"DIBAYAR SEBAGIAN"` menjadi `"DEPOSIT"`.
- `tests/e2e/tagihan.spec.ts`: kedua `page.getByText("Sebagian", { exact: true })` menjadi `page.getByText("Deposit", { exact: true })`.
- `tests/e2e/stok-hutang.spec.ts` **tidak** diubah, karena itu status hutang supplier.

Tambahkan di `tests/unit/receipt-escpos.test.ts`:

```ts
  it("keterangan paket dicetak di bawah nama baris", () => {
    const data = buildEscPosReceipt({ ...RECEIPT, lines: [{ ...RECEIPT.lines[0], note: "3× Facial · berlaku s.d. 10 Apr 2027" }] }, 80);
    expect(printedLines(data)).toContain("  3× Facial · berlaku s.d. 10 Apr 2027");
  });
```

Tambahkan di `tests/unit/components/receipt-paper.test.tsx`:

```tsx
  it("keterangan paket tampil di bawah nama baris", () => {
    render(<ReceiptPaper receipt={{ ...RECEIPT, lines: [{ ...RECEIPT.lines[0], note: "Sesi paket Facial 5x · sisa 2" }] }} />);
    expect(screen.getByText("Sesi paket Facial 5x · sisa 2")).toBeInTheDocument();
  });
```

Tambahkan di `tests/unit/receipt.test.ts` (pembantu `source()` sudah ada di berkas itu; impor `RECEIPT_STATUS_LABEL` bila belum):

```ts
  it("keterangan baris diteruskan ke struk; status dibayar sebagian = SEBAGIAN berlabel DEPOSIT", () => {
    const base = source();
    const receipt = buildPublicReceipt({ ...base, lines: [{ ...base.lines[0], note: "3× Facial · berlaku s.d. 10 Apr 2027" }] })!;
    expect(receipt.lines[0].note).toBe("3× Facial · berlaku s.d. 10 Apr 2027");
    expect(RECEIPT_STATUS_LABEL.SEBAGIAN).toBe("DEPOSIT");
  });
```

`tests/integration/package-receipt.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { buildPublicReceipt } from "@/lib/receipt";
import { addPackageLine, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { loadReceiptSource } from "@/server/receipt-store";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Struk", role: "RESEPSIONIS" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", () => ({ requireCapability: vi.fn(async () => actor) }));

const SLUG = "struk-paket";
const WA = "6281200009608";
let world: BillingWorld;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("struk dengan baris paket", () => {
  it("baris paket membawa isi dan tanggal berlaku", async () => {
    const packageId = await catalogPackage(world, { name: "Facial 3x", validDays: 90 });
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
    const version = (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    const receipt = buildPublicReceipt((await loadReceiptSource(id))!)!;
    expect(receipt.lines[0].note).toMatch(/^3× Facial Uji · berlaku s\.d\. /);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/receipt.test.ts tests/unit/receipt-escpos.test.ts tests/unit/components/receipt-paper.test.tsx tests/unit/billing-list.test.tsx` dan `npm run test:integration -- tests/integration/package-receipt.test.ts`
Expected: FAIL (label lama; `note` belum ada).

- [ ] **Step 3: Implementasi**

- **`src/lib/invoice.ts`:** `SEBAGIAN: "Deposit",` di `INVOICE_STATUS_LABEL`, dengan komentar `// DP/uang muka (spec paket P2); nilai internal tetap SEBAGIAN.`
- **`src/lib/receipt.ts`:**
  - `SEBAGIAN: "DEPOSIT",` di `RECEIPT_STATUS_LABEL`;
  - `ReceiptLine` mendapat `/** Keterangan paket di bawah nama baris (spec paket 8). */ note?: string | null;`;
  - tipe baris `ReceiptSource.lines` mendapat `note?: string | null`;
  - di `buildPublicReceipt`, objek baris mendapat `note: line.note ?? null`.
- **`src/server/receipt-store.ts`:** `loadReceiptSource` menjadi:

```ts
export async function loadReceiptSource(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      status: true,
      receiptLinkVersion: true,
      finalizedAt: true,
      finalizedByName: true,
      discountKind: true,
      discountValue: true,
      patient: { select: { name: true, whatsapp: true } },
      branch: { select: { name: true, address: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, kind: true, name: true, quantity: true, unitPrice: true, discountAmount: true, discountSource: true, treatmentPackageId: true, patientPackageItemId: true },
      },
      payments: { orderBy: { createdAt: "asc" }, select: { amount: true, method: true, paidAt: true, revokedAt: true } },
    },
  });
  if (!invoice) return null;
  // Keterangan paket hanya nama treatment, sesi, dan tanggal; tanpa data klinis (spec paket 11).
  const notes = await packageLineNotes(prisma, invoice.lines);
  return { ...invoice, lines: invoice.lines.map((line) => ({ ...line, note: notes.get(line.id) ?? null })) };
}
```

  dengan impor `packageLineNotes` dari `@/server/package-store`. Semua pemanggil (`src/server/receipt.ts`, `src/server/receipt-public.ts`) sudah memakai `await`; pastikan begitu.
- **`src/lib/receipt-escpos.ts`:** di loop baris, setelah `lines.push(...wrapText(text(line.name), columns));`, tambahkan `if (line.note) lines.push(...wrapText(text(`  ${line.note}`), columns));`.
- **`src/components/receipt/receipt-paper.tsx`:** setelah `<div>{line.name}</div>`, tambahkan `{line.note && <div className="struk-catatan">{line.note}</div>}`. Bila belum ada kelas `struk-catatan`, tambahkan gaya kecil (ukuran 0.85em) di gaya struk yang sama dengan kelas `struk-daftar`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/receipt.test.ts tests/unit/receipt-escpos.test.ts tests/unit/components/receipt-paper.test.tsx tests/unit/billing-list.test.tsx tests/unit/invoice.test.ts && npm run test:integration -- tests/integration/package-receipt.test.ts tests/integration/receipt.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice.ts src/lib/receipt.ts src/server/receipt-store.ts src/lib/receipt-escpos.ts src/components/receipt/receipt-paper.tsx tests/unit/receipt.test.ts tests/unit/receipt-escpos.test.ts tests/unit/components/receipt-paper.test.tsx tests/unit/billing-list.test.tsx tests/e2e/tagihan.spec.ts tests/integration/package-receipt.test.ts
git commit -m "feat: Deposit label and package notes on receipts"
```

---

### Task 11: Laporan — kolom Paket dan sesi paket terpakai

**Files:**
- Modify: `src/server/report-sql.ts` (`package` di `invoiceAggregates`, fungsi baru `packageSessionsUsed`)
- Modify: `src/lib/report.ts` (`RawReport.package`, `ReportTotals.package`, pendapatan, CSV)
- Modify: `src/server/report-read.ts` (`ProfitReport.packageSessions`, `RawReport` di dua tempat)
- Modify: `src/components/admin/report/report-detail.tsx` (baris "Paket")
- Create: `src/components/admin/report/package-sessions-table.tsx`
- Modify: `src/app/(admin)/admin/laporan/page.tsx`
- Test: `tests/unit/report.test.ts`, `tests/integration/report-package.test.ts`

**Interfaces:**
- Consumes: Task 7 buku PAKAI.
- Produces:
  - `InvoiceAggregate.package: number`, `RawReport.package: number`, `ReportTotals.package: number`;
  - `revenue = service + treatment + goods + package − discount + upfront`;
  - `packageSessionsUsed(start: Date, end: Date, branchId: string | null): Promise<{ name: string; sessions: number }[]>`;
  - `ProfitReport.packageSessions: { name: string; sessions: number }[]`;
  - `PackageSessionsTable({ rows })`.

- [ ] **Step 1: Uji yang gagal**

Di `tests/unit/report.test.ts`: setiap objek `RawReport` di berkas itu mendapat `package: 0`. Lalu tambahkan:

```ts
describe("pendapatan paket", () => {
  it("paket masuk pendapatan dan CSV", () => {
    const raw: RawReport = {
      service: 100_000,
      treatment: 0,
      goods: 0,
      package: 900_000,
      discount: 50_000,
      upfrontFee: 0,
      upfrontOnline: 0,
      cogs: 0,
      outstanding: 0,
      invoiceCount: 2,
      expenses: [],
      customerPaid: 0,
      supplierPaid: 0,
      supplierRefunded: 0,
    };
    const view = summarizeReport(raw);
    expect(view.totals).toMatchObject({ package: 900_000, revenue: 950_000 });
    expect(reportCsvRows({ period: { from: "2026-10-01", to: "2026-10-31" }, branchName: "Semua cabang" }, view)).toContainEqual(["Paket", 900_000]);
  });
});
```

(impor `reportCsvRows`, `summarizeReport`, `type RawReport` bila belum).

`tests/integration/report-package.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getProfitReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Laporan", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "laporan-paket";
const WA = "6281200009609";
let world: BillingWorld;
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("laporan paket", () => {
  it("pendapatan paket dihitung sekali; sesi terpakai tanpa tagihan pemakaian yang dibatalkan (Review Focus 5)", async () => {
    const packageId = await catalogPackage(world, { name: "Facial 3x", price: 600_000 });
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
    const itemId = (await prisma.patientPackageItem.findFirstOrThrow({ where: { patientPackage: { purchaseLine: { invoiceId: id } } } })).id;

    const used: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const { appointmentId } = await finalVisit(world);
      const visit = await unwrap(createInvoiceFromVisit(appointmentId));
      const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: visit.id, kind: "TREATMENT" } });
      await unwrap(applyPackageSession({ invoiceId: visit.id, version: await versionOf(visit.id), lineId: line.id, patientPackageItemId: itemId }));
      await unwrap(finalizeInvoice({ invoiceId: visit.id, version: await versionOf(visit.id) }));
      used.push(visit.id);
    }
    await unwrap(cancelInvoice({ invoiceId: used[1], reason: "Salah input" }));

    const report = await getProfitReport({ period: monthPeriod(witaDateString(new Date()).slice(0, 7)), branchId: world.branchId });
    expect(report.current.totals.package).toBe(600_000);
    expect(report.current.totals.treatment).toBe(0);
    expect(report.packageSessions).toEqual([{ name: "Facial Uji", sessions: 1 }]);
  });
});
```

`report.current.totals.treatment` bernilai 0 karena satu-satunya treatment di cabang uji ini adalah baris sesi Rp 0. Baris layanan konsultasi dari kunjungan masuk `service`.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/report.test.ts` dan `npm run test:integration -- tests/integration/report-package.test.ts`
Expected: FAIL (`package` belum ada).

- [ ] **Step 3: Implementasi**

**`src/server/report-sql.ts`:**
- `InvoiceAggregate` mendapat `package: number;`;
- CTE `lines` mendapat:

```sql
             COALESCE(SUM(l."quantity" * l."unitPrice") FILTER (WHERE l."kind" = 'PAKET'), 0) AS package,
```

- CTE `m` mendapat `COALESCE(lines.package, 0) AS package,`;
- SELECT akhir mendapat `COALESCE(SUM(m.package), 0) AS package,`;
- pemetaan mendapat `package: Number(row.package ?? 0),`;
- perbarui komentar fungsi menjadi "pendapatan = layanan + treatment + barang + paket − diskon";
- fungsi baru:

```ts
/**
 * Sesi paket terpakai per treatment (rencana paket keputusan 5): Σ −delta baris PAKAI yang tagihan pemakaiannya
 * masih FINAL dengan `finalizedAt` di [start, end), menurut cabang tagihan pemakaian.
 */
export async function packageSessionsUsed(start: Date, end: Date, branchId: string | null): Promise<{ name: string; sessions: number }[]> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ name: string; sessions: bigint | number }[]>`
    SELECT ppi."serviceName" AS name, SUM(-e."delta") AS sessions
    FROM "PackageSessionEntry" e
    JOIN "PatientPackageItem" ppi ON ppi."id" = e."patientPackageItemId"
    JOIN "InvoiceLine" l ON l."id" = e."invoiceLineId"
    JOIN "Invoice" i ON i."id" = l."invoiceId"
    WHERE e."kind" = 'PAKAI' AND i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch}
    GROUP BY ppi."serviceName"
    ORDER BY 2 DESC, 1
  `;
  return rows.map((row) => ({ name: row.name, sessions: Number(row.sessions) }));
}
```

**`src/lib/report.ts`:**
- `RawReport` dan `ReportTotals` mendapat `package: number;` setelah `goods`;
- di `summarizeReport`: `const revenue = raw.service + raw.treatment + raw.goods + raw.package - raw.discount + upfront;`, dan `totals` mendapat `package: raw.package,`;
- di `reportCsvRows`, setelah baris "Obat dan produk": `["Paket", totals.package],`.

**`src/server/report-read.ts`:**
- kedua tempat yang membangun `RawReport` mendapat `package: total?.package ?? 0` dan `package: row?.package ?? 0`;
- `ProfitReport` mendapat `packageSessions: { name: string; sessions: number }[]`;
- `getProfitReport` menghitungnya untuk periode berjalan, `const { start, end } = periodInstants(checked.value);` lalu `packageSessionsUsed(start, end, filter.branchId)` (di dalam `Promise.all` yang sama), dan mengembalikannya.

**`src/components/admin/report/report-detail.tsx`:** setelah baris "Obat dan produk": `{ label: "Paket", current: c.package, previous: p.package },`.

**`src/components/admin/report/package-sessions-table.tsx`:**

```tsx
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { EmptyState } from "../page-layout";

/** Sesi paket terpakai per treatment di periode laporan (spec paket 8). */
export function PackageSessionsTable({ rows }: { rows: { name: string; sessions: number }[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada sesi paket terpakai.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Sesi paket terpakai">
        <TableHead>
          <TableRow>
            <TableCell>Treatment</TableCell>
            <TableCell align="right">Sesi</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell>{row.name}</TableCell>
              <TableCell align="right">{row.sessions}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

**`src/app/(admin)/admin/laporan/page.tsx`:** setelah kartu "Arus kas":

```tsx
          <SectionCard title="Sesi paket terpakai" description="Sesi dari paket customer yang dipakai di tagihan final periode ini; pendapatannya sudah dihitung saat paket dijual." flush>
            <PackageSessionsTable rows={report.packageSessions} />
          </SectionCard>
```

Perbaiki semua galat `tsc` dari objek `RawReport`/`ReportTotals`/`InvoiceAggregate` di uji lain (misalnya `tests/integration/report-read.test.ts` dan `tests/unit/report-ui.test.tsx`) dengan menambah `package: 0` atau mengharapkan `package`. Di oracle `report-read.test.ts`, baris berjenis `PAKET` masuk `expected.package`; tambahkan `package: 0` pada `expected`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/report.test.ts tests/unit/report-ui.test.tsx tests/unit/architecture.test.ts && npm run test:integration -- tests/integration/report-package.test.ts tests/integration/report-read.test.ts tests/integration/report-line-discount.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/report-sql.ts src/lib/report.ts src/server/report-read.ts src/components/admin/report/report-detail.tsx src/components/admin/report/package-sessions-table.tsx "src/app/(admin)/admin/laporan/page.tsx" tests/unit/report.test.ts tests/unit/report-ui.test.tsx tests/integration/report-package.test.ts tests/integration/report-read.test.ts
git commit -m "feat: package revenue and sessions used in the profit report"
```

---

### Task 12: E2E paket treatment

**Files:**
- Modify: `tests/e2e/prepare-db.mts` (pasien dengan dua kunjungan final berisi Relaxing Facial, per proyek)
- Create: `tests/e2e/paket.spec.ts`

**Interfaces:**
- Consumes: semua label layar Task 4, 5, 8, 9, dan 10.

- [ ] **Step 1: Data awal** — `tests/e2e/prepare-db.mts`, setelah blok "Penyerahan obat (resep.spec.ts)":

```ts
// Paket treatment (paket.spec.ts): per proyek satu pasien dengan dua kunjungan final hari ini berisi Relaxing Facial,
// pukul 21.00/21.30 (desktop) dan 22.00/22.30 (ponsel), di luar jam buka.
const relaxingFacial = await prisma.service.findUniqueOrThrow({ where: { slug: "relaxing-facial" } });
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-PAKET-${index + 1}`,
      name: `Pasien Paket ${project}`,
      whatsapp: `6281200091${index}01`,
      birthDate: new Date("1993-05-17T00:00:00Z"),
      gender: "P",
    },
  });
  for (const offset of [0, 1]) {
    const startAt = combineWitaDateAndMinutes(today, (21 + index) * 60 + offset * 30);
    const appointment = await prisma.appointment.create({
      data: {
        code: `E2E-PAKET-${index + 1}-${offset + 1}`,
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
    const encounter = await prisma.encounter.create({
      data: {
        appointmentId: appointment.id,
        createdById: visitDoctor.id,
        createdByName: visitDoctor.name,
        treatments: { create: [{ serviceId: relaxingFacial.id, serviceName: relaxingFacial.name, performerId: visitDoctor.id, performerName: visitDoctor.name, sortOrder: 0 }] },
      },
    });
    await prisma.encounter.update({
      where: { id: encounter.id },
      data: { status: "FINAL", assessment: "E2E paket", finalizedAt: new Date(), finalizedById: visitDoctor.id, finalizedByName: visitDoctor.name },
    });
  }
}
```

Bila jam 21.00–22.30 bentrok dengan seed lain untuk dokter yang sama (constraint anti-bentrok), geser ke jam kosong lain di luar jam buka dan catat sebagai Ruling.

- [ ] **Step 2: Spec** — `tests/e2e/paket.spec.ts`:

```ts
import { expect, test, type Locator } from "@playwright/test";
import { E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { isiTanggal, tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";
import { addDaysToDateString, witaDateString } from "../../src/lib/time";

test.setTimeout(240_000);

/** Memilih opsi <select> menurut teks yang dikandungnya (label opsi memuat spasi rupiah). */
async function pilihMemuat(select: Locator, text: string) {
  await select.selectOption((await select.locator("option", { hasText: text }).first().getAttribute("value")) ?? "");
}

test("paket dijual dengan DP, sesinya dipakai di kunjungan berikutnya, lalu diperpanjang Admin Keuangan", async ({ page, browser }, testInfo) => {
  const project = testInfo.project.name === "mobile" ? "mobile" : "desktop";
  const t = `${project === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;
  const packageName = `Paket E2E ${t}`;
  const patientName = `Pasien Paket ${project}`;

  // Admin Keuangan membuat paket katalog.
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/paket?tab=katalog");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Paket" }).click();
  const create = page.getByRole("dialog", { name: "Tambah paket" });
  await create.getByLabel("Nama paket").fill(packageName);
  await create.getByLabel("Harga").fill("400000");
  await create.getByLabel("Masa berlaku (hari)").fill("90");
  await pilihMemuat(create.getByLabel("Treatment 1"), "Relaxing Facial");
  await create.getByLabel("Sesi 1").fill("3");
  await create.getByRole("button", { name: "Simpan" }).click();
  await expect(create).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Katalog paket" })).toContainText(packageName);

  // Resepsionis menjual paket di tagihan kunjungan pertama, lalu mencatat DP.
  const desk = await browser.newContext({ baseURL: E2E_BASE_URL });
  const rp = await desk.newPage();
  await signIn(rp, E2E_RESEPSIONIS);
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: `Buat tagihan ${patientName}` }).first().click();
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await rp.getByRole("button", { name: "+ Paket" }).click();
  const sell = rp.getByRole("dialog", { name: "Jual paket" });
  await pilihMemuat(sell.getByLabel("Paket"), packageName);
  await expect(sell).toContainText("3× Relaxing Facial · berlaku 90 hari");
  await sell.getByRole("button", { name: "Tambah" }).click();
  await expect(sell).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByText("3× Relaxing Facial · berlaku 90 hari")).toBeVisible({ timeout: 30_000 });
  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });
  await rp.getByRole("region", { name: "Pembayaran" }).getByRole("button", { name: "Catat pembayaran" }).click();
  const pay = rp.getByRole("dialog", { name: "Catat pembayaran" });
  await pay.getByLabel("Nominal").fill("100000");
  await pay.getByRole("button", { name: "Simpan" }).click();
  await expect(pay).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByText("Deposit", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Kunjungan kedua memakai sesi paket.
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: `Buat tagihan ${patientName}` }).first().click();
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await expect(rp.getByRole("alert", { name: "Paket customer" })).toContainText(packageName, { timeout: 30_000 });
  await rp.getByRole("button", { name: "Pakai sesi paket Relaxing Facial" }).click();
  await expect(rp.getByText(`Sesi paket ${packageName} · sisa 2 dari 3`)).toBeVisible({ timeout: 30_000 });
  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  // Paket customer: sisa 2 dari 3, riwayat memuat pemakaian.
  await rp.goto(`/admin/paket?cari=${encodeURIComponent(packageName)}`);
  await tungguHidrasi(rp);
  await rp.getByRole("link", { name: packageName }).click();
  await expect(rp.getByRole("table", { name: "Sisa sesi" })).toContainText("2 dari 3", { timeout: 30_000 });
  await expect(rp.getByRole("table", { name: "Riwayat paket" })).toContainText("Pakai");
  await expect(rp.getByRole("button", { name: "Perpanjang" })).toHaveCount(0);
  const packageUrl = rp.url();
  await desk.close();

  // Admin Keuangan memperpanjang.
  await page.goto(packageUrl);
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "Perpanjang" }).click();
  const extend = page.getByRole("dialog", { name: "Perpanjang paket" });
  await isiTanggal(extend, "Berlaku sampai", addDaysToDateString(witaDateString(new Date()), 120));
  await extend.getByLabel("Alasan").fill("Customer sakit");
  await extend.getByRole("button", { name: "Simpan" }).click();
  await expect(extend).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Riwayat paket" })).toContainText("Perpanjang", { timeout: 30_000 });
});
```

Catatan untuk eksekutor:
- **Helper tanggal:** bila `isiTanggal` di folder E2E memakai kontrol yang berbeda untuk `DateField` (lihat spec lain yang mengisi tanggal di dialog), ikuti pola itu dan catat sebagai Ruling.
- **Impor dari `src/`:** bila Playwright tidak bisa mengimpor `src/lib/time` dengan jalur relatif, hitung tanggal dengan `new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10)`.

- [ ] **Step 3: Jalankan E2E**

```bash
npx playwright test tests/e2e/paket.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/struk.spec.ts tests/e2e/resep.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/paket.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/struk.spec.ts tests/e2e/resep.spec.ts --project=mobile --workers=1
```

Expected: PASS. Setelah itu, sebelum suite integrasi penuh, jalankan perintah pembersih basis data uji di Global Constraints.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/prepare-db.mts tests/e2e/paket.spec.ts
git commit -m "test: e2e for selling, using, and extending treatment packages"
```

---

## Self-Review (hasil pemeriksaan penulis rencana)

**Cakupan spec:**

| Bagian spec | Task |
|---|---|
| §3 data | 1 |
| §4 katalog | 2, 3, 4 (keputusan perencana 1: halaman `/admin/paket`) |
| §5 menjual | 5; aktivasi saat final di 6 |
| §6 memakai sesi | 7, 8 |
| §7 pembatalan | 6, 7 |
| §7 perpanjangan dan halaman customer | 9 (keputusan perencana 1, 4) |
| §8 label Deposit dan struk | 10 |
| §8 laporan | 11 (keputusan perencana 5) |
| §9 hak | 3, 5, 7, 9; uji hak di setiap integrasi |
| §10 teknis | `package-store.ts`, kunci, dua migrasi |
| §11 privasi | catatan hanya nama treatment (Task 5, 10); baris sesi dijaga CHECK dan server (Task 1, 7) |
| §12 pengujian | setiap task + Task 12 |
| §13 rilis | migrasi hanya menambah (Task 1) |

**Pindai placeholder:** instruksi bersyarat yang sengaja ada masing-masing memberi tindakan pasti dan kewajiban Ruling:
- keluaran `dateLabel` (Task 2);
- tipe `Db` (Task 5);
- uji menu sidebar (Task 4);
- `role` kotak info (Task 8);
- jam seed, helper tanggal, dan impor tanggal di E2E (Task 12).

**Konsistensi tipe dan nama:**
- `PackageOption` (Task 2) dipakai Task 7, 8;
- `packageLineNotes` (Task 5) diperluas di Task 7 dan dipakai Task 10;
- `lockPatientPackages`/`remainingByItem` (Task 6) dipakai Task 7, 9;
- `applyPackageSession`/`releasePackageSession` (Task 7, keputusan 9) dipakai Task 8, 9, 11, 12;
- `SellablePackage` (Task 3) dipakai Task 5;
- `PatientPackageSummary` (Task 9) dipakai tabel dan detail pasien;
- `InvoiceLineRow.packageUse`/`packageNote`/`treatmentPackageId` (Task 5) dipakai Task 8.

Label layar sama di komponen, uji unit, dan E2E: "+ Paket", "Tambah paket", "Nama paket", "Masa berlaku (hari)", "Treatment 1", "Sesi 1", "Katalog paket", "Jual paket", "Pakai sesi paket {nama}", "Lepas paket {nama}", "Paket customer", "Sisa sesi", "Riwayat paket", "Perpanjang", "Perpanjang paket", "Berlaku sampai", "Deposit".
