# Harga Modal, Margin, dan Komisi Pelaksana — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harga beli diisi Admin Keuangan (barang masuk dua langkah) dan disembunyikan dari Apoteker dan resepsionis; biaya bahan, alat, dan komisi per treatment disalin ke baris tagihan saat final, bersama pelaksananya; tagihan menampilkan margin bagi Admin Keuangan; laporan untung-rugi memasukkan bahan dan alat ke harga pokok; tab baru "Margin" dan "Komisi" di Laporan.

**Architecture:** Kolom baru di `Service` (biaya dan komisi) dan `InvoiceLine` (pelaksana dan salinan biaya). Kolom harga beli (`PurchaseLine.unitCost`, `StockBatch.unitCost`, `InvoiceStockUse.unitCost`, `PurchaseInvoice.total`) menjadi boleh kosong, artinya "Menunggu harga". Aturan murni di `src/lib/costing.ts`. Server mengosongkan kolom harga bagi peran tanpa `price:manage`. Laporan dihitung di SQL (`report-sql.ts`) seperti sekarang.

**Tech Stack:** Next.js 15, Prisma 7/PostgreSQL, MUI 9, Vitest (unit + integrasi), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-harga-modal-margin-komisi-design.md` (v1.0, disetujui pemilik 14 Oktober 2026).

## Global Constraints

- **Bahasa:** teks yang dilihat pengguna, pesan galat, nama uji, dan komentar kode dalam Bahasa Indonesia; nama berkas, fungsi, dan commit dalam bahasa Inggris.
- **Hak:**
  - harga beli, harga pokok, nilai stok, biaya, komisi, dan margin di layar tagihan dan stok hanya untuk `price:manage` (Admin Keuangan, Super Admin);
  - laporan (tab Margin dan Komisi) untuk `profit:read`;
  - barang masuk tetap `stock:manage` (Apoteker, Super Admin);
  - pelaksana baris dipilih dengan `invoice:manage`.
- **Komisi (spec M10, §6):**
  - rupiah = nilai × jumlah;
  - persen = `floor(promoPrice × jumlah × persen / 100)`;
  - 0 bila tanpa pelaksana;
  - hanya untuk baris `TREATMENT` yang punya `serviceId`; sesi paket (Rp 0) tetap dihitung.
- **Salinan saat final (spec §6):** `materialCost` = biaya bahan × jumlah, `toolCost` = biaya alat × jumlah, `commissionAmount` = komisi di atas.
- **Harga pokok laporan (spec M3):** Σ harga pokok barang (yang kosong dihitung 0) + Σ bahan + Σ alat. Komisi tidak ikut.
- **Pesan galat tetap:**
  - "Harga beli diisi Admin Keuangan."
  - "Isi harga beli semua baris."
  - "Harga tidak bisa diubah setelah ada pembayaran atau retur."
  - "Isi harga beli dulu."
  - "Biaya melebihi harga jual."
- **Label tetap:** status faktur pembelian "Menunggu harga"; tombol "Isi harga beli"; isian "Pelaksana"; tab Laporan "Ringkasan", "Margin", "Komisi".
- **Migrasi hanya menambah kolom** dan melonggarkan `NOT NULL` pada `PurchaseLine.unitCost`, `StockBatch.unitCost`, `InvoiceStockUse.unitCost`, dan `PurchaseInvoice.total` (`20261015090000_harga_modal`). Rilis lama selalu menulis angka, jadi aman.
- **Pola kode:**
  - `runAction`/`UserFacingError`, `requireCapability`, `recordAudit`, `touchDraft`, `lockInvoice` (faktur pembelian), `lockInvoiceRow` (tagihan), `safeRevalidatePath`;
  - berkas `"use server"` hanya mengekspor fungsi async (tipe boleh);
  - pembacaan untuk halaman ada di modul biasa yang memeriksa hak;
  - panel hanya MUI.
- **Pengujian:**
  - unit: `npx vitest run <berkas>`;
  - integrasi: `npm run test:integration -- <berkas>` (jangan bersamaan dengan E2E);
  - E2E: `npx playwright test <berkas> --project=desktop --workers=1`, lalu `--project=mobile`;
  - setelah mengubah skema: `npx prisma generate && npm run db:migrate:test`;
  - uji lama yang memang gagal: 3 uji `schedule.test.ts`.
  - Sebelum suite integrasi penuh sesudah E2E, bersihkan sisa E2E di basis data uji:
    ```bash
    U=$(grep -E '^TEST_DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'); psql "$U" -qc "begin; delete from \"PackageSessionEntry\"; update \"InvoiceLine\" set \"patientPackageItemId\" = null; delete from \"PatientPackage\"; delete from \"InvoicePayment\"; delete from \"InvoiceStockUse\"; delete from \"InvoiceLine\"; delete from \"Invoice\"; delete from \"TreatmentPackage\" where name like 'Paket E2E%'; delete from \"DispensingLine\"; delete from \"Dispensing\"; delete from \"StockMovement\"; delete from \"SupplierReturnLine\"; delete from \"SupplierReturn\"; delete from \"SupplierPayment\"; delete from \"StockBatch\"; delete from \"PurchaseLine\"; delete from \"PurchaseInvoice\"; commit;"
    ```
- **Commit:** Conventional Commits bahasa Inggris, diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Push, merge, dan deploy hanya atas permintaan pemilik.
- **Branch:** `harga-modal`.

## Keputusan perencana

1. **Status hutang baru `MENUNGGU_HARGA`** (label "Menunggu harga") di `PayableStatus`.
   - Sisa hutangnya 0, jadi tidak ikut jumlah hutang.
   - Saringan "Belum lunas" ikut menampilkannya, supaya faktur itu tidak hilang dari daftar Hutang.
2. **Biaya treatment diubah lewat dialog "Biaya {layanan}"** di baris tabel harga, bukan kolom tambahan. Tabel harga sudah lebar, dan dialog memberi tempat untuk pilihan jenis komisi. Baris menampilkan ringkasan "bahan Rp X · alat Rp Y · komisi Z".
3. **Laporan memakai tab `?tab=` (Ringkasan, Margin, Komisi)** di halaman `/admin/laporan` yang sama.
   - Saringan periode dan cabang membawa `tab` lewat isian tersembunyi.
   - Unduh CSV komisi lewat rute unduh yang sama dengan `?jenis=komisi`.
4. **`InvoiceDetail.cost` diganti `InvoiceDetail.margin`**: `{ revenue, stockCost, materialCost, toolCost, commission, margin, missingStockCost }`, berisi null bagi peran tanpa `price:manage`. `InvoiceLineRow.cost` diganti `InvoiceLineRow.costing`: `{ stockCost: number | null, materialCost, toolCost, commission, cost, margin } | null`.
5. **Pelaksana tagihan lama diisi migrasi** dari `EncounterTreatment` (spec §9), lewat `UPDATE … FROM`. Baris draf yang sudah ada juga terisi.
6. **Persen margin dibulatkan satu desimal**, dan "—" bila pendapatan 0.
7. **Laporan komisi dan margin memakai tagihan FINAL** menurut `finalizedAt` WITA dan cabang tagihan, sama seperti laporan untung-rugi.

## Review Focus

1. **Tagihan final mengambil stok dari batch tanpa harga, lalu harga diisi.** Harga pokok tagihan itu terisi, margin dan laporan ikut berubah, dan peringatan "belum punya harga pokok" hilang (Task 3).
2. **Apoteker mengirim harga beli lewat permintaan buatan** saat mencatat barang masuk, atau memanggil `setPurchasePrices`: ditolak (Task 3).
3. **Membayar atau meretur faktur "Menunggu harga"**: ditolak dengan "Isi harga beli dulu.". Setelah harga diisi, pembayaran berjalan dengan total yang benar (Task 3).
4. **Komisi persen dengan diskon dan sesi paket**: dihitung dari harga katalog × jumlah, bukan harga baris; baris tanpa pelaksana menghasilkan 0 (Task 2, Task 8).
5. **Resepsionis atau Apoteker membuka tagihan, stok, atau barang masuk**: tidak ada angka harga pokok, harga beli, biaya, atau komisi di data yang dikirim server (Task 5, Task 9).

---

### Task 1: Skema, migrasi, dan tipe harga yang boleh kosong

**Files:**
- Modify: `prisma/schema.prisma` (`Service`, `InvoiceLine`, `PurchaseLine`, `StockBatch`, `InvoiceStockUse`, `PurchaseInvoice`)
- Create: `prisma/migrations/20261015090000_harga_modal/migration.sql`
- Modify (tipe, perilaku tetap): `src/lib/stock.ts`, `src/server/purchase-read.ts`, `src/server/payable-read.ts`, `src/server/stock-read.ts`, `src/server/stock-movements.ts`, `src/server/invoice-lifecycle.ts`, `src/server/invoice-read.ts`, dan halaman/komponen yang menampilkan nilai tersebut
- Modify: `tests/unit/migrations.test.ts`
- Test: `tests/integration/harga-modal-schema.test.ts`

**Interfaces:**
- Produces:
  - `Service.materialCost`, `Service.toolCost`, `Service.commissionKind` (`DiscountKind?`), `Service.commissionValue`;
  - `InvoiceLine.performerId`, `InvoiceLine.performerName`, `InvoiceLine.materialCost`, `InvoiceLine.toolCost`, `InvoiceLine.commissionAmount`;
  - `unitCost: number | null` pada `PurchaseLine`, `StockBatch`, `InvoiceStockUse`;
  - `PurchaseInvoice.total: number | null`, `PurchaseInvoice.pricedAt`, `PurchaseInvoice.pricedByName`;
  - CHECK `service_cost_values`, `invoice_line_cost_values`.

- [ ] **Step 1: Uji yang gagal**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi harga modal", () => {
  const sql = readFileSync("prisma/migrations/20261015090000_harga_modal/migration.sql", "utf8");

  it("hanya menambah dan melonggarkan NOT NULL harga beli", () => {
    expect(sql.replace(/DROP NOT NULL/g, "")).not.toMatch(/\bDROP\b/i);
    for (const column of ['"PurchaseLine" ALTER COLUMN "unitCost"', '"StockBatch" ALTER COLUMN "unitCost"', '"InvoiceStockUse" ALTER COLUMN "unitCost"', '"PurchaseInvoice" ALTER COLUMN "total"']) {
      expect(sql, column).toContain(`${column} DROP NOT NULL`);
    }
  });

  it("menjaga biaya dan pelaksana di basis data, dan mengisi pelaksana tagihan lama dari catatan kunjungan", () => {
    for (const name of ["service_cost_values", "invoice_line_cost_values"]) expect(sql, name).toMatch(new RegExp(`ADD CONSTRAINT "${name}" CHECK`));
    expect(sql).toMatch(/UPDATE "InvoiceLine"[\s\S]*FROM "EncounterTreatment"/);
  });
});
```

`tests/integration/harga-modal-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const SLUG = "skema-modal";
const WA = "6281200009701";
let world: BillingWorld;
let invoiceId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  invoiceId = (await prisma.invoice.create({ data: { patientId: world.patientId, branchId: world.branchId, createdById: "s", createdByName: "Uji" } })).id;
});
afterAll(async () => {
  await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("skema harga modal", () => {
  it("biaya dan komisi layanan masuk akal", async () => {
    const set = (data: Record<string, unknown>) => prisma.service.update({ where: { id: world.treatmentId }, data });
    await expect(set({ materialCost: -1 })).rejects.toThrow(/service_cost_values/);
    await expect(set({ commissionKind: null, commissionValue: 5 })).rejects.toThrow(/service_cost_values/);
    await expect(set({ commissionKind: "PERSEN", commissionValue: 101 })).rejects.toThrow(/service_cost_values/);
    await expect(set({ commissionKind: "NOMINAL", commissionValue: 0 })).rejects.toThrow(/service_cost_values/);
    expect((await set({ materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 })).commissionValue).toBe(10);
  });

  it("baris tagihan: biaya tidak negatif; pelaksana hanya untuk treatment dan lengkap berpasangan", async () => {
    const line = (data: Record<string, unknown>) => prisma.invoiceLine.create({ data: { invoiceId, kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, ...data } });
    await expect(line({ commissionAmount: -1 })).rejects.toThrow(/invoice_line_cost_values/);
    await expect(line({ performerId: "p1" })).rejects.toThrow(/invoice_line_cost_values/);
    await expect(line({ kind: "LAYANAN", performerId: "p1", performerName: "Rina" })).rejects.toThrow(/invoice_line_cost_values/);
    expect((await line({ performerId: "p1", performerName: "Rina", materialCost: 40_000 })).performerName).toBe("Rina");
  });

  it("harga beli dan total faktur boleh kosong (menunggu harga)", async () => {
    const purchase = await prisma.purchaseInvoice.create({
      data: {
        supplierId: world.supplierId,
        branchId: world.branchId,
        invoiceNumber: `${SLUG}-1`,
        invoiceDate: new Date("2031-01-01T00:00:00Z"),
        dueDate: new Date("2031-01-31T00:00:00Z"),
        total: null,
        createdById: "s",
        createdByName: "Uji",
        lines: { create: [{ itemId: world.productId, quantity: 2, unitCost: null }] },
      },
      select: { total: true, lines: { select: { id: true, unitCost: true } } },
    });
    expect(purchase.total).toBeNull();
    const batch = await prisma.stockBatch.create({
      data: { itemId: world.productId, branchId: world.branchId, purchaseLineId: purchase.lines[0].id, unitCost: null, quantityReceived: 2, quantityRemaining: 2 },
    });
    expect(batch.unitCost).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts` dan `npm run test:integration -- tests/integration/harga-modal-schema.test.ts`
Expected: unit FAIL (`ENOENT`); integrasi FAIL (kolom `materialCost` tidak dikenal).

- [ ] **Step 3: Skema** — `prisma/schema.prisma`:

Di model `Service`, setelah `requiresDoctor`:

```prisma
  /// Biaya operasional per sesi (spec harga modal 5), diisi Admin Keuangan. CHECK service_cost_values.
  materialCost    Int           @default(0)
  toolCost        Int           @default(0)
  /// Komisi pelaksana per sesi: NOMINAL = rupiah, PERSEN = persen dari harga katalog; kosong = tanpa komisi.
  commissionKind  DiscountKind?
  commissionValue Int           @default(0)
```

Di model `InvoiceLine`, setelah `packageEntries`:

```prisma
  /// Pelaksana treatment (spec harga modal 6); disalin dari catatan kunjungan atau dipilih resepsionis.
  performerId          String?
  performerName        String?
  /// Salinan biaya saat final (total baris = biaya per sesi × jumlah) dan komisi pelaksana. CHECK invoice_line_cost_values.
  materialCost         Int                 @default(0)
  toolCost             Int                 @default(0)
  commissionAmount     Int                 @default(0)
```

**Kolom yang menjadi boleh kosong:**
- `PurchaseLine.unitCost` → `Int?`;
- `StockBatch.unitCost` → `Int?`;
- `InvoiceStockUse.unitCost` → `Int?`;
- `PurchaseInvoice.total` → `Int?`.

Tambahkan di `PurchaseInvoice`, setelah `total`:

```prisma
  /// Kapan dan oleh siapa harga beli dilengkapi (spec harga modal 4); kosong selama "Menunggu harga".
  pricedAt        DateTime?
  pricedByName    String?
```

Lalu `npx prisma format && npx prisma validate`.

- [ ] **Step 4: Migrasi**

```bash
mkdir -p prisma/migrations/20261015090000_harga_modal
PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/modal.sql
```

`migration.sql`:
- awal: komentar `-- Harga modal, margin, dan komisi (spec docs/superpowers/specs/2026-10-14-harga-modal-margin-komisi-design.md bagian 3).` dan `-- Hanya menambah kolom dan melonggarkan NOT NULL harga beli: rilis lama selalu menulis angka.`;
- lalu isi `/tmp/modal.sql` tanpa baris kepala dotenv/Prisma (mulai dari baris `--` pertama);
- lalu tambahkan:

```sql
-- Pelaksana tagihan lama dari catatan kunjungan, supaya laporan komisi bulan berjalan tidak kosong (spec 9).
UPDATE "InvoiceLine" l
SET "performerId" = t."performerId", "performerName" = t."performerName"
FROM "EncounterTreatment" t
WHERE l."encounterTreatmentId" = t."id" AND l."kind" = 'TREATMENT' AND l."performerId" IS NULL;

-- Biaya layanan tidak negatif; komisi kosong (0), persen 1..100, atau rupiah > 0.
ALTER TABLE "Service" ADD CONSTRAINT "service_cost_values" CHECK (
  "materialCost" BETWEEN 0 AND 2000000000
  AND "toolCost" BETWEEN 0 AND 2000000000
  AND (
    ("commissionKind" IS NULL AND "commissionValue" = 0)
    OR ("commissionKind" = 'PERSEN' AND "commissionValue" BETWEEN 1 AND 100)
    OR ("commissionKind" = 'NOMINAL' AND "commissionValue" BETWEEN 1 AND 2000000000)
  )
);

-- Salinan biaya baris tidak negatif; pelaksana hanya untuk treatment, id dan nama selalu berpasangan.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_cost_values" CHECK (
  "materialCost" >= 0 AND "toolCost" >= 0 AND "commissionAmount" >= 0
  AND (("performerId" IS NULL) = ("performerName" IS NULL))
  AND ("performerId" IS NULL OR "kind" = 'TREATMENT')
);
```

Jalankan: `npx prisma generate && npm run db:migrate:test`, lalu `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
Expected: migrasi berhasil; diff = `-- This is an empty migration.`

- [ ] **Step 5: Tipe yang boleh kosong.** Perilaku tetap sama, karena sampai Task 3 semua harga masih terisi. Jalankan `npx tsc --noEmit 2>&1 | grep "^src\|^tests"` lalu perbaiki dengan pola ini:
- **`src/lib/stock.ts`:**
  - `stockFlags`: parameter batch `unitCost: number | null`; `value += batch.quantityRemaining * (batch.unitCost ?? 0);`
  - `PayableInput.total: number | null`; di `payableSummary`, `invoice.total - paid …` menjadi `(invoice.total ?? 0) - paid …`. Status "Menunggu harga" ditambahkan di Task 3.
- **`src/server/purchase-read.ts`:**
  - `PurchaseRow.total`, `PurchaseDetail.total`, `PurchaseLineRow.unitCost`, dan `PurchaseLineRow.amount` menjadi `number | null`;
  - `amount: line.unitCost === null ? null : line.quantity * line.unitCost`.
- **`src/server/payable-read.ts`:** baris hutang `total: number | null`.
- **`src/server/stock-read.ts`:** `StockBatchRow.unitCost: number | null`.
- **`src/server/stock-movements.ts`** (retur): `unitCost: batch.unitCost ?? 0` dan `amount: line.quantity * (batch.unitCost ?? 0)`. Task 3 menggantinya dengan penolakan "Isi harga beli dulu.".
- **`src/server/invoice-lifecycle.ts`:** `type LiveBatch = BatchStock & { unitCost: number | null };`.
- **`src/server/invoice-read.ts`:** `use.quantity * (use.unitCost ?? 0)`.
- **Komponen dan halaman** yang memanggil `formatRupiah` dengan nilai yang kini boleh kosong (halaman detail barang masuk, tabel barang masuk, tabel hutang, detail barang): tampilkan `"—"` bila `null`, misalnya `{line.unitCost === null ? "—" : formatRupiah(line.unitCost)}`.

- [ ] **Step 6: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/migrations.test.ts tests/unit/stock.test.ts && npm run test:integration -- tests/integration/harga-modal-schema.test.ts tests/integration/purchases.test.ts tests/integration/payables.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261015090000_harga_modal tests/unit/migrations.test.ts tests/integration/harga-modal-schema.test.ts src
git commit -m "feat: schema for purchase prices pending, treatment costs, and performers"
```

(Pastikan `git status` hanya memuat berkas Task 1 sebelum `git add src`.)

---

### Task 2: Aturan murni biaya, komisi, dan margin

**Files:**
- Create: `src/lib/costing.ts`
- Test: `tests/unit/costing.test.ts`

**Interfaces:**
- Consumes: `MAX_AMOUNT`, `Validation` (`src/lib/stock.ts`), `formatRupiah`.
- Produces:
  - `type CommissionKindValue = "NOMINAL" | "PERSEN"`;
  - `type ServiceCostInput = { materialCost: number; toolCost: number; commissionKind: CommissionKindValue | null; commissionValue: number }`;
  - `validateServiceCost(raw: unknown): Validation<ServiceCostInput>`;
  - `costWarning(cost: ServiceCostInput, price: number): string | null`;
  - `commissionLabel(kind, value): string`;
  - `serviceCostSummary(cost: ServiceCostInput): string`;
  - `type CostedService = { promoPrice: number; materialCost: number; toolCost: number; commissionKind: CommissionKindValue | null; commissionValue: number }`;
  - `lineCosts(input: { quantity: number; hasPerformer: boolean; service: CostedService | null }): { materialCost: number; toolCost: number; commissionAmount: number }`;
  - `marginOf(input: { revenue: number; stockCost: number; materialCost: number; toolCost: number; commission: number }): number`;
  - `marginPercent(margin: number, revenue: number): number | null`;
  - `validatePurchasePrices(raw: unknown, ctx: { lineIds: readonly string[] }): Validation<{ lineId: string; unitCost: number }[]>`.

- [ ] **Step 1: Uji yang gagal** — `tests/unit/costing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  commissionLabel,
  costWarning,
  lineCosts,
  marginOf,
  marginPercent,
  serviceCostSummary,
  validatePurchasePrices,
  validateServiceCost,
} from "@/lib/costing";

const service = { promoPrice: 250_000, materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN" as const, commissionValue: 10 };

describe("biaya layanan", () => {
  it("validasi", () => {
    expect(validateServiceCost({ materialCost: 40_000, toolCost: 0, commissionKind: "NOMINAL", commissionValue: 15_000 })).toEqual({
      ok: true,
      value: { materialCost: 40_000, toolCost: 0, commissionKind: "NOMINAL", commissionValue: 15_000 },
    });
    expect(validateServiceCost({ materialCost: 1, toolCost: 1, commissionKind: null, commissionValue: 99 })).toEqual({
      ok: true,
      value: { materialCost: 1, toolCost: 1, commissionKind: null, commissionValue: 0 },
    });
    expect(validateServiceCost({ materialCost: -1, toolCost: 0, commissionKind: null, commissionValue: 0 })).toEqual({ ok: false, message: "Biaya bahan tidak sah." });
    expect(validateServiceCost({ materialCost: 0, toolCost: 1.5, commissionKind: null, commissionValue: 0 })).toEqual({ ok: false, message: "Biaya alat tidak sah." });
    expect(validateServiceCost({ materialCost: 0, toolCost: 0, commissionKind: "PERSEN", commissionValue: 0 })).toEqual({ ok: false, message: "Komisi persen 1–100." });
    expect(validateServiceCost({ materialCost: 0, toolCost: 0, commissionKind: "NOMINAL", commissionValue: 0 })).toEqual({ ok: false, message: "Komisi rupiah tidak sah." });
    expect(validateServiceCost({ materialCost: 0, toolCost: 0, commissionKind: "X", commissionValue: 1 })).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });

  it("peringatan biaya melebihi harga, label, dan ringkasan", () => {
    expect(costWarning({ materialCost: 200_000, toolCost: 30_000, commissionKind: "PERSEN", commissionValue: 10 }, 250_000)).toBe("Biaya melebihi harga jual.");
    expect(costWarning({ materialCost: 40_000, toolCost: 10_000, commissionKind: "NOMINAL", commissionValue: 15_000 }, 250_000)).toBeNull();
    expect(commissionLabel("NOMINAL", 15_000)).toBe("Rp 15.000/sesi");
    expect(commissionLabel("PERSEN", 10)).toBe("10%");
    expect(commissionLabel(null, 0)).toBe("tanpa komisi");
    expect(serviceCostSummary({ materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 })).toBe("bahan Rp 40.000 · alat Rp 10.000 · komisi 10%");
  });
});

describe("salinan biaya baris", () => {
  it("persen dari harga katalog × jumlah dibulatkan ke bawah; rupiah × jumlah; tanpa pelaksana tanpa komisi", () => {
    expect(lineCosts({ quantity: 2, hasPerformer: true, service })).toEqual({ materialCost: 80_000, toolCost: 20_000, commissionAmount: 50_000 });
    expect(lineCosts({ quantity: 1, hasPerformer: true, service: { ...service, promoPrice: 99_999 } }).commissionAmount).toBe(9_999);
    expect(lineCosts({ quantity: 3, hasPerformer: true, service: { ...service, commissionKind: "NOMINAL", commissionValue: 15_000 } }).commissionAmount).toBe(45_000);
    expect(lineCosts({ quantity: 1, hasPerformer: false, service })).toEqual({ materialCost: 40_000, toolCost: 10_000, commissionAmount: 0 });
    expect(lineCosts({ quantity: 1, hasPerformer: true, service: null })).toEqual({ materialCost: 0, toolCost: 0, commissionAmount: 0 });
  });

  it("margin dan persennya", () => {
    expect(marginOf({ revenue: 250_000, stockCost: 0, materialCost: 40_000, toolCost: 10_000, commission: 25_000 })).toBe(175_000);
    expect(marginPercent(175_000, 250_000)).toBe(70);
    expect(marginPercent(1, 3)).toBe(33.3);
    expect(marginPercent(-50, 0)).toBeNull();
  });
});

describe("validatePurchasePrices", () => {
  it("semua baris wajib, bilangan bulat tidak negatif, baris harus milik faktur", () => {
    const ctx = { lineIds: ["a", "b"] };
    expect(validatePurchasePrices([{ lineId: "a", unitCost: 5000 }, { lineId: "b", unitCost: 0 }], ctx)).toEqual({ ok: true, value: [{ lineId: "a", unitCost: 5000 }, { lineId: "b", unitCost: 0 }] });
    expect(validatePurchasePrices([{ lineId: "a", unitCost: 5000 }], ctx)).toEqual({ ok: false, message: "Isi harga beli semua baris." });
    expect(validatePurchasePrices([{ lineId: "a", unitCost: 5000 }, { lineId: "b", unitCost: null }], ctx)).toEqual({ ok: false, message: "Isi harga beli semua baris." });
    expect(validatePurchasePrices([{ lineId: "a", unitCost: -1 }, { lineId: "b", unitCost: 1 }], ctx)).toEqual({ ok: false, message: "Harga beli tidak sah." });
    expect(validatePurchasePrices([{ lineId: "a", unitCost: 1 }, { lineId: "x", unitCost: 1 }], ctx)).toEqual({ ok: false, message: "Isi harga beli semua baris." });
    expect(validatePurchasePrices("x", ctx)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/costing.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/costing"`).

- [ ] **Step 3: Implementasi** — `src/lib/costing.ts`:

```ts
import { formatRupiah } from "./format";
import { MAX_AMOUNT, type Validation } from "./stock";

// Aturan murni harga modal, komisi pelaksana, dan margin (spec harga modal 5–7). Dipakai server dan browser.

export type CommissionKindValue = "NOMINAL" | "PERSEN";
export type ServiceCostInput = { materialCost: number; toolCost: number; commissionKind: CommissionKindValue | null; commissionValue: number };
export type CostedService = { promoPrice: number } & ServiceCostInput;

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

export function validateServiceCost(raw: unknown): Validation<ServiceCostInput> {
  if (typeof raw !== "object" || raw === null) return fail(INVALID_FORM);
  const input = raw as Record<string, unknown>;
  const kind = input.commissionKind === undefined || input.commissionKind === "" ? null : input.commissionKind;
  if (kind !== null && kind !== "NOMINAL" && kind !== "PERSEN") return fail(INVALID_FORM);
  if (!isWhole(input.materialCost, 0, MAX_AMOUNT)) return fail("Biaya bahan tidak sah.");
  if (!isWhole(input.toolCost, 0, MAX_AMOUNT)) return fail("Biaya alat tidak sah.");
  if (kind === "PERSEN" && !isWhole(input.commissionValue, 1, 100)) return fail("Komisi persen 1–100.");
  if (kind === "NOMINAL" && !isWhole(input.commissionValue, 1, MAX_AMOUNT)) return fail("Komisi rupiah tidak sah.");
  return {
    ok: true,
    value: { materialCost: input.materialCost as number, toolCost: input.toolCost as number, commissionKind: kind, commissionValue: kind ? (input.commissionValue as number) : 0 },
  };
}

function commissionPerSession(cost: ServiceCostInput, price: number): number {
  if (cost.commissionKind === "NOMINAL") return cost.commissionValue;
  if (cost.commissionKind === "PERSEN") return Math.floor((price * cost.commissionValue) / 100);
  return 0;
}

/** Biaya satu sesi melebihi harga jual: boleh disimpan, tetapi diberi peringatan (spec 5). */
export function costWarning(cost: ServiceCostInput, price: number): string | null {
  return cost.materialCost + cost.toolCost + commissionPerSession(cost, price) > price ? "Biaya melebihi harga jual." : null;
}

export function commissionLabel(kind: CommissionKindValue | null, value: number): string {
  if (kind === "NOMINAL") return `${formatRupiah(value)}/sesi`;
  if (kind === "PERSEN") return `${value}%`;
  return "tanpa komisi";
}

export function serviceCostSummary(cost: ServiceCostInput): string {
  return `bahan ${formatRupiah(cost.materialCost)} · alat ${formatRupiah(cost.toolCost)} · komisi ${commissionLabel(cost.commissionKind, cost.commissionValue)}`;
}

/** Salinan biaya baris treatment saat final (spec 6, M10): komisi persen dari harga katalog × jumlah, dibulatkan ke bawah. */
export function lineCosts(input: { quantity: number; hasPerformer: boolean; service: CostedService | null }): { materialCost: number; toolCost: number; commissionAmount: number } {
  const { quantity, service } = input;
  if (!service) return { materialCost: 0, toolCost: 0, commissionAmount: 0 };
  let commissionAmount = 0;
  if (input.hasPerformer && service.commissionKind === "NOMINAL") commissionAmount = service.commissionValue * quantity;
  if (input.hasPerformer && service.commissionKind === "PERSEN") commissionAmount = Math.floor((service.promoPrice * quantity * service.commissionValue) / 100);
  return { materialCost: service.materialCost * quantity, toolCost: service.toolCost * quantity, commissionAmount };
}

export function marginOf(input: { revenue: number; stockCost: number; materialCost: number; toolCost: number; commission: number }): number {
  return input.revenue - input.stockCost - input.materialCost - input.toolCost - input.commission;
}

/** Persen margin satu desimal; null bila pendapatan 0 (rencana keputusan 6). */
export function marginPercent(margin: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return Math.round((margin / revenue) * 1000) / 10;
}

/** Isian "Isi harga beli" (spec 4): semua baris faktur wajib terisi, tidak negatif. */
export function validatePurchasePrices(raw: unknown, ctx: { lineIds: readonly string[] }): Validation<{ lineId: string; unitCost: number }[]> {
  if (!Array.isArray(raw)) return fail(INVALID_FORM);
  const byLine = new Map<string, unknown>();
  for (const entry of raw as unknown[]) {
    if (typeof entry !== "object" || entry === null) return fail(INVALID_FORM);
    const { lineId, unitCost } = entry as Record<string, unknown>;
    if (typeof lineId !== "string") return fail(INVALID_FORM);
    byLine.set(lineId, unitCost);
  }
  if (byLine.size !== ctx.lineIds.length || ctx.lineIds.some((id) => !byLine.has(id) || byLine.get(id) === null || byLine.get(id) === undefined)) {
    return fail("Isi harga beli semua baris.");
  }
  const value: { lineId: string; unitCost: number }[] = [];
  for (const lineId of ctx.lineIds) {
    const unitCost = byLine.get(lineId);
    if (!isWhole(unitCost, 0, MAX_AMOUNT)) return fail("Harga beli tidak sah.");
    value.push({ lineId, unitCost });
  }
  return { ok: true, value };
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/costing.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS; tsc bersih.

- [ ] **Step 5: Commit**

```bash
git add src/lib/costing.ts tests/unit/costing.test.ts
git commit -m "feat: pure rules for treatment costs, commissions, and margins"
```

---

### Task 3: Barang masuk dua langkah — server

**Files:**
- Modify: `src/lib/stock.ts` (`PurchaseLineInput.unitCost: number | null`, `validatePurchase`, `PayableStatus` "MENUNGGU_HARGA", `payableSummary`, `matchesPayableView`)
- Modify: `src/server/purchases.ts` (`createPurchase`: harga hanya untuk `price:manage`)
- Create: `src/server/purchase-pricing.ts` (`setPurchasePrices`)
- Modify: `src/server/payables.ts`, `src/server/stock-movements.ts` (tolak faktur menunggu harga), `src/server/invoice-lifecycle.ts` (harga pokok dibaca sesudah batch dikunci)
- Modify (uji lama): `tests/integration/purchases.test.ts` dan uji lain yang memanggil `createPurchase` sebagai APOTEKER dengan harga
- Test: `tests/integration/purchase-pricing.test.ts`, `tests/unit/stock.test.ts`

**Interfaces:**
- Consumes: Task 2 `validatePurchasePrices`; Task 1 kolom boleh kosong.
- Produces:
  - `PayableStatus` mencakup `"MENUNGGU_HARGA"` (label "Menunggu harga");
  - `setPurchasePrices({ invoiceId: string; prices: { lineId: string; unitCost: number | null }[] }): Promise<ActionResult<void>>`;
  - konstanta `PRICE_BY_FINANCE = "Harga beli diisi Admin Keuangan."` di `src/server/purchases.ts` (tidak diekspor).

- [ ] **Step 1: Uji yang gagal**

Di `tests/unit/stock.test.ts`, tambahkan (sesuaikan impor `payableSummary`, `matchesPayableView`, `PAYABLE_STATUS_LABEL`, `validatePurchase` bila belum):

```ts
describe("faktur menunggu harga", () => {
  it("tanpa total: status Menunggu harga, sisa 0, tidak terlambat, tetap muncul di Belum lunas", () => {
    const summary = payableSummary({ total: null, cancelledAt: null, dueDate: new Date("2020-01-01T00:00:00Z"), payments: [], returns: [] }, "2026-10-14");
    expect(summary).toMatchObject({ status: "MENUNGGU_HARGA", balance: 0, overdue: false });
    expect(PAYABLE_STATUS_LABEL.MENUNGGU_HARGA).toBe("Menunggu harga");
    expect(matchesPayableView({ status: "MENUNGGU_HARGA", overdue: false, balance: 0, dueDate: "2026-11-01" }, "BELUM_LUNAS", "2026-10-14")).toBe(true);
  });

  it("barang masuk tanpa harga sah; total kosong bila ada baris tanpa harga", () => {
    const base = { supplierId: "s", branchId: "b", invoiceNumber: "F-1", invoiceDate: "2026-10-14", dueDate: "2026-11-13", notes: "" };
    const ctx = { today: "2026-10-14", kindOf: () => "PRODUK" as const };
    const pending = validatePurchase({ ...base, lines: [{ itemId: "i", quantity: 2, unitCost: null, batchNumber: "", expiryDate: "" }] }, ctx);
    expect(pending.ok && pending.value).toMatchObject({ total: null, lines: [{ unitCost: null }] });
    const priced = validatePurchase({ ...base, lines: [{ itemId: "i", quantity: 2, unitCost: 5000, batchNumber: "", expiryDate: "" }] }, ctx);
    expect(priced.ok && priced.value.total).toBe(10_000);
  });
});
```

`tests/integration/purchase-pricing.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { PurchaseInput } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addInvoiceItem, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordSupplierPayment } from "@/server/payables";
import { setPurchasePrices } from "@/server/purchase-pricing";
import { createPurchase } from "@/server/purchases";
import { createSupplierReturn } from "@/server/stock-movements";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Apoteker Modal", role: "APOTEKER" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "harga-beli";
const WA = "6281200009702";
const today = witaDateString(new Date());
let world: BillingWorld;
let seq = 0;
const as = (role: Role) => {
  actor.role = role;
};
const purchase = (unitCost: number | null): PurchaseInput => {
  seq += 1;
  return {
    supplierId: world.supplierId,
    branchId: world.branchId,
    invoiceNumber: `${SLUG}-${seq}`,
    invoiceDate: today,
    dueDate: addDaysToDateString(today, 30),
    notes: "",
    lines: [{ itemId: world.productId, quantity: 5, unitCost, batchNumber: "", expiryDate: "" }],
  };
};
const lineOf = async (invoiceId: string) => prisma.purchaseLine.findFirstOrThrow({ where: { invoiceId } });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(() => as("APOTEKER"));
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("barang masuk dua langkah", () => {
  it("Apoteker mencatat tanpa harga; harga dari Apoteker ditolak (Review Focus 2)", async () => {
    expect(await createPurchase(purchase(5000))).toEqual({ ok: false, error: "Harga beli diisi Admin Keuangan." });
    const { id } = await unwrap(createPurchase(purchase(null)));
    const invoice = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id }, include: { lines: { include: { batch: true } } } });
    expect(invoice).toMatchObject({ total: null, pricedAt: null });
    expect(invoice.lines[0]).toMatchObject({ unitCost: null, batch: { unitCost: null, quantityRemaining: 5 } });
    const line = await lineOf(id);
    await expect(setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: 1 }] })).rejects.toThrow("forbidden: price:manage");
  });

  it("menunggu harga: bayar dan retur ditolak; setelah harga diisi keduanya berjalan (Review Focus 3)", async () => {
    const { id } = await unwrap(createPurchase(purchase(null)));
    const line = await prisma.purchaseLine.findFirstOrThrow({ where: { invoiceId: id }, include: { batch: true } });
    as("ADMIN_KEUANGAN");
    expect(await recordSupplierPayment({ invoiceId: id, kind: "BAYAR", amount: 1000, method: "TUNAI", paidAt: today, reference: "" })).toEqual({ ok: false, error: "Isi harga beli dulu." });
    as("APOTEKER");
    expect(await createSupplierReturn({ invoiceId: id, lines: [{ batchId: line.batch!.id, quantity: 1 }], note: "rusak" })).toEqual({ ok: false, error: "Isi harga beli dulu." });

    as("ADMIN_KEUANGAN");
    await unwrap(setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: 8000 }] }));
    const priced = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id } });
    expect(priced).toMatchObject({ total: 40_000, pricedByName: "Apoteker Modal" });
    expect(await prisma.auditLog.count({ where: { action: "purchase.price", entityId: id } })).toBe(1);
    await unwrap(recordSupplierPayment({ invoiceId: id, kind: "BAYAR", amount: 10_000, method: "TUNAI", paidAt: today, reference: "" }));
    expect(await setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: 9000 }] })).toEqual({
      ok: false,
      error: "Harga tidak bisa diubah setelah ada pembayaran atau retur.",
    });
  });

  it("tagihan final yang mengambil stok tanpa harga ikut terisi harga pokoknya (Review Focus 1)", async () => {
    const { id } = await unwrap(createPurchase(purchase(null)));
    as("RESEPSIONIS");
    const sale = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addInvoiceItem({ invoiceId: sale.id, version: 1, itemId: world.productId, quantity: 2 }));
    const version = (await prisma.invoice.findUniqueOrThrow({ where: { id: sale.id } })).version;
    await unwrap(finalizeInvoice({ invoiceId: sale.id, version }));
    const uses = () => prisma.invoiceStockUse.findMany({ where: { line: { invoiceId: sale.id } } });
    expect((await uses()).map((u) => u.unitCost)).toEqual([null]);

    as("ADMIN_KEUANGAN");
    const line = await lineOf(id);
    await unwrap(setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: 7000 }] }));
    expect((await uses()).map((u) => [u.quantity, u.unitCost])).toEqual([[2, 7000]]);
  });

  it("isian harga tidak lengkap ditolak; Super Admin bisa mencatat langsung berharga", async () => {
    const { id } = await unwrap(createPurchase(purchase(null)));
    as("ADMIN_KEUANGAN");
    const line = await lineOf(id);
    expect(await setPurchasePrices({ invoiceId: id, prices: [{ lineId: line.id, unitCost: null }] })).toEqual({ ok: false, error: "Isi harga beli semua baris." });
    as("SUPER_ADMIN");
    const direct = await unwrap(createPurchase(purchase(6000)));
    expect(await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: direct.id } })).toMatchObject({ total: 30_000, pricedByName: "Apoteker Modal" });
  });
});
```

Catatan:
- `addInvoiceItem` di dunia uji ini mengambil stok dari batch produk cabang uji. Batch dari faktur sebelumnya (yang sudah berharga) bisa terambil lebih dulu karena urutan FEFO dan `createdAt`. Uji ketiga memakai `productId`; bila FEFO mengambil batch lain, kosongkan dulu sisa batch produk lain di cabang ini (`prisma.stockBatch.updateMany({ where: { itemId: world.productId, branchId: world.branchId, purchaseLine: { invoiceId: { not: id } } }, data: { quantityRemaining: 0 } })`) dan catat sebagai Ruling.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/stock.test.ts` dan `npm run test:integration -- tests/integration/purchase-pricing.test.ts`
Expected: unit FAIL (status belum ada); integrasi FAIL (`@/server/purchase-pricing` tidak ada).

- [ ] **Step 3: Aturan stok** — `src/lib/stock.ts`:
- `PayableStatus` menjadi `"DIBATALKAN" | "MENUNGGU_HARGA" | "LUNAS" | "KREDIT" | "SEBAGIAN" | "BELUM_DIBAYAR"`; `PAYABLE_STATUS_LABEL` mendapat `MENUNGGU_HARGA: "Menunggu harga",`.
- `PurchaseLineInput.unitCost: number | null`; `ValidPurchaseLine.unitCost: number | null`; `ValidPurchase.total: number | null`.
- Di `validatePurchase`, ganti pengecekan harga dan penjumlahan:

```ts
    const unitCost = line.unitCost === null || line.unitCost === undefined ? null : line.unitCost;
    if (unitCost !== null && !isWhole(unitCost, 0, MAX_AMOUNT)) return fail(`Baris ${n}: harga beli tidak sah.`);
```

  `total` dihitung hanya dari baris berharga; setelah loop, `total` = `null` bila ada baris tanpa harga (simpan `let missing = false`). Simpan `unitCost` (boleh null) ke baris.
- `payableSummary`, tepat sesudah perhitungan pembayaran:

```ts
  // Faktur yang harga belinya belum lengkap belum berhutang (spec harga modal 4).
  if (!invoice.cancelledAt && invoice.total === null) {
    return { paid, refunded, returned: 0, balance: 0, status: "MENUNGGU_HARGA", overdue: false };
  }
```

  (lalu `invoice.total` dipakai sebagai angka: `invoice.total! - paid …` atau `(invoice.total ?? 0)`).
- `matchesPayableView` `BELUM_LUNAS` mendapat `|| row.status === "MENUNGGU_HARGA"`.

- [ ] **Step 4: Server**

`src/server/purchases.ts` `createPurchase`:
- Setelah `const p = checked.value;`:

```ts
    // Harga beli hanya diisi Admin Keuangan dan Super Admin (spec harga modal M1, M5).
    const canPrice = can(actor.role, "price:manage");
    if (!canPrice && p.lines.some((line) => line.unitCost !== null)) throw new UserFacingError(PRICE_BY_FINANCE);
    const pricedAt = p.total === null ? null : new Date();
```

- Data faktur mendapat `total: p.total, pricedAt, pricedByName: pricedAt ? actor.name : null`.
- Ringkasan audit memakai `p.total === null ? "menunggu harga" : formatRupiah(p.total)`.
- Tambahkan `const PRICE_BY_FINANCE = "Harga beli diisi Admin Keuangan.";` di atas.

`src/server/purchase-pricing.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { validatePurchasePrices } from "@/lib/costing";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { MAX_AMOUNT } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { lockInvoice } from "@/server/stock-store";

const LOCKED = "Harga tidak bisa diubah setelah ada pembayaran atau retur.";

/**
 * Isi atau koreksi harga beli faktur (spec harga modal 4). Batch dan harga pokok tagihan yang sudah mengambil
 * stok dari batch itu ikut diperbarui. Batch diperbarui lebih dulu: finalisasi tagihan yang sedang mengambil batch
 * yang sama memegang kunci barisnya, jadi pembaruan harga pokok tagihan di bawah selalu melihat hasilnya.
 */
export async function setPurchasePrices(input: { invoiceId: string; prices: { lineId: string; unitCost: number | null }[] }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, invoiceId);
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        select: {
          invoiceNumber: true,
          total: true,
          cancelledAt: true,
          supplier: { select: { name: true } },
          lines: { orderBy: { sortOrder: "asc" }, select: { id: true, quantity: true, batch: { select: { id: true } } } },
          payments: { select: { revokedAt: true } },
          _count: { select: { returns: true } },
        },
      });
      if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
      if (invoice.cancelledAt) throw new UserFacingError("Faktur yang dibatalkan tidak perlu harga.");
      if (invoice.payments.some((payment) => payment.revokedAt === null) || invoice._count.returns > 0) throw new UserFacingError(LOCKED);
      const checked = validatePurchasePrices(input?.prices, { lineIds: invoice.lines.map((line) => line.id) });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const priceOf = new Map(checked.value.map((entry) => [entry.lineId, entry.unitCost]));
      const total = invoice.lines.reduce((sum, line) => sum + line.quantity * priceOf.get(line.id)!, 0);
      if (total > MAX_AMOUNT) throw new UserFacingError("Total faktur terlalu besar.");
      for (const line of invoice.lines) {
        const unitCost = priceOf.get(line.id)!;
        await tx.purchaseLine.update({ where: { id: line.id }, data: { unitCost } });
        if (line.batch) {
          await tx.stockBatch.update({ where: { id: line.batch.id }, data: { unitCost } });
          await tx.invoiceStockUse.updateMany({ where: { batchId: line.batch.id }, data: { unitCost } });
        }
      }
      await tx.purchaseInvoice.update({ where: { id: invoiceId }, data: { total, pricedAt: new Date(), pricedByName: actor.name } });
      const before = invoice.total === null ? "" : `${formatRupiah(invoice.total)} → `;
      return `${invoice.supplier.name} ${invoice.invoiceNumber}: ${before}${formatRupiah(total)}`;
    });
    await recordAudit({ actor, action: "purchase.price", entity: "PurchaseInvoice", entityId: invoiceId, summary });
    for (const path of ["/admin/stok", "/admin/hutang", "/admin/laporan", "/admin", `/admin/stok/masuk/${invoiceId}`]) safeRevalidatePath(path);
  });
}
```

**Penolakan "Isi harga beli dulu.":**
- **`src/server/payables.ts`:** di `recordSupplierPayment`, setelah pengecekan `invoice.cancelledAt`, tambahkan `if (invoice.total === null) throw new UserFacingError("Isi harga beli dulu.");`.
- **`src/server/stock-movements.ts`:** di `createSupplierReturn`, `select` faktur mendapat `total: true`; setelah pengecekan `cancelledAt`, tambahkan `if (invoice.total === null) throw new UserFacingError("Isi harga beli dulu.");`. Ganti `batch.unitCost ?? 0` dari Task 1 menjadi `batch.unitCost!`, dengan komentar `// total ada ⇒ semua baris berharga`.

**Finalisasi tagihan** (`src/server/invoice-lifecycle.ts`): harga pokok dibaca **sesudah** batch dikunci oleh `takeFromBatch`, supaya pengisian harga yang selesai lebih dulu tidak tertimpa nilai lama. Di loop `for (const take of plan.takes)`, setelah `takeFromBatch` berhasil:

```ts
          // Dibaca sesudah batch terkunci: harga beli yang baru diisi Admin Keuangan selalu terbawa (spec harga modal 4).
          const unitCost = (await tx.stockBatch.findUniqueOrThrow({ where: { id: take.batchId }, select: { unitCost: true } })).unitCost;
```

dan pakai `unitCost` itu di `tx.invoiceStockUse.create(...)`, menggantikan `batch.unitCost`.

**Uji lama:** jalankan `grep -rln "createPurchase(" tests/integration`. Di setiap uji yang memanggil `createPurchase` sebagai APOTEKER dengan harga:
- jalankan bagian itu sebagai `SUPER_ADMIN`, yang punya `stock:manage` dan `price:manage`; atau
- kirim `unitCost: null` bila uji tidak membutuhkan harga.

Catat setiap perubahan sebagai Ruling.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/stock.test.ts && npm run test:integration -- tests/integration/purchase-pricing.test.ts tests/integration/purchases.test.ts tests/integration/payables.test.ts tests/integration/stock-movements.test.ts tests/integration/invoice-lifecycle.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stock.ts src/server/purchases.ts src/server/purchase-pricing.ts src/server/payables.ts src/server/stock-movements.ts src/server/invoice-lifecycle.ts tests/unit/stock.test.ts tests/integration
git commit -m "feat: purchases recorded without prices until finance fills them"
```

---

### Task 4: Barang masuk dua langkah — layar

**Files:**
- Modify: `src/components/admin/stock/purchase-form.tsx` (prop `canSetPrice`)
- Modify: `src/app/(admin)/admin/stok/masuk/baru/page.tsx`
- Create: `src/components/admin/stock/purchase-price-dialog.tsx`
- Modify: `src/app/(admin)/admin/stok/masuk/[id]/page.tsx` (tombol "Isi harga beli")
- Modify: `src/server/purchase-read.ts` (`listPurchases({ pendingOnly })`), `src/app/(admin)/admin/stok/page.tsx` (saringan "Menunggu harga" di tab Barang masuk), `src/components/admin/stock/payable-status-badge.tsx` (nada "warning" untuk Menunggu harga)
- Test: `tests/unit/components/purchase-form.test.tsx`, `tests/unit/components/purchase-price-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 3 `setPurchasePrices`, status `MENUNGGU_HARGA`.
- Produces:
  - `PurchaseForm` prop `canSetPrice?: boolean` (bawaan `false`);
  - `PurchasePriceDialog({ invoiceId, lines: { id: string; label: string; quantity: number; unit: string; unitCost: number | null }[] })`;
  - `listPurchases(filter?: { pendingOnly?: boolean })`.

- [ ] **Step 1: Uji yang gagal**

`tests/unit/components/purchase-price-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PurchasePriceDialog } from "@/components/admin/stock/purchase-price-dialog";
import { setPurchasePrices } from "@/server/purchase-pricing";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/purchase-pricing", () => ({ setPurchasePrices: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const lines = [
  { id: "l1", label: "Amoxicillin (batch B-01)", quantity: 10, unit: "kapsul", unitCost: null },
  { id: "l2", label: "Serum C", quantity: 2, unit: "botol", unitCost: null },
];

beforeEach(() => vi.clearAllMocks());

describe("PurchasePriceDialog", () => {
  it("mengisi harga semua baris, menampilkan total, lalu mengirim", async () => {
    vi.mocked(setPurchasePrices).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<PurchasePriceDialog invoiceId="pi1" lines={lines} />);
    await user.click(screen.getByRole("button", { name: "Isi harga beli" }));
    const dialog = await screen.findByRole("dialog", { name: "Isi harga beli" });
    await user.type(within(dialog).getByLabelText("Harga beli Amoxicillin (batch B-01)"), "5000");
    await user.type(within(dialog).getByLabelText("Harga beli Serum C"), "75000");
    expect(dialog).toHaveTextContent("Total faktur: Rp 200.000");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(setPurchasePrices).toHaveBeenCalledWith({
        invoiceId: "pi1",
        prices: [
          { lineId: "l1", unitCost: 5000 },
          { lineId: "l2", unitCost: 75_000 },
        ],
      }),
    );
  });

  it("baris kosong ditolak di layar", async () => {
    const user = userEvent.setup();
    renderAdmin(<PurchasePriceDialog invoiceId="pi1" lines={lines} />);
    await user.click(screen.getByRole("button", { name: "Isi harga beli" }));
    const dialog = await screen.findByRole("dialog", { name: "Isi harga beli" });
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Isi harga beli semua baris.");
    expect(setPurchasePrices).not.toHaveBeenCalled();
  });
});
```

Untuk formulir barang masuk, di `tests/unit/components/purchase-form.test.tsx` yang sudah ada:
- `renderForm` mendapat parameter `canSetPrice = true` yang diteruskan sebagai prop ke `PurchaseForm`, sehingga uji lama yang mengisi "Harga beli baris N" tetap berjalan sebagai pengguna berhak harga;
- tambahkan uji ini:

```tsx
  it("Apoteker: tanpa isian harga beli dan tanpa total; harga dikirim kosong", async () => {
    const user = userEvent.setup();
    vi.mocked(createPurchase).mockResolvedValue({ ok: true, data: { id: "p9" } });
    renderForm(false);
    expect(screen.queryByLabelText("Harga beli baris 1")).not.toBeInTheDocument();
    expect(screen.queryByText(/Total faktur/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Supplier"), "s1");
    await user.type(screen.getByLabelText("Nomor faktur"), "INV-9");
    await pickOption(user, "Barang baris 1", "Serum C (PRD-001)");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "3");
    await user.click(screen.getByRole("button", { name: "Simpan barang masuk" }));
    await waitFor(() => expect(createPurchase).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ itemId: "serum", quantity: 3, unitCost: null })] })));
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/purchase-price-dialog.test.tsx tests/unit/components/purchase-form.test.tsx`
Expected: FAIL (dialog belum ada; formulir masih menampilkan harga).

- [ ] **Step 3: Implementasi**

`src/components/admin/stock/purchase-form.tsx`:
- prop `canSetPrice = false` (`canSetPrice?: boolean`, dengan komentar `/** Harga beli hanya diisi Admin Keuangan dan Super Admin (spec harga modal M1). */`);
- `RupiahInput "Harga beli baris {n}"` hanya dirender bila `canSetPrice`;
- kotak "Total faktur" hanya dirender bila `canSetPrice` (tombol "Simpan barang masuk" tetap ada di kotak yang sama, rata kanan);
- `submit()` mengirim `unitCost: canSetPrice ? line.unitCost : null`. Bila `canSetPrice` dan sebagian baris dikosongkan, faktur tersimpan "Menunggu harga". Ini sah, jadi `unitCost: line.unitCost` (boleh `null`), bukan `Number.NaN`.

`src/app/(admin)/admin/stok/masuk/baru/page.tsx`: ambil `staff` dari `requireCapability` yang sudah ada, lalu `canSetPrice={can(staff.role, "price:manage")}`.

`src/components/admin/stock/purchase-price-dialog.tsx`:

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
import { toast } from "sonner";
import { validatePurchasePrices } from "@/lib/costing";
import { formatRupiah } from "@/lib/format";
import { setPurchasePrices } from "@/server/purchase-pricing";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { RupiahInput } from "../rupiah-input";

type PriceLine = { id: string; label: string; quantity: number; unit: string; unitCost: number | null };

/** "Isi harga beli" faktur barang masuk, khusus Admin Keuangan dan Super Admin (spec harga modal 4). */
export function PurchasePriceDialog({ invoiceId, lines }: { invoiceId: string; lines: PriceLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = lines.reduce((sum, line) => sum + line.quantity * (prices[line.id] ?? 0), 0);

  function openDialog() {
    setPrices(Object.fromEntries(lines.map((line) => [line.id, line.unitCost])));
    setError(null);
    setOpen(true);
  }

  function save() {
    const input = lines.map((line) => ({ lineId: line.id, unitCost: prices[line.id] ?? null }));
    const checked = validatePurchasePrices(input, { lineIds: lines.map((line) => line.id) });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await setPurchasePrices({ invoiceId, prices: checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Harga beli disimpan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="contained" onClick={openDialog}>
        Isi harga beli
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Isi harga beli</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {lines.map((line) => (
              <Stack key={line.id} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                  {line.label} · {line.quantity} {line.unit}
                </Typography>
                <RupiahInput
                  aria-label={`Harga beli ${line.label}`}
                  placeholder="per satuan"
                  value={prices[line.id] ?? null}
                  onChange={(next) => setPrices((current) => ({ ...current, [line.id]: next }))}
                  sx={{ width: { xs: "100%", sm: 180 } }}
                />
              </Stack>
            ))}
            <Typography variant="body2" aria-live="polite">
              Total faktur: <strong>{formatRupiah(total)}</strong>
            </Typography>
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

**Halaman detail barang masuk** (`src/app/(admin)/admin/stok/masuk/[id]/page.tsx`):
- `const canPrice = can(staff.role, "price:manage");`;
- di `actions` header (atau dekat kartu ringkasan, mengikuti tempat tombol aksi lain di halaman itu), tampilkan

```tsx
{canPrice && detail.cancelledAt === null && (detail.total === null || detail.canReprice) && (
  <PurchasePriceDialog
    invoiceId={detail.id}
    lines={detail.lines.map((line) => ({
      id: line.id,
      label: `${line.itemName}${line.batchNumber ? ` (batch ${line.batchNumber})` : ""}`,
      quantity: line.quantity,
      unit: line.unit,
      unitCost: line.unitCost,
    }))}
  />
)}
```

- di `PurchaseDetail` (`src/server/purchase-read.ts`), tambahkan `canReprice: boolean`: belum ada pembayaran aktif dan belum ada retur, yaitu `invoice.payments.every((p) => p.revokedAt !== null) && invoice.returns.length === 0`.

**Saringan "Menunggu harga":**
- `listPurchases(filter: { pendingOnly?: boolean } = {})` menambah `where: filter.pendingOnly ? { total: null, cancelledAt: null } : {}`;
- di `src/app/(admin)/admin/stok/page.tsx` tab "masuk":
  - bila pengguna punya `price:manage`, tampilkan tautan `LinkButton` "Menunggu harga" ke `/admin/stok?tab=masuk&harga=menunggu`, atau "Semua faktur" ke `/admin/stok?tab=masuk` bila saringan aktif;
  - panggil `listPurchases({ pendingOnly: params.harga === "menunggu" && canPrice })`;
  - tambahkan `harga?: string` ke tipe `Search`.

`src/components/admin/stock/payable-status-badge.tsx`: nada `"warning"` untuk `MENUNGGU_HARGA`, misalnya `tone={status === "LUNAS" ? "success" : status === "MENUNGGU_HARGA" ? "warning" : "neutral"}`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/purchase-price-dialog.test.tsx tests/unit/components/purchase-form.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/stock/purchase-form.tsx "src/app/(admin)/admin/stok/masuk/baru/page.tsx" src/components/admin/stock/purchase-price-dialog.tsx "src/app/(admin)/admin/stok/masuk/[id]/page.tsx" src/server/purchase-read.ts "src/app/(admin)/admin/stok/page.tsx" src/components/admin/stock/payable-status-badge.tsx tests/unit/components/purchase-price-dialog.test.tsx tests/unit/components/purchase-form.test.tsx
git commit -m "feat: pharmacist records purchases without prices; finance fills them"
```

---

### Task 5: Harga beli dan harga pokok tersembunyi dari peran tanpa hak harga

**Files:**
- Modify: `src/server/purchase-read.ts`, `src/server/stock-read.ts`, `src/server/invoice-read.ts`
- Modify: `src/app/(admin)/admin/stok/page.tsx` (kartu "Nilai stok"), `src/app/(admin)/admin/stok/barang/[id]/page.tsx` (kolom harga beli batch), `src/app/(admin)/admin/stok/masuk/[id]/page.tsx` (harga, subtotal, total, nilai retur), `src/components/admin/stock/purchase-table.tsx` (kolom total), `src/components/admin/stock/supplier-return-dialog.tsx` (harga dan nilai retur), `src/app/(admin)/admin/tagihan/[id]/page.tsx` (`canSeeCost`)
- Test: `tests/integration/cost-visibility.test.ts`

**Interfaces:**
- Consumes: Task 1 tipe boleh kosong.
- Produces:
  - `PurchaseDetail.canSeeCost: boolean`;
  - bila `false`: `total`, `lines[].unitCost`, `lines[].amount`, `returns[].total`, dan `returns[].lines[].amount` bernilai `null`, sedangkan angka uang di `summary` (`paid`, `refunded`, `returned`, `balance`) bernilai 0 (status dan terlambat tetap);
  - `PurchaseRow.total: number | null` (`null` tanpa hak);
  - `StockItemRow.value: number | null`;
  - `StockBatchRow.unitCost: number | null` (`null` tanpa hak);
  - `InvoiceLineRow.cost` dan `InvoiceDetail.cost` memakai hak `price:manage` (bukan `stock:read` lagi).

- [ ] **Step 1: Uji yang gagal** — `tests/integration/cost-visibility.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addInvoiceItem, createDirectSale } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { getPurchaseDetail, listPurchases } from "@/server/purchase-read";
import { createPurchase } from "@/server/purchases";
import { getStockItemDetail, listStockItems } from "@/server/stock-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Modal", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "lihat-modal";
const WA = "6281200009703";
const today = witaDateString(new Date());
let world: BillingWorld;
let purchaseId: string;
let invoiceId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  actor.role = "SUPER_ADMIN";
  purchaseId = (
    await unwrap(
      createPurchase({
        supplierId: world.supplierId,
        branchId: world.branchId,
        invoiceNumber: `${SLUG}-1`,
        invoiceDate: today,
        dueDate: addDaysToDateString(today, 30),
        notes: "",
        lines: [{ itemId: world.productId, quantity: 5, unitCost: 9000, batchNumber: "B-1", expiryDate: "" }],
      }),
    )
  ).id;
  invoiceId = (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;
  await unwrap(addInvoiceItem({ invoiceId, version: 1, itemId: world.productId, quantity: 1 }));
  await unwrap(finalizeInvoice({ invoiceId, version: (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version }));
});
beforeEach(() => {
  actor.role = "SUPER_ADMIN";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("harga beli dan harga pokok hanya untuk hak harga (Review Focus 5)", () => {
  it("Apoteker: faktur, daftar barang masuk, dan stok tanpa angka harga", async () => {
    actor.role = "APOTEKER";
    const detail = (await getPurchaseDetail(purchaseId))!;
    expect(detail).toMatchObject({ canSeeCost: false, total: null });
    expect(detail.lines[0]).toMatchObject({ unitCost: null, amount: null, quantity: 5 });
    expect(detail.summary).toMatchObject({ paid: 0, balance: 0 });
    expect((await listPurchases()).find((row) => row.id === purchaseId)!.total).toBeNull();
    expect((await listStockItems({ branchId: world.branchId })).find((row) => row.id === world.productId)!.value).toBeNull();
    expect((await getStockItemDetail(world.productId))!.batches.every((batch) => batch.unitCost === null)).toBe(true);
  });

  it("Resepsionis: tagihan tanpa harga pokok", async () => {
    actor.role = "RESEPSIONIS";
    const detail = (await getInvoiceDetail(invoiceId))!;
    expect(detail.cost).toBeNull();
    expect(detail.lines.every((line) => line.cost === null)).toBe(true);
  });

  it("Admin Keuangan: semua angka tampil", async () => {
    actor.role = "ADMIN_KEUANGAN";
    expect((await getPurchaseDetail(purchaseId))!).toMatchObject({ canSeeCost: true, total: 45_000 });
    expect((await getInvoiceDetail(invoiceId))!.cost).toBe(9000);
    expect((await listStockItems({ branchId: world.branchId })).find((row) => row.id === world.productId)!.value).toBe(36_000);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/cost-visibility.test.ts`
Expected: FAIL (`canSeeCost` belum ada; angka masih dikirim).

- [ ] **Step 3: Implementasi**

`src/server/purchase-read.ts`:
- `listPurchases`: `const actor = await requireCapability("stock:read"); const withCost = can(actor.role, "price:manage");` lalu `total: withCost ? invoice.total : null`.
- `getPurchaseDetail`: `const withCost = can(actor.role, "price:manage");`
  - baris: `unitCost: withCost ? line.unitCost : null`, `amount: withCost && line.unitCost !== null ? line.quantity * line.unitCost : null`;
  - `total: withCost ? invoice.total : null`;
  - retur: `total: withCost ? r.total : null`, `amount: withCost ? line.amount : null` (tipe `SupplierReturnRow.total` dan `lines[].amount` menjadi `number | null`);
  - `summary: withCost ? summary : { ...summary, paid: 0, refunded: 0, returned: 0, balance: 0 }`, dengan komentar `// angka uang tidak dikirim ke peran tanpa hak harga (spec harga modal 8)`;
  - `canSeeCost: withCost`.

`src/server/stock-read.ts`:
- `listStockItems`: `const actor = await requireCapability("stock:read"); const withCost = can(actor.role, "price:manage");` lalu baris `value: withCost ? flags.value : null` (tipe `StockItemRow.value: number | null`);
- `getStockItemDetail`: `unitCost: withCost ? batch.unitCost : null`;
- perbarui `summarizeStock` (di `src/lib/stock.ts` atau tempat ia berada) supaya menjumlahkan `row.value ?? 0` dan mengembalikan `value: number | null`, yaitu `null` bila semua baris `null`.

`src/server/invoice-read.ts`: `const withCost = can(actor.role, "price:manage");` (sebelumnya `stock:read`), dan perbarui komentar pada `cost`.

**Layar:**
- **`stok/page.tsx`:** blok `<div><dt>Nilai stok (harga beli)</dt>…</div>` hanya dirender bila `summary.value !== null`. Bila disembunyikan, grid ringkasan memakai 3 kolom, yaitu `repeat(${summary.value === null ? 3 : 4}, 1fr)`.
- **`stok/barang/[id]/page.tsx`:** kolom header dan sel harga beli batch hanya bila `detail.batches.some((b) => b.unitCost !== null)`, atau lewat `can(staff.role, "price:manage")`; pakai yang terakhir.
- **`stok/masuk/[id]/page.tsx`:** kolom Harga dan Subtotal, isian "Total", dan nilai rupiah retur hanya bila `detail.canSeeCost`. Bila tidak, baris retur tetap menampilkan jumlah dan batch.
- **`purchase-table.tsx`:** prop `showTotal?: boolean` (bawaan `true`); kolom total disaring bila `false`. Halaman stok mengirim `showTotal={canPrice}`.
- **`supplier-return-dialog.tsx`:** `ReturnLine.unitCost: number | null`; teks "· Rp X per unit" dan "Nilai retur" hanya bila semua `unitCost` terisi. Halaman detail mengirim `unitCost: detail.canSeeCost ? line.unitCost : null`.
- **`tagihan/[id]/page.tsx`:** `canSeeCost={can(staff.role, "price:manage")}`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/cost-visibility.test.ts tests/integration/purchases.test.ts && npx vitest run tests/unit/stock.test.ts tests/unit/components tests/unit/invoice-final-view.test.tsx && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih. Uji yang mengharapkan angka harga sebagai APOTEKER: ubah perannya ke `SUPER_ADMIN`, atau harapkan `null`; catat sebagai Ruling.

- [ ] **Step 5: Commit**

```bash
git add src/server/purchase-read.ts src/server/stock-read.ts src/server/invoice-read.ts src/lib/stock.ts "src/app/(admin)/admin/stok" src/components/admin/stock "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/integration/cost-visibility.test.ts tests/integration tests/unit
git commit -m "feat: hide purchase prices and costs from roles without price rights"
```

---

### Task 6: Biaya dan komisi treatment di Layanan & Harga

**Files:**
- Modify: `src/server/service-admin.ts` (`updateServicePrice` → `price:manage`; `updateServiceCost` baru)
- Create: `src/components/admin/service-cost-dialog.tsx`
- Modify: `src/components/admin/service-price-table.tsx` (tombol biaya per baris, ringkasan biaya)
- Modify: `src/app/(admin)/admin/layanan/page.tsx` (hak `content:manage` atau `price:manage`)
- Modify: `src/components/admin/app-sidebar.tsx` (`NavItem.needsAny`)
- Test: `tests/integration/service-cost.test.ts`, `tests/unit/components/service-cost-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 2 `validateServiceCost`, `serviceCostSummary`, `costWarning`, `ServiceCostInput`.
- Produces:
  - `updateServiceCost(input: { id: string } & ServiceCostInput): Promise<ActionResult<void>>`, dengan hak `price:manage` dan audit `service.cost`;
  - `ServiceCostDialog({ service: { id; name; promoPrice } & ServiceCostInput })`;
  - `NavItem.needsAny?: Capability[]`.

- [ ] **Step 1: Uji yang gagal**

`tests/integration/service-cost.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { updateServiceCost, updateServicePrice } from "@/server/service-admin";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Biaya", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "biaya-layanan";
const WA = "6281200009704";
let world: BillingWorld;

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

describe("biaya dan harga treatment oleh Admin Keuangan", () => {
  it("mengisi biaya bahan, alat, dan komisi; tercatat di audit", async () => {
    await unwrap(updateServiceCost({ id: world.treatmentId, materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 }));
    expect(await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).toMatchObject({ materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service.cost", entityId: world.treatmentId } })).summary).toBe(
      "Facial Uji: bahan Rp 40.000 · alat Rp 10.000 · komisi 10%",
    );
    expect(await updateServiceCost({ id: world.treatmentId, materialCost: 0, toolCost: 0, commissionKind: "PERSEN", commissionValue: 0 })).toEqual({ ok: false, error: "Komisi persen 1–100." });
  });

  it("Admin Keuangan mengubah harga jual; resepsionis tidak bisa keduanya", async () => {
    await unwrap(updateServicePrice({ id: world.treatmentId, normalPrice: null, promoPrice: 260_000 }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } })).promoPrice).toBe(260_000);
    actor.role = "RESEPSIONIS";
    await expect(updateServiceCost({ id: world.treatmentId, materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 })).rejects.toThrow("forbidden: price:manage");
    await expect(updateServicePrice({ id: world.treatmentId, normalPrice: null, promoPrice: 1 })).rejects.toThrow("forbidden: price:manage");
  });
});
```

`tests/unit/components/service-cost-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceCostDialog } from "@/components/admin/service-cost-dialog";
import { updateServiceCost } from "@/server/service-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/service-admin", () => ({ updateServiceCost: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const service = { id: "sv1", name: "Relaxing Facial", promoPrice: 149_000, materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 };

beforeEach(() => vi.clearAllMocks());

describe("ServiceCostDialog", () => {
  it("mengisi biaya dan komisi rupiah; peringatan bila biaya melebihi harga", async () => {
    vi.mocked(updateServiceCost).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={service} />);
    expect(screen.getByText("bahan Rp 0 · alat Rp 0 · komisi tanpa komisi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Biaya Relaxing Facial" }));
    const dialog = await screen.findByRole("dialog", { name: "Biaya Relaxing Facial" });
    await user.type(within(dialog).getByLabelText("Biaya bahan"), "150000");
    expect(dialog).toHaveTextContent("Biaya melebihi harga jual.");
    await user.clear(within(dialog).getByLabelText("Biaya bahan"));
    await user.type(within(dialog).getByLabelText("Biaya bahan"), "30000");
    await user.type(within(dialog).getByLabelText("Biaya alat"), "5000");
    await user.selectOptions(within(dialog).getByLabelText("Komisi"), "NOMINAL");
    await user.type(within(dialog).getByLabelText("Komisi per sesi"), "15000");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateServiceCost).toHaveBeenCalledWith({ id: "sv1", materialCost: 30_000, toolCost: 5000, commissionKind: "NOMINAL", commissionValue: 15_000 }),
    );
  });

  it("komisi persen memakai isian persen", async () => {
    vi.mocked(updateServiceCost).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={service} />);
    await user.click(screen.getByRole("button", { name: "Biaya Relaxing Facial" }));
    const dialog = await screen.findByRole("dialog", { name: "Biaya Relaxing Facial" });
    await user.selectOptions(within(dialog).getByLabelText("Komisi"), "PERSEN");
    await user.type(within(dialog).getByLabelText("Komisi persen"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateServiceCost).toHaveBeenCalledWith(expect.objectContaining({ commissionKind: "PERSEN", commissionValue: 10 })));
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/service-cost.test.ts` dan `npx vitest run tests/unit/components/service-cost-dialog.test.tsx`
Expected: FAIL (`updateServiceCost` dan dialog belum ada).

- [ ] **Step 3: Implementasi**

`src/server/service-admin.ts`:
- `updateServicePrice`: `requireCapability("price:manage")`, dengan komentar `// Harga jual treatment diisi Admin Keuangan dan Super Admin (spec harga modal M5).`;
- aksi baru:

```ts
/** Biaya bahan, alat, dan komisi pelaksana per sesi (spec harga modal 5). */
export async function updateServiceCost(input: { id: string } & ServiceCostInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const checked = validateServiceCost(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const service = await prisma.service.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true, name: true } });
    if (!service) throw new UserFacingError("Layanan tidak ditemukan.");
    await prisma.service.update({ where: { id: service.id }, data: checked.value });
    await recordAudit({ actor, action: "service.cost", entity: "Service", entityId: service.id, summary: `${service.name}: ${serviceCostSummary(checked.value)}` });
    safeRevalidatePath("/admin/layanan");
  });
}
```

  dengan impor `validateServiceCost, serviceCostSummary, type ServiceCostInput` dari `@/lib/costing`.

`src/components/admin/service-cost-dialog.tsx`:
- **Tampilan baris:** komponen client yang merender ringkasan `serviceCostSummary(cost)` dalam `Typography variant="caption"`, lalu tombol teks "Biaya" dengan `aria-label={`Biaya ${service.name}`}`.
- **Isi dialog "Biaya {nama}":**
  - `RupiahInput` "Biaya bahan" dan "Biaya alat";
  - `SelectField` "Komisi" dengan opsi `""` "Tanpa komisi", `NOMINAL` "Rupiah per sesi", `PERSEN` "Persen dari harga";
  - bila `NOMINAL`: `RupiahInput` "Komisi per sesi"; bila `PERSEN`: `TextField type=number` "Komisi persen";
  - `Alert severity="warning"` berisi `costWarning(...)` bila tidak null (dihitung langsung dari isian dan `service.promoPrice`);
  - `Alert severity="error"` untuk galat, lalu "Simpan".
- **Saat menyimpan:** `validateServiceCost` di klien, lalu `updateServiceCost({ id, ...value })`, `toast.success("Biaya tersimpan.")`, dan `router.refresh()`.
- **Pola state:** ikuti `StockPriceDialog` (`src/components/admin/stock/stock-price-dialog.tsx`), yaitu isian diisi ulang dari prop saat dialog dibuka.

`src/components/admin/service-price-table.tsx`:
- `PriceService` mendapat `materialCost`, `toolCost`, `commissionKind`, `commissionValue`;
- di `PriceRow`, kolom baru "Biaya" (header ditambahkan di tabel) berisi `<ServiceCostDialog service={service} />`.

`src/app/(admin)/admin/layanan/page.tsx`:

```tsx
  const staff = await requireStaff();
  const canContent = can(staff.role, "content:manage");
  if (!canContent && !can(staff.role, "price:manage")) forbidden();
```

(impor `forbidden` dari `next/navigation`, `requireStaff` dari `@/server/session`, `can` dari `@/lib/permissions`).
- `ClinicConsultationCard` dan `OnlineServiceCard` hanya dirender bila `canContent`; `getOnlineServiceSettings` dan `getClinicConsultationMinutes` hanya dipanggil bila `canContent`.
- Pemetaan layanan mengirim `materialCost`, `toolCost`, `commissionKind`, dan `commissionValue`.

`src/components/admin/app-sidebar.tsx`:
- `NavItem` mendapat `needsAny?: Capability[];`;
- `isNavItemVisible` mendapat `if (item.needsAny && !item.needsAny.some((capability) => can(role, capability))) return false;`;
- menu "Layanan & Harga" memakai `needsAny: ["content:manage", "price:manage"]` menggantikan `needs: "content:manage"`.

Perbarui uji menu per peran di `tests/unit/stock-availability-ui.test.tsx` bila harapannya berubah: Admin Keuangan kini melihat "Layanan & Harga". Catat sebagai Ruling.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/service-cost.test.ts && npx vitest run tests/unit/components/service-cost-dialog.test.tsx tests/unit/components/service-price-table.test.tsx tests/unit/stock-availability-ui.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih. Uji lama yang memanggil `updateServicePrice` dengan peran yang punya `content:manage` tetapi tanpa `price:manage` (tidak ada di peran saat ini) tidak perlu diubah.

- [ ] **Step 5: Commit**

```bash
git add src/server/service-admin.ts src/components/admin/service-cost-dialog.tsx src/components/admin/service-price-table.tsx "src/app/(admin)/admin/layanan/page.tsx" src/components/admin/app-sidebar.tsx tests/integration/service-cost.test.ts tests/unit/components/service-cost-dialog.test.tsx tests/unit
git commit -m "feat: treatment costs and commissions set by finance"
```

---

### Task 7: Pelaksana di baris treatment

**Files:**
- Modify: `src/server/invoice-drafts.ts` (`createInvoiceFromVisit` menyalin pelaksana; aksi baru `setLinePerformer`)
- Modify: `src/server/invoice-read.ts` (`InvoiceLineRow.performerId/performerName`; `listPerformers`)
- Create: `src/components/admin/billing/line-performer-select.tsx`
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`, `src/components/admin/billing/invoice-final-view.tsx`, `src/app/(admin)/admin/tagihan/[id]/page.tsx`
- Modify (fixture): `tests/unit/invoice-draft-editor.test.tsx`, `tests/unit/invoice-final-view.test.tsx`, `tests/unit/components/line-discount-dialog.test.tsx`
- Test: `tests/integration/invoice-performer.test.ts`, `tests/unit/components/line-performer-select.test.tsx`

**Interfaces:**
- Produces:
  - `setLinePerformer({ invoiceId, version, lineId, performerId: string | null }): Promise<ActionResult<{ version: number }>>` (`invoice:manage`);
  - `listPerformers(): Promise<{ id: string; name: string }[]>` (`invoice:read`; staf aktif DOKTER/TERAPIS urut `sortOrder`);
  - `InvoiceLineRow.performerId: string | null`, `InvoiceLineRow.performerName: string | null`;
  - `LinePerformerSelect({ invoiceId, version, line, performers, disabled })`;
  - `InvoiceDraftEditor` prop `performers?: { id: string; name: string }[]` (bawaan `[]`).

- [ ] **Step 1: Uji yang gagal**

`tests/integration/invoice-performer.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addFreeLine, createInvoiceFromVisit, setLinePerformer } from "@/server/invoice-drafts";
import { getInvoiceDetail, listPerformers } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Pelaksana", role: "RESEPSIONIS" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "pelaksana";
const WA = "6281200009705";
let world: BillingWorld;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("pelaksana treatment", () => {
  it("disalin dari catatan kunjungan; bisa diganti dan dikosongkan; baris layanan ditolak", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const detail = (await getInvoiceDetail(id))!;
    const treatment = detail.lines.find((line) => line.kind === "TREATMENT")!;
    expect(treatment).toMatchObject({ performerId: world.therapistId, performerName: "Terapis Uji" });

    await unwrap(setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, performerId: world.doctorId }));
    const doctor = await prisma.staff.findUniqueOrThrow({ where: { id: world.doctorId } });
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: treatment.id } })).toMatchObject({ performerId: world.doctorId, performerName: doctor.name });
    await unwrap(setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, performerId: null }));
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: treatment.id } })).performerId).toBeNull();

    const layanan = detail.lines.find((line) => line.kind === "LAYANAN")!;
    expect(await setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: layanan.id, performerId: world.therapistId })).toEqual({
      ok: false,
      error: "Pelaksana hanya untuk baris treatment.",
    });
    expect(await setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, performerId: "bukan-staf" })).toEqual({
      ok: false,
      error: "Pelaksana tidak ditemukan atau nonaktif.",
    });
  });

  it("baris treatment bebas boleh tanpa pelaksana; daftar pelaksana hanya dokter dan terapis aktif", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    await unwrap(addFreeLine({ invoiceId: id, version: await versionOf(id), kind: "TREATMENT", name: "Treatment bebas", quantity: 1, unitPrice: 100_000 }));
    expect((await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, name: "Treatment bebas" } })).performerId).toBeNull();
    const performers = await listPerformers();
    expect(performers.map((p) => p.id)).toEqual(expect.arrayContaining([world.doctorId, world.therapistId]));
  });
});
```

Catatan: `world.therapistId` dan `world.doctorId` berasal dari `createBookingWorld`. `finalVisit` mencatat pelaksana dengan nama "Terapis Uji" (`performerName` di `invoice-world.ts`), walaupun nama staf di basis datanya berbeda.

`tests/unit/components/line-performer-select.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinePerformerSelect } from "@/components/admin/billing/line-performer-select";
import { setLinePerformer } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ setLinePerformer: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const performers = [
  { id: "t1", name: "Rina" },
  { id: "d1", name: "dr. Diane" },
];

beforeEach(() => vi.clearAllMocks());

describe("LinePerformerSelect", () => {
  it("mengganti pelaksana baris treatment; baris lain tanpa pilihan", async () => {
    vi.mocked(setLinePerformer).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const { unmount } = renderAdmin(
      <LinePerformerSelect invoiceId="inv" version={2} line={{ id: "l1", name: "Facial", kind: "TREATMENT", performerId: null, performerName: null }} performers={performers} />,
    );
    await user.selectOptions(screen.getByLabelText("Pelaksana Facial"), "t1");
    await waitFor(() => expect(setLinePerformer).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", performerId: "t1" }));
    unmount();
    renderAdmin(<LinePerformerSelect invoiceId="inv" version={2} line={{ id: "l2", name: "Konsultasi", kind: "LAYANAN", performerId: null, performerName: null }} performers={performers} />);
    expect(screen.queryByLabelText("Pelaksana Konsultasi")).not.toBeInTheDocument();
  });

  it("pelaksana yang sudah tidak aktif tetap tampil sebagai pilihan terpilih", () => {
    renderAdmin(<LinePerformerSelect invoiceId="inv" version={2} line={{ id: "l1", name: "Facial", kind: "TREATMENT", performerId: "x9", performerName: "Lama" }} performers={performers} />);
    expect(screen.getByLabelText("Pelaksana Facial")).toHaveValue("x9");
    expect(screen.getByRole("option", { name: "Lama" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/invoice-performer.test.ts` dan `npx vitest run tests/unit/components/line-performer-select.test.tsx`
Expected: FAIL (`setLinePerformer`, `listPerformers`, dan komponen belum ada).

- [ ] **Step 3: Implementasi**

`src/server/invoice-drafts.ts`:

**`createInvoiceFromVisit`:** `select` treatment kunjungan mendapat `performerId: true, performerName: true`. Sesudah `const lines = visitLines(...)`:

```ts
    // Pelaksana disalin dari catatan kunjungan (spec harga modal 6) untuk komisi.
    const performerOf = new Map(appointment.encounter.treatments.map((t) => [t.id, { performerId: t.performerId, performerName: t.performerName }]));
    const withPerformer = lines.map((line) => ({ ...line, ...(line.encounterTreatmentId ? (performerOf.get(line.encounterTreatmentId) ?? {}) : {}) }));
```

Lalu `withPerformer` dipakai menggantikan `lines` di `const all = [...]` (ringkasan audit tetap memakai `lines.length`).

**Aksi baru** (setelah `releasePackageSession`):

```ts
/** Pelaksana baris treatment (spec harga modal 6, M7): boleh diganti atau dikosongkan; baris tanpa pelaksana tidak berkomisi. */
export async function setLinePerformer(input: { invoiceId: string; version: number; lineId: string; performerId: string | null }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({ where: { id: String(input.lineId ?? ""), invoiceId }, select: { id: true, name: true, kind: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (line.kind !== "TREATMENT") throw new UserFacingError("Pelaksana hanya untuk baris treatment.");
      let performer: { id: string; name: string } | null = null;
      if (input.performerId) {
        performer = await tx.staff.findFirst({ where: { id: String(input.performerId), isActive: true, role: { in: ["DOKTER", "TERAPIS"] } }, select: { id: true, name: true } });
        if (!performer) throw new UserFacingError("Pelaksana tidak ditemukan atau nonaktif.");
      }
      await tx.invoiceLine.update({ where: { id: line.id }, data: { performerId: performer?.id ?? null, performerName: performer?.name ?? null } });
      return { version, summary: `Pelaksana ${line.name}: ${performer?.name ?? "kosong"}` };
    });
    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}
```

`src/server/invoice-read.ts`:
- `InvoiceLineRow` mendapat `performerId: string | null; performerName: string | null;` dengan komentar `/** Pelaksana treatment; nama saja yang tampil bagi resepsionis (spec harga modal M8). */`;
- `select` baris mendapat `performerId: true, performerName: true`, dan pemetaan baris meneruskannya;
- fungsi baru:

```ts
/** Pilihan pelaksana di editor draf (spec harga modal 6): dokter dan terapis aktif. */
export async function listPerformers(): Promise<{ id: string; name: string }[]> {
  await requireCapability("invoice:read");
  return prisma.staff.findMany({ where: { isActive: true, role: { in: ["DOKTER", "TERAPIS"] } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}
```

`src/components/admin/billing/line-performer-select.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setLinePerformer } from "@/server/invoice-drafts";
import type { InvoiceLineRow } from "@/server/invoice-read";
import { SelectField } from "../mui/select-field";

type LineView = Pick<InvoiceLineRow, "id" | "name" | "kind" | "performerId" | "performerName">;

/** Pilihan "Pelaksana" untuk baris treatment draf (spec harga modal 6). Tidak menampilkan angka komisi (M8). */
export function LinePerformerSelect({
  invoiceId,
  version,
  line,
  performers,
  disabled = false,
}: {
  invoiceId: string;
  version: number;
  line: LineView;
  performers: readonly { id: string; name: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (line.kind !== "TREATMENT") return null;
  const options = line.performerId && !performers.some((p) => p.id === line.performerId) ? [...performers, { id: line.performerId, name: line.performerName ?? "Pelaksana" }] : performers;

  function change(performerId: string) {
    startTransition(async () => {
      try {
        const result = await setLinePerformer({ invoiceId, version, lineId: line.id, performerId: performerId || null });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SelectField aria-label={`Pelaksana ${line.name}`} value={line.performerId ?? ""} onChange={change} disabled={disabled || pending} fullWidth={false} sx={{ mt: 0.5, minWidth: 180 }}>
      <option value="">Tanpa pelaksana</option>
      {options.map((performer) => (
        <option key={performer.id} value={performer.id}>
          {performer.name}
        </option>
      ))}
    </SelectField>
  );
}
```

**Editor dan tampilan:**
- **`invoice-draft-editor.tsx`:**
  - prop `performers = []` (`performers?: { id: string; name: string }[]`) diteruskan ke `LineRow`;
  - di `LineRow`, tepat sesudah keterangan jenis baris, `<LinePerformerSelect invoiceId={detail.id} version={detail.version} line={line} performers={performers} disabled={disabled} />`.
- **`invoice-final-view.tsx`:** setelah keterangan jenis baris, `{line.performerName && <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>Pelaksana: {line.performerName}</Typography>}`.
- **`tagihan/[id]/page.tsx`:** `performers={await listPerformers()}` pada `InvoiceDraftEditor`.
- **Fixture uji unit:** setiap baris `InvoiceLineRow` di tiga berkas fixture mendapat `performerId: null, performerName: null`. Mock `@/server/invoice-drafts` di `invoice-draft-editor.test.tsx` mendapat `setLinePerformer: vi.fn()`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/invoice-performer.test.ts tests/integration/invoice-create.test.ts tests/integration/package-session.test.ts && npx vitest run tests/unit/components/line-performer-select.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/components/line-discount-dialog.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/invoice-drafts.ts src/server/invoice-read.ts src/components/admin/billing/line-performer-select.tsx src/components/admin/billing/invoice-draft-editor.tsx src/components/admin/billing/invoice-final-view.tsx "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/integration/invoice-performer.test.ts tests/unit/components/line-performer-select.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/components/line-discount-dialog.test.tsx
git commit -m "feat: treatment performer on invoice lines"
```

---

### Task 8: Salinan biaya dan komisi saat tagihan final

**Files:**
- Modify: `src/server/invoice-lifecycle.ts` (`finalizeInvoice`)
- Test: `tests/integration/invoice-costing.test.ts`

**Interfaces:**
- Consumes: Task 2 `lineCosts`; Task 6 kolom biaya `Service`; Task 7 pelaksana baris.
- Produces: `InvoiceLine.materialCost`, `InvoiceLine.toolCost`, dan `InvoiceLine.commissionAmount` terisi untuk baris TREATMENT ber-`serviceId` saat final.

- [ ] **Step 1: Uji yang gagal** — `tests/integration/invoice-costing.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addFreeLine, addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit, setLineDiscount, setLinePerformer, updateInvoiceLine } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Biaya", role: "RESEPSIONIS" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "salinan-biaya";
const WA = "6281200009706";
let world: BillingWorld;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;
const finalize = async (id: string) => unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
async function visitDraft() {
  const { appointmentId } = await finalVisit(world);
  const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
  return { id, line: await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } }) };
}
const costsOf = async (lineId: string) =>
  prisma.invoiceLine.findUniqueOrThrow({ where: { id: lineId }, select: { materialCost: true, toolCost: true, commissionAmount: true } });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(async () => {
  // Facial Uji: Rp 250.000, bahan 40.000, alat 10.000, komisi 10%.
  await prisma.service.update({ where: { id: world.treatmentId }, data: { promoPrice: 250_000, materialCost: 40_000, toolCost: 10_000, commissionKind: "PERSEN", commissionValue: 10 } });
});
afterAll(async () => {
  await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("salinan biaya dan komisi saat final", () => {
  it("komisi persen dari harga katalog × jumlah, bukan harga baris berdiskon (Review Focus 4)", async () => {
    const draft = await visitDraft();
    await unwrap(updateInvoiceLine({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, quantity: 2, unitPrice: 250_000, priceNote: "" }));
    await unwrap(setLineDiscount({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, kind: "NOMINAL", value: 50_000, reason: "Member" }));
    await finalize(draft.id);
    expect(await costsOf(draft.line.id)).toEqual({ materialCost: 80_000, toolCost: 20_000, commissionAmount: 50_000 });
  });

  it("tanpa pelaksana tanpa komisi; komisi rupiah × jumlah; katalog berubah sesudahnya tidak mengubah salinan", async () => {
    const none = await visitDraft();
    await unwrap(setLinePerformer({ invoiceId: none.id, version: await versionOf(none.id), lineId: none.line.id, performerId: null }));
    await finalize(none.id);
    expect(await costsOf(none.line.id)).toEqual({ materialCost: 40_000, toolCost: 10_000, commissionAmount: 0 });

    await prisma.service.update({ where: { id: world.treatmentId }, data: { commissionKind: "NOMINAL", commissionValue: 15_000 } });
    const flat = await visitDraft();
    await finalize(flat.id);
    expect((await costsOf(flat.line.id)).commissionAmount).toBe(15_000);
    await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 99_000 } });
    expect((await costsOf(flat.line.id)).materialCost).toBe(40_000);
  });

  it("sesi paket Rp 0 tetap menyimpan biaya dan komisi; baris bebas tanpa layanan dan baris layanan 0 (Review Focus 4)", async () => {
    const packageId = await catalogPackage(world, { name: "Facial 3x" });
    const sale = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: sale.id, version: 1, packageId }));
    await finalize(sale.id);
    const itemId = (await prisma.patientPackageItem.findFirstOrThrow({ where: { patientPackage: { purchaseLine: { invoiceId: sale.id } } } })).id;
    const draft = await visitDraft();
    await unwrap(applyPackageSession({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, patientPackageItemId: itemId }));
    await unwrap(addFreeLine({ invoiceId: draft.id, version: await versionOf(draft.id), kind: "TREATMENT", name: "Bebas", quantity: 1, unitPrice: 10_000 }));
    await finalize(draft.id);
    expect(await costsOf(draft.line.id)).toEqual({ materialCost: 40_000, toolCost: 10_000, commissionAmount: 25_000 });
    const free = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: draft.id, name: "Bebas" } });
    const consult = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: draft.id, kind: "LAYANAN" } });
    expect(await costsOf(free.id)).toEqual({ materialCost: 0, toolCost: 0, commissionAmount: 0 });
    expect(await costsOf(consult.id)).toEqual({ materialCost: 0, toolCost: 0, commissionAmount: 0 });
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/invoice-costing.test.ts`
Expected: FAIL (salinan biaya masih 0).

- [ ] **Step 3: Implementasi** — `src/server/invoice-lifecycle.ts` `finalizeInvoice`:
- `select` baris mendapat `serviceId: true, performerId: true`;
- tepat sebelum `await consumePackageSessions(...)`:

```ts
      // Salinan biaya dan komisi baris treatment (spec harga modal 6, M9–M10): dibaca dari katalog saat final.
      const treatmentLines = invoice.lines.filter((line) => line.kind === "TREATMENT" && line.serviceId);
      if (treatmentLines.length > 0) {
        const services = await tx.service.findMany({
          where: { id: { in: treatmentLines.map((line) => line.serviceId!) } },
          select: { id: true, promoPrice: true, materialCost: true, toolCost: true, commissionKind: true, commissionValue: true },
        });
        for (const line of treatmentLines) {
          const costs = lineCosts({ quantity: line.quantity, hasPerformer: line.performerId !== null, service: services.find((s) => s.id === line.serviceId) ?? null });
          await tx.invoiceLine.update({ where: { id: line.id }, data: costs });
        }
      }
```

Impor `lineCosts` dari `@/lib/costing`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/invoice-costing.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/package-session.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS; tsc bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/invoice-lifecycle.ts tests/integration/invoice-costing.test.ts
git commit -m "feat: copy treatment costs and commissions onto invoice lines at finalize"
```

---

### Task 9: Margin di tagihan final

**Files:**
- Modify: `src/server/invoice-read.ts` (`InvoiceLineRow.costing`, `InvoiceDetail.margin` menggantikan `cost`)
- Modify: `src/components/admin/billing/invoice-final-view.tsx` (ringkasan "Margin", keterangan per baris)
- Modify (fixture): `tests/unit/invoice-final-view.test.tsx`, `tests/unit/invoice-draft-editor.test.tsx`, `tests/unit/components/line-discount-dialog.test.tsx`
- Modify: `tests/integration/cost-visibility.test.ts` (memakai `margin`/`costing`)
- Test: `tests/integration/invoice-margin.test.ts`, `tests/unit/invoice-final-view.test.tsx`

**Interfaces:**
- Consumes: Task 2 `marginOf`; Task 8 salinan.
- Produces:
  - `InvoiceLineRow.costing: { stockCost: number | null; materialCost: number; toolCost: number; commission: number; cost: number; margin: number } | null`, berisi `null` bagi peran tanpa `price:manage`. `stockCost` hanya untuk BARANG dan bernilai `null` bila ada harga pokok yang belum terisi; `cost` = `(stockCost ?? 0) + materialCost + toolCost + commission`; `margin` = `amount − cost`;
  - `InvoiceDetail.margin: { revenue: number; stockCost: number; materialCost: number; toolCost: number; commission: number; margin: number; missingStockCost: boolean } | null`, dengan `revenue` = `totals.total`;
  - `InvoiceLineRow.cost` dan `InvoiceDetail.cost` dihapus.

- [ ] **Step 1: Uji yang gagal**

`tests/integration/invoice-margin.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoiceFromVisit, setInvoiceDiscount } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Margin", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "margin-tagihan";
const WA = "6281200009707";
let world: BillingWorld;
let invoiceId: string;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await prisma.service.update({ where: { id: world.treatmentId }, data: { promoPrice: 250_000, materialCost: 40_000, toolCost: 10_000, commissionKind: "NOMINAL", commissionValue: 25_000 } });
  actor.role = "RESEPSIONIS";
  const { appointmentId } = await finalVisit(world);
  invoiceId = (await unwrap(createInvoiceFromVisit(appointmentId))).id;
  await unwrap(setInvoiceDiscount({ invoiceId, version: await versionOf(invoiceId), kind: "NOMINAL", value: 20_000, reason: "Member" }));
  await unwrap(finalizeInvoice({ invoiceId, version: await versionOf(invoiceId) }));
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await prisma.service.update({ where: { id: world.treatmentId }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("margin tagihan final", () => {
  it("ringkasan: pendapatan bersih dikurangi bahan, alat, dan komisi; per baris treatment", async () => {
    const detail = (await getInvoiceDetail(invoiceId))!;
    const revenue = detail.totals.total;
    expect(detail.margin).toEqual({ revenue, stockCost: 0, materialCost: 40_000, toolCost: 10_000, commission: 25_000, margin: revenue - 75_000, missingStockCost: false });
    const treatment = detail.lines.find((line) => line.kind === "TREATMENT")!;
    expect(treatment.costing).toEqual({ stockCost: null, materialCost: 40_000, toolCost: 10_000, commission: 25_000, cost: 75_000, margin: treatment.amount - 75_000 });
  });

  it("resepsionis tidak menerima angka margin (Review Focus 5)", async () => {
    actor.role = "RESEPSIONIS";
    const detail = (await getInvoiceDetail(invoiceId))!;
    expect(detail.margin).toBeNull();
    expect(detail.lines.every((line) => line.costing === null)).toBe(true);
  });
});
```

Di `tests/unit/invoice-final-view.test.tsx`:
- `cost: null` pada fixture baris menjadi `costing: null`;
- `cost: null` pada fixture tagihan menjadi `margin: null`;
- uji "harga pokok hanya tampil bila diizinkan" diganti:

```tsx
  it("margin hanya tampil bila diizinkan", () => {
    const withMargin = finalDetail({ margin: { revenue: 160_000, stockCost: 9000, materialCost: 40_000, toolCost: 10_000, commission: 25_000, margin: 76_000, missingStockCost: true } });
    const { rerender } = renderAdmin(<InvoiceFinalView detail={withMargin} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    expect(screen.queryByRole("region", { name: "Margin" })).not.toBeInTheDocument();
    rerender(<InvoiceFinalView detail={withMargin} today="2026-10-07" canManage canCorrect={false} canSeeCost />);
    const margin = screen.getByRole("region", { name: "Margin" });
    expect(margin).toHaveTextContent("Harga pokok barangRp 9.000");
    expect(margin).toHaveTextContent("Bahan dan alatRp 50.000");
    expect(margin).toHaveTextContent("KomisiRp 25.000");
    expect(margin).toHaveTextContent("MarginRp 76.000");
    expect(margin).toHaveTextContent("Harga pokok belum lengkap: menunggu harga beli.");
  });
```

Fixture baris di `tests/unit/invoice-draft-editor.test.tsx` dan `tests/unit/components/line-discount-dialog.test.tsx` juga berubah `cost: null` → `costing: null`. Di `tests/integration/cost-visibility.test.ts`:
- `detail.cost` → `detail.margin`;
- `line.cost === null` → `line.costing === null`;
- harapan Admin Keuangan `toBe(9000)` → `expect((await getInvoiceDetail(invoiceId))!.margin!.stockCost).toBe(9000)`.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/invoice-margin.test.ts` dan `npx vitest run tests/unit/invoice-final-view.test.tsx`
Expected: FAIL (`margin`/`costing` belum ada).

- [ ] **Step 3: Implementasi**

`src/server/invoice-read.ts` `getInvoiceDetail`:
- `select` baris mendapat `materialCost: true, toolCost: true, commissionAmount: true`;
- per baris (ganti `cost`):

```ts
    const stockCost =
      withCost && line.kind === "BARANG"
        ? line.stockUses.some((use) => use.unitCost === null)
          ? null
          : line.stockUses.reduce((sum, use) => sum + use.quantity * use.unitCost!, 0)
        : null;
    const amount = line.quantity * line.unitPrice - line.discountAmount;
    const cost = (stockCost ?? 0) + line.materialCost + line.toolCost + line.commissionAmount;
    // … di objek baris:
    costing: withCost ? { stockCost, materialCost: line.materialCost, toolCost: line.toolCost, commission: line.commissionAmount, cost, margin: amount - cost } : null,
```

- tagihan (ganti `cost`):

```ts
    margin: withCost
      ? (() => {
          const sum = (pick: (c: NonNullable<InvoiceLineRow["costing"]>) => number) => lines.reduce((total, line) => total + (line.costing ? pick(line.costing) : 0), 0);
          const stockCost = sum((c) => c.stockCost ?? 0);
          const materialCost = sum((c) => c.materialCost);
          const toolCost = sum((c) => c.toolCost);
          const commission = sum((c) => c.commission);
          const revenue = totals.total;
          return {
            revenue,
            stockCost,
            materialCost,
            toolCost,
            commission,
            margin: marginOf({ revenue, stockCost, materialCost, toolCost, commission }),
            missingStockCost: invoice.lines.some((line) => line.kind === "BARANG" && line.stockUses.some((use) => use.unitCost === null)),
          };
        })()
      : null,
```

  (`totals` = hasil `invoiceTotals(...)` yang dihitung sekali ke variabel sebelum objek dikembalikan).
- Perbarui tipe `InvoiceLineRow` dan `InvoiceDetail` sesuai Interfaces, dengan impor `marginOf` dari `@/lib/costing`.

`src/components/admin/billing/invoice-final-view.tsx`:
- **Blok lama dihapus:** `canSeeCost && detail.cost !== null` dengan teks "Harga pokok barang Rp X".
- **Ringkasan baru:** di bawah ringkasan tagihan, bila `canSeeCost && detail.margin`, tampilkan:

```tsx
          <Box component="section" aria-label="Margin" className="print:hidden" sx={{ alignSelf: "flex-end", width: "100%", maxWidth: 320, fontSize: "0.875rem", pt: 1, borderTop: 1, borderColor: "divider" }}>
            <Stack spacing={0.5}>
              <Stack direction="row" sx={row}><span>Harga pokok barang</span><span>{formatRupiah(detail.margin.stockCost)}</span></Stack>
              <Stack direction="row" sx={row}><span>Bahan dan alat</span><span>{formatRupiah(detail.margin.materialCost + detail.margin.toolCost)}</span></Stack>
              <Stack direction="row" sx={row}><span>Komisi</span><span>{formatRupiah(detail.margin.commission)}</span></Stack>
              <Stack direction="row" sx={{ ...row, fontWeight: 600 }}><span>Margin</span><span>{formatRupiah(detail.margin.margin)}</span></Stack>
              {detail.margin.missingStockCost && (
                <Typography variant="caption" component="p" sx={{ color: "warning.main" }}>
                  Harga pokok belum lengkap: menunggu harga beli.
                </Typography>
              )}
            </Stack>
          </Box>
```

- **Per baris** (di sel nama, setelah keterangan lain), bila `canSeeCost && line.costing && line.costing.cost > 0`:

```tsx
                    <Typography variant="caption" component="div" className="print:hidden" sx={{ color: "text.secondary" }}>
                      modal {formatRupiah(line.costing.cost)} · margin {formatRupiah(line.costing.margin)}
                    </Typography>
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/invoice-margin.test.ts tests/integration/cost-visibility.test.ts && npx vitest run tests/unit/invoice-final-view.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/components/line-discount-dialog.test.tsx && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih. Uji integrasi lama yang memakai `detail.cost` (cari dengan `grep -rn "\.cost\b" tests/integration`) diubah ke `detail.margin.stockCost`; catat sebagai Ruling.

- [ ] **Step 5: Commit**

```bash
git add src/server/invoice-read.ts src/components/admin/billing/invoice-final-view.tsx tests/integration/invoice-margin.test.ts tests/integration/cost-visibility.test.ts tests/unit/invoice-final-view.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/components/line-discount-dialog.test.tsx tests/integration
git commit -m "feat: invoice margin for finance"
```

---

### Task 10: Laporan untung-rugi — bahan dan alat masuk harga pokok

**Files:**
- Modify: `src/server/report-sql.ts` (`invoiceAggregates`: `cogs` + bahan + alat, `missingCost`)
- Modify: `src/lib/report.ts` (`RawReport.missingCost`, `ReportView.missingCost`)
- Modify: `src/server/report-read.ts` (dua tempat `RawReport`), `src/app/(admin)/admin/laporan/page.tsx` (peringatan)
- Modify (uji lama): `tests/unit/report.test.ts`, `tests/unit/report-ui.test.tsx`, `tests/integration/report-read.test.ts`
- Test: `tests/integration/report-cost.test.ts`

**Interfaces:**
- Produces:
  - `InvoiceAggregate.missingCost: number`, jumlah `InvoiceStockUse` tanpa harga dari tagihan final di periode itu;
  - `RawReport.missingCost: number`, `ReportView.missingCost: number`;
  - `cogs` = Σ harga pokok barang + Σ `materialCost` + Σ `toolCost`.

- [ ] **Step 1: Uji yang gagal** — `tests/integration/report-cost.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { getProfitReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Laporan", role: "ADMIN_KEUANGAN" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "laporan-modal";
const WA = "6281200009708";
let world: BillingWorld;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const purchase = await prisma.purchaseInvoice.create({
    data: {
      supplierId: world.supplierId,
      branchId: world.branchId,
      invoiceNumber: `${SLUG}-1`,
      invoiceDate: new Date(),
      dueDate: new Date(),
      total: null,
      createdById: "s",
      createdByName: "Uji",
      lines: { create: [{ itemId: world.productId, quantity: 5, unitCost: null }] },
    },
    select: { lines: { select: { id: true } } },
  });
  const batch = await prisma.stockBatch.create({ data: { itemId: world.productId, branchId: world.branchId, purchaseLineId: purchase.lines[0].id, unitCost: null, quantityReceived: 5, quantityRemaining: 4 } });
  const priced = await prisma.purchaseLine.create({ data: { invoiceId: (await prisma.purchaseInvoice.findFirstOrThrow({ where: { invoiceNumber: `${SLUG}-1` } })).id, itemId: world.productId, quantity: 1, unitCost: 3000 } });
  const pricedBatch = await prisma.stockBatch.create({ data: { itemId: world.productId, branchId: world.branchId, purchaseLineId: priced.id, unitCost: 3000, quantityReceived: 1, quantityRemaining: 0 } });
  await prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      status: "FINAL",
      number: `TG-2099-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      finalizedAt: new Date(),
      lines: {
        create: [
          { kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, materialCost: 40_000, toolCost: 10_000, commissionAmount: 25_000, performerId: world.therapistId, performerName: "Terapis Uji" },
          {
            kind: "BARANG",
            name: "Serum C",
            quantity: 2,
            unitPrice: 150_000,
            itemId: world.productId,
            stockUses: { create: [{ batchId: batch.id, quantity: 1, unitCost: null }, { batchId: pricedBatch.id, quantity: 1, unitCost: 3000 }] },
          },
        ],
      },
    },
  });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("harga pokok laporan untung-rugi", () => {
  it("harga pokok = barang + bahan + alat; komisi tidak ikut; harga pokok kosong dihitung dan diperingatkan", async () => {
    const report = await getProfitReport({ period: monthPeriod(witaDateString(new Date()).slice(0, 7)), branchId: world.branchId });
    expect(report.current.totals.cogs).toBe(3000 + 40_000 + 10_000);
    expect(report.current.missingCost).toBe(1);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/report-cost.test.ts`
Expected: FAIL (`cogs` 3000; `missingCost` belum ada).

- [ ] **Step 3: Implementasi**

`src/server/report-sql.ts` `invoiceAggregates`:
- CTE `lines` mendapat `COALESCE(SUM(l."materialCost" + l."toolCost"), 0) AS "treatmentCost",`;
- CTE `cost` menjadi:

```sql
    cost AS (
      SELECT l."invoiceId", SUM(u."quantity" * u."unitCost") AS cogs, COUNT(*) FILTER (WHERE u."unitCost" IS NULL) AS missing
      FROM "InvoiceStockUse" u
      JOIN "InvoiceLine" l ON l."id" = u."lineId"
      JOIN inv ON inv."id" = l."invoiceId"
      GROUP BY l."invoiceId"
    ),
```

- CTE `m`: `COALESCE(cost.cogs, 0) + COALESCE(lines."treatmentCost", 0) AS cogs,` dan `COALESCE(cost.missing, 0) AS missing,`;
- SELECT akhir mendapat `COALESCE(SUM(m.missing), 0) AS "missingCost",`;
- pemetaan `missingCost: Number(row.missingCost ?? 0)`;
- tipe `InvoiceAggregate.missingCost: number`;
- perbarui komentar fungsi: "harga pokok = barang (harga beli kosong dihitung 0) + bahan + alat treatment; komisi tidak (spec harga modal M3)".

**`src/lib/report.ts`:** `RawReport` dan `ReportView` mendapat `missingCost: number`. `summarizeReport` meneruskan `missingCost: raw.missingCost`.

**`src/server/report-read.ts`:**
- `collectReport` mengisi `missingCost: total?.missingCost ?? 0`;
- `collectTrend` mengisi `missingCost: 0`.

**`src/app/(admin)/admin/laporan/page.tsx`:** di bawah `ReportSummary`:

```tsx
        {report.current.missingCost > 0 && (
          <Alert severity="warning">
            {report.current.missingCost} baris barang belum punya harga pokok; laba bisa lebih tinggi dari sebenarnya. Isi harga beli di Stok → Barang masuk.
          </Alert>
        )}
```

**Uji lama:**
- tambahkan `missingCost: 0` pada setiap objek `RawReport` di `tests/unit/report.test.ts` dan `tests/unit/report-ui.test.tsx`;
- di oracle `tests/integration/report-read.test.ts`, `use.quantity * use.unitCost` menjadi `use.quantity * (use.unitCost ?? 0)`, dan harapan `toEqual` totals tidak berubah (bahan dan alat 0 di data uji itu).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/report-cost.test.ts tests/integration/report-read.test.ts tests/integration/report-package.test.ts tests/integration/report-line-discount.test.ts && npx vitest run tests/unit/report.test.ts tests/unit/report-ui.test.tsx && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/report-sql.ts src/lib/report.ts src/server/report-read.ts "src/app/(admin)/admin/laporan/page.tsx" tests/integration/report-cost.test.ts tests/integration/report-read.test.ts tests/unit/report.test.ts tests/unit/report-ui.test.tsx
git commit -m "feat: treatment material and tool costs in the profit report"
```

---

### Task 11: Tab "Margin" di Laporan

**Files:**
- Modify: `src/server/report-sql.ts` (`marginAggregates`)
- Modify: `src/server/report-read.ts` (`getMarginReport`)
- Create: `src/components/admin/report/margin-report.tsx`
- Modify: `src/app/(admin)/admin/laporan/page.tsx` (tab Ringkasan/Margin/Komisi), `src/components/admin/report/report-filter.tsx` (isian tersembunyi `tab`)
- Test: `tests/integration/report-margin.test.ts`, `tests/unit/components/margin-report.test.tsx`

**Interfaces:**
- Consumes: Task 2 `marginOf`, `marginPercent`; Task 8 salinan biaya.
- Produces:
  - `type MarginGroup = { revenue: number; stockCost: number; materialCost: number; toolCost: number; commission: number }`;
  - `type MarginReport = { goods: MarginGroup; treatment: MarginGroup; packageRevenue: number; invoiceDiscount: number; byItem: { name: string; quantity: number; revenue: number; cost: number }[]; byTreatment: { name: string; quantity: number; revenue: number; materialCost: number; toolCost: number; commission: number }[] }`;
  - `marginAggregates(start, end, branchId): Promise<MarginReport>`;
  - `getMarginReport({ period, branchId }): Promise<MarginReport>` (`profit:read`);
  - `MarginReportView({ report })`;
  - `ReportFilter` prop `tab?: string`.

- [ ] **Step 1: Uji yang gagal**

`tests/integration/report-margin.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { getMarginReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Margin", role: "ADMIN_KEUANGAN" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "laporan-margin";
const WA = "6281200009709";
let world: BillingWorld;
let seq = 0;
const number = () => `TG-2098-${String(++seq).padStart(4, "0")}`;

async function finalInvoice(lines: object[], extra: Record<string, unknown> = {}, status: "FINAL" | "DIBATALKAN" = "FINAL") {
  return prisma.invoice.create({
    data: { patientId: world.patientId, branchId: world.branchId, createdById: "s", createdByName: "Uji", status, number: number(), finalizedAt: new Date(), lines: { create: lines }, ...extra },
  });
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const packageId = await catalogPackage(world, { name: "Paket Margin" });
  const purchaseLine = await prisma.purchaseLine.create({
    data: {
      invoice: { create: { supplierId: world.supplierId, branchId: world.branchId, invoiceNumber: `${SLUG}-1`, invoiceDate: new Date(), dueDate: new Date(), total: 4000, createdById: "s", createdByName: "Uji" } },
      itemId: world.productId,
      quantity: 2,
      unitCost: 2000,
    },
  });
  const batch = await prisma.stockBatch.create({ data: { itemId: world.productId, branchId: world.branchId, purchaseLineId: purchaseLine.id, unitCost: 2000, quantityReceived: 2, quantityRemaining: 0 } });
  await finalInvoice(
    [
      { kind: "TREATMENT", name: "Facial Uji", quantity: 2, unitPrice: 250_000, discountAmount: 50_000, discountReason: "Member", discountSource: "MANUAL", serviceId: world.treatmentId, materialCost: 80_000, toolCost: 20_000, commissionAmount: 50_000, performerId: world.therapistId, performerName: "Terapis Uji" },
      { kind: "BARANG", name: "Serum C", quantity: 2, unitPrice: 150_000, itemId: world.productId, stockUses: { create: [{ batchId: batch.id, quantity: 2, unitCost: 2000 }] } },
      { kind: "PAKET", name: "Paket Margin", quantity: 1, unitPrice: 600_000, treatmentPackageId: packageId },
    ],
    { discountKind: "NOMINAL", discountValue: 30_000, discountReason: "Promo", discountByName: "Uji" },
  );
  await finalInvoice([{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, materialCost: 40_000 }], {}, "DIBATALKAN");
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("laporan margin", () => {
  it("per kelompok, per barang, per treatment; diskon tagihan terpisah; tagihan dibatalkan tidak dihitung", async () => {
    const report = await getMarginReport({ period: monthPeriod(witaDateString(new Date()).slice(0, 7)), branchId: world.branchId });
    expect(report.goods).toEqual({ revenue: 300_000, stockCost: 4000, materialCost: 0, toolCost: 0, commission: 0 });
    expect(report.treatment).toEqual({ revenue: 450_000, stockCost: 0, materialCost: 80_000, toolCost: 20_000, commission: 50_000 });
    expect(report.packageRevenue).toBe(600_000);
    expect(report.invoiceDiscount).toBe(30_000);
    expect(report.byItem).toEqual([{ name: "Serum C", quantity: 2, revenue: 300_000, cost: 4000 }]);
    expect(report.byTreatment).toEqual([{ name: "Facial Uji", quantity: 2, revenue: 450_000, materialCost: 80_000, toolCost: 20_000, commission: 50_000 }]);
  });
});
```

`tests/unit/components/margin-report.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarginReportView } from "@/components/admin/report/margin-report";
import { renderAdmin } from "../helpers/render-admin";

const report = {
  goods: { revenue: 300_000, stockCost: 4000, materialCost: 0, toolCost: 0, commission: 0 },
  treatment: { revenue: 450_000, stockCost: 0, materialCost: 80_000, toolCost: 20_000, commission: 50_000 },
  packageRevenue: 600_000,
  invoiceDiscount: 30_000,
  byItem: [{ name: "Serum C", quantity: 2, revenue: 300_000, cost: 4000 }],
  byTreatment: [{ name: "Facial Uji", quantity: 2, revenue: 450_000, materialCost: 80_000, toolCost: 20_000, commission: 50_000 }],
};

describe("MarginReportView", () => {
  it("ringkasan per kelompok dengan persen margin, lalu tabel per barang dan per treatment", () => {
    renderAdmin(<MarginReportView report={report} />);
    const summary = screen.getByRole("table", { name: "Margin per kelompok" });
    expect(summary).toHaveTextContent("Obat dan produkRp 300.000Rp 4.000Rp 296.000");
    expect(summary).toHaveTextContent("98,7%");
    expect(summary).toHaveTextContent("TreatmentRp 450.000Rp 150.000Rp 300.000");
    expect(summary).toHaveTextContent("PaketRp 600.000");
    expect(summary).toHaveTextContent("Diskon tagihan-Rp 30.000");
    expect(summary).toHaveTextContent("Total marginRp 1.166.000");
    expect(screen.getByRole("table", { name: "Margin per barang" })).toHaveTextContent("Serum C");
    expect(screen.getByRole("table", { name: "Margin per treatment" })).toHaveTextContent("Facial Uji2Rp 450.000");
  });
});
```

Total margin = 296.000 + 300.000 + 600.000 − 30.000 = 1.166.000. Persen ditampilkan dengan koma desimal Indonesia (`toLocaleString("id-ID")`).

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/report-margin.test.ts` dan `npx vitest run tests/unit/components/margin-report.test.tsx`
Expected: FAIL (fungsi dan komponen belum ada).

- [ ] **Step 3: Implementasi**

`src/server/report-sql.ts`:

```ts
export type MarginGroup = { revenue: number; stockCost: number; materialCost: number; toolCost: number; commission: number };
export type MarginReport = {
  goods: MarginGroup;
  treatment: MarginGroup;
  packageRevenue: number;
  invoiceDiscount: number;
  byItem: { name: string; quantity: number; revenue: number; cost: number }[];
  byTreatment: { name: string; quantity: number; revenue: number; materialCost: number; toolCost: number; commission: number }[];
};

/** Margin per kelompok (spec harga modal 7) dari tagihan FINAL di [start, end); pendapatan baris setelah diskon baris. */
export async function marginAggregates(start: Date, end: Date, branchId: string | null): Promise<MarginReport> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const inv = Prisma.sql`SELECT i."id", i."discountKind", i."discountValue" FROM "Invoice" i WHERE i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch}`;
  type N = bigint | number | null;
  const [groups, items, treatments, discounts] = await Promise.all([
    prisma.$queryRaw<{ kind: string; revenue: N; stock: N; material: N; tool: N; commission: N }[]>`
      WITH inv AS (${inv})
      SELECT l."kind" AS kind,
             SUM(l."quantity" * l."unitPrice" - l."discountAmount") AS revenue,
             SUM((SELECT COALESCE(SUM(u."quantity" * u."unitCost"), 0) FROM "InvoiceStockUse" u WHERE u."lineId" = l."id")) AS stock,
             SUM(l."materialCost") AS material, SUM(l."toolCost") AS tool, SUM(l."commissionAmount") AS commission
      FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId"
      GROUP BY l."kind"`,
    prisma.$queryRaw<{ name: string; quantity: N; revenue: N; cost: N }[]>`
      WITH inv AS (${inv})
      SELECT l."name" AS name, SUM(l."quantity") AS quantity, SUM(l."quantity" * l."unitPrice" - l."discountAmount") AS revenue,
             SUM((SELECT COALESCE(SUM(u."quantity" * u."unitCost"), 0) FROM "InvoiceStockUse" u WHERE u."lineId" = l."id")) AS cost
      FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId"
      WHERE l."kind" = 'BARANG'
      GROUP BY l."name" ORDER BY 3 DESC, 1`,
    prisma.$queryRaw<{ name: string; quantity: N; revenue: N; material: N; tool: N; commission: N }[]>`
      WITH inv AS (${inv})
      SELECT l."name" AS name, SUM(l."quantity") AS quantity, SUM(l."quantity" * l."unitPrice" - l."discountAmount") AS revenue,
             SUM(l."materialCost") AS material, SUM(l."toolCost") AS tool, SUM(l."commissionAmount") AS commission
      FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId"
      WHERE l."kind" = 'TREATMENT'
      GROUP BY l."name" ORDER BY 2 DESC, 1`,
    prisma.$queryRaw<{ discount: N }[]>`
      WITH inv AS (${inv}),
      sub AS (SELECT l."invoiceId", SUM(l."quantity" * l."unitPrice" - l."discountAmount") AS subtotal FROM "InvoiceLine" l JOIN inv ON inv."id" = l."invoiceId" GROUP BY l."invoiceId")
      SELECT COALESCE(SUM(CASE
        WHEN inv."discountKind" = 'PERSEN' AND inv."discountValue" > 0 THEN (COALESCE(sub.subtotal, 0) * LEAST(inv."discountValue", 100)) / 100
        WHEN inv."discountKind" = 'NOMINAL' AND inv."discountValue" > 0 THEN LEAST(inv."discountValue"::bigint, COALESCE(sub.subtotal, 0))
        ELSE 0 END), 0) AS discount
      FROM inv LEFT JOIN sub ON sub."invoiceId" = inv."id"`,
  ]);
  const num = (value: N) => Number(value ?? 0);
  const group = (kind: string): MarginGroup => {
    const row = groups.find((g) => g.kind === kind);
    return { revenue: num(row?.revenue ?? 0), stockCost: num(row?.stock ?? 0), materialCost: num(row?.material ?? 0), toolCost: num(row?.tool ?? 0), commission: num(row?.commission ?? 0) };
  };
  const goods = group("BARANG");
  return {
    goods: { ...goods, materialCost: 0, toolCost: 0, commission: 0 },
    treatment: { ...group("TREATMENT"), stockCost: 0 },
    packageRevenue: group("PAKET").revenue,
    invoiceDiscount: num(discounts[0]?.discount ?? 0),
    byItem: items.map((row) => ({ name: row.name, quantity: num(row.quantity), revenue: num(row.revenue), cost: num(row.cost) })),
    byTreatment: treatments.map((row) => ({ name: row.name, quantity: num(row.quantity), revenue: num(row.revenue), materialCost: num(row.material), toolCost: num(row.tool), commission: num(row.commission) })),
  };
}
```

Rumus diskon tagihan harus sama dengan `invoiceAggregates` dan `src/lib/invoice.ts`.

`src/server/report-read.ts`:

```ts
/** Tab "Margin" (spec harga modal 7). */
export async function getMarginReport(filter: { period: ReportPeriod; branchId: string | null }): Promise<MarginReport> {
  await requireCapability("profit:read");
  const checked = validatePeriod(filter.period);
  if (!checked.ok) throw new Error(checked.message);
  const { start, end } = periodInstants(checked.value);
  return marginAggregates(start, end, filter.branchId);
}
```

`src/components/admin/report/margin-report.tsx`: komponen server (tanpa `"use client"`) yang merender:
- tabel `aria-label="Margin per kelompok"` dengan kolom Kelompok, Pendapatan, Modal, Margin, %. Barisnya:
  - "Obat dan produk": modal = harga pokok;
  - "Treatment": modal = bahan + alat + komisi;
  - "Paket": hanya pendapatan, dengan catatan kecil "biaya sesi paket sudah di Treatment";
  - "Diskon tagihan": `-formatRupiah(invoiceDiscount)`;
  - "Total margin" (tebal) = margin obat + margin treatment + pendapatan paket − diskon tagihan.
- Persen dihitung dengan `marginPercent(margin, revenue)` lalu ditulis `${percent.toLocaleString("id-ID")}%`, atau "—" bila `null`.
- Margin dihitung dengan `marginOf`.
- tabel `aria-label="Margin per barang"`: Barang, Terjual, Pendapatan, Harga pokok, Margin;
- tabel `aria-label="Margin per treatment"`: Treatment, Dilakukan, Pendapatan, Bahan, Alat, Komisi, Margin;
- bila kosong: `EmptyState` "Belum ada transaksi di periode ini.".

Ikuti pola tabel MUI di `src/components/admin/report/report-detail.tsx` (`TableContainer`, `Table size="small"`, angka rata kanan).

`src/components/admin/report/report-filter.tsx`: prop `tab?: string`; di dalam `<Form>`, `{tab && <input type="hidden" name="tab" value={tab} />}`.

`src/app/(admin)/admin/laporan/page.tsx`:
- `Search` mendapat `tab?: string; pelaksana?: string`;
- `const tab = resolveTab(params.tab, ["ringkasan", "margin", "komisi"] as const);`;
- `const base = new URLSearchParams({ periode: preset, dari: period.from, sampai: period.to, ...(branchId ? { cabang: branchId } : {}) });`;
- `PageTabs label="Bagian laporan" active={tab}` dengan tiga tab:
  - "Ringkasan" → `/admin/laporan?${base}`;
  - "Margin" → `/admin/laporan?${base}&tab=margin`;
  - "Komisi" → `/admin/laporan?${base}&tab=komisi`;
- `ReportFilter` mendapat `tab={tab === "ringkasan" ? undefined : tab}`;
- isi lama (ringkasan, rincian, arus kas, sesi paket, tren) hanya untuk `tab === "ringkasan"`;
- tab margin: `<SectionCard title="Margin" flush><MarginReportView report={await getMarginReport({ period, branchId })} /></SectionCard>`;
- `getProfitReport` tetap dipanggil, karena judul halaman memakai `report.branchName` dan `previousPeriod`. Tab Komisi dibuat di Task 12; sampai saat itu tab Komisi menampilkan `EmptyState` "Belum tersedia." dan Task 12 menggantinya.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/report-margin.test.ts && npx vitest run tests/unit/components/margin-report.test.tsx tests/unit/report-filter.test.tsx tests/unit/report-ui.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/report-sql.ts src/server/report-read.ts src/components/admin/report/margin-report.tsx src/components/admin/report/report-filter.tsx "src/app/(admin)/admin/laporan/page.tsx" tests/integration/report-margin.test.ts tests/unit/components/margin-report.test.tsx
git commit -m "feat: margin report tab for goods, treatments, and packages"
```

---

### Task 12: Tab "Komisi" di Laporan dan unduhan CSV

**Files:**
- Modify: `src/server/report-sql.ts` (`commissionByPerformer`, `commissionDetails`)
- Modify: `src/server/report-read.ts` (`getCommissionReport`)
- Modify: `src/server/report-export.ts` (`exportCommissionCsv`), `src/app/(admin)/admin/laporan/unduh/route.ts` (`?jenis=komisi`)
- Modify: `src/lib/report.ts` (`commissionCsvRows`)
- Create: `src/components/admin/report/commission-report.tsx`
- Modify: `src/app/(admin)/admin/laporan/page.tsx` (isi tab Komisi)
- Test: `tests/integration/report-commission.test.ts`, `tests/unit/components/commission-report.test.tsx`, `tests/unit/report.test.ts`

**Interfaces:**
- Produces:
  - `type CommissionRow = { performerId: string; performerName: string; treatments: number; commission: number }`;
  - `type CommissionDetailRow = { finalizedAt: Date; invoiceId: string; invoiceNumber: string; customerName: string; treatment: string; quantity: number; commission: number; performerName: string }`;
  - `commissionByPerformer(start, end, branchId)`, `commissionDetails(start, end, branchId, performerId: string | null)`;
  - `getCommissionReport({ period, branchId, performerId }): Promise<{ rows: CommissionRow[]; details: CommissionDetailRow[] | null }>` (rincian hanya bila `performerId` diisi);
  - `exportCommissionCsv({ period, branchId })`;
  - `commissionCsvRows(meta, details)`;
  - `CommissionReportView({ rows, details, selected, hrefFor, downloadHref })`.

- [ ] **Step 1: Uji yang gagal**

`tests/integration/report-commission.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { exportCommissionCsv } from "@/server/report-export";
import { getCommissionReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Komisi", role: "ADMIN_KEUANGAN" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "laporan-komisi";
const WA = "6281200009710";
let world: BillingWorld;
let seq = 0;
const period = () => monthPeriod(witaDateString(new Date()).slice(0, 7));

async function invoice(lines: object[], status: "FINAL" | "DIBATALKAN" = "FINAL") {
  return prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      status,
      number: `TG-2097-${String(++seq).padStart(4, "0")}`,
      finalizedAt: new Date(),
      lines: { create: lines },
    },
  });
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const rina = { performerId: world.therapistId, performerName: "Rina" };
  const doc = { performerId: world.doctorId, performerName: "dr. Uji" };
  await invoice([
    { kind: "TREATMENT", name: "Facial Uji", quantity: 2, unitPrice: 250_000, serviceId: world.treatmentId, commissionAmount: 50_000, ...rina },
    { kind: "TREATMENT", name: "Meso Uji", quantity: 1, unitPrice: 550_000, serviceId: world.slimmingTreatmentId, commissionAmount: 30_000, ...doc },
  ]);
  await invoice([{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, commissionAmount: 25_000, ...rina }]);
  await invoice([{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, commissionAmount: 25_000, ...rina }], "DIBATALKAN");
  await invoice([{ kind: "TREATMENT", name: "Tanpa pelaksana", quantity: 1, unitPrice: 1000 }]);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("laporan komisi pelaksana", () => {
  it("per pelaksana: jumlah treatment dan total komisi; tagihan dibatalkan dan baris tanpa pelaksana tidak dihitung", async () => {
    const { rows, details } = await getCommissionReport({ period: period(), branchId: world.branchId, performerId: null });
    expect(rows).toEqual([
      { performerId: world.therapistId, performerName: "Rina", treatments: 3, commission: 75_000 },
      { performerId: world.doctorId, performerName: "dr. Uji", treatments: 1, commission: 30_000 },
    ]);
    expect(details).toBeNull();
  });

  it("rincian satu pelaksana dan CSV semua rincian", async () => {
    const { details } = await getCommissionReport({ period: period(), branchId: world.branchId, performerId: world.therapistId });
    expect(details!.map((d) => [d.treatment, d.quantity, d.commission])).toEqual(
      expect.arrayContaining([
        ["Facial Uji", 2, 50_000],
        ["Facial Uji", 1, 25_000],
      ]),
    );
    expect(details).toHaveLength(2);
    const { filename, csv } = await exportCommissionCsv({ period: period(), branchId: world.branchId });
    expect(filename).toMatch(/^komisi-pelaksana-/);
    expect(csv).toContain("Pelaksana,Tanggal,Tagihan,Customer,Treatment,Jumlah,Komisi (Rp)");
    expect(csv).toContain("dr. Uji");
  });
});
```

Di `tests/unit/report.test.ts`, tambahkan:

```ts
describe("commissionCsvRows", () => {
  it("kepala, periode, lalu satu baris per rincian", () => {
    const rows = commissionCsvRows({ period: { from: "2026-10-01", to: "2026-10-31" }, branchName: "Semua cabang" }, [
      { finalizedAt: new Date("2026-10-05T03:00:00Z"), invoiceId: "i1", invoiceNumber: "TG-2026-0001", customerName: "Ani", treatment: "Facial", quantity: 2, commission: 50_000, performerName: "Rina" },
    ]);
    expect(rows[0]).toEqual(["Komisi pelaksana"]);
    expect(rows).toContainEqual(["Pelaksana", "Tanggal", "Tagihan", "Customer", "Treatment", "Jumlah", "Komisi (Rp)"]);
    expect(rows).toContainEqual(["Rina", "2026-10-05", "TG-2026-0001", "Ani", "Facial", 2, 50_000]);
  });
});
```

`tests/unit/components/commission-report.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommissionReportView } from "@/components/admin/report/commission-report";
import { renderAdmin } from "../helpers/render-admin";

const rows = [
  { performerId: "t1", performerName: "Rina", treatments: 3, commission: 75_000 },
  { performerId: "d1", performerName: "dr. Uji", treatments: 1, commission: 30_000 },
];

describe("CommissionReportView", () => {
  it("daftar pelaksana bertaut ke rinciannya; rincian tampil bila dipilih", () => {
    renderAdmin(
      <CommissionReportView
        rows={rows}
        details={[{ finalizedAt: new Date("2026-10-05T03:00:00Z"), invoiceId: "i1", invoiceNumber: "TG-2026-0001", customerName: "Ani", treatment: "Facial", quantity: 2, commission: 50_000, performerName: "Rina" }]}
        selected="t1"
        hrefFor={(id) => `/admin/laporan?tab=komisi&pelaksana=${id}`}
        downloadHref="/admin/laporan/unduh?jenis=komisi"
      />,
    );
    const table = screen.getByRole("table", { name: "Komisi per pelaksana" });
    expect(table).toHaveTextContent("Rina3Rp 75.000");
    expect(table).toHaveTextContent("TotalRp 105.000");
    expect(screen.getByRole("link", { name: "dr. Uji" })).toHaveAttribute("href", "/admin/laporan?tab=komisi&pelaksana=d1");
    const detail = screen.getByRole("table", { name: "Rincian komisi Rina" });
    expect(detail).toHaveTextContent("TG-2026-0001");
    expect(detail).toHaveTextContent("Rp 50.000");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/report-commission.test.ts` dan `npx vitest run tests/unit/components/commission-report.test.tsx tests/unit/report.test.ts`
Expected: FAIL (fungsi dan komponen belum ada).

- [ ] **Step 3: Implementasi**

`src/server/report-sql.ts`:

```ts
export type CommissionRow = { performerId: string; performerName: string; treatments: number; commission: number };
export type CommissionDetailRow = {
  finalizedAt: Date;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  treatment: string;
  quantity: number;
  commission: number;
  performerName: string;
};

/** Komisi per pelaksana (spec harga modal 7): baris TREATMENT berpelaksana dari tagihan FINAL di [start, end). Nama terbaru per pelaksana. */
export async function commissionByPerformer(start: Date, end: Date, branchId: string | null): Promise<CommissionRow[]> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ performerId: string; performerName: string; treatments: bigint | number; commission: bigint | number }[]>`
    SELECT l."performerId" AS "performerId", MAX(l."performerName") AS "performerName",
           SUM(l."quantity") AS treatments, SUM(l."commissionAmount") AS commission
    FROM "InvoiceLine" l JOIN "Invoice" i ON i."id" = l."invoiceId"
    WHERE i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch}
      AND l."kind" = 'TREATMENT' AND l."performerId" IS NOT NULL
    GROUP BY l."performerId"
    ORDER BY 4 DESC, 2`;
  return rows.map((row) => ({ performerId: row.performerId, performerName: row.performerName, treatments: Number(row.treatments), commission: Number(row.commission) }));
}

export async function commissionDetails(start: Date, end: Date, branchId: string | null, performerId: string | null): Promise<CommissionDetailRow[]> {
  const branch = branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty;
  const performer = performerId ? Prisma.sql`AND l."performerId" = ${performerId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<(Omit<CommissionDetailRow, "quantity" | "commission"> & { quantity: bigint | number; commission: bigint | number })[]>`
    SELECT i."finalizedAt" AS "finalizedAt", i."id" AS "invoiceId", i."number" AS "invoiceNumber", p."name" AS "customerName",
           l."name" AS treatment, l."quantity" AS quantity, l."commissionAmount" AS commission, l."performerName" AS "performerName"
    FROM "InvoiceLine" l JOIN "Invoice" i ON i."id" = l."invoiceId" JOIN "Patient" p ON p."id" = i."patientId"
    WHERE i."status" = 'FINAL' AND i."finalizedAt" >= ${start} AND i."finalizedAt" < ${end} ${branch} ${performer}
      AND l."kind" = 'TREATMENT' AND l."performerId" IS NOT NULL
    ORDER BY l."performerName", i."finalizedAt", i."number"`;
  return rows.map((row) => ({ ...row, quantity: Number(row.quantity), commission: Number(row.commission) }));
}
```

`src/server/report-read.ts`:

```ts
/** Tab "Komisi" (spec harga modal 7). Rincian hanya untuk pelaksana yang dipilih. */
export async function getCommissionReport(filter: { period: ReportPeriod; branchId: string | null; performerId: string | null }) {
  await requireCapability("profit:read");
  const checked = validatePeriod(filter.period);
  if (!checked.ok) throw new Error(checked.message);
  const { start, end } = periodInstants(checked.value);
  const [rows, details] = await Promise.all([
    commissionByPerformer(start, end, filter.branchId),
    filter.performerId ? commissionDetails(start, end, filter.branchId, filter.performerId) : Promise.resolve(null),
  ]);
  return { rows, details };
}
```

`src/lib/report.ts`:

```ts
export function commissionCsvRows(
  meta: { period: ReportPeriod; branchName: string },
  details: readonly { finalizedAt: Date; invoiceNumber: string; customerName: string; treatment: string; quantity: number; commission: number; performerName: string }[],
): (string | number)[][] {
  return [
    ["Komisi pelaksana"],
    ["Periode", meta.period.from, meta.period.to],
    ["Cabang", meta.branchName],
    [],
    ["Pelaksana", "Tanggal", "Tagihan", "Customer", "Treatment", "Jumlah", "Komisi (Rp)"],
    ...details.map((d) => [d.performerName, witaDateString(d.finalizedAt), d.invoiceNumber, d.customerName, d.treatment, d.quantity, d.commission]),
  ];
}
```

(impor `witaDateString` dari `./time`).

`src/server/report-export.ts`, fungsi baru dengan pola yang sama seperti `exportReportCsv`:

```ts
export async function exportCommissionCsv(filter: { period: ReportPeriod; branchId: string | null }): Promise<{ filename: string; csv: string }> {
  const actor = await requireCapability("profit:read");
  const checked = validatePeriod(filter.period);
  if (!checked.ok) throw new ReportInputError(checked.message);
  let branchName = "Semua cabang";
  if (filter.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: filter.branchId }, select: { name: true } });
    if (!branch) throw new ReportInputError("Cabang tidak ditemukan.");
    branchName = branch.name;
  }
  const { start, end } = periodInstants(checked.value);
  const details = await commissionDetails(start, end, filter.branchId, null);
  const { from, to } = checked.value;
  await recordAudit({ actor, action: "report.export", entity: "Report", entityId: `komisi_${from}_${to}`, summary: `Komisi ${from} sampai ${to} · ${branchName}` });
  return { filename: `komisi-pelaksana-${from}-${to}.csv`, csv: toCsv(commissionCsvRows({ period: checked.value, branchName }, details)) };
}
```

`src/app/(admin)/admin/laporan/unduh/route.ts`: pilih ekspor dengan `params.get("jenis") === "komisi" ? exportCommissionCsv : exportReportCsv`, memakai argumen yang sama.

`src/components/admin/report/commission-report.tsx`: komponen server yang merender:
- tombol `LinkButton` "Unduh CSV komisi" (`href={downloadHref}`, `download`, `variant="outlined"`);
- tabel `aria-label="Komisi per pelaksana"` dengan kolom Pelaksana (`TextLink` ke `hrefFor(id)`), Treatment, dan Komisi, ditambah baris "Total" (tebal);
- bila `details` tidak null: tabel `aria-label={`Rincian komisi ${nama terpilih}`}` dengan kolom Tanggal (`formatDateWithYear(finalizedAt)`), Tagihan (`TextLink` ke `/admin/tagihan/{invoiceId}`), Customer, Treatment, Jumlah, dan Komisi;
- `EmptyState` "Belum ada komisi di periode ini." bila `rows` kosong;
- keterangan kecil di bawah judul: "Komisi persen dihitung dari harga katalog treatment, bukan harga setelah diskon. Hanya tagihan final."

`src/app/(admin)/admin/laporan/page.tsx` tab `komisi` (menggantikan "Belum tersedia."):

```tsx
        {tab === "komisi" && (
          <SectionCard title="Komisi pelaksana" flush>
            <CommissionReportView
              {...(await getCommissionReport({ period, branchId, performerId: typeof params.pelaksana === "string" ? params.pelaksana : null }))}
              selected={typeof params.pelaksana === "string" ? params.pelaksana : null}
              hrefFor={(id) => `/admin/laporan?${base}&tab=komisi&pelaksana=${encodeURIComponent(id)}`}
              downloadHref={`/admin/laporan/unduh?${query.toString()}&jenis=komisi`}
            />
          </SectionCard>
        )}
```

`hrefFor` adalah fungsi yang diteruskan ke komponen server; ini sah karena komponennya bukan komponen klien. Tombol "Unduh CSV" di header halaman hanya dirender untuk tab Ringkasan.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/report-commission.test.ts tests/integration/report-export.test.ts && npx vitest run tests/unit/components/commission-report.test.tsx tests/unit/report.test.ts tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/report-sql.ts src/server/report-read.ts src/server/report-export.ts "src/app/(admin)/admin/laporan" src/lib/report.ts src/components/admin/report/commission-report.tsx tests/integration/report-commission.test.ts tests/unit/components/commission-report.test.tsx tests/unit/report.test.ts
git commit -m "feat: commission report per performer with CSV export"
```

---

### Task 13: E2E dan penyesuaian alur lama

**Files:**
- Modify: `tests/e2e/helpers/harga.ts` (`isiHargaBeli`)
- Modify: `tests/e2e/stok-hutang.spec.ts`, `tests/e2e/resep.spec.ts`, `tests/e2e/tagihan.spec.ts`, `tests/e2e/tagihan-diskon.spec.ts` (Apoteker tanpa harga beli)
- Modify: `tests/e2e/prepare-db.mts` (pasien dengan kunjungan final untuk komisi; atur ulang biaya Relaxing Facial)
- Create: `tests/e2e/harga-modal.spec.ts`

**Interfaces:**
- Produces: `isiHargaBeli(browser: Browser, invoiceUrl: string, prices: string[]): Promise<void>`.

- [ ] **Step 1: Helper** — tambahkan di `tests/e2e/helpers/harga.ts`:

```ts
/** Harga beli faktur barang masuk diisi Admin Keuangan di konteks terpisah (spec harga modal 4). */
export async function isiHargaBeli(browser: Browser, invoiceUrl: string, prices: string[]): Promise<void> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await context.newPage();
  await signIn(page, E2E_KEUANGAN);
  await page.goto(invoiceUrl);
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "Isi harga beli" }).click();
  const dialog = page.getByRole("dialog", { name: "Isi harga beli" });
  const fields = dialog.getByLabel(/^Harga beli /);
  for (const [index, price] of prices.entries()) await fields.nth(index).fill(price);
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await context.close();
}
```

- [ ] **Step 2: Alur lama**
- **Semua empat spec:** hapus setiap `getByLabel("Harga beli baris N").fill(...)` (Apoteker tidak lagi melihat isian itu).
- **`stok-hutang.spec.ts`:**
  - uji pertama sudah memakai `browser` (dari rencana sebelumnya); bila belum, tambahkan `browser` ke argumen;
  - tepat sesudah barang masuk tersimpan (URL detail `/admin/stok/masuk/{id}`) dan **sebelum** retur, panggil `await isiHargaBeli(browser, page.url(), ["5000", "5000"]);` lalu `await page.reload();`;
  - uji Admin Keuangan yang membayar hutang tidak berubah, karena total faktur sama (2 baris × jumlah lama × Rp 5.000).
- **`resep.spec.ts`, `tagihan.spec.ts`, `tagihan-diskon.spec.ts`:** cukup menghapus isian harga, karena alurnya tidak membayar atau meretur ke supplier.
- Impor `isiHargaBeli` hanya di spec yang memakainya.

- [ ] **Step 3: Data awal** — `tests/e2e/prepare-db.mts`, setelah blok paket treatment:

```ts
// Harga modal (harga-modal.spec.ts): biaya Relaxing Facial dimulai 0, dan per proyek satu pasien dengan kunjungan final
// berisi Relaxing Facial pukul 23.00 (desktop) / 23.30 (ponsel), pelaksana dokter seed.
await prisma.service.update({ where: { slug: "relaxing-facial" }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-MODAL-${index + 1}`, name: `Pasien Modal ${project}`, whatsapp: `6281200092${index}01`, birthDate: new Date("1994-06-17T00:00:00Z"), gender: "P" },
  });
  const startAt = combineWitaDateAndMinutes(today, 23 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-MODAL-${index + 1}`,
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
    data: { status: "FINAL", assessment: "E2E modal", finalizedAt: new Date(), finalizedById: visitDoctor.id, finalizedByName: visitDoctor.name },
  });
}
```

Bila jam 23.00/23.30 bentrok dengan seed lain untuk dokter yang sama, geser ke jam kosong lain di luar jam buka dan catat sebagai Ruling.

- [ ] **Step 4: Spec baru** — `tests/e2e/harga-modal.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

test.setTimeout(240_000);

test("Admin Keuangan mengisi biaya treatment; resepsionis menagih dengan pelaksana tanpa melihat angka; margin dan komisi tampil bagi keuangan", async ({ page, browser }, testInfo) => {
  const project = testInfo.project.name === "mobile" ? "mobile" : "desktop";
  const patientName = `Pasien Modal ${project}`;

  // Apoteker: tanpa harga beli dan nilai stok.
  const pharmacy = await browser.newContext({ baseURL: E2E_BASE_URL });
  const ap = await pharmacy.newPage();
  await signIn(ap, E2E_APOTEKER);
  await ap.goto("/admin/stok");
  await tungguHidrasi(ap);
  await expect(ap.getByText("Nilai stok (harga beli)")).toHaveCount(0);
  await ap.goto("/admin/stok/masuk/baru");
  await tungguHidrasi(ap);
  await expect(ap.getByLabel("Harga beli baris 1")).toHaveCount(0);
  await pharmacy.close();

  // Admin Keuangan: biaya Relaxing Facial.
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/layanan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "Biaya Relaxing Facial" }).click();
  const cost = page.getByRole("dialog", { name: "Biaya Relaxing Facial" });
  await cost.getByLabel("Biaya bahan").fill("30000");
  await cost.getByLabel("Biaya alat").fill("5000");
  await cost.getByLabel("Komisi").selectOption("NOMINAL");
  await cost.getByLabel("Komisi per sesi").fill("15000");
  await cost.getByRole("button", { name: "Simpan" }).click();
  await expect(cost).toBeHidden({ timeout: 30_000 });

  // Resepsionis: pelaksana terisi dari kunjungan, tanpa angka biaya atau komisi.
  const desk = await browser.newContext({ baseURL: E2E_BASE_URL });
  const rp = await desk.newPage();
  await signIn(rp, E2E_RESEPSIONIS);
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: `Buat tagihan ${patientName}` }).click();
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await expect(rp.getByLabel("Pelaksana Relaxing Facial")).not.toHaveValue("", { timeout: 30_000 });
  await expect(rp.getByText("Rp 15.000")).toHaveCount(0);
  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });
  await expect(rp.getByRole("region", { name: "Margin" })).toHaveCount(0);
  const invoiceUrl = rp.url();
  await desk.close();

  // Admin Keuangan: margin tagihan dan tab Komisi.
  await page.goto(invoiceUrl);
  await tungguHidrasi(page);
  const margin = page.getByRole("region", { name: "Margin" });
  await expect(margin).toContainText("Bahan dan alatRp 35.000", { timeout: 30_000 });
  await expect(margin).toContainText("KomisiRp 15.000");
  await page.goto("/admin/laporan?tab=komisi");
  await tungguHidrasi(page);
  await expect(page.getByRole("table", { name: "Komisi per pelaksana" })).toContainText("Rp 15.000", { timeout: 30_000 });
  await page.goto("/admin/laporan?tab=margin");
  await tungguHidrasi(page);
  await expect(page.getByRole("table", { name: "Margin per treatment" })).toContainText("Relaxing Facial");
});
```

Catatan: E2E desktop dan mobile berjalan berurutan pada basis data yang sama, sehingga biaya Relaxing Facial yang diisi proyek pertama tetap ada di proyek kedua. Pengisian ulang memakai nilai yang sama, jadi harapan tetap benar. Tab Komisi menjumlahkan semua tagihan bulan ini; harapan "Rp 15.000" dicocokkan sebagai teks yang dikandung, dan setelah proyek kedua bisa menjadi "Rp 30.000". Bila begitu, cocokkan dengan pola `/Rp (15|30)\.000/` dan catat sebagai Ruling.

- [ ] **Step 5: Jalankan E2E**

```bash
npx playwright test tests/e2e/harga-modal.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/stok-hutang.spec.ts tests/e2e/resep.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/paket.spec.ts tests/e2e/struk.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/harga-modal.spec.ts tests/e2e/stok-hutang.spec.ts tests/e2e/resep.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/paket.spec.ts tests/e2e/struk.spec.ts --project=mobile --workers=1
```

Expected: PASS. Sebelum suite integrasi penuh sesudahnya, jalankan perintah pembersih di Global Constraints.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/helpers/harga.ts tests/e2e/stok-hutang.spec.ts tests/e2e/resep.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/prepare-db.mts tests/e2e/harga-modal.spec.ts
git commit -m "test: e2e for purchase prices, treatment costs, margins, and commissions"
```

---

## Self-Review (hasil pemeriksaan penulis rencana)

**Cakupan spec:**

| Bagian spec | Task |
|---|---|
| §3 data | 1 |
| §4 barang masuk dua langkah | 3 (server), 4 (layar); hutang dan retur di 3 |
| §5 biaya dan komisi treatment | 2, 6 |
| §6 pelaksana dan salinan biaya | 7, 8 |
| §7 margin tagihan | 9 |
| §7 laporan untung-rugi | 10 |
| §7 tab Margin | 11 |
| §7 tab Komisi dan CSV | 12 |
| §8 menyembunyikan harga | 5, ditambah UI di 4 dan 9 |
| §9 teknis | migrasi Task 1, kunci di Task 3 |
| §10 keamanan | server mengosongkan kolom di Task 5 dan 9; hak di setiap aksi |
| §11 pengujian | setiap task + Task 13 |
| §12 rilis | E2E lama disesuaikan di Task 13 |

**Pindai placeholder:** instruksi bersyarat yang sengaja ada masing-masing memberi tindakan pasti dan kewajiban Ruling:
- urutan FEFO di uji Task 3;
- jam seed E2E;
- teks total komisi E2E.

**Konsistensi tipe dan nama:**
- `lineCosts`/`CostedService` (Task 2) dipakai Task 8;
- `validatePurchasePrices` (Task 2) dipakai Task 3, 4;
- `setPurchasePrices` (Task 3) dipakai Task 4, 13;
- `PurchaseDetail.canSeeCost`/`canReprice` (Task 4, 5);
- `InvoiceLineRow.performerId/performerName` (Task 7) dipakai Task 8, 9;
- `InvoiceLineRow.costing`/`InvoiceDetail.margin` (Task 9) menggantikan `cost` (Task 5 masih memakai `cost`; Task 9 memperbarui uji Task 5);
- `MarginReport` (Task 11), `CommissionRow`/`CommissionDetailRow` (Task 12);
- `ReportFilter` prop `tab` (Task 11) dipakai Task 12.

Label sama di komponen, uji, dan E2E: "Isi harga beli", "Harga beli {label}", "Biaya {layanan}", "Biaya bahan", "Biaya alat", "Komisi", "Komisi per sesi", "Komisi persen", "Pelaksana {baris}", "Margin", "Bahan dan alat", "Komisi per pelaksana", "Margin per kelompok", "Margin per barang", "Margin per treatment".
