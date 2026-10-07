# Tagihan dan Pembayaran Customer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resepsionis menagih customer dari kunjungan final atau penjualan langsung (layanan, treatment, obat/produk dari stok), dengan diskon, pembayaran bertahap, dan pembatalan beralasan; Admin Keuangan mengawasi dan mengoreksi.

**Architecture:**
- **Data:** tabel `Invoice` (draf → final → dibatalkan, dengan nomor versi untuk suntingan bersamaan), `InvoiceLine`, `InvoiceStockUse` (batch yang terambil + harga pokoknya), `InvoicePayment` (bisa dibatalkan), `InvoiceNumberCounter`; jurnal stok mendapat jenis `KELUAR`. Kemampuan baru `invoice:read`, `invoice:manage`, `invoice:correct`.
- **Pembagian kode:** aturan murni (total, diskon, status, rencana FEFO, validasi, label) di `src/lib/invoice.ts`; pembantu transaksi di `src/server/invoice-store.ts`; aksi server dibagi per tanggung jawab (`invoice-drafts.ts`, `invoice-lifecycle.ts`, `invoice-payments.ts`, semuanya `"use server"`); pembacaan di `invoice-read.ts` (tanpa `"use server"`).
- **Keamanan data:** setiap tulisan yang menyangkut satu tagihan mengunci barisnya (`SELECT … FOR UPDATE`) di dalam transaksi; pengambilan stok memakai `takeFromBatch` (UPDATE bersyarat) dari sub-proyek stok; satu tagihan aktif per kunjungan dijaga constraint eksklusi.

**Tech Stack:** Next.js 15.5 App Router, React 19, Prisma 7 + PostgreSQL, shadcn/ui (Radix), Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md`

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi berbahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar.
- **Zona waktu:** WITA. Kolom tanggal tanpa jam (`paidAt`) disimpan `@db.Date` dan dipertukarkan sebagai teks `"YYYY-MM-DD"`; "hari ini" selalu `witaDateString(new Date())`. Pembantu `dateOnly`, `dateOnlyString`, `dateLabel`, `isDateString` sudah ada di `src/lib/stock.ts`.
- **Uang:** rupiah penuh (`Int`), tampil lewat `formatRupiah`. **Jumlah barang:** bilangan bulat.
- **Angka penting dari spec:** batas diskon resepsionis **20%** dari subtotal; "Perlu ditagih" dibatasi **30 hari** terakhir; nomor tagihan `TG-{tahun}-{4 digit}`.
- **Hak akses (spec 6):**

  | Kemampuan | Dipegang |
  |---|---|
  | `invoice:read` | Resepsionis, Admin Keuangan, Super Admin |
  | `invoice:manage` | Resepsionis, Super Admin |
  | `invoice:correct` | Admin Keuangan, Super Admin |

  Dokter, Apoteker, dan Terapis tidak mengakses tagihan.
- **Setiap halaman dan aksi server** memanggil `requireCapability` sendiri. Menyembunyikan tombol bukan kontrol akses.
- **Tagihan tidak pernah membawa teks klinis** catatan dokter: hanya nama layanan, area, dan harga. **Harga pokok** (harga beli batch) hanya untuk pemegang `stock:read`.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (ekspor tipe boleh). Konstanta dan fungsi murni tinggal di `src/lib`; pembantu server biasa di modul tanpa `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`; komponen tidak mengimpor `@/lib/db`. Komponen server hanya mengambil **komponen** dari modul `"use client"` (dijaga uji arsitektur).
- **Riwayat tidak pernah dihapus:** tagihan dan pembayaran dibatalkan (`cancelledAt`/`revokedAt` dengan alasan), tidak dihapus.
- **Jejak audit** memakai `recordAudit`, dengan nama aksi persis: `invoice.create`, `invoice.update`, `invoice.finalize`, `invoice.cancel`, `invoice.discount`, `invoice-payment.create`, `invoice-payment.revoke`.
- **Migrasi hanya menambah** (tabel, kolom, nilai enum, CHECK, constraint). Diterapkan berurutan: `npx prisma migrate deploy`, `npm run db:migrate:test`, `npx prisma generate`, lalu `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` harus keluar 0.
- **Tanpa dependensi baru.** Repo tidak memakai Prettier; ikuti format kode di sekitarnya.
- **Log uji:** `WS` adalah direktori kerja rencana (`.superpowers/sdd/2026-10-07-plan-tagihan-pembayaran/`, dibuat `sdd-workspace`). Output panjang ditulis ke sana.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`). Jangan jalankan bersamaan dengan e2e; setelah e2e, kosongkan data e2e di `sundy_test` sebelum integrasi lagi. Laptop 8 GB: e2e per berkas atau kelompok, matikan proses `next dev`/playwright sisa dulu.
- **Uji yang sudah gagal sebelum rencana ini:** 3 uji di `tests/integration/schedule.test.ts` (tanggal tetap 2026-10-05). Jangan diubah. Satu uji `encounter-form.test.tsx` ("tautan di dalam aplikasi…") kadang gagal di suite penuh tetapi lulus bila diulang.
- **Commit:** Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. **Jangan pernah mengubah atau men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Dua orang memfinalkan tagihan yang sama bersamaan, atau menekan "Buat tagihan" dua kali.** Tepat satu tagihan/finalisasi berhasil; stok tidak berkurang dua kali → uji bersamaan di Task 3 dan Task 5.
2. **Stok kurang di tengah finalisasi** (barang pertama cukup, barang kedua tidak; atau satu barang di dua baris). Seluruh finalisasi batal, tidak ada stok yang tertinggal berkurang → uji di Task 5.
3. **Dua pembayaran bersamaan yang masing-masing melunasi.** Hanya satu diterima → uji di Task 6.
4. **Permintaan buatan** (jumlah pecahan/negatif, harga negatif, diskon di atas subtotal atau di atas 20% oleh resepsionis, tanggal bayar tidak ada atau di masa depan, suntingan dengan nomor versi usang, mengubah tagihan yang sudah final) ditolak di server → uji di Task 2 (aturan), Task 4, dan Task 6.
5. **Peran memanggil aksi peran lain langsung** (Admin Keuangan membuat tagihan, Resepsionis membatalkan pembayaran atau memberi diskon besar, Dokter/Apoteker membuka tagihan) ditolak di server → uji hak akses di Task 3–6.

---

## Struktur berkas

**Baru**

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `prisma/migrations/20261007180000_tagihan/migration.sql` | Tabel, enum, CHECK, constraint eksklusi, nilai `KELUAR` | 1 |
| `src/lib/invoice.ts` | Aturan hitung, FEFO, baris dari kunjungan, validasi, label | 2 |
| `src/server/invoice-store.ts` | Kunci tagihan, penomoran, pembantu draf (tanpa `"use server"`) | 3 |
| `src/server/invoice-read.ts` | Daftar, detail, perlu ditagih, katalog barang, ringkasan | 3 |
| `src/server/invoice-drafts.ts` | Aksi buat dan ubah draf | 3, 4 |
| `src/server/invoice-lifecycle.ts` | Aksi finalkan dan batalkan | 5 |
| `src/server/invoice-payments.ts` | Aksi pembayaran dan diskon sesudah final | 6 |
| `src/components/admin/billing/*` | Tabel, dialog, editor draf, tampilan final | 7–10 |
| `src/app/(admin)/admin/tagihan/**` | Halaman | 7–9 |
| `tests/integration/invoice-world.ts` | Pembantu uji: kunjungan final, barang, tagihan | 1 |

**Diubah**

| Berkas | Perubahan | Task |
|---|---|---|
| `prisma/schema.prisma` | Model dan enum baru, relasi, `KELUAR`, `StockMovement.invoiceId` | 1 |
| `src/lib/permissions.ts`, `src/lib/stock.ts`, `tests/integration/stock-world.ts` | Kemampuan baru, label `KELUAR`, tipe `seedBatch` | 1 |
| `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/page.tsx` | Menu dan kotak dasbor | 10 |
| `src/app/globals.css` | Gaya cetak tagihan | 9 |
| `tests/e2e/prepare-db.mts` | Fixture e2e | 11 |

---
### Task 1: Fondasi — tabel tagihan, jenis stok `KELUAR`, kemampuan baru, pembantu uji

**Files:**
- Create: `prisma/migrations/20261007180000_tagihan/migration.sql`, `tests/integration/invoice-world.ts`, `tests/integration/invoice-schema.test.ts`
- Modify: `prisma/schema.prisma`, `src/lib/permissions.ts`, `src/lib/stock.ts`, `tests/integration/stock-world.ts`, `tests/unit/migrations.test.ts`, `tests/unit/permissions.test.ts`

**Interfaces:**
- Consumes: sub-proyek stok (`StockItem`, `StockBatch`, `StockMovement`, `StockMovementKind`, `PaymentMethod`, `seedBatch`), model `Patient`, `Appointment`, `Branch`, `Encounter`, `EncounterTreatment`.
- Produces:
  - Prisma: enum `InvoiceStatus` (`DRAF`, `FINAL`, `DIBATALKAN`), `InvoiceLineKind` (`LAYANAN`, `TREATMENT`, `BARANG`), `DiscountKind` (`NOMINAL`, `PERSEN`); `StockMovementKind` + `KELUAR`; `StockMovement.invoiceId String?`;
  - model `InvoiceNumberCounter`, `Invoice`, `InvoiceLine` (unik `[invoiceId, encounterTreatmentId]`), `InvoiceStockUse`, `InvoicePayment` — kolom persis seperti Step 2;
  - constraint: CHECK `invoice_status_fields`, `invoice_discount_values`, `invoice_line_values`, `invoice_stock_use_values`, `invoice_payment_amount_positive`; eksklusi `invoice_one_active_per_appointment`;
  - `Capability` + `"invoice:read" | "invoice:manage" | "invoice:correct"`; `RESEPSIONIS` + `invoice:read`, `invoice:manage`; `ADMIN_KEUANGAN` + `invoice:read`, `invoice:correct`; `SUPER_ADMIN` + ketiganya;
  - `src/lib/stock.ts`: `StockMovementKindValue` + `"KELUAR"`, `MOVEMENT_KIND_LABEL.KELUAR = "Keluar (tagihan)"`;
  - `seedBatch(world: Pick<StockWorld, "supplierId" | "branchId">, input)` (tipe parameter dilonggarkan);
  - `tests/integration/invoice-world.ts`: tipe `BillingWorld`, `createBillingWorld(slug, whatsapp)`, `cleanupBillingWorld(slug, whatsapps)`, `finalVisit(world, input?)`, `billingBatch(world, input)`.

- [ ] **Step 1: Pembantu uji dan uji skema (gagal)**

Di `tests/integration/stock-world.ts`, ganti `world: StockWorld,\n  input: {` pada tanda tangan `seedBatch` dengan `world: Pick<StockWorld, "supplierId" | "branchId">,\n  input: {`.

Buat `tests/integration/invoice-world.ts`:

```ts
import { prisma } from "@/lib/db";
import { cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { seedBatch } from "./stock-world";

/**
 * Dunia uji tagihan: dunia booking (cabang, dokter, terapis, layanan) ditambah satu pasien,
 * satu supplier, satu obat (harga jual Rp 2.000) dan satu produk (Rp 150.000). Semua stok
 * ada di cabang dunia booking, karena tagihan mengambil stok dari cabangnya sendiri.
 */
export type BillingWorld = BookingWorld & {
  slug: string;
  patientId: string;
  supplierId: string;
  drugId: string;
  productId: string;
};

const day = (value: string) => new Date(`${value}T00:00:00Z`);

export async function createBillingWorld(slug: string, whatsapp: string): Promise<BillingWorld> {
  const world = await createBookingWorld(slug);
  const code = slug.toUpperCase();
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-2026-${Math.floor(Math.random() * 9000 + 1000)}`, name: `Pasien ${slug}`, whatsapp },
  });
  const supplier = await prisma.supplier.create({ data: { name: `${slug} Farma` } });
  const drug = await prisma.stockItem.create({
    data: { code: `${code}-OBT`, name: `${slug} Amoxicillin`, kind: "OBAT", unit: "kapsul", sellPrice: 2000 },
  });
  const product = await prisma.stockItem.create({
    data: { code: `${code}-PRD`, name: `${slug} Serum C`, kind: "PRODUK", unit: "botol", sellPrice: 150000 },
  });
  return { ...world, slug, patientId: patient.id, supplierId: supplier.id, drugId: drug.id, productId: product.id };
}

/** Faktur satu baris + batch + jurnal MASUK di cabang dunia ini (tanpa aksi server). */
export function billingBatch(
  world: BillingWorld,
  input: { invoiceNumber: string; itemId: string; quantity: number; unitCost?: number; expiryDate?: string | null },
) {
  return seedBatch(world, { ...input, unitCost: input.unitCost ?? 1000 });
}

let visitCount = 0;

/**
 * Kunjungan final: booking Hadir + catatan dokter final dengan treatment. `treatments` bawaan
 * satu Facial Uji. Setiap kunjungan memakai jam sendiri agar penjaga anti-bentrok tidak menolaknya.
 */
export async function finalVisit(
  world: BillingWorld,
  input: {
    treatments?: { serviceId: string; serviceName: string }[];
    channel?: "KLINIK" | "ONLINE";
    serviceId?: string;
    finalizedAt?: Date;
  } = {},
): Promise<{ appointmentId: string; encounterId: string }> {
  visitCount += 1;
  const startAt = new Date(Date.UTC(2031, 0, 1, 0, 0) + visitCount * 60 * 60_000);
  const online = input.channel === "ONLINE";
  const appointment = await prisma.appointment.create({
    data: {
      code: `BIL-${world.slug.slice(0, 4).toUpperCase()}-${visitCount}`,
      type: "KONSULTASI",
      channel: online ? "ONLINE" : "KLINIK",
      servicePrice: online ? 250000 : null,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: online ? "WHATSAPP" : "WALK_IN",
      branchId: world.branchId,
      staffId: world.doctorId,
      serviceId: input.serviceId ?? world.consultationId,
      patientId: world.patientId,
    },
  });
  const treatments = input.treatments ?? [{ serviceId: world.treatmentId, serviceName: "Facial Uji" }];
  const encounter = await prisma.encounter.create({
    data: {
      appointmentId: appointment.id,
      createdById: world.doctorId,
      createdByName: "dr. Uji",
      treatments: {
        create: treatments.map((t, index) => ({
          serviceId: t.serviceId,
          serviceName: t.serviceName,
          performerId: world.therapistId,
          performerName: "Terapis Uji",
          sortOrder: index,
        })),
      },
    },
  });
  await prisma.encounter.update({
    where: { id: encounter.id },
    data: { status: "FINAL", assessment: "Uji", finalizedAt: input.finalizedAt ?? new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
  });
  return { appointmentId: appointment.id, encounterId: encounter.id };
}

/** Menghapus semua data dunia uji, dari anak ke induk (relasi tagihan dan stok memakai Restrict). */
export async function cleanupBillingWorld(slug: string, patientWhatsapps: string[] = []): Promise<void> {
  const branch = { slug: { startsWith: slug } };
  await prisma.invoiceStockUse.deleteMany({ where: { line: { invoice: { branch } } } });
  await prisma.invoicePayment.deleteMany({ where: { invoice: { branch } } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { branch } } });
  await prisma.invoice.deleteMany({ where: { branch } });
  await prisma.stockMovement.deleteMany({ where: { batch: { branch } } });
  await prisma.stockBatch.deleteMany({ where: { branch } });
  await prisma.purchaseLine.deleteMany({ where: { invoice: { branch } } });
  await prisma.purchaseInvoice.deleteMany({ where: { branch } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: slug } } });
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: slug.toUpperCase() } } });
  await cleanupBookingWorld(slug, patientWhatsapps);
}

export { day };
```

Buat `tests/integration/invoice-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isExclusionViolation } from "@/server/db-errors";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

const SLUG = "skema-tagihan";
const WA = "6281200008800";

describe("skema tagihan", () => {
  let world: BillingWorld;
  let appointmentId: string;

  const invoice = (data: Record<string, unknown> = {}) =>
    prisma.invoice.create({
      data: {
        patientId: world.patientId,
        branchId: world.branchId,
        createdById: "s1",
        createdByName: "Resepsionis Uji",
        ...data,
      },
    });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    appointmentId = (await finalVisit(world)).appointmentId;
  });

  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("tagihan baru berstatus draf, versi 1, tanpa nomor", async () => {
    expect(await invoice()).toMatchObject({ status: "DRAF", version: 1, number: null, discountValue: 0 });
  });

  it("tagihan final wajib bernomor dan berwaktu final; draf tidak boleh bernomor", async () => {
    await expect(invoice({ status: "FINAL" })).rejects.toThrow(/invoice_status_fields/);
    await expect(invoice({ number: "TG-2031-9999" })).rejects.toThrow(/invoice_status_fields/);
    expect(await invoice({ status: "FINAL", number: "TG-2031-9998", finalizedAt: new Date() })).toMatchObject({ status: "FINAL" });
  });

  it("diskon: persen paling banyak 100, wajib jenis dan alasan bila bernilai", async () => {
    await expect(invoice({ discountKind: "PERSEN", discountValue: 101, discountReason: "x" })).rejects.toThrow(/invoice_discount_values/);
    await expect(invoice({ discountValue: 5000, discountReason: "x" })).rejects.toThrow(/invoice_discount_values/);
    await expect(invoice({ discountKind: "NOMINAL", discountValue: 5000 })).rejects.toThrow(/invoice_discount_values/);
    expect(await invoice({ discountKind: "NOMINAL", discountValue: 5000, discountReason: "Pelanggan lama" })).toMatchObject({ discountValue: 5000 });
  });

  it("satu tagihan aktif per kunjungan; yang dibatalkan tidak menghalangi", async () => {
    const first = await invoice({ appointmentId });
    const clash = await invoice({ appointmentId }).catch((error: unknown) => error);
    expect(isExclusionViolation(clash)).toBe(true);
    await prisma.invoice.update({ where: { id: first.id }, data: { status: "DIBATALKAN", cancelledAt: new Date() } });
    expect((await invoice({ appointmentId })).status).toBe("DRAF");
  });

  it("baris: jumlah positif, harga tidak negatif, barang wajib punya barang", async () => {
    const created = await invoice();
    const line = (data: Record<string, unknown>) =>
      prisma.invoiceLine.create({ data: { invoiceId: created.id, kind: "LAYANAN", name: "Konsultasi", quantity: 1, unitPrice: 1000, ...data } });
    await expect(line({ quantity: 0 })).rejects.toThrow(/invoice_line_values/);
    await expect(line({ unitPrice: -1 })).rejects.toThrow(/invoice_line_values/);
    await expect(line({ kind: "BARANG" })).rejects.toThrow(/invoice_line_values/);
    await expect(line({ itemId: world.drugId })).rejects.toThrow(/invoice_line_values/);
    expect((await line({ kind: "BARANG", itemId: world.drugId })).kind).toBe("BARANG");
  });

  it("pembayaran harus lebih dari 0; treatment yang sama tidak masuk dua kali di satu tagihan", async () => {
    const created = await invoice();
    await expect(
      prisma.invoicePayment.create({
        data: { invoiceId: created.id, amount: 0, method: "TUNAI", paidAt: new Date("2031-01-01T00:00:00Z"), staffId: "s1", staffName: "Uji" },
      }),
    ).rejects.toThrow(/invoice_payment_amount_positive/);
    const base = { invoiceId: created.id, kind: "TREATMENT" as const, name: "Facial", quantity: 1, unitPrice: 1000, encounterTreatmentId: "et-1" };
    await prisma.invoiceLine.create({ data: base });
    await expect(prisma.invoiceLine.create({ data: base })).rejects.toThrow(/Unique constraint/);
  });
});
```

Tambahkan di akhir `tests/unit/permissions.test.ts`:

```ts
describe("hak akses tagihan (spec tagihan 6)", () => {
  it("Resepsionis menagih tetapi tidak mengoreksi", () => {
    expect(can("RESEPSIONIS", "invoice:read")).toBe(true);
    expect(can("RESEPSIONIS", "invoice:manage")).toBe(true);
    expect(can("RESEPSIONIS", "invoice:correct")).toBe(false);
  });

  it("Admin Keuangan melihat dan mengoreksi tetapi tidak membuat tagihan", () => {
    expect(can("ADMIN_KEUANGAN", "invoice:read")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "invoice:correct")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "invoice:manage")).toBe(false);
  });

  it("Dokter, Apoteker, dan Terapis tidak mengakses tagihan; Super Admin semuanya", () => {
    for (const role of ["DOKTER", "APOTEKER", "TERAPIS"] as const) {
      for (const capability of ["invoice:read", "invoice:manage", "invoice:correct"] as const) {
        expect(can(role, capability)).toBe(false);
      }
    }
    for (const capability of ["invoice:read", "invoice:manage", "invoice:correct"] as const) {
      expect(can("SUPER_ADMIN", capability)).toBe(true);
    }
  });
});
```

Run: `npx vitest run tests/unit/permissions.test.ts; npm run test:integration -- tests/integration/invoice-schema.test.ts`
Expected: FAIL — kemampuan `invoice:*` belum ada, dan model `invoice` belum ada di klien Prisma.

- [ ] **Step 2: Skema Prisma**

Di `prisma/schema.prisma`:

1. Tambahkan nilai `KELUAR` ke `enum StockMovementKind` (setelah `PENYESUAIAN`).
2. Di `model StockMovement`, tambahkan setelah `supplierReturnId String?`:

```prisma
  /// Tagihan yang mengeluarkan atau mengembalikan stok ini (KELUAR, atau PENYESUAIAN dari pembatalan tagihan).
  invoiceId        String?
```

3. Tambahkan satu baris `  invoices Invoice[]` tepat setelah baris pembuka `model Patient {`, `model Appointment {`, dan `model Branch {`.
4. Tambahkan di **akhir** berkas:

```prisma
// ---------------------------------------------------------------------------
// Tagihan dan pembayaran customer (spec docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md)
// ---------------------------------------------------------------------------

enum InvoiceStatus {
  DRAF
  FINAL
  DIBATALKAN
}

enum InvoiceLineKind {
  LAYANAN
  TREATMENT
  BARANG
}

enum DiscountKind {
  NOMINAL
  PERSEN
}

/// Penghitung nomor tagihan per tahun; diambil atomik saat tagihan difinalkan.
model InvoiceNumberCounter {
  year  Int @id
  value Int @default(0)
}

/// Tagihan customer. Draf bisa diubah; Final terkunci dan memotong stok; Dibatalkan tetap tercatat.
model Invoice {
  id      String        @id @default(cuid())
  /// "TG-2026-0001"; kosong selama draf (CHECK invoice_status_fields).
  number  String?       @unique
  status  InvoiceStatus @default(DRAF)
  /// Naik setiap perubahan draf; menolak suntingan bersamaan dari halaman yang usang.
  version Int           @default(1)

  patientId     String
  patient       Patient      @relation(fields: [patientId], references: [id], onDelete: Restrict)
  /// Kosong untuk penjualan langsung. Satu tagihan aktif per kunjungan (constraint invoice_one_active_per_appointment).
  appointmentId String?
  appointment   Appointment? @relation(fields: [appointmentId], references: [id], onDelete: Restrict)
  branchId      String
  branch        Branch       @relation(fields: [branchId], references: [id], onDelete: Restrict)

  discountKind   DiscountKind?
  discountValue  Int           @default(0)
  discountReason String?
  discountByName String?

  notes           String?
  createdById     String
  createdByName   String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  finalizedAt     DateTime?
  finalizedByName String?
  cancelledAt     DateTime?
  cancelledByName String?
  cancelReason    String?

  lines    InvoiceLine[]
  payments InvoicePayment[]

  @@index([status, createdAt])
  @@index([patientId])
  @@index([appointmentId])
}

model InvoiceLine {
  id        String          @id @default(cuid())
  invoiceId String
  invoice   Invoice         @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
  kind      InvoiceLineKind
  /// Disalin saat baris dibuat, bukan dirujuk: perubahan katalog tidak mengubah tagihan.
  name      String
  quantity  Int
  unitPrice Int
  sortOrder Int             @default(0)
  serviceId String?
  /// Treatment di catatan dokter asal baris ini; mencegah treatment yang sama masuk dua kali.
  encounterTreatmentId String?
  itemId    String?
  /// Catatan bila harga diubah dari harga katalog.
  priceNote String?

  stockUses InvoiceStockUse[]

  @@unique([invoiceId, encounterTreatmentId])
  @@index([invoiceId])
}

/// Stok yang diambil untuk satu baris barang, per batch, dengan harga pokoknya (untuk laporan nanti).
model InvoiceStockUse {
  id       String      @id @default(cuid())
  lineId   String
  line     InvoiceLine @relation(fields: [lineId], references: [id], onDelete: Restrict)
  batchId  String
  quantity Int
  /// Disalin dari batch saat stok diambil.
  unitCost Int

  @@index([lineId])
}

/// Uang masuk dari customer. Salah input dibatalkan (revokedAt), tidak dihapus.
model InvoicePayment {
  id            String        @id @default(cuid())
  invoiceId     String
  invoice       Invoice       @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
  amount        Int
  method        PaymentMethod
  paidAt        DateTime      @db.Date
  reference     String?
  staffId       String
  staffName     String
  createdAt     DateTime      @default(now())
  revokedAt     DateTime?
  revokedByName String?
  revokeReason  String?

  @@index([invoiceId])
}
```

5. Jalankan `npx prisma format`.

- [ ] **Step 3: Migrasi**

```bash
npx prisma migrate deploy
mkdir -p prisma/migrations/20261007180000_tagihan
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  > prisma/migrations/20261007180000_tagihan/migration.sql
cat prisma/migrations/20261007180000_tagihan/migration.sql
```

Expected: SQL berisi `ALTER TYPE "StockMovementKind" ADD VALUE 'KELUAR';`, tiga `CREATE TYPE`, `ALTER TABLE "StockMovement" ADD COLUMN "invoiceId"`, enam `CREATE TABLE` (termasuk `InvoiceNumberCounter`), indeks dan unik, dan `ADD CONSTRAINT … FOREIGN KEY`. Tidak ada `DROP`. **Hasil generate yang dipakai.**

Tambahkan di **awal** berkas:

```sql
-- Tagihan dan pembayaran customer (sub-proyek keuangan 2).
-- Spec: docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md bagian 3.
-- Migrasi ini hanya menambah: tabel, enum, nilai jurnal stok, CHECK, dan constraint eksklusi.

```

Lalu tambahkan di **akhir** berkas:

```sql

-- Penjagaan nilai di basis data (spec tagihan 3.4).
-- Tagihan final wajib bernomor dan berwaktu final; draf tidak boleh bernomor.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_status_fields CHECK (
  ("status" <> 'FINAL' OR ("number" IS NOT NULL AND "finalizedAt" IS NOT NULL))
  AND ("status" <> 'DRAF' OR "number" IS NULL)
);

-- Diskon: tidak negatif, persen paling banyak 100, wajib jenis dan alasan bila bernilai.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_discount_values CHECK (
  "discountValue" >= 0
  AND ("discountKind" IS NOT NULL OR "discountValue" = 0)
  AND ("discountKind" IS DISTINCT FROM 'PERSEN' OR "discountValue" <= 100)
  AND ("discountValue" = 0 OR "discountReason" IS NOT NULL)
);

-- Satu tagihan aktif (bukan dibatalkan) per kunjungan.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_one_active_per_appointment
  EXCLUDE USING btree ("appointmentId" WITH =)
  WHERE ("appointmentId" IS NOT NULL AND "status" <> 'DIBATALKAN');

ALTER TABLE "InvoiceLine" ADD CONSTRAINT invoice_line_values CHECK (
  "quantity" > 0 AND "unitPrice" >= 0 AND (("kind" = 'BARANG') = ("itemId" IS NOT NULL))
);

ALTER TABLE "InvoiceStockUse" ADD CONSTRAINT invoice_stock_use_values CHECK ("quantity" > 0 AND "unitCost" >= 0);

ALTER TABLE "InvoicePayment" ADD CONSTRAINT invoice_payment_amount_positive CHECK ("amount" > 0);
```

Terapkan:

```bash
npx prisma migrate deploy
npm run db:migrate:test
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: ketiga perintah pertama berhasil; perintah terakhir keluar dengan kode 0. Bila perintah terakhir melaporkan constraint eksklusi sebagai selisih, ganti ke berkas migrasi baru yang menambahkannya secara terpisah; constraint eksklusi `appointment_no_overlap` yang sudah ada tidak pernah dilaporkan, jadi hal ini tidak diperkirakan.

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi tagihan", () => {
  const sql = readFileSync("prisma/migrations/20261007180000_tagihan/migration.sql", "utf8");

  it("hanya menambah: tanpa DROP", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga status tagihan, diskon, baris, dan pembayaran di basis data", () => {
    for (const name of [
      "invoice_status_fields",
      "invoice_discount_values",
      "invoice_one_active_per_appointment",
      "invoice_line_values",
      "invoice_payment_amount_positive",
    ]) {
      expect(sql).toContain(name);
    }
  });

  it("menambah jenis stok KELUAR", () => {
    expect(sql).toMatch(/ADD VALUE 'KELUAR'/);
  });
});
```

- [ ] **Step 4: Kemampuan dan label**

Di `src/lib/permissions.ts`:
1. Tambahkan ke tipe `Capability` (setelah `| "payable:manage"`): `| "invoice:read"\n  | "invoice:manage"\n  | "invoice:correct"`.
2. Pada `SUPER_ADMIN`, tambahkan `"invoice:read", "invoice:manage", "invoice:correct",` setelah `"payable:manage",`.
3. Ganti `RESEPSIONIS: ["booking:manage", "schedule:manage"],` dengan `RESEPSIONIS: ["booking:manage", "schedule:manage", "invoice:read", "invoice:manage"],` dan tambahkan di atasnya komentar `// Resepsionis juga menagih customer (spec tagihan 6); koreksi uang masuk ada di Admin Keuangan.`
4. Ganti `ADMIN_KEUANGAN: ["stock:read", "payable:manage", "report:read"],` dengan `ADMIN_KEUANGAN: ["stock:read", "payable:manage", "report:read", "invoice:read", "invoice:correct"],`.

Di `src/lib/stock.ts`: ubah `StockMovementKindValue` menjadi `"MASUK" | "RETUR" | "PENYESUAIAN" | "KELUAR"` dan tambahkan `KELUAR: "Keluar (tagihan)",` ke `MOVEMENT_KIND_LABEL`.

Run: `npx tsc --noEmit -p . > "$WS/t1-tsc.log" 2>&1; echo "tsc exit $?"; tail -10 "$WS/t1-tsc.log"`
Expected: `tsc exit 0`.

- [ ] **Step 5: Jalankan uji dan commit**

Run: `npx vitest run tests/unit/permissions.test.ts tests/unit/migrations.test.ts; npm run test:integration -- tests/integration/invoice-schema.test.ts tests/integration/stock-schema.test.ts`
Expected: PASS semua.

Run: `npx vitest run > "$WS/t1.log" 2>&1; grep -E "Test Files|Tests " "$WS/t1.log"; npx eslint src/lib tests/integration/invoice-world.ts tests/integration/invoice-schema.test.ts`
Expected: semua PASS, eslint bersih.

```bash
git add prisma/schema.prisma prisma/migrations/20261007180000_tagihan src/lib/permissions.ts src/lib/stock.ts \
  tests/integration/stock-world.ts tests/integration/invoice-world.ts tests/integration/invoice-schema.test.ts \
  tests/unit/migrations.test.ts tests/unit/permissions.test.ts
git commit -m "feat: add invoice tables, the stock-out movement kind, and invoice capabilities"
```

---

### Task 2: Aturan tagihan — hitung, diskon, FEFO, isi dari kunjungan, validasi, label

**Files:**
- Create: `src/lib/invoice.ts`
- Test: `tests/unit/invoice.test.ts`

**Interfaces:**
- Consumes (sudah ada): `formatRupiah` (`@/lib/format`); `dateOnlyString`, `isDateString`, `validateReason`, `PAYMENT_METHODS`, `MAX_AMOUNT`, `MAX_QUANTITY`, tipe `PaymentMethodValue`, `Validation` (`@/lib/stock`).
- Produces (`src/lib/invoice.ts`):
  - tipe: `InvoiceStatusValue`, `InvoiceLineKindValue`, `DiscountKindValue`, `InvoiceDisplayStatus` (`"DRAF" | "BELUM_DIBAYAR" | "SEBAGIAN" | "LUNAS" | "DIBATALKAN"`), `InvoiceView` (`"PERLU_DITAGIH" | "DRAF" | "BELUM_LUNAS" | "LUNAS" | "DIBATALKAN"`);
  - konstanta/label: `DISCOUNT_LIMIT_PERCENT = 20`, `BILLABLE_DAYS = 30`, `INVOICE_STATUS_LABEL`, `INVOICE_VIEW_LABEL`, `INVOICE_VIEWS`, `INVOICE_LINE_KIND_LABEL`, `DISCOUNT_KIND_LABEL`;
  - hitung: `invoiceSubtotal(lines)`, `discountAmount(subtotal, kind, value)`, `discountLimit(subtotal)`, `invoiceTotals(input: InvoiceInput): InvoiceTotals`, `formatInvoiceNumber(year, sequence)`, `isInvoiceView(value)`, `matchesInvoiceView(row, view)`;
  - FEFO: `fefoPlan(batches: BatchStock[], quantity: number, today: string): FefoPlan`;
  - isi kunjungan: `visitLines(input): DraftLine[]`;
  - validasi (semua `Validation<…>`): `validateFreeLine(raw)`, `validateItemAdd(raw)`, `validateLineEdit(raw, { needsNote })`, `validateDiscount(raw, { subtotal, canExceed })`, `validateInvoicePayment(raw, { today, finalizedDate, limit })`;
  - tipe masukan: `FreeLineInput`, `ItemAddInput`, `LineEditInput`, `DiscountInput`, `InvoicePaymentInput`.

- [ ] **Step 1: Tulis uji (gagal)**

Buat `tests/unit/invoice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  discountAmount,
  discountLimit,
  fefoPlan,
  formatInvoiceNumber,
  invoiceSubtotal,
  invoiceTotals,
  matchesInvoiceView,
  validateDiscount,
  validateFreeLine,
  validateInvoicePayment,
  validateItemAdd,
  validateLineEdit,
  visitLines,
  type InvoiceInput,
} from "@/lib/invoice";

const TODAY = "2026-10-07";
const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("subtotal, diskon, dan total", () => {
  const lines = [
    { quantity: 1, unitPrice: 200000 },
    { quantity: 2, unitPrice: 2000 },
  ];

  it("subtotal = Σ jumlah × harga", () => {
    expect(invoiceSubtotal(lines)).toBe(204000);
    expect(invoiceSubtotal([])).toBe(0);
  });

  it("diskon persen dibulatkan ke bawah; nominal tidak melebihi subtotal; tanpa jenis = 0", () => {
    expect(discountAmount(204000, "PERSEN", 10)).toBe(20400);
    expect(discountAmount(1005, "PERSEN", 10)).toBe(100);
    expect(discountAmount(204000, "NOMINAL", 5000)).toBe(5000);
    expect(discountAmount(1000, "NOMINAL", 5000)).toBe(1000);
    expect(discountAmount(204000, null, 5000)).toBe(0);
    expect(discountLimit(204000)).toBe(40800);
    expect(discountLimit(1004)).toBe(200);
  });

  const base: InvoiceInput = { status: "FINAL", discountKind: null, discountValue: 0, lines, payments: [] };

  it("total, dibayar, sisa, dan status tampil", () => {
    expect(invoiceTotals(base)).toEqual({ subtotal: 204000, discount: 0, total: 204000, paid: 0, balance: 204000, display: "BELUM_DIBAYAR" });
    const partial = { ...base, discountKind: "NOMINAL" as const, discountValue: 4000, payments: [{ amount: 50000, revokedAt: null }] };
    expect(invoiceTotals(partial)).toMatchObject({ discount: 4000, total: 200000, paid: 50000, balance: 150000, display: "SEBAGIAN" });
    const paid = { ...base, payments: [{ amount: 204000, revokedAt: null }] };
    expect(invoiceTotals(paid)).toMatchObject({ balance: 0, display: "LUNAS" });
  });

  it("pembayaran yang dibatalkan tidak dihitung; draf dan dibatalkan punya status sendiri", () => {
    const revoked = { ...base, payments: [{ amount: 204000, revokedAt: new Date() }] };
    expect(invoiceTotals(revoked)).toMatchObject({ paid: 0, display: "BELUM_DIBAYAR" });
    expect(invoiceTotals({ ...base, status: "DRAF" }).display).toBe("DRAF");
    expect(invoiceTotals({ ...base, status: "DIBATALKAN" })).toMatchObject({ display: "DIBATALKAN", balance: 0 });
  });

  it("diskon penuh membuat total Rp 0 dan langsung Lunas", () => {
    expect(invoiceTotals({ ...base, discountKind: "PERSEN", discountValue: 100 })).toMatchObject({ total: 0, balance: 0, display: "LUNAS" });
  });

  it("nomor tagihan dan saringan tampilan", () => {
    expect(formatInvoiceNumber(2026, 7)).toBe("TG-2026-0007");
    expect(formatInvoiceNumber(2026, 12345)).toBe("TG-2026-12345");
    expect(matchesInvoiceView({ display: "SEBAGIAN" }, "BELUM_LUNAS")).toBe(true);
    expect(matchesInvoiceView({ display: "LUNAS" }, "BELUM_LUNAS")).toBe(false);
    expect(matchesInvoiceView({ display: "DRAF" }, "DRAF")).toBe(true);
    expect(matchesInvoiceView({ display: "DIBATALKAN" }, "DIBATALKAN")).toBe(true);
    expect(matchesInvoiceView({ display: "DRAF" }, "PERLU_DITAGIH")).toBe(false);
  });
});

describe("fefoPlan", () => {
  const batch = (id: string, quantityRemaining: number, expiry: string | null, created = "2026-01-01") => ({
    id,
    quantityRemaining,
    expiryDate: expiry ? day(expiry) : null,
    createdAt: day(created),
  });

  it("mengambil batch tercepat kedaluwarsa dulu, lalu berikutnya; tanpa kedaluwarsa paling akhir", () => {
    const plan = fefoPlan([batch("b3", 10, null), batch("b2", 5, "2027-03-01"), batch("b1", 4, "2027-01-01")], 7, TODAY);
    expect(plan).toEqual({ ok: true, takes: [{ batchId: "b1", quantity: 4 }, { batchId: "b2", quantity: 3 }] });
  });

  it("batch kedaluwarsa dan kosong tidak dipakai; kurang berarti tidak ok dengan jumlah tersedia", () => {
    const batches = [batch("old", 9, "2026-10-06"), batch("zero", 0, "2027-01-01"), batch("ok", 3, "2027-01-01")];
    expect(fefoPlan(batches, 3, TODAY)).toEqual({ ok: true, takes: [{ batchId: "ok", quantity: 3 }] });
    expect(fefoPlan(batches, 4, TODAY)).toEqual({ ok: false, available: 3 });
    expect(fefoPlan([], 1, TODAY)).toEqual({ ok: false, available: 0 });
  });

  it("kedaluwarsa hari ini masih boleh; tanggal sama diurutkan menurut batch yang lebih dulu masuk", () => {
    const plan = fefoPlan([batch("late", 5, "2026-10-07", "2026-06-01"), batch("early", 5, "2026-10-07", "2026-03-01")], 6, TODAY);
    expect(plan).toEqual({ ok: true, takes: [{ batchId: "early", quantity: 5 }, { batchId: "late", quantity: 1 }] });
  });
});

describe("visitLines", () => {
  const treatments = [
    { id: "t1", serviceId: "sv1", name: "Facial", price: 250000 },
    { id: "t2", serviceId: "sv2", name: "Meso", price: null },
  ];

  it("konsultasi + treatment dengan harga katalog; harga kosong menjadi Rp 0", () => {
    expect(visitLines({ online: false, service: { id: "k", name: "Konsultasi Dokter", price: 200000 }, treatments })).toEqual([
      { kind: "LAYANAN", name: "Konsultasi Dokter", quantity: 1, unitPrice: 200000, serviceId: "k", encounterTreatmentId: null },
      { kind: "TREATMENT", name: "Facial", quantity: 1, unitPrice: 250000, serviceId: "sv1", encounterTreatmentId: "t1" },
      { kind: "TREATMENT", name: "Meso", quantity: 1, unitPrice: 0, serviceId: "sv2", encounterTreatmentId: "t2" },
    ]);
  });

  it("Konsultasi Online tanpa baris konsultasi (sudah lunas di muka); tanpa layanan tidak ada baris layanan", () => {
    expect(visitLines({ online: true, service: { id: "o", name: "Konsultasi Online", price: 250000 }, treatments: [] })).toEqual([]);
    expect(visitLines({ online: false, service: null, treatments: [treatments[0]] })).toHaveLength(1);
  });
});

describe("validasi baris", () => {
  it("baris bebas: jenis layanan atau treatment, nama, jumlah bulat, harga tidak negatif", () => {
    expect(validateFreeLine({ kind: "LAYANAN", name: " Biaya administrasi ", quantity: 1, unitPrice: 10000 })).toEqual({
      ok: true,
      value: { kind: "LAYANAN", name: "Biaya administrasi", quantity: 1, unitPrice: 10000 },
    });
    expect(validateFreeLine({ kind: "BARANG", name: "x", quantity: 1, unitPrice: 1 })).toEqual({ ok: false, message: "Pilih jenis baris." });
    expect(validateFreeLine({ kind: "LAYANAN", name: " ", quantity: 1, unitPrice: 1 })).toEqual({ ok: false, message: "Isi nama baris." });
    expect(validateFreeLine({ kind: "LAYANAN", name: "x", quantity: 1.5, unitPrice: 1 })).toEqual({
      ok: false,
      message: "Jumlah harus bilangan bulat lebih dari 0.",
    });
    expect(validateFreeLine({ kind: "LAYANAN", name: "x", quantity: 1, unitPrice: -5 })).toEqual({ ok: false, message: "Harga tidak sah." });
  });

  it("tambah barang: barang dan jumlah", () => {
    expect(validateItemAdd({ itemId: "i1", quantity: 3 })).toEqual({ ok: true, value: { itemId: "i1", quantity: 3 } });
    expect(validateItemAdd({ itemId: "", quantity: 3 })).toEqual({ ok: false, message: "Pilih barang." });
    expect(validateItemAdd({ itemId: "i1", quantity: 0 })).toEqual({ ok: false, message: "Jumlah harus bilangan bulat lebih dari 0." });
  });

  it("ubah baris: harga katalog yang diubah wajib catatan", () => {
    expect(validateLineEdit({ quantity: 2, unitPrice: 5000, priceNote: " promo " }, { needsNote: true })).toEqual({
      ok: true,
      value: { quantity: 2, unitPrice: 5000, priceNote: "promo" },
    });
    expect(validateLineEdit({ quantity: 2, unitPrice: 5000, priceNote: "" }, { needsNote: true })).toEqual({
      ok: false,
      message: "Isi catatan alasan perubahan harga.",
    });
    expect(validateLineEdit({ quantity: 2, unitPrice: 5000, priceNote: "" }, { needsNote: false })).toEqual({
      ok: true,
      value: { quantity: 2, unitPrice: 5000, priceNote: null },
    });
  });
});

describe("validateDiscount", () => {
  it("tanpa diskon: jenis kosong atau nilai 0 menghapus diskon", () => {
    const cleared = { ok: true, value: { kind: null, value: 0, reason: null } };
    expect(validateDiscount({ kind: null, value: 0, reason: "" }, { subtotal: 100000, canExceed: false })).toEqual(cleared);
    expect(validateDiscount({ kind: "PERSEN", value: 0, reason: "x" }, { subtotal: 100000, canExceed: false })).toEqual(cleared);
  });

  it("persen 1–100 dan nominal tidak melebihi subtotal; alasan wajib", () => {
    expect(validateDiscount({ kind: "PERSEN", value: 10, reason: " Pelanggan lama " }, { subtotal: 100000, canExceed: false })).toEqual({
      ok: true,
      value: { kind: "PERSEN", value: 10, reason: "Pelanggan lama" },
    });
    expect(validateDiscount({ kind: "PERSEN", value: 101, reason: "x" }, { subtotal: 100000, canExceed: true })).toEqual({
      ok: false,
      message: "Persen diskon harus 1 sampai 100.",
    });
    expect(validateDiscount({ kind: "NOMINAL", value: 100001, reason: "x" }, { subtotal: 100000, canExceed: true })).toEqual({
      ok: false,
      message: "Nominal diskon tidak boleh melebihi subtotal.",
    });
    expect(validateDiscount({ kind: "NOMINAL", value: 5000, reason: " " }, { subtotal: 100000, canExceed: false })).toEqual({
      ok: false,
      message: "Isi alasan diskon.",
    });
  });

  it("di atas 20% hanya untuk yang boleh mengoreksi, baik persen maupun nominal", () => {
    const tooMuch = "Diskon di atas 20% diberikan oleh Admin Keuangan.";
    expect(validateDiscount({ kind: "PERSEN", value: 21, reason: "x" }, { subtotal: 100000, canExceed: false })).toEqual({ ok: false, message: tooMuch });
    expect(validateDiscount({ kind: "NOMINAL", value: 20001, reason: "x" }, { subtotal: 100000, canExceed: false })).toEqual({ ok: false, message: tooMuch });
    expect(validateDiscount({ kind: "PERSEN", value: 20, reason: "x" }, { subtotal: 100000, canExceed: false }).ok).toBe(true);
    expect(validateDiscount({ kind: "PERSEN", value: 50, reason: "x" }, { subtotal: 100000, canExceed: true }).ok).toBe(true);
  });
});

describe("validateInvoicePayment", () => {
  const pay = { invoiceId: "i1", amount: 50000, method: "QRIS", paidAt: "2026-10-07", reference: " QR-1 " };
  const ctx = { today: TODAY, finalizedDate: "2026-10-06", limit: 80000 };

  it("menerima pembayaran yang sah", () => {
    expect(validateInvoicePayment(pay, ctx)).toEqual({
      ok: true,
      value: { invoiceId: "i1", amount: 50000, method: "QRIS", paidAt: "2026-10-07", reference: "QR-1" },
    });
  });

  it("menolak nominal di atas sisa, tanpa sisa, metode asing, dan tanggal yang tidak sah", () => {
    expect(validateInvoicePayment({ ...pay, amount: 80001 }, ctx)).toEqual({ ok: false, message: "Nominal melebihi sisa tagihan (Rp 80.000)." });
    expect(validateInvoicePayment(pay, { ...ctx, limit: 0 })).toEqual({ ok: false, message: "Tagihan ini tidak punya sisa." });
    expect(validateInvoicePayment({ ...pay, amount: 0 }, ctx)).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
    expect(validateInvoicePayment({ ...pay, method: "CEK" }, ctx)).toEqual({ ok: false, message: "Pilih metode pembayaran." });
    expect(validateInvoicePayment({ ...pay, paidAt: "2026-02-31" }, ctx)).toEqual({ ok: false, message: "Isi tanggal bayar." });
    expect(validateInvoicePayment({ ...pay, paidAt: "2026-10-08" }, ctx)).toEqual({ ok: false, message: "Tanggal bayar tidak boleh di masa depan." });
    expect(validateInvoicePayment({ ...pay, paidAt: "2026-10-05" }, ctx)).toEqual({
      ok: false,
      message: "Tanggal bayar tidak boleh sebelum tagihan difinalkan.",
    });
  });
});
```

Run: `npx vitest run tests/unit/invoice.test.ts`
Expected: FAIL, karena modul `@/lib/invoice` tidak ditemukan.

- [ ] **Step 2: Tulis modulnya**

Buat `src/lib/invoice.ts`:

```ts
import { formatRupiah } from "./format";
import {
  dateOnlyString,
  isDateString,
  MAX_AMOUNT,
  MAX_QUANTITY,
  PAYMENT_METHODS,
  type PaymentMethodValue,
  type Validation,
} from "./stock";

// Aturan murni tagihan (spec tagihan 3.2). Dipakai server dan browser; tanpa akses basis data.

export type InvoiceStatusValue = "DRAF" | "FINAL" | "DIBATALKAN";
export type InvoiceLineKindValue = "LAYANAN" | "TREATMENT" | "BARANG";
export type DiscountKindValue = "NOMINAL" | "PERSEN";
export type InvoiceDisplayStatus = "DRAF" | "BELUM_DIBAYAR" | "SEBAGIAN" | "LUNAS" | "DIBATALKAN";
export type InvoiceView = "PERLU_DITAGIH" | "DRAF" | "BELUM_LUNAS" | "LUNAS" | "DIBATALKAN";

/** Batas diskon yang boleh diberikan resepsionis, dalam persen dari subtotal (spec TG9). */
export const DISCOUNT_LIMIT_PERCENT = 20;
/** Kunjungan final lebih lama dari ini tidak lagi masuk "Perlu ditagih". */
export const BILLABLE_DAYS = 30;

export const INVOICE_STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
  DRAF: "Draf",
  BELUM_DIBAYAR: "Belum dibayar",
  SEBAGIAN: "Sebagian",
  LUNAS: "Lunas",
  DIBATALKAN: "Dibatalkan",
};
export const INVOICE_VIEW_LABEL: Record<InvoiceView, string> = {
  PERLU_DITAGIH: "Perlu ditagih",
  DRAF: "Draf",
  BELUM_LUNAS: "Belum lunas",
  LUNAS: "Lunas",
  DIBATALKAN: "Dibatalkan",
};
export const INVOICE_VIEWS = Object.keys(INVOICE_VIEW_LABEL) as InvoiceView[];
export const INVOICE_LINE_KIND_LABEL: Record<InvoiceLineKindValue, string> = {
  LAYANAN: "Layanan",
  TREATMENT: "Treatment",
  BARANG: "Barang",
};
export const DISCOUNT_KIND_LABEL: Record<DiscountKindValue, string> = { NOMINAL: "Nominal", PERSEN: "Persen" };

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : null;
}

// ---- Hitung ------------------------------------------------------------------------------

export function invoiceSubtotal(lines: readonly { quantity: number; unitPrice: number }[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

/** Diskon dalam rupiah: persen dibulatkan ke bawah, nominal tidak melebihi subtotal. */
export function discountAmount(subtotal: number, kind: DiscountKindValue | null, value: number): number {
  if (!kind || value <= 0) return 0;
  return kind === "PERSEN" ? Math.floor((subtotal * Math.min(value, 100)) / 100) : Math.min(value, subtotal);
}

/** Diskon terbesar yang boleh diberikan resepsionis. */
export function discountLimit(subtotal: number): number {
  return Math.floor((subtotal * DISCOUNT_LIMIT_PERCENT) / 100);
}

export type InvoiceInput = {
  status: InvoiceStatusValue;
  discountKind: DiscountKindValue | null;
  discountValue: number;
  lines: readonly { quantity: number; unitPrice: number }[];
  payments: readonly { amount: number; revokedAt: Date | null }[];
};

export type InvoiceTotals = {
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  /** Sisa yang harus dibayar; 0 untuk tagihan dibatalkan. */
  balance: number;
  display: InvoiceDisplayStatus;
};

/** Total, dibayar, sisa, dan status tampil (spec tagihan 3.2). Pembayaran yang dibatalkan tidak dihitung. */
export function invoiceTotals(invoice: InvoiceInput): InvoiceTotals {
  const subtotal = invoiceSubtotal(invoice.lines);
  const discount = discountAmount(subtotal, invoice.discountKind, invoice.discountValue);
  const total = subtotal - discount;
  const paid = invoice.payments.reduce((sum, payment) => (payment.revokedAt ? sum : sum + payment.amount), 0);
  if (invoice.status === "DIBATALKAN") return { subtotal, discount, total, paid, balance: 0, display: "DIBATALKAN" };
  const balance = total - paid;
  if (invoice.status === "DRAF") return { subtotal, discount, total, paid, balance, display: "DRAF" };
  const display = balance <= 0 ? "LUNAS" : paid > 0 ? "SEBAGIAN" : "BELUM_DIBAYAR";
  return { subtotal, discount, total, paid, balance, display };
}

/** "TG-2026-0001". */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `TG-${year}-${String(sequence).padStart(4, "0")}`;
}

export function isInvoiceView(value: unknown): value is InvoiceView {
  return typeof value === "string" && (INVOICE_VIEWS as string[]).includes(value);
}

/** Saringan daftar tagihan; "Perlu ditagih" bukan tagihan sehingga tidak pernah cocok di sini. */
export function matchesInvoiceView(row: { display: InvoiceDisplayStatus }, view: InvoiceView): boolean {
  switch (view) {
    case "DRAF":
      return row.display === "DRAF";
    case "BELUM_LUNAS":
      return row.display === "BELUM_DIBAYAR" || row.display === "SEBAGIAN";
    case "LUNAS":
      return row.display === "LUNAS";
    case "DIBATALKAN":
      return row.display === "DIBATALKAN";
    case "PERLU_DITAGIH":
      return false;
  }
}

// ---- FEFO ---------------------------------------------------------------------------------

export type BatchStock = { id: string; quantityRemaining: number; expiryDate: Date | null; createdAt: Date };
export type FefoPlan = { ok: true; takes: { batchId: string; quantity: number }[] } | { ok: false; available: number };

/**
 * Rencana pengambilan stok: batch tercepat kedaluwarsa dulu (tanpa kedaluwarsa paling akhir),
 * lalu yang lebih dulu masuk. Batch kosong dan yang sudah kedaluwarsa tidak dipakai.
 */
export function fefoPlan(batches: readonly BatchStock[], quantity: number, today: string): FefoPlan {
  const usable = batches
    .filter((batch) => batch.quantityRemaining > 0 && !(batch.expiryDate && dateOnlyString(batch.expiryDate) < today))
    .sort((a, b) => {
      const ae = a.expiryDate ? dateOnlyString(a.expiryDate) : "9999-12-31";
      const be = b.expiryDate ? dateOnlyString(b.expiryDate) : "9999-12-31";
      return ae.localeCompare(be) || a.createdAt.getTime() - b.createdAt.getTime();
    });
  const available = usable.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
  if (available < quantity) return { ok: false, available };
  const takes: { batchId: string; quantity: number }[] = [];
  let left = quantity;
  for (const batch of usable) {
    if (left === 0) break;
    const take = Math.min(left, batch.quantityRemaining);
    takes.push({ batchId: batch.id, quantity: take });
    left -= take;
  }
  return { ok: true, takes };
}

// ---- Isi tagihan dari kunjungan ----------------------------------------------------------------

export type DraftLine = {
  kind: InvoiceLineKindValue;
  name: string;
  quantity: number;
  unitPrice: number;
  serviceId: string | null;
  encounterTreatmentId: string | null;
};

/**
 * Baris draf dari kunjungan final (spec tagihan 3.3): konsultasi (kecuali Konsultasi Online yang
 * sudah lunas di muka) dan satu baris per treatment. Harga kosong menjadi Rp 0 yang bisa diedit.
 */
export function visitLines(input: {
  online: boolean;
  service: { id: string; name: string; price: number | null } | null;
  treatments: { id: string; serviceId: string; name: string; price: number | null }[];
}): DraftLine[] {
  const lines: DraftLine[] = [];
  if (input.service && !input.online) {
    lines.push({
      kind: "LAYANAN",
      name: input.service.name,
      quantity: 1,
      unitPrice: input.service.price ?? 0,
      serviceId: input.service.id,
      encounterTreatmentId: null,
    });
  }
  for (const treatment of input.treatments) {
    lines.push({
      kind: "TREATMENT",
      name: treatment.name,
      quantity: 1,
      unitPrice: treatment.price ?? 0,
      serviceId: treatment.serviceId,
      encounterTreatmentId: treatment.id,
    });
  }
  return lines;
}

// ---- Validasi formulir (diulang di server) -----------------------------------------------------

export type FreeLineInput = { kind: "LAYANAN" | "TREATMENT"; name: string; quantity: number; unitPrice: number };

export function validateFreeLine(raw: unknown): Validation<FreeLineInput> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (raw.kind !== "LAYANAN" && raw.kind !== "TREATMENT") return fail("Pilih jenis baris.");
  const name = cleanText(raw.name);
  if (name === null) return fail(INVALID_FORM);
  if (!name) return fail("Isi nama baris.");
  if (name.length > 120) return fail("Nama baris paling banyak 120 karakter.");
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  if (!isWhole(raw.unitPrice, 0, MAX_AMOUNT)) return fail("Harga tidak sah.");
  return { ok: true, value: { kind: raw.kind, name, quantity: raw.quantity, unitPrice: raw.unitPrice } };
}

export type ItemAddInput = { itemId: string; quantity: number };

export function validateItemAdd(raw: unknown): Validation<ItemAddInput> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (typeof raw.itemId !== "string" || !raw.itemId) return fail("Pilih barang.");
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  return { ok: true, value: { itemId: raw.itemId, quantity: raw.quantity } };
}

export type LineEditInput = { quantity: number; unitPrice: number; priceNote: string };
export type ValidLineEdit = { quantity: number; unitPrice: number; priceNote: string | null };

/** Mengubah baris draf. `needsNote`: baris berasal dari katalog dan harganya berbeda dari harga katalog. */
export function validateLineEdit(raw: unknown, ctx: { needsNote: boolean }): Validation<ValidLineEdit> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  if (!isWhole(raw.unitPrice, 0, MAX_AMOUNT)) return fail("Harga tidak sah.");
  const note = cleanText(raw.priceNote);
  if (note === null) return fail(INVALID_FORM);
  if (note.length > 200) return fail("Catatan harga paling banyak 200 karakter.");
  if (ctx.needsNote && !note) return fail("Isi catatan alasan perubahan harga.");
  return { ok: true, value: { quantity: raw.quantity, unitPrice: raw.unitPrice, priceNote: note || null } };
}

export type DiscountInput = { kind: DiscountKindValue | null; value: number; reason: string };
export type ValidDiscount = { kind: DiscountKindValue | null; value: number; reason: string | null };

/**
 * Diskon tagihan (spec tagihan 3.2, TG9). Jenis kosong atau nilai 0 menghapus diskon.
 * `canExceed`: pelaku boleh memberi diskon di atas batas resepsionis (Admin Keuangan, Super Admin).
 */
export function validateDiscount(raw: unknown, ctx: { subtotal: number; canExceed: boolean }): Validation<ValidDiscount> {
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
  if (!ctx.canExceed && discountAmount(ctx.subtotal, kind, amount) > discountLimit(ctx.subtotal)) {
    return fail(`Diskon di atas ${DISCOUNT_LIMIT_PERCENT}% diberikan oleh Admin Keuangan.`);
  }
  return { ok: true, value: { kind, value: amount, reason } };
}

export type InvoicePaymentInput = {
  invoiceId: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  reference: string;
};
export type ValidInvoicePayment = Omit<InvoicePaymentInput, "reference"> & { reference: string | null };

/**
 * Pembayaran customer (spec tagihan 4.4). `limit` = sisa tagihan saat ini, dihitung server
 * setelah tagihan dikunci; `finalizedDate` = tanggal WITA tagihan difinalkan.
 */
export function validateInvoicePayment(
  raw: unknown,
  ctx: { today: string; finalizedDate: string; limit: number },
): Validation<ValidInvoicePayment> {
  if (!isObject(raw) || typeof raw.invoiceId !== "string" || !raw.invoiceId) return fail(INVALID_FORM);
  if (ctx.limit <= 0) return fail("Tagihan ini tidak punya sisa.");
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail("Nominal harus bilangan bulat lebih dari 0.");
  if (raw.amount > ctx.limit) return fail(`Nominal melebihi sisa tagihan (${formatRupiah(ctx.limit)}).`);
  if (!(PAYMENT_METHODS as unknown[]).includes(raw.method)) return fail("Pilih metode pembayaran.");
  if (!isDateString(raw.paidAt)) return fail("Isi tanggal bayar.");
  if (raw.paidAt > ctx.today) return fail("Tanggal bayar tidak boleh di masa depan.");
  if (raw.paidAt < ctx.finalizedDate) return fail("Tanggal bayar tidak boleh sebelum tagihan difinalkan.");
  const reference = cleanText(raw.reference);
  if (reference === null) return fail(INVALID_FORM);
  if (reference.length > 100) return fail("Referensi paling banyak 100 karakter.");
  return {
    ok: true,
    value: {
      invoiceId: raw.invoiceId,
      amount: raw.amount,
      method: raw.method as PaymentMethodValue,
      paidAt: raw.paidAt,
      reference: reference || null,
    },
  };
}
```

Run: `npx vitest run tests/unit/invoice.test.ts`
Expected: PASS semua.

- [ ] **Step 3: Lint, tipe, commit**

Run: `npx eslint src/lib/invoice.ts tests/unit/invoice.test.ts; npx tsc --noEmit -p . > "$WS/t2-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: eslint bersih, `tsc exit 0`.

```bash
git add src/lib/invoice.ts tests/unit/invoice.test.ts
git commit -m "feat: add invoice rules (totals, discounts, FEFO plan, visit lines, validation)"
```

---

### Task 3: Server — membuat tagihan dan membaca daftar, detail, perlu ditagih, katalog barang

**Files:**
- Create: `src/server/invoice-store.ts`, `src/server/invoice-read.ts`, `src/server/invoice-drafts.ts`
- Test: `tests/integration/invoice-create.test.ts`

**Interfaces:**
- Consumes: Task 1 (model, `invoice-world.ts`), Task 2 (`visitLines`, `invoiceTotals`, `matchesInvoiceView`, `BILLABLE_DAYS`, tipe), sub-proyek stok (`stockFlags`, `dateOnlyString`, `isExclusionViolation`), `recordAudit`, `requireCapability`.
- Produces:
  - `invoice-store.ts` (tanpa `"use server"`):
    - `STALE_DRAFT` (string), `lockInvoiceRow(tx, invoiceId): Promise<void>`, `nextInvoiceSequence(tx, year): Promise<number>`, `touchDraft(tx, invoiceId, version: unknown): Promise<number>` (mengunci, memeriksa draf dan versi, menaikkan versi, mengembalikan versi baru), `TOTALS_SELECT`;
  - `invoice-drafts.ts` (`"use server"`, `invoice:manage`):
    - `createInvoiceFromVisit(appointmentId: string): Promise<ActionResult<{ id: string; existing: boolean }>>`;
    - `createDirectSale(input: { patientId: string; branchId?: string }): Promise<ActionResult<{ id: string }>>`;
  - `invoice-read.ts` (tanpa `"use server"`):
    - `listInvoices(filter: { view: Exclude<InvoiceView, "PERLU_DITAGIH">; q?: string }): Promise<InvoiceRow[]>` (`invoice:read`), `InvoiceRow = { id; number: string | null; createdAt: Date; patientId; patientName; branchName; display: InvoiceDisplayStatus; total; balance; lineCount }`;
    - `listBillableVisits(): Promise<BillableVisit[]>` dan `countBillable(): Promise<number>` (`invoice:read`), `BillableVisit = { appointmentId; patientId; patientName; medicalRecordNumber; branchName; serviceName: string | null; finalizedAt: Date; treatmentCount: number; online: boolean }`;
    - `getInvoiceDetail(id: string): Promise<InvoiceDetail | null>` (`invoice:read`), `InvoiceDetail`, `InvoiceLineRow`, `InvoicePaymentRow` seperti Step 4;
    - `listBillingItems(branchId: string): Promise<BillingItem[]>` (`invoice:manage`), `BillingItem = { id; code; name; unit; sellPrice: number; available: number }`;
  - audit: `invoice.create`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/invoice-create.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { countBillable, getInvoiceDetail, listBillableVisits, listBillingItems, listInvoices } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
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

const SLUG = "buat-tagihan";
const WA = "6281200008810";
const today = witaDateString(new Date());

describe("membuat tagihan", () => {
  let world: BillingWorld;

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

  it("dari kunjungan final: konsultasi dan treatment terisi dengan harga katalog", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id, existing } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(existing).toBe(false);

    const detail = await getInvoiceDetail(id);
    expect(detail).toMatchObject({
      status: "DRAF",
      number: null,
      version: 1,
      appointmentId,
      patient: { id: world.patientId },
      branchId: world.branchId,
      totals: { subtotal: 450000, total: 450000, balance: 450000, display: "DRAF" },
    });
    expect(detail?.lines.map((line) => [line.kind, line.name, line.quantity, line.unitPrice])).toEqual([
      ["LAYANAN", "Konsultasi Dokter", 1, 200000],
      ["TREATMENT", "Facial Uji", 1, 250000],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "invoice.create", entityId: id } })).toBe(1);
  });

  it("dua klik bersamaan menghasilkan satu tagihan, dan yang kedua dibawa ke tagihan yang sama", async () => {
    const { appointmentId } = await finalVisit(world);
    const results = await Promise.all([createInvoiceFromVisit(appointmentId), createInvoiceFromVisit(appointmentId)]);
    const ids = results.map((result) => (result.ok ? result.data.id : null));
    expect(ids[0]).not.toBeNull();
    expect(ids[0]).toBe(ids[1]);
    expect(await prisma.invoice.count({ where: { appointmentId } })).toBe(1);
    expect(results.filter((result) => result.ok && result.data.existing)).toHaveLength(1);
  });

  it("menolak kunjungan yang catatannya belum final atau tidak ada", async () => {
    const draft = await prisma.appointment.create({
      data: {
        code: "BTG-DRAF",
        type: "KONSULTASI",
        startAt: new Date("2031-02-01T00:00:00Z"),
        endAt: new Date("2031-02-01T00:30:00Z"),
        status: "HADIR",
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: world.patientId,
      },
    });
    const message = "Hanya kunjungan yang catatannya sudah final yang bisa ditagih.";
    expect(await createInvoiceFromVisit(draft.id)).toEqual({ ok: false, error: message });
    await prisma.encounter.create({ data: { appointmentId: draft.id, createdById: world.doctorId, createdByName: "dr. Uji" } });
    expect(await createInvoiceFromVisit(draft.id)).toEqual({ ok: false, error: message });
    expect(await createInvoiceFromVisit("tidak-ada")).toEqual({ ok: false, error: "Kunjungan tidak ditemukan." });
  });

  it("Konsultasi Online tidak mendapat baris konsultasi, dan tanpa treatment tidak perlu ditagih", async () => {
    const withTreatment = await finalVisit(world, { channel: "ONLINE" });
    const onlyOnline = await finalVisit(world, { channel: "ONLINE", treatments: [] });
    const waiting = (await listBillableVisits()).map((visit) => visit.appointmentId);
    expect(waiting).toContain(withTreatment.appointmentId);
    expect(waiting).not.toContain(onlyOnline.appointmentId);

    const { id } = await unwrap(createInvoiceFromVisit(withTreatment.appointmentId));
    expect((await getInvoiceDetail(id))?.lines.map((line) => line.name)).toEqual(["Facial Uji"]);
  });

  it("Perlu ditagih: kunjungan final tanpa tagihan aktif dalam 30 hari; hilang setelah ditagih, kembali setelah dibatalkan", async () => {
    const recent = await finalVisit(world);
    const old = await finalVisit(world, { finalizedAt: new Date(Date.now() - 31 * 24 * 3600_000) });
    const before = await countBillable();
    const ids = () => listBillableVisits().then((rows) => rows.map((row) => row.appointmentId));
    expect(await ids()).toContain(recent.appointmentId);
    expect(await ids()).not.toContain(old.appointmentId);

    const { id } = await unwrap(createInvoiceFromVisit(recent.appointmentId));
    expect(await ids()).not.toContain(recent.appointmentId);
    expect(await countBillable()).toBe(before - 1);

    await prisma.invoice.update({ where: { id }, data: { status: "DIBATALKAN", cancelledAt: new Date() } });
    expect(await ids()).toContain(recent.appointmentId);
    const again = await unwrap(createInvoiceFromVisit(recent.appointmentId));
    expect(again.id).not.toBe(id);
  });

  it("layanan tanpa harga menjadi baris Rp 0 yang bisa diedit", async () => {
    const free = await prisma.service.create({
      data: { slug: `${SLUG}-gratis`, name: "Layanan Gratis Uji", promoPrice: 0, categoryId: (await prisma.serviceCategory.findFirstOrThrow()).id },
    });
    const { appointmentId } = await finalVisit(world, { treatments: [{ serviceId: free.id, serviceName: "Layanan Gratis Uji" }] });
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect((await getInvoiceDetail(id))?.lines.find((line) => line.name === "Layanan Gratis Uji")?.unitPrice).toBe(0);
  });

  it("penjualan langsung: draf tanpa kunjungan; pasien dan cabang diperiksa", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    expect(await getInvoiceDetail(id)).toMatchObject({ status: "DRAF", appointmentId: null, lines: [], totals: { total: 0 } });

    expect(await createDirectSale({ patientId: "tidak-ada" })).toEqual({ ok: false, error: "Pasien tidak ditemukan." });
    const soon = await prisma.branch.create({
      data: { slug: `${SLUG}-segera`, name: "Segera", address: "x", whatsapp: "6285172228900", openingHours: "-", status: "SEGERA_HADIR", sortOrder: 95 },
    });
    expect(await createDirectSale({ patientId: world.patientId, branchId: soon.id })).toEqual({
      ok: false,
      error: "Cabang ini belum menerima transaksi.",
    });
    const owner = await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-8899", name: "Pasien Asli", whatsapp: "6281200008811" } });
    const duplicate = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-8898", name: "Pasien Rangkap", whatsapp: "6281200008812", mergedIntoId: owner.id },
    });
    try {
      expect(await createDirectSale({ patientId: duplicate.id })).toEqual({
        ok: false,
        error: "Pasien ini rangkap dari Pasien Asli (SDY-2026-8899). Buat tagihan untuk pasien itu.",
      });
    } finally {
      await prisma.patient.deleteMany({ where: { id: { in: [duplicate.id, owner.id] } } });
      await prisma.branch.delete({ where: { id: soon.id } });
    }
  });

  it("daftar tagihan per tampilan dan pencarian nama pasien atau nomor", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    const draft = await listInvoices({ view: "DRAF" });
    expect(draft.find((row) => row.id === id)).toMatchObject({ patientName: `Pasien ${SLUG}`, display: "DRAF", total: 0, lineCount: 0 });
    expect((await listInvoices({ view: "LUNAS" })).map((row) => row.id)).not.toContain(id);
    expect((await listInvoices({ view: "DRAF", q: `pasien ${SLUG}` })).map((row) => row.id)).toContain(id);
    expect((await listInvoices({ view: "DRAF", q: "tidak-ada-orang-ini" })).map((row) => row.id)).not.toContain(id);
  });

  it("katalog barang untuk tagihan: hanya yang berharga jual, dengan stok tersedia di cabang", async () => {
    await billingBatch(world, { invoiceNumber: "BT-1", itemId: world.drugId, quantity: 8, expiryDate: addDaysToDateString(today, 100) });
    await billingBatch(world, { invoiceNumber: "BT-2", itemId: world.drugId, quantity: 3, expiryDate: addDaysToDateString(today, -1) });
    await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-NOP`, name: `${SLUG} Tanpa Harga`, kind: "PRODUK", unit: "pcs" } });

    const items = await listBillingItems(world.branchId);
    const drug = items.find((item) => item.id === world.drugId);
    expect(drug).toMatchObject({ sellPrice: 2000, available: 8, unit: "kapsul" });
    expect(items.find((item) => item.id === world.productId)).toMatchObject({ available: 0 });
    expect(items.map((item) => item.name)).not.toContain(`${SLUG} Tanpa Harga`);
  });

  it("hak akses: Admin Keuangan tidak membuat tagihan; Apoteker dan Dokter tidak membaca", async () => {
    const { appointmentId } = await finalVisit(world);
    actor.role = "ADMIN_KEUANGAN";
    await expect(createInvoiceFromVisit(appointmentId)).rejects.toThrow(/forbidden: invoice:manage/);
    await expect(createDirectSale({ patientId: world.patientId })).rejects.toThrow(/forbidden: invoice:manage/);
    await expect(listBillingItems(world.branchId)).rejects.toThrow(/forbidden: invoice:manage/);
    expect(Array.isArray(await listInvoices({ view: "DRAF" }))).toBe(true);
    for (const role of ["APOTEKER", "DOKTER"] as const) {
      actor.role = role;
      await expect(listInvoices({ view: "DRAF" })).rejects.toThrow(/forbidden: invoice:read/);
      await expect(listBillableVisits()).rejects.toThrow(/forbidden: invoice:read/);
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/invoice-create.test.ts`
Expected: FAIL, karena modul `@/server/invoice-drafts` dan `@/server/invoice-read` tidak ditemukan.

- [ ] **Step 2: Pembantu server**

Buat `src/server/invoice-store.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";

// Tanpa "use server": pembantu server untuk tagihan, tidak dipanggil browser.

export const STALE_DRAFT = "Tagihan ini baru diubah orang lain. Muat ulang halaman.";

/** Kolom tagihan yang dibutuhkan invoiceTotals (src/lib/invoice.ts). */
export const TOTALS_SELECT = {
  status: true,
  discountKind: true,
  discountValue: true,
  lines: { select: { quantity: true, unitPrice: true } },
  payments: { select: { amount: true, revokedAt: true } },
} as const;

/**
 * Mengunci baris tagihan sampai transaksi selesai. Perubahan, finalisasi, pembayaran, dan
 * pembatalan tagihan yang sama berjalan bergiliran (spec tagihan 4.3, 4.4).
 */
export async function lockInvoiceRow(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
}

/** Nomor urut tagihan berikutnya untuk tahun ini, atomik (satu pernyataan INSERT … ON CONFLICT). */
export async function nextInvoiceSequence(tx: Prisma.TransactionClient, year: number): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "InvoiceNumberCounter" ("year", "value")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "InvoiceNumberCounter"."value" + 1
    RETURNING "value"
  `;
  return rows[0].value;
}

/**
 * Setiap perubahan draf lewat sini: tagihan dikunci, harus masih draf, dan versi yang dikirim
 * harus sama dengan versi sekarang (spec tagihan 4.2). Mengembalikan versi baru.
 */
export async function touchDraft(tx: Prisma.TransactionClient, invoiceId: string, version: unknown): Promise<number> {
  await lockInvoiceRow(tx, invoiceId);
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, version: true } });
  if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
  if (invoice.status !== "DRAF") throw new UserFacingError("Tagihan ini sudah tidak berupa draf. Muat ulang halaman.");
  if (invoice.version !== version) throw new UserFacingError(STALE_DRAFT);
  await tx.invoice.update({ where: { id: invoiceId }, data: { version: { increment: 1 } } });
  return invoice.version + 1;
}
```

- [ ] **Step 3: Aksi membuat tagihan**

Buat `src/server/invoice-drafts.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { visitLines } from "@/lib/invoice";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { isExclusionViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

function revalidateInvoices(invoiceId?: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  if (invoiceId) safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

/**
 * Buat tagihan dari kunjungan final (spec tagihan 4.2). Dua klik bersamaan menghasilkan satu
 * tagihan: yang kalah gagal di constraint eksklusi dan dibawa ke tagihan yang sudah ada.
 */
export async function createInvoiceFromVisit(appointmentId: string): Promise<ActionResult<{ id: string; existing: boolean }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const id = String(appointmentId ?? "");
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        patientId: true,
        branchId: true,
        channel: true,
        service: { select: { id: true, name: true, promoPrice: true } },
        encounter: { select: { status: true, treatments: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceId: true, serviceName: true } } } },
      },
    });
    if (!appointment) throw new UserFacingError("Kunjungan tidak ditemukan.");
    if (appointment.encounter?.status !== "FINAL") {
      throw new UserFacingError("Hanya kunjungan yang catatannya sudah final yang bisa ditagih.");
    }
    if (!appointment.patientId) throw new UserFacingError("Kunjungan ini belum dicocokkan dengan data pasien.");

    const findActive = () =>
      prisma.invoice.findFirst({ where: { appointmentId: id, status: { not: "DIBATALKAN" } }, select: { id: true } });
    const existing = await findActive();
    if (existing) return { id: existing.id, existing: true };

    const services = await prisma.service.findMany({
      where: { id: { in: appointment.encounter.treatments.map((t) => t.serviceId) } },
      select: { id: true, promoPrice: true },
    });
    const priceOf = new Map(services.map((service) => [service.id, service.promoPrice]));
    const lines = visitLines({
      online: appointment.channel === "ONLINE",
      service: appointment.service
        ? { id: appointment.service.id, name: appointment.service.name, price: appointment.service.promoPrice }
        : null,
      treatments: appointment.encounter.treatments.map((t) => ({
        id: t.id,
        serviceId: t.serviceId,
        name: t.serviceName,
        price: priceOf.get(t.serviceId) ?? null,
      })),
    });

    try {
      const created = await prisma.invoice.create({
        data: {
          patientId: appointment.patientId,
          appointmentId: id,
          branchId: appointment.branchId,
          createdById: actor.staffId,
          createdByName: actor.name,
          lines: { create: lines.map((line, index) => ({ ...line, sortOrder: index })) },
        },
        select: { id: true },
      });
      await recordAudit({
        actor,
        action: "invoice.create",
        entity: "Invoice",
        entityId: created.id,
        summary: `Draf dari kunjungan ${appointment.code}: ${lines.length} baris`,
      });
      revalidateInvoices(created.id);
      return { id: created.id, existing: false };
    } catch (error) {
      if (isExclusionViolation(error)) {
        const winner = await findActive();
        if (winner) return { id: winner.id, existing: true };
      }
      throw error;
    }
  });
}

/** Penjualan langsung (spec tagihan 4.1): draf tanpa kunjungan untuk pasien yang sudah ada. */
export async function createDirectSale(input: { patientId: string; branchId?: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, name: true, mergedInto: { select: { name: true, medicalRecordNumber: true } } },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
    if (patient.mergedInto) {
      throw new UserFacingError(
        `Pasien ini rangkap dari ${patient.mergedInto.name} (${patient.mergedInto.medicalRecordNumber}). Buat tagihan untuk pasien itu.`,
      );
    }
    const branch = input.branchId
      ? await prisma.branch.findUnique({ where: { id: String(input.branchId) }, select: { id: true, status: true } })
      : await prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true, status: true } });
    if (!branch) throw new UserFacingError("Belum ada cabang aktif.");
    if (branch.status !== "AKTIF") throw new UserFacingError("Cabang ini belum menerima transaksi.");

    const created = await prisma.invoice.create({
      data: { patientId: patient.id, branchId: branch.id, createdById: actor.staffId, createdByName: actor.name },
      select: { id: true },
    });
    await recordAudit({
      actor,
      action: "invoice.create",
      entity: "Invoice",
      entityId: created.id,
      summary: `Draf penjualan langsung untuk ${patient.name}`,
    });
    revalidateInvoices(created.id);
    return { id: created.id };
  });
}
```

- [ ] **Step 4: Pembacaan**

Buat `src/server/invoice-read.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BILLABLE_DAYS,
  invoiceTotals,
  matchesInvoiceView,
  type DiscountKindValue,
  type InvoiceDisplayStatus,
  type InvoiceLineKindValue,
  type InvoiceStatusValue,
  type InvoiceTotals,
  type InvoiceView,
} from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { dateOnlyString, stockFlags, type PaymentMethodValue } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { TOTALS_SELECT } from "@/server/invoice-store";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

export type InvoiceRow = {
  id: string;
  number: string | null;
  createdAt: Date;
  patientId: string;
  patientName: string;
  branchName: string;
  display: InvoiceDisplayStatus;
  total: number;
  balance: number;
  lineCount: number;
};

/** Daftar tagihan (spec tagihan 4.1): terbaru di atas, paling banyak 300 yang cocok dengan pencarian. */
export async function listInvoices(filter: { view: Exclude<InvoiceView, "PERLU_DITAGIH">; q?: string }): Promise<InvoiceRow[]> {
  await requireCapability("invoice:read");
  const q = filter.q?.trim();
  const invoices = await prisma.invoice.findMany({
    where: q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { patient: { name: { contains: q, mode: "insensitive" } } },
            { patient: { medicalRecordNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      number: true,
      createdAt: true,
      patient: { select: { id: true, name: true } },
      branch: { select: { name: true } },
      ...TOTALS_SELECT,
    },
  });
  return invoices
    .map((invoice) => {
      const totals = invoiceTotals(invoice);
      return {
        id: invoice.id,
        number: invoice.number,
        createdAt: invoice.createdAt,
        patientId: invoice.patient.id,
        patientName: invoice.patient.name,
        branchName: invoice.branch.name,
        display: totals.display,
        total: totals.total,
        balance: totals.balance,
        lineCount: invoice.lines.length,
      };
    })
    .filter((row) => matchesInvoiceView(row, filter.view));
}

/** Kunjungan final dalam 30 hari terakhir tanpa tagihan aktif; Konsultasi Online tanpa treatment tidak ikut. */
function billableWhere(now: Date): Prisma.EncounterWhereInput {
  return {
    status: "FINAL",
    finalizedAt: { gte: new Date(now.getTime() - BILLABLE_DAYS * 24 * 3600_000) },
    appointment: { patientId: { not: null }, invoices: { none: { status: { not: "DIBATALKAN" } } } },
    OR: [{ appointment: { channel: "KLINIK" } }, { treatments: { some: {} } }],
  };
}

export type BillableVisit = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  medicalRecordNumber: string;
  branchName: string;
  serviceName: string | null;
  finalizedAt: Date;
  treatmentCount: number;
  online: boolean;
};

export async function listBillableVisits(): Promise<BillableVisit[]> {
  await requireCapability("invoice:read");
  const encounters = await prisma.encounter.findMany({
    where: billableWhere(new Date()),
    orderBy: { finalizedAt: "desc" },
    take: 200,
    select: {
      finalizedAt: true,
      _count: { select: { treatments: true } },
      appointment: {
        select: {
          id: true,
          channel: true,
          patient: { select: { id: true, name: true, medicalRecordNumber: true } },
          branch: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
    },
  });
  return encounters.flatMap((encounter) => {
    const { appointment } = encounter;
    if (!appointment.patient || !encounter.finalizedAt) return [];
    return [
      {
        appointmentId: appointment.id,
        patientId: appointment.patient.id,
        patientName: appointment.patient.name,
        medicalRecordNumber: appointment.patient.medicalRecordNumber,
        branchName: appointment.branch.name,
        serviceName: appointment.service?.name ?? null,
        finalizedAt: encounter.finalizedAt,
        treatmentCount: encounter._count.treatments,
        online: appointment.channel === "ONLINE",
      },
    ];
  });
}

/** Angka di menu Tagihan dan kotak Perlu ditagih di dasbor. */
export async function countBillable(): Promise<number> {
  await requireCapability("invoice:read");
  return prisma.encounter.count({ where: billableWhere(new Date()) });
}

export type InvoiceLineRow = {
  id: string;
  kind: InvoiceLineKindValue;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  priceNote: string | null;
  serviceId: string | null;
  itemId: string | null;
  /** Berasal dari katalog (layanan atau barang): harga yang diubah wajib catatan. */
  catalogLinked: boolean;
  /** Harga pokok baris barang; null bila pengguna tidak memegang stock:read atau bukan barang. */
  cost: number | null;
};

export type InvoicePaymentRow = {
  id: string;
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

export type InvoiceDetail = {
  id: string;
  number: string | null;
  status: InvoiceStatusValue;
  version: number;
  patient: { id: string; name: string; medicalRecordNumber: string };
  branchId: string;
  branchName: string;
  appointmentId: string | null;
  visitDate: Date | null;
  discountKind: DiscountKindValue | null;
  discountValue: number;
  discountReason: string | null;
  discountByName: string | null;
  totals: InvoiceTotals;
  notes: string | null;
  createdByName: string;
  createdAt: Date;
  finalizedAt: Date | null;
  finalizedByName: string | null;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  lines: InvoiceLineRow[];
  payments: InvoicePaymentRow[];
  /** Pernah ada pembayaran (termasuk yang dibatalkan): pembatalan tagihan butuh invoice:correct. */
  everPaid: boolean;
  /** Σ harga pokok baris barang; null bila pengguna tidak memegang stock:read. */
  cost: number | null;
};

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const actor = await requireCapability("invoice:read");
  const withCost = can(actor.role, "stock:read");
  const invoice = await prisma.invoice.findUnique({
    where: { id: String(id ?? "") },
    select: {
      id: true,
      number: true,
      status: true,
      version: true,
      discountKind: true,
      discountValue: true,
      discountReason: true,
      discountByName: true,
      notes: true,
      createdByName: true,
      createdAt: true,
      finalizedAt: true,
      finalizedByName: true,
      cancelledAt: true,
      cancelledByName: true,
      cancelReason: true,
      branchId: true,
      appointmentId: true,
      patient: { select: { id: true, name: true, medicalRecordNumber: true } },
      branch: { select: { name: true } },
      appointment: { select: { startAt: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          kind: true,
          name: true,
          quantity: true,
          unitPrice: true,
          priceNote: true,
          serviceId: true,
          itemId: true,
          stockUses: { select: { quantity: true, unitCost: true } },
        },
      },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) return null;

  const lines = invoice.lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: line.quantity * line.unitPrice,
    priceNote: line.priceNote,
    serviceId: line.serviceId,
    itemId: line.itemId,
    catalogLinked: line.serviceId !== null || line.itemId !== null,
    cost: withCost && line.kind === "BARANG" ? line.stockUses.reduce((sum, use) => sum + use.quantity * use.unitCost, 0) : null,
  }));
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    version: invoice.version,
    patient: invoice.patient,
    branchId: invoice.branchId,
    branchName: invoice.branch.name,
    appointmentId: invoice.appointmentId,
    visitDate: invoice.appointment?.startAt ?? null,
    discountKind: invoice.discountKind,
    discountValue: invoice.discountValue,
    discountReason: invoice.discountReason,
    discountByName: invoice.discountByName,
    totals: invoiceTotals({
      status: invoice.status,
      discountKind: invoice.discountKind,
      discountValue: invoice.discountValue,
      lines: invoice.lines,
      payments: invoice.payments,
    }),
    notes: invoice.notes,
    createdByName: invoice.createdByName,
    createdAt: invoice.createdAt,
    finalizedAt: invoice.finalizedAt,
    finalizedByName: invoice.finalizedByName,
    cancelledAt: invoice.cancelledAt,
    cancelledByName: invoice.cancelledByName,
    cancelReason: invoice.cancelReason,
    lines,
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      paidAt: dateOnlyString(payment.paidAt),
      reference: payment.reference,
      staffName: payment.staffName,
      createdAt: payment.createdAt,
      revokedAt: payment.revokedAt,
      revokedByName: payment.revokedByName,
      revokeReason: payment.revokeReason,
    })),
    everPaid: invoice.payments.length > 0,
    cost: withCost ? lines.reduce((sum, line) => sum + (line.cost ?? 0), 0) : null,
  };
}

export type BillingItem = { id: string; code: string; name: string; unit: string; sellPrice: number; available: number };

/** Katalog barang untuk tagihan (spec tagihan 6): harga jual dan stok tersedia di cabang, tanpa harga beli dan tanpa batch. */
export async function listBillingItems(branchId: string): Promise<BillingItem[]> {
  await requireCapability("invoice:manage");
  const today = witaDateString(new Date());
  const items = await prisma.stockItem.findMany({
    where: { isActive: true, sellPrice: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      sellPrice: true,
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
    sellPrice: item.sellPrice ?? 0,
    available: stockFlags(item.batches, 0, today).available,
  }));
}
```

Run: `npm run test:integration -- tests/integration/invoice-create.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t3.log" 2>&1; grep -E "Test Files|Tests " "$WS/t3.log"; npx eslint src/server/invoice-store.ts src/server/invoice-read.ts src/server/invoice-drafts.ts tests/integration/invoice-create.test.ts; npx tsc --noEmit -p . > "$WS/t3-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/invoice-store.ts src/server/invoice-read.ts src/server/invoice-drafts.ts tests/integration/invoice-create.test.ts
git commit -m "feat: create invoices from final visits and direct sales, and read invoice lists, details, and billable visits"
```

---

### Task 4: Server — mengubah draf (barang, baris bebas, jumlah dan harga, diskon, segarkan harga)

**Files:**
- Modify: `src/server/invoice-store.ts`, `src/server/invoice-drafts.ts`
- Test: `tests/integration/invoice-draft.test.ts`

**Interfaces:**
- Consumes: Task 2 (`validateItemAdd`, `validateFreeLine`, `validateLineEdit`, `validateDiscount`, `invoiceSubtotal`, `discountAmount`, `discountLimit`, `DISCOUNT_LIMIT_PERCENT`), Task 3 (`touchDraft`, `STALE_DRAFT`, `createDirectSale`, `createInvoiceFromVisit`, `getInvoiceDetail`).
- Produces (`invoice-drafts.ts`, `"use server"`; semuanya mengembalikan versi baru dan butuh `version` yang sama dengan versi saat halaman dimuat):
  - `addInvoiceItem(input: { invoiceId: string; version: number; itemId: string; quantity: number }): Promise<ActionResult<{ version: number }>>` (`invoice:manage`);
  - `addFreeLine(input: { invoiceId: string; version: number; kind: "LAYANAN" | "TREATMENT"; name: string; quantity: number; unitPrice: number }): Promise<ActionResult<{ version: number }>>` (`invoice:manage`);
  - `updateInvoiceLine(input: { invoiceId: string; version: number; lineId: string; quantity: number; unitPrice: number; priceNote: string }): Promise<ActionResult<{ version: number }>>` (`invoice:manage`);
  - `removeInvoiceLine(input: { invoiceId: string; version: number; lineId: string }): Promise<ActionResult<{ version: number }>>` (`invoice:manage`);
  - `refreshCatalogPrices(input: { invoiceId: string; version: number }): Promise<ActionResult<{ version: number; updated: number }>>` (`invoice:manage`);
  - `setInvoiceDiscount(input: { invoiceId: string; version: number; kind: "NOMINAL" | "PERSEN" | null; value: number; reason: string }): Promise<ActionResult<{ version: number }>>` (`invoice:manage` atau `invoice:correct`; yang tanpa `invoice:correct` dibatasi 20%);
  - `invoice-store.ts`: `guardDiscount(tx, invoiceId, canExceed, mutate)`;
  - audit: `invoice.update`, `invoice.discount`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/invoice-draft.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  addFreeLine,
  addInvoiceItem,
  createDirectSale,
  createInvoiceFromVisit,
  refreshCatalogPrices,
  removeInvoiceLine,
  setInvoiceDiscount,
  updateInvoiceLine,
} from "@/server/invoice-drafts";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
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

const SLUG = "draf-tagihan";
const WA = "6281200008820";
const STALE = "Tagihan ini baru diubah orang lain. Muat ulang halaman.";

describe("mengubah draf tagihan", () => {
  let world: BillingWorld;

  /** Draf kosong untuk penjualan langsung; kembalikan id dan versinya. */
  async function draft() {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    return { id, version: 1 };
  }
  const free = (id: string, version: number, patch: Record<string, unknown> = {}) =>
    addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Biaya administrasi", quantity: 1, unitPrice: 100000, ...patch } as Parameters<typeof addFreeLine>[0]);

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

  it("tambah barang dari katalog dengan harga jual; versi naik setiap perubahan", async () => {
    const { id, version } = await draft();
    const added = await unwrap(addInvoiceItem({ invoiceId: id, version, itemId: world.drugId, quantity: 3 }));
    expect(added.version).toBe(2);
    const detail = await getInvoiceDetail(id);
    expect(detail?.version).toBe(2);
    expect(detail?.lines[0]).toMatchObject({ kind: "BARANG", name: `${SLUG} Amoxicillin`, quantity: 3, unitPrice: 2000, itemId: world.drugId, catalogLinked: true });
    expect(detail?.totals.total).toBe(6000);
    expect(await prisma.auditLog.count({ where: { action: "invoice.update", entityId: id } })).toBe(1);
  });

  it("menolak barang nonaktif, tanpa harga jual, atau tidak ada", async () => {
    const { id, version } = await draft();
    const off = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-OFF`, name: `${SLUG} Off`, kind: "PRODUK", unit: "pcs", sellPrice: 1000, isActive: false } });
    const noPrice = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-NOP`, name: `${SLUG} NoPrice`, kind: "PRODUK", unit: "pcs" } });
    expect(await addInvoiceItem({ invoiceId: id, version, itemId: off.id, quantity: 1 })).toEqual({ ok: false, error: "Barang ini nonaktif." });
    expect(await addInvoiceItem({ invoiceId: id, version, itemId: noPrice.id, quantity: 1 })).toEqual({
      ok: false,
      error: "Barang ini belum punya harga jual.",
    });
    expect(await addInvoiceItem({ invoiceId: id, version, itemId: "tidak-ada", quantity: 1 })).toEqual({ ok: false, error: "Barang tidak ditemukan." });
    expect((await getInvoiceDetail(id))?.version).toBe(1);
  });

  it("baris bebas: jenis, nama, jumlah, dan harga diperiksa di server", async () => {
    const { id, version } = await draft();
    expect(await free(id, version, { kind: "BARANG" })).toEqual({ ok: false, error: "Pilih jenis baris." });
    expect(await free(id, version, { unitPrice: -1 })).toEqual({ ok: false, error: "Harga tidak sah." });
    expect(await free(id, version, { quantity: 0.5 })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat lebih dari 0." });
    const ok = await unwrap(free(id, version));
    expect(ok.version).toBe(2);
    expect((await getInvoiceDetail(id))?.lines[0]).toMatchObject({ kind: "LAYANAN", unitPrice: 100000, catalogLinked: false });
  });

  it("suntingan dari halaman yang usang ditolak; dua suntingan bersamaan dengan versi sama hanya satu yang masuk", async () => {
    const { id, version } = await draft();
    await unwrap(free(id, version));
    expect(await free(id, version)).toEqual({ ok: false, error: STALE });

    const current = (await getInvoiceDetail(id))!.version;
    const results = await Promise.all([free(id, current, { name: "A" }), free(id, current, { name: "B" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: STALE });
    expect((await getInvoiceDetail(id))?.lines).toHaveLength(2);
  });

  it("ubah jumlah dan harga: harga katalog yang diubah wajib catatan, baris bebas tidak", async () => {
    const { id, version } = await draft();
    const a = await unwrap(addInvoiceItem({ invoiceId: id, version, itemId: world.productId, quantity: 1 }));
    const b = await unwrap(free(id, a.version, { unitPrice: 50000 }));
    const [catalog, custom] = (await getInvoiceDetail(id))!.lines;

    expect(await updateInvoiceLine({ invoiceId: id, version: b.version, lineId: catalog.id, quantity: 1, unitPrice: 120000, priceNote: "" })).toEqual({
      ok: false,
      error: "Isi catatan alasan perubahan harga.",
    });
    const c = await unwrap(
      updateInvoiceLine({ invoiceId: id, version: b.version, lineId: catalog.id, quantity: 2, unitPrice: 120000, priceNote: "Promo pelanggan lama" }),
    );
    const d = await unwrap(updateInvoiceLine({ invoiceId: id, version: c.version, lineId: custom.id, quantity: 3, unitPrice: 60000, priceNote: "" }));
    const detail = await getInvoiceDetail(id);
    expect(detail?.lines[0]).toMatchObject({ quantity: 2, unitPrice: 120000, priceNote: "Promo pelanggan lama" });
    expect(detail?.lines[1]).toMatchObject({ quantity: 3, unitPrice: 60000 });
    expect(d.version).toBe(detail?.version);

    // Mengembalikan harga ke harga katalog menghapus catatan; hanya mengubah jumlah tidak butuh catatan baru.
    const e = await unwrap(updateInvoiceLine({ invoiceId: id, version: d.version, lineId: catalog.id, quantity: 2, unitPrice: 150000, priceNote: "" }));
    expect((await getInvoiceDetail(id))?.lines[0]).toMatchObject({ unitPrice: 150000, priceNote: null });
    expect((await updateInvoiceLine({ invoiceId: id, version: e.version, lineId: "tidak-ada", quantity: 1, unitPrice: 1, priceNote: "" }))).toEqual({
      ok: false,
      error: "Baris tidak ditemukan.",
    });
  });

  it("hapus baris", async () => {
    const { id, version } = await draft();
    const a = await unwrap(free(id, version));
    const line = (await getInvoiceDetail(id))!.lines[0];
    await unwrap(removeInvoiceLine({ invoiceId: id, version: a.version, lineId: line.id }));
    expect((await getInvoiceDetail(id))?.lines).toHaveLength(0);
  });

  it("diskon: resepsionis sampai 20%, di atasnya ditolak; Admin Keuangan boleh lebih; alasan wajib", async () => {
    const { id, version } = await draft();
    const a = await unwrap(free(id, version));
    expect(await setInvoiceDiscount({ invoiceId: id, version: a.version, kind: "PERSEN", value: 21, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon di atas 20% diberikan oleh Admin Keuangan.",
    });
    expect(await setInvoiceDiscount({ invoiceId: id, version: a.version, kind: "NOMINAL", value: 5000, reason: " " })).toEqual({
      ok: false,
      error: "Isi alasan diskon.",
    });
    const b = await unwrap(setInvoiceDiscount({ invoiceId: id, version: a.version, kind: "PERSEN", value: 20, reason: "Pelanggan lama" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ discountKind: "PERSEN", discountValue: 20, discountReason: "Pelanggan lama", totals: { discount: 20000, total: 80000 } });

    actor.role = "ADMIN_KEUANGAN";
    const c = await unwrap(setInvoiceDiscount({ invoiceId: id, version: b.version, kind: "PERSEN", value: 50, reason: "Kebijakan pemilik" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ discountByName: "Resepsionis Uji", totals: { total: 50000 } });
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: c.version, kind: null, value: 0, reason: "" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ discountKind: null, discountValue: 0, discountReason: null, totals: { total: 100000 } });
    expect(await prisma.auditLog.count({ where: { action: "invoice.discount", entityId: id } })).toBe(3);
  });

  it("mengubah baris tidak boleh membuat diskon resepsionis melewati 20%", async () => {
    const { id, version } = await draft();
    const a = await unwrap(free(id, version, { name: "Besar", unitPrice: 80000 }));
    const b = await unwrap(free(id, a.version, { name: "Kecil", unitPrice: 20000 }));
    const c = await unwrap(setInvoiceDiscount({ invoiceId: id, version: b.version, kind: "NOMINAL", value: 20000, reason: "Pelanggan lama" }));
    const big = (await getInvoiceDetail(id))!.lines[0];
    expect(await removeInvoiceLine({ invoiceId: id, version: c.version, lineId: big.id })).toEqual({
      ok: false,
      error: "Perubahan ini membuat diskon melebihi 20%. Ubah diskon dulu atau minta Admin Keuangan.",
    });
    expect((await getInvoiceDetail(id))?.lines).toHaveLength(2);
  });

  it("segarkan harga katalog: baris katalog mengikuti harga sekarang, baris bebas tetap", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const a = await unwrap(free(id, 1, { name: "Bebas", unitPrice: 7000 }));
    await prisma.service.update({ where: { id: world.consultationId }, data: { promoPrice: 210000 } });
    try {
      const refreshed = await unwrap(refreshCatalogPrices({ invoiceId: id, version: a.version }));
      expect(refreshed.updated).toBe(1);
      const lines = (await getInvoiceDetail(id))!.lines;
      expect(lines.find((line) => line.name === "Konsultasi Dokter")?.unitPrice).toBe(210000);
      expect(lines.find((line) => line.name === "Bebas")?.unitPrice).toBe(7000);
    } finally {
      await prisma.service.update({ where: { id: world.consultationId }, data: { promoPrice: 200000 } });
    }
  });

  it("tagihan yang sudah final tidak bisa diubah", async () => {
    const { id, version } = await draft();
    await prisma.invoice.update({ where: { id }, data: { status: "FINAL", number: `TG-2031-${Date.now() % 10000}`, finalizedAt: new Date() } });
    expect(await free(id, version)).toEqual({ ok: false, error: "Tagihan ini sudah tidak berupa draf. Muat ulang halaman." });
    expect(await setInvoiceDiscount({ invoiceId: id, version, kind: "PERSEN", value: 5, reason: "x" })).toEqual({
      ok: false,
      error: "Tagihan ini sudah tidak berupa draf. Muat ulang halaman.",
    });
  });

  it("hak akses: Admin Keuangan tidak mengubah baris; Dokter tidak menyentuh tagihan", async () => {
    const { id, version } = await draft();
    actor.role = "ADMIN_KEUANGAN";
    await expect(free(id, version)).rejects.toThrow(/forbidden: invoice:manage/);
    await expect(addInvoiceItem({ invoiceId: id, version, itemId: world.drugId, quantity: 1 })).rejects.toThrow(/forbidden: invoice:manage/);
    actor.role = "DOKTER";
    await expect(setInvoiceDiscount({ invoiceId: id, version, kind: "PERSEN", value: 5, reason: "x" })).rejects.toThrow(/forbidden: invoice:read/);
  });
});
```

Run: `npm run test:integration -- tests/integration/invoice-draft.test.ts`
Expected: FAIL, karena `addInvoiceItem` dan kawan-kawannya belum diekspor.

- [ ] **Step 2: Penjaga diskon**

Tambahkan di akhir `src/server/invoice-store.ts` (dan tambahkan `import { UserFacingError } …` yang sudah ada; tambahkan `import { discountAmount, discountLimit, DISCOUNT_LIMIT_PERCENT, invoiceSubtotal } from "@/lib/invoice";` di bagian import):

```ts

/**
 * Menjalankan perubahan baris, lalu menolaknya bila membuat diskon resepsionis melewati batas
 * (spec tagihan TG9): diskon nominal yang tadinya ≤ 20% bisa jadi lebih besar setelah baris
 * dihapus. Diskon yang sejak awal di atas batas (disetujui Admin Keuangan) tidak dipersoalkan.
 */
export async function guardDiscount(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  canExceed: boolean,
  mutate: () => Promise<void>,
): Promise<void> {
  const read = async () => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { discountKind: true, discountValue: true, lines: { select: { quantity: true, unitPrice: true } } },
    });
    const subtotal = invoiceSubtotal(invoice.lines);
    return { within: discountAmount(subtotal, invoice.discountKind, invoice.discountValue) <= discountLimit(subtotal) };
  };
  const before = await read();
  await mutate();
  const after = await read();
  if (!canExceed && before.within && !after.within) {
    throw new UserFacingError(
      `Perubahan ini membuat diskon melebihi ${DISCOUNT_LIMIT_PERCENT}%. Ubah diskon dulu atau minta Admin Keuangan.`,
    );
  }
}
```

- [ ] **Step 3: Aksi ubah draf**

Di `src/server/invoice-drafts.ts`:
1. Ganti baris import pertama menjadi (menambah `can`, validasi, dan pembantu):

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  invoiceSubtotal,
  validateDiscount,
  validateFreeLine,
  validateItemAdd,
  validateLineEdit,
  visitLines,
  type FreeLineInput,
  type DiscountKindValue,
} from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { isExclusionViolation } from "@/server/db-errors";
import { guardDiscount, touchDraft } from "@/server/invoice-store";
import { requireCapability } from "@/server/session";
```

2. Tambahkan di akhir berkas:

```ts

type EditResult = ActionResult<{ version: number }>;

async function nextSortOrder(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], invoiceId: string): Promise<number> {
  const last = await tx.invoiceLine.aggregate({ where: { invoiceId }, _max: { sortOrder: true } });
  return (last._max.sortOrder ?? -1) + 1;
}

/** Tambah barang dari katalog stok dengan harga jual saat ini (spec tagihan 4.2). */
export async function addInvoiceItem(input: { invoiceId: string; version: number; itemId: string; quantity: number }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const checked = validateItemAdd(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const item = await tx.stockItem.findUnique({
        where: { id: checked.value.itemId },
        select: { id: true, name: true, isActive: true, sellPrice: true },
      });
      if (!item) throw new UserFacingError("Barang tidak ditemukan.");
      if (!item.isActive) throw new UserFacingError("Barang ini nonaktif.");
      if (item.sellPrice === null) throw new UserFacingError("Barang ini belum punya harga jual.");
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: {
            invoiceId,
            kind: "BARANG",
            name: item.name,
            quantity: checked.value.quantity,
            unitPrice: item.sellPrice!,
            itemId: item.id,
            sortOrder: await nextSortOrder(tx, invoiceId),
          },
        });
      });
      return { version, summary: `Tambah barang ${item.name} ×${checked.value.quantity}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Tambah baris bebas (layanan atau treatment yang tidak ada di katalog) dengan nama dan harga sendiri. */
export async function addFreeLine(input: { invoiceId: string; version: number } & FreeLineInput): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const checked = validateFreeLine(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const invoiceId = String(input.invoiceId ?? "");
    const line = checked.value;

    const version = await prisma.$transaction(async (tx) => {
      const next = await touchDraft(tx, invoiceId, input.version);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: { invoiceId, kind: line.kind, name: line.name, quantity: line.quantity, unitPrice: line.unitPrice, sortOrder: await nextSortOrder(tx, invoiceId) },
        });
      });
      return next;
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: `Tambah baris ${line.name} ×${line.quantity}` });
    revalidateInvoices(invoiceId);
    return { version };
  });
}

/**
 * Ubah jumlah dan harga satu baris draf. Harga baris katalog yang diubah dari harga semula dan
 * dari harga katalog sekarang wajib catatan; mengembalikannya ke harga katalog menghapus catatan.
 */
export async function updateInvoiceLine(input: {
  invoiceId: string;
  version: number;
  lineId: string;
  quantity: number;
  unitPrice: number;
  priceNote: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input.lineId ?? ""), invoiceId },
        select: { id: true, name: true, unitPrice: true, priceNote: true, serviceId: true, itemId: true },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");

      const catalogPrice = line.itemId
        ? (await tx.stockItem.findUnique({ where: { id: line.itemId }, select: { sellPrice: true } }))?.sellPrice ?? null
        : line.serviceId
          ? (await tx.service.findUnique({ where: { id: line.serviceId }, select: { promoPrice: true } }))?.promoPrice ?? null
          : null;
      const catalogLinked = line.itemId !== null || line.serviceId !== null;
      const price = typeof input.unitPrice === "number" ? input.unitPrice : Number.NaN;
      const needsNote = catalogLinked && price !== line.unitPrice && price !== (catalogPrice ?? line.unitPrice);
      const checked = validateLineEdit(input, { needsNote });
      if (!checked.ok) throw new UserFacingError(checked.message);

      const atCatalogPrice = catalogLinked && checked.value.unitPrice === (catalogPrice ?? line.unitPrice);
      const priceNote = atCatalogPrice ? null : (checked.value.priceNote ?? (checked.value.unitPrice === line.unitPrice ? line.priceNote : null));
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.update({
          where: { id: line.id },
          data: { quantity: checked.value.quantity, unitPrice: checked.value.unitPrice, priceNote },
        });
      });
      return { version, summary: `Ubah baris ${line.name}: ×${checked.value.quantity}, Rp ${checked.value.unitPrice}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

export async function removeInvoiceLine(input: { invoiceId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({ where: { id: String(input.lineId ?? ""), invoiceId }, select: { id: true, name: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.delete({ where: { id: line.id } });
      });
      return { version, summary: `Hapus baris ${line.name}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Menyalin ulang harga katalog saat ini ke baris katalog di draf (spec tagihan 4.2). Baris bebas tidak disentuh. */
export async function refreshCatalogPrices(input: { invoiceId: string; version: number }): Promise<ActionResult<{ version: number; updated: number }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const lines = await tx.invoiceLine.findMany({
        where: { invoiceId, OR: [{ itemId: { not: null } }, { serviceId: { not: null } }] },
        select: { id: true, unitPrice: true, itemId: true, serviceId: true },
      });
      let updated = 0;
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        for (const line of lines) {
          const price = line.itemId
            ? (await tx.stockItem.findUnique({ where: { id: line.itemId }, select: { sellPrice: true } }))?.sellPrice ?? null
            : (await tx.service.findUnique({ where: { id: line.serviceId! }, select: { promoPrice: true } }))?.promoPrice ?? null;
          if (price === null || price === line.unitPrice) continue;
          await tx.invoiceLine.update({ where: { id: line.id }, data: { unitPrice: price, priceNote: null } });
          updated += 1;
        }
      });
      return { version, updated };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: `Segarkan harga katalog: ${result.updated} baris` });
    revalidateInvoices(invoiceId);
    return result;
  });
}

/**
 * Diskon draf (spec tagihan 3.2, TG9). Resepsionis sampai 20% dari subtotal; Admin Keuangan dan
 * Super Admin boleh lebih. Jenis kosong atau nilai 0 menghapus diskon.
 */
export async function setInvoiceDiscount(input: {
  invoiceId: string;
  version: number;
  kind: DiscountKindValue | null;
  value: number;
  reason: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:read");
    const canExceed = can(actor.role, "invoice:correct");
    if (!can(actor.role, "invoice:manage") && !canExceed) throw new UserFacingError("Anda tidak berhak mengubah diskon.");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, select: { quantity: true, unitPrice: true } });
      const checked = validateDiscount(input, { subtotal: invoiceSubtotal(lines), canExceed });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const discount = checked.value;
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          discountKind: discount.kind,
          discountValue: discount.value,
          discountReason: discount.reason,
          discountByName: discount.kind ? actor.name : null,
        },
      });
      return { version, summary: discount.kind ? `Diskon ${discount.value}${discount.kind === "PERSEN" ? "%" : ""}: ${discount.reason}` : "Diskon dihapus" };
    });

    await recordAudit({ actor, action: "invoice.discount", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}
```

Catatan: pengujian peran dilakukan dengan `actor.role`; `discountByName` memakai `actor.name` yang tetap "Resepsionis Uji" di uji (hanya perannya yang berganti).

Run: `npm run test:integration -- tests/integration/invoice-draft.test.ts tests/integration/invoice-create.test.ts`
Expected: PASS semua.

- [ ] **Step 4: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t4.log" 2>&1; grep -E "Test Files|Tests " "$WS/t4.log"; npx eslint src/server/invoice-store.ts src/server/invoice-drafts.ts tests/integration/invoice-draft.test.ts; npx tsc --noEmit -p . > "$WS/t4-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`. Bila `tsc` menandai tipe `tx` pada `nextSortOrder`, ganti parameternya menjadi `tx: Prisma.TransactionClient` dengan `import type { Prisma } from "@prisma/client";`.

```bash
git add src/server/invoice-store.ts src/server/invoice-drafts.ts tests/integration/invoice-draft.test.ts
git commit -m "feat: let receptionists edit draft invoices (items, lines, prices, discounts) with optimistic versioning"
```

---

### Task 5: Server — finalkan tagihan (stok keluar FEFO, nomor) dan batalkan tagihan (stok kembali)

**Files:**
- Create: `src/server/invoice-lifecycle.ts`
- Test: `tests/integration/invoice-lifecycle.test.ts`

**Interfaces:**
- Consumes: Task 2 (`fefoPlan`, `formatInvoiceNumber`, `invoiceTotals`), Task 3 (`lockInvoiceRow`, `nextInvoiceSequence`, `STALE_DRAFT`, `TOTALS_SELECT`, `getInvoiceDetail`), Task 4 (`createDirectSale`, `addInvoiceItem`, `addFreeLine`), sub-proyek stok (`takeFromBatch`, `validateReason`), `recordAudit`.
- Produces (`invoice-lifecycle.ts`, `"use server"`):
  - `finalizeInvoice(input: { invoiceId: string; version: number }): Promise<ActionResult<{ number: string }>>` (`invoice:manage`);
  - `cancelInvoice(input: { invoiceId: string; reason: string }): Promise<ActionResult<void>>` (`invoice:manage` atau `invoice:correct`; aturan bagian 5 spec);
  - audit: `invoice.finalize`, `invoice.cancel`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/invoice-lifecycle.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addFreeLine, addInvoiceItem, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
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

const SLUG = "siklus-tagihan";
const WA = "6281200008830";
const today = witaDateString(new Date());
const NUMBER = /^TG-\d{4}-\d{4,}$/;
let seq = 0;

describe("finalkan dan batalkan tagihan", () => {
  let world: BillingWorld;

  const remaining = async (batchId: string) => (await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } })).quantityRemaining;
  const batch = (itemId: string, quantity: number, daysToExpiry: number | null, unitCost = 1000) => {
    seq += 1;
    return billingBatch(world, {
      invoiceNumber: `SK-${seq}`,
      itemId,
      quantity,
      unitCost,
      expiryDate: daysToExpiry === null ? null : addDaysToDateString(today, daysToExpiry),
    });
  };
  let itemSeq = 0;
  /** Barang baru dengan rak sendiri: FEFO di cabang yang sama tidak bercampur dengan batch tes lain. */
  const newItem = (price = 5000) => {
    itemSeq += 1;
    return prisma.stockItem.create({
      data: { code: `${SLUG.toUpperCase()}-N${itemSeq}`, name: `${SLUG} Barang ${itemSeq}`, kind: "PRODUK", unit: "pcs", sellPrice: price },
    });
  };
  /** Draf penjualan langsung dengan barang-barang tertentu; kembalikan id dan versi terakhir. */
  async function draftWith(items: { itemId: string; quantity: number }[]) {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    let version = 1;
    for (const item of items) version = (await unwrap(addInvoiceItem({ invoiceId: id, version, ...item }))).version;
    return { id, version };
  }

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

  it("finalisasi: nomor berurutan, tagihan terkunci, stok keluar dari batch tercepat kedaluwarsa dengan harga pokoknya", async () => {
    const soon = await batch(world.drugId, 4, 30, 1000);
    const later = await batch(world.drugId, 10, 90, 1500);
    const { id, version } = await draftWith([{ itemId: world.drugId, quantity: 6 }]);

    const { number } = await unwrap(finalizeInvoice({ invoiceId: id, version }));
    expect(number).toMatch(NUMBER);

    expect(await remaining(soon.batchId)).toBe(0);
    expect(await remaining(later.batchId)).toBe(8);
    const uses = await prisma.invoiceStockUse.findMany({ where: { line: { invoiceId: id } }, orderBy: { quantity: "desc" } });
    expect(uses.map((use) => [use.batchId, use.quantity, use.unitCost])).toEqual([
      [soon.batchId, 4, 1000],
      [later.batchId, 2, 1500],
    ]);
    const movements = await prisma.stockMovement.findMany({ where: { invoiceId: id, kind: "KELUAR" }, orderBy: { quantity: "asc" } });
    expect(movements.map((m) => m.quantity)).toEqual([-4, -2]);
    expect(await prisma.auditLog.count({ where: { action: "invoice.finalize", entityId: id } })).toBe(1);

    const detail = await getInvoiceDetail(id);
    expect(detail).toMatchObject({ status: "FINAL", number, totals: { total: 12000, display: "BELUM_DIBAYAR" } });
    expect(detail?.finalizedAt).not.toBeNull();
    expect(detail?.cost).toBeNull();
    actor.role = "ADMIN_KEUANGAN";
    expect((await getInvoiceDetail(id))?.cost).toBe(4 * 1000 + 2 * 1500);
    expect((await getInvoiceDetail(id))?.lines[0].cost).toBe(7000);
  });

  it("nomor tagihan naik satu demi satu", async () => {
    await batch(world.productId, 10, null);
    const a = await draftWith([{ itemId: world.productId, quantity: 1 }]);
    const b = await draftWith([{ itemId: world.productId, quantity: 1 }]);
    const first = await unwrap(finalizeInvoice({ invoiceId: a.id, version: a.version }));
    const second = await unwrap(finalizeInvoice({ invoiceId: b.id, version: b.version }));
    const n = (value: string) => Number(value.split("-")[2]);
    expect(n(second.number)).toBe(n(first.number) + 1);
  });

  it("stok kurang di tengah finalisasi: semuanya batal, stok barang lain tidak ikut berkurang", async () => {
    const drug = await batch(world.drugId, 20, 60);
    const product = await batch(world.productId, 3, null);
    // Rak produk sudah berisi stok dari tes lain; bawa jumlah melebihi seluruhnya.
    const have = (await prisma.stockBatch.aggregate({ where: { itemId: world.productId, branchId: world.branchId }, _sum: { quantityRemaining: true } }))._sum.quantityRemaining ?? 0;
    const { id, version } = await draftWith([
      { itemId: world.drugId, quantity: 2 },
      { itemId: world.productId, quantity: have + 1 },
    ]);
    const before = await remaining(drug.batchId);
    const result = await finalizeInvoice({ invoiceId: id, version });
    expect(result).toEqual({ ok: false, error: `Stok ${SLUG} Serum C di Cabang Publik Uji tidak cukup (tersedia ${have}).` });
    expect(await remaining(drug.batchId)).toBe(before);
    expect(await remaining(product.batchId)).toBe(3);
    expect(await prisma.stockMovement.count({ where: { invoiceId: id } })).toBe(0);
    expect((await getInvoiceDetail(id))?.status).toBe("DRAF");
  });

  it("barang yang sama di dua baris dihitung bersama; batch kedaluwarsa tidak dipakai", async () => {
    const lone = await prisma.stockItem.create({
      data: { code: `${SLUG.toUpperCase()}-SOLO`, name: `${SLUG} Solo`, kind: "PRODUK", unit: "pcs", sellPrice: 5000 },
    });
    await batch(lone.id, 5, 40);
    await batch(lone.id, 9, -1);
    const { id, version } = await draftWith([
      { itemId: lone.id, quantity: 3 },
      { itemId: lone.id, quantity: 3 },
    ]);
    expect(await finalizeInvoice({ invoiceId: id, version })).toEqual({
      ok: false,
      error: `Stok ${SLUG} Solo di Cabang Publik Uji tidak cukup (tersedia 2).`,
    });
  });

  it("dua finalisasi bersamaan: hanya satu berhasil dan stok hanya berkurang sekali", async () => {
    const item = await newItem();
    const stock = await batch(item.id, 50, 70);
    const { id, version } = await draftWith([{ itemId: item.id, quantity: 5 }]);
    const results = await Promise.all([finalizeInvoice({ invoiceId: id, version }), finalizeInvoice({ invoiceId: id, version })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false });
    expect(await remaining(stock.batchId)).toBe(45);
    expect(await prisma.stockMovement.count({ where: { invoiceId: id, kind: "KELUAR" } })).toBe(1);
  });

  it("menolak tagihan kosong, versi usang, dan yang sudah final", async () => {
    const empty = await unwrap(createDirectSale({ patientId: world.patientId }));
    expect(await finalizeInvoice({ invoiceId: empty.id, version: 1 })).toEqual({
      ok: false,
      error: "Tagihan kosong tidak bisa difinalkan. Tambahkan baris dulu.",
    });
    const { id, version } = await draftWith([]);
    await unwrap(addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Biaya", quantity: 1, unitPrice: 1000 }));
    expect(await finalizeInvoice({ invoiceId: id, version })).toEqual({ ok: false, error: "Tagihan ini baru diubah orang lain. Muat ulang halaman." });
    await unwrap(finalizeInvoice({ invoiceId: id, version: version + 1 }));
    expect(await finalizeInvoice({ invoiceId: id, version: version + 1 })).toEqual({
      ok: false,
      error: "Tagihan ini sudah difinalkan atau dibatalkan. Muat ulang halaman.",
    });
  });

  it("tagihan tanpa barang tidak menyentuh stok; total Rp 0 tetap bisa difinalkan", async () => {
    const { id, version } = await draftWith([]);
    const next = await unwrap(addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Gratis", quantity: 1, unitPrice: 0 }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: next.version }));
    expect(await getInvoiceDetail(id)).toMatchObject({ status: "FINAL", totals: { total: 0, display: "LUNAS" } });
  });

  it("batalkan draf: tanpa efek ke stok; kunjungan boleh ditagih ulang", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(await cancelInvoice({ invoiceId: id, reason: " " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Salah kunjungan" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ status: "DIBATALKAN", cancelReason: "Salah kunjungan", cancelledByName: "Resepsionis Uji", totals: { display: "DIBATALKAN" } });
    expect(await cancelInvoice({ invoiceId: id, reason: "lagi" })).toEqual({ ok: false, error: "Tagihan ini sudah dibatalkan." });
    const again = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(again.id).not.toBe(id);
    expect(await prisma.auditLog.count({ where: { action: "invoice.cancel", entityId: id } })).toBe(1);
  });

  it("batalkan tagihan final tanpa pembayaran: stok kembali ke batch asalnya lewat jurnal", async () => {
    const item = await newItem();
    const stock = await batch(item.id, 12, 80);
    const { id, version } = await draftWith([{ itemId: item.id, quantity: 5 }]);
    const { number } = await unwrap(finalizeInvoice({ invoiceId: id, version }));
    expect(await remaining(stock.batchId)).toBe(7);

    await unwrap(cancelInvoice({ invoiceId: id, reason: "Pelanggan batal beli" }));
    expect(await remaining(stock.batchId)).toBe(12);
    const back = await prisma.stockMovement.findFirstOrThrow({ where: { invoiceId: id, kind: "PENYESUAIAN" } });
    expect(back).toMatchObject({ quantity: 5, reason: "LAINNYA", note: `Tagihan ${number} dibatalkan`, batchId: stock.batchId });
    expect((await getInvoiceDetail(id))?.status).toBe("DIBATALKAN");
  });

  it("tagihan yang sudah dibayar: pembayaran aktif menghalangi; yang pernah dibayar hanya dibatalkan Admin Keuangan", async () => {
    await batch(world.productId, 5, null);
    const { id, version } = await draftWith([{ itemId: world.productId, quantity: 1 }]);
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    const payment = await prisma.invoicePayment.create({
      data: { invoiceId: id, amount: 1000, method: "TUNAI", paidAt: new Date(`${today}T00:00:00Z`), staffId: "s1", staffName: "Resepsionis Uji" },
    });
    expect(await cancelInvoice({ invoiceId: id, reason: "salah" })).toEqual({
      ok: false,
      error: "Batalkan pembayarannya dulu (oleh Admin Keuangan), lalu batalkan tagihan.",
    });

    await prisma.invoicePayment.update({ where: { id: payment.id }, data: { revokedAt: new Date(), revokedByName: "Keuangan", revokeReason: "salah input" } });
    expect(await cancelInvoice({ invoiceId: id, reason: "salah" })).toEqual({
      ok: false,
      error: "Tagihan ini pernah dibayar. Pembatalan dilakukan oleh Admin Keuangan.",
    });
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Pembayaran salah catat" }));
    expect((await getInvoiceDetail(id))?.status).toBe("DIBATALKAN");
  });

  it("hak akses: Admin Keuangan tidak memfinalkan; Dokter dan Apoteker tidak membatalkan", async () => {
    const { id, version } = await draftWith([]);
    actor.role = "ADMIN_KEUANGAN";
    await expect(finalizeInvoice({ invoiceId: id, version })).rejects.toThrow(/forbidden: invoice:manage/);
    for (const role of ["DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      await expect(cancelInvoice({ invoiceId: id, reason: "x" })).rejects.toThrow(/forbidden: invoice:read/);
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/invoice-lifecycle.test.ts`
Expected: FAIL, karena modul `@/server/invoice-lifecycle` tidak ditemukan.

- [ ] **Step 2: Aksi finalkan dan batalkan**

Buat `src/server/invoice-lifecycle.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { fefoPlan, formatInvoiceNumber, invoiceTotals, type BatchStock } from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { formatRupiah } from "@/lib/format";
import { validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { lockInvoiceRow, nextInvoiceSequence, STALE_DRAFT, TOTALS_SELECT } from "@/server/invoice-store";
import { requireCapability } from "@/server/session";
import { takeFromBatch } from "@/server/stock-store";

function revalidateLifecycle(invoiceId: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

type LiveBatch = BatchStock & { unitCost: number };

/**
 * Finalkan tagihan (spec tagihan 4.3), dalam satu transaksi: stok baris barang diambil dari
 * batch tercepat kedaluwarsa (FEFO) di cabang tagihan, jurnal KELUAR dan harga pokok dicatat,
 * nomor tagihan diberikan, dan baris dikunci. Stok kurang: seluruhnya batal, draf tetap utuh.
 */
export async function finalizeInvoice(input: { invoiceId: string; version: number }): Promise<ActionResult<{ number: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const now = new Date();
    const today = witaDateString(now);

    const result = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          version: true,
          branchId: true,
          branch: { select: { name: true } },
          ...TOTALS_SELECT,
          lines: { orderBy: { sortOrder: "asc" }, select: { id: true, kind: true, name: true, itemId: true, quantity: true, unitPrice: true } },
        },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status !== "DRAF") throw new UserFacingError("Tagihan ini sudah difinalkan atau dibatalkan. Muat ulang halaman.");
      if (invoice.version !== input.version) throw new UserFacingError(STALE_DRAFT);
      if (invoice.lines.length === 0) throw new UserFacingError("Tagihan kosong tidak bisa difinalkan. Tambahkan baris dulu.");

      // Stok tiap barang dimuat sekali dan dikurangi di memori setiap baris, supaya barang yang sama
      // di dua baris tidak memakai sisa yang sama dua kali.
      const live = new Map<string, LiveBatch[]>();
      for (const line of invoice.lines) {
        if (line.kind !== "BARANG" || !line.itemId || live.has(line.itemId)) continue;
        live.set(
          line.itemId,
          await tx.stockBatch.findMany({
            where: { itemId: line.itemId, branchId: invoice.branchId, quantityRemaining: { gt: 0 } },
            select: { id: true, quantityRemaining: true, expiryDate: true, createdAt: true, unitCost: true },
          }),
        );
      }

      for (const line of invoice.lines) {
        if (line.kind !== "BARANG" || !line.itemId) continue;
        const batches = live.get(line.itemId) ?? [];
        const plan = fefoPlan(batches, line.quantity, today);
        if (!plan.ok) {
          throw new UserFacingError(`Stok ${line.name} di ${invoice.branch.name} tidak cukup (tersedia ${plan.available}).`);
        }
        for (const take of plan.takes) {
          if (!(await takeFromBatch(tx, take.batchId, take.quantity))) {
            throw new UserFacingError("Stok berubah saat difinalkan. Muat ulang halaman lalu coba lagi.");
          }
          const batch = batches.find((b) => b.id === take.batchId)!;
          batch.quantityRemaining -= take.quantity;
          await tx.invoiceStockUse.create({ data: { lineId: line.id, batchId: batch.id, quantity: take.quantity, unitCost: batch.unitCost } });
          await tx.stockMovement.create({
            data: {
              batchId: batch.id,
              kind: "KELUAR",
              quantity: -take.quantity,
              invoiceId,
              staffId: actor.staffId,
              staffName: actor.name,
            },
          });
        }
      }

      const year = Number(today.slice(0, 4));
      const number = formatInvoiceNumber(year, await nextInvoiceSequence(tx, year));
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "FINAL", number, finalizedAt: now, finalizedByName: actor.name, version: { increment: 1 } },
      });
      return { number, total: invoiceTotals({ ...invoice, status: "FINAL" }).total };
    });

    await recordAudit({
      actor,
      action: "invoice.finalize",
      entity: "Invoice",
      entityId: invoiceId,
      summary: `${result.number}: ${formatRupiah(result.total)}`,
    });
    revalidateLifecycle(invoiceId);
    return { number: result.number };
  });
}

/**
 * Batalkan tagihan (spec tagihan 5), alasan wajib; tidak pernah dihapus. Draf dan final tanpa
 * pembayaran: invoice:manage atau invoice:correct. Yang pernah dibayar hanya invoice:correct, dan
 * pembayaran aktifnya harus dibatalkan lebih dulu. Stok yang terambil dikembalikan lewat jurnal.
 */
export async function cancelInvoice(input: { invoiceId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:read");
    const canCorrect = can(actor.role, "invoice:correct");
    if (!can(actor.role, "invoice:manage") && !canCorrect) throw new UserFacingError("Anda tidak berhak membatalkan tagihan.");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const invoiceId = String(input?.invoiceId ?? "");

    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          status: true,
          number: true,
          patient: { select: { name: true } },
          payments: { select: { revokedAt: true } },
          lines: { select: { stockUses: { select: { batchId: true, quantity: true } } } },
        },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status === "DIBATALKAN") throw new UserFacingError("Tagihan ini sudah dibatalkan.");
      if (invoice.payments.some((payment) => payment.revokedAt === null)) {
        throw new UserFacingError("Batalkan pembayarannya dulu (oleh Admin Keuangan), lalu batalkan tagihan.");
      }
      if (invoice.payments.length > 0 && !canCorrect) {
        throw new UserFacingError("Tagihan ini pernah dibayar. Pembatalan dilakukan oleh Admin Keuangan.");
      }

      for (const use of invoice.lines.flatMap((line) => line.stockUses)) {
        await tx.stockBatch.update({ where: { id: use.batchId }, data: { quantityRemaining: { increment: use.quantity } } });
        await tx.stockMovement.create({
          data: {
            batchId: use.batchId,
            kind: "PENYESUAIAN",
            quantity: use.quantity,
            reason: "LAINNYA",
            note: `Tagihan ${invoice.number} dibatalkan`,
            invoiceId,
            staffId: actor.staffId,
            staffName: actor.name,
          },
        });
      }
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "DIBATALKAN", cancelledAt: new Date(), cancelledByName: actor.name, cancelReason: reason.value },
      });
      return `${invoice.number ?? "Draf"} ${invoice.patient.name}: ${reason.value}`;
    });

    await recordAudit({ actor, action: "invoice.cancel", entity: "Invoice", entityId: invoiceId, summary });
    revalidateLifecycle(invoiceId);
  });
}
```

Run: `npm run test:integration -- tests/integration/invoice-lifecycle.test.ts tests/integration/invoice-draft.test.ts tests/integration/invoice-create.test.ts`
Expected: PASS semua.

- [ ] **Step 3: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t5.log" 2>&1; grep -E "Test Files|Tests " "$WS/t5.log"; npx eslint src/server/invoice-lifecycle.ts tests/integration/invoice-lifecycle.test.ts; npx tsc --noEmit -p . > "$WS/t5-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/invoice-lifecycle.ts tests/integration/invoice-lifecycle.test.ts
git commit -m "feat: finalize invoices with FEFO stock-out and numbering, and cancel invoices with stock returned"
```

---

### Task 6: Server — pembayaran customer, pembatalan pembayaran, dan diskon sesudah final

**Files:**
- Create: `src/server/invoice-payments.ts`
- Test: `tests/integration/invoice-payments.test.ts`

**Interfaces:**
- Consumes: Task 2 (`validateInvoicePayment`, `validateDiscount`, `invoiceTotals`, `invoiceSubtotal`, `discountAmount`, `INVOICE_STATUS_LABEL`), Task 3 (`lockInvoiceRow`, `TOTALS_SELECT`, `getInvoiceDetail`), Task 4 (`createDirectSale`, `addFreeLine`), Task 5 (`finalizeInvoice`), sub-proyek stok (`dateOnly`, `dateOnlyString`, `validateReason`, `PAYMENT_METHOD_LABEL`).
- Produces (`invoice-payments.ts`, `"use server"`):
  - `recordInvoicePayment(input: InvoicePaymentInput): Promise<ActionResult<{ id: string }>>` (`invoice:manage`);
  - `revokeInvoicePayment(input: { paymentId: string; reason: string }): Promise<ActionResult<void>>` (`invoice:correct`);
  - `applyFinalDiscount(input: { invoiceId: string; kind: "NOMINAL" | "PERSEN"; value: number; reason: string }): Promise<ActionResult<void>>` (`invoice:correct`);
  - audit: `invoice-payment.create`, `invoice-payment.revoke`, `invoice.discount`.

- [ ] **Step 1: Tulis uji integrasi (gagal)**

Buat `tests/integration/invoice-payments.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { InvoicePaymentInput } from "@/lib/invoice";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { applyFinalDiscount, recordInvoicePayment, revokeInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
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

const SLUG = "bayar-tagihan";
const WA = "6281200008840";
const today = witaDateString(new Date());

describe("pembayaran customer", () => {
  let world: BillingWorld;

  /** Tagihan final Rp 100.000 (satu baris bebas). */
  async function finalInvoice(price = 100000) {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    const { version } = await unwrap(addFreeLine({ invoiceId: id, version: 1, kind: "LAYANAN", name: "Layanan Uji", quantity: 1, unitPrice: price }));
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    return id;
  }
  const pay = (invoiceId: string, patch: Partial<InvoicePaymentInput> = {}) =>
    recordInvoicePayment({ invoiceId, amount: 40000, method: "TUNAI", paidAt: today, reference: "", ...patch });

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

  it("bayar sebagian lalu lunas; nominal di atas sisa ditolak", async () => {
    const id = await finalInvoice();
    const first = await unwrap(pay(id, { reference: "KW-1" }));
    expect((await getInvoiceDetail(id))?.totals).toMatchObject({ paid: 40000, balance: 60000, display: "SEBAGIAN" });
    expect(await pay(id, { amount: 60001 })).toEqual({ ok: false, error: "Nominal melebihi sisa tagihan (Rp 60.000)." });
    const second = await unwrap(pay(id, { amount: 60000, method: "QRIS" }));
    expect((await getInvoiceDetail(id))?.totals).toMatchObject({ balance: 0, display: "LUNAS" });
    expect(await pay(id, { amount: 1 })).toEqual({ ok: false, error: "Tagihan ini tidak punya sisa." });

    const payments = (await getInvoiceDetail(id))!.payments;
    expect(payments.map((p) => [p.amount, p.method, p.reference])).toEqual([
      [40000, "TUNAI", "KW-1"],
      [60000, "QRIS", null],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "invoice-payment.create", entityId: { in: [first.id, second.id] } } })).toBe(2);
  });

  it("dua pembayaran bersamaan yang masing-masing melunasi: hanya satu diterima", async () => {
    const id = await finalInvoice();
    const results = await Promise.all([pay(id, { amount: 100000 }), pay(id, { amount: 100000 })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Tagihan ini tidak punya sisa." });
    expect(await prisma.invoicePayment.count({ where: { invoiceId: id, revokedAt: null } })).toBe(1);
  });

  it("hanya tagihan final yang bisa dibayar", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    const message = "Tagihan ini belum final atau sudah dibatalkan.";
    expect(await pay(id)).toEqual({ ok: false, error: message });
    const final = await finalInvoice();
    await unwrap(cancelInvoice({ invoiceId: final, reason: "Salah" }));
    expect(await pay(final)).toEqual({ ok: false, error: message });
    expect(await pay("tidak-ada")).toEqual({ ok: false, error: "Tagihan tidak ditemukan." });
  });

  it("menolak tanggal bayar di masa depan atau sebelum tagihan difinalkan, dan permintaan buatan", async () => {
    const id = await finalInvoice();
    expect(await pay(id, { paidAt: addDaysToDateString(today, 1) })).toEqual({ ok: false, error: "Tanggal bayar tidak boleh di masa depan." });
    expect(await pay(id, { paidAt: addDaysToDateString(today, -1) })).toEqual({
      ok: false,
      error: "Tanggal bayar tidak boleh sebelum tagihan difinalkan.",
    });
    expect(await pay(id, { paidAt: "2026-02-31" })).toEqual({ ok: false, error: "Isi tanggal bayar." });
    expect(await pay(id, { amount: 0 })).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await pay(id, { amount: 1000.5 })).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await pay(id, { method: "CEK" as never })).toEqual({ ok: false, error: "Pilih metode pembayaran." });
    expect(await prisma.invoicePayment.count({ where: { invoiceId: id } })).toBe(0);
  });

  it("batalkan pembayaran: hanya Admin Keuangan; sisa kembali; tidak bisa dua kali", async () => {
    const id = await finalInvoice();
    const { id: paymentId } = await unwrap(pay(id, { amount: 100000 }));
    await expect(revokeInvoicePayment({ paymentId, reason: "Salah catat" })).rejects.toThrow(/forbidden: invoice:correct/);

    actor.role = "ADMIN_KEUANGAN";
    expect(await revokeInvoicePayment({ paymentId, reason: " " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(revokeInvoicePayment({ paymentId, reason: "Nominal salah catat" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ totals: { paid: 0, balance: 100000, display: "BELUM_DIBAYAR" } });
    expect(await prisma.invoicePayment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({
      revokedByName: "Resepsionis Uji",
      revokeReason: "Nominal salah catat",
    });
    expect(await revokeInvoicePayment({ paymentId, reason: "lagi" })).toEqual({ ok: false, error: "Pembayaran ini sudah dibatalkan." });
    expect(await revokeInvoicePayment({ paymentId: "tidak-ada", reason: "x" })).toEqual({ ok: false, error: "Pembayaran tidak ditemukan." });
    expect(await prisma.auditLog.count({ where: { action: "invoice-payment.revoke", entityId: paymentId } })).toBe(1);
  });

  it("diskon sesudah final: hanya Admin Keuangan, tambahan saja, dan tidak di bawah yang sudah dibayar", async () => {
    const id = await finalInvoice();
    await unwrap(pay(id, { amount: 30000 }));
    await expect(applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 30, reason: "Kebijakan" })).rejects.toThrow(/forbidden: invoice:correct/);

    actor.role = "ADMIN_KEUANGAN";
    await unwrap(applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 30, reason: "Kompensasi keluhan" }));
    expect(await getInvoiceDetail(id)).toMatchObject({
      discountKind: "PERSEN",
      discountValue: 30,
      discountReason: "Kompensasi keluhan",
      totals: { discount: 30000, total: 70000, balance: 40000 },
    });
    expect(await applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 20, reason: "Turun" })).toEqual({
      ok: false,
      error: "Diskon sesudah final hanya bisa ditambah.",
    });
    expect(await applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 80, reason: "Terlalu besar" })).toEqual({
      ok: false,
      error: "Diskon membuat total di bawah yang sudah dibayar.",
    });
    expect(await applyFinalDiscount({ invoiceId: id, kind: "NOMINAL", value: 5000, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon sesudah final hanya bisa ditambah.",
    });
    expect(await prisma.auditLog.count({ where: { action: "invoice.discount", entityId: id } })).toBe(1);
  });

  it("diskon yang membuat sisa 0 melunasi tagihan; tagihan lunas atau draf tidak bisa diberi diskon", async () => {
    const id = await finalInvoice();
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 100, reason: "Pembebasan biaya" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ totals: { total: 0, display: "LUNAS" } });
    expect(await applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 100, reason: "lagi" })).toEqual({
      ok: false,
      error: "Tagihan ini sudah lunas.",
    });
    actor.role = "RESEPSIONIS";
    const { id: draftId } = await unwrap(createDirectSale({ patientId: world.patientId }));
    actor.role = "ADMIN_KEUANGAN";
    expect(await applyFinalDiscount({ invoiceId: draftId, kind: "PERSEN", value: 10, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon sesudah final hanya untuk tagihan yang sudah final.",
    });
  });

  it("hak akses: Admin Keuangan tidak mencatat pembayaran; Dokter dan Apoteker tidak menyentuh uang", async () => {
    const id = await finalInvoice();
    actor.role = "ADMIN_KEUANGAN";
    await expect(pay(id)).rejects.toThrow(/forbidden: invoice:manage/);
    for (const role of ["DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      await expect(pay(id)).rejects.toThrow(/forbidden: invoice:manage/);
      await expect(applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 5, reason: "x" })).rejects.toThrow(/forbidden: invoice:correct/);
    }
  });
});
```

Run: `npm run test:integration -- tests/integration/invoice-payments.test.ts`
Expected: FAIL, karena modul `@/server/invoice-payments` tidak ditemukan.

- [ ] **Step 2: Aksi pembayaran dan diskon**

Buat `src/server/invoice-payments.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { discountAmount, invoiceSubtotal, invoiceTotals, validateDiscount, validateInvoicePayment, type DiscountKindValue, type InvoicePaymentInput } from "@/lib/invoice";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, PAYMENT_METHOD_LABEL, validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { lockInvoiceRow, TOTALS_SELECT } from "@/server/invoice-store";
import { requireCapability } from "@/server/session";

function revalidatePayments(invoiceId: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

/**
 * Catat pembayaran customer (spec tagihan 4.4). Batasnya sisa tagihan saat ini, dihitung setelah
 * tagihan dikunci: dua pembayaran bersamaan tidak bisa sama-sama melunasi.
 */
export async function recordInvoicePayment(input: InvoicePaymentInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const today = witaDateString(new Date());

    const result = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { number: true, finalizedAt: true, patient: { select: { name: true } }, ...TOTALS_SELECT },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status !== "FINAL" || !invoice.finalizedAt) throw new UserFacingError("Tagihan ini belum final atau sudah dibatalkan.");
      const { balance } = invoiceTotals(invoice);
      const checked = validateInvoicePayment(input, { today, finalizedDate: witaDateString(invoice.finalizedAt), limit: balance });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const payment = checked.value;
      const created = await tx.invoicePayment.create({
        data: {
          invoiceId,
          amount: payment.amount,
          method: payment.method,
          paidAt: dateOnly(payment.paidAt),
          reference: payment.reference,
          staffId: actor.staffId,
          staffName: actor.name,
        },
        select: { id: true },
      });
      return { id: created.id, summary: `${invoice.number} ${invoice.patient.name}: ${formatRupiah(payment.amount)} (${PAYMENT_METHOD_LABEL[payment.method]})` };
    });

    await recordAudit({ actor, action: "invoice-payment.create", entity: "InvoicePayment", entityId: result.id, summary: result.summary });
    revalidatePayments(invoiceId);
    return { id: result.id };
  });
}

/** Batalkan pembayaran salah input (spec tagihan 5): tidak dihapus, ditandai dibatalkan beserta alasannya. */
export async function revokeInvoicePayment(input: { paymentId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:correct");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.paymentId ?? "");
    const payment = await prisma.invoicePayment.findUnique({
      where: { id },
      select: { invoiceId: true, amount: true, invoice: { select: { number: true } } },
    });
    if (!payment) throw new UserFacingError("Pembayaran tidak ditemukan.");

    await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, payment.invoiceId);
      const { count } = await tx.invoicePayment.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date(), revokedByName: actor.name, revokeReason: reason.value },
      });
      if (count === 0) throw new UserFacingError("Pembayaran ini sudah dibatalkan.");
    });

    await recordAudit({
      actor,
      action: "invoice-payment.revoke",
      entity: "InvoicePayment",
      entityId: id,
      summary: `${payment.invoice.number}: ${formatRupiah(payment.amount)} (${reason.value})`,
    });
    revalidatePayments(payment.invoiceId);
  });
}

/**
 * Tambah diskon di tagihan final yang belum lunas (spec tagihan 5): hanya menambah, dan total tidak
 * boleh turun di bawah yang sudah dibayar. Diskon yang membuat sisa 0 melunasi tagihan.
 */
export async function applyFinalDiscount(input: {
  invoiceId: string;
  kind: DiscountKindValue;
  value: number;
  reason: string;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:correct");
    const invoiceId = String(input?.invoiceId ?? "");

    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { number: true, ...TOTALS_SELECT },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status !== "FINAL") throw new UserFacingError("Diskon sesudah final hanya untuk tagihan yang sudah final.");
      const totals = invoiceTotals(invoice);
      if (totals.display === "LUNAS") throw new UserFacingError("Tagihan ini sudah lunas.");

      const subtotal = invoiceSubtotal(invoice.lines);
      const checked = validateDiscount(input, { subtotal, canExceed: true });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const discount = checked.value;
      if (!discount.kind) throw new UserFacingError("Pilih jenis dan nilai diskon.");
      const amount = discountAmount(subtotal, discount.kind, discount.value);
      if (amount <= totals.discount) throw new UserFacingError("Diskon sesudah final hanya bisa ditambah.");
      if (subtotal - amount < totals.paid) throw new UserFacingError("Diskon membuat total di bawah yang sudah dibayar.");

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { discountKind: discount.kind, discountValue: discount.value, discountReason: discount.reason, discountByName: actor.name },
      });
      return `${invoice.number}: diskon ${discount.value}${discount.kind === "PERSEN" ? "%" : ""} sesudah final (${discount.reason})`;
    });

    await recordAudit({ actor, action: "invoice.discount", entity: "Invoice", entityId: invoiceId, summary });
    revalidatePayments(invoiceId);
  });
}
```

Run: `npm run test:integration -- tests/integration/invoice-payments.test.ts tests/integration/invoice-lifecycle.test.ts`
Expected: PASS semua.

- [ ] **Step 3: Unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t6.log" 2>&1; grep -E "Test Files|Tests " "$WS/t6.log"; npx eslint src/server/invoice-payments.ts tests/integration/invoice-payments.test.ts; npx tsc --noEmit -p . > "$WS/t6-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: semua PASS, eslint bersih, `tsc exit 0`.

```bash
git add src/server/invoice-payments.ts tests/integration/invoice-payments.test.ts
git commit -m "feat: record, revoke, and discount customer invoice payments with row locking"
```

---

### Task 7: UI — daftar tagihan, "Perlu ditagih", buat tagihan, penjualan langsung

**Files:**
- Create: `src/components/admin/billing/invoice-status-badge.tsx`, `invoice-table.tsx`, `billable-table.tsx`, `create-invoice-button.tsx`, `direct-sale-dialog.tsx`
- Create: `src/app/(admin)/admin/tagihan/page.tsx`
- Test: `tests/unit/billing-list.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`INVOICE_STATUS_LABEL`, `INVOICE_VIEW_LABEL`, `INVOICE_VIEWS`, `isInvoiceView`, `InvoiceDisplayStatus`), Task 3 (`listInvoices`, `listBillableVisits`, `countBillable`, `InvoiceRow`, `BillableVisit`, `createInvoiceFromVisit`, `createDirectSale`), `PatientPicker` (`onSelect(patient: PatientSummary)`), `PageTabs`, `StatTile`, `EmptyState`, `SectionCard`.
- Produces: halaman `/admin/tagihan?lihat=<InvoiceView>&q=<cari>` (bawaan `PERLU_DITAGIH`), komponen `InvoiceStatusBadge({ status })`, `InvoiceTable({ rows })`, `BillableTable({ rows, canManage })`, `CreateInvoiceButton({ appointmentId })`, `DirectSaleDialog()`.

- [ ] **Step 1: Tulis uji komponen (gagal)**

Buat `tests/unit/billing-list.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillableTable } from "@/components/admin/billing/billable-table";
import { InvoiceStatusBadge } from "@/components/admin/billing/invoice-status-badge";
import { InvoiceTable } from "@/components/admin/billing/invoice-table";
import type { BillableVisit, InvoiceRow } from "@/server/invoice-read";

const { push, refresh, createFromVisit } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createFromVisit: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/server/invoice-drafts", () => ({ createInvoiceFromVisit: createFromVisit, createDirectSale: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row = (patch: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: "i1",
  number: "TG-2026-0001",
  createdAt: new Date("2026-10-07T03:00:00Z"),
  patientId: "p1",
  patientName: "Ani Uji",
  branchName: "Manado",
  display: "SEBAGIAN",
  total: 100000,
  balance: 60000,
  lineCount: 2,
  ...patch,
});
const visit = (patch: Partial<BillableVisit> = {}): BillableVisit => ({
  appointmentId: "a1",
  patientId: "p1",
  patientName: "Budi Uji",
  medicalRecordNumber: "RM-001",
  branchName: "Manado",
  serviceName: "Konsultasi Gizi",
  finalizedAt: new Date("2026-10-07T03:00:00Z"),
  treatmentCount: 2,
  online: false,
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("daftar tagihan", () => {
  it("menampilkan nomor, pasien, total, sisa, dan status; draf tanpa nomor", () => {
    render(<InvoiceTable rows={[row(), row({ id: "i2", number: null, display: "DRAF", patientName: "Citra Uji", balance: 50000 })]} />);
    expect(screen.getByRole("link", { name: "TG-2026-0001" })).toHaveAttribute("href", "/admin/tagihan/i1");
    expect(screen.getByText("Ani Uji")).toBeInTheDocument();
    expect(screen.getByText("Sebagian")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Draf" })).toHaveAttribute("href", "/admin/tagihan/i2");
  });

  it("kosong menampilkan keterangan", () => {
    render(<InvoiceTable rows={[]} />);
    expect(screen.getByText("Tidak ada tagihan di tampilan ini.")).toBeInTheDocument();
  });

  it("label status", () => {
    render(<InvoiceStatusBadge status="LUNAS" />);
    expect(screen.getByText("Lunas")).toBeInTheDocument();
  });
});

describe("perlu ditagih", () => {
  it("resepsionis menekan Buat tagihan: tagihan dibuat lalu halaman draf dibuka", async () => {
    createFromVisit.mockResolvedValue({ ok: true, data: { id: "inv9", existing: false } });
    render(<BillableTable rows={[visit()]} canManage />);
    expect(screen.getByText("Budi Uji")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Buat tagihan Budi Uji" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/tagihan/inv9"));
    expect(createFromVisit).toHaveBeenCalledWith("a1");
  });

  it("tagihan sudah ada (dibuat orang lain): tetap membuka tagihan itu", async () => {
    createFromVisit.mockResolvedValue({ ok: true, data: { id: "inv1", existing: true } });
    render(<BillableTable rows={[visit()]} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Buat tagihan Budi Uji" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/tagihan/inv1"));
  });

  it("Admin Keuangan hanya melihat: tanpa tombol buat tagihan", () => {
    render(<BillableTable rows={[visit({ online: true })]} canManage={false} />);
    expect(screen.queryByRole("button", { name: /Buat tagihan/ })).toBeNull();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("kegagalan membuat tagihan ditampilkan, tidak berpindah halaman", async () => {
    createFromVisit.mockResolvedValue({ ok: false, error: "Kunjungan ini belum final." });
    render(<BillableTable rows={[visit()]} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Buat tagihan Budi Uji" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kunjungan ini belum final.");
    expect(push).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run tests/unit/billing-list.test.tsx`
Expected: FAIL (modul komponen belum ada).

- [ ] **Step 2: Komponen daftar**

`src/components/admin/billing/invoice-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_LABEL, type InvoiceDisplayStatus } from "@/lib/invoice";

/** Status tampil tagihan (spec tagihan 3.2). */
export function InvoiceStatusBadge({ status }: { status: InvoiceDisplayStatus }) {
  const variant = status === "LUNAS" ? "default" : status === "DIBATALKAN" ? "destructive" : "outline";
  return <Badge variant={variant}>{INVOICE_STATUS_LABEL[status]}</Badge>;
}
```

`src/components/admin/billing/invoice-table.tsx`:

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import type { InvoiceRow } from "@/server/invoice-read";
import { EmptyState } from "../page-layout";
import { InvoiceStatusBadge } from "./invoice-status-badge";

/** Daftar tagihan (spec tagihan 4.1). */
export function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada tagihan di tampilan ini.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tagihan</TableHead>
          <TableHead>Pasien</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Sisa</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/admin/tagihan/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.number ?? "Draf"}
              </Link>
              <div className="text-xs text-muted-foreground">{formatDateWithYear(row.createdAt)}</div>
            </TableCell>
            <TableCell>{row.patientName}</TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="text-right">{formatRupiah(row.total)}</TableCell>
            <TableCell className="text-right font-medium">{formatRupiah(row.balance)}</TableCell>
            <TableCell>
              <InvoiceStatusBadge status={row.display} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

`src/components/admin/billing/create-invoice-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createInvoiceFromVisit } from "@/server/invoice-drafts";

/** Buat tagihan dari kunjungan final; bila sudah ada (dibuat orang lain), buka tagihan itu. */
export function CreateInvoiceButton({ appointmentId, patientName }: { appointmentId: string; patientName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createInvoiceFromVisit(appointmentId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/admin/tagihan/${result.data.id}`);
      } catch {
        setError("Gagal membuat tagihan. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" onClick={create} disabled={pending} aria-label={`Buat tagihan ${patientName}`}>
        {pending ? "Membuat…" : "Buat tagihan"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

`src/components/admin/billing/billable-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear } from "@/lib/format";
import type { BillableVisit } from "@/server/invoice-read";
import { EmptyState } from "../page-layout";
import { CreateInvoiceButton } from "./create-invoice-button";

/** Kunjungan final 30 hari terakhir yang belum punya tagihan aktif (spec tagihan 4.1). */
export function BillableTable({ rows, canManage }: { rows: BillableVisit[]; canManage: boolean }) {
  if (rows.length === 0) return <EmptyState>Semua kunjungan sudah ditagih.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Selesai</TableHead>
          <TableHead>Pasien</TableHead>
          <TableHead>Layanan</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Treatment</TableHead>
          {canManage && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.appointmentId}>
            <TableCell className="whitespace-nowrap">{formatDateWithYear(row.finalizedAt)}</TableCell>
            <TableCell>
              {row.patientName}
              <div className="text-xs text-muted-foreground">{row.medicalRecordNumber}</div>
            </TableCell>
            <TableCell>
              {row.serviceName ?? "-"} {row.online && <Badge variant="outline">Online</Badge>}
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="text-right">{row.treatmentCount}</TableCell>
            {canManage && (
              <TableCell className="text-right">
                <CreateInvoiceButton appointmentId={row.appointmentId} patientName={row.patientName} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

`src/components/admin/billing/direct-sale-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createDirectSale } from "@/server/invoice-drafts";
import { PatientPicker } from "../patient-picker";

/** Penjualan langsung tanpa kunjungan (spec tagihan 4.1): pilih pasien, lalu tagihan draf kosong terbuka. */
export function DirectSaleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(patient: { id: string }) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createDirectSale({ patientId: patient.id });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.push(`/admin/tagihan/${result.data.id}`);
      } catch {
        setError("Gagal membuat tagihan. Coba lagi.");
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
          + Penjualan langsung
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Penjualan langsung</DialogTitle>
          <DialogDescription>Untuk obat atau produk yang dibeli tanpa kunjungan. Pilih pasien dulu.</DialogDescription>
        </DialogHeader>
        <PatientPicker onSelect={choose} />
        {pending && <p className="text-sm text-muted-foreground">Membuat tagihan…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Halaman daftar**

`src/app/(admin)/admin/tagihan/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { BillableTable } from "@/components/admin/billing/billable-table";
import { DirectSaleDialog } from "@/components/admin/billing/direct-sale-dialog";
import { InvoiceTable } from "@/components/admin/billing/invoice-table";
import { PageTabs } from "@/components/admin/page-tabs";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { INVOICE_VIEW_LABEL, INVOICE_VIEWS, isInvoiceView, type InvoiceView } from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { listBillableVisits, listInvoices } from "@/server/invoice-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Tagihan" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ lihat?: string; q?: string }> }) {
  const staff = await requireCapability("invoice:read");
  const params = await searchParams;
  const view: InvoiceView = isInvoiceView(params.lihat) ? params.lihat : "PERLU_DITAGIH";
  const q = params.q?.trim() || undefined;
  const canManage = can(staff.role, "invoice:manage");
  const rows = view === "PERLU_DITAGIH" ? null : await listInvoices({ view, q });
  const billable = view === "PERLU_DITAGIH" ? await listBillableVisits() : null;

  return (
    <>
      <AdminHeader title="Tagihan" />
      <PageBody>
        <PageHeader
          title="Tagihan"
          description="Tagihan customer dari kunjungan dan penjualan langsung."
          actions={canManage ? <DirectSaleDialog /> : undefined}
        />
        <PageTabs
          label="Tampilan tagihan"
          active={view}
          tabs={INVOICE_VIEWS.map((value) => ({
            id: value,
            label: INVOICE_VIEW_LABEL[value],
            href: value === "PERLU_DITAGIH" ? "/admin/tagihan" : `/admin/tagihan?lihat=${value}`,
          }))}
        />
        {view === "PERLU_DITAGIH" ? (
          <SectionCard title="Perlu ditagih" flush>
            <BillableTable rows={billable ?? []} canManage={canManage} />
          </SectionCard>
        ) : (
          <SectionCard title={INVOICE_VIEW_LABEL[view]} flush>
            <InvoiceTable rows={rows ?? []} />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}
```

Run: `npx vitest run tests/unit/billing-list.test.tsx && npx eslint src/components/admin/billing "src/app/(admin)/admin/tagihan" tests/unit/billing-list.test.tsx && npx tsc --noEmit -p . > "$WS/t7-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: PASS semua uji, eslint bersih, `tsc exit 0`. (Jika `INVOICE_STATUS_LABEL.SEBAGIAN` bukan "Sebagian", sesuaikan teks uji dengan label di Task 2, bukan sebaliknya.)

- [ ] **Step 4: Uji arsitektur dan commit**

Run: `npx vitest run tests/unit/architecture.test.ts` (atau nama berkas uji arsitektur yang ada: `grep -l "@/lib/db" tests/unit/*.ts`)
Expected: PASS.

```bash
git add src/components/admin/billing src/app/\(admin\)/admin/tagihan tests/unit/billing-list.test.tsx
git commit -m "feat: add invoice list, billable visits, and direct sale entry"
```

---

### Task 8: UI — editor draf tagihan (baris, barang, baris bebas, diskon, finalkan)

**Files:**
- Create: `src/components/admin/billing/invoice-draft-editor.tsx`, `add-item-dialog.tsx`, `add-free-line-dialog.tsx`, `discount-form.tsx`
- Create: `src/app/(admin)/admin/tagihan/[id]/page.tsx` (cabang draf; cabang final ditambah di Task 9)
- Test: `tests/unit/invoice-draft-editor.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`getInvoiceDetail`, `listBillingItems`, `InvoiceDetail`, `BillingItem`), Task 4 (`addInvoiceItem`, `addFreeLine`, `updateInvoiceLine`, `removeInvoiceLine`, `refreshCatalogPrices`, `setInvoiceDiscount`), Task 5 (`finalizeInvoice`, `cancelInvoice`), Task 2 (`validateLineEdit`, `validateDiscount`, `validateFreeLine`, `DISCOUNT_LIMIT_PERCENT`, `discountLimit`, `invoiceTotals`).
- Produces: `InvoiceDraftEditor({ detail, items, canExceedDiscount })`; halaman `/admin/tagihan/[id]`. Editor memakai `detail.version` dari props (halaman dimuat ulang lewat `router.refresh()` setelah tiap aksi); pesan versi usang tampil apa adanya.

- [ ] **Step 1: Tulis uji editor (gagal)**

Buat `tests/unit/invoice-draft-editor.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDraftEditor } from "@/components/admin/billing/invoice-draft-editor";
import { invoiceTotals } from "@/lib/invoice";
import type { InvoiceDetail } from "@/server/invoice-read";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  updateInvoiceLine: vi.fn(),
  removeInvoiceLine: vi.fn(),
  setInvoiceDiscount: vi.fn(),
  finalizeInvoice: vi.fn(),
  addInvoiceItem: vi.fn(),
  addFreeLine: vi.fn(),
  refreshCatalogPrices: vi.fn(),
  cancelInvoice: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/invoice-drafts", () => ({
  updateInvoiceLine: mocks.updateInvoiceLine,
  removeInvoiceLine: mocks.removeInvoiceLine,
  setInvoiceDiscount: mocks.setInvoiceDiscount,
  addInvoiceItem: mocks.addInvoiceItem,
  addFreeLine: mocks.addFreeLine,
  refreshCatalogPrices: mocks.refreshCatalogPrices,
}));
vi.mock("@/server/invoice-lifecycle", () => ({ finalizeInvoice: mocks.finalizeInvoice, cancelInvoice: mocks.cancelInvoice }));

function detail(patch: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const lines: InvoiceDetail["lines"] = [
    { id: "l1", kind: "LAYANAN", name: "Konsultasi Gizi", quantity: 1, unitPrice: 150000, amount: 150000, priceNote: null, serviceId: "s1", itemId: null, catalogLinked: true, cost: null },
    { id: "l2", kind: "BARANG", name: "Vitamin C", quantity: 2, unitPrice: 25000, amount: 50000, priceNote: null, serviceId: null, itemId: "it1", catalogLinked: true, cost: null },
  ];
  const base = { status: "DRAF" as const, discountKind: null, discountValue: 0, lines, payments: [] };
  return {
    id: "inv1",
    number: null,
    status: "DRAF",
    version: 3,
    patient: { id: "p1", name: "Ani Uji", medicalRecordNumber: "RM-001" },
    branchId: "b1",
    branchName: "Manado",
    appointmentId: "a1",
    visitDate: new Date("2026-10-07T03:00:00Z"),
    discountKind: null,
    discountValue: 0,
    discountReason: null,
    discountByName: null,
    totals: invoiceTotals(base),
    notes: null,
    createdByName: "Resepsionis Uji",
    createdAt: new Date("2026-10-07T03:00:00Z"),
    finalizedAt: null,
    finalizedByName: null,
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
    lines,
    payments: [],
    everPaid: false,
    cost: null,
    ...patch,
  };
}

const items = [{ id: "it1", code: "VIT-C", name: "Vitamin C", unit: "tablet", sellPrice: 25000, available: 40 }];

beforeEach(() => vi.clearAllMocks());

describe("editor draf tagihan", () => {
  it("menampilkan baris, subtotal, dan total", () => {
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    expect(screen.getByText("Konsultasi Gizi")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ringkasan tagihan" })).toHaveTextContent("Rp 200.000");
  });

  it("menyimpan perubahan jumlah dengan nomor versi tagihan", async () => {
    mocks.updateInvoiceLine.mockResolvedValue({ ok: true, data: { version: 4 } });
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    const qty = screen.getByLabelText("Jumlah Vitamin C");
    await userEvent.clear(qty);
    await userEvent.type(qty, "3");
    await userEvent.click(screen.getByRole("button", { name: "Simpan baris Vitamin C" }));
    await waitFor(() =>
      expect(mocks.updateInvoiceLine).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3, lineId: "l2", quantity: 3, unitPrice: 25000, priceNote: "" }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("harga katalog yang diubah tanpa catatan ditolak di layar sebelum dikirim", async () => {
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    const price = screen.getByLabelText("Harga Konsultasi Gizi");
    await userEvent.clear(price);
    await userEvent.type(price, "100000");
    await userEvent.click(screen.getByRole("button", { name: "Simpan baris Konsultasi Gizi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/catatan/i);
    expect(mocks.updateInvoiceLine).not.toHaveBeenCalled();
  });

  it("pesan versi usang dari server ditampilkan", async () => {
    mocks.removeInvoiceLine.mockResolvedValue({ ok: false, error: "Tagihan ini baru diubah orang lain. Muat ulang halaman." });
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Hapus Vitamin C" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Muat ulang halaman");
  });

  it("diskon resepsionis di atas 20% ditolak di layar; Admin Keuangan boleh", async () => {
    mocks.setInvoiceDiscount.mockResolvedValue({ ok: true, data: { version: 4 } });
    const { unmount } = render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.selectOptions(screen.getByLabelText("Jenis diskon"), "PERSEN");
    await userEvent.type(screen.getByLabelText("Nilai diskon"), "30");
    await userEvent.type(screen.getByLabelText("Alasan diskon"), "Kompensasi");
    await userEvent.click(screen.getByRole("button", { name: "Terapkan diskon" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/20%/);
    expect(mocks.setInvoiceDiscount).not.toHaveBeenCalled();
    unmount();

    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount />);
    await userEvent.selectOptions(screen.getByLabelText("Jenis diskon"), "PERSEN");
    await userEvent.type(screen.getByLabelText("Nilai diskon"), "30");
    await userEvent.type(screen.getByLabelText("Alasan diskon"), "Kompensasi");
    await userEvent.click(screen.getByRole("button", { name: "Terapkan diskon" }));
    await waitFor(() =>
      expect(mocks.setInvoiceDiscount).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3, kind: "PERSEN", value: 30, reason: "Kompensasi" }),
    );
  });

  it("finalkan: konfirmasi dulu, lalu memanggil server dengan versi", async () => {
    mocks.finalizeInvoice.mockResolvedValue({ ok: true, data: { number: "TG-2026-0001" } });
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Finalkan tagihan" }));
    const dialog = await screen.findByRole("dialog", { name: "Finalkan tagihan?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Finalkan" }));
    await waitFor(() => expect(mocks.finalizeInvoice).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3 }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("tagihan tanpa baris tidak bisa difinalkan", () => {
    const empty = detail({ lines: [], totals: invoiceTotals({ status: "DRAF", discountKind: null, discountValue: 0, lines: [], payments: [] }) });
    render(<InvoiceDraftEditor detail={empty} items={items} canExceedDiscount={false} />);
    expect(screen.getByRole("button", { name: "Finalkan tagihan" })).toBeDisabled();
  });
});
```

Run: `npx vitest run tests/unit/invoice-draft-editor.test.tsx`
Expected: FAIL (komponen belum ada).

- [ ] **Step 2: Komponen editor**

`src/components/admin/billing/invoice-draft-editor.tsx` (client). Satu `useTransition` bersama; helper `run(action, success?)` yang memanggil aksi, menampilkan `result.error` di `role="alert"` bila gagal, dan memanggil `router.refresh()` bila berhasil:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { INVOICE_LINE_KIND_LABEL, validateLineEdit } from "@/lib/invoice";
import type { ActionResult } from "@/lib/action-result";
import { removeInvoiceLine, refreshCatalogPrices, updateInvoiceLine } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import type { BillingItem, InvoiceDetail, InvoiceLineRow } from "@/server/invoice-read";
import { RupiahInput } from "../rupiah-input";
import { AddFreeLineDialog } from "./add-free-line-dialog";
import { AddItemDialog } from "./add-item-dialog";
import { CancelInvoiceDialog } from "./cancel-invoice-dialog";
import { DiscountForm } from "./discount-form";

/** Jalankan aksi server: tampilkan kesalahan apa adanya, muat ulang halaman bila berhasil. */
export function useInvoiceAction() {
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

function LineRow({ detail, line, disabled, run, fail }: {
  detail: InvoiceDetail;
  line: InvoiceLineRow;
  disabled: boolean;
  run: ReturnType<typeof useInvoiceAction>["run"];
  fail: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState<number | null>(line.quantity);
  const [unitPrice, setUnitPrice] = useState<number | null>(line.unitPrice);
  const [note, setNote] = useState(line.priceNote ?? "");
  const priceChanged = unitPrice !== line.unitPrice;

  function save() {
    const input = { quantity: quantity ?? Number.NaN, unitPrice: unitPrice ?? Number.NaN, priceNote: note };
    const checked = validateLineEdit(input, { needsNote: line.catalogLinked && priceChanged });
    if (!checked.ok) return fail(checked.message);
    run(() => updateInvoiceLine({ invoiceId: detail.id, version: detail.version, lineId: line.id, ...input }), () => toast.success("Baris disimpan."));
  }

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{line.name}</span>
        <div className="text-xs text-muted-foreground">{INVOICE_LINE_KIND_LABEL[line.kind]}</div>
        {priceChanged && line.catalogLinked && (
          <Input aria-label={`Catatan harga ${line.name}`} placeholder="Alasan harga diubah" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
        )}
      </TableCell>
      <TableCell className="w-24">
        <Input aria-label={`Jumlah ${line.name}`} type="number" min={1} value={quantity ?? ""} onChange={(e) => setQuantity(e.target.value === "" ? null : Number(e.target.value))} />
      </TableCell>
      <TableCell className="w-40">
        <RupiahInput aria-label={`Harga ${line.name}`} value={unitPrice} onChange={setUnitPrice} />
      </TableCell>
      <TableCell className="text-right">{formatRupiah(line.amount)}</TableCell>
      <TableCell className="space-x-1 whitespace-nowrap text-right">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={save} aria-label={`Simpan baris ${line.name}`}>
          Simpan
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Hapus ${line.name}`} onClick={() => run(() => removeInvoiceLine({ invoiceId: detail.id, version: detail.version, lineId: line.id }))}>
          Hapus
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Editor tagihan draf (spec tagihan 4.2–4.3): baris, barang, baris bebas, diskon, lalu finalkan. */
export function InvoiceDraftEditor({ detail, items, canExceedDiscount }: { detail: InvoiceDetail; items: BillingItem[]; canExceedDiscount: boolean }) {
  const { run, error, setError, pending } = useInvoiceAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { totals } = detail;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <AddItemDialog invoiceId={detail.id} version={detail.version} items={items} onError={setError} />
        <AddFreeLineDialog invoiceId={detail.id} version={detail.version} />
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => refreshCatalogPrices({ invoiceId: detail.id, version: detail.version }), (data) => toast.success(data.updated > 0 ? `${data.updated} harga diperbarui.` : "Harga sudah sesuai katalog."))}>
          Segarkan harga katalog
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Jumlah</TableHead>
            <TableHead>Harga</TableHead>
            <TableHead className="text-right">Jumlah harga</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                Belum ada baris. Tambah barang atau baris layanan.
              </TableCell>
            </TableRow>
          ) : (
            detail.lines.map((line) => <LineRow key={`${line.id}-${detail.version}`} detail={detail} line={line} disabled={pending} run={run} fail={setError} />)
          )}
        </TableBody>
      </Table>

      <DiscountForm detail={detail} canExceed={canExceedDiscount} run={run} fail={setError} disabled={pending} />

      <section aria-label="Ringkasan tagihan" className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatRupiah(totals.subtotal)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between"><span>Diskon</span><span>-{formatRupiah(totals.discount)}</span></div>}
        <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatRupiah(totals.total)}</span></div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <CancelInvoiceDialog invoiceId={detail.id} label="Draf" draft />
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button type="button" disabled={pending || detail.lines.length === 0}>
              Finalkan tagihan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Finalkan tagihan?</DialogTitle>
              <DialogDescription>Setelah final, baris dan harga terkunci, stok barang berkurang, dan tagihan bisa dibayar. Total {formatRupiah(totals.total)}.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" disabled={pending} onClick={() => run(() => finalizeInvoice({ invoiceId: detail.id, version: detail.version }), (data) => { setConfirmOpen(false); toast.success(`Tagihan ${data.number} final.`); })}>
                Finalkan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
```

Catatan untuk pelaksana: bila `RupiahInput` tidak meneruskan `aria-label` ke input-nya, tambahkan `aria-label` ke propsnya (lihat `src/components/admin/rupiah-input.tsx`; rencana stok sudah menghapus `aria-label` ganda, jadi pastikan hanya satu yang sampai ke `<input>`). Setelah finalisasi gagal karena stok kurang, pesan server (`STOCK_NOT_ENOUGH`) tampil di `role="alert"` di atas.

`src/components/admin/billing/discount-form.tsx` (client; `DiscountForm({ detail, canExceed, run, fail, disabled })`): select `Jenis diskon` (kosong/Nominal/Persen), `Nilai diskon` (number), `Alasan diskon`, tombol `Terapkan diskon` dan `Hapus diskon` (kirim `kind: null, value: 0, reason: ""`). Sebelum kirim, `validateDiscount({ kind, value, reason }, { subtotal: detail.totals.subtotal, canExceed })`; bila gagal → `fail(message)` (pesan Task 2 menyebut batas 20%). Bila lolos → `run(() => setInvoiceDiscount({ invoiceId: detail.id, version: detail.version, kind, value, reason }))`. Nilai awal diambil dari `detail.discountKind/discountValue/discountReason`.

`src/components/admin/billing/add-item-dialog.tsx` (client; `AddItemDialog({ invoiceId, version, items, onError })`): dialog "Tambah barang"; `select` `Barang` (opsi `"{name} ({code}) — sisa {available} {unit}"`, barang `available <= 0` nonaktif), input `Jumlah`; `Tambah` memanggil `addInvoiceItem({ invoiceId, version, itemId, quantity })`; gagal → `onError(error)` dan dialog tutup; sukses → `router.refresh()`.

`src/components/admin/billing/add-free-line-dialog.tsx` (client; `AddFreeLineDialog({ invoiceId, version })`): dialog "Tambah baris layanan"; `select` `Jenis` (Layanan/Treatment), `Nama`, `Jumlah`, `Harga` (`RupiahInput`); validasi lokal `validateFreeLine`; memanggil `addFreeLine({ invoiceId, version, kind, name, quantity, unitPrice })`; galat server tampil di dalam dialog (`role="alert"`).

`src/components/admin/billing/cancel-invoice-dialog.tsx` dibuat di Task 9; untuk Task 8 buat sekarang versi lengkapnya (dipakai kedua task): client; `CancelInvoiceDialog({ invoiceId, label, draft })`: tombol "Batalkan tagihan" (untuk draf: "Buang draf"), dialog dengan `Alasan` (`validateReason`), memanggil `cancelInvoice({ invoiceId, reason })`, sukses → toast + `router.refresh()`; galat server (mis. "sudah ada pembayaran") tampil di dialog. Pola kode sama dengan `revoke-payment-dialog.tsx`.

- [ ] **Step 3: Halaman detail (cabang draf)**

`src/app/(admin)/admin/tagihan/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { InvoiceDraftEditor } from "@/components/admin/billing/invoice-draft-editor";
import { InvoiceStatusBadge } from "@/components/admin/billing/invoice-status-badge";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { can } from "@/lib/permissions";
import { getInvoiceDetail, listBillingItems } from "@/server/invoice-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Tagihan" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("invoice:read");
  const detail = await getInvoiceDetail((await params).id);
  if (!detail) notFound();
  const canManage = can(staff.role, "invoice:manage");

  return (
    <>
      <AdminHeader title="Tagihan" />
      <PageBody>
        <PageHeader
          title={detail.number ? `Tagihan ${detail.number}` : "Tagihan (draf)"}
          trail={[{ label: "Tagihan", href: "/admin/tagihan" }, { label: detail.number ?? "Draf" }]}
          description={`${detail.patient.name} · ${detail.patient.medicalRecordNumber} · ${detail.branchName}`}
          actions={<InvoiceStatusBadge status={detail.totals.display} />}
        />
        {detail.status === "DRAF" ? (
          canManage ? (
            <InvoiceDraftEditor detail={detail} items={await listBillingItems(detail.branchId)} canExceedDiscount={can(staff.role, "invoice:correct")} />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">Tagihan ini masih draf; hanya resepsionis yang bisa mengubahnya.</p>
          )
        ) : null}
      </PageBody>
    </>
  );
}
```

Run: `npx vitest run tests/unit/invoice-draft-editor.test.tsx && npx eslint src/components/admin/billing "src/app/(admin)/admin/tagihan" tests/unit/invoice-draft-editor.test.tsx && npx tsc --noEmit -p . > "$WS/t8-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: PASS semua, eslint bersih, `tsc exit 0`.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/billing src/app/\(admin\)/admin/tagihan tests/unit/invoice-draft-editor.test.tsx
git commit -m "feat: add invoice draft editor with lines, items, discount, and finalize"
```

---

### Task 9: UI — tampilan final: pembayaran, batal pembayaran, diskon, batalkan, cetak

**Files:**
- Create: `src/components/admin/billing/invoice-final-view.tsx`, `invoice-payment-dialog.tsx`, `revoke-invoice-payment-dialog.tsx`, `final-discount-dialog.tsx`
- Modify: `src/app/(admin)/admin/tagihan/[id]/page.tsx` (cabang final/batal), `src/app/globals.css` (cetak)
- Test: `tests/unit/invoice-final-view.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`recordInvoicePayment`, `revokeInvoicePayment`, `applyFinalDiscount`), Task 8 (`CancelInvoiceDialog`, `InvoiceStatusBadge`), Task 2 (`validateInvoicePayment`, `validateDiscount`, `PAYMENT_METHODS` dari `@/lib/stock`).
- Produces: `InvoiceFinalView({ detail, today, canManage, canCorrect, canSeeCost })`; `InvoicePaymentDialog({ invoiceId, limit, finalizedDate, today })`; `RevokeInvoicePaymentDialog({ paymentId, label })`; `FinalDiscountDialog({ invoiceId, subtotal, currentDiscount, paid })`.

- [ ] **Step 1: Tulis uji tampilan final (gagal)**

Buat `tests/unit/invoice-final-view.test.tsx`. Pakai pola mock dan fixture `detail()` yang sama dengan Task 8 (salin fungsi `detail` dan `vi.mock` untuk `next/navigation`, `sonner`, `@/server/invoice-payments`, `@/server/invoice-lifecycle`), dengan `status: "FINAL"`, `number: "TG-2026-0001"`, `finalizedAt`, dan satu pembayaran `{ id: "pay1", amount: 40000, method: "TUNAI", paidAt: "2026-10-07", reference: "KW-1", staffName: "Resepsionis Uji", createdAt: new Date(), revokedAt: null, revokedByName: null, revokeReason: null }` sehingga `totals = invoiceTotals(...)` → total 200000, dibayar 40000, sisa 160000. Kasus:

```tsx
it("menampilkan baris, total, dibayar, sisa, dan riwayat pembayaran", () => {
  render(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
  const summary = screen.getByRole("region", { name: "Ringkasan tagihan" });
  expect(summary).toHaveTextContent("Rp 200.000");
  expect(summary).toHaveTextContent("Rp 160.000");
  const payments = screen.getByRole("region", { name: "Pembayaran" });
  expect(payments).toHaveTextContent("Tunai");
  expect(payments).toHaveTextContent("KW-1");
});

it("resepsionis: bisa mencatat pembayaran, tidak bisa membatalkan pembayaran atau memberi diskon", () => {
  render(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
  expect(screen.getByRole("button", { name: "Catat pembayaran" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Batalkan pembayaran/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Tambah diskon" })).toBeNull();
});

it("Admin Keuangan: membatalkan pembayaran, menambah diskon, membatalkan tagihan; tidak mencatat pembayaran", () => {
  render(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage={false} canCorrect canSeeCost={false} />);
  expect(screen.queryByRole("button", { name: "Catat pembayaran" })).toBeNull();
  expect(screen.getByRole("button", { name: /Batalkan pembayaran/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tambah diskon" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Batalkan tagihan" })).toBeInTheDocument();
});

it("tagihan lunas atau dibatalkan tidak menawarkan pembayaran; pembayaran dibatalkan ditandai", () => {
  const paid = finalDetail({ payments: [{ ...payment, amount: 200000 }] });
  render(<InvoiceFinalView detail={paid} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
  expect(screen.queryByRole("button", { name: "Catat pembayaran" })).toBeNull();
});

it("harga pokok hanya tampil bila diizinkan", () => {
  const withCost = finalDetail({ cost: 30000 });
  const { rerender } = render(<InvoiceFinalView detail={withCost} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
  expect(screen.queryByText(/Harga pokok/)).toBeNull();
  rerender(<InvoiceFinalView detail={withCost} today="2026-10-07" canManage canCorrect={false} canSeeCost />);
  expect(screen.getByText(/Harga pokok/)).toBeInTheDocument();
});

it("dialog pembayaran: nominal di atas sisa ditolak di layar; yang sah dikirim", async () => {
  mocks.recordInvoicePayment.mockResolvedValue({ ok: true, data: { id: "pay2" } });
  render(<InvoicePaymentDialog invoiceId="inv1" limit={160000} finalizedDate="2026-10-07" today="2026-10-07" />);
  await userEvent.click(screen.getByRole("button", { name: "Catat pembayaran" }));
  const dialog = await screen.findByRole("dialog");
  const amount = within(dialog).getByLabelText("Nominal");
  await userEvent.clear(amount);
  await userEvent.type(amount, "170000");
  await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nominal melebihi sisa tagihan");
  expect(mocks.recordInvoicePayment).not.toHaveBeenCalled();
  await userEvent.clear(amount);
  await userEvent.type(amount, "160000");
  await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
  await waitFor(() => expect(mocks.recordInvoicePayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: "inv1", amount: 160000, method: "TUNAI" })));
});
```

Run: `npx vitest run tests/unit/invoice-final-view.test.tsx`
Expected: FAIL (komponen belum ada).

- [ ] **Step 2: Dialog dan tampilan**

- `invoice-payment-dialog.tsx`: salin pola `src/components/admin/stock/payment-dialog.tsx` (state `typed: number | null | undefined` agar nominal bawaan mengikuti `limit` terbaru; select metode dari `PAYMENT_METHODS`/`PAYMENT_METHOD_LABEL`; tanggal `min={finalizedDate} max={today}`; referensi opsional). Validasi lokal `validateInvoicePayment(input, { today, finalizedDate, limit })`, kirim `recordInvoicePayment`. Tombol pemicu "Catat pembayaran"; deskripsi `Sisa tagihan {formatRupiah(limit)}.`; metode bawaan `TUNAI`; sukses → toast `Pembayaran {nominal} dicatat.` + `router.refresh()`.
- `revoke-invoice-payment-dialog.tsx`: salin `revoke-payment-dialog.tsx`, ganti aksi menjadi `revokeInvoicePayment({ paymentId, reason })` dan deskripsi "…dan sisa tagihan kembali." Tombol `aria-label` `Batalkan pembayaran {label}`.
- `final-discount-dialog.tsx`: tombol "Tambah diskon"; jenis, nilai, alasan; hitung lokal `discountAmount(subtotal, kind, value)` dan tolak bila ≤ `currentDiscount` ("Diskon sesudah final hanya bisa ditambah.") atau `subtotal - amount < paid` ("Diskon membuat total di bawah yang sudah dibayar."); validasi `validateDiscount(..., { subtotal, canExceed: true })`; kirim `applyFinalDiscount({ invoiceId, kind, value, reason })`.
- `invoice-final-view.tsx` (komponen server-compatible, tanpa state; hanya merender komponen klien): tabel baris (nama, jenis, jumlah, harga, jumlah harga; catatan harga kecil di bawah nama), `<section aria-label="Ringkasan tagihan">` (Subtotal, Diskon dengan alasan dan nama pemberi, Total, Dibayar, Sisa), bagian `<section aria-label="Pembayaran">` (riwayat: tanggal `dateLabel`, nominal, metode, referensi, petugas; baris dibatalkan dicoret dengan "Dibatalkan oleh … : alasan"; tombol batalkan pembayaran hanya bila `canCorrect` dan pembayaran belum dibatalkan; tombol "Catat pembayaran" hanya bila `canManage && status === "FINAL" && totals.balance > 0`), panel aksi: `FinalDiscountDialog` bila `canCorrect && FINAL && display !== "LUNAS"`, `CancelInvoiceDialog` bila FINAL dan (`canCorrect` atau (`canManage` dan belum pernah dibayar: `!detail.everPaid`)), tombol "Cetak" (`window.print()` lewat komponen klien kecil `PrintButton`), pesan `role="status"` bila DIBATALKAN (`Dibatalkan {tanggal} oleh {nama}: {alasan}`), dan baris "Harga pokok {formatRupiah(cost)} · Laba kotor barang …" hanya bila `canSeeCost && detail.cost !== null` (laba = Σ baris barang − harga pokok; cukup tampilkan harga pokok). Elemen yang tidak ikut cetak diberi kelas `print:hidden` (Tailwind) — tombol aksi, header admin.

- [ ] **Step 3: Cabang final di halaman dan gaya cetak**

Di `src/app/(admin)/admin/tagihan/[id]/page.tsx` tambahkan cabang bukan-draf:

```tsx
        ) : (
          <InvoiceFinalView
            detail={detail}
            today={witaDateString(new Date())}
            canManage={canManage}
            canCorrect={can(staff.role, "invoice:correct")}
            canSeeCost={can(staff.role, "stock:read")}
          />
        )}
```

(ganti `) : null}` dengan struktur ternary lengkap, impor `InvoiceFinalView` dan `witaDateString`). Pastikan hanya halaman yang memanggil `getInvoiceDetail` (yang menghitung `cost` hanya untuk `stock:read`).

Di akhir `src/app/globals.css` tambahkan:

```css
/* Cetak tagihan: hanya isi halaman, tanpa menu samping dan tombol. */
@media print {
  [data-sidebar],
  header,
  .print\:hidden {
    display: none !important;
  }
  body {
    background: #fff !important;
  }
}
```

Run: `npx vitest run tests/unit/invoice-final-view.test.tsx tests/unit/billing-list.test.tsx tests/unit/invoice-draft-editor.test.tsx && npx eslint src/components/admin/billing "src/app/(admin)/admin/tagihan" tests/unit/invoice-final-view.test.tsx && npx tsc --noEmit -p . > "$WS/t9-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: PASS semua, eslint bersih, `tsc exit 0`.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/billing src/app/\(admin\)/admin/tagihan src/app/globals.css tests/unit/invoice-final-view.test.tsx
git commit -m "feat: add invoice payments, corrections, cancellation, and print view"
```

---

### Task 10: Dasbor dan menu — "Perlu ditagih", "Tagihan belum lunas", menu Tagihan

**Files:**
- Modify: `src/server/invoice-read.ts` (tambah `unpaidOverview`), `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/page.tsx`
- Create: `src/components/admin/billing/billing-tiles.tsx`
- Test: `tests/integration/invoice-overview.test.ts`, `tests/unit/billing-tiles.test.tsx`, ubah `tests/unit/app-sidebar*.test.tsx` bila ada

**Interfaces:**
- Consumes: Task 3 (`countBillable`), Task 2 (`invoiceTotals`, `TOTALS_SELECT`).
- Produces: `unpaidOverview(): Promise<{ count: number; balance: number }>` (butuh `invoice:read`; hitung tagihan FINAL dengan sisa > 0); `BillingTiles({ billable, unpaid })` (`billable: number | null`, `unpaid: { count: number; balance: number } | null`); `AppSidebar` prop `billable?: number` (angka di menu Tagihan).

- [ ] **Step 1: Uji integrasi dan unit (gagal)**

`tests/integration/invoice-overview.test.ts` (pola `invoice-payments.test.ts`, slug `ikhtisar-tagihan`, WA `6281200008841`): buat dua tagihan final Rp 100.000 (satu dibayar 30.000, satu belum), satu tagihan dibatalkan, satu draf; harapkan `unpaidOverview()` ≥ `{ count: 2, balance: 170000 }` dihitung relatif terhadap nilai sebelum (ambil `before = await unpaidOverview()` lebih dulu dan bandingkan selisih `+2` dan `+170000`, karena data uji lain mungkin ada). Peran `DOKTER` memanggil `unpaidOverview` → `rejects.toThrow(/forbidden: invoice:read/)`.

`tests/unit/billing-tiles.test.tsx`: `BillingTiles` dengan `billable=3, unpaid=null` menampilkan kotak "Perlu ditagih" bernilai 3 dengan tautan `/admin/tagihan`; dengan `billable=null, unpaid={count:2,balance:170000}` menampilkan "Tagihan belum lunas", "Rp 170.000" dan tautan `/admin/tagihan?lihat=BELUM_LUNAS`; keduanya `null` tidak merender apa pun.

Run: `npm run test:integration -- tests/integration/invoice-overview.test.ts; npx vitest run tests/unit/billing-tiles.test.tsx`
Expected: FAIL (fungsi/komponen belum ada).

- [ ] **Step 2: Implementasi**

Tambah di `src/server/invoice-read.ts`:

```ts
/** Tagihan final yang belum lunas (spec tagihan 8): jumlah dan total sisanya. */
export async function unpaidOverview(): Promise<{ count: number; balance: number }> {
  await requireCapability("invoice:read");
  const rows = await prisma.invoice.findMany({ where: { status: "FINAL" }, select: TOTALS_SELECT });
  let count = 0;
  let balance = 0;
  for (const row of rows) {
    const { balance: left } = invoiceTotals(row);
    if (left > 0) {
      count += 1;
      balance += left;
    }
  }
  return { count, balance };
}
```

`src/components/admin/billing/billing-tiles.tsx`:

```tsx
import { formatRupiah } from "@/lib/format";
import { StatTile } from "../stat-tile";

/** Kotak Tagihan di dasbor (spec tagihan 8): resepsionis melihat "Perlu ditagih", Admin Keuangan "Tagihan belum lunas". */
export function BillingTiles({ billable, unpaid }: { billable: number | null; unpaid: { count: number; balance: number } | null }) {
  if (billable === null && unpaid === null) return null;
  return (
    <section aria-label="Tagihan" className="grid gap-4 sm:grid-cols-2">
      {billable !== null && (
        <StatTile label="Perlu ditagih" value={billable} note="kunjungan" href="/admin/tagihan" attention={billable > 0} />
      )}
      {unpaid !== null && (
        <StatTile
          label="Tagihan belum lunas"
          value={formatRupiah(unpaid.balance)}
          note={`${unpaid.count} tagihan`}
          href="/admin/tagihan?lihat=BELUM_LUNAS"
          attention={unpaid.count > 0}
        />
      )}
    </section>
  );
}
```

Menu: di `app-sidebar.tsx` tambah item di grup "Persediaan & keuangan" sebelum Stok — `{ title: "Tagihan", url: "/admin/tagihan", icon: Receipt, needs: "invoice:read" }` (impor `Receipt` dari `lucide-react`), prop `billable = 0`, dan entri lencana `"/admin/tagihan": { count: billable, label: `${billable} kunjungan perlu ditagih` }` mengikuti pola `stockAlerts`. Di `layout.tsx` hitung `billable = can(staff.role, "invoice:manage") ? await countBillable() : 0` bersama `Promise.all` yang ada dan teruskan `billable={billable}`. Di `page.tsx` tambah ke `Promise.all`: `can(staff.role, "invoice:manage") ? settle(countBillable(), "perlu ditagih") : null` dan `staff.role === "ADMIN_KEUANGAN" || ... can(staff.role, "invoice:correct") ? settle(unpaidOverview(), "tagihan") : null`, render `<BillingTiles billable={...} unpaid={...} />` di bawah kotak Hutang, dengan `FailedSection title="Tagihan"` bila `settle` gagal (ikuti bentuk penggunaan `stock`/`payables`).

Run: `npm run test:integration -- tests/integration/invoice-overview.test.ts; npx vitest run > "$WS/t10.log" 2>&1; grep -E "Test Files|Tests " "$WS/t10.log"; npx eslint src tests/unit tests/integration; npx tsc --noEmit -p . > "$WS/t10-tsc.log" 2>&1; echo "tsc exit $?"`
Expected: PASS semua (uji sidebar yang menghitung jumlah menu disesuaikan bila ada), eslint bersih, `tsc exit 0`.

- [ ] **Step 3: Commit**

```bash
git add src tests
git commit -m "feat: show billing tiles and a Tagihan menu with a work badge"
```

---

### Task 11: E2E, fixture, verifikasi penuh, tandai spec dibangun

**Files:**
- Create: `tests/e2e/tagihan.spec.ts`
- Modify: `tests/e2e/prepare-db.mts`, `docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md` (status)

**Interfaces:**
- Consumes: semua task sebelumnya; kredensial `E2E_RESEPSIONIS`, `E2E_KEUANGAN`, `E2E_APOTEKER`, `E2E_DOKTER` (lihat `tests/e2e/credentials.ts`); `signIn` dari `./helpers/quiz`.
- Produces: satu cerita E2E berurutan per proyek (desktop/ponsel).

- [ ] **Step 1: Fixture**

Di `tests/e2e/prepare-db.mts`, sebelum baris yang menghapus `appointment`/`patient` (dan sebelum `stockMovement`/`stockBatch` bila `StockMovement.invoiceId` merujuk tagihan), tambahkan urutan hapus:

```ts
await prisma.invoicePayment.deleteMany();
await prisma.invoiceStockUse.deleteMany();
await prisma.invoiceLine.deleteMany();
await prisma.invoice.deleteMany();
await prisma.invoiceNumberCounter.deleteMany();
```

Letakkan sebelum `prisma.stockMovement.deleteMany()` dan `prisma.appointment.deleteMany()` (periksa urutan sebenarnya di berkas; `StockMovement.invoiceId` tanpa FK keras boleh di mana saja, tetapi `InvoiceStockUse` merujuk batch sehingga harus lebih dulu dari batch).

Run: `npx tsx tests/e2e/prepare-db.mts` (atau perintah e2e yang memanggilnya; lihat `package.json`) — Expected: selesai tanpa galat.

- [ ] **Step 2: Cerita E2E**

Buat `tests/e2e/tagihan.spec.ts` dengan pola `stok-hutang.spec.ts` (`test.describe.configure({ mode: "serial" })`, `test.setTimeout(180_000)`, `tag(testInfo)` D/M). Cerita:

1. **Siapkan data** (sebagai Apoteker, `/admin/stok`): tambah barang `Vitamin E2E {t}` (harga jual 25000) dan catat barang masuk 10 buah (pola `stok-hutang.spec.ts`), agar ada stok. Data kunjungan final: pakai pembantu e2e yang sudah ada untuk membuat kunjungan final (lihat `tests/e2e/kunjungan.spec.ts` / `check-in.spec.ts`); bila tidak ada pembantu, gunakan "Penjualan langsung" untuk pasien yang dibuat lewat `PatientPicker` (tombol "Pasien baru" sudah ada) sehingga cerita tidak bergantung pada kunjungan.
2. **Resepsionis menagih**: `signIn(E2E_RESEPSIONIS)`, `/admin/tagihan` → "+ Penjualan langsung" → pilih pasien → halaman draf terbuka (`/admin/tagihan/[id]`); "Tambah barang" `Vitamin E2E` jumlah 2 → baris tampil, total `Rp 50.000`; tambah baris layanan bebas "Layanan E2E" 100000 → total `Rp 150.000`; diskon Persen 30 → pesan batas 20% tampil (`role="alert"`); ubah ke 10% dengan alasan "Pelanggan lama" → total `Rp 135.000`; "Finalkan tagihan" → "Finalkan" → nomor `TG-` tampil, status "Belum dibayar".
3. **Bayar sebagian lalu lunas**: "Catat pembayaran" 50000 Tunai → status "Sebagian", sisa `Rp 85.000`; nominal `90000` ditolak ("melebihi sisa"); bayar 85000 QRIS → "Lunas"; tombol "Catat pembayaran" hilang.
4. **Hak akses Resepsionis**: tidak ada tombol "Batalkan pembayaran" dan "Tambah diskon".
5. **Admin Keuangan** (`signIn(E2E_KEUANGAN)`): membuka tagihan yang sama; tidak ada "Catat pembayaran"; "Batalkan pembayaran" pembayaran 50000 dengan alasan → status "Sebagian", sisa `Rp 50.000`; dasbor menampilkan kotak "Tagihan belum lunas".
6. **Stok**: Apoteker membuka `/admin/stok` → `Vitamin E2E` tersisa 8 (jumlah masuk 10 − 2).
7. **Batalkan tagihan** (Admin Keuangan): "Batalkan tagihan" dengan alasan → status "Dibatalkan"; stok `Vitamin E2E` kembali 10.
8. **Dokter** (`signIn(E2E_DOKTER)`): `page.goto("/admin/tagihan")` → tidak ada daftar tagihan (halaman ditolak/dialihkan; ikuti perilaku `requireCapability` yang dipakai tes `stok-hutang.spec.ts` untuk peran yang tidak berhak).

Setiap pencarian elemen memakai label/peran yang dibuat Task 7–9 (`Buat tagihan {nama}`, `Jumlah …`, `Terapkan diskon`, `Finalkan tagihan`, `Catat pembayaran`, region `Ringkasan tagihan`/`Pembayaran`). Gunakan `{ timeout: 30_000 }` pada tunggu navigasi seperti spec stok. Perhatikan pola URL: `/\/admin\/tagihan\/[^/?]+$/`.

- [ ] **Step 3: Jalankan E2E per proyek**

Run (laptop 8 GB, satu proyek sekali jalan): `npx playwright test tests/e2e/tagihan.spec.ts --project=desktop > "$WS/e2e-d.log" 2>&1; tail -20 "$WS/e2e-d.log"` lalu `--project=mobile` dengan log `e2e-m.log`.
Expected: semua lulus di kedua proyek. Setelah e2e, kosongkan data e2e di `sundy_test` (`npx tsx tests/e2e/prepare-db.mts`) sebelum menjalankan uji integrasi lagi.

- [ ] **Step 4: Verifikasi penuh**

Run berurutan (jangan bersamaan):

```bash
npx vitest run > "$WS/final-unit.log" 2>&1; grep -E "Test Files|Tests " "$WS/final-unit.log"
npm run test:integration > "$WS/final-int.log" 2>&1; grep -E "Test Files|Tests |FAIL" "$WS/final-int.log" | head
npx eslint . > "$WS/final-lint.log" 2>&1; echo "eslint exit $?"
npx tsc --noEmit -p . > "$WS/final-tsc.log" 2>&1; echo "tsc exit $?"
npx next build > "$WS/final-build.log" 2>&1; echo "build exit $?"
```

Expected: unit dan integrasi lulus (satu-satunya kegagalan yang boleh ada: 3 uji `schedule.test.ts` dan satu uji `encounter-form` yang flake, lulus bila diulang), `eslint exit 0`, `tsc exit 0`, `build exit 0`. Setiap kegagalan lain disebut dengan namanya di laporan.

- [ ] **Step 5: Tandai spec dibangun dan commit**

Di `docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md` ganti baris status "Menunggu tinjauan pemilik" menjadi "Dibangun (belum dideploy)".

```bash
git add tests/e2e/tagihan.spec.ts tests/e2e/prepare-db.mts docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md
git commit -m "test: cover invoicing end to end and mark the design as built"
```
