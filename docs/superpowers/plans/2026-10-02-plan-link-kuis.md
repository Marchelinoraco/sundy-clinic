# Plan — UI Panel Admin Bagian C3: Link Isi Kuis untuk Booking yang Dicatat Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasien booking WA, telepon, atau walk-in bisa mengisi kuis lewat link pribadi `sundyclinic.com/isi#<kode>`. Link itu otomatis ikut instruksi transfer, konfirmasi, dan pengingat H-1, dan tersedia sebagai QR untuk walk-in. Isiannya tampil untuk dokter seperti isian booking situs.

**Architecture:**
- **Kode link:** dihitung dengan HMAC-SHA256 dari kunci turunan `BETTER_AUTH_SECRET`, ID booking, dan `Intake.linkVersion`. Kode tidak disimpan. "Ganti link" menaikkan versi, sehingga kode lama tidak berlaku.
- **Halaman `/isi` statis:** browser membaca kode dari bagian `#`, sehingga kode tidak pernah sampai ke log nginx atau Cloudflare. Isi halaman dimuat lewat aksi server publik, dan kuis memakai ulang komponen kuis v2 tanpa U1, layanan, dan jadwal.
- **Aturan murni** di `src/lib/quiz-link.ts`: kapan link berlaku, jenis kuis, kolom data diri yang kosong, dan baris kuis di pesan.
- **Pesan C1/C2:** penyusunnya menerima link opsional.
- **Admin:** dialog "Link kuis" (QR, buka, kirim WA, salin, ganti) lewat `BookingDialogsProvider`.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Prisma 7.10 + PostgreSQL · Tailwind v4 · shadcn/ui (Radix) · Vitest 4 + Testing Library + user-event · Playwright · `qrcode` (baru)

**Spec:** `docs/superpowers/specs/2026-10-02-link-kuis-design.md` (Q1–Q5, bagian 3–7; termasuk perubahan 2 Okt 2026: link memakai `#`). Bagian ini menggantikan bagian 4 spec pendaftaran. Aturan kuis v2 ada di `docs/superpowers/specs/2026-09-30-kuis-v2-form-recall-design.md`.

**Base branch:** `desain-link-kuis` (berisi spec dan plan ini). Kerjakan di branch baru `link-kuis` dari branch itu.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar.
- **Kata di halaman customer:** panel admin memakai "pasien". Halaman `/isi` dan pesan WA memakai "Anda" dan "customer", **tanpa kata "pasien" atau "berobat"** (dijaga uji e2e `main` yang tidak memuat /pasien|berobat/i).
- **Zona waktu:** WITA. Tanggal di pesan memakai `formatScheduleForMessage` ("Senin, 5 Oktober 2026 pukul 11.00 WITA").
- **Hak akses:**
  - aksi admin memakai `booking:manage`;
  - aksi publik tanpa login, dengan kode link sebagai satu-satunya bukti, dibatasi `guardRate`, dan memeriksa kodenya ulang di setiap panggilan;
  - halaman link tidak pernah menerima nomor WA, data medis, atau jawaban lama.
- **Isian `TERISI` tidak pernah diubah.** Data diri pasien hanya **melengkapi kolom yang kosong**, dan kolom yang terisi tidak pernah ditimpa.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (ekspor tipe boleh). Pembantu yang tidak boleh dipanggil browser (`quiz-link-code.ts`, `quiz-link-store.ts`) **tidak** memakai `"use server"`.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`, dan komponen tidak mengimpor `@/lib/db`.
- **Migrasi** ditulis tangan, lalu diterapkan berurutan:
  - `npx prisma migrate deploy`;
  - `npm run db:migrate:test`;
  - `npx prisma generate`;
  - `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` harus keluar dengan kode 0.
- **Dependensi baru** hanya `qrcode` (dan `@types/qrcode` untuk dev).
- **Format kode:** repo tidak memakai Prettier. Ikuti format kode di sekitarnya.
- **Uji integrasi** ke `sundy_test` (`npm run test:integration`). Jangan jalankan bersamaan dengan `npm run test:e2e`.
- **Commit** memakai Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu. **Jangan pernah mengubah atau men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Admin menekan "Ganti link" saat customer sedang mengisi kuis dengan link lama.** Kirim ditolak dengan "Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp.", dan tidak ada isian yang tersimpan → uji di Task 3.
2. **Booking dibatalkan atau ditandai tidak hadir saat customer sedang mengisi.** Kirim ditolak dengan pesan yang sama, dan tidak ada isian atau perubahan data pasien → uji di Task 3.
3. **Customer menekan tombol Kembali di browser, menutup tab sebentar, atau halaman dimuat ulang di tengah kuis.** Saat link dibuka lagi di tab yang sama, jawaban dan layar terakhirnya kembali → uji di Task 6.
4. **Data pasien berisi teks kosong ("") untuk pekerjaan atau alamat** (data lama). Kolom itu dianggap kosong, ditanyakan, lalu diisi → uji di Task 1 dan Task 3.
5. **Data diri pasien sudah lengkap.** Langkah terakhir hanya meminta persetujuan, tidak ada kolom data diri yang dikirim, dan data pasien tidak tersentuh → uji di Task 3 dan Task 6.

---

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/quiz-link.ts` (baru) | aturan murni link kuis: status, versi, jenis kuis, kolom kosong, persetujuan biaya, baris pesan, tipe halaman |
| `src/lib/kuis/identity.ts` | + `IdentityField`, `validateLinkIdentity` |
| `src/server/quiz-link-code.ts` (baru) | kunci HMAC, kode, URL `/isi#…`, `quizLinkFor` |
| `prisma/schema.prisma`, `prisma/migrations/20261002150000_link_kuis/` | `Intake.linkVersion`; hapus kolom link lama; `LINK_KUIS` |
| `src/lib/kuis/v2/answers.ts`, `src/server/public-booking.ts` | `answersForStorage` dipakai bersama |
| `src/server/quiz-link-store.ts` (baru) | memuat booking untuk link; cek isian lengkap pasien |
| `src/server/quiz-link-public.ts` (baru) | aksi publik: `getQuizLinkPage`, `submitQuizLink` |
| `src/server/quiz-link-admin.ts` (baru) | aksi admin: `getQuizLink`, `rotateQuizLink` |
| `src/lib/booking-messages.ts`, `src/lib/transfer-instruction.ts`, `src/lib/reminder-work.ts` | baris kuis di pesan; teks "Kirim link via WA"; label "Link kuis terkirim" |
| `src/server/appointment-message.ts` | `LINK_KUIS`; pesan lanjutan membawa link |
| `src/server/appointment.ts`, `src/server/reminder.ts`, `src/app/(admin)/admin/booking/page.tsx` | link ikut pesan dan baris booking |
| `src/components/pendaftaran/link-identity-step.tsx`, `quiz-link-flow.tsx`, `quiz-link-notice.tsx`, `quiz-link-entry.tsx` (baru) | halaman customer |
| `src/app/(public)/isi/page.tsx` (baru), `src/app/robots.ts` | rute `/isi`, `noindex`, `Disallow: /isi` |
| `src/components/admin/quiz-link-dialog.tsx` (baru), `booking-dialogs.tsx`, `appointment-table.tsx`, `src/lib/booking-actions.ts` | dialog dan menu "Link kuis"; tanda "Belum punya isian lengkap" |
| `src/server/intake.ts`, `src/components/admin/intake-view.tsx` | tanda "Belum punya isian lengkap" di halaman isian |
| `tests/e2e/link-kuis.spec.ts` (baru) | uji ujung ke ujung |

---

### Task 1: Aturan murni link kuis dan validasi data diri

**Files:**
- Create: `src/lib/quiz-link.ts`
- Modify: `src/lib/kuis/identity.ts`
- Test: `tests/unit/quiz-link.test.ts` (baru), `tests/unit/kuis/identity.test.ts` (tambah)

**Interfaces:**
- Produces:
  - `IDENTITY_FIELDS`, `IdentityField = "birthDate" | "gender" | "occupation" | "address"`, `LinkIdentity`, `validateLinkIdentity(raw, missing, now?)`
  - `QUIZ_LINK_SOURCES`
  - `QuizLinkBooking = { source; status; startAt: Date; patientId: string | null; intake: { status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA"; linkVersion: number } | null }`
  - `QuizLinkState = "OPEN" | "SUBMITTED" | "CLOSED"`, `quizLinkState(booking, now)`, `quizLinkVersion(booking)`
  - `needsFeeConsent({ bookingFee, status })`, `firstName(name)`
  - `QuizKind`, `quizKindFor(hasCompletedFullIntake)`, `patientTypeForKind(kind)`
  - `missingIdentityFields(patient)`, `quizLinkLines(link)`
  - `QuizLinkPage` (tiga bentuk: `OPEN` dengan data halaman, `SUBMITTED`, `CLOSED`)

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/quiz-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  firstName,
  missingIdentityFields,
  needsFeeConsent,
  patientTypeForKind,
  quizKindFor,
  quizLinkLines,
  quizLinkState,
  quizLinkVersion,
  type QuizLinkBooking,
} from "@/lib/quiz-link";

const NOW = new Date("2026-10-05T02:00:00Z");
const open: QuizLinkBooking = {
  source: "WHATSAPP",
  status: "MENUNGGU_KONFIRMASI",
  startAt: new Date("2026-10-06T03:00:00Z"),
  patientId: "p1",
  intake: null,
};

describe("quizLinkState (spec C3 3.1)", () => {
  it("berlaku untuk booking WA, telepon, dan walk-in yang aktif dan belum dimulai", () => {
    expect(quizLinkState(open, NOW)).toBe("OPEN");
    expect(quizLinkState({ ...open, source: "TELEPON", status: "TERKONFIRMASI" }, NOW)).toBe("OPEN");
    expect(quizLinkState({ ...open, source: "WALK_IN" }, NOW)).toBe("OPEN");
    expect(quizLinkState({ ...open, intake: { status: "MENUNGGU_DIISI", linkVersion: 2 } }, NOW)).toBe("OPEN");
  });

  it("sudah diisi bila isiannya terkirim, apa pun status bookingnya sekarang", () => {
    expect(quizLinkState({ ...open, intake: { status: "TERISI", linkVersion: 0 } }, NOW)).toBe("SUBMITTED");
    expect(
      quizLinkState({ ...open, status: "DIBATALKAN", intake: { status: "DIPERIKSA", linkVersion: 0 } }, NOW),
    ).toBe("SUBMITTED");
  });

  it("tidak berlaku untuk booking situs, tanpa pasien, tidak aktif, atau yang sudah dimulai", () => {
    expect(quizLinkState({ ...open, source: "SITUS" }, NOW)).toBe("CLOSED");
    expect(quizLinkState({ ...open, patientId: null }, NOW)).toBe("CLOSED");
    for (const status of ["DIBATALKAN", "TIDAK_HADIR", "KEDALUWARSA", "HADIR", "SELESAI"] as const) {
      expect(quizLinkState({ ...open, status }, NOW)).toBe("CLOSED");
    }
    expect(quizLinkState({ ...open, startAt: NOW }, NOW)).toBe("CLOSED");
  });
});

describe("pembantu link kuis", () => {
  it("versi link 0 sampai admin menekan Ganti link", () => {
    expect(quizLinkVersion(open)).toBe(0);
    expect(quizLinkVersion({ intake: { status: "MENUNGGU_DIISI", linkVersion: 3 } })).toBe(3);
  });

  it("persetujuan biaya hanya untuk booking berbiaya yang belum diverifikasi", () => {
    expect(needsFeeConsent({ bookingFee: 100000, status: "MENUNGGU_KONFIRMASI" })).toBe(true);
    expect(needsFeeConsent({ bookingFee: 100000, status: "TERKONFIRMASI" })).toBe(false);
    expect(needsFeeConsent({ bookingFee: null, status: "MENUNGGU_KONFIRMASI" })).toBe(false);
  });

  it("nama depan dari nama lengkap", () => {
    expect(firstName("  Maria   Wenas ")).toBe("Maria");
    expect(firstName("Budi")).toBe("Budi");
  });

  it("kuis lengkap untuk pasien tanpa isian lengkap, pendek untuk yang sudah punya", () => {
    expect(quizKindFor(false)).toBe("LENGKAP");
    expect(quizKindFor(true)).toBe("PENDEK");
    expect(patientTypeForKind("LENGKAP")).toBe("BARU");
    expect(patientTypeForKind("PENDEK")).toBe("LAMA");
  });

  it("kolom data diri yang kosong, termasuk teks kosong dari data lama", () => {
    expect(
      missingIdentityFields({ birthDate: null, gender: null, occupation: null, address: null }),
    ).toEqual(["birthDate", "gender", "occupation", "address"]);
    expect(
      missingIdentityFields({ birthDate: new Date("1990-05-17T00:00:00Z"), gender: "P", occupation: "  ", address: "" }),
    ).toEqual(["occupation", "address"]);
    expect(
      missingIdentityFields({ birthDate: new Date("1990-05-17T00:00:00Z"), gender: "L", occupation: "Guru", address: "Manado" }),
    ).toEqual([]);
  });

  it("baris kuis untuk pesan WA", () => {
    expect(quizLinkLines("https://sundyclinic.com/isi#abc")).toEqual([
      "Sebelum datang, mohon isi form singkat ini (±5 menit): https://sundyclinic.com/isi#abc",
      "Jawaban Anda hanya dibaca dokter kami.",
    ]);
  });
});
```

Tambahkan ke `tests/unit/kuis/identity.test.ts`. Gabungkan `validateLinkIdentity` ke baris impor `@/lib/kuis/identity`, lalu tambahkan di akhir berkas:

```ts
describe("validateLinkIdentity (spec C3 3.2)", () => {
  const ALL = ["birthDate", "gender", "occupation", "address"] as const;

  it("hanya memeriksa dan mengembalikan kolom yang ditanyakan", () => {
    expect(
      validateLinkIdentity(
        { birthDate: "1990-05-17", gender: "P", occupation: " Guru ", address: "Jl. Uji 1", },
        ["birthDate", "occupation"],
        NOW,
      ),
    ).toEqual({ ok: true, identity: { birthDate: "1990-05-17", occupation: "Guru" } });
  });

  it("tanpa kolom yang ditanyakan: selalu sah dan kosong", () => {
    expect(validateLinkIdentity({}, [], NOW)).toEqual({ ok: true, identity: {} });
  });

  it("menolak isian yang salah dengan pesan yang sama seperti /daftar", () => {
    expect(validateLinkIdentity({ birthDate: "2030-01-01" }, ALL, NOW)).toMatchObject({
      ok: false,
      field: "birthDate",
      message: "Isi tanggal lahir yang benar.",
    });
    expect(validateLinkIdentity({ birthDate: "1990-05-17" }, ALL, NOW)).toMatchObject({
      ok: false,
      field: "gender",
      message: "Pilih jenis kelamin.",
    });
    expect(validateLinkIdentity({ birthDate: "1990-05-17", gender: "L", occupation: "" }, ALL, NOW)).toMatchObject({
      ok: false,
      field: "occupation",
    });
    expect(
      validateLinkIdentity({ birthDate: "1990-05-17", gender: "L", occupation: "Guru", address: "x".repeat(201) }, ALL, NOW),
    ).toMatchObject({ ok: false, field: "address", message: "Isi alamat Anda (maksimal 200 karakter)." });
  });

  it("bentuk yang tidak dikenal ditolak", () => {
    expect(validateLinkIdentity({ name: "Bukan kolom link" }, ALL, NOW)).toMatchObject({ ok: false, field: null });
    expect(validateLinkIdentity("bukan objek", ALL, NOW)).toMatchObject({ ok: false, field: null });
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/quiz-link.test.ts tests/unit/kuis/identity.test.ts`
Expected: FAIL. `@/lib/quiz-link` belum ada, dan `validateLinkIdentity` belum diekspor.

- [ ] **Step 3: Tambahkan `validateLinkIdentity` ke `src/lib/kuis/identity.ts`**

Ganti pemeriksaan tanggal lahir di dalam `validateIdentity`:

```ts
  const today = witaDateString(now);
  const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;
  if (!isRealDate(data.birthDate) || data.birthDate >= today || data.birthDate < oldest) {
    return fail("birthDate", "Isi tanggal lahir yang benar.");
  }
```

dengan:

```ts
  if (!isValidBirthDate(data.birthDate, now)) return fail("birthDate", "Isi tanggal lahir yang benar.");
```

Tambahkan setelah fungsi `isRealDate`:

```ts
/** Tanggal lahir nyata, sebelum hari ini (WITA), dan paling lama 120 tahun lalu. */
function isValidBirthDate(value: string, now: Date): boolean {
  const today = witaDateString(now);
  const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;
  return isRealDate(value) && value < today && value >= oldest;
}
```

Tambahkan di akhir berkas:

```ts
/** Kolom data diri yang ditanyakan halaman link kuis bila masih kosong di data pasien (spec C3 3.2). */
export const IDENTITY_FIELDS = ["birthDate", "gender", "occupation", "address"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export type LinkIdentity = { birthDate?: string; gender?: "L" | "P"; occupation?: string; address?: string };

export type LinkIdentityValidation =
  | { ok: true; identity: LinkIdentity }
  | { ok: false; field: IdentityField | null; message: string };

const linkIdentityShape = z.strictObject({
  birthDate: z.string().optional(),
  gender: z.enum(["L", "P"]).optional(),
  occupation: z.string().optional(),
  address: z.string().optional(),
});

function linkFail(field: IdentityField | null, message: string): LinkIdentityValidation {
  return { ok: false, field, message };
}

/**
 * Data diri dari halaman link kuis. Nama dan WA sudah dicatat admin, jadi
 * hanya kolom di `missing` yang diperiksa dan dikembalikan — kolom lain
 * diabaikan walau dikirim, karena data pasien yang terisi tidak boleh ditimpa.
 */
export function validateLinkIdentity(
  raw: unknown,
  missing: readonly IdentityField[],
  now: Date = new Date(),
): LinkIdentityValidation {
  const parsed = linkIdentityShape.safeParse(raw);
  if (!parsed.success) return linkFail(null, "Data diri tidak sah. Muat ulang halaman lalu coba lagi.");
  const data = parsed.data;
  const identity: LinkIdentity = {};

  if (missing.includes("birthDate")) {
    if (!data.birthDate || !isValidBirthDate(data.birthDate, now)) {
      return linkFail("birthDate", "Isi tanggal lahir yang benar.");
    }
    identity.birthDate = data.birthDate;
  }
  if (missing.includes("gender")) {
    if (!data.gender) return linkFail("gender", "Pilih jenis kelamin.");
    identity.gender = data.gender;
  }
  if (missing.includes("occupation")) {
    const occupation = data.occupation?.trim() ?? "";
    if (!occupation || occupation.length > 100) return linkFail("occupation", "Isi pekerjaan Anda.");
    identity.occupation = occupation;
  }
  if (missing.includes("address")) {
    const address = data.address?.trim() ?? "";
    if (!address || address.length > 200) return linkFail("address", "Isi alamat Anda (maksimal 200 karakter).");
    identity.address = address;
  }
  return { ok: true, identity };
}
```

- [ ] **Step 4: Tulis `src/lib/quiz-link.ts`**

```ts
import type { AppointmentStatusValue } from "./appointment-status";
import type { IdentityField } from "./kuis/identity";
import type { BookingSourceValue } from "./payment";

/** Booking yang dicatat admin mendapat link kuis; customer situs sudah mengisi di /daftar (spec C3 3.1). */
export const QUIZ_LINK_SOURCES: readonly BookingSourceValue[] = ["WHATSAPP", "TELEPON", "WALK_IN"];

const LINK_STATUSES: readonly AppointmentStatusValue[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

/** Bagian booking yang menentukan apakah linknya berlaku. */
export type QuizLinkBooking = {
  source: BookingSourceValue;
  status: AppointmentStatusValue;
  startAt: Date;
  patientId: string | null;
  intake: { status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA"; linkVersion: number } | null;
};

export type QuizLinkState = "OPEN" | "SUBMITTED" | "CLOSED";

/**
 * OPEN: kuis boleh diisi. SUBMITTED: sudah dikirim — link menampilkan "Terima
 * kasih". CLOSED: booking situs, tanpa pasien, tidak aktif, atau sudah dimulai.
 */
export function quizLinkState(booking: QuizLinkBooking, now: Date): QuizLinkState {
  if (!QUIZ_LINK_SOURCES.includes(booking.source) || booking.patientId === null) return "CLOSED";
  if (booking.intake && booking.intake.status !== "MENUNGGU_DIISI") return "SUBMITTED";
  if (!LINK_STATUSES.includes(booking.status) || booking.startAt.getTime() <= now.getTime()) return "CLOSED";
  return "OPEN";
}

/** Nomor versi link; 0 sampai admin menekan "Ganti link". */
export function quizLinkVersion(booking: Pick<QuizLinkBooking, "intake">): number {
  return booking.intake?.linkVersion ?? 0;
}

/** Persetujuan biaya booking hanya untuk booking berbiaya yang belum diverifikasi (spec C3 3.2). */
export function needsFeeConsent(booking: { bookingFee: number | null; status: AppointmentStatusValue }): boolean {
  return booking.bookingFee !== null && booking.status === "MENUNGGU_KONFIRMASI";
}

/** Halaman link hanya menyapa dengan nama depan (spec C3 3.2). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export type QuizKind = "LENGKAP" | "PENDEK";

/** Kuis lengkap bila pasien belum punya isian lengkap yang terkirim, termasuk pasien era kertas. */
export function quizKindFor(hasCompletedFullIntake: boolean): QuizKind {
  return hasCompletedFullIntake ? "PENDEK" : "LENGKAP";
}

/** Jalur kuis v2: kuis lengkap = customer baru, kuis pendek = customer lama. */
export function patientTypeForKind(kind: QuizKind): "BARU" | "LAMA" {
  return kind === "LENGKAP" ? "BARU" : "LAMA";
}

/** Kolom data diri pasien yang masih kosong; teks kosong dari data lama juga dihitung kosong. */
export function missingIdentityFields(patient: {
  birthDate: Date | null;
  gender: string | null;
  occupation: string | null;
  address: string | null;
}): IdentityField[] {
  const missing: IdentityField[] = [];
  if (!patient.birthDate) missing.push("birthDate");
  if (!patient.gender) missing.push("gender");
  if (!patient.occupation?.trim()) missing.push("occupation");
  if (!patient.address?.trim()) missing.push("address");
  return missing;
}

/** Baris kuis yang ditambahkan ke instruksi transfer, konfirmasi, dan pengingat (spec C3 4.1). */
export function quizLinkLines(link: string): string[] {
  return [
    `Sebelum datang, mohon isi form singkat ini (±5 menit): ${link}`,
    "Jawaban Anda hanya dibaca dokter kami.",
  ];
}

/** Isi halaman /isi untuk sebuah kode. Hanya nama depan dan jadwal — tanpa nomor WA atau data medis. */
export type QuizLinkPage =
  | {
      state: "OPEN";
      firstName: string;
      serviceName: string;
      startAt: Date;
      staffName: string;
      branchName: string;
      kind: QuizKind;
      missing: IdentityField[];
      feeConsent: { bookingFee: number } | null;
    }
  | { state: "SUBMITTED" }
  | { state: "CLOSED" };
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/quiz-link.test.ts tests/unit/kuis/identity.test.ts`
Expected: PASS. Uji `validateIdentity` yang lama tetap lulus.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quiz-link.ts src/lib/kuis/identity.ts tests/unit/quiz-link.test.ts tests/unit/kuis/identity.test.ts
git commit -m "feat: add quiz link rules and identity validation for the link form"
```

---

### Task 2: Kode link HMAC

**Files:**
- Create: `src/server/quiz-link-code.ts`
- Test: `tests/unit/quiz-link-code.test.ts`

**Interfaces:**
- Consumes: `quizLinkState`, `quizLinkVersion`, `QuizLinkBooking` (Task 1).
- Produces:
  - `quizLinkKey(secret = process.env.BETTER_AUTH_SECRET): Buffer`
  - `quizLinkCode(appointmentId, version, key?): string` → `"{appointmentId}.{22 karakter base64url}"`
  - `parseQuizLinkCode(code: unknown): { appointmentId: string; signature: string } | null`
  - `isValidQuizLinkCode(code: string, version: number, key?): boolean`
  - `quizLinkUrl(siteUrl, appointmentId, version, key?): string` → `"{siteUrl}/isi#{kode}"`
  - `quizLinkFor(booking: QuizLinkBooking & { id: string }, siteUrl, now, key?): string | null`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/quiz-link-code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isValidQuizLinkCode,
  parseQuizLinkCode,
  quizLinkCode,
  quizLinkFor,
  quizLinkKey,
  quizLinkUrl,
} from "@/server/quiz-link-code";

const KEY = quizLinkKey("rahasia-uji-yang-cukup-panjang");
const ID = "cmupobz6200022ovuddaolzdc";

describe("kode link kuis (spec C3 bagian 6)", () => {
  it("memuat ID booking dan tanda tangan 16 byte base64url", () => {
    const code = quizLinkCode(ID, 0, KEY);
    expect(code).toMatch(/^cmupobz6200022ovuddaolzdc\.[A-Za-z0-9_-]{22}$/);
    expect(parseQuizLinkCode(code)).toEqual({ appointmentId: ID, signature: code.split(".")[1] });
  });

  it("sama untuk versi yang sama, berbeda untuk versi berikutnya", () => {
    expect(quizLinkCode(ID, 0, KEY)).toBe(quizLinkCode(ID, 0, KEY));
    expect(quizLinkCode(ID, 1, KEY)).not.toBe(quizLinkCode(ID, 0, KEY));
  });

  it("kode versi lama ditolak setelah Ganti link", () => {
    const old = quizLinkCode(ID, 0, KEY);
    expect(isValidQuizLinkCode(old, 0, KEY)).toBe(true);
    expect(isValidQuizLinkCode(old, 1, KEY)).toBe(false);
  });

  it("tanda tangan atau ID yang diubah ditolak", () => {
    const code = quizLinkCode(ID, 0, KEY);
    const [id, signature] = code.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(isValidQuizLinkCode(`${id}.${flipped}`, 0, KEY)).toBe(false);
    expect(isValidQuizLinkCode(`cmupobz6200022ovuddaolzdd.${signature}`, 0, KEY)).toBe(false);
  });

  it("kunci lain menolak kode", () => {
    expect(isValidQuizLinkCode(quizLinkCode(ID, 0, KEY), 0, quizLinkKey("kunci-lain-yang-panjang"))).toBe(false);
  });

  it("format rusak ditolak tanpa galat", () => {
    for (const bad of ["", "abc", `${ID}.`, `${ID}.pendek`, `${ID.toUpperCase()}.${"A".repeat(22)}`, 42, null]) {
      expect(parseQuizLinkCode(bad)).toBeNull();
    }
    expect(isValidQuizLinkCode("bukan-kode", 0, KEY)).toBe(false);
  });

  it("URL memakai tanda # agar kode tidak pernah terkirim ke server", () => {
    expect(quizLinkUrl("https://sundyclinic.com", ID, 2, KEY)).toBe(
      `https://sundyclinic.com/isi#${quizLinkCode(ID, 2, KEY)}`,
    );
  });

  it("quizLinkFor hanya untuk link yang berlaku, dengan versi isian", () => {
    const now = new Date("2026-10-05T02:00:00Z");
    const booking = {
      id: ID,
      source: "WHATSAPP" as const,
      status: "MENUNGGU_KONFIRMASI" as const,
      startAt: new Date("2026-10-06T03:00:00Z"),
      patientId: "p1",
      intake: { status: "MENUNGGU_DIISI" as const, linkVersion: 3 },
    };
    expect(quizLinkFor(booking, "https://sundyclinic.com", now, KEY)).toBe(
      quizLinkUrl("https://sundyclinic.com", ID, 3, KEY),
    );
    expect(quizLinkFor({ ...booking, intake: { status: "TERISI", linkVersion: 3 } }, "https://x", now, KEY)).toBeNull();
    expect(quizLinkFor({ ...booking, source: "SITUS" }, "https://x", now, KEY)).toBeNull();
  });

  it("tanpa BETTER_AUTH_SECRET: galat yang jelas", () => {
    expect(() => quizLinkKey("")).toThrow("BETTER_AUTH_SECRET");
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/quiz-link-code.test.ts`
Expected: FAIL. `@/server/quiz-link-code` belum ada.

- [ ] **Step 3: Tulis `src/server/quiz-link-code.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { quizLinkState, quizLinkVersion, type QuizLinkBooking } from "@/lib/quiz-link";

/**
 * Kode link kuis (spec C3 bagian 6): "{appointmentId}.{tanda tangan}". Tanda
 * tangan = HMAC-SHA256("{appointmentId}.{versi}") dengan kunci turunan
 * BETTER_AUTH_SECRET, dipotong 16 byte. Kode tidak disimpan di basis data,
 * sehingga backup database saja tidak cukup untuk membuka link pasien.
 * Modul ini hanya untuk server: kuncinya rahasia.
 */
const KEY_LABEL = "sundy:isi-link:v1";
const SIGNATURE_BYTES = 16;
const CODE_PATTERN = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{22})$/;

export function quizLinkKey(secret: string | undefined = process.env.BETTER_AUTH_SECRET): Buffer {
  if (!secret) throw new Error("BETTER_AUTH_SECRET belum diisi; link kuis tidak bisa dibuat.");
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function signature(appointmentId: string, version: number, key: Buffer): Buffer {
  return createHmac("sha256", key).update(`${appointmentId}.${version}`).digest().subarray(0, SIGNATURE_BYTES);
}

export function quizLinkCode(appointmentId: string, version: number, key: Buffer = quizLinkKey()): string {
  return `${appointmentId}.${signature(appointmentId, version, key).toString("base64url")}`;
}

export function parseQuizLinkCode(code: unknown): { appointmentId: string; signature: string } | null {
  if (typeof code !== "string") return null;
  const match = CODE_PATTERN.exec(code);
  return match ? { appointmentId: match[1], signature: match[2] } : null;
}

/** Perbandingan waktu-konstan: lama pemeriksaan tidak membocorkan berapa karakter yang benar. */
export function isValidQuizLinkCode(code: string, version: number, key: Buffer = quizLinkKey()): boolean {
  const parsed = parseQuizLinkCode(code);
  if (!parsed) return false;
  const given = Buffer.from(parsed.signature, "base64url");
  const expected = signature(parsed.appointmentId, version, key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Kode ditaruh setelah "#": browser tidak pernah mengirimnya ke server, jadi
 * tidak tercatat di log nginx maupun Cloudflare (spec C3 3.1).
 */
export function quizLinkUrl(
  siteUrl: string,
  appointmentId: string,
  version: number,
  key: Buffer = quizLinkKey(),
): string {
  return `${siteUrl}/isi#${quizLinkCode(appointmentId, version, key)}`;
}

/** Link untuk pesan dan baris booking, atau null bila link tidak (lagi) berlaku. */
export function quizLinkFor(
  booking: QuizLinkBooking & { id: string },
  siteUrl: string,
  now: Date,
  key?: Buffer,
): string | null {
  if (quizLinkState(booking, now) !== "OPEN") return null;
  return quizLinkUrl(siteUrl, booking.id, quizLinkVersion(booking), key ?? quizLinkKey());
}
```

- [ ] **Step 4: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/quiz-link-code.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/quiz-link-code.ts tests/unit/quiz-link-code.test.ts
git commit -m "feat: sign quiz link codes with a key derived from the auth secret"
```

---

### Task 3: Migrasi dan aksi publik halaman link

**Files:**
- Modify: `prisma/schema.prisma` (enum `AppointmentMessageKind`, kolom link di `Intake`)
- Create: `prisma/migrations/20261002150000_link_kuis/migration.sql`
- Modify: `src/lib/kuis/v2/answers.ts` (+ `answersForStorage`), `src/server/public-booking.ts` (pakai `answersForStorage`)
- Create: `src/server/quiz-link-store.ts`, `src/server/quiz-link-public.ts`
- Test: `tests/integration/quiz-link-public.test.ts`

**Interfaces:**
- Consumes: Task 1 dan Task 2; `validateQuizAnswers`, `QUIZ_VERSION`, `PRIVACY_POLICY_VERSION`, `guardRate`, `createRateLimiter`, `recordAudit`, `SITE_PATIENT_ACTOR`, `isUniqueViolation`, `bookingServiceName`.
- Produces:
  - kolom `Intake.linkVersion` (Prisma: `linkVersion`); enum `LINK_KUIS`
  - `answersForStorage(answers): Omit<QuizAnswers, "body">`
  - `loadLinkBooking(appointmentId)`, `LinkBooking`, `hasCompletedFullIntake(patientId): Promise<boolean>`
  - `getQuizLinkPage(code: string): Promise<ActionResult<QuizLinkPage>>`
  - `QuizLinkSubmission = { code; answers: unknown; identity: unknown; consentData: boolean; consentFee: boolean; website: string }`, `submitQuizLink(input): Promise<ActionResult<{ state: "SUBMITTED" }>>`
  - pesan galat link tidak berlaku: `"Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp."`

- [ ] **Step 1: Tulis uji integrasi yang gagal**

`tests/integration/quiz-link-public.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { quizLinkCode } from "@/server/quiz-link-code";
import { getQuizLinkPage, submitQuizLink } from "@/server/quiz-link-public";
import { aestheticReturningPatient, slimmingNewPatient } from "../fixtures/quiz-answers-v2";
import { unwrap } from "./unwrap";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "link-kuis-publik-uji";
const WA = "6281277800001";
const HOUR = 60 * 60 * 1000;
const CLOSED = "Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp.";
const IDENTITY = { birthDate: "1990-05-17", gender: "P", occupation: "Guru", address: "Jl. Uji Link No. 1, Manado" };

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { action: "intake.link-submit" } });
}

describe("halaman link kuis (publik)", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(input: { source?: BookingSource; status?: AppointmentStatus; offsetHours?: number; bookingFee?: number | null } = {}) {
    slot += 1;
    const startAt = new Date(base + (input.offsetHours ?? 48 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: `LNK-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: input.source ?? "WHATSAPP",
        status: input.status ?? "MENUNGGU_KONFIRMASI",
        bookingFee: input.bookingFee === undefined ? 100000 : input.bookingFee,
        branchId,
        staffId,
        patientId,
      },
    });
  }

  const submission = (code: string, answers: unknown, identity: unknown = IDENTITY) => ({
    code,
    answers,
    identity,
    consentData: true,
    consentFee: true,
    website: "",
  });

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "dr. Link", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Link",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7780", name: "Maria Link Uji", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("menampilkan nama depan, jadwal, kuis lengkap, kolom kosong, dan persetujuan biaya", async () => {
    const b = await booking();
    expect(await unwrap(getQuizLinkPage(quizLinkCode(b.id, 0)))).toEqual({
      state: "OPEN",
      firstName: "Maria",
      serviceName: "Konsultasi",
      startAt: b.startAt,
      staffName: "dr. Link",
      branchName: "Cabang Link",
      kind: "LENGKAP",
      missing: ["birthDate", "gender", "occupation", "address"],
      feeConsent: { bookingFee: 100000 },
    });
  });

  it("kirim kuis membuat isian TERISI dan melengkapi kolom kosong pasien tanpa menimpa yang terisi", async () => {
    await prisma.patient.update({ where: { id: patientId }, data: { occupation: "Dosen", address: "" } });
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    const page = await unwrap(getQuizLinkPage(code));
    expect(page).toMatchObject({ missing: ["birthDate", "gender", "address"] });

    expect(await unwrap(submitQuizLink(submission(code, slimmingNewPatient)))).toEqual({ state: "SUBMITTED" });

    const intake = await prisma.intake.findUniqueOrThrow({ where: { appointmentId: b.id } });
    expect(intake).toMatchObject({
      status: "TERISI",
      kind: "LENGKAP",
      purpose: "SLIMMING",
      patientId,
      name: "Maria Link Uji",
      whatsapp: WA,
      occupation: "Dosen",
      address: "Jl. Uji Link No. 1, Manado",
      claimsReturning: null,
    });
    expect(intake.submittedAt).not.toBeNull();
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(patient).toMatchObject({ occupation: "Dosen", gender: "P", address: "Jl. Uji Link No. 1, Manado" });
    expect(patient.birthDate?.toISOString().slice(0, 10)).toBe("1990-05-17");

    expect(await unwrap(getQuizLinkPage(code))).toEqual({ state: "SUBMITTED" });
    expect(await prisma.auditLog.count({ where: { action: "intake.link-submit", entityId: intake.id } })).toBe(1);
  });

  it("data diri sudah lengkap: tidak ada kolom yang ditanyakan dan data pasien tidak tersentuh", async () => {
    await prisma.patient.update({
      where: { id: patientId },
      data: { birthDate: new Date("1985-01-02T00:00:00Z"), gender: "L", occupation: "Pedagang", address: "Tondano" },
    });
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    expect(await unwrap(getQuizLinkPage(code))).toMatchObject({ missing: [] });

    await unwrap(submitQuizLink(submission(code, slimmingNewPatient, {})));

    expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).toMatchObject({
      gender: "L",
      occupation: "Pedagang",
      address: "Tondano",
    });
  });

  it("kirim dua kali menghasilkan satu isian", async () => {
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    const [first, second] = await Promise.all([
      submitQuizLink(submission(code, slimmingNewPatient)),
      submitQuizLink(submission(code, slimmingNewPatient)),
    ]);
    expect(first).toEqual({ ok: true, data: { state: "SUBMITTED" } });
    expect(second).toEqual({ ok: true, data: { state: "SUBMITTED" } });
    expect(await prisma.intake.count({ where: { appointmentId: b.id } })).toBe(1);
  });

  it("pasien yang sudah punya isian lengkap mendapat kuis pendek; jenis yang salah ditolak", async () => {
    const earlier = await booking({ status: "SELESAI", offsetHours: -72 });
    await prisma.intake.create({
      data: { appointmentId: earlier.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    expect(await unwrap(getQuizLinkPage(code))).toMatchObject({ kind: "PENDEK" });

    expect(await submitQuizLink(submission(code, slimmingNewPatient))).toEqual({
      ok: false,
      error: "Form ini sudah diperbarui. Muat ulang halaman lalu isi lagi.",
    });
    await unwrap(submitQuizLink(submission(code, aestheticReturningPatient)));
    expect(await prisma.intake.findUniqueOrThrow({ where: { appointmentId: b.id } })).toMatchObject({
      kind: "PENDEK",
      purpose: "AESTHETIC",
    });
  });

  it("link tidak berlaku: dibatalkan, lewat jadwal, booking situs, kode diubah, atau versi lama", async () => {
    const cancelled = await booking({ status: "DIBATALKAN" });
    const past = await booking({ status: "TERKONFIRMASI", offsetHours: -2 });
    const site = await booking({ source: "SITUS" });
    const open = await booking();
    const tampered = quizLinkCode(open.id, 0).slice(0, -1) + (quizLinkCode(open.id, 0).endsWith("A") ? "B" : "A");

    for (const code of [quizLinkCode(cancelled.id, 0), quizLinkCode(past.id, 0), quizLinkCode(site.id, 0), tampered, "rusak"]) {
      expect(await unwrap(getQuizLinkPage(code))).toEqual({ state: "CLOSED" });
    }
    expect(await submitQuizLink(submission(quizLinkCode(cancelled.id, 0), slimmingNewPatient))).toEqual({
      ok: false,
      error: CLOSED,
    });

    await prisma.intake.create({
      data: { appointmentId: open.id, patientId, status: "MENUNGGU_DIISI", kind: "LENGKAP", linkVersion: 1 },
    });
    expect(await unwrap(getQuizLinkPage(quizLinkCode(open.id, 0)))).toEqual({ state: "CLOSED" });
    expect(await unwrap(getQuizLinkPage(quizLinkCode(open.id, 1)))).toMatchObject({ state: "OPEN" });
  });

  it("Ganti link atau pembatalan saat customer sedang mengisi: Kirim ditolak tanpa menyimpan apa pun", async () => {
    const b = await booking();
    const code = quizLinkCode(b.id, 0);
    await unwrap(getQuizLinkPage(code));
    // Admin menekan Ganti link sementara customer masih di tengah kuis.
    await prisma.intake.create({
      data: { appointmentId: b.id, patientId, status: "MENUNGGU_DIISI", kind: "LENGKAP", linkVersion: 1 },
    });
    expect(await submitQuizLink(submission(code, slimmingNewPatient))).toEqual({ ok: false, error: CLOSED });
    expect((await prisma.intake.findUniqueOrThrow({ where: { appointmentId: b.id } })).status).toBe("MENUNGGU_DIISI");

    const other = await booking();
    const otherCode = quizLinkCode(other.id, 0);
    await prisma.appointment.update({ where: { id: other.id }, data: { status: "TIDAK_HADIR" } });
    expect(await submitQuizLink(submission(otherCode, slimmingNewPatient))).toEqual({ ok: false, error: CLOSED });
    expect(await prisma.intake.count({ where: { appointmentId: other.id } })).toBe(0);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).occupation).toBeNull();
  });

  it("persetujuan: data selalu wajib, biaya hanya bila booking berbiaya dan belum diverifikasi", async () => {
    const waiting = await booking();
    expect(
      await submitQuizLink({ ...submission(quizLinkCode(waiting.id, 0), slimmingNewPatient), consentData: false }),
    ).toEqual({ ok: false, error: "Centang persetujuan data untuk melanjutkan." });
    expect(
      await submitQuizLink({ ...submission(quizLinkCode(waiting.id, 0), slimmingNewPatient), consentFee: false }),
    ).toEqual({ ok: false, error: "Centang persetujuan biaya booking untuk melanjutkan." });

    const confirmed = await booking({ status: "TERKONFIRMASI" });
    const code = quizLinkCode(confirmed.id, 0);
    expect(await unwrap(getQuizLinkPage(code))).toMatchObject({ feeConsent: null });
    await unwrap(submitQuizLink({ ...submission(code, slimmingNewPatient), consentFee: false }));
  });

  it("kolom jebakan bot ditolak", async () => {
    const b = await booking();
    expect(await submitQuizLink({ ...submission(quizLinkCode(b.id, 0), slimmingNewPatient), website: "spam" })).toEqual({
      ok: false,
      error: "Form gagal dikirim. Muat ulang halaman lalu coba lagi.",
    });
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test:integration -- tests/integration/quiz-link-public.test.ts`
Expected: FAIL. `@/server/quiz-link-public` belum ada.

- [ ] **Step 3: Ubah skema dan tulis migrasi**

Di `prisma/schema.prisma`:
- tambahkan `LINK_KUIS` sebagai nilai terakhir enum `AppointmentMessageKind`;
- di model `Intake`, ganti komentar dan dua kolom ini:

```prisma
  /// Link WA pribadi (Plan 3b-2): hanya hash SHA-256 token yang disimpan.
  linkTokenHash String?   @unique
  linkExpiresAt DateTime?
```

dengan:

```prisma
  /// Versi link isi kuis (spec C3 bagian 6). Kode link = HMAC dari booking + versi ini;
  /// "Ganti link" menaikkannya sehingga link lama tidak berlaku.
  linkVersion Int @default(0)
```

`prisma/migrations/20261002150000_link_kuis/migration.sql`:

```sql
-- UI panel admin bagian C3: link isi kuis untuk booking yang dicatat admin.
-- Kode link dihitung dari kunci rahasia + booking + versi, jadi tidak disimpan;
-- kolom token lama (desain awal, belum pernah dipakai) dihapus.
-- Spec: docs/superpowers/specs/2026-10-02-link-kuis-design.md bagian 6.

-- AlterEnum
ALTER TYPE "AppointmentMessageKind" ADD VALUE 'LINK_KUIS';

-- DropIndex
DROP INDEX "Intake_linkTokenHash_key";

-- AlterTable
ALTER TABLE "Intake" DROP COLUMN "linkExpiresAt",
DROP COLUMN "linkTokenHash",
ADD COLUMN     "linkVersion" INTEGER NOT NULL DEFAULT 0;
```

Run:

```bash
npx prisma migrate deploy
npm run db:migrate:test
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: ketiga perintah pertama berhasil, dan perintah terakhir keluar dengan kode 0.

- [ ] **Step 4: Pakai bersama penyimpanan jawaban**

Tambahkan ke akhir `src/lib/kuis/v2/answers.ts`:

```ts
/** Berat & tinggi disimpan di kolom bertipe isian, bukan di JSON jawaban (spec pendaftaran 5.1). */
export function answersForStorage(answers: QuizAnswers): Omit<QuizAnswers, "body"> {
  const copy = structuredClone(answers);
  delete copy.body;
  return copy;
}
```

Di `src/server/public-booking.ts`:
- tambahkan `answersForStorage` ke impor (`import { answersForStorage, type QuizAnswers } from "@/lib/kuis/v2/answers";`);
- hapus fungsi `storedAnswers` beserta komentarnya;
- ganti `answers: storedAnswers(answers),` menjadi `answers: answersForStorage(answers) as Prisma.InputJsonValue,`.

- [ ] **Step 5: Tulis `src/server/quiz-link-store.ts`**

```ts
import { prisma } from "@/lib/db";

/** Data booking yang dibutuhkan link kuis — identitas pasien saja, tanpa catatan medis. */
const LINK_BOOKING_SELECT = {
  id: true,
  code: true,
  type: true,
  source: true,
  status: true,
  startAt: true,
  bookingFee: true,
  patientId: true,
  service: { select: { name: true } },
  staff: { select: { name: true } },
  branch: { select: { name: true } },
  patient: {
    select: { name: true, whatsapp: true, birthDate: true, gender: true, occupation: true, address: true },
  },
  intake: { select: { id: true, status: true, linkVersion: true } },
} as const;

export function loadLinkBooking(appointmentId: string) {
  return prisma.appointment.findUnique({ where: { id: appointmentId }, select: LINK_BOOKING_SELECT });
}

export type LinkBooking = NonNullable<Awaited<ReturnType<typeof loadLinkBooking>>>;

/** Isian lengkap yang sudah dikirim pasien ini, dari booking mana pun (spec C3 3.2). */
export async function hasCompletedFullIntake(patientId: string): Promise<boolean> {
  const count = await prisma.intake.count({
    where: { patientId, kind: "LENGKAP", status: { in: ["TERISI", "DIPERIKSA"] } },
  });
  return count > 0;
}
```

- [ ] **Step 6: Tulis `src/server/quiz-link-public.ts`**

```ts
"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { validateLinkIdentity } from "@/lib/kuis/identity";
import { answersForStorage } from "@/lib/kuis/v2/answers";
import { QUIZ_VERSION } from "@/lib/kuis/v2/options";
import { validateQuizAnswers } from "@/lib/kuis/v2/steps";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import {
  firstName,
  missingIdentityFields,
  needsFeeConsent,
  patientTypeForKind,
  quizKindFor,
  quizLinkState,
  quizLinkVersion,
  type QuizLinkPage,
} from "@/lib/quiz-link";
import { createRateLimiter } from "@/lib/rate-limit";
import { safeRevalidatePath } from "@/lib/revalidate";
import { bookingServiceName } from "@/lib/transfer-instruction";
import { recordAudit, SITE_PATIENT_ACTOR } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { isValidQuizLinkCode, parseQuizLinkCode } from "@/server/quiz-link-code";
import { hasCompletedFullIntake, loadLinkBooking, type LinkBooking } from "@/server/quiz-link-store";
import { guardRate } from "@/server/request-guard";

// Setiap ekspor berkas ini bisa dipanggil siapa pun dari browser tanpa login.
// Kode link adalah satu-satunya bukti, jadi diperiksa ulang di setiap aksi.

const pageLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const submitLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

const LINK_CLOSED = "Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp.";
const GENERIC_FAILURE = "Form gagal dikirim. Muat ulang halaman lalu coba lagi.";

export type QuizLinkSubmission = {
  code: string;
  answers: unknown;
  identity: unknown;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan: tersembunyi dari manusia, diisi bot. */
  website: string;
};

class AlreadySubmitted extends Error {}

/** Booking pemilik kode, atau null bila kode rusak, palsu, atau sudah diganti. */
async function bookingForCode(code: unknown): Promise<LinkBooking | null> {
  const parsed = parseQuizLinkCode(code);
  if (!parsed) return null;
  const booking = await loadLinkBooking(parsed.appointmentId);
  if (!booking) return null;
  return isValidQuizLinkCode(code as string, quizLinkVersion(booking)) ? booking : null;
}

/** Isi halaman /isi. Hanya nama depan dan jadwal: nomor WA dan data medis tidak pernah dikirim. */
export async function getQuizLinkPage(code: string): Promise<ActionResult<QuizLinkPage>> {
  return runAction(async () => {
    await guardRate(pageLimiter);
    const booking = await bookingForCode(code);
    if (!booking) return { state: "CLOSED" };
    const state = quizLinkState(booking, new Date());
    if (state !== "OPEN") return { state };
    const patient = booking.patient!;
    return {
      state: "OPEN",
      firstName: firstName(patient.name),
      serviceName: bookingServiceName(booking),
      startAt: booking.startAt,
      staffName: booking.staff.name,
      branchName: booking.branch.name,
      kind: quizKindFor(await hasCompletedFullIntake(booking.patientId!)),
      missing: missingIdentityFields(patient),
      feeConsent: needsFeeConsent(booking) ? { bookingFee: booking.bookingFee! } : null,
    };
  });
}

/**
 * Kirim kuis dari link (spec C3 3.3): isian dibuat atau diisi (TERISI), lalu
 * data diri hanya melengkapi kolom pasien yang masih kosong — dalam satu
 * transaksi. Kiriman kedua mendapat "sudah diterima", tanpa isian ganda.
 */
export async function submitQuizLink(input: QuizLinkSubmission): Promise<ActionResult<{ state: "SUBMITTED" }>> {
  return runAction(async () => {
    await guardRate(submitLimiter);
    if (input.website) throw new UserFacingError(GENERIC_FAILURE);

    const booking = await bookingForCode(input.code);
    if (!booking) throw new UserFacingError(LINK_CLOSED);
    const now = new Date();
    const state = quizLinkState(booking, now);
    if (state === "SUBMITTED") return { state: "SUBMITTED" };
    if (state !== "OPEN") throw new UserFacingError(LINK_CLOSED);
    const patientId = booking.patientId!;
    const patient = booking.patient!;

    if (input.consentData !== true) throw new UserFacingError("Centang persetujuan data untuk melanjutkan.");
    if (needsFeeConsent(booking) && input.consentFee !== true) {
      throw new UserFacingError("Centang persetujuan biaya booking untuk melanjutkan.");
    }

    const kind = quizKindFor(await hasCompletedFullIntake(patientId));
    const quiz = validateQuizAnswers(input.answers, { askPatientType: false });
    if (!quiz.ok) throw new UserFacingError(quiz.message);
    if (quiz.answers.patientType !== patientTypeForKind(kind)) {
      throw new UserFacingError("Form ini sudah diperbarui. Muat ulang halaman lalu isi lagi.");
    }
    const answers = quiz.answers;

    const checked = validateLinkIdentity(input.identity, missingIdentityFields(patient), now);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const filled = checked.identity;
    const birthDate = filled.birthDate ? new Date(`${filled.birthDate}T00:00:00Z`) : patient.birthDate;

    const data = {
      status: "TERISI" as const,
      kind,
      purpose: answers.purpose,
      quizVersion: QUIZ_VERSION,
      answers: answersForStorage(answers) as Prisma.InputJsonValue,
      patientId,
      name: patient.name,
      whatsapp: patient.whatsapp,
      birthDate,
      gender: filled.gender ?? patient.gender,
      occupation: filled.occupation ?? patient.occupation,
      address: filled.address ?? patient.address,
      selfWeightKg: answers.body?.weightKg,
      selfHeightCm: answers.body?.heightCm,
      consentAt: now,
      consentVersion: PRIVACY_POLICY_VERSION,
      submittedAt: now,
    };

    let intakeId: string;
    try {
      intakeId = await prisma.$transaction(async (tx) => {
        let id: string;
        if (booking.intake) {
          // Hanya baris yang masih menunggu: isian TERISI tidak pernah diubah.
          const { count } = await tx.intake.updateMany({
            where: { id: booking.intake.id, status: "MENUNGGU_DIISI" },
            data,
          });
          if (count === 0) throw new AlreadySubmitted();
          id = booking.intake.id;
        } else {
          id = (await tx.intake.create({ data: { ...data, appointmentId: booking.id }, select: { id: true } })).id;
        }
        // Melengkapi kolom yang masih kosong saja; kolom yang terisi tidak pernah ditimpa.
        if (filled.birthDate) {
          await tx.patient.updateMany({ where: { id: patientId, birthDate: null }, data: { birthDate } });
        }
        if (filled.gender) {
          await tx.patient.updateMany({ where: { id: patientId, gender: null }, data: { gender: filled.gender } });
        }
        if (filled.occupation) {
          await tx.patient.updateMany({
            where: { id: patientId, OR: [{ occupation: null }, { occupation: "" }] },
            data: { occupation: filled.occupation },
          });
        }
        if (filled.address) {
          await tx.patient.updateMany({
            where: { id: patientId, OR: [{ address: null }, { address: "" }] },
            data: { address: filled.address },
          });
        }
        return id;
      });
    } catch (error) {
      // Dua Kirim bersamaan: yang kalah mendapati isian sudah terisi, atau menabrak batas unik per booking.
      if (error instanceof AlreadySubmitted || isUniqueViolation(error)) return { state: "SUBMITTED" };
      throw error;
    }

    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "intake.link-submit",
      entity: "Intake",
      entityId: intakeId,
      summary: booking.code,
    });
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin/pengingat");
    return { state: "SUBMITTED" };
  });
}
```

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npm run test:integration -- tests/integration/quiz-link-public.test.ts tests/integration/site-booking.test.ts tests/integration/intake-access.test.ts`
Expected: PASS. Booking situs tetap tersimpan sama seperti sebelumnya.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261002150000_link_kuis src/lib/kuis/v2/answers.ts src/server/public-booking.ts src/server/quiz-link-store.ts src/server/quiz-link-public.ts tests/integration/quiz-link-public.test.ts
git commit -m "feat: let customers open and submit the quiz from a signed link"
```

---

### Task 4: Aksi admin link kuis dan pesan `LINK_KUIS`

**Files:**
- Modify: `src/lib/booking-messages.ts` (`MESSAGE_KINDS` + `LINK_KUIS`; `quizLinkMessageText`)
- Modify: `src/lib/reminder-work.ts` (label "Link kuis terkirim")
- Create: `src/server/quiz-link-admin.ts`
- Modify: `src/server/appointment-message.ts` (pencatatan `LINK_KUIS`)
- Test: `tests/unit/booking-messages.test.ts` (tambah), `tests/unit/reminder-work.test.ts` (tambah), `tests/integration/quiz-link-admin.test.ts` (baru)

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `MessageKind` + `"LINK_KUIS"`
  - `quizLinkMessageText({ patientName, serviceName, startAt, link }): string`
  - `QuizLinkInfo = { url: string; message: WhatsAppMessage; scheduledFor: Date }`
  - `getQuizLink(appointmentId): Promise<ActionResult<QuizLinkInfo | null>>`
  - `rotateQuizLink(appointmentId): Promise<ActionResult<QuizLinkInfo>>`
  - `recordAppointmentMessage` menerima `kind: "LINK_KUIS"` selama link berlaku
  - `messageStatusLabels` menulis "Link kuis terkirim {jam}"

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan ke `tests/unit/booking-messages.test.ts`. Gabungkan `quizLinkMessageText` ke baris impor `@/lib/booking-messages`, lalu tambahkan di akhir berkas:

```ts
describe("quizLinkMessageText (spec C3 4.2)", () => {
  it("menyapa nama depan, menyebut layanan dan jadwal, lalu link", () => {
    expect(
      quizLinkMessageText({
        patientName: "Maria Wenas",
        serviceName: "Konsultasi Dokter",
        startAt: wita(17, 11),
        link: "https://sundyclinic.com/isi#abc",
      }),
    ).toBe(
      "Halo Maria, ini SunDY Clinic. Sebelum Konsultasi Dokter Senin, 17 Februari 2031 pukul 11.00 WITA, mohon isi form singkat ini (±5 menit): https://sundyclinic.com/isi#abc\n" +
        "Jawaban Anda hanya dibaca dokter kami.",
    );
  });
});
```

Tambahkan ke `tests/unit/reminder-work.test.ts`, di dalam `describe("messageStatusLabels", …)`:

```ts
  it("menulis link kuis yang terkirim", () => {
    const now = wita(10, 12);
    const start = wita(11, 11);
    expect(messageStatusLabels([msg("LINK_KUIS", start, wita(10, 8, 15))], start, now)).toEqual([
      "Link kuis terkirim 08.15",
    ]);
  });
```

`tests/integration/quiz-link-admin.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { recordAppointmentMessage } from "@/server/appointment-message";
import { isValidQuizLinkCode, quizLinkCode } from "@/server/quiz-link-code";
import { getQuizLink, rotateQuizLink } from "@/server/quiz-link-admin";
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

const SLUG = "link-kuis-admin-uji";
const WA = "6281277900001";
const HOUR = 60 * 60 * 1000;
const SITE = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { action: "intake.link-rotate" } });
}

describe("link kuis di panel admin", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(status: AppointmentStatus = "MENUNGGU_KONFIRMASI") {
    slot += 1;
    const startAt = new Date(base + (48 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: `LKA-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: "WALK_IN",
        status,
        branchId,
        staffId,
        patientId,
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "dr. Admin Link", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Admin Link",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7790", name: "Budi Walkin", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("mengambil link, teks WA terpisah ke nomor pasien, dan jadwal yang tertulis", async () => {
    const b = await booking();
    const info = (await unwrap(getQuizLink(b.id)))!;
    expect(info.url).toBe(`${SITE}/isi#${quizLinkCode(b.id, 0)}`);
    expect(info.message.text).toContain("Halo Budi, ini SunDY Clinic.");
    expect(info.message.text).toContain(info.url);
    expect(info.message.link).toMatch(/^https:\/\/wa\.me\/6281277900001\?text=/);
    expect(info.scheduledFor).toEqual(b.startAt);
  });

  it("tidak ada link setelah kuis dikirim atau bila booking tidak aktif", async () => {
    const submitted = await booking();
    await prisma.intake.create({
      data: { appointmentId: submitted.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    expect(await unwrap(getQuizLink(submitted.id))).toBeNull();
    expect(await unwrap(getQuizLink((await booking("DIBATALKAN")).id))).toBeNull();
    expect(await getQuizLink("tidak-ada")).toEqual({ ok: false, error: "Booking tidak ditemukan." });
  });

  it("Ganti link menaikkan versi, link lama tidak berlaku, dan tercatat di audit", async () => {
    const b = await booking();
    const old = quizLinkCode(b.id, 0);

    const first = await unwrap(rotateQuizLink(b.id));
    expect(await prisma.intake.findUniqueOrThrow({ where: { appointmentId: b.id } })).toMatchObject({
      status: "MENUNGGU_DIISI",
      kind: "LENGKAP",
      linkVersion: 1,
      patientId,
    });
    expect(first.url).toBe(`${SITE}/isi#${quizLinkCode(b.id, 1)}`);
    expect(isValidQuizLinkCode(old, 1)).toBe(false);

    const second = await unwrap(rotateQuizLink(b.id));
    expect(second.url).toBe(`${SITE}/isi#${quizLinkCode(b.id, 2)}`);
    expect(await prisma.auditLog.count({ where: { action: "intake.link-rotate", entityId: b.id } })).toBe(2);
  });

  it("Ganti link ditolak untuk booking yang linknya tidak berlaku", async () => {
    expect(await rotateQuizLink((await booking("TIDAK_HADIR")).id)).toEqual({
      ok: false,
      error: "Link kuis tidak tersedia untuk booking ini.",
    });
  });

  it("pengiriman link via WA tercatat sebagai LINK_KUIS selama link berlaku", async () => {
    const b = await booking();
    await unwrap(recordAppointmentMessage({ appointmentId: b.id, kind: "LINK_KUIS", scheduledFor: b.startAt }));
    expect(await prisma.appointmentMessage.count({ where: { appointmentId: b.id, kind: "LINK_KUIS" } })).toBe(1);

    await prisma.intake.create({
      data: { appointmentId: b.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    expect(await recordAppointmentMessage({ appointmentId: b.id, kind: "LINK_KUIS", scheduledFor: b.startAt })).toEqual({
      ok: false,
      error: "Link kuis tidak tersedia untuk booking ini.",
    });
  });

  it("semua aksi memakai booking:manage, yang dimiliki resepsionis", async () => {
    const b = await booking();
    vi.mocked(requireCapability).mockClear();
    await getQuizLink(b.id);
    await rotateQuizLink(b.id);
    const capabilities = vi.mocked(requireCapability).mock.calls.map(([capability]) => capability);
    expect(new Set(capabilities)).toEqual(new Set(["booking:manage"]));
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/booking-messages.test.ts tests/unit/reminder-work.test.ts && npm run test:integration -- tests/integration/quiz-link-admin.test.ts`
Expected: FAIL.
- `quizLinkMessageText` belum diekspor.
- Label "Link kuis terkirim" belum ada.
- `@/server/quiz-link-admin` belum ada.

- [ ] **Step 3: Teks pesan link dan jenis pesan baru di `src/lib/booking-messages.ts`**

Ganti `MESSAGE_KINDS`:

```ts
/** Jenis pesan WhatsApp yang dicatat terkirim (spec C2 bagian 6, C3 4.2). */
export const MESSAGE_KINDS = ["INSTRUKSI_TRANSFER", "KONFIRMASI", "PENGINGAT", "LINK_KUIS"] as const;
```

Tambahkan impor:

```ts
import { firstName } from "./quiz-link";
```

Tambahkan di akhir berkas:

```ts
/** Pesan terpisah "Kirim link via WA" (spec C3 4.2), mis. untuk walk-in atau kirim ulang. */
export function quizLinkMessageText(input: {
  patientName: string;
  serviceName: string;
  startAt: Date;
  link: string;
}): string {
  return [
    `Halo ${firstName(input.patientName)}, ini ${CLINIC_NAME}. Sebelum ${input.serviceName} ${formatScheduleForMessage(input.startAt)}, mohon isi form singkat ini (±5 menit): ${input.link}`,
    "Jawaban Anda hanya dibaca dokter kami.",
  ].join("\n");
}
```

- [ ] **Step 4: Label di `src/lib/reminder-work.ts`**

Di `messageStatusLabels`, tambahkan setelah blok `transfer`:

```ts
  const quizLink = latestValidMessage(messages, "LINK_KUIS", startAt);
  if (quizLink) labels.push(`Link kuis terkirim ${when(quizLink.sentAt)}`);
```

- [ ] **Step 5: Tulis `src/server/quiz-link-admin.ts`**

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { quizLinkMessageText, type WhatsAppMessage } from "@/lib/booking-messages";
import { prisma } from "@/lib/db";
import { quizKindFor, quizLinkState, quizLinkVersion } from "@/lib/quiz-link";
import { safeRevalidatePath } from "@/lib/revalidate";
import { bookingServiceName } from "@/lib/transfer-instruction";
import { buildWhatsAppLinkTo } from "@/lib/whatsapp";
import { recordAudit } from "@/server/audit";
import { quizLinkUrl } from "@/server/quiz-link-code";
import { hasCompletedFullIntake, loadLinkBooking, type LinkBooking } from "@/server/quiz-link-store";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

/** Isi dialog "Link kuis" (spec C3 4.2). `scheduledFor` adalah jadwal yang tertulis di teks WA. */
export type QuizLinkInfo = { url: string; message: WhatsAppMessage; scheduledFor: Date };

function infoFor(booking: LinkBooking, version: number): QuizLinkInfo {
  const url = quizLinkUrl(publicSiteUrl(), booking.id, version);
  // quizLinkState OPEN menjamin booking punya pasien.
  const text = quizLinkMessageText({
    patientName: booking.patient!.name,
    serviceName: bookingServiceName(booking),
    startAt: booking.startAt,
    link: url,
  });
  return { url, message: { text, link: buildWhatsAppLinkTo(booking.patient!.whatsapp, text) }, scheduledFor: booking.startAt };
}

/** Link kuis sebuah booking, atau null bila kuis sudah diisi atau booking tidak aktif. */
export async function getQuizLink(appointmentId: string): Promise<ActionResult<QuizLinkInfo | null>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const booking = await loadLinkBooking(appointmentId);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (quizLinkState(booking, new Date()) !== "OPEN") return null;
    return infoFor(booking, quizLinkVersion(booking));
  });
}

/**
 * "Ganti link": versi naik, sehingga link lama langsung tidak berlaku. Untuk
 * booking yang belum punya baris isian, baris MENUNGGU_DIISI dibuat untuk
 * menyimpan versinya; jenis kuisnya ditetapkan ulang saat Kirim.
 */
export async function rotateQuizLink(appointmentId: string): Promise<ActionResult<QuizLinkInfo>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const booking = await loadLinkBooking(appointmentId);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (quizLinkState(booking, new Date()) !== "OPEN") {
      throw new UserFacingError("Link kuis tidak tersedia untuk booking ini.");
    }

    const kind = quizKindFor(await hasCompletedFullIntake(booking.patientId!));
    const intake = await prisma.intake.upsert({
      where: { appointmentId },
      create: { appointmentId, patientId: booking.patientId, status: "MENUNGGU_DIISI", kind, linkVersion: 1 },
      update: { linkVersion: { increment: 1 } },
      select: { linkVersion: true },
    });

    await recordAudit({
      actor,
      action: "intake.link-rotate",
      entity: "Appointment",
      entityId: appointmentId,
      summary: `${booking.code} versi ${intake.linkVersion}`,
    });
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin/pengingat");
    return infoFor(booking, intake.linkVersion);
  });
}
```

- [ ] **Step 6: Terima `LINK_KUIS` di `recordAppointmentMessage` (`src/server/appointment-message.ts`)**

Tambahkan impor:

```ts
import { quizLinkState } from "@/lib/quiz-link";
```

Ubah `select` pemuatan booking di `recordAppointmentMessage` menjadi:

```ts
      select: {
        status: true,
        source: true,
        bookingFee: true,
        startAt: true,
        patientId: true,
        intake: { select: { status: true, linkVersion: true } },
      },
```

Ganti pemeriksaan jenis pesan:

```ts
    if (input.kind === "INSTRUKSI_TRANSFER") {
      if (!needsTransfer(booking)) throw new UserFacingError("Booking ini tidak sedang menunggu transfer.");
    } else if (booking.status !== "TERKONFIRMASI") {
      throw new UserFacingError("Booking ini belum terkonfirmasi.");
    }
```

dengan:

```ts
    if (input.kind === "INSTRUKSI_TRANSFER") {
      if (!needsTransfer(booking)) throw new UserFacingError("Booking ini tidak sedang menunggu transfer.");
    } else if (input.kind === "LINK_KUIS") {
      if (quizLinkState(booking, new Date()) !== "OPEN") {
        throw new UserFacingError("Link kuis tidak tersedia untuk booking ini.");
      }
    } else if (booking.status !== "TERKONFIRMASI") {
      throw new UserFacingError("Booking ini belum terkonfirmasi.");
    }
```

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/booking-messages.test.ts tests/unit/reminder-work.test.ts && npm run test:integration -- tests/integration/quiz-link-admin.test.ts tests/integration/appointment-message.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 8: Commit**

```bash
git add src/lib/booking-messages.ts src/lib/reminder-work.ts src/server/quiz-link-admin.ts src/server/appointment-message.ts tests/unit/booking-messages.test.ts tests/unit/reminder-work.test.ts tests/integration/quiz-link-admin.test.ts
git commit -m "feat: let staff fetch, resend, and rotate a booking's quiz link"
```

---

### Task 5: Link ikut instruksi transfer, konfirmasi, dan pengingat

**Files:**
- Modify: `src/lib/transfer-instruction.ts` (`transferInstructionText`, `transferInstructionFor`)
- Modify: `src/lib/booking-messages.ts` (`confirmationText`, `reminderText`, `confirmationMessageFor`, `reminderMessageFor`)
- Modify: `src/server/appointment.ts` (`BOOKING_LIST_INCLUDE.intake`, `getTransferInstruction`)
- Modify: `src/server/appointment-message.ts` (`MESSAGE_BOOKING_INCLUDE`, `getBookingMessage`)
- Modify: `src/server/reminder.ts` (`WORK_INCLUDE`, `toRow`)
- Modify: `src/app/(admin)/admin/booking/page.tsx` (`toRow`)
- Test: `tests/unit/transfer-instruction.test.ts` (tambah), `tests/unit/booking-messages.test.ts` (tambah), `tests/integration/quiz-link-messages.test.ts` (baru)

**Interfaces:**
- Consumes: `quizLinkLines` (Task 1), `quizLinkFor` (Task 2), `publicSiteUrl`.
- Produces:
  - `transferInstructionText({ …, quizLink?: string | null })`, `transferInstructionFor(booking, bank, quizLink: string | null = null)`
  - `confirmationText({ …, quizLink?: string | null })`, `confirmationMessageFor(booking, siteUrl, quizLink: string | null = null)`
  - `reminderText({ …, quizLink?: string | null })`, `reminderMessageFor(booking, quizLink: string | null = null)`
  - `BOOKING_LIST_INCLUDE.intake` memuat `kind` dan `linkVersion`

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan ke `tests/unit/transfer-instruction.test.ts`, di dalam `describe("transferInstructionText", …)`:

```ts
  it("menambahkan link kuis di akhir bila ada", () => {
    const text = transferInstructionText({ ...textInput, quizLink: "https://sundyclinic.com/isi#abc" });
    expect(text.endsWith(
      "berlaku bila Anda pindah jadwal paling lambat 2 jam sebelumnya.\n\n" +
        "Sebelum datang, mohon isi form singkat ini (±5 menit): https://sundyclinic.com/isi#abc\n" +
        "Jawaban Anda hanya dibaca dokter kami.",
    )).toBe(true);
    expect(transferInstructionText({ ...textInput, quizLink: null })).toBe(transferInstructionText(textInput));
  });
```

Tambahkan ke `tests/unit/booking-messages.test.ts`:
- di `describe("confirmationText", …)`:

```ts
  it("link kuis disisipkan sebelum salam penutup", () => {
    const text = confirmationText({ ...confirmationInput, quizLink: "https://sundyclinic.com/isi#abc" });
    expect(text).toContain(
      "Cek status booking: https://sundyclinic.com/cek-booking?kode=SDY-7KQ2\n\n" +
        "Sebelum datang, mohon isi form singkat ini (±5 menit): https://sundyclinic.com/isi#abc\n" +
        "Jawaban Anda hanya dibaca dokter kami.\n\n" +
        "Sampai jumpa di klinik.",
    );
  });
```

- di `describe("reminderText", …)`:

```ts
  it("link kuis di akhir pengingat bila kuis belum diisi", () => {
    const text = reminderText({ ...reminderInput, quizLink: "https://sundyclinic.com/isi#abc" });
    expect(text.endsWith(
      "kabari kami bila ingin pindah jadwal.\n\n" +
        "Sebelum datang, mohon isi form singkat ini (±5 menit): https://sundyclinic.com/isi#abc\n" +
        "Jawaban Anda hanya dibaca dokter kami.",
    )).toBe(true);
  });
```

- di `describe("pesan dari booking", …)`:

```ts
  it("pembentuk pesan meneruskan link kuis", () => {
    expect(confirmationMessageFor(booking, "https://sundyclinic.com", "https://sundyclinic.com/isi#x")!.text).toContain(
      "isi form singkat ini (±5 menit): https://sundyclinic.com/isi#x",
    );
    expect(reminderMessageFor(booking, "https://sundyclinic.com/isi#x")!.text).toContain("isi#x");
    expect(reminderMessageFor(booking)!.text).not.toContain("isi form");
  });
```

`tests/integration/quiz-link-messages.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getTransferInstruction } from "@/server/appointment";
import { getBookingMessage } from "@/server/appointment-message";
import { quizLinkCode } from "@/server/quiz-link-code";
import { getReminderWorklist } from "@/server/reminder";
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

const SLUG = "link-kuis-pesan-uji";
const WA = "6281277950001";
const HOUR = 60 * 60 * 1000;

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: SLUG } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("link kuis di pesan C1/C2", () => {
  let staffId: string;
  let branchId: string;
  let patientId: string;
  let slot = 0;
  const base = Math.ceil(Date.now() / HOUR) * HOUR;

  function booking(status: AppointmentStatus, source: "WHATSAPP" | "SITUS" = "WHATSAPP") {
    slot += 1;
    const startAt = new Date(base + (48 + slot) * HOUR);
    return prisma.appointment.create({
      data: {
        code: `LKP-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source,
        status,
        bookingFee: 100000,
        branchId,
        staffId,
        patientId,
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "dr. Pesan Link", role: "DOKTER" } })).id;
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Pesan Link",
          address: "Jl. Uji",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7795", name: "Citra Pesan", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("instruksi transfer memuat link selama kuis belum diisi, lalu tidak lagi", async () => {
    const b = await booking("MENUNGGU_KONFIRMASI");
    const link = `/isi#${quizLinkCode(b.id, 0)}`;
    expect((await unwrap(getTransferInstruction(b.id)))!.text).toContain(link);
    expect((await unwrap(getBookingMessage(b.id)))!.text).toContain(link);

    await prisma.intake.create({
      data: { appointmentId: b.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    expect((await unwrap(getTransferInstruction(b.id)))!.text).not.toContain("/isi#");
  });

  it("konfirmasi dan pengingat memuat link; booking situs tidak pernah", async () => {
    const confirmed = await booking("TERKONFIRMASI");
    const link = `/isi#${quizLinkCode(confirmed.id, 0)}`;
    expect((await unwrap(getBookingMessage(confirmed.id)))!.text).toContain(link);

    const worklist = await getReminderWorklist();
    const row = worklist.confirm.find((r) => r.appointmentId === confirmed.id)!;
    expect(row.confirmation!.text).toContain(link);
    expect(row.reminder!.text).toContain(link);

    const site = await booking("TERKONFIRMASI", "SITUS");
    expect((await unwrap(getBookingMessage(site.id)))!.text).not.toContain("/isi#");
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/transfer-instruction.test.ts tests/unit/booking-messages.test.ts && npm run test:integration -- tests/integration/quiz-link-messages.test.ts`
Expected: FAIL. Pesan belum memuat link.

- [ ] **Step 3: Baris kuis di `src/lib/transfer-instruction.ts`**

Tambahkan impor:

```ts
import { quizLinkLines } from "./quiz-link";
```

Tambahkan ke tipe input `transferInstructionText` setelah `bankAccount`:

```ts
  /** Link kuis (spec C3 4.1); null bila kuis sudah diisi atau link tidak berlaku. */
  quizLink?: string | null;
```

Ganti badan `transferInstructionText` dari `return [ … ].join("\n");` menjadi:

```ts
  const lines = [
    `Halo ${input.patientName}, booking Anda di ${CLINIC_NAME} sudah kami catat.`,
    `Kode: ${input.code}`,
    `Layanan: ${input.serviceName}`,
    `Jadwal: ${formatScheduleForMessage(input.startAt)}`,
    `Tenaga: ${input.staffName} · ${input.branchName}`,
    "",
    `Mohon transfer biaya booking ${formatRupiah(input.fee)} paling lambat ${formatScheduleForMessage(input.deadline)} ke:`,
    input.bankAccount ?? MISSING_BANK_ACCOUNT_LINE,
    "lalu kirim bukti transfer di chat ini.",
    "",
    "Biaya booking terpisah dari biaya layanan dan tidak dikembalikan, tetapi tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelumnya.",
  ];
  if (input.quizLink) lines.push("", ...quizLinkLines(input.quizLink));
  return lines.join("\n");
```

Ubah tanda tangan `transferInstructionFor` dan teruskan link:

```ts
export function transferInstructionFor(
  booking: TransferBooking,
  bank: BankAccount,
  quizLink: string | null = null,
): TransferInstruction | null {
```

Lalu tambahkan `quizLink,` di objek yang dikirim ke `transferInstructionText` (setelah `bankAccount,`).

- [ ] **Step 4: Baris kuis di `src/lib/booking-messages.ts`**

Ubah impor `./quiz-link` menjadi:

```ts
import { firstName, quizLinkLines } from "./quiz-link";
```

**`confirmationText`:**
- Tambahkan ke tipe inputnya setelah `siteUrl`:

```ts
  /** Link kuis (spec C3 4.1); null bila kuis sudah diisi atau link tidak berlaku. */
  quizLink?: string | null;
```

- Ganti bagian akhirnya, dari `lines.push(` sampai `return lines.join("\n");`, dengan:

```ts
  lines.push(
    "",
    ARRIVE_EARLY,
    input.bookingFee === null
      ? "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya."
      : "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya; biaya booking tetap berlaku. Bila dibatalkan, biaya booking tidak dikembalikan.",
    `Cek status booking: ${input.siteUrl}/cek-booking?kode=${encodeURIComponent(input.code)}`,
  );
  if (input.quizLink) lines.push("", ...quizLinkLines(input.quizLink));
  lines.push("", "Sampai jumpa di klinik.");
  return lines.join("\n");
```

**`reminderText`:**
- Tambahkan `quizLink?: string | null;` ke tipe inputnya setelah `mapsUrl`.
- Sebelum `return lines.join("\n");`, tambahkan:

```ts
  if (input.quizLink) lines.push("", ...quizLinkLines(input.quizLink));
```

**Pembentuk pesan:**

```ts
export function confirmationMessageFor(
  booking: MessageBooking,
  siteUrl: string,
  quizLink: string | null = null,
): WhatsAppMessage | null {
```

```ts
export function reminderMessageFor(booking: MessageBooking, quizLink: string | null = null): WhatsAppMessage | null {
```

Tambahkan `quizLink,` ke objek input `confirmationText` dan `reminderText` di masing-masing fungsi.

- [ ] **Step 5: Server menghitung link untuk setiap pesan**

`src/server/appointment.ts`:
- Ganti baris `intake` di `BOOKING_LIST_INCLUDE` menjadi:

```ts
  intake: { select: { id: true, name: true, whatsapp: true, status: true, kind: true, linkVersion: true } },
```

- Tambahkan impor:

```ts
import { quizLinkFor } from "@/server/quiz-link-code";
import { publicSiteUrl } from "@/server/site-url";
```

- Di `getTransferInstruction`, ganti `return transferInstructionFor(withDeadline, await getClinicSetting());` dengan:

```ts
    const quizLink = quizLinkFor(appointment, publicSiteUrl(), new Date());
    return transferInstructionFor(withDeadline, await getClinicSetting(), quizLink);
```

`src/server/appointment-message.ts`:
- Tambahkan ke `MESSAGE_BOOKING_INCLUDE`:

```ts
  intake: { select: { status: true, linkVersion: true } },
```

- Tambahkan impor `import { quizLinkFor } from "@/server/quiz-link-code";`.
- Di `getBookingMessage`, setelah `if (!booking) throw …`, tambahkan:

```ts
    const siteUrl = publicSiteUrl();
    const quizLink = quizLinkFor(booking, siteUrl, new Date());
```

- Ganti `confirmationMessageFor(booking, publicSiteUrl())` menjadi `confirmationMessageFor(booking, siteUrl, quizLink)`.
- Ganti `transferInstructionFor({ ...booking, transferDeadline }, await getClinicSetting())` menjadi `transferInstructionFor({ ...booking, transferDeadline }, await getClinicSetting(), quizLink)`.

`src/server/reminder.ts`:
- Tambahkan ke `WORK_INCLUDE`:

```ts
  intake: { select: { status: true, linkVersion: true } },
```

- Tambahkan impor `import { quizLinkFor } from "@/server/quiz-link-code";`.
- Di `toRow` dalam `getReminderWorklist`, ganti:

```ts
    confirmation: confirmationMessageFor(booking, siteUrl),
    reminder: reminderMessageFor(booking),
```

dengan:

```ts
    confirmation: confirmationMessageFor(booking, siteUrl, quizLinkFor(booking, siteUrl, now)),
    reminder: reminderMessageFor(booking, quizLinkFor(booking, siteUrl, now)),
```

`src/app/(admin)/admin/booking/page.tsx`:
- Tambahkan impor `import { quizLinkFor } from "@/server/quiz-link-code";`.
- Di `toRow`, ganti dua baris pembentuk pesan menjadi:

```ts
  const quizLink = quizLinkFor(a, context.siteUrl, context.now);
  const confirmation = a.status === "TERKONFIRMASI" ? confirmationMessageFor(a, context.siteUrl, quizLink) : null;
  const transfer = transferInstructionFor(a, context.bank, quizLink);
```

- [ ] **Step 6: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/transfer-instruction.test.ts tests/unit/booking-messages.test.ts && npm run test:integration -- tests/integration/quiz-link-messages.test.ts tests/integration/booking-queue.test.ts tests/integration/appointment-message.test.ts tests/integration/reminder-worklist.test.ts`
Expected: PASS. Uji C1/C2 yang lama tetap lulus.

Run: `npx tsc --noEmit && npm run lint && npx vitest run tests/unit/architecture.test.ts`
Expected: bersih dan PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/transfer-instruction.ts src/lib/booking-messages.ts src/server/appointment.ts src/server/appointment-message.ts src/server/reminder.ts "src/app/(admin)/admin/booking/page.tsx" tests/unit/transfer-instruction.test.ts tests/unit/booking-messages.test.ts tests/integration/quiz-link-messages.test.ts
git commit -m "feat: include the quiz link in transfer instructions, confirmations, and reminders until it is filled"
```

---

### Task 6: Halaman `/isi` untuk customer

**Files:**
- Create: `src/components/pendaftaran/link-identity-step.tsx`
- Create: `src/components/pendaftaran/quiz-link-flow.tsx`
- Create: `src/components/pendaftaran/quiz-link-notice.tsx`
- Create: `src/components/pendaftaran/quiz-link-entry.tsx`
- Create: `src/app/(public)/isi/page.tsx`
- Modify: `src/app/robots.ts`
- Test: `tests/unit/components/quiz-link-flow.test.tsx`, `tests/unit/components/quiz-link-entry.test.tsx`, `tests/unit/robots.test.ts`

**Interfaces:**
- Consumes: `getQuizLinkPage`, `submitQuizLink` (Task 3); `QuizLinkPage`, `patientTypeForKind`, `IdentityField`, `validateLinkIdentity` (Task 1); komponen kuis v2 `QuizScreen`, `QuizStep`, `AUTO_ADVANCE_STEPS`, `SummaryStep`, `stepText`, `stepError`, `visibleSteps`, `pruneAnswers`.
- Produces:
  - `LinkIdentityDraft`, `EMPTY_LINK_IDENTITY`, `linkIdentityPayload`, `linkIdentityError`, `LinkIdentityStep`
  - `linkDraftKey(code)`, `QuizLinkFlow({ code, page, onSubmitted })`
  - `QuizLinkNotice({ state: "SUBMITTED" | "CLOSED" })`
  - `QuizLinkEntry()`
  - rute `/isi` (`noindex`); `robots.txt` `Disallow: /isi`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/quiz-link-flow.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { EMPTY_LINK_IDENTITY } from "@/components/pendaftaran/link-identity-step";
import { linkDraftKey, QuizLinkFlow } from "@/components/pendaftaran/quiz-link-flow";
import type { QuizLinkPage } from "@/lib/quiz-link";
import { submitQuizLink } from "@/server/quiz-link-public";
import { aestheticReturningPatient, slimmingNewPatient } from "../../fixtures/quiz-answers-v2";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/quiz-link-public", () => ({ submitQuizLink: vi.fn() }));

type OpenPage = Extract<QuizLinkPage, { state: "OPEN" }>;
const CODE = "cmupobz6200022ovuddaolzdc.AAAAAAAAAAAAAAAAAAAAAA";
const PAGE: OpenPage = {
  state: "OPEN",
  firstName: "Maria",
  serviceName: "Konsultasi Dokter",
  startAt: new Date("2026-10-05T03:00:00Z"),
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  kind: "PENDEK",
  missing: ["birthDate", "occupation"],
  feeConsent: { bookingFee: 100000 },
};

function seedDraft(answers: unknown, screen: string) {
  sessionStorage.setItem(linkDraftKey(CODE), JSON.stringify({ answers, screen, identity: EMPTY_LINK_IDENTITY }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => sessionStorage.clear());

describe("QuizLinkFlow", () => {
  it("menyapa dengan nama depan, menampilkan jadwal, dan tidak menanyakan 'Pernah konsultasi?'", async () => {
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    expect(await screen.findByText("Halo Maria")).toBeInTheDocument();
    expect(screen.getByText("Konsultasi Dokter · Senin, 5 Oktober 2026 pukul 11.00 WITA")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Apa yang ingin Anda konsultasikan?" })).toBeInTheDocument();
    expect(screen.queryByText("Pernah konsultasi atau treatment di SunDY Clinic?")).not.toBeInTheDocument();
  });

  it("kuis pendek: setelah tujuan langsung ke cerita kunjungan ini", async () => {
    const user = userEvent.setup();
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    await user.click(await screen.findByRole("radio", { name: /^Aesthetic/ }));
    expect(await screen.findByRole("heading", { name: "Keluhan atau treatment yang diinginkan kali ini?" })).toBeInTheDocument();
  });

  it("tombol Kembali browser mundur satu pertanyaan, dan kode di # tetap di URL", async () => {
    window.history.replaceState(null, "", `/isi#${CODE}`);
    const user = userEvent.setup();
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    await user.click(await screen.findByRole("radio", { name: /^Aesthetic/ }));
    await screen.findByRole("heading", { name: "Keluhan atau treatment yang diinginkan kali ini?" });
    expect(window.location.hash).toBe(`#${CODE}`);
    act(() => window.history.back());
    expect(await screen.findByRole("heading", { name: "Apa yang ingin Anda konsultasikan?" })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#${CODE}`);
  });

  it("jawaban dan layar terakhir kembali setelah halaman dimuat ulang", async () => {
    seedDraft(aestheticReturningPatient, "P1");
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Keluhan atau treatment yang diinginkan kali ini?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Jawaban Anda")).toHaveValue(aestheticReturningPatient.returning.story);
  });

  it("draf dengan jenis kuis yang sudah tidak cocok dibuang", async () => {
    seedDraft(slimmingNewPatient, "D");
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Apa yang ingin Anda konsultasikan?" })).toBeInTheDocument();
  });

  it("data diri hanya menanyakan kolom yang kosong; persetujuan biaya hanya bila perlu", async () => {
    seedDraft(aestheticReturningPatient, "D");
    const { unmount } = render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    expect(await screen.findByLabelText("Tanggal lahir")).toBeInTheDocument();
    expect(screen.getByLabelText("Pekerjaan")).toBeInTheDocument();
    expect(screen.queryByLabelText("Alamat")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Jenis kelamin" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nama lengkap")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mentransfer biaya booking Rp 100\.000/ })).toBeInTheDocument();
    unmount();

    render(<QuizLinkFlow code={CODE} page={{ ...PAGE, missing: [], feeConsent: null }} onSubmitted={vi.fn()} />);
    expect(await screen.findByText("Data diri Anda sudah lengkap di klinik.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /mentransfer biaya booking/ })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Kebijakan Privasi/ })).toBeInTheDocument();
  });

  it("Kirim mengirim jawaban, hanya kolom yang ditanyakan, dan persetujuan", async () => {
    vi.mocked(submitQuizLink).mockResolvedValue({ ok: true, data: { state: "SUBMITTED" } });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    seedDraft(aestheticReturningPatient, "D");
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={onSubmitted} />);

    fireEvent.change(await screen.findByLabelText("Tanggal lahir"), { target: { value: "1990-05-17" } });
    await user.type(screen.getByLabelText("Pekerjaan"), "Guru");
    await user.click(screen.getByRole("checkbox", { name: /Kebijakan Privasi/ }));
    await user.click(screen.getByRole("checkbox", { name: /mentransfer biaya booking/ }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(submitQuizLink).toHaveBeenCalledWith({
      code: CODE,
      answers: expect.objectContaining({ patientType: "LAMA", purpose: "AESTHETIC" }),
      identity: { birthDate: "1990-05-17", occupation: "Guru" },
      consentData: true,
      consentFee: true,
      website: "",
    });
    expect(sessionStorage.getItem(linkDraftKey(CODE))).toBeNull();
  });

  it("data diri lengkap: Kirim tanpa kolom data diri apa pun", async () => {
    vi.mocked(submitQuizLink).mockResolvedValue({ ok: true, data: { state: "SUBMITTED" } });
    const user = userEvent.setup();
    seedDraft(aestheticReturningPatient, "D");
    render(<QuizLinkFlow code={CODE} page={{ ...PAGE, missing: [], feeConsent: null }} onSubmitted={vi.fn()} />);
    await user.click(await screen.findByRole("checkbox", { name: /Kebijakan Privasi/ }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));
    await waitFor(() => expect(submitQuizLink).toHaveBeenCalledWith(expect.objectContaining({ identity: {} })));
  });

  it("galat server tampil sebagai toast, dan formulir tetap terbuka", async () => {
    vi.mocked(submitQuizLink).mockResolvedValue({
      ok: false,
      error: "Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp.",
    });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    seedDraft(aestheticReturningPatient, "D");
    render(<QuizLinkFlow code={CODE} page={{ ...PAGE, missing: [], feeConsent: null }} onSubmitted={onSubmitted} />);
    await user.click(await screen.findByRole("checkbox", { name: /Kebijakan Privasi/ }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp."),
    );
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Kirim" })).toBeInTheDocument();
  });
});
```

`tests/unit/components/quiz-link-entry.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuizLinkEntry } from "@/components/pendaftaran/quiz-link-entry";
import { getQuizLinkPage } from "@/server/quiz-link-public";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/quiz-link-public", () => ({ getQuizLinkPage: vi.fn(), submitQuizLink: vi.fn() }));

const CODE = "cmupobz6200022ovuddaolzdc.AAAAAAAAAAAAAAAAAAAAAA";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, "", `/isi#${CODE}`);
});

describe("QuizLinkEntry", () => {
  it("membaca kode dari bagian # lalu menampilkan kuis", async () => {
    vi.mocked(getQuizLinkPage).mockResolvedValue({
      ok: true,
      data: {
        state: "OPEN",
        firstName: "Maria",
        serviceName: "Konsultasi Dokter",
        startAt: new Date("2026-10-05T03:00:00Z"),
        staffName: "dr. Diane",
        branchName: "SunDY Mahakeret",
        kind: "LENGKAP",
        missing: [],
        feeConsent: null,
      },
    });
    render(<QuizLinkEntry />);
    expect(await screen.findByText("Halo Maria")).toBeInTheDocument();
    expect(getQuizLinkPage).toHaveBeenCalledWith(CODE);
  });

  it("link tidak berlaku: pesan dan tombol WhatsApp klinik", async () => {
    vi.mocked(getQuizLinkPage).mockResolvedValue({ ok: true, data: { state: "CLOSED" } });
    render(<QuizLinkEntry />);
    expect(await screen.findByRole("heading", { name: "Link ini sudah tidak berlaku" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hubungi via WhatsApp" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/wa\.me\/6285172228900\?text=/),
    );
  });

  it("kuis sudah dikirim: terima kasih", async () => {
    vi.mocked(getQuizLinkPage).mockResolvedValue({ ok: true, data: { state: "SUBMITTED" } });
    render(<QuizLinkEntry />);
    expect(await screen.findByRole("heading", { name: "Terima kasih, sudah kami terima" })).toBeInTheDocument();
  });

  it("tanpa kode: langsung tidak berlaku, tanpa memanggil server", async () => {
    window.history.replaceState(null, "", "/isi");
    render(<QuizLinkEntry />);
    expect(await screen.findByRole("heading", { name: "Link ini sudah tidak berlaku" })).toBeInTheDocument();
    expect(getQuizLinkPage).not.toHaveBeenCalled();
  });

  it("server menolak (mis. terlalu sering): pesan gagal memuat", async () => {
    vi.mocked(getQuizLinkPage).mockResolvedValue({ ok: false, error: "Terlalu banyak percobaan." });
    render(<QuizLinkEntry />);
    expect(await screen.findByText(/Halaman gagal dimuat/)).toBeInTheDocument();
  });
});
```

`tests/unit/robots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("robots.txt", () => {
  it("menutup panel admin dan halaman link kuis dari mesin pencari", () => {
    expect(robots().rules).toMatchObject({ disallow: ["/admin", "/isi"] });
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/quiz-link-flow.test.tsx tests/unit/components/quiz-link-entry.test.tsx tests/unit/robots.test.ts`
Expected: FAIL. Komponen belum ada, dan `/isi` belum ditutup di robots.

- [ ] **Step 3: Tulis `src/components/pendaftaran/link-identity-step.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Segmented } from "@/components/kuis/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { validateLinkIdentity, type IdentityField, type LinkIdentity } from "@/lib/kuis/identity";
import { BOOKING_FEE_TERMS } from "@/lib/payment";
import { witaDateString } from "@/lib/time";

export type LinkIdentityDraft = {
  birthDate: string;
  gender: "" | "L" | "P";
  occupation: string;
  address: string;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan untuk bot. */
  website: string;
};

export const EMPTY_LINK_IDENTITY: LinkIdentityDraft = {
  birthDate: "",
  gender: "",
  occupation: "",
  address: "",
  consentData: false,
  consentFee: false,
  website: "",
};

/** Hanya kolom yang ditanyakan yang dikirim; data pasien yang terisi tidak boleh ditimpa (spec C3 3.3). */
export function linkIdentityPayload(draft: LinkIdentityDraft, missing: readonly IdentityField[]): LinkIdentity {
  const payload: LinkIdentity = {};
  if (missing.includes("birthDate")) payload.birthDate = draft.birthDate;
  if (missing.includes("gender") && draft.gender) payload.gender = draft.gender;
  if (missing.includes("occupation")) payload.occupation = draft.occupation;
  if (missing.includes("address")) payload.address = draft.address;
  return payload;
}

export function linkIdentityError(
  draft: LinkIdentityDraft,
  missing: readonly IdentityField[],
  feeConsent: { bookingFee: number } | null,
): string | null {
  const checked = validateLinkIdentity(linkIdentityPayload(draft, missing), missing);
  if (!checked.ok) return checked.message;
  if (!draft.consentData) return "Centang persetujuan data untuk melanjutkan.";
  if (feeConsent && !draft.consentFee) return "Centang persetujuan biaya booking untuk melanjutkan.";
  return null;
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

/** Langkah terakhir halaman link: kolom data diri yang kosong saja, lalu persetujuan (spec C3 3.2). */
export function LinkIdentityStep({
  missing,
  feeConsent,
  value,
  onChange,
}: {
  missing: readonly IdentityField[];
  feeConsent: { bookingFee: number } | null;
  value: LinkIdentityDraft;
  onChange: (next: LinkIdentityDraft) => void;
}) {
  const set = <K extends keyof LinkIdentityDraft>(key: K, next: LinkIdentityDraft[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      {missing.length === 0 && <p className="text-sm text-brown-600">Data diri Anda sudah lengkap di klinik.</p>}
      {missing.includes("birthDate") && (
        <Field label="Tanggal lahir">
          {(id) => (
            <Input
              id={id}
              type="date"
              max={witaDateString(new Date())}
              value={value.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
            />
          )}
        </Field>
      )}
      {missing.includes("gender") && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Jenis kelamin</p>
          <Segmented
            label="Jenis kelamin"
            options={[
              { value: "P", label: "Perempuan" },
              { value: "L", label: "Laki-laki" },
            ]}
            value={value.gender || undefined}
            onChange={(gender) => set("gender", gender)}
          />
        </div>
      )}
      {missing.includes("occupation") && (
        <Field label="Pekerjaan">
          {(id) => <Input id={id} value={value.occupation} onChange={(e) => set("occupation", e.target.value)} />}
        </Field>
      )}
      {missing.includes("address") && (
        <Field label="Alamat">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              maxLength={200}
              value={value.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-base"
            />
          )}
        </Field>
      )}

      <label className="flex items-start gap-2 text-sm text-brown-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.consentData}
          onChange={(e) => set("consentData", e.target.checked)}
        />
        <span>
          Saya setuju data saya, termasuk jawaban kesehatan, dipakai untuk pelayanan di SunDY Clinic sesuai{" "}
          <Link href="/kebijakan-privasi" target="_blank" className="underline underline-offset-4">
            Kebijakan Privasi
          </Link>
          .
        </span>
      </label>
      {feeConsent && (
        <label className="flex items-start gap-2 text-sm text-brown-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={value.consentFee}
            onChange={(e) => set("consentFee", e.target.checked)}
          />
          <span>
            Saya akan mentransfer biaya booking {formatRupiah(feeConsent.bookingFee)}. {BOOKING_FEE_TERMS}
          </span>
        </label>
      )}

      {/* Kolom jebakan: tersembunyi dari manusia dan pembaca layar, diisi bot. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Situs web
          <input
            tabIndex={-1}
            autoComplete="off"
            name="website"
            value={value.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Tulis `src/components/pendaftaran/quiz-link-flow.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { QuizScreen } from "@/components/kuis/quiz-screen";
import { AUTO_ADVANCE_STEPS, QuizStep, type AnswerPatch } from "@/components/kuis/quiz-step";
import { formatScheduleForMessage } from "@/lib/format";
import type { QuizAnswers } from "@/lib/kuis/v2/answers";
import { QUIZ_VERSION } from "@/lib/kuis/v2/options";
import { pruneAnswers, stepError, visibleSteps, type StepId } from "@/lib/kuis/v2/steps";
import { stepText } from "@/lib/kuis/v2/texts";
import { patientTypeForKind, type QuizLinkPage } from "@/lib/quiz-link";
import { submitQuizLink } from "@/server/quiz-link-public";
import {
  EMPTY_LINK_IDENTITY,
  LinkIdentityStep,
  linkIdentityError,
  linkIdentityPayload,
  type LinkIdentityDraft,
} from "./link-identity-step";
import { SummaryStep } from "./summary-step";

type OpenPage = Extract<QuizLinkPage, { state: "OPEN" }>;
type Screen = StepId | "R" | "D";
type Draft = { answers: QuizAnswers; screen: Screen; identity: LinkIdentityDraft };
/** Layar disimpan di riwayat browser agar tombol Kembali ponsel mundur satu pertanyaan, seperti /daftar. */
type HistoryState = { isi?: Screen; depth?: number } | null;

/** Jenis kuis sudah ditentukan sistem, jadi "Pernah konsultasi?" (U1) tidak ditanyakan (spec C3 3.2). */
const MODE = { askPatientType: false };

/** Draf per tab dan per booking (sessionStorage), terhapus setelah Kirim. */
export function linkDraftKey(code: string): string {
  return `sundy-isi-v${QUIZ_VERSION}-${code.split(".")[0]}`;
}

function screensFor(answers: QuizAnswers): Screen[] {
  return [...visibleSteps(answers, MODE), "R", "D"];
}

function emptyDraft(page: OpenPage): Draft {
  return { answers: { patientType: patientTypeForKind(page.kind) }, screen: "U2", identity: EMPTY_LINK_IDENTITY };
}

function readDraft(key: string, page: OpenPage): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    // Jenis kuis bisa berubah sejak draf disimpan (mis. isian lengkap dari booking lain): mulai ulang.
    return draft.answers?.patientType === patientTypeForKind(page.kind) ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(key, JSON.stringify(draft));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Mode privat atau penyimpanan penuh: kuis tetap jalan, hanya tidak bertahan saat dimuat ulang.
  }
}

/** Kuis v2 untuk booking yang dicatat admin, tanpa layanan dan jadwal (spec C3 bagian 3). */
export function QuizLinkFlow({
  code,
  page,
  onSubmitted,
}: {
  code: string;
  page: OpenPage;
  onSubmitted: () => void;
}) {
  const key = linkDraftKey(code);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(page));
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  // Pulihkan draf setelah hidrasi — server tidak tahu isi sessionStorage.
  // replaceState/pushState tanpa URL mempertahankan URL sekarang, termasuk kode setelah "#".
  useEffect(() => {
    const saved = readDraft(key, page);
    const initial = saved ?? emptyDraft(page);
    if (saved) setDraft(saved);
    window.history.replaceState({ isi: initial.screen, depth: 0 }, "");
    setReady(true);
  }, [key, page]);

  useEffect(() => {
    if (ready) writeDraft(key, draft);
  }, [key, draft, ready]);

  useEffect(() => {
    function onPop(event: PopStateEvent) {
      const screen = (event.state as HistoryState)?.isi;
      if (screen) setDraft((d) => ({ ...d, screen }));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const screens = useMemo(() => screensFor(draft.answers), [draft.answers]);
  const index = Math.max(0, screens.indexOf(draft.screen));
  const screen = screens[index];

  function goTo(next: Screen) {
    const depth = ((window.history.state as HistoryState)?.depth ?? 0) + 1;
    window.history.pushState({ isi: next, depth }, "");
    setDraft((d) => ({ ...d, screen: next }));
    topRef.current?.scrollIntoView?.({ block: "start" });
  }

  function goBack() {
    if (((window.history.state as HistoryState)?.depth ?? 0) > 0) {
      window.history.back();
      return;
    }
    const previous = screens[index - 1];
    if (!previous) return;
    window.history.replaceState({ isi: previous, depth: 0 }, "");
    setDraft((d) => ({ ...d, screen: previous }));
  }

  function change(patch: AnswerPatch) {
    setDraft((d) => ({ ...d, answers: patch(d.answers) }));
  }

  function choose(patch: AnswerPatch) {
    const answers = patch(draft.answers);
    const nextScreens = screensFor(answers);
    const next = nextScreens[nextScreens.indexOf(screen) + 1];
    setDraft((d) => ({ ...d, answers }));
    if (next) goTo(next);
  }

  function submit() {
    startTransition(async () => {
      try {
        const result = await submitQuizLink({
          code,
          answers: pruneAnswers(draft.answers),
          identity: linkIdentityPayload(draft.identity, page.missing),
          consentData: draft.identity.consentData,
          consentFee: draft.identity.consentFee,
          website: draft.identity.website,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        writeDraft(key, null);
        onSubmitted();
      } catch {
        toast.error("Form gagal dikirim. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  if (!ready) return <p className="px-4 py-16 text-center text-brown-600">Memuat…</p>;

  const common = { progress: (index + 1) / screens.length, onBack: index > 0 ? goBack : undefined };
  let content: ReactNode;

  if (screen === "R") {
    content = (
      <QuizScreen
        key="R"
        title="Ringkasan jawaban Anda"
        hint="Periksa sekali lagi. Ketuk “Ubah” untuk memperbaiki."
        {...common}
        onNext={() => goTo("D")}
      >
        <SummaryStep answers={draft.answers} onEdit={goTo} />
      </QuizScreen>
    );
  } else if (screen === "D") {
    content = (
      <QuizScreen
        key="D"
        title={page.missing.length > 0 ? "Terakhir, data diri Anda" : "Terakhir, persetujuan Anda"}
        {...common}
        error={linkIdentityError(draft.identity, page.missing, page.feeConsent)}
        onNext={submit}
        nextLabel="Kirim"
        pending={pending}
      >
        <LinkIdentityStep
          missing={page.missing}
          feeConsent={page.feeConsent}
          value={draft.identity}
          onChange={(identity) => setDraft((d) => ({ ...d, identity }))}
        />
      </QuizScreen>
    );
  } else {
    const text = stepText(screen, draft.answers);
    const auto = AUTO_ADVANCE_STEPS.includes(screen);
    content = (
      <QuizScreen
        key={screen}
        title={text.title}
        hint={text.hint}
        {...common}
        error={stepError(screen, draft.answers)}
        onNext={auto ? undefined : () => goTo(screens[index + 1])}
      >
        <QuizStep step={screen} answers={draft.answers} onChange={change} onChoose={choose} />
      </QuizScreen>
    );
  }

  return (
    <div ref={topRef}>
      <header className="mx-auto max-w-md px-4 pt-8 text-center">
        <p className="font-display text-2xl text-brown-900">Halo {page.firstName}</p>
        <p className="mt-1 text-sm text-brown-700">
          {page.serviceName} · {formatScheduleForMessage(page.startAt)}
        </p>
        <p className="text-sm text-brown-600">
          {page.staffName} · {page.branchName}
        </p>
      </header>
      {content}
    </div>
  );
}
```

- [ ] **Step 5: Tulis `quiz-link-notice.tsx` dan `quiz-link-entry.tsx`**

`src/components/pendaftaran/quiz-link-notice.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/whatsapp";

/** Halaman /isi untuk link yang sudah dikirim atau tidak berlaku (spec C3 3.1). Pesannya sama untuk semua alasan. */
export function QuizLinkNotice({ state }: { state: "SUBMITTED" | "CLOSED" }) {
  if (state === "SUBMITTED") {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-brown-900">Terima kasih, sudah kami terima</h1>
        <p className="text-brown-700">Jawaban Anda hanya dibaca dokter kami. Sampai jumpa di klinik.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="font-display text-3xl text-brown-900">Link ini sudah tidak berlaku</h1>
      <p className="text-brown-700">Hubungi kami lewat WhatsApp bila Anda masih ingin mengisi form.</p>
      <Button asChild size="lg" className="h-12 w-full rounded-full text-base">
        <a
          href={buildWhatsAppLink("Halo SunDY Clinic, link form saya sudah tidak berlaku.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Hubungi via WhatsApp
        </a>
      </Button>
    </div>
  );
}
```

`src/components/pendaftaran/quiz-link-entry.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { QuizLinkPage } from "@/lib/quiz-link";
import { getQuizLinkPage } from "@/server/quiz-link-public";
import { QuizLinkFlow } from "./quiz-link-flow";
import { QuizLinkNotice } from "./quiz-link-notice";

type Loaded = { code: string; page: QuizLinkPage } | { failed: true };

/**
 * Membaca kode dari bagian "#" URL — bagian itu tidak pernah dikirim browser ke
 * server — lalu memuat isi halaman lewat aksi server (spec C3 3.1).
 */
export function QuizLinkEntry() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const code = decodeURIComponent(window.location.hash.slice(1)).trim();
    if (!code) {
      setLoaded({ code: "", page: { state: "CLOSED" } });
      return;
    }
    let current = true;
    getQuizLinkPage(code)
      .then((result) => {
        if (current) setLoaded(result.ok ? { code, page: result.data } : { failed: true });
      })
      .catch(() => {
        if (current) setLoaded({ failed: true });
      });
    return () => {
      current = false;
    };
  }, []);

  if (!loaded) return <p className="px-4 py-16 text-center text-brown-600">Memuat…</p>;
  if ("failed" in loaded) {
    return (
      <p className="px-4 py-16 text-center text-brown-700">
        Halaman gagal dimuat. Periksa koneksi lalu muat ulang halaman ini.
      </p>
    );
  }
  if (loaded.page.state === "OPEN") {
    return (
      <QuizLinkFlow
        code={loaded.code}
        page={loaded.page}
        onSubmitted={() => setLoaded({ code: loaded.code, page: { state: "SUBMITTED" } })}
      />
    );
  }
  return <QuizLinkNotice state={loaded.page.state} />;
}
```

- [ ] **Step 6: Rute `/isi` dan robots.txt**

`src/app/(public)/isi/page.tsx`:

```tsx
import type { Metadata } from "next";
import { QuizLinkEntry } from "@/components/pendaftaran/quiz-link-entry";

export const metadata: Metadata = {
  title: "Isi Form Sebelum Konsultasi",
  robots: { index: false, follow: false },
};

/** Halaman statis: kode ada di bagian "#" dan hanya dibaca browser (spec C3 3.1). */
export default function QuizLinkPage() {
  return <QuizLinkEntry />;
}
```

Di `src/app/robots.ts`, ganti `disallow: ["/admin"],` menjadi:

```ts
      // /isi: link kuis pribadi untuk booking yang dicatat admin (spec C3 bagian 6).
      disallow: ["/admin", "/isi"],
```

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/quiz-link-flow.test.tsx tests/unit/components/quiz-link-entry.test.tsx tests/unit/robots.test.ts tests/unit/components/registration-flow.test.tsx tests/unit/architecture.test.ts`
Expected: PASS. Uji `/daftar` tetap lulus.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 8: Commit**

```bash
git add src/components/pendaftaran/link-identity-step.tsx src/components/pendaftaran/quiz-link-flow.tsx src/components/pendaftaran/quiz-link-notice.tsx src/components/pendaftaran/quiz-link-entry.tsx "src/app/(public)/isi/page.tsx" src/app/robots.ts tests/unit/components/quiz-link-flow.test.tsx tests/unit/components/quiz-link-entry.test.tsx tests/unit/robots.test.ts
git commit -m "feat: add the /isi page where customers fill the quiz from their link"
```

---

### Task 7: Dialog "Link kuis" dan tanda "Belum punya isian lengkap"

**Files:**
- Modify: `package.json`, `package-lock.json` (`qrcode`, `@types/qrcode`)
- Create: `src/components/admin/quiz-link-dialog.tsx`
- Modify: `src/components/admin/booking-dialogs.tsx` (`openQuizLink`)
- Modify: `src/lib/booking-actions.ts` (`QUIZ_LINK`)
- Modify: `src/components/admin/appointment-table.tsx` (`BookingRow.quizLink`, `needsFullIntake`; aksi; tanda)
- Modify: `src/server/appointment.ts` (`BOOKING_LIST_INCLUDE.patient.intakes`), `src/app/(admin)/admin/booking/page.tsx` (`toRow`)
- Modify: `src/server/intake.ts` (`IntakeDetail.needsFullIntake`), `src/components/admin/intake-view.tsx` (tanda)
- Test: `tests/unit/components/quiz-link-dialog.test.tsx` (baru), `tests/unit/booking-actions.test.ts` (tambah), `tests/unit/components/appointment-table.test.tsx` (fixture + tambah), `tests/unit/components/intake-view.test.tsx` (fixture + tambah), `tests/integration/quiz-link-admin.test.ts` (tambah)

**Interfaces:**
- Consumes:
  - dari Task 4: `getQuizLink`, `rotateQuizLink`, `QuizLinkInfo`;
  - dari Task 2: `quizLinkFor`;
  - dari Task 3: `hasCompletedFullIntake`;
  - dari C2: `WhatsAppSendButton`, `BookingDialogsProvider`.
- Produces:
  - `QuizLinkTarget = { appointmentId; code; patientName }`, `QuizLinkDialog({ target, open, onOpenChange })`
  - `useBookingDialogs().openQuizLink(target)`
  - `BookingAction` + `"QUIZ_LINK"` (label "Link kuis"), menjadi item pertama menu bila `row.quizLink`
  - `BookingRow` + `quizLink: string | null`, `needsFullIntake: boolean`; `intakeStatus` menjadi `MENUNGGU_DIISI` untuk booking admin yang linknya berlaku walau belum ada baris isian
  - `IntakeDetail` + `needsFullIntake: boolean`

- [ ] **Step 1: Pasang pustaka QR**

Run: `npm install qrcode && npm install -D @types/qrcode`
Expected: `package.json` memuat `qrcode` di `dependencies` dan `@types/qrcode` di `devDependencies`.

- [ ] **Step 2: Tulis uji yang gagal**

`tests/unit/components/quiz-link-dialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuizLinkDialog } from "@/components/admin/quiz-link-dialog";
import { recordAppointmentMessage } from "@/server/appointment-message";
import { getQuizLink, rotateQuizLink } from "@/server/quiz-link-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/quiz-link-admin", () => ({ getQuizLink: vi.fn(), rotateQuizLink: vi.fn() }));
vi.mock("@/server/appointment-message", () => ({ recordAppointmentMessage: vi.fn() }));

const SCHEDULE = new Date("2026-10-05T03:00:00Z");
const INFO = {
  url: "https://sundyclinic.com/isi#kode-lama",
  message: { text: "Halo Budi, ini SunDY Clinic.", link: "https://wa.me/6281234567001?text=Halo" },
  scheduledFor: SCHEDULE,
};
const TARGET = { appointmentId: "a1", code: "SDY-WALK", patientName: "Budi Walkin" };

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<QuizLinkDialog target={TARGET} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getQuizLink).mockResolvedValue({ ok: true, data: INFO });
  vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m1" } });
});

describe("QuizLinkDialog (spec C3 4.2)", () => {
  it("QR, buka di perangkat ini, dan salin link", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Link kuis — SDY-WALK" })).toHaveTextContent("Budi Walkin");
    const qr = await screen.findByRole("img", { name: "QR link kuis" });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    const open = screen.getByRole("link", { name: "Buka di perangkat ini" });
    expect(open).toHaveAttribute("href", INFO.url);
    expect(open).toHaveAttribute("target", "_blank");
    await user.click(screen.getByRole("button", { name: "Salin link" }));
    expect(await navigator.clipboard.readText()).toBe(INFO.url);
    expect(getQuizLink).toHaveBeenCalledWith("a1");
  });

  it("Kirim link via WA mencatat LINK_KUIS dengan jadwal yang tertulis", async () => {
    renderDialog();
    const send = await screen.findByRole("link", { name: "Kirim link via WA" });
    expect(send).toHaveAttribute("href", INFO.message.link);
    send.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(send);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "a1", kind: "LINK_KUIS", scheduledFor: SCHEDULE }),
    );
  });

  it("Ganti link meminta konfirmasi lalu menampilkan link baru", async () => {
    vi.mocked(rotateQuizLink).mockResolvedValue({ ok: true, data: { ...INFO, url: "https://sundyclinic.com/isi#kode-baru" } });
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Ganti link" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Link lama langsung tidak berlaku");
    expect(rotateQuizLink).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ganti" }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Buka di perangkat ini" })).toHaveAttribute(
        "href",
        "https://sundyclinic.com/isi#kode-baru",
      ),
    );
    expect(rotateQuizLink).toHaveBeenCalledWith("a1");
  });

  it("link tidak tersedia: keterangan, tanpa tombol", async () => {
    vi.mocked(getQuizLink).mockResolvedValue({ ok: true, data: null });
    renderDialog();
    expect(await screen.findByText(/Link kuis tidak tersedia/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ganti link" })).not.toBeInTheDocument();
  });
});
```

Tambahkan ke `tests/unit/booking-actions.test.ts`:

```ts
describe("bookingRowActions link kuis (spec C3 4.2)", () => {
  it("link kuis yang berlaku menjadi item pertama di menu", () => {
    expect(bookingRowActions({ ...waiting, quizLink: "https://x/isi#a" }, true).menu[0]).toBe("QUIZ_LINK");
    expect(
      bookingRowActions({ ...waiting, source: "WALK_IN", transferInstruction: null, quizLink: "https://x/isi#a" }, true),
    ).toEqual({ primary: ["ATTEND", "VERIFY"], menu: ["QUIZ_LINK", "NO_SHOW", "RESCHEDULE", "CANCEL"] });
  });

  it("tanpa link kuis: tidak ada di menu", () => {
    expect(bookingRowActions(waiting, true).menu).not.toContain("QUIZ_LINK");
    expect(bookingRowActions({ ...waiting, quizLink: null }, true).menu).not.toContain("QUIZ_LINK");
  });
});
```

Di `tests/unit/components/appointment-table.test.tsx`:
- tambahkan mock:

```tsx
vi.mock("@/server/quiz-link-admin", () => ({
  getQuizLink: vi.fn().mockResolvedValue({ ok: true, data: null }),
  rotateQuizLink: vi.fn(),
}));
```

- tambahkan `quizLink: null,` dan `needsFullIntake: false,` ke fixture `base`;
- tambahkan di akhir berkas:

```tsx
describe("AppointmentTable link kuis (spec C3)", () => {
  it("Link kuis dari menu membuka dialog untuk booking itu", async () => {
    const user = userEvent.setup();
    renderTable([{ ...waRow, quizLink: "https://sundyclinic.com/isi#x" }]);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Link kuis" }));
    expect(await screen.findByRole("dialog", { name: "Link kuis — SDY-WA01" })).toBeInTheDocument();
  });

  it("booking situs dari pasien tanpa isian lengkap diberi tanda", () => {
    renderTable([{ ...base, needsFullIntake: true }]);
    expect(screen.getByText("Belum punya isian lengkap")).toBeInTheDocument();
  });
});
```

Di `tests/unit/components/intake-view.test.tsx`:
- tambahkan `needsFullIntake: false,` ke fixture `intake`;
- tambahkan di dalam `describe("IntakeView", …)`:

```tsx
  it("menandai kuis pendek dari pasien yang belum punya isian lengkap", () => {
    render(<IntakeView intake={{ ...intake, needsFullIntake: true }} />);
    expect(screen.getByText("Belum punya isian lengkap")).toBeInTheDocument();
  });
```

Tambahkan ke `tests/integration/quiz-link-admin.test.ts`, di akhir blok `describe` utama:

```ts
  it("halaman isian menandai booking situs berkuis pendek dari pasien tanpa isian lengkap", async () => {
    const { getIntakeForStaff } = await import("@/server/intake");
    const site = await prisma.appointment.create({
      data: {
        code: "LKA-SITUS",
        type: "KONSULTASI",
        startAt: new Date(base + 300 * HOUR),
        endAt: new Date(base + 300 * HOUR + 30 * 60 * 1000),
        source: "SITUS",
        status: "MENUNGGU_KONFIRMASI",
        branchId,
        staffId,
        patientId,
      },
    });
    const intake = await prisma.intake.create({
      data: { appointmentId: site.id, patientId, status: "TERISI", kind: "PENDEK", submittedAt: new Date() },
    });
    expect((await getIntakeForStaff(intake.id))!.needsFullIntake).toBe(true);

    const earlier = await booking("SELESAI");
    await prisma.intake.create({
      data: { appointmentId: earlier.id, patientId, status: "TERISI", kind: "LENGKAP", submittedAt: new Date() },
    });
    expect((await getIntakeForStaff(intake.id))!.needsFullIntake).toBe(false);
  });
```

- [ ] **Step 3: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/quiz-link-dialog.test.tsx tests/unit/booking-actions.test.ts tests/unit/components/appointment-table.test.tsx tests/unit/components/intake-view.test.tsx && npm run test:integration -- tests/integration/quiz-link-admin.test.ts`
Expected: FAIL.
- Dialog belum ada.
- `QUIZ_LINK` belum ada.
- Tanda "Belum punya isian lengkap" belum tampil.
- `needsFullIntake` belum diisi.

- [ ] **Step 4: Tulis `src/components/admin/quiz-link-dialog.tsx`**

```tsx
"use client";

import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getQuizLink, rotateQuizLink, type QuizLinkInfo } from "@/server/quiz-link-admin";
import { WhatsAppSendButton } from "./whatsapp-send-button";

export type QuizLinkTarget = { appointmentId: string; code: string; patientName: string };

/**
 * Link kuis sebuah booking (spec C3 4.2): QR untuk dipindai HP pasien, buka di
 * tablet klinik, kirim lewat WA, salin, atau ganti link. QR dibuat di browser,
 * jadi link tidak dikirim ke layanan luar.
 */
export function QuizLinkDialog({
  target,
  open,
  onOpenChange,
}: {
  target: QuizLinkTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // undefined = masih dimuat; null = link tidak tersedia.
  const [info, setInfo] = useState<QuizLinkInfo | null | undefined>(undefined);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    getQuizLink(target.appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          toast.error(result.error);
          setInfo(null);
          return;
        }
        setInfo(result.data);
      })
      .catch(() => {
        if (!current) return;
        toast.error("Link kuis gagal dimuat. Coba lagi.");
        setInfo(null);
      });
    return () => {
      current = false;
    };
  }, [target.appointmentId]);

  const url = info?.url;
  useEffect(() => {
    if (!url) return;
    let current = true;
    QRCode.toString(url, { type: "svg", margin: 1 })
      .then((svg) => {
        if (current) setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (current) setQr(null);
      });
    return () => {
      current = false;
    };
  }, [url]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin link secara manual.");
    }
  }

  function rotate() {
    setConfirmRotate(false);
    startTransition(async () => {
      try {
        const result = await rotateQuizLink(target.appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setInfo(result.data);
        toast.success("Link baru dibuat. Link lama tidak berlaku lagi.");
      } catch {
        toast.error("Gagal mengganti link. Coba lagi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Link kuis — {target.code}</DialogTitle>
          <DialogDescription>{target.patientName}</DialogDescription>
        </DialogHeader>

        {info === undefined ? (
          <p className="text-sm text-muted-foreground">Memuat link…</p>
        ) : info === null ? (
          <p className="text-sm text-muted-foreground">
            Link kuis tidak tersedia: kuisnya sudah diisi, atau booking tidak aktif lagi.
          </p>
        ) : (
          <div className="space-y-2">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI SVG buatan browser, bukan gambar dari server
              <img src={qr} alt="QR link kuis" className="mx-auto size-56 rounded-md border bg-white p-2" />
            )}
            <Button asChild variant="outline" className="w-full">
              <a href={info.url} target="_blank" rel="noopener noreferrer">
                Buka di perangkat ini
              </a>
            </Button>
            {info.message.link ? (
              <WhatsAppSendButton
                href={info.message.link}
                appointmentId={target.appointmentId}
                kind="LINK_KUIS"
                scheduledFor={info.scheduledFor}
                className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
              >
                Kirim link via WA
              </WhatsAppSendButton>
            ) : (
              <p className="text-sm text-muted-foreground">Nomor WhatsApp pasien tidak dikenali.</p>
            )}
            <Button type="button" variant="outline" className="w-full" onClick={() => void copy(info.url)}>
              Salin link
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-destructive"
              disabled={pending}
              onClick={() => setConfirmRotate(true)}
            >
              Ganti link
            </Button>
          </div>
        )}

        <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ganti link kuis?</AlertDialogTitle>
              <AlertDialogDescription>
                Link lama langsung tidak berlaku. Kirim link baru ke pasien setelah ini.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Kembali</AlertDialogCancel>
              <AlertDialogAction onClick={rotate}>Ganti</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: `openQuizLink` di `src/components/admin/booking-dialogs.tsx`**

Tambahkan impor:

```ts
import { QuizLinkDialog, type QuizLinkTarget } from "./quiz-link-dialog";
```

Tambahkan ke tipe `BookingDialogs`:

```ts
  /** Dialog "Link kuis" (spec C3 4.2). */
  openQuizLink: (target: QuizLinkTarget) => void;
```

Tambahkan state di `BookingDialogsProvider`:

```ts
  const [quizLink, setQuizLink] = useState<QuizLinkTarget | null>(null);
```

Tambahkan `openQuizLink: setQuizLink,` ke objek `useMemo` (setelah `openReschedule: setReschedule,`). Lalu tambahkan sebelum penutup `</BookingDialogsContext.Provider>`:

```tsx
      {quizLink && (
        <QuizLinkDialog
          key={quizLink.appointmentId}
          target={quizLink}
          open
          onOpenChange={(open) => {
            if (!open) setQuizLink(null);
          }}
        />
      )}
```

- [ ] **Step 6: Aksi `QUIZ_LINK` di `src/lib/booking-actions.ts`**

- Tambahkan `| "QUIZ_LINK"` ke union `BookingAction`, dan `QUIZ_LINK: "Link kuis",` ke `BOOKING_ACTION_LABEL`.
- Tambahkan ke `BookingActionRow`:

```ts
  /** Link kuis yang berlaku (spec C3); null/absen bila kuis sudah diisi, booking situs, atau tidak aktif. */
  quizLink?: string | null;
```

- Ganti nama fungsi `export function bookingRowActions(` yang sekarang menjadi `function baseRowActions(` (badan fungsinya tetap). Pindahkan komentar dokumentasinya ke fungsi baru di bawah ini:

```ts
/**
 * Aksi per baris daftar booking (spec C1 5.2): paling banyak dua terlihat,
 * sisanya di menu ⋯. Hadir dan Tidak hadir tetap ada di menu untuk booking
 * yang belum diverifikasi, seperti sebelumnya: pasien kadang datang sebelum
 * bukti transfernya diperiksa. Pindah jadwal (spec C2 bagian 5) selalu tepat
 * sebelum Batalkan. "Link kuis" (spec C3 4.2) menjadi item pertama selama linknya berlaku.
 */
export function bookingRowActions(
  row: BookingActionRow,
  canReadRecords: boolean,
): { primary: BookingAction[]; menu: BookingAction[] } {
  const actions = baseRowActions(row, canReadRecords);
  return row.quizLink ? { ...actions, menu: ["QUIZ_LINK", ...actions.menu] } : actions;
}
```

- [ ] **Step 7: Tabel booking dan halaman booking**

`src/components/admin/appointment-table.tsx`:
- Tambahkan ke tipe `BookingRow` setelah `reschedule: RescheduleTarget;`:

```ts
  /** Link kuis yang berlaku (spec C3), atau null. */
  quizLink: string | null;
  /** Booking situs berkuis pendek dari pasien yang belum punya isian lengkap (spec C3 4.3). */
  needsFullIntake: boolean;
```

- Di `actionTarget`, tambahkan setelah cabang `case "RESCHEDULE":`:

```ts
      case "QUIZ_LINK":
        return {
          onSelect: () =>
            dialogs.openQuizLink({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
```

- Di sel Pasien, tambahkan setelah badge "Belum dicocokkan":

```tsx
                  {row.needsFullIntake && (
                    <Badge variant="outline" className="mt-1">
                      Belum punya isian lengkap
                    </Badge>
                  )}
```

`src/server/appointment.ts`: ganti baris `patient` di `BOOKING_LIST_INCLUDE` menjadi:

```ts
  patient: {
    select: {
      id: true,
      name: true,
      medicalRecordNumber: true,
      whatsapp: true,
      // Hanya id: cukup untuk tanda "Belum punya isian lengkap" (spec C3 4.3), tanpa jawaban klinis.
      intakes: { where: { kind: "LENGKAP", status: { in: ["TERISI", "DIPERIKSA"] } }, select: { id: true }, take: 1 },
    },
  },
```

`src/app/(admin)/admin/booking/page.tsx`, di objek yang dikembalikan `toRow`:
- ganti `intakeStatus: a.intake?.status ?? null,` menjadi:

```ts
    // Booking admin yang linknya berlaku belum tentu punya baris isian: tetap "Isian: belum diisi" (spec C3 4.3).
    intakeStatus: a.intake?.status ?? (quizLink ? "MENUNGGU_DIISI" : null),
```

- tambahkan setelah `reschedule: { … },`:

```ts
    quizLink,
    needsFullIntake:
      a.source === "SITUS" && a.intake?.kind === "PENDEK" && patient !== null && patient.intakes.length === 0,
```

- [ ] **Step 8: Tanda di halaman isian**

`src/server/intake.ts`:
- tambahkan impor `import { hasCompletedFullIntake } from "@/server/quiz-link-store";`;
- tambahkan ke tipe `IntakeDetail` setelah `kind`:

```ts
  /** Kuis pendek dari pasien yang belum punya isian lengkap (spec C3 4.3). */
  needsFullIntake: boolean;
```

- di `getIntakeForStaff`, tambahkan sebelum `return {`:

```ts
  const needsFullIntake =
    row.kind === "PENDEK" && row.patient !== null && !(await hasCompletedFullIntake(row.patient.id));
```

- tambahkan `needsFullIntake,` ke objek yang dikembalikan, setelah `kind: row.kind,`.

`src/components/admin/intake-view.tsx`: tambahkan setelah badge "Kuis lengkap/pendek":

```tsx
          {intake.needsFullIntake && <Badge variant="outline">Belum punya isian lengkap</Badge>}
```

- [ ] **Step 9: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/quiz-link-dialog.test.tsx tests/unit/booking-actions.test.ts tests/unit/components/appointment-table.test.tsx tests/unit/components/intake-view.test.tsx && npm run test:integration -- tests/integration/quiz-link-admin.test.ts tests/integration/intake-approval.test.ts tests/integration/intake-access.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: bersih, dan seluruh uji unit lulus.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/components/admin/quiz-link-dialog.tsx src/components/admin/booking-dialogs.tsx src/lib/booking-actions.ts src/components/admin/appointment-table.tsx src/server/appointment.ts "src/app/(admin)/admin/booking/page.tsx" src/server/intake.ts src/components/admin/intake-view.tsx tests/unit/components/quiz-link-dialog.test.tsx tests/unit/booking-actions.test.ts tests/unit/components/appointment-table.test.tsx tests/unit/components/intake-view.test.tsx tests/integration/quiz-link-admin.test.ts
git commit -m "feat: add the quiz link dialog with QR, and flag site bookings from patients without a full intake"
```

---

### Task 8: Uji ujung-ke-ujung dan status spec

**Files:**
- Create: `tests/e2e/link-kuis.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-02-link-kuis-design.md:5`

**Interfaces:**
- Consumes:
  - Booking Baru: `+ Pasien Baru`, "Pilih tanggal lain"/"Tanggal lain", grup "Pilih jam", "Buat Booking", panel "Booking dibuat" dengan tautan "Kirim instruksi transfer via WA" dan "Lihat di daftar";
  - menu ⋯ "Link kuis" dan dialognya ("QR link kuis", "Buka di perangkat ini");
  - halaman `/isi`: "Halo …", kuis v2, "Ringkasan jawaban Anda", "Kirim", "Terima kasih, sudah kami terima";
  - label baris "Isian: belum diisi" dan "Isian: belum diperiksa".

- [ ] **Step 1: Tulis uji e2e**

`tests/e2e/link-kuis.spec.ts`:

```ts
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { choose, fillFormRecall, inGroup, next, signIn, tick, upcomingWeekday } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Satu cerita per proyek: admin mencatat booking WA untuk pasien baru, customer mengisi kuis
// lewat link dari instruksi transfer. Jadwalnya Rabu (desktop) atau Kamis (ponsel) sepekan
// setelah yang dipakai public-registration.spec — hari yang tidak dipakai uji lain.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

function bookingDate(testInfo: TestInfo): string {
  const date = new Date(`${upcomingWeekday(testInfo.project.name === "mobile" ? 4 : 3)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}

test("customer mengisi kuis lewat link dari instruksi transfer", async ({ page, browser }, testInfo) => {
  const suffix = Date.now().toString().slice(-6);
  const patientName = `Sinta Link ${suffix}`;
  const date = bookingDate(testInfo);

  await stubWhatsApp(page);
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/booking/baru");
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  await page.getByLabel("Nama", { exact: true }).fill(patientName);
  await page.getByLabel("Nomor WhatsApp").fill(`0812${suffix}55`);
  await page.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible({ timeout: 30_000 });

  await expect(page.locator("#booking-staff")).toContainText("Diane");
  await page.getByRole("button", { name: "Pilih tanggal lain" }).click();
  await page.getByLabel("Tanggal lain").fill(date);
  const slots = page.getByRole("group", { name: "Pilih jam" }).getByRole("button");
  await expect(slots.first()).toBeVisible({ timeout: 30_000 });
  await slots.first().click();
  await page.getByRole("button", { name: "Buat Booking" }).click();

  // Link kuis ikut instruksi transfer (spec C3 4.1), dengan kode setelah tanda #.
  const transfer = page.getByRole("link", { name: "Kirim instruksi transfer via WA" });
  await expect(transfer).toBeVisible({ timeout: 30_000 });
  const text = decodeURIComponent(new URL((await transfer.getAttribute("href"))!).searchParams.get("text")!);
  const link = /(https?:\/\/\S+\/isi#[A-Za-z0-9._-]+)/.exec(text)![1];
  expect(link.startsWith(`${E2E_BASE_URL}/isi#`)).toBe(true);

  // Dialog "Link kuis" di daftar booking menampilkan QR dan link yang sama.
  await page.getByRole("link", { name: /Lihat di daftar/ }).click();
  const row = page.locator('tr[data-highlighted="true"]');
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  // Belum ada baris isian, tetapi linknya berlaku (spec C3 4.3).
  await expect(row).toContainText("Isian: belum diisi");
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await page.getByRole("menuitem", { name: "Link kuis" }).click();
  const dialog = page.getByRole("dialog", { name: /^Link kuis/ });
  await expect(dialog.getByRole("img", { name: "QR link kuis" })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("link", { name: "Buka di perangkat ini" })).toHaveAttribute("href", link);
  await page.keyboard.press("Escape");

  // Customer: perangkat lain, tanpa login.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const customerContext = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL: E2E_BASE_URL,
  });
  const customer = await customerContext.newPage();
  await customer.goto(link);
  await expect(customer.getByText("Halo Sinta")).toBeVisible({ timeout: 30_000 });
  await expect(customer.getByText("Pernah konsultasi atau treatment di SunDY Clinic?")).toHaveCount(0);

  await choose(customer, /^Slimming/);
  await choose(customer, "Menurunkan berat badan");
  await choose(customer, "5–10 kg");
  await tick(customer, "Perut");
  await next(customer);
  await choose(customer, "Belum pernah");
  await customer.getByLabel("Berat badan").fill("68");
  await customer.getByLabel("Tinggi badan").fill("160");
  await next(customer);
  await fillFormRecall(customer);
  await tick(customer, "Tidak ada");
  await next(customer);
  await inGroup(customer, "Obat atau suplemen lain", "Tidak ada");
  await inGroup(customer, "Alergi obat, makanan, atau kosmetik", "Tidak ada");
  await next(customer);
  await choose(customer, "Tidak");

  await expect(customer.getByRole("heading", { name: "Ringkasan jawaban Anda" })).toBeVisible();
  await expect(customer.locator("main").getByText(/pasien|berobat/i)).toHaveCount(0);
  await next(customer);

  await customer.getByLabel("Tanggal lahir").fill("1994-03-21");
  await inGroup(customer, "Jenis kelamin", "Perempuan");
  await customer.getByLabel("Pekerjaan").fill("Wiraswasta");
  await customer.getByLabel("Alamat").fill("Jl. Link E2E No. 3, Manado");
  await customer.getByRole("checkbox", { name: /Kebijakan Privasi/ }).check();
  await customer.getByRole("checkbox", { name: /mentransfer biaya booking/ }).check();
  await customer.getByRole("button", { name: "Kirim" }).click();
  await expect(customer.getByRole("heading", { name: "Terima kasih, sudah kami terima" })).toBeVisible({
    timeout: 30_000,
  });

  // Link yang sama sesudahnya hanya menampilkan terima kasih.
  await customer.reload();
  await expect(customer.getByRole("heading", { name: "Terima kasih, sudah kami terima" })).toBeVisible({
    timeout: 30_000,
  });
  await customerContext.close();

  // Admin: isian masuk dan menunggu diperiksa dokter.
  await page.reload();
  await expect(page.locator('tr[data-highlighted="true"]')).toContainText("Isian: belum diperiksa", {
    timeout: 30_000,
  });
});
```

Catatan untuk pelaksana: langkah kuis Slimming di atas mengikuti `tests/e2e/public-registration.spec.ts`, tetapi riwayat dietnya "Belum pernah", sehingga layar S5 dan S6 dilewati. Bila label opsi riwayat diet di `src/lib/kuis/v2/options.ts` (`DIET_HISTORY`) berbeda dari "Belum pernah", pakai labelnya yang persis. Begitu juga dengan opsi kondisi "Tidak ada" (`CONDITIONS`).

Run: `npx playwright test tests/e2e/link-kuis.spec.ts --project=desktop`
Expected: PASS. Fiturnya sudah ada sejak Task 7.

Buktikan bahwa uji ini bisa gagal. Di `src/lib/quiz-link.ts`, ubah sementara `quizLinkLines` agar mengembalikan `[]`. Akibatnya link tidak lagi ikut pesan.

Run: `npx playwright test tests/e2e/link-kuis.spec.ts --project=desktop`
Expected: FAIL pada pencarian link di teks instruksi transfer.

Kembalikan perubahan itu (`git checkout src/lib/quiz-link.ts`).

Run: `npx playwright test tests/e2e/link-kuis.spec.ts`
Expected: PASS (1 uji × 2 proyek).

- [ ] **Step 2: Jalankan seluruh e2e**

Run: `caffeinate -i npm run test:e2e`
Expected: PASS. Uji `public-site.spec.ts`, `admin.spec.ts`, dan uji ponsel yang kadang kehabisan waktu di bawah beban: jalankan ulang berkas itu sendirian dan catat hasilnya.

- [ ] **Step 3: Status spec dan verifikasi akhir**

Di `docs/superpowers/specs/2026-10-02-link-kuis-design.md`, ganti baris status menjadi:

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

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/link-kuis.spec.ts docs/superpowers/specs/2026-10-02-link-kuis-design.md
git commit -m "test: fill the quiz from the link in a transfer instruction end to end; mark the C3 spec done"
```
