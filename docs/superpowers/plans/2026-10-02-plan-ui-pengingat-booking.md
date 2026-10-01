# Plan — UI Panel Admin Bagian C2: Konfirmasi, Pengingat H-1, dan Pindah Jadwal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setelah Verifikasi, admin langsung bisa mengirim konfirmasi lengkap lewat WA. Halaman Pengingat menampilkan konfirmasi yang belum dikirim, pasien yang perlu diingatkan sehari kerja sebelum jadwalnya, dan balasan mereka. Booking bisa dipindah jadwalnya tanpa dibatalkan.

**Architecture:**
- **Data:**
  - Satu migrasi aditif: tabel `AppointmentMessage`, satu baris per pesan WA yang dicatat terkirim. Tabel `Appointment` tidak diubah.
  - Sebuah catatan berlaku bila belum dibatalkan dan `scheduledFor` sama dengan `startAt` booking saat ini.
- **Aturan murni:**
  - `src/lib/booking-messages.ts`: teks konfirmasi dan teks pengingat, jenis pesan, label balasan;
  - `src/lib/reminder-work.ts`: catatan yang berlaku, hari pengingat, pengelompokan kotak 1–3, keterangan di baris booking.
- **Server:**
  - `src/server/appointment-message.ts`: catat kirim, batalkan tanda, catat balasan, pesan lanjutan;
  - `src/server/reminder.ts`: daftar kerja dan angka menu;
  - fungsi ketersediaan admin menerima `excludeAppointmentId`.
- **Klien:**
  - komponen umum: `WhatsAppSendButton`, `MessageActions`, `SendMessageDialog`, `RescheduleDialog`;
  - tabel booking: dialog setelah Verifikasi, pencatatan pengiriman, keterangan pesan, dan menu "Pindah jadwal";
  - halaman baru `/admin/pengingat` dengan menu dan angka di samping;
  - `/cek-booking?kode=` mengisi kolom kode.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Prisma 7.10 + PostgreSQL · Tailwind v4 · shadcn/ui (Radix) · Vitest 4 + Testing Library + user-event · Playwright

**Spec:** `docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md` (keputusan P1–P8, bagian 3–8). Aturan C1 (instruksi transfer, `bookingRowActions`, `DateStrip`, `SlotPicker`) ada di `docs/superpowers/specs/2026-10-01-ui-booking-admin-design.md`.

**Base branch:** `desain-ui-pengingat` (berisi spec dan plan ini). Kerjakan di branch baru `ui-pengingat-booking` dari branch itu.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar. Panel admin memakai kata "pasien"; pesan WA ke customer memakai "Anda".
- **Zona waktu:** WITA. Tanggal hari dihitung dengan `witaDateString`, tidak dari tanggal UTC.
- **Hak akses:** semua fungsi server baru memakai `booking:manage` (resepsionis boleh). Tidak ada data klinis yang ditambahkan ke objek mana pun.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (ekspor tipe boleh). Pembantu yang tidak boleh dipanggil browser (`site-url.ts`, `availability.ts`, `booking-expiry.ts`) **tidak** memakai `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`, dan komponen tidak mengimpor `@/lib/db` (dijaga `tests/unit/architecture.test.ts`).
- **Migrasi** ditulis tangan di `prisma/migrations/`, lalu diterapkan berurutan:
  - `npx prisma migrate deploy`;
  - `npm run db:migrate:test`;
  - `npx prisma generate`;
  - `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` harus keluar dengan kode 0.
- **Pesan WA dikirim manual.** Tidak ada API WhatsApp. "Salin teks" tidak pernah mencatat pengiriman.
- **Format kode:** repo tidak memakai Prettier. Ikuti format kode di sekitarnya.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`). Jangan jalankan bersamaan dengan `npm run test:e2e`.
- **Commit** memakai Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. **Jangan pernah men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Admin menekan tombol WA, WhatsApp terbuka, tetapi pencatatan gagal** (jaringan, sesi habis). Toast menjelaskan bahwa pengiriman belum tercatat, dan baris tetap di kotaknya → uji di Task 6 (`WhatsAppSendButton`: hasil `ok: false` dan lemparan galat).
2. **Booking pagi hari (07.00 WITA = 23.00 UTC hari sebelumnya).** Hari pengingat dihitung dari tanggal WITA, sehingga booking Selasa 07.00 diingatkan Senin dan tidak ditandai "terlambat" → uji di Task 2.
3. **Dua admin bekerja bersamaan:** satu membatalkan tanda pengingat, admin lain lalu mencatat balasan untuk pengingat itu. Pesan jelas "sudah tidak berlaku", dan tidak ada balasan yang tersimpan → uji di Task 3.
4. **"Salin teks" dipakai, tetapi pesan tidak jadi dikirim.** Tidak ada catatan pengiriman, dan booking tetap di kotaknya → uji di Task 6 (`MessageActions`).
5. **`/cek-booking?kode=` berisi huruf kecil, spasi, karakter aneh, atau parameter ganda.** Kolom kode terisi versi yang dibersihkan atau kosong, tanpa galat → uji di Task 8 (`bookingCodeFromParam`).

---

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/format.ts` | + `formatScheduleForMessage` ("Senin, 5 Oktober 2026 pukul 11.00 WITA") |
| `src/lib/transfer-instruction.ts` | memakai `formatScheduleForMessage` (tanpa perubahan perilaku) |
| `src/lib/booking-messages.ts` (baru) | jenis pesan, balasan, teks konfirmasi dan pengingat, pembentuk pesan dari booking |
| `src/lib/booking-actions.ts` | + aksi `RESCHEDULE`, tipe `RescheduleTarget` |
| `src/lib/reminder-work.ts` (baru) | catatan berlaku, `reminderDay`, `groupReminderWork`, `messageStatusLabels` |
| `prisma/schema.prisma`, `prisma/migrations/20261002120000_pesan_booking/` | tabel `AppointmentMessage` |
| `src/server/site-url.ts` (baru) | alamat situs publik dari `BETTER_AUTH_URL` |
| `src/server/appointment-message.ts` (baru) | aksi pesan (catat, batalkan, balasan, pesan lanjutan) |
| `src/server/appointment.ts` | `messages` di `BOOKING_LIST_INCLUDE`; revalidasi `/admin/pengingat` |
| `src/server/reminder.ts` (baru) | daftar kerja Pengingat dan angka menu |
| `src/server/availability.ts`, `src/server/schedule.ts` | `excludeAppointmentId` |
| `src/components/admin/whatsapp-send-button.tsx` (baru) | tautan WA yang sekaligus mencatat pengiriman |
| `src/components/admin/message-actions.tsx` (baru) | tombol kirim WA + Salin teks |
| `src/components/admin/send-message-dialog.tsx` (baru) | dialog setelah Verifikasi |
| `src/components/admin/reschedule-dialog.tsx` (baru) | dialog Pindah jadwal |
| `src/components/admin/date-strip.tsx`, `slot-picker.tsx` | prop `excludeAppointmentId` |
| `src/components/admin/appointment-table.tsx` | dialog Verifikasi, pencatatan kirim, keterangan pesan, Pindah jadwal |
| `src/app/(admin)/admin/booking/page.tsx` | teks konfirmasi baru, keterangan pesan, `today` |
| `src/components/admin/booking-created-panel.tsx` | tombol instruksi transfer mencatat pengiriman |
| `src/lib/whatsapp.ts` | `patientBookingConfirmationMessage` dihapus (diganti `confirmationText`) |
| `src/components/admin/reminder-worklist.tsx` (baru), `src/app/(admin)/admin/pengingat/page.tsx` (baru) | halaman Pengingat |
| `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/layout.tsx` | menu Pengingat dan angkanya |
| `src/lib/booking-code.ts`, `src/app/(public)/cek-booking/page.tsx`, `src/components/pendaftaran/booking-status-lookup.tsx` | `?kode=` mengisi kolom kode |
| `tests/e2e/prepare-db.mts`, `tests/e2e/admin-booking.spec.ts`, `tests/e2e/pengingat.spec.ts` (baru) | fixture dan uji ujung ke ujung |

---

### Task 1: Teks pesan dan aksi Pindah jadwal

**Files:**
- Modify: `src/lib/format.ts` (fungsi baru di akhir, impor baru)
- Modify: `src/lib/transfer-instruction.ts` (impor `./format`, hapus `longDateTime`)
- Create: `src/lib/booking-messages.ts`
- Modify: `src/lib/booking-actions.ts`
- Test: `tests/unit/format.test.ts` (tambah), `tests/unit/booking-messages.test.ts` (baru), `tests/unit/booking-actions.test.ts` (seluruh berkas)

**Interfaces:**
- Consumes: `bookingServiceName` dari `@/lib/transfer-instruction`; `buildWhatsAppLinkTo` dari `@/lib/whatsapp`; `CLINIC_NAME`.
- Produces:
  - `formatScheduleForMessage(date: Date): string`
  - `MESSAGE_KINDS`, `MessageKind = "INSTRUKSI_TRANSFER" | "KONFIRMASI" | "PENGINGAT"`
  - `REMINDER_REPLIES`, `ReminderReplyValue = "AKAN_DATANG" | "MINTA_PINDAH" | "TIDAK_MEMBALAS"`, `REMINDER_REPLY_LABEL`
  - `WhatsAppMessage = { text: string; link: string | null }`
  - `BookingMessage = WhatsAppMessage & { kind: "KONFIRMASI" | "INSTRUKSI_TRANSFER" }`
  - `confirmationText(input)`, `reminderText(input)`
  - `MessageBooking`, `confirmationMessageFor(booking, siteUrl): WhatsAppMessage | null`, `reminderMessageFor(booking): WhatsAppMessage | null`
  - `BookingAction` + `"RESCHEDULE"` (label "Pindah jadwal"), selalu tepat sebelum `"CANCEL"` di menu booking aktif yang bukan booking situs belum dicocokkan
  - `RescheduleTarget = { appointmentId; code; patientName; startAt: Date; durationMinutes; staffId; staffName; branchId; branchName }`

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan ke `tests/unit/format.test.ts`. Gabungkan `formatScheduleForMessage` ke baris impor `@/lib/format` yang sudah ada, lalu tambahkan di akhir berkas:

```ts
describe("formatScheduleForMessage", () => {
  it("menulis hari, tanggal, dan jam WITA untuk pesan WhatsApp", () => {
    // 03.00 UTC = 11.00 WITA.
    expect(formatScheduleForMessage(new Date("2031-02-17T03:00:00Z"))).toBe(
      "Senin, 17 Februari 2031 pukul 11.00 WITA",
    );
  });
});
```

`tests/unit/booking-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  confirmationMessageFor,
  confirmationText,
  reminderMessageFor,
  reminderText,
  type MessageBooking,
} from "@/lib/booking-messages";

// Feb 2031: Senin 17.
const wita = (day: number, hour: number) => new Date(Date.UTC(2031, 1, day, hour - 8));

const confirmationInput = {
  patientName: "Maria Wenas",
  code: "SDY-7KQ2",
  serviceName: "Konsultasi Dokter",
  startAt: wita(17, 11),
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Mahakeret No. 1, Manado",
  mapsUrl: "https://maps.app.goo.gl/abc",
  bookingFee: 100000,
  siteUrl: "https://sundyclinic.com",
};

describe("confirmationText", () => {
  it("menyusun konfirmasi lengkap dengan alamat, peta, aturan pindah, dan tautan cek booking", () => {
    expect(confirmationText(confirmationInput)).toBe(
      [
        "Halo Maria Wenas, booking Anda di SunDY Clinic sudah terkonfirmasi.",
        "",
        "Kode booking: SDY-7KQ2",
        "Layanan: Konsultasi Dokter",
        "Jadwal: Senin, 17 Februari 2031 pukul 11.00 WITA",
        "Tenaga: dr. Diane · SunDY Mahakeret",
        "Alamat: Jl. Mahakeret No. 1, Manado",
        "Peta: https://maps.app.goo.gl/abc",
        "",
        "Mohon datang 10 menit sebelum jadwal.",
        "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya; biaya booking tetap berlaku. Bila dibatalkan, biaya booking tidak dikembalikan.",
        "Cek status booking: https://sundyclinic.com/cek-booking?kode=SDY-7KQ2",
        "",
        "Sampai jumpa di klinik.",
      ].join("\n"),
    );
  });

  it("melewati baris Peta bila cabang belum punya tautan peta", () => {
    expect(confirmationText({ ...confirmationInput, mapsUrl: null })).not.toContain("Peta:");
  });

  it("walk-in atau tanpa biaya booking: tanpa kalimat tentang biaya", () => {
    const text = confirmationText({ ...confirmationInput, bookingFee: null });
    expect(text).toContain("Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya.\n");
    expect(text).not.toContain("biaya booking");
  });
});

const reminderInput = {
  patientName: "Maria Wenas",
  serviceName: "Konsultasi Dokter",
  startAt: wita(17, 11),
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Mahakeret No. 1, Manado",
  mapsUrl: "https://maps.app.goo.gl/abc",
};

describe("reminderText", () => {
  it("menulis tanggal lengkap, bukan 'besok'", () => {
    expect(reminderText(reminderInput)).toBe(
      [
        "Halo Maria Wenas, kami mengingatkan jadwal Anda di SunDY Clinic:",
        "Senin, 17 Februari 2031 pukul 11.00 WITA",
        "Konsultasi Dokter dengan dr. Diane",
        "SunDY Mahakeret — Jl. Mahakeret No. 1, Manado",
        "Peta: https://maps.app.goo.gl/abc",
        "",
        "Mohon datang 10 menit sebelum jadwal. Balas YA bila Anda akan datang, atau kabari kami bila ingin pindah jadwal.",
      ].join("\n"),
    );
  });

  it("melewati baris Peta bila kosong", () => {
    expect(reminderText({ ...reminderInput, mapsUrl: null })).not.toContain("Peta:");
  });
});

const booking: MessageBooking = {
  code: "SDY-7KQ2",
  type: "KONSULTASI",
  startAt: wita(17, 11),
  bookingFee: 100000,
  service: null,
  staff: { name: "dr. Diane" },
  branch: { name: "SunDY Mahakeret", address: "Jl. Mahakeret No. 1, Manado", mapsUrl: null },
  patient: { name: "Maria Wenas", whatsapp: "6281234567001" },
};

describe("pesan dari booking", () => {
  it("konfirmasi menaut ke nomor pasien dan memakai nama layanan cadangan bila baris layanan kosong", () => {
    const message = confirmationMessageFor(booking, "https://sundyclinic.com")!;
    expect(message.text).toContain("Layanan: Konsultasi\n");
    expect(message.link).toMatch(/^https:\/\/wa\.me\/6281234567001\?text=/);
    expect(decodeURIComponent(message.link!.split("text=")[1])).toBe(message.text);
  });

  it("pengingat tanpa tautan bila nomor pasien tidak sah", () => {
    expect(reminderMessageFor({ ...booking, patient: { name: "Maria", whatsapp: "12" } })!.link).toBeNull();
  });

  it("null untuk booking tanpa pasien", () => {
    expect(confirmationMessageFor({ ...booking, patient: null }, "https://sundyclinic.com")).toBeNull();
    expect(reminderMessageFor({ ...booking, patient: null })).toBeNull();
  });
});
```

`tests/unit/booking-actions.test.ts` (seluruh berkas):

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

describe("bookingRowActions (spec C1 5.2, C2 bagian 5)", () => {
  it("WA/telepon menunggu: Verifikasi dan Kirim instruksi transfer, sisanya di menu", () => {
    expect(bookingRowActions(waiting, true)).toEqual({
      primary: ["VERIFY", "SEND_TRANSFER"],
      menu: ["COPY_TRANSFER", "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("nomor WA tidak sah: hanya Verifikasi terlihat, instruksi tetap bisa disalin", () => {
    expect(bookingRowActions({ ...waiting, transferInstruction: { link: null } }, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["COPY_TRANSFER", "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("WA/telepon tanpa biaya booking: tanpa instruksi transfer", () => {
    expect(bookingRowActions({ ...waiting, transferInstruction: null }, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("walk-in menunggu: Hadir lebih dulu, karena pasiennya sudah di klinik", () => {
    expect(bookingRowActions({ ...waiting, source: "WALK_IN", transferInstruction: null }, true)).toEqual({
      primary: ["ATTEND", "VERIFY"],
      menu: ["NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("situs belum dicocokkan: hanya Cocokkan pasien, tanpa Pindah jadwal", () => {
    expect(bookingRowActions({ ...site, needsMatch: true }, true)).toEqual({
      primary: ["MATCH"],
      menu: ["VIEW_INTAKE", "CANCEL"],
    });
  });

  it("situs sudah dicocokkan: Verifikasi, dengan Ganti pasien dan Pindah jadwal di menu", () => {
    expect(bookingRowActions(site, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["VIEW_INTAKE", "CHANGE_PATIENT", "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("terkonfirmasi: Hadir dan Kirim konfirmasi, Pindah jadwal di menu", () => {
    expect(
      bookingRowActions({ ...site, status: "TERKONFIRMASI", confirmation: { link: "https://wa.me/62812?text=x" } }, true),
    ).toEqual({
      primary: ["ATTEND", "SEND_CONFIRMATION"],
      menu: ["COPY_CONFIRMATION", "VIEW_INTAKE", "NO_SHOW", "RESCHEDULE", "CANCEL"],
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

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/format.test.ts tests/unit/booking-messages.test.ts tests/unit/booking-actions.test.ts`
Expected: FAIL.
- `formatScheduleForMessage` belum diekspor.
- `@/lib/booking-messages` belum ada.
- Menu booking aktif belum berisi `RESCHEDULE`.

- [ ] **Step 3: Tambahkan `formatScheduleForMessage` ke `src/lib/format.ts`**

Tambahkan impor di bawah impor `./clinic`:

```ts
import { minutesToTimeLabel, witaMinutesOfDay } from "./time";
```

Tambahkan setelah `formatShortIndonesianDate`:

```ts
/** Jadwal di pesan WhatsApp ke pasien, misal "Senin, 5 Oktober 2026 pukul 11.00 WITA". */
export function formatScheduleForMessage(date: Date): string {
  return `${formatIndonesianDate(date)} pukul ${minutesToTimeLabel(witaMinutesOfDay(date))} WITA`;
}
```

- [ ] **Step 4: Pakai fungsi itu di `src/lib/transfer-instruction.ts`**

Ganti impor `./format`:

```ts
import { formatRupiah, formatScheduleForMessage, formatShortIndonesianDate } from "./format";
```

Hapus fungsi `longDateTime` seluruhnya, lalu ganti kedua pemanggilan `longDateTime(` di `transferInstructionText` menjadi `formatScheduleForMessage(`. `minutesToTimeLabel` dan `witaMinutesOfDay` tetap diimpor, karena `pendingDeadlineLabel` memakainya.

- [ ] **Step 5: Tulis `src/lib/booking-messages.ts`**

```ts
import { CLINIC_NAME } from "./clinic";
import { formatScheduleForMessage } from "./format";
import { bookingServiceName } from "./transfer-instruction";
import { buildWhatsAppLinkTo } from "./whatsapp";

/** Jenis pesan WhatsApp yang dicatat terkirim (spec C2 bagian 6). */
export const MESSAGE_KINDS = ["INSTRUKSI_TRANSFER", "KONFIRMASI", "PENGINGAT"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Balasan pasien atas pengingat H-1 (keputusan P5). */
export const REMINDER_REPLIES = ["AKAN_DATANG", "MINTA_PINDAH", "TIDAK_MEMBALAS"] as const;
export type ReminderReplyValue = (typeof REMINDER_REPLIES)[number];

export const REMINDER_REPLY_LABEL: Record<ReminderReplyValue, string> = {
  AKAN_DATANG: "Akan datang",
  MINTA_PINDAH: "Minta pindah",
  TIDAK_MEMBALAS: "Tidak membalas",
};

/** Pesan siap kirim; `link` null bila nomor WhatsApp pasien tidak sah. */
export type WhatsAppMessage = { text: string; link: string | null };

/** Pesan lanjutan setelah Verifikasi atau Pindah jadwal (spec C2 3.1, bagian 5). */
export type BookingMessage = WhatsAppMessage & { kind: "KONFIRMASI" | "INSTRUKSI_TRANSFER" };

const ARRIVE_EARLY = "Mohon datang 10 menit sebelum jadwal.";

/** Teks konfirmasi setelah transfer diverifikasi (spec C2 3.2). */
export function confirmationText(input: {
  patientName: string;
  code: string;
  serviceName: string;
  startAt: Date;
  staffName: string;
  branchName: string;
  branchAddress: string;
  mapsUrl: string | null;
  /** null untuk walk-in atau booking tanpa biaya: kalimat tentang biaya dihilangkan. */
  bookingFee: number | null;
  /** Alamat situs tanpa garis miring di akhir, misal "https://sundyclinic.com". */
  siteUrl: string;
}): string {
  const lines = [
    `Halo ${input.patientName}, booking Anda di ${CLINIC_NAME} sudah terkonfirmasi.`,
    "",
    `Kode booking: ${input.code}`,
    `Layanan: ${input.serviceName}`,
    `Jadwal: ${formatScheduleForMessage(input.startAt)}`,
    `Tenaga: ${input.staffName} · ${input.branchName}`,
    `Alamat: ${input.branchAddress}`,
  ];
  if (input.mapsUrl) lines.push(`Peta: ${input.mapsUrl}`);
  lines.push(
    "",
    ARRIVE_EARLY,
    input.bookingFee === null
      ? "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya."
      : "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya; biaya booking tetap berlaku. Bila dibatalkan, biaya booking tidak dikembalikan.",
    `Cek status booking: ${input.siteUrl}/cek-booking?kode=${encodeURIComponent(input.code)}`,
    "",
    "Sampai jumpa di klinik.",
  );
  return lines.join("\n");
}

/** Teks pengingat H-1 (spec C2 4.4). Tanggal selalu lengkap: pengingat Sabtu bisa untuk jadwal Senin. */
export function reminderText(input: {
  patientName: string;
  serviceName: string;
  startAt: Date;
  staffName: string;
  branchName: string;
  branchAddress: string;
  mapsUrl: string | null;
}): string {
  const lines = [
    `Halo ${input.patientName}, kami mengingatkan jadwal Anda di ${CLINIC_NAME}:`,
    formatScheduleForMessage(input.startAt),
    `${input.serviceName} dengan ${input.staffName}`,
    `${input.branchName} — ${input.branchAddress}`,
  ];
  if (input.mapsUrl) lines.push(`Peta: ${input.mapsUrl}`);
  lines.push(
    "",
    `${ARRIVE_EARLY} Balas YA bila Anda akan datang, atau kabari kami bila ingin pindah jadwal.`,
  );
  return lines.join("\n");
}

/** Bagian booking yang dibutuhkan untuk menyusun konfirmasi dan pengingat. */
export type MessageBooking = {
  code: string;
  type: "KONSULTASI" | "TREATMENT";
  startAt: Date;
  bookingFee: number | null;
  service: { name: string } | null;
  staff: { name: string };
  branch: { name: string; address: string; mapsUrl: string | null };
  patient: { name: string; whatsapp: string } | null;
};

/** null untuk booking situs yang belum dicocokkan (belum ada pasien). */
export function confirmationMessageFor(booking: MessageBooking, siteUrl: string): WhatsAppMessage | null {
  if (!booking.patient) return null;
  const text = confirmationText({
    patientName: booking.patient.name,
    code: booking.code,
    serviceName: bookingServiceName(booking),
    startAt: booking.startAt,
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    branchAddress: booking.branch.address,
    mapsUrl: booking.branch.mapsUrl,
    bookingFee: booking.bookingFee,
    siteUrl,
  });
  return { text, link: buildWhatsAppLinkTo(booking.patient.whatsapp, text) };
}

export function reminderMessageFor(booking: MessageBooking): WhatsAppMessage | null {
  if (!booking.patient) return null;
  const text = reminderText({
    patientName: booking.patient.name,
    serviceName: bookingServiceName(booking),
    startAt: booking.startAt,
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    branchAddress: booking.branch.address,
    mapsUrl: booking.branch.mapsUrl,
  });
  return { text, link: buildWhatsAppLinkTo(booking.patient.whatsapp, text) };
}
```

- [ ] **Step 6: Tambahkan `RESCHEDULE` ke `src/lib/booking-actions.ts`**

Tambahkan `| "RESCHEDULE"` ke union `BookingAction` (sebelum `| "CANCEL"`). Tambahkan juga `RESCHEDULE: "Pindah jadwal",` ke `BOOKING_ACTION_LABEL` (sebelum `CANCEL`).

Tambahkan setelah tipe `BookingActionRow`:

```ts
/** Data yang dibutuhkan dialog Pindah jadwal (spec C2 bagian 5). Tenaga, cabang, dan durasi tetap. */
export type RescheduleTarget = {
  appointmentId: string;
  code: string;
  patientName: string;
  startAt: Date;
  durationMinutes: number;
  staffId: string;
  staffName: string;
  branchId: string;
  branchName: string;
};
```

Ganti isi `bookingRowActions` dengan:

```ts
export function bookingRowActions(
  row: BookingActionRow,
  canReadRecords: boolean,
): { primary: BookingAction[]; menu: BookingAction[] } {
  const intake: BookingAction[] = row.intakeId && canReadRecords ? ["VIEW_INTAKE"] : [];

  if (row.status === "MENUNGGU_KONFIRMASI") {
    if (row.needsMatch) return { primary: ["MATCH"], menu: [...intake, "CANCEL"] };
    if (row.isSiteBooking) {
      return {
        primary: ["VERIFY"],
        menu: [...intake, "CHANGE_PATIENT", "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
      };
    }
    // Walk-in: pasiennya sudah di klinik, tidak ada transfer yang ditunggu.
    if (row.source === "WALK_IN") {
      return { primary: ["ATTEND", "VERIFY"], menu: [...intake, "NO_SHOW", "RESCHEDULE", "CANCEL"] };
    }
    if (row.transferInstruction) {
      return {
        primary: row.transferInstruction.link ? ["VERIFY", "SEND_TRANSFER"] : ["VERIFY"],
        menu: ["COPY_TRANSFER", ...intake, "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
      };
    }
    return { primary: ["VERIFY"], menu: [...intake, "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"] };
  }

  if (row.status === "TERKONFIRMASI") {
    const primary: BookingAction[] = ["ATTEND"];
    if (row.confirmation?.link) primary.push("SEND_CONFIRMATION");
    const menu: BookingAction[] = [];
    if (row.confirmation) menu.push("COPY_CONFIRMATION");
    menu.push(...intake, "NO_SHOW", "RESCHEDULE", "CANCEL");
    return { primary, menu };
  }

  return { primary: [], menu: intake };
}
```

Perbarui juga komentar di atas fungsi itu dengan menambahkan kalimat: "Pindah jadwal (spec C2 bagian 5) selalu tepat sebelum Batalkan."

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/format.test.ts tests/unit/booking-messages.test.ts tests/unit/booking-actions.test.ts tests/unit/transfer-instruction.test.ts`
Expected: PASS. Uji instruksi transfer C1 tetap lulus, karena teksnya tidak berubah.

Run: `npx tsc --noEmit`
Expected: galat hanya di `src/components/admin/appointment-table.tsx`: `actionTarget` belum menangani `"RESCHEDULE"`, sehingga fungsinya tidak lagi mengembalikan nilai di semua cabang. Galat ini diselesaikan di Task 7. Bila ada galat lain, perbaiki dulu.

Untuk menjaga branch tetap terkompilasi sampai Task 7, tambahkan cabang sementara ini di `actionTarget` pada `appointment-table.tsx`, tepat sebelum `case "CANCEL":`:

```ts
      case "RESCHEDULE":
        return { onSelect: () => toast.info("Pindah jadwal belum tersedia.") };
```

Di `tests/unit/components/appointment-table.test.tsx`, uji "booking WA menunggu: Verifikasi dan Kirim instruksi transfer terlihat, sisanya di menu" kini harus memuat "Pindah jadwal". Ganti daftar yang diharapkannya menjadi:

```ts
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Salin instruksi transfer",
      "Hadir",
      "Tidak hadir",
      "Pindah jadwal",
      "Batalkan",
    ]);
```

(Berkas uji ini ditulis ulang seluruhnya di Task 7.)

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc bersih dan seluruh uji unit lulus.

- [ ] **Step 8: Commit**

```bash
git add src/lib/format.ts src/lib/transfer-instruction.ts src/lib/booking-messages.ts src/lib/booking-actions.ts src/components/admin/appointment-table.tsx tests/unit/format.test.ts tests/unit/booking-messages.test.ts tests/unit/booking-actions.test.ts tests/unit/components/appointment-table.test.tsx
git commit -m "feat: add confirmation and reminder message texts and the reschedule row action"
```

---

### Task 2: Aturan daftar kerja Pengingat

**Files:**
- Create: `src/lib/reminder-work.ts`
- Test: `tests/unit/reminder-work.test.ts`

**Interfaces:**
- Consumes: `MessageKind`, `ReminderReplyValue`, `REMINDER_REPLY_LABEL` (Task 1); `MAX_LOOKBACK_DAYS` dari `@/lib/confirmation-window`.
- Produces:
  - `MessageRecord = { id: string; kind: MessageKind; scheduledFor: Date; sentAt: Date; sentByName: string; revokedAt: Date | null; reply: ReminderReplyValue | null }`
  - `latestValidMessage(messages, kind, startAt): MessageRecord | null`
  - `reminderDay(date: string, closedDates: ReadonlySet<string>): string`
  - `WorkBooking = { startAt: Date; messages: readonly MessageRecord[] }`
  - `groupReminderWork<T extends WorkBooking>(bookings, { now, closedDates }): { confirm: T[]; remind: (T & { reminderDay: string; overdue: boolean; shifted: boolean })[]; reminded: (T & { reminder: MessageRecord })[] }`. Pemanggil hanya mengirim booking **Terkonfirmasi**.
  - `messageStatusLabels(messages, startAt, now): string[]`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/reminder-work.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  groupReminderWork,
  latestValidMessage,
  messageStatusLabels,
  reminderDay,
  type MessageRecord,
} from "@/lib/reminder-work";

// Feb 2031: Kamis 6, Jumat 7, Sabtu 8, Minggu 9, Senin 10, Selasa 11, Rabu 12, Kamis 13,
// Jumat 14, Sabtu 15, Minggu 16, Senin 17.
const wita = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2031, 1, day, hour - 8, minute));
const NO_HOLIDAYS = new Set<string>();

let seq = 0;
function msg(kind: MessageRecord["kind"], scheduledFor: Date, sentAt: Date, extra: Partial<MessageRecord> = {}): MessageRecord {
  seq += 1;
  return { id: `m${seq}`, kind, scheduledFor, sentAt, sentByName: "Rina", revokedAt: null, reply: null, ...extra };
}
const booking = (id: string, startAt: Date, messages: MessageRecord[] = []) => ({ id, startAt, messages });

describe("reminderDay", () => {
  it("hari sebelumnya pada hari kerja biasa", () => {
    expect(reminderDay("2031-02-11", NO_HOLIDAYS)).toBe("2031-02-10");
  });

  it("jadwal Senin diingatkan Sabtu, karena Minggu tutup", () => {
    expect(reminderDay("2031-02-10", NO_HOLIDAYS)).toBe("2031-02-08");
  });

  it("melewati tanggal libur", () => {
    expect(reminderDay("2031-02-13", new Set(["2031-02-12"]))).toBe("2031-02-11");
  });

  it("melewati libur berurutan dan hari Minggu sekaligus", () => {
    expect(reminderDay("2031-02-17", new Set(["2031-02-14", "2031-02-15"]))).toBe("2031-02-13");
  });
});

describe("latestValidMessage", () => {
  const start = wita(11, 11);

  it("memakai kiriman terakhir yang belum dibatalkan untuk jadwal yang sama", () => {
    const older = msg("KONFIRMASI", start, wita(7, 9));
    const newer = msg("KONFIRMASI", start, wita(7, 10));
    const revoked = msg("KONFIRMASI", start, wita(7, 11), { revokedAt: wita(7, 12) });
    const oldSchedule = msg("KONFIRMASI", wita(10, 11), wita(7, 13));
    expect(latestValidMessage([older, newer, revoked, oldSchedule], "KONFIRMASI", start)).toBe(newer);
  });

  it("null bila tidak ada catatan yang berlaku", () => {
    expect(latestValidMessage([msg("PENGINGAT", start, wita(10, 9))], "KONFIRMASI", start)).toBeNull();
  });
});

describe("groupReminderWork", () => {
  it("memisahkan konfirmasi yang belum dikirim, pengingat hari ini, dan yang sudah diingatkan", () => {
    const now = wita(10, 9); // Senin 09.00
    const confirmedFriday = (start: Date) => msg("KONFIRMASI", start, wita(7, 10));

    const a = booking("a", wita(11, 11), [confirmedFriday(wita(11, 11))]);
    const b = booking("b", wita(11, 13)); // belum ada konfirmasi
    const c = booking("c", wita(11, 15), [msg("KONFIRMASI", wita(11, 15), wita(10, 8))]); // dikonfirmasi pada hari pengingat
    const d = booking("d", wita(10, 15), [msg("KONFIRMASI", wita(10, 15), wita(6, 10))]); // hari pengingat Sabtu: terlambat
    const e = booking("e", wita(12, 11), [confirmedFriday(wita(12, 11))]); // hari pengingat besok
    const f = booking("f", wita(11, 16), [
      confirmedFriday(wita(11, 16)),
      msg("PENGINGAT", wita(11, 16), wita(10, 8, 30)),
    ]);
    const g = booking("g", wita(10, 8), [confirmedFriday(wita(10, 8))]); // jadwal sudah lewat
    const h = booking("h", wita(11, 17), [msg("KONFIRMASI", wita(11, 10), wita(7, 10))]); // konfirmasi untuk jadwal lama
    const i = booking("i", wita(11, 18), [msg("KONFIRMASI", wita(11, 18), wita(7, 10), { revokedAt: wita(7, 11) })]);

    const groups = groupReminderWork([a, b, c, d, e, f, g, h, i], { now, closedDates: NO_HOLIDAYS });

    expect(groups.confirm.map((x) => x.id)).toEqual(["b", "h", "i"]);
    expect(groups.remind.map((x) => [x.id, x.overdue, x.shifted])).toEqual([
      ["d", true, true],
      ["a", false, false],
    ]);
    expect(groups.reminded.map((x) => [x.id, x.reminder.sentAt])).toEqual([["f", wita(10, 8, 30)]]);
  });

  it("jadwal Senin muncul pada hari Sabtu, dengan keterangan hari sebelumnya tutup", () => {
    const now = wita(8, 10); // Sabtu
    const monday = booking("senin", wita(10, 11), [msg("KONFIRMASI", wita(10, 11), wita(6, 10))]);
    const groups = groupReminderWork([monday], { now, closedDates: NO_HOLIDAYS });
    expect(groups.remind.map((x) => [x.id, x.reminderDay, x.overdue, x.shifted])).toEqual([
      ["senin", "2031-02-08", false, true],
    ]);
  });

  it("hari pengingat dihitung dari tanggal WITA, termasuk untuk booking pagi hari", () => {
    // Selasa 07.00 WITA = Senin 23.00 UTC. Pengingatnya hari Senin, bukan Sabtu.
    const now = wita(10, 9);
    const early = booking("pagi", wita(11, 7), [msg("KONFIRMASI", wita(11, 7), wita(7, 10))]);
    const groups = groupReminderWork([early], { now, closedDates: NO_HOLIDAYS });
    expect(groups.remind.map((x) => [x.id, x.reminderDay, x.overdue])).toEqual([["pagi", "2031-02-10", false]]);
  });

  it("pengingat yang dibatalkan membuat booking kembali perlu diingatkan", () => {
    const now = wita(10, 9);
    const start = wita(11, 11);
    const groups = groupReminderWork(
      [
        booking("x", start, [
          msg("KONFIRMASI", start, wita(7, 10)),
          msg("PENGINGAT", start, wita(10, 8), { revokedAt: wita(10, 8, 5) }),
        ]),
      ],
      { now, closedDates: NO_HOLIDAYS },
    );
    expect(groups.remind.map((x) => x.id)).toEqual(["x"]);
    expect(groups.reminded).toEqual([]);
  });
});

describe("messageStatusLabels", () => {
  it("menulis kiriman terakhir yang berlaku per jenis, dengan tanggal bila bukan hari ini", () => {
    const now = wita(10, 12);
    const start = wita(11, 11);
    expect(
      messageStatusLabels(
        [
          msg("PENGINGAT", start, wita(10, 9, 40), { reply: "AKAN_DATANG" }),
          msg("KONFIRMASI", start, wita(7, 10, 12)),
          msg("INSTRUKSI_TRANSFER", start, wita(10, 9, 5)),
          msg("KONFIRMASI", wita(9, 11), wita(10, 11)), // jadwal lama
          msg("PENGINGAT", start, wita(10, 11), { revokedAt: wita(10, 11, 1) }),
        ],
        start,
        now,
      ),
    ).toEqual([
      "Instruksi transfer terkirim 09.05",
      "Konfirmasi terkirim Jum, 7 Feb 10.12 · Rina",
      "Diingatkan 09.40 · Akan datang",
    ]);
  });

  it("kosong bila belum ada pesan", () => {
    expect(messageStatusLabels([], wita(11, 11), wita(10, 12))).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/reminder-work.test.ts`
Expected: FAIL. Modul `@/lib/reminder-work` belum ada.

- [ ] **Step 3: Tulis `src/lib/reminder-work.ts`**

```ts
import { REMINDER_REPLY_LABEL, type MessageKind, type ReminderReplyValue } from "./booking-messages";
import { MAX_LOOKBACK_DAYS } from "./confirmation-window";
import { formatShortIndonesianDate } from "./format";
import {
  addDaysToDateString,
  combineWitaDateAndMinutes,
  minutesToTimeLabel,
  witaDateString,
  witaMinutesOfDay,
  witaWeekday,
} from "./time";

/** Satu catatan `AppointmentMessage`, cukup untuk menentukan kotak dan keterangan. */
export type MessageRecord = {
  id: string;
  kind: MessageKind;
  scheduledFor: Date;
  sentAt: Date;
  sentByName: string;
  revokedAt: Date | null;
  reply: ReminderReplyValue | null;
};

/**
 * Catatan berlaku: belum dibatalkan, dan dikirim untuk jadwal booking saat
 * ini (pindah jadwal menggugurkan catatan lama). Yang terakhir yang dipakai.
 */
export function latestValidMessage(
  messages: readonly MessageRecord[],
  kind: MessageKind,
  startAt: Date,
): MessageRecord | null {
  let latest: MessageRecord | null = null;
  for (const message of messages) {
    if (message.kind !== kind || message.revokedAt || message.scheduledFor.getTime() !== startAt.getTime()) continue;
    if (!latest || message.sentAt.getTime() > latest.sentAt.getTime()) latest = message;
  }
  return latest;
}

/**
 * Hari buka terakhir sebelum tanggal jadwal (WITA, "YYYY-MM-DD"). Minggu dan
 * tanggal libur dilewati: jadwal Senin diingatkan Sabtu (PRD F17, spec C2 4.2).
 */
export function reminderDay(date: string, closedDates: ReadonlySet<string>): string {
  let day = addDaysToDateString(date, -1);
  for (let step = 0; step < MAX_LOOKBACK_DAYS; step += 1) {
    const closed = witaWeekday(combineWitaDateAndMinutes(day, 12 * 60)) === 0 || closedDates.has(day);
    if (!closed) return day;
    day = addDaysToDateString(day, -1);
  }
  return day;
}

export type WorkBooking = { startAt: Date; messages: readonly MessageRecord[] };

export type ReminderGroups<T> = {
  confirm: T[];
  remind: (T & { reminderDay: string; overdue: boolean; shifted: boolean })[];
  reminded: (T & { reminder: MessageRecord })[];
};

/**
 * Tiga kotak halaman Pengingat (spec C2 bagian 4). Pemanggil hanya mengirim
 * booking Terkonfirmasi. Booking tanpa konfirmasi yang berlaku hanya masuk
 * kotak 1: konfirmasi yang dikirim pada hari pengingat sudah cukup mengingatkan.
 */
export function groupReminderWork<T extends WorkBooking>(
  bookings: readonly T[],
  context: { now: Date; closedDates: ReadonlySet<string> },
): ReminderGroups<T> {
  const today = witaDateString(context.now);
  const groups: ReminderGroups<T> = { confirm: [], remind: [], reminded: [] };

  for (const booking of bookings) {
    if (booking.startAt.getTime() <= context.now.getTime()) continue;

    const confirmation = latestValidMessage(booking.messages, "KONFIRMASI", booking.startAt);
    if (!confirmation) {
      groups.confirm.push(booking);
      continue;
    }

    const reminder = latestValidMessage(booking.messages, "PENGINGAT", booking.startAt);
    if (reminder) {
      groups.reminded.push({ ...booking, reminder });
      continue;
    }

    const date = witaDateString(booking.startAt);
    const day = reminderDay(date, context.closedDates);
    // Pasien yang baru menerima konfirmasi pada hari pengingat tidak perlu diingatkan lagi.
    if (witaDateString(confirmation.sentAt) >= day) continue;
    if (day > today) continue;
    groups.remind.push({
      ...booking,
      reminderDay: day,
      overdue: day < today,
      shifted: day !== addDaysToDateString(date, -1),
    });
  }

  const byStart = (a: WorkBooking, b: WorkBooking) => a.startAt.getTime() - b.startAt.getTime();
  groups.confirm.sort(byStart);
  groups.reminded.sort(byStart);
  groups.remind.sort((a, b) => (a.overdue === b.overdue ? byStart(a, b) : a.overdue ? -1 : 1));
  return groups;
}

/** Keterangan kecil di baris booking (spec C2 4.5). */
export function messageStatusLabels(messages: readonly MessageRecord[], startAt: Date, now: Date): string[] {
  const today = witaDateString(now);
  const when = (date: Date) => {
    const time = minutesToTimeLabel(witaMinutesOfDay(date));
    return witaDateString(date) === today ? time : `${formatShortIndonesianDate(date)} ${time}`;
  };

  const labels: string[] = [];
  const transfer = latestValidMessage(messages, "INSTRUKSI_TRANSFER", startAt);
  if (transfer) labels.push(`Instruksi transfer terkirim ${when(transfer.sentAt)}`);
  const confirmation = latestValidMessage(messages, "KONFIRMASI", startAt);
  if (confirmation) labels.push(`Konfirmasi terkirim ${when(confirmation.sentAt)} · ${confirmation.sentByName}`);
  const reminder = latestValidMessage(messages, "PENGINGAT", startAt);
  if (reminder) {
    labels.push(
      `Diingatkan ${when(reminder.sentAt)}${reminder.reply ? ` · ${REMINDER_REPLY_LABEL[reminder.reply]}` : ""}`,
    );
  }
  return labels;
}
```

- [ ] **Step 4: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/reminder-work.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminder-work.ts tests/unit/reminder-work.test.ts
git commit -m "feat: add reminder day and reminder worklist grouping rules"
```

---

### Task 3: Tabel catatan pesan dan aksi servernya

**Files:**
- Modify: `prisma/schema.prisma` (relasi di `Appointment`, model dan enum baru setelah `Appointment`)
- Create: `prisma/migrations/20261002120000_pesan_booking/migration.sql`
- Create: `src/server/site-url.ts`
- Create: `src/server/appointment-message.ts`
- Modify: `src/server/appointment.ts` (`BOOKING_LIST_INCLUDE`; revalidasi di `rescheduleAppointment` dan `setStatus`)
- Test: `tests/integration/appointment-message.test.ts`

**Interfaces:**
- Consumes: `MESSAGE_KINDS`, `REMINDER_REPLIES`, `MessageKind`, `ReminderReplyValue`, `BookingMessage`, `confirmationMessageFor` (Task 1); `needsTransfer`, `transferInstructionFor` (C1); `transferDeadlines` (C1, `booking-expiry.ts`); `getClinicSetting`.
- Produces:
  - model Prisma `AppointmentMessage` (`prisma.appointmentMessage`), relasi `Appointment.messages`
  - `publicSiteUrl(): string`
  - `getBookingMessage(appointmentId): Promise<ActionResult<BookingMessage | null>>`:
    - Terkonfirmasi → `KONFIRMASI`;
    - menunggu transfer (aturan C1) → `INSTRUKSI_TRANSFER`;
    - selain itu → `null`.
  - `recordAppointmentMessage({ appointmentId, kind }): Promise<ActionResult<{ id: string }>>`
  - `revokeAppointmentMessage(messageId): Promise<ActionResult<void>>`
  - `recordReminderReply({ messageId, reply }): Promise<ActionResult<void>>`
  - Setiap baris dari `listAppointments`, `listPendingBookings`, dan `searchBookings` kini membawa `messages: { id, kind, scheduledFor, sentAt, sentByName, revokedAt, reply }[]`.

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/appointment-message.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  getBookingMessage,
  recordAppointmentMessage,
  recordReminderReply,
  revokeAppointmentMessage,
} from "@/server/appointment-message";
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

const SLUG = "pesan-booking-uji";
const WA = "6281277400001";
const HOUR = 60 * 60 * 1000;

async function cleanup() {
  // Catatan pesan ikut terhapus bersama bookingnya (onDelete: Cascade).
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("catatan pesan booking", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(input: { source?: BookingSource; status?: AppointmentStatus; bookingFee?: number | null }) {
    slot += 1;
    const startAt = new Date(base + (48 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: `MSG-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: input.source ?? "WHATSAPP",
        status: input.status ?? "TERKONFIRMASI",
        bookingFee: input.bookingFee === undefined ? 100000 : input.bookingFee,
        branchId,
        staffId,
        patientId,
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Pesan", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Pesan",
          address: "Jl. Uji Pesan No. 1, Manado",
          mapsUrl: "https://maps.app.goo.gl/uji",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7740", name: "Maria Pesan", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("mencatat konfirmasi untuk jadwal saat itu, beserta pengirimnya", async () => {
    const confirmed = await booking({});
    const { id } = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "KONFIRMASI" }));

    const saved = await prisma.appointmentMessage.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({
      appointmentId: confirmed.id,
      kind: "KONFIRMASI",
      scheduledFor: confirmed.startAt,
      sentById: "s1",
      sentByName: "Resepsionis Uji",
      revokedAt: null,
      reply: null,
    });
  });

  it("menolak jenis pesan yang tidak cocok dengan keadaan booking", async () => {
    const waiting = await booking({ status: "MENUNGGU_KONFIRMASI" });
    const confirmed = await booking({});

    expect(await recordAppointmentMessage({ appointmentId: waiting.id, kind: "KONFIRMASI" })).toEqual({
      ok: false,
      error: "Booking ini belum terkonfirmasi.",
    });
    expect(await recordAppointmentMessage({ appointmentId: confirmed.id, kind: "INSTRUKSI_TRANSFER" })).toEqual({
      ok: false,
      error: "Booking ini tidak sedang menunggu transfer.",
    });
    expect(await recordAppointmentMessage({ appointmentId: confirmed.id, kind: "LAIN" as never })).toEqual({
      ok: false,
      error: "Jenis pesan tidak dikenal.",
    });
    await unwrap(recordAppointmentMessage({ appointmentId: waiting.id, kind: "INSTRUKSI_TRANSFER" }));
  });

  it("membatalkan tanda sekali saja, tanpa menghapus catatannya", async () => {
    const confirmed = await booking({});
    const { id } = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT" }));

    await unwrap(revokeAppointmentMessage(id));
    const revoked = await prisma.appointmentMessage.findUniqueOrThrow({ where: { id } });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedByName).toBe("Resepsionis Uji");

    expect(await revokeAppointmentMessage(id)).toEqual({
      ok: false,
      error: "Tanda ini sudah dibatalkan. Muat ulang halaman.",
    });
  });

  it("mencatat dan mengubah balasan untuk pengingat yang berlaku", async () => {
    const confirmed = await booking({});
    const { id } = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT" }));

    await unwrap(recordReminderReply({ messageId: id, reply: "AKAN_DATANG" }));
    await unwrap(recordReminderReply({ messageId: id, reply: "MINTA_PINDAH" }));

    expect(await prisma.appointmentMessage.findUniqueOrThrow({ where: { id } })).toMatchObject({
      reply: "MINTA_PINDAH",
      repliedByName: "Resepsionis Uji",
    });
  });

  it("menolak balasan untuk konfirmasi, pengingat yang dibatalkan admin lain, atau jadwal lama", async () => {
    const stale = "Pengingat ini sudah tidak berlaku. Muat ulang halaman.";
    const confirmed = await booking({});
    const confirmation = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "KONFIRMASI" }));
    expect(await recordReminderReply({ messageId: confirmation.id, reply: "AKAN_DATANG" })).toEqual({
      ok: false,
      error: stale,
    });

    const revoked = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT" }));
    await unwrap(revokeAppointmentMessage(revoked.id));
    expect(await recordReminderReply({ messageId: revoked.id, reply: "AKAN_DATANG" })).toEqual({ ok: false, error: stale });
    expect((await prisma.appointmentMessage.findUniqueOrThrow({ where: { id: revoked.id } })).reply).toBeNull();

    const moved = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT" }));
    await prisma.appointment.update({
      where: { id: confirmed.id },
      data: {
        startAt: new Date(confirmed.startAt.getTime() + 24 * HOUR),
        endAt: new Date(confirmed.endAt.getTime() + 24 * HOUR),
      },
    });
    expect(await recordReminderReply({ messageId: moved.id, reply: "AKAN_DATANG" })).toEqual({ ok: false, error: stale });

    expect(await recordReminderReply({ messageId: moved.id, reply: "LAIN" as never })).toEqual({
      ok: false,
      error: "Balasan tidak dikenal.",
    });
  });

  it("pesan lanjutan: konfirmasi untuk terkonfirmasi, instruksi untuk yang menunggu transfer, kosong untuk walk-in", async () => {
    const confirmed = await booking({});
    const message = (await unwrap(getBookingMessage(confirmed.id)))!;
    expect(message.kind).toBe("KONFIRMASI");
    expect(message.text).toContain("Alamat: Jl. Uji Pesan No. 1, Manado");
    expect(message.text).toContain("Peta: https://maps.app.goo.gl/uji");
    expect(message.text).toContain(`/cek-booking?kode=${confirmed.code}`);
    expect(message.link).toMatch(/^https:\/\/wa\.me\/6281277400001\?text=/);

    const waiting = await booking({ status: "MENUNGGU_KONFIRMASI" });
    expect((await unwrap(getBookingMessage(waiting.id)))!.kind).toBe("INSTRUKSI_TRANSFER");

    const walkIn = await booking({ source: "WALK_IN", status: "MENUNGGU_KONFIRMASI", bookingFee: null });
    expect(await unwrap(getBookingMessage(walkIn.id))).toBeNull();

    expect(await getBookingMessage("tidak-ada")).toEqual({ ok: false, error: "Booking tidak ditemukan." });
  });

  it("semua aksi memakai booking:manage, yang dimiliki resepsionis", async () => {
    const confirmed = await booking({});
    vi.mocked(requireCapability).mockClear();
    const { id } = await unwrap(recordAppointmentMessage({ appointmentId: confirmed.id, kind: "PENGINGAT" }));
    await recordReminderReply({ messageId: id, reply: "AKAN_DATANG" });
    await revokeAppointmentMessage(id);
    await getBookingMessage(confirmed.id);

    const capabilities = vi.mocked(requireCapability).mock.calls.map(([capability]) => capability);
    expect(new Set(capabilities)).toEqual(new Set(["booking:manage"]));
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test:integration -- tests/integration/appointment-message.test.ts`
Expected: FAIL. Modul `@/server/appointment-message` belum ada.

- [ ] **Step 3: Tambahkan model ke `prisma/schema.prisma`**

Di model `Appointment`, tambahkan relasi tepat di bawah `encounter  Encounter?`:

```prisma
  messages   AppointmentMessage[]
```

Tambahkan tepat setelah penutup model `Appointment` (sebelum komentar `/// Penahanan sementara slot …` milik `SlotHold`):

```prisma
enum AppointmentMessageKind {
  INSTRUKSI_TRANSFER
  KONFIRMASI
  PENGINGAT
}

enum ReminderReply {
  AKAN_DATANG
  MINTA_PINDAH
  TIDAK_MEMBALAS
}

/// Pesan WhatsApp yang dicatat terkirim oleh admin untuk satu booking (spec C2
/// bagian 6). Catatan berlaku hanya bila belum dibatalkan dan scheduledFor sama
/// dengan startAt booking saat ini — pindah jadwal membuat catatan lama gugur.
model AppointmentMessage {
  id           String                 @id @default(cuid())
  kind         AppointmentMessageKind
  /// startAt booking saat pesan dicatat.
  scheduledFor DateTime

  /// Pengirim disalin seperti jejak audit, agar tetap terbaca bila staf dihapus.
  sentById   String
  sentByName String
  sentAt     DateTime @default(now())

  /// "Batalkan tanda": WA ternyata tidak terkirim. Baris tidak pernah dihapus.
  revokedAt     DateTime?
  revokedById   String?
  revokedByName String?

  /// Balasan pasien; khusus PENGINGAT.
  reply         ReminderReply?
  repliedAt     DateTime?
  repliedById   String?
  repliedByName String?

  appointmentId String
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)

  @@index([appointmentId, kind])
}
```

- [ ] **Step 4: Tulis migrasi**

`prisma/migrations/20261002120000_pesan_booking/migration.sql`:

```sql
-- UI panel admin bagian C2: catatan pesan WhatsApp per booking (konfirmasi,
-- pengingat H-1, instruksi transfer). Aditif; tabel Appointment tidak berubah.
-- Spec: docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md bagian 6.

-- CreateEnum
CREATE TYPE "AppointmentMessageKind" AS ENUM ('INSTRUKSI_TRANSFER', 'KONFIRMASI', 'PENGINGAT');

-- CreateEnum
CREATE TYPE "ReminderReply" AS ENUM ('AKAN_DATANG', 'MINTA_PINDAH', 'TIDAK_MEMBALAS');

-- CreateTable
CREATE TABLE "AppointmentMessage" (
    "id" TEXT NOT NULL,
    "kind" "AppointmentMessageKind" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentById" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedByName" TEXT,
    "reply" "ReminderReply",
    "repliedAt" TIMESTAMP(3),
    "repliedById" TEXT,
    "repliedByName" TEXT,
    "appointmentId" TEXT NOT NULL,

    CONSTRAINT "AppointmentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentMessage_appointmentId_kind_idx" ON "AppointmentMessage"("appointmentId", "kind");

-- AddForeignKey
ALTER TABLE "AppointmentMessage" ADD CONSTRAINT "AppointmentMessage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Run:

```bash
npx prisma migrate deploy
npm run db:migrate:test
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: ketiga perintah pertama berhasil, dan perintah terakhir keluar dengan kode 0 (skema dan basis data dev sama).

- [ ] **Step 5: Tulis `src/server/site-url.ts`**

```ts
/**
 * Alamat situs publik untuk tautan di pesan WhatsApp (mis. cek booking). Sama
 * dengan alamat yang dipakai Better Auth, jadi tidak ada alamat yang ditulis di kode.
 */
export function publicSiteUrl(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) throw new Error("BETTER_AUTH_URL belum diisi di .env.");
  return url.replace(/\/+$/, "");
}
```

- [ ] **Step 6: Tulis `src/server/appointment-message.ts`**

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import {
  confirmationMessageFor,
  MESSAGE_KINDS,
  REMINDER_REPLIES,
  type BookingMessage,
  type MessageKind,
  type ReminderReplyValue,
} from "@/lib/booking-messages";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { needsTransfer, transferInstructionFor } from "@/lib/transfer-instruction";
import { transferDeadlines } from "@/server/booking-expiry";
import { getClinicSetting } from "@/server/clinic-setting";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

/** Identitas pasien saja, tanpa catatan medis (spec 6.2). */
const MESSAGE_BOOKING_INCLUDE = {
  patient: { select: { name: true, whatsapp: true } },
  staff: { select: { name: true } },
  branch: { select: { name: true, address: true, mapsUrl: true } },
  service: { select: { name: true } },
} as const;

function revalidateMessageViews() {
  safeRevalidatePath("/admin/booking");
  safeRevalidatePath("/admin/pengingat");
}

/**
 * Pesan yang sebaiknya dikirim sekarang untuk booking ini: konfirmasi untuk
 * booking Terkonfirmasi, instruksi transfer untuk booking WA/telepon yang
 * belum transfer, atau null. Dipakai dialog setelah Verifikasi dan setelah
 * Pindah jadwal (spec C2 3.1, bagian 5).
 */
export async function getBookingMessage(appointmentId: string): Promise<ActionResult<BookingMessage | null>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const booking = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: MESSAGE_BOOKING_INCLUDE,
    });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");

    if (booking.status === "TERKONFIRMASI") {
      const message = confirmationMessageFor(booking, publicSiteUrl());
      return message ? { kind: "KONFIRMASI", ...message } : null;
    }
    if (needsTransfer(booking)) {
      const [transferDeadline] = await transferDeadlines([booking]);
      const instruction = transferInstructionFor({ ...booking, transferDeadline }, await getClinicSetting());
      return instruction ? { kind: "INSTRUKSI_TRANSFER", text: instruction.text, link: instruction.link } : null;
    }
    return null;
  });
}

/**
 * Dipanggil saat tombol WA ditekan. Jadwal booking saat itu ikut disimpan,
 * sehingga pindah jadwal menggugurkan catatan ini (spec C2 bagian 6).
 */
export async function recordAppointmentMessage(input: {
  appointmentId: string;
  kind: MessageKind;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    if (!(MESSAGE_KINDS as readonly string[]).includes(input.kind)) {
      throw new UserFacingError("Jenis pesan tidak dikenal.");
    }
    const booking = await prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      select: { status: true, source: true, bookingFee: true, startAt: true },
    });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (input.kind === "INSTRUKSI_TRANSFER") {
      if (!needsTransfer(booking)) throw new UserFacingError("Booking ini tidak sedang menunggu transfer.");
    } else if (booking.status !== "TERKONFIRMASI") {
      throw new UserFacingError("Booking ini belum terkonfirmasi.");
    }

    const created = await prisma.appointmentMessage.create({
      data: {
        appointmentId: input.appointmentId,
        kind: input.kind,
        scheduledFor: booking.startAt,
        sentById: actor.staffId,
        sentByName: actor.name,
      },
    });
    revalidateMessageViews();
    return { id: created.id };
  });
}

/** "Batalkan tanda": WA ternyata tidak terkirim. Catatan ditandai batal, tidak dihapus. */
export async function revokeAppointmentMessage(messageId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const { count } = await prisma.appointmentMessage.updateMany({
      where: { id: messageId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actor.staffId, revokedByName: actor.name },
    });
    if (count === 0) throw new UserFacingError("Tanda ini sudah dibatalkan. Muat ulang halaman.");
    revalidateMessageViews();
  });
}

/** Balasan pasien atas pengingat yang masih berlaku (spec C2 4.3). Boleh diubah. */
export async function recordReminderReply(input: {
  messageId: string;
  reply: ReminderReplyValue;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    if (!(REMINDER_REPLIES as readonly string[]).includes(input.reply)) {
      throw new UserFacingError("Balasan tidak dikenal.");
    }
    const message = await prisma.appointmentMessage.findUnique({
      where: { id: input.messageId },
      include: { appointment: { select: { startAt: true } } },
    });
    const valid =
      message !== null &&
      message.kind === "PENGINGAT" &&
      message.revokedAt === null &&
      message.scheduledFor.getTime() === message.appointment.startAt.getTime();
    if (!valid) throw new UserFacingError("Pengingat ini sudah tidak berlaku. Muat ulang halaman.");

    await prisma.appointmentMessage.update({
      where: { id: input.messageId },
      data: { reply: input.reply, repliedAt: new Date(), repliedById: actor.staffId, repliedByName: actor.name },
    });
    revalidateMessageViews();
  });
}
```

- [ ] **Step 7: Ubah `src/server/appointment.ts`**

Di `BOOKING_LIST_INCLUDE`, tambahkan setelah baris `intake: …`:

```ts
  // Catatan pesan untuk keterangan "Konfirmasi terkirim …" di baris booking (spec C2 4.5).
  messages: {
    select: { id: true, kind: true, scheduledFor: true, sentAt: true, sentByName: true, revokedAt: true, reply: true },
  },
```

Di `rescheduleAppointment` dan di `setStatus`, ganti baris `safeRevalidatePath("/admin/booking");` di masing-masing fungsi menjadi:

```ts
    safeRevalidatePath("/admin/booking");
    // Status dan jadwal menentukan isi halaman Pengingat (spec C2 bagian 4).
    safeRevalidatePath("/admin/pengingat");
```

`createAppointment` tidak diubah. Booking baru selalu berstatus Menunggu konfirmasi, jadi belum tampil di Pengingat.

- [ ] **Step 8: Jalankan uji untuk memastikan lulus**

Run: `npm run test:integration -- tests/integration/appointment-message.test.ts tests/integration/booking-queue.test.ts tests/integration/appointment.test.ts tests/integration/booking-expiry.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261002120000_pesan_booking src/server/site-url.ts src/server/appointment-message.ts src/server/appointment.ts tests/integration/appointment-message.test.ts
git commit -m "feat: record WhatsApp messages sent per booking, with revocation and reminder replies"
```

---

### Task 4: Daftar kerja Pengingat di server

**Files:**
- Create: `src/server/reminder.ts`
- Test: `tests/integration/reminder-worklist.test.ts`

**Interfaces:**
- Consumes: `groupReminderWork` (Task 2); `confirmationMessageFor`, `reminderMessageFor`, `WhatsAppMessage`, `ReminderReplyValue` (Task 1); `RescheduleTarget` (Task 1); `closedDatesBetween` (`booking-expiry.ts`); `publicSiteUrl` (Task 3).
- Produces:
  - `ReminderRow = { appointmentId; code; patientName; startAt: Date; staffName; branchName; confirmation: WhatsAppMessage | null; reminder: WhatsAppMessage | null; overdue: boolean; shifted: boolean; reminderSent: { messageId: string; sentAt: Date; sentByName: string; reply: ReminderReplyValue | null } | null; reschedule: RescheduleTarget }`
  - `ReminderWorklist = { today: string; confirm: ReminderRow[]; remind: ReminderRow[]; reminded: ReminderRow[] }`
  - `getReminderWorklist(): Promise<ReminderWorklist>`
  - `countReminderWork(): Promise<number>` (kotak 1 + kotak 2)

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/reminder-worklist.test.ts`:

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentMessageKind, AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { countReminderWork, getReminderWorklist } from "@/server/reminder";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "daftar-pengingat-uji";
const MRN = "SDY-2026-7750";
// Maret 2032: Rabu 3, Jumat 5, Sabtu 6, Minggu 7, Senin 8 (dibuat libur di uji ini), Selasa 9.
const HOLIDAY = new Date("2032-03-08T00:00:00Z");
const NOW = combineWitaDateAndMinutes("2032-03-06", 10 * 60); // Sabtu 10.00 WITA
const at = (date: string, hour: number) => combineWitaDateAndMinutes(date, hour * 60);

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: MRN } });
  await prisma.holiday.deleteMany({ where: { date: HOLIDAY } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("daftar kerja Pengingat", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  const ids: Record<string, string> = {};

  async function booking(key: string, startAt: Date, status: AppointmentStatus = "TERKONFIRMASI") {
    const created = await prisma.appointment.create({
      data: {
        code: `PNG-${key}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: "WHATSAPP",
        status,
        bookingFee: 100000,
        branchId,
        staffId,
        patientId,
      },
    });
    ids[key] = created.id;
    return created;
  }

  function message(appointmentId: string, kind: AppointmentMessageKind, scheduledFor: Date, sentAt: Date) {
    return prisma.appointmentMessage.create({
      data: { appointmentId, kind, scheduledFor, sentAt, sentById: "s1", sentByName: "Rina" },
    });
  }

  beforeAll(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Pengingat", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Pengingat",
          address: "Jl. Uji Pengingat No. 2",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: MRN, name: "Maria Pengingat", whatsapp: "6281277500001" } })
    ).id;
    await prisma.holiday.create({ data: { date: HOLIDAY, name: "Libur Uji Pengingat", kind: "LIBUR_KLINIK" } });

    const wednesday = at("2032-03-03", 10);
    const p = await booking("P", at("2032-03-08", 11)); // Senin (libur): diingatkan Sabtu
    await message(p.id, "KONFIRMASI", p.startAt, wednesday);
    await booking("R", at("2032-03-08", 13)); // belum ada konfirmasi
    await booking("S", at("2032-03-08", 15), "MENUNGGU_KONFIRMASI"); // bukan Terkonfirmasi
    const t = await booking("T", at("2032-03-08", 16)); // sudah diingatkan
    await message(t.id, "KONFIRMASI", t.startAt, wednesday);
    await message(t.id, "PENGINGAT", t.startAt, at("2032-03-06", 9));
    await booking("U", at("2032-03-05", 15)); // jadwal sudah lewat
    const v = await booking("V", at("2032-03-10", 11)); // Rabu: diingatkan Selasa
    await message(v.id, "KONFIRMASI", v.startAt, wednesday);
    const z = await booking("Z", at("2032-03-09", 11)); // Selasa: Senin libur dan Minggu tutup, jadi Sabtu
    await message(z.id, "KONFIRMASI", z.startAt, wednesday);
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("mengelompokkan booking ke tiga kotak memakai tanggal libur dari basis data", async () => {
    const worklist = await getReminderWorklist();

    expect(worklist.today).toBe("2032-03-06");
    expect(worklist.confirm.map((row) => row.code)).toEqual(["PNG-R"]);
    expect(worklist.remind.map((row) => [row.code, row.overdue, row.shifted])).toEqual([
      ["PNG-P", false, true],
      ["PNG-Z", false, true],
    ]);
    expect(worklist.reminded.map((row) => [row.code, row.reminderSent?.sentByName, row.reminderSent?.reply])).toEqual([
      ["PNG-T", "Rina", null],
    ]);
  });

  it("setiap baris membawa teks pesan dan data pindah jadwal", async () => {
    const worklist = await getReminderWorklist();
    const [confirmRow] = worklist.confirm;
    expect(confirmRow.confirmation?.link).toMatch(/^https:\/\/wa\.me\/6281277500001\?text=/);
    expect(confirmRow.confirmation?.text).toContain("Alamat: Jl. Uji Pengingat No. 2");

    const [first] = worklist.remind;
    expect(first.reminder?.text).toContain("Senin, 8 Maret 2032 pukul 11.00 WITA");
    expect(first.reschedule).toMatchObject({
      appointmentId: ids.P,
      code: "PNG-P",
      durationMinutes: 30,
      staffId,
      branchId,
      patientName: "Maria Pengingat",
    });
  });

  it("angka menu = kotak 1 + kotak 2", async () => {
    expect(await countReminderWork()).toBe(3);
  });

  it("pindah jadwal menggugurkan catatan lama: booking kembali ke kotak 1", async () => {
    const t = await prisma.appointment.findUniqueOrThrow({ where: { id: ids.T } });
    await prisma.appointment.update({
      where: { id: ids.T },
      data: { startAt: at("2032-03-09", 16), endAt: new Date(at("2032-03-09", 16).getTime() + 30 * 60 * 1000) },
    });
    try {
      const worklist = await getReminderWorklist();
      expect(worklist.confirm.map((row) => row.code)).toEqual(["PNG-R", "PNG-T"]);
      expect(worklist.reminded).toEqual([]);
    } finally {
      await prisma.appointment.update({ where: { id: ids.T }, data: { startAt: t.startAt, endAt: t.endAt } });
    }
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test:integration -- tests/integration/reminder-worklist.test.ts`
Expected: FAIL. Modul `@/server/reminder` belum ada.

- [ ] **Step 3: Tulis `src/server/reminder.ts`**

```ts
"use server";

import type { RescheduleTarget } from "@/lib/booking-actions";
import {
  confirmationMessageFor,
  reminderMessageFor,
  type ReminderReplyValue,
  type WhatsAppMessage,
} from "@/lib/booking-messages";
import { MAX_LOOKBACK_DAYS } from "@/lib/confirmation-window";
import { prisma } from "@/lib/db";
import { groupReminderWork } from "@/lib/reminder-work";
import { witaDateString } from "@/lib/time";
import { closedDatesBetween } from "@/server/booking-expiry";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

/** Satu baris halaman Pengingat. Hanya identitas dan jadwal — tanpa data klinis. */
export type ReminderRow = {
  appointmentId: string;
  code: string;
  patientName: string;
  startAt: Date;
  staffName: string;
  branchName: string;
  confirmation: WhatsAppMessage | null;
  reminder: WhatsAppMessage | null;
  /** Kotak 2: hari pengingatnya sudah lewat. */
  overdue: boolean;
  /** Kotak 2: hari sebelum jadwal tutup, jadi diingatkan lebih awal. */
  shifted: boolean;
  /** Kotak 3: pengingat yang berlaku. */
  reminderSent: { messageId: string; sentAt: Date; sentByName: string; reply: ReminderReplyValue | null } | null;
  reschedule: RescheduleTarget;
};

export type ReminderWorklist = { today: string; confirm: ReminderRow[]; remind: ReminderRow[]; reminded: ReminderRow[] };

const DAY_MS = 24 * 60 * 60 * 1000;

const WORK_INCLUDE = {
  patient: { select: { name: true, whatsapp: true } },
  staff: { select: { name: true } },
  branch: { select: { name: true, address: true, mapsUrl: true } },
  service: { select: { name: true } },
  messages: {
    select: { id: true, kind: true, scheduledFor: true, sentAt: true, sentByName: true, revokedAt: true, reply: true },
  },
} as const;

/** Booking Terkonfirmasi yang jadwalnya belum lewat, dikelompokkan ke tiga kotak (spec C2 bagian 4). */
async function loadReminderGroups(now: Date) {
  const bookings = await prisma.appointment.findMany({
    where: { status: "TERKONFIRMASI", startAt: { gt: now }, patientId: { not: null } },
    include: WORK_INCLUDE,
    orderBy: { startAt: "asc" },
  });
  const latest = bookings.length > 0 ? bookings[bookings.length - 1].startAt : now;
  const closedDates = await closedDatesBetween(new Date(now.getTime() - MAX_LOOKBACK_DAYS * DAY_MS), latest);
  return groupReminderWork(bookings, { now, closedDates });
}

/** Angka di menu Pengingat: pesan yang masih harus dikirim (kotak 1 + kotak 2). */
export async function countReminderWork(): Promise<number> {
  await requireCapability("booking:manage");
  const groups = await loadReminderGroups(new Date());
  return groups.confirm.length + groups.remind.length;
}

export async function getReminderWorklist(): Promise<ReminderWorklist> {
  await requireCapability("booking:manage");
  const now = new Date();
  const groups = await loadReminderGroups(now);
  const siteUrl = publicSiteUrl();

  type Loaded = (typeof groups.confirm)[number];
  const toRow = (booking: Loaded, extra: Partial<ReminderRow> = {}): ReminderRow => ({
    appointmentId: booking.id,
    code: booking.code,
    // CHECK appointment_patient_required + filter di atas: booking Terkonfirmasi selalu punya pasien.
    patientName: booking.patient!.name,
    startAt: booking.startAt,
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    confirmation: confirmationMessageFor(booking, siteUrl),
    reminder: reminderMessageFor(booking),
    overdue: false,
    shifted: false,
    reminderSent: null,
    reschedule: {
      appointmentId: booking.id,
      code: booking.code,
      patientName: booking.patient!.name,
      startAt: booking.startAt,
      durationMinutes: Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60_000),
      staffId: booking.staffId,
      staffName: booking.staff.name,
      branchId: booking.branchId,
      branchName: booking.branch.name,
    },
    ...extra,
  });

  return {
    today: witaDateString(now),
    confirm: groups.confirm.map((booking) => toRow(booking)),
    remind: groups.remind.map((booking) => toRow(booking, { overdue: booking.overdue, shifted: booking.shifted })),
    reminded: groups.reminded.map((booking) =>
      toRow(booking, {
        reminderSent: {
          messageId: booking.reminder.id,
          sentAt: booking.reminder.sentAt,
          sentByName: booking.reminder.sentByName,
          reply: booking.reminder.reply,
        },
      }),
    ),
  };
}
```

- [ ] **Step 4: Jalankan uji untuk memastikan lulus**

Run: `npm run test:integration -- tests/integration/reminder-worklist.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/reminder.ts tests/integration/reminder-worklist.test.ts
git commit -m "feat: build the reminder worklist and its sidebar count on the server"
```

---

### Task 5: Ketersediaan tanpa jam booking itu sendiri

**Files:**
- Modify: `src/server/availability.ts` (`AvailabilityOptions`, kueri booking sibuk di `computeAvailability` dan `computeAvailabilityRange`)
- Modify: `src/server/schedule.ts` (`getStaffAvailabilityForAdmin`, `getStaffAvailabilityRange`)
- Test: `tests/integration/reschedule.test.ts`

**Interfaces:**
- Produces:
  - `AvailabilityOptions.excludeAppointmentId?: string`, juga diterima `computeAvailabilityRange(input, { minLeadMinutes, excludeAppointmentId? })`
  - `getStaffAvailabilityForAdmin(input: AvailabilityInput & { excludeAppointmentId?: string })`
  - `getStaffAvailabilityRange(input: { staffId; branchId; durationMinutes; from; days; excludeAppointmentId?: string })`

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/reschedule.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { rescheduleAppointment } from "@/server/appointment";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange } from "@/server/schedule";
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

const SLUG = "pindah-jadwal-uji";
const MRN = "SDY-2026-7760";
const DATE = "2032-03-01"; // Senin
const at = (minutes: number) => combineWitaDateAndMinutes(DATE, minutes);

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { medicalRecordNumber: MRN } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("pindah jadwal", () => {
  let staffId: string;
  let branchId: string;
  let ownId: string;

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Dokter Pindah", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Pindah",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–14.00",
          status: "AKTIF",
        },
      })
    ).id;
    // Senin 11.00–14.00.
    await prisma.scheduleTemplate.create({ data: { staffId, branchId, weekday: 1, startMinute: 660, endMinute: 840 } });
    const patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: MRN, name: "Pasien Pindah", whatsapp: "6281277600001" } })
    ).id;
    const book = (code: string, from: number, to: number) =>
      prisma.appointment.create({
        data: {
          code,
          type: "TREATMENT",
          source: "WHATSAPP",
          status: "TERKONFIRMASI",
          branchId,
          staffId,
          patientId,
          startAt: at(from),
          endAt: at(to),
        },
      });
    ownId = (await book("PINDAH-A", 660, 720)).id; // 11.00–12.00, booking yang dipindah
    await book("PINDAH-B", 780, 810); // 13.00–13.30, booking orang lain
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("jam milik booking itu sendiri tidak dihitung terisi, jam booking lain tetap terisi", async () => {
    const input = { staffId, branchId, date: DATE, durationMinutes: 60 };
    expect((await getStaffAvailabilityForAdmin(input)).map((slot) => slot.label)).toEqual(["12.00"]);
    expect(
      (await getStaffAvailabilityForAdmin({ ...input, excludeAppointmentId: ownId })).map((slot) => slot.label),
    ).toEqual(["11.00", "11.30", "12.00"]);

    const range = { staffId, branchId, durationMinutes: 60, from: DATE, days: 1 };
    expect((await getStaffAvailabilityRange(range))[0].openCount).toBe(1);
    expect((await getStaffAvailabilityRange({ ...range, excludeAppointmentId: ownId }))[0].openCount).toBe(3);
  });

  it("boleh digeser ke jam yang tumpang tindih dengan jamnya sendiri", async () => {
    await unwrap(rescheduleAppointment(ownId, { startAt: at(690), endAt: at(750) }));
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: ownId } })).startAt).toEqual(at(690));
  });

  it("ditolak dengan pesan jelas bila bentrok dengan booking lain", async () => {
    expect(await rescheduleAppointment(ownId, { startAt: at(750), endAt: at(810) })).toEqual({
      ok: false,
      error: "Slot baru saja terisi. Pilih jam lain.",
    });
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test:integration -- tests/integration/reschedule.test.ts`
Expected: uji pertama FAIL, karena dengan `excludeAppointmentId` hasilnya tetap `["12.00"]`. Dua uji pindah jadwal lainnya sudah lulus (perilaku yang sudah ada, dijaga sebagai regresi).

- [ ] **Step 3: Terima `excludeAppointmentId` di `src/server/availability.ts`**

Tambahkan ke tipe `AvailabilityOptions` setelah `holds?`:

```ts
  /**
   * Pindah jadwal (spec C2 bagian 5): jam milik booking ini tidak dihitung
   * terisi, sehingga booking bisa digeser ke jam yang tumpang tindih dengan
   * jam lamanya. Exclusion constraint tetap menjaga bentrok dengan booking lain.
   */
  excludeAppointmentId?: string;
```

Di `computeAvailability`, ubah `where` kueri `prisma.appointment.findMany` (booking sibuk) menjadi:

```ts
      where: {
        staffId: input.staffId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        ...(options.excludeAppointmentId ? { id: { not: options.excludeAppointmentId } } : {}),
      },
```

Ubah tanda tangan `computeAvailabilityRange` menjadi:

```ts
export async function computeAvailabilityRange(
  input: { staffId: string; branchId: string; durationMinutes: number; from: string; days: number },
  options: Pick<AvailabilityOptions, "minLeadMinutes" | "excludeAppointmentId">,
): Promise<DayAvailability[]> {
```

Ubah juga `where` kueri booking sibuknya menjadi:

```ts
      where: {
        staffId: input.staffId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
        ...(options.excludeAppointmentId ? { id: { not: options.excludeAppointmentId } } : {}),
      },
```

- [ ] **Step 4: Teruskan dari `src/server/schedule.ts`**

Ganti `getStaffAvailabilityForAdmin` dan `getStaffAvailabilityRange` dengan:

```ts
/**
 * Untuk admin yang mencatat booking: tanpa batas 2 jam, karena pasien
 * walk-in dan penelepon sering minta jam terdekat (PRD F9). Slot yang
 * sudah lewat tetap tidak ditawarkan. Hold pasien tidak mengikat admin.
 * `excludeAppointmentId`: saat pindah jadwal, jam booking itu sendiri tidak dihitung terisi.
 */
export async function getStaffAvailabilityForAdmin(
  input: AvailabilityInput & { excludeAppointmentId?: string },
): Promise<SlotOption[]> {
  await requireCapability("booking:manage");
  return computeAvailability(input, { minLeadMinutes: 0, excludeAppointmentId: input.excludeAppointmentId });
}

/**
 * Strip tanggal Booking Baru dan Pindah jadwal: ringkasan per hari dengan aturan
 * jam yang sama seperti getStaffAvailabilityForAdmin (tanpa batas 2 jam, hold diabaikan).
 */
export async function getStaffAvailabilityRange(input: {
  staffId: string;
  branchId: string;
  durationMinutes: number;
  from: string;
  days: number;
  excludeAppointmentId?: string;
}): Promise<DayAvailability[]> {
  await requireCapability("booking:manage");
  return computeAvailabilityRange(input, { minLeadMinutes: 0, excludeAppointmentId: input.excludeAppointmentId });
}
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

Run: `npm run test:integration -- tests/integration/reschedule.test.ts tests/integration/availability-range.test.ts tests/integration/schedule.test.ts tests/integration/public-slots.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add src/server/availability.ts src/server/schedule.ts tests/integration/reschedule.test.ts
git commit -m "feat: let availability ignore the booking being rescheduled"
```

---

### Task 6: Komponen kirim pesan dan dialog Pindah jadwal

**Files:**
- Create: `src/components/admin/whatsapp-send-button.tsx`
- Create: `src/components/admin/message-actions.tsx`
- Create: `src/components/admin/send-message-dialog.tsx`
- Create: `src/components/admin/reschedule-dialog.tsx`
- Modify: `src/components/admin/date-strip.tsx`, `src/components/admin/slot-picker.tsx` (prop `excludeAppointmentId`)
- Test: `tests/unit/components/whatsapp-send-button.test.tsx`, `tests/unit/components/send-message-dialog.test.tsx`, `tests/unit/components/reschedule-dialog.test.tsx`

**Interfaces:**
- Consumes: `recordAppointmentMessage`, `getBookingMessage` (Task 3); `rescheduleAppointment` (sudah ada); `getStaffAvailabilityRange`, `getStaffAvailabilityForAdmin` dengan `excludeAppointmentId` (Task 5); `MessageKind`, `WhatsAppMessage`, `BookingMessage`, `RescheduleTarget` (Task 1).
- Produces:
  - `recordSentMessage(appointmentId, kind): Promise<boolean>` dan `WhatsAppSendButton({ href, appointmentId, kind, children, onRecorded?, size?, variant?, className? })`
  - `MessageActions({ appointmentId, kind, message, sendLabel, onSent?, layout?: "stack" | "inline" })`
  - `SendMessageDialog({ open, onOpenChange, title, description?, appointmentId, message: BookingMessage | null, sendLabel, laterNote? })`
  - `RescheduleDialog({ target, today, open, onOpenChange })`
  - `DateStrip` dan `SlotPicker` menerima `excludeAppointmentId?: string`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/whatsapp-send-button.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { WhatsAppSendButton } from "@/components/admin/whatsapp-send-button";
import { recordAppointmentMessage } from "@/server/appointment-message";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment-message", () => ({ recordAppointmentMessage: vi.fn() }));

function renderButton(onRecorded = vi.fn()) {
  render(
    <WhatsAppSendButton href="https://wa.me/6281234567001?text=Halo" appointmentId="a1" kind="PENGINGAT" onRecorded={onRecorded}>
      Ingatkan via WA
    </WhatsAppSendButton>,
  );
  const link = screen.getByRole("link", { name: "Ingatkan via WA" });
  // jsdom tidak bernavigasi; cegah percobaan navigasinya.
  link.addEventListener("click", (event) => event.preventDefault());
  return { link, onRecorded };
}

beforeEach(() => vi.clearAllMocks());

describe("WhatsAppSendButton", () => {
  it("membuka WA di tab baru dan mencatat pengiriman", async () => {
    vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m1" } });
    const { link, onRecorded } = renderButton();
    expect(link).toHaveAttribute("href", "https://wa.me/6281234567001?text=Halo");
    expect(link).toHaveAttribute("target", "_blank");

    fireEvent.click(link);

    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "a1", kind: "PENGINGAT" });
  });

  it("pencatatan ditolak server: pesan galatnya tampil", async () => {
    vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: false, error: "Booking ini belum terkonfirmasi." });
    const { link, onRecorded } = renderButton();
    fireEvent.click(link);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Booking ini belum terkonfirmasi."));
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("jaringan gagal: admin diberi tahu bahwa pengiriman belum tercatat", async () => {
    vi.mocked(recordAppointmentMessage).mockRejectedValue(new Error("offline"));
    const { link, onRecorded } = renderButton();
    fireEvent.click(link);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Pengiriman belum tercatat. Tekan lagi bila WhatsApp sudah terkirim."),
    );
    expect(onRecorded).not.toHaveBeenCalled();
  });
});
```

`tests/unit/components/send-message-dialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendMessageDialog } from "@/components/admin/send-message-dialog";
import type { BookingMessage } from "@/lib/booking-messages";
import { recordAppointmentMessage } from "@/server/appointment-message";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment-message", () => ({ recordAppointmentMessage: vi.fn() }));

const MESSAGE: BookingMessage = {
  kind: "KONFIRMASI",
  text: "Halo Maria, booking Anda sudah terkonfirmasi.",
  link: "https://wa.me/6281234567001?text=Halo",
};

function renderDialog(message: BookingMessage | null = MESSAGE) {
  const onOpenChange = vi.fn();
  render(
    <SendMessageDialog
      open
      onOpenChange={onOpenChange}
      title="✓ Booking SDY-7KQ2 terkonfirmasi"
      description="Maria Wenas · Sen, 5 Okt 11.00"
      appointmentId="a1"
      message={message}
      sendLabel="Kirim konfirmasi via WA"
      laterNote="Booking ini tetap tercatat di Pengingat → Konfirmasi belum dikirim."
    />,
  );
  return onOpenChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m1" } });
});

describe("SendMessageDialog", () => {
  it("tombol WA mencatat konfirmasi lalu menutup dialog", async () => {
    const onOpenChange = renderDialog();
    expect(screen.getByRole("dialog", { name: "✓ Booking SDY-7KQ2 terkonfirmasi" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Kirim konfirmasi via WA" });
    link.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(link);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "a1", kind: "KONFIRMASI" });
  });

  it("Salin teks menyalin pesan tanpa mencatatnya sebagai terkirim", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Salin teks" }));
    expect(await navigator.clipboard.readText()).toBe(MESSAGE.text);
    expect(recordAppointmentMessage).not.toHaveBeenCalled();
  });

  it("nomor tidak sah: tanpa tombol WA, Salin teks tetap ada", () => {
    renderDialog({ ...MESSAGE, link: null });
    expect(screen.queryByRole("link", { name: /Kirim/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nomor WhatsApp pasien tidak dikenali.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salin teks" })).toBeInTheDocument();
  });

  it("Nanti saja menutup dialog dan menjelaskan ke mana booking ini pergi", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderDialog();
    expect(screen.getByText("Booking ini tetap tercatat di Pengingat → Konfirmasi belum dikirim.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nanti saja" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

`tests/unit/components/reschedule-dialog.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { RescheduleDialog } from "@/components/admin/reschedule-dialog";
import type { RescheduleTarget } from "@/lib/booking-actions";
import { addDaysToDateString, combineWitaDateAndMinutes } from "@/lib/time";
import { rescheduleAppointment } from "@/server/appointment";
import { getBookingMessage } from "@/server/appointment-message";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange, type DayAvailability } from "@/server/schedule";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({ rescheduleAppointment: vi.fn() }));
vi.mock("@/server/appointment-message", () => ({ getBookingMessage: vi.fn(), recordAppointmentMessage: vi.fn() }));
vi.mock("@/server/schedule", () => ({
  getStaffAvailabilityRange: vi.fn(),
  getStaffAvailabilityForAdmin: vi.fn(),
}));

const TODAY = "2026-10-05"; // Senin
const TARGET: RescheduleTarget = {
  appointmentId: "a1",
  code: "SDY-7KQ2",
  patientName: "Maria Wenas",
  startAt: combineWitaDateAndMinutes(TODAY, 11 * 60),
  durationMinutes: 30,
  staffId: "d1",
  staffName: "dr. Diane",
  branchId: "b1",
  branchName: "SunDY Mahakeret",
};
const NEW_START = combineWitaDateAndMinutes("2026-10-06", 13 * 60);
const SLOT = { startAt: NEW_START, endAt: combineWitaDateAndMinutes("2026-10-06", 13 * 60 + 30), label: "13.00" };
const TUESDAY = "Selasa, 6 Oktober 2026 — 2 jam kosong";

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<RescheduleDialog target={TARGET} today={TODAY} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

async function pickNewSlot(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: TUESDAY }));
  await user.click(await screen.findByRole("button", { name: "13.00" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStaffAvailabilityRange).mockResolvedValue(
    Array.from({ length: 14 }, (_, index): DayAvailability => ({
      date: addDaysToDateString(TODAY, index),
      state: index === 1 ? "OPEN" : "CLOSED",
      openCount: index === 1 ? 2 : 0,
    })),
  );
  vi.mocked(getStaffAvailabilityForAdmin).mockResolvedValue([SLOT]);
  vi.mocked(rescheduleAppointment).mockResolvedValue({ ok: true, data: {} as never });
  vi.mocked(getBookingMessage).mockResolvedValue({
    ok: true,
    data: { kind: "KONFIRMASI", text: "Halo Maria", link: "https://wa.me/6281234567001?text=Halo" },
  });
});

describe("RescheduleDialog", () => {
  it("menampilkan jadwal saat ini dan memuat ketersediaan tanpa menghitung booking ini", async () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Pindah jadwal — SDY-7KQ2" })).toHaveTextContent(
      "Maria Wenas · sekarang Sen, 5 Okt 11.00 · dr. Diane · SunDY Mahakeret",
    );
    expect(screen.getByText(/Untuk ganti tenaga atau cabang, batalkan lalu buat booking baru/)).toBeInTheDocument();
    await screen.findByRole("group", { name: "Pilih tanggal" });
    expect(getStaffAvailabilityRange).toHaveBeenCalledWith({
      staffId: "d1",
      branchId: "b1",
      durationMinutes: 30,
      from: TODAY,
      days: 14,
      excludeAppointmentId: "a1",
    });
  });

  it("menyimpan jam baru lalu menawarkan konfirmasi jadwal baru", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pickNewSlot(user);
    expect(getStaffAvailabilityForAdmin).toHaveBeenCalledWith({
      staffId: "d1",
      branchId: "b1",
      date: "2026-10-06",
      durationMinutes: 30,
      excludeAppointmentId: "a1",
    });

    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));

    expect(await screen.findByRole("heading", { name: "Jadwal dipindah" })).toBeInTheDocument();
    expect(rescheduleAppointment).toHaveBeenCalledWith("a1", { startAt: SLOT.startAt, endAt: SLOT.endAt });
    expect(screen.getByText(/jadwal baru Sel, 6 Okt 13.00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kirim konfirmasi jadwal baru via WA" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567001?text=Halo",
    );
  });

  it("booking yang belum transfer: tombol instruksi transfer", async () => {
    vi.mocked(getBookingMessage).mockResolvedValue({
      ok: true,
      data: { kind: "INSTRUKSI_TRANSFER", text: "Mohon transfer", link: "https://wa.me/6281234567001?text=T" },
    });
    const user = userEvent.setup();
    renderDialog();
    await pickNewSlot(user);
    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));
    expect(await screen.findByRole("link", { name: "Kirim instruksi transfer" })).toBeInTheDocument();
  });

  it("tanpa pesan lanjutan: hanya Tutup", async () => {
    vi.mocked(getBookingMessage).mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    const onOpenChange = renderDialog();
    await pickNewSlot(user);
    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));
    await screen.findByRole("heading", { name: "Jadwal dipindah" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tutup" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("jam direbut booking lain: pesan galat, tanggal tetap, strip dan jam dimuat ulang", async () => {
    vi.mocked(rescheduleAppointment).mockResolvedValue({ ok: false, error: "Slot baru saja terisi. Pilih jam lain." });
    const user = userEvent.setup();
    renderDialog();
    await pickNewSlot(user);
    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Slot baru saja terisi. Pilih jam lain."));
    await waitFor(() => expect(getStaffAvailabilityRange).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStaffAvailabilityForAdmin).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: TUESDAY })).toHaveAttribute("aria-pressed", "true");
    expect(getBookingMessage).not.toHaveBeenCalled();
  });

  it("Simpan tanpa memilih jam: diminta memilih dulu", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));
    expect(toast.error).toHaveBeenCalledWith("Pilih tanggal dan jam baru.");
    expect(rescheduleAppointment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/whatsapp-send-button.test.tsx tests/unit/components/send-message-dialog.test.tsx tests/unit/components/reschedule-dialog.test.tsx`
Expected: FAIL. Ketiga komponen belum ada.

- [ ] **Step 3: Tambahkan `excludeAppointmentId` ke `DateStrip` dan `SlotPicker`**

`src/components/admin/date-strip.tsx`:
- Tambahkan ke tipe `Props` setelah `refreshKey`:

```ts
  /** Pindah jadwal: jam milik booking ini tidak dihitung terisi. */
  excludeAppointmentId?: string;
```

- Ganti baris tanda tangan, `requestKey`, efek, dan dependensinya menjadi:

```tsx
export function DateStrip({
  staffId,
  branchId,
  durationMinutes,
  today,
  selected,
  onSelect,
  refreshKey,
  excludeAppointmentId,
}: Props) {
  const requestKey = `${staffId}|${branchId}|${durationMinutes}|${today}|${refreshKey}|${excludeAppointmentId ?? ""}`;
  const [loaded, setLoaded] = useState<LoadState>({ key: "", days: [], failed: false });
  const [showOtherDate, setShowOtherDate] = useState(false);
  const latestKey = useRef(requestKey);

  useEffect(() => {
    latestKey.current = requestKey;
    getStaffAvailabilityRange({
      staffId,
      branchId,
      durationMinutes,
      from: today,
      days: STRIP_DAYS,
      ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
    })
      .then((days) => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, days, failed: false });
      })
      .catch(() => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, days: [], failed: true });
      });
  }, [requestKey, staffId, branchId, durationMinutes, today, excludeAppointmentId]);
```

`src/components/admin/slot-picker.tsx`:
- Tambahkan ke tipe `Props` setelah `refreshKey`:

```ts
  /** Pindah jadwal: jam milik booking ini tidak dihitung terisi. */
  excludeAppointmentId?: string;
```

- Ganti tanda tangan, `requestKey`, dan efek menjadi:

```tsx
export function SlotPicker({
  staffId,
  branchId,
  date,
  durationMinutes,
  selected,
  onSelect,
  refreshKey,
  excludeAppointmentId,
}: Props) {
  const requestKey = `${staffId}|${branchId}|${date}|${durationMinutes}|${refreshKey}|${excludeAppointmentId ?? ""}`;
  const [loaded, setLoaded] = useState<LoadState>({ key: "", slots: [], failed: false });
  const latestKey = useRef(requestKey);

  useEffect(() => {
    latestKey.current = requestKey;
    getStaffAvailabilityForAdmin({
      staffId,
      branchId,
      date,
      durationMinutes,
      ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
    })
      .then((slots) => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, slots, failed: false });
      })
      .catch(() => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, slots: [], failed: true });
      });
  }, [requestKey, staffId, branchId, date, durationMinutes, excludeAppointmentId]);
```

Objek panggilan hanya membawa `excludeAppointmentId` bila ada. Dengan begitu uji Booking Baru (C1), yang memeriksa argumen persis, tetap lulus.

- [ ] **Step 4: Tulis `src/components/admin/whatsapp-send-button.tsx`**

```tsx
"use client";

import type { ComponentProps, ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MessageKind } from "@/lib/booking-messages";
import { recordAppointmentMessage } from "@/server/appointment-message";

/**
 * Mencatat pesan WA sebagai terkirim (spec C2 bagian 6). WhatsApp sudah terbuka
 * di tab baru saat ini dipanggil, jadi kegagalan hanya bisa dilaporkan: admin
 * menekan lagi bila pesannya memang terkirim.
 */
export async function recordSentMessage(appointmentId: string, kind: MessageKind): Promise<boolean> {
  try {
    const result = await recordAppointmentMessage({ appointmentId, kind });
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    return true;
  } catch {
    toast.error("Pengiriman belum tercatat. Tekan lagi bila WhatsApp sudah terkirim.");
    return false;
  }
}

/** Tautan wa.me yang sekaligus mencatat pengiriman. "Salin teks" sengaja tidak memakai ini. */
export function WhatsAppSendButton({
  href,
  appointmentId,
  kind,
  children,
  onRecorded,
  ...buttonProps
}: {
  href: string;
  appointmentId: string;
  kind: MessageKind;
  children: ReactNode;
  onRecorded?: () => void;
} & Pick<ComponentProps<typeof Button>, "size" | "variant" | "className">) {
  async function handleClick() {
    if (await recordSentMessage(appointmentId, kind)) onRecorded?.();
  }

  return (
    <Button asChild {...buttonProps}>
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => void handleClick()}>
        {children}
      </a>
    </Button>
  );
}
```

- [ ] **Step 5: Tulis `src/components/admin/message-actions.tsx`**

```tsx
"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MessageKind, WhatsAppMessage } from "@/lib/booking-messages";
import { cn } from "@/lib/utils";
import { WhatsAppSendButton } from "./whatsapp-send-button";

/** Tombol kirim WA (mencatat) dan Salin teks (tidak mencatat), untuk dialog dan baris Pengingat. */
export function MessageActions({
  appointmentId,
  kind,
  message,
  sendLabel,
  onSent,
  layout = "stack",
}: {
  appointmentId: string;
  kind: MessageKind;
  message: WhatsAppMessage;
  sendLabel: string;
  onSent?: () => void;
  layout?: "stack" | "inline";
}) {
  const stack = layout === "stack";

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.text);
      toast.success("Teks disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <div className={stack ? "space-y-2" : "flex flex-wrap items-center gap-1"}>
      {message.link ? (
        <WhatsAppSendButton
          href={message.link}
          appointmentId={appointmentId}
          kind={kind}
          size={stack ? "default" : "sm"}
          className={cn(stack && "w-full", "bg-emerald-700 text-white hover:bg-emerald-800")}
          onRecorded={onSent}
        >
          {sendLabel}
        </WhatsAppSendButton>
      ) : (
        <p className="text-sm text-muted-foreground">Nomor WhatsApp pasien tidak dikenali.</p>
      )}
      <Button
        type="button"
        variant="outline"
        size={stack ? "default" : "sm"}
        className={cn(stack && "w-full")}
        onClick={() => void copy()}
      >
        {stack ? "Salin teks" : "Salin"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Tulis `src/components/admin/send-message-dialog.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BookingMessage } from "@/lib/booking-messages";
import { MessageActions } from "./message-actions";

/** Dialog setelah Verifikasi (spec C2 3.1): kirim konfirmasi sekarang, atau nanti dari halaman Pengingat. */
export function SendMessageDialog({
  open,
  onOpenChange,
  title,
  description,
  appointmentId,
  message,
  sendLabel,
  laterNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  appointmentId: string;
  message: BookingMessage | null;
  sendLabel: string;
  laterNote?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {message && (
          <MessageActions
            appointmentId={appointmentId}
            kind={message.kind}
            message={message}
            sendLabel={sendLabel}
            onSent={() => onOpenChange(false)}
          />
        )}
        <DialogFooter className="flex-col items-stretch gap-1 sm:flex-col">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {message ? "Nanti saja" : "Tutup"}
          </Button>
          {message && laterNote && <p className="text-center text-xs text-muted-foreground">{laterNote}</p>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Tulis `src/components/admin/reschedule-dialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
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
import type { RescheduleTarget } from "@/lib/booking-actions";
import type { BookingMessage } from "@/lib/booking-messages";
import { formatShortIndonesianDate } from "@/lib/format";
import type { SlotOption } from "@/lib/slot";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { rescheduleAppointment } from "@/server/appointment";
import { getBookingMessage } from "@/server/appointment-message";
import { DateStrip } from "./date-strip";
import { MessageActions } from "./message-actions";
import { SlotPicker } from "./slot-picker";

function scheduleLabel(date: Date): string {
  return `${formatShortIndonesianDate(date)} ${minutesToTimeLabel(witaMinutesOfDay(date))}`;
}

const SEND_LABEL: Record<BookingMessage["kind"], string> = {
  KONFIRMASI: "Kirim konfirmasi jadwal baru via WA",
  INSTRUKSI_TRANSFER: "Kirim instruksi transfer",
};

/**
 * Pindah tanggal dan jam pada booking yang sama (spec C2 bagian 5). Tenaga,
 * cabang, durasi, kode, dan biaya booking tetap.
 */
export function RescheduleDialog({
  target,
  today,
  open,
  onOpenChange,
}: {
  target: RescheduleTarget;
  /** Hari ini dalam WITA, dari server. */
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [done, setDone] = useState<{ startAt: Date; message: BookingMessage | null } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!slot) {
      toast.error("Pilih tanggal dan jam baru.");
      return;
    }
    const chosen = slot;
    startTransition(async () => {
      try {
        const result = await rescheduleAppointment(target.appointmentId, {
          startAt: chosen.startAt,
          endAt: chosen.endAt,
        });
        if (!result.ok) {
          toast.error(result.error);
          // Jam yang baru saja direbut booking lain harus hilang dari pilihan.
          setSlot(null);
          setRefreshKey((k) => k + 1);
          return;
        }
        // Jadwal sudah pindah; pesan lanjutan yang gagal dimuat tidak membatalkannya.
        let message: BookingMessage | null = null;
        try {
          const follow = await getBookingMessage(target.appointmentId);
          if (follow.ok) message = follow.data;
        } catch {
          message = null;
        }
        setDone({ startAt: chosen.startAt, message });
      } catch {
        toast.error("Gagal memindah jadwal. Coba lagi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Jadwal dipindah</DialogTitle>
              <DialogDescription>
                {target.patientName} · {target.code} · jadwal baru {scheduleLabel(done.startAt)}
              </DialogDescription>
            </DialogHeader>
            {done.message && (
              <MessageActions
                appointmentId={target.appointmentId}
                kind={done.message.kind}
                message={done.message}
                sendLabel={SEND_LABEL[done.message.kind]}
                onSent={() => onOpenChange(false)}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pindah jadwal — {target.code}</DialogTitle>
              <DialogDescription>
                {target.patientName} · sekarang {scheduleLabel(target.startAt)} · {target.staffName} ·{" "}
                {target.branchName}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Hanya tanggal dan jam yang berubah. Untuk ganti tenaga atau cabang, batalkan lalu buat booking baru.
            </p>
            <DateStrip
              staffId={target.staffId}
              branchId={target.branchId}
              durationMinutes={target.durationMinutes}
              today={today}
              selected={date}
              onSelect={(d) => {
                setDate(d);
                setSlot(null);
              }}
              refreshKey={refreshKey}
              excludeAppointmentId={target.appointmentId}
            />
            {date ? (
              <SlotPicker
                staffId={target.staffId}
                branchId={target.branchId}
                date={date}
                durationMinutes={target.durationMinutes}
                selected={slot}
                onSelect={setSlot}
                refreshKey={refreshKey}
                excludeAppointmentId={target.appointmentId}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Pilih tanggal dulu.</p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type="button" disabled={pending} onClick={save}>
                {pending ? "Menyimpan…" : "Simpan jadwal baru"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/whatsapp-send-button.test.tsx tests/unit/components/send-message-dialog.test.tsx tests/unit/components/reschedule-dialog.test.tsx tests/unit/components/date-strip.test.tsx tests/unit/components/appointment-form.test.tsx`
Expected: PASS. Uji strip tanggal dan Booking Baru (C1) tetap lulus.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/whatsapp-send-button.tsx src/components/admin/message-actions.tsx src/components/admin/send-message-dialog.tsx src/components/admin/reschedule-dialog.tsx src/components/admin/date-strip.tsx src/components/admin/slot-picker.tsx tests/unit/components/whatsapp-send-button.test.tsx tests/unit/components/send-message-dialog.test.tsx tests/unit/components/reschedule-dialog.test.tsx
git commit -m "feat: add WhatsApp send buttons that record delivery, the confirmation dialog, and the reschedule dialog"
```

---

### Task 7: Daftar Booking — dialog Verifikasi, tanda terkirim, dan Pindah jadwal

**Files:**
- Modify: `src/components/admin/appointment-table.tsx` (seluruh berkas)
- Modify: `src/app/(admin)/admin/booking/page.tsx` (seluruh berkas)
- Modify: `src/components/admin/booking-created-panel.tsx` (tombol WA)
- Modify: `src/lib/whatsapp.ts` (hapus `patientBookingConfirmationMessage`)
- Test: `tests/unit/components/appointment-table.test.tsx` (seluruh berkas), `tests/unit/components/booking-created-panel.test.tsx` (mock), `tests/unit/components/appointment-form.test.tsx` (mock), `tests/unit/whatsapp.test.ts` (hapus blok lama)

**Interfaces:**
- Consumes: Task 1–6. Dari C1: `transferInstructionFor`, `pendingDeadlineLabel`, `bookingServiceName`, `listAppointments`, `listPendingBookings`, `searchBookings`, `getClinicSetting`.
- Produces:
  - `BookingRow` + `messageNotes: string[]`, `reschedule: RescheduleTarget`
  - `AppointmentTable` prop wajib `today: string`
  - setelah Verifikasi berhasil: dialog "✓ Booking {kode} terkonfirmasi"
  - menu ⋯ "Pindah jadwal" membuka `RescheduleDialog`
  - tautan "Kirim instruksi transfer" dan "Kirim konfirmasi" mencatat pengiriman

- [ ] **Step 1: Tulis ulang uji tabel (gagal)**

`tests/unit/components/appointment-table.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { verifyAppointment } from "@/server/appointment";
import { getBookingMessage, recordAppointmentMessage } from "@/server/appointment-message";
import { getMatchCandidates } from "@/server/intake";
import { getStaffAvailabilityRange } from "@/server/schedule";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({
  cancelAppointment: vi.fn(),
  markAttended: vi.fn(),
  markNoShow: vi.fn(),
  verifyAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
}));
vi.mock("@/server/appointment-message", () => ({
  getBookingMessage: vi.fn(),
  recordAppointmentMessage: vi.fn(),
}));
vi.mock("@/server/intake", () => ({
  createPatientFromIntake: vi.fn(),
  getMatchCandidates: vi.fn(),
  matchPatient: vi.fn(),
}));
vi.mock("@/server/schedule", () => ({
  getStaffAvailabilityRange: vi.fn(),
  getStaffAvailabilityForAdmin: vi.fn(),
}));

const TODAY = "2026-10-05";

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
  messageNotes: [],
  reschedule: {
    appointmentId: "a1",
    code: "SDY-8F3K",
    patientName: "Siti Rahayu",
    startAt: combineWitaDateAndMinutes(TODAY, 15 * 60),
    durationMinutes: 30,
    staffId: "d1",
    staffName: "Dr. Diane",
    branchId: "b1",
    branchName: "SunDY Mahakeret",
  },
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
  reschedule: { ...base.reschedule, appointmentId: "a2", code: "SDY-WA01" },
};

function renderTable(rows: BookingRow[], options: { canReadRecords?: boolean; highlightId?: string } = {}) {
  return render(
    <AppointmentTable
      rows={rows}
      canReadRecords={options.canReadRecords ?? false}
      highlightId={options.highlightId}
      today={TODAY}
    />,
  );
}

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
  vi.mocked(getStaffAvailabilityRange).mockResolvedValue([]);
  vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m1" } });
});

describe("AppointmentTable pencocokan pasien", () => {
  it("booking situs yang belum dicocokkan menawarkan Cocokkan pasien dan belum Verifikasi", async () => {
    const user = userEvent.setup();
    renderTable([{ ...base, needsMatch: true, patientRecordNumber: "—" }]);
    expect(screen.queryByRole("button", { name: "Verifikasi" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cocokkan pasien" }));
    expect(await screen.findByRole("dialog", { name: "Cocokkan pasien — SDY-8F3K" })).toBeInTheDocument();
    expect(getMatchCandidates).toHaveBeenCalledWith("a1");
  });

  it("booking situs yang sudah dicocokkan: Verifikasi terlihat, Ganti pasien di menu membuka dialog", async () => {
    const user = userEvent.setup();
    renderTable([base]);
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
    await openMenu(user, "SDY-8F3K");
    await user.click(screen.getByRole("menuitem", { name: "Ganti pasien" }));
    expect(await screen.findByRole("dialog", { name: "Cocokkan pasien — SDY-8F3K" })).toBeInTheDocument();
  });

  it("booking situs yang sudah terkonfirmasi tidak lagi menawarkan Ganti pasien", async () => {
    const user = userEvent.setup();
    renderTable([{ ...base, status: "TERKONFIRMASI" }]);
    await openMenu(user, "SDY-8F3K");
    expect(screen.queryByRole("menuitem", { name: "Ganti pasien" })).not.toBeInTheDocument();
  });
});

describe("AppointmentTable aksi per baris", () => {
  it("booking WA menunggu: Verifikasi dan Kirim instruksi transfer terlihat, sisanya di menu", async () => {
    const user = userEvent.setup();
    renderTable([waRow], { canReadRecords: true });
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kirim instruksi transfer" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567890?text=Halo",
    );
    await openMenu(user, "SDY-WA01");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Salin instruksi transfer",
      "Hadir",
      "Tidak hadir",
      "Pindah jadwal",
      "Batalkan",
    ]);
  });

  it("Kirim instruksi transfer mencatat pengiriman", async () => {
    renderTable([waRow]);
    const link = screen.getByRole("link", { name: "Kirim instruksi transfer" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "a2", kind: "INSTRUKSI_TRANSFER" }),
    );
  });

  it("Salin instruksi transfer menyalin teks tanpa mencatat pengiriman", async () => {
    const user = userEvent.setup();
    renderTable([waRow]);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Salin instruksi transfer" }));
    expect(await navigator.clipboard.readText()).toBe("Halo Siti, mohon transfer…");
    expect(recordAppointmentMessage).not.toHaveBeenCalled();
  });

  it("Batalkan dari menu membuka dialog alasan", async () => {
    const user = userEvent.setup();
    renderTable([waRow]);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Batalkan" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Batalkan booking SDY-WA01?");
  });

  it("Pindah jadwal dari menu membuka dialog untuk booking itu", async () => {
    const user = userEvent.setup();
    renderTable([waRow]);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Pindah jadwal" }));
    expect(await screen.findByRole("dialog", { name: "Pindah jadwal — SDY-WA01" })).toBeInTheDocument();
    await waitFor(() =>
      expect(getStaffAvailabilityRange).toHaveBeenCalledWith(expect.objectContaining({ excludeAppointmentId: "a2" })),
    );
  });

  it("terkonfirmasi: Hadir dan Kirim konfirmasi; mengirim konfirmasi mencatatnya", async () => {
    renderTable([{ ...base, status: "TERKONFIRMASI", confirmation: { text: "Halo", link: "https://wa.me/62812?text=Halo" } }]);
    expect(screen.getByRole("button", { name: "Hadir" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Kirim konfirmasi" });
    expect(link).toHaveAttribute("href", "https://wa.me/62812?text=Halo");
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "a1", kind: "KONFIRMASI" }),
    );
  });

  it("Lihat isian ada di menu, hanya untuk yang berhak", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTable([base], { canReadRecords: true });
    await openMenu(user, "SDY-8F3K");
    expect(screen.getByRole("menuitem", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    unmount();

    renderTable([base]);
    await openMenu(user, "SDY-8F3K");
    expect(screen.queryByRole("menuitem", { name: "Lihat isian" })).not.toBeInTheDocument();
  });

  it("baris tanpa aksi tidak menampilkan menu", () => {
    renderTable([{ ...base, status: "SELESAI" }]);
    expect(screen.queryByRole("button", { name: /Aksi lain/ })).not.toBeInTheDocument();
  });
});

describe("AppointmentTable setelah Verifikasi (spec C2 3.1)", () => {
  it("dialog konfirmasi langsung muncul dengan tautan WA ke pasien", async () => {
    vi.mocked(verifyAppointment).mockResolvedValue({ ok: true, data: {} as never });
    vi.mocked(getBookingMessage).mockResolvedValue({
      ok: true,
      data: { kind: "KONFIRMASI", text: "Halo Siti", link: "https://wa.me/6281234567890?text=Halo%20Siti" },
    });
    const user = userEvent.setup();
    renderTable([waRow]);

    await user.click(screen.getByRole("button", { name: "Verifikasi" }));

    const dialog = await screen.findByRole("dialog", { name: "✓ Booking SDY-WA01 terkonfirmasi" });
    expect(dialog).toHaveTextContent("Siti Rahayu");
    expect(screen.getByRole("link", { name: "Kirim konfirmasi via WA" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567890?text=Halo%20Siti",
    );
    expect(getBookingMessage).toHaveBeenCalledWith("a2");
    expect(screen.getByText(/tetap tercatat di Pengingat/)).toBeInTheDocument();
  });

  it("Verifikasi gagal: tidak ada dialog", async () => {
    vi.mocked(verifyAppointment).mockResolvedValue({ ok: false, error: "Booking ini sudah berstatus terkonfirmasi." });
    const user = userEvent.setup();
    renderTable([waRow]);
    await user.click(screen.getByRole("button", { name: "Verifikasi" }));
    await waitFor(() => expect(verifyAppointment).toHaveBeenCalled());
    expect(getBookingMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("AppointmentTable keterangan dan batas", () => {
  it("menampilkan keterangan pesan yang sudah terkirim", () => {
    renderTable([{ ...base, messageNotes: ["Konfirmasi terkirim 10.12 · Rina", "Diingatkan 09.40 · Akan datang"] }]);
    expect(screen.getByText("Konfirmasi terkirim 10.12 · Rina")).toBeInTheDocument();
    expect(screen.getByText("Diingatkan 09.40 · Akan datang")).toBeInTheDocument();
  });

  it("menampilkan batas kedaluwarsa bila ada", () => {
    renderTable([{ ...base, deadlineLabel: "Kedaluwarsa Sen, 5 Okt 15.00" }]);
    expect(screen.getByText("Kedaluwarsa Sen, 5 Okt 15.00")).toHaveClass("text-amber-700");
  });

  it("batas transfer yang sudah lewat ditulis merah", () => {
    renderTable([{ ...waRow, deadlineLabel: "Lewat batas transfer", deadlineOverdue: true }]);
    expect(screen.getByText("Lewat batas transfer")).toHaveClass("text-destructive");
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
    renderTable([base, waRow], { highlightId: "a2" });
    const highlighted = document.querySelectorAll('[data-highlighted="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent("SDY-WA01");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("id yang tidak ada di daftar: tidak ada sorotan dan tidak ada galat", () => {
    renderTable([base, waRow], { highlightId: "tidak-ada" });
    expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("AppointmentTable status isian dan tautan pasien", () => {
  it("menampilkan status isian di bawah status booking", () => {
    renderTable([base]);
    expect(screen.getByText("Isian: belum diperiksa")).toBeInTheDocument();
  });

  it("nama pasien menaut ke halaman pasien, kecuali booking yang belum dicocokkan", () => {
    const { unmount } = renderTable([base]);
    expect(screen.getByRole("link", { name: "Siti Rahayu" })).toHaveAttribute("href", "/admin/pasien/p1");
    unmount();
    renderTable([{ ...base, patientId: null, needsMatch: true }]);
    expect(screen.queryByRole("link", { name: "Siti Rahayu" })).not.toBeInTheDocument();
  });
});
```

Tambahkan mock berikut di bawah mock yang sudah ada di **`tests/unit/components/booking-created-panel.test.tsx`** dan **`tests/unit/components/appointment-form.test.tsx`**. Panel "Booking dibuat" kini mencatat pengiriman:

```tsx
vi.mock("@/server/appointment-message", () => ({
  recordAppointmentMessage: vi.fn().mockResolvedValue({ ok: true, data: { id: "m1" } }),
}));
```

Di **`tests/unit/whatsapp.test.ts`**, hapus blok `describe("patientBookingConfirmationMessage", …)` seluruhnya, dan hapus `patientBookingConfirmationMessage` dari daftar impornya. Teks konfirmasi yang baru sudah diuji di `tests/unit/booking-messages.test.ts` (Task 1).

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/appointment-table.test.tsx`
Expected: FAIL. Penyebabnya:
- dialog setelah Verifikasi belum ada;
- tautan kirim belum mencatat;
- menu belum membuka Pindah jadwal;
- `messageNotes` belum tampil.

- [ ] **Step 3: Tulis ulang `src/components/admin/appointment-table.tsx`**

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
import {
  BOOKING_ACTION_LABEL,
  bookingRowActions,
  type BookingAction,
  type RescheduleTarget,
} from "@/lib/booking-actions";
import type { BookingMessage, MessageKind } from "@/lib/booking-messages";
import type { BookingSourceValue } from "@/lib/payment";
import { cn } from "@/lib/utils";
import {
  cancelAppointment,
  markAttended,
  markNoShow,
  verifyAppointment,
} from "@/server/appointment";
import { getBookingMessage } from "@/server/appointment-message";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { MatchPatientDialog } from "./match-patient-dialog";
import { RescheduleDialog } from "./reschedule-dialog";
import { SendMessageDialog } from "./send-message-dialog";
import { recordSentMessage, WhatsAppSendButton } from "./whatsapp-send-button";

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
  /** Hanya untuk booking terkonfirmasi (PRD F9, spec C2 3.2). */
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
  /** "Konfirmasi terkirim 10.12 · Rina" dan sejenisnya (spec C2 4.5). */
  messageNotes: string[];
  /** Data dialog Pindah jadwal; tombolnya diatur bookingRowActions. */
  reschedule: RescheduleTarget;
};

const INTAKE_STATUS_LABEL: Record<NonNullable<BookingRow["intakeStatus"]>, string> = {
  MENUNGGU_DIISI: "belum diisi",
  TERISI: "belum diperiksa",
  DIPERIKSA: "diperiksa",
};

/** Aksi membuka tautan biasa, mengirim WA (dan mencatatnya), atau dijalankan di halaman ini. */
type ActionTarget =
  | { href: string; external: boolean }
  | { send: string; kind: MessageKind }
  | { onSelect: () => void };

export function AppointmentTable({
  rows,
  canReadRecords,
  today,
  highlightId = null,
}: {
  rows: BookingRow[];
  canReadRecords: boolean;
  /** Hari ini dalam WITA, dari server; dipakai strip tanggal Pindah jadwal. */
  today: string;
  /** Baris yang disorot dan digulir ke tengah, dari "Lihat di daftar" (spec C1 5.4). */
  highlightId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [matchTarget, setMatchTarget] = useState<BookingRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ row: BookingRow; message: BookingMessage | null } | null>(
    null,
  );
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  // Sekali per sorotan. Dipanggil bersyarat karena jsdom tidak punya scrollIntoView.
  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: "center" });
  }, [highlightId]);

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        onSuccess?.();
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  /** Setelah Verifikasi: tombol kirim konfirmasi langsung tersedia (spec C2 3.1). */
  async function openConfirmation(row: BookingRow) {
    try {
      const result = await getBookingMessage(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirmTarget({ row, message: result.data });
    } catch {
      toast.error("Konfirmasi gagal dimuat. Kirim dari halaman Pengingat.");
    }
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
        return {
          onSelect: () =>
            run(() => verifyAppointment(row.id), `Booking ${row.code} terkonfirmasi.`, () => void openConfirmation(row)),
        };
      case "ATTEND":
        return { onSelect: () => run(() => markAttended(row.id), `${row.patientName} hadir.`) };
      case "NO_SHOW":
        return { onSelect: () => run(() => markNoShow(row.id), `${row.patientName} ditandai tidak hadir.`) };
      case "RESCHEDULE":
        return { onSelect: () => setRescheduleTarget(row.reschedule) };
      case "CANCEL":
        return { onSelect: () => setCancelTarget(row) };
      case "MATCH":
      case "CHANGE_PATIENT":
        return { onSelect: () => setMatchTarget(row) };
      case "SEND_TRANSFER":
        return { send: row.transferInstruction?.link ?? "", kind: "INSTRUKSI_TRANSFER" };
      case "COPY_TRANSFER":
        return { onSelect: () => copy(row.transferInstruction?.text ?? "", "Instruksi transfer disalin.") };
      case "SEND_CONFIRMATION":
        return { send: row.confirmation?.link ?? "", kind: "KONFIRMASI" };
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
    if ("send" in target) {
      return (
        <WhatsAppSendButton key={action} href={target.send} appointmentId={row.id} kind={target.kind} size="sm" variant={variant}>
          {label}
        </WhatsAppSendButton>
      );
    }
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
    if ("send" in target) {
      return (
        <DropdownMenuItem key={action} asChild>
          <a
            href={target.send}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void recordSentMessage(row.id, target.kind)}
          >
            {label}
          </a>
        </DropdownMenuItem>
      );
    }
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
                  {row.messageNotes.map((note) => (
                    <div key={note} className="mt-1 text-xs text-muted-foreground">
                      {note}
                    </div>
                  ))}
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

      {confirmTarget && (
        <SendMessageDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmTarget(null);
          }}
          title={`✓ Booking ${confirmTarget.row.code} terkonfirmasi`}
          description={`${confirmTarget.row.patientName} · ${confirmTarget.row.timeLabel} · ${confirmTarget.row.staffName}`}
          appointmentId={confirmTarget.row.id}
          message={confirmTarget.message}
          sendLabel="Kirim konfirmasi via WA"
          laterNote="Booking ini tetap tercatat di Pengingat → Konfirmasi belum dikirim."
        />
      )}

      {rescheduleTarget && (
        <RescheduleDialog
          key={rescheduleTarget.appointmentId}
          target={rescheduleTarget}
          today={today}
          open
          onOpenChange={(open) => {
            if (!open) setRescheduleTarget(null);
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

- [ ] **Step 4: Tulis ulang `src/app/(admin)/admin/booking/page.tsx`**

```tsx
import Form from "next/form";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { BookingFilters } from "@/components/admin/booking-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAppointmentStatus } from "@/lib/appointment-status";
import { confirmationMessageFor } from "@/lib/booking-messages";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import type { BankAccount } from "@/lib/payment";
import { can } from "@/lib/permissions";
import { messageStatusLabels } from "@/lib/reminder-work";
import {
  addDaysToDateString,
  combineWitaDateAndMinutes,
  minutesToTimeLabel,
  witaDateString,
  witaMinutesOfDay,
} from "@/lib/time";
import { bookingServiceName, pendingDeadlineLabel, transferInstructionFor } from "@/lib/transfer-instruction";
import { listAppointments, listPendingBookings, searchBookings } from "@/server/appointment";
import { getBranches } from "@/server/catalog";
import { getClinicSetting } from "@/server/clinic-setting";
import { listSchedulableStaff } from "@/server/schedule";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

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
type RowContext = { bank: BankAccount; siteUrl: string; now: Date };

function toRow(a: ListedAppointment, context: RowContext): BookingRow {
  // Booking situs boleh belum punya pasien sampai admin mencocokkannya;
  // CHECK di basis data menjamin booking terkonfirmasi selalu punya pasien.
  const patient = a.patient;
  const confirmation = a.status === "TERKONFIRMASI" ? confirmationMessageFor(a, context.siteUrl) : null;
  const transfer = transferInstructionFor(a, context.bank);

  return {
    id: a.id,
    code: a.code,
    status: a.status,
    timeLabel: `${timeLabel(a.startAt)}–${timeLabel(a.endAt)}`,
    patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
    patientRecordNumber: patient?.medicalRecordNumber ?? "—",
    needsMatch: patient === null,
    isSiteBooking: a.source === "SITUS" && a.intake !== null,
    intakeId: a.intake?.id ?? null,
    intakeStatus: a.intake?.status ?? null,
    patientId: patient?.id ?? null,
    serviceName: bookingServiceName(a),
    staffName: a.staff.name,
    branchName: a.branch.name,
    source: a.source,
    sourceLabel: SOURCE_LABEL[a.source] ?? a.source,
    notes: a.notes,
    confirmation,
    transferInstruction: transfer ? { text: transfer.text, link: transfer.link } : null,
    messageNotes: messageStatusLabels(a.messages, a.startAt, context.now),
    reschedule: {
      appointmentId: a.id,
      code: a.code,
      patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
      startAt: a.startAt,
      durationMinutes: Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60_000),
      staffId: a.staffId,
      staffName: a.staff.name,
      branchId: a.branchId,
      branchName: a.branch.name,
    },
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

  const now = new Date();
  const today = witaDateString(now);
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
  const context: RowContext = { bank: setting, siteUrl: publicSiteUrl(), now };

  // Label tanggal dari tengah hari WITA, agar tidak bergeser ke hari lain.
  const dateLabel = formatIndonesianDate(combineWitaDateAndMinutes(date, 12 * 60));

  const rows = appointments.map((a) => (unreviewedOnly ? withDate(toRow(a, context), a.startAt) : toRow(a, context)));
  const pendingRows: BookingRow[] = pending.map((a) => ({
    ...withDate(toRow(a, context), a.startAt),
    deadlineLabel: pendingDeadlineLabel({ kind: a.deadlineKind, deadline: a.deadline, overdue: a.overdue }),
    deadlineOverdue: a.overdue,
  }));
  const foundRows = found.map((a) => withDate(toRow(a, context), a.startAt));

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
            <AppointmentTable rows={pendingRows} canReadRecords={canReadRecords} today={today} />
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
              <AppointmentTable rows={foundRows} canReadRecords={canReadRecords} today={today} />
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
              <AppointmentTable
                rows={rows}
                canReadRecords={canReadRecords}
                today={today}
                highlightId={params.sorot ?? null}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Catat pengiriman instruksi transfer di panel "Booking dibuat"**

`src/components/admin/booking-created-panel.tsx`: tambahkan impor

```ts
import { WhatsAppSendButton } from "./whatsapp-send-button";
```

Ganti tombol tautan WA:

```tsx
            <Button asChild className="w-full bg-emerald-700 text-white hover:bg-emerald-800">
              <a href={instruction.link} target="_blank" rel="noopener noreferrer">
                Kirim instruksi transfer via WA
              </a>
            </Button>
```

dengan:

```tsx
            <WhatsAppSendButton
              href={instruction.link}
              appointmentId={booking.id}
              kind="INSTRUKSI_TRANSFER"
              className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
            >
              Kirim instruksi transfer via WA
            </WhatsAppSendButton>
```

- [ ] **Step 6: Hapus teks konfirmasi lama dari `src/lib/whatsapp.ts`**

Hapus fungsi `patientBookingConfirmationMessage` beserta komentar dokumentasinya. Teks konfirmasi kini berasal dari `confirmationText` (`src/lib/booking-messages.ts`).

Run: `grep -rn "patientBookingConfirmationMessage" src tests`
Expected: tidak ada hasil.

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/appointment-table.test.tsx tests/unit/components/booking-created-panel.test.tsx tests/unit/components/appointment-form.test.tsx tests/unit/whatsapp.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: bersih, dan seluruh uji unit lulus. Cabang sementara `RESCHEDULE` dari Task 1 kini sudah diganti.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/appointment-table.tsx "src/app/(admin)/admin/booking/page.tsx" src/components/admin/booking-created-panel.tsx src/lib/whatsapp.ts tests/unit/components/appointment-table.test.tsx tests/unit/components/booking-created-panel.test.tsx tests/unit/components/appointment-form.test.tsx tests/unit/whatsapp.test.ts
git commit -m "feat: confirm right after verifying, record sent WhatsApp messages, and reschedule from the booking list"
```

---

### Task 8: Halaman Pengingat, menu samping, dan cek booking dengan kode terisi

**Files:**
- Create: `src/components/admin/reminder-worklist.tsx`
- Create: `src/app/(admin)/admin/pengingat/page.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`, `src/app/(admin)/admin/layout.tsx`
- Modify: `src/lib/booking-code.ts`, `src/app/(public)/cek-booking/page.tsx`, `src/components/pendaftaran/booking-status-lookup.tsx`
- Test: `tests/unit/components/reminder-worklist.test.tsx` (baru), `tests/unit/booking-code.test.ts` (tambah), `tests/unit/components/booking-status-lookup.test.tsx` (tambah)

**Interfaces:**
- Consumes: `getReminderWorklist`, `countReminderWork`, `ReminderWorklist`, `ReminderRow` (Task 4); `recordReminderReply`, `revokeAppointmentMessage` (Task 3); `MessageActions`, `RescheduleDialog` (Task 6); `REMINDER_REPLIES`, `REMINDER_REPLY_LABEL` (Task 1).
- Produces:
  - halaman `/admin/pengingat` dengan region:
    - "1 · Konfirmasi belum dikirim (n)";
    - "2 · Ingatkan sekarang (n)";
    - "3 · Sudah diingatkan — catat balasannya (n)";
  - setiap baris berupa `listitem`; badge menu `"{n} pesan WhatsApp belum dikirim"`
  - `bookingCodeFromParam(value: string | string[] | undefined): string`
  - `BookingStatusLookup({ initialCode?: string })`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/reminder-worklist.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReminderWorklistView } from "@/components/admin/reminder-worklist";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { recordAppointmentMessage, recordReminderReply, revokeAppointmentMessage } from "@/server/appointment-message";
import type { ReminderRow, ReminderWorklist } from "@/server/reminder";
import { getStaffAvailabilityRange } from "@/server/schedule";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({ rescheduleAppointment: vi.fn() }));
vi.mock("@/server/appointment-message", () => ({
  getBookingMessage: vi.fn(),
  recordAppointmentMessage: vi.fn(),
  recordReminderReply: vi.fn(),
  revokeAppointmentMessage: vi.fn(),
}));
vi.mock("@/server/schedule", () => ({
  getStaffAvailabilityRange: vi.fn(),
  getStaffAvailabilityForAdmin: vi.fn(),
}));

const TODAY = "2026-10-03"; // Sabtu
const monday = (hour: number) => combineWitaDateAndMinutes("2026-10-05", hour * 60);

function row(id: string, name: string, startAt: Date, patch: Partial<ReminderRow> = {}): ReminderRow {
  return {
    appointmentId: id,
    code: `SDY-${id.toUpperCase()}`,
    patientName: name,
    startAt,
    staffName: "dr. Diane",
    branchName: "SunDY Mahakeret",
    confirmation: { text: `Konfirmasi ${name}`, link: `https://wa.me/6281234567${id}?text=k` },
    reminder: { text: `Pengingat ${name}`, link: `https://wa.me/6281234567${id}?text=p` },
    overdue: false,
    shifted: false,
    reminderSent: null,
    reschedule: {
      appointmentId: id,
      code: `SDY-${id.toUpperCase()}`,
      patientName: name,
      startAt,
      durationMinutes: 30,
      staffId: "d1",
      staffName: "dr. Diane",
      branchId: "b1",
      branchName: "SunDY Mahakeret",
    },
    ...patch,
  };
}

const sentAt = combineWitaDateAndMinutes(TODAY, 9 * 60 + 40);

const WORKLIST: ReminderWorklist = {
  today: TODAY,
  confirm: [row("001", "Grace Lumi", monday(11))],
  remind: [
    row("002", "Yohana Sari", combineWitaDateAndMinutes(TODAY, 15 * 60), { overdue: true }),
    row("003", "Stevanie Rondo", monday(11.5), { shifted: true }),
  ],
  reminded: [
    row("004", "Anita Kaunang", monday(14), {
      reminderSent: { messageId: "m4", sentAt, sentByName: "Rina", reply: null },
    }),
    row("005", "Budi Pangemanan", monday(15.5), {
      reminderSent: { messageId: "m5", sentAt, sentByName: "Rina", reply: "AKAN_DATANG" },
    }),
    row("006", "Citra Mamahit", monday(16), {
      reminderSent: { messageId: "m6", sentAt, sentByName: "Rina", reply: "MINTA_PINDAH" },
    }),
  ],
};

const region = (name: RegExp) => screen.getByRole("region", { name });
const item = (regionName: RegExp, text: string) =>
  within(region(regionName)).getAllByRole("listitem").find((li) => li.textContent?.includes(text))!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m9" } });
  vi.mocked(recordReminderReply).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(revokeAppointmentMessage).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(getStaffAvailabilityRange).mockResolvedValue([]);
});

describe("ReminderWorklistView", () => {
  it("tiga kotak dengan jumlahnya, dan 'Tidak ada' bila kosong", () => {
    const { unmount } = render(<ReminderWorklistView worklist={WORKLIST} />);
    expect(screen.getByRole("heading", { name: "Pengingat · Sabtu, 3 Oktober 2026" })).toBeInTheDocument();
    expect(region(/Konfirmasi belum dikirim \(1\)/)).toBeInTheDocument();
    expect(region(/Ingatkan sekarang \(2\)/)).toBeInTheDocument();
    expect(region(/Sudah diingatkan — catat balasannya \(3\)/)).toBeInTheDocument();
    unmount();

    render(<ReminderWorklistView worklist={{ today: TODAY, confirm: [], remind: [], reminded: [] }} />);
    expect(screen.getAllByText("Tidak ada.")).toHaveLength(3);
  });

  it("kotak 1: kirim konfirmasi mencatat jenis KONFIRMASI", async () => {
    render(<ReminderWorklistView worklist={WORKLIST} />);
    const link = within(item(/Konfirmasi belum dikirim/, "Grace Lumi")).getByRole("link", { name: "Kirim konfirmasi" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "001", kind: "KONFIRMASI" }),
    );
  });

  it("kotak 2: yang terlambat ditandai merah, yang dimajukan diberi keterangan, tombol WA mencatat PENGINGAT", async () => {
    render(<ReminderWorklistView worklist={WORKLIST} />);
    const items = within(region(/Ingatkan sekarang/)).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Yohana Sari");
    expect(within(items[0]).getByText("terlambat")).toHaveClass("text-destructive");
    expect(items[1]).toHaveTextContent("Hari sebelumnya tutup — diingatkan hari ini");

    const link = within(items[1]).getByRole("link", { name: "Ingatkan via WA" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "003", kind: "PENGINGAT" }),
    );
  });

  it("kotak 3: mencatat balasan, mengubahnya, dan membatalkan tanda", async () => {
    const user = userEvent.setup();
    render(<ReminderWorklistView worklist={WORKLIST} />);

    const anita = item(/Sudah diingatkan/, "Anita Kaunang");
    expect(anita).toHaveTextContent("diingatkan 09.40 oleh Rina");
    await user.click(within(anita).getByRole("button", { name: "Akan datang" }));
    expect(recordReminderReply).toHaveBeenCalledWith({ messageId: "m4", reply: "AKAN_DATANG" });

    const budi = item(/Sudah diingatkan/, "Budi Pangemanan");
    expect(budi).toHaveTextContent("✓ Akan datang");
    expect(within(budi).queryByRole("button", { name: "Tidak membalas" })).not.toBeInTheDocument();
    await user.click(within(budi).getByRole("button", { name: "ubah" }));
    await user.click(within(budi).getByRole("button", { name: "Tidak membalas" }));
    expect(recordReminderReply).toHaveBeenCalledWith({ messageId: "m5", reply: "TIDAK_MEMBALAS" });

    await user.click(within(anita).getByRole("button", { name: "Batalkan tanda" }));
    expect(revokeAppointmentMessage).toHaveBeenCalledWith("m4");
  });

  it("balasan Minta pindah menawarkan Pindah jadwal", async () => {
    const user = userEvent.setup();
    render(<ReminderWorklistView worklist={WORKLIST} />);
    const citra = item(/Sudah diingatkan/, "Citra Mamahit");
    expect(within(item(/Sudah diingatkan/, "Anita Kaunang")).queryByRole("button", { name: "Pindah jadwal" })).toBeNull();

    await user.click(within(citra).getByRole("button", { name: "Pindah jadwal" }));

    expect(await screen.findByRole("dialog", { name: "Pindah jadwal — SDY-006" })).toBeInTheDocument();
  });
});
```

Tambahkan ke `tests/unit/booking-code.test.ts`. Gabungkan `bookingCodeFromParam` ke baris impor `@/lib/booking-code`, lalu tambahkan di akhir berkas:

```ts
describe("bookingCodeFromParam", () => {
  it("membersihkan kode dari URL: spasi dibuang, huruf dibesarkan", () => {
    expect(bookingCodeFromParam(" sdy-7kq2 ")).toBe("SDY-7KQ2");
  });

  it("kosong untuk nilai yang tidak mirip kode, terlalu panjang, ganda, atau tidak ada", () => {
    expect(bookingCodeFromParam("<script>")).toBe("");
    expect(bookingCodeFromParam("A".repeat(21))).toBe("");
    expect(bookingCodeFromParam(["SDY-7KQ2", "SDY-AAAA"])).toBe("");
    expect(bookingCodeFromParam(undefined)).toBe("");
  });
});
```

Tambahkan ke `tests/unit/components/booking-status-lookup.test.tsx`, di dalam `describe("BookingStatusLookup", …)`:

```tsx
  it("kode dari tautan konfirmasi sudah terisi; customer cukup mengetik 4 digit", () => {
    render(<BookingStatusLookup initialCode="SDY-8F3K" />);
    expect(screen.getByLabelText("Kode booking")).toHaveValue("SDY-8F3K");
    expect(screen.getByLabelText("4 digit terakhir nomor WhatsApp")).toHaveValue("");
  });
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/reminder-worklist.test.tsx tests/unit/booking-code.test.ts tests/unit/components/booking-status-lookup.test.tsx`
Expected: FAIL.
- `ReminderWorklistView` dan `bookingCodeFromParam` belum ada.
- `BookingStatusLookup` belum menerima `initialCode`.

- [ ] **Step 3: Tulis `src/components/admin/reminder-worklist.tsx`**

```tsx
"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import type { RescheduleTarget } from "@/lib/booking-actions";
import { REMINDER_REPLIES, REMINDER_REPLY_LABEL } from "@/lib/booking-messages";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import { combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { recordReminderReply, revokeAppointmentMessage } from "@/server/appointment-message";
import type { ReminderRow, ReminderWorklist } from "@/server/reminder";
import { MessageActions } from "./message-actions";
import { RescheduleDialog } from "./reschedule-dialog";

function time(date: Date): string {
  return minutesToTimeLabel(witaMinutesOfDay(date));
}

function schedule(date: Date): string {
  return `${formatShortIndonesianDate(date)} ${time(date)}`;
}

function Box({
  id,
  title,
  count,
  tone = "plain",
  children,
}: {
  id: string;
  title: string;
  count: number;
  tone?: "warn" | "plain";
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("space-y-2 rounded-lg border p-4", tone === "warn" ? "border-amber-300 bg-amber-50/60" : "bg-card")}
    >
      <h3 id={id} className="font-medium">
        {title} ({count})
      </h3>
      {count === 0 ? <p className="text-sm text-muted-foreground">Tidak ada.</p> : <ul className="divide-y">{children}</ul>}
    </section>
  );
}

function Who({ row, children }: { row: ReminderRow; children?: ReactNode }) {
  return (
    <div className="text-sm">
      <span className="font-medium">{row.patientName}</span>{" "}
      <span className="text-muted-foreground">
        · {row.code} · {schedule(row.startAt)} · {row.staffName}
      </span>
      {children}
    </div>
  );
}

/** Daftar kerja halaman Pengingat (spec C2 bagian 4, tata letak A). */
export function ReminderWorklistView({ worklist }: { worklist: ReminderWorklist }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<RescheduleTarget | null>(null);

  const sentWhen = (date: Date) => (witaDateString(date) === worklist.today ? time(date) : schedule(date));

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        setEditing(null);
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">
        Pengingat · {formatIndonesianDate(combineWitaDateAndMinutes(worklist.today, 12 * 60))}
      </h2>

      <Box id="pengingat-konfirmasi" title="1 · Konfirmasi belum dikirim" count={worklist.confirm.length} tone="warn">
        {worklist.confirm.map((row) => (
          <li key={row.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Who row={row} />
            {row.confirmation && (
              <MessageActions
                appointmentId={row.appointmentId}
                kind="KONFIRMASI"
                message={row.confirmation}
                sendLabel="Kirim konfirmasi"
                layout="inline"
              />
            )}
          </li>
        ))}
      </Box>

      <Box id="pengingat-ingatkan" title="2 · Ingatkan sekarang" count={worklist.remind.length}>
        {worklist.remind.map((row) => (
          <li key={row.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Who row={row}>
              {row.overdue && <span className="ml-1 text-xs font-semibold text-destructive">terlambat</span>}
              {!row.overdue && row.shifted && (
                <span className="ml-1 text-xs text-muted-foreground">Hari sebelumnya tutup — diingatkan hari ini</span>
              )}
            </Who>
            {row.reminder && (
              <MessageActions
                appointmentId={row.appointmentId}
                kind="PENGINGAT"
                message={row.reminder}
                sendLabel="Ingatkan via WA"
                layout="inline"
              />
            )}
          </li>
        ))}
      </Box>

      <Box id="pengingat-balasan" title="3 · Sudah diingatkan — catat balasannya" count={worklist.reminded.length}>
        {worklist.reminded.map((row) => {
          const sent = row.reminderSent!;
          const showButtons = sent.reply === null || editing === sent.messageId;
          return (
            <li key={row.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Who row={row}>
                <span className="ml-1 text-xs text-muted-foreground">
                  · diingatkan {sentWhen(sent.sentAt)} oleh {sent.sentByName}
                </span>
              </Who>
              <div className="flex flex-wrap items-center gap-1">
                {showButtons ? (
                  REMINDER_REPLIES.map((reply) => (
                    <Button
                      key={reply}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => recordReminderReply({ messageId: sent.messageId, reply }),
                          `${row.patientName}: ${REMINDER_REPLY_LABEL[reply]}.`,
                        )
                      }
                    >
                      {REMINDER_REPLY_LABEL[reply]}
                    </Button>
                  ))
                ) : (
                  <>
                    <span className="text-sm font-medium text-emerald-700">
                      ✓ {REMINDER_REPLY_LABEL[sent.reply!]}
                    </span>
                    <Button type="button" size="sm" variant="link" onClick={() => setEditing(sent.messageId)}>
                      ubah
                    </Button>
                  </>
                )}
                {sent.reply === "MINTA_PINDAH" && (
                  <Button type="button" size="sm" onClick={() => setReschedule(row.reschedule)}>
                    Pindah jadwal
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(() => revokeAppointmentMessage(sent.messageId), `Tanda pengingat ${row.patientName} dibatalkan.`)
                  }
                >
                  Batalkan tanda
                </Button>
              </div>
            </li>
          );
        })}
      </Box>

      {reschedule && (
        <RescheduleDialog
          key={reschedule.appointmentId}
          target={reschedule}
          today={worklist.today}
          open
          onOpenChange={(open) => {
            if (!open) setReschedule(null);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Tulis `src/app/(admin)/admin/pengingat/page.tsx`**

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { ReminderWorklistView } from "@/components/admin/reminder-worklist";
import { getReminderWorklist } from "@/server/reminder";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Pengingat" };

export default async function ReminderPage() {
  await requireCapability("booking:manage");
  const worklist = await getReminderWorklist();

  return (
    <>
      <AdminHeader title="Pengingat" />
      <div className="p-6">
        <ReminderWorklistView worklist={worklist} />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Menu samping dan angkanya**

`src/components/admin/app-sidebar.tsx`:
- tambahkan `BellRing,` ke impor `lucide-react` (urut abjad, sebelum `CalendarClock`);
- tambahkan item menu tepat setelah baris Booking di `NAV_GROUPS`:

```ts
      { title: "Pengingat", url: "/admin/pengingat", icon: BellRing, needs: "booking:manage" },
```

Ganti parameter komponen dan pemetaan item menu:

```tsx
export function AppSidebar({
  staff,
  pendingBookings = 0,
  reminderWork = 0,
}: {
  staff: CurrentStaff;
  /** Booking yang menunggu konfirmasi (situs dan WA/telepon), angka di menu Booking. */
  pendingBookings?: number;
  /** Pesan WA yang masih harus dikirim (kotak 1 + 2 halaman Pengingat). */
  reminderWork?: number;
}) {
  const badges: Record<string, { count: number; label: string }> = {
    "/admin/booking": { count: pendingBookings, label: `${pendingBookings} booking menunggu konfirmasi` },
    "/admin/pengingat": { count: reminderWork, label: `${reminderWork} pesan WhatsApp belum dikirim` },
  };

  return (
```

lalu di dalam `<SidebarMenu>`:

```tsx
                  {visible.map((item) => {
                    const badge = badges[item.url];
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild tooltip={item.title}>
                          <Link href={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                        {badge && badge.count > 0 && (
                          <SidebarMenuBadge
                            aria-label={badge.label}
                            className="bg-amber-500 text-white peer-hover/menu-button:text-white"
                          >
                            {badge.count}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
```

`src/app/(admin)/admin/layout.tsx`: ganti impor dan penghitungan:

```ts
import { countPendingBookings } from "@/server/appointment";
import { countReminderWork } from "@/server/reminder";
```

```ts
  const [pendingBookings, reminderWork] = can(staff.role, "booking:manage")
    ? await Promise.all([countPendingBookings(), countReminderWork()])
    : [0, 0];
```

```tsx
        <AppSidebar staff={staff} pendingBookings={pendingBookings} reminderWork={reminderWork} />
```

- [ ] **Step 6: `/cek-booking?kode=` mengisi kolom kode**

Tambahkan ke `src/lib/booking-code.ts`:

```ts
/**
 * Kode booking dari `?kode=` di tautan konfirmasi (spec C2 3.3). Kode saja tidak
 * membuka status — customer tetap mengetik 4 digit akhir WhatsApp-nya. Nilai yang
 * tidak mirip kode, atau parameter ganda, menghasilkan kolom kosong.
 */
export function bookingCodeFromParam(value: string | string[] | undefined): string {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9-]{1,20}$/.test(code) ? code : "";
}
```

`src/app/(public)/cek-booking/page.tsx` (seluruh berkas):

```tsx
import type { Metadata } from "next";
import { BookingStatusLookup } from "@/components/pendaftaran/booking-status-lookup";
import { bookingCodeFromParam } from "@/lib/booking-code";

export const metadata: Metadata = {
  title: "Cek Status Booking",
  description: "Cek status booking SunDY Clinic dengan kode booking dan 4 digit terakhir nomor WhatsApp.",
};

export default async function BookingStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ kode?: string | string[] }>;
}) {
  const { kode } = await searchParams;
  return <BookingStatusLookup initialCode={bookingCodeFromParam(kode)} />;
}
```

`src/components/pendaftaran/booking-status-lookup.tsx`: ganti dua baris awal komponen

```tsx
export function BookingStatusLookup() {
  const [code, setCode] = useState("");
```

dengan:

```tsx
export function BookingStatusLookup({ initialCode = "" }: { initialCode?: string } = {}) {
  const [code, setCode] = useState(initialCode);
```

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/reminder-worklist.test.tsx tests/unit/booking-code.test.ts tests/unit/components/booking-status-lookup.test.tsx tests/unit/architecture.test.ts`
Expected: PASS. Uji arsitektur memastikan menu Pengingat mengarah ke halaman yang ada.

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: bersih, dan seluruh uji unit lulus.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/reminder-worklist.tsx "src/app/(admin)/admin/pengingat/page.tsx" src/components/admin/app-sidebar.tsx "src/app/(admin)/admin/layout.tsx" src/lib/booking-code.ts "src/app/(public)/cek-booking/page.tsx" src/components/pendaftaran/booking-status-lookup.tsx tests/unit/components/reminder-worklist.test.tsx tests/unit/booking-code.test.ts tests/unit/components/booking-status-lookup.test.tsx
git commit -m "feat: add the reminder page with its sidebar count, and prefill the booking code on the status page"
```

---

### Task 9: Uji ujung-ke-ujung dan status spec

**Files:**
- Modify: `tests/e2e/prepare-db.mts` (fixture pengingat, sebelum `await prisma.$disconnect();`)
- Modify: `tests/e2e/admin-booking.spec.ts` (Verifikasi → dialog → konfirmasi terkirim)
- Create: `tests/e2e/pengingat.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md:5`

**Interfaces:**
- Consumes:
  - region halaman Pengingat dengan judul yang memuat "Konfirmasi belum dikirim", "Ingatkan sekarang", dan "Sudah diingatkan"; baris `listitem`;
  - tautan "Ingatkan via WA";
  - tombol balasan, tombol "ubah", dan tombol "Pindah jadwal";
  - dialog Pindah jadwal: "Pilih tanggal lain", isian "Tanggal lain", grup "Pilih jam", tombol "Simpan jadwal baru", tautan "Kirim konfirmasi jadwal baru via WA", tombol "Tutup";
  - dialog "✓ Booking {kode} terkonfirmasi" dengan tautan "Kirim konfirmasi via WA";
  - keterangan baris "Konfirmasi terkirim";
  - badge `/^\d+ pesan WhatsApp belum dikirim$/`.

- [ ] **Step 1: Tambahkan fixture pengingat ke `tests/e2e/prepare-db.mts`**

Tambahkan `addDaysToDateString` dan `witaWeekday` ke impor `../../src/lib/time`:

```ts
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString, witaWeekday } from "../../src/lib/time";
```

Tambahkan sebelum `await prisma.$disconnect();`:

```ts
// Pengingat H-1 (pengingat.spec.ts): satu booking terkonfirmasi per proyek di hari buka
// berikutnya, pukul 06.00/06.30 (di luar jam buka). Hari pengingatnya hari ini (atau kemarin
// bila uji dijalankan hari Minggu). Konfirmasinya tercatat tiga hari lalu, jadi booking ini
// masuk "Ingatkan sekarang", bukan "Konfirmasi belum dikirim".
const holidayDates = new Set(
  (await prisma.holiday.findMany({ select: { date: true } })).map((h) => h.date.toISOString().slice(0, 10)),
);
let reminderDate = addDaysToDateString(today, 1);
while (witaWeekday(combineWitaDateAndMinutes(reminderDate, 12 * 60)) === 0 || holidayDates.has(reminderDate)) {
  reminderDate = addDaysToDateString(reminderDate, 1);
}
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-INGAT-${index + 1}`,
      name: `Pasien Pengingat ${project}`,
      whatsapp: `6281200079${index}01`,
    },
  });
  const startAt = combineWitaDateAndMinutes(reminderDate, 6 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-INGAT-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "TERKONFIRMASI",
      source: "WHATSAPP",
      bookingFee: 100000,
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: patient.id,
    },
  });
  await prisma.appointmentMessage.create({
    data: {
      appointmentId: appointment.id,
      kind: "KONFIRMASI",
      scheduledFor: startAt,
      sentById: "e2e",
      sentByName: "Admin E2E",
      sentAt: new Date(Date.now() - 3 * 24 * 60 * 60_000),
    },
  });
}
```

Catatan: `prisma.appointment.deleteMany()` di awal berkas ikut menghapus catatan pesan dari putaran sebelumnya (onDelete: Cascade).

- [ ] **Step 2: Tulis uji e2e Pengingat (gagal)**

`tests/e2e/pengingat.spec.ts`:

```ts
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { signIn, upcomingWeekday } from "./helpers/quiz";

// Satu cerita per proyek: pasien fixture (prepare-db.mts) punya booking terkonfirmasi di hari
// buka berikutnya, jadi hari pengingatnya hari ini. Pindah jadwal memakai Senin (desktop) atau
// Selasa (ponsel) sepekan setelah yang dipakai admin-booking.spec — hari yang tidak dipakai uji lain.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

function patientName(testInfo: TestInfo): string {
  return `Pasien Pengingat ${testInfo.project.name}`;
}

function rescheduleDate(testInfo: TestInfo): string {
  const date = new Date(`${upcomingWeekday(testInfo.project.name === "mobile" ? 2 : 1)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

/** wa.me dibalas lokal: uji tidak bergantung pada WhatsApp sungguhan. */
async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}

async function clickAndClosePopup(page: Page, link: Locator) {
  const popup = page.waitForEvent("popup");
  await link.click();
  await (await popup).close();
}

function rowIn(page: Page, box: RegExp, name: string) {
  return page.getByRole("region", { name: box }).getByRole("listitem").filter({ hasText: name });
}

test("admin mengingatkan pasien, mencatat balasan, lalu memindah jadwalnya", async ({ page }, testInfo) => {
  const name = patientName(testInfo);
  await stubWhatsApp(page);
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/pengingat");

  if (testInfo.project.name !== "mobile") {
    // Menu samping tersembunyi di ponsel; di desktop angkanya tampil di menu Pengingat.
    await expect(page.getByLabel(/^\d+ pesan WhatsApp belum dikirim$/)).toBeVisible({ timeout: 30_000 });
  }

  // Kotak 2: ingatkan lewat WA.
  const remindRow = rowIn(page, /Ingatkan sekarang/, name);
  await expect(remindRow).toBeVisible({ timeout: 30_000 });
  const remindLink = remindRow.getByRole("link", { name: "Ingatkan via WA" });
  await expect(remindLink).toHaveAttribute("href", /^https:\/\/wa\.me\/628/);
  await clickAndClosePopup(page, remindLink);

  // Kotak 3: catat balasan, lalu ubah menjadi Minta pindah.
  const remindedRow = rowIn(page, /Sudah diingatkan/, name);
  await expect(remindedRow).toContainText("diingatkan", { timeout: 30_000 });
  await expect(rowIn(page, /Ingatkan sekarang/, name)).toHaveCount(0);
  await remindedRow.getByRole("button", { name: "Akan datang" }).click();
  await expect(remindedRow).toContainText("✓ Akan datang", { timeout: 30_000 });
  await remindedRow.getByRole("button", { name: "ubah" }).click();
  await remindedRow.getByRole("button", { name: "Minta pindah" }).click();
  await expect(remindedRow).toContainText("✓ Minta pindah", { timeout: 30_000 });

  // Pindah jadwal ke tanggal di luar strip memakai "Pilih tanggal lain".
  await remindedRow.getByRole("button", { name: "Pindah jadwal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Pindah jadwal");
  await dialog.getByRole("button", { name: "Pilih tanggal lain" }).click();
  await dialog.getByLabel("Tanggal lain").fill(rescheduleDate(testInfo));
  const slots = dialog.getByRole("group", { name: "Pilih jam" }).getByRole("button");
  await expect(slots.nth(1)).toBeVisible({ timeout: 30_000 });
  const newTime = (await slots.nth(1).textContent())!;
  await slots.nth(1).click();
  await dialog.getByRole("button", { name: "Simpan jadwal baru" }).click();

  await expect(dialog.getByRole("link", { name: "Kirim konfirmasi jadwal baru via WA" })).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Tutup" }).click();

  // Konfirmasi untuk jadwal lama gugur: booking kembali ke kotak 1 dengan jadwal baru.
  const confirmRow = rowIn(page, /Konfirmasi belum dikirim/, name);
  await expect(confirmRow).toContainText(newTime, { timeout: 30_000 });
  await expect(rowIn(page, /Sudah diingatkan/, name)).toHaveCount(0);
});
```

Fiturnya sudah ada sejak Task 8, jadi uji ini diperkirakan langsung lulus. Buktikan dulu bahwa uji ini bisa gagal. Di `src/lib/reminder-work.ts`, hapus sementara syarat `|| message.scheduledFor.getTime() !== startAt.getTime()` dari `latestValidMessage`. Akibatnya catatan untuk jadwal lama tetap berlaku setelah pindah jadwal.

Run: `npx playwright test tests/e2e/pengingat.spec.ts --project=desktop`
Expected: FAIL pada `confirmRow` (booking tetap di kotak 3).

Kembalikan perubahan itu (`git checkout src/lib/reminder-work.ts`).

Run: `npx playwright test tests/e2e/pengingat.spec.ts`
Expected: PASS (1 uji × 2 proyek).

- [ ] **Step 3: Verifikasi di `tests/e2e/admin-booking.spec.ts` kini memunculkan dialog konfirmasi**

Tambahkan fungsi pembantu ini di bawah `uniqueWhatsapp`:

```ts
/** wa.me dibalas lokal: uji tidak bergantung pada WhatsApp sungguhan. */
async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}
```

Di uji "admin mencatat booking WA lewat strip tanggal, …":
- tambahkan `await stubWhatsApp(page);` tepat sebelum `await signIn(page);`;
- ganti bagian Verifikasi berikut:

```ts
  // Verifikasi dari baris tersorot; booking keluar dari daftar menunggu.
  await row.getByRole("button", { name: "Verifikasi" }).click();
  await expect(row).toContainText("Terkonfirmasi", { timeout: 30_000 });
```

dengan:

```ts
  // Verifikasi dari baris tersorot: dialog konfirmasi langsung muncul (spec C2 3.1).
  await row.getByRole("button", { name: "Verifikasi" }).click();
  const confirmDialog = page.getByRole("dialog", { name: `✓ Booking ${code} terkonfirmasi` });
  await expect(confirmDialog).toBeVisible({ timeout: 30_000 });
  const sendConfirmation = confirmDialog.getByRole("link", { name: "Kirim konfirmasi via WA" });
  await expect(sendConfirmation).toHaveAttribute("href", /^https:\/\/wa\.me\/628/);
  await expect(sendConfirmation).toHaveAttribute("href", /cek-booking%3Fkode%3D/);
  const popup = page.waitForEvent("popup");
  await sendConfirmation.click();
  await (await popup).close();
  await expect(confirmDialog).toBeHidden({ timeout: 30_000 });
  await expect(row).toContainText("Terkonfirmasi", { timeout: 30_000 });
  await expect(row).toContainText("Konfirmasi terkirim", { timeout: 30_000 });
```

Sisa uji itu tidak berubah: daftar menunggu kosong, tautan "Kirim konfirmasi" di baris, dan pencarian per kode.

Run: `npx playwright test tests/e2e/admin-booking.spec.ts`
Expected: PASS (2 uji × 2 proyek).

- [ ] **Step 4: Jalankan seluruh e2e**

Run: `caffeinate -i npm run test:e2e`
Expected: PASS.
- `caffeinate` mencegah Mac tidur. `net::ERR_NETWORK_IO_SUSPENDED` berarti jaringan sempat tertunda.
- Uji `public-site.spec.ts` kadang kehabisan waktu karena `next dev` lambat. Jalankan ulang berkas itu sendirian dan catat hasilnya.

- [ ] **Step 5: Status spec dan verifikasi akhir**

Di `docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md`, ganti baris status menjadi:

```markdown
- **Status:** Disetujui pemilik (2 Oktober 2026) · terlaksana (<tanggal hari ini>)
```

Lalu jalankan:

```bash
npx vitest run
npm run test:integration
npx tsc --noEmit
npm run lint
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: semuanya PASS atau bersih. Perintah terakhir keluar dengan kode 0.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/prepare-db.mts tests/e2e/admin-booking.spec.ts tests/e2e/pengingat.spec.ts docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md
git commit -m "test: remind, record a reply, and reschedule end to end; confirm right after verifying; mark the C2 spec done"
```
