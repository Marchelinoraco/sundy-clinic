# Plan — UI Panel Admin Bagian D: Tampilan Seragam & Dasbor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semua halaman panel admin memakai satu gaya (gaya A: judul besar, kartu putih), dan Dasbor menampilkan pekerjaan hari ini, garis waktu jadwal per tenaga, daftar dokter, serta angka minggu atau bulan ini untuk Super Admin.

**Architecture:**
- **Komponen halaman bersama** dibuat sekali (`page-layout`, `page-tabs`, `stat-tile`, `rupiah-input`), lalu setiap halaman dipindah ke komponen itu.
- **Aturan murni dasbor** ada di `src/lib/dashboard.ts`: sapaan, periode WITA, dan geometri garis waktu.
- **Data dasbor** dibaca di `src/server/dashboard.ts` dengan pemeriksaan hak per bagian. Setiap bagian dimuat terpisah, sehingga satu bagian yang gagal tidak menjatuhkan yang lain.
- **Jadwal** mendapat dua aksi server baru (simpan seminggu, hapus pengecualian).
- **Booking Baru** bisa dibuka dengan isian awal yang diperiksa di server.
- **Tanpa migrasi.**

**Tech Stack:** Next.js 15.5 App Router · React 19 · Prisma 7.10 + PostgreSQL · Tailwind v4 · shadcn/ui (Radix) · Vitest 4 + Testing Library + user-event · Playwright

**Spec:** `docs/superpowers/specs/2026-10-02-ui-tampilan-dasbor-design.md` (D1–D9, bagian 3–7). Alur halaman Booking, Booking Baru, Pengingat, Isian, dan Kunjungan dari spec B dan C1–C3 tetap berlaku.

**Base branch:** `desain-dasbor` (berisi spec dan plan ini). Kerjakan di branch baru `tampilan-dasbor` dari branch itu.

## Global Constraints

- **Bahasa kode:** pengenal, nama berkas, dan nama fungsi memakai bahasa Inggris. Bahasa Indonesia hanya untuk teks yang dilihat pengguna dan komentar.
- **Zona waktu:** WITA (`src/lib/time.ts`). Minggu dihitung Senin–Minggu, bulan dari tanggal 1.
- **Hak akses** (dicek di server dengan `requireCapability`, tidak hanya disembunyikan):
  - pekerjaan hari ini dan jadwal hari ini: `booking:manage`;
  - daftar dokter: `record:read`;
  - Angka: `report:read`, **dicabut dari Dokter** sehingga hanya Super Admin yang memegangnya;
  - aksi jadwal: `schedule:manage`.
- **Tanpa migrasi database.** Biaya booking masuk dihitung dari catatan audit `appointment.verify`.
- **Dependensi:** tidak ada dependensi baru.
- **Berkas `"use server"`** hanya mengekspor fungsi `async` (ekspor tipe boleh). `src/server/dashboard.ts` dan `src/server/booking-prefill.ts` **bukan** `"use server"`: keduanya hanya dipanggil dari server component.
- **Halaman di `src/app`** tidak mengimpor `@/lib/db` atau `@prisma/client`. Komponen tidak mengimpor `@/lib/db`; tipe dari modul server diimpor dengan `import type`.
- **Format kode:** repo tidak memakai Prettier. Ikuti format kode di sekitarnya.
- **Tampilan:**
  - huruf judul `font-display` (Cormorant);
  - warna dari token SunDY (`gold-*`, `cream-*`, `brown-*`, `bg-card`);
  - semua halaman bisa dipakai di lebar 390 px tanpa gulir mendatar di seluruh halaman; tabel boleh digulir di dalam kartunya.
- **Uji:**
  - uji integrasi ke `sundy_test` (`npm run test:integration`), dan jangan dijalankan bersamaan dengan `npm run test:e2e`;
  - uji integrasi dasbor memakai tanggal **2031** agar angka tidak tercampur data uji lain.
- **Commit:**
  - Conventional Commits berbahasa Inggris, dengan baris penutup `Co-Authored-By` yang menyebut model yang benar-benar menulis commit itu;
  - **jangan pernah mengubah atau men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Booking di luar jam kerja tenaga** (mis. booking uji pukul 06.00 sementara jam kerja 11.00–19.00) harus tetap terlihat di garis waktu. Sumbu jam ikut melebar → uji di Task 2 dan Task 4.
2. **Tenaga yang tidak praktik hari ini tetapi punya booking** tetap mendapat lajur, tidak masuk "Tidak praktik hari ini" → uji di Task 3.
3. **Dasbor dibuka malam hari** setelah jam tutup: tidak ada tautan slot kosong, garis "sekarang" tidak tampil, dan blok booking tetap tampil → uji di Task 4.
4. **Masukan rupiah yang ditempel** ("Rp 1.000.000", "1.000.000,-", huruf) dibaca sebagai angka. Mengosongkan harga coret menghasilkan `null` → uji di Task 1 dan Task 8.
5. **Jam kerja: mencentang lalu membatalkan centang hari yang sama** tidak membuat formulir dianggap berubah. Menutup semua hari diizinkan dan menghapus semua jam kerja tenaga itu → uji di Task 6.

---

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `src/components/admin/page-layout.tsx` (baru) | `PageHeader`, `PageBody`, `SectionCard`, `EmptyState`, `FailedSection` |
| `src/components/admin/page-tabs.tsx` (baru), `src/lib/page-tabs.ts` (baru) | tab berbasis tautan `?tab=` dan `resolveTab` |
| `src/components/admin/stat-tile.tsx` (baru) | kotak angka bertautan |
| `src/lib/rupiah-input.ts`, `src/components/admin/rupiah-input.tsx` (baru) | masukan rupiah |
| `src/components/admin/admin-header.tsx` | bar atas: judul kecil, `<h1>` hanya bila `heading` |
| `src/lib/dashboard.ts` (baru), `src/lib/slot.ts`, `src/lib/settle.ts` (baru) | sapaan, periode, garis waktu, `workingWindows`, `settle` |
| `src/server/dashboard.ts` (baru), `src/server/reminder.ts`, `src/lib/permissions.ts` | data dasbor, `getReminderCounts`, `report:read` hanya Super Admin |
| `src/app/(admin)/admin/page.tsx`, `src/components/admin/dashboard-work.tsx`, `schedule-timeline.tsx`, `dashboard-numbers.tsx` (baru), `doctor-worklist.tsx` | halaman dasbor |
| `src/lib/booking-prefill.ts`, `src/server/booking-prefill.ts` (baru), `src/server/patient.ts`, `src/components/admin/appointment-form.tsx`, `src/app/(admin)/admin/booking/baru/page.tsx` | Booking Baru dengan isian awal |
| `src/lib/schedule-week.ts` (baru), `src/server/schedule.ts`, `src/components/admin/weekly-schedule-form.tsx`, `schedule-exception-list.tsx` (baru), `holiday-list.tsx`, `src/app/(admin)/admin/jadwal/page.tsx`; hapus `schedule-template-form.tsx` | Jadwal |
| `src/lib/age.ts` (baru), `src/server/patient.ts`, `src/components/admin/patient-detail-view.tsx`, `src/app/(admin)/admin/pasien/page.tsx`, `pasien/[id]/page.tsx` | Pasien & Data Pasien |
| `src/components/admin/service-price-table.tsx` (baru), `src/app/(admin)/admin/layanan/page.tsx`; hapus `service-price-form.tsx` | Layanan & Harga |
| `src/components/admin/clinic-setting-form.tsx`, `staff-table.tsx`, `src/app/(admin)/admin/pengaturan/page.tsx`, `staf/page.tsx` | Pengaturan & Staf |
| halaman Booking, Booking Baru, Pengingat, Isian, Kunjungan | kepala halaman baru |
| `tests/e2e/dasbor.spec.ts`, `tests/e2e/tampilan-admin.spec.ts` (baru) | uji ujung-ke-ujung |

---

### Task 1: Komponen halaman bersama dan masukan rupiah

**Files:**
- Create: `src/components/admin/page-layout.tsx`, `src/components/admin/page-tabs.tsx`, `src/lib/page-tabs.ts`, `src/components/admin/stat-tile.tsx`, `src/lib/rupiah-input.ts`, `src/components/admin/rupiah-input.tsx`
- Modify: `src/components/admin/admin-header.tsx`
- Test: `tests/unit/components/page-layout.test.tsx`, `tests/unit/page-tabs.test.ts`, `tests/unit/components/rupiah-input.test.tsx`

**Interfaces:**
- Produces:
  - `Crumb = { label: string; href?: string }`
  - `PageHeader({ title: string; description?: ReactNode; trail?: Crumb[]; actions?: ReactNode })`: satu-satunya `<h1>` di halaman
  - `PageBody({ children; wide?: boolean })`
  - `SectionCard({ title: string; description?: ReactNode; actions?: ReactNode; flush?: boolean; className?: string; children })`: `<section aria-label={title}>`
  - `EmptyState({ children })`, `FailedSection({ title: string })`
  - `PageTab = { id: string; label: string; href: string }`, `PageTabs({ tabs: PageTab[]; active: string; label: string })`
  - `resolveTab<T extends string>(value: string | string[] | undefined, ids: readonly T[], fallback?: T): T`
  - `StatTile({ label: string; value: ReactNode; note?: string | null; href: string; attention?: boolean })`
  - `parseRupiahText(text: string): number | null`, `rupiahInputText(value: number | null): string`
  - `RupiahInput({ id?; value: number | null; onChange: (value: number | null) => void; placeholder?; className?; "aria-label"? })`
  - `AdminHeader({ title: string; heading?: boolean })`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/page-tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveTab } from "@/lib/page-tabs";

const TABS = ["jam-kerja", "pengecualian", "hari-libur"] as const;

describe("resolveTab", () => {
  it("memakai tab yang dikenal", () => {
    expect(resolveTab("pengecualian", TABS)).toBe("pengecualian");
  });

  it("tab tidak dikenal, kosong, atau ganda kembali ke tab pertama atau cadangan", () => {
    expect(resolveTab("salah", TABS)).toBe("jam-kerja");
    expect(resolveTab(undefined, TABS)).toBe("jam-kerja");
    expect(resolveTab(["pengecualian", "hari-libur"], TABS)).toBe("jam-kerja");
    expect(resolveTab(undefined, TABS, "hari-libur")).toBe("hari-libur");
  });
});
```

`tests/unit/components/page-layout.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState, FailedSection, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { StatTile } from "@/components/admin/stat-tile";
import { AdminHeader } from "@/components/admin/admin-header";

describe("PageHeader", () => {
  it("judul sebagai satu-satunya h1, keterangan, jejak, dan aksi", () => {
    render(
      <PageHeader
        title="Maria Wenas"
        description="SDY-2026-0012"
        trail={[{ label: "Pasien", href: "/admin/pasien" }, { label: "Maria Wenas" }]}
        actions={<button type="button">+ Booking</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Maria Wenas" })).toBeInTheDocument();
    expect(screen.getByText("SDY-2026-0012")).toBeInTheDocument();
    const trail = screen.getByRole("navigation", { name: "Jejak halaman" });
    expect(within(trail).getByRole("link", { name: "Pasien" })).toHaveAttribute("href", "/admin/pasien");
    expect(within(trail).getByText("Maria Wenas")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "+ Booking" })).toBeInTheDocument();
  });

  it("tanpa jejak dan aksi tetap rapi", () => {
    render(<PageHeader title="Staf" />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Staf" })).toBeInTheDocument();
  });
});

describe("SectionCard", () => {
  it("menjadi region bernama judulnya, dengan aksi di kepala kartu", () => {
    render(
      <SectionCard title="Jadwal hari ini" actions={<a href="/admin/booking">Buka daftar Booking →</a>}>
        <EmptyState>Tidak ada jadwal praktik hari ini.</EmptyState>
      </SectionCard>,
    );
    const card = screen.getByRole("region", { name: "Jadwal hari ini" });
    expect(within(card).getByRole("heading", { level: 2, name: "Jadwal hari ini" })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Buka daftar Booking →" })).toBeInTheDocument();
    expect(within(card).getByText("Tidak ada jadwal praktik hari ini.")).toBeInTheDocument();
  });

  it("bagian yang gagal dimuat menulis pesan yang sama", () => {
    render(<FailedSection title="Angka" />);
    expect(within(screen.getByRole("region", { name: "Angka" })).getByText("Gagal dimuat. Muat ulang halaman.")).toBeInTheDocument();
  });
});

describe("PageTabs", () => {
  it("tab aktif ditandai aria-current", () => {
    render(
      <PageTabs
        label="Bagian jadwal"
        active="pengecualian"
        tabs={[
          { id: "jam-kerja", label: "Jam kerja", href: "/admin/jadwal?tab=jam-kerja" },
          { id: "pengecualian", label: "Pengecualian (2)", href: "/admin/jadwal?tab=pengecualian" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Bagian jadwal" });
    expect(within(nav).getByRole("link", { name: "Pengecualian (2)" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Jam kerja" })).not.toHaveAttribute("aria-current");
  });
});

describe("StatTile", () => {
  it("seluruh kotak adalah tautan, dengan varian perlu tindakan", () => {
    const { rerender } = render(
      <StatTile label="Menunggu konfirmasi" value={3} note="1 lewat batas transfer" href="/admin/booking" attention />,
    );
    const tile = screen.getByRole("link", { name: /Menunggu konfirmasi/ });
    expect(tile).toHaveAttribute("href", "/admin/booking");
    expect(tile).toHaveTextContent("3");
    expect(tile).toHaveTextContent("1 lewat batas transfer");
    expect(tile).toHaveAttribute("data-attention", "true");

    rerender(<StatTile label="Booking hari ini" value={0} href="/admin/booking" />);
    expect(screen.getByRole("link", { name: /Booking hari ini/ })).not.toHaveAttribute("data-attention");
  });
});

describe("AdminHeader", () => {
  it("bar atas tidak memakai h1 kecuali diminta", () => {
    const { rerender } = render(<AdminHeader title="Booking" />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText("Booking")).toBeInTheDocument();
    rerender(<AdminHeader title="Kunjungan" heading />);
    expect(screen.getByRole("heading", { level: 1, name: "Kunjungan" })).toBeInTheDocument();
  });
});
```

`AdminHeader` memakai `SidebarTrigger`, yang membutuhkan `SidebarProvider`. Tambahkan mock di awal berkas uji, setelah impor:

```tsx
import { vi } from "vitest";
vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => <button type="button">Sidebar</button> }));
```

(Gabungkan `vi` ke baris impor `vitest` yang sudah ada.)

`tests/unit/components/rupiah-input.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RupiahInput } from "@/components/admin/rupiah-input";
import { parseRupiahText, rupiahInputText } from "@/lib/rupiah-input";

describe("parseRupiahText", () => {
  it("hanya angka yang dibaca, termasuk teks yang ditempel", () => {
    expect(parseRupiahText("189000")).toBe(189000);
    expect(parseRupiahText("Rp 1.000.000")).toBe(1000000);
    expect(parseRupiahText("1.000.000,-")).toBe(1000000);
    expect(parseRupiahText("Rp 99.000 abc")).toBe(99000);
  });

  it("kosong atau tanpa angka berarti null; lebih dari 12 digit dipotong", () => {
    expect(parseRupiahText("")).toBeNull();
    expect(parseRupiahText("Rp ")).toBeNull();
    expect(parseRupiahText("abc")).toBeNull();
    expect(parseRupiahText("1234567890123")).toBe(123456789012);
  });
});

describe("rupiahInputText", () => {
  it("menulis rupiah, atau kosong untuk null", () => {
    expect(rupiahInputText(189000)).toBe("Rp 189.000");
    expect(rupiahInputText(0)).toBe("Rp 0");
    expect(rupiahInputText(null)).toBe("");
  });
});

function Harness({ initial, onChange }: { initial: number | null; onChange: (value: number | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <RupiahInput
      aria-label="Harga coret"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("RupiahInput", () => {
  it("diketik sebagai angka dan ditampilkan sebagai rupiah", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={null} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Harga coret" });
    await user.type(input, "189000");
    expect(input).toHaveValue("Rp 189.000");
    expect(onChange).toHaveBeenLastCalledWith(189000);
  });

  it("dikosongkan menjadi null", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={250000} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Harga coret" });
    expect(input).toHaveValue("Rp 250.000");
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/page-tabs.test.ts tests/unit/components/page-layout.test.tsx tests/unit/components/rupiah-input.test.tsx`
Expected: FAIL. Modul-modulnya belum ada.

- [ ] **Step 3: Tulis `src/lib/page-tabs.ts`**

```ts
/**
 * Tab halaman disimpan di alamat (`?tab=`), agar tetap sama setelah dimuat ulang
 * dan bisa dibagikan. Nilai yang tidak dikenal kembali ke cadangan (spec D 3.1).
 */
export function resolveTab<T extends string>(
  value: string | string[] | undefined,
  ids: readonly T[],
  fallback: T = ids[0],
): T {
  return typeof value === "string" && (ids as readonly string[]).includes(value) ? (value as T) : fallback;
}
```

- [ ] **Step 4: Tulis `src/components/admin/page-layout.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * Kepala halaman gaya A (spec D 3.1): judul besar Cormorant, keterangan satu
 * baris, jejak opsional, dan aksi di kanan yang turun ke bawah judul di layar sempit.
 * Satu-satunya <h1> di halaman.
 */
export function PageHeader({
  title,
  description,
  trail,
  actions,
}: {
  title: string;
  description?: ReactNode;
  trail?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {trail && trail.length > 0 && (
          <nav aria-label="Jejak halaman" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1">
              {trail.map((crumb, index) => {
                const last = index === trail.length - 1;
                return (
                  <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                    {crumb.href && !last ? (
                      <Link href={crumb.href} className="underline-offset-4 hover:underline">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                    )}
                    {!last && <span aria-hidden>›</span>}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <h1 className="font-display text-3xl font-semibold leading-tight text-brown-900">{title}</h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Jarak tepi dan lebar isi yang sama di semua halaman. Halaman kunjungan memakai `wide`. */
export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn("mx-auto w-full space-y-6 p-4 sm:p-6", wide ? "max-w-none" : "max-w-6xl")}>{children}</div>;
}

/** Kartu bagian: judul, aksi kecil di kanan, lalu isi. `flush` untuk tabel yang menempel ke tepi kartu. */
export function SectionCard({
  title,
  description,
  actions,
  flush = false,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={cn("min-w-0 rounded-xl border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-medium text-brown-900">{title}</h2>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 text-sm">{actions}</div>}
      </div>
      <div className={cn("min-w-0", flush ? "overflow-x-auto" : "p-4")}>{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Bagian dasbor yang gagal dimuat (spec D 4.7). */
export function FailedSection({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <EmptyState>Gagal dimuat. Muat ulang halaman.</EmptyState>
    </SectionCard>
  );
}
```

- [ ] **Step 5: Tulis `page-tabs.tsx` dan `stat-tile.tsx`**

`src/components/admin/page-tabs.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

export type PageTab = { id: string; label: string; href: string };

/** Tab sebagai tautan (`?tab=`), bukan tab ARIA: setiap tab adalah alamat sendiri (spec D 3.1). */
export function PageTabs({ tabs, active, label }: { tabs: PageTab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="overflow-x-auto border-b">
      <ul className="flex gap-6">
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block whitespace-nowrap border-b-2 py-2 text-sm",
                  current ? "border-gold-500 font-semibold text-brown-900" : "border-transparent text-muted-foreground hover:text-brown-900",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

`src/components/admin/stat-tile.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Kotak angka dasbor (spec D 3.1): seluruh kotak bertautan; `attention` bergaris emas. */
export function StatTile({
  label,
  value,
  note,
  href,
  attention = false,
}: {
  label: string;
  value: ReactNode;
  note?: string | null;
  href: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      data-attention={attention ? "true" : undefined}
      className={cn(
        "block rounded-xl border bg-card p-4 transition-colors hover:border-gold-400",
        attention && "border-gold-400 bg-gold-300/10",
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-display text-4xl font-semibold leading-tight text-brown-900">{value}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </Link>
  );
}
```

- [ ] **Step 6: Tulis masukan rupiah**

`src/lib/rupiah-input.ts`:

```ts
import { formatRupiah } from "./format";

/** Harga paling banyak 12 digit (ratusan miliar rupiah); sisanya dipotong. */
const MAX_DIGITS = 12;

/** Membaca teks ketikan atau tempelan ("Rp 1.000.000", "1.000.000,-") sebagai angka bulat; tanpa angka = null. */
export function parseRupiahText(text: string): number | null {
  const digits = text.replace(/\D/g, "").slice(0, MAX_DIGITS);
  return digits ? Number(digits) : null;
}

export function rupiahInputText(value: number | null): string {
  return value === null ? "" : formatRupiah(value);
}
```

`src/components/admin/rupiah-input.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { parseRupiahText, rupiahInputText } from "@/lib/rupiah-input";

/** Masukan harga: diketik sebagai angka, tampil "Rp 189.000"; yang diteruskan tetap angka bulat (spec D 5.4). */
export function RupiahInput({
  id,
  value,
  onChange,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      value={rupiahInputText(value)}
      onChange={(e) => onChange(parseRupiahText(e.target.value))}
    />
  );
}
```

- [ ] **Step 7: Bar atas tanpa h1 (`src/components/admin/admin-header.tsx`)**

Ganti seluruh isi berkas dengan:

```tsx
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Bar atas setiap halaman admin. Judul besar halaman ada di PageHeader (spec D 3.2), jadi
 * judul di sini bukan <h1> — kecuali halaman tanpa PageHeader (Kunjungan) yang memintanya.
 */
export function AdminHeader({ title, heading = false }: { title: string; heading?: boolean }) {
  const Title = heading ? "h1" : "span";
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Title className="text-sm font-medium">{title}</Title>
    </header>
  );
}
```

- [ ] **Step 8: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/page-tabs.test.ts tests/unit/components/page-layout.test.tsx tests/unit/components/rupiah-input.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/page-layout.tsx src/components/admin/page-tabs.tsx src/lib/page-tabs.ts src/components/admin/stat-tile.tsx src/lib/rupiah-input.ts src/components/admin/rupiah-input.tsx src/components/admin/admin-header.tsx tests/unit/page-tabs.test.ts tests/unit/components/page-layout.test.tsx tests/unit/components/rupiah-input.test.tsx
git commit -m "feat: add shared admin page components and a rupiah input"
```

---

### Task 2: Aturan murni dasbor

**Files:**
- Create: `src/lib/dashboard.ts`, `src/lib/settle.ts`
- Modify: `src/lib/slot.ts` (ekspor `workingWindows`, dipakai `getAvailableSlots`)
- Test: `tests/unit/dashboard.test.ts`, `tests/unit/settle.test.ts`, `tests/unit/slot.test.ts` (tambah)

**Interfaces:**
- Produces:
  - `greetingFor(now: Date): string`
  - `DASHBOARD_PERIODS`, `DashboardPeriod = "minggu" | "bulan"`, `parsePeriod(value): DashboardPeriod`
  - `TimeRange = { start: Date; end: Date }`, `periodRanges(period, now): { current: TimeRange; previous: TimeRange; label: string; previousLabel: string }`
  - `MinuteWindow = { startMinute: number; endMinute: number }`
  - `timelineAxis(ranges: MinuteWindow[]): MinuteWindow | null`, `timelineHours(axis): number[]`, `timelinePosition(startMinute, endMinute, axis): { left: number; width: number } | null`
  - `TimelineTone = "menunggu" | "terkonfirmasi" | "hadir" | "tidak-hadir"`, `timelineTone(status): TimelineTone | null`
  - `deltaLabel(current: number, previous: number): string`
  - `clinicDayLabel(input: { holidayName: string | null; windows: MinuteWindow[] }): string`
  - `workingWindows(input: { template: WorkWindow | null; exceptions: ScheduleExceptionInput[]; isHoliday: boolean }): WorkWindow[]` (di `src/lib/slot.ts`)
  - `Settled<T> = { ok: true; data: T } | { ok: false }`, `settle<T>(promise: Promise<T>, label: string): Promise<Settled<T>>`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/dashboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clinicDayLabel,
  deltaLabel,
  greetingFor,
  parsePeriod,
  periodRanges,
  timelineAxis,
  timelineHours,
  timelinePosition,
  timelineTone,
} from "@/lib/dashboard";

// Jam WITA = UTC + 8.
const wita = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);

describe("greetingFor (spec D 4.1)", () => {
  it.each([
    ["03:59", "Selamat malam"],
    ["04:00", "Selamat pagi"],
    ["10:59", "Selamat pagi"],
    ["11:00", "Selamat siang"],
    ["14:59", "Selamat siang"],
    ["15:00", "Selamat sore"],
    ["17:59", "Selamat sore"],
    ["18:00", "Selamat malam"],
    ["23:30", "Selamat malam"],
  ])("pukul %s WITA → %s", (time, greeting) => {
    expect(greetingFor(wita("2031-02-12", time))).toBe(greeting);
  });
});

describe("parsePeriod", () => {
  it("bawaan minggu; bulan hanya bila diminta", () => {
    expect(parsePeriod(undefined)).toBe("minggu");
    expect(parsePeriod("bulan")).toBe("bulan");
    expect(parsePeriod("tahun")).toBe("minggu");
    expect(parsePeriod(["bulan"])).toBe("minggu");
  });
});

describe("periodRanges (spec D 4.5)", () => {
  it("minggu ini: Senin 00.00 sampai sekarang, dibanding minggu lalu sampai jam yang sama", () => {
    const now = wita("2031-02-13", "15:20"); // Kamis
    const r = periodRanges("minggu", now);
    expect(r.current).toEqual({ start: wita("2031-02-10", "00:00"), end: now });
    expect(r.previous).toEqual({ start: wita("2031-02-03", "00:00"), end: wita("2031-02-06", "15:20") });
    expect(r.previousLabel).toBe("minggu lalu");
  });

  it("Minggu (hari) masih bagian minggu yang dimulai Senin sebelumnya", () => {
    const r = periodRanges("minggu", wita("2031-02-16", "10:00")); // Minggu
    expect(r.current.start).toEqual(wita("2031-02-10", "00:00"));
  });

  it("Senin pukul 00.30: minggu baru baru berjalan setengah jam", () => {
    const now = wita("2031-02-17", "00:30");
    const r = periodRanges("minggu", now);
    expect(r.current).toEqual({ start: wita("2031-02-17", "00:00"), end: now });
    expect(r.previous).toEqual({ start: wita("2031-02-10", "00:00"), end: wita("2031-02-10", "00:30") });
  });

  it("bulan ini: tanggal 1 sampai sekarang, dibanding bulan lalu sampai tanggal dan jam yang sama", () => {
    const now = wita("2031-02-12", "09:00");
    const r = periodRanges("bulan", now);
    expect(r.current).toEqual({ start: wita("2031-02-01", "00:00"), end: now });
    expect(r.previous).toEqual({ start: wita("2031-01-01", "00:00"), end: wita("2031-01-12", "09:00") });
    expect(r.previousLabel).toBe("bulan lalu");
  });

  it("31 Maret dibanding Februari berhenti di akhir Februari", () => {
    const r = periodRanges("bulan", wita("2031-03-31", "12:00"));
    expect(r.previous).toEqual({ start: wita("2031-02-01", "00:00"), end: wita("2031-03-01", "00:00") });
  });

  it("Januari dibanding Desember tahun sebelumnya", () => {
    const r = periodRanges("bulan", wita("2031-01-05", "08:00"));
    expect(r.previous).toEqual({ start: wita("2030-12-01", "00:00"), end: wita("2030-12-05", "08:00") });
  });
});

describe("garis waktu (spec D 4.3)", () => {
  it("sumbu mencakup jam kerja DAN booking di luarnya, dibulatkan ke jam penuh", () => {
    expect(
      timelineAxis([
        { startMinute: 660, endMinute: 1140 }, // 11.00–19.00
        { startMinute: 360, endMinute: 390 }, // booking 06.00–06.30
        { startMinute: 1150, endMinute: 1175 }, // booking 19.10–19.35
      ]),
    ).toEqual({ startMinute: 360, endMinute: 1200 });
    expect(timelineAxis([])).toBeNull();
  });

  it("jam penanda dari awal sampai akhir sumbu", () => {
    expect(timelineHours({ startMinute: 660, endMinute: 900 })).toEqual([11, 12, 13, 14, 15]);
  });

  it("posisi dan lebar dalam persen; di luar sumbu terpotong atau hilang", () => {
    const axis = { startMinute: 600, endMinute: 1200 }; // 10.00–20.00
    expect(timelinePosition(660, 690, axis)).toEqual({ left: 10, width: 5 });
    expect(timelinePosition(1170, 1260, axis)).toEqual({ left: 95, width: 5 });
    expect(timelinePosition(500, 540, axis)).toBeNull();
  });

  it("warna menurut status; batal dan kedaluwarsa tidak ditampilkan", () => {
    expect(timelineTone("MENUNGGU_KONFIRMASI")).toBe("menunggu");
    expect(timelineTone("TERKONFIRMASI")).toBe("terkonfirmasi");
    expect(timelineTone("HADIR")).toBe("hadir");
    expect(timelineTone("SELESAI")).toBe("hadir");
    expect(timelineTone("TIDAK_HADIR")).toBe("tidak-hadir");
    expect(timelineTone("DIBATALKAN")).toBeNull();
    expect(timelineTone("KEDALUWARSA")).toBeNull();
  });
});

describe("label lain", () => {
  it("selisih angka", () => {
    expect(deltaLabel(23, 19)).toBe("+4");
    expect(deltaLabel(3, 5)).toBe("−2");
    expect(deltaLabel(6, 6)).toBe("sama");
  });

  it("jam buka klinik hari ini", () => {
    expect(clinicDayLabel({ holidayName: null, windows: [{ startMinute: 660, endMinute: 1140 }, { startMinute: 720, endMinute: 1080 }] })).toBe(
      "klinik buka 11.00–19.00",
    );
    expect(clinicDayLabel({ holidayName: null, windows: [] })).toBe("tidak ada jadwal praktik hari ini");
    expect(clinicDayLabel({ holidayName: "Hari Raya Natal", windows: [] })).toBe("Klinik tutup hari ini — Hari Raya Natal");
  });
});
```

`tests/unit/settle.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { settle } from "@/lib/settle";

describe("settle (spec D 4.7)", () => {
  it("hasil sukses dibungkus ok", async () => {
    expect(await settle(Promise.resolve(3), "angka")).toEqual({ ok: true, data: 3 });
  });

  it("galat tidak dilempar ulang, tetapi dicatat di log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await settle(Promise.reject(new Error("putus")), "jadwal")).toEqual({ ok: false });
    expect(log).toHaveBeenCalledWith("[dasbor] jadwal gagal dimuat", expect.any(Error));
    log.mockRestore();
  });
});
```

Tambahkan ke akhir `tests/unit/slot.test.ts`. Gabungkan `workingWindows` ke baris impor `@/lib/slot`:

```ts
describe("workingWindows", () => {
  it("jam kerja + jam tambahan, dikurangi blokir sebagian", () => {
    expect(
      workingWindows({
        template: FULL_DAY,
        exceptions: [
          { kind: "JAM_TAMBAHAN", startMinute: 1140, endMinute: 1200 },
          { kind: "BLOKIR_SEBAGIAN", startMinute: 720, endMinute: 780 },
        ],
        isHoliday: false,
      }),
    ).toEqual([
      { startMinute: 660, endMinute: 720 },
      { startMinute: 780, endMinute: 1140 },
      { startMinute: 1140, endMinute: 1200 },
    ]);
  });

  it("libur, cuti, atau tanpa jam kerja: tidak ada jendela", () => {
    expect(workingWindows({ template: FULL_DAY, exceptions: [], isHoliday: true })).toEqual([]);
    expect(
      workingWindows({ template: FULL_DAY, exceptions: [{ kind: "LIBUR", startMinute: null, endMinute: null }], isHoliday: false }),
    ).toEqual([]);
    expect(workingWindows({ template: null, exceptions: [], isHoliday: false })).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/dashboard.test.ts tests/unit/settle.test.ts tests/unit/slot.test.ts`
Expected: FAIL. `@/lib/dashboard` dan `@/lib/settle` belum ada, dan `workingWindows` belum diekspor.

- [ ] **Step 3: Ekspor `workingWindows` dari `src/lib/slot.ts`**

Ganti awal badan `getAvailableSlots`:

```ts
export function getAvailableSlots(input: GetAvailableSlotsInput): SlotOption[] {
  if (input.isHoliday) return [];
  if (input.exceptions.some((e) => e.kind === "LIBUR")) return [];

  const windows: WorkWindow[] = [];
  if (input.template) windows.push(input.template);
  for (const e of input.exceptions) {
    if (e.kind === "JAM_TAMBAHAN" && e.startMinute !== null && e.endMinute !== null) {
      windows.push({ startMinute: e.startMinute, endMinute: e.endMinute });
    }
  }
  if (windows.length === 0) return [];

  const blocks: WorkWindow[] = input.exceptions
    .filter((e) => e.kind === "BLOKIR_SEBAGIAN" && e.startMinute !== null && e.endMinute !== null)
    .map((e) => ({ startMinute: e.startMinute!, endMinute: e.endMinute! }));

  const freeWindows = windows.flatMap((w) => subtractBlocks(w, blocks));
```

dengan:

```ts
export function getAvailableSlots(input: GetAvailableSlotsInput): SlotOption[] {
  const freeWindows = workingWindows(input);
  if (freeWindows.length === 0) return [];
```

Tambahkan fungsi ini tepat sebelum `getAvailableSlots`:

```ts
/**
 * Jendela kerja sehari: jam kerja + jam tambahan, dikurangi blokir sebagian.
 * Kosong pada hari libur, cuti, atau tanpa jam kerja. Dipakai mesin slot dan
 * garis waktu dasbor (spec D 4.3), agar keduanya selalu sepakat.
 */
export function workingWindows(input: {
  template: WorkWindow | null;
  exceptions: ScheduleExceptionInput[];
  isHoliday: boolean;
}): WorkWindow[] {
  if (input.isHoliday) return [];
  if (input.exceptions.some((e) => e.kind === "LIBUR")) return [];

  const windows: WorkWindow[] = [];
  if (input.template) windows.push({ startMinute: input.template.startMinute, endMinute: input.template.endMinute });
  for (const e of input.exceptions) {
    if (e.kind === "JAM_TAMBAHAN" && e.startMinute !== null && e.endMinute !== null) {
      windows.push({ startMinute: e.startMinute, endMinute: e.endMinute });
    }
  }

  const blocks: WorkWindow[] = input.exceptions
    .filter((e) => e.kind === "BLOKIR_SEBAGIAN" && e.startMinute !== null && e.endMinute !== null)
    .map((e) => ({ startMinute: e.startMinute!, endMinute: e.endMinute! }));

  return windows.flatMap((w) => subtractBlocks(w, blocks));
}
```

- [ ] **Step 4: Tulis `src/lib/dashboard.ts`**

```ts
import type { AppointmentStatusValue } from "./appointment-status";
import { formatShortIndonesianDate } from "./format";
import { addDaysToDateString, combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay, witaWeekday } from "./time";

/** Sapaan kepala dasbor menurut jam WITA (spec D 4.1). */
export function greetingFor(now: Date): string {
  const hour = Math.floor(witaMinutesOfDay(now) / 60);
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

export const DASHBOARD_PERIODS = ["minggu", "bulan"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export function parsePeriod(value: string | string[] | undefined): DashboardPeriod {
  return value === "bulan" ? "bulan" : "minggu";
}

export type TimeRange = { start: Date; end: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Periode Angka dan pembandingnya (spec D 4.5): sampai sekarang, dibanding periode
 * sebelumnya sampai titik yang sama. Bulan lalu yang lebih pendek berhenti di akhir bulannya.
 */
export function periodRanges(
  period: DashboardPeriod,
  now: Date,
): { current: TimeRange; previous: TimeRange; label: string; previousLabel: string } {
  const today = witaDateString(now);
  const elapsedToday = now.getTime() - combineWitaDateAndMinutes(today, 0).getTime();

  if (period === "minggu") {
    const monday = addDaysToDateString(today, -((witaWeekday(now) + 6) % 7));
    const start = combineWitaDateAndMinutes(monday, 0);
    return {
      current: { start, end: now },
      previous: { start: new Date(start.getTime() - 7 * DAY_MS), end: new Date(now.getTime() - 7 * DAY_MS) },
      label: `${formatShortIndonesianDate(start)} – ${formatShortIndonesianDate(now)}`,
      previousLabel: "minggu lalu",
    };
  }

  const [year, month, day] = today.split("-").map(Number);
  const start = combineWitaDateAndMinutes(`${today.slice(0, 7)}-01`, 0);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  const previousEnd =
    day > daysInMonth(prevYear, prevMonth)
      ? start
      : new Date(combineWitaDateAndMinutes(`${prevPrefix}-${String(day).padStart(2, "0")}`, 0).getTime() + elapsedToday);
  return {
    current: { start, end: now },
    previous: { start: combineWitaDateAndMinutes(`${prevPrefix}-01`, 0), end: previousEnd },
    label: `${formatShortIndonesianDate(start)} – ${formatShortIndonesianDate(now)}`,
    previousLabel: "bulan lalu",
  };
}

export type MinuteWindow = { startMinute: number; endMinute: number };

/** Sumbu garis waktu: jam kerja dan booking hari ini, dibulatkan ke jam penuh (spec D 4.3). */
export function timelineAxis(ranges: MinuteWindow[]): MinuteWindow | null {
  if (ranges.length === 0) return null;
  const start = Math.min(...ranges.map((r) => r.startMinute));
  const end = Math.max(...ranges.map((r) => r.endMinute));
  return { startMinute: Math.floor(start / 60) * 60, endMinute: Math.ceil(end / 60) * 60 };
}

export function timelineHours(axis: MinuteWindow): number[] {
  const hours: number[] = [];
  for (let minute = axis.startMinute; minute <= axis.endMinute; minute += 60) hours.push(minute / 60);
  return hours;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Posisi kiri dan lebar dalam persen sumbu; bagian di luar sumbu dipotong, tanpa irisan = null. */
export function timelinePosition(startMinute: number, endMinute: number, axis: MinuteWindow): { left: number; width: number } | null {
  const span = axis.endMinute - axis.startMinute;
  const from = Math.max(startMinute, axis.startMinute);
  const to = Math.min(endMinute, axis.endMinute);
  if (span <= 0 || to <= from) return null;
  return { left: round2(((from - axis.startMinute) / span) * 100), width: round2(((to - from) / span) * 100) };
}

export type TimelineTone = "menunggu" | "terkonfirmasi" | "hadir" | "tidak-hadir";

export function timelineTone(status: AppointmentStatusValue): TimelineTone | null {
  switch (status) {
    case "MENUNGGU_KONFIRMASI":
      return "menunggu";
    case "TERKONFIRMASI":
      return "terkonfirmasi";
    case "HADIR":
    case "SELESAI":
      return "hadir";
    case "TIDAK_HADIR":
      return "tidak-hadir";
    default:
      return null;
  }
}

/** Selisih terhadap periode pembanding: "+4", "−2" (tanda minus), atau "sama". */
export function deltaLabel(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return "sama";
  return diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
}

/** Keterangan kepala dasbor tentang jam buka hari ini (spec D 4.1). */
export function clinicDayLabel(input: { holidayName: string | null; windows: MinuteWindow[] }): string {
  if (input.holidayName) return `Klinik tutup hari ini — ${input.holidayName}`;
  if (input.windows.length === 0) return "tidak ada jadwal praktik hari ini";
  const start = Math.min(...input.windows.map((w) => w.startMinute));
  const end = Math.max(...input.windows.map((w) => w.endMinute));
  return `klinik buka ${minutesToTimeLabel(start)}–${minutesToTimeLabel(end)}`;
}
```

`src/lib/settle.ts`:

```ts
export type Settled<T> = { ok: true; data: T } | { ok: false };

/** Bagian dasbor dimuat sendiri-sendiri: satu yang gagal tidak menjatuhkan yang lain (spec D 4.7). */
export async function settle<T>(promise: Promise<T>, label: string): Promise<Settled<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    console.error(`[dasbor] ${label} gagal dimuat`, error);
    return { ok: false };
  }
}
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/dashboard.test.ts tests/unit/settle.test.ts tests/unit/slot.test.ts`
Expected: PASS. Uji `getAvailableSlots` yang lama tetap lulus.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard.ts src/lib/settle.ts src/lib/slot.ts tests/unit/dashboard.test.ts tests/unit/settle.test.ts tests/unit/slot.test.ts
git commit -m "feat: add dashboard rules for greetings, periods, and the schedule timeline"
```

---

### Task 3: Data dasbor dan hak Angka

**Files:**
- Create: `src/server/dashboard.ts`
- Modify: `src/server/reminder.ts` (+ `getReminderCounts`), `src/lib/permissions.ts` (cabut `report:read` dari Dokter)
- Test: `tests/integration/dashboard.test.ts` (baru), `tests/unit/permissions.test.ts` (tambah)

**Interfaces:**
- Consumes: Task 2 (`periodRanges`, `MinuteWindow`, `workingWindows`); `listPendingBookings`; `computeAvailability`; `firstName`, `quizLinkState` (`@/lib/quiz-link`); `bookingServiceName`.
- Produces:
  - `getReminderCounts(): Promise<{ confirm: number; remind: number }>`
  - `TodayWork = { pending: number; pendingOverdue: number; messages: { confirm: number; remind: number }; today: { total: number; unfilledIntakes: number; attended: number; noShow: number } }`, `getTodayWork(now?: Date): Promise<TodayWork>`
  - `ScheduleBlock = { id: string; startMinute: number; endMinute: number; time: string; status: AppointmentStatusValue; patientName: string; serviceName: string }`
  - `OpenSlot = { startMinute: number; endMinute: number; time: string }`
  - `ScheduleLane = { staffId: string; staffName: string; windows: MinuteWindow[]; bookings: ScheduleBlock[]; openSlots: OpenSlot[] }`
  - `TodaySchedule = { date: string; holidayName: string | null; lanes: ScheduleLane[]; offStaff: string[] }`, `getTodaySchedule(now?: Date): Promise<TodaySchedule>`
  - `PeriodNumbers = { bookings: number; bySource: Record<BookingSourceValue, number>; newPatients: number; noShow: number; cancelled: number; expired: number; feeReceived: number }`
  - `DashboardNumbers = { period: DashboardPeriod; label: string; previousLabel: string; current: PeriodNumbers; previous: PeriodNumbers }`, `getDashboardNumbers(period: DashboardPeriod, now?: Date): Promise<DashboardNumbers>`

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan ke `tests/unit/permissions.test.ts`, di dalam blok `describe` utama:

```ts
  it("Angka dasbor (report:read) hanya untuk Super Admin (spec D 4.6)", () => {
    expect(can("SUPER_ADMIN", "report:read")).toBe(true);
    expect(can("DOKTER", "report:read")).toBe(false);
    expect(can("RESEPSIONIS", "report:read")).toBe(false);
    expect(can("TERAPIS", "report:read")).toBe(false);
  });
```

`tests/integration/dashboard.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus, BookingSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { getDashboardNumbers, getTodaySchedule, getTodayWork } from "@/server/dashboard";
import { requireCapability } from "@/server/session";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Pemilik Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "dasbor-uji";
const WA = "6281277600001";
// Rabu 12 Februari 2031: tanggal yang tidak dipakai uji lain, jadi angka tidak tercampur.
const DAY = "2031-02-12";
const NOW = new Date(`${DAY}T12:00:00+08:00`);
const at = (date: string, minutes: number) => combineWitaDateAndMinutes(date, minutes);

async function cleanup() {
  await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: { startsWith: SLUG } } } } });
  await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.scheduleException.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.scheduleTemplate.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.staff.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.holiday.deleteMany({ where: { name: { startsWith: "Libur Uji Dasbor" } } });
  await prisma.auditLog.deleteMany({ where: { summary: "dasbor-uji" } });
}

describe("data dasbor", () => {
  let doctorId: string;
  let therapistId: string;
  let branchId: string;
  let patientId: string;
  let seq = 0;

  function booking(input: {
    staffId?: string;
    date?: string;
    minute: number;
    status?: AppointmentStatus;
    source?: BookingSource;
    createdAt?: Date;
    bookingFee?: number | null;
  }) {
    seq += 1;
    const startAt = at(input.date ?? DAY, input.minute);
    return prisma.appointment.create({
      data: {
        code: `DSB-${seq}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        source: input.source ?? "WHATSAPP",
        status: input.status ?? "TERKONFIRMASI",
        bookingFee: input.bookingFee === undefined ? 100000 : input.bookingFee,
        branchId,
        staffId: input.staffId ?? doctorId,
        patientId,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    branchId = (
      await prisma.branch.create({
        data: {
          slug: SLUG,
          name: "Cabang Dasbor",
          address: "Alamat",
          whatsapp: "6285172228900",
          openingHours: "Senin–Sabtu, 11.00–19.00",
          status: "AKTIF",
          sortOrder: -100,
        },
      })
    ).id;
    doctorId = (await prisma.staff.create({ data: { slug: `${SLUG}-dokter`, name: "dr. Dasbor", role: "DOKTER", sortOrder: -100 } })).id;
    therapistId = (
      await prisma.staff.create({ data: { slug: `${SLUG}-terapis`, name: "Terapis Dasbor", role: "TERAPIS", sortOrder: -99 } })
    ).id;
    // Rabu = 3. Dokter praktik 11.00–19.00; terapis tidak punya jam kerja hari Rabu.
    await prisma.scheduleTemplate.create({
      data: { staffId: doctorId, branchId, weekday: 3, startMinute: 660, endMinute: 1140, slotMinutes: 30 },
    });
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2031-7600", name: "Maria Dasbor Uji", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe("jadwal hari ini (spec D 4.3)", () => {
    it("lajur dari jam kerja, booking per status, slot kosong, dan booking di luar jam kerja tetap tampil", async () => {
      const early = await booking({ minute: 6 * 60, status: "HADIR" }); // 06.00, di luar jam kerja
      await booking({ minute: 11 * 60, status: "TERKONFIRMASI" });
      await booking({ minute: 13 * 60, status: "DIBATALKAN" });

      const schedule = await getTodaySchedule(NOW);
      expect(schedule.date).toBe(DAY);
      expect(schedule.holidayName).toBeNull();
      const lane = schedule.lanes.find((l) => l.staffId === doctorId)!;
      expect(lane.windows).toEqual([{ startMinute: 660, endMinute: 1140 }]);
      expect(lane.bookings.map((b) => [b.time, b.status, b.patientName])).toEqual([
        ["06.00", "HADIR", "Maria"],
        ["11.00", "TERKONFIRMASI", "Maria"],
      ]);
      expect(lane.bookings[0]).toMatchObject({ id: early.id, startMinute: 360, endMinute: 390, serviceName: "Konsultasi" });
      // 11.00 terisi; 13.00 kosong lagi karena bookingnya dibatalkan.
      expect(lane.openSlots.map((s) => s.time)).not.toContain("11.00");
      expect(lane.openSlots.map((s) => s.time)).toContain("13.00");
      expect(lane.openSlots[0]).toEqual({ startMinute: 690, endMinute: 720, time: "11.30" });
      expect(schedule.offStaff).toContain("Terapis Dasbor");
    });

    it("tenaga tanpa jam kerja tetapi punya booking tetap mendapat lajur", async () => {
      await booking({ staffId: therapistId, minute: 15 * 60 });
      const schedule = await getTodaySchedule(NOW);
      const lane = schedule.lanes.find((l) => l.staffId === therapistId)!;
      expect(lane.windows).toEqual([]);
      expect(lane.openSlots).toEqual([]);
      expect(lane.bookings).toHaveLength(1);
      expect(schedule.offStaff).not.toContain("Terapis Dasbor");
    });

    it("jam tambahan memberi lajur, cuti menghapusnya", async () => {
      await prisma.scheduleException.create({
        data: { staffId: therapistId, branchId, date: new Date(`${DAY}T00:00:00Z`), kind: "JAM_TAMBAHAN", startMinute: 600, endMinute: 720 },
      });
      await prisma.scheduleException.create({
        data: { staffId: doctorId, branchId, date: new Date(`${DAY}T00:00:00Z`), kind: "LIBUR" },
      });
      const schedule = await getTodaySchedule(NOW);
      expect(schedule.lanes.find((l) => l.staffId === therapistId)!.windows).toEqual([{ startMinute: 600, endMinute: 720 }]);
      expect(schedule.lanes.find((l) => l.staffId === doctorId)).toBeUndefined();
      expect(schedule.offStaff).toContain("dr. Dasbor");
    });

    it("hari libur: klinik tutup, tanpa lajur", async () => {
      await prisma.holiday.create({ data: { date: new Date(`${DAY}T00:00:00Z`), name: "Libur Uji Dasbor", kind: "LIBUR_KLINIK" } });
      expect(await getTodaySchedule(NOW)).toEqual({ date: DAY, holidayName: "Libur Uji Dasbor", lanes: [], offStaff: [] });
    });
  });

  describe("pekerjaan hari ini (spec D 4.2)", () => {
    it("booking hari ini tanpa batal/kedaluwarsa, hadir, tidak hadir, dan isian belum diisi", async () => {
      const before = await getTodayWork(NOW);
      await booking({ minute: 11 * 60, status: "HADIR" });
      await booking({ minute: 12 * 60, status: "SELESAI" });
      await booking({ minute: 13 * 60, status: "TIDAK_HADIR" });
      await booking({ minute: 14 * 60, status: "DIBATALKAN" });
      await booking({ minute: 15 * 60, status: "TERKONFIRMASI" }); // link kuis berlaku: isian belum diisi
      await booking({ minute: 16 * 60, status: "MENUNGGU_KONFIRMASI", source: "SITUS" }); // situs: tanpa link

      const work = await getTodayWork(NOW);
      expect(work.today).toEqual({ total: 5, unfilledIntakes: 1, attended: 2, noShow: 1 });
      // Menunggu konfirmasi bersifat global: dibandingkan dengan sebelum booking uji dibuat.
      expect(work.pending).toBeGreaterThanOrEqual(before.pending);
      expect(work.messages).toEqual({ confirm: expect.any(Number), remind: expect.any(Number) });
    });
  });

  describe("Angka (spec D 4.5)", () => {
    it("booking per sumber, pasien baru, hasil, dan biaya booking dari audit — dengan pembanding", async () => {
      const week = new Date(`2031-02-11T09:00:00+08:00`); // Selasa minggu ini
      const lastWeek = new Date(`2031-02-04T09:00:00+08:00`); // Selasa minggu lalu
      const verified = await booking({ minute: 600, createdAt: week, source: "WHATSAPP", bookingFee: 100000 });
      await booking({ minute: 630, createdAt: week, source: "SITUS", bookingFee: 150000 });
      await booking({ minute: 660, createdAt: week, source: "WALK_IN", bookingFee: null, status: "TIDAK_HADIR" });
      await booking({ minute: 690, createdAt: lastWeek, source: "TELEPON" });
      await booking({ minute: 300, createdAt: week, status: "DIBATALKAN" }); // jadwal 05.00, sebelum "sekarang"
      await prisma.patient.update({ where: { id: patientId }, data: { createdAt: week } });
      // Satu booking diverifikasi dua kali (mis. dibatalkan lalu dibuka ulang) tetap dihitung sekali.
      for (const when of [week, new Date(week.getTime() + 60_000)]) {
        await prisma.auditLog.create({
          data: {
            actorStaffId: "s1",
            actorName: "Pemilik Uji",
            actorRole: "SUPER_ADMIN",
            action: "appointment.verify",
            entity: "Appointment",
            entityId: verified.id,
            summary: "dasbor-uji",
            createdAt: when,
          },
        });
      }

      const numbers = await getDashboardNumbers("minggu", NOW);
      expect(numbers.period).toBe("minggu");
      expect(numbers.previousLabel).toBe("minggu lalu");
      expect(numbers.current).toEqual({
        bookings: 4,
        bySource: { SITUS: 1, WHATSAPP: 2, TELEPON: 0, WALK_IN: 1 },
        newPatients: 1,
        noShow: 1,
        cancelled: 1,
        expired: 0,
        feeReceived: 100000,
      });
      expect(numbers.previous).toMatchObject({ bookings: 1, bySource: { TELEPON: 1 }, newPatients: 0, feeReceived: 0 });
      expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("report:read");
    });
  });
});
```

Catatan: uji `noShow`, `cancelled`, dan `expired` di atas memakai **jadwal** (`startAt`) dalam periode. Semua booking uji berjadwal 12 Februari 2031, yang termasuk minggu ini.

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/permissions.test.ts && npm run test:integration -- tests/integration/dashboard.test.ts`
Expected: FAIL. Dokter masih memegang `report:read`, dan `@/server/dashboard` belum ada.

- [ ] **Step 3: Cabut `report:read` dari Dokter (`src/lib/permissions.ts`)**

Di baris Dokter, ganti:

```ts
  DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write", "report:read"],
```

dengan:

```ts
  // report:read (Angka dasbor, termasuk biaya booking masuk) hanya untuk Super Admin (spec D 4.6).
  DOKTER: ["booking:manage", "schedule:manage", "record:read", "record:write"],
```

- [ ] **Step 4: `getReminderCounts` di `src/server/reminder.ts`**

Tambahkan setelah fungsi `countReminderWork`:

```ts
/** Kotak 1 dan 2 halaman Pengingat secara terpisah, untuk kotak dasbor (spec D 4.2). */
export async function getReminderCounts(): Promise<{ confirm: number; remind: number }> {
  await requireCapability("booking:manage");
  const groups = await loadReminderGroups(new Date());
  return { confirm: groups.confirm.length, remind: groups.remind.length };
}
```

- [ ] **Step 5: Tulis `src/server/dashboard.ts`**

```ts
import type { AppointmentStatus } from "@prisma/client";
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import { periodRanges, type DashboardPeriod, type MinuteWindow, type TimeRange } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import type { BookingSourceValue } from "@/lib/payment";
import { firstName, quizLinkState } from "@/lib/quiz-link";
import { workingWindows } from "@/lib/slot";
import { addDaysToDateString, combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay, witaWeekday } from "@/lib/time";
import { bookingServiceName } from "@/lib/transfer-instruction";
import { listPendingBookings } from "@/server/appointment";
import { computeAvailability } from "@/server/availability";
import { getReminderCounts } from "@/server/reminder";
import { requireCapability } from "@/server/session";

// Modul biasa, bukan "use server": hanya dibaca halaman dasbor (server component).
// Setiap fungsi memeriksa haknya sendiri, karena bagian dasbor dimuat terpisah (spec D 4.6–4.7).

const HIDDEN_STATUSES: AppointmentStatus[] = ["DIBATALKAN", "KEDALUWARSA"];
/** Slot kosong di garis waktu memakai durasi konsultasi, sama dengan bawaan Booking Baru. */
const SLOT_MINUTES = 30;

function dayBounds(now: Date) {
  const date = witaDateString(now);
  return {
    date,
    start: combineWitaDateAndMinutes(date, 0),
    end: combineWitaDateAndMinutes(addDaysToDateString(date, 1), 0),
  };
}

export type TodayWork = {
  pending: number;
  pendingOverdue: number;
  messages: { confirm: number; remind: number };
  today: { total: number; unfilledIntakes: number; attended: number; noShow: number };
};

export async function getTodayWork(now: Date = new Date()): Promise<TodayWork> {
  await requireCapability("booking:manage");
  const { start, end } = dayBounds(now);
  const [pending, messages, today] = await Promise.all([
    listPendingBookings(),
    getReminderCounts(),
    prisma.appointment.findMany({
      where: { startAt: { gte: start, lt: end }, status: { notIn: HIDDEN_STATUSES } },
      select: {
        source: true,
        status: true,
        startAt: true,
        patientId: true,
        intake: { select: { status: true, linkVersion: true } },
      },
    }),
  ]);
  return {
    pending: pending.length,
    pendingOverdue: pending.filter((booking) => booking.overdue).length,
    messages,
    today: {
      total: today.length,
      // Booking admin yang link kuisnya masih berlaku = isian belum diisi (spec C3).
      unfilledIntakes: today.filter((booking) => quizLinkState(booking, now) === "OPEN").length,
      attended: today.filter((booking) => booking.status === "HADIR" || booking.status === "SELESAI").length,
      noShow: today.filter((booking) => booking.status === "TIDAK_HADIR").length,
    },
  };
}

export type ScheduleBlock = {
  id: string;
  startMinute: number;
  endMinute: number;
  time: string;
  status: AppointmentStatusValue;
  patientName: string;
  serviceName: string;
};
export type OpenSlot = { startMinute: number; endMinute: number; time: string };
export type ScheduleLane = {
  staffId: string;
  staffName: string;
  windows: MinuteWindow[];
  bookings: ScheduleBlock[];
  openSlots: OpenSlot[];
};
export type TodaySchedule = { date: string; holidayName: string | null; lanes: ScheduleLane[]; offStaff: string[] };

export async function getTodaySchedule(now: Date = new Date()): Promise<TodaySchedule> {
  await requireCapability("booking:manage");
  const { date, start, end } = dayBounds(now);
  const dateColumn = new Date(`${date}T00:00:00Z`);

  const holiday = await prisma.holiday.findUnique({ where: { date: dateColumn }, select: { name: true } });
  if (holiday) return { date, holidayName: holiday.name, lanes: [], offStaff: [] };

  const weekday = witaWeekday(now);
  const [staffList, primaryBranch] = await Promise.all([
    prisma.staff.findMany({
      where: { role: { in: ["DOKTER", "TERAPIS"] }, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        scheduleTemplates: { where: { weekday }, select: { branchId: true, startMinute: true, endMinute: true } },
        scheduleExceptions: {
          where: { date: dateColumn },
          select: { kind: true, startMinute: true, endMinute: true, branchId: true },
        },
      },
    }),
    prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true } }),
  ]);
  const bookings = await prisma.appointment.findMany({
    where: {
      staffId: { in: staffList.map((s) => s.id) },
      startAt: { gte: start, lt: end },
      status: { notIn: HIDDEN_STATUSES },
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      staffId: true,
      startAt: true,
      endAt: true,
      status: true,
      type: true,
      service: { select: { name: true } },
      // Hanya identitas untuk label blok — tanpa catatan medis (spec D 6).
      patient: { select: { name: true } },
      intake: { select: { name: true } },
    },
  });

  const lanes: ScheduleLane[] = [];
  const offStaff: string[] = [];
  for (const staff of staffList) {
    const template = staff.scheduleTemplates[0] ?? null;
    const windows = workingWindows({ template, exceptions: staff.scheduleExceptions, isHoliday: false });
    const own = bookings.filter((b) => b.staffId === staff.id);
    if (windows.length === 0 && own.length === 0) {
      offStaff.push(staff.name);
      continue;
    }
    const branchId = template?.branchId ?? staff.scheduleExceptions.find((e) => e.branchId)?.branchId ?? primaryBranch?.id;
    const slots =
      windows.length > 0 && branchId
        ? await computeAvailability({ staffId: staff.id, branchId, date, durationMinutes: SLOT_MINUTES }, { minLeadMinutes: 0 })
        : [];
    lanes.push({
      staffId: staff.id,
      staffName: staff.name,
      windows,
      bookings: own.map((b) => {
        const startMinute = witaMinutesOfDay(b.startAt);
        return {
          id: b.id,
          startMinute,
          endMinute: startMinute + Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000),
          time: minutesToTimeLabel(startMinute),
          status: b.status,
          patientName: firstName(b.patient?.name ?? b.intake?.name ?? "Tanpa nama"),
          serviceName: bookingServiceName(b),
        };
      }),
      openSlots: slots.map((slot) => {
        const startMinute = witaMinutesOfDay(slot.startAt);
        return { startMinute, endMinute: startMinute + SLOT_MINUTES, time: slot.label };
      }),
    });
  }
  return { date, holidayName: null, lanes, offStaff };
}

export type PeriodNumbers = {
  bookings: number;
  bySource: Record<BookingSourceValue, number>;
  newPatients: number;
  noShow: number;
  cancelled: number;
  expired: number;
  feeReceived: number;
};
export type DashboardNumbers = {
  period: DashboardPeriod;
  label: string;
  previousLabel: string;
  current: PeriodNumbers;
  previous: PeriodNumbers;
};

async function numbersFor(range: TimeRange): Promise<PeriodNumbers> {
  const within = { gte: range.start, lt: range.end };
  const [bySourceRows, newPatients, outcomeRows, verifications] = await Promise.all([
    prisma.appointment.groupBy({ by: ["source"], where: { createdAt: within }, _count: { _all: true } }),
    prisma.patient.count({ where: { createdAt: within } }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { startAt: within, status: { in: ["TIDAK_HADIR", "DIBATALKAN", "KEDALUWARSA"] } },
      _count: { _all: true },
    }),
    // Satu booking dihitung sekali walau tercatat diverifikasi dua kali (spec D 4.5).
    prisma.auditLog.findMany({
      where: { action: "appointment.verify", createdAt: within },
      select: { entityId: true },
      distinct: ["entityId"],
    }),
  ]);
  const fee =
    verifications.length === 0
      ? 0
      : ((
          await prisma.appointment.aggregate({
            where: { id: { in: verifications.map((v) => v.entityId) } },
            _sum: { bookingFee: true },
          })
        )._sum.bookingFee ?? 0);
  const bySource: Record<BookingSourceValue, number> = { SITUS: 0, WHATSAPP: 0, TELEPON: 0, WALK_IN: 0 };
  for (const row of bySourceRows) bySource[row.source] = row._count._all;
  const outcome = (status: AppointmentStatus) => outcomeRows.find((row) => row.status === status)?._count._all ?? 0;
  return {
    bookings: Object.values(bySource).reduce((sum, n) => sum + n, 0),
    bySource,
    newPatients,
    noShow: outcome("TIDAK_HADIR"),
    cancelled: outcome("DIBATALKAN"),
    expired: outcome("KEDALUWARSA"),
    feeReceived: fee,
  };
}

export async function getDashboardNumbers(period: DashboardPeriod, now: Date = new Date()): Promise<DashboardNumbers> {
  await requireCapability("report:read");
  const ranges = periodRanges(period, now);
  const [current, previous] = await Promise.all([numbersFor(ranges.current), numbersFor(ranges.previous)]);
  return { period, label: ranges.label, previousLabel: ranges.previousLabel, current, previous };
}
```

- [ ] **Step 6: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/permissions.test.ts && npm run test:integration -- tests/integration/dashboard.test.ts tests/integration/reminder-worklist.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint && npx vitest run tests/unit/architecture.test.ts`
Expected: bersih dan PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/dashboard.ts src/server/reminder.ts src/lib/permissions.ts tests/integration/dashboard.test.ts tests/unit/permissions.test.ts
git commit -m "feat: load the dashboard's daily work, schedule timeline, and owner numbers"
```

---
### Task 4: Halaman Dasbor

**Files:**
- Create: `src/components/admin/dashboard-work.tsx`, `src/components/admin/schedule-timeline.tsx`, `src/components/admin/dashboard-numbers.tsx`
- Modify: `src/components/admin/doctor-worklist.tsx` (dua kartu), `src/app/(admin)/admin/page.tsx`
- Test: `tests/unit/components/dashboard-work.test.tsx`, `tests/unit/components/schedule-timeline.test.tsx`, `tests/unit/components/dashboard-numbers.test.tsx` (baru); `tests/unit/components/doctor-worklist.test.tsx` tetap lulus

**Interfaces:**
- Consumes: Task 1 (`PageHeader`, `PageBody`, `SectionCard`, `EmptyState`, `FailedSection`, `StatTile`); Task 2 (`greetingFor`, `parsePeriod`, `timelineAxis`, `timelineHours`, `timelinePosition`, `timelineTone`, `deltaLabel`, `clinicDayLabel`, `settle`); Task 3 (`getTodayWork`, `getTodaySchedule`, `getDashboardNumbers` beserta tipenya).
- Produces:
  - `DashboardWork({ work: TodayWork; today: string })`
  - `ScheduleTimeline({ schedule: TodaySchedule; nowMinute: number })`
  - `DashboardNumbersCard({ numbers: DashboardNumbers })`
  - tautan slot kosong `/admin/booking/baru?tenaga={staffId}&tanggal={YYYY-MM-DD}&jam={HH.MM}` (dibaca Task 5)

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/dashboard-work.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardWork } from "@/components/admin/dashboard-work";

const WORK = {
  pending: 3,
  pendingOverdue: 1,
  messages: { confirm: 1, remind: 2 },
  today: { total: 8, unfilledIntakes: 2, attended: 3, noShow: 1 },
};

describe("DashboardWork (spec D 4.2)", () => {
  it("empat kotak bertautan dengan keterangannya", () => {
    render(<DashboardWork work={WORK} today="2031-02-12" />);
    const pending = screen.getByRole("link", { name: /Menunggu konfirmasi/ });
    expect(pending).toHaveAttribute("href", "/admin/booking");
    expect(pending).toHaveTextContent("1 lewat batas transfer");
    expect(pending).toHaveAttribute("data-attention", "true");

    const messages = screen.getByRole("link", { name: /Pesan WA belum dikirim/ });
    expect(messages).toHaveAttribute("href", "/admin/pengingat");
    expect(messages).toHaveTextContent("3");
    expect(messages).toHaveTextContent("konfirmasi 1 · pengingat 2");

    const today = screen.getByRole("link", { name: /Booking hari ini/ });
    expect(today).toHaveAttribute("href", "/admin/booking?tanggal=2031-02-12");
    expect(today).toHaveTextContent("2 isian belum diisi");
    expect(today).not.toHaveAttribute("data-attention");

    const attended = screen.getByRole("link", { name: /Sudah hadir/ });
    expect(attended).toHaveTextContent("3 / 8");
    expect(attended).toHaveTextContent("1 tidak hadir");
  });

  it("tanpa pekerjaan: tanpa garis emas dan tanpa keterangan kosong", () => {
    render(
      <DashboardWork
        work={{ pending: 0, pendingOverdue: 0, messages: { confirm: 0, remind: 0 }, today: { total: 0, unfilledIntakes: 0, attended: 0, noShow: 0 } }}
        today="2031-02-12"
      />,
    );
    expect(screen.getByRole("link", { name: /Menunggu konfirmasi/ })).not.toHaveAttribute("data-attention");
    expect(screen.getByRole("link", { name: /Pesan WA belum dikirim/ })).not.toHaveAttribute("data-attention");
    expect(screen.queryByText(/lewat batas transfer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/isian belum diisi/)).not.toBeInTheDocument();
  });
});
```

`tests/unit/components/schedule-timeline.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduleTimeline } from "@/components/admin/schedule-timeline";
import type { TodaySchedule } from "@/server/dashboard";

const SCHEDULE: TodaySchedule = {
  date: "2031-02-12",
  holidayName: null,
  lanes: [
    {
      staffId: "d1",
      staffName: "dr. Diane",
      windows: [{ startMinute: 660, endMinute: 1140 }],
      bookings: [
        { id: "b1", startMinute: 360, endMinute: 390, time: "06.00", status: "HADIR", patientName: "Maria", serviceName: "Konsultasi" },
        { id: "b2", startMinute: 690, endMinute: 720, time: "11.30", status: "MENUNGGU_KONFIRMASI", patientName: "Budi", serviceName: "Konsultasi" },
      ],
      openSlots: [{ startMinute: 720, endMinute: 750, time: "12.00" }],
    },
  ],
  offStaff: ["Terapis SunDY"],
};

describe("ScheduleTimeline (spec D 4.3)", () => {
  it("lajur per tenaga dengan blok booking bertautan ke daftar Booking", () => {
    render(<ScheduleTimeline schedule={SCHEDULE} nowMinute={700} />);
    const card = screen.getByRole("region", { name: "Jadwal hari ini" });
    const lane = within(card).getByRole("listitem", { name: "Jadwal dr. Diane" });
    expect(lane).toHaveTextContent("2 booking · 1 slot kosong");
    // Booking 06.00 di luar jam kerja tetap tampil (Review Focus 1).
    expect(within(lane).getByRole("link", { name: "06.00 Maria · Konsultasi · hadir" })).toHaveAttribute(
      "href",
      "/admin/booking?tanggal=2031-02-12&sorot=b1",
    );
    expect(within(lane).getByRole("link", { name: "11.30 Budi · Konsultasi · menunggu konfirmasi" })).toBeInTheDocument();
    expect(within(card).getByText("Tidak praktik hari ini: Terapis SunDY")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Buka daftar Booking →" })).toHaveAttribute("href", "/admin/booking?tanggal=2031-02-12");
  });

  it("slot kosong membuka Booking Baru dengan tenaga, tanggal, dan jam", () => {
    render(<ScheduleTimeline schedule={SCHEDULE} nowMinute={700} />);
    expect(screen.getByRole("link", { name: "Slot kosong 12.00 — buat booking dr. Diane" })).toHaveAttribute(
      "href",
      "/admin/booking/baru?tenaga=d1&tanggal=2031-02-12&jam=12.00",
    );
  });

  it("garis sekarang hanya tampil di dalam rentang jam", () => {
    const { container, rerender } = render(<ScheduleTimeline schedule={SCHEDULE} nowMinute={700} />);
    expect(container.querySelector("[data-now]")).not.toBeNull();
    rerender(<ScheduleTimeline schedule={SCHEDULE} nowMinute={1300} />);
    expect(container.querySelector("[data-now]")).toBeNull();
  });

  it("malam hari: tanpa slot kosong, blok booking tetap tampil (Review Focus 3)", () => {
    const evening: TodaySchedule = { ...SCHEDULE, lanes: [{ ...SCHEDULE.lanes[0], openSlots: [] }] };
    render(<ScheduleTimeline schedule={evening} nowMinute={1300} />);
    expect(screen.queryByRole("link", { name: /^Slot kosong/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "06.00 Maria · Konsultasi · hadir" })).toBeInTheDocument();
  });

  it("libur atau tanpa jadwal: keterangan", () => {
    const { rerender } = render(
      <ScheduleTimeline schedule={{ date: "2031-02-12", holidayName: "Libur Klinik", lanes: [], offStaff: [] }} nowMinute={700} />,
    );
    expect(screen.getByText("Klinik tutup hari ini — Libur Klinik.")).toBeInTheDocument();
    rerender(<ScheduleTimeline schedule={{ date: "2031-02-12", holidayName: null, lanes: [], offStaff: ["dr. Diane"] }} nowMinute={700} />);
    expect(screen.getByText("Tidak ada jadwal praktik hari ini.")).toBeInTheDocument();
  });
});
```

`tests/unit/components/dashboard-numbers.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardNumbersCard } from "@/components/admin/dashboard-numbers";
import type { DashboardNumbers } from "@/server/dashboard";

const numbers: DashboardNumbers = {
  period: "minggu",
  label: "Sen, 10 Feb – Rab, 12 Feb",
  previousLabel: "minggu lalu",
  current: {
    bookings: 23,
    bySource: { SITUS: 9, WHATSAPP: 10, TELEPON: 2, WALK_IN: 2 },
    newPatients: 6,
    noShow: 1,
    cancelled: 2,
    expired: 0,
    feeReceived: 1500000,
  },
  previous: {
    bookings: 19,
    bySource: { SITUS: 8, WHATSAPP: 8, TELEPON: 2, WALK_IN: 1 },
    newPatients: 6,
    noShow: 0,
    cancelled: 1,
    expired: 1,
    feeReceived: 1700000,
  },
};

describe("DashboardNumbersCard (spec D 4.5)", () => {
  it("angka periode dengan selisih terhadap pembanding", () => {
    render(<DashboardNumbersCard numbers={numbers} />);
    const card = screen.getByRole("region", { name: "Angka" });
    expect(card).toHaveTextContent("Sen, 10 Feb – Rab, 12 Feb");
    expect(within(card).getByText("Booking").parentElement).toHaveTextContent("23+4 dibanding minggu lalu");
    expect(within(card).getByText("Pasien baru").parentElement).toHaveTextContent("6sama dibanding minggu lalu");
    expect(within(card).getByText("Biaya booking masuk").parentElement).toHaveTextContent("Rp 1.500.000−200.000 dibanding minggu lalu");
    expect(card).toHaveTextContent("Situs 9 · WhatsApp 10 · Telepon 2 · Walk-in 2");
    expect(card).toHaveTextContent("Tidak hadir 1 · Dibatalkan 2 · Kedaluwarsa 0");
  });

  it("pilihan periode sebagai tautan", () => {
    render(<DashboardNumbersCard numbers={numbers} />);
    const nav = screen.getByRole("navigation", { name: "Periode angka" });
    expect(within(nav).getByRole("link", { name: "Minggu ini" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Bulan ini" })).toHaveAttribute("href", "/admin?periode=bulan");
  });
});
```

Catatan: selisih rupiah ditulis tanpa "Rp" ("−200.000"), memakai `deltaLabel` atas angka bulat yang diformat ribuan. Lihat `feeDelta` di Step 3.

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/dashboard-work.test.tsx tests/unit/components/schedule-timeline.test.tsx tests/unit/components/dashboard-numbers.test.tsx`
Expected: FAIL. Komponennya belum ada.

- [ ] **Step 3: Tulis komponen dasbor**

`src/components/admin/dashboard-work.tsx`:

```tsx
import type { TodayWork } from "@/server/dashboard";
import { StatTile } from "./stat-tile";

/** Kotak pekerjaan hari ini (spec D 4.2). */
export function DashboardWork({ work, today }: { work: TodayWork; today: string }) {
  const messages = work.messages.confirm + work.messages.remind;
  const dayList = `/admin/booking?tanggal=${today}`;
  return (
    <section aria-label="Pekerjaan hari ini" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Menunggu konfirmasi"
        value={work.pending}
        note={work.pendingOverdue > 0 ? `${work.pendingOverdue} lewat batas transfer` : null}
        href="/admin/booking"
        attention={work.pending > 0}
      />
      <StatTile
        label="Pesan WA belum dikirim"
        value={messages}
        note={`konfirmasi ${work.messages.confirm} · pengingat ${work.messages.remind}`}
        href="/admin/pengingat"
        attention={messages > 0}
      />
      <StatTile
        label="Booking hari ini"
        value={work.today.total}
        note={work.today.unfilledIntakes > 0 ? `${work.today.unfilledIntakes} isian belum diisi` : null}
        href={dayList}
      />
      <StatTile
        label="Sudah hadir"
        value={
          <>
            {work.today.attended} <span className="text-xl text-muted-foreground">/ {work.today.total}</span>
          </>
        }
        note={work.today.noShow > 0 ? `${work.today.noShow} tidak hadir` : null}
        href={dayList}
      />
    </section>
  );
}
```

`src/components/admin/schedule-timeline.tsx`:

```tsx
import Link from "next/link";
import { timelineAxis, timelineHours, timelinePosition, timelineTone, type TimelineTone } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import type { TodaySchedule } from "@/server/dashboard";
import { EmptyState, SectionCard } from "./page-layout";

const TONE_CLASS: Record<TimelineTone, string> = {
  menunggu: "border border-dashed border-gold-500 bg-white text-gold-600",
  terkonfirmasi: "bg-gold-300 text-brown-900",
  hadir: "bg-emerald-200 text-emerald-900",
  "tidak-hadir": "bg-stone-200 text-stone-600 line-through",
};

const TONE_LABEL: Record<TimelineTone, string> = {
  menunggu: "menunggu konfirmasi",
  terkonfirmasi: "terkonfirmasi",
  hadir: "hadir",
  "tidak-hadir": "tidak hadir",
};

const percent = (p: { left: number; width: number }) => ({ left: `${p.left}%`, width: `${p.width}%` });

/** Garis waktu jadwal hari ini, satu lajur per tenaga (spec D 4.3, keputusan D4 & D7). */
export function ScheduleTimeline({ schedule, nowMinute }: { schedule: TodaySchedule; nowMinute: number }) {
  const actions = (
    <Link href={`/admin/booking?tanggal=${schedule.date}`} className="text-gold-600 underline-offset-4 hover:underline">
      Buka daftar Booking →
    </Link>
  );
  if (schedule.holidayName) {
    return (
      <SectionCard title="Jadwal hari ini" actions={actions}>
        <EmptyState>Klinik tutup hari ini — {schedule.holidayName}.</EmptyState>
      </SectionCard>
    );
  }
  const axis = timelineAxis(schedule.lanes.flatMap((lane) => [...lane.windows, ...lane.bookings]));
  if (!axis) {
    return (
      <SectionCard title="Jadwal hari ini" actions={actions}>
        <EmptyState>Tidak ada jadwal praktik hari ini.</EmptyState>
      </SectionCard>
    );
  }
  const span = axis.endMinute - axis.startMinute;
  const nowLeft = nowMinute >= axis.startMinute && nowMinute <= axis.endMinute ? ((nowMinute - axis.startMinute) / span) * 100 : null;

  return (
    <SectionCard title="Jadwal hari ini" actions={actions} flush>
      <div className="min-w-[40rem] space-y-3 p-4">
        <div className="ml-40 flex justify-between text-xs text-muted-foreground" aria-hidden>
          {timelineHours(axis).map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}</span>
          ))}
        </div>
        <ul className="space-y-3">
          {schedule.lanes.map((lane) => (
            <li key={lane.staffId} aria-label={`Jadwal ${lane.staffName}`} className="flex items-center gap-4">
              <div className="w-36 shrink-0">
                <div className="truncate font-medium">{lane.staffName}</div>
                <div className="text-xs text-muted-foreground">
                  {lane.bookings.length} booking · {lane.openSlots.length} slot kosong
                </div>
              </div>
              <div className="relative h-9 flex-1 rounded-md bg-cream-100">
                {lane.windows.map((window) => {
                  const p = timelinePosition(window.startMinute, window.endMinute, axis);
                  return p ? (
                    <div key={`w-${window.startMinute}`} aria-hidden className="absolute inset-y-0 rounded-md bg-white ring-1 ring-cream-300" style={percent(p)} />
                  ) : null;
                })}
                {lane.openSlots.map((slot) => {
                  const p = timelinePosition(slot.startMinute, slot.endMinute, axis);
                  return p ? (
                    <Link
                      key={`s-${slot.startMinute}`}
                      href={`/admin/booking/baru?tenaga=${lane.staffId}&tanggal=${schedule.date}&jam=${slot.time}`}
                      aria-label={`Slot kosong ${slot.time} — buat booking ${lane.staffName}`}
                      title={`${slot.time} kosong — buat booking`}
                      className="absolute inset-y-1 rounded border border-gold-300/70 hover:bg-gold-300/30"
                      style={percent(p)}
                    />
                  ) : null;
                })}
                {lane.bookings.map((booking) => {
                  const tone = timelineTone(booking.status);
                  const p = timelinePosition(booking.startMinute, booking.endMinute, axis);
                  if (!tone || !p) return null;
                  const label = `${booking.time} ${booking.patientName} · ${booking.serviceName} · ${TONE_LABEL[tone]}`;
                  return (
                    <Link
                      key={booking.id}
                      href={`/admin/booking?tanggal=${schedule.date}&sorot=${booking.id}`}
                      aria-label={label}
                      title={label}
                      className={cn("absolute inset-y-1 truncate rounded px-1 text-xs leading-7", TONE_CLASS[tone])}
                      style={percent(p)}
                    >
                      {booking.patientName}
                    </Link>
                  );
                })}
                {nowLeft !== null && (
                  <div data-now aria-hidden className="absolute inset-y-0 w-px bg-red-500" style={{ left: `${nowLeft}%` }} />
                )}
              </div>
            </li>
          ))}
        </ul>
        {schedule.offStaff.length > 0 && (
          <p className="text-xs text-muted-foreground">Tidak praktik hari ini: {schedule.offStaff.join(", ")}</p>
        )}
      </div>
    </SectionCard>
  );
}
```

`src/components/admin/dashboard-numbers.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { deltaLabel } from "@/lib/dashboard";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardNumbers } from "@/server/dashboard";
import { SectionCard } from "./page-layout";

/** Selisih rupiah tanpa "Rp": "+250.000", "−200.000", atau "sama". */
function feeDelta(current: number, previous: number): string {
  const label = deltaLabel(current, previous);
  if (label === "sama") return label;
  return `${label[0]}${formatRupiah(Math.abs(current - previous)).replace(/^Rp\s?/, "")}`;
}

function Figure({ label, value, delta, compare }: { label: string; value: ReactNode; delta: string; compare: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-display text-3xl font-semibold text-brown-900">{value}</div>
      <div className="text-xs text-muted-foreground">
        {delta} dibanding {compare}
      </div>
    </div>
  );
}

/** Kartu Angka untuk Super Admin (spec D 4.5). */
export function DashboardNumbersCard({ numbers }: { numbers: DashboardNumbers }) {
  const { current, previous, previousLabel } = numbers;
  const periods = [
    { id: "minggu", label: "Minggu ini", href: "/admin" },
    { id: "bulan", label: "Bulan ini", href: "/admin?periode=bulan" },
  ] as const;
  return (
    <SectionCard
      title="Angka"
      description={numbers.label}
      actions={
        <nav aria-label="Periode angka" className="flex gap-1 rounded-lg border p-0.5">
          {periods.map((p) => (
            <Link
              key={p.id}
              href={p.href}
              aria-current={numbers.period === p.id ? "page" : undefined}
              className={cn("rounded-md px-2 py-1 text-xs", numbers.period === p.id ? "bg-gold-500 font-semibold text-white" : "text-muted-foreground")}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Booking" value={current.bookings} delta={deltaLabel(current.bookings, previous.bookings)} compare={previousLabel} />
        <Figure label="Pasien baru" value={current.newPatients} delta={deltaLabel(current.newPatients, previous.newPatients)} compare={previousLabel} />
        <Figure
          label="Biaya booking masuk"
          value={formatRupiah(current.feeReceived)}
          delta={feeDelta(current.feeReceived, previous.feeReceived)}
          compare={previousLabel}
        />
      </div>
      <dl className="mt-4 space-y-1 border-t pt-3 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Per sumber:</dt>
          <dd>
            Situs {current.bySource.SITUS} · WhatsApp {current.bySource.WHATSAPP} · Telepon {current.bySource.TELEPON} · Walk-in{" "}
            {current.bySource.WALK_IN}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Tidak hadir &amp; batal:</dt>
          <dd>
            Tidak hadir {current.noShow} · Dibatalkan {current.cancelled} · Kedaluwarsa {current.expired}
          </dd>
        </div>
      </dl>
    </SectionCard>
  );
}
```

- [ ] **Step 4: Daftar dokter dalam dua kartu (`src/components/admin/doctor-worklist.tsx`)**

Tambahkan impor:

```tsx
import { EmptyState, SectionCard } from "./page-layout";
```

Ganti seluruh fungsi `DoctorWorklistView` dengan:

```tsx
/** Dasbor dokter (spec catatan dokter 4.2, spec D 4.4): pasien hari ini dan catatan yang tertinggal. */
export function DoctorWorklistView({ worklist }: { worklist: DoctorWorklist }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Pasien hari ini" flush>
        {worklist.today.length === 0 ? (
          <EmptyState>Belum ada pasien yang ditandai hadir hari ini.</EmptyState>
        ) : (
          <WorklistTable rows={worklist.today} withDate={false} />
        )}
      </SectionCard>
      <SectionCard title="Catatan belum final" flush>
        {worklist.unfinished.length === 0 ? (
          <EmptyState>Tidak ada catatan yang tertinggal.</EmptyState>
        ) : (
          <WorklistTable rows={worklist.unfinished} withDate />
        )}
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 5: Halaman dasbor (`src/app/(admin)/admin/page.tsx`)**

Ganti seluruh isi berkas dengan:

```tsx
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { DashboardNumbersCard } from "@/components/admin/dashboard-numbers";
import { DashboardWork } from "@/components/admin/dashboard-work";
import { DoctorWorklistView } from "@/components/admin/doctor-worklist";
import { FailedSection, PageBody, PageHeader } from "@/components/admin/page-layout";
import { ScheduleTimeline } from "@/components/admin/schedule-timeline";
import { Button } from "@/components/ui/button";
import { clinicDayLabel, greetingFor, parsePeriod } from "@/lib/dashboard";
import { formatIndonesianDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { firstName } from "@/lib/quiz-link";
import { settle } from "@/lib/settle";
import { witaDateString, witaMinutesOfDay } from "@/lib/time";
import { getDashboardNumbers, getTodaySchedule, getTodayWork } from "@/server/dashboard";
import { listDoctorWorklist } from "@/server/encounter-read";
import { requireStaff } from "@/server/session";

export const metadata = { title: "Dasbor" };

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string | string[] }>;
}) {
  const staff = await requireStaff();
  const now = new Date();
  const period = parsePeriod((await searchParams).periode);
  const canBook = can(staff.role, "booking:manage");

  // Setiap bagian dimuat sendiri-sendiri dan hanya bila berhak (spec D 4.6–4.7).
  const [work, schedule, worklist, numbers] = await Promise.all([
    canBook ? settle(getTodayWork(now), "pekerjaan hari ini") : null,
    canBook ? settle(getTodaySchedule(now), "jadwal hari ini") : null,
    can(staff.role, "record:read") ? settle(listDoctorWorklist(), "daftar dokter") : null,
    can(staff.role, "report:read") ? settle(getDashboardNumbers(period, now), "angka") : null,
  ]);

  const dayLabel =
    schedule?.ok === true
      ? clinicDayLabel({
          holidayName: schedule.data.holidayName,
          windows: schedule.data.lanes.flatMap((lane) => lane.windows),
        })
      : null;

  return (
    <>
      <AdminHeader title="Dasbor" />
      <PageBody>
        <PageHeader
          title={`${greetingFor(now)}, ${firstName(staff.name)}`}
          description={[formatIndonesianDate(now), dayLabel].filter(Boolean).join(" · ")}
          actions={
            canBook ? (
              <Button asChild>
                <Link href="/admin/booking/baru">+ Booking Baru</Link>
              </Button>
            ) : undefined
          }
        />
        {work && (work.ok ? <DashboardWork work={work.data} today={witaDateString(now)} /> : <FailedSection title="Pekerjaan hari ini" />)}
        {schedule &&
          (schedule.ok ? (
            <ScheduleTimeline schedule={schedule.data} nowMinute={witaMinutesOfDay(now)} />
          ) : (
            <FailedSection title="Jadwal hari ini" />
          ))}
        {(worklist || numbers) && (
          <div className="grid gap-6 xl:grid-cols-2">
            {worklist && (worklist.ok ? <DoctorWorklistView worklist={worklist.data} /> : <FailedSection title="Pasien hari ini" />)}
            {numbers && (numbers.ok ? <DashboardNumbersCard numbers={numbers.data} /> : <FailedSection title="Angka" />)}
          </div>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 6: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/dashboard-work.test.tsx tests/unit/components/schedule-timeline.test.tsx tests/unit/components/dashboard-numbers.test.tsx tests/unit/components/doctor-worklist.test.tsx tests/unit/architecture.test.ts`
Expected: PASS. Uji daftar dokter yang lama tetap lulus, karena nama region-nya sama.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/dashboard-work.tsx src/components/admin/schedule-timeline.tsx src/components/admin/dashboard-numbers.tsx src/components/admin/doctor-worklist.tsx "src/app/(admin)/admin/page.tsx" tests/unit/components/dashboard-work.test.tsx tests/unit/components/schedule-timeline.test.tsx tests/unit/components/dashboard-numbers.test.tsx
git commit -m "feat: show daily work, a schedule timeline, and owner numbers on the dashboard"
```

---

### Task 5: Booking Baru dengan isian awal

**Files:**
- Create: `src/lib/booking-prefill.ts`, `src/server/booking-prefill.ts`
- Modify: `src/server/patient.ts` (+ `getPatientSummary`), `src/components/admin/appointment-form.tsx` (`initial`, `notice`), `src/app/(admin)/admin/booking/baru/page.tsx`
- Test: `tests/unit/booking-prefill.test.ts`, `tests/integration/booking-prefill.test.ts` (baru), `tests/unit/components/appointment-form.test.tsx` (tambah)

**Interfaces:**
- Consumes: Task 1 (`PageHeader`, `PageBody`); `computeAvailability`; tautan dari Task 4 dan Task 7 (`?tenaga=&tanggal=&jam=`, `?pasien=`).
- Produces:
  - `BookingFormInitial = { patient: PatientSummary | null; kind: "KONSULTASI" | "TREATMENT"; staffId: string | null; branchId: string | null; date: string | null; slot: SlotOption | null }`, `EMPTY_BOOKING_INITIAL`
  - `parseTimeParam(value?: string): number | null`, `parseDateParam(value?: string): string | null`
  - `getPatientSummary(id: string): Promise<PatientSummary | null>`
  - `BookingPrefillParams = { pasien?: string; tenaga?: string; tanggal?: string; jam?: string }`, `SLOT_TAKEN_NOTICE`, `resolveBookingPrefill(params, now?): Promise<{ initial: BookingFormInitial; notice: string | null }>`
  - `AppointmentForm` props + `initial?: BookingFormInitial; notice?: string | null`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/booking-prefill.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateParam, parseTimeParam } from "@/lib/booking-prefill";

describe("isian awal Booking Baru (spec D 5.8)", () => {
  it("jam: HH.MM atau HH:MM", () => {
    expect(parseTimeParam("11.00")).toBe(660);
    expect(parseTimeParam("9:30")).toBe(570);
    expect(parseTimeParam("25.00")).toBeNull();
    expect(parseTimeParam("11.75")).toBeNull();
    expect(parseTimeParam("pagi")).toBeNull();
    expect(parseTimeParam(undefined)).toBeNull();
  });

  it("tanggal: YYYY-MM-DD yang nyata", () => {
    expect(parseDateParam("2031-02-12")).toBe("2031-02-12");
    expect(parseDateParam("2031-02-30")).toBeNull();
    expect(parseDateParam("12-02-2031")).toBeNull();
    expect(parseDateParam(undefined)).toBeNull();
  });
});
```

`tests/integration/booking-prefill.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { resolveBookingPrefill, SLOT_TAKEN_NOTICE } from "@/server/booking-prefill";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "isian-awal-uji";
const WA = "6281277500001";
const DAY = "2031-02-12"; // Rabu
const NOW = new Date("2031-02-10T09:00:00+08:00");

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
  await prisma.scheduleTemplate.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
  await prisma.staff.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
}

describe("resolveBookingPrefill", () => {
  let doctorId: string;
  let therapistId: string;
  let branchId: string;
  let patientId: string;

  beforeEach(async () => {
    await cleanup();
    branchId = (
      await prisma.branch.create({
        data: { slug: SLUG, name: "Cabang Isian Awal", address: "Alamat", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF" },
      })
    ).id;
    doctorId = (await prisma.staff.create({ data: { slug: `${SLUG}-dokter`, name: "dr. Isian Awal", role: "DOKTER" } })).id;
    therapistId = (await prisma.staff.create({ data: { slug: `${SLUG}-terapis`, name: "Terapis Isian Awal", role: "TERAPIS" } })).id;
    await prisma.scheduleTemplate.create({
      data: { staffId: doctorId, branchId, weekday: 3, startMinute: 660, endMinute: 1140, slotMinutes: 30 },
    });
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2031-7500", name: "Rina Isian Awal", whatsapp: WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("tenaga, tanggal, dan jam kosong menjadi pilihan; pasien ikut terpilih", async () => {
    const result = await resolveBookingPrefill({ pasien: patientId, tenaga: doctorId, tanggal: DAY, jam: "11.00" }, NOW);
    expect(result.notice).toBeNull();
    expect(result.initial).toMatchObject({ kind: "KONSULTASI", staffId: doctorId, branchId, date: DAY });
    expect(result.initial.patient).toMatchObject({ id: patientId, name: "Rina Isian Awal" });
    expect(result.initial.slot?.startAt).toEqual(combineWitaDateAndMinutes(DAY, 660));
    expect(result.initial.slot?.label).toBe("11.00");
  });

  it("jam yang sudah terisi: tenaga dan tanggal tetap, jam kosong dengan pesan", async () => {
    const startAt = combineWitaDateAndMinutes(DAY, 660);
    await prisma.appointment.create({
      data: {
        code: "ISA-1",
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        source: "WHATSAPP",
        status: "TERKONFIRMASI",
        branchId,
        staffId: doctorId,
        patientId,
      },
    });
    const result = await resolveBookingPrefill({ tenaga: doctorId, tanggal: DAY, jam: "11.00" }, NOW);
    expect(result.notice).toBe(SLOT_TAKEN_NOTICE);
    expect(result.initial).toMatchObject({ staffId: doctorId, date: DAY, slot: null });
  });

  it("terapis: jenis treatment dan pesan untuk memilih layanan dulu", async () => {
    const result = await resolveBookingPrefill({ tenaga: therapistId, tanggal: DAY, jam: "11.00" }, NOW);
    expect(result.initial).toMatchObject({ kind: "TREATMENT", staffId: therapistId, date: DAY, slot: null });
    expect(result.notice).toBe("Pilih layanan treatment, lalu jam 11.00.");
  });

  it("isian yang tidak sah diabaikan tanpa galat", async () => {
    expect((await resolveBookingPrefill({ pasien: "tidak-ada", tenaga: "tidak-ada" }, NOW)).initial).toEqual({
      patient: null,
      kind: "KONSULTASI",
      staffId: null,
      branchId: null,
      date: null,
      slot: null,
    });
    const past = await resolveBookingPrefill({ tenaga: doctorId, tanggal: "2031-02-01", jam: "11.00" }, NOW);
    expect(past.initial).toMatchObject({ staffId: doctorId, date: null, slot: null });
    expect(past.notice).toBeNull();
    const badTime = await resolveBookingPrefill({ tenaga: doctorId, tanggal: DAY, jam: "25.00" }, NOW);
    expect(badTime).toMatchObject({ notice: null, initial: { date: DAY, slot: null } });
  });
});
```

Tambahkan ke `tests/unit/components/appointment-form.test.tsx`, di dalam `describe("AppointmentForm", …)`:

```tsx
  it("isian awal: pasien, tenaga, tanggal, dan jam sudah terpilih (spec D 5.8)", async () => {
    const user = userEvent.setup();
    render(
      <AppointmentForm
        branches={[{ id: "b1", name: "SunDY Mahakeret" }]}
        staff={[{ id: "d1", name: "dr. Diane", role: "DOKTER" }]}
        treatmentGroups={[]}
        consultationServiceId="svc-konsultasi"
        today={TODAY}
        bookingFee={100000}
        initial={{ patient: MARIA, kind: "KONSULTASI", staffId: "d1", branchId: "b1", date: TODAY, slot: SLOT }}
      />,
    );
    expect(summary()).toHaveTextContent("PasienMaria Wenas");
    expect(summary()).toHaveTextContent("JadwalSen, 5 Okt · 11.00");
    expect(await screen.findByRole("button", { name: "11.00" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    await waitFor(() => expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({ patientId: "p1", startAt: START })));
  });

  it("pesan isian awal tampil di atas formulir", () => {
    render(
      <AppointmentForm
        branches={[{ id: "b1", name: "SunDY Mahakeret" }]}
        staff={[{ id: "d1", name: "dr. Diane", role: "DOKTER" }]}
        treatmentGroups={[]}
        consultationServiceId="svc-konsultasi"
        today={TODAY}
        bookingFee={100000}
        notice="Jam itu sudah tidak tersedia. Pilih jam lain."
      />,
    );
    expect(screen.getByText("Jam itu sudah tidak tersedia. Pilih jam lain.")).toHaveAttribute("role", "status");
  });
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/booking-prefill.test.ts tests/unit/components/appointment-form.test.tsx && npm run test:integration -- tests/integration/booking-prefill.test.ts`
Expected: FAIL. `@/lib/booking-prefill` dan `@/server/booking-prefill` belum ada, dan `initial`/`notice` belum diterima.

- [ ] **Step 3: Tulis `src/lib/booking-prefill.ts`**

```ts
import type { PatientSummary } from "@/server/patient";
import type { SlotOption } from "./slot";

/** Nilai awal formulir Booking Baru; setiap bagian boleh kosong (spec D 5.8). */
export type BookingFormInitial = {
  patient: PatientSummary | null;
  kind: "KONSULTASI" | "TREATMENT";
  staffId: string | null;
  branchId: string | null;
  date: string | null;
  slot: SlotOption | null;
};

export const EMPTY_BOOKING_INITIAL: BookingFormInitial = {
  patient: null,
  kind: "KONSULTASI",
  staffId: null,
  branchId: null,
  date: null,
  slot: null,
};

/** "11.00" atau "11:00" → menit sejak tengah malam; selain itu null. */
export function parseTimeParam(value: string | undefined): number | null {
  const match = value ? /^(\d{1,2})[.:](\d{2})$/.exec(value) : null;
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

/** Tanggal "YYYY-MM-DD" yang benar-benar ada; selain itu null. */
export function parseDateParam(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value ? value : null;
}
```

- [ ] **Step 4: `getPatientSummary` di `src/server/patient.ts`**

Tambahkan setelah `listRecentPatients`:

```ts
/** Satu pasien dalam bentuk ringkasan, untuk Booking Baru dengan pasien terpilih (spec D 5.8). */
export async function getPatientSummary(id: string): Promise<PatientSummary | null> {
  await requireCapability("booking:manage");
  const row = await prisma.patient.findUnique({ where: { id }, select: summarySelect(new Date()) });
  return row ? toSummary(row) : null;
}
```

- [ ] **Step 5: Tulis `src/server/booking-prefill.ts`**

```ts
import { EMPTY_BOOKING_INITIAL, parseDateParam, parseTimeParam, type BookingFormInitial } from "@/lib/booking-prefill";
import { prisma } from "@/lib/db";
import { combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaWeekday } from "@/lib/time";
import { computeAvailability } from "@/server/availability";
import { getPatientSummary } from "@/server/patient";
import { requireCapability } from "@/server/session";

// Modul biasa, bukan "use server": hanya dipanggil halaman Booking Baru (server component).

export type BookingPrefillParams = { pasien?: string; tenaga?: string; tanggal?: string; jam?: string };

export const SLOT_TAKEN_NOTICE = "Jam itu sudah tidak tersedia. Pilih jam lain.";

/** Durasi bawaan Booking Baru (konsultasi), sama dengan slot di garis waktu dasbor. */
const CONSULTATION_MINUTES = 30;

/**
 * Isian awal hanya mengisi formulir; booking tetap dibuat lewat Buat Booking dengan
 * pemeriksaan biasa. Isian yang tidak sah diabaikan, dan formulir mulai dari bagian
 * yang masih sah (spec D 5.8).
 */
export async function resolveBookingPrefill(
  params: BookingPrefillParams,
  now: Date = new Date(),
): Promise<{ initial: BookingFormInitial; notice: string | null }> {
  await requireCapability("booking:manage");
  const initial: BookingFormInitial = { ...EMPTY_BOOKING_INITIAL };

  if (params.pasien) initial.patient = await getPatientSummary(params.pasien);

  const staff = params.tenaga
    ? await prisma.staff.findFirst({
        where: { id: params.tenaga, role: { in: ["DOKTER", "TERAPIS"] }, isActive: true },
        select: { id: true, role: true },
      })
    : null;
  if (!staff) return { initial, notice: null };
  initial.staffId = staff.id;
  initial.kind = staff.role === "TERAPIS" ? "TREATMENT" : "KONSULTASI";

  const date = parseDateParam(params.tanggal);
  if (!date || date < witaDateString(now)) return { initial, notice: null };
  initial.date = date;
  const template = await prisma.scheduleTemplate.findUnique({
    where: { staffId_weekday: { staffId: staff.id, weekday: witaWeekday(new Date(`${date}T12:00:00Z`)) } },
    select: { branchId: true },
  });
  if (template) initial.branchId = template.branchId;

  const minute = parseTimeParam(params.jam);
  if (minute === null) return { initial, notice: null };
  // Durasi treatment baru diketahui setelah layanannya dipilih.
  if (staff.role === "TERAPIS") return { initial, notice: `Pilih layanan treatment, lalu jam ${minutesToTimeLabel(minute)}.` };

  const branchId =
    initial.branchId ??
    (await prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true } }))?.id ??
    null;
  const slots = branchId
    ? await computeAvailability({ staffId: staff.id, branchId, date, durationMinutes: CONSULTATION_MINUTES }, { minLeadMinutes: 0 })
    : [];
  const wanted = combineWitaDateAndMinutes(date, minute).getTime();
  const slot = slots.find((s) => s.startAt.getTime() === wanted) ?? null;
  if (!slot) return { initial, notice: SLOT_TAKEN_NOTICE };
  initial.slot = slot;
  initial.branchId = branchId;
  return { initial, notice: null };
}
```

- [ ] **Step 6: `initial` dan `notice` di `src/components/admin/appointment-form.tsx`**

Tambahkan impor:

```tsx
import type { BookingFormInitial } from "@/lib/booking-prefill";
```

Tambahkan ke tipe `Props` setelah `bookingFee`:

```tsx
  /** Isian awal dari dasbor atau Data Pasien (spec D 5.8); booking tetap dibuat lewat Buat Booking. */
  initial?: BookingFormInitial;
  /** Pesan singkat bila sebagian isian awal tidak lagi sah. */
  notice?: string | null;
```

Tambahkan `initial,` dan `notice,` ke destrukturisasi parameter `AppointmentForm` (setelah `bookingFee,`). Lalu ganti lima baris state:

```tsx
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [kind, setKind] = useState<BookingKind>("KONSULTASI");
  const [serviceId, setServiceId] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
```

dengan:

```tsx
  const [patient, setPatient] = useState<PatientSummary | null>(initial?.patient ?? null);
  const [kind, setKind] = useState<BookingKind>(initial?.kind ?? "KONSULTASI");
  const [serviceId, setServiceId] = useState("");
  const [branchId, setBranchId] = useState(
    initial?.branchId && branches.some((b) => b.id === initial.branchId) ? initial.branchId : (branches[0]?.id ?? ""),
  );
  const [staffId, setStaffId] = useState(initial?.staffId ?? "");
```

Ganti juga:

```tsx
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<SlotOption | null>(null);
```

dengan:

```tsx
  const [date, setDate] = useState(initial?.date ?? "");
  const [slot, setSlot] = useState<SlotOption | null>(initial?.slot ?? null);
```

Tambahkan sebagai anak pertama `<fieldset …>`, sebelum `<section …>` "1 · Pasien":

```tsx
        {notice && !locked && (
          <p role="status" className="rounded-md border border-gold-300 bg-gold-300/10 p-3 text-sm text-brown-800">
            {notice}
          </p>
        )}
```

- [ ] **Step 7: Halaman Booking Baru (`src/app/(admin)/admin/booking/baru/page.tsx`)**

Tambahkan impor:

```tsx
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { resolveBookingPrefill } from "@/server/booking-prefill";
```

Ganti tanda tangan fungsi dan `Promise.all`:

```tsx
export default async function NewAppointmentPage() {
  await requireCapability("booking:manage");

  const [branches, categories, staffList, setting] = await Promise.all([
    getBranches(),
    getServiceCategoriesWithServices(),
    listSchedulableStaff(),
    getClinicSetting(),
  ]);
```

dengan:

```tsx
type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireCapability("booking:manage");
  const params = await searchParams;

  const [branches, categories, staffList, setting, prefill] = await Promise.all([
    getBranches(),
    getServiceCategoriesWithServices(),
    listSchedulableStaff(),
    getClinicSetting(),
    resolveBookingPrefill({ pasien: one(params.pasien), tenaga: one(params.tenaga), tanggal: one(params.tanggal), jam: one(params.jam) }),
  ]);
```

Ganti blok `return (` dengan:

```tsx
  return (
    <>
      <AdminHeader title="Booking Baru" />
      <PageBody>
        <PageHeader
          title="Booking Baru"
          trail={[{ label: "Booking", href: "/admin/booking" }, { label: "Baru" }]}
          description="Untuk booking lewat WhatsApp, telepon, atau pasien yang datang langsung."
        />
        {activeBranches.length === 0 || staffList.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada cabang aktif atau tenaga yang dapat dijadwalkan.</p>
        ) : (
          <AppointmentForm
            branches={activeBranches.map((b) => ({ id: b.id, name: b.name }))}
            staff={staffList.map((s) => ({
              id: s.id,
              name: s.name,
              role: s.role === "DOKTER" ? "DOKTER" : "TERAPIS",
            }))}
            treatmentGroups={treatmentGroups}
            consultationServiceId={consultation?.id ?? null}
            today={witaDateString(new Date())}
            bookingFee={setting.bookingFee}
            initial={prefill.initial}
            notice={prefill.notice}
          />
        )}
      </PageBody>
    </>
  );
```

- [ ] **Step 8: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/booking-prefill.test.ts tests/unit/components/appointment-form.test.tsx && npm run test:integration -- tests/integration/booking-prefill.test.ts tests/integration/patient.test.ts`
Expected: PASS. Uji Booking Baru yang lama tetap lulus.

Run: `npx tsc --noEmit && npm run lint && npx vitest run tests/unit/architecture.test.ts`
Expected: bersih dan PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/booking-prefill.ts src/server/booking-prefill.ts src/server/patient.ts src/components/admin/appointment-form.tsx "src/app/(admin)/admin/booking/baru/page.tsx" tests/unit/booking-prefill.test.ts tests/integration/booking-prefill.test.ts tests/unit/components/appointment-form.test.tsx
git commit -m "feat: open New Booking with a patient, staff, date, and time already chosen"
```

---

### Task 6: Jadwal — tab, jam kerja seminggu, hapus pengecualian

**Files:**
- Create: `src/lib/schedule-week.ts`, `src/components/admin/weekly-schedule-form.tsx`, `src/components/admin/schedule-exception-list.tsx`
- Modify: `src/server/schedule.ts` (+ `saveWeeklySchedule`, `deleteScheduleException`), `src/components/admin/holiday-list.tsx` (`emptyText`), `src/app/(admin)/admin/jadwal/page.tsx`
- Delete: `src/components/admin/schedule-template-form.tsx`
- Test: `tests/unit/schedule-week.test.ts`, `tests/unit/components/weekly-schedule-form.test.tsx`, `tests/unit/components/schedule-exception-list.test.tsx`, `tests/integration/schedule-week.test.ts` (baru)

**Interfaces:**
- Consumes: Task 1 (`PageHeader`, `PageBody`, `SectionCard`, `EmptyState`, `PageTabs`, `resolveTab`).
- Produces:
  - `WEEKDAY_LABELS`, `WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]`
  - `WeekRow = { weekday: number; open: boolean; start: string; end: string }`
  - `weekRows(templates: { weekday: number; startMinute: number; endMinute: number }[]): WeekRow[]`
  - `rowsChanged(rows: WeekRow[], saved: WeekRow[]): boolean`
  - `WeeklyDayInput = { weekday: number; open: boolean; startMinute: number | null; endMinute: number | null }`, `toDayInputs(rows): WeeklyDayInput[]`
  - `saveWeeklySchedule({ staffId, branchId, days: WeeklyDayInput[] }): Promise<ActionResult<void>>`
  - `deleteScheduleException(id: string): Promise<ActionResult<void>>`
  - `ExceptionRow = { id: string; dateLabel: string; kindLabel: string; timeLabel: string | null }`, `ScheduleExceptionList({ exceptions: ExceptionRow[] })`
  - `WeeklyScheduleForm({ staffId, branchId, branchName, templates })`
  - `HolidayList({ holidays, emptyText? })`

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/schedule-week.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowsChanged, toDayInputs, weekRows } from "@/lib/schedule-week";

const TEMPLATES = [
  { weekday: 1, startMinute: 660, endMinute: 1140 },
  { weekday: 6, startMinute: 600, endMinute: 900 },
];

describe("jam kerja seminggu (spec D 5.1)", () => {
  it("baris Senin–Minggu; hari tanpa jam kerja tutup dengan jam bawaan", () => {
    const rows = weekRows(TEMPLATES);
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(rows[0]).toEqual({ weekday: 1, open: true, start: "11:00", end: "19:00" });
    expect(rows[1]).toEqual({ weekday: 2, open: false, start: "11:00", end: "19:00" });
    expect(rows[5]).toEqual({ weekday: 6, open: true, start: "10:00", end: "15:00" });
    expect(rows[6]).toMatchObject({ weekday: 0, open: false });
  });

  it("perubahan: jam hari buka atau status buka; jam hari tutup diabaikan", () => {
    const saved = weekRows(TEMPLATES);
    expect(rowsChanged(saved, saved)).toBe(false);
    expect(rowsChanged(saved.map((r) => (r.weekday === 1 ? { ...r, end: "18:00" } : r)), saved)).toBe(true);
    expect(rowsChanged(saved.map((r) => (r.weekday === 2 ? { ...r, end: "12:00" } : r)), saved)).toBe(false);
    expect(rowsChanged(saved.map((r) => (r.weekday === 0 ? { ...r, open: true } : r)), saved)).toBe(true);
  });

  it("dicentang lalu dibatalkan lagi: tidak dianggap berubah (Review Focus 5)", () => {
    const saved = weekRows(TEMPLATES);
    const toggledTwice = saved.map((r) => (r.weekday === 0 ? { ...r, open: true } : r)).map((r) => (r.weekday === 0 ? { ...r, open: false } : r));
    expect(rowsChanged(toggledTwice, saved)).toBe(false);
  });

  it("ke masukan server: menit, atau null untuk jam yang kosong", () => {
    const days = toDayInputs(weekRows(TEMPLATES).map((r) => (r.weekday === 3 ? { ...r, open: true, start: "" } : r)));
    expect(days.find((d) => d.weekday === 1)).toEqual({ weekday: 1, open: true, startMinute: 660, endMinute: 1140 });
    expect(days.find((d) => d.weekday === 3)).toEqual({ weekday: 3, open: true, startMinute: null, endMinute: 1140 });
    expect(days.find((d) => d.weekday === 2)).toEqual({ weekday: 2, open: false, startMinute: 660, endMinute: 1140 });
  });
});
```

`tests/integration/schedule-week.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { WeeklyDayInput } from "@/lib/schedule-week";
import { deleteScheduleException, saveWeeklySchedule } from "@/server/schedule";
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

const SLUG = "jam-minggu-uji";

async function cleanup() {
  await prisma.scheduleException.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.scheduleTemplate.deleteMany({ where: { staff: { slug: SLUG } } });
  await prisma.staff.deleteMany({ where: { slug: SLUG } });
  await prisma.branch.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Resepsionis Uji", entity: { in: ["ScheduleTemplate", "ScheduleException"] } } });
}

const week = (open: (weekday: number) => WeeklyDayInput): WeeklyDayInput[] => [1, 2, 3, 4, 5, 6, 0].map(open);

describe("jam kerja seminggu dan pengecualian (spec D 5.1)", () => {
  let staffId: string;
  let branchId: string;

  beforeEach(async () => {
    await cleanup();
    branchId = (
      await prisma.branch.create({
        data: { slug: SLUG, name: "Cabang Jam", address: "Alamat", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF" },
      })
    ).id;
    staffId = (await prisma.staff.create({ data: { slug: SLUG, name: "Terapis Jam", role: "TERAPIS" } })).id;
    await prisma.scheduleTemplate.create({
      data: { staffId, branchId, weekday: 1, startMinute: 660, endMinute: 1140, slotMinutes: 30 },
    });
    vi.mocked(requireCapability).mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("seluruh minggu tersimpan sekaligus; hari tutup dihapus; hari yang sama tidak diaudit ulang", async () => {
    await unwrap(
      saveWeeklySchedule({
        staffId,
        branchId,
        days: week((weekday) =>
          weekday === 1
            ? { weekday, open: true, startMinute: 660, endMinute: 1140 }
            : weekday === 2
              ? { weekday, open: true, startMinute: 600, endMinute: 900 }
              : { weekday, open: false, startMinute: null, endMinute: null },
        ),
      }),
    );
    const templates = await prisma.scheduleTemplate.findMany({ where: { staffId }, orderBy: { weekday: "asc" } });
    expect(templates.map((t) => [t.weekday, t.startMinute, t.endMinute])).toEqual([
      [1, 660, 1140],
      [2, 600, 900],
    ]);
    expect(await prisma.auditLog.count({ where: { actorName: "Resepsionis Uji", action: "schedule-template.upsert" } })).toBe(1);
    expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("schedule:manage");

    await unwrap(saveWeeklySchedule({ staffId, branchId, days: week((weekday) => ({ weekday, open: false, startMinute: null, endMinute: null })) }));
    expect(await prisma.scheduleTemplate.count({ where: { staffId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { actorName: "Resepsionis Uji", action: "schedule-template.delete" } })).toBe(2);
  });

  it("satu hari tidak sah: tidak ada yang tersimpan, galat menyebut harinya", async () => {
    const result = await saveWeeklySchedule({
      staffId,
      branchId,
      days: week((weekday) =>
        weekday === 3
          ? { weekday, open: true, startMinute: 900, endMinute: 600 }
          : { weekday, open: true, startMinute: 600, endMinute: 900 },
      ),
    });
    expect(result).toEqual({ ok: false, error: "Rabu: jam selesai harus setelah jam mulai." });
    const monday = await prisma.scheduleTemplate.findFirstOrThrow({ where: { staffId, weekday: 1 } });
    expect([monday.startMinute, monday.endMinute]).toEqual([660, 1140]);
    expect(await prisma.scheduleTemplate.count({ where: { staffId } })).toBe(1);
  });

  it("minggu yang tidak lengkap ditolak", async () => {
    expect(await saveWeeklySchedule({ staffId, branchId, days: [{ weekday: 1, open: false, startMinute: null, endMinute: null }] })).toEqual({
      ok: false,
      error: "Jam kerja tidak lengkap. Muat ulang halaman lalu coba lagi.",
    });
  });

  it("hapus pengecualian tercatat di audit; menghapus dua kali ditolak dengan pesan", async () => {
    const exception = await prisma.scheduleException.create({
      data: { staffId, branchId, date: new Date("2031-02-12T00:00:00Z"), kind: "LIBUR" },
    });
    await unwrap(deleteScheduleException(exception.id));
    expect(await prisma.scheduleException.count({ where: { id: exception.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "schedule-exception.delete", entityId: exception.id } })).toBe(1);
    expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("schedule:manage");
    expect(await deleteScheduleException(exception.id)).toEqual({ ok: false, error: "Pengecualian ini sudah dihapus." });
  });
});
```

`tests/unit/components/weekly-schedule-form.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyScheduleForm } from "@/components/admin/weekly-schedule-form";
import { saveWeeklySchedule } from "@/server/schedule";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/schedule", () => ({ saveWeeklySchedule: vi.fn() }));

const TEMPLATES = [{ weekday: 1, startMinute: 660, endMinute: 1140 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveWeeklySchedule).mockResolvedValue({ ok: true, data: undefined });
});

function renderForm() {
  render(<WeeklyScheduleForm staffId="t1" branchId="b1" branchName="SunDY Mahakeret" templates={TEMPLATES} />);
  return screen.getByRole("region", { name: "Jam kerja mingguan · SunDY Mahakeret" });
}

describe("WeeklyScheduleForm", () => {
  it("Simpan aktif hanya bila ada perubahan; satu kali simpan untuk seminggu", async () => {
    const user = userEvent.setup();
    const card = renderForm();
    const save = within(card).getByRole("button", { name: "Simpan jam kerja" });
    expect(save).toBeDisabled();
    expect(within(card).getAllByText("Tutup")).toHaveLength(6);

    await user.click(within(card).getByRole("checkbox", { name: "Buka hari Minggu" }));
    expect(save).toBeEnabled();
    // <input type="time"> di jsdom: nilai diganti langsung, tidak diketik per huruf.
    fireEvent.change(within(card).getByLabelText("Selesai Minggu"), { target: { value: "13:00" } });
    await user.click(save);

    await waitFor(() => expect(saveWeeklySchedule).toHaveBeenCalledTimes(1));
    const { days } = vi.mocked(saveWeeklySchedule).mock.calls[0][0];
    expect(days).toHaveLength(7);
    expect(days.find((d) => d.weekday === 0)).toEqual({ weekday: 0, open: true, startMinute: 660, endMinute: 780 });
    expect(days.find((d) => d.weekday === 1)).toEqual({ weekday: 1, open: true, startMinute: 660, endMinute: 1140 });
  });

  it("dicentang lalu dibatalkan lagi: Simpan kembali nonaktif", async () => {
    const user = userEvent.setup();
    const card = renderForm();
    const sunday = within(card).getByRole("checkbox", { name: "Buka hari Minggu" });
    await user.click(sunday);
    await user.click(sunday);
    expect(within(card).getByRole("button", { name: "Simpan jam kerja" })).toBeDisabled();
  });

  it("jam kosong pada hari buka: pesan, tanpa memanggil server", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    const card = renderForm();
    fireEvent.change(within(card).getByLabelText("Mulai Senin"), { target: { value: "" } });
    await user.click(within(card).getByRole("button", { name: "Simpan jam kerja" }));
    expect(toast.error).toHaveBeenCalledWith("Isi jam mulai dan selesai untuk setiap hari yang buka.");
    expect(saveWeeklySchedule).not.toHaveBeenCalled();
  });
});
```

`tests/unit/components/schedule-exception-list.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleExceptionList } from "@/components/admin/schedule-exception-list";
import { deleteScheduleException } from "@/server/schedule";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/schedule", () => ({ deleteScheduleException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteScheduleException).mockResolvedValue({ ok: true, data: undefined });
});

describe("ScheduleExceptionList", () => {
  it("Hapus meminta konfirmasi lalu menghapus", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleExceptionList
        exceptions={[{ id: "x1", dateLabel: "Rabu, 12 Februari 2031", kindLabel: "Jam tambahan", timeLabel: "19.00–21.00" }]}
      />,
    );
    expect(screen.getByRole("row", { name: /Rabu, 12 Februari 2031 Jam tambahan 19\.00–21\.00/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hapus" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Booking yang sudah ada tidak berubah.");
    expect(deleteScheduleException).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Hapus pengecualian" }));
    await waitFor(() => expect(deleteScheduleException).toHaveBeenCalledWith("x1"));
  });

  it("kosong: keterangan", () => {
    render(<ScheduleExceptionList exceptions={[]} />);
    expect(screen.getByText("Belum ada pengecualian mulai hari ini.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/schedule-week.test.ts tests/unit/components/weekly-schedule-form.test.tsx tests/unit/components/schedule-exception-list.test.tsx && npm run test:integration -- tests/integration/schedule-week.test.ts`
Expected: FAIL. Modul dan aksi barunya belum ada.

- [ ] **Step 3: Tulis `src/lib/schedule-week.ts`**

```ts
import { minutesToTimeInput, timeInputToMinutes } from "./time";

export const WEEKDAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
/** Urutan tabel jam kerja: Senin dulu, Minggu terakhir. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const DEFAULT_START = "11:00";
const DEFAULT_END = "19:00";

/** Satu baris tabel jam kerja; jam dalam format <input type="time"> ("HH:MM"). */
export type WeekRow = { weekday: number; open: boolean; start: string; end: string };

export function weekRows(templates: { weekday: number; startMinute: number; endMinute: number }[]): WeekRow[] {
  return WEEK_ORDER.map((weekday) => {
    const template = templates.find((t) => t.weekday === weekday);
    return template
      ? { weekday, open: true, start: minutesToTimeInput(template.startMinute), end: minutesToTimeInput(template.endMinute) }
      : { weekday, open: false, start: DEFAULT_START, end: DEFAULT_END };
  });
}

/** Jam di hari yang tutup diabaikan: mencentang lalu membatalkan centang bukan perubahan. */
export function rowsChanged(rows: WeekRow[], saved: WeekRow[]): boolean {
  return rows.some((row) => {
    const before = saved.find((s) => s.weekday === row.weekday);
    if (!before || row.open !== before.open) return true;
    return row.open && (row.start !== before.start || row.end !== before.end);
  });
}

export type WeeklyDayInput = { weekday: number; open: boolean; startMinute: number | null; endMinute: number | null };

export function toDayInputs(rows: WeekRow[]): WeeklyDayInput[] {
  return rows.map((row) => ({
    weekday: row.weekday,
    open: row.open,
    startMinute: timeInputToMinutes(row.start),
    endMinute: timeInputToMinutes(row.end),
  }));
}
```

- [ ] **Step 4: Aksi server di `src/server/schedule.ts`**

Tambahkan impor:

```ts
import { WEEKDAY_LABELS, type WeeklyDayInput } from "@/lib/schedule-week";
```

Tambahkan setelah `deleteScheduleTemplate`:

```ts
/**
 * Jam kerja seminggu dalam satu transaksi (spec D 5.1). Hari yang tidak sah
 * membatalkan semuanya. Hari yang tutup dihapus jam kerjanya. Booking yang sudah
 * ada tidak diubah: hari itu hanya tidak lagi menawarkan slot baru.
 */
export async function saveWeeklySchedule(input: {
  staffId: string;
  branchId: string;
  days: WeeklyDayInput[];
}): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("schedule:manage");
    const weekdays = input.days.map((day) => day.weekday);
    if (
      input.days.length !== 7 ||
      new Set(weekdays).size !== 7 ||
      weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    ) {
      throw new UserFacingError("Jam kerja tidak lengkap. Muat ulang halaman lalu coba lagi.");
    }
    for (const day of input.days) {
      if (!day.open) continue;
      if (day.startMinute === null || day.endMinute === null) {
        throw new UserFacingError(`${WEEKDAY_LABELS[day.weekday]}: isi jam mulai dan selesai.`);
      }
      if (day.endMinute <= day.startMinute) {
        throw new UserFacingError(`${WEEKDAY_LABELS[day.weekday]}: jam selesai harus setelah jam mulai.`);
      }
    }

    const existing = await prisma.scheduleTemplate.findMany({ where: { staffId: input.staffId } });
    const changes: { action: "schedule-template.upsert" | "schedule-template.delete"; id: string; summary: string }[] = [];
    await prisma.$transaction(async (tx) => {
      for (const day of input.days) {
        const current = existing.find((t) => t.weekday === day.weekday);
        if (!day.open) {
          if (current) {
            await tx.scheduleTemplate.delete({ where: { id: current.id } });
            changes.push({ action: "schedule-template.delete", id: current.id, summary: `staf ${input.staffId}, hari ${day.weekday}` });
          }
          continue;
        }
        const startMinute = day.startMinute!;
        const endMinute = day.endMinute!;
        if (current && current.branchId === input.branchId && current.startMinute === startMinute && current.endMinute === endMinute) {
          continue;
        }
        const saved = await tx.scheduleTemplate.upsert({
          where: { staffId_weekday: { staffId: input.staffId, weekday: day.weekday } },
          update: { branchId: input.branchId, startMinute, endMinute, slotMinutes: 30 },
          create: { staffId: input.staffId, branchId: input.branchId, weekday: day.weekday, startMinute, endMinute, slotMinutes: 30 },
        });
        changes.push({
          action: "schedule-template.upsert",
          id: saved.id,
          summary: `staf ${input.staffId}, hari ${day.weekday}, ${startMinute}-${endMinute}`,
        });
      }
    });

    for (const change of changes) {
      await recordAudit({ actor, action: change.action, entity: "ScheduleTemplate", entityId: change.id, summary: change.summary });
    }
    safeRevalidatePath("/admin/jadwal");
    safeRevalidatePath("/admin");
  });
}

/** Hapus pengecualian tanggal (spec D 5.1). Booking yang sudah ada tidak berubah. */
export async function deleteScheduleException(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireCapability("schedule:manage");
    const existing = await prisma.scheduleException.findUnique({ where: { id } });
    if (!existing) throw new UserFacingError("Pengecualian ini sudah dihapus.");
    await prisma.scheduleException.delete({ where: { id } });
    await recordAudit({
      actor,
      action: "schedule-exception.delete",
      entity: "ScheduleException",
      entityId: id,
      summary: `staf ${existing.staffId}, ${existing.date.toISOString().slice(0, 10)}, ${existing.kind}`,
    });
    safeRevalidatePath("/admin/jadwal");
    safeRevalidatePath("/admin");
  });
}
```

- [ ] **Step 5: Tulis komponen jadwal**

`src/components/admin/weekly-schedule-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rowsChanged, toDayInputs, WEEKDAY_LABELS, weekRows, type WeekRow } from "@/lib/schedule-week";
import { saveWeeklySchedule } from "@/server/schedule";
import { SectionCard } from "./page-layout";

type Props = {
  staffId: string;
  branchId: string;
  branchName: string;
  templates: { weekday: number; startMinute: number; endMinute: number }[];
};

/** Jam kerja Senin–Minggu dengan satu tombol Simpan (spec D 5.1). */
export function WeeklyScheduleForm({ staffId, branchId, branchName, templates }: Props) {
  const router = useRouter();
  const saved = useMemo(() => weekRows(templates), [templates]);
  const [rows, setRows] = useState<WeekRow[]>(saved);
  const [pending, startTransition] = useTransition();
  const dirty = rowsChanged(rows, saved);

  function update(weekday: number, patch: Partial<WeekRow>) {
    setRows((current) => current.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)));
  }

  function save() {
    const days = toDayInputs(rows);
    if (days.some((day) => day.open && (day.startMinute === null || day.endMinute === null))) {
      toast.error("Isi jam mulai dan selesai untuk setiap hari yang buka.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveWeeklySchedule({ staffId, branchId, days });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Jam kerja tersimpan.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan jam kerja. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard
      title={`Jam kerja mingguan · ${branchName}`}
      flush
      actions={
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? "Menyimpan…" : "Simpan jam kerja"}
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Hari</TableHead>
            <TableHead>Buka</TableHead>
            <TableHead>Mulai</TableHead>
            <TableHead>Selesai</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const label = WEEKDAY_LABELS[row.weekday];
            return (
              <TableRow key={row.weekday}>
                <TableCell className="font-medium">{label}</TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    className="size-4 accent-gold-500"
                    aria-label={`Buka hari ${label}`}
                    checked={row.open}
                    onChange={(e) => update(row.weekday, { open: e.target.checked })}
                  />
                </TableCell>
                <TableCell>
                  {row.open ? (
                    <Input
                      type="time"
                      aria-label={`Mulai ${label}`}
                      className="w-32"
                      value={row.start}
                      onChange={(e) => update(row.weekday, { start: e.target.value })}
                    />
                  ) : (
                    <span className="text-muted-foreground">Tutup</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.open ? (
                    <Input
                      type="time"
                      aria-label={`Selesai ${label}`}
                      className="w-32"
                      value={row.end}
                      onChange={(e) => update(row.weekday, { end: e.target.value })}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
```

`src/components/admin/schedule-exception-list.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteScheduleException } from "@/server/schedule";
import { EmptyState } from "./page-layout";

export type ExceptionRow = { id: string; dateLabel: string; kindLabel: string; timeLabel: string | null };

/** Pengecualian mulai hari ini, dengan Hapus yang meminta konfirmasi (spec D 5.1). */
export function ScheduleExceptionList({ exceptions }: { exceptions: ExceptionRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<ExceptionRow | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(row: ExceptionRow) {
    setTarget(null);
    startTransition(async () => {
      try {
        const result = await deleteScheduleException(row.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Pengecualian dihapus.");
        router.refresh();
      } catch {
        toast.error("Gagal menghapus pengecualian. Coba lagi.");
      }
    });
  }

  if (exceptions.length === 0) return <EmptyState>Belum ada pengecualian mulai hari ini.</EmptyState>;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal</TableHead>
            <TableHead>Jenis</TableHead>
            <TableHead>Jam</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {exceptions.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.dateLabel}</TableCell>
              <TableCell>{row.kindLabel}</TableCell>
              <TableCell>{row.timeLabel ?? "Sehari penuh"}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setTarget(row)}>
                  Hapus
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <AlertDialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengecualian {target?.dateLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.kindLabel}
              {target?.timeLabel ? ` ${target.timeLabel}` : ""}. Booking yang sudah ada tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={() => target && remove(target)}>Hapus pengecualian</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

Di `src/components/admin/holiday-list.tsx`:
- ganti tanda tangan `export function HolidayList({ holidays }: { holidays: Holiday[] }) {` menjadi:

```tsx
export function HolidayList({
  holidays,
  emptyText = "Belum ada hari libur tercatat tahun ini.",
}: {
  holidays: Holiday[];
  emptyText?: string;
}) {
```

- ganti `return <p className="text-sm text-muted-foreground">Belum ada hari libur tercatat tahun ini.</p>;` menjadi `return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;`.

Hapus `src/components/admin/schedule-template-form.tsx`: `git rm src/components/admin/schedule-template-form.tsx`. Berkas itu digantikan `weekly-schedule-form.tsx`, dan tidak ada uji yang memakainya.

- [ ] **Step 6: Halaman Jadwal (`src/app/(admin)/admin/jadwal/page.tsx`)**

Ganti seluruh isi berkas dengan:

```tsx
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { HolidayList } from "@/components/admin/holiday-list";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { ScheduleExceptionForm } from "@/components/admin/schedule-exception-form";
import { ScheduleExceptionList } from "@/components/admin/schedule-exception-list";
import { WeeklyScheduleForm } from "@/components/admin/weekly-schedule-form";
import { formatIndonesianDate } from "@/lib/format";
import { resolveTab } from "@/lib/page-tabs";
import type { ExceptionKind } from "@/lib/slot";
import { minutesToTimeLabel, witaDateString } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getBranches } from "@/server/catalog";
import { listHolidays } from "@/server/holiday";
import { listSchedulableStaff, listScheduleExceptions, listScheduleTemplates } from "@/server/schedule";
import { requireCapability } from "@/server/session";

const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  LIBUR: "Cuti",
  JAM_TAMBAHAN: "Jam tambahan",
  BLOKIR_SEBAGIAN: "Blokir sebagian",
};

const TABS = ["jam-kerja", "pengecualian", "hari-libur"] as const;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ staf?: string; tab?: string | string[] }>;
}) {
  await requireCapability("schedule:manage");
  const params = await searchParams;

  const today = witaDateString(new Date());
  const year = Number(today.slice(0, 4));
  const [branches, holidays, staffList] = await Promise.all([getBranches(), listHolidays(year), listSchedulableStaff()]);

  const primaryBranch = branches.find((b) => b.status === "AKTIF") ?? branches[0];
  const selectedStaff = staffList.find((s) => s.id === params.staf) ?? staffList[0];
  const header = (
    <PageHeader
      title="Jadwal"
      description="Jam praktik tiap tenaga, cuti, dan hari libur klinik. Dipakai untuk slot booking situs dan admin."
      actions={
        staffList.length > 1 && selectedStaff ? (
          <nav aria-label="Pilih tenaga" className="flex flex-wrap gap-1 rounded-lg border p-0.5">
            {staffList.map((s) => (
              <Link
                key={s.id}
                href={`/admin/jadwal?staf=${s.id}${params.tab ? `&tab=${resolveTab(params.tab, TABS)}` : ""}`}
                aria-current={s.id === selectedStaff.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  s.id === selectedStaff.id ? "bg-gold-500 font-semibold text-white" : "text-muted-foreground hover:text-brown-900",
                )}
              >
                {s.name}
              </Link>
            ))}
          </nav>
        ) : undefined
      }
    />
  );

  if (!selectedStaff || !primaryBranch) {
    return (
      <>
        <AdminHeader title="Jadwal" />
        <PageBody>
          {header}
          <p className="text-sm text-muted-foreground">Belum ada staf atau cabang aktif untuk dijadwalkan.</p>
        </PageBody>
      </>
    );
  }

  const in90Days = witaDateString(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [templates, exceptions] = await Promise.all([
    listScheduleTemplates(selectedStaff.id),
    listScheduleExceptions(selectedStaff.id, today, in90Days),
  ]);
  const upcomingHolidays = holidays.filter((h) => h.date.toISOString().slice(0, 10) >= today);
  const pastHolidays = holidays.filter((h) => h.date.toISOString().slice(0, 10) < today);
  const tab = resolveTab(params.tab, TABS);
  const tabHref = (id: (typeof TABS)[number]) => `/admin/jadwal?staf=${selectedStaff.id}&tab=${id}`;

  return (
    <>
      <AdminHeader title="Jadwal" />
      <PageBody>
        {header}
        <PageTabs
          label="Bagian jadwal"
          active={tab}
          tabs={[
            { id: "jam-kerja", label: "Jam kerja", href: tabHref("jam-kerja") },
            { id: "pengecualian", label: `Pengecualian (${exceptions.length})`, href: tabHref("pengecualian") },
            { id: "hari-libur", label: `Hari libur ${year}`, href: tabHref("hari-libur") },
          ]}
        />

        {tab === "jam-kerja" && (
          <WeeklyScheduleForm
            key={`${selectedStaff.id}-${templates.map((t) => `${t.weekday}:${t.startMinute}-${t.endMinute}`).join(",")}`}
            staffId={selectedStaff.id}
            branchId={primaryBranch.id}
            branchName={primaryBranch.name}
            templates={templates.map((t) => ({ weekday: t.weekday, startMinute: t.startMinute, endMinute: t.endMinute }))}
          />
        )}

        {tab === "pengecualian" && (
          <>
            <SectionCard title="Tambah pengecualian" description={`Cuti, jam tambahan, atau blokir sebagian jam untuk ${selectedStaff.name}.`}>
              <ScheduleExceptionForm staffId={selectedStaff.id} />
            </SectionCard>
            <SectionCard title="Pengecualian mulai hari ini" flush>
              <ScheduleExceptionList
                exceptions={exceptions.map((e) => ({
                  id: e.id,
                  dateLabel: formatIndonesianDate(e.date),
                  kindLabel: EXCEPTION_LABEL[e.kind],
                  timeLabel:
                    e.startMinute !== null && e.endMinute !== null
                      ? `${minutesToTimeLabel(e.startMinute)}–${minutesToTimeLabel(e.endMinute)}`
                      : null,
                }))}
              />
            </SectionCard>
          </>
        )}

        {tab === "hari-libur" && (
          <SectionCard title={`Hari libur ${year}`} description="Berlaku untuk semua tenaga dan cabang." flush>
            <HolidayList holidays={upcomingHolidays} emptyText="Tidak ada hari libur lagi tahun ini." />
            {pastHolidays.length > 0 && (
              <details className="border-t">
                <summary className="cursor-pointer px-4 py-3 text-sm text-muted-foreground">Sudah lewat ({pastHolidays.length})</summary>
                <HolidayList holidays={pastHolidays} />
              </details>
            )}
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}
```

Catatan untuk pelaksana:
- `key` pada `WeeklyScheduleForm` berubah setiap kali jam kerja tersimpan berubah, sehingga formulir mulai ulang dari data terbaru setelah `router.refresh()`.
- Pastikan `ScheduleExceptionForm` sudah memanggil `router.refresh()` setelah menambah, atau mengandalkan `revalidatePath` di aksinya. Bila daftar tidak diperbarui setelah Tambah, tambahkan `router.refresh()` di formulir itu dan catat ruling-nya di ledger.

- [ ] **Step 7: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/schedule-week.test.ts tests/unit/components/weekly-schedule-form.test.tsx tests/unit/components/schedule-exception-list.test.tsx && npm run test:integration -- tests/integration/schedule-week.test.ts tests/integration/schedule.test.ts tests/integration/holiday.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint && npx vitest run tests/unit/architecture.test.ts`
Expected: bersih dan PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/schedule-week.ts src/server/schedule.ts src/components/admin/weekly-schedule-form.tsx src/components/admin/schedule-exception-list.tsx src/components/admin/holiday-list.tsx "src/app/(admin)/admin/jadwal/page.tsx" tests/unit/schedule-week.test.ts tests/unit/components/weekly-schedule-form.test.tsx tests/unit/components/schedule-exception-list.test.tsx tests/integration/schedule-week.test.ts
git commit -m "feat: split the schedule page into tabs, save a whole week at once, and delete date exceptions"
```

---
### Task 7: Pasien dan Data Pasien

**Files:**
- Create: `src/lib/age.ts`
- Modify: `src/lib/format.ts` (+ `formatDateWithYear`), `src/server/patient.ts` (`countPatients`; `PatientDetail` + `lastVisitAt`, `ageYears`), `src/components/admin/patient-detail-view.tsx`, `src/app/(admin)/admin/pasien/page.tsx`, `src/app/(admin)/admin/pasien/[id]/page.tsx`, `docs/superpowers/specs/2026-10-02-ui-tampilan-dasbor-design.md` (5.3)
- Test: `tests/unit/age.test.ts` (baru), `tests/unit/format.test.ts` (tambah), `tests/unit/components/patient-detail-view.test.tsx` (ubah), `tests/integration/patient-detail.test.ts` (tambah)

**Interfaces:**
- Consumes: Task 1 (`PageHeader`, `PageBody`, `SectionCard`, `EmptyState`, `PageTabs`, `resolveTab`); tautan `?pasien=` dibaca Task 5.
- Produces:
  - `ageInYears(birthDate: Date, now: Date): number`
  - `formatDateWithYear(date: Date): string` ("28 Sep 2026")
  - `countPatients(): Promise<number>`
  - `PatientDetail` + `lastVisitAt: Date | null; ageYears: number | null`
  - `PATIENT_PROGRAM_LABEL`
  - `PatientDetailView({ patient, canReadRecords, canWriteRecords, tab?: string })`

**Ruling (sudah diputuskan saat menulis plan):** "Ubah no. RM kertas lama" **tetap di kartu Data diri** sebagai penyuntingan di tempat, sama seperti "Ubah catatan penting". Tidak dipindah ke dialog di kepala halaman.
- **Alasan:** satu cara menyunting untuk dua catatan pendek, dan uji yang ada tetap berlaku.
- **Spec 5.3 disesuaikan** di Step 7.
- **Biaya bila salah:** tombol itu ada di kartu, tidak di kepala halaman.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/age.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ageInYears } from "@/lib/age";

const birth = new Date("1990-05-17T00:00:00Z"); // kolom @db.Date

describe("ageInYears", () => {
  it("umur bertambah tepat di hari ulang tahun (WITA)", () => {
    expect(ageInYears(birth, new Date("2026-05-16T12:00:00+08:00"))).toBe(35);
    expect(ageInYears(birth, new Date("2026-05-17T00:30:00+08:00"))).toBe(36);
  });

  it("lahir 29 Februari: bertambah 1 Maret pada tahun bukan kabisat", () => {
    const leap = new Date("2000-02-29T00:00:00Z");
    expect(ageInYears(leap, new Date("2026-02-28T12:00:00+08:00"))).toBe(25);
    expect(ageInYears(leap, new Date("2026-03-01T12:00:00+08:00"))).toBe(26);
  });
});
```

Tambahkan ke `tests/unit/format.test.ts`. Gabungkan `formatDateWithYear` ke baris impor `@/lib/format`:

```ts
describe("formatDateWithYear", () => {
  it("tanggal singkat dengan tahun, dalam WITA", () => {
    expect(formatDateWithYear(new Date("2026-09-28T03:00:00Z"))).toBe("28 Sep 2026");
    // 23.30 UTC 30 Sep = 07.30 WITA 1 Okt
    expect(formatDateWithYear(new Date("2026-09-30T23:30:00Z"))).toBe("1 Okt 2026");
  });
});
```

Ganti isi `tests/unit/components/patient-detail-view.test.tsx` mulai baris `const patient: PatientDetail = {` sampai akhir berkas dengan:

```tsx
const patient: PatientDetail = {
  id: "p1",
  medicalRecordNumber: "SDY-2026-0001",
  name: "Siti Rahayu",
  whatsapp: "6281234567890",
  birthDateLabel: "17/04/1992",
  ageYears: 34,
  genderLabel: "Perempuan",
  occupation: "Guru",
  address: "Jl. Sam Ratulangi",
  programStatus: "AKTIF",
  lastVisitAt: new Date("2026-10-07T05:00:00Z"),
  paperRecordNumber: "RM-0457",
  record: { allergies: "Amoxicillin", medicalHistory: null, importantNotes: "Takut jarum" },
  appointments: [
    {
      id: "a1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-07T05:00:00Z"),
      status: "TERKONFIRMASI",
      serviceName: "Konsultasi Dokter",
      staffName: "Dr. Diane",
      branchName: "SunDY Mahakeret",
    },
  ],
  intakes: [
    {
      id: "i1",
      code: "SDY-8F3K",
      submittedAt: new Date("2026-10-01T02:00:00Z"),
      status: "DIPERIKSA",
      kind: "LENGKAP",
      purposeLabel: "Slimming",
      reviewerName: "Dr. Diane",
      reviewedAt: new Date("2026-10-02T02:00:00Z"),
    },
  ],
  encounters: [
    {
      id: "e1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-07T05:00:00Z"),
      branchName: "SunDY Mahakeret",
      authorName: "Dr. Diane",
      assessmentPreview: "Obesitas derajat 1",
      status: "FINAL",
    },
  ],
};

const receptionistView: PatientDetail = { ...patient, record: null, encounters: null };

describe("PatientDetailView (spec D 5.3)", () => {
  it("data diri dan catatan medis berdampingan; alergi bertanda", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    const identity = screen.getByRole("region", { name: "Data diri" });
    expect(identity).toHaveTextContent("17/04/1992 (34 tahun)");
    expect(identity).toHaveTextContent("Jl. Sam Ratulangi");
    expect(within(identity).getByText("RM-0457")).toBeInTheDocument();
    const record = screen.getByRole("region", { name: "Catatan medis" });
    expect(within(record).getByText("Amoxicillin")).toHaveAttribute("data-allergy", "true");
    expect(within(record).getByText("Belum ada")).toBeInTheDocument();
  });

  it("tab Kunjungan terbuka pertama bila ada kunjungan, dengan jumlah di judul tab", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    const tabs = screen.getByRole("navigation", { name: "Riwayat pasien" });
    expect(within(tabs).getByRole("link", { name: "Kunjungan (1)" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Booking (1)" })).toHaveAttribute("href", "/admin/pasien/p1?tab=booking");
    const visits = screen.getByRole("region", { name: "Riwayat kunjungan" });
    expect(within(visits).getByText("Obesitas derajat 1")).toBeInTheDocument();
    expect(within(visits).getByRole("link", { name: "Buka" })).toHaveAttribute("href", "/admin/kunjungan/e1");
    expect(screen.queryByRole("region", { name: "Riwayat booking" })).not.toBeInTheDocument();
  });

  it("tab Isian: tautan isian untuk pembaca rekam medis", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords tab="isian" />);
    const intakes = screen.getByRole("region", { name: "Riwayat isian" });
    expect(within(intakes).getByRole("link", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    expect(within(intakes).getByText(/Diperiksa · Dr\. Diane/)).toBeInTheDocument();
  });

  it("tab yang tidak dikenal kembali ke tab awal", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords tab="salah" />);
    expect(screen.getByRole("region", { name: "Riwayat kunjungan" })).toBeInTheDocument();
  });

  it("catatan penting bisa diubah hanya oleh penulis rekam medis", () => {
    const { unmount } = render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(screen.getByText("Takut jarum")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah catatan penting" })).toBeInTheDocument();
    unmount();

    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords={false} />);
    expect(screen.getByText("Takut jarum")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ubah catatan penting" })).not.toBeInTheDocument();
  });

  it("tanpa hak rekam medis: tanpa catatan medis dan tab Kunjungan; tab awal Booking; no. RM kertas lama tetap ada", () => {
    render(<PatientDetailView patient={receptionistView} canReadRecords={false} canWriteRecords={false} />);
    expect(screen.queryByRole("region", { name: "Catatan medis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Kunjungan/ })).not.toBeInTheDocument();
    const bookings = screen.getByRole("region", { name: "Riwayat booking" });
    expect(within(bookings).getByText("SDY-8F3K")).toBeInTheDocument();
    expect(screen.getByText("RM-0457")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah no. RM kertas lama" })).toBeInTheDocument();
  });

  it("tanpa hak rekam medis, tab Isian tanpa tautan ke isian", () => {
    render(<PatientDetailView patient={receptionistView} canReadRecords={false} canWriteRecords={false} tab="isian" />);
    expect(within(screen.getByRole("region", { name: "Riwayat isian" })).getByText("SDY-8F3K")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lihat isian" })).not.toBeInTheDocument();
  });
});
```

Tambahkan ke `tests/integration/patient-detail.test.ts`, di dalam blok `describe` utama. Berkas itu menyimpan id pasien di variabel `patientId`:

```ts
  it("tanggal kunjungan terakhir dan umur ikut dimuat (spec D 5.3)", async () => {
    await prisma.patient.update({
      where: { id: patientId },
      data: { birthDate: new Date("1990-05-17T00:00:00Z"), lastVisitAt: new Date("2026-09-28T03:00:00Z") },
    });
    const detail = await getPatientDetail(patientId);
    expect(detail?.lastVisitAt).toEqual(new Date("2026-09-28T03:00:00Z"));
    expect(detail?.ageYears).toBeGreaterThanOrEqual(36);
  });
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/age.test.ts tests/unit/format.test.ts tests/unit/components/patient-detail-view.test.tsx && npm run test:integration -- tests/integration/patient-detail.test.ts`
Expected: FAIL. `@/lib/age` belum ada, `formatDateWithYear` belum diekspor, dan `PatientDetail` belum punya `ageYears`/`lastVisitAt`.

- [ ] **Step 3: `ageInYears` dan `formatDateWithYear`**

`src/lib/age.ts`:

```ts
import { witaDateString } from "./time";

/** Umur dalam tahun penuh pada hari ini (WITA); `birthDate` kolom @db.Date dibaca dari UTC. */
export function ageInYears(birthDate: Date, now: Date): number {
  const [by, bm, bd] = birthDate.toISOString().slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = witaDateString(now).split("-").map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}
```

Tambahkan ke `src/lib/format.ts` setelah `formatShortIndonesianDate`:

```ts
const dateWithYearFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: CLINIC_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Tanggal singkat dengan tahun dalam WITA, misal "28 Sep 2026" — untuk kolom tabel. */
export function formatDateWithYear(date: Date): string {
  return dateWithYearFormatter.format(date);
}
```

- [ ] **Step 4: Data pasien di `src/server/patient.ts`**

- **Tipe `PatientDetail`:**
  - setelah `birthDateLabel: string | null;`, tambahkan:

    ```ts
      /** Umur dalam tahun penuh, atau null tanpa tanggal lahir (spec D 5.3). */
      ageYears: number | null;
    ```

  - setelah `programStatus: "AKTIF" | "SELESAI" | "TIDAK_AKTIF";`, tambahkan:

    ```ts
      /** Jadwal kunjungan terakhir yang difinalisasi. */
      lastVisitAt: Date | null;
    ```

- **Fungsi `getPatientDetail`:**
  - tambahkan `lastVisitAt: true,` ke `select` pasien (setelah `programStatus: true,`);
  - di objek yang dikembalikan, tambahkan `ageYears: patient.birthDate ? ageInYears(patient.birthDate, new Date()) : null,` setelah `birthDateLabel: …,` dan `lastVisitAt: patient.lastVisitAt,` setelah `programStatus: patient.programStatus,`.
- **Impor:** `import { ageInYears } from "@/lib/age";`
- **Fungsi baru**, ditambahkan setelah `getPatientSummary` (Task 5):

  ```ts
  /** Jumlah semua pasien, untuk kepala halaman Pasien (spec D 5.2). */
  export async function countPatients(): Promise<number> {
    await requireCapability("booking:manage");
    return prisma.patient.count();
  }
  ```

- [ ] **Step 5: `src/components/admin/patient-detail-view.tsx`**

Ganti seluruh isi berkas dengan:

```tsx
import Link from "next/link";
import { AppointmentStatusBadge } from "@/components/admin/appointment-status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIndonesianDate } from "@/lib/format";
import { resolveTab } from "@/lib/page-tabs";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { PatientDetail } from "@/server/patient";
import { EmptyState, SectionCard } from "./page-layout";
import { PageTabs } from "./page-tabs";
import { ImportantNotesForm, PaperRecordNumberForm } from "./patient-note-forms";

export const PATIENT_PROGRAM_LABEL: Record<PatientDetail["programStatus"], string> = {
  AKTIF: "Program aktif",
  SELESAI: "Program selesai",
  TIDAK_AKTIF: "Tidak aktif",
};

const INTAKE_STATUS_LABEL: Record<PatientDetail["intakes"][number]["status"], string> = {
  MENUNGGU_DIISI: "Belum diisi",
  TERISI: "Belum diperiksa",
  DIPERIKSA: "Diperiksa",
};

type PatientTab = "kunjungan" | "booking" | "isian";

const when = (date: Date) => `${formatIndonesianDate(date)}, ${minutesToTimeLabel(witaMinutesOfDay(date))}`;

function Field({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

/** Data Pasien (spec D 5.3): dua kartu berdampingan, lalu riwayat dalam tab `?tab=`. */
export function PatientDetailView({
  patient,
  canReadRecords,
  canWriteRecords,
  tab,
}: {
  patient: PatientDetail;
  canReadRecords: boolean;
  canWriteRecords: boolean;
  tab?: string;
}) {
  const tabs: PatientTab[] = patient.encounters ? ["kunjungan", "booking", "isian"] : ["booking", "isian"];
  const active = resolveTab(tab, tabs, patient.encounters && patient.encounters.length > 0 ? "kunjungan" : "booking");
  const href = (id: PatientTab) => `/admin/pasien/${patient.id}?tab=${id}`;
  const birth = patient.birthDateLabel
    ? `${patient.birthDateLabel}${patient.ageYears !== null ? ` (${patient.ageYears} tahun)` : ""}`
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Data diri">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="WhatsApp" value={patient.whatsapp} />
            <Field label="Tanggal lahir" value={birth} />
            <Field label="Jenis kelamin" value={patient.genderLabel} />
            <Field label="Pekerjaan" value={patient.occupation} />
            <Field label="Alamat" value={patient.address} wide />
          </dl>
          <div className="mt-3 border-t pt-3 text-sm">
            <PaperRecordNumberForm patientId={patient.id} value={patient.paperRecordNumber} />
          </div>
        </SectionCard>

        {patient.record && (
          <SectionCard title="Catatan medis" description="Diisi dokter lewat tombol “Setujui ke data pasien” di halaman isian.">
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <h3 className="text-xs text-muted-foreground">Alergi</h3>
                {patient.record.allergies ? (
                  <p data-allergy="true" className="mt-1 inline-block whitespace-pre-line rounded-md bg-red-50 px-2 py-1 font-medium text-red-800">
                    {patient.record.allergies}
                  </p>
                ) : (
                  <p>Belum ada</p>
                )}
              </div>
              <div>
                <h3 className="text-xs text-muted-foreground">Riwayat penyakit & obat</h3>
                <p className="whitespace-pre-line">{patient.record.medicalHistory ?? "Belum ada"}</p>
              </div>
            </div>
            <div className="mt-3 border-t pt-3 text-sm">
              {canWriteRecords ? (
                <ImportantNotesForm patientId={patient.id} value={patient.record.importantNotes} />
              ) : (
                <div>
                  <h3 className="text-xs text-muted-foreground">Catatan penting</h3>
                  <p className="whitespace-pre-line">{patient.record.importantNotes ?? "Belum ada"}</p>
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </div>

      <PageTabs
        label="Riwayat pasien"
        active={active}
        tabs={[
          ...(patient.encounters ? [{ id: "kunjungan", label: `Kunjungan (${patient.encounters.length})`, href: href("kunjungan") }] : []),
          { id: "booking", label: `Booking (${patient.appointments.length})`, href: href("booking") },
          { id: "isian", label: `Isian (${patient.intakes.length})`, href: href("isian") },
        ]}
      />

      {active === "kunjungan" && patient.encounters && (
        <SectionCard title="Riwayat kunjungan" flush>
          {patient.encounters.length === 0 ? (
            <EmptyState>Belum ada kunjungan yang diperiksa.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Penulis</TableHead>
                  <TableHead>Penilaian</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.encounters.map((encounter) => (
                  <TableRow key={encounter.id}>
                    <TableCell>{when(encounter.startAt)}</TableCell>
                    <TableCell>{encounter.branchName}</TableCell>
                    <TableCell>{encounter.authorName}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{encounter.assessmentPreview ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={encounter.status === "FINAL" ? "default" : "outline"}>
                        {encounter.status === "FINAL" ? "Final" : "Draf"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/kunjungan/${encounter.id}`} className="text-sm underline underline-offset-4">
                        Buka
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}

      {active === "booking" && (
        <SectionCard title="Riwayat booking" flush>
          {patient.appointments.length === 0 ? (
            <EmptyState>Belum ada booking.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jadwal</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Layanan</TableHead>
                  <TableHead>Tenaga</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{when(a.startAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{a.code}</TableCell>
                    <TableCell>{a.serviceName}</TableCell>
                    <TableCell>
                      <div>{a.staffName}</div>
                      <div className="text-xs text-muted-foreground">{a.branchName}</div>
                    </TableCell>
                    <TableCell>
                      <AppointmentStatusBadge status={a.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}

      {active === "isian" && (
        <SectionCard title="Riwayat isian" flush>
          {patient.intakes.length === 0 ? (
            <EmptyState>Belum ada isian.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dikirim</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Kuis</TableHead>
                  <TableHead>Status</TableHead>
                  {canReadRecords && <TableHead>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.intakes.map((intake) => (
                  <TableRow key={intake.id}>
                    <TableCell>{intake.submittedAt ? formatIndonesianDate(intake.submittedAt) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{intake.code}</TableCell>
                    <TableCell>
                      {intake.kind === "LENGKAP" ? "Lengkap" : "Pendek"}
                      {intake.purposeLabel ? ` · ${intake.purposeLabel}` : ""}
                    </TableCell>
                    <TableCell>
                      {INTAKE_STATUS_LABEL[intake.status]}
                      {intake.reviewerName ? ` · ${intake.reviewerName}` : ""}
                    </TableCell>
                    {canReadRecords && (
                      <TableCell>
                        <Link href={`/admin/isian/${intake.id}`} className="text-sm underline underline-offset-4">
                          Lihat isian
                        </Link>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Halaman Pasien dan Data Pasien**

`src/app/(admin)/admin/pasien/page.tsx`, ganti seluruh isi berkas dengan:

```tsx
import Link from "next/link";
import { Search } from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { NewPatientForm } from "@/components/admin/new-patient-form";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PATIENT_PROGRAM_LABEL } from "@/components/admin/patient-detail-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear, formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { countPatients, listRecentPatients, searchPatients } from "@/server/patient";
import { requireCapability } from "@/server/session";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCapability("booking:manage");
  const { q = "" } = await searchParams;
  const query = q.trim();
  const [patients, total] = await Promise.all([query ? searchPatients(query) : listRecentPatients(), countPatients()]);

  return (
    <>
      <AdminHeader title="Pasien" />
      <PageBody>
        <PageHeader title="Pasien" description={`${total} pasien`} actions={<NewPatientForm />} />
        <SectionCard
          title={query ? `Hasil untuk “${query}”` : "Pasien terbaru"}
          flush
          actions={
            <form action="/admin/pasien" role="search" className="flex gap-2">
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder="Cari nama, WhatsApp, atau No. RM"
                  aria-label="Cari pasien"
                  className="w-full pl-8 sm:w-72"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" className="h-9">
                Cari
              </Button>
            </form>
          }
        >
          {patients.length === 0 ? (
            <EmptyState>{query ? `Tidak ada pasien yang cocok dengan “${query}”.` : "Belum ada pasien."}</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. RM</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Kunjungan terakhir</TableHead>
                  <TableHead>Booking berikutnya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.medicalRecordNumber}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/admin/pasien/${p.id}`} className="underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.whatsapp}</TableCell>
                    <TableCell>
                      <Badge variant={p.programStatus === "AKTIF" ? "default" : "outline"}>{PATIENT_PROGRAM_LABEL[p.programStatus]}</Badge>
                    </TableCell>
                    <TableCell>{p.lastVisitAt ? formatDateWithYear(p.lastVisitAt) : "—"}</TableCell>
                    <TableCell>
                      {p.nextBookingAt
                        ? `${formatShortIndonesianDate(p.nextBookingAt)} · ${minutesToTimeLabel(witaMinutesOfDay(p.nextBookingAt))}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
```

`src/app/(admin)/admin/pasien/[id]/page.tsx`, ganti seluruh isi berkas dengan:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { PATIENT_PROGRAM_LABEL, PatientDetailView } from "@/components/admin/patient-detail-view";
import { Button } from "@/components/ui/button";
import { formatDateWithYear } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getPatientDetail } from "@/server/patient";
import { requireCapability } from "@/server/session";

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const staff = await requireCapability("booking:manage");
  const { id } = await params;
  const { tab } = await searchParams;
  const patient = await getPatientDetail(id);
  if (!patient) notFound();

  const description = [
    patient.medicalRecordNumber,
    PATIENT_PROGRAM_LABEL[patient.programStatus],
    patient.lastVisitAt ? `kunjungan terakhir ${formatDateWithYear(patient.lastVisitAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <AdminHeader title="Data Pasien" />
      <PageBody>
        <PageHeader
          title={patient.name}
          trail={[{ label: "Pasien", href: "/admin/pasien" }, { label: patient.name }]}
          description={description}
          actions={
            <Button asChild>
              <Link href={`/admin/booking/baru?pasien=${patient.id}`}>+ Booking</Link>
            </Button>
          }
        />
        <PatientDetailView
          patient={patient}
          canReadRecords={can(staff.role, "record:read")}
          canWriteRecords={can(staff.role, "record:write")}
          tab={typeof tab === "string" ? tab : undefined}
        />
      </PageBody>
    </>
  );
}
```

- [ ] **Step 7: Sesuaikan spec 5.3**

Di `docs/superpowers/specs/2026-10-02-ui-tampilan-dasbor-design.md`, ganti baris:

```markdown
  - **Ubah no. RM lama**, yaitu formulir yang sekarang dipindah ke dialog;
```

dengan:

```markdown
  - *(Perubahan saat menyusun plan, 2 Okt 2026: "Ubah no. RM kertas lama" tetap di kartu Data diri sebagai penyuntingan di tempat, sama seperti "Ubah catatan penting".)*
```

- [ ] **Step 8: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/age.test.ts tests/unit/format.test.ts tests/unit/components/patient-detail-view.test.tsx && npm run test:integration -- tests/integration/patient-detail.test.ts tests/integration/patient.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint && npx vitest run tests/unit/architecture.test.ts`
Expected: bersih dan PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/age.ts src/lib/format.ts src/server/patient.ts src/components/admin/patient-detail-view.tsx "src/app/(admin)/admin/pasien/page.tsx" "src/app/(admin)/admin/pasien/[id]/page.tsx" docs/superpowers/specs/2026-10-02-ui-tampilan-dasbor-design.md tests/unit/age.test.ts tests/unit/format.test.ts tests/unit/components/patient-detail-view.test.tsx tests/integration/patient-detail.test.ts
git commit -m "feat: give the patient list and patient page the new layout, with history tabs and a quick booking button"
```

---

### Task 8: Layanan & Harga

**Files:**
- Create: `src/components/admin/service-price-table.tsx`
- Modify: `src/app/(admin)/admin/layanan/page.tsx`
- Delete: `src/components/admin/service-price-form.tsx`
- Test: `tests/unit/components/service-price-table.test.tsx` (baru)

**Interfaces:**
- Consumes: Task 1 (`RupiahInput`, `SectionCard`, `PageHeader`, `PageBody`); `updateServicePrice({ id, normalPrice: number | null, promoPrice: number })`.
- Produces: `PriceCategory = { id: string; name: string; services: { id: string; name: string; normalPrice: number | null; promoPrice: number }[] }`, `ServicePriceTable({ categories: PriceCategory[] })`.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/service-price-table.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServicePriceTable, type PriceCategory } from "@/components/admin/service-price-table";
import { updateServicePrice } from "@/server/service-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/service-admin", () => ({ updateServicePrice: vi.fn() }));

const CATEGORIES: PriceCategory[] = [
  {
    id: "c1",
    name: "Facial Treatment",
    services: [
      { id: "s1", name: "Relaxing Facial", normalPrice: 189000, promoPrice: 149000 },
      { id: "s2", name: "Facial Acne", normalPrice: 289000, promoPrice: 249000 },
    ],
  },
  { id: "c2", name: "Laser Treatment", services: [{ id: "s3", name: "Lip Laser", normalPrice: null, promoPrice: 99000 }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateServicePrice).mockResolvedValue({ ok: true, data: undefined });
});

describe("ServicePriceTable (spec D 5.4)", () => {
  it("harga dalam rupiah; Simpan dan Batal hanya di baris yang diubah", async () => {
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
    const card = screen.getByRole("region", { name: "Facial Treatment" });
    expect(card).toHaveTextContent("2 layanan");
    const promo = within(card).getByRole("textbox", { name: "Harga berlaku Relaxing Facial" });
    expect(promo).toHaveValue("Rp 149.000");
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();

    await user.clear(promo);
    await user.type(promo, "159000");
    const row = within(card).getByRole("row", { name: /Relaxing Facial/ });
    expect(within(row).getByRole("button", { name: "Batal" })).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(updateServicePrice).toHaveBeenCalledWith({ id: "s1", normalPrice: 189000, promoPrice: 159000 }));
    await waitFor(() => expect(within(row).queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument());
  });

  it("Batal mengembalikan nilai tersimpan", async () => {
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
    const promo = screen.getByRole("textbox", { name: "Harga berlaku Facial Acne" });
    await user.type(promo, "1");
    await user.click(within(screen.getByRole("row", { name: /Facial Acne/ })).getByRole("button", { name: "Batal" }));
    expect(promo).toHaveValue("Rp 249.000");
    expect(updateServicePrice).not.toHaveBeenCalled();
  });

  it("harga coret yang dikosongkan dikirim sebagai null (Review Focus 4)", async () => {
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
    await user.clear(screen.getByRole("textbox", { name: "Harga coret Relaxing Facial" }));
    await user.click(within(screen.getByRole("row", { name: /Relaxing Facial/ })).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateServicePrice).toHaveBeenCalledWith({ id: "s1", normalPrice: null, promoPrice: 149000 }));
  });

  it("galat server tampil dan baris tetap berubah", async () => {
    const { toast } = await import("sonner");
    vi.mocked(updateServicePrice).mockResolvedValue({ ok: false, error: "Harga coret harus lebih tinggi dari harga berlaku." });
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
    await user.type(screen.getByRole("textbox", { name: "Harga berlaku Lip Laser" }), "0");
    await user.click(within(screen.getByRole("row", { name: /Lip Laser/ })).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Harga coret harus lebih tinggi dari harga berlaku."));
    expect(within(screen.getByRole("row", { name: /Lip Laser/ })).getByRole("button", { name: "Simpan" })).toBeInTheDocument();
  });

  it("cari dan chip kategori menyaring tanpa membuang perubahan", async () => {
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
    await user.type(screen.getByRole("textbox", { name: "Harga berlaku Facial Acne" }), "1");
    await user.click(screen.getByRole("button", { name: "Laser Treatment" }));
    expect(screen.getByRole("button", { name: "Laser Treatment" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("region", { name: "Facial Treatment" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Semua" }));
    expect(screen.getByRole("textbox", { name: "Harga berlaku Facial Acne" })).toHaveValue("Rp 2.490.001");

    await user.type(screen.getByRole("searchbox", { name: "Cari layanan" }), "relax");
    expect(screen.getByRole("row", { name: /Relaxing Facial/ })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Laser Treatment" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Cari layanan" }));
    await user.type(screen.getByRole("searchbox", { name: "Cari layanan" }), "zzz");
    expect(screen.getByText("Tidak ada layanan yang cocok.")).toBeInTheDocument();
  });
});
```

Catatan: kartu kategori yang tersaring disembunyikan dengan atribut `hidden`, bukan dilepas. Dengan begitu perubahan yang belum disimpan tetap ada saat filter diganti, dan `queryByRole` tidak menemukan elemen tersembunyi.

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/service-price-table.test.tsx`
Expected: FAIL. Komponennya belum ada.

- [ ] **Step 3: Tulis `src/components/admin/service-price-table.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { updateServicePrice } from "@/server/service-admin";
import { SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";

type PriceService = { id: string; name: string; normalPrice: number | null; promoPrice: number };
export type PriceCategory = { id: string; name: string; services: PriceService[] };

function PriceRow({ service, hidden }: { service: PriceService; hidden: boolean }) {
  const [saved, setSaved] = useState({ normalPrice: service.normalPrice, promoPrice: service.promoPrice as number | null });
  const [normalPrice, setNormalPrice] = useState<number | null>(service.normalPrice);
  const [promoPrice, setPromoPrice] = useState<number | null>(service.promoPrice);
  const [pending, startTransition] = useTransition();
  const dirty = normalPrice !== saved.normalPrice || promoPrice !== saved.promoPrice;

  function save() {
    if (promoPrice === null) {
      toast.error("Isi harga berlaku.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateServicePrice({ id: service.id, normalPrice, promoPrice });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setSaved({ normalPrice, promoPrice });
        toast.success(`Harga ${service.name} tersimpan.`);
      } catch {
        toast.error("Harga gagal disimpan. Coba lagi.");
      }
    });
  }

  function cancel() {
    setNormalPrice(saved.normalPrice);
    setPromoPrice(saved.promoPrice);
  }

  return (
    <TableRow hidden={hidden}>
      <TableCell className="font-medium">{service.name}</TableCell>
      <TableCell>
        <RupiahInput aria-label={`Harga coret ${service.name}`} placeholder="kosong" className="w-36" value={normalPrice} onChange={setNormalPrice} />
      </TableCell>
      <TableCell>
        <RupiahInput aria-label={`Harga berlaku ${service.name}`} className="w-36" value={promoPrice} onChange={setPromoPrice} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        {dirty && (
          <div className="flex justify-end gap-1">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={pending}>
              Batal
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Harga per kategori (spec D 5.4). Cari dan chip kategori menyaring di browser;
 * baris yang tersaring hanya disembunyikan, agar perubahan yang belum disimpan tidak hilang.
 */
export function ServicePriceTable({ categories }: { categories: PriceCategory[] }) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const matches = (service: PriceService) => !needle || service.name.toLowerCase().includes(needle);
  const visibleCategory = (category: PriceCategory) =>
    (categoryId === null || category.id === categoryId) && category.services.some(matches);
  const anyVisible = categories.some(visibleCategory);

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active ? "border-gold-400 bg-cream-200 font-semibold text-brown-900" : "bg-card text-muted-foreground hover:text-brown-900",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Cari layanan"
          placeholder="Cari layanan…"
          className="w-full sm:w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div role="group" aria-label="Kategori" className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={categoryId === null} className={chip(categoryId === null)} onClick={() => setCategoryId(null)}>
            Semua
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              className={chip(categoryId === category.id)}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {!anyVisible && <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada layanan yang cocok.</p>}

      {categories.map((category) => (
        <div key={category.id} hidden={!visibleCategory(category)}>
          <SectionCard title={category.name} description={`${category.services.length} layanan`} flush>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Layanan</TableHead>
                  <TableHead>Harga coret</TableHead>
                  <TableHead>Harga berlaku</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {category.services.map((service) => (
                  <PriceRow key={service.id} service={service} hidden={!matches(service)} />
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </div>
      ))}
    </div>
  );
}
```

Catatan: uji "Batal" mengetik "1" di belakang "Rp 249.000", sehingga nilainya menjadi 2.490.001. Itu cara yang sah untuk mengubah nilai. `TableRow` meneruskan `...props` ke `<tr>` (`src/components/ui/table.tsx:54`), jadi atribut `hidden` ikut terpasang.

- [ ] **Step 4: Halaman Layanan & Harga (`src/app/(admin)/admin/layanan/page.tsx`)**

Ganti seluruh isi berkas dengan:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { ServicePriceTable } from "@/components/admin/service-price-table";
import { getServiceCategoriesWithServices } from "@/server/catalog";
import { requireCapability } from "@/server/session";

export default async function AdminServicesPage() {
  await requireCapability("content:manage");
  const categories = await getServiceCategoriesWithServices();

  return (
    <>
      <AdminHeader title="Layanan & Harga" />
      <PageBody>
        <PageHeader title="Layanan & Harga" description="Perubahan harga langsung tampil di situs publik dan tercatat di jejak audit." />
        <ServicePriceTable
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            services: category.services.map((s) => ({ id: s.id, name: s.name, normalPrice: s.normalPrice, promoPrice: s.promoPrice })),
          }))}
        />
      </PageBody>
    </>
  );
}
```

Hapus formulir lama: `git rm src/components/admin/service-price-form.tsx`.

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/service-price-table.test.tsx tests/unit/price-validation.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/service-price-table.tsx "src/app/(admin)/admin/layanan/page.tsx" tests/unit/components/service-price-table.test.tsx
git commit -m "feat: edit service prices in a filterable table with rupiah inputs"
```

---

### Task 9: Pengaturan dan Staf

**Files:**
- Modify: `src/components/admin/clinic-setting-form.tsx`, `src/app/(admin)/admin/pengaturan/page.tsx`, `src/components/admin/staff-table.tsx`, `src/app/(admin)/admin/staf/page.tsx`
- Test: `tests/unit/components/clinic-setting-form.test.tsx`, `tests/unit/components/staff-table.test.tsx` (baru)

**Interfaces:**
- Consumes: Task 1 (`PageHeader`, `PageBody`, `SectionCard`, `RupiahInput`); `formatBankAccount` (`@/lib/payment`), `MISSING_BANK_ACCOUNT_LINE` (`@/lib/transfer-instruction`); `updateClinicSetting`.
- Produces: `ClinicSettingForm({ setting })`, yang sekarang merender kepala halaman sendiri karena tombol Simpan ada di kepala halaman.

- [ ] **Step 1: Tulis uji yang gagal**

`tests/unit/components/clinic-setting-form.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicSettingForm } from "@/components/admin/clinic-setting-form";
import { updateClinicSetting } from "@/server/clinic-setting";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/clinic-setting", () => ({ updateClinicSetting: vi.fn() }));

const SETTING = { bookingFee: 100000, bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateClinicSetting).mockResolvedValue({ ok: true, data: SETTING });
});

describe("ClinicSettingForm (spec D 5.5)", () => {
  it("kepala halaman dengan Simpan; biaya dalam rupiah; dua kartu", () => {
    render(<ClinicSettingForm setting={SETTING} />);
    expect(screen.getByRole("heading", { level: 1, name: "Pengaturan" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Biaya booking" })).getByLabelText("Biaya booking")).toHaveValue("Rp 100.000");
    expect(screen.getByRole("region", { name: "Rekening transfer" })).toHaveTextContent("Tampil ke pasien: BCA 1234567890 a.n. SunDY Clinic");
  });

  it("pratinjau mengikuti ketikan; rekening belum lengkap memakai kalimat pengganti", async () => {
    const user = userEvent.setup();
    render(<ClinicSettingForm setting={SETTING} />);
    await user.clear(screen.getByLabelText("Atas nama"));
    expect(screen.getByRole("region", { name: "Rekening transfer" })).toHaveTextContent("Tampil ke pasien: (rekening akan kami kirimkan)");
    await user.type(screen.getByLabelText("Atas nama"), "PT SunDY");
    expect(screen.getByRole("region", { name: "Rekening transfer" })).toHaveTextContent("BCA 1234567890 a.n. PT SunDY");
  });

  it("Simpan mengirim biaya sebagai angka", async () => {
    const user = userEvent.setup();
    render(<ClinicSettingForm setting={SETTING} />);
    const fee = screen.getByLabelText("Biaya booking");
    await user.clear(fee);
    await user.type(fee, "150000");
    await user.click(screen.getByRole("button", { name: "Simpan pengaturan" }));
    await waitFor(() =>
      expect(updateClinicSetting).toHaveBeenCalledWith({
        bookingFee: 150000,
        bankName: "BCA",
        bankAccountNumber: "1234567890",
        bankAccountHolder: "SunDY Clinic",
      }),
    );
  });

  it("biaya kosong: pesan, tanpa memanggil server", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ClinicSettingForm setting={SETTING} />);
    await user.clear(screen.getByLabelText("Biaya booking"));
    await user.click(screen.getByRole("button", { name: "Simpan pengaturan" }));
    expect(toast.error).toHaveBeenCalledWith("Isi biaya booking.");
    expect(updateClinicSetting).not.toHaveBeenCalled();
  });
});
```

`tests/unit/components/staff-table.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Staff } from "@prisma/client";
import { StaffTable } from "@/components/admin/staff-table";

const base = {
  slug: "x",
  title: null,
  bio: null,
  photoUrl: null,
  showOnWebsite: false,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Staff;

describe("StaffTable", () => {
  it("peran dan status sebagai tanda", () => {
    render(
      <StaffTable
        staff={[
          { ...base, id: "1", name: "dr. Diane", role: "DOKTER", showOnWebsite: true },
          { ...base, id: "2", name: "Rina", role: "RESEPSIONIS", isActive: false },
        ]}
      />,
    );
    const diane = screen.getByRole("row", { name: /dr\. Diane/ });
    expect(within(diane).getByText("Dokter")).toHaveAttribute("data-slot", "badge");
    expect(within(diane).getByText("Ya")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Rina/ })).getByText("Nonaktif")).toBeInTheDocument();
  });
});
```

Catatan: `base` memakai `as unknown as Staff` agar uji tidak bergantung pada daftar kolom `Staff` yang lengkap. `Badge` memasang `data-slot="badge"` (`src/components/ui/badge.tsx:40`).

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npx vitest run tests/unit/components/clinic-setting-form.test.tsx tests/unit/components/staff-table.test.tsx`
Expected: FAIL. Belum ada kepala halaman, kartu, atau pratinjau, dan peran belum berupa tanda.

- [ ] **Step 3: `src/components/admin/clinic-setting-form.tsx`**

Ganti seluruh isi berkas dengan:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBankAccount } from "@/lib/payment";
import { MISSING_BANK_ACCOUNT_LINE } from "@/lib/transfer-instruction";
import { updateClinicSetting, type ClinicSettingView } from "@/server/clinic-setting";
import { PageHeader, SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";

/** Pengaturan (spec D 5.5): kepala halaman dengan Simpan, kartu biaya booking dan rekening, pratinjau rekening. */
export function ClinicSettingForm({ setting }: { setting: ClinicSettingView }) {
  const [bookingFee, setBookingFee] = useState<number | null>(setting.bookingFee);
  const [bankName, setBankName] = useState(setting.bankName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(setting.bankAccountNumber ?? "");
  const [bankAccountHolder, setBankAccountHolder] = useState(setting.bankAccountHolder ?? "");
  const [pending, startTransition] = useTransition();
  const preview =
    formatBankAccount({
      bankName: bankName.trim() || null,
      bankAccountNumber: bankAccountNumber.trim() || null,
      bankAccountHolder: bankAccountHolder.trim() || null,
    }) ?? MISSING_BANK_ACCOUNT_LINE;

  function handleSave() {
    if (bookingFee === null) {
      toast.error("Isi biaya booking.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateClinicSetting({ bookingFee, bankName, bankAccountNumber, bankAccountHolder });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Pengaturan tersimpan.");
      } catch {
        toast.error("Pengaturan gagal disimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Setiap perubahan tercatat di jejak audit."
        actions={
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan pengaturan"}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <SectionCard title="Biaya booking">
          <div className="space-y-2">
            <Label htmlFor="booking-fee">Biaya booking</Label>
            <RupiahInput id="booking-fee" className="max-w-48" value={bookingFee} onChange={setBookingFee} />
            <p className="text-xs text-muted-foreground">
              Berlaku untuk booking baru dari situs, WhatsApp, dan telepon. Walk-in tidak dikenai biaya. Biaya booking terpisah dari
              biaya layanan, tidak dikembalikan, dan tetap berlaku bila pasien pindah jadwal paling lambat 2 jam sebelumnya.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Rekening transfer">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="bank-name">Nama bank</Label>
              <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-number">Nomor rekening</Label>
              <Input id="bank-number" inputMode="numeric" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-holder">Atas nama</Label>
              <Input id="bank-holder" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} />
            </div>
          </div>
          <p className="mt-3 rounded-md bg-cream-100 p-3 text-sm">
            Tampil ke pasien: <strong>{preview}</strong>
          </p>
        </SectionCard>
      </div>
    </>
  );
}
```

`src/app/(admin)/admin/pengaturan/page.tsx`, ganti seluruh isi berkas dengan:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicSettingForm } from "@/components/admin/clinic-setting-form";
import { PageBody } from "@/components/admin/page-layout";
import { getClinicSetting } from "@/server/clinic-setting";
import { requireCapability } from "@/server/session";

export default async function ClinicSettingPage() {
  await requireCapability("content:manage");
  const setting = await getClinicSetting();

  return (
    <>
      <AdminHeader title="Pengaturan" />
      <PageBody>
        <ClinicSettingForm setting={setting} />
      </PageBody>
    </>
  );
}
```

- [ ] **Step 4: Staf**

Di `src/components/admin/staff-table.tsx`, ganti `<TableCell>{ROLE_LABEL[person.role]}</TableCell>` menjadi:

```tsx
            <TableCell>
              <Badge variant="outline">{ROLE_LABEL[person.role]}</Badge>
            </TableCell>
```

`src/app/(admin)/admin/staf/page.tsx`, ganti seluruh isi berkas dengan:

```tsx
import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { StaffTable } from "@/components/admin/staff-table";
import { listStaff } from "@/server/staff";
import { requireCapability } from "@/server/session";

export default async function StaffPage() {
  await requireCapability("staff:manage");
  const staff = await listStaff();

  return (
    <>
      <AdminHeader title="Staf" />
      <PageBody>
        <PageHeader title="Staf" description="Akun staf dan perannya di panel." />
        <SectionCard title="Daftar staf" flush>
          <StaffTable staff={staff} />
        </SectionCard>
      </PageBody>
    </>
  );
}
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

Run: `npx vitest run tests/unit/components/clinic-setting-form.test.tsx tests/unit/components/staff-table.test.tsx && npm run test:integration -- tests/integration/clinic-setting.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/clinic-setting-form.tsx "src/app/(admin)/admin/pengaturan/page.tsx" src/components/admin/staff-table.tsx "src/app/(admin)/admin/staf/page.tsx" tests/unit/components/clinic-setting-form.test.tsx tests/unit/components/staff-table.test.tsx
git commit -m "feat: group settings into cards with a bank account preview, and show staff roles as badges"
```

---

### Task 10: Kepala halaman Booking, Pengingat, Isian, Kunjungan

**Files:**
- Modify: `src/app/(admin)/admin/booking/page.tsx`, `src/app/(admin)/admin/pengingat/page.tsx`, `src/app/(admin)/admin/isian/[id]/page.tsx`, `src/app/(admin)/admin/kunjungan/[id]/page.tsx`
- Test: `tests/e2e/tampilan-admin.spec.ts` (baru; uji pertama)

**Interfaces:**
- Consumes: Task 1 (`PageHeader`, `PageBody`, `AdminHeader heading`); halaman Task 4–9.
- Produces: setiap halaman admin punya **tepat satu** `<h1>`.

- [ ] **Step 1: Tulis uji e2e yang gagal**

`tests/e2e/tampilan-admin.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { signIn } from "./helpers/quiz";

test.setTimeout(180_000);

// Satu judul besar per halaman (spec D 3.1): bar atas tidak lagi memakai <h1>.
const PAGES: [string, RegExp][] = [
  ["/admin", /^Selamat (pagi|siang|sore|malam), /],
  ["/admin/booking", /^Booking$/],
  ["/admin/booking/baru", /^Booking Baru$/],
  ["/admin/pengingat", /^Pengingat$/],
  ["/admin/pasien", /^Pasien$/],
  ["/admin/jadwal", /^Jadwal$/],
  ["/admin/layanan", /^Layanan & Harga$/],
  ["/admin/staf", /^Staf$/],
  ["/admin/pengaturan", /^Pengaturan$/],
];

test("setiap halaman admin punya tepat satu judul besar, tanpa gulir mendatar di ponsel", async ({ page }, testInfo) => {
  await signIn(page, E2E_ADMIN);
  for (const [path, title] of PAGES) {
    await page.goto(path);
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1, { timeout: 30_000 });
    await expect(headings).toHaveText(title);
    if (testInfo.project.name === "mobile") {
      // Spec D 3.3: tabel boleh digulir di dalam kartunya, halaman tidak.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} melebar ${overflow}px`).toBeLessThanOrEqual(1);
    }
  }
});
```

Run: `npx playwright test tests/e2e/tampilan-admin.spec.ts --project=desktop`
Expected: FAIL di `/admin/booking`, karena halaman itu belum punya `<h1>` setelah bar atas tidak lagi memakai `<h1>`. Halaman lain mungkin sudah lulus karena Task 4–9.

- [ ] **Step 2: Booking (`src/app/(admin)/admin/booking/page.tsx`)**

Tambahkan impor `import { PageBody, PageHeader } from "@/components/admin/page-layout";`.

Ganti:

```tsx
      <BookingDialogsProvider today={today}>
      <div className="space-y-6 p-6">
```

dengan:

```tsx
      <BookingDialogsProvider today={today}>
      <PageBody>
        <PageHeader
          title="Booking"
          description={query ? `Hasil pencarian “${query}”` : unreviewedOnly ? "Isian belum diperiksa · semua tanggal" : dateLabel}
          actions={
            <Button asChild>
              <Link href="/admin/booking/baru">+ Booking Baru</Link>
            </Button>
          }
        />
```

Ganti penutup `      </div>\n      </BookingDialogsProvider>` menjadi `      </PageBody>\n      </BookingDialogsProvider>`.

Hapus tombol lama di baris cari, karena sekarang ada di kepala halaman:

```tsx
          <Button asChild>
            <Link href="/admin/booking/baru">+ Booking Baru</Link>
          </Button>
```

Lalu ganti `className="flex flex-wrap items-center justify-between gap-3"` pada `div` pembungkus formulir cari menjadi `className="flex flex-wrap items-center gap-3"`.

- [ ] **Step 3: Pengingat, Isian, dan Kunjungan**

`src/app/(admin)/admin/pengingat/page.tsx`: tambahkan impor `import { PageBody, PageHeader } from "@/components/admin/page-layout";`, lalu ganti:

```tsx
      <div className="p-6">
        <ReminderWorklistView worklist={worklist} />
      </div>
```

dengan:

```tsx
      <PageBody>
        <PageHeader title="Pengingat" description="Konfirmasi dan pengingat H-1 lewat WhatsApp." />
        <ReminderWorklistView worklist={worklist} />
      </PageBody>
```

`src/app/(admin)/admin/isian/[id]/page.tsx`: tambahkan impor `import { PageBody, PageHeader } from "@/components/admin/page-layout";`, lalu ganti:

```tsx
      <div className="p-6">
        <IntakeView intake={intake} />
      </div>
```

dengan:

```tsx
      <PageBody>
        <PageHeader
          title="Isian Pendaftaran"
          trail={[{ label: "Booking", href: "/admin/booking" }, { label: intake.appointment.code }]}
          description={`Booking ${intake.appointment.code}`}
        />
        <IntakeView intake={intake} />
      </PageBody>
```

`src/app/(admin)/admin/kunjungan/[id]/page.tsx`: ganti `<AdminHeader title="Kunjungan" />` menjadi `<AdminHeader title="Kunjungan" heading />`. Susunan halaman kunjungan dari spec B tidak berubah.

- [ ] **Step 4: Jalankan uji untuk memastikan lulus**

Run: `npx playwright test tests/e2e/tampilan-admin.spec.ts tests/e2e/admin-booking.spec.ts tests/e2e/kunjungan.spec.ts --project=desktop`
Expected: PASS. Booking Baru, daftar Booking, dan kunjungan tetap jalan.

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: bersih, dan seluruh uji unit lulus.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/booking/page.tsx" "src/app/(admin)/admin/pengingat/page.tsx" "src/app/(admin)/admin/isian/[id]/page.tsx" "src/app/(admin)/admin/kunjungan/[id]/page.tsx" tests/e2e/tampilan-admin.spec.ts
git commit -m "feat: give booking, reminders, intake, and visit pages the shared page header"
```

---

### Task 11: Uji ujung-ke-ujung dan status spec

**Files:**
- Create: `tests/e2e/dasbor.spec.ts`
- Modify: `tests/e2e/tampilan-admin.spec.ts` (tambah uji), `docs/superpowers/specs/2026-10-02-ui-tampilan-dasbor-design.md:5`

**Interfaces:**
- Consumes: semua task.
  - Garis waktu: region "Jadwal hari ini", listitem "Jadwal {nama}", tautan "Slot kosong HH.MM — buat booking {nama}", dan tautan blok "{HH.MM} {nama depan} · {layanan} · {status}".
  - Booking Baru: grup "Pilih jam", aside "Ringkasan booking", "+ Pasien Baru", "Buat Pasien", "Buat Booking".
  - Jadwal: navigasi "Pilih tenaga", tab "Jam kerja", kotak centang "Buka hari Minggu", "Mulai Minggu", "Selesai Minggu", "Simpan jam kerja".
  - Layanan: kotak "Harga berlaku {nama}".
  - Data Pasien: tab "Booking (N)", region "Riwayat booking", "+ Booking".

- [ ] **Step 1: Tulis uji e2e**

`tests/e2e/dasbor.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}

test("resepsionis: kotak pekerjaan dan garis waktu, tanpa Angka dan daftar dokter", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Selamat (pagi|siang|sore|malam), /);
  await expect(page.getByRole("link", { name: /Menunggu konfirmasi/ })).toHaveAttribute("href", "/admin/booking");
  await expect(page.getByRole("link", { name: /Pesan WA belum dikirim/ })).toHaveAttribute("href", "/admin/pengingat");
  await expect(page.getByRole("region", { name: "Angka" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Pasien hari ini" })).toHaveCount(0);

  const timeline = page.getByRole("region", { name: "Jadwal hari ini" });
  await expect(timeline).toBeVisible();
  test.skip((await timeline.getByText(/^Klinik tutup hari ini/).count()) > 0, "Hari libur: tidak ada lajur.");

  // prepare-db membuat booking hari ini pukul 06.00–08.00 untuk dr. Diane, di luar jam kerjanya (Review Focus 1).
  const block = timeline.getByRole("link", { name: /^0[67]\.[03]0 Pasien · .+ · / }).first();
  await expect(block).toBeVisible();
  await block.click();
  await expect(page).toHaveURL(/\/admin\/booking\?tanggal=\d{4}-\d{2}-\d{2}&sorot=/, { timeout: 30_000 });
  await expect(page.locator('tr[data-highlighted="true"]')).toHaveCount(1, { timeout: 30_000 });
});

test("slot kosong di garis waktu membuka Booking Baru yang sudah terisi", async ({ page }, testInfo) => {
  await stubWhatsApp(page);
  await signIn(page, E2E_ADMIN);
  const lane = page.getByRole("region", { name: "Jadwal hari ini" }).getByRole("listitem", { name: /^Jadwal Dr\. Diane/ });
  const slots = lane.getByRole("link", { name: /^Slot kosong/ });
  test.skip((await slots.count()) === 0, "Tidak ada slot kosong tersisa hari ini (hari libur, Minggu, atau malam).");

  // Ponsel memakai slot terakhir dan tidak membuat booking, agar dua proyek tidak merebut slot yang sama.
  const slot = testInfo.project.name === "mobile" ? slots.last() : slots.first();
  const time = /^Slot kosong (\d{2}\.\d{2})/.exec((await slot.getAttribute("aria-label"))!)![1];
  await slot.click();
  await expect(page).toHaveURL(/\/admin\/booking\/baru\?tenaga=.+&tanggal=.+&jam=/, { timeout: 30_000 });
  await expect(page.getByRole("group", { name: "Pilih jam" }).getByRole("button", { name: time })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 30_000 },
  );
  await expect(page.getByRole("complementary", { name: "Ringkasan booking" })).toContainText(time);
  if (testInfo.project.name === "mobile") return;

  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  await page.getByLabel("Nama", { exact: true }).fill(`Pasien Dasbor ${Date.now().toString().slice(-6)}`);
  await page.getByLabel("Nomor WhatsApp").fill(`0813${Date.now().toString().slice(-8)}`);
  await page.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Buat Booking" }).click();
  await expect(page.getByRole("heading", { name: /Booking SDY-[A-Z0-9]{4} dibuat/ })).toBeVisible({ timeout: 30_000 });
});
```

Tambahkan ke `tests/e2e/tampilan-admin.spec.ts`:

```ts
test("jadwal: buka hari Minggu untuk terapis, simpan, lalu tutup lagi", async ({ page }, testInfo) => {
  // Satu proyek saja: kedua proyek berbagi jadwal terapis yang sama.
  test.skip(testInfo.project.name === "mobile", "Hanya di desktop.");
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/jadwal");
  await page.getByRole("navigation", { name: "Pilih tenaga" }).getByRole("link", { name: /Terapis/ }).click();
  await expect(page.getByRole("link", { name: "Jam kerja" })).toHaveAttribute("aria-current", "page", { timeout: 30_000 });

  const sunday = page.getByRole("checkbox", { name: "Buka hari Minggu" });
  await sunday.check();
  await page.getByLabel("Mulai Minggu").fill("10:00");
  await page.getByLabel("Selesai Minggu").fill("12:00");
  await page.getByRole("button", { name: "Simpan jam kerja" }).click();
  await expect(page.getByText("Jam kerja tersimpan.")).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Buka hari Minggu" })).toBeChecked({ timeout: 30_000 });
  await expect(page.getByLabel("Selesai Minggu")).toHaveValue("12:00");

  await page.getByRole("checkbox", { name: "Buka hari Minggu" }).uncheck();
  await page.getByRole("button", { name: "Simpan jam kerja" }).click();
  await expect(page.getByText("Jam kerja tersimpan.").first()).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Buka hari Minggu" })).not.toBeChecked({ timeout: 30_000 });
});

test("Layanan & Harga: ubah harga, tampil di situs publik, lalu kembalikan", async ({ page }, testInfo) => {
  // Setiap proyek memakai layanan sendiri, agar tidak saling menimpa.
  const service =
    testInfo.project.name === "mobile"
      ? { name: "Elektrocauter", slug: "elektrocauter", price: 188000, changed: 187000, label: "Rp 187.000" }
      : { name: "Lip Laser", slug: "lip-laser", price: 99000, changed: 98000, label: "Rp 98.000" };
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/layanan");
  const promo = page.getByRole("textbox", { name: `Harga berlaku ${service.name}` });
  await promo.fill(String(service.changed));
  await page.getByRole("row", { name: new RegExp(service.name) }).getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`Harga ${service.name} tersimpan.`)).toBeVisible({ timeout: 30_000 });

  await page.goto(`/layanan/${service.slug}`);
  await expect(page.locator("main")).toContainText(service.label, { timeout: 30_000 });

  await page.goto("/admin/layanan");
  await page.getByRole("textbox", { name: `Harga berlaku ${service.name}` }).fill(String(service.price));
  await page.getByRole("row", { name: new RegExp(service.name) }).getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`Harga ${service.name} tersimpan.`)).toBeVisible({ timeout: 30_000 });
});

test("Data Pasien: tab Booking lalu + Booking membuka Booking Baru dengan pasien terpilih", async ({ page }, testInfo) => {
  const name = testInfo.project.name === "mobile" ? "Pasien Kunjungan mobile" : "Pasien Kunjungan desktop";
  await signIn(page, E2E_ADMIN);
  await page.goto(`/admin/pasien?q=${encodeURIComponent(name)}`);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name, { timeout: 30_000 });

  await page.getByRole("link", { name: /^Booking \(\d+\)$/ }).click();
  await expect(page.getByRole("region", { name: "Riwayat booking" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "+ Booking" }).click();
  await expect(page).toHaveURL(/\/admin\/booking\/baru\?pasien=/, { timeout: 30_000 });
  await expect(page.getByRole("complementary", { name: "Ringkasan booking" })).toContainText(name);
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible();
});
```

Catatan untuk pelaksana:
- `fill` pada kotak rupiah mengganti seluruh isinya dengan angka, lalu komponen menampilkannya sebagai rupiah.
- Seed dijalankan ulang setiap kali e2e dimulai (`prepare-db`). Bila uji gagal sebelum harga dikembalikan, pastikan seed mengembalikan harga layanan. Bila seed tidak menimpa harga, tambahkan pengembalian harga di `afterEach` dan catat ruling-nya di ledger.

- [ ] **Step 2: Jalankan uji e2e baru**

Run: `npx playwright test tests/e2e/dasbor.spec.ts tests/e2e/tampilan-admin.spec.ts`
Expected: PASS di desktop dan ponsel. Uji yang dilewati karena hari libur atau sudah malam dicatat di ledger beserta alasannya.

Buktikan uji garis waktu bisa gagal:
1. Di `src/components/admin/schedule-timeline.tsx`, ubah sementara `href` slot kosong menjadi `/admin/booking/baru`, yaitu tanpa isian awal.
2. Run: `npx playwright test tests/e2e/dasbor.spec.ts --project=desktop`
   Expected: FAIL pada `toHaveURL(/…tenaga=…/)`, atau pada jam yang tidak terpilih.
3. Kembalikan perubahan itu: `git checkout src/components/admin/schedule-timeline.tsx`.

- [ ] **Step 3: Seluruh e2e**

Run: `caffeinate -i npm run test:e2e`
Expected: PASS. Uji ponsel yang kadang kehabisan waktu di bawah beban dijalankan ulang per berkas, dan hasilnya dicatat.

- [ ] **Step 4: Status spec dan verifikasi akhir**

Di `docs/superpowers/specs/2026-10-02-ui-tampilan-dasbor-design.md`, ganti baris status menjadi:

```markdown
- **Status:** Disetujui pemilik (2 Oktober 2026) · terlaksana (<tanggal hari ini>)
```

Lalu jalankan:

```bash
npx vitest run --maxWorkers=3
npm run test:integration
npx tsc --noEmit
npm run lint
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: semuanya PASS atau bersih, dan perintah terakhir keluar dengan kode 0 karena tidak ada migrasi.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/dasbor.spec.ts tests/e2e/tampilan-admin.spec.ts docs/superpowers/specs/2026-10-02-ui-tampilan-dasbor-design.md
git commit -m "test: cover the dashboard, schedule week, prices, and patient booking end to end; mark the part D spec done"
```
