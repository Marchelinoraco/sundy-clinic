# Plan — UI Panel Admin Bagian C1: Booking WA/Telepon dan Menemukan Booking Lagi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin mencatat booking WA/telepon di satu halaman: memilih pasien, melihat hari yang masih kosong di strip 14 hari, lalu mengirim instruksi transfer dengan satu klik. Booking yang belum ditransfer mudah ditemukan lagi lewat daftar "Menunggu konfirmasi", pencarian, atau sorotan dari "Lihat di daftar".

**Architecture:**
- **Aturan murni** di `src/lib`:
  - `transfer-instruction.ts`: `needsTransfer`, `transferDeadline`, `transferInstructionText`, `transferInstructionFor`, `bookingServiceName`, `pendingDeadlineLabel`;
  - `booking-actions.ts`: `bookingRowActions` (aksi terlihat dan isi menu ⋯ per baris).
- **Server:**
  - `computeAvailabilityRange` di `availability.ts` memuat seluruh rentang sekaligus (empat kueri), lalu memakai mesin `getAvailableSlots` yang sama untuk setiap hari. Dibuka ke admin lewat `getStaffAvailabilityRange` di `schedule.ts`.
  - `PatientSummary` bertambah `lastVisitAt` dan `nextBookingAt`.
  - `appointment.ts`: `listAppointments` dan daftar lain menambahkan `transferDeadline` ke setiap booking; `listPendingBookings`/`countPendingBookings` menggantikan versi khusus situs; tambahan `searchBookings` dan `getTransferInstruction`.
- **Klien:**
  - `AppointmentTable` memakai `bookingRowActions` dengan menu ⋯ (`DropdownMenu`), dan bisa menyorot satu baris.
  - `MatchPatientDialog` menjadi dialog yang dikendalikan pemanggil.
  - Booking Baru disusun ulang: langkah di kiri; `BookingSummary` dan `BookingCreatedPanel` di kanan; `DateStrip` di atas `SlotPicker`.
- **Tanpa migrasi, tanpa dependensi baru.**

**Tech Stack:** Next.js 15.5 App Router (`next/form`) · React 19 · Prisma 7.10 · Tailwind v4 · shadcn/ui (Radix) · Vitest 4 + Testing Library + user-event · Playwright

**Spec:** `docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md` (keputusan B1–B5, bagian 3–8). Aturan biaya booking (K15, K18) dan kedaluwarsa booking situs (K13) tetap mengikuti `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

**Base branch:** `desain-ui-booking` (berisi spec dan plan ini). Kerjakan di branch baru `ui-booking-admin` dari branch itu.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar. Panel admin memakai kata "pasien".
- **Zona waktu:** WITA. Tanggal ditulis dengan `src/lib/format.ts` (`formatShortIndonesianDate` → "Rab, 7 Okt"; `formatIndonesianDate` → "Rabu, 7 Oktober 2026"). Jam ditulis dengan `minutesToTimeLabel(witaMinutesOfDay(date))` → "11.30".
- **Hak akses:** semua fungsi server baru memakai `booking:manage` (resepsionis boleh). "Lihat isian" tetap hanya untuk `record:read`. Tidak ada data klinis yang ditambahkan ke objek mana pun.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (ekspor tipe boleh). Pembantu yang tidak boleh dipanggil browser (`availability.ts`, `booking-expiry.ts`) **tidak** memakai `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`, dan komponen tidak mengimpor `@/lib/db` (dijaga `tests/unit/architecture.test.ts`).
- **Batas transfer hanya tertulis** (B5): tidak ada kode yang membatalkan atau mengedaluwarsakan booking WA/telepon.
- **Biaya di pesan** diambil dari `Appointment.bookingFee`, bukan dari Pengaturan saat ini.
- **Format kode:** repo tidak memakai Prettier. Ikuti format kode di sekitarnya.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`). Jangan jalankan bersamaan dengan `npm run test:e2e`.
- **Commit** memakai Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. **Jangan pernah men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Jam direbut booking lain saat disimpan.** Pesan galat tampil, jam dikosongkan, strip dan daftar jam dimuat ulang, dan tanggal yang dipilih tetap terpilih → uji di Task 8.
2. **Admin mengubah isian atau menekan Buat Booking lagi setelah booking dibuat.** Formulir terkunci dan tombol Buat Booking hilang sampai "+ Booking baru", yang tetap mempertahankan sumber terakhir → uji di Task 8.
3. **Strip dibuka sore hari, setelah jam kerja tenaga selesai.** Hari ini "tutup", bukan "penuh". Siang hari, yang dihitung hanya jam yang belum lewat → uji di Task 2 (waktu palsu).
4. **Kotak pencarian berisi spasi saja atau angka pendek** ("12"). Spasi kembali ke tampilan per tanggal. Angka kurang dari 4 digit tidak dicocokkan ke nomor WA, sehingga hasilnya tidak membanjir → uji di Task 4.
5. **`sorot` menunjuk booking yang tidak ada di tanggal itu, atau booking yang juga tampil di "Menunggu konfirmasi".** Tidak ada galat. Hanya baris di daftar per tanggal yang disorot, tepat satu → uji di Task 5 (id tidak dikenal) dan Task 9 (e2e: tepat satu baris tersorot).

---

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/transfer-instruction.ts` (baru) | aturan dan teks instruksi transfer, nama layanan, label batas di daftar menunggu |
| `src/lib/booking-actions.ts` (baru) | `bookingRowActions` dan label aksi per baris |
| `src/server/availability.ts` | + `computeAvailabilityRange`, `DayAvailability`, `MAX_AVAILABILITY_RANGE_DAYS` |
| `src/server/schedule.ts` | + `getStaffAvailabilityRange` (`booking:manage`) |
| `src/server/patient.ts` | `PatientSummary` + `lastVisitAt`, `nextBookingAt` |
| `src/server/booking-expiry.ts` | + `transferDeadlines` (satu kueri libur untuk banyak booking) |
| `src/server/appointment.ts` | `transferDeadline` di setiap daftar; `listPendingBookings`, `countPendingBookings`, `searchBookings`, `getTransferInstruction` |
| `src/app/(admin)/admin/layout.tsx`, `src/components/admin/app-sidebar.tsx` | angka menu Booking menghitung semua booking yang menunggu |
| `src/components/admin/match-patient-dialog.tsx` | dialog dikendalikan pemanggil; kandidat dimuat saat dialog terbuka |
| `src/components/admin/appointment-table.tsx` | aksi lewat `bookingRowActions` + menu ⋯; `highlightId` |
| `src/app/(admin)/admin/booking/page.tsx` | daftar "Menunggu konfirmasi", pencarian `?cari=`, sorotan `?sorot=` |
| `src/components/admin/patient-picker.tsx` | + `PatientBookingInfo` (kunjungan terakhir, booking berikutnya) |
| `src/components/admin/date-strip.tsx` (baru) | strip 14 hari + "Pilih tanggal lain" |
| `src/components/admin/booking-summary.tsx` (baru) | sumber booking admin, `bookingSummaryItems`, `BookingSummary` |
| `src/components/admin/booking-created-panel.tsx` (baru) | panel "Booking dibuat" |
| `src/components/admin/slot-picker.tsx` | tombol jam lebih besar |
| `src/components/admin/appointment-form.tsx` | tata letak dua kolom, sumber sebagai tombol, panel setelah simpan |
| `src/app/(admin)/admin/booking/baru/page.tsx` | meneruskan biaya booking dari Pengaturan |
| `tests/e2e/admin-booking.spec.ts`, `gizi-klinik.spec.ts`, `public-registration.spec.ts` | alur baru dan aksi di menu ⋯ |

---

### Task 1: Aturan murni — instruksi transfer dan aksi per baris

**Files:**
- Create: `src/lib/transfer-instruction.ts`
- Create: `src/lib/booking-actions.ts`
- Test: `tests/unit/transfer-instruction.test.ts`, `tests/unit/booking-actions.test.ts`

**Interfaces:**
- Consumes: `confirmationDeadline(createdAt, closedDates)` dari `@/lib/confirmation-window`; `formatBankAccount`, `BankAccount`, `BookingSourceValue` dari `@/lib/payment`; `buildWhatsAppLinkTo` dari `@/lib/whatsapp`.
- Produces:
  - `TransferInstruction = { text: string; link: string | null; deadline: Date; missingBankAccount: boolean }`
  - `TRANSFER_SOURCES = ["WHATSAPP", "TELEPON"] as const`, `MISSING_BANK_ACCOUNT_LINE`
  - `needsTransfer({ source, status, bookingFee }): boolean`
  - `transferDeadline(createdAt: Date, startAt: Date, closedDates: ReadonlySet<string>): Date`
  - `transferInstructionText({ patientName, code, serviceName, startAt, staffName, branchName, fee, deadline, bankAccount: string | null }): string`
  - `bookingServiceName({ service, type }): string`
  - `TransferBooking` dan `transferInstructionFor(booking: TransferBooking, bank: BankAccount): TransferInstruction | null`
  - `pendingDeadlineLabel({ kind: "EXPIRES" | "TRANSFER"; deadline: Date; overdue: boolean }): string`
  - `BookingAction`, `BOOKING_ACTION_LABEL`, `BookingActionRow`, `bookingRowActions(row, canReadRecords): { primary: BookingAction[]; menu: BookingAction[] }`

- [ ] **Step 1: Tulis uji yang gagal untuk instruksi transfer**

`tests/unit/transfer-instruction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MISSING_BANK_ACCOUNT_LINE,
  needsTransfer,
  pendingDeadlineLabel,
  transferDeadline,
  transferInstructionFor,
  transferInstructionText,
  type TransferBooking,
} from "@/lib/transfer-instruction";

// Feb 2031: Sabtu 8, Minggu 9, Senin 10, Selasa 11, Rabu 12, Kamis 13, Senin 17.
const wita = (day: number, hour: number) => new Date(Date.UTC(2031, 1, day, hour - 8));
const FAR = wita(28, 11);
const NO_HOLIDAYS = new Set<string>();

describe("transferDeadline", () => {
  it("24 jam sejak booking dibuat pada hari kerja biasa", () => {
    expect(transferDeadline(wita(12, 12), FAR, NO_HOLIDAYS)).toEqual(wita(13, 12));
  });

  it("tidak menghitung hari Minggu", () => {
    // Sabtu 13.00: 11 jam Sabtu + 13 jam Senin.
    expect(transferDeadline(wita(8, 13), FAR, NO_HOLIDAYS)).toEqual(wita(10, 13));
  });

  it("tidak menghitung tanggal libur", () => {
    // Selasa 13.00, Rabu libur: 11 jam Selasa + 13 jam Kamis.
    expect(transferDeadline(wita(11, 13), FAR, new Set(["2031-02-12"]))).toEqual(wita(13, 13));
  });

  it("tidak pernah melewati jadwal booking itu sendiri", () => {
    expect(transferDeadline(wita(12, 12), wita(12, 17), NO_HOLIDAYS)).toEqual(wita(12, 17));
  });
});

const textInput = {
  patientName: "Maria Wenas",
  code: "SDY-7KQ2",
  serviceName: "Konsultasi Dokter",
  startAt: wita(17, 11),
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  fee: 100000,
  deadline: wita(13, 12),
  bankAccount: "BCA 1234567890 a.n. SunDY Clinic",
};

describe("transferInstructionText", () => {
  it("menyusun pesan lengkap dengan rupiah dan tanggal WITA", () => {
    expect(transferInstructionText(textInput)).toBe(
      [
        "Halo Maria Wenas, booking Anda di SunDY Clinic sudah kami catat.",
        "Kode: SDY-7KQ2",
        "Layanan: Konsultasi Dokter",
        "Jadwal: Senin, 17 Februari 2031 pukul 11.00 WITA",
        "Tenaga: dr. Diane · SunDY Mahakeret",
        "",
        "Mohon transfer biaya booking Rp 100.000 paling lambat Kamis, 13 Februari 2031 pukul 12.00 WITA ke:",
        "BCA 1234567890 a.n. SunDY Clinic",
        "lalu kirim bukti transfer di chat ini.",
        "",
        "Biaya booking terpisah dari biaya layanan dan tidak dikembalikan, tetapi tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelumnya.",
      ].join("\n"),
    );
  });

  it("menulis bahwa rekening akan dikirim bila Pengaturan belum lengkap", () => {
    const text = transferInstructionText({ ...textInput, bankAccount: null });
    expect(text).toContain(`ke:\n${MISSING_BANK_ACCOUNT_LINE}\nlalu`);
  });
});

const booking: TransferBooking = {
  code: "SDY-7KQ2",
  type: "KONSULTASI",
  startAt: wita(17, 11),
  bookingFee: 150000,
  transferDeadline: wita(13, 12),
  service: { name: "Konsultasi Dokter" },
  staff: { name: "dr. Diane" },
  branch: { name: "SunDY Mahakeret" },
  patient: { name: "Maria Wenas", whatsapp: "6281234567890" },
};
const BANK = { bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" };

describe("transferInstructionFor", () => {
  it("memakai biaya yang disalin ke booking dan menautkan WA ke nomor pasien", () => {
    const instruction = transferInstructionFor(booking, BANK)!;
    expect(instruction.text).toContain("Rp 150.000");
    expect(instruction.link).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
    expect(decodeURIComponent(instruction.link!.split("text=")[1])).toBe(instruction.text);
    expect(instruction).toMatchObject({ deadline: wita(13, 12), missingBankAccount: false });
  });

  it("menandai rekening yang belum lengkap", () => {
    const instruction = transferInstructionFor(booking, { ...BANK, bankAccountHolder: null })!;
    expect(instruction.missingBankAccount).toBe(true);
    expect(instruction.text).toContain(MISSING_BANK_ACCOUNT_LINE);
  });

  it("tanpa tautan WA bila nomor pasien tidak sah", () => {
    expect(transferInstructionFor({ ...booking, patient: { name: "Maria", whatsapp: "12" } }, BANK)!.link).toBeNull();
  });

  it("null untuk booking tanpa batas transfer, tanpa biaya, atau tanpa pasien", () => {
    expect(transferInstructionFor({ ...booking, transferDeadline: null }, BANK)).toBeNull();
    expect(transferInstructionFor({ ...booking, bookingFee: null }, BANK)).toBeNull();
    expect(transferInstructionFor({ ...booking, patient: null }, BANK)).toBeNull();
  });
});

describe("needsTransfer", () => {
  const waiting = { source: "WHATSAPP" as const, status: "MENUNGGU_KONFIRMASI", bookingFee: 100000 };

  it("booking WhatsApp dan telepon berbiaya yang belum diverifikasi", () => {
    expect(needsTransfer(waiting)).toBe(true);
    expect(needsTransfer({ ...waiting, source: "TELEPON" })).toBe(true);
  });

  it("bukan walk-in, booking situs, tanpa biaya, atau yang sudah diverifikasi", () => {
    expect(needsTransfer({ ...waiting, source: "WALK_IN" })).toBe(false);
    expect(needsTransfer({ ...waiting, source: "SITUS" })).toBe(false);
    expect(needsTransfer({ ...waiting, bookingFee: null })).toBe(false);
    expect(needsTransfer({ ...waiting, status: "TERKONFIRMASI" })).toBe(false);
  });
});

describe("pendingDeadlineLabel", () => {
  it("menulis batas kedaluwarsa booking situs dan batas transfer booking WA/telepon", () => {
    expect(pendingDeadlineLabel({ kind: "EXPIRES", deadline: wita(13, 12), overdue: false })).toBe(
      "Kedaluwarsa Kam, 13 Feb 12.00",
    );
    expect(pendingDeadlineLabel({ kind: "TRANSFER", deadline: wita(13, 12), overdue: false })).toBe(
      "Batas transfer Kam, 13 Feb 12.00",
    );
  });

  it("menulis Lewat batas transfer setelah batasnya lewat", () => {
    expect(pendingDeadlineLabel({ kind: "TRANSFER", deadline: wita(13, 12), overdue: true })).toBe(
      "Lewat batas transfer",
    );
  });
});
```

- [ ] **Step 2: Tulis uji yang gagal untuk aksi per baris**

`tests/unit/booking-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bookingRowActions, type BookingActionRow } from "@/lib/booking-actions";

const waiting: BookingActionRow = {
  status: "MENUNGGU_KONFIRMASI",
  source: "WHATSAPP",
  needsMatch: false,
  isSiteBooking: false,
  intakeId: null,
  transferInstruction: { link: "https://wa.me/6281234567890?text=x" },
  confirmation: null,
};
const site: BookingActionRow = {
  ...waiting,
  source: "SITUS",
  isSiteBooking: true,
  intakeId: "i1",
  transferInstruction: null,
};

describe("bookingRowActions (spec C1 5.2)", () => {
  it("WA/telepon menunggu: Verifikasi dan Kirim instruksi transfer, sisanya di menu", () => {
    expect(bookingRowActions(waiting, true)).toEqual({
      primary: ["VERIFY", "SEND_TRANSFER"],
      menu: ["COPY_TRANSFER", "ATTEND", "NO_SHOW", "CANCEL"],
    });
  });

  it("nomor WA tidak sah: hanya Verifikasi terlihat, instruksi tetap bisa disalin", () => {
    expect(bookingRowActions({ ...waiting, transferInstruction: { link: null } }, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["COPY_TRANSFER", "ATTEND", "NO_SHOW", "CANCEL"],
    });
  });

  it("WA/telepon tanpa biaya booking: tanpa instruksi transfer", () => {
    expect(bookingRowActions({ ...waiting, transferInstruction: null }, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["ATTEND", "NO_SHOW", "CANCEL"],
    });
  });

  it("walk-in menunggu: Hadir lebih dulu, karena pasiennya sudah di klinik", () => {
    expect(bookingRowActions({ ...waiting, source: "WALK_IN", transferInstruction: null }, true)).toEqual({
      primary: ["ATTEND", "VERIFY"],
      menu: ["NO_SHOW", "CANCEL"],
    });
  });

  it("situs belum dicocokkan: hanya Cocokkan pasien terlihat", () => {
    expect(bookingRowActions({ ...site, needsMatch: true }, true)).toEqual({
      primary: ["MATCH"],
      menu: ["VIEW_INTAKE", "CANCEL"],
    });
  });

  it("situs sudah dicocokkan: Verifikasi, dengan Ganti pasien di menu", () => {
    expect(bookingRowActions(site, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["VIEW_INTAKE", "CHANGE_PATIENT", "ATTEND", "NO_SHOW", "CANCEL"],
    });
  });

  it("terkonfirmasi: Hadir dan Kirim konfirmasi", () => {
    expect(
      bookingRowActions({ ...site, status: "TERKONFIRMASI", confirmation: { link: "https://wa.me/62812?text=x" } }, true),
    ).toEqual({
      primary: ["ATTEND", "SEND_CONFIRMATION"],
      menu: ["COPY_CONFIRMATION", "VIEW_INTAKE", "NO_SHOW", "CANCEL"],
    });
  });

  it("status akhir: hanya Lihat isian, bila ada dan berhak", () => {
    for (const status of ["HADIR", "SELESAI", "TIDAK_HADIR", "DIBATALKAN", "KEDALUWARSA"] as const) {
      expect(bookingRowActions({ ...site, status }, true)).toEqual({ primary: [], menu: ["VIEW_INTAKE"] });
      expect(bookingRowActions({ ...site, status }, false)).toEqual({ primary: [], menu: [] });
    }
  });

  it("Lihat isian hanya untuk yang berhak membaca rekam medis", () => {
    expect(bookingRowActions(site, false).menu).not.toContain("VIEW_INTAKE");
  });
});
```

- [ ] **Step 3: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/transfer-instruction.test.ts tests/unit/booking-actions.test.ts`
Expected: FAIL. Modul `@/lib/transfer-instruction` dan `@/lib/booking-actions` belum ada.

- [ ] **Step 4: Tulis `src/lib/transfer-instruction.ts`**

```ts
import { CLINIC_NAME } from "./clinic";
import { confirmationDeadline } from "./confirmation-window";
import { formatIndonesianDate, formatRupiah, formatShortIndonesianDate } from "./format";
import { formatBankAccount, type BankAccount, type BookingSourceValue } from "./payment";
import { minutesToTimeLabel, witaMinutesOfDay } from "./time";
import { buildWhatsAppLinkTo } from "./whatsapp";

/** Instruksi transfer untuk booking WA/telepon (spec C1 bagian 4). */
export type TransferInstruction = {
  text: string;
  /** Tautan wa.me ke nomor pasien, atau null bila nomornya tidak sah. */
  link: string | null;
  deadline: Date;
  /** Rekening di Pengaturan belum lengkap; teks memakai MISSING_BANK_ACCOUNT_LINE. */
  missingBankAccount: boolean;
};

/** Sumber booking yang pasiennya mentransfer setelah admin mencatat booking. */
export const TRANSFER_SOURCES = ["WHATSAPP", "TELEPON"] as const;

export const MISSING_BANK_ACCOUNT_LINE = "(rekening akan kami kirimkan)";

/**
 * Booking WA/telepon berbiaya yang belum diverifikasi: pasien masih harus
 * mentransfer. Booking situs tidak termasuk, karena customer sudah menerima
 * instruksinya di halaman sukses /daftar (spec C1 bagian 7).
 */
export function needsTransfer(booking: {
  source: BookingSourceValue;
  status: string;
  bookingFee: number | null;
}): boolean {
  return (
    booking.status === "MENUNGGU_KONFIRMASI" &&
    (TRANSFER_SOURCES as readonly string[]).includes(booking.source) &&
    booking.bookingFee !== null
  );
}

/**
 * 24 jam kerja sejak booking dibuat (Minggu dan libur tidak dihitung, sama
 * dengan booking situs), tetapi tidak pernah setelah jadwalnya sendiri. Hanya
 * tertulis di pesan: booking WA/telepon tidak dibatalkan otomatis (B5).
 */
export function transferDeadline(createdAt: Date, startAt: Date, closedDates: ReadonlySet<string>): Date {
  const deadline = confirmationDeadline(createdAt, closedDates);
  return deadline.getTime() < startAt.getTime() ? deadline : startAt;
}

function longDateTime(date: Date): string {
  return `${formatIndonesianDate(date)} pukul ${minutesToTimeLabel(witaMinutesOfDay(date))} WITA`;
}

export function transferInstructionText(input: {
  patientName: string;
  code: string;
  serviceName: string;
  startAt: Date;
  staffName: string;
  branchName: string;
  fee: number;
  deadline: Date;
  /** Baris rekening siap tampil (formatBankAccount), atau null bila belum lengkap. */
  bankAccount: string | null;
}): string {
  return [
    `Halo ${input.patientName}, booking Anda di ${CLINIC_NAME} sudah kami catat.`,
    `Kode: ${input.code}`,
    `Layanan: ${input.serviceName}`,
    `Jadwal: ${longDateTime(input.startAt)}`,
    `Tenaga: ${input.staffName} · ${input.branchName}`,
    "",
    `Mohon transfer biaya booking ${formatRupiah(input.fee)} paling lambat ${longDateTime(input.deadline)} ke:`,
    input.bankAccount ?? MISSING_BANK_ACCOUNT_LINE,
    "lalu kirim bukti transfer di chat ini.",
    "",
    "Biaya booking terpisah dari biaya layanan dan tidak dikembalikan, tetapi tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelumnya.",
  ].join("\n");
}

/** Nama layanan di daftar dan pesan; booking lama bisa tanpa baris layanan. */
export function bookingServiceName(booking: {
  service: { name: string } | null;
  type: "KONSULTASI" | "TREATMENT";
}): string {
  return booking.service?.name ?? (booking.type === "KONSULTASI" ? "Konsultasi" : "Treatment");
}

/** Bagian booking yang dibutuhkan untuk menyusun instruksi; `transferDeadline` diisi server. */
export type TransferBooking = {
  code: string;
  type: "KONSULTASI" | "TREATMENT";
  startAt: Date;
  bookingFee: number | null;
  transferDeadline: Date | null;
  service: { name: string } | null;
  staff: { name: string };
  branch: { name: string };
  patient: { name: string; whatsapp: string } | null;
};

/** null bila booking tidak menunggu transfer (walk-in, tanpa biaya, situs, atau sudah diverifikasi). */
export function transferInstructionFor(booking: TransferBooking, bank: BankAccount): TransferInstruction | null {
  if (!booking.transferDeadline || booking.bookingFee === null || !booking.patient) return null;
  const bankAccount = formatBankAccount(bank);
  const text = transferInstructionText({
    patientName: booking.patient.name,
    code: booking.code,
    serviceName: bookingServiceName(booking),
    startAt: booking.startAt,
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    fee: booking.bookingFee,
    deadline: booking.transferDeadline,
    bankAccount,
  });
  return {
    text,
    link: buildWhatsAppLinkTo(booking.patient.whatsapp, text),
    deadline: booking.transferDeadline,
    missingBankAccount: bankAccount === null,
  };
}

/** Label batas di daftar "Menunggu konfirmasi" (spec C1 5.1). */
export function pendingDeadlineLabel(input: {
  kind: "EXPIRES" | "TRANSFER";
  deadline: Date;
  overdue: boolean;
}): string {
  if (input.overdue) return "Lewat batas transfer";
  const when = `${formatShortIndonesianDate(input.deadline)} ${minutesToTimeLabel(witaMinutesOfDay(input.deadline))}`;
  return input.kind === "EXPIRES" ? `Kedaluwarsa ${when}` : `Batas transfer ${when}`;
}
```

- [ ] **Step 5: Tulis `src/lib/booking-actions.ts`**

```ts
import type { AppointmentStatusValue } from "./appointment-status";
import type { BookingSourceValue } from "./payment";

export type BookingAction =
  | "VERIFY"
  | "SEND_TRANSFER"
  | "COPY_TRANSFER"
  | "MATCH"
  | "CHANGE_PATIENT"
  | "VIEW_INTAKE"
  | "ATTEND"
  | "SEND_CONFIRMATION"
  | "COPY_CONFIRMATION"
  | "NO_SHOW"
  | "CANCEL";

export const BOOKING_ACTION_LABEL: Record<BookingAction, string> = {
  VERIFY: "Verifikasi",
  SEND_TRANSFER: "Kirim instruksi transfer",
  COPY_TRANSFER: "Salin instruksi transfer",
  MATCH: "Cocokkan pasien",
  CHANGE_PATIENT: "Ganti pasien",
  VIEW_INTAKE: "Lihat isian",
  ATTEND: "Hadir",
  SEND_CONFIRMATION: "Kirim konfirmasi",
  COPY_CONFIRMATION: "Salin konfirmasi",
  NO_SHOW: "Tidak hadir",
  CANCEL: "Batalkan",
};

export type BookingActionRow = {
  status: AppointmentStatusValue;
  source: BookingSourceValue;
  needsMatch: boolean;
  isSiteBooking: boolean;
  intakeId: string | null;
  transferInstruction: { link: string | null } | null;
  confirmation: { link: string | null } | null;
};

/**
 * Aksi per baris daftar booking (spec C1 5.2): paling banyak dua terlihat,
 * sisanya di menu ⋯. Hadir dan Tidak hadir tetap ada di menu untuk booking
 * yang belum diverifikasi, seperti sebelumnya: pasien kadang datang sebelum
 * bukti transfernya diperiksa.
 */
export function bookingRowActions(
  row: BookingActionRow,
  canReadRecords: boolean,
): { primary: BookingAction[]; menu: BookingAction[] } {
  const intake: BookingAction[] = row.intakeId && canReadRecords ? ["VIEW_INTAKE"] : [];

  if (row.status === "MENUNGGU_KONFIRMASI") {
    if (row.needsMatch) return { primary: ["MATCH"], menu: [...intake, "CANCEL"] };
    if (row.isSiteBooking) {
      return { primary: ["VERIFY"], menu: [...intake, "CHANGE_PATIENT", "ATTEND", "NO_SHOW", "CANCEL"] };
    }
    // Walk-in: pasiennya sudah di klinik, tidak ada transfer yang ditunggu.
    if (row.source === "WALK_IN") return { primary: ["ATTEND", "VERIFY"], menu: [...intake, "NO_SHOW", "CANCEL"] };
    if (row.transferInstruction) {
      return {
        primary: row.transferInstruction.link ? ["VERIFY", "SEND_TRANSFER"] : ["VERIFY"],
        menu: ["COPY_TRANSFER", ...intake, "ATTEND", "NO_SHOW", "CANCEL"],
      };
    }
    return { primary: ["VERIFY"], menu: [...intake, "ATTEND", "NO_SHOW", "CANCEL"] };
  }

  if (row.status === "TERKONFIRMASI") {
    const primary: BookingAction[] = ["ATTEND"];
    if (row.confirmation?.link) primary.push("SEND_CONFIRMATION");
    const menu: BookingAction[] = [];
    if (row.confirmation) menu.push("COPY_CONFIRMATION");
    menu.push(...intake, "NO_SHOW", "CANCEL");
    return { primary, menu };
  }

  return { primary: [], menu: intake };
}
```

- [ ] **Step 6: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/transfer-instruction.test.ts tests/unit/booking-actions.test.ts`
Expected: PASS (semua uji di kedua berkas).

- [ ] **Step 7: Commit**

```bash
git add src/lib/transfer-instruction.ts src/lib/booking-actions.ts tests/unit/transfer-instruction.test.ts tests/unit/booking-actions.test.ts
git commit -m "feat: add transfer instruction and booking row action rules"
```

---

### Task 2: Ketersediaan beberapa hari untuk strip tanggal

**Files:**
- Modify: `src/server/availability.ts` (tambahan di akhir berkas, plus impor)
- Modify: `src/server/schedule.ts` (impor, dan fungsi baru setelah `getStaffAvailabilityForAdmin`)
- Test: `tests/integration/availability-range.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots` dari `@/lib/slot`; `BLOCKING_STATUSES`, `expireStaleSiteBookings` (sudah dipakai `availability.ts`).
- Produces:
  - `DayAvailability = { date: string; state: "OPEN" | "FULL" | "CLOSED"; openCount: number }` (diekspor ulang dari `@/server/schedule` sebagai tipe)
  - `MAX_AVAILABILITY_RANGE_DAYS = 31`
  - `computeAvailabilityRange(input: { staffId; branchId; durationMinutes; from: string; days: number }, options: { minLeadMinutes: number }): Promise<DayAvailability[]>`
  - `getStaffAvailabilityRange(input: { staffId: string; branchId: string; durationMinutes: number; from: string; days: number }): Promise<DayAvailability[]>`, dengan `booking:manage` dan `minLeadMinutes: 0`

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/availability-range.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange } from "@/server/schedule";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "strip-tanggal-uji";
const MRN = "SDY-2026-7710";
// Minggu 29 Feb 2032, lalu Senin 1 sampai Sabtu 6 Maret 2032.
const FROM = "2032-02-29";
const HOLIDAY = new Date("2032-03-03T00:00:00Z");

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: MRN } });
  await prisma.holiday.deleteMany({ where: { date: HOLIDAY } });
  // Template dan pengecualian ikut terhapus bersama stafnya (onDelete: Cascade).
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: { startsWith: SLUG } } });
}

function branchData(slug: string) {
  return {
    slug,
    name: `Cabang ${slug}`,
    address: "Alamat",
    whatsapp: "6285172228900",
    openingHours: "Senin–Sabtu, 11.00–13.00",
    status: "AKTIF" as const,
  };
}

describe("ketersediaan beberapa hari (strip tanggal)", () => {
  let staffId: string;
  let branchId: string;
  const input = () => ({ staffId, branchId, durationMinutes: 30, from: FROM, days: 7 });

  beforeAll(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Strip", role: "DOKTER" } })).id;
    branchId = (await prisma.branch.create({ data: branchData(SLUG) })).id;
    // Senin–Sabtu 11.00–13.00: empat jam 30 menit per hari.
    await prisma.scheduleTemplate.createMany({
      data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ staffId, branchId, weekday, startMinute: 660, endMinute: 780 })),
    });
    await prisma.holiday.create({ data: { date: HOLIDAY, name: "Libur Strip", kind: "LIBUR_KLINIK" } });
    await prisma.scheduleException.create({
      data: { staffId, date: new Date("2032-03-04T00:00:00Z"), kind: "LIBUR" },
    });
    const patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: MRN, name: "Pasien Strip", whatsapp: "6281277100001" } })
    ).id;
    const book = (code: string, date: string, from: number, to: number) =>
      prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          source: "WHATSAPP",
          status: "TERKONFIRMASI",
          branchId,
          staffId,
          patientId,
          startAt: combineWitaDateAndMinutes(date, from),
          endAt: combineWitaDateAndMinutes(date, to),
        },
      });
    await book("STRIP-1", "2032-03-02", 660, 780); // Selasa terisi penuh
    await book("STRIP-2", "2032-03-05", 660, 690); // Jumat tersisa tiga jam
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("Minggu, libur, dan cuti tutup; hari yang terisi semua penuh; hari lain menghitung jam kosong", async () => {
    expect(await getStaffAvailabilityRange(input())).toEqual([
      { date: "2032-02-29", state: "CLOSED", openCount: 0 },
      { date: "2032-03-01", state: "OPEN", openCount: 4 },
      { date: "2032-03-02", state: "FULL", openCount: 0 },
      { date: "2032-03-03", state: "CLOSED", openCount: 0 },
      { date: "2032-03-04", state: "CLOSED", openCount: 0 },
      { date: "2032-03-05", state: "OPEN", openCount: 3 },
      { date: "2032-03-06", state: "OPEN", openCount: 4 },
    ]);
  });

  it("angka jam kosong sama dengan daftar jam satu hari", async () => {
    for (const day of await getStaffAvailabilityRange(input())) {
      const slots = await getStaffAvailabilityForAdmin({ staffId, branchId, date: day.date, durationMinutes: 30 });
      expect(day.openCount).toBe(slots.length);
    }
  });

  it("jadwal di cabang lain berarti tutup di cabang ini", async () => {
    const otherId = (await prisma.branch.create({ data: branchData(`${SLUG}-lain`) })).id;
    const days = await getStaffAvailabilityRange({ ...input(), branchId: otherId });
    expect(days.every((day) => day.state === "CLOSED")).toBe(true);
  });

  it("hari ini: hanya jam yang belum lewat dihitung, dan setelah jam kerja menjadi tutup, bukan penuh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(combineWitaDateAndMinutes("2032-03-01", 12 * 60 + 10));
      expect(await getStaffAvailabilityRange({ ...input(), from: "2032-03-01", days: 1 })).toEqual([
        { date: "2032-03-01", state: "OPEN", openCount: 1 },
      ]);
      vi.setSystemTime(combineWitaDateAndMinutes("2032-03-01", 13 * 60 + 5));
      expect(await getStaffAvailabilityRange({ ...input(), from: "2032-03-01", days: 1 })).toEqual([
        { date: "2032-03-01", state: "CLOSED", openCount: 0 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("menolak rentang di luar 1–31 hari dan tanggal yang tidak sah", async () => {
    await expect(getStaffAvailabilityRange({ ...input(), days: 32 })).rejects.toThrow("Rentang");
    await expect(getStaffAvailabilityRange({ ...input(), days: 0 })).rejects.toThrow("Rentang");
    await expect(getStaffAvailabilityRange({ ...input(), from: "besok" })).rejects.toThrow("Tanggal");
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test:integration -- tests/integration/availability-range.test.ts`
Expected: FAIL. `getStaffAvailabilityRange` belum diekspor (`is not a function`).

- [ ] **Step 3: Tambahkan `computeAvailabilityRange` ke `src/server/availability.ts`**

Ganti impor `@/lib/time` di bagian atas berkas:

```ts
import { addDaysToDateString, combineWitaDateAndMinutes, witaWeekday } from "@/lib/time";
```

Tambahkan di akhir berkas:

```ts
export type DayAvailabilityState = "OPEN" | "FULL" | "CLOSED";
export type DayAvailability = { date: string; state: DayAvailabilityState; openCount: number };

/** Batas rentang yang boleh diminta sekaligus. */
export const MAX_AVAILABILITY_RANGE_DAYS = 31;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ringkasan beberapa hari untuk strip tanggal Booking Baru (spec C1 bagian 3).
 * Memakai mesin getAvailableSlots yang sama dengan computeAvailability, tetapi
 * memuat data seluruh rentang dengan empat kueri, bukan lima kueri per hari.
 *
 * CLOSED: tenaga tidak punya jam yang masih bisa dipesan hari itu (Minggu,
 * libur, cuti, di luar jadwal di cabang ini, atau jam kerja hari ini sudah
 * lewat). FULL: masih punya jam kerja, tetapi semuanya sudah terisi.
 */
export async function computeAvailabilityRange(
  input: { staffId: string; branchId: string; durationMinutes: number; from: string; days: number },
  options: { minLeadMinutes: number },
): Promise<DayAvailability[]> {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_AVAILABILITY_RANGE_DAYS) {
    throw new Error(`Rentang harus 1–${MAX_AVAILABILITY_RANGE_DAYS} hari.`);
  }
  if (!DATE_PATTERN.test(input.from)) throw new Error("Tanggal awal tidak sah.");

  await expireStaleSiteBookings();

  const dates = Array.from({ length: input.days }, (_, index) => addDaysToDateString(input.from, index));
  const lastDate = dates[dates.length - 1];
  const firstDay = new Date(`${input.from}T00:00:00Z`);
  const lastDay = new Date(`${lastDate}T00:00:00Z`);
  const rangeStart = combineWitaDateAndMinutes(input.from, 0);
  const rangeEnd = combineWitaDateAndMinutes(lastDate, 24 * 60);
  const now = new Date();

  const [templates, exceptions, holidays, busy] = await Promise.all([
    prisma.scheduleTemplate.findMany({ where: { staffId: input.staffId } }),
    prisma.scheduleException.findMany({
      where: { staffId: input.staffId, date: { gte: firstDay, lte: lastDay } },
    }),
    prisma.holiday.findMany({ where: { date: { gte: firstDay, lte: lastDay } }, select: { date: true } }),
    prisma.appointment.findMany({
      where: {
        staffId: input.staffId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);
  const holidayDates = new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));

  return dates.map((date): DayAvailability => {
    const weekday = witaWeekday(new Date(`${date}T12:00:00Z`));
    const template = templates.find((t) => t.weekday === weekday);
    const day = {
      date,
      durationMinutes: input.durationMinutes,
      template:
        template && template.branchId === input.branchId
          ? { startMinute: template.startMinute, endMinute: template.endMinute }
          : null,
      exceptions: exceptions
        .filter((e) => e.date.toISOString().slice(0, 10) === date)
        .map((e) => ({ kind: e.kind, startMinute: e.startMinute, endMinute: e.endMinute })),
      isHoliday: holidayDates.has(date),
      now,
      minLeadMinutes: options.minLeadMinutes,
    };
    // Tanpa booking sama sekali pun tidak ada jam: tenaga memang tidak bekerja.
    if (getAvailableSlots({ ...day, busy: [] }).length === 0) return { date, state: "CLOSED", openCount: 0 };
    const openCount = getAvailableSlots({ ...day, busy }).length;
    return { date, state: openCount === 0 ? "FULL" : "OPEN", openCount };
  });
}
```

- [ ] **Step 4: Tambahkan `getStaffAvailabilityRange` ke `src/server/schedule.ts`**

Ganti impor `@/server/availability`:

```ts
import {
  computeAvailability,
  computeAvailabilityRange,
  type AvailabilityInput,
  type DayAvailability,
} from "@/server/availability";
```

Tambahkan tepat di bawah impor:

```ts
export type { DayAvailability } from "@/server/availability";
```

Tambahkan setelah `getStaffAvailabilityForAdmin`:

```ts
/**
 * Strip tanggal Booking Baru: ringkasan per hari dengan aturan jam yang sama
 * seperti getStaffAvailabilityForAdmin (tanpa batas 2 jam, hold diabaikan).
 */
export async function getStaffAvailabilityRange(input: {
  staffId: string;
  branchId: string;
  durationMinutes: number;
  from: string;
  days: number;
}): Promise<DayAvailability[]> {
  await requireCapability("booking:manage");
  return computeAvailabilityRange(input, { minLeadMinutes: 0 });
}
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

Run: `npm run test:integration -- tests/integration/availability-range.test.ts tests/integration/schedule.test.ts tests/integration/public-slots.test.ts`
Expected: PASS. Uji jadwal dan slot publik yang lama tetap lulus.

- [ ] **Step 6: Commit**

```bash
git add src/server/availability.ts src/server/schedule.ts tests/integration/availability-range.test.ts
git commit -m "feat: summarize staff availability over a range of days for the booking date strip"
```

---

### Task 3: Kunjungan terakhir dan booking berikutnya di pencarian pasien

**Files:**
- Modify: `src/server/patient.ts:1-47` (impor, `PatientSummary`, `SUMMARY_SELECT`, `toSummary`), `:88-135` (`createPatient` sampai `findPatientsByWhatsapp`)
- Test: `tests/integration/patient-booking-info.test.ts`

**Interfaces:**
- Produces: `PatientSummary` bertambah `lastVisitAt: Date | null` dan `nextBookingAt: Date | null`. Diisi oleh `createPatient`, `listRecentPatients`, `searchPatients`, `findPatientsByWhatsapp`.

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/patient-booking-info.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createPatient, findPatientsByWhatsapp, listRecentPatients, searchPatients } from "@/server/patient";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "info-pasien-uji";
const WA = "6281277200001";
const NEW_WA = "6281277200002";
const HOUR = 60 * 60 * 1000;
const LAST_VISIT = new Date("2026-09-24T03:00:00Z");

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: { in: [WA, NEW_WA] } } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("info booking di pencarian pasien", () => {
  let patientId: string;
  let nextBooking: Date;

  beforeAll(async () => {
    await cleanup();
    const staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Info", role: "DOKTER" } })).id;
    const branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Info",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { medicalRecordNumber: "SDY-2026-7720", name: "Maria Infobooking", whatsapp: WA, lastVisitAt: LAST_VISIT },
      })
    ).id;
    // Jam bulat: tiap booking di jam berbeda agar tidak bertabrakan.
    const base = Math.ceil(Date.now() / HOUR) * HOUR;
    const book = (code: string, offsetHours: number, status: AppointmentStatus) =>
      prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          source: "WHATSAPP",
          status,
          branchId,
          staffId,
          patientId,
          startAt: new Date(base + offsetHours * HOUR),
          endAt: new Date(base + offsetHours * HOUR + 30 * 60 * 1000),
        },
      });
    await book("INFO-LEWAT", -48, "TERKONFIRMASI"); // sudah lewat
    await book("INFO-BATAL", 24, "DIBATALKAN"); // lebih dekat, tetapi dibatalkan
    nextBooking = (await book("INFO-AKTIF", 72, "MENUNGGU_KONFIRMASI")).startAt;
    await book("INFO-JAUH", 120, "TERKONFIRMASI");
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("menampilkan kunjungan terakhir dan booking aktif terdekat yang belum lewat", async () => {
    const [found] = await searchPatients("infobooking");
    expect(found).toMatchObject({ id: patientId, lastVisitAt: LAST_VISIT, nextBookingAt: nextBooking });
  });

  it("mengenali nomor yang ditempel dari WhatsApp", async () => {
    expect((await searchPatients("+62 812-7720-0001")).map((p) => p.id)).toContain(patientId);
    expect((await findPatientsByWhatsapp("0812 7720 0001")).map((p) => p.nextBookingAt)).toEqual([nextBooking]);
  });

  it("pasien baru: belum pernah berkunjung dan tanpa booking", async () => {
    const created = await unwrap(createPatient({ name: "Pasien Infobaru", whatsapp: NEW_WA }));
    expect(created).toMatchObject({ lastVisitAt: null, nextBookingAt: null });
    const recent = await listRecentPatients();
    expect(recent.find((p) => p.id === created.id)).toMatchObject({ lastVisitAt: null, nextBookingAt: null });
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test:integration -- tests/integration/patient-booking-info.test.ts`
Expected: FAIL. `lastVisitAt`/`nextBookingAt` tidak ada di hasil (`toMatchObject` gagal).

- [ ] **Step 3: Ubah bentuk ringkasan pasien di `src/server/patient.ts`**

Ganti baris impor tipe Prisma:

```ts
import type { AppointmentStatus, Patient, PatientProgramStatus } from "@prisma/client";
```

Ganti `PatientSummary`, `SUMMARY_SELECT`, dan `toSummary` (baris 17–47) dengan:

```ts
/**
 * Bentuk pasien yang boleh sampai ke browser. Fungsi di berkas ini dipanggil
 * langsung dari komponen klien (pencarian pasien, formulir pasien baru), jadi
 * catatan medis tidak pernah ikut (spec 6.2). Halaman pasien membacanya lewat
 * getPatientDetail, hanya untuk record:read.
 */
export type PatientSummary = {
  id: string;
  medicalRecordNumber: string;
  name: string;
  whatsapp: string;
  programStatus: PatientProgramStatus;
  /** Jadwal kunjungan terakhir (diisi saat kunjungan difinalisasi). */
  lastVisitAt: Date | null;
  /** Booking aktif terdekat yang belum lewat, agar booking ganda ketahuan (spec C1 bagian 3). */
  nextBookingAt: Date | null;
};

const NEXT_BOOKING_STATUSES: AppointmentStatus[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

function summarySelect(now: Date) {
  return {
    id: true,
    medicalRecordNumber: true,
    name: true,
    whatsapp: true,
    programStatus: true,
    lastVisitAt: true,
    appointments: {
      where: { status: { in: NEXT_BOOKING_STATUSES }, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 1,
      select: { startAt: true },
    },
  } as const;
}

type SummaryRow = Pick<
  Patient,
  "id" | "medicalRecordNumber" | "name" | "whatsapp" | "programStatus" | "lastVisitAt"
> & { appointments: { startAt: Date }[] };

function toSummary(row: SummaryRow): PatientSummary {
  return {
    id: row.id,
    medicalRecordNumber: row.medicalRecordNumber,
    name: row.name,
    whatsapp: row.whatsapp,
    programStatus: row.programStatus,
    lastVisitAt: row.lastVisitAt,
    nextBookingAt: row.appointments[0]?.startAt ?? null,
  };
}
```

Di `createPatient`, ganti `return toSummary(patient);` dengan:

```ts
    // Pasien yang baru dibuat belum punya booking.
    return toSummary({ ...patient, appointments: [] });
```

Ganti `listRecentPatients`, `searchPatients`, dan `findPatientsByWhatsapp` dengan:

```ts
export async function listRecentPatients(limit = 50): Promise<PatientSummary[]> {
  await requireCapability("booking:manage");
  const rows = await prisma.patient.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: summarySelect(new Date()),
  });
  return rows.map(toSummary);
}

/** Cocok terhadap nama (sebagian, tanpa peduli huruf besar/kecil) atau nomor WhatsApp. */
export async function searchPatients(query: string): Promise<PatientSummary[]> {
  await requireCapability("booking:manage");
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Nomor tersimpan berawalan 62, sedangkan admin lazim mengetik 0812….
  const phoneVariants: { whatsapp: { contains: string } }[] = [];
  if (/^[\d\s()+-]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits) {
      phoneVariants.push({
        whatsapp: { contains: digits.startsWith("0") ? `62${digits.slice(1)}` : digits },
      });
    }
  }

  const rows = await prisma.patient.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { whatsapp: { contains: trimmed } },
        { medicalRecordNumber: { contains: trimmed, mode: "insensitive" } },
        ...phoneVariants,
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
    select: summarySelect(new Date()),
  });
  return rows.map(toSummary);
}

/** Dipakai saat membuat pasien baru untuk menawarkan penggabungan bila nomor sudah terdaftar. */
export async function findPatientsByWhatsapp(whatsapp: string): Promise<PatientSummary[]> {
  await requireCapability("booking:manage");
  const normalized = normalizeWhatsapp(whatsapp);
  if (!normalized) return [];
  const rows = await prisma.patient.findMany({ where: { whatsapp: normalized }, select: summarySelect(new Date()) });
  return rows.map(toSummary);
}
```

- [ ] **Step 4: Jalankan uji untuk memastikan lulus**

Run: `npm run test:integration -- tests/integration/patient-booking-info.test.ts tests/integration/patient.test.ts`
Expected: PASS. Uji "fungsi yang dipanggil dari browser tidak pernah membawa catatan medis" di `patient.test.ts` tetap lulus.

Run: `npx tsc --noEmit`
Expected: bersih. `new-patient-form.tsx`, `patient-picker.tsx`, `appointment-form.tsx`, dan halaman `/admin/pasien` hanya membaca kolom yang sudah ada.

- [ ] **Step 5: Commit**

```bash
git add src/server/patient.ts tests/integration/patient-booking-info.test.ts
git commit -m "feat: show last visit and next active booking in patient search results"
```

---

### Task 4: Antrean menunggu, pencarian booking, dan instruksi transfer di server

**Files:**
- Modify: `src/server/booking-expiry.ts` (impor + `transferDeadlines`)
- Modify: `src/server/appointment.ts` (impor; `listAppointments`; ganti `listPendingSiteBookings`/`countPendingSiteBookings`; tambah `searchBookings`, `getTransferInstruction`)
- Modify: `src/app/(admin)/admin/layout.tsx`, `src/components/admin/app-sidebar.tsx:50-110`, `src/app/(admin)/admin/booking/page.tsx` (hanya nama fungsi dan label batas)
- Modify: `tests/integration/booking-expiry.test.ts:6,182-200`
- Test: `tests/integration/booking-queue.test.ts`

**Interfaces:**
- Consumes (Task 1): `needsTransfer`, `transferDeadline`, `TRANSFER_SOURCES`, `transferInstructionFor`, `TransferInstruction`, `pendingDeadlineLabel`.
- Produces:
  - `transferDeadlines(bookings: { source; status; bookingFee; createdAt; startAt }[]): Promise<(Date | null)[]>` di `booking-expiry.ts`
  - Setiap baris dari `listAppointments`, `listPendingBookings`, dan `searchBookings` = baris `BOOKING_LIST_INCLUDE` + `transferDeadline: Date | null`
  - `listPendingBookings()`: baris + `deadline: Date`, `deadlineKind: "EXPIRES" | "TRANSFER"`, `overdue: boolean`, terurut menurut `deadline`
  - `countPendingBookings(): Promise<number>`
  - `searchBookings(query: string)`: paling banyak 50, `startAt` menurun
  - `getTransferInstruction(appointmentId: string): Promise<ActionResult<TransferInstruction | null>>`
  - `AppSidebar` prop `pendingBookings` (ganti nama dari `pendingSiteBookings`)

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/booking-queue.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import {
  countPendingBookings,
  getTransferInstruction,
  listPendingBookings,
  searchBookings,
} from "@/server/appointment";
import { requireCapability } from "@/server/session";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "antrian-booking-uji";
const WA = "6281277300001";
const HOUR = 60 * 60 * 1000;
const BANK = { bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" };

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("antrean menunggu, pencarian booking, dan instruksi transfer", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let originalSetting: { bankName: string | null; bankAccountNumber: string | null; bankAccountHolder: string | null };
  let slot = 0;
  // Jam bulat; tiap booking memakai jam berbeda agar tidak bertabrakan.
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(input: {
    source: BookingSource;
    status?: AppointmentStatus;
    createdAt?: Date;
    startAt?: Date;
    bookingFee?: number | null;
    withPatient?: boolean;
    code?: string;
  }) {
    slot += 1;
    const startAt = input.startAt ?? new Date(base + (240 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: input.code ?? `ANT-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: input.source,
        status: input.status ?? "MENUNGGU_KONFIRMASI",
        bookingFee: input.bookingFee === undefined ? 100000 : input.bookingFee,
        createdAt: input.createdAt ?? new Date(),
        branchId,
        staffId,
        patientId: input.withPatient === false ? null : patientId,
      },
    });
  }

  const ids = (rows: { id: string; staffId: string }[]) => rows.filter((r) => r.staffId === staffId).map((r) => r.id);

  beforeAll(async () => {
    originalSetting = await prisma.clinicSetting.findUniqueOrThrow({
      where: { id: 1 },
      select: { bankName: true, bankAccountNumber: true, bankAccountHolder: true },
    });
    await prisma.clinicSetting.update({ where: { id: 1 }, data: BANK });
  });

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Antrian", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Antrian",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7730", name: "Maria Antrian", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.clinicSetting.update({ where: { id: 1 }, data: originalSetting });
    await prisma.$disconnect();
  });

  it("daftar menunggu memuat booking WA/telepon berbiaya beserta batasnya, yang paling mendesak di atas", async () => {
    const overdue = await booking({ source: "TELEPON", createdAt: new Date(Date.now() - 30 * 24 * HOUR) });
    const site = await booking({ source: "SITUS", withPatient: false, createdAt: new Date(Date.now() - HOUR) });
    // Jadwal 2–3 jam lagi: batas transfernya jadwal itu sendiri.
    const soon = await booking({ source: "WHATSAPP", startAt: new Date(base + 3 * HOUR) });
    await booking({ source: "WALK_IN", bookingFee: null });
    await booking({ source: "WHATSAPP", bookingFee: null });
    await booking({ source: "WHATSAPP", status: "TERKONFIRMASI" });

    const pending = (await listPendingBookings()).filter((row) => row.staffId === staffId);

    expect(pending.map((row) => row.id)).toEqual([overdue.id, soon.id, site.id]);
    expect(pending.map((row) => [row.deadlineKind, row.overdue])).toEqual([
      ["TRANSFER", true],
      ["TRANSFER", false],
      ["EXPIRES", false],
    ]);
    expect(pending[1].deadline).toEqual(soon.startAt);
    // Lewat batas tetapi tidak dibatalkan otomatis (B5).
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: overdue.id } })).status).toBe(
      "MENUNGGU_KONFIRMASI",
    );
    expect(await countPendingBookings()).toBe((await listPendingBookings()).length);
  });

  it("mencari per kode persis tanpa peduli huruf besar/kecil", async () => {
    const target = await booking({ source: "WHATSAPP", code: "SDY-Q7W2" });
    expect(ids(await searchBookings("sdy-q7w2"))).toEqual([target.id]);
    expect(ids(await searchBookings("SDY-Q7"))).toEqual([]);
  });

  it("mencari per nama pasien sebagian, dan per nama atau nomor di isian booking situs yang belum dicocokkan", async () => {
    const mine = await booking({ source: "WHATSAPP" });
    const unmatched = await booking({ source: "SITUS", withPatient: false });
    await prisma.intake.create({
      data: {
        appointmentId: unmatched.id,
        status: "MENUNGGU_DIISI",
        kind: "PENDEK",
        name: "Stevanie Isian",
        whatsapp: "6281277300009",
      },
    });

    expect(ids(await searchBookings("antrian"))).toEqual([mine.id]);
    expect(ids(await searchBookings("stevanie"))).toEqual([unmatched.id]);
    expect(ids(await searchBookings("0812 7730 0009"))).toEqual([unmatched.id]);
  });

  it("mengenali nomor WA yang ditempel", async () => {
    const mine = await booking({ source: "TELEPON" });
    expect(ids(await searchBookings("+62 812-7730-0001"))).toEqual([mine.id]);
    expect(ids(await searchBookings("0812 7730 0001"))).toEqual([mine.id]);
  });

  it("spasi saja tidak mencari apa pun, dan angka pendek tidak dicocokkan ke nomor WA", async () => {
    await booking({ source: "WHATSAPP" });
    expect(await searchBookings("   ")).toEqual([]);
    expect(ids(await searchBookings("12"))).toEqual([]);
  });

  it("mencakup jadwal 30 hari ke belakang sampai seterusnya, terbaru di atas", async () => {
    const today = witaDateString(new Date());
    const daysAgo = (days: number) => combineWitaDateAndMinutes(addDaysToDateString(today, -days), 12 * 60);
    const recent = await booking({ source: "WHATSAPP", status: "SELESAI", startAt: daysAgo(29) });
    await booking({ source: "WHATSAPP", status: "SELESAI", startAt: daysAgo(31) });
    const later = await booking({ source: "WHATSAPP" });

    expect(ids(await searchBookings("antrian"))).toEqual([later.id, recent.id]);
  });

  it("paling banyak 50 hasil", async () => {
    await prisma.appointment.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        code: `ANT-M${index}`,
        type: "KONSULTASI" as const,
        source: "WHATSAPP" as const,
        status: "DIBATALKAN" as const,
        branchId,
        staffId,
        patientId,
        startAt: new Date(base + (500 + index) * HOUR),
        endAt: new Date(base + (500 + index) * HOUR + 30 * 60 * 1000),
      })),
    });

    const results = await searchBookings("antrian");
    expect(results).toHaveLength(50);
    expect(results[0].code).toBe("ANT-M54");
  });

  it("instruksi transfer memakai biaya yang disalin ke booking dan rekening dari Pengaturan", async () => {
    const created = await booking({ source: "WHATSAPP", bookingFee: 150000 });
    const instruction = (await unwrap(getTransferInstruction(created.id)))!;
    expect(instruction.text).toContain("Rp 150.000");
    expect(instruction.text).toContain("BCA 1234567890 a.n. SunDY Clinic");
    expect(instruction.link).toMatch(/^https:\/\/wa\.me\/6281277300001\?text=/);
    expect(instruction.missingBankAccount).toBe(false);
  });

  it("menandai rekening yang belum lengkap di Pengaturan", async () => {
    const created = await booking({ source: "TELEPON" });
    await prisma.clinicSetting.update({ where: { id: 1 }, data: { bankName: null } });
    try {
      expect((await unwrap(getTransferInstruction(created.id)))!.missingBankAccount).toBe(true);
    } finally {
      await prisma.clinicSetting.update({ where: { id: 1 }, data: BANK });
    }
  });

  it("walk-in, booking situs, dan booking terkonfirmasi tidak punya instruksi transfer", async () => {
    const bookings = [
      await booking({ source: "WALK_IN", bookingFee: null }),
      await booking({ source: "SITUS", withPatient: false }),
      await booking({ source: "WHATSAPP", status: "TERKONFIRMASI" }),
    ];
    for (const b of bookings) {
      expect(await unwrap(getTransferInstruction(b.id))).toBeNull();
    }
  });

  it("booking yang tidak ada ditolak dengan pesan", async () => {
    expect(await getTransferInstruction("tidak-ada")).toEqual({ ok: false, error: "Booking tidak ditemukan." });
  });

  it("semua fungsi memakai booking:manage, yang dimiliki resepsionis", async () => {
    vi.mocked(requireCapability).mockClear();
    await listPendingBookings();
    await countPendingBookings();
    await searchBookings("antrian");
    await getTransferInstruction("tidak-ada");

    const capabilities = vi.mocked(requireCapability).mock.calls.map(([capability]) => capability);
    expect(new Set(capabilities)).toEqual(new Set(["booking:manage"]));
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test:integration -- tests/integration/booking-queue.test.ts`
Expected: FAIL. `listPendingBookings`, `countPendingBookings`, `searchBookings`, `getTransferInstruction` belum diekspor.

- [ ] **Step 3: Tambahkan `transferDeadlines` ke `src/server/booking-expiry.ts`**

Tambahkan impor:

```ts
import type { BookingSourceValue } from "@/lib/payment";
import { needsTransfer, transferDeadline } from "@/lib/transfer-instruction";
```

Tambahkan setelah `confirmationDeadlines`:

```ts
/**
 * Batas transfer untuk booking WA/telepon yang menunggu transfer, atau null
 * untuk booking lain (satu kueri libur untuk semua). Hanya pengingat: tidak
 * ada yang dibatalkan saat batas ini lewat (spec C1, B5).
 */
export async function transferDeadlines(
  bookings: { source: BookingSourceValue; status: string; bookingFee: number | null; createdAt: Date; startAt: Date }[],
): Promise<(Date | null)[]> {
  const due = bookings.filter(needsTransfer);
  if (due.length === 0) return bookings.map(() => null);
  const earliest = new Date(Math.min(...due.map((b) => b.createdAt.getTime())));
  const latest = new Date(Math.max(...due.map((b) => b.createdAt.getTime())) + LOOKBACK_MS);
  const closed = await closedDatesBetween(earliest, latest);
  return bookings.map((b) => (needsTransfer(b) ? transferDeadline(b.createdAt, b.startAt, closed) : null));
}
```

- [ ] **Step 4: Ubah `src/server/appointment.ts`**

Ganti impor tipe Prisma, `@/lib/time`, dan `@/server/booking-expiry`, lalu tambahkan impor `@/lib/transfer-instruction`:

```ts
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  BookingSource,
  IntakeStatus,
  Prisma,
} from "@prisma/client";
```

```ts
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import {
  TRANSFER_SOURCES,
  transferInstructionFor,
  type TransferInstruction,
} from "@/lib/transfer-instruction";
```

```ts
import {
  confirmationDeadlines,
  currentConfirmationCutoff,
  expireStaleSiteBookings,
  transferDeadlines,
} from "@/server/booking-expiry";
```

Tambahkan tepat setelah `BOOKING_LIST_INCLUDE`:

```ts
/** Menambahkan batas transfer ke setiap booking (null bila booking tidak menunggu transfer). */
async function withTransferDeadlines<
  T extends { source: BookingSource; status: AppointmentStatus; bookingFee: number | null; createdAt: Date; startAt: Date },
>(appointments: T[]): Promise<(T & { transferDeadline: Date | null })[]> {
  const deadlines = await transferDeadlines(appointments);
  return appointments.map((appointment, index) => ({ ...appointment, transferDeadline: deadlines[index] }));
}
```

Ganti `listAppointments` dengan:

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

  const appointments = await prisma.appointment.findMany({
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
  return withTransferDeadlines(appointments);
}
```

Ganti `listPendingSiteBookings` dan `countPendingSiteBookings` (dari komentar di atas `listPendingSiteBookings` sampai akhir berkas) dengan:

```ts
export type PendingDeadlineKind = "EXPIRES" | "TRANSFER";

/** Booking WA/telepon berbiaya yang belum diverifikasi; walk-in tidak pernah menunggu transfer. */
const WAITING_TRANSFER: Prisma.AppointmentWhereInput = {
  source: { in: [...TRANSFER_SOURCES] },
  bookingFee: { not: null },
};

/**
 * Daftar "Menunggu konfirmasi" dari tanggal jadwal mana pun (spec C1 5.1):
 * booking situs yang belum kedaluwarsa, dan booking WA/telepon berbiaya yang
 * belum diverifikasi. Yang paling mendesak di atas. Booking WA/telepon yang
 * lewat batas transfer tetap di sini dan tidak dibatalkan otomatis (B5).
 * Tanpa daftar ini admin harus membuka tanggal satu per satu.
 */
export async function listPendingBookings() {
  await requireCapability("booking:manage");
  await expireStaleSiteBookings();

  const appointments = await withTransferDeadlines(
    await prisma.appointment.findMany({
      where: { status: "MENUNGGU_KONFIRMASI", OR: [{ source: "SITUS" }, WAITING_TRANSFER] },
      include: BOOKING_LIST_INCLUDE,
    }),
  );
  const site = appointments.filter((a) => a.source === "SITUS");
  const expiries = await confirmationDeadlines(site.map((a) => a.createdAt));
  const expiresAt = new Map(site.map((a, index) => [a.id, expiries[index]]));
  const now = Date.now();

  return appointments
    .map((a) => {
      const deadlineKind: PendingDeadlineKind = a.transferDeadline ? "TRANSFER" : "EXPIRES";
      const deadline = a.transferDeadline ?? expiresAt.get(a.id)!;
      return { ...a, deadline, deadlineKind, overdue: deadlineKind === "TRANSFER" && deadline.getTime() <= now };
    })
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

/** Jumlah untuk menu samping; tanpa menulis apa pun, karena dipanggil di setiap halaman admin. */
export async function countPendingBookings(): Promise<number> {
  await requireCapability("booking:manage");
  const cutoff = await currentConfirmationCutoff();
  return prisma.appointment.count({
    where: {
      status: "MENUNGGU_KONFIRMASI",
      OR: [{ source: "SITUS", createdAt: { gte: cutoff } }, WAITING_TRANSFER],
    },
  });
}

const SEARCH_LOOKBACK_DAYS = 30;
const SEARCH_LIMIT = 50;
/** Angka lebih pendek dari ini tidak dicocokkan ke nomor WA, agar hasilnya tidak membanjir. */
const SEARCH_MIN_PHONE_DIGITS = 4;

/**
 * Pencarian di halaman Booking (spec C1 5.3): kode persis tanpa peduli huruf
 * besar/kecil; nama pasien, atau nama di isian booking situs yang belum
 * dicocokkan (sebagian); nomor WA yang dinormalkan seperti pencarian pasien.
 * Jadwal 30 hari ke belakang sampai seterusnya, terbaru di atas.
 */
export async function searchBookings(query: string) {
  await requireCapability("booking:manage");
  const trimmed = query.trim();
  if (!trimmed) return [];
  await expireStaleSiteBookings();

  const since = combineWitaDateAndMinutes(addDaysToDateString(witaDateString(new Date()), -SEARCH_LOOKBACK_DAYS), 0);
  const digits = /^[\d\s()+-]+$/.test(trimmed) ? trimmed.replace(/\D/g, "") : "";
  const phone = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  const name = { contains: trimmed, mode: "insensitive" as const };
  const phoneMatches: Prisma.AppointmentWhereInput[] =
    phone.length >= SEARCH_MIN_PHONE_DIGITS
      ? [{ patient: { whatsapp: { contains: phone } } }, { patientId: null, intake: { whatsapp: { contains: phone } } }]
      : [];

  return withTransferDeadlines(
    await prisma.appointment.findMany({
      where: {
        startAt: { gte: since },
        OR: [
          { code: { equals: trimmed, mode: "insensitive" } },
          { patient: { name } },
          { patientId: null, intake: { name } },
          ...phoneMatches,
        ],
      },
      include: BOOKING_LIST_INCLUDE,
      orderBy: { startAt: "desc" },
      take: SEARCH_LIMIT,
    }),
  );
}

/** Untuk panel "Booking dibuat" (spec C1 bagian 4): null bila booking tidak menunggu transfer. */
export async function getTransferInstruction(
  appointmentId: string,
): Promise<ActionResult<TransferInstruction | null>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: BOOKING_LIST_INCLUDE,
    });
    if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
    const [withDeadline] = await withTransferDeadlines([appointment]);
    return transferInstructionFor(withDeadline, await getClinicSetting());
  });
}
```

- [ ] **Step 5: Perbarui pemanggil nama lama**

`src/app/(admin)/admin/layout.tsx`: ganti impor dan pemanggilan:

```ts
import { countPendingBookings } from "@/server/appointment";
```

```ts
  const pendingBookings = can(staff.role, "booking:manage") ? await countPendingBookings() : 0;
```

```tsx
        <AppSidebar staff={staff} pendingBookings={pendingBookings} />
```

`src/components/admin/app-sidebar.tsx`: ganti nama prop `pendingSiteBookings` menjadi `pendingBookings` di parameter (baris ~53), tipe prop (baris ~57), dan badge:

```tsx
                      {item.url === "/admin/booking" && pendingBookings > 0 && (
                        <SidebarMenuBadge
                          aria-label={`${pendingBookings} booking menunggu konfirmasi`}
                          className="bg-amber-500 text-white peer-hover/menu-button:text-white"
                        >
                          {pendingBookings}
                        </SidebarMenuBadge>
                      )}
```

`src/app/(admin)/admin/booking/page.tsx`: ganti `listPendingSiteBookings` dengan `listPendingBookings` di impor dan di `Promise.all` (variabelnya menjadi `pending`), tambahkan impor `pendingDeadlineLabel` dari `@/lib/transfer-instruction`, lalu ganti pembentukan `pendingRows`:

```ts
  const pendingRows: BookingRow[] = pending.map((a) => {
    const row = toRow(a);
    return {
      ...row,
      timeLabel: `${formatShortIndonesianDate(a.startAt)} · ${row.timeLabel}`,
      deadlineLabel: pendingDeadlineLabel({ kind: a.deadlineKind, deadline: a.deadline, overdue: a.overdue }),
    };
  });
```

(Tata letak halaman diubah di Task 6. Di sini cukup agar halaman tetap terkompilasi.)

- [ ] **Step 6: Sesuaikan uji kedaluwarsa yang lama**

`tests/integration/booking-expiry.test.ts`: ganti impor baris 6:

```ts
import { countPendingBookings, listAppointments, listPendingBookings } from "@/server/appointment";
```

Ganti isi uji terakhir mulai dari `const count = …` sampai sebelum pemeriksaan `stale`:

```ts
    const count = await countPendingBookings();
    const pending = await listPendingBookings();

    // Booking WA uji ini tanpa biaya booking, jadi tidak menunggu transfer.
    const mine = pending.filter((row) => row.staffId === staffId);
    expect(mine.map((row) => row.id)).toEqual([older.id, newer.id]);
    expect(count).toBe(pending.length);
    for (const row of mine) {
      expect(row.deadlineKind).toBe("EXPIRES");
      expect(row.deadline.getTime() - row.createdAt.getTime()).toBeGreaterThanOrEqual(24 * HOUR);
    }
```

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npm run test:integration -- tests/integration/booking-queue.test.ts tests/integration/booking-expiry.test.ts tests/integration/appointment.test.ts tests/integration/booking-intake-filter.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 8: Commit**

```bash
git add src/server/booking-expiry.ts src/server/appointment.ts "src/app/(admin)/admin/layout.tsx" src/components/admin/app-sidebar.tsx "src/app/(admin)/admin/booking/page.tsx" tests/integration/booking-queue.test.ts tests/integration/booking-expiry.test.ts
git commit -m "feat: list WhatsApp and phone bookings awaiting transfer, search bookings, and build transfer instructions"
```

---

### Task 5: Tabel booking — menu ⋯, instruksi transfer, dan sorotan

**Files:**
- Modify: `src/components/admin/match-patient-dialog.tsx` (seluruh berkas)
- Modify: `src/components/admin/appointment-table.tsx` (seluruh berkas)
- Modify: `src/app/(admin)/admin/booking/page.tsx` (`toRow` dan pemanggilnya)
- Test: `tests/unit/components/appointment-table.test.tsx` (seluruh berkas)

**Interfaces:**
- Consumes: `bookingRowActions`, `BOOKING_ACTION_LABEL`, `BookingAction` (Task 1); `transferInstructionFor`, `bookingServiceName` (Task 1); `getClinicSetting` dari `@/server/clinic-setting`.
- Produces:
  - `BookingRow` bertambah `source: BookingSourceValue`, `transferInstruction: { text: string; link: string | null } | null`, `deadlineOverdue?: boolean`
  - `AppointmentTable` prop `highlightId?: string | null`; baris yang disorot punya `data-highlighted="true"`
  - Tombol menu: `aria-label="Aksi lain {kode}"`; isinya `menuitem` dengan label dari `BOOKING_ACTION_LABEL`
  - `MatchPatientDialog({ appointmentId, code, open, onOpenChange })`, tanpa tombol pemicu sendiri

- [ ] **Step 1: Tulis ulang uji tabel (gagal)**

`tests/unit/components/appointment-table.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { getMatchCandidates } from "@/server/intake";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({
  cancelAppointment: vi.fn(),
  markAttended: vi.fn(),
  markNoShow: vi.fn(),
  verifyAppointment: vi.fn(),
}));
vi.mock("@/server/intake", () => ({
  createPatientFromIntake: vi.fn(),
  getMatchCandidates: vi.fn(),
  matchPatient: vi.fn(),
}));

const base: BookingRow = {
  id: "a1",
  code: "SDY-8F3K",
  status: "MENUNGGU_KONFIRMASI",
  timeLabel: "15.00–15.30",
  patientName: "Siti Rahayu",
  patientRecordNumber: "SDY-2026-0001",
  serviceName: "Konsultasi Dokter",
  staffName: "Dr. Diane",
  branchName: "SunDY Mahakeret",
  source: "SITUS",
  sourceLabel: "Situs",
  notes: null,
  confirmation: null,
  transferInstruction: null,
  needsMatch: false,
  isSiteBooking: true,
  intakeId: "i1",
  intakeStatus: "TERISI",
  patientId: "p1",
};

const waRow: BookingRow = {
  ...base,
  id: "a2",
  code: "SDY-WA01",
  source: "WHATSAPP",
  sourceLabel: "WhatsApp",
  isSiteBooking: false,
  intakeId: null,
  intakeStatus: null,
  transferInstruction: { text: "Halo Siti, mohon transfer…", link: "https://wa.me/6281234567890?text=Halo" },
};

async function openMenu(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getByRole("button", { name: `Aksi lain ${code}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMatchCandidates).mockResolvedValue({
    ok: true,
    data: {
      code: "SDY-8F3K",
      intake: { name: "Siti Rahayu", whatsapp: "6281234567890", birthDateLabel: null, claimsReturning: false },
      candidates: [],
    },
  });
});

describe("AppointmentTable pencocokan pasien", () => {
  it("booking situs yang belum dicocokkan menawarkan Cocokkan pasien dan belum Verifikasi", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[{ ...base, needsMatch: true, patientRecordNumber: "—" }]} canReadRecords={false} />);
    expect(screen.queryByRole("button", { name: "Verifikasi" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cocokkan pasien" }));
    expect(await screen.findByRole("dialog", { name: "Cocokkan pasien — SDY-8F3K" })).toBeInTheDocument();
    expect(getMatchCandidates).toHaveBeenCalledWith("a1");
  });

  it("booking situs yang sudah dicocokkan: Verifikasi terlihat, Ganti pasien di menu membuka dialog", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
    await openMenu(user, "SDY-8F3K");
    await user.click(screen.getByRole("menuitem", { name: "Ganti pasien" }));
    expect(await screen.findByRole("dialog", { name: "Cocokkan pasien — SDY-8F3K" })).toBeInTheDocument();
  });

  it("booking situs yang sudah terkonfirmasi tidak lagi menawarkan Ganti pasien", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[{ ...base, status: "TERKONFIRMASI" }]} canReadRecords={false} />);
    await openMenu(user, "SDY-8F3K");
    expect(screen.queryByRole("menuitem", { name: "Ganti pasien" })).not.toBeInTheDocument();
  });
});

describe("AppointmentTable aksi per baris (spec C1 5.2)", () => {
  it("booking WA menunggu: Verifikasi dan Kirim instruksi transfer terlihat, sisanya di menu", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[waRow]} canReadRecords />);
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kirim instruksi transfer" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567890?text=Halo",
    );
    expect(screen.queryByRole("button", { name: "Batalkan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cocokkan pasien" })).not.toBeInTheDocument();
    await openMenu(user, "SDY-WA01");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Salin instruksi transfer",
      "Hadir",
      "Tidak hadir",
      "Batalkan",
    ]);
  });

  it("Salin instruksi transfer menyalin teks instruksinya", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[waRow]} canReadRecords={false} />);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Salin instruksi transfer" }));
    expect(await navigator.clipboard.readText()).toBe("Halo Siti, mohon transfer…");
  });

  it("Batalkan dari menu membuka dialog alasan", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[waRow]} canReadRecords={false} />);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Batalkan" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Batalkan booking SDY-WA01?");
  });

  it("terkonfirmasi: Hadir dan Kirim konfirmasi terlihat", () => {
    render(
      <AppointmentTable
        rows={[{ ...base, status: "TERKONFIRMASI", confirmation: { text: "Halo", link: "https://wa.me/62812?text=Halo" } }]}
        canReadRecords={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Hadir" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kirim konfirmasi" })).toHaveAttribute("href", "https://wa.me/62812?text=Halo");
  });

  it("Lihat isian ada di menu, hanya untuk yang berhak", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AppointmentTable rows={[base]} canReadRecords />);
    await openMenu(user, "SDY-8F3K");
    expect(screen.getByRole("menuitem", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    unmount();

    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    await openMenu(user, "SDY-8F3K");
    expect(screen.queryByRole("menuitem", { name: "Lihat isian" })).not.toBeInTheDocument();
  });

  it("baris tanpa aksi tidak menampilkan menu", () => {
    render(<AppointmentTable rows={[{ ...base, status: "SELESAI" }]} canReadRecords={false} />);
    expect(screen.queryByRole("button", { name: /Aksi lain/ })).not.toBeInTheDocument();
  });
});

describe("AppointmentTable batas", () => {
  it("menampilkan batas kedaluwarsa bila ada", () => {
    render(<AppointmentTable rows={[{ ...base, deadlineLabel: "Kedaluwarsa Sen, 5 Okt 15.00" }]} canReadRecords={false} />);
    expect(screen.getByText("Kedaluwarsa Sen, 5 Okt 15.00")).toHaveClass("text-amber-700");
  });

  it("batas transfer yang sudah lewat ditulis merah", () => {
    render(
      <AppointmentTable
        rows={[{ ...waRow, deadlineLabel: "Lewat batas transfer", deadlineOverdue: true }]}
        canReadRecords={false}
      />,
    );
    expect(screen.getByText("Lewat batas transfer")).toHaveClass("text-destructive");
  });

  it("tidak menampilkan apa pun bila tidak ada batas", () => {
    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.queryByText(/Kedaluwarsa|batas transfer/)).not.toBeInTheDocument();
  });
});

describe("AppointmentTable sorotan (spec C1 5.4)", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    // jsdom tidak punya scrollIntoView.
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("menyorot baris dari sorot dan menggulirnya ke tengah sekali", () => {
    render(<AppointmentTable rows={[base, waRow]} canReadRecords={false} highlightId="a2" />);
    const highlighted = document.querySelectorAll('[data-highlighted="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent("SDY-WA01");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("id yang tidak ada di daftar: tidak ada sorotan dan tidak ada galat", () => {
    render(<AppointmentTable rows={[base, waRow]} canReadRecords={false} highlightId="tidak-ada" />);
    expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

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

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/appointment-table.test.tsx`
Expected: FAIL. Tombol "Aksi lain …" dan tautan "Kirim instruksi transfer" tidak ada, dan `data-highlighted` belum ada.

- [ ] **Step 3: Jadikan `MatchPatientDialog` dikendalikan pemanggil**

`src/components/admin/match-patient-dialog.tsx` (seluruh berkas):

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import {
  createPatientFromIntake,
  getMatchCandidates,
  matchPatient,
  type MatchCandidates,
} from "@/server/intake";

/**
 * Dialog pencocokan pasien untuk booking situs. Dibuka oleh daftar booking,
 * baik dari tombol "Cocokkan pasien" maupun dari menu ⋯ "Ganti pasien". Item
 * menu tertutup begitu dipilih, jadi dialog tidak boleh hidup di dalamnya.
 */
export function MatchPatientDialog({
  appointmentId,
  code,
  open,
  onOpenChange,
}: {
  appointmentId: string;
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cocokkan pasien — {code}</DialogTitle>
          <DialogDescription>
            Pilih pasien lama yang benar-benar orang yang sama, atau buat pasien baru dari isian. Satu nomor
            WhatsApp sering dipakai sekeluarga — periksa nama dan tanggal lahir.
          </DialogDescription>
        </DialogHeader>
        <MatchPatientBody appointmentId={appointmentId} code={code} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Dipasang hanya selama dialog terbuka, sehingga kandidat dimuat sekali setiap kali dialog dibuka. */
function MatchPatientBody({
  appointmentId,
  code,
  onDone,
}: {
  appointmentId: string;
  code: string;
  onDone: () => void;
}) {
  const [data, setData] = useState<MatchCandidates | null>(null);
  const [pending, startTransition] = useTransition();
  // onDone terbaru dipakai tanpa memuat ulang kandidat setiap kali induknya dirender ulang.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let current = true;
    getMatchCandidates(appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          toast.error(result.error);
          onDoneRef.current();
          return;
        }
        setData(result.data);
      })
      .catch(() => {
        if (!current) return;
        toast.error("Gagal memuat data pasien. Coba lagi.");
        onDoneRef.current();
      });
    return () => {
      current = false;
    };
  }, [appointmentId]);

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        onDoneRef.current();
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  return (
    <>
      {!data ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{data.intake.name}</p>
            <p>
              {data.intake.whatsapp} · lahir {data.intake.birthDateLabel ?? "—"}
            </p>
            <p className="text-muted-foreground">
              {data.intake.claimsReturning ? "Mengaku pernah berobat di sini" : "Mengaku pasien baru"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Pasien yang mirip</p>
            {data.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada pasien dengan nomor WhatsApp, atau nama & tanggal lahir, yang sama.
              </p>
            ) : (
              data.candidates.map((candidate) => (
                <div key={candidate.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div>
                    <p className="font-medium">{candidate.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {candidate.medicalRecordNumber} · {candidate.whatsapp} · lahir {candidate.birthDateLabel ?? "—"} ·
                      kunjungan terakhir {candidate.lastVisitLabel ?? "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => matchPatient(appointmentId, candidate.id), `${code} dicocokkan dengan ${candidate.name}.`)
                    }
                  >
                    Pilih pasien ini
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          disabled={pending || !data}
          onClick={() => run(() => createPatientFromIntake(appointmentId), `Pasien baru dibuat untuk ${code}.`)}
        >
          Buat pasien baru
        </Button>
      </DialogFooter>
    </>
  );
}
```

- [ ] **Step 4: Tulis ulang `src/components/admin/appointment-table.tsx`**

```tsx
"use client";

import { EllipsisIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import { BOOKING_ACTION_LABEL, bookingRowActions, type BookingAction } from "@/lib/booking-actions";
import type { BookingSourceValue } from "@/lib/payment";
import { cn } from "@/lib/utils";
import {
  cancelAppointment,
  markAttended,
  markNoShow,
  verifyAppointment,
} from "@/server/appointment";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { MatchPatientDialog } from "./match-patient-dialog";

/** Hanya kolom yang dibutuhkan tabel — data klinis pasien tidak pernah dikirim ke browser. */
export type BookingRow = {
  id: string;
  code: string;
  status: AppointmentStatusValue;
  timeLabel: string;
  patientName: string;
  patientRecordNumber: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  source: BookingSourceValue;
  sourceLabel: string;
  notes: string | null;
  /** Hanya untuk booking terkonfirmasi (PRD F9). */
  confirmation: { text: string; link: string | null } | null;
  /** Booking WA/telepon berbiaya yang belum diverifikasi (spec C1 bagian 4). */
  transferInstruction: { text: string; link: string | null } | null;
  /** Booking situs yang belum dicocokkan dengan data pasien (spec 6.1). */
  needsMatch: boolean;
  /** Booking dari situs (punya isian): pencocokan pasien berlaku, dan boleh diganti sebelum diverifikasi (spec 6.1). */
  isSiteBooking: boolean;
  /** Isian pendaftaran booking ini, bila ada. */
  intakeId: string | null;
  /** Batas kedaluwarsa atau batas transfer, untuk daftar yang menunggu konfirmasi. */
  deadlineLabel?: string;
  /** Batas transfer sudah lewat: ditulis merah, tetapi booking tidak dibatalkan otomatis (B5). */
  deadlineOverdue?: boolean;
  /** Status isian booking ini (resepsionis boleh melihatnya, spec 6.2). */
  intakeStatus: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA" | null;
  /** Pasien yang sudah dicocokkan; null untuk booking situs yang belum dicocokkan. */
  patientId: string | null;
};

const INTAKE_STATUS_LABEL: Record<NonNullable<BookingRow["intakeStatus"]>, string> = {
  MENUNGGU_DIISI: "belum diisi",
  TERISI: "belum diperiksa",
  DIPERIKSA: "diperiksa",
};

/** Aksi membuka tautan, atau dijalankan di halaman ini. */
type ActionTarget = { href: string; external: boolean } | { onSelect: () => void };

export function AppointmentTable({
  rows,
  canReadRecords,
  highlightId = null,
}: {
  rows: BookingRow[];
  canReadRecords: boolean;
  /** Baris yang disorot dan digulir ke tengah, dari "Lihat di daftar" (spec C1 5.4). */
  highlightId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [matchTarget, setMatchTarget] = useState<BookingRow | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  // Sekali per sorotan. Dipanggil bersyarat karena jsdom tidak punya scrollIntoView.
  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: "center" });
  }, [highlightId]);

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  async function copy(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  function confirmCancel() {
    if (!cancelTarget) return;
    const target = cancelTarget;
    const reason = cancelReason;
    setCancelTarget(null);
    setCancelReason("");
    run(() => cancelAppointment(target.id, reason), `Booking ${target.code} dibatalkan.`);
  }

  function actionTarget(action: BookingAction, row: BookingRow): ActionTarget {
    switch (action) {
      case "VERIFY":
        return { onSelect: () => run(() => verifyAppointment(row.id), `Booking ${row.code} terkonfirmasi.`) };
      case "ATTEND":
        return { onSelect: () => run(() => markAttended(row.id), `${row.patientName} hadir.`) };
      case "NO_SHOW":
        return { onSelect: () => run(() => markNoShow(row.id), `${row.patientName} ditandai tidak hadir.`) };
      case "CANCEL":
        return { onSelect: () => setCancelTarget(row) };
      case "MATCH":
      case "CHANGE_PATIENT":
        return { onSelect: () => setMatchTarget(row) };
      case "SEND_TRANSFER":
        return { href: row.transferInstruction?.link ?? "", external: true };
      case "COPY_TRANSFER":
        return { onSelect: () => copy(row.transferInstruction?.text ?? "", "Instruksi transfer disalin.") };
      case "SEND_CONFIRMATION":
        return { href: row.confirmation?.link ?? "", external: true };
      case "COPY_CONFIRMATION":
        return { onSelect: () => copy(row.confirmation?.text ?? "", "Teks konfirmasi disalin.") };
      case "VIEW_INTAKE":
        return { href: `/admin/isian/${row.intakeId}`, external: false };
    }
  }

  function linkElement(target: { href: string; external: boolean }, label: string) {
    return target.external ? (
      <a href={target.href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    ) : (
      <Link href={target.href}>{label}</Link>
    );
  }

  function primaryAction(action: BookingAction, row: BookingRow) {
    const target = actionTarget(action, row);
    const label = BOOKING_ACTION_LABEL[action];
    const variant = action === "VERIFY" || action === "MATCH" ? "default" : "outline";
    if ("href" in target) {
      return (
        <Button key={action} size="sm" variant={variant} asChild>
          {linkElement(target, label)}
        </Button>
      );
    }
    return (
      <Button key={action} size="sm" variant={variant} disabled={pending} onClick={target.onSelect}>
        {label}
      </Button>
    );
  }

  function menuAction(action: BookingAction, row: BookingRow) {
    const target = actionTarget(action, row);
    const label = BOOKING_ACTION_LABEL[action];
    if ("href" in target) {
      return (
        <DropdownMenuItem key={action} asChild>
          {linkElement(target, label)}
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuItem
        key={action}
        variant={action === "CANCEL" ? "destructive" : "default"}
        disabled={pending}
        onSelect={target.onSelect}
      >
        {label}
      </DropdownMenuItem>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jam</TableHead>
            <TableHead>Pasien</TableHead>
            <TableHead>Layanan</TableHead>
            <TableHead>Tenaga</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const actions = bookingRowActions(row, canReadRecords);
            const highlighted = row.id === highlightId;
            return (
              <TableRow
                key={row.id}
                ref={highlighted ? highlightRef : undefined}
                data-highlighted={highlighted ? "true" : undefined}
                className={cn(highlighted && "bg-amber-100/70 hover:bg-amber-100")}
              >
                <TableCell className="align-top whitespace-nowrap">
                  <div className="font-medium">{row.timeLabel}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.code}</div>
                  {row.deadlineLabel && (
                    <div
                      className={cn(
                        "mt-1 text-xs font-medium",
                        row.deadlineOverdue ? "text-destructive" : "text-amber-700",
                      )}
                    >
                      {row.deadlineLabel}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <div className="font-medium">
                    {row.patientId ? (
                      <Link href={`/admin/pasien/${row.patientId}`} className="underline-offset-4 hover:underline">
                        {row.patientName}
                      </Link>
                    ) : (
                      row.patientName
                    )}
                  </div>
                  {row.needsMatch && (
                    <Badge variant="outline" className="mt-1">
                      Belum dicocokkan
                    </Badge>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {row.patientRecordNumber} · {row.sourceLabel}
                  </div>
                  {row.notes && <div className="mt-1 text-xs">{row.notes}</div>}
                </TableCell>
                <TableCell className="align-top">{row.serviceName}</TableCell>
                <TableCell className="align-top">
                  <div>{row.staffName}</div>
                  <div className="text-xs text-muted-foreground">{row.branchName}</div>
                </TableCell>
                <TableCell className="align-top">
                  <AppointmentStatusBadge status={row.status} />
                  {row.intakeStatus && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Isian: {INTAKE_STATUS_LABEL[row.intakeStatus]}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap items-center gap-1">
                    {actions.primary.map((action) => primaryAction(action, row))}
                    {actions.menu.length > 0 && (
                      // Tanpa modal: dialog yang dibuka dari menu tidak boleh mewarisi kunci pointer menu.
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" aria-label={`Aksi lain ${row.code}`}>
                            <EllipsisIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {actions.menu.map((action) => menuAction(action, row))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {matchTarget && (
        <MatchPatientDialog
          key={matchTarget.id}
          appointmentId={matchTarget.id}
          code={matchTarget.code}
          open
          onOpenChange={(open) => {
            if (!open) setMatchTarget(null);
          }}
        />
      )}

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan booking {cancelTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.patientName}, {cancelTarget?.timeLabel}. Slotnya akan dibuka kembali.
              Booking tetap tersimpan dengan status Dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="cancel-reason">Alasan (opsional)</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Misal: pasien minta jadwal ulang minggu depan"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmCancel}>
              Batalkan Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 5: Isi kolom baru di `toRow` halaman booking**

`src/app/(admin)/admin/booking/page.tsx`: ganti impor `@/lib/transfer-instruction` dari Task 4, lalu tambahkan dua impor lain:

```ts
import type { BankAccount } from "@/lib/payment";
import { bookingServiceName, pendingDeadlineLabel, transferInstructionFor } from "@/lib/transfer-instruction";
import { getClinicSetting } from "@/server/clinic-setting";
```

Ganti `toRow` dengan:

```ts
function toRow(a: ListedAppointment, bank: BankAccount): BookingRow {
  const serviceName = bookingServiceName(a);
  const start = timeLabel(a.startAt);
  // Booking situs boleh belum punya pasien sampai admin mencocokkannya;
  // CHECK di basis data menjamin booking terkonfirmasi selalu punya pasien.
  const patient = a.patient;
  const confirmationText =
    a.status === "TERKONFIRMASI" && patient
      ? patientBookingConfirmationMessage({
          patientName: patient.name,
          code: a.code,
          serviceName,
          staffName: a.staff.name,
          branchName: a.branch.name,
          dateLabel: formatIndonesianDate(a.startAt),
          timeLabel: start,
        })
      : null;
  const transfer = transferInstructionFor(a, bank);

  return {
    id: a.id,
    code: a.code,
    status: a.status,
    timeLabel: `${start}–${timeLabel(a.endAt)}`,
    patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
    patientRecordNumber: patient?.medicalRecordNumber ?? "—",
    needsMatch: patient === null,
    isSiteBooking: a.source === "SITUS" && a.intake !== null,
    intakeId: a.intake?.id ?? null,
    intakeStatus: a.intake?.status ?? null,
    patientId: patient?.id ?? null,
    serviceName,
    staffName: a.staff.name,
    branchName: a.branch.name,
    source: a.source,
    sourceLabel: SOURCE_LABEL[a.source] ?? a.source,
    notes: a.notes,
    confirmation:
      confirmationText && patient
        ? {
            text: confirmationText,
            link: buildWhatsAppLinkTo(patient.whatsapp, confirmationText),
          }
        : null,
    transferInstruction: transfer ? { text: transfer.text, link: transfer.link } : null,
  };
}
```

Tambahkan `getClinicSetting()` sebagai anggota terakhir `Promise.all` (variabel `setting`), lalu ganti setiap `toRow(a)` menjadi `toRow(a, setting)`. Di `pendingRows`, tambahkan `deadlineOverdue: a.overdue` setelah `deadlineLabel`.

- [ ] **Step 6: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/appointment-table.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/match-patient-dialog.tsx src/components/admin/appointment-table.tsx "src/app/(admin)/admin/booking/page.tsx" tests/unit/components/appointment-table.test.tsx
git commit -m "feat: booking rows show at most two actions with the rest in a menu, plus transfer instructions and highlighting"
```

---

### Task 6: Halaman Booking — "Menunggu konfirmasi", pencarian, dan sorotan

**Files:**
- Modify: `src/app/(admin)/admin/booking/page.tsx` (seluruh berkas)

**Interfaces:**
- Consumes: `listPendingBookings`, `searchBookings`, `listAppointments` (Task 4); `AppointmentTable` dengan `highlightId` dan `BookingRow` baru (Task 5); `pendingDeadlineLabel`, `transferInstructionFor`, `bookingServiceName` (Task 1).
- Produces:
  - URL `/admin/booking?cari={teks}`: hasil pencarian menggantikan daftar per tanggal dan filter
  - URL `/admin/booking?tanggal={YYYY-MM-DD}&sorot={id}`: baris itu disorot di daftar per tanggal
  - Region "Menunggu konfirmasi (n)" dan region "Hasil pencarian “…” (n)"; kotak cari berlabel "Cari kode, nama, atau WA" (dipakai e2e di Task 9)

Halaman ini komponen server. Logikanya sudah diuji di Task 4 dan Task 5, dan perilakunya di layar diuji e2e di Task 9.

- [ ] **Step 1: Tulis ulang `src/app/(admin)/admin/booking/page.tsx`**

```tsx
import Form from "next/form";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { BookingFilters } from "@/components/admin/booking-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAppointmentStatus } from "@/lib/appointment-status";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import type { BankAccount } from "@/lib/payment";
import { can } from "@/lib/permissions";
import {
  addDaysToDateString,
  combineWitaDateAndMinutes,
  minutesToTimeLabel,
  witaDateString,
  witaMinutesOfDay,
} from "@/lib/time";
import { bookingServiceName, pendingDeadlineLabel, transferInstructionFor } from "@/lib/transfer-instruction";
import { buildWhatsAppLinkTo, patientBookingConfirmationMessage } from "@/lib/whatsapp";
import { listAppointments, listPendingBookings, searchBookings } from "@/server/appointment";
import { getBranches } from "@/server/catalog";
import { getClinicSetting } from "@/server/clinic-setting";
import { listSchedulableStaff } from "@/server/schedule";
import { requireCapability } from "@/server/session";

const SOURCE_LABEL: Record<string, string> = {
  SITUS: "Situs",
  WHATSAPP: "WhatsApp",
  TELEPON: "Telepon",
  WALK_IN: "Walk-in",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function timeLabel(date: Date): string {
  return minutesToTimeLabel(witaMinutesOfDay(date));
}

type ListedAppointment = Awaited<ReturnType<typeof listAppointments>>[number];

function toRow(a: ListedAppointment, bank: BankAccount): BookingRow {
  const serviceName = bookingServiceName(a);
  const start = timeLabel(a.startAt);
  // Booking situs boleh belum punya pasien sampai admin mencocokkannya;
  // CHECK di basis data menjamin booking terkonfirmasi selalu punya pasien.
  const patient = a.patient;
  const confirmationText =
    a.status === "TERKONFIRMASI" && patient
      ? patientBookingConfirmationMessage({
          patientName: patient.name,
          code: a.code,
          serviceName,
          staffName: a.staff.name,
          branchName: a.branch.name,
          dateLabel: formatIndonesianDate(a.startAt),
          timeLabel: start,
        })
      : null;
  const transfer = transferInstructionFor(a, bank);

  return {
    id: a.id,
    code: a.code,
    status: a.status,
    timeLabel: `${start}–${timeLabel(a.endAt)}`,
    patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
    patientRecordNumber: patient?.medicalRecordNumber ?? "—",
    needsMatch: patient === null,
    isSiteBooking: a.source === "SITUS" && a.intake !== null,
    intakeId: a.intake?.id ?? null,
    intakeStatus: a.intake?.status ?? null,
    patientId: patient?.id ?? null,
    serviceName,
    staffName: a.staff.name,
    branchName: a.branch.name,
    source: a.source,
    sourceLabel: SOURCE_LABEL[a.source] ?? a.source,
    notes: a.notes,
    confirmation:
      confirmationText && patient
        ? {
            text: confirmationText,
            link: buildWhatsAppLinkTo(patient.whatsapp, confirmationText),
          }
        : null,
    transferInstruction: transfer ? { text: transfer.text, link: transfer.link } : null,
  };
}

/** Daftar tanpa batas satu tanggal: jam jadwal ditulis bersama tanggalnya. */
function withDate(row: BookingRow, startAt: Date): BookingRow {
  return { ...row, timeLabel: `${formatShortIndonesianDate(startAt)} · ${row.timeLabel}` };
}

export default async function BookingListPage({
  searchParams,
}: {
  searchParams: Promise<{
    tanggal?: string;
    status?: string;
    staf?: string;
    cabang?: string;
    isian?: string;
    cari?: string;
    sorot?: string;
  }>;
}) {
  const staff = await requireCapability("booking:manage");
  const params = await searchParams;
  const canReadRecords = can(staff.role, "record:read");

  const today = witaDateString(new Date());
  const date = params.tanggal && DATE_PATTERN.test(params.tanggal) ? params.tanggal : today;
  const status = isAppointmentStatus(params.status) ? params.status : null;
  // Filter isian berlaku untuk semua tanggal: isian lama pun harus terlihat (spec 6.5).
  const unreviewedOnly = params.isian === "belum-diperiksa";
  // Selama kotak cari berisi, daftar per tanggal dan filternya disembunyikan (spec C1 5.3).
  const query = params.cari?.trim() ?? "";

  const [appointments, pending, found, staffList, branches, setting] = await Promise.all([
    query
      ? Promise.resolve([] as ListedAppointment[])
      : listAppointments({
          date: unreviewedOnly ? undefined : date,
          status: status ?? undefined,
          staffId: params.staf || undefined,
          branchId: params.cabang || undefined,
          intakeStatus: unreviewedOnly ? "TERISI" : undefined,
        }),
    listPendingBookings(),
    query ? searchBookings(query) : Promise.resolve([] as ListedAppointment[]),
    listSchedulableStaff(),
    getBranches(),
    getClinicSetting(),
  ]);

  // Label tanggal dari tengah hari WITA, agar tidak bergeser ke hari lain.
  const dateLabel = formatIndonesianDate(combineWitaDateAndMinutes(date, 12 * 60));

  const rows = appointments.map((a) => (unreviewedOnly ? withDate(toRow(a, setting), a.startAt) : toRow(a, setting)));
  const pendingRows: BookingRow[] = pending.map((a) => ({
    ...withDate(toRow(a, setting), a.startAt),
    deadlineLabel: pendingDeadlineLabel({ kind: a.deadlineKind, deadline: a.deadline, overdue: a.overdue }),
    deadlineOverdue: a.overdue,
  }));
  const foundRows = found.map((a) => withDate(toRow(a, setting), a.startAt));

  const dayLink = (d: string) => {
    const next = new URLSearchParams({ tanggal: d });
    if (status) next.set("status", status);
    if (params.staf) next.set("staf", params.staf);
    if (params.cabang) next.set("cabang", params.cabang);
    return `/admin/booking?${next.toString()}`;
  };

  return (
    <>
      <AdminHeader title="Booking" />
      <div className="space-y-6 p-6">
        {pendingRows.length > 0 && (
          <section
            aria-labelledby="booking-menunggu"
            className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/60 p-4"
          >
            <div>
              <h2 id="booking-menunggu" className="text-lg font-medium">
                Menunggu konfirmasi ({pendingRows.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                Semua tanggal, yang paling mendesak di atas. Verifikasi setelah bukti transfer diterima. Booking
                situs kedaluwarsa sendiri; booking WhatsApp dan telepon tidak, batas transfernya hanya pengingat.
                Hari Minggu dan hari libur tidak dihitung.
              </p>
            </div>
            <AppointmentTable rows={pendingRows} canReadRecords={canReadRecords} />
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Form action="/admin/booking" role="search" className="flex w-full max-w-md gap-2">
            <Input
              key={query}
              name="cari"
              defaultValue={query}
              placeholder="Cari kode, nama, atau WA"
              aria-label="Cari kode, nama, atau WA"
              autoComplete="off"
            />
            <Button type="submit" variant="outline">
              Cari
            </Button>
          </Form>
          <Button asChild>
            <Link href="/admin/booking/baru">+ Booking Baru</Link>
          </Button>
        </div>

        {query ? (
          <section aria-labelledby="hasil-cari" className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="hasil-cari" className="text-lg font-medium">
                Hasil pencarian “{query}” ({foundRows.length})
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/booking">Kembali ke daftar per tanggal</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Jadwal 30 hari ke belakang sampai seterusnya, terbaru di atas, paling banyak 50 booking.
            </p>
            {foundRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada booking yang cocok.</p>
            ) : (
              <AppointmentTable rows={foundRows} canReadRecords={canReadRecords} />
            )}
          </section>
        ) : (
          <>
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

            <BookingFilters
              date={date}
              status={status}
              staffId={params.staf || null}
              branchId={params.cabang || null}
              intake={unreviewedOnly ? "belum-diperiksa" : null}
              staff={staffList.map((s) => ({ id: s.id, name: s.name }))}
              branches={branches
                .filter((b) => b.status === "AKTIF")
                .map((b) => ({ id: b.id, name: b.name }))}
            />

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {unreviewedOnly
                  ? "Tidak ada isian yang menunggu diperiksa."
                  : `Tidak ada booking${status ? " dengan status ini" : ""} pada tanggal ini.`}
              </p>
            ) : (
              <AppointmentTable rows={rows} canReadRecords={canReadRecords} highlightId={params.sorot ?? null} />
            )}
          </>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Periksa tipe, lint, dan aturan arsitektur**

Run: `npx tsc --noEmit && npm run lint && npx vitest run tests/unit/architecture.test.ts`
Expected: bersih dan PASS (halaman tidak mengimpor `@/lib/db` atau `@prisma/client`).

- [ ] **Step 3: Periksa sekilas di peramban**

Run: `npm run dev`, masuk sebagai admin, lalu buka:
- `/admin/booking`: region "Menunggu konfirmasi" (bila ada), kotak cari, dan daftar hari ini;
- `/admin/booking?cari=%20`: kembali ke daftar per tanggal;
- `/admin/booking?tanggal=<tanggal booking yang ada>&sorot=<id booking itu>`: barisnya berlatar kuning dan berada di tengah layar;
- `/admin/booking?sorot=tidak-ada`: tidak ada sorotan dan tidak ada galat.

Hentikan `npm run dev` sesudahnya. Uji e2e di Task 9 mengulang pemeriksaan ini secara otomatis.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/booking/page.tsx"
git commit -m "feat: booking page lists all bookings awaiting confirmation, searches bookings, and highlights a booking"
```

---

### Task 7: Komponen Booking Baru — info pasien, strip tanggal, ringkasan, panel "Booking dibuat"

**Files:**
- Modify: `src/components/admin/patient-picker.tsx`
- Create: `src/components/admin/date-strip.tsx`
- Create: `src/components/admin/booking-summary.tsx`
- Create: `src/components/admin/booking-created-panel.tsx`
- Test: `tests/unit/components/patient-picker.test.tsx`, `tests/unit/components/date-strip.test.tsx`, `tests/unit/components/booking-summary.test.tsx`, `tests/unit/components/booking-created-panel.test.tsx`

**Interfaces:**
- Consumes: `PatientSummary` dengan `lastVisitAt`/`nextBookingAt` (Task 3); `getStaffAvailabilityRange`, `DayAvailability` dari `@/server/schedule` (Task 2); `TransferInstruction`, `MISSING_BANK_ACCOUNT_LINE` (Task 1); `bookingFeeFor` dari `@/lib/payment`.
- Produces:
  - `PatientBookingInfo({ patient })` dari `patient-picker.tsx`
  - `DateStrip({ staffId, branchId, durationMinutes, today, selected, onSelect, refreshKey })`, dengan `STRIP_DAYS = 14`. Grup "Pilih tanggal"; tiap tombol punya `data-date` dan nama "Senin, 5 Oktober 2026 — 6 jam kosong"
  - `AdminBookingSource = "WHATSAPP" | "TELEPON" | "WALK_IN"`, `ADMIN_SOURCES`, `ADMIN_SOURCE_LABEL`, `SummaryItem`, `bookingSummaryItems(input)`, `BookingSummary({ items })`
  - `CreatedBooking = { id; code; date: string; instruction: TransferInstruction | null; instructionFailed: boolean }`, `BookingCreatedPanel({ booking, dateLabel, onNew })`

- [ ] **Step 1: Tulis uji yang gagal untuk keempat komponen**

`tests/unit/components/patient-picker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PatientPicker } from "@/components/admin/patient-picker";
import { searchPatients, type PatientSummary } from "@/server/patient";

vi.mock("@/server/patient", () => ({
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  findPatientsByWhatsapp: vi.fn(),
}));

const patient = (patch: Partial<PatientSummary>): PatientSummary => ({
  id: "p1",
  medicalRecordNumber: "SDY-2026-0012",
  name: "Maria Wenas",
  whatsapp: "6281234567001",
  programStatus: "AKTIF",
  lastVisitAt: null,
  nextBookingAt: null,
  ...patch,
});

describe("PatientPicker", () => {
  it("hasil pencarian menampilkan kunjungan terakhir dan booking berikutnya", async () => {
    vi.mocked(searchPatients).mockResolvedValue([
      patient({ lastVisitAt: new Date("2026-09-24T03:00:00Z"), nextBookingAt: new Date("2026-10-07T03:30:00Z") }),
      patient({ id: "p2", name: "Maria Baru", medicalRecordNumber: "SDY-2026-0013" }),
    ]);
    const user = userEvent.setup();
    render(<PatientPicker onSelect={vi.fn()} />);

    await user.type(screen.getByLabelText(/Cari pasien/), "maria");

    const known = await screen.findByRole("button", { name: /Maria Wenas/ });
    expect(known).toHaveTextContent("Kunjungan terakhir Kam, 24 Sep");
    expect(known).toHaveTextContent("booking berikutnya Rab, 7 Okt 11.30");
    const fresh = screen.getByRole("button", { name: /Maria Baru/ });
    expect(fresh).toHaveTextContent("Kunjungan terakhir belum pernah");
    expect(fresh).not.toHaveTextContent("booking berikutnya");
  });
});
```

`tests/unit/components/date-strip.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateStrip } from "@/components/admin/date-strip";
import { addDaysToDateString } from "@/lib/time";
import { getStaffAvailabilityRange, type DayAvailability } from "@/server/schedule";

vi.mock("@/server/schedule", () => ({ getStaffAvailabilityRange: vi.fn() }));

const TODAY = "2026-10-05"; // Senin
const day = (index: number, state: DayAvailability["state"], openCount = 0): DayAvailability => ({
  date: addDaysToDateString(TODAY, index),
  state,
  openCount,
});
/** 14 hari: hari yang diberikan, sisanya buka 8 jam. */
const strip = (first: DayAvailability[]): DayAvailability[] =>
  Array.from({ length: 14 }, (_, index) => first[index] ?? day(index, "OPEN", 8));

function renderStrip(patch: Partial<Parameters<typeof DateStrip>[0]> = {}) {
  const onSelect = vi.fn();
  const props = {
    staffId: "s1",
    branchId: "b1",
    durationMinutes: 30,
    today: TODAY,
    selected: "",
    onSelect,
    refreshKey: 0,
    ...patch,
  };
  const view = render(<DateStrip {...props} />);
  return { onSelect, props, ...view };
}

beforeEach(() => vi.clearAllMocks());

describe("DateStrip", () => {
  it("menampilkan jam kosong, penuh, dan tutup; hanya hari yang buka bisa dipilih", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(
      strip([day(0, "OPEN", 6), day(1, "FULL"), day(2, "CLOSED")]),
    );
    const user = userEvent.setup();
    const { onSelect } = renderStrip();

    const open = await screen.findByRole("button", { name: "Senin, 5 Oktober 2026 — 6 jam kosong" });
    expect(open).toHaveTextContent("6 jam");
    expect(screen.getByRole("button", { name: "Selasa, 6 Oktober 2026 — penuh" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rabu, 7 Oktober 2026 — tutup" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /— / })).toHaveLength(14);

    await user.click(open);
    expect(onSelect).toHaveBeenCalledWith("2026-10-05");
    expect(getStaffAvailabilityRange).toHaveBeenCalledWith({
      staffId: "s1",
      branchId: "b1",
      durationMinutes: 30,
      from: TODAY,
      days: 14,
    });
  });

  it("menandai tanggal yang sedang dipilih", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(strip([]));
    renderStrip({ selected: "2026-10-06" });
    expect(await screen.findByRole("button", { name: /6 Oktober 2026/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("tanpa jadwal 14 hari: semua tutup dan ada petunjuk ke Pilih tanggal lain", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(Array.from({ length: 14 }, (_, i) => day(i, "CLOSED")));
    renderStrip();
    expect(
      await screen.findByText("Tidak ada jadwal dalam 14 hari ke depan — gunakan Pilih tanggal lain."),
    ).toBeInTheDocument();
  });

  it("Pilih tanggal lain membuka isian tanggal dengan batas hari ini", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(strip([]));
    const user = userEvent.setup();
    const { onSelect } = renderStrip();

    await user.click(screen.getByRole("button", { name: "Pilih tanggal lain" }));
    const input = screen.getByLabelText("Tanggal lain");
    expect(input).toHaveAttribute("min", TODAY);
    fireEvent.change(input, { target: { value: "2026-11-02" } });
    expect(onSelect).toHaveBeenCalledWith("2026-11-02");
  });

  it("dimuat ulang saat refreshKey naik", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(strip([]));
    const { props, rerender } = renderStrip();
    await screen.findByRole("group", { name: "Pilih tanggal" });
    rerender(<DateStrip {...props} refreshKey={1} />);
    await screen.findByRole("group", { name: "Pilih tanggal" });
    expect(getStaffAvailabilityRange).toHaveBeenCalledTimes(2);
  });

  it("galat memuat: pesan, dan isian tanggal lain tetap bisa dipakai", async () => {
    vi.mocked(getStaffAvailabilityRange).mockRejectedValue(new Error("jaringan"));
    renderStrip();
    expect(await screen.findByText("Gagal memuat tanggal. Gunakan Pilih tanggal lain.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pilih tanggal lain" })).toBeInTheDocument();
  });
});
```

`tests/unit/components/booking-summary.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingSummary, bookingSummaryItems } from "@/components/admin/booking-summary";

const empty = {
  patientName: null,
  serviceName: null,
  startAt: null,
  staffName: null,
  branchName: null,
  source: "WHATSAPP" as const,
  bookingFee: 100000,
};

describe("ringkasan Booking Baru", () => {
  it("baris yang belum diisi bertuliskan belum dipilih; sumber dan biaya selalu terisi", () => {
    render(<BookingSummary items={bookingSummaryItems(empty)} />);
    const values = Object.fromEntries(
      screen.getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(values).toEqual({
      Pasien: "belum dipilih",
      Layanan: "belum dipilih",
      Jadwal: "belum dipilih",
      Tenaga: "belum dipilih",
      Cabang: "belum dipilih",
      Sumber: "WhatsApp",
      "Biaya booking": "Rp 100.000",
    });
  });

  it("terisi bertahap", () => {
    const items = bookingSummaryItems({
      ...empty,
      patientName: "Maria Wenas",
      serviceName: "Konsultasi Dokter",
      startAt: new Date("2026-10-05T03:30:00Z"),
      staffName: "dr. Diane",
      branchName: "SunDY Mahakeret",
      source: "TELEPON",
    });
    expect(items.map((item) => [item.label, item.value])).toEqual([
      ["Pasien", "Maria Wenas"],
      ["Layanan", "Konsultasi Dokter"],
      ["Jadwal", "Sen, 5 Okt · 11.30"],
      ["Tenaga", "dr. Diane"],
      ["Cabang", "SunDY Mahakeret"],
      ["Sumber", "Telepon"],
      ["Biaya booking", "Rp 100.000"],
    ]);
  });

  it("walk-in tanpa biaya booking", () => {
    const fee = bookingSummaryItems({ ...empty, source: "WALK_IN" }).find((item) => item.label === "Biaya booking");
    expect(fee?.value).toBe("tanpa biaya booking");
  });
});
```

`tests/unit/components/booking-created-panel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookingCreatedPanel, type CreatedBooking } from "@/components/admin/booking-created-panel";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEXT = "Halo Maria Wenas, booking Anda di SunDY Clinic sudah kami catat.\nKode: SDY-7KQ2";
const created: CreatedBooking = {
  id: "a1",
  code: "SDY-7KQ2",
  date: "2026-10-05",
  instruction: {
    text: TEXT,
    link: `https://wa.me/6281234567001?text=${encodeURIComponent(TEXT)}`,
    deadline: new Date("2026-10-05T03:00:00Z"),
    missingBankAccount: false,
  },
  instructionFailed: false,
};

function renderPanel(booking: CreatedBooking) {
  const onNew = vi.fn();
  render(<BookingCreatedPanel booking={booking} dateLabel="Sen, 5 Okt" onNew={onNew} />);
  return onNew;
}

describe("BookingCreatedPanel", () => {
  it("tautan WA ke nomor pasien dengan kode booking di teksnya, dan Lihat di daftar menyorot booking itu", () => {
    renderPanel(created);
    expect(screen.getByRole("heading", { name: "✓ Booking SDY-7KQ2 dibuat" })).toBeInTheDocument();
    const wa = screen.getByRole("link", { name: "Kirim instruksi transfer via WA" });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/6281234567001\?text=/);
    expect(decodeURIComponent(wa.getAttribute("href")!)).toContain("Kode: SDY-7KQ2");
    expect(screen.getByRole("link", { name: "Lihat di daftar (Sen, 5 Okt)" })).toHaveAttribute(
      "href",
      "/admin/booking?tanggal=2026-10-05&sorot=a1",
    );
  });

  it("Salin teks menyalin instruksi yang sama", async () => {
    const user = userEvent.setup();
    renderPanel(created);
    await user.click(screen.getByRole("button", { name: "Salin teks" }));
    expect(await navigator.clipboard.readText()).toBe(TEXT);
  });

  it("walk-in atau tanpa biaya: tanpa instruksi transfer, tetap ada Lihat di daftar dan + Booking baru", async () => {
    const user = userEvent.setup();
    const onNew = renderPanel({ ...created, instruction: null });
    expect(screen.queryByRole("link", { name: /Kirim instruksi transfer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salin teks" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lihat di daftar/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Booking baru" }));
    expect(onNew).toHaveBeenCalled();
  });

  it("rekening kosong di Pengaturan: peringatan", () => {
    renderPanel({ ...created, instruction: { ...created.instruction!, missingBankAccount: true } });
    expect(screen.getByText(/Rekening belum diisi di Pengaturan/)).toBeInTheDocument();
  });

  it("nomor WA pasien tidak sah: hanya Salin teks, dengan keterangan", () => {
    renderPanel({ ...created, instruction: { ...created.instruction!, link: null } });
    expect(screen.queryByRole("link", { name: /Kirim instruksi transfer/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nomor WhatsApp pasien tidak dikenali.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salin teks" })).toBeInTheDocument();
  });

  it("instruksi gagal dimuat: arahkan ke daftar", () => {
    renderPanel({ ...created, instruction: null, instructionFailed: true });
    expect(screen.getByText(/Instruksi transfer gagal dimuat/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/patient-picker.test.tsx tests/unit/components/date-strip.test.tsx tests/unit/components/booking-summary.test.tsx tests/unit/components/booking-created-panel.test.tsx`
Expected: FAIL. Ketiga komponen baru belum ada, dan hasil pencarian pasien belum menampilkan kunjungan terakhir.

- [ ] **Step 3: Tambahkan `PatientBookingInfo` ke `src/components/admin/patient-picker.tsx`**

Tambahkan impor:

```ts
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
```

Tambahkan di atas `PatientPicker`:

```tsx
/** Kunjungan terakhir dan booking aktif berikutnya: booking ganda ketahuan sebelum dibuat (spec C1 bagian 3). */
export function PatientBookingInfo({ patient }: { patient: PatientSummary }) {
  return (
    <span className="block text-xs text-muted-foreground">
      Kunjungan terakhir {patient.lastVisitAt ? formatShortIndonesianDate(patient.lastVisitAt) : "belum pernah"}
      {patient.nextBookingAt && (
        <>
          {" · "}
          <span className="font-medium text-amber-700">
            booking berikutnya {formatShortIndonesianDate(patient.nextBookingAt)}{" "}
            {minutesToTimeLabel(witaMinutesOfDay(patient.nextBookingAt))}
          </span>
        </>
      )}
    </span>
  );
}
```

Di daftar hasil, ganti isi `<button>` dengan:

```tsx
                <span className="font-medium">{patient.name}</span>
                <span className="ml-2 text-muted-foreground">
                  {patient.medicalRecordNumber} · {patient.whatsapp}
                </span>
                <PatientBookingInfo patient={patient} />
```

- [ ] **Step 4: Tulis `src/components/admin/date-strip.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getStaffAvailabilityRange, type DayAvailability } from "@/server/schedule";

export const STRIP_DAYS = 14;

type Props = {
  staffId: string;
  branchId: string;
  durationMinutes: number;
  /** Hari ini dalam WITA, dari server. */
  today: string;
  /** Tanggal terpilih ("YYYY-MM-DD"), atau "" bila belum ada. */
  selected: string;
  onSelect: (date: string) => void;
  /** Dinaikkan oleh form untuk memaksa muat ulang, misal setelah jam direbut booking lain. */
  refreshKey: number;
};

type LoadState = { key: string; days: DayAvailability[]; failed: boolean };

function stateLabel(day: DayAvailability): string {
  if (day.state === "CLOSED") return "tutup";
  if (day.state === "FULL") return "penuh";
  return `${day.openCount} jam`;
}

/** Tengah hari WITA, agar label tanggal tidak bergeser ke hari lain. */
function noon(date: string): Date {
  return combineWitaDateAndMinutes(date, 12 * 60);
}

/** Strip 14 hari mulai hari ini, dan isian untuk tanggal di luarnya (spec C1 bagian 3). */
export function DateStrip({ staffId, branchId, durationMinutes, today, selected, onSelect, refreshKey }: Props) {
  const requestKey = `${staffId}|${branchId}|${durationMinutes}|${today}|${refreshKey}`;
  const [loaded, setLoaded] = useState<LoadState>({ key: "", days: [], failed: false });
  const [showOtherDate, setShowOtherDate] = useState(false);
  const latestKey = useRef(requestKey);

  useEffect(() => {
    latestKey.current = requestKey;
    getStaffAvailabilityRange({ staffId, branchId, durationMinutes, from: today, days: STRIP_DAYS })
      .then((days) => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, days, failed: false });
      })
      .catch(() => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, days: [], failed: true });
      });
  }, [requestKey, staffId, branchId, durationMinutes, today]);

  const ready = loaded.key === requestKey;
  const inStrip = loaded.days.some((day) => day.date === selected);

  return (
    <div className="space-y-3">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Memuat tanggal…</p>
      ) : loaded.failed ? (
        <p className="text-sm text-destructive">Gagal memuat tanggal. Gunakan Pilih tanggal lain.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih tanggal">
            {loaded.days.map((day) => {
              const open = day.state === "OPEN";
              const isSelected = day.date === selected;
              return (
                <button
                  key={day.date}
                  type="button"
                  data-date={day.date}
                  disabled={!open}
                  aria-pressed={isSelected}
                  aria-label={`${formatIndonesianDate(noon(day.date))} — ${open ? `${day.openCount} jam kosong` : stateLabel(day)}`}
                  onClick={() => onSelect(day.date)}
                  className={cn(
                    "flex w-[4.75rem] flex-col items-center rounded-lg border px-1 py-2 text-xs transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : open
                        ? "bg-background hover:bg-accent"
                        : "cursor-not-allowed bg-muted text-muted-foreground",
                  )}
                >
                  <span>{formatShortIndonesianDate(noon(day.date))}</span>
                  <span className="mt-1 font-medium">{stateLabel(day)}</span>
                </button>
              );
            })}
          </div>
          {loaded.days.every((day) => day.state === "CLOSED") && (
            <p className="text-sm text-muted-foreground">
              Tidak ada jadwal dalam {STRIP_DAYS} hari ke depan — gunakan Pilih tanggal lain.
            </p>
          )}
        </>
      )}

      {showOtherDate ? (
        <div className="space-y-1">
          <Label htmlFor="booking-date-other">Tanggal lain</Label>
          <Input
            id="booking-date-other"
            type="date"
            min={today}
            value={inStrip ? "" : selected}
            onChange={(e) => onSelect(e.target.value)}
            className="w-44"
          />
        </div>
      ) : (
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => setShowOtherDate(true)}>
          Pilih tanggal lain
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Tulis `src/components/admin/booking-summary.tsx`**

```tsx
import { formatRupiah, formatShortIndonesianDate } from "@/lib/format";
import { bookingFeeFor } from "@/lib/payment";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Sumber booking yang dicatat admin; booking situs dibuat customer sendiri. */
export type AdminBookingSource = "WHATSAPP" | "TELEPON" | "WALK_IN";

export const ADMIN_SOURCES: readonly AdminBookingSource[] = ["WHATSAPP", "TELEPON", "WALK_IN"];

export const ADMIN_SOURCE_LABEL: Record<AdminBookingSource, string> = {
  WHATSAPP: "WhatsApp",
  TELEPON: "Telepon",
  WALK_IN: "Walk-in",
};

export type SummaryItem = { label: string; value: string | null };

/** Isi ringkasan di kolom kanan Booking Baru (spec C1 bagian 3); null tampil sebagai "belum dipilih". */
export function bookingSummaryItems(input: {
  patientName: string | null;
  serviceName: string | null;
  startAt: Date | null;
  staffName: string | null;
  branchName: string | null;
  source: AdminBookingSource;
  /** Biaya dari Pengaturan; yang tersimpan disalin server saat booking dibuat. */
  bookingFee: number;
}): SummaryItem[] {
  const fee = bookingFeeFor(input.source, input.bookingFee);
  return [
    { label: "Pasien", value: input.patientName },
    { label: "Layanan", value: input.serviceName },
    {
      label: "Jadwal",
      value: input.startAt
        ? `${formatShortIndonesianDate(input.startAt)} · ${minutesToTimeLabel(witaMinutesOfDay(input.startAt))}`
        : null,
    },
    { label: "Tenaga", value: input.staffName },
    { label: "Cabang", value: input.branchName },
    { label: "Sumber", value: ADMIN_SOURCE_LABEL[input.source] },
    { label: "Biaya booking", value: fee === null ? "tanpa biaya booking" : formatRupiah(fee) },
  ];
}

export function BookingSummary({ items }: { items: SummaryItem[] }) {
  return (
    <dl className="divide-y text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex justify-between gap-3 py-1.5">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className={cn("text-right", item.value ? "font-medium" : "text-muted-foreground")}>
            {item.value ?? "belum dipilih"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

Catatan: elemen `dt` memiliki peran ARIA `term`, sehingga uji ringkasan memakai `getAllByRole("term")`.

- [ ] **Step 6: Tulis `src/components/admin/booking-created-panel.tsx`**

```tsx
"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MISSING_BANK_ACCOUNT_LINE, type TransferInstruction } from "@/lib/transfer-instruction";

export type CreatedBooking = {
  id: string;
  code: string;
  /** Tanggal jadwal (WITA, "YYYY-MM-DD"), untuk "Lihat di daftar". */
  date: string;
  /** null untuk walk-in atau booking tanpa biaya. */
  instruction: TransferInstruction | null;
  /** Booking tersimpan, tetapi instruksinya gagal dimuat. */
  instructionFailed: boolean;
};

/** Pengganti ringkasan setelah Buat Booking berhasil (spec C1 bagian 4). */
export function BookingCreatedPanel({
  booking,
  dateLabel,
  onNew,
}: {
  booking: CreatedBooking;
  /** Tanggal jadwal singkat, misal "Sen, 5 Okt". */
  dateLabel: string;
  onNew: () => void;
}) {
  const { instruction } = booking;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Instruksi transfer disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50/60 p-4">
      <h2 className="font-medium">✓ Booking {booking.code} dibuat</h2>

      {booking.instructionFailed && (
        <p className="text-sm text-destructive">
          Instruksi transfer gagal dimuat. Buka booking ini di daftar untuk mengirimnya.
        </p>
      )}

      {instruction && (
        <div className="space-y-2">
          {instruction.missingBankAccount && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
              Rekening belum diisi di Pengaturan. Teks menulis &quot;{MISSING_BANK_ACCOUNT_LINE}&quot;.
            </p>
          )}
          {instruction.link ? (
            <Button asChild className="w-full bg-emerald-700 text-white hover:bg-emerald-800">
              <a href={instruction.link} target="_blank" rel="noopener noreferrer">
                Kirim instruksi transfer via WA
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Nomor WhatsApp pasien tidak dikenali.</p>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={() => copy(instruction.text)}>
            Salin teks
          </Button>
        </div>
      )}

      <Button asChild variant="outline" className="w-full">
        <Link href={`/admin/booking?tanggal=${booking.date}&sorot=${booking.id}`}>Lihat di daftar ({dateLabel})</Link>
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onNew}>
        + Booking baru
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/patient-picker.test.tsx tests/unit/components/date-strip.test.tsx tests/unit/components/booking-summary.test.tsx tests/unit/components/booking-created-panel.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/patient-picker.tsx src/components/admin/date-strip.tsx src/components/admin/booking-summary.tsx src/components/admin/booking-created-panel.tsx tests/unit/components/patient-picker.test.tsx tests/unit/components/date-strip.test.tsx tests/unit/components/booking-summary.test.tsx tests/unit/components/booking-created-panel.test.tsx
git commit -m "feat: add the date strip, booking summary, created-booking panel, and patient visit info"
```

---

### Task 8: Formulir Booking Baru dua kolom

**Files:**
- Modify: `src/components/admin/appointment-form.tsx` (seluruh berkas)
- Modify: `src/components/admin/slot-picker.tsx` (tombol jam)
- Modify: `src/app/(admin)/admin/booking/baru/page.tsx`
- Test: `tests/unit/components/appointment-form.test.tsx`

**Interfaces:**
- Consumes: semua komponen Task 7; `createAppointment`, `getTransferInstruction` (Task 4); `getClinicSetting`.
- Produces:
  - `AppointmentForm` bertambah prop `bookingFee: number`
  - Sumber booking berupa grup tombol "Sumber booking" (WhatsApp sebagai pilihan awal)
  - `<aside aria-label="Ringkasan booking">` berisi ringkasan, tombol "Buat Booking", lalu panel "Booking dibuat"
  - `#booking-staff` tetap ada (dipakai e2e)

- [ ] **Step 1: Tulis uji formulir yang gagal**

`tests/unit/components/appointment-form.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { AppointmentForm } from "@/components/admin/appointment-form";
import { addDaysToDateString, combineWitaDateAndMinutes } from "@/lib/time";
import { createAppointment, getTransferInstruction } from "@/server/appointment";
import { searchPatients, type PatientSummary } from "@/server/patient";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange, type DayAvailability } from "@/server/schedule";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({ createAppointment: vi.fn(), getTransferInstruction: vi.fn() }));
vi.mock("@/server/patient", () => ({
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  findPatientsByWhatsapp: vi.fn(),
}));
vi.mock("@/server/schedule", () => ({
  getStaffAvailabilityRange: vi.fn(),
  getStaffAvailabilityForAdmin: vi.fn(),
}));

const TODAY = "2026-10-05"; // Senin
const START = combineWitaDateAndMinutes(TODAY, 11 * 60);
const SLOT = { startAt: START, endAt: combineWitaDateAndMinutes(TODAY, 11 * 60 + 30), label: "11.00" };
const MARIA: PatientSummary = {
  id: "p1",
  medicalRecordNumber: "SDY-2026-0012",
  name: "Maria Wenas",
  whatsapp: "6281234567001",
  programStatus: "AKTIF",
  lastVisitAt: null,
  nextBookingAt: null,
};

function renderForm() {
  return render(
    <AppointmentForm
      branches={[{ id: "b1", name: "SunDY Mahakeret" }]}
      staff={[{ id: "d1", name: "dr. Diane", role: "DOKTER" }]}
      treatmentGroups={[]}
      consultationServiceId="svc-konsultasi"
      today={TODAY}
      bookingFee={100000}
    />,
  );
}

const summary = () => screen.getByRole("complementary", { name: "Ringkasan booking" });

async function fillBooking(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Cari pasien/), "maria");
  await user.click(await screen.findByRole("button", { name: /Maria Wenas/ }));
  await user.click(await screen.findByRole("button", { name: "Senin, 5 Oktober 2026 — 2 jam kosong" }));
  await user.click(await screen.findByRole("button", { name: "11.00" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchPatients).mockResolvedValue([MARIA]);
  vi.mocked(getStaffAvailabilityRange).mockResolvedValue(
    Array.from({ length: 14 }, (_, index): DayAvailability => ({
      date: addDaysToDateString(TODAY, index),
      state: index === 0 ? "OPEN" : "CLOSED",
      openCount: index === 0 ? 2 : 0,
    })),
  );
  vi.mocked(getStaffAvailabilityForAdmin).mockResolvedValue([SLOT]);
  vi.mocked(createAppointment).mockResolvedValue({ ok: true, data: { id: "a1", code: "SDY-7KQ2", startAt: START } as never });
  vi.mocked(getTransferInstruction).mockResolvedValue({
    ok: true,
    data: {
      text: "Halo Maria",
      link: "https://wa.me/6281234567001?text=Halo%20Maria",
      deadline: START,
      missingBankAccount: false,
    },
  });
});

describe("AppointmentForm", () => {
  it("WhatsApp terpilih di awal, dan strip tampil karena dokter satu-satunya langsung terpilih", async () => {
    renderForm();
    expect(screen.getByRole("button", { name: "WhatsApp" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("group", { name: "Pilih tanggal" })).toBeInTheDocument();
    expect(getStaffAvailabilityRange).toHaveBeenCalledWith({
      staffId: "d1",
      branchId: "b1",
      durationMinutes: 30,
      from: TODAY,
      days: 14,
    });
    expect(screen.getByText("Pilih tanggal dulu.")).toBeInTheDocument();
  });

  it("ringkasan terisi bertahap, lalu Buat Booking menampilkan panel dengan instruksi transfer", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(summary()).toHaveTextContent("Pasienbelum dipilih");

    await fillBooking(user);
    expect(summary()).toHaveTextContent("PasienMaria Wenas");
    expect(summary()).toHaveTextContent("JadwalSen, 5 Okt · 11.00");

    await user.click(screen.getByRole("button", { name: "Buat Booking" }));

    expect(await screen.findByRole("heading", { name: "✓ Booking SDY-7KQ2 dibuat" })).toBeInTheDocument();
    expect(createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: "p1",
        staffId: "d1",
        branchId: "b1",
        serviceId: "svc-konsultasi",
        type: "KONSULTASI",
        source: "WHATSAPP",
        startAt: START,
      }),
    );
    expect(getTransferInstruction).toHaveBeenCalledWith("a1");
    expect(screen.getByRole("link", { name: "Kirim instruksi transfer via WA" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567001?text=Halo%20Maria",
    );
    expect(screen.getByRole("link", { name: /Lihat di daftar/ })).toHaveAttribute(
      "href",
      "/admin/booking?tanggal=2026-10-05&sorot=a1",
    );
  });

  it("setelah dibuat formulir terkunci sampai + Booking baru, yang mempertahankan sumber terakhir", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Telepon" }));
    await fillBooking(user);
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    await screen.findByRole("heading", { name: "✓ Booking SDY-7KQ2 dibuat" });

    expect(screen.queryByRole("button", { name: "Buat Booking" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telepon" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "+ Booking baru" }));

    expect(screen.queryByRole("heading", { name: /Booking SDY-7KQ2 dibuat/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telepon" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Telepon" })).toBeEnabled();
    expect(screen.getByLabelText(/Cari pasien/)).toHaveValue("");
    expect(summary()).toHaveTextContent("Jadwalbelum dipilih");
    expect(screen.getByRole("button", { name: "Buat Booking" })).toBeEnabled();
  });

  it("jam direbut booking lain: pesan galat, jam dikosongkan, tanggal tetap, strip dan jam dimuat ulang", async () => {
    vi.mocked(createAppointment).mockResolvedValue({ ok: false, error: "Slot baru saja terisi. Pilih jam lain." });
    const user = userEvent.setup();
    renderForm();
    await fillBooking(user);

    await user.click(screen.getByRole("button", { name: "Buat Booking" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Slot baru saja terisi. Pilih jam lain."));
    await waitFor(() => expect(getStaffAvailabilityRange).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStaffAvailabilityForAdmin).toHaveBeenCalledTimes(2));
    expect(summary()).toHaveTextContent("Jadwalbelum dipilih");
    expect(await screen.findByRole("button", { name: "Senin, 5 Oktober 2026 — 2 jam kosong" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(getTransferInstruction).not.toHaveBeenCalled();
  });

  it("Buat Booking tanpa pasien menyebutkan apa yang kurang", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    expect(toast.error).toHaveBeenCalledWith("Pilih atau buat pasien terlebih dahulu.");
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("booking tersimpan walau instruksi transfer gagal dimuat", async () => {
    vi.mocked(getTransferInstruction).mockRejectedValue(new Error("jaringan"));
    const user = userEvent.setup();
    renderForm();
    await fillBooking(user);
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    expect(await screen.findByRole("heading", { name: "✓ Booking SDY-7KQ2 dibuat" })).toBeInTheDocument();
    expect(screen.getByText(/Instruksi transfer gagal dimuat/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/appointment-form.test.tsx`
Expected: FAIL. Belum ada grup "Pilih tanggal", tombol sumber, ringkasan, atau panel.

- [ ] **Step 3: Perbesar tombol jam di `src/components/admin/slot-picker.tsx`**

Ganti tombol jam:

```tsx
          <Button
            key={slot.startAt.toISOString()}
            type="button"
            variant={isSelected ? "default" : "outline"}
            aria-pressed={isSelected}
            className="min-w-20"
            onClick={() => onSelect(slot)}
          >
            {slot.label}
          </Button>
```

- [ ] **Step 4: Tulis ulang `src/components/admin/appointment-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatShortIndonesianDate } from "@/lib/format";
import type { SlotOption } from "@/lib/slot";
import { combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import type { TransferInstruction } from "@/lib/transfer-instruction";
import { createAppointment, getTransferInstruction } from "@/server/appointment";
import type { PatientSummary } from "@/server/patient";
import { BookingCreatedPanel, type CreatedBooking } from "./booking-created-panel";
import {
  ADMIN_SOURCE_LABEL,
  ADMIN_SOURCES,
  BookingSummary,
  bookingSummaryItems,
  type AdminBookingSource,
} from "./booking-summary";
import { DateStrip } from "./date-strip";
import { PatientBookingInfo, PatientPicker } from "./patient-picker";
import { SlotPicker } from "./slot-picker";

export type BookingStaffOption = { id: string; name: string; role: "DOKTER" | "TERAPIS" };
export type BookingServiceOption = {
  id: string;
  name: string;
  durationMin: number;
  requiresDoctor: boolean;
};
export type BookingServiceGroup = { name: string; services: BookingServiceOption[] };

type Props = {
  branches: { id: string; name: string }[];
  staff: BookingStaffOption[];
  treatmentGroups: BookingServiceGroup[];
  /** Baris layanan "Konsultasi Dokter", agar konsultasi tetap tercatat sebagai layanan. */
  consultationServiceId: string | null;
  /** Tanggal hari ini dalam WITA, dihitung di server agar tidak bergantung jam perangkat. */
  today: string;
  /** Biaya booking dari Pengaturan, untuk ringkasan. Biaya yang tersimpan disalin server saat booking dibuat. */
  bookingFee: number;
};

type BookingKind = "KONSULTASI" | "TREATMENT";

const CONSULTATION_MINUTES = 30;

/**
 * Booking Baru (spec C1 bagian 3–4): langkah di kiri boleh diisi dalam urutan
 * apa pun; ringkasan di kanan menempel saat menggulir, lalu menampilkan panel
 * "Booking dibuat". Halaman tidak pindah setelah simpan.
 */
export function AppointmentForm({
  branches,
  staff,
  treatmentGroups,
  consultationServiceId,
  today,
  bookingFee,
}: Props) {
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [kind, setKind] = useState<BookingKind>("KONSULTASI");
  const [serviceId, setServiceId] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
  const [source, setSource] = useState<AdminBookingSource>("WHATSAPP");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [notes, setNotes] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [pending, startTransition] = useTransition();

  const treatment = treatmentGroups
    .flatMap((g) => g.services)
    .find((s) => s.id === serviceId);
  const durationMinutes = kind === "KONSULTASI" ? CONSULTATION_MINUTES : treatment?.durationMin;
  const needsDoctor = kind === "KONSULTASI" || treatment?.requiresDoctor === true;
  const eligibleStaff = staff.filter((s) => !needsDoctor || s.role === "DOKTER");

  // Tenaga yang sudah dipilih bisa menjadi tidak sah saat jenis/layanan
  // berganti (misal terapis, lalu layanan diganti ke Botox). Bila hanya ada
  // satu pilihan sah, langsung dipakai — satu klik lebih sedikit di telepon.
  const effectiveStaffId = eligibleStaff.some((s) => s.id === staffId)
    ? staffId
    : eligibleStaff.length === 1
      ? eligibleStaff[0].id
      : "";

  const canPickDate = Boolean(effectiveStaffId && branchId && durationMinutes);
  const serviceName = kind === "KONSULTASI" ? "Konsultasi Dokter" : (treatment?.name ?? null);
  const staffName = staff.find((s) => s.id === effectiveStaffId)?.name ?? null;
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;

  // Layanan, tenaga, atau cabang berganti: strip dihitung ulang dari kuncinya
  // sendiri, dan jam yang sudah dipilih dikosongkan.
  function resetSlot() {
    setSlot(null);
  }

  function startNew() {
    setCreated(null);
    setPatient(null);
    setKind("KONSULTASI");
    setServiceId("");
    setStaffId("");
    setDate("");
    setSlot(null);
    setNotes("");
    setRefreshKey((k) => k + 1);
    // Sumber dan cabang tetap: admin biasanya mencatat beberapa booking WA berturut-turut.
  }

  function handleSubmit() {
    if (!patient) {
      toast.error("Pilih atau buat pasien terlebih dahulu.");
      return;
    }
    if (kind === "TREATMENT" && !treatment) {
      toast.error("Pilih layanan treatment.");
      return;
    }
    if (!effectiveStaffId || !slot) {
      toast.error("Pilih tenaga, tanggal, dan jam terlebih dahulu.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createAppointment({
          patientId: patient.id,
          branchId,
          staffId: effectiveStaffId,
          serviceId: kind === "KONSULTASI" ? consultationServiceId : serviceId,
          type: kind,
          startAt: slot.startAt,
          endAt: slot.endAt,
          source,
          notes: notes.trim() || undefined,
        });
        if (!result.ok) {
          toast.error(result.error);
          // Jam yang baru saja direbut booking lain harus hilang dari pilihan.
          setSlot(null);
          setRefreshKey((k) => k + 1);
          return;
        }

        // Booking sudah tersimpan; instruksi yang gagal dimuat tidak membatalkannya.
        let instruction: TransferInstruction | null = null;
        let instructionFailed = false;
        try {
          const transfer = await getTransferInstruction(result.data.id);
          if (transfer.ok) instruction = transfer.data;
          else instructionFailed = true;
        } catch {
          instructionFailed = true;
        }
        setCreated({
          id: result.data.id,
          code: result.data.code,
          date: witaDateString(result.data.startAt),
          instruction,
          instructionFailed,
        });
      } catch {
        toast.error("Gagal membuat booking. Coba lagi.");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <fieldset disabled={created !== null} className="min-w-0 space-y-8 disabled:opacity-60">
        <section className="space-y-2">
          <h2 className="text-sm font-medium">1 · Pasien</h2>
          {patient ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>
                <span className="font-medium">{patient.name}</span>{" "}
                <span className="text-muted-foreground">
                  ({patient.medicalRecordNumber} · {patient.whatsapp})
                </span>
                <PatientBookingInfo patient={patient} />
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPatient(null)}>
                Ganti pasien
              </Button>
            </div>
          ) : (
            <PatientPicker onSelect={setPatient} />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">2 · Layanan & tenaga</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Jenis booking">
            {(["KONSULTASI", "TREATMENT"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={kind === k ? "default" : "outline"}
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  resetSlot();
                }}
              >
                {k === "KONSULTASI" ? "Konsultasi Dokter (30 menit)" : "Treatment"}
              </Button>
            ))}
          </div>

          {kind === "TREATMENT" && (
            <div className="space-y-1">
              <Label htmlFor="booking-service">Layanan</Label>
              <Select
                value={serviceId}
                onValueChange={(v) => {
                  setServiceId(v);
                  resetSlot();
                }}
              >
                <SelectTrigger id="booking-service" className="w-full sm:w-96">
                  <SelectValue placeholder="Pilih layanan" />
                </SelectTrigger>
                <SelectContent>
                  {treatmentGroups.map((group) => (
                    <SelectGroup key={group.name}>
                      <SelectLabel>{group.name}</SelectLabel>
                      {group.services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {s.durationMin} menit{s.requiresDoctor ? " · dokter" : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {branches.length > 1 && (
              <div className="space-y-1">
                <Label htmlFor="booking-branch">Cabang</Label>
                <Select
                  value={branchId}
                  onValueChange={(v) => {
                    setBranchId(v);
                    resetSlot();
                  }}
                >
                  <SelectTrigger id="booking-branch" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="booking-staff">Tenaga</Label>
              <Select
                value={effectiveStaffId}
                onValueChange={(v) => {
                  setStaffId(v);
                  resetSlot();
                }}
              >
                <SelectTrigger id="booking-staff" className="w-full">
                  <SelectValue placeholder="Pilih tenaga" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsDoctor && (
                <p className="text-xs text-muted-foreground">Hanya dokter yang ditampilkan.</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <p id="booking-source-label" className="text-sm font-medium">
              Sumber booking
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="booking-source-label">
              {ADMIN_SOURCES.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={source === value ? "default" : "outline"}
                  aria-pressed={source === value}
                  onClick={() => setSource(value)}
                >
                  {ADMIN_SOURCE_LABEL[value]}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">3 · Tanggal</h2>
          {canPickDate ? (
            <DateStrip
              staffId={effectiveStaffId}
              branchId={branchId}
              durationMinutes={durationMinutes!}
              today={today}
              selected={date}
              onSelect={(d) => {
                setDate(d);
                resetSlot();
              }}
              refreshKey={refreshKey}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Pilih layanan dan tenaga dulu.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">4 · Jam</h2>
          {canPickDate && date ? (
            <SlotPicker
              staffId={effectiveStaffId}
              branchId={branchId}
              date={date}
              durationMinutes={durationMinutes!}
              selected={slot}
              onSelect={setSlot}
              refreshKey={refreshKey}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Pilih tanggal dulu.</p>
          )}
        </section>

        <section className="space-y-1">
          <Label htmlFor="booking-notes">Catatan (opsional)</Label>
          <Input
            id="booking-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Misal: keluhan utama, permintaan khusus"
          />
        </section>
      </fieldset>

      <aside aria-label="Ringkasan booking" className="space-y-4 lg:sticky lg:top-4">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-medium">Ringkasan</h2>
          <BookingSummary
            items={bookingSummaryItems({
              patientName: patient?.name ?? null,
              serviceName,
              startAt: slot?.startAt ?? null,
              staffName,
              branchName,
              source,
              bookingFee,
            })}
          />
          {!created && (
            <Button type="button" className="w-full" disabled={pending} onClick={handleSubmit}>
              {pending ? "Menyimpan…" : "Buat Booking"}
            </Button>
          )}
        </div>
        {created && (
          <BookingCreatedPanel
            booking={created}
            dateLabel={formatShortIndonesianDate(combineWitaDateAndMinutes(created.date, 12 * 60))}
            onNew={startNew}
          />
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Teruskan biaya booking dari halaman**

`src/app/(admin)/admin/booking/baru/page.tsx`: tambahkan impor dan anggota `Promise.all`:

```ts
import { getClinicSetting } from "@/server/clinic-setting";
```

```ts
  const [branches, categories, staffList, setting] = await Promise.all([
    getBranches(),
    getServiceCategoriesWithServices(),
    listSchedulableStaff(),
    getClinicSetting(),
  ]);
```

Tambahkan prop ke `AppointmentForm`:

```tsx
            bookingFee={setting.bookingFee}
```

- [ ] **Step 6: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/appointment-form.test.tsx tests/unit/components`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/appointment-form.tsx src/components/admin/slot-picker.tsx "src/app/(admin)/admin/booking/baru/page.tsx" tests/unit/components/appointment-form.test.tsx
git commit -m "feat: two-column new-booking page with a date strip, sticky summary, and a created-booking panel"
```

---

### Task 9: Uji ujung-ke-ujung dan status spec

**Files:**
- Modify: `tests/e2e/admin-booking.spec.ts`
- Modify: `tests/e2e/gizi-klinik.spec.ts:64-71`
- Modify: `tests/e2e/public-registration.spec.ts:93-104,120,163`
- Modify: `docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md:5`

**Interfaces:**
- Consumes: semua label dari Task 4–8: grup "Pilih tanggal" (`data-date`), heading "✓ Booking {kode} dibuat", tautan "Kirim instruksi transfer via WA", tautan "Lihat di daftar (…)", `tr[data-highlighted="true"]`, region `/^Menunggu konfirmasi/`, kotak "Cari kode, nama, atau WA", region `/^Hasil pencarian/`, tombol `Aksi lain {kode}`, menuitem "Lihat isian", badge `/^\d+ booking menunggu konfirmasi$/`.

- [ ] **Step 1: Tulis uji e2e Booking Baru yang gagal**

`tests/e2e/admin-booking.spec.ts`: ganti `openConsultationSlots` dengan:

```ts
async function openConsultationSlots(page: Page, date: string) {
  // Konsultasi adalah pilihan bawaan dan dr. Diane satu-satunya dokter,
  // sehingga tenaga sudah terpilih otomatis dan strip tanggal langsung tampil.
  await expect(page.locator("#booking-staff")).toContainText("Diane");
  await page
    .getByRole("group", { name: "Pilih tanggal" })
    .locator(`[data-date="${date}"]`)
    .click({ timeout: 30_000 });
  await expect(slotButtons(page).first()).toBeVisible({ timeout: 30_000 });
}
```

Ganti uji pertama ("admin mencatat booking telepon dari nol lalu memverifikasinya") dengan:

```ts
test("admin mencatat booking WA lewat strip tanggal, mengirim instruksi transfer, lalu menemukannya lagi", async ({
  page,
}, testInfo) => {
  const date = bookingDate(testInfo);
  const patientName = `Pasien E2E ${Date.now().toString().slice(-6)}`;

  await signIn(page);
  await page.goto("/admin/booking/baru");
  await createPatientInForm(page, patientName, uniqueWhatsapp("12"));
  // WhatsApp adalah sumber bawaan.
  await expect(page.getByRole("button", { name: "WhatsApp", exact: true })).toHaveAttribute("aria-pressed", "true");
  await openConsultationSlots(page, date);

  const slot = slotButtons(page).first();
  const slotLabel = (await slot.textContent())!;
  await slot.click();
  await page.getByRole("button", { name: "Buat Booking" }).click();

  // Halaman tidak pindah: ringkasan berganti panel "Booking dibuat".
  const heading = page.getByRole("heading", { name: /Booking SDY-[A-Z0-9]{4} dibuat/ });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const code = (await heading.textContent())!.match(/SDY-[A-Z0-9]{4}/)![0];
  await expect(page).toHaveURL(/\/admin\/booking\/baru$/);

  // Instruksi transfer ke nomor pasien, bukan nomor klinik, dan memuat kode booking.
  const transferLink = page.getByRole("link", { name: "Kirim instruksi transfer via WA" });
  await expect(transferLink).toHaveAttribute("href", /^https:\/\/wa\.me\/628/);
  await expect(transferLink).not.toHaveAttribute("href", /wa\.me\/6285172228900/);
  await expect(transferLink).toHaveAttribute("href", new RegExp(code));

  // "Lihat di daftar" membuka tanggal booking dengan tepat satu baris tersorot.
  await page.getByRole("link", { name: /Lihat di daftar/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/booking\\?tanggal=${date}&sorot=`), { timeout: 30_000 });
  const row = page.locator('tr[data-highlighted="true"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(code);
  await expect(row).toContainText(slotLabel);
  await expect(row).toContainText("Menunggu Konfirmasi");

  // Booking WA ikut daftar "Menunggu konfirmasi" dengan batas transfernya.
  const pendingRow = page
    .getByRole("region", { name: /^Menunggu konfirmasi/ })
    .getByRole("row")
    .filter({ hasText: code });
  await expect(pendingRow).toContainText("Batas transfer");

  // Verifikasi dari baris tersorot; booking keluar dari daftar menunggu.
  await row.getByRole("button", { name: "Verifikasi" }).click();
  await expect(row).toContainText("Terkonfirmasi", { timeout: 30_000 });
  await expect(pendingRow).toHaveCount(0);
  const confirmLink = row.getByRole("link", { name: "Kirim konfirmasi" });
  await expect(confirmLink).toHaveAttribute("href", /^https:\/\/wa\.me\/628/);

  // Pencarian per kode tanpa peduli huruf besar/kecil, dengan tanggal di barisnya.
  const search = page.getByLabel("Cari kode, nama, atau WA");
  await search.fill(code.toLowerCase());
  await search.press("Enter");
  const results = page.getByRole("region", { name: /^Hasil pencarian/ });
  await expect(results.getByRole("row").filter({ hasText: code })).toContainText(slotLabel, { timeout: 30_000 });
});
```

Pada uji rebutan slot, ganti baris

```ts
  await expect(first).toHaveURL(/\/admin\/booking$/, { timeout: 30_000 });
```

dengan

```ts
  await expect(first.getByRole("heading", { name: /Booking SDY-[A-Z0-9]{4} dibuat/ })).toBeVisible({
    timeout: 30_000,
  });
```

Fiturnya sudah ada sejak Task 8, jadi buktikan dulu bahwa uji ini menangkap kesalahan. Di `src/components/admin/booking-created-panel.tsx`, ubah sementara `href` "Lihat di daftar" menjadi `` `/admin/booking?tanggal=${booking.date}` `` (tanpa `&sorot=`).

Run: `npx playwright test tests/e2e/admin-booking.spec.ts --project=desktop -g "strip tanggal"`
Expected: FAIL pada `toHaveURL(…&sorot=)`.

Kembalikan perubahan itu (`git checkout src/components/admin/booking-created-panel.tsx`).

Run: `npx playwright test tests/e2e/admin-booking.spec.ts`
Expected: PASS (2 uji × 2 proyek).

- [ ] **Step 2: Sesuaikan uji e2e yang memakai daftar booking**

`tests/e2e/gizi-klinik.spec.ts`: ganti blok pencarian baris dan klik "Lihat isian":

```ts
  const row = page
    .getByRole("region", { name: /^Menunggu konfirmasi/ })
    .getByRole("row")
    .filter({ hasText: code! });
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await page.getByRole("menuitem", { name: "Lihat isian" }).click();
```

`tests/e2e/public-registration.spec.ts`:

```ts
  const pending = page.getByRole("region", { name: /^Menunggu konfirmasi/ });
```

```ts
    await expect(page.getByLabel(/^\d+ booking menunggu konfirmasi$/)).toBeVisible();
```

Di uji yang sama, ganti `await row.getByRole("link", { name: "Lihat isian" }).click();` dengan:

```ts
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await page.getByRole("menuitem", { name: "Lihat isian" }).click();
```

Di uji resepsionis, ganti `await expect(row.getByRole("link", { name: "Lihat isian" })).toHaveCount(0);` dengan:

```ts
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await expect(page.getByRole("menuitem", { name: "Batalkan" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Lihat isian" })).toHaveCount(0);
  await page.keyboard.press("Escape");
```

Run: `npx playwright test tests/e2e/gizi-klinik.spec.ts tests/e2e/public-registration.spec.ts`
Expected: PASS.

- [ ] **Step 3: Jalankan seluruh e2e**

Run: `npm run test:e2e`
Expected: PASS. Uji `public-site.spec.ts` dan "Verifikasi" kadang kehabisan waktu karena `next dev` lambat saat banyak worker. Jalankan ulang berkas itu sendirian dan catat hasilnya. Bila disk laptop hampir penuh, kosongkan dulu atau jalankan per berkas.

- [ ] **Step 4: Status spec dan verifikasi akhir**

Di `docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md`, ganti baris status menjadi:

```markdown
- **Status:** Disetujui pemilik (1 Oktober 2026) · terlaksana (<tanggal hari ini>)
```

Lalu jalankan:

```bash
npx vitest run
npm run test:integration
npx tsc --noEmit
npm run lint
```

Expected: semuanya PASS atau bersih.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/admin-booking.spec.ts tests/e2e/gizi-klinik.spec.ts tests/e2e/public-registration.spec.ts docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md
git commit -m "test: record a WhatsApp booking end to end and find it again; mark the booking UI spec done"
```
