# Aturan Pakai Pilihan dan Pelaksana oleh Resepsionis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doctors and pharmacists pick the usage instruction (frequency + timing, or type their own), and treatment performers are chosen by reception on the invoice instead of by the doctor.

**Architecture:** A pure module `src/lib/usage.ts` turns a stored usage string into editable parts and back; the doctor's prescription form and the pharmacist's dispensing editor both edit those parts through one `UsageField` component, while everything downstream keeps reading the single `usage` string. The encounter treatment performer becomes nullable and leaves the doctor's form; invoice finalization refuses TREATMENT lines without a performer.

**Tech Stack:** Next.js 15 server actions, Prisma 7 + PostgreSQL, MUI, Vitest (unit + integration), Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-10-22-aturan-pakai-pelaksana-design.md`

## Global Constraints

- Frequencies, in this order: `1xSehari`, `1xSeminggu`, `1-2xSehari`, `2-3xSehari`, `3xSehari`, then `Lainnya` (type your own) (AP1).
- Timing default for a NEW row: `SEBELUM MAKAN`; editable, may be empty, stored as typed (AP2).
- Stored usage = `{frequency or typed text} {timing}` trimmed, single space, e.g. `3xSehari SEBELUM MAKAN`; empty timing → frequency only (AP4). No migration for usage.
- Reopen (AP5): a string that starts with one of the five frequencies followed by a space or end → that frequency + the rest as timing; anything else → `Lainnya` with the whole string, timing empty. Old text never changes unless re-saved.
- Messages (AP6): no frequency → `Pilih aturan pakai obat.`; `Lainnya` empty → `Isi aturan pakai obat.`; over 200 characters → existing length message.
- Doctor's treatment form has no Pelaksana (PL1); new encounter treatments store `performerId`/`performerName` = null (PL4).
- Finalize refuses any TREATMENT line without performer: `Pilih pelaksana untuk {line name}.` (PL3).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Doctor picks Lainnya and leaves it empty: the row is incomplete (autosave skips it, finalize says `Isi aturan pakai obat.`) — Task 2 test.
2. An old draft whose usage is `3 x 1 sesudah makan` reopens as Lainnya with that exact text, and saving it unchanged keeps the exact text — Task 2 test.
3. Pharmacist edits an existing dispensing line without touching usage: the saved usage equals the old text — Task 3 test.
4. A package session line (TREATMENT, Rp 0) without performer blocks finalization; after `setLinePerformer` it finalizes and carries the commission — Task 5 test.
5. A visit invoice made from an encounter whose treatment has no performer starts with an empty performer on the line — Task 4 test.

---

### Task 1: Usage parts

**Files:** Create `src/lib/usage.ts`; Test `tests/unit/usage.test.ts`

**Interfaces — Produces:**
- `USAGE_FREQUENCIES = ["1xSehari", "1xSeminggu", "1-2xSehari", "2-3xSehari", "3xSehari"] as const`; `type UsageFrequency`; `USAGE_OTHER = "LAINNYA"`; `USAGE_TIMING_DEFAULT = "SEBELUM MAKAN"`.
- `type UsageParts = { frequency: "" | UsageFrequency | typeof USAGE_OTHER; custom: string; timing: string }`.
- `newUsageParts(): UsageParts` (`{ frequency: "", custom: "", timing: "SEBELUM MAKAN" }`), `composeUsage(parts): string`, `parseUsage(usage: string): UsageParts`, `usageProblem(parts, max: number): string | null`, `isIncompleteUsage(parts): boolean` (no frequency, or Lainnya with blank text).

- [ ] **Step 1: Failing tests**
  - compose: `{3xSehari, "", "SEBELUM MAKAN"}` → `3xSehari SEBELUM MAKAN`; timing `"  "` → `3xSehari`; `{LAINNYA, " bila perlu ", "SESUDAH MAKAN"}` → `bila perlu SESUDAH MAKAN`.
  - parse: `3xSehari SEBELUM MAKAN` → `{3xSehari, "", "SEBELUM MAKAN"}`; `1xSeminggu` → `{1xSeminggu, "", ""}`; `1-2xSehari pagi` → `{1-2xSehari, "", "pagi"}`; `3 x 1 sesudah makan` → `{LAINNYA, "3 x 1 sesudah makan", ""}`; `1xSeharian` → Lainnya; round trip `composeUsage(parseUsage(s)) === s` for each.
  - `usageProblem`: no frequency → `Pilih aturan pakai obat.`; Lainnya `"  "` → `Isi aturan pakai obat.`; 201 characters → `Aturan pakai terlalu panjang (maks. 200 karakter).`; valid → null.
- [ ] **Step 2:** `npx vitest run tests/unit/usage.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: usage instruction parts`.

### Task 2: Doctor's prescription picks the usage

**Files:** Create `src/components/admin/usage-field.tsx`; Modify `src/lib/prescription.ts`, `src/lib/encounter.ts` (zod `prescriptions.usage`), `src/server/encounter-read.ts` (draft input builds `usage: parseUsage(p.usage)`), `src/components/admin/prescription-fields.tsx`; Test `tests/unit/prescription.test.ts`, `tests/unit/components/prescription-fields.test.tsx`, `tests/integration/encounter-prescription.test.ts`

**Interfaces:**
- Consumes Task 1.
- Produces `PrescriptionInput = { itemId: string; quantity: string; usage: UsageParts }` (wire format of `saveEncounterDraft`; zod `usage: z.object({ frequency, custom, timing }).strict()`); `parsePrescriptions` composes into `PrescriptionDraft.usage: string` and returns the AP6 messages (an unknown frequency counts as none); `isIncompletePrescription` uses `isIncompleteUsage`.
- Produces `UsageField({ value, onChange, name }: { value: UsageParts; onChange: (parts: UsageParts) => void; name?: string })`: a select **Aturan pakai** (the five frequencies + `Lainnya (ketik sendiri)`), a text field **Aturan pakai lain** shown only for Lainnya, a text field **Waktu**; with `name`, each accessible name gets ` {name}` appended (Task 3 uses it in table rows).

- [ ] **Step 1: Failing tests**
  - unit prescription: parts `{2-3xSehari, "", "SEBELUM MAKAN"}` → draft usage `2-3xSehari SEBELUM MAKAN`; no frequency → `Pilih aturan pakai obat.`; Lainnya empty → `Isi aturan pakai obat.` and `isIncompletePrescription` true (Review Focus 1).
  - component: "Tambah obat" adds a row whose Waktu shows `SEBELUM MAKAN` and Aturan pakai is empty; choosing `3xSehari` calls `onChange` with `frequency: "3xSehari"`; choosing Lainnya reveals **Aturan pakai lain**.
  - integration: saving a draft with `{3xSehari, "", "SEBELUM MAKAN"}` stores usage `3xSehari SEBELUM MAKAN`; a draft row stored as `3 x 1 sesudah makan` reads back as `{LAINNYA, "3 x 1 sesudah makan", ""}` and re-saving it keeps the exact text (Review Focus 2).
- [ ] **Step 2:** Run those three files → FAIL.
- [ ] **Step 3:** Implement; new rows start with `newUsageParts()`; keep the "Belum tersimpan — lengkapi obat, jumlah, dan aturan pakai." hint.
- [ ] **Step 4:** → PASS; also `tests/unit/encounter.test.ts`, `tests/unit/components/encounter-form.test.tsx` updated for the new row shape → PASS.
- [ ] **Step 5:** Commit `feat: doctors pick the usage instruction`.

### Task 3: Pharmacist's dispensing editor picks the usage

**Files:** Modify `src/components/admin/dispensing/dispensing-editor.tsx` (add form and `LineRow`); Test `tests/unit/dispensing-ui.test.tsx`

**Interfaces:** Consumes Task 1 and `UsageField` (Task 2). Server actions unchanged: they still receive `usage: string` = `composeUsage(parts)`. Before calling the server the editor shows `usageProblem(parts, 200)` through its existing error alert.

- [ ] **Step 1: Failing tests:** adding Amoxicillin ×10 with `2-3xSehari` and the default Waktu calls `addDispensingLine` with `usage: "2-3xSehari SEBELUM MAKAN"`; without a frequency the alert shows `Pilih aturan pakai obat.` and no call is made; an existing line with usage `3 x 1 sesudah makan` shows Lainnya with that text and **Simpan** sends it unchanged (Review Focus 3).
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implement; the add form resets to `newUsageParts()` after a successful add; `LineRow` starts from `parseUsage(line.usage)` and passes `name={line.itemName}`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: pharmacists pick the usage instruction`.

### Task 4: Doctor no longer picks the performer

**Files:** Modify `prisma/schema.prisma` (`EncounterTreatment.performerId String?`, `performerName String?`), Create `prisma/migrations/20261022180000_pelaksana_opsional/migration.sql` (`ALTER TABLE "EncounterTreatment" ALTER COLUMN "performerId" DROP NOT NULL, ALTER COLUMN "performerName" DROP NOT NULL;`); Modify `src/lib/encounter.ts` (`TreatmentInput` and zod without `performerId`; `EncounterOptions` without `performers`/`defaultPerformerId`; no "Pilih pelaksana treatment." check), `src/server/encounter.ts` (write null performer, drop the performer lookup), `src/server/encounter-read.ts` (options without performers; `performerName: string | null`), `src/components/admin/encounter-form.tsx` (no Pelaksana select), `src/components/admin/encounter-record.tsx` (Pelaksana column only when some treatment has one); Test `tests/unit/encounter.test.ts`, `tests/unit/components/encounter-form.test.tsx`, `tests/unit/components/encounter-record.test.tsx`, `tests/integration/encounter.test.ts`, `tests/integration/encounter-schema.test.ts`

**Interfaces:** Produces `EncounterTreatment.performerId: string | null`. `createInvoiceFromVisit` keeps copying the performer when present (old visits) — no change.

- [ ] **Step 1: Failing tests:** form shows no field labelled Pelaksana; a draft with a treatment and no performer saves and finalizes; stored treatment has `performerId` null; record of such a visit has no Pelaksana column while an old visit with a performer still shows it; `createInvoiceFromVisit` on that visit gives a TREATMENT line with `performerId` null (Review Focus 5); schema test inserts a treatment with null performer.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implement; apply the migration to the test DB (`npx prisma migrate deploy` with `DATABASE_URL=$TEST_DATABASE_URL`).
- [ ] **Step 4:** → PASS (the five test files).
- [ ] **Step 5:** Commit `feat: reception, not the doctor, picks who performs a treatment`.

### Task 5: Finalize needs a performer on every treatment

**Files:** Modify `src/server/invoice-lifecycle.ts` (`finalizeInvoice`: after the version check, the first TREATMENT line with `performerId === null` → `UserFacingError("Pilih pelaksana untuk {name}.")`; add `performerId` to the line select if missing), `tests/integration/invoice-world.ts` (helper `assignPerformers(world, invoiceId)` setting `world.therapistId` on every TREATMENT line without one, via `setLinePerformer`); Test `tests/integration/invoice-performer.test.ts`; fix every integration/unit test that now finalizes such lines.

**Interfaces:** Consumes Task 4 (null performers reach invoices).

- [ ] **Step 1: Failing tests:** a direct sale with `addServiceLine` (treatment) refuses `Pilih pelaksana untuk {service name}.`, finalizes after `setLinePerformer`; a package session line (Rp 0, from `applyPackageVisit`) without performer is refused, and after choosing one finalizes with the commission recorded (Review Focus 4); LAYANAN and BARANG lines never need one.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implement; run `npm run test:integration`, and for each newly failing test that finalizes a TREATMENT line without performer call `assignPerformers` before finalizing (do not weaken the guard).
- [ ] **Step 4:** `npm run test:integration` → only the known `schedule.test.ts` (3) fails; `npx vitest run` → pass (rerun load timeouts alone).
- [ ] **Step 5:** Commit `feat: an invoice cannot be finalized while a treatment has no performer`.

### Task 6: End-to-end and verification

**Files:** Modify `tests/e2e/resep-dokter.spec.ts` (choose `3xSehari` / Lainnya `1 x 1 pagi` instead of typing usage; expected texts become `3xSehari SEBELUM MAKAN` …), any E2E that finalizes a visit invoice whose treatment now has no performer (pick it with `Pelaksana {treatment}` first).

- [ ] **Step 1:** `npx tsc --noEmit`, `npx eslint src tests --quiet` → clean.
- [ ] **Step 2:** Clean E2E leftovers if needed, then `caffeinate -i npx playwright test tests/e2e/resep-dokter.spec.ts tests/e2e/kunjungan.spec.ts tests/e2e/harga-modal.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/paket.spec.ts --workers=1` → pass.
- [ ] **Step 3:** Reset the test DB for integration (`DATABASE_URL=$TEST_DATABASE_URL DATABASE_URL_UNPOOLED=$TEST_DATABASE_URL_UNPOOLED npx tsx tests/e2e/prepare-db.mts`), `npm run test:integration` → only `schedule.test.ts` (3).
- [ ] **Step 4:** Commit `test: usage choices and performer step in end-to-end flows`.
