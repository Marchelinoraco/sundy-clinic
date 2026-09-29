# Plan 3b-2a — Setujui Isian ke Data Pasien, Filter Isian & Halaman Pasien

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dokter menyetujui jawaban kuis ke catatan alergi dan riwayat penyakit pasien lewat tombol **"Setujui ke data pasien"**. Admin dan dokter menemukan isian yang belum diperiksa lewat filter di menu Booking. Setiap pasien punya halaman detail berisi identitas, catatan medis, riwayat booking, dan riwayat isian.

**Architecture:**
- **Usulan teks** disusun oleh fungsi murni dari jawaban kuis versi 1. Isi awal kolom yang disunting dokter dibuat dengan menggabungkan catatan pasien saat ini dan baris usulan yang belum ada di dalamnya.
- **Persetujuan** adalah satu server action `record:write`. Dalam satu transaksi aksi ini:
  - memperbarui `Patient.allergies` dan `Patient.medicalHistory`, hanya bila `updatedAt` pasien masih sama dengan saat halaman dibuka;
  - mengubah isian menjadi `DIPERIKSA` beserta siapa dan kapan.

  Aksi ini tidak menyentuh identitas pasien dan tidak pernah mengubah jawaban isian.
- **Halaman pasien** dan **daftar booking** hanya memilih kolom identitas. Catatan medis dibaca dengan kueri terpisah, dan hanya untuk peran ber-`record:read`.
- **Tidak ada migrasi.** Kolom `Patient.allergies`, `Patient.medicalHistory`, `Intake.status = DIPERIKSA`, `Intake.reviewedAt`, dan `Intake.reviewedByStaffId` sudah ada sejak Plan 3b-1.

**Tech Stack:** Next.js 15.5 App Router (server actions) · React 19 · Prisma 7.10 + `@prisma/adapter-pg` · PostgreSQL 18 · zod 4 · shadcn/ui · Vitest 4 + Testing Library + user-event · Playwright

**Spec:** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`, bagian **6.2, 6.4, 6.5** dan keputusan **K12**. Tidak termasuk dari 6.5 dan bagian 4: tombol **Kirim form / Kirim ulang / Tampilkan QR**, link WA pribadi, dan alur `MENUNGGU_DIISI`. Semuanya masuk **Plan 3b-2b**.

**Base branch:** `main`. Kerjakan di branch baru `setujui-isian-pasien`.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna, segmen URL (`/admin/pasien`, `/admin/isian`), dan komentar.
- **Zona waktu:** WITA (`Asia/Makassar`, `CLINIC_TIMEZONE`). DateTime disimpan UTC. Tanggal dihitung dengan `src/lib/time.ts` dan ditulis dengan `src/lib/format.ts`.
- **Hak akses (spec 6.2):**
  - "Setujui ke data pasien" hanya untuk `record:write` (Super Admin, Dokter).
  - Catatan medis pasien (`allergies`, `medicalHistory`) dan kolom klinis isian hanya untuk `record:read`.
  - Resepsionis boleh melihat identitas dan **status** isian.
  - Aturan ini ditegakkan di **kueri server**, bukan di tampilan.
- **Isian tidak pernah dihapus, dan jawabannya tidak pernah diubah setelah `TERISI`.** Persetujuan hanya mengubah `status`, `reviewedAt`, dan `reviewedByStaffId`.
- **Tombol persetujuan tidak menyentuh identitas pasien** (nama, WA, tanggal lahir, jenis kelamin, pekerjaan, alamat).
- **Jejak audit tidak memuat isi klinis.** Ringkasannya hanya berisi No. RM dan kode booking.
- **Berkas `"use server"`** hanya boleh mengekspor fungsi `async` (tipe boleh). Setiap ekspornya bisa dipanggil siapa pun dari browser, jadi setiap aksi memeriksa hak dan input sendiri.
- **Halaman di `src/app`** tidak boleh mengimpor `@/lib/db` atau `@prisma/client` (`tests/unit/architecture.test.ts`).
- **Pesan galat untuk pengguna** dikembalikan lewat `runAction` + `UserFacingError`, tidak dilempar sampai ke client.
- **Uji integrasi** berjalan ke `sundy_test` lewat `npm run test:integration`. Jangan menjalankannya bersamaan dengan `npm run test:e2e`.
- **Commit** memakai Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. Stage hanya berkas task itu. **Jangan pernah men-stage** perubahan lokal pemilik di `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`, kecuali di Task 6 dengan cara yang dijelaskan di sana.

## Review Focus

1. **Halaman lama menimpa persetujuan yang lebih baru.** Contohnya dua tab, atau dua dokter pada pasien yang sama. Simpan dengan versi lama harus ditolak dengan pesan "Data pasien baru saja berubah…", dan catatan yang lebih baru tetap utuh → uji di Task 2.
2. **Aksi dipanggil langsung oleh resepsionis** (server action terbuka untuk browser). Aksinya harus ditolak, dan data pasien tidak berubah → uji di Task 2.
3. **Dokter mengosongkan kolom, atau hanya mengetik spasi.** Kolom itu harus tersimpan sebagai kosong (`null`) dan tampil "Belum ada", bukan string spasi → uji di Task 2.
4. **Isian yang sudah diperiksa dibuka lagi.** Isi awal kolom harus sama dengan catatan pasien saat ini, tanpa menambahkan kembali baris usulan yang sudah dihapus dokter → uji di Task 2.
5. **Catatan medis bocor ke resepsionis** lewat objek daftar booking atau halaman pasien. Objeknya tidak boleh memuat `allergies`/`medicalHistory`, walaupun tampilan tidak menampilkannya → uji di Task 3 dan Task 5.

---

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/record-text.ts` (baru) | `mergeRecordText` — menggabungkan catatan lama dengan baris usulan tanpa duplikat |
| `src/lib/kuis/v1/record-proposal.ts` (baru) | `proposeRecordFromAnswers` — usulan teks Alergi dan Riwayat penyakit & obat dari jawaban kuis v1 |
| `src/server/intake.ts` | `IntakeDetail` bertambah `review` dan `approval`; aksi baru `approveIntakeToPatient` |
| `src/lib/format.ts` | `formatDateColumn`, `formatGender` (dipindah dari `intake.ts` agar dipakai halaman pasien juga) |
| `src/server/patient.ts` | `getPatientDetail` dan tipe `PatientDetail` |
| `src/components/admin/patient-detail-view.tsx` (baru) | Tampilan halaman detail pasien |
| `src/app/(admin)/admin/pasien/[id]/page.tsx` (baru) | Rute halaman detail pasien |
| `src/app/(admin)/admin/pasien/page.tsx` | Nama pasien menjadi tautan ke halaman detail |
| `src/components/admin/intake-approval-form.tsx` (baru) | Formulir "Setujui ke data pasien" (client) |
| `src/components/admin/intake-view.tsx` | Tautan ke pasien, baris "Diperiksa oleh…", formulir persetujuan |
| `src/server/appointment.ts` | Filter `intakeStatus`; `patient` di daftar booking hanya kolom identitas |
| `src/components/admin/appointment-table.tsx` | Baris "Isian: …" di kolom Status; nama pasien menjadi tautan |
| `src/components/admin/booking-filters.tsx` | Pilihan "Isian: Semua / Belum diperiksa" |
| `src/app/(admin)/admin/booking/page.tsx` | Mode `?isian=belum-diperiksa` untuk semua tanggal |

---

### Task 1: Usulan catatan medis dari isian

**Files:**
- Create: `src/lib/record-text.ts`
- Create: `src/lib/kuis/v1/record-proposal.ts`
- Test: `tests/unit/record-text.test.ts`, `tests/unit/kuis/record-proposal.test.ts`

**Interfaces:**
- Produces:
  - `mergeRecordText(current: string | null, proposal: string | null): string`
  - `type RecordProposal = { allergies: string | null; medicalHistory: string | null }`
  - `proposeRecordFromAnswers(a: QuizAnswers): RecordProposal`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/record-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeRecordText } from "@/lib/record-text";

describe("mergeRecordText", () => {
  it("memakai usulan bila catatan pasien masih kosong", () => {
    expect(mergeRecordText(null, "Darah tinggi: Amlodipine")).toBe("Darah tinggi: Amlodipine");
  });

  it("menambahkan hanya baris usulan yang belum ada, tanpa peduli huruf besar atau spasi", () => {
    expect(
      mergeRecordText("darah tinggi:  amlodipine", "Darah tinggi: Amlodipine\nDiabetes: tidak minum obat"),
    ).toBe("darah tinggi:  amlodipine\nDiabetes: tidak minum obat");
  });

  it("tidak menambahkan 'Tidak ada' ke catatan yang sudah berisi", () => {
    expect(mergeRecordText("Amoxicillin (gatal-gatal)", "Tidak ada")).toBe("Amoxicillin (gatal-gatal)");
  });

  it("membuang 'Tidak ada' lama begitu ada isi sungguhan", () => {
    expect(mergeRecordText("Tidak ada", "Udang")).toBe("Udang");
  });

  it("mempertahankan 'Tidak ada' bila hanya itu isinya", () => {
    expect(mergeRecordText(null, "Tidak ada")).toBe("Tidak ada");
  });

  it("mengembalikan catatan lama apa adanya bila isian tidak memuat usulan", () => {
    expect(mergeRecordText("Asma\nUdang", null)).toBe("Asma\nUdang");
    expect(mergeRecordText(null, null)).toBe("");
  });
});
```

`tests/unit/kuis/record-proposal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { proposeRecordFromAnswers } from "@/lib/kuis/v1/record-proposal";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
} from "../../fixtures/quiz-answers";

describe("proposeRecordFromAnswers", () => {
  it("menyusun alergi dan riwayat penyakit beserta obat dari kuis lengkap", () => {
    expect(proposeRecordFromAnswers(slimmingNewPatient)).toEqual({
      allergies: "Amoxicillin (gatal-gatal)",
      medicalHistory:
        "Darah tinggi: Amlodipine 5 mg, 1× sehari\nDiabetes: tidak minum obat\nObat/suplemen lain: Vitamin D, pil KB",
    });
  });

  it("menulis 'Tidak ada' untuk jawaban tidak ada", () => {
    expect(proposeRecordFromAnswers(aestheticNewPatient)).toEqual({
      allergies: "Tidak ada",
      medicalHistory: "Tidak ada riwayat penyakit",
    });
  });

  it("pasien lama dengan perubahan kesehatan hanya mengusulkan yang ia isi", () => {
    expect(proposeRecordFromAnswers(slimmingReturningPatient)).toEqual({
      allergies: "Tidak ada",
      medicalHistory: "Darah tinggi: Amlodipine 5 mg, 1× sehari",
    });
  });

  it("pasien lama tanpa perubahan kesehatan tidak mengusulkan apa pun", () => {
    expect(proposeRecordFromAnswers(aestheticReturningPatient)).toEqual({ allergies: null, medicalHistory: null });
  });

  it("memakai nama penyakit lain yang diketik pasien dan menandai obat yang tidak disebutkan", () => {
    expect(
      proposeRecordFromAnswers({
        patientType: "BARU",
        purpose: "SLIMMING",
        health: {
          conditions: ["LAINNYA", "TIROID"],
          conditionOther: "Asma",
          medications: { LAINNYA: { text: "Salbutamol" } },
          otherMeds: { has: false },
          allergies: { has: true },
        },
      }),
    ).toEqual({
      allergies: "Ada alergi (belum dijelaskan pasien)",
      // Urutan mengikuti pilihan pasien: selectedConditions menyaring a.health.conditions apa adanya.
      medicalHistory: "Asma: Salbutamol\nGangguan tiroid: obat tidak disebutkan",
    });
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan gagal**

Run: `npx vitest run tests/unit/record-text.test.ts tests/unit/kuis/record-proposal.test.ts`
Expected: FAIL. Kedua modul belum ada ("Failed to resolve import").

- [ ] **Step 3: Implementasi**

`src/lib/record-text.ts`:

```ts
/** Jawaban "tidak ada" yang tidak perlu ditambahkan ke catatan yang sudah berisi. */
const NONE_LINES = new Set(["tidak ada", "tidak ada riwayat penyakit"]);

function normalize(line: string): string {
  return line.trim().replace(/\s+/g, " ").toLowerCase();
}

function linesOf(text: string | null): string[] {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Isi awal kolom yang disunting dokter: catatan pasien saat ini, ditambah
 * baris usulan yang belum ada di dalamnya. Dokter tetap memutuskan hasil
 * akhirnya (spec 6.4). Fungsi ini hanya mencegah catatan lama tertimpa tanpa
 * sengaja oleh usulan dari satu isian.
 */
export function mergeRecordText(current: string | null, proposal: string | null): string {
  const kept = linesOf(current);
  const seen = new Set(kept.map(normalize));
  for (const line of linesOf(proposal)) {
    const key = normalize(line);
    if (seen.has(key)) continue;
    kept.push(line);
    seen.add(key);
  }
  // "Tidak ada" hanya bermakna bila tidak ada isi lain di catatan itu.
  const meaningful = kept.filter((line) => !NONE_LINES.has(normalize(line)));
  return (meaningful.length > 0 ? meaningful : kept).join("\n");
}
```

`src/lib/kuis/v1/record-proposal.ts`:

```ts
import type { QuizAnswers } from "./answers";
import { conditionName, selectedConditions } from "./steps";

export type RecordProposal = {
  /** null bila isian tidak memuat pertanyaan ini (mis. pasien lama tanpa perubahan kesehatan). */
  allergies: string | null;
  medicalHistory: string | null;
};

/**
 * Usulan teks Alergi dan Riwayat penyakit & obat dari jawaban kuis. Dokter
 * menyuntingnya sebelum masuk ke data pasien (spec 6.4, K12). Berat, tinggi,
 * riwayat diet, dan aktivitas tetap tinggal di isian.
 */
export function proposeRecordFromAnswers(a: QuizAnswers): RecordProposal {
  const h = a.health;
  if (!h) return { allergies: null, medicalHistory: null };

  let allergies: string | null = null;
  if (h.allergies?.has === true) allergies = h.allergies.text?.trim() || "Ada alergi (belum dijelaskan pasien)";
  else if (h.allergies?.has === false) allergies = "Tidak ada";

  const lines: string[] = [];
  const conditions = selectedConditions(a);
  for (const condition of conditions) {
    const medication = h.medications?.[condition];
    const drug = medication?.none ? "tidak minum obat" : medication?.text?.trim() || "obat tidak disebutkan";
    lines.push(`${conditionName(a, condition)}: ${drug}`);
  }
  if (conditions.length === 0 && h.conditions?.includes("TIDAK_ADA")) lines.push("Tidak ada riwayat penyakit");
  if (h.otherMeds?.has) {
    lines.push(`Obat/suplemen lain: ${h.otherMeds.text?.trim() || "belum dijelaskan pasien"}`);
  }

  return { allergies, medicalHistory: lines.length > 0 ? lines.join("\n") : null };
}
```

- [ ] **Step 4: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/record-text.test.ts tests/unit/kuis/record-proposal.test.ts && npx tsc --noEmit`
Expected: semua PASS, tsc bersih.

- [ ] **Step 5: Commit**

```bash
git add src/lib/record-text.ts src/lib/kuis/v1/record-proposal.ts tests/unit/record-text.test.ts tests/unit/kuis/record-proposal.test.ts
git commit -m "feat: propose allergy and medical history text from quiz answers"
```

---

### Task 2: Server — data persetujuan dan aksi "Setujui ke data pasien"

**Files:**
- Modify: `src/server/intake.ts`
- Modify: `tests/unit/components/intake-view.test.tsx` (fixture mengikuti tipe baru)
- Test: `tests/integration/intake-approval.test.ts`

**Interfaces:**
- Consumes (Task 1): `mergeRecordText`, `proposeRecordFromAnswers`, `RecordProposal`.
- Produces:

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

// IntakeDetail berubah:
//   patient: { id: string; name: string; medicalRecordNumber: string } | null;
//   review: { reviewedAt: Date; reviewerName: string } | null;
//   approval: IntakeApproval | null;   // hanya record:write, setelah pasien mengisi kuis

export async function approveIntakeToPatient(input: {
  intakeId: string;
  allergies: string;
  medicalHistory: string;
  patientVersion: string;
}): Promise<ActionResult<void>>;
```

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/intake-approval.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { can } from "@/lib/permissions";
import { approveIntakeToPatient, createPatientFromIntake, getIntakeForStaff, type IntakeDetail } from "@/server/intake";
import { holdSlot, submitSiteBooking } from "@/server/public-booking";
import { requireCapability } from "@/server/session";
import { aestheticNewPatient, newPatientIdentity, slimmingNewPatient } from "../fixtures/quiz-answers";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));
vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "setujui-isian-uji";
const PATIENT_WA = "6281234567890"; // newPatientIdentity yang sudah dinormalkan

describe("setujui isian ke data pasien", () => {
  let world: BookingWorld;
  let date: string;
  let hour = 10;

  /** Meniru requireCapability sungguhan: staf tanpa hak itu ditolak. staffId harus Staff nyata (FK reviewedBy). */
  function actAs(role: StaffRole) {
    vi.mocked(requireCapability).mockImplementation(async (capability) => {
      if (!can(role, capability)) throw new Error(`forbidden: ${capability}`);
      return { userId: "u1", staffId: world.doctorId, name: `${role} Uji`, role, email: "uji@sundy.test" };
    });
  }

  /** Booking situs yang sudah diisi pasien; `match` membuat pasien baru dari isiannya. */
  async function siteIntake(answers: QuizAnswers = slimmingNewPatient, match = true) {
    hour += 1;
    const startAt = at(date, `${hour}:00`).toISOString();
    const { token } = await unwrap(
      holdSlot({ serviceId: world.consultationId, staffId: world.doctorId, branchId: world.branchId, startAt, previousToken: null }),
    );
    await unwrap(
      submitSiteBooking({
        holdToken: token,
        serviceId: world.consultationId,
        staffId: world.doctorId,
        branchId: world.branchId,
        startAt,
        answers,
        identity: newPatientIdentity,
        consentData: true,
        consentFee: true,
        website: "",
      }),
    );
    const intake = await prisma.intake.findFirstOrThrow({
      where: { submissionKey: token },
      select: { id: true, appointmentId: true },
    });
    const patientId = match ? (await unwrap(createPatientFromIntake(intake.appointmentId))).patientId : null;
    return { intakeId: intake.id, patientId };
  }

  function ready(detail: IntakeDetail | null) {
    if (detail?.approval?.state !== "ready") throw new Error(`approval: ${JSON.stringify(detail?.approval)}`);
    return detail.approval;
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("dokter melihat usulan berdampingan dengan catatan pasien saat ini", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    await prisma.patient.update({ where: { id: patientId! }, data: { allergies: "Udang" } });

    const approval = ready(await getIntakeForStaff(intakeId));

    expect(approval.current).toEqual({ allergies: "Udang", medicalHistory: null });
    expect(approval.proposed.allergies).toBe("Amoxicillin (gatal-gatal)");
    expect(approval.prefill.allergies).toBe("Udang\nAmoxicillin (gatal-gatal)");
    expect(approval.prefill.medicalHistory).toContain("Darah tinggi: Amlodipine 5 mg, 1× sehari");
  });

  it("menyimpan suntingan dokter, menandai isian diperiksa, dan mencatat audit tanpa isi klinis", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const approval = ready(await getIntakeForStaff(intakeId));

    await unwrap(
      approveIntakeToPatient({
        intakeId,
        allergies: "Amoxicillin (gatal-gatal)",
        medicalHistory: "Darah tinggi: Amlodipine 5 mg, 1× sehari",
        patientVersion: approval.patientVersion,
      }),
    );

    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } });
    expect(patient).toMatchObject({
      allergies: "Amoxicillin (gatal-gatal)",
      medicalHistory: "Darah tinggi: Amlodipine 5 mg, 1× sehari",
      name: "Siti Rahayu",
    });
    const intake = await prisma.intake.findUniqueOrThrow({ where: { id: intakeId } });
    expect(intake.status).toBe("DIPERIKSA");
    expect(intake.reviewedByStaffId).toBe(world.doctorId);
    expect(intake.reviewedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.approve-intake", entityId: patientId! } });
    expect(audit.summary).toContain(patient.medicalRecordNumber);
    expect(audit.summary).not.toMatch(/Amoxicillin|Amlodipine/);

    const detail = await getIntakeForStaff(intakeId);
    expect(detail!.review?.reviewerName).toBe("dr. Uji Publik");
  });

  it("isian yang sudah diperiksa: isi awal sama dengan catatan pasien, usulan tetap ditampilkan", async () => {
    actAs("DOKTER");
    const { intakeId } = await siteIntake();
    const first = ready(await getIntakeForStaff(intakeId));
    await unwrap(
      approveIntakeToPatient({
        intakeId,
        allergies: "Amoxicillin (gatal-gatal)",
        medicalHistory: "Darah tinggi: Amlodipine 5 mg, 1× sehari",
        patientVersion: first.patientVersion,
      }),
    );

    const again = ready(await getIntakeForStaff(intakeId));

    expect(again.prefill.medicalHistory).toBe("Darah tinggi: Amlodipine 5 mg, 1× sehari");
    expect(again.proposed.medicalHistory).toContain("Diabetes: tidak minum obat");
  });

  it("menolak simpan dari halaman lama agar persetujuan yang lebih baru tidak tertimpa", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const stale = ready(await getIntakeForStaff(intakeId)).patientVersion;
    await unwrap(approveIntakeToPatient({ intakeId, allergies: "Baru", medicalHistory: "Baru", patientVersion: stale }));

    const result = await approveIntakeToPatient({ intakeId, allergies: "Lama", medicalHistory: "Lama", patientVersion: stale });

    expect(result).toEqual({ ok: false, error: "Data pasien baru saja berubah. Muat ulang halaman lalu periksa lagi." });
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({ allergies: "Baru" });
  });

  it("kolom yang dikosongkan atau hanya berisi spasi tersimpan sebagai kosong", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake(aestheticNewPatient);
    const approval = ready(await getIntakeForStaff(intakeId));

    await unwrap(approveIntakeToPatient({ intakeId, allergies: "   ", medicalHistory: "", patientVersion: approval.patientVersion }));

    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({
      allergies: null,
      medicalHistory: null,
    });
  });

  it("menolak teks lebih dari 2.000 karakter tanpa mengubah apa pun", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const approval = ready(await getIntakeForStaff(intakeId));

    const result = await approveIntakeToPatient({
      intakeId,
      allergies: "x".repeat(2001),
      medicalHistory: "",
      patientVersion: approval.patientVersion,
    });

    expect(result).toEqual({ ok: false, error: "Teks alergi atau riwayat penyakit terlalu panjang (maks. 2.000 karakter)." });
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({ allergies: null });
    expect((await prisma.intake.findUniqueOrThrow({ where: { id: intakeId } })).status).toBe("TERISI");
  });

  it("booking yang belum dicocokkan: minta dicocokkan dulu, dan aksinya ditolak", async () => {
    actAs("DOKTER");
    const { intakeId } = await siteIntake(slimmingNewPatient, false);

    expect((await getIntakeForStaff(intakeId))!.approval).toEqual({ state: "needs-match" });
    expect(
      await approveIntakeToPatient({ intakeId, allergies: "A", medicalHistory: "B", patientVersion: new Date().toISOString() }),
    ).toEqual({ ok: false, error: "Cocokkan booking ini dengan pasien dulu." });
  });

  it("resepsionis tidak menerima data persetujuan dan tidak bisa memanggil aksinya", async () => {
    actAs("DOKTER");
    const { intakeId, patientId } = await siteIntake();
    const version = ready(await getIntakeForStaff(intakeId)).patientVersion;

    actAs("RESEPSIONIS");
    const detail = await getIntakeForStaff(intakeId);
    expect(detail!.approval).toBeNull();
    expect(JSON.stringify(detail)).not.toMatch(/Amoxicillin|Amlodipine/);
    await expect(
      approveIntakeToPatient({ intakeId, allergies: "A", medicalHistory: "B", patientVersion: version }),
    ).rejects.toThrow("forbidden");
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId! } })).toMatchObject({ allergies: null });
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan gagal**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/intake-approval.test.ts`
Expected: FAIL. `approveIntakeToPatient` belum diekspor, dan `approval` belum ada.

- [ ] **Step 3: Implementasi di `src/server/intake.ts`**

Tambahkan impor:

```ts
import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { proposeRecordFromAnswers, type RecordProposal } from "@/lib/kuis/v1/record-proposal";
import { mergeRecordText } from "@/lib/record-text";
```

Ganti tipe `IntakeDetail` dengan:

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

export type IntakeDetail = {
  id: string;
  status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA";
  kind: "LENGKAP" | "PENDEK";
  purposeLabel: string | null;
  submittedAt: Date | null;
  appointment: { code: string; startAt: Date; serviceName: string; staffName: string };
  patient: { id: string; name: string; medicalRecordNumber: string } | null;
  review: { reviewedAt: Date; reviewerName: string } | null;
  identity: {
    name: string | null;
    whatsapp: string | null;
    birthDateLabel: string | null;
    genderLabel: string | null;
    occupation: string | null;
    address: string | null;
  };
  /** null untuk peran tanpa record:read, atau bila pasien belum mengisi. */
  clinical: {
    sections: IntakeSection[];
    activities: ActivityRow[] | null;
    activityDateLabel: string | null;
  } | null;
  /** Hanya untuk record:write, setelah pasien mengisi kuis (spec 6.4). */
  approval: IntakeApproval | null;
};
```

Ganti `loadClinical` sehingga jawaban yang sudah diurai ikut dikembalikan:

```ts
/** Kolom klinis dibaca dengan kueri terpisah, hanya untuk yang berhak (spec 6.2). */
async function loadClinical(
  intakeId: string,
): Promise<{ clinical: NonNullable<IntakeDetail["clinical"]>; answers: QuizAnswers } | null> {
  const row = await prisma.intake.findUniqueOrThrow({
    where: { id: intakeId },
    select: { quizVersion: true, answers: true, selfWeightKg: true, selfHeightCm: true, activityDate: true },
  });
  if (row.answers === null) return null;
  if (row.quizVersion !== QUIZ_VERSION) {
    throw new Error(`Isian dengan kuis versi ${row.quizVersion} belum bisa ditampilkan.`);
  }

  const answers = quizAnswersSchema.parse(row.answers);
  // Berat & tinggi disimpan di kolom bertipe, bukan di JSON (spec 5.1).
  if (answers.slimming && row.selfWeightKg !== null && row.selfHeightCm !== null) {
    answers.slimming.weightKg = Number(row.selfWeightKg);
    answers.slimming.heightCm = Number(row.selfHeightCm);
  }

  return {
    answers,
    clinical: {
      // Aktivitas tampil sebagai tabel 06.00–22.00, bukan daftar baris.
      sections: describeAnswers(answers).filter((section) => section.step !== "P3"),
      activities: answers.returning?.activities ? activityTable(answers.returning.activities) : null,
      activityDateLabel: row.activityDate ? formatIndonesianDate(row.activityDate) : null,
    },
  };
}

/**
 * Usulan berdampingan dengan catatan pasien saat ini (spec 6.4). Isian yang
 * sudah diperiksa tidak menggabungkan usulan lagi: baris yang sengaja dihapus
 * dokter tidak boleh muncul kembali.
 */
async function loadApproval(patientId: string, answers: QuizAnswers, reviewed: boolean): Promise<IntakeApproval> {
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { allergies: true, medicalHistory: true, updatedAt: true },
  });
  const proposed = proposeRecordFromAnswers(answers);
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

Di `getIntakeForStaff`:
- tambahkan ke `select`: `reviewedAt: true`, `reviewedBy: { select: { name: true } }`;
- ubah `patient: { select: { name: true, medicalRecordNumber: true } }` menjadi `patient: { select: { id: true, name: true, medicalRecordNumber: true } }`;
- ganti bagian akhir (`if (!row) return null;` sampai `return {...}`) dengan:

```ts
  if (!row) return null;

  const loaded = can(staff.role, "record:read") ? await loadClinical(row.id) : null;
  let approval: IntakeApproval | null = null;
  if (loaded && can(staff.role, "record:write")) {
    approval = row.patient
      ? await loadApproval(row.patient.id, loaded.answers, row.status === "DIPERIKSA")
      : { state: "needs-match" };
  }

  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    purposeLabel: row.purpose ? PURPOSES[row.purpose] : null,
    submittedAt: row.submittedAt,
    appointment: {
      code: row.appointment.code,
      startAt: row.appointment.startAt,
      serviceName: row.appointment.service?.name ?? "Konsultasi",
      staffName: row.appointment.staff.name,
    },
    patient: row.patient,
    review: row.reviewedAt && row.reviewedBy ? { reviewedAt: row.reviewedAt, reviewerName: row.reviewedBy.name } : null,
    identity: {
      name: row.name,
      whatsapp: row.whatsapp,
      birthDateLabel: dateLabel(row.birthDate),
      genderLabel: row.gender === "P" ? "Perempuan" : row.gender === "L" ? "Laki-laki" : null,
      occupation: row.occupation,
      address: row.address,
    },
    clinical: loaded?.clinical ?? null,
    approval,
  };
```

Tambahkan aksi baru di akhir berkas:

```ts
/** Batas panjang teks catatan medis yang disunting dokter. */
const RECORD_TEXT_MAX = 2000;

/**
 * Setujui ke data pasien (spec 6.4, K12). Mengganti catatan Alergi dan
 * Riwayat penyakit & obat pasien dengan teks yang disunting dokter, lalu
 * menandai isian DIPERIKSA. Identitas pasien dan jawaban isian tidak disentuh.
 */
export async function approveIntakeToPatient(input: {
  intakeId: string;
  allergies: string;
  medicalHistory: string;
  patientVersion: string;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const allergies = String(input.allergies ?? "").trim();
    const medicalHistory = String(input.medicalHistory ?? "").trim();
    if (allergies.length > RECORD_TEXT_MAX || medicalHistory.length > RECORD_TEXT_MAX) {
      throw new UserFacingError("Teks alergi atau riwayat penyakit terlalu panjang (maks. 2.000 karakter).");
    }
    const version = new Date(String(input.patientVersion ?? ""));
    if (Number.isNaN(version.getTime())) throw new UserFacingError("Muat ulang halaman lalu coba lagi.");

    const intake = await prisma.intake.findUnique({
      where: { id: String(input.intakeId ?? "") },
      select: {
        id: true,
        status: true,
        patientId: true,
        appointment: { select: { code: true } },
        patient: { select: { medicalRecordNumber: true } },
      },
    });
    if (!intake) throw new UserFacingError("Isian tidak ditemukan.");
    if (intake.status === "MENUNGGU_DIISI") throw new UserFacingError("Pasien belum mengisi kuis.");
    if (!intake.patientId || !intake.patient) throw new UserFacingError("Cocokkan booking ini dengan pasien dulu.");
    const patientId = intake.patientId;

    await prisma.$transaction(async (tx) => {
      // Hanya bila catatan pasien belum berubah sejak halaman dibuka: persetujuan
      // dari halaman lama tidak boleh menimpa persetujuan yang lebih baru.
      const { count } = await tx.patient.updateMany({
        where: { id: patientId, updatedAt: version },
        data: { allergies: allergies || null, medicalHistory: medicalHistory || null },
      });
      if (count === 0) {
        throw new UserFacingError("Data pasien baru saja berubah. Muat ulang halaman lalu periksa lagi.");
      }
      await tx.intake.update({
        where: { id: intake.id },
        data: { status: "DIPERIKSA", reviewedAt: new Date(), reviewedByStaffId: actor.staffId },
      });
    });

    // Tanpa isi klinis: jejak audit untuk menelusuri siapa dan kapan, bukan apa.
    await recordAudit({
      actor,
      action: "patient.approve-intake",
      entity: "Patient",
      entityId: patientId,
      summary: `${intake.patient.medicalRecordNumber}: alergi & riwayat penyakit dari isian ${intake.appointment.code}`,
    });
    safeRevalidatePath(`/admin/isian/${intake.id}`);
    safeRevalidatePath(`/admin/pasien/${patientId}`);
    safeRevalidatePath("/admin/booking");
  });
}
```

Di `tests/unit/components/intake-view.test.tsx`, tambahkan dua kolom baru ke objek `intake` (setelah `patient: null,`):

```ts
  review: null,
  approval: null,
```

- [ ] **Step 4: Jalankan uji dan pastikan lulus**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/intake-approval.test.ts tests/integration/intake-access.test.ts && npx vitest run tests/unit/components/intake-view.test.tsx && npx tsc --noEmit`
Expected: semua PASS, tsc bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/intake.ts tests/integration/intake-approval.test.ts tests/unit/components/intake-view.test.tsx
git commit -m "feat: let doctors approve an intake into the patient's allergies and history"
```

---

### Task 3: Halaman detail pasien

**Files:**
- Modify: `src/lib/format.ts`, `src/server/intake.ts` (memakai helper yang dipindah)
- Modify: `src/server/patient.ts`
- Create: `src/components/admin/patient-detail-view.tsx`
- Create: `src/app/(admin)/admin/pasien/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/pasien/page.tsx`
- Test: `tests/unit/format.test.ts`, `tests/integration/patient-detail.test.ts`, `tests/unit/components/patient-detail-view.test.tsx`

**Interfaces:**
- Produces:

```ts
// src/lib/format.ts
export function formatDateColumn(date: Date | null): string | null;   // @db.Date → "17/04/1992"
export function formatGender(gender: "L" | "P" | null): string | null;

// src/server/patient.ts
export type PatientDetail = {
  id: string;
  medicalRecordNumber: string;
  name: string;
  whatsapp: string;
  birthDateLabel: string | null;
  genderLabel: string | null;
  occupation: string | null;
  address: string | null;
  programStatus: "AKTIF" | "SELESAI" | "TIDAK_AKTIF";
  /** Hanya untuk record:read (spec 6.2). */
  record: { allergies: string | null; medicalHistory: string | null } | null;
  appointments: {
    id: string;
    code: string;
    startAt: Date;
    status: AppointmentStatusValue;
    serviceName: string;
    staffName: string;
    branchName: string;
  }[];
  intakes: {
    id: string;
    code: string;
    submittedAt: Date | null;
    status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA";
    kind: "LENGKAP" | "PENDEK";
    purposeLabel: string | null;
    reviewerName: string | null;
    reviewedAt: Date | null;
  }[];
};
export async function getPatientDetail(id: string): Promise<PatientDetail | null>;
```

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan ke `tests/unit/format.test.ts` (impor `formatDateColumn, formatGender` dari `@/lib/format`):

```ts
describe("formatDateColumn", () => {
  it("menulis kolom tanggal sebagai hari/bulan/tahun tanpa bergeser zona waktu", () => {
    expect(formatDateColumn(new Date("1992-04-17T00:00:00Z"))).toBe("17/04/1992");
    expect(formatDateColumn(null)).toBeNull();
  });
});

describe("formatGender", () => {
  it("menerjemahkan kode jenis kelamin", () => {
    expect(formatGender("P")).toBe("Perempuan");
    expect(formatGender("L")).toBe("Laki-laki");
    expect(formatGender(null)).toBeNull();
  });
});
```

`tests/integration/patient-detail.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysToDateString } from "@/lib/time";
import { getPatientDetail } from "@/server/patient";
import { requireCapability } from "@/server/session";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));

const SLUG = "detail-pasien-uji";
const PATIENT_WA = "6281200006640";

function actAs(role: StaffRole) {
  vi.mocked(requireCapability).mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: `${role} Uji`,
    role,
    email: "uji@sundy.test",
  });
}

describe("detail pasien", () => {
  let world: BookingWorld;
  let patientId: string;
  let firstId: string;
  let secondId: string;

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    const date = await bookableDate();
    patientId = (
      await prisma.patient.create({
        data: {
          medicalRecordNumber: "SDY-2026-6640",
          name: "Pasien Detail",
          whatsapp: PATIENT_WA,
          birthDate: new Date("1990-01-02T00:00:00Z"),
          gender: "P",
          allergies: "Amoxicillin",
          medicalHistory: "Darah tinggi: Amlodipine",
        },
      })
    ).id;
    const booking = (code: string, day: string, time: string, status: "TERKONFIRMASI" | "MENUNGGU_KONFIRMASI") =>
      prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          startAt: at(day, time),
          endAt: new Date(at(day, time).getTime() + 30 * 60_000),
          source: "SITUS",
          status,
          branchId: world.branchId,
          staffId: world.doctorId,
          serviceId: world.consultationId,
          patientId,
        },
      });
    firstId = (await booking("DTL-1", date, "11:00", "TERKONFIRMASI")).id;
    secondId = (await booking("DTL-2", addDaysToDateString(date, 2), "12:00", "MENUNGGU_KONFIRMASI")).id;
    const intake = (appointmentId: string, status: "TERISI" | "DIPERIKSA") =>
      prisma.intake.create({
        data: {
          appointmentId,
          patientId,
          status,
          kind: "LENGKAP",
          purpose: "SLIMMING",
          quizVersion: 1,
          answers: { patientType: "BARU", purpose: "SLIMMING", health: { conditions: ["DARAH_TINGGI"], medications: { DARAH_TINGGI: { text: "Amlodipine" } } } },
          name: "Pasien Detail",
          whatsapp: PATIENT_WA,
          submittedAt: new Date(),
          ...(status === "DIPERIKSA" ? { reviewedAt: new Date(), reviewedByStaffId: world.doctorId } : {}),
        },
      });
    await intake(firstId, "DIPERIKSA");
    await intake(secondId, "TERISI");
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("dokter melihat catatan medis, booking terbaru di atas, dan riwayat isian beserta pemeriksanya", async () => {
    actAs("DOKTER");
    const detail = await getPatientDetail(patientId);

    expect(detail).toMatchObject({
      medicalRecordNumber: "SDY-2026-6640",
      birthDateLabel: "02/01/1990",
      genderLabel: "Perempuan",
      record: { allergies: "Amoxicillin", medicalHistory: "Darah tinggi: Amlodipine" },
    });
    expect(detail!.appointments.map((a) => a.id)).toEqual([secondId, firstId]);
    expect(detail!.appointments[1]).toMatchObject({ code: "DTL-1", serviceName: "Konsultasi Dokter", staffName: "dr. Uji Publik" });
    const reviewed = detail!.intakes.find((i) => i.code === "DTL-1");
    expect(reviewed).toMatchObject({ status: "DIPERIKSA", reviewerName: "dr. Uji Publik", purposeLabel: "Slimming" });
  });

  it("resepsionis melihat identitas dan riwayat, tanpa catatan medis maupun jawaban kuis", async () => {
    actAs("RESEPSIONIS");
    const detail = await getPatientDetail(patientId);

    expect(detail!.record).toBeNull();
    expect(detail!.name).toBe("Pasien Detail");
    expect(detail!.intakes).toHaveLength(2);
    expect(JSON.stringify(detail)).not.toMatch(/Amoxicillin|Amlodipine/);
  });

  it("mengembalikan null untuk pasien yang tidak ada", async () => {
    actAs("DOKTER");
    expect(await getPatientDetail("tidak-ada")).toBeNull();
  });
});
```

`tests/unit/components/patient-detail-view.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientDetailView } from "@/components/admin/patient-detail-view";
import type { PatientDetail } from "@/server/patient";

const patient: PatientDetail = {
  id: "p1",
  medicalRecordNumber: "SDY-2026-0001",
  name: "Siti Rahayu",
  whatsapp: "6281234567890",
  birthDateLabel: "17/04/1992",
  genderLabel: "Perempuan",
  occupation: "Guru",
  address: "Jl. Sam Ratulangi",
  programStatus: "AKTIF",
  record: { allergies: "Amoxicillin", medicalHistory: null },
  appointments: [
    {
      id: "a1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-07T05:00:00Z"),
      status: "TERKONFIRMASI",
      serviceName: "Konsultasi Dokter",
      staffName: "Dr. Diane",
      branchName: "SunDY Mahakeret",
    },
  ],
  intakes: [
    {
      id: "i1",
      code: "SDY-8F3K",
      submittedAt: new Date("2026-10-01T02:00:00Z"),
      status: "DIPERIKSA",
      kind: "LENGKAP",
      purposeLabel: "Slimming",
      reviewerName: "Dr. Diane",
      reviewedAt: new Date("2026-10-02T02:00:00Z"),
    },
  ],
};

describe("PatientDetailView", () => {
  it("menampilkan catatan medis dan tautan isian untuk pembaca rekam medis", () => {
    render(<PatientDetailView patient={patient} canReadRecords />);
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText("Belum ada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    expect(screen.getByText(/Diperiksa · Dr\. Diane/)).toBeInTheDocument();
  });

  it("tanpa hak rekam medis: tanpa catatan medis dan tanpa tautan isian", () => {
    render(<PatientDetailView patient={{ ...patient, record: null }} canReadRecords={false} />);
    expect(screen.queryByRole("heading", { name: "Catatan medis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lihat isian" })).not.toBeInTheDocument();
    // Kode booking tampil di riwayat booking dan riwayat isian.
    expect(screen.getAllByText("SDY-8F3K")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan gagal**

Run: `npx vitest run tests/unit/format.test.ts tests/unit/components/patient-detail-view.test.tsx && npx vitest run --config vitest.integration.config.mts tests/integration/patient-detail.test.ts`
Expected: FAIL. `formatDateColumn`, `PatientDetailView`, dan `getPatientDetail` belum ada.

- [ ] **Step 3: Implementasi**

Tambahkan ke akhir `src/lib/format.ts`:

```ts
/** Kolom @db.Date (tanggal tanpa jam) → "17/04/1992". Dibaca dari UTC agar tidak bergeser. */
export function formatDateColumn(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10).split("-").reverse().join("/") : null;
}

/** Kode jenis kelamin di basis data → label. */
export function formatGender(gender: "L" | "P" | null): string | null {
  return gender === "P" ? "Perempuan" : gender === "L" ? "Laki-laki" : null;
}
```

Di `src/server/intake.ts`:
- hapus fungsi lokal `dateLabel`;
- ubah impor `formatIndonesianDate` menjadi `import { formatDateColumn, formatGender, formatIndonesianDate } from "@/lib/format";`;
- ganti setiap `dateLabel(` dengan `formatDateColumn(`;
- ganti `row.gender === "P" ? "Perempuan" : row.gender === "L" ? "Laki-laki" : null` dengan `formatGender(row.gender)`.

Tambahkan ke `src/server/patient.ts`:

```ts
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import { formatDateColumn, formatGender } from "@/lib/format";
import { PURPOSES } from "@/lib/kuis/v1/options";
import { can } from "@/lib/permissions";
```

```ts
export type PatientDetail = {
  id: string;
  medicalRecordNumber: string;
  name: string;
  whatsapp: string;
  birthDateLabel: string | null;
  genderLabel: string | null;
  occupation: string | null;
  address: string | null;
  programStatus: "AKTIF" | "SELESAI" | "TIDAK_AKTIF";
  /** Hanya untuk record:read (spec 6.2). */
  record: { allergies: string | null; medicalHistory: string | null } | null;
  appointments: {
    id: string;
    code: string;
    startAt: Date;
    status: AppointmentStatusValue;
    serviceName: string;
    staffName: string;
    branchName: string;
  }[];
  intakes: {
    id: string;
    code: string;
    submittedAt: Date | null;
    status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA";
    kind: "LENGKAP" | "PENDEK";
    purposeLabel: string | null;
    reviewerName: string | null;
    reviewedAt: Date | null;
  }[];
};

/**
 * Identitas, riwayat booking, dan riwayat isian satu pasien (spec 6.5).
 * Catatan medis dibaca dengan kueri terpisah hanya untuk record:read; jawaban
 * kuis tidak pernah dipilih di sini — dokter membukanya di halaman isian.
 */
export async function getPatientDetail(id: string): Promise<PatientDetail | null> {
  const staff = await requireCapability("booking:manage");
  const patient = await prisma.patient.findUnique({
    where: { id },
    select: {
      id: true,
      medicalRecordNumber: true,
      name: true,
      whatsapp: true,
      birthDate: true,
      gender: true,
      occupation: true,
      address: true,
      programStatus: true,
      appointments: {
        orderBy: { startAt: "desc" },
        select: {
          id: true,
          code: true,
          type: true,
          startAt: true,
          status: true,
          service: { select: { name: true } },
          staff: { select: { name: true } },
          branch: { select: { name: true } },
        },
      },
      intakes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          kind: true,
          purpose: true,
          submittedAt: true,
          reviewedAt: true,
          reviewedBy: { select: { name: true } },
          appointment: { select: { code: true } },
        },
      },
    },
  });
  if (!patient) return null;

  const record = can(staff.role, "record:read")
    ? await prisma.patient.findUniqueOrThrow({ where: { id }, select: { allergies: true, medicalHistory: true } })
    : null;

  return {
    id: patient.id,
    medicalRecordNumber: patient.medicalRecordNumber,
    name: patient.name,
    whatsapp: patient.whatsapp,
    birthDateLabel: formatDateColumn(patient.birthDate),
    genderLabel: formatGender(patient.gender),
    occupation: patient.occupation,
    address: patient.address,
    programStatus: patient.programStatus,
    record,
    appointments: patient.appointments.map((a) => ({
      id: a.id,
      code: a.code,
      startAt: a.startAt,
      status: a.status,
      serviceName: a.service?.name ?? (a.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
      staffName: a.staff.name,
      branchName: a.branch.name,
    })),
    intakes: patient.intakes.map((intake) => ({
      id: intake.id,
      code: intake.appointment.code,
      submittedAt: intake.submittedAt,
      status: intake.status,
      kind: intake.kind,
      purposeLabel: intake.purpose ? PURPOSES[intake.purpose] : null,
      reviewerName: intake.reviewedBy?.name ?? null,
      reviewedAt: intake.reviewedAt,
    })),
  };
}
```

`src/components/admin/patient-detail-view.tsx`:

```tsx
import Link from "next/link";
import { AppointmentStatusBadge } from "@/components/admin/appointment-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { PatientDetail } from "@/server/patient";

const PROGRAM_STATUS_LABEL: Record<PatientDetail["programStatus"], string> = {
  AKTIF: "Aktif",
  SELESAI: "Selesai",
  TIDAK_AKTIF: "Tidak aktif",
};

const INTAKE_STATUS_LABEL: Record<PatientDetail["intakes"][number]["status"], string> = {
  MENUNGGU_DIISI: "Belum diisi",
  TERISI: "Belum diperiksa",
  DIPERIKSA: "Diperiksa",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

export function PatientDetailView({ patient, canReadRecords }: { patient: PatientDetail; canReadRecords: boolean }) {
  return (
    <div className="max-w-4xl space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">{patient.name}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Field label="No. RM" value={patient.medicalRecordNumber} />
          <Field label="WhatsApp" value={patient.whatsapp} />
          <Field label="Tanggal lahir" value={patient.birthDateLabel} />
          <Field label="Jenis kelamin" value={patient.genderLabel} />
          <Field label="Pekerjaan" value={patient.occupation} />
          <Field label="Status program" value={PROGRAM_STATUS_LABEL[patient.programStatus]} />
          <Field label="Alamat" value={patient.address} />
        </dl>
      </section>

      {patient.record && (
        <section aria-labelledby="catatan-medis" className="space-y-3 rounded-lg border p-4">
          <h2 id="catatan-medis" className="text-base font-medium">
            Catatan medis
          </h2>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="text-xs text-muted-foreground">Alergi</h3>
              <p className="whitespace-pre-line">{patient.record.allergies ?? "Belum ada"}</p>
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground">Riwayat penyakit & obat</h3>
              <p className="whitespace-pre-line">{patient.record.medicalHistory ?? "Belum ada"}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Diisi dokter lewat tombol “Setujui ke data pasien” di halaman isian.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-medium">Riwayat booking</h2>
        {patient.appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada booking.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jadwal</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead>Layanan</TableHead>
                <TableHead>Tenaga</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patient.appointments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {formatIndonesianDate(a.startAt)}, {minutesToTimeLabel(witaMinutesOfDay(a.startAt))}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell>{a.serviceName}</TableCell>
                  <TableCell>
                    <div>{a.staffName}</div>
                    <div className="text-xs text-muted-foreground">{a.branchName}</div>
                  </TableCell>
                  <TableCell>
                    <AppointmentStatusBadge status={a.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium">Riwayat isian</h2>
        {patient.intakes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada isian.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dikirim</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Kuis</TableHead>
                <TableHead>Status</TableHead>
                {canReadRecords && <TableHead>Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {patient.intakes.map((intake) => (
                <TableRow key={intake.id}>
                  <TableCell>{intake.submittedAt ? formatIndonesianDate(intake.submittedAt) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{intake.code}</TableCell>
                  <TableCell>
                    {intake.kind === "LENGKAP" ? "Lengkap" : "Pendek"}
                    {intake.purposeLabel ? ` · ${intake.purposeLabel}` : ""}
                  </TableCell>
                  <TableCell>
                    {INTAKE_STATUS_LABEL[intake.status]}
                    {intake.reviewerName ? ` · ${intake.reviewerName}` : ""}
                  </TableCell>
                  {canReadRecords && (
                    <TableCell>
                      <Link href={`/admin/isian/${intake.id}`} className="text-sm underline underline-offset-4">
                        Lihat isian
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
```

`src/app/(admin)/admin/pasien/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PatientDetailView } from "@/components/admin/patient-detail-view";
import { can } from "@/lib/permissions";
import { getPatientDetail } from "@/server/patient";
import { requireCapability } from "@/server/session";

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("booking:manage");
  const { id } = await params;
  const patient = await getPatientDetail(id);
  if (!patient) notFound();

  return (
    <>
      <AdminHeader title="Data Pasien" />
      <div className="p-6">
        <PatientDetailView patient={patient} canReadRecords={can(staff.role, "record:read")} />
      </div>
    </>
  );
}
```

Di `src/app/(admin)/admin/pasien/page.tsx`:
- tambahkan `import Link from "next/link";`;
- ganti `<TableCell className="font-medium">{p.name}</TableCell>` dengan:

```tsx
                    <TableCell className="font-medium">
                      <Link href={`/admin/pasien/${p.id}`} className="underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
```

- [ ] **Step 4: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/format.test.ts tests/unit/components/patient-detail-view.test.tsx && npx vitest run --config vitest.integration.config.mts tests/integration/patient-detail.test.ts tests/integration/intake-access.test.ts tests/integration/intake-approval.test.ts && npx tsc --noEmit && npm run lint`
Expected: semua PASS; tsc dan lint bersih. Uji `architecture.test.ts` juga harus tetap lulus (`npm test`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/server/intake.ts src/server/patient.ts src/components/admin/patient-detail-view.tsx "src/app/(admin)/admin/pasien" tests/unit/format.test.ts tests/unit/components/patient-detail-view.test.tsx tests/integration/patient-detail.test.ts
git commit -m "feat: patient page with medical notes, booking history and intake history"
```

---

### Task 4: Formulir "Setujui ke data pasien" di halaman isian

**Files:**
- Create: `src/components/admin/intake-approval-form.tsx`
- Modify: `src/components/admin/intake-view.tsx`
- Test: `tests/unit/components/intake-approval-form.test.tsx`, `tests/unit/components/intake-view.test.tsx`

**Interfaces:**
- Consumes (Task 2): `approveIntakeToPatient`, `IntakeApproval`, `IntakeDetail.review`, `IntakeDetail.approval`, `IntakeDetail.patient.id`.
- Produces: `IntakeApprovalForm({ intakeId, approval })`, dengan `approval` bertipe `Extract<IntakeApproval, { state: "ready" }>`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/intake-approval-form.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { IntakeApprovalForm } from "@/components/admin/intake-approval-form";
import { approveIntakeToPatient } from "@/server/intake";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/intake", () => ({ approveIntakeToPatient: vi.fn() }));

const approval = {
  state: "ready" as const,
  patientId: "p1",
  patientVersion: "2026-10-01T02:00:00.000Z",
  current: { allergies: "Udang", medicalHistory: null },
  proposed: { allergies: "Amoxicillin", medicalHistory: "Darah tinggi: Amlodipine" },
  prefill: { allergies: "Udang\nAmoxicillin", medicalHistory: "Darah tinggi: Amlodipine" },
};

describe("IntakeApprovalForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("menampilkan catatan saat ini, usulan, dan isi awal kolom sunting", () => {
    render(<IntakeApprovalForm intakeId="i1" approval={approval} />);
    expect(screen.getByText("Udang")).toBeInTheDocument();
    expect(screen.getAllByText("(kosong)")).toHaveLength(1);
    expect(screen.getByLabelText("Alergi")).toHaveValue("Udang\nAmoxicillin");
    expect(screen.getByLabelText("Riwayat penyakit & obat")).toHaveValue("Darah tinggi: Amlodipine");
  });

  it("mengirim teks yang disunting beserta versi pasien, lalu memuat ulang halaman", async () => {
    vi.mocked(approveIntakeToPatient).mockResolvedValue({ ok: true, data: undefined });
    render(<IntakeApprovalForm intakeId="i1" approval={approval} />);
    const history = screen.getByLabelText("Riwayat penyakit & obat");
    await userEvent.clear(history);
    await userEvent.type(history, "Darah tinggi: Amlodipine (kontrol)");
    await userEvent.click(screen.getByRole("button", { name: "Setujui ke data pasien" }));

    await waitFor(() =>
      expect(approveIntakeToPatient).toHaveBeenCalledWith({
        intakeId: "i1",
        allergies: "Udang\nAmoxicillin",
        medicalHistory: "Darah tinggi: Amlodipine (kontrol)",
        patientVersion: "2026-10-01T02:00:00.000Z",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Data pasien diperbarui.");
    expect(refresh).toHaveBeenCalled();
  });

  it("menampilkan pesan galat dari server tanpa memuat ulang", async () => {
    vi.mocked(approveIntakeToPatient).mockResolvedValue({
      ok: false,
      error: "Data pasien baru saja berubah. Muat ulang halaman lalu periksa lagi.",
    });
    render(<IntakeApprovalForm intakeId="i1" approval={approval} />);
    await userEvent.click(screen.getByRole("button", { name: "Setujui ke data pasien" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Data pasien baru saja berubah. Muat ulang halaman lalu periksa lagi."),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

Tambahkan ke `tests/unit/components/intake-view.test.tsx`:

```tsx
  it("menampilkan siapa yang memeriksa dan tautan ke data pasien", () => {
    render(
      <IntakeView
        intake={{
          ...intake,
          status: "DIPERIKSA",
          patient: { id: "p1", name: "Siti Rahayu", medicalRecordNumber: "SDY-2026-0001" },
          review: { reviewedAt: new Date("2026-10-01T02:00:00Z"), reviewerName: "Dr. Diane" },
        }}
      />,
    );
    expect(screen.getByText(/Diperiksa oleh Dr\. Diane/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Siti Rahayu (SDY-2026-0001)" })).toHaveAttribute("href", "/admin/pasien/p1");
  });

  it("meminta pencocokan dulu bila booking belum punya pasien", () => {
    render(<IntakeView intake={{ ...intake, approval: { state: "needs-match" } }} />);
    expect(screen.getByText(/Cocokkan booking ini dengan pasien di menu Booking/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Jalankan uji dan pastikan gagal**

Run: `npx vitest run tests/unit/components/intake-approval-form.test.tsx tests/unit/components/intake-view.test.tsx`
Expected: FAIL. `IntakeApprovalForm` belum ada, dan IntakeView belum menampilkan pemeriksa, tautan, maupun pesan pencocokan.

- [ ] **Step 3: Implementasi**

`src/components/admin/intake-approval-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { approveIntakeToPatient, type IntakeApproval } from "@/server/intake";

type ReadyApproval = Extract<IntakeApproval, { state: "ready" }>;

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function RecordField(props: {
  label: string;
  current: string | null;
  proposed: string | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-base font-medium">
        {props.label}
      </Label>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-muted p-2">
          <p className="text-xs text-muted-foreground">Data pasien saat ini</p>
          <p className="whitespace-pre-line">{props.current || "(kosong)"}</p>
        </div>
        <div className="rounded-md bg-muted p-2">
          <p className="text-xs text-muted-foreground">Usulan dari isian</p>
          <p className="whitespace-pre-line">{props.proposed || "(tidak ada di isian ini)"}</p>
        </div>
      </div>
      <textarea
        id={id}
        rows={4}
        maxLength={2000}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className={textareaClass}
      />
    </div>
  );
}

/** Dokter menyunting lalu menyetujui; isinya menggantikan catatan pasien (spec 6.4). */
export function IntakeApprovalForm({ intakeId, approval }: { intakeId: string; approval: ReadyApproval }) {
  const router = useRouter();
  const [allergies, setAllergies] = useState(approval.prefill.allergies);
  const [medicalHistory, setMedicalHistory] = useState(approval.prefill.medicalHistory);
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      try {
        const result = await approveIntakeToPatient({
          intakeId,
          allergies,
          medicalHistory,
          patientVersion: approval.patientVersion,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Data pasien diperbarui.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <section aria-labelledby="setujui-data-pasien" className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 id="setujui-data-pasien" className="text-base font-medium">
          Setujui ke data pasien
        </h2>
        <p className="text-sm text-muted-foreground">
          Isi kedua kolom di bawah menggantikan catatan alergi dan riwayat penyakit pasien. Jawaban pasien di
          isian ini tidak berubah.
        </p>
      </div>
      <RecordField
        label="Alergi"
        current={approval.current.allergies}
        proposed={approval.proposed.allergies}
        value={allergies}
        onChange={setAllergies}
      />
      <RecordField
        label="Riwayat penyakit & obat"
        current={approval.current.medicalHistory}
        proposed={approval.proposed.medicalHistory}
        value={medicalHistory}
        onChange={setMedicalHistory}
      />
      <Button onClick={handleApprove} disabled={pending}>
        Setujui ke data pasien
      </Button>
    </section>
  );
}
```

Di `src/components/admin/intake-view.tsx`:
- tambahkan impor `import Link from "next/link";` dan `import { IntakeApprovalForm } from "./intake-approval-form";`;
- ganti isi paragraf "Pasien:" dengan tautan:

```tsx
        <p>
          Pasien:{" "}
          {intake.patient ? (
            <Link href={`/admin/pasien/${intake.patient.id}`} className="underline underline-offset-4">
              {intake.patient.name} ({intake.patient.medicalRecordNumber})
            </Link>
          ) : (
            <Badge variant="outline">Belum dicocokkan</Badge>
          )}
        </p>
        {intake.review && (
          <p className="text-muted-foreground">
            Diperiksa oleh {intake.review.reviewerName}, {formatIndonesianDate(intake.review.reviewedAt)}
          </p>
        )}
```

- di dalam cabang `clinical` (fragmen `<>…</>`), setelah blok tabel aktivitas, tambahkan:

```tsx
          {intake.approval?.state === "ready" && (
            // key: formulir dibuat ulang dengan isi awal baru setelah router.refresh().
            <IntakeApprovalForm key={intake.approval.patientVersion} intakeId={intake.id} approval={intake.approval} />
          )}
          {intake.approval?.state === "needs-match" && (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              Cocokkan booking ini dengan pasien di menu Booking sebelum menyetujui isian ke data pasien.
            </p>
          )}
```

- [ ] **Step 4: Jalankan uji dan pastikan lulus**

Run: `npx vitest run tests/unit/components/intake-approval-form.test.tsx tests/unit/components/intake-view.test.tsx && npx tsc --noEmit && npm run lint`
Expected: semua PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/intake-approval-form.tsx src/components/admin/intake-view.tsx tests/unit/components/intake-approval-form.test.tsx tests/unit/components/intake-view.test.tsx
git commit -m "feat: approval form on the intake page, with reviewer and patient link"
```

---

### Task 5: Status isian dan filter "Isian belum diperiksa" di daftar booking

**Files:**
- Modify: `src/server/appointment.ts`
- Modify: `src/components/admin/appointment-table.tsx`, `src/components/admin/booking-filters.tsx`
- Modify: `src/app/(admin)/admin/booking/page.tsx`
- Test: `tests/integration/booking-intake-filter.test.ts`, `tests/unit/components/appointment-table.test.tsx`

**Interfaces:**
- Consumes (Task 3): the `/admin/pasien/[id]` route.
- Produces:
  - `listAppointments({ ..., intakeStatus?: IntakeStatus })`. When `intakeStatus` is set and `status` is empty, `DIBATALKAN` and `KEDALUWARSA` bookings are left out.
  - `BookingRow` gains `intakeStatus: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA" | null` and `patientId: string | null`.
  - `BookingFilters` gains the prop `intake: string | null`.
  - The URL `/admin/booking?isian=belum-diperiksa` shows bookings from every date.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/integration/booking-intake-filter.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, IntakeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysToDateString } from "@/lib/time";
import { listAppointments } from "@/server/appointment";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "filter-isian-uji";
const PATIENT_WA = "6281200006630";

describe("filter isian belum diperiksa", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let slot = 0;

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (
      await prisma.patient.create({
        data: {
          medicalRecordNumber: "SDY-2026-6630",
          name: "Pasien Filter",
          whatsapp: PATIENT_WA,
          allergies: "Udang",
          medicalHistory: "Asma",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  async function booking(day: string, status: AppointmentStatus, intakeStatus: IntakeStatus | null) {
    slot += 1;
    const appointment = await prisma.appointment.create({
      data: {
        code: `FLT-${slot}`,
        type: "KONSULTASI",
        startAt: at(day, `${10 + slot}:00`),
        endAt: at(day, `${10 + slot}:30`),
        source: "SITUS",
        status,
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
    if (intakeStatus) {
      await prisma.intake.create({
        data: {
          appointmentId: appointment.id,
          patientId,
          status: intakeStatus,
          kind: "LENGKAP",
          purpose: "SLIMMING",
          quizVersion: 1,
          answers: { patientType: "BARU", purpose: "SLIMMING" },
          name: "Pasien Filter",
          whatsapp: PATIENT_WA,
        },
      });
    }
    return appointment;
  }

  it("mendaftar isian terisi dari semua tanggal, tanpa booking batal, kedaluwarsa, atau isian yang sudah diperiksa", async () => {
    const soon = await booking(date, "TERKONFIRMASI", "TERISI");
    const later = await booking(addDaysToDateString(date, 3), "MENUNGGU_KONFIRMASI", "TERISI");
    await booking(date, "TERKONFIRMASI", "DIPERIKSA");
    await booking(date, "DIBATALKAN", "TERISI");
    await booking(date, "KEDALUWARSA", "TERISI");
    await booking(date, "TERKONFIRMASI", null);

    const list = await listAppointments({ staffId: world.doctorId, intakeStatus: "TERISI" });

    expect(list.map((a) => a.id)).toEqual([soon.id, later.id]);
    expect(list[0].intake?.status).toBe("TERISI");
  });

  it("daftar booking tidak membawa catatan medis pasien", async () => {
    const list = await listAppointments({ staffId: world.doctorId });

    expect(list.length).toBeGreaterThan(0);
    expect(list[0].patient).toMatchObject({ id: patientId, name: "Pasien Filter", medicalRecordNumber: "SDY-2026-6630" });
    expect(JSON.stringify(list)).not.toMatch(/Udang|Asma/);
  });
});
```

Di `tests/unit/components/appointment-table.test.tsx`, tambahkan ke objek `base` (setelah `intakeId: "i1",`):

```ts
  intakeStatus: "TERISI",
  patientId: "p1",
```

lalu tambahkan:

```tsx
describe("AppointmentTable status isian dan tautan pasien", () => {
  it("menampilkan status isian di bawah status booking", () => {
    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.getByText("Isian: belum diperiksa")).toBeInTheDocument();
  });

  it("tidak menampilkan status isian untuk booking tanpa isian", () => {
    render(<AppointmentTable rows={[{ ...base, intakeStatus: null, intakeId: null }]} canReadRecords={false} />);
    expect(screen.queryByText(/^Isian:/)).not.toBeInTheDocument();
  });

  it("nama pasien menaut ke halaman pasien, kecuali booking yang belum dicocokkan", () => {
    const { rerender } = render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.getByRole("link", { name: "Siti Rahayu" })).toHaveAttribute("href", "/admin/pasien/p1");

    rerender(<AppointmentTable rows={[{ ...base, patientId: null, needsMatch: true }]} canReadRecords={false} />);
    expect(screen.queryByRole("link", { name: "Siti Rahayu" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan uji dan pastikan gagal**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/booking-intake-filter.test.ts && npx vitest run tests/unit/components/appointment-table.test.tsx`
Expected: FAIL.
- Integrasi gagal karena `intakeStatus` diabaikan, dan objek `patient` masih memuat "Udang".
- Unit gagal karena status isian dan tautan pasien belum ada.

- [ ] **Step 3: Implementasi**

Di `src/server/appointment.ts`:
- tambahkan `IntakeStatus` ke impor tipe dari `@prisma/client`;
- ganti `patient: true,` di `BOOKING_LIST_INCLUDE` dengan:

```ts
  // Hanya identitas: catatan medis tidak pernah ikut daftar booking (spec 6.2).
  patient: { select: { id: true, name: true, medicalRecordNumber: true, whatsapp: true } },
```

- ubah `listAppointments`:

```ts
export async function listAppointments(filter: {
  branchId?: string;
  staffId?: string;
  status?: AppointmentStatus;
  date?: string;
  intakeStatus?: IntakeStatus;
}) {
  await requireCapability("booking:manage");
  await expireStaleSiteBookings();

  return prisma.appointment.findMany({
    where: {
      branchId: filter.branchId,
      staffId: filter.staffId,
      status: filter.status,
      ...(filter.date
        ? {
            startAt: {
              gte: combineWitaDateAndMinutes(filter.date, 0),
              lt: combineWitaDateAndMinutes(filter.date, 24 * 60),
            },
          }
        : {}),
      ...(filter.intakeStatus
        ? {
            intake: { status: filter.intakeStatus },
            // Isian booking yang batal atau kedaluwarsa tidak perlu diperiksa lagi.
            ...(filter.status ? {} : { status: { notIn: ["DIBATALKAN", "KEDALUWARSA"] as AppointmentStatus[] } }),
          }
        : {}),
    },
    include: BOOKING_LIST_INCLUDE,
    orderBy: { startAt: "asc" },
  });
}
```

Di `src/components/admin/appointment-table.tsx`:
- tambahkan ke tipe `BookingRow`:

```ts
  /** Status isian booking ini (resepsionis boleh melihatnya, spec 6.2). */
  intakeStatus: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA" | null;
  /** Pasien yang sudah dicocokkan; null untuk booking situs yang belum dicocokkan. */
  patientId: string | null;
```

- tambahkan konstanta di bawah `ACTIVE`:

```ts
const INTAKE_STATUS_LABEL: Record<NonNullable<BookingRow["intakeStatus"]>, string> = {
  MENUNGGU_DIISI: "belum diisi",
  TERISI: "belum diperiksa",
  DIPERIKSA: "diperiksa",
};
```

- ganti `<div className="font-medium">{row.patientName}</div>` dengan:

```tsx
                <div className="font-medium">
                  {row.patientId ? (
                    <Link href={`/admin/pasien/${row.patientId}`} className="underline-offset-4 hover:underline">
                      {row.patientName}
                    </Link>
                  ) : (
                    row.patientName
                  )}
                </div>
```

- ganti isi sel status `<AppointmentStatusBadge status={row.status} />` dengan:

```tsx
                <AppointmentStatusBadge status={row.status} />
                {row.intakeStatus && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Isian: {INTAKE_STATUS_LABEL[row.intakeStatus]}
                  </div>
                )}
```

Di `src/components/admin/booking-filters.tsx`:
- tambahkan `intake: string | null;` ke `Props` dan ke destrukturisasi fungsi;
- di `update`, setelah `if (branchId) params.set("cabang", branchId);`, tambahkan `if (intake) params.set("isian", intake);`;
- tambahkan pilihan setelah blok Status:

```tsx
      <div className="space-y-1">
        <Label htmlFor="filter-intake" className="text-xs">
          Isian
        </Label>
        <Select value={intake ?? ALL} onValueChange={(v) => update("isian", v)}>
          <SelectTrigger id="filter-intake" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua isian</SelectItem>
            <SelectItem value="belum-diperiksa">Belum diperiksa</SelectItem>
          </SelectContent>
        </Select>
      </div>
```

Di `src/app/(admin)/admin/booking/page.tsx`:
- tambahkan `isian?: string` ke tipe `searchParams`;
- di `toRow`, tambahkan dua kolom ke objek yang dikembalikan (setelah `intakeId: a.intake?.id ?? null,`):

```ts
    intakeStatus: a.intake?.status ?? null,
    patientId: patient?.id ?? null,
```

- setelah baris `const status = …`, tambahkan:

```ts
  // Filter isian berlaku untuk semua tanggal: isian lama pun harus terlihat (spec 6.5).
  const unreviewedOnly = params.isian === "belum-diperiksa";
```

- ubah pemanggilan `listAppointments` menjadi:

```ts
    listAppointments({
      date: unreviewedOnly ? undefined : date,
      status: status ?? undefined,
      staffId: params.staf || undefined,
      branchId: params.cabang || undefined,
      intakeStatus: unreviewedOnly ? "TERISI" : undefined,
    }),
```

- ganti `const rows = appointments.map(toRow);` dengan:

```ts
  const rows = appointments.map((a) => {
    const row = toRow(a);
    // Tanpa batas tanggal: jam jadwal ditulis bersama tanggalnya.
    return unreviewedOnly ? { ...row, timeLabel: `${formatShortIndonesianDate(a.startAt)} · ${row.timeLabel}` } : row;
  });
```

- ganti blok navigasi tanggal `<div className="flex items-center gap-2"> … </div>` (tombol ‹, judul tanggal, ›, dan "Hari ini") dengan:

```tsx
          {unreviewedOnly ? (
            <h2 className="text-lg font-medium">Isian belum diperiksa · semua tanggal</h2>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={dayLink(addDaysToDateString(date, -1))} aria-label="Hari sebelumnya">
                  ‹
                </Link>
              </Button>
              <h2 className="text-lg font-medium">{dateLabel}</h2>
              <Button asChild variant="outline" size="sm">
                <Link href={dayLink(addDaysToDateString(date, 1))} aria-label="Hari berikutnya">
                  ›
                </Link>
              </Button>
              {date !== today && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={dayLink(today)}>Hari ini</Link>
                </Button>
              )}
            </div>
          )}
```
- tambahkan `intake={unreviewedOnly ? "belum-diperiksa" : null}` ke `<BookingFilters … />`;
- ganti pesan kosong dengan:

```tsx
          <p className="text-sm text-muted-foreground">
            {unreviewedOnly
              ? "Tidak ada isian yang menunggu diperiksa."
              : `Tidak ada booking${status ? " dengan status ini" : ""} pada tanggal ini.`}
          </p>
```

- [ ] **Step 4: Jalankan uji dan pastikan lulus**

Run: `npx vitest run --config vitest.integration.config.mts tests/integration/booking-intake-filter.test.ts tests/integration/appointment.test.ts tests/integration/intake-matching.test.ts tests/integration/booking-expiry.test.ts && npx vitest run tests/unit/components/appointment-table.test.tsx && npx tsc --noEmit && npm run lint`
Expected: semua PASS; tsc dan lint bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/appointment.ts src/components/admin/appointment-table.tsx src/components/admin/booking-filters.tsx "src/app/(admin)/admin/booking/page.tsx" tests/integration/booking-intake-filter.test.ts tests/unit/components/appointment-table.test.tsx
git commit -m "feat: intake status and an unreviewed-intake filter on the booking list"
```

---

### Task 6: Uji ujung-ke-ujung, dokumen, dan verifikasi penuh

**Files:**
- Modify: `tests/e2e/public-registration.spec.ts`
- Modify: `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md` (baris Status saja)

**Interfaces:**
- Consumes: semua task di atas.

- [ ] **Step 1: Perluas uji E2E**

Di `tests/e2e/public-registration.spec.ts`:
- tambahkan `let patientUrl: string | null = null;` di bawah `let intakeUrl…`;
- dalam uji "admin mencocokkan pasien, memverifikasi, lalu membaca isiannya", ganti bagian dari `await page.goto(\`/admin/booking?tanggal=${booking!.date}\`);` setelah `toHaveCount(0, …)` sampai `intakeUrl = page.url();` dengan:

```ts
  // Isian terisi tampil di filter "belum diperiksa" dari tanggal mana pun.
  await page.goto("/admin/booking?isian=belum-diperiksa");
  const row = page.getByRole("row").filter({ hasText: booking!.code });
  await expect(row.getByText("Isian: belum diperiksa")).toBeVisible();
  await expect(row.getByText("Terkonfirmasi", { exact: true })).toBeVisible();

  await row.getByRole("link", { name: "Lihat isian" }).click();
  // Rute /admin/isian/[id] belum pernah dikompilasi next dev di uji manapun
  // sebelumnya; dengan worker paralel navigasi pertama bisa lebih lambat
  // dari batas waktu bawaan (lihat catatan di playwright.config.ts).
  await expect(page.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("72 kg · 158 cm · IMT 28,8")).toBeVisible();
  intakeUrl = page.url();

  // Super Admin memegang record:write: menyetujui ke data pasien dengan sedikit suntingan.
  const approval = page.getByRole("region", { name: "Setujui ke data pasien" });
  await expect(approval.getByLabel("Alergi", { exact: true })).toHaveValue("Tidak ada");
  const history = approval.getByLabel("Riwayat penyakit & obat", { exact: true });
  await expect(history).toHaveValue("Darah tinggi: Amlodipine 5 mg, 1× sehari");
  await history.fill("Darah tinggi: Amlodipine 5 mg, 1× sehari (kontrol rutin)");
  await approval.getByRole("button", { name: "Setujui ke data pasien" }).click();
  await expect(page.getByText("Sudah diperiksa dokter")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: new RegExp(`^${patientFor(testInfo).name} \\(`) }).click();
  await expect(page.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari (kontrol rutin)")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: booking!.code }).first()).toBeVisible();
  patientUrl = page.url();

  // Setelah disetujui, booking ini keluar dari filter "belum diperiksa".
  await page.goto("/admin/booking?isian=belum-diperiksa");
  await expect(page.getByRole("row").filter({ hasText: booking!.code })).toHaveCount(0);
```

- in the receptionist test ("resepsionis melihat booking tanpa isi klinis isian"), change `test.skip(...)` to `test.skip(!booking || !intakeUrl || !patientUrl, "Butuh booking, isian, dan pasien dari uji sebelumnya.");`. At the end of that test, add:

```ts
  await page.goto(patientUrl!);
  await expect(page.getByText(patientFor(testInfo).name).first()).toBeVisible();
  await expect(page.getByText(/Amlodipine/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Lihat isian" })).toHaveCount(0);
```

  The receptionist test must receive `testInfo`. Change its signature to `async ({ page }, testInfo) =>`.

The patient in the E2E is new: their notes are empty, and the proposal comes from the quiz answers that test fills in ("Tidak ada" allergies, other medication "Tidak ada", "Darah tinggi" with Amlodipine). So the expected starting values are `Tidak ada` and `Darah tinggi: Amlodipine 5 mg, 1× sehari`.

- [ ] **Step 2: Jalankan E2E**

Run: `caffeinate -i npx playwright test tests/e2e/public-registration.spec.ts tests/e2e/admin-booking.spec.ts tests/e2e/admin.spec.ts`
Expected: semua lulus di desktop dan ponsel. Jangan jalankan bersamaan dengan uji integrasi.

- [ ] **Step 3: Perbarui baris Status spec**

The spec file may hold an uncommitted edit by the owner. Keep that edit out of the commit:

```bash
git stash push -- docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md
```

Ubah baris `- **Status:** …` menjadi:

```
- **Status:** Disetujui pemilik (28 September 2026) · Plan 3b-1 terlaksana (29 September 2026) · Plan 3b-2a terlaksana (<tanggal>): Setujui ke data pasien, filter isian, halaman pasien · Plan 3b-2b (link WA & QR, Kirim form) menyusul
```

Replace `<tanggal>` with the date the task is done. Commit, then run `git stash pop`. If the pop hits a conflict, stop and report it. Do not resolve it yourself.

- [ ] **Step 4: Verifikasi penuh**

Run berurutan (jangan paralel):

```bash
npm test
npm run test:integration
npx tsc --noEmit
npm run lint
caffeinate -i npm run test:e2e
```

Expected: semuanya bersih. Dalam putaran E2E penuh, `public-site.spec.ts` kadang gagal karena `next dev` lambat mengompilasi saat 3 pekerja berjalan bersamaan. Bila itu terjadi, jalankan `npx playwright test tests/e2e/public-site.spec.ts` sendirian. Uji itu harus lulus 18/18.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/public-registration.spec.ts docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md
git commit -m "test: end-to-end intake approval, unreviewed filter and patient page"
```

---

## Definisi Selesai

- [ ] `npm test`, `npm run test:integration`, `npm run test:e2e` (berurutan), `npx tsc --noEmit`, dan `npm run lint` semuanya bersih.
- [ ] Tanpa migrasi. Rilis ke produksi lewat `deploy.sh` (runbook bagian 4) setelah PR di-merge. Periksa `scripts/server/cek-situs.sh https://sundyclinic.com` dan log galat PM2.
- [ ] Pemilik mencoba di produksi dengan akun dokter atau Super Admin:
  1. buka satu isian lewat filter "Isian belum diperiksa";
  2. setujui ke data pasien;
  3. lihat hasilnya di halaman pasien.
- [ ] Resepsionis membuka halaman pasien yang sama tanpa melihat catatan medis.

## Yang Sengaja Tidak Dikerjakan (→ Plan 3b-2b)

- **Link WA pribadi & QR** untuk booking yang dicatat admin, beserta tombol **Kirim form / Kirim ulang / Tampilkan QR** (spec bagian 4 dan 6.5).
- **Alur `MENUNGGU_DIISI`**: isian yang dibuat saat link dikirim, lalu diisi pasien lewat link.
- **Menyunting catatan medis langsung di halaman pasien** tanpa isian. Rekam medis lengkap (SOAP, BIA, order) masuk sub-proyek 2.
