# Struk Tagihan: Kirim lewat WhatsApp dan Cetak ke Printer Struk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dari tagihan final, resepsionis mengirim pesan WhatsApp berisi total dan tautan ke struk online (tanpa login), mengganti tautan bila salah kirim, dan mencetak struk ke printer thermal lewat QZ Tray atau browser.

**Architecture:** Satu kolom `Invoice.receiptLinkVersion`. Kode tautan bertanda tangan HMAC di belakang `#` (pola link kuis). Satu bentuk data murni `PublicReceipt` (`src/lib/receipt.ts`) dipakai bersama oleh halaman `/struk`, cetak browser, dan pembuat perintah ESC/POS. Cetak QZ Tray dimuat dinamis di klien, dengan dua rute server untuk sertifikat dan tanda tangan SHA512.

**Tech Stack:** Next.js 15 (server actions, route handlers), Prisma 7/PostgreSQL, MUI 9 (panel saja), Vitest (unit + integrasi), Playwright, `qz-tray` 2.3.0.

**Spec:** `docs/superpowers/specs/2026-10-12-struk-whatsapp-design.md` (v1.1, disetujui pemilik 12 Oktober 2026).

## Global Constraints

- **Bahasa:** teks yang dilihat pengguna, pesan galat, nama uji, dan komentar kode dalam Bahasa Indonesia; nama berkas, fungsi, dan commit dalam bahasa Inggris.
- **Hak:** `getReceiptMessage`, `resetReceiptLink`, `recordReceiptPrint`, dan rute tanda tangan memakai `invoice:manage` (Super Admin, Resepsionis); `getInvoiceReceipt` memakai `invoice:read`. `getPublicReceipt` publik, dibatasi laju.
- **Isi struk publik hanya:** nama klinik, cabang dan alamat cabang, nomor tagihan, tanggal final, nama di tagihan, baris (nama, qty, harga satuan, jumlah), subtotal, diskon, total, pembayaran yang tidak ditarik (tanggal, metode, jumlah), sisa, status, nama kasir yang memfinalisasi. **Tidak pernah:** nomor WA, NIK, nomor RM, alamat pasien, catatan tagihan, alasan diskon, harga pokok, data kunjungan.
- **Pesan publik:** kode rusak/palsu/versi lama/tagihan tidak ada/draf → "Tautan struk tidak berlaku."; dibatalkan (kode sah) → "Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan."
- **Kode:** label kunci `sundy:struk-link:v1`, tanda tangan HMAC-SHA256(`{invoiceId}.{receiptLinkVersion}`) 16 byte base64url, URL `{situs}/struk#{kode}`; tidak disimpan di basis data dan tidak masuk audit.
- **Halaman publik:** tanpa MUI (dijaga `tests/unit/architecture.test.ts`), tanpa kata "pasien"/"berobat" di `src/app/(public)`, `robots: { index: false, follow: false }`.
- **Panel:** hanya MUI, tanpa kelas warna Tailwind (dijaga uji arsitektur).
- **Migrasi hanya menambah:** `receiptLinkVersion INTEGER NOT NULL DEFAULT 0`.
- **QZ:** dependensi `qz-tray` dikunci persis `2.3.0` (`npm install qz-tray@2.3.0 --save-exact`); dimuat dengan `import()` dinamis hanya saat dibutuhkan. Lebar kertas 80 mm = 48 kolom, 58 mm = 32 kolom; bawaan 80 mm; pengaturan per komputer di `localStorage` kunci `sundy:printer-struk`.
- **Pola kode:** `runAction`/`UserFacingError`, `requireCapability`, `recordAudit`, `guardRate` + `createRateLimiter`, `publicSiteUrl`, `buildWhatsAppLinkTo`; berkas `"use server"` hanya mengekspor fungsi async (tipe boleh).
- **Pengujian:** unit `npx vitest run <berkas>`; integrasi `npm run test:integration -- <berkas>` (jangan bersamaan dengan E2E); E2E `npx playwright test <berkas> --project=desktop --workers=1` lalu `--project=mobile`. Setelah mengubah skema: `npx prisma generate && npm run db:migrate:test`. Uji lama yang sudah gagal: 3 uji `tests/integration/schedule.test.ts`. Uji komponen yang kena batas 5 dtk saat suite penuh tetapi lulus sendirian bukan regresi.
- **Commit:** Conventional Commits berbahasa Inggris, diakhiri `Co-Authored-By` model penulis commit (saat ini `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Jangan pernah men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`. Push, merge, deploy hanya atas permintaan pemilik.
- **Branch:** `struk-wa`.

## Keputusan perencana (hal yang spec tidak merinci)

1. **Dua variabel lingkungan QZ**, bukan satu: `QZ_PRIVATE_KEY_FILE` dan `QZ_CERTIFICATE_FILE` (spec 7.2 hanya menyebut kunci). Sertifikat publik perlu disajikan apa adanya; membuat X.509 dari kunci di Node butuh pustaka tambahan. Keduanya di `/www/sundy/shared/qz/`.
2. **`sameOrigin` disalin lokal di rute tanda tangan** (seperti rute unggah BIA), tidak diekstrak ke `src/server/same-origin.ts`: berkas bernama itu sudah ada di branch `foto-dokter` yang belum digabung, dan isi berbeda akan bentrok saat digabung.
3. **"Kirim struk via WA" membuka dialog** berisi pratinjau pesan, tautan "Buka WhatsApp", dan "Salin pesan", bukan langsung membuka WA: pesan dibuat server (kunci HMAC rahasia), dan membuka jendela sesudah `await` sering diblokir browser.
4. **Cetak browser dari panel** memakai blok struk khusus cetak (`ReceiptPaper` dengan kelas `struk-hanya-cetak`) dan menyembunyikan isi halaman lain saat dicetak (kelas `struk-tanpa-cetak`), dengan halaman bernama `@page struk { size: 80mm auto }`. Cetak A4 tagihan final tidak lagi ada (sesuai spec 7.3).
5. **`ReceiptPaper` di `src/components/receipt/`** tanpa MUI dan tanpa Tailwind, bergaya kelas `.struk-*` di `globals.css`, karena dipakai halaman publik dan panel.
6. **Tipe `qz-tray`** dideklarasikan sendiri secara minimal di `src/types/qz-tray.d.ts` (tanpa `@types/qz-tray`), hanya fungsi yang dipakai.
7. **Kalau sertifikat atau tanda tangan tidak tersedia** (404), klien QZ menerima string kosong dan QZ Tray jatuh ke mode tanpa tanda tangan (dialog izin), sesuai spec 7.2.

## Review Focus

1. **Kode tautan dari tagihan lain atau versi lama yang dikirim apa adanya** — selalu "Tautan struk tidak berlaku.", termasuk saat tagihannya dibatalkan (kode palsu tidak boleh membuka status "dibatalkan") (Task 4: uji kode palsu pada tagihan dibatalkan).
2. **Data terlarang bocor lewat `getPublicReceipt` atau `getInvoiceReceipt`** — WA, RM, catatan, alasan diskon tidak ada di JSON hasilnya (Task 4).
3. **Nama barang panjang atau beraksen di printer 58 mm** — tidak ada baris lebih dari 32 kolom; "é" tercetak "e" (Task 7).
4. **QZ Tray tidak berjalan atau printer tersimpan sudah dicabut** — pesan jelas, tombol tidak macet, dialog pengaturan terbuka untuk printer hilang (Task 9).
5. **Rute tanda tangan dipanggil dari situs lain atau tanpa hak** — 403, tidak pernah mengembalikan tanda tangan (Task 8).

---

### Task 1: Kolom versi tautan struk

**Files:**
- Modify: `prisma/schema.prisma` (model `Invoice`)
- Create: `prisma/migrations/20261013090000_tautan_struk/migration.sql`
- Modify: `tests/unit/migrations.test.ts`

**Interfaces:**
- Produces: `Invoice.receiptLinkVersion: number` (bawaan 0).

- [ ] **Step 1: Tulis uji yang gagal** — tambahkan di akhir `tests/unit/migrations.test.ts`:

```ts
describe("migrasi tautan struk", () => {
  const sql = readFileSync("prisma/migrations/20261013090000_tautan_struk/migration.sql", "utf8");

  it("hanya menambah satu kolom berbawaan 0", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).toMatch(/ADD COLUMN\s+"receiptLinkVersion" INTEGER NOT NULL DEFAULT 0/);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/migrations.test.ts`
Expected: FAIL (`ENOENT … 20261013090000_tautan_struk`).

- [ ] **Step 3: Skema dan migrasi**

Di model `Invoice` (`prisma/schema.prisma`), setelah baris `version Int @default(1)`:

```prisma
  /// Versi tautan struk publik (spec struk WA 3–4). "Ganti tautan" menaikkannya; kode lama tidak sah lagi.
  receiptLinkVersion Int @default(0)
```

Buat `prisma/migrations/20261013090000_tautan_struk/migration.sql`:

```sql
-- Tautan struk tagihan (spec struk WA bagian 3). Hanya menambah; rilis lama mengabaikannya.
ALTER TABLE "Invoice" ADD COLUMN     "receiptLinkVersion" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Terapkan dan uji**

Run: `npx prisma format && npx prisma generate && npm run db:migrate:test && npx vitest run tests/unit/migrations.test.ts`
Expected: migrasi diterapkan; uji PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261013090000_tautan_struk tests/unit/migrations.test.ts
git commit -m "feat: add receipt link version to invoices"
```

---

### Task 2: Kode tautan struk

**Files:**
- Create: `src/server/receipt-link-code.ts`
- Test: `tests/unit/receipt-link-code.test.ts`

**Interfaces:**
- Produces: `receiptKey(secret?: string): Buffer`, `receiptCode(invoiceId: string, version: number, key?: Buffer): string`, `parseReceiptCode(code: unknown): { invoiceId: string; signature: string } | null`, `isValidReceiptCode(code: string, version: number, key?: Buffer): boolean`, `receiptUrl(siteUrl: string, invoiceId: string, version: number, key?: Buffer): string`.

- [ ] **Step 1: Tulis uji yang gagal** — `tests/unit/receipt-link-code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { quizLinkCode, quizLinkKey } from "@/server/quiz-link-code";
import { isValidReceiptCode, parseReceiptCode, receiptCode, receiptKey, receiptUrl } from "@/server/receipt-link-code";

const KEY = receiptKey("rahasia-uji");
const ID = "cmabc123def456ghi789";

describe("kode tautan struk", () => {
  it("berbentuk {id}.{tanda tangan 22 karakter} dan sah untuk versinya", () => {
    const code = receiptCode(ID, 0, KEY);
    expect(code).toMatch(/^cmabc123def456ghi789\.[A-Za-z0-9_-]{22}$/);
    expect(isValidReceiptCode(code, 0, KEY)).toBe(true);
  });

  it("versi lain (sesudah Ganti tautan) tidak sah", () => {
    expect(isValidReceiptCode(receiptCode(ID, 0, KEY), 1, KEY)).toBe(false);
  });

  it("tanda tangan yang diubah atau kunci lain tidak sah", () => {
    const code = receiptCode(ID, 0, KEY);
    const tampered = `${code.slice(0, -1)}${code.endsWith("A") ? "B" : "A"}`;
    expect(isValidReceiptCode(tampered, 0, KEY)).toBe(false);
    expect(isValidReceiptCode(code, 0, receiptKey("rahasia-lain"))).toBe(false);
  });

  it("kode link kuis untuk id yang sama tidak sah sebagai kode struk", () => {
    expect(isValidReceiptCode(quizLinkCode(ID, 0, quizLinkKey("rahasia-uji")), 0, KEY)).toBe(false);
  });

  it("parse menolak yang bukan bentuk kode", () => {
    for (const value of [null, undefined, 12, "", "abc", "ID.pendek", `${ID}.`, `${ID.toUpperCase()}.${"a".repeat(22)}`]) {
      expect(parseReceiptCode(value), String(value)).toBeNull();
    }
    expect(parseReceiptCode(receiptCode(ID, 3, KEY))?.invoiceId).toBe(ID);
  });

  it("URL menaruh kode di belakang #", () => {
    expect(receiptUrl("https://sundyclinic.com", ID, 0, KEY)).toBe(`https://sundyclinic.com/struk#${receiptCode(ID, 0, KEY)}`);
  });

  it("tanpa BETTER_AUTH_SECRET kunci tidak bisa dibuat", () => {
    expect(() => receiptKey("")).toThrow(/BETTER_AUTH_SECRET/);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/receipt-link-code.test.ts`
Expected: FAIL (`Failed to resolve import "@/server/receipt-link-code"`).

- [ ] **Step 3: Implementasi** — `src/server/receipt-link-code.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kode tautan struk (spec struk WA bagian 4): "{invoiceId}.{tanda tangan}". Tanda tangan =
 * HMAC-SHA256("{invoiceId}.{versi}") dengan kunci turunan BETTER_AUTH_SECRET berlabel sendiri
 * (bukan label link kuis), dipotong 16 byte. Kode tidak disimpan di basis data. Hanya untuk server.
 */
const KEY_LABEL = "sundy:struk-link:v1";
const SIGNATURE_BYTES = 16;
const CODE_PATTERN = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{22})$/;

export function receiptKey(secret: string | undefined = process.env.BETTER_AUTH_SECRET): Buffer {
  if (!secret) throw new Error("BETTER_AUTH_SECRET belum diisi; tautan struk tidak bisa dibuat.");
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function signature(invoiceId: string, version: number, key: Buffer): string {
  return createHmac("sha256", key).update(`${invoiceId}.${version}`).digest().subarray(0, SIGNATURE_BYTES).toString("base64url");
}

export function receiptCode(invoiceId: string, version: number, key: Buffer = receiptKey()): string {
  return `${invoiceId}.${signature(invoiceId, version, key)}`;
}

export function parseReceiptCode(code: unknown): { invoiceId: string; signature: string } | null {
  if (typeof code !== "string") return null;
  const match = CODE_PATTERN.exec(code);
  return match ? { invoiceId: match[1], signature: match[2] } : null;
}

/** Perbandingan waktu-konstan atas teks base64url (lihat isValidQuizLinkCode). */
export function isValidReceiptCode(code: string, version: number, key: Buffer = receiptKey()): boolean {
  const parsed = parseReceiptCode(code);
  if (!parsed) return false;
  const given = Buffer.from(parsed.signature);
  const expected = Buffer.from(signature(parsed.invoiceId, version, key));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Kode di belakang "#": browser tidak mengirimnya ke server, jadi tidak tercatat di log nginx maupun Cloudflare. */
export function receiptUrl(siteUrl: string, invoiceId: string, version: number, key: Buffer = receiptKey()): string {
  return `${siteUrl}/struk#${receiptCode(invoiceId, version, key)}`;
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/receipt-link-code.test.ts`
Expected: PASS 7/7.

- [ ] **Step 5: Commit**

```bash
git add src/server/receipt-link-code.ts tests/unit/receipt-link-code.test.ts
git commit -m "feat: signed receipt link codes"
```

---

### Task 3: Bentuk struk publik dan teks pesan (murni)

**Files:**
- Create: `src/lib/receipt.ts`
- Test: `tests/unit/receipt.test.ts`

**Interfaces:**
- Consumes: `invoiceTotals` (`@/lib/invoice`), `firstName` (`@/lib/quiz-link`), `dateOnlyString`, `PaymentMethodValue` (`@/lib/stock`), `formatRupiah`, `formatDateWithYear` (`@/lib/format`), `minutesToTimeLabel`, `witaMinutesOfDay` (`@/lib/time`), `CLINIC_NAME` (`@/lib/clinic`).
- Produces: types `ReceiptLine`, `ReceiptPayment`, `ReceiptStatus`, `PublicReceipt`, `PublicReceiptPage`, `ReceiptSource`; `buildPublicReceipt(source: ReceiptSource): PublicReceipt | null`; `receiptMessageText(input: { customerName: string; number: string; total: number; balance: number; url: string }): string`; `formatReceiptDateTime(date: Date): string`; `RECEIPT_STATUS_LABEL`, `RECEIPT_INVALID_TEXT`, `RECEIPT_CANCELLED_TEXT`.

- [ ] **Step 1: Tulis uji yang gagal** — `tests/unit/receipt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildPublicReceipt,
  formatReceiptDateTime,
  RECEIPT_CANCELLED_TEXT,
  RECEIPT_INVALID_TEXT,
  receiptMessageText,
  type ReceiptSource,
} from "@/lib/receipt";

const FINALIZED = new Date("2026-10-12T10:46:00Z"); // 18.46 WITA

function source(patch: Partial<ReceiptSource> = {}): ReceiptSource {
  return {
    number: "TG-2026-0123",
    status: "FINAL",
    finalizedAt: FINALIZED,
    finalizedByName: "Mey",
    discountKind: null,
    discountValue: 0,
    patient: { name: "Priscillya Jenitha Chiantoery" },
    branch: { name: "SunDY Mahakeret", address: "Jl. Mahakeret 1, Manado" },
    lines: [
      { name: "Paket Lux", quantity: 1, unitPrice: 1_500_000 },
      { name: "Paket S 0.3", quantity: 1, unitPrice: 1_600_000 },
    ],
    payments: [{ amount: 3_100_000, method: "QRIS", paidAt: new Date("2026-10-12T00:00:00Z"), revokedAt: null }],
    ...patch,
  };
}

describe("buildPublicReceipt", () => {
  it("tagihan final lunas: semua bagian struk", () => {
    expect(buildPublicReceipt(source())).toEqual({
      clinicName: "SunDY Clinic",
      branchName: "SunDY Mahakeret",
      branchAddress: "Jl. Mahakeret 1, Manado",
      number: "TG-2026-0123",
      finalizedAt: FINALIZED,
      cashierName: "Mey",
      customerName: "Priscillya Jenitha Chiantoery",
      lines: [
        { name: "Paket Lux", quantity: 1, unitPrice: 1_500_000, amount: 1_500_000 },
        { name: "Paket S 0.3", quantity: 1, unitPrice: 1_600_000, amount: 1_600_000 },
      ],
      subtotal: 3_100_000,
      discount: 0,
      total: 3_100_000,
      paid: 3_100_000,
      balance: 0,
      payments: [{ paidAt: "2026-10-12", method: "QRIS", amount: 3_100_000 }],
      status: "LUNAS",
    });
  });

  it("diskon, cicilan, dan pembayaran yang ditarik tidak ikut", () => {
    const receipt = buildPublicReceipt(
      source({
        discountKind: "NOMINAL",
        discountValue: 100_000,
        payments: [
          { amount: 1_000_000, method: "TUNAI", paidAt: new Date("2026-10-12T00:00:00Z"), revokedAt: null },
          { amount: 500_000, method: "TRANSFER", paidAt: new Date("2026-10-12T00:00:00Z"), revokedAt: new Date() },
        ],
      }),
    )!;
    expect(receipt).toMatchObject({ discount: 100_000, total: 3_000_000, paid: 1_000_000, balance: 2_000_000, status: "SEBAGIAN" });
    expect(receipt.payments).toEqual([{ paidAt: "2026-10-12", method: "TUNAI", amount: 1_000_000 }]);
  });

  it("belum dibayar sama sekali", () => {
    expect(buildPublicReceipt(source({ payments: [] }))).toMatchObject({ paid: 0, balance: 3_100_000, status: "BELUM_DIBAYAR" });
  });

  it("draf dan dibatalkan tidak punya struk", () => {
    expect(buildPublicReceipt(source({ status: "DRAF", number: null, finalizedAt: null }))).toBeNull();
    expect(buildPublicReceipt(source({ status: "DIBATALKAN" }))).toBeNull();
  });

  it("hanya memuat kunci yang diizinkan, walau sumbernya membawa data lain", () => {
    const extra = { ...source(), notes: "catatan internal", discountReason: "alasan", patient: { name: "A", whatsapp: "6281", medicalRecordNumber: "SDY-1" } };
    const json = JSON.stringify(buildPublicReceipt(extra as ReceiptSource));
    for (const secret of ["catatan internal", "alasan", "6281", "SDY-1"]) expect(json).not.toContain(secret);
  });
});

describe("receiptMessageText", () => {
  it("lunas: menyapa nama depan, nomor, total, dan tautan", () => {
    expect(receiptMessageText({ customerName: "Priscillya Jenitha", number: "TG-2026-0123", total: 3_100_000, balance: 0, url: "https://x/struk#k" })).toBe(
      [
        "Halo Priscillya, terima kasih sudah berkunjung ke SunDY Clinic.",
        "No. tagihan: TG-2026-0123",
        "Total: Rp 3.100.000 (LUNAS)",
        "Lihat struk lengkap: https://x/struk#k",
      ].join("\n"),
    );
  });

  it("belum lunas menyebut sisa", () => {
    expect(receiptMessageText({ customerName: "Budi", number: "TG-2026-0124", total: 300_000, balance: 100_000, url: "u" })).toContain(
      "Total: Rp 300.000 (sisa Rp 100.000)",
    );
  });
});

describe("label", () => {
  it("tanggal dan jam final dalam WITA", () => {
    expect(formatReceiptDateTime(FINALIZED)).toBe("12 Okt 2026 pukul 18.46");
  });

  it("pesan halaman publik", () => {
    expect(RECEIPT_INVALID_TEXT).toBe("Tautan struk tidak berlaku.");
    expect(RECEIPT_CANCELLED_TEXT).toBe("Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan.");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/receipt.test.ts`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi** — `src/lib/receipt.ts`:

```ts
import { CLINIC_NAME } from "./clinic";
import { formatDateWithYear, formatRupiah } from "./format";
import { invoiceTotals, type DiscountKindValue, type InvoiceStatusValue } from "./invoice";
import { firstName } from "./quiz-link";
import { dateOnlyString, type PaymentMethodValue } from "./stock";
import { minutesToTimeLabel, witaMinutesOfDay } from "./time";

// Struk tagihan (spec struk WA 5–7). Murni: dipakai halaman /struk, cetak browser, dan ESC/POS.

export type ReceiptLine = { name: string; quantity: number; unitPrice: number; amount: number };
export type ReceiptPayment = { paidAt: string; method: PaymentMethodValue; amount: number };
export type ReceiptStatus = "LUNAS" | "SEBAGIAN" | "BELUM_DIBAYAR";

/** Hanya yang tertulis di struk kasir biasa: tanpa nomor WA, NIK, nomor RM, alamat, atau catatan (spec 6). */
export type PublicReceipt = {
  clinicName: string;
  branchName: string;
  branchAddress: string;
  number: string;
  finalizedAt: Date;
  cashierName: string;
  customerName: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  payments: ReceiptPayment[];
  status: ReceiptStatus;
};

export type PublicReceiptPage = { state: "VALID"; receipt: PublicReceipt } | { state: "CANCELLED" } | { state: "INVALID" };

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  LUNAS: "LUNAS",
  SEBAGIAN: "DIBAYAR SEBAGIAN",
  BELUM_DIBAYAR: "BELUM DIBAYAR",
};
export const RECEIPT_INVALID_TEXT = "Tautan struk tidak berlaku.";
export const RECEIPT_CANCELLED_TEXT = "Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan.";

export type ReceiptSource = {
  number: string | null;
  status: InvoiceStatusValue;
  finalizedAt: Date | null;
  finalizedByName: string | null;
  discountKind: DiscountKindValue | null;
  discountValue: number;
  patient: { name: string };
  branch: { name: string; address: string };
  lines: readonly { name: string; quantity: number; unitPrice: number }[];
  payments: readonly { amount: number; method: PaymentMethodValue; paidAt: Date; revokedAt: Date | null }[];
};

/** Struk tagihan final; null untuk draf dan dibatalkan. Kolom dipilih satu per satu, bukan disalin. */
export function buildPublicReceipt(source: ReceiptSource): PublicReceipt | null {
  if (source.status !== "FINAL" || !source.number || !source.finalizedAt) return null;
  const totals = invoiceTotals(source);
  return {
    clinicName: CLINIC_NAME,
    branchName: source.branch.name,
    branchAddress: source.branch.address,
    number: source.number,
    finalizedAt: source.finalizedAt,
    cashierName: source.finalizedByName ?? "-",
    customerName: source.patient.name,
    lines: source.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.quantity * line.unitPrice,
    })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    paid: totals.paid,
    balance: Math.max(0, totals.balance),
    payments: source.payments
      .filter((payment) => !payment.revokedAt)
      .map((payment) => ({ paidAt: dateOnlyString(payment.paidAt), method: payment.method, amount: payment.amount })),
    status: totals.display === "LUNAS" ? "LUNAS" : totals.display === "SEBAGIAN" ? "SEBAGIAN" : "BELUM_DIBAYAR",
  };
}

/** "12 Okt 2026 pukul 18.46" (WITA). */
export function formatReceiptDateTime(date: Date): string {
  return `${formatDateWithYear(date)} pukul ${minutesToTimeLabel(witaMinutesOfDay(date))}`;
}

/** Pesan WhatsApp struk (spec 5). */
export function receiptMessageText(input: { customerName: string; number: string; total: number; balance: number; url: string }): string {
  const status = input.balance > 0 ? `sisa ${formatRupiah(input.balance)}` : "LUNAS";
  return [
    `Halo ${firstName(input.customerName)}, terima kasih sudah berkunjung ke ${CLINIC_NAME}.`,
    `No. tagihan: ${input.number}`,
    `Total: ${formatRupiah(input.total)} (${status})`,
    `Lihat struk lengkap: ${input.url}`,
  ].join("\n");
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/receipt.test.ts`
Expected: PASS. Bila `formatReceiptDateTime` menghasilkan bentuk bulan lain (mis. "Okt" vs "Okt."), sesuaikan harapan uji dengan keluaran `formatDateWithYear` yang dipakai di tempat lain (catat sebagai Ruling), jangan ubah formatter bersama.

- [ ] **Step 5: Commit**

```bash
git add src/lib/receipt.ts tests/unit/receipt.test.ts
git commit -m "feat: public receipt shape and WhatsApp receipt message"
```

---

### Task 4: Aksi server struk (panel dan publik)

**Files:**
- Create: `src/server/receipt-store.ts`, `src/server/receipt.ts`, `src/server/receipt-public.ts`
- Test: `tests/integration/receipt.test.ts`

**Interfaces:**
- Consumes: Task 1 kolom; Task 2 `receiptUrl`, `parseReceiptCode`, `isValidReceiptCode`; Task 3 `buildPublicReceipt`, `receiptMessageText`, `PublicReceipt`, `PublicReceiptPage`.
- Produces:
  - `loadReceiptSource(invoiceId: string)` (modul biasa) → baris dengan `id`, `receiptLinkVersion`, `patient.whatsapp`, dan semua kolom `ReceiptSource`, atau `null`.
  - `"use server"` `src/server/receipt.ts`: `type ReceiptMessage = { text: string; link: string | null }`; `getReceiptMessage(invoiceId: string): Promise<ActionResult<ReceiptMessage>>`; `resetReceiptLink(invoiceId: string): Promise<ActionResult<void>>`; `recordReceiptPrint(invoiceId: string): Promise<ActionResult<void>>`; `getInvoiceReceipt(invoiceId: string): Promise<PublicReceipt | null>`.
  - `"use server"` `src/server/receipt-public.ts`: `getPublicReceipt(code: string): Promise<ActionResult<PublicReceiptPage>>`.

- [ ] **Step 1: Tulis uji integrasi yang gagal** — `tests/integration/receipt.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { RECEIPT_CANCELLED_TEXT } from "@/lib/receipt";
import { witaDateString } from "@/lib/time";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment, revokeInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceReceipt, getReceiptMessage, recordReceiptPrint, resetReceiptLink } from "@/server/receipt";
import { receiptCode } from "@/server/receipt-link-code";
import { getPublicReceipt } from "@/server/receipt-public";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Struk", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/server/request-guard", () => ({ guardRate: vi.fn().mockResolvedValue(undefined), clientIp: vi.fn().mockResolvedValue("127.0.0.1") }));

const SLUG = "struk-uji";
const WA = "6281200009401";
const today = witaDateString(new Date());

let world: BillingWorld;

/** Tagihan penjualan langsung final dengan satu baris layanan; opsional dibayar sebagian. */
async function finalInvoice(price = 300_000, paid = 0) {
  actor.role = "RESEPSIONIS";
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  const { version } = await unwrap(addFreeLine({ invoiceId: id, version: 1, kind: "LAYANAN", name: "Layanan Struk", quantity: 1, unitPrice: price }));
  await unwrap(finalizeInvoice({ invoiceId: id, version }));
  if (paid > 0) await unwrap(recordInvoicePayment({ invoiceId: id, amount: paid, method: "QRIS", paidAt: today, reference: "" }));
  return id;
}

function codeFrom(text: string): string {
  const match = /\/struk#(\S+)/.exec(text);
  if (!match) throw new Error(`Tidak ada tautan struk di pesan: ${text}`);
  return match[1];
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await prisma.patient.update({ where: { id: world.patientId }, data: { name: "Priscillya Struk" } });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("pesan struk WhatsApp", () => {
  it("menyapa nama depan, menyebut nomor, total dan sisa, serta tautan wa.me ke nomor pasien", async () => {
    const id = await finalInvoice(300_000, 100_000);
    const message = await unwrap(getReceiptMessage(id));
    expect(message.text).toMatch(/^Halo Priscillya, terima kasih/);
    expect(message.text).toMatch(/No\. tagihan: TG-\d{4}-\d{4}/);
    expect(message.text).toContain("Total: Rp 300.000 (sisa Rp 200.000)");
    expect(message.link).toMatch(new RegExp(`^https://wa\\.me/${WA}\\?text=`));
    expect(decodeURIComponent(message.link!.split("text=")[1])).toBe(message.text);
  });

  it("dicatat di audit tanpa kode tautan", async () => {
    const id = await finalInvoice();
    const message = await unwrap(getReceiptMessage(id));
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.receipt-link", entityId: id } });
    expect(JSON.stringify(audit)).not.toContain(codeFrom(message.text));
    expect(audit.summary).toMatch(/^TG-\d{4}-\d{4}$/);
  });

  it("draf tidak bisa dibuatkan struk", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    expect(await getReceiptMessage(id)).toEqual({ ok: false, error: "Struk hanya untuk tagihan final." });
    expect(await getReceiptMessage("tidak-ada")).toEqual({ ok: false, error: "Tagihan tidak ditemukan." });
  });

  it("hanya untuk invoice:manage", async () => {
    const id = await finalInvoice();
    actor.role = "ADMIN_KEUANGAN";
    await expect(getReceiptMessage(id)).rejects.toThrow("forbidden: invoice:manage");
    await expect(resetReceiptLink(id)).rejects.toThrow("forbidden: invoice:manage");
    await expect(recordReceiptPrint(id)).rejects.toThrow("forbidden: invoice:manage");
  });
});

describe("struk publik", () => {
  it("tautan sah menampilkan struk tanpa data terlarang", async () => {
    const id = await finalInvoice(300_000, 300_000);
    await prisma.invoice.update({ where: { id }, data: { notes: "catatan internal struk" } });
    const page = await unwrap(getPublicReceipt(codeFrom((await unwrap(getReceiptMessage(id))).text)));
    expect(page.state).toBe("VALID");
    if (page.state !== "VALID") return;
    expect(page.receipt).toMatchObject({ customerName: "Priscillya Struk", total: 300_000, balance: 0, status: "LUNAS", branchAddress: "Alamat" });
    expect(page.receipt.lines).toEqual([{ name: "Layanan Struk", quantity: 1, unitPrice: 300_000, amount: 300_000 }]);
    const json = JSON.stringify(page);
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: world.patientId } });
    for (const secret of [WA, patient.medicalRecordNumber, "catatan internal struk"]) expect(json).not.toContain(secret);
  });

  it("pembayaran yang ditarik tidak tampil", async () => {
    const id = await finalInvoice(300_000, 100_000);
    const payment = await prisma.invoicePayment.findFirstOrThrow({ where: { invoiceId: id } });
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(revokeInvoicePayment({ paymentId: payment.id, reason: "Salah catat" }));
    actor.role = "RESEPSIONIS";
    const page = await unwrap(getPublicReceipt(codeFrom((await unwrap(getReceiptMessage(id))).text)));
    expect(page.state === "VALID" && page.receipt.payments).toEqual([]);
  });

  it("Ganti tautan: kode lama tidak berlaku, kode baru berlaku", async () => {
    const id = await finalInvoice();
    const oldCode = codeFrom((await unwrap(getReceiptMessage(id))).text);
    await unwrap(resetReceiptLink(id));
    expect(await unwrap(getPublicReceipt(oldCode))).toEqual({ state: "INVALID" });
    const newCode = codeFrom((await unwrap(getReceiptMessage(id))).text);
    expect(newCode).not.toBe(oldCode);
    expect((await unwrap(getPublicReceipt(newCode))).state).toBe("VALID");
    expect(await prisma.auditLog.count({ where: { action: "invoice.receipt-link-reset", entityId: id } })).toBe(1);
  });

  it("tagihan dibatalkan: kode sah → dibatalkan; kode palsu → tidak berlaku", async () => {
    const id = await finalInvoice();
    const code = codeFrom((await unwrap(getReceiptMessage(id))).text);
    actor.role = "SUPER_ADMIN";
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Salah input" }));
    expect(await unwrap(getPublicReceipt(code))).toEqual({ state: "CANCELLED" });
    expect(await unwrap(getPublicReceipt(receiptCode(id, 5)))).toEqual({ state: "INVALID" });
    expect(RECEIPT_CANCELLED_TEXT).toMatch(/dibatalkan/);
    actor.role = "RESEPSIONIS";
    expect(await resetReceiptLink(id)).toEqual({ ok: false, error: "Tautan struk hanya untuk tagihan final." });
  });

  it("kode rusak, kosong, atau tagihan lain selalu tidak berlaku", async () => {
    const id = await finalInvoice();
    const { id: draftId } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    for (const code of ["", "abc", null, 12, `${id}.${"A".repeat(22)}`, receiptCode(draftId, 0), receiptCode("cmtidakada0000000000", 0)]) {
      expect(await unwrap(getPublicReceipt(code as never)), String(code)).toEqual({ state: "INVALID" });
    }
  });
});

describe("struk untuk cetak di panel", () => {
  it("getInvoiceReceipt untuk invoice:read; null untuk draf", async () => {
    const id = await finalInvoice();
    actor.role = "ADMIN_KEUANGAN";
    expect((await getInvoiceReceipt(id))?.number).toMatch(/^TG-/);
    actor.role = "RESEPSIONIS";
    const { id: draftId } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    expect(await getInvoiceReceipt(draftId)).toBeNull();
  });

  it("recordReceiptPrint mencatat nomor tagihan", async () => {
    const id = await finalInvoice();
    await unwrap(recordReceiptPrint(id));
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.receipt-print", entityId: id } })).summary).toMatch(/^TG-/);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/receipt.test.ts`
Expected: FAIL (modul `@/server/receipt` tidak ada).

- [ ] **Step 3: Implementasi**

`src/server/receipt-store.ts`:

```ts
import { prisma } from "@/lib/db";

/**
 * Data tagihan untuk struk (spec struk WA 6). Modul biasa: pemanggil memeriksa hak atau kode tautan.
 * Nomor WA hanya untuk pesan panel; bentuk publik dibuat buildPublicReceipt yang memilih kolom satu per satu.
 */
export function loadReceiptSource(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      status: true,
      receiptLinkVersion: true,
      finalizedAt: true,
      finalizedByName: true,
      discountKind: true,
      discountValue: true,
      patient: { select: { name: true, whatsapp: true } },
      branch: { select: { name: true, address: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { name: true, quantity: true, unitPrice: true } },
      payments: { orderBy: { createdAt: "asc" }, select: { amount: true, method: true, paidAt: true, revokedAt: true } },
    },
  });
}
```

`src/server/receipt.ts`:

```ts
"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { buildPublicReceipt, receiptMessageText, type PublicReceipt } from "@/lib/receipt";
import { prisma } from "@/lib/db";
import { buildWhatsAppLinkTo } from "@/lib/whatsapp";
import { recordAudit } from "@/server/audit";
import { receiptUrl } from "@/server/receipt-link-code";
import { loadReceiptSource } from "@/server/receipt-store";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

export type ReceiptMessage = { text: string; link: string | null };

const NOT_FOUND = "Tagihan tidak ditemukan.";
const FINAL_ONLY_RECEIPT = "Struk hanya untuk tagihan final.";
const FINAL_ONLY_LINK = "Tautan struk hanya untuk tagihan final.";

/** Pesan WA struk (spec 5): teks dan tautan wa.me ke nomor pasien; null bila nomornya tidak sah. */
export async function getReceiptMessage(invoiceId: string): Promise<ActionResult<ReceiptMessage>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const source = await loadReceiptSource(String(invoiceId ?? ""));
    if (!source) throw new UserFacingError(NOT_FOUND);
    const receipt = buildPublicReceipt(source);
    if (!receipt) throw new UserFacingError(FINAL_ONLY_RECEIPT);
    const text = receiptMessageText({
      customerName: receipt.customerName,
      number: receipt.number,
      total: receipt.total,
      balance: receipt.balance,
      url: receiptUrl(publicSiteUrl(), source.id, source.receiptLinkVersion),
    });
    // Tanpa kode tautan: audit tidak boleh menjadi jalan lain untuk membuka struk.
    await recordAudit({ actor, action: "invoice.receipt-link", entity: "Invoice", entityId: source.id, summary: receipt.number });
    return { text, link: buildWhatsAppLinkTo(source.patient.whatsapp, text) };
  });
}

/** "Ganti tautan" (spec S3): semua tautan struk lama tagihan ini langsung tidak berlaku. */
export async function resetReceiptLink(invoiceId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoice = await prisma.invoice.findUnique({ where: { id: String(invoiceId ?? "") }, select: { id: true, number: true, status: true } });
    if (!invoice) throw new UserFacingError(NOT_FOUND);
    if (invoice.status !== "FINAL") throw new UserFacingError(FINAL_ONLY_LINK);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { receiptLinkVersion: { increment: 1 } } });
    await recordAudit({ actor, action: "invoice.receipt-link-reset", entity: "Invoice", entityId: invoice.id, summary: invoice.number ?? undefined });
  });
}

/** Catatan audit setiap struk dicetak ke printer (spec 7.1). Tidak menyimpan apa pun selain itu. */
export async function recordReceiptPrint(invoiceId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoice = await prisma.invoice.findUnique({ where: { id: String(invoiceId ?? "") }, select: { id: true, number: true, status: true } });
    if (!invoice) throw new UserFacingError(NOT_FOUND);
    if (invoice.status !== "FINAL") throw new UserFacingError(FINAL_ONLY_RECEIPT);
    await recordAudit({ actor, action: "invoice.receipt-print", entity: "Invoice", entityId: invoice.id, summary: invoice.number ?? undefined });
  });
}

/** Struk untuk dicetak dari panel (browser atau QZ Tray); null untuk draf dan dibatalkan. */
export async function getInvoiceReceipt(invoiceId: string): Promise<PublicReceipt | null> {
  await requireCapability("invoice:read");
  const source = await loadReceiptSource(String(invoiceId ?? ""));
  return source ? buildPublicReceipt(source) : null;
}
```

`src/server/receipt-public.ts`:

```ts
"use server";

import { runAction, type ActionResult } from "@/lib/action-result";
import { createRateLimiter } from "@/lib/rate-limit";
import { buildPublicReceipt, type PublicReceiptPage } from "@/lib/receipt";
import { isValidReceiptCode, parseReceiptCode } from "@/server/receipt-link-code";
import { loadReceiptSource } from "@/server/receipt-store";
import { guardRate } from "@/server/request-guard";

// Bisa dipanggil siapa pun tanpa login. Kode tautan satu-satunya bukti; semua kegagalan terlihat sama.

const receiptLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const INVALID: PublicReceiptPage = { state: "INVALID" };

/** Isi halaman /struk (spec 6). Status "dibatalkan" hanya untuk kode yang sah. */
export async function getPublicReceipt(code: string): Promise<ActionResult<PublicReceiptPage>> {
  return runAction(async () => {
    await guardRate(receiptLimiter);
    const parsed = parseReceiptCode(code);
    if (!parsed) return INVALID;
    const source = await loadReceiptSource(parsed.invoiceId);
    if (!source || !isValidReceiptCode(code, source.receiptLinkVersion)) return INVALID;
    if (source.status === "DIBATALKAN") return { state: "CANCELLED" };
    const receipt = buildPublicReceipt(source);
    return receipt ? { state: "VALID", receipt } : INVALID;
  });
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/receipt.test.ts`
Expected: PASS 12/12.

- [ ] **Step 5: Mutasi — kode palsu pada tagihan dibatalkan (Review Focus 1)**

Pindahkan sementara `if (source.status === "DIBATALKAN") return { state: "CANCELLED" };` ke atas pemeriksaan `isValidReceiptCode`. Run uji integrasi. Expected: FAIL pada "tagihan dibatalkan…". Kembalikan; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/receipt-store.ts src/server/receipt.ts src/server/receipt-public.ts tests/integration/receipt.test.ts
git commit -m "feat: receipt message, link reset, and public receipt actions"
```

---

### Task 5: Tampilan struk dan halaman publik `/struk`

**Files:**
- Create: `src/components/receipt/receipt-paper.tsx`, `src/components/receipt/receipt-entry.tsx`, `src/app/(public)/struk/page.tsx`
- Modify: `src/app/globals.css` (gaya `.struk-*`)
- Create (fixture uji): `tests/fixtures/receipt.ts` — `RECEIPT: PublicReceipt` yang dipakai uji Task 5, 6, 9
- Test: `tests/unit/components/receipt-paper.test.tsx`, `tests/unit/components/receipt-entry.test.tsx`

**Interfaces:**
- Consumes: Task 3 `PublicReceipt`, `formatReceiptDateTime`, `RECEIPT_STATUS_LABEL`, `RECEIPT_INVALID_TEXT`, `RECEIPT_CANCELLED_TEXT`; Task 4 `getPublicReceipt`.
- Produces: `ReceiptPaper({ receipt, className? })` (dipakai Task 6), kelas CSS `struk-kertas`, `struk-hanya-cetak`, `struk-tanpa-cetak`.

- [ ] **Step 1: Tulis fixture dan uji yang gagal**

`tests/fixtures/receipt.ts`:

```ts
import type { PublicReceipt } from "@/lib/receipt";

/** Struk contoh untuk uji komponen (Task 5, 6, 9). */
export const RECEIPT: PublicReceipt = {
  clinicName: "SunDY Clinic",
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Mahakeret 1, Manado",
  number: "TG-2026-0123",
  finalizedAt: new Date("2026-10-12T10:46:00Z"),
  cashierName: "Mey",
  customerName: "Priscillya Jenitha",
  lines: [{ name: "Paket Lux", quantity: 2, unitPrice: 750_000, amount: 1_500_000 }],
  subtotal: 1_500_000,
  discount: 100_000,
  total: 1_400_000,
  paid: 1_000_000,
  balance: 400_000,
  payments: [{ paidAt: "2026-10-12", method: "QRIS", amount: 1_000_000 }],
  status: "SEBAGIAN",
};
```

`tests/unit/components/receipt-paper.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { RECEIPT } from "../../fixtures/receipt";


describe("ReceiptPaper", () => {
  it("memuat semua bagian struk", () => {
    render(<ReceiptPaper receipt={RECEIPT} />);
    const paper = screen.getByRole("region", { name: "Struk TG-2026-0123" });
    for (const text of ["SunDY Clinic", "SunDY Mahakeret", "Jl. Mahakeret 1, Manado", "12 Okt 2026 pukul 18.46", "Mey", "Priscillya Jenitha", "Paket Lux", "2 x Rp 750.000", "Rp 1.500.000", "-Rp 100.000", "Rp 1.400.000", "QRIS", "Rp 400.000", "DIBAYAR SEBAGIAN"]) {
      expect(paper, text).toHaveTextContent(text);
    }
    expect(within(paper).getByRole("list", { name: "Item" }).children).toHaveLength(1);
  });

  it("tanpa diskon dan lunas: tidak ada baris diskon dan sisa", () => {
    render(<ReceiptPaper receipt={{ ...RECEIPT, discount: 0, total: 1_500_000, paid: 1_500_000, balance: 0, status: "LUNAS" }} />);
    const paper = screen.getByRole("region", { name: "Struk TG-2026-0123" });
    expect(paper).not.toHaveTextContent("Diskon");
    expect(paper).not.toHaveTextContent("Sisa");
    expect(paper).toHaveTextContent("LUNAS");
  });

  it("kelas tambahan ikut terpasang", () => {
    render(<ReceiptPaper receipt={RECEIPT} className="struk-hanya-cetak" />);
    expect(screen.getByRole("region", { name: "Struk TG-2026-0123" })).toHaveClass("struk-kertas", "struk-hanya-cetak");
  });
});
```

`tests/unit/components/receipt-entry.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptEntry } from "@/components/receipt/receipt-entry";
import { getPublicReceipt } from "@/server/receipt-public";
import { RECEIPT } from "../../fixtures/receipt";

vi.mock("@/server/receipt-public", () => ({ getPublicReceipt: vi.fn() }));

function openWithHash(hash: string) {
  window.history.replaceState(null, "", `/struk${hash}`);
  render(<ReceiptEntry />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => window.history.replaceState(null, "", "/"));

describe("ReceiptEntry", () => {
  it("membaca kode dari # lalu menampilkan struk dan tombol Cetak", async () => {
    vi.mocked(getPublicReceipt).mockResolvedValue({ ok: true, data: { state: "VALID", receipt: RECEIPT } });
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    openWithHash("#kode%2Euji");
    expect(await screen.findByRole("region", { name: "Struk TG-2026-0123" })).toBeInTheDocument();
    expect(getPublicReceipt).toHaveBeenCalledWith("kode.uji");
    await userEvent.setup().click(screen.getByRole("button", { name: "Cetak" }));
    expect(print).toHaveBeenCalled();
  });

  it("tanpa kode: tidak berlaku, tanpa memanggil server", async () => {
    openWithHash("");
    expect(await screen.findByText("Tautan struk tidak berlaku.")).toBeInTheDocument();
    expect(getPublicReceipt).not.toHaveBeenCalled();
  });

  it("dibatalkan dan tidak berlaku", async () => {
    vi.mocked(getPublicReceipt).mockResolvedValueOnce({ ok: true, data: { state: "CANCELLED" } });
    openWithHash("#a");
    expect(await screen.findByText("Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan.")).toBeInTheDocument();
  });

  it("pembatas laju dan galat jaringan menampilkan pesannya", async () => {
    vi.mocked(getPublicReceipt).mockResolvedValueOnce({ ok: false, error: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi." });
    openWithHash("#a");
    expect(await screen.findByText("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.")).toBeInTheDocument();
  });

  it("galat jaringan", async () => {
    vi.mocked(getPublicReceipt).mockRejectedValueOnce(new Error("jaringan"));
    openWithHash("#a");
    expect(await screen.findByText("Struk gagal dimuat. Periksa koneksi lalu muat ulang halaman ini.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/receipt-paper.test.tsx tests/unit/components/receipt-entry.test.tsx`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi**

`src/components/receipt/receipt-paper.tsx`:

```tsx
import { formatRupiah } from "@/lib/format";
import { formatReceiptDateTime, RECEIPT_STATUS_LABEL, type PublicReceipt } from "@/lib/receipt";
import { dateLabel, PAYMENT_METHOD_LABEL } from "@/lib/stock";

// Struk bergaya kertas kasir (spec struk WA 6, 7.3). Tanpa MUI dan Tailwind: dipakai halaman publik dan panel.

function Row({ left, right, strong = false }: { left: string; right: string; strong?: boolean }) {
  return (
    <div className="struk-baris" style={strong ? { fontWeight: 700 } : undefined}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

export function ReceiptPaper({ receipt, className = "" }: { receipt: PublicReceipt; className?: string }) {
  return (
    <section aria-label={`Struk ${receipt.number}`} className={`struk-kertas ${className}`.trim()}>
      <div className="struk-tengah">
        <strong>{receipt.clinicName}</strong>
        <div>{receipt.branchName}</div>
        <div>{receipt.branchAddress}</div>
      </div>
      <hr />
      <Row left="No." right={receipt.number} />
      <Row left="Tanggal" right={formatReceiptDateTime(receipt.finalizedAt)} />
      <Row left="Kasir" right={receipt.cashierName} />
      <Row left="Atas nama" right={receipt.customerName} />
      <hr />
      <ul aria-label="Item" className="struk-daftar">
        {receipt.lines.map((line, index) => (
          <li key={index}>
            <div>{line.name}</div>
            <Row left={`${line.quantity} x ${formatRupiah(line.unitPrice)}`} right={formatRupiah(line.amount)} />
          </li>
        ))}
      </ul>
      <hr />
      <Row left="Subtotal" right={formatRupiah(receipt.subtotal)} />
      {receipt.discount > 0 && <Row left="Diskon" right={`-${formatRupiah(receipt.discount)}`} />}
      <Row left="Total" right={formatRupiah(receipt.total)} strong />
      {receipt.payments.map((payment, index) => (
        <Row key={index} left={`${dateLabel(payment.paidAt)} · ${PAYMENT_METHOD_LABEL[payment.method]}`} right={formatRupiah(payment.amount)} />
      ))}
      {receipt.balance > 0 && <Row left="Sisa" right={formatRupiah(receipt.balance)} strong />}
      <div className="struk-tengah struk-penutup">
        <strong>{RECEIPT_STATUS_LABEL[receipt.status]}</strong>
        <div>Terima kasih</div>
      </div>
    </section>
  );
}
```

`src/components/receipt/receipt-entry.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { RECEIPT_CANCELLED_TEXT, RECEIPT_INVALID_TEXT, type PublicReceiptPage } from "@/lib/receipt";
import { getPublicReceipt } from "@/server/receipt-public";
import { ReceiptPaper } from "./receipt-paper";

type Loaded = PublicReceiptPage | { state: "FAILED"; message: string } | null;

const LOAD_FAILED = "Struk gagal dimuat. Periksa koneksi lalu muat ulang halaman ini.";

/** Membaca kode dari "#" (tidak pernah dikirim browser ke server), lalu memuat struk lewat aksi server. */
export function ReceiptEntry() {
  const [loaded, setLoaded] = useState<Loaded>(null);

  useEffect(() => {
    const code = decodeURIComponent(window.location.hash.slice(1)).trim();
    if (!code) {
      setLoaded({ state: "INVALID" });
      return;
    }
    let current = true;
    getPublicReceipt(code)
      .then((result) => {
        if (current) setLoaded(result.ok ? result.data : { state: "FAILED", message: result.error });
      })
      .catch(() => {
        if (current) setLoaded({ state: "FAILED", message: LOAD_FAILED });
      });
    return () => {
      current = false;
    };
  }, []);

  if (!loaded) return <p className="struk-pesan">Memuat…</p>;
  if (loaded.state === "VALID") {
    return (
      <div className="struk-halaman">
        <ReceiptPaper receipt={loaded.receipt} />
        <p className="struk-tengah struk-tanpa-cetak">
          <button type="button" className="struk-tombol" onClick={() => window.print()}>
            Cetak
          </button>
        </p>
      </div>
    );
  }
  const text = loaded.state === "CANCELLED" ? RECEIPT_CANCELLED_TEXT : loaded.state === "INVALID" ? RECEIPT_INVALID_TEXT : loaded.message;
  return (
    <p role="status" className="struk-pesan">
      {text}
    </p>
  );
}
```

`src/app/(public)/struk/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ReceiptEntry } from "@/components/receipt/receipt-entry";

export const metadata: Metadata = {
  title: "Struk",
  robots: { index: false, follow: false },
};

/** Halaman statis: kode ada di bagian "#" dan hanya dibaca browser (spec struk WA 4, 6). */
export default function ReceiptPage() {
  return <ReceiptEntry />;
}
```

Tambahkan di akhir `src/app/globals.css`:

```css
/* Struk tagihan (spec struk WA 6, 7.3): kertas putih bergaya struk kasir, di layar dan saat dicetak.
   Warna tetap (bukan token tema) karena meniru kertas struk dan dipakai halaman publik maupun panel. */
.struk-halaman {
  padding: 2rem 1rem 3rem;
}
.struk-kertas {
  width: 100%;
  max-width: 22rem;
  margin-inline: auto;
  padding: 1rem;
  background: #fff;
  color: #111;
  border: 1px dashed #bdbdbd;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  line-height: 1.45;
}
.struk-kertas hr {
  border: 0;
  border-top: 1px dashed #9e9e9e;
  margin: 0.5rem 0;
}
.struk-baris {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}
.struk-baris > span:last-child {
  text-align: right;
  white-space: nowrap;
}
.struk-daftar {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.struk-tengah {
  text-align: center;
}
.struk-penutup {
  margin-top: 0.75rem;
}
.struk-pesan {
  padding: 4rem 1rem;
  text-align: center;
}
.struk-tombol {
  margin-top: 1rem;
  padding: 0.5rem 1.5rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.struk-hanya-cetak {
  display: none;
}
@page struk {
  size: 80mm auto;
  margin: 3mm;
}
@media print {
  .struk-hanya-cetak {
    display: block !important;
  }
  .struk-kertas {
    page: struk;
    max-width: none;
    border: 0;
    padding: 0;
    font-size: 9pt;
  }
  .struk-tanpa-cetak,
  body:has(.struk-kertas) footer,
  body:has(.struk-kertas) .whatsapp-fab {
    display: none !important;
  }
  .struk-halaman {
    padding: 0;
  }
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/receipt-paper.test.tsx tests/unit/components/receipt-entry.test.tsx tests/unit/architecture.test.ts`
Expected: PASS (uji arsitektur tetap hijau: tanpa MUI di halaman publik, tanpa kata terlarang).

- [ ] **Step 5: Commit**

```bash
git add src/components/receipt src/app/\(public\)/struk src/app/globals.css tests/fixtures/receipt.ts tests/unit/components/receipt-paper.test.tsx tests/unit/components/receipt-entry.test.tsx
git commit -m "feat: public receipt page with print-friendly receipt paper"
```

---

### Task 6: Kirim struk via WA dan Ganti tautan di tagihan final

**Files:**
- Create: `src/components/admin/billing/receipt-send-dialog.tsx`, `src/components/admin/billing/receipt-reset-dialog.tsx`
- Modify: `src/components/admin/billing/invoice-final-view.tsx`, `src/app/(admin)/admin/tagihan/[id]/page.tsx`, `tests/unit/invoice-final-view.test.tsx`
- Test: `tests/unit/components/receipt-send-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 4 `getReceiptMessage`, `resetReceiptLink`, `getInvoiceReceipt`, `ReceiptMessage`; Task 5 `ReceiptPaper`.
- Produces: `ReceiptSendDialog({ invoiceId })`, `ReceiptResetDialog({ invoiceId })`; `InvoiceFinalView` prop baru opsional `receipt?: PublicReceipt | null` dan nilai `canSendReceipt` (Task 9 memakainya untuk tombol cetak).

- [ ] **Step 1: Tulis uji yang gagal** — `tests/unit/components/receipt-send-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptResetDialog } from "@/components/admin/billing/receipt-reset-dialog";
import { ReceiptSendDialog } from "@/components/admin/billing/receipt-send-dialog";
import { getReceiptMessage, resetReceiptLink } from "@/server/receipt";
import { toast } from "sonner";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/receipt", () => ({ getReceiptMessage: vi.fn(), resetReceiptLink: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEXT = "Halo Budi, terima kasih sudah berkunjung ke SunDY Clinic.\nLihat struk lengkap: https://x/struk#k";

beforeEach(() => vi.clearAllMocks());

describe("ReceiptSendDialog", () => {
  it("memuat pesan, menampilkan pratinjau, tautan Buka WhatsApp, dan Salin pesan", async () => {
    vi.mocked(getReceiptMessage).mockResolvedValue({ ok: true, data: { text: TEXT, link: "https://wa.me/6281?text=x" } });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderAdmin(<ReceiptSendDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Kirim struk via WA" }));
    const dialog = await screen.findByRole("dialog", { name: "Kirim struk" });
    expect(getReceiptMessage).toHaveBeenCalledWith("inv1");
    expect(await within(dialog).findByText(/Lihat struk lengkap: https:\/\/x\/struk#k/)).toBeInTheDocument();
    const open = within(dialog).getByRole("link", { name: "Buka WhatsApp" });
    expect(open).toHaveAttribute("href", "https://wa.me/6281?text=x");
    expect(open).toHaveAttribute("target", "_blank");
    await user.click(within(dialog).getByRole("button", { name: "Salin pesan" }));
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it("nomor pasien tidak sah: hanya Salin pesan", async () => {
    vi.mocked(getReceiptMessage).mockResolvedValue({ ok: true, data: { text: TEXT, link: null } });
    const user = userEvent.setup();
    renderAdmin(<ReceiptSendDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Kirim struk via WA" }));
    const dialog = await screen.findByRole("dialog", { name: "Kirim struk" });
    expect(await within(dialog).findByText("Nomor WhatsApp pasien tidak dikenali. Salin pesan lalu kirim manual.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Buka WhatsApp" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Salin pesan" })).toBeEnabled();
  });

  it("galat server tampil di dialog", async () => {
    vi.mocked(getReceiptMessage).mockResolvedValue({ ok: false, error: "Struk hanya untuk tagihan final." });
    const user = userEvent.setup();
    renderAdmin(<ReceiptSendDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Kirim struk via WA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Struk hanya untuk tagihan final.");
  });
});

describe("ReceiptResetDialog", () => {
  it("meminta konfirmasi lalu mengganti tautan", async () => {
    vi.mocked(resetReceiptLink).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ReceiptResetDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Ganti tautan" }));
    const dialog = await screen.findByRole("dialog", { name: "Ganti tautan struk?" });
    expect(dialog).toHaveTextContent("Tautan struk yang sudah terkirim tidak bisa dibuka lagi.");
    await user.click(within(dialog).getByRole("button", { name: "Ganti" }));
    await waitFor(() => expect(resetReceiptLink).toHaveBeenCalledWith("inv1"));
    expect(toast.success).toHaveBeenCalledWith("Tautan struk diganti. Kirim ulang struk bila perlu.");
  });

  it("galat tampil dan dialog tetap terbuka", async () => {
    vi.mocked(resetReceiptLink).mockResolvedValue({ ok: false, error: "Tautan struk hanya untuk tagihan final." });
    const user = userEvent.setup();
    renderAdmin(<ReceiptResetDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Ganti tautan" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Ganti tautan struk?" })).getByRole("button", { name: "Ganti" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tautan struk hanya untuk tagihan final.");
  });
});
```

Di `tests/unit/invoice-final-view.test.tsx`: tambahkan mock `vi.mock("@/server/receipt", () => ({ getReceiptMessage: vi.fn(), resetReceiptLink: vi.fn(), recordReceiptPrint: vi.fn() }));` setelah mock lain, impor `RECEIPT` dari `../fixtures/receipt`, lalu tambahkan dua uji di dalam `describe`:

```tsx
  it("tagihan final + invoice:manage: Kirim struk via WA dan Ganti tautan; struk khusus cetak terpasang", () => {
    const { container } = renderAdmin(
      <InvoiceFinalView detail={finalDetail()} receipt={RECEIPT} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />,
    );
    expect(screen.getByRole("button", { name: "Kirim struk via WA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ganti tautan" })).toBeInTheDocument();
    expect(container.querySelector(".struk-hanya-cetak")).not.toBeNull();
    expect(container.querySelector(".struk-tanpa-cetak")).not.toBeNull();
  });

  it("tanpa invoice:manage tidak ada aksi struk", () => {
    renderAdmin(<InvoiceFinalView detail={finalDetail()} receipt={RECEIPT} today="2026-10-07" canManage={false} canCorrect canSeeCost={false} />);
    expect(screen.queryByRole("button", { name: "Kirim struk via WA" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/receipt-send-dialog.test.tsx tests/unit/invoice-final-view.test.tsx`
Expected: FAIL (komponen belum ada; tombol tidak ada).

- [ ] **Step 3: Implementasi**

`src/components/admin/billing/receipt-send-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getReceiptMessage, type ReceiptMessage } from "@/server/receipt";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** "Kirim struk via WA" (spec struk WA 5): pesan dibuat server, resepsionis membuka WA atau menyalin. */
export function ReceiptSendDialog({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<ReceiptMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setOpen(true);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await getReceiptMessage(invoiceId);
        if (result.ok) setMessage(result.data);
        else setError(result.error);
      } catch {
        setError("Pesan struk gagal dibuat. Coba lagi.");
      }
    });
  }

  async function copy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.text);
      toast.success("Pesan disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <>
      <Button type="button" variant="outlined" color="success" onClick={load}>
        Kirim struk via WA
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Kirim struk</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          {pending && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Menyiapkan pesan…
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {message && (
            <>
              <Box component="p" sx={{ mt: 0, whiteSpace: "pre-line", fontSize: "0.875rem", p: 1.5, borderRadius: 1, bgcolor: "action.hover" }}>
                {message.text}
              </Box>
              {!message.link && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Nomor WhatsApp pasien tidak dikenali. Salin pesan lalu kirim manual.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="outlined" disabled={!message} onClick={() => void copy()}>
            Salin pesan
          </Button>
          {message?.link && (
            <Button component="a" href={message.link} target="_blank" rel="noopener noreferrer" variant="contained" color="success">
              Buka WhatsApp
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`src/components/admin/billing/receipt-reset-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resetReceiptLink } from "@/server/receipt";

/** "Ganti tautan" (spec S3): untuk tautan yang terkirim ke nomor yang salah. */
export function ReceiptResetDialog({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await resetReceiptLink(invoiceId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Tautan struk diganti. Kirim ulang struk bila perlu.");
        setOpen(false);
      } catch {
        setError("Tautan gagal diganti. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="text" size="small" onClick={() => setOpen(true)}>
        Ganti tautan
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Ganti tautan struk?</DialogTitle>
        <DialogContent>
          <DialogContentText>Tautan struk yang sudah terkirim tidak bisa dibuka lagi. Kirim ulang struk ke pasien dengan tautan baru.</DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="button" disabled={pending} onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button type="button" variant="contained" color="warning" disabled={pending} onClick={confirm}>
            Ganti
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

`src/components/admin/billing/invoice-final-view.tsx`:
- Tambah impor:

```tsx
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import type { PublicReceipt } from "@/lib/receipt";
import { ReceiptResetDialog } from "./receipt-reset-dialog";
import { ReceiptSendDialog } from "./receipt-send-dialog";
```

- Props tambahan (setelah `canSeeCost`): `receipt?: PublicReceipt | null;` (destrukturisasi `receipt = null`).
- Hitung `const canSendReceipt = canManage && isFinal && receipt !== null;`
- Root `<Stack spacing={3}>` diganti `<Stack spacing={3} className="struk-tanpa-cetak">`, dan seluruh return dibungkus fragmen dengan blok cetak di bawahnya:

```tsx
  return (
    <>
      <Stack spacing={3} className="struk-tanpa-cetak">
        {/* …isi lama tidak berubah… */}
      </Stack>
      {receipt && <ReceiptPaper receipt={receipt} className="struk-hanya-cetak" />}
    </>
  );
```

- Di baris tombol (`<Stack direction="row" … className="print:hidden" …>`), tepat setelah `<PrintButton />`:

```tsx
        {canSendReceipt && <ReceiptSendDialog invoiceId={detail.id} />}
        {canSendReceipt && <ReceiptResetDialog invoiceId={detail.id} />}
```

`src/app/(admin)/admin/tagihan/[id]/page.tsx`:
- impor `import { getInvoiceReceipt } from "@/server/receipt";`
- sebelum `return`, untuk tagihan bukan draf: `const receipt = detail.status === "DRAF" ? null : await getInvoiceReceipt(detail.id);`
- `PageHeader` dibungkus `<div className={detail.status === "DRAF" ? undefined : "struk-tanpa-cetak"}>…</div>`
- `InvoiceFinalView` menerima `receipt={receipt}`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/receipt-send-dialog.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS; `tsc` tanpa galat di `src`/`tests`.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/billing/receipt-send-dialog.tsx src/components/admin/billing/receipt-reset-dialog.tsx src/components/admin/billing/invoice-final-view.tsx "src/app/(admin)/admin/tagihan/[id]/page.tsx" tests/unit/components/receipt-send-dialog.test.tsx tests/unit/invoice-final-view.test.tsx
git commit -m "feat: send receipts over WhatsApp and reset receipt links from final invoices"
```

---

### Task 7: Perintah ESC/POS struk

**Files:**
- Create: `src/lib/receipt-escpos.ts`
- Test: `tests/unit/receipt-escpos.test.ts`

**Interfaces:**
- Consumes: Task 3 `PublicReceipt`, `formatReceiptDateTime`, `RECEIPT_STATUS_LABEL`.
- Produces: `type PaperWidth = 58 | 80`; `receiptColumns(width: PaperWidth): number`; `toPrinterText(text: string): string`; `wrapText(text: string, columns: number): string[]`; `buildEscPosReceipt(receipt: PublicReceipt, width: PaperWidth): string`; konstanta `ESC_INIT`, `CUT_PAPER`.

- [ ] **Step 1: Tulis uji yang gagal** — `tests/unit/receipt-escpos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PublicReceipt } from "@/lib/receipt";
import { buildEscPosReceipt, CUT_PAPER, ESC_INIT, receiptColumns, toPrinterText, wrapText } from "@/lib/receipt-escpos";

const RECEIPT: PublicReceipt = {
  clinicName: "SunDY Clinic",
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Mahakeret No. 1, Wenang, Manado, Sulawesi Utara",
  number: "TG-2026-0123",
  finalizedAt: new Date("2026-10-12T10:46:00Z"),
  cashierName: "Mey",
  customerName: "Priscillya Jenitha Chiantoery",
  lines: [
    { name: "Paket Lux", quantity: 1, unitPrice: 1_500_000, amount: 1_500_000 },
    { name: "Krim pelembap wajah dengan ekstrak sakura dan niacinamide untuk kulit sensitif", quantity: 2, unitPrice: 125_000, amount: 250_000 },
    { name: "Café latte é", quantity: 1, unitPrice: 25_000, amount: 25_000 },
  ],
  subtotal: 1_775_000,
  discount: 75_000,
  total: 1_700_000,
  paid: 1_000_000,
  balance: 700_000,
  payments: [{ paidAt: "2026-10-12", method: "QRIS", amount: 1_000_000 }],
  status: "SEBAGIAN",
};

/** Baris yang tercetak: perintah ESC/POS dibuang. */
function printedLines(data: string): string[] {
  return data
    .replace(/\x1B@|\x1Ba[\x00-\x02]|\x1BE[\x00\x01]|\x1DVA\x03/g, "")
    .split("\n");
}

describe("lebar dan teks printer", () => {
  it("80 mm = 48 kolom, 58 mm = 32 kolom", () => {
    expect(receiptColumns(80)).toBe(48);
    expect(receiptColumns(58)).toBe(32);
  });

  it("aksen, tanda pisah, dan spasi tak putus jadi ASCII", () => {
    expect(toPrinterText("Café — é\u00a0x · ü")).toBe("Cafe - e x - u");
    expect(toPrinterText("😀 emoji")).toBe("? emoji");
  });

  it("membungkus per kata dan memotong kata yang terlalu panjang", () => {
    expect(wrapText("satu dua tiga empat", 9)).toEqual(["satu dua", "tiga", "empat"]);
    expect(wrapText("abcdefghijkl", 5)).toEqual(["abcde", "fghij", "kl"]);
    expect(wrapText("", 5)).toEqual([""]);
  });
});

describe("buildEscPosReceipt", () => {
  for (const width of [80, 58] as const) {
    it(`${width} mm: tidak ada baris lebih lebar dari ${receiptColumns(width)} kolom`, () => {
      for (const line of printedLines(buildEscPosReceipt(RECEIPT, width))) {
        expect(line.length, JSON.stringify(line)).toBeLessThanOrEqual(receiptColumns(width));
      }
    });
  }

  it("diawali inisialisasi dan diakhiri potong kertas", () => {
    const data = buildEscPosReceipt(RECEIPT, 80);
    expect(data.startsWith(ESC_INIT)).toBe(true);
    expect(data.endsWith(CUT_PAPER)).toBe(true);
  });

  it("memuat kepala, item, diskon, pembayaran, sisa, dan status", () => {
    const text = printedLines(buildEscPosReceipt(RECEIPT, 80)).join("\n");
    for (const part of ["SunDY Clinic", "SunDY Mahakeret", "No.", "TG-2026-0123", "12 Okt 2026 pukul 18.46", "Kasir", "Mey", "Paket Lux", "1 x Rp 1.500.000", "Rp 1.500.000", "Diskon", "-Rp 75.000", "Total", "Rp 1.700.000", "QRIS", "Sisa", "Rp 700.000", "DIBAYAR SEBAGIAN", "Terima kasih", "Cafe latte e"]) {
      expect(text, part).toContain(part);
    }
    expect(text).not.toContain("é");
  });

  it("jumlah rata kanan di baris 'qty x harga'", () => {
    const line = printedLines(buildEscPosReceipt(RECEIPT, 80)).find((l) => l.startsWith("1 x Rp 1.500.000"))!;
    expect(line).toHaveLength(48);
    expect(line.endsWith("Rp 1.500.000")).toBe(true);
  });

  it("lunas tanpa diskon: tidak ada baris Diskon dan Sisa", () => {
    const text = printedLines(
      buildEscPosReceipt({ ...RECEIPT, discount: 0, total: 1_775_000, paid: 1_775_000, balance: 0, status: "LUNAS" }, 58),
    ).join("\n");
    expect(text).not.toMatch(/^Diskon/m);
    expect(text).not.toMatch(/^Sisa/m);
    expect(text).toContain("LUNAS");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/receipt-escpos.test.ts`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi** — `src/lib/receipt-escpos.ts`:

```ts
import { formatRupiah } from "./format";
import { formatReceiptDateTime, RECEIPT_STATUS_LABEL, type PublicReceipt } from "./receipt";
import { dateLabel, PAYMENT_METHOD_LABEL } from "./stock";

// Struk untuk printer thermal lewat QZ Tray (spec struk WA 7.1). Murni: hanya membangun teks perintah ESC/POS.

export type PaperWidth = 58 | 80;

export const ESC_INIT = "\x1B@";
const ALIGN_LEFT = "\x1Ba\x00";
const ALIGN_CENTER = "\x1Ba\x01";
const BOLD_ON = "\x1BE\x01";
const BOLD_OFF = "\x1BE\x00";
/** GS V 65 3: maju 3 baris lalu potong sebagian. Printer tanpa pemotong mengabaikannya. */
export const CUT_PAPER = "\x1DVA\x03";

export function receiptColumns(width: PaperWidth): number {
  return width === 58 ? 32 : 48;
}

/** Printer thermal memakai halaman kode terbatas: aksen dibuang, tanda baca khusus disederhanakan, sisanya "?". */
export function toPrinterText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/gu, "?");
}

/** Bungkus per kata; kata yang lebih panjang dari satu baris dipotong. */
export function wrapText(text: string, columns: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (rest.length > columns) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(rest.slice(0, columns));
      rest = rest.slice(columns);
    }
    if (!current) current = rest;
    else if (current.length + 1 + rest.length <= columns) current = `${current} ${rest}`;
    else {
      lines.push(current);
      current = rest;
    }
  }
  lines.push(current);
  return lines;
}

/** Kiri dibungkus, kanan rata kanan di baris terakhir (atau baris sendiri bila tidak muat). */
function twoColumns(left: string, right: string, columns: number): string[] {
  const room = columns - right.length - 1;
  if (room < 4) return [...wrapText(left, columns), right.padStart(columns)];
  const wrapped = wrapText(left, room);
  const last = wrapped.pop() ?? "";
  return [...wrapped, `${last.padEnd(columns - right.length)}${right}`];
}

export function buildEscPosReceipt(receipt: PublicReceipt, width: PaperWidth): string {
  const columns = receiptColumns(width);
  const text = (value: string) => toPrinterText(value);
  const rule = "-".repeat(columns);
  const lines: string[] = [];
  const row = (left: string, right: string) => lines.push(...twoColumns(text(left), text(right), columns));

  let out = ESC_INIT + ALIGN_CENTER + BOLD_ON;
  out += `${wrapText(text(receipt.clinicName), columns).join("\n")}\n${BOLD_OFF}`;
  out += `${[...wrapText(text(receipt.branchName), columns), ...wrapText(text(receipt.branchAddress), columns)].join("\n")}\n`;
  out += ALIGN_LEFT;

  lines.push(rule);
  row("No.", receipt.number);
  row("Tanggal", formatReceiptDateTime(receipt.finalizedAt));
  row("Kasir", receipt.cashierName);
  row("Atas nama", receipt.customerName);
  lines.push(rule);
  for (const line of receipt.lines) {
    lines.push(...wrapText(text(line.name), columns));
    row(`${line.quantity} x ${formatRupiah(line.unitPrice)}`, formatRupiah(line.amount));
  }
  lines.push(rule);
  row("Subtotal", formatRupiah(receipt.subtotal));
  if (receipt.discount > 0) row("Diskon", `-${formatRupiah(receipt.discount)}`);
  row("Total", formatRupiah(receipt.total));
  for (const payment of receipt.payments) {
    row(`${dateLabel(payment.paidAt)} ${PAYMENT_METHOD_LABEL[payment.method]}`, formatRupiah(payment.amount));
  }
  if (receipt.balance > 0) row("Sisa", formatRupiah(receipt.balance));
  lines.push(rule);
  out += `${lines.join("\n")}\n`;

  out += `${ALIGN_CENTER}${BOLD_ON}${text(RECEIPT_STATUS_LABEL[receipt.status])}${BOLD_OFF}\nTerima kasih\n`;
  return out + CUT_PAPER;
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/receipt-escpos.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutasi — nama panjang di 58 mm (Review Focus 3)**

Ganti sementara `lines.push(...wrapText(text(line.name), columns));` dengan `lines.push(text(line.name));` (tanpa pembungkusan). Run uji. Expected: FAIL pada uji lebar 58 dan 80 mm (nama krim yang panjang). Kembalikan; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/receipt-escpos.ts tests/unit/receipt-escpos.test.ts
git commit -m "feat: ESC/POS receipt builder for 58 and 80 mm thermal printers"
```

---

### Task 8: Tanda tangan QZ Tray di server

**Files:**
- Create: `src/server/qz-signing.ts`, `src/app/(admin)/admin/qz/sertifikat/route.ts`, `src/app/(admin)/admin/qz/tanda-tangan/route.ts`
- Test: `tests/integration/qz-routes.test.ts`

**Interfaces:**
- Produces: `readQzCertificate(): Promise<string | null>`, `signQzRequest(toSign: string): Promise<string | null>`; rute `GET /admin/qz/sertifikat` (teks sertifikat) dan `POST /admin/qz/tanda-tangan` (badan teks → tanda tangan base64), dipakai Task 9.

- [ ] **Step 1: Tulis uji yang gagal** — `tests/integration/qz-routes.test.ts`:

```ts
// @vitest-environment node
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(admin)/admin/qz/sertifikat/route";
import { POST } from "@/app/(admin)/admin/qz/tanda-tangan/route";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { state } = vi.hoisted(() => ({ state: { role: null as Role | null } }));
vi.mock("@/server/session", () => ({
  getCurrentStaff: vi.fn(async () => (state.role ? { userId: "u", staffId: "s", name: "Uji", role: state.role, email: "u@uji.test" } : null)),
}));

const ORIGIN = "https://sundyclinic.com";
const CERT = "-----BEGIN CERTIFICATE-----\nUJI\n-----END CERTIFICATE-----\n";
const sign = (body: string, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/qz/tanda-tangan`, { method: "POST", body, headers: { "content-type": "text/plain", ...headers } }));
const certificate = () => GET(new Request(`${ORIGIN}/admin/qz/sertifikat`));

let dir: string;
let publicKey: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sundy-qz-"));
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  publicKey = pair.publicKey;
  await writeFile(path.join(dir, "private-key.pem"), pair.privateKey);
  await writeFile(path.join(dir, "digital-certificate.txt"), CERT);
});
beforeEach(() => {
  state.role = "RESEPSIONIS";
  process.env.QZ_PRIVATE_KEY_FILE = path.join(dir, "private-key.pem");
  process.env.QZ_CERTIFICATE_FILE = path.join(dir, "digital-certificate.txt");
});
afterAll(async () => {
  delete process.env.QZ_PRIVATE_KEY_FILE;
  delete process.env.QZ_CERTIFICATE_FILE;
  await rm(dir, { recursive: true, force: true });
});

describe("sertifikat QZ", () => {
  it("staf yang login mendapat teks sertifikat tanpa cache", async () => {
    const response = await certificate();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CERT);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("tanpa login 401; tanpa berkas 404", async () => {
    state.role = null;
    expect((await certificate()).status).toBe(401);
    state.role = "RESEPSIONIS";
    delete process.env.QZ_CERTIFICATE_FILE;
    expect((await certificate()).status).toBe(404);
  });
});

describe("tanda tangan QZ", () => {
  it("menandatangani teks permintaan dengan SHA512 yang lolos verifikasi kunci publik", async () => {
    const response = await sign("permintaan-qz-123");
    expect(response.status).toBe(200);
    const signature = await response.text();
    expect(createVerify("SHA512").update("permintaan-qz-123").verify(publicKey, signature, "base64")).toBe(true);
  });

  it("menolak tanpa login, tanpa invoice:manage, dan dari asal lain", async () => {
    state.role = null;
    expect((await sign("x")).status).toBe(401);
    state.role = "ADMIN_KEUANGAN";
    expect((await sign("x")).status).toBe(403);
    state.role = "RESEPSIONIS";
    expect((await sign("x", { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await sign("x", { host: "sundyclinic.com" })).status).toBe(403);
  });

  it("badan kosong atau lebih dari 8 KB ditolak", async () => {
    expect((await sign("")).status).toBe(400);
    expect((await sign("a".repeat(8 * 1024 + 1))).status).toBe(413);
  });

  it("tanpa kunci 404 (QZ Tray jatuh ke mode tanpa tanda tangan)", async () => {
    delete process.env.QZ_PRIVATE_KEY_FILE;
    expect((await sign("x")).status).toBe(404);
    process.env.QZ_PRIVATE_KEY_FILE = path.join(dir, "tidak-ada.pem");
    expect((await sign("x")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run test:integration -- tests/integration/qz-routes.test.ts`
Expected: FAIL (rute tidak ada).

- [ ] **Step 3: Implementasi**

`src/server/qz-signing.ts`:

```ts
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Tanda tangan QZ Tray (spec struk WA 7.2). Kunci RSA PKCS#8 dan sertifikat dibaca dari berkas di server
 * (QZ_PRIVATE_KEY_FILE, QZ_CERTIFICATE_FILE) setiap permintaan, jadi bisa dipasang tanpa deploy ulang.
 * Null bila belum diatur: klien lalu memakai mode tanpa tanda tangan (QZ Tray menampilkan dialog izin).
 */
async function readOptional(file: string | undefined): Promise<string | null> {
  if (!file) return null;
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export function readQzCertificate(): Promise<string | null> {
  return readOptional(process.env.QZ_CERTIFICATE_FILE);
}

export async function signQzRequest(toSign: string): Promise<string | null> {
  const key = await readOptional(process.env.QZ_PRIVATE_KEY_FILE);
  return key ? createSign("SHA512").update(toSign).sign(key, "base64") : null;
}
```

`src/app/(admin)/admin/qz/sertifikat/route.ts`:

```ts
import { readQzCertificate } from "@/server/qz-signing";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Sertifikat publik untuk qz.security.setCertificatePromise; hanya untuk staf yang login. */
export async function GET(): Promise<Response> {
  if (!(await getCurrentStaff())) return new Response("Masuk dulu.", { status: 401 });
  const certificate = await readQzCertificate();
  if (!certificate) return new Response("Sertifikat QZ belum diatur.", { status: 404 });
  return new Response(certificate, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
```

`src/app/(admin)/admin/qz/tanda-tangan/route.ts`:

```ts
import { can } from "@/lib/permissions";
import { signQzRequest } from "@/server/qz-signing";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024;
const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * Asal permintaan harus situs ini sendiri, supaya situs lain tidak bisa meminjam tanda tangan SunDY untuk
 * mencetak lewat QZ Tray kasir. Disalin dari rute unggah BIA (lihat keputusan perencana 2).
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Tanda tangan SHA512 untuk qz.security.setSignaturePromise (spec struk WA 7.2). */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return text("Masuk dulu.", 401);
  if (!can(staff.role, "invoice:manage")) return text("Anda tidak berhak mencetak struk.", 403);
  if (!sameOrigin(request)) return text("Permintaan tidak sah.", 403);
  const body = await request.text();
  if (!body) return text("Permintaan kosong.", 400);
  if (Buffer.byteLength(body) > MAX_BYTES) return text("Permintaan terlalu besar.", 413);
  const signature = await signQzRequest(body);
  return signature ? text(signature, 200) : text("Kunci QZ belum diatur.", 404);
}
```

Catatan: `GET` sertifikat tidak memakai `request`; ujinya memanggil `GET(new Request(...))` — Next mengizinkan handler tanpa parameter, dan argumen lebih di JS diabaikan. Bila TypeScript menolak di uji, ubah uji menjadi `GET()` (Ruling).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm run test:integration -- tests/integration/qz-routes.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"`
Expected: PASS 6/6; tanpa galat tipe.

- [ ] **Step 5: Commit**

```bash
git add src/server/qz-signing.ts "src/app/(admin)/admin/qz" tests/integration/qz-routes.test.ts
git commit -m "feat: QZ Tray certificate and SHA512 signing routes"
```

---

### Task 9: Cetak struk lewat QZ Tray dan pengaturan printer

**Files:**
- Modify: `package.json`, `package-lock.json` (`qz-tray` 2.3.0)
- Create: `src/types/qz-tray.d.ts`, `src/components/admin/billing/receipt-printer.ts`, `src/components/admin/billing/printer-settings-dialog.tsx`, `src/components/admin/billing/receipt-print-button.tsx`
- Modify: `src/components/admin/billing/invoice-final-view.tsx`
- Test: `tests/unit/components/receipt-printer.test.ts`, `tests/unit/components/receipt-print-button.test.tsx`

**Interfaces:**
- Consumes: Task 4 `recordReceiptPrint`; Task 6 `canSendReceipt` di `invoice-final-view.tsx`; Task 7 `buildEscPosReceipt`, `PaperWidth`; Task 8 rute `/admin/qz/sertifikat`, `/admin/qz/tanda-tangan`.
- Produces: `PrinterSettings = { printer: string; width: PaperWidth }`, `loadPrinterSettings()`, `savePrinterSettings(s)`, `PRINTER_SETTINGS_KEY`, `PrinterError` (`kind: "NOT_CONNECTED" | "PRINTER_MISSING" | "PRINT_FAILED"`), `listPrinters(): Promise<string[]>`, `printRaw(printer: string, data: string): Promise<void>`; komponen `ReceiptPrintButton({ invoiceId, receipt })`, `PrinterSettingsDialog({ open, onClose, onSaved })`.

- [ ] **Step 1: Pasang dependensi**

Run: `npm install qz-tray@2.3.0 --save-exact`
Expected: `package.json` memuat `"qz-tray": "2.3.0"`; `git diff --stat package-lock.json` hanya menambah entri `qz-tray` (bila lockfile berubah ratusan baris, batalkan dan ulangi; catat Ruling).

- [ ] **Step 2: Tulis uji yang gagal**

`tests/unit/components/receipt-printer.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const qz = vi.hoisted(() => ({
  websocket: { isActive: vi.fn(() => false), connect: vi.fn(async () => {}) },
  security: { setCertificatePromise: vi.fn(), setSignatureAlgorithm: vi.fn(), setSignaturePromise: vi.fn() },
  printers: { find: vi.fn(async () => ["EPSON TM-T82", "Microsoft Print to PDF"]) },
  configs: { create: vi.fn((printer: string) => ({ printer })) },
  print: vi.fn(async () => {}),
}));
vi.mock("qz-tray", () => ({ default: qz }));

import { listPrinters, loadPrinterSettings, printRaw, PrinterError, PRINTER_SETTINGS_KEY, savePrinterSettings } from "@/components/admin/billing/receipt-printer";

beforeEach(() => {
  vi.clearAllMocks();
  qz.websocket.isActive.mockReturnValue(false);
  window.localStorage.clear();
});

describe("pengaturan printer per komputer", () => {
  it("tersimpan di localStorage dan dibaca lagi; isi rusak dianggap belum diatur", () => {
    expect(loadPrinterSettings()).toBeNull();
    savePrinterSettings({ printer: "EPSON TM-T82", width: 58 });
    expect(loadPrinterSettings()).toEqual({ printer: "EPSON TM-T82", width: 58 });
    window.localStorage.setItem(PRINTER_SETTINGS_KEY, "{rusak");
    expect(loadPrinterSettings()).toBeNull();
    window.localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify({ printer: "X", width: 70 }));
    expect(loadPrinterSettings()).toBeNull();
  });
});

describe("QZ Tray", () => {
  it("menyambung sekali dengan sertifikat dan tanda tangan SHA512 dari rute panel", async () => {
    expect(await listPrinters()).toEqual(["EPSON TM-T82", "Microsoft Print to PDF"]);
    expect(qz.security.setSignatureAlgorithm).toHaveBeenCalledWith("SHA512");
    expect(qz.websocket.connect).toHaveBeenCalledTimes(1);
  });

  it("QZ Tray tidak berjalan → NOT_CONNECTED", async () => {
    qz.websocket.connect.mockRejectedValueOnce(new Error("Unable to establish connection"));
    await expect(listPrinters()).rejects.toMatchObject({ kind: "NOT_CONNECTED" });
  });

  it("mencetak data mentah ke printer yang ada", async () => {
    await printRaw("EPSON TM-T82", "DATA");
    expect(qz.configs.create).toHaveBeenCalledWith("EPSON TM-T82");
    expect(qz.print).toHaveBeenCalledWith({ printer: "EPSON TM-T82" }, [{ type: "raw", format: "command", flavor: "plain", data: "DATA" }]);
  });

  it("printer tersimpan sudah tidak ada → PRINTER_MISSING; gagal cetak → PRINT_FAILED dengan pesannya", async () => {
    await expect(printRaw("Printer Lama", "DATA")).rejects.toMatchObject({ kind: "PRINTER_MISSING" });
    qz.print.mockRejectedValueOnce(new Error("Kertas habis"));
    const error = await printRaw("EPSON TM-T82", "DATA").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrinterError);
    expect(error).toMatchObject({ kind: "PRINT_FAILED", message: "Kertas habis" });
  });
});
```

`tests/unit/components/receipt-print-button.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptPrintButton } from "@/components/admin/billing/receipt-print-button";
import { listPrinters, loadPrinterSettings, printRaw, PrinterError, savePrinterSettings } from "@/components/admin/billing/receipt-printer";
import { recordReceiptPrint } from "@/server/receipt";
import { toast } from "sonner";
import { renderAdmin } from "../helpers/render-admin";
import { RECEIPT } from "../../fixtures/receipt";

vi.mock("@/server/receipt", () => ({ recordReceiptPrint: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/admin/billing/receipt-printer", async () => {
  const actual = await vi.importActual<typeof import("@/components/admin/billing/receipt-printer")>("@/components/admin/billing/receipt-printer");
  return { ...actual, listPrinters: vi.fn(), printRaw: vi.fn(), loadPrinterSettings: vi.fn(), savePrinterSettings: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPrinters).mockResolvedValue(["EPSON TM-T82"]);
  vi.mocked(printRaw).mockResolvedValue();
  vi.mocked(recordReceiptPrint).mockResolvedValue({ ok: true, data: undefined });
});

describe("ReceiptPrintButton", () => {
  it("belum diatur: pengaturan dulu, lalu mencetak ke printer pilihan dan mencatat audit", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue(null);
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    const dialog = await screen.findByRole("dialog", { name: "Pengaturan printer struk" });
    await waitFor(() => expect(within(dialog).getByLabelText("Printer")).toHaveValue("EPSON TM-T82"));
    await user.selectOptions(within(dialog).getByLabelText("Lebar kertas"), "58");
    await user.click(within(dialog).getByRole("button", { name: "Simpan dan cetak" }));
    await waitFor(() => expect(printRaw).toHaveBeenCalledTimes(1));
    expect(savePrinterSettings).toHaveBeenCalledWith({ printer: "EPSON TM-T82", width: 58 });
    const [printer, data] = vi.mocked(printRaw).mock.calls[0];
    expect(printer).toBe("EPSON TM-T82");
    expect(data).toContain("TG-2026-0123");
    expect(recordReceiptPrint).toHaveBeenCalledWith("inv1");
    expect(toast.success).toHaveBeenCalledWith("Struk dicetak.");
  });

  it("sudah diatur: langsung mencetak tanpa dialog", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue({ printer: "EPSON TM-T82", width: 80 });
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    await waitFor(() => expect(printRaw).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("QZ Tray tidak tersambung: pesan jelas, tombol tetap bisa dipakai", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue({ printer: "EPSON TM-T82", width: 80 });
    vi.mocked(printRaw).mockRejectedValueOnce(new PrinterError("NOT_CONNECTED", "x"));
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi.");
    expect(screen.getByRole("button", { name: "Cetak struk" })).toBeEnabled();
    expect(recordReceiptPrint).not.toHaveBeenCalled();
  });

  it("printer tersimpan hilang: pesan menyebut namanya dan dialog pengaturan terbuka", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue({ printer: "Printer Lama", width: 80 });
    vi.mocked(printRaw).mockRejectedValueOnce(new PrinterError("PRINTER_MISSING", "x"));
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    expect(await screen.findByRole("dialog", { name: "Pengaturan printer struk" })).toHaveTextContent("Printer «Printer Lama» tidak ditemukan. Pilih printer lagi.");
  });

  it("gagal cetak: pesan QZ Tray ditampilkan apa adanya", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue({ printer: "EPSON TM-T82", width: 80 });
    vi.mocked(printRaw).mockRejectedValueOnce(new PrinterError("PRINT_FAILED", "Kertas habis"));
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kertas habis");
  });

  it("dialog pengaturan: QZ Tray tidak tersambung saat memuat daftar printer", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue(null);
    vi.mocked(listPrinters).mockRejectedValueOnce(new PrinterError("NOT_CONNECTED", "x"));
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Pengaturan printer" }));
    const dialog = await screen.findByRole("dialog", { name: "Pengaturan printer struk" });
    expect(await within(dialog).findByText("QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npx vitest run tests/unit/components/receipt-printer.test.ts tests/unit/components/receipt-print-button.test.tsx`
Expected: FAIL (modul tidak ada).

- [ ] **Step 4: Implementasi**

`src/types/qz-tray.d.ts`:

```ts
// Tipe minimal qz-tray 2.3 yang dipakai SunDY (receipt-printer.ts). Bukan definisi lengkap pustaka.
declare module "qz-tray" {
  type Resolver<T> = (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void;
  type PrintData = { type: "raw"; format: "command"; flavor: "plain"; data: string };
  const qz: {
    websocket: { isActive(): boolean; connect(options?: { retries?: number; delay?: number }): Promise<void> };
    security: {
      setCertificatePromise(resolver: Resolver<string>): void;
      setSignatureAlgorithm(algorithm: "SHA512"): void;
      setSignaturePromise(factory: (toSign: string) => Resolver<string>): void;
    };
    printers: { find(query?: string): Promise<string[] | string> };
    configs: { create(printer: string): unknown };
    print(config: unknown, data: PrintData[]): Promise<void>;
  };
  export default qz;
}
```

`src/components/admin/billing/receipt-printer.ts`:

```ts
import type { PaperWidth } from "@/lib/receipt-escpos";

// Cetak struk lewat QZ Tray (spec struk WA 7). Pustakanya dimuat hanya saat dibutuhkan.

export type PrinterSettings = { printer: string; width: PaperWidth };
export const PRINTER_SETTINGS_KEY = "sundy:printer-struk";

export class PrinterError extends Error {
  constructor(
    readonly kind: "NOT_CONNECTED" | "PRINTER_MISSING" | "PRINT_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "PrinterError";
  }
}

/** Pengaturan per komputer kasir; null bila belum diatur, rusak, atau penyimpanan browser tidak bisa dipakai. */
export function loadPrinterSettings(): PrinterSettings | null {
  try {
    const raw = window.localStorage.getItem(PRINTER_SETTINGS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PrinterSettings>;
    return typeof value.printer === "string" && value.printer && (value.width === 58 || value.width === 80)
      ? { printer: value.printer, width: value.width }
      : null;
  } catch {
    return null;
  }
}

export function savePrinterSettings(settings: PrinterSettings): void {
  try {
    window.localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Penyimpanan browser ditolak: kasir akan diminta memilih printer lagi lain kali.
  }
}

/** Teks dari rute panel; string kosong bila tidak tersedia, sehingga QZ Tray memakai mode tanpa tanda tangan. */
async function fetchText(url: string, init?: RequestInit): Promise<string> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  }
}

let configured = false;

async function connectedQz() {
  const qz = (await import("qz-tray")).default;
  if (!configured) {
    qz.security.setCertificatePromise((resolve) => void fetchText("/admin/qz/sertifikat").then(resolve));
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((toSign) => (resolve) =>
      void fetchText("/admin/qz/tanda-tangan", { method: "POST", headers: { "content-type": "text/plain" }, body: toSign }).then(resolve),
    );
    configured = true;
  }
  if (!qz.websocket.isActive()) {
    try {
      await qz.websocket.connect({ retries: 0, delay: 0 });
    } catch (error) {
      throw new PrinterError("NOT_CONNECTED", error instanceof Error ? error.message : String(error));
    }
  }
  return qz;
}

export async function listPrinters(): Promise<string[]> {
  const qz = await connectedQz();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : [found];
}

export async function printRaw(printer: string, data: string): Promise<void> {
  const qz = await connectedQz();
  const printers = await listPrinters();
  if (!printers.includes(printer)) throw new PrinterError("PRINTER_MISSING", printer);
  try {
    await qz.print(qz.configs.create(printer), [{ type: "raw", format: "command", flavor: "plain", data }]);
  } catch (error) {
    throw new PrinterError("PRINT_FAILED", error instanceof Error ? error.message : String(error));
  }
}
```

Catatan untuk uji: `configured` adalah variabel modul; uji "menyambung sekali" memeriksa `setSignatureAlgorithm` dipanggil — urutan uji menjamin panggilan pertama terjadi di uji itu. Bila urutan berubah, reset dengan `vi.resetModules()` (Ruling).

`src/components/admin/billing/printer-settings-dialog.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { PaperWidth } from "@/lib/receipt-escpos";
import { SelectField } from "../mui/select-field";
import { listPrinters, loadPrinterSettings, PrinterError, type PrinterSettings } from "./receipt-printer";

export const QZ_NOT_CONNECTED = "QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi.";

/** Printer dan lebar kertas untuk komputer ini (spec struk WA 7.1). */
export function PrinterSettingsDialog({
  open,
  notice,
  saveLabel,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Pesan di atas isian, mis. printer tersimpan tidak ditemukan. */
  notice?: string | null;
  saveLabel: string;
  onClose: () => void;
  onSaved: (settings: PrinterSettings) => void;
}) {
  const [printers, setPrinters] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printer, setPrinter] = useState("");
  const [width, setWidth] = useState<PaperWidth>(80);

  useEffect(() => {
    if (!open) return;
    let current = true;
    const saved = loadPrinterSettings();
    setPrinters(null);
    setError(null);
    setWidth(saved?.width ?? 80);
    listPrinters()
      .then((found) => {
        if (!current) return;
        setPrinters(found);
        setPrinter(saved && found.includes(saved.printer) ? saved.printer : (found[0] ?? ""));
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof PrinterError && cause.kind === "NOT_CONNECTED" ? QZ_NOT_CONNECTED : "Daftar printer gagal dimuat.");
      });
    return () => {
      current = false;
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Pengaturan printer struk</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {notice && <Alert severity="warning">{notice}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {!printers && !error && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Mencari printer…
            </Typography>
          )}
          {printers && (
            <SelectField id="printer-struk" label="Printer" value={printer} onChange={setPrinter}>
              {printers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField id="lebar-kertas" label="Lebar kertas" value={String(width)} onChange={(value) => setWidth(value === "58" ? 58 : 80)}>
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </SelectField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose}>
          Batal
        </Button>
        <Button type="button" variant="contained" disabled={!printer} onClick={() => onSaved({ printer, width })}>
          {saveLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

`src/components/admin/billing/receipt-print-button.tsx`:

```tsx
"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { useState } from "react";
import { toast } from "sonner";
import type { PublicReceipt } from "@/lib/receipt";
import { buildEscPosReceipt } from "@/lib/receipt-escpos";
import { recordReceiptPrint } from "@/server/receipt";
import { PrinterSettingsDialog, QZ_NOT_CONNECTED } from "./printer-settings-dialog";
import { loadPrinterSettings, PrinterError, printRaw, savePrinterSettings, type PrinterSettings } from "./receipt-printer";

/** "Cetak struk" ke printer thermal lewat QZ Tray (spec struk WA 7.1). */
export function ReceiptPrintButton({ invoiceId, receipt }: { invoiceId: string; receipt: PublicReceipt }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ printAfterSave: boolean; notice: string | null } | null>(null);

  async function print(settings: PrinterSettings) {
    setBusy(true);
    setError(null);
    try {
      await printRaw(settings.printer, buildEscPosReceipt(receipt, settings.width));
      toast.success("Struk dicetak.");
      // Catatan audit saja; struk sudah tercetak walau pencatatan gagal.
      void recordReceiptPrint(invoiceId).catch(() => undefined);
    } catch (cause) {
      if (cause instanceof PrinterError && cause.kind === "PRINTER_MISSING") {
        setDialog({ printAfterSave: true, notice: `Printer «${settings.printer}» tidak ditemukan. Pilih printer lagi.` });
      } else if (cause instanceof PrinterError && cause.kind === "NOT_CONNECTED") {
        setError(QZ_NOT_CONNECTED);
      } else {
        setError(cause instanceof Error ? cause.message : "Struk gagal dicetak.");
      }
    } finally {
      setBusy(false);
    }
  }

  function start() {
    const settings = loadPrinterSettings();
    if (settings) void print(settings);
    else setDialog({ printAfterSave: true, notice: null });
  }

  return (
    <>
      <Button type="button" variant="contained" disabled={busy} onClick={start}>
        {busy ? "Mencetak…" : "Cetak struk"}
      </Button>
      <Button type="button" variant="text" size="small" onClick={() => setDialog({ printAfterSave: false, notice: null })}>
        Pengaturan printer
      </Button>
      {error && (
        <Alert severity="error" sx={{ width: "100%" }}>
          {error}
        </Alert>
      )}
      <PrinterSettingsDialog
        open={dialog !== null}
        notice={dialog?.notice}
        saveLabel={dialog?.printAfterSave ? "Simpan dan cetak" : "Simpan"}
        onClose={() => setDialog(null)}
        onSaved={(settings) => {
          savePrinterSettings(settings);
          const printAfterSave = dialog?.printAfterSave ?? false;
          setDialog(null);
          if (printAfterSave) void print(settings);
          else toast.success("Pengaturan printer disimpan.");
        }}
      />
    </>
  );
}
```

`invoice-final-view.tsx`: impor `import { ReceiptPrintButton } from "./receipt-print-button";` dan tambahkan tepat sebelum `{canSendReceipt && <ReceiptSendDialog …`:

```tsx
        {canSendReceipt && receipt && <ReceiptPrintButton invoiceId={detail.id} receipt={receipt} />}
```

Di `tests/unit/invoice-final-view.test.tsx` tambahkan mock `vi.mock("@/components/admin/billing/receipt-printer", () => ({ loadPrinterSettings: vi.fn(() => null), savePrinterSettings: vi.fn(), listPrinters: vi.fn(async () => []), printRaw: vi.fn(), PrinterError: class extends Error {} }));` dan harapan `expect(screen.getByRole("button", { name: "Cetak struk" })).toBeInTheDocument();` di uji "tagihan final + invoice:manage".

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx vitest run tests/unit/components/receipt-printer.test.ts tests/unit/components/receipt-print-button.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit 2>&1 | grep "^src\|^tests"; npm run lint`
Expected: PASS; tanpa galat tipe; lint bersih.

- [ ] **Step 6: Mutasi — QZ tidak tersambung (Review Focus 4)**

Ubah sementara `catch (error) { throw new PrinterError("NOT_CONNECTED", …) }` di `connectedQz` menjadi `catch (error) { throw error; }`. Expected: FAIL pada "QZ Tray tidak berjalan → NOT_CONNECTED". Kembalikan; PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/types/qz-tray.d.ts src/components/admin/billing/receipt-printer.ts src/components/admin/billing/printer-settings-dialog.tsx src/components/admin/billing/receipt-print-button.tsx src/components/admin/billing/invoice-final-view.tsx tests/unit/components/receipt-printer.test.ts tests/unit/components/receipt-print-button.test.tsx tests/unit/invoice-final-view.test.tsx
git commit -m "feat: print receipts to thermal printers through QZ Tray"
```

---

### Task 10: E2E dan runbook

**Files:**
- Create: `tests/e2e/struk.spec.ts`
- Modify: `docs/operasional/server-sundy.md` (bagian baru "Printer struk (QZ Tray)")

**Interfaces:**
- Consumes: semua tugas sebelumnya; `buatPasienBaru` (`tests/e2e/helpers/pasien-baru.ts`), `signIn` (`tests/e2e/helpers/quiz`), `E2E_RESEPSIONIS` (`tests/e2e/credentials`), `tungguHidrasi` (`tests/e2e/helpers/mui`).

- [ ] **Step 1: Tulis E2E** — `tests/e2e/struk.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_RESEPSIONIS } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

test.setTimeout(180_000);

test("resepsionis mengirim struk via WA; tautan terbuka tanpa login; Ganti tautan mematikannya; cetak tanpa QZ Tray memberi pesan jelas", async ({ page, browser }, testInfo) => {
  const suffix = `${testInfo.project.name === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const saleDialog = page.getByRole("dialog", { name: "Penjualan langsung" });
  await saleDialog.getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(page, { name: `Pelanggan Struk ${suffix}`, whatsapp: `0813${Date.now().toString().slice(-8)}` });
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });

  await page.getByRole("button", { name: "+ Baris layanan" }).click();
  const lineDialog = page.getByRole("dialog", { name: "Tambah baris layanan" });
  await lineDialog.getByLabel("Nama", { exact: true }).fill(`Layanan Struk ${suffix}`);
  await lineDialog.getByLabel("Harga").fill("250000");
  await lineDialog.getByRole("button", { name: "Tambah" }).click();
  await expect(lineDialog).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Kirim struk via WA" }).click();
  const sendDialog = page.getByRole("dialog", { name: "Kirim struk" });
  const open = sendDialog.getByRole("link", { name: "Buka WhatsApp" });
  await expect(open).toHaveAttribute("href", /^https:\/\/wa\.me\/62\d+\?text=/, { timeout: 30_000 });
  const text = decodeURIComponent(new URL((await open.getAttribute("href"))!).searchParams.get("text")!);
  expect(text).toContain("Total: Rp 250.000 (sisa Rp 250.000)");
  const receiptUrl = /(https?:\/\/\S+\/struk#\S+)/.exec(text)![1];
  await sendDialog.getByRole("button", { name: "Close" }).click();

  const visitor = await browser.newContext();
  const guest = await visitor.newPage();
  await guest.goto(receiptUrl);
  const paper = guest.getByRole("region", { name: /^Struk TG-\d{4}-\d{4}$/ });
  await expect(paper).toContainText(`Layanan Struk ${suffix}`, { timeout: 30_000 });
  await expect(paper).toContainText("Rp 250.000");
  await expect(paper).toContainText("BELUM DIBAYAR");
  await guest.emulateMedia({ media: "print" });
  await expect(guest.getByRole("button", { name: "Cetak" })).toBeHidden();
  await guest.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: "Ganti tautan" }).click();
  await page.getByRole("dialog", { name: "Ganti tautan struk?" }).getByRole("button", { name: "Ganti" }).click();
  await expect(page.getByText("Tautan struk diganti. Kirim ulang struk bila perlu.")).toBeVisible({ timeout: 30_000 });
  await guest.reload();
  await expect(guest.getByText("Tautan struk tidak berlaku.")).toBeVisible({ timeout: 30_000 });
  await visitor.close();

  // Komputer uji tidak menjalankan QZ Tray: dialog pengaturan menyebutnya dengan jelas.
  await page.getByRole("button", { name: "Cetak struk" }).click();
  const settings = page.getByRole("dialog", { name: "Pengaturan printer struk" });
  await expect(settings.getByText("QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi.")).toBeVisible({ timeout: 60_000 });
});
```

- [ ] **Step 2: Jalankan E2E**

Run: `npx playwright test tests/e2e/struk.spec.ts --project=desktop --workers=1` lalu `--project=mobile`
Expected: PASS di keduanya. Juga jalankan ulang `tests/e2e/tagihan.spec.ts` (desktop dan mobile) karena tampilan tagihan final berubah: PASS.

- [ ] **Step 3: Runbook** — tambahkan bagian baru di `docs/operasional/server-sundy.md` sebelum "## 10. Riwayat pembersihan" (beri nomor 9a agar nomor lain tidak bergeser):

````markdown
## 9a. Printer struk (QZ Tray)

Tombol "Cetak struk" di tagihan final mengirim struk ke printer thermal lewat QZ Tray di komputer kasir
(spec `docs/superpowers/specs/2026-10-12-struk-whatsapp-design.md` bagian 7). Supaya QZ Tray tidak bertanya
"izinkan?" setiap mencetak, situs menandatangani permintaan dengan kunci di server.

**Membuat kunci (sekali, lewat SSH):**

```bash
sudo -u sundyapp -H bash -c '
  mkdir -p /www/sundy/shared/qz && chmod 700 /www/sundy/shared/qz && cd /www/sundy/shared/qz &&
  openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
    -keyout private-key.pem -out digital-certificate.txt -subj "/CN=SunDY Clinic/O=SunDY Clinic" &&
  chmod 600 private-key.pem && chmod 644 digital-certificate.txt'
```

Lalu tambahkan ke `/www/sundy/shared/.env` dan restart aplikasi (`pm2 restart sundy` sebagai `sundyapp`):

```
QZ_PRIVATE_KEY_FILE=/www/sundy/shared/qz/private-key.pem
QZ_CERTIFICATE_FILE=/www/sundy/shared/qz/digital-certificate.txt
```

Isi `private-key.pem` tidak pernah disalin ke chat, git, atau komputer lain. Folder `qz/` tidak ikut backup
harian; bila hilang, buat kunci baru dan pasang ulang sertifikatnya di semua komputer kasir.

**Di setiap komputer kasir (pemilik, sekali):**
1. Salin isi `digital-certificate.txt` (sertifikat publik, boleh dibagikan) ke berkas
   `C:\Program Files\QZ Tray\override.crt` (perlu hak administrator Windows).
2. Keluar dari QZ Tray (ikon di baki sistem → Exit), lalu buka lagi.
3. Di SunDY: buka tagihan final → "Pengaturan printer" → pilih printer dan lebar kertas → Simpan.

Versi QZ Tray minimal 2.1. Tanpa kunci di server, "Cetak struk" tetap jalan dengan dialog izin QZ Tray.
````

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/struk.spec.ts docs/operasional/server-sundy.md
git commit -m "test: e2e for WhatsApp receipts and document QZ Tray setup"
```

---

## Self-Review (hasil pemeriksaan penulis rencana)

**Cakupan spec:** §3 kolom → Task 1; §4 kode → Task 2; §5 panel (Kirim, Salin, Ganti, audit) → Task 4 + 6; §6 halaman publik (isi, larangan, dibatalkan, tidak berlaku, laju, noindex, Cetak) → Task 3, 4, 5; §7.1 cetak QZ (pengaturan per komputer, isi, galat, audit) → Task 7 + 9; §7.2 tanda tangan → Task 8 + runbook Task 10; §7.3 cetak browser sempit → Task 5 (CSS) + Task 6 (blok cetak panel); §9 keamanan → Task 4, 8; §10 pengujian → semua tugas; §11 rilis (kunci di server, `override.crt`, versi QZ) → Task 10 runbook.

**Pindai placeholder:** tiga instruksi bersyarat sengaja (format bulan di Task 3, `GET()` di Task 8, `vi.resetModules` di Task 9), masing-masing dengan tindakan pasti dan kewajiban Ruling.

**Konsistensi tipe:** `PublicReceipt`/`ReceiptSource` (Task 3) dipakai Task 4, 5, 6, 7, 9; `ReceiptMessage` (Task 4) dipakai Task 6; `PaperWidth` (Task 7) dipakai Task 9; `QZ_NOT_CONNECTED` didefinisikan di `printer-settings-dialog.tsx` dan dipakai `receipt-print-button.tsx`; label "Kirim struk via WA", "Ganti tautan", "Cetak struk", "Pengaturan printer", "Pengaturan printer struk", "Kirim struk", "Buka WhatsApp", "Salin pesan" sama di komponen, uji unit, dan E2E.
