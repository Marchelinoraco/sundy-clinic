# Katalog Layanan Situs dan Internal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memisahkan katalog layanan situs publik (tabel baru `SiteService`) dari katalog internal (`Service`), lengkap dengan pengelolaan keduanya di panel, foto layanan situs, dan pemilihan treatment katalog di "+ Baris layanan".

**Architecture:** `Service` tetap menjadi katalog internal dan semua relasi lama tidak berubah. `SiteService` menyimpan isi promosi dan tertaut ke tepat satu `Service`; harga dan durasi selalu dibaca dari `Service`. Fungsi katalog situs (`src/server/catalog.ts`) memetakan baris `SiteService` ke bentuk data lama sehingga komponen situs tidak berubah. Panel admin membaca katalog internal lewat modul baca baru, dan aksi server baru menambah/mengubah kedua katalog.

**Tech Stack:** Next.js 15 (App Router), React 19, Prisma 7 + PostgreSQL, MUI 9 (panel admin), sharp 0.35.4, Vitest (unit + integrasi), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-10-16-layanan-situs-internal-design.md`

## Global Constraints

- Semua teks antarmuka dan pesan galat dalam Bahasa Indonesia, sama persis dengan yang tertulis di task.
- Migrasi hanya menambah (tanpa `DROP`). Nama migrasi: `20261016090000_layanan_situs`.
- Buat SQL migrasi dengan `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/x.sql`, lalu buang baris dotenv dan kotak banner "Update available" (baris berawalan `┌`, `│`, `└`) sebelum disalin.
- Sesudah mengubah skema: `npx prisma generate && npm run db:migrate:test`; pemeriksaan drift (perintah diff yang sama) harus mencetak `-- This is an empty migration.`
- Berkas `"use server"` hanya mengekspor fungsi async (ekspor tipe boleh).
- Panel admin hanya memakai MUI (uji arsitektur). Jangan menjalankan Prettier pada berkas mana pun.
- Hak baru `catalog:manage` = `SUPER_ADMIN` + `ADMIN_KEUANGAN`. Keputusan rencana: `updateServicePrice` dan `updateServiceCost` tetap memeriksa `price:manage` (anggotanya sama persis dengan `catalog:manage`), supaya uji harga modal yang ada tidak berubah; aksi katalog baru dan `setServiceActive` memakai `catalog:manage`.
- Konsultasi Online (`konsultasi-online`) tidak pernah menjadi layanan situs, tidak tampil di tabel internal, dan tidak bisa dipilih di tagihan. Konsultasi Dokter (`konsultasi-dokter`) tidak bisa dinonaktifkan dan durasinya harus 15, 30, 45, atau 60 menit.
- Batas: nama layanan internal 2–100 karakter (unik tanpa membedakan huruf besar/kecil); nama situs 2–100; slug situs 2–80, pola `^[a-z0-9]+(?:-[a-z0-9]+)*$`; deskripsi maks. 2.000; satuan harga maks. 40; durasi 15–480 kelipatan 15; urutan 0–9999.
- Uji integrasi tidak boleh dijalankan bersamaan dengan E2E.
- Commit diakhiri baris `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan pernah men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. Layanan internal dinonaktifkan sementara layanan situsnya aktif → layanan hilang dari /layanan, /layanan/<slug> 404, dan tidak bisa dipesan di /daftar (diuji di Task 3 dan Task 4).
2. Permintaan /daftar buatan sendiri yang memakai id layanan khusus internal → ditolak "Layanan ini tidak tersedia untuk booking." (Task 4).
3. Konsultasi Dokter diubah lewat dialog internal dengan durasi 90 menit atau dinonaktifkan → ditolak; Konsultasi Online tidak bisa diubah lewat aksi internal (Task 6).
4. Slug layanan situs bentrok dengan slug lain → pesan "Alamat (slug) sudah dipakai layanan situs lain.", bukan galat 500 (Task 7).
5. Foto layanan situs yang layanan situsnya atau layanan internalnya nonaktif → rute publik `/foto-layanan/<nama>` 404 (Task 8).

---

### Task 1: Skema `SiteService`, migrasi salin 1:1, seed, dan hak `catalog:manage`

**Files:**
- Modify: `prisma/schema.prisma` (model `Service` sekitar baris 160–198, `ServiceCategory` baris 150–157, model baru sesudah `Service`)
- Create: `prisma/migrations/20261016090000_layanan_situs/migration.sql`
- Modify: `prisma/seed.ts` (sesudah upsert `services`, sebelum upsert Konsultasi Online)
- Modify: `src/lib/permissions.ts`
- Modify: `src/components/admin/app-sidebar.tsx:74`
- Test: `tests/unit/migrations.test.ts`, `tests/unit/permissions.test.ts`, `tests/integration/seed.test.ts`

**Interfaces:**
- Produces: model Prisma `SiteService` (kolom sesuai spec 2.2) dengan relasi `category` dan `service`; relasi balik `Service.siteServices` dan `ServiceCategory.siteServices`; `Capability` `"catalog:manage"`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi layanan situs", () => {
  const sql = readFileSync("prisma/migrations/20261016090000_layanan_situs/migration.sql", "utf8");

  it("hanya menambah, tanpa menghapus apa pun yang dikenal rilis sebelumnya", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menyalin setiap layanan kecuali Konsultasi Online menjadi layanan situs yang tertaut", () => {
    expect(sql).toMatch(/INSERT INTO "SiteService"[\s\S]+FROM "Service"[\s\S]+WHERE "slug" <> 'konsultasi-online'/);
    expect(sql).toMatch(/'ss' \|\| md5\(/);
  });
});
```

Tambahkan di `tests/unit/permissions.test.ts` di dalam `describe` utama:

```ts
  it("katalog layanan dikelola Super Admin dan Admin Keuangan (spec layanan situs 5)", () => {
    expect(can("SUPER_ADMIN", "catalog:manage")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "catalog:manage")).toBe(true);
    for (const role of ["RESEPSIONIS", "APOTEKER", "DOKTER", "TERAPIS"] as const) {
      expect(can(role, "catalog:manage")).toBe(false);
    }
  });
```

Tambahkan di `tests/integration/seed.test.ts` di dalam `describe("data awal katalog")`:

```ts
  it("membuat satu layanan situs per layanan, tertaut ke layanan asalnya, kecuali Konsultasi Online", async () => {
    const hifu = await prisma.siteService.findUnique({ where: { slug: "hifu-wajah" }, include: { service: true, category: true } });
    expect(hifu).toMatchObject({ name: "HIFU Wajah", isSignature: true, service: { slug: "hifu-wajah" }, category: { slug: "hifu" } });
    const botox = await prisma.siteService.findUnique({ where: { slug: "botox" } });
    expect(botox?.priceNote).toBe("/ unit");
    expect(await prisma.siteService.findFirst({ where: { service: { slug: "konsultasi-online" } } })).toBeNull();
  });
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts tests/unit/permissions.test.ts`
Expected: FAIL — `ENOENT … 20261016090000_layanan_situs/migration.sql` dan `expected false to be true` untuk `catalog:manage`.

- [ ] **Step 3: Ubah skema**

Di `prisma/schema.prisma`, tambahkan relasi balik pada `ServiceCategory` (sesudah `services    Service[]`):

```prisma
  siteServices SiteService[]
```

Pada `Service`, sesudah baris `appointments Appointment[]`:

```prisma
  /// Layanan situs yang menautkan layanan internal ini (spec layanan situs 2.2).
  siteServices SiteService[]
```

Tambahkan model baru tepat sesudah blok `model Service { … }`:

```prisma
/// Katalog situs publik (spec layanan situs 2.2): isi promosi yang tertaut ke tepat satu layanan internal.
/// Harga dan durasi tidak disimpan di sini; selalu dibaca dari `service` (keputusan K3).
model SiteService {
  id          String  @id @default(cuid())
  /// Alamat /layanan/<slug>.
  slug        String  @unique
  name        String
  description String?
  /// Foto unggahan (/foto-layanan/<nama>) atau berkas lokal lama; kosong = foto kategori.
  imageUrl    String?
  /// Satuan harga yang tampil setelah angka, misal "/ 5 titik".
  priceNote   String?
  isSignature Boolean @default(false)
  isActive    Boolean @default(true)
  sortOrder   Int     @default(0)

  categoryId String
  category   ServiceCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  serviceId  String
  service    Service         @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([categoryId, sortOrder])
  @@index([serviceId])
  @@index([isSignature])
}
```

- [ ] **Step 4: Buat migrasi**

```bash
mkdir -p prisma/migrations/20261016090000_layanan_situs
PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/layanan-situs.sql
grep -v -e '^\[dotenv' -e '^┌' -e '^│' -e '^└' /tmp/layanan-situs.sql > prisma/migrations/20261016090000_layanan_situs/migration.sql
```

Periksa isinya: hanya `CREATE TABLE "SiteService"`, tiga `CREATE INDEX`, satu `CREATE UNIQUE INDEX "SiteService_slug_key"`, dan dua `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` (keduanya `ON DELETE CASCADE ON UPDATE CASCADE`). Lalu tambahkan di akhir berkas:

```sql
-- Salin katalog situs dari layanan yang ada (spec layanan situs 2.3): situs tampil sama persis sesudah deploy.
-- Id hanya huruf kecil dan angka, cocok dengan pola nama berkas foto layanan.
INSERT INTO "SiteService" ("id", "slug", "name", "description", "imageUrl", "priceNote", "isSignature", "isActive", "sortOrder", "categoryId", "serviceId", "createdAt", "updatedAt")
SELECT 'ss' || md5(random()::text || "id"), "slug", "name", "description", "imageUrl", "priceNote", "isSignature", "isActive", "sortOrder", "categoryId", "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Service"
WHERE "slug" <> 'konsultasi-online';
```

Run: `npx prisma generate && npm run db:migrate:test`
Expected: migrasi `20261016090000_layanan_situs` diterapkan tanpa galat.

Run: `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected: `-- This is an empty migration.`

Bila penerapan gagal di tengah jalan: perbaiki SQL, `PRISMA_TARGET=test npx prisma migrate resolve --rolled-back 20261016090000_layanan_situs`, lalu terapkan lagi.

- [ ] **Step 5: Seed membuat layanan situs**

Di `prisma/seed.ts`, tepat sesudah `await prisma.$transaction(services.map(…), TRANSACTION_OPTIONS);` (blok upsert layanan) dan sebelum komentar Konsultasi Online, tambahkan:

```ts
    // Katalog situs: satu layanan situs per layanan seed, tertaut ke layanan internalnya (spec layanan situs 2.3).
    const serviceRows = await prisma.service.findMany({
      where: { slug: { in: services.map((service) => service.slug) } },
      select: { id: true, slug: true },
    });
    const serviceIdBySlug = new Map(serviceRows.map((row) => [row.slug, row.id]));
    await prisma.$transaction(
      services.map(({ slug, name, description, priceNote, isSignature, sortOrder, categorySlug }) => {
        const data = {
          name,
          description: description ?? null,
          priceNote: priceNote ?? null,
          isSignature: isSignature ?? false,
          sortOrder,
          categoryId: categoryIdBySlug.get(categorySlug)!,
          serviceId: serviceIdBySlug.get(slug)!,
        };
        return prisma.siteService.upsert({ where: { slug }, update: data, create: { slug, ...data } });
      }),
      TRANSACTION_OPTIONS,
    );
```

- [ ] **Step 6: Hak `catalog:manage` dan menu samping**

Di `src/lib/permissions.ts`: tambahkan `| "catalog:manage"` di akhir union `Capability` (sesudah `"price:manage"`), tambahkan `"catalog:manage",` di akhir daftar `SUPER_ADMIN`, dan ubah baris `ADMIN_KEUANGAN` menjadi:

```ts
  // Katalog layanan internal dan situs (spec layanan situs 5).
  ADMIN_KEUANGAN: ["stock:read", "payable:manage", "report:read", "invoice:read", "invoice:correct", "expense:manage", "profit:read", "price:manage", "catalog:manage"],
```

Di `src/components/admin/app-sidebar.tsx:74` ganti `needsAny: ["content:manage", "price:manage"]` menjadi `needsAny: ["catalog:manage"]`.

- [ ] **Step 7: Jalankan uji, pastikan lulus**

Run: `npx vitest run tests/unit/migrations.test.ts tests/unit/permissions.test.ts && npm run test:integration -- tests/integration/seed.test.ts tests/integration/catalog.test.ts && npx tsc --noEmit -p .`
Expected: semua PASS; `tsc` tanpa keluaran.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261016090000_layanan_situs prisma/seed.ts src/lib/permissions.ts src/components/admin/app-sidebar.tsx tests/unit/migrations.test.ts tests/unit/permissions.test.ts tests/integration/seed.test.ts
git commit -m "feat: add the site service catalog table, copy existing services into it, and add catalog rights

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Modul baca katalog internal; halaman admin berhenti memakai katalog situs

**Files:**
- Create: `src/server/internal-catalog.ts`
- Create: `src/server/catalog-admin-read.ts`
- Modify: `src/app/(admin)/admin/booking/baru/page.tsx`
- Modify: `src/app/(admin)/admin/layanan/page.tsx`
- Test: `tests/integration/internal-catalog.test.ts`

**Interfaces:**
- Consumes: `prisma.siteService` (Task 1).
- Produces:
  - `listInternalServiceOptions(): Promise<InternalServiceOption[]>` dengan `InternalServiceOption = { id: string; slug: string; name: string; categoryId: string; categoryName: string; price: number; durationMin: number; requiresDoctor: boolean }` — layanan internal aktif kecuali Konsultasi Online, urut kategori → `sortOrder` → nama. Tanpa pemeriksaan hak (dipanggil halaman yang sudah memeriksa).
  - `getInternalCatalog(): Promise<InternalCategory[]>` (hak `catalog:manage`) dengan `InternalCategory = { id: string; name: string; services: InternalServiceRow[] }`, `InternalServiceRow = { id; slug; name; categoryId; normalPrice: number | null; promoPrice: number; durationMin: number; requiresDoctor: boolean; isActive: boolean; siteCount: number } & ServiceCostInput`. Termasuk layanan nonaktif, tanpa Konsultasi Online; `siteCount` = jumlah layanan situs **aktif** yang menautkan.
  - `listServiceCategories(): Promise<{ id: string; name: string }[]>` (hak `catalog:manage`).
  - `getSiteCatalog(): Promise<SiteCategory[]>` (hak `catalog:manage`) dengan `SiteCategory = { id: string; name: string; services: SiteServiceRow[] }`, `SiteServiceRow = { id; slug; name; description: string | null; imageUrl: string | null; priceNote: string | null; isSignature: boolean; isActive: boolean; sortOrder: number; categoryId: string; serviceId: string; serviceName: string; servicePrice: number; serviceNormalPrice: number | null; serviceActive: boolean }`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/internal-catalog.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getInternalCatalog, getSiteCatalog, listServiceCategories } from "@/server/catalog-admin-read";
import { listInternalServiceOptions } from "@/server/internal-catalog";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Katalog Baca", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-katalog";
let categoryId: string;
let internalOnlyId: string;
let linkedId: string;

async function clean() {
  await prisma.service.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await clean();
  categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Baca", sortOrder: 98 } })).id;
  internalOnlyId = (await prisma.service.create({ data: { slug: `${SLUG}-addon`, name: "Add-on Baca Uji", promoPrice: 50_000, durationMin: 15, categoryId } })).id;
  linkedId = (await prisma.service.create({ data: { slug: `${SLUG}-facial`, name: "Facial Baca Uji", promoPrice: 150_000, normalPrice: 200_000, durationMin: 45, categoryId } })).id;
  await prisma.service.create({ data: { slug: `${SLUG}-mati`, name: "Mati Baca Uji", promoPrice: 10_000, isActive: false, categoryId } });
  await prisma.siteService.create({ data: { slug: `${SLUG}-promo`, name: "Facial Promo Baca", categoryId, serviceId: linkedId } });
  await prisma.siteService.create({ data: { slug: `${SLUG}-promo-mati`, name: "Facial Promo Mati", categoryId, serviceId: linkedId, isActive: false } });
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("katalog internal", () => {
  it("pilihan internal: aktif saja, termasuk item khusus internal, tanpa Konsultasi Online", async () => {
    const options = await listInternalServiceOptions();
    const ids = options.map((option) => option.id);
    expect(ids).toContain(internalOnlyId);
    expect(ids).toContain(linkedId);
    expect(options.find((option) => option.name === "Mati Baca Uji")).toBeUndefined();
    expect(options.find((option) => option.slug === "konsultasi-online")).toBeUndefined();
    expect(options.find((option) => option.id === linkedId)).toEqual({
      id: linkedId,
      slug: `${SLUG}-facial`,
      name: "Facial Baca Uji",
      categoryId,
      categoryName: "Kategori Baca",
      price: 150_000,
      durationMin: 45,
      requiresDoctor: false,
    });
  });

  it("tabel internal memuat layanan nonaktif dan jumlah layanan situs aktif yang menautkan", async () => {
    const category = (await getInternalCatalog()).find((c) => c.id === categoryId)!;
    expect(category.services.map((s) => s.name)).toEqual(["Add-on Baca Uji", "Facial Baca Uji", "Mati Baca Uji"]);
    expect(category.services.find((s) => s.id === linkedId)).toMatchObject({ siteCount: 1, normalPrice: 200_000, materialCost: 0, commissionKind: null });
    expect(category.services.find((s) => s.id === internalOnlyId)?.siteCount).toBe(0);
    expect((await getInternalCatalog()).flatMap((c) => c.services).some((s) => s.slug === "konsultasi-online")).toBe(false);
  });

  it("tabel situs membawa nama dan harga layanan internalnya", async () => {
    const category = (await getSiteCatalog()).find((c) => c.id === categoryId)!;
    expect(category.services.find((s) => s.slug === `${SLUG}-promo`)).toMatchObject({
      name: "Facial Promo Baca",
      serviceId: linkedId,
      serviceName: "Facial Baca Uji",
      servicePrice: 150_000,
      serviceNormalPrice: 200_000,
      serviceActive: true,
      isActive: true,
    });
  });

  it("hanya Super Admin dan Admin Keuangan yang membaca katalog untuk pengelolaan", async () => {
    actor.role = "SUPER_ADMIN";
    expect((await listServiceCategories()).some((c) => c.id === categoryId)).toBe(true);
    actor.role = "RESEPSIONIS";
    await expect(getInternalCatalog()).rejects.toThrow("forbidden: catalog:manage");
    await expect(getSiteCatalog()).rejects.toThrow("forbidden: catalog:manage");
    await expect(listServiceCategories()).rejects.toThrow("forbidden: catalog:manage");
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:integration -- tests/integration/internal-catalog.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/catalog-admin-read"`.

- [ ] **Step 3: Buat `src/server/internal-catalog.ts`**

```ts
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";

/** Satu pilihan katalog internal (spec layanan situs 4.2 dan 6): untuk formulir janji temu admin dan "+ Baris layanan". */
export type InternalServiceOption = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  durationMin: number;
  requiresDoctor: boolean;
};

/**
 * Layanan internal aktif, termasuk item khusus internal, tanpa Konsultasi Online. Modul biasa tanpa pemeriksaan hak: pemanggilnya
 * halaman yang sudah memeriksa hak sendiri. Biaya dan komisi sengaja tidak dimuat (spec harga modal 8).
 */
export async function listInternalServiceOptions(): Promise<InternalServiceOption[]> {
  const rows = await prisma.service.findMany({
    where: { isActive: true, slug: { not: ONLINE_SERVICE_SLUG } },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      categoryId: true,
      promoPrice: true,
      durationMin: true,
      requiresDoctor: true,
      category: { select: { name: true } },
    },
  });
  return rows.map(({ category, promoPrice, ...row }) => ({ ...row, categoryName: category.name, price: promoPrice }));
}
```

- [ ] **Step 4: Buat `src/server/catalog-admin-read.ts`**

```ts
import { prisma } from "@/lib/db";
import type { ServiceCostInput } from "@/lib/costing";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { requireCapability } from "@/server/session";

/** Bacaan halaman Layanan & Harga (spec layanan situs 5). Setiap fungsi memeriksa hak `catalog:manage`. */
export type InternalServiceRow = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  normalPrice: number | null;
  promoPrice: number;
  durationMin: number;
  requiresDoctor: boolean;
  isActive: boolean;
  /** Jumlah layanan situs aktif yang menautkan layanan ini; 0 = "Hanya internal". */
  siteCount: number;
} & ServiceCostInput;

export type InternalCategory = { id: string; name: string; services: InternalServiceRow[] };

export type SiteServiceRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceNote: string | null;
  isSignature: boolean;
  isActive: boolean;
  sortOrder: number;
  categoryId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceNormalPrice: number | null;
  serviceActive: boolean;
};

export type SiteCategory = { id: string; name: string; services: SiteServiceRow[] };

export async function getInternalCatalog(): Promise<InternalCategory[]> {
  await requireCapability("catalog:manage");
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      services: {
        where: { slug: { not: ONLINE_SERVICE_SLUG } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          categoryId: true,
          normalPrice: true,
          promoPrice: true,
          durationMin: true,
          requiresDoctor: true,
          isActive: true,
          materialCost: true,
          toolCost: true,
          commissionKind: true,
          commissionValue: true,
          _count: { select: { siteServices: { where: { isActive: true } } } },
        },
      },
    },
  });
  return categories
    .filter((category) => category.services.length > 0)
    .map((category) => ({
      id: category.id,
      name: category.name,
      services: category.services.map(({ _count, ...service }) => ({ ...service, siteCount: _count.siteServices })),
    }));
}

export async function listServiceCategories(): Promise<{ id: string; name: string }[]> {
  await requireCapability("catalog:manage");
  return prisma.serviceCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
}

export async function getSiteCatalog(): Promise<SiteCategory[]> {
  await requireCapability("catalog:manage");
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      siteServices: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          imageUrl: true,
          priceNote: true,
          isSignature: true,
          isActive: true,
          sortOrder: true,
          categoryId: true,
          serviceId: true,
          service: { select: { name: true, promoPrice: true, normalPrice: true, isActive: true } },
        },
      },
    },
  });
  return categories
    .filter((category) => category.siteServices.length > 0)
    .map((category) => ({
      id: category.id,
      name: category.name,
      services: category.siteServices.map(({ service, ...row }) => ({
        ...row,
        serviceName: service.name,
        servicePrice: service.promoPrice,
        serviceNormalPrice: service.normalPrice,
        serviceActive: service.isActive,
      })),
    }));
}
```

- [ ] **Step 5: Halaman Booking Baru memakai katalog internal**

Di `src/app/(admin)/admin/booking/baru/page.tsx`:
- ganti import `import { getBranches, getServiceCategoriesWithServices } from "@/server/catalog";` menjadi `import { getBranches } from "@/server/catalog";` dan tambahkan `import { listInternalServiceOptions } from "@/server/internal-catalog";`;
- di `Promise.all`, ganti `getServiceCategoriesWithServices(),` menjadi `listInternalServiceOptions(),` dan ganti nama variabel `categories` menjadi `services`;
- ganti blok `const consultation = …` sampai akhir `const treatmentGroups … .filter((g) => g.services.length > 0);` dengan:

```tsx
  // Staf memilih dari katalog internal (spec layanan situs 4.2), termasuk item yang tidak tampil di situs.
  const consultation = services.find((s) => s.slug === CONSULTATION_SERVICE_SLUG);
  const groupsByCategory = new Map<string, BookingServiceGroup>();
  for (const s of services) {
    if (s.slug === CONSULTATION_SERVICE_SLUG) continue;
    const group = groupsByCategory.get(s.categoryId) ?? { name: s.categoryName, services: [] };
    group.services.push({ id: s.id, name: s.name, durationMin: s.durationMin, requiresDoctor: s.requiresDoctor });
    groupsByCategory.set(s.categoryId, group);
  }
  const treatmentGroups: BookingServiceGroup[] = [...groupsByCategory.values()];
```

- [ ] **Step 6: Halaman Layanan & Harga memakai katalog internal (tampilan belum berubah)**

Ganti seluruh isi `src/app/(admin)/admin/layanan/page.tsx` dengan:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicConsultationCard } from "@/components/admin/clinic-consultation-card";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { ServicePriceTable } from "@/components/admin/service-price-table";
import { OnlineServiceCard } from "@/components/admin/online-service-card";
import { can } from "@/lib/permissions";
import { getInternalCatalog } from "@/server/catalog-admin-read";
import { getClinicConsultationMinutes, getOnlineServiceSettings } from "@/server/service-admin";
import { requireCapability } from "@/server/session";

export default async function AdminServicesPage() {
  // Katalog internal dan situs dikelola Super Admin dan Admin Keuangan; kartu konsultasi tetap Super Admin (spec layanan situs 5).
  const staff = await requireCapability("catalog:manage");
  const canContent = can(staff.role, "content:manage");
  const [categories, online, consultationMinutes] = await Promise.all([
    getInternalCatalog(),
    canContent ? getOnlineServiceSettings() : Promise.resolve(null),
    canContent ? getClinicConsultationMinutes() : Promise.resolve(null),
  ]);

  return (
    <>
      <AdminHeader title="Layanan & Harga" />
      <PageBody>
        <PageHeader title="Layanan & Harga" description="Perubahan harga langsung tampil di situs publik dan tercatat di jejak audit." />
        {consultationMinutes !== null && <ClinicConsultationCard minutes={consultationMinutes} />}
        {online && <OnlineServiceCard settings={online} />}
        <ServicePriceTable
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            services: category.services.map((s) => ({
              id: s.id,
              name: s.name,
              normalPrice: s.normalPrice,
              promoPrice: s.promoPrice,
              materialCost: s.materialCost,
              toolCost: s.toolCost,
              commissionKind: s.commissionKind,
              commissionValue: s.commissionValue,
            })),
          }))}
        />
      </PageBody>
    </>
  );
}
```

- [ ] **Step 7: Jalankan uji, pastikan lulus**

Run: `npm run test:integration -- tests/integration/internal-catalog.test.ts && npx tsc --noEmit -p .`
Expected: 4/4 PASS; `tsc` tanpa keluaran.

- [ ] **Step 8: Commit**

```bash
git add src/server/internal-catalog.ts src/server/catalog-admin-read.ts "src/app/(admin)/admin/booking/baru/page.tsx" "src/app/(admin)/admin/layanan/page.tsx" tests/integration/internal-catalog.test.ts
git commit -m "feat: read the internal catalog for admin pages instead of the public catalog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Situs publik membaca layanan situs

**Files:**
- Modify: `src/server/catalog.ts` (bagian layanan, baris 1–78)
- Test: `tests/integration/catalog.test.ts`

**Interfaces:**
- Consumes: `prisma.siteService` (Task 1).
- Produces: `CatalogService = { id: string; slug: string; name: string; description: string | null; imageUrl: string | null; priceNote: string | null; isSignature: boolean; sortOrder: number; categoryId: string; serviceId: string; promoPrice: number; normalPrice: number | null; durationMin: number }`; `ServiceWithCategory = CatalogService & { category: ServiceCategory }`. Fungsi `getServiceCategoriesWithServices`, `getServiceBySlug`, `getSignatureServices`, `getRelatedServices`, `countActiveServices`, `getAllServiceSlugs` tetap bernama sama dan mengembalikan bentuk ini (`id` = id layanan situs).

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `tests/integration/catalog.test.ts`, di dalam `describe("lapisan query katalog")`:

```ts
  it("memakai nama dan slug layanan situs, harga dan durasi dari layanan internal, tanpa kolom biaya", async () => {
    const hifu = await prisma.service.findUniqueOrThrow({ where: { slug: "hifu-wajah" } });
    const promo = await prisma.siteService.create({
      data: { slug: "hifu-promo-uji", name: "HIFU Promo Uji", categoryId: hifu.categoryId, serviceId: hifu.id, sortOrder: 99 },
    });
    try {
      const service = await getServiceBySlug("hifu-promo-uji");
      expect(service).toMatchObject({ id: promo.id, name: "HIFU Promo Uji", serviceId: hifu.id, promoPrice: 499000, normalPrice: 749000, durationMin: hifu.durationMin });
      expect(service).not.toHaveProperty("materialCost");
      expect(service).not.toHaveProperty("commissionValue");
      expect(await getAllServiceSlugs()).toContain("hifu-promo-uji");
    } finally {
      await prisma.siteService.delete({ where: { id: promo.id } });
    }
  });

  it("menyembunyikan layanan situs nonaktif walau layanan internalnya aktif", async () => {
    await prisma.siteService.update({ where: { slug: "lip-laser" }, data: { isActive: false } });
    try {
      expect(await getServiceBySlug("lip-laser")).toBeNull();
      expect(await getAllServiceSlugs()).not.toContain("lip-laser");
      const laser = (await getServiceCategoriesWithServices()).find((c) => c.slug === "laser");
      expect(laser?.services.map((s) => s.slug)).not.toContain("lip-laser");
    } finally {
      await prisma.siteService.update({ where: { slug: "lip-laser" }, data: { isActive: true } });
    }
  });

  it("item khusus internal tidak pernah tampil di situs", async () => {
    const facial = await prisma.serviceCategory.findUniqueOrThrow({ where: { slug: "facial" } });
    const internal = await prisma.service.create({ data: { slug: "addon-khusus-internal-uji", name: "Add-on Khusus Internal Uji", promoPrice: 10_000, categoryId: facial.id } });
    try {
      expect(await getAllServiceSlugs()).not.toContain("addon-khusus-internal-uji");
      const before = await countActiveServices();
      expect((await getServiceCategoriesWithServices()).flatMap((c) => c.services).some((s) => s.name === "Add-on Khusus Internal Uji")).toBe(false);
      expect(before).toBe((await getServiceCategoriesWithServices()).reduce((total, c) => total + c.services.length, 0));
    } finally {
      await prisma.service.delete({ where: { id: internal.id } });
    }
  });
```

Uji lama "menyembunyikan layanan yang dinonaktifkan" (menonaktifkan `Service` botox) tetap berlaku: layanan internal nonaktif menyembunyikan layanan situsnya (Review Focus 1).

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:integration -- tests/integration/catalog.test.ts`
Expected: FAIL — `getServiceBySlug("hifu-promo-uji")` mengembalikan `null`, dan uji lip-laser masih menemukan layanan.

- [ ] **Step 3: Tulis ulang bagian layanan `src/server/catalog.ts`**

Ganti baris 1 sampai akhir `getAllServiceSlugs` (sebelum `getPackagesByGroup`) dengan:

```ts
import type { Branch, Package, PackageItem, Product, ServiceCategory, Staff } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { PACKAGE_GROUPS } from "@/lib/package-group";

/**
 * Layanan di situs publik (spec layanan situs 3): isi dari layanan situs, harga dan durasi dari layanan internal yang ditautkan.
 * Tampil hanya bila keduanya aktif. Konsultasi Online tidak pernah tampil (spec konsultasi online 3.3).
 */
const VISIBLE = { isActive: true, service: { isActive: true, slug: { not: ONLINE_SERVICE_SLUG } } } as const;

// Kolom biaya dan komisi sengaja tidak dipilih: data situs tidak pernah memuatnya (spec layanan situs 3).
const SITE_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  imageUrl: true,
  priceNote: true,
  isSignature: true,
  sortOrder: true,
  categoryId: true,
  serviceId: true,
  service: { select: { promoPrice: true, normalPrice: true, durationMin: true } },
} as const;

export type CatalogService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceNote: string | null;
  isSignature: boolean;
  sortOrder: number;
  categoryId: string;
  serviceId: string;
  promoPrice: number;
  normalPrice: number | null;
  durationMin: number;
};

export type ServiceWithCategory = CatalogService & { category: ServiceCategory };

export type ServiceCategoryWithServices = ServiceCategory & { services: CatalogService[] };

type SiteRow = Omit<CatalogService, "promoPrice" | "normalPrice" | "durationMin"> & {
  service: { promoPrice: number; normalPrice: number | null; durationMin: number };
};

function toCatalogService({ service, ...row }: SiteRow): CatalogService {
  return { ...row, promoPrice: service.promoPrice, normalPrice: service.normalPrice, durationMin: service.durationMin };
}

// Ditulis dari tipe Prisma, bukan diturunkan dari getPackagesByGroup: fungsi
// itu sendiri beranotasi PackageGroup[], jadi menurunkannya akan melingkar.
export type PackageWithItems = Package & { items: PackageItem[] };

export type PackageGroup = { groupName: string; packages: PackageWithItems[] };

/** Kategori beserta layanan situs yang tampil. Kategori tanpa layanan yang tampil tidak dikembalikan. */
export async function getServiceCategoriesWithServices(): Promise<ServiceCategoryWithServices[]> {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { siteServices: { where: VISIBLE, orderBy: { sortOrder: "asc" }, select: SITE_SELECT } },
  });

  return categories
    .map(({ siteServices, ...category }) => ({ ...category, services: siteServices.map(toCatalogService) }))
    .filter((category) => category.services.length > 0);
}

export async function getServiceBySlug(slug: string): Promise<ServiceWithCategory | null> {
  const row = await prisma.siteService.findFirst({
    where: { slug, ...VISIBLE },
    select: { ...SITE_SELECT, category: true },
  });
  return row ? { ...toCatalogService(row), category: row.category } : null;
}

/** Layanan signature beserta kategorinya (foto kartu memakai foto kategori). */
export async function getSignatureServices(): Promise<ServiceWithCategory[]> {
  const rows = await prisma.siteService.findMany({
    where: { isSignature: true, ...VISIBLE },
    orderBy: { sortOrder: "asc" },
    select: { ...SITE_SELECT, category: true },
  });
  return rows.map((row) => ({ ...toCatalogService(row), category: row.category }));
}

/** Layanan situs lain dalam kategori yang sama, untuk "Treatment lain di …" di halaman detail. */
export async function getRelatedServices(categoryId: string, excludeServiceId: string, limit = 3): Promise<CatalogService[]> {
  const rows = await prisma.siteService.findMany({
    where: { categoryId, ...VISIBLE, id: { not: excludeServiceId } },
    orderBy: { sortOrder: "asc" },
    take: limit,
    select: SITE_SELECT,
  });
  return rows.map(toCatalogService);
}

/** Jumlah treatment yang tampil di situs, untuk angka di Beranda. */
export async function countActiveServices(): Promise<number> {
  return prisma.siteService.count({ where: VISIBLE });
}

export async function getAllServiceSlugs(): Promise<string[]> {
  const rows = await prisma.siteService.findMany({ where: VISIBLE, select: { slug: true } });
  return rows.map((row) => row.slug);
}
```

Biarkan fungsi `getPackagesByGroup` dan sesudahnya tidak berubah. `Service` tidak lagi diimpor dari `@prisma/client`; hapus bila `tsc` melaporkannya tidak terpakai.

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npm run test:integration -- tests/integration/catalog.test.ts && npx tsc --noEmit -p . && npx vitest run tests/unit/components/service-card.test.tsx tests/unit/site-images.test.ts`
Expected: semua PASS; `tsc` tanpa keluaran (komponen situs menerima `CatalogService` tanpa perubahan).

- [ ] **Step 5: Commit**

```bash
git add src/server/catalog.ts tests/integration/catalog.test.ts
git commit -m "feat: serve the public site from site services with prices from the linked internal service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Booking /daftar memakai layanan situs dan menolak item khusus internal

**Files:**
- Modify: `src/server/public-booking-data.ts` (blok `prisma.service.findMany` untuk treatment dan `treatments: treatments.map(toPublicService)`)
- Modify: `src/server/public-booking.ts:57-75` (`loadServiceAndBranch`)
- Modify: `tests/integration/public-booking-world.ts` (`createBookingWorld`)
- Test: `tests/integration/site-booking.test.ts`, `tests/integration/booking-options-site.test.ts`

**Interfaces:**
- Consumes: `prisma.siteService` (Task 1).
- Produces: `getBookingOptions().treatments` berisi id layanan internal dengan nama layanan situs; `loadServiceAndBranch` menolak layanan tanpa layanan situs aktif (kecuali Konsultasi Dokter).

- [ ] **Step 1: Dunia uji booking membuat layanan situs**

Di `tests/integration/public-booking-world.ts`, sesudah `const slimmingTreatment = await prisma.service.create({ … });` dan sebelum `return {`, tambahkan:

```ts
  // Treatment hanya bisa dipesan lewat situs bila punya layanan situs aktif (spec layanan situs 4.1).
  await prisma.siteService.createMany({
    data: [
      { slug: `${slug}-facial`, name: "Facial Uji", categoryId: aesthetic.id, serviceId: treatment.id },
      { slug: `${slug}-meso`, name: "Meso Uji", categoryId: slimming.id, serviceId: slimmingTreatment.id },
    ],
  });
```

`cleanupBookingWorld` tidak perlu diubah: layanan situs ikut terhapus bersama layanannya (`onDelete: Cascade`).

- [ ] **Step 2: Tulis uji yang gagal**

Tambahkan di `tests/integration/site-booking.test.ts` sesudah uji "tidak menawarkan treatment kategori slimming kepada pasien Aesthetic lama":

```ts
  it("menolak treatment khusus internal walau permintaannya dirakit sendiri (spec layanan situs 4.1)", async () => {
    const facial = await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } });
    const internal = await prisma.service.create({
      data: { slug: `${SLUG}-addon`, name: "Add-on Internal Uji", promoPrice: 50_000, durationMin: 30, categoryId: facial.categoryId },
    });
    const result = await holdSlot({ serviceId: internal.id, staffId: world.therapistId, branchId: world.branchId, startAt: at(date, "15:00").toISOString(), previousToken: null });
    expect(result).toEqual({ ok: false, error: "Layanan ini tidak tersedia untuk booking." });

    await prisma.siteService.updateMany({ where: { serviceId: world.treatmentId }, data: { isActive: false } });
    const hidden = await holdSlot({ serviceId: world.treatmentId, staffId: world.therapistId, branchId: world.branchId, startAt: at(date, "15:00").toISOString(), previousToken: null });
    expect(hidden).toEqual({ ok: false, error: "Layanan ini tidak tersedia untuk booking." });
  });
```

Buat `tests/integration/booking-options-site.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getBookingOptions } from "@/server/public-booking-data";
import { cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

const SLUG = "opsi-situs-uji";
let world: BookingWorld;

beforeAll(async () => {
  await cleanupBookingWorld(SLUG);
  world = await createBookingWorld(SLUG);
});
afterAll(async () => {
  await cleanupBookingWorld(SLUG);
  await prisma.$disconnect();
});

describe("pilihan treatment /daftar dari katalog situs", () => {
  it("memakai nama layanan situs dengan id, harga, dan durasi layanan internal; satu pilihan per layanan internal", async () => {
    const facial = await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } });
    await prisma.siteService.update({ where: { slug: `${SLUG}-facial` }, data: { name: "Facial Glowing Promo", sortOrder: 1 } });
    await prisma.siteService.create({ data: { slug: `${SLUG}-facial-2`, name: "Facial Kedua", categoryId: facial.categoryId, serviceId: facial.id, sortOrder: 2 } });

    const { treatments } = await getBookingOptions();
    const matches = treatments.filter((t) => t.id === world.treatmentId);
    expect(matches).toEqual([{ id: world.treatmentId, name: "Facial Glowing Promo", price: 250000, durationMin: 60, requiresDoctor: false }]);
  });

  it("tidak menawarkan item khusus internal atau layanan internal nonaktif", async () => {
    const facial = await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } });
    const internal = await prisma.service.create({ data: { slug: `${SLUG}-addon`, name: "Add-on Opsi Uji", promoPrice: 10_000, categoryId: facial.categoryId } });
    expect((await getBookingOptions()).treatments.some((t) => t.id === internal.id)).toBe(false);

    await prisma.service.update({ where: { id: world.treatmentId }, data: { isActive: false } });
    expect((await getBookingOptions()).treatments.some((t) => t.id === world.treatmentId)).toBe(false);
    await prisma.service.update({ where: { id: world.treatmentId }, data: { isActive: true } });
  });
});
```

- [ ] **Step 3: Jalankan uji, pastikan gagal**

Run: `npm run test:integration -- tests/integration/site-booking.test.ts tests/integration/booking-options-site.test.ts`
Expected: FAIL — `holdSlot` untuk add-on internal tidak ditolak dengan pesan itu, dan nama pilihan masih "Facial Uji".

- [ ] **Step 4: Opsi treatment dari layanan situs**

Di `src/server/public-booking-data.ts`, ganti blok kedua `prisma.service.findMany({ where: { isActive: true, slug: { notIn: [CONSULTATION_SERVICE_SLUG, ONLINE_SERVICE_SLUG] }, category: { slug: { not: SLIMMING_CATEGORY_SLUG } } }, orderBy: …, select: SERVICE_SELECT })` di `Promise.all` dengan:

```ts
    // Treatment yang ditawarkan adalah layanan situs (nama promosi) yang layanan internalnya aktif (spec layanan situs 4.1).
    prisma.siteService.findMany({
      where: {
        isActive: true,
        service: {
          isActive: true,
          slug: { notIn: [CONSULTATION_SERVICE_SLUG, ONLINE_SERVICE_SLUG] },
          category: { slug: { not: SLIMMING_CATEGORY_SLUG } },
        },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: { name: true, service: { select: SERVICE_SELECT } },
    }),
```

Tambahkan fungsi ini sesudah `toPublicService`:

```ts
/** Satu pilihan per layanan internal, bernama layanan situs yang urutannya paling awal (spec layanan situs 4.1). */
function siteTreatments(rows: { name: string; service: Parameters<typeof toPublicService>[0] }[]): PublicService[] {
  const seen = new Set<string>();
  const options: PublicService[] = [];
  for (const row of rows) {
    if (seen.has(row.service.id)) continue;
    seen.add(row.service.id);
    options.push(toPublicService({ ...row.service, name: row.name }));
  }
  return options;
}
```

dan ganti `treatments: treatments.map(toPublicService),` menjadi `treatments: siteTreatments(treatments),`.

- [ ] **Step 5: Penjaga booking**

Di `src/server/public-booking.ts`, pada `loadServiceAndBranch`, tambahkan ke `select` layanan:

```ts
        siteServices: { where: { isActive: true }, select: { id: true }, take: 1 },
```

dan ganti baris `if (!service?.isActive) throw new UserFacingError("Layanan ini tidak tersedia untuk booking.");` dengan:

```ts
  // Treatment hanya dipesan lewat layanan situs yang aktif; item khusus internal tidak bisa dipesan pasien (spec layanan situs 4.1).
  const listedOnSite = service?.slug === CONSULTATION_SERVICE_SLUG || (service?.siteServices.length ?? 0) > 0;
  if (!service?.isActive || !listedOnSite) throw new UserFacingError("Layanan ini tidak tersedia untuk booking.");
```

(`CONSULTATION_SERVICE_SLUG` sudah diimpor di berkas ini; periksa dengan `grep -n CONSULTATION_SERVICE_SLUG src/server/public-booking.ts`.)

- [ ] **Step 6: Jalankan uji, pastikan lulus**

Run: `npm run test:integration -- tests/integration/site-booking.test.ts tests/integration/booking-options-site.test.ts tests/integration/public-slots.test.ts tests/integration/online-public.test.ts && npx tsc --noEmit -p .`
Expected: semua PASS; `tsc` tanpa keluaran.

- [ ] **Step 7: Commit**

```bash
git add src/server/public-booking-data.ts src/server/public-booking.ts tests/integration/public-booking-world.ts tests/integration/site-booking.test.ts tests/integration/booking-options-site.test.ts
git commit -m "feat: offer site services on /daftar and refuse booking internal-only treatments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Validasi katalog dan alamat foto layanan

**Files:**
- Create: `src/lib/service-catalog.ts`
- Test: `tests/unit/service-catalog.test.ts`

**Interfaces:**
- Consumes: `Validation<T>` dari `src/lib/stock.ts`, `validatePriceChange` dari `src/lib/price-validation.ts`, `slugify` dari `src/lib/slug.ts`, `DOCTOR_PHOTO_NAME` dari `src/lib/doctor-profile.ts`.
- Produces:
  - `InternalServiceInput = { name: string; categoryId: string; promoPrice: number; normalPrice: number | null; durationMin: number; requiresDoctor: boolean }`, `validateInternalService(raw: unknown): Validation<InternalServiceInput>`.
  - `SiteServiceInput = { serviceId: string; name: string; slug: string; categoryId: string; description: string | null; priceNote: string | null; isSignature: boolean; sortOrder: number }`, `validateSiteService(raw: unknown): Validation<SiteServiceInput>`.
  - `siteSlugFrom(name: string): string`.
  - `SITE_PHOTO_PATH_PREFIX = "/foto-layanan/"`, `siteServicePhotoUrl(name: string): string`, `siteServicePhotoName(url: string | null | undefined): string | null`, `siteServicePhotoPreviewUrl(url: string | null | undefined): string | null`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/service-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  siteServicePhotoName,
  siteServicePhotoPreviewUrl,
  siteServicePhotoUrl,
  siteSlugFrom,
  validateInternalService,
  validateSiteService,
} from "@/lib/service-catalog";

const internal = { name: "  Add-on   Masker  ", categoryId: "c1", promoPrice: 75_000, normalPrice: null, durationMin: 30, requiresDoctor: false };
const site = { serviceId: "s1", name: "Masker Glow", slug: "masker-glow", categoryId: "c1", description: "  Baris satu\r\nBaris dua  ", priceNote: "", isSignature: false, sortOrder: 3 };

describe("validasi layanan internal", () => {
  it("merapikan nama dan menerima isian sah", () => {
    expect(validateInternalService(internal)).toEqual({ ok: true, value: { ...internal, name: "Add-on Masker" } });
  });

  it.each([
    [{ name: "" }, "Isi nama layanan."],
    [{ name: "A" }, "Nama layanan 2–100 karakter."],
    [{ name: "x".repeat(101) }, "Nama layanan 2–100 karakter."],
    [{ categoryId: "" }, "Pilih kategori."],
    [{ promoPrice: 0 }, "Harga harus lebih dari nol."],
    [{ promoPrice: Number.NaN }, "Harga harus bilangan bulat rupiah, tanpa desimal."],
    [{ normalPrice: 50_000 }, "Harga promo harus lebih murah dari harga coret."],
    [{ durationMin: 20 }, "Durasi 15–480 menit, kelipatan 15."],
    [{ durationMin: 495 }, "Durasi 15–480 menit, kelipatan 15."],
    [{ durationMin: 0 }, "Durasi 15–480 menit, kelipatan 15."],
  ])("menolak %j", (patch, message) => {
    expect(validateInternalService({ ...internal, ...patch })).toEqual({ ok: false, message });
  });

  it("menolak bentuk data yang rusak", () => {
    expect(validateInternalService(null)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
    expect(validateInternalService({ ...internal, requiresDoctor: "ya" })).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("validasi layanan situs", () => {
  it("merapikan deskripsi (baris baru dipertahankan) dan mengosongkan satuan harga kosong", () => {
    expect(validateSiteService(site)).toEqual({ ok: true, value: { ...site, description: "Baris satu\nBaris dua", priceNote: null } });
  });

  it.each([
    [{ serviceId: "" }, "Pilih layanan internal."],
    [{ name: " " }, "Isi nama di situs."],
    [{ name: "M" }, "Nama di situs 2–100 karakter."],
    [{ slug: "" }, "Isi alamat (slug)."],
    [{ slug: "Masker Glow" }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ slug: "masker--glow" }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ slug: "-masker" }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ slug: "m" }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ slug: "m".repeat(81) }, "Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter)."],
    [{ categoryId: "" }, "Pilih kategori."],
    [{ description: "x".repeat(2001) }, "Deskripsi paling banyak 2.000 karakter."],
    [{ priceNote: "x".repeat(41) }, "Satuan harga paling banyak 40 karakter."],
    [{ sortOrder: -1 }, "Urutan harus bilangan bulat 0–9999."],
    [{ sortOrder: 1.5 }, "Urutan harus bilangan bulat 0–9999."],
  ])("menolak %j", (patch, message) => {
    expect(validateSiteService({ ...site, ...patch })).toEqual({ ok: false, message });
  });
});

describe("slug dan foto layanan situs", () => {
  it("membuat slug dari nama, paling panjang 80 karakter tanpa tanda hubung di ujung", () => {
    expect(siteSlugFrom("Facial Glow + Masker (Promo!)")).toBe("facial-glow-masker-promo");
    expect(siteSlugFrom(`${"a".repeat(79)} b`)).toBe("a".repeat(79));
  });

  it("alamat foto hanya untuk nama berkas unggahan yang sah", () => {
    const name = "ssabc123-0123abcd.webp";
    expect(siteServicePhotoUrl(name)).toBe("/foto-layanan/ssabc123-0123abcd.webp");
    expect(siteServicePhotoName("/foto-layanan/ssabc123-0123abcd.webp")).toBe(name);
    expect(siteServicePhotoPreviewUrl("/foto-layanan/ssabc123-0123abcd.webp")).toBe("/admin/layanan/foto/ssabc123-0123abcd.webp");
    for (const url of [null, undefined, "/images/layanan/hifu.jpg", "/foto-layanan/../rahasia.webp", "/foto-dokter/ssabc123-0123abcd.webp"]) {
      expect(siteServicePhotoName(url)).toBeNull();
      expect(siteServicePhotoPreviewUrl(url)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/service-catalog.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/service-catalog"`.

- [ ] **Step 3: Buat `src/lib/service-catalog.ts`**

```ts
import { DOCTOR_PHOTO_NAME } from "./doctor-profile";
import { validatePriceChange } from "./price-validation";
import { slugify } from "./slug";
import type { Validation } from "./stock";

/** Aturan katalog layanan internal dan situs (spec layanan situs 2 dan 5). Murni: dipakai server dan komponen klien. */
export const SITE_PHOTO_PATH_PREFIX = "/foto-layanan/";
const SITE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const oneLine = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : null);

export type InternalServiceInput = {
  name: string;
  categoryId: string;
  promoPrice: number;
  normalPrice: number | null;
  durationMin: number;
  requiresDoctor: boolean;
};

export function validateInternalService(raw: unknown): Validation<InternalServiceInput> {
  if (!isObject(raw)) return fail(INVALID);
  const name = oneLine(raw.name);
  if (name === null || typeof raw.requiresDoctor !== "boolean") return fail(INVALID);
  if (!name) return fail("Isi nama layanan.");
  if (name.length < 2 || name.length > 100) return fail("Nama layanan 2–100 karakter.");
  if (typeof raw.categoryId !== "string" || !raw.categoryId) return fail("Pilih kategori.");
  if (typeof raw.promoPrice !== "number" || (raw.normalPrice !== null && typeof raw.normalPrice !== "number")) return fail(INVALID);
  const priceError = validatePriceChange({ promoPrice: raw.promoPrice, normalPrice: raw.normalPrice as number | null });
  if (priceError) return fail(priceError);
  const duration = raw.durationMin;
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 15 || duration > 480 || duration % 15 !== 0) {
    return fail("Durasi 15–480 menit, kelipatan 15.");
  }
  return {
    ok: true,
    value: { name, categoryId: raw.categoryId, promoPrice: raw.promoPrice, normalPrice: raw.normalPrice as number | null, durationMin: duration, requiresDoctor: raw.requiresDoctor },
  };
}

export type SiteServiceInput = {
  serviceId: string;
  name: string;
  slug: string;
  categoryId: string;
  description: string | null;
  priceNote: string | null;
  isSignature: boolean;
  sortOrder: number;
};

export function validateSiteService(raw: unknown): Validation<SiteServiceInput> {
  if (!isObject(raw)) return fail(INVALID);
  const name = oneLine(raw.name);
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : null;
  const priceNote = raw.priceNote === null || raw.priceNote === undefined ? "" : oneLine(raw.priceNote);
  const description =
    raw.description === null || raw.description === undefined ? "" : typeof raw.description === "string" ? raw.description.replace(/\r\n/g, "\n").trim() : null;
  if (name === null || slug === null || priceNote === null || description === null || typeof raw.isSignature !== "boolean") return fail(INVALID);
  if (typeof raw.serviceId !== "string" || !raw.serviceId) return fail("Pilih layanan internal.");
  if (!name) return fail("Isi nama di situs.");
  if (name.length < 2 || name.length > 100) return fail("Nama di situs 2–100 karakter.");
  if (!slug) return fail("Isi alamat (slug).");
  if (slug.length < 2 || slug.length > 80 || !SITE_SLUG.test(slug)) return fail("Alamat hanya huruf kecil, angka, dan tanda hubung (2–80 karakter).");
  if (typeof raw.categoryId !== "string" || !raw.categoryId) return fail("Pilih kategori.");
  if (description.length > 2000) return fail("Deskripsi paling banyak 2.000 karakter.");
  if (priceNote.length > 40) return fail("Satuan harga paling banyak 40 karakter.");
  const sortOrder = raw.sortOrder;
  if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) return fail("Urutan harus bilangan bulat 0–9999.");
  return {
    ok: true,
    value: {
      serviceId: raw.serviceId,
      name,
      slug,
      categoryId: raw.categoryId,
      description: description || null,
      priceNote: priceNote || null,
      isSignature: raw.isSignature,
      sortOrder,
    },
  };
}

/** Slug usulan dari nama, dipotong 80 karakter tanpa tanda hubung di ujung. */
export function siteSlugFrom(name: string): string {
  return slugify(name).slice(0, 80).replace(/-+$/, "");
}

export function siteServicePhotoUrl(name: string): string {
  return `${SITE_PHOTO_PATH_PREFIX}${name}`;
}

/** Nama berkas dari `imageUrl`, atau null bila bukan foto unggahan yang sah (foto lokal lama atau kosong). */
export function siteServicePhotoName(url: string | null | undefined): string | null {
  if (!url?.startsWith(SITE_PHOTO_PATH_PREFIX)) return null;
  const name = url.slice(SITE_PHOTO_PATH_PREFIX.length);
  return DOCTOR_PHOTO_NAME.test(name) ? name : null;
}

/** Alamat pratinjau di panel (tidak bergantung pada tampil-tidaknya layanan di situs); null bila bukan foto unggahan. */
export function siteServicePhotoPreviewUrl(url: string | null | undefined): string | null {
  const name = siteServicePhotoName(url);
  return name ? `/admin/layanan/foto/${name}` : null;
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx vitest run tests/unit/service-catalog.test.ts && npx tsc --noEmit -p .`
Expected: semua PASS; `tsc` tanpa keluaran.

- [ ] **Step 5: Commit**

```bash
git add src/lib/service-catalog.ts tests/unit/service-catalog.test.ts
git commit -m "feat: validate internal and site services and build site photo addresses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Aksi layanan internal

**Files:**
- Create: `src/server/catalog-revalidate.ts`
- Modify: `src/server/service-admin.ts` (tambah `createInternalService`, `updateInternalService`; tulis ulang `setServiceActive`; revalidasi `updateServicePrice`)
- Modify: `src/lib/audit-labels.ts`
- Test: `tests/integration/internal-service-admin.test.ts`, `tests/unit/audit-labels.test.ts`

**Interfaces:**
- Consumes: `validateInternalService`, `InternalServiceInput` (Task 5); `isConsultationDuration`, `CONSULTATION_SERVICE_SLUG` dari `src/lib/booking-rules.ts`.
- Produces:
  - `revalidateSitePages(slugs: readonly string[]): void` dan `revalidateServicePages(serviceId: string): Promise<void>` di `src/server/catalog-revalidate.ts`.
  - `createInternalService(input: InternalServiceInput): Promise<ActionResult<{ id: string }>>`.
  - `updateInternalService(input: { id: string } & InternalServiceInput): Promise<ActionResult>`.
  - `setServiceActive(input: { id: string; active: boolean }): Promise<ActionResult>` (tanda tangan baru; tidak ada pemanggil lama).

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/internal-service-admin.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createInternalService, setServiceActive, updateInternalService } from "@/server/service-admin";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Katalog", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
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

const SLUG = "aksi-internal";
const NAME = "Uji Aksi Internal";
let categoryId: string;
const base = () => ({ name: `${NAME} Masker`, categoryId, promoPrice: 75_000, normalPrice: null, durationMin: 30, requiresDoctor: false });

async function clean() {
  await prisma.service.deleteMany({ where: { name: { startsWith: NAME } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Keuangan Katalog" } });
}

beforeAll(async () => {
  await clean();
  categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Aksi", sortOrder: 97 } })).id;
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("aksi layanan internal (spec layanan situs 5.1)", () => {
  it("Admin Keuangan menambah layanan khusus internal dengan slug otomatis; tercatat di audit; tidak tampil di situs", async () => {
    const { id } = await unwrap(createInternalService(base()));
    const created = await prisma.service.findUniqueOrThrow({ where: { id }, include: { siteServices: true } });
    expect(created).toMatchObject({ name: `${NAME} Masker`, slug: "uji-aksi-internal-masker", promoPrice: 75_000, durationMin: 30, isActive: true, categoryId });
    expect(created.siteServices).toEqual([]);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service.create", entityId: id } })).summary).toBe(`${NAME} Masker: Rp 75.000, 30 menit`);

    // Nama kembar (tanpa membedakan huruf) ditolak; slug berikutnya diberi akhiran.
    expect(await createInternalService({ ...base(), name: `${NAME.toUpperCase()} MASKER` })).toEqual({ ok: false, error: "Nama layanan sudah dipakai layanan lain." });
    const second = await unwrap(createInternalService({ ...base(), name: `${NAME} Masker!` }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id: second.id } })).slug).toBe("uji-aksi-internal-masker-2");
  });

  it("mengubah nama, kategori, harga, durasi, dan perlu dokter", async () => {
    const { id } = await unwrap(createInternalService({ ...base(), name: `${NAME} Ubah` }));
    await unwrap(updateInternalService({ id, ...base(), name: `${NAME} Ubah Baru`, promoPrice: 90_000, normalPrice: 120_000, durationMin: 45, requiresDoctor: true }));
    expect(await prisma.service.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: `${NAME} Ubah Baru`, slug: "uji-aksi-internal-ubah", promoPrice: 90_000, normalPrice: 120_000, durationMin: 45, requiresDoctor: true });
    expect(await updateInternalService({ id, ...base(), durationMin: 50 })).toEqual({ ok: false, error: "Durasi 15–480 menit, kelipatan 15." });
    expect(await updateInternalService({ id: "tidak-ada", ...base() })).toEqual({ ok: false, error: "Layanan tidak ditemukan." });
  });

  it("Konsultasi Dokter: durasi hanya 15/30/45/60 dan tidak bisa dinonaktifkan; Konsultasi Online tidak diubah lewat aksi ini (Review Focus 3)", async () => {
    const consultation = await prisma.service.findUniqueOrThrow({ where: { slug: "konsultasi-dokter" } });
    const input = { id: consultation.id, name: consultation.name, categoryId: consultation.categoryId, promoPrice: consultation.promoPrice, normalPrice: consultation.normalPrice, durationMin: 90, requiresDoctor: true };
    expect(await updateInternalService(input)).toEqual({ ok: false, error: "Durasi Konsultasi Dokter harus 15, 30, 45, atau 60 menit." });
    expect(await setServiceActive({ id: consultation.id, active: false })).toEqual({ ok: false, error: "Konsultasi Dokter tidak bisa dinonaktifkan." });

    const online = await prisma.service.findUnique({ where: { slug: "konsultasi-online" } });
    if (online) {
      expect(await updateInternalService({ ...input, id: online.id, durationMin: 30 })).toEqual({ ok: false, error: "Layanan tidak ditemukan." });
      expect(await setServiceActive({ id: online.id, active: true })).toEqual({ ok: false, error: "Layanan tidak ditemukan." });
    }
  });

  it("menonaktifkan dan mengaktifkan; tercatat di audit", async () => {
    const { id } = await unwrap(createInternalService({ ...base(), name: `${NAME} Status` }));
    await unwrap(setServiceActive({ id, active: false }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id } })).isActive).toBe(false);
    await unwrap(setServiceActive({ id, active: true }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: { in: ["service.deactivate", "service.activate"] } } })).toBe(2);
  });

  it("Super Admin boleh; Resepsionis dan Apoteker ditolak", async () => {
    actor.role = "SUPER_ADMIN";
    await unwrap(createInternalService({ ...base(), name: `${NAME} Pemilik` }));
    for (const role of ["RESEPSIONIS", "APOTEKER"] as const) {
      actor.role = role;
      await expect(createInternalService({ ...base(), name: `${NAME} Ditolak` })).rejects.toThrow("forbidden: catalog:manage");
      await expect(setServiceActive({ id: "x", active: false })).rejects.toThrow("forbidden: catalog:manage");
    }
  });
});
```

Tambahkan di `tests/unit/audit-labels.test.ts`:

```ts
  it("aksi katalog layanan punya bahasa manusia", () => {
    expect(auditActionLabel("service.create")).toBe("menambah layanan internal");
    expect(auditActionLabel("service.update")).toBe("mengubah layanan internal");
    expect(auditActionLabel("site_service.create")).toBe("menambah layanan situs");
    expect(auditActionLabel("site_service.update")).toBe("mengubah layanan situs");
    expect(auditActionLabel("site_service.activate")).toBe("mengaktifkan layanan situs");
    expect(auditActionLabel("site_service.deactivate")).toBe("menonaktifkan layanan situs");
    expect(auditActionLabel("site_service.photo")).toBe("mengganti foto layanan situs");
  });
```

Catatan: `runAction` mengembalikan `UserFacingError` sebagai `{ ok: false, error }`, sedangkan galat biasa (seperti `forbidden:` dari tiruan sesi) dilempar ulang. Itulah sebabnya uji hak memakai `rejects.toThrow`, sama seperti `tests/integration/service-cost.test.ts`.

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:integration -- tests/integration/internal-service-admin.test.ts && npx vitest run tests/unit/audit-labels.test.ts`
Expected: FAIL — `createInternalService is not a function` dan label belum ada.

- [ ] **Step 3: Buat `src/server/catalog-revalidate.ts`**

```ts
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";

const CATALOG_PAGES = ["/", "/layanan", "/program-slimming", "/daftar", "/admin/layanan", "/admin/booking/baru"] as const;

/** Halaman yang memuat katalog di-prerender; tanpa ini perubahan baru tampil saat deploy berikutnya (spec layanan situs 5.2). */
export function revalidateSitePages(slugs: readonly string[]): void {
  for (const path of CATALOG_PAGES) safeRevalidatePath(path);
  for (const slug of new Set(slugs)) safeRevalidatePath(`/layanan/${slug}`);
}

/** Halaman situs yang menampilkan harga atau status layanan internal ini lewat layanan situsnya. */
export async function revalidateServicePages(serviceId: string): Promise<void> {
  const linked = await prisma.siteService.findMany({ where: { serviceId }, select: { slug: true } });
  revalidateSitePages(linked.map((row) => row.slug));
}
```

- [ ] **Step 4: Aksi di `src/server/service-admin.ts`**

Tambahkan import:

```ts
import { validateInternalService, type InternalServiceInput } from "@/lib/service-catalog";
import { slugify } from "@/lib/slug";
import { revalidateServicePages } from "@/server/catalog-revalidate";
```

(`CONSULTATION_SERVICE_SLUG`, `isConsultationDuration`, `ONLINE_SERVICE_SLUG`, `formatRupiah`, `recordAudit` sudah diimpor.)

Di `updateServicePrice`, ganti tiga baris `safeRevalidatePath("/layanan"); safeRevalidatePath(`/layanan/${after.slug}`); safeRevalidatePath("/");` (beserta komentarnya tetap) dengan:

```ts
    await revalidateServicePages(after.id);
```

Ganti seluruh fungsi `setServiceActive` dengan:

```ts
const SERVICE_NOT_FOUND = "Layanan tidak ditemukan.";

/** Layanan yang boleh diubah lewat katalog internal: semua kecuali Konsultasi Online, yang punya kartunya sendiri. */
async function findEditableService(id: unknown) {
  const service = await prisma.service.findUnique({ where: { id: String(id ?? "") }, select: { id: true, slug: true, name: true } });
  if (!service || service.slug === ONLINE_SERVICE_SLUG) throw new UserFacingError(SERVICE_NOT_FOUND);
  return service;
}

async function assertCategory(categoryId: string) {
  const category = await prisma.serviceCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) throw new UserFacingError("Pilih kategori.");
}

/** Nama unik tanpa membedakan huruf besar/kecil, supaya pilihan di tagihan tidak kembar (spec layanan situs 2.1). */
async function assertUniqueName(name: string, exceptId: string | null) {
  const clash = await prisma.service.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new UserFacingError("Nama layanan sudah dipakai layanan lain.");
}

/** Slug internal dibuat sekali dari nama, tidak pernah tampil, dan tidak berubah sesudahnya. */
async function uniqueServiceSlug(name: string): Promise<string> {
  const base = slugify(name) || "layanan";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await prisma.service.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}

/** Tambah layanan internal (spec layanan situs 5.1); belum tampil di situs sampai ada layanan situs yang menautkannya. */
export async function createInternalService(input: InternalServiceInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const checked = validateInternalService(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    await assertCategory(value.categoryId);
    await assertUniqueName(value.name, null);

    const created = await prisma.service.create({ data: { ...value, slug: await uniqueServiceSlug(value.name) }, select: { id: true, name: true } });
    await recordAudit({
      actor,
      action: "service.create",
      entity: "Service",
      entityId: created.id,
      summary: `${created.name}: ${formatRupiah(value.promoPrice)}, ${value.durationMin} menit`,
    });
    await revalidateServicePages(created.id);
    return { id: created.id };
  });
}

export async function updateInternalService(input: { id: string } & InternalServiceInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const checked = validateInternalService(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    const before = await findEditableService(input?.id);
    if (before.slug === CONSULTATION_SERVICE_SLUG && !isConsultationDuration(value.durationMin)) {
      throw new UserFacingError("Durasi Konsultasi Dokter harus 15, 30, 45, atau 60 menit.");
    }
    await assertCategory(value.categoryId);
    await assertUniqueName(value.name, before.id);

    await prisma.service.update({ where: { id: before.id }, data: value });
    await recordAudit({
      actor,
      action: "service.update",
      entity: "Service",
      entityId: before.id,
      summary: before.name === value.name ? value.name : `${before.name} -> ${value.name}`,
    });
    await revalidateServicePages(before.id);
  });
}

/** Aktif/nonaktif layanan internal; menonaktifkan ikut menyembunyikan layanan situs yang menautkannya (spec layanan situs 3). */
export async function setServiceActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const service = await findEditableService(input?.id);
    const active = input?.active === true;
    if (!active && service.slug === CONSULTATION_SERVICE_SLUG) throw new UserFacingError("Konsultasi Dokter tidak bisa dinonaktifkan.");

    await prisma.service.update({ where: { id: service.id }, data: { isActive: active } });
    await recordAudit({ actor, action: active ? "service.activate" : "service.deactivate", entity: "Service", entityId: service.id, summary: service.name });
    await revalidateServicePages(service.id);
  });
}
```

- [ ] **Step 5: Label audit**

Di `src/lib/audit-labels.ts`, tambahkan sesudah `"staff.photo.remove": "menghapus foto staf",`:

```ts
  "service.create": "menambah layanan internal",
  "service.update": "mengubah layanan internal",
  "site_service.create": "menambah layanan situs",
  "site_service.update": "mengubah layanan situs",
  "site_service.activate": "mengaktifkan layanan situs",
  "site_service.deactivate": "menonaktifkan layanan situs",
  "site_service.photo": "mengganti foto layanan situs",
```

- [ ] **Step 6: Jalankan uji, pastikan lulus**

Run: `npm run test:integration -- tests/integration/internal-service-admin.test.ts tests/integration/service-cost.test.ts tests/integration/consultation-duration.test.ts && npx vitest run tests/unit/audit-labels.test.ts && npx tsc --noEmit -p .`
Expected: semua PASS; `tsc` tanpa keluaran.

- [ ] **Step 7: Commit**

```bash
git add src/server/catalog-revalidate.ts src/server/service-admin.ts src/lib/audit-labels.ts tests/integration/internal-service-admin.test.ts tests/unit/audit-labels.test.ts
git commit -m "feat: add, edit, and switch internal services from the catalog with consultation guards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Aksi layanan situs

**Files:**
- Create: `src/server/site-service-admin.ts`
- Test: `tests/integration/site-service-admin.test.ts`

**Interfaces:**
- Consumes: `validateSiteService`, `SiteServiceInput` (Task 5); `revalidateSitePages` (Task 6); `isUniqueViolation` dari `src/server/db-errors.ts`.
- Produces (berkas `"use server"`):
  - `createSiteService(input: SiteServiceInput): Promise<ActionResult<{ id: string }>>`
  - `updateSiteService(input: { id: string } & SiteServiceInput): Promise<ActionResult>`
  - `setSiteServiceActive(input: { id: string; active: boolean }): Promise<ActionResult>`
  - `removeSiteServicePhoto(id: string): Promise<ActionResult>` — ditambahkan di Task 8 ke berkas yang sama.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/site-service-admin.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getServiceBySlug } from "@/server/catalog";
import { createSiteService, setSiteServiceActive, updateSiteService } from "@/server/site-service-admin";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Pemilik Situs", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
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

const SLUG = "aksi-situs";
let categoryId: string;
let serviceId: string;
const base = () => ({ serviceId, name: "Masker Glow Situs", slug: `${SLUG}-masker`, categoryId, description: "Masker wajah.", priceNote: null, isSignature: false, sortOrder: 1 });

async function clean() {
  await prisma.service.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Pemilik Situs" } });
}

beforeAll(async () => {
  await clean();
  categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Situs", sortOrder: 96 } })).id;
  serviceId = (await prisma.service.create({ data: { slug: `${SLUG}-internal`, name: "Masker Internal Situs", promoPrice: 80_000, durationMin: 30, categoryId } })).id;
});
beforeEach(() => {
  actor.role = "SUPER_ADMIN";
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("aksi layanan situs (spec layanan situs 5.2)", () => {
  it("membuat layanan situs yang langsung tampil dengan harga layanan internal; tercatat di audit", async () => {
    const { id } = await unwrap(createSiteService(base()));
    expect(await getServiceBySlug(`${SLUG}-masker`)).toMatchObject({ id, name: "Masker Glow Situs", promoPrice: 80_000, description: "Masker wajah." });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "site_service.create", entityId: id } })).summary).toBe(`Masker Glow Situs (/layanan/${SLUG}-masker)`);
  });

  it("slug bentrok ditolak dengan pesan, bukan galat (Review Focus 4)", async () => {
    expect(await createSiteService({ ...base(), name: "Masker Lain" })).toEqual({ ok: false, error: "Alamat (slug) sudah dipakai layanan situs lain." });
    const other = await unwrap(createSiteService({ ...base(), name: "Masker Lain", slug: `${SLUG}-lain` }));
    expect(await updateSiteService({ id: other.id, ...base(), name: "Masker Lain" })).toEqual({ ok: false, error: "Alamat (slug) sudah dipakai layanan situs lain." });
  });

  it("mengubah slug memindahkan halaman; audit menyebut alamat lama dan baru", async () => {
    const { id } = await unwrap(createSiteService({ ...base(), name: "Masker Pindah", slug: `${SLUG}-pindah` }));
    await unwrap(updateSiteService({ id, ...base(), name: "Masker Pindah", slug: `${SLUG}-pindah-baru` }));
    expect(await getServiceBySlug(`${SLUG}-pindah`)).toBeNull();
    expect((await getServiceBySlug(`${SLUG}-pindah-baru`))?.name).toBe("Masker Pindah");
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "site_service.update", entityId: id } })).summary).toBe(
      `Masker Pindah: /layanan/${SLUG}-pindah -> /layanan/${SLUG}-pindah-baru`,
    );
    expect(await updateSiteService({ id: "tidak-ada", ...base(), slug: `${SLUG}-x` })).toEqual({ ok: false, error: "Layanan situs tidak ditemukan." });
  });

  it("menolak tautan ke Konsultasi Online, layanan yang tidak ada, atau kategori yang tidak ada", async () => {
    const online = await prisma.service.findUnique({ where: { slug: "konsultasi-online" } });
    if (online) expect(await createSiteService({ ...base(), slug: `${SLUG}-online`, serviceId: online.id })).toEqual({ ok: false, error: "Pilih layanan internal yang sah." });
    expect(await createSiteService({ ...base(), slug: `${SLUG}-hantu`, serviceId: "tidak-ada" })).toEqual({ ok: false, error: "Pilih layanan internal yang sah." });
    expect(await createSiteService({ ...base(), slug: `${SLUG}-kat`, categoryId: "tidak-ada" })).toEqual({ ok: false, error: "Pilih kategori." });
  });

  it("menonaktifkan menyembunyikan dari situs; Admin Keuangan boleh, Resepsionis dan Apoteker tidak", async () => {
    const { id } = await unwrap(createSiteService({ ...base(), name: "Masker Status", slug: `${SLUG}-status` }));
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(setSiteServiceActive({ id, active: false }));
    expect(await getServiceBySlug(`${SLUG}-status`)).toBeNull();
    await unwrap(setSiteServiceActive({ id, active: true }));
    expect(await getServiceBySlug(`${SLUG}-status`)).not.toBeNull();
    for (const role of ["RESEPSIONIS", "APOTEKER"] as const) {
      actor.role = role;
      await expect(setSiteServiceActive({ id, active: false })).rejects.toThrow("forbidden: catalog:manage");
      await expect(createSiteService({ ...base(), slug: `${SLUG}-tolak` })).rejects.toThrow("forbidden: catalog:manage");
    }
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:integration -- tests/integration/site-service-admin.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/site-service-admin"`.

- [ ] **Step 3: Buat `src/server/site-service-admin.ts`**

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { validateSiteService, type SiteServiceInput } from "@/lib/service-catalog";
import { recordAudit } from "@/server/audit";
import { revalidateSitePages } from "@/server/catalog-revalidate";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

const SLUG_TAKEN = "Alamat (slug) sudah dipakai layanan situs lain.";
const NOT_FOUND = "Layanan situs tidak ditemukan.";

/** Tautan wajib ke layanan internal yang ada, bukan Konsultasi Online; kategori harus ada (spec layanan situs 2.2). */
async function checkLinks(value: SiteServiceInput) {
  const service = await prisma.service.findUnique({ where: { id: value.serviceId }, select: { slug: true } });
  if (!service || service.slug === ONLINE_SERVICE_SLUG) throw new UserFacingError("Pilih layanan internal yang sah.");
  const category = await prisma.serviceCategory.findUnique({ where: { id: value.categoryId }, select: { id: true } });
  if (!category) throw new UserFacingError("Pilih kategori.");
}

async function slugGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError(SLUG_TAKEN);
    throw error;
  }
}

export async function createSiteService(input: SiteServiceInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const checked = validateSiteService(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    await checkLinks(checked.value);

    const created = await slugGuard(() => prisma.siteService.create({ data: checked.value, select: { id: true, slug: true, name: true } }));
    await recordAudit({ actor, action: "site_service.create", entity: "SiteService", entityId: created.id, summary: `${created.name} (/layanan/${created.slug})` });
    revalidateSitePages([created.slug]);
    return { id: created.id };
  });
}

export async function updateSiteService(input: { id: string } & SiteServiceInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const checked = validateSiteService(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const before = await prisma.siteService.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true, slug: true } });
    if (!before) throw new UserFacingError(NOT_FOUND);
    await checkLinks(checked.value);

    const value = checked.value;
    await slugGuard(() => prisma.siteService.update({ where: { id: before.id }, data: value }));
    await recordAudit({
      actor,
      action: "site_service.update",
      entity: "SiteService",
      entityId: before.id,
      summary: before.slug === value.slug ? value.name : `${value.name}: /layanan/${before.slug} -> /layanan/${value.slug}`,
    });
    revalidateSitePages([before.slug, value.slug]);
  });
}

export async function setSiteServiceActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    const row = await prisma.siteService.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true, slug: true, name: true } });
    if (!row) throw new UserFacingError(NOT_FOUND);
    const active = input?.active === true;

    await prisma.siteService.update({ where: { id: row.id }, data: { isActive: active } });
    await recordAudit({ actor, action: active ? "site_service.activate" : "site_service.deactivate", entity: "SiteService", entityId: row.id, summary: row.name });
    revalidateSitePages([row.slug]);
  });
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npm run test:integration -- tests/integration/site-service-admin.test.ts && npx tsc --noEmit -p .`
Expected: 5/5 PASS; `tsc` tanpa keluaran.

- [ ] **Step 5: Commit**

```bash
git add src/server/site-service-admin.ts tests/integration/site-service-admin.test.ts
git commit -m "feat: add, edit, and switch site services linked to internal services

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Foto layanan situs (pengolahan bersama, penyimpanan, dan rute)

**Files:**
- Create: `src/server/public-photo.ts`
- Modify: `src/server/doctor-photo.ts` (menjadi pembungkus tipis)
- Create: `src/server/site-service-photo.ts`
- Modify: `src/server/site-service-admin.ts` (tambah `removeSiteServicePhoto`)
- Create: `src/app/(admin)/admin/layanan/foto/route.ts`
- Create: `src/app/(admin)/admin/layanan/foto/[nama]/route.ts`
- Create: `src/app/(public)/foto-layanan/[nama]/route.ts`
- Test: `tests/integration/site-service-photo-routes.test.ts` (uji lama `tests/unit/doctor-photo.test.ts` dan `tests/integration/staff-photo-routes.test.ts` harus tetap lulus)

**Interfaces:**
- Consumes: `siteServicePhotoUrl`, `siteServicePhotoName` (Task 5); `revalidateSitePages` (Task 6); `DOCTOR_PHOTO_MAX_BYTES` dari `src/lib/doctor-profile.ts`; `isSameOrigin` dari `src/server/same-origin.ts`; `getCurrentStaff`, `CurrentStaff` dari `src/server/session.ts`; `patientFilesDir` dari `src/server/bia-storage.ts`.
- Produces:
  - `processPublicPhoto(input: Uint8Array): Promise<ProcessedPhoto>`, `photoDir(folder: PhotoFolder): string`, `writePublicPhoto(folder, ownerId, photo): Promise<string>`, `readPublicPhoto(folder, name): Promise<Buffer>`, `removePublicPhoto(folder, name): Promise<void>` dengan `PhotoFolder = "dokter" | "layanan"`.
  - `uploadSiteServicePhoto(input: { actor: CurrentStaff; siteServiceId: string; bytes: Uint8Array }): Promise<{ photoUrl: string }>`, `removeSiteServicePhotoFor(actor: CurrentStaff, id: string): Promise<void>`, `findPublicSiteServicePhoto(name: string): Promise<Buffer | null>`.
  - `removeSiteServicePhoto(id: string): Promise<ActionResult>` di `site-service-admin.ts`.
  - Rute: `POST /admin/layanan/foto` (form-data `siteServiceId`, `file`; JSON `{ ok: true, photoUrl }` atau `{ ok: false, error }`), `GET /admin/layanan/foto/<nama>`, `GET /foto-layanan/<nama>`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/site-service-photo-routes.test.ts`:

```ts
// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/(admin)/admin/layanan/foto/route";
import { GET as adminPreview } from "@/app/(admin)/admin/layanan/foto/[nama]/route";
import { GET } from "@/app/(public)/foto-layanan/[nama]/route";
import { prisma } from "@/lib/db";
import { removeSiteServicePhoto } from "@/server/site-service-admin";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { state } = vi.hoisted(() => ({ state: { staff: null as null | { userId: string; staffId: string; name: string; role: Role; email: string } } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    getCurrentStaff: vi.fn(async () => state.staff),
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!state.staff || !can(state.staff.role, capability)) throw new Error(`forbidden: ${capability}`);
      return state.staff;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "foto-situs";
const ORIGIN = "https://sundyclinic.com";
const as = (role: Role | null) => {
  state.staff = role ? { userId: "u", staffId: "s-foto", name: "Pengelola Foto", role, email: "foto@sundy.test" } : null;
};
const png = () => sharp({ create: { width: 900, height: 700, channels: 3, background: "#c8a97e" } }).png().toBuffer();

function form(siteServiceId: string, bytes: Uint8Array) {
  const body = new FormData();
  body.set("siteServiceId", siteServiceId);
  body.set("file", new File([bytes as BlobPart], "layanan.png", { type: "image/png" }));
  return body;
}
const post = (body: FormData, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/layanan/foto`, { method: "POST", body, headers }));
const get = (name: string) => GET(new Request(`${ORIGIN}/foto-layanan/${name}`), { params: Promise.resolve({ nama: name }) });
const preview = (name: string) => adminPreview(new Request(`${ORIGIN}/admin/layanan/foto/${name}`), { params: Promise.resolve({ nama: name }) });

describe("foto layanan situs (spec layanan situs 5.3)", () => {
  let root: string;
  let siteId: string;
  let serviceId: string;
  const previous = process.env.PATIENT_FILES_DIR;

  async function clean() {
    await prisma.service.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
    await prisma.auditLog.deleteMany({ where: { actorName: "Pengelola Foto" } });
    await rm(path.join(root, "layanan"), { recursive: true, force: true });
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-foto-layanan-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  beforeEach(async () => {
    await clean();
    const categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Foto", sortOrder: 95 } })).id;
    serviceId = (await prisma.service.create({ data: { slug: `${SLUG}-internal`, name: "Foto Internal Uji", promoPrice: 10_000, categoryId } })).id;
    siteId = (await prisma.siteService.create({ data: { slug: `${SLUG}-situs`, name: "Foto Situs Uji", categoryId, serviceId } })).id;
  });
  afterAll(async () => {
    await clean();
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("unggah: tanpa login 401, Resepsionis 403, asal asing 403; Admin Keuangan berhasil dan foto lama dihapus", async () => {
    as(null);
    expect((await post(form(siteId, await png()))).status).toBe(401);
    as("RESEPSIONIS");
    expect((await post(form(siteId, await png()))).status).toBe(403);
    as("ADMIN_KEUANGAN");
    expect((await post(form(siteId, await png()), { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form("tidak-ada", await png()))).status).toBe(422);

    const first = (await (await post(form(siteId, await png()))).json()) as { ok: boolean; photoUrl: string };
    expect(first.photoUrl).toMatch(/^\/foto-layanan\/[0-9a-z]+-[0-9a-f]{8}\.webp$/);
    expect((await prisma.siteService.findUniqueOrThrow({ where: { id: siteId } })).imageUrl).toBe(first.photoUrl);
    const other = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#204060" } }).png().toBuffer();
    const second = (await (await post(form(siteId, other))).json()) as { ok: boolean; photoUrl: string };
    expect(second.photoUrl).not.toBe(first.photoUrl);
    expect(await readdir(path.join(root, "layanan"))).toEqual([second.photoUrl.replace("/foto-layanan/", "")]);
    expect(await prisma.auditLog.count({ where: { action: "site_service.photo", entityId: siteId } })).toBe(2);
  });

  it("rute publik hanya untuk layanan situs aktif dengan layanan internal aktif (Review Focus 5); pratinjau admin tanpa syarat aktif", async () => {
    as("SUPER_ADMIN");
    const { photoUrl } = (await (await post(form(siteId, await png()))).json()) as { photoUrl: string };
    const name = photoUrl.replace("/foto-layanan/", "");

    const ok = await get(name);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toBe("public, max-age=300");

    await prisma.service.update({ where: { id: serviceId }, data: { isActive: false } });
    expect((await get(name)).status).toBe(404);
    await prisma.service.update({ where: { id: serviceId }, data: { isActive: true } });
    await prisma.siteService.update({ where: { id: siteId }, data: { isActive: false } });
    expect((await get(name)).status).toBe(404);
    expect((await preview(name)).status).toBe(200);
    expect((await get("../rahasia.webp")).status).toBe(404);

    as("RESEPSIONIS");
    expect((await preview(name)).status).toBe(403);
  });

  it("hapus foto: berkas dan alamatnya hilang; tanpa foto unggahan ditolak", async () => {
    as("SUPER_ADMIN");
    await post(form(siteId, await png()));
    expect(await removeSiteServicePhoto(siteId)).toEqual({ ok: true, data: undefined });
    expect((await prisma.siteService.findUniqueOrThrow({ where: { id: siteId } })).imageUrl).toBeNull();
    expect(await readdir(path.join(root, "layanan"))).toEqual([]);
    expect(await removeSiteServicePhoto(siteId)).toEqual({ ok: false, error: "Layanan situs ini belum punya foto unggahan." });
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:integration -- tests/integration/site-service-photo-routes.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/(admin)/admin/layanan/foto/route"`.

- [ ] **Step 3: Pengolahan dan penyimpanan foto bersama**

Buat `src/server/public-photo.ts` dengan memindahkan isi `src/server/doctor-photo.ts`, lalu menjadikan folder sebagai parameter:

```ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { UserFacingError } from "@/lib/action-result";
import { DOCTOR_PHOTO_MAX_BYTES, DOCTOR_PHOTO_MAX_SIDE, DOCTOR_PHOTO_MIN_SIDE, DOCTOR_PHOTO_NAME, detectPhotoKind } from "@/lib/doctor-profile";
import { patientFilesDir } from "@/server/bia-storage";

/** Foto publik (dokter dan layanan situs): pengolahan dan penyimpanan bersama (spec profil dokter 4, spec layanan situs 5.3). */
const MAX_INPUT_PIXELS = 40_000_000;

export type PhotoFolder = "dokter" | "layanan";
export type ProcessedPhoto = { bytes: Buffer; width: number; height: number; fingerprint: string };

/**
 * Foto kiriman pengguna diubah menjadi WebP buatan `sharp`: diputar sesuai EXIF, disusutkan, dan tanpa metadata apa pun
 * (lokasi GPS ikut terbuang). Berkas kiriman tidak pernah disajikan apa adanya.
 */
export async function processPublicPhoto(input: Uint8Array): Promise<ProcessedPhoto> {
  // Isi fungsi ini SAMA PERSIS dengan isi `processDoctorPhoto` lama (baris "if (input.length === 0)" sampai akhir blok catch).
}

export function photoDir(folder: PhotoFolder): string {
  return path.join(patientFilesDir(), folder);
}

function fileOf(folder: PhotoFolder, name: string): string {
  if (!DOCTOR_PHOTO_NAME.test(name)) throw new Error(`Nama berkas foto ${folder} tidak sah.`);
  return path.join(photoDir(folder), name);
}

/** Menulis ke nama sementara lalu memindahkannya, sehingga berkas yang terbaca selalu utuh. Mengembalikan nama berkas. */
export async function writePublicPhoto(folder: PhotoFolder, ownerId: string, photo: ProcessedPhoto): Promise<string> {
  const name = `${ownerId}-${photo.fingerprint}.webp`;
  const target = fileOf(folder, name);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, photo.bytes, { mode: 0o644 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return name;
}

export async function readPublicPhoto(folder: PhotoFolder, name: string): Promise<Buffer> {
  return readFile(fileOf(folder, name));
}

export async function removePublicPhoto(folder: PhotoFolder, name: string): Promise<void> {
  await rm(fileOf(folder, name), { force: true });
}
```

Komentar di dalam `processPublicPhoto` di atas adalah petunjuk pemindahan, bukan kode: salin badan `processDoctorPhoto` dari `src/server/doctor-photo.ts` baris demi baris (mulai `if (input.length === 0) throw new UserFacingError("Berkas kosong.");` sampai akhir `catch`), tanpa perubahan.

Ganti seluruh isi `src/server/doctor-photo.ts` dengan:

```ts
import { photoDir, processPublicPhoto, readPublicPhoto, removePublicPhoto, writePublicPhoto, type ProcessedPhoto } from "@/server/public-photo";

/** Foto dokter di halaman publik (spec profil dokter 4): pembungkus penyimpanan foto publik bersama, folder "dokter". */
export type { ProcessedPhoto };

export const processDoctorPhoto = processPublicPhoto;

export function doctorPhotoDir(): string {
  return photoDir("dokter");
}

export function writeDoctorPhoto(staffId: string, photo: ProcessedPhoto): Promise<string> {
  return writePublicPhoto("dokter", staffId, photo);
}

export function readDoctorPhotoFile(name: string): Promise<Buffer> {
  return readPublicPhoto("dokter", name);
}

export function removeDoctorPhotoFile(name: string): Promise<void> {
  return removePublicPhoto("dokter", name);
}
```

Run: `npx vitest run tests/unit/doctor-photo.test.ts && npm run test:integration -- tests/integration/staff-photo-routes.test.ts tests/integration/staff-profile.test.ts`
Expected: semua PASS (perilaku foto dokter tidak berubah; pesan "Nama berkas foto dokter tidak sah." tetap sama).

- [ ] **Step 4: Layanan foto layanan situs**

Buat `src/server/site-service-photo.ts`:

```ts
import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { siteServicePhotoName, siteServicePhotoUrl } from "@/lib/service-catalog";
import { recordAudit } from "@/server/audit";
import { revalidateSitePages } from "@/server/catalog-revalidate";
import { processPublicPhoto, readPublicPhoto, removePublicPhoto, writePublicPhoto } from "@/server/public-photo";
import type { CurrentStaff } from "@/server/session";

/**
 * Foto layanan situs (spec layanan situs 5.3). Sengaja BUKAN berkas "use server": `uploadSiteServicePhoto` menerima byte. Pintu
 * masuknya rute `POST /admin/layanan/foto` dan aksi `removeSiteServicePhoto`, keduanya memeriksa hak `catalog:manage`.
 */
const NOT_FOUND = "Layanan situs tidak ditemukan.";

export async function uploadSiteServicePhoto(input: { actor: CurrentStaff; siteServiceId: string; bytes: Uint8Array }): Promise<{ photoUrl: string }> {
  const row = await prisma.siteService.findUnique({
    where: { id: String(input.siteServiceId ?? "") },
    select: { id: true, name: true, slug: true, imageUrl: true },
  });
  if (!row) throw new UserFacingError(NOT_FOUND);

  const processed = await processPublicPhoto(input.bytes);
  const name = await writePublicPhoto("layanan", row.id, processed);
  const photoUrl = siteServicePhotoUrl(name);
  const oldName = siteServicePhotoName(row.imageUrl);

  try {
    await prisma.siteService.update({ where: { id: row.id }, data: { imageUrl: photoUrl } });
  } catch (error) {
    // Foto yang sama (nama sama dengan yang lama) berarti berkasnya masih dipakai: jangan dihapus.
    if (name !== oldName) await removePublicPhoto("layanan", name).catch(() => undefined);
    throw error;
  }
  if (oldName && oldName !== name) await removePublicPhoto("layanan", oldName).catch(() => undefined);

  // Foto sudah terpasang: kegagalan menulis audit tidak boleh membuat unggahan dianggap gagal.
  await recordAudit({ actor: input.actor, action: "site_service.photo", entity: "SiteService", entityId: row.id, summary: `${row.name}: foto diganti` }).catch((error) =>
    console.error("Gagal mencatat audit foto layanan situs", row.id, error),
  );
  revalidateSitePages([row.slug]);
  return { photoUrl };
}

export async function removeSiteServicePhotoFor(actor: CurrentStaff, id: string): Promise<void> {
  const row = await prisma.siteService.findUnique({ where: { id: String(id ?? "") }, select: { id: true, name: true, slug: true, imageUrl: true } });
  if (!row) throw new UserFacingError(NOT_FOUND);
  const name = siteServicePhotoName(row.imageUrl);
  if (!name) throw new UserFacingError("Layanan situs ini belum punya foto unggahan.");

  await prisma.siteService.update({ where: { id: row.id }, data: { imageUrl: null } });
  await removePublicPhoto("layanan", name).catch(() => undefined);
  await recordAudit({ actor, action: "site_service.photo", entity: "SiteService", entityId: row.id, summary: `${row.name}: foto dihapus` });
  revalidateSitePages([row.slug]);
}

/**
 * Isi foto untuk rute publik: hanya foto milik layanan situs AKTIF yang layanan internalnya juga aktif, dan `imageUrl`-nya sama
 * persis dengan nama ini; selain itu null. Jalur yang tidak terdaftar di basis data tidak pernah dibaca dari disk.
 */
export async function findPublicSiteServicePhoto(name: string): Promise<Buffer | null> {
  const safe = siteServicePhotoName(siteServicePhotoUrl(String(name ?? "")));
  if (!safe) return null;
  const owner = await prisma.siteService.findFirst({
    where: { imageUrl: siteServicePhotoUrl(safe), isActive: true, service: { isActive: true } },
    select: { id: true },
  });
  if (!owner) return null;
  try {
    return await readPublicPhoto("layanan", safe);
  } catch {
    return null;
  }
}
```

Tambahkan di akhir `src/server/site-service-admin.ts` (beserta import `removeSiteServicePhotoFor` dari `@/server/site-service-photo`):

```ts
export async function removeSiteServicePhoto(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("catalog:manage");
    await removeSiteServicePhotoFor(actor, id);
  });
}
```

- [ ] **Step 5: Tiga rute**

Buat `src/app/(admin)/admin/layanan/foto/route.ts`:

```ts
import { UserFacingError } from "@/lib/action-result";
import { DOCTOR_PHOTO_MAX_BYTES } from "@/lib/doctor-profile";
import { can } from "@/lib/permissions";
import { isSameOrigin } from "@/server/same-origin";
import { getCurrentStaff } from "@/server/session";
import { uploadSiteServicePhoto } from "@/server/site-service-photo";

export const dynamic = "force-dynamic";

const json = (body: { ok: true; photoUrl: string } | { ok: false; error: string }, status: number) => Response.json(body, { status });
const TOO_BIG = "Foto terlalu besar (maks. 8 MB).";

/** Satu foto layanan situs per permintaan (spec layanan situs 5.3). */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return json({ ok: false, error: "Masuk dulu." }, 401);
  if (!can(staff.role, "catalog:manage")) return json({ ok: false, error: "Anda tidak berhak mengubah foto layanan." }, 403);
  if (!isSameOrigin(request)) return json({ ok: false, error: "Permintaan tidak sah." }, 403);

  // Tolak sebelum isinya dibaca ke memori (+ sedikit ruang untuk bidang formulir).
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > DOCTOR_PHOTO_MAX_BYTES + 512 * 1024) return json({ ok: false, error: TOO_BIG }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Permintaan bukan unggahan berkas." }, 400);
  }
  const siteServiceId = form.get("siteServiceId");
  const file = form.get("file");
  if (typeof siteServiceId !== "string" || !(file instanceof File)) return json({ ok: false, error: "Pilih foto yang akan diunggah." }, 400);
  if (file.size > DOCTOR_PHOTO_MAX_BYTES) return json({ ok: false, error: TOO_BIG }, 413);

  try {
    const saved = await uploadSiteServicePhoto({ actor: staff, siteServiceId, bytes: new Uint8Array(await file.arrayBuffer()) });
    return json({ ok: true, photoUrl: saved.photoUrl }, 200);
  } catch (error) {
    if (error instanceof UserFacingError) return json({ ok: false, error: error.message }, 422);
    console.error("Gagal menyimpan foto layanan situs", error);
    return json({ ok: false, error: "Gagal menyimpan foto. Coba lagi." }, 500);
  }
}
```

Buat `src/app/(admin)/admin/layanan/foto/[nama]/route.ts`:

```ts
import { can } from "@/lib/permissions";
import { siteServicePhotoName, siteServicePhotoUrl } from "@/lib/service-catalog";
import { readPublicPhoto } from "@/server/public-photo";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Pratinjau foto layanan situs di panel: tanpa syarat aktif, hanya untuk pengelola katalog, tanpa cache. */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Masuk dulu.", { status: 401 });
  if (!can(staff.role, "catalog:manage")) return new Response("Anda tidak berhak membuka foto layanan.", { status: 403 });

  const { nama } = await params;
  const name = siteServicePhotoName(siteServicePhotoUrl(String(nama ?? "")));
  if (!name) return new Response("Foto tidak ditemukan.", { status: 404 });
  try {
    const bytes = await readPublicPhoto("layanan", name);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Foto tidak ditemukan.", { status: 404 });
  }
}
```

Buat `src/app/(public)/foto-layanan/[nama]/route.ts`:

```ts
import { findPublicSiteServicePhoto } from "@/server/site-service-photo";

export const dynamic = "force-dynamic";

/** Foto layanan situs untuk halaman publik (spec layanan situs 5.3). Cache singkat agar foto layanan yang disembunyikan cepat lenyap. */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const { nama } = await params;
  const bytes = await findPublicSiteServicePhoto(nama);
  if (!bytes) return new Response("Foto tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300" },
  });
}
```

- [ ] **Step 6: Jalankan uji, pastikan lulus**

Run: `npm run test:integration -- tests/integration/site-service-photo-routes.test.ts tests/integration/staff-photo-routes.test.ts && npx vitest run tests/unit/doctor-photo.test.ts tests/unit/architecture.test.ts && npx tsc --noEmit -p .`
Expected: semua PASS; `tsc` tanpa keluaran.

- [ ] **Step 7: Commit**

```bash
git add src/server/public-photo.ts src/server/doctor-photo.ts src/server/site-service-photo.ts src/server/site-service-admin.ts "src/app/(admin)/admin/layanan/foto" "src/app/(public)/foto-layanan" tests/integration/site-service-photo-routes.test.ts
git commit -m "feat: upload site service photos through the shared public photo pipeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tab "Layanan internal" di Layanan & Harga

**Files:**
- Create: `src/components/admin/service/internal-service-dialog.tsx`
- Create: `src/components/admin/service/active-toggle-button.tsx`
- Modify: `src/components/admin/service-price-table.tsx`
- Modify: `src/app/(admin)/admin/layanan/page.tsx`
- Test: `tests/unit/components/internal-service-dialog.test.tsx`, `tests/unit/components/service-price-table.test.tsx`

**Interfaces:**
- Consumes: `createInternalService`, `updateInternalService`, `setServiceActive` (Task 6); `validateInternalService` (Task 5); `getInternalCatalog`, `listServiceCategories`, `getSiteCatalog` (Task 2).
- Produces:
  - `InternalServiceDialog({ categories, service }: { categories: { id: string; name: string }[]; service?: { id: string; name: string; categoryId: string; normalPrice: number | null; promoPrice: number; durationMin: number; requiresDoctor: boolean } })` — tanpa `service`: tombol "+ Layanan internal" + judul "Tambah layanan internal"; dengan `service`: tombol "Ubah" (`aria-label` "Ubah <nama>") + judul "Ubah — <nama>".
  - `ActiveToggleButton({ name, active, confirmText, onToggle }: { name: string; active: boolean; confirmText: string; onToggle: (active: boolean) => Promise<ActionResult> })` — "Nonaktifkan" (`aria-label` "Nonaktifkan <nama>") membuka dialog "Nonaktifkan <nama>?" berisi `confirmText`; "Aktifkan" (`aria-label` "Aktifkan <nama>") langsung menjalankan.
  - `PriceService` di `service-price-table.tsx` bertambah `slug: string; categoryId: string; durationMin: number; requiresDoctor: boolean; isActive: boolean; siteCount: number`; `ServicePriceTable` menerima prop baru `categoryOptions: { id: string; name: string }[]`.
  - Halaman `/admin/layanan` dengan tab `?tab=internal` (bawaan) dan `?tab=situs` (isi tab situs di Task 10; di task ini tab situs menampilkan `EmptyState` "Belum ada layanan situs." bila kosong dan sementara menampilkan teks "Daftar layanan situs menyusul." bila ada).

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/internal-service-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InternalServiceDialog } from "@/components/admin/service/internal-service-dialog";
import { createInternalService, updateInternalService } from "@/server/service-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/service-admin", () => ({ createInternalService: vi.fn(), updateInternalService: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const CATEGORIES = [
  { id: "c1", name: "Facial Treatment" },
  { id: "c2", name: "Laser Treatment" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createInternalService).mockResolvedValue({ ok: true, data: { id: "baru" } });
  vi.mocked(updateInternalService).mockResolvedValue({ ok: true, data: undefined });
});

describe("InternalServiceDialog (spec layanan situs 5.1)", () => {
  it("menambah layanan internal dengan isian lengkap", async () => {
    const user = userEvent.setup();
    renderAdmin(<InternalServiceDialog categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: "+ Layanan internal" }));
    const dialog = screen.getByRole("dialog", { name: "Tambah layanan internal" });
    await user.type(screen.getByLabelText("Nama"), "Add-on Masker");
    await user.selectOptions(screen.getByLabelText("Kategori"), "c2");
    await user.type(screen.getByLabelText("Harga berlaku"), "75000");
    await user.clear(screen.getByLabelText("Durasi (menit)"));
    await user.type(screen.getByLabelText("Durasi (menit)"), "45");
    await user.click(screen.getByLabelText("Perlu dokter"));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(createInternalService).toHaveBeenCalledWith({ name: "Add-on Masker", categoryId: "c2", promoPrice: 75_000, normalPrice: null, durationMin: 45, requiresDoctor: true }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
  });

  it("menampilkan galat validasi tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderAdmin(<InternalServiceDialog categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: "+ Layanan internal" }));
    await user.type(screen.getByLabelText("Nama"), "Add-on");
    await user.type(screen.getByLabelText("Harga berlaku"), "75000");
    await user.clear(screen.getByLabelText("Durasi (menit)"));
    await user.type(screen.getByLabelText("Durasi (menit)"), "20");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Durasi 15–480 menit, kelipatan 15.")).toBeInTheDocument();
    expect(createInternalService).not.toHaveBeenCalled();
  });

  it("mengubah layanan yang ada; galat server tampil", async () => {
    vi.mocked(updateInternalService).mockResolvedValue({ ok: false, error: "Nama layanan sudah dipakai layanan lain." });
    const user = userEvent.setup();
    renderAdmin(
      <InternalServiceDialog
        categories={CATEGORIES}
        service={{ id: "s1", name: "Relaxing Facial", categoryId: "c1", normalPrice: 189_000, promoPrice: 149_000, durationMin: 60, requiresDoctor: false }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ubah Relaxing Facial" }));
    expect(screen.getByRole("dialog", { name: "Ubah — Relaxing Facial" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama")).toHaveValue("Relaxing Facial");
    expect(screen.getByLabelText("Harga coret (opsional)")).toHaveValue("Rp 189.000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateInternalService).toHaveBeenCalledWith({ id: "s1", name: "Relaxing Facial", categoryId: "c1", promoPrice: 149_000, normalPrice: 189_000, durationMin: 60, requiresDoctor: false }),
    );
    expect(await screen.findByText("Nama layanan sudah dipakai layanan lain.")).toBeInTheDocument();
  });
});
```

Di `tests/unit/components/service-price-table.test.tsx`:
- ganti `vi.mock("@/server/service-admin", …)` menjadi `vi.mock("@/server/service-admin", () => ({ updateServicePrice: vi.fn(), updateServiceCost: vi.fn(), createInternalService: vi.fn(), updateInternalService: vi.fn(), setServiceActive: vi.fn() }));`;
- ganti `const NO_COST = …` menjadi `const NO_COST = { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0, slug: "x", categoryId: "c1", durationMin: 60, requiresDoctor: false, isActive: true, siteCount: 1 };`;
- setiap `renderAdmin(<ServicePriceTable categories={CATEGORIES} />)` menjadi `renderAdmin(<ServicePriceTable categories={CATEGORIES} categoryOptions={[]} />)`;
- tambahkan uji:

```tsx
  it("menampilkan durasi, status di situs, dan tombol status; layanan khusus internal ditandai (spec layanan situs 5.1)", async () => {
    const categories: PriceCategory[] = [
      {
        id: "c1",
        name: "Facial Treatment",
        services: [
          { id: "s1", name: "Relaxing Facial", normalPrice: null, promoPrice: 149000, ...NO_COST, durationMin: 45, requiresDoctor: true },
          { id: "s9", name: "Add-on Masker", normalPrice: null, promoPrice: 50000, ...NO_COST, siteCount: 0, isActive: false },
        ],
      },
    ];
    renderAdmin(<ServicePriceTable categories={categories} categoryOptions={[{ id: "c1", name: "Facial Treatment" }]} />);
    const facial = screen.getByRole("row", { name: /Relaxing Facial/ });
    expect(facial).toHaveTextContent("45 menit · perlu dokter");
    expect(facial).toHaveTextContent("1 layanan situs");
    expect(within(facial).getByRole("button", { name: "Nonaktifkan Relaxing Facial" })).toBeInTheDocument();
    expect(within(facial).getByRole("button", { name: "Ubah Relaxing Facial" })).toBeInTheDocument();
    const addon = screen.getByRole("row", { name: /Add-on Masker/ });
    expect(addon).toHaveTextContent("Hanya internal");
    expect(addon).toHaveTextContent("Nonaktif");
    expect(within(addon).getByRole("button", { name: "Aktifkan Add-on Masker" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/components/internal-service-dialog.test.tsx tests/unit/components/service-price-table.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/admin/service/internal-service-dialog"`, dan uji tabel baru gagal karena teks durasi belum ada.

- [ ] **Step 3: `ActiveToggleButton`**

Buat `src/components/admin/service/active-toggle-button.tsx`:

```tsx
"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Aktifkan langsung; nonaktifkan lewat konfirmasi yang menyebut akibatnya (spec layanan situs 5.1 dan 5.2). */
export function ActiveToggleButton({
  name,
  active,
  confirmText,
  onToggle,
}: {
  name: string;
  active: boolean;
  confirmText: string;
  onToggle: (active: boolean) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(next: boolean) {
    startTransition(async () => {
      try {
        const result = await onToggle(next);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(next ? `${name} diaktifkan.` : `${name} dinonaktifkan.`);
        setConfirming(false);
        router.refresh();
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  if (!active) {
    return (
      <Button type="button" size="small" variant="text" disabled={pending} onClick={() => run(true)} aria-label={`Aktifkan ${name}`}>
        Aktifkan
      </Button>
    );
  }
  return (
    <>
      <Button type="button" size="small" variant="text" color="error" disabled={pending} onClick={() => setConfirming(true)} aria-label={`Nonaktifkan ${name}`}>
        Nonaktifkan
      </Button>
      <Dialog open={confirming} onClose={() => !pending && setConfirming(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nonaktifkan {name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{confirmText}</Typography>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            Batal
          </Button>
          <Button type="button" variant="contained" color="error" onClick={() => run(false)} disabled={pending}>
            Nonaktifkan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: `InternalServiceDialog`**

Buat `src/components/admin/service/internal-service-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { validateInternalService } from "@/lib/service-catalog";
import { createInternalService, updateInternalService } from "@/server/service-admin";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

type EditableService = {
  id: string;
  name: string;
  categoryId: string;
  normalPrice: number | null;
  promoPrice: number;
  durationMin: number;
  requiresDoctor: boolean;
};

/** Tambah atau ubah layanan internal (spec layanan situs 5.1). Belum tampil di situs sampai ada layanan situs yang menautkannya. */
export function InternalServiceDialog({ categories, service }: { categories: { id: string; name: string }[]; service?: EditableService }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [promoPrice, setPromoPrice] = useState<number | null>(null);
  const [normalPrice, setNormalPrice] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState("30");
  const [requiresDoctor, setRequiresDoctor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setName(service?.name ?? "");
    setCategoryId(service?.categoryId ?? categories[0]?.id ?? "");
    setPromoPrice(service?.promoPrice ?? null);
    setNormalPrice(service?.normalPrice ?? null);
    setDurationMin(String(service?.durationMin ?? 30));
    setRequiresDoctor(service?.requiresDoctor ?? false);
    setError(null);
    setOpen(true);
  }

  function save() {
    const checked = validateInternalService({ name, categoryId, promoPrice: promoPrice ?? Number.NaN, normalPrice, durationMin: Number(durationMin), requiresDoctor });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = service ? await updateInternalService({ id: service.id, ...checked.value }) : await createInternalService(checked.value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(service ? "Layanan tersimpan." : `${checked.value.name} ditambahkan.`);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  const title = service ? `Ubah — ${service.name}` : "Tambah layanan internal";
  return (
    <>
      {service ? (
        <Button type="button" size="small" variant="text" onClick={openDialog} aria-label={`Ubah ${service.name}`}>
          Ubah
        </Button>
      ) : (
        <Button type="button" variant="contained" onClick={openDialog}>
          + Layanan internal
        </Button>
      )}
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id={`${id}-name`} label="Nama" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <SelectField id={`${id}-category`} label="Kategori" value={categoryId} onChange={setCategoryId}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
            <RupiahInput id={`${id}-promo`} label="Harga berlaku" value={promoPrice} onChange={setPromoPrice} fullWidth />
            <RupiahInput id={`${id}-normal`} label="Harga coret (opsional)" value={normalPrice} onChange={setNormalPrice} fullWidth />
            <TextField
              id={`${id}-duration`}
              label="Durasi (menit)"
              type="number"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 15, max: 480, step: 15 } }}
            />
            <FormControlLabel control={<Checkbox checked={requiresDoctor} onChange={(e) => setRequiresDoctor(e.target.checked)} />} label="Perlu dokter" />
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

- [ ] **Step 5: Tabel harga menjadi tabel layanan internal**

Di `src/components/admin/service-price-table.tsx`:
- tambahkan import:

```tsx
import Typography from "@mui/material/Typography";
import { CONSULTATION_SERVICE_SLUG } from "@/lib/booking-rules";
import { setServiceActive } from "@/server/service-admin";
import { ActiveToggleButton } from "./service/active-toggle-button";
import { InternalServiceDialog } from "./service/internal-service-dialog";
```

(gabungkan `setServiceActive` ke baris import `updateServicePrice` yang sudah ada);
- ganti tipe `PriceService` menjadi:

```tsx
type PriceService = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  normalPrice: number | null;
  promoPrice: number;
  durationMin: number;
  requiresDoctor: boolean;
  isActive: boolean;
  /** Jumlah layanan situs aktif yang menautkan; 0 = "Hanya internal". */
  siteCount: number;
} & ServiceCostInput;
```

- ubah tanda tangan `PriceRow` menjadi `function PriceRow({ service, hidden, categoryOptions }: { service: PriceService; hidden: boolean; categoryOptions: { id: string; name: string }[] })`;
- ganti sel nama `<TableCell sx={{ fontWeight: 500 }}>{service.name}</TableCell>` dengan:

```tsx
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {service.name}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {service.durationMin} menit{service.requiresDoctor ? " · perlu dokter" : ""}
          {service.isActive ? "" : " · Nonaktif"}
        </Typography>
      </TableCell>
```

- sesudah sel `<ServiceCostDialog service={service} />`, tambahkan sel:

```tsx
      <TableCell sx={{ whiteSpace: "nowrap" }}>{service.siteCount > 0 ? `${service.siteCount} layanan situs` : "Hanya internal"}</TableCell>
```

- ganti isi sel terakhir (`{dirty && (…)}`) dengan:

```tsx
        {dirty ? (
          <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
            <Button size="small" variant="contained" onClick={save} disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button size="small" variant="text" onClick={cancel} disabled={pending}>
              Batal
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
            <InternalServiceDialog categories={categoryOptions} service={service} />
            {service.slug !== CONSULTATION_SERVICE_SLUG && (
              <ActiveToggleButton
                name={service.name}
                active={service.isActive}
                confirmText={
                  service.siteCount > 0
                    ? `Layanan ini juga hilang dari situs (${service.siteCount} layanan situs) dan tidak bisa dipilih di booking maupun tagihan.`
                    : "Layanan ini tidak bisa dipilih lagi di booking maupun tagihan."
                }
                onToggle={(active) => setServiceActive({ id: service.id, active })}
              />
            )}
          </Stack>
        )}
```

- ubah `ServicePriceTable` menjadi `export function ServicePriceTable({ categories, categoryOptions }: { categories: PriceCategory[]; categoryOptions: { id: string; name: string }[] })`, tambahkan kepala kolom `<TableCell>Di situs</TableCell>` sesudah `<TableCell>Biaya per sesi</TableCell>`, dan teruskan `categoryOptions={categoryOptions}` ke setiap `<PriceRow …/>`.

- [ ] **Step 6: Halaman bertab**

Ganti seluruh isi `src/app/(admin)/admin/layanan/page.tsx` dengan:

```tsx
import Typography from "@mui/material/Typography";
import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicConsultationCard } from "@/components/admin/clinic-consultation-card";
import { OnlineServiceCard } from "@/components/admin/online-service-card";
import { EmptyState, PageBody, PageHeader } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { InternalServiceDialog } from "@/components/admin/service/internal-service-dialog";
import { ServicePriceTable } from "@/components/admin/service-price-table";
import { can } from "@/lib/permissions";
import { getInternalCatalog, getSiteCatalog, listServiceCategories } from "@/server/catalog-admin-read";
import { getClinicConsultationMinutes, getOnlineServiceSettings } from "@/server/service-admin";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Layanan & Harga" };

type Tab = "internal" | "situs";

export default async function AdminServicesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Katalog internal dan situs dikelola Super Admin dan Admin Keuangan; kartu konsultasi tetap Super Admin (spec layanan situs 5).
  const staff = await requireCapability("catalog:manage");
  const canContent = can(staff.role, "content:manage");
  const tab: Tab = (await searchParams).tab === "situs" ? "situs" : "internal";
  const [internal, categoryOptions] = await Promise.all([getInternalCatalog(), listServiceCategories()]);

  return (
    <>
      <AdminHeader title="Layanan & Harga" />
      <PageBody>
        <PageHeader
          title="Layanan & Harga"
          description="Katalog internal dipakai booking, tagihan, dan paket. Katalog situs adalah isi promosi yang tertaut ke layanan internal."
          actions={tab === "internal" ? <InternalServiceDialog categories={categoryOptions} /> : undefined}
        />
        <PageTabs
          label="Katalog layanan"
          active={tab}
          tabs={[
            { id: "internal", label: "Layanan internal", href: "/admin/layanan" },
            { id: "situs", label: "Layanan situs", href: "/admin/layanan?tab=situs" },
          ]}
        />
        {tab === "internal" ? (
          <InternalTab canContent={canContent} internal={internal} categoryOptions={categoryOptions} />
        ) : (
          <SiteTab />
        )}
      </PageBody>
    </>
  );
}

async function InternalTab({
  canContent,
  internal,
  categoryOptions,
}: {
  canContent: boolean;
  internal: Awaited<ReturnType<typeof getInternalCatalog>>;
  categoryOptions: { id: string; name: string }[];
}) {
  const [online, consultationMinutes] = await Promise.all([
    canContent ? getOnlineServiceSettings() : Promise.resolve(null),
    canContent ? getClinicConsultationMinutes() : Promise.resolve(null),
  ]);
  return (
    <>
      {consultationMinutes !== null && <ClinicConsultationCard minutes={consultationMinutes} />}
      {online && <OnlineServiceCard settings={online} />}
      <ServicePriceTable categories={internal} categoryOptions={categoryOptions} />
    </>
  );
}

async function SiteTab() {
  const site = await getSiteCatalog();
  if (site.length === 0) return <EmptyState>Belum ada layanan situs.</EmptyState>;
  return (
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      Daftar layanan situs menyusul.
    </Typography>
  );
}
```

(`internal` bertipe `InternalCategory[]`, yang barisnya cocok dengan `PriceService` karena `InternalServiceRow` memuat semua kolomnya.)

- [ ] **Step 7: Jalankan uji, pastikan lulus**

Run: `npx vitest run tests/unit/components/internal-service-dialog.test.tsx tests/unit/components/service-price-table.test.tsx tests/unit/components/service-cost-dialog.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit -p .`
Expected: semua PASS; `tsc` tanpa keluaran.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/service src/components/admin/service-price-table.tsx "src/app/(admin)/admin/layanan/page.tsx" tests/unit/components/internal-service-dialog.test.tsx tests/unit/components/service-price-table.test.tsx
git commit -m "feat: manage internal services in a tab of Layanan & Harga

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Tab "Layanan situs" dengan dialog dan foto

**Files:**
- Create: `src/components/admin/photo-upload.ts`
- Modify: `src/components/admin/staff/send-photo.ts`
- Create: `src/components/admin/service/site-service-photo-field.tsx`
- Create: `src/components/admin/service/site-service-dialog.tsx`
- Create: `src/components/admin/service/site-service-table.tsx`
- Modify: `src/app/(admin)/admin/layanan/page.tsx` (`SiteTab` dan `actions`)
- Test: `tests/unit/components/site-service-dialog.test.tsx`, `tests/unit/staff-send-photo.test.ts` (harus tetap lulus)

**Interfaces:**
- Consumes: `createSiteService`, `updateSiteService`, `setSiteServiceActive`, `removeSiteServicePhoto` (Task 7–8); `validateSiteService`, `siteSlugFrom`, `siteServicePhotoPreviewUrl` (Task 5); `SiteServiceRow`, `SiteCategory` (Task 2); `ActiveToggleButton` (Task 9).
- Produces:
  - `postPhoto(endpoint: string, fields: Record<string, string>, file: File): Promise<PhotoResult>` di `src/components/admin/photo-upload.ts` (`PhotoResult` dipindah ke sini dan diekspor ulang dari `send-photo.ts`).
  - `SiteServiceOption = { id: string; name: string; categoryId: string; price: number; isActive: boolean }`.
  - `SiteServiceDialog({ categories, services, row }: { categories: { id: string; name: string }[]; services: SiteServiceOption[]; row?: SiteServiceRow })` — tanpa `row`: tombol "+ Layanan situs", judul "Tambah layanan situs"; dengan `row`: tombol "Ubah" (`aria-label` "Ubah <nama>"), judul "Ubah — <nama>".
  - `SiteServiceTable({ categories, categoryOptions, services }: { categories: SiteCategory[]; categoryOptions: { id: string; name: string }[]; services: SiteServiceOption[] })`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/site-service-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteServiceDialog } from "@/components/admin/service/site-service-dialog";
import { createSiteService, updateSiteService } from "@/server/site-service-admin";
import type { SiteServiceRow } from "@/server/catalog-admin-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/site-service-admin", () => ({ createSiteService: vi.fn(), updateSiteService: vi.fn(), removeSiteServicePhoto: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const CATEGORIES = [
  { id: "c1", name: "Facial Treatment" },
  { id: "c2", name: "Laser Treatment" },
];
const SERVICES = [
  { id: "s1", name: "Relaxing Facial", categoryId: "c1", price: 149_000, isActive: true },
  { id: "s2", name: "Lip Laser", categoryId: "c2", price: 99_000, isActive: true },
];
const ROW: SiteServiceRow = {
  id: "ss1",
  slug: "lip-laser",
  name: "Lip Laser",
  description: null,
  imageUrl: null,
  priceNote: null,
  isSignature: false,
  isActive: true,
  sortOrder: 3,
  categoryId: "c2",
  serviceId: "s2",
  serviceName: "Lip Laser",
  servicePrice: 99_000,
  serviceNormalPrice: null,
  serviceActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSiteService).mockResolvedValue({ ok: true, data: { id: "baru" } });
  vi.mocked(updateSiteService).mockResolvedValue({ ok: true, data: undefined });
});

describe("SiteServiceDialog (spec layanan situs 5.2)", () => {
  it("memilih layanan internal mengisi nama, kategori, dan slug; harga ikut layanan internal", async () => {
    const user = userEvent.setup();
    renderAdmin(<SiteServiceDialog categories={CATEGORIES} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Layanan situs" }));
    expect(screen.getByRole("dialog", { name: "Tambah layanan situs" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Layanan internal" }));
    await user.click(await screen.findByRole("option", { name: "Lip Laser — Rp 99.000" }));
    expect(screen.getByLabelText("Nama di situs")).toHaveValue("Lip Laser");
    expect(screen.getByLabelText("Kategori")).toHaveValue("c2");
    expect(screen.getByLabelText("Alamat (slug)")).toHaveValue("lip-laser");
    expect(screen.getByText("Harga di situs: Rp 99.000 (ikut layanan internal)")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Nama di situs"));
    await user.type(screen.getByLabelText("Nama di situs"), "Lip Laser Promo");
    expect(screen.getByLabelText("Alamat (slug)")).toHaveValue("lip-laser-promo");
    expect(screen.getByText("Simpan dulu, lalu unggah foto lewat tombol Ubah.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createSiteService).toHaveBeenCalledWith({
        serviceId: "s2",
        name: "Lip Laser Promo",
        slug: "lip-laser-promo",
        categoryId: "c2",
        description: null,
        priceNote: null,
        isSignature: false,
        sortOrder: 0,
      }),
    );
  });

  it("slug yang disentuh tidak lagi mengikuti nama; mengubah slug lama memberi peringatan", async () => {
    const user = userEvent.setup();
    renderAdmin(<SiteServiceDialog categories={CATEGORIES} services={SERVICES} row={ROW} />);
    await user.click(screen.getByRole("button", { name: "Ubah Lip Laser" }));
    expect(screen.getByRole("dialog", { name: "Ubah — Lip Laser" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nama di situs"), " Baru");
    expect(screen.getByLabelText("Alamat (slug)")).toHaveValue("lip-laser");
    expect(screen.queryByText("Tautan lama ke halaman ini akan rusak.")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Alamat (slug)"));
    await user.type(screen.getByLabelText("Alamat (slug)"), "lip-laser-baru");
    expect(screen.getByText("Tautan lama ke halaman ini akan rusak.")).toBeInTheDocument();
    expect(screen.getByLabelText("Berkas foto layanan")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateSiteService).toHaveBeenCalledWith({
        id: "ss1",
        serviceId: "s2",
        name: "Lip Laser Baru",
        slug: "lip-laser-baru",
        categoryId: "c2",
        description: null,
        priceNote: null,
        isSignature: false,
        sortOrder: 3,
      }),
    );
  });

  it("galat validasi tampil tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderAdmin(<SiteServiceDialog categories={CATEGORIES} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Layanan situs" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Pilih layanan internal.")).toBeInTheDocument();
    expect(createSiteService).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/components/site-service-dialog.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/admin/service/site-service-dialog"`.

- [ ] **Step 3: Pengirim foto bersama**

Buat `src/components/admin/photo-upload.ts`:

```ts
import { DOCTOR_PHOTO_MAX_BYTES } from "@/lib/doctor-profile";

export type PhotoResult = { ok: true; photoUrl: string } | { ok: false; error: string };

/** Satu foto per permintaan ke rute unggah panel (spec profil dokter 6, spec layanan situs 5.3). */
export async function postPhoto(endpoint: string, fields: Record<string, string>, file: File): Promise<PhotoResult> {
  if (file.size > DOCTOR_PHOTO_MAX_BYTES) return { ok: false, error: "Foto terlalu besar (maks. 8 MB)." };
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.set("file", file);
  try {
    const response = await fetch(endpoint, { method: "POST", body });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; photoUrl?: string; error?: string } | null;
    if (response.ok && data?.ok && data.photoUrl) return { ok: true, photoUrl: data.photoUrl };
    return { ok: false, error: data?.error ?? "Gagal mengunggah. Coba lagi." };
  } catch {
    return { ok: false, error: "Koneksi terputus. Coba lagi." };
  }
}
```

Ganti isi `src/components/admin/staff/send-photo.ts` dengan:

```ts
import { postPhoto, type PhotoResult } from "../photo-upload";

export type { PhotoResult };

/** Satu foto per permintaan ke rute unggah panel (spec profil dokter 6). */
export function sendStaffPhoto(staffId: string, file: File): Promise<PhotoResult> {
  return postPhoto("/admin/staf/foto", { staffId }, file);
}
```

Run: `npx vitest run tests/unit/staff-send-photo.test.ts tests/unit/components/doctor-photo-field.test.tsx`
Expected: PASS.

- [ ] **Step 4: `SiteServicePhotoField`**

Buat `src/components/admin/service/site-service-photo-field.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DOCTOR_PHOTO_ACCEPT, DOCTOR_PHOTO_MIN_SIDE } from "@/lib/doctor-profile";
import { siteServicePhotoPreviewUrl } from "@/lib/service-catalog";
import { removeSiteServicePhoto } from "@/server/site-service-admin";
import { postPhoto } from "../photo-upload";

/**
 * Foto layanan situs (spec layanan situs 5.3). Alur sama dengan foto dokter: pilih berkas → pratinjau → "Pakai foto ini". Foto
 * langsung tersimpan dan tidak menunggu tombol Simpan; layar mengatakannya.
 */
export function SiteServicePhotoField({
  siteServiceId,
  imageUrl,
  visibleOnSite,
  onChange,
}: {
  siteServiceId: string;
  imageUrl: string | null;
  visibleOnSite: boolean;
  onChange: (imageUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (candidate) URL.revokeObjectURL(candidate.preview);
    },
    [candidate],
  );

  async function use() {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    const result = await postPhoto("/admin/layanan/foto", { siteServiceId }, candidate.file);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(visibleOnSite ? "Foto diganti dan sudah tampil di situs." : "Foto disimpan. Foto tampil setelah layanan ini aktif di situs.");
    setCandidate(null);
    onChange(result.photoUrl);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await removeSiteServicePhoto(siteServiceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Foto dihapus. Situs memakai foto kategori.");
      onChange(null);
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const uploaded = siteServicePhotoPreviewUrl(imageUrl);
  const shown = candidate?.preview ?? uploaded;
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", flexWrap: "wrap", rowGap: 1.5 }}>
      {shown ? (
        <Box sx={{ width: 160, aspectRatio: "4 / 3", overflow: "hidden", borderRadius: 2, bgcolor: "action.hover", flexShrink: 0 }}>
          <Box component="img" src={shown} alt={candidate ? "Pratinjau foto baru" : "Foto saat ini"} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </Box>
      ) : null}
      <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
        {!shown && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Belum ada foto unggahan. Situs memakai foto kategori.
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Foto mendatar (4:3) paling bagus, minimal {DOCTOR_PHOTO_MIN_SIDE} px. Foto langsung tersimpan saat dipakai, tanpa menunggu tombol Simpan.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          <Button variant="outlined" size="small" disabled={busy} onClick={() => input.current?.click()}>
            Pilih foto
          </Button>
          {candidate && (
            <>
              <Button variant="contained" size="small" disabled={busy} onClick={() => void use()}>
                Pakai foto ini
              </Button>
              <Button size="small" disabled={busy} onClick={() => setCandidate(null)}>
                Batal
              </Button>
            </>
          )}
          {!candidate && uploaded && (
            <Button color="error" size="small" disabled={busy} onClick={() => void remove()}>
              Hapus foto
            </Button>
          )}
        </Stack>
        <input
          ref={input}
          hidden
          type="file"
          accept={DOCTOR_PHOTO_ACCEPT}
          aria-label="Berkas foto layanan"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setError(null);
            setCandidate({ file, preview: URL.createObjectURL(file) });
          }}
        />
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </Stack>
    </Stack>
  );
}
```

- [ ] **Step 5: `SiteServiceDialog`**

Buat `src/components/admin/service/site-service-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { siteSlugFrom, validateSiteService } from "@/lib/service-catalog";
import type { SiteServiceRow } from "@/server/catalog-admin-read";
import { createSiteService, updateSiteService } from "@/server/site-service-admin";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { SiteServicePhotoField } from "./site-service-photo-field";

export type SiteServiceOption = { id: string; name: string; categoryId: string; price: number; isActive: boolean };

const optionLabel = (option: SiteServiceOption) => `${option.name} — ${formatRupiah(option.price)}${option.isActive ? "" : " (nonaktif)"}`;

/** Tambah atau ubah layanan situs (spec layanan situs 5.2). Harga tidak diisi di sini: selalu ikut layanan internal. */
export function SiteServiceDialog({ categories, services, row }: { categories: { id: string; name: string }[]; services: SiteServiceOption[]; row?: SiteServiceRow }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [isSignature, setIsSignature] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = services.find((service) => service.id === serviceId) ?? null;

  function openDialog() {
    setServiceId(row?.serviceId ?? "");
    setName(row?.name ?? "");
    setSlug(row?.slug ?? "");
    setSlugTouched(Boolean(row));
    setCategoryId(row?.categoryId ?? categories[0]?.id ?? "");
    setDescription(row?.description ?? "");
    setPriceNote(row?.priceNote ?? "");
    setIsSignature(row?.isSignature ?? false);
    setSortOrder(String(row?.sortOrder ?? 0));
    setImageUrl(row?.imageUrl ?? null);
    setError(null);
    setOpen(true);
  }

  function changeName(next: string) {
    setName(next);
    if (!slugTouched) setSlug(siteSlugFrom(next));
  }

  function chooseService(option: SiteServiceOption | null) {
    setServiceId(option?.id ?? "");
    if (!option || row) return;
    if (!name.trim()) changeName(option.name);
    setCategoryId(option.categoryId);
  }

  function save() {
    const checked = validateSiteService({ serviceId, name, slug, categoryId, description, priceNote, isSignature, sortOrder: Number(sortOrder) });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = row ? await updateSiteService({ id: row.id, ...checked.value }) : await createSiteService(checked.value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(row ? "Layanan situs tersimpan." : "Layanan situs ditambahkan. Unggah foto lewat tombol Ubah.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      {row ? (
        <Button type="button" size="small" variant="text" onClick={openDialog} aria-label={`Ubah ${row.name}`}>
          Ubah
        </Button>
      ) : (
        <Button type="button" variant="contained" onClick={openDialog}>
          + Layanan situs
        </Button>
      )}
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>{row ? `Ubah — ${row.name}` : "Tambah layanan situs"}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              id={`${id}-service`}
              options={services}
              value={selected}
              onChange={(_, option) => chooseService(option)}
              getOptionLabel={optionLabel}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Tidak ada layanan yang cocok."
              fullWidth
              renderInput={(params) => <TextField {...params} label="Layanan internal" />}
            />
            {selected && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Harga di situs: {formatRupiah(selected.price)} (ikut layanan internal)
              </Typography>
            )}
            <TextField id={`${id}-name`} label="Nama di situs" value={name} onChange={(e) => changeName(e.target.value)} fullWidth />
            <TextField
              id={`${id}-slug`}
              label="Alamat (slug)"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              helperText={`/layanan/${slug || "…"}`}
              fullWidth
            />
            {row && slug !== row.slug && <Alert severity="warning">Tautan lama ke halaman ini akan rusak.</Alert>}
            <SelectField id={`${id}-category`} label="Kategori" value={categoryId} onChange={setCategoryId}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
            <TextField id={`${id}-description`} label="Deskripsi" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={3} fullWidth />
            <TextField id={`${id}-note`} label="Satuan harga" placeholder="/ 5 titik" value={priceNote} onChange={(e) => setPriceNote(e.target.value)} fullWidth />
            <TextField
              id={`${id}-order`}
              label="Urutan"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 0, max: 9999 } }}
            />
            <FormControlLabel control={<Checkbox checked={isSignature} onChange={(e) => setIsSignature(e.target.checked)} />} label="Signature (tampil di beranda)" />
            {row ? (
              <SiteServicePhotoField
                siteServiceId={row.id}
                imageUrl={imageUrl}
                visibleOnSite={row.isActive && row.serviceActive}
                onChange={(next) => {
                  setImageUrl(next);
                  router.refresh();
                }}
              />
            ) : (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Simpan dulu, lalu unggah foto lewat tombol Ubah.
              </Typography>
            )}
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

- [ ] **Step 6: `SiteServiceTable`**

Buat `src/components/admin/service/site-service-table.tsx`:

```tsx
"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { formatRupiah } from "@/lib/format";
import { siteServicePhotoPreviewUrl } from "@/lib/service-catalog";
import type { SiteCategory, SiteServiceRow } from "@/server/catalog-admin-read";
import { setSiteServiceActive } from "@/server/site-service-admin";
import { ExternalLink } from "../mui/links";
import { SectionCard } from "../page-layout";
import { ActiveToggleButton } from "./active-toggle-button";
import { SiteServiceDialog, type SiteServiceOption } from "./site-service-dialog";

function statusOf(row: SiteServiceRow): string {
  if (!row.isActive) return "Nonaktif";
  if (!row.serviceActive) return "Tersembunyi: layanan internal nonaktif";
  return "Tampil";
}

/** Daftar layanan situs per kategori (spec layanan situs 5.2). */
export function SiteServiceTable({ categories, categoryOptions, services }: { categories: SiteCategory[]; categoryOptions: { id: string; name: string }[]; services: SiteServiceOption[] }) {
  return (
    <Stack spacing={2}>
      {categories.map((category) => (
        <SectionCard key={category.id} title={category.name} description={`${category.services.length} layanan situs`} flush>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Foto</TableCell>
                  <TableCell>Nama di situs</TableCell>
                  <TableCell>Layanan internal</TableCell>
                  <TableCell>Signature</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {category.services.map((row) => {
                  const photo = siteServicePhotoPreviewUrl(row.imageUrl) ?? (row.imageUrl?.startsWith("/") ? row.imageUrl : null);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        {photo ? (
                          <Box component="img" src={photo} alt="" sx={{ width: 56, height: 42, objectFit: "cover", borderRadius: 1, display: "block" }} />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {row.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          /layanan/{row.slug}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.serviceName} · {formatRupiah(row.servicePrice)}
                      </TableCell>
                      <TableCell>{row.isSignature ? "Ya" : "—"}</TableCell>
                      <TableCell>{statusOf(row)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", alignItems: "center" }}>
                          {row.isActive && row.serviceActive && <ExternalLink href={`/layanan/${row.slug}`}>Lihat di situs</ExternalLink>}
                          <SiteServiceDialog categories={categoryOptions} services={services} row={row} />
                          <ActiveToggleButton
                            name={row.name}
                            active={row.isActive}
                            confirmText="Halaman layanan ini hilang dari situs. Layanan internalnya tetap bisa dipakai di booking admin dan tagihan."
                            onToggle={(active) => setSiteServiceActive({ id: row.id, active })}
                          />
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
      ))}
    </Stack>
  );
}
```

Sebelum memakai `ExternalLink`, periksa ekspor `src/components/admin/mui/links.tsx` (`grep -n "export function" src/components/admin/mui/links.tsx`). Bila tidak ada komponen tautan keluar, pakai `import MuiLink from "@mui/material/Link";` dan `<MuiLink href={`/layanan/${row.slug}`} target="_blank" rel="noopener" variant="body2">Lihat di situs</MuiLink>`, lalu catat keputusan itu di ledger.

- [ ] **Step 7: Sambungkan ke halaman**

Di `src/app/(admin)/admin/layanan/page.tsx`:
- tambahkan import `import { SiteServiceDialog, type SiteServiceOption } from "@/components/admin/service/site-service-dialog";` dan `import { SiteServiceTable } from "@/components/admin/service/site-service-table";`; hapus import `Typography`;
- sesudah `const [internal, categoryOptions] = …`, tambahkan:

```tsx
  // Pilihan tautan layanan situs: semua layanan internal (termasuk nonaktif) kecuali Konsultasi Online (spec layanan situs 5.2).
  const serviceOptions: SiteServiceOption[] = internal.flatMap((category) =>
    category.services.map((s) => ({ id: s.id, name: s.name, categoryId: s.categoryId, price: s.promoPrice, isActive: s.isActive })),
  );
```

- ganti `actions={tab === "internal" ? <InternalServiceDialog categories={categoryOptions} /> : undefined}` dengan:

```tsx
          actions={
            tab === "internal" ? (
              <InternalServiceDialog categories={categoryOptions} />
            ) : (
              <SiteServiceDialog categories={categoryOptions} services={serviceOptions} />
            )
          }
```

- ganti `<SiteTab />` dengan `<SiteTab categoryOptions={categoryOptions} services={serviceOptions} />`, dan seluruh fungsi `SiteTab` dengan:

```tsx
async function SiteTab({ categoryOptions, services }: { categoryOptions: { id: string; name: string }[]; services: SiteServiceOption[] }) {
  const site = await getSiteCatalog();
  if (site.length === 0) return <EmptyState>Belum ada layanan situs.</EmptyState>;
  return <SiteServiceTable categories={site} categoryOptions={categoryOptions} services={services} />;
}
```

- [ ] **Step 8: Jalankan uji, pastikan lulus**

Run: `npx vitest run tests/unit/components/site-service-dialog.test.tsx tests/unit/staff-send-photo.test.ts tests/unit/components/doctor-photo-field.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit -p .`
Expected: semua PASS; `tsc` tanpa keluaran.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/photo-upload.ts src/components/admin/staff/send-photo.ts src/components/admin/service "src/app/(admin)/admin/layanan/page.tsx" tests/unit/components/site-service-dialog.test.tsx
git commit -m "feat: manage site services with photos in a tab of Layanan & Harga

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Pilih treatment katalog di "+ Baris layanan"

**Files:**
- Modify: `src/lib/invoice.ts` (sesudah `validateFreeLine`)
- Modify: `src/server/invoice-drafts.ts` (sesudah `addFreeLine`)
- Modify: `src/components/admin/billing/add-free-line-dialog.tsx`
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx` (prop `services`)
- Modify: `src/app/(admin)/admin/tagihan/[id]/page.tsx`
- Modify: `tests/e2e/struk.spec.ts`, `tests/e2e/tagihan.spec.ts`, `tests/e2e/tagihan-diskon.spec.ts`
- Test: `tests/unit/invoice.test.ts`, `tests/integration/invoice-service-line.test.ts`, `tests/unit/components/add-free-line-dialog.test.tsx`

**Interfaces:**
- Consumes: `InternalServiceOption`, `listInternalServiceOptions` (Task 2).
- Produces:
  - `ServiceLineInput = { serviceId: string; quantity: number }`, `validateServiceLineAdd(raw: unknown): Validation<ServiceLineInput>` di `src/lib/invoice.ts`.
  - `addServiceLine(input: { invoiceId: string; version: number; serviceId: string; quantity: number }): Promise<EditResult>` di `src/server/invoice-drafts.ts`.
  - `AddFreeLineDialog({ invoiceId, version, services }: { invoiceId: string; version: number; services?: InternalServiceOption[] })`; opsi terakhir berlabel persis "Lainnya (ketik sendiri)".
  - `InvoiceDraftEditor` menerima prop opsional `services?: InternalServiceOption[]`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di `tests/unit/invoice.test.ts` (import `validateServiceLineAdd` dari `@/lib/invoice`):

```ts
describe("validateServiceLineAdd (spec layanan situs 6)", () => {
  it("menerima layanan dan jumlah bulat positif", () => {
    expect(validateServiceLineAdd({ serviceId: "s1", quantity: 2 })).toEqual({ ok: true, value: { serviceId: "s1", quantity: 2 } });
  });

  it("menolak tanpa layanan atau jumlah tidak sah", () => {
    expect(validateServiceLineAdd({ serviceId: "", quantity: 1 })).toEqual({ ok: false, message: "Pilih layanan." });
    expect(validateServiceLineAdd({ serviceId: "s1", quantity: 0 })).toEqual({ ok: false, message: "Jumlah harus bilangan bulat lebih dari 0." });
    expect(validateServiceLineAdd({ serviceId: "s1", quantity: 1.5 })).toEqual({ ok: false, message: "Jumlah harus bilangan bulat lebih dari 0." });
  });
});
```

Buat `tests/integration/invoice-service-line.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addServiceLine, createDirectSale, setLinePerformer } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Katalog", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baris-katalog";
const WA = "6281200009711";
let world: BillingWorld;
let addonId: string;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const facial = await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } });
  addonId = (
    await prisma.service.create({
      data: { slug: `${SLUG}-addon`, name: "Add-on Katalog Uji", promoPrice: 60_000, categoryId: facial.categoryId, materialCost: 10_000, toolCost: 5_000, commissionKind: "NOMINAL", commissionValue: 8_000 },
    })
  ).id;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("baris treatment dari katalog internal (spec layanan situs 6)", () => {
  it("membuat baris TREATMENT tertaut berharga katalog; biaya dan komisi tersalin saat final", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: addonId, quantity: 2 }));
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, serviceId: addonId } });
    expect(line).toMatchObject({ kind: "TREATMENT", name: "Add-on Katalog Uji", quantity: 2, unitPrice: 60_000 });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, summary: "Tambah baris Add-on Katalog Uji ×2" } })).action).toBe("invoice.update");

    await unwrap(setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: line.id, performerId: world.therapistId }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ materialCost: 20_000, commissionAmount: 16_000 });
  });

  it("menolak layanan nonaktif, Konsultasi Online, atau yang tidak ada; Admin Keuangan tidak menagih", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await prisma.service.update({ where: { id: addonId }, data: { isActive: false } });
    expect(await addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: addonId, quantity: 1 })).toEqual({ ok: false, error: "Layanan tidak tersedia." });
    await prisma.service.update({ where: { id: addonId }, data: { isActive: true } });
    expect(await addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: "tidak-ada", quantity: 1 })).toEqual({ ok: false, error: "Layanan tidak tersedia." });
    const online = await prisma.service.findUnique({ where: { slug: "konsultasi-online" } });
    if (online) expect(await addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: online.id, quantity: 1 })).toEqual({ ok: false, error: "Layanan tidak tersedia." });
    expect(await addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: addonId, quantity: 0 })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat lebih dari 0." });

    actor.role = "ADMIN_KEUANGAN";
    await expect(addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: addonId, quantity: 1 })).rejects.toThrow("forbidden: invoice:manage");
  });
});
```

Sebelum menjalankan, cocokkan nama kolom snapshot biaya dengan skema: `grep -n "materialCost\|toolCost\|commissionAmount" prisma/schema.prisma` pada model `InvoiceLine`. Bila snapshot bahan menyimpan biaya per sesi (bukan dikali jumlah), sesuaikan angka harapan dengan rumus di `lineCosts` (`src/lib/costing.ts`) — baca rumusnya, jangan menebak — dan catat di ledger.

Buat `tests/unit/components/add-free-line-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddFreeLineDialog } from "@/components/admin/billing/add-free-line-dialog";
import { addFreeLine, addServiceLine } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ addFreeLine: vi.fn(), addServiceLine: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SERVICES = [
  { id: "s1", slug: "relaxing-facial", name: "Relaxing Facial", categoryId: "c1", categoryName: "Facial Treatment", price: 149_000, durationMin: 60, requiresDoctor: false },
  { id: "s2", slug: "add-on-masker", name: "Add-on Masker", categoryId: "c1", categoryName: "Facial Treatment", price: 50_000, durationMin: 15, requiresDoctor: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addServiceLine).mockResolvedValue({ ok: true, data: { version: 2 } });
  vi.mocked(addFreeLine).mockResolvedValue({ ok: true, data: { version: 2 } });
});

describe("AddFreeLineDialog (spec layanan situs 6)", () => {
  it("memilih dari katalog: nama dan harga terkunci, hanya jumlah yang diisi", async () => {
    const user = userEvent.setup();
    renderAdmin(<AddFreeLineDialog invoiceId="inv" version={1} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Baris layanan" }));
    await user.click(screen.getByRole("combobox", { name: "Layanan" }));
    await user.click(await screen.findByRole("option", { name: "Add-on Masker — Rp 50.000" }));
    expect(screen.getByLabelText("Harga")).toHaveValue("Rp 50.000");
    expect(screen.getByLabelText("Harga")).toBeDisabled();
    expect(screen.queryByLabelText("Nama")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Jumlah"));
    await user.type(screen.getByLabelText("Jumlah"), "2");
    await user.click(screen.getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(addServiceLine).toHaveBeenCalledWith({ invoiceId: "inv", version: 1, serviceId: "s2", quantity: 2 }));
    expect(addFreeLine).not.toHaveBeenCalled();
  });

  it("\"Lainnya (ketik sendiri)\" membuka isian bebas seperti sebelumnya", async () => {
    const user = userEvent.setup();
    renderAdmin(<AddFreeLineDialog invoiceId="inv" version={1} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Baris layanan" }));
    await user.click(screen.getByRole("combobox", { name: "Layanan" }));
    await user.click(await screen.findByRole("option", { name: "Lainnya (ketik sendiri)" }));
    await user.type(screen.getByLabelText("Nama"), "Facial Khusus");
    await user.type(screen.getByLabelText("Harga"), "100000");
    await user.click(screen.getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(addFreeLine).toHaveBeenCalledWith({ invoiceId: "inv", version: 1, kind: "LAYANAN", name: "Facial Khusus", quantity: 1, unitPrice: 100_000 }));
  });

  it("tanpa pilihan: pesan \"Pilih layanan.\"", async () => {
    const user = userEvent.setup();
    renderAdmin(<AddFreeLineDialog invoiceId="inv" version={1} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Baris layanan" }));
    await user.click(screen.getByRole("button", { name: "Tambah" }));
    expect(await screen.findByText("Pilih layanan.")).toBeInTheDocument();
    expect(addServiceLine).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/invoice.test.ts tests/unit/components/add-free-line-dialog.test.tsx && npm run test:integration -- tests/integration/invoice-service-line.test.ts`
Expected: FAIL — `validateServiceLineAdd is not a function`, `addServiceLine is not a function`, dan combobox "Layanan" tidak ditemukan.

- [ ] **Step 3: Validasi dan aksi**

Di `src/lib/invoice.ts`, sesudah `validateFreeLine`:

```ts
export type ServiceLineInput = { serviceId: string; quantity: number };

/** Baris treatment dari katalog internal (spec layanan situs 6): nama dan harga dari katalog, hanya jumlah yang diisi. */
export function validateServiceLineAdd(raw: unknown): Validation<ServiceLineInput> {
  if (!isObject(raw)) return fail(INVALID_FORM);
  if (typeof raw.serviceId !== "string" || !raw.serviceId) return fail("Pilih layanan.");
  if (!isWhole(raw.quantity, 1, MAX_QUANTITY)) return fail("Jumlah harus bilangan bulat lebih dari 0.");
  return { ok: true, value: { serviceId: raw.serviceId, quantity: raw.quantity } };
}
```

Di `src/server/invoice-drafts.ts`, tambahkan `validateServiceLineAdd` ke import dari `@/lib/invoice`, tambahkan `import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";` bila belum ada, lalu sesudah fungsi `addFreeLine`:

```ts
/**
 * Treatment dari katalog internal (spec layanan situs 6): baris TREATMENT tertaut `serviceId` berharga katalog, sehingga
 * pelaksana, biaya, komisi, dan sesi paket berlaku seperti baris dari kunjungan.
 */
export async function addServiceLine(input: { invoiceId: string; version: number; serviceId: string; quantity: number }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const checked = validateServiceLineAdd(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const { serviceId, quantity } = checked.value;
    const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { id: true, slug: true, name: true, promoPrice: true, isActive: true } });
    if (!service?.isActive || service.slug === ONLINE_SERVICE_SLUG) throw new UserFacingError("Layanan tidak tersedia.");
    const invoiceId = String(input.invoiceId ?? "");

    const version = await prisma.$transaction(async (tx) => {
      const next = await touchDraft(tx, invoiceId, input.version);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: { invoiceId, kind: "TREATMENT", name: service.name, quantity, unitPrice: service.promoPrice, serviceId: service.id, sortOrder: await nextSortOrder(tx, invoiceId) },
        });
      });
      return next;
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: `Tambah baris ${service.name} ×${quantity}` });
    revalidateInvoices(invoiceId);
    return { version };
  });
}
```

- [ ] **Step 4: Dialog dua mode**

Ganti seluruh isi `src/components/admin/billing/add-free-line-dialog.tsx` dengan:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatRupiah } from "@/lib/format";
import { validateFreeLine, validateServiceLineAdd } from "@/lib/invoice";
import { addFreeLine, addServiceLine } from "@/server/invoice-drafts";
import type { InternalServiceOption } from "@/server/internal-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

const OTHER = "lainnya";
type Choice = { id: string; label: string; group: string };

/**
 * Tambah baris layanan (spec tagihan 4.2, spec layanan situs 6): treatment dari katalog internal dengan harga katalog, atau
 * "Lainnya (ketik sendiri)" untuk hal yang belum ada di katalog, tanpa biaya maupun komisi.
 */
export function AddFreeLineDialog({ invoiceId, version, services = [] }: { invoiceId: string; version: number; services?: InternalServiceOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(services.length === 0 ? OTHER : "");
  const [kind, setKind] = useState<"LAYANAN" | "TREATMENT">("LAYANAN");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choices: Choice[] = [
    ...services.map((service) => ({ id: service.id, label: `${service.name} — ${formatRupiah(service.price)}`, group: service.categoryName })),
    { id: OTHER, label: "Lainnya (ketik sendiri)", group: "Lainnya" },
  ];
  const selected = choices.find((option) => option.id === choice) ?? null;
  const service = services.find((option) => option.id === choice) ?? null;

  function reset() {
    setChoice(services.length === 0 ? OTHER : "");
    setKind("LAYANAN");
    setName("");
    setQuantity("1");
    setUnitPrice(null);
  }

  function finish(result: { ok: true } | { ok: false; error: string }) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  function add() {
    if (choice !== OTHER) {
      const checked = validateServiceLineAdd({ serviceId: choice, quantity: Number(quantity) });
      if (!checked.ok) {
        setError(checked.message);
        return;
      }
      setError(null);
      startTransition(async () => {
        try {
          finish(await addServiceLine({ invoiceId, version, ...checked.value }));
        } catch {
          setError("Gagal menambah baris. Coba lagi.");
        }
      });
      return;
    }
    const checked = validateFreeLine({ kind, name, quantity: Number(quantity), unitPrice: unitPrice ?? Number.NaN });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        finish(await addFreeLine({ invoiceId, version, ...checked.value }));
      } catch {
        setError("Gagal menambah baris. Coba lagi.");
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
        + Baris layanan
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Tambah baris layanan</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              id="line-service"
              options={choices}
              value={selected}
              onChange={(_, option) => setChoice(option?.id ?? "")}
              groupBy={(option) => option.group}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Tidak ada layanan yang cocok."
              fullWidth
              renderInput={(params) => <TextField {...params} label="Layanan" />}
            />
            {choice === OTHER && (
              <>
                <SelectField id="free-kind" label="Jenis" value={kind} onChange={(value) => setKind(value as "LAYANAN" | "TREATMENT")}>
                  <option value="LAYANAN">Layanan</option>
                  <option value="TREATMENT">Treatment</option>
                </SelectField>
                <TextField id="free-name" label="Nama" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
              </>
            )}
            <TextField
              id="free-quantity"
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1 } }}
            />
            {choice === OTHER ? (
              <RupiahInput id="free-price" label="Harga" value={unitPrice} onChange={setUnitPrice} fullWidth />
            ) : (
              service && <TextField id="catalog-price" label="Harga" value={formatRupiah(service.price)} disabled fullWidth helperText="Harga katalog. Potongan lewat diskon per item." />
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={add} disabled={pending}>
            Tambah
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

Catatan: `EditResult` adalah `ActionResult<{ version: number }>`; `finish` hanya membaca `ok`/`error`, jadi meneruskan hasil aksi langsung sah. Bila `tsc` menolak tipe argumen `finish`, ubah parameternya menjadi `ActionResult<unknown>` (import tipe dari `@/lib/action-result`).

- [ ] **Step 5: Teruskan pilihan dari halaman tagihan**

Di `src/components/admin/billing/invoice-draft-editor.tsx`: tambahkan `import type { InternalServiceOption } from "@/server/internal-catalog";`, tambahkan `services = [],` ke destrukturisasi props dan `services?: InternalServiceOption[];` ke tipe props `InvoiceDraftEditor`, lalu ganti `<AddFreeLineDialog invoiceId={detail.id} version={detail.version} />` menjadi `<AddFreeLineDialog invoiceId={detail.id} version={detail.version} services={services} />`.

Di `src/app/(admin)/admin/tagihan/[id]/page.tsx`: tambahkan `import { listInternalServiceOptions } from "@/server/internal-catalog";` dan prop `services={await listInternalServiceOptions()}` pada `<InvoiceDraftEditor … />` (sesudah `performers={await listPerformers()}`).

- [ ] **Step 6: Uji E2E lama memilih "Lainnya"**

Di `tests/e2e/struk.spec.ts`, `tests/e2e/tagihan.spec.ts`, dan `tests/e2e/tagihan-diskon.spec.ts`, tepat sesudah baris `const lineDialog = … getByRole("dialog", { name: "Tambah baris layanan" });`, tambahkan (dengan `page`/`rp` sesuai berkas):

```ts
  await pilihOpsi(lineDialog, "Layanan", "Lainnya (ketik sendiri)");
```

dan pastikan `pilihOpsi` diimpor dari `./helpers/mui` di ketiga berkas.

- [ ] **Step 7: Jalankan uji, pastikan lulus**

Run: `npx vitest run tests/unit/invoice.test.ts tests/unit/components/add-free-line-dialog.test.tsx tests/unit/invoice-draft-editor.test.tsx && npm run test:integration -- tests/integration/invoice-service-line.test.ts tests/integration/invoice-draft.test.ts && npx tsc --noEmit -p .`
Expected: semua PASS; `tsc` tanpa keluaran.

- [ ] **Step 8: Commit**

```bash
git add src/lib/invoice.ts src/server/invoice-drafts.ts src/components/admin/billing/add-free-line-dialog.tsx src/components/admin/billing/invoice-draft-editor.tsx "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/unit/invoice.test.ts tests/unit/components/add-free-line-dialog.test.tsx tests/integration/invoice-service-line.test.ts tests/e2e/struk.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts
git commit -m "feat: pick catalog treatments in the add-line dialog with a free-text fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: E2E satu cerita dan rangkaian uji penuh

**Files:**
- Create: `tests/e2e/layanan-situs.spec.ts`
- Test: rangkaian penuh

**Interfaces:**
- Consumes: semua task sebelumnya; `E2E_ADMIN`, `E2E_KEUANGAN`, `E2E_RESEPSIONIS` dari `tests/e2e/credentials.ts`; `signIn` dari `tests/e2e/helpers/quiz.ts`; `pilihOpsi`, `tungguHidrasi` dari `tests/e2e/helpers/mui.ts`; `buatPasienBaru` dari `tests/e2e/helpers/pasien-baru.ts`.

- [ ] **Step 1: Tulis uji E2E**

Buat `tests/e2e/layanan-situs.spec.ts`:

```ts
import { expect, test, type TestInfo } from "@playwright/test";
import sharp from "sharp";
import { E2E_ADMIN, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

// Satu cerita berurutan per proyek (spec layanan situs 8): Admin Keuangan menambah item khusus internal → Super Admin membuat
// layanan situs bertautan dengan foto → Resepsionis menagihkan item itu dari katalog.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");
const stamp = Date.now().toString().slice(-6);
const internalName = (t: string) => `Add-on E2E ${t} ${stamp}`;
const siteName = (t: string) => `Promo Add-on E2E ${t} ${stamp}`;
const siteSlug = (t: string) => `promo-add-on-e2e-${t.toLowerCase()}-${stamp}`;

test("Admin Keuangan menambah layanan khusus internal yang tidak tampil di situs", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/layanan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Layanan internal" }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah layanan internal" });
  await dialog.getByLabel("Nama").fill(internalName(t));
  await dialog.getByLabel("Kategori").selectOption({ label: "Facial Treatment" });
  await dialog.getByLabel("Harga berlaku").fill("75000");
  await dialog.getByLabel("Durasi (menit)").fill("30");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row", { name: new RegExp(internalName(t)) })).toContainText("Hanya internal", { timeout: 30_000 });

  await page.goto("/layanan");
  await expect(page.locator("main")).not.toContainText(internalName(t));
});

test("Super Admin membuat layanan situs bertautan dengan foto; tampil di /layanan dengan harga internal", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#c8a97e" } }).png().toBuffer();
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/layanan?tab=situs");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Layanan situs" }).click();
  const add = page.getByRole("dialog", { name: "Tambah layanan situs" });
  await pilihOpsi(add, "Layanan internal", `${internalName(t)} — Rp 75.000`);
  await add.getByLabel("Nama di situs").fill(siteName(t));
  await expect(add.getByLabel("Alamat (slug)")).toHaveValue(siteSlug(t));
  await add.getByRole("button", { name: "Simpan" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });

  await page.getByRole("button", { name: `Ubah ${siteName(t)}` }).click();
  const edit = page.getByRole("dialog", { name: `Ubah — ${siteName(t)}` });
  await edit.getByLabel("Berkas foto layanan").setInputFiles({ name: "layanan.png", mimeType: "image/png", buffer: photo });
  await expect(edit.getByRole("img", { name: "Pratinjau foto baru" })).toBeVisible();
  await edit.getByRole("button", { name: "Pakai foto ini" }).click();
  await expect(page.getByText("Foto diganti dan sudah tampil di situs.")).toBeVisible({ timeout: 30_000 });
  await edit.getByRole("button", { name: "Simpan" }).click();
  await expect(edit).toBeHidden({ timeout: 30_000 });

  await page.goto(`/layanan/${siteSlug(t)}`);
  await expect(page.getByRole("heading", { level: 1, name: siteName(t) })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("main")).toContainText("Rp 75.000");
  const hero = page.locator("main img").first();
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const src = (await hero.getAttribute("src")) ?? "";
  expect(decodeURIComponent(new URL(src, "http://localhost").searchParams.get("url") ?? src)).toMatch(/^\/foto-layanan\/[0-9a-z]+-[0-9a-f]{8}\.webp$/);
});

test("Resepsionis menagihkan item khusus internal dari katalog dan memilih pelaksana", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const sale = page.getByRole("dialog", { name: "Penjualan langsung" });
  await sale.getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(page, { name: `Pelanggan Katalog ${t} ${stamp}`, whatsapp: `0813${Date.now().toString().slice(-8)}` });
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });

  await page.getByRole("button", { name: "+ Baris layanan" }).click();
  const line = page.getByRole("dialog", { name: "Tambah baris layanan" });
  await pilihOpsi(line, "Layanan", `${internalName(t)} — Rp 75.000`);
  await expect(line.getByLabel("Harga")).toBeDisabled();
  await line.getByRole("button", { name: "Tambah" }).click();
  await expect(line).toBeHidden({ timeout: 30_000 });

  await expect(page.getByRole("row", { name: new RegExp(internalName(t)) })).toContainText("Rp 75.000", { timeout: 30_000 });
  await page.getByLabel(`Pelaksana ${internalName(t)}`).selectOption({ label: "Terapis SunDY Mahakeret" });
  await expect(page.getByLabel(`Pelaksana ${internalName(t)}`)).not.toHaveValue("", { timeout: 30_000 });
});
```

Sebelum menjalankan, periksa dua asumsi dan sesuaikan bila berbeda (catat di ledger): label pemilih pelaksana di `src/components/admin/billing/line-performer-select.tsx` (`grep -n "aria-label\|label=" src/components/admin/billing/line-performer-select.tsx`), dan nama terapis aktif di seed (`grep -n "Terapis" prisma/seed.ts`). Bila heading halaman detail layanan bukan `level: 1`, pakai `getByRole("heading", { name: siteName(t) }).first()`.

- [ ] **Step 2: Jalankan E2E baru**

Run: `npx playwright test tests/e2e/layanan-situs.spec.ts --project=desktop --workers=1`
Expected: 3/3 PASS. Lalu: `npx playwright test tests/e2e/layanan-situs.spec.ts --project=mobile --workers=1` → 3/3 PASS.

Bila foto tidak tampil di /layanan/<slug> karena pengoptimal gambar Next.js menolak jalur `/foto-layanan/`, cek perilaku `/foto-dokter/` di `src/components/public/arch-image.tsx`; pakai cara yang sama untuk `ServiceCard`/`PageHero` dan catat di ledger.

- [ ] **Step 3: Jalankan E2E yang tersentuh**

Run: `npx playwright test tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/struk.spec.ts tests/e2e/tampilan-admin.spec.ts tests/e2e/harga-modal.spec.ts tests/e2e/durasi-konsultasi.spec.ts tests/e2e/public-site.spec.ts tests/e2e/public-registration.spec.ts tests/e2e/admin-booking.spec.ts --project=desktop --workers=1`
Expected: semua PASS.

- [ ] **Step 4: Rangkaian penuh**

Sebelum uji integrasi penuh sesudah E2E, kosongkan sisa tagihan di basis data uji:

```bash
U=$(grep -E '^TEST_DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'); psql "$U" -qc "begin; delete from \"PackageSessionEntry\"; update \"InvoiceLine\" set \"patientPackageItemId\" = null; delete from \"PatientPackage\"; delete from \"InvoicePayment\"; delete from \"InvoiceStockUse\"; delete from \"InvoiceLine\"; delete from \"Invoice\"; delete from \"TreatmentPackage\" where name like 'Paket E2E%'; delete from \"DispensingLine\"; delete from \"Dispensing\"; delete from \"StockMovement\"; delete from \"SupplierReturnLine\"; delete from \"SupplierReturn\"; delete from \"SupplierPayment\"; delete from \"StockBatch\"; delete from \"PurchaseLine\"; delete from \"PurchaseInvoice\"; commit;"
```

Run: `npx tsc --noEmit -p . && npx vitest run > .superpowers/unit.log 2>&1; tail -8 .superpowers/unit.log && npm run test:integration > .superpowers/integration.log 2>&1; tail -8 .superpowers/integration.log`
Expected: `tsc` bersih; unit semua PASS (uji `service-price-table`, `check-in-dialog`, `patient-picker` boleh diulang sekali bila gagal karena tekanan memori); integrasi semua PASS kecuali 3 kegagalan lama di `schedule.test.ts` yang sudah dikenal.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/layanan-situs.spec.ts
git commit -m "test: e2e for internal-only services, site services with photos, and catalog billing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
