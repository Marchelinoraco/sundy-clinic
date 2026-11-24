# Akses Tambahan per Akun, Tahap 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super Admin bisa menambahkan kemampuan Menu Stok tertentu ke akun non-Super Admin lewat halaman Staf, tanpa mengubah perilaku peran bawaan.

**Architecture:** Tabel `StaffCapabilityGrant` menyimpan hak tambahan per staf; `loadStaff()` memuatnya ke `CurrentStaff.extraCapabilities` pada setiap permintaan. `can()` menerima peran saja **atau** aktor (`{role, extraCapabilities}`), sehingga uji lama yang memakai peran tetap jalan. `stock:manage` dipecah menjadi lima kemampuan; Apoteker dan Super Admin memegang semuanya.

**Tech Stack:** Next.js (server actions), Prisma + PostgreSQL, MUI, Vitest (unit + integration), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-11-21-akses-tambahan-design.md`

## Global Constraints

- Semua teks antarmuka dan pesan galat dalam Bahasa Indonesia.
- Berkas dengan `"use server"` hanya boleh mengekspor fungsi async (aturan Next.js); fungsi murni tinggal di `src/lib`.
- Daftar yang boleh diberikan tahap 1: `stock:read`, `stock:item`, `stock:supplier`, `stock:receive`, `stock:adjust`, `stock:counter`. Tidak ada kemampuan lain, termasuk `staff:manage` dan `approval:give`.
- Prasyarat otomatis: kelima kemampuan baru memberi `stock:read`; `stock:counter` juga memberi `counter:read`.
- Hanya menambah; tidak ada pencabutan hak bawaan peran.
- Peran bawaan: Apoteker dan Super Admin memegang kelima kemampuan baru; peran lain tidak berubah.
- Migrasi hanya menambah tabel (aman bagi rilis lama).
- Pesan galat server `forbidden: <kemampuan>` dipakai uji; nama kemampuan baru muncul di sana.
- Build di server 2 GB butuh `NODE_OPTIONS=--max-old-space-size=2048`; tidak relevan untuk pekerjaan lokal.

## Review Focus

1. Akun Resepsionis dengan **hanya** `stock:receive` memanggil `adjustStock`, `createStockItem`, `moveToCounter` → ditolak `forbidden: stock:adjust` dst. (Task 4)
2. Hak dicabut lalu aksi dipanggil lagi di permintaan berikutnya → ditolak tanpa login ulang. (Task 3)
3. Sasaran Super Admin, staf tidak ada, atau nama kemampuan di luar daftar (`staff:manage`) → ditolak tanpa mengubah apa pun. (Task 3)
4. Staf dinonaktifkan sambil punya hak tambahan → tetap ditolak masuk (gerbang `isActive`); hak tetap tersimpan. (Task 3)
5. Simpan dengan centang yang sama dua kali (tanpa selisih) → tidak menulis baris audit. (Task 3)

---

### Task 1: Inti izin — kemampuan baru, aktor, prasyarat

**Files:**
- Modify: `src/lib/permissions.ts`
- Test: `tests/unit/permissions.test.ts`

**Interfaces:**
- Produces (dipakai Task 2–6):
  - `Capability` bertambah: `"stock:item" | "stock:supplier" | "stock:receive" | "stock:adjust" | "stock:counter"` (`"stock:manage"` **tetap ada** sampai Task 4).
  - `export type Actor = { role: StaffRole; extraCapabilities?: readonly Capability[] }`
  - `export type Subject = StaffRole | Actor`
  - `export function can(subject: Subject, capability: Capability): boolean`
  - `export const GRANTABLE_CAPABILITIES: readonly Capability[]` (enam kemampuan tahap 1, urutan: `stock:read`, `stock:item`, `stock:supplier`, `stock:receive`, `stock:adjust`, `stock:counter`)
  - `export const CAPABILITY_LABEL: Partial<Record<Capability, string>>` (label dialog: "Lihat stok", "Kelola barang", "Kelola supplier", "Catat barang masuk & retur", "Penyesuaian stok", "Isi stok meja & permintaan")
  - `export function isGrantable(value: string): value is Capability`

- [ ] **Step 1: Write the failing tests** in `tests/unit/permissions.test.ts`:
  - `can("APOTEKER", c)` dan `can("SUPER_ADMIN", c)` benar untuk tiap `c` di `stock:item|supplier|receive|adjust|counter`; `can("RESEPSIONIS"|"ADMIN_KEUANGAN"|"DOKTER"|"TERAPIS", c)` salah.
  - Kesetaraan: untuk setiap peran, kelima kemampuan baru bernilai sama dengan `can(role, "stock:manage")`.
  - `can({ role: "RESEPSIONIS", extraCapabilities: ["stock:receive"] }, "stock:receive")` benar; `"stock:adjust"` salah; `"stock:read"` benar (prasyarat); `"counter:read"` tetap benar (bawaan peran).
  - `can({ role: "ADMIN_KEUANGAN", extraCapabilities: ["stock:counter"] }, "counter:read")` benar (prasyarat); `"restock:request"` salah.
  - `can({ role: "RESEPSIONIS" }, "stock:item")` salah; `can({ role: "RESEPSIONIS", extraCapabilities: [] }, ...)` sama dengan peran saja.
  - `isGrantable("stock:counter")` benar; `isGrantable("staff:manage")`, `isGrantable("approval:give")`, `isGrantable("ngawur")` salah.
  - `GRANTABLE_CAPABILITIES` tidak memuat `staff:manage` maupun `approval:give`, dan semua anggotanya punya `CAPABILITY_LABEL`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/permissions.test.ts` → FAIL (kemampuan/aktor belum ada).
- [ ] **Step 3: Implement** di `src/lib/permissions.ts`: tambah kelima kemampuan ke `Capability`; beri `SUPER_ADMIN` dan `APOTEKER` kelimanya (pertahankan `stock:manage`); tambah `IMPLIES: Partial<Record<Capability, readonly Capability[]>>` (kelima baru → `["stock:read"]`, `stock:counter` → `["stock:read","counter:read"]`); ubah `can` menerima `Subject`: peran string dianggap `{ role }`; benar bila peran memuat kemampuan, atau `extraCapabilities` memuatnya, atau ada kemampuan tambahan yang `IMPLIES`-nya memuatnya.
- [ ] **Step 4: Run** `npx vitest run tests/unit/permissions.test.ts` → PASS; `npx tsc --noEmit` bersih.
- [ ] **Step 5: Commit** `feat: capability model with extra grants and split stock capabilities`

### Task 2: Tabel hak tambahan dan pemuatan di sesi

**Files:**
- Modify: `prisma/schema.prisma` (model baru + relasi di `Staff`), `src/server/session.ts`
- Create: `prisma/migrations/20261121120000_akses_tambahan/migration.sql` (dihasilkan `prisma migrate dev --create-only`, diperiksa tangan)
- Test: `tests/integration/staff-access-schema.test.ts`

**Interfaces:**
- Consumes: `Capability`, `isGrantable` (Task 1).
- Produces: model `StaffCapabilityGrant { id, staffId, capability, grantedById, createdAt }`, unik `(staffId, capability)`, FK `staffId → Staff` `ON DELETE CASCADE`; `Staff.capabilityGrants StaffCapabilityGrant[]`; `CurrentStaff.extraCapabilities: Capability[]` (selalu array, kosong bila tidak ada).

- [ ] **Step 1: Write the failing test** `staff-access-schema.test.ts` (gaya `staff-schema.test.ts`): baris hibah ganda untuk (staf, kemampuan) yang sama ditolak (unik); menghapus staf menghapus hibahnya (berantai).
- [ ] **Step 2: Run** `npx vitest run --config vitest.integration.config.mts tests/integration/staff-access-schema.test.ts` → FAIL.
- [ ] **Step 3: Implement** model dan migrasi (hanya `CREATE TABLE` + indeks + FK). Di `loadStaff()` ubah `select: { …, staff: true }` menjadi `staff: { include: { capabilityGrants: { select: { capability: true } } } }`, dan isi `extraCapabilities` dengan `capabilityGrants.map(g => g.capability).filter(isGrantable)` (nilai asing di basis data diabaikan). Tambahkan `extraCapabilities` ke `CurrentStaff`, `toCurrent`, dan `LoadedStaff`. `requireCapability` dan `requireAnyCapability` memanggil `can(staff, capability)` (bukan `staff.role`).
- [ ] **Step 4: Run** uji di atas → PASS; `npx prisma generate`; `npx tsc --noEmit` bersih (galat dari objek `CurrentStaff` yang dibuat manual di uji/mocks diperbaiki dengan `extraCapabilities: []` di tempat yang memang membangun `CurrentStaff` utuh).
- [ ] **Step 5: Commit** `feat: staff capability grant table and session loading`

### Task 3: Aksi Super Admin `setStaffExtraCapabilities` + audit + data daftar

**Files:**
- Create: `src/server/staff-access.ts` (`"use server"`)
- Modify: `src/lib/audit-labels.ts`, `src/server/staff.ts` (`StaffRow` + `listStaffAccounts`)
- Test: `tests/integration/staff-access.test.ts`

**Interfaces:**
- Consumes: `isGrantable`, `GRANTABLE_CAPABILITIES`, `can` (Task 1); `StaffCapabilityGrant` (Task 2); `recordAudit` (`src/server/audit.ts`); `runAction`, `UserFacingError`, `ActionResult`.
- Produces:
  - `export async function setStaffExtraCapabilities(staffId: string, capabilities: string[]): Promise<ActionResult<void>>` — meminta `staff:manage`; kumpulan akhir menggantikan yang lama.
  - `StaffRow.extraCapabilities: Capability[]` diisi `listStaffAccounts`.
  - Aksi audit: `staff.access.add`, `staff.access.remove` (label "menambah akses staf", "mencabut akses staf"), `entity: "Staff"`, `entityId: staffId`, `summary: "<nama staf>: <label kemampuan>"`, satu baris per kemampuan yang berubah.
- Aturan: tolak (UserFacingError) bila staf tidak ada ("Staf tidak ditemukan."), bila sasaran Super Admin ("Super Admin sudah memiliki semua akses."), bila ada nama di luar `GRANTABLE_CAPABILITIES` ("Akses tidak dikenal."). Kemampuan yang sudah dimiliki **peran** sasaran diabaikan (tidak disimpan). Seluruh selisih ditulis dalam satu transaksi; tanpa selisih → tidak ada tulis dan tidak ada audit.

- [ ] **Step 1: Write the failing tests** (`tests/integration/staff-access.test.ts`, gaya `staff.test.ts`/`counter-moves.test.ts` dengan `vi.mock("@/server/session")` yang memeriksa `can(actor, capability)`):
  - Super Admin menyimpan `["stock:receive","stock:counter"]` untuk Resepsionis → dua baris, dua audit `staff.access.add`; menyimpan `["stock:receive"]` berikutnya → satu baris dihapus, audit `staff.access.remove`.
  - Menyimpan himpunan yang sama dua kali → tidak ada audit baru (Review Focus 5).
  - Pemanggil Resepsionis atau Admin Keuangan → `forbidden: staff:manage`, tidak ada baris tertulis.
  - Sasaran Super Admin, staf tidak ada, `["staff:manage"]`, `["approval:give"]`, `["ngawur"]` → galat berisi pesan di atas, tabel tetap seperti semula (Review Focus 3).
  - `["stock:read"]` untuk sasaran Apoteker (sudah punya dari peran) → tidak ada baris tersimpan.
  - Staf yang dinonaktifkan tetap menyimpan hibahnya (baris ada) (Review Focus 4).
  - `listStaffAccounts()` mengembalikan `extraCapabilities` yang benar.
- [ ] **Step 2: Run** `npx vitest run --config vitest.integration.config.mts tests/integration/staff-access.test.ts` → FAIL.
- [ ] **Step 3: Implement** `setStaffExtraCapabilities` (validasi di luar transaksi bila murni; ambil hibah lama, hitung `add`/`remove`, `createMany` + `deleteMany`, lalu `recordAudit` per perubahan, lalu `safeRevalidatePath("/admin/staf")`); tambahkan label audit; perluas `listStaffAccounts` dengan `capabilityGrants`.
- [ ] **Step 4: Run** uji di atas → PASS.
- [ ] **Step 5: Commit** `feat: super admin action to set extra capabilities`

### Task 4: Pecah `stock:manage` di Menu Stok dan hapus kemampuan lama

**Files:**
- Modify (ganti `stock:manage`, pemetaan di tabel bawah): `src/server/stock-catalog.ts`, `src/server/purchases.ts`, `src/server/stock-movements.ts`, `src/server/restock.ts`, `src/server/restock-read.ts`, `src/server/stock-read.ts`, `src/server/counter-stock.ts`, `src/app/(admin)/admin/stok/page.tsx`, `src/app/(admin)/admin/stok/barang/[id]/page.tsx`, `src/app/(admin)/admin/stok/masuk/[id]/page.tsx`, `src/app/(admin)/admin/stok/masuk/baru/page.tsx`, `src/app/(admin)/admin/stok/permintaan/[id]/page.tsx`, `src/app/(admin)/admin/stok-meja/page.tsx`, `src/app/(admin)/admin/page.tsx`, `src/lib/live-events.ts`, `src/components/admin/counter/fill-counter-dialog.tsx` (komentar), `src/lib/permissions.ts` (hapus `stock:manage`)
- Test: perbarui `tests/unit/permissions.test.ts`, `tests/integration/{counter-moves,stock-movements,purchases,restock,stock-catalog}.test.ts`; Create `tests/integration/stock-extra-access.test.ts`

**Interfaces:**
- Consumes: kemampuan baru (Task 1).
- Pemetaan:

| Tempat | Kemampuan baru |
|---|---|
| `createStockItem`, `updateStockItem`, `setStockItemActive` | `stock:item` |
| `createSupplier`, `updateSupplier`, `setSupplierActive` | `stock:supplier` |
| `createPurchase`, halaman `masuk/baru`, `createSupplierReturn` | `stock:receive` |
| `adjustStock` | `stock:adjust` |
| `moveToCounter`, `pullToWarehouse`, `sendRestockRequest`, `rejectRestockRequest`, `restock-read` (2 fungsi), halaman `permintaan/[id]`, tab Permintaan, `stock-meja` `canFill`, dasbor (`countPendingRestock`, dan kondisi `!can(...)` stok meja), `watchedKinds` `RESTOCK_BARU` | `stock:counter` |
| `stock-read.ts` baris 265 dan 275 (`requireCapability`) | baca kodenya: pilih `stock:receive` bila untuk pilihan faktur/barang masuk, `stock:item` bila untuk barang; catat pilihan di pesan commit |
| `purchases.ts:137` (batal faktur: `stock:manage` atau `payable:manage`) | `stock:receive` atau `payable:manage` |
| Tombol-tombol di halaman Stok (`canManage`) | tombol barang: `stock:item`; tab/tombol supplier: `stock:supplier`; "Barang masuk": `stock:receive`; penyesuaian: `stock:adjust` — pisahkan `canManage` menjadi bendera per fitur sesuai isi komponennya |

- [ ] **Step 1: Write the failing tests** `tests/integration/stock-extra-access.test.ts` (mock sesi dengan aktor `{ role: "RESEPSIONIS", extraCapabilities: [...] }` dan `can(actor, capability)`): dengan hanya `["stock:receive"]`: `createPurchase` berhasil; `adjustStock`, `createStockItem`, `createSupplier`, `moveToCounter` ditolak masing-masing `forbidden: stock:adjust|stock:item|stock:supplier|stock:counter` (Review Focus 1). Dengan hanya `["stock:counter"]`: `moveToCounter` dan `sendRestockRequest` berhasil, `createPurchase` ditolak. Tanpa hibah, Resepsionis ditolak semuanya.
- [ ] **Step 2: Run** uji itu → FAIL.
- [ ] **Step 3: Implement** pemetaan di tabel; hapus `stock:manage` dari `Capability` dan dari kedua peran; hapus uji kesetaraan lama yang merujuknya dan ganti dengan uji "tiap peran punya persis kelompok kemampuan baru". Perbarui uji lama: setiap `forbidden: stock:manage` → nama baru sesuai fungsi yang diuji, dan setiap `can("…", "stock:manage")` di `permissions.test.ts` → kemampuan baru (daftar `["stock:manage", …]` di baris ±99 dan ±106 diperluas ke kelimanya).
- [ ] **Step 4: Run** `npx tsc --noEmit` (tidak ada sisa `stock:manage`; `grep -rn "stock:manage" src tests` kosong) dan `npx vitest run` (unit) lalu `npx vitest run --config vitest.integration.config.mts tests/integration/{counter-moves,stock-movements,purchases,restock,stock-catalog,stock-extra-access,purchase-pricing}.test.ts` → PASS.
- [ ] **Step 5: Commit** `refactor: split stock:manage into five stock capabilities`

### Task 5: Aktor di semua pemeriksaan (`can(staff, …)`) dan pemberitahuan langsung

**Files:**
- Modify: semua berkas di `src` yang memanggil `can(<x>.role, …)` (±135 tempat; `grep -rnE "can\([a-zA-Z.]+\.role," src`), `src/components/admin/app-sidebar.tsx` (`isNavItemVisible`), `src/lib/live-events.ts` (`watchedKinds`, `eventMessage`), `src/server/live-events.ts` (`liveEventsFor`), `src/components/admin/live-notifier.tsx`, pemanggilnya (layout admin dan rute pemberitahuan; cari dengan `grep -rn "liveEventsFor\|LiveNotifier\|isNavItemVisible" src`)
- Test: `tests/unit/permissions.test.ts` (sudah), `tests/e2e/admin-sidebar.spec.ts` bila perlu, uji unit/integrasi pemberitahuan yang ada

**Interfaces:**
- Consumes: `Subject`, `Actor` (Task 1); `CurrentStaff.extraCapabilities` (Task 2).
- Produces: `isNavItemVisible(staff: Actor, item)`, `watchedKinds(subject: Subject)`, `eventMessage(event, subject: Subject)`, `liveEventsFor(subject: Subject, since, now?)`, `LiveNotifier` menerima `actor: Actor` (peran + hak tambahan, dapat diserialisasi) menggantikan `role`.
- Aturan penggantian: `can(staff.role, c)` → `can(staff, c)`, `can(actor.role, c)` → `can(actor, c)`; yang hanya punya peran (uji, komentar) dibiarkan. Hasil objek aktor yang melewati batas server→klien hanya memuat `role` dan `extraCapabilities`.

- [ ] **Step 1: Write the failing tests**: uji unit `watchedKinds({ role: "RESEPSIONIS", extraCapabilities: ["stock:counter"] })` memuat `"RESTOCK_BARU"`, tanpa hibah tidak; `isNavItemVisible({ role: "RESEPSIONIS", extraCapabilities: ["stock:read"] }, itemStok)` benar, tanpa hibah salah (itemStok = entri "Stok" di `NAV`; ekspor bila belum).
- [ ] **Step 2: Run** uji itu → FAIL.
- [ ] **Step 3: Implement** penggantian mekanis lalu biarkan `npx tsc --noEmit` menunjukkan tempat yang tipenya tidak membawa `extraCapabilities` (galat itu adalah daftar kerja). Tempat yang hanya punya `role` dan memeriksa kemampuan Stok harus diubah agar memegang aktor penuh.
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx eslint src tests --max-warnings 0` (bila proyek memakainya), `npx vitest run`, dan seluruh `npx vitest run --config vitest.integration.config.mts` → PASS.
- [ ] **Step 5: Commit** `refactor: capability checks take the full actor`

### Task 6: Dialog "Akses tambahan" di halaman Staf

**Files:**
- Create: `src/components/admin/staff/staff-access-dialog.tsx`
- Modify: `src/components/admin/staff/staff-manager.tsx` (item menu + penanda), `src/app/(admin)/admin/staf/page.tsx` bila perlu
- Test: `tests/e2e/akses-tambahan.spec.ts` (Task 7); komponen diuji lewat E2E

**Interfaces:**
- Consumes: `StaffRow.extraCapabilities`, `setStaffExtraCapabilities` (Task 3), `GRANTABLE_CAPABILITIES`, `CAPABILITY_LABEL`, `can` (Task 1).
- Produces: `StaffAccessDialog({ row, onClose }: { row: StaffRow; onClose: () => void })`.

- [ ] **Step 1: Implement** dialog bergaya `staff-form-dialog.tsx` (MUI Dialog, judul `Akses tambahan — <nama>`, `aria-label` dialog sama): satu kelompok "Stok" berisi enam kotak centang berlabel `CAPABILITY_LABEL`; kotak yang sudah dimiliki peran tampil tercentang dan nonaktif dengan teks kecil `dari peran <label peran>`; kotak lain mengikuti `row.extraCapabilities`. Tombol **Batal** dan **Simpan**; Simpan memanggil `setStaffExtraCapabilities(row.id, <kemampuan tercentang yang bukan dari peran>)`, menampilkan galat server bila ada, menutup dialog bila sukses.
- [ ] **Step 2: Implement** di `staff-manager.tsx`: item menu **Akses tambahan** (hanya bila `row.role !== "SUPER_ADMIN"`), `Dialog` baru `{ kind: "access"; row }`, dan chip kecil `+<n> akses` di sel peran bila `row.extraCapabilities.length > 0`.
- [ ] **Step 3: Verify** `npx tsc --noEmit` bersih; jalankan `npm run dev` dan buka `/admin/staf`: dialog terbuka, centang tersimpan, dimuat ulang tetap tercentang (laporkan hasil sebenarnya).
- [ ] **Step 4: Commit** `feat: extra access dialog on the staff page`

### Task 7: Uji E2E dan dokumentasi

**Files:**
- Create: `tests/e2e/akses-tambahan.spec.ts`
- Modify: `docs/operasional/server-sundy.md` (satu paragraf: tabel baru, rilis lama mengabaikan hak tambahan sehingga setelah `deploy.sh kembali` akun bertambah-hak kehilangan akses tambahannya)

**Interfaces:**
- Consumes: dialog (Task 6); helper `signIn`, `tungguHidrasi`, `E2E_ADMIN`, `E2E_BASE_URL` seperti `kelola-staf.spec.ts`.

- [ ] **Step 1: Write the test** (gaya `kelola-staf.spec.ts`): Super Admin menambah staf Resepsionis baru, mengganti kata sandi sementaranya lewat alur yang sama dengan `kelola-staf.spec.ts`; sebelum diberi akses, staf itu membuka `/admin/stok` → halaman tolak (403/`forbidden`) dan menu "Stok" tidak ada di sidebar; Super Admin membuka Akses tambahan, mencentang **Catat barang masuk & retur**, Simpan; staf itu memuat ulang: menu "Stok" ada, tombol "Barang masuk" ada, tombol "+ Barang" dan penyesuaian tidak ada, `/admin/stok/masuk/baru` terbuka; Super Admin mencabut centang → staf memuat ulang dan `/admin/stok` kembali ditolak (Review Focus 2).
- [ ] **Step 2: Run** `npx playwright test tests/e2e/akses-tambahan.spec.ts` → PASS (beserta `admin-sidebar.spec.ts` dan `stok-meja.spec.ts` agar tidak ada regresi).
- [ ] **Step 3: Commit** `test: e2e for extra stock access`

### Task 8: Verifikasi akhir dan PR

- [ ] **Step 1:** `npx tsc --noEmit`, `npx vitest run`, `npx vitest run --config vitest.integration.config.mts`, dan E2E yang menyentuh Stok, Staf, sidebar, dasbor → semuanya hijau; laporkan keluaran nyata.
- [ ] **Step 2:** `git push -u origin akses-tambahan` dan buka PR berjudul "Akses tambahan per akun (tahap 1: Stok)" dengan ringkasan spec; **tanpa deploy** (menunggu persetujuan pemilik).
