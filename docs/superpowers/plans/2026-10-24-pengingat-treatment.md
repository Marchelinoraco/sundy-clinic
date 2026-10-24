# Pengingat Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasien yang treatment muncul di halaman Pengingat saat waktunya treatment lagi (jarak diatur per layanan), resepsionis mengirim WhatsApp per pasien, dan tab "Pasien treatment" memungkinkan kirim ulang kapan saja.

**Architecture:** Jarak pengingat disimpan di `Service.returnReminderDays` (kosong = tidak diingatkan). Kunjungan treatment terbaru tiap pasien dihitung dari tagihan FINAL yang barisnya terhubung ke layanan berjarak; kotak 5 dan tab membaca hasil yang sama lewat satu modul server. Setiap Kirim dicatat di tabel `TreatmentReminder`.

**Tech Stack:** Next.js 15 server actions, Prisma 7 + PostgreSQL (migrasi SQL manual), MUI, Vitest (unit + integrasi), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-pengingat-treatment-design.md`

## Global Constraints

- **Pilihan jarak (hari):** `RETURN_INTERVALS = [7, 14, 21, 30, 60, 90, 180]`; label pilihan: "1 minggu", "2 minggu", "3 minggu", "1 bulan", "2 bulan", "3 bulan", "6 bulan"; kosong = "Tidak diingatkan". "1 bulan" = 30 hari (keputusan rencana).
- **Frasa pesan:** 7 "setiap minggu", 14 "setiap 2 minggu", 21 "setiap 3 minggu", 30 "setiap bulan", 60 "setiap 2 bulan", 90 "setiap 3 bulan", 180 "setiap 6 bulan".
- **Nilai awal:** 7 hari untuk semua layanan, kecuali slug `konsultasi-dokter`, `konsultasi-online`, `timbang-bia`, `meal-plan` (kosong). Layanan baru dibuat kosong. Mengubah jarak: `catalog:manage`. Halaman Pengingat: `booking:manage`.
- **Isi pesan (persis):** `Halo {firstName}, terima kasih sudah melakukan {treatments} di SunDY Clinic pada {formatIndonesianDate(tanggal)}. Agar hasilnya maksimal, treatment ini sebaiknya dilakukan {frasa}. Yuk jadwalkan kunjungan berikutnya — balas pesan ini untuk memilih waktu. SunDY Clinic` — {treatments}: "A", "A dan B", "A, B, dan C".
- **Treatment:** baris tagihan `FINAL` dengan `serviceId` yang layanannya punya `returnReminderDays` (jenis baris Layanan maupun Treatment). Baris bebas, Barang, Paket, dan tagihan batal tidak dihitung. Jarak dibaca dari pengaturan layanan saat ini.
- **Tanggal treatment:** tanggal WITA `appointment.startAt` bila tagihan punya booking, selain itu tanggal WITA `finalizedAt`. Satu kunjungan = satu tanggal per pasien; beberapa treatment di tanggal itu = satu baris, jarak terpendek.
- **Kotak 5:** judul "5 · Waktunya treatment lagi — ajak kembali". Baris tampil bila `jatuhTempo = tanggal + jarak` dan `jatuhTempo ≤ hari ini ≤ jatuhTempo + 6` (`RETURN_WINDOW_DAYS = 7`, keputusan rencana); "terlewat" bila hari ini > jatuh tempo. Baris yang sudah dikirim untuk tanggal treatment itu tetap tampil dengan "Sudah diingatkan · {jam} oleh {nama}" sampai jendelanya habis.
- **Tidak masuk kotak 5:** booking berikutnya (status Menunggu konfirmasi/Terkonfirmasi/Hadir, mulai ≥ awal hari ini WITA); booking Hadir/Selesai sesudah tanggal treatment; paket `AKTIF` dengan `nextVisitOn` dan `expiresOn ≥ hari ini`; pasien rangkap (`mergedIntoId` terisi).
- **Tab:** label "Pasien treatment" (`/admin/pengingat?tab=pasien-treatment`); tab lain "Hari ini". Tanda: "punya booking {tanggal}", "paket aktif · kunjungan berikutnya {tanggal}", "sudah datang lagi {tanggal}". Tombol "Kirim" (belum pernah) / "Kirim lagi". Saringan `lebih` = 1, 2, 4, 8 (minggu; "Treatment terakhir lebih dari {n} minggu lalu"); 50 baris per halaman, tanggal treatment terbaru dulu.
- **Tanpa WA sah:** "Nomor WhatsApp pasien tidak dikenali." tanpa tombol.
- **Angka menu Pengingat** ikut menghitung baris kotak 5 yang belum dikirim.

## Review Focus

1. **Pasien datang lagi hanya untuk konsultasi** sesudah treatment → tidak diajak lagi (booking Hadir sesudah tanggal treatment). Tes: Task 2.
2. **Jarak layanan diubah sesudah treatment** (1 → 2 minggu, atau menjadi "Tidak diingatkan") → jatuh tempo mengikuti pengaturan baru; baris hilang bila tidak diingatkan. Tes: Task 2.
3. **Kirim ditekan dua kali** → tetap satu baris "Sudah diingatkan"; tab menunjukkan kiriman terakhir. Tes: Task 2.
4. **Kunjungan 23.30 WITA** → tanggal treatment hari itu (WITA), bukan tanggal UTC. Tes: Task 2.
5. **Nomor WA tidak sah** → baris tetap tampil tanpa tombol, di kotak 5 dan di tab. Tes: Task 2 dan 3.

---

### Task 1: Jarak pengingat per layanan

**Files:**
- Modify: `prisma/schema.prisma` (`Service.returnReminderDays Int?`; model `TreatmentReminder`; back-relation `Patient.treatmentReminders`)
- Create: `prisma/migrations/20261026090000_pengingat_treatment/migration.sql`
- Modify: `prisma/seed.ts` (nilai awal di `create` layanan)
- Create: `src/lib/treatment-reminder.ts`
- Modify: `src/server/service-admin.ts`, `src/server/catalog-admin-read.ts` (`InternalServiceRow.returnReminderDays`), `src/components/admin/service-price-table.tsx` (kolom "Ingatkan kembali"), `src/lib/audit-labels.ts` (`"service.reminder": "mengubah jarak pengingat layanan"`)
- Test: `tests/unit/treatment-reminder.test.ts`, `tests/integration/service-reminder.test.ts`, `tests/unit/components/service-price-table.test.tsx`

**Interfaces:**
- Produces:
  - `RETURN_INTERVALS: readonly number[]`, `isReturnInterval(value: unknown): value is number`, `returnIntervalLabel(days: number | null): string`, `returnIntervalPhrase(days: number): string` di `src/lib/treatment-reminder.ts`
  - `setServiceReturnReminder(input: { serviceId: string; days: number | null }): Promise<ActionResult<void>>` di `src/server/service-admin.ts`
  - Tabel `TreatmentReminder { id, patientId → Patient (Cascade), treatmentOn @db.Date, sentAt default now, staffId, staffName }`, `@@index([patientId, sentAt])`

- [ ] **Step 1: Write the failing tests:**
  - Unit: `returnIntervalLabel(null) === "Tidak diingatkan"`, `returnIntervalLabel(30) === "1 bulan"`; `returnIntervalPhrase(7) === "setiap minggu"`, `(30) "setiap bulan"`, `(180) "setiap 6 bulan"`; `isReturnInterval(10) === false`.
  - Integrasi `"Admin Keuangan mengatur jarak; nilai di luar pilihan ditolak; Resepsionis tidak boleh"`: set 14 → tersimpan + audit `service.reminder`; set `null` → kosong; 10 → "Pilih jarak pengingat."; RESEPSIONIS → `forbidden: catalog:manage`.
  - Komponen: baris layanan punya pilihan berlabel `Ingatkan kembali {nama layanan}` dengan nilai sekarang; mengganti ke "2 minggu" memanggil `setServiceReturnReminder({ serviceId, days: 14 })`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/treatment-reminder.test.ts tests/unit/components/service-price-table.test.tsx` dan `npm run test:integration -- tests/integration/service-reminder.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Migrasi: `ALTER TABLE "Service" ADD COLUMN "returnReminderDays" INTEGER` + CHECK `service_return_reminder_days` (`IS NULL OR IN (7,14,21,30,60,90,180)`), `UPDATE "Service" SET "returnReminderDays" = 7 WHERE "slug" NOT IN ('konsultasi-dokter','konsultasi-online','timbang-bia','meal-plan')`, lalu tabel `TreatmentReminder` sesuai `migrate diff`. Seed: nilai awal yang sama di `create` saja. Pilihan di tabel menyimpan langsung saat diganti (toast galat bila gagal).
- [ ] **Step 4: Run** the tests + `migrate diff` (kosong) + `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: return reminder interval per service`

### Task 2: Kotak 5 "Waktunya treatment lagi"

**Files:**
- Modify: `src/lib/treatment-reminder.ts` (`treatmentNamesLabel`, `treatmentReminderMessage`, `RETURN_WINDOW_DAYS`)
- Create: `src/server/treatment-visits.ts` (modul biasa, tanpa `"use server"`), `src/server/treatment-reminder.ts` (`"use server"`), `src/components/admin/treatment-reminder-send-button.tsx`
- Modify: `src/server/reminder.ts` (`ReminderWorklist.treatmentReturns`, `countReminderWork`), `src/components/admin/reminder-worklist.tsx` (kotak 5)
- Test: `tests/unit/treatment-reminder.test.ts`, `tests/integration/treatment-reminder.test.ts`, `tests/unit/reminder-worklist.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `treatmentNamesLabel(names: string[]): string`; `treatmentReminderMessage(input: { patientName: string; treatments: string[]; treatmentOn: string; intervalDays: number }): string`
  - `type TreatmentVisit = { patientId: string; patientName: string; medicalRecordNumber: string; whatsapp: string; treatmentOn: string; treatments: string[]; intervalDays: number }`
  - `latestTreatmentVisits(db: Db, filter?: { patientIds?: string[] }): Promise<TreatmentVisit[]>` — satu per pasien, kunjungan terbaru
  - `returnFlags(db: Db, visits: TreatmentVisit[], today: string): Promise<Map<string, { upcomingBookingOn: string | null; packageVisitOn: string | null; cameBackOn: string | null }>>`
  - `lastTreatmentReminders(db: Db, patientIds: string[]): Promise<Map<string, { treatmentOn: string; sentAt: Date; staffName: string }>>`
  - `type TreatmentReturnRow = { patientId; patientName; treatments: string; treatmentOn: string; intervalDays: number; dueOn: string; overdue: boolean; message: WhatsAppMessage; sent: { sentAt: Date; sentByName: string } | null }`
  - `recordTreatmentReminder(input: { patientId: string; treatmentOn: string }): Promise<ActionResult<void>>` (`booking:manage`; tanggal bukan YYYY-MM-DD → "Tanggal treatment tidak sah."; pasien tidak ada → "Pasien tidak ditemukan.")

- [ ] **Step 1: Write the failing tests:**
  - Unit: pesan persis Global Constraints untuk `{ patientName: "Rina Wulandari", treatments: ["Facial Brightening"], treatmentOn: "2026-10-17", intervalDays: 7 }`; `treatmentNamesLabel(["A","B","C"]) === "A, B, dan C"`.
  - Integrasi (data relatif terhadap hari ini, satu dunia tagihan):
    - `"muncul pada tanggal treatment + jarak, selama 7 hari, lalu hilang; belum waktunya tidak tampil (PT6)"`
    - `"layanan yang dibooking (baris Layanan) dihitung; layanan Tidak diingatkan, baris bebas, dan tagihan batal tidak (PT4)"`
    - `"dua treatment satu kunjungan: satu baris, jarak terpendek, pesan menyebut keduanya (PT7)"`
    - `"treatment lebih baru menggantikan yang lama (PT7)"`
    - `"tidak masuk bila punya booking berikutnya, sudah datang lagi (termasuk hanya konsultasi), punya paket aktif berjadwal, atau pasien rangkap; sesi dari paket yang sudah selesai tetap dihitung (PT9, Review Focus 1)"`
    - `"jarak diubah sesudah treatment: jatuh tempo mengikuti pengaturan baru; Tidak diingatkan menghapus barisnya (Review Focus 2)"`
    - `"Kirim tercatat sekali per tekan; baris menjadi Sudah diingatkan; angka menu berkurang (PT12, PT13, Review Focus 3)"`
    - `"kunjungan 23.30 WITA memakai tanggal WITA (Review Focus 4)"`
    - `"nomor WA tidak sah: baris tanpa tautan (PT14, Review Focus 5)"`
  - Komponen: kotak 5 menampilkan "Rina Wulandari · Facial Brightening · {tanggal} · tiap 1 minggu", tautan "Kirim" ke wa.me, dan "Sudah diingatkan · … oleh Mey" bila terkirim.
- [ ] **Step 2: Run** `npm run test:integration -- tests/integration/treatment-reminder.test.ts` dan unit. Expected: FAIL.
- [ ] **Step 3: Implement.** `latestTreatmentVisits` membaca tagihan FINAL yang punya baris berlayanan berjarak (pasien `mergedIntoId: null`), mengelompokkan per pasien dan tanggal treatment (Global Constraints), dan mengambil tanggal terbaru. `loadTreatmentReturnWork(now)` di `reminder.ts` memakai ketiga fungsi baca, menyaring jendela dan pengecualian, mengurutkan yang belum dikirim dulu lalu yang terlewat. Tombol Kirim: tautan wa.me (`target="_blank"`) yang memanggil `recordTreatmentReminder` saat ditekan, seperti `PackageReminderSendButton`.
- [ ] **Step 4: Run** the tests + `tests/integration/package-reminder.test.ts` + `tests/unit/reminder-worklist.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: treatment return reminders on the Pengingat page`

### Task 3: Tab "Pasien treatment"

**Files:**
- Create: `src/server/treatment-patients-read.ts`, `src/components/admin/treatment-patient-table.tsx`
- Modify: `src/app/(admin)/admin/pengingat/page.tsx` (tab "Hari ini" / "Pasien treatment", pencarian `cari`, saringan `lebih`, halaman `hal`)
- Test: `tests/integration/treatment-patients-read.test.ts`, `tests/unit/components/treatment-patient-table.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`latestTreatmentVisits`, `returnFlags`, `lastTreatmentReminders`, `treatmentReminderMessage`, `TreatmentReminderSendButton`).
- Produces: `listTreatmentPatients(filter: { q?: string; olderThanWeeks?: number; page?: number }): Promise<{ rows: TreatmentPatientRow[]; total: number; page: number; pageSize: 50 }>` dengan `TreatmentPatientRow = { patientId; patientName; medicalRecordNumber; treatments: string; treatmentOn: string; intervalDays: number; lastReminder: { sentAt: Date; staffName: string } | null; markers: string[]; message: WhatsAppMessage }`.

- [ ] **Step 1: Write the failing tests:**
  - Integrasi: `"semua pasien yang pernah treatment, terbaru dulu; cari nama atau treatment; saringan lebih dari n minggu; 50 per halaman (PT10)"`; `"tanda booking, paket aktif, dan sudah datang lagi; tetap bisa dikirimi; terakhir diingatkan dari catatan (PT10, PT12)"`; `"Resepsionis boleh, Admin Keuangan tidak (booking:manage)"`.
  - Komponen: kolom Pasien, Treatment terakhir, Tanggal, Terakhir diingatkan ("10 Okt · Mey" atau "—"); tombol "Kirim" bila belum pernah, "Kirim lagi" bila sudah; tanda tampil di bawah nama; tanpa WA → "Nomor WhatsApp pasien tidak dikenali." (Review Focus 5); kosong → "Belum ada pasien treatment."
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Pencarian tanpa membedakan huruf besar pada nama pasien dan nama treatment; saringan membandingkan tanggal treatment dengan hari ini − n×7.
- [ ] **Step 4: Run** them + `npx tsc --noEmit` + `npx eslint src tests --quiet`. Expected: PASS / clean.
- [ ] **Step 5: Commit** `feat: treatment patients tab for repeat reminders`

### Task 4: E2E dan verifikasi

**Files:**
- Modify: `tests/e2e/prepare-db.mts` (per proyek satu pasien dengan kunjungan Hadir 7 hari lalu pukul 19.00/19.30 dan tagihan FINAL berisi Relaxing Facial; set `returnReminderDays = 7` untuk Relaxing Facial dan Facial Acne di awal supaya putaran sebelumnya tidak berpengaruh)
- Create: `tests/e2e/pengingat-treatment.spec.ts`
- Modify: spec yang terdampak kolom/tab baru (cari dengan menjalankan `pengingat.spec.ts`, `layanan-situs.spec.ts`, `harga-modal.spec.ts`, `durasi-konsultasi.spec.ts`, `tampilan-admin.spec.ts`, `paket.spec.ts`)

- [ ] **Step 1:** Spec: Resepsionis membuka Pengingat → kotak 5 memuat pasien itu dengan tautan "Kirim" berisi "setiap minggu" → klik (popup ditutup) → "Sudah diingatkan"; tab "Pasien treatment" memuat pasien dengan "Kirim lagi" dan terakhir diingatkan oleh Resepsionis E2E; Admin Keuangan mengganti jarak Facial Acne ke "2 minggu" di Layanan & Harga dan nilainya bertahan setelah muat ulang.
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npx eslint src tests --quiet`, lalu `caffeinate -i npx playwright test tests/e2e/pengingat-treatment.spec.ts tests/e2e/pengingat.spec.ts tests/e2e/paket.spec.ts tests/e2e/layanan-situs.spec.ts tests/e2e/harga-modal.spec.ts tests/e2e/durasi-konsultasi.spec.ts tests/e2e/tampilan-admin.spec.ts --workers=1`. Expected: PASS.
- [ ] **Step 3:** Reset DB uji (`prepare-db.mts`), lalu `npm run test:integration` → hanya `schedule.test.ts` (3) yang gagal; `npx vitest run` → semua lulus.
- [ ] **Step 4: Commit** `test: treatment return reminders end to end`
