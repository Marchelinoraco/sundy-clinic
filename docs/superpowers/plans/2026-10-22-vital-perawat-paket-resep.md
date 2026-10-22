# Angka Vital oleh Perawat dan Paket di Resep Dokter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nurses record vitals on the Tangani page and release the patient to the doctor with "Selesai ditangani"; doctors can add catalog packages to the prescription, which land on the invoice and can only be declined with a reason the doctor sees.

**Architecture:** Nurse vitals live in a per-appointment `NurseVitals` row (the doctor's `Encounter` does not exist yet); `openEncounter` refuses clinic visits of today until the nurse completed, then copies the vitals into the encounter. Doctor packages are `EncounterPackage` rows locked with the record; invoices from the visit get a PAKET line per package, and a decline is stored in `EncounterPackageDecline`, mirroring the dropped-prescription pattern.

**Tech Stack:** Next.js 15 server actions, Prisma 7 + PostgreSQL (raw-SQL triggers for the record lock), MUI, Vitest unit + integration, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-10-22-vital-perawat-paket-resep-design.md`

## Global Constraints

- Vital fields and limits are exactly the doctor's: reuse `VITAL_KEYS`, `parseVital`, `bloodPressureProblem`, `vitalInputValue` from `src/lib/encounter.ts` (VP1). No vital is required (VP2). Height defaults to `lastHeightCm` (VP2).
- Copy: section `Angka vital`; button `Selesai ditangani`; nurse page line `Ditangani {nama} · {HH.MM}`; doctor line `Diukur perawat {nama} · {HH.MM}`, plus ` · diubah dokter` when any encounter vital differs from the nurse's (VP6); worklist note `Menunggu perawat`; server refusal `Perawat belum selesai menangani pasien ini.` (VP4).
- Gate (VP4): applies only to `channel === "KLINIK"` visits whose WITA date of `startAt` is today or later and that have no encounter yet. Online visits, visits from earlier days, and already-opened visits are never gated (plan ruling: the nurse page only serves today's visits, so older ones could never be released).
- Package rows show name + contents (e.g. `4× Facial, 28 kapsul Slimming`) via `packageContentsLabel`, never a price (PR1). Max 10 per visit, same package once: `Paket yang sama hanya sekali per kunjungan.` (PR4).
- Decline (PR3): reason 2–200 characters (`Alasan 2–200 karakter.`); doctor sees `Tidak dibeli — {alasan}`; restorable while the invoice is a draft; generic remove refuses `Paket dari dokter dihapus lewat tombol Tidak dibeli dengan alasan.`
- Migrations only add. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. The doctor leaves the nurse's numbers as they are: no "diubah dokter"; changes one: the suffix appears on the page and on the final record — Task 3 test.
2. A clinic visit checked in yesterday and never opened is not blocked by the gate; today's is — Task 3 test.
3. An online consultation never waits for the nurse — Task 3 test.
4. Reception tries to decline a doctor package after using one of its sessions in the same draft: refused with `Lepas dulu sesi atau barang yang memakai paket ini.` — Task 5 test.
5. The visit invoice is cancelled and created again: a declined package stays out and its reason stays; an accepted one comes back — Task 5 test.

---

### Task 1: Nurse vitals data and actions

**Files:** Modify `prisma/schema.prisma` (`NurseVitals`: `appointmentId @unique`, the seven vital columns typed as on `Encounter`, `updatedById`, `updatedByName`, `updatedAt @updatedAt`, `completedAt?`, `completedById?`, `completedByName?`; `Appointment.nurseVitals NurseVitals?`); Create `prisma/migrations/20261023090000_vital_perawat/migration.sql`, `src/lib/nurse-vitals.ts`, `src/server/nurse-vitals.ts` ("use server"); Modify `src/server/nurse.ts`; Test `tests/unit/nurse-vitals.test.ts`, `tests/integration/nurse-vitals.test.ts`

**Interfaces — Produces:**
- `nurseGateApplies(visit: { channel: "KLINIK" | "ONLINE"; startAt: Date; hasEncounter: boolean }, today: string): boolean` and `nurseVitalsLabel(input: { byName: string; at: Date; changedByDoctor: boolean }): string` in `src/lib/nurse-vitals.ts`.
- `saveNurseVitals(input: { appointmentId: string; version: string | null; vitals: Record<VitalKey, string> }): Promise<ActionResult<{ version: string; savedAt: string }>>` and `completeNurseVisit(input: { appointmentId: string }): Promise<ActionResult<void>>` (both `nurse:work`, visit must pass `nurseCanWork`; after completion saving refuses `Pasien ini sudah selesai ditangani.`; stale version refuses `Angka vital baru saja diubah. Muat ulang halaman.`; completion is audited `nurse-visit.complete`).
- `NurseVisit.vitals: { inputs: Record<VitalKey, string>; version: string | null; completed: { byName: string; at: Date } | null }`; `NurseWorklistRow.handled: boolean`.

- [ ] **Step 1: Failing tests** — unit: gate true for KLINIK today without encounter; false for ONLINE, yesterday, or with encounter; label `Diukur perawat Rina · 09.15` and with ` · diubah dokter`. Integration: first save creates the row with height prefilled from the last visit when blank; a second save with the returned version updates; an old version refuses; invalid value (systolic `400`) refuses with the doctor's message; complete stores name and time and then save refuses; a Resepsionis gets `forbidden`; `getNurseVisit` returns inputs and `completed`.
- [ ] **Step 2:** `npx vitest run tests/unit/nurse-vitals.test.ts` and `npm run test:integration -- tests/integration/nurse-vitals.test.ts` → FAIL.
- [ ] **Step 3:** Implement; migrate the test DB (`DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`).
- [ ] **Step 4:** → PASS; `tests/integration/nurse.test.ts` (or the existing nurse worklist test) → PASS.
- [ ] **Step 5:** Commit `feat: nurses record vitals before the doctor`.

### Task 2: Angka vital on the Tangani page

**Files:** Create `src/components/admin/nurse/nurse-vitals-card.tsx`; Modify `src/components/admin/nurse/nurse-visit.tsx` (card above Food recall), `src/components/admin/nurse/nurse-worklist.tsx` (status `Selesai ditangani` / `Belum ditangani`); Test `tests/unit/components/nurse-vitals-card.test.tsx`, update the nurse worklist/visit component tests

**Interfaces:** Consumes Task 1. Autosaves through `useDraftAutosave` like the encounter form; fields use the doctor's labels (`Sistolik (mmHg)` …); `Selesai ditangani` asks for confirmation (`Selesaikan penanganan?`, body `Angka vital tidak bisa diubah lagi di halaman ini.`) and then shows `Ditangani {nama} · {HH.MM}` with read-only values.

- [ ] **Step 1: Failing tests:** typing a value calls `saveNurseVitals` with the version; the prefilled height shows; confirm calls `completeNurseVisit`; a completed visit renders read-only values and the `Ditangani …` line and no button; worklist row shows the status.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: Angka vital and Selesai ditangani on the nurse page`.

### Task 3: Doctor waits for the nurse and sees the nurse's numbers

**Files:** Modify `src/server/encounter.ts` (`openEncounter`: gate + copy vitals), `src/server/encounter-read.ts` (`WorklistRow.waitingNurse`, `EncounterDetail.nurseVitals: { byName: string; at: Date; changedByDoctor: boolean } | null`), `src/components/admin/doctor-worklist.tsx` (disabled Periksa + `Menunggu perawat`), `src/components/admin/encounter-form.tsx` and `src/components/admin/encounter-record.tsx` (label under the O heading); Test `tests/integration/encounter.test.ts` (or new `tests/integration/encounter-nurse.test.ts`), `tests/unit/components/doctor-worklist.test.tsx`, `tests/unit/components/encounter-form.test.tsx`, `tests/unit/components/encounter-record.test.tsx`

**Interfaces:** Consumes Task 1 (`nurseGateApplies`, `nurseVitalsLabel`, `NurseVitals`).

- [ ] **Step 1: Failing tests:** opening today's clinic visit before completion refuses `Perawat belum selesai menangani pasien ini.`; after completion the encounter carries the nurse's seven values; yesterday's unopened clinic visit opens without a nurse row; an online visit opens without a nurse row (Review Focus 2, 3); detail `nurseVitals.changedByDoctor` false until the doctor saves a different weight, then true (Review Focus 1); worklist row `waitingNurse` true/false; UI shows the disabled button and `Menunggu perawat`, and the O label.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement. **Step 4:** → PASS, plus the existing encounter integration and component files.
- [ ] **Step 5:** Commit `feat: doctors examine after the nurse and see who measured`.

### Task 4: Doctor adds packages to the prescription

**Files:** Modify `prisma/schema.prisma` (`EncounterPackage`: `encounterId` Cascade, `packageId` → `TreatmentPackage` Restrict, `packageName`, `contents`, `sortOrder`, `@@unique([encounterId, packageId])`), Create `prisma/migrations/20261023100000_paket_resep/migration.sql` (table + lock trigger raising `rekam_medis_terkunci: paket kunjungan % sudah final` for INSERT/UPDATE/DELETE when the encounter is FINAL, mirroring the prescription trigger); Modify `src/lib/encounter.ts` (`EncounterDraftInput.packages: { packageId: string }[]`, zod, `parseEncounterDraft` rules from Global Constraints, `EncounterOptions.packages: { id: string; name: string; contents: string }[]`), `src/server/encounter.ts` (resolve names/contents from the catalog, rewrite rows with the draft), `src/server/encounter-read.ts` (options: active packages plus ones in the draft; draft input; `EncounterDetail.packages: { id: string; name: string; contents: string; declined: string | null }[]`, `declined` stays null until Task 5), Create `src/components/admin/package-fields.tsx`, Modify `src/components/admin/encounter-form.tsx` (inside the Resep section, after the medicines), `src/components/admin/encounter-record.tsx` (list under Resep); Test `tests/unit/encounter.test.ts`, `tests/unit/components/package-fields.test.tsx`, `tests/integration/encounter-package.test.ts`

**Interfaces — Produces:** `EncounterPackage` rows; `PackageFields({ rows, options, onChange }: { rows: { packageId: string }[]; options: EncounterOptions["packages"]; onChange: (rows: { packageId: string }[]) => void })` — button `Tambah paket`, rows `Paket {n}` with select `Paket`, contents text, button `Hapus paket {n}`, no prices.

- [ ] **Step 1: Failing tests:** parse rejects a duplicate and an 11th package; save stores name and contents copied from the catalog; final locks the rows (insert/update/delete throw `rekam_medis_terkunci`); options exclude inactive packages unless already in the draft; component adds/removes rows and shows contents without `Rp`; record lists the packages.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement; migrate the test DB. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: doctors add packages to the prescription`.

### Task 5: Doctor packages on the invoice, declined only with a reason

**Files:** Modify `prisma/schema.prisma` (`EncounterPackageDecline`: `encounterPackageId @unique` Cascade, `reason`, `staffId`, `staffName`, `createdAt`; `InvoiceLine.encounterPackageId String?` → `EncounterPackage` SetNull), Create `prisma/migrations/20261023110000_paket_resep_tagihan/migration.sql`; Modify `src/server/invoice-drafts.ts` (`createInvoiceFromVisit` adds one PAKET line per non-declined encounter package at the current catalog price; `declineDoctorPackage(input: { invoiceId: string; version: number; lineId: string; reason: string }): Promise<EditResult>`; `restoreDoctorPackage(input: { invoiceId: string; version: number; encounterPackageId: string }): Promise<EditResult>`; `removeInvoiceLine` refusal), `src/server/invoice-read.ts` (`InvoiceLineRow.fromDoctorPackage: boolean`, `InvoiceDetail.declinedPackages: { encounterPackageId: string; name: string; reason: string }[]`), `src/server/encounter-read.ts` (`declined` label), Create `src/components/admin/billing/decline-package-dialog.tsx`, Modify `src/components/admin/billing/invoice-draft-editor.tsx` (button `Tidak dibeli` on such lines; section `Paket dari dokter yang tidak dibeli` with `Kembalikan {name}`); Test `tests/integration/invoice-doctor-package.test.ts`, `tests/unit/components/decline-package-dialog.test.tsx`, `tests/unit/invoice-draft-editor.test.tsx`

**Interfaces:** Consumes Task 4. Decline refuses while a draft line uses that purchase line (`packageSourceLineId`): `Lepas dulu sesi atau barang yang memakai paket ini.`; audits `invoice.update` with `Paket {nama} tidak dibeli: {alasan}`.

- [ ] **Step 1: Failing tests:** invoice from a visit with two doctor packages has two PAKET lines at catalog price; generic remove refuses; decline with `x` refuses `Alasan 2–200 karakter.`; decline with a reason removes the line and the doctor's detail shows `Tidak dibeli — Pasien pikir-pikir dulu`; restore brings it back and clears the label; decline after `applyPackageSession` on that purchase line refuses (Review Focus 4); cancel + re-create keeps the declined one out and brings the accepted one back (Review Focus 5); dialog validates and calls the action; editor shows the button and the section.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement; migrate the test DB. **Step 4:** → PASS; `npm run test:integration` → only the known `schedule.test.ts` (3); `npx vitest run` → pass (rerun load timeouts alone).
- [ ] **Step 5:** Commit `feat: doctor packages land on the invoice and are declined with a reason`.

### Task 6: End-to-end and verification

**Files:** Modify `tests/e2e/prepare-db.mts` (completed `NurseVitals` for today's seeded clinic visits that a doctor opens: KUNJ, ISIAN, RESEP, NOTIF, PERAWAT is left open for the nurse spec), `tests/e2e/perawat.spec.ts` (fill Berat badan, `Selesai ditangani`, see `Ditangani …`), `tests/e2e/kunjungan.spec.ts` (O label `Diukur perawat …`), `tests/e2e/resep-dokter.spec.ts` (doctor adds a package; reception declines it with a reason; doctor sees `Tidak dibeli — …`).

- [ ] **Step 1:** `npx tsc --noEmit`, `npx eslint src tests --quiet` → clean.
- [ ] **Step 2:** `caffeinate -i npx playwright test tests/e2e/perawat.spec.ts tests/e2e/kunjungan.spec.ts tests/e2e/resep-dokter.spec.ts tests/e2e/hasil-bia.spec.ts tests/e2e/pemberitahuan.spec.ts tests/e2e/tagihan.spec.ts --workers=1` → pass.
- [ ] **Step 3:** Reset the test DB (`DATABASE_URL=$TEST_DATABASE_URL DATABASE_URL_UNPOOLED=$TEST_DATABASE_URL_UNPOOLED npx tsx tests/e2e/prepare-db.mts`), `npm run test:integration` → only `schedule.test.ts` (3).
- [ ] **Step 4:** Commit `test: nurse vitals and doctor packages in end-to-end flows`.
