# Perbaikan Tagihan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diskon per baris (promo barang otomatis + diskon manual resepsionis dalam batas gabungan 20%), catatan internal tagihan, daftar rekening klinik, rincian pembayaran transfer, dan harga jual/promo barang hanya oleh Admin Keuangan dan Super Admin.

**Architecture:** Kolom diskon di `InvoiceLine`, kolom promo di `StockItem`, tabel `ClinicBankAccount`, kolom transfer di `InvoicePayment` (satu migrasi yang hanya menambah). Semua rumus di `src/lib/invoice.ts` dan `src/lib/stock-promo.ts` (murni); server memakai rumus yang sama, penjaga batas `guardDiscount` dihitung ulang untuk batas gabungan. Hak baru `price:manage`.

**Tech Stack:** Next.js 15, Prisma 7/PostgreSQL, MUI 9, Vitest (unit + integrasi), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-perbaikan-tagihan-design.md` (v1.1, disetujui pemilik 13 Oktober 2026).

## Global Constraints

- **Bahasa:** teks yang dilihat pengguna, pesan galat, nama uji, komentar kode dalam Bahasa Indonesia; nama berkas, fungsi, commit dalam bahasa Inggris.
- **Rumus (spec 4):** jumlah baris = `quantity × unitPrice − discountAmount` (≥ 0); subtotal = Σ jumlah baris; diskon tagihan dihitung dari subtotal (persen dibulatkan ke bawah, nominal ≤ subtotal); total = subtotal − diskon tagihan.
- **Batas resepsionis (T2):** Σ diskon baris `MANUAL` + diskon tagihan ≤ `floor(Σ quantity×unitPrice × 20 / 100)`. Diskon `PROMO` tidak dihitung. `invoice:correct` (Admin Keuangan, Super Admin) boleh lebih.
- **Promo (spec 4):** berlaku bila tanggal WITA hari ini di antara `promoStartsOn` dan `promoEndsOn` inklusif (sisi kosong = tanpa batas). Persen: `floor(gross × persen / 100)`. Nominal: per unit × quantity, ≤ gross. Alasan: `Promo: {nama promo}`.
- **Pesan galat tetap:** "Diskon tidak boleh melebihi harga baris." · "Diskon di atas 20% diberikan oleh Admin Keuangan." · "Isi alasan diskon." · "Harga jual diisi Admin Keuangan." · "Pilih rekening tujuan." · "Rekening tujuan tidak aktif." · "Belum ada rekening klinik. Tambahkan di Pengaturan."
- **Hak:** diskon baris dan catatan `invoice:manage` (catatan juga `invoice:correct`); rekening klinik `content:manage`; harga jual dan promo `price:manage` (baru: `SUPER_ADMIN`, `ADMIN_KEUANGAN`).
- **Privasi:** catatan internal dan data rekening pengirim tidak pernah masuk struk, `/struk`, ESC/POS, pesan WA, atau ringkasan audit.
- **Migrasi hanya menambah** (`20261013120000_perbaikan_tagihan`).
- **Pola kode:** `runAction`/`UserFacingError`, `requireCapability`, `recordAudit`, `touchDraft`, `guardDiscount`, `safeRevalidatePath`; berkas `"use server"` hanya mengekspor fungsi async; panel hanya MUI.
- **Pengujian:** unit `npx vitest run <berkas>`; integrasi `npm run test:integration -- <berkas>` (tidak bersamaan dengan E2E; **sebelum menjalankan integrasi penuh setelah E2E, hapus tagihan sisa E2E di basis data uji** — lihat memori `sundy-struk`); E2E `npx playwright test <berkas> --project=desktop --workers=1` lalu `--project=mobile`. Setelah skema: `npx prisma generate && npm run db:migrate:test`. Uji lama yang gagal: 3 uji `schedule.test.ts`.
- **Commit:** Conventional Commits Inggris, diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Push/merge/deploy hanya atas permintaan pemilik.
- **Branch:** `tagihan-diskon`.

## Keputusan perencana (hal yang spec tidak merinci atau perlu diluruskan)

1. **Laporan pendapatan per jenis tetap kotor**, kolom diskon = diskon item + diskon tagihan. Laporan menghitung pendapatan = layanan + treatment + barang − diskon (`src/lib/report.ts:158`); bila per jenis memakai jumlah setelah diskon *dan* kolom diskon memuat diskon item, diskon item terpotong dua kali. Pendapatan bersih tetap sama dengan maksud spec 9.
2. **Tidak ada pemeriksaan batas tambahan saat finalisasi** (spec 4 menyebutnya): setiap perubahan draf sudah dijaga `guardDiscount`, dan diskon di atas 20% yang disetujui Admin Keuangan sah — memeriksa lagi saat resepsionis memfinalkan akan menolak draf yang sudah disetujui.
3. **`invoiceSubtotal` kini bersih** (Σ jumlah baris setelah diskon item); `invoiceGrossSubtotal` baru untuk Σ kotor. Semua pemakai diskon tagihan (draf, diskon sesudah final, laporan, `guardDiscount`) memang harus memakai subtotal bersih. `validateDiscount` mendapat konteks opsional `grossSubtotal` dan `otherLimited`, sehingga pemanggil lama tetap jalan.
4. **`StockItemInput.sellPrice` tetap ada**; server menolak harga yang berubah dari pemegang `stock:manage` tanpa `price:manage`, dan dialog barang hanya menampilkan isian harga bagi `price:manage`. Uji lama yang mengisi harga jual sebagai Apoteker diubah (E2E Task 12).
5. **Promo nominal per unit, diskon manual nominal untuk seluruh baris** (spec 4 dan 5.2).
6. **Rekening tujuan disalin** sebagai `destinationLabel` = `formatBankAccount` (`{bank} {nomor} a.n. {pemilik}`).

## Review Focus

1. **Mengurangi jumlah barang pada baris berdiskon manual** — diskon dipotong ke harga baris baru, CHECK basis data tidak pernah gagal (Task 5).
2. **Promo + diskon manual + diskon tagihan persen bersamaan** — batas hanya menghitung manual + tagihan, dan diskon tagihan persen dihitung dari subtotal bersih (Task 2, 5).
3. **Pembayaran transfer ke rekening yang baru saja dinonaktifkan** — ditolak dengan pesan jelas; pembayaran lama dengan rekening itu tetap tampil dengan labelnya (Task 9).
4. **Apoteker mengirim harga jual lewat aksi lama** (formulir lama terbuka, atau permintaan buatan) — ditolak, harga tidak berubah (Task 4).
5. **Laporan bulan berjalan dengan tagihan berdiskon item** — pendapatan bersih = Σ total tagihan; tidak ada diskon terhitung dua kali (Task 6).

---

### Task 1: Skema dan migrasi

**Files:**
- Modify: `prisma/schema.prisma` (`InvoiceLine`, `InvoicePayment`, `StockItem`; model baru `ClinicBankAccount`; enum `LineDiscountSource`)
- Create: `prisma/migrations/20261013120000_perbaikan_tagihan/migration.sql`
- Modify: `tests/unit/migrations.test.ts`
- Test: `tests/integration/perbaikan-tagihan-schema.test.ts`

**Interfaces:**
- Produces: kolom `InvoiceLine.discountAmount/discountReason/discountSource`, `StockItem.promoName/promoKind/promoValue/promoStartsOn/promoEndsOn`, `InvoicePayment.clinicBankAccountId/destinationLabel/senderBank/senderAccountName/senderAccountNumber`, model `ClinicBankAccount`, enum `LineDiscountSource { PROMO MANUAL }`.

- [ ] **Step 1: Uji yang gagal**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi perbaikan tagihan", () => {
  const sql = readFileSync("prisma/migrations/20261013120000_perbaikan_tagihan/migration.sql", "utf8");

  it("hanya menambah", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga diskon baris, promo, dan rekening tujuan di basis data, lalu menyalin rekening Pengaturan", () => {
    for (const name of ["invoice_line_discount_range", "invoice_line_discount_reason", "stock_item_promo_shape", "invoice_payment_destination_pair"]) {
      expect(sql, name).toMatch(new RegExp(`ADD CONSTRAINT "${name}" CHECK`));
    }
    expect(sql).toMatch(/INSERT INTO "ClinicBankAccount"[\s\S]*FROM "ClinicSetting"/);
  });
});
```

`tests/integration/perbaikan-tagihan-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "skema-diskon";
const WA = "6281200009501";
let world: BillingWorld;
let invoiceId: string;
let lineId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const invoice = await prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      lines: { create: [{ kind: "LAYANAN", name: "Layanan", quantity: 2, unitPrice: 50_000 }] },
    },
    select: { id: true, lines: { select: { id: true } } },
  });
  invoiceId = invoice.id;
  lineId = invoice.lines[0].id;
});
afterAll(async () => {
  await prisma.invoicePayment.deleteMany({ where: { invoiceId } });
  await prisma.clinicBankAccount.deleteMany({ where: { bankName: "Bank Skema" } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("skema perbaikan tagihan", () => {
  it("diskon baris sah: 0 tanpa sumber, atau >0 dengan sumber dan alasan, paling banyak harga baris", async () => {
    await prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 100_000, discountReason: "Uji", discountSource: "MANUAL" } });
    await prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 0, discountReason: null, discountSource: null } });
  });

  it("diskon melebihi harga baris, tanpa alasan, atau tanpa sumber ditolak", async () => {
    await expect(prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 100_001, discountReason: "x", discountSource: "MANUAL" } })).rejects.toThrow(/invoice_line_discount_range/);
    await expect(prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 10, discountReason: null, discountSource: "MANUAL" } })).rejects.toThrow(/invoice_line_discount_reason/);
    await expect(prisma.invoiceLine.update({ where: { id: lineId }, data: { discountAmount: 10, discountReason: "x", discountSource: null } })).rejects.toThrow(/invoice_line_discount_reason/);
  });

  it("promo barang harus lengkap atau kosong sama sekali", async () => {
    await prisma.stockItem.update({ where: { id: world.productId }, data: { promoName: "Okt", promoKind: "PERSEN", promoValue: 10 } });
    await expect(prisma.stockItem.update({ where: { id: world.productId }, data: { promoName: null } })).rejects.toThrow(/stock_item_promo_shape/);
    await expect(prisma.stockItem.update({ where: { id: world.productId }, data: { promoValue: 101 } })).rejects.toThrow(/stock_item_promo_shape/);
    await expect(
      prisma.stockItem.update({ where: { id: world.productId }, data: { promoStartsOn: new Date("2026-10-10"), promoEndsOn: new Date("2026-10-09") } }),
    ).rejects.toThrow(/stock_item_promo_shape/);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { promoName: null, promoKind: null, promoValue: 0 } });
  });

  it("rekening tujuan dan labelnya terisi bersamaan", async () => {
    const account = await prisma.clinicBankAccount.create({ data: { bankName: "Bank Skema", accountNumber: "1234567", accountHolder: "SunDY" } });
    await expect(
      prisma.invoicePayment.create({ data: { invoiceId, amount: 1, method: "TRANSFER", paidAt: new Date("2026-10-13"), staffId: "s", staffName: "Uji", clinicBankAccountId: account.id } }),
    ).rejects.toThrow(/invoice_payment_destination_pair/);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts` dan `npm run test:integration -- tests/integration/perbaikan-tagihan-schema.test.ts`
Expected: unit FAIL (`ENOENT`); integrasi FAIL (kolom/model tidak dikenal).

- [ ] **Step 3: Skema**

Di `prisma/schema.prisma`:
- Tambahkan enum (di dekat `DiscountKind`):

```prisma
/// Asal diskon baris tagihan (spec perbaikan tagihan 3): promo barang otomatis atau diketik staf.
enum LineDiscountSource {
  PROMO
  MANUAL
}
```

- Di model `InvoiceLine` setelah `priceNote String?`:

```prisma
  /// Potongan rupiah untuk seluruh baris (spec perbaikan tagihan 3–4). CHECK: 0..quantity×unitPrice.
  discountAmount Int                 @default(0)
  discountReason String?
  discountSource LineDiscountSource?
```

- Di model `StockItem` setelah `sellPrice`:

```prisma
  /// Diskon bawaan barang (spec perbaikan tagihan 3); diatur price:manage. CHECK stock_item_promo_shape.
  promoName     String?
  promoKind     DiscountKind?
  promoValue    Int           @default(0)
  promoStartsOn DateTime?     @db.Date
  promoEndsOn   DateTime?     @db.Date
```

- Di model `InvoicePayment` setelah `reference String?`:

```prisma
  /// Transfer bank (spec perbaikan tagihan 8): rekening tujuan klinik dan salinan labelnya saat dicatat.
  clinicBankAccountId String?
  clinicBankAccount   ClinicBankAccount? @relation(fields: [clinicBankAccountId], references: [id], onDelete: Restrict)
  destinationLabel    String?
  senderBank          String?
  senderAccountName   String?
  senderAccountNumber String?
```

  dan di bagian indeks model itu: `@@index([clinicBankAccountId])`.
- Model baru (setelah `ClinicSetting`):

```prisma
/// Rekening klinik penerima transfer pembayaran tagihan (spec perbaikan tagihan 7). Tidak dihapus, hanya dinonaktifkan.
model ClinicBankAccount {
  id            String           @id @default(cuid())
  bankName      String
  accountNumber String
  accountHolder String
  isActive      Boolean          @default(true)
  sortOrder     Int              @default(0)
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  payments      InvoicePayment[]
}
```

- [ ] **Step 4: Migrasi** — `prisma/migrations/20261013120000_perbaikan_tagihan/migration.sql`:

```sql
-- Perbaikan tagihan (spec docs/superpowers/specs/2026-10-13-perbaikan-tagihan-design.md bagian 3).
-- Hanya menambah: rilis lama mengabaikan kolom dan tabel baru.

-- CreateEnum
CREATE TYPE "LineDiscountSource" AS ENUM ('PROMO', 'MANUAL');

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "discountSource" "LineDiscountSource";

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "promoName" TEXT,
ADD COLUMN     "promoKind" "DiscountKind",
ADD COLUMN     "promoValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promoStartsOn" DATE,
ADD COLUMN     "promoEndsOn" DATE;

-- CreateTable
CREATE TABLE "ClinicBankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicBankAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "clinicBankAccountId" TEXT,
ADD COLUMN     "destinationLabel" TEXT,
ADD COLUMN     "senderAccountName" TEXT,
ADD COLUMN     "senderAccountNumber" TEXT,
ADD COLUMN     "senderBank" TEXT;

-- CreateIndex
CREATE INDEX "InvoicePayment_clinicBankAccountId_idx" ON "InvoicePayment"("clinicBankAccountId");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_clinicBankAccountId_fkey" FOREIGN KEY ("clinicBankAccountId") REFERENCES "ClinicBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Diskon baris: 0..harga baris; ada diskon ⇔ ada sumber, dan diskon selalu beralasan.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_discount_range" CHECK ("discountAmount" >= 0 AND "discountAmount" <= "quantity" * "unitPrice");
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_discount_reason" CHECK (
  ("discountAmount" = 0) = ("discountSource" IS NULL)
  AND ("discountAmount" = 0 OR ("discountReason" IS NOT NULL AND "discountReason" <> ''))
);

-- Promo barang: kosong sama sekali, atau lengkap dan masuk akal.
ALTER TABLE "StockItem" ADD CONSTRAINT "stock_item_promo_shape" CHECK (
  ("promoKind" IS NULL AND "promoValue" = 0 AND "promoName" IS NULL AND "promoStartsOn" IS NULL AND "promoEndsOn" IS NULL)
  OR (
    "promoKind" IS NOT NULL AND "promoValue" > 0 AND "promoName" IS NOT NULL AND "promoName" <> ''
    AND ("promoKind" <> 'PERSEN' OR "promoValue" <= 100)
    AND ("promoStartsOn" IS NULL OR "promoEndsOn" IS NULL OR "promoEndsOn" >= "promoStartsOn")
  )
);

-- Rekening tujuan dan salinan labelnya selalu bersamaan.
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "invoice_payment_destination_pair" CHECK (("clinicBankAccountId" IS NULL) = ("destinationLabel" IS NULL));

-- Rekening yang sudah ada di Pengaturan menjadi rekening klinik pertama (spec 3).
INSERT INTO "ClinicBankAccount" ("id", "bankName", "accountNumber", "accountHolder", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'rekening-awal', TRIM("bankName"), regexp_replace("bankAccountNumber", '[^0-9]', '', 'g'), TRIM("bankAccountHolder"), true, 0, now(), now()
FROM "ClinicSetting"
WHERE "id" = 1
  AND COALESCE(TRIM("bankName"), '') <> ''
  AND COALESCE(regexp_replace("bankAccountNumber", '[^0-9]', '', 'g'), '') <> ''
  AND COALESCE(TRIM("bankAccountHolder"), '') <> '';
```

- [ ] **Step 5: Terapkan dan uji**

Run: `npx prisma format && npx prisma generate && npm run db:migrate:test && npx vitest run tests/unit/migrations.test.ts && npm run test:integration -- tests/integration/perbaikan-tagihan-schema.test.ts`
Expected: migrasi diterapkan; unit PASS; integrasi PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261013120000_perbaikan_tagihan tests/unit/migrations.test.ts tests/integration/perbaikan-tagihan-schema.test.ts
git commit -m "feat: schema for line discounts, item promos, clinic bank accounts, and transfer details"
```

---

### Task 2: Rumus total dan batas gabungan (murni)

**Files:**
- Modify: `src/lib/invoice.ts`
- Modify: `src/server/invoice-store.ts` (`TOTALS_SELECT`, `guardDiscount`)
- Test: `tests/unit/invoice-line-discount.test.ts`

**Interfaces:**
- Produces:
  - `type LineDiscountSourceValue = "PROMO" | "MANUAL"`
  - `type TotalsLine = { quantity: number; unitPrice: number; discountAmount?: number; discountSource?: LineDiscountSourceValue | null }`
  - `lineGross(line: TotalsLine): number`, `lineAmount(line: TotalsLine): number`
  - `invoiceSubtotal(lines): number` (bersih), `invoiceGrossSubtotal(lines): number`, `manualItemDiscount(lines): number`
  - `limitedDiscount(invoice: { discountKind; discountValue; lines: TotalsLine[] }): number` (manual + diskon tagihan)
  - `InvoiceTotals` bertambah `grossSubtotal: number; itemDiscount: number` (`subtotal` = bersih)
  - `validateDiscount(raw, ctx: { subtotal: number; canExceed: boolean; grossSubtotal?: number; otherLimited?: number })`
  - `type LineDiscountInput = { kind: DiscountKindValue; value: number; reason: string }`; `validateLineDiscount(raw, ctx: { gross: number }): Validation<{ amount: number; reason: string }>`
  - `guardDiscount(tx, invoiceId, canExceed, mutate, message?)` dengan batas gabungan.

- [ ] **Step 1: Uji yang gagal** — `tests/unit/invoice-line-discount.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  invoiceGrossSubtotal,
  invoiceSubtotal,
  invoiceTotals,
  limitedDiscount,
  lineAmount,
  manualItemDiscount,
  validateDiscount,
  validateLineDiscount,
} from "@/lib/invoice";

const lines = [
  { quantity: 2, unitPrice: 150_000, discountAmount: 30_000, discountSource: "PROMO" as const },
  { quantity: 1, unitPrice: 100_000, discountAmount: 10_000, discountSource: "MANUAL" as const },
];

describe("total dengan diskon baris", () => {
  it("contoh spec: promo 10%, manual Rp10.000, diskon tagihan 5% → total Rp342.000", () => {
    const totals = invoiceTotals({ status: "FINAL", discountKind: "PERSEN", discountValue: 5, lines, payments: [] });
    expect(totals).toMatchObject({ grossSubtotal: 400_000, itemDiscount: 40_000, subtotal: 360_000, discount: 18_000, total: 342_000, balance: 342_000 });
  });

  it("baris tanpa diskon tetap seperti dulu (kolom lama tanpa discountAmount)", () => {
    expect(lineAmount({ quantity: 3, unitPrice: 1000 })).toBe(3000);
    expect(invoiceSubtotal([{ quantity: 3, unitPrice: 1000 }])).toBe(3000);
  });

  it("subtotal bersih, kotor, dan diskon manual saja", () => {
    expect(invoiceGrossSubtotal(lines)).toBe(400_000);
    expect(invoiceSubtotal(lines)).toBe(360_000);
    expect(manualItemDiscount(lines)).toBe(10_000);
  });

  it("batas gabungan menghitung manual + diskon tagihan, bukan promo", () => {
    expect(limitedDiscount({ discountKind: "PERSEN", discountValue: 5, lines })).toBe(28_000);
    expect(limitedDiscount({ discountKind: null, discountValue: 0, lines })).toBe(10_000);
  });
});

describe("validateDiscount dengan batas gabungan", () => {
  it("tepat 20% dari kotor sah; Rp1 lebih ditolak untuk resepsionis", () => {
    // kotor 400.000 → batas 80.000; manual lain 10.000 → diskon tagihan maks 70.000 (nominal)
    const ctx = { subtotal: 360_000, grossSubtotal: 400_000, otherLimited: 10_000, canExceed: false };
    expect(validateDiscount({ kind: "NOMINAL", value: 70_000, reason: "Pelanggan lama" }, ctx).ok).toBe(true);
    expect(validateDiscount({ kind: "NOMINAL", value: 70_001, reason: "Pelanggan lama" }, ctx)).toEqual({
      ok: false,
      message: "Diskon di atas 20% diberikan oleh Admin Keuangan.",
    });
    expect(validateDiscount({ kind: "NOMINAL", value: 70_001, reason: "x" }, { ...ctx, canExceed: true }).ok).toBe(true);
  });

  it("tanpa konteks tambahan tetap seperti dulu (20% dari subtotal)", () => {
    expect(validateDiscount({ kind: "PERSEN", value: 20, reason: "x" }, { subtotal: 100_000, canExceed: false }).ok).toBe(true);
    expect(validateDiscount({ kind: "PERSEN", value: 21, reason: "x" }, { subtotal: 100_000, canExceed: false }).ok).toBe(false);
  });
});

describe("validateLineDiscount", () => {
  it("nominal untuk seluruh baris dan persen dibulatkan ke bawah", () => {
    expect(validateLineDiscount({ kind: "NOMINAL", value: 25_000, reason: "Rusak kemasan" }, { gross: 300_000 })).toEqual({ ok: true, value: { amount: 25_000, reason: "Rusak kemasan" } });
    expect(validateLineDiscount({ kind: "PERSEN", value: 15, reason: "x" }, { gross: 99_999 })).toEqual({ ok: true, value: { amount: 14_999, reason: "x" } });
  });

  it("menolak melebihi harga baris, tanpa alasan, dan nilai tidak sah", () => {
    expect(validateLineDiscount({ kind: "NOMINAL", value: 300_001, reason: "x" }, { gross: 300_000 })).toEqual({ ok: false, message: "Diskon tidak boleh melebihi harga baris." });
    expect(validateLineDiscount({ kind: "NOMINAL", value: 1000, reason: " " }, { gross: 300_000 })).toEqual({ ok: false, message: "Isi alasan diskon." });
    expect(validateLineDiscount({ kind: "PERSEN", value: 0, reason: "x" }, { gross: 1000 }).ok).toBe(false);
    expect(validateLineDiscount({ kind: "PERSEN", value: 101, reason: "x" }, { gross: 1000 }).ok).toBe(false);
    expect(validateLineDiscount({ kind: "LAIN", value: 1, reason: "x" }, { gross: 1000 }).ok).toBe(false);
    expect(validateLineDiscount({ kind: "NOMINAL", value: 1, reason: "a".repeat(201) }, { gross: 1000 }).ok).toBe(false);
    expect(validateLineDiscount(null, { gross: 1000 }).ok).toBe(false);
  });

  it("persen yang menghasilkan Rp0 ditolak", () => {
    expect(validateLineDiscount({ kind: "PERSEN", value: 1, reason: "x" }, { gross: 50 })).toEqual({ ok: false, message: "Diskon terlalu kecil untuk baris ini." });
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/invoice-line-discount.test.ts`
Expected: FAIL (fungsi tidak diekspor).

- [ ] **Step 3: Implementasi di `src/lib/invoice.ts`**

Ganti blok "Hitung" (dari `export function invoiceSubtotal` sampai akhir `invoiceTotals`) dengan:

```ts
export type LineDiscountSourceValue = "PROMO" | "MANUAL";

/** Baris untuk hitungan: kolom diskon boleh tidak ada (baris lama, atau pemilih kolom lama). */
export type TotalsLine = { quantity: number; unitPrice: number; discountAmount?: number; discountSource?: LineDiscountSourceValue | null };

export function lineGross(line: TotalsLine): number {
  return line.quantity * line.unitPrice;
}

/** Jumlah baris setelah diskon baris (spec perbaikan tagihan 4). */
export function lineAmount(line: TotalsLine): number {
  return lineGross(line) - (line.discountAmount ?? 0);
}

/** Subtotal bersih: Σ jumlah baris setelah diskon baris. Diskon tagihan dihitung dari angka ini. */
export function invoiceSubtotal(lines: readonly TotalsLine[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

/** Σ harga baris sebelum diskon apa pun; dasar batas 20% resepsionis. */
export function invoiceGrossSubtotal(lines: readonly TotalsLine[]): number {
  return lines.reduce((sum, line) => sum + lineGross(line), 0);
}

/** Σ diskon baris yang diketik staf; diskon promo tidak termasuk (spec T4). */
export function manualItemDiscount(lines: readonly TotalsLine[]): number {
  return lines.reduce((sum, line) => sum + (line.discountSource === "MANUAL" ? (line.discountAmount ?? 0) : 0), 0);
}

/** Diskon persen dibulatkan ke bawah, nominal tidak melebihi subtotal. */
export function discountAmount(subtotal: number, kind: DiscountKindValue | null, value: number): number {
  if (!kind || value <= 0) return 0;
  return kind === "PERSEN" ? Math.floor((subtotal * Math.min(value, 100)) / 100) : Math.min(value, subtotal);
}

/** Batas diskon resepsionis dari subtotal kotor. */
export function discountLimit(grossSubtotal: number): number {
  return Math.floor((grossSubtotal * DISCOUNT_LIMIT_PERCENT) / 100);
}

/** Diskon yang dibatasi 20%: Σ diskon baris manual + diskon tagihan (spec T2). */
export function limitedDiscount(invoice: { discountKind: DiscountKindValue | null; discountValue: number; lines: readonly TotalsLine[] }): number {
  return manualItemDiscount(invoice.lines) + discountAmount(invoiceSubtotal(invoice.lines), invoice.discountKind, invoice.discountValue);
}

export type InvoiceInput = {
  status: InvoiceStatusValue;
  discountKind: DiscountKindValue | null;
  discountValue: number;
  lines: readonly TotalsLine[];
  payments: readonly { amount: number; revokedAt: Date | null }[];
};

export type InvoiceTotals = {
  /** Σ harga baris sebelum diskon. */
  grossSubtotal: number;
  /** Σ diskon baris (promo dan manual). */
  itemDiscount: number;
  /** Subtotal setelah diskon baris. */
  subtotal: number;
  /** Diskon tagihan. */
  discount: number;
  total: number;
  paid: number;
  /** Sisa yang harus dibayar; 0 untuk tagihan dibatalkan. */
  balance: number;
  display: InvoiceDisplayStatus;
};

/** Total, dibayar, sisa, dan status tampil (spec tagihan 3.2, perbaikan tagihan 4). Pembayaran yang dibatalkan tidak dihitung. */
export function invoiceTotals(invoice: InvoiceInput): InvoiceTotals {
  const grossSubtotal = invoiceGrossSubtotal(invoice.lines);
  const subtotal = invoiceSubtotal(invoice.lines);
  const itemDiscount = grossSubtotal - subtotal;
  const discount = discountAmount(subtotal, invoice.discountKind, invoice.discountValue);
  const total = subtotal - discount;
  const paid = invoice.payments.reduce((sum, payment) => (payment.revokedAt ? sum : sum + payment.amount), 0);
  const base = { grossSubtotal, itemDiscount, subtotal, discount, total, paid };
  if (invoice.status === "DIBATALKAN") return { ...base, balance: 0, display: "DIBATALKAN" };
  const balance = total - paid;
  if (invoice.status === "DRAF") return { ...base, balance, display: "DRAF" };
  const display = balance <= 0 ? "LUNAS" : paid > 0 ? "SEBAGIAN" : "BELUM_DIBAYAR";
  return { ...base, balance, display };
}
```

(Hapus definisi lama `invoiceSubtotal`, `discountAmount`, `discountLimit`, `InvoiceInput`, `InvoiceTotals`, `invoiceTotals` yang tergantikan.)

Ganti `validateDiscount` dengan:

```ts
/**
 * Diskon tagihan (spec tagihan 3.2, TG9; perbaikan tagihan T2). Jenis kosong atau nilai 0 menghapus diskon.
 * `subtotal`: subtotal bersih (dasar diskon). `grossSubtotal`: dasar batas 20% (bawaan = subtotal).
 * `otherLimited`: diskon baris manual yang sudah ada (bawaan 0). `canExceed`: Admin Keuangan/Super Admin.
 */
export function validateDiscount(
  raw: unknown,
  ctx: { subtotal: number; canExceed: boolean; grossSubtotal?: number; otherLimited?: number },
): Validation<ValidDiscount> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  const kind = raw.kind === "NOMINAL" || raw.kind === "PERSEN" ? raw.kind : null;
  if (raw.kind !== null && raw.kind !== undefined && kind === null) return fail(INVALID_FORM);
  const value = raw.value;
  if (kind === null || value === 0) return { ok: true, value: { kind: null, value: 0, reason: null } };
  if (kind === "PERSEN" && !isWhole(value, 1, 100)) return fail("Persen diskon harus 1 sampai 100.");
  if (kind === "NOMINAL" && !isWhole(value, 1, MAX_AMOUNT)) return fail("Nominal diskon harus bilangan bulat lebih dari 0.");
  const amount = value as number;
  if (kind === "NOMINAL" && amount > ctx.subtotal) return fail("Nominal diskon tidak boleh melebihi subtotal.");
  const reason = cleanText(raw.reason);
  if (reason === null) return fail(INVALID_FORM);
  if (!reason) return fail("Isi alasan diskon.");
  if (reason.length > 300) return fail("Alasan paling banyak 300 karakter.");
  const limit = discountLimit(ctx.grossSubtotal ?? ctx.subtotal);
  if (!ctx.canExceed && (ctx.otherLimited ?? 0) + discountAmount(ctx.subtotal, kind, amount) > limit) {
    return fail(`Diskon di atas ${DISCOUNT_LIMIT_PERCENT}% diberikan oleh Admin Keuangan.`);
  }
  return { ok: true, value: { kind, value: amount, reason } };
}

export type LineDiscountInput = { kind: DiscountKindValue; value: number; reason: string };

/** Diskon manual satu baris (spec perbaikan tagihan 5.2): nominal untuk seluruh baris, atau persen dibulatkan ke bawah. Batas 20% diperiksa server. */
export function validateLineDiscount(raw: unknown, ctx: { gross: number }): Validation<{ amount: number; reason: string }> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (raw.kind !== "NOMINAL" && raw.kind !== "PERSEN") return fail("Pilih jenis diskon.");
  if (raw.kind === "PERSEN" && !isWhole(raw.value, 1, 100)) return fail("Persen diskon harus 1 sampai 100.");
  if (raw.kind === "NOMINAL" && !isWhole(raw.value, 1, MAX_AMOUNT)) return fail("Nominal diskon harus bilangan bulat lebih dari 0.");
  const amount = raw.kind === "PERSEN" ? Math.floor((ctx.gross * (raw.value as number)) / 100) : (raw.value as number);
  if (amount > ctx.gross) return fail("Diskon tidak boleh melebihi harga baris.");
  if (amount === 0) return fail("Diskon terlalu kecil untuk baris ini.");
  const reason = cleanText(raw.reason);
  if (reason === null) return fail(INVALID_FORM);
  if (!reason) return fail("Isi alasan diskon.");
  if (reason.length > 200) return fail("Alasan paling banyak 200 karakter.");
  return { ok: true, value: { amount, reason } };
}
```

Di `src/server/invoice-store.ts`:
- `TOTALS_SELECT.lines` menjadi `{ select: { quantity: true, unitPrice: true, discountAmount: true, discountSource: true } }`.
- Impor `discountLimit, DISCOUNT_LIMIT_PERCENT, invoiceGrossSubtotal, limitedDiscount` (hapus `discountAmount, invoiceSubtotal` bila tak terpakai).
- Ganti `guardDiscount` dengan:

```ts
/**
 * Menjalankan perubahan draf, lalu menolaknya bila diskon yang dibatasi (diskon baris manual + diskon
 * tagihan, spec perbaikan tagihan T2) melewati 20% dari subtotal kotor. Diskon yang sudah di atas batas
 * (disetujui Admin Keuangan) boleh tetap, tetapi tidak boleh membesar, baik nilainya maupun porsinya.
 */
export async function guardDiscount(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  canExceed: boolean,
  mutate: () => Promise<void>,
  message = `Perubahan ini membuat diskon melebihi ${DISCOUNT_LIMIT_PERCENT}%. Ubah diskon dulu atau minta Admin Keuangan.`,
): Promise<void> {
  const read = async () => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { discountKind: true, discountValue: true, lines: { select: { quantity: true, unitPrice: true, discountAmount: true, discountSource: true } } },
    });
    const gross = invoiceGrossSubtotal(invoice.lines);
    const amount = limitedDiscount(invoice);
    return { gross, amount, within: amount <= discountLimit(gross) };
  };
  const before = await read();
  await mutate();
  const after = await read();
  const grew = after.amount > before.amount || after.amount * before.gross > before.amount * after.gross;
  if (!canExceed && !after.within && (before.within || grew)) throw new UserFacingError(message);
}
```

- [ ] **Step 4: Jalankan, pastikan lulus; uji lama tagihan tetap hijau**

Run: `npx vitest run tests/unit/invoice-line-discount.test.ts tests/unit/invoice.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS; galat tipe hanya bila ada pemakai `discountLimit(subtotal)` lama — panggilan itu tetap sah (argumen kini disebut kotor; untuk tagihan tanpa diskon baris nilainya sama).
Uji lama di `tests/unit/invoice.test.ts` yang membandingkan hasil `invoiceTotals` dengan `toEqual` perlu ditambah `grossSubtotal` (= subtotal lama) dan `itemDiscount: 0` — ini perubahan bentuk yang disengaja (Ruling), bukan perubahan nilai.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice.ts src/server/invoice-store.ts tests/unit/invoice-line-discount.test.ts
git commit -m "feat: invoice totals with line discounts and a combined 20% receptionist limit"
```

---

### Task 3: Aturan promo barang (murni)

**Files:**
- Create: `src/lib/stock-promo.ts`
- Test: `tests/unit/stock-promo.test.ts`

**Interfaces:**
- Produces: `type PromoFields = { promoName: string | null; promoKind: DiscountKindValue | null; promoValue: number; promoStartsOn: Date | null; promoEndsOn: Date | null }`; `activePromo(item: PromoFields, today: string): { name: string; kind: DiscountKindValue; value: number } | null`; `promoDiscount(item: PromoFields, line: { quantity: number; unitPrice: number }, today: string): { amount: number; reason: string } | null`; `type PromoInput = { name: string; kind: DiscountKindValue | null; value: number; startsOn: string; endsOn: string }`; `validatePromo(raw: unknown): Validation<Omit<PromoFields, never>>`; `promoLabel(item: PromoFields): string | null`.

- [ ] **Step 1: Uji yang gagal** — `tests/unit/stock-promo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { activePromo, promoDiscount, promoLabel, validatePromo, type PromoFields } from "@/lib/stock-promo";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const persen: PromoFields = { promoName: "Promo Oktober", promoKind: "PERSEN", promoValue: 10, promoStartsOn: d("2026-10-01"), promoEndsOn: d("2026-10-31") };
const none: PromoFields = { promoName: null, promoKind: null, promoValue: 0, promoStartsOn: null, promoEndsOn: null };

describe("promo berlaku", () => {
  it("inklusif pada hari mulai dan selesai; tidak sebelum atau sesudah", () => {
    expect(activePromo(persen, "2026-09-30")).toBeNull();
    expect(activePromo(persen, "2026-10-01")).toEqual({ name: "Promo Oktober", kind: "PERSEN", value: 10 });
    expect(activePromo(persen, "2026-10-31")).not.toBeNull();
    expect(activePromo(persen, "2026-11-01")).toBeNull();
  });

  it("sisi tanggal kosong berarti tanpa batas; tanpa promo selalu null", () => {
    expect(activePromo({ ...persen, promoStartsOn: null }, "2020-01-01")).not.toBeNull();
    expect(activePromo({ ...persen, promoEndsOn: null }, "2099-01-01")).not.toBeNull();
    expect(activePromo(none, "2026-10-15")).toBeNull();
  });
});

describe("promoDiscount", () => {
  it("persen dari harga baris dibulatkan ke bawah, dengan alasan Promo: nama", () => {
    expect(promoDiscount(persen, { quantity: 2, unitPrice: 150_000 }, "2026-10-15")).toEqual({ amount: 30_000, reason: "Promo: Promo Oktober" });
    expect(promoDiscount(persen, { quantity: 1, unitPrice: 9_999 }, "2026-10-15")).toEqual({ amount: 999, reason: "Promo: Promo Oktober" });
  });

  it("nominal per unit dikali jumlah, tidak melebihi harga baris", () => {
    const nominal: PromoFields = { ...persen, promoKind: "NOMINAL", promoValue: 10_000 };
    expect(promoDiscount(nominal, { quantity: 3, unitPrice: 50_000 }, "2026-10-15")?.amount).toBe(30_000);
    expect(promoDiscount(nominal, { quantity: 3, unitPrice: 5_000 }, "2026-10-15")?.amount).toBe(15_000);
  });

  it("tidak berlaku, harga Rp0, atau hasil Rp0 → null", () => {
    expect(promoDiscount(persen, { quantity: 1, unitPrice: 1000 }, "2026-11-02")).toBeNull();
    expect(promoDiscount(persen, { quantity: 1, unitPrice: 0 }, "2026-10-15")).toBeNull();
    expect(promoDiscount(persen, { quantity: 1, unitPrice: 5 }, "2026-10-15")).toBeNull();
  });
});

describe("validatePromo", () => {
  it("tanpa jenis → promo dikosongkan", () => {
    expect(validatePromo({ name: "x", kind: null, value: 5, startsOn: "", endsOn: "" })).toEqual({ ok: true, value: none });
  });

  it("promo lengkap; tanggal opsional", () => {
    expect(validatePromo({ name: " Promo Oktober ", kind: "PERSEN", value: 10, startsOn: "2026-10-01", endsOn: "" })).toEqual({
      ok: true,
      value: { promoName: "Promo Oktober", promoKind: "PERSEN", promoValue: 10, promoStartsOn: d("2026-10-01"), promoEndsOn: null },
    });
  });

  it("menolak nama kosong, nilai tidak sah, persen > 100, dan tanggal selesai sebelum mulai", () => {
    expect(validatePromo({ name: "", kind: "PERSEN", value: 10, startsOn: "", endsOn: "" })).toEqual({ ok: false, message: "Isi nama promo." });
    expect(validatePromo({ name: "x", kind: "PERSEN", value: 101, startsOn: "", endsOn: "" })).toEqual({ ok: false, message: "Persen promo harus 1 sampai 100." });
    expect(validatePromo({ name: "x", kind: "NOMINAL", value: 0, startsOn: "", endsOn: "" })).toEqual({ ok: false, message: "Nominal promo harus lebih dari 0." });
    expect(validatePromo({ name: "x", kind: "PERSEN", value: 5, startsOn: "2026-10-10", endsOn: "2026-10-09" })).toEqual({
      ok: false,
      message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    });
    expect(validatePromo({ name: "x", kind: "PERSEN", value: 5, startsOn: "10/10/2026", endsOn: "" }).ok).toBe(false);
    expect(validatePromo(null).ok).toBe(false);
  });
});

describe("promoLabel", () => {
  it("ringkas untuk daftar barang", () => {
    expect(promoLabel(persen)).toBe("Promo Oktober · 10% · 1 Okt 2026–31 Okt 2026");
    expect(promoLabel({ ...persen, promoKind: "NOMINAL", promoValue: 10_000, promoStartsOn: null, promoEndsOn: null })).toBe("Promo Oktober · Rp 10.000/unit");
    expect(promoLabel(none)).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/stock-promo.test.ts`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi** — `src/lib/stock-promo.ts`:

```ts
import { formatDateWithYear, formatRupiah } from "./format";
import type { DiscountKindValue } from "./invoice";
import { dateOnlyString, isDateString, MAX_AMOUNT, type Validation } from "./stock";

// Diskon bawaan barang (spec perbaikan tagihan 3–5.1). Murni: dipakai server tagihan dan layar Stok.

export type PromoFields = {
  promoName: string | null;
  promoKind: DiscountKindValue | null;
  promoValue: number;
  promoStartsOn: Date | null;
  promoEndsOn: Date | null;
};

export type PromoInput = { name: string; kind: DiscountKindValue | null; value: number; startsOn: string; endsOn: string };

const NO_PROMO: PromoFields = { promoName: null, promoKind: null, promoValue: 0, promoStartsOn: null, promoEndsOn: null };
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

/** Promo yang berlaku pada `today` ("YYYY-MM-DD", WITA), inklusif; sisi tanggal kosong tanpa batas. */
export function activePromo(item: PromoFields, today: string): { name: string; kind: DiscountKindValue; value: number } | null {
  if (!item.promoKind || item.promoValue <= 0 || !item.promoName) return null;
  if (item.promoStartsOn && dateOnlyString(item.promoStartsOn) > today) return null;
  if (item.promoEndsOn && dateOnlyString(item.promoEndsOn) < today) return null;
  return { name: item.promoName, kind: item.promoKind, value: item.promoValue };
}

/** Potongan promo untuk satu baris: persen dari harga baris (ke bawah), nominal per unit × jumlah, ≤ harga baris. */
export function promoDiscount(item: PromoFields, line: { quantity: number; unitPrice: number }, today: string): { amount: number; reason: string } | null {
  const promo = activePromo(item, today);
  if (!promo) return null;
  const gross = line.quantity * line.unitPrice;
  const amount = promo.kind === "PERSEN" ? Math.floor((gross * promo.value) / 100) : Math.min(promo.value * line.quantity, gross);
  return amount > 0 ? { amount, reason: `Promo: ${promo.name}` } : null;
}

export function validatePromo(raw: unknown): Validation<PromoFields> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail("Data tidak sah. Muat ulang halaman lalu coba lagi.");
  const input = raw as Record<string, unknown>;
  if (input.kind === null || input.kind === undefined || input.kind === "") return { ok: true, value: NO_PROMO };
  if (input.kind !== "NOMINAL" && input.kind !== "PERSEN") return fail("Pilih jenis promo.");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return fail("Isi nama promo.");
  if (name.length > 60) return fail("Nama promo paling banyak 60 karakter.");
  const value = input.value;
  if (input.kind === "PERSEN" && !(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100)) return fail("Persen promo harus 1 sampai 100.");
  if (input.kind === "NOMINAL" && !(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_AMOUNT)) return fail("Nominal promo harus lebih dari 0.");
  const startsOn = input.startsOn === "" || input.startsOn === undefined || input.startsOn === null ? null : input.startsOn;
  const endsOn = input.endsOn === "" || input.endsOn === undefined || input.endsOn === null ? null : input.endsOn;
  if ((startsOn !== null && !isDateString(startsOn)) || (endsOn !== null && !isDateString(endsOn))) return fail("Tanggal promo tidak sah.");
  if (startsOn && endsOn && (endsOn as string) < (startsOn as string)) return fail("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  return {
    ok: true,
    value: {
      promoName: name,
      promoKind: input.kind,
      promoValue: value as number,
      promoStartsOn: startsOn ? new Date(`${startsOn}T00:00:00Z`) : null,
      promoEndsOn: endsOn ? new Date(`${endsOn}T00:00:00Z`) : null,
    },
  };
}

/** "Promo Oktober · 10% · 1 Okt 2026–31 Okt 2026" untuk daftar dan detail barang. */
export function promoLabel(item: PromoFields): string | null {
  if (!item.promoKind || !item.promoName) return null;
  const value = item.promoKind === "PERSEN" ? `${item.promoValue}%` : `${formatRupiah(item.promoValue)}/unit`;
  const from = item.promoStartsOn ? formatDateWithYear(item.promoStartsOn) : null;
  const to = item.promoEndsOn ? formatDateWithYear(item.promoEndsOn) : null;
  const period = from && to ? `${from}–${to}` : from ? `mulai ${from}` : to ? `sampai ${to}` : null;
  return [item.promoName, value, period].filter(Boolean).join(" · ");
}
```

Periksa `src/lib/stock.ts` mengekspor `dateOnlyString`, `isDateString`, `MAX_AMOUNT`, `Validation` (sudah dipakai `src/lib/invoice.ts`). `formatDateWithYear` memakai zona waktu klinik; tanggal promo disimpan tengah malam UTC — bila label menampilkan sehari lebih awal, format dengan `dateLabel(dateOnlyString(d))` dari `src/lib/stock.ts` (Ruling).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/stock-promo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stock-promo.ts tests/unit/stock-promo.test.ts
git commit -m "feat: item promo rules"
```

---

### Task 4: Harga jual dan promo hanya untuk `price:manage`

**Files:**
- Modify: `src/lib/permissions.ts`, `tests/unit/permissions.test.ts`
- Modify: `src/server/stock-catalog.ts` (`createStockItem`, `updateStockItem`; baru `setStockItemPrice`)
- Modify: `src/server/stock-read.ts` (detail dan daftar barang memuat kolom promo)
- Test: `tests/integration/stock-price.test.ts`

**Interfaces:**
- Consumes: Task 3 `validatePromo`, `PromoInput`, `promoLabel`.
- Produces: capability `"price:manage"`; `setStockItemPrice(input: { itemId: string; sellPrice: number | null; promo: PromoInput }): Promise<ActionResult<void>>`; `StockItemDetail.item` dan baris daftar barang bertambah `promoName, promoKind, promoValue, promoStartsOn, promoEndsOn`.

- [ ] **Step 1: Uji yang gagal**

Di `tests/unit/permissions.test.ts`, tambahkan di dalam `describe` utama:

```ts
  it("harga jual dan promo barang hanya Super Admin dan Admin Keuangan", () => {
    expect(can("SUPER_ADMIN", "price:manage")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "price:manage")).toBe(true);
    for (const role of ["APOTEKER", "RESEPSIONIS", "DOKTER", "TERAPIS"] as const) expect(can(role, "price:manage")).toBe(false);
  });
```

`tests/integration/stock-price.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createStockItem, setStockItemPrice, updateStockItem } from "@/server/stock-catalog";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Uji Harga", role: "APOTEKER" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const CODE = "HARGA-UJI";
const base = { code: CODE, name: "Serum Harga Uji", kind: "PRODUK" as const, unit: "botol", sellPrice: null, minStock: 0, notes: "" };
const noPromo = { name: "", kind: null, value: 0, startsOn: "", endsOn: "" };
let itemId: string;

beforeAll(async () => {
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: CODE } } });
});
beforeEach(() => {
  actor.role = "APOTEKER";
});
afterAll(async () => {
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: CODE } } });
  await prisma.$disconnect();
});

describe("harga jual dan promo barang", () => {
  it("Apoteker menambah barang tanpa harga; mengirim harga ditolak", async () => {
    expect(await createStockItem({ ...base, code: `${CODE}-X`, sellPrice: 50_000 })).toEqual({ ok: false, error: "Harga jual diisi Admin Keuangan." });
    itemId = (await unwrap(createStockItem(base))).id;
    expect((await prisma.stockItem.findUniqueOrThrow({ where: { id: itemId } })).sellPrice).toBeNull();
  });

  it("Admin Keuangan mengisi harga jual dan promo, tercatat di audit", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(setStockItemPrice({ itemId, sellPrice: 150_000, promo: { name: "Promo Oktober", kind: "PERSEN", value: 10, startsOn: "2026-10-01", endsOn: "2026-10-31" } }));
    const item = await prisma.stockItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item).toMatchObject({ sellPrice: 150_000, promoName: "Promo Oktober", promoKind: "PERSEN", promoValue: 10 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "stock-item.price", entityId: itemId }, orderBy: { createdAt: "desc" } });
    expect(audit.summary).toBe(`${CODE}: harga belum diisi → Rp 150.000; Promo Oktober · 10% · 1 Okt 2026–31 Okt 2026`);
  });

  it("Apoteker mengubah data lain tanpa menyentuh harga; mengubah harga lewat aksi lama ditolak (Review Focus 4)", async () => {
    await unwrap(updateStockItem(itemId, { ...base, name: "Serum Harga Uji Baru", sellPrice: 150_000 }));
    expect(await updateStockItem(itemId, { ...base, sellPrice: 1 })).toEqual({ ok: false, error: "Harga jual diisi Admin Keuangan." });
    expect((await prisma.stockItem.findUniqueOrThrow({ where: { id: itemId } })).sellPrice).toBe(150_000);
    await expect(setStockItemPrice({ itemId, sellPrice: 1, promo: noPromo })).rejects.toThrow("forbidden: price:manage");
  });

  it("Super Admin boleh mengisi harga lewat formulir barang; promo dikosongkan lewat aksi harga", async () => {
    actor.role = "SUPER_ADMIN";
    await unwrap(updateStockItem(itemId, { ...base, sellPrice: 160_000 }));
    await unwrap(setStockItemPrice({ itemId, sellPrice: 160_000, promo: noPromo }));
    expect(await prisma.stockItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ sellPrice: 160_000, promoKind: null, promoValue: 0, promoName: null });
  });

  it("harga atau promo tidak sah ditolak", async () => {
    actor.role = "ADMIN_KEUANGAN";
    expect(await setStockItemPrice({ itemId, sellPrice: -5, promo: noPromo })).toEqual({ ok: false, error: "Harga jual tidak sah." });
    expect(await setStockItemPrice({ itemId, sellPrice: 1000, promo: { name: "", kind: "PERSEN", value: 10, startsOn: "", endsOn: "" } })).toEqual({ ok: false, error: "Isi nama promo." });
    expect(await setStockItemPrice({ itemId: "tidak-ada", sellPrice: 1000, promo: noPromo })).toEqual({ ok: false, error: "Barang tidak ditemukan." });
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/permissions.test.ts && npm run test:integration -- tests/integration/stock-price.test.ts`
Expected: FAIL (`price:manage` tidak dikenal; `setStockItemPrice` tidak ada).

- [ ] **Step 3: Implementasi**

`src/lib/permissions.ts`: tambahkan `| "price:manage"` ke tipe `Capability`; tambahkan `"price:manage"` ke daftar `SUPER_ADMIN` dan `ADMIN_KEUANGAN` (beri komentar di `ADMIN_KEUANGAN`: `// Harga jual dan promo barang (spec perbaikan tagihan T9); harga beli menyusul di sub-proyek 3.`).

`src/server/stock-catalog.ts`:
- impor `import { can } from "@/lib/permissions";`, `import { formatRupiah } from "@/lib/format";`, `import { promoLabel, validatePromo, type PromoInput } from "@/lib/stock-promo";`, dan `MAX_AMOUNT` dari `@/lib/stock`.
- tambahkan konstanta `const PRICE_BY_FINANCE = "Harga jual diisi Admin Keuangan.";`
- `createStockItem`: setelah `const item = checked.value;`:

```ts
    if (!can(actor.role, "price:manage") && item.sellPrice !== null) throw new UserFacingError(PRICE_BY_FINANCE);
```

- `updateStockItem`: `existing` memilih `{ id: true, sellPrice: true }`; setelah itu:

```ts
    const priceAllowed = can(actor.role, "price:manage");
    if (!priceAllowed && item.sellPrice !== existing.sellPrice) throw new UserFacingError(PRICE_BY_FINANCE);
```

  dan `data: priceAllowed ? item : { ...item, sellPrice: existing.sellPrice }`.
- aksi baru di akhir berkas:

```ts
/** Harga jual dan promo barang (spec perbaikan tagihan T9, 12a): hanya Admin Keuangan dan Super Admin. */
export async function setStockItemPrice(input: { itemId: string; sellPrice: number | null; promo: PromoInput }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const sellPrice = input?.sellPrice ?? null;
    if (sellPrice !== null && !(Number.isInteger(sellPrice) && sellPrice >= 0 && sellPrice <= MAX_AMOUNT)) throw new UserFacingError("Harga jual tidak sah.");
    const promo = validatePromo(input?.promo);
    if (!promo.ok) throw new UserFacingError(promo.message);
    const existing = await prisma.stockItem.findUnique({ where: { id: String(input?.itemId ?? "") }, select: { id: true, code: true, sellPrice: true } });
    if (!existing) throw new UserFacingError("Barang tidak ditemukan.");
    await prisma.stockItem.update({ where: { id: existing.id }, data: { sellPrice, ...promo.value } });
    const price = (value: number | null) => (value === null ? "belum diisi" : formatRupiah(value));
    await recordAudit({
      actor,
      action: "stock-item.price",
      entity: "StockItem",
      entityId: existing.id,
      summary: `${existing.code}: harga ${price(existing.sellPrice)} → ${price(sellPrice)}; ${promoLabel(promo.value) ?? "tanpa promo"}`,
    });
    revalidateStock(existing.id);
  });
}
```

`src/server/stock-read.ts`: pada pemilih kolom barang untuk daftar (`sellPrice: true` di sekitar baris 54) dan detail (sekitar baris 102 dan pemilihnya), tambahkan `promoName: true, promoKind: true, promoValue: true, promoStartsOn: true, promoEndsOn: true`, dan perluas tipe `StockItemRow`/`StockItemDetail.item` dengan `& PromoFields` (impor `type PromoFields` dari `@/lib/stock-promo`).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/permissions.test.ts && npm run test:integration -- tests/integration/stock-price.test.ts tests/integration/stock-catalog.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS. Bila `stock-catalog.test.ts` membuat barang dengan harga sebagai peran tanpa `price:manage`, ubah perannya di uji itu menjadi `SUPER_ADMIN` atau harganya `null` (Ruling, sebutkan uji yang diubah).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts tests/unit/permissions.test.ts src/server/stock-catalog.ts src/server/stock-read.ts tests/integration/stock-price.test.ts tests/integration/stock-catalog.test.ts
git commit -m "feat: only finance and the owner set item sell prices and promos"
```

---

### Task 5: Diskon baris di draf (server)

**Files:**
- Modify: `src/server/invoice-drafts.ts` (`addInvoiceItem`, `updateInvoiceLine`, `refreshCatalogPrices`, `setInvoiceDiscount`; baru `setLineDiscount`, `clearLineDiscount`)
- Modify: `src/server/dispensing-store.ts` (`HandedLine`, `handedInvoiceLines`)
- Modify: `src/server/invoice-payments.ts` (`applyFinalDiscount` memakai konteks baru)
- Test: `tests/integration/invoice-line-discount.test.ts`

**Interfaces:**
- Consumes: Task 2 (`validateLineDiscount`, `validateDiscount` ctx, `invoiceGrossSubtotal`, `manualItemDiscount`, `invoiceSubtotal`, `guardDiscount`), Task 3 (`promoDiscount`, `PromoFields`).
- Produces: `setLineDiscount(input: { invoiceId: string; version: number; lineId: string; kind: DiscountKindValue; value: number; reason: string }): Promise<EditResult>`; `clearLineDiscount(input: { invoiceId: string; version: number; lineId: string }): Promise<EditResult>`; konstanta `PROMO_SELECT`.

- [ ] **Step 1: Uji integrasi yang gagal** — `tests/integration/invoice-line-discount.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { addFreeLine, addInvoiceItem, clearLineDiscount, createDirectSale, createInvoiceFromVisit, refreshCatalogPrices, setInvoiceDiscount, setLineDiscount, updateInvoiceLine } from "@/server/invoice-drafts";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Diskon", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "diskon-baris";
const WA = "6281200009502";
const today = witaDateString(new Date());
let world: BillingWorld;

const lineOf = async (invoiceId: string, name: string) => prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, name } });
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

async function setPromo(itemId: string, promo: { kind: "PERSEN" | "NOMINAL"; value: number; endsOn?: string } | null) {
  await prisma.stockItem.update({
    where: { id: itemId },
    data: promo
      ? { promoName: "Promo Uji", promoKind: promo.kind, promoValue: promo.value, promoStartsOn: null, promoEndsOn: promo.endsOn ? new Date(`${promo.endsOn}T00:00:00Z`) : null }
      : { promoName: null, promoKind: null, promoValue: 0, promoStartsOn: null, promoEndsOn: null },
  });
}

/** Penjualan langsung: produk 2 × Rp150.000 + baris layanan Rp100.000. */
async function draft() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  let version = (await unwrap(addInvoiceItem({ invoiceId: id, version: 1, itemId: world.productId, quantity: 2 }))).version;
  version = (await unwrap(addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Layanan Diskon", quantity: 1, unitPrice: 100_000 }))).version;
  return id;
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await setPromo(world.productId, null);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("promo barang di tagihan", () => {
  it("terpasang otomatis saat barang ditambahkan (persen dan nominal per unit)", async () => {
    await setPromo(world.productId, { kind: "PERSEN", value: 10 });
    const id = await draft();
    expect(await lineOf(id, `${SLUG} Serum C`)).toMatchObject({ discountAmount: 30_000, discountSource: "PROMO", discountReason: "Promo: Promo Uji" });
    await setPromo(world.productId, { kind: "NOMINAL", value: 10_000 });
    const second = await draft();
    expect((await lineOf(second, `${SLUG} Serum C`)).discountAmount).toBe(20_000);
  });

  it("promo yang sudah berakhir tidak terpasang", async () => {
    await setPromo(world.productId, { kind: "PERSEN", value: 10, endsOn: "2020-01-01" });
    const id = await draft();
    expect((await lineOf(id, `${SLUG} Serum C`)).discountAmount).toBe(0);
  });

  it("baris dari penyerahan Apoteker juga mendapat promo", async () => {
    await setPromo(world.drugId, { kind: "PERSEN", value: 50 });
    const { appointmentId } = await finalVisit(world);
    await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 4 }] });
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, itemId: world.drugId } })).toMatchObject({ discountAmount: 4000, discountSource: "PROMO" });
    await setPromo(world.drugId, null);
  });

  it("jumlah diubah: promo dihitung ulang; diskon manual dipotong ke harga baris baru (Review Focus 1)", async () => {
    await setPromo(world.productId, { kind: "PERSEN", value: 10 });
    const id = await draft();
    const product = await lineOf(id, `${SLUG} Serum C`);
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: product.id, quantity: 1, unitPrice: 150_000, priceNote: "" }));
    expect((await lineOf(id, `${SLUG} Serum C`)).discountAmount).toBe(15_000);

    actor.role = "ADMIN_KEUANGAN";
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 90_000, reason: "Uji" }));
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: service.id, quantity: 1, unitPrice: 50_000, priceNote: "" }));
    expect(await lineOf(id, "Layanan Diskon")).toMatchObject({ discountAmount: 50_000, discountSource: "MANUAL" });
  });

  it("Segarkan harga katalog memasang dan melepas promo, diskon manual tetap", async () => {
    const id = await draft();
    await setPromo(world.productId, { kind: "PERSEN", value: 20 });
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 5_000, reason: "Uji" }));
    await unwrap(refreshCatalogPrices({ invoiceId: id, version: await versionOf(id) }));
    expect((await lineOf(id, `${SLUG} Serum C`)).discountAmount).toBe(60_000);
    await setPromo(world.productId, null);
    await unwrap(refreshCatalogPrices({ invoiceId: id, version: await versionOf(id) }));
    expect(await lineOf(id, `${SLUG} Serum C`)).toMatchObject({ discountAmount: 0, discountSource: null });
    expect((await lineOf(id, "Layanan Diskon")).discountAmount).toBe(5_000);
  });
});

describe("diskon manual dan batas gabungan 20%", () => {
  it("resepsionis: manual + diskon tagihan sampai 20% dari kotor; lewat 20% ditolak", async () => {
    const id = await draft(); // kotor 400.000 → batas 80.000
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 50_000, reason: "Uji" }));
    expect(await setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "NOMINAL", value: 30_001, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon di atas 20% diberikan oleh Admin Keuangan.",
    });
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "NOMINAL", value: 30_000, reason: "x" }));
    const product = await lineOf(id, `${SLUG} Serum C`);
    expect(await setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: product.id, kind: "NOMINAL", value: 1, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon di atas 20% diberikan oleh Admin Keuangan.",
    });
  });

  it("promo tidak dihitung dalam batas (Review Focus 2)", async () => {
    await setPromo(world.productId, { kind: "PERSEN", value: 50 }); // promo 150.000
    const id = await draft();
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "PERSEN", value: 20, reason: "x" }));
    // subtotal bersih 250.000 → diskon tagihan 50.000 ≤ batas 80.000
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice).toMatchObject({ discountKind: "PERSEN", discountValue: 20 });
  });

  it("Admin Keuangan boleh di atas 20%", async () => {
    actor.role = "ADMIN_KEUANGAN";
    const id = await draft();
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "PERSEN", value: 100, reason: "Gratis" }));
    expect((await lineOf(id, "Layanan Diskon")).discountAmount).toBe(100_000);
  });

  it("menghapus diskon baris; galat bentuk; versi usang ditolak", async () => {
    const id = await draft();
    const service = await lineOf(id, "Layanan Diskon");
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 10_000, reason: "Uji" }));
    await unwrap(clearLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id }));
    expect(await lineOf(id, "Layanan Diskon")).toMatchObject({ discountAmount: 0, discountSource: null, discountReason: null });
    expect(await setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: service.id, kind: "NOMINAL", value: 100_001, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon tidak boleh melebihi harga baris.",
    });
    expect(await setLineDiscount({ invoiceId: id, version: 1, lineId: service.id, kind: "NOMINAL", value: 1, reason: "x" })).toEqual({
      ok: false,
      error: "Tagihan ini baru diubah orang lain. Muat ulang halaman.",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.update", entityId: id, summary: { startsWith: "Diskon baris" } } });
    expect(audit.summary).toBe("Diskon baris Layanan Diskon: Rp 10.000 (Uji)");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/invoice-line-discount.test.ts`
Expected: FAIL (`setLineDiscount` tidak diekspor).

- [ ] **Step 3: Implementasi**

`src/server/dispensing-store.ts`:
- `HandedLine` bertambah `discountAmount: number; discountReason: string | null; discountSource: "PROMO" | null;`.
- `handedInvoiceLines`: pemilih barang menjadi `select: { id: true, sellPrice: true, promoName: true, promoKind: true, promoValue: true, promoStartsOn: true, promoEndsOn: true }`, peta menyimpan seluruh baris barang, dan setiap baris:

```ts
  const today = witaDateString(new Date());
  return dispensing.lines.map((line) => {
    const item = items.get(line.itemId);
    const unitPrice = item?.sellPrice;
    if (unitPrice === null || unitPrice === undefined) throw new UserFacingError(`Harga jual ${line.itemName} belum diisi.`);
    const promo = promoDiscount(item!, { quantity: line.quantity, unitPrice }, today);
    return {
      kind: "BARANG" as const,
      name: line.itemName,
      quantity: line.quantity,
      unitPrice,
      serviceId: null,
      encounterTreatmentId: null,
      itemId: line.itemId,
      dispensingLineId: line.id,
      discountAmount: promo?.amount ?? 0,
      discountReason: promo?.reason ?? null,
      discountSource: promo ? ("PROMO" as const) : null,
    };
  });
```

  (impor `promoDiscount` dari `@/lib/stock-promo`, `witaDateString` dari `@/lib/time`; ganti nama peta `prices` → `items`).

`src/server/invoice-drafts.ts`:
- impor tambahan: `validateLineDiscount, invoiceGrossSubtotal, manualItemDiscount, type DiscountKindValue` dari `@/lib/invoice`; `promoDiscount` dari `@/lib/stock-promo`; `witaDateString` dari `@/lib/time`; `formatRupiah` dari `@/lib/format`.
- konstanta: `const PROMO_SELECT = { promoName: true, promoKind: true, promoValue: true, promoStartsOn: true, promoEndsOn: true } as const;` dan `const OVER_LIMIT = "Diskon di atas 20% diberikan oleh Admin Keuangan.";`
- `addInvoiceItem`: `select` barang ditambah `...PROMO_SELECT`; di `create` tambahkan:

```ts
        const promo = promoDiscount(item, { quantity: checked.value.quantity, unitPrice: item.sellPrice! }, witaDateString(new Date()));
        // …data: { …, discountAmount: promo?.amount ?? 0, discountReason: promo?.reason ?? null, discountSource: promo ? "PROMO" : null }
```

- `updateInvoiceLine`: `select` baris ditambah `discountAmount: true, discountReason: true, discountSource: true`; data update dihitung:

```ts
      const gross = checked.value.quantity * checked.value.unitPrice;
      let discount: { discountAmount: number; discountReason: string | null; discountSource: "PROMO" | "MANUAL" | null } = {
        discountAmount: Math.min(line.discountAmount, gross),
        discountReason: line.discountReason,
        discountSource: line.discountSource,
      };
      if (line.discountSource === "PROMO" && line.itemId) {
        const item = await tx.stockItem.findUnique({ where: { id: line.itemId }, select: PROMO_SELECT });
        const promo = item ? promoDiscount(item, checked.value, witaDateString(new Date())) : null;
        discount = promo ? { discountAmount: promo.amount, discountReason: promo.reason, discountSource: "PROMO" } : { discountAmount: 0, discountReason: null, discountSource: null };
      }
      if (discount.discountAmount === 0) discount = { discountAmount: 0, discountReason: null, discountSource: null };
      // …data: { quantity, unitPrice, priceNote, ...discount }
```

- `refreshCatalogPrices`: pemilih baris ditambah `quantity: true, discountAmount: true, discountSource: true`; untuk baris barang ambil `select: { sellPrice: true, ...PROMO_SELECT }`; setelah menentukan `price`:

```ts
          const unitPrice = price ?? line.unitPrice;
          let discount = {};
          if (line.itemId && line.discountSource !== "MANUAL") {
            const promo = item ? promoDiscount(item, { quantity: line.quantity, unitPrice }, today) : null;
            const next = promo ? { discountAmount: promo.amount, discountReason: promo.reason, discountSource: "PROMO" as const } : { discountAmount: 0, discountReason: null, discountSource: null };
            if (next.discountAmount !== line.discountAmount) discount = next;
          }
          const priceChanged = price !== null && price !== line.unitPrice;
          if (!priceChanged && Object.keys(discount).length === 0) continue;
          await tx.invoiceLine.update({ where: { id: line.id }, data: { ...(priceChanged ? { unitPrice: price, priceNote: null } : {}), ...discount } });
          updated += 1;
```

  (baris MANUAL yang harganya turun: diskon dipotong `Math.min(line.discountAmount, line.quantity * unitPrice)` dalam data update yang sama; `today = witaDateString(new Date())` sekali di awal).
- `setInvoiceDiscount`: baca baris dengan `discountAmount, discountSource`, lalu `validateDiscount(input, { subtotal: invoiceSubtotal(lines), grossSubtotal: invoiceGrossSubtotal(lines), otherLimited: manualItemDiscount(lines), canExceed })`.
- aksi baru:

```ts
/** Diskon manual satu baris draf (spec perbaikan tagihan 5.2); batas gabungan 20% dijaga guardDiscount. */
export async function setLineDiscount(input: {
  invoiceId: string;
  version: number;
  lineId: string;
  kind: DiscountKindValue;
  value: number;
  reason: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({ where: { id: String(input.lineId ?? ""), invoiceId }, select: { id: true, name: true, quantity: true, unitPrice: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      const checked = validateLineDiscount(input, { gross: line.quantity * line.unitPrice });
      if (!checked.ok) throw new UserFacingError(checked.message);
      await guardDiscount(
        tx,
        invoiceId,
        can(actor.role, "invoice:correct"),
        async () => {
          await tx.invoiceLine.update({ where: { id: line.id }, data: { discountAmount: checked.value.amount, discountReason: checked.value.reason, discountSource: "MANUAL" } });
        },
        OVER_LIMIT,
      );
      return { version, summary: `Diskon baris ${line.name}: ${formatRupiah(checked.value.amount)} (${checked.value.reason})` };
    });
    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

export async function clearLineDiscount(input: { invoiceId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({ where: { id: String(input.lineId ?? ""), invoiceId }, select: { id: true, name: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.update({ where: { id: line.id }, data: { discountAmount: 0, discountReason: null, discountSource: null } });
      });
      return { version, summary: `Hapus diskon baris ${line.name}` };
    });
    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}
```

`src/server/invoice-payments.ts` (`applyFinalDiscount`): `validateDiscount(input, { subtotal, canExceed: true })` tetap; `subtotal` kini bersih karena `TOTALS_SELECT` memuat `discountAmount` — tidak ada perubahan kode selain memastikan `invoiceSubtotal(invoice.lines)` menerima baris dengan `discountAmount`.

- [ ] **Step 4: Jalankan, pastikan lulus; uji tagihan lama tetap hijau**

Run: `npm run test:integration -- tests/integration/invoice-line-discount.test.ts tests/integration/invoice-draft.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/invoice-payments.test.ts tests/integration/dispensing-invoice.test.ts tests/integration/invoice-create.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Mutasi — promo masuk batas (Review Focus 2)**

Ubah sementara `manualItemDiscount` agar menjumlah semua diskon baris (tanpa syarat `MANUAL`). Run uji integrasi baru. Expected: FAIL pada "promo tidak dihitung dalam batas". Kembalikan; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/invoice-drafts.ts src/server/dispensing-store.ts src/server/invoice-payments.ts tests/integration/invoice-line-discount.test.ts
git commit -m "feat: automatic item promos and manual line discounts on draft invoices"
```

---

### Task 6: Detail tagihan, struk, dan laporan memakai diskon baris

**Files:**
- Modify: `src/server/invoice-read.ts` (`InvoiceLineRow`, `getInvoiceDetail`)
- Modify: `src/lib/receipt.ts`, `src/server/receipt-store.ts`, `src/lib/receipt-escpos.ts`, `src/components/receipt/receipt-paper.tsx`, `tests/fixtures/receipt.ts`
- Modify: `src/server/report-sql.ts`
- Test: `tests/unit/receipt.test.ts`, `tests/unit/receipt-escpos.test.ts`, `tests/unit/components/receipt-paper.test.tsx`, `tests/integration/report-line-discount.test.ts`

**Interfaces:**
- Consumes: Task 2 `lineGross`, `lineAmount`, `invoiceTotals` (dengan `grossSubtotal`, `itemDiscount`).
- Produces:
  - `InvoiceLineRow` bertambah `gross: number; discountAmount: number; discountReason: string | null; discountSource: "PROMO" | "MANUAL" | null` (`amount` = jumlah setelah diskon).
  - `ReceiptLine = { name; quantity; unitPrice; gross: number; discount: number; amount: number }` (`amount` bersih); `PublicReceipt` bertambah `itemDiscount: number` dan `subtotal` = kotor.

- [ ] **Step 1: Uji yang gagal**

`tests/fixtures/receipt.ts`: ubah baris menjadi `lines: [{ name: "Paket Lux", quantity: 2, unitPrice: 750_000, gross: 1_500_000, discount: 0, amount: 1_500_000 }]` dan tambahkan `itemDiscount: 0,` setelah `subtotal`.

Tambahkan ke `tests/unit/receipt.test.ts` (di `describe("buildPublicReceipt")`):

```ts
  it("diskon baris: jumlah bersih per baris, subtotal kotor, dan diskon item", () => {
    const receipt = buildPublicReceipt(
      source({
        lines: [
          { name: "Serum", quantity: 2, unitPrice: 150_000, discountAmount: 30_000 },
          { name: "Facial", quantity: 1, unitPrice: 100_000, discountAmount: 0 },
        ],
        discountKind: "PERSEN",
        discountValue: 5,
        payments: [],
      }),
    )!;
    expect(receipt.lines[0]).toEqual({ name: "Serum", quantity: 2, unitPrice: 150_000, gross: 300_000, discount: 30_000, amount: 270_000 });
    expect(receipt).toMatchObject({ subtotal: 400_000, itemDiscount: 30_000, discount: 18_500, total: 351_500 });
  });
```

dan perbarui harapan `toEqual` uji pertama di berkas itu: setiap baris memakai bentuk baru (`gross`, `discount: 0`, `amount`) dan objek memuat `itemDiscount: 0`. `ReceiptSource.lines` kini boleh memuat `discountAmount?: number`.

Tambahkan ke `tests/unit/receipt-escpos.test.ts`:

```ts
  it("baris berdiskon mencetak Diskon di bawah baris, dan Diskon item di ringkasan", () => {
    const text = printedLines(
      buildEscPosReceipt({ ...RECEIPT, lines: [{ name: "Serum", quantity: 2, unitPrice: 150_000, gross: 300_000, discount: 30_000, amount: 270_000 }], itemDiscount: 30_000 }, 58),
    ).join("\n");
    expect(text).toMatch(/Diskon\s+-Rp 30\.000/);
    expect(text).toMatch(/Diskon item\s+-Rp 30\.000/);
  });
```

(Perbarui fixture lokal `RECEIPT` di berkas itu agar setiap baris memuat `gross` dan `discount: 0`, dan objek memuat `itemDiscount: 0`.)

Tambahkan ke `tests/unit/components/receipt-paper.test.tsx`:

```tsx
  it("baris berdiskon menampilkan potongan dan ringkasan diskon item", () => {
    render(<ReceiptPaper receipt={{ ...RECEIPT, lines: [{ ...RECEIPT.lines[0], discount: 100_000, amount: 1_400_000 }], itemDiscount: 100_000 }} />);
    const paper = screen.getByRole("region", { name: "Struk TG-2026-0123" });
    expect(paper).toHaveTextContent("Diskon item-Rp 100.000");
    expect(within(paper).getByRole("list", { name: "Item" })).toHaveTextContent("Diskon-Rp 100.000");
  });
```

`tests/integration/report-line-discount.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { invoiceTotals } from "@/lib/invoice";
import { invoiceAggregates } from "@/server/report-sql";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "laporan-diskon";
const WA = "6281200009503";
let world: BillingWorld;
const at = new Date("2031-05-10T03:00:00Z");

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      status: "FINAL",
      number: "TG-2031-9001",
      finalizedAt: at,
      finalizedByName: "Uji",
      discountKind: "PERSEN",
      discountValue: 5,
      lines: {
        create: [
          { kind: "BARANG", name: "Serum", quantity: 2, unitPrice: 150_000, discountAmount: 30_000, discountReason: "Promo: Uji", discountSource: "PROMO" },
          { kind: "LAYANAN", name: "Facial", quantity: 1, unitPrice: 100_000, discountAmount: 10_000, discountReason: "Uji", discountSource: "MANUAL" },
        ],
      },
      payments: { create: [{ amount: 100_000, method: "TUNAI", paidAt: new Date("2031-05-10T00:00:00Z"), staffId: "s", staffName: "Uji" }] },
    },
  });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("laporan dengan diskon baris (Review Focus 5)", () => {
  it("per jenis kotor, diskon = item + tagihan, pendapatan bersih = total tagihan, sisa benar", async () => {
    const [row] = await invoiceAggregates(new Date("2031-05-01T00:00:00Z"), new Date("2031-06-01T00:00:00Z"), world.branchId, false);
    expect(row).toMatchObject({ goods: 300_000, service: 100_000, discount: 40_000 + 18_000, outstanding: 342_000 - 100_000, invoiceCount: 1 });
    const total = invoiceTotals({
      status: "FINAL",
      discountKind: "PERSEN",
      discountValue: 5,
      lines: [
        { quantity: 2, unitPrice: 150_000, discountAmount: 30_000 },
        { quantity: 1, unitPrice: 100_000, discountAmount: 10_000 },
      ],
      payments: [],
    }).total;
    expect(row.goods + row.service + row.treatment - row.discount).toBe(total);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/receipt.test.ts tests/unit/receipt-escpos.test.ts tests/unit/components/receipt-paper.test.tsx && npm run test:integration -- tests/integration/report-line-discount.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

`src/server/invoice-read.ts`:
- `InvoiceLineRow` bertambah empat kolom di atas; pemilih baris di `getInvoiceDetail` ditambah `discountAmount: true, discountReason: true, discountSource: true`; pemetaan:

```ts
    gross: line.quantity * line.unitPrice,
    amount: line.quantity * line.unitPrice - line.discountAmount,
    discountAmount: line.discountAmount,
    discountReason: line.discountReason,
    discountSource: line.discountSource,
```

- `invoiceTotals({… lines: invoice.lines …})` sudah menerima `discountAmount`.

`src/lib/receipt.ts`:
- `ReceiptLine = { name: string; quantity: number; unitPrice: number; gross: number; discount: number; amount: number }`; `PublicReceipt` bertambah `itemDiscount: number`; `ReceiptSource.lines` menjadi `readonly { name: string; quantity: number; unitPrice: number; discountAmount?: number }[]`.
- di `buildPublicReceipt`:

```ts
    lines: source.lines.map((line) => {
      const gross = line.quantity * line.unitPrice;
      const discount = line.discountAmount ?? 0;
      return { name: line.name, quantity: line.quantity, unitPrice: line.unitPrice, gross, discount, amount: gross - discount };
    }),
    subtotal: totals.grossSubtotal,
    itemDiscount: totals.itemDiscount,
```

`src/server/receipt-store.ts`: pemilih baris ditambah `discountAmount: true`.

`src/lib/receipt-escpos.ts`: di perulangan baris ganti baris jumlah dengan:

```ts
    row(`${line.quantity} x ${formatRupiah(line.unitPrice)}`, formatRupiah(line.gross));
    if (line.discount > 0) row("  Diskon", `-${formatRupiah(line.discount)}`);
```

dan setelah `row("Subtotal", …)`: `if (receipt.itemDiscount > 0) row("Diskon item", `-${formatRupiah(receipt.itemDiscount)}`);`.

`src/components/receipt/receipt-paper.tsx`: di dalam `<li>` setelah baris `qty x harga` (yang kini memakai `line.gross`):

```tsx
            {line.discount > 0 && <Row left="Diskon" right={`-${formatRupiah(line.discount)}`} />}
```

dan setelah baris Subtotal: `{receipt.itemDiscount > 0 && <Row left="Diskon item" right={`-${formatRupiah(receipt.itemDiscount)}`} />}`.

`src/server/report-sql.ts` — CTE `lines` dan `m`:

```sql
    lines AS (
      SELECT l."invoiceId",
             COALESCE(SUM(l."quantity" * l."unitPrice") FILTER (WHERE l."kind" = 'LAYANAN'), 0) AS service,
             COALESCE(SUM(l."quantity" * l."unitPrice") FILTER (WHERE l."kind" = 'TREATMENT'), 0) AS treatment,
             COALESCE(SUM(l."quantity" * l."unitPrice") FILTER (WHERE l."kind" = 'BARANG'), 0) AS goods,
             COALESCE(SUM(l."discountAmount"), 0) AS "itemDiscount",
             COALESCE(SUM(l."quantity" * l."unitPrice" - l."discountAmount"), 0) AS subtotal
      FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId"
      GROUP BY l."invoiceId"
    ),
```

dan di `m`, kolom `discount` menjadi `COALESCE(lines."itemDiscount", 0) + CASE … END AS discount` (CASE yang ada tetap memakai `lines.subtotal`, yang kini bersih), serta `outstanding` memakai `GREATEST(0, m.subtotal - (m.discount - m.item) - m.paid)` — untuk itu tambahkan `COALESCE(lines."itemDiscount", 0) AS item` di `m` dan ubah `outstanding` menjadi `COALESCE(SUM(GREATEST(0, m.subtotal - (m.discount - m.item) - m.paid)), 0)`. Perbarui komentar fungsi: "Per jenis kotor; diskon = diskon baris + diskon tagihan (keputusan perencana 1)".

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/receipt.test.ts tests/unit/receipt-escpos.test.ts tests/unit/components/receipt-paper.test.tsx tests/unit/components/receipt-entry.test.tsx && npm run test:integration -- tests/integration/report-line-discount.test.ts tests/integration/receipt.test.ts tests/integration/report.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS (nama berkas uji laporan yang ada: cari dengan `ls tests/integration | grep -i report`; jalankan semuanya).

- [ ] **Step 5: Mutasi — diskon terhitung dua kali (Review Focus 5)**

Ubah sementara CTE `lines` agar `goods` memakai `quantity * unitPrice - discountAmount`. Run uji laporan baru. Expected: FAIL pada persamaan pendapatan bersih. Kembalikan; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/invoice-read.ts src/lib/receipt.ts src/server/receipt-store.ts src/lib/receipt-escpos.ts src/components/receipt/receipt-paper.tsx tests/fixtures/receipt.ts tests/unit/receipt.test.ts tests/unit/receipt-escpos.test.ts tests/unit/components/receipt-paper.test.tsx src/server/report-sql.ts tests/integration/report-line-discount.test.ts
git commit -m "feat: show line discounts on invoices, receipts, and revenue reports"
```

---

### Task 7: Catatan internal tagihan

**Files:**
- Create: `src/server/invoice-notes.ts`, `src/components/admin/billing/invoice-notes-form.tsx`
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`, `src/components/admin/billing/invoice-final-view.tsx`, `src/app/(admin)/admin/tagihan/[id]/page.tsx`
- Test: `tests/integration/invoice-notes.test.ts`, `tests/unit/components/invoice-notes-form.test.tsx`

**Interfaces:**
- Produces: `updateInvoiceNotes(input: { invoiceId: string; notes: string }): Promise<ActionResult<void>>`; `InvoiceNotesForm({ invoiceId, notes, canEdit })`; konstanta `INVOICE_NOTES_MAX = 500` (di `src/lib/invoice.ts`).

- [ ] **Step 1: Uji yang gagal**

`tests/integration/invoice-notes.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { updateInvoiceNotes } from "@/server/invoice-notes";
import { getPublicReceipt } from "@/server/receipt-public";
import { getReceiptMessage } from "@/server/receipt";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Uji Catatan", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/server/request-guard", () => ({ guardRate: vi.fn().mockResolvedValue(undefined), clientIp: vi.fn().mockResolvedValue("127.0.0.1") }));

const SLUG = "catatan-tagihan";
const WA = "6281200009504";
let world: BillingWorld;
let invoiceId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  actor.role = "RESEPSIONIS";
  invoiceId = (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("catatan internal tagihan", () => {
  it("disimpan saat draf tanpa menaikkan versi draf, audit tanpa isi", async () => {
    const before = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
    await unwrap(updateInvoiceNotes({ invoiceId, notes: "  inject ke 1 L jam 10.00  " }));
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice).toMatchObject({ notes: "inject ke 1 L jam 10.00", version: before });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.notes", entityId: invoiceId } });
    expect(audit.summary).toBe("draf");
  });

  it("bisa diubah setelah final, juga oleh Admin Keuangan; kosong menghapus", async () => {
    const { version } = await unwrap(addFreeLine({ invoiceId, version: (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version, kind: "LAYANAN", name: "Catatan Uji", quantity: 1, unitPrice: 1000 }));
    await unwrap(finalizeInvoice({ invoiceId, version }));
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(updateInvoiceNotes({ invoiceId, notes: "rahasia internal" }));
    actor.role = "RESEPSIONIS";
    const code = /\/struk#(\S+)/.exec((await unwrap(getReceiptMessage(invoiceId))).text)![1];
    expect(JSON.stringify(await unwrap(getPublicReceipt(code)))).not.toContain("rahasia internal");
    await unwrap(updateInvoiceNotes({ invoiceId, notes: "" }));
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).notes).toBeNull();
  });

  it("lebih dari 500 karakter ditolak; peran tanpa hak ditolak", async () => {
    expect(await updateInvoiceNotes({ invoiceId, notes: "a".repeat(501) })).toEqual({ ok: false, error: "Catatan paling banyak 500 karakter." });
    actor.role = "APOTEKER";
    await expect(updateInvoiceNotes({ invoiceId, notes: "x" })).rejects.toThrow("forbidden: invoice:read");
  });
});
```

`tests/unit/components/invoice-notes-form.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceNotesForm } from "@/components/admin/billing/invoice-notes-form";
import { updateInvoiceNotes } from "@/server/invoice-notes";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-notes", () => ({ updateInvoiceNotes: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

describe("InvoiceNotesForm", () => {
  it("menyimpan catatan internal", async () => {
    vi.mocked(updateInvoiceNotes).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<InvoiceNotesForm invoiceId="inv1" notes={null} canEdit />);
    expect(screen.getByText("Hanya terlihat staf; tidak ikut struk.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Catatan internal"), "inject ke 1 L");
    await user.click(screen.getByRole("button", { name: "Simpan catatan" }));
    await waitFor(() => expect(updateInvoiceNotes).toHaveBeenCalledWith({ invoiceId: "inv1", notes: "inject ke 1 L" }));
  });

  it("tanpa hak: hanya dibaca", () => {
    renderAdmin(<InvoiceNotesForm invoiceId="inv1" notes="catatan lama" canEdit={false} />);
    expect(screen.getByText("catatan lama")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan catatan" })).not.toBeInTheDocument();
  });

  it("galat server tampil", async () => {
    vi.mocked(updateInvoiceNotes).mockResolvedValue({ ok: false, error: "Catatan paling banyak 500 karakter." });
    const user = userEvent.setup();
    renderAdmin(<InvoiceNotesForm invoiceId="inv1" notes={null} canEdit />);
    await user.type(screen.getByLabelText("Catatan internal"), "x");
    await user.click(screen.getByRole("button", { name: "Simpan catatan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Catatan paling banyak 500 karakter.");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/invoice-notes.test.ts && npx vitest run tests/unit/components/invoice-notes-form.test.tsx`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi**

`src/lib/invoice.ts`: `export const INVOICE_NOTES_MAX = 500;`

`src/server/invoice-notes.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { INVOICE_NOTES_MAX } from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Catatan internal tagihan (spec perbaikan tagihan 6): draf, final, atau dibatalkan. Tidak menaikkan versi draf,
 * tidak pernah ikut struk. Audit hanya mencatat nomor tagihan (atau "draf"), tanpa isi catatan.
 */
export async function updateInvoiceNotes(input: { invoiceId: string; notes: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:read");
    if (!can(actor.role, "invoice:manage") && !can(actor.role, "invoice:correct")) throw new UserFacingError("Anda tidak berhak mengubah catatan tagihan.");
    const notes = typeof input?.notes === "string" ? input.notes.trim() : "";
    if (notes.length > INVOICE_NOTES_MAX) throw new UserFacingError(`Catatan paling banyak ${INVOICE_NOTES_MAX} karakter.`);
    const invoice = await prisma.invoice.findUnique({ where: { id: String(input?.invoiceId ?? "") }, select: { id: true, number: true } });
    if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
    await prisma.invoice.update({ where: { id: invoice.id }, data: { notes: notes || null } });
    await recordAudit({ actor, action: "invoice.notes", entity: "Invoice", entityId: invoice.id, summary: invoice.number ?? "draf" });
    safeRevalidatePath(`/admin/tagihan/${invoice.id}`);
  });
}
```

`src/components/admin/billing/invoice-notes-form.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { INVOICE_NOTES_MAX } from "@/lib/invoice";
import { updateInvoiceNotes } from "@/server/invoice-notes";
import { SectionCard } from "../page-layout";

/** Catatan internal tagihan (spec perbaikan tagihan 6). */
export function InvoiceNotesForm({ invoiceId, notes, canEdit }: { invoiceId: string; notes: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateInvoiceNotes({ invoiceId, notes: value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Catatan disimpan.");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard title="Catatan internal" description="Hanya terlihat staf; tidak ikut struk.">
      {canEdit ? (
        <Stack spacing={1.5}>
          <TextField
            id="invoice-notes"
            label="Catatan internal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            helperText={`${value.trim().length}/${INVOICE_NOTES_MAX}`}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Box>
            <Button type="button" variant="outlined" disabled={pending || value.trim() === (notes ?? "")} onClick={save}>
              Simpan catatan
            </Button>
          </Box>
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: "pre-line", color: notes ? "text.primary" : "text.secondary" }}>
          {notes ?? "Belum ada catatan."}
        </Typography>
      )}
    </SectionCard>
  );
}
```

Pemasangan:
- `src/app/(admin)/admin/tagihan/[id]/page.tsx`: hitung `const canEditNotes = canManage || can(staff.role, "invoice:correct");` dan teruskan ke editor draf dan tampilan final sebagai prop `canEditNotes`.
- `invoice-draft-editor.tsx`: prop `canEditNotes?: boolean`; render `<InvoiceNotesForm invoiceId={detail.id} notes={detail.notes} canEdit={canEditNotes ?? true} />` tepat sebelum ringkasan tagihan.
- `invoice-final-view.tsx`: prop `canEditNotes?: boolean` (bawaan `false`); render `<InvoiceNotesForm …/>` setelah kartu Pembayaran, di dalam `Stack` yang sama (ikut `struk-tanpa-cetak`).
- `tests/unit/invoice-final-view.test.tsx` dan uji editor draf: tambahkan `vi.mock("@/server/invoice-notes", () => ({ updateInvoiceNotes: vi.fn() }));` bila komponennya kini mengimpor modul itu.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/invoice-notes.test.ts && npx vitest run tests/unit/components/invoice-notes-form.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/architecture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice.ts src/server/invoice-notes.ts src/components/admin/billing/invoice-notes-form.tsx src/components/admin/billing/invoice-draft-editor.tsx src/components/admin/billing/invoice-final-view.tsx "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/integration/invoice-notes.test.ts tests/unit/components/invoice-notes-form.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/invoice-draft-editor.test.tsx
git commit -m "feat: internal invoice notes"
```

---

### Task 8: Rekening klinik di Pengaturan

**Files:**
- Create: `src/lib/clinic-bank.ts`, `src/server/clinic-bank.ts`, `src/components/admin/clinic-bank-accounts.tsx`
- Modify: `src/app/(admin)/admin/pengaturan/page.tsx`
- Test: `tests/unit/clinic-bank.test.ts`, `tests/integration/clinic-bank.test.ts`, `tests/unit/components/clinic-bank-accounts.test.tsx`

**Interfaces:**
- Produces: `type ClinicBankAccountInput = { bankName: string; accountNumber: string; accountHolder: string }`; `validateClinicBankAccount(raw): Validation<ClinicBankAccountInput>`; `type ClinicBankAccountView = { id; bankName; accountNumber; accountHolder; isActive; sortOrder; label: string }`; aksi `listClinicBankAccounts(): Promise<ClinicBankAccountView[]>` (`content:manage`), `listActiveClinicBankAccounts(): Promise<ClinicBankAccountView[]>` (`invoice:read`), `createClinicBankAccount(input)`, `updateClinicBankAccount(id, input)`, `setClinicBankAccountActive(id, active)`, `moveClinicBankAccount(id, direction: "UP" | "DOWN")` (semua `content:manage`, kembali `ActionResult`).

- [ ] **Step 1: Uji yang gagal**

`tests/unit/clinic-bank.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateClinicBankAccount } from "@/lib/clinic-bank";

describe("validateClinicBankAccount", () => {
  it("membersihkan nomor dan teks", () => {
    expect(validateClinicBankAccount({ bankName: " BCA ", accountNumber: "123-456 7890", accountHolder: " PT SunDY " })).toEqual({
      ok: true,
      value: { bankName: "BCA", accountNumber: "1234567890", accountHolder: "PT SunDY" },
    });
  });

  it("menolak isian kosong, nomor tidak sah, dan teks terlalu panjang", () => {
    expect(validateClinicBankAccount({ bankName: "", accountNumber: "12345", accountHolder: "x" })).toEqual({ ok: false, message: "Isi nama bank." });
    expect(validateClinicBankAccount({ bankName: "BCA", accountNumber: "1234", accountHolder: "x" })).toEqual({ ok: false, message: "Nomor rekening 5–20 angka." });
    expect(validateClinicBankAccount({ bankName: "BCA", accountNumber: "12ab45", accountHolder: "x" })).toEqual({ ok: false, message: "Nomor rekening 5–20 angka." });
    expect(validateClinicBankAccount({ bankName: "BCA", accountNumber: "12345", accountHolder: "" })).toEqual({ ok: false, message: "Isi nama pemilik rekening." });
    expect(validateClinicBankAccount({ bankName: "a".repeat(81), accountNumber: "12345", accountHolder: "x" }).ok).toBe(false);
    expect(validateClinicBankAccount(null).ok).toBe(false);
  });
});
```

`tests/integration/clinic-bank.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createClinicBankAccount,
  listActiveClinicBankAccounts,
  listClinicBankAccounts,
  moveClinicBankAccount,
  setClinicBankAccountActive,
  updateClinicBankAccount,
} from "@/server/clinic-bank";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Pemilik", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const MARK = "Bank Uji Rek";
const cleanup = () => prisma.clinicBankAccount.deleteMany({ where: { bankName: { startsWith: MARK } } });

beforeEach(async () => {
  actor.role = "SUPER_ADMIN";
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("rekening klinik", () => {
  it("tambah, ubah, nonaktifkan, urutkan; audit tercatat", async () => {
    const a = (await unwrap(createClinicBankAccount({ bankName: `${MARK} A`, accountNumber: "1111111", accountHolder: "SunDY" }))).id;
    const b = (await unwrap(createClinicBankAccount({ bankName: `${MARK} B`, accountNumber: "2222222", accountHolder: "SunDY" }))).id;
    await unwrap(updateClinicBankAccount(a, { bankName: `${MARK} A`, accountNumber: "1111112", accountHolder: "SunDY Clinic" }));
    await unwrap(moveClinicBankAccount(b, "UP"));
    const mine = (await listClinicBankAccounts()).filter((x) => x.bankName.startsWith(MARK));
    expect(mine.map((x) => x.id)).toEqual([b, a]);
    expect(mine[1]).toMatchObject({ accountNumber: "1111112", label: `${MARK} A 1111112 a.n. SunDY Clinic` });
    await unwrap(setClinicBankAccountActive(a, false));
    expect((await listActiveClinicBankAccounts()).some((x) => x.id === a)).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: a, action: { startsWith: "clinic-bank." } } })).toBe(3);
  });

  it("bank + nomor kembar di antara rekening aktif ditolak", async () => {
    await unwrap(createClinicBankAccount({ bankName: `${MARK} C`, accountNumber: "3333333", accountHolder: "SunDY" }));
    expect(await createClinicBankAccount({ bankName: `${MARK} C`, accountNumber: "333-3333", accountHolder: "Lain" })).toEqual({
      ok: false,
      error: "Rekening ini sudah ada.",
    });
  });

  it("hanya content:manage mengelola; invoice:read melihat yang aktif", async () => {
    actor.role = "RESEPSIONIS";
    await expect(createClinicBankAccount({ bankName: `${MARK} D`, accountNumber: "44444", accountHolder: "x" })).rejects.toThrow("forbidden: content:manage");
    expect(Array.isArray(await listActiveClinicBankAccounts())).toBe(true);
  });
});
```

`tests/unit/components/clinic-bank-accounts.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicBankAccounts } from "@/components/admin/clinic-bank-accounts";
import { createClinicBankAccount, setClinicBankAccountActive } from "@/server/clinic-bank";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/clinic-bank", () => ({
  createClinicBankAccount: vi.fn(),
  updateClinicBankAccount: vi.fn(),
  setClinicBankAccountActive: vi.fn(),
  moveClinicBankAccount: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ACCOUNTS = [
  { id: "a", bankName: "BCA", accountNumber: "1234567890", accountHolder: "SunDY", isActive: true, sortOrder: 0, label: "BCA 1234567890 a.n. SunDY" },
  { id: "b", bankName: "Mandiri", accountNumber: "9876543", accountHolder: "SunDY", isActive: false, sortOrder: 1, label: "Mandiri 9876543 a.n. SunDY" },
];

beforeEach(() => vi.clearAllMocks());

describe("ClinicBankAccounts", () => {
  it("menampilkan daftar dengan status", () => {
    renderAdmin(<ClinicBankAccounts accounts={ACCOUNTS} />);
    const list = screen.getByRole("list", { name: "Rekening klinik" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent("BCA 1234567890 a.n. SunDY");
    expect(list).toHaveTextContent("Nonaktif");
  });

  it("menambah rekening", async () => {
    vi.mocked(createClinicBankAccount).mockResolvedValue({ ok: true, data: { id: "c" } });
    const user = userEvent.setup();
    renderAdmin(<ClinicBankAccounts accounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "+ Rekening" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah rekening" });
    await user.type(within(dialog).getByLabelText("Nama bank"), "BRI");
    await user.type(within(dialog).getByLabelText("Nomor rekening"), "555666777");
    await user.type(within(dialog).getByLabelText("Nama pemilik"), "SunDY Clinic");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(createClinicBankAccount).toHaveBeenCalledWith({ bankName: "BRI", accountNumber: "555666777", accountHolder: "SunDY Clinic" }));
  });

  it("menonaktifkan rekening aktif", async () => {
    vi.mocked(setClinicBankAccountActive).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ClinicBankAccounts accounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "Nonaktifkan BCA 1234567890 a.n. SunDY" }));
    await waitFor(() => expect(setClinicBankAccountActive).toHaveBeenCalledWith("a", false));
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/clinic-bank.test.ts tests/unit/components/clinic-bank-accounts.test.tsx && npm run test:integration -- tests/integration/clinic-bank.test.ts`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi**

`src/lib/clinic-bank.ts`:

```ts
import type { Validation } from "./stock";

// Rekening klinik penerima transfer tagihan (spec perbaikan tagihan 7). Murni.

export type ClinicBankAccountInput = { bankName: string; accountNumber: string; accountHolder: string };

export function validateClinicBankAccount(raw: unknown): Validation<ClinicBankAccountInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." };
  const input = raw as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const bankName = text(input.bankName);
  const accountHolder = text(input.accountHolder);
  const accountNumber = text(input.accountNumber).replace(/[\s-]/g, "");
  if (!bankName) return { ok: false, message: "Isi nama bank." };
  if (bankName.length > 80) return { ok: false, message: "Nama bank paling banyak 80 karakter." };
  if (!/^\d{5,20}$/.test(accountNumber)) return { ok: false, message: "Nomor rekening 5–20 angka." };
  if (!accountHolder) return { ok: false, message: "Isi nama pemilik rekening." };
  if (accountHolder.length > 80) return { ok: false, message: "Nama pemilik paling banyak 80 karakter." };
  return { ok: true, value: { bankName, accountNumber, accountHolder } };
}
```

`src/server/clinic-bank.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { validateClinicBankAccount, type ClinicBankAccountInput } from "@/lib/clinic-bank";
import { prisma } from "@/lib/db";
import { formatBankAccount } from "@/lib/payment";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export type ClinicBankAccountView = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isActive: boolean;
  sortOrder: number;
  label: string;
};

const SELECT = { id: true, bankName: true, accountNumber: true, accountHolder: true, isActive: true, sortOrder: true } as const;
type Row = { id: string; bankName: string; accountNumber: string; accountHolder: string; isActive: boolean; sortOrder: number };

const view = (row: Row): ClinicBankAccountView => ({
  ...row,
  label: formatBankAccount({ bankName: row.bankName, bankAccountNumber: row.accountNumber, bankAccountHolder: row.accountHolder })!,
});
const ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

function revalidate() {
  safeRevalidatePath("/admin/pengaturan");
  safeRevalidatePath("/admin/tagihan");
}

async function assertUnique(input: ClinicBankAccountInput, exceptId?: string) {
  const twin = await prisma.clinicBankAccount.findFirst({
    where: { isActive: true, bankName: { equals: input.bankName, mode: "insensitive" }, accountNumber: input.accountNumber, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (twin) throw new UserFacingError("Rekening ini sudah ada.");
}

export async function listClinicBankAccounts(): Promise<ClinicBankAccountView[]> {
  await requireCapability("content:manage");
  return (await prisma.clinicBankAccount.findMany({ orderBy: ORDER, select: SELECT })).map(view);
}

/** Pilihan rekening tujuan di dialog pembayaran transfer. */
export async function listActiveClinicBankAccounts(): Promise<ClinicBankAccountView[]> {
  await requireCapability("invoice:read");
  return (await prisma.clinicBankAccount.findMany({ where: { isActive: true }, orderBy: ORDER, select: SELECT })).map(view);
}

export async function createClinicBankAccount(input: ClinicBankAccountInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    const checked = validateClinicBankAccount(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    await assertUnique(checked.value);
    const last = await prisma.clinicBankAccount.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.clinicBankAccount.create({ data: { ...checked.value, sortOrder: (last._max.sortOrder ?? -1) + 1 }, select: SELECT });
    await recordAudit({ actor, action: "clinic-bank.create", entity: "ClinicBankAccount", entityId: created.id, summary: view(created).label });
    revalidate();
    return { id: created.id };
  });
}

export async function updateClinicBankAccount(id: string, input: ClinicBankAccountInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    const checked = validateClinicBankAccount(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const existing = await prisma.clinicBankAccount.findUnique({ where: { id: String(id ?? "") }, select: { id: true } });
    if (!existing) throw new UserFacingError("Rekening tidak ditemukan.");
    await assertUnique(checked.value, existing.id);
    const updated = await prisma.clinicBankAccount.update({ where: { id: existing.id }, data: checked.value, select: SELECT });
    await recordAudit({ actor, action: "clinic-bank.update", entity: "ClinicBankAccount", entityId: updated.id, summary: view(updated).label });
    revalidate();
  });
}

export async function setClinicBankAccountActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    const existing = await prisma.clinicBankAccount.findUnique({ where: { id: String(id ?? "") }, select: SELECT });
    if (!existing) throw new UserFacingError("Rekening tidak ditemukan.");
    if (active) await assertUnique(existing, existing.id);
    await prisma.clinicBankAccount.update({ where: { id: existing.id }, data: { isActive: active === true } });
    await recordAudit({ actor, action: active ? "clinic-bank.activate" : "clinic-bank.deactivate", entity: "ClinicBankAccount", entityId: existing.id, summary: view(existing).label });
    revalidate();
  });
}

export async function moveClinicBankAccount(id: string, direction: "UP" | "DOWN"): Promise<ActionResult<void>> {
  return runAction(async () => {
    await requireCapability("content:manage");
    const rows = await prisma.clinicBankAccount.findMany({ orderBy: ORDER, select: { id: true } });
    const index = rows.findIndex((row) => row.id === id);
    const target = direction === "UP" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    await prisma.$transaction(rows.map((row, order) => prisma.clinicBankAccount.update({ where: { id: row.id }, data: { sortOrder: order } })));
    revalidate();
  });
}
```

`src/components/admin/clinic-bank-accounts.tsx`: kartu `SectionCard` berjudul **"Rekening klinik untuk pembayaran tagihan"** (deskripsi: "Dipilih resepsionis sebagai rekening tujuan saat mencatat transfer. Rekening untuk instruksi biaya booking tetap di kartu Rekening transfer."), tombol `+ Rekening` membuka dialog "Tambah rekening" (isian `Nama bank`, `Nomor rekening`, `Nama pemilik`, tombol `Simpan`, galat `Alert`), daftar `<ul aria-label="Rekening klinik">` berisi `label`, penanda `Nonaktif`, tombol `Ubah` (dialog "Ubah rekening" dengan isian sama), `Nonaktifkan {label}`/`Aktifkan {label}` (`aria-label` lengkap), dan `Naik`/`Turun`. Semua aksi memakai pola `startTransition` + `router.refresh()` + `toast` seperti `clinic-setting-form.tsx`; galat ditampilkan dengan `toast.error(result.error)`.

`src/app/(admin)/admin/pengaturan/page.tsx`: muat `const accounts = await listClinicBankAccounts();` dan render `<ClinicBankAccounts accounts={accounts} />` di bawah `<ClinicSettingForm … />`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/clinic-bank.test.ts tests/unit/components/clinic-bank-accounts.test.tsx tests/unit/architecture.test.ts && npm run test:integration -- tests/integration/clinic-bank.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clinic-bank.ts src/server/clinic-bank.ts src/components/admin/clinic-bank-accounts.tsx "src/app/(admin)/admin/pengaturan/page.tsx" tests/unit/clinic-bank.test.ts tests/unit/components/clinic-bank-accounts.test.tsx tests/integration/clinic-bank.test.ts
git commit -m "feat: manage clinic bank accounts in settings"
```

---

### Task 9: Rincian pembayaran transfer bank

**Files:**
- Modify: `src/lib/invoice.ts` (`InvoicePaymentInput`, `ValidInvoicePayment`, `validateInvoicePayment`)
- Modify: `src/server/invoice-payments.ts` (`recordInvoicePayment`)
- Modify: `src/server/invoice-read.ts` (`InvoicePaymentRow`)
- Modify: `src/components/admin/billing/invoice-payment-dialog.tsx`, `src/components/admin/billing/invoice-final-view.tsx`, `src/app/(admin)/admin/tagihan/[id]/page.tsx`
- Test: `tests/unit/invoice-transfer.test.ts`, `tests/integration/invoice-transfer.test.ts`, `tests/unit/components/invoice-payment-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 8 `listActiveClinicBankAccounts`, `ClinicBankAccountView`.
- Produces: `InvoicePaymentInput` bertambah `clinicBankAccountId?: string; senderBank?: string; senderAccountName?: string; senderAccountNumber?: string`; `ValidInvoicePayment` bertambah `transfer: { clinicBankAccountId: string; senderBank: string | null; senderAccountName: string | null; senderAccountNumber: string | null } | null`; `InvoicePaymentRow` bertambah `destinationLabel, senderBank, senderAccountName, senderAccountNumber` (semua `string | null`); `InvoicePaymentDialog` prop baru `bankAccounts: ClinicBankAccountView[]`.

- [ ] **Step 1: Uji yang gagal**

`tests/unit/invoice-transfer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateInvoicePayment } from "@/lib/invoice";

const ctx = { today: "2026-10-13", finalizedDate: "2026-10-12", limit: 500_000 };
const base = { invoiceId: "inv", amount: 100_000, paidAt: "2026-10-13", reference: "" };

describe("pembayaran transfer bank", () => {
  it("rekening tujuan wajib; isian pengirim opsional dan dirapikan", () => {
    expect(validateInvoicePayment({ ...base, method: "TRANSFER" }, ctx)).toEqual({ ok: false, message: "Pilih rekening tujuan." });
    const ok = validateInvoicePayment(
      { ...base, method: "TRANSFER", reference: " 2026101399 ", clinicBankAccountId: "acc", senderBank: " BRI ", senderAccountName: " Budi ", senderAccountNumber: " ****1234 " },
      ctx,
    );
    expect(ok).toEqual({
      ok: true,
      value: {
        invoiceId: "inv",
        amount: 100_000,
        method: "TRANSFER",
        paidAt: "2026-10-13",
        reference: "2026101399",
        transfer: { clinicBankAccountId: "acc", senderBank: "BRI", senderAccountName: "Budi", senderAccountNumber: "****1234" },
      },
    });
  });

  it("tunai dan QRIS mengabaikan isian transfer", () => {
    expect(validateInvoicePayment({ ...base, method: "TUNAI", clinicBankAccountId: "acc", senderBank: "BRI" }, ctx)).toMatchObject({ ok: true, value: { transfer: null } });
  });

  it("isian pengirim terlalu panjang atau nomor rekening berisi huruf ditolak", () => {
    expect(validateInvoicePayment({ ...base, method: "TRANSFER", clinicBankAccountId: "acc", senderBank: "a".repeat(81) }, ctx).ok).toBe(false);
    expect(validateInvoicePayment({ ...base, method: "TRANSFER", clinicBankAccountId: "acc", senderAccountNumber: "12ab" }, ctx)).toEqual({
      ok: false,
      message: "Nomor rekening pengirim hanya angka (boleh * untuk yang disamarkan).",
    });
  });
});
```

`tests/integration/invoice-transfer.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceDetail } from "@/server/invoice-read";
import { getReceiptMessage } from "@/server/receipt";
import { getPublicReceipt } from "@/server/receipt-public";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({ userId: "u", staffId: "s", name: "Resepsionis Transfer", role: "SUPER_ADMIN", email: "u@uji.test" }),
}));
vi.mock("@/server/request-guard", () => ({ guardRate: vi.fn().mockResolvedValue(undefined), clientIp: vi.fn().mockResolvedValue("127.0.0.1") }));

const SLUG = "transfer-tagihan";
const WA = "6281200009505";
const today = witaDateString(new Date());
let world: BillingWorld;
let invoiceId: string;
let accountId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  accountId = (await prisma.clinicBankAccount.create({ data: { bankName: "BCA Transfer Uji", accountNumber: "1234567890", accountHolder: "SunDY Clinic" } })).id;
  invoiceId = (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;
  const { version } = await unwrap(addFreeLine({ invoiceId, version: 1, kind: "LAYANAN", name: "Layanan Transfer", quantity: 1, unitPrice: 300_000 }));
  await unwrap(finalizeInvoice({ invoiceId, version }));
});
afterAll(async () => {
  await prisma.invoicePayment.deleteMany({ where: { invoiceId } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.clinicBankAccount.deleteMany({ where: { bankName: "BCA Transfer Uji" } });
  await prisma.$disconnect();
});

describe("transfer bank", () => {
  it("menyimpan rekening tujuan, salinan labelnya, dan data pengirim", async () => {
    await unwrap(
      recordInvoicePayment({ invoiceId, amount: 100_000, method: "TRANSFER", paidAt: today, reference: "REF-1", clinicBankAccountId: accountId, senderBank: "BRI", senderAccountName: "Budi", senderAccountNumber: "****1234" }),
    );
    const payment = await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId, reference: "REF-1" } });
    expect(payment).toMatchObject({ clinicBankAccountId: accountId, destinationLabel: "BCA Transfer Uji 1234567890 a.n. SunDY Clinic", senderBank: "BRI", senderAccountName: "Budi", senderAccountNumber: "****1234" });
    expect((await getInvoiceDetail(invoiceId))!.payments[0]).toMatchObject({ destinationLabel: "BCA Transfer Uji 1234567890 a.n. SunDY Clinic", senderBank: "BRI" });
  });

  it("salinan tidak berubah setelah rekening diedit (Review Focus 3)", async () => {
    await prisma.clinicBankAccount.update({ where: { id: accountId }, data: { accountHolder: "Nama Baru" } });
    expect((await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId, reference: "REF-1" } })).destinationLabel).toContain("SunDY Clinic");
  });

  it("tanpa rekening tujuan, rekening nonaktif, atau tidak ada ditolak", async () => {
    const base = { invoiceId, amount: 1000, method: "TRANSFER" as const, paidAt: today, reference: "" };
    expect(await recordInvoicePayment(base)).toEqual({ ok: false, error: "Pilih rekening tujuan." });
    expect(await recordInvoicePayment({ ...base, clinicBankAccountId: "tidak-ada" })).toEqual({ ok: false, error: "Rekening tujuan tidak ditemukan." });
    await prisma.clinicBankAccount.update({ where: { id: accountId }, data: { isActive: false } });
    expect(await recordInvoicePayment({ ...base, clinicBankAccountId: accountId })).toEqual({ ok: false, error: "Rekening tujuan tidak aktif." });
    await prisma.clinicBankAccount.update({ where: { id: accountId }, data: { isActive: true } });
  });

  it("data rekening pengirim tidak ada di struk publik maupun audit", async () => {
    const code = /\/struk#(\S+)/.exec((await unwrap(getReceiptMessage(invoiceId))).text)![1];
    const json = JSON.stringify(await unwrap(getPublicReceipt(code)));
    for (const secret of ["****1234", "Budi", "BRI"]) expect(json).not.toContain(secret);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice-payment.create" }, orderBy: { createdAt: "desc" } });
    expect(audit.summary).not.toContain("****1234");
  });
});
```

`tests/unit/components/invoice-payment-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicePaymentDialog } from "@/components/admin/billing/invoice-payment-dialog";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-payments", () => ({ recordInvoicePayment: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ACCOUNTS = [
  { id: "a", bankName: "BCA", accountNumber: "123", accountHolder: "SunDY", isActive: true, sortOrder: 0, label: "BCA 123 a.n. SunDY" },
  { id: "b", bankName: "BRI", accountNumber: "456", accountHolder: "SunDY", isActive: true, sortOrder: 1, label: "BRI 456 a.n. SunDY" },
];

function open(bankAccounts = ACCOUNTS) {
  renderAdmin(<InvoicePaymentDialog invoiceId="inv1" limit={300_000} finalizedDate="2026-10-12" today="2026-10-13" bankAccounts={bankAccounts} />);
}

beforeEach(() => vi.clearAllMocks());

describe("InvoicePaymentDialog transfer", () => {
  it("isian transfer hanya muncul untuk Transfer bank, dan terkirim lengkap", async () => {
    vi.mocked(recordInvoicePayment).mockResolvedValue({ ok: true, data: { id: "p1" } });
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pembayaran" });
    expect(within(dialog).queryByLabelText("Rekening tujuan")).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Metode"), "TRANSFER");
    await user.selectOptions(within(dialog).getByLabelText("Rekening tujuan"), "b");
    await user.type(within(dialog).getByLabelText("Bank pengirim (opsional)"), "Mandiri");
    await user.type(within(dialog).getByLabelText("Nama pemilik rekening pengirim (opsional)"), "Budi");
    await user.type(within(dialog).getByLabelText("Nomor rekening pengirim (opsional)"), "****9876");
    await user.type(within(dialog).getByLabelText("Nomor referensi (opsional)"), "REF9");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(recordInvoicePayment).toHaveBeenCalledWith(
        expect.objectContaining({ method: "TRANSFER", clinicBankAccountId: "b", senderBank: "Mandiri", senderAccountName: "Budi", senderAccountNumber: "****9876", reference: "REF9" }),
      ),
    );
  });

  it("satu rekening: sudah terpilih; tanpa rekening: pesan dan tidak bisa disimpan", async () => {
    const user = userEvent.setup();
    open([ACCOUNTS[0]]);
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pembayaran" });
    await user.selectOptions(within(dialog).getByLabelText("Metode"), "TRANSFER");
    expect(within(dialog).getByLabelText("Rekening tujuan")).toHaveValue("a");
  });

  it("tanpa rekening klinik aktif: Transfer bank tidak bisa disimpan", async () => {
    const user = userEvent.setup();
    open([]);
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pembayaran" });
    await user.selectOptions(within(dialog).getByLabelText("Metode"), "TRANSFER");
    expect(within(dialog).getByText("Belum ada rekening klinik. Tambahkan di Pengaturan.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/invoice-transfer.test.ts tests/unit/components/invoice-payment-dialog.test.tsx && npm run test:integration -- tests/integration/invoice-transfer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

`src/lib/invoice.ts` — ganti tipe dan `validateInvoicePayment`:

```ts
export type InvoicePaymentInput = {
  invoiceId: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  reference: string;
  /** Hanya untuk TRANSFER (spec perbaikan tagihan 8). */
  clinicBankAccountId?: string;
  senderBank?: string;
  senderAccountName?: string;
  senderAccountNumber?: string;
};
export type PaymentTransfer = { clinicBankAccountId: string; senderBank: string | null; senderAccountName: string | null; senderAccountNumber: string | null };
export type ValidInvoicePayment = Omit<InvoicePaymentInput, "reference" | "clinicBankAccountId" | "senderBank" | "senderAccountName" | "senderAccountNumber"> & {
  reference: string | null;
  transfer: PaymentTransfer | null;
};
```

  Di dalam `validateInvoicePayment`, sebelum `return`:

```ts
  let transfer: PaymentTransfer | null = null;
  if (raw.method === "TRANSFER") {
    if (typeof raw.clinicBankAccountId !== "string" || !raw.clinicBankAccountId) return fail("Pilih rekening tujuan.");
    const senderBank = cleanText(raw.senderBank);
    const senderAccountName = cleanText(raw.senderAccountName);
    const senderAccountNumber = cleanText(raw.senderAccountNumber);
    if (senderBank === null || senderAccountName === null || senderAccountNumber === null) return fail(INVALID_FORM);
    if (senderBank.length > 80 || senderAccountName.length > 80) return fail("Isian pengirim paling banyak 80 karakter.");
    if (senderAccountNumber && !/^[\d*\s-]{3,30}$/.test(senderAccountNumber)) return fail("Nomor rekening pengirim hanya angka (boleh * untuk yang disamarkan).");
    transfer = { clinicBankAccountId: raw.clinicBankAccountId, senderBank: senderBank || null, senderAccountName: senderAccountName || null, senderAccountNumber: senderAccountNumber || null };
  }
```

  dan objek `value` kembalian bertambah `transfer`. Batas referensi tetap 100 karakter, labelnya di layar menjadi "Nomor referensi (opsional)".

`src/server/invoice-payments.ts` (`recordInvoicePayment`), setelah `const payment = checked.value;`:

```ts
      let destination: { clinicBankAccountId: string; destinationLabel: string } | null = null;
      if (payment.transfer) {
        const account = await tx.clinicBankAccount.findUnique({ where: { id: payment.transfer.clinicBankAccountId } });
        if (!account) throw new UserFacingError("Rekening tujuan tidak ditemukan.");
        if (!account.isActive) throw new UserFacingError("Rekening tujuan tidak aktif.");
        destination = {
          clinicBankAccountId: account.id,
          destinationLabel: formatBankAccount({ bankName: account.bankName, bankAccountNumber: account.accountNumber, bankAccountHolder: account.accountHolder })!,
        };
      }
```

  dan data `create` ditambah `...(destination ?? {}), senderBank: payment.transfer?.senderBank ?? null, senderAccountName: payment.transfer?.senderAccountName ?? null, senderAccountNumber: payment.transfer?.senderAccountNumber ?? null`. (impor `formatBankAccount` dari `@/lib/payment`.) Ringkasan audit tidak berubah.

`src/server/invoice-read.ts`: `InvoicePaymentRow` bertambah empat kolom; pemetaan pembayaran menyalin `destinationLabel`, `senderBank`, `senderAccountName`, `senderAccountNumber`.

`src/components/admin/billing/invoice-payment-dialog.tsx`:
- prop `bankAccounts: ClinicBankAccountView[]` (impor tipe dari `@/server/clinic-bank`).
- state `accountId` (awal: `bankAccounts.length === 1 ? bankAccounts[0].id : ""`), `senderBank`, `senderAccountName`, `senderAccountNumber`.
- label isian referensi menjadi **"Nomor referensi (opsional)"**.
- bila `method === "TRANSFER"`: bila `bankAccounts.length === 0` tampilkan `<Alert severity="warning">Belum ada rekening klinik. Tambahkan di Pengaturan.</Alert>` dan nonaktifkan Simpan; selain itu `SelectField` `id="inv-payment-account"` label **"Rekening tujuan"** dengan opsi kosong "Pilih rekening" dan setiap `label`, lalu tiga `TextField`: **"Bank pengirim (opsional)"**, **"Nama pemilik rekening pengirim (opsional)"**, **"Nomor rekening pengirim (opsional)"** (`inputMode: "numeric"` tidak dipakai karena `*` diizinkan).
- `input` yang dikirim menyertakan `clinicBankAccountId: accountId, senderBank, senderAccountName, senderAccountNumber` hanya bila `method === "TRANSFER"`.

`src/components/admin/billing/invoice-final-view.tsx`:
- prop baru `bankAccounts?: ClinicBankAccountView[]` (bawaan `[]`), diteruskan ke `InvoicePaymentDialog`.
- di setiap baris pembayaran, setelah `payment.reference`, tambahkan bila `payment.destinationLabel`:

```tsx
                      {payment.destinationLabel && (
                        <Box component="span" sx={{ display: "block", fontSize: "0.75rem" }}>
                          Ke {payment.destinationLabel}
                          {(payment.senderBank || payment.senderAccountName || payment.senderAccountNumber) &&
                            ` · Dari ${[payment.senderBank, payment.senderAccountNumber, payment.senderAccountName && `a.n. ${payment.senderAccountName}`].filter(Boolean).join(" ")}`}
                        </Box>
                      )}
```

  dan `{payment.reference && ` · Ref. ${payment.reference}`}` menggantikan tampilan referensi lama.
- `src/app/(admin)/admin/tagihan/[id]/page.tsx`: untuk tagihan final muat `const bankAccounts = canManage ? await listActiveClinicBankAccounts() : [];` dan teruskan ke `InvoiceFinalView`.
- `tests/unit/invoice-final-view.test.tsx`: fixture pembayaran ditambah `destinationLabel: null, senderBank: null, senderAccountName: null, senderAccountNumber: null`; uji dialog pembayaran yang ada mengirim `bankAccounts={[]}`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/invoice-transfer.test.ts tests/unit/components/invoice-payment-dialog.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/invoice.test.ts && npm run test:integration -- tests/integration/invoice-transfer.test.ts tests/integration/invoice-payments.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS.

- [ ] **Step 5: Mutasi — rekening nonaktif (Review Focus 3)**

Hapus sementara `if (!account.isActive) …`. Expected: FAIL pada "tanpa rekening tujuan, rekening nonaktif…". Kembalikan; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoice.ts src/server/invoice-payments.ts src/server/invoice-read.ts src/components/admin/billing/invoice-payment-dialog.tsx src/components/admin/billing/invoice-final-view.tsx "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/unit/invoice-transfer.test.ts tests/unit/components/invoice-payment-dialog.test.tsx tests/unit/invoice-final-view.test.tsx tests/integration/invoice-transfer.test.ts
git commit -m "feat: record bank transfer details with a clinic destination account"
```

---

### Task 10: Layar diskon baris di editor draf dan tagihan final

**Files:**
- Create: `src/components/admin/billing/line-discount-dialog.tsx`
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`, `src/components/admin/billing/invoice-final-view.tsx`, `src/components/admin/billing/discount-form.tsx`
- Test: `tests/unit/components/line-discount-dialog.test.tsx`, `tests/unit/invoice-draft-editor.test.tsx`

**Interfaces:**
- Consumes: Task 5 `setLineDiscount`, `clearLineDiscount`; Task 6 `InvoiceLineRow` (gross, discountAmount, discountReason, discountSource); Task 2 `validateLineDiscount`, `InvoiceTotals` (grossSubtotal, itemDiscount).
- Produces: `LineDiscountDialog({ invoiceId, version, line, disabled })`; helper tampilan `LineDiscountNote({ line })` (di berkas yang sama).

- [ ] **Step 1: Uji yang gagal** — `tests/unit/components/line-discount-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LineDiscountDialog, LineDiscountNote } from "@/components/admin/billing/line-discount-dialog";
import { clearLineDiscount, setLineDiscount } from "@/server/invoice-drafts";
import type { InvoiceLineRow } from "@/server/invoice-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ setLineDiscount: vi.fn(), clearLineDiscount: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const LINE: InvoiceLineRow = {
  id: "l1",
  kind: "BARANG",
  name: "Serum C",
  quantity: 2,
  unitPrice: 150_000,
  gross: 300_000,
  amount: 300_000,
  discountAmount: 0,
  discountReason: null,
  discountSource: null,
  priceNote: null,
  serviceId: null,
  itemId: "i1",
  catalogLinked: true,
  fromDispensing: false,
  cost: null,
};

beforeEach(() => vi.clearAllMocks());

describe("LineDiscountDialog", () => {
  it("persen: pratinjau rupiah, lalu dikirim dengan alasan", async () => {
    vi.mocked(setLineDiscount).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    renderAdmin(<LineDiscountDialog invoiceId="inv" version={2} line={LINE} />);
    await user.click(screen.getByRole("button", { name: "Diskon Serum C" }));
    const dialog = await screen.findByRole("dialog", { name: "Diskon Serum C" });
    await user.selectOptions(within(dialog).getByLabelText("Jenis diskon"), "PERSEN");
    await user.type(within(dialog).getByLabelText("Persen"), "15");
    expect(dialog).toHaveTextContent("Potongan Rp 45.000 dari Rp 300.000");
    await user.type(within(dialog).getByLabelText("Alasan"), "Kemasan penyok");
    await user.click(within(dialog).getByRole("button", { name: "Terapkan" }));
    await waitFor(() => expect(setLineDiscount).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", kind: "PERSEN", value: 15, reason: "Kemasan penyok" }));
  });

  it("validasi di layar: melebihi harga baris dan alasan kosong", async () => {
    const user = userEvent.setup();
    renderAdmin(<LineDiscountDialog invoiceId="inv" version={2} line={LINE} />);
    await user.click(screen.getByRole("button", { name: "Diskon Serum C" }));
    const dialog = await screen.findByRole("dialog", { name: "Diskon Serum C" });
    await user.type(within(dialog).getByLabelText("Nominal"), "300001");
    await user.type(within(dialog).getByLabelText("Alasan"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Terapkan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Diskon tidak boleh melebihi harga baris.");
    expect(setLineDiscount).not.toHaveBeenCalled();
  });

  it("galat batas dari server tampil; Hapus diskon untuk baris berdiskon", async () => {
    vi.mocked(setLineDiscount).mockResolvedValue({ ok: false, error: "Diskon di atas 20% diberikan oleh Admin Keuangan." });
    vi.mocked(clearLineDiscount).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const discounted = { ...LINE, discountAmount: 30_000, amount: 270_000, discountReason: "Promo: Oktober", discountSource: "PROMO" as const };
    renderAdmin(<LineDiscountDialog invoiceId="inv" version={2} line={discounted} />);
    await user.click(screen.getByRole("button", { name: "Diskon Serum C" }));
    const dialog = await screen.findByRole("dialog", { name: "Diskon Serum C" });
    expect(dialog).toHaveTextContent("Sekarang: promo Rp 30.000 (Promo: Oktober). Mengubahnya menjadikan diskon manual.");
    await user.type(within(dialog).getByLabelText("Nominal"), "1000");
    await user.type(within(dialog).getByLabelText("Alasan"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Terapkan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Diskon di atas 20% diberikan oleh Admin Keuangan.");
    await user.click(within(dialog).getByRole("button", { name: "Hapus diskon" }));
    await waitFor(() => expect(clearLineDiscount).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1" }));
  });
});

describe("LineDiscountNote", () => {
  it("promo dan manual dibedakan", () => {
    const { rerender } = renderAdmin(<LineDiscountNote line={{ ...LINE, discountAmount: 30_000, discountReason: "Promo: Oktober", discountSource: "PROMO" }} />);
    expect(screen.getByText("Promo")).toBeInTheDocument();
    expect(screen.getByText(/Diskon −Rp 30\.000 · Promo: Oktober/)).toBeInTheDocument();
    rerender(<LineDiscountNote line={{ ...LINE, discountAmount: 5_000, discountReason: "Pelanggan lama", discountSource: "MANUAL" }} />);
    expect(screen.queryByText("Promo")).not.toBeInTheDocument();
    expect(screen.getByText(/Diskon −Rp 5\.000 · Pelanggan lama/)).toBeInTheDocument();
  });
});
```

Tambahkan ke `tests/unit/invoice-draft-editor.test.tsx` (ikuti fixture yang ada; tambahkan kolom baru ke setiap baris fixture: `gross`, `discountAmount: 0`, `discountReason: null`, `discountSource: null`, dan ke `totals`: `grossSubtotal`, `itemDiscount: 0`; tambahkan `setLineDiscount: vi.fn(), clearLineDiscount: vi.fn()` ke mock `@/server/invoice-drafts`):

```tsx
  it("ringkasan memisahkan Diskon item dan Diskon tagihan; setiap baris punya tombol Diskon", () => {
    // pakai fixture dengan satu baris berdiskon manual Rp10.000 dan totals { grossSubtotal: 100_000, itemDiscount: 10_000, subtotal: 90_000, discount: 0, total: 90_000 }
    const summary = screen.getByRole("region", { name: "Ringkasan tagihan" });
    expect(summary).toHaveTextContent("SubtotalRp 100.000");
    expect(summary).toHaveTextContent("Diskon item-Rp 10.000");
    expect(screen.getAllByRole("button", { name: /^Diskon / }).length).toBeGreaterThan(0);
  });
```

(Tulis render fixture di uji ini sesuai pola uji lain di berkas yang sama.)

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/line-discount-dialog.test.tsx tests/unit/invoice-draft-editor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementasi** — `src/components/admin/billing/line-discount-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { validateLineDiscount, type DiscountKindValue } from "@/lib/invoice";
import { clearLineDiscount, setLineDiscount } from "@/server/invoice-drafts";
import type { InvoiceLineRow } from "@/server/invoice-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

type LineView = Pick<InvoiceLineRow, "id" | "name" | "gross" | "discountAmount" | "discountReason" | "discountSource">;

/** "Diskon −Rp30.000 · Promo: Oktober" di bawah nama baris (spec perbaikan tagihan 5.3). */
export function LineDiscountNote({ line }: { line: LineView }) {
  if (line.discountAmount <= 0) return null;
  return (
    <Typography variant="caption" component="div" sx={{ color: "success.main", display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
      {line.discountSource === "PROMO" && <Chip label="Promo" size="small" color="success" variant="outlined" />}
      Diskon −{formatRupiah(line.discountAmount)} · {line.discountReason}
    </Typography>
  );
}

/** Diskon manual satu baris draf (spec perbaikan tagihan 5.2). */
export function LineDiscountDialog({ invoiceId, version, line, disabled = false }: { invoiceId: string; version: number; line: LineView; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DiscountKindValue>("NOMINAL");
  const [nominal, setNominal] = useState<number | null>(null);
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const value = kind === "NOMINAL" ? (nominal ?? Number.NaN) : Number(percent || Number.NaN);
  const preview = kind === "PERSEN" && Number.isInteger(value) && value > 0 ? Math.floor((line.gross * value) / 100) : null;

  function reset() {
    setKind("NOMINAL");
    setNominal(null);
    setPercent("");
    setReason("");
    setError(null);
  }

  function run(action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, success: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(success);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  function apply() {
    const input = { kind, value, reason };
    const checked = validateLineDiscount(input, { gross: line.gross });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    run(() => setLineDiscount({ invoiceId, version, lineId: line.id, ...input }), "Diskon baris disimpan.");
  }

  return (
    <>
      <Button
        type="button"
        size="small"
        variant="text"
        disabled={disabled}
        aria-label={`Diskon ${line.name}`}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Diskon
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Diskon {line.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Harga baris {formatRupiah(line.gross)}.
            {line.discountAmount > 0 &&
              (line.discountSource === "PROMO"
                ? ` Sekarang: promo ${formatRupiah(line.discountAmount)} (${line.discountReason}). Mengubahnya menjadikan diskon manual.`
                : ` Sekarang: ${formatRupiah(line.discountAmount)} (${line.discountReason}).`)}
          </DialogContentText>
          <Stack spacing={2}>
            <SelectField id={`line-discount-kind-${line.id}`} label="Jenis diskon" value={kind} onChange={(next) => setKind(next as DiscountKindValue)}>
              <option value="NOMINAL">Nominal untuk seluruh baris</option>
              <option value="PERSEN">Persen</option>
            </SelectField>
            {kind === "NOMINAL" ? (
              <RupiahInput id={`line-discount-nominal-${line.id}`} label="Nominal" value={nominal} onChange={setNominal} fullWidth />
            ) : (
              <TextField id={`line-discount-percent-${line.id}`} label="Persen" type="number" value={percent} onChange={(e) => setPercent(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 100 } }} fullWidth />
            )}
            {preview !== null && (
              <Typography variant="body2">
                Potongan {formatRupiah(preview)} dari {formatRupiah(line.gross)}
              </Typography>
            )}
            <TextField id={`line-discount-reason-${line.id}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {line.discountAmount > 0 && (
            <Box sx={{ mr: "auto" }}>
              <Button type="button" color="error" disabled={pending} onClick={() => run(() => clearLineDiscount({ invoiceId, version, lineId: line.id }), "Diskon baris dihapus.")}>
                Hapus diskon
              </Button>
            </Box>
          )}
          <Button type="button" variant="contained" disabled={pending} onClick={apply}>
            Terapkan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`invoice-draft-editor.tsx`:
- impor `LineDiscountDialog, LineDiscountNote`.
- di `LineRow`, setelah keterangan jenis baris: `<LineDiscountNote line={line} />`; di kolom aksi sebelum Simpan: `<LineDiscountDialog invoiceId={detail.id} version={detail.version} line={line} disabled={disabled} />`.
- kolom "Jumlah harga" menampilkan `formatRupiah(line.amount)` dan, bila `line.discountAmount > 0`, di atasnya `formatRupiah(line.gross)` bercoret (`Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.secondary" }}`).
- ringkasan: `Subtotal` = `totals.grossSubtotal`; baris **"Diskon item"** (`-{formatRupiah(totals.itemDiscount)}`) bila > 0; baris "Diskon" (diskon tagihan) tetap; Total tetap.

`discount-form.tsx`: `validateDiscount(input, { subtotal: detail.totals.subtotal, grossSubtotal: detail.totals.grossSubtotal, otherLimited: manualItemDiscount(detail.lines), canExceed })` (impor `manualItemDiscount`), dan teks bantuan menjadi "Diskon item manual ditambah diskon tagihan di atas 20% dari subtotal hanya bisa diberikan Admin Keuangan."

`invoice-final-view.tsx`: di tabel baris tambahkan `<LineDiscountNote line={line} />` di bawah keterangan jenis, kolom jumlah sama dengan editor (kotor bercoret bila berdiskon); ringkasan sama dengan editor (Subtotal kotor, Diskon item, Diskon, Total, Dibayar, Sisa).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/line-discount-dialog.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/billing/line-discount-dialog.tsx src/components/admin/billing/invoice-draft-editor.tsx src/components/admin/billing/invoice-final-view.tsx src/components/admin/billing/discount-form.tsx tests/unit/components/line-discount-dialog.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx
git commit -m "feat: line discount dialog and discount breakdown on invoices"
```

---

### Task 11: Layar harga & promo barang

**Files:**
- Create: `src/components/admin/stock/stock-price-dialog.tsx`
- Modify: `src/components/admin/stock/stock-item-dialog.tsx` (prop `canSetPrice`), `src/components/admin/stock/stock-item-table.tsx` (penanda harga belum diisi dan promo), `src/app/(admin)/admin/stok/page.tsx`, `src/app/(admin)/admin/stok/barang/[id]/page.tsx`
- Test: `tests/unit/components/stock-price-dialog.test.tsx`, `tests/unit/components/stock-item-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 4 `setStockItemPrice`, `price:manage`; Task 3 `PromoInput`, `promoLabel`.
- Produces: `StockPriceDialog({ itemId, itemName, sellPrice, promo: PromoFields })`; `StockItemDialog` prop `canSetPrice?: boolean` (bawaan `false`).

- [ ] **Step 1: Uji yang gagal** — `tests/unit/components/stock-price-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockPriceDialog } from "@/components/admin/stock/stock-price-dialog";
import { setStockItemPrice } from "@/server/stock-catalog";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/stock-catalog", () => ({ setStockItemPrice: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NO_PROMO = { promoName: null, promoKind: null, promoValue: 0, promoStartsOn: null, promoEndsOn: null };

beforeEach(() => vi.clearAllMocks());

describe("StockPriceDialog", () => {
  it("mengisi harga jual dan promo persen bertanggal", async () => {
    vi.mocked(setStockItemPrice).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<StockPriceDialog itemId="i1" itemName="Serum C" sellPrice={null} promo={NO_PROMO} />);
    await user.click(screen.getByRole("button", { name: "Harga & promo" }));
    const dialog = await screen.findByRole("dialog", { name: "Harga & promo Serum C" });
    await user.type(within(dialog).getByLabelText("Harga jual"), "150000");
    await user.selectOptions(within(dialog).getByLabelText("Promo"), "PERSEN");
    await user.type(within(dialog).getByLabelText("Nama promo"), "Promo Oktober");
    await user.type(within(dialog).getByLabelText("Persen promo"), "10");
    setDateField("Mulai", "2026-10-01", within(dialog));
    setDateField("Selesai", "2026-10-31", within(dialog));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(setStockItemPrice).toHaveBeenCalledWith({
        itemId: "i1",
        sellPrice: 150_000,
        promo: { name: "Promo Oktober", kind: "PERSEN", value: 10, startsOn: "2026-10-01", endsOn: "2026-10-31" },
      }),
    );
  });

  it("tanpa promo: isian promo tersembunyi dan dikirim kosong", async () => {
    vi.mocked(setStockItemPrice).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<StockPriceDialog itemId="i1" itemName="Serum C" sellPrice={150_000} promo={{ ...NO_PROMO, promoName: "Lama", promoKind: "NOMINAL", promoValue: 5000 }} />);
    await user.click(screen.getByRole("button", { name: "Harga & promo" }));
    const dialog = await screen.findByRole("dialog", { name: "Harga & promo Serum C" });
    await user.selectOptions(within(dialog).getByLabelText("Promo"), "");
    expect(within(dialog).queryByLabelText("Nama promo")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(setStockItemPrice).toHaveBeenCalledWith({ itemId: "i1", sellPrice: 150_000, promo: { name: "", kind: null, value: 0, startsOn: "", endsOn: "" } }));
  });

  it("galat server tampil", async () => {
    vi.mocked(setStockItemPrice).mockResolvedValue({ ok: false, error: "Isi nama promo." });
    const user = userEvent.setup();
    renderAdmin(<StockPriceDialog itemId="i1" itemName="Serum C" sellPrice={1000} promo={NO_PROMO} />);
    await user.click(screen.getByRole("button", { name: "Harga & promo" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Harga & promo Serum C" })).getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Isi nama promo.");
  });
});
```

Di `tests/unit/components/stock-item-dialog.test.tsx`: uji yang mengisi "Harga jual" merender `StockItemDialog` dengan `canSetPrice`; tambahkan uji:

```tsx
  it("tanpa hak harga (Apoteker): isian harga jual tidak ada", async () => {
    const user = userEvent.setup();
    renderAdmin(<StockItemDialog triggerLabel="+ Barang" />);
    await user.click(screen.getByRole("button", { name: "+ Barang" }));
    expect(screen.queryByLabelText("Harga jual")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/stock-price-dialog.test.tsx tests/unit/components/stock-item-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

`src/components/admin/stock/stock-price-dialog.tsx`: tombol **"Harga & promo"** membuka dialog **"Harga & promo {itemName}"** berisi:
- `RupiahInput` **"Harga jual"** (kosong = belum dijual);
- `SelectField` **"Promo"**: `""` "Tanpa promo", `PERSEN` "Persen", `NOMINAL` "Nominal per unit";
- bila promo dipilih: `TextField` **"Nama promo"**, `TextField type=number` **"Persen promo"** atau `RupiahInput` **"Nominal per unit"**, `DateField` **"Mulai"** dan **"Selesai"** (opsional);
- `Alert` galat dan tombol **"Simpan"** yang memanggil `setStockItemPrice({ itemId, sellPrice, promo: { name, kind: kind || null, value, startsOn, endsOn } })` — tanpa promo kirim `{ name: "", kind: null, value: 0, startsOn: "", endsOn: "" }`; sukses: `toast.success("Harga & promo disimpan.")`, tutup, `router.refresh()`.
Nilai awal dari prop (`promo.promoStartsOn` → `dateOnlyString`).

`stock-item-dialog.tsx`: prop `canSetPrice?: boolean`; isian `RupiahInput "Harga jual"` hanya dirender bila `canSetPrice`.

`stock-item-table.tsx`: kolom harga jual menampilkan "Belum diisi" (warna `warning.main`) untuk `null`, dan di bawah harga `promoLabel(row)` bila ada (`Typography variant="caption"`).

`src/app/(admin)/admin/stok/page.tsx`: `const canSetPrice = can(staff.role, "price:manage");` dan `<StockItemDialog triggerLabel="+ Barang" canSetPrice={canSetPrice} />`.

`src/app/(admin)/admin/stok/barang/[id]/page.tsx`: `const canSetPrice = can(staff.role, "price:manage");`; deskripsi menambah `· promo {promoLabel(item) ?? "—"}`; `actions` menjadi `<>{canManage && <StockItemDialog … canSetPrice={canSetPrice} />}{canSetPrice && <StockPriceDialog itemId={item.id} itemName={item.name} sellPrice={item.sellPrice} promo={item} />}{canManage && <StockItemActiveButton … />}</>` (Admin Keuangan melihat "Harga & promo" walau tanpa `stock:manage`).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/stock-price-dialog.test.tsx tests/unit/components/stock-item-dialog.test.tsx tests/unit/components/stock-item-table.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS (bila `stock-item-table.test.tsx` tidak ada, lewati nama itu).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/stock/stock-price-dialog.tsx src/components/admin/stock/stock-item-dialog.tsx src/components/admin/stock/stock-item-table.tsx "src/app/(admin)/admin/stok/page.tsx" "src/app/(admin)/admin/stok/barang/[id]/page.tsx" tests/unit/components/stock-price-dialog.test.tsx tests/unit/components/stock-item-dialog.test.tsx
git commit -m "feat: price and promo dialog for finance on stock items"
```

---

### Task 12: E2E dan penyesuaian alur lama

**Files:**
- Create: `tests/e2e/helpers/harga.ts`, `tests/e2e/tagihan-diskon.spec.ts`
- Modify: `tests/e2e/stok-hutang.spec.ts`, `tests/e2e/resep.spec.ts`, `tests/e2e/tagihan.spec.ts`

**Interfaces:**
- Produces: `aturHargaJual(browser: Browser, itemName: string, price: string, promo?: { name: string; percent: string })`.

- [ ] **Step 1: Helper** — `tests/e2e/helpers/harga.ts`:

```ts
import { expect, type Browser } from "@playwright/test";
import { E2E_KEUANGAN } from "../credentials";
import { E2E_BASE_URL } from "../test-env";
import { tungguHidrasi } from "./mui";
import { signIn } from "./quiz";

/** Harga jual (dan promo opsional) diisi Admin Keuangan di konteks terpisah (spec perbaikan tagihan T9). */
export async function aturHargaJual(browser: Browser, itemName: string, price: string, promo?: { name: string; percent: string }): Promise<void> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await context.newPage();
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/stok");
  await tungguHidrasi(page);
  await page.getByRole("link", { name: itemName, exact: true }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Harga & promo" }).click();
  const dialog = page.getByRole("dialog", { name: `Harga & promo ${itemName}` });
  await dialog.getByLabel("Harga jual").fill(price);
  if (promo) {
    await dialog.getByLabel("Promo").selectOption("PERSEN");
    await dialog.getByLabel("Nama promo").fill(promo.name);
    await dialog.getByLabel("Persen promo").fill(promo.percent);
  }
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await context.close();
}
```

- [ ] **Step 2: Sesuaikan tiga spec lama**

Di `tests/e2e/stok-hutang.spec.ts`, `tests/e2e/resep.spec.ts`, `tests/e2e/tagihan.spec.ts`: hapus baris `await itemDialog.getByLabel("Harga jual").fill("…");`; tambahkan `browser` ke argumen uji yang bersangkutan (`async ({ page, browser }, testInfo) =>`); setelah `await expect(itemDialog).toBeHidden(...)` tambahkan `await aturHargaJual(browser, itemName, "<harga yang sama dengan sebelumnya>");` (stok-hutang `"2000"`, resep `"3000"`, tagihan `"25000"`), dan impor `import { aturHargaJual } from "./helpers/harga";`. Pastikan variabel nama barang di tiap spec dipakai sebagai `itemName`.

- [ ] **Step 3: Spec baru** — `tests/e2e/tagihan-diskon.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_ADMIN, E2E_APOTEKER, E2E_RESEPSIONIS } from "./credentials";
import { aturHargaJual } from "./helpers/harga";
import { isiTanggal, pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

test.setTimeout(240_000);

test("promo barang, diskon baris dalam batas 20%, catatan, dan transfer ke rekening klinik", async ({ page, browser }, testInfo) => {
  const t = `${testInfo.project.name === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;
  const itemName = `Serum Diskon ${t}`;

  // Super Admin menambah rekening klinik.
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/pengaturan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Rekening" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Tambah rekening" });
  await accountDialog.getByLabel("Nama bank").fill(`Bank E2E ${t}`);
  await accountDialog.getByLabel("Nomor rekening").fill(`9${Date.now().toString().slice(-8)}`);
  await accountDialog.getByLabel("Nama pemilik").fill("SunDY Clinic");
  await accountDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(accountDialog).toBeHidden({ timeout: 30_000 });

  // Apoteker menambah barang tanpa harga dan mencatat stok.
  const apoteker = await browser.newContext();
  const ap = await apoteker.newPage();
  await signIn(ap, E2E_APOTEKER);
  await ap.goto("/admin/stok");
  await ap.getByRole("button", { name: "+ Barang" }).click();
  const itemDialog = ap.getByRole("dialog", { name: "Tambah barang" });
  await expect(itemDialog.getByLabel("Harga jual")).toHaveCount(0);
  await itemDialog.getByLabel("Kode").fill(`E2E-${t}-SRM`);
  await itemDialog.getByLabel("Nama", { exact: true }).fill(itemName);
  await itemDialog.getByLabel("Satuan").fill("botol");
  await itemDialog.getByLabel("Batas menipis").fill("1");
  await itemDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(itemDialog).toBeHidden({ timeout: 30_000 });
  await ap.goto("/admin/stok/masuk/baru");
  await ap.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplierDialog = ap.getByRole("dialog", { name: "Tambah supplier" });
  await supplierDialog.getByLabel("Nama supplier").fill(`Supplier Diskon ${t}`);
  await supplierDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(supplierDialog).toBeHidden({ timeout: 30_000 });
  await ap.getByLabel("Nomor faktur").fill(`DS-E2E-${t}`);
  await pilihOpsi(ap, "Barang baris 1", `${itemName} (E2E-${t}-SRM)`);
  await ap.getByLabel("Jumlah baris 1").fill("5");
  await ap.getByLabel("Harga beli baris 1").fill("50000");
  await ap.getByLabel("Batch baris 1").fill("B-1");
  await isiTanggal(ap, "Kedaluwarsa baris 1", "2030-12-31");
  await ap.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(ap).toHaveURL(/\/admin\/stok/, { timeout: 30_000 });
  await apoteker.close();

  // Admin Keuangan mengisi harga dan promo 10%.
  await aturHargaJual(browser, itemName, "150000", { name: "Promo E2E", percent: "10" });

  // Resepsionis menagih.
  const resep = await browser.newContext();
  const rp = await resep.newPage();
  await signIn(rp, E2E_RESEPSIONIS);
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const saleDialog = rp.getByRole("dialog", { name: "Penjualan langsung" });
  await saleDialog.getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(rp, { name: `Pelanggan Diskon ${t}`, whatsapp: `0813${Date.now().toString().slice(-8)}` });
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await rp.getByRole("button", { name: "+ Tambah barang" }).click();
  const addItem = rp.getByRole("dialog", { name: "Tambah barang" });
  await pilihOpsi(addItem, "Barang", `${itemName} (E2E-${t}-SRM) — sisa 5 botol`);
  await addItem.getByLabel("Jumlah").fill("2");
  await addItem.getByRole("button", { name: "Tambah" }).click();
  await expect(addItem).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByText(/Diskon −Rp 30\.000 · Promo: Promo E2E/)).toBeVisible({ timeout: 30_000 });

  await rp.getByRole("button", { name: "+ Baris layanan" }).click();
  const lineDialog = rp.getByRole("dialog", { name: "Tambah baris layanan" });
  await lineDialog.getByLabel("Nama", { exact: true }).fill("Facial Diskon");
  await lineDialog.getByLabel("Harga").fill("100000");
  await lineDialog.getByRole("button", { name: "Tambah" }).click();
  await expect(lineDialog).toBeHidden({ timeout: 30_000 });

  // Kotor 400.000 → batas 80.000. Manual 90.000 ditolak, 50.000 diterima.
  await rp.getByRole("button", { name: "Diskon Facial Diskon" }).click();
  const discount = rp.getByRole("dialog", { name: "Diskon Facial Diskon" });
  await discount.getByLabel("Nominal").fill("90000");
  await discount.getByLabel("Alasan").fill("Pelanggan lama");
  await discount.getByRole("button", { name: "Terapkan" }).click();
  await expect(discount.getByRole("alert")).toHaveText("Diskon di atas 20% diberikan oleh Admin Keuangan.");
  await discount.getByLabel("Nominal").fill("50000");
  await discount.getByRole("button", { name: "Terapkan" }).click();
  await expect(discount).toBeHidden({ timeout: 30_000 });
  const summary = rp.getByRole("region", { name: "Ringkasan tagihan" });
  await expect(summary).toContainText("Rp 320.000", { timeout: 30_000 });

  await rp.getByLabel("Catatan internal").fill("inject ke 1 L jam 10.00");
  await rp.getByRole("button", { name: "Simpan catatan" }).click();
  await expect(rp.getByText("Catatan disimpan.")).toBeVisible({ timeout: 30_000 });

  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  await rp.getByRole("region", { name: "Pembayaran" }).getByRole("button", { name: "Catat pembayaran" }).click();
  const pay = rp.getByRole("dialog", { name: "Catat pembayaran" });
  await pay.getByLabel("Metode").selectOption("TRANSFER");
  await pay.getByLabel("Rekening tujuan").selectOption({ label: new RegExp(`Bank E2E ${t}`) as unknown as string });
  await pay.getByLabel("Bank pengirim (opsional)").fill("BRI");
  await pay.getByLabel("Nomor referensi (opsional)").fill(`REF-${t}`);
  await pay.getByRole("button", { name: "Simpan" }).click();
  await expect(pay).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByRole("region", { name: "Pembayaran" })).toContainText(`Ke Bank E2E ${t}`, { timeout: 30_000 });
  await expect(rp.getByRole("region", { name: "Pembayaran" })).toContainText(`Ref. REF-${t}`);
  await resep.close();
});
```

Catatan: `selectOption({ label })` Playwright menerima string; bila RegExp tidak didukung, ambil teks opsi dengan `pay.getByLabel("Rekening tujuan").locator("option", { hasText: `Bank E2E ${t}` }).getAttribute("value")` lalu `selectOption(value)` (Ruling). Bila `stok-hutang.spec.ts` menamai tombol simpan barang masuk berbeda dari "Simpan barang masuk", salin nama tombol dari spec itu.

- [ ] **Step 4: Jalankan E2E**

Run (satu per satu, desktop lalu mobile):
```bash
npx playwright test tests/e2e/tagihan-diskon.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/stok-hutang.spec.ts tests/e2e/resep.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/struk.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/tagihan-diskon.spec.ts tests/e2e/stok-hutang.spec.ts tests/e2e/resep.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/struk.spec.ts --project=mobile --workers=1
```
Expected: PASS. Setelah itu, sebelum suite integrasi penuh, hapus tagihan sisa E2E di basis data uji (Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/harga.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/stok-hutang.spec.ts tests/e2e/resep.spec.ts tests/e2e/tagihan.spec.ts
git commit -m "test: e2e for line discounts, promos, notes, and transfer details"
```

---

## Self-Review (hasil pemeriksaan penulis rencana)

**Cakupan spec:** §3 data → Task 1; §4 rumus → Task 2 (+ keputusan 2, 3); §5.1 promo otomatis → Task 3, 5; §5.2 diskon manual → Task 2, 5, 10; §5.3 tampilan → Task 10; §6 catatan → Task 7; §7 rekening → Task 8; §8 transfer → Task 9; §9 struk dan laporan → Task 6 (+ keputusan 1); §10 teknis → semua; §11 privasi → uji Task 7 dan 9; §12 pengujian → setiap tugas + Task 12; §12a harga Admin Keuangan → Task 4, 11, 12; §13 rilis → migrasi Task 1.

**Pindai placeholder:** instruksi bersyarat yang sengaja ada (label tanggal promo Task 3, uji `stock-catalog` Task 4, nama berkas uji laporan Task 6, `selectOption` RegExp dan nama tombol barang masuk Task 12) masing-masing memberi tindakan pasti dan kewajiban Ruling. Task 8 dan 11 memberi isi komponen sebagai daftar elemen dan label yang diuji (bukan kode utuh) karena polanya sama dengan komponen MUI yang ada (`clinic-setting-form.tsx`, `online-service-card.tsx`) dan ujinya sudah menetapkan label, peran, dan panggilan.

**Konsistensi tipe:** `TotalsLine`/`InvoiceTotals` (Task 2) dipakai Task 5, 6, 10; `PromoFields`/`PromoInput` (Task 3) dipakai Task 4, 5, 11; `InvoiceLineRow` baru (Task 6) dipakai Task 10; `ClinicBankAccountView` (Task 8) dipakai Task 9; `ValidInvoicePayment.transfer` (Task 9) dipakai server Task 9; label layar sama di komponen, uji unit, dan E2E ("Diskon {nama}", "Terapkan", "Hapus diskon", "Catatan internal", "Simpan catatan", "+ Rekening", "Tambah rekening", "Rekening tujuan", "Harga & promo", "Promo", "Nama promo", "Persen promo").
