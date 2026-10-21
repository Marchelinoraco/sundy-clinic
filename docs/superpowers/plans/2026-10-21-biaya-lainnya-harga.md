# Biaya lainnya & harga ≥ biaya — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin Keuangan can record named "biaya lainnya" per treatment session, edit price and costs in one "Harga & biaya" dialog, and no path can save a harga berlaku below the total cost per session; margins count the new costs.

**Architecture:** New `ServiceCostLine` table plus `InvoiceLine.otherCost` (total copied at finalize). Pure rules in `src/lib/costing.ts` are shared by the browser (live summary) and the server actions in `src/server/service-admin.ts`. The server is authoritative: every price-or-cost write locks the `Service` row, reads the costs, and rejects when the total exceeds the price.

**Tech Stack:** Next.js 15 server actions, Prisma 7 + PostgreSQL (raw-SQL CHECKs in migrations), MUI, Vitest (unit `npx vitest run`, integration `npm run test:integration` on `sundy_test`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-biaya-lainnya-harga-design.md`

## Global Constraints

- Total biaya per sesi = bahan + alat + komisi per sesi (PERSEN = `floor(price × pct / 100)`) + Σ biaya lainnya; total **>** harga berlaku is rejected, **=** is allowed (BL4).
- Biaya lainnya: name trimmed 1–60 chars, amount Rp 1–2.000.000.000 (`MAX_AMOUNT`), at most 20 rows, duplicate names (case-insensitive, after trim) rejected, rows with empty name AND empty amount ignored (BL11).
- Copy (Indonesian, exact):
  - dialog over-cost: `Total biaya Rp X melebihi harga berlaku Rp Y. Naikkan harga berlaku atau kurangi biaya.`
  - price-path rejection: `Harga berlaku Rp Y di bawah total biaya per sesi Rp X. Naikkan harga atau kurangi biaya lewat tombol Harga & biaya.`
  - partial row: `Isi nama dan nominal biaya lainnya baris N.` · long name: `Nama biaya lainnya paling banyak 60 karakter.` · bad amount: `Nominal biaya lainnya baris N tidak sah.` · duplicate: `Nama biaya lainnya "NAMA" dipakai dua kali.` · too many: `Biaya lainnya paling banyak 20 baris.`
  - dialog title / button: `Harga & biaya {name}` / `Harga & biaya` (aria-label `Harga & biaya {name}`); legacy flag `Biaya melebihi harga`; invoice margin row `Bahan, alat, dan lainnya`; margin column `Lainnya`.
- Field label stays **"Harga berlaku"** (BL10). Price/cost writes need `price:manage`; `updateInternalService` keeps `catalog:manage`; `updateOnlineService` keeps `content:manage`.
- Table, Ubah and Konsultasi Online paths check only when `promoPrice` changes (BL13); all four paths lock the row in the same transaction as the check (BL14).
- Migration only adds; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Commission PERSEN 100 with any fixed cost: every price fails; the message must still name the total at that price (no "minimum price" arithmetic) — Task 2 test.
2. Admin clicks "+ Biaya lainnya" and leaves the row blank: saving must succeed and store nothing for that row — Task 2 + Task 4 tests.
3. "Listrik" and " listrik " on the same treatment: rejected as duplicate — Task 2 test.
4. Legacy over-cost service edited via Ubah (name only) or table (harga coret only): allowed; lowering harga berlaku: rejected — Task 3 test.
5. Konsultasi Online inactive at Rp 0 with zero cost: allowed — Task 3 test.

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (model `Service` ~line 164, model `InvoiceLine` ~line 1280)
- Create: `prisma/migrations/20261022090000_biaya_lainnya/migration.sql`
- Test: `tests/integration/harga-modal-schema.test.ts`

**Interfaces:**
- Produces: `model ServiceCostLine { id String @id @default(cuid()); serviceId String; service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade); name String; amount Int; sortOrder Int @default(0); @@index([serviceId]) }`, `Service.costLines ServiceCostLine[]`, `InvoiceLine.otherCost Int @default(0)` (doc comment: total biaya lainnya baris saat final, spec biaya lainnya BL2/BL9).

- [ ] **Step 1: Write failing tests** in `harga-modal-schema.test.ts`: `it("biaya lainnya: nama 1–60, nominal 1..2 miliar; ikut terhapus bersama layanan")` — `serviceCostLine.create` with `name: "  "` → rejects `/service_cost_line_values/`; `name: "x".repeat(61)` → same; `amount: 0` → same; valid `{ name: "Listrik", amount: 3000 }` succeeds. `it("salinan biaya lainnya baris tagihan tidak negatif")` — `invoiceLine.create` with `otherCost: -1` → rejects `/invoice_line_cost_values/`.
- [ ] **Step 2:** `npm run test:integration -- tests/integration/harga-modal-schema.test.ts` → FAIL (unknown model/field).
- [ ] **Step 3:** Edit schema; generate SQL with `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, save it as the migration, and append:
  ```sql
  ALTER TABLE "ServiceCostLine" ADD CONSTRAINT "service_cost_line_values" CHECK (
    char_length(btrim("name")) BETWEEN 1 AND 60 AND "amount" BETWEEN 1 AND 2000000000);
  ALTER TABLE "InvoiceLine" DROP CONSTRAINT "invoice_line_cost_values";
  ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_cost_values" CHECK (
    "materialCost" >= 0 AND "toolCost" >= 0 AND "otherCost" >= 0 AND "commissionAmount" >= 0
    AND (("performerId" IS NULL) = ("performerName" IS NULL))
    AND ("performerId" IS NULL OR "kind" = 'TREATMENT'));
  ```
  Apply: `npm run db:migrate:test && npx prisma generate`.
- [ ] **Step 4:** Re-run Step 2 → PASS.
- [ ] **Step 5:** Commit `feat: store other per-session treatment costs`.

### Task 2: Pure cost rules

**Files:**
- Modify: `src/lib/costing.ts`
- Test: `tests/unit/costing.test.ts`

**Interfaces:**
- Produces (all exported from `src/lib/costing.ts`):
  - `OTHER_COST_NAME_MAX = 60`, `OTHER_COST_LINES_MAX = 20`
  - `type OtherCost = { name: string; amount: number }`
  - `validateOtherCosts(raw: unknown): Validation<OtherCost[]>` — input `{ name: string; amount: number | null }[]`; output names trimmed, order kept, blank rows dropped.
  - `totalCostPerSession(cost: ServiceCostInput, otherCosts: readonly OtherCost[], price: number): number`
  - `costOverPrice(cost, otherCosts, price): string | null` — dialog copy.
  - `priceBelowCost(cost, otherCosts, price): string | null` — price-path copy.
  - `serviceCostSummary(cost: ServiceCostInput, otherCosts: readonly OtherCost[] = []): string` — appends ` · lainnya Rp N` only when `otherCosts.length > 0`.
  - `lineCosts(input: { quantity: number; hasPerformer: boolean; service: (CostedService & { otherCosts: readonly OtherCost[] }) | null }): { materialCost: number; toolCost: number; otherCost: number; commissionAmount: number }` — `otherCost = Σ amount × quantity`.
- `costWarning` stays until Task 4 removes it.

- [ ] **Step 1: Write failing tests** (`describe("biaya lainnya")`):
  - `validateOtherCosts([{ name: " Laundry ", amount: 5000 }, { name: "", amount: null }])` → `{ ok: true, value: [{ name: "Laundry", amount: 5000 }] }`
  - `[{ name: "Listrik", amount: null }]` → message `Isi nama dan nominal biaya lainnya baris 1.`
  - `[{ name: "x".repeat(61), amount: 1 }]` → `Nama biaya lainnya paling banyak 60 karakter.`
  - `[{ name: "A", amount: 0 }]` → `Nominal biaya lainnya baris 1 tidak sah.`
  - `[{ name: "Listrik", amount: 1 }, { name: " listrik ", amount: 2 }]` → `Nama biaya lainnya "listrik" dipakai dua kali.`
  - 21 valid rows → `Biaya lainnya paling banyak 20 baris.`; a non-array → `Data tidak sah. Muat ulang halaman lalu coba lagi.`
  - `totalCostPerSession({ materialCost: 20_000, toolCost: 10_000, commissionKind: "NOMINAL", commissionValue: 15_000 }, [{ name: "Laundry", amount: 5000 }, { name: "Listrik", amount: 3000 }], 149_000)` → `53_000`; with PERSEN 10 at price 149_000 → `20_000 + 10_000 + 14_900 + 8000`.
  - `costOverPrice(cost=53_000 total, others, 53_000)` → `null`; at 52_999 → `Total biaya Rp 53.000 melebihi harga berlaku Rp 52.999. Naikkan harga berlaku atau kurangi biaya.` (use a NOMINAL cost so the total is price-independent)
  - Review Focus 1: `priceBelowCost({ materialCost: 1, toolCost: 0, commissionKind: "PERSEN", commissionValue: 100 }, [], 1000)` → `Harga berlaku Rp 1.000 di bawah total biaya per sesi Rp 1.001. Naikkan harga atau kurangi biaya lewat tombol Harga & biaya.`
  - `serviceCostSummary(cost, [])` unchanged from today; with the two rows → ends `· lainnya Rp 8.000`.
  - `lineCosts({ quantity: 2, hasPerformer: true, service: { promoPrice: 100_000, materialCost: 1, toolCost: 2, commissionKind: null, commissionValue: 0, otherCosts: [{ name: "L", amount: 5000 }] } })` → `{ materialCost: 2, toolCost: 4, otherCost: 10_000, commissionAmount: 0 }`.
- [ ] **Step 2:** `npx vitest run tests/unit/costing.test.ts` → FAIL.
- [ ] **Step 3:** Implement in `src/lib/costing.ts`; `lineCosts` change requires `src/server/invoice-lifecycle.ts` treatment-line block to select `costLines: { select: { name: true, amount: true } }` and pass `{ ...service, otherCosts: service.costLines }` so the build stays green (the `otherCost` field then lands in `invoiceLine.update`).
- [ ] **Step 4:** Re-run Step 2 → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat: rules for other costs and price at or above cost`.

### Task 3: Server writes and catalog read

**Files:**
- Modify: `src/server/service-admin.ts`, `src/server/catalog-admin-read.ts`
- Test: `tests/integration/service-cost.test.ts`, `tests/integration/internal-service-admin.test.ts`, `tests/integration/online-service-admin.test.ts`

**Interfaces:**
- Consumes: Task 2 functions.
- Produces:
  - `updateServicePricing(input: { id: string; normalPrice: number | null; promoPrice: number; materialCost: number; toolCost: number; commissionKind: CommissionKindValue | null; commissionValue: number; otherCosts: { name: string; amount: number | null }[] }): Promise<ActionResult>` — `price:manage`; validates with `validatePriceChange`, `validateServiceCost`, `validateOtherCosts`, then `costOverPrice`; rejects the online service like `findEditableService`; one transaction: lock row (`SELECT id FROM "Service" WHERE id = … FOR UPDATE`), update price + cost fields, `serviceCostLine.deleteMany` + `createMany` with `sortOrder` = index; audit `action: "service.pricing"`, summary `${name}: harga ${formatRupiah(promoPrice)}; ${serviceCostSummary(cost, otherCosts)}`; `revalidateServicePages(id)`.
  - `InternalServiceRow` gains `otherCosts: OtherCost[]` (ordered by `sortOrder`).
  - Private helper in `service-admin.ts`: `lockServiceCosts(tx, id)` returning `{ id, slug, name, promoPrice, cost: ServiceCostInput, otherCosts: OtherCost[] } | null`, used by all four paths.
  - `updateServicePrice`, `updateInternalService`, `updateOnlineService`: inside a transaction with the lock; when the new `promoPrice` differs from the stored one, `priceBelowCost(...)` → `UserFacingError`.
- `updateServiceCost` stays until Task 4.

- [ ] **Step 1: Write failing tests:**
  - `service-cost.test.ts`: `it("Harga & biaya: harga, biaya, dan biaya lainnya tersimpan sekaligus; urutan dijaga; audit")` — save price 149_000 + NOMINAL 15_000 + rows Laundry 5000, Listrik 3000 → service row and `serviceCostLine` rows `[["Laundry",5000,0],["Listrik",3000,1]]`; audit summary `Facial Uji: harga Rp 149.000; bahan Rp 20.000 · alat Rp 10.000 · komisi Rp 15.000/sesi · lainnya Rp 8.000`. Saving again with only `[Listrik 3000]` leaves one row.
  - `it("total biaya melebihi harga berlaku ditolak; sama dengan harga boleh")` — over by Rp 1 → `{ ok: false, error: "Total biaya … Naikkan harga berlaku atau kurangi biaya." }` and nothing changed; equal → ok.
  - `it("harga di tabel tidak boleh turun di bawah biaya; harga coret saja tetap boleh (BL13)")` — with total 53_000: `updateServicePrice({ promoPrice: 50_000 })` → price-path message; `{ promoPrice: 149_000 (unchanged), normalPrice: 200_000 }` → ok even after `prisma.service.update` forces a legacy over-cost state (Review Focus 4).
  - `internal-service-admin.test.ts`: Ubah lowering price below cost → price-path message; renaming only on a legacy over-cost service → ok.
  - `online-service-admin.test.ts`: inactive at Rp 0 with zero cost → ok (Review Focus 5).
  - Resepsionis calling `updateServicePricing` → throws `forbidden: price:manage`.
- [ ] **Step 2:** `npm run test:integration -- tests/integration/service-cost.test.ts tests/integration/internal-service-admin.test.ts tests/integration/online-service-admin.test.ts` → FAIL.
- [ ] **Step 3:** Implement per Interfaces; `getInternalCatalog` selects `costLines: { orderBy: { sortOrder: "asc" }, select: { name: true, amount: true } }`.
- [ ] **Step 4:** Re-run Step 2 → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat: save price and costs together and refuse prices below cost`.

### Task 4: "Harga & biaya" dialog and table

**Files:**
- Modify: `src/components/admin/service-cost-dialog.tsx` (component keeps the name `ServiceCostDialog`), `src/components/admin/service-price-table.tsx`, `src/lib/costing.ts` (delete `costWarning`), `src/server/service-admin.ts` (delete `updateServiceCost`)
- Test: `tests/unit/components/service-cost-dialog.test.tsx`, `tests/unit/components/service-price-table.test.tsx`, `tests/unit/costing.test.ts`, `tests/integration/service-cost.test.ts`, `tests/e2e/harga-modal.spec.ts`

**Interfaces:**
- Consumes: `updateServicePricing` and `InternalServiceRow.otherCosts` (Task 3); `totalCostPerSession`, `costOverPrice`, `validateOtherCosts`, `serviceCostSummary` (Task 2).
- `ServiceCostDialog` props: `{ service: InternalServiceRow }`.

Layout follows the approved mockup (`.superpowers/brainstorm/50530-1792593283/content/harga-dan-biaya.html`): Harga section (`Harga coret (opsional)`, `Harga berlaku`), Biaya per sesi (note `Per sesi. Bahan, alat, dan biaya lainnya masuk harga pokok laporan; komisi untuk pelaksana treatment.`, bahan, alat, komisi), Biaya lainnya (rows with labels `Nama biaya lainnya N` / `Nominal biaya lainnya N`, button `Hapus biaya lainnya N`, button `+ Biaya lainnya`), summary `Total biaya per sesi Rp X · harga berlaku Rp Y` plus `Sisa Rp Z per sesi` or (error colour) `Kurang Rp Z per sesi` and the over-cost alert; Simpan disabled while `costOverPrice` is non-null. Commission PERSEN uses the typed price (BL7).

- [ ] **Step 1: Write failing tests** (`service-cost-dialog.test.tsx`, replace the old warning test):
  - `it("mengisi harga, biaya, dan dua biaya lainnya; mengirim semuanya sekaligus")` → `updateServicePricing` called with `{ id, normalPrice: 189_000, promoPrice: 149_000, materialCost: 20_000, toolCost: 10_000, commissionKind: "NOMINAL", commissionValue: 15_000, otherCosts: [{ name: "Laundry handuk", amount: 5000 }, { name: "Listrik", amount: 3000 }] }`; summary shows `Total biaya per sesi Rp 53.000` and `Sisa Rp 96.000 per sesi`.
  - `it("total melebihi harga: pesan merah, Simpan nonaktif; menaikkan harga mengaktifkan lagi")`.
  - `it("baris biaya lainnya kosong diabaikan; Hapus menghapus barisnya")` (Review Focus 2).
  - `it("komisi persen dihitung dari harga yang sedang diketik")`.
  - `service-price-table.test.tsx`: cell shows `… · lainnya Rp 8.000` and `total Rp 53.000`; a legacy row whose total > price shows `Biaya melebihi harga`; button name `Harga & biaya Relaxing Facial`.
- [ ] **Step 2:** `npx vitest run tests/unit/components/service-cost-dialog.test.tsx tests/unit/components/service-price-table.test.tsx` → FAIL.
- [ ] **Step 3:** Implement; remove `costWarning` (and its unit test) and `updateServiceCost` (move its integration assertions to `updateServicePricing`); in `tests/e2e/harga-modal.spec.ts` open `Harga & biaya Relaxing Facial`, fill one biaya lainnya `Laundry handuk` 5000, and assert the over-cost case disables Simpan before saving a valid set.
- [ ] **Step 4:** Re-run Step 2 → PASS; `npx tsc --noEmit` and `npx eslint src tests --quiet` clean.
- [ ] **Step 5:** Commit `feat: one dialog for price and costs, with other costs`.

### Task 5: Finalize copy, invoice margin, reports

**Files:**
- Modify: `src/lib/costing.ts` (`marginOf`), `src/server/invoice-read.ts`, `src/components/admin/billing/invoice-final-view.tsx`, `src/server/report-sql.ts`, `src/components/admin/report/margin-report.tsx`
- Test: `tests/integration/invoice-costing.test.ts`, `tests/integration/report-margin.test.ts`, `tests/integration/report-cost.test.ts`, `tests/unit/components/margin-report.test.tsx`, `tests/unit/invoice-final-view.test.tsx`, `tests/e2e/harga-modal.spec.ts`

**Interfaces:**
- `marginOf(input: { revenue; stockCost; materialCost; toolCost; otherCost; commission }): number`.
- `MarginGroup` and `byTreatment` rows gain `otherCost: number`; `InvoiceLineRow.costing` and `InvoiceDetail.margin` gain `otherCost`.
- Ringkasan `treatmentCost` = `SUM(materialCost + toolCost + otherCost)`.

- [ ] **Step 1: Write failing tests:**
  - `invoice-costing.test.ts`: with service cost lines Laundry 5000 + Listrik 3000 and quantity 2 → `otherCost: 16_000`; changing the cost lines after finalize leaves the copy unchanged; package-session Rp 0 line still copies `otherCost`.
  - `report-margin.test.ts`: lines seeded with `otherCost` → `report.treatment.otherCost` and `byTreatment[0].otherCost` summed.
  - `report-cost.test.ts`: harga pokok includes `otherCost`.
  - `margin-report.test.tsx`: column `Lainnya` present; margin per treatment subtracts it.
  - `invoice-final-view.test.tsx`: `Bahan, alat, dan lainnyaRp 58.000` for material 40_000 + tool 10_000 + other 8000.
- [ ] **Step 2:** Run those files (integration + unit) → FAIL.
- [ ] **Step 3:** Implement; update the existing E2E margin assertion to `Bahan, alat, dan lainnyaRp 40.000` (35_000 + 5000 from Task 4).
- [ ] **Step 4:** Re-run → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat: count other costs in invoice margin and reports`.

### Task 6: Full verification

- [ ] **Step 1:** `npx tsc --noEmit`, `npx eslint src tests --quiet`, `npx vitest run` → all pass.
- [ ] **Step 2:** `npm run test:integration` → all pass except the known date-bound `tests/integration/schedule.test.ts` (3 tests, pre-existing).
- [ ] **Step 3:** `caffeinate -i npx playwright test tests/e2e/harga-modal.spec.ts tests/e2e/layanan-situs.spec.ts --workers=1` → pass.
- [ ] **Step 4:** Push branch `biaya-lainnya`; hand the owner the compare link and PR text.
