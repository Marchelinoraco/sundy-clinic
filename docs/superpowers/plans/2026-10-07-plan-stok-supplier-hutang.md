# Stok Barang, Supplier, dan Hutang — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klinik mencatat obat dan produk per batch per cabang, barang masuk dari supplier sebagai faktur hutang, retur, penyesuaian stok, dan pembayaran hutang; Apoteker mengelola stok, Admin Keuangan mengelola hutang, pemilik melihat semuanya.

**Architecture:**
- **Data:** tabel baru `StockItem`, `Supplier`, `PurchaseInvoice` + `PurchaseLine`, `StockBatch` (sisa per batch per cabang), `StockMovement` (jurnal yang tidak pernah diubah), `SupplierReturn` + `SupplierReturnLine`, `SupplierPayment` (`BAYAR`/`PENGEMBALIAN`, bisa dibatalkan). Peran baru `APOTEKER` dan `ADMIN_KEUANGAN`; kemampuan baru `stock:read`, `stock:manage`, `payable:manage`.
- **Pembagian kode:** aturan murni (sisa hutang, status, tanda stok, validasi formulir, label) di `src/lib/stock.ts`; aksi server per tanggung jawab (`stock-catalog.ts`, `purchases.ts`, `stock-movements.ts`, `payables.ts`, semuanya `"use server"`); pembacaan untuk halaman di modul tanpa `"use server"` (`stock-read.ts`, `purchase-read.ts`, `payable-read.ts`); pembantu transaksi di `stock-store.ts`.
- **Keamanan data:** setiap pengurangan sisa batch adalah `UPDATE … WHERE quantityRemaining >= n` (atomik), dan setiap tulisan yang menyangkut satu faktur (pembayaran, retur, pembatalan) mengunci baris fakturnya (`SELECT … FOR UPDATE`) di dalam transaksi.

**Tech Stack:** Next.js 15.5 App Router, React 19, Prisma 7 + PostgreSQL, shadcn/ui (Radix), Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi berbahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar.
- **Zona waktu:** WITA. Kolom tanggal tanpa jam (`invoiceDate`, `dueDate`, `expiryDate`, `paidAt`) disimpan `@db.Date` dan dipertukarkan sebagai teks `"YYYY-MM-DD"`; "hari ini" selalu `witaDateString(new Date())`.
- **Uang:** rupiah penuh (`Int`), tampil lewat `formatRupiah`. **Jumlah barang:** bilangan bulat dalam satuan barang itu.
- **Angka penting dari spec:** segera kedaluwarsa = **60 hari**; jatuh tempo bawaan = **tanggal faktur + 30 hari**; "jatuh tempo segera" = **7 hari**.
- **Hak akses (spec 7):**

  | Kemampuan | Dipegang |
  |---|---|
  | `stock:read` | Apoteker, Admin Keuangan, Super Admin |
  | `stock:manage` | Apoteker, Super Admin |
  | `payable:manage` | Admin Keuangan, Super Admin |
  | `report:read` | Super Admin, **Admin Keuangan** (baru) |

- **Setiap halaman dan setiap aksi server** memanggil `requireCapability` sendiri. Menyembunyikan tombol bukan kontrol akses.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (ekspor tipe boleh). Konstanta dan fungsi murni tinggal di `src/lib`; pembantu server biasa di modul tanpa `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`; komponen tidak mengimpor `@/lib/db`. Komponen server hanya mengambil **komponen** dari modul `"use client"` (dijaga uji arsitektur).
- **Riwayat tidak pernah dihapus:** jurnal stok, retur, dan pembayaran tidak diubah atau dihapus; pembatalan memakai kolom `cancelledAt`/`revokedAt` dengan alasan. Barang dan supplier dinonaktifkan, tidak dihapus.
- **Jejak audit** (spec 7.3) memakai `recordAudit` yang ada, dengan nama aksi persis: `stock-item.create`, `stock-item.update`, `supplier.create`, `supplier.update`, `purchase.create`, `purchase.cancel`, `purchase.update-due-date`, `stock.adjust`, `stock.return`, `supplier-payment.create`, `supplier-payment.revoke`, `supplier-refund.create`.
- **Migrasi hanya menambah** (tabel, kolom, nilai enum, CHECK). Diterapkan berurutan: `npx prisma migrate deploy`, `npm run db:migrate:test`, `npx prisma generate`, lalu `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` harus keluar 0.
- **Tanpa dependensi baru.** Repo tidak memakai Prettier; ikuti format kode di sekitarnya.
- **Log uji:** `WS` adalah direktori kerja rencana (`.superpowers/sdd/2026-10-07-plan-stok-supplier-hutang/`, dibuat `sdd-workspace`). Output panjang ditulis ke sana.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`). Jangan jalankan bersamaan dengan e2e; setelah e2e, kosongkan data e2e di `sundy_test` sebelum integrasi lagi. Laptop 8 GB: e2e per berkas atau kelompok, matikan proses `next dev`/playwright sisa dulu.
- **Uji yang sudah gagal sebelum rencana ini:** 3 uji di `tests/integration/schedule.test.ts` (tanggal tetap 2026-10-05). Bukan bagian rencana ini; jangan diubah.
- **Commit:** Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. **Jangan pernah mengubah atau men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Dua pengurangan bersamaan pada batch yang sama** (retur + penyesuaian, atau dua penyesuaian). Sisa tidak pernah minus, dan yang kalah mendapat pesan "tidak cukup" → uji bersamaan di Task 5.
2. **Faktur yang sama dikirim dua kali** (klik ganda, dua apoteker). Tepat satu faktur tercatat → uji bersamaan di Task 4.
3. **Dua pembayaran bersamaan yang masing-masing melunasi sisa.** Hanya satu yang diterima, hutang tidak pernah minus karena pembayaran → uji bersamaan di Task 6.
4. **Permintaan buatan** (jumlah pecahan atau negatif, harga beli negatif, tanggal tidak ada seperti 2026-02-31, kedaluwarsa lewat, faktur di masa depan, cabang *Segera hadir*, barang nonaktif) ditolak di server walau browser sudah memeriksanya → uji di Task 2 (aturan) dan Task 4 (aksi).
5. **Peran memanggil aksi orang lain secara langsung** (Apoteker memanggil aksi hutang, Admin Keuangan memanggil aksi stok, Resepsionis/Dokter memanggil keduanya). Ditolak di server → uji hak akses di Task 3, 4, 5, dan 6.

---

## Struktur berkas

**Baru**

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `prisma/migrations/20261007120000_stok_hutang/migration.sql` | Tabel, enum, peran baru, CHECK | 1 |
| `src/lib/staff-role.ts` | Label peran dan pembaca argumen peran skrip | 1 |
| `src/lib/stock.ts` | Aturan hitung hutang dan stok, validasi formulir, label, tanggal `@db.Date` | 2 |
| `src/server/stock-store.ts` | Pilihan kolom hutang, kunci faktur, pengurangan batch atomik (tanpa `"use server"`) | 3, 4, 5 |
| `src/server/stock-catalog.ts` | Aksi barang dan supplier | 3 |
| `src/server/stock-read.ts` | Daftar/detail barang, supplier, pilihan formulir, hitungan tanda stok | 3 |
| `src/server/purchases.ts` | Aksi barang masuk dan batalkan faktur | 4 |
| `src/server/purchase-read.ts` | Daftar dan detail faktur | 4 |
| `src/server/stock-movements.ts` | Aksi penyesuaian dan retur | 5 |
| `src/server/payables.ts` | Aksi pembayaran, batal pembayaran, pengembalian dana, jatuh tempo | 6 |
| `src/server/payable-read.ts` | Daftar dan ringkasan hutang, hitungan terlambat | 6 |
| `src/components/admin/stock/*` | Tabel dan dialog stok, faktur, supplier, pembayaran, kotak dasbor | 7–10 |
| `src/app/(admin)/admin/stok/**`, `src/app/(admin)/admin/hutang/page.tsx` | Halaman | 7–9 |
| `tests/integration/stock-world.ts` | Pembantu uji: cabang, supplier, barang, batch | 1 |

**Diubah**

| Berkas | Perubahan | Task |
|---|---|---|
| `prisma/schema.prisma` | Model dan enum baru, relasi di `Branch`, nilai `StaffRole` | 1 |
| `src/lib/permissions.ts`, `src/lib/audit-labels.ts`, `src/components/admin/staff-table.tsx`, `src/components/admin/nav-user.tsx`, `scripts/create-admin.mts` | Peran dan kemampuan baru | 1 |
| `src/app/(admin)/admin/page.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/components/admin/app-sidebar.tsx` | Kotak dasbor dan menu Stok/Hutang | 10 |
| `tests/e2e/prepare-db.mts`, `tests/e2e/credentials.ts` | Akun dan pembersihan data e2e | 11 |

---
### Task 1: Fondasi — tabel stok/hutang, peran Apoteker dan Admin Keuangan, kemampuan baru

**Files:**
- Create: `prisma/migrations/20261007120000_stok_hutang/migration.sql`, `src/lib/staff-role.ts`, `tests/integration/stock-world.ts`
- Modify: `prisma/schema.prisma`, `src/lib/permissions.ts`, `src/lib/audit-labels.ts`, `src/components/admin/staff-table.tsx`, `scripts/create-admin.mts`, `tests/unit/migrations.test.ts`, `tests/unit/permissions.test.ts`
- Test: `tests/integration/stock-schema.test.ts`, `tests/unit/staff-role.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - Prisma: enum `StaffRole` + `APOTEKER`, `ADMIN_KEUANGAN`; enum `StockItemKind` (`OBAT`, `PRODUK`), `StockMovementKind` (`MASUK`, `RETUR`, `PENYESUAIAN`), `StockAdjustReason` (`RUSAK`, `HILANG`, `KEDALUWARSA`, `SELISIH_HITUNG`, `LAINNYA`), `SupplierPaymentKind` (`BAYAR`, `PENGEMBALIAN`), `PaymentMethod` (`TUNAI`, `TRANSFER`, `QRIS`);
  - model `StockItem`, `Supplier`, `PurchaseInvoice` (unik `[supplierId, invoiceNumber]`), `PurchaseLine`, `StockBatch` (unik `purchaseLineId`), `StockMovement`, `SupplierReturn`, `SupplierReturnLine` (relasi ke retur bernama `supplierReturn`), `SupplierPayment` — kolom persis seperti Step 2;
  - CHECK: `stock_item_values`, `purchase_invoice_dates`, `purchase_line_values`, `stock_batch_values`, `stock_batch_remaining_nonnegative`, `stock_movement_nonzero`, `stock_movement_reason`, `supplier_return_line_values`, `supplier_payment_amount_positive`;
  - `Capability` + `"stock:read" | "stock:manage" | "payable:manage"`; peran `APOTEKER` = `stock:read`, `stock:manage`; `ADMIN_KEUANGAN` = `stock:read`, `payable:manage`, `report:read`;
  - `src/lib/staff-role.ts`: `STAFF_ROLE_LABEL: Record<StaffRole, string>`, `parseStaffRole(value: string | undefined): StaffRole | null`;
  - pembantu uji `tests/integration/stock-world.ts`: `createStockWorld(slug)`, `cleanupStockWorld(slug)`, `seedBatch(world, input)`, tipe `StockWorld`.

- [ ] **Step 1: Pembantu uji dan uji skema (gagal)**

Buat `tests/integration/stock-world.ts`:

```ts
import { prisma } from "@/lib/db";

/**
 * Dunia uji stok: satu cabang aktif, satu cabang *Segera hadir*, satu supplier, satu obat, dan
 * satu produk. Semua diberi awalan `slug` agar setiap berkas uji membersihkan miliknya sendiri.
 */
export type StockWorld = {
  slug: string;
  branchId: string;
  comingSoonBranchId: string;
  supplierId: string;
  supplierName: string;
  drugId: string;
  productId: string;
};

const day = (value: string) => new Date(`${value}T00:00:00Z`);

export async function createStockWorld(slug: string): Promise<StockWorld> {
  const code = slug.toUpperCase();
  const branch = await prisma.branch.create({
    data: { slug, name: `Cabang ${slug}`, address: "Jl. Uji Stok 1", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF", sortOrder: 90 },
  });
  const comingSoon = await prisma.branch.create({
    data: {
      slug: `${slug}-segera`,
      name: `Cabang ${slug} segera`,
      address: "Jl. Uji Stok 2",
      whatsapp: "6285172228900",
      openingHours: "-",
      status: "SEGERA_HADIR",
      sortOrder: 91,
    },
  });
  const supplier = await prisma.supplier.create({ data: { name: `${slug} Farma` } });
  const drug = await prisma.stockItem.create({
    data: { code: `${code}-OBT`, name: `${slug} Amoxicillin 500 mg`, kind: "OBAT", unit: "kapsul", sellPrice: 2000, minStock: 20 },
  });
  const product = await prisma.stockItem.create({
    data: { code: `${code}-PRD`, name: `${slug} Serum C`, kind: "PRODUK", unit: "botol", sellPrice: 150000, minStock: 0 },
  });
  return {
    slug,
    branchId: branch.id,
    comingSoonBranchId: comingSoon.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    drugId: drug.id,
    productId: product.id,
  };
}

/** Faktur satu baris + batch + jurnal MASUK, dibuat langsung di basis data (tanpa aksi server). */
export async function seedBatch(
  world: StockWorld,
  input: {
    invoiceNumber: string;
    itemId: string;
    quantity: number;
    unitCost?: number;
    expiryDate?: string | null;
    branchId?: string;
    invoiceDate?: string;
    dueDate?: string;
  },
): Promise<{ invoiceId: string; batchId: string }> {
  const unitCost = input.unitCost ?? 1000;
  const invoice = await prisma.purchaseInvoice.create({
    data: {
      supplierId: world.supplierId,
      branchId: input.branchId ?? world.branchId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: day(input.invoiceDate ?? "2026-10-01"),
      dueDate: day(input.dueDate ?? "2026-10-31"),
      total: input.quantity * unitCost,
      createdById: "seed",
      createdByName: "Seed",
    },
  });
  const expiryDate = input.expiryDate ? day(input.expiryDate) : null;
  const line = await prisma.purchaseLine.create({
    data: { invoiceId: invoice.id, itemId: input.itemId, quantity: input.quantity, unitCost, expiryDate },
  });
  const batch = await prisma.stockBatch.create({
    data: {
      itemId: input.itemId,
      branchId: invoice.branchId,
      purchaseLineId: line.id,
      expiryDate,
      unitCost,
      quantityReceived: input.quantity,
      quantityRemaining: input.quantity,
    },
  });
  await prisma.stockMovement.create({
    data: { batchId: batch.id, kind: "MASUK", quantity: input.quantity, staffId: "seed", staffName: "Seed" },
  });
  return { invoiceId: invoice.id, batchId: batch.id };
}

/** Menghapus semua data dunia uji, dari anak ke induk (relasi stok memakai Restrict). */
export async function cleanupStockWorld(slug: string): Promise<void> {
  const branch = { slug: { startsWith: slug } };
  await prisma.stockMovement.deleteMany({ where: { batch: { branch } } });
  await prisma.supplierReturnLine.deleteMany({ where: { batch: { branch } } });
  await prisma.supplierReturn.deleteMany({ where: { invoice: { branch } } });
  await prisma.supplierPayment.deleteMany({ where: { invoice: { branch } } });
  await prisma.stockBatch.deleteMany({ where: { branch } });
  await prisma.purchaseLine.deleteMany({ where: { invoice: { branch } } });
  await prisma.purchaseInvoice.deleteMany({ where: { branch } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: slug } } });
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: slug.toUpperCase() } } });
  await prisma.branch.deleteMany({ where: branch });
}
```

Buat `tests/integration/stock-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";

const SLUG = "skema-stok";
const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("skema stok dan hutang", () => {
  let world: StockWorld;

  beforeAll(async () => {
    await cleanupStockWorld(SLUG);
    world = await createStockWorld(SLUG);
  });

  afterAll(async () => {
    await cleanupStockWorld(SLUG);
    await prisma.$disconnect();
  });

  const invoice = (invoiceNumber: string, dueDate = "2026-10-31") =>
    prisma.purchaseInvoice.create({
      data: {
        supplierId: world.supplierId,
        branchId: world.branchId,
        invoiceNumber,
        invoiceDate: day("2026-10-01"),
        dueDate: day(dueDate),
        total: 50000,
        createdById: "s1",
        createdByName: "Apoteker Uji",
      },
    });

  it("nomor faktur unik per supplier", async () => {
    await invoice("SK-1");
    await expect(invoice("SK-1")).rejects.toThrow(/Unique constraint/);
  });

  it("jatuh tempo tidak boleh sebelum tanggal faktur", async () => {
    await expect(invoice("SK-2", "2026-09-30")).rejects.toThrow(/purchase_invoice_dates/);
  });

  it("baris faktur wajib berjumlah positif dan sisa batch tidak pernah minus", async () => {
    const { invoiceId, batchId } = await seedBatch(world, { invoiceNumber: "SK-3", itemId: world.drugId, quantity: 10 });
    await expect(
      prisma.purchaseLine.create({ data: { invoiceId, itemId: world.drugId, quantity: 0, unitCost: 5000 } }),
    ).rejects.toThrow(/purchase_line_values/);
    await expect(prisma.stockBatch.update({ where: { id: batchId }, data: { quantityRemaining: -1 } })).rejects.toThrow(
      /stock_batch_remaining_nonnegative/,
    );
  });

  it("penyesuaian wajib beralasan; jenis lain tanpa alasan; jumlah tidak boleh 0", async () => {
    const { batchId } = await seedBatch(world, { invoiceNumber: "SK-4", itemId: world.drugId, quantity: 5 });
    const movement = (data: Record<string, unknown>) =>
      prisma.stockMovement.create({ data: { batchId, staffId: "s1", staffName: "Uji", kind: "PENYESUAIAN", quantity: -1, ...data } });
    await expect(movement({})).rejects.toThrow(/stock_movement_reason/);
    await expect(movement({ kind: "MASUK", quantity: 1, reason: "RUSAK" })).rejects.toThrow(/stock_movement_reason/);
    await expect(movement({ reason: "RUSAK", quantity: 0 })).rejects.toThrow(/stock_movement_nonzero/);
    expect((await movement({ reason: "RUSAK" })).quantity).toBe(-1);
  });

  it("pembayaran harus lebih dari 0", async () => {
    const created = await invoice("SK-5");
    await expect(
      prisma.supplierPayment.create({
        data: { invoiceId: created.id, kind: "BAYAR", amount: 0, method: "TUNAI", paidAt: day("2026-10-02"), staffId: "s1", staffName: "Uji" },
      }),
    ).rejects.toThrow(/supplier_payment_amount_positive/);
  });
});
```

Buat `tests/unit/staff-role.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStaffRole, STAFF_ROLE_LABEL } from "@/lib/staff-role";

describe("peran staf", () => {
  it("label untuk semua peran, termasuk Apoteker dan Admin Keuangan", () => {
    expect(STAFF_ROLE_LABEL.APOTEKER).toBe("Apoteker");
    expect(STAFF_ROLE_LABEL.ADMIN_KEUANGAN).toBe("Admin Keuangan");
    expect(STAFF_ROLE_LABEL.SUPER_ADMIN).toBe("Super Admin");
  });

  it("argumen peran skrip create-admin: kosong berarti Super Admin, huruf kecil diterima, nilai asing ditolak", () => {
    expect(parseStaffRole(undefined)).toBe("SUPER_ADMIN");
    expect(parseStaffRole("")).toBe("SUPER_ADMIN");
    expect(parseStaffRole("apoteker")).toBe("APOTEKER");
    expect(parseStaffRole(" ADMIN_KEUANGAN ")).toBe("ADMIN_KEUANGAN");
    expect(parseStaffRole("KASIR")).toBeNull();
  });
});
```

Tambahkan di akhir `tests/unit/permissions.test.ts`:

```ts
describe("hak akses stok dan hutang (spec stok 7)", () => {
  it("Apoteker mengelola stok, tetapi tidak hutang, booking, rekam medis, atau angka", () => {
    expect(can("APOTEKER", "stock:read")).toBe(true);
    expect(can("APOTEKER", "stock:manage")).toBe(true);
    for (const capability of ["payable:manage", "booking:manage", "record:read", "report:read", "staff:manage"] as const) {
      expect(can("APOTEKER", capability)).toBe(false);
    }
  });

  it("Admin Keuangan membaca stok, mengelola hutang, dan melihat Angka, tetapi tidak mengubah stok", () => {
    expect(can("ADMIN_KEUANGAN", "stock:read")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "payable:manage")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "report:read")).toBe(true);
    for (const capability of ["stock:manage", "booking:manage", "schedule:manage", "record:read", "staff:manage"] as const) {
      expect(can("ADMIN_KEUANGAN", capability)).toBe(false);
    }
  });

  it("Dokter, Resepsionis, dan Terapis belum punya akses stok atau hutang", () => {
    for (const role of ["DOKTER", "RESEPSIONIS", "TERAPIS"] as const) {
      for (const capability of ["stock:read", "stock:manage", "payable:manage"] as const) {
        expect(can(role, capability)).toBe(false);
      }
    }
  });
});
```

Dan di berkas yang sama:
- pada uji `"hanya memberi super admin akses jejak audit"`, tambahkan `"APOTEKER", "ADMIN_KEUANGAN",` ke larik `roles`;
- ganti uji `"Angka dasbor (report:read) hanya untuk Super Admin (spec D 4.6)"` dengan:

```ts
  it("Angka dasbor (report:read) untuk Super Admin dan Admin Keuangan (spec D 4.6, spec stok 7.2)", () => {
    expect(can("SUPER_ADMIN", "report:read")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "report:read")).toBe(true);
    expect(can("DOKTER", "report:read")).toBe(false);
    expect(can("RESEPSIONIS", "report:read")).toBe(false);
    expect(can("TERAPIS", "report:read")).toBe(false);
    expect(can("APOTEKER", "report:read")).toBe(false);
  });
```

Run: `npx vitest run tests/unit/staff-role.test.ts tests/unit/permissions.test.ts; npm run test:integration -- tests/integration/stock-schema.test.ts`
Expected: FAIL — modul `@/lib/staff-role` belum ada, peran baru belum dikenal, dan model `supplier`/`stockItem` belum ada di klien Prisma.

- [ ] **Step 2: Skema Prisma**

Di `prisma/schema.prisma`:

1. Ganti `enum StaffRole { … }` dengan:

```prisma
enum StaffRole {
  SUPER_ADMIN
  DOKTER
  TERAPIS
  RESEPSIONIS
  /// Mengelola barang, barang masuk, retur, dan penyesuaian stok (spec stok 7).
  APOTEKER
  /// Mengelola hutang ke supplier dan melihat angka keuangan (spec stok 7).
  ADMIN_KEUANGAN
}
```

2. Di blok `model Branch`, tambahkan tepat setelah `slotHolds          SlotHold[]`:

```prisma
  purchaseInvoices   PurchaseInvoice[]
  stockBatches       StockBatch[]
```

3. Tambahkan di **akhir** berkas:

```prisma
// ---------------------------------------------------------------------------
// Stok barang, supplier, dan hutang (spec docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md)
// ---------------------------------------------------------------------------

enum StockItemKind {
  OBAT
  PRODUK
}

enum StockMovementKind {
  MASUK
  RETUR
  PENYESUAIAN
}

enum StockAdjustReason {
  RUSAK
  HILANG
  KEDALUWARSA
  SELISIH_HITUNG
  LAINNYA
}

enum SupplierPaymentKind {
  /// Klinik membayar supplier.
  BAYAR
  /// Supplier mengembalikan uang karena kredit dari retur (spec stok 6.3).
  PENGEMBALIAN
}

enum PaymentMethod {
  TUNAI
  TRANSFER
  QRIS
}

/// Barang yang distok: obat dan produk jual. Terpisah dari Product (katalog situs publik).
model StockItem {
  id        String        @id @default(cuid())
  code      String        @unique
  name      String
  kind      StockItemKind
  /// Satuan terkecil yang dihitung, mis. tablet, kapsul, botol.
  unit      String
  /// Harga jual dalam rupiah; boleh kosong sampai dibutuhkan tagihan.
  sellPrice Int?
  /// Batas "menipis" per cabang; 0 berarti tidak pernah ditandai menipis.
  minStock  Int           @default(0)
  isActive  Boolean       @default(true)
  notes     String?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  purchaseLines PurchaseLine[]
  batches       StockBatch[]

  @@index([isActive, name])
}

model Supplier {
  id        String   @id @default(cuid())
  name      String
  phone     String?
  address   String?
  notes     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  invoices PurchaseInvoice[]

  @@index([isActive, name])
}

/// Faktur pembelian dari supplier; sisa hutangnya dihitung dari total, pembayaran, dan retur.
model PurchaseInvoice {
  id              String    @id @default(cuid())
  supplierId      String
  supplier        Supplier  @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  /// Cabang penerima barang.
  branchId        String
  branch          Branch    @relation(fields: [branchId], references: [id], onDelete: Restrict)
  /// Nomor yang tertulis di faktur supplier.
  invoiceNumber   String
  invoiceDate     DateTime  @db.Date
  dueDate         DateTime  @db.Date
  /// Jumlah baris (jumlah × harga beli), dihitung server saat faktur dibuat.
  total           Int
  notes           String?
  createdById     String
  createdByName   String
  createdAt       DateTime  @default(now())
  cancelledAt     DateTime?
  cancelledByName String?
  cancelReason    String?

  lines    PurchaseLine[]
  returns  SupplierReturn[]
  payments SupplierPayment[]

  @@unique([supplierId, invoiceNumber])
  @@index([dueDate])
  @@index([branchId, invoiceDate])
}

model PurchaseLine {
  id          String          @id @default(cuid())
  invoiceId   String
  invoice     PurchaseInvoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
  itemId      String
  item        StockItem       @relation(fields: [itemId], references: [id], onDelete: Restrict)
  quantity    Int
  unitCost    Int
  batchNumber String?
  expiryDate  DateTime?       @db.Date
  sortOrder   Int             @default(0)

  batch StockBatch?

  @@index([invoiceId])
}

/// Stok fisik satu batch di satu cabang. Sisa hanya berubah bersama baris StockMovement.
model StockBatch {
  id                String       @id @default(cuid())
  itemId            String
  item              StockItem    @relation(fields: [itemId], references: [id], onDelete: Restrict)
  branchId          String
  branch            Branch       @relation(fields: [branchId], references: [id], onDelete: Restrict)
  purchaseLineId    String       @unique
  purchaseLine      PurchaseLine @relation(fields: [purchaseLineId], references: [id], onDelete: Restrict)
  batchNumber       String?
  expiryDate        DateTime?    @db.Date
  unitCost          Int
  quantityReceived  Int
  quantityRemaining Int
  createdAt         DateTime     @default(now())

  movements   StockMovement[]
  returnLines SupplierReturnLine[]

  @@index([itemId, branchId])
  @@index([branchId, expiryDate])
}

/// Jurnal stok: setiap perubahan sisa batch. Tidak pernah diubah atau dihapus.
model StockMovement {
  id               String             @id @default(cuid())
  batchId          String
  batch            StockBatch         @relation(fields: [batchId], references: [id], onDelete: Restrict)
  kind             StockMovementKind
  /// Bertanda: positif menambah, negatif mengurangi sisa batch.
  quantity         Int
  /// Hanya untuk PENYESUAIAN (CHECK stock_movement_reason).
  reason           StockAdjustReason?
  note             String?
  staffId          String
  staffName        String
  supplierReturnId String?
  createdAt        DateTime           @default(now())

  @@index([batchId, createdAt])
}

model SupplierReturn {
  id        String          @id @default(cuid())
  invoiceId String
  invoice   PurchaseInvoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
  total     Int
  note      String?
  staffId   String
  staffName String
  createdAt DateTime        @default(now())

  lines SupplierReturnLine[]

  @@index([invoiceId])
}

model SupplierReturnLine {
  id             String         @id @default(cuid())
  returnId       String
  supplierReturn SupplierReturn @relation(fields: [returnId], references: [id], onDelete: Cascade)
  batchId        String
  batch          StockBatch     @relation(fields: [batchId], references: [id], onDelete: Restrict)
  quantity       Int
  /// Disalin dari batch saat retur.
  unitCost       Int
  amount         Int

  @@index([returnId])
}

/// Uang antara klinik dan supplier untuk satu faktur. Salah input dibatalkan (revokedAt), tidak dihapus.
model SupplierPayment {
  id            String              @id @default(cuid())
  invoiceId     String
  invoice       PurchaseInvoice     @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
  kind          SupplierPaymentKind
  amount        Int
  method        PaymentMethod
  paidAt        DateTime            @db.Date
  reference     String?
  staffId       String
  staffName     String
  createdAt     DateTime            @default(now())
  revokedAt     DateTime?
  revokedByName String?
  revokeReason  String?

  @@index([invoiceId])
}
```

4. Jalankan `npx prisma format`.

- [ ] **Step 3: Migrasi**

```bash
npx prisma migrate deploy
mkdir -p prisma/migrations/20261007120000_stok_hutang
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  > prisma/migrations/20261007120000_stok_hutang/migration.sql
cat prisma/migrations/20261007120000_stok_hutang/migration.sql
```

Expected: SQL berisi `ALTER TYPE "StaffRole" ADD VALUE 'APOTEKER';`, `ALTER TYPE "StaffRole" ADD VALUE 'ADMIN_KEUANGAN';`, lima `CREATE TYPE`, sembilan `CREATE TABLE`, indeks, unik, dan `ADD CONSTRAINT … FOREIGN KEY`. Tidak ada `DROP`. **Hasil generate yang dipakai.**

Tambahkan di **awal** berkas:

```sql
-- Stok barang, supplier, dan hutang (sub-proyek keuangan 1).
-- Spec: docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md bagian 4.
-- Migrasi ini hanya menambah: tabel, enum, nilai peran, dan CHECK. Rilis lama tetap berjalan.

```

Lalu tambahkan di **akhir** berkas:

```sql

-- Penjagaan nilai di basis data (spec stok 4.3).
ALTER TABLE "StockItem" ADD CONSTRAINT stock_item_values
  CHECK ("minStock" >= 0 AND ("sellPrice" IS NULL OR "sellPrice" >= 0));

ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT purchase_invoice_dates
  CHECK ("dueDate" >= "invoiceDate" AND "total" >= 0);

ALTER TABLE "PurchaseLine" ADD CONSTRAINT purchase_line_values
  CHECK ("quantity" > 0 AND "unitCost" >= 0);

ALTER TABLE "StockBatch" ADD CONSTRAINT stock_batch_values
  CHECK ("quantityReceived" > 0 AND "unitCost" >= 0);

-- Sisa batch tidak pernah minus; pengurangan di aplikasi memakai UPDATE bersyarat.
ALTER TABLE "StockBatch" ADD CONSTRAINT stock_batch_remaining_nonnegative
  CHECK ("quantityRemaining" >= 0);

ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_nonzero
  CHECK ("quantity" <> 0);

-- Alasan hanya dan wajib untuk penyesuaian.
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_reason
  CHECK (("kind" = 'PENYESUAIAN') = ("reason" IS NOT NULL));

ALTER TABLE "SupplierReturnLine" ADD CONSTRAINT supplier_return_line_values
  CHECK ("quantity" > 0 AND "unitCost" >= 0 AND "amount" >= 0);

ALTER TABLE "SupplierPayment" ADD CONSTRAINT supplier_payment_amount_positive
  CHECK ("amount" > 0);
```

Terapkan:

```bash
npx prisma migrate deploy
npm run db:migrate:test
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: ketiga perintah pertama berhasil; perintah terakhir keluar dengan kode 0.

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi stok dan hutang", () => {
  const sql = readFileSync("prisma/migrations/20261007120000_stok_hutang/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga sisa batch, nilai faktur, alasan penyesuaian, dan pembayaran di basis data", () => {
    for (const name of [
      "stock_batch_remaining_nonnegative",
      "purchase_invoice_dates",
      "purchase_line_values",
      "stock_movement_reason",
      "supplier_payment_amount_positive",
    ]) {
      expect(sql).toContain(name);
    }
  });

  it("menambah peran Apoteker dan Admin Keuangan", () => {
    expect(sql).toMatch(/ADD VALUE 'APOTEKER'/);
    expect(sql).toMatch(/ADD VALUE 'ADMIN_KEUANGAN'/);
  });
});
```

- [ ] **Step 4: Peran dan kemampuan**

Di `src/lib/permissions.ts`:
1. Tambahkan pada tipe `Capability` (sebelum `| "audit:read"`):

```ts
  | "stock:read"
  | "stock:manage"
  | "payable:manage"
```

2. Pada `SUPER_ADMIN`, tambahkan `"stock:read", "stock:manage", "payable:manage",` setelah `"audit:read",`.
3. Tambahkan setelah entri `TERAPIS: [],`:

```ts

  // Apoteker mengelola barang, barang masuk, retur, dan penyesuaian stok (spec stok 7).
  // Ia mengisi harga beli dari faktur kertas, tetapi tidak mengurus pembayaran hutang.
  APOTEKER: ["stock:read", "stock:manage"],

  // Admin Keuangan melihat stok, mengelola hutang ke supplier, dan melihat Angka dasbor.
  // Tidak mengubah stok, booking, jadwal, rekam medis, atau akun staf (spec stok 7.2).
  ADMIN_KEUANGAN: ["stock:read", "payable:manage", "report:read"],
```

4. Ubah komentar di atas `DOKTER` menjadi `// report:read (Angka dasbor, termasuk biaya booking masuk) hanya untuk Super Admin dan Admin Keuangan (spec D 4.6, spec stok 7.2).`

Buat `src/lib/staff-role.ts`:

```ts
import type { StaffRole } from "@prisma/client";

/** Nama peran di panel dan di jejak audit. */
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super Admin",
  DOKTER: "Dokter",
  TERAPIS: "Terapis",
  RESEPSIONIS: "Resepsionis",
  APOTEKER: "Apoteker",
  ADMIN_KEUANGAN: "Admin Keuangan",
};

const ROLES = Object.keys(STAFF_ROLE_LABEL) as StaffRole[];

/** Argumen peran skrip create-admin: kosong berarti Super Admin; selain itu harus nama peran yang dikenal. */
export function parseStaffRole(value: string | undefined): StaffRole | null {
  if (value === undefined || value.trim() === "") return "SUPER_ADMIN";
  const role = value.trim().toUpperCase();
  return (ROLES as string[]).includes(role) ? (role as StaffRole) : null;
}
```

Di `src/components/admin/staff-table.tsx`: hapus konstanta lokal `ROLE_LABEL`, tambahkan `import { STAFF_ROLE_LABEL } from "@/lib/staff-role";`, dan ganti `{ROLE_LABEL[person.role]}` dengan `{STAFF_ROLE_LABEL[person.role]}`.

Di `src/components/admin/nav-user.tsx`: hapus konstanta lokal `ROLE_LABEL`, tambahkan `import { STAFF_ROLE_LABEL } from "@/lib/staff-role";`, dan ganti pemakaian `ROLE_LABEL[...]` dengan `STAFF_ROLE_LABEL[...]`.

Di `src/lib/audit-labels.ts`, pada `ROLE_LABEL`, tambahkan `APOTEKER: "Apoteker",` dan `ADMIN_KEUANGAN: "Admin Keuangan",` setelah `TERAPIS: "Terapis",`.

Ganti isi `scripts/create-admin.mts` dengan:

```ts
import "dotenv/config";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { parseStaffRole, STAFF_ROLE_LABEL } from "../src/lib/staff-role";

const [email, password, name, roleArg] = process.argv.slice(2);
const role = parseStaffRole(roleArg);

if (!email || !password || !name || !role) {
  console.error(
    'Pakai: npm run create-admin -- <email> <kata-sandi> "<nama lengkap>" [SUPER_ADMIN|DOKTER|RESEPSIONIS|APOTEKER|ADMIN_KEUANGAN]',
  );
  process.exit(1);
}

const created = await auth.api.signUpEmail({ body: { email, password, name } });

const slug = slugify(name);

const staff = await prisma.staff.create({
  data: { slug, name, role, showOnWebsite: false },
});

await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });

console.log(`Akun ${STAFF_ROLE_LABEL[role]} dibuat untuk ${email}.`);
await prisma.$disconnect();
```

Run: `npx tsc --noEmit -p . > "$WS/t1-tsc.log" 2>&1; echo "tsc exit $?"; tail -20 "$WS/t1-tsc.log"`
Expected: `tsc exit 0`. Bila `tsc` menandai `Record<StaffRole, …>` lain yang kini kurang dua kunci, tambahkan `APOTEKER` dan `ADMIN_KEUANGAN` dengan nilai yang sesuai di berkas itu (label memakai `STAFF_ROLE_LABEL`).

- [ ] **Step 5: Jalankan uji dan commit**

Run: `npx vitest run tests/unit/staff-role.test.ts tests/unit/permissions.test.ts tests/unit/migrations.test.ts; npm run test:integration -- tests/integration/stock-schema.test.ts`
Expected: PASS semua.

Run: `npx vitest run > "$WS/t1.log" 2>&1; grep -E "Test Files|Tests " "$WS/t1.log"; npx eslint src/lib scripts tests/integration/stock-world.ts tests/integration/stock-schema.test.ts`
Expected: semua PASS, eslint bersih.

```bash
git add prisma/schema.prisma prisma/migrations/20261007120000_stok_hutang src/lib/permissions.ts src/lib/staff-role.ts \
  src/lib/audit-labels.ts src/components/admin/staff-table.tsx src/components/admin/nav-user.tsx scripts/create-admin.mts tests/unit/migrations.test.ts \
  tests/unit/permissions.test.ts tests/unit/staff-role.test.ts tests/integration/stock-world.ts tests/integration/stock-schema.test.ts
git commit -m "feat: add stock, supplier, and payable tables with pharmacist and finance-admin roles"
```

---

### Task 2: Aturan stok dan hutang — hitung, tanda, validasi, label

**Files:**
- Create: `src/lib/stock.ts`
- Test: `tests/unit/stock.test.ts`

**Interfaces:**
- Consumes (sudah ada): `formatRupiah`, `formatDateWithYear` (`@/lib/format`); `addDaysToDateString` (`@/lib/time`).
- Produces (`src/lib/stock.ts`):
  - tipe nilai: `StockItemKindValue`, `AdjustReasonValue`, `PaymentMethodValue`, `SupplierPaymentKindValue`, `StockMovementKindValue`, `StockFlag` (`"MENIPIS" | "SEGERA_KEDALUWARSA" | "KEDALUWARSA"`), `PayableStatus` (`"DIBATALKAN" | "LUNAS" | "KREDIT" | "SEBAGIAN" | "BELUM_DIBAYAR"`), `PayableView` (`"BELUM_LUNAS" | "TERLAMBAT" | "JATUH_TEMPO" | "LUNAS" | "DIBATALKAN"`), `Validation<T>`;
  - label: `STOCK_ITEM_KIND_LABEL`, `ADJUST_REASON_LABEL`, `MOVEMENT_KIND_LABEL`, `PAYMENT_METHOD_LABEL`, `PAYMENT_KIND_LABEL`, `STOCK_FLAG_LABEL`, `PAYABLE_STATUS_LABEL`, `PAYABLE_VIEW_LABEL`; daftar: `DECREASE_REASONS`, `INCREASE_REASONS`, `PAYMENT_METHODS`, `PAYABLE_VIEWS`;
  - konstanta: `EXPIRY_WARNING_DAYS = 60`, `DEFAULT_DUE_DAYS = 30`, `DUE_SOON_DAYS = 7`, `MAX_PURCHASE_LINES = 100`, `MAX_QUANTITY = 1_000_000`, `MAX_AMOUNT = 2_000_000_000`;
  - tanggal: `isDateString(value: unknown): value is string`, `dateOnly(value: string): Date`, `dateOnlyString(date: Date): string`, `dateLabel(value: string | null): string`;
  - hutang: `payableSummary(invoice: PayableInput, today: string): PayableSummary` dengan `PayableInput = { total: number; cancelledAt: Date | null; dueDate: Date; payments: readonly { kind: SupplierPaymentKindValue; amount: number; revokedAt: Date | null }[]; returns: readonly { total: number }[] }` dan `PayableSummary = { paid: number; refunded: number; returned: number; balance: number; status: PayableStatus; overdue: boolean }`; `isPayableView(value: unknown): value is PayableView`; `matchesPayableView(row: { status: PayableStatus; overdue: boolean; balance: number; dueDate: string }, view: PayableView, today: string): boolean`; `comparePayables(a, b)` (terlambat dulu, lalu jatuh tempo terdekat);
  - stok: `stockFlags(batches: readonly { quantityRemaining: number; expiryDate: Date | null; unitCost: number }[], minStock: number, today: string): StockFlags` dengan `StockFlags = { onHand: number; available: number; value: number; low: boolean; expiringSoon: boolean; expired: boolean }`; `flagsOf(flags: StockFlags): StockFlag[]`; `summarizeStock(rows: readonly StockFlags[]): { value: number; low: number; expiringSoon: number; expired: number }`; `isStockFlag(value: unknown): value is StockFlag`;
  - validasi (semuanya mengembalikan `Validation<…>`): `validateStockItem(raw)` → `ValidStockItem`; `validateSupplier(raw)` → `ValidSupplier`; `validatePurchase(raw, { today, kindOf })` → `ValidPurchase`; `validateAdjustment(raw)` → `ValidAdjustment`; `validateReturn(raw)` → `ValidReturn`; `validatePayment(raw, { today, invoiceDate, limit })` → `ValidPayment`; `validateReason(raw)` → `string`; `validateDueDateChange(raw, invoiceDate)` → `string`;
  - tipe masukan formulir: `StockItemInput`, `SupplierInput`, `PurchaseInput`, `PurchaseLineInput`, `AdjustmentInput`, `ReturnInput`, `PaymentInput`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/unit/stock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  comparePayables,
  dateLabel,
  dateOnly,
  dateOnlyString,
  flagsOf,
  isDateString,
  matchesPayableView,
  payableSummary,
  stockFlags,
  summarizeStock,
  validateAdjustment,
  validateDueDateChange,
  validatePayment,
  validatePurchase,
  validateReason,
  validateReturn,
  validateStockItem,
  validateSupplier,
  type PayableInput,
  type PurchaseInput,
} from "@/lib/stock";

const TODAY = "2026-10-07";
const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("tanggal tanpa jam", () => {
  it("menerima tanggal yang ada saja", () => {
    expect(isDateString("2026-10-07")).toBe(true);
    expect(isDateString("2026-02-31")).toBe(false);
    expect(isDateString("7/10/2026")).toBe(false);
    expect(isDateString(20261007)).toBe(false);
  });

  it("bolak-balik @db.Date tanpa bergeser hari, dan label tanggal", () => {
    expect(dateOnlyString(dateOnly("2026-12-31"))).toBe("2026-12-31");
    expect(dateLabel("2026-10-07")).toBe("7 Okt 2026");
    expect(dateLabel(null)).toBe("—");
  });
});

describe("payableSummary", () => {
  const base: PayableInput = { total: 100000, cancelledAt: null, dueDate: day("2026-10-31"), payments: [], returns: [] };

  it("belum dibayar, sebagian, lunas", () => {
    expect(payableSummary(base, TODAY)).toEqual({ paid: 0, refunded: 0, returned: 0, balance: 100000, status: "BELUM_DIBAYAR", overdue: false });
    const partial = { ...base, payments: [{ kind: "BAYAR" as const, amount: 40000, revokedAt: null }] };
    expect(payableSummary(partial, TODAY)).toMatchObject({ paid: 40000, balance: 60000, status: "SEBAGIAN" });
    const paid = { ...base, payments: [{ kind: "BAYAR" as const, amount: 100000, revokedAt: null }] };
    expect(payableSummary(paid, TODAY)).toMatchObject({ balance: 0, status: "LUNAS" });
  });

  it("pembayaran yang dibatalkan tidak dihitung", () => {
    const revoked = { ...base, payments: [{ kind: "BAYAR" as const, amount: 100000, revokedAt: new Date() }] };
    expect(payableSummary(revoked, TODAY)).toMatchObject({ paid: 0, balance: 100000, status: "BELUM_DIBAYAR" });
  });

  it("retur mengurangi hutang; retur atas faktur lunas menjadi kredit, pengembalian dana menutupnya", () => {
    const returned = { ...base, returns: [{ total: 30000 }] };
    expect(payableSummary(returned, TODAY)).toMatchObject({ returned: 30000, balance: 70000, status: "SEBAGIAN" });
    const credit = { ...base, payments: [{ kind: "BAYAR" as const, amount: 100000, revokedAt: null }], returns: [{ total: 30000 }] };
    expect(payableSummary(credit, TODAY)).toMatchObject({ balance: -30000, status: "KREDIT" });
    const refunded = { ...credit, payments: [...credit.payments, { kind: "PENGEMBALIAN" as const, amount: 30000, revokedAt: null }] };
    expect(payableSummary(refunded, TODAY)).toMatchObject({ refunded: 30000, balance: 0, status: "LUNAS" });
  });

  it("terlambat hanya bila belum lunas dan jatuh tempo sudah lewat; faktur dibatalkan tidak berhutang", () => {
    expect(payableSummary({ ...base, dueDate: day("2026-10-06") }, TODAY).overdue).toBe(true);
    expect(payableSummary({ ...base, dueDate: day("2026-10-07") }, TODAY).overdue).toBe(false);
    const cancelled = { ...base, dueDate: day("2026-10-01"), cancelledAt: new Date() };
    expect(payableSummary(cancelled, TODAY)).toMatchObject({ status: "DIBATALKAN", overdue: false });
  });
});

describe("tampilan dan urutan hutang", () => {
  const row = (patch: Partial<{ status: "BELUM_DIBAYAR" | "SEBAGIAN" | "LUNAS" | "KREDIT" | "DIBATALKAN"; overdue: boolean; balance: number; dueDate: string }>) => ({
    status: "BELUM_DIBAYAR" as const,
    overdue: false,
    balance: 1000,
    dueDate: "2026-10-20",
    ...patch,
  });

  it("menyaring per tampilan", () => {
    expect(matchesPayableView(row({ status: "KREDIT", balance: -500 }), "BELUM_LUNAS", TODAY)).toBe(true);
    expect(matchesPayableView(row({ status: "LUNAS", balance: 0 }), "BELUM_LUNAS", TODAY)).toBe(false);
    expect(matchesPayableView(row({ overdue: true, dueDate: "2026-10-01" }), "TERLAMBAT", TODAY)).toBe(true);
    expect(matchesPayableView(row({ dueDate: "2026-10-14" }), "JATUH_TEMPO", TODAY)).toBe(true);
    expect(matchesPayableView(row({ dueDate: "2026-10-15" }), "JATUH_TEMPO", TODAY)).toBe(false);
    expect(matchesPayableView(row({ status: "DIBATALKAN" }), "DIBATALKAN", TODAY)).toBe(true);
  });

  it("terlambat paling atas, lalu jatuh tempo terdekat", () => {
    const list = [row({ dueDate: "2026-10-30" }), row({ dueDate: "2026-10-10" }), row({ overdue: true, dueDate: "2026-10-01" })];
    expect([...list].sort(comparePayables).map((r) => r.dueDate)).toEqual(["2026-10-01", "2026-10-10", "2026-10-30"]);
  });
});

describe("stockFlags", () => {
  const batch = (quantityRemaining: number, expiry: string | null, unitCost = 1000) => ({
    quantityRemaining,
    expiryDate: expiry ? day(expiry) : null,
    unitCost,
  });

  it("stok tersedia tidak menghitung batch kedaluwarsa; nilai stok menghitung semua sisa", () => {
    const flags = stockFlags([batch(10, "2027-06-01"), batch(4, "2026-10-06"), batch(3, null, 5000)], 0, TODAY);
    expect(flags).toEqual({ onHand: 17, available: 13, value: 10000 + 4000 + 15000, low: false, expiringSoon: false, expired: true });
    expect(flagsOf(flags)).toEqual(["KEDALUWARSA"]);
  });

  it("segera kedaluwarsa dalam 60 hari, termasuk hari ini; menipis bila tersedia ≤ batas", () => {
    expect(stockFlags([batch(5, "2026-12-06")], 0, TODAY).expiringSoon).toBe(true);
    expect(stockFlags([batch(5, "2026-12-07")], 0, TODAY).expiringSoon).toBe(false);
    expect(stockFlags([batch(5, "2026-10-07")], 0, TODAY)).toMatchObject({ expiringSoon: true, expired: false, available: 5 });
    expect(stockFlags([batch(20, null)], 20, TODAY).low).toBe(true);
    expect(stockFlags([batch(21, null)], 20, TODAY).low).toBe(false);
    expect(stockFlags([], 0, TODAY).low).toBe(false);
    expect(flagsOf(stockFlags([batch(2, "2026-11-01")], 5, TODAY))).toEqual(["MENIPIS", "SEGERA_KEDALUWARSA"]);
  });

  it("ringkasan cabang", () => {
    const a = stockFlags([batch(2, "2026-11-01")], 5, TODAY);
    const b = stockFlags([batch(1, "2026-10-01", 3000)], 0, TODAY);
    expect(summarizeStock([a, b])).toEqual({ value: 2000 + 3000, low: 1, expiringSoon: 1, expired: 1 });
  });
});

describe("validasi barang dan supplier", () => {
  const item = { code: " obt-001 ", name: " Amoxicillin ", kind: "OBAT", unit: " kapsul ", sellPrice: 2000, minStock: 20, notes: "" };

  it("merapikan barang yang sah", () => {
    expect(validateStockItem(item)).toEqual({
      ok: true,
      value: { code: "OBT-001", name: "Amoxicillin", kind: "OBAT", unit: "kapsul", sellPrice: 2000, minStock: 20, notes: null },
    });
    expect(validateStockItem({ ...item, sellPrice: null })).toMatchObject({ ok: true, value: { sellPrice: null } });
  });

  it("menolak barang yang tidak sah", () => {
    expect(validateStockItem({ ...item, code: "" })).toEqual({ ok: false, message: "Isi kode barang." });
    expect(validateStockItem({ ...item, code: "OBT 001" })).toEqual({
      ok: false,
      message: "Kode hanya huruf, angka, dan tanda hubung, paling banyak 30 karakter.",
    });
    expect(validateStockItem({ ...item, name: " " })).toEqual({ ok: false, message: "Isi nama barang." });
    expect(validateStockItem({ ...item, kind: "ALAT" })).toEqual({ ok: false, message: "Pilih jenis barang." });
    expect(validateStockItem({ ...item, unit: "" })).toEqual({ ok: false, message: "Isi satuan, mis. tablet atau botol." });
    expect(validateStockItem({ ...item, sellPrice: -1 })).toEqual({ ok: false, message: "Harga jual tidak sah." });
    expect(validateStockItem({ ...item, minStock: 1.5 })).toEqual({
      ok: false,
      message: "Batas menipis harus bilangan bulat 0 atau lebih.",
    });
  });

  it("supplier: nama wajib", () => {
    expect(validateSupplier({ name: " Kimia Farma ", phone: "", address: "", notes: "" })).toEqual({
      ok: true,
      value: { name: "Kimia Farma", phone: null, address: null, notes: null },
    });
    expect(validateSupplier({ name: "", phone: "", address: "", notes: "" })).toEqual({ ok: false, message: "Isi nama supplier." });
  });
});

describe("validatePurchase", () => {
  const kinds = new Map([
    ["obat", "OBAT" as const],
    ["serum", "PRODUK" as const],
  ]);
  const ctx = { today: TODAY, kindOf: (id: string) => kinds.get(id) ?? null };
  const valid: PurchaseInput = {
    supplierId: "s1",
    branchId: "b1",
    invoiceNumber: " INV-123 ",
    invoiceDate: "2026-10-07",
    dueDate: "2026-11-06",
    notes: "",
    lines: [
      { itemId: "obat", quantity: 10, unitCost: 5000, batchNumber: " B1 ", expiryDate: "2027-06-01" },
      { itemId: "serum", quantity: 2, unitCost: 75000, batchNumber: "", expiryDate: "" },
    ],
  };

  it("menghitung total dan merapikan isian", () => {
    expect(validatePurchase(valid, ctx)).toEqual({
      ok: true,
      value: {
        supplierId: "s1",
        branchId: "b1",
        invoiceNumber: "INV-123",
        invoiceDate: "2026-10-07",
        dueDate: "2026-11-06",
        notes: null,
        total: 50000 + 150000,
        lines: [
          { itemId: "obat", quantity: 10, unitCost: 5000, batchNumber: "B1", expiryDate: "2027-06-01" },
          { itemId: "serum", quantity: 2, unitCost: 75000, batchNumber: null, expiryDate: null },
        ],
      },
    });
  });

  it("menolak kepala faktur yang tidak sah", () => {
    expect(validatePurchase({ ...valid, supplierId: "" }, ctx)).toEqual({ ok: false, message: "Pilih supplier." });
    expect(validatePurchase({ ...valid, branchId: "" }, ctx)).toEqual({ ok: false, message: "Pilih cabang penerima." });
    expect(validatePurchase({ ...valid, invoiceNumber: " " }, ctx)).toEqual({ ok: false, message: "Isi nomor faktur." });
    expect(validatePurchase({ ...valid, invoiceDate: "2026-10-08" }, ctx)).toEqual({
      ok: false,
      message: "Tanggal faktur tidak boleh di masa depan.",
    });
    expect(validatePurchase({ ...valid, dueDate: "2026-10-06" }, ctx)).toEqual({
      ok: false,
      message: "Jatuh tempo tidak boleh sebelum tanggal faktur.",
    });
    expect(validatePurchase({ ...valid, lines: [] }, ctx)).toEqual({ ok: false, message: "Tambahkan minimal satu barang." });
    expect(validatePurchase("bukan objek", ctx)).toEqual({
      ok: false,
      message: "Data barang masuk tidak sah. Muat ulang halaman lalu coba lagi.",
    });
  });

  it("menolak baris yang tidak sah, dengan nomor barisnya", () => {
    const line = (patch: Record<string, unknown>) => ({ ...valid, lines: [valid.lines[0], { ...valid.lines[1], ...patch }] });
    expect(validatePurchase(line({ itemId: "hilang" }), ctx)).toEqual({ ok: false, message: "Baris 2: pilih barang yang aktif." });
    expect(validatePurchase(line({ quantity: 1.5 }), ctx)).toEqual({
      ok: false,
      message: "Baris 2: jumlah harus bilangan bulat lebih dari 0.",
    });
    expect(validatePurchase(line({ quantity: 0 }), ctx)).toEqual({
      ok: false,
      message: "Baris 2: jumlah harus bilangan bulat lebih dari 0.",
    });
    expect(validatePurchase(line({ unitCost: -1 }), ctx)).toEqual({ ok: false, message: "Baris 2: harga beli tidak sah." });
    expect(validatePurchase(line({ expiryDate: "2026-02-31" }), ctx)).toEqual({
      ok: false,
      message: "Baris 2: tanggal kedaluwarsa tidak sah.",
    });
    expect(validatePurchase(line({ itemId: "obat", expiryDate: "" }), ctx)).toEqual({
      ok: false,
      message: "Baris 2: isi tanggal kedaluwarsa obat.",
    });
    expect(validatePurchase(line({ expiryDate: "2026-10-06" }), ctx)).toEqual({ ok: false, message: "Baris 2: barang ini sudah kedaluwarsa." });
    expect(validatePurchase(line({ quantity: 1_000_000, unitCost: 2_000_000_000 }), ctx)).toEqual({
      ok: false,
      message: "Total faktur terlalu besar.",
    });
  });
});

describe("validasi penyesuaian, retur, pembayaran, alasan, jatuh tempo", () => {
  it("penyesuaian: arah menentukan tanda dan alasan yang boleh", () => {
    expect(validateAdjustment({ batchId: "b1", direction: "KURANGI", quantity: 2, reason: "RUSAK", note: "" })).toEqual({
      ok: true,
      value: { batchId: "b1", delta: -2, reason: "RUSAK", note: null },
    });
    expect(validateAdjustment({ batchId: "b1", direction: "TAMBAH", quantity: 1, reason: "SELISIH_HITUNG", note: "Hitung ulang rak" })).toEqual({
      ok: true,
      value: { batchId: "b1", delta: 1, reason: "SELISIH_HITUNG", note: "Hitung ulang rak" },
    });
    expect(validateAdjustment({ batchId: "b1", direction: "TAMBAH", quantity: 1, reason: "RUSAK", note: "" })).toEqual({
      ok: false,
      message: "Pilih alasan penyesuaian.",
    });
    expect(validateAdjustment({ batchId: "b1", direction: "KURANGI", quantity: 1, reason: "LAINNYA", note: " " })).toEqual({
      ok: false,
      message: "Isi catatan untuk alasan ini.",
    });
    expect(validateAdjustment({ batchId: "b1", direction: "KURANGI", quantity: -3, reason: "HILANG", note: "" })).toEqual({
      ok: false,
      message: "Jumlah harus bilangan bulat lebih dari 0.",
    });
  });

  it("retur: minimal satu baris, jumlah bulat positif, batch tidak berulang", () => {
    expect(validateReturn({ invoiceId: "i1", lines: [{ batchId: "b1", quantity: 2 }], note: "" })).toEqual({
      ok: true,
      value: { invoiceId: "i1", lines: [{ batchId: "b1", quantity: 2 }], note: null },
    });
    expect(validateReturn({ invoiceId: "i1", lines: [], note: "" })).toEqual({ ok: false, message: "Pilih minimal satu barang untuk diretur." });
    expect(validateReturn({ invoiceId: "i1", lines: [{ batchId: "b1", quantity: 0.5 }], note: "" })).toEqual({
      ok: false,
      message: "Jumlah retur harus bilangan bulat lebih dari 0.",
    });
    expect(
      validateReturn({ invoiceId: "i1", lines: [{ batchId: "b1", quantity: 1 }, { batchId: "b1", quantity: 1 }], note: "" }),
    ).toEqual({ ok: false, message: "Batch yang sama dipilih dua kali." });
  });

  it("pembayaran: batas sisa, tanggal, metode", () => {
    const pay = { invoiceId: "i1", kind: "BAYAR", amount: 40000, method: "TRANSFER", paidAt: "2026-10-07", reference: " TRF-1 " };
    const ctx = { today: TODAY, invoiceDate: "2026-10-01", limit: 60000 };
    expect(validatePayment(pay, ctx)).toEqual({
      ok: true,
      value: { invoiceId: "i1", kind: "BAYAR", amount: 40000, method: "TRANSFER", paidAt: "2026-10-07", reference: "TRF-1" },
    });
    expect(validatePayment({ ...pay, amount: 60001 }, ctx)).toEqual({ ok: false, message: "Nominal melebihi sisa hutang (Rp 60.000)." });
    expect(validatePayment({ ...pay, kind: "PENGEMBALIAN", amount: 70000 }, ctx)).toEqual({
      ok: false,
      message: "Nominal melebihi kredit dari supplier (Rp 60.000).",
    });
    expect(validatePayment(pay, { ...ctx, limit: 0 })).toEqual({ ok: false, message: "Faktur ini tidak punya sisa hutang." });
    expect(validatePayment({ ...pay, kind: "PENGEMBALIAN" }, { ...ctx, limit: 0 })).toEqual({
      ok: false,
      message: "Faktur ini tidak punya kredit dari supplier.",
    });
    expect(validatePayment({ ...pay, amount: 0 }, ctx)).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
    expect(validatePayment({ ...pay, method: "CEK" }, ctx)).toEqual({ ok: false, message: "Pilih metode pembayaran." });
    expect(validatePayment({ ...pay, paidAt: "2026-10-08" }, ctx)).toEqual({ ok: false, message: "Tanggal bayar tidak boleh di masa depan." });
    expect(validatePayment({ ...pay, paidAt: "2026-09-30" }, ctx)).toEqual({
      ok: false,
      message: "Tanggal bayar tidak boleh sebelum tanggal faktur.",
    });
  });

  it("alasan wajib dan jatuh tempo baru tidak sebelum tanggal faktur", () => {
    expect(validateReason("  salah input  ")).toEqual({ ok: true, value: "salah input" });
    expect(validateReason(" ")).toEqual({ ok: false, message: "Isi alasan." });
    expect(validateDueDateChange("2026-11-30", "2026-10-01")).toEqual({ ok: true, value: "2026-11-30" });
    expect(validateDueDateChange("2026-09-30", "2026-10-01")).toEqual({
      ok: false,
      message: "Jatuh tempo tidak boleh sebelum tanggal faktur.",
    });
    expect(validateDueDateChange("", "2026-10-01")).toEqual({ ok: false, message: "Isi tanggal jatuh tempo." });
  });
});
```

Run: `npx vitest run tests/unit/stock.test.ts`
Expected: FAIL, karena modul `@/lib/stock` tidak ditemukan.

- [ ] **Step 2: Tulis modulnya**

Buat `src/lib/stock.ts`:

```ts
import { formatDateWithYear, formatRupiah } from "./format";
import { addDaysToDateString } from "./time";

// Aturan murni stok dan hutang (spec stok 4.2). Dipakai server dan browser; tanpa akses basis data.

export type StockItemKindValue = "OBAT" | "PRODUK";
export type AdjustReasonValue = "RUSAK" | "HILANG" | "KEDALUWARSA" | "SELISIH_HITUNG" | "LAINNYA";
export type PaymentMethodValue = "TUNAI" | "TRANSFER" | "QRIS";
export type SupplierPaymentKindValue = "BAYAR" | "PENGEMBALIAN";
export type StockMovementKindValue = "MASUK" | "RETUR" | "PENYESUAIAN";
export type StockFlag = "MENIPIS" | "SEGERA_KEDALUWARSA" | "KEDALUWARSA";
export type PayableStatus = "DIBATALKAN" | "LUNAS" | "KREDIT" | "SEBAGIAN" | "BELUM_DIBAYAR";
export type PayableView = "BELUM_LUNAS" | "TERLAMBAT" | "JATUH_TEMPO" | "LUNAS" | "DIBATALKAN";
export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

export const STOCK_ITEM_KIND_LABEL: Record<StockItemKindValue, string> = { OBAT: "Obat", PRODUK: "Produk" };
export const ADJUST_REASON_LABEL: Record<AdjustReasonValue, string> = {
  RUSAK: "Rusak",
  HILANG: "Hilang",
  KEDALUWARSA: "Kedaluwarsa dibuang",
  SELISIH_HITUNG: "Selisih hitung",
  LAINNYA: "Lainnya",
};
export const MOVEMENT_KIND_LABEL: Record<StockMovementKindValue, string> = {
  MASUK: "Masuk",
  RETUR: "Retur ke supplier",
  PENYESUAIAN: "Penyesuaian",
};
export const PAYMENT_METHOD_LABEL: Record<PaymentMethodValue, string> = {
  TUNAI: "Tunai",
  TRANSFER: "Transfer bank",
  QRIS: "QRIS",
};
export const PAYMENT_KIND_LABEL: Record<SupplierPaymentKindValue, string> = {
  BAYAR: "Pembayaran",
  PENGEMBALIAN: "Pengembalian dana",
};
export const STOCK_FLAG_LABEL: Record<StockFlag, string> = {
  MENIPIS: "Menipis",
  SEGERA_KEDALUWARSA: "Segera kedaluwarsa",
  KEDALUWARSA: "Kedaluwarsa",
};
export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  DIBATALKAN: "Dibatalkan",
  LUNAS: "Lunas",
  KREDIT: "Kredit dari supplier",
  SEBAGIAN: "Sebagian",
  BELUM_DIBAYAR: "Belum dibayar",
};
export const PAYABLE_VIEW_LABEL: Record<PayableView, string> = {
  BELUM_LUNAS: "Belum lunas",
  TERLAMBAT: "Terlambat",
  JATUH_TEMPO: "Jatuh tempo 7 hari",
  LUNAS: "Lunas",
  DIBATALKAN: "Dibatalkan",
};

export const DECREASE_REASONS: readonly AdjustReasonValue[] = ["RUSAK", "HILANG", "KEDALUWARSA", "LAINNYA"];
export const INCREASE_REASONS: readonly AdjustReasonValue[] = ["SELISIH_HITUNG"];
export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethodValue[];
export const PAYABLE_VIEWS = Object.keys(PAYABLE_VIEW_LABEL) as PayableView[];

export const EXPIRY_WARNING_DAYS = 60;
export const DEFAULT_DUE_DAYS = 30;
export const DUE_SOON_DAYS = 7;
export const MAX_PURCHASE_LINES = 100;
export const MAX_QUANTITY = 1_000_000;
export const MAX_AMOUNT = 2_000_000_000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODE_PATTERN = /^[A-Z0-9-]{1,30}$/;
const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const INVALID_PURCHASE = "Data barang masuk tidak sah. Muat ulang halaman lalu coba lagi.";

const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

/** Teks dari formulir, dipangkas. Kosong untuk null/undefined; null bila bukan teks. */
function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : null;
}

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---- Tanggal tanpa jam (@db.Date) -----------------------------------------------------------

/** Tanggal "YYYY-MM-DD" yang benar-benar ada (2026-02-31 ditolak). */
export function isDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_PATTERN.test(value) && addDaysToDateString(value, 0) === value;
}

/** "YYYY-MM-DD" → nilai kolom @db.Date (tengah malam UTC). */
export function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** Kolom @db.Date → "YYYY-MM-DD", dibaca dari UTC agar tidak bergeser hari. */
export function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-10-07" → "7 Okt 2026"; kosong → "—". */
export function dateLabel(value: string | null): string {
  return value ? formatDateWithYear(dateOnly(value)) : "—";
}

// ---- Hutang -----------------------------------------------------------------------------------

export type PayableInput = {
  total: number;
  cancelledAt: Date | null;
  dueDate: Date;
  payments: readonly { kind: SupplierPaymentKindValue; amount: number; revokedAt: Date | null }[];
  returns: readonly { total: number }[];
};

export type PayableSummary = {
  paid: number;
  refunded: number;
  returned: number;
  /** Sisa hutang; negatif berarti kredit dari supplier. */
  balance: number;
  status: PayableStatus;
  overdue: boolean;
};

/** Sisa = total − pembayaran − retur + pengembalian dana (spec stok 4.2). Yang dibatalkan tidak dihitung. */
export function payableSummary(invoice: PayableInput, today: string): PayableSummary {
  let paid = 0;
  let refunded = 0;
  for (const payment of invoice.payments) {
    if (payment.revokedAt) continue;
    if (payment.kind === "BAYAR") paid += payment.amount;
    else refunded += payment.amount;
  }
  const returned = invoice.returns.reduce((sum, r) => sum + r.total, 0);
  const balance = invoice.total - paid - returned + refunded;
  const status: PayableStatus = invoice.cancelledAt
    ? "DIBATALKAN"
    : balance === 0
      ? "LUNAS"
      : balance < 0
        ? "KREDIT"
        : paid > 0 || returned > 0
          ? "SEBAGIAN"
          : "BELUM_DIBAYAR";
  const overdue = status !== "DIBATALKAN" && balance > 0 && dateOnlyString(invoice.dueDate) < today;
  return { paid, refunded, returned, balance, status, overdue };
}

export function isPayableView(value: unknown): value is PayableView {
  return typeof value === "string" && (PAYABLE_VIEWS as string[]).includes(value);
}

/** Saringan daftar hutang (spec stok 6.1). */
export function matchesPayableView(
  row: { status: PayableStatus; overdue: boolean; balance: number; dueDate: string },
  view: PayableView,
  today: string,
): boolean {
  switch (view) {
    case "BELUM_LUNAS":
      return row.status === "BELUM_DIBAYAR" || row.status === "SEBAGIAN" || row.status === "KREDIT";
    case "TERLAMBAT":
      return row.overdue;
    case "JATUH_TEMPO":
      return row.balance > 0 && !row.overdue && row.dueDate <= addDaysToDateString(today, DUE_SOON_DAYS);
    case "LUNAS":
      return row.status === "LUNAS";
    case "DIBATALKAN":
      return row.status === "DIBATALKAN";
  }
}

/** Terlambat paling atas, lalu jatuh tempo terdekat. */
export function comparePayables(a: { overdue: boolean; dueDate: string }, b: { overdue: boolean; dueDate: string }): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  return a.dueDate.localeCompare(b.dueDate);
}

// ---- Stok -------------------------------------------------------------------------------------

export type StockFlags = {
  /** Semua sisa, termasuk batch kedaluwarsa. */
  onHand: number;
  /** Sisa yang masih boleh dipakai: tanpa batch kedaluwarsa. */
  available: number;
  /** Σ sisa × harga beli. */
  value: number;
  low: boolean;
  expiringSoon: boolean;
  expired: boolean;
};

/** Tanda stok satu barang di satu cabang (spec stok 4.2). `today` adalah tanggal WITA. */
export function stockFlags(
  batches: readonly { quantityRemaining: number; expiryDate: Date | null; unitCost: number }[],
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
    if (batch.quantityRemaining <= 0) continue;
    onHand += batch.quantityRemaining;
    value += batch.quantityRemaining * batch.unitCost;
    const expiry = batch.expiryDate ? dateOnlyString(batch.expiryDate) : null;
    if (expiry !== null && expiry < today) {
      expired = true;
      continue;
    }
    available += batch.quantityRemaining;
    if (expiry !== null && expiry <= warnUntil) expiringSoon = true;
  }
  return { onHand, available, value, low: minStock > 0 && available <= minStock, expiringSoon, expired };
}

export function flagsOf(flags: StockFlags): StockFlag[] {
  const list: StockFlag[] = [];
  if (flags.low) list.push("MENIPIS");
  if (flags.expiringSoon) list.push("SEGERA_KEDALUWARSA");
  if (flags.expired) list.push("KEDALUWARSA");
  return list;
}

export function isStockFlag(value: unknown): value is StockFlag {
  return value === "MENIPIS" || value === "SEGERA_KEDALUWARSA" || value === "KEDALUWARSA";
}

/** Ringkasan di atas daftar barang: nilai stok dan jumlah barang per tanda. */
export function summarizeStock(rows: readonly StockFlags[]): { value: number; low: number; expiringSoon: number; expired: number } {
  return rows.reduce(
    (sum, row) => ({
      value: sum.value + row.value,
      low: sum.low + (row.low ? 1 : 0),
      expiringSoon: sum.expiringSoon + (row.expiringSoon ? 1 : 0),
      expired: sum.expired + (row.expired ? 1 : 0),
    }),
    { value: 0, low: 0, expiringSoon: 0, expired: 0 },
  );
}

// ---- Validasi formulir (diulang di server) ------------------------------------------------------

export type StockItemInput = {
  code: string;
  name: string;
  kind: StockItemKindValue;
  unit: string;
  sellPrice: number | null;
  minStock: number;
  notes: string;
};
export type ValidStockItem = Omit<StockItemInput, "notes"> & { notes: string | null };

export function validateStockItem(raw: unknown): Validation<ValidStockItem> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  const code = cleanText(raw.code)?.toUpperCase() ?? null;
  const name = cleanText(raw.name);
  const unit = cleanText(raw.unit);
  const notes = cleanText(raw.notes);
  if (code === null || name === null || unit === null || notes === null) return fail(INVALID_FORM);
  if (!code) return fail("Isi kode barang.");
  if (!CODE_PATTERN.test(code)) return fail("Kode hanya huruf, angka, dan tanda hubung, paling banyak 30 karakter.");
  if (!name) return fail("Isi nama barang.");
  if (name.length > 120) return fail("Nama barang paling banyak 120 karakter.");
  if (raw.kind !== "OBAT" && raw.kind !== "PRODUK") return fail("Pilih jenis barang.");
  if (!unit) return fail("Isi satuan, mis. tablet atau botol.");
  if (unit.length > 30) return fail("Satuan paling banyak 30 karakter.");
  const sellPrice = raw.sellPrice === null || raw.sellPrice === undefined ? null : raw.sellPrice;
  if (sellPrice !== null && !isWhole(sellPrice, 0, MAX_AMOUNT)) return fail("Harga jual tidak sah.");
  if (!isWhole(raw.minStock, 0, MAX_QUANTITY)) return fail("Batas menipis harus bilangan bulat 0 atau lebih.");
  if (notes.length > 500) return fail("Catatan paling banyak 500 karakter.");
  return {
    ok: true,
    value: { code, name, kind: raw.kind, unit, sellPrice, minStock: raw.minStock, notes: notes || null },
  };
}

export type SupplierInput = { name: string; phone: string; address: string; notes: string };
export type ValidSupplier = { name: string; phone: string | null; address: string | null; notes: string | null };

export function validateSupplier(raw: unknown): Validation<ValidSupplier> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  const name = cleanText(raw.name);
  const phone = cleanText(raw.phone);
  const address = cleanText(raw.address);
  const notes = cleanText(raw.notes);
  if (name === null || phone === null || address === null || notes === null) return fail(INVALID_FORM);
  if (!name) return fail("Isi nama supplier.");
  if (name.length > 120) return fail("Nama supplier paling banyak 120 karakter.");
  if (phone.length > 30) return fail("Nomor telepon paling banyak 30 karakter.");
  if (address.length > 300) return fail("Alamat paling banyak 300 karakter.");
  if (notes.length > 500) return fail("Catatan paling banyak 500 karakter.");
  return { ok: true, value: { name, phone: phone || null, address: address || null, notes: notes || null } };
}

export type PurchaseLineInput = { itemId: string; quantity: number; unitCost: number; batchNumber: string; expiryDate: string };
export type PurchaseInput = {
  supplierId: string;
  branchId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  notes: string;
  lines: PurchaseLineInput[];
};
export type ValidPurchaseLine = {
  itemId: string;
  quantity: number;
  unitCost: number;
  batchNumber: string | null;
  expiryDate: string | null;
};
export type ValidPurchase = {
  supplierId: string;
  branchId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  notes: string | null;
  lines: ValidPurchaseLine[];
  total: number;
};

/**
 * Barang masuk (spec stok 5.2). `kindOf` mengembalikan jenis barang yang aktif, atau null bila
 * barangnya tidak ada atau nonaktif.
 */
export function validatePurchase(
  raw: unknown,
  ctx: { today: string; kindOf: (itemId: string) => StockItemKindValue | null },
): Validation<ValidPurchase> {
  if (!isObject(raw)) return fail(INVALID_PURCHASE);
  if (typeof raw.supplierId !== "string" || !raw.supplierId) return fail("Pilih supplier.");
  if (typeof raw.branchId !== "string" || !raw.branchId) return fail("Pilih cabang penerima.");
  const invoiceNumber = cleanText(raw.invoiceNumber);
  const notes = cleanText(raw.notes);
  if (invoiceNumber === null || notes === null) return fail(INVALID_PURCHASE);
  if (!invoiceNumber) return fail("Isi nomor faktur.");
  if (invoiceNumber.length > 60) return fail("Nomor faktur paling banyak 60 karakter.");
  if (!isDateString(raw.invoiceDate)) return fail("Isi tanggal faktur.");
  if (raw.invoiceDate > ctx.today) return fail("Tanggal faktur tidak boleh di masa depan.");
  if (!isDateString(raw.dueDate)) return fail("Isi tanggal jatuh tempo.");
  if (raw.dueDate < raw.invoiceDate) return fail("Jatuh tempo tidak boleh sebelum tanggal faktur.");
  if (notes.length > 500) return fail("Catatan paling banyak 500 karakter.");
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) return fail("Tambahkan minimal satu barang.");
  if (raw.lines.length > MAX_PURCHASE_LINES) return fail("Paling banyak 100 baris per faktur.");

  const lines: ValidPurchaseLine[] = [];
  let total = 0;
  for (const [index, line] of raw.lines.entries()) {
    const n = index + 1;
    if (!isObject(line)) return fail(INVALID_PURCHASE);
    const kind = typeof line.itemId === "string" ? ctx.kindOf(line.itemId) : null;
    if (kind === null) return fail(`Baris ${n}: pilih barang yang aktif.`);
    if (!isWhole(line.quantity, 1, MAX_QUANTITY)) return fail(`Baris ${n}: jumlah harus bilangan bulat lebih dari 0.`);
    if (!isWhole(line.unitCost, 0, MAX_AMOUNT)) return fail(`Baris ${n}: harga beli tidak sah.`);
    const batchNumber = cleanText(line.batchNumber);
    if (batchNumber === null) return fail(INVALID_PURCHASE);
    if (batchNumber.length > 60) return fail(`Baris ${n}: nomor batch paling banyak 60 karakter.`);
    const rawExpiry = line.expiryDate === undefined || line.expiryDate === null ? "" : line.expiryDate;
    let expiryDate: string | null = null;
    if (rawExpiry !== "") {
      if (!isDateString(rawExpiry)) return fail(`Baris ${n}: tanggal kedaluwarsa tidak sah.`);
      expiryDate = rawExpiry;
    }
    if (kind === "OBAT" && expiryDate === null) return fail(`Baris ${n}: isi tanggal kedaluwarsa obat.`);
    if (expiryDate !== null && expiryDate < ctx.today) return fail(`Baris ${n}: barang ini sudah kedaluwarsa.`);
    total += line.quantity * line.unitCost;
    if (total > MAX_AMOUNT) return fail("Total faktur terlalu besar.");
    lines.push({
      itemId: line.itemId as string,
      quantity: line.quantity,
      unitCost: line.unitCost,
      batchNumber: batchNumber || null,
      expiryDate,
    });
  }
  return {
    ok: true,
    value: {
      supplierId: raw.supplierId,
      branchId: raw.branchId,
      invoiceNumber,
      invoiceDate: raw.invoiceDate,
      dueDate: raw.dueDate,
      notes: notes || null,
      lines,
      total,
    },
  };
}

export type AdjustmentInput = {
  batchId: string;
  direction: "KURANGI" | "TAMBAH";
  quantity: number;
  reason: AdjustReasonValue;
  note: string;
};
export type ValidAdjustment = { batchId: string; delta: number; reason: AdjustReasonValue; note: string | null };

/** Penyesuaian stok (spec stok 5.4): arah menentukan tanda jumlah dan alasan yang boleh. */
export function validateAdjustment(raw: unknown): Validation<ValidAdjustment> {
  if (!isObject(raw) || typeof raw.batchId !== "string" || !raw.batchId) return fail(INVALID_FORM);
  if (raw.direction !== "KURANGI" && raw.direction !== "TAMBAH") return fail(INVALID_FORM);
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  const allowed = raw.direction === "KURANGI" ? DECREASE_REASONS : INCREASE_REASONS;
  if (!(allowed as readonly unknown[]).includes(raw.reason)) return fail("Pilih alasan penyesuaian.");
  const reason = raw.reason as AdjustReasonValue;
  const note = cleanText(raw.note);
  if (note === null) return fail(INVALID_FORM);
  if (note.length > 500) return fail("Catatan paling banyak 500 karakter.");
  if ((reason === "LAINNYA" || reason === "SELISIH_HITUNG") && !note) return fail("Isi catatan untuk alasan ini.");
  return {
    ok: true,
    value: { batchId: raw.batchId, delta: raw.direction === "KURANGI" ? -raw.quantity : raw.quantity, reason, note: note || null },
  };
}

export type ReturnInput = { invoiceId: string; lines: { batchId: string; quantity: number }[]; note: string };
export type ValidReturn = { invoiceId: string; lines: { batchId: string; quantity: number }[]; note: string | null };

/** Retur ke supplier (spec stok 5.5). Batas sisa batch diperiksa server di dalam transaksi. */
export function validateReturn(raw: unknown): Validation<ValidReturn> {
  if (!isObject(raw) || typeof raw.invoiceId !== "string" || !raw.invoiceId) return fail(INVALID_FORM);
  if (!Array.isArray(raw.lines) || raw.lines.length > MAX_PURCHASE_LINES) return fail(INVALID_FORM);
  if (raw.lines.length === 0) return fail("Pilih minimal satu barang untuk diretur.");
  const seen = new Set<string>();
  const lines: { batchId: string; quantity: number }[] = [];
  for (const line of raw.lines) {
    if (!isObject(line) || typeof line.batchId !== "string" || !line.batchId) return fail(INVALID_FORM);
    if (!isWhole(line.quantity, 1, MAX_QUANTITY)) return fail("Jumlah retur harus bilangan bulat lebih dari 0.");
    if (seen.has(line.batchId)) return fail("Batch yang sama dipilih dua kali.");
    seen.add(line.batchId);
    lines.push({ batchId: line.batchId, quantity: line.quantity });
  }
  const note = cleanText(raw.note);
  if (note === null) return fail(INVALID_FORM);
  if (note.length > 500) return fail("Catatan paling banyak 500 karakter.");
  return { ok: true, value: { invoiceId: raw.invoiceId, lines, note: note || null } };
}

export type PaymentInput = {
  invoiceId: string;
  kind: SupplierPaymentKindValue;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  reference: string;
};
export type ValidPayment = Omit<PaymentInput, "reference"> & { reference: string | null };

/**
 * Pembayaran atau pengembalian dana (spec stok 6.2–6.3). `limit` = sisa hutang (BAYAR) atau
 * kredit dari supplier (PENGEMBALIAN), dihitung server di dalam transaksi yang mengunci faktur.
 */
export function validatePayment(raw: unknown, ctx: { today: string; invoiceDate: string; limit: number }): Validation<ValidPayment> {
  if (!isObject(raw) || typeof raw.invoiceId !== "string" || !raw.invoiceId) return fail(INVALID_FORM);
  if (raw.kind !== "BAYAR" && raw.kind !== "PENGEMBALIAN") return fail(INVALID_FORM);
  const kind = raw.kind;
  if (ctx.limit <= 0) {
    return fail(kind === "BAYAR" ? "Faktur ini tidak punya sisa hutang." : "Faktur ini tidak punya kredit dari supplier.");
  }
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail("Nominal harus bilangan bulat lebih dari 0.");
  if (raw.amount > ctx.limit) {
    return fail(
      kind === "BAYAR"
        ? `Nominal melebihi sisa hutang (${formatRupiah(ctx.limit)}).`
        : `Nominal melebihi kredit dari supplier (${formatRupiah(ctx.limit)}).`,
    );
  }
  if (!(PAYMENT_METHODS as unknown[]).includes(raw.method)) return fail("Pilih metode pembayaran.");
  if (!isDateString(raw.paidAt)) return fail("Isi tanggal bayar.");
  if (raw.paidAt > ctx.today) return fail("Tanggal bayar tidak boleh di masa depan.");
  if (raw.paidAt < ctx.invoiceDate) return fail("Tanggal bayar tidak boleh sebelum tanggal faktur.");
  const reference = cleanText(raw.reference);
  if (reference === null) return fail(INVALID_FORM);
  if (reference.length > 100) return fail("Referensi paling banyak 100 karakter.");
  return {
    ok: true,
    value: {
      invoiceId: raw.invoiceId,
      kind,
      amount: raw.amount,
      method: raw.method as PaymentMethodValue,
      paidAt: raw.paidAt,
      reference: reference || null,
    },
  };
}

/** Alasan wajib untuk batal faktur, batal pembayaran, dan ubah jatuh tempo. */
export function validateReason(raw: unknown): Validation<string> {
  const reason = cleanText(raw);
  if (!reason) return fail("Isi alasan.");
  if (reason.length > 300) return fail("Alasan paling banyak 300 karakter.");
  return { ok: true, value: reason };
}

export function validateDueDateChange(raw: unknown, invoiceDate: string): Validation<string> {
  if (!isDateString(raw)) return fail("Isi tanggal jatuh tempo.");
  if (raw < invoiceDate) return fail("Jatuh tempo tidak boleh sebelum tanggal faktur.");
  return { ok: true, value: raw };
}
```

Run: `npx vitest run tests/unit/stock.test.ts`
Expected: PASS semua.

- [ ] **Step 3: Lint, tipe, commit**

Run: `npx eslint src/lib/stock.ts tests/unit/stock.test.ts; npx tsc --noEmit -p . > "$WS/t2-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: eslint bersih, `tsc exit 0`.

```bash
git add src/lib/stock.ts tests/unit/stock.test.ts
git commit -m "feat: add stock and payable rules (balances, stock flags, form validation)"
```

---

### Task 3: Server — barang dan supplier (aksi + pembacaan)

**Files:**
- Create: `src/server/stock-store.ts`, `src/server/stock-catalog.ts`, `src/server/stock-read.ts`
- Test: `tests/integration/stock-catalog.test.ts`

**Interfaces:**
- Consumes: Task 1 (model, peran, `stock-world.ts`), Task 2 (`validateStockItem`, `validateSupplier`, `stockFlags`, `flagsOf`, `payableSummary`, `STOCK_ITEM_KIND_LABEL`, tipe `StockFlag`, `StockFlags`, `StockItemKindValue`, `StockItemInput`, `SupplierInput`, `AdjustReasonValue`, `StockMovementKindValue`).
- Produces:
  - `src/server/stock-store.ts` (tanpa `"use server"`): `PAYABLE_SELECT` (pilihan kolom Prisma untuk `payableSummary`: `total`, `cancelledAt`, `dueDate`, `payments{kind,amount,revokedAt}`, `returns{total}`);
  - `src/server/stock-catalog.ts` (`"use server"`, `stock:manage`):
    - `createStockItem(input: StockItemInput): Promise<ActionResult<{ id: string }>>`, `updateStockItem(id: string, input: StockItemInput): Promise<ActionResult<void>>`, `setStockItemActive(id: string, active: boolean): Promise<ActionResult<void>>`;
    - `createSupplier(input: SupplierInput): Promise<ActionResult<{ id: string; name: string }>>`, `updateSupplier(id: string, input: SupplierInput): Promise<ActionResult<void>>`, `setSupplierActive(id: string, active: boolean): Promise<ActionResult<void>>`;
  - `src/server/stock-read.ts` (tanpa `"use server"`):
    - `listStockItems(filter: StockListFilter): Promise<StockItemRow[]>` (`stock:read`), `StockListFilter = { branchId: string; kind?: StockItemKindValue; flag?: StockFlag | "NONAKTIF"; q?: string }`, `StockItemRow = StockFlags & { id; code; name; kind; unit; sellPrice: number | null; minStock: number; isActive: boolean; flags: StockFlag[] }`;
    - `getStockItemDetail(id: string): Promise<StockItemDetail | null>` (`stock:read`), dengan `StockItemDetail = { item: { id; code; name; kind; unit; sellPrice; minStock; isActive; notes }; batches: StockBatchRow[]; movements: StockMovementRow[] }`;
    - `listSuppliers(): Promise<SupplierRow[]>` (`stock:read`; `balance` hanya untuk `payable:manage`, selain itu `null`);
    - `listStockItemOptions(): Promise<StockItemOption[]>` dan `listSupplierOptions(): Promise<SupplierOption[]>` (`stock:manage`; hanya yang aktif);
    - `countStockAlerts(): Promise<{ low: number; expiringSoon: number; expired: number }>` (`stock:read`; jumlah barang aktif yang bertanda di salah satu cabang aktif).

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/stock-catalog.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import {
  createStockItem,
  createSupplier,
  setStockItemActive,
  setSupplierActive,
  updateStockItem,
  updateSupplier,
} from "@/server/stock-catalog";
import { countStockAlerts, getStockItemDetail, listStockItems, listSuppliers } from "@/server/stock-read";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "DOKTER";
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

const SLUG = "katalog-stok";
const CODE = SLUG.toUpperCase();
const today = witaDateString(new Date());
const item = (patch: Record<string, unknown> = {}) => ({
  code: `${CODE}-BARU`,
  name: `${SLUG} Vitamin C`,
  kind: "PRODUK" as const,
  unit: "botol",
  sellPrice: 50000,
  minStock: 5,
  notes: "",
  ...patch,
});

describe("barang dan supplier", () => {
  let world: StockWorld;

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

  it("menambah barang, menolak kode ganda, mengubah, dan menonaktifkan", async () => {
    const { id } = await unwrap(createStockItem(item()));
    const saved = await prisma.stockItem.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({ code: `${CODE}-BARU`, kind: "PRODUK", sellPrice: 50000, minStock: 5, isActive: true });
    expect(await prisma.auditLog.count({ where: { action: "stock-item.create", entityId: id } })).toBe(1);

    expect(await createStockItem(item({ code: `${CODE.toLowerCase()}-baru` }))).toEqual({
      ok: false,
      error: `Kode barang ${CODE}-BARU sudah dipakai.`,
    });

    await unwrap(updateStockItem(id, item({ name: `${SLUG} Vitamin C 1000`, sellPrice: null })));
    expect(await prisma.stockItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: `${SLUG} Vitamin C 1000`, sellPrice: null });

    await unwrap(setStockItemActive(id, false));
    const active = await listStockItems({ branchId: world.branchId, q: SLUG });
    const inactive = await listStockItems({ branchId: world.branchId, flag: "NONAKTIF", q: SLUG });
    expect(active.map((row) => row.id)).not.toContain(id);
    expect(inactive.map((row) => row.id)).toContain(id);
    expect(await prisma.auditLog.count({ where: { action: "stock-item.update", entityId: id } })).toBe(2);
  });

  it("menolak barang yang tidak sah di server", async () => {
    expect(await createStockItem(item({ code: "" }))).toEqual({ ok: false, error: "Isi kode barang." });
    expect(await updateStockItem("tidak-ada", item())).toEqual({ ok: false, error: "Barang tidak ditemukan." });
  });

  it("daftar barang per cabang: stok tersedia, tanda, nilai, saringan jenis dan pencarian", async () => {
    await seedBatch(world, { invoiceNumber: "KT-1", itemId: world.drugId, quantity: 8, unitCost: 1500, expiryDate: addDaysToDateString(today, 30) });
    await seedBatch(world, { invoiceNumber: "KT-2", itemId: world.drugId, quantity: 3, unitCost: 1500, expiryDate: addDaysToDateString(today, -1) });
    await seedBatch(world, { invoiceNumber: "KT-3", itemId: world.productId, quantity: 4, unitCost: 90000 });
    await seedBatch(world, { invoiceNumber: "KT-4", itemId: world.productId, quantity: 50, branchId: world.comingSoonBranchId });

    const rows = await listStockItems({ branchId: world.branchId, q: SLUG });
    const drug = rows.find((row) => row.id === world.drugId)!;
    const product = rows.find((row) => row.id === world.productId)!;
    expect(drug).toMatchObject({ onHand: 11, available: 8, value: 11 * 1500, flags: ["MENIPIS", "SEGERA_KEDALUWARSA", "KEDALUWARSA"] });
    expect(product).toMatchObject({ onHand: 4, available: 4, flags: [] });

    expect((await listStockItems({ branchId: world.branchId, kind: "OBAT", q: SLUG })).map((r) => r.id)).toEqual([world.drugId]);
    expect((await listStockItems({ branchId: world.branchId, flag: "KEDALUWARSA", q: SLUG })).map((r) => r.id)).toEqual([world.drugId]);
    expect((await listStockItems({ branchId: world.branchId, q: `${CODE}-prd` })).map((r) => r.id)).toEqual([world.productId]);
  });

  it("detail barang: batch per cabang dengan faktur asal, dan jurnal", async () => {
    const detail = await getStockItemDetail(world.drugId);
    expect(detail?.item).toMatchObject({ code: `${CODE}-OBT`, kind: "OBAT", unit: "kapsul" });
    expect(detail?.batches.map((b) => [b.invoiceNumber, b.quantityRemaining, b.expired])).toEqual([
      ["KT-2", 3, true],
      ["KT-1", 8, false],
    ]);
    expect(detail?.movements.every((m) => m.kind === "MASUK")).toBe(true);
    expect(await getStockItemDetail("tidak-ada")).toBeNull();
  });

  it("hitungan tanda stok untuk dasbor bertambah oleh barang di cabang aktif saja", async () => {
    const before = await countStockAlerts();
    const extra = await prisma.stockItem.create({
      data: { code: `${CODE}-HIT`, name: `${SLUG} Hitung`, kind: "PRODUK", unit: "pcs", minStock: 0 },
    });
    await seedBatch(world, { invoiceNumber: "KT-5", itemId: extra.id, quantity: 1, expiryDate: addDaysToDateString(today, -2) });
    await seedBatch(world, { invoiceNumber: "KT-6", itemId: extra.id, quantity: 1, expiryDate: addDaysToDateString(today, -2), branchId: world.comingSoonBranchId });
    const after = await countStockAlerts();
    expect(after.expired - before.expired).toBe(1);
  });

  it("supplier: tambah, ubah, nonaktifkan; sisa hutang hanya terlihat oleh keuangan", async () => {
    const created = await unwrap(createSupplier({ name: `${SLUG} Medika`, phone: "0812", address: "", notes: "" }));
    expect(created.name).toBe(`${SLUG} Medika`);
    await unwrap(updateSupplier(created.id, { name: `${SLUG} Medika Jaya`, phone: "0812", address: "Manado", notes: "" }));
    await unwrap(setSupplierActive(created.id, false));
    expect(await prisma.supplier.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ name: `${SLUG} Medika Jaya`, isActive: false });
    expect(await createSupplier({ name: " ", phone: "", address: "", notes: "" })).toEqual({ ok: false, error: "Isi nama supplier." });

    const forPharmacist = (await listSuppliers()).find((s) => s.id === world.supplierId);
    expect(forPharmacist?.balance).toBeNull();
    actor.role = "ADMIN_KEUANGAN";
    const forFinance = (await listSuppliers()).find((s) => s.id === world.supplierId);
    // KT-1..KT-6: 8×1500 + 3×1500 + 4×90000 + 50×1000 + 1×1000 + 1×1000
    expect(forFinance?.balance).toBe(12000 + 4500 + 360000 + 50000 + 1000 + 1000);
  });

  it("hak akses: Admin Keuangan tidak mengubah barang; Resepsionis dan Dokter tidak membaca stok", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await expect(createStockItem(item({ code: `${CODE}-X` }))).rejects.toThrow(/forbidden: stock:manage/);
    await expect(createSupplier({ name: `${SLUG} X`, phone: "", address: "", notes: "" })).rejects.toThrow(/forbidden: stock:manage/);
    for (const role of ["RESEPSIONIS", "DOKTER"] as const) {
      actor.role = role;
      await expect(listStockItems({ branchId: world.branchId })).rejects.toThrow(/forbidden: stock:read/);
      await expect(listSuppliers()).rejects.toThrow(/forbidden: stock:read/);
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/stock-catalog.test.ts`
Expected: FAIL, karena modul `@/server/stock-catalog` tidak ditemukan.

- [ ] **Step 2: Pembantu server**

Buat `src/server/stock-store.ts`:

```ts
// Tanpa "use server": pembantu server untuk stok dan hutang, tidak dipanggil browser.

/** Kolom faktur yang dibutuhkan payableSummary (src/lib/stock.ts). */
export const PAYABLE_SELECT = {
  total: true,
  cancelledAt: true,
  dueDate: true,
  payments: { select: { kind: true, amount: true, revokedAt: true } },
  returns: { select: { total: true } },
} as const;
```

- [ ] **Step 3: Aksi barang dan supplier**

Buat `src/server/stock-catalog.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import {
  STOCK_ITEM_KIND_LABEL,
  validateStockItem,
  validateSupplier,
  type StockItemInput,
  type SupplierInput,
} from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

function revalidateStock(itemId?: string) {
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath("/admin");
  if (itemId) safeRevalidatePath(`/admin/stok/barang/${itemId}`);
}

/** Barang baru (spec stok 5.1). Kode unik; pesan galat menyebut kodenya. */
export async function createStockItem(input: StockItemInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateStockItem(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const item = checked.value;
    let id: string;
    try {
      id = (await prisma.stockItem.create({ data: item, select: { id: true } })).id;
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError(`Kode barang ${item.code} sudah dipakai.`);
      throw error;
    }
    await recordAudit({
      actor,
      action: "stock-item.create",
      entity: "StockItem",
      entityId: id,
      summary: `${item.code} ${item.name} (${STOCK_ITEM_KIND_LABEL[item.kind]})`,
    });
    revalidateStock();
    return { id };
  });
}

export async function updateStockItem(id: string, input: StockItemInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateStockItem(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const item = checked.value;
    const existing = await prisma.stockItem.findUnique({ where: { id: String(id ?? "") }, select: { id: true } });
    if (!existing) throw new UserFacingError("Barang tidak ditemukan.");
    try {
      await prisma.stockItem.update({ where: { id: existing.id }, data: item });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError(`Kode barang ${item.code} sudah dipakai.`);
      throw error;
    }
    await recordAudit({ actor, action: "stock-item.update", entity: "StockItem", entityId: existing.id, summary: `${item.code} ${item.name}` });
    revalidateStock(existing.id);
  });
}

/** Barang tidak pernah dihapus: riwayat stoknya harus tetap ada (spec stok 5.1). */
export async function setStockItemActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const existing = await prisma.stockItem.findUnique({ where: { id: String(id ?? "") }, select: { id: true, code: true } });
    if (!existing) throw new UserFacingError("Barang tidak ditemukan.");
    await prisma.stockItem.update({ where: { id: existing.id }, data: { isActive: active === true } });
    await recordAudit({
      actor,
      action: "stock-item.update",
      entity: "StockItem",
      entityId: existing.id,
      summary: `${existing.code}: ${active === true ? "diaktifkan" : "dinonaktifkan"}`,
    });
    revalidateStock(existing.id);
  });
}

export async function createSupplier(input: SupplierInput): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateSupplier(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const created = await prisma.supplier.create({ data: checked.value, select: { id: true, name: true } });
    await recordAudit({ actor, action: "supplier.create", entity: "Supplier", entityId: created.id, summary: created.name });
    safeRevalidatePath("/admin/stok");
    return created;
  });
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateSupplier(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const existing = await prisma.supplier.findUnique({ where: { id: String(id ?? "") }, select: { id: true } });
    if (!existing) throw new UserFacingError("Supplier tidak ditemukan.");
    await prisma.supplier.update({ where: { id: existing.id }, data: checked.value });
    await recordAudit({ actor, action: "supplier.update", entity: "Supplier", entityId: existing.id, summary: checked.value.name });
    safeRevalidatePath("/admin/stok");
    safeRevalidatePath("/admin/hutang");
  });
}

/** Supplier nonaktif tidak bisa dipilih untuk barang masuk baru; faktur dan hutangnya tetap tampil. */
export async function setSupplierActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const existing = await prisma.supplier.findUnique({ where: { id: String(id ?? "") }, select: { id: true, name: true } });
    if (!existing) throw new UserFacingError("Supplier tidak ditemukan.");
    await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: active === true } });
    await recordAudit({
      actor,
      action: "supplier.update",
      entity: "Supplier",
      entityId: existing.id,
      summary: `${existing.name}: ${active === true ? "diaktifkan" : "dinonaktifkan"}`,
    });
    safeRevalidatePath("/admin/stok");
  });
}
```

- [ ] **Step 4: Pembacaan untuk halaman**

Buat `src/server/stock-read.ts`:

```ts
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  dateOnlyString,
  flagsOf,
  payableSummary,
  stockFlags,
  type AdjustReasonValue,
  type StockFlag,
  type StockFlags,
  type StockItemKindValue,
  type StockMovementKindValue,
} from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { PAYABLE_SELECT } from "@/server/stock-store";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

export type StockListFilter = { branchId: string; kind?: StockItemKindValue; flag?: StockFlag | "NONAKTIF"; q?: string };

export type StockItemRow = StockFlags & {
  id: string;
  code: string;
  name: string;
  kind: StockItemKindValue;
  unit: string;
  sellPrice: number | null;
  minStock: number;
  isActive: boolean;
  flags: StockFlag[];
};

const BATCH_STOCK_SELECT = { quantityRemaining: true, expiryDate: true, unitCost: true } as const;

/** Daftar barang satu cabang (spec stok 5.1). Bawaannya barang aktif; "NONAKTIF" menampilkan yang nonaktif. */
export async function listStockItems(filter: StockListFilter): Promise<StockItemRow[]> {
  await requireCapability("stock:read");
  const today = witaDateString(new Date());
  const q = filter.q?.trim();
  const items = await prisma.stockItem.findMany({
    where: {
      isActive: filter.flag !== "NONAKTIF",
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q.toUpperCase() } }] } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      kind: true,
      unit: true,
      sellPrice: true,
      minStock: true,
      isActive: true,
      batches: { where: { branchId: filter.branchId, quantityRemaining: { gt: 0 } }, select: BATCH_STOCK_SELECT },
    },
  });
  const rows = items.map(({ batches, ...item }) => {
    const flags = stockFlags(batches, item.minStock, today);
    return { ...item, ...flags, flags: flagsOf(flags) };
  });
  const flag = filter.flag;
  return flag && flag !== "NONAKTIF" ? rows.filter((row) => row.flags.includes(flag)) : rows;
}

export type StockBatchRow = {
  id: string;
  branchName: string;
  batchNumber: string | null;
  expiryDate: string | null;
  expired: boolean;
  unitCost: number;
  quantityReceived: number;
  quantityRemaining: number;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  invoiceCancelled: boolean;
};

export type StockMovementRow = {
  id: string;
  createdAt: Date;
  kind: StockMovementKindValue;
  quantity: number;
  reason: AdjustReasonValue | null;
  note: string | null;
  staffName: string;
  batchNumber: string | null;
  branchName: string;
};

export type StockItemDetail = {
  item: {
    id: string;
    code: string;
    name: string;
    kind: StockItemKindValue;
    unit: string;
    sellPrice: number | null;
    minStock: number;
    isActive: boolean;
    notes: string | null;
  };
  batches: StockBatchRow[];
  movements: StockMovementRow[];
};

/** Detail barang (spec stok 5.3): batch bersisa di semua cabang, kedaluwarsa terdekat dulu, dan 100 jurnal terakhir. */
export async function getStockItemDetail(id: string): Promise<StockItemDetail | null> {
  await requireCapability("stock:read");
  const today = witaDateString(new Date());
  const item = await prisma.stockItem.findUnique({
    where: { id: String(id ?? "") },
    select: { id: true, code: true, name: true, kind: true, unit: true, sellPrice: true, minStock: true, isActive: true, notes: true },
  });
  if (!item) return null;
  const [batches, movements] = await Promise.all([
    prisma.stockBatch.findMany({
      where: { itemId: item.id, quantityRemaining: { gt: 0 } },
      orderBy: [{ branch: { sortOrder: "asc" } }, { expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true,
        batchNumber: true,
        expiryDate: true,
        unitCost: true,
        quantityReceived: true,
        quantityRemaining: true,
        branch: { select: { name: true } },
        purchaseLine: {
          select: { invoice: { select: { id: true, invoiceNumber: true, cancelledAt: true, supplier: { select: { name: true } } } } },
        },
      },
    }),
    prisma.stockMovement.findMany({
      where: { batch: { itemId: item.id } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        kind: true,
        quantity: true,
        reason: true,
        note: true,
        staffName: true,
        batch: { select: { batchNumber: true, branch: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    item,
    batches: batches.map((batch) => {
      const expiryDate = batch.expiryDate ? dateOnlyString(batch.expiryDate) : null;
      const invoice = batch.purchaseLine.invoice;
      return {
        id: batch.id,
        branchName: batch.branch.name,
        batchNumber: batch.batchNumber,
        expiryDate,
        expired: expiryDate !== null && expiryDate < today,
        unitCost: batch.unitCost,
        quantityReceived: batch.quantityReceived,
        quantityRemaining: batch.quantityRemaining,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.supplier.name,
        invoiceCancelled: invoice.cancelledAt !== null,
      };
    }),
    movements: movements.map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt,
      kind: movement.kind,
      quantity: movement.quantity,
      reason: movement.reason,
      note: movement.note,
      staffName: movement.staffName,
      batchNumber: movement.batch.batchNumber,
      branchName: movement.batch.branch.name,
    })),
  };
}

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  /** Sisa hutang (tanpa kredit); null bila pengguna tidak memegang payable:manage (spec stok 5.6). */
  balance: number | null;
};

export async function listSuppliers(): Promise<SupplierRow[]> {
  const actor = await requireCapability("stock:read");
  const withBalance = can(actor.role, "payable:manage");
  const today = witaDateString(new Date());
  const suppliers = await prisma.supplier.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, phone: true, address: true, notes: true, isActive: true },
  });
  if (!withBalance) return suppliers.map((supplier) => ({ ...supplier, balance: null }));

  const invoices = await prisma.purchaseInvoice.findMany({ select: { supplierId: true, ...PAYABLE_SELECT } });
  const balances = new Map<string, number>();
  for (const invoice of invoices) {
    const owed = Math.max(payableSummary(invoice, today).balance, 0);
    balances.set(invoice.supplierId, (balances.get(invoice.supplierId) ?? 0) + owed);
  }
  return suppliers.map((supplier) => ({ ...supplier, balance: balances.get(supplier.id) ?? 0 }));
}

export type StockItemOption = { id: string; code: string; name: string; unit: string; kind: StockItemKindValue };
export type SupplierOption = { id: string; name: string };

/** Barang aktif untuk formulir barang masuk. */
export async function listStockItemOptions(): Promise<StockItemOption[]> {
  await requireCapability("stock:manage");
  return prisma.stockItem.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, unit: true, kind: true },
  });
}

/** Supplier aktif untuk formulir barang masuk. */
export async function listSupplierOptions(): Promise<SupplierOption[]> {
  await requireCapability("stock:manage");
  return prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** Kotak Stok di dasbor (spec stok 8): barang aktif yang bertanda di salah satu cabang aktif. */
export async function countStockAlerts(): Promise<{ low: number; expiringSoon: number; expired: number }> {
  await requireCapability("stock:read");
  const today = witaDateString(new Date());
  const [branches, items] = await Promise.all([
    prisma.branch.findMany({ where: { status: "AKTIF" }, select: { id: true } }),
    prisma.stockItem.findMany({
      where: { isActive: true },
      select: {
        minStock: true,
        batches: { where: { quantityRemaining: { gt: 0 } }, select: { ...BATCH_STOCK_SELECT, branchId: true } },
      },
    }),
  ]);
  const counts = { low: 0, expiringSoon: 0, expired: 0 };
  for (const item of items) {
    const perBranch = branches.map((branch) =>
      stockFlags(
        item.batches.filter((batch) => batch.branchId === branch.id),
        item.minStock,
        today,
      ),
    );
    if (perBranch.some((flags) => flags.low)) counts.low += 1;
    if (perBranch.some((flags) => flags.expiringSoon)) counts.expiringSoon += 1;
    if (perBranch.some((flags) => flags.expired)) counts.expired += 1;
  }
  return counts;
}
```

Run: `npm run test:integration -- tests/integration/stock-catalog.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t3.log" 2>&1; grep -E "Test Files|Tests " "$WS/t3.log"; npx eslint src/server/stock-store.ts src/server/stock-catalog.ts src/server/stock-read.ts tests/integration/stock-catalog.test.ts; npx tsc --noEmit -p . > "$WS/t3-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/stock-store.ts src/server/stock-catalog.ts src/server/stock-read.ts tests/integration/stock-catalog.test.ts
git commit -m "feat: let pharmacists manage stock items and suppliers, and read stock per branch with flags"
```

---

### Task 4: Server — barang masuk (faktur pembelian) dan batalkan faktur

**Files:**
- Create: `src/server/purchases.ts`, `src/server/purchase-read.ts`
- Modify: `src/server/stock-store.ts`
- Test: `tests/integration/purchases.test.ts`

**Interfaces:**
- Consumes: Task 2 (`validatePurchase`, `validateReason`, `payableSummary`, `dateOnly`, `dateOnlyString`, tipe `PurchaseInput`, `PayableSummary`, `PayableStatus`, `PaymentMethodValue`, `SupplierPaymentKindValue`), Task 3 (`PAYABLE_SELECT`, pembantu uji `stock-world.ts`).
- Produces:
  - `stock-store.ts`: `lockInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<void>` (`SELECT … FOR UPDATE`);
  - `purchases.ts` (`"use server"`):
    - `createPurchase(input: PurchaseInput): Promise<ActionResult<{ id: string }>>` (`stock:manage`);
    - `cancelPurchase(input: { invoiceId: string; reason: string }): Promise<ActionResult<void>>` (`stock:manage` **atau** `payable:manage`);
  - `purchase-read.ts` (tanpa `"use server"`):
    - `listPurchases(): Promise<PurchaseRow[]>` (`stock:read`), `PurchaseRow = { id; invoiceDate: string; invoiceNumber; supplierName; branchName; total; lineCount: number; status: PayableStatus; overdue: boolean }`;
    - `getPurchaseDetail(id: string): Promise<PurchaseDetail | null>` (`stock:read`), dengan `PurchaseDetail = { id; supplierName; branchName; invoiceNumber; invoiceDate: string; dueDate: string; total; notes: string | null; createdByName; createdAt: Date; cancelledAt: Date | null; cancelledByName: string | null; cancelReason: string | null; lines: PurchaseLineRow[]; returns: SupplierReturnRow[]; summary: PayableSummary; payments: SupplierPaymentRow[] | null; canCancel: boolean }` — `payments` hanya untuk `payable:manage`;
    - `PurchaseLineRow = { id; itemId; itemCode; itemName; unit; quantity; unitCost; amount; batchNumber: string | null; expiryDate: string | null; batchId: string; batchRemaining: number }`;
    - `SupplierReturnRow = { id; createdAt: Date; staffName; note: string | null; total; lines: { itemName; batchNumber: string | null; quantity; amount }[] }`;
    - `SupplierPaymentRow = { id; kind: SupplierPaymentKindValue; amount; method: PaymentMethodValue; paidAt: string; reference: string | null; staffName; createdAt: Date; revokedAt: Date | null; revokedByName: string | null; revokeReason: string | null }`;
  - audit: `purchase.create`, `purchase.cancel`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/purchases.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { PurchaseInput } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getPurchaseDetail, listPurchases } from "@/server/purchase-read";
import { cancelPurchase, createPurchase } from "@/server/purchases";
import { cleanupStockWorld, createStockWorld, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "DOKTER";
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

const SLUG = "masuk-stok";
const today = witaDateString(new Date());
const nextYear = addDaysToDateString(today, 365);
const CANNOT_CANCEL =
  "Faktur tidak bisa dibatalkan karena sudah ada pembayaran, retur, atau stok yang terpakai. Koreksi lewat penyesuaian atau retur.";

describe("barang masuk dari supplier", () => {
  let world: StockWorld;
  let seq = 0;

  const purchase = (patch: Partial<PurchaseInput> = {}): PurchaseInput => {
    seq += 1;
    return {
      supplierId: world.supplierId,
      branchId: world.branchId,
      invoiceNumber: `MS-${seq}`,
      invoiceDate: today,
      dueDate: addDaysToDateString(today, 30),
      notes: "",
      lines: [
        { itemId: world.drugId, quantity: 10, unitCost: 5000, batchNumber: "B-01", expiryDate: nextYear },
        { itemId: world.productId, quantity: 2, unitCost: 75000, batchNumber: "", expiryDate: "" },
      ],
      ...patch,
    };
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

  it("mencatat faktur, batch per baris, dan jurnal MASUK dalam satu transaksi", async () => {
    const input = purchase();
    const { id } = await unwrap(createPurchase(input));

    const invoice = await prisma.purchaseInvoice.findUniqueOrThrow({
      where: { id },
      include: { lines: { orderBy: { sortOrder: "asc" }, include: { batch: { include: { movements: true } } } } },
    });
    expect(invoice).toMatchObject({ invoiceNumber: input.invoiceNumber, total: 50000 + 150000, createdByName: "Apoteker Uji" });
    expect(invoice.lines.map((line) => [line.quantity, line.batch?.quantityRemaining, line.batch?.unitCost, line.batch?.branchId])).toEqual([
      [10, 10, 5000, world.branchId],
      [2, 2, 75000, world.branchId],
    ]);
    expect(invoice.lines.flatMap((line) => line.batch?.movements.map((m) => [m.kind, m.quantity]) ?? [])).toEqual([
      ["MASUK", 10],
      ["MASUK", 2],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "purchase.create", entityId: id } })).toBe(1);

    const detail = await getPurchaseDetail(id);
    expect(detail).toMatchObject({ total: 200000, summary: { balance: 200000, status: "BELUM_DIBAYAR" }, canCancel: true, payments: null });
    expect(detail?.lines[0]).toMatchObject({ itemName: `${SLUG} Amoxicillin 500 mg`, amount: 50000, batchRemaining: 10, expiryDate: nextYear });
    const row = (await listPurchases()).find((r) => r.id === id);
    expect(row).toMatchObject({ lineCount: 2, status: "BELUM_DIBAYAR", supplierName: world.supplierName });
  });

  it("faktur yang sama dari supplier yang sama hanya tercatat sekali, termasuk bila dikirim bersamaan", async () => {
    const input = purchase();
    const results = await Promise.all([createPurchase(input), createPurchase(input)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({
      ok: false,
      error: `Faktur ${input.invoiceNumber} dari ${world.supplierName} sudah tercatat.`,
    });
    expect(await prisma.purchaseInvoice.count({ where: { invoiceNumber: input.invoiceNumber, supplierId: world.supplierId } })).toBe(1);

    const other = await prisma.supplier.create({ data: { name: `${SLUG} Lain` } });
    expect((await createPurchase({ ...input, supplierId: other.id })).ok).toBe(true);
  });

  it("menolak permintaan buatan di server", async () => {
    const line = (patch: Record<string, unknown>) => purchase({ lines: [{ ...purchase().lines[0], ...patch } as PurchaseInput["lines"][number]] });
    expect(await createPurchase(line({ quantity: 1.5 }))).toEqual({ ok: false, error: "Baris 1: jumlah harus bilangan bulat lebih dari 0." });
    expect(await createPurchase(line({ unitCost: -1 }))).toEqual({ ok: false, error: "Baris 1: harga beli tidak sah." });
    expect(await createPurchase(line({ expiryDate: "" }))).toEqual({ ok: false, error: "Baris 1: isi tanggal kedaluwarsa obat." });
    expect(await createPurchase(line({ expiryDate: addDaysToDateString(today, -1) }))).toEqual({
      ok: false,
      error: "Baris 1: barang ini sudah kedaluwarsa.",
    });
    expect(await createPurchase(purchase({ invoiceDate: addDaysToDateString(today, 1) }))).toEqual({
      ok: false,
      error: "Tanggal faktur tidak boleh di masa depan.",
    });
    expect(await createPurchase(purchase({ branchId: world.comingSoonBranchId }))).toEqual({
      ok: false,
      error: "Cabang ini belum bisa menerima barang.",
    });

    const inactive = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-OFF`, name: `${SLUG} Off`, kind: "PRODUK", unit: "pcs", isActive: false } });
    expect(await createPurchase(line({ itemId: inactive.id }))).toEqual({ ok: false, error: "Baris 1: pilih barang yang aktif." });

    const closed = await prisma.supplier.create({ data: { name: `${SLUG} Tutup`, isActive: false } });
    expect(await createPurchase(purchase({ supplierId: closed.id }))).toEqual({ ok: false, error: "Pilih supplier yang aktif." });
  });

  it("batalkan faktur yang masih utuh: stok batch ditarik lewat penyesuaian, faktur tetap tercatat", async () => {
    const { id } = await unwrap(createPurchase(purchase()));
    expect(await cancelPurchase({ invoiceId: id, reason: " " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(cancelPurchase({ invoiceId: id, reason: "Harga beli salah ketik" }));

    const detail = await getPurchaseDetail(id);
    expect(detail).toMatchObject({ cancelReason: "Harga beli salah ketik", cancelledByName: "Apoteker Uji", summary: { status: "DIBATALKAN" }, canCancel: false });
    expect(detail?.lines.map((line) => line.batchRemaining)).toEqual([0, 0]);
    const movements = await prisma.stockMovement.findMany({ where: { batch: { purchaseLine: { invoiceId: id } }, kind: "PENYESUAIAN" } });
    expect(movements.map((m) => [m.quantity, m.reason, m.note]).sort()).toEqual([
      [-10, "LAINNYA", "Faktur dibatalkan"],
      [-2, "LAINNYA", "Faktur dibatalkan"],
    ].sort());
    expect(await cancelPurchase({ invoiceId: id, reason: "lagi" })).toEqual({ ok: false, error: "Faktur ini sudah dibatalkan." });
    expect(await prisma.auditLog.count({ where: { action: "purchase.cancel", entityId: id } })).toBe(1);
  });

  it("tidak bisa membatalkan faktur yang sudah dibayar atau stoknya terpakai", async () => {
    const paid = await unwrap(createPurchase(purchase()));
    await prisma.supplierPayment.create({
      data: { invoiceId: paid.id, kind: "BAYAR", amount: 1000, method: "TUNAI", paidAt: new Date(`${today}T00:00:00Z`), staffId: "s2", staffName: "Keuangan" },
    });
    expect(await cancelPurchase({ invoiceId: paid.id, reason: "salah" })).toEqual({ ok: false, error: CANNOT_CANCEL });

    const used = await unwrap(createPurchase(purchase()));
    const batch = await prisma.stockBatch.findFirstOrThrow({ where: { purchaseLine: { invoiceId: used.id } } });
    await prisma.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { decrement: 1 } } });
    await prisma.stockMovement.create({ data: { batchId: batch.id, kind: "PENYESUAIAN", quantity: -1, reason: "RUSAK", staffId: "s1", staffName: "Uji" } });
    expect((await getPurchaseDetail(used.id))?.canCancel).toBe(false);
    expect(await cancelPurchase({ invoiceId: used.id, reason: "salah" })).toEqual({ ok: false, error: CANNOT_CANCEL });
  });

  it("hak akses: Admin Keuangan tidak mencatat barang masuk tetapi boleh membatalkan dan melihat pembayaran; Resepsionis tidak keduanya", async () => {
    const { id } = await unwrap(createPurchase(purchase()));
    actor.role = "ADMIN_KEUANGAN";
    await expect(createPurchase(purchase())).rejects.toThrow(/forbidden: stock:manage/);
    expect((await getPurchaseDetail(id))?.payments).toEqual([]);
    await unwrap(cancelPurchase({ invoiceId: id, reason: "Faktur ganda" }));

    actor.role = "RESEPSIONIS";
    await expect(cancelPurchase({ invoiceId: id, reason: "x" })).rejects.toThrow(/forbidden: stock:read/);
    await expect(listPurchases()).rejects.toThrow(/forbidden: stock:read/);
  });
});
```

Run: `npm run test:integration -- tests/integration/purchases.test.ts`
Expected: FAIL, karena modul `@/server/purchase-read` dan `@/server/purchases` tidak ditemukan.

- [ ] **Step 2: Kunci faktur**

Ganti isi `src/server/stock-store.ts` dengan:

```ts
import type { Prisma } from "@prisma/client";

// Tanpa "use server": pembantu server untuk stok dan hutang, tidak dipanggil browser.

/** Kolom faktur yang dibutuhkan payableSummary (src/lib/stock.ts). */
export const PAYABLE_SELECT = {
  total: true,
  cancelledAt: true,
  dueDate: true,
  payments: { select: { kind: true, amount: true, revokedAt: true } },
  returns: { select: { total: true } },
} as const;

/**
 * Mengunci baris faktur sampai transaksi selesai. Pembayaran, retur, dan pembatalan faktur yang
 * sama berjalan bergiliran, sehingga batas sisa hutang dan syarat batal tidak bisa dilewati
 * oleh dua permintaan bersamaan (spec stok 4.3).
 */
export async function lockInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id = ${invoiceId} FOR UPDATE`;
}
```

- [ ] **Step 3: Aksi barang masuk dan batal faktur**

Buat `src/server/purchases.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, validatePurchase, validateReason, type PurchaseInput } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";
import { lockInvoice } from "@/server/stock-store";

const CANNOT_CANCEL =
  "Faktur tidak bisa dibatalkan karena sudah ada pembayaran, retur, atau stok yang terpakai. Koreksi lewat penyesuaian atau retur.";

function revalidatePurchase(invoiceId: string) {
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath("/admin/hutang");
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/stok/masuk/${invoiceId}`);
}

/**
 * Barang masuk dari faktur supplier (spec stok 5.2): faktur, satu batch per baris, dan jurnal
 * MASUK dibuat dalam satu transaksi. Hutang langsung terbentuk dari total faktur.
 */
export async function createPurchase(input: PurchaseInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const lines: unknown[] = Array.isArray(input?.lines) ? input.lines : [];
    const itemIds = lines.flatMap((line) =>
      typeof line === "object" && line !== null && typeof (line as { itemId?: unknown }).itemId === "string"
        ? [(line as { itemId: string }).itemId]
        : [],
    );
    const [items, supplier, branch] = await Promise.all([
      prisma.stockItem.findMany({ where: { id: { in: itemIds }, isActive: true }, select: { id: true, kind: true } }),
      typeof input?.supplierId === "string" && input.supplierId
        ? prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, name: true, isActive: true } })
        : null,
      typeof input?.branchId === "string" && input.branchId
        ? prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true, status: true } })
        : null,
    ]);
    const kinds = new Map(items.map((item) => [item.id, item.kind]));
    const checked = validatePurchase(input, { today: witaDateString(new Date()), kindOf: (id) => kinds.get(id) ?? null });
    if (!checked.ok) throw new UserFacingError(checked.message);
    if (!supplier || !supplier.isActive) throw new UserFacingError("Pilih supplier yang aktif.");
    if (!branch || branch.status !== "AKTIF") throw new UserFacingError("Cabang ini belum bisa menerima barang.");
    const p = checked.value;

    let id: string;
    try {
      id = await prisma.$transaction(async (tx) => {
        const invoice = await tx.purchaseInvoice.create({
          data: {
            supplierId: supplier.id,
            branchId: branch.id,
            invoiceNumber: p.invoiceNumber,
            invoiceDate: dateOnly(p.invoiceDate),
            dueDate: dateOnly(p.dueDate),
            total: p.total,
            notes: p.notes,
            createdById: actor.staffId,
            createdByName: actor.name,
          },
          select: { id: true },
        });
        for (const [index, line] of p.lines.entries()) {
          const expiryDate = line.expiryDate ? dateOnly(line.expiryDate) : null;
          const created = await tx.purchaseLine.create({
            data: {
              invoiceId: invoice.id,
              itemId: line.itemId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              batchNumber: line.batchNumber,
              expiryDate,
              sortOrder: index,
            },
            select: { id: true },
          });
          const batch = await tx.stockBatch.create({
            data: {
              itemId: line.itemId,
              branchId: branch.id,
              purchaseLineId: created.id,
              batchNumber: line.batchNumber,
              expiryDate,
              unitCost: line.unitCost,
              quantityReceived: line.quantity,
              quantityRemaining: line.quantity,
            },
            select: { id: true },
          });
          await tx.stockMovement.create({
            data: { batchId: batch.id, kind: "MASUK", quantity: line.quantity, staffId: actor.staffId, staffName: actor.name },
          });
        }
        return invoice.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UserFacingError(`Faktur ${p.invoiceNumber} dari ${supplier.name} sudah tercatat.`);
      }
      throw error;
    }

    await recordAudit({
      actor,
      action: "purchase.create",
      entity: "PurchaseInvoice",
      entityId: id,
      summary: `${supplier.name} ${p.invoiceNumber}: ${p.lines.length} baris, ${formatRupiah(p.total)}`,
    });
    revalidatePurchase(id);
    return { id };
  });
}

/**
 * Batalkan faktur salah input (spec stok 6.4): hanya bila belum ada pembayaran aktif, retur,
 * atau stok yang terpakai. Sisa setiap batch ditarik lewat jurnal PENYESUAIAN; faktur tetap tercatat.
 */
export async function cancelPurchase(input: { invoiceId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:read");
    if (!can(actor.role, "stock:manage") && !can(actor.role, "payable:manage")) {
      throw new UserFacingError("Anda tidak berhak membatalkan faktur.");
    }
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.invoiceId ?? "");

    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id },
        select: {
          invoiceNumber: true,
          cancelledAt: true,
          supplier: { select: { name: true } },
          _count: { select: { returns: true } },
          payments: { where: { revokedAt: null }, select: { id: true } },
          lines: {
            select: {
              batch: { select: { id: true, quantityReceived: true, quantityRemaining: true, _count: { select: { movements: true } } } },
            },
          },
        },
      });
      if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
      if (invoice.cancelledAt) throw new UserFacingError("Faktur ini sudah dibatalkan.");
      const batches = invoice.lines.flatMap((line) => (line.batch ? [line.batch] : []));
      const intact =
        batches.length === invoice.lines.length &&
        batches.every((batch) => batch.quantityRemaining === batch.quantityReceived && batch._count.movements === 1);
      if (invoice.payments.length > 0 || invoice._count.returns > 0 || !intact) throw new UserFacingError(CANNOT_CANCEL);

      for (const batch of batches) {
        const { count } = await tx.stockBatch.updateMany({
          where: { id: batch.id, quantityRemaining: batch.quantityReceived },
          data: { quantityRemaining: 0 },
        });
        if (count !== 1) throw new UserFacingError(CANNOT_CANCEL);
        await tx.stockMovement.create({
          data: {
            batchId: batch.id,
            kind: "PENYESUAIAN",
            quantity: -batch.quantityReceived,
            reason: "LAINNYA",
            note: "Faktur dibatalkan",
            staffId: actor.staffId,
            staffName: actor.name,
          },
        });
      }
      await tx.purchaseInvoice.update({
        where: { id },
        data: { cancelledAt: new Date(), cancelledByName: actor.name, cancelReason: reason.value },
      });
      return `${invoice.supplier.name} ${invoice.invoiceNumber}: ${reason.value}`;
    });

    await recordAudit({ actor, action: "purchase.cancel", entity: "PurchaseInvoice", entityId: id, summary });
    revalidatePurchase(id);
  });
}
```

- [ ] **Step 4: Pembacaan faktur**

Buat `src/server/purchase-read.ts`:

```ts
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  dateOnlyString,
  payableSummary,
  type PayableStatus,
  type PayableSummary,
  type PaymentMethodValue,
  type SupplierPaymentKindValue,
} from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { PAYABLE_SELECT } from "@/server/stock-store";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

export type PurchaseRow = {
  id: string;
  invoiceDate: string;
  invoiceNumber: string;
  supplierName: string;
  branchName: string;
  total: number;
  lineCount: number;
  status: PayableStatus;
  overdue: boolean;
};

/** Tab "Barang masuk": faktur terbaru di atas, paling banyak 200. */
export async function listPurchases(): Promise<PurchaseRow[]> {
  await requireCapability("stock:read");
  const today = witaDateString(new Date());
  const invoices = await prisma.purchaseInvoice.findMany({
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      invoiceDate: true,
      invoiceNumber: true,
      supplier: { select: { name: true } },
      branch: { select: { name: true } },
      _count: { select: { lines: true } },
      ...PAYABLE_SELECT,
    },
  });
  return invoices.map((invoice) => {
    const summary = payableSummary(invoice, today);
    return {
      id: invoice.id,
      invoiceDate: dateOnlyString(invoice.invoiceDate),
      invoiceNumber: invoice.invoiceNumber,
      supplierName: invoice.supplier.name,
      branchName: invoice.branch.name,
      total: invoice.total,
      lineCount: invoice._count.lines,
      status: summary.status,
      overdue: summary.overdue,
    };
  });
}

export type PurchaseLineRow = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  amount: number;
  batchNumber: string | null;
  expiryDate: string | null;
  batchId: string;
  batchRemaining: number;
};

export type SupplierReturnRow = {
  id: string;
  createdAt: Date;
  staffName: string;
  note: string | null;
  total: number;
  lines: { itemName: string; batchNumber: string | null; quantity: number; amount: number }[];
};

export type SupplierPaymentRow = {
  id: string;
  kind: SupplierPaymentKindValue;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  reference: string | null;
  staffName: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedByName: string | null;
  revokeReason: string | null;
};

export type PurchaseDetail = {
  id: string;
  supplierName: string;
  branchName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  notes: string | null;
  createdByName: string;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  lines: PurchaseLineRow[];
  returns: SupplierReturnRow[];
  summary: PayableSummary;
  /** Hanya untuk payable:manage (spec stok 6.2); null bagi Apoteker. */
  payments: SupplierPaymentRow[] | null;
  /** Syarat batal faktur (spec stok 6.4) terpenuhi. */
  canCancel: boolean;
};

export async function getPurchaseDetail(id: string): Promise<PurchaseDetail | null> {
  const actor = await requireCapability("stock:read");
  const withPayments = can(actor.role, "payable:manage");
  const today = witaDateString(new Date());
  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: String(id ?? "") },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      notes: true,
      createdByName: true,
      createdAt: true,
      cancelledByName: true,
      cancelReason: true,
      supplier: { select: { name: true } },
      branch: { select: { name: true } },
      ...PAYABLE_SELECT,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          quantity: true,
          unitCost: true,
          batchNumber: true,
          expiryDate: true,
          item: { select: { id: true, code: true, name: true, unit: true } },
          batch: { select: { id: true, quantityReceived: true, quantityRemaining: true, _count: { select: { movements: true } } } },
        },
      },
    },
  });
  if (!invoice) return null;

  const [returns, payments] = await Promise.all([
    prisma.supplierReturn.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        staffName: true,
        note: true,
        total: true,
        lines: { select: { quantity: true, amount: true, batch: { select: { batchNumber: true, item: { select: { name: true } } } } } },
      },
    }),
    withPayments
      ? prisma.supplierPayment.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: "asc" } })
      : Promise.resolve(null),
  ]);

  const summary = payableSummary(invoice, today);
  const batches = invoice.lines.flatMap((line) => (line.batch ? [line.batch] : []));
  const canCancel =
    invoice.cancelledAt === null &&
    invoice.payments.every((payment) => payment.revokedAt !== null) &&
    invoice.returns.length === 0 &&
    batches.length === invoice.lines.length &&
    batches.every((batch) => batch.quantityRemaining === batch.quantityReceived && batch._count.movements === 1);

  return {
    id: invoice.id,
    supplierName: invoice.supplier.name,
    branchName: invoice.branch.name,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: dateOnlyString(invoice.invoiceDate),
    dueDate: dateOnlyString(invoice.dueDate),
    total: invoice.total,
    notes: invoice.notes,
    createdByName: invoice.createdByName,
    createdAt: invoice.createdAt,
    cancelledAt: invoice.cancelledAt,
    cancelledByName: invoice.cancelledByName,
    cancelReason: invoice.cancelReason,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      itemId: line.item.id,
      itemCode: line.item.code,
      itemName: line.item.name,
      unit: line.item.unit,
      quantity: line.quantity,
      unitCost: line.unitCost,
      amount: line.quantity * line.unitCost,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate ? dateOnlyString(line.expiryDate) : null,
      batchId: line.batch?.id ?? "",
      batchRemaining: line.batch?.quantityRemaining ?? 0,
    })),
    returns: returns.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      staffName: r.staffName,
      note: r.note,
      total: r.total,
      lines: r.lines.map((line) => ({
        itemName: line.batch.item.name,
        batchNumber: line.batch.batchNumber,
        quantity: line.quantity,
        amount: line.amount,
      })),
    })),
    summary,
    payments: payments
      ? payments.map((payment) => ({
          id: payment.id,
          kind: payment.kind,
          amount: payment.amount,
          method: payment.method,
          paidAt: dateOnlyString(payment.paidAt),
          reference: payment.reference,
          staffName: payment.staffName,
          createdAt: payment.createdAt,
          revokedAt: payment.revokedAt,
          revokedByName: payment.revokedByName,
          revokeReason: payment.revokeReason,
        }))
      : null,
    canCancel,
  };
}
```

Run: `npm run test:integration -- tests/integration/purchases.test.ts tests/integration/stock-catalog.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t4.log" 2>&1; grep -E "Test Files|Tests " "$WS/t4.log"; npx eslint src/server/stock-store.ts src/server/purchases.ts src/server/purchase-read.ts tests/integration/purchases.test.ts; npx tsc --noEmit -p . > "$WS/t4-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/stock-store.ts src/server/purchases.ts src/server/purchase-read.ts tests/integration/purchases.test.ts
git commit -m "feat: record supplier purchases as batches and payables, and cancel untouched invoices"
```

---

### Task 5: Server — penyesuaian stok dan retur ke supplier

**Files:**
- Create: `src/server/stock-movements.ts`
- Modify: `src/server/stock-store.ts`
- Test: `tests/integration/stock-movements.test.ts`

**Interfaces:**
- Consumes: Task 2 (`validateAdjustment`, `validateReturn`, `ADJUST_REASON_LABEL`, tipe `AdjustmentInput`, `ReturnInput`), Task 4 (`lockInvoice`, `getPurchaseDetail`, `createPurchase`), pembantu uji Task 1/3.
- Produces:
  - `stock-store.ts`: `STOCK_NOT_ENOUGH` (string) dan `takeFromBatch(tx: Prisma.TransactionClient, batchId: string, quantity: number): Promise<boolean>` (pengurangan atomik; `false` bila sisa tidak cukup);
  - `stock-movements.ts` (`"use server"`, `stock:manage`):
    - `adjustStock(input: AdjustmentInput): Promise<ActionResult<void>>`;
    - `createSupplierReturn(input: ReturnInput): Promise<ActionResult<{ id: string }>>`;
  - audit: `stock.adjust`, `stock.return`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/stock-movements.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getPurchaseDetail } from "@/server/purchase-read";
import { cancelPurchase } from "@/server/purchases";
import { adjustStock, createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "DOKTER";
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

const SLUG = "gerak-stok";
const today = witaDateString(new Date());
const NOT_ENOUGH = "Sisa batch tidak cukup. Muat ulang halaman.";
let seq = 0;

describe("penyesuaian dan retur", () => {
  let world: StockWorld;

  const batchOf = async (quantity: number, unitCost = 5000) => {
    seq += 1;
    return seedBatch(world, {
      invoiceNumber: `GR-${seq}`,
      itemId: world.drugId,
      quantity,
      unitCost,
      expiryDate: addDaysToDateString(today, 200),
      invoiceDate: today,
      dueDate: addDaysToDateString(today, 30),
    });
  };
  const remaining = async (batchId: string) => (await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } })).quantityRemaining;

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

  it("mengurangi dan menambah sisa batch lewat jurnal PENYESUAIAN beralasan", async () => {
    const { batchId } = await batchOf(10);
    await unwrap(adjustStock({ batchId, direction: "KURANGI", quantity: 3, reason: "RUSAK", note: "" }));
    await unwrap(adjustStock({ batchId, direction: "TAMBAH", quantity: 1, reason: "SELISIH_HITUNG", note: "Hitung ulang rak" }));
    expect(await remaining(batchId)).toBe(8);
    const movements = await prisma.stockMovement.findMany({ where: { batchId, kind: "PENYESUAIAN" }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.quantity, m.reason, m.note])).toEqual([
      [-3, "RUSAK", null],
      [1, "SELISIH_HITUNG", "Hitung ulang rak"],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "stock.adjust", entityId: batchId } })).toBe(2);
  });

  it("menolak pengurangan melebihi sisa dan batch dari faktur yang dibatalkan", async () => {
    const { batchId, invoiceId } = await batchOf(2);
    expect(await adjustStock({ batchId, direction: "KURANGI", quantity: 3, reason: "HILANG", note: "" })).toEqual({
      ok: false,
      error: NOT_ENOUGH,
    });
    expect(await remaining(batchId)).toBe(2);
    await unwrap(cancelPurchase({ invoiceId, reason: "Salah input" }));
    expect(await adjustStock({ batchId, direction: "TAMBAH", quantity: 1, reason: "SELISIH_HITUNG", note: "x" })).toEqual({
      ok: false,
      error: "Batch dari faktur yang dibatalkan tidak bisa disesuaikan.",
    });
    expect(await adjustStock({ batchId: "tidak-ada", direction: "KURANGI", quantity: 1, reason: "RUSAK", note: "" })).toEqual({
      ok: false,
      error: "Batch tidak ditemukan.",
    });
  });

  it("dua pengurangan bersamaan pada batch yang sama: tepat satu berhasil, sisa tidak pernah minus", async () => {
    const { batchId } = await batchOf(5);
    const results = await Promise.all([
      adjustStock({ batchId, direction: "KURANGI", quantity: 4, reason: "RUSAK", note: "" }),
      adjustStock({ batchId, direction: "KURANGI", quantity: 4, reason: "HILANG", note: "" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: NOT_ENOUGH });
    expect(await remaining(batchId)).toBe(1);
  });

  it("retur mengurangi stok dan hutang faktur, dengan nilai dari harga beli batch", async () => {
    const { batchId, invoiceId } = await batchOf(10, 5000);
    const { id } = await unwrap(createSupplierReturn({ invoiceId, lines: [{ batchId, quantity: 4 }], note: "Kemasan penyok" }));
    expect(await remaining(batchId)).toBe(6);
    expect(await prisma.supplierReturn.findUniqueOrThrow({ where: { id }, include: { lines: true } })).toMatchObject({
      total: 20000,
      note: "Kemasan penyok",
      lines: [{ batchId, quantity: 4, unitCost: 5000, amount: 20000 }],
    });
    expect(await prisma.stockMovement.findFirst({ where: { batchId, kind: "RETUR" } })).toMatchObject({ quantity: -4, supplierReturnId: id });
    const detail = await getPurchaseDetail(invoiceId);
    expect(detail?.summary).toMatchObject({ returned: 20000, balance: 30000, status: "SEBAGIAN" });
    expect(detail?.returns).toHaveLength(1);
    expect(detail?.canCancel).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "stock.return", entityId: id } })).toBe(1);
  });

  it("menolak retur melebihi sisa, batch dari faktur lain, dan faktur yang dibatalkan", async () => {
    const first = await batchOf(3);
    const second = await batchOf(3);
    expect(await createSupplierReturn({ invoiceId: first.invoiceId, lines: [{ batchId: first.batchId, quantity: 4 }], note: "" })).toEqual({
      ok: false,
      error: `Sisa ${SLUG} Amoxicillin 500 mg (batch -) tidak cukup untuk diretur.`,
    });
    expect(await createSupplierReturn({ invoiceId: first.invoiceId, lines: [{ batchId: second.batchId, quantity: 1 }], note: "" })).toEqual({
      ok: false,
      error: "Batch tidak termasuk faktur ini.",
    });
    await unwrap(cancelPurchase({ invoiceId: second.invoiceId, reason: "Salah input" }));
    expect(await createSupplierReturn({ invoiceId: second.invoiceId, lines: [{ batchId: second.batchId, quantity: 1 }], note: "" })).toEqual({
      ok: false,
      error: "Faktur yang dibatalkan tidak bisa diretur.",
    });
    expect(await remaining(first.batchId)).toBe(3);
  });

  it("retur dan penyesuaian bersamaan tidak melewati sisa batch", async () => {
    const { batchId, invoiceId } = await batchOf(5);
    const results = await Promise.all([
      createSupplierReturn({ invoiceId, lines: [{ batchId, quantity: 3 }], note: "" }),
      adjustStock({ batchId, direction: "KURANGI", quantity: 3, reason: "RUSAK", note: "" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await remaining(batchId)).toBe(2);
  });

  it("hak akses: Admin Keuangan dan Resepsionis tidak mengubah stok", async () => {
    const { batchId, invoiceId } = await batchOf(5);
    for (const role of ["ADMIN_KEUANGAN", "RESEPSIONIS"] as const) {
      actor.role = role;
      await expect(adjustStock({ batchId, direction: "KURANGI", quantity: 1, reason: "RUSAK", note: "" })).rejects.toThrow(
        /forbidden: stock:manage/,
      );
      await expect(createSupplierReturn({ invoiceId, lines: [{ batchId, quantity: 1 }], note: "" })).rejects.toThrow(
        /forbidden: stock:manage/,
      );
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/stock-movements.test.ts`
Expected: FAIL, karena modul `@/server/stock-movements` tidak ditemukan.

- [ ] **Step 2: Pengurangan atomik**

Tambahkan di akhir `src/server/stock-store.ts`:

```ts

export const STOCK_NOT_ENOUGH = "Sisa batch tidak cukup. Muat ulang halaman.";

/**
 * Mengurangi sisa batch dalam satu UPDATE bersyarat (spec stok 4.3). Dua pengurangan bersamaan
 * tidak bisa sama-sama lolos: yang kedua melihat sisa terbaru dan gagal bila tidak cukup.
 */
export async function takeFromBatch(tx: Prisma.TransactionClient, batchId: string, quantity: number): Promise<boolean> {
  const { count } = await tx.stockBatch.updateMany({
    where: { id: batchId, quantityRemaining: { gte: quantity } },
    data: { quantityRemaining: { decrement: quantity } },
  });
  return count === 1;
}
```

- [ ] **Step 3: Aksi penyesuaian dan retur**

Buat `src/server/stock-movements.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import { ADJUST_REASON_LABEL, validateAdjustment, validateReturn, type AdjustmentInput, type ReturnInput } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { lockInvoice, STOCK_NOT_ENOUGH, takeFromBatch } from "@/server/stock-store";

function revalidateMovement(itemIds: string[], invoiceId?: string) {
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath("/admin");
  for (const itemId of itemIds) safeRevalidatePath(`/admin/stok/barang/${itemId}`);
  if (invoiceId) {
    safeRevalidatePath(`/admin/stok/masuk/${invoiceId}`);
    safeRevalidatePath("/admin/hutang");
  }
}

/** Penyesuaian stok (spec stok 5.4): rusak, hilang, kedaluwarsa dibuang, lainnya, atau selisih hitung. */
export async function adjustStock(input: AdjustmentInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateAdjustment(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const adjustment = checked.value;

    const batch = await prisma.stockBatch.findUnique({
      where: { id: adjustment.batchId },
      select: {
        id: true,
        itemId: true,
        batchNumber: true,
        item: { select: { name: true } },
        purchaseLine: { select: { invoice: { select: { cancelledAt: true } } } },
      },
    });
    if (!batch) throw new UserFacingError("Batch tidak ditemukan.");
    if (batch.purchaseLine.invoice.cancelledAt) {
      throw new UserFacingError("Batch dari faktur yang dibatalkan tidak bisa disesuaikan.");
    }

    await prisma.$transaction(async (tx) => {
      if (adjustment.delta < 0) {
        if (!(await takeFromBatch(tx, batch.id, -adjustment.delta))) throw new UserFacingError(STOCK_NOT_ENOUGH);
      } else {
        await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { increment: adjustment.delta } } });
      }
      await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          kind: "PENYESUAIAN",
          quantity: adjustment.delta,
          reason: adjustment.reason,
          note: adjustment.note,
          staffId: actor.staffId,
          staffName: actor.name,
        },
      });
    });

    await recordAudit({
      actor,
      action: "stock.adjust",
      entity: "StockBatch",
      entityId: batch.id,
      summary: `${batch.item.name} batch ${batch.batchNumber ?? "-"}: ${adjustment.delta > 0 ? "+" : ""}${adjustment.delta} (${ADJUST_REASON_LABEL[adjustment.reason]})`,
    });
    revalidateMovement([batch.itemId]);
  });
}

/**
 * Retur ke supplier (spec stok 5.5): sisa batch berkurang, jurnal RETUR dibuat, dan nilai retur
 * (jumlah × harga beli batch) mengurangi hutang faktur. Faktur dikunci selama transaksi.
 */
export async function createSupplierReturn(input: ReturnInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateReturn(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const request = checked.value;

    const result = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, request.invoiceId);
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: request.invoiceId },
        select: {
          invoiceNumber: true,
          cancelledAt: true,
          supplier: { select: { name: true } },
          lines: {
            select: { batch: { select: { id: true, itemId: true, unitCost: true, batchNumber: true, item: { select: { name: true } } } } },
          },
        },
      });
      if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
      if (invoice.cancelledAt) throw new UserFacingError("Faktur yang dibatalkan tidak bisa diretur.");
      const batches = new Map(invoice.lines.flatMap((line) => (line.batch ? [[line.batch.id, line.batch] as const] : [])));

      const lines: { batchId: string; quantity: number; unitCost: number; amount: number }[] = [];
      const itemIds = new Set<string>();
      for (const line of request.lines) {
        const batch = batches.get(line.batchId);
        if (!batch) throw new UserFacingError("Batch tidak termasuk faktur ini.");
        if (!(await takeFromBatch(tx, batch.id, line.quantity))) {
          throw new UserFacingError(`Sisa ${batch.item.name} (batch ${batch.batchNumber ?? "-"}) tidak cukup untuk diretur.`);
        }
        lines.push({ batchId: batch.id, quantity: line.quantity, unitCost: batch.unitCost, amount: line.quantity * batch.unitCost });
        itemIds.add(batch.itemId);
      }
      const total = lines.reduce((sum, line) => sum + line.amount, 0);
      const created = await tx.supplierReturn.create({
        data: { invoiceId: request.invoiceId, total, note: request.note, staffId: actor.staffId, staffName: actor.name, lines: { create: lines } },
        select: { id: true },
      });
      for (const line of lines) {
        await tx.stockMovement.create({
          data: {
            batchId: line.batchId,
            kind: "RETUR",
            quantity: -line.quantity,
            supplierReturnId: created.id,
            staffId: actor.staffId,
            staffName: actor.name,
          },
        });
      }
      return { id: created.id, itemIds: [...itemIds], summary: `${invoice.supplier.name} ${invoice.invoiceNumber}: ${formatRupiah(total)}` };
    });

    await recordAudit({ actor, action: "stock.return", entity: "SupplierReturn", entityId: result.id, summary: result.summary });
    revalidateMovement(result.itemIds, request.invoiceId);
    return { id: result.id };
  });
}
```

Run: `npm run test:integration -- tests/integration/stock-movements.test.ts tests/integration/purchases.test.ts`
Expected: PASS semua.

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t5.log" 2>&1; grep -E "Test Files|Tests " "$WS/t5.log"; npx eslint src/server/stock-store.ts src/server/stock-movements.ts tests/integration/stock-movements.test.ts; npx tsc --noEmit -p . > "$WS/t5-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/stock-store.ts src/server/stock-movements.ts tests/integration/stock-movements.test.ts
git commit -m "feat: let pharmacists adjust batch stock and return goods to suppliers without ever going negative"
```

---

### Task 6: Server — pembayaran hutang, pengembalian dana, jatuh tempo, dan daftar hutang

**Files:**
- Create: `src/server/payables.ts`, `src/server/payable-read.ts`
- Test: `tests/integration/payables.test.ts`

**Interfaces:**
- Consumes: Task 2 (`validatePayment`, `validateReason`, `validateDueDateChange`, `payableSummary`, `matchesPayableView`, `comparePayables`, `dateOnly`, `dateOnlyString`, `PAYMENT_METHOD_LABEL`, `DUE_SOON_DAYS`, tipe `PaymentInput`, `PayableView`, `PayableStatus`), Task 4 (`lockInvoice`, `PAYABLE_SELECT`, `getPurchaseDetail`), Task 5 (`createSupplierReturn`), pembantu uji.
- Produces:
  - `payables.ts` (`"use server"`, `payable:manage`):
    - `recordSupplierPayment(input: PaymentInput): Promise<ActionResult<{ id: string }>>` (jenis `BAYAR` atau `PENGEMBALIAN`);
    - `revokeSupplierPayment(input: { paymentId: string; reason: string }): Promise<ActionResult<void>>`;
    - `updateDueDate(input: { invoiceId: string; dueDate: string; reason: string }): Promise<ActionResult<void>>`;
  - `payable-read.ts` (tanpa `"use server"`, `payable:manage`):
    - `listPayables(filter: { view: PayableView; supplierId?: string }): Promise<PayableRow[]>`, `PayableRow = { id; supplierId; supplierName; branchName; invoiceNumber; invoiceDate: string; dueDate: string; total; paid; returned; refunded; balance; status: PayableStatus; overdue: boolean }`;
    - `payablesOverview(): Promise<PayablesOverview>`, `PayablesOverview = { totalBalance: number; overdueBalance: number; overdueCount: number; dueSoonCount: number; credit: number; bySupplier: { supplierId: string; supplierName: string; balance: number; overdueCount: number }[] }`;
    - `countOverduePayables(): Promise<number>`;
  - audit: `supplier-payment.create`, `supplier-refund.create`, `supplier-payment.revoke`, `purchase.update-due-date`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/payables.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { PaymentInput } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { countOverduePayables, listPayables, payablesOverview } from "@/server/payable-read";
import { recordSupplierPayment, revokeSupplierPayment, updateDueDate } from "@/server/payables";
import { getPurchaseDetail } from "@/server/purchase-read";
import { cancelPurchase } from "@/server/purchases";
import { createSupplierReturn } from "@/server/stock-movements";
import { cleanupStockWorld, createStockWorld, seedBatch, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u2", staffId: "s2", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "keu@sundy.test" },
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

const SLUG = "hutang-stok";
const today = witaDateString(new Date());
let seq = 0;

describe("hutang ke supplier", () => {
  let world: StockWorld;

  /** Faktur 10 × Rp 10.000 = Rp 100.000. */
  const invoice = async (input: { invoiceDate?: string; dueDate?: string } = {}) => {
    seq += 1;
    return seedBatch(world, {
      invoiceNumber: `HT-${seq}`,
      itemId: world.productId,
      quantity: 10,
      unitCost: 10000,
      invoiceDate: input.invoiceDate ?? addDaysToDateString(today, -10),
      dueDate: input.dueDate ?? addDaysToDateString(today, 20),
    });
  };
  const pay = (invoiceId: string, patch: Partial<PaymentInput> = {}): Promise<Awaited<ReturnType<typeof recordSupplierPayment>>> =>
    recordSupplierPayment({ invoiceId, kind: "BAYAR", amount: 40000, method: "TRANSFER", paidAt: today, reference: "", ...patch });

  beforeAll(async () => {
    await cleanupStockWorld(SLUG);
    world = await createStockWorld(SLUG);
  });

  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
  });

  afterAll(async () => {
    await cleanupStockWorld(SLUG);
    await prisma.$disconnect();
  });

  it("bayar sebagian lalu lunas; nominal di atas sisa ditolak", async () => {
    const { invoiceId } = await invoice();
    const first = await unwrap(pay(invoiceId));
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ paid: 40000, balance: 60000, status: "SEBAGIAN" });
    expect(await pay(invoiceId, { amount: 60001 })).toEqual({ ok: false, error: "Nominal melebihi sisa hutang (Rp 60.000)." });
    const second = await unwrap(pay(invoiceId, { amount: 60000, method: "TUNAI" }));
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ balance: 0, status: "LUNAS" });
    expect(await pay(invoiceId, { amount: 1 })).toEqual({ ok: false, error: "Faktur ini tidak punya sisa hutang." });
    expect(
      await prisma.auditLog.count({ where: { action: "supplier-payment.create", entityId: { in: [first.id, second.id] } } }),
    ).toBe(2);
  });

  it("dua pembayaran bersamaan yang masing-masing melunasi: hanya satu diterima", async () => {
    const { invoiceId } = await invoice();
    const results = await Promise.all([pay(invoiceId, { amount: 100000 }), pay(invoiceId, { amount: 100000 })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Faktur ini tidak punya sisa hutang." });
    expect(await prisma.supplierPayment.count({ where: { invoiceId, revokedAt: null } })).toBe(1);
  });

  it("menolak tanggal bayar di masa depan atau sebelum tanggal faktur, dan faktur yang dibatalkan", async () => {
    const { invoiceId } = await invoice({ invoiceDate: addDaysToDateString(today, -3) });
    expect(await pay(invoiceId, { paidAt: addDaysToDateString(today, 1) })).toEqual({ ok: false, error: "Tanggal bayar tidak boleh di masa depan." });
    expect(await pay(invoiceId, { paidAt: addDaysToDateString(today, -4) })).toEqual({
      ok: false,
      error: "Tanggal bayar tidak boleh sebelum tanggal faktur.",
    });
    await unwrap(cancelPurchase({ invoiceId, reason: "Faktur ganda" }));
    expect(await pay(invoiceId)).toEqual({ ok: false, error: "Faktur yang dibatalkan tidak punya hutang." });
  });

  it("membatalkan pembayaran salah input mengembalikan sisa; tidak bisa dibatalkan dua kali", async () => {
    const { invoiceId } = await invoice();
    const { id } = await unwrap(pay(invoiceId));
    expect(await revokeSupplierPayment({ paymentId: id, reason: " " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(revokeSupplierPayment({ paymentId: id, reason: "Nominal salah" }));
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ paid: 0, balance: 100000, status: "BELUM_DIBAYAR" });
    expect(await prisma.supplierPayment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      revokedByName: "Keuangan Uji",
      revokeReason: "Nominal salah",
    });
    expect(await revokeSupplierPayment({ paymentId: id, reason: "lagi" })).toEqual({ ok: false, error: "Pembayaran ini sudah dibatalkan." });
    expect(await prisma.auditLog.count({ where: { action: "supplier-payment.revoke", entityId: id } })).toBe(1);
  });

  it("retur atas faktur lunas menjadi kredit; pengembalian dana menutupnya, tidak boleh melebihi kredit", async () => {
    const { invoiceId, batchId } = await invoice();
    await unwrap(pay(invoiceId, { amount: 100000 }));
    actor.role = "APOTEKER";
    await unwrap(createSupplierReturn({ invoiceId, lines: [{ batchId, quantity: 3 }], note: "" }));
    actor.role = "ADMIN_KEUANGAN";
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ balance: -30000, status: "KREDIT" });

    expect(await pay(invoiceId, { kind: "PENGEMBALIAN", amount: 30001 })).toEqual({
      ok: false,
      error: "Nominal melebihi kredit dari supplier (Rp 30.000).",
    });
    const refund = await unwrap(pay(invoiceId, { kind: "PENGEMBALIAN", amount: 30000, method: "TUNAI" }));
    expect((await getPurchaseDetail(invoiceId))?.summary).toMatchObject({ refunded: 30000, balance: 0, status: "LUNAS" });
    expect(await prisma.auditLog.count({ where: { action: "supplier-refund.create", entityId: refund.id } })).toBe(1);
  });

  it("ubah jatuh tempo beralasan; tidak sebelum tanggal faktur", async () => {
    const { invoiceId } = await invoice({ invoiceDate: addDaysToDateString(today, -5) });
    const newDue = addDaysToDateString(today, 45);
    expect(await updateDueDate({ invoiceId, dueDate: addDaysToDateString(today, -6), reason: "x" })).toEqual({
      ok: false,
      error: "Jatuh tempo tidak boleh sebelum tanggal faktur.",
    });
    expect(await updateDueDate({ invoiceId, dueDate: newDue, reason: "" })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(updateDueDate({ invoiceId, dueDate: newDue, reason: "Kesepakatan baru" }));
    expect((await getPurchaseDetail(invoiceId))?.dueDate).toBe(newDue);
    expect(await prisma.auditLog.count({ where: { action: "purchase.update-due-date", entityId: invoiceId } })).toBe(1);
  });

  it("daftar hutang per tampilan, urutan, dan ringkasan", async () => {
    await prisma.supplierPayment.deleteMany({ where: { invoice: { branch: { slug: { startsWith: SLUG } } } } });
    const overdue = await invoice({ invoiceDate: addDaysToDateString(today, -40), dueDate: addDaysToDateString(today, -1) });
    const soon = await invoice({ dueDate: addDaysToDateString(today, 3) });
    const later = await invoice({ dueDate: addDaysToDateString(today, 25) });
    const settled = await invoice();
    await unwrap(pay(settled.invoiceId, { amount: 100000 }));

    const mine = (rows: { id: string }[]) => rows.map((row) => row.id).filter((id) => [overdue, soon, later, settled].some((x) => x.invoiceId === id));
    const open = await listPayables({ view: "BELUM_LUNAS", supplierId: world.supplierId });
    expect(mine(open)).toEqual([overdue.invoiceId, soon.invoiceId, later.invoiceId]);
    expect(open.find((row) => row.id === overdue.invoiceId)).toMatchObject({ overdue: true, balance: 100000, supplierName: world.supplierName });
    expect(mine(await listPayables({ view: "TERLAMBAT" }))).toEqual([overdue.invoiceId]);
    expect(mine(await listPayables({ view: "JATUH_TEMPO" }))).toEqual([soon.invoiceId]);
    expect(mine(await listPayables({ view: "LUNAS" }))).toEqual([settled.invoiceId]);

    const overview = await payablesOverview();
    const supplier = overview.bySupplier.find((row) => row.supplierId === world.supplierId);
    expect(supplier?.overdueCount).toBe(1);
    expect(overview.overdueCount).toBeGreaterThanOrEqual(1);
    expect(overview.totalBalance).toBeGreaterThanOrEqual(300000);
    expect(await countOverduePayables()).toBe(overview.overdueCount);
  });

  it("hak akses: Apoteker dan Resepsionis tidak mengurus hutang", async () => {
    const { invoiceId } = await invoice();
    for (const role of ["APOTEKER", "RESEPSIONIS"] as const) {
      actor.role = role;
      await expect(pay(invoiceId)).rejects.toThrow(/forbidden: payable:manage/);
      await expect(listPayables({ view: "BELUM_LUNAS" })).rejects.toThrow(/forbidden: payable:manage/);
      await expect(updateDueDate({ invoiceId, dueDate: today, reason: "x" })).rejects.toThrow(/forbidden: payable:manage/);
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/payables.test.ts`
Expected: FAIL, karena modul `@/server/payable-read` dan `@/server/payables` tidak ditemukan.

- [ ] **Step 2: Aksi hutang**

Buat `src/server/payables.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { safeRevalidatePath } from "@/lib/revalidate";
import {
  dateLabel,
  dateOnly,
  dateOnlyString,
  PAYMENT_METHOD_LABEL,
  payableSummary,
  validateDueDateChange,
  validatePayment,
  validateReason,
  type PaymentInput,
} from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { lockInvoice, PAYABLE_SELECT } from "@/server/stock-store";

function revalidatePayable(invoiceId: string) {
  safeRevalidatePath("/admin/hutang");
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/stok/masuk/${invoiceId}`);
}

/**
 * Catat pembayaran (BAYAR) atau pengembalian dana dari supplier (PENGEMBALIAN), spec stok 6.2–6.3.
 * Batasnya sisa hutang atau kredit saat ini, dihitung setelah faktur dikunci: dua pembayaran
 * bersamaan tidak bisa sama-sama melunasi.
 */
export async function recordSupplierPayment(input: PaymentInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("payable:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const today = witaDateString(new Date());

    const result = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, invoiceId);
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        select: { invoiceNumber: true, invoiceDate: true, supplier: { select: { name: true } }, ...PAYABLE_SELECT },
      });
      if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
      if (invoice.cancelledAt) throw new UserFacingError("Faktur yang dibatalkan tidak punya hutang.");
      const { balance } = payableSummary(invoice, today);
      const limit = input?.kind === "PENGEMBALIAN" ? Math.max(-balance, 0) : Math.max(balance, 0);
      const checked = validatePayment(input, { today, invoiceDate: dateOnlyString(invoice.invoiceDate), limit });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const payment = checked.value;
      const created = await tx.supplierPayment.create({
        data: {
          invoiceId,
          kind: payment.kind,
          amount: payment.amount,
          method: payment.method,
          paidAt: dateOnly(payment.paidAt),
          reference: payment.reference,
          staffId: actor.staffId,
          staffName: actor.name,
        },
        select: { id: true },
      });
      return {
        id: created.id,
        kind: payment.kind,
        summary: `${invoice.supplier.name} ${invoice.invoiceNumber}: ${formatRupiah(payment.amount)} (${PAYMENT_METHOD_LABEL[payment.method]})`,
      };
    });

    await recordAudit({
      actor,
      action: result.kind === "BAYAR" ? "supplier-payment.create" : "supplier-refund.create",
      entity: "SupplierPayment",
      entityId: result.id,
      summary: result.summary,
    });
    revalidatePayable(invoiceId);
    return { id: result.id };
  });
}

/** Pembayaran salah input dibatalkan, tidak dihapus (spec stok 6.2). */
export async function revokeSupplierPayment(input: { paymentId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("payable:manage");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.paymentId ?? "");
    const payment = await prisma.supplierPayment.findUnique({
      where: { id },
      select: { invoiceId: true, amount: true, invoice: { select: { invoiceNumber: true, supplier: { select: { name: true } } } } },
    });
    if (!payment) throw new UserFacingError("Pembayaran tidak ditemukan.");

    await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, payment.invoiceId);
      const { count } = await tx.supplierPayment.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date(), revokedByName: actor.name, revokeReason: reason.value },
      });
      if (count === 0) throw new UserFacingError("Pembayaran ini sudah dibatalkan.");
    });

    await recordAudit({
      actor,
      action: "supplier-payment.revoke",
      entity: "SupplierPayment",
      entityId: id,
      summary: `${payment.invoice.supplier.name} ${payment.invoice.invoiceNumber}: ${formatRupiah(payment.amount)} (${reason.value})`,
    });
    revalidatePayable(payment.invoiceId);
  });
}

/** Ubah jatuh tempo (spec stok 6.2): beralasan, tidak sebelum tanggal faktur. */
export async function updateDueDate(input: { invoiceId: string; dueDate: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("payable:manage");
    const id = String(input?.invoiceId ?? "");
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      select: { invoiceNumber: true, invoiceDate: true, dueDate: true, cancelledAt: true },
    });
    if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
    if (invoice.cancelledAt) throw new UserFacingError("Faktur yang dibatalkan tidak bisa diubah.");
    const due = validateDueDateChange(input?.dueDate, dateOnlyString(invoice.invoiceDate));
    if (!due.ok) throw new UserFacingError(due.message);
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);

    await prisma.purchaseInvoice.update({ where: { id }, data: { dueDate: dateOnly(due.value) } });
    await recordAudit({
      actor,
      action: "purchase.update-due-date",
      entity: "PurchaseInvoice",
      entityId: id,
      summary: `${invoice.invoiceNumber}: ${dateLabel(dateOnlyString(invoice.dueDate))} → ${dateLabel(due.value)} (${reason.value})`,
    });
    revalidatePayable(id);
  });
}
```

- [ ] **Step 3: Pembacaan hutang**

Buat `src/server/payable-read.ts`:

```ts
import { prisma } from "@/lib/db";
import {
  comparePayables,
  dateOnlyString,
  matchesPayableView,
  payableSummary,
  type PayableStatus,
  type PayableView,
} from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { PAYABLE_SELECT } from "@/server/stock-store";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.
// Klinik kecil: semua faktur dimuat sekali lalu disaring di memori.

export type PayableRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  branchName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  paid: number;
  returned: number;
  refunded: number;
  balance: number;
  status: PayableStatus;
  overdue: boolean;
};

async function loadPayables(): Promise<PayableRow[]> {
  const today = witaDateString(new Date());
  const invoices = await prisma.purchaseInvoice.findMany({
    select: {
      id: true,
      supplierId: true,
      invoiceNumber: true,
      invoiceDate: true,
      supplier: { select: { name: true } },
      branch: { select: { name: true } },
      ...PAYABLE_SELECT,
    },
  });
  return invoices.map((invoice) => {
    const summary = payableSummary(invoice, today);
    return {
      id: invoice.id,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier.name,
      branchName: invoice.branch.name,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: dateOnlyString(invoice.invoiceDate),
      dueDate: dateOnlyString(invoice.dueDate),
      total: invoice.total,
      paid: summary.paid,
      returned: summary.returned,
      refunded: summary.refunded,
      balance: summary.balance,
      status: summary.status,
      overdue: summary.overdue,
    };
  });
}

/** Daftar hutang (spec stok 6.1). Lunas/Dibatalkan: terbaru di atas; lainnya: terlambat lalu jatuh tempo terdekat. */
export async function listPayables(filter: { view: PayableView; supplierId?: string }): Promise<PayableRow[]> {
  await requireCapability("payable:manage");
  const today = witaDateString(new Date());
  const rows = (await loadPayables()).filter(
    (row) => matchesPayableView(row, filter.view, today) && (!filter.supplierId || row.supplierId === filter.supplierId),
  );
  if (filter.view === "LUNAS" || filter.view === "DIBATALKAN") {
    return rows.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  }
  return rows.sort(comparePayables);
}

export type PayablesOverview = {
  /** Σ sisa hutang yang belum lunas (kredit tidak mengurangi). */
  totalBalance: number;
  overdueBalance: number;
  overdueCount: number;
  dueSoonCount: number;
  /** Σ kredit dari supplier yang belum dikembalikan. */
  credit: number;
  bySupplier: { supplierId: string; supplierName: string; balance: number; overdueCount: number }[];
};

/** Ringkasan di atas daftar hutang dan kotak Hutang di dasbor (spec stok 6.1, 6.5). */
export async function payablesOverview(): Promise<PayablesOverview> {
  await requireCapability("payable:manage");
  const today = witaDateString(new Date());
  const rows = (await loadPayables()).filter((row) => row.status !== "DIBATALKAN");
  const bySupplier = new Map<string, { supplierId: string; supplierName: string; balance: number; overdueCount: number }>();
  const overview: PayablesOverview = { totalBalance: 0, overdueBalance: 0, overdueCount: 0, dueSoonCount: 0, credit: 0, bySupplier: [] };
  for (const row of rows) {
    if (row.balance < 0) {
      overview.credit += -row.balance;
      continue;
    }
    if (row.balance === 0) continue;
    overview.totalBalance += row.balance;
    if (row.overdue) {
      overview.overdueBalance += row.balance;
      overview.overdueCount += 1;
    } else if (matchesPayableView(row, "JATUH_TEMPO", today)) {
      overview.dueSoonCount += 1;
    }
    const entry = bySupplier.get(row.supplierId) ?? { supplierId: row.supplierId, supplierName: row.supplierName, balance: 0, overdueCount: 0 };
    entry.balance += row.balance;
    if (row.overdue) entry.overdueCount += 1;
    bySupplier.set(row.supplierId, entry);
  }
  overview.bySupplier = [...bySupplier.values()].sort((a, b) => b.balance - a.balance);
  return overview;
}

/** Angka di menu samping Hutang: faktur terlambat. */
export async function countOverduePayables(): Promise<number> {
  await requireCapability("payable:manage");
  return (await loadPayables()).filter((row) => row.overdue).length;
}
```

Run: `npm run test:integration -- tests/integration/payables.test.ts tests/integration/stock-movements.test.ts`
Expected: PASS semua.

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t6.log" 2>&1; grep -E "Test Files|Tests " "$WS/t6.log"; npx eslint src/server/payables.ts src/server/payable-read.ts tests/integration/payables.test.ts; npx tsc --noEmit -p . > "$WS/t6-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/payables.ts src/server/payable-read.ts tests/integration/payables.test.ts
git commit -m "feat: let finance admins pay, revoke, and refund supplier invoices, change due dates, and list payables"
```

---

### Task 7: Layar Stok — daftar barang per cabang, detail barang, dialog barang dan penyesuaian

**Files:**
- Create:
  - `src/components/admin/stock/stock-item-table.tsx`, `src/components/admin/stock/stock-item-dialog.tsx`, `src/components/admin/stock/stock-item-active-button.tsx`, `src/components/admin/stock/adjust-stock-dialog.tsx`;
  - `src/app/(admin)/admin/stok/page.tsx`, `src/app/(admin)/admin/stok/barang/[id]/page.tsx`.
- Test: `tests/unit/components/stock-item-table.test.tsx`, `tests/unit/components/stock-item-dialog.test.tsx`, `tests/unit/components/adjust-stock-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 2 (label, `validateStockItem`, `validateAdjustment`, `summarizeStock`, `isStockFlag`, `dateLabel`, `DECREASE_REASONS`, `INCREASE_REASONS`), Task 3 (`createStockItem`, `updateStockItem`, `setStockItemActive`, `listStockItems`, `getStockItemDetail`, tipe `StockItemRow`), Task 5 (`adjustStock`), sudah ada: `getBranches` (`@/server/catalog`), `RupiahInput`, `SectionCard`, `EmptyState`, `PageHeader`, `PageBody`, `AdminHeader`, `Dialog*`.
- Produces:
  - `StockItemTable({ rows }: { rows: StockItemRow[] })` (komponen server);
  - `StockItemDialog({ itemId?, initial?, triggerLabel }: { itemId?: string; initial?: StockItemInput; triggerLabel: string })`;
  - `StockItemActiveButton({ itemId, active }: { itemId: string; active: boolean })`;
  - `AdjustStockDialog({ batch }: { batch: { id: string; label: string; remaining: number; unit: string } })` — tombol pemicu bernama "Penyesuaian {label}";
  - halaman `/admin/stok` (daftar barang; Task 8 menambah tab) dan `/admin/stok/barang/[id]`.

- [ ] **Step 1: Tulis uji komponen (gagal)**

Buat `tests/unit/components/stock-item-table.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StockItemTable } from "@/components/admin/stock/stock-item-table";
import type { StockItemRow } from "@/server/stock-read";

const row = (patch: Partial<StockItemRow> = {}): StockItemRow => ({
  id: "i1",
  code: "OBT-001",
  name: "Amoxicillin 500 mg",
  kind: "OBAT",
  unit: "kapsul",
  sellPrice: 2000,
  minStock: 20,
  isActive: true,
  onHand: 11,
  available: 8,
  value: 16500,
  low: true,
  expiringSoon: false,
  expired: true,
  flags: ["MENIPIS", "KEDALUWARSA"],
  ...patch,
});

describe("StockItemTable", () => {
  it("menampilkan stok tersedia, sisa kedaluwarsa, tanda, harga, dan tautan detail", () => {
    render(<StockItemTable rows={[row()]} />);
    expect(screen.getByRole("link", { name: "Amoxicillin 500 mg" })).toHaveAttribute("href", "/admin/stok/barang/i1");
    expect(screen.getByText("8 kapsul")).toBeInTheDocument();
    expect(screen.getByText("3 kedaluwarsa")).toBeInTheDocument();
    expect(screen.getByText("Menipis")).toBeInTheDocument();
    expect(screen.getByText("Kedaluwarsa")).toBeInTheDocument();
    expect(screen.getByText("Rp 2.000")).toBeInTheDocument();
  });

  it("harga kosong tampil sebagai tanda pisah; barang nonaktif diberi tanda; daftar kosong", () => {
    const { unmount } = render(<StockItemTable rows={[row({ sellPrice: null, isActive: false, flags: [], onHand: 8 })]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();
    unmount();
    render(<StockItemTable rows={[]} />);
    expect(screen.getByText("Tidak ada barang yang cocok.")).toBeInTheDocument();
  });
});
```

Buat `tests/unit/components/stock-item-dialog.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { createStockItem, updateStockItem } from "@/server/stock-catalog";

vi.mock("@/server/stock-catalog", () => ({ createStockItem: vi.fn(), updateStockItem: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe("StockItemDialog", () => {
  it("menambah barang dengan isian formulir", async () => {
    const user = userEvent.setup();
    vi.mocked(createStockItem).mockResolvedValue({ ok: true, data: { id: "i9" } });
    render(<StockItemDialog triggerLabel="+ Barang" />);
    await user.click(screen.getByRole("button", { name: "+ Barang" }));
    expect(screen.getByRole("dialog", { name: "Tambah barang" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Kode"), "obt-001");
    await user.type(screen.getByLabelText("Nama"), "Amoxicillin");
    await user.type(screen.getByLabelText("Satuan"), "kapsul");
    await user.clear(screen.getByLabelText("Batas menipis"));
    await user.type(screen.getByLabelText("Batas menipis"), "20");
    await user.type(screen.getByLabelText("Harga jual"), "2000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createStockItem).toHaveBeenCalledWith({
        code: "obt-001",
        name: "Amoxicillin",
        kind: "OBAT",
        unit: "kapsul",
        sellPrice: 2000,
        minStock: 20,
        notes: "",
      }),
    );
  });

  it("galat isian tampil tanpa memanggil server; galat server juga tampil", async () => {
    const user = userEvent.setup();
    render(<StockItemDialog triggerLabel="+ Barang" />);
    await user.click(screen.getByRole("button", { name: "+ Barang" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Isi kode barang.");
    expect(createStockItem).not.toHaveBeenCalled();

    vi.mocked(createStockItem).mockResolvedValue({ ok: false, error: "Kode barang OBT-001 sudah dipakai." });
    await user.type(screen.getByLabelText("Kode"), "OBT-001");
    await user.type(screen.getByLabelText("Nama"), "Amoxicillin");
    await user.type(screen.getByLabelText("Satuan"), "kapsul");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Kode barang OBT-001 sudah dipakai.")).toBeInTheDocument();
  });

  it("mengubah barang memanggil updateStockItem dengan id-nya", async () => {
    const user = userEvent.setup();
    vi.mocked(updateStockItem).mockResolvedValue({ ok: true, data: undefined });
    const initial = { code: "OBT-001", name: "Amoxicillin", kind: "OBAT" as const, unit: "kapsul", sellPrice: 2000, minStock: 20, notes: "" };
    render(<StockItemDialog itemId="i1" initial={initial} triggerLabel="Ubah barang" />);
    await user.click(screen.getByRole("button", { name: "Ubah barang" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateStockItem).toHaveBeenCalledWith("i1", initial));
  });
});
```

Buat `tests/unit/components/adjust-stock-dialog.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdjustStockDialog } from "@/components/admin/stock/adjust-stock-dialog";
import { adjustStock } from "@/server/stock-movements";

vi.mock("@/server/stock-movements", () => ({ adjustStock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const batch = { id: "b1", label: "Amoxicillin batch B-01", remaining: 5, unit: "kapsul" };

beforeEach(() => vi.clearAllMocks());

async function open() {
  const user = userEvent.setup();
  render(<AdjustStockDialog batch={batch} />);
  await user.click(screen.getByRole("button", { name: "Penyesuaian Amoxicillin batch B-01" }));
  return user;
}

describe("AdjustStockDialog", () => {
  it("mengurangi stok dengan alasan dan mengirimnya ke server", async () => {
    vi.mocked(adjustStock).mockResolvedValue({ ok: true, data: undefined });
    const user = await open();
    const options = within(screen.getByLabelText("Alasan")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Rusak", "Hilang", "Kedaluwarsa dibuang", "Lainnya"]);
    await user.type(screen.getByLabelText("Jumlah"), "2");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(adjustStock).toHaveBeenCalledWith({ batchId: "b1", direction: "KURANGI", quantity: 2, reason: "RUSAK", note: "" }),
    );
  });

  it("menambah hanya untuk selisih hitung dan wajib catatan", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Tambah" }));
    const options = within(screen.getByLabelText("Alasan")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Selisih hitung"]);
    await user.type(screen.getByLabelText("Jumlah"), "1");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Isi catatan untuk alasan ini.");
    expect(adjustStock).not.toHaveBeenCalled();
  });

  it("pengurangan melebihi sisa ditolak di browser", async () => {
    const user = await open();
    await user.type(screen.getByLabelText("Jumlah"), "6");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pengurangan melebihi sisa batch (5 kapsul).");
    expect(adjustStock).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run tests/unit/components/stock-item-table.test.tsx tests/unit/components/stock-item-dialog.test.tsx tests/unit/components/adjust-stock-dialog.test.tsx`
Expected: FAIL, karena komponen `@/components/admin/stock/*` belum ada.

- [ ] **Step 2: Komponen**

Buat `src/components/admin/stock/stock-item-table.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { STOCK_FLAG_LABEL, STOCK_ITEM_KIND_LABEL } from "@/lib/stock";
import type { StockItemRow } from "@/server/stock-read";
import { EmptyState } from "../page-layout";

/** Daftar barang satu cabang (spec stok 5.1). */
export function StockItemTable({ rows }: { rows: StockItemRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada barang yang cocok.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kode</TableHead>
          <TableHead>Barang</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead className="text-right">Stok tersedia</TableHead>
          <TableHead className="text-right">Harga jual</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs">{row.code}</TableCell>
            <TableCell>
              <Link href={`/admin/stok/barang/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.name}
              </Link>
              {(row.flags.length > 0 || !row.isActive) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {row.flags.map((flag) => (
                    <Badge key={flag} variant={flag === "KEDALUWARSA" ? "destructive" : "outline"}>
                      {STOCK_FLAG_LABEL[flag]}
                    </Badge>
                  ))}
                  {!row.isActive && <Badge variant="outline">Nonaktif</Badge>}
                </div>
              )}
            </TableCell>
            <TableCell>{STOCK_ITEM_KIND_LABEL[row.kind]}</TableCell>
            <TableCell className="text-right">
              <div>
                {row.available} {row.unit}
              </div>
              {row.onHand > row.available && (
                <div className="text-xs text-destructive">{row.onHand - row.available} kedaluwarsa</div>
              )}
            </TableCell>
            <TableCell className="text-right">{row.sellPrice === null ? "—" : formatRupiah(row.sellPrice)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Buat `src/components/admin/stock/stock-item-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STOCK_ITEM_KIND_LABEL, validateStockItem, type StockItemInput, type StockItemKindValue } from "@/lib/stock";
import { createStockItem, updateStockItem } from "@/server/stock-catalog";
import { RupiahInput } from "../rupiah-input";

const EMPTY: StockItemInput = { code: "", name: "", kind: "OBAT", unit: "", sellPrice: null, minStock: 0, notes: "" };
const KINDS = Object.keys(STOCK_ITEM_KIND_LABEL) as StockItemKindValue[];
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Tambah atau ubah barang (spec stok 5.1). Aturan isian diulang di server. */
export function StockItemDialog({
  itemId,
  initial,
  triggerLabel,
}: {
  itemId?: string;
  initial?: StockItemInput;
  triggerLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<StockItemInput>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof StockItemInput>(key: K, next: StockItemInput[K]) => setValue((v) => ({ ...v, [key]: next }));

  function save() {
    const checked = validateStockItem(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = itemId ? await updateStockItem(itemId, value) : await createStockItem(value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(itemId ? "Barang diperbarui." : `${checked.value.name} ditambahkan.`);
        setOpen(false);
        if (!itemId) setValue(EMPTY);
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
        <Button variant={itemId ? "outline" : "default"}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{itemId ? "Ubah barang" : "Tambah barang"}</DialogTitle>
          <DialogDescription>Obat dan produk yang dibeli dari supplier dan distok di klinik.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="stock-item-code">Kode</Label>
            <Input id="stock-item-code" value={value.code} onChange={(e) => set("code", e.target.value)} placeholder="OBT-001" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stock-item-kind">Jenis</Label>
            <select
              id="stock-item-kind"
              className={selectClass}
              value={value.kind}
              onChange={(e) => set("kind", e.target.value as StockItemKindValue)}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {STOCK_ITEM_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="stock-item-name">Nama</Label>
            <Input id="stock-item-name" value={value.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stock-item-unit">Satuan</Label>
            <Input id="stock-item-unit" value={value.unit} onChange={(e) => set("unit", e.target.value)} placeholder="tablet, botol, tube" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stock-item-min">Batas menipis</Label>
            <Input
              id="stock-item-min"
              type="number"
              min={0}
              inputMode="numeric"
              value={value.minStock}
              onChange={(e) => set("minStock", e.target.value === "" ? 0 : Number(e.target.value))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="stock-item-price">Harga jual</Label>
            <RupiahInput
              id="stock-item-price"
              value={value.sellPrice}
              onChange={(next) => set("sellPrice", next)}
              placeholder="Boleh dikosongkan"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="stock-item-notes">Catatan</Label>
            <Input id="stock-item-notes" value={value.notes} onChange={(e) => set("notes", e.target.value)} />
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

Buat `src/components/admin/stock/stock-item-active-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setStockItemActive } from "@/server/stock-catalog";

/** Barang dinonaktifkan, tidak dihapus (spec stok 5.1). */
export function StockItemActiveButton({ itemId, active }: { itemId: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        const result = await setStockItemActive(itemId, !active);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(active ? "Barang dinonaktifkan." : "Barang diaktifkan kembali.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" onClick={toggle} disabled={pending}>
      {active ? "Nonaktifkan" : "Aktifkan kembali"}
    </Button>
  );
}
```

Buat `src/components/admin/stock/adjust-stock-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADJUST_REASON_LABEL, DECREASE_REASONS, INCREASE_REASONS, validateAdjustment, type AdjustReasonValue } from "@/lib/stock";
import { adjustStock } from "@/server/stock-movements";

type Direction = "KURANGI" | "TAMBAH";
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Penyesuaian satu batch (spec stok 5.4). Batas sisa diperiksa lagi di server secara atomik. */
export function AdjustStockDialog({ batch }: { batch: { id: string; label: string; remaining: number; unit: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("KURANGI");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<AdjustReasonValue>(DECREASE_REASONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasons = direction === "KURANGI" ? DECREASE_REASONS : INCREASE_REASONS;

  function changeDirection(next: Direction) {
    setDirection(next);
    setReason(next === "KURANGI" ? DECREASE_REASONS[0] : INCREASE_REASONS[0]);
    setError(null);
  }

  function save() {
    const input = { batchId: batch.id, direction, quantity: Number(quantity), reason, note };
    const checked = validateAdjustment(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    if (checked.value.delta < 0 && -checked.value.delta > batch.remaining) {
      setError(`Pengurangan melebihi sisa batch (${batch.remaining} ${batch.unit}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await adjustStock(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Stok disesuaikan.");
        setOpen(false);
        setQuantity("");
        setNote("");
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
        <Button size="sm" variant="outline" aria-label={`Penyesuaian ${batch.label}`}>
          Penyesuaian
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Penyesuaian stok</DialogTitle>
          <DialogDescription>
            {batch.label} · sisa {batch.remaining} {batch.unit}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2" role="group" aria-label="Arah penyesuaian">
            {(["KURANGI", "TAMBAH"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={direction === value ? "default" : "outline"}
                aria-pressed={direction === value}
                onClick={() => changeDirection(value)}
              >
                {value === "KURANGI" ? "Kurangi" : "Tambah"}
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjust-quantity">Jumlah</Label>
            <Input id="adjust-quantity" type="number" min={1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjust-reason">Alasan</Label>
            <select
              id="adjust-reason"
              className={selectClass}
              value={reason}
              onChange={(e) => setReason(e.target.value as AdjustReasonValue)}
            >
              {reasons.map((value) => (
                <option key={value} value={value}>
                  {ADJUST_REASON_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjust-note">Catatan</Label>
            <Input id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} />
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

Run: `npx vitest run tests/unit/components/stock-item-table.test.tsx tests/unit/components/stock-item-dialog.test.tsx tests/unit/components/adjust-stock-dialog.test.tsx`
Expected: PASS semua.

- [ ] **Step 3: Halaman**

Buat `src/app/(admin)/admin/stok/page.tsx`:

```tsx
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { StockItemTable } from "@/components/admin/stock/stock-item-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  isStockFlag,
  STOCK_FLAG_LABEL,
  STOCK_ITEM_KIND_LABEL,
  summarizeStock,
  type StockFlag,
  type StockItemKindValue,
} from "@/lib/stock";
import { getBranches } from "@/server/catalog";
import { requireCapability } from "@/server/session";
import { listStockItems } from "@/server/stock-read";

export const metadata = { title: "Stok" };

type Search = { cabang?: string; jenis?: string; tanda?: string; cari?: string };

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const FLAGS = Object.keys(STOCK_FLAG_LABEL) as StockFlag[];
const KINDS = Object.keys(STOCK_ITEM_KIND_LABEL) as StockItemKindValue[];

export default async function StockPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requireCapability("stock:read");
  const params = await searchParams;
  const canManage = can(staff.role, "stock:manage");

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title="Stok"
          description="Obat dan produk per cabang, per batch dan tanggal kedaluwarsa."
          actions={canManage ? <StockItemDialog triggerLabel="+ Barang" /> : undefined}
        />
        <ItemsTab params={params} />
      </PageBody>
    </>
  );
}

async function ItemsTab({ params }: { params: Search }) {
  const branches = (await getBranches()).filter((branch) => branch.status === "AKTIF");
  if (branches.length === 0) return <EmptyState>Belum ada cabang aktif.</EmptyState>;
  const branch = branches.find((b) => b.id === params.cabang) ?? branches[0];
  const kind = KINDS.find((k) => k === params.jenis);
  const flag: StockFlag | "NONAKTIF" | undefined =
    params.tanda === "NONAKTIF" ? "NONAKTIF" : isStockFlag(params.tanda) ? params.tanda : undefined;
  const q = params.cari?.trim() || undefined;
  const filtered = Boolean(kind || flag || q);

  const rows = await listStockItems({ branchId: branch.id, kind, flag, q });
  // Ringkasan selalu untuk seluruh barang aktif cabang, bukan hanya hasil saringan.
  const summary = summarizeStock(filtered ? await listStockItems({ branchId: branch.id }) : rows);

  return (
    <>
      <SectionCard title={`Ringkasan ${branch.name}`}>
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Nilai stok (harga beli)</dt>
            <dd className="text-lg font-semibold">{formatRupiah(summary.value)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Menipis</dt>
            <dd className="text-lg font-semibold">{summary.low} barang</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Segera kedaluwarsa</dt>
            <dd className="text-lg font-semibold">{summary.expiringSoon} barang</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kedaluwarsa</dt>
            <dd className="text-lg font-semibold">{summary.expired} barang</dd>
          </div>
        </dl>
      </SectionCard>

      <Form action="/admin/stok" className="flex flex-wrap items-end gap-2" aria-label="Saring barang">
        {branches.length > 1 && (
          <select name="cabang" defaultValue={branch.id} aria-label="Cabang" className={selectClass}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select name="jenis" defaultValue={kind ?? ""} aria-label="Jenis" className={selectClass}>
          <option value="">Semua jenis</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {STOCK_ITEM_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select name="tanda" defaultValue={flag ?? ""} aria-label="Tanda" className={selectClass}>
          <option value="">Semua barang aktif</option>
          {FLAGS.map((f) => (
            <option key={f} value={f}>
              {STOCK_FLAG_LABEL[f]}
            </option>
          ))}
          <option value="NONAKTIF">Nonaktif</option>
        </select>
        <Input name="cari" defaultValue={q ?? ""} placeholder="Cari nama atau kode" aria-label="Cari nama atau kode" className="w-56" />
        <Button type="submit" variant="outline">
          Terapkan
        </Button>
      </Form>

      <SectionCard title="Barang" flush>
        <StockItemTable rows={rows} />
      </SectionCard>
    </>
  );
}
```

Buat `src/app/(admin)/admin/stok/barang/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { AdjustStockDialog } from "@/components/admin/stock/adjust-stock-dialog";
import { StockItemActiveButton } from "@/components/admin/stock/stock-item-active-button";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ADJUST_REASON_LABEL, dateLabel, MOVEMENT_KIND_LABEL, STOCK_ITEM_KIND_LABEL } from "@/lib/stock";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { getStockItemDetail } from "@/server/stock-read";

export const metadata = { title: "Detail barang" };

export default async function StockItemPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("stock:read");
  const detail = await getStockItemDetail((await params).id);
  if (!detail) notFound();
  const { item, batches, movements } = detail;
  const canManage = can(staff.role, "stock:manage");

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title={item.name}
          trail={[{ label: "Stok", href: "/admin/stok" }, { label: item.code }]}
          description={`${STOCK_ITEM_KIND_LABEL[item.kind]} · satuan ${item.unit} · harga jual ${
            item.sellPrice === null ? "belum diisi" : formatRupiah(item.sellPrice)
          } · batas menipis ${item.minStock}`}
          actions={
            canManage ? (
              <>
                <StockItemDialog
                  itemId={item.id}
                  triggerLabel="Ubah barang"
                  initial={{
                    code: item.code,
                    name: item.name,
                    kind: item.kind,
                    unit: item.unit,
                    sellPrice: item.sellPrice,
                    minStock: item.minStock,
                    notes: item.notes ?? "",
                  }}
                />
                <StockItemActiveButton itemId={item.id} active={item.isActive} />
              </>
            ) : undefined
          }
        />
        {!item.isActive && <Badge variant="outline">Nonaktif</Badge>}

        <SectionCard title="Batch" flush>
          {batches.length === 0 ? (
            <EmptyState>Belum ada stok untuk barang ini.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Kedaluwarsa</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead className="text-right">Harga beli</TableHead>
                  <TableHead>Faktur</TableHead>
                  {canManage && <TableHead>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>{batch.branchName}</TableCell>
                    <TableCell>{batch.batchNumber ?? "—"}</TableCell>
                    <TableCell>
                      {dateLabel(batch.expiryDate)}
                      {batch.expired && (
                        <Badge variant="destructive" className="ml-2">
                          Kedaluwarsa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {batch.quantityRemaining} {item.unit}
                    </TableCell>
                    <TableCell className="text-right">{formatRupiah(batch.unitCost)}</TableCell>
                    <TableCell>
                      <Link href={`/admin/stok/masuk/${batch.invoiceId}`} className="underline-offset-4 hover:underline">
                        {batch.invoiceNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">{batch.supplierName}</div>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {!batch.invoiceCancelled && (
                          <AdjustStockDialog
                            batch={{
                              id: batch.id,
                              label: `${item.name} batch ${batch.batchNumber ?? "-"}`,
                              remaining: batch.quantityRemaining,
                              unit: item.unit,
                            }}
                          />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard title="Riwayat stok" description="100 perubahan terakhir, terbaru di atas." flush>
          {movements.length === 0 ? (
            <EmptyState>Belum ada perubahan stok.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Staf</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateWithYear(movement.createdAt)} {minutesToTimeLabel(witaMinutesOfDay(movement.createdAt))}
                    </TableCell>
                    <TableCell>{MOVEMENT_KIND_LABEL[movement.kind]}</TableCell>
                    <TableCell className="text-right">
                      {movement.quantity > 0 ? "+" : ""}
                      {movement.quantity}
                    </TableCell>
                    <TableCell>
                      {movement.batchNumber ?? "—"}
                      <div className="text-xs text-muted-foreground">{movement.branchName}</div>
                    </TableCell>
                    <TableCell>{movement.staffName}</TableCell>
                    <TableCell>
                      {movement.reason ? ADJUST_REASON_LABEL[movement.reason] : ""}
                      {movement.note && <div className="text-xs text-muted-foreground">{movement.note}</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
```

- [ ] **Step 4: Unit, lint, tipe, build, commit**

Run: `npx vitest run > "$WS/t7.log" 2>&1; grep -E "Test Files|Tests " "$WS/t7.log"; npx eslint src/components/admin/stock "src/app/(admin)/admin/stok" tests/unit/components; npx tsc --noEmit -p . > "$WS/t7-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS (termasuk uji arsitektur), eslint bersih, `tsc exit 0`.

```bash
git add src/components/admin/stock "src/app/(admin)/admin/stok" tests/unit/components/stock-item-table.test.tsx \
  tests/unit/components/stock-item-dialog.test.tsx tests/unit/components/adjust-stock-dialog.test.tsx
git commit -m "feat: add the stock page with per-branch item list, item detail, and stock adjustment dialog"
```

---

### Task 8: Layar barang masuk, detail faktur (retur, batal), dan supplier

**Files:**
- Create:
  - `src/components/admin/stock/payable-status-badge.tsx`, `purchase-table.tsx`, `purchase-form.tsx`, `supplier-dialog.tsx`, `supplier-active-button.tsx`, `supplier-table.tsx`, `supplier-return-dialog.tsx`, `cancel-purchase-dialog.tsx` (semuanya di `src/components/admin/stock/`);
  - `src/app/(admin)/admin/stok/masuk/baru/page.tsx`, `src/app/(admin)/admin/stok/masuk/[id]/page.tsx`.
- Modify: `src/app/(admin)/admin/stok/page.tsx` (tab Barang / Barang masuk / Supplier)
- Test: `tests/unit/components/purchase-form.test.tsx`, `tests/unit/components/supplier-return-dialog.test.tsx`, `tests/unit/components/cancel-purchase-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`validatePurchase`, `validateReturn`, `validateReason`, `validateSupplier`, `isDateString`, `dateLabel`, `DEFAULT_DUE_DAYS`, `PAYABLE_STATUS_LABEL`, tipe `PurchaseInput`, `SupplierInput`, `PayableStatus`), Task 3 (`createSupplier`, `updateSupplier`, `setSupplierActive`, `listSuppliers`, `listStockItemOptions`, `listSupplierOptions`, tipe `StockItemOption`, `SupplierOption`, `SupplierRow`), Task 4 (`createPurchase`, `cancelPurchase`, `listPurchases`, `getPurchaseDetail`, tipe `PurchaseRow`), Task 5 (`createSupplierReturn`), Task 7 (`StockItemDialog`, `StockItemTable`, halaman `/admin/stok`), sudah ada: `PageTabs`.
- Produces:
  - `PayableStatusBadge({ status, overdue }: { status: PayableStatus; overdue: boolean })`;
  - `PurchaseTable({ rows }: { rows: PurchaseRow[] })`;
  - `PurchaseForm({ items, suppliers, branches, today }: { items: StockItemOption[]; suppliers: SupplierOption[]; branches: { id: string; name: string }[]; today: string })`;
  - `SupplierDialog({ supplierId?, initial?, triggerLabel, onSaved? }: { supplierId?: string; initial?: SupplierInput; triggerLabel: string; onSaved?: (supplier: { id: string; name: string }) => void })`;
  - `SupplierTable({ rows, canManage }: { rows: SupplierRow[]; canManage: boolean })`;
  - `SupplierReturnDialog({ invoiceId, lines }: { invoiceId: string; lines: { batchId: string; label: string; remaining: number; unitCost: number; unit: string }[] })`;
  - `CancelPurchaseDialog({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string })`;
  - halaman `/admin/stok?tab=masuk|supplier`, `/admin/stok/masuk/baru`, `/admin/stok/masuk/[id]` (Task 9 menambah bagian Pembayaran).

- [ ] **Step 1: Tulis uji komponen (gagal)**

Buat `tests/unit/components/purchase-form.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseForm } from "@/components/admin/stock/purchase-form";
import { createPurchase } from "@/server/purchases";
import { createSupplier } from "@/server/stock-catalog";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/purchases", () => ({ createPurchase: vi.fn() }));
vi.mock("@/server/stock-catalog", () => ({ createSupplier: vi.fn(), updateSupplier: vi.fn() }));

const items = [
  { id: "obat", code: "OBT-001", name: "Amoxicillin", unit: "kapsul", kind: "OBAT" as const },
  { id: "serum", code: "PRD-001", name: "Serum C", unit: "botol", kind: "PRODUK" as const },
];
const TODAY = "2026-10-07";

function renderForm() {
  return render(
    <PurchaseForm items={items} suppliers={[{ id: "s1", name: "Kimia Farma" }]} branches={[{ id: "b1", name: "SunDY Mahakeret" }]} today={TODAY} />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("PurchaseForm", () => {
  it("menghitung total, mengirim faktur, lalu membuka detailnya", async () => {
    const user = userEvent.setup();
    vi.mocked(createPurchase).mockResolvedValue({ ok: true, data: { id: "p1" } });
    renderForm();
    await user.selectOptions(screen.getByLabelText("Supplier"), "s1");
    await user.type(screen.getByLabelText("Nomor faktur"), "INV-1");
    await user.selectOptions(screen.getByLabelText("Barang baris 1"), "obat");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "10");
    await user.type(screen.getByLabelText("Harga beli baris 1"), "5000");
    await user.type(screen.getByLabelText("Batch baris 1"), "B1");
    fireEvent.change(screen.getByLabelText("Kedaluwarsa baris 1"), { target: { value: "2027-06-01" } });
    await user.click(screen.getByRole("button", { name: "+ Tambah baris" }));
    await user.selectOptions(screen.getByLabelText("Barang baris 2"), "serum");
    await user.type(screen.getByLabelText("Jumlah baris 2"), "2");
    await user.type(screen.getByLabelText("Harga beli baris 2"), "75000");
    expect(screen.getByText("Rp 200.000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan barang masuk" }));
    await waitFor(() =>
      expect(createPurchase).toHaveBeenCalledWith({
        supplierId: "s1",
        branchId: "b1",
        invoiceNumber: "INV-1",
        invoiceDate: "2026-10-07",
        dueDate: "2026-11-06",
        notes: "",
        lines: [
          { itemId: "obat", quantity: 10, unitCost: 5000, batchNumber: "B1", expiryDate: "2027-06-01" },
          { itemId: "serum", quantity: 2, unitCost: 75000, batchNumber: "", expiryDate: "" },
        ],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/stok/masuk/p1"));
  });

  it("obat tanpa kedaluwarsa ditolak di browser tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Supplier"), "s1");
    await user.type(screen.getByLabelText("Nomor faktur"), "INV-2");
    await user.selectOptions(screen.getByLabelText("Barang baris 1"), "obat");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "1");
    await user.type(screen.getByLabelText("Harga beli baris 1"), "1000");
    await user.click(screen.getByRole("button", { name: "Simpan barang masuk" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Baris 1: isi tanggal kedaluwarsa obat.");
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it("jatuh tempo mengikuti tanggal faktur + 30 hari sampai diubah sendiri", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Tanggal faktur"), { target: { value: "2026-10-01" } });
    expect(screen.getByLabelText("Jatuh tempo")).toHaveValue("2026-10-31");
    fireEvent.change(screen.getByLabelText("Jatuh tempo"), { target: { value: "2026-11-15" } });
    fireEvent.change(screen.getByLabelText("Tanggal faktur"), { target: { value: "2026-10-02" } });
    expect(screen.getByLabelText("Jatuh tempo")).toHaveValue("2026-11-15");
  });

  it("supplier baru dari dialog langsung terpilih", async () => {
    const user = userEvent.setup();
    vi.mocked(createSupplier).mockResolvedValue({ ok: true, data: { id: "s2", name: "Medika Jaya" } });
    renderForm();
    await user.click(screen.getByRole("button", { name: "+ Supplier baru" }));
    const dialog = screen.getByRole("dialog", { name: "Tambah supplier" });
    await user.type(within(dialog).getByLabelText("Nama supplier"), "Medika Jaya");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(screen.getByLabelText("Supplier")).toHaveValue("s2"));
  });
});
```

Buat `tests/unit/components/supplier-return-dialog.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierReturnDialog } from "@/components/admin/stock/supplier-return-dialog";
import { createSupplierReturn } from "@/server/stock-movements";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/stock-movements", () => ({ createSupplierReturn: vi.fn() }));

const lines = [
  { batchId: "b1", label: "Amoxicillin batch B1", remaining: 10, unitCost: 5000, unit: "kapsul" },
  { batchId: "b2", label: "Serum C batch -", remaining: 2, unitCost: 75000, unit: "botol" },
];

beforeEach(() => vi.clearAllMocks());

async function open() {
  const user = userEvent.setup();
  render(<SupplierReturnDialog invoiceId="p1" lines={lines} />);
  await user.click(screen.getByRole("button", { name: "Retur ke supplier" }));
  return user;
}

describe("SupplierReturnDialog", () => {
  it("menghitung nilai retur dan mengirim baris yang diisi saja", async () => {
    vi.mocked(createSupplierReturn).mockResolvedValue({ ok: true, data: { id: "r1" } });
    const user = await open();
    await user.type(screen.getByLabelText("Jumlah retur Amoxicillin batch B1"), "2");
    expect(screen.getByText("Rp 10.000")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Catatan retur"), "Kemasan penyok");
    await user.click(screen.getByRole("button", { name: "Simpan retur" }));
    await waitFor(() =>
      expect(createSupplierReturn).toHaveBeenCalledWith({ invoiceId: "p1", lines: [{ batchId: "b1", quantity: 2 }], note: "Kemasan penyok" }),
    );
  });

  it("menolak jumlah melebihi sisa dan retur kosong", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Simpan retur" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pilih minimal satu barang untuk diretur.");
    await user.type(screen.getByLabelText("Jumlah retur Serum C batch -"), "3");
    await user.click(screen.getByRole("button", { name: "Simpan retur" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Jumlah retur Serum C batch - melebihi sisa (2 botol).");
    expect(createSupplierReturn).not.toHaveBeenCalled();
  });
});
```

Buat `tests/unit/components/cancel-purchase-dialog.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CancelPurchaseDialog } from "@/components/admin/stock/cancel-purchase-dialog";
import { cancelPurchase } from "@/server/purchases";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/purchases", () => ({ cancelPurchase: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("CancelPurchaseDialog", () => {
  it("alasan wajib, lalu membatalkan faktur", async () => {
    const user = userEvent.setup();
    vi.mocked(cancelPurchase).mockResolvedValue({ ok: true, data: undefined });
    render(<CancelPurchaseDialog invoiceId="p1" invoiceNumber="INV-1" />);
    await user.click(screen.getByRole("button", { name: "Batalkan faktur" }));
    const dialog = screen.getByRole("dialog", { name: "Batalkan faktur INV-1?" });
    await user.click(within(dialog).getByRole("button", { name: "Batalkan faktur" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Isi alasan.");
    expect(cancelPurchase).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Alasan pembatalan"), "Harga beli salah ketik");
    await user.click(within(dialog).getByRole("button", { name: "Batalkan faktur" }));
    await waitFor(() => expect(cancelPurchase).toHaveBeenCalledWith({ invoiceId: "p1", reason: "Harga beli salah ketik" }));
  });

  it("menampilkan galat dari server", async () => {
    const user = userEvent.setup();
    vi.mocked(cancelPurchase).mockResolvedValue({ ok: false, error: "Faktur ini sudah dibatalkan." });
    render(<CancelPurchaseDialog invoiceId="p1" invoiceNumber="INV-1" />);
    await user.click(screen.getByRole("button", { name: "Batalkan faktur" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Alasan pembatalan"), "Ganda");
    await user.click(within(dialog).getByRole("button", { name: "Batalkan faktur" }));
    expect(await within(dialog).findByText("Faktur ini sudah dibatalkan.")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/components/purchase-form.test.tsx tests/unit/components/supplier-return-dialog.test.tsx tests/unit/components/cancel-purchase-dialog.test.tsx`
Expected: FAIL, karena komponennya belum ada.

- [ ] **Step 2: Komponen faktur dan supplier**

Buat `src/components/admin/stock/payable-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { PAYABLE_STATUS_LABEL, type PayableStatus } from "@/lib/stock";

/** Status faktur (spec stok 4.2), ditambah tanda Terlambat. */
export function PayableStatusBadge({ status, overdue }: { status: PayableStatus; overdue: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={status === "LUNAS" ? "default" : "outline"}>{PAYABLE_STATUS_LABEL[status]}</Badge>
      {overdue && <Badge variant="destructive">Terlambat</Badge>}
    </span>
  );
}
```

Buat `src/components/admin/stock/purchase-table.tsx`:

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { dateLabel } from "@/lib/stock";
import type { PurchaseRow } from "@/server/purchase-read";
import { EmptyState } from "../page-layout";
import { PayableStatusBadge } from "./payable-status-badge";

/** Tab "Barang masuk": faktur terbaru di atas. */
export function PurchaseTable({ rows }: { rows: PurchaseRow[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada barang masuk.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Faktur</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap">{dateLabel(row.invoiceDate)}</TableCell>
            <TableCell>
              <Link href={`/admin/stok/masuk/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.invoiceNumber}
              </Link>
              <div className="text-xs text-muted-foreground">
                {row.supplierName} · {row.lineCount} baris
              </div>
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="text-right">{formatRupiah(row.total)}</TableCell>
            <TableCell>
              <PayableStatusBadge status={row.status} overdue={row.overdue} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Buat `src/components/admin/stock/supplier-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateSupplier, type SupplierInput } from "@/lib/stock";
import { createSupplier, updateSupplier } from "@/server/stock-catalog";

const EMPTY: SupplierInput = { name: "", phone: "", address: "", notes: "" };

/** Tambah atau ubah supplier (spec stok 5.6). `onSaved` dipanggil setelah supplier baru dibuat. */
export function SupplierDialog({
  supplierId,
  initial,
  triggerLabel,
  onSaved,
}: {
  supplierId?: string;
  initial?: SupplierInput;
  triggerLabel: string;
  onSaved?: (supplier: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<SupplierInput>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof SupplierInput, next: string) => setValue((v) => ({ ...v, [key]: next }));

  function save() {
    const checked = validateSupplier(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (supplierId) {
          const result = await updateSupplier(supplierId, value);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success("Supplier diperbarui.");
        } else {
          const result = await createSupplier(value);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(`${result.data.name} ditambahkan.`);
          onSaved?.(result.data);
          setValue(EMPTY);
        }
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
        <Button type="button" variant="outline">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplierId ? "Ubah supplier" : "Tambah supplier"}</DialogTitle>
          <DialogDescription>Pemasok obat dan produk klinik.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="supplier-name">Nama supplier</Label>
            <Input id="supplier-name" value={value.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-phone">Telepon</Label>
            <Input id="supplier-phone" value={value.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-address">Alamat</Label>
            <Input id="supplier-address" value={value.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-notes">Catatan</Label>
            <Input id="supplier-notes" value={value.notes} onChange={(e) => set("notes", e.target.value)} />
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

Buat `src/components/admin/stock/supplier-active-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setSupplierActive } from "@/server/stock-catalog";

export function SupplierActiveButton({ supplierId, name, active }: { supplierId: string; name: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        const result = await setSupplierActive(supplierId, !active);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(active ? `${name} dinonaktifkan.` : `${name} diaktifkan kembali.`);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Button type="button" size="sm" variant="ghost" onClick={toggle} disabled={pending} aria-label={`${active ? "Nonaktifkan" : "Aktifkan"} ${name}`}>
      {active ? "Nonaktifkan" : "Aktifkan"}
    </Button>
  );
}
```

Buat `src/components/admin/stock/supplier-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { SupplierRow } from "@/server/stock-read";
import { EmptyState } from "../page-layout";
import { SupplierActiveButton } from "./supplier-active-button";
import { SupplierDialog } from "./supplier-dialog";

/** Tab "Supplier" (spec stok 5.6). Kolom sisa hutang hanya untuk pemegang payable:manage. */
export function SupplierTable({ rows, canManage }: { rows: SupplierRow[]; canManage: boolean }) {
  if (rows.length === 0) return <EmptyState>Belum ada supplier.</EmptyState>;
  const showBalance = rows.some((row) => row.balance !== null);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nama</TableHead>
          <TableHead>Telepon</TableHead>
          <TableHead>Alamat</TableHead>
          {showBalance && <TableHead className="text-right">Sisa hutang</TableHead>}
          <TableHead>Status</TableHead>
          {canManage && <TableHead>Aksi</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="font-medium">{row.name}</div>
              {row.notes && <div className="text-xs text-muted-foreground">{row.notes}</div>}
            </TableCell>
            <TableCell>{row.phone ?? "—"}</TableCell>
            <TableCell>{row.address ?? "—"}</TableCell>
            {showBalance && <TableCell className="text-right">{formatRupiah(row.balance ?? 0)}</TableCell>}
            <TableCell>
              <Badge variant={row.isActive ? "default" : "outline"}>{row.isActive ? "Aktif" : "Nonaktif"}</Badge>
            </TableCell>
            {canManage && (
              <TableCell className="flex flex-wrap gap-1">
                <SupplierDialog
                  supplierId={row.id}
                  triggerLabel="Ubah"
                  initial={{ name: row.name, phone: row.phone ?? "", address: row.address ?? "", notes: row.notes ?? "" }}
                />
                <SupplierActiveButton supplierId={row.id} name={row.name} active={row.isActive} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Buat `src/components/admin/stock/purchase-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { DEFAULT_DUE_DAYS, isDateString, validatePurchase, type PurchaseInput } from "@/lib/stock";
import { addDaysToDateString } from "@/lib/time";
import { createPurchase } from "@/server/purchases";
import type { StockItemOption, SupplierOption } from "@/server/stock-read";
import { RupiahInput } from "../rupiah-input";
import { SupplierDialog } from "./supplier-dialog";

type LineDraft = { key: number; itemId: string; quantity: string; unitCost: number | null; batchNumber: string; expiryDate: string };

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const emptyLine = (key: number): LineDraft => ({ key, itemId: "", quantity: "", unitCost: null, batchNumber: "", expiryDate: "" });

/**
 * Barang masuk dari faktur kertas supplier (spec stok 5.2): kepala faktur, lalu baris barang
 * dengan jumlah, harga beli, batch, dan kedaluwarsa. Aturannya diulang di server.
 */
export function PurchaseForm({
  items,
  suppliers: initialSuppliers,
  branches,
  today,
}: {
  items: StockItemOption[];
  suppliers: SupplierOption[];
  branches: { id: string; name: string }[];
  /** Hari ini dalam WITA, dari server. */
  today: string;
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDaysToDateString(today, DEFAULT_DUE_DAYS));
  const [dueTouched, setDueTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const total = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    return Number.isInteger(quantity) && quantity > 0 && line.unitCost !== null ? sum + quantity * line.unitCost : sum;
  }, 0);

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  function addLine() {
    setLines((current) => [...current, emptyLine(nextKey)]);
    setNextKey((key) => key + 1);
  }

  function changeInvoiceDate(value: string) {
    setInvoiceDate(value);
    if (!dueTouched && isDateString(value)) setDueDate(addDaysToDateString(value, DEFAULT_DUE_DAYS));
  }

  function submit() {
    const input: PurchaseInput = {
      supplierId,
      branchId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      notes,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        unitCost: line.unitCost ?? Number.NaN,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
      })),
    };
    const checked = validatePurchase(input, { today, kindOf: (id) => byId.get(id)?.kind ?? null });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPurchase(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/admin/stok/masuk/${result.data.id}`);
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2" aria-label="Faktur supplier">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="purchase-supplier">Supplier</Label>
          <div className="flex flex-wrap gap-2">
            <select
              id="purchase-supplier"
              className={`${selectClass} sm:w-96`}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Pilih supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <SupplierDialog
              triggerLabel="+ Supplier baru"
              onSaved={(supplier) => {
                setSuppliers((current) => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)));
                setSupplierId(supplier.id);
              }}
            />
          </div>
        </div>
        {branches.length > 1 ? (
          <div className="space-y-1">
            <Label htmlFor="purchase-branch">Cabang penerima</Label>
            <select id="purchase-branch" className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Cabang penerima: {branches[0]?.name}</p>
        )}
        <div className="space-y-1">
          <Label htmlFor="purchase-number">Nomor faktur</Label>
          <Input id="purchase-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="purchase-date">Tanggal faktur</Label>
          <Input id="purchase-date" type="date" max={today} value={invoiceDate} onChange={(e) => changeInvoiceDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="purchase-due">Jatuh tempo</Label>
          <Input
            id="purchase-due"
            type="date"
            min={invoiceDate}
            value={dueDate}
            onChange={(e) => {
              setDueTouched(true);
              setDueDate(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="purchase-notes">Catatan</Label>
          <Input id="purchase-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Barang di faktur">
        {lines.map((line, index) => {
          const n = index + 1;
          const unit = byId.get(line.itemId)?.unit;
          return (
            <fieldset key={line.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6">
              <legend className="px-1 text-sm font-medium">Baris {n}</legend>
              <select
                aria-label={`Barang baris ${n}`}
                className={`${selectClass} sm:col-span-2`}
                value={line.itemId}
                onChange={(e) => update(line.key, { itemId: e.target.value })}
              >
                <option value="">Pilih barang</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
              <Input
                aria-label={`Jumlah baris ${n}`}
                type="number"
                min={1}
                inputMode="numeric"
                placeholder={unit ? `Jumlah (${unit})` : "Jumlah"}
                value={line.quantity}
                onChange={(e) => update(line.key, { quantity: e.target.value })}
              />
              <RupiahInput
                aria-label={`Harga beli baris ${n}`}
                placeholder="Harga beli per satuan"
                value={line.unitCost}
                onChange={(next) => update(line.key, { unitCost: next })}
              />
              <Input
                aria-label={`Batch baris ${n}`}
                placeholder="Nomor batch"
                value={line.batchNumber}
                onChange={(e) => update(line.key, { batchNumber: e.target.value })}
              />
              <Input
                aria-label={`Kedaluwarsa baris ${n}`}
                type="date"
                min={today}
                value={line.expiryDate}
                onChange={(e) => update(line.key, { expiryDate: e.target.value })}
              />
              {lines.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="justify-self-start sm:col-span-6"
                  aria-label={`Hapus baris ${n}`}
                  onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                >
                  Hapus
                </Button>
              )}
            </fieldset>
          );
        })}
        <Button type="button" variant="outline" onClick={addLine}>
          + Tambah baris
        </Button>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm" aria-live="polite">
          Total faktur: <strong className="text-base">{formatRupiah(total)}</strong>
        </p>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan barang masuk"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

Buat `src/components/admin/stock/supplier-return-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { validateReturn } from "@/lib/stock";
import { createSupplierReturn } from "@/server/stock-movements";

type ReturnLine = { batchId: string; label: string; remaining: number; unitCost: number; unit: string };

/** Retur ke supplier dari halaman faktur (spec stok 5.5). Nilai retur mengurangi hutang faktur ini. */
export function SupplierReturnDialog({ invoiceId, lines }: { invoiceId: string; lines: ReturnLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const picked = lines
    .map((line) => ({ line, quantity: Number(quantities[line.batchId] ?? "") }))
    .filter(({ quantity }) => quantity !== 0 && !Number.isNaN(quantity));
  const total = picked.reduce((sum, { line, quantity }) => (Number.isInteger(quantity) && quantity > 0 ? sum + quantity * line.unitCost : sum), 0);

  function save() {
    const over = picked.find(({ line, quantity }) => quantity > line.remaining);
    if (over) {
      setError(`Jumlah retur ${over.line.label} melebihi sisa (${over.line.remaining} ${over.line.unit}).`);
      return;
    }
    const input = { invoiceId, lines: picked.map(({ line, quantity }) => ({ batchId: line.batchId, quantity })), note };
    const checked = validateReturn(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createSupplierReturn(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Retur ${formatRupiah(total)} dicatat.`);
        setOpen(false);
        setQuantities({});
        setNote("");
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
        <Button type="button" variant="outline">
          Retur ke supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Retur ke supplier</DialogTitle>
          <DialogDescription>Isi jumlah yang dikembalikan. Stok berkurang dan hutang faktur ini berkurang sebesar nilainya.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.batchId} className="grid items-center gap-2 sm:grid-cols-[1fr_8rem]">
              <Label htmlFor={`return-${line.batchId}`} className="font-normal">
                {line.label}
                <span className="block text-xs text-muted-foreground">
                  sisa {line.remaining} {line.unit} · {formatRupiah(line.unitCost)} per {line.unit}
                </span>
              </Label>
              <Input
                id={`return-${line.batchId}`}
                aria-label={`Jumlah retur ${line.label}`}
                type="number"
                min={0}
                max={line.remaining}
                inputMode="numeric"
                value={quantities[line.batchId] ?? ""}
                onChange={(e) => setQuantities((current) => ({ ...current, [line.batchId]: e.target.value }))}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="return-note">Catatan retur</Label>
            <Input id="return-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="text-sm">
            Nilai retur: <strong>{formatRupiah(total)}</strong>
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan retur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Buat `src/components/admin/stock/cancel-purchase-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateReason } from "@/lib/stock";
import { cancelPurchase } from "@/server/purchases";

/** Batalkan faktur salah input (spec stok 6.4). Tombol hanya ditampilkan bila syaratnya terpenuhi. */
export function CancelPurchaseDialog({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
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
        const result = await cancelPurchase({ invoiceId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Faktur ${invoiceNumber} dibatalkan.`);
        setOpen(false);
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
        <Button type="button" variant="outline" className="text-destructive">
          Batalkan faktur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan faktur {invoiceNumber}?</DialogTitle>
          <DialogDescription>
            Stok dari faktur ini ditarik dan hutangnya hilang. Faktur tetap tercatat dengan status Dibatalkan, dan nomornya tidak bisa
            dipakai lagi untuk supplier ini.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="cancel-purchase-reason">Alasan pembatalan</Label>
          <Input id="cancel-purchase-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            Batalkan faktur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Run: `npx vitest run tests/unit/components/purchase-form.test.tsx tests/unit/components/supplier-return-dialog.test.tsx tests/unit/components/cancel-purchase-dialog.test.tsx`
Expected: PASS semua.

- [ ] **Step 3: Halaman**

Di `src/app/(admin)/admin/stok/page.tsx`, ganti semua baris dari `import Form from "next/form";` sampai akhir fungsi `StockPage` dengan kode berikut. Fungsi `ItemsTab` di bawahnya (dari Task 7) tidak diubah.

```tsx
import Form from "next/form";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PurchaseTable } from "@/components/admin/stock/purchase-table";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { StockItemTable } from "@/components/admin/stock/stock-item-table";
import { SupplierDialog } from "@/components/admin/stock/supplier-dialog";
import { SupplierTable } from "@/components/admin/stock/supplier-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  isStockFlag,
  STOCK_FLAG_LABEL,
  STOCK_ITEM_KIND_LABEL,
  summarizeStock,
  type StockFlag,
  type StockItemKindValue,
} from "@/lib/stock";
import { getBranches } from "@/server/catalog";
import { listPurchases } from "@/server/purchase-read";
import { requireCapability } from "@/server/session";
import { listStockItems, listSuppliers } from "@/server/stock-read";

export const metadata = { title: "Stok" };

type Search = { tab?: string; cabang?: string; jenis?: string; tanda?: string; cari?: string };
type Tab = "barang" | "masuk" | "supplier";

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const FLAGS = Object.keys(STOCK_FLAG_LABEL) as StockFlag[];
const KINDS = Object.keys(STOCK_ITEM_KIND_LABEL) as StockItemKindValue[];

export default async function StockPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requireCapability("stock:read");
  const params = await searchParams;
  const canManage = can(staff.role, "stock:manage");
  const tab: Tab = params.tab === "masuk" || params.tab === "supplier" ? params.tab : "barang";

  const actions = !canManage ? undefined : tab === "barang" ? (
    <StockItemDialog triggerLabel="+ Barang" />
  ) : tab === "masuk" ? (
    <Button asChild>
      <Link href="/admin/stok/masuk/baru">+ Barang masuk</Link>
    </Button>
  ) : (
    <SupplierDialog triggerLabel="+ Supplier" />
  );

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader title="Stok" description="Obat dan produk per cabang, barang masuk dari supplier, dan supplier." actions={actions} />
        <PageTabs
          label="Bagian stok"
          active={tab}
          tabs={[
            { id: "barang", label: "Barang", href: "/admin/stok" },
            { id: "masuk", label: "Barang masuk", href: "/admin/stok?tab=masuk" },
            { id: "supplier", label: "Supplier", href: "/admin/stok?tab=supplier" },
          ]}
        />
        {tab === "barang" && <ItemsTab params={params} />}
        {tab === "masuk" && (
          <SectionCard title="Barang masuk" description="Faktur supplier terbaru di atas." flush>
            <PurchaseTable rows={await listPurchases()} />
          </SectionCard>
        )}
        {tab === "supplier" && (
          <SectionCard title="Supplier" flush>
            <SupplierTable rows={await listSuppliers()} canManage={canManage} />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}
```


Buat `src/app/(admin)/admin/stok/masuk/baru/page.tsx`:

```tsx
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader } from "@/components/admin/page-layout";
import { PurchaseForm } from "@/components/admin/stock/purchase-form";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { requireCapability } from "@/server/session";
import { listStockItemOptions, listSupplierOptions } from "@/server/stock-read";

export const metadata = { title: "Barang masuk" };

export default async function NewPurchasePage() {
  await requireCapability("stock:manage");
  const [items, suppliers, branches] = await Promise.all([listStockItemOptions(), listSupplierOptions(), getBranches()]);
  const active = branches.filter((branch) => branch.status === "AKTIF").map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title="Barang masuk"
          trail={[{ label: "Stok", href: "/admin/stok" }, { label: "Barang masuk", href: "/admin/stok?tab=masuk" }, { label: "Baru" }]}
          description="Salin dari faktur kertas supplier. Hutang langsung tercatat dari total faktur."
        />
        {active.length === 0 ? (
          <EmptyState>Belum ada cabang aktif yang bisa menerima barang.</EmptyState>
        ) : items.length === 0 ? (
          <EmptyState>
            Belum ada barang aktif.{" "}
            <Link href="/admin/stok" className="underline underline-offset-4">
              Tambahkan barang dulu
            </Link>
            .
          </EmptyState>
        ) : (
          <PurchaseForm items={items} suppliers={suppliers} branches={active} today={witaDateString(new Date())} />
        )}
      </PageBody>
    </>
  );
}
```

Buat `src/app/(admin)/admin/stok/masuk/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { CancelPurchaseDialog } from "@/components/admin/stock/cancel-purchase-dialog";
import { PayableStatusBadge } from "@/components/admin/stock/payable-status-badge";
import { SupplierReturnDialog } from "@/components/admin/stock/supplier-return-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { dateLabel } from "@/lib/stock";
import { getPurchaseDetail } from "@/server/purchase-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Faktur" };

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("stock:read");
  const detail = await getPurchaseDetail((await params).id);
  if (!detail) notFound();
  const canManage = can(staff.role, "stock:manage");
  const canCancel = detail.canCancel && (canManage || can(staff.role, "payable:manage"));
  const returnable =
    canManage && detail.cancelledAt === null ? detail.lines.filter((line) => line.batchRemaining > 0) : [];

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title={`Faktur ${detail.invoiceNumber}`}
          trail={[{ label: "Stok", href: "/admin/stok" }, { label: "Barang masuk", href: "/admin/stok?tab=masuk" }, { label: detail.invoiceNumber }]}
          description={`${detail.supplierName} · ${detail.branchName}`}
          actions={
            <>
              {returnable.length > 0 && (
                <SupplierReturnDialog
                  invoiceId={detail.id}
                  lines={returnable.map((line) => ({
                    batchId: line.batchId,
                    label: `${line.itemName} batch ${line.batchNumber ?? "-"}`,
                    remaining: line.batchRemaining,
                    unitCost: line.unitCost,
                    unit: line.unit,
                  }))}
                />
              )}
              {canCancel && <CancelPurchaseDialog invoiceId={detail.id} invoiceNumber={detail.invoiceNumber} />}
            </>
          }
        />

        {detail.cancelledAt && (
          <p role="status" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            Dibatalkan {formatDateWithYear(detail.cancelledAt)} oleh {detail.cancelledByName}: {detail.cancelReason}
          </p>
        )}

        <SectionCard title="Faktur">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Tanggal faktur</dt>
              <dd>{dateLabel(detail.invoiceDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Jatuh tempo</dt>
              <dd>{dateLabel(detail.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <PayableStatusBadge status={detail.summary.status} overdue={detail.summary.overdue} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-lg font-semibold">{formatRupiah(detail.total)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dicatat oleh</dt>
              <dd>
                {detail.createdByName}, {formatDateWithYear(detail.createdAt)}
              </dd>
            </div>
            {detail.notes && (
              <div>
                <dt className="text-muted-foreground">Catatan</dt>
                <dd>{detail.notes}</dd>
              </div>
            )}
          </dl>
        </SectionCard>

        <SectionCard title="Barang" flush>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Barang</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Harga beli</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Sisa batch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.itemName}
                    <div className="font-mono text-xs text-muted-foreground">{line.itemCode}</div>
                  </TableCell>
                  <TableCell>{line.batchNumber ?? "—"}</TableCell>
                  <TableCell>{dateLabel(line.expiryDate)}</TableCell>
                  <TableCell className="text-right">
                    {line.quantity} {line.unit}
                  </TableCell>
                  <TableCell className="text-right">{formatRupiah(line.unitCost)}</TableCell>
                  <TableCell className="text-right">{formatRupiah(line.amount)}</TableCell>
                  <TableCell className="text-right">
                    {line.batchRemaining} {line.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="Retur" flush>
          {detail.returns.length === 0 ? (
            <EmptyState>Belum ada retur.</EmptyState>
          ) : (
            <ul className="divide-y text-sm">
              {detail.returns.map((r) => (
                <li key={r.id} className="space-y-1 p-4">
                  <div className="font-medium">
                    {formatDateWithYear(r.createdAt)} · {r.staffName} · {formatRupiah(r.total)}
                  </div>
                  {r.lines.map((line, index) => (
                    <div key={index} className="text-muted-foreground">
                      {line.itemName} batch {line.batchNumber ?? "-"}: {line.quantity} · {formatRupiah(line.amount)}
                    </div>
                  ))}
                  {r.note && <div>{r.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
```

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t8.log" 2>&1; grep -E "Test Files|Tests " "$WS/t8.log"; npx eslint src/components/admin/stock "src/app/(admin)/admin/stok" tests/unit/components; npx tsc --noEmit -p . > "$WS/t8-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS (termasuk uji arsitektur), eslint bersih, `tsc exit 0`.

```bash
git add src/components/admin/stock "src/app/(admin)/admin/stok" tests/unit/components/purchase-form.test.tsx \
  tests/unit/components/supplier-return-dialog.test.tsx tests/unit/components/cancel-purchase-dialog.test.tsx
git commit -m "feat: add supplier purchase entry, invoice detail with returns and cancellation, and the supplier list"
```

---

### Task 9: Layar Hutang dan bagian Pembayaran di detail faktur

**Files:**
- Create:
  - `src/components/admin/stock/payable-table.tsx`, `purchase-payments-section.tsx`, `payment-dialog.tsx`, `revoke-payment-dialog.tsx`, `due-date-dialog.tsx` (di `src/components/admin/stock/`);
  - `src/app/(admin)/admin/hutang/page.tsx`.
- Modify: `src/app/(admin)/admin/stok/masuk/[id]/page.tsx`
- Test: `tests/unit/components/payment-dialog.test.tsx`, `tests/unit/components/purchase-payments-section.test.tsx`, `tests/unit/components/payable-table.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`validatePayment`, `validateReason`, `validateDueDateChange`, `isPayableView`, `dateLabel`, `PAYMENT_METHODS`, `PAYMENT_METHOD_LABEL`, `PAYMENT_KIND_LABEL`, `PAYABLE_VIEWS`, `PAYABLE_VIEW_LABEL`, tipe `PayableSummary`, `PayableView`, `PaymentMethodValue`, `SupplierPaymentKindValue`), Task 4 (`getPurchaseDetail`, tipe `SupplierPaymentRow`), Task 6 (`recordSupplierPayment`, `revokeSupplierPayment`, `updateDueDate`, `listPayables`, `payablesOverview`, tipe `PayableRow`), Task 8 (`PayableStatusBadge`, halaman faktur), sudah ada: `StatTile`, `PageTabs`, `SectionCard`.
- Produces:
  - `PayableTable({ rows }: { rows: PayableRow[] })`;
  - `PaymentDialog({ invoiceId, kind, limit, invoiceDate, today })` — pemicu "Catat pembayaran" (`BAYAR`) atau "Catat pengembalian dana" (`PENGEMBALIAN`);
  - `RevokePaymentDialog({ paymentId, label })` — pemicu bernama "Batalkan pembayaran {label}";
  - `DueDateDialog({ invoiceId, dueDate, invoiceDate })` — pemicu "Ubah jatuh tempo";
  - `PurchasePaymentsSection({ invoiceId, invoiceDate, dueDate, today, total, summary, payments, cancelled })` (komponen server berisi dialog klien; region "Pembayaran");
  - halaman `/admin/hutang?lihat=BELUM_LUNAS|TERLAMBAT|JATUH_TEMPO|LUNAS|DIBATALKAN&supplier=<id>`.

- [ ] **Step 1: Tulis uji komponen (gagal)**

Buat `tests/unit/components/payment-dialog.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentDialog } from "@/components/admin/stock/payment-dialog";
import { recordSupplierPayment } from "@/server/payables";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/payables", () => ({ recordSupplierPayment: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("PaymentDialog", () => {
  it("bawaannya melunasi sisa dengan transfer hari ini", async () => {
    const user = userEvent.setup();
    vi.mocked(recordSupplierPayment).mockResolvedValue({ ok: true, data: { id: "pay1" } });
    render(<PaymentDialog invoiceId="p1" kind="BAYAR" limit={60000} invoiceDate="2026-10-01" today="2026-10-07" />);
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(recordSupplierPayment).toHaveBeenCalledWith({
        invoiceId: "p1",
        kind: "BAYAR",
        amount: 60000,
        method: "TRANSFER",
        paidAt: "2026-10-07",
        reference: "",
      }),
    );
  });

  it("nominal di atas sisa ditolak di browser", async () => {
    const user = userEvent.setup();
    render(<PaymentDialog invoiceId="p1" kind="BAYAR" limit={60000} invoiceDate="2026-10-01" today="2026-10-07" />);
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    await user.clear(screen.getByLabelText("Nominal"));
    await user.type(screen.getByLabelText("Nominal"), "70000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nominal melebihi sisa hutang (Rp 60.000).");
    expect(recordSupplierPayment).not.toHaveBeenCalled();
  });

  it("pengembalian dana dari supplier memakai jenis PENGEMBALIAN", async () => {
    const user = userEvent.setup();
    vi.mocked(recordSupplierPayment).mockResolvedValue({ ok: true, data: { id: "pay2" } });
    render(<PaymentDialog invoiceId="p1" kind="PENGEMBALIAN" limit={30000} invoiceDate="2026-10-01" today="2026-10-07" />);
    await user.click(screen.getByRole("button", { name: "Catat pengembalian dana" }));
    await user.selectOptions(screen.getByLabelText("Metode"), "TUNAI");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(recordSupplierPayment).toHaveBeenCalledWith(expect.objectContaining({ kind: "PENGEMBALIAN", amount: 30000, method: "TUNAI" })),
    );
  });
});
```

Buat `tests/unit/components/purchase-payments-section.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PurchasePaymentsSection } from "@/components/admin/stock/purchase-payments-section";
import type { PayableSummary } from "@/lib/stock";
import type { SupplierPaymentRow } from "@/server/purchase-read";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/payables", () => ({ recordSupplierPayment: vi.fn(), revokeSupplierPayment: vi.fn(), updateDueDate: vi.fn() }));

const payment = (patch: Partial<SupplierPaymentRow> = {}): SupplierPaymentRow => ({
  id: "pay1",
  kind: "BAYAR",
  amount: 40000,
  method: "TRANSFER",
  paidAt: "2026-10-07",
  reference: "TRF-1",
  staffName: "Rina",
  createdAt: new Date("2026-10-07T02:00:00Z"),
  revokedAt: null,
  revokedByName: null,
  revokeReason: null,
  ...patch,
});
const summary = (patch: Partial<PayableSummary>): PayableSummary => ({
  paid: 40000,
  refunded: 0,
  returned: 0,
  balance: 60000,
  status: "SEBAGIAN",
  overdue: false,
  ...patch,
});
const props = { invoiceId: "p1", invoiceDate: "2026-10-01", dueDate: "2026-10-31", today: "2026-10-07", total: 100000 };

describe("PurchasePaymentsSection", () => {
  it("sisa hutang: tombol bayar dan ubah jatuh tempo; pembayaran aktif bisa dibatalkan", () => {
    render(<PurchasePaymentsSection {...props} summary={summary({})} payments={[payment()]} cancelled={false} />);
    const region = screen.getByRole("region", { name: "Pembayaran" });
    expect(within(region).getByText("Sisa hutang").nextElementSibling).toHaveTextContent("Rp 60.000");
    expect(within(region).getByRole("button", { name: "Catat pembayaran" })).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: "Catat pengembalian dana" })).not.toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Ubah jatuh tempo" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Batalkan pembayaran 7 Okt 2026 Rp 40.000" })).toBeInTheDocument();
    expect(within(region).getByText(/TRF-1/)).toBeInTheDocument();
  });

  it("kredit dari supplier: tombol pengembalian dana; pembayaran dibatalkan ditandai beserta alasannya", () => {
    render(
      <PurchasePaymentsSection
        {...props}
        summary={summary({ paid: 100000, returned: 30000, balance: -30000, status: "KREDIT" })}
        payments={[payment({ amount: 100000 }), payment({ id: "pay0", revokedAt: new Date(), revokedByName: "Rina", revokeReason: "Nominal salah" })]}
        cancelled={false}
      />,
    );
    expect(screen.getByText("Kredit dari supplier").nextElementSibling).toHaveTextContent("Rp 30.000");
    expect(screen.getByRole("button", { name: "Catat pengembalian dana" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catat pembayaran" })).not.toBeInTheDocument();
    expect(screen.getByText("Dibatalkan Rina: Nominal salah")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Batalkan pembayaran/ })).toHaveLength(1);
  });

  it("faktur dibatalkan: tanpa tombol aksi", () => {
    render(<PurchasePaymentsSection {...props} summary={summary({ status: "DIBATALKAN" })} payments={[]} cancelled />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Belum ada pembayaran.")).toBeInTheDocument();
  });
});
```

Buat `tests/unit/components/payable-table.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PayableTable } from "@/components/admin/stock/payable-table";
import type { PayableRow } from "@/server/payable-read";

const row = (patch: Partial<PayableRow> = {}): PayableRow => ({
  id: "p1",
  supplierId: "s1",
  supplierName: "Kimia Farma",
  branchName: "SunDY Mahakeret",
  invoiceNumber: "INV-1",
  invoiceDate: "2026-09-01",
  dueDate: "2026-10-01",
  total: 100000,
  paid: 40000,
  returned: 0,
  refunded: 0,
  balance: 60000,
  status: "SEBAGIAN",
  overdue: true,
  ...patch,
});

describe("PayableTable", () => {
  it("tautan ke faktur, sisa hutang, dan tanda terlambat", () => {
    render(<PayableTable rows={[row()]} />);
    expect(screen.getByRole("link", { name: "INV-1" })).toHaveAttribute("href", "/admin/stok/masuk/p1");
    expect(screen.getByText("Rp 60.000")).toBeInTheDocument();
    expect(screen.getByText("Terlambat")).toBeInTheDocument();
    expect(screen.getByText("Kimia Farma")).toBeInTheDocument();
  });

  it("kredit dari supplier ditulis sebagai kredit; daftar kosong", () => {
    const { unmount } = render(<PayableTable rows={[row({ balance: -30000, status: "KREDIT", overdue: false })]} />);
    expect(screen.getByText("Kredit Rp 30.000")).toBeInTheDocument();
    unmount();
    render(<PayableTable rows={[]} />);
    expect(screen.getByText("Tidak ada faktur di tampilan ini.")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/components/payment-dialog.test.tsx tests/unit/components/purchase-payments-section.test.tsx tests/unit/components/payable-table.test.tsx`
Expected: FAIL, karena komponennya belum ada.

- [ ] **Step 2: Komponen**

Buat `src/components/admin/stock/payable-table.tsx`:

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { dateLabel } from "@/lib/stock";
import type { PayableRow } from "@/server/payable-read";
import { EmptyState } from "../page-layout";
import { PayableStatusBadge } from "./payable-status-badge";

/** Daftar hutang (spec stok 6.1). */
export function PayableTable({ rows }: { rows: PayableRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada faktur di tampilan ini.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Jatuh tempo</TableHead>
          <TableHead>Faktur</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Dibayar / retur</TableHead>
          <TableHead className="text-right">Sisa</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap">{dateLabel(row.dueDate)}</TableCell>
            <TableCell>
              <Link href={`/admin/stok/masuk/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.invoiceNumber}
              </Link>
              <div className="text-xs text-muted-foreground">{row.supplierName}</div>
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="text-right">{formatRupiah(row.total)}</TableCell>
            <TableCell className="text-right">
              {formatRupiah(row.paid - row.refunded)}
              {row.returned > 0 && <div className="text-xs text-muted-foreground">retur {formatRupiah(row.returned)}</div>}
            </TableCell>
            <TableCell className="text-right font-medium">
              {row.balance < 0 ? `Kredit ${formatRupiah(-row.balance)}` : formatRupiah(row.balance)}
            </TableCell>
            <TableCell>
              <PayableStatusBadge status={row.status} overdue={row.overdue} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Buat `src/components/admin/stock/payment-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  validatePayment,
  type PaymentMethodValue,
  type SupplierPaymentKindValue,
} from "@/lib/stock";
import { recordSupplierPayment } from "@/server/payables";
import { RupiahInput } from "../rupiah-input";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Catat pembayaran ke supplier atau pengembalian dana dari supplier (spec stok 6.2–6.3). */
export function PaymentDialog({
  invoiceId,
  kind,
  limit,
  invoiceDate,
  today,
}: {
  invoiceId: string;
  kind: SupplierPaymentKindValue;
  /** Sisa hutang (BAYAR) atau kredit dari supplier (PENGEMBALIAN); diperiksa lagi di server. */
  limit: number;
  invoiceDate: string;
  today: string;
}) {
  const router = useRouter();
  const title = kind === "BAYAR" ? "Catat pembayaran" : "Catat pengembalian dana";
  const [open, setOpen] = useState(false);
  // undefined = belum diubah pengguna: nominal mengikuti sisa terbaru (bisa berubah setelah halaman dimuat ulang).
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const amount = typed === undefined ? limit : typed;
  const [method, setMethod] = useState<PaymentMethodValue>("TRANSFER");
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const input = { invoiceId, kind, amount: amount ?? Number.NaN, method, paidAt, reference };
    const checked = validatePayment(input, { today, invoiceDate, limit });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await recordSupplierPayment(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`${kind === "BAYAR" ? "Pembayaran" : "Pengembalian dana"} ${formatRupiah(checked.value.amount)} dicatat.`);
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
        if (next) {
          setTyped(undefined);
          setPaidAt(today);
        } else {
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={kind === "BAYAR" ? "default" : "outline"}>
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === "BAYAR" ? `Sisa hutang ${formatRupiah(limit)}.` : `Kredit dari supplier ${formatRupiah(limit)}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="payment-amount">Nominal</Label>
            <RupiahInput id="payment-amount" value={amount} onChange={setTyped} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-method">Metode</Label>
            <select
              id="payment-method"
              className={selectClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethodValue)}
            >
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-date">Tanggal</Label>
            <Input id="payment-date" type="date" min={invoiceDate} max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-reference">Referensi (opsional)</Label>
            <Input
              id="payment-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nomor transfer atau kuitansi"
            />
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

Buat `src/components/admin/stock/revoke-payment-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateReason } from "@/lib/stock";
import { revokeSupplierPayment } from "@/server/payables";

/** Batalkan pembayaran salah input (spec stok 6.2): tidak dihapus, ditandai dibatalkan dengan alasan. */
export function RevokePaymentDialog({ paymentId, label }: { paymentId: string; label: string }) {
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
        const result = await revokeSupplierPayment({ paymentId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Pembayaran dibatalkan.");
        setOpen(false);
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
        <Button type="button" size="sm" variant="ghost" aria-label={`Batalkan pembayaran ${label}`}>
          Batalkan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan pembayaran?</DialogTitle>
          <DialogDescription>{label}. Pembayaran tetap tercatat dengan tanda dibatalkan, dan sisa hutang kembali.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor={`revoke-${paymentId}`}>Alasan</Label>
          <Input id={`revoke-${paymentId}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            Batalkan pembayaran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Buat `src/components/admin/stock/due-date-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateDueDateChange, validateReason } from "@/lib/stock";
import { updateDueDate } from "@/server/payables";

/** Ubah jatuh tempo beralasan (spec stok 6.2). */
export function DueDateDialog({ invoiceId, dueDate, invoiceDate }: { invoiceId: string; dueDate: string; invoiceDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(dueDate);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const due = validateDueDateChange(value, invoiceDate);
    if (!due.ok) {
      setError(due.message);
      return;
    }
    const why = validateReason(reason);
    if (!why.ok) {
      setError(why.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateDueDate({ invoiceId, dueDate: value, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Jatuh tempo diperbarui.");
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
        <Button type="button" variant="outline">
          Ubah jatuh tempo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah jatuh tempo</DialogTitle>
          <DialogDescription>Perubahan tercatat di jejak audit bersama alasannya.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="due-date-new">Jatuh tempo baru</Label>
            <Input id="due-date-new" type="date" min={invoiceDate} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="due-date-reason">Alasan</Label>
            <Input id="due-date-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
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

Buat `src/components/admin/stock/purchase-payments-section.tsx`:

```tsx
import { formatRupiah } from "@/lib/format";
import { dateLabel, PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, type PayableSummary } from "@/lib/stock";
import type { SupplierPaymentRow } from "@/server/purchase-read";
import { EmptyState, SectionCard } from "../page-layout";
import { DueDateDialog } from "./due-date-dialog";
import { PaymentDialog } from "./payment-dialog";
import { RevokePaymentDialog } from "./revoke-payment-dialog";

/** Bagian Pembayaran di detail faktur, hanya untuk payable:manage (spec stok 6.2–6.3). */
export function PurchasePaymentsSection({
  invoiceId,
  invoiceDate,
  dueDate,
  today,
  total,
  summary,
  payments,
  cancelled,
}: {
  invoiceId: string;
  invoiceDate: string;
  dueDate: string;
  today: string;
  total: number;
  summary: PayableSummary;
  payments: SupplierPaymentRow[];
  cancelled: boolean;
}) {
  const actions = cancelled ? undefined : (
    <>
      {summary.balance > 0 && <PaymentDialog invoiceId={invoiceId} kind="BAYAR" limit={summary.balance} invoiceDate={invoiceDate} today={today} />}
      {summary.balance < 0 && (
        <PaymentDialog invoiceId={invoiceId} kind="PENGEMBALIAN" limit={-summary.balance} invoiceDate={invoiceDate} today={today} />
      )}
      <DueDateDialog invoiceId={invoiceId} dueDate={dueDate} invoiceDate={invoiceDate} />
    </>
  );

  return (
    <SectionCard title="Pembayaran" actions={actions}>
      <dl className="grid gap-4 text-sm sm:grid-cols-5">
        <div>
          <dt className="text-muted-foreground">Total faktur</dt>
          <dd>{formatRupiah(total)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dibayar</dt>
          <dd>{formatRupiah(summary.paid)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Retur</dt>
          <dd>{formatRupiah(summary.returned)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pengembalian dana</dt>
          <dd>{formatRupiah(summary.refunded)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{summary.balance < 0 ? "Kredit dari supplier" : "Sisa hutang"}</dt>
          <dd className="text-lg font-semibold">{formatRupiah(Math.abs(summary.balance))}</dd>
        </div>
      </dl>

      {payments.length === 0 ? (
        <EmptyState>Belum ada pembayaran.</EmptyState>
      ) : (
        <ul className="mt-4 divide-y text-sm">
          {payments.map((payment) => {
            const label = `${dateLabel(payment.paidAt)} ${formatRupiah(payment.amount)}`;
            return (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className={payment.revokedAt ? "text-muted-foreground line-through" : undefined}>
                  {dateLabel(payment.paidAt)} · {PAYMENT_KIND_LABEL[payment.kind]} · {PAYMENT_METHOD_LABEL[payment.method]} ·{" "}
                  <strong>{formatRupiah(payment.amount)}</strong>
                  {payment.reference && <> · {payment.reference}</>} · {payment.staffName}
                </div>
                {payment.revokedAt ? (
                  <div className="text-xs text-destructive">
                    Dibatalkan {payment.revokedByName}: {payment.revokeReason}
                  </div>
                ) : (
                  !cancelled && <RevokePaymentDialog paymentId={payment.id} label={label} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
```

Run: `npx vitest run tests/unit/components/payment-dialog.test.tsx tests/unit/components/purchase-payments-section.test.tsx tests/unit/components/payable-table.test.tsx`
Expected: PASS semua.

- [ ] **Step 3: Halaman Hutang dan bagian Pembayaran**

Buat `src/app/(admin)/admin/hutang/page.tsx`:

```tsx
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { StatTile } from "@/components/admin/stat-tile";
import { PayableTable } from "@/components/admin/stock/payable-table";
import { formatRupiah } from "@/lib/format";
import { isPayableView, PAYABLE_VIEW_LABEL, PAYABLE_VIEWS, type PayableView } from "@/lib/stock";
import { listPayables, payablesOverview } from "@/server/payable-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Hutang" };

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ lihat?: string; supplier?: string }> }) {
  await requireCapability("payable:manage");
  const params = await searchParams;
  const view: PayableView = isPayableView(params.lihat) ? params.lihat : "BELUM_LUNAS";
  const supplierId = params.supplier || undefined;
  const [overview, rows] = await Promise.all([payablesOverview(), listPayables({ view, supplierId })]);

  const href = (next: { lihat?: PayableView; supplier?: string | null }) => {
    const query = new URLSearchParams();
    const nextView = next.lihat ?? view;
    if (nextView !== "BELUM_LUNAS") query.set("lihat", nextView);
    const nextSupplier = next.supplier === undefined ? supplierId : next.supplier;
    if (nextSupplier) query.set("supplier", nextSupplier);
    const text = query.toString();
    return text ? `/admin/hutang?${text}` : "/admin/hutang";
  };
  const supplierName = supplierId
    ? (overview.bySupplier.find((row) => row.supplierId === supplierId)?.supplierName ?? rows[0]?.supplierName ?? "supplier ini")
    : null;

  return (
    <>
      <AdminHeader title="Hutang" />
      <PageBody>
        <PageHeader title="Hutang" description="Hutang ke supplier dari faktur barang masuk." />

        <section aria-label="Ringkasan hutang" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Sisa hutang" value={formatRupiah(overview.totalBalance)} href={href({ lihat: "BELUM_LUNAS", supplier: null })} />
          <StatTile
            label="Terlambat"
            value={formatRupiah(overview.overdueBalance)}
            note={`${overview.overdueCount} faktur`}
            href={href({ lihat: "TERLAMBAT", supplier: null })}
            attention={overview.overdueCount > 0}
          />
          <StatTile
            label="Jatuh tempo 7 hari"
            value={overview.dueSoonCount}
            note="faktur"
            href={href({ lihat: "JATUH_TEMPO", supplier: null })}
            attention={overview.dueSoonCount > 0}
          />
          <StatTile label="Kredit dari supplier" value={formatRupiah(overview.credit)} href={href({ lihat: "BELUM_LUNAS", supplier: null })} />
        </section>

        <PageTabs
          label="Tampilan hutang"
          active={view}
          tabs={PAYABLE_VIEWS.map((value) => ({ id: value, label: PAYABLE_VIEW_LABEL[value], href: href({ lihat: value }) }))}
        />
        {supplierName && (
          <p className="text-sm">
            Supplier: <strong>{supplierName}</strong> ·{" "}
            <Link href={href({ supplier: null })} className="underline underline-offset-4">
              Semua supplier
            </Link>
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <SectionCard title="Daftar hutang" flush>
            <PayableTable rows={rows} />
          </SectionCard>
          <SectionCard title="Sisa per supplier" flush>
            {overview.bySupplier.length === 0 ? (
              <EmptyState>Tidak ada hutang.</EmptyState>
            ) : (
              <ul className="divide-y text-sm">
                {overview.bySupplier.map((row) => (
                  <li key={row.supplierId} className="flex items-center justify-between gap-2 px-4 py-2">
                    <Link href={href({ supplier: row.supplierId })} className="underline-offset-4 hover:underline">
                      {row.supplierName}
                    </Link>
                    <span className="text-right">
                      {formatRupiah(row.balance)}
                      {row.overdueCount > 0 && <span className="block text-xs text-destructive">{row.overdueCount} terlambat</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </PageBody>
    </>
  );
}
```

Di `src/app/(admin)/admin/stok/masuk/[id]/page.tsx`:
1. Tambahkan import `import { PurchasePaymentsSection } from "@/components/admin/stock/purchase-payments-section";` dan `import { witaDateString } from "@/lib/time";`.
2. Tepat setelah penutup `</SectionCard>` milik bagian `title="Faktur"`, tambahkan:

```tsx
        {detail.payments && (
          <PurchasePaymentsSection
            invoiceId={detail.id}
            invoiceDate={detail.invoiceDate}
            dueDate={detail.dueDate}
            today={witaDateString(new Date())}
            total={detail.total}
            summary={detail.summary}
            payments={detail.payments}
            cancelled={detail.cancelledAt !== null}
          />
        )}
```

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t9.log" 2>&1; grep -E "Test Files|Tests " "$WS/t9.log"; npx eslint src/components/admin/stock "src/app/(admin)/admin/hutang" "src/app/(admin)/admin/stok" tests/unit/components; npx tsc --noEmit -p . > "$WS/t9-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS (termasuk uji arsitektur), eslint bersih, `tsc exit 0`.

```bash
git add src/components/admin/stock "src/app/(admin)/admin/hutang" "src/app/(admin)/admin/stok/masuk/[id]/page.tsx" \
  tests/unit/components/payment-dialog.test.tsx tests/unit/components/purchase-payments-section.test.tsx tests/unit/components/payable-table.test.tsx
git commit -m "feat: add the payables page and invoice payment section with pay, refund, revoke, and due-date actions"
```

---

### Task 10: Dasbor (kotak Stok dan Hutang) dan menu samping Stok/Hutang

**Files:**
- Create: `src/components/admin/stock/stock-alert-tiles.tsx`, `src/components/admin/stock/payable-tiles.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/components/admin/app-sidebar.tsx`, `tests/unit/admin-dashboard-page.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`countStockAlerts`), Task 6 (`payablesOverview`, `countOverduePayables`, tipe `PayablesOverview`), sudah ada: `StatTile`, `FailedSection`, `settle`, `can`.
- Produces:
  - `StockAlertTiles({ alerts }: { alerts: { low: number; expiringSoon: number; expired: number } })` — region "Stok";
  - `PayableTiles({ overview }: { overview: PayablesOverview })` — region "Hutang";
  - `AppSidebar` menerima `stockAlerts?: number` dan `overduePayables?: number`; grup menu baru "Persediaan & keuangan" berisi **Stok** (`stock:read`) dan **Hutang** (`payable:manage`).

- [ ] **Step 1: Tulis uji (gagal)**

Di `tests/unit/admin-dashboard-page.test.tsx`:
1. Tambahkan setelah baris `vi.mock("@/server/dashboard", …)`:

```tsx
vi.mock("@/server/stock-read", () => ({ countStockAlerts: vi.fn() }));
vi.mock("@/server/payable-read", () => ({ payablesOverview: vi.fn() }));
```

2. Tambahkan import:

```tsx
import { getDashboardNumbers } from "@/server/dashboard";
import { payablesOverview } from "@/server/payable-read";
import { countStockAlerts } from "@/server/stock-read";
```

   (gabungkan `getDashboardNumbers` ke import `@/server/dashboard` yang sudah ada).
3. Tambahkan di akhir `describe("halaman Dasbor (spec D 4)", …)`:

```tsx
  it("Apoteker: kotak Stok saja, tanpa pekerjaan booking, hutang, atau angka (spec stok 7.2)", async () => {
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u3", staffId: "s3", name: "Rina Apoteker", role: "APOTEKER", email: "a@sundy.test" } as never);
    vi.mocked(countStockAlerts).mockResolvedValue({ low: 2, expiringSoon: 1, expired: 0 });
    await renderPage();
    const stock = screen.getByRole("region", { name: "Stok" });
    expect(within(stock).getByRole("link", { name: /Stok menipis/ })).toHaveAttribute("href", "/admin/stok?tanda=MENIPIS");
    expect(within(stock).getByRole("link", { name: /Segera kedaluwarsa/ })).toHaveTextContent("1");
    expect(screen.queryByRole("region", { name: "Hutang" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pekerjaan hari ini" })).not.toBeInTheDocument();
    expect(getTodayWork).not.toHaveBeenCalled();
    expect(payablesOverview).not.toHaveBeenCalled();
    expect(getDashboardNumbers).not.toHaveBeenCalled();
  });

  it("Admin Keuangan: kotak Stok, Hutang, dan Angka; tanpa pekerjaan booking", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u4", staffId: "s4", name: "Budi Keuangan", role: "ADMIN_KEUANGAN", email: "k@sundy.test" } as never);
    vi.mocked(countStockAlerts).mockResolvedValue({ low: 0, expiringSoon: 0, expired: 0 });
    vi.mocked(payablesOverview).mockResolvedValue({
      totalBalance: 350000,
      overdueBalance: 100000,
      overdueCount: 1,
      dueSoonCount: 2,
      credit: 0,
      bySupplier: [],
    });
    vi.mocked(getDashboardNumbers).mockRejectedValue(new Error("tidak dimuat di uji ini"));
    await renderPage();
    const payables = screen.getByRole("region", { name: "Hutang" });
    expect(within(payables).getByRole("link", { name: /Hutang terlambat/ })).toHaveAttribute("href", "/admin/hutang?lihat=TERLAMBAT");
    expect(within(payables).getByRole("link", { name: /Sisa hutang/ })).toHaveTextContent("Rp 350.000");
    expect(screen.getByRole("region", { name: "Stok" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Angka" })).toBeInTheDocument();
    expect(getTodayWork).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("bagian Hutang yang gagal dimuat tidak menjatuhkan halaman", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u4", staffId: "s4", name: "Budi Keuangan", role: "ADMIN_KEUANGAN", email: "k@sundy.test" } as never);
    vi.mocked(countStockAlerts).mockResolvedValue({ low: 0, expiringSoon: 0, expired: 0 });
    vi.mocked(payablesOverview).mockRejectedValue(new Error("putus"));
    vi.mocked(getDashboardNumbers).mockRejectedValue(new Error("tidak dimuat di uji ini"));
    await renderPage();
    expect(within(screen.getByRole("region", { name: "Hutang" })).getByText("Gagal dimuat. Muat ulang halaman.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Stok" })).toBeInTheDocument();
    log.mockRestore();
  });
```

Run: `npx vitest run tests/unit/admin-dashboard-page.test.tsx`
Expected: FAIL — region "Stok" dan "Hutang" belum ada.

- [ ] **Step 2: Kotak dasbor**

Buat `src/components/admin/stock/stock-alert-tiles.tsx`:

```tsx
import { StatTile } from "../stat-tile";

/** Kotak Stok di dasbor (spec stok 8): barang yang perlu perhatian di cabang aktif. */
export function StockAlertTiles({ alerts }: { alerts: { low: number; expiringSoon: number; expired: number } }) {
  return (
    <section aria-label="Stok" className="grid gap-4 sm:grid-cols-3">
      <StatTile label="Stok menipis" value={alerts.low} note="barang" href="/admin/stok?tanda=MENIPIS" attention={alerts.low > 0} />
      <StatTile
        label="Segera kedaluwarsa"
        value={alerts.expiringSoon}
        note="barang, dalam 60 hari"
        href="/admin/stok?tanda=SEGERA_KEDALUWARSA"
        attention={alerts.expiringSoon > 0}
      />
      <StatTile
        label="Kedaluwarsa"
        value={alerts.expired}
        note="barang masih bersisa"
        href="/admin/stok?tanda=KEDALUWARSA"
        attention={alerts.expired > 0}
      />
    </section>
  );
}
```

Buat `src/components/admin/stock/payable-tiles.tsx`:

```tsx
import { formatRupiah } from "@/lib/format";
import type { PayablesOverview } from "@/server/payable-read";
import { StatTile } from "../stat-tile";

/** Kotak Hutang di dasbor (spec stok 6.5). */
export function PayableTiles({ overview }: { overview: PayablesOverview }) {
  return (
    <section aria-label="Hutang" className="grid gap-4 sm:grid-cols-3">
      <StatTile
        label="Hutang terlambat"
        value={overview.overdueCount}
        note={`faktur · ${formatRupiah(overview.overdueBalance)}`}
        href="/admin/hutang?lihat=TERLAMBAT"
        attention={overview.overdueCount > 0}
      />
      <StatTile
        label="Jatuh tempo 7 hari"
        value={overview.dueSoonCount}
        note="faktur"
        href="/admin/hutang?lihat=JATUH_TEMPO"
        attention={overview.dueSoonCount > 0}
      />
      <StatTile label="Sisa hutang" value={formatRupiah(overview.totalBalance)} href="/admin/hutang" />
    </section>
  );
}
```

- [ ] **Step 3: Dasbor, menu samping, dan tata letak**

Di `src/app/(admin)/admin/page.tsx`:
1. Tambahkan import:

```tsx
import { PayableTiles } from "@/components/admin/stock/payable-tiles";
import { StockAlertTiles } from "@/components/admin/stock/stock-alert-tiles";
import { payablesOverview } from "@/server/payable-read";
import { countStockAlerts } from "@/server/stock-read";
```

2. Ganti `const [work, schedule, worklist, online, numbers] = await Promise.all([` sampai `]);` dengan:

```tsx
  const [work, schedule, worklist, online, numbers, stock, payables] = await Promise.all([
    canBook ? settle(getTodayWork(now), "pekerjaan hari ini") : null,
    canBook ? settle(getTodaySchedule(now), "jadwal hari ini") : null,
    can(staff.role, "record:read") ? settle(listDoctorWorklist(), "daftar dokter") : null,
    can(staff.role, "record:write") ? settle(listOnlineWork(), "konsultasi online") : null,
    can(staff.role, "report:read") ? settle(getDashboardNumbers(period, now), "angka") : null,
    can(staff.role, "stock:read") ? settle(countStockAlerts(), "stok") : null,
    can(staff.role, "payable:manage") ? settle(payablesOverview(), "hutang") : null,
  ]);
```

3. Tambahkan tepat sebelum `{online && (online.ok ? <OnlineWorkView …`:

```tsx
        {stock && (stock.ok ? <StockAlertTiles alerts={stock.data} /> : <FailedSection title="Stok" />)}
        {payables && (payables.ok ? <PayableTiles overview={payables.data} /> : <FailedSection title="Hutang" />)}
```

Di `src/components/admin/app-sidebar.tsx`:
1. Tambahkan `Package,` dan `Wallet,` ke import `lucide-react` (urut abjad).
2. Tambahkan grup baru di `NAV_GROUPS`, di antara grup "Utama" dan "Kelola":

```tsx
  {
    title: "Persediaan & keuangan",
    items: [
      { title: "Stok", url: "/admin/stok", icon: Package, needs: "stock:read" },
      { title: "Hutang", url: "/admin/hutang", icon: Wallet, needs: "payable:manage" },
    ],
  },
```

3. Tambahkan dua prop pada `AppSidebar` (setelah `reminderWork = 0,` di destrukturisasi dan di tipenya):

```tsx
  stockAlerts = 0,
  overduePayables = 0,
```

```tsx
  /** Barang menipis atau kedaluwarsa di cabang aktif, angka di menu Stok. */
  stockAlerts?: number;
  /** Faktur hutang yang lewat jatuh tempo, angka di menu Hutang. */
  overduePayables?: number;
```

4. Tambahkan dua entri pada `badges`:

```tsx
    "/admin/stok": { count: stockAlerts, label: `${stockAlerts} barang menipis atau kedaluwarsa` },
    "/admin/hutang": { count: overduePayables, label: `${overduePayables} faktur hutang terlambat` },
```

Di `src/app/(admin)/admin/layout.tsx`:
1. Tambahkan import `import { countOverduePayables } from "@/server/payable-read";` dan `import { countStockAlerts } from "@/server/stock-read";`.
2. Tambahkan setelah perhitungan `pendingBookings, reminderWork`:

```tsx
  const [stockAlerts, overduePayables] = await Promise.all([
    can(staff.role, "stock:read") ? countStockAlerts().then((alerts) => alerts.low + alerts.expired) : 0,
    can(staff.role, "payable:manage") ? countOverduePayables() : 0,
  ]);
```

3. Ubah `<AppSidebar staff={staff} pendingBookings={pendingBookings} reminderWork={reminderWork} />` menjadi `<AppSidebar staff={staff} pendingBookings={pendingBookings} reminderWork={reminderWork} stockAlerts={stockAlerts} overduePayables={overduePayables} />`.

Run: `npx vitest run tests/unit/admin-dashboard-page.test.tsx tests/unit/architecture.test.ts`
Expected: PASS semua (uji arsitektur memastikan menu Stok dan Hutang mengarah ke halaman yang ada).

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t10.log" 2>&1; grep -E "Test Files|Tests " "$WS/t10.log"; npx eslint src/components/admin "src/app/(admin)/admin/page.tsx" "src/app/(admin)/admin/layout.tsx" tests/unit/admin-dashboard-page.test.tsx; npx tsc --noEmit -p . > "$WS/t10-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/components/admin/stock/stock-alert-tiles.tsx src/components/admin/stock/payable-tiles.tsx src/components/admin/app-sidebar.tsx \
  "src/app/(admin)/admin/page.tsx" "src/app/(admin)/admin/layout.tsx" tests/unit/admin-dashboard-page.test.tsx
git commit -m "feat: show stock and payable alerts on the dashboard and add Stok and Hutang to the sidebar"
```

---

### Task 11: Uji E2E, verifikasi penuh, dan penandaan spec

**Files:**
- Create: `tests/e2e/stok-hutang.spec.ts`
- Modify: `tests/e2e/credentials.ts`, `tests/e2e/prepare-db.mts`, `docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`

**Interfaces:**
- Consumes: semua task sebelumnya; sudah ada: `signIn` (`tests/e2e/helpers/quiz.ts`), `E2E_RESEPSIONIS`.
- Produces: akun e2e `E2E_APOTEKER` dan `E2E_KEUANGAN`; data stok e2e dikosongkan di awal setiap putaran.

- [ ] **Step 1: Akun dan pembersihan data e2e**

Tambahkan di akhir `tests/e2e/credentials.ts`:

```ts

/** Akun Apoteker khusus uji (spec stok 7.2). */
export const E2E_APOTEKER = {
  email: process.env.E2E_APOTEKER_EMAIL ?? "apoteker-e2e@sundy.test",
  password: process.env.E2E_APOTEKER_PASSWORD ?? "kataSandiApotekerE2e123",
  name: "Apoteker E2E",
};

/** Akun Admin Keuangan khusus uji (spec stok 7.2). */
export const E2E_KEUANGAN = {
  email: process.env.E2E_KEUANGAN_EMAIL ?? "keuangan-e2e@sundy.test",
  password: process.env.E2E_KEUANGAN_PASSWORD ?? "kataSandiKeuanganE2e123",
  name: "Keuangan E2E",
};
```

Di `tests/e2e/prepare-db.mts`:
1. Ganti import `import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";` dengan `import { E2E_ADMIN, E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";`.
2. Tepat setelah `await prisma.patientNumberCounter.deleteMany();` (blok pembersihan di awal), tambahkan:

```ts
// Stok dan hutang (stok-hutang.spec.ts) dimulai kosong setiap putaran; urutan anak ke induk.
await prisma.stockMovement.deleteMany();
await prisma.supplierReturnLine.deleteMany();
await prisma.supplierReturn.deleteMany();
await prisma.supplierPayment.deleteMany();
await prisma.stockBatch.deleteMany();
await prisma.purchaseLine.deleteMany();
await prisma.purchaseInvoice.deleteMany();
await prisma.supplier.deleteMany();
await prisma.stockItem.deleteMany();
```

3. Pada fungsi `ensureAccount`, ganti tipe parameter `role: "SUPER_ADMIN" | "RESEPSIONIS",` dengan `role: "SUPER_ADMIN" | "RESEPSIONIS" | "APOTEKER" | "ADMIN_KEUANGAN",`.
4. Tambahkan setelah `await ensureAccount(E2E_RESEPSIONIS, "resepsionis-e2e", "RESEPSIONIS");`:

```ts
await ensureAccount(E2E_APOTEKER, "apoteker-e2e", "APOTEKER");
await ensureAccount(E2E_KEUANGAN, "keuangan-e2e", "ADMIN_KEUANGAN");
```

- [ ] **Step 2: Spec e2e**

Buat `tests/e2e/stok-hutang.spec.ts`:

```ts
import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";

// Satu cerita berurutan per proyek (desktop/ponsel, data masing-masing):
// Apoteker menambah barang, mencatat barang masuk dua batch, meretur sebagian →
// Admin Keuangan membayar sebagian lalu melunasi → Resepsionis tidak bisa membuka keduanya.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");

/** Tanggal WITA ("YYYY-MM-DD") `days` hari dari sekarang. */
function dayFromToday(days: number): string {
  return new Date(Date.now() + 8 * 3600_000 + days * 24 * 3600_000).toISOString().slice(0, 10);
}

let invoicePath: string | null = null;

test("apoteker menambah barang, mencatat barang masuk dua batch, lalu meretur sebagian", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const itemName = `Amoxicillin E2E ${t}`;
  await signIn(page, E2E_APOTEKER);
  await expect(page.getByRole("region", { name: "Stok", exact: true })).toBeVisible();

  await page.goto("/admin/stok");
  await page.getByRole("button", { name: "+ Barang" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Tambah barang" });
  await itemDialog.getByLabel("Kode").fill(`E2E-${t}-OBT`);
  await itemDialog.getByLabel("Nama", { exact: true }).fill(itemName);
  await itemDialog.getByLabel("Satuan").fill("kapsul");
  await itemDialog.getByLabel("Batas menipis").fill("20");
  await itemDialog.getByLabel("Harga jual").fill("2000");
  await itemDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(itemDialog).toBeHidden({ timeout: 30_000 });
  const items = page.getByRole("region", { name: "Barang", exact: true });
  await expect(items.getByRole("row").filter({ hasText: itemName })).toContainText("0 kapsul", { timeout: 30_000 });

  await page.goto("/admin/stok?tab=masuk");
  await page.getByRole("link", { name: "+ Barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/baru$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplierDialog = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplierDialog.getByLabel("Nama supplier").fill(`Supplier E2E ${t}`);
  await supplierDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(supplierDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel("Supplier", { exact: true })).not.toHaveValue("");

  await page.getByLabel("Nomor faktur").fill(`E2E-${t}-001`);
  const option = `${itemName} (E2E-${t}-OBT)`;
  await page.getByLabel("Barang baris 1").selectOption({ label: option });
  await page.getByLabel("Jumlah baris 1").fill("10");
  await page.getByLabel("Harga beli baris 1").fill("5000");
  await page.getByLabel("Batch baris 1").fill("B-01");
  await page.getByLabel("Kedaluwarsa baris 1").fill(dayFromToday(365));
  await page.getByRole("button", { name: "+ Tambah baris" }).click();
  await page.getByLabel("Barang baris 2").selectOption({ label: option });
  await page.getByLabel("Jumlah baris 2").fill("6");
  await page.getByLabel("Harga beli baris 2").fill("5000");
  await page.getByLabel("Batch baris 2").fill("B-02");
  await page.getByLabel("Kedaluwarsa baris 2").fill(dayFromToday(400));
  await expect(page.getByText("Rp 80.000")).toBeVisible();
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();

  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
  invoicePath = new URL(page.url()).pathname;
  await expect(page.getByText("Belum dibayar", { exact: true })).toBeVisible();
  // Apoteker tidak melihat bagian pembayaran (spec stok 6.2).
  await expect(page.getByRole("region", { name: "Pembayaran" })).toHaveCount(0);

  await page.getByRole("button", { name: "Retur ke supplier" }).click();
  const returnDialog = page.getByRole("dialog", { name: "Retur ke supplier" });
  await returnDialog.getByLabel(`Jumlah retur ${itemName} batch B-01`).fill("2");
  await returnDialog.getByRole("button", { name: "Simpan retur" }).click();
  await expect(returnDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Retur", exact: true })).toContainText("Rp 10.000", { timeout: 30_000 });

  await page.goto("/admin/stok");
  const row = page.getByRole("region", { name: "Barang", exact: true }).getByRole("row").filter({ hasText: itemName });
  await expect(row).toContainText("14 kapsul");
  await expect(row).toContainText("Menipis");

  const response = await page.goto("/admin/hutang");
  expect(response?.status()).toBe(403);
});

test("admin keuangan membayar sebagian lalu melunasi, dan tidak bisa mengubah stok", async ({ page }, testInfo) => {
  test.skip(!invoicePath, "Butuh faktur dari uji sebelumnya.");
  const t = tag(testInfo);
  await signIn(page, E2E_KEUANGAN);
  await expect(page.getByRole("region", { name: "Hutang", exact: true })).toBeVisible();

  await page.goto("/admin/hutang");
  const row = page.getByRole("row").filter({ hasText: `E2E-${t}-001` });
  await expect(row).toContainText("Rp 70.000");
  await row.getByRole("link", { name: `E2E-${t}-001` }).click();
  await expect(page).toHaveURL(new RegExp(`${invoicePath}$`), { timeout: 30_000 });

  const payments = page.getByRole("region", { name: "Pembayaran" });
  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  const dialog = page.getByRole("dialog", { name: "Catat pembayaran" });
  await dialog.getByLabel("Nominal").fill("30000");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Sebagian", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Bawaannya nominal = sisa hutang (Rp 40.000).
  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Lunas", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(payments.getByRole("button", { name: "Catat pembayaran" })).toHaveCount(0);

  await page.goto("/admin/stok");
  await expect(page.getByRole("region", { name: "Barang", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Barang" })).toHaveCount(0);
});

test("resepsionis tidak bisa membuka Stok atau Hutang", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  expect((await page.goto("/admin/stok"))?.status()).toBe(403);
  expect((await page.goto("/admin/hutang"))?.status()).toBe(403);
});
```

- [ ] **Step 3: Jalankan E2E per kelompok**

Run: `pkill -f "next dev -p"; pkill -f playwright; npx playwright test tests/e2e/stok-hutang.spec.ts > "$WS/e2e-stok.log" 2>&1; tail -30 "$WS/e2e-stok.log"`
Expected: 6 uji lulus (3 uji × desktop dan ponsel). Bila ada yang gagal, baca galat dan jejaknya, perbaiki kodenya (bukan melonggarkan uji), lalu ulangi.

Run (kelompok yang bersinggungan): `pkill -f "next dev -p"; pkill -f playwright; npx playwright test tests/e2e/admin-sidebar.spec.ts tests/e2e/dasbor.spec.ts tests/e2e/tampilan-admin.spec.ts > "$WS/e2e-admin.log" 2>&1; tail -20 "$WS/e2e-admin.log"`
Expected: lulus.

- [ ] **Step 4: Verifikasi penuh**

E2E mengisi `sundy_test` dengan data `prepare-db`. Kosongkan dulu sebelum uji integrasi, dengan skrip sementara yang langsung dihapus lagi:

```bash
pkill -f "next dev -p"; pkill -f playwright
cat > tests/zz-clean.mts <<'EOF'
import "dotenv/config";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
const { prisma } = await import("../src/lib/db");
const { purgeEncounters } = await import("./purge-encounters");
await purgeEncounters(prisma);
for (const table of [
  prisma.stockMovement, prisma.supplierReturnLine, prisma.supplierReturn, prisma.supplierPayment,
  prisma.stockBatch, prisma.purchaseLine, prisma.purchaseInvoice, prisma.supplier, prisma.stockItem,
  prisma.slotHold, prisma.intake, prisma.appointment, prisma.patient, prisma.patientNumberCounter,
] as { deleteMany: () => Promise<unknown> }[]) {
  await table.deleteMany();
}
await prisma.$disconnect();
EOF
npx tsx tests/zz-clean.mts; rm tests/zz-clean.mts
```

Lalu:

```bash
npx vitest run > "$WS/final-unit.log" 2>&1; grep -E "Test Files|Tests " "$WS/final-unit.log"
npm run test:integration > "$WS/final-int.log" 2>&1; grep -E "Test Files|Tests |FAIL" "$WS/final-int.log"
npx eslint . > "$WS/final-lint.log" 2>&1; echo "eslint exit $?"
npx tsc --noEmit -p . > "$WS/final-tsc.log" 2>&1; echo "tsc exit $?"
npm run build > "$WS/final-build.log" 2>&1; echo "build exit $?"
```

Expected: semua uji unit lulus; integrasi lulus kecuali 3 uji lama di `tests/integration/schedule.test.ts` (tanggal tetap, lihat Global Constraints); eslint dan `tsc` keluar 0; build berhasil.

- [ ] **Step 5: Tandai spec dan commit**

Di `docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md`, ganti baris `- **Status:** Menunggu tinjauan pemilik` dengan `- **Status:** Dibangun (belum dideploy)`.

```bash
git add tests/e2e/credentials.ts tests/e2e/prepare-db.mts tests/e2e/stok-hutang.spec.ts docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md
git commit -m "test: cover stock entry, supplier returns, and payable payments end to end, and mark the design as built"
```

Catatan deploy (bukan bagian rencana ini, hanya atas permintaan pemilik): ada migrasi, jadi cadangkan basis data dulu. Setelah deploy, akun Apoteker dan Admin Keuangan dibuat lewat `npm run create-admin -- <email> <kata-sandi> "<nama>" APOTEKER` (atau `ADMIN_KEUANGAN`) di server; kata sandi tidak lewat chat.
