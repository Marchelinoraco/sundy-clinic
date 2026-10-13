# Menu Karyawan: Data, Gaji, dan Komisi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu Karyawan untuk Super Admin dan Admin Keuangan: data karyawan (termasuk tanpa akun panel), penggajian bulanan dengan komisi otomatis dari tagihan, bonus/potongan, tandai dibayar yang otomatis tercatat di Pengeluaran, tanpa slip gaji.

**Architecture:** Tabel baru `Employee` (data sensitif, terpisah dari `Staff`, boleh ditautkan satu-satu), `PayrollPeriod` (satu per bulan), `PayrollItem` (satu per karyawan per bulan), `PayrollAdjustment` (bonus/potongan). Komisi = baris `InvoiceLine` treatment berpelaksana dari tagihan FINAL yang belum diklaim; saat dibayar baris itu diklaim lewat kolom baru `InvoiceLine.payrollItemId`. Aturan murni di `src/lib/payroll.ts`, logika basis data bersama di `src/server/payroll-store.ts`, bacaan di `src/server/payroll-read.ts`, aksi di `src/server/payroll-actions.ts`.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma 7 + PostgreSQL, MUI 9 (panel admin), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-karyawan-penggajian-design.md`

## Global Constraints

- Semua teks antarmuka dan pesan galat Bahasa Indonesia, persis seperti di task.
- Tanpa slip gaji (keputusan K5).
- Migrasi hanya menambah. Nama: `20261017090000_karyawan_penggajian`. Buat SQL dengan `PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/x.sql`, buang baris dotenv dan kotak banner (`┌`, `│`, `└`). CHECK ditulis manual dan tidak pernah bernilai NULL. Sesudah mengubah skema: `npx prisma generate && npm run db:migrate:test`; pemeriksaan drift mencetak `-- This is an empty migration.`
- Hak baru `payroll:manage` = `SUPER_ADMIN` + `ADMIN_KEUANGAN`. Semua halaman dan aksi menu ini memeriksanya.
- Berkas `"use server"` hanya mengekspor fungsi async. Panel admin hanya MUI. Jangan menjalankan Prettier.
- Jejak audit tidak pernah memuat NIK, NPWP, atau nomor rekening.
- Status tagihan dibatalkan di basis data bernama `DIBATALKAN` (bukan `BATAL`).
- Relasi yang menunjuk ke tabel yang dibersihkan uji lain (`Branch`, `Staff`, `Expense`) memakai `onDelete: SetNull`, supaya `prisma.branch.deleteMany()` dan sejenisnya di uji lama tidak gagal.
- Uji integrasi memakai bulan penggajian jauh di depan (`2091-…` dst.) agar tidak bentrok antar berkas; bulan bersifat unik global.
- Uji integrasi tidak dijalankan bersamaan dengan E2E. Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. Dua pembayaran bersamaan untuk karyawan yang sama di dua bulan berbeda → komisi yang sama hanya terbayar sekali (Task 6).
2. Potongan melebihi gaji pokok + tunjangan + bonus tetapi masih tertutup komisi → total ≥ 0 diterima, Pengeluaran tidak pernah bernilai negatif dan jumlahnya sama dengan total (Task 2 dan Task 6).
3. Pembayaran yang komisinya kemudian dikoreksi (tagihan dibatalkan) lalu pembayarannya dibatalkan → koreksi di bulan berikutnya yang belum dibayar ikut dihapus, karyawan tidak terpotong dua kali (Task 6).
4. Karyawan berhenti sebelum bulan penggajian atau masuk sesudahnya → tidak ikut daftar dan tidak bisa ditambahkan (Task 5).
5. Staf yang dihapus atau cabang yang dihapus oleh proses lain → karyawan tetap ada, tautannya kosong (Task 1, CHECK/relasi SetNull).

---

### Task 1: Skema, migrasi, hak `payroll:manage`, menu samping

**Files:**
- Modify: `prisma/schema.prisma` (model baru sesudah `model BiaMeasurement`/akhir berkas; relasi balik di `Staff`, `Branch`, `Expense`, `InvoiceLine`)
- Create: `prisma/migrations/20261017090000_karyawan_penggajian/migration.sql`
- Modify: `src/lib/permissions.ts`, `src/components/admin/app-sidebar.tsx`
- Test: `tests/unit/migrations.test.ts`, `tests/unit/permissions.test.ts`, `tests/integration/payroll-schema.test.ts`

**Interfaces:**
- Produces: model `Employee`, `PayrollPeriod`, `PayrollItem`, `PayrollAdjustment`; enum `EmployeeStatus` (`AKTIF`, `BERHENTI`), `PayrollAdjustmentKind` (`BONUS`, `POTONGAN`); `InvoiceLine.payrollItemId`; `Capability` `"payroll:manage"`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi karyawan dan penggajian", () => {
  const sql = readFileSync("prisma/migrations/20261017090000_karyawan_penggajian/migration.sql", "utf8");

  it("hanya menambah", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("menjaga nominal dan status di basis data", () => {
    expect(sql).toMatch(/employee_values/);
    expect(sql).toMatch(/payroll_item_values/);
    expect(sql).toMatch(/payroll_adjustment_amount/);
  });
});
```

Tambahkan di akhir `describe` utama `tests/unit/permissions.test.ts`:

```ts
  it("penggajian hanya untuk Super Admin dan Admin Keuangan (spec karyawan 6)", () => {
    expect(can("SUPER_ADMIN", "payroll:manage")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "payroll:manage")).toBe(true);
    for (const role of ["RESEPSIONIS", "APOTEKER", "DOKTER", "TERAPIS"] as const) expect(can(role, "payroll:manage")).toBe(false);
  });
```

Buat `tests/integration/payroll-schema.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const NAME = "Skema Gaji Uji";
let employeeId: string;

beforeAll(async () => {
  await prisma.payrollPeriod.deleteMany({ where: { month: "2090-01" } });
  await prisma.employee.deleteMany({ where: { name: { startsWith: NAME } } });
  employeeId = (await prisma.employee.create({ data: { name: NAME, position: "Perawat", joinedOn: new Date("2026-01-05T00:00:00Z"), baseSalary: 3_000_000 } })).id;
});
afterAll(async () => {
  await prisma.payrollItem.deleteMany({ where: { employeeId } });
  await prisma.payrollPeriod.deleteMany({ where: { month: "2090-01" } });
  await prisma.employee.deleteMany({ where: { name: { startsWith: NAME } } });
  await prisma.$disconnect();
});

describe("skema penggajian", () => {
  it("karyawan: nominal tidak negatif, berhenti wajib bertanggal keluar", async () => {
    const set = (data: Record<string, unknown>) => prisma.employee.update({ where: { id: employeeId }, data });
    await expect(set({ baseSalary: -1 })).rejects.toThrow(/employee_values/);
    await expect(set({ status: "BERHENTI" })).rejects.toThrow(/employee_values/);
    await expect(set({ leftOn: new Date("2026-02-01T00:00:00Z") })).rejects.toThrow(/employee_values/);
    expect((await set({ status: "BERHENTI", leftOn: new Date("2026-02-01T00:00:00Z") })).status).toBe("BERHENTI");
    await set({ status: "AKTIF", leftOn: null });
  });

  it("baris penggajian: total tidak negatif, satu karyawan sekali per bulan, penyesuaian lebih dari 0", async () => {
    const period = await prisma.payrollPeriod.create({ data: { month: "2090-01", createdById: "s", createdByName: "Uji" } });
    const base = { periodId: period.id, employeeId, employeeName: NAME, position: "Perawat", baseSalary: 1, allowance: 0 };
    await expect(prisma.payrollItem.create({ data: { ...base, total: -1 } })).rejects.toThrow(/payroll_item_values/);
    await expect(prisma.payrollItem.create({ data: { ...base, paidAt: new Date("2090-01-31T00:00:00Z") } })).rejects.toThrow(/payroll_item_values/);
    const item = await prisma.payrollItem.create({ data: base });
    await expect(prisma.payrollItem.create({ data: base })).rejects.toThrow();
    await expect(prisma.payrollAdjustment.create({ data: { itemId: item.id, kind: "BONUS", amount: 0, note: "Nol", createdByName: "Uji" } })).rejects.toThrow(/payroll_adjustment_amount/);
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts tests/unit/permissions.test.ts`
Expected: FAIL — berkas migrasi tidak ada; `payroll:manage` bernilai false.

- [ ] **Step 3: Skema**

Tambahkan di akhir `prisma/schema.prisma`:

```prisma
enum EmployeeStatus {
  AKTIF
  BERHENTI
}

enum PayrollAdjustmentKind {
  BONUS
  POTONGAN
}

/// Karyawan (spec karyawan 2.1): termasuk yang tanpa akun panel. Data sensitif sengaja di luar `Staff`, yang dibaca situs publik.
/// Tidak pernah dihapus; CHECK employee_values.
model Employee {
  id          String         @id @default(cuid())
  name        String
  position    String
  branchId    String?
  branch      Branch?        @relation(fields: [branchId], references: [id], onDelete: SetNull)
  joinedOn    DateTime       @db.Date
  nik         String?
  npwp        String?
  whatsapp    String?
  bankName    String?
  bankAccount String?
  bankHolder  String?
  notes       String?
  baseSalary  Int            @default(0)
  allowance   Int            @default(0)
  status      EmployeeStatus @default(AKTIF)
  leftOn      DateTime?      @db.Date
  staffId     String?        @unique
  staff       Staff?         @relation(fields: [staffId], references: [id], onDelete: SetNull)

  payrollItems PayrollItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
}

/// Penggajian satu bulan (spec karyawan 2.2). `month` = "YYYY-MM".
model PayrollPeriod {
  id            String        @id @default(cuid())
  month         String        @unique
  createdById   String
  createdByName String
  createdAt     DateTime      @default(now())
  items         PayrollItem[]
}

/// Satu karyawan dalam satu penggajian (spec karyawan 2.3). Nominal komisi dan total dikunci saat dibayar. CHECK payroll_item_values.
model PayrollItem {
  id                  String        @id @default(cuid())
  periodId            String
  period              PayrollPeriod @relation(fields: [periodId], references: [id], onDelete: Restrict)
  employeeId          String
  employee            Employee      @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  employeeName        String
  position            String
  baseSalary          Int
  allowance           Int
  amountNote          String?
  commission          Int           @default(0)
  treatments          Int           @default(0)
  bonusTotal          Int           @default(0)
  deductionTotal      Int           @default(0)
  total               Int           @default(0)
  paidAt              DateTime?     @db.Date
  paidById            String?
  paidByName          String?
  salaryExpenseId     String?       @unique
  salaryExpense       Expense?      @relation("PayrollSalaryExpense", fields: [salaryExpenseId], references: [id], onDelete: SetNull)
  commissionExpenseId String?       @unique
  commissionExpense   Expense?      @relation("PayrollCommissionExpense", fields: [commissionExpenseId], references: [id], onDelete: SetNull)
  voidedPayments      Int           @default(0)

  adjustments     PayrollAdjustment[]
  commissionLines InvoiceLine[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([periodId, employeeId])
}

/// Bonus atau potongan satu baris penggajian (spec karyawan 2.4). `invoiceLineId` terisi untuk koreksi komisi otomatis.
model PayrollAdjustment {
  id            String                @id @default(cuid())
  itemId        String
  item          PayrollItem           @relation(fields: [itemId], references: [id], onDelete: Cascade)
  kind          PayrollAdjustmentKind
  amount        Int
  note          String
  invoiceLineId String?               @unique
  createdByName String
  createdAt     DateTime              @default(now())
}
```

Relasi balik:
- di `model Staff` sesudah `reviewedIntakes    Intake[]`: `  employee           Employee?`
- di `model Branch` (cari `model Branch {`): tambahkan baris `  employees Employee[]` di antara relasi lainnya
- di `model Expense` sesudah `voidReason    String?`: `  payrollSalary     PayrollItem? @relation("PayrollSalaryExpense")` dan `  payrollCommission PayrollItem? @relation("PayrollCommissionExpense")`
- di `model InvoiceLine` sesudah `serviceId            String?`: `  /// Penggajian yang membayar komisi baris ini (spec karyawan 2.5).` lalu `  payrollItemId        String?` dan `  payrollItem          PayrollItem? @relation(fields: [payrollItemId], references: [id], onDelete: SetNull)`, serta `  @@index([performerId, payrollItemId])` di bagian indeks model itu.

- [ ] **Step 4: Migrasi**

```bash
mkdir -p prisma/migrations/20261017090000_karyawan_penggajian
PRISMA_TARGET=test npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/karyawan.sql
grep -v -e '^\[dotenv' -e '^┌' -e '^│' -e '^└' /tmp/karyawan.sql > prisma/migrations/20261017090000_karyawan_penggajian/migration.sql
```

Periksa: dua `CREATE TYPE`, empat `CREATE TABLE`, `ALTER TABLE "InvoiceLine" ADD COLUMN "payrollItemId" TEXT`, indeks, dan foreign key (Employee→Branch/Staff `SET NULL`, PayrollItem→Expense `SET NULL`, InvoiceLine→PayrollItem `SET NULL`, PayrollItem→PayrollPeriod/Employee `RESTRICT`, PayrollAdjustment→PayrollItem `CASCADE`). Tambahkan di akhir:

```sql
-- Penjaga nominal dan status (spec karyawan 2). Tiap ekspresi tidak pernah NULL.
ALTER TABLE "Employee" ADD CONSTRAINT employee_values CHECK (
  "baseSalary" >= 0 AND "allowance" >= 0
  AND (("status" = 'AKTIF' AND "leftOn" IS NULL) OR ("status" = 'BERHENTI' AND "leftOn" IS NOT NULL))
);
ALTER TABLE "PayrollItem" ADD CONSTRAINT payroll_item_values CHECK (
  "baseSalary" >= 0 AND "allowance" >= 0 AND "commission" >= 0 AND "treatments" >= 0
  AND "bonusTotal" >= 0 AND "deductionTotal" >= 0 AND "total" >= 0
  AND (("paidAt" IS NULL) = ("paidById" IS NULL))
);
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT payroll_adjustment_amount CHECK ("amount" > 0);
```

Run: `npx prisma generate && npm run db:migrate:test` → Expected: migrasi diterapkan. Drift: diff → `-- This is an empty migration.` Bila gagal di tengah: perbaiki, `PRISMA_TARGET=test npx prisma migrate resolve --rolled-back 20261017090000_karyawan_penggajian`, terapkan lagi.

- [ ] **Step 5: Hak dan menu**

`src/lib/permissions.ts`: tambahkan `| "payroll:manage"` di akhir union, `"payroll:manage",` di akhir daftar `SUPER_ADMIN`, dan `"payroll:manage"` di akhir array `ADMIN_KEUANGAN`.

`src/components/admin/app-sidebar.tsx`: import ikon `BadgeOutlined` dari `@mui/icons-material/BadgeOutlined` (pola import sama dengan ikon lain di berkas), lalu sesudah baris `Pengeluaran` di grup "Persediaan & keuangan":

```tsx
      { title: "Karyawan", url: "/admin/karyawan", icon: BadgeOutlined, needs: "payroll:manage" },
```

Uji arsitektur "setiap menu samping mengarah ke halaman yang ada" baru lulus setelah Task 8; jangan jalankan `architecture.test.ts` di task ini.

- [ ] **Step 6: Jalankan uji**

Run: `npx vitest run tests/unit/migrations.test.ts tests/unit/permissions.test.ts && npm run test:integration -- tests/integration/payroll-schema.test.ts && npx tsc --noEmit -p .`
Expected: PASS; `tsc` tanpa keluaran.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261017090000_karyawan_penggajian src/lib/permissions.ts src/components/admin/app-sidebar.tsx tests/unit/migrations.test.ts tests/unit/permissions.test.ts tests/integration/payroll-schema.test.ts
git commit -m "feat: add employee and payroll tables with payroll rights

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Aturan murni penggajian

**Files:**
- Create: `src/lib/payroll.ts`
- Test: `tests/unit/payroll.test.ts`

**Interfaces:**
- Consumes: `normalizeNik`, `NIK_FORMAT_ERROR` (`src/lib/nik.ts`); `normalizeWhatsapp` (`src/lib/whatsapp.ts`); `isDateString`, `MAX_AMOUNT`, `Validation` (`src/lib/stock.ts`); `isMonthString`, `addMonths` (`src/lib/expense.ts`); `combineWitaDateAndMinutes` (`src/lib/time.ts`).
- Produces:
  - `EmployeeInput = { name: string; position: string; branchId: string | null; joinedOn: string; nik: string | null; npwp: string | null; whatsapp: string | null; bankName: string | null; bankAccount: string | null; bankHolder: string | null; notes: string | null; baseSalary: number; allowance: number; staffId: string | null }`, `validateEmployee(raw: unknown): Validation<EmployeeInput>`
  - `AdjustmentInput = { kind: "BONUS" | "POTONGAN"; amount: number; note: string }`, `validateAdjustment(raw: unknown): Validation<AdjustmentInput>`
  - `validateAmounts(raw: unknown, ctx: { baseSalary: number; allowance: number }): Validation<{ baseSalary: number; allowance: number; note: string | null }>`
  - `payrollTotal(x: { baseSalary: number; allowance: number; commission: number; bonusTotal: number; deductionTotal: number }): number`
  - `expenseSplit(x: same): { salary: number; commission: number }` — keduanya ≥ 0, jumlahnya = total bila total ≥ 0
  - `worksInMonth(e: { joinedOn: string; status: "AKTIF" | "BERHENTI"; leftOn: string | null }, month: string): boolean`
  - `monthEndInstant(month: string): Date` — awal bulan berikutnya pukul 00.00 WITA
  - `PAYROLL_SALARY_CATEGORY = "Gaji Karyawan"`, `PAYROLL_COMMISSION_CATEGORY = "Komisi"`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/payroll.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { expenseSplit, monthEndInstant, payrollTotal, validateAdjustment, validateAmounts, validateEmployee, worksInMonth } from "@/lib/payroll";

const employee = {
  name: "  Siti   Aminah ",
  position: "Cleaning service",
  branchId: "",
  joinedOn: "2026-03-01",
  nik: "",
  npwp: "",
  whatsapp: "",
  bankName: "",
  bankAccount: "",
  bankHolder: "",
  notes: "",
  baseSalary: 2_500_000,
  allowance: 0,
  staffId: null,
};

describe("validasi karyawan", () => {
  it("merapikan teks dan mengosongkan isian opsional", () => {
    expect(validateEmployee(employee)).toEqual({
      ok: true,
      value: { ...employee, name: "Siti Aminah", branchId: null, nik: null, npwp: null, whatsapp: null, bankName: null, bankAccount: null, bankHolder: null, notes: null },
    });
  });

  it("menormalkan NIK, NPWP, nomor WhatsApp, dan rekening", () => {
    const result = validateEmployee({ ...employee, nik: "7171.0101.0101.0001", npwp: "01.234.567.8-901.000", whatsapp: "0812 3456 7890", bankName: "BCA", bankAccount: "123-456 7890", bankHolder: "Siti Aminah" });
    expect(result).toMatchObject({ ok: true, value: { nik: "7171010101010001", npwp: "012345678901000", whatsapp: "6281234567890", bankAccount: "1234567890" } });
  });

  it.each([
    [{ name: "" }, "Isi nama karyawan."],
    [{ name: "S" }, "Nama 2–100 karakter."],
    [{ position: "" }, "Isi jabatan."],
    [{ position: "x".repeat(61) }, "Jabatan 2–60 karakter."],
    [{ joinedOn: "" }, "Isi tanggal masuk."],
    [{ nik: "123" }, "NIK harus 16 angka."],
    [{ npwp: "12345" }, "NPWP harus 15 atau 16 angka."],
    [{ whatsapp: "12ab" }, "Nomor WhatsApp tidak sah."],
    [{ bankName: "BCA" }, "Isi nama bank, nomor rekening, dan atas nama sekaligus."],
    [{ bankName: "BCA", bankAccount: "12", bankHolder: "Siti" }, "Nomor rekening 5–30 angka."],
    [{ notes: "x".repeat(501) }, "Catatan paling banyak 500 karakter."],
    [{ baseSalary: -1 }, "Gaji pokok dan tunjangan harus bilangan bulat 0 atau lebih."],
    [{ allowance: 1.5 }, "Gaji pokok dan tunjangan harus bilangan bulat 0 atau lebih."],
  ])("menolak %j", (patch, message) => {
    expect(validateEmployee({ ...employee, ...patch })).toEqual({ ok: false, message });
  });
});

describe("penyesuaian dan perubahan gaji", () => {
  it("bonus/potongan wajib nominal dan keterangan", () => {
    expect(validateAdjustment({ kind: "POTONGAN", amount: 200_000, note: " Kasbon 12 Okt " })).toEqual({ ok: true, value: { kind: "POTONGAN", amount: 200_000, note: "Kasbon 12 Okt" } });
    expect(validateAdjustment({ kind: "X", amount: 1, note: "ab" })).toEqual({ ok: false, message: "Pilih bonus atau potongan." });
    expect(validateAdjustment({ kind: "BONUS", amount: 0, note: "ab" })).toEqual({ ok: false, message: "Nominal harus bilangan bulat lebih dari 0." });
    expect(validateAdjustment({ kind: "BONUS", amount: 1, note: "a" })).toEqual({ ok: false, message: "Keterangan 2–120 karakter." });
  });

  it("perubahan gaji bulan itu wajib beralasan bila berbeda dari data karyawan", () => {
    const ctx = { baseSalary: 3_000_000, allowance: 500_000 };
    expect(validateAmounts({ baseSalary: 3_000_000, allowance: 500_000, note: "" }, ctx)).toEqual({ ok: true, value: { baseSalary: 3_000_000, allowance: 500_000, note: null } });
    expect(validateAmounts({ baseSalary: 1_500_000, allowance: 500_000, note: "" }, ctx)).toEqual({ ok: false, message: "Isi alasan perubahan gaji." });
    expect(validateAmounts({ baseSalary: 1_500_000, allowance: 500_000, note: "Masuk 15 Okt" }, ctx)).toEqual({ ok: true, value: { baseSalary: 1_500_000, allowance: 500_000, note: "Masuk 15 Okt" } });
    expect(validateAmounts({ baseSalary: -5, allowance: 0, note: "x" }, ctx)).toEqual({ ok: false, message: "Gaji pokok dan tunjangan harus bilangan bulat 0 atau lebih." });
  });
});

describe("hitungan penggajian", () => {
  const row = { baseSalary: 3_000_000, allowance: 500_000, commission: 400_000, bonusTotal: 100_000, deductionTotal: 200_000 };

  it("total = gaji + tunjangan + komisi + bonus − potongan", () => {
    expect(payrollTotal(row)).toBe(3_800_000);
    expect(expenseSplit(row)).toEqual({ salary: 3_400_000, commission: 400_000 });
  });

  it("potongan melebihi gaji tetapi tertutup komisi: pengeluaran tidak negatif dan jumlahnya sama dengan total (Review Focus 2)", () => {
    const heavy = { ...row, deductionTotal: 3_700_000 };
    expect(payrollTotal(heavy)).toBe(300_000);
    expect(expenseSplit(heavy)).toEqual({ salary: 0, commission: 300_000 });
  });

  it("bekerja di bulan itu: sudah masuk dan belum keluar sebelum bulan itu (Review Focus 4)", () => {
    expect(worksInMonth({ joinedOn: "2026-10-20", status: "AKTIF", leftOn: null }, "2026-10")).toBe(true);
    expect(worksInMonth({ joinedOn: "2026-11-01", status: "AKTIF", leftOn: null }, "2026-10")).toBe(false);
    expect(worksInMonth({ joinedOn: "2026-01-01", status: "BERHENTI", leftOn: "2026-10-05" }, "2026-10")).toBe(true);
    expect(worksInMonth({ joinedOn: "2026-01-01", status: "BERHENTI", leftOn: "2026-09-30" }, "2026-10")).toBe(false);
    expect(worksInMonth({ joinedOn: "2026-01-01", status: "BERHENTI", leftOn: "2026-12-31" }, "2026-10")).toBe(true);
  });

  it("akhir bulan = awal bulan berikutnya pukul 00.00 WITA", () => {
    expect(monthEndInstant("2026-10").toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(monthEndInstant("2026-12").toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/payroll.test.ts` → Expected: FAIL `Failed to resolve import "@/lib/payroll"`.

- [ ] **Step 3: Implementasi `src/lib/payroll.ts`**

```ts
import { addMonths } from "./expense";
import { NIK_FORMAT_ERROR, normalizeNik } from "./nik";
import { isDateString, MAX_AMOUNT, type Validation } from "./stock";
import { combineWitaDateAndMinutes } from "./time";
import { normalizeWhatsapp } from "./whatsapp";

/** Aturan murni menu Karyawan (spec karyawan 2–4). Dipakai server dan browser; tanpa basis data. */
export const PAYROLL_SALARY_CATEGORY = "Gaji Karyawan";
export const PAYROLL_COMMISSION_CATEGORY = "Komisi";

const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const SALARY_MESSAGE = "Gaji pokok dan tunjangan harus bilangan bulat 0 atau lebih.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
/** Teks satu baris dirapikan; kosong/null/undefined → "", bukan teks → null. */
const line = (value: unknown): string | null => (value === undefined || value === null ? "" : typeof value === "string" ? value.replace(/\s+/g, " ").trim() : null);
const optionalId = (value: unknown): string | null | undefined =>
  value === undefined || value === null || value === "" ? null : typeof value === "string" ? value : undefined;

export type EmployeeInput = {
  name: string;
  position: string;
  branchId: string | null;
  joinedOn: string;
  nik: string | null;
  npwp: string | null;
  whatsapp: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  notes: string | null;
  baseSalary: number;
  allowance: number;
  staffId: string | null;
};

export function validateEmployee(raw: unknown): Validation<EmployeeInput> {
  if (!isObject(raw)) return fail(INVALID);
  const name = line(raw.name);
  const position = line(raw.position);
  const nikText = line(raw.nik);
  const npwpText = line(raw.npwp);
  const waText = line(raw.whatsapp);
  const bankName = line(raw.bankName);
  const bankAccountText = line(raw.bankAccount);
  const bankHolder = line(raw.bankHolder);
  const notes = raw.notes === undefined || raw.notes === null ? "" : typeof raw.notes === "string" ? raw.notes.trim() : null;
  const branchId = optionalId(raw.branchId);
  const staffId = optionalId(raw.staffId);
  if ([name, position, nikText, npwpText, waText, bankName, bankAccountText, bankHolder, notes].includes(null) || branchId === undefined || staffId === undefined) {
    return fail(INVALID);
  }
  if (!name) return fail("Isi nama karyawan.");
  if (name!.length < 2 || name!.length > 100) return fail("Nama 2–100 karakter.");
  if (!position) return fail("Isi jabatan.");
  if (position!.length < 2 || position!.length > 60) return fail("Jabatan 2–60 karakter.");
  if (!isDateString(raw.joinedOn)) return fail("Isi tanggal masuk.");

  let nik: string | null = null;
  if (nikText) {
    nik = normalizeNik(nikText);
    if (!nik) return fail(NIK_FORMAT_ERROR);
  }
  let npwp: string | null = null;
  if (npwpText) {
    npwp = npwpText.replace(/[\s.-]/g, "");
    if (!/^\d{15,16}$/.test(npwp)) return fail("NPWP harus 15 atau 16 angka.");
  }
  let whatsapp: string | null = null;
  if (waText) {
    whatsapp = normalizeWhatsapp(waText);
    if (!whatsapp) return fail("Nomor WhatsApp tidak sah.");
  }
  const bankParts = [bankName, bankAccountText, bankHolder];
  let bankAccount: string | null = null;
  if (bankParts.some(Boolean)) {
    if (!bankParts.every(Boolean)) return fail("Isi nama bank, nomor rekening, dan atas nama sekaligus.");
    bankAccount = bankAccountText!.replace(/[\s-]/g, "");
    if (!/^\d{5,30}$/.test(bankAccount)) return fail("Nomor rekening 5–30 angka.");
    if (bankName!.length > 60 || bankHolder!.length > 60) return fail("Nama bank dan atas nama paling banyak 60 karakter.");
  }
  if (notes!.length > 500) return fail("Catatan paling banyak 500 karakter.");
  if (!isWhole(raw.baseSalary, 0, MAX_AMOUNT) || !isWhole(raw.allowance, 0, MAX_AMOUNT)) return fail(SALARY_MESSAGE);

  return {
    ok: true,
    value: {
      name: name!,
      position: position!,
      branchId,
      joinedOn: raw.joinedOn,
      nik,
      npwp,
      whatsapp,
      bankName: bankAccount ? bankName : null,
      bankAccount,
      bankHolder: bankAccount ? bankHolder : null,
      notes: notes || null,
      baseSalary: raw.baseSalary,
      allowance: raw.allowance,
      staffId,
    },
  };
}

export type AdjustmentInput = { kind: "BONUS" | "POTONGAN"; amount: number; note: string };

export function validateAdjustment(raw: unknown): Validation<AdjustmentInput> {
  if (!isObject(raw)) return fail(INVALID);
  if (raw.kind !== "BONUS" && raw.kind !== "POTONGAN") return fail("Pilih bonus atau potongan.");
  if (!isWhole(raw.amount, 1, MAX_AMOUNT)) return fail("Nominal harus bilangan bulat lebih dari 0.");
  const note = line(raw.note);
  if (note === null) return fail(INVALID);
  if (note.length < 2 || note.length > 120) return fail("Keterangan 2–120 karakter.");
  return { ok: true, value: { kind: raw.kind, amount: raw.amount, note } };
}

/** Gaji pokok dan tunjangan satu bulan; alasan wajib bila berbeda dari data karyawan (spec karyawan 4.2). */
export function validateAmounts(raw: unknown, ctx: { baseSalary: number; allowance: number }): Validation<{ baseSalary: number; allowance: number; note: string | null }> {
  if (!isObject(raw)) return fail(INVALID);
  if (!isWhole(raw.baseSalary, 0, MAX_AMOUNT) || !isWhole(raw.allowance, 0, MAX_AMOUNT)) return fail(SALARY_MESSAGE);
  const note = line(raw.note);
  if (note === null) return fail(INVALID);
  const changed = raw.baseSalary !== ctx.baseSalary || raw.allowance !== ctx.allowance;
  if (changed && !note) return fail("Isi alasan perubahan gaji.");
  if (note.length > 300) return fail("Alasan paling banyak 300 karakter.");
  return { ok: true, value: { baseSalary: raw.baseSalary, allowance: raw.allowance, note: note || null } };
}

type Amounts = { baseSalary: number; allowance: number; commission: number; bonusTotal: number; deductionTotal: number };

export function payrollTotal(x: Amounts): number {
  return x.baseSalary + x.allowance + x.commission + x.bonusTotal - x.deductionTotal;
}

/**
 * Pembagian ke Pengeluaran (spec karyawan 4.3): "Gaji Karyawan" = gaji + tunjangan + bonus − potongan, "Komisi" = komisi. Bila
 * potongan melebihi bagian gaji, sisanya mengurangi komisi, sehingga tidak ada pengeluaran negatif dan jumlahnya = total.
 */
export function expenseSplit(x: Amounts): { salary: number; commission: number } {
  const salary = x.baseSalary + x.allowance + x.bonusTotal - x.deductionTotal;
  return salary >= 0 ? { salary, commission: x.commission } : { salary: 0, commission: x.commission + salary };
}

/** Karyawan ikut penggajian bulan itu: sudah masuk paling lambat akhir bulan dan belum keluar sebelum awal bulan (spec 4.1). */
export function worksInMonth(e: { joinedOn: string; status: "AKTIF" | "BERHENTI"; leftOn: string | null }, month: string): boolean {
  const first = `${month}-01`;
  const next = `${addMonths(month, 1)}-01`;
  if (e.joinedOn >= next) return false;
  return e.status === "AKTIF" || (e.leftOn !== null && e.leftOn >= first);
}

/** Batas atas komisi bulan itu: awal bulan berikutnya pukul 00.00 WITA. */
export function monthEndInstant(month: string): Date {
  return combineWitaDateAndMinutes(`${addMonths(month, 1)}-01`, 0);
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/payroll.test.ts && npx tsc --noEmit -p .` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll.ts tests/unit/payroll.test.ts
git commit -m "feat: payroll validation, totals, and expense split rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Komisi terbuka, koreksi, dan bacaan penggajian

**Files:**
- Create: `src/server/payroll-store.ts`, `src/server/payroll-read.ts`
- Create: `tests/integration/payroll-world.ts`
- Test: `tests/integration/payroll-read.test.ts`

**Interfaces:**
- Consumes: `monthEndInstant`, `payrollTotal`, `worksInMonth` (Task 2).
- Produces (`payroll-store.ts`, modul biasa):
  - `type Db = PrismaClient | Prisma.TransactionClient`
  - `openCommissions(db: Db, staffIds: string[], month: string): Promise<Map<string, { commission: number; treatments: number; lineIds: string[] }>>`
  - `syncCommissionCorrections(db: Db, item: { id: string; staffId: string | null }, actorName: string): Promise<void>`
  - `lockEmployee(tx: Prisma.TransactionClient, id: string): Promise<void>`
  - `adjustmentTotals(adjustments: { kind: "BONUS" | "POTONGAN"; amount: number }[]): { bonusTotal: number; deductionTotal: number }`
- Produces (`payroll-read.ts`, memeriksa `payroll:manage`):
  - `EmployeeRow = { id; name; position; branchId: string | null; branchName: string | null; joinedOn: string; nik; npwp; whatsapp; bankName; bankAccount; bankHolder; notes: string | null; baseSalary: number; allowance: number; status: "AKTIF" | "BERHENTI"; leftOn: string | null; staffId: string | null; staffName: string | null }`, `listEmployees(): Promise<EmployeeRow[]>`
  - `listLinkableStaff(): Promise<{ id: string; name: string; employeeId: string | null }[]>`
  - `PeriodSummary = { month: string; employees: number; total: number; paid: number; unpaid: number }`, `listPayrollPeriods(): Promise<PeriodSummary[]>`
  - `PayrollItemRow = { id; employeeId; employeeName; position; staffId: string | null; baseSalary; allowance; amountNote: string | null; commission; treatments; bonusTotal; deductionTotal; total: number; paidAt: string | null; paidByName: string | null; adjustments: { id: string; kind: "BONUS" | "POTONGAN"; amount: number; note: string; automatic: boolean }[] }`, `getPayrollPeriod(month: string): Promise<{ month: string; items: PayrollItemRow[]; addable: { id: string; name: string }[] } | null>`
- Produces (`payroll-world.ts`): `PayrollWorld = BillingWorld & { employeeId: string }`, `createPayrollWorld(slug: string, whatsapp: string): Promise<PayrollWorld>` (karyawan bernama `<slug> Rina` tertaut ke `world.therapistId`, gaji 3.000.000 + tunjangan 500.000), `commissionInvoice(world, commission: number, status?: "FINAL" | "DIBATALKAN", finalizedAt?: Date): Promise<{ invoiceId: string; lineId: string }>`, `cleanupPayrollWorld(slug: string, whatsapp: string, monthPrefix: string): Promise<void>`

- [ ] **Step 1: Dunia uji**

Buat `tests/integration/payroll-world.ts`:

```ts
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

export type PayrollWorld = BillingWorld & { employeeId: string };
let seq = 0;

export async function createPayrollWorld(slug: string, whatsapp: string): Promise<PayrollWorld> {
  const world = await createBillingWorld(slug, whatsapp);
  const employee = await prisma.employee.create({
    data: { name: `${slug} Rina`, position: "Terapis", joinedOn: new Date("2026-01-01T00:00:00Z"), baseSalary: 3_000_000, allowance: 500_000, staffId: world.therapistId, branchId: world.branchId },
  });
  return { ...world, employeeId: employee.id };
}

/** Tagihan berisi satu baris treatment berkomisi untuk terapis dunia ini. */
export async function commissionInvoice(world: PayrollWorld, commission: number, status: "FINAL" | "DIBATALKAN" = "FINAL", finalizedAt = new Date()) {
  const invoice = await prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      status,
      number: `TG-2098-${String(Date.now() % 100000).padStart(5, "0")}${++seq}`,
      finalizedAt,
      lines: {
        create: [{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, commissionAmount: commission, performerId: world.therapistId, performerName: "Rina" }],
      },
    },
    select: { id: true, lines: { select: { id: true } } },
  });
  return { invoiceId: invoice.id, lineId: invoice.lines[0].id };
}

export async function cleanupPayrollWorld(slug: string, whatsapp: string, monthPrefix: string): Promise<void> {
  const employees = await prisma.employee.findMany({ where: { name: { startsWith: slug } }, select: { id: true } });
  const ids = employees.map((e) => e.id);
  // Penggajian bulan uji memuat semua karyawan yang bekerja di bulan itu, termasuk karyawan dari uji lain: bersihkan semuanya.
  const items = { OR: [{ employeeId: { in: ids } }, { period: { month: { startsWith: monthPrefix } } }] };
  await prisma.invoiceLine.updateMany({ where: { payrollItem: items }, data: { payrollItemId: null } });
  await prisma.payrollItem.deleteMany({ where: items });
  await prisma.payrollPeriod.deleteMany({ where: { month: { startsWith: monthPrefix } } });
  await prisma.expense.deleteMany({ where: { note: { contains: slug } } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  await cleanupBillingWorld(slug, [whatsapp]);
}
```

Catatan: nomor tagihan unik global dan tidak dibatasi pola (CHECK `invoice_status_fields` hanya mewajibkan nomor dan `finalizedAt` untuk FINAL); awalan `TG-2098-` dipakai agar tidak bentrok dengan nomor nyata. Bulan uji (`2091`, `2092`, …) khusus uji: pembersih menghapus semua baris dan periode dengan awalan itu, termasuk baris karyawan lain yang ikut terdaftar.

- [ ] **Step 2: Tulis uji yang gagal**

Buat `tests/integration/payroll-read.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getPayrollPeriod, listEmployees, listLinkableStaff, listPayrollPeriods } from "@/server/payroll-read";
import { openCommissions, syncCommissionCorrections } from "@/server/payroll-store";
import { cleanupPayrollWorld, commissionInvoice, createPayrollWorld, type PayrollWorld } from "./payroll-world";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Baca Gaji", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-gaji";
const WA = "6281200009720";
let world: PayrollWorld;

beforeAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2091");
  world = await createPayrollWorld(SLUG, WA);
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2091");
  await prisma.$disconnect();
});

describe("komisi terbuka dan bacaan penggajian", () => {
  it("komisi terbuka hanya dari tagihan FINAL yang belum diklaim, termasuk bulan sebelumnya", async () => {
    await commissionInvoice(world, 40_000, "FINAL", new Date("2026-05-10T03:00:00Z"));
    await commissionInvoice(world, 25_000);
    await commissionInvoice(world, 99_000, "DIBATALKAN");
    const open = await openCommissions(prisma, [world.therapistId], "2091-01");
    expect(open.get(world.therapistId)).toMatchObject({ commission: 65_000, treatments: 2 });
    expect(open.get(world.therapistId)!.lineIds).toHaveLength(2);
    expect((await openCommissions(prisma, [world.therapistId], "2026-04")).get(world.therapistId)).toBeUndefined();
  });

  it("baris penggajian belum dibayar menampilkan komisi terbuka dan total langsung", async () => {
    const period = await prisma.payrollPeriod.create({ data: { month: "2091-01", createdById: "s", createdByName: "Uji" } });
    const item = await prisma.payrollItem.create({ data: { periodId: period.id, employeeId: world.employeeId, employeeName: `${SLUG} Rina`, position: "Terapis", baseSalary: 3_000_000, allowance: 500_000 } });
    await prisma.payrollAdjustment.create({ data: { itemId: item.id, kind: "POTONGAN", amount: 100_000, note: "Kasbon", createdByName: "Uji" } });
    const detail = (await getPayrollPeriod("2091-01"))!;
    expect(detail.items.find((i) => i.id === item.id)).toMatchObject({ commission: 65_000, treatments: 2, deductionTotal: 100_000, total: 3_465_000, paidAt: null });
    expect((await listPayrollPeriods()).find((p) => p.month === "2091-01")).toMatchObject({ employees: 1, total: 3_465_000, paid: 0, unpaid: 3_465_000 });
    expect(await getPayrollPeriod("2091-12")).toBeNull();
  });

  it("koreksi komisi tagihan dibatalkan sesudah komisinya dibayar: sekali saja", async () => {
    const paidPeriod = await prisma.payrollPeriod.create({ data: { month: "2091-02", createdById: "s", createdByName: "Uji" } });
    const paidItem = await prisma.payrollItem.create({
      data: { periodId: paidPeriod.id, employeeId: world.employeeId, employeeName: "x", position: "x", baseSalary: 0, allowance: 0, paidAt: new Date("2091-02-28T00:00:00Z"), paidById: "s", paidByName: "Uji" },
    });
    const { invoiceId, lineId } = await commissionInvoice(world, 30_000);
    await prisma.invoiceLine.update({ where: { id: lineId }, data: { payrollItemId: paidItem.id } });
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "DIBATALKAN" } });

    const target = await prisma.payrollItem.findFirstOrThrow({ where: { period: { month: "2091-01" }, employeeId: world.employeeId } });
    await syncCommissionCorrections(prisma, { id: target.id, staffId: world.therapistId }, "Uji");
    await syncCommissionCorrections(prisma, { id: target.id, staffId: world.therapistId }, "Uji");
    const corrections = await prisma.payrollAdjustment.findMany({ where: { invoiceLineId: lineId } });
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ itemId: target.id, kind: "POTONGAN", amount: 30_000 });
    expect(corrections[0].note).toMatch(/^Koreksi komisi TG-2098-\S+ \(dibatalkan\)$/);
  });

  it("daftar karyawan dan staf yang bisa ditautkan; hanya Super Admin dan Admin Keuangan", async () => {
    const employee = (await listEmployees()).find((e) => e.id === world.employeeId)!;
    expect(employee).toMatchObject({ name: `${SLUG} Rina`, staffId: world.therapistId, status: "AKTIF", joinedOn: "2026-01-01", baseSalary: 3_000_000 });
    expect((await listLinkableStaff()).find((s) => s.id === world.therapistId)?.employeeId).toBe(world.employeeId);
    actor.role = "RESEPSIONIS";
    await expect(listEmployees()).rejects.toThrow("forbidden: payroll:manage");
    await expect(getPayrollPeriod("2091-01")).rejects.toThrow("forbidden: payroll:manage");
  });
});
```

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/payroll-read.test.ts` → Expected: FAIL `Cannot find package '@/server/payroll-read'`.

- [ ] **Step 4: `src/server/payroll-store.ts`**

```ts
import type { Prisma, PrismaClient } from "@prisma/client";
import { monthEndInstant } from "@/lib/payroll";

/** Logika basis data penggajian bersama bacaan dan aksi (spec karyawan 3). Modul biasa, bukan "use server". */
export type Db = PrismaClient | Prisma.TransactionClient;
export type OpenCommission = { commission: number; treatments: number; lineIds: string[] };

/** Komisi yang belum dibayar per staf: baris treatment berkomisi dari tagihan FINAL yang difinalkan sebelum akhir bulan itu. */
export async function openCommissions(db: Db, staffIds: string[], month: string): Promise<Map<string, OpenCommission>> {
  const result = new Map<string, OpenCommission>();
  if (staffIds.length === 0) return result;
  const rows = await db.invoiceLine.findMany({
    where: {
      kind: "TREATMENT",
      performerId: { in: staffIds },
      payrollItemId: null,
      commissionAmount: { gt: 0 },
      invoice: { status: "FINAL", finalizedAt: { lt: monthEndInstant(month) } },
    },
    select: { id: true, performerId: true, quantity: true, commissionAmount: true },
  });
  for (const row of rows) {
    const current = result.get(row.performerId!) ?? { commission: 0, treatments: 0, lineIds: [] };
    current.commission += row.commissionAmount;
    current.treatments += row.quantity;
    current.lineIds.push(row.id);
    result.set(row.performerId!, current);
  }
  return result;
}

/**
 * Koreksi otomatis (spec karyawan 3): baris komisi yang sudah dibayar tetapi tagihannya kemudian dibatalkan menjadi POTONGAN
 * di baris penggajian yang belum dibayar. `invoiceLineId` unik mencegah koreksi ganda.
 */
export async function syncCommissionCorrections(db: Db, item: { id: string; staffId: string | null }, actorName: string): Promise<void> {
  if (!item.staffId) return;
  const lines = await db.invoiceLine.findMany({
    where: { performerId: item.staffId, payrollItem: { paidAt: { not: null } }, invoice: { status: "DIBATALKAN" }, commissionAmount: { gt: 0 } },
    select: { id: true, commissionAmount: true, invoice: { select: { number: true } } },
  });
  if (lines.length === 0) return;
  const done = new Set(
    (await db.payrollAdjustment.findMany({ where: { invoiceLineId: { in: lines.map((l) => l.id) } }, select: { invoiceLineId: true } })).map((a) => a.invoiceLineId),
  );
  const fresh = lines.filter((l) => !done.has(l.id));
  if (fresh.length === 0) return;
  await db.payrollAdjustment.createMany({
    data: fresh.map((l) => ({
      itemId: item.id,
      kind: "POTONGAN" as const,
      amount: l.commissionAmount,
      note: `Koreksi komisi ${l.invoice.number ?? "tagihan"} (dibatalkan)`,
      invoiceLineId: l.id,
      createdByName: actorName,
    })),
    skipDuplicates: true,
  });
}

/** Pembayaran untuk karyawan yang sama bergiliran, supaya komisi yang sama tidak diklaim dua kali (Review Focus 1). */
export async function lockEmployee(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${id} FOR UPDATE`;
}

export function adjustmentTotals(adjustments: { kind: "BONUS" | "POTONGAN"; amount: number }[]): { bonusTotal: number; deductionTotal: number } {
  let bonusTotal = 0;
  let deductionTotal = 0;
  for (const a of adjustments) {
    if (a.kind === "BONUS") bonusTotal += a.amount;
    else deductionTotal += a.amount;
  }
  return { bonusTotal, deductionTotal };
}
```

- [ ] **Step 5: `src/server/payroll-read.ts`**

```ts
import { prisma } from "@/lib/db";
import { payrollTotal, worksInMonth } from "@/lib/payroll";
import { dateOnlyString } from "@/lib/stock";
import { adjustmentTotals, openCommissions } from "@/server/payroll-store";
import { requireCapability } from "@/server/session";

/** Bacaan menu Karyawan (spec karyawan 5–6). Semua fungsi memeriksa `payroll:manage`; kolom dipilih eksplisit. */
export type EmployeeRow = {
  id: string;
  name: string;
  position: string;
  branchId: string | null;
  branchName: string | null;
  joinedOn: string;
  nik: string | null;
  npwp: string | null;
  whatsapp: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  notes: string | null;
  baseSalary: number;
  allowance: number;
  status: "AKTIF" | "BERHENTI";
  leftOn: string | null;
  staffId: string | null;
  staffName: string | null;
};

export async function listEmployees(): Promise<EmployeeRow[]> {
  await requireCapability("payroll:manage");
  const rows = await prisma.employee.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, position: true, branchId: true, joinedOn: true, nik: true, npwp: true, whatsapp: true,
      bankName: true, bankAccount: true, bankHolder: true, notes: true, baseSalary: true, allowance: true, status: true, leftOn: true, staffId: true,
      branch: { select: { name: true } },
      staff: { select: { name: true } },
    },
  });
  return rows.map(({ branch, staff, joinedOn, leftOn, ...row }) => ({
    ...row,
    branchName: branch?.name ?? null,
    staffName: staff?.name ?? null,
    joinedOn: dateOnlyString(joinedOn),
    leftOn: leftOn ? dateOnlyString(leftOn) : null,
  }));
}

export async function listLinkableStaff(): Promise<{ id: string; name: string; employeeId: string | null }[]> {
  await requireCapability("payroll:manage");
  const rows = await prisma.staff.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, employee: { select: { id: true } } } });
  return rows.map((row) => ({ id: row.id, name: row.name, employeeId: row.employee?.id ?? null }));
}

export type PayrollItemRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  staffId: string | null;
  baseSalary: number;
  allowance: number;
  amountNote: string | null;
  commission: number;
  treatments: number;
  bonusTotal: number;
  deductionTotal: number;
  total: number;
  paidAt: string | null;
  paidByName: string | null;
  adjustments: { id: string; kind: "BONUS" | "POTONGAN"; amount: number; note: string; automatic: boolean }[];
};

const ITEM_SELECT = {
  id: true, employeeId: true, employeeName: true, position: true, baseSalary: true, allowance: true, amountNote: true,
  commission: true, treatments: true, bonusTotal: true, deductionTotal: true, total: true, paidAt: true, paidByName: true,
  employee: { select: { staffId: true } },
  adjustments: { orderBy: { createdAt: "asc" as const }, select: { id: true, kind: true, amount: true, note: true, invoiceLineId: true } },
} as const;

async function itemRows(month: string, items: Awaited<ReturnType<typeof loadItems>>): Promise<PayrollItemRow[]> {
  const unpaidStaff = items.filter((i) => !i.paidAt && i.employee.staffId).map((i) => i.employee.staffId!);
  const open = await openCommissions(prisma, unpaidStaff, month);
  return items.map(({ employee, adjustments, paidAt, ...item }) => {
    const rows = adjustments.map((a) => ({ id: a.id, kind: a.kind, amount: a.amount, note: a.note, automatic: a.invoiceLineId !== null }));
    if (paidAt) return { ...item, staffId: employee.staffId, paidAt: dateOnlyString(paidAt), adjustments: rows };
    const live = employee.staffId ? open.get(employee.staffId) : undefined;
    const totals = adjustmentTotals(rows);
    const amounts = { baseSalary: item.baseSalary, allowance: item.allowance, commission: live?.commission ?? 0, ...totals };
    return { ...item, ...amounts, treatments: live?.treatments ?? 0, total: payrollTotal(amounts), staffId: employee.staffId, paidAt: null, adjustments: rows };
  });
}

function loadItems(periodId: string) {
  return prisma.payrollItem.findMany({ where: { periodId }, orderBy: { employeeName: "asc" }, select: ITEM_SELECT });
}

export async function getPayrollPeriod(month: string): Promise<{ month: string; items: PayrollItemRow[]; addable: { id: string; name: string }[] } | null> {
  await requireCapability("payroll:manage");
  const period = await prisma.payrollPeriod.findUnique({ where: { month }, select: { id: true, month: true } });
  if (!period) return null;
  const items = await itemRows(month, await loadItems(period.id));
  const present = new Set(items.map((i) => i.employeeId));
  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, joinedOn: true, status: true, leftOn: true } });
  const addable = employees
    .filter((e) => !present.has(e.id) && worksInMonth({ joinedOn: dateOnlyString(e.joinedOn), status: e.status, leftOn: e.leftOn ? dateOnlyString(e.leftOn) : null }, month))
    .map((e) => ({ id: e.id, name: e.name }));
  return { month: period.month, items, addable };
}

export type PeriodSummary = { month: string; employees: number; total: number; paid: number; unpaid: number };

export async function listPayrollPeriods(): Promise<PeriodSummary[]> {
  await requireCapability("payroll:manage");
  const periods = await prisma.payrollPeriod.findMany({ orderBy: { month: "desc" }, select: { id: true, month: true } });
  const summaries: PeriodSummary[] = [];
  for (const period of periods) {
    const items = await itemRows(period.month, await loadItems(period.id));
    const total = items.reduce((sum, i) => sum + i.total, 0);
    const paid = items.filter((i) => i.paidAt).reduce((sum, i) => sum + i.total, 0);
    summaries.push({ month: period.month, employees: items.length, total, paid, unpaid: total - paid });
  }
  return summaries;
}
```

Catatan: `orderBy: [{ status: "asc" }]` mengurutkan enum menurut urutan deklarasi (`AKTIF` dulu).

- [ ] **Step 6: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/payroll-read.test.ts && npx tsc --noEmit -p .` → Expected: 4/4 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/payroll-store.ts src/server/payroll-read.ts tests/integration/payroll-world.ts tests/integration/payroll-read.test.ts
git commit -m "feat: open commissions, cancellation corrections, and payroll reads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Aksi data karyawan

**Files:**
- Create: `src/server/payroll-actions.ts` (dimulai di task ini, diperluas Task 5–6)
- Modify: `src/lib/audit-labels.ts`
- Test: `tests/integration/payroll-employee.test.ts`, `tests/unit/audit-labels.test.ts`

**Interfaces:**
- Consumes: `validateEmployee`, `EmployeeInput` (Task 2).
- Produces (`"use server"`): `createEmployee(input: EmployeeInput): Promise<ActionResult<{ id: string }>>`, `updateEmployee(input: { id: string } & EmployeeInput): Promise<ActionResult>`, `setEmployeeStatus(input: { id: string; status: "AKTIF" | "BERHENTI"; leftOn?: string | null }): Promise<ActionResult>`; helper internal `revalidatePayroll(month?: string)`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/payroll-employee.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createEmployee, setEmployeeStatus, updateEmployee } from "@/server/payroll-actions";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Karyawan", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
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

const SLUG = "aksi-karyawan";
const WA = "6281200009721";
let world: BillingWorld;
const base = () => ({
  name: `${SLUG} Budi`, position: "Satpam", branchId: world.branchId, joinedOn: "2026-02-01", nik: "7171010101010002", npwp: "", whatsapp: "081234567891",
  bankName: "BRI", bankAccount: "0012345678", bankHolder: "Budi", notes: "", baseSalary: 2_800_000, allowance: 200_000, staffId: null,
});

beforeAll(async () => {
  await prisma.employee.deleteMany({ where: { name: { startsWith: SLUG } } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Keuangan Karyawan" } });
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await prisma.employee.deleteMany({ where: { name: { startsWith: SLUG } } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Keuangan Karyawan" } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("data karyawan (spec karyawan 2.1)", () => {
  it("menambah karyawan tanpa akun; audit tanpa NIK atau rekening", async () => {
    const { id } = await unwrap(createEmployee(base()));
    expect(await prisma.employee.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: `${SLUG} Budi`, nik: "7171010101010002", whatsapp: "6281234567891", bankAccount: "0012345678", status: "AKTIF" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "employee.create", entityId: id } });
    expect(audit.summary).toBe(`${SLUG} Budi (Satpam): gaji Rp 2.800.000 + tunjangan Rp 200.000`);
    expect(audit.summary).not.toMatch(/7171|0012345678/);
  });

  it("menautkan staf satu-satu; staf yang sudah tertaut ditolak", async () => {
    const { id } = await unwrap(createEmployee({ ...base(), name: `${SLUG} Rina`, staffId: world.therapistId }));
    expect((await prisma.employee.findUniqueOrThrow({ where: { id } })).staffId).toBe(world.therapistId);
    expect(await createEmployee({ ...base(), name: `${SLUG} Rina Dua`, staffId: world.therapistId })).toEqual({ ok: false, error: "Staf ini sudah ditautkan ke karyawan lain." });
    expect(await createEmployee({ ...base(), name: `${SLUG} Hantu`, staffId: "tidak-ada" })).toEqual({ ok: false, error: "Staf tidak ditemukan." });
    expect(await createEmployee({ ...base(), name: `${SLUG} Hantu`, branchId: "tidak-ada" })).toEqual({ ok: false, error: "Cabang tidak ditemukan." });
  });

  it("mengubah data dan gaji; karyawan tidak ada ditolak", async () => {
    const { id } = await unwrap(createEmployee({ ...base(), name: `${SLUG} Ubah` }));
    await unwrap(updateEmployee({ id, ...base(), name: `${SLUG} Ubah Baru`, baseSalary: 3_100_000 }));
    expect(await prisma.employee.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: `${SLUG} Ubah Baru`, baseSalary: 3_100_000 });
    expect(await updateEmployee({ id: "tidak-ada", ...base() })).toEqual({ ok: false, error: "Karyawan tidak ditemukan." });
  });

  it("berhenti wajib bertanggal keluar yang tidak sebelum tanggal masuk; bisa aktif kembali", async () => {
    const { id } = await unwrap(createEmployee({ ...base(), name: `${SLUG} Keluar` }));
    expect(await setEmployeeStatus({ id, status: "BERHENTI" })).toEqual({ ok: false, error: "Isi tanggal keluar." });
    expect(await setEmployeeStatus({ id, status: "BERHENTI", leftOn: "2026-01-15" })).toEqual({ ok: false, error: "Tanggal keluar tidak boleh sebelum tanggal masuk." });
    await unwrap(setEmployeeStatus({ id, status: "BERHENTI", leftOn: "2026-10-31" }));
    expect(await prisma.employee.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "BERHENTI", leftOn: new Date("2026-10-31T00:00:00Z") });
    await unwrap(setEmployeeStatus({ id, status: "AKTIF" }));
    expect(await prisma.employee.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "AKTIF", leftOn: null });
  });

  it("hanya Super Admin dan Admin Keuangan", async () => {
    actor.role = "SUPER_ADMIN";
    await unwrap(createEmployee({ ...base(), name: `${SLUG} Pemilik` }));
    for (const role of ["RESEPSIONIS", "APOTEKER", "DOKTER"] as const) {
      actor.role = role;
      await expect(createEmployee({ ...base(), name: `${SLUG} Tolak` })).rejects.toThrow("forbidden: payroll:manage");
    }
  });
});
```

Tambahkan di `tests/unit/audit-labels.test.ts`:

```ts
  it("aksi karyawan dan penggajian punya bahasa manusia", () => {
    expect(auditActionLabel("employee.create")).toBe("menambah karyawan");
    expect(auditActionLabel("employee.update")).toBe("mengubah data karyawan");
    expect(auditActionLabel("employee.status")).toBe("mengubah status karyawan");
    expect(auditActionLabel("payroll.create")).toBe("membuat penggajian");
    expect(auditActionLabel("payroll.update")).toBe("mengubah penggajian");
    expect(auditActionLabel("payroll.pay")).toBe("membayar gaji");
    expect(auditActionLabel("payroll.void")).toBe("membatalkan pembayaran gaji");
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/payroll-employee.test.ts && npx vitest run tests/unit/audit-labels.test.ts` → Expected: FAIL (modul tidak ada; label belum ada).

- [ ] **Step 3: `src/server/payroll-actions.ts` (bagian karyawan)**

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { validateEmployee, type EmployeeInput } from "@/lib/payroll";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, isDateString } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

const EMPLOYEE_NOT_FOUND = "Karyawan tidak ditemukan.";
const STAFF_TAKEN = "Staf ini sudah ditautkan ke karyawan lain.";

function revalidatePayroll(month?: string) {
  safeRevalidatePath("/admin/karyawan");
  if (month) safeRevalidatePath(`/admin/karyawan/penggajian/${month}`);
  safeRevalidatePath("/admin/pengeluaran");
  safeRevalidatePath("/admin/laporan");
  safeRevalidatePath("/admin");
}

async function checkEmployeeLinks(value: EmployeeInput) {
  if (value.branchId && !(await prisma.branch.findUnique({ where: { id: value.branchId }, select: { id: true } }))) throw new UserFacingError("Cabang tidak ditemukan.");
  if (value.staffId && !(await prisma.staff.findUnique({ where: { id: value.staffId }, select: { id: true } }))) throw new UserFacingError("Staf tidak ditemukan.");
}

async function staffGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError(STAFF_TAKEN);
    throw error;
  }
}

/** Ringkasan audit tanpa NIK, NPWP, atau rekening (spec karyawan 6). */
const employeeSummary = (v: EmployeeInput) => `${v.name} (${v.position}): gaji ${formatRupiah(v.baseSalary)} + tunjangan ${formatRupiah(v.allowance)}`;

export async function createEmployee(input: EmployeeInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const checked = validateEmployee(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    await checkEmployeeLinks(value);
    const created = await staffGuard(() => prisma.employee.create({ data: { ...value, joinedOn: dateOnly(value.joinedOn) }, select: { id: true } }));
    await recordAudit({ actor, action: "employee.create", entity: "Employee", entityId: created.id, summary: employeeSummary(value) });
    revalidatePayroll();
    return { id: created.id };
  });
}

export async function updateEmployee(input: { id: string } & EmployeeInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const checked = validateEmployee(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const value = checked.value;
    const before = await prisma.employee.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true } });
    if (!before) throw new UserFacingError(EMPLOYEE_NOT_FOUND);
    await checkEmployeeLinks(value);
    await staffGuard(() => prisma.employee.update({ where: { id: before.id }, data: { ...value, joinedOn: dateOnly(value.joinedOn) } }));
    await recordAudit({ actor, action: "employee.update", entity: "Employee", entityId: before.id, summary: employeeSummary(value) });
    revalidatePayroll();
  });
}

export async function setEmployeeStatus(input: { id: string; status: "AKTIF" | "BERHENTI"; leftOn?: string | null }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const employee = await prisma.employee.findUnique({ where: { id: String(input?.id ?? "") }, select: { id: true, name: true, joinedOn: true } });
    if (!employee) throw new UserFacingError(EMPLOYEE_NOT_FOUND);
    if (input?.status === "BERHENTI") {
      if (!isDateString(input.leftOn)) throw new UserFacingError("Isi tanggal keluar.");
      if (dateOnly(input.leftOn) < employee.joinedOn) throw new UserFacingError("Tanggal keluar tidak boleh sebelum tanggal masuk.");
      await prisma.employee.update({ where: { id: employee.id }, data: { status: "BERHENTI", leftOn: dateOnly(input.leftOn) } });
      await recordAudit({ actor, action: "employee.status", entity: "Employee", entityId: employee.id, summary: `${employee.name}: berhenti per ${input.leftOn}` });
    } else if (input?.status === "AKTIF") {
      await prisma.employee.update({ where: { id: employee.id }, data: { status: "AKTIF", leftOn: null } });
      await recordAudit({ actor, action: "employee.status", entity: "Employee", entityId: employee.id, summary: `${employee.name}: aktif kembali` });
    } else {
      throw new UserFacingError("Data tidak sah. Muat ulang halaman lalu coba lagi.");
    }
    revalidatePayroll();
  });
}
```

Label audit: di `src/lib/audit-labels.ts` tambahkan sesudah entri `site_service.photo`:

```ts
  "employee.create": "menambah karyawan",
  "employee.update": "mengubah data karyawan",
  "employee.status": "mengubah status karyawan",
  "payroll.create": "membuat penggajian",
  "payroll.update": "mengubah penggajian",
  "payroll.pay": "membayar gaji",
  "payroll.void": "membatalkan pembayaran gaji",
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/payroll-employee.test.ts && npx vitest run tests/unit/audit-labels.test.ts && npx tsc --noEmit -p .` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/payroll-actions.ts src/lib/audit-labels.ts tests/integration/payroll-employee.test.ts tests/unit/audit-labels.test.ts
git commit -m "feat: add, edit, link, and stop employees

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Aksi penggajian: buat, isi, penyesuaian

**Files:**
- Modify: `src/server/payroll-actions.ts`
- Test: `tests/integration/payroll-period.test.ts`

**Interfaces:**
- Consumes: `worksInMonth`, `validateAdjustment`, `validateAmounts` (Task 2); `syncCommissionCorrections` (Task 3).
- Produces: `createPayrollPeriod(input: { month: string }): Promise<ActionResult<{ month: string }>>`, `deletePayrollPeriod(input: { month: string }): Promise<ActionResult>`, `addPayrollItem(input: { month: string; employeeId: string }): Promise<ActionResult>`, `removePayrollItem(input: { itemId: string }): Promise<ActionResult>`, `updatePayrollAmounts(input: { itemId: string; baseSalary: number; allowance: number; note: string }): Promise<ActionResult>`, `addPayrollAdjustment(input: { itemId: string } & AdjustmentInput): Promise<ActionResult>`, `removePayrollAdjustment(input: { adjustmentId: string }): Promise<ActionResult>`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/payroll-period.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  addPayrollAdjustment,
  addPayrollItem,
  createPayrollPeriod,
  deletePayrollPeriod,
  removePayrollAdjustment,
  removePayrollItem,
  updatePayrollAmounts,
} from "@/server/payroll-actions";
import { getPayrollPeriod } from "@/server/payroll-read";
import { cleanupPayrollWorld, createPayrollWorld, type PayrollWorld } from "./payroll-world";
import { unwrap } from "./unwrap";

type Role = "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Periode", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
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

const SLUG = "periode-gaji";
const WA = "6281200009722";
let world: PayrollWorld;
let leftId: string;
let futureId: string;
const itemOf = async (month: string, employeeId: string) => prisma.payrollItem.findFirstOrThrow({ where: { period: { month }, employeeId } });

beforeAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2092");
  world = await createPayrollWorld(SLUG, WA);
  leftId = (await prisma.employee.create({ data: { name: `${SLUG} Keluar`, position: "Driver", joinedOn: new Date("2026-01-01T00:00:00Z"), status: "BERHENTI", leftOn: new Date("2091-12-31T00:00:00Z"), baseSalary: 1 } })).id;
  futureId = (await prisma.employee.create({ data: { name: `${SLUG} Baru`, position: "Driver", joinedOn: new Date("2093-01-01T00:00:00Z"), baseSalary: 1 } })).id;
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2092");
  await prisma.$disconnect();
});

describe("penggajian bulanan (spec karyawan 4)", () => {
  it("membuat penggajian untuk karyawan yang bekerja di bulan itu; bulan ganda ditolak (Review Focus 4)", async () => {
    await unwrap(createPayrollPeriod({ month: "2092-01" }));
    const ids = (await prisma.payrollItem.findMany({ where: { period: { month: "2092-01" } }, select: { employeeId: true } })).map((i) => i.employeeId);
    expect(ids).toContain(world.employeeId);
    expect(ids).not.toContain(leftId);
    expect(ids).not.toContain(futureId);
    expect(await itemOf("2092-01", world.employeeId)).toMatchObject({ employeeName: `${SLUG} Rina`, baseSalary: 3_000_000, allowance: 500_000 });
    expect(await createPayrollPeriod({ month: "2092-01" })).toEqual({ ok: false, error: "Penggajian bulan ini sudah ada." });
    expect(await createPayrollPeriod({ month: "2092-13" })).toEqual({ ok: false, error: "Pilih bulan." });
    expect(await addPayrollItem({ month: "2092-01", employeeId: futureId })).toEqual({ ok: false, error: "Karyawan ini tidak bekerja di bulan tersebut." });
    expect(await addPayrollItem({ month: "2092-01", employeeId: world.employeeId })).toEqual({ ok: false, error: "Karyawan ini sudah ada di penggajian bulan ini." });
  });

  it("menambah dan mengeluarkan karyawan dari daftar", async () => {
    const other = await prisma.employee.create({ data: { name: `${SLUG} Tambah`, position: "Driver", joinedOn: new Date("2026-01-01T00:00:00Z"), baseSalary: 1 } });
    expect((await getPayrollPeriod("2092-01"))!.addable.map((e) => e.id)).toContain(other.id);
    await unwrap(addPayrollItem({ month: "2092-01", employeeId: other.id }));
    const item = await itemOf("2092-01", other.id);
    await unwrap(removePayrollItem({ itemId: item.id }));
    expect(await prisma.payrollItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it("gaji bulan itu bisa diubah dengan alasan; bonus dan potongan ditambah dan dihapus", async () => {
    const item = await itemOf("2092-01", world.employeeId);
    expect(await updatePayrollAmounts({ itemId: item.id, baseSalary: 1_500_000, allowance: 500_000, note: "" })).toEqual({ ok: false, error: "Isi alasan perubahan gaji." });
    await unwrap(updatePayrollAmounts({ itemId: item.id, baseSalary: 1_500_000, allowance: 500_000, note: "Masuk tengah bulan" }));
    expect(await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ baseSalary: 1_500_000, amountNote: "Masuk tengah bulan" });
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "BONUS", amount: 250_000, note: "Bonus target" }));
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "POTONGAN", amount: 100_000, note: "Kasbon" }));
    const row = (await getPayrollPeriod("2092-01"))!.items.find((i) => i.id === item.id)!;
    expect(row).toMatchObject({ bonusTotal: 250_000, deductionTotal: 100_000, total: 2_150_000 });
    await unwrap(removePayrollAdjustment({ adjustmentId: row.adjustments[1].id }));
    expect((await getPayrollPeriod("2092-01"))!.items.find((i) => i.id === item.id)!.deductionTotal).toBe(0);
  });

  it("koreksi otomatis tidak bisa dihapus; baris dibayar tidak bisa diubah; penggajian yang pernah dibayar tidak bisa dihapus", async () => {
    const item = await itemOf("2092-01", world.employeeId);
    const auto = await prisma.payrollAdjustment.create({ data: { itemId: item.id, kind: "POTONGAN", amount: 1, note: "Koreksi komisi uji", invoiceLineId: `uji-${item.id}`, createdByName: "Uji" } });
    expect(await removePayrollAdjustment({ adjustmentId: auto.id })).toEqual({ ok: false, error: "Koreksi otomatis tidak bisa dihapus." });
    await prisma.payrollAdjustment.delete({ where: { id: auto.id } });

    await prisma.payrollItem.update({ where: { id: item.id }, data: { paidAt: new Date("2092-01-31T00:00:00Z"), paidById: "s", paidByName: "Uji" } });
    expect(await addPayrollAdjustment({ itemId: item.id, kind: "BONUS", amount: 1, note: "Telat" })).toEqual({ ok: false, error: "Baris yang sudah dibayar tidak bisa diubah." });
    expect(await removePayrollItem({ itemId: item.id })).toEqual({ ok: false, error: "Baris yang sudah dibayar tidak bisa diubah." });
    expect(await deletePayrollPeriod({ month: "2092-01" })).toEqual({ ok: false, error: "Penggajian yang pernah dibayar tidak bisa dihapus." });

    await unwrap(createPayrollPeriod({ month: "2092-02" }));
    await unwrap(deletePayrollPeriod({ month: "2092-02" }));
    expect(await prisma.payrollPeriod.findUnique({ where: { month: "2092-02" } })).toBeNull();
  });

  it("Resepsionis ditolak", async () => {
    actor.role = "RESEPSIONIS";
    await expect(createPayrollPeriod({ month: "2092-03" })).rejects.toThrow("forbidden: payroll:manage");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/payroll-period.test.ts` → Expected: FAIL (`createPayrollPeriod is not a function`).

- [ ] **Step 3: Implementasi (tambahkan ke `src/server/payroll-actions.ts`)**

Tambahkan import: `import { isMonthString } from "@/lib/expense";`, `import { validateAdjustment, validateAmounts, worksInMonth, type AdjustmentInput } from "@/lib/payroll";` (gabungkan dengan import `@/lib/payroll` yang ada), `import { dateOnlyString } from "@/lib/stock";` (gabungkan), `import { syncCommissionCorrections } from "@/server/payroll-store";`. Lalu:

```ts
const PERIOD_NOT_FOUND = "Penggajian tidak ditemukan.";
const ITEM_NOT_FOUND = "Baris penggajian tidak ditemukan.";
const ITEM_PAID = "Baris yang sudah dibayar tidak bisa diubah.";

const workRecord = (e: { joinedOn: Date; status: "AKTIF" | "BERHENTI"; leftOn: Date | null }) => ({
  joinedOn: dateOnlyString(e.joinedOn),
  status: e.status,
  leftOn: e.leftOn ? dateOnlyString(e.leftOn) : null,
});

/** Baris belum dibayar beserta bulan dan staf tertautnya; selain itu galat yang bisa dibaca pengguna. */
async function unpaidItem(itemId: unknown) {
  const item = await prisma.payrollItem.findUnique({
    where: { id: String(itemId ?? "") },
    select: { id: true, paidAt: true, employeeName: true, period: { select: { month: true } }, employee: { select: { baseSalary: true, allowance: true, staffId: true } } },
  });
  if (!item) throw new UserFacingError(ITEM_NOT_FOUND);
  if (item.paidAt) throw new UserFacingError(ITEM_PAID);
  return item;
}

export async function createPayrollPeriod(input: { month: string }): Promise<ActionResult<{ month: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const month = input?.month;
    if (!isMonthString(month)) throw new UserFacingError("Pilih bulan.");
    const employees = await prisma.employee.findMany({
      select: { id: true, name: true, position: true, baseSalary: true, allowance: true, joinedOn: true, status: true, leftOn: true, staffId: true },
    });
    const working = employees.filter((e) => worksInMonth(workRecord(e), month));
    try {
      await prisma.$transaction(async (tx) => {
        const period = await tx.payrollPeriod.create({ data: { month, createdById: actor.staffId, createdByName: actor.name }, select: { id: true } });
        for (const e of working) {
          const item = await tx.payrollItem.create({
            data: { periodId: period.id, employeeId: e.id, employeeName: e.name, position: e.position, baseSalary: e.baseSalary, allowance: e.allowance },
            select: { id: true },
          });
          await syncCommissionCorrections(tx, { id: item.id, staffId: e.staffId }, actor.name);
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError("Penggajian bulan ini sudah ada.");
      throw error;
    }
    await recordAudit({ actor, action: "payroll.create", entity: "PayrollPeriod", entityId: month, summary: `Penggajian ${month}: ${working.length} karyawan` });
    revalidatePayroll(month);
    return { month };
  });
}

export async function deletePayrollPeriod(input: { month: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const period = await prisma.payrollPeriod.findUnique({ where: { month: String(input?.month ?? "") }, select: { id: true, month: true, items: { select: { paidAt: true, voidedPayments: true } } } });
    if (!period) throw new UserFacingError(PERIOD_NOT_FOUND);
    if (period.items.some((i) => i.paidAt || i.voidedPayments > 0)) throw new UserFacingError("Penggajian yang pernah dibayar tidak bisa dihapus.");
    await prisma.$transaction([prisma.payrollItem.deleteMany({ where: { periodId: period.id } }), prisma.payrollPeriod.delete({ where: { id: period.id } })]);
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollPeriod", entityId: period.month, summary: `Penggajian ${period.month} dihapus` });
    revalidatePayroll(period.month);
  });
}

export async function addPayrollItem(input: { month: string; employeeId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const period = await prisma.payrollPeriod.findUnique({ where: { month: String(input?.month ?? "") }, select: { id: true, month: true } });
    if (!period) throw new UserFacingError(PERIOD_NOT_FOUND);
    const e = await prisma.employee.findUnique({
      where: { id: String(input?.employeeId ?? "") },
      select: { id: true, name: true, position: true, baseSalary: true, allowance: true, joinedOn: true, status: true, leftOn: true, staffId: true },
    });
    if (!e) throw new UserFacingError(EMPLOYEE_NOT_FOUND);
    if (!worksInMonth(workRecord(e), period.month)) throw new UserFacingError("Karyawan ini tidak bekerja di bulan tersebut.");
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.payrollItem.create({
          data: { periodId: period.id, employeeId: e.id, employeeName: e.name, position: e.position, baseSalary: e.baseSalary, allowance: e.allowance },
          select: { id: true },
        });
        await syncCommissionCorrections(tx, { id: item.id, staffId: e.staffId }, actor.name);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError("Karyawan ini sudah ada di penggajian bulan ini.");
      throw error;
    }
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollPeriod", entityId: period.month, summary: `Tambah ${e.name} ke penggajian ${period.month}` });
    revalidatePayroll(period.month);
  });
}

export async function removePayrollItem(input: { itemId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const item = await unpaidItem(input?.itemId);
    await prisma.payrollItem.delete({ where: { id: item.id } });
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollItem", entityId: item.id, summary: `Keluarkan ${item.employeeName} dari penggajian ${item.period.month}` });
    revalidatePayroll(item.period.month);
  });
}

export async function updatePayrollAmounts(input: { itemId: string; baseSalary: number; allowance: number; note: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const item = await unpaidItem(input?.itemId);
    const checked = validateAmounts(input, { baseSalary: item.employee.baseSalary, allowance: item.employee.allowance });
    if (!checked.ok) throw new UserFacingError(checked.message);
    await prisma.payrollItem.update({ where: { id: item.id }, data: { baseSalary: checked.value.baseSalary, allowance: checked.value.allowance, amountNote: checked.value.note } });
    await recordAudit({
      actor,
      action: "payroll.update",
      entity: "PayrollItem",
      entityId: item.id,
      summary: `${item.employeeName} ${item.period.month}: gaji ${formatRupiah(checked.value.baseSalary)} + tunjangan ${formatRupiah(checked.value.allowance)}`,
    });
    revalidatePayroll(item.period.month);
  });
}

export async function addPayrollAdjustment(input: { itemId: string } & AdjustmentInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const item = await unpaidItem(input?.itemId);
    const checked = validateAdjustment(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    await prisma.payrollAdjustment.create({ data: { itemId: item.id, ...checked.value, createdByName: actor.name } });
    const sign = checked.value.kind === "BONUS" ? "+" : "−";
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollItem", entityId: item.id, summary: `${item.employeeName} ${item.period.month}: ${checked.value.note} ${sign}${formatRupiah(checked.value.amount)}` });
    revalidatePayroll(item.period.month);
  });
}

export async function removePayrollAdjustment(input: { adjustmentId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const adjustment = await prisma.payrollAdjustment.findUnique({ where: { id: String(input?.adjustmentId ?? "") }, select: { id: true, itemId: true, note: true, invoiceLineId: true } });
    if (!adjustment) throw new UserFacingError("Penyesuaian tidak ditemukan.");
    const item = await unpaidItem(adjustment.itemId);
    if (adjustment.invoiceLineId) throw new UserFacingError("Koreksi otomatis tidak bisa dihapus.");
    await prisma.payrollAdjustment.delete({ where: { id: adjustment.id } });
    await recordAudit({ actor, action: "payroll.update", entity: "PayrollItem", entityId: item.id, summary: `${item.employeeName} ${item.period.month}: hapus ${adjustment.note}` });
    revalidatePayroll(item.period.month);
  });
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/payroll-period.test.ts && npx tsc --noEmit -p .` → Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/payroll-actions.ts tests/integration/payroll-period.test.ts
git commit -m "feat: create monthly payrolls, manage rows, salary changes, bonuses, and deductions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tandai dibayar dan batalkan pembayaran

**Files:**
- Modify: `src/server/payroll-actions.ts`
- Test: `tests/integration/payroll-pay.test.ts`

**Interfaces:**
- Consumes: `expenseSplit`, `payrollTotal`, `PAYROLL_SALARY_CATEGORY`, `PAYROLL_COMMISSION_CATEGORY` (Task 2); `openCommissions`, `syncCommissionCorrections`, `lockEmployee`, `adjustmentTotals` (Task 3); `validateReason` (`src/lib/stock.ts`); `witaDateString` (`src/lib/time.ts`).
- Produces: `payPayrollItem(input: { itemId: string; paidOn: string }): Promise<ActionResult>`, `voidPayrollPayment(input: { itemId: string; reason: string }): Promise<ActionResult>`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/integration/payroll-pay.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { addPayrollAdjustment, createPayrollPeriod, payPayrollItem, voidPayrollPayment } from "@/server/payroll-actions";
import { expensesByMonth } from "@/server/report-sql";
import { cleanupPayrollWorld, commissionInvoice, createPayrollWorld, type PayrollWorld } from "./payroll-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Bayar", role: "ADMIN_KEUANGAN" as const, email: "u@uji.test" } }));
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

const SLUG = "bayar-gaji";
const WA = "6281200009723";
const today = witaDateString(new Date());
let world: PayrollWorld;
const itemOf = async (month: string) => prisma.payrollItem.findFirstOrThrow({ where: { period: { month }, employeeId: world.employeeId } });

beforeAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2093");
  world = await createPayrollWorld(SLUG, WA);
});
beforeEach(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2093");
  world = await createPayrollWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupPayrollWorld(SLUG, WA, "2093");
  await prisma.$disconnect();
});

describe("tandai dibayar (spec karyawan 4.3)", () => {
  it("mengunci nominal, mengklaim komisi, dan mencatat Pengeluaran Gaji Karyawan dan Komisi yang masuk laba rugi", async () => {
    const { lineId } = await commissionInvoice(world, 400_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "POTONGAN", amount: 200_000, note: "Kasbon" }));
    const before = (await expensesByMonth(today, today, null)).get(today.slice(0, 7)) ?? 0;

    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    const paid = await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id }, include: { salaryExpense: { include: { category: true } }, commissionExpense: { include: { category: true } } } });
    expect(paid).toMatchObject({ commission: 400_000, treatments: 1, deductionTotal: 200_000, total: 3_700_000, paidByName: "Keuangan Bayar" });
    expect(paid.salaryExpense).toMatchObject({ amount: 3_300_000, branchId: world.branchId, note: `Penggajian 2093-01 · ${SLUG} Rina`, category: { name: "Gaji Karyawan" } });
    expect(paid.commissionExpense).toMatchObject({ amount: 400_000, category: { name: "Komisi" } });
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: lineId } })).payrollItemId).toBe(item.id);
    expect((await expensesByMonth(today, today, null)).get(today.slice(0, 7))).toBe(before + 3_700_000);
    expect(await payPayrollItem({ itemId: item.id, paidOn: today })).toEqual({ ok: false, error: "Baris yang sudah dibayar tidak bisa diubah." });
  });

  it("komisi yang sudah dibayar tidak terhitung lagi di bulan berikutnya", async () => {
    await commissionInvoice(world, 50_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    await unwrap(payPayrollItem({ itemId: (await itemOf("2093-01")).id, paidOn: today }));
    await unwrap(createPayrollPeriod({ month: "2093-02" }));
    await unwrap(payPayrollItem({ itemId: (await itemOf("2093-02")).id, paidOn: today }));
    expect((await itemOf("2093-02")).commission).toBe(0);
  });

  it("dua pembayaran bersamaan di dua bulan: komisi hanya terbayar sekali (Review Focus 1)", async () => {
    await commissionInvoice(world, 70_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    await unwrap(createPayrollPeriod({ month: "2093-02" }));
    const [a, b] = [await itemOf("2093-01"), await itemOf("2093-02")];
    const results = await Promise.all([payPayrollItem({ itemId: a.id, paidOn: today }), payPayrollItem({ itemId: b.id, paidOn: today })]);
    expect(results.every((r) => r.ok)).toBe(true);
    const commissions = [(await itemOf("2093-01")).commission, (await itemOf("2093-02")).commission].sort();
    expect(commissions).toEqual([0, 70_000]);
  });

  it("menolak tanggal masa depan dan total negatif", async () => {
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    expect(await payPayrollItem({ itemId: item.id, paidOn: "2999-01-01" })).toEqual({ ok: false, error: "Tanggal bayar tidak boleh di masa depan." });
    expect(await payPayrollItem({ itemId: item.id, paidOn: "" })).toEqual({ ok: false, error: "Isi tanggal bayar." });
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "POTONGAN", amount: 4_000_000, note: "Kasbon besar" }));
    expect(await payPayrollItem({ itemId: item.id, paidOn: today })).toEqual({ ok: false, error: "Potongan melebihi gaji." });
  });

  it("potongan melebihi gaji tetapi tertutup komisi: tanpa pengeluaran negatif (Review Focus 2)", async () => {
    await commissionInvoice(world, 1_000_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    await unwrap(addPayrollAdjustment({ itemId: item.id, kind: "POTONGAN", amount: 3_800_000, note: "Kasbon besar" }));
    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    const paid = await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id }, include: { salaryExpense: true, commissionExpense: true } });
    expect(paid.total).toBe(700_000);
    expect(paid.salaryExpense).toBeNull();
    expect(paid.commissionExpense?.amount).toBe(700_000);
  });
});

describe("batalkan pembayaran (spec karyawan 4.4)", () => {
  it("membatalkan pengeluaran dan melepas klaim komisi; baris bisa dibayar lagi", async () => {
    const { lineId } = await commissionInvoice(world, 60_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const item = await itemOf("2093-01");
    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    const paid = await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } });

    expect(await voidPayrollPayment({ itemId: item.id, reason: "" })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(voidPayrollPayment({ itemId: item.id, reason: "Salah nominal" }));
    expect(await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ paidAt: null, commission: 0, total: 0, salaryExpenseId: null, commissionExpenseId: null, voidedPayments: 1 });
    for (const id of [paid.salaryExpenseId!, paid.commissionExpenseId!]) {
      expect(await prisma.expense.findUniqueOrThrow({ where: { id } })).toMatchObject({ voidReason: "Pembatalan penggajian: Salah nominal" });
    }
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: lineId } })).payrollItemId).toBeNull();
    expect(await voidPayrollPayment({ itemId: item.id, reason: "Lagi" })).toEqual({ ok: false, error: "Baris ini belum dibayar." });
    await unwrap(payPayrollItem({ itemId: item.id, paidOn: today }));
    expect((await prisma.payrollItem.findUniqueOrThrow({ where: { id: item.id } })).commission).toBe(60_000);
  });

  it("koreksi tagihan dibatalkan muncul sekali di bulan berikutnya, dan hilang bila pembayaran asalnya dibatalkan (Review Focus 3)", async () => {
    const { invoiceId, lineId } = await commissionInvoice(world, 80_000);
    await unwrap(createPayrollPeriod({ month: "2093-01" }));
    const january = await itemOf("2093-01");
    await unwrap(payPayrollItem({ itemId: january.id, paidOn: today }));
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "DIBATALKAN" } });

    await unwrap(createPayrollPeriod({ month: "2093-02" }));
    const february = await itemOf("2093-02");
    expect(await prisma.payrollAdjustment.findMany({ where: { itemId: february.id, invoiceLineId: lineId } })).toHaveLength(1);

    await unwrap(voidPayrollPayment({ itemId: january.id, reason: "Salah bulan" }));
    expect(await prisma.payrollAdjustment.count({ where: { invoiceLineId: lineId } })).toBe(0);
    await unwrap(payPayrollItem({ itemId: february.id, paidOn: today }));
    expect((await itemOf("2093-02")).deductionTotal).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/payroll-pay.test.ts` → Expected: FAIL (`payPayrollItem is not a function`).

- [ ] **Step 3: Implementasi (tambahkan ke `src/server/payroll-actions.ts`)**

Tambahkan ke import: `expenseSplit, payrollTotal, PAYROLL_COMMISSION_CATEGORY, PAYROLL_SALARY_CATEGORY` dari `@/lib/payroll`; `validateReason` dari `@/lib/stock`; `import { witaDateString } from "@/lib/time";`; `adjustmentTotals, lockEmployee, openCommissions` dari `@/server/payroll-store`. Lalu:

```ts
/** Kategori pengeluaran penggajian; dibuat bila belum ada (nama dibandingkan tanpa huruf besar/kecil). */
async function ensureCategory(name: string): Promise<string> {
  const find = () => prisma.expenseCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  const found = await find();
  if (found) return found.id;
  const last = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
  try {
    return (await prisma.expenseCategory.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 }, select: { id: true } })).id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await find())!.id;
  }
}

export async function payPayrollItem(input: { itemId: string; paidOn: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    if (!isDateString(input?.paidOn)) throw new UserFacingError("Isi tanggal bayar.");
    if (input.paidOn > witaDateString(new Date())) throw new UserFacingError("Tanggal bayar tidak boleh di masa depan.");
    const head = await prisma.payrollItem.findUnique({ where: { id: String(input?.itemId ?? "") }, select: { id: true, employeeId: true } });
    if (!head) throw new UserFacingError(ITEM_NOT_FOUND);
    const [salaryCategoryId, commissionCategoryId] = [await ensureCategory(PAYROLL_SALARY_CATEGORY), await ensureCategory(PAYROLL_COMMISSION_CATEGORY)];

    const summary = await prisma.$transaction(async (tx) => {
      await lockEmployee(tx, head.employeeId);
      const item = await tx.payrollItem.findUniqueOrThrow({
        where: { id: head.id },
        select: { id: true, paidAt: true, employeeName: true, baseSalary: true, allowance: true, period: { select: { month: true } }, employee: { select: { staffId: true, branchId: true } } },
      });
      if (item.paidAt) throw new UserFacingError(ITEM_PAID);
      await syncCommissionCorrections(tx, { id: item.id, staffId: item.employee.staffId }, actor.name);
      const adjustments = await tx.payrollAdjustment.findMany({ where: { itemId: item.id }, select: { kind: true, amount: true } });
      const open = item.employee.staffId ? (await openCommissions(tx, [item.employee.staffId], item.period.month)).get(item.employee.staffId) : undefined;
      const amounts = { baseSalary: item.baseSalary, allowance: item.allowance, commission: open?.commission ?? 0, ...adjustmentTotals(adjustments) };
      const total = payrollTotal(amounts);
      if (total < 0) throw new UserFacingError("Potongan melebihi gaji.");
      const split = expenseSplit(amounts);
      const note = `Penggajian ${item.period.month} · ${item.employeeName}`;
      const expense = (categoryId: string, amount: number) =>
        amount > 0
          ? tx.expense.create({
              data: { date: dateOnly(input.paidOn), categoryId, amount, note, branchId: item.employee.branchId, createdById: actor.staffId, createdByName: actor.name },
              select: { id: true },
            })
          : Promise.resolve(null);
      const salaryExpense = await expense(salaryCategoryId, split.salary);
      const commissionExpense = await expense(commissionCategoryId, split.commission);

      if (open && open.lineIds.length > 0) {
        const { count } = await tx.invoiceLine.updateMany({ where: { id: { in: open.lineIds }, payrollItemId: null }, data: { payrollItemId: item.id } });
        if (count !== open.lineIds.length) throw new UserFacingError("Komisi berubah saat diproses. Coba lagi.");
      }
      await tx.payrollItem.update({
        where: { id: item.id },
        data: {
          ...amounts,
          treatments: open?.treatments ?? 0,
          total,
          paidAt: dateOnly(input.paidOn),
          paidById: actor.staffId,
          paidByName: actor.name,
          salaryExpenseId: salaryExpense?.id ?? null,
          commissionExpenseId: commissionExpense?.id ?? null,
        },
      });
      return { name: item.employeeName, month: item.period.month, total };
    });

    await recordAudit({ actor, action: "payroll.pay", entity: "PayrollItem", entityId: head.id, summary: `${summary.name} ${summary.month}: ${formatRupiah(summary.total)}` });
    revalidatePayroll(summary.month);
  });
}

export async function voidPayrollPayment(input: { itemId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("payroll:manage");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const head = await prisma.payrollItem.findUnique({ where: { id: String(input?.itemId ?? "") }, select: { id: true, employeeId: true } });
    if (!head) throw new UserFacingError(ITEM_NOT_FOUND);

    const summary = await prisma.$transaction(async (tx) => {
      await lockEmployee(tx, head.employeeId);
      const item = await tx.payrollItem.findUniqueOrThrow({
        where: { id: head.id },
        select: { id: true, paidAt: true, employeeName: true, total: true, salaryExpenseId: true, commissionExpenseId: true, period: { select: { month: true } } },
      });
      if (!item.paidAt) throw new UserFacingError("Baris ini belum dibayar.");
      const expenseIds = [item.salaryExpenseId, item.commissionExpenseId].filter((id): id is string => id !== null);
      await tx.expense.updateMany({
        where: { id: { in: expenseIds }, voidedAt: null },
        data: { voidedAt: new Date(), voidedByName: actor.name, voidReason: `Pembatalan penggajian: ${reason.value}` },
      });
      const claimed = (await tx.invoiceLine.findMany({ where: { payrollItemId: item.id }, select: { id: true } })).map((l) => l.id);
      // Koreksi yang lahir dari klaim ini dan belum dibayar tidak berlaku lagi (Review Focus 3).
      await tx.payrollAdjustment.deleteMany({ where: { invoiceLineId: { in: claimed }, item: { paidAt: null } } });
      await tx.invoiceLine.updateMany({ where: { payrollItemId: item.id }, data: { payrollItemId: null } });
      await tx.payrollItem.update({
        where: { id: item.id },
        data: {
          paidAt: null,
          paidById: null,
          paidByName: null,
          salaryExpenseId: null,
          commissionExpenseId: null,
          commission: 0,
          treatments: 0,
          bonusTotal: 0,
          deductionTotal: 0,
          total: 0,
          voidedPayments: { increment: 1 },
        },
      });
      return { name: item.employeeName, month: item.period.month, total: item.total };
    });

    await recordAudit({ actor, action: "payroll.void", entity: "PayrollItem", entityId: head.id, summary: `${summary.name} ${summary.month}: ${formatRupiah(summary.total)} — ${reason.value}` });
    revalidatePayroll(summary.month);
  });
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/payroll-pay.test.ts tests/integration/payroll-period.test.ts tests/integration/expense-actions.test.ts && npx tsc --noEmit -p .` → Expected: PASS. Bila uji bersamaan (Review Focus 1) gagal karena salah satu pembayaran mendapat galat P2034/deadlock, catat ruling dan tangani dengan `lockEmployee` sebelum bacaan apa pun (sudah di urutan di atas); jangan melemahkan uji.

- [ ] **Step 5: Commit**

```bash
git add src/server/payroll-actions.ts tests/integration/payroll-pay.test.ts
git commit -m "feat: pay payroll rows into expenses with claimed commissions, and void payments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kolom "Dibayar" di laporan Komisi

**Files:**
- Modify: `src/server/report-sql.ts` (`CommissionDetailRow`, `commissionDetails`)
- Modify: `src/components/admin/report/commission-report.tsx`
- Modify: `tests/unit/components/commission-report.test.tsx`, `tests/unit/report.test.ts` (fixture `paidMonth: null`)
- Test: `tests/integration/report-commission.test.ts`

**Interfaces:**
- Produces: `CommissionDetailRow.paidMonth: string | null` — bulan penggajian yang membayar baris itu (hanya bila sudah dibayar).

- [ ] **Step 1: Tulis uji yang gagal**

Di `tests/integration/report-commission.test.ts`, tambahkan di dalam `describe`:

```ts
  it("rincian menandai baris yang komisinya sudah dibayar penggajian (spec karyawan 5)", async () => {
    const employee = await prisma.employee.create({ data: { name: `${SLUG} Rina`, position: "Terapis", joinedOn: new Date("2026-01-01T00:00:00Z") } });
    const period = await prisma.payrollPeriod.create({ data: { month: "2094-01", createdById: "s", createdByName: "Uji" } });
    const item = await prisma.payrollItem.create({
      data: { periodId: period.id, employeeId: employee.id, employeeName: "Rina", position: "Terapis", baseSalary: 0, allowance: 0, paidAt: new Date("2094-01-31T00:00:00Z"), paidById: "s", paidByName: "Uji" },
    });
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoice: { status: "FINAL", patientId: world.patientId }, performerId: world.therapistId, quantity: 2 } });
    await prisma.invoiceLine.update({ where: { id: line.id }, data: { payrollItemId: item.id } });
    try {
      const { details } = await getCommissionReport({ period: period(), branchId: world.branchId, performerId: world.therapistId });
      expect(details!.map((d) => [d.quantity, d.paidMonth]).sort()).toEqual([
        [1, null],
        [2, "2094-01"],
      ]);
    } finally {
      await prisma.invoiceLine.update({ where: { id: line.id }, data: { payrollItemId: null } });
      await prisma.payrollItem.delete({ where: { id: item.id } });
      await prisma.payrollPeriod.delete({ where: { id: period.id } });
      await prisma.employee.delete({ where: { id: employee.id } });
    }
  });
```

Di `tests/unit/components/commission-report.test.tsx`: tambahkan `paidMonth: "2026-10"` ke objek rincian dan, di uji yang sama, `expect(screen.getByRole("columnheader", { name: "Dibayar" })).toBeInTheDocument(); expect(screen.getByText("Penggajian 2026-10")).toBeInTheDocument();`. Di `tests/unit/report.test.ts` baris fixture rincian, tambahkan `paidMonth: null`.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/report-commission.test.ts && npx vitest run tests/unit/components/commission-report.test.tsx` → Expected: FAIL (`paidMonth` undefined; kolom tidak ada).

- [ ] **Step 3: Implementasi**

`src/server/report-sql.ts`: tambahkan `paidMonth: string | null;` ke `CommissionDetailRow`; di `commissionDetails`, tambahkan ke SELECT `, pp."month" AS "paidMonth"` dan ganti baris `FROM … JOIN "Patient" p ON p."id" = i."patientId"` dengan:

```sql
    FROM "InvoiceLine" l JOIN "Invoice" i ON i."id" = l."invoiceId" JOIN "Patient" p ON p."id" = i."patientId"
    LEFT JOIN "PayrollItem" pi ON pi."id" = l."payrollItemId" AND pi."paidAt" IS NOT NULL
    LEFT JOIN "PayrollPeriod" pp ON pp."id" = pi."periodId"
```

(tipe `$queryRaw` ikut: `Omit<CommissionDetailRow, "quantity" | "commission">` sudah memuat `paidMonth`). Pastikan `src/server/report-export.ts` hanya memakai kolom yang disebut eksplisit (tidak menyebarkan baris), sehingga CSV tidak berubah.

`src/components/admin/report/commission-report.tsx`: sesudah `<TableCell align="right">Komisi</TableCell>` pada kepala rincian tambahkan `<TableCell>Dibayar</TableCell>`; sesudah sel `formatRupiah(detail.commission)` tambahkan `<TableCell>{detail.paidMonth ? `Penggajian ${detail.paidMonth}` : "Belum"}</TableCell>`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/report-commission.test.ts tests/integration/report-export.test.ts && npx vitest run tests/unit/components/commission-report.test.tsx tests/unit/report.test.ts && npx tsc --noEmit -p .` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/report-sql.ts src/components/admin/report/commission-report.tsx tests/integration/report-commission.test.ts tests/unit/components/commission-report.test.tsx tests/unit/report.test.ts
git commit -m "feat: show which commission lines payroll already paid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Halaman Karyawan: tab Karyawan

**Files:**
- Create: `src/app/(admin)/admin/karyawan/page.tsx`
- Create: `src/components/admin/payroll/employee-dialog.tsx`, `src/components/admin/payroll/employee-status-button.tsx`, `src/components/admin/payroll/employee-table.tsx`
- Test: `tests/unit/components/employee-dialog.test.tsx`

**Interfaces:**
- Consumes: `createEmployee`, `updateEmployee`, `setEmployeeStatus` (Task 4); `listEmployees`, `listLinkableStaff`, `EmployeeRow` (Task 3); `validateEmployee` (Task 2).
- Produces: `EmployeeDialog({ branches, staffOptions, employee }: { branches: { id: string; name: string }[]; staffOptions: { id: string; name: string; employeeId: string | null }[]; employee?: EmployeeRow })` — tanpa `employee`: tombol "+ Karyawan", judul "Tambah karyawan"; dengan `employee`: tombol "Ubah" (`aria-label` "Ubah <nama>"), judul "Ubah — <nama>". `EmployeeStatusButton({ employee }: { employee: EmployeeRow })`. `EmployeeTable({ rows, branches, staffOptions })`. Halaman `/admin/karyawan` dengan tab `?tab=karyawan` (bawaan) dan `?tab=penggajian` (isi tab penggajian di Task 9; sementara `EmptyState` "Belum ada penggajian.").

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/employee-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeDialog } from "@/components/admin/payroll/employee-dialog";
import { createEmployee, updateEmployee } from "@/server/payroll-actions";
import type { EmployeeRow } from "@/server/payroll-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/payroll-actions", () => ({ createEmployee: vi.fn(), updateEmployee: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const BRANCHES = [{ id: "b1", name: "Mahakeret" }];
const STAFF = [
  { id: "t1", name: "Terapis Rina", employeeId: null },
  { id: "t2", name: "Terapis Lain", employeeId: "e9" },
];
const ROW: EmployeeRow = {
  id: "e1", name: "Rina", position: "Terapis", branchId: "b1", branchName: "Mahakeret", joinedOn: "2026-01-02", nik: null, npwp: null, whatsapp: null,
  bankName: null, bankAccount: null, bankHolder: null, notes: null, baseSalary: 3_000_000, allowance: 500_000, status: "AKTIF", leftOn: null, staffId: "t1", staffName: "Terapis Rina",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createEmployee).mockResolvedValue({ ok: true, data: { id: "baru" } });
  vi.mocked(updateEmployee).mockResolvedValue({ ok: true, data: undefined });
});

describe("EmployeeDialog (spec karyawan 5)", { timeout: 15_000 }, () => {
  it("menambah karyawan tanpa akun; staf yang sudah tertaut tidak bisa dipilih", async () => {
    const user = userEvent.setup();
    renderAdmin(<EmployeeDialog branches={BRANCHES} staffOptions={STAFF} />);
    await user.click(screen.getByRole("button", { name: "+ Karyawan" }));
    expect(screen.getByRole("dialog", { name: "Tambah karyawan" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Terapis Lain (sudah tertaut)" })).toBeDisabled();
    await user.type(screen.getByLabelText("Nama"), "Siti");
    await user.type(screen.getByLabelText("Jabatan"), "Cleaning service");
    await user.type(screen.getByLabelText("Gaji pokok"), "2500000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Isi tanggal masuk.")).toBeInTheDocument();
    expect(createEmployee).not.toHaveBeenCalled();
  });

  it("mengubah karyawan yang ada; galat server tampil", async () => {
    vi.mocked(updateEmployee).mockResolvedValue({ ok: false, error: "Staf ini sudah ditautkan ke karyawan lain." });
    const user = userEvent.setup();
    renderAdmin(<EmployeeDialog branches={BRANCHES} staffOptions={STAFF} employee={ROW} />);
    await user.click(screen.getByRole("button", { name: "Ubah Rina" }));
    expect(screen.getByRole("dialog", { name: "Ubah — Rina" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tunjangan tetap")).toHaveValue("Rp 500.000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateEmployee).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", name: "Rina", joinedOn: "2026-01-02", staffId: "t1", baseSalary: 3_000_000, allowance: 500_000 })),
    );
    expect(await screen.findByText("Staf ini sudah ditautkan ke karyawan lain.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/employee-dialog.test.tsx` → Expected: FAIL (modul tidak ada).

- [ ] **Step 3: `employee-dialog.tsx`**

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
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { validateEmployee } from "@/lib/payroll";
import { createEmployee, updateEmployee } from "@/server/payroll-actions";
import type { EmployeeRow } from "@/server/payroll-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { DateField } from "../mui/date-field";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

type Draft = {
  name: string; position: string; branchId: string; joinedOn: string; nik: string; npwp: string; whatsapp: string;
  bankName: string; bankAccount: string; bankHolder: string; notes: string; baseSalary: number | null; allowance: number | null; staffId: string;
};

const draftOf = (e?: EmployeeRow): Draft => ({
  name: e?.name ?? "", position: e?.position ?? "", branchId: e?.branchId ?? "", joinedOn: e?.joinedOn ?? "", nik: e?.nik ?? "", npwp: e?.npwp ?? "",
  whatsapp: e?.whatsapp ?? "", bankName: e?.bankName ?? "", bankAccount: e?.bankAccount ?? "", bankHolder: e?.bankHolder ?? "", notes: e?.notes ?? "",
  baseSalary: e?.baseSalary ?? null, allowance: e?.allowance ?? 0, staffId: e?.staffId ?? "",
});

/** Tambah atau ubah karyawan (spec karyawan 5). NIK dan rekening hanya tampil di dialog ini, tidak di tabel. */
export function EmployeeDialog({
  branches,
  staffOptions,
  employee,
}: {
  branches: { id: string; name: string }[];
  staffOptions: { id: string; name: string; employeeId: string | null }[];
  employee?: EmployeeRow;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(employee));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function openDialog() {
    setDraft(draftOf(employee));
    setError(null);
    setOpen(true);
  }

  function save() {
    const checked = validateEmployee({ ...draft, baseSalary: draft.baseSalary ?? Number.NaN, allowance: draft.allowance ?? Number.NaN });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = employee ? await updateEmployee({ id: employee.id, ...checked.value }) : await createEmployee(checked.value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(employee ? "Data karyawan tersimpan." : `${checked.value.name} ditambahkan.`);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      {employee ? (
        <Button type="button" size="small" variant="text" onClick={openDialog} aria-label={`Ubah ${employee.name}`}>
          Ubah
        </Button>
      ) : (
        <Button type="button" variant="contained" onClick={openDialog}>
          + Karyawan
        </Button>
      )}
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>{employee ? `Ubah — ${employee.name}` : "Tambah karyawan"}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id={`${id}-name`} label="Nama" value={draft.name} onChange={(e) => set("name")(e.target.value)} fullWidth />
            <TextField id={`${id}-position`} label="Jabatan" value={draft.position} onChange={(e) => set("position")(e.target.value)} fullWidth />
            <SelectField id={`${id}-branch`} label="Cabang utama" value={draft.branchId} onChange={set("branchId")}>
              <option value="">Umum (semua cabang)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectField>
            <SelectField id={`${id}-staff`} label="Tautkan ke staf" value={draft.staffId} onChange={set("staffId")}>
              <option value="">Tidak ditautkan (tanpa akun panel)</option>
              {staffOptions.map((s) => {
                const taken = s.employeeId !== null && s.employeeId !== employee?.id;
                return (
                  <option key={s.id} value={s.id} disabled={taken}>
                    {taken ? `${s.name} (sudah tertaut)` : s.name}
                  </option>
                );
              })}
            </SelectField>
            <DateField id={`${id}-joined`} label="Tanggal masuk" value={draft.joinedOn} onChange={set("joinedOn")} fullWidth />
            <RupiahInput id={`${id}-salary`} label="Gaji pokok" value={draft.baseSalary} onChange={set("baseSalary")} fullWidth />
            <RupiahInput id={`${id}-allowance`} label="Tunjangan tetap" value={draft.allowance} onChange={set("allowance")} fullWidth />
            <TextField id={`${id}-wa`} label="Nomor WhatsApp" value={draft.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)} fullWidth />
            <TextField id={`${id}-nik`} label="NIK (opsional)" value={draft.nik} onChange={(e) => set("nik")(e.target.value)} fullWidth />
            <TextField id={`${id}-npwp`} label="NPWP (opsional)" value={draft.npwp} onChange={(e) => set("npwp")(e.target.value)} fullWidth />
            <TextField id={`${id}-bank`} label="Nama bank" value={draft.bankName} onChange={(e) => set("bankName")(e.target.value)} fullWidth />
            <TextField id={`${id}-account`} label="Nomor rekening" value={draft.bankAccount} onChange={(e) => set("bankAccount")(e.target.value)} fullWidth />
            <TextField id={`${id}-holder`} label="Atas nama" value={draft.bankHolder} onChange={(e) => set("bankHolder")(e.target.value)} fullWidth />
            <TextField id={`${id}-notes`} label="Catatan" value={draft.notes} onChange={(e) => set("notes")(e.target.value)} multiline minRows={2} fullWidth />
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

Periksa tanda tangan `DateField` di `src/components/admin/mui/date-field.tsx` (`PickerFieldProps`: `id`, `label`, `value` "YYYY-MM-DD" atau "", `onChange(value: string)`, `fullWidth`, `max`). Bila berbeda, sesuaikan dan catat di ledger.

- [ ] **Step 4: `employee-status-button.tsx` dan `employee-table.tsx`**

`employee-status-button.tsx`:

```tsx
"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Alert from "@mui/material/Alert";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setEmployeeStatus } from "@/server/payroll-actions";
import type { EmployeeRow } from "@/server/payroll-read";
import { DateField } from "../mui/date-field";

/** Berhentikan (dengan tanggal keluar) atau aktifkan kembali (spec karyawan 2.1). */
export function EmployeeStatusButton({ employee }: { employee: EmployeeRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leftOn, setLeftOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(status: "AKTIF" | "BERHENTI") {
    startTransition(async () => {
      try {
        const result = await setEmployeeStatus({ id: employee.id, status, leftOn: status === "BERHENTI" ? leftOn : null });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(status === "AKTIF" ? `${employee.name} aktif kembali.` : `${employee.name} diberhentikan.`);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Aksi gagal. Coba lagi.");
      }
    });
  }

  if (employee.status === "BERHENTI") {
    return (
      <Button type="button" size="small" variant="text" disabled={pending} onClick={() => run("AKTIF")} aria-label={`Aktifkan kembali ${employee.name}`}>
        Aktifkan kembali
      </Button>
    );
  }
  return (
    <>
      <Button type="button" size="small" variant="text" color="error" onClick={() => { setError(null); setOpen(true); }} aria-label={`Berhentikan ${employee.name}`}>
        Berhentikan
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Berhentikan {employee.name}?</DialogTitle>
        <DialogContent>
          <DateField id={`left-${employee.id}`} label="Tanggal keluar" value={leftOn} onChange={setLeftOn} fullWidth />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setOpen(false)} disabled={pending}>
            Batal
          </Button>
          <Button type="button" variant="contained" color="error" onClick={() => run("BERHENTI")} disabled={pending}>
            Berhentikan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`employee-table.tsx`:

```tsx
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { formatRupiah } from "@/lib/format";
import type { EmployeeRow } from "@/server/payroll-read";
import { EmptyState, SectionCard } from "../page-layout";
import { EmployeeDialog } from "./employee-dialog";
import { EmployeeStatusButton } from "./employee-status-button";

/** Daftar karyawan (spec karyawan 5). Tanpa NIK dan nomor rekening. */
export function EmployeeTable({
  rows,
  branches,
  staffOptions,
}: {
  rows: EmployeeRow[];
  branches: { id: string; name: string }[];
  staffOptions: { id: string; name: string; employeeId: string | null }[];
}) {
  return (
    <SectionCard title="Karyawan" description={`${rows.filter((r) => r.status === "AKTIF").length} aktif`} flush>
      {rows.length === 0 ? (
        <EmptyState>Belum ada karyawan.</EmptyState>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nama</TableCell>
                <TableCell>Jabatan</TableCell>
                <TableCell>Cabang</TableCell>
                <TableCell align="right">Gaji pokok</TableCell>
                <TableCell align="right">Tunjangan</TableCell>
                <TableCell>Staf tertaut</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
                  <TableCell>{row.position}</TableCell>
                  <TableCell>{row.branchName ?? "Umum"}</TableCell>
                  <TableCell align="right">{formatRupiah(row.baseSalary)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.allowance)}</TableCell>
                  <TableCell>{row.staffName ?? "—"}</TableCell>
                  <TableCell>{row.status === "AKTIF" ? "Aktif" : `Berhenti ${row.leftOn}`}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <EmployeeDialog branches={branches} staffOptions={staffOptions} employee={row} />
                      <EmployeeStatusButton employee={row} />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 5: Halaman**

Buat `src/app/(admin)/admin/karyawan/page.tsx`:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { EmployeeDialog } from "@/components/admin/payroll/employee-dialog";
import { EmployeeTable } from "@/components/admin/payroll/employee-table";
import { getBranches } from "@/server/catalog";
import { listEmployees, listLinkableStaff } from "@/server/payroll-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Karyawan" };

type Tab = "karyawan" | "penggajian";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCapability("payroll:manage");
  const tab: Tab = (await searchParams).tab === "penggajian" ? "penggajian" : "karyawan";
  const branches = (await getBranches()).map((b) => ({ id: b.id, name: b.name }));
  const staffOptions = await listLinkableStaff();

  return (
    <>
      <AdminHeader title="Karyawan" />
      <PageBody>
        <PageHeader
          title="Karyawan"
          description="Data karyawan, gaji bulanan, dan pembayaran komisi. Pembayaran otomatis tercatat di Pengeluaran."
          actions={tab === "karyawan" ? <EmployeeDialog branches={branches} staffOptions={staffOptions} /> : undefined}
        />
        <PageTabs
          label="Bagian karyawan"
          active={tab}
          tabs={[
            { id: "karyawan", label: "Karyawan", href: "/admin/karyawan" },
            { id: "penggajian", label: "Penggajian", href: "/admin/karyawan?tab=penggajian" },
          ]}
        />
        {tab === "karyawan" ? (
          <EmployeeTable rows={await listEmployees()} branches={branches} staffOptions={staffOptions} />
        ) : (
          <EmptyState>Belum ada penggajian.</EmptyState>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 6: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/employee-dialog.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit -p .` → Expected: PASS (uji arsitektur kini menemukan halaman `/admin/karyawan`).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/admin/karyawan/page.tsx" src/components/admin/payroll tests/unit/components/employee-dialog.test.tsx
git commit -m "feat: Karyawan page with the employee list and dialogs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tab Penggajian dan halaman bulan

**Files:**
- Modify: `src/app/(admin)/admin/karyawan/page.tsx` (tab penggajian)
- Create: `src/app/(admin)/admin/karyawan/penggajian/[bulan]/page.tsx`
- Create: `src/components/admin/payroll/payroll-month-picker.tsx`, `src/components/admin/payroll/payroll-period-actions.tsx`, `src/components/admin/payroll/payroll-item-actions.tsx`, `src/components/admin/payroll/payroll-table.tsx`
- Test: `tests/unit/components/payroll-item-actions.test.tsx`

**Interfaces:**
- Consumes: aksi Task 5–6; `listPayrollPeriods`, `getPayrollPeriod`, `PayrollItemRow`, `PeriodSummary` (Task 3); `validateAdjustment`, `validateAmounts` (Task 2); `isMonthString`, `currentMonthOf` (`src/lib/expense.ts`).
- Produces:
  - `PayrollMonthPicker({ initialMonth }: { initialMonth: string })` — `MonthField` "Bulan" + tombol "Buka" → `router.push('/admin/karyawan/penggajian/<bulan>')`.
  - `CreatePayrollButton({ month })` (tombol "Buat penggajian <bulan>"), `DeletePayrollButton({ month })` (tombol "Hapus penggajian"), `AddEmployeeToPayroll({ month, options })` (pilihan "Tambah karyawan" + tombol "Tambah").
  - `PayrollItemActions({ month, item, today }: { month: string; item: PayrollItemRow; today: string })` — tombol `Penyesuaian <nama>`, `Ubah gaji <nama>`, `Tandai dibayar <nama>`, `Keluarkan <nama>` (belum dibayar) atau `Batalkan pembayaran <nama>` (sudah dibayar).
  - `PayrollTable({ month, items, today })`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/unit/components/payroll-item-actions.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollItemActions } from "@/components/admin/payroll/payroll-item-actions";
import { addPayrollAdjustment, payPayrollItem, voidPayrollPayment } from "@/server/payroll-actions";
import type { PayrollItemRow } from "@/server/payroll-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/payroll-actions", () => ({
  addPayrollAdjustment: vi.fn(),
  removePayrollAdjustment: vi.fn(),
  updatePayrollAmounts: vi.fn(),
  payPayrollItem: vi.fn(),
  voidPayrollPayment: vi.fn(),
  removePayrollItem: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ITEM: PayrollItemRow = {
  id: "i1", employeeId: "e1", employeeName: "Rina", position: "Terapis", staffId: "t1", baseSalary: 3_000_000, allowance: 500_000, amountNote: null,
  commission: 400_000, treatments: 8, bonusTotal: 0, deductionTotal: 200_000, total: 3_700_000, paidAt: null, paidByName: null,
  adjustments: [
    { id: "a1", kind: "POTONGAN", amount: 150_000, note: "Kasbon", automatic: false },
    { id: "a2", kind: "POTONGAN", amount: 50_000, note: "Koreksi komisi TG-2026-0009 (dibatalkan)", automatic: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [addPayrollAdjustment, payPayrollItem, voidPayrollPayment]) vi.mocked(fn).mockResolvedValue({ ok: true, data: undefined });
});

describe("PayrollItemActions (spec karyawan 4–5)", { timeout: 15_000 }, () => {
  it("penyesuaian: daftar bonus/potongan, koreksi otomatis tanpa tombol hapus, tambah potongan", async () => {
    const user = userEvent.setup();
    renderAdmin(<PayrollItemActions month="2026-10" item={ITEM} today="2026-10-31" />);
    await user.click(screen.getByRole("button", { name: "Penyesuaian Rina" }));
    const dialog = screen.getByRole("dialog", { name: "Penyesuaian — Rina" });
    expect(within(dialog).getByRole("button", { name: "Hapus Kasbon" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Hapus Koreksi komisi/ })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Jenis"), "BONUS");
    await user.type(within(dialog).getByLabelText("Nominal"), "300000");
    await user.type(within(dialog).getByLabelText("Keterangan"), "Bonus target");
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(addPayrollAdjustment).toHaveBeenCalledWith({ itemId: "i1", kind: "BONUS", amount: 300_000, note: "Bonus target" }));
  });

  it("tandai dibayar menampilkan total dan memakai tanggal hari ini", async () => {
    const user = userEvent.setup();
    renderAdmin(<PayrollItemActions month="2026-10" item={ITEM} today="2026-10-31" />);
    await user.click(screen.getByRole("button", { name: "Tandai dibayar Rina" }));
    const dialog = screen.getByRole("dialog", { name: "Tandai dibayar — Rina" });
    expect(dialog).toHaveTextContent("Rp 3.700.000");
    await user.click(within(dialog).getByRole("button", { name: "Bayar" }));
    await waitFor(() => expect(payPayrollItem).toHaveBeenCalledWith({ itemId: "i1", paidOn: "2026-10-31" }));
  });

  it("baris dibayar hanya bisa dibatalkan, dengan alasan", async () => {
    const user = userEvent.setup();
    renderAdmin(<PayrollItemActions month="2026-10" item={{ ...ITEM, paidAt: "2026-10-31", paidByName: "Keuangan" }} today="2026-10-31" />);
    expect(screen.queryByRole("button", { name: "Tandai dibayar Rina" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Penyesuaian Rina" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Batalkan pembayaran Rina" }));
    const dialog = screen.getByRole("dialog", { name: "Batalkan pembayaran — Rina" });
    await user.type(within(dialog).getByLabelText("Alasan"), "Salah nominal");
    await user.click(within(dialog).getByRole("button", { name: "Batalkan pembayaran" }));
    await waitFor(() => expect(voidPayrollPayment).toHaveBeenCalledWith({ itemId: "i1", reason: "Salah nominal" }));
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/payroll-item-actions.test.tsx` → Expected: FAIL (modul tidak ada).

- [ ] **Step 3: `payroll-item-actions.tsx`**

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { formatRupiah } from "@/lib/format";
import { validateAdjustment, validateAmounts } from "@/lib/payroll";
import {
  addPayrollAdjustment,
  payPayrollItem,
  removePayrollAdjustment,
  removePayrollItem,
  updatePayrollAmounts,
  voidPayrollPayment,
} from "@/server/payroll-actions";
import type { PayrollItemRow } from "@/server/payroll-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { DateField } from "../mui/date-field";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

type Run = (action: () => Promise<ActionResult<unknown>>, done: string, onOk?: () => void) => void;

function useRun(setError: (message: string | null) => void): [Run, boolean] {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run: Run = (action, done, onOk) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(done);
        onOk?.();
        router.refresh();
      } catch {
        setError("Aksi gagal. Coba lagi.");
      }
    });
  };
  return [run, pending];
}


function ActionDialog({ text, name, open, setOpen, children, actions }: { text: string; name: string; open: boolean; setOpen: (open: boolean) => void; children: ReactNode; actions: ReactNode }) {
  return (
    <>
      <Button type="button" size="small" variant="text" onClick={() => setOpen(true)} aria-label={`${text} ${name}`}>
        {text}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{`${text} — ${name}`}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {children}
          </Stack>
        </DialogContent>
        <DialogActions>{actions}</DialogActions>
      </Dialog>
    </>
  );
}

function AdjustmentsDialog({ item }: { item: PayrollItemRow }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"BONUS" | "POTONGAN">("POTONGAN");
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);

  function add() {
    const checked = validateAdjustment({ kind, amount: amount ?? Number.NaN, note });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    run(() => addPayrollAdjustment({ itemId: item.id, ...checked.value }), "Penyesuaian ditambahkan.", () => {
      setAmount(null);
      setNote("");
    });
  }

  return (
    <ActionDialog text="Penyesuaian" name={item.employeeName} open={open} setOpen={setOpen} actions={
      <Button type="button" variant="contained" disabled={pending} onClick={add}>
        Tambah
      </Button>
    }>
      {item.adjustments.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Belum ada bonus atau potongan.
        </Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {item.adjustments.map((a) => (
            <li key={a.id}>
              <Typography variant="body2" component="span">
                {a.note}: {a.kind === "BONUS" ? "+" : "−"}
                {formatRupiah(a.amount)}
              </Typography>
              {!a.automatic && (
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => removePayrollAdjustment({ adjustmentId: a.id }), "Penyesuaian dihapus.")} aria-label={`Hapus ${a.note}`}>
                  Hapus
                </Button>
              )}
            </li>
          ))}
        </Box>
      )}
      <SelectField id={`adj-kind-${item.id}`} label="Jenis" value={kind} onChange={(v) => setKind(v as "BONUS" | "POTONGAN")}>
        <option value="POTONGAN">Potongan</option>
        <option value="BONUS">Bonus</option>
      </SelectField>
      <RupiahInput id={`adj-amount-${item.id}`} label="Nominal" value={amount} onChange={setAmount} fullWidth />
      <TextField id={`adj-note-${item.id}`} label="Keterangan" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
    </ActionDialog>
  );
}

function AmountsDialog({ item }: { item: PayrollItemRow }) {
  const [open, setOpen] = useState(false);
  const [baseSalary, setBaseSalary] = useState<number | null>(item.baseSalary);
  const [allowance, setAllowance] = useState<number | null>(item.allowance);
  const [note, setNote] = useState(item.amountNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);

  function save() {
    const input = { baseSalary: baseSalary ?? Number.NaN, allowance: allowance ?? Number.NaN, note };
    // Alasan diperiksa lengkap di server terhadap data karyawan; di sini cukup bentuk nominal.
    const checked = validateAmounts(input, { baseSalary: input.baseSalary, allowance: input.allowance });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    run(() => updatePayrollAmounts({ itemId: item.id, ...input }), "Gaji bulan ini tersimpan.", () => setOpen(false));
  }

  return (
    <ActionDialog text="Ubah gaji" name={item.employeeName} open={open} setOpen={setOpen} actions={
      <Button type="button" variant="contained" disabled={pending} onClick={save}>
        Simpan
      </Button>
    }>
      <RupiahInput id={`amt-salary-${item.id}`} label="Gaji pokok bulan ini" value={baseSalary} onChange={setBaseSalary} fullWidth />
      <RupiahInput id={`amt-allow-${item.id}`} label="Tunjangan bulan ini" value={allowance} onChange={setAllowance} fullWidth />
      <TextField id={`amt-note-${item.id}`} label="Alasan perubahan" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
    </ActionDialog>
  );
}

function PayDialog({ item, today }: { item: PayrollItemRow; today: string }) {
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);
  return (
    <ActionDialog text="Tandai dibayar" name={item.employeeName} open={open} setOpen={setOpen} actions={
      <Button type="button" variant="contained" disabled={pending} onClick={() => run(() => payPayrollItem({ itemId: item.id, paidOn }), `Gaji ${item.employeeName} dibayar.`, () => setOpen(false))}>
        Bayar
      </Button>
    }>
      <Typography variant="body2">
        Total dibayar: <strong>{formatRupiah(item.total)}</strong> (komisi {formatRupiah(item.commission)} dari {item.treatments} treatment). Pembayaran tercatat di Pengeluaran.
      </Typography>
      <DateField id={`pay-date-${item.id}`} label="Tanggal bayar" value={paidOn} onChange={setPaidOn} max={today} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
    </ActionDialog>
  );
}

function VoidDialog({ item }: { item: PayrollItemRow }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);
  return (
    <ActionDialog text="Batalkan pembayaran" name={item.employeeName} open={open} setOpen={setOpen} actions={
      <Button type="button" variant="contained" color="error" disabled={pending} onClick={() => run(() => voidPayrollPayment({ itemId: item.id, reason }), "Pembayaran dibatalkan.", () => setOpen(false))}>
        Batalkan pembayaran
      </Button>
    }>
      <Typography variant="body2">Pengeluaran gaji dan komisi ikut dibatalkan, dan komisinya kembali belum dibayar.</Typography>
      <TextField id={`void-reason-${item.id}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
    </ActionDialog>
  );
}

/** Aksi satu baris penggajian (spec karyawan 4–5). */
export function PayrollItemActions({ item, today }: { month: string; item: PayrollItemRow; today: string }) {
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);
  if (item.paidAt) return <VoidDialog item={item} />;
  return (
    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
      <AdjustmentsDialog item={item} />
      <AmountsDialog item={item} />
      <PayDialog item={item} today={today} />
      <Button type="button" size="small" color="error" disabled={pending} onClick={() => run(() => removePayrollItem({ itemId: item.id }), `${item.employeeName} dikeluarkan dari daftar.`)} aria-label={`Keluarkan ${item.employeeName}`}>
        Keluarkan
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
```

Label tombol yang tampil hanya kata aksi ("Penyesuaian", "Ubah gaji", "Tandai dibayar", "Keluarkan", "Batalkan pembayaran"); `aria-label` memuat nama karyawan.

- [ ] **Step 4: Komponen bulan dan tabel**

`payroll-month-picker.tsx`:

```tsx
"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isMonthString } from "@/lib/expense";
import { MonthField } from "../mui/date-field";

/** Buka (atau siapkan) penggajian satu bulan. */
export function PayrollMonthPicker({ initialMonth }: { initialMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
      <MonthField id="payroll-month" label="Bulan" value={month} onChange={setMonth} />
      <Button type="button" variant="contained" disabled={!isMonthString(month)} onClick={() => router.push(`/admin/karyawan/penggajian/${month}`)}>
        Buka
      </Button>
    </Stack>
  );
}
```

`payroll-period-actions.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { addPayrollItem, createPayrollPeriod, deletePayrollPeriod } from "@/server/payroll-actions";
import { SelectField } from "../mui/select-field";

function useAction(): [(action: () => Promise<ActionResult<unknown>>, done: string, then?: () => void) => void, boolean, string | null] {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>, done: string, then?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(done);
        then?.();
        router.refresh();
      } catch {
        setError("Aksi gagal. Coba lagi.");
      }
    });
  };
  return [run, pending, error];
}

export function CreatePayrollButton({ month }: { month: string }) {
  const [run, pending, error] = useAction();
  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
      <Button type="button" variant="contained" disabled={pending} onClick={() => run(() => createPayrollPeriod({ month }), `Penggajian ${month} dibuat.`)}>
        Buat penggajian {month}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function DeletePayrollButton({ month }: { month: string }) {
  const router = useRouter();
  const [run, pending, error] = useAction();
  return (
    <Stack spacing={1} sx={{ alignItems: "flex-end" }}>
      <Button type="button" variant="outlined" color="error" disabled={pending} onClick={() => run(() => deletePayrollPeriod({ month }), `Penggajian ${month} dihapus.`, () => router.push("/admin/karyawan?tab=penggajian"))}>
        Hapus penggajian
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function AddEmployeeToPayroll({ month, options }: { month: string; options: { id: string; name: string }[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [run, pending, error] = useAction();
  if (options.length === 0) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
      <SelectField id="payroll-add" label="Tambah karyawan" value={employeeId} onChange={setEmployeeId} fullWidth={false} sx={{ minWidth: 220 }}>
        <option value="">Pilih karyawan</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
      <Button type="button" variant="outlined" disabled={pending || !employeeId} onClick={() => run(() => addPayrollItem({ month, employeeId }), "Karyawan ditambahkan.", () => setEmployeeId(""))}>
        Tambah
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
```

`payroll-table.tsx`:

```tsx
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { TextLink } from "../mui/links";
import { formatRupiah } from "@/lib/format";
import type { PayrollItemRow } from "@/server/payroll-read";
import { EmptyState, SectionCard } from "../page-layout";
import { PayrollItemActions } from "./payroll-item-actions";

/** Baris penggajian satu bulan (spec karyawan 5). Komisi menaut ke rincian di laporan Komisi. */
export function PayrollTable({ month, items, today }: { month: string; items: PayrollItemRow[]; today: string }) {
  return (
    <SectionCard title={`Penggajian ${month}`} description={`${items.length} karyawan`} flush>
      {items.length === 0 ? (
        <EmptyState>Belum ada karyawan di penggajian ini.</EmptyState>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Karyawan</TableCell>
                <TableCell align="right">Gaji pokok</TableCell>
                <TableCell align="right">Tunjangan</TableCell>
                <TableCell align="right">Komisi</TableCell>
                <TableCell align="right">Bonus</TableCell>
                <TableCell align="right">Potongan</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {item.employeeName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {item.position}
                      {item.amountNote ? ` · ${item.amountNote}` : ""}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatRupiah(item.baseSalary)}</TableCell>
                  <TableCell align="right">{formatRupiah(item.allowance)}</TableCell>
                  <TableCell align="right">
                    {item.staffId ? (
                      <TextLink href={`/admin/laporan?tab=komisi&pelaksana=${item.staffId}`}>{formatRupiah(item.commission)}</TextLink>
                    ) : (
                      formatRupiah(item.commission)
                    )}
                    <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                      {item.treatments} treatment
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatRupiah(item.bonusTotal)}</TableCell>
                  <TableCell align="right">{formatRupiah(item.deductionTotal)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatRupiah(item.total)}
                  </TableCell>
                  <TableCell>{item.paidAt ? `Dibayar ${item.paidAt}` : "Belum dibayar"}</TableCell>
                  <TableCell align="right">
                    <PayrollItemActions month={month} item={item} today={today} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 5: Halaman bulan dan tab penggajian**

Buat `src/app/(admin)/admin/karyawan/penggajian/[bulan]/page.tsx`:

```tsx
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { AddEmployeeToPayroll, CreatePayrollButton, DeletePayrollButton } from "@/components/admin/payroll/payroll-period-actions";
import { PayrollTable } from "@/components/admin/payroll/payroll-table";
import { isMonthString } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { witaDateString } from "@/lib/time";
import { getPayrollPeriod } from "@/server/payroll-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Penggajian" };

export default async function PayrollMonthPage({ params }: { params: Promise<{ bulan: string }> }) {
  await requireCapability("payroll:manage");
  const { bulan } = await params;
  if (!isMonthString(bulan)) notFound();
  const detail = await getPayrollPeriod(bulan);
  const today = witaDateString(new Date());
  const trail = [{ label: "Karyawan", href: "/admin/karyawan" }, { label: "Penggajian", href: "/admin/karyawan?tab=penggajian" }, { label: bulan }];

  if (!detail) {
    return (
      <>
        <AdminHeader title="Karyawan" />
        <PageBody>
          <PageHeader title={`Penggajian ${bulan}`} trail={trail} description="Belum ada penggajian untuk bulan ini." />
          <EmptyState>
            <CreatePayrollButton month={bulan} />
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const total = detail.items.reduce((sum, i) => sum + i.total, 0);
  const paid = detail.items.filter((i) => i.paidAt).reduce((sum, i) => sum + i.total, 0);
  const commission = detail.items.reduce((sum, i) => sum + i.commission, 0);
  return (
    <>
      <AdminHeader title="Karyawan" />
      <PageBody>
        <PageHeader title={`Penggajian ${bulan}`} trail={trail} description="Komisi baris yang belum dibayar dihitung ulang setiap halaman dibuka." actions={<DeletePayrollButton month={bulan} />} />
        <SectionCard title="Ringkasan">
          <Box component="dl" sx={{ m: 0, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, "& dt": { color: "text.secondary", fontSize: "0.875rem" }, "& dd": { m: 0, fontWeight: 600 } }}>
            <div>
              <dt>Total</dt>
              <dd>{formatRupiah(total)}</dd>
            </div>
            <div>
              <dt>Komisi</dt>
              <dd>{formatRupiah(commission)}</dd>
            </div>
            <div>
              <dt>Sudah dibayar</dt>
              <dd>{formatRupiah(paid)}</dd>
            </div>
            <div>
              <dt>Belum dibayar</dt>
              <dd>{formatRupiah(total - paid)}</dd>
            </div>
          </Box>
        </SectionCard>
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <AddEmployeeToPayroll month={bulan} options={detail.addable} />
        </Stack>
        <PayrollTable month={bulan} items={detail.items} today={today} />
      </PageBody>
    </>
  );
}
```

Di `src/app/(admin)/admin/karyawan/page.tsx`, ganti `<EmptyState>Belum ada penggajian.</EmptyState>` dengan `<PayrollTab />` dan tambahkan:

```tsx
async function PayrollTab() {
  const periods = await listPayrollPeriods();
  const thisMonth = currentMonthOf(witaDateString(new Date()));
  return (
    <>
      <PayrollMonthPicker initialMonth={thisMonth} />
      <SectionCard title="Penggajian" flush>
        {periods.length === 0 ? (
          <EmptyState>Belum ada penggajian.</EmptyState>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Bulan</TableCell>
                  <TableCell align="right">Karyawan</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Dibayar</TableCell>
                  <TableCell align="right">Belum dibayar</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.month}>
                    <TableCell>
                      <TextLink href={`/admin/karyawan/penggajian/${p.month}`}>{p.month}</TextLink>
                    </TableCell>
                    <TableCell align="right">{p.employees}</TableCell>
                    <TableCell align="right">{formatRupiah(p.total)}</TableCell>
                    <TableCell align="right">{formatRupiah(p.paid)}</TableCell>
                    <TableCell align="right">{formatRupiah(p.unpaid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>
    </>
  );
}
```

dengan import tambahan: `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow` dari `@mui/material/...`; `SectionCard` dari `@/components/admin/page-layout` (gabungkan); `TextLink` dari `@/components/admin/mui/links`; `PayrollMonthPicker` dari `@/components/admin/payroll/payroll-month-picker`; `currentMonthOf` dari `@/lib/expense`; `formatRupiah` dari `@/lib/format`; `witaDateString` dari `@/lib/time`; `listPayrollPeriods` dari `@/server/payroll-read` (gabungkan).

- [ ] **Step 6: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/payroll-item-actions.test.tsx tests/unit/components/employee-dialog.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit -p .` → Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/admin/karyawan" src/components/admin/payroll tests/unit/components/payroll-item-actions.test.tsx
git commit -m "feat: payroll tab and monthly payroll page with row actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: E2E, pembersihan basis data E2E, dan rangkaian penuh

**Files:**
- Modify: `tests/e2e/prepare-db.mts`
- Create: `tests/e2e/karyawan.spec.ts`
- Test: rangkaian penuh

**Interfaces:**
- Consumes: semua task; `E2E_KEUANGAN`, `E2E_RESEPSIONIS`; `signIn`; `isiTanggal`, `tungguHidrasi`.

- [ ] **Step 1: Pembersihan E2E**

Di `tests/e2e/prepare-db.mts`, sesudah baris `await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: "E2E" } } });`, tambahkan:

```ts
// Penggajian dan karyawan uji (spec karyawan): bulan penggajian unik global, jadi dikosongkan setiap putaran.
await prisma.invoiceLine.updateMany({ where: { payrollItemId: { not: null } }, data: { payrollItemId: null } });
await prisma.payrollItem.deleteMany();
await prisma.payrollPeriod.deleteMany();
await prisma.employee.deleteMany();
```

(`PayrollAdjustment` terhapus bersama baris penggajian lewat `Cascade`.)

- [ ] **Step 2: Uji E2E**

Buat `tests/e2e/karyawan.spec.ts`:

```ts
import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { isiTanggal, tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Satu cerita per proyek (spec karyawan 7): Admin Keuangan menambah karyawan tanpa akun → penggajian bulan ini → potongan →
// tandai dibayar → Pengeluaran memuat Gaji Karyawan. Resepsionis tidak bisa membuka menu ini.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");
const stamp = Date.now().toString().slice(-6);
const month = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

test("Admin Keuangan menggaji karyawan tanpa akun dan pembayarannya masuk Pengeluaran", async ({ page }, testInfo) => {
  const name = `Satpam E2E ${tag(testInfo)} ${stamp}`;
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/karyawan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Karyawan" }).click();
  const add = page.getByRole("dialog", { name: "Tambah karyawan" });
  await add.getByLabel("Nama").fill(name);
  await add.getByLabel("Jabatan").fill("Satpam");
  await isiTanggal(add, "Tanggal masuk", `${month}-01`);
  await add.getByLabel("Gaji pokok").fill("2500000");
  await add.getByRole("button", { name: "Simpan" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("Rp 2.500.000", { timeout: 30_000 });

  await page.goto(`/admin/karyawan/penggajian/${month}`);
  await tungguHidrasi(page);
  const create = page.getByRole("button", { name: `Buat penggajian ${month}` });
  if (await create.isVisible()) {
    await create.click();
  } else {
    await page.getByLabel("Tambah karyawan").selectOption({ label: name });
    await page.getByRole("button", { name: "Tambah", exact: true }).click();
  }
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("Belum dibayar", { timeout: 30_000 });

  await row.getByRole("button", { name: `Penyesuaian ${name}` }).click();
  const adjust = page.getByRole("dialog", { name: `Penyesuaian — ${name}` });
  await adjust.getByLabel("Nominal").fill("100000");
  await adjust.getByLabel("Keterangan").fill("Kasbon E2E");
  await adjust.getByRole("button", { name: "Tambah" }).click();
  await expect(adjust).toContainText("Kasbon E2E", { timeout: 30_000 });
  await adjust.getByRole("button", { name: "Close" }).click();
  await expect(row).toContainText("Rp 2.400.000", { timeout: 30_000 });

  await row.getByRole("button", { name: `Tandai dibayar ${name}` }).click();
  const pay = page.getByRole("dialog", { name: `Tandai dibayar — ${name}` });
  await pay.getByRole("button", { name: "Bayar" }).click();
  await expect(row).toContainText(`Dibayar ${today}`, { timeout: 30_000 });

  await page.goto(`/admin/pengeluaran?bulan=${month}`);
  await expect(page.getByText(`Penggajian ${month} · ${name}`)).toBeVisible({ timeout: 30_000 });
});

test("Resepsionis tidak bisa membuka menu Karyawan", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  expect((await page.goto("/admin/karyawan"))?.status()).toBe(403);
  expect((await page.goto(`/admin/karyawan/penggajian/${month}`))?.status()).toBe(403);
});
```

Sebelum menjalankan: periksa bahwa tabel Pengeluaran menampilkan catatan apa adanya (`src/components/admin/expenses/expense-table.tsx`). Catat penyesuaian di ledger.

Bila akun E2E tidak bisa masuk (halaman masuk tetap tampil), basis data uji kehilangan tautan staf akibat `tests/integration/staff.test.ts`; hapus empat user e2e (`e2e@`, `resepsionis-e2e@`, `apoteker-e2e@`, `keuangan-e2e@sundy.test`) beserta `session` dan `account`-nya di basis data **uji**, lalu jalankan ulang.

- [ ] **Step 3: Jalankan E2E**

Run: `npx playwright test tests/e2e/karyawan.spec.ts --project=desktop --workers=1` → Expected: 2/2 PASS. Lalu `--project=mobile` → 2/2 PASS.

- [ ] **Step 4: Rangkaian penuh**

Bersihkan sisa tagihan E2E di basis data uji (perintah `psql` pembersihan tagihan yang biasa), lalu:

Run: `npx tsc --noEmit -p .`, `npx vitest run`, `npm run test:integration` (keluaran ke berkas, baca ekornya).
Expected: `tsc` bersih; unit PASS (kegagalan batas waktu di berkas yang tidak tersentuh boleh diulang sendiri); integrasi PASS kecuali 3 kegagalan lama `schedule.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/prepare-db.mts tests/e2e/karyawan.spec.ts
git commit -m "test: e2e for paying an employee into expenses and blocking receptionists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
