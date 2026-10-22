# Rencana kunjungan paket + pengingat H-1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every patient package gets a next-visit date driven by a catalog interval and per-visit goods amounts; reception gets H-1 WhatsApp reminders, a one-click "Pakai sesuai rencana" at the till, a plan table with "Ubah tanggal rencana", and the latest A4 invoice shows "Kunjungan berikutnya".

**Architecture:** Store only `nextVisitOn` + copied `visitIntervalDays`/`perVisit` on the patient package; a pure planner (`src/lib/package-visit.ts`) derives the visit list from remaining quantities. Package lifecycle hooks in `src/server/package-store.ts` move `nextVisitOn`. Reminders extend `src/server/reminder.ts` with a package box and a `PackageVisitReminder` send log.

**Tech Stack:** Next.js 15 server actions, Prisma 7 + PostgreSQL, MUI, Vitest (unit/integration on `sundy_test`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-jadwal-paket-design.md`

## Global Constraints

- Interval 1–365 days, default 7 (JP2, JP16); `perVisit` required for goods, 1 ≤ perVisit ≤ sessions; treatments always 1 per visit (JP3).
- Visit contents: 1 session of every treatment with remaining > 0, plus `min(perVisit, remaining)` of every goods item; plan continues until all remaining reach 0 (JP3).
- `nextVisitOn` (JP4, JP11): purchase without use → purchase date; any final invoice that consumes → finalize date (WITA) + interval; remaining all 0 or package DIBATALKAN → null; cancelling a usage invoice → last other FINAL usage date + interval, else `startsOn`.
- Reminder day = existing `reminderDay(visitOn, closedDates)` (H-1, earlier if closed) (JP12); hidden when the patient has an appointment `MENUNGGU_KONFIRMASI | TERKONFIRMASI | HADIR` with `startAt` ≥ start of today WITA, or the package is not AKTIF, expired, or empty (JP6).
- WhatsApp copy (JP13): `Halo {firstName}, ini SunDY Clinic. Sesuai program paket {paket}, jadwal kunjungan ke-{n} Anda {besok | pada {formatIndonesianDate}}: {isi}. Balas pesan ini untuk memilih jam ya. Terima kasih.` where `{isi}` = `visitContentsLabel` (e.g. `Facial Brightening, 7 kapsul Slimming Capsule`), `{n}` = distinct FINAL invoices that consumed from the package + 1.
- Plan date change (JP9, JP16): `invoice:manage`; `today ≤ date ≤ expiresOn`; messages `Tanggal rencana tidak boleh sebelum hari ini.` / `Tanggal rencana melewati masa berlaku paket ({dateLabel}).`; audited.
- A4 "Kunjungan berikutnya: {dateLabel}" only on the newest FINAL invoice that bought or used that package, from the live `nextVisitOn` (JP14).
- Backfill (JP15): catalog `visitIntervalDays = 7`; goods `perVisit = ceil(sessions / max(1, max treatment sessions in package))` (all goods when no treatment); patient packages likewise from **remaining**, `nextVisitOn = (last FINAL usage date or startsOn) + 7` when AKTIF and remaining > 0.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Package bought and its first session used in the same invoice: next visit = purchase date + interval, reminder "ke-2" — Task 4 test.
2. Patient already booked for tomorrow: no package reminder row — Task 5 test.
3. Reminder sent, then the patient comes late: after the visit the row disappears and the new date gets a fresh reminder (send log keyed by date) — Task 5 test.
4. "Pakai sesuai rencana" when goods remaining < perVisit (e.g. 3 left of 7) and when a treatment line already exists on the draft: takes 3, reuses the line — Task 6 test.
5. Cancelling the usage invoice that moved the date: date returns to the previous basis — Task 4 test.

---

### Task 1: Schema, migration, backfill

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20261022120000_jadwal_paket/migration.sql`; Test `tests/integration/paket-schema.test.ts`

**Interfaces — Produces:** `TreatmentPackage.visitIntervalDays Int @default(7)`; `TreatmentPackageItem.perVisit Int?`; `PatientPackage.visitIntervalDays Int @default(7)`, `PatientPackage.nextVisitOn DateTime? @db.Date`; `PatientPackageItem.perVisit Int?`; `model PackageVisitReminder { id, patientPackageId (FK Cascade), visitOn DateTime @db.Date, sentAt DateTime @default(now()), staffId, staffName, @@unique([patientPackageId, visitOn]) }` with `PatientPackage.visitReminders`.

- [ ] **Step 1: Failing tests:** CHECK `treatment_package_visit_interval` (0 and 366 rejected); `treatment_package_item_shape` extended: goods with `perVisit` null rejected, `perVisit > sessions` rejected, treatment with `perVisit` set rejected; `patient_package_item_shape` same for goods (`perVisit` 1..sessions) ; `PackageVisitReminder` unique `(patientPackageId, visitOn)`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Schema + `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` saved as the migration, plus: drop/re-add both `*_item_shape` CHECKs with the `perVisit` rules, add `treatment_package_visit_interval` (1–365) and `patient_package_visit_interval`, and backfill `UPDATE` statements per Global Constraints (goods `perVisit` before the new CHECK is added). Apply: `npm run db:migrate:test && npx prisma generate`.
- [ ] **Step 4:** Run → PASS; fix every fixture that creates goods items without `perVisit` (`tests/integration/package-goods.test.ts`, `invoice-a4.test.ts`, `treatment-package-catalog.test.ts`, `package-world.ts`).
- [ ] **Step 5:** Commit `feat: store package visit intervals and next visit dates`.

### Task 2: Pure planner and rules

**Files:** Create `src/lib/package-visit.ts`; Modify `src/lib/treatment-package.ts` (`TreatmentPackageInput`/`validateTreatmentPackage` gain `visitIntervalDays` and goods `perVisit`); Test `tests/unit/package-visit.test.ts`, `tests/unit/treatment-package.test.ts`

**Interfaces — Produces:**
- `type VisitItem = { name: string; unit: string | null; remaining: number; perVisit: number | null }` (`perVisit` null = treatment).
- `type PlannedVisit = { number: number; date: string; contents: { name: string; unit: string | null; quantity: number }[] }`.
- `planVisits(input: { nextVisitOn: string | null; intervalDays: number; visitsDone: number; items: readonly VisitItem[] }): PlannedVisit[]` — `[]` when `nextVisitOn` null or nothing remains.
- `visitContentsLabel(contents): string` — treatments by name, goods `"{q} {unit} {name}"`, joined `", "`.
- `defaultPerVisit(goodsTotal: number, maxTreatmentSessions: number): number`.
- `packageVisitMessage(input: { patientName: string; packageName: string; visitNumber: number; visitOn: string; today: string; contents: PlannedVisit["contents"] }): string` (Global Constraints copy).
- `validatePlanDate(raw: unknown, ctx: { today: string; expiresOn: string }): Validation<string>`.
- Catalog validation messages: `Jarak antar kunjungan 1–365 hari.`, `Isi jumlah per kunjungan {name}.` (missing), `Jumlah per kunjungan 1–{sessions}.`.

- [ ] **Step 1: Failing tests:** 4× Facial + 2× RF + 28 kapsul/7 from 2026-10-22 every 7 days → 4 visits on 22/29 Okt, 5/12 Nov; visits 3–4 without RF; 30 kapsul/7 → last visit 2 kapsul; goods-only 28/7 → 4 visits; `visitsDone: 1` numbers from 2; message for tomorrow uses `besok`, otherwise `pada Senin, 5 November 2026`-style via `formatIndonesianDate`; `defaultPerVisit(28, 4) = 7`, `(30, 4) = 8`, `(28, 0) = 28`; `validatePlanDate` before today / after expiry / ok; catalog validation of interval and `perVisit`.
- [ ] **Step 2:** `npx vitest run tests/unit/package-visit.test.ts tests/unit/treatment-package.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: plan package visits from what remains`.

### Task 3: Catalog — interval and per-visit amounts

**Files:** Modify `src/server/treatment-package-catalog.ts`, `src/components/admin/package/treatment-package-catalog.tsx`; Test `tests/integration/treatment-package-catalog.test.ts`, `tests/unit/components/treatment-package-catalog.test.tsx`

**Interfaces:** `TreatmentPackageView` gains `visitIntervalDays` and items `perVisit: number | null`; create/update persist both.

- [ ] **Step 1: Failing tests:** integration saves and reads `visitIntervalDays: 14` and goods `perVisit: 7`; dialog: field `Jarak antar kunjungan (hari)` with helper `Kunjungan 1 hari pembelian, berikutnya tiap {n} hari.`; goods row field `Per kunjungan {n}` (aria) prefilled with `defaultPerVisit` when the goods row is added; summary row `Rencana: {k} kunjungan, ±{d} hari`; warning text `Rencana kunjungan melewati masa berlaku paket.` when `(k−1)×interval ≥ validDays` (Save still enabled); payload contains `visitIntervalDays` and goods `perVisit`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (reuse `planVisits` with `nextVisitOn` = today for the summary).
- [ ] **Step 4:** → PASS; tsc/eslint clean.
- [ ] **Step 5:** Commit `feat: catalog sets visit interval and amount per visit`.

### Task 4: Lifecycle — copy, move, recompute, change date

**Files:** Modify `src/server/package-store.ts` (`activatePurchasedPackages`, `consumePackageSessions`, `restoreUsedSessions`, `cancelPurchasedPackages`), `src/server/patient-packages.ts`; Test `tests/integration/package-visit.test.ts`

**Interfaces — Produces:** `changeNextVisit(input: { packageId: string; visitOn: string }): Promise<ActionResult<void>>` (`invoice:manage`, audit `patient-package.next-visit`, summary `{paket}: {lama} → {baru}`); private `recomputeNextVisit(tx, patientPackageId, opts: { excludeInvoiceId?: string })`.

- [ ] **Step 1: Failing tests** (package `2× Facial + 30 kapsul/7, interval 7` like `package-goods.test.ts`): purchase-only invoice → `nextVisitOn = startsOn`, copied interval/perVisit; purchase + session in same invoice → today + 7 (Review Focus 1); later usage invoice → its date + 7; all remaining used → null; cancel that later usage invoice → previous basis (Review Focus 5); cancel purchase → null; `changeNextVisit` valid/before-today/after-expiry, Resepsionis allowed, audit row.
- [ ] **Step 2:** `npm run test:integration -- tests/integration/package-visit.test.ts` → FAIL.
- [ ] **Step 3:** Implement; dates via `witaDateString` and `addDaysToDateString`.
- [ ] **Step 4:** → PASS; rerun `package-goods`, `package-session`, `package-purchase` integration files → PASS.
- [ ] **Step 5:** Commit `feat: next visit date follows purchases, visits and cancellations`.

### Task 5: Reminder box "Sesi paket perlu dibooking"

**Files:** Modify `src/server/reminder.ts`, `src/components/admin/reminder-worklist.tsx`; Create `src/server/package-reminder.ts` ("use server": `recordPackageVisitReminder`), `src/components/admin/package-reminder-send-button.tsx`; Test `tests/integration/package-reminder.test.ts`, `tests/unit/components/reminder-worklist.test.tsx`

**Interfaces — Produces:** `type PackageReminderRow = { patientPackageId: string; patientName: string; packageName: string; visitOn: string; visitNumber: number; contents: string; message: WhatsAppMessage; overdue: boolean; shifted: boolean; sent: { sentAt: Date; sentByName: string } | null }`; `ReminderWorklist.packageVisits: PackageReminderRow[]`; `recordPackageVisitReminder(input: { patientPackageId: string; visitOn: string }): Promise<ActionResult<void>>` (`booking:manage`, idempotent on the unique key); `countReminderWork()` adds unsent package rows.

- [ ] **Step 1: Failing tests:** row appears when `reminderDay(nextVisitOn) ≤ today` with the exact message (Global Constraints copy, `besok`); none when the patient has a TERKONFIRMASI appointment from today on (Review Focus 2); none for DIBATALKAN/expired/empty packages; overdue flag when `nextVisitOn < today`; after `recordPackageVisitReminder` the row has `sent` and the count drops; after a usage invoice moves `nextVisitOn` the old send no longer applies (Review Focus 3); UI box title `4 · Sesi paket perlu dibooking`, button `Ingatkan via WA` (link + record), sent rows show `Sudah diingatkan · {jam} oleh {nama}`, overdue chip `terlewat`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; reuse `closedDatesBetween`, `reminderDay`, `buildWhatsAppLinkTo`; visit number from distinct FINAL invoices of `PAKAI` entries.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: H-1 reminders for package visits`.

### Task 6: "Pakai sesuai rencana" in the draft

**Files:** Modify `src/server/invoice-drafts.ts` (`applyPackageVisit`), `src/server/patient-package-read.ts` (`listPackageVisitPlans(patientId)`), `src/components/admin/billing/invoice-draft-editor.tsx`, `src/app/(admin)/admin/tagihan/[id]/page.tsx`; Test `tests/integration/package-visit-apply.test.ts`, `tests/unit/invoice-draft-editor.test.tsx`

**Interfaces — Produces:** `applyPackageVisit(input: { invoiceId: string; version: number; patientPackageId: string }): Promise<EditResult>` — in one transaction: for each planned treatment, mark a matching unmarked TREATMENT line or add a Rp 0 TREATMENT line linked to the item; for each planned goods, add a BARANG Rp 0 line of `min(perVisit, available)`; `listPackageVisitPlans(patientId): Promise<{ patientPackageId; packageName; visit: PlannedVisit }[]>` (owned AKTIF packages only).

- [ ] **Step 1: Failing tests:** draft from a visit with a Facial line → button marks it and adds 7 kapsul; direct sale → adds Facial Rp 0 + 7 kapsul; 3 kapsul left → takes 3 (Review Focus 4); no remaining → `Paket ini sudah habis.`; UI: info box line `Rencana kunjungan {n} ({tanggal}): Facial Brightening, 7 kapsul Slimming Capsule` and button `Pakai sesuai rencana {paket}`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement reusing `packageLink`/`takePackageItem` internals.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: one click adds the planned visit to the draft`.

### Task 7: Plan table, change-date dialog, A4 next visit

**Files:** Modify `src/server/patient-package-read.ts` (`getPatientPackage` adds `plan: PlannedVisit[]`, `visitsDone`, `nextVisitOn`), `src/app/(admin)/admin/paket/[id]/page.tsx`; Create `src/components/admin/package/change-visit-dialog.tsx`; Modify `src/server/invoice-a4-store.ts`, `src/lib/invoice-a4.ts` (`InvoiceA4Package.nextVisitOn: string | null`), `src/components/receipt/invoice-a4-paper.tsx`; Test `tests/unit/components/change-visit-dialog.test.tsx`, `tests/integration/invoice-a4.test.ts`, `tests/unit/components/invoice-a4-paper.test.tsx`

- [ ] **Step 1: Failing tests:** detail returns the plan; dialog `Ubah tanggal rencana` calls `changeNextVisit` and shows server errors; A4: newest invoice of the package has `nextVisitOn` (and the paper shows `Kunjungan berikutnya: {dateLabel}`), an older one has `null` (JP14).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; page section `Rencana kunjungan` table (Kunjungan, Tanggal, Isi), done visits listed from the ledger above with "selesai".
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: package plan table, date change and next visit on the invoice`.

### Task 8: Verification

- [ ] **Step 1:** `npx tsc --noEmit`, `npx eslint src tests --quiet`, `npx vitest run` (rerun load-flaky files alone if any time out).
- [ ] **Step 2:** Clean leftover E2E data if needed; `npm run test:integration` → only the known `schedule.test.ts` (3) may fail.
- [ ] **Step 3:** Extend `tests/e2e/paket.spec.ts`: after the goods package purchase, open the package page → `Rencana kunjungan` table; `Ubah tanggal rencana` to tomorrow → `/admin/pengingat` shows `4 · Sesi paket perlu dibooking` with the patient; `caffeinate -i npx playwright test tests/e2e/paket.spec.ts tests/e2e/struk.spec.ts tests/e2e/tagihan.spec.ts --workers=1` → pass.
