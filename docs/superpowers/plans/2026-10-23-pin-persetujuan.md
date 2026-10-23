# PIN Persetujuan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah harga, memberi diskon, dan membatalkan tagihan hanya tersimpan dengan PIN Admin Keuangan atau Super Admin, dan nama penyetuju tercatat.

**Architecture:**
- PIN 6 angka per penyetuju disimpan sebagai hash di tabel baru, dengan penghitung salah dan kunci 15 menit.
- Server action yang dijaga menerima `approval?: { approverId, pin }`:
  - Bila `approval` ada, PIN diperiksa **sebelum** transaksi, supaya hitungan salah tetap tersimpan walau tindakannya gagal.
  - Di dalam transaksi, setelah validasi biasa (misalnya batas 20%), tindakan tanpa penyetuju ditolak dengan `APPROVAL_REQUIRED`.
- Di klien, `useApproval()` memanggil aksi tanpa `approval`. Bila hasilnya `APPROVAL_REQUIRED`, kotak Persetujuan dibuka, lalu aksi diulang dengan PIN. Klien tidak perlu tahu kapan PIN diperlukan.

**Tech Stack:** Next.js 15 server actions, Prisma 7 + PostgreSQL (migrasi SQL manual), better-auth (`auth.$context.password.hash/verify` untuk hash PIN), MUI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-pin-persetujuan-design.md`

## Global Constraints

- Penyetuju: staf **aktif** berperan `ADMIN_KEUANGAN` atau `SUPER_ADMIN` yang sudah membuat PIN. Kapabilitas baru `approval:give` dimiliki kedua peran itu.
- PIN: tepat 6 angka (`/^\d{6}$/`), disimpan sebagai hash lewat `(await auth.$context).password.hash(pin)`.
- Kunci: 5 kali salah berturut-turut → `lockedUntil = sekarang + 15 menit`, hitungan kembali 0. Selama terkunci, PIN benar pun ditolak. PIN benar mengembalikan hitungan ke 0.
- Pesan (di `src/lib/approval.ts`):
  - `APPROVAL_REQUIRED` = "Perlu persetujuan Admin Keuangan atau Super Admin."
  - `PIN_WRONG` = "PIN salah."
  - `pinLockedMessage(name, until)` = "PIN {nama} terkunci sampai {HH.MM}." (WITA)
  - `APPROVER_INVALID` = "Penyetuju tidak ditemukan atau belum membuat PIN."
  - `NO_APPROVERS` = "Belum ada Admin Keuangan atau Super Admin yang membuat PIN."
  - `PIN_FORMAT` = "PIN harus 6 angka."
- Tindakan yang wajib PIN, untuk **semua peran** (spec P1–P3, P5):

  | Tindakan | Butuh PIN | Tanpa PIN |
  |---|---|---|
  | `updateInvoiceLine` | harga baru berbeda dari harga baris sekarang **dan** berbeda dari harga katalog, pada baris tertaut katalog | ubah jumlah saja; kembali ke harga katalog; baris bebas tanpa katalog |
  | `setLineDiscount` | diskon manual | `clearLineDiscount` |
  | `setInvoiceDiscount` | `kind` bukan null | menghapus diskon (`kind: null`) |
  | `applyFinalDiscount` | selalu | — |
  | `cancelInvoice` | tagihan FINAL | buang draf (status DRAF) |

  Batas 20% untuk resepsionis tetap dicek **sebelum** PIN diminta. `revokeInvoicePayment` tidak berubah.
- Kolom penyetuju (id + nama, nullable):
  - `InvoiceLine.priceApprovedById/Name`
  - `InvoiceLine.discountApprovedById/Name`
  - `Invoice.discountApprovedById/Name`
  - `Invoice.cancelApprovedById/Name`

  Kolom ini dikosongkan saat harga kembali ke katalog atau diskonnya dihapus.
- Tampilan staf: tambahkan " · disetujui {nama}" pada keterangan harga baris, keterangan diskon baris, baris diskon tagihan, dan keterangan pembatalan. Struk, invoice A4, dan halaman pasien tidak berubah.
- Audit: ringkasan audit tindakan yang dijaga ditambah " · disetujui {nama}". Aksi audit baru: `approval-pin.set` "membuat/mengganti PIN persetujuan", `approval-pin.reset` "mereset PIN persetujuan".

## Review Focus

1. **Aksi server dipanggil langsung tanpa `approval`** (tanpa lewat layar) → ditolak `APPROVAL_REQUIRED`, untuk setiap tindakan di tabel. Tes: Task 3.
2. **Penyetuju yang sudah dinonaktifkan atau perannya diganti** setelah membuat PIN tidak bisa menyetujui. Tes: Task 1.
3. **PIN terkunci:** PIN benar selama terkunci tetap ditolak dengan jam bukanya. Setelah lewat, PIN benar diterima. Tes: Task 1.
4. **Ubah jumlah saja** pada baris yang harganya sudah disetujui → tanpa PIN baru, dan nama penyetuju lama tetap. Tes: Task 3.
5. **Menghapus diskon atau mengembalikan harga ke katalog** mengosongkan nama penyetuju, tanpa PIN. Tes: Task 3.

---

### Task 1: PIN, penyetuju, dan pemeriksaan PIN di server

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/permissions.ts`
- Create:
  - `prisma/migrations/20261024090000_pin_persetujuan/migration.sql`
  - `src/lib/approval.ts`
  - `src/server/approval.ts` (modul server biasa, **tanpa** `"use server"`)
- Test: `tests/unit/approval.test.ts`, `tests/integration/approval.test.ts`

**Interfaces:**
- Produces:
  - model `ApprovalPin`:
    - `staffId String @unique` (relasi Staff, Cascade)
    - `pinHash String`
    - `failedCount Int @default(0)`
    - `lockedUntil DateTime?`
    - `updatedAt DateTime @updatedAt`
  - Kolom penyetuju dari Global Constraints.
  - `src/lib/approval.ts`:
    - `type ApprovalInput = { approverId: string; pin: string }`
    - konstanta pesan
    - `validatePin(pin: unknown): string | null` (pesan atau null)
    - `APPROVAL_MAX_FAILS = 5`, `APPROVAL_LOCK_MINUTES = 15`
  - `src/server/approval.ts`:
    - `verifyApproval(input: unknown): Promise<{ id: string; name: string } | null>`: null bila `input` kosong; melempar `UserFacingError` bila salah, terkunci, atau penyetuju tidak sah; mencatat hitungan salah dan kunci.
    - `requireApprover(approver: { id: string; name: string } | null): { id: string; name: string }`: melempar `APPROVAL_REQUIRED` bila null.

- [ ] **Step 1: Write the failing tests:**
  - `tests/unit/approval.test.ts`: `validatePin` → null untuk "123456"; `PIN_FORMAT` untuk "12345", "1234567", "12a456", 123456 (angka), dan "".
  - `tests/integration/approval.test.ts` (penyetuju dibuat langsung di DB dengan hash dari `auth.$context`):
    - `"PIN benar mengembalikan penyetuju dan menghapus hitungan salah"`
    - `"PIN salah 5 kali mengunci 15 menit; PIN benar selama terkunci tetap ditolak dengan jamnya; setelah lewat diterima (Review Focus 3)"`: ubah `lockedUntil` ke masa lalu untuk tahap akhir.
    - `"penyetuju nonaktif, berperan RESEPSIONIS, atau tanpa PIN ditolak APPROVER_INVALID (Review Focus 2)"`
    - `"tanpa approval: verifyApproval null, requireApprover melempar APPROVAL_REQUIRED"`
- [ ] **Step 2: Run** `npx vitest run tests/unit/approval.test.ts` dan `npm run test:integration -- tests/integration/approval.test.ts`. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implement:**
  - Skema dan migrasi (hanya menambah).
  - `approval:give` di `permissions.ts` untuk `SUPER_ADMIN` dan `ADMIN_KEUANGAN`.
  - Lib dan `verifyApproval`. Salah PIN = `updateMany` atomik `failedCount: { increment: 1 }`; bila mencapai 5, set `lockedUntil` dan `failedCount: 0`.
  - Cek drift: `prisma migrate diff … --script` kosong setelah `migrate deploy` ke DB uji.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: approval PINs with lockout, checked on the server`

### Task 2: Membuat, mengganti, dan mereset PIN

**Files:**
- Create:
  - `src/server/approval-pin.ts` (`"use server"`)
  - `src/app/(admin)/admin/pin-persetujuan/page.tsx`
  - `src/components/admin/approval-pin-form.tsx`
- Modify:
  - `src/components/admin/nav-user.tsx` (item menu "PIN persetujuan" untuk `approval:give`)
  - `src/server/staff.ts` (`StaffRow.hasApprovalPin`)
  - `src/components/admin/staff/staff-manager.tsx` (aksi "Reset PIN" untuk Super Admin, pada staf yang punya PIN)
  - `src/lib/audit-labels.ts`
- Test:
  - `tests/integration/approval-pin.test.ts`
  - `tests/unit/components/approval-pin-form.test.tsx`
  - tes nav-user dan staff-manager yang sudah ada

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `setOwnApprovalPin(input: { currentPin?: string; newPin: string }): Promise<ActionResult<void>>`. Kapabilitas `approval:give`. PIN lama wajib bila sudah punya PIN; PIN lama yang salah ikut dihitung salah seperti di Task 1.
  - `listApprovers(): Promise<ActionResult<{ id: string; name: string }[]>>`: staf aktif ber-`approval:give` dengan PIN, urut nama. Boleh untuk setiap staf yang masuk.
  - `resetApprovalPin(staffId: string): Promise<ActionResult<void>>`: kapabilitas `staff:manage`; menghapus baris PIN.

- [ ] **Step 1: Write the failing tests:**
  - Integrasi:
    - `"membuat PIN pertama tanpa PIN lama; mengganti wajib PIN lama yang benar"`
    - `"resepsionis tidak bisa membuat PIN"`
    - `"listApprovers hanya penyetuju aktif yang punya PIN"`
    - `"Super Admin mereset PIN; orang itu bisa membuat PIN baru tanpa PIN lama"`
    - audit `approval-pin.set` dan `approval-pin.reset` tercatat
  - Unit form: kolom "PIN lama" hanya tampil bila sudah punya PIN, ditambah "PIN baru" dan "Ulangi PIN baru". Pesan "PIN baru dan ulangannya tidak sama." bila beda. Mengirim `{ currentPin, newPin }`.
  - Unit nav-user: item "PIN persetujuan" untuk Admin Keuangan, tidak untuk Resepsionis.
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Halaman ditolak 403 untuk peran tanpa `approval:give`, mengikuti pola halaman admin lain.
- [ ] **Step 4: Run** the tests. Expected: PASS. Lalu `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: approvers set their PIN; Super Admin resets it`

### Task 3: Tindakan tagihan menuntut penyetuju

**Files:**
- Modify:
  - `src/server/invoice-drafts.ts` (`updateInvoiceLine`, `setLineDiscount`, `clearLineDiscount`, `setInvoiceDiscount`)
  - `src/server/invoice-payments.ts` (`applyFinalDiscount`)
  - `src/server/invoice-lifecycle.ts` (`cancelInvoice`)
  - `src/server/invoice-read.ts`: `InvoiceLineRow.priceApprovedByName`, `.discountApprovedByName`; `InvoiceDetail.discountApprovedByName`, `.cancelApprovedByName`
- Test:
  - `tests/integration/invoice-approval.test.ts`
  - integrasi tagihan yang sudah ada (tambahkan `approval` di tempat yang kini menuntutnya)

**Interfaces:**
- Consumes: `verifyApproval`, `requireApprover`, `ApprovalInput`.
- Produces: kelima aksi menerima `approval?: ApprovalInput` di input-nya. Aturan per tindakan mengikuti tabel Global Constraints.

- [ ] **Step 1: Write the failing tests** di `invoice-approval.test.ts` (aktor RESEPSIONIS kecuali disebut lain):
  - `"tanpa approval setiap tindakan yang dijaga ditolak APPROVAL_REQUIRED, termasuk oleh Admin Keuangan (Review Focus 1, spec P2)"`
  - `"dengan PIN benar tersimpan bersama nama penyetuju dan audit '· disetujui'"`
  - `"diskon 25% oleh resepsionis tetap ditolak batas 20% sebelum PIN diminta"`
  - `"ubah jumlah saja tanpa PIN, nama penyetuju harga tetap (Review Focus 4)"`
  - `"kembali ke harga katalog, hapus diskon baris, dan hapus diskon tagihan tanpa PIN dan mengosongkan nama penyetuju (Review Focus 5)"`
  - `"buang draf tanpa PIN; batalkan tagihan final butuh PIN"`
  - `"PIN salah tidak menyimpan tindakan dan menambah hitungan salah"`
- [ ] **Step 2: Run** `npm run test:integration -- tests/integration/invoice-approval.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - Di tiap aksi: `const approver = await verifyApproval(input?.approval)` sebelum transaksi.
  - Di dalam transaksi, setelah validasi dan tepat sebelum menulis: `requireApprover(approver)`, hanya bila tindakan itu menuntutnya.
  - Simpan atau kosongkan kolom penyetuju, lalu tambahkan nama penyetuju ke ringkasan audit.
- [ ] **Step 4: Run:**
  - tes baru
  - `npm run test:integration -- tests/integration/invoice` (perbaiki tes lama yang kini butuh `approval`, dengan helper penyetuju uji)

  Expected: PASS.
- [ ] **Step 5: Commit** `feat: price changes, discounts and cancellations need an approver PIN`

### Task 4: Kotak Persetujuan di layar tagihan

**Files:**
- Create:
  - `src/components/admin/approval/approval-dialog.tsx`
  - `src/components/admin/approval/use-approval.tsx`
- Modify:
  - `src/components/admin/billing/invoice-draft-editor.tsx` (ubah baris)
  - `src/components/admin/billing/line-discount-dialog.tsx`
  - `src/components/admin/billing/discount-form.tsx`
  - `src/components/admin/billing/final-discount-dialog.tsx`
  - `src/components/admin/billing/cancel-invoice-dialog.tsx` (hanya mode Batalkan tagihan)
  - keterangan " · disetujui {nama}" di editor draf dan tampilan tagihan final
- Test:
  - `tests/unit/components/approval-dialog.test.tsx`
  - tes komponen tagihan yang sudah ada (satu alur per dialog)

**Interfaces:**
- Consumes: `listApprovers`, `APPROVAL_REQUIRED`, `NO_APPROVERS`, `ApprovalInput`.
- Produces: `useApproval(): { withApproval<T>(call: (approval?: ApprovalInput) => Promise<ActionResult<T>>): Promise<ActionResult<T> | null>; dialog: ReactNode }`.
  - Memanggil `call()` lebih dulu.
  - Bila galat = `APPROVAL_REQUIRED`, membuka dialog **"Persetujuan"** dengan pilihan **"Penyetuju"**, isian **"PIN"** (password, `inputMode="numeric"`, 6 angka), dan tombol **"Setujui"**.
  - Saat Setujui, memanggil `call({ approverId, pin })`. Galat PIN tampil di dalam dialog tanpa menutupnya. Hasil sukses menutup dialog.
  - **"Batal"** mengembalikan `null`.

- [ ] **Step 1: Write the failing tests:**
  - `approval-dialog.test.tsx`:
    - `"aksi pertama ditolak APPROVAL_REQUIRED membuka Persetujuan; Setujui mengulang dengan approverId dan PIN"`
    - `"PIN salah tampil di dialog, dialog tetap terbuka"`
    - `"tanpa penyetuju: pesan NO_APPROVERS dan Setujui nonaktif"`
    - `"Batal mengembalikan null"`
  - `line-discount-dialog.test.tsx`: diskon yang dibalas `APPROVAL_REQUIRED` membuka Persetujuan, lalu tersimpan.
  - `invoice-draft-editor.test.tsx`: keterangan baris memuat "disetujui Rina".
- [ ] **Step 2: Run** those test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Kelima tempat memanggil aksinya lewat `withApproval` dan merender `dialog`.
- [ ] **Step 4: Run** the tests, `npx vitest run` (semua unit), `npx tsc --noEmit`, `npx eslint src tests --quiet`. Expected: PASS / clean.
- [ ] **Step 5: Commit** `feat: Persetujuan dialog asks for the approver's PIN on the invoice screens`

### Task 5: E2E dan verifikasi

**Files:**
- Modify:
  - `tests/e2e/prepare-db.mts` (PIN `E2E_APPROVAL_PIN` untuk akun Admin Keuangan uji)
  - `tests/e2e/credentials.ts` (`E2E_APPROVAL_PIN = "135790"`)
  - `tests/e2e/tagihan-diskon.spec.ts`, `tests/e2e/tagihan.spec.ts`
- Create: `tests/e2e/helpers/approval.ts`:
  - `setujui(page: Page, approver = E2E_KEUANGAN.name, pin = E2E_APPROVAL_PIN): Promise<void>`
  - mengisi dialog "Persetujuan" lalu menekan "Setujui"

- [ ] **Step 1:**
  - `tagihan-diskon.spec.ts`: diskon 90.000 tetap ditolak 20% tanpa dialog. Diskon 50.000 → `setujui(rp)` → tersimpan, dan baris memuat "disetujui Keuangan E2E" (nama dari `E2E_KEUANGAN`).
  - `tagihan.spec.ts`: setiap "Batalkan tagihan" pada tagihan final → `setujui(page)`.
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npx eslint src tests --quiet`, lalu `caffeinate -i npx playwright test tests/e2e/tagihan.spec.ts tests/e2e/tagihan-diskon.spec.ts tests/e2e/kelola-staf.spec.ts --workers=1` → pass.
- [ ] **Step 3:** Reset DB uji (`prepare-db.mts`; bila gagal karena katalog terhapus, jalankan lewat E2E global-setup), lalu `npm run test:integration` → hanya `schedule.test.ts` (3).
- [ ] **Step 4: Commit** `test: approval PIN in end-to-end billing flows`
