# Plan — UI Panel Admin Bagian B: Ruang Kerja Dokter di Halaman Kunjungan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman kunjungan menjadi ruang kerja dua kolom. Kiri: konteks (peringatan + tab Isian kuis / Sebelumnya / Tren) yang tetap di tempat. Kanan: catatan S-O-A-P, dengan bar aksi di bawah yang selalu terlihat. Persetujuan isian dilakukan di halaman itu juga.

**Architecture:**
- **Server:** `getEncounterForStaff` menambah `vitals`, `history` (hingga 12 kunjungan final sebelumnya), `hasMoreHistory`, `approval`, dan kepala isian (`kind`, `purposeLabel`, `submittedAt`). `loadApproval` dipindah ke `src/server/intake-clinical.ts` (bukan `"use server"`) agar dipakai halaman isian dan halaman kunjungan.
- **Aturan tren** berupa fungsi murni di `src/lib/encounter.ts`: `vitalsTrend`, `weightChangeNote`, `parseVitalValues`, `formatSignedDecimal`, `initialContextTab`.
- **Klien:** komponen `EncounterWorkspace` memegang angka vital formulir, sehingga baris "Kunjungan ini" di tab Tren ikut berubah saat dokter mengetik. `EncounterForm` tetap memegang simpan otomatis, lalu bar aksinya dijadikan `sticky bottom-0`.
- **Tanpa migrasi, tanpa dependensi baru.**

**Tech Stack:** Next.js 15.5 App Router · React 19 · Prisma 7.10 · Tailwind v4 · shadcn/ui (Radix) · Vitest 4 + Testing Library + user-event · Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-ui-alur-dokter-design.md` (keputusan U1–U7, bagian 3–9). Aturan simpan otomatis, finalisasi, penguncian, dan akses tetap mengikuti `docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md`.

**Base branch:** `desain-ui-alur-dokter` (berisi spec dan plan ini). Kerjakan di branch baru `ui-alur-dokter` dari branch itu.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar. Panel admin memakai kata "pasien".
- **Zona waktu:** WITA. Tanggal ditulis dengan `src/lib/format.ts` (`formatShortIndonesianDate` → "Rab, 23 Sep").
- **Hak akses tidak berubah:** halaman kunjungan hanya untuk `record:read`, dan `approval` hanya diisi untuk `record:write`. Aturan dijaga di server.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (tipe boleh, termasuk `export type { … } from`). Modul pembantu yang tidak boleh dipanggil browser (`intake-clinical.ts`) **tidak** memakai `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`, dan komponen tidak mengimpor `@/lib/db`.
- **Format kode:** repo tidak memakai Prettier. Ikuti format kode di sekitarnya.
- **Jangan beri `key` berdasarkan versi** pada `EncounterWorkspace` atau `EncounterForm`. `router.refresh()`, misalnya setelah persetujuan isian, tidak boleh me-*remount* formulir yang sedang diketik.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`). Jangan jalankan bersamaan dengan `npm run test:e2e`.
- **Commit** memakai Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. **Jangan pernah men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Dokter menyetujui isian dari tab Isian saat ada ketikan yang belum tersimpan.** `router.refresh()` tidak boleh menghapus isi formulir, dan draf tidak boleh di-*remount* → uji di Task 5 (render ulang dengan versi baru tetap mempertahankan ketikan).
2. **Berat diketik setengah atau salah** ("7", "72,55"). Baris "Kunjungan ini" di Tren menampilkan "—" dan tidak ada catatan selisih, tanpa `NaN` → uji di Task 2 (`parseVitalValues`) dan Task 4 (tab Tren).
3. **Kunjungan final dibuka belakangan, atau pasien sudah punya kunjungan yang lebih baru.** Tab Sebelumnya hanya memuat kunjungan yang lebih awal dari kunjungan ini → uji di Task 1.
4. **Kunjungan lama tanpa angka yang ditampilkan** (hanya nadi), dan **pasien yang baru ditimbang sekali.** Baris seperti itu dilewati, dan tidak ada ringkasan total → uji di Task 2.
5. **Kolom kiri sangat panjang** (12 kunjungan, isian panjang). Kolom kiri menggulir sendiri, dan di desktop tombol Finalisasi tetap terlihat tanpa menggulir → uji di Task 6 (e2e `toBeInViewport`).

---

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `src/server/intake-clinical.ts` | + `IntakeApproval`, `ReadyIntakeApproval`, `loadApproval` (dipindah dari `intake.ts`) |
| `src/server/intake.ts` | memakai `loadApproval` dari `intake-clinical`, dan mengekspor ulang tipe `IntakeApproval` |
| `src/server/encounter-read.ts` | `EncounterDetail` + `vitals`, `history`, `hasMoreHistory`, `approval`; kepala isian; audit `patient.view-records` |
| `src/lib/encounter.ts` | + `parseVitalValues`, `TrendSource`, `vitalsTrend`, `weightChangeNote`, `formatSignedDecimal`, `initialContextTab` |
| `src/components/admin/intake-clinical-content.tsx` | mode `compact` (hanya jam berisi + tombol tampilkan semua); menjadi komponen klien |
| `src/components/admin/encounter-intake-tab.tsx` (baru) | tab Isian kuis, menggantikan `encounter-intake-content.tsx` (dihapus) |
| `src/components/admin/previous-visits-tab.tsx` (baru) | tab Sebelumnya |
| `src/components/admin/vitals-trend-tab.tsx` (baru) | tab Tren |
| `src/components/admin/encounter-context-panel.tsx` (baru) | peringatan + daftar tab |
| `src/components/admin/encounter-workspace.tsx` (baru) | grid dua kolom, angka vital bersama, adendum, bar final, jejak |
| `src/components/admin/encounter-form.tsx` | tanpa `intakeSlot`; `weightHistory`, `onVitalsChange`; bar aksi `sticky` |
| `src/components/admin/encounter-record.tsx` | tanpa `intakeSlot` dan tanpa baris "Difinalisasi oleh" (pindah ke bar) |
| `src/components/admin/encounter-page-view.tsx` | kepala satu baris + `EncounterWorkspace` |
| `tests/fixtures/encounter-detail.ts` (baru) | pembuat `EncounterDetail` dan riwayat untuk uji komponen |
| `tests/e2e/prepare-db.mts`, `tests/e2e/kunjungan.spec.ts` | fixture pasien berisian, dan uji persetujuan dari tab Isian |

---

### Task 1: Data halaman kunjungan — riwayat, persetujuan, kepala isian

**Files:**
- Modify: `src/server/intake-clinical.ts`, `src/server/intake.ts`, `src/server/encounter-read.ts`
- Test: `tests/integration/encounter-read.test.ts`

**Interfaces:**
- Produces (`@/server/intake-clinical`):
  - `type IntakeApproval`, `type ReadyIntakeApproval = Extract<IntakeApproval, { state: "ready" }>`
  - `loadApproval(patientId: string, proposed: RecordProposal, reviewed: boolean): Promise<ReadyIntakeApproval>`
- Produces (`@/server/encounter-read`):
  - `type EncounterTreatmentSummary = { serviceName: string; area: string | null; dose: string | null; performerName: string; notes: string | null }`
  - `type EncounterAddendumSummary = { id: string; text: string; authorName: string; createdAt: Date }`
  - `type EncounterHistoryItem = { id: string; startAt: Date; branchName: string; authorName: string; subjective: string | null; physicalExam: string | null; assessment: string | null; plan: string | null; vitals: Record<VitalKey, number | null>; vitalLines: string[]; assessmentPreview: string | null; treatments: EncounterTreatmentSummary[]; addenda: EncounterAddendumSummary[] }`
  - `EncounterIntake` varian `"ready"` bertambah `kind: "LENGKAP" | "PENDEK"`, `purposeLabel: string | null`, `submittedAt: Date | null`
  - `EncounterDetail` bertambah `vitals: Record<VitalKey, number | null>`, `history: EncounterHistoryItem[]`, `hasMoreHistory: boolean`, `approval: ReadyIntakeApproval | null`

- [ ] **Step 1: Tulis uji yang gagal**

Di `tests/integration/encounter-read.test.ts`:

1. Tambahkan impor `addEncounterAddendum` ke baris impor `@/server/encounter`, dan `type EncounterDraftInput` ke impor `@/lib/encounter`.
2. Tambahkan konstanta sesudah `const PATIENT_WA = "6281200007720";`:

```ts
const HISTORY_WA = "6281200007721";
const ROUTINE_WA = "6281200007722";
```

3. Ganti kedua panggilan `cleanupBookingWorld(SLUG, [PATIENT_WA])` menjadi `cleanupBookingWorld(SLUG, [PATIENT_WA, HISTORY_WA, ROUTINE_WA])`.
4. Ubah tanda tangan pembantu `booking` agar bisa memilih pasien:

```ts
  async function booking(day: string, time: string, status: "HADIR" | "TERKONFIRMASI" = "HADIR", patient = patientId) {
```

   Di dalamnya, ganti `patientId,` pada `data` menjadi `patientId: patient,`.
5. Tambahkan pembantu sesudah `finalized`:

```ts
  async function finalizedWith(
    appointment: { id: string },
    patch: { assessment: string; plan?: string; vitals?: Partial<EncounterDraftInput["vitals"]> },
  ) {
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    const base = emptyDraftInput();
    await unwrap(
      finalizeEncounter({
        encounterId,
        version: updatedAt.toISOString(),
        draft: { ...base, assessment: patch.assessment, plan: patch.plan ?? "", vitals: { ...base.vitals, ...patch.vitals } },
      }),
    );
    return encounterId;
  }
```

6. Tambahkan uji di akhir `describe`:

```ts
  it("riwayat: hanya kunjungan final pasien yang sama sebelum kunjungan ini, terbaru di atas", async () => {
    actAs("DOKTER");
    const other = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7721", name: "Pasien Riwayat", whatsapp: HISTORY_WA } })
    ).id;
    const oldest = await finalizedWith(await booking(addDaysToDateString(today, -20), "09:00", "HADIR", other), {
      assessment: "Konsultasi awal",
      vitals: { weightKg: "75" },
    });
    const previous = await finalizedWith(await booking(addDaysToDateString(today, -13), "09:00", "HADIR", other), {
      assessment: "Obesitas derajat 1",
      plan: "Program MAX",
      vitals: { weightKg: "73,3", heightCm: "158", systolic: "130", diastolic: "85" },
    });
    await unwrap(addEncounterAddendum({ encounterId: previous, text: "Tensi diukur ulang 125/80." }));
    const otherDraft = await booking(addDaysToDateString(today, -6), "09:00", "HADIR", other);
    await unwrap(openEncounter(otherDraft.id));
    await finalizedWith(await booking(addDaysToDateString(today, 9), "09:00", "HADIR", other), { assessment: "Kunjungan nanti" });

    const current = await booking(addDaysToDateString(today, 2), "09:00", "HADIR", other);
    const { encounterId } = await unwrap(openEncounter(current.id));
    const detail = (await getEncounterForStaff(encounterId))!;

    expect(detail.history.map((visit) => visit.id)).toEqual([previous, oldest]);
    expect(detail.hasMoreHistory).toBe(false);
    expect(detail.history[0]).toMatchObject({
      assessment: "Obesitas derajat 1",
      plan: "Program MAX",
      branchName: "Cabang Publik Uji",
      authorName: "DOKTER Uji",
      assessmentPreview: "Obesitas derajat 1",
    });
    expect(detail.history[0].vitals).toMatchObject({ weightKg: 73.3, heightCm: 158, systolic: 130, diastolic: 85, pulse: null });
    expect(detail.history[0].vitalLines).toContain("IMT 29,4");
    expect(detail.history[0].addenda).toEqual([expect.objectContaining({ text: "Tensi diukur ulang 125/80." })]);
    // Tinggi diisikan dari kunjungan final terakhir yang punya tinggi (Task 3 plan kunjungan).
    expect(detail.vitals.heightCm).toBe(158);
  });

  it("riwayat maksimal 12 kunjungan, dengan penanda ada yang lebih lama", async () => {
    actAs("DOKTER");
    const routine = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7722", name: "Pasien Rutin", whatsapp: ROUTINE_WA } })
    ).id;
    for (let week = 13; week >= 1; week -= 1) {
      await finalizedWith(await booking(addDaysToDateString(today, -7 * week - 30), "08:00", "HADIR", routine), {
        assessment: `Kontrol minggu ${14 - week}`,
      });
    }
    const current = await booking(addDaysToDateString(today, 5), "08:00", "HADIR", routine);
    const { encounterId } = await unwrap(openEncounter(current.id));
    const detail = (await getEncounterForStaff(encounterId))!;

    expect(detail.history).toHaveLength(12);
    expect(detail.hasMoreHistory).toBe(true);
    expect(detail.history[0].assessment).toBe("Kontrol minggu 13");
  });

  it("persetujuan isian tersedia di halaman kunjungan untuk penulis rekam medis bila isian sudah terisi", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 6), "11:00");
    await prisma.intake.create({
      data: {
        appointmentId: appointment.id,
        patientId,
        kind: "LENGKAP",
        purpose: "SLIMMING",
        status: "TERISI",
        quizVersion: 2,
        answers: slimmingNewPatient,
        submittedAt: new Date(),
      },
    });
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const detail = (await getEncounterForStaff(encounterId))!;

    expect(detail.approval).toMatchObject({ state: "ready", patientId, current: { allergies: "Udang" } });
    expect(detail.approval!.prefill.allergies).toContain("Amoxicillin");
    expect(detail.intake).toMatchObject({ state: "ready", kind: "LENGKAP", purposeLabel: "Slimming" });

    const bare = await booking(addDaysToDateString(today, 6), "12:00");
    const { encounterId: bareId } = await unwrap(openEncounter(bare.id));
    expect((await getEncounterForStaff(bareId))!.approval).toBeNull();
  });

  it("membuka kunjungan juga mencatat pembukaan rekam medis pasien, paling banyak sekali per 30 menit", async () => {
    actAs("DOKTER");
    const appointment = await booking(addDaysToDateString(today, 6), "13:00");
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    await prisma.auditLog.deleteMany({ where: { action: "patient.view-records", entityId: patientId } });

    await getEncounterForStaff(encounterId);
    await getEncounterForStaff(encounterId);
    expect(await prisma.auditLog.count({ where: { action: "patient.view-records", entityId: patientId } })).toBe(1);
  });
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/encounter-read.test.ts`
Expected: FAIL. `history`, `approval`, dan `kind` masih `undefined`, dan audit `patient.view-records` belum tercatat.

- [ ] **Step 3: Pindahkan persetujuan ke `src/server/intake-clinical.ts`**

Tambahkan impor `import { mergeRecordText } from "@/lib/record-text";`. Lalu tambahkan di akhir berkas (tipe dan isi fungsi dipindah apa adanya dari `intake.ts`):

```ts
export type IntakeApproval =
  | { state: "needs-match" }
  | {
      state: "ready";
      patientId: string;
      /** updatedAt pasien (ISO) saat halaman dibuka; simpan ditolak bila data pasien berubah sesudahnya. */
      patientVersion: string;
      current: { allergies: string | null; medicalHistory: string | null };
      proposed: RecordProposal;
      /** Isi awal kolom sunting. */
      prefill: { allergies: string; medicalHistory: string };
    };

export type ReadyIntakeApproval = Extract<IntakeApproval, { state: "ready" }>;

/**
 * Usulan berdampingan dengan catatan pasien saat ini (spec pendaftaran 6.4).
 * Isian yang sudah diperiksa tidak menggabungkan usulan lagi: baris yang
 * sengaja dihapus dokter tidak boleh muncul kembali. Dipakai halaman isian
 * dan halaman kunjungan; pemanggil wajib sudah memeriksa record:write.
 */
export async function loadApproval(patientId: string, proposed: RecordProposal, reviewed: boolean): Promise<ReadyIntakeApproval> {
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { allergies: true, medicalHistory: true, updatedAt: true },
  });
  return {
    state: "ready",
    patientId,
    patientVersion: patient.updatedAt.toISOString(),
    current: { allergies: patient.allergies, medicalHistory: patient.medicalHistory },
    proposed,
    prefill: reviewed
      ? { allergies: patient.allergies ?? "", medicalHistory: patient.medicalHistory ?? "" }
      : {
          allergies: mergeRecordText(patient.allergies, proposed.allergies),
          medicalHistory: mergeRecordText(patient.medicalHistory, proposed.medicalHistory),
        },
  };
}
```

Di `src/server/intake.ts`:
- hapus blok `export type IntakeApproval = …` dan fungsi `loadApproval` beserta komentarnya;
- ganti impor `intake-clinical` menjadi `import { loadApproval, loadIntakeClinical, type IntakeApproval, type IntakeClinical } from "@/server/intake-clinical";`;
- tambahkan `export type { IntakeApproval } from "@/server/intake-clinical";` di bawah impor, agar `intake-approval-form.tsx` tetap mengimpor dari `@/server/intake`;
- hapus impor `mergeRecordText`, dan `RecordProposal` bila tidak dipakai lagi. `npx tsc --noEmit` dan lint akan menunjukkannya.

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/intake-approval.test.ts tests/integration/intake-access.test.ts`
Expected: PASS. Perilaku halaman isian tidak berubah.

- [ ] **Step 4: Tambahkan riwayat, persetujuan, kepala isian, dan audit ke `src/server/encounter-read.ts`**

Ubah impor:

```ts
import type { IntakeKind, IntakePurpose, IntakeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  VITAL_KEYS,
  ageInYears,
  assessmentPreview,
  describeVitals,
  vitalInputValue,
  type EncounterDraftInput,
  type EncounterOptions,
  type VitalKey,
} from "@/lib/encounter";
import { formatGender } from "@/lib/format";
import { INTAKE_PURPOSE_LABEL } from "@/lib/intake-purpose";
import type { RecordProposal } from "@/lib/kuis/v2/record-proposal";
import { can } from "@/lib/permissions";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { listAuditTrail, recordAuditThrottled, type AuditTrailRow } from "@/server/audit";
import { loadApproval, loadIntakeClinical, type IntakeClinical, type ReadyIntakeApproval } from "@/server/intake-clinical";
import { requireCapability } from "@/server/session";
```

Ganti tipe `EncounterIntake` dan tambahkan tipe riwayat:

```ts
export type EncounterIntake =
  | { id: string; state: "pending" }
  | { id: string; state: "error"; message: string }
  | {
      id: string;
      state: "ready";
      clinical: IntakeClinical;
      needsApproval: boolean;
      kind: "LENGKAP" | "PENDEK";
      purposeLabel: string | null;
      submittedAt: Date | null;
    };

export type EncounterTreatmentSummary = {
  serviceName: string;
  area: string | null;
  dose: string | null;
  performerName: string;
  notes: string | null;
};

export type EncounterAddendumSummary = { id: string; text: string; authorName: string; createdAt: Date };

/** Kunjungan final sebelumnya, untuk tab Sebelumnya dan Tren (spec UI B bagian 4–5). */
export type EncounterHistoryItem = {
  id: string;
  startAt: Date;
  branchName: string;
  authorName: string;
  subjective: string | null;
  physicalExam: string | null;
  assessment: string | null;
  plan: string | null;
  vitals: Record<VitalKey, number | null>;
  vitalLines: string[];
  assessmentPreview: string | null;
  treatments: EncounterTreatmentSummary[];
  addenda: EncounterAddendumSummary[];
};
```

Pada `EncounterDetail`:
- ganti baris `treatments: {…}[];` menjadi `treatments: EncounterTreatmentSummary[];`;
- ganti `addenda: {…}[];` menjadi `addenda: EncounterAddendumSummary[];`;
- tambahkan sesudah `vitalLines: string[];`:

```ts
  /** Angka vital tersimpan kunjungan ini (baris "Kunjungan ini" di Tren sebelum dokter mengetik). */
  vitals: Record<VitalKey, number | null>;
```

- tambahkan sesudah `trail: AuditTrailRow[] | null;`:

```ts
  /** Kunjungan final pasien ini yang lebih awal dari kunjungan ini, terbaru di atas, maks. 12. */
  history: EncounterHistoryItem[];
  hasMoreHistory: boolean;
  /** Persetujuan isian ke data pasien; hanya untuk record:write bila isian sudah terisi. */
  approval: ReadyIntakeApproval | null;
```

Tambahkan di bawah konstanta `UNKNOWN_QUIZ_VERSION`:

```ts
const HISTORY_LIMIT = 12;

const VITAL_SELECT = {
  systolic: true,
  diastolic: true,
  pulse: true,
  temperatureC: true,
  weightKg: true,
  heightCm: true,
  waistCm: true,
} as const;

const TREATMENT_SELECT = {
  orderBy: { sortOrder: "asc" as const },
  select: { serviceId: true, serviceName: true, area: true, dose: true, performerId: true, performerName: true, notes: true },
};

const ADDENDUM_SELECT = {
  orderBy: { createdAt: "asc" as const },
  select: { id: true, text: true, authorName: true, createdAt: true },
};

function vitalsOf(row: Record<VitalKey, number | Prisma.Decimal | null>): Record<VitalKey, number | null> {
  const values = {} as Record<VitalKey, number | null>;
  for (const key of VITAL_KEYS) values[key] = row[key] === null ? null : Number(row[key]);
  return values;
}

function findHistory(patientId: string, before: Date, excludeId: string) {
  return prisma.encounter.findMany({
    where: { status: "FINAL", id: { not: excludeId }, appointment: { patientId, startAt: { lt: before } } },
    orderBy: { appointment: { startAt: "desc" } },
    take: HISTORY_LIMIT + 1,
    select: {
      id: true,
      subjective: true,
      physicalExam: true,
      assessment: true,
      plan: true,
      ...VITAL_SELECT,
      createdByName: true,
      finalizedByName: true,
      treatments: TREATMENT_SELECT,
      addenda: ADDENDUM_SELECT,
      appointment: { select: { startAt: true, branch: { select: { name: true } } } },
    },
  });
}

function toHistoryItem(row: Awaited<ReturnType<typeof findHistory>>[number]): EncounterHistoryItem {
  const vitals = vitalsOf(row);
  return {
    id: row.id,
    startAt: row.appointment.startAt,
    branchName: row.appointment.branch.name,
    authorName: row.finalizedByName ?? row.createdByName,
    subjective: row.subjective,
    physicalExam: row.physicalExam,
    assessment: row.assessment,
    plan: row.plan,
    vitals,
    vitalLines: describeVitals(vitals),
    assessmentPreview: assessmentPreview(row.assessment),
    treatments: row.treatments.map(toTreatmentSummary),
    addenda: row.addenda,
  };
}

function toTreatmentSummary(row: {
  serviceName: string;
  area: string | null;
  dose: string | null;
  performerName: string;
  notes: string | null;
}): EncounterTreatmentSummary {
  return { serviceName: row.serviceName, area: row.area, dose: row.dose, performerName: row.performerName, notes: row.notes };
}
```

Ganti `loadEncounterIntake` agar membawa kepala isian dan usulan:

```ts
async function loadEncounterIntake(
  intake: { id: string; status: IntakeStatus; kind: IntakeKind; purpose: IntakePurpose | null; submittedAt: Date | null } | null,
): Promise<{ intake: EncounterIntake | null; pregnancy: boolean; proposal: RecordProposal | null }> {
  if (!intake) return { intake: null, pregnancy: false, proposal: null };
  if (intake.status === "MENUNGGU_DIISI") return { intake: { id: intake.id, state: "pending" }, pregnancy: false, proposal: null };
  try {
    const loaded = await loadIntakeClinical(intake.id);
    if (!loaded) return { intake: { id: intake.id, state: "pending" }, pregnancy: false, proposal: null };
    return {
      intake: {
        id: intake.id,
        state: "ready",
        clinical: loaded.clinical,
        needsApproval: intake.status === "TERISI",
        kind: intake.kind,
        purposeLabel: intake.purpose ? INTAKE_PURPOSE_LABEL[intake.purpose] : null,
        submittedAt: intake.submittedAt,
      },
      pregnancy: loaded.pregnancy,
      proposal: loaded.proposal,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(UNKNOWN_QUIZ_VERSION)) {
      return { intake: { id: intake.id, state: "error", message: error.message }, pregnancy: false, proposal: null };
    }
    throw error;
  }
}
```

Di `getEncounterForStaff`:
- pada `select` kueri utama, ganti tujuh baris kolom vital dengan `...VITAL_SELECT,`, ganti `treatments: {…}` dengan `treatments: TREATMENT_SELECT,`, ganti `addenda: {…}` dengan `addenda: ADDENDUM_SELECT,`, dan ganti `intake: { select: { id: true, status: true } },` dengan:

```ts
          intake: { select: { id: true, status: true, kind: true, purpose: true, submittedAt: true } },
```

- sesudah audit `encounter.view`, tambahkan:

```ts
  // Halaman ini juga menampilkan isi kunjungan lain milik pasien (tab Sebelumnya).
  await recordAuditThrottled({
    actor: staff,
    action: "patient.view-records",
    entity: "Patient",
    entityId: patient.id,
    summary: patient.medicalRecordNumber,
  });
```

- ganti blok pengisian `vitals`/`vitalInputs` dan `Promise.all` dengan:

```ts
  const vitals = vitalsOf(row);
  const vitalInputs = {} as Record<VitalKey, string>;
  for (const key of VITAL_KEYS) vitalInputs[key] = vitalInputValue(key, vitals[key]);

  const [{ intake, pregnancy, proposal }, options, trail, historyRows] = await Promise.all([
    loadEncounterIntake(appointment.intake),
    loadOptions(
      { serviceIds: row.treatments.map((t) => t.serviceId), performerIds: row.treatments.map((t) => t.performerId) },
      { serviceId: appointment.serviceId, staffId: appointment.staffId },
    ),
    can(staff.role, "audit:read") ? listAuditTrail("Encounter", row.id) : Promise.resolve(null),
    findHistory(patient.id, appointment.startAt, row.id),
  ]);

  const approval =
    proposal && appointment.intake && can(staff.role, "record:write")
      ? await loadApproval(patient.id, proposal, appointment.intake.status === "DIPERIKSA")
      : null;
```

- pada objek yang dikembalikan, ganti `treatments: row.treatments.map((t) => ({…})),` dengan `treatments: row.treatments.map(toTreatmentSummary),`, lalu tambahkan sesudah `vitalLines: describeVitals(vitals),`:

```ts
    vitals,
```

  dan sesudah `trail,`:

```ts
    history: historyRows.slice(0, HISTORY_LIMIT).map(toHistoryItem),
    hasMoreHistory: historyRows.length > HISTORY_LIMIT,
    approval,
```

- [ ] **Step 5: Jalankan uji dan pastikan lolos**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/encounter-read.test.ts`
Expected: PASS (9 uji).

Agar `tsc` tetap bersih, lengkapi objek uji lama di `tests/unit/components/encounter-page-view.test.tsx` (berkas ini ditulis ulang di Task 5):
- tambahkan ke objek `base`: `vitals: { systolic: null, diastolic: null, pulse: null, temperatureC: null, weightKg: null, heightCm: null, waistCm: null }, history: [], hasMoreHistory: false, approval: null,`;
- pada objek isian `state: "ready"` di uji terakhir, tambahkan `kind: "LENGKAP", purposeLabel: "Slimming", submittedAt: null,`.

Run: `npm run test:integration && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: semuanya PASS atau bersih.

- [ ] **Step 6: Commit**

```bash
git add src/server/intake-clinical.ts src/server/intake.ts src/server/encounter-read.ts tests/integration/encounter-read.test.ts tests/unit/components/encounter-page-view.test.tsx
git commit -m "feat: visit page data gains earlier final visits, inline intake approval and intake header"
```

---

### Task 2: Aturan tren dan selisih berat

**Files:**
- Modify: `src/lib/encounter.ts`
- Test: `tests/unit/encounter-trend.test.ts`

**Interfaces:**
- Produces (`@/lib/encounter`):
  - `parseVitalValues(inputs: Record<VitalKey, string>): Record<VitalKey, number | null>`
  - `type TrendSource = { date: Date; vitals: Record<VitalKey, number | null> }`
  - `type TrendRow = { current: boolean; date: Date | null; weightKg: number | null; bmi: number | null; waistCm: number | null; bloodPressure: string | null; weightDelta: number | null; waistDelta: number | null }`
  - `type TrendChange = { delta: number; since: Date }`
  - `type VitalsTrend = { rows: TrendRow[]; summary: { weight: TrendChange | null; waist: TrendChange | null }; empty: boolean }`
  - `vitalsTrend(current: Record<VitalKey, number | null>, history: TrendSource[]): VitalsTrend`
  - `weightChangeNote(currentWeightKg: number | null, history: TrendSource[]): string | null`
  - `formatSignedDecimal(value: number): string`
  - `type ContextTab = "intake" | "previous" | "trend"`, `initialContextTab(input: { hasIntake: boolean; hasHistory: boolean }): ContextTab`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/encounter-trend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatSignedDecimal,
  initialContextTab,
  parseVitalValues,
  vitalsTrend,
  weightChangeNote,
  type VitalKey,
} from "@/lib/encounter";

const none: Record<VitalKey, number | null> = {
  systolic: null,
  diastolic: null,
  pulse: null,
  temperatureC: null,
  weightKg: null,
  heightCm: null,
  waistCm: null,
};
// 03.00 UTC = 11.00 WITA. 9, 16, dan 23 Sep 2026 adalah hari Rabu.
const day = (date: string) => new Date(`${date}T03:00:00Z`);

describe("vitalsTrend", () => {
  it("baris pertama kunjungan ini, lalu kunjungan berangka, dengan selisih dan total sejak awal", () => {
    const trend = vitalsTrend({ ...none, weightKg: 72.5, heightCm: 158, waistCm: 92, systolic: 120, diastolic: 80 }, [
      { date: day("2026-09-23"), vitals: { ...none, weightKg: 73.3, heightCm: 158, waistCm: 94, systolic: 130, diastolic: 85 } },
      { date: day("2026-09-19"), vitals: { ...none, pulse: 80 } },
      { date: day("2026-09-16"), vitals: { ...none, weightKg: 74.5, waistCm: 95 } },
      { date: day("2026-09-09"), vitals: { ...none, weightKg: 75, waistCm: 97, systolic: 140, diastolic: 90 } },
    ]);

    expect(trend.empty).toBe(false);
    expect(trend.rows.map((row) => row.current)).toEqual([true, false, false, false]);
    expect(trend.rows[0]).toMatchObject({ date: null, weightKg: 72.5, bmi: 29, waistCm: 92, bloodPressure: "120/80", weightDelta: -0.8, waistDelta: -2 });
    expect(trend.rows[1]).toMatchObject({ bmi: 29.4, weightDelta: -1.2, waistDelta: -1 });
    expect(trend.rows[2]).toMatchObject({ bmi: null, bloodPressure: null, weightDelta: -0.5, waistDelta: -2 });
    expect(trend.rows[3]).toMatchObject({ bloodPressure: "140/90", weightDelta: null, waistDelta: null });
    expect(trend.summary.weight).toEqual({ delta: -2.5, since: day("2026-09-09") });
    expect(trend.summary.waist).toEqual({ delta: -5, since: day("2026-09-09") });
  });

  it("selisih dihitung terhadap baris berikutnya yang punya angka itu", () => {
    const trend = vitalsTrend({ ...none, weightKg: 72.5 }, [
      { date: day("2026-09-23"), vitals: { ...none, waistCm: 94 } },
      { date: day("2026-09-16"), vitals: { ...none, weightKg: 74 } },
    ]);
    expect(trend.rows[0].weightDelta).toBe(-1.5);
    expect(trend.rows[1].waistDelta).toBeNull();
  });

  it("tensi sebagian tidak ditampilkan, dan baris kunjungan ini tetap ada walau kosong", () => {
    const trend = vitalsTrend({ ...none, systolic: 120 }, [{ date: day("2026-09-23"), vitals: { ...none, weightKg: 73 } }]);
    expect(trend.rows[0]).toMatchObject({ current: true, bloodPressure: null, weightKg: null, weightDelta: null });
    expect(trend.rows).toHaveLength(2);
    expect(trend.summary.weight).toBeNull();
  });

  it("kosong bila kunjungan ini dan kunjungan sebelumnya tidak punya angka yang ditampilkan", () => {
    expect(vitalsTrend(none, [{ date: day("2026-09-23"), vitals: { ...none, pulse: 80 } }]).empty).toBe(true);
    expect(vitalsTrend(none, []).empty).toBe(true);
  });
});

describe("weightChangeNote", () => {
  const history = [
    { date: day("2026-09-23"), vitals: { ...none, pulse: 80 } },
    { date: day("2026-09-16"), vitals: { ...none, weightKg: 73.3 } },
  ];

  it("menyebut turun, naik, atau sama terhadap kunjungan final terakhir yang ditimbang", () => {
    expect(weightChangeNote(72.5, history)).toBe("berat turun 0,8 kg dari Rab, 16 Sep");
    expect(weightChangeNote(74, history)).toBe("berat naik 0,7 kg dari Rab, 16 Sep");
    expect(weightChangeNote(73.3, history)).toBe("berat sama dengan Rab, 16 Sep");
  });

  it("tidak ada catatan tanpa berat hari ini atau tanpa pembanding", () => {
    expect(weightChangeNote(null, history)).toBeNull();
    expect(weightChangeNote(72, [{ date: day("2026-09-23"), vitals: { ...none, pulse: 80 } }])).toBeNull();
  });
});

describe("pembantu tren", () => {
  it("parseVitalValues mengubah isian kosong atau tidak sah menjadi null", () => {
    const inputs = { systolic: "12", diastolic: "", pulse: "80", temperatureC: "36,5", weightKg: "72,55", heightCm: "158", waistCm: " " };
    expect(parseVitalValues(inputs)).toEqual({ ...none, pulse: 80, temperatureC: 36.5, heightCm: 158 });
  });

  it("formatSignedDecimal memakai tanda minus dan koma", () => {
    expect(formatSignedDecimal(-0.8)).toBe("−0,8");
    expect(formatSignedDecimal(2)).toBe("+2");
    expect(formatSignedDecimal(0)).toBe("±0");
  });

  it("tab awal: isian bila ada, lalu kunjungan sebelumnya, lalu tren", () => {
    expect(initialContextTab({ hasIntake: true, hasHistory: true })).toBe("intake");
    expect(initialContextTab({ hasIntake: false, hasHistory: true })).toBe("previous");
    expect(initialContextTab({ hasIntake: false, hasHistory: false })).toBe("trend");
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/encounter-trend.test.ts`
Expected: FAIL. `vitalsTrend` dan fungsi lainnya belum diekspor.

- [ ] **Step 3: Tambahkan fungsinya ke `src/lib/encounter.ts`**

Tambahkan impor di atas berkas: `import { formatShortIndonesianDate } from "./format";`. Lalu tambahkan di akhir berkas:

```ts
/** Angka vital dari teks isian formulir; yang kosong atau tidak sah menjadi null. */
export function parseVitalValues(inputs: Record<VitalKey, string>): Record<VitalKey, number | null> {
  const values = {} as Record<VitalKey, number | null>;
  for (const key of VITAL_KEYS) {
    const parsed = parseVital(key, inputs[key]);
    values[key] = parsed.ok ? parsed.value : null;
  }
  return values;
}

/** Satu kunjungan final sebagai sumber tren: tanggal booking dan angka vitalnya. */
export type TrendSource = { date: Date; vitals: Record<VitalKey, number | null> };

export type TrendRow = {
  /** true untuk baris "Kunjungan ini" (angka dari formulir), selalu di urutan pertama. */
  current: boolean;
  date: Date | null;
  weightKg: number | null;
  bmi: number | null;
  waistCm: number | null;
  bloodPressure: string | null;
  weightDelta: number | null;
  waistDelta: number | null;
};

export type TrendChange = { delta: number; since: Date };

export type VitalsTrend = { rows: TrendRow[]; summary: { weight: TrendChange | null; waist: TrendChange | null }; empty: boolean };

const round1 = (value: number) => Math.round(value * 10) / 10;

function bloodPressureText(vitals: Record<VitalKey, number | null>): string | null {
  return vitals.systolic !== null && vitals.diastolic !== null ? `${vitals.systolic}/${vitals.diastolic}` : null;
}

/** Kunjungan yang punya minimal satu angka yang tampil di tabel Tren. */
function hasShownVitals(vitals: Record<VitalKey, number | null>): boolean {
  return vitals.weightKg !== null || vitals.waistCm !== null || bloodPressureText(vitals) !== null;
}

/**
 * Tabel tab Tren (spec UI B bagian 4). Baris pertama selalu "Kunjungan ini",
 * lalu kunjungan final (terbaru dulu) yang punya angka untuk ditampilkan.
 * Selisih dihitung terhadap baris berikutnya yang punya angka yang sama.
 */
export function vitalsTrend(current: Record<VitalKey, number | null>, history: TrendSource[]): VitalsTrend {
  const sources = [
    { current: true, date: null as Date | null, vitals: current },
    ...history.filter((visit) => hasShownVitals(visit.vitals)).map((visit) => ({ current: false, date: visit.date as Date | null, vitals: visit.vitals })),
  ];

  const deltaAt = (index: number, key: "weightKg" | "waistCm"): number | null => {
    const value = sources[index].vitals[key];
    if (value === null) return null;
    const older = sources.slice(index + 1).find((source) => source.vitals[key] !== null);
    return older ? round1(value - (older.vitals[key] as number)) : null;
  };

  const rows: TrendRow[] = sources.map((source, index) => ({
    current: source.current,
    date: source.date,
    weightKg: source.vitals.weightKg,
    bmi: bmi(source.vitals.weightKg, source.vitals.heightCm),
    waistCm: source.vitals.waistCm,
    bloodPressure: bloodPressureText(source.vitals),
    weightDelta: deltaAt(index, "weightKg"),
    waistDelta: deltaAt(index, "waistCm"),
  }));

  const change = (key: "weightKg" | "waistCm"): TrendChange | null => {
    const withValue = sources.filter((source) => source.vitals[key] !== null);
    if (withValue.length < 2) return null;
    const newest = withValue[0];
    const oldest = withValue[withValue.length - 1];
    // Baris tertua selalu kunjungan final (punya tanggal), karena "Kunjungan ini" di urutan pertama.
    return { delta: round1((newest.vitals[key] as number) - (oldest.vitals[key] as number)), since: oldest.date as Date };
  };

  return {
    rows,
    summary: { weight: change("weightKg"), waist: change("waistCm") },
    empty: !hasShownVitals(current) && sources.length === 1,
  };
}

/** "berat turun 0,8 kg dari Rab, 16 Sep" — dibandingkan dengan kunjungan final terakhir yang ditimbang. */
export function weightChangeNote(currentWeightKg: number | null, history: TrendSource[]): string | null {
  const previous = history.find((visit) => visit.vitals.weightKg !== null);
  if (currentWeightKg === null || !previous) return null;
  const delta = round1(currentWeightKg - (previous.vitals.weightKg as number));
  const when = formatShortIndonesianDate(previous.date);
  if (delta === 0) return `berat sama dengan ${when}`;
  return `berat ${delta < 0 ? "turun" : "naik"} ${formatDecimal(Math.abs(delta))} kg dari ${when}`;
}

/** −0,8 / +2 / ±0 — selisih bertanda untuk tabel Tren. */
export function formatSignedDecimal(value: number): string {
  if (value === 0) return "±0";
  return `${value < 0 ? "−" : "+"}${formatDecimal(Math.abs(value))}`;
}

export type ContextTab = "intake" | "previous" | "trend";

/** Tab yang terbuka pertama kali di kolom kiri (spec UI B keputusan U5). */
export function initialContextTab(input: { hasIntake: boolean; hasHistory: boolean }): ContextTab {
  if (input.hasIntake) return "intake";
  return input.hasHistory ? "previous" : "trend";
}
```

- [ ] **Step 4: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/encounter-trend.test.ts tests/unit/encounter.test.ts`
Expected: PASS.

Run: `npm run lint`
Expected: bersih.

- [ ] **Step 5: Commit**

```bash
git add src/lib/encounter.ts tests/unit/encounter-trend.test.ts
git commit -m "feat: vitals trend, weight change note and initial context tab rules"
```

---

### Task 3: Tabel kebiasaan ringkas

**Files:**
- Modify: `src/components/admin/intake-clinical-content.tsx`
- Test: `tests/unit/components/intake-clinical-content.test.tsx`

**Interfaces:**
- Produces: `IntakeClinicalContent({ clinical, level?, compact? }: { clinical: IntakeClinical; level?: 2 | 3; compact?: boolean })`. `compact` bawaannya false. Halaman isian tidak berubah.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/intake-clinical-content.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { IntakeClinicalContent } from "@/components/admin/intake-clinical-content";
import { habitTable } from "@/lib/kuis/v2/describe";
import { nutritionNewPatient } from "../../fixtures/quiz-answers-v2";

const habits = habitTable(nutritionNewPatient.habits);
const clinical = { sections: [], activities: null, activityDateLabel: null, habits };
const filled = habits.rows.filter((row) => row.entries.length > 0).length;

describe("IntakeClinicalContent", () => {
  it("mode ringkas hanya menampilkan jam berisi, lalu bisa dibuka penuh dan ditutup lagi", async () => {
    render(<IntakeClinicalContent clinical={clinical} compact />);
    const table = screen.getByRole("table", { name: "Kebiasaan sehari" });
    expect(within(table).getAllByRole("row")).toHaveLength(filled + 1);

    await userEvent.click(screen.getByRole("button", { name: "Tampilkan 06.00–22.00" }));
    expect(within(table).getAllByRole("row")).toHaveLength(habits.rows.length + 1);

    await userEvent.click(screen.getByRole("button", { name: "Sembunyikan jam kosong" }));
    expect(within(table).getAllByRole("row")).toHaveLength(filled + 1);
  });

  it("mode biasa (halaman isian) menampilkan semua jam tanpa tombol", () => {
    render(<IntakeClinicalContent clinical={clinical} />);
    expect(within(screen.getByRole("table", { name: "Kebiasaan sehari" })).getAllByRole("row")).toHaveLength(habits.rows.length + 1);
    expect(screen.queryByRole("button", { name: "Tampilkan 06.00–22.00" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/components/intake-clinical-content.test.tsx`
Expected: FAIL. Uji pertama gagal karena semua jam masih tampil dan tombolnya belum ada.

- [ ] **Step 3: Tambahkan mode ringkas**

Di `src/components/admin/intake-clinical-content.tsx`:
1. tambahkan `"use client";` di baris pertama, lalu `import { useState } from "react";`;
2. ubah tanda tangan dan awal fungsi menjadi:

```tsx
export function IntakeClinicalContent({
  clinical,
  level = 2,
  compact = false,
}: {
  clinical: IntakeClinical;
  level?: 2 | 3;
  /** Halaman kunjungan: hanya jam yang berisi, dengan tombol untuk membuka tabel penuh. */
  compact?: boolean;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const [showAll, setShowAll] = useState(!compact);
  const habitRows = clinical.habits?.rows.filter((row) => showAll || row.entries.length > 0) ?? [];
  const activityRows = clinical.activities?.filter((row) => showAll || row.entries.length > 0) ?? [];
  const hasEmptyHours =
    (clinical.habits?.rows.some((row) => row.entries.length === 0) ?? false) ||
    (clinical.activities?.some((row) => row.entries.length === 0) ?? false);
  const toggle = compact && hasEmptyHours && (
    <button
      type="button"
      className="text-xs text-muted-foreground underline underline-offset-4"
      onClick={() => setShowAll((value) => !value)}
    >
      {showAll ? "Sembunyikan jam kosong" : "Tampilkan 06.00–22.00"}
    </button>
  );
```

3. di tabel kebiasaan, ganti `{clinical.habits.rows.map((row) => (` menjadi `{habitRows.map((row) => (`, lalu sisipkan `{toggle}` sesudah `</table>`, sebelum daftar `notes`;
4. di tabel aktivitas, ganti `{clinical.activities.map((row) => (` menjadi `{activityRows.map((row) => (`, lalu sisipkan `{toggle}` sesudah `</table>`.

Perbarui komentar dokumen komponen dengan satu kalimat: "Mode ringkas dipakai halaman kunjungan."

- [ ] **Step 4: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/components/intake-clinical-content.test.tsx tests/unit/components/intake-view.test.tsx`
Expected: PASS. Halaman isian tetap menampilkan tabel penuh.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/intake-clinical-content.tsx tests/unit/components/intake-clinical-content.test.tsx
git commit -m "feat: compact habit table that hides empty hours on the visit page"
```

---

### Task 4: Kolom kiri — peringatan dan tab

**Files:**
- Create: `src/components/admin/encounter-intake-tab.tsx`, `src/components/admin/previous-visits-tab.tsx`, `src/components/admin/vitals-trend-tab.tsx`, `src/components/admin/encounter-context-panel.tsx`, `tests/fixtures/encounter-detail.ts`
- Test: `tests/unit/components/encounter-context-panel.test.tsx`

**Interfaces:**
- Consumes: `EncounterDetail`, `EncounterIntake`, `EncounterHistoryItem` (Task 1); `ReadyIntakeApproval` (Task 1); `vitalsTrend`, `formatSignedDecimal`, `formatDecimal`, `initialContextTab`, `TrendSource`, `VitalKey` (Task 2); `IntakeClinicalContent compact` (Task 3); `EncounterWarningsBox`, `IntakeApprovalForm`, `formatShortIndonesianDate`, `formatIndonesianDate` (yang sudah ada).
- Produces:
  - `EncounterContextPanel({ encounter, currentVitals }: { encounter: EncounterDetail; currentVitals: Record<VitalKey, number | null> })`
  - `encounterDetail(patch?: Partial<EncounterDetail>): EncounterDetail`, `historyItem(patch?: Partial<EncounterHistoryItem>): EncounterHistoryItem`, `NO_VITALS` (fixture uji)

- [ ] **Step 1: Tulis fixture dan uji yang gagal**

`tests/fixtures/encounter-detail.ts`:

```ts
import { emptyDraftInput, type VitalKey } from "@/lib/encounter";
import type { EncounterDetail, EncounterHistoryItem } from "@/server/encounter-read";

export const NO_VITALS: Record<VitalKey, number | null> = {
  systolic: null,
  diastolic: null,
  pulse: null,
  temperatureC: null,
  weightKg: null,
  heightCm: null,
  waistCm: null,
};

/** Kunjungan final contoh: Rabu 23 Sep 2026, 11.00 WITA. */
export function historyItem(patch: Partial<EncounterHistoryItem> = {}): EncounterHistoryItem {
  return {
    id: "h1",
    startAt: new Date("2026-09-23T03:00:00Z"),
    branchName: "SunDY Mahakeret",
    authorName: "dr. Diane",
    subjective: "Nafsu makan malam masih tinggi",
    physicalExam: null,
    assessment: "Obesitas derajat 1",
    plan: "Program MAX, kontrol 1 minggu",
    vitals: { ...NO_VITALS, weightKg: 73.3, heightCm: 158, systolic: 130, diastolic: 85 },
    vitalLines: ["Tekanan darah: 130/85 mmHg", "Berat badan: 73,3 kg", "Tinggi badan: 158 cm", "IMT 29,4"],
    assessmentPreview: "Obesitas derajat 1",
    treatments: [{ serviceName: "Meso", area: "Perut", dose: null, performerName: "dr. Diane", notes: null }],
    addenda: [],
    ...patch,
  };
}

/** Kunjungan draf contoh tanpa isian dan tanpa riwayat. */
export function encounterDetail(patch: Partial<EncounterDetail> = {}): EncounterDetail {
  return {
    id: "e1",
    status: "DRAF",
    version: "2026-10-01T02:00:00.000Z",
    createdByName: "dr. Diane",
    finalized: null,
    appointment: {
      id: "a1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-01T07:00:00Z"),
      serviceName: "Konsultasi Dokter",
      staffName: "dr. Diane",
      branchName: "SunDY Mahakeret",
    },
    patient: { id: "p1", name: "Siti Rahayu", medicalRecordNumber: "SDY-2026-0001", ageLabel: "34 tahun", genderLabel: "Perempuan" },
    warnings: { allergies: "Udang", medicalHistory: null, importantNotes: "Takut jarum", paperRecordNumber: "RM-0457", pregnancy: true },
    intake: null,
    draft: emptyDraftInput(),
    vitalLines: [],
    vitals: { ...NO_VITALS },
    treatments: [],
    addenda: [],
    options: {
      services: [{ id: "s1", name: "Konsultasi Dokter" }],
      performers: [{ id: "d1", name: "dr. Diane" }],
      defaultServiceId: "s1",
      defaultPerformerId: "d1",
    },
    trail: null,
    history: [],
    hasMoreHistory: false,
    approval: null,
    ...patch,
  };
}
```

`tests/unit/components/encounter-context-panel.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EncounterContextPanel } from "@/components/admin/encounter-context-panel";
import { NO_VITALS, encounterDetail, historyItem } from "../../fixtures/encounter-detail";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Formulir persetujuan memanggil server action dari modul ini.
vi.mock("@/server/intake", () => ({ approveIntakeToPatient: vi.fn() }));

const readyIntake = {
  id: "i1",
  state: "ready" as const,
  needsApproval: true,
  kind: "LENGKAP" as const,
  purposeLabel: "Slimming",
  submittedAt: new Date("2026-09-29T02:00:00Z"),
  clinical: { sections: [{ title: "Kesehatan", lines: ["Diabetes: Metformin"] }], activities: null, activityDateLabel: null, habits: null },
};

const approval = {
  state: "ready" as const,
  patientId: "p1",
  patientVersion: "2026-10-01T02:00:00.000Z",
  current: { allergies: "Udang", medicalHistory: null },
  proposed: { allergies: "Amoxicillin", medicalHistory: "Diabetes: Metformin" },
  prefill: { allergies: "Udang\nAmoxicillin", medicalHistory: "Diabetes: Metformin" },
};

const tab = (name: string) => screen.getByRole("tab", { name });

describe("EncounterContextPanel", () => {
  it("peringatan selalu tampil di atas tab", () => {
    render(<EncounterContextPanel encounter={encounterDetail()} currentVitals={NO_VITALS} />);
    expect(within(screen.getByRole("region", { name: "Peringatan" })).getByText("Udang")).toBeInTheDocument();
  });

  it("dengan isian: tab Isian kuis terbuka, dengan kepala isian dan kotak persetujuan", () => {
    render(<EncounterContextPanel encounter={encounterDetail({ intake: readyIntake, approval })} currentVitals={NO_VITALS} />);
    expect(tab("Isian kuis")).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/Slimming · pasien baru · dikirim Sel, 29 Sep/)).toBeInTheDocument();
    expect(within(panel).getByText("Diabetes: Metformin")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Setujui ke data pasien" })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Buka halaman isian" })).toHaveAttribute("href", "/admin/isian/i1");
  });

  it("tanpa isian tetapi ada riwayat: tab Sebelumnya terbuka dengan kunjungan terbaru lengkap", async () => {
    const history = [
      historyItem(),
      historyItem({ id: "h2", startAt: new Date("2026-09-16T03:00:00Z"), assessment: "Konsultasi awal", assessmentPreview: "Konsultasi awal", plan: "Mulai Program MAX" }),
    ];
    render(<EncounterContextPanel encounter={encounterDetail({ history })} currentVitals={NO_VITALS} />);
    expect(tab("Sebelumnya")).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Program MAX, kontrol 1 minggu")).toBeInTheDocument();
    expect(within(panel).getByText(/Meso · Perut · dr\. Diane/)).toBeInTheDocument();
    expect(within(panel).queryByText("Mulai Program MAX")).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /Konsultasi awal/ }));
    expect(within(panel).getByText("Mulai Program MAX")).toBeInTheDocument();
    expect(within(panel).queryByText("Program MAX, kontrol 1 minggu")).not.toBeInTheDocument();
  });

  it("lebih dari 12 kunjungan: tautan ke Data pasien", () => {
    render(<EncounterContextPanel encounter={encounterDetail({ history: [historyItem()], hasMoreHistory: true })} currentVitals={NO_VITALS} />);
    expect(within(screen.getByRole("tabpanel")).getByRole("link", { name: "Data pasien" })).toHaveAttribute("href", "/admin/pasien/p1");
  });

  it("tanpa isian dan tanpa riwayat: tab Tren terbuka dengan pesan kosong", () => {
    render(<EncounterContextPanel encounter={encounterDetail()} currentVitals={NO_VITALS} />);
    expect(tab("Tren")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Belum ada angka tanda vital.")).toBeInTheDocument();
  });

  it("tab Tren: baris Kunjungan ini memakai angka formulir, dengan selisih dan total", async () => {
    render(
      <EncounterContextPanel
        encounter={encounterDetail({ history: [historyItem()] })}
        currentVitals={{ ...NO_VITALS, weightKg: 72.5, heightCm: 158 }}
      />,
    );
    await userEvent.click(tab("Tren"));
    const table = screen.getByRole("table", { name: "Tren tanda vital" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Kunjungan ini");
    expect(rows[1]).toHaveTextContent("72,5");
    expect(rows[1]).toHaveTextContent("−0,8");
    expect(rows[2]).toHaveTextContent("Rab, 23 Sep");
    expect(rows[2]).toHaveTextContent("130/85");
    expect(screen.getByText(/Total: berat −0,8 kg sejak Rab, 23 Sep/)).toBeInTheDocument();
  });

  it("tab Tren: berat yang belum sah tampil sebagai tanda pisah, bukan NaN", async () => {
    render(<EncounterContextPanel encounter={encounterDetail({ history: [historyItem()] })} currentVitals={{ ...NO_VITALS }} />);
    await userEvent.click(tab("Tren"));
    const rows = within(screen.getByRole("table", { name: "Tren tanda vital" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Kunjungan ini");
    expect(rows[1].textContent).not.toMatch(/NaN/);
    expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
  });
});
```

29 Sep 2026 adalah hari Selasa, jadi `formatShortIndonesianDate` menulis "Sel, 29 Sep".

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/components/encounter-context-panel.test.tsx`
Expected: FAIL. `@/components/admin/encounter-context-panel` belum ada.

- [ ] **Step 3: Tulis keempat komponen**

`src/components/admin/encounter-intake-tab.tsx`:

```tsx
import Link from "next/link";
import { formatShortIndonesianDate } from "@/lib/format";
import type { EncounterIntake } from "@/server/encounter-read";
import type { ReadyIntakeApproval } from "@/server/intake-clinical";
import { IntakeApprovalForm } from "./intake-approval-form";
import { IntakeClinicalContent } from "./intake-clinical-content";

/** Tab Isian kuis (spec UI B bagian 4): ringkasan jawaban dan persetujuan ke data pasien. */
export function EncounterIntakeTab({ intake, approval }: { intake: EncounterIntake | null; approval: ReadyIntakeApproval | null }) {
  if (!intake) return <p className="text-sm text-muted-foreground">Tidak ada isian kuis untuk kunjungan ini.</p>;
  if (intake.state === "pending") return <p className="text-sm text-muted-foreground">Isian belum diisi pasien.</p>;

  const pageLink = (
    <Link href={`/admin/isian/${intake.id}`} className="text-sm underline underline-offset-4">
      Buka halaman isian
    </Link>
  );
  if (intake.state === "error") {
    return (
      <p className="text-sm text-destructive">
        {intake.message} {pageLink}
      </p>
    );
  }

  const heading = [
    intake.purposeLabel,
    intake.kind === "LENGKAP" ? "pasien baru" : "pasien lama",
    intake.submittedAt ? `dikirim ${formatShortIndonesianDate(intake.submittedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{heading}</p>
      <IntakeClinicalContent clinical={intake.clinical} level={3} compact />
      {approval && (
        // key: formulir dibuat ulang dengan isi awal baru setelah router.refresh().
        <IntakeApprovalForm key={approval.patientVersion} intakeId={intake.id} approval={approval} />
      )}
      <p>{pageLink}</p>
    </div>
  );
}
```

`src/components/admin/previous-visits-tab.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import type { EncounterHistoryItem } from "@/server/encounter-read";

function Part({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line">{text || "—"}</p>
    </div>
  );
}

function VisitDetail({ visit }: { visit: EncounterHistoryItem }) {
  return (
    <article aria-label={`Kunjungan ${formatIndonesianDate(visit.startAt)}`} className="space-y-2 rounded-md border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{formatIndonesianDate(visit.startAt)}</span>
        <span className="text-xs text-muted-foreground">
          {visit.branchName} · {visit.authorName}
        </span>
      </div>
      <Part label="S" text={visit.subjective} />
      {visit.vitalLines.length > 0 && <Part label="O" text={visit.vitalLines.join(" · ")} />}
      {visit.physicalExam && <Part label="Pemeriksaan fisik" text={visit.physicalExam} />}
      <Part label="A" text={visit.assessment} />
      <Part label="P" text={visit.plan} />
      {visit.treatments.length > 0 && (
        <Part
          label="Treatment"
          text={visit.treatments
            .map((row) => [row.serviceName, row.area, row.dose, row.performerName].filter(Boolean).join(" · "))
            .join("\n")}
        />
      )}
      {visit.addenda.map((addendum) => (
        <p key={addendum.id} className="rounded bg-muted p-2 text-xs">
          <span className="text-muted-foreground">
            Adendum {formatShortIndonesianDate(addendum.createdAt)} · {addendum.authorName}:
          </span>{" "}
          {addendum.text}
        </p>
      ))}
    </article>
  );
}

/** Tab Sebelumnya (spec UI B bagian 4): kunjungan terbaru terbuka, sisanya satu per satu. */
export function PreviousVisitsTab({ history, hasMore, patientId }: { history: EncounterHistoryItem[]; hasMore: boolean; patientId: string }) {
  const [openId, setOpenId] = useState<string | null>(history[0]?.id ?? null);
  if (history.length === 0) return <p className="text-sm text-muted-foreground">Belum ada kunjungan sebelumnya.</p>;

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {history.map((visit) => (
          <li key={visit.id}>
            {visit.id === openId ? (
              <VisitDetail visit={visit} />
            ) : (
              <button
                type="button"
                onClick={() => setOpenId(visit.id)}
                className="flex w-full gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="w-24 shrink-0 text-muted-foreground">{formatShortIndonesianDate(visit.startAt)}</span>
                <span>{visit.assessmentPreview ?? "—"}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
      {hasMore && (
        <p className="text-xs text-muted-foreground">
          Kunjungan lebih lama ada di{" "}
          <Link href={`/admin/pasien/${patientId}`} className="underline underline-offset-4">
            Data pasien
          </Link>
          .
        </p>
      )}
    </div>
  );
}
```

`src/components/admin/vitals-trend-tab.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDecimal, formatSignedDecimal, vitalsTrend, type TrendSource, type VitalKey } from "@/lib/encounter";
import { formatShortIndonesianDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className={cn("ml-1 text-xs", value < 0 ? "text-emerald-700" : value > 0 ? "text-red-700" : "text-muted-foreground")}>
      {formatSignedDecimal(value)}
    </span>
  );
}

const show = (value: number | null) => (value === null ? "—" : formatDecimal(value));

/** Tab Tren (spec UI B bagian 4): berat, IMT, pinggang, dan tensi per kunjungan. */
export function VitalsTrendTab({ current, history }: { current: Record<VitalKey, number | null>; history: TrendSource[] }) {
  const trend = vitalsTrend(current, history);
  if (trend.empty) return <p className="text-sm text-muted-foreground">Belum ada angka tanda vital.</p>;

  const totals = [
    trend.summary.weight && `berat ${formatSignedDecimal(trend.summary.weight.delta)} kg sejak ${formatShortIndonesianDate(trend.summary.weight.since)}`,
    trend.summary.waist && `pinggang ${formatSignedDecimal(trend.summary.waist.delta)} cm sejak ${formatShortIndonesianDate(trend.summary.waist.since)}`,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <Table aria-label="Tren tanda vital">
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal</TableHead>
            <TableHead>Berat</TableHead>
            <TableHead>IMT</TableHead>
            <TableHead>Pinggang</TableHead>
            <TableHead>Tensi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trend.rows.map((row, index) => (
            <TableRow key={row.current ? "current" : index} className={row.current ? "bg-amber-50/70 font-medium dark:bg-amber-950/30" : undefined}>
              <TableCell>{row.current ? "Kunjungan ini" : formatShortIndonesianDate(row.date as Date)}</TableCell>
              <TableCell>
                {show(row.weightKg)}
                <Delta value={row.weightDelta} />
              </TableCell>
              <TableCell>{show(row.bmi)}</TableCell>
              <TableCell>
                {show(row.waistCm)}
                <Delta value={row.waistDelta} />
              </TableCell>
              <TableCell>{row.bloodPressure ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totals.length > 0 && <p className="text-sm">Total: {totals.join(" · ")}</p>}
      <p className="text-xs text-muted-foreground">Dari kunjungan final. Grafik lengkap menyusul di bagian BIA.</p>
    </div>
  );
}
```

`src/components/admin/encounter-context-panel.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { initialContextTab, type ContextTab, type VitalKey } from "@/lib/encounter";
import { cn } from "@/lib/utils";
import type { EncounterDetail } from "@/server/encounter-read";
import { EncounterIntakeTab } from "./encounter-intake-tab";
import { EncounterWarningsBox } from "./encounter-warnings";
import { PreviousVisitsTab } from "./previous-visits-tab";
import { VitalsTrendTab } from "./vitals-trend-tab";

const TABS: { key: ContextTab; label: string }[] = [
  { key: "intake", label: "Isian kuis" },
  { key: "previous", label: "Sebelumnya" },
  { key: "trend", label: "Tren" },
];

/**
 * Kolom kiri halaman kunjungan (spec UI B bagian 4): peringatan selalu di atas,
 * lalu tab Isian kuis / Sebelumnya / Tren. Di layar sempit tab bisa dilipat.
 */
export function EncounterContextPanel({
  encounter,
  currentVitals,
}: {
  encounter: EncounterDetail;
  /** Angka vital formulir saat ini, untuk baris "Kunjungan ini" di Tren. */
  currentVitals: Record<VitalKey, number | null>;
}) {
  const id = useId();
  const [tab, setTab] = useState<ContextTab>(() =>
    initialContextTab({ hasIntake: encounter.intake !== null, hasHistory: encounter.history.length > 0 }),
  );
  const trendSource = encounter.history.map((visit) => ({ date: visit.startAt, vitals: visit.vitals }));

  return (
    <div className="space-y-4">
      <EncounterWarningsBox warnings={encounter.warnings} />
      <details open className="group space-y-3">
        <summary className="cursor-pointer text-sm font-medium lg:hidden">Isian, kunjungan sebelumnya, dan tren</summary>
        <div role="tablist" aria-label="Konteks kunjungan" className="flex flex-wrap gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`${id}-${item.key}`}
              aria-selected={tab === item.key}
              aria-controls={`${id}-panel`}
              onClick={() => setTab(item.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                tab === item.key ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className="rounded-lg border bg-background p-4">
          {tab === "intake" && <EncounterIntakeTab intake={encounter.intake} approval={encounter.approval} />}
          {tab === "previous" && (
            <PreviousVisitsTab history={encounter.history} hasMore={encounter.hasMoreHistory} patientId={encounter.patient.id} />
          )}
          {tab === "trend" && <VitalsTrendTab current={currentVitals} history={trendSource} />}
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/components/encounter-context-panel.test.tsx`
Expected: PASS (7 uji).

Run: `npm run lint`
Expected: bersih.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/encounter-intake-tab.tsx src/components/admin/previous-visits-tab.tsx src/components/admin/vitals-trend-tab.tsx src/components/admin/encounter-context-panel.tsx tests/fixtures/encounter-detail.ts tests/unit/components/encounter-context-panel.test.tsx
git commit -m "feat: visit context panel with warnings and intake, previous visits and trend tabs"
```

---

### Task 5: Ruang kerja dua kolom dan bar aksi yang menempel

**Files:**
- Create: `src/components/admin/encounter-workspace.tsx`
- Modify: `src/components/admin/encounter-form.tsx`, `src/components/admin/encounter-record.tsx`, `src/components/admin/encounter-page-view.tsx`
- Delete: `src/components/admin/encounter-intake-content.tsx`
- Test: `tests/unit/components/encounter-form.test.tsx`, `tests/unit/components/encounter-page-view.test.tsx`

**Interfaces:**
- Consumes: `EncounterContextPanel` (Task 4); `parseVitalValues`, `weightChangeNote`, `TrendSource` (Task 2); `EncounterDetail` (Task 1); fixture `encounterDetail`, `historyItem`, `NO_VITALS` (Task 4).
- Produces:
  - `EncounterForm` tanpa prop `intakeSlot`, dengan prop baru `weightHistory?: TrendSource[]` dan `onVitalsChange?: (values: Record<VitalKey, number | null>) => void`;
  - `EncounterRecord({ encounter })` tanpa `intakeSlot`;
  - `EncounterWorkspace({ encounter, canWrite }: { encounter: EncounterDetail; canWrite: boolean })`.

- [ ] **Step 1: Tulis uji yang gagal**

Di `tests/unit/components/encounter-form.test.tsx`:
1. tambahkan `import type { ReactNode } from "react";`, dan tambahkan `NO_VITALS` lewat `import { NO_VITALS } from "../../fixtures/encounter-detail";`;
2. ganti `renderForm` dengan versi tanpa `intakeSlot`, yang bisa merender elemen tambahan di luar formulir:

```tsx
function renderForm(props: Partial<EncounterFormProps> = {}, extra?: ReactNode) {
  return render(
    <>
      <EncounterForm
        encounterId="e1"
        initialVersion="v1"
        initialDraft={emptyDraftInput()}
        options={options}
        autosaveDelayMs={50}
        retryDelaysMs={[300]}
        {...props}
      />
      {extra}
    </>,
  );
}
```

3. pada uji pertama, hapus baris `expect(screen.getByText("Isian pasien")).toBeInTheDocument();`;
4. pada dua uji tautan, ganti `renderForm({ intakeSlot: appLink })` menjadi `renderForm({}, appLink)`;
5. tambahkan di akhir `describe`:

```tsx
  it("baris IMT menyebut selisih berat dari kunjungan final terakhir yang ditimbang", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    renderForm({ weightHistory: [{ date: new Date("2026-09-23T03:00:00Z"), vitals: { ...NO_VITALS, weightKg: 73.3 } }] });
    await userEvent.type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    await userEvent.type(screen.getByLabelText("Tinggi badan (cm)"), "158");
    expect(screen.getByText("IMT 29 · berat turun 0,8 kg dari Rab, 23 Sep")).toBeInTheDocument();
  });

  it("memberi tahu angka vital terbaru saat mengetik, dengan isian tidak sah sebagai null", async () => {
    const onVitalsChange = vi.fn();
    renderForm({ onVitalsChange });
    await userEvent.type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    expect(onVitalsChange).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: 72.5, systolic: null }));
    await userEvent.type(screen.getByLabelText("Sistolik (mmHg)"), "1");
    expect(onVitalsChange).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: 72.5, systolic: null }));
  });

  it("Finalisasi dan status simpan berada di bar bawah yang menempel", () => {
    renderForm();
    const bar = screen.getByRole("button", { name: "Finalisasi" }).closest("[data-slot='encounter-actions']");
    expect(bar).toHaveClass("sticky", "bottom-0");
    expect(bar).toContainElement(screen.getByRole("status"));
  });
```

Ganti isi `tests/unit/components/encounter-page-view.test.tsx` dengan:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EncounterPageView } from "@/components/admin/encounter-page-view";
import { emptyDraftInput } from "@/lib/encounter";
import { encounterDetail, historyItem } from "../../fixtures/encounter-detail";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/encounter", () => ({
  saveEncounterDraft: vi.fn(),
  finalizeEncounter: vi.fn(),
  discardEncounterDraft: vi.fn(),
  addEncounterAddendum: vi.fn(),
}));
vi.mock("@/server/intake", () => ({ approveIntakeToPatient: vi.fn() }));

const final = encounterDetail({
  status: "FINAL",
  finalized: { byName: "dr. Diane", at: new Date("2026-10-01T08:00:00Z") },
  draft: { ...emptyDraftInput(), subjective: "Berat naik", assessment: "Obesitas derajat 1", plan: "Program MAX" },
  vitalLines: ["Tekanan darah: 120/80 mmHg", "IMT 28,3"],
  treatments: [{ serviceName: "Meso", area: "Perut", dose: null, performerName: "dr. Diane", notes: null }],
  addenda: [{ id: "ad1", text: "Tensi diukur ulang: 118/78.", authorName: "dr. Diane", createdAt: new Date("2026-10-02T01:00:00Z") }],
});

describe("EncounterPageView", () => {
  it("kepala satu baris dan peringatan di kolom kiri", () => {
    render(<EncounterPageView encounter={encounterDetail()} canWrite />);
    expect(screen.getByRole("heading", { name: "Siti Rahayu" })).toBeInTheDocument();
    expect(screen.getByText(/SDY-2026-0001 · 34 tahun · Perempuan · .*SunDY Mahakeret/)).toBeInTheDocument();
    const aside = screen.getByRole("complementary", { name: "Konteks kunjungan" });
    const warnings = within(aside).getByRole("region", { name: "Peringatan" });
    expect(within(warnings).getByText("Takut jarum")).toBeInTheDocument();
    expect(within(warnings).getByText("Ada berkas kertas: RM-0457")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data pasien" })).toHaveAttribute("href", "/admin/pasien/p1");
  });

  it("draf untuk penulis: formulir di kolom kanan dengan bar aksi, tanpa bagian adendum", () => {
    render(<EncounterPageView encounter={encounterDetail()} canWrite />);
    expect(screen.getByLabelText("Keluhan dan anamnesis dokter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalisasi" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Adendum" })).not.toBeInTheDocument();
  });

  it("final: baca-saja, adendum, dan bar 'Final · difinalisasi oleh'", () => {
    render(<EncounterPageView encounter={final} canWrite />);
    expect(screen.queryByLabelText("Keluhan dan anamnesis dokter")).not.toBeInTheDocument();
    expect(screen.getByText("Tekanan darah: 120/80 mmHg")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Meso" })).toBeInTheDocument();
    expect(screen.getByText(/Final · difinalisasi oleh dr\. Diane/)).toBeInTheDocument();
    const addenda = screen.getByRole("region", { name: "Adendum" });
    expect(within(addenda).getByText("Tensi diukur ulang: 118/78.")).toBeInTheDocument();
    expect(within(addenda).getByLabelText("Isi adendum")).toBeInTheDocument();
  });

  it("jejak catatan hanya tampil bila diberikan (Super Admin)", () => {
    const { unmount } = render(<EncounterPageView encounter={final} canWrite />);
    expect(screen.queryByText("Jejak catatan ini")).not.toBeInTheDocument();
    unmount();

    render(
      <EncounterPageView
        encounter={{ ...final, trail: [{ id: "t1", at: new Date("2026-10-01T08:00:00Z"), actorName: "dr. Diane", roleLabel: "Dokter", actionLabel: "memfinalisasi" }] }}
        canWrite
      />,
    );
    expect(screen.getByText("Jejak catatan ini")).toBeInTheDocument();
  });

  it("mengetik berat langsung mengubah baris Kunjungan ini di tab Tren", async () => {
    render(<EncounterPageView encounter={encounterDetail({ history: [historyItem()] })} canWrite />);
    await userEvent.type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    await userEvent.click(screen.getByRole("tab", { name: "Tren" }));
    const rows = within(screen.getByRole("table", { name: "Tren tanda vital" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Kunjungan ini");
    expect(rows[1]).toHaveTextContent("72,5");
  });

  it("memuat ulang halaman (mis. setelah persetujuan isian) tidak menghapus ketikan yang belum tersimpan", async () => {
    const { rerender } = render(<EncounterPageView encounter={encounterDetail()} canWrite />);
    await userEvent.type(screen.getByLabelText("Penilaian / diagnosis"), "Obesitas");
    rerender(
      <EncounterPageView
        encounter={encounterDetail({ version: "2026-10-01T02:05:00.000Z", warnings: { ...encounterDetail().warnings, allergies: "Udang\nAmoxicillin" } })}
        canWrite
      />,
    );
    expect(screen.getByLabelText("Penilaian / diagnosis")).toHaveValue("Obesitas");
    expect(within(screen.getByRole("region", { name: "Peringatan" })).getByText(/Amoxicillin/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/components/encounter-form.test.tsx tests/unit/components/encounter-page-view.test.tsx`
Expected: FAIL. Uji selisih berat, `onVitalsChange`, bar menempel, kolom kiri (`complementary`), dan bar final belum terpenuhi.

- [ ] **Step 3: Ubah formulir, catatan final, dan halaman**

**`src/components/admin/encounter-form.tsx`:**
- hapus impor `type ReactNode` bila tidak dipakai lagi. Pada impor `@/lib/encounter`, tambahkan `parseVitalValues`, `weightChangeNote`, dan `type TrendSource`;
- pada `EncounterFormProps`, hapus `intakeSlot` beserta komentarnya, lalu tambahkan:

```tsx
  /** Kunjungan final sebelumnya (terbaru dulu), untuk selisih berat di baris IMT. */
  weightHistory?: TrendSource[];
  /** Dipanggil setiap angka vital berubah, agar tab Tren ikut berubah. */
  onVitalsChange?: (values: Record<VitalKey, number | null>) => void;
```

- ganti `setVital` dengan:

```tsx
  const setVital = (key: VitalKey, value: string) => {
    const next = { ...draft, vitals: { ...draft.vitals, [key]: value } };
    update(next);
    props.onVitalsChange?.(parseVitalValues(next.vitals));
  };
```

- sesudah `const index = bmi(vitalValues.weightKg, vitalValues.heightCm);` tambahkan:

```tsx
  const weightNote = weightChangeNote(vitalValues.weightKg, props.weightHistory ?? []);
```

- pada bagian S, hapus baris `{props.intakeSlot}`;
- ganti baris IMT menjadi:

```tsx
        <p className="text-sm">
          IMT {index === null ? "—" : formatDecimal(index)}
          {weightNote ? ` · ${weightNote}` : ""}
        </p>
```

- ganti blok tombol/status (`<div className="flex flex-wrap items-center gap-3 border-t pt-4">` … `</div>`) dengan bar yang menempel:

```tsx
      <div
        data-slot="encounter-actions"
        className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t bg-background/95 py-3 backdrop-blur"
      >
        <p
          role="status"
          aria-live="polite"
          className={cn("mr-auto text-sm", rejected ? "font-medium text-destructive" : "text-muted-foreground")}
        >
          {statusText(autosave.status)}
        </p>
        <Button variant="outline" onClick={() => setConfirm("discard")} disabled={busy}>
          Buang draf
        </Button>
        <Button onClick={requestFinalize} disabled={busy}>
          Finalisasi
        </Button>
      </div>
```

**`src/components/admin/encounter-record.tsx`:**
- ubah tanda tangan menjadi `export function EncounterRecord({ encounter }: { encounter: EncounterDetail })`;
- pada bagian S, hapus `{intakeSlot}`;
- hapus blok `{encounter.finalized && (…Difinalisasi oleh…)}` di akhir, beserta impor yang tidak terpakai lagi (`formatIndonesianDate`, `minutesToTimeLabel`, `witaMinutesOfDay`; `ReactNode` tetap dipakai `Part`).

**`src/components/admin/encounter-workspace.tsx`** (baru):

```tsx
"use client";

import { useState } from "react";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { EncounterDetail } from "@/server/encounter-read";
import { AddendumForm } from "./addendum-form";
import { AuditTrail } from "./audit-trail";
import { EncounterContextPanel } from "./encounter-context-panel";
import { EncounterForm } from "./encounter-form";
import { EncounterRecord } from "./encounter-record";

/**
 * Ruang kerja kunjungan (spec UI B bagian 3): konteks di kiri yang tetap di
 * tempat, catatan di kanan dengan bar aksi yang menempel. Angka vital formulir
 * dipegang di sini agar tab Tren ikut berubah saat dokter mengetik.
 *
 * Jangan diberi key berdasarkan versi: router.refresh() (mis. setelah
 * persetujuan isian) tidak boleh me-remount formulir yang sedang diketik.
 */
export function EncounterWorkspace({ encounter, canWrite }: { encounter: EncounterDetail; canWrite: boolean }) {
  const [currentVitals, setCurrentVitals] = useState(encounter.vitals);
  const isFinal = encounter.status === "FINAL";
  const editable = !isFinal && canWrite;
  const weightHistory = encounter.history.map((visit) => ({ date: visit.startAt, vitals: visit.vitals }));

  return (
    <div className="gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <aside
        aria-label="Konteks kunjungan"
        className="mb-6 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto lg:pr-1"
      >
        <EncounterContextPanel encounter={encounter} currentVitals={editable ? currentVitals : encounter.vitals} />
      </aside>

      <div className="min-w-0 space-y-6">
        {editable ? (
          <EncounterForm
            encounterId={encounter.id}
            initialVersion={encounter.version}
            initialDraft={encounter.draft}
            options={encounter.options}
            weightHistory={weightHistory}
            onVitalsChange={setCurrentVitals}
          />
        ) : (
          <EncounterRecord encounter={encounter} />
        )}

        {isFinal && (
          <section aria-labelledby="adendum" className="space-y-3">
            <h2 id="adendum" className="text-base font-medium">
              Adendum
            </h2>
            {encounter.addenda.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada adendum.</p>
            ) : (
              <ol className="space-y-2">
                {encounter.addenda.map((addendum) => (
                  <li key={addendum.id} className="rounded-md border p-3 text-sm">
                    <p className="whitespace-pre-line">{addendum.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {addendum.authorName} · {formatIndonesianDate(addendum.createdAt)},{" "}
                      {minutesToTimeLabel(witaMinutesOfDay(addendum.createdAt))} WITA
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {canWrite && <AddendumForm encounterId={encounter.id} />}
          </section>
        )}

        {encounter.trail && <AuditTrail rows={encounter.trail} />}

        {isFinal && encounter.finalized && (
          <div className="sticky bottom-0 z-10 border-t bg-background/95 py-3 text-sm text-muted-foreground backdrop-blur">
            Final · difinalisasi oleh {encounter.finalized.byName}, {formatIndonesianDate(encounter.finalized.at)}{" "}
            {minutesToTimeLabel(witaMinutesOfDay(encounter.finalized.at))} WITA
          </div>
        )}
      </div>
    </div>
  );
}
```

**`src/components/admin/encounter-page-view.tsx`**, ganti seluruh isinya:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { EncounterDetail } from "@/server/encounter-read";
import { EncounterWorkspace } from "./encounter-workspace";

/** Halaman kunjungan (spec UI B bagian 3): kepala satu baris dan ruang kerja dua kolom. */
export function EncounterPageView({ encounter, canWrite }: { encounter: EncounterDetail; canWrite: boolean }) {
  const { appointment, patient } = encounter;
  const isFinal = encounter.status === "FINAL";
  const time = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));
  const summary = [
    `No. RM ${patient.medicalRecordNumber}`,
    patient.ageLabel,
    patient.genderLabel,
    `${formatIndonesianDate(appointment.startAt)}, ${time} WITA`,
    appointment.branchName,
    appointment.serviceName,
    appointment.staffName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="max-w-7xl space-y-4">
      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm">
        <h2 className="text-lg font-medium">{patient.name}</h2>
        <Badge variant={isFinal ? "default" : "outline"}>{isFinal ? "Final" : "Draf"}</Badge>
        <p className="text-muted-foreground">{summary}</p>
        <span className="font-mono text-xs text-muted-foreground">{appointment.code}</span>
        <Link href={`/admin/pasien/${patient.id}`} className="ml-auto underline underline-offset-4">
          Data pasien
        </Link>
      </section>
      <EncounterWorkspace encounter={encounter} canWrite={canWrite} />
    </div>
  );
}
```

Hapus `src/components/admin/encounter-intake-content.tsx` (`git rm`). Pastikan tidak ada impor lain: `grep -rn "encounter-intake-content" src tests` harus kosong.

- [ ] **Step 4: Jalankan uji dan pastikan lolos**

Run: `npx vitest run tests/unit/components/encounter-form.test.tsx tests/unit/components/encounter-page-view.test.tsx tests/unit/components/encounter-context-panel.test.tsx`
Expected: PASS.

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: seluruh unit PASS, `tsc` dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/encounter-workspace.tsx src/components/admin/encounter-form.tsx src/components/admin/encounter-record.tsx src/components/admin/encounter-page-view.tsx tests/unit/components/encounter-form.test.tsx tests/unit/components/encounter-page-view.test.tsx
git rm -q src/components/admin/encounter-intake-content.tsx
git commit -m "feat: two-column visit workspace with sticky context and a sticky action bar"
```

---

### Task 6: Uji ujung-ke-ujung dan status spec

**Files:**
- Modify: `tests/e2e/prepare-db.mts`, `tests/e2e/kunjungan.spec.ts`, `docs/superpowers/specs/2026-09-30-ui-alur-dokter-design.md`

**Interfaces:**
- Consumes: seluruh Task 1–5; fixture `slimmingNewPatient` dari `tests/fixtures/quiz-answers-v2.ts`.

- [ ] **Step 1: Fixture pasien berisian**

Di `tests/e2e/prepare-db.mts`, tambahkan impor `import { slimmingNewPatient } from "../fixtures/quiz-answers-v2";`. Sesudah loop fixture kunjungan yang sudah ada, dan sebelum `await prisma.$disconnect();`, tambahkan:

```ts
// Persetujuan isian dari halaman kunjungan (kunjungan.spec.ts): pasien hadir hari ini
// dengan isian kuis v2 yang belum diperiksa, satu per proyek, pukul 07.00/07.30.
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-ISIAN-${index + 1}`,
      name: `Pasien Isian ${project}`,
      whatsapp: `6281200078${index}01`,
      birthDate: new Date("1992-04-17T00:00:00Z"),
      gender: "P",
      allergies: "Udang",
    },
  });
  const startAt = combineWitaDateAndMinutes(today, 7 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-ISIAN-${index + 1}`,
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
  await prisma.intake.create({
    data: {
      appointmentId: appointment.id,
      patientId: patient.id,
      status: "TERISI",
      kind: "LENGKAP",
      purpose: "SLIMMING",
      quizVersion: 2,
      answers: slimmingNewPatient,
      submittedAt: new Date(),
    },
  });
}
```

Bila `tsx` gagal memuat `../fixtures/quiz-answers-v2` karena impor alias `@/…`, periksa berkas itu: impornya hanya `import type`, yang dibuang saat kompilasi. Bila ada impor nilai beralias, salin objek `slimmingNewPatient` ke dalam `prepare-db.mts`.

- [ ] **Step 2: Tulis uji e2e yang gagal**

Tambahkan di akhir `tests/e2e/kunjungan.spec.ts`:

```ts
test("dokter menyetujui isian kuis ke data pasien langsung dari halaman kunjungan", async ({ page }, testInfo) => {
  await signIn(page, E2E_ADMIN);
  await page
    .getByRole("region", { name: "Pasien hari ini" })
    .getByRole("row")
    .filter({ hasText: `Pasien Isian ${testInfo.project.name}` })
    .getByRole("button", { name: "Periksa" })
    .click();
  await expect(page).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });

  await expect(page.getByRole("tab", { name: "Isian kuis" })).toHaveAttribute("aria-selected", "true");
  if (testInfo.project.name === "desktop") {
    // Dua kolom di desktop: Finalisasi terlihat tanpa menggulir walau isian panjang.
    await expect(page.getByRole("button", { name: "Finalisasi" })).toBeInViewport();
  }

  await page.getByRole("tabpanel").getByRole("button", { name: "Setujui ke data pasien" }).click();
  await expect(page.getByRole("region", { name: "Peringatan" })).toContainText("Amoxicillin", { timeout: 30_000 });
});
```

Buktikan uji baru bisa gagal: ganti sementara `{approval && (` menjadi `{false && (` di `src/components/admin/encounter-intake-tab.tsx`.

Run: `npx playwright test tests/e2e/kunjungan.spec.ts -g "menyetujui isian"`
Expected: FAIL. Tombol "Setujui ke data pasien" tidak ditemukan.

Kembalikan perubahan itu (`git checkout src/components/admin/encounter-intake-tab.tsx`).

Run: `npx playwright test tests/e2e/kunjungan.spec.ts`
Expected: PASS (3 uji × 2 proyek).

- [ ] **Step 3: Jalankan seluruh e2e**

Run: `npm run test:e2e`
Expected: PASS. Uji `public-site.spec.ts` yang kadang kehabisan waktu karena `next dev` lambat: jalankan ulang berkas itu sendirian dan catat hasilnya. Bila disk laptop hampir penuh, kosongkan dulu atau jalankan per berkas.

- [ ] **Step 4: Status spec dan verifikasi akhir**

Di `docs/superpowers/specs/2026-09-30-ui-alur-dokter-design.md`, ganti baris status menjadi:

```markdown
- **Status:** Disetujui pemilik (30 September 2026) · terlaksana (<tanggal hari ini>)
```

Run, berurutan:

```bash
npx vitest run
npm run test:integration
npx tsc --noEmit
npm run lint
```

Expected: semuanya PASS atau bersih.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/prepare-db.mts tests/e2e/kunjungan.spec.ts docs/superpowers/specs/2026-09-30-ui-alur-dokter-design.md
git commit -m "test: approve an intake from the visit page end to end; mark the doctor-flow UI spec done"
```
