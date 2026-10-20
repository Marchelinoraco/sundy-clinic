# Peran Perawat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Peran Terapis tampil sebagai "Perawat". Perawat bisa login dan mengisi food recall serta BIA pasien yang sudah check-in hari ini, dan menerima pemberitahuan setiap ada check-in.

**Architecture:** Hanya label yang berubah; enum `StaffRole.TERAPIS` tetap. Ada dua kemampuan baru:
- `nurse:work`: daftar perawat, halaman Tangani, simpan food recall, angka BIA, dan buka berkas BIA;
- `checkin:notify`: pemberitahuan check-in.

Satu aturan murni `nurseCanWork` membatasi semua aksi perawat pada booking klinik hari ini yang berstatus Hadir. Halaman Tangani memakai ulang tab food recall dan tab BIA milik dokter. Datanya dari loader khusus perawat yang tidak membawa data klinis lain.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 7 + PostgreSQL, MUI, Vitest (unit + integrasi), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-peran-perawat-design.md`

## Global Constraints

- Label peran TERAPIS di mana pun: `"Perawat"`. Nilai enum `TERAPIS` di DB dan kode tidak diganti.
- Tidak ada migrasi basis data. Bila ternyata perlu, migrasinya hanya menambah.
- Data pasien yang dilihat perawat hanya: nama, No. RM, tanggal/jam, layanan, tenaga, cabang, dan `Patient.allergies`.
- Batas data perawat ada di `nurseCanWork`: `status === "HADIR"`, `channel === "KLINIK"`, dan tanggal WITA `startAt` sama dengan tanggal WITA hari ini.
- Pemberitahuan check-in hanya untuk pemegang `checkin:notify`, yaitu TERAPIS saja (Super Admin tidak).
- Teks situs: `"Ditangani dokter dan perawat berpengalaman."`
- Penulis food recall: `"CUSTOMER" | "DOKTER" | "PERAWAT"`. Labelnya: pasien, dokter, perawat.
- Perintah: unit `npm test`, integrasi `npm run test:integration` (PostgreSQL lokal `sundy_test`), E2E `npm run test:e2e`, lint `npm run lint`, tipe `npx tsc --noEmit`.

## Review Focus

1. **Perawat membuka halaman Tangani lewat URL langsung** untuk booking kemarin, booking Selesai, atau Konsultasi Online. Halaman harus menampilkan "Pasien ini tidak sedang ditangani hari ini." tanpa data apa pun. Diuji di Task 4.
2. **Perawat membuka `/admin/bia/berkas/[id]`** untuk berkas booking di luar batas. Harus 403. Diuji di Task 3.
3. **Perawat menyimpan food recall** yang membawa baris `by: "DOKTER"` atau `"CUSTOMER"` dari klien. Baris lama tetap bertanda aslinya, dan baris tanpa tanda menjadi `PERAWAT`. Tanda dari klien dipercaya seperti alur dokter yang sudah ada, karena pengguna panel adalah staf yang login. Diuji di Task 2.
4. **Super Admin** (memegang `record:write` dan `nurse:work`) menyimpan dari halaman Tangani. Tandanya `PERAWAT`, karena aksi perawat selalu memberi tanda perawat. Super Admin juga tidak menerima pemberitahuan check-in. Diuji di Task 2 dan 5.
5. **Dokter memfinalkan catatan saat perawat sedang menyimpan.** Simpanan perawat ditolak dengan pesan terkunci yang sudah ada (`LOCKED`, `rekam_medis_terkunci`). Diuji di Task 2.

---

### Task 1: Peran Perawat — label, kemampuan, akun, teks

**Files:**
- Modify: `src/lib/staff-role.ts` (label), `src/lib/audit-labels.ts:44` (label)
- Modify: `src/lib/permissions.ts` (kemampuan baru + daftar TERAPIS + komentar)
- Modify: `src/lib/staff-accounts.ts` (aturan akun), `src/server/staff.ts` (buat staf/akun), `src/components/admin/staff/staff-form-dialog.tsx`
- Modify: `src/app/(admin)/admin/staf/page.tsx:15`, `src/server/staff-photo.ts:25`, `src/components/home/value-props.tsx:9`
- Test: `tests/unit/permissions.test.ts`, `tests/unit/staff-accounts.test.ts`, `tests/unit/staff-role.test.ts`, `tests/integration/staff.test.ts`

**Interfaces:**
- Produces:
  - `Capability` bertambah `"nurse:work"` dan `"checkin:notify"`;
  - `CAPABILITIES_BY_ROLE.TERAPIS = ["nurse:work", "checkin:notify", "bia:upload"]`;
  - `SUPER_ADMIN` bertambah `"nurse:work"` (bukan `checkin:notify`);
  - `loginEmailRequired(role: StaffRole): boolean` di `src/lib/staff-accounts.ts`, menggantikan `roleCanHaveLogin`.

- [ ] **Step 1: Tulis tes unit yang gagal**

```ts
// tests/unit/permissions.test.ts
it("Perawat (TERAPIS): kerja perawat, pemberitahuan check-in, unggah BIA — tanpa rekam medis", () => {
  expect(CAPABILITIES_BY_ROLE.TERAPIS).toEqual(["nurse:work", "checkin:notify", "bia:upload"]);
  expect(can("TERAPIS", "record:read")).toBe(false);
  expect(can("SUPER_ADMIN", "nurse:work")).toBe(true);
  expect(can("SUPER_ADMIN", "checkin:notify")).toBe(false);
  expect(can("DOKTER", "nurse:work")).toBe(false);
});
it("menu Perawat hanya Dasbor", () => {
  const visible = NAV_GROUPS.flatMap((g) => g.items).filter((item) => isNavItemVisible("TERAPIS", item)).map((i) => i.title);
  expect(visible).toEqual(["Dasbor"]);
});
// tests/unit/staff-role.test.ts
expect(STAFF_ROLE_LABEL.TERAPIS).toBe("Perawat");
// tests/unit/staff-accounts.test.ts
it("email login wajib untuk semua peran kecuali Perawat", () => {
  expect(loginEmailRequired("TERAPIS")).toBe(false);
  expect(loginEmailRequired("RESEPSIONIS")).toBe(true);
});
it("staf yang punya akun boleh dijadikan Perawat", () => {
  expect(block({ change: { kind: "role", to: "TERAPIS" } })).toBeNull();
});
```

Tes "Super Admin memegang seluruh kemampuan" yang sudah ada harus diubah agar mengecualikan `checkin:notify`. Hapus tes lama "hanya Terapis yang tidak boleh punya akun" dan "staf yang punya akun tidak boleh dijadikan Terapis".

- [ ] **Step 2: Jalankan dan pastikan gagal.** Run: `npm test -- tests/unit/permissions.test.ts tests/unit/staff-accounts.test.ts tests/unit/staff-role.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementasi pure.** Hal yang diubah:
  - Label `"Perawat"` di `staff-role.ts` dan `audit-labels.ts`, dengan komentar: "Enum TERAPIS ditampilkan sebagai Perawat (spec peran perawat 3)".
  - Kemampuan baru di `permissions.ts`. Ganti komentar TERAPIS: "Perawat: food recall dan BIA pasien hari ini (spec peran perawat 5)".
  - `loginEmailRequired(role) = role !== "TERAPIS"`.
  - Hapus aturan TERAPIS di `staffChangeBlock`.

- [ ] **Step 4: Tes integrasi akun yang gagal** (`tests/integration/staff.test.ts`):
  - `createStaffWithAccount` dengan peran `TERAPIS` dan email kosong membuat staf **tanpa** baris `user`;
  - dengan email, membuat akun + kata sandi sementara + `mustChangePassword = true`;
  - `createAccountForStaff` untuk staf TERAPIS tanpa akun berhasil (sekarang ditolak);
  - peran lain dengan email kosong tetap ditolak dengan pesan "Isi email login."

- [ ] **Step 5: Implementasi server dan UI:**
  - `createStaffWithAccount` membuat akun bila email terisi. Email wajib bila `loginEmailRequired(role)`.
  - `createAccountForStaff` tidak lagi menolak TERAPIS.
  - Formulir: label kolom email untuk Perawat menjadi `"Email login (opsional)"`. Hapus teks "Terapis tidak punya akun login."
  - Teks: deskripsi halaman Staf menjadi `"Akun staf dan perannya di panel."`, pesan foto menjadi `"Foto hanya untuk dokter dan perawat."`, dan value-props seperti di Global Constraints.

- [ ] **Step 6: Jalankan unit + integrasi staf.** Run: `npm test` lalu `npm run test:integration -- tests/integration/staff.test.ts tests/integration/staff-accounts.test.ts`. Expected: PASS.

- [ ] **Step 7: Commit** — `feat: show Terapis as Perawat and let Perawat sign in`.

---

### Task 2: Aturan kerja perawat + food recall oleh perawat

**Files:**
- Create: `src/lib/nurse.ts`
- Modify: `src/lib/food-recall.ts` (penulis PERAWAT, label penulis, baris tabel)
- Modify: `src/server/food-recall-admin.ts` (aksi perawat), `src/components/admin/food-recall-table.tsx` (lencana penulis), `src/components/admin/encounter-food-recall-tab.tsx` (aksi simpan dan link opsional)
- Test: `tests/unit/nurse.test.ts` (baru), `tests/unit/food-recall.test.ts`, `tests/integration/food-recall.test.ts`

**Interfaces:**
- Consumes: `nurse:work` (Task 1).
- Produces:
  - `nurseCanWork(appointment: { status: string; channel: "KLINIK" | "ONLINE"; startAt: Date }, now: Date): boolean`
  - `NURSE_OUT_OF_SCOPE = "Pasien ini tidak sedang ditangani hari ini."` (keduanya di `src/lib/nurse.ts`)
  - `FOOD_RECALL_AUTHORS = ["CUSTOMER", "DOKTER", "PERAWAT"]`
  - `FOOD_RECALL_AUTHOR_LABEL: Record<FoodRecallAuthor, string>`
  - `validateStaffEntries(raw: unknown, author: "DOKTER" | "PERAWAT" = "DOKTER")`
  - `FoodRecallRow.entries[i]` berbentuk `{ kindLabel: string; text: string; by: FoodRecallAuthor }`, menggantikan `byDoctor`
  - `saveFoodRecallByNurse(input: { appointmentId: string; entries: unknown }): Promise<ActionResult<void>>`
  - `EncounterFoodRecallTab` mendapat prop opsional `save?: (input: { appointmentId: string; entries: unknown }) => Promise<ActionResult<void>>` (bawaan `saveFoodRecallByStaff`) dan `customerLink?: boolean` (bawaan `true`)

- [ ] **Step 1: Tes unit yang gagal**

```ts
// tests/unit/nurse.test.ts
const now = new Date("2026-10-20T03:00:00Z"); // 11.00 WITA
it("hanya booking klinik hari ini yang Hadir", () => {
  const base = { status: "HADIR", channel: "KLINIK" as const, startAt: new Date("2026-10-20T02:00:00Z") };
  expect(nurseCanWork(base, now)).toBe(true);
  expect(nurseCanWork({ ...base, status: "SELESAI" }, now)).toBe(false);
  expect(nurseCanWork({ ...base, channel: "ONLINE" }, now)).toBe(false);
  expect(nurseCanWork({ ...base, startAt: new Date("2026-10-19T02:00:00Z") }, now)).toBe(false);
  expect(nurseCanWork({ ...base, startAt: new Date("2026-10-19T16:30:00Z") }, now)).toBe(true); // 00.30 WITA 20 Okt
});
// tests/unit/food-recall.test.ts
it("baris tanpa tanda dari perawat bertanda PERAWAT; tanda lama dipertahankan", () => {
  const r = validateStaffEntries([{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" }, { hour: 9, kind: "OLAHRAGA", text: "Jalan" }], "PERAWAT");
  expect(r.ok && r.entries.map((e) => e.by)).toEqual(["CUSTOMER", "PERAWAT"]);
});
it("baris tabel membawa penulis", () => {
  expect(foodRecallRows([{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "PERAWAT" }])[1].entries[0].by).toBe("PERAWAT");
  expect(FOOD_RECALL_AUTHOR_LABEL).toEqual({ CUSTOMER: "pasien", DOKTER: "dokter", PERAWAT: "perawat" });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal.** Run: `npm test -- tests/unit/nurse.test.ts tests/unit/food-recall.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementasi.**
  - `nurseCanWork` memakai `witaDateString`.
  - Penulis dan label food recall di `food-recall.ts`.
  - `food-recall-table.tsx` menampilkan lencana `FOOD_RECALL_AUTHOR_LABEL[entry.by]` untuk **setiap** baris. Warnanya: dokter `info`, perawat `success`, pasien `text.secondary`.

- [ ] **Step 4: Tes integrasi yang gagal** (`tests/integration/food-recall.test.ts`). Peran `actor` diperluas dengan `"TERAPIS"`. Kasusnya:
  - perawat menyimpan food recall untuk booking Hadir hari ini **tanpa** baris FoodRecall: baris dibuat dengan status `DIISI`, `completedByName` = nama perawat, dan entri bertanda `PERAWAT`;
  - perawat ditolak dengan `NURSE_OUT_OF_SCOPE` untuk booking kemarin, booking `SELESAI`, dan booking `ONLINE`;
  - setelah encounter final, simpanan perawat menghasilkan `LOCKED`;
  - Dokter memanggil `saveFoodRecallByNurse` dan ditolak (`forbidden: nurse:work`);
  - Super Admin memanggil `saveFoodRecallByNurse`: baris barunya bertanda `PERAWAT`;
  - link customer tertutup setelah simpanan perawat (memakai pemeriksaan kiriman customer yang sudah ada).

- [ ] **Step 5: Implementasi `saveFoodRecallByNurse`.**
  - Isi `saveFoodRecallByStaff` dipindah ke fungsi lokal `saveStaffFoodRecall(actor, input, author)`. Aksi dokter memanggilnya dengan `"DOKTER"` setelah `requireCapability("record:write")`.
  - Aksi perawat memanggil `requireCapability("nurse:work")`, memeriksa `nurseCanWork(booking, new Date())` (UserFacingError `NURSE_OUT_OF_SCOPE`), lalu memanggil fungsi lokal dengan `"PERAWAT"`. Audit memakai action `"food-recall.nurse"`.
  - `loadBooking` perlu memuat `channel` dan `startAt` bila belum.
  - Revalidasi: tambahkan `/admin/perawat/${appointmentId}` dan `/admin`.

- [ ] **Step 6: Prop tab.**
  - `EncounterFoodRecallTab` memakai `save` bila diberikan.
  - Bila `customerLink === false`: sembunyikan "Buka QR dan link" dan "Tawarkan sekarang". Pada state `NOT_OFFERED`, tampilkan "Belum ada food recall." dan tombol **Isi food recall** yang membuka penyunting kosong.
  - Tes komponen yang sudah ada untuk tab ini harus tetap lulus.

- [ ] **Step 7: Jalankan.** Run: `npm test` dan `npm run test:integration -- tests/integration/food-recall.test.ts`. Expected: PASS.

- [ ] **Step 8: Commit** — `feat: nurses record food recall for today's checked-in patients`.

---

### Task 3: BIA oleh perawat

**Files:**
- Modify: `src/lib/bia.ts` (`biaAccess`), `src/server/session.ts` (`requireAnyCapability`), `src/server/bia-actions.ts`, `src/server/bia-read.ts`, `src/app/(admin)/admin/bia/berkas/[id]/route.ts`
- Test: `tests/unit/bia.test.ts`, `tests/integration/bia-actions.test.ts`, `tests/integration/bia-routes.test.ts`, `tests/integration/bia-read.test.ts`

**Interfaces:**
- Consumes: `nurseCanWork`, `NURSE_OUT_OF_SCOPE` (Task 2).
- Produces:
  - `requireAnyCapability(...capabilities: Capability[]): Promise<CurrentStaff>` di `src/server/session.ts`;
  - `getBiaForNurse(appointmentId: string, now?: Date): Promise<BiaVisitView | null>`, yang mengembalikan `null` di luar batas, dengan `points: []`;
  - `findBiaFileForViewer` juga mengembalikan `appointment: { status: string; channel: "KLINIK" | "ONLINE"; startAt: Date }`.

- [ ] **Step 1: Tes unit yang gagal**

```ts
// tests/unit/bia.test.ts
it("Perawat mengisi angka dan mengunggah saat Hadir, tidak membatalkan, tidak saat Selesai", () => {
  expect(biaAccess("TERAPIS", { status: "HADIR", channel: "KLINIK" })).toMatchObject({ upload: true, editNumbers: true, voidAny: false, view: false });
  expect(biaAccess("TERAPIS", { status: "SELESAI", channel: "KLINIK" }).editNumbers).toBe(false);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal.** `npm test -- tests/unit/bia.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementasi `biaAccess`:** saat HADIR, `editNumbers: clinical || can(role, "nurse:work")`. Bagian lain tidak berubah.

- [ ] **Step 4: Tes integrasi yang gagal.** Mock session di berkas-berkas ini harus menambahkan `requireAnyCapability` (meniru `requireCapability` untuk salah satu kemampuan).
  - `bia-actions.test.ts`:
    - Perawat menjalankan `startBiaMeasurement` lalu `saveBiaNumbers`, dan `numbersByName` = nama perawat;
    - Perawat ditolak `NURSE_OUT_OF_SCOPE` untuk booking kemarin;
    - Perawat ditolak `voidBiaMeasurement` (`forbidden`).
  - `bia-routes.test.ts`:
    - Perawat bisa membuka berkas booking Hadir hari ini (200);
    - Perawat ditolak (403) untuk booking kemarin, booking `SELESAI`, dan konsultasi online;
    - Resepsionis tetap 403.
  - `bia-read.test.ts`:
    - `getBiaForNurse` mengembalikan pengukuran aktif kunjungan ini dengan `points` kosong walau pasien punya BIA lama;
    - `getBiaForNurse` mengembalikan `null` di luar batas.

- [ ] **Step 5: Implementasi.**
  - `startBiaMeasurement` dan `saveBiaNumbers` memakai `requireAnyCapability("record:write", "nurse:work")`. Bila aktor tidak memegang `record:write`, periksa `nurseCanWork({ status, channel, startAt }, new Date())`; `select` harus memuat `startAt`.
  - Rute berkas: izinkan bila `record:read`, **atau** bila `nurse:work` dan `nurseCanWork(file.appointment, new Date())`.
  - `getBiaForNurse` memakai `requireCapability("nurse:work")` dan `biaAccess(staff.role, …)`.
  - Unggah tetap mengikuti aturan `bia:upload` yang ada, sama dengan resepsionis: Hadir dan klinik.

- [ ] **Step 6: Jalankan.** `npm test` dan `npm run test:integration -- tests/integration/bia-actions.test.ts tests/integration/bia-routes.test.ts tests/integration/bia-read.test.ts tests/integration/bia-upload.test.ts`. Expected: PASS.

- [ ] **Step 7: Commit** — `feat: nurses enter BIA numbers and open BIA files for today's patients`.

---

### Task 4: Dasbor Perawat dan halaman Tangani

**Files:**
- Create: `src/server/nurse.ts`, `src/components/admin/nurse/nurse-worklist.tsx`, `src/components/admin/nurse/nurse-visit.tsx`, `src/app/(admin)/admin/perawat/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/page.tsx` (kotak perawat)
- Test: `tests/integration/nurse.test.ts` (baru), `tests/unit/components/nurse-worklist.test.tsx` (baru)

**Interfaces:**
- Consumes: `nurseCanWork`, `NURSE_OUT_OF_SCOPE`, `saveFoodRecallByNurse`, `EncounterFoodRecallTab` (props `save`, `customerLink`), `getBiaForNurse`, `BiaTab`, `foodRecallView`.
- Produces:

```ts
export type NurseWorklistRow = {
  appointmentId: string; startAt: Date; patientName: string; patientRecordNumber: string;
  serviceName: string; staffName: string; branchName: string;
  foodRecall: "BELUM" | "TERISI"; bia: "BELUM" | "BERKAS" | "ANGKA";
};
export type NurseVisit = {
  appointmentId: string; code: string; startAt: Date; serviceName: string; staffName: string; branchName: string;
  patient: { name: string; medicalRecordNumber: string; allergies: string | null };
  foodRecall: FoodRecallView; bia: BiaVisitView;
};
export async function listNurseWorklist(now?: Date): Promise<NurseWorklistRow[]>;
export async function getNurseVisit(appointmentId: string, now?: Date): Promise<NurseVisit | null>;
```

Aturan status kolom:
- `foodRecall`: TERISI bila `FoodRecall.status === "DIISI"`.
- `bia`: ANGKA bila pengukuran aktif punya `numbersAt`; BERKAS bila ada pengukuran aktif dengan berkas yang tidak dibatalkan; selain itu BELUM.

- [ ] **Step 1: Tes integrasi yang gagal** (`tests/integration/nurse.test.ts`, mock session TERAPIS):
  - `listNurseWorklist` hanya memuat booking klinik Hadir hari ini, urut jam. Booking kemarin, Selesai, Terkonfirmasi, dan online tidak ikut.
  - Kolom status berubah setelah `saveFoodRecallByNurse` dan `saveBiaNumbers`.
  - `getNurseVisit` mengembalikan `patient.allergies` dan tidak punya properti lain di luar `NurseVisit`. Uji dengan `Object.keys` pada `patient` hasilnya `["name", "medicalRecordNumber", "allergies"]`.
  - `getNurseVisit` mengembalikan `null` di luar batas.
  - Dokter memanggil keduanya dan ditolak `forbidden: nurse:work`.

- [ ] **Step 2: Jalankan dan pastikan gagal.** `npm run test:integration -- tests/integration/nurse.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementasi `src/server/nurse.ts`.** Keduanya memanggil `requireCapability("nurse:work")`. Kueri `startAt` memakai rentang hari WITA dengan cara yang sama seperti `listDoctorWorklist`, ditambah `channel: "KLINIK"` dan `status: "HADIR"`. `foodRecall` dibangun dengan `foodRecallView(appointment, row)`. Tanpa audit baca (mengikuti daftar dokter).

- [ ] **Step 4: Tes komponen yang gagal** (`tests/unit/components/nurse-worklist.test.tsx`):
  - judul region "Pasien hari ini";
  - satu baris per pasien, lengkap dengan jam, nama + No. RM, layanan, tenaga, lencana `belum` / `terisi` dan `belum` / `berkas` / `angka`;
  - tautan **Tangani** ke `/admin/perawat/{appointmentId}`;
  - teks kosong "Belum ada pasien yang check-in hari ini."

- [ ] **Step 5: Implementasi UI.**
  - `NurseWorklistView` memakai `SectionCard` seperti `DoctorWorklistView`.
  - Dasbor menambah `can(staff.role, "nurse:work") ? settle(listNurseWorklist(), "pasien perawat") : null` dan merendernya.
  - Halaman `/admin/perawat/[id]`:
    - `getNurseVisit(id)` mengembalikan null: tampilkan `NURSE_OUT_OF_SCOPE` dan tautan kembali ke Dasbor;
    - selain itu `NurseVisitView` menampilkan kepala (nama, No. RM, jam, layanan, tenaga, cabang), lalu kotak **Peringatan** bila `allergies` terisi;
    - `EncounterFoodRecallTab` dengan `save={saveFoodRecallByNurse}`, `customerLink={false}`, dan `editable={true}`;
    - `BiaTab` dengan `bia={visit.bia}`.

    Tidak ada tab lain.

- [ ] **Step 6: Jalankan.** `npm test`, `npm run test:integration -- tests/integration/nurse.test.ts`, `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 7: Commit** — `feat: nurse dashboard and the Tangani page for food recall and BIA`.

---

### Task 5: Pemberitahuan check-in

**Files:**
- Modify: `src/lib/live-events.ts`, `src/server/live-events.ts`
- Test: `tests/unit/live-events.test.ts`, `tests/integration/live-events.test.ts`

**Interfaces:**
- Consumes: `checkin:notify` (Task 1).
- Produces:
  - `LiveEventKind` bertambah `"PASIEN_CHECKIN"`;
  - `LiveEvent` bertambah `serviceName?: string` dan `startLabel?: string` ("11.00");
  - `entityId` = id booking.

- [ ] **Step 1: Tes unit yang gagal**

```ts
it("Perawat mengawasi check-in; Super Admin dan resepsionis tidak", () => {
  expect(watchedKinds("TERAPIS")).toEqual(["PASIEN_CHECKIN"]);
  expect(watchedKinds("SUPER_ADMIN")).not.toContain("PASIEN_CHECKIN");
  expect(watchedKinds("RESEPSIONIS")).not.toContain("PASIEN_CHECKIN");
});
it("pesan dan tujuan check-in", () => {
  const e = { id: "x", kind: "PASIEN_CHECKIN" as const, patientName: "Mario Sului", at: "", entityId: "a1", serviceName: "Konsultasi gizi", startLabel: "11.00" };
  expect(eventMessage(e, "TERAPIS")).toEqual({ title: "Pasien check-in: Mario Sului", description: "Konsultasi gizi · 11.00" });
  expect(eventHref(e, "TERAPIS")).toBe("/admin/perawat/a1");
});
```

Tes lama "Dokter, Admin Keuangan, dan Terapis tidak mengawasi apa pun" diubah: Terapis tidak lagi termasuk.

- [ ] **Step 2: Jalankan dan pastikan gagal.** `npm test -- tests/unit/live-events.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementasi pure** di `src/lib/live-events.ts`.

- [ ] **Step 4: Tes integrasi yang gagal** (`tests/integration/live-events.test.ts`):
  - booking klinik dengan `checkedInAt` di dalam rentang menghasilkan satu peristiwa `PASIEN_CHECKIN` untuk TERAPIS, dengan `serviceName` dan `startLabel` dalam WITA;
  - booking online dan `checkedInAt` di luar rentang tidak menghasilkan peristiwa;
  - RESEPSIONIS tidak menerimanya.

- [ ] **Step 5: Implementasi** di `liveEventsFor`:
  - kueri `prisma.appointment.findMany({ where: { checkedInAt: range, channel: "KLINIK" }, orderBy: { checkedInAt: "asc" }, take: LIMIT })`;
  - id peristiwa `PASIEN_CHECKIN:${id}:${checkedInAt.getTime()}`;
  - `startLabel` dari `minutesToTimeLabel(witaMinutesOfDay(startAt))`.

  Notifier sudah memanggil `router.refresh()`, jadi daftar perawat ikut segar.

- [ ] **Step 6: Jalankan.** `npm test` dan `npm run test:integration -- tests/integration/live-events.test.ts`. Expected: PASS.

- [ ] **Step 7: Commit** — `feat: notify nurses when a patient checks in`.

---

### Task 6: E2E alur perawat + penyesuaian uji lama

**Files:**
- Modify: `tests/e2e/credentials.ts` (`E2E_PERAWAT`), `tests/e2e/prepare-db.mts` (`ensureAccount(E2E_PERAWAT, "perawat-e2e", "TERAPIS")`; tipe peran diperluas)
- Create: `tests/e2e/perawat.spec.ts`
- Modify: E2E lama yang menyebut "Terapis" (cari dengan `grep -rn "Terapis" tests/e2e`)

- [ ] **Step 1: Tulis `perawat.spec.ts`.** Ikuti pola `check-in.spec.ts` (booking fixture Terkonfirmasi hari ini).
  1. Perawat masuk, dan menu kiri hanya berisi "Dasbor".
  2. Di konteks lain, resepsionis menekan **Check-in** tanpa food recall.
  3. Perawat melihat teks `/^Pasien check-in: /` dalam 40 detik tanpa muat ulang. Barisnya muncul di region "Pasien hari ini", lalu perawat menekan **Tangani**.
  4. Perawat menekan **Isi food recall**, mengisi satu baris, lalu **Simpan**, dan melihat "Food recall disimpan."
  5. Perawat menekan **Isi angka tanpa berkas**, mengisi `Lemak tubuh (%)` 28,5, lalu **Simpan angka BIA**, dan melihat "Angka BIA tersimpan."
  6. Dokter (E2E_ADMIN) membuka kunjungan dan melihat lencana "perawat" di tab Food recall serta "angka oleh Perawat E2E" di tab BIA. Lalu dokter memfinalkan.
  7. Halaman `/admin/perawat/{id}` milik perawat sekarang menampilkan "Pasien ini tidak sedang ditangani hari ini."
  8. Perawat membuka `/admin/tagihan` dan mendapat 403.

- [ ] **Step 2: Jalankan.** `npm run test:e2e -- tests/e2e/perawat.spec.ts`. Expected: PASS di desktop dan ponsel.

- [ ] **Step 3: Jalankan seluruh suite.** `npm run lint && npx tsc --noEmit && npm test && npm run test:integration && npm run test:e2e`. Expected: semua PASS. Perbaiki uji lama yang menyebut label "Terapis".

- [ ] **Step 4: Commit** — `test: e2e for the nurse flow from check-in to doctor`.

---

### Task 7: Rilis, data, dan buku panduan (setelah pemilik setuju)

- [ ] **Step 1:** PR ke `main`, lalu tinjauan cabang penuh, lalu merge.
- [ ] **Step 2:** Rilis memakai `ssh sundy 'sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh'`, lalu jalankan `bash scripts/server/cek-situs.sh https://sundyclinic.com`. Bila build kehabisan memori, pakai `NODE_OPTIONS=--max-old-space-size=1536`, sesuai catatan rilis sebelumnya.
- [ ] **Step 3:** Ganti nama staf di server: `UPDATE "Staff" SET name = 'Perawat SunDY Mahakeret', "updatedAt" = now() WHERE slug = 'terapis-mahakeret';` beserta baris AuditLog `staff.update`, seperti cara penonaktifan akun demo.
- [ ] **Step 4:** Buku panduan (Claude Docs):
  - Terapis diganti Perawat;
  - tabel peran diperbarui;
  - bagian baru "Panduan Perawat";
  - diagram alur bagian 3 diperbarui;
  - daftar isi diperbarui.
- [ ] **Step 5:** Buat ulang PDF bergaya (skrip `pdfbuild`) dan simpan ke `~/Downloads/Buku Panduan Sistem Klinik SunDY.pdf`.
