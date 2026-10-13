# Resep Terstruktur oleh Dokter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dokter menulis resep (obat dari stok, jumlah, aturan pakai) di catatan kunjungan; saat difinalkan resep otomatis menjadi penyerahan Selesai yang masuk tagihan; resepsionis bisa mengurangi atau menghapus baris resep dengan alasan dan mencetak etiket dari tagihan.

**Architecture:** Tabel baru `EncounterPrescription` (baris resep di draf kunjungan, terkunci trigger saat final). Finalisasi catatan membuat `Dispensing` `source = DOKTER` berstatus `SELESAI` dengan `DispensingLine.prescriptionId`, sehingga sambungan penyerahan → tagihan yang sudah ada (`handedInvoiceLines`) dipakai ulang. Aturan murni di `src/lib/prescription.ts`; aksi baru `reducePrescriptionLine` di `invoice-drafts.ts`; etiket di `/admin/tagihan/[id]/etiket`.

**Tech Stack:** Next.js 15, React 19, Prisma 7 + PostgreSQL, MUI 9, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-resep-dokter-design.md`

## Global Constraints

- Semua teks antarmuka dan pesan Bahasa Indonesia persis seperti di task.
- Migrasi hanya menambah. Nama `20261018090000_resep_dokter`. SQL dari `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/x.sql`, buang baris dotenv dan banner (`┌`, `│`, `└`). Enum baru dibuat dengan `CREATE TYPE` di migrasi yang sama (bukan `ADD VALUE`). CHECK tidak pernah NULL. Sesudahnya `npx prisma generate && npm run db:migrate:test`; drift → `-- This is an empty migration.`
- Batas resep: maks. 30 baris; jumlah bilangan bulat 1–9999; aturan pakai 1–200 karakter; alasan pengurangan 2–200 karakter.
- Pilihan obat dokter tidak pernah memuat harga (beli maupun jual).
- Kunjungan tidak pernah lagi membuat penyerahan `MENUNGGU`. `Encounter.pharmacyNote` tidak lagi ditulis; catatan lama tetap tampil baca-saja.
- Penyerahan `source = DOKTER` tidak memicu pemberitahuan "Resep baru"/"Resep selesai" dan tidak bisa dibuka kembali Apoteker.
- Berkas `"use server"` hanya mengekspor fungsi async; panel admin hanya MUI; jangan jalankan Prettier.
- Uji integrasi tidak bersamaan dengan E2E. Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Penyimpangan dari spec (diputuskan di rencana)

- `DispensingLine.prescriptionId` memakai `onDelete: SetNull`, bukan `Restrict` (spec 2.2): pembersih uji (`purge-encounters`) dan penghapusan kunjungan draf tidak boleh tertahan oleh baris penyerahan. Resep final tidak bisa dihapus karena trigger, jadi di produksi tidak ada bedanya.
- `live-events.ts` diubah (spec 6 menyebut "tidak ada kode pemberitahuan yang diubah"): penyerahan dokter dibuat langsung Selesai, sehingga tanpa penyaring `source = APOTEKER` Apoteker akan menerima "Resep baru"/"Resep selesai" setiap dokter memfinalkan catatan.
- Pilihan obat memakai `SelectField` (select bawaan, pola treatment) dan bukan pilihan dengan pencarian (spec 3); pencarian bisa ditambahkan nanti bila daftar obat panjang.
- Spec 4 menyebut draf tagihan yang sudah ada mendapat baris saat finalisasi catatan; ini tidak mungkin terjadi karena `createInvoiceFromVisit` mensyaratkan catatan final, jadi tidak ada kode untuk itu.
- Aksi ubah obat/Selesai/Tanpa obat Apoteker sudah menolak penyerahan non-Menunggu (`touchDispensing`); hanya Buka kembali yang perlu penolakan baru "Resep dari dokter tidak diubah di sini."

## Review Focus

1. Draf lama yang masih berisi "Catatan untuk Apoteker" lalu difinalkan → tidak membuat penyerahan Menunggu; catatannya tetap tersimpan dan tampil baca-saja (Task 3).
2. Resepsionis mengurangi baris resep lalu tagihan dibatalkan dan dibuat ulang → jumlah kembali ke resep asli, keterangan pengurangan hilang (Task 5).
3. Obat dinonaktifkan atau kehilangan harga jual setelah masuk draf resep → simpan/finalisasi ditolak dengan nama obatnya (Task 3).
4. Baris dari penyerahan Apoteker lama tidak bisa dikurangi lewat aksi resep dan tetap terkunci (Task 5).
5. Dokter tidak pernah menerima harga di pilihan obat; resepsionis tidak menerima isi catatan klinis lewat etiket (Task 3, Task 7).

---

### Task 1: Skema resep dan migrasi

**Files:**
- Modify: `prisma/schema.prisma` (model baru `EncounterPrescription`; relasi di `Encounter`, `StockItem`; kolom baru di `Dispensing`, `DispensingLine`)
- Create: `prisma/migrations/20261018090000_resep_dokter/migration.sql`
- Modify: `tests/purge-encounters.ts`
- Test: `tests/unit/migrations.test.ts`, `tests/integration/prescription-schema.test.ts`

**Interfaces:**
- Produces: model `EncounterPrescription { id, encounterId, itemId, itemName, quantity, usage, sortOrder }`; enum `DispensingSource` (`APOTEKER`, `DOKTER`); `Dispensing.source`; `DispensingLine.prescriptionId` (unik, `onDelete: SetNull`), `billedQuantity Int?`, `billingNote String?`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi resep dokter", () => {
  const sql = readFileSync("prisma/migrations/20261018090000_resep_dokter/migration.sql", "utf8");

  it("hanya menambah", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("mengunci resep kunjungan final dan menjaga nilai", () => {
    expect(sql).toMatch(/CREATE TRIGGER encounter_prescription_locked/);
    expect(sql).toMatch(/CREATE TRIGGER encounter_prescription_no_truncate/);
    expect(sql).toMatch(/encounter_prescription_values/);
    expect(sql).toMatch(/dispensing_line_billing/);
  });
});
```

Buat `tests/integration/prescription-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

const SLUG = "skema-resep";
const WA = "6281200009730";
let world: BillingWorld;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("skema resep dokter", () => {
  it("resep draf bisa diubah; sesudah final terkunci", async () => {
    const appointment = await prisma.appointment.findFirstOrThrow({ where: { id: (await finalVisit(world)).appointmentId } });
    const encounter = await prisma.encounter.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    await expect(
      prisma.encounterPrescription.create({ data: { encounterId: encounter.id, itemId: world.drugId, itemName: "Obat", quantity: 1, usage: "3 x 1" } }),
    ).rejects.toThrow(/rekam_medis_terkunci/);
  });

  it("nilai resep dan penagihan masuk akal", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        code: "SKR-1", type: "KONSULTASI", channel: "KLINIK", startAt: new Date("2031-06-01T02:00:00Z"), endAt: new Date("2031-06-01T02:30:00Z"),
        status: "HADIR", source: "WALK_IN", branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId: world.patientId,
      },
    });
    const encounter = await prisma.encounter.create({ data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji" } });
    const base = { encounterId: encounter.id, itemId: world.drugId, itemName: "Obat" };
    await expect(prisma.encounterPrescription.create({ data: { ...base, quantity: 0, usage: "3 x 1" } })).rejects.toThrow(/encounter_prescription_values/);
    await expect(prisma.encounterPrescription.create({ data: { ...base, quantity: 1, usage: "  " } })).rejects.toThrow(/encounter_prescription_values/);
    const prescription = await prisma.encounterPrescription.create({ data: { ...base, quantity: 10, usage: "3 x 1" } });

    const { lineIds } = await seedDispensing(world, appointment.id, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 10 }] });
    const set = (data: Record<string, unknown>) => prisma.dispensingLine.update({ where: { id: lineIds[0] }, data });
    await expect(set({ billedQuantity: 10, billingNote: "Stok kurang" })).rejects.toThrow(/dispensing_line_billing/);
    await expect(set({ billedQuantity: 5 })).rejects.toThrow(/dispensing_line_billing/);
    await expect(set({ billedQuantity: -1, billingNote: "x" })).rejects.toThrow(/dispensing_line_billing/);
    expect((await set({ billedQuantity: 0, billingNote: "Customer menolak", prescriptionId: prescription.id })).billedQuantity).toBe(0);
    expect((await prisma.dispensing.findFirstOrThrow({ where: { appointmentId: appointment.id } })).source).toBe("APOTEKER");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts` → Expected: FAIL (berkas migrasi tidak ada).

- [ ] **Step 3: Skema**

Di `prisma/schema.prisma`:
- tambahkan sebelum `model Dispensing`:

```prisma
enum DispensingSource {
  APOTEKER
  DOKTER
}
```

- di `model Dispensing`, sesudah baris `status` tambahkan:

```prisma
  /// APOTEKER = alur lama (Catatan untuk Apoteker); DOKTER = resep dokter yang langsung Selesai (spec resep dokter 2.2).
  source DispensingSource @default(APOTEKER)
```

- di `model DispensingLine`, sesudah `sortOrder` tambahkan:

```prisma
  /// Baris resep dokter asal baris ini (spec resep dokter 2.2).
  prescriptionId String?                @unique
  prescription   EncounterPrescription? @relation(fields: [prescriptionId], references: [id], onDelete: SetNull)
  /// Jumlah yang akhirnya ditagih dan alasan resepsionis; null = sesuai resep, 0 = dihapus dari tagihan. CHECK dispensing_line_billing.
  billedQuantity Int?
  billingNote    String?
```

- di `model Encounter` tambahkan relasi `  prescriptions EncounterPrescription[]` di samping `treatments`; di `model StockItem` tambahkan `  prescriptions EncounterPrescription[]` di samping relasi lain.
- tambahkan model sesudah `model EncounterTreatment`:

```prisma
/// Satu obat dalam resep dokter (spec resep dokter 2.1). Ditulis ulang setiap simpan draf; terkunci saat kunjungan final
/// (trigger encounter_prescription_locked). CHECK encounter_prescription_values.
model EncounterPrescription {
  id          String    @id @default(cuid())
  encounterId String
  encounter   Encounter @relation(fields: [encounterId], references: [id], onDelete: Cascade)
  itemId      String
  item        StockItem @relation(fields: [itemId], references: [id], onDelete: Restrict)
  /// Disalin saat disimpan, agar catatan lama tidak ikut berubah.
  itemName    String
  quantity    Int
  /// Aturan pakai, mis. "3 x 1 sesudah makan".
  usage       String
  sortOrder   Int       @default(0)

  dispensingLine DispensingLine?

  @@index([encounterId])
}
```

- [ ] **Step 4: Migrasi**

```bash
mkdir -p prisma/migrations/20261018090000_resep_dokter
PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/resep.sql
grep -v -e '^\[dotenv' -e '^┌' -e '^│' -e '^└' /tmp/resep.sql > prisma/migrations/20261018090000_resep_dokter/migration.sql
```

Tambahkan di akhir berkas:

```sql
-- Nilai resep dan penagihan (spec resep dokter 2). Tiap ekspresi tidak pernah NULL.
ALTER TABLE "EncounterPrescription" ADD CONSTRAINT encounter_prescription_values CHECK ("quantity" > 0 AND btrim("usage") <> '');
ALTER TABLE "DispensingLine" ADD CONSTRAINT dispensing_line_billing CHECK (
  "billedQuantity" IS NULL OR ("billedQuantity" >= 0 AND "billedQuantity" < "quantity" AND "billingNote" IS NOT NULL)
);

-- Resep terkunci bersama kunjungannya, sama seperti treatment (migrasi kunjungan_dokter).
CREATE FUNCTION encounter_prescription_locked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "EncounterStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = OLD."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: resep kunjungan % sudah final', OLD."encounterId";
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = NEW."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: resep kunjungan % sudah final', NEW."encounterId";
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER encounter_prescription_locked
BEFORE INSERT OR UPDATE OR DELETE ON "EncounterPrescription"
FOR EACH ROW EXECUTE FUNCTION encounter_prescription_locked();

CREATE TRIGGER encounter_prescription_no_truncate BEFORE TRUNCATE ON "EncounterPrescription"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();
```

Run: `npx prisma generate && npm run db:migrate:test` → diterapkan; drift → kosong. Gagal di tengah: perbaiki, `PRISMA_TARGET=test npx prisma migrate resolve --rolled-back 20261018090000_resep_dokter`, ulangi.

- [ ] **Step 5: Pembersih uji**

Di `tests/purge-encounters.ts`, ganti daftar `TABLES` menjadi:

```ts
const TABLES = ['"BiaFile"', '"BiaMeasurement"', '"FoodRecall"', '"EncounterAddendum"', '"EncounterTreatment"', '"EncounterPrescription"', '"Encounter"'] as const;
```

- [ ] **Step 6: Jalankan uji**

Run: `npx vitest run tests/unit/migrations.test.ts && npm run test:integration -- tests/integration/prescription-schema.test.ts tests/integration/dispensing-schema.test.ts && npx tsc --noEmit -p .` → Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261018090000_resep_dokter tests/purge-encounters.ts tests/unit/migrations.test.ts tests/integration/prescription-schema.test.ts
git commit -m "feat: add doctor prescription rows, dispensing source, and billing adjustments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Aturan murni resep

**Files:**
- Create: `src/lib/prescription.ts`
- Test: `tests/unit/prescription.test.ts`

**Interfaces:**
- Produces:
  - `PRESCRIPTIONS_MAX = 30`, `PRESCRIPTION_USAGE_MAX = 200`
  - `PrescriptionInput = { itemId: string; quantity: string; usage: string }`, `PrescriptionDraft = { itemId: string; quantity: number; usage: string }`
  - `parsePrescriptions(rows: PrescriptionInput[]): { ok: true; value: PrescriptionDraft[] } | { ok: false; message: string }`
  - `MedicineOption = { id: string; code: string; name: string; unit: string; available: number }`
  - `stockWarnings(rows: { itemId: string; quantity: number }[], medicines: MedicineOption[]): Map<string, string>` (kunci = itemId)
  - `validateReduction(raw: unknown, ctx: { prescribed: number }): { ok: true; value: { quantity: number; reason: string } } | { ok: false; message: string }`
  - `billingLabel(line: { quantity: number; billedQuantity: number | null; billingNote: string | null }): string | null`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/prescription.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { billingLabel, parsePrescriptions, stockWarnings, validateReduction } from "@/lib/prescription";

const row = { itemId: "o1", quantity: " 10 ", usage: "  3 x 1 sesudah makan " };

describe("resep dokter", () => {
  it("merapikan baris resep", () => {
    expect(parsePrescriptions([row])).toEqual({ ok: true, value: [{ itemId: "o1", quantity: 10, usage: "3 x 1 sesudah makan" }] });
    expect(parsePrescriptions([])).toEqual({ ok: true, value: [] });
  });

  it.each([
    [{ itemId: "" }, "Pilih obat dari daftar."],
    [{ quantity: "0" }, "Jumlah obat harus bilangan bulat 1–9.999."],
    [{ quantity: "1,5" }, "Jumlah obat harus bilangan bulat 1–9.999."],
    [{ quantity: "10000" }, "Jumlah obat harus bilangan bulat 1–9.999."],
    [{ usage: " " }, "Isi aturan pakai obat."],
    [{ usage: "x".repeat(201) }, "Aturan pakai terlalu panjang (maks. 200 karakter)."],
  ])("menolak %j", (patch, message) => {
    expect(parsePrescriptions([{ ...row, ...patch }])).toEqual({ ok: false, message });
  });

  it("paling banyak 30 obat", () => {
    expect(parsePrescriptions(Array.from({ length: 31 }, () => row))).toEqual({ ok: false, message: "Paling banyak 30 obat per resep." });
  });

  it("peringatan stok menjumlahkan baris obat yang sama", () => {
    const medicines = [
      { id: "o1", code: "A", name: "Amoxicillin", unit: "kapsul", available: 4 },
      { id: "o2", code: "B", name: "Vitamin", unit: "tablet", available: 30 },
    ];
    const warnings = stockWarnings(
      [
        { itemId: "o1", quantity: 3 },
        { itemId: "o1", quantity: 2 },
        { itemId: "o2", quantity: 10 },
      ],
      medicines,
    );
    expect(warnings.get("o1")).toBe("Sisa stok 4 kapsul — tagihan tertahan sampai stok cukup atau jumlah dikurangi.");
    expect(warnings.has("o2")).toBe(false);
    expect(stockWarnings([{ itemId: "hilang", quantity: 1 }], medicines).has("hilang")).toBe(false);
  });

  it("pengurangan oleh resepsionis: 0 sampai kurang dari resep, alasan wajib", () => {
    expect(validateReduction({ quantity: 5, reason: " Stok kurang " }, { prescribed: 10 })).toEqual({ ok: true, value: { quantity: 5, reason: "Stok kurang" } });
    expect(validateReduction({ quantity: 0, reason: "Menolak" }, { prescribed: 10 })).toEqual({ ok: true, value: { quantity: 0, reason: "Menolak" } });
    expect(validateReduction({ quantity: 10, reason: "x" }, { prescribed: 10 })).toEqual({ ok: false, message: "Jumlah ditagih harus 0–9." });
    expect(validateReduction({ quantity: 1.5, reason: "Stok" }, { prescribed: 10 })).toEqual({ ok: false, message: "Jumlah ditagih harus 0–9." });
    expect(validateReduction({ quantity: 5, reason: "x" }, { prescribed: 10 })).toEqual({ ok: false, message: "Alasan 2–200 karakter." });
  });

  it("keterangan penagihan untuk dokter", () => {
    expect(billingLabel({ quantity: 10, billedQuantity: null, billingNote: null })).toBeNull();
    expect(billingLabel({ quantity: 10, billedQuantity: 5, billingNote: "Stok kurang" })).toBe("Ditagih 5 dari 10 — Stok kurang");
    expect(billingLabel({ quantity: 10, billedQuantity: 0, billingNote: "Customer menolak" })).toBe("Tidak ditagih — Customer menolak");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/prescription.test.ts` → Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi `src/lib/prescription.ts`**

```ts
/** Aturan resep dokter (spec resep dokter 3–4). Murni: dipakai formulir dan server. */
export const PRESCRIPTIONS_MAX = 30;
export const PRESCRIPTION_USAGE_MAX = 200;
const QUANTITY_MAX = 9999;

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** Satu baris resep apa adanya dari formulir (jumlah masih teks). */
export type PrescriptionInput = { itemId: string; quantity: string; usage: string };
export type PrescriptionDraft = { itemId: string; quantity: number; usage: string };

export function parsePrescriptions(rows: PrescriptionInput[]): Result<PrescriptionDraft[]> {
  if (rows.length > PRESCRIPTIONS_MAX) return { ok: false, message: `Paling banyak ${PRESCRIPTIONS_MAX} obat per resep.` };
  const value: PrescriptionDraft[] = [];
  for (const row of rows) {
    if (!row.itemId) return { ok: false, message: "Pilih obat dari daftar." };
    const text = row.quantity.trim();
    const quantity = Number(text);
    if (!/^\d+$/.test(text) || quantity < 1 || quantity > QUANTITY_MAX) return { ok: false, message: "Jumlah obat harus bilangan bulat 1–9.999." };
    const usage = row.usage.trim();
    if (!usage) return { ok: false, message: "Isi aturan pakai obat." };
    if (usage.length > PRESCRIPTION_USAGE_MAX) return { ok: false, message: `Aturan pakai terlalu panjang (maks. ${PRESCRIPTION_USAGE_MAX} karakter).` };
    value.push({ itemId: row.itemId, quantity, usage });
  }
  return { ok: true, value };
}

/** Obat yang bisa diresepkan: tanpa harga apa pun (spec resep dokter 7). */
export type MedicineOption = { id: string; code: string; name: string; unit: string; available: number };

/** Peringatan per obat bila jumlah semua barisnya melebihi sisa stok cabang (RD4: tidak menolak). */
export function stockWarnings(rows: { itemId: string; quantity: number }[], medicines: MedicineOption[]): Map<string, string> {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.quantity);
  const warnings = new Map<string, string>();
  for (const medicine of medicines) {
    const total = totals.get(medicine.id);
    if (total !== undefined && total > medicine.available) {
      warnings.set(medicine.id, `Sisa stok ${medicine.available} ${medicine.unit} — tagihan tertahan sampai stok cukup atau jumlah dikurangi.`);
    }
  }
  return warnings;
}

/** Pengurangan baris resep di tagihan oleh resepsionis (RD5): 0 ≤ jumlah < resep, alasan 2–200 karakter. */
export function validateReduction(raw: unknown, ctx: { prescribed: number }): Result<{ quantity: number; reason: string }> {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const quantity = value.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity >= ctx.prescribed) {
    return { ok: false, message: `Jumlah ditagih harus 0–${ctx.prescribed - 1}.` };
  }
  const reason = typeof value.reason === "string" ? value.reason.replace(/\s+/g, " ").trim() : "";
  if (reason.length < 2 || reason.length > 200) return { ok: false, message: "Alasan 2–200 karakter." };
  return { ok: true, value: { quantity, reason } };
}

/** Keterangan di catatan dokter bila resepsionis mengubah jumlah yang ditagih (spec resep dokter 4). */
export function billingLabel(line: { quantity: number; billedQuantity: number | null; billingNote: string | null }): string | null {
  if (line.billedQuantity === null) return null;
  if (line.billedQuantity === 0) return `Tidak ditagih — ${line.billingNote ?? ""}`;
  return `Ditagih ${line.billedQuantity} dari ${line.quantity} — ${line.billingNote ?? ""}`;
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/prescription.test.ts && npx tsc --noEmit -p .` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prescription.ts tests/unit/prescription.test.ts
git commit -m "feat: prescription validation, stock warnings, and billing reduction rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Draf kunjungan berisi resep; finalisasi membuat penyerahan dari dokter

**Files:**
- Modify: `src/lib/encounter.ts` (hapus `pharmacyNote` dari draf; tambah `prescriptions`; `EncounterOptions.medicines`)
- Create: `src/server/prescription-read.ts`
- Modify: `src/server/encounter.ts` (`resolvePrescriptions`, `writeDraft`, `finalizeEncounter`)
- Modify: `src/server/encounter-read.ts` (draf, `prescriptions`, `pharmacyNote` lama, `options.medicines`)
- Modify: `src/components/admin/encounter-form.tsx`, `src/components/admin/encounter-record.tsx` (hanya agar tetap terkompilasi: kolom Catatan untuk Apoteker dibuang dari formulir; catatan lama tampil dari `encounter.pharmacyNote`)
- Modify: `tests/unit/encounter.test.ts`, `tests/unit/components/encounter-form.test.tsx`, `tests/integration/encounter.test.ts`
- Test: `tests/integration/encounter-prescription.test.ts`

**Interfaces:**
- Consumes: `parsePrescriptions`, `PrescriptionInput`, `PrescriptionDraft`, `MedicineOption`, `billingLabel` (Task 2).
- Produces:
  - `EncounterDraftInput.prescriptions: PrescriptionInput[]`; `EncounterDraft.prescriptions: PrescriptionDraft[]`; `TextKey` = `subjective | physicalExam | assessment | plan` (tanpa `pharmacyNote`); `PHARMACY_NOTE_LABEL = "Catatan untuk Apoteker"`; `EncounterOptions.medicines: MedicineOption[]`.
  - `listPrescribableItems(branchId: string, includeIds: string[]): Promise<MedicineOption[]>` (`src/server/prescription-read.ts`, modul biasa).
  - `EncounterDetail.pharmacyNote: string | null` (catatan lama); `EncounterDetail.prescriptions: { id: string; itemName: string; quantity: number; usage: string; billing: string | null }[]`.

- [ ] **Step 1: Ubah uji yang ada dan tulis uji yang gagal**

`tests/unit/encounter.test.ts`: ganti uji "Catatan untuk Apoteker: …" (baris 55–64) dengan:

```ts
  it("resep ikut diperiksa; draf kosong tidak punya resep dan tidak punya Catatan untuk Apoteker", () => {
    expect(parseEncounterDraft(draft({ prescriptions: [{ itemId: "o1", quantity: "2", usage: "3 x 1" }] }))).toMatchObject({
      ok: true,
      value: { prescriptions: [{ itemId: "o1", quantity: 2, usage: "3 x 1" }] },
    });
    expect(parseEncounterDraft(draft({ prescriptions: [{ itemId: "o1", quantity: "0", usage: "3 x 1" }] }))).toEqual({
      ok: false,
      message: "Jumlah obat harus bilangan bulat 1–9.999.",
    });
    expect(emptyDraftInput().prescriptions).toEqual([]);
    expect("pharmacyNote" in emptyDraftInput()).toBe(false);
  });
```

`tests/unit/components/encounter-form.test.tsx`: ganti uji "ada kolom Catatan untuk Apoteker di bagian Plan …" (baris 308–317) dengan:

```tsx
  it("tidak ada lagi kolom Catatan untuk Apoteker (diganti resep, spec resep dokter 3)", () => {
    renderForm();
    expect(screen.queryByLabelText("Catatan untuk Apoteker")).not.toBeInTheDocument();
  });
```

(`renderForm` = pembantu render yang dipakai uji lain di berkas itu; bila namanya berbeda, pakai pembantu yang sama dengan uji di atasnya. Objek `options` di berkas ini harus diberi `medicines: []`.)

`tests/integration/encounter.test.ts`: ganti tiga uji "finalisasi dengan Catatan untuk Apoteker …", "tanpa Catatan untuk Apoteker …", "finalisasi yang gagal tidak meninggalkan penyerahan …" dengan:

```ts
  it("finalisasi tanpa resep tidak membuat penyerahan, bahkan bila draf lama berisi Catatan untuk Apoteker (Review Focus 1)", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    await prisma.encounter.update({ where: { id: encounterId }, data: { pharmacyNote: "Amoxicillin 3x1" } });
    const fresh = (await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).updatedAt.toISOString();
    await unwrap(finalizeEncounter({ encounterId, version: fresh, draft: draftWith({ assessment: "Kontrol" }) }));
    expect(await prisma.dispensing.count({ where: { appointmentId: appointment.id } })).toBe(0);
    expect((await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).pharmacyNote).toBe("Amoxicillin 3x1");
    void version;
  });
```

Buat `tests/integration/encounter-prescription.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { emptyDraftInput, type EncounterDraftInput } from "@/lib/encounter";
import { finalizeEncounter, openEncounter, saveEncounterDraft } from "@/server/encounter";
import { getEncounterForStaff } from "@/server/encounter-read";
import { listPrescribableItems } from "@/server/prescription-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "dr. Resep", role: "DOKTER" as const, email: "u@uji.test" } }));
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

const SLUG = "resep-kunjungan";
const WA = "6281200009731";
let world: BillingWorld;
let seq = 0;
const draft = (prescriptions: EncounterDraftInput["prescriptions"], patch: Partial<EncounterDraftInput> = {}): EncounterDraftInput => ({
  ...emptyDraftInput(),
  assessment: "Infeksi",
  ...patch,
  prescriptions,
});

async function openVisit() {
  seq += 1;
  const startAt = new Date(Date.UTC(2032, 0, 1, 1, 0) + seq * 3_600_000);
  const appointment = await prisma.appointment.create({
    data: {
      code: `RSK-${seq}`, type: "KONSULTASI", channel: "KLINIK", startAt, endAt: new Date(startAt.getTime() + 1_800_000), status: "HADIR",
      source: "WALK_IN", branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId: world.patientId,
    },
  });
  const { encounterId } = await unwrap(openEncounter(appointment.id));
  const version = (await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).updatedAt.toISOString();
  return { appointmentId: appointment.id, encounterId, version };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, world.drugId, 4);
  actor.staffId = world.doctorId;
});
beforeEach(() => {
  actor.role = "DOKTER";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("resep di catatan kunjungan (spec resep dokter 3–4)", () => {
  it("simpan draf menulis ulang resep dengan nama obat yang disalin", async () => {
    const { encounterId, version } = await openVisit();
    const saved = await unwrap(saveEncounterDraft({ encounterId, version, draft: draft([{ itemId: world.drugId, quantity: "10", usage: "3 x 1" }]) }));
    await unwrap(saveEncounterDraft({ encounterId, version: saved.version, draft: draft([{ itemId: world.productId, quantity: "1", usage: "Oles malam" }]) }));
    const rows = await prisma.encounterPrescription.findMany({ where: { encounterId } });
    expect(rows).toEqual([expect.objectContaining({ itemId: world.productId, itemName: `${SLUG} Serum C`, quantity: 1, usage: "Oles malam", sortOrder: 0 })]);
  });

  it("obat nonaktif atau tanpa harga jual ditolak dengan namanya (Review Focus 3)", async () => {
    const { encounterId, version } = await openVisit();
    const off = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-OFF`, name: `${SLUG} Obat Mati`, kind: "OBAT", unit: "tablet", sellPrice: null } });
    expect(await saveEncounterDraft({ encounterId, version, draft: draft([{ itemId: off.id, quantity: "1", usage: "1 x 1" }]) })).toEqual({
      ok: false,
      error: `Obat ${SLUG} Obat Mati sudah nonaktif atau belum punya harga jual. Hapus dari resep.`,
    });
    await prisma.stockItem.delete({ where: { id: off.id } });
  });

  it("finalisasi membuat penyerahan dari dokter berstatus Selesai dengan baris yang sama, dan resep terkunci", async () => {
    const { appointmentId, encounterId, version } = await openVisit();
    await unwrap(
      finalizeEncounter({
        encounterId,
        version,
        draft: draft([
          { itemId: world.drugId, quantity: "10", usage: "3 x 1 sesudah makan" },
          { itemId: world.productId, quantity: "1", usage: "Oles malam" },
        ]),
      }),
    );
    const dispensing = await prisma.dispensing.findUniqueOrThrow({ where: { appointmentId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    expect(dispensing).toMatchObject({ source: "DOKTER", status: "SELESAI", completedById: world.doctorId, completedByName: "dr. Resep", branchId: world.branchId });
    expect(dispensing.lines.map((l) => [l.itemId, l.quantity, l.usage])).toEqual([
      [world.drugId, 10, "3 x 1 sesudah makan"],
      [world.productId, 1, "Oles malam"],
    ]);
    expect(dispensing.lines.every((l) => l.prescriptionId !== null)).toBe(true);
    await expect(prisma.encounterPrescription.deleteMany({ where: { encounterId } })).rejects.toThrow(/rekam_medis_terkunci/);
  });

  it("finalisasi tanpa resep tidak membuat penyerahan", async () => {
    const { appointmentId, encounterId, version } = await openVisit();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draft([]) }));
    expect(await prisma.dispensing.count({ where: { appointmentId } })).toBe(0);
  });

  it("pilihan obat dokter: aktif dan berharga jual, dengan sisa stok, tanpa harga (Review Focus 5)", async () => {
    const options = await listPrescribableItems(world.branchId, []);
    const drug = options.find((o) => o.id === world.drugId)!;
    expect(drug).toEqual({ id: world.drugId, code: `${SLUG.toUpperCase()}-OBT`, name: `${SLUG} Amoxicillin`, unit: "kapsul", available: 4 });
    expect(Object.keys(drug)).not.toContain("sellPrice");
    const { encounterId } = await openVisit();
    const detail = (await getEncounterForStaff(encounterId))!;
    expect(detail.options.medicines.some((m) => m.id === world.drugId)).toBe(true);
    expect(JSON.stringify(detail.options.medicines)).not.toMatch(/sellPrice|unitCost/);
  });
});
```

Periksa tanda tangan `billingBatch` di `tests/integration/invoice-world.ts` (`grep -n "export function billingBatch" -A6 tests/integration/invoice-world.ts`); bila ia membangun data dan bukan menyimpan, ikuti cara pemakaiannya di `tests/integration/dispensing-lifecycle.test.ts` dan catat di ledger.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/encounter.test.ts && npm run test:integration -- tests/integration/encounter-prescription.test.ts` → Expected: FAIL (`prescriptions` belum ada; modul `prescription-read` tidak ada).

- [ ] **Step 3: `src/lib/encounter.ts`**

- tambahkan import `import { PRESCRIPTIONS_MAX, parsePrescriptions, type MedicineOption, type PrescriptionDraft, type PrescriptionInput } from "./prescription";`
- hapus `export const PHARMACY_NOTE_MAX = 1000;`; tambahkan `export const PHARMACY_NOTE_LABEL = "Catatan untuk Apoteker";`
- hapus baris `pharmacyNote: "Catatan untuk Apoteker",` dari `TEXT_FIELDS`
- `EncounterDraftInput`: tambahkan `prescriptions: PrescriptionInput[];`; `EncounterDraft`: tambahkan `prescriptions: PrescriptionDraft[];`
- `EncounterOptions`: tambahkan `medicines: MedicineOption[];`
- `encounterDraftInputSchema`: hapus `pharmacyNote: text,`; tambahkan sesudah `treatments`:

```ts
    prescriptions: z
      .array(z.object({ itemId: z.string().max(100), quantity: z.string().max(20), usage: text }).strict())
      .max(PRESCRIPTIONS_MAX * 2),
```

- `parseEncounterDraft`: ganti `const max = key === "pharmacyNote" ? PHARMACY_NOTE_MAX : ENCOUNTER_TEXT_MAX;` dengan `const max = ENCOUNTER_TEXT_MAX;`; sebelum `return { ok: true, … }` tambahkan:

```ts
  const prescriptions = parsePrescriptions(input.prescriptions);
  if (!prescriptions.ok) return prescriptions;
```

dan kembalikan `{ ok: true, value: { ...texts, vitals, treatments, prescriptions: prescriptions.value } }`.
- `emptyDraftInput`: hapus `pharmacyNote: "",`; tambahkan `prescriptions: [],`.

- [ ] **Step 4: `src/server/prescription-read.ts`**

```ts
import { prisma } from "@/lib/db";
import type { MedicineOption } from "@/lib/prescription";
import { stockFlags } from "@/lib/stock";
import { witaDateString } from "@/lib/time";

/**
 * Obat yang bisa diresepkan dokter di satu cabang (spec resep dokter 3): aktif dan berharga jual, beserta sisa stok cabang.
 * Harga beli dan jual sengaja tidak dipilih. `includeIds` = obat yang sudah ada di draf, tetap tampil walau sudah tak memenuhi.
 * Modul biasa: dipanggil dari bacaan kunjungan yang sudah memeriksa hak.
 */
export async function listPrescribableItems(branchId: string, includeIds: string[]): Promise<MedicineOption[]> {
  const today = witaDateString(new Date());
  const items = await prisma.stockItem.findMany({
    where: { OR: [{ isActive: true, sellPrice: { not: null } }, { id: { in: includeIds } }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      batches: { where: { branchId, quantityRemaining: { gt: 0 } }, select: { quantityRemaining: true, expiryDate: true } },
    },
  });
  return items.map(({ batches, ...item }) => ({ ...item, available: stockFlags(batches.map((b) => ({ ...b, unitCost: 0 })), 0, today).available }));
}
```

- [ ] **Step 5: `src/server/encounter.ts`**

- tambahkan tipe dan fungsi sesudah `resolveTreatments`:

```ts
type PrescriptionRow = { itemId: string; itemName: string; quantity: number; usage: string };

/** Nama obat dibaca dari basis data dan disalin; obat harus aktif dan berharga jual (spec resep dokter 3, Review Focus 3). */
async function resolvePrescriptions(draft: EncounterDraft): Promise<PrescriptionRow[]> {
  if (draft.prescriptions.length === 0) return [];
  const items = await prisma.stockItem.findMany({
    where: { id: { in: draft.prescriptions.map((row) => row.itemId) } },
    select: { id: true, name: true, isActive: true, sellPrice: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  return draft.prescriptions.map((row) => {
    const item = byId.get(row.itemId);
    if (!item) throw new UserFacingError("Obat tidak ditemukan. Muat ulang halaman.");
    if (!item.isActive || item.sellPrice === null) throw new UserFacingError(`Obat ${item.name} sudah nonaktif atau belum punya harga jual. Hapus dari resep.`);
    return { itemId: item.id, itemName: item.name, quantity: row.quantity, usage: row.usage };
  });
}
```

- `writeDraft`: tambahkan parameter `prescriptions: PrescriptionRow[]` sesudah `treatments`; hapus `pharmacyNote: draft.pharmacyNote,` dari `data`; sesudah blok `encounterTreatment.createMany` tambahkan:

```ts
  await tx.encounterPrescription.deleteMany({ where: { encounterId } });
  if (prescriptions.length > 0) {
    await tx.encounterPrescription.createMany({ data: prescriptions.map((row, index) => ({ ...row, encounterId, sortOrder: index })) });
  }
```

- `saveEncounterDraft`: sesudah `const treatments = await resolveTreatments(draft);` tambahkan `const prescriptions = await resolvePrescriptions(draft);` dan teruskan ke `writeDraft(tx, encounterId, version, draft, treatments, prescriptions)`.
- `finalizeEncounter`: sama, `const prescriptions = await resolvePrescriptions(draft);` dan `writeDraft(…, treatments, prescriptions)`. Ganti blok

```ts
        // Catatan untuk Apoteker terisi: satu penyerahan Menunggu di cabang booking (spec penyerahan 3.3).
        if (!draft.pharmacyNote) return null;
        const created = await tx.dispensing.create({
          data: { appointmentId: appointment.id, branchId: appointment.branchId },
          select: { id: true },
        });
        return created.id;
```

dengan:

```ts
        // Resep dokter langsung menjadi penyerahan Selesai (spec resep dokter 4). Tagihan kunjungan belum mungkin ada
        // (createInvoiceFromVisit mensyaratkan catatan final), jadi barisnya terisi saat resepsionis membuat tagihan.
        // Kunjungan tidak lagi membuat penyerahan Menunggu (RD3), walau draf lama berisi Catatan untuk Apoteker.
        const rows = await tx.encounterPrescription.findMany({ where: { encounterId }, orderBy: { sortOrder: "asc" } });
        if (rows.length === 0) return null;
        const created = await tx.dispensing.create({
          data: {
            appointmentId: appointment.id,
            branchId: appointment.branchId,
            source: "DOKTER",
            status: "SELESAI",
            completedAt: new Date(),
            completedById: actor.staffId,
            completedByName: actor.name,
            lines: {
              create: rows.map((row) => ({ itemId: row.itemId, itemName: row.itemName, quantity: row.quantity, usage: row.usage, sortOrder: row.sortOrder, prescriptionId: row.id })),
            },
          },
          select: { id: true },
        });
        return created.id;
```

Catatan: urutan dalam transaksi — `writeDraft` (resep ditulis selagi DRAF) lalu `encounter.update` ke FINAL. Pindahkan pembacaan `encounterPrescription.findMany` ke sebelum `tx.encounter.update({ … status: "FINAL" … })` bila Prisma menolak membaca (membaca tidak dicegah trigger; yang dicegah hanya tulis). Pembuatan `DispensingLine` dengan `prescriptionId` tidak mengubah baris resep, jadi trigger tidak terpicu.

Ganti ringkasan audit `dispensing.create` menjadi `` `${appointment.code}: resep dokter` `` dan tambahkan `safeRevalidatePath("/admin/tagihan");` di sebelah `safeRevalidatePath("/admin/resep");`.

- [ ] **Step 6: `src/server/encounter-read.ts`**

- di `select` `getEncounterForStaff`, sesudah `treatments: TREATMENT_SELECT,` tambahkan:

```ts
      prescriptions: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, itemId: true, itemName: true, quantity: true, usage: true, dispensingLine: { select: { billedQuantity: true, billingNote: true } } },
      },
```

  dan ambil `branchId: true` di `appointment.select`.
- tipe `EncounterDetail`: tambahkan `pharmacyNote: string | null;` dan `prescriptions: { id: string; itemName: string; quantity: number; usage: string; billing: string | null }[];`.
- sesudah `Promise.all([...])`, ambil obat: `const medicines = await listPrescribableItems(appointment.branchId, row.prescriptions.map((p) => p.itemId));` (import dari `@/server/prescription-read`; `billingLabel` dari `@/lib/prescription`).
- objek kembali: `options: { ...options, medicines }`; `pharmacyNote: row.pharmacyNote`; `prescriptions: row.prescriptions.map((p) => ({ id: p.id, itemName: p.itemName, quantity: p.quantity, usage: p.usage, billing: p.dispensingLine ? billingLabel({ quantity: p.quantity, billedQuantity: p.dispensingLine.billedQuantity, billingNote: p.dispensingLine.billingNote }) : null }))`; di `draft`: hapus `pharmacyNote: …`, tambahkan `prescriptions: row.prescriptions.map((p) => ({ itemId: p.itemId, quantity: String(p.quantity), usage: p.usage }))`.
- Bila `loadOptions` mengembalikan `EncounterOptions` (sekarang wajib `medicines`), ubah tipe kembalinya menjadi `Omit<EncounterOptions, "medicines">`.

- [ ] **Step 7: Agar formulir dan tampilan tetap terkompilasi**

`src/components/admin/encounter-form.tsx`: hapus `PHARMACY_NOTE_MAX` dari import dan hapus blok `<NoteField label={TEXT_FIELDS.pharmacyNote} … />` di bagian Plan (bagian Resep dibuat di Task 4).

`src/components/admin/encounter-record.tsx`: import `PHARMACY_NOTE_LABEL` dari `@/lib/encounter`; ganti `<RecordText label={TEXT_FIELDS.pharmacyNote} value={draft.pharmacyNote} />` dengan:

```tsx
        {encounter.pharmacyNote && <RecordText label={PHARMACY_NOTE_LABEL} value={encounter.pharmacyNote} />}
```

Cari pemakaian lain: `grep -rn "pharmacyNote\|PHARMACY_NOTE_MAX" src tests --include=*.ts --include=*.tsx | grep -v dispensing` dan sesuaikan (objek `EncounterOptions` di uji komponen mendapat `medicines: []`; objek `draft` di uji mendapat `prescriptions: []`).

- [ ] **Step 8: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/encounter.test.ts tests/unit/components/encounter-form.test.tsx && npm run test:integration -- tests/integration/encounter-prescription.test.ts tests/integration/encounter.test.ts tests/integration/encounter-read.test.ts`
Expected: semua PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/encounter.ts src/server/prescription-read.ts src/server/encounter.ts src/server/encounter-read.ts src/components/admin/encounter-form.tsx src/components/admin/encounter-record.tsx tests/unit/encounter.test.ts tests/unit/components/encounter-form.test.tsx tests/integration/encounter.test.ts tests/integration/encounter-prescription.test.ts
git commit -m "feat: save prescriptions with the visit draft and turn them into a doctor dispensing on finalize

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Tambahkan berkas uji lain yang ikut disesuaikan di Step 7.)

---

### Task 4: Bagian Resep di formulir dan catatan final

**Files:**
- Create: `src/components/admin/prescription-fields.tsx`
- Modify: `src/components/admin/encounter-form.tsx` (bagian "Resep" sesudah bagian Plan)
- Modify: `src/components/admin/encounter-record.tsx` (tabel resep baca-saja)
- Test: `tests/unit/components/prescription-fields.test.tsx`, `tests/unit/components/encounter-record.test.tsx` (bila belum ada, buat)

**Interfaces:**
- Consumes: `PrescriptionInput`, `MedicineOption`, `stockWarnings`, `PRESCRIPTION_USAGE_MAX` (Task 2); `EncounterDetail.prescriptions` (Task 3).
- Produces: `PrescriptionFields({ rows, medicines, onChange }: { rows: PrescriptionInput[]; medicines: MedicineOption[]; onChange: (rows: PrescriptionInput[]) => void })`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/prescription-fields.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PrescriptionFields } from "@/components/admin/prescription-fields";
import type { PrescriptionInput } from "@/lib/prescription";
import { renderAdmin } from "../helpers/render-admin";

const MEDICINES = [
  { id: "o1", code: "AMX", name: "Amoxicillin", unit: "kapsul", available: 4 },
  { id: "o2", code: "VIT", name: "Vitamin C", unit: "tablet", available: 30 },
];

function Harness({ initial = [] as PrescriptionInput[] }) {
  const [rows, setRows] = useState(initial);
  return <PrescriptionFields rows={rows} medicines={MEDICINES} onChange={setRows} />;
}

describe("PrescriptionFields (spec resep dokter 3)", { timeout: 15_000 }, () => {
  it("menambah obat, menampilkan sisa stok tanpa harga, dan memperingatkan bila melebihi stok", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness />);
    expect(screen.getByText("Belum ada obat di resep ini.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tambah obat" }));
    const first = screen.getByRole("group", { name: "Obat 1" });
    await user.selectOptions(within(first).getByLabelText("Obat"), "o1");
    expect(first).toHaveTextContent("Sisa 4 kapsul");
    expect(first).not.toHaveTextContent("Rp");
    await user.clear(within(first).getByLabelText("Jumlah"));
    await user.type(within(first).getByLabelText("Jumlah"), "10");
    expect(within(first).getByRole("alert")).toHaveTextContent("Sisa stok 4 kapsul — tagihan tertahan sampai stok cukup atau jumlah dikurangi.");
    await user.type(within(first).getByLabelText("Aturan pakai"), "3 x 1");
    await user.click(screen.getByRole("button", { name: "Hapus obat 1" }));
    expect(screen.getByText("Belum ada obat di resep ini.")).toBeInTheDocument();
  });

  it("peringatan menjumlahkan dua baris obat yang sama", async () => {
    renderAdmin(
      <Harness
        initial={[
          { itemId: "o1", quantity: "3", usage: "pagi" },
          { itemId: "o1", quantity: "2", usage: "malam" },
        ]}
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
```

Tambahkan di uji tampilan catatan final (`tests/unit/components/encounter-record.test.tsx`; bila berkas belum ada, buat dengan pola render `EncounterRecord` dari uji halaman kunjungan yang sudah ada — cari dengan `grep -rln "EncounterRecord" tests/unit`):

```tsx
  it("menampilkan resep beserta keterangan penagihan, dan Catatan untuk Apoteker lama bila ada", () => {
    renderAdmin(
      <EncounterRecord
        encounter={{
          ...ENCOUNTER,
          pharmacyNote: "Amoxicillin 3x1 (lama)",
          prescriptions: [
            { id: "p1", itemName: "Amoxicillin", quantity: 10, usage: "3 x 1 sesudah makan", billing: "Ditagih 5 dari 10 — Stok kurang" },
            { id: "p2", itemName: "Vitamin C", quantity: 30, usage: "1 x 1", billing: null },
          ],
        }}
      />,
    );
    const table = screen.getByRole("table", { name: "Resep" });
    expect(table).toHaveTextContent("Amoxicillin");
    expect(table).toHaveTextContent("Ditagih 5 dari 10 — Stok kurang");
    expect(screen.getByText("Amoxicillin 3x1 (lama)")).toBeInTheDocument();
  });
```

(`ENCOUNTER` = fixture `EncounterDetail` yang dipakai uji itu; tambahkan `pharmacyNote: null, prescriptions: []` ke fixture dasar.)

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/prescription-fields.test.tsx` → Expected: FAIL (modul tidak ada).

- [ ] **Step 3: `src/components/admin/prescription-fields.tsx`**

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { PRESCRIPTION_USAGE_MAX, stockWarnings, type MedicineOption, type PrescriptionInput } from "@/lib/prescription";
import { SelectField } from "./mui/select-field";

/** Resep dokter (spec resep dokter 3): obat dari stok cabang, jumlah, aturan pakai. Sisa stok tampil tanpa harga. */
export function PrescriptionFields({ rows, medicines, onChange }: { rows: PrescriptionInput[]; medicines: MedicineOption[]; onChange: (rows: PrescriptionInput[]) => void }) {
  const byId = new Map(medicines.map((m) => [m.id, m]));
  const warnings = stockWarnings(
    rows.map((r) => ({ itemId: r.itemId, quantity: Number(r.quantity) || 0 })),
    medicines,
  );
  const set = (index: number, patch: Partial<PrescriptionInput>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Stack spacing={1.5}>
      {rows.length === 0 && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Belum ada obat di resep ini.
        </Typography>
      )}
      {rows.map((row, index) => {
        const medicine = byId.get(row.itemId);
        const warning = warnings.get(row.itemId);
        return (
          <Paper key={index} component="fieldset" variant="outlined" sx={{ m: 0, p: 1.5, minWidth: 0 }}>
            <Box component="legend" sx={{ px: 0.5, fontSize: "0.875rem", fontWeight: 500 }}>
              Obat {index + 1}
            </Box>
            <Stack spacing={1.5}>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
                <SelectField label="Obat" value={row.itemId} onChange={(itemId) => set(index, { itemId })}>
                  <option value="">Pilih obat</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Jumlah"
                  type="number"
                  value={row.quantity}
                  onChange={(e) => set(index, { quantity: e.target.value })}
                  fullWidth
                  slotProps={{ htmlInput: { min: 1, max: 9999 } }}
                  helperText={medicine ? `Sisa ${medicine.available} ${medicine.unit}` : " "}
                />
              </Box>
              <TextField
                label="Aturan pakai"
                placeholder="mis. 3 x 1 sesudah makan"
                value={row.usage}
                onChange={(e) => set(index, { usage: e.target.value })}
                fullWidth
                slotProps={{ htmlInput: { maxLength: PRESCRIPTION_USAGE_MAX } }}
              />
              {warning && (
                <Alert severity="warning" role="alert">
                  {warning}
                </Alert>
              )}
              <Box>
                <Button type="button" variant="outlined" size="small" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                  Hapus obat {index + 1}
                </Button>
              </Box>
            </Stack>
          </Paper>
        );
      })}
      <Box>
        <Button type="button" variant="outlined" onClick={() => onChange([...rows, { itemId: medicines[0]?.id ?? "", quantity: "1", usage: "" }])}>
          Tambah obat
        </Button>
      </Box>
    </Stack>
  );
}
```

Catatan: `helperText` "Sisa …" muncul sebagai teks di dalam fieldset, sehingga uji `toHaveTextContent("Sisa 4 kapsul")` terpenuhi. Pada uji pertama, pilihan awal baris baru adalah obat pertama (`o1`); `selectOptions("o1")` tetap sah.

- [ ] **Step 4: Sambungkan ke formulir dan catatan final**

`src/components/admin/encounter-form.tsx`: import `PrescriptionFields` dari `./prescription-fields`; sesudah `</Section>` bagian Plan tambahkan:

```tsx
      <Section id="bagian-resep" title="Resep">
        <PrescriptionFields rows={draft.prescriptions} medicines={options.medicines} onChange={(prescriptions) => update({ ...draft, prescriptions })} />
      </Section>
```

`src/components/admin/encounter-record.tsx`: sesudah bagian Plan tambahkan (pakai komponen tabel MUI yang sudah diimpor berkas itu):

```tsx
      <Part id="bagian-resep" title="Resep">
        {encounter.prescriptions.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Tidak ada resep di kunjungan ini.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" aria-label="Resep">
              <TableHead>
                <TableRow>
                  <TableCell>Obat</TableCell>
                  <TableCell align="right">Jumlah</TableCell>
                  <TableCell>Aturan pakai</TableCell>
                  <TableCell>Penagihan</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {encounter.prescriptions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.itemName}</TableCell>
                    <TableCell align="right">{p.quantity}</TableCell>
                    <TableCell>{p.usage}</TableCell>
                    <TableCell>{p.billing ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Part>
```

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/prescription-fields.test.tsx tests/unit/components/encounter-record.test.tsx tests/unit/components/encounter-form.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit -p .` → Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/prescription-fields.tsx src/components/admin/encounter-form.tsx src/components/admin/encounter-record.tsx tests/unit/components/prescription-fields.test.tsx tests/unit/components/encounter-record.test.tsx
git commit -m "feat: prescription section in the visit form and the final record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Baris resep di tagihan: kurangi atau hapus dengan alasan, pembatalan

**Files:**
- Modify: `src/server/invoice-drafts.ts` (aksi baru `reducePrescriptionLine`; pesan baris resep di `updateInvoiceLine`/`removeInvoiceLine`)
- Modify: `src/server/invoice-lifecycle.ts` (`cancelInvoice`)
- Modify: `src/server/invoice-read.ts` (`InvoiceLineRow.prescription`, `InvoiceDetail.hasPrescription`)
- Create: `src/components/admin/billing/reduce-prescription-dialog.tsx`
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`
- Test: `tests/integration/invoice-prescription.test.ts`, `tests/unit/components/reduce-prescription-dialog.test.tsx`

**Interfaces:**
- Consumes: `validateReduction` (Task 2); penyerahan `source = DOKTER` (Task 1, 3).
- Produces: `reducePrescriptionLine(input: { invoiceId: string; version: number; lineId: string; quantity: number; reason: string }): Promise<EditResult>`; `InvoiceLineRow.prescription: { prescribedQuantity: number; usage: string } | null`; `InvoiceDetail.hasPrescription: boolean`; `ReducePrescriptionDialog({ invoiceId, version, line, disabled })`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/invoice-prescription.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoiceFromVisit, reducePrescriptionLine, removeInvoiceLine, updateInvoiceLine } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Rina Resepsionis", role: "RESEPSIONIS" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "tagih-resep";
const WA = "6281200009732";
let world: BillingWorld;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

/** Kunjungan final dengan penyerahan dari dokter berisi satu baris obat (10 kapsul). */
async function doctorVisit() {
  const { appointmentId } = await finalVisit(world, { treatments: [] });
  const { id, lineIds } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 10, usage: "3 x 1 sesudah makan" }] });
  await prisma.dispensing.update({ where: { id }, data: { source: "DOKTER" } });
  return { appointmentId, dispensingLineId: lineIds[0] };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, world.drugId, 50);
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("baris resep dokter di tagihan (spec resep dokter 4)", () => {
  it("terisi saat tagihan dibuat; bisa dikurangi dengan alasan; keterangan tersimpan untuk dokter", async () => {
    const { appointmentId, dispensingLineId } = await doctorVisit();
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const detail = (await getInvoiceDetail(id))!;
    const line = detail.lines.find((l) => l.prescription)!;
    expect(line).toMatchObject({ quantity: 10, prescription: { prescribedQuantity: 10, usage: "3 x 1 sesudah makan" } });
    expect(detail.hasPrescription).toBe(true);

    expect(await reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 10, reason: "x" })).toEqual({ ok: false, error: "Jumlah ditagih harus 0–9." });
    expect(await reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 5, reason: "" })).toEqual({ ok: false, error: "Alasan 2–200 karakter." });
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 5, reason: "Stok kurang" }));
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).quantity).toBe(5);
    expect(await prisma.dispensingLine.findUniqueOrThrow({ where: { id: dispensingLineId } })).toMatchObject({ billedQuantity: 5, billingNote: "Stok kurang" });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "invoice.update" }, orderBy: { createdAt: "desc" } })).summary).toBe(
      `Kurangi ${SLUG} Amoxicillin: ×5 dari 10 — Stok kurang`,
    );
  });

  it("jumlah 0 menghapus baris; ubah jumlah atau hapus biasa diarahkan ke Kurangi", async () => {
    const { appointmentId, dispensingLineId } = await doctorVisit();
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const line = (await getInvoiceDetail(id))!.lines.find((l) => l.prescription)!;
    expect(await updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 3, unitPrice: line.unitPrice, priceNote: "" })).toEqual({
      ok: false,
      error: "Jumlah obat dari resep dokter diubah lewat tombol Kurangi.",
    });
    expect(await removeInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: line.id })).toEqual({
      ok: false,
      error: "Obat dari resep dokter dihapus lewat tombol Kurangi (jumlah 0) dengan alasan.",
    });
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 0, reason: "Customer menolak" }));
    expect(await prisma.invoiceLine.findUnique({ where: { id: line.id } })).toBeNull();
    expect((await prisma.dispensingLine.findUniqueOrThrow({ where: { id: dispensingLineId } })).billedQuantity).toBe(0);
  });

  it("baris penyerahan Apoteker lama tidak bisa dikurangi lewat aksi resep (Review Focus 4)", async () => {
    const { appointmentId } = await finalVisit(world, { treatments: [] });
    await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 2 }] });
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const line = (await getInvoiceDetail(id))!.lines.find((l) => l.fromDispensing)!;
    expect(line.prescription).toBeNull();
    expect(await reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 1, reason: "Stok" })).toEqual({
      ok: false,
      error: "Hanya baris dari resep dokter yang bisa dikurangi di sini.",
    });
  });

  it("pembatalan tagihan: penyerahan dokter tetap Selesai dan tagihan baru berisi jumlah resep asli (Review Focus 2)", async () => {
    const { appointmentId, dispensingLineId } = await doctorVisit();
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const line = (await getInvoiceDetail(id))!.lines.find((l) => l.prescription)!;
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 4, reason: "Stok kurang" }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
    actor.role = "ADMIN_KEUANGAN" as never;
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Salah pasien" }));
    actor.role = "RESEPSIONIS";

    expect((await prisma.dispensing.findUniqueOrThrow({ where: { appointmentId } })).status).toBe("SELESAI");
    expect(await prisma.dispensingLine.findUniqueOrThrow({ where: { id: dispensingLineId } })).toMatchObject({ billedQuantity: null, billingNote: null });
    const again = await unwrap(createInvoiceFromVisit(appointmentId));
    expect((await getInvoiceDetail(again.id))!.lines.find((l) => l.prescription)!.quantity).toBe(10);
  });
});
```

Sebelum menjalankan, periksa hak `cancelInvoice` (`grep -n "requireCapability" src/server/invoice-lifecycle.ts`) dan peran yang memilikinya; sesuaikan `actor.role` sementara (mis. `SUPER_ADMIN`) bila Admin Keuangan tidak berhak, dan catat di ledger. Periksa juga bahwa `finalVisit(world, { treatments: [] })` menghasilkan kunjungan tanpa baris treatment (bila tidak didukung, biarkan treatment bawaan; uji memilih baris dengan `l.prescription`).

Buat `tests/unit/components/reduce-prescription-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReducePrescriptionDialog } from "@/components/admin/billing/reduce-prescription-dialog";
import { reducePrescriptionLine } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ reducePrescriptionLine: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reducePrescriptionLine).mockResolvedValue({ ok: true, data: { version: 2 } });
});

describe("ReducePrescriptionDialog (spec resep dokter 4)", { timeout: 15_000 }, () => {
  it("mengirim jumlah baru dan alasan; galat validasi tampil", async () => {
    const user = userEvent.setup();
    renderAdmin(<ReducePrescriptionDialog invoiceId="inv" version={1} line={{ id: "l1", name: "Amoxicillin", quantity: 10, prescription: { prescribedQuantity: 10, usage: "3 x 1" } }} />);
    await user.click(screen.getByRole("button", { name: "Kurangi Amoxicillin" }));
    const dialog = screen.getByRole("dialog", { name: "Kurangi Amoxicillin" });
    expect(dialog).toHaveTextContent("Resep dokter: 10");
    await user.clear(screen.getByLabelText("Jumlah ditagih"));
    await user.type(screen.getByLabelText("Jumlah ditagih"), "4");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Alasan 2–200 karakter.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Alasan"), "Stok kurang");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(reducePrescriptionLine).toHaveBeenCalledWith({ invoiceId: "inv", version: 1, lineId: "l1", quantity: 4, reason: "Stok kurang" }));
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/invoice-prescription.test.ts && npx vitest run tests/unit/components/reduce-prescription-dialog.test.tsx` → Expected: FAIL.

- [ ] **Step 3: Aksi `reducePrescriptionLine` dan pesan baris resep**

Di `src/server/invoice-drafts.ts`:
- import `validateReduction` dari `@/lib/prescription`.
- di `updateInvoiceLine`, tambahkan ke `select` baris: `dispensingLine: { select: { dispensing: { select: { source: true } } } },` dan ganti baris `if (line.dispensingLineId && input.quantity !== line.quantity) throw new UserFacingError(DISPENSED_QUANTITY);` dengan:

```ts
      if (line.dispensingLineId && input.quantity !== line.quantity) {
        throw new UserFacingError(line.dispensingLine?.dispensing.source === "DOKTER" ? "Jumlah obat dari resep dokter diubah lewat tombol Kurangi." : DISPENSED_QUANTITY);
      }
```

- di `removeInvoiceLine`, ganti `select` menjadi `{ id: true, name: true, dispensingLineId: true, dispensingLine: { select: { dispensing: { select: { source: true } } } } }` dan ganti `if (line.dispensingLineId) throw new UserFacingError(DISPENSED_REMOVE);` dengan:

```ts
      if (line.dispensingLineId) {
        throw new UserFacingError(line.dispensingLine?.dispensing.source === "DOKTER" ? "Obat dari resep dokter dihapus lewat tombol Kurangi (jumlah 0) dengan alasan." : DISPENSED_REMOVE);
      }
```

- tambahkan sesudah `removeInvoiceLine`:

```ts
/**
 * Resepsionis mengurangi atau menghapus (jumlah 0) baris dari resep dokter dengan alasan (spec resep dokter 4, RD5).
 * Jumlah yang ditagih dan alasannya disimpan di baris penyerahan supaya dokter melihatnya di catatan kunjungan.
 */
export async function reducePrescriptionLine(input: { invoiceId: string; version: number; lineId: string; quantity: number; reason: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input?.lineId ?? ""), invoiceId },
        select: {
          id: true,
          name: true,
          unitPrice: true,
          itemId: true,
          discountAmount: true,
          discountReason: true,
          discountSource: true,
          dispensingLine: { select: { id: true, quantity: true, dispensing: { select: { source: true } } } },
        },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (!line.dispensingLine || line.dispensingLine.dispensing.source !== "DOKTER") throw new UserFacingError("Hanya baris dari resep dokter yang bisa dikurangi di sini.");
      const checked = validateReduction(input, { prescribed: line.dispensingLine.quantity });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const { quantity, reason } = checked.value;

      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        if (quantity === 0) {
          await tx.invoiceLine.delete({ where: { id: line.id } });
          return;
        }
        // Diskon mengikuti jumlah baru: promo dihitung ulang, diskon manual dipotong ke harga baris (sama dengan updateInvoiceLine).
        const gross = quantity * line.unitPrice;
        let discount: { discountAmount: number; discountReason: string | null; discountSource: "PROMO" | "MANUAL" | null } = {
          discountAmount: Math.min(line.discountAmount, gross),
          discountReason: line.discountReason,
          discountSource: line.discountSource,
        };
        if (line.discountSource === "PROMO" && line.itemId) {
          const item = await tx.stockItem.findUnique({ where: { id: line.itemId }, select: PROMO_SELECT });
          const promo = item ? promoDiscount(item, { quantity, unitPrice: line.unitPrice }, witaDateString(new Date())) : null;
          discount = promo ? { discountAmount: promo.amount, discountReason: promo.reason, discountSource: "PROMO" } : { ...NO_DISCOUNT };
        }
        if (discount.discountAmount === 0) discount = { ...NO_DISCOUNT };
        await tx.invoiceLine.update({ where: { id: line.id }, data: { quantity, ...discount } });
      });
      await tx.dispensingLine.update({ where: { id: line.dispensingLine.id }, data: { billedQuantity: quantity, billingNote: reason } });
      return { version, summary: `Kurangi ${line.name}: ×${quantity} dari ${line.dispensingLine.quantity} — ${reason}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}
```

(`PROMO_SELECT`, `NO_DISCOUNT`, `promoDiscount`, `witaDateString`, `guardDiscount`, `touchDraft`, `can` sudah dipakai `updateInvoiceLine` di berkas ini.)

- [ ] **Step 4: Pembatalan tagihan**

Di `src/server/invoice-lifecycle.ts` (`cancelInvoice`), tepat sebelum baris `await tx.invoiceLine.updateMany({ where: { invoiceId, dispensingLineId: { not: null } }, data: { dispensingLineId: null } });` tambahkan:

```ts
      // Resep dokter: jumlah yang dikurangi resepsionis berlaku untuk tagihan ini saja; tagihan baru memakai resep asli (spec resep dokter 4).
      if (invoice.appointmentId) {
        await tx.dispensingLine.updateMany({
          where: { dispensing: { appointmentId: invoice.appointmentId, source: "DOKTER" } },
          data: { billedQuantity: null, billingNote: null },
        });
      }
```

dan pada `tx.dispensing.updateMany({ where: { appointmentId: invoice.appointmentId, status: { not: "MENUNGGU" } }, … })` tambahkan `source: "APOTEKER"` ke `where` (penyerahan dokter tetap Selesai).

- [ ] **Step 5: Bacaan tagihan**

Di `src/server/invoice-read.ts`:
- `InvoiceLineRow`: tambahkan `/** Baris dari resep dokter (spec resep dokter 4): bisa dikurangi resepsionis dengan alasan. */ prescription: { prescribedQuantity: number; usage: string } | null;`
- `InvoiceDetail`: tambahkan `/** Ada baris dari resep dokter: tombol Cetak etiket tampil. */ hasPrescription: boolean;`
- di `select` baris tagihan tambahkan `dispensingLine: { select: { quantity: true, usage: true, dispensing: { select: { source: true } } } },`
- di pemetaan baris tambahkan `prescription: line.dispensingLine?.dispensing.source === "DOKTER" ? { prescribedQuantity: line.dispensingLine.quantity, usage: line.dispensingLine.usage } : null,`
- di objek kembali `getInvoiceDetail` tambahkan `hasPrescription: lines.some((l) => l.prescription !== null),` (pakai nama variabel baris yang sudah dipetakan di fungsi itu).
- perbaiki semua fixture `InvoiceLineRow`/`InvoiceDetail` di uji unit (`grep -rln "fromDispensing" tests/unit`) dengan `prescription: null` dan `hasPrescription: false`.

- [ ] **Step 6: Dialog Kurangi dan editor**

Buat `src/components/admin/billing/reduce-prescription-dialog.tsx`:

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
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { validateReduction } from "@/lib/prescription";
import { reducePrescriptionLine } from "@/server/invoice-drafts";
import { DialogCloseButton } from "../mui/dialog-close-button";

type Line = { id: string; name: string; quantity: number; prescription: { prescribedQuantity: number; usage: string } };

/** Kurangi atau hapus (jumlah 0) baris dari resep dokter, dengan alasan (spec resep dokter 4). */
export function ReducePrescriptionDialog({ invoiceId, version, line, disabled }: { invoiceId: string; version: number; line: Line; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const prescribed = line.prescription.prescribedQuantity;

  function save() {
    const checked = validateReduction({ quantity: Number(quantity), reason }, { prescribed });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await reducePrescriptionLine({ invoiceId, version, lineId: line.id, ...checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" size="small" variant="text" disabled={disabled} onClick={() => setOpen(true)} aria-label={`Kurangi ${line.name}`}>
        Kurangi
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Kurangi {line.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Resep dokter: {prescribed} · {line.prescription.usage}. Isi 0 untuk tidak menagih obat ini.
            </Typography>
            <TextField
              id={`reduce-qty-${line.id}`}
              label="Jumlah ditagih"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 0, max: prescribed - 1 } }}
            />
            <TextField id={`reduce-reason-${line.id}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
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

Di `src/components/admin/billing/invoice-draft-editor.tsx` (`LineRow`):
- ganti blok label `{line.fromDispensing && ( … Dari penyerahan Apoteker … )}` sehingga baris resep dokter berlabel "Dari resep dokter" (ikon dan `aria-label` sama polanya) dan menampilkan aturan pakai:

```tsx
        {line.fromDispensing && (
          <Box component="span" sx={{ mt: 0.5, display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>
            <LockOutlined role="img" aria-hidden={false} aria-label={line.prescription ? "Dari resep dokter" : "Dari penyerahan Apoteker"} sx={{ fontSize: 14 }} />{" "}
            {line.prescription ? `Dari resep dokter · ${line.prescription.usage}` : "Dari penyerahan Apoteker"}
          </Box>
        )}
```

- di sel aksi, sebelum tombol Simpan tambahkan `{line.prescription && <ReducePrescriptionDialog invoiceId={detail.id} version={detail.version} line={{ id: line.id, name: line.name, quantity: line.quantity, prescription: line.prescription }} disabled={disabled} />}` (import dari `./reduce-prescription-dialog`).

- [ ] **Step 7: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/components/reduce-prescription-dialog.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx && npm run test:integration -- tests/integration/invoice-prescription.test.ts tests/integration/dispensing-invoice.test.ts tests/integration/invoice-lifecycle.test.ts`
Expected: semua PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/invoice-drafts.ts src/server/invoice-lifecycle.ts src/server/invoice-read.ts src/components/admin/billing/reduce-prescription-dialog.tsx src/components/admin/billing/invoice-draft-editor.tsx tests/integration/invoice-prescription.test.ts tests/unit/components/reduce-prescription-dialog.test.tsx
git commit -m "feat: reduce or drop doctor prescription lines with a reason, and restore them on invoice cancel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Tambahkan fixture uji unit yang diperbaiki di Step 5.)

---

### Task 6: Menu Resep dan pemberitahuan mengenali resep dokter

**Files:**
- Modify: `src/server/dispensing-read.ts` (`DispensingRow.source`, `DispensingDetail.source`, `canReopen`)
- Modify: `src/server/dispensing-lifecycle.ts` (`reopenDispensing`)
- Modify: `src/server/live-events.ts` (`RESEP_BARU`, `RESEP_SELESAI` tanpa `source = DOKTER`)
- Modify: tampilan daftar dan rincian Resep (cari komponen yang merender `DispensingRow`/`DispensingDetail`: `grep -rln "DispensingRow\|DispensingDetail" src/components src/app`)
- Test: `tests/integration/dispensing-doctor.test.ts`, `tests/integration/live-events.test.ts`

**Interfaces:**
- Produces: `DispensingRow.source: "APOTEKER" | "DOKTER"`; `DispensingDetail.source`; label "dari dokter" pada daftar dan rincian.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/dispensing-doctor.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getDispensingDetail, listDispensings } from "@/server/dispensing-read";
import { reopenDispensing } from "@/server/dispensing-lifecycle";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Apoteker Uji", role: "APOTEKER" as const, email: "u@uji.test" } }));
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

const SLUG = "resep-dari-dokter";
const WA = "6281200009733";
let world: BillingWorld;
let dispensingId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const { appointmentId } = await finalVisit(world);
  dispensingId = (await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 2 }] })).id;
  await prisma.dispensing.update({ where: { id: dispensingId }, data: { source: "DOKTER" } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("resep dokter di menu Resep (spec resep dokter 6)", () => {
  it("tampil di tab Selesai sebagai dari dokter, baca-saja", async () => {
    expect((await listDispensings({ view: "SELESAI" })).find((r) => r.id === dispensingId)?.source).toBe("DOKTER");
    expect(await getDispensingDetail(dispensingId)).toMatchObject({ source: "DOKTER", canReopen: false });
  });

  it("Apoteker tidak bisa membuka kembali resep dokter", async () => {
    expect(await reopenDispensing({ dispensingId })).toEqual({ ok: false, error: "Resep dari dokter tidak diubah di sini." });
    expect((await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } })).status).toBe("SELESAI");
  });
});
```

Di `tests/integration/live-events.test.ts`, tambahkan uji (ikuti pola uji "Resep baru" yang sudah ada di berkas itu untuk mengambil peristiwa, mis. fungsi `pollLiveEvents`/`getLiveEvents` beserta pengaturan `since`; baca berkasnya dulu):

```ts
  it("resep dokter tidak memicu Resep baru atau Resep selesai (spec resep dokter 6)", async () => {
    const visit = await finalVisit(world);
    const { id } = await seedDispensing(world, visit.appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 1 }] });
    await prisma.dispensing.update({ where: { id }, data: { source: "DOKTER" } });
    const events = await eventsSinceStart(); // pembantu yang sama dengan uji lain di berkas ini
    expect(events.filter((e) => e.entityId === id && (e.kind === "RESEP_BARU" || e.kind === "RESEP_SELESAI"))).toEqual([]);
  });
```

Ganti `eventsSinceStart()` dengan cara pengambilan peristiwa yang dipakai uji lain di berkas itu (bukan fungsi baru) dan catat di ledger bentuk aslinya.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/dispensing-doctor.test.ts tests/integration/live-events.test.ts` → Expected: FAIL (`source` tidak ada; buka kembali berhasil; peristiwa muncul).

- [ ] **Step 3: Implementasi**

`src/server/dispensing-read.ts`:
- `DispensingRow`: tambahkan `source: "APOTEKER" | "DOKTER";`; `select` tambahkan `source: true`; pemetaan tambahkan `source: row.source`.
- `DispensingDetail`: tambahkan `source: "APOTEKER" | "DOKTER";`; `select` tambahkan `source: true`; kembalian `source: row.source`, `canReopen: row.source === "APOTEKER" && row.status !== "MENUNGGU" && invoiceState !== "FINAL"`.

`src/server/dispensing-lifecycle.ts` (`reopenDispensing`): tambahkan `source: true` ke `SELECT` (atau ke select baris di fungsi itu) dan sesudah `const row = …` tambahkan:

```ts
      if (row.source === "DOKTER") throw new UserFacingError("Resep dari dokter tidak diubah di sini.");
```

(bila `SELECT` dipakai bersama fungsi lain, menambah `source: true` tidak mengubah perilakunya.)

`src/server/live-events.ts`: tambahkan `source: "APOTEKER"` ke `where` kueri `RESEP_BARU` (`{ createdAt: range, source: "APOTEKER" }`) dan `RESEP_SELESAI` (`{ completedAt: range, status: …, source: "APOTEKER" }`).

Tampilan Resep: pada daftar, sesudah nama pasien tampilkan `{row.source === "DOKTER" && " · dari dokter"}` (atau `Chip` kecil berlabel "dari dokter"); pada rincian, bila `detail.source === "DOKTER"` tampilkan teks "Resep dari dokter — baca saja." menggantikan bagian Catatan untuk Apoteker, dan sembunyikan formulir obat serta tombol Selesai/Tanpa obat (status Selesai sudah menyembunyikannya; tombol Buka kembali tersembunyi lewat `canReopen`).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/dispensing-doctor.test.ts tests/integration/live-events.test.ts tests/integration/dispensing-read.test.ts tests/integration/dispensing-lifecycle.test.ts && npx vitest run tests/unit/dispensing-ui.test.tsx && npx tsc --noEmit -p .` → Expected: PASS (perbaiki fixture `DispensingRow`/`DispensingDetail` di uji unit dengan `source: "APOTEKER"`).

- [ ] **Step 5: Commit**

```bash
git add src/server/dispensing-read.ts src/server/dispensing-lifecycle.ts src/server/live-events.ts src/components/admin/dispensing "src/app/(admin)/admin/resep" tests/integration/dispensing-doctor.test.ts tests/integration/live-events.test.ts tests/unit/dispensing-ui.test.tsx
git commit -m "feat: show doctor prescriptions read-only in Resep and keep them out of pharmacist notifications

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Etiket dari tagihan

**Files:**
- Modify: `src/server/invoice-read.ts` (`getInvoicePrescriptionLabel`)
- Create: `src/components/admin/billing/prescription-label.tsx`
- Create: `src/app/(admin)/admin/tagihan/[id]/etiket/page.tsx`
- Modify: `src/components/admin/billing/invoice-draft-editor.tsx`, `src/components/admin/billing/invoice-final-view.tsx` (tautan "Cetak etiket")
- Test: `tests/integration/invoice-prescription-label.test.ts`, `tests/unit/components/prescription-label.test.tsx`

**Interfaces:**
- Produces: `PrescriptionLabelData = { patientName: string; startAt: Date; doctorName: string; lines: { name: string; quantity: number; usage: string }[] }`; `getInvoicePrescriptionLabel(invoiceId: string): Promise<PrescriptionLabelData | null>` (hak `invoice:read`); `PrescriptionLabel({ data, clinicName })`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/invoice-prescription-label.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoiceFromVisit } from "@/server/invoice-drafts";
import { getInvoicePrescriptionLabel } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "APOTEKER" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Etiket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "etiket-tagihan";
const WA = "6281200009734";
let world: BillingWorld;
let invoiceId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, world.drugId, 20);
  const { appointmentId } = await finalVisit(world);
  await prisma.encounter.update({ where: { appointmentId }, data: { assessment: "RAHASIA-KLINIS" } }).catch(() => undefined);
  const { id } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 6, usage: "2 x 1 sesudah makan" }] });
  await prisma.dispensing.update({ where: { id }, data: { source: "DOKTER" } });
  invoiceId = (await unwrap(createInvoiceFromVisit(appointmentId))).id;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("etiket dari tagihan (spec resep dokter 5)", () => {
  it("memuat pasien, dokter, obat, jumlah ditagih, aturan pakai; tanpa harga dan data klinis (Review Focus 5)", async () => {
    const label = (await getInvoicePrescriptionLabel(invoiceId))!;
    expect(label).toMatchObject({ patientName: `Pasien ${SLUG}`, lines: [{ name: `${SLUG} Amoxicillin`, quantity: 6, usage: "2 x 1 sesudah makan" }] });
    expect(label.doctorName).toBeTruthy();
    expect(JSON.stringify(label)).not.toMatch(/RAHASIA-KLINIS|unitPrice|sellPrice|2000/);
  });

  it("Admin Keuangan boleh; Apoteker tidak", async () => {
    actor.role = "ADMIN_KEUANGAN";
    expect(await getInvoicePrescriptionLabel(invoiceId)).not.toBeNull();
    actor.role = "APOTEKER";
    await expect(getInvoicePrescriptionLabel(invoiceId)).rejects.toThrow("forbidden: invoice:read");
  });
});
```

Buat `tests/unit/components/prescription-label.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrescriptionLabel } from "@/components/admin/billing/prescription-label";

describe("PrescriptionLabel (spec resep dokter 5)", () => {
  it("etiket berisi obat, jumlah, dan aturan pakai tanpa harga", () => {
    render(
      <PrescriptionLabel
        clinicName="SunDY Clinic"
        data={{ patientName: "Ani", startAt: new Date("2026-10-13T03:00:00Z"), doctorName: "dr. Diane", lines: [{ name: "Amoxicillin", quantity: 6, usage: "2 x 1" }] }}
      />,
    );
    const label = screen.getByRole("article", { name: "Etiket obat" });
    expect(label).toHaveTextContent("SunDY Clinic");
    expect(label).toHaveTextContent("Ani");
    expect(label).toHaveTextContent("dr. Diane");
    expect(label).toHaveTextContent("Amoxicillin");
    expect(label).toHaveTextContent("Jumlah: 6");
    expect(label).toHaveTextContent("2 x 1");
    expect(label).not.toHaveTextContent("Rp");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/prescription-label.test.tsx && npm run test:integration -- tests/integration/invoice-prescription-label.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementasi**

Di `src/server/invoice-read.ts` tambahkan:

```ts
export type PrescriptionLabelData = { patientName: string; startAt: Date; doctorName: string; lines: { name: string; quantity: number; usage: string }[] };

/** Etiket obat dari tagihan (spec resep dokter 5): hanya baris dari resep dokter; tanpa harga dan tanpa data klinis. */
export async function getInvoicePrescriptionLabel(invoiceId: string): Promise<PrescriptionLabelData | null> {
  await requireCapability("invoice:read");
  const invoice = await prisma.invoice.findUnique({
    where: { id: String(invoiceId ?? "") },
    select: {
      patient: { select: { name: true } },
      appointment: { select: { startAt: true, staff: { select: { name: true } } } },
      lines: {
        where: { dispensingLine: { dispensing: { source: "DOKTER" } } },
        orderBy: { sortOrder: "asc" },
        select: { name: true, quantity: true, dispensingLine: { select: { usage: true } } },
      },
    },
  });
  if (!invoice || !invoice.appointment || invoice.lines.length === 0) return null;
  return {
    patientName: invoice.patient.name,
    startAt: invoice.appointment.startAt,
    doctorName: invoice.appointment.staff.name,
    lines: invoice.lines.map((l) => ({ name: l.name, quantity: l.quantity, usage: l.dispensingLine?.usage ?? "" })),
  };
}
```

Buat `src/components/admin/billing/prescription-label.tsx`:

```tsx
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatDateWithYear } from "@/lib/format";
import type { PrescriptionLabelData } from "@/server/invoice-read";

/** Etiket obat resep dokter untuk customer (spec resep dokter 5): tanpa harga dan tanpa data klinis. */
export function PrescriptionLabel({ data, clinicName }: { data: PrescriptionLabelData; clinicName: string }) {
  return (
    <Paper component="article" aria-label="Etiket obat" variant="outlined" sx={{ mx: "auto", width: "100%", maxWidth: 448, p: 2, "@media print": { border: 0 } }}>
      <Stack spacing={1.5}>
        <Box component="header" sx={{ pb: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography sx={{ fontSize: "1rem", fontWeight: 600 }}>{clinicName}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {data.patientName}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {formatDateWithYear(data.startAt)} · {data.doctorName}
          </Typography>
        </Box>
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {data.lines.map((line, index) => (
            <li key={index}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {line.name}
              </Typography>
              <Typography variant="body2">Jumlah: {line.quantity}</Typography>
              <Typography variant="body2">{line.usage}</Typography>
            </li>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
```

Buat `src/app/(admin)/admin/tagihan/[id]/etiket/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PrescriptionLabel } from "@/components/admin/billing/prescription-label";
import { PrintButton } from "@/components/admin/billing/print-button";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { CLINIC_NAME } from "@/lib/clinic";
import { getInvoicePrescriptionLabel } from "@/server/invoice-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Etiket obat" };

export default async function InvoiceLabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("invoice:read");
  const { id } = await params;
  const data = await getInvoicePrescriptionLabel(id);
  if (!data) notFound();

  return (
    <>
      <div className="print:hidden">
        <AdminHeader title="Tagihan" />
      </div>
      <PageBody>
        <div className="print:hidden">
          <PageHeader title="Etiket obat" trail={[{ label: "Tagihan", href: "/admin/tagihan" }, { label: data.patientName, href: `/admin/tagihan/${id}` }, { label: "Etiket" }]} actions={<PrintButton />} />
        </div>
        <PrescriptionLabel data={data} clinicName={CLINIC_NAME} />
      </PageBody>
    </>
  );
}
```

Tautan: di `invoice-draft-editor.tsx` (deretan tombol atas) dan `invoice-final-view.tsx` (deretan aksi), bila `detail.hasPrescription`, tambahkan `<LinkButton href={`/admin/tagihan/${detail.id}/etiket`} variant="outlined">Cetak etiket</LinkButton>` (import `LinkButton` dari `../mui/links`). Periksa apakah `print-button.tsx` dan kelas `print:hidden` dipakai halaman etiket Apoteker yang sudah ada dengan cara yang sama (ya, lihat `src/app/(admin)/admin/resep/[id]/etiket/page.tsx`).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx tsc --noEmit -p . && npx vitest run tests/unit/components/prescription-label.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/architecture.test.ts && npm run test:integration -- tests/integration/invoice-prescription-label.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/invoice-read.ts src/components/admin/billing/prescription-label.tsx "src/app/(admin)/admin/tagihan/[id]/etiket" src/components/admin/billing/invoice-draft-editor.tsx src/components/admin/billing/invoice-final-view.tsx tests/integration/invoice-prescription-label.test.ts tests/unit/components/prescription-label.test.tsx
git commit -m "feat: print the prescription label from the invoice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: E2E dan rangkaian penuh

**Files:**
- Create: `tests/e2e/resep-dokter.spec.ts`
- Delete: `tests/e2e/resep.spec.ts`
- Modify: `tests/e2e/pemberitahuan.spec.ts`
- Test: rangkaian penuh

**Interfaces:**
- Consumes: semua task; helper E2E `signIn`, `pilihOpsi`, `isiTanggal`, `tungguHidrasi`, `aturHargaJual`, `isiHargaBeli`; pasien uji `Pasien Resep <proyek>` dan `Pasien Notif A/B <proyek>` dari `tests/e2e/prepare-db.mts`.

- [ ] **Step 1: E2E baru**

Buat `tests/e2e/resep-dokter.spec.ts`:

```ts
import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { aturHargaJual, isiHargaBeli } from "./helpers/harga";
import { isiTanggal, pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Satu cerita per proyek (spec resep dokter 8): Apoteker menyiapkan dua obat (satu stok 10, satu stok 2) → dokter menulis
// resep keduanya (peringatan stok untuk yang kurang) dan memfinalkan → resepsionis membuat tagihan, mengurangi obat yang
// kurang dengan alasan, membuka etiket, memfinalkan → stok berkurang; dokter melihat keterangan penagihan.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");
const dayFromToday = (days: number) => new Date(Date.now() + 8 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
let encounterPath: string | null = null;

test("apoteker menyiapkan dua obat", async ({ page, browser }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_APOTEKER);
  for (const [suffix, name] of [["AMX", `Amoxicillin Dokter ${t}`], ["VIT", `Vitamin Dokter ${t}`]] as const) {
    await page.goto("/admin/stok");
    await page.getByRole("button", { name: "+ Barang" }).click();
    const dialog = page.getByRole("dialog", { name: "Tambah barang" });
    await dialog.getByLabel("Kode").fill(`E2E-${t}-${suffix}`);
    await dialog.getByLabel("Nama", { exact: true }).fill(name);
    await dialog.getByLabel("Satuan").fill("tablet");
    await dialog.getByLabel("Batas menipis").fill("1");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await aturHargaJual(browser, name, "3000");
  }
  await page.goto("/admin/stok/masuk/baru");
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplier = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplier.getByLabel("Nama supplier").fill(`Supplier Dokter ${t}`);
  await supplier.getByRole("button", { name: "Simpan" }).click();
  await expect(supplier).toBeHidden({ timeout: 30_000 });
  await page.getByLabel("Nomor faktur").fill(`RSD-E2E-${t}-001`);
  await pilihOpsi(page, "Barang baris 1", `Amoxicillin Dokter ${t} (E2E-${t}-AMX)`);
  await page.getByLabel("Jumlah baris 1").fill("10");
  await page.getByLabel("Batch baris 1").fill("A-01");
  await isiTanggal(page, "Kedaluwarsa baris 1", dayFromToday(365));
  await page.getByRole("button", { name: "+ Tambah baris" }).click();
  await pilihOpsi(page, "Barang baris 2", `Vitamin Dokter ${t} (E2E-${t}-VIT)`);
  await page.getByLabel("Jumlah baris 2").fill("2");
  await page.getByLabel("Batch baris 2").fill("V-01");
  await isiTanggal(page, "Kedaluwarsa baris 2", dayFromToday(365));
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
  await isiHargaBeli(browser, new URL(page.url()).pathname, ["1000", "1000"]);
});

test("dokter menulis resep dua obat dengan peringatan stok lalu memfinalkan", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_ADMIN);
  await page.getByRole("region", { name: "Pasien hari ini" }).getByRole("row").filter({ hasText: `Pasien Resep ${testInfo.project.name}` }).getByRole("button", { name: "Periksa" }).click();
  await expect(page).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  encounterPath = new URL(page.url()).pathname;
  await page.getByLabel("Penilaian / diagnosis").fill("Infeksi saluran napas");
  await expect(page.getByLabel("Catatan untuk Apoteker")).toHaveCount(0);

  await page.getByRole("button", { name: "Tambah obat" }).click();
  const first = page.getByRole("group", { name: "Obat 1" });
  await first.getByLabel("Obat").selectOption({ label: `Amoxicillin Dokter ${t} (E2E-${t}-AMX)` });
  await first.getByLabel("Jumlah").fill("6");
  await first.getByLabel("Aturan pakai").fill("3 x 1 sesudah makan");
  await page.getByRole("button", { name: "Tambah obat" }).click();
  const second = page.getByRole("group", { name: "Obat 2" });
  await second.getByLabel("Obat").selectOption({ label: `Vitamin Dokter ${t} (E2E-${t}-VIT)` });
  await second.getByLabel("Jumlah").fill("5");
  await second.getByLabel("Aturan pakai").fill("1 x 1 pagi");
  await expect(second.getByRole("alert")).toContainText("Sisa stok 2 tablet");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Finalisasi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
});

test("resepsionis mengurangi obat yang kurang, mencetak etiket, dan memfinalkan; stok berkurang", async ({ page, browser }, testInfo) => {
  const t = tag(testInfo);
  const name = `Pasien Resep ${testInfo.project.name}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: `Buat tagihan ${name}` }).click();
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  const vitamin = `Vitamin Dokter ${t}`;
  await expect(page.getByLabel(`Jumlah ${vitamin}`)).toHaveValue("5", { timeout: 30_000 });

  await page.getByRole("button", { name: `Kurangi ${vitamin}` }).click();
  const reduce = page.getByRole("dialog", { name: `Kurangi ${vitamin}` });
  await reduce.getByLabel("Jumlah ditagih").fill("2");
  await reduce.getByLabel("Alasan").fill("Stok kurang");
  await reduce.getByRole("button", { name: "Simpan" }).click();
  await expect(reduce).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel(`Jumlah ${vitamin}`)).toHaveValue("2", { timeout: 30_000 });

  await page.getByRole("link", { name: "Cetak etiket" }).click();
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+\/etiket$/, { timeout: 30_000 });
  const label = page.getByRole("article", { name: "Etiket obat" });
  await expect(label).toContainText("3 x 1 sesudah makan");
  await expect(label).toContainText("Jumlah: 2");
  await expect(label).not.toContainText("Rp");
  await page.goBack();

  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  const pharmacy = await browser.newContext(testInfo.project.use);
  const ap = await pharmacy.newPage();
  await signIn(ap, E2E_APOTEKER);
  await ap.goto("/admin/stok");
  const items = ap.getByRole("region", { name: "Barang", exact: true });
  await expect(items.getByRole("row").filter({ hasText: `Amoxicillin Dokter ${t}` })).toContainText("4 tablet");
  await expect(items.getByRole("row").filter({ hasText: vitamin })).toContainText("0 tablet");
  await pharmacy.close();
});

test("dokter melihat keterangan penagihan; hak akses", async ({ page }, testInfo) => {
  test.skip(!encounterPath, "Butuh kunjungan dari uji sebelumnya.");
  const t = tag(testInfo);
  await signIn(page, E2E_ADMIN);
  await page.goto(encounterPath!);
  await expect(page.getByRole("table", { name: "Resep" })).toContainText(`Ditagih 2 dari 5 — Stok kurang`, { timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Resep" })).toContainText(`Amoxicillin Dokter ${t}`);

  await page.context().clearCookies();
  await signIn(page, E2E_APOTEKER);
  expect((await page.goto("/admin/tagihan"))?.status()).toBe(403);
  await page.context().clearCookies();
  await signIn(page, E2E_RESEPSIONIS);
  expect((await page.goto("/admin/resep"))?.status()).toBe(403);
  expect((await page.goto("/admin/stok-dokter"))?.status()).toBe(403);
  await page.context().clearCookies();
  await signIn(page, E2E_KEUANGAN);
  expect((await page.goto("/admin/stok-dokter"))?.status()).toBe(403);
});
```

Catatan untuk pelaksana: di uji ketiga, dua obat dari resep sama-sama bersatuan "tablet"; label `Jumlah <nama>` berasal dari editor tagihan yang sudah ada. Bila judul tagihan atau teks stok berbeda format (mis. "4 tablet" vs "4"), samakan dengan `tests/e2e/stok-hutang.spec.ts` dan catat di ledger. Bila pasien `Pasien Resep <proyek>` sudah dipakai `resep.spec.ts` lama, berkas lama itu dihapus di Step 2 sehingga pasiennya bebas.

- [ ] **Step 2: Hapus E2E lama dan sesuaikan E2E pemberitahuan**

```bash
git rm tests/e2e/resep.spec.ts
```

Di `tests/e2e/pemberitahuan.spec.ts`:
- `examine(doctor, patient)` tanpa parameter `pharmacyNote` (hapus baris `if (pharmacyNote) …`).
- ganti uji pertama dengan:

```ts
test("catatan final diketahui resepsionis tanpa muat ulang; Apoteker tidak menerima resep baru", async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  const patient = `Pasien Notif A ${project}`;

  const pharmacist = await openAs(browser, testInfo, E2E_APOTEKER, "/admin/resep");
  const receptionist = await openAs(browser, testInfo, E2E_RESEPSIONIS, "/admin/tagihan");
  const doctor = await openAs(browser, testInfo, E2E_ADMIN, "/admin");
  await expect(pharmacist.getByRole("button", { name: /Bunyi notifikasi/ })).toBeVisible();
  await expect(receptionist.getByRole("button", { name: /Bunyi notifikasi/ })).toBeVisible();

  await examine(doctor, patient);
  await expect(receptionist.getByText(`Siap ditagih: ${patient}`)).toBeVisible({ timeout: 40_000 });
  await expect(pharmacist.getByText(`Resep baru: ${patient}`)).toHaveCount(0);
  await expect(pharmacist.getByText(`Siap ditagih: ${patient}`)).toHaveCount(0);

  await receptionist.getByRole("button", { name: "Bunyi notifikasi hidup" }).click();
  await expect(receptionist.getByRole("button", { name: "Bunyi notifikasi mati" })).toBeVisible();
  await receptionist.reload();
  await expect(receptionist.getByRole("button", { name: "Bunyi notifikasi mati" })).toBeVisible();

  await Promise.all([pharmacist.context().close(), receptionist.context().close(), doctor.context().close()]);
});
```

- [ ] **Step 3: Jalankan E2E**

Reset akun E2E di basis data **uji** bila login gagal (hapus empat user `e2e@`, `resepsionis-e2e@`, `apoteker-e2e@`, `keuangan-e2e@sundy.test` beserta `session`/`account`-nya).

Run: `npx playwright test tests/e2e/resep-dokter.spec.ts tests/e2e/pemberitahuan.spec.ts --project=desktop --workers=1` → Expected: semua PASS. Lalu `--project=mobile` → PASS. Lalu E2E yang tersentuh: `npx playwright test tests/e2e/kunjungan.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/struk.spec.ts tests/e2e/harga-modal.spec.ts --project=desktop --workers=1` → PASS.

- [ ] **Step 4: Rangkaian penuh**

Bersihkan sisa data E2E di basis data uji (pembersihan tagihan yang biasa, ditambah `delete from "Expense" where note like '%E2E%'` dan `delete from "RecurringExpense" where note like '%E2E%'`), lalu:

Run: `npx tsc --noEmit -p .`, `npx vitest run`, `npm run test:integration` (keluaran ke berkas, baca ekornya).
Expected: `tsc` bersih; unit PASS (batas waktu di berkas yang tidak tersentuh boleh diulang sendiri); integrasi PASS kecuali 3 kegagalan lama `schedule.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/resep-dokter.spec.ts tests/e2e/pemberitahuan.spec.ts
git commit -m "test: e2e for doctor prescriptions through billing, labels, and stock; retire the pharmacist-note flow tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
