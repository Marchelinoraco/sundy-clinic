# Paket Lama dari Kluto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resepsionis dan Super Admin mengetik paket lama pasien dari layar Kluto: pasien, paket katalog, tanggal beli, jumlah kunjungan, dan yang sudah dipakai. Paket itu langsung bisa dipakai di tagihan, tanpa batas waktu dan tanpa pendapatan. Admin Keuangan menyaring, mengoreksi sisa, atau membatalkannya.

**Architecture:**
- `PatientPackage` mendapat asal (`TAGIHAN`/`KLUTO`). Paket `KLUTO` tidak punya baris tagihan pembelian, berharga 0, dan `expiresOn` = penanda `9999-12-31`. Dengan penanda ini semua kueri "belum kedaluwarsa" tetap berjalan tanpa diubah, dan paket lama otomatis terurut paling akhir.
- Buku sesi mendapat dua jenis entri baru: `PAKAI_KLUTO` (terpakai sebelum masuk SunDY) dan `KOREKSI_KLUTO` (koreksi sisa).
- Aturan murni ada di `src/lib/legacy-package.ts`; aksi server di `src/server/legacy-packages.ts`; dialog di `src/components/admin/package/`.

**Tech Stack:** Next.js 15 server actions, Prisma 7 + PostgreSQL (migrasi SQL manual), MUI, Vitest (unit + integrasi), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-paket-lama-kluto-design.md`

**Sebelum Task 1:** buat branch `paket-lama` dari `desain-paket-lama` (sudah berisi spec), lalu commit rencana ini (`docs: paket lama kluto plan`).

## Global Constraints

- **Tanpa batas waktu:** `NO_EXPIRY_DATE = "9999-12-31"` di `src/lib/treatment-package.ts`. Tanggal ini tidak pernah tampil di layar mana pun; tampilannya "Tanpa batas waktu" (awal kalimat) atau "tanpa batas waktu" (di tengah kalimat).
- **Hak akses:**
  - memasukkan paket lama: `invoice:manage` (Resepsionis, Super Admin);
  - membuat pasien di dialog: `booking:manage` tambahan;
  - membatalkan dan Koreksi sisa: `invoice:correct` (Admin Keuangan, Super Admin);
  - melihat: `invoice:read`.
- **Batas:** `LEGACY_NOTE_MAX = 200` · `LEGACY_BOUGHT_MIN = "2000-01-01"` · `LEGACY_PRIOR_VISITS_MAX = 1000` · alasan memakai `PACKAGE_REASON_MAX` (200).
- **Teks antarmuka (persis):**
  - tombol: "+ Paket lama (Kluto)", "Tambah paket lama lain", "Koreksi sisa", "Batalkan paket lama";
  - label paket dan tampilan: "Paket lama (Kluto)", "Tanpa batas waktu", "Dibayar di Kluto";
  - label buku sesi: "Beli (Kluto)", "Terpakai di Kluto", "Koreksi";
  - isian: "Pasien belum ada di SunDY", "Tanggal beli di Kluto", "Jumlah kunjungan di Kluto", "Sudah dipakai" (treatment), "Sudah diambil" (barang), "Kunjungan berikutnya", "Catatan (opsional)";
  - kotak centang: "Ini paket yang berbeda";
  - saringan: "Semua" / "Paket lama (Kluto)", lewat query `?asal=kluto`.
- **Pesan galat (persis):**
  - "Pilih pasien."
  - "Pilih paket."
  - "Isi tanggal beli di Kluto."
  - "Tanggal beli tidak sah."
  - "Tanggal beli tidak boleh di masa depan."
  - "Jumlah kunjungan di Kluto 0–1000."
  - "Sudah dipakai {nama} 0–{jatah}."
  - "Semua sesi paket ini sudah terpakai di Kluto, jadi tidak perlu dimasukkan."
  - "Kunjungan berikutnya tidak boleh sebelum hari ini."
  - "Catatan paling banyak 200 karakter."
  - "Isi paket ini berubah. Muat ulang halaman lalu coba lagi."
  - "Pasien ini sudah punya paket lama {nama paket}. Centang “Ini paket yang berbeda” bila memang dibeli dua kali."
  - "Isi alasan pembatalan."
  - "Isi alasan koreksi."
  - "Alasan paling banyak 200 karakter."
  - "Sesi paket ini sudah dipakai di tagihan {nomor}. Pakai Koreksi sisa."
  - "Hanya paket lama (Kluto) yang bisa diubah di sini."
  - "Paket ini sudah dibatalkan."
  - "Sisa {nama} 0–{batas}."
  - "Tidak ada sisa yang berubah."
  - Data rusak memakai `INVALID_FORM` yang ada: "Data tidak sah. Muat ulang halaman lalu coba lagi."
  - Galat pasien memakai pesan `validatePatientRegistration` yang ada.
- **Audit:**
  - `patient-package.legacy-create`: summary `"{RM} · {nama paket} · beli {tanggal} · sisa {isi}"`;
  - `patient-package.legacy-cancel`: summary `"{nama paket}: {alasan}"`;
  - `patient-package.legacy-correct`: summary `"{nama paket}: {isi} {lama}→{baru}, … ({alasan})"`;
  - pasien baru: `patient.create` dengan summary yang sama seperti `createPatient`.
- **Rilis hanya maju** setelah ada paket lama di produksi (Task 8 menulis catatannya di runbook).

## Review Focus

1. **WA pasien baru sudah dipakai pasien lain**, misalnya pasien yang dulu booking lewat situs tanpa NIK. Dialog harus memperingatkan dan menawarkan "Pakai pasien ini", seperti dialog *Pasien baru*, bukan diam-diam membuat pasien kedua. Diuji di Task 8 (E2E).
2. **Jumlah kunjungan melebihi isi paket.** Angka per isi dibatasi jatah. Bila semua isi mencapai jatah, simpan ditolak dengan pesan "Semua sesi … tidak perlu dimasukkan." Diuji di Task 2.
3. **Katalog diubah Admin Keuangan selama dialog terbuka**, sehingga id isi berganti. Server menolak dengan "Isi paket ini berubah. …" dan tidak menebak. Diuji di Task 3.
4. **Pemakaian pertama di SunDY untuk paket lama berencana kosong.** Rencana menjadi tanggal final + jarak, sehingga pasien masuk Pengingat sesudahnya. Diuji di Task 4.
5. **Koreksi sisa turun di bawah jumlah yang ditandai draf tagihan.** Koreksi diterima; finalisasi draf itu ditolak dengan pesan "… tinggal n" yang sudah ada. Diuji di Task 5.

---

### Task 1: Skema, migrasi, dan tipe yang ikut longgar

**Files:**
- Modify: `prisma/schema.prisma` (enum `PackageEntryKind`, model `PatientPackage`, model `InvoiceLine` relasi `PackagePurchase`)
- Create: `prisma/migrations/20261111090000_paket_lama_enum/migration.sql`
- Create: `prisma/migrations/20261111090100_paket_lama/migration.sql`
- Modify: `src/server/patient-package-read.ts` (`PatientPackageSummary.purchaseInvoice` nullable)
- Modify: `src/app/(admin)/admin/paket/[id]/page.tsx:40` (baca `purchaseInvoice?.number`)
- Modify: `tests/integration/invoice-world.ts` (`cleanupBillingWorld`), `tests/e2e/prepare-db.mts` (sudah `deleteMany()` semua; cukup dicek)
- Test: `tests/integration/paket-lama-schema.test.ts`

**Interfaces:**
- Produces:
  - enum `PatientPackageSource { TAGIHAN KLUTO }`;
  - `PackageEntryKind` + `PAKAI_KLUTO`, `KOREKSI_KLUTO`;
  - `PatientPackage.source` (bawaan `TAGIHAN`), `note String?`, `priorVisits Int @default(0)`, `purchaseLineId String? @unique`, `purchaseLine InvoiceLine?`;
  - `PatientPackageSummary.purchaseInvoice: { id: string; number: string | null } | null`.

- [ ] **Step 1: Tulis uji skema yang gagal** di `tests/integration/paket-lama-schema.test.ts`. Pakai pola `paket-schema.test.ts` (dunia `createBillingWorld`, SLUG `skema-paket-lama`, WA `6281200009701`). Kasus:
  - `KLUTO` sah: `purchaseLineId` null, `price` 0, `expiresOn` 9999-12-31, `priorVisits` 3, `note` "Nota 123" → tersimpan;
  - `KLUTO` dengan `purchaseLineId` → `rejects.toThrow(/patient_package_source/)`;
  - `KLUTO` dengan `price` 100 → sama;
  - `KLUTO` dengan `expiresOn` 2027-01-01 → sama;
  - `TAGIHAN` tanpa `purchaseLineId` → sama;
  - `TAGIHAN` dengan `priorVisits` 1 → sama;
  - `note` 201 karakter → `/patient_package_note/`;
  - `priorVisits` 1001 → `/patient_package_prior_visits/`;
  - entri `PAKAI_KLUTO` delta 0 → `/package_entry_delta/`; delta −2 → lolos;
  - entri `KOREKSI_KLUTO` delta 0 → ditolak; delta +1 tanpa `reason` → ditolak; delta −1 dengan `reason` "salah ketik" → lolos.
- [ ] **Step 2: Jalankan** `npx vitest run --config vitest.integration.config.mts tests/integration/paket-lama-schema.test.ts`. Diharapkan: FAIL (kolom `source` tidak dikenal).
- [ ] **Step 3: Tulis skema dan migrasi.**
  - Migrasi enum, berkas sendiri karena nilai baru tidak boleh dipakai di transaksi yang menambahkannya:
    ```sql
    CREATE TYPE "PatientPackageSource" AS ENUM ('TAGIHAN', 'KLUTO');
    ALTER TYPE "PackageEntryKind" ADD VALUE 'PAKAI_KLUTO';
    ALTER TYPE "PackageEntryKind" ADD VALUE 'KOREKSI_KLUTO';
    ```
  - Migrasi kedua:
    - `ADD COLUMN "source" … NOT NULL DEFAULT 'TAGIHAN'`, `"note" TEXT`, `"priorVisits" INTEGER NOT NULL DEFAULT 0`;
    - `ALTER COLUMN "purchaseLineId" DROP NOT NULL`;
    - CHECK `patient_package_source`: `("source" = 'TAGIHAN' AND "purchaseLineId" IS NOT NULL AND "note" IS NULL AND "priorVisits" = 0) OR ("source" = 'KLUTO' AND "purchaseLineId" IS NULL AND "price" = 0 AND "expiresOn" = DATE '9999-12-31')`;
    - CHECK `patient_package_note` (≤ 200);
    - CHECK `patient_package_prior_visits` (0..1000);
    - `DROP CONSTRAINT "package_entry_delta"`, lalu buat ulang dengan semua cabang lama ditambah `("kind" = 'PAKAI_KLUTO' AND "delta" < 0)` dan `("kind" = 'KOREKSI_KLUTO' AND "delta" <> 0 AND "reason" IS NOT NULL AND "reason" <> '')`.
  - Jalankan `npx prisma migrate dev` ke DB lokal, lalu `npx prisma generate`.
- [ ] **Step 4: Longgarkan tipe yang ikut patah.**
  - `npx tsc --noEmit` akan menunjuk tempat yang membaca `purchaseLine` sebagai wajib (`patient-package-read.ts` `summarize`, halaman detail paket). Ubah seperlunya: `purchaseInvoice: row.purchaseLine?.invoice ?? null`, dan di halaman detail `pkg.purchaseInvoice?.number ?? "draf"` (tampilan Kluto yang sebenarnya dibuat di Task 7).
  - `cleanupBillingWorld`: sebelum menghapus paket per cabang, hapus buku sesi dan paket milik pasien dunia uji: `item: { patientPackage: { patient: { whatsapp: { in: patientWhatsapps } } } }` dan `patientPackage.deleteMany({ where: { patient: { whatsapp: { in: patientWhatsapps } } } })`.
- [ ] **Step 5: Jalankan** uji skema yang sama, `npx tsc --noEmit`, dan `npx vitest run --config vitest.integration.config.mts tests/integration/paket-schema.test.ts tests/integration/patient-packages.test.ts`. Diharapkan: semua PASS.
- [ ] **Step 6: Commit** `feat: schema for old Kluto packages`.

### Task 2: Aturan murni paket lama

**Files:**
- Create: `src/lib/legacy-package.ts`
- Modify: `src/lib/treatment-package.ts` (`NO_EXPIRY_DATE`, `isNoExpiry`, `validityLabel`, label entri, `packageTargetLabel`, `packageOptionsSummary`)
- Modify: `src/lib/patient-registration.ts` (`validateLegacyPatient`, `nikTakenMessage`)
- Modify: `src/server/patient.ts` (pakai `nikTakenMessage` dari lib, hapus salinan lokal)
- Test: `tests/unit/legacy-package.test.ts`, `tests/unit/patient-registration.test.ts` (tambah blok), `tests/unit/treatment-package.test.ts` (tambah blok; buat bila belum ada)

**Interfaces:**
- Produces (`src/lib/treatment-package.ts`):
  - `NO_EXPIRY_DATE = "9999-12-31"`;
  - `isNoExpiry(expiresOn: string): boolean`;
  - `validityLabel(expiresOn: string): string` → `"tanpa batas waktu"` atau `"berlaku s.d. {dateLabel}"`;
  - `PackageEntryKindValue` + `"PAKAI_KLUTO" | "KOREKSI_KLUTO"` dengan label "Terpakai di Kluto" dan "Koreksi";
  - `PackageOption` + `legacy: boolean`. `packageTargetLabel` untuk opsi `legacy` berbunyi "{paket} (paket lama Kluto) · sisa {n} · tanpa batas waktu" (spec bagian 5, editor tagihan).
- Produces (`src/lib/legacy-package.ts`):
  - `type LegacyCatalogItem = { id: string; name: string; unit: string | null; sessions: number; perVisit: number | null }`;
  - `type LegacyCatalogPackage = { id: string; name: string; isActive: boolean; visitIntervalDays: number; items: LegacyCatalogItem[] }`;
  - `usedFromVisits(items: readonly Pick<LegacyCatalogItem, "sessions" | "perVisit">[], visits: number): number[]`;
  - `type LegacyPackageForm = { packageId: string; boughtOn: string; priorVisits: number; used: Record<string, number>; nextVisitOn: string | null; note: string; confirmDuplicate: boolean }`;
  - `type ValidLegacyPackage = { boughtOn: string; priorVisits: number; used: { itemId: string; used: number }[]; nextVisitOn: string | null; note: string | null }`;
  - `validateLegacyPackage(raw: unknown, ctx: { today: string; items: readonly Pick<LegacyCatalogItem, "id" | "name" | "sessions">[] }): Validation<ValidLegacyPackage>`;
  - `defaultNextVisit(today: string, intervalDays: number): string`;
  - `validateReason(raw: unknown, emptyMessage: string): Validation<string>`;
  - `validateRemainingCorrection(raw: unknown, ctx: { items: readonly { id: string; name: string; remaining: number; max: number }[] }): Validation<{ reason: string; changes: { itemId: string; name: string; from: number; to: number }[] }>`.
- Produces (`src/lib/patient-registration.ts`):
  - `type LegacyPatientInput = { nik: string; name: string; whatsapp: string; birthDate: string; gender: string | null; address: string; email: string; emergencyContactName: string; emergencyContactPhone: string }`;
  - `type ValidLegacyPatient = { nik: string | null; name: string; whatsapp: string; birthDate: Date | null; gender: "L" | "P" | null; address: string | null; email: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null }`;
  - `validateLegacyPatient(input: Record<string, unknown>, today: string): { ok: true; value: ValidLegacyPatient } | { ok: false; errors: Partial<Record<keyof LegacyPatientInput, string>> }`;
  - `nikTakenMessage(owner: { name: string; medicalRecordNumber: string }): string`.

- [ ] **Step 1: Tulis uji unit yang gagal.**
  - `usedFromVisits`, dengan isi `[{ sessions: 4, perVisit: null }, { sessions: 28, perVisit: 7 }]`:
    - 3 kunjungan → `[3, 21]`;
    - 10 kunjungan → `[4, 28]` (dibatasi jatah);
    - 0 → `[0, 0]`;
    - barang ber-`perVisit` null dihitung 1 per kunjungan.
  - `validateLegacyPackage` dengan `today = "2026-11-11"` dan isi `[{ id: "a", name: "Facial", sessions: 4 }]`:
    - lolos dengan `used: { a: 3 }`, `note: " Nota 9 "` → `note: "Nota 9"`, `nextVisitOn: null` boleh;
    - setiap pesan Global Constraints untuk tanggal beli kosong, rusak (`"2026-02-30"`), sebelum `LEGACY_BOUGHT_MIN`, dan setelah `today`;
    - `priorVisits` −1 dan 1001;
    - `used.a` 5 → "Sudah dipakai Facial 0–4.";
    - `used` tanpa kunci `a`, atau dengan kunci asing → `INVALID_FORM`;
    - `used.a` 4 → "Semua sesi paket ini sudah terpakai di Kluto, jadi tidak perlu dimasukkan." (Review Focus 2);
    - `nextVisitOn` "2026-11-10" → pesan kunjungan;
    - catatan 201 karakter.
  - `validateRemainingCorrection`, dengan isi `[{ id: "a", name: "Facial", remaining: 2, max: 3 }]`:
    - `{ reason: "salah ketik", remaining: { a: 3 } }` → `changes: [{ itemId: "a", name: "Facial", from: 2, to: 3 }]`;
    - `remaining.a` 4 → "Sisa Facial 0–3.";
    - semua sama → "Tidak ada sisa yang berubah.";
    - alasan kosong → "Isi alasan koreksi."
  - `validityLabel(NO_EXPIRY_DATE)` → `"tanpa batas waktu"`;
  - `packageTargetLabel` untuk opsi `legacy` ber-`NO_EXPIRY_DATE` memuat "paket lama Kluto" dan "tanpa batas waktu", dan tidak memuat "9999";
  - `packageOptionsSummary` juga tidak memuat "9999".
  - `validateLegacyPatient`:
    - lolos hanya dengan nama + WA `"081234567890"` → `whatsapp: "6281234567890"` dan isian lain null;
    - NIK salah bentuk → `NIK_FORMAT_ERROR`;
    - kontak darurat hanya nama → galat di `emergencyContactPhone`;
    - tanggal lahir di masa depan → pesan yang ada.
- [ ] **Step 2: Jalankan** `npx vitest run tests/unit/legacy-package.test.ts tests/unit/patient-registration.test.ts tests/unit/treatment-package.test.ts`. Diharapkan: FAIL (modul tidak ada).
- [ ] **Step 3: Tulis kodenya.**
  - `validateLegacyPatient` memakai ulang `normalizeNik`, `normalizeWhatsapp`, `NAME_MAX`, `ADDRESS_MAX`, `EMAIL_MAX`, `BIRTH_DATE_MIN`, dan pesan yang sama dengan `validatePatientRegistration`. Bedanya hanya: semua isian selain nama dan WA boleh kosong, dan NIK kosong tidak butuh alasan.
  - `nikTakenMessage` dipindah dari `src/server/patient.ts`, teksnya tidak berubah.
  - `packageTargetLabel` dan `packageOptionsSummary` memakai `validityLabel`.
- [ ] **Step 4: Jalankan** uji yang sama dan `npx vitest run tests/unit/patient-registration.test.ts`. Diharapkan: PASS.
- [ ] **Step 5: Commit** `feat: rules for entering old Kluto packages`.

### Task 3: Memasukkan paket lama (server)

**Files:**
- Create: `src/server/legacy-package-read.ts` (tanpa `"use server"`; dibaca halaman)
- Create: `src/server/legacy-packages.ts` (`"use server"`)
- Modify: `src/server/package-store.ts` (ekstrak `catalogItemsData` dari `activatePurchasedPackages`)
- Test: `tests/integration/legacy-package-create.test.ts`

**Interfaces:**
- Consumes: Task 2 (`validateLegacyPackage`, `validateLegacyPatient`, `nikTakenMessage`, `NO_EXPIRY_DATE`, `LegacyCatalogPackage`), dan `insertPatient` dari `src/server/patient-store.ts`.
- Produces:
  - `listLegacyCatalog(): Promise<LegacyCatalogPackage[]>`: `invoice:manage`, semua paket katalog, yang aktif dulu lalu `sortOrder`, dengan isi menurut `sortOrder`;
  - `type LegacyDuplicate = { patientPackageId: string; enteredOn: string; staffName: string; remainingLabel: string }`;
  - `findLegacyDuplicates(input: { patientId: string; packageId: string }): Promise<ActionResult<LegacyDuplicate[]>>`: paket `KLUTO` berstatus `AKTIF` dengan `packageId` sama. `enteredOn` dan `staffName` diambil dari entri `BELI`;
  - `type CreateLegacyPackageInput = { patient: { id: string } | { new: LegacyPatientInput }; form: LegacyPackageForm }`;
  - `createLegacyPackage(input: CreateLegacyPackageInput): Promise<ActionResult<{ patientPackageId: string; patientId: string; summary: string }>>`;
  - `catalogItemsData(items: CatalogItemRow[]): Prisma.PatientPackageItemCreateWithoutPatientPackageInput[]` di `package-store.ts`, dipakai bersama `activatePurchasedPackages`. `CatalogItemRow` = bentuk `select` isi katalog yang sekarang dipakai `activatePurchasedPackages` (`serviceId`, `itemId`, `sessions`, `perVisit`, `service.name`, `item.name`, `item.unit`), diberi `id` untuk pencocokan di Task 3.

- [ ] **Step 1: Tulis uji integrasi yang gagal.** Mock sesi seperti `patient-packages.test.ts`; dunia `createBillingWorld("paket-lama", "6281200009702")`; katalog `catalogPackage(world, { name: "Lux", items: [{ serviceId: world.treatmentId, sessions: 4 }] })` ditambah satu isi barang bila `package-world` mendukungnya (bila tidak, tambahkan parameter `goods` ke `catalogPackage`). Kasus:
  - Resepsionis memasukkan paket untuk pasien yang ada dengan `boughtOn` 2025-03-01, `priorVisits` 3, `used` 3, `nextVisitOn` null. Hasil:
    - `source` KLUTO, `price` 0, `expiresOn` 9999-12-31, `purchaseLineId` null, `priorVisits` 3;
    - buku: BELI +4 dan PAKAI_KLUTO −3 dengan `staffName` "Staf Paket";
    - `listPatientPackages` memberi `remaining` 1 dan state AKTIF;
    - `listPackageOptions` memuat isinya;
    - audit `patient-package.legacy-create` ada.
  - Dengan `patient: { new: { name: "Ani Kluto", whatsapp: "081200009703", … kosong } }`, pasien dibuat dengan `medicalRecordNumber` baru, `nik` null, `nikMissingReason` null, dan audit `patient.create`.
  - Dengan NIK baru yang sudah dimiliki pasien dunia uji: galat = `nikTakenMessage(...)`. Tidak ada pasien dan paket baru (hitung sebelum/sesudah).
  - Admin Keuangan: `forbidden: invoice:manage`.
  - `used` = jatah semua → pesan "Semua sesi …", tanpa baris baru.
  - Paket kedua dengan `packageId` sama:
    - tanpa `confirmDuplicate` → pesan duplikat persis;
    - `findLegacyDuplicates` mengembalikan satu baris;
    - dengan `confirmDuplicate: true` → tersimpan.
  - **Review Focus 3:** isi katalog dihapus lalu dibuat ulang sesudah id diambil, kemudian simpan dengan id lama → "Isi paket ini berubah. Muat ulang halaman lalu coba lagi."
  - Paket katalog nonaktif boleh dipakai; `listLegacyCatalog` memuatnya sesudah yang aktif.
  - Laporan pendapatan periode hari ini tidak berubah (bandingkan `revenue` dari fungsi laporan yang dipakai `report-package.test.ts` sebelum dan sesudah).
- [ ] **Step 2: Jalankan** `npx vitest run --config vitest.integration.config.mts tests/integration/legacy-package-create.test.ts`. Diharapkan: FAIL (modul tidak ada).
- [ ] **Step 3: Tulis `createLegacyPackage`.** Urutannya:
  1. `requireCapability("invoice:manage")`, ditambah `can(role, "booking:manage")` bila pasien baru.
  2. Validasi pasien baru dengan `validateLegacyPatient`. Galat pertama dilaporkan menurut urutan isian.
  3. Cek NIK di luar transaksi.
  4. Transaksi:
     - `insertPatient` atau ambil pasien (`mergedIntoId: null`, bila tidak ada → "Pilih pasien.");
     - ambil paket katalog beserta isinya;
     - id isi di `form.used` harus sama persis dengan isi katalog, kalau tidak → "Isi paket ini berubah. …";
     - `validateLegacyPackage`;
     - cek duplikat;
     - buat paket dengan `catalogItemsData`, lalu entri `createMany`.
  5. Unique violation NIK → `nikTakenMessage`, seperti `createPatient`.
  6. Audit.
  7. `safeRevalidatePath("/admin/paket")` dan `safeRevalidatePath("/admin/pasien/{id}")`.

  `summary` = "Paket {nama} untuk {pasien} ({RM}): sisa {packageContentsLabel(isi dengan sessions = sisa)}". Isi yang sisanya 0 tidak ditulis.
- [ ] **Step 4: Jalankan** uji Task ini, ditambah `tests/integration/package-purchase.test.ts` dan `tests/integration/package-goods.test.ts` (regresi `catalogItemsData`). Diharapkan: PASS.
- [ ] **Step 5: Commit** `feat: enter old Kluto packages`.

### Task 4: Paket lama di bacaan, rencana kunjungan, dan Pengingat

**Files:**
- Modify: `src/server/patient-package-read.ts`:
  - `SUMMARY_SELECT`, `PatientPackageSummary`, `PatientPackageDetail`;
  - `searchPatientPackages`, `listPackageVisitPlans`, `getPatientPackage`, `packageDoneVisits`.
- Modify: `src/server/reminder.ts:150-175` (nomor kunjungan)
- Modify: `src/server/package-store.ts` (`recomputeNextVisit` untuk `KLUTO`)
- Modify: `src/server/patient-packages.ts` (`changeNextVisit` menerima rencana kosong)
- Modify: `src/server/invoice-a4-store.ts:66-70` (`used` memuat `PAKAI_KLUTO` dan `KOREKSI_KLUTO`)
- Test: `tests/integration/legacy-package-use.test.ts`

**Interfaces:**
- Consumes: `createLegacyPackage` (Task 3).
- Produces:
  - `PatientPackageSummary` + `source: "TAGIHAN" | "KLUTO"`, `note: string | null`, dan `items[].id`;
  - `listPackageOptions` mengisi `legacy` dari `source`. Opsi `purchasedHere` selalu `legacy: false`;
  - `PatientPackageDetail` + `priorVisits: number` dan `items[].usedHere: number`. `usedHere` = −Σ delta `PAKAI` + `BATAL_PAKAI` per isi, yaitu pemakaian bersih di SunDY;
  - `searchPatientPackages(q?: string, opts?: { source?: "KLUTO" }): Promise<PatientPackageSummary[]>`.

- [ ] **Step 1: Tulis uji integrasi yang gagal.** Siapkan paket lama Lux (jatah 4, `priorVisits` 3, `used` 3, rencana kosong). Kasus:
  - `searchPatientPackages("", { source: "KLUTO" })` hanya memuat paket lama; tanpa opsi memuat keduanya.
  - `listPackageOptions(patientId)` memuat isi paket lama dengan `legacy: true`, di urutan sesudah paket berbatas waktu; paket biasa ber-`legacy: false`.
  - Sesinya dipakai di tagihan kunjungan dengan `applyPackageSession`, lalu `finalizeInvoice`:
    - sisa 0, state HABIS;
    - `packageSessionsUsed` hari ini bertambah 1;
    - `visitsDoneByPackage` = 1 (PAKAI_KLUTO tidak dihitung).
  - **Review Focus 4:** paket lama kedua (jatah 4, `used` 1, rencana kosong) setelah satu pemakaian final mendapat `nextVisitOn` = hari ini + `visitIntervalDays`.
  - `getPatientPackage` paket itu:
    - `doneVisits[0].number` = `priorVisits` + 1;
    - `plan[0].number` = `priorVisits` + 2;
    - `items[0].usedHere` = 1.
  - Tagihan pemakaian tadi dibatalkan → `nextVisitOn` kembali null, bukan `startsOn` + jarak.
  - `changeNextVisit` pada paket lama aktif berencana kosong dengan tanggal besok → tersimpan. Tanggal 2030-01-01 juga diterima, karena tidak ada batas atas.
  - Pengingat: paket lama dengan `nextVisitOn` = hari ini muncul di `loadReminderWork` (atau fungsi publik yang dipakai `package-reminder.test.ts`). `visitNumber` = `priorVisits` + 1, dan pesannya memuat "kunjungan ke-{priorVisits + 1}". Paket lama berencana kosong tidak muncul.
  - Invoice A4 tagihan pemakaian: paket itu tampil dengan `expiresOn` NO_EXPIRY_DATE, dan `used` + `remaining` = jatah.
- [ ] **Step 2: Jalankan** `npx vitest run --config vitest.integration.config.mts tests/integration/legacy-package-use.test.ts`. Diharapkan: FAIL.
- [ ] **Step 3: Tulis perubahannya.**
  - Penomoran kunjungan selalu `priorVisits + visitsDone`.
  - `recomputeNextVisit`: bila tidak ada pemakaian final tersisa dan `source` KLUTO → `nextVisitOn: null`.
  - `changeNextVisit` menerima `nextVisitOn` kosong bila paket `AKTIF` dan sisa total > 0. Summary audit memakai "—" untuk tanggal lama yang kosong.
- [ ] **Step 4: Jalankan** uji Task ini, ditambah `package-visit.test.ts`, `package-visit-apply.test.ts`, `package-reminder.test.ts`, `invoice-a4.test.ts`, dan `patient-packages.test.ts` di konfigurasi integrasi. Diharapkan: PASS.
- [ ] **Step 5: Commit** `feat: old Kluto packages in plans, reminders and invoices`.

### Task 5: Batalkan paket lama dan Koreksi sisa (server)

**Files:**
- Modify: `src/server/legacy-packages.ts`
- Test: `tests/integration/legacy-package-correct.test.ts`

**Interfaces:**
- Consumes: Task 2 (`validateReason`, `validateRemainingCorrection`), Task 3 (`createLegacyPackage`), dan `lockPatientPackages`/`remainingByItem` dari `package-store.ts`.
- Produces:
  - `cancelLegacyPackage(input: { packageId: string; reason: string }): Promise<ActionResult<void>>`;
  - `correctLegacyRemaining(input: { packageId: string; reason: string; remaining: Record<string, number> }): Promise<ActionResult<void>>`. Kunci `remaining` = `PatientPackageItem.id`; batas per isi = `sessions − usedHere`.

- [ ] **Step 1: Tulis uji integrasi yang gagal.**
  - Resepsionis → `forbidden: invoice:correct` untuk kedua aksi.
  - Batalkan paket lama yang belum dipakai:
    - status DIBATALKAN, `nextVisitOn` null;
    - entri BATAL_PAKET −sisa dengan `reason`;
    - audit `patient-package.legacy-cancel`.
  - Batalkan paket lama yang sesinya dipakai di tagihan final → "Sesi paket ini sudah dipakai di tagihan {nomor}. Pakai Koreksi sisa." Setelah tagihan itu dibatalkan, pembatalan paket diterima.
  - Batalkan atau koreksi paket `TAGIHAN` → "Hanya paket lama (Kluto) yang bisa diubah di sini."
  - Koreksi sisa:
    - naik 1 → 2: entri KOREKSI_KLUTO +1;
    - turun: entri −1;
    - sesudah satu pemakaian SunDY, batasnya `sessions − 1`; angka di atasnya → "Sisa {nama} 0–{batas}.";
    - semua sisa → 0 membuat `nextVisitOn` null.
  - **Review Focus 5:**
    - draf tagihan menandai 2 sesi;
    - koreksi menurunkan sisa ke 1 → diterima;
    - `finalizeInvoice` draf itu → galat memuat "tinggal 1".
  - Koreksi atau batalkan paket yang sudah dibatalkan → "Paket ini sudah dibatalkan."
- [ ] **Step 2: Jalankan** uji ini. Diharapkan: FAIL.
- [ ] **Step 3: Tulis kedua aksi.**
  - Keduanya berjalan di transaksi dengan `lockPatientPackages`.
  - Pembatalan memeriksa PAKAI di tagihan FINAL, sama seperti `cancelPurchasedPackages`.
  - Koreksi menulis satu entri per isi yang berubah, lalu memanggil logika rencana yang ada: kosong bila habis.
  - Keduanya mencatat audit dan me-revalidate `/admin/paket` dan `/admin/paket/{id}`.
- [ ] **Step 4: Jalankan** uji ini. Diharapkan: PASS.
- [ ] **Step 5: Commit** `feat: cancel and correct old Kluto packages`.

### Task 6: Dialog "Paket lama (Kluto)" dan daftar paket

**Files:**
- Create: `src/components/admin/package/legacy-package-dialog.tsx`
- Create: `src/components/admin/package/legacy-patient-fields.tsx`
- Modify: `src/components/admin/patient-picker.tsx` (prop `allowNew?: boolean`, bawaan `true`)
- Modify: `src/app/(admin)/admin/paket/page.tsx` (tombol, saringan `asal`, `listLegacyCatalog`)
- Modify: `src/components/admin/package/patient-package-table.tsx` (label + kolom berlaku)
- Test: `tests/unit/components/legacy-package-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`usedFromVisits`, `validateLegacyPackage`, `defaultNextVisit`, `validateLegacyPatient`), Task 3 (`createLegacyPackage`, `findLegacyDuplicates`, `listLegacyCatalog`), Task 4 (`searchPatientPackages(q, { source })`, `PatientPackageSummary.source`).
- Produces:
  - `LegacyPackageDialog({ catalog, today }: { catalog: LegacyCatalogPackage[]; today: string })`;
  - `LegacyPatientFields({ value, onChange, errors, onPickExisting })`. Isinya nama, WA, NIK (`NikInput` mode NIK saja + `NikCheckPanel`), tanggal lahir (`DateField`), jenis kelamin, alamat, email, dan kontak darurat. Peringatan WA ganda memakai `findPatientsByWhatsapp` saat WA kehilangan fokus, dengan tombol "Pakai pasien ini", seperti `NewPatientForm`.

- [ ] **Step 1: Tulis uji komponen yang gagal.** Ikuti pola `tests/unit/components/`. Mock `@/server/legacy-packages` dan `@/server/patient`. Katalog Lux = Facial 4 sesi + kapsul 28 per 7.
  - Isi "Jumlah kunjungan di Kluto" = 3 → "Sudah dipakai" Facial = 3, "Sudah diambil" kapsul = 21, dan "Sisa 1" / "Sisa 7" tampil.
  - Ubah kapsul jadi 20 lalu kunjungan jadi 2 → Facial = 2, kapsul tetap 20 (angka ubahan tangan tidak ditimpa).
  - "Kunjungan berikutnya" awalnya hari ini + jarak katalog, dan bisa dikosongkan.
  - `findLegacyDuplicates` mengembalikan satu baris → peringatan tampil, dan Simpan terkunci sampai "Ini paket yang berbeda" dicentang.
  - Simpan memanggil `createLegacyPackage` dengan `{ patient: { id }, form: { … used: { [itemId]: n } } }`. Setelah berhasil, ringkasan dan tombol "Tambah paket lama lain" tampil; tombol itu mengosongkan isian.
- [ ] **Step 2: Jalankan** `npx vitest run tests/unit/components/legacy-package-dialog.test.tsx`. Diharapkan: FAIL.
- [ ] **Step 3: Tulis komponennya.**
  - Langkah pasien: `PatientPicker allowNew={false}` atau sakelar "Pasien belum ada di SunDY" yang membuka `LegacyPatientFields`.
  - Pilihan paket: yang nonaktif berakhiran " · tidak dijual lagi".
  - Validasi di browser memakai fungsi lib yang sama dengan server; galat server tampil sebagai `Alert`.
  - Halaman paket:
    - tombol tampil bila `can(role, "invoice:manage")`, dan `listLegacyCatalog()` hanya dimuat saat itu;
    - saringan berupa dua tautan atau chip yang mempertahankan `cari`; form cari membawa `asal` sebagai input tersembunyi.
  - Tabel:
    - baris `KLUTO` memakai keterangan "Paket lama (Kluto)" di bawah nama paket;
    - kolom berlaku memakai `isNoExpiry(...) ? "Tanpa batas waktu" : dateLabel(...)`.
- [ ] **Step 4: Jalankan** uji komponen ini, `npx vitest run tests/unit/components`, dan `npx tsc --noEmit`. Diharapkan: PASS.
- [ ] **Step 5: Commit** `feat: old Kluto package dialog and filter`.

### Task 7: Halaman detail paket lama, dialog koreksi/batal, dan cetakan

**Files:**
- Modify: `src/app/(admin)/admin/paket/[id]/page.tsx`
- Create: `src/components/admin/package/correct-legacy-dialog.tsx`, `src/components/admin/package/cancel-legacy-dialog.tsx`
- Modify: `src/components/admin/package/change-visit-dialog.tsx` (`nextVisitOn: string | null`; kosong → isian awal = hari ini)
- Modify: `src/components/receipt/invoice-a4-paper.tsx:114` (`validityLabel`)
- Test: `tests/unit/components/legacy-package-detail.test.tsx`

**Interfaces:**
- Consumes:
  - Task 4 (`PatientPackageDetail.source`, `note`, `priorVisits`, `items[].id`, `items[].usedHere`);
  - Task 5 (`cancelLegacyPackage`, `correctLegacyRemaining`);
  - Task 2 (`validityLabel`, `isNoExpiry`, `validateRemainingCorrection`, `validateReason`).

- [ ] **Step 1: Tulis uji komponen yang gagal.**
  - `CorrectLegacyDialog` dengan isi `{ id, name: "Facial", remaining: 2, sessions: 4, usedHere: 1 }`: isian "Sisa yang benar" berbatas 3; mengirim `{ packageId, reason, remaining: { id: 3 } }`.
  - `CancelLegacyDialog` menolak kirim tanpa alasan dengan "Isi alasan pembatalan."
  - `InvoiceA4Paper` dengan paket ber-`expiresOn` NO_EXPIRY_DATE menampilkan "tanpa batas waktu" dan tidak memuat "9999".
- [ ] **Step 2: Jalankan** uji itu. Diharapkan: FAIL.
- [ ] **Step 3: Tulis tampilannya.**
  - Untuk `KLUTO`, deskripsi halaman = "{pasien} · {RM} · dibeli di Kluto {tanggal} · Dibayar di Kluto · Tanpa batas waktu", lalu catatan (bila ada) di bawahnya.
  - `ExtendPackageDialog` tidak tampil untuk `KLUTO`.
  - Tombol "Koreksi sisa" dan "Batalkan paket lama" tampil untuk `invoice:correct`, `source` KLUTO, dan state bukan DIBATALKAN.
  - `canChangeVisit` tidak lagi mensyaratkan `nextVisitOn`; cukup state AKTIF.
  - Riwayat:
    - BELI paket `KLUTO` berlabel "Beli (Kluto)";
    - kolom Keterangan menampilkan `reason` untuk BATAL_PAKET dan KOREKSI_KLUTO.
  - "melewati masa berlaku" tidak pernah muncul untuk `isNoExpiry`.
- [ ] **Step 4: Jalankan** uji komponen, `npx tsc --noEmit`, dan `npm run lint`. Diharapkan: PASS.
- [ ] **Step 5: Commit** `feat: old Kluto package detail page`.

### Task 8: E2E, runbook, dan pemeriksaan akhir

**Files:**
- Create: `tests/e2e/paket-lama.spec.ts`
- Modify: `docs/operasional/server-sundy.md` bagian 4 (catatan rilis hanya maju)

**Interfaces:**
- Consumes: semua task; helper E2E `signIn`, `tungguHidrasi`, `isiTanggal`, `pilihOpsi`, `buatPasienBaru`; kredensial `E2E_RESEPSIONIS`, `E2E_KEUANGAN`.

- [ ] **Step 1: Tulis E2E** (desktop + mobile, nama unik per proyek seperti `paket.spec.ts`).
  1. Admin Keuangan membuat paket katalog "Paket Lama E2E {t}": Relaxing Facial 3 sesi.
  2. Resepsionis membuka `/admin/paket` → "+ Paket lama (Kluto)" → "Pasien belum ada di SunDY".
  3. **Review Focus 1:** resepsionis mengisi nama dan WA milik pasien yang dibuat lebih dulu lewat `buatPasienBaru`, lalu meninggalkan isian WA. Peringatan WA ganda dan "Pakai pasien ini" tampil. Resepsionis mengklik tombol itu.
  4. Pilih paket, tanggal beli 2025-06-01, jumlah kunjungan 1 → Sisa 2. Kunjungan berikutnya dibiarkan. Simpan → ringkasan tampil.
  5. Tab dengan saringan "Paket lama (Kluto)" memuat baris itu dengan "Tanpa batas waktu".
  6. Resepsionis membuat booking → check-in → tagihan kunjungan untuk pasien itu, memakai satu sesi paket lama, lalu memfinalkan. Detail paket: sisa 1 dari 3, kunjungan selesai "Ke-2".
  7. Admin Keuangan membuka detail itu → "Koreksi sisa" ke 2 dengan alasan → riwayat memuat "Koreksi".
  8. "Batalkan paket lama" pada paket kedua yang belum dipakai → status Dibatalkan.
- [ ] **Step 2: Jalankan** `npx playwright test tests/e2e/paket-lama.spec.ts`. Diharapkan: PASS di kedua proyek. Bila server dev lambat di laptop 8 GB, jalankan satu proyek sekali jalan.
- [ ] **Step 3: Tulis catatan runbook** di bagian 4: "Sejak paket lama Kluto (rilis {tanggal}), jangan `deploy.sh kembali` ke rilis sebelumnya bila sudah ada baris `PatientPackage` ber-`source` KLUTO. Cek dengan `sudo -u postgres psql -d sundy -c 'SELECT count(*) FROM \"PatientPackage\" WHERE source = '\''KLUTO'\'''`."
- [ ] **Step 4: Pemeriksaan penuh.**
  - Jalankan `npx tsc --noEmit`, `npm run lint`, `npm test`, dan `npm run test:integration`. Sebelum uji integrasi, jalankan `prepare-db` seperti catatan di memori jadwal paket. Lalu jalankan E2E kelompok paket: `paket.spec.ts`, `paket-lama.spec.ts`, dan tagihan.
  - Diharapkan: semua PASS, kecuali kegagalan lama `tests/integration/schedule.test.ts` (tanggal tetap yang sudah lewat). Kegagalan itu dilaporkan, tidak diperbaiki di sini.
- [ ] **Step 5: Commit** `test: old Kluto package end to end` (runbook ikut di commit ini).

Setelah merge dan deploy (di luar rencana ini): buku panduan staf naik versi. Isinya cara memasukkan paket lama, aturan kerja "sisa sesi hanya dipakai di SunDY" (spec PL15), dan cara Admin Keuangan mencocokkan, mengoreksi, serta membatalkan.
