# Stok Gudang dan Stok Meja Resepsionis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stok tiap cabang terbagi menjadi gudang (Apoteker) dan meja resepsionis; tagihan mengambil stok meja; resepsionis meminta restock, Apoteker mengirim (boleh sebagian) atau menolak, dengan pemberitahuan langsung dan riwayat.

**Architecture:** Satu batch dengan dua angka sisa: `StockBatch.quantityRemaining` (gudang, nama lama dipertahankan) dan `StockBatch.counterRemaining` (meja). Perpindahan dicatat sebagai dua jurnal `PINDAH` dengan kolom `location`. Permintaan restock memakai tabel baru `RestockRequest` dan `RestockRequestLine`. Aturan murni ada di `src/lib/counter-stock.ts`, pemindahan di `src/server/stock-store.ts` (`moveItemToCounter`), aksi di `src/server/counter-stock.ts` dan `src/server/restock.ts`, dan bacaan di `src/server/counter-read.ts` dan `src/server/restock-read.ts`.

**Tech Stack:** Next.js 15, React 19, Prisma 7 + PostgreSQL 18, MUI 9, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-stok-meja-design.md`

## Global Constraints

- Semua teks antarmuka dan pesan dalam Bahasa Indonesia, persis seperti tertulis di task.
- Migrasi hanya menambah, dalam dua berkas:
  - `20261019085000_stok_meja_enum`: hanya `ALTER TYPE "StockMovementKind" ADD VALUE 'PINDAH';`.
  - `20261019090000_stok_meja`: semua perubahan lain.
- Cara membuat SQL migrasi utama:
  - Jalankan `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/x.sql`.
  - Buang baris dotenv dan banner (`◇`, `┌`, `│`, `└`, `Loaded Prisma config`).
  - Ekspresi CHECK tidak pernah bernilai NULL.
  - Sesudahnya jalankan `npx prisma generate && npm run db:migrate:test`, lalu cek drift: hasilnya harus `-- This is an empty migration.`
- Hak akses:
  - `counter:read`: Resepsionis, Apoteker, Super Admin.
  - `restock:request`: Resepsionis, Super Admin.
  - Kirim, tolak, pindah, tarik, penyesuaian, dan Batas meja memakai `stock:manage`.
- Resepsionis tidak pernah menerima harga beli (`unitCost`), nilai stok, atau sisa gudang.
- Batas angka:
  - permintaan berisi 1–30 barang, jumlah per barang 1–9.999, catatan maks. 300 karakter;
  - jumlah kirim 0–999.999 per barang;
  - alasan tolak 2–200 karakter.
- Aturan kode:
  - Berkas `"use server"` hanya mengekspor fungsi async. Modul bacaan adalah modul biasa yang memeriksa hak sendiri.
  - Panel admin hanya memakai MUI.
  - Jangan jalankan Prettier.
- Uji integrasi tidak dijalankan bersamaan dengan E2E.
- Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. Batch yang kedaluwarsa di meja tidak pernah dijual dan tidak ikut terkirim saat restock, tetapi tetap boleh ditarik ke gudang (Task 3, Task 4).
2. Dua kiriman untuk permintaan yang sama, atau dua permintaan untuk barang yang sama, terjadi bersamaan: hanya satu yang berhasil dan stok tidak pindah dua kali (Task 6).
3. Kiriman melebihi sisa gudang (misalnya gudang berkurang lewat retur setelah permintaan dibuat): ditolak dengan nama barangnya, dan tidak ada sebagian barang yang telanjur terpindah (Task 6).
4. Resepsionis tidak pernah menerima sisa gudang, harga beli, atau nilai stok, baik lewat Stok meja, dialog, maupun pemberitahuan (Task 5, Task 8).
5. Penyesuaian stok yang bersamaan dengan pembatalan faktur: tepat satu yang berhasil (Task 3).

---

### Task 1: Skema, migrasi, hak akses, dan pembersih uji

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261019085000_stok_meja_enum/migration.sql`, `prisma/migrations/20261019090000_stok_meja/migration.sql`
- Modify: `src/lib/permissions.ts`
- Modify: `tests/integration/stock-world.ts` (`cleanupStockWorld`), `tests/integration/invoice-world.ts` (`cleanupBillingWorld`), `tests/e2e/prepare-db.mts`
- Test: `tests/unit/migrations.test.ts`, `tests/unit/permissions.test.ts`, `tests/integration/counter-schema.test.ts`

**Interfaces:**
- Produces:
  - Enum `StockLocation` (`GUDANG`, `MEJA`), enum `RestockStatus` (`MENUNGGU`, `SELESAI`, `DITOLAK`, `DIBATALKAN`), dan nilai `PINDAH` di `StockMovementKind`.
  - Kolom baru:
    - `StockBatch.counterRemaining Int @default(0)`
    - `StockItem.counterMinStock Int @default(0)`
    - `StockMovement.location StockLocation @default(GUDANG)`
    - `StockMovement.restockLineId String?`
  - Model `RestockRequest`, `RestockRequestLine`.
  - Kemampuan `"counter:read"`, `"restock:request"`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi stok meja", () => {
  const enumSql = readFileSync("prisma/migrations/20261019085000_stok_meja_enum/migration.sql", "utf8");
  const sql = readFileSync("prisma/migrations/20261019090000_stok_meja/migration.sql", "utf8");

  it("nilai enum PINDAH ditambah di migrasinya sendiri", () => {
    expect(enumSql).toMatch(/ALTER TYPE "StockMovementKind" ADD VALUE 'PINDAH'/);
    expect(sql).not.toMatch(/ADD VALUE/);
  });

  it("hanya menambah", () => {
    expect(enumSql + sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga angka stok meja, lokasi jurnal, dan keputusan permintaan", () => {
    for (const name of [
      "stock_batch_counter_nonnegative",
      "stock_item_counter_min_nonnegative",
      "stock_movement_location",
      "restock_request_decision",
      "restock_line_values",
    ]) {
      expect(sql).toContain(name);
    }
  });
});
```

Tambahkan di `tests/unit/permissions.test.ts`, di dalam `describe("hak akses", …)`:

```ts
  it("stok meja: resepsionis melihat dan meminta, Apoteker melihat dan mengelola (spec stok meja 7)", () => {
    expect(can("RESEPSIONIS", "counter:read")).toBe(true);
    expect(can("RESEPSIONIS", "restock:request")).toBe(true);
    expect(can("RESEPSIONIS", "stock:manage")).toBe(false);
    expect(can("APOTEKER", "counter:read")).toBe(true);
    expect(can("APOTEKER", "restock:request")).toBe(false);
    expect(can("ADMIN_KEUANGAN", "counter:read")).toBe(false);
    expect(can("DOKTER", "counter:read")).toBe(false);
  });
```

Buat `tests/integration/counter-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";

const SLUG = "skema-meja";
let world: StockWorld;

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
});
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("skema stok meja (spec stok meja 2)", () => {
  it("batch baru: meja 0; meja tidak boleh minus; batas meja tidak boleh minus", async () => {
    const { batchId } = await seedBatch(world, { invoiceNumber: "SKM-1", itemId: world.productId, quantity: 5 });
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } })).counterRemaining).toBe(0);
    await expect(prisma.stockBatch.update({ where: { id: batchId }, data: { counterRemaining: -1 } })).rejects.toThrow(/stock_batch_counter_nonnegative/);
    await expect(prisma.stockItem.update({ where: { id: world.productId }, data: { counterMinStock: -1 } })).rejects.toThrow(/stock_item_counter_min_nonnegative/);
  });

  it("jurnal MASUK dan RETUR selalu di gudang; PINDAH boleh di meja", async () => {
    const { batchId } = await seedBatch(world, { invoiceNumber: "SKM-2", itemId: world.productId, quantity: 5 });
    const base = { batchId, quantity: 1, staffId: "s", staffName: "Uji" };
    expect((await prisma.stockMovement.findFirstOrThrow({ where: { batchId, kind: "MASUK" } })).location).toBe("GUDANG");
    await expect(prisma.stockMovement.create({ data: { ...base, kind: "MASUK", location: "MEJA" } })).rejects.toThrow(/stock_movement_location/);
    await expect(prisma.stockMovement.create({ data: { ...base, kind: "RETUR", location: "MEJA" } })).rejects.toThrow(/stock_movement_location/);
    expect((await prisma.stockMovement.create({ data: { ...base, kind: "PINDAH", location: "MEJA" } })).location).toBe("MEJA");
  });

  it("permintaan: keputusan dan alasan tolak sesuai status; jumlah minta > 0", async () => {
    const base = { branchId: world.branchId, requestedById: "s", requestedByName: "Rina" };
    const request = await prisma.restockRequest.create({
      data: { ...base, lines: { create: [{ itemId: world.productId, itemName: "Serum", requestedQuantity: 2 }] } },
      include: { lines: true },
    });
    expect(request).toMatchObject({ status: "MENUNGGU", version: 1, decidedAt: null });
    await expect(prisma.restockRequest.update({ where: { id: request.id }, data: { status: "SELESAI" } })).rejects.toThrow(/restock_request_decision/);
    await expect(
      prisma.restockRequest.update({ where: { id: request.id }, data: { status: "SELESAI", decidedAt: new Date(), decidedById: "a", decidedByName: "Apoteker", rejectReason: "x" } }),
    ).rejects.toThrow(/restock_request_decision/);
    await expect(
      prisma.restockRequest.update({ where: { id: request.id }, data: { status: "DITOLAK", decidedAt: new Date(), decidedById: "a", decidedByName: "Apoteker" } }),
    ).rejects.toThrow(/restock_request_decision/);
    await expect(prisma.restockRequestLine.update({ where: { id: request.lines[0].id }, data: { requestedQuantity: 0 } })).rejects.toThrow(/restock_line_values/);
    await expect(prisma.restockRequestLine.update({ where: { id: request.lines[0].id }, data: { sentQuantity: -1 } })).rejects.toThrow(/restock_line_values/);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts tests/unit/permissions.test.ts`
Expected: FAIL, karena berkas migrasi belum ada dan kemampuan baru belum dikenal.

- [ ] **Step 3: Skema**

Di `prisma/schema.prisma`:

- Di `enum StockMovementKind`, tambahkan `PINDAH` sesudah `KELUAR`.
- Tambahkan sesudah `enum StockMovementKind`:

```prisma
/// Lokasi stok dalam satu cabang (spec stok meja 2.2).
enum StockLocation {
  GUDANG
  MEJA
}

enum RestockStatus {
  MENUNGGU
  SELESAI
  DITOLAK
  DIBATALKAN
}
```

- Di `model StockBatch`, ganti baris `quantityRemaining Int` dengan:

```prisma
  /// Sisa di gudang (spec stok meja 2.1); nama kolom lama dipertahankan.
  quantityRemaining Int
  /// Sisa di meja resepsionis (spec stok meja 2.1). CHECK stock_batch_counter_nonnegative.
  counterRemaining  Int          @default(0)
```

- Di `model StockItem`, sesudah `minStock`:

```prisma
  /// Batas "Meja menipis" (spec stok meja SM5); 0 berarti tidak dipantau di meja. CHECK stock_item_counter_min_nonnegative.
  counterMinStock Int                     @default(0)
```

  Tambahkan juga relasi `  restockLines  RestockRequestLine[]` di sebelah `batches`.
- Di `model StockMovement`, sesudah `quantity`:

```prisma
  /// Lokasi yang berubah (spec stok meja 2.2); jurnal lama selalu GUDANG. CHECK stock_movement_location.
  location         StockLocation      @default(GUDANG)
  /// Baris permintaan restock asal jurnal PINDAH ini.
  restockLineId    String?
  restockLine      RestockRequestLine? @relation(fields: [restockLineId], references: [id], onDelete: SetNull)
```

- Di `model Branch`, sesudah `stockBatches       StockBatch[]`, tambahkan `  restockRequests    RestockRequest[]`.
- Tambahkan model baru sesudah `model StockMovement`:

```prisma
/// Permintaan restock dari meja resepsionis ke Apoteker (spec stok meja 2.3, 4). CHECK restock_request_decision.
model RestockRequest {
  id              String        @id @default(cuid())
  branchId        String
  branch          Branch        @relation(fields: [branchId], references: [id], onDelete: Restrict)
  status          RestockStatus @default(MENUNGGU)
  note            String?
  requestedById   String
  requestedByName String
  /// Apoteker yang mengirim atau menolak, atau resepsionis yang membatalkan.
  decidedAt       DateTime?
  decidedById     String?
  decidedByName   String?
  rejectReason    String?
  /// Naik setiap perubahan; menolak aksi dari halaman yang usang.
  version         Int           @default(1)
  createdAt       DateTime      @default(now())

  lines RestockRequestLine[]

  @@index([status, createdAt])
  @@index([branchId, status])
}

/// Satu barang dalam permintaan restock. CHECK restock_line_values.
model RestockRequestLine {
  id                String         @id @default(cuid())
  requestId         String
  request           RestockRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  itemId            String
  item              StockItem      @relation(fields: [itemId], references: [id], onDelete: Restrict)
  /// Disalin saat diminta, agar riwayat tidak ikut berubah.
  itemName          String
  requestedQuantity Int
  /// Diisi saat dikirim (SELESAI); 0 = barang ini tidak dikirim.
  sentQuantity      Int?
  sortOrder         Int            @default(0)

  movements StockMovement[]

  @@index([requestId])
  @@index([itemId])
}
```

Run: `npx prisma format`

- [ ] **Step 4: Migrasi**

Buat `prisma/migrations/20261019085000_stok_meja_enum/migration.sql`:

```sql
-- Stok meja (spec docs/superpowers/specs/2026-10-19-stok-meja-design.md bagian 2.2).
-- Nilai enum baru ditambah di migrasi sendiri: PostgreSQL tidak mengizinkan nilai baru dipakai di transaksi yang menambahkannya.
ALTER TYPE "StockMovementKind" ADD VALUE 'PINDAH';
```

Run: `npm run db:migrate:test`. Migrasi enum harus diterapkan dulu, supaya diff berikutnya tidak memuatnya lagi.

```bash
mkdir -p prisma/migrations/20261019090000_stok_meja
PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/stok-meja.sql 2>&1
grep -v -e '^\[dotenv' -e '^◇' -e '^Loaded Prisma config' -e '^┌' -e '^│' -e '^└' /tmp/stok-meja.sql > prisma/migrations/20261019090000_stok_meja/migration.sql
```

Hapus baris kosong pertama bila ada. Pastikan isinya tidak memuat `ADD VALUE`. Lalu tambahkan di akhir berkas:

```sql
-- Nilai stok meja dan permintaan restock (spec stok meja 2). Tiap ekspresi tidak pernah NULL.
ALTER TABLE "StockBatch" ADD CONSTRAINT stock_batch_counter_nonnegative CHECK ("counterRemaining" >= 0);
ALTER TABLE "StockItem" ADD CONSTRAINT stock_item_counter_min_nonnegative CHECK ("counterMinStock" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_location CHECK (
  ("kind" IN ('MASUK', 'RETUR') AND "location" = 'GUDANG') OR "kind" IN ('PINDAH', 'PENYESUAIAN', 'KELUAR')
);
ALTER TABLE "RestockRequest" ADD CONSTRAINT restock_request_decision CHECK (
  ("status" = 'MENUNGGU') = ("decidedAt" IS NULL)
  AND ("decidedAt" IS NULL) = ("decidedByName" IS NULL)
  AND ("status" = 'DITOLAK') = ("rejectReason" IS NOT NULL)
);
ALTER TABLE "RestockRequestLine" ADD CONSTRAINT restock_line_values CHECK (
  "requestedQuantity" > 0 AND ("sentQuantity" IS NULL OR "sentQuantity" >= 0)
);
```

Run: `npx prisma generate && npm run db:migrate:test`. Kedua migrasi harus diterapkan dan drift harus kosong.

Bila migrasi gagal di tengah, perbaiki penyebabnya, jalankan `PRISMA_TARGET=test npx prisma migrate resolve --rolled-back 20261019090000_stok_meja`, lalu ulangi.

- [ ] **Step 5: Hak akses**

Di `src/lib/permissions.ts`:

- Tambahkan `| "counter:read"` dan `| "restock:request"` di akhir tipe `Capability`.
- Tambahkan `"counter:read"` dan `"restock:request"` di akhir daftar `SUPER_ADMIN`.
- Ganti baris `RESEPSIONIS` dengan:

```ts
  // Resepsionis juga melihat stok meja dan meminta restock ke Apoteker (spec stok meja 7).
  RESEPSIONIS: ["booking:manage", "schedule:manage", "invoice:read", "invoice:manage", "bia:upload", "counter:read", "restock:request"],
```

- Tambahkan `"counter:read"` di akhir daftar `APOTEKER`.

Di `src/lib/stock.ts`:
- Ganti `export type StockMovementKindValue = "MASUK" | "RETUR" | "PENYESUAIAN" | "KELUAR";` dengan `… | "KELUAR" | "PINDAH";`.
- Tambahkan `PINDAH: "Pindah",` di `MOVEMENT_KIND_LABEL`.

Langkah ini harus di sini, bukan di Task 2: jenis jurnal dari Prisma kini memuat `PINDAH`, jadi `StockMovementRow.kind` tidak lolos `tsc` tanpa nilai itu.

- [ ] **Step 6: Pembersih uji**

- `tests/integration/stock-world.ts`, `cleanupStockWorld`: tambahkan sebagai baris pertama sesudah `const branch = …`:

```ts
  // Permintaan restock merujuk cabang dan barang (Restrict); barisnya ikut terhapus (Cascade).
  await prisma.restockRequest.deleteMany({ where: { branch } });
```

- `tests/integration/invoice-world.ts`, `cleanupBillingWorld`: tambahkan baris yang sama tepat sebelum `await prisma.dispensingLine.deleteMany(…)`.
- `tests/e2e/prepare-db.mts`: tambahkan `await prisma.restockRequest.deleteMany();` tepat sebelum `await prisma.stockMovement.deleteMany();`.

- [ ] **Step 7: Jalankan uji**

Run:

```bash
npx vitest run tests/unit/migrations.test.ts tests/unit/permissions.test.ts && npm run test:integration -- tests/integration/counter-schema.test.ts tests/integration/stock-schema.test.ts && npx tsc --noEmit -p .
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261019085000_stok_meja_enum prisma/migrations/20261019090000_stok_meja src/lib/permissions.ts src/lib/stock.ts tests/unit/migrations.test.ts tests/unit/permissions.test.ts tests/integration/counter-schema.test.ts tests/integration/stock-world.ts tests/integration/invoice-world.ts tests/e2e/prepare-db.mts
git commit -m "feat: front-desk stock column, stock locations, restock request tables, and capabilities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Aturan murni stok meja

**Files:**
- Create: `src/lib/counter-stock.ts`
- Modify: `src/lib/stock.ts`
- Test: `tests/unit/counter-stock.test.ts`, `tests/unit/stock.test.ts`

**Interfaces:**
- Produces, di `src/lib/counter-stock.ts`:
  - Tipe dan label:
    - `StockLocationValue = "GUDANG" | "MEJA"`, `STOCK_LOCATION_LABEL`
    - `RestockStatusValue`, `RESTOCK_STATUS_LABEL`
    - `CounterFlag = "MEJA_MENIPIS" | "MEJA_HABIS"`
  - Konstanta: `RESTOCK_LINES_MAX = 30`, `RESTOCK_QUANTITY_MAX = 9999`, `RESTOCK_NOTE_MAX = 300`.
  - `availableStock(batches: readonly { quantityRemaining: number; counterRemaining: number; expiryDate: Date | null }[], today: string, where: StockLocationValue | "SEMUA"): number`
  - `counterState(batches: readonly { counterRemaining: number; expiryDate: Date | null }[], counterMinStock: number, today: string): { available: number; expired: number; flag: CounterFlag | null }`
  - `suggestedRestock(counterMinStock: number, available: number): number`
  - `RestockRequestInput = { branchId: string; note: string; lines: { itemId: string; quantity: number }[] }`
  - `validateRestockRequest(raw: unknown): Validation<{ branchId: string; note: string | null; lines: { itemId: string; quantity: number }[] }>`
  - `validateRestockSend(raw: unknown, ctx: { lineIds: readonly string[] }): Validation<{ lineId: string; quantity: number }[]>`
  - `validateRejectReason(raw: unknown): Validation<string>`
  - `counterShortages(lines: readonly { kind: string; itemId: string | null; quantity: number }[], available: ReadonlyMap<string, number>): Map<string, { needed: number; available: number }>`
- Produces, perubahan di `src/lib/stock.ts`:
  - `StockFlag` mendapat `"MEJA_MENIPIS" | "MEJA_HABIS"`.
  - `stockFlags` menerima `counterRemaining?` per batch.
  - `AdjustmentInput.location?: StockLocationValue`; `ValidAdjustment.location: StockLocationValue`.
  - `StockItemInput.counterMinStock?: number`; `ValidStockItem.counterMinStock: number`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/counter-stock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  availableStock,
  counterShortages,
  counterState,
  suggestedRestock,
  validateRejectReason,
  validateRestockRequest,
  validateRestockSend,
} from "@/lib/counter-stock";

const TODAY = "2026-10-14";
const d = (value: string) => new Date(`${value}T00:00:00Z`);
const batch = (warehouse: number, counter: number, expiry: string | null) => ({
  quantityRemaining: warehouse,
  counterRemaining: counter,
  expiryDate: expiry ? d(expiry) : null,
});

describe("stok per lokasi (spec stok meja 3)", () => {
  it("tersedia per lokasi tanpa batch kedaluwarsa", () => {
    const batches = [batch(10, 4, "2027-01-01"), batch(5, 3, "2026-10-01"), batch(2, 0, null)];
    expect(availableStock(batches, TODAY, "GUDANG")).toBe(12);
    expect(availableStock(batches, TODAY, "MEJA")).toBe(4);
    expect(availableStock(batches, TODAY, "SEMUA")).toBe(16);
  });

  it("tanda meja hanya untuk barang yang berbatas meja", () => {
    expect(counterState([batch(0, 3, "2027-01-01")], 5, TODAY)).toEqual({ available: 3, expired: 0, flag: "MEJA_MENIPIS" });
    expect(counterState([batch(0, 6, "2027-01-01")], 5, TODAY).flag).toBeNull();
    expect(counterState([batch(0, 2, "2026-10-01")], 5, TODAY)).toEqual({ available: 0, expired: 2, flag: "MEJA_HABIS" });
    expect(counterState([], 0, TODAY)).toEqual({ available: 0, expired: 0, flag: null });
  });

  it("jumlah usulan sampai dua kali batas meja, paling sedikit 1", () => {
    expect(suggestedRestock(5, 0)).toBe(10);
    expect(suggestedRestock(5, 3)).toBe(7);
    expect(suggestedRestock(5, 12)).toBe(1);
    expect(suggestedRestock(0, 0)).toBe(1);
  });
});

describe("permintaan restock (spec stok meja 4)", () => {
  const line = { itemId: "i1", quantity: 10 };

  it("merapikan permintaan yang sah", () => {
    expect(validateRestockRequest({ branchId: "b1", note: "  untuk sore  ", lines: [line] })).toEqual({
      ok: true,
      value: { branchId: "b1", note: "untuk sore", lines: [line] },
    });
    expect(validateRestockRequest({ branchId: "b1", note: "", lines: [line] })).toMatchObject({ ok: true, value: { note: null } });
  });

  it.each([
    [{ branchId: "", note: "", lines: [line] }, "Pilih cabang."],
    [{ branchId: "b1", note: "", lines: [] }, "Pilih minimal satu barang."],
    [{ branchId: "b1", note: "", lines: Array.from({ length: 31 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 })) }, "Paling banyak 30 barang per permintaan."],
    [{ branchId: "b1", note: "", lines: [{ itemId: "", quantity: 1 }] }, "Pilih barang dari daftar."],
    [{ branchId: "b1", note: "", lines: [line, line] }, "Barang yang sama dipilih dua kali."],
    [{ branchId: "b1", note: "", lines: [{ itemId: "i1", quantity: 0 }] }, "Jumlah restock harus bilangan bulat 1–9.999."],
    [{ branchId: "b1", note: "", lines: [{ itemId: "i1", quantity: 10000 }] }, "Jumlah restock harus bilangan bulat 1–9.999."],
    [{ branchId: "b1", note: "x".repeat(301), lines: [line] }, "Catatan paling banyak 300 karakter."],
  ])("menolak %j", (input, message) => {
    expect(validateRestockRequest(input)).toEqual({ ok: false, message });
  });

  it("kirim: semua baris diisi 0 atau lebih, minimal satu lebih dari 0", () => {
    const ctx = { lineIds: ["l1", "l2"] };
    expect(validateRestockSend([{ lineId: "l1", quantity: 5 }, { lineId: "l2", quantity: 0 }], ctx)).toEqual({
      ok: true,
      value: [{ lineId: "l1", quantity: 5 }, { lineId: "l2", quantity: 0 }],
    });
    expect(validateRestockSend([{ lineId: "l1", quantity: 5 }], ctx)).toEqual({ ok: false, message: "Isi jumlah kirim semua barang." });
    expect(validateRestockSend([{ lineId: "l1", quantity: -1 }, { lineId: "l2", quantity: 0 }], ctx)).toEqual({ ok: false, message: "Jumlah kirim harus bilangan bulat 0 atau lebih." });
    expect(validateRestockSend([{ lineId: "l1", quantity: 0 }, { lineId: "l2", quantity: 0 }], ctx)).toEqual({
      ok: false,
      message: "Isi jumlah kirim minimal satu barang, atau tolak permintaan ini.",
    });
  });

  it("alasan tolak 2–200 karakter", () => {
    expect(validateRejectReason("  Stok gudang   kosong ")).toEqual({ ok: true, value: "Stok gudang kosong" });
    expect(validateRejectReason("x")).toEqual({ ok: false, message: "Alasan penolakan 2–200 karakter." });
  });

  it("kekurangan meja di draf tagihan: baris barang yang sama dijumlahkan", () => {
    const available = new Map([["i1", 4], ["i2", 10]]);
    const short = counterShortages(
      [
        { kind: "BARANG", itemId: "i1", quantity: 3 },
        { kind: "BARANG", itemId: "i1", quantity: 2 },
        { kind: "BARANG", itemId: "i2", quantity: 1 },
        { kind: "LAYANAN", itemId: null, quantity: 9 },
        { kind: "BARANG", itemId: "lain", quantity: 9 },
      ],
      available,
    );
    expect([...short.entries()]).toEqual([["i1", { needed: 5, available: 4 }]]);
  });
});
```

Tambahkan di `tests/unit/stock.test.ts`:

- Di `describe("stockFlags", …)`:

```ts
  it("stok meja ikut nilai dan tanda kedaluwarsa, tetapi tidak ikut tersedia gudang (spec stok meja 3)", () => {
    const flags = stockFlags([{ quantityRemaining: 2, counterRemaining: 3, expiryDate: d("2026-10-01"), unitCost: 1000 }, { quantityRemaining: 0, counterRemaining: 4, expiryDate: null, unitCost: 500 }], 0, TODAY);
    expect(flags).toMatchObject({ onHand: 2, available: 0, value: 7000, expired: true });
  });
```

  (`d` dan `TODAY` adalah pembantu tanggal yang sudah ada di berkas itu. Bila namanya berbeda, pakai pembantu yang dipakai uji `stockFlags` lain di berkas itu, lalu catat di ledger.)
- Di `describe("validasi barang dan supplier", …)`: perbarui harapan `validateStockItem(item)).toEqual({ ok: true, value: { … } })` agar memuat `counterMinStock: 0`. Lalu tambahkan:

```ts
  it("Batas meja bilangan bulat 0 atau lebih (spec stok meja SM5)", () => {
    expect(validateStockItem({ ...item, counterMinStock: 5 })).toMatchObject({ ok: true, value: { counterMinStock: 5 } });
    expect(validateStockItem({ ...item, counterMinStock: -1 })).toEqual({ ok: false, message: "Batas meja harus bilangan bulat 0 atau lebih." });
  });
```

- Di bagian uji `validateAdjustment`:

```ts
  it("penyesuaian memilih lokasi; bawaannya gudang (spec stok meja 3)", () => {
    const base = { batchId: "b1", direction: "KURANGI" as const, quantity: 1, reason: "RUSAK" as const, note: "" };
    expect(validateAdjustment(base)).toMatchObject({ ok: true, value: { location: "GUDANG" } });
    expect(validateAdjustment({ ...base, location: "MEJA" })).toMatchObject({ ok: true, value: { location: "MEJA", delta: -1 } });
    expect(validateAdjustment({ ...base, location: "LACI" })).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/counter-stock.test.ts tests/unit/stock.test.ts`
Expected: FAIL, karena modul belum ada, lalu karena field baru belum dikenal.

- [ ] **Step 3: Implementasi `src/lib/counter-stock.ts`**

```ts
import { dateOnlyString, type Validation } from "./stock";

/** Aturan stok meja resepsionis dan permintaan restock (spec stok meja 3–4). Murni: dipakai server dan browser. */

export type StockLocationValue = "GUDANG" | "MEJA";
export const STOCK_LOCATION_LABEL: Record<StockLocationValue, string> = { GUDANG: "Gudang", MEJA: "Meja" };

export type RestockStatusValue = "MENUNGGU" | "SELESAI" | "DITOLAK" | "DIBATALKAN";
export const RESTOCK_STATUS_LABEL: Record<RestockStatusValue, string> = {
  MENUNGGU: "Menunggu",
  SELESAI: "Selesai",
  DITOLAK: "Ditolak",
  DIBATALKAN: "Dibatalkan",
};

export type CounterFlag = "MEJA_MENIPIS" | "MEJA_HABIS";

export const RESTOCK_LINES_MAX = 30;
export const RESTOCK_QUANTITY_MAX = 9999;
export const RESTOCK_NOTE_MAX = 300;
const SEND_MAX = 999_999;
const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";

const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const isExpired = (batch: { expiryDate: Date | null }, today: string) => batch.expiryDate !== null && dateOnlyString(batch.expiryDate) < today;

/** Sisa yang boleh dipakai (tanpa batch kedaluwarsa) di gudang, meja, atau keduanya. `today` tanggal WITA. */
export function availableStock(
  batches: readonly { quantityRemaining: number; counterRemaining: number; expiryDate: Date | null }[],
  today: string,
  where: StockLocationValue | "SEMUA",
): number {
  let total = 0;
  for (const batch of batches) {
    if (isExpired(batch, today)) continue;
    if (where !== "MEJA") total += Math.max(batch.quantityRemaining, 0);
    if (where !== "GUDANG") total += Math.max(batch.counterRemaining, 0);
  }
  return total;
}

/** Keadaan meja satu barang di satu cabang (spec stok meja 3): tanda hanya bila Batas meja > 0. */
export function counterState(
  batches: readonly { counterRemaining: number; expiryDate: Date | null }[],
  counterMinStock: number,
  today: string,
): { available: number; expired: number; flag: CounterFlag | null } {
  let available = 0;
  let expired = 0;
  for (const batch of batches) {
    if (batch.counterRemaining <= 0) continue;
    if (isExpired(batch, today)) expired += batch.counterRemaining;
    else available += batch.counterRemaining;
  }
  const flag: CounterFlag | null =
    counterMinStock <= 0 ? null : available === 0 ? "MEJA_HABIS" : available <= counterMinStock ? "MEJA_MENIPIS" : null;
  return { available, expired, flag };
}

/** Jumlah usulan di dialog Minta restock (spec stok meja 4.1): sampai dua kali Batas meja. */
export function suggestedRestock(counterMinStock: number, available: number): number {
  return Math.min(Math.max(2 * counterMinStock - available, 1), RESTOCK_QUANTITY_MAX);
}

export type RestockRequestInput = { branchId: string; note: string; lines: { itemId: string; quantity: number }[] };
export type ValidRestockRequest = { branchId: string; note: string | null; lines: { itemId: string; quantity: number }[] };

export function validateRestockRequest(raw: unknown): Validation<ValidRestockRequest> {
  if (!isObject(raw)) return fail(INVALID);
  if (typeof raw.branchId !== "string" || !raw.branchId) return fail("Pilih cabang.");
  if (!Array.isArray(raw.lines)) return fail(INVALID);
  if (raw.lines.length === 0) return fail("Pilih minimal satu barang.");
  if (raw.lines.length > RESTOCK_LINES_MAX) return fail(`Paling banyak ${RESTOCK_LINES_MAX} barang per permintaan.`);
  const seen = new Set<string>();
  const lines: { itemId: string; quantity: number }[] = [];
  for (const line of raw.lines as unknown[]) {
    if (!isObject(line) || typeof line.itemId !== "string" || !line.itemId) return fail("Pilih barang dari daftar.");
    if (seen.has(line.itemId)) return fail("Barang yang sama dipilih dua kali.");
    if (!isWhole(line.quantity, 1, RESTOCK_QUANTITY_MAX)) return fail("Jumlah restock harus bilangan bulat 1–9.999.");
    seen.add(line.itemId);
    lines.push({ itemId: line.itemId, quantity: line.quantity });
  }
  const note = raw.note === undefined || raw.note === null ? "" : typeof raw.note === "string" ? raw.note.trim() : null;
  if (note === null) return fail(INVALID);
  if (note.length > RESTOCK_NOTE_MAX) return fail(`Catatan paling banyak ${RESTOCK_NOTE_MAX} karakter.`);
  return { ok: true, value: { branchId: raw.branchId, note: note || null, lines } };
}

/** Jumlah kirim Apoteker per baris (spec stok meja 4.2): semua baris diisi, minimal satu lebih dari 0. */
export function validateRestockSend(raw: unknown, ctx: { lineIds: readonly string[] }): Validation<{ lineId: string; quantity: number }[]> {
  if (!Array.isArray(raw)) return fail(INVALID);
  const byLine = new Map<string, unknown>();
  for (const entry of raw as unknown[]) {
    if (!isObject(entry) || typeof entry.lineId !== "string") return fail(INVALID);
    byLine.set(entry.lineId, entry.quantity);
  }
  if (byLine.size !== ctx.lineIds.length || ctx.lineIds.some((id) => !byLine.has(id))) return fail("Isi jumlah kirim semua barang.");
  const value: { lineId: string; quantity: number }[] = [];
  for (const lineId of ctx.lineIds) {
    const quantity = byLine.get(lineId);
    if (!isWhole(quantity, 0, SEND_MAX)) return fail("Jumlah kirim harus bilangan bulat 0 atau lebih.");
    value.push({ lineId, quantity });
  }
  if (value.every((entry) => entry.quantity === 0)) return fail("Isi jumlah kirim minimal satu barang, atau tolak permintaan ini.");
  return { ok: true, value };
}

export function validateRejectReason(raw: unknown): Validation<string> {
  const reason = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (reason.length < 2 || reason.length > 200) return fail("Alasan penolakan 2–200 karakter.");
  return { ok: true, value: reason };
}

/** Barang di draf tagihan yang jumlahnya melebihi stok meja (spec stok meja 4.1). Barang di luar `available` dilewati. */
export function counterShortages(
  lines: readonly { kind: string; itemId: string | null; quantity: number }[],
  available: ReadonlyMap<string, number>,
): Map<string, { needed: number; available: number }> {
  const needed = new Map<string, number>();
  for (const line of lines) {
    if (line.kind !== "BARANG" || !line.itemId || !available.has(line.itemId)) continue;
    needed.set(line.itemId, (needed.get(line.itemId) ?? 0) + line.quantity);
  }
  const short = new Map<string, { needed: number; available: number }>();
  for (const [itemId, total] of needed) {
    const have = available.get(itemId) ?? 0;
    if (total > have) short.set(itemId, { needed: total, available: have });
  }
  return short;
}
```

- [ ] **Step 4: Ubah `src/lib/stock.ts`**

- Tambahkan di bagian import teratas: `import type { StockLocationValue } from "./counter-stock";`
- Ganti `export type StockFlag = "MENIPIS" | "SEGERA_KEDALUWARSA" | "KEDALUWARSA";` menjadi `… | "KEDALUWARSA" | "MEJA_MENIPIS" | "MEJA_HABIS";`. Tambahkan `MEJA_MENIPIS: "Meja menipis", MEJA_HABIS: "Meja habis",` di `STOCK_FLAG_LABEL`. Ganti isi `isStockFlag` menjadi `return typeof value === "string" && value in STOCK_FLAG_LABEL;`.
- Ganti seluruh fungsi `stockFlags` dengan:

```ts
/**
 * Tanda stok satu barang di satu cabang (spec stok 4.2, stok meja 3). `onHand`, `available`, dan "menipis" untuk
 * gudang; nilai stok dan tanda kedaluwarsa menghitung gudang dan meja (`counterRemaining`). `today` tanggal WITA.
 */
export function stockFlags(
  batches: readonly { quantityRemaining: number; counterRemaining?: number; expiryDate: Date | null; unitCost: number | null }[],
  minStock: number,
  today: string,
): StockFlags {
  const warnUntil = addDaysToDateString(today, EXPIRY_WARNING_DAYS);
  let onHand = 0;
  let available = 0;
  let value = 0;
  let expired = false;
  let expiringSoon = false;
  for (const batch of batches) {
    const warehouse = Math.max(batch.quantityRemaining, 0);
    const counter = Math.max(batch.counterRemaining ?? 0, 0);
    if (warehouse + counter <= 0) continue;
    onHand += warehouse;
    value += (warehouse + counter) * (batch.unitCost ?? 0);
    const expiry = batch.expiryDate ? dateOnlyString(batch.expiryDate) : null;
    if (expiry !== null && expiry < today) {
      expired = true;
      continue;
    }
    available += warehouse;
    if (expiry !== null && expiry <= warnUntil) expiringSoon = true;
  }
  return { onHand, available, value, low: minStock > 0 && available <= minStock, expiringSoon, expired };
}
```

- Di `StockItemInput`, tambahkan `  /** Batas meja (spec stok meja SM5); kosong = 0. */ counterMinStock?: number;`. Ganti `ValidStockItem` menjadi `Omit<StockItemInput, "notes" | "counterMinStock"> & { notes: string | null; counterMinStock: number };`. Di `validateStockItem`, sesudah pemeriksaan `minStock` tambahkan:

```ts
  const counterMinStock = raw.counterMinStock === undefined || raw.counterMinStock === null ? 0 : raw.counterMinStock;
  if (!isWhole(counterMinStock, 0, MAX_QUANTITY)) return fail("Batas meja harus bilangan bulat 0 atau lebih.");
```

  dan tambahkan `counterMinStock` ke objek `value` yang dikembalikan.
- Di `AdjustmentInput`, tambahkan `  /** Lokasi yang disesuaikan (spec stok meja 3); kosong = GUDANG. */ location?: StockLocationValue;`. Ganti `ValidAdjustment` menjadi `{ batchId: string; delta: number; reason: AdjustReasonValue; note: string | null; location: StockLocationValue };`. Di `validateAdjustment`, sesudah pemeriksaan `direction` tambahkan:

```ts
  const location = raw.location === undefined || raw.location === null ? "GUDANG" : raw.location;
  if (location !== "GUDANG" && location !== "MEJA") return fail(INVALID_FORM);
```

  dan tambahkan `location` ke objek `value`.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/counter-stock.test.ts tests/unit/stock.test.ts && npx tsc --noEmit -p .`
Expected: PASS. Bila `tsc` menunjuk `Record<StockFlag, …>` di komponen (misalnya `FLAG_TONE` di `stock-item-table.tsx`), tambahkan `MEJA_MENIPIS: "warning", MEJA_HABIS: "error"` di sana.

- [ ] **Step 6: Commit**

```bash
git add src/lib/counter-stock.ts src/lib/stock.ts tests/unit/counter-stock.test.ts tests/unit/stock.test.ts src/components/admin/stock/stock-item-table.tsx
git commit -m "feat: rules for front-desk stock, restock requests, and stock locations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pindah, tarik, penyesuaian per lokasi, dan retur dari gudang

**Files:**
- Modify: `src/server/stock-store.ts`
- Create: `src/server/counter-stock.ts`
- Modify: `src/server/stock-movements.ts`
- Modify: `tests/integration/stock-world.ts` (`seedBatch` opsi `counter`)
- Modify: `tests/integration/stock-movements.test.ts` (pesan retur)
- Test: `tests/integration/counter-moves.test.ts`

**Interfaces:**
- Consumes: Task 1 (kolom, enum) dan Task 2 (`StockLocationValue`, `STOCK_LOCATION_LABEL`, `ValidAdjustment.location`).
- Produces:
  - `HAS_STOCK` (filter Prisma batch yang bersisa di gudang atau meja).
  - `takeFromBatch(tx, batchId, quantity, location: StockLocationValue = "GUDANG"): Promise<boolean>`
  - `moveItemToCounter(tx, input: { branchId: string; itemId: string; itemName: string; quantity: number; today: string; actor: { staffId: string; name: string }; restockLineId?: string | null }): Promise<void>`
  - Aksi `moveToCounter(input: { branchId: string; itemId: string; quantity: number }): Promise<ActionResult<void>>`
  - Aksi `pullToWarehouse(input: { batchId: string; quantity: number }): Promise<ActionResult<void>>`
  - `seedBatch(world, { …, counter?: number })`

- [ ] **Step 1: Tulis uji yang gagal**

Di `tests/integration/stock-world.ts`, tambahkan `counter?: number;` ke tipe input `seedBatch`. Pada `prisma.stockBatch.create`, ganti `quantityRemaining: input.quantity` dengan:

```ts
      quantityRemaining: input.quantity - (input.counter ?? 0),
      counterRemaining: input.counter ?? 0,
```

Sesudah jurnal `MASUK`, tambahkan:

```ts
  // Sebagian sudah dipindah ke meja (spec stok meja 2.2): dua jurnal PINDAH.
  if (input.counter) {
    await prisma.stockMovement.createMany({
      data: [
        { batchId: batch.id, kind: "PINDAH", location: "GUDANG", quantity: -input.counter, staffId: "seed", staffName: "Seed" },
        { batchId: batch.id, kind: "PINDAH", location: "MEJA", quantity: input.counter, staffId: "seed", staffName: "Seed" },
      ],
    });
  }
```

Buat `tests/integration/counter-moves.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { pullToWarehouse, moveToCounter } from "@/server/counter-stock";
import { cancelPurchase } from "@/server/purchases";
import { adjustStock, createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s1", name: "Apoteker Meja", role: "APOTEKER" as Role, email: "uji@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "pindah-meja";
const today = witaDateString(new Date());
let world: StockWorld;
let seq = 0;
let itemSeq = 0;

/** Barang baru dengan rak sendiri, supaya FEFO tidak bercampur dengan batch uji lain. */
const newItem = () => {
  itemSeq += 1;
  return prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-${itemSeq}`, name: `${SLUG} Barang ${itemSeq}`, kind: "PRODUK", unit: "pcs", sellPrice: 1000 } });
};
const batchOf = (itemId: string, quantity: number, days: number | null, counter = 0) => {
  seq += 1;
  return seedBatch(world, {
    invoiceNumber: `PM-${seq}`,
    itemId,
    quantity,
    counter,
    expiryDate: days === null ? null : addDaysToDateString(today, days),
    invoiceDate: today,
    dueDate: addDaysToDateString(today, 30),
  });
};
const sisa = async (batchId: string) => {
  const row = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } });
  return { gudang: row.quantityRemaining, meja: row.counterRemaining };
};

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
});
beforeEach(() => {
  actor.role = "APOTEKER";
});
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("pindah gudang ke meja (spec stok meja 3)", () => {
  it("mengambil batch kedaluwarsa terdekat dulu dan mencatat dua jurnal per batch", async () => {
    const item = await newItem();
    const later = await batchOf(item.id, 10, 200);
    const soon = await batchOf(item.id, 5, 30);
    await unwrap(moveToCounter({ branchId: world.branchId, itemId: item.id, quantity: 7 }));
    expect(await sisa(soon.batchId)).toEqual({ gudang: 0, meja: 5 });
    expect(await sisa(later.batchId)).toEqual({ gudang: 8, meja: 2 });
    const moves = await prisma.stockMovement.findMany({ where: { batchId: soon.batchId, kind: "PINDAH" }, orderBy: { location: "asc" } });
    expect(moves.map((m) => [m.location, m.quantity])).toEqual([["GUDANG", -5], ["MEJA", 5]]);
    expect(await prisma.auditLog.count({ where: { action: "stock.move", entityId: item.id } })).toBe(1);
  });

  it("batch kedaluwarsa tidak dipindah; gudang kurang ditolak tanpa perubahan (Review Focus 1)", async () => {
    const item = await newItem();
    const old = await batchOf(item.id, 9, -1);
    const fresh = await batchOf(item.id, 2, 100);
    expect(await moveToCounter({ branchId: world.branchId, itemId: item.id, quantity: 3 })).toEqual({
      ok: false,
      error: `Sisa gudang ${item.name} tidak cukup (tersedia 2).`,
    });
    expect(await sisa(old.batchId)).toEqual({ gudang: 9, meja: 0 });
    expect(await sisa(fresh.batchId)).toEqual({ gudang: 2, meja: 0 });
  });

  it("hanya pemegang stock:manage", async () => {
    const item = await newItem();
    actor.role = "RESEPSIONIS";
    await expect(moveToCounter({ branchId: world.branchId, itemId: item.id, quantity: 1 })).rejects.toThrow("forbidden: stock:manage");
  });
});

describe("tarik meja ke gudang", () => {
  it("per batch; batch kedaluwarsa boleh ditarik; melebihi sisa meja ditolak", async () => {
    const item = await newItem();
    const expired = await batchOf(item.id, 6, -1, 6);
    await unwrap(pullToWarehouse({ batchId: expired.batchId, quantity: 2 }));
    expect(await sisa(expired.batchId)).toEqual({ gudang: 2, meja: 4 });
    expect(await pullToWarehouse({ batchId: expired.batchId, quantity: 5 })).toEqual({ ok: false, error: "Sisa meja batch ini tidak cukup. Muat ulang halaman." });
    expect(await pullToWarehouse({ batchId: expired.batchId, quantity: 0 })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat lebih dari 0." });
  });
});

describe("penyesuaian per lokasi", () => {
  it("meja dikurangi atau ditambah; gudang tidak berubah; jurnal berlokasi MEJA", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 10, 100, 4);
    await unwrap(adjustStock({ batchId: b.batchId, direction: "KURANGI", quantity: 1, reason: "RUSAK", note: "", location: "MEJA" }));
    await unwrap(adjustStock({ batchId: b.batchId, direction: "TAMBAH", quantity: 2, reason: "SELISIH_HITUNG", note: "hitung ulang", location: "MEJA" }));
    expect(await sisa(b.batchId)).toEqual({ gudang: 6, meja: 5 });
    expect(await adjustStock({ batchId: b.batchId, direction: "KURANGI", quantity: 6, reason: "HILANG", note: "", location: "MEJA" })).toEqual({
      ok: false,
      error: "Sisa batch tidak cukup. Muat ulang halaman.",
    });
    const adjustments = await prisma.stockMovement.findMany({ where: { batchId: b.batchId, kind: "PENYESUAIAN" } });
    expect(adjustments.every((m) => m.location === "MEJA")).toBe(true);
  });

  it("penyesuaian dan batal faktur bersamaan: tepat satu berhasil (Review Focus 5)", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 5, 100);
    const [adjusted, cancelled] = await Promise.all([
      adjustStock({ batchId: b.batchId, direction: "TAMBAH", quantity: 3, reason: "SELISIH_HITUNG", note: "hitung", location: "GUDANG" }),
      cancelPurchase({ invoiceId: b.invoiceId, reason: "Salah input" }),
    ]);
    expect([adjusted.ok, cancelled.ok].filter(Boolean)).toHaveLength(1);
    const row = await prisma.stockBatch.findUniqueOrThrow({ where: { id: b.batchId } });
    expect(row.quantityRemaining).toBe(cancelled.ok ? 0 : 8);
  });
});

describe("retur dan batal faktur hanya dari gudang", () => {
  it("retur melebihi sisa gudang ditolak walau meja masih ada", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 5, 100, 3);
    expect(await createSupplierReturn({ invoiceId: b.invoiceId, lines: [{ batchId: b.batchId, quantity: 3 }], note: "" })).toEqual({
      ok: false,
      error: `Sisa gudang ${item.name} (batch -) tidak cukup untuk diretur.`,
    });
  });

  it("faktur yang batch-nya pernah dipindah ke meja tidak bisa dibatalkan", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 5, 100);
    await unwrap(moveToCounter({ branchId: world.branchId, itemId: item.id, quantity: 1 }));
    await unwrap(pullToWarehouse({ batchId: b.batchId, quantity: 1 }));
    const result = await cancelPurchase({ invoiceId: b.invoiceId, reason: "Salah input" });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/counter-moves.test.ts`
Expected: FAIL, karena modul `@/server/counter-stock` belum ada.

- [ ] **Step 3: `src/server/stock-store.ts`**

Tambahkan import:

```ts
import { UserFacingError } from "@/lib/action-result";
import type { StockLocationValue } from "@/lib/counter-stock";
import { fefoPlan } from "@/lib/invoice";
```

Tambahkan sesudah `STOCK_NOT_ENOUGH`:

```ts
/** Batch yang masih bersisa di gudang atau meja (spec stok meja 2.1). */
export const HAS_STOCK = { OR: [{ quantityRemaining: { gt: 0 } }, { counterRemaining: { gt: 0 } }] };
```

Ganti `takeFromBatch` dengan:

```ts
/**
 * Mengurangi sisa batch di satu lokasi dalam satu UPDATE bersyarat (spec stok 4.3, stok meja 3). Dua pengurangan
 * bersamaan tidak bisa sama-sama lolos: yang kedua melihat sisa terbaru dan gagal bila tidak cukup.
 */
export async function takeFromBatch(tx: Prisma.TransactionClient, batchId: string, quantity: number, location: StockLocationValue = "GUDANG"): Promise<boolean> {
  const { count } =
    location === "MEJA"
      ? await tx.stockBatch.updateMany({ where: { id: batchId, counterRemaining: { gte: quantity } }, data: { counterRemaining: { decrement: quantity } } })
      : await tx.stockBatch.updateMany({ where: { id: batchId, quantityRemaining: { gte: quantity } }, data: { quantityRemaining: { decrement: quantity } } });
  return count === 1;
}

/**
 * Memindah satu barang dari gudang ke meja di satu cabang (spec stok meja 3): batch gudang yang belum kedaluwarsa,
 * kedaluwarsa terdekat dulu. Tiap batch diperbarui dengan UPDATE bersyarat dan mendapat dua jurnal PINDAH.
 * Gagal di tengah membatalkan seluruh transaksi pemanggil.
 */
export async function moveItemToCounter(
  tx: Prisma.TransactionClient,
  input: { branchId: string; itemId: string; itemName: string; quantity: number; today: string; actor: { staffId: string; name: string }; restockLineId?: string | null },
): Promise<void> {
  const batches = await tx.stockBatch.findMany({
    where: { itemId: input.itemId, branchId: input.branchId, quantityRemaining: { gt: 0 } },
    select: { id: true, quantityRemaining: true, expiryDate: true, createdAt: true },
  });
  const plan = fefoPlan(batches, input.quantity, input.today);
  if (!plan.ok) throw new UserFacingError(`Sisa gudang ${input.itemName} tidak cukup (tersedia ${plan.available}).`);
  for (const take of plan.takes) {
    const { count } = await tx.stockBatch.updateMany({
      where: { id: take.batchId, quantityRemaining: { gte: take.quantity } },
      data: { quantityRemaining: { decrement: take.quantity }, counterRemaining: { increment: take.quantity } },
    });
    if (count !== 1) throw new UserFacingError(STOCK_NOT_ENOUGH);
    const base = { batchId: take.batchId, kind: "PINDAH" as const, restockLineId: input.restockLineId ?? null, staffId: input.actor.staffId, staffName: input.actor.name };
    await tx.stockMovement.createMany({
      data: [
        { ...base, location: "GUDANG", quantity: -take.quantity },
        { ...base, location: "MEJA", quantity: take.quantity },
      ],
    });
  }
}
```

- [ ] **Step 4: `src/server/counter-stock.ts`**

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { MAX_QUANTITY } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { moveItemToCounter } from "@/server/stock-store";

const QUANTITY = "Jumlah harus bilangan bulat lebih dari 0.";
const isQuantity = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY;

function revalidateCounter(itemId: string) {
  for (const path of ["/admin/stok", "/admin/stok-meja", "/admin", `/admin/stok/barang/${itemId}`]) safeRevalidatePath(path);
}

/** Isi meja tanpa permintaan (spec stok meja 4.2): FEFO dari gudang cabang itu. */
export async function moveToCounter(input: { branchId: string; itemId: string; quantity: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    if (!isQuantity(input?.quantity)) throw new UserFacingError(QUANTITY);
    const [item, branch] = await Promise.all([
      prisma.stockItem.findUnique({ where: { id: String(input?.itemId ?? "") }, select: { id: true, name: true } }),
      prisma.branch.findUnique({ where: { id: String(input?.branchId ?? "") }, select: { id: true, name: true } }),
    ]);
    if (!item || !branch) throw new UserFacingError("Barang atau cabang tidak ditemukan. Muat ulang halaman.");
    const today = witaDateString(new Date());
    await prisma.$transaction((tx) =>
      moveItemToCounter(tx, { branchId: branch.id, itemId: item.id, itemName: item.name, quantity: input.quantity, today, actor }),
    );
    await recordAudit({ actor, action: "stock.move", entity: "StockItem", entityId: item.id, summary: `${item.name}: ${input.quantity} ke meja ${branch.name}` });
    revalidateCounter(item.id);
  });
}

/** Tarik stok meja satu batch kembali ke gudang (spec stok meja 3). Batch kedaluwarsa boleh ditarik. */
export async function pullToWarehouse(input: { batchId: string; quantity: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    if (!isQuantity(input?.quantity)) throw new UserFacingError(QUANTITY);
    const batch = await prisma.stockBatch.findUnique({
      where: { id: String(input?.batchId ?? "") },
      select: { id: true, itemId: true, batchNumber: true, item: { select: { name: true } } },
    });
    if (!batch) throw new UserFacingError("Batch tidak ditemukan.");
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.stockBatch.updateMany({
        where: { id: batch.id, counterRemaining: { gte: input.quantity } },
        data: { counterRemaining: { decrement: input.quantity }, quantityRemaining: { increment: input.quantity } },
      });
      if (count !== 1) throw new UserFacingError("Sisa meja batch ini tidak cukup. Muat ulang halaman.");
      const base = { batchId: batch.id, kind: "PINDAH" as const, staffId: actor.staffId, staffName: actor.name };
      await tx.stockMovement.createMany({
        data: [
          { ...base, location: "MEJA", quantity: -input.quantity },
          { ...base, location: "GUDANG", quantity: input.quantity },
        ],
      });
    });
    await recordAudit({
      actor,
      action: "stock.pull",
      entity: "StockBatch",
      entityId: batch.id,
      summary: `${batch.item.name} batch ${batch.batchNumber ?? "-"}: ${input.quantity} ke gudang`,
    });
    revalidateCounter(batch.itemId);
  });
}
```

- [ ] **Step 5: `src/server/stock-movements.ts`**

- Import `STOCK_LOCATION_LABEL` dari `@/lib/counter-stock`.
- Ganti isi `adjustStock` mulai dari `const batch = await prisma.stockBatch.findUnique(` sampai sebelum `await recordAudit(` dengan:

```ts
    const probe = await prisma.stockBatch.findUnique({ where: { id: adjustment.batchId }, select: { purchaseLine: { select: { invoiceId: true } } } });
    if (!probe) throw new UserFacingError("Batch tidak ditemukan.");

    const batch = await prisma.$transaction(async (tx) => {
      // Faktur dikunci lebih dulu, lalu status batalnya dibaca: penyesuaian dan pembatalan faktur tidak bisa saling
      // menyalip (pemeriksaan alur Stok 14 Okt 2026, spec stok meja 3).
      await lockInvoice(tx, probe.purchaseLine.invoiceId);
      const row = await tx.stockBatch.findUniqueOrThrow({
        where: { id: adjustment.batchId },
        select: { id: true, itemId: true, batchNumber: true, item: { select: { name: true } }, purchaseLine: { select: { invoice: { select: { cancelledAt: true } } } } },
      });
      if (row.purchaseLine.invoice.cancelledAt) throw new UserFacingError("Batch dari faktur yang dibatalkan tidak bisa disesuaikan.");
      if (adjustment.delta < 0) {
        if (!(await takeFromBatch(tx, row.id, -adjustment.delta, adjustment.location))) throw new UserFacingError(STOCK_NOT_ENOUGH);
      } else {
        await tx.stockBatch.update({
          where: { id: row.id },
          data: adjustment.location === "MEJA" ? { counterRemaining: { increment: adjustment.delta } } : { quantityRemaining: { increment: adjustment.delta } },
        });
      }
      await tx.stockMovement.create({
        data: {
          batchId: row.id,
          kind: "PENYESUAIAN",
          location: adjustment.location,
          quantity: adjustment.delta,
          reason: adjustment.reason,
          note: adjustment.note,
          staffId: actor.staffId,
          staffName: actor.name,
        },
      });
      return row;
    });
```

- Pada `recordAudit` di `adjustStock`, ganti `summary` menjadi:

  `` `${batch.item.name} batch ${batch.batchNumber ?? "-"} (${STOCK_LOCATION_LABEL[adjustment.location]}): ${adjustment.delta > 0 ? "+" : ""}${adjustment.delta} (${ADJUST_REASON_LABEL[adjustment.reason]})` ``

- Tambahkan `safeRevalidatePath("/admin/stok-meja");` di `revalidateMovement`.
- Di `createSupplierReturn`, ganti pesan `` `Sisa ${batch.item.name} (batch …) tidak cukup untuk diretur.` `` menjadi `` `Sisa gudang ${batch.item.name} (batch ${batch.batchNumber ?? "-"}) tidak cukup untuk diretur.` ``. Di `tests/integration/stock-movements.test.ts` (sekitar baris 129), sesuaikan harapannya menjadi `` `Sisa gudang ${SLUG} Amoxicillin 500 mg (batch -) tidak cukup untuk diretur.` ``.

- [ ] **Step 6: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npm run test:integration -- tests/integration/counter-moves.test.ts tests/integration/stock-movements.test.ts tests/integration/purchases.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/stock-store.ts src/server/counter-stock.ts src/server/stock-movements.ts tests/integration/stock-world.ts tests/integration/stock-movements.test.ts tests/integration/counter-moves.test.ts
git commit -m "feat: move stock between warehouse and front desk, adjust per location, and lock adjustments against invoice cancel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Tagihan mengambil stok meja; dokter dan menu Resep melihat gabungan

**Files:**
- Modify: `src/server/invoice-lifecycle.ts` (`finalizeInvoice`, `cancelInvoice`)
- Modify: `src/server/invoice-read.ts` (`listBillingItems`)
- Modify: `src/server/prescription-read.ts`, `src/server/stock-availability.ts`, `src/server/dispensing-read.ts` (`listDispenseItems`), `src/server/dispensing-lifecycle.ts` (`completeDispensing`)
- Modify: `tests/integration/invoice-world.ts` (`billingBatch`)
- Modify: `tests/integration/invoice-lifecycle.test.ts`, `tests/integration/dispensing-invoice.test.ts`, `tests/integration/purchase-pricing.test.ts`
- Test: `tests/integration/counter-invoice.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `availableStock`, `counterState`.
  - Task 3: `takeFromBatch(…, "MEJA")`, `HAS_STOCK`, `seedBatch({ counter })`.
- Produces:
  - `billingBatch(world, input & { counter?: number })`. Bawaannya `counter` = seluruh jumlah, jadi semua stok uji ada di meja.
  - `BillingItem.available` sekarang berarti stok meja.

- [ ] **Step 1: Tulis uji yang gagal**

Di `tests/integration/invoice-world.ts`, ganti `billingBatch` dengan:

```ts
/**
 * Faktur satu baris + batch + jurnal di cabang dunia ini (tanpa aksi server). Bawaannya seluruh jumlah sudah di
 * meja, karena tagihan mengambil stok meja (spec stok meja SM1); `counter: 0` untuk stok gudang saja.
 */
export function billingBatch(
  world: BillingWorld,
  input: { invoiceNumber: string; itemId: string; quantity: number; unitCost?: number; expiryDate?: string | null; counter?: number },
) {
  return seedBatch(world, { ...input, unitCost: input.unitCost ?? 1000, counter: input.counter ?? input.quantity });
}
```

Buat `tests/integration/counter-invoice.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addInvoiceItem, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { listBillingItems } from "@/server/invoice-read";
import { listPrescribableItems } from "@/server/prescription-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s1", name: "Rina", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "tagih-meja";
const WA = "6281200009740";
const today = witaDateString(new Date());
let world: BillingWorld;
let seq = 0;
let itemSeq = 0;

const newItem = () => {
  itemSeq += 1;
  return prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-${itemSeq}`, name: `${SLUG} Barang ${itemSeq}`, kind: "PRODUK", unit: "pcs", sellPrice: 5000 } });
};
const batchOf = (itemId: string, quantity: number, counter: number, days: number | null = 100) => {
  seq += 1;
  return billingBatch(world, { invoiceNumber: `TM-${seq}`, itemId, quantity, counter, expiryDate: days === null ? null : addDaysToDateString(today, days) });
};
async function draftWith(itemId: string, quantity: number) {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
  const { version } = await unwrap(addInvoiceItem({ invoiceId: id, version: 1, itemId, quantity }));
  return { id, version };
}
const sisa = async (batchId: string) => {
  const row = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } });
  return { gudang: row.quantityRemaining, meja: row.counterRemaining };
};

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("tagihan dan stok meja (spec stok meja SM1, 3)", () => {
  it("finalisasi mengurangi meja, gudang tetap; jurnal KELUAR berlokasi MEJA", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 10, 4);
    const { id, version } = await draftWith(item.id, 3);
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    expect(await sisa(b.batchId)).toEqual({ gudang: 6, meja: 1 });
    expect((await prisma.stockMovement.findFirstOrThrow({ where: { invoiceId: id, kind: "KELUAR" } })).location).toBe("MEJA");
  });

  it("meja kurang ditolak walau gudang cukup; tidak ada yang berubah", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 50, 2);
    const { id, version } = await draftWith(item.id, 3);
    expect(await finalizeInvoice({ invoiceId: id, version })).toEqual({
      ok: false,
      error: `Stok meja ${item.name} di Cabang Publik Uji tidak cukup (tersedia 2). Minta restock ke Apoteker.`,
    });
    expect(await sisa(b.batchId)).toEqual({ gudang: 48, meja: 2 });
  });

  it("batch kedaluwarsa di meja tidak dijual (Review Focus 1)", async () => {
    const item = await newItem();
    await batchOf(item.id, 5, 5, -1);
    const { id, version } = await draftWith(item.id, 1);
    const result = await finalizeInvoice({ invoiceId: id, version });
    expect(result).toEqual({ ok: false, error: `Stok meja ${item.name} di Cabang Publik Uji tidak cukup (tersedia 0). Minta restock ke Apoteker.` });
  });

  it("pembatalan mengembalikan stok ke lokasi asal pengambilannya", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 10, 5);
    const { id, version } = await draftWith(item.id, 2);
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    actor.role = "SUPER_ADMIN";
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Salah input" }));
    expect(await sisa(b.batchId)).toEqual({ gudang: 5, meja: 5 });
    const back = await prisma.stockMovement.findFirstOrThrow({ where: { invoiceId: id, kind: "PENYESUAIAN" } });
    expect(back.location).toBe("MEJA");

    // Tagihan dari sebelum fitur ini mengambil dari gudang: pembatalannya mengembalikan ke gudang.
    actor.role = "RESEPSIONIS";
    const old = await draftWith(item.id, 1);
    await unwrap(finalizeInvoice({ invoiceId: old.id, version: old.version }));
    await prisma.stockMovement.updateMany({ where: { invoiceId: old.id, kind: "KELUAR" }, data: { location: "GUDANG" } });
    actor.role = "SUPER_ADMIN";
    await unwrap(cancelInvoice({ invoiceId: old.id, reason: "Salah input" }));
    expect(await sisa(b.batchId)).toEqual({ gudang: 6, meja: 4 });
  });

  it("daftar barang tagihan menampilkan stok meja; dokter melihat gudang + meja", async () => {
    const item = await newItem();
    await batchOf(item.id, 10, 3);
    expect((await listBillingItems(world.branchId)).find((i) => i.id === item.id)?.available).toBe(3);
    expect((await listPrescribableItems(world.branchId, [])).find((i) => i.id === item.id)?.available).toBe(10);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/counter-invoice.test.ts`
Expected: FAIL, karena tagihan masih mengambil dari gudang.

- [ ] **Step 3: `finalizeInvoice` dan `cancelInvoice`**

Di `src/server/invoice-lifecycle.ts`:

- Ganti isi loop pengisian `live`, yaitu `live.set(line.itemId, await tx.stockBatch.findMany({ … }))`, dengan:

```ts
        // Tagihan mengambil stok meja resepsionis (spec stok meja SM1).
        const batches = await tx.stockBatch.findMany({
          where: { itemId: line.itemId, branchId: invoice.branchId, counterRemaining: { gt: 0 } },
          select: { id: true, counterRemaining: true, expiryDate: true, createdAt: true, unitCost: true },
        });
        live.set(
          line.itemId,
          batches.map(({ counterRemaining, ...batch }) => ({ ...batch, quantityRemaining: counterRemaining })),
        );
```

- Ganti pesan kurang stok menjadi:

  `` `Stok meja ${line.name} di ${invoice.branch.name} tidak cukup (tersedia ${plan.available}). Minta restock ke Apoteker.` ``

- Ganti `takeFromBatch(tx, take.batchId, take.quantity)` menjadi `takeFromBatch(tx, take.batchId, take.quantity, "MEJA")`.
- Tambahkan `location: "MEJA",` di `data` jurnal `KELUAR`.
- Di `cancelInvoice`, ganti loop `for (const use of invoice.lines.flatMap((line) => line.stockUses)) { … }` dengan:

```ts
      for (const use of invoice.lines.flatMap((line) => line.stockUses)) {
        // Kembali ke lokasi tempat stok diambil: meja, atau gudang untuk tagihan sebelum stok meja (spec stok meja 3).
        const taken = await tx.stockMovement.findFirst({ where: { invoiceId, batchId: use.batchId, kind: "KELUAR" }, select: { location: true } });
        const location = taken?.location ?? "MEJA";
        await tx.stockBatch.update({
          where: { id: use.batchId },
          data: location === "MEJA" ? { counterRemaining: { increment: use.quantity } } : { quantityRemaining: { increment: use.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            batchId: use.batchId,
            kind: "PENYESUAIAN",
            location,
            quantity: use.quantity,
            reason: "LAINNYA",
            note: `Tagihan ${invoice.number} dibatalkan`,
            invoiceId,
            staffId: actor.staffId,
            staffName: actor.name,
          },
        });
      }
```

- Tambahkan `safeRevalidatePath("/admin/stok-meja");` di `revalidateLifecycle`.

- [ ] **Step 4: Bacaan stok untuk tagihan, dokter, dan Resep**

- `src/server/invoice-read.ts`, `listBillingItems`:
  - Ganti `where` batch menjadi `{ branchId: String(branchId ?? ""), counterRemaining: { gt: 0 } }` dan `select` menjadi `{ counterRemaining: true, expiryDate: true }`.
  - Ganti `available: stockFlags(item.batches, 0, today).available` menjadi `available: counterState(item.batches, 0, today).available`.
  - Import `counterState` dari `@/lib/counter-stock`. Hapus import `stockFlags` bila tidak terpakai lagi.
  - Ubah komentar fungsi menjadi "stok meja tersedia di cabang (spec stok meja SM1)".
- `src/server/prescription-read.ts`:
  - `batches: { where: { branchId, ...HAS_STOCK }, select: { quantityRemaining: true, counterRemaining: true, expiryDate: true } }`
  - `available: availableStock(batches, today, "SEMUA")`
  - Import `HAS_STOCK` dari `@/server/stock-store` dan `availableStock` dari `@/lib/counter-stock`; hapus import `stockFlags`.
- `src/server/stock-availability.ts`: perubahan yang sama (gabungan gudang + meja, spec stok meja 6).
- `src/server/dispensing-read.ts`, `listDispenseItems`: perubahan yang sama.
- `src/server/dispensing-lifecycle.ts`, `completeDispensing`:
  - `where: { itemId: { in: … }, branchId: row.branchId, ...HAS_STOCK }`
  - `select: { itemId: true, quantityRemaining: true, counterRemaining: true, expiryDate: true }`
  - `available` = `availableStock(batches.filter((b) => b.itemId === n.itemId), today, "SEMUA")`

- [ ] **Step 5: Sesuaikan uji yang ada**

- `tests/integration/invoice-lifecycle.test.ts`:
  - `remaining` membaca `.counterRemaining`.
  - `aggregate` memakai `_sum: { counterRemaining: true }` dan `._sum.counterRemaining`.
  - Kedua harapan pesan menjadi `` `Stok meja ${SLUG} Serum C di Cabang Publik Uji tidak cukup (tersedia ${have}). Minta restock ke Apoteker.` `` dan `` `Stok meja ${SLUG} Solo di Cabang Publik Uji tidak cukup (tersedia 2). Minta restock ke Apoteker.` ``.
- `tests/integration/dispensing-invoice.test.ts`: `stockLeft` memakai `_sum: { counterRemaining: true }` dan `._sum.counterRemaining`.
- `tests/integration/purchase-pricing.test.ts`, uji "tagihan final yang mengambil stok tanpa harga …": `createPurchase` membuat stok gudang. Tepat sesudah baris `updateMany(… data: { quantityRemaining: 0 })`, ubah `data` baris itu menjadi `{ quantityRemaining: 0, counterRemaining: 0 }`, lalu tambahkan:

```ts
    // Tagihan mengambil stok meja (spec stok meja SM1): seluruh batch faktur ini dipindah ke meja.
    const own = await prisma.stockBatch.findFirstOrThrow({ where: { purchaseLine: { invoiceId: id } } });
    await prisma.stockBatch.update({ where: { id: own.id }, data: { counterRemaining: own.quantityRemaining, quantityRemaining: 0 } });
```

- [ ] **Step 6: Jalankan, pastikan lulus**

Bersihkan dulu sisa data E2E di basis data **uji**. Gunakan pembersihan tagihan dan stok yang biasa, ditambah `delete from "RestockRequest";`.

Run:

```bash
npx tsc --noEmit -p .
npm run test:integration > /tmp/integ.log 2>&1; tail -40 /tmp/integ.log
```

Expected: PASS, kecuali 3 kegagalan lama di `schedule.test.ts`.

Uji lain mungkin gagal karena memfinalkan tagihan berisi barang dari batch yang dibuat langsung dengan `prisma.stockBatch.create` (misalnya `report-cost.test.ts`, `report-margin.test.ts`, `harga-modal-schema.test.ts`). Untuk uji seperti itu:
- tambahkan `counterRemaining: <jumlah yang sama dengan quantityRemaining>` dan `quantityRemaining: 0` pada batch yang akan ditagih;
- untuk uji yang hanya membaca nilai stok, jangan ubah apa pun;
- catat setiap berkas yang diubah di ledger.

- [ ] **Step 7: Commit**

```bash
git add src/server/invoice-lifecycle.ts src/server/invoice-read.ts src/server/prescription-read.ts src/server/stock-availability.ts src/server/dispensing-read.ts src/server/dispensing-lifecycle.ts tests/integration
git commit -m "feat: invoices take front-desk stock and return it on cancel; doctors and pharmacists see combined stock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Bacaan stok per lokasi dan stok meja

**Files:**
- Modify: `src/server/stock-read.ts`
- Create: `src/server/counter-read.ts`
- Test: `tests/integration/counter-read.test.ts`

**Interfaces:**
- Consumes: Task 2 (`counterState`, `availableStock`, `CounterFlag`) dan Task 3 (`HAS_STOCK`).
- Produces:
  - `StockItemRow` mendapat:
    - `counterMinStock: number`
    - `counterAvailable: number`
    - `counterExpired: number`
    - `flags`, yang kini juga bisa memuat `MEJA_MENIPIS` atau `MEJA_HABIS`.
  - `listStockItems({ flag: "MEJA_MENIPIS" | "MEJA_HABIS" | … })` menyaring sesuai tanda.
  - `StockItemDetail`:
    - `item.counterMinStock`;
    - `batches[].counterRemaining`, `batches[].branchId`;
    - `movements[].location: StockLocationValue`;
    - `moveOptions: { branchId: string; branchName: string; warehouseAvailable: number }[]`.
  - `CounterItemRow = { id: string; code: string; name: string; unit: string; kind: StockItemKindValue; available: number; expired: number; counterMinStock: number; flag: CounterFlag | null; requested: boolean }`
  - `listCounterItems(branchId: string): Promise<CounterItemRow[]>` (hak `counter:read`).
  - `countCounterAlerts(): Promise<number>` (hak `counter:read`).

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/counter-read.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { countCounterAlerts, listCounterItems } from "@/server/counter-read";
import { getStockItemDetail, listStockItems } from "@/server/stock-read";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";

type Role = "SUPER_ADMIN" | "APOTEKER" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s1", name: "Rina", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-meja";
const today = witaDateString(new Date());
let world: StockWorld;

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
  await prisma.stockItem.update({ where: { id: world.drugId }, data: { counterMinStock: 5 } });
  await seedBatch(world, { invoiceNumber: "BM-1", itemId: world.drugId, quantity: 30, counter: 3, expiryDate: addDaysToDateString(today, 200) });
  await seedBatch(world, { invoiceNumber: "BM-2", itemId: world.drugId, quantity: 4, counter: 4, expiryDate: addDaysToDateString(today, -2) });
  await prisma.restockRequest.create({
    data: { branchId: world.branchId, requestedById: "s1", requestedByName: "Rina", lines: { create: [{ itemId: world.drugId, itemName: "x", requestedQuantity: 5 }] } },
  });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("stok meja untuk resepsionis (spec stok meja 4.1)", () => {
  it("meja tersedia, kedaluwarsa di meja, tanda, dan Sudah diminta; tanpa gudang atau harga (Review Focus 4)", async () => {
    const rows = await listCounterItems(world.branchId);
    const drug = rows.find((r) => r.id === world.drugId)!;
    expect(drug).toEqual({
      id: world.drugId,
      code: `${SLUG.toUpperCase()}-OBT`,
      name: `${SLUG} Amoxicillin 500 mg`,
      unit: "kapsul",
      kind: "OBAT",
      available: 3,
      expired: 4,
      counterMinStock: 5,
      flag: "MEJA_MENIPIS",
      requested: true,
    });
    expect(rows.find((r) => r.id === world.productId)).toMatchObject({ available: 0, flag: null, requested: false });
    expect(JSON.stringify(rows)).not.toMatch(/quantityRemaining|unitCost|sellPrice|value/);
    expect(await countCounterAlerts()).toBeGreaterThanOrEqual(1);
  });

  it("Admin Keuangan tidak membuka stok meja", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await expect(listCounterItems(world.branchId)).rejects.toThrow("forbidden: counter:read");
  });
});

describe("menu Stok per lokasi (spec stok meja 6)", () => {
  it("daftar barang: gudang dan meja terpisah, tanda meja ikut, saringan meja", async () => {
    actor.role = "APOTEKER";
    const row = (await listStockItems({ branchId: world.branchId })).find((r) => r.id === world.drugId)!;
    expect(row).toMatchObject({ available: 27, counterAvailable: 3, counterExpired: 4, counterMinStock: 5 });
    expect(row.flags).toEqual(expect.arrayContaining(["KEDALUWARSA", "MEJA_MENIPIS"]));
    expect((await listStockItems({ branchId: world.branchId, flag: "MEJA_MENIPIS" })).map((r) => r.id)).toContain(world.drugId);
    expect((await listStockItems({ branchId: world.branchId, flag: "MEJA_HABIS" })).map((r) => r.id)).not.toContain(world.drugId);
  });

  it("detail barang: batch dengan gudang dan meja, lokasi jurnal, dan pilihan cabang pindah", async () => {
    actor.role = "APOTEKER";
    const detail = (await getStockItemDetail(world.drugId))!;
    expect(detail.item.counterMinStock).toBe(5);
    expect(detail.batches.map((b) => [b.quantityRemaining, b.counterRemaining]).sort()).toEqual([[0, 4], [27, 3]]);
    expect(detail.movements.some((m) => m.kind === "PINDAH" && m.location === "MEJA")).toBe(true);
    expect(detail.moveOptions).toEqual([{ branchId: world.branchId, branchName: `Cabang ${SLUG}`, warehouseAvailable: 27 }]);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/counter-read.test.ts`
Expected: FAIL, karena modul `@/server/counter-read` belum ada.

- [ ] **Step 3: `src/server/stock-read.ts`**

- Import `availableStock`, `counterState`, dan `type StockLocationValue` dari `@/lib/counter-stock`, serta `HAS_STOCK` dari `@/server/stock-store`.
- `BATCH_STOCK_SELECT` → `{ quantityRemaining: true, counterRemaining: true, expiryDate: true, unitCost: true } as const`.
- `StockItemRow`: tambahkan `counterMinStock: number; counterAvailable: number; counterExpired: number;`.
- `listStockItems`:
  - Tambahkan `counterMinStock: true` di `select`.
  - Batch: `where: { branchId: filter.branchId, ...HAS_STOCK }`.
  - Ganti pemetaan baris dengan:

```ts
  const rows = items.map(({ batches, ...item }) => {
    const flags = stockFlags(batches, item.minStock, today);
    const counter = counterState(batches, item.counterMinStock, today);
    return {
      ...item,
      ...flags,
      value: withCost ? flags.value : null,
      counterAvailable: counter.available,
      counterExpired: counter.expired,
      flags: [...flagsOf(flags), ...(counter.flag ? [counter.flag] : [])],
    };
  });
```

- `StockBatchRow`: tambahkan `branchId: string; counterRemaining: number;`.
- `StockMovementRow`: tambahkan `location: StockLocationValue;`.
- `StockItemDetail`: tambahkan `counterMinStock: number` ke `item`, dan `moveOptions: { branchId: string; branchName: string; warehouseAvailable: number }[];`.
- `getStockItemDetail`:
  - Tambahkan `counterMinStock: true` di `select` barang.
  - Batch: `where: { itemId: item.id, ...HAS_STOCK }`, `select` ditambah `counterRemaining: true, branchId: true`.
  - Jurnal: `select` ditambah `location: true`.
  - Petakan `branchId: batch.branchId, counterRemaining: batch.counterRemaining`, dan di jurnal `location: movement.location`.
  - Sebelum `return`, tambahkan:

```ts
  // Cabang yang bisa mengisi meja dari gudangnya (spec stok meja 6): hanya sisa gudang yang belum kedaluwarsa.
  const byBranch = new Map<string, { branchId: string; branchName: string; warehouseAvailable: number }>();
  for (const batch of batches) {
    const entry = byBranch.get(batch.branchId) ?? { branchId: batch.branchId, branchName: batch.branch.name, warehouseAvailable: 0 };
    entry.warehouseAvailable += availableStock([batch], today, "GUDANG");
    byBranch.set(batch.branchId, entry);
  }
```

  dan sertakan `moveOptions: [...byBranch.values()].filter((option) => option.warehouseAvailable > 0)` di objek kembalian.
- `countStockAlerts`: batch `where: HAS_STOCK`.

- [ ] **Step 4: `src/server/counter-read.ts`**

```ts
import { prisma } from "@/lib/db";
import { counterState, type CounterFlag } from "@/lib/counter-stock";
import type { StockItemKindValue } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

/** Satu barang di meja resepsionis (spec stok meja 4.1). Sengaja tanpa sisa gudang, harga beli, dan nilai stok. */
export type CounterItemRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  kind: StockItemKindValue;
  available: number;
  expired: number;
  counterMinStock: number;
  flag: CounterFlag | null;
  /** Masih ada di permintaan restock yang menunggu di cabang ini. */
  requested: boolean;
};

export async function listCounterItems(branchId: string): Promise<CounterItemRow[]> {
  await requireCapability("counter:read");
  const today = witaDateString(new Date());
  const id = String(branchId ?? "");
  const [items, pending] = await Promise.all([
    prisma.stockItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        kind: true,
        counterMinStock: true,
        batches: { where: { branchId: id, counterRemaining: { gt: 0 } }, select: { counterRemaining: true, expiryDate: true } },
      },
    }),
    prisma.restockRequestLine.findMany({ where: { request: { branchId: id, status: "MENUNGGU" } }, select: { itemId: true } }),
  ]);
  const requested = new Set(pending.map((line) => line.itemId));
  return items.map(({ batches, ...item }) => {
    const state = counterState(batches, item.counterMinStock, today);
    return { ...item, available: state.available, expired: state.expired, flag: state.flag, requested: requested.has(item.id) };
  });
}

/** Lencana menu Stok meja (spec stok meja 4.1): barang aktif yang menipis atau habis di salah satu cabang aktif. */
export async function countCounterAlerts(): Promise<number> {
  await requireCapability("counter:read");
  const today = witaDateString(new Date());
  const [branches, items] = await Promise.all([
    prisma.branch.findMany({ where: { status: "AKTIF" }, select: { id: true } }),
    prisma.stockItem.findMany({
      where: { isActive: true, counterMinStock: { gt: 0 } },
      select: { counterMinStock: true, batches: { where: { counterRemaining: { gt: 0 } }, select: { branchId: true, counterRemaining: true, expiryDate: true } } },
    }),
  ]);
  let count = 0;
  for (const item of items) {
    const flagged = branches.some((branch) => counterState(item.batches.filter((b) => b.branchId === branch.id), item.counterMinStock, today).flag !== null);
    if (flagged) count += 1;
  }
  return count;
}
```

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npm run test:integration -- tests/integration/counter-read.test.ts tests/integration/stock-read.test.ts tests/integration/stock-catalog.test.ts`
Expected: PASS. Bila `tests/integration/stock-read.test.ts` tidak ada, jalankan berkas uji yang memanggil `listStockItems` (`grep -rln listStockItems tests/integration`).

Perbaiki juga fixture `StockItemRow` di uji unit dengan menambah `counterMinStock: 0, counterAvailable: 0, counterExpired: 0`. Berkasnya bisa dicari dengan `grep -rln "StockItemRow" tests/unit`.

- [ ] **Step 6: Commit**

```bash
git add src/server/stock-read.ts src/server/counter-read.ts tests/integration/counter-read.test.ts tests/unit
git commit -m "feat: read warehouse and front-desk stock separately, and the front-desk list for receptionists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Permintaan restock: buat, batal, kirim, tolak

**Files:**
- Create: `src/server/restock.ts`, `src/server/restock-read.ts`
- Test: `tests/integration/restock.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `validateRestockRequest`, `validateRestockSend`, `validateRejectReason`, `RestockRequestInput`, `RestockStatusValue`.
  - Task 3: `moveItemToCounter`.
- Produces, di `src/server/restock.ts` (`"use server"`):
  - `createRestockRequest(input: RestockRequestInput): Promise<ActionResult<{ id: string }>>`
  - `cancelRestockRequest(input: { requestId: string; version: number }): Promise<ActionResult<void>>`
  - `sendRestockRequest(input: { requestId: string; version: number; lines: { lineId: string; quantity: number }[] }): Promise<ActionResult<void>>`
  - `rejectRestockRequest(input: { requestId: string; version: number; reason: string }): Promise<ActionResult<void>>`
- Produces, di `src/server/restock-read.ts`:
  - `RestockRequestRow = { id: string; status: RestockStatusValue; version: number; branchId: string; branchName: string; note: string | null; requestedByName: string; createdAt: Date; decidedByName: string | null; decidedAt: Date | null; rejectReason: string | null; lines: { id: string; itemId: string; itemName: string; unit: string; requestedQuantity: number; sentQuantity: number | null }[] }`
  - `listRestockRequests(filter: { branchId?: string; view: "MENUNGGU" | "RIWAYAT" }): Promise<RestockRequestRow[]>` (hak `counter:read`)
  - `RestockRequestDetail = RestockRequestRow & { lines: (RestockRequestRow["lines"][number] & { warehouseAvailable: number })[] }`
  - `getRestockRequest(id: string): Promise<RestockRequestDetail | null>` (hak `stock:manage`)
  - `countPendingRestock(): Promise<number>` (hak `stock:manage`)

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/restock.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { cancelRestockRequest, createRestockRequest, rejectRestockRequest, sendRestockRequest } from "@/server/restock";
import { countPendingRestock, getRestockRequest, listRestockRequests } from "@/server/restock-read";
import { createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s1", name: "Rina", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "minta-meja";
const today = witaDateString(new Date());
let world: StockWorld;
let seq = 0;
let itemSeq = 0;

const as = (role: Role, name = role === "APOTEKER" ? "Apoteker Uji" : "Rina") => {
  actor.role = role;
  actor.name = name;
};
const newItem = async (warehouse: number) => {
  itemSeq += 1;
  const item = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-${itemSeq}`, name: `${SLUG} Barang ${itemSeq}`, kind: "PRODUK", unit: "pcs", sellPrice: 1000 } });
  seq += 1;
  const batch = await seedBatch(world, { invoiceNumber: `MM-${seq}`, itemId: item.id, quantity: warehouse, expiryDate: addDaysToDateString(today, 100) });
  return { ...item, ...batch };
};
const request = (itemIds: string[], quantity = 10) =>
  createRestockRequest({ branchId: world.branchId, note: "", lines: itemIds.map((itemId) => ({ itemId, quantity })) });
const linesOf = async (requestId: string) => (await prisma.restockRequestLine.findMany({ where: { requestId }, orderBy: { sortOrder: "asc" } }));

beforeAll(async () => {
  await cleanupStockWorld(SLUG);
  world = await createStockWorld(SLUG);
});
beforeEach(() => as("RESEPSIONIS"));
afterAll(async () => {
  await cleanupStockWorld(SLUG);
  await prisma.$disconnect();
});

describe("permintaan restock (spec stok meja 4)", () => {
  it("resepsionis meminta; barang yang masih diminta tidak bisa diminta lagi", async () => {
    const a = await newItem(20);
    const { id } = await unwrap(request([a.id]));
    expect(await prisma.restockRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "MENUNGGU", requestedByName: "Rina", branchId: world.branchId });
    expect((await linesOf(id))[0]).toMatchObject({ itemId: a.id, itemName: a.name, requestedQuantity: 10, sentQuantity: null });
    expect(await request([a.id])).toEqual({ ok: false, error: `${a.name} sudah ada di permintaan yang menunggu.` });
    expect(await prisma.auditLog.count({ where: { action: "restock.request", entityId: id } })).toBe(1);
  });

  it("dua permintaan bersamaan untuk barang yang sama: hanya satu tersimpan (Review Focus 2)", async () => {
    const a = await newItem(20);
    const results = await Promise.all([request([a.id]), request([a.id])]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.restockRequestLine.count({ where: { itemId: a.id } })).toBe(1);
  });

  it("Apoteker tidak meminta; resepsionis tidak mengirim", async () => {
    const a = await newItem(5);
    as("APOTEKER");
    await expect(request([a.id])).rejects.toThrow("forbidden: restock:request");
    as("RESEPSIONIS");
    const { id } = await unwrap(request([a.id]));
    await expect(sendRestockRequest({ requestId: id, version: 1, lines: [] })).rejects.toThrow("forbidden: stock:manage");
  });

  it("dibatalkan peminta selama menunggu; sesudahnya tidak bisa dikirim", async () => {
    const a = await newItem(5);
    const { id } = await unwrap(request([a.id]));
    await unwrap(cancelRestockRequest({ requestId: id, version: 1 }));
    expect(await prisma.restockRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DIBATALKAN", decidedByName: "Rina", version: 2 });
    as("APOTEKER");
    const [line] = await linesOf(id);
    expect(await sendRestockRequest({ requestId: id, version: 2, lines: [{ lineId: line.id, quantity: 1 }] })).toEqual({
      ok: false,
      error: "Permintaan ini sudah diproses. Muat ulang halaman.",
    });
  });

  it("Apoteker mengirim sebagian: stok pindah, jumlah kirim tercatat, jurnal tertaut ke barisnya", async () => {
    const a = await newItem(20);
    const b = await newItem(3);
    const { id } = await unwrap(request([a.id, b.id], 10));
    as("APOTEKER");
    const [la, lb] = await linesOf(id);
    await unwrap(sendRestockRequest({ requestId: id, version: 1, lines: [{ lineId: la.id, quantity: 6 }, { lineId: lb.id, quantity: 0 }] }));
    const done = await prisma.restockRequest.findUniqueOrThrow({ where: { id } });
    expect(done).toMatchObject({ status: "SELESAI", decidedByName: "Apoteker Uji", version: 2 });
    expect((await linesOf(id)).map((l) => l.sentQuantity)).toEqual([6, 0]);
    expect(await prisma.stockBatch.findUniqueOrThrow({ where: { id: a.batchId } })).toMatchObject({ quantityRemaining: 14, counterRemaining: 6 });
    expect(await prisma.stockMovement.count({ where: { restockLineId: la.id } })).toBe(2);
    expect(await prisma.stockBatch.findUniqueOrThrow({ where: { id: b.batchId } })).toMatchObject({ quantityRemaining: 3, counterRemaining: 0 });
  });

  it("kirim melebihi gudang ditolak dengan nama barang; tidak ada yang telanjur pindah (Review Focus 3)", async () => {
    const a = await newItem(10);
    const b = await newItem(10);
    const { id } = await unwrap(request([a.id, b.id], 8));
    as("APOTEKER");
    // Gudang b berkurang lewat retur setelah permintaan dibuat.
    await unwrap(createSupplierReturn({ invoiceId: b.invoiceId, lines: [{ batchId: b.batchId, quantity: 5 }], note: "" }));
    const [la, lb] = await linesOf(id);
    expect(await sendRestockRequest({ requestId: id, version: 1, lines: [{ lineId: la.id, quantity: 8 }, { lineId: lb.id, quantity: 8 }] })).toEqual({
      ok: false,
      error: `Sisa gudang ${b.name} tidak cukup (tersedia 5).`,
    });
    expect(await prisma.stockBatch.findUniqueOrThrow({ where: { id: a.batchId } })).toMatchObject({ quantityRemaining: 10, counterRemaining: 0 });
    expect((await prisma.restockRequest.findUniqueOrThrow({ where: { id } })).status).toBe("MENUNGGU");
  });

  it("dua kiriman bersamaan: hanya satu berhasil, stok pindah sekali (Review Focus 2)", async () => {
    const a = await newItem(20);
    const { id } = await unwrap(request([a.id], 5));
    as("APOTEKER");
    const [line] = await linesOf(id);
    const send = () => sendRestockRequest({ requestId: id, version: 1, lines: [{ lineId: line.id, quantity: 5 }] });
    const results = await Promise.all([send(), send()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: a.batchId } })).counterRemaining).toBe(5);
  });

  it("Apoteker menolak dengan alasan; versi usang ditolak", async () => {
    const a = await newItem(1);
    const { id } = await unwrap(request([a.id]));
    as("APOTEKER");
    expect(await rejectRestockRequest({ requestId: id, version: 1, reason: "x" })).toEqual({ ok: false, error: "Alasan penolakan 2–200 karakter." });
    expect(await rejectRestockRequest({ requestId: id, version: 9, reason: "Stok kosong" })).toEqual({ ok: false, error: "Permintaan ini sudah diproses. Muat ulang halaman." });
    await unwrap(rejectRestockRequest({ requestId: id, version: 1, reason: "Stok gudang kosong, sudah dipesan" }));
    expect(await prisma.restockRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DITOLAK", rejectReason: "Stok gudang kosong, sudah dipesan" });
  });

  it("bacaan: menunggu dan riwayat; rincian Apoteker memuat gudang tersedia", async () => {
    const a = await newItem(7);
    const { id } = await unwrap(request([a.id], 3));
    const pending = await listRestockRequests({ branchId: world.branchId, view: "MENUNGGU" });
    expect(pending.find((r) => r.id === id)).toMatchObject({ status: "MENUNGGU", lines: [{ itemName: a.name, unit: "pcs", requestedQuantity: 3, sentQuantity: null }] });
    expect(JSON.stringify(pending)).not.toMatch(/warehouseAvailable|unitCost/);
    await expect(getRestockRequest(id)).rejects.toThrow("forbidden: stock:manage");
    as("APOTEKER");
    expect((await getRestockRequest(id))!.lines[0].warehouseAvailable).toBe(7);
    expect(await countPendingRestock()).toBeGreaterThanOrEqual(1);
    expect((await listRestockRequests({ branchId: world.branchId, view: "RIWAYAT" })).every((r) => r.status !== "MENUNGGU")).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/restock.test.ts`
Expected: FAIL, karena modul belum ada.

- [ ] **Step 3: `src/server/restock.ts`**

```ts
"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { validateRejectReason, validateRestockRequest, validateRestockSend, type RestockRequestInput } from "@/lib/counter-stock";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { moveItemToCounter } from "@/server/stock-store";

const PROCESSED = "Permintaan ini sudah diproses. Muat ulang halaman.";

function revalidateRestock(requestId?: string) {
  for (const path of ["/admin/stok-meja", "/admin/stok", "/admin"]) safeRevalidatePath(path);
  if (requestId) safeRevalidatePath(`/admin/stok/permintaan/${requestId}`);
}

/** Mengunci permintaan sampai transaksi selesai, lalu memastikan masih menunggu dengan versi yang sama. */
async function lockPending(tx: Prisma.TransactionClient, requestId: string, version: unknown) {
  await tx.$queryRaw`SELECT id FROM "RestockRequest" WHERE id = ${requestId} FOR UPDATE`;
  const row = await tx.restockRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      version: true,
      branchId: true,
      branch: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { id: true, itemId: true, itemName: true } },
    },
  });
  if (!row) throw new UserFacingError("Permintaan tidak ditemukan.");
  if (row.status !== "MENUNGGU" || row.version !== version) throw new UserFacingError(PROCESSED);
  return row;
}

/** Resepsionis meminta restock meja (spec stok meja 4.1). Barang yang masih diminta di cabang ini ditolak. */
export async function createRestockRequest(input: RestockRequestInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("restock:request");
    const checked = validateRestockRequest(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const request = checked.value;

    const id = await prisma.$transaction(async (tx) => {
      // Cabang dikunci: dua permintaan bersamaan untuk barang yang sama bergiliran, yang kedua melihat yang pertama.
      const [branch] = await tx.$queryRaw<{ id: string; status: string }[]>`SELECT id, status::text FROM "Branch" WHERE id = ${request.branchId} FOR UPDATE`;
      if (!branch || branch.status !== "AKTIF") throw new UserFacingError("Pilih cabang yang aktif.");
      const items = await tx.stockItem.findMany({ where: { id: { in: request.lines.map((l) => l.itemId) }, isActive: true }, select: { id: true, name: true } });
      const nameOf = new Map(items.map((item) => [item.id, item.name]));
      if (nameOf.size !== request.lines.length) throw new UserFacingError("Barang tidak ditemukan atau nonaktif. Muat ulang halaman.");
      const pending = await tx.restockRequestLine.findFirst({
        where: { itemId: { in: request.lines.map((l) => l.itemId) }, request: { branchId: request.branchId, status: "MENUNGGU" } },
        select: { itemId: true },
      });
      if (pending) throw new UserFacingError(`${nameOf.get(pending.itemId)} sudah ada di permintaan yang menunggu.`);
      const created = await tx.restockRequest.create({
        data: {
          branchId: request.branchId,
          note: request.note,
          requestedById: actor.staffId,
          requestedByName: actor.name,
          lines: {
            create: request.lines.map((line, index) => ({ itemId: line.itemId, itemName: nameOf.get(line.itemId)!, requestedQuantity: line.quantity, sortOrder: index })),
          },
        },
        select: { id: true },
      });
      return created.id;
    });

    await recordAudit({ actor, action: "restock.request", entity: "RestockRequest", entityId: id, summary: `${request.lines.length} barang` });
    revalidateRestock(id);
    return { id };
  });
}

/** Batalkan permintaan yang masih menunggu (spec stok meja 4.1). */
export async function cancelRestockRequest(input: { requestId: string; version: number }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("restock:request");
    const requestId = String(input?.requestId ?? "");
    await prisma.$transaction(async (tx) => {
      await lockPending(tx, requestId, input?.version);
      await tx.restockRequest.update({
        where: { id: requestId },
        data: { status: "DIBATALKAN", decidedAt: new Date(), decidedById: actor.staffId, decidedByName: actor.name, version: { increment: 1 } },
      });
    });
    await recordAudit({ actor, action: "restock.cancel", entity: "RestockRequest", entityId: requestId, summary: "dibatalkan" });
    revalidateRestock(requestId);
  });
}

/**
 * Apoteker mengirim dari gudang ke meja (spec stok meja 4.2): tiap baris > 0 dipindah FEFO dalam satu transaksi;
 * satu baris gagal membatalkan seluruhnya. Jumlah kirim boleh kurang dari yang diminta.
 */
export async function sendRestockRequest(input: { requestId: string; version: number; lines: { lineId: string; quantity: number }[] }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const requestId = String(input?.requestId ?? "");
    const today = witaDateString(new Date());

    const summary = await prisma.$transaction(async (tx) => {
      const row = await lockPending(tx, requestId, input?.version);
      const checked = validateRestockSend(input?.lines, { lineIds: row.lines.map((line) => line.id) });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const sent = new Map(checked.value.map((entry) => [entry.lineId, entry.quantity]));
      for (const line of row.lines) {
        const quantity = sent.get(line.id)!;
        if (quantity > 0) {
          await moveItemToCounter(tx, { branchId: row.branchId, itemId: line.itemId, itemName: line.itemName, quantity, today, actor, restockLineId: line.id });
        }
        await tx.restockRequestLine.update({ where: { id: line.id }, data: { sentQuantity: quantity } });
      }
      await tx.restockRequest.update({
        where: { id: requestId },
        data: { status: "SELESAI", decidedAt: new Date(), decidedById: actor.staffId, decidedByName: actor.name, version: { increment: 1 } },
      });
      const moved = row.lines.filter((line) => sent.get(line.id)! > 0);
      return `${moved.length} barang ke meja ${row.branch.name}: ${moved.map((line) => `${line.itemName} ×${sent.get(line.id)}`).join(", ")}`;
    });

    await recordAudit({ actor, action: "restock.send", entity: "RestockRequest", entityId: requestId, summary });
    revalidateRestock(requestId);
  });
}

/** Apoteker menolak dengan alasan (spec stok meja 4.2); stok tidak berubah. */
export async function rejectRestockRequest(input: { requestId: string; version: number; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const reason = validateRejectReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const requestId = String(input?.requestId ?? "");
    await prisma.$transaction(async (tx) => {
      await lockPending(tx, requestId, input?.version);
      await tx.restockRequest.update({
        where: { id: requestId },
        data: { status: "DITOLAK", rejectReason: reason.value, decidedAt: new Date(), decidedById: actor.staffId, decidedByName: actor.name, version: { increment: 1 } },
      });
    });
    await recordAudit({ actor, action: "restock.reject", entity: "RestockRequest", entityId: requestId, summary: reason.value });
    revalidateRestock(requestId);
  });
}
```

- [ ] **Step 4: `src/server/restock-read.ts`**

```ts
import { availableStock, type RestockStatusValue } from "@/lib/counter-stock";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

export type RestockRequestRow = {
  id: string;
  status: RestockStatusValue;
  version: number;
  branchId: string;
  branchName: string;
  note: string | null;
  requestedByName: string;
  createdAt: Date;
  decidedByName: string | null;
  decidedAt: Date | null;
  rejectReason: string | null;
  lines: { id: string; itemId: string; itemName: string; unit: string; requestedQuantity: number; sentQuantity: number | null }[];
};

const ROW_SELECT = {
  id: true,
  status: true,
  version: true,
  branchId: true,
  branch: { select: { name: true } },
  note: true,
  requestedByName: true,
  createdAt: true,
  decidedByName: true,
  decidedAt: true,
  rejectReason: true,
  lines: {
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, itemId: true, itemName: true, requestedQuantity: true, sentQuantity: true, item: { select: { unit: true } } },
  },
} as const;

type Raw = Awaited<ReturnType<typeof prisma.restockRequest.findMany<{ select: typeof ROW_SELECT }>>>[number];

function toRow(row: Raw): RestockRequestRow {
  const { branch, lines, ...rest } = row;
  return {
    ...rest,
    branchName: branch.name,
    lines: lines.map(({ item, ...line }) => ({ ...line, unit: item.unit })),
  };
}

/** Permintaan menunggu (terlama dulu) atau riwayat 50 terakhir (spec stok meja 4.1–4.2). Tanpa sisa gudang. */
export async function listRestockRequests(filter: { branchId?: string; view: "MENUNGGU" | "RIWAYAT" }): Promise<RestockRequestRow[]> {
  await requireCapability("counter:read");
  const branch = filter.branchId ? { branchId: filter.branchId } : {};
  const rows =
    filter.view === "MENUNGGU"
      ? await prisma.restockRequest.findMany({ where: { ...branch, status: "MENUNGGU" }, orderBy: { createdAt: "asc" }, select: ROW_SELECT })
      : await prisma.restockRequest.findMany({ where: { ...branch, status: { not: "MENUNGGU" } }, orderBy: { createdAt: "desc" }, take: 50, select: ROW_SELECT });
  return rows.map(toRow);
}

export type RestockRequestDetail = Omit<RestockRequestRow, "lines"> & {
  lines: (RestockRequestRow["lines"][number] & { warehouseAvailable: number })[];
};

/** Rincian untuk Apoteker (spec stok meja 4.2): tiap baris memuat sisa gudang tersedia cabang itu. */
export async function getRestockRequest(id: string): Promise<RestockRequestDetail | null> {
  await requireCapability("stock:manage");
  const row = await prisma.restockRequest.findUnique({ where: { id: String(id ?? "") }, select: ROW_SELECT });
  if (!row) return null;
  const base = toRow(row);
  const today = witaDateString(new Date());
  const batches = await prisma.stockBatch.findMany({
    where: { branchId: base.branchId, itemId: { in: base.lines.map((l) => l.itemId) }, quantityRemaining: { gt: 0 } },
    select: { itemId: true, quantityRemaining: true, counterRemaining: true, expiryDate: true },
  });
  return {
    ...base,
    lines: base.lines.map((line) => ({
      ...line,
      warehouseAvailable: availableStock(batches.filter((b) => b.itemId === line.itemId), today, "GUDANG"),
    })),
  };
}

/** Lencana tab Permintaan dan kotak dasbor Apoteker (spec stok meja 4.2, 6). */
export async function countPendingRestock(): Promise<number> {
  await requireCapability("stock:manage");
  return prisma.restockRequest.count({ where: { status: "MENUNGGU" } });
}
```

Bila Prisma menolak tipe `Raw` karena generik `findMany<…>` tidak didukung versi ini, ganti dengan `type Raw = Prisma.RestockRequestGetPayload<{ select: typeof ROW_SELECT }>;` (import `type Prisma` dari `@prisma/client`), lalu catat di ledger.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npm run test:integration -- tests/integration/restock.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/restock.ts src/server/restock-read.ts tests/integration/restock.test.ts
git commit -m "feat: restock requests from the front desk, fulfilled or rejected by the pharmacist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Pemberitahuan langsung restock

**Files:**
- Modify: `src/lib/live-events.ts`, `src/server/live-events.ts`
- Test: `tests/unit/live-events.test.ts`, `tests/integration/live-events.test.ts`

**Interfaces:**
- Consumes: Task 1 (tabel `RestockRequest`).
- Produces:
  - `LiveEventKind` mendapat `"RESTOCK_BARU" | "RESTOCK_SELESAI" | "RESTOCK_DITOLAK"`.
  - `LiveEvent.count?: number` dan `LiveEvent.reason?: string`.
  - `patientName` berisi nama staf untuk peristiwa restock.

- [ ] **Step 1: Tulis uji yang gagal**

Di `tests/unit/live-events.test.ts`, perbarui harapan `watchedKinds`:

```ts
    expect(watchedKinds("APOTEKER")).toEqual(["RESEP_BARU", "RESTOCK_BARU"]);
    expect(watchedKinds("RESEPSIONIS")).toEqual(["RESEP_BARU", "RESEP_SELESAI", "SIAP_DITAGIH", "RESTOCK_SELESAI", "RESTOCK_DITOLAK"]);
    expect(watchedKinds("SUPER_ADMIN")).toEqual(["RESEP_BARU", "RESEP_SELESAI", "SIAP_DITAGIH", "RESTOCK_BARU", "RESTOCK_SELESAI", "RESTOCK_DITOLAK"]);
```

Lalu tambahkan:

```ts
  it("teks dan tujuan peristiwa restock (spec stok meja 5)", () => {
    const baru = event({ id: "RESTOCK_BARU:r1:1", kind: "RESTOCK_BARU", patientName: "Rina", entityId: "r1", count: 3 });
    expect(eventMessage(baru, "APOTEKER")).toEqual({ title: "Permintaan restock dari Rina: 3 barang", description: "Kirim stok dari gudang ke meja." });
    expect(eventHref(baru, "APOTEKER")).toBe("/admin/stok/permintaan/r1");
    const selesai = event({ kind: "RESTOCK_SELESAI", patientName: "Apoteker Uji", entityId: "r1", count: 2 });
    expect(eventMessage(selesai, "RESEPSIONIS")).toEqual({ title: "Restock dikirim: 2 barang", description: "Dikirim oleh Apoteker Uji." });
    expect(eventHref(selesai, "RESEPSIONIS")).toBe("/admin/stok-meja");
    const ditolak = event({ kind: "RESTOCK_DITOLAK", patientName: "Apoteker Uji", entityId: "r1", reason: "Stok kosong" });
    expect(eventMessage(ditolak, "RESEPSIONIS")).toEqual({ title: "Permintaan restock ditolak: Stok kosong", description: "Ditolak oleh Apoteker Uji." });
  });
```

Di `tests/integration/live-events.test.ts`, tambahkan sebelum uji kursor:

```ts
  it("restock: Apoteker menerima permintaan baru; resepsionis menerima kiriman dan penolakan (spec stok meja 5)", async () => {
    const created = await prisma.restockRequest.create({
      data: { branchId: world.branchId, requestedById: "s1", requestedByName: `Rina ${SLUG}`, lines: { create: [{ itemId: world.drugId, itemName: "Obat", requestedQuantity: 4 }] } },
    });
    const forPharmacist = (await liveEventsFor("APOTEKER", since)).events.filter((e) => e.kind === "RESTOCK_BARU" && e.entityId === created.id);
    expect(forPharmacist).toEqual([expect.objectContaining({ patientName: `Rina ${SLUG}`, count: 1 })]);
    expect((await liveEventsFor("RESEPSIONIS", since)).events.some((e) => e.kind === "RESTOCK_BARU")).toBe(false);

    const done = await prisma.restockRequest.create({
      data: {
        branchId: world.branchId,
        requestedById: "s1",
        requestedByName: "Rina",
        status: "SELESAI",
        decidedAt: new Date(),
        decidedById: "a1",
        decidedByName: `Apoteker ${SLUG}`,
        lines: { create: [{ itemId: world.drugId, itemName: "Obat", requestedQuantity: 4, sentQuantity: 3 }, { itemId: world.productId, itemName: "Serum", requestedQuantity: 1, sentQuantity: 0 }] },
      },
    });
    const rejected = await prisma.restockRequest.create({
      data: { branchId: world.branchId, requestedById: "s1", requestedByName: "Rina", status: "DITOLAK", decidedAt: new Date(), decidedById: "a1", decidedByName: `Apoteker ${SLUG}`, rejectReason: "Stok kosong", lines: { create: [{ itemId: world.drugId, itemName: "Obat", requestedQuantity: 1 }] } },
    });
    const events = (await liveEventsFor("RESEPSIONIS", since)).events;
    expect(events.find((e) => e.kind === "RESTOCK_SELESAI" && e.entityId === done.id)).toMatchObject({ patientName: `Apoteker ${SLUG}`, count: 1 });
    expect(events.find((e) => e.kind === "RESTOCK_DITOLAK" && e.entityId === rejected.id)).toMatchObject({ reason: "Stok kosong" });
    expect((await liveEventsFor("APOTEKER", since)).events.some((e) => e.kind === "RESTOCK_SELESAI")).toBe(false);
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/live-events.test.ts && npm run test:integration -- tests/integration/live-events.test.ts`
Expected: FAIL.

- [ ] **Step 3: `src/lib/live-events.ts`**

- Ganti tipe `LiveEventKind` dengan `"RESEP_BARU" | "RESEP_SELESAI" | "SIAP_DITAGIH" | "RESTOCK_BARU" | "RESTOCK_SELESAI" | "RESTOCK_DITOLAK"`.
- Di `LiveEvent`:
  - Ubah komentar `patientName` menjadi "Nama pasien; untuk restock, nama staf peminta atau pemutus."
  - Ubah komentar `entityId` menjadi "id penyerahan, kunjungan, atau permintaan restock."
  - Tambahkan `/** Restock: jumlah barang. */ count?: number;` dan `/** RESTOCK_DITOLAK: alasan Apoteker. */ reason?: string;`.
- Di `watchedKinds`, sebelum `return kinds;`:

```ts
  if (can(role, "stock:manage")) kinds.push("RESTOCK_BARU");
  if (can(role, "restock:request")) kinds.push("RESTOCK_SELESAI", "RESTOCK_DITOLAK");
```

- Di `eventMessage`, tambahkan:

```ts
    case "RESTOCK_BARU":
      return { title: `Permintaan restock dari ${event.patientName}: ${event.count ?? 0} barang`, description: "Kirim stok dari gudang ke meja." };
    case "RESTOCK_SELESAI":
      return { title: `Restock dikirim: ${event.count ?? 0} barang`, description: `Dikirim oleh ${event.patientName}.` };
    case "RESTOCK_DITOLAK":
      return { title: `Permintaan restock ditolak: ${event.reason ?? ""}`, description: `Ditolak oleh ${event.patientName}.` };
```

- Di awal `eventHref`:

```ts
  if (event.kind === "RESTOCK_BARU") return `/admin/stok/permintaan/${event.entityId}`;
  if (event.kind === "RESTOCK_SELESAI" || event.kind === "RESTOCK_DITOLAK") return "/admin/stok-meja";
```

- Ubah komentar baris kedua berkas menjadi "Aturan murni pemberitahuan langsung (resep, siap ditagih, restock meja)."

- [ ] **Step 4: `src/server/live-events.ts`**

Tambahkan sebelum `events.sort(…)`:

```ts
  if (kinds.includes("RESTOCK_BARU")) {
    const rows = await prisma.restockRequest.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: "asc" },
      take: LIMIT,
      select: { id: true, createdAt: true, requestedByName: true, _count: { select: { lines: true } } },
    });
    for (const row of rows) {
      events.push({ id: `RESTOCK_BARU:${row.id}:${row.createdAt.getTime()}`, kind: "RESTOCK_BARU", patientName: row.requestedByName, at: row.createdAt.toISOString(), entityId: row.id, count: row._count.lines });
    }
  }
  if (kinds.includes("RESTOCK_SELESAI")) {
    const rows = await prisma.restockRequest.findMany({
      where: { decidedAt: range, status: { in: ["SELESAI", "DITOLAK"] } },
      orderBy: { decidedAt: "asc" },
      take: LIMIT,
      select: { id: true, status: true, decidedAt: true, decidedByName: true, rejectReason: true, lines: { select: { sentQuantity: true } } },
    });
    for (const row of rows) {
      const at = row.decidedAt as Date;
      const kind = row.status === "SELESAI" ? ("RESTOCK_SELESAI" as const) : ("RESTOCK_DITOLAK" as const);
      events.push({
        id: `${kind}:${row.id}:${at.getTime()}`,
        kind,
        patientName: row.decidedByName ?? "-",
        at: at.toISOString(),
        entityId: row.id,
        ...(kind === "RESTOCK_SELESAI" ? { count: row.lines.filter((line) => (line.sentQuantity ?? 0) > 0).length } : { reason: row.rejectReason ?? "" }),
      });
    }
  }
```

Tambahkan juga "dan restock meja (permintaan dibuat, dikirim, ditolak)" ke komentar dokumentasi `liveEventsFor`.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/live-events.test.ts tests/unit/live-notifier.test.tsx && npm run test:integration -- tests/integration/live-events.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/live-events.ts src/server/live-events.ts tests/unit/live-events.test.ts tests/integration/live-events.test.ts
git commit -m "feat: live notices for restock requests, deliveries, and rejections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Halaman Stok meja, dialog Minta restock, menu, dan dasbor resepsionis

**Files:**
- Create:
  - `src/components/admin/counter/counter-stock-table.tsx`
  - `src/components/admin/counter/fill-counter-dialog.tsx`
  - `src/components/admin/counter/restock-request-dialog.tsx`
  - `src/components/admin/counter/restock-request-list.tsx`
  - `src/components/admin/counter/cancel-restock-button.tsx`
  - `src/components/admin/counter/counter-tiles.tsx`
- Create: `src/app/(admin)/admin/stok-meja/page.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/page.tsx`
- Test:
  - `tests/unit/components/counter-stock-table.test.tsx`
  - `tests/unit/components/restock-request-dialog.test.tsx`
  - `tests/unit/components/restock-request-list.test.tsx`
  - `tests/unit/components/app-sidebar.test.tsx`

**Interfaces:**
- Consumes:
  - Task 2: `suggestedRestock`, `validateRestockRequest`, `RESTOCK_STATUS_LABEL`, `RESTOCK_NOTE_MAX`.
  - Task 3: `moveToCounter`.
  - Task 5: `CounterItemRow`, `listCounterItems`, `countCounterAlerts`.
  - Task 6: `createRestockRequest`, `cancelRestockRequest`, `RestockRequestRow`, `listRestockRequests`.
- Produces:
  - `FillCounterDialog({ item: { id; name; unit }, branches: { id: string; name: string; warehouseAvailable?: number }[], triggerLabel?: string })`
  - `RestockRequestDialog({ branchId: string; options: CounterItemRow[]; initial?: { itemId: string; quantity: number }[]; triggerLabel?: string })`
  - `RestockRequestList({ rows: RestockRequestRow[]; canCancel: boolean; linkToDetail: boolean })`
  - `CounterStockTable({ rows: CounterItemRow[]; branchId: string; branchName: string; canFill: boolean })`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/counter-stock-table.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CounterStockTable } from "@/components/admin/counter/counter-stock-table";
import type { CounterItemRow } from "@/server/counter-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/counter-stock", () => ({ moveToCounter: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const row = (patch: Partial<CounterItemRow> = {}): CounterItemRow => ({
  id: "i1",
  code: "AMX",
  name: "Amoxicillin",
  unit: "kapsul",
  kind: "OBAT",
  available: 3,
  expired: 2,
  counterMinStock: 5,
  flag: "MEJA_MENIPIS",
  requested: true,
  ...patch,
});

describe("CounterStockTable (spec stok meja 4.1)", () => {
  it("menampilkan meja, kedaluwarsa di meja, Batas meja, tanda, dan Sudah diminta; tanpa harga", () => {
    renderAdmin(<CounterStockTable rows={[row()]} branchId="b1" branchName="Mahakeret" canFill={false} />);
    const table = screen.getByRole("table", { name: "Stok meja" });
    const r = within(table).getByRole("row", { name: /Amoxicillin/ });
    expect(r).toHaveTextContent("3 kapsul");
    expect(r).toHaveTextContent("2 kedaluwarsa di meja");
    expect(r).toHaveTextContent("Meja menipis");
    expect(r).toHaveTextContent("Sudah diminta");
    expect(table).not.toHaveTextContent("Rp");
    expect(screen.queryByRole("button", { name: /Isi meja/ })).toBeNull();
  });

  it("Apoteker mendapat tombol Isi meja per barang", () => {
    renderAdmin(<CounterStockTable rows={[row({ flag: "MEJA_HABIS", available: 0, requested: false })]} branchId="b1" branchName="Mahakeret" canFill />);
    expect(screen.getByRole("button", { name: "Isi meja Amoxicillin" })).toBeInTheDocument();
    expect(screen.getByText("Meja habis")).toBeInTheDocument();
  });
});
```

Buat `tests/unit/components/restock-request-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestockRequestDialog } from "@/components/admin/counter/restock-request-dialog";
import { createRestockRequest } from "@/server/restock";
import type { CounterItemRow } from "@/server/counter-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/restock", () => ({ createRestockRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const item = (patch: Partial<CounterItemRow>): CounterItemRow => ({
  id: "i1", code: "AMX", name: "Amoxicillin", unit: "kapsul", kind: "OBAT", available: 0, expired: 0, counterMinStock: 5, flag: "MEJA_HABIS", requested: false, ...patch,
});
const OPTIONS = [
  item({}),
  item({ id: "i2", code: "VIT", name: "Vitamin C", unit: "tablet", available: 30, counterMinStock: 10, flag: null }),
  item({ id: "i3", code: "SRM", name: "Serum", unit: "botol", available: 1, counterMinStock: 2, flag: "MEJA_MENIPIS", requested: true }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createRestockRequest).mockResolvedValue({ ok: true, data: { id: "r1" } });
});

describe("RestockRequestDialog (spec stok meja 4.1)", { timeout: 15_000 }, () => {
  it("terisi barang yang menipis/habis dan belum diminta, dengan jumlah usulan; yang sudah diminta disebut", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockRequestDialog branchId="b1" options={OPTIONS} />);
    await user.click(screen.getByRole("button", { name: "Minta restock" }));
    const dialog = screen.getByRole("dialog", { name: "Minta restock" });
    expect(within(dialog).getByLabelText("Barang 1")).toHaveValue("Amoxicillin (AMX)");
    expect(within(dialog).getByLabelText("Jumlah 1")).toHaveValue(10);
    expect(within(dialog).queryByLabelText("Barang 2")).toBeNull();
    expect(dialog).toHaveTextContent("Sudah diminta: Serum");
    await user.type(within(dialog).getByLabelText("Catatan"), "untuk sore");
    await user.click(within(dialog).getByRole("button", { name: "Kirim permintaan" }));
    await waitFor(() =>
      expect(createRestockRequest).toHaveBeenCalledWith({ branchId: "b1", note: "untuk sore", lines: [{ itemId: "i1", quantity: 10 }] }),
    );
  });

  it("isian awal dari pemanggil (draf tagihan) dan validasi di layar", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockRequestDialog branchId="b1" options={OPTIONS} initial={[{ itemId: "i2", quantity: 4 }]} />);
    await user.click(screen.getByRole("button", { name: "Minta restock" }));
    const dialog = screen.getByRole("dialog", { name: "Minta restock" });
    expect(within(dialog).getByLabelText("Barang 1")).toHaveValue("Vitamin C (VIT)");
    await user.clear(within(dialog).getByLabelText("Jumlah 1"));
    await user.click(within(dialog).getByRole("button", { name: "Kirim permintaan" }));
    expect(await within(dialog).findByText("Jumlah restock harus bilangan bulat 1–9.999.")).toBeInTheDocument();
    expect(createRestockRequest).not.toHaveBeenCalled();
  });
});
```

Buat `tests/unit/components/restock-request-list.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RestockRequestList } from "@/components/admin/counter/restock-request-list";
import type { RestockRequestRow } from "@/server/restock-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/restock", () => ({ cancelRestockRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const row = (patch: Partial<RestockRequestRow> = {}): RestockRequestRow => ({
  id: "r1",
  status: "MENUNGGU",
  version: 1,
  branchId: "b1",
  branchName: "Mahakeret",
  note: null,
  requestedByName: "Rina",
  createdAt: new Date("2026-10-14T02:00:00Z"),
  decidedByName: null,
  decidedAt: null,
  rejectReason: null,
  lines: [{ id: "l1", itemId: "i1", itemName: "Amoxicillin", unit: "kapsul", requestedQuantity: 10, sentQuantity: null }],
  ...patch,
});

describe("RestockRequestList (spec stok meja 4)", () => {
  it("menunggu: barang diminta, tombol Batalkan untuk peminta, Proses untuk Apoteker", () => {
    renderAdmin(<RestockRequestList rows={[row()]} canCancel linkToDetail />);
    expect(screen.getByText("Amoxicillin: diminta 10 kapsul")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batalkan permintaan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proses" })).toHaveAttribute("href", "/admin/stok/permintaan/r1");
  });

  it("selesai dan ditolak: jumlah kirim, pemutus, alasan; tanpa tombol", () => {
    renderAdmin(
      <RestockRequestList
        rows={[
          row({ id: "r2", status: "SELESAI", decidedByName: "Apoteker Uji", decidedAt: new Date(), lines: [{ id: "l2", itemId: "i1", itemName: "Amoxicillin", unit: "kapsul", requestedQuantity: 10, sentQuantity: 6 }] }),
          row({ id: "r3", status: "DITOLAK", decidedByName: "Apoteker Uji", decidedAt: new Date(), rejectReason: "Stok kosong" }),
        ]}
        canCancel
        linkToDetail
      />,
    );
    expect(screen.getByText("Amoxicillin: diminta 10 kapsul · dikirim 6 kapsul")).toBeInTheDocument();
    expect(screen.getByText("Ditolak Apoteker Uji: Stok kosong")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Batalkan permintaan" })).toBeNull();
  });

  it("kosong", () => {
    renderAdmin(<RestockRequestList rows={[]} canCancel={false} linkToDetail={false} />);
    expect(screen.getByText("Belum ada permintaan.")).toBeInTheDocument();
  });
});
```

Di `tests/unit/components/app-sidebar.test.tsx`, tambahkan (memakai pembantu render yang sudah dipakai uji lain di berkas itu):

```tsx
  it("Stok meja untuk resepsionis dan Apoteker, dengan lencana; tidak untuk Admin Keuangan (spec stok meja 4.1)", () => {
    // render AppSidebar sebagai RESEPSIONIS dengan counterAlerts={2}, memakai pola render uji lain di berkas ini
    expect(screen.getByRole("link", { name: /Stok meja/ })).toHaveAttribute("href", "/admin/stok-meja");
    expect(screen.getByLabelText("2 barang meja menipis atau habis")).toBeInTheDocument();
  });
```

Ganti komentar `// render …` dengan pemanggilan render yang persis sama dengan uji lain di berkas itu (peran `RESEPSIONIS`, `counterAlerts={2}`). Tambahkan juga pemeriksaan bahwa `ADMIN_KEUANGAN` tidak melihat tautan "Stok meja", dan catat bentuk aslinya di ledger.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/counter-stock-table.test.tsx tests/unit/components/restock-request-dialog.test.tsx tests/unit/components/restock-request-list.test.tsx tests/unit/components/app-sidebar.test.tsx`
Expected: FAIL, karena modul belum ada.

- [ ] **Step 3: Komponen**

`src/components/admin/counter/fill-counter-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moveToCounter } from "@/server/counter-stock";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

/** Isi meja dari gudang tanpa permintaan (spec stok meja 4.2): FEFO di server. Hanya untuk stock:manage. */
export function FillCounterDialog({
  item,
  branches,
  triggerLabel = "Isi meja",
}: {
  item: { id: string; name: string; unit: string };
  branches: { id: string; name: string; warehouseAvailable?: number }[];
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const branch = branches.find((b) => b.id === branchId);

  function save() {
    const value = quantity.trim() === "" ? Number.NaN : Number(quantity);
    if (!Number.isInteger(value) || value < 1) {
      setError("Jumlah harus bilangan bulat lebih dari 0.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await moveToCounter({ branchId, itemId: item.id, quantity: value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Meja diisi.");
        setOpen(false);
        setQuantity("");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button size="small" variant="outlined" aria-label={`${triggerLabel} ${item.name}`} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>
          {triggerLabel} {item.name}
        </DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <DialogContentText>Dipindah dari gudang, kedaluwarsa terdekat dulu.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            {branches.length > 1 && (
              <SelectField id={`fill-branch-${item.id}`} label="Cabang" value={branchId} onChange={setBranchId}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectField>
            )}
            <TextField
              id={`fill-qty-${item.id}`}
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              helperText={branch?.warehouseAvailable !== undefined ? `Gudang tersedia ${branch.warehouseAvailable} ${item.unit}` : " "}
              fullWidth
              slotProps={{ htmlInput: { min: 1, inputMode: "numeric" }, input: { endAdornment: <InputAdornment position="end">{item.unit}</InputAdornment> } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`src/components/admin/counter/counter-stock-table.tsx`:

```tsx
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { STOCK_FLAG_LABEL } from "@/lib/stock";
import type { CounterItemRow } from "@/server/counter-read";
import { StatusChip } from "../mui/status-chip";
import { EmptyState } from "../page-layout";
import { FillCounterDialog } from "./fill-counter-dialog";

/** Stok meja satu cabang (spec stok meja 4.1): meja tersedia, Batas meja, dan tanda. Tanpa gudang dan harga. */
export function CounterStockTable({ rows, branchId, branchName, canFill }: { rows: CounterItemRow[]; branchId: string; branchName: string; canFill: boolean }) {
  if (rows.length === 0) return <EmptyState>Tidak ada barang di tampilan ini.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Stok meja">
        <TableHead>
          <TableRow>
            <TableCell>Barang</TableCell>
            <TableCell align="right">Meja</TableCell>
            <TableCell align="right">Batas meja</TableCell>
            <TableCell>Tanda</TableCell>
            {canFill && <TableCell>Aksi</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Box sx={{ fontWeight: 500 }}>{row.name}</Box>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {row.code}
                </Typography>
              </TableCell>
              <TableCell align="right">
                {row.available} {row.unit}
                {row.expired > 0 && <Box sx={{ fontSize: "0.75rem", color: "error.main" }}>{row.expired} kedaluwarsa di meja</Box>}
              </TableCell>
              <TableCell align="right">{row.counterMinStock > 0 ? row.counterMinStock : "—"}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {row.flag && <StatusChip label={STOCK_FLAG_LABEL[row.flag]} tone={row.flag === "MEJA_HABIS" ? "error" : "warning"} />}
                  {row.requested && <StatusChip label="Sudah diminta" tone="info" />}
                </Stack>
              </TableCell>
              {canFill && (
                <TableCell>
                  <FillCounterDialog item={{ id: row.id, name: row.name, unit: row.unit }} branches={[{ id: branchId, name: branchName }]} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

`src/components/admin/counter/restock-request-dialog.tsx`:

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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RESTOCK_NOTE_MAX, suggestedRestock, validateRestockRequest } from "@/lib/counter-stock";
import type { CounterItemRow } from "@/server/counter-read";
import { createRestockRequest } from "@/server/restock";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { ItemAutocomplete } from "../mui/item-autocomplete";

type Row = { key: number; itemId: string; quantity: string };

/**
 * Minta restock meja (spec stok meja 4.1). Bawaannya terisi barang yang menipis atau habis dan belum diminta, dengan
 * jumlah usulan; `initial` dipakai draf tagihan untuk barang yang kurang. Barang yang masih diminta tidak bisa dipilih.
 */
export function RestockRequestDialog({
  branchId,
  options,
  initial,
  triggerLabel = "Minta restock",
}: {
  branchId: string;
  options: CounterItemRow[];
  initial?: { itemId: string; quantity: number }[];
  triggerLabel?: string;
}) {
  const router = useRouter();
  const startRows = (): Row[] => {
    const list =
      initial ?? options.filter((o) => o.flag !== null && !o.requested).map((o) => ({ itemId: o.id, quantity: suggestedRestock(o.counterMinStock, o.available) }));
    return list.length > 0 ? list.map((entry, index) => ({ key: index + 1, itemId: entry.itemId, quantity: String(entry.quantity) })) : [{ key: 1, itemId: "", quantity: "" }];
  };
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(startRows);
  const [nextKey, setNextKey] = useState(1000);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requested = options.filter((o) => o.requested);
  const choices = (current: string) =>
    options.filter((o) => !o.requested || o.id === current).map((o) => ({ id: o.id, code: o.code, name: o.name, unit: o.unit }));
  const update = (key: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  function openDialog() {
    setRows(startRows());
    setNote("");
    setError(null);
    setOpen(true);
  }

  function submit() {
    const input = {
      branchId,
      note,
      lines: rows
        .filter((row) => row.itemId || row.quantity.trim())
        .map((row) => ({ itemId: row.itemId, quantity: row.quantity.trim() === "" ? Number.NaN : Number(row.quantity) })),
    };
    const checked = validateRestockRequest(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createRestockRequest(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Permintaan restock dikirim.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal mengirim. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="contained" onClick={openDialog}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Minta restock</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {rows.map((row, index) => {
              const n = index + 1;
              return (
                <Stack key={row.key} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                  <ItemAutocomplete label={`Barang ${n}`} items={choices(row.itemId)} value={row.itemId} onChange={(itemId) => update(row.key, { itemId })} sx={{ flex: 1 }} />
                  <TextField
                    label={`Jumlah ${n}`}
                    type="number"
                    value={row.quantity}
                    onChange={(e) => update(row.key, { quantity: e.target.value })}
                    sx={{ width: { sm: 120 } }}
                    slotProps={{ htmlInput: { min: 1, inputMode: "numeric" } }}
                  />
                  {rows.length > 1 && (
                    <Button type="button" size="small" aria-label={`Hapus barang ${n}`} onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}>
                      Hapus
                    </Button>
                  )}
                </Stack>
              );
            })}
            <Box>
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => {
                  setRows((current) => [...current, { key: nextKey, itemId: "", quantity: "" }]);
                  setNextKey((key) => key + 1);
                }}
              >
                + Barang lain
              </Button>
            </Box>
            {requested.length > 0 && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Sudah diminta: {requested.map((o) => o.name).join(", ")}
              </Typography>
            )}
            <TextField label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: RESTOCK_NOTE_MAX } }} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={submit} disabled={pending}>
            {pending ? "Mengirim…" : "Kirim permintaan"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`src/components/admin/counter/cancel-restock-button.tsx`:

```tsx
"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelRestockRequest } from "@/server/restock";

/** Batalkan permintaan yang masih menunggu (spec stok meja 4.1). */
export function CancelRestockButton({ requestId, version }: { requestId: string; version: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="small"
      variant="text"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await cancelRestockRequest({ requestId, version });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Permintaan dibatalkan.");
            router.refresh();
          } catch {
            toast.error("Gagal membatalkan. Coba lagi.");
          }
        })
      }
    >
      Batalkan permintaan
    </Button>
  );
}
```

`src/components/admin/counter/restock-request-list.tsx`:

```tsx
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { RESTOCK_STATUS_LABEL, type RestockStatusValue } from "@/lib/counter-stock";
import { formatDateWithYear } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { RestockRequestRow } from "@/server/restock-read";
import { LinkButton } from "../mui/links";
import { StatusChip, type StatusTone } from "../mui/status-chip";
import { EmptyState } from "../page-layout";
import { CancelRestockButton } from "./cancel-restock-button";

const TONE: Record<RestockStatusValue, StatusTone> = { MENUNGGU: "warning", SELESAI: "success", DITOLAK: "error", DIBATALKAN: "neutral" };

/** Daftar permintaan restock (spec stok meja 4): menunggu atau riwayat, tanpa sisa gudang. */
export function RestockRequestList({ rows, canCancel, linkToDetail }: { rows: RestockRequestRow[]; canCancel: boolean; linkToDetail: boolean }) {
  if (rows.length === 0) return <EmptyState>Belum ada permintaan.</EmptyState>;
  return (
    <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
      {rows.map((row) => (
        <Box component="li" key={row.id} sx={{ p: 2, display: "flex", flexDirection: "column", gap: 0.5, fontSize: "0.875rem" }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            <StatusChip label={RESTOCK_STATUS_LABEL[row.status]} tone={TONE[row.status]} />
            <Box component="span" sx={{ fontWeight: 500 }}>
              {row.requestedByName}
            </Box>
            <Box component="span" sx={{ color: "text.secondary" }}>
              {formatDateWithYear(row.createdAt)} {minutesToTimeLabel(witaMinutesOfDay(row.createdAt))} · {row.branchName}
            </Box>
          </Stack>
          {row.lines.map((line) => (
            <Box key={line.id}>
              {`${line.itemName}: diminta ${line.requestedQuantity} ${line.unit}${line.sentQuantity !== null ? ` · dikirim ${line.sentQuantity} ${line.unit}` : ""}`}
            </Box>
          ))}
          {row.note && <Box sx={{ color: "text.secondary" }}>Catatan: {row.note}</Box>}
          {row.status === "SELESAI" && <Box sx={{ color: "text.secondary" }}>{`Dikirim ${row.decidedByName ?? ""}`}</Box>}
          {row.status === "DITOLAK" && <Box sx={{ color: "error.main" }}>{`Ditolak ${row.decidedByName ?? ""}: ${row.rejectReason ?? ""}`}</Box>}
          {row.status === "MENUNGGU" && (canCancel || linkToDetail) && (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", pt: 0.5 }}>
              {linkToDetail && (
                <LinkButton href={`/admin/stok/permintaan/${row.id}`} size="small" variant="outlined">
                  Proses
                </LinkButton>
              )}
              {canCancel && <CancelRestockButton requestId={row.id} version={row.version} />}
            </Stack>
          )}
        </Box>
      ))}
    </Box>
  );
}
```

`src/components/admin/counter/counter-tiles.tsx`:

```tsx
import Box from "@mui/material/Box";
import { StatTile } from "../stat-tile";

/** Kotak Stok meja di dasbor resepsionis (spec stok meja 6). */
export function CounterTiles({ alerts }: { alerts: number }) {
  return (
    <Box component="section" aria-label="Stok meja" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
      <StatTile label="Stok meja menipis / habis" value={alerts} note="barang" href="/admin/stok-meja" attention={alerts > 0} />
    </Box>
  );
}
```

- [ ] **Step 4: Halaman, menu, dan dasbor**

Buat `src/app/(admin)/admin/stok-meja/page.tsx`:

```tsx
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { CounterStockTable } from "@/components/admin/counter/counter-stock-table";
import { RestockRequestDialog } from "@/components/admin/counter/restock-request-dialog";
import { RestockRequestList } from "@/components/admin/counter/restock-request-list";
import { LinkButton } from "@/components/admin/mui/links";
import { SelectField } from "@/components/admin/mui/select-field";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { can } from "@/lib/permissions";
import { getBranches } from "@/server/catalog";
import { listCounterItems } from "@/server/counter-read";
import { listRestockRequests } from "@/server/restock-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Stok meja" };

/** Stok di meja resepsionis dan permintaan restock (spec stok meja 4.1). */
export default async function CounterStockPage({ searchParams }: { searchParams: Promise<{ cabang?: string; tampil?: string }> }) {
  const staff = await requireCapability("counter:read");
  const params = await searchParams;
  const branches = (await getBranches()).filter((branch) => branch.status === "AKTIF");
  if (branches.length === 0) {
    return (
      <>
        <AdminHeader title="Stok meja" />
        <PageBody>
          <EmptyState>Belum ada cabang aktif.</EmptyState>
        </PageBody>
      </>
    );
  }
  const branch = branches.find((b) => b.id === params.cabang) ?? branches[0];
  const canRequest = can(staff.role, "restock:request");
  const canFill = can(staff.role, "stock:manage");
  const [items, pending, history] = await Promise.all([
    listCounterItems(branch.id),
    listRestockRequests({ branchId: branch.id, view: "MENUNGGU" }),
    listRestockRequests({ branchId: branch.id, view: "RIWAYAT" }),
  ]);
  const needs = items.filter((item) => item.flag !== null || item.expired > 0);
  const showAll = params.tampil === "semua" || needs.length === 0;
  const query = (tampil?: string) => `/admin/stok-meja?${new URLSearchParams({ cabang: branch.id, ...(tampil ? { tampil } : {}) }).toString()}`;

  return (
    <>
      <AdminHeader title="Stok meja" />
      <PageBody>
        <PageHeader
          title="Stok meja"
          description={`${branch.name} · obat dan produk di meja resepsionis`}
          actions={canRequest ? <RestockRequestDialog branchId={branch.id} options={items} /> : undefined}
        />
        {branches.length > 1 && (
          <Form action="/admin/stok-meja" aria-label="Pilih cabang">
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <SelectField name="cabang" defaultValue={branch.id} aria-label="Cabang" fullWidth={false} sx={{ minWidth: 160 }}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectField>
              <Button type="submit" variant="outlined">
                Terapkan
              </Button>
            </Stack>
          </Form>
        )}
        <SectionCard
          title="Barang di meja"
          description={showAll ? "Semua barang aktif." : "Barang yang menipis, habis, atau kedaluwarsa di meja."}
          actions={
            needs.length > 0 ? (
              <LinkButton href={showAll ? query() : query("semua")} variant="outlined" size="small">
                {showAll ? "Perlu restock" : "Semua barang"}
              </LinkButton>
            ) : undefined
          }
          flush
        >
          <CounterStockTable rows={showAll ? items : needs} branchId={branch.id} branchName={branch.name} canFill={canFill} />
        </SectionCard>
        <SectionCard title="Permintaan menunggu" flush>
          <RestockRequestList rows={pending} canCancel={canRequest} linkToDetail={canFill} />
        </SectionCard>
        <SectionCard title="Riwayat permintaan" description="50 terakhir." flush>
          <RestockRequestList rows={history} canCancel={false} linkToDetail={false} />
        </SectionCard>
      </PageBody>
    </>
  );
}
```

Di `src/components/admin/app-sidebar.tsx`:
- Import `StorefrontOutlined` dari `@mui/icons-material/StorefrontOutlined`.
- Tambahkan `{ title: "Stok meja", url: "/admin/stok-meja", icon: StorefrontOutlined, needs: "counter:read" },` sesudah item "Stok".
- Tambahkan prop `counterAlerts = 0`, dengan komentar tipe "Barang meja menipis atau habis di cabang aktif, angka di menu Stok meja."
- Tambahkan ke `badges`: `"/admin/stok-meja": { count: counterAlerts, label: `${counterAlerts} barang meja menipis atau habis` },`.

Di `src/app/(admin)/admin/layout.tsx`:
- Import `countCounterAlerts` dari `@/server/counter-read`.
- Hitung `const counterAlerts = can(staff.role, "counter:read") ? await countCounterAlerts() : 0;`, atau gabungkan ke `Promise.all` yang ada.
- Teruskan `counterAlerts={counterAlerts}` ke `AppSidebar`.

Di `src/app/(admin)/admin/page.tsx`:
- Import `CounterTiles` dan `countCounterAlerts`.
- Di `Promise.all`, tambahkan elemen `can(staff.role, "counter:read") && !can(staff.role, "stock:manage") ? settle(countCounterAlerts(), "stok meja") : null`, dengan nama variabel `counter`.
- Render `{counter && (counter.ok ? <CounterTiles alerts={counter.data} /> : <FailedSection title="Stok meja" />)}` sesudah kotak Stok.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/components/counter-stock-table.test.tsx tests/unit/components/restock-request-dialog.test.tsx tests/unit/components/restock-request-list.test.tsx tests/unit/components/app-sidebar.test.tsx tests/unit/architecture.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/counter "src/app/(admin)/admin/stok-meja" src/components/admin/app-sidebar.tsx "src/app/(admin)/admin/layout.tsx" "src/app/(admin)/admin/page.tsx" tests/unit/components
git commit -m "feat: front-desk stock page with restock requests, menu badge, and receptionist dashboard tile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tab Permintaan dan rincian permintaan untuk Apoteker

**Files:**
- Create: `src/components/admin/counter/restock-send-form.tsx`, `src/components/admin/counter/reject-restock-dialog.tsx`, `src/components/admin/counter/restock-tiles.tsx`
- Create: `src/app/(admin)/admin/stok/permintaan/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/stok/page.tsx` (tab Permintaan), `src/app/(admin)/admin/page.tsx` (kotak Apoteker)
- Test: `tests/unit/components/restock-send-form.test.tsx`

**Interfaces:**
- Consumes:
  - Task 6: `RestockRequestDetail`, `getRestockRequest`, `listRestockRequests`, `countPendingRestock`, `sendRestockRequest`, `rejectRestockRequest`.
  - Task 8: `RestockRequestList`.
  - Task 2: `validateRestockSend`, `validateRejectReason`.
- Produces: `RestockSendForm({ request: RestockRequestDetail })`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/restock-send-form.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestockSendForm } from "@/components/admin/counter/restock-send-form";
import { rejectRestockRequest, sendRestockRequest } from "@/server/restock";
import type { RestockRequestDetail } from "@/server/restock-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/restock", () => ({ sendRestockRequest: vi.fn(), rejectRestockRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const REQUEST: RestockRequestDetail = {
  id: "r1",
  status: "MENUNGGU",
  version: 3,
  branchId: "b1",
  branchName: "Mahakeret",
  note: null,
  requestedByName: "Rina",
  createdAt: new Date("2026-10-14T02:00:00Z"),
  decidedByName: null,
  decidedAt: null,
  rejectReason: null,
  lines: [
    { id: "l1", itemId: "i1", itemName: "Amoxicillin", unit: "kapsul", requestedQuantity: 10, sentQuantity: null, warehouseAvailable: 40 },
    { id: "l2", itemId: "i2", itemName: "Serum", unit: "botol", requestedQuantity: 5, sentQuantity: null, warehouseAvailable: 2 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendRestockRequest).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(rejectRestockRequest).mockResolvedValue({ ok: true, data: undefined });
});

describe("RestockSendForm (spec stok meja 4.2)", { timeout: 15_000 }, () => {
  it("Dikirim terisi min(diminta, gudang); kiriman dikirim dengan versi", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockSendForm request={REQUEST} />);
    expect(screen.getByLabelText("Dikirim Amoxicillin")).toHaveValue(10);
    expect(screen.getByLabelText("Dikirim Serum")).toHaveValue(2);
    await user.clear(screen.getByLabelText("Dikirim Amoxicillin"));
    await user.type(screen.getByLabelText("Dikirim Amoxicillin"), "6");
    await user.click(screen.getByRole("button", { name: "Kirim ke meja" }));
    await waitFor(() =>
      expect(sendRestockRequest).toHaveBeenCalledWith({ requestId: "r1", version: 3, lines: [{ lineId: "l1", quantity: 6 }, { lineId: "l2", quantity: 2 }] }),
    );
  });

  it("melebihi gudang ditolak di layar", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockSendForm request={REQUEST} />);
    await user.clear(screen.getByLabelText("Dikirim Serum"));
    await user.type(screen.getByLabelText("Dikirim Serum"), "5");
    await user.click(screen.getByRole("button", { name: "Kirim ke meja" }));
    expect(await screen.findByText("Sisa gudang Serum tidak cukup (tersedia 2).")).toBeInTheDocument();
    expect(sendRestockRequest).not.toHaveBeenCalled();
  });

  it("tolak dengan alasan", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockSendForm request={REQUEST} />);
    await user.click(screen.getByRole("button", { name: "Tolak" }));
    await user.type(screen.getByLabelText("Alasan"), "Stok gudang kosong");
    await user.click(screen.getByRole("button", { name: "Tolak permintaan" }));
    await waitFor(() => expect(rejectRestockRequest).toHaveBeenCalledWith({ requestId: "r1", version: 3, reason: "Stok gudang kosong" }));
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/restock-send-form.test.tsx`
Expected: FAIL, karena modul belum ada.

- [ ] **Step 3: Komponen**

`src/components/admin/counter/reject-restock-dialog.tsx`:

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
import { validateRejectReason } from "@/lib/counter-stock";
import { rejectRestockRequest } from "@/server/restock";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Tolak permintaan restock dengan alasan (spec stok meja 4.2). */
export function RejectRestockDialog({ requestId, version, disabled = false }: { requestId: string; version: number; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const checked = validateRejectReason(reason);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await rejectRestockRequest({ requestId, version, reason: checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Permintaan ditolak.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" color="error" disabled={disabled} onClick={() => setOpen(true)}>
        Tolak
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Tolak permintaan</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id={`reject-${requestId}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth multiline minRows={2} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" color="error" onClick={save} disabled={pending}>
            Tolak permintaan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`src/components/admin/counter/restock-send-form.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { validateRestockSend } from "@/lib/counter-stock";
import { sendRestockRequest } from "@/server/restock";
import type { RestockRequestDetail } from "@/server/restock-read";
import { RejectRestockDialog } from "./reject-restock-dialog";

/** Apoteker mengisi jumlah kirim per barang, lalu Kirim ke meja atau Tolak (spec stok meja 4.2). */
export function RestockSendForm({ request }: { request: RestockRequestDetail }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.lines.map((line) => [line.id, String(Math.min(line.requestedQuantity, line.warehouseAvailable))])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    const lines = request.lines.map((line) => ({ lineId: line.id, quantity: (values[line.id] ?? "").trim() === "" ? Number.NaN : Number(values[line.id]) }));
    const checked = validateRestockSend(lines, { lineIds: request.lines.map((line) => line.id) });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    const over = request.lines.find((line) => Number(values[line.id]) > line.warehouseAvailable);
    if (over) {
      setError(`Sisa gudang ${over.itemName} tidak cukup (tersedia ${over.warehouseAvailable}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendRestockRequest({ requestId: request.id, version: request.version, lines: checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Restock dikirim ke meja.");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small" aria-label="Barang diminta">
            <TableHead>
              <TableRow>
                <TableCell>Barang</TableCell>
                <TableCell align="right">Diminta</TableCell>
                <TableCell align="right">Gudang tersedia</TableCell>
                <TableCell align="right">Dikirim</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {request.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell sx={{ fontWeight: 500 }}>{line.itemName}</TableCell>
                  <TableCell align="right">
                    {line.requestedQuantity} {line.unit}
                  </TableCell>
                  <TableCell align="right">
                    {line.warehouseAvailable} {line.unit}
                  </TableCell>
                  <TableCell align="right" sx={{ width: 140 }}>
                    <TextField
                      type="number"
                      size="small"
                      value={values[line.id] ?? ""}
                      onChange={(e) => setValues((current) => ({ ...current, [line.id]: e.target.value }))}
                      slotProps={{ htmlInput: { min: 0, inputMode: "numeric", "aria-label": `Dikirim ${line.itemName}` } }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button type="button" variant="contained" onClick={send} disabled={pending}>
          {pending ? "Mengirim…" : "Kirim ke meja"}
        </Button>
        <RejectRestockDialog requestId={request.id} version={request.version} disabled={pending} />
      </Stack>
    </Stack>
  );
}
```

`src/components/admin/counter/restock-tiles.tsx`:

```tsx
import Box from "@mui/material/Box";
import { StatTile } from "../stat-tile";

/** Kotak Permintaan restock di dasbor Apoteker (spec stok meja 6). */
export function RestockTiles({ pending }: { pending: number }) {
  return (
    <Box component="section" aria-label="Permintaan restock" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
      <StatTile label="Permintaan restock" value={pending} note="menunggu dikirim ke meja" href="/admin/stok?tab=permintaan" attention={pending > 0} />
    </Box>
  );
}
```

- [ ] **Step 4: Halaman dan tab**

Buat `src/app/(admin)/admin/stok/permintaan/[id]/page.tsx`:

```tsx
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { RestockRequestList } from "@/components/admin/counter/restock-request-list";
import { RestockSendForm } from "@/components/admin/counter/restock-send-form";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { RESTOCK_STATUS_LABEL } from "@/lib/counter-stock";
import { formatDateWithYear } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { getRestockRequest } from "@/server/restock-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Permintaan restock" };

export default async function RestockRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("stock:manage");
  const request = await getRestockRequest((await params).id);
  if (!request) notFound();

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title={`Permintaan restock dari ${request.requestedByName}`}
          trail={[{ label: "Stok", href: "/admin/stok" }, { label: "Permintaan", href: "/admin/stok?tab=permintaan" }, { label: request.requestedByName }]}
          description={`${request.branchName} · ${formatDateWithYear(request.createdAt)} ${minutesToTimeLabel(witaMinutesOfDay(request.createdAt))} · ${RESTOCK_STATUS_LABEL[request.status]}`}
        />
        {request.note && <Typography variant="body2">Catatan: {request.note}</Typography>}
        {request.status === "MENUNGGU" ? (
          <RestockSendForm request={request} />
        ) : (
          <SectionCard title="Hasil" flush>
            <RestockRequestList rows={[request]} canCancel={false} linkToDetail={false} />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}
```

Di `src/app/(admin)/admin/stok/page.tsx`:
- Import `RestockRequestList`, `countPendingRestock`, dan `listRestockRequests`.
- `type Tab = "barang" | "masuk" | "supplier" | "permintaan";`
- Ganti penentuan `tab` dengan:

```ts
  const tab: Tab =
    params.tab === "masuk" || params.tab === "supplier" ? params.tab : params.tab === "permintaan" && canManage ? "permintaan" : "barang";
  const pendingRestock = canManage ? await countPendingRestock() : 0;
```

- `actions`: untuk `tab === "permintaan"` tidak ada tombol. Ubah ekspresi agar cabang `supplier` hanya untuk `tab === "supplier"`, dan selain itu `undefined`.
- Di `tabs`, tambahkan elemen terakhir bila `canManage`: `{ id: "permintaan", label: pendingRestock > 0 ? `Permintaan (${pendingRestock})` : "Permintaan", href: "/admin/stok?tab=permintaan" }`. Bangun array dengan `[…, ...(canManage ? [elemen] : [])]`.
- Tambahkan konten tab:

```tsx
        {tab === "permintaan" && (
          <>
            <SectionCard title="Permintaan menunggu" description="Terlama di atas." flush>
              <RestockRequestList rows={await listRestockRequests({ view: "MENUNGGU" })} canCancel={can(staff.role, "restock:request")} linkToDetail />
            </SectionCard>
            <SectionCard title="Riwayat permintaan" description="50 terakhir." flush>
              <RestockRequestList rows={await listRestockRequests({ view: "RIWAYAT" })} canCancel={false} linkToDetail={false} />
            </SectionCard>
          </>
        )}
```

Di `src/app/(admin)/admin/page.tsx`:
- Import `RestockTiles` dan `countPendingRestock`.
- Tambahkan di `Promise.all`: `can(staff.role, "stock:manage") ? settle(countPendingRestock(), "permintaan restock") : null`, dengan nama `restock`.
- Render `{restock && (restock.ok ? <RestockTiles pending={restock.data} /> : <FailedSection title="Permintaan restock" />)}` sesudah kotak Stok.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/components/restock-send-form.test.tsx tests/unit/architecture.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/counter "src/app/(admin)/admin/stok/permintaan" "src/app/(admin)/admin/stok/page.tsx" "src/app/(admin)/admin/page.tsx" tests/unit/components/restock-send-form.test.tsx
git commit -m "feat: pharmacist restock queue, request page with send and reject, and dashboard tile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Menu Stok per lokasi: daftar barang, detail barang, dan Batas meja

**Files:**
- Modify: `src/components/admin/stock/stock-item-table.tsx`, `src/app/(admin)/admin/stok/page.tsx` (ringkasan)
- Modify: `src/app/(admin)/admin/stok/barang/[id]/page.tsx`
- Modify: `src/components/admin/stock/adjust-stock-dialog.tsx`, `src/components/admin/stock/stock-item-dialog.tsx`
- Create: `src/components/admin/counter/pull-to-warehouse-dialog.tsx`
- Modify: `src/app/(admin)/admin/stok/masuk/[id]/page.tsx` (judul kolom "Sisa gudang")
- Test:
  - `tests/unit/components/stock-item-table.test.tsx`
  - `tests/unit/components/adjust-stock-dialog.test.tsx`
  - `tests/unit/components/stock-item-dialog.test.tsx`
  - `tests/unit/components/pull-to-warehouse-dialog.test.tsx`
  - `tests/integration/stock-catalog.test.ts`

**Interfaces:**
- Consumes:
  - Task 5: `StockItemRow.counterAvailable`, `counterExpired`, `StockItemDetail.moveOptions`, `batches[].counterRemaining`, `movements[].location`.
  - Task 3: `pullToWarehouse`.
  - Task 8: `FillCounterDialog`.
  - Task 2: `STOCK_LOCATION_LABEL`.
- Produces:
  - `AdjustStockDialog({ batch: { id; label; remaining; counterRemaining?: number; unit } })` dengan pilihan lokasi.
  - `PullToWarehouseDialog({ batch: { id: string; label: string; counterRemaining: number; unit: string } })`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/stock-item-table.test.tsx`:
- Tambahkan `counterMinStock: 0, counterAvailable: 4, counterExpired: 1,` ke fixture `row`.
- Tambahkan uji:

```tsx
  it("kolom Gudang dan Meja terpisah; tanda meja tampil (spec stok meja 6)", () => {
    renderAdmin(<StockItemTable rows={[row({ flags: ["MEJA_MENIPIS"] })]} />);
    expect(screen.getByRole("columnheader", { name: "Gudang" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Meja" })).toBeInTheDocument();
    expect(screen.getByText("4 kapsul")).toBeInTheDocument();
    expect(screen.getByText("1 kedaluwarsa")).toBeInTheDocument();
    expect(screen.getByText("Meja menipis")).toBeInTheDocument();
  });
```

`tests/unit/components/adjust-stock-dialog.test.tsx`: tambahkan uji berikut. Mock `adjustStock` mengikuti pola yang sudah ada di berkas itu.

```tsx
  it("memilih lokasi Meja; batas sisa mengikuti lokasi (spec stok meja 3)", async () => {
    const user = userEvent.setup();
    renderAdmin(<AdjustStockDialog batch={{ id: "b1", label: "Amoxicillin batch A", remaining: 10, counterRemaining: 2, unit: "kapsul" }} />);
    await user.click(screen.getByRole("button", { name: "Penyesuaian Amoxicillin batch A" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("gudang 10 · meja 2 kapsul");
    await user.click(screen.getByRole("button", { name: "Meja" }));
    await user.type(screen.getByLabelText("Jumlah"), "3");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Pengurangan melebihi sisa meja (2 kapsul).")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Jumlah"));
    await user.type(screen.getByLabelText("Jumlah"), "1");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(adjustStock).toHaveBeenCalledWith(expect.objectContaining({ batchId: "b1", location: "MEJA", quantity: 1 })));
  });
```

Uji lama di berkas itu yang memeriksa teks `sisa N kapsul` disesuaikan menjadi `gudang N · meja 0 kapsul`. Pesan "Pengurangan melebihi sisa batch (N kapsul)." menjadi "Pengurangan melebihi sisa gudang (N kapsul)."

Buat `tests/unit/components/pull-to-warehouse-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PullToWarehouseDialog } from "@/components/admin/counter/pull-to-warehouse-dialog";
import { pullToWarehouse } from "@/server/counter-stock";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/counter-stock", () => ({ pullToWarehouse: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pullToWarehouse).mockResolvedValue({ ok: true, data: undefined });
});

describe("PullToWarehouseDialog (spec stok meja 3)", { timeout: 15_000 }, () => {
  it("menarik jumlah dari meja batch ini; melebihi meja ditolak di layar", async () => {
    const user = userEvent.setup();
    renderAdmin(<PullToWarehouseDialog batch={{ id: "b1", label: "Amoxicillin batch A", counterRemaining: 3, unit: "kapsul" }} />);
    await user.click(screen.getByRole("button", { name: "Tarik ke gudang Amoxicillin batch A" }));
    await user.type(screen.getByLabelText("Jumlah"), "4");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Melebihi sisa meja (3 kapsul).")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Jumlah"));
    await user.type(screen.getByLabelText("Jumlah"), "2");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(pullToWarehouse).toHaveBeenCalledWith({ batchId: "b1", quantity: 2 }));
  });
});
```

`tests/unit/components/stock-item-dialog.test.tsx`: tambahkan uji bahwa mengisi "Batas meja" 5 lalu Simpan memanggil `createStockItem` dengan `expect.objectContaining({ counterMinStock: 5 })`, mengikuti pola uji Simpan yang sudah ada di berkas itu.

`tests/integration/stock-catalog.test.ts`: tambahkan uji bahwa `updateStockItem(id, { …input, counterMinStock: 7 })` menyimpan `counterMinStock` 7, mengikuti pola uji ubah barang di berkas itu.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/stock-item-table.test.tsx tests/unit/components/adjust-stock-dialog.test.tsx tests/unit/components/pull-to-warehouse-dialog.test.tsx tests/unit/components/stock-item-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Daftar barang**

`src/components/admin/stock/stock-item-table.tsx`: ganti kolom `available` dengan dua kolom:

```tsx
  {
    field: "available",
    headerName: "Gudang",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 130,
    renderCell: ({ row }) => (
      <Box>
        <Box>
          {row.available} {row.unit}
        </Box>
        {row.onHand > row.available && <Box sx={{ fontSize: "0.75rem", color: "error.main" }}>{row.onHand - row.available} kedaluwarsa</Box>}
      </Box>
    ),
  },
  {
    field: "counterAvailable",
    headerName: "Meja",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 120,
    renderCell: ({ row }) => (
      <Box>
        <Box>
          {row.counterAvailable} {row.unit}
        </Box>
        {row.counterExpired > 0 && <Box sx={{ fontSize: "0.75rem", color: "error.main" }}>{row.counterExpired} kedaluwarsa</Box>}
      </Box>
    ),
  },
```

`src/app/(admin)/admin/stok/page.tsx`, `ItemsTab`:
- Ganti `const summary = summarizeStock(filtered ? await listStockItems({ branchId: branch.id }) : rows);` dengan:

```ts
  const all = filtered ? await listStockItems({ branchId: branch.id }) : rows;
  const summary = summarizeStock(all);
  const counterFlagged = all.filter((row) => row.flags.includes("MEJA_MENIPIS") || row.flags.includes("MEJA_HABIS")).length;
```

- Ganti `repeat(${canPrice ? 4 : 3}, 1fr)` menjadi `repeat(${canPrice ? 5 : 4}, 1fr)`, lalu tambahkan sesudah blok "Kedaluwarsa":

```tsx
          <div>
            <dt>Meja menipis / habis</dt>
            <dd>{counterFlagged} barang</dd>
          </div>
```

- [ ] **Step 4: Detail barang, dialog, dan Batas meja**

`src/components/admin/counter/pull-to-warehouse-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { pullToWarehouse } from "@/server/counter-stock";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Tarik stok meja satu batch ke gudang (spec stok meja 3). */
export function PullToWarehouseDialog({ batch }: { batch: { id: string; label: string; counterRemaining: number; unit: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const value = quantity.trim() === "" ? Number.NaN : Number(quantity);
    if (!Number.isInteger(value) || value < 1) {
      setError("Jumlah harus bilangan bulat lebih dari 0.");
      return;
    }
    if (value > batch.counterRemaining) {
      setError(`Melebihi sisa meja (${batch.counterRemaining} ${batch.unit}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await pullToWarehouse({ batchId: batch.id, quantity: value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Stok ditarik ke gudang.");
        setOpen(false);
        setQuantity("");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button size="small" variant="outlined" aria-label={`Tarik ke gudang ${batch.label}`} onClick={() => setOpen(true)}>
        Tarik ke gudang
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Tarik ke gudang</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <DialogContentText>
            {batch.label} · meja {batch.counterRemaining} {batch.unit}
          </DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField
              id={`pull-${batch.id}`}
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1, inputMode: "numeric" } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`src/components/admin/stock/adjust-stock-dialog.tsx`:
- Prop `batch` mendapat `counterRemaining?: number`.
- Tambahkan state `const [location, setLocation] = useState<StockLocationValue>(batch.remaining > 0 || !batch.counterRemaining ? "GUDANG" : "MEJA");`. Import `STOCK_LOCATION_LABEL` dan `type StockLocationValue` dari `@/lib/counter-stock`.
- Di `save`:
  - `const input = { batchId: batch.id, direction, quantity: Number(quantity), reason, note, location };`
  - Ganti pemeriksaan sisa dengan:

```ts
    const left = location === "MEJA" ? (batch.counterRemaining ?? 0) : batch.remaining;
    if (checked.value.delta < 0 && -checked.value.delta > left) {
      setError(`Pengurangan melebihi sisa ${location === "MEJA" ? "meja" : "gudang"} (${left} ${batch.unit}).`);
      return;
    }
```

- Ganti isi `DialogContentText` dengan `{batch.label} · gudang {batch.remaining} · meja {batch.counterRemaining ?? 0} {batch.unit}`.
- Sebelum `ToggleButtonGroup` arah, tambahkan:

```tsx
            <ToggleButtonGroup exclusive size="small" aria-label="Lokasi" value={location} onChange={(_, next: StockLocationValue | null) => next && setLocation(next)}>
              {(["GUDANG", "MEJA"] as const).map((value) => (
                <ToggleButton key={value} value={value} sx={{ px: 2 }}>
                  {STOCK_LOCATION_LABEL[value]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
```

`src/components/admin/stock/stock-item-dialog.tsx`:
- `EMPTY` mendapat `counterMinStock: 0`.
- Sesudah isian "Batas menipis", tambahkan:

```tsx
            <TextField
              id="stock-item-counter-min"
              label="Batas meja"
              type="number"
              value={value.counterMinStock ?? 0}
              onChange={(e) => set("counterMinStock", e.target.value === "" ? 0 : Number(e.target.value))}
              helperText="0 = tidak dipantau di meja"
              fullWidth
              slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }}
            />
```

`src/app/(admin)/admin/stok/barang/[id]/page.tsx`:
- Import `FillCounterDialog`, `PullToWarehouseDialog`, dan `STOCK_LOCATION_LABEL`.
- `description`: tambahkan `· batas meja ${item.counterMinStock}` sesudah `batas menipis ${item.minStock}`.
- `initial` dialog barang: tambahkan `counterMinStock: item.counterMinStock`.
- `actions`: sesudah `StockItemDialog`, tambahkan:

```tsx
                {canManage && detail.moveOptions.length > 0 && (
                  <FillCounterDialog
                    triggerLabel="Pindah ke meja"
                    item={{ id: item.id, name: item.name, unit: item.unit }}
                    branches={detail.moveOptions.map((option) => ({ id: option.branchId, name: option.branchName, warehouseAvailable: option.warehouseAvailable }))}
                  />
                )}
```

- Tabel batch:
  - Ganti kolom "Sisa" dengan dua kolom "Gudang" dan "Meja", yang masing-masing menampilkan `{batch.quantityRemaining} {item.unit}` dan `{batch.counterRemaining} {item.unit}`.
  - Di sel aksi, untuk batch dari faktur yang tidak dibatalkan:

```tsx
                          {!batch.invoiceCancelled && (
                            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                              <AdjustStockDialog
                                batch={{ id: batch.id, label: `${item.name} batch ${batch.batchNumber ?? "-"}`, remaining: batch.quantityRemaining, counterRemaining: batch.counterRemaining, unit: item.unit }}
                              />
                              {batch.counterRemaining > 0 && (
                                <PullToWarehouseDialog batch={{ id: batch.id, label: `${item.name} batch ${batch.batchNumber ?? "-"}`, counterRemaining: batch.counterRemaining, unit: item.unit }} />
                              )}
                            </Stack>
                          )}
```

  Import `Stack` dari `@mui/material/Stack`.
- Tabel riwayat stok: tambahkan kolom "Lokasi" sesudah "Jenis", isinya `{STOCK_LOCATION_LABEL[movement.location]}`.

`src/app/(admin)/admin/stok/masuk/[id]/page.tsx`: ubah judul kolom "Sisa batch" menjadi "Sisa gudang". `batchRemaining` memang berarti sisa gudang.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/components/stock-item-table.test.tsx tests/unit/components/adjust-stock-dialog.test.tsx tests/unit/components/pull-to-warehouse-dialog.test.tsx tests/unit/components/stock-item-dialog.test.tsx && npm run test:integration -- tests/integration/stock-catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/stock src/components/admin/counter/pull-to-warehouse-dialog.tsx "src/app/(admin)/admin/stok" tests/unit/components tests/integration/stock-catalog.test.ts
git commit -m "feat: warehouse and front-desk columns, move and pull actions, per-location adjustment, and the counter threshold

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Draf tagihan menandai stok meja yang kurang

**Files:**
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`
- Modify: `src/app/(admin)/admin/tagihan/[id]/page.tsx`
- Test: `tests/unit/invoice-draft-editor.test.tsx`

**Interfaces:**
- Consumes:
  - Task 2: `counterShortages`.
  - Task 8: `RestockRequestDialog`.
  - Task 5: `listCounterItems`, `CounterItemRow`.
- Produces: prop baru `InvoiceDraftEditor.restock?: { branchId: string; options: CounterItemRow[] } | null`.

- [ ] **Step 1: Tulis uji yang gagal**

Di `tests/unit/invoice-draft-editor.test.tsx`:
- Tambahkan `vi.mock("@/server/restock", () => ({ createRestockRequest: vi.fn() }));`.
- Tambahkan uji:

```tsx
  it("stok meja kurang: baris ditandai dan tombol Minta restock tampil (spec stok meja 4.1)", async () => {
    const base = detail();
    const lines = base.lines.map((line) => (line.id === "l2" ? { ...line, quantity: 5 } : line));
    const counter = [{ id: "it1", code: "VC", name: "Vitamin C", unit: "tablet", kind: "PRODUK" as const, available: 2, expired: 0, counterMinStock: 0, flag: null, requested: false }];
    renderAdmin(
      <InvoiceDraftEditor
        detail={{ ...base, lines }}
        items={items.map((item) => (item.id === "it1" ? { ...item, available: 2 } : item))}
        canExceedDiscount={false}
        restock={{ branchId: "b1", options: counter }}
      />,
    );
    expect(screen.getByText("Stok meja kurang (tersedia 2)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Minta restock" }));
    expect(screen.getByLabelText("Jumlah 1")).toHaveValue(3);
  });

  it("stok meja cukup: tanpa tanda dan tanpa tombol", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} restock={{ branchId: "b1", options: [] }} />);
    expect(screen.queryByText(/Stok meja kurang/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Minta restock" })).toBeNull();
  });
```

(`items` adalah daftar `BillingItem` di berkas itu. Barang `it1` adalah "Vitamin C" pada baris `l2`. Bila id atau nama di fixture berbeda, sesuaikan dengan fixture yang ada dan catat di ledger.)

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/invoice-draft-editor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Di `src/components/admin/billing/invoice-draft-editor.tsx`:
- Import `counterShortages` dari `@/lib/counter-stock`, `type CounterItemRow` dari `@/server/counter-read`, dan `RestockRequestDialog` dari `../counter/restock-request-dialog`.
- Prop `restock?: { branchId: string; options: CounterItemRow[] } | null` di `InvoiceDraftEditor` (bawaannya `null`).
- Di badan komponen, sesudah `notice`:

```ts
  // Tagihan mengambil stok meja (spec stok meja 4.1): baris yang meja-nya kurang diberi tanda, dan resepsionis bisa
  // langsung meminta restock untuk kekurangannya.
  const shortages = counterShortages(detail.lines, new Map(items.map((item) => [item.id, item.available])));
  const requestable = restock
    ? [...shortages]
        .filter(([itemId]) => !restock.options.find((option) => option.id === itemId)?.requested)
        .map(([itemId, short]) => ({ itemId, quantity: Math.min(short.needed - short.available, 9999) }))
    : [];
```

- Di baris tombol atas (sesudah "Segarkan harga katalog"), tambahkan `{restock && requestable.length > 0 && <RestockRequestDialog branchId={restock.branchId} options={restock.options} initial={requestable} />}`.
- `LineRow` mendapat prop `shortage: { needed: number; available: number } | null`. Teruskan dari pemanggil dengan `shortage={line.itemId ? (shortages.get(line.itemId) ?? null) : null}`. Di sel nama baris, sesudah keterangan jenis, tambahkan:

```tsx
        {shortage && (
          <Typography variant="caption" component="div" sx={{ color: "warning.main" }}>
            Stok meja kurang (tersedia {shortage.available})
          </Typography>
        )}
```

Di `src/app/(admin)/admin/tagihan/[id]/page.tsx`:
- Import `listCounterItems`.
- Teruskan ke `InvoiceDraftEditor`: `restock={can(staff.role, "restock:request") ? { branchId: detail.branchId, options: await listCounterItems(detail.branchId) } : null}`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/billing/invoice-draft-editor.tsx "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/unit/invoice-draft-editor.test.tsx
git commit -m "feat: draft invoices flag lines short on front-desk stock and offer a restock request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: E2E dan rangkaian penuh

**Files:**
- Create: `tests/e2e/helpers/stok-meja.ts`, `tests/e2e/stok-meja.spec.ts`
- Modify: `tests/e2e/tagihan.spec.ts`, `tests/e2e/tagihan-diskon.spec.ts`, `tests/e2e/resep-dokter.spec.ts`
- Test: rangkaian penuh

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: `isiMeja(browser: Browser, itemName: string, quantity: string): Promise<void>`.

- [ ] **Step 1: Helper dan E2E lama**

Buat `tests/e2e/helpers/stok-meja.ts`:

```ts
import { expect, type Browser } from "@playwright/test";
import { E2E_APOTEKER } from "../credentials";
import { E2E_BASE_URL } from "../test-env";
import { tungguHidrasi } from "./mui";
import { signIn } from "./quiz";

/** Apoteker mengisi meja dari gudang di konteks terpisah (spec stok meja 4.2): tagihan hanya mengambil stok meja. */
export async function isiMeja(browser: Browser, itemName: string, quantity: string): Promise<void> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await context.newPage();
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok-meja?tampil=semua");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: `Isi meja ${itemName}` }).click();
  const dialog = page.getByRole("dialog", { name: `Isi meja ${itemName}` });
  await dialog.getByLabel("Jumlah").fill(quantity);
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await context.close();
}
```

Gunakan helper ini di E2E lama:
- `tests/e2e/tagihan.spec.ts`: di uji pertama, sesudah `await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/ …)`, tambahkan `await isiMeja(browser, itemName, "10");`. Pastikan fixture uji itu memuat `browser`.
- `tests/e2e/tagihan-diskon.spec.ts`: sesudah barang masuk tersimpan, tambahkan `await isiMeja(browser, itemName, "5");`.
- `tests/e2e/resep-dokter.spec.ts`: sesudah `await isiHargaBeli(…)`, tambahkan `await isiMeja(browser, `Kapsul Dokter ${t}`, "10");` dan `await isiMeja(browser, `Vitamin Dokter ${t}`, "2");`.

- [ ] **Step 2: E2E baru**

Buat `tests/e2e/stok-meja.spec.ts`:

```ts
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { aturHargaJual } from "./helpers/harga";
import { isiTanggal, pilihOpsi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

// Satu cerita per proyek (spec stok meja 9): Apoteker menyiapkan barang berbatas meja → resepsionis melihat Meja habis
// dan meminta restock → Apoteker diberi tahu, mengirim sebagian → resepsionis diberi tahu → tagihan mengambil meja.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");
const dayFromToday = (days: number) => new Date(Date.now() + 8 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

async function openAs(browser: Browser, testInfo: TestInfo, account: { email: string; password: string }, path: string): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use);
  const page = await context.newPage();
  await signIn(page, account);
  await page.goto(path);
  return page;
}

test("apoteker menyiapkan barang dengan batas meja dan stok gudang 20", async ({ page, browser }, testInfo) => {
  const t = tag(testInfo);
  const name = `Salep Meja ${t}`;
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok");
  await page.getByRole("button", { name: "+ Barang" }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah barang" });
  await dialog.getByLabel("Kode").fill(`E2E-${t}-SLP`);
  await dialog.getByLabel("Nama", { exact: true }).fill(name);
  await dialog.getByLabel("Satuan").fill("tube");
  await dialog.getByLabel("Batas menipis").fill("2");
  await dialog.getByLabel("Batas meja").fill("5");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await aturHargaJual(browser, name, "40000");

  await page.goto("/admin/stok/masuk/baru");
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplier = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplier.getByLabel("Nama supplier").fill(`Supplier Meja ${t}`);
  await supplier.getByRole("button", { name: "Simpan" }).click();
  await expect(supplier).toBeHidden({ timeout: 30_000 });
  await page.getByLabel("Nomor faktur").fill(`SM-E2E-${t}-001`);
  await pilihOpsi(page, "Barang baris 1", `${name} (E2E-${t}-SLP)`);
  await page.getByLabel("Jumlah baris 1").fill("20");
  await page.getByLabel("Batch baris 1").fill("M-01");
  await isiTanggal(page, "Kedaluwarsa baris 1", dayFromToday(365));
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
});

test("resepsionis meminta restock; Apoteker mengirim sebagian; keduanya diberi tahu tanpa muat ulang", async ({ browser }, testInfo) => {
  const t = tag(testInfo);
  const name = `Salep Meja ${t}`;
  const pharmacist = await openAs(browser, testInfo, E2E_APOTEKER, "/admin");
  const receptionist = await openAs(browser, testInfo, E2E_RESEPSIONIS, "/admin/stok-meja");
  await expect(pharmacist.getByRole("button", { name: /Bunyi notifikasi/ })).toBeVisible();

  const row = receptionist.getByRole("table", { name: "Stok meja" }).getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Meja habis");
  await expect(row).toContainText("0 tube");
  await expect(receptionist.getByRole("table", { name: "Stok meja" })).not.toContainText("Rp");

  await receptionist.getByRole("button", { name: "Minta restock" }).click();
  const dialog = receptionist.getByRole("dialog", { name: "Minta restock" });
  await dialog.getByRole("button", { name: "Kirim permintaan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const pending = receptionist.getByRole("region", { name: "Permintaan menunggu" });
  await expect(pending).toContainText(`${name}: diminta 10 tube`, { timeout: 30_000 });
  await expect(row).toContainText("Sudah diminta");

  await expect(pharmacist.getByText(/^Permintaan restock dari .+: \d+ barang$/)).toBeVisible({ timeout: 40_000 });
  await pharmacist.goto("/admin/stok?tab=permintaan");
  await pharmacist
    .getByRole("region", { name: "Permintaan menunggu" })
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("link", { name: "Proses" })
    .click();
  await expect(pharmacist).toHaveURL(/\/admin\/stok\/permintaan\/[^/?]+$/, { timeout: 30_000 });
  await expect(pharmacist.getByLabel(`Dikirim ${name}`)).toHaveValue("10");
  await pharmacist.getByLabel(`Dikirim ${name}`).fill("6");
  await pharmacist.getByRole("button", { name: "Kirim ke meja" }).click();
  await expect(pharmacist.getByRole("region", { name: "Hasil" })).toContainText(`${name}: diminta 10 tube · dikirim 6 tube`, { timeout: 30_000 });

  await expect(receptionist.getByText(/^Restock dikirim: \d+ barang$/)).toBeVisible({ timeout: 40_000 });
  await receptionist.goto("/admin/stok-meja?tampil=semua");
  await expect(receptionist.getByRole("table", { name: "Stok meja" }).getByRole("row").filter({ hasText: name })).toContainText("6 tube");

  await Promise.all([pharmacist.context().close(), receptionist.context().close()]);
});

test("tagihan mengambil stok meja, gudang tetap; hak akses", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const name = `Salep Meja ${t}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await page.getByRole("button", { name: "+ Penjualan langsung" }).click();
  await page.getByRole("dialog", { name: "Penjualan langsung" }).getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(page, { name: `Pelanggan Meja ${t}`, whatsapp: t === "M" ? "6281200007722" : "6281200007721" });
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "+ Tambah barang" }).click();
  const add = page.getByRole("dialog", { name: "Tambah barang" });
  await pilihOpsi(add, "Barang", `${name} (E2E-${t}-SLP) — sisa 6 tube`);
  await add.getByLabel("Jumlah").fill("2");
  await add.getByRole("button", { name: "Tambah" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/stok-meja?tampil=semua");
  const row = page.getByRole("table", { name: "Stok meja" }).getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("4 tube");
  await expect(row).toContainText("Meja menipis");
  expect((await page.goto("/admin/stok"))?.status()).toBe(403);

  await page.context().clearCookies();
  await signIn(page, E2E_APOTEKER);
  await page.goto(`/admin/stok?cari=${encodeURIComponent(name)}`);
  const stock = page.getByRole("region", { name: "Barang", exact: true }).getByRole("row").filter({ hasText: name });
  await expect(stock).toContainText("14 tube");
  await expect(stock).toContainText("Meja menipis");

  await page.context().clearCookies();
  await signIn(page, E2E_KEUANGAN);
  expect((await page.goto("/admin/stok-meja"))?.status()).toBe(403);
});
```

- [ ] **Step 3: Jalankan E2E**

Bila login gagal, reset akun E2E di basis data **uji**: hapus empat user `e2e@`, `resepsionis-e2e@`, `apoteker-e2e@`, dan `keuangan-e2e@sundy.test` beserta baris `session` dan `account`-nya.

Run:

```bash
npx playwright test tests/e2e/stok-meja.spec.ts --project=desktop --workers=1
npx playwright test tests/e2e/stok-meja.spec.ts --project=mobile --workers=1
npx playwright test tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/resep-dokter.spec.ts tests/e2e/stok-hutang.spec.ts tests/e2e/pemberitahuan.spec.ts --project=desktop --workers=1
```

Expected: semua PASS.

- [ ] **Step 4: Rangkaian penuh**

Bersihkan sisa data E2E di basis data **uji**: pembersihan tagihan dan stok yang biasa, ditambah `delete from "RestockRequest";`, `delete from "Expense" where note like '%E2E%'`, dan `delete from "RecurringExpense" where note like '%E2E%'`.

Run:

```bash
npx tsc --noEmit -p .
npx vitest run
npm run test:integration
```

Simpan keluaran ke berkas dan baca bagian akhirnya.

Expected:
- `tsc` bersih.
- Unit PASS.
- Integrasi PASS kecuali 3 kegagalan lama di `schedule.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/stok-meja.ts tests/e2e/stok-meja.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/resep-dokter.spec.ts
git commit -m "test: e2e for front-desk stock, restock requests, notices, and billing from the counter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
