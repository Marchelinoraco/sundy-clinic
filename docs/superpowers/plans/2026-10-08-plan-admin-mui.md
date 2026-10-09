# Panel Admin dengan Material UI dan Mode Gelap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seluruh panel admin (26 halaman + `/masuk`) memakai Material UI dengan tema SunDY terang dan gelap, plus DataGrid, Date Pickers, Charts, dan Autocomplete, tanpa mengubah alur, hak akses, atau situs publik.

**Architecture:**
- **Penyekatan:** layout baru `src/app/(admin)/layout.tsx` memasang `InitColorSchemeScript` dan `AdminProviders` (Emotion cache dengan lapisan CSS, `ThemeProvider` tema SunDY dua skema, `ScopedCssBaseline`, `LocalizationProvider` dayjs `id`). Situs publik tidak memuat MUI; `src/components/ui/*` (shadcn) tetap untuk situs publik saja.
- **Fondasi bersama di `src/components/admin/mui/`** (semua `"use client"`): tema, provider, tombol mode, toaster bertema, `LinkButton`, `StatusChip`, `DateField`/`MonthField`, `SelectField` (native), `AdminDataGrid`, `ItemAutocomplete`. Komponen bersama yang sudah ada (`PageHeader`, `SectionCard`, `StatTile`, `PageTabs`, `AdminHeader`, `AppSidebar`, `RupiahInput`, `PatientPicker`) ditulis ulang dengan MUI **dengan API yang sama**, sehingga pemanggilnya tidak berubah.
- **Migrasi per modul** setelah fondasi: setiap berkas admin mengganti impor `@/components/ui/*` dan kelas Tailwind dengan MUI mengikuti **Resep konversi** di bawah. Nama yang dilihat pengguna (label, nama tombol, judul dialog, teks) tidak berubah, sehingga uji yang mencari lewat label tetap berlaku.

**Tech Stack:** Next.js 15.5 App Router, React 19, `@mui/material` 9.x, `@mui/material-nextjs`, `@mui/icons-material`, Emotion 11, `@mui/x-data-grid` / `@mui/x-date-pickers` / `@mui/x-charts` 9.x, dayjs; Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-material-ui-design.md`

## Global Constraints

- **Hanya lapisan tampilan.** Aksi server, pembacaan data (`src/server/**`), aturan murni (`src/lib/**` kecuali pembantu tanggal baru dan pemindahan daftar jam waktu luang di Task 8), hak akses, dan basis data tidak berubah. Tidak ada migrasi.
- **Situs publik, kuis `/daftar`, struk, dan formulir food recall pasien** (`src/app/(public)/**`, `src/components/{layout,pendaftaran,food-recall,…}`) tidak boleh berubah rupa. `src/components/ui/*` tidak diubah.
- **Nama yang dilihat pengguna tidak berubah:** label kolom, `aria-label`, nama tombol, judul dialog, teks pesan, teks keadaan kosong, dan judul `<h1>` halaman.
- **Batas server → klien:** halaman (komponen server) boleh memakai komponen tata letak MUI (`Box`, `Stack`, `Grid`, `Typography`, `Card`…) **hanya dengan props yang bisa diserialisasi** (string, angka, objek `sx` tanpa fungsi). Tidak boleh `component={Link}`, `sx={(theme) => …}`, atau props fungsi dari berkas server; pakai `LinkButton`/`TextLink` dari `src/components/admin/mui/links.tsx` atau komponen klien modul.
- **Ikon:** admin memakai `@mui/icons-material`; `lucide-react` tidak lagi diimpor di `src/components/admin/**` dan `src/app/(admin)/**`.
- **Tanggal:** nilai di state dan yang dikirim ke server tetap teks `"YYYY-MM-DD"` (bulan `"YYYY-MM"`). `DateField`/`MonthField` mengonversi dengan dayjs tanpa zona waktu (tanggal kalender murni).
- **Pilihan:** `<select>` diganti `SelectField` yang **native** (tetap elemen `<select>`), kecuali pilihan pasien dan barang yang menjadi Autocomplete.
- **DataGrid:** dipakai untuk 12 daftar di spec 4; selalu `disableVirtualization`, halaman 25 baris, tinggi otomatis; daftar kosong tetap menampilkan `EmptyState` dengan teks lama (bukan overlay DataGrid).
- **Kontras:** teks utama dan teks sekunder terhadap latar, serta teks tombol utama terhadap warna utama, minimal **4,5:1** di kedua skema.
- **Cetak:** semua halaman admin, termasuk tagihan dan etiket, selalu tercetak terang (kelas `cetak-terang` di akar panel).
- **Dependensi baru** hanya paket di spec 3.1. Repo tidak memakai Prettier; ikuti format sekitar.
- **Log uji:** `WS` = `.superpowers/sdd/2026-10-08-plan-admin-mui/`. Uji integrasi tidak bersamaan dengan e2e; setelah e2e, kosongkan data e2e (`tests/e2e/prepare-db.mts` dengan env uji) sebelum integrasi. E2E per berkas/proyek (laptop 8 GB).
- **Uji yang sudah gagal sebelumnya:** 3 uji `tests/integration/schedule.test.ts`. Jangan diubah.
- **Commit:** Conventional Commits berbahasa Inggris dengan `Co-Authored-By` yang menyebut model penulis commit. **Jangan pernah men-stage** `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Halaman galat 500 karena props fungsi lintas server → klien** (mis. `component={Link}` di halaman server). Setiap halaman admin harus terbuka tanpa galat → Task 13 memperluas `tampilan-admin.spec.ts` ke 26 halaman di kedua skema dan menolak galat konsol.
2. **Tanggal bergeser sehari atau isian setengah jadi.** Mengetik tanggal di `DateField` menghasilkan teks yang sama persis; isian tak lengkap menjadi `""` sehingga pesan validasi lama muncul → uji konversi di Task 3.
3. **Mode gelap:** tidak berkedip terang saat dibuka, pilihan bertahan setelah muat ulang, cetak tetap terang, dan situs publik tetap terang setelah berpindah dari admin → Task 1 (komponen) dan Task 13 (E2E).
4. **Ponsel:** menu `Drawer` bisa dibuka/tutup, tidak ada gulir mendatar halaman, DataGrid menggulir di dalam kartunya → `tampilan-admin.spec.ts` (Task 13) di proyek ponsel.
5. **DataGrid** dengan 0, 1, dan 300 baris: urut kolom bekerja, halaman 25, teks kosong lama, tautan di sel tetap bisa diklik → uji `AdminDataGrid` di Task 3.

---

## Struktur berkas

**Baru**

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `src/app/(admin)/layout.tsx` | `InitColorSchemeScript` + `AdminProviders` untuk `/admin/**` dan `/masuk` | 1 |
| `src/components/admin/mui/theme.ts` | Tema SunDY (`colorSchemes` light/dark, tipografi, bentuk, komponen) | 1 |
| `src/components/admin/mui/admin-providers.tsx` | Emotion cache (lapisan CSS), `ThemeProvider`, `ScopedCssBaseline`, `LocalizationProvider` | 1 |
| `src/components/admin/mui/color-mode-toggle.tsx` | Tombol Terang / Gelap / Ikuti sistem | 1 |
| `src/components/admin/mui/admin-toaster.tsx` | `sonner` mengikuti skema MUI | 1 |
| `src/components/admin/mui/locale.ts` | Teks Indonesia pemilih tanggal | 1 |
| `tests/unit/helpers/render-admin.tsx` | `renderAdmin` (tema + pemilih tanggal untuk uji) | 1 |
| `src/components/admin/mui/links.tsx` | `LinkButton`, `TextLink` (next/link + MUI, aman dipakai halaman server) | 2 |
| `src/components/admin/mui/status-chip.tsx` | `Chip` status dengan nada warna | 2 |
| `src/components/admin/mui/admin-shell.tsx` | Kerangka: menu tetap (desktop) / laci (ponsel), `main`, konteks bilah atas | 2 |
| `src/components/admin/mui/dialog-close-button.tsx` | Tombol silang "Close" di dialog | 2 |
| `src/lib/date-field.ts` | Konversi teks tanggal/bulan ↔ dayjs (murni) | 3 |
| `src/components/admin/mui/date-field.tsx` | `DateField`, `MonthField` | 3 |
| `src/components/admin/mui/select-field.tsx` | `SelectField` (TextField select native) | 3 |
| `src/components/admin/mui/admin-data-grid.tsx` | `AdminDataGrid` | 3 |
| `tests/unit/helpers/mui.ts` | `setDateField`, `dateFieldValue`, `dateFieldInput`, `pickOption`, `mockGridLayout` | 3 |
| `tests/e2e/helpers/mui.ts` | `isiTanggal`, `pilihOpsi` | 3 |
| `src/components/admin/mui/item-autocomplete.tsx` | `ItemAutocomplete` | 4 |
| `src/components/admin/booking-source-chart.tsx` | Grafik batang booking per sumber (dasbor) | 5 |
| `src/components/admin/patient-table.tsx` | DataGrid daftar pasien | 6 |
| `src/components/admin/contact-windows-fields.tsx` | Editor waktu luang versi admin (MUI) | 8 |
| `src/components/admin/activity-list-fields.tsx` | Daftar aktivitas food recall versi admin (MUI) | 9 |
| `tests/e2e/mode-gelap.spec.ts` | E2E mode gelap | 13 |
| `tests/e2e/helpers/admin-pages.ts` | Daftar 26 halaman admin + pencari alamat halaman detail | 5 |
| `tests/e2e/zz-foto-admin.spec.ts` | Foto halaman admin (dua skema, dua ukuran), hanya jalan dengan `FOTO_ADMIN=1` | 5 |

**Diubah:** `src/app/globals.css` (urutan lapisan, cetak terang), `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/masuk/page.tsx`, semua berkas di `src/components/admin/**` dan `src/app/(admin)/admin/**/page.tsx` (Task 2–12), `src/lib/online-consultation.ts` + `src/components/online/contact-windows-editor.tsx` (Task 8, pindah konstanta saja), `src/components/admin/report/trend-chart.tsx` (Task 12, MUI X Charts), uji terkait di `tests/unit/**` dan `tests/e2e/**`, `tests/unit/helpers/browser-mocks.ts` (Task 3), `tests/unit/architecture.test.ts` (Task 1, 5–13), spec MUI (status, Task 13), `package.json`.

---

### Task 1: Fondasi — paket, tema terang/gelap, provider khusus admin, tombol mode, toaster

**Files:**
- Create: `src/lib/color-mode.ts`, `src/components/admin/mui/theme.ts`, `src/components/admin/mui/locale.ts`, `src/components/admin/mui/admin-providers.tsx`, `src/components/admin/mui/color-mode-toggle.tsx`, `src/components/admin/mui/admin-toaster.tsx`, `src/app/(admin)/layout.tsx`, `tests/unit/helpers/render-admin.tsx`
- Modify: `package.json`, `src/app/globals.css`, `src/app/(admin)/admin/layout.tsx` (ganti `Toaster`), `tests/unit/architecture.test.ts`
- Test: `tests/unit/admin-theme.test.ts`, `tests/unit/color-mode-toggle.test.tsx`

**Interfaces:**
- Produces:
  - `src/lib/color-mode.ts`: `MODE_STORAGE_KEY = "sundy-mode-admin"`, `COLOR_SCHEME_SELECTOR = "data"`;
  - `src/components/admin/mui/theme.ts` (tanpa direktif): `SUNDY` (token warna), `DARK` (token gelap), `adminTheme` (`createTheme` dengan `cssVariables.colorSchemeSelector = COLOR_SCHEME_SELECTOR`, `colorSchemes.light/dark`);
  - `src/components/admin/mui/locale.ts` (tanpa direktif): `PICKERS_LOCALE_ID` (teks Indonesia pemilih tanggal; MUI X 9 belum punya `idID` untuk pickers);
  - `AdminProviders({ children })`, `ColorModeToggle()`, `AdminToaster()` (semua `"use client"`);
  - `renderAdmin(ui)` untuk uji: membungkus `ThemeProvider` (`adminTheme`) dan `LocalizationProvider` (dayjs `id`, `PICKERS_LOCALE_ID`).

- [ ] **Step 1: Ukuran sebelum migrasi**

Run: `npx next build > "$WS/build-sebelum.log" 2>&1; echo "build exit $?"; grep -E "^(├|└|┌).*(/admin|/masuk)" "$WS/build-sebelum.log" > "$WS/ukuran-sebelum.txt"; wc -l "$WS/ukuran-sebelum.txt"`
Expected: `build exit 0`; daftar rute admin beserta "First Load JS" tersimpan (dibandingkan di Task 13).

- [ ] **Step 2: Pasang paket**

```bash
npm install @mui/material @mui/material-nextjs @mui/icons-material @emotion/react @emotion/styled @emotion/cache @mui/x-data-grid @mui/x-date-pickers @mui/x-charts dayjs
npm ls @mui/material @mui/x-data-grid @mui/x-date-pickers @mui/x-charts react
```

Expected: tanpa galat peer dependency; `@mui/material` 9.x dan MUI X 9.x memakai React 19.1. Catat versi terpasang di ledger. Bila API di bawah berbeda di versi terpasang (nama opsi `colorSchemeSelector`, impor `@mui/material-nextjs/v15-appRouter`), ikuti dokumentasi versi itu dan catat sebagai `Ruling:`. Catatan versi 9 yang sudah diperiksa saat menulis rencana: `@mui/material-nextjs` 9.4 punya `v15-appRouter`; Date Pickers 9 **hanya** punya struktur DOM aksesibel (opsi `enableAccessibleFieldDOMStructure` sudah dihapus) — isian tanggal berupa `role="group"` berlabel berisi bagian hari/bulan/tahun (`role="spinbutton"`) dan satu `<input>` tersembunyi bernilai teks terformat; DataGrid 9 masih punya `autoHeight` dan `disableVirtualization`, dan menyediakan `idID` di `@mui/x-data-grid/locales`.

- [ ] **Step 3: Tulis uji (gagal)**

`tests/unit/admin-theme.test.ts`:

```ts
import { getContrastRatio } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { adminTheme, DARK, SUNDY } from "@/components/admin/mui/theme";
import { COLOR_SCHEME_SELECTOR, MODE_STORAGE_KEY } from "@/lib/color-mode";

type Tone = { main: string; contrastText: string };
const schemes = adminTheme.colorSchemes as Record<
  "light" | "dark",
  { palette: { primary: Tone; error: Tone; warning: Tone; info: Tone; success: Tone; background: { default: string; paper: string }; text: { primary: string; secondary: string } } }
>;

describe("tema SunDY", () => {
  it("memakai warna merek: emas utama, latar krem (terang) dan cokelat sangat tua (gelap)", () => {
    expect(schemes.light.palette.primary.main).toBe(SUNDY.gold500);
    expect(schemes.light.palette.background.default).toBe(SUNDY.cream50);
    expect(schemes.dark.palette.background.default).toBe(DARK.background);
    expect(schemes.dark.palette.primary.main).toBe(DARK.primary);
  });

  for (const scheme of ["light", "dark"] as const) {
    it(`kontras minimal 4,5:1 di skema ${scheme}`, () => {
      const p = schemes[scheme].palette;
      expect(getContrastRatio(p.text.primary, p.background.default)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(p.text.secondary, p.background.default)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(p.text.primary, p.background.paper)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(p.text.secondary, p.background.paper)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(p.primary.contrastText, p.primary.main)).toBeGreaterThanOrEqual(4.5);
    });

    it(`warna status terbaca sebagai teks dan sebagai latar chip di skema ${scheme}`, () => {
      const p = schemes[scheme].palette;
      for (const tone of [p.error, p.warning, p.info, p.success]) {
        expect(getContrastRatio(tone.main, p.background.default)).toBeGreaterThanOrEqual(4.5);
        expect(getContrastRatio(tone.main, p.background.paper)).toBeGreaterThanOrEqual(4.5);
        expect(getContrastRatio(tone.contrastText, tone.main)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("huruf: badan Plus Jakarta Sans, judul Cormorant; tombol tanpa huruf kapital semua; sudut 12px", () => {
    expect(adminTheme.typography.fontFamily).toContain("--font-jakarta");
    expect(String(adminTheme.typography.h1.fontFamily)).toContain("--font-cormorant");
    expect(adminTheme.typography.button.textTransform).toBe("none");
    expect(adminTheme.shape.borderRadius).toBe(12);
  });

  it("kunci penyimpanan dan pemilih skema konsisten", () => {
    expect(MODE_STORAGE_KEY).toBe("sundy-mode-admin");
    expect(COLOR_SCHEME_SELECTOR).toBe("data");
  });
});
```

`tests/unit/helpers/render-admin.tsx`:

```tsx
import { ThemeProvider } from "@mui/material/styles";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { render, type RenderOptions } from "@testing-library/react";
import "dayjs/locale/id";
import type { ReactElement, ReactNode } from "react";
import { PICKERS_LOCALE_ID } from "@/components/admin/mui/locale";
import { adminTheme } from "@/components/admin/mui/theme";
import { MODE_STORAGE_KEY } from "@/lib/color-mode";

export function AdminTestProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={adminTheme} defaultMode="system" modeStorageKey={MODE_STORAGE_KEY}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="id" localeText={PICKERS_LOCALE_ID}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}

/** Render komponen admin dengan tema dan pemilih tanggal, seperti di layout admin. */
export function renderAdmin(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AdminTestProviders, ...options });
}
```

`tests/unit/color-mode-toggle.test.tsx`:

```tsx
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ColorModeToggle } from "@/components/admin/mui/color-mode-toggle";
import { MODE_STORAGE_KEY } from "@/lib/color-mode";
import { renderAdmin } from "./helpers/render-admin";

beforeEach(() => localStorage.clear());

describe("tombol mode tampilan", () => {
  it("tiga pilihan; bawaan Ikuti sistem", async () => {
    renderAdmin(<ColorModeToggle />);
    const group = await screen.findByRole("group", { name: "Mode tampilan" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ikuti sistem" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Terang" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "false");
  });

  it("memilih Gelap menyimpan pilihan di perangkat dan dipulihkan saat dibuka lagi", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAdmin(<ColorModeToggle />);
    await user.click(await screen.findByRole("button", { name: "Gelap" }));
    expect(screen.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe("dark");
    unmount();

    renderAdmin(<ColorModeToggle />);
    expect(await screen.findByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Terang" }));
    });
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe("light");
  });
});
```

Tambahkan di `tests/unit/architecture.test.ts` (di dalam `describe("batasan arsitektur")`):

```ts
  it("Material UI hanya dimuat panel admin; situs publik tidak", () => {
    const publicFiles = [
      ...collectSourceFiles("src/app/(public)"),
      ...collectSourceFiles("src/components").filter((file) => !file.startsWith(join("src", "components", "admin"))),
    ];
    const offenders = publicFiles.filter((file) => /from\s+"@mui\//.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("layout grup admin memasang provider MUI dan skrip skema warna", () => {
    const layout = readFileSync("src/app/(admin)/layout.tsx", "utf8");
    expect(layout).toContain("AdminProviders");
    expect(layout).toContain("InitColorSchemeScript");
  });
```

Run: `npx vitest run tests/unit/admin-theme.test.ts tests/unit/color-mode-toggle.test.tsx tests/unit/architecture.test.ts`
Expected: FAIL (modul tema, tombol, dan layout belum ada).

- [ ] **Step 4: Tema, provider, tombol mode, toaster**

`src/lib/color-mode.ts`:

```ts
// Konstanta mode tampilan panel admin (spec MUI 5). Dipakai layout server dan tema klien.

/** Kunci localStorage pilihan Terang / Gelap / Ikuti sistem, per perangkat. */
export const MODE_STORAGE_KEY = "sundy-mode-admin";
/** Pemilih skema warna MUI; harus sama di tema dan InitColorSchemeScript. */
export const COLOR_SCHEME_SELECTOR = "data";
```

`src/components/admin/mui/theme.ts`:

```ts
import { createTheme } from "@mui/material/styles";
import { COLOR_SCHEME_SELECTOR } from "@/lib/color-mode";

// Tema SunDY untuk panel admin (spec MUI 3.3, 5). Hanya dipakai di bawah layout grup admin.

export const SUNDY = {
  cream50: "#fffdf7",
  cream100: "#fdf6e3",
  cream200: "#f7edd4",
  cream300: "#f0e2bd",
  gold300: "#efd08c",
  gold400: "#e8b84b",
  gold500: "#d4a017",
  gold600: "#b8860b",
  brown600: "#8a7047",
  brown700: "#6b5535",
  brown800: "#4a3c28",
  brown900: "#2e2517",
} as const;

export const DARK = {
  background: "#14100a",
  paper: "#1f1810",
  paperRaised: "#2a2117",
  text: "#f7edd4",
  textSecondary: "#cbb994",
  primary: "#e8b84b",
  primaryContrast: "#14100a",
  divider: "rgba(240, 226, 189, 0.16)",
} as const;

/** Warna status per skema; diuji kontrasnya di admin-theme.test.ts. */
export const STATUS = {
  light: { error: "#b3261e", warning: "#9a5b00", info: "#0b5c8a", success: "#2e6b30" },
  dark: { error: "#f28b82", warning: "#f0b25a", info: "#7cc4f2", success: "#7fcf86" },
} as const;

const FONT_SANS = "var(--font-jakarta), ui-sans-serif, system-ui, sans-serif";
const FONT_DISPLAY = "var(--font-cormorant), Georgia, serif";

export const adminTheme = createTheme({
  cssVariables: { colorSchemeSelector: COLOR_SCHEME_SELECTOR },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: SUNDY.gold500, light: SUNDY.gold300, dark: SUNDY.gold600, contrastText: SUNDY.brown900 },
        secondary: { main: SUNDY.brown800, contrastText: SUNDY.cream50 },
        background: { default: SUNDY.cream50, paper: "#ffffff" },
        text: { primary: SUNDY.brown900, secondary: SUNDY.brown700 },
        divider: SUNDY.cream300,
        // Warna status gelap secukupnya agar terbaca sebagai teks dan sebagai latar chip (≥ 4,5:1).
        error: { main: STATUS.light.error, contrastText: "#ffffff" },
        warning: { main: STATUS.light.warning, contrastText: "#ffffff" },
        info: { main: STATUS.light.info, contrastText: "#ffffff" },
        success: { main: STATUS.light.success, contrastText: "#ffffff" },
      },
    },
    dark: {
      palette: {
        primary: { main: DARK.primary, light: SUNDY.gold300, dark: SUNDY.gold500, contrastText: DARK.primaryContrast },
        secondary: { main: SUNDY.cream200, contrastText: DARK.background },
        background: { default: DARK.background, paper: DARK.paper },
        text: { primary: DARK.text, secondary: DARK.textSecondary },
        divider: DARK.divider,
        error: { main: STATUS.dark.error, contrastText: DARK.background },
        warning: { main: STATUS.dark.warning, contrastText: DARK.background },
        info: { main: STATUS.dark.info, contrastText: DARK.background },
        success: { main: STATUS.dark.success, contrastText: DARK.background },
      },
    },
  },
  typography: {
    fontFamily: FONT_SANS,
    h1: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: "2rem", lineHeight: 1.15 },
    h2: { fontFamily: FONT_SANS, fontWeight: 600, fontSize: "1rem", lineHeight: 1.4 },
    h3: { fontFamily: FONT_SANS, fontWeight: 600, fontSize: "0.95rem" },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      // Emas merek terlalu terang sebagai warna teks di latar krem (± 2,4:1). Tombol garis/teks
      // memakai warna teks utama; tombol penuh tetap emas dengan teks cokelat tua.
      variants: [
        { props: { variant: "text", color: "primary" }, style: { color: "var(--mui-palette-text-primary)" } },
        {
          props: { variant: "outlined", color: "primary" },
          style: { color: "var(--mui-palette-text-primary)", borderColor: "rgba(var(--mui-palette-text-primaryChannel) / 0.35)" },
        },
      ],
    },
    // Tautan mengikuti warna teks di sekitarnya (seperti sebelumnya), bergaris bawah saat disorot.
    MuiLink: { defaultProps: { color: "inherit", underline: "hover" }, styleOverrides: { root: { fontWeight: 500 } } },
    // Kotak centang, radio, sakelar, dan garis fokus isian memakai cokelat (terang) / krem (gelap): kontras ≥ 3:1.
    MuiCheckbox: { defaultProps: { color: "secondary" } },
    MuiRadio: { defaultProps: { color: "secondary" } },
    MuiSwitch: { defaultProps: { color: "secondary" } },
    MuiTextField: { defaultProps: { size: "small", color: "secondary" } },
    MuiChip: { defaultProps: { size: "small" } },
    MuiAppBar: { defaultProps: { elevation: 0, color: "inherit" } },
    MuiDialog: { defaultProps: { fullWidth: true, maxWidth: "sm" } },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { boxShadow: "0 1px 2px rgba(46, 37, 23, 0.06), 0 6px 16px rgba(46, 37, 23, 0.05)" } },
    },
  },
});
```

`src/components/admin/mui/locale.ts`:

```ts
import type { PickersLocaleText } from "@mui/x-date-pickers/locales";

/**
 * Teks pemilih tanggal berbahasa Indonesia. MUI X 9 belum punya terjemahan Indonesia untuk pickers
 * (DataGrid punya: `idID` dari `@mui/x-data-grid/locales`, dipakai AdminDataGrid).
 */
export const PICKERS_LOCALE_ID: Partial<PickersLocaleText> = {
  previousMonth: "Bulan sebelumnya",
  nextMonth: "Bulan berikutnya",
  openPreviousView: "Tampilan sebelumnya",
  openNextView: "Tampilan berikutnya",
  calendarViewSwitchingButtonAriaLabel: (view) =>
    view === "year" ? "Pilihan tahun terbuka, beralih ke kalender" : "Kalender terbuka, beralih ke pilihan tahun",
  cancelButtonLabel: "Batal",
  clearButtonLabel: "Kosongkan",
  okButtonLabel: "OK",
  todayButtonLabel: "Hari ini",
  datePickerToolbarTitle: "Pilih tanggal",
  openDatePickerDialogue: (formattedDate) => (formattedDate ? `Pilih tanggal, terpilih ${formattedDate}` : "Pilih tanggal"),
  fieldClearLabel: "Kosongkan",
  dateTableLabel: "pilih tanggal",
  fieldYearPlaceholder: (params) => "T".repeat(params.digitAmount),
  fieldMonthPlaceholder: (params) => (params.contentType === "letter" ? "BBBB" : "BB"),
  fieldDayPlaceholder: () => "HH",
  year: "Tahun",
  month: "Bulan",
  day: "Hari",
  empty: "Kosong",
};
```

`src/components/admin/mui/admin-providers.tsx`:

```tsx
"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import ScopedCssBaseline from "@mui/material/ScopedCssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import "dayjs/locale/id";
import type { ReactNode } from "react";
import { MODE_STORAGE_KEY } from "@/lib/color-mode";
import { PICKERS_LOCALE_ID } from "./locale";
import { adminTheme } from "./theme";

/**
 * Provider MUI khusus panel admin (spec MUI 3.2). Gaya Emotion masuk lapisan CSS `mui` sehingga urutannya
 * terhadap Tailwind terkendali; `ScopedCssBaseline` (bukan `CssBaseline`) supaya reset global tidak tertinggal
 * di situs publik setelah berpindah halaman.
 */
export function AdminProviders({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "mui", enableCssLayer: true }}>
      <ThemeProvider theme={adminTheme} defaultMode="system" modeStorageKey={MODE_STORAGE_KEY} disableTransitionOnChange>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="id" localeText={PICKERS_LOCALE_ID}>
          {/* `cetak-terang`: semua halaman admin tercetak terang (globals.css), apa pun skema layarnya. */}
          <ScopedCssBaseline className="cetak-terang" enableColorScheme sx={{ minHeight: "100svh", bgcolor: "background.default", color: "text.primary" }}>
            {children}
          </ScopedCssBaseline>
        </LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
```

`src/components/admin/mui/color-mode-toggle.tsx`:

```tsx
"use client";

import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlined from "@mui/icons-material/SettingsBrightnessOutlined";
import { useColorScheme } from "@mui/material/styles";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";

const OPTIONS = [
  { value: "light", label: "Terang", Icon: LightModeOutlined },
  { value: "dark", label: "Gelap", Icon: DarkModeOutlined },
  { value: "system", label: "Ikuti sistem", Icon: SettingsBrightnessOutlined },
] as const;

/** Terang / Gelap / Ikuti sistem (spec MUI 5). Pilihan disimpan per perangkat oleh MUI. */
export function ColorModeToggle() {
  const { mode, setMode } = useColorScheme();
  // Sebelum terpasang di peramban, mode belum diketahui: jangan render agar tidak salah tanda.
  if (!mode) return null;
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={mode}
      onChange={(_, next: "light" | "dark" | "system" | null) => next && setMode(next)}
      aria-label="Mode tampilan"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <Tooltip key={value} title={label}>
          <ToggleButton value={value} aria-label={label}>
            <Icon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
```

`src/components/admin/mui/admin-toaster.tsx`:

```tsx
"use client";

import { useColorScheme } from "@mui/material/styles";
import { Toaster } from "sonner";

/** Pop-up sonner mengikuti skema warna MUI (spec MUI 4); posisi kanan atas seperti sebelumnya. */
export function AdminToaster() {
  const { mode, systemMode } = useColorScheme();
  const resolved = mode === "system" ? systemMode : mode;
  return <Toaster position="top-right" theme={resolved === "dark" ? "dark" : "light"} closeButton />;
}
```

`src/app/(admin)/layout.tsx`:

```tsx
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import type { ReactNode } from "react";
import { AdminProviders } from "@/components/admin/mui/admin-providers";
import { COLOR_SCHEME_SELECTOR, MODE_STORAGE_KEY } from "@/lib/color-mode";

/** Layout grup admin (/admin/** dan /masuk): MUI dan skema warna hanya di sini, bukan di situs publik. */
export default function AdminGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Menetapkan skema sebelum halaman tampil, supaya mode gelap tidak berkedip terang. */}
      <InitColorSchemeScript attribute={COLOR_SCHEME_SELECTOR} defaultMode="system" modeStorageKey={MODE_STORAGE_KEY} />
      <AdminProviders>{children}</AdminProviders>
    </>
  );
}
```

Di `src/app/globals.css`, jadikan baris **pertama** berkas (sebelum `@import "tailwindcss";`):

```css
/* Urutan lapisan: gaya MUI (panel admin) di atas reset dasar Tailwind, di bawah utilitas. */
@layer theme, base, mui, components, utilities;
```

dan tambahkan di akhir berkas:

```css
/* Cetak dari panel admin selalu terang (spec MUI 5): teks hitam di atas putih, apa pun skemanya.
   Kelas ini dipasang di akar panel admin (AdminProviders). */
@media print {
  .cetak-terang,
  .cetak-terang * {
    color: #000 !important;
    background: transparent !important;
    border-color: #bbb !important;
    box-shadow: none !important;
  }
  body:has(.cetak-terang) {
    background: #fff !important;
  }
}
```

Di `src/app/(admin)/admin/layout.tsx`: ganti impor `Toaster` dari `@/components/ui/sonner` dengan `import { AdminToaster } from "@/components/admin/mui/admin-toaster";` dan elemen `<Toaster position="top-right" />` dengan `<AdminToaster />`.

Run: `npx vitest run tests/unit/admin-theme.test.ts tests/unit/color-mode-toggle.test.tsx tests/unit/architecture.test.ts && npx tsc --noEmit -p . && npx eslint src tests/unit`
Expected: PASS semua; tsc dan eslint bersih.

- [ ] **Step 5: Build dan situs publik tetap**

Run: `npx next build > "$WS/t1-build.log" 2>&1; echo "build exit $?"; npx playwright test tests/e2e/public-site.spec.ts tests/e2e/admin.spec.ts --project=desktop > "$WS/t1-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t1-e2e.log"`
Expected: `build exit 0`; spek publik dan admin lulus (rupa admin belum berubah selain toaster).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/color-mode.ts src/components/admin/mui src/app/\(admin\)/layout.tsx src/app/\(admin\)/admin/layout.tsx src/app/globals.css tests/unit/admin-theme.test.ts tests/unit/color-mode-toggle.test.tsx tests/unit/helpers/render-admin.tsx tests/unit/architecture.test.ts
git commit -m "feat: add Material UI foundation with SunDY light and dark themes for the admin panel"
```

---

### Task 2: Kerangka admin — tautan, chip status, tata letak halaman, menu samping, bilah atas, halaman masuk

**Files:**
- Create: `src/components/admin/mui/links.tsx`, `src/components/admin/mui/status-chip.tsx`, `src/components/admin/mui/admin-shell.tsx`, `src/components/admin/mui/dialog-close-button.tsx`
- Modify (tulis ulang dengan MUI, API sama): `src/components/admin/page-layout.tsx`, `stat-tile.tsx`, `page-tabs.tsx`, `admin-header.tsx`, `app-sidebar.tsx`, `nav-user.tsx`, `sign-in-form.tsx`, `src/app/(admin)/masuk/page.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/components/admin/live-notifier.tsx` (ikon MUI)
- Test: `tests/unit/components/page-layout.test.tsx` (tetap), `tests/unit/components/sign-in-form.test.tsx` (tetap), baru `tests/unit/components/admin-shell.test.tsx`, `tests/unit/components/app-sidebar.test.tsx`; tulis ulang `tests/e2e/admin-sidebar.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`ColorModeToggle`, `renderAdmin`).
- Produces:
  - `links.tsx` (`"use client"`): `LinkButton({ href, children, variant?, color?, size?, startIcon?, endIcon?, fullWidth?, disabled?, sx?, "aria-label"?, download? })`, `TextLink({ href, children, color?, sx?, "aria-label"?, "aria-current"? })`;
  - `status-chip.tsx` (`"use client"`): `StatusTone = "neutral" | "info" | "success" | "warning" | "error" | "primary"`, `StatusChip({ label, tone? })`;
  - `admin-shell.tsx` (`"use client"`): `AdminShell({ sidebar, userMenu?, children })`, `useAdminNav(): { openNav: () => void; userMenu?: ReactNode }`;
  - `dialog-close-button.tsx` (`"use client"`): `DialogCloseButton({ onClick })` — tombol silang di pojok kanan atas dialog bernama aksesibel "Close" (sama dengan tombol bawaan dialog shadcn lama);
  - API lama tetap: `PageHeader`, `PageBody`, `SectionCard`, `EmptyState`, `FailedSection`, `Crumb`, `StatTile`, `PageTabs`, `PageTab`, `AdminHeader({ title, heading? })`, `AppSidebar({ staff, pendingBookings?, … })`, `NAV_GROUPS`, `isNavItemVisible`, `NavItem` (kini `icon: SvgIconComponent`), `NavUser`, `SignInForm`.

- [ ] **Step 1: Tulis uji baru (gagal)**

`tests/unit/components/app-sidebar.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { renderAdmin } from "../helpers/render-admin";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/admin/booking/baru" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));

const staff = { userId: "u1", staffId: "s1", name: "Rina Resepsionis", role: "RESEPSIONIS" as const, email: "rina@sundy.test" };

describe("menu samping", () => {
  it("menu sesuai peran, menu aktif bertanda, lencana di luar tautan dengan label lengkap", () => {
    renderAdmin(<AppSidebar staff={staff} pendingBookings={3} billable={2} />);
    expect(screen.getByRole("link", { name: "SunDY Clinic" })).toHaveAttribute("href", "/admin");
    const booking = screen.getByRole("link", { name: "Booking" });
    expect(booking).toHaveAttribute("href", "/admin/booking");
    expect(booking).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dasbor" })).not.toHaveAttribute("aria-current");
    expect(screen.getByLabelText("3 booking menunggu konfirmasi")).toHaveTextContent("3");
    expect(screen.getByLabelText("2 kunjungan perlu ditagih")).toHaveTextContent("2");
    expect(screen.queryByRole("link", { name: "Stok" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Staf" })).toBeNull();
  });

  it("menu Stok tidak ikut aktif di halaman Stok obat; lencana nol tidak tampil", () => {
    pathname.value = "/admin/stok-dokter";
    renderAdmin(<AppSidebar staff={{ ...staff, role: "DOKTER" }} pendingBookings={0} />);
    expect(screen.getByRole("link", { name: "Stok obat" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByLabelText("0 booking menunggu konfirmasi")).toBeNull();
  });
});
```

`tests/unit/components/admin-shell.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminShell } from "@/components/admin/mui/admin-shell";
import { DialogCloseButton } from "@/components/admin/mui/dialog-close-button";
import { NavUser } from "@/components/admin/nav-user";
import { renderAdmin } from "../helpers/render-admin";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/admin" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));

const staff = { userId: "u1", staffId: "s1", name: "Rina Resepsionis", role: "RESEPSIONIS" as const, email: "rina@sundy.test" };

describe("kerangka admin", () => {
  it("tombol Buka menu membuka laci menu; berpindah halaman menutupnya", async () => {
    const user = userEvent.setup();
    const { rerender } = renderAdmin(
      <AdminShell sidebar={<a href="/admin/booking">Booking</a>}>
        <AdminHeader title="Dasbor" />
      </AdminShell>,
    );
    expect(document.querySelector(".MuiDrawer-modal")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Buka menu" }));
    expect(document.querySelector(".MuiDrawer-modal")).not.toBeNull();

    pathname.value = "/admin/booking";
    rerender(
      <AdminShell sidebar={<a href="/admin/booking">Booking</a>}>
        <AdminHeader title="Booking" />
      </AdminShell>,
    );
    await vi.waitFor(() => expect(document.querySelector(".MuiDrawer-modal")).toBeNull());
  });

  it("menu pengguna di bilah atas (spec MUI 4): nama, peran, email, dan Keluar", async () => {
    const user = userEvent.setup();
    renderAdmin(
      <AdminShell sidebar={<span />} userMenu={<NavUser staff={staff} />}>
        <AdminHeader title="Dasbor" />
      </AdminShell>,
    );
    const banner = screen.getByRole("banner");
    await user.click(within(banner).getByRole("button", { name: "Menu pengguna Rina Resepsionis" }));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("Rina Resepsionis");
    expect(menu).toHaveTextContent("Resepsionis · rina@sundy.test");
    expect(within(menu).getByRole("menuitem", { name: "Keluar" })).toBeInTheDocument();
  });

  it("tombol silang dialog bernama Close dan memanggil onClick", async () => {
    const onClick = vi.fn();
    renderAdmin(<DialogCloseButton onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("isi halaman ada di <main>; menu ada di navigasi Menu admin", () => {
    renderAdmin(
      <AdminShell sidebar={<a href="/admin">Dasbor</a>}>
        <p>Isi halaman</p>
      </AdminShell>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("Isi halaman");
    expect(screen.getByRole("navigation", { name: "Menu admin" })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/components/app-sidebar.test.tsx tests/unit/components/admin-shell.test.tsx`
Expected: FAIL (`admin-shell` belum ada; menu masih shadcn).

- [ ] **Step 2: Tautan, chip, kerangka**

`src/components/admin/mui/links.tsx`:

```tsx
"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import MuiLink, { type LinkProps as MuiLinkProps } from "@mui/material/Link";
import NextLink from "next/link";
import type { ReactNode } from "react";

// Tautan next/link dengan gaya MUI. Halaman server memakai ini, bukan `component={Link}`, karena
// komponen tidak boleh dikirim sebagai props dari server ke klien.

type LinkButtonProps = Pick<ButtonProps, "variant" | "color" | "size" | "startIcon" | "endIcon" | "fullWidth" | "disabled" | "sx"> & {
  href: string;
  children: ReactNode;
  "aria-label"?: string;
  /** Unduhan berkas (mis. CSV): jangkar biasa, bukan navigasi Next. */
  download?: boolean;
};

export function LinkButton({ href, children, download = false, ...props }: LinkButtonProps) {
  if (download) {
    return (
      <Button component="a" href={href} download {...props}>
        {children}
      </Button>
    );
  }
  return (
    <Button component={NextLink} href={href} {...props}>
      {children}
    </Button>
  );
}

type TextLinkProps = Pick<MuiLinkProps, "color" | "sx" | "underline"> & {
  href: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page";
};

export function TextLink({ href, children, underline = "hover", ...props }: TextLinkProps) {
  return (
    <MuiLink component={NextLink} href={href} underline={underline} {...props}>
      {children}
    </MuiLink>
  );
}
```

`src/components/admin/mui/status-chip.tsx`:

```tsx
"use client";

import Chip from "@mui/material/Chip";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "error" | "primary";

const COLOR = { neutral: "default", info: "info", success: "success", warning: "warning", error: "error", primary: "primary" } as const;

/** Lencana status (booking, tagihan, hutang, resep, stok) dengan warna dari tema, terbaca di kedua skema. */
export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return <Chip label={label} color={COLOR[tone]} variant={tone === "neutral" ? "outlined" : "filled"} />;
}
```

`src/components/admin/mui/dialog-close-button.tsx`:

```tsx
"use client";

import CloseIcon from "@mui/icons-material/Close";
import IconButton from "@mui/material/IconButton";

/**
 * Tombol silang di pojok kanan atas dialog. Dialog shadcn lama selalu punya tombol ini (bernama "Close");
 * dipertahankan supaya dialog tetap bisa ditutup dengan satu ketukan di ponsel. Taruh di dalam <Dialog>.
 */
export function DialogCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton aria-label="Close" onClick={onClick} size="small" sx={{ position: "absolute", top: 8, right: 8 }}>
      <CloseIcon fontSize="small" />
    </IconButton>
  );
}
```

`src/components/admin/mui/admin-shell.tsx`:

```tsx
"use client";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NAV_WIDTH = 264;
const AdminNavContext = createContext<{ openNav: () => void; userMenu?: ReactNode }>({ openNav: () => {} });

/** Untuk bilah atas halaman: membuka laci menu di ponsel dan menampilkan menu pengguna. Di luar AdminShell kosong. */
export function useAdminNav() {
  return useContext(AdminNavContext);
}

/**
 * Kerangka admin (spec MUI 4): menu tetap di layar lebar, laci geser di ponsel. Laci ponsel tidak dipasang
 * sampai dibuka, sehingga tautan menu tidak tampil ganda.
 */
export function AdminShell({ sidebar, userMenu, children }: { sidebar: ReactNode; userMenu?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <AdminNavContext.Provider value={{ openNav: () => setOpen(true), userMenu }}>
      <Box sx={{ display: "flex", minHeight: "100svh" }}>
        <Box component="nav" aria-label="Menu admin" className="print:hidden" sx={{ width: { md: NAV_WIDTH }, flexShrink: { md: 0 } }}>
          <Drawer
            variant="temporary"
            open={open}
            onClose={() => setOpen(false)}
            ModalProps={{ keepMounted: false }}
            sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: NAV_WIDTH, boxSizing: "border-box" } }}
          >
            {sidebar}
          </Drawer>
          <Drawer
            variant="permanent"
            open
            sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width: NAV_WIDTH, boxSizing: "border-box" } }}
          >
            {sidebar}
          </Drawer>
        </Box>
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </AdminNavContext.Provider>
  );
}
```

- [ ] **Step 3: Tata letak halaman, kotak angka, tab, bilah atas**

`src/components/admin/page-layout.tsx` (ganti seluruh isi; tanpa direktif, aman dipakai halaman server):

```tsx
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { TextLink } from "./mui/links";

export type Crumb = { label: string; href?: string };

/** Kepala halaman (spec D 3.1): satu-satunya <h1>, keterangan, jejak opsional, aksi di kanan (turun di layar sempit). */
export function PageHeader({ title, description, trail, actions }: { title: string; description?: ReactNode; trail?: Crumb[]; actions?: ReactNode }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-end" } }}>
      <Box sx={{ minWidth: 0 }}>
        {trail && trail.length > 0 && (
          <Breadcrumbs aria-label="Jejak halaman" separator="›" sx={{ fontSize: "0.875rem", mb: 0.5 }}>
            {trail.map((crumb, index) => {
              const last = index === trail.length - 1;
              return crumb.href && !last ? (
                <TextLink key={`${crumb.label}-${index}`} href={crumb.href} color="text.secondary">
                  {crumb.label}
                </TextLink>
              ) : (
                <Typography key={`${crumb.label}-${index}`} component="span" aria-current={last ? "page" : undefined} sx={{ fontSize: "inherit", color: last ? "text.primary" : "text.secondary" }}>
                  {crumb.label}
                </Typography>
              );
            })}
          </Breadcrumbs>
        )}
        <Typography variant="h1">{title}</Typography>
        {description && (
          <Typography component="div" variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

/** Jarak tepi dan lebar isi yang sama di semua halaman. Halaman kunjungan memakai `wide`. */
export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <Box sx={{ mx: "auto", width: "100%", maxWidth: wide ? "none" : 1152, p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 3 }}>
      {children}
    </Box>
  );
}

/** Kartu bagian: judul (h2), aksi kecil di kanan, lalu isi. `flush` untuk tabel yang menempel ke tepi kartu. */
export function SectionCard({
  title,
  description,
  actions,
  flush = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  /** Tidak dipakai lagi; dipertahankan agar pemanggil lama tetap terkompilasi selama migrasi (dihapus di Task 13). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card component="section" aria-label={title} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, py: 1.5, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h2" component="h2">
            {title}
          </Typography>
          {description && (
            <Typography component="div" variant="caption" sx={{ color: "text.secondary" }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", fontSize: "0.875rem" }}>
            {actions}
          </Stack>
        )}
      </Stack>
      <Divider />
      <Box sx={flush ? { minWidth: 0, overflowX: "auto" } : { minWidth: 0, p: 2 }}>{children}</Box>
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ px: 2, py: 3, textAlign: "center", color: "text.secondary" }}>
      {children}
    </Typography>
  );
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

`src/components/admin/stat-tile.tsx` (ganti seluruh isi):

```tsx
"use client";

import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import type { ReactNode } from "react";

/** Kotak angka dasbor (spec D 3.1): seluruh kotak bertautan; `attention` bergaris dan berlatar emas tipis. */
export function StatTile({ label, value, note, href, attention = false }: { label: string; value: ReactNode; note?: string | null; href: string; attention?: boolean }) {
  return (
    <Card
      sx={
        attention
          ? { borderColor: "primary.main", bgcolor: "rgba(var(--mui-palette-primary-mainChannel) / 0.08)" }
          : undefined
      }
    >
      <CardActionArea component={NextLink} href={href} data-attention={attention ? "true" : undefined} sx={{ p: 2, height: "100%", display: "block" }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {label}
        </Typography>
        <Typography component="div" sx={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "2.25rem", fontWeight: 600, lineHeight: 1.15 }}>
          {value}
        </Typography>
        {note && (
          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
            {note}
          </Typography>
        )}
      </CardActionArea>
    </Card>
  );
}
```

`src/components/admin/page-tabs.tsx` (ganti seluruh isi):

```tsx
"use client";

import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import NextLink from "next/link";

export type PageTab = { id: string; label: string; href: string };

/** Tab sebagai tautan (`?tab=`), bukan tab ARIA: setiap tab adalah alamat sendiri (spec D 3.1). */
export function PageTabs({ tabs, active, label }: { tabs: PageTab[]; active: string; label: string }) {
  return (
    <Box component="nav" aria-label={label} sx={{ borderBottom: 1, borderColor: "divider", overflowX: "auto" }}>
      <Box component="ul" sx={{ display: "flex", gap: 3, listStyle: "none", m: 0, p: 0 }}>
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <MuiLink
                component={NextLink}
                href={tab.href}
                aria-current={current ? "page" : undefined}
                underline="none"
                sx={{
                  display: "inline-block",
                  py: 1,
                  mb: "-1px",
                  borderBottom: 2,
                  borderColor: current ? "primary.main" : "transparent",
                  color: current ? "text.primary" : "text.secondary",
                  fontWeight: current ? 600 : 400,
                  fontSize: "0.875rem",
                  whiteSpace: "nowrap",
                  "&:hover": { color: "text.primary" },
                }}
              >
                {tab.label}
              </MuiLink>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}
```

`src/components/admin/admin-header.tsx` (ganti seluruh isi):

```tsx
"use client";

import MenuIcon from "@mui/icons-material/Menu";
import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { ColorModeToggle } from "./mui/color-mode-toggle";
import { useAdminNav } from "./mui/admin-shell";

/**
 * Bilah atas setiap halaman admin. Judul besar halaman ada di PageHeader (spec D 3.2), jadi judul di sini
 * bukan <h1> — kecuali halaman tanpa PageHeader (Kunjungan) yang memintanya. Berisi tombol menu (ponsel),
 * tombol mode tampilan, dan menu pengguna (spec MUI 4).
 */
export function AdminHeader({ title, heading = false }: { title: string; heading?: boolean }) {
  const { openNav, userMenu } = useAdminNav();
  return (
    <AppBar position="sticky" className="print:hidden" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.default" }}>
      <Toolbar variant="dense" sx={{ gap: 1, minHeight: 56 }}>
        <IconButton edge="start" aria-label="Buka menu" onClick={openNav} sx={{ display: { md: "none" } }}>
          <MenuIcon />
        </IconButton>
        <Typography component={heading ? "h1" : "span"} variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
          {title}
        </Typography>
        <ColorModeToggle />
        {userMenu}
      </Toolbar>
    </AppBar>
  );
}
```

- [ ] **Step 4: Menu samping, menu pengguna, layout admin**

`src/components/admin/app-sidebar.tsx`: jadikan `"use client"`; ganti impor `lucide-react` dan `@/components/ui/sidebar` dengan ikon MUI dan komponen daftar MUI; **pertahankan** `NAV_GROUPS` (format `url: "/admin…"` tetap, urutan dan judul sama), `isNavItemVisible`, props `AppSidebar`, dan objek `badges`. Pemetaan ikon: Dasbor `DashboardOutlined`, Booking `EventNoteOutlined`, Pengingat `NotificationsActiveOutlined`, Pasien `ContactsOutlined`, Jadwal `CalendarMonthOutlined`, Tagihan `ReceiptLongOutlined`, Resep `MedicationOutlined`, Stok `Inventory2Outlined`, Stok obat `LocalPharmacyOutlined`, Hutang `AccountBalanceWalletOutlined`, Pengeluaran `PaymentsOutlined`, Laporan `InsertChartOutlined`, Layanan & Harga `SpaOutlined`, Staf `GroupOutlined`, Pengaturan `SettingsOutlined`. Isi komponen:

```tsx
"use client";

import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ContactsOutlined from "@mui/icons-material/ContactsOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import EventNoteOutlined from "@mui/icons-material/EventNoteOutlined";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import InsertChartOutlined from "@mui/icons-material/InsertChartOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import LocalPharmacyOutlined from "@mui/icons-material/LocalPharmacyOutlined";
import MedicationOutlined from "@mui/icons-material/MedicationOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import SpaOutlined from "@mui/icons-material/SpaOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { CLINIC_NAME } from "@/lib/clinic";
import { can, type Capability } from "@/lib/permissions";
import type { CurrentStaff } from "@/server/session";

export type NavItem = { title: string; url: string; icon: SvgIconComponent; needs?: Capability; /** … komentar lama dipertahankan … */ hideWith?: Capability };

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  // … isi sama persis dengan versi lama, hanya `icon` memakai ikon MUI di atas …
];

export function isNavItemVisible(role: CurrentStaff["role"], item: NavItem): boolean {
  if (item.needs && !can(role, item.needs)) return false;
  if (item.hideWith && can(role, item.hideWith)) return false;
  return true;
}

/** Menu aktif: tepat alamatnya atau di bawahnya ("/admin/stok" tidak aktif di "/admin/stok-dokter"). */
function isActive(pathname: string, url: string): boolean {
  if (url === "/admin") return pathname === "/admin";
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function AppSidebar({ staff, pendingBookings = 0, reminderWork = 0, stockAlerts = 0, overduePayables = 0, billable = 0, pendingDispensing = 0 }: {
  staff: CurrentStaff;
  pendingBookings?: number;
  reminderWork?: number;
  stockAlerts?: number;
  overduePayables?: number;
  billable?: number;
  pendingDispensing?: number;
}) {
  const pathname = usePathname() ?? "";
  const badges: Record<string, { count: number; label: string }> = {
    // … sama persis dengan versi lama …
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ px: 2, py: 1.5 }}>
        <MuiLink component={NextLink} href="/admin" aria-label={CLINIC_NAME} underline="none" sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "text.primary" }}>
          <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "grid", placeItems: "center", fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 700 }}>
            S
          </Box>
          <Typography component="span" sx={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "1.25rem", fontWeight: 600, whiteSpace: "nowrap" }}>
            {CLINIC_NAME}
          </Typography>
        </MuiLink>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {NAV_GROUPS.map((group) => {
          // Menu yang tidak berhak diakses tidak ditampilkan. Ini kenyamanan, bukan keamanan.
          const visible = group.items.filter((item) => isNavItemVisible(staff.role, item));
          if (visible.length === 0) return null;
          return (
            <List key={group.title} dense subheader={<ListSubheader component="div" sx={{ bgcolor: "transparent", lineHeight: "32px" }}>{group.title}</ListSubheader>}>
              {visible.map((item) => {
                const badge = badges[item.url];
                const active = isActive(pathname, item.url);
                return (
                  <ListItem
                    key={item.url}
                    disablePadding
                    secondaryAction={badge && badge.count > 0 ? <Chip size="small" color="warning" label={badge.count} aria-label={badge.label} /> : undefined}
                  >
                    <ListItemButton component={NextLink} href={item.url} selected={active} aria-current={active ? "page" : undefined} sx={{ mx: 1, borderRadius: 2 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <item.icon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={item.title} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          );
        })}
      </Box>
    </Box>
  );
}
```

(Bagian bertanda `// … sama persis …` disalin apa adanya dari berkas lama — isinya data, bukan kode baru.)

`src/components/admin/nav-user.tsx` (ganti seluruh isi; tampil di bilah atas lewat `AdminShell userMenu`):

```tsx
"use client";

import Logout from "@mui/icons-material/Logout";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import type { CurrentStaff } from "@/server/session";

/** Menu pengguna di bilah atas (spec MUI 4): inisial, lalu nama, peran, email, dan Keluar. */
export function NavUser({ staff }: { staff: CurrentStaff }) {
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const initials = staff.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <>
      <IconButton aria-label={`Menu pengguna ${staff.name}`} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} size="small">
        <Avatar sx={{ width: 32, height: 32, fontSize: "0.8rem", bgcolor: "secondary.main", color: "secondary.contrastText" }}>{initials}</Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <Box sx={{ px: 2, py: 1, maxWidth: 280 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {staff.name}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }} noWrap>
            {STAFF_ROLE_LABEL[staff.role]} · {staff.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            await signOut();
            router.push("/masuk");
            router.refresh();
          }}
        >
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Keluar
        </MenuItem>
      </Menu>
    </>
  );
}
```

`src/app/(admin)/admin/layout.tsx`: hapus impor `SidebarInset`, `SidebarProvider`, `TooltipProvider`; impor `AdminShell` dari `@/components/admin/mui/admin-shell` dan `NavUser` dari `@/components/admin/nav-user`. Kerangka render menjadi:

```tsx
  return (
    <>
      <AdminShell
        sidebar={
          <AppSidebar staff={staff} pendingBookings={pendingBookings} reminderWork={reminderWork} stockAlerts={stockAlerts} overduePayables={overduePayables} billable={billable} pendingDispensing={pendingDispensing} />
        }
        userMenu={<NavUser staff={staff} />}
      >
        {children}
      </AdminShell>
      <AdminToaster />
      <LiveNotifier initialSince={new Date().toISOString()} role={staff.role} />
    </>
  );
```

`src/components/admin/live-notifier.tsx`: ganti `Bell`/`BellOff` (lucide) dengan `NotificationsActiveOutlined`/`NotificationsOffOutlined` (MUI) dan `Button` shadcn dengan `IconButton` MUI (`aria-label` dan `title` sama; posisi tetap `position: "fixed", bottom: 16, right: 16, zIndex: 1200, bgcolor: "background.paper", boxShadow: 2` lewat `sx`, kelas `print:hidden` tetap).

- [ ] **Step 5: Halaman masuk**

`src/components/admin/sign-in-form.tsx`: ganti bagian JSX formulir (logika tetap):

```tsx
  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={Boolean(fieldError)}
        helperText={fieldError ?? undefined}
        fullWidth
      />
      <TextField id="password" label="Kata Sandi" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
      {formError && <Alert severity="error">{formError}</Alert>}
      <Button type="submit" variant="contained" size="large" fullWidth disabled={pending}>
        {pending ? "Memproses…" : "Masuk"}
      </Button>
    </Box>
  );
```

dengan impor `Alert`, `Box`, `Button`, `TextField` dari `@mui/material` (impor shadcn dihapus).

`src/app/(admin)/masuk/page.tsx`: ganti JSX kembalian dengan:

```tsx
  return (
    <Box sx={{ minHeight: "100svh", display: "grid", placeItems: "center", px: 2, bgcolor: "background.default" }}>
      <Card sx={{ width: "100%", maxWidth: 384, p: 4 }}>
        <Typography variant="h1" sx={{ fontSize: "1.75rem" }}>
          Panel Admin
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, mb: 3 }}>
          {CLINIC_FULL_NAME}
        </Typography>
        <SignInForm />
      </Card>
    </Box>
  );
```

dengan impor `Box`, `Card`, `Typography` dari `@mui/material`.

- [ ] **Step 6: E2E menu samping**

Ganti isi `tests/e2e/admin-sidebar.spec.ts` (menu tidak lagi diciutkan menjadi kolom ikon; di ponsel menjadi laci):

```ts
import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { signIn } from "./helpers/quiz";

test("menu samping: desktop selalu tampil; ponsel lewat tombol Buka menu, tertutup setelah berpindah halaman", async ({ page, isMobile }) => {
  await signIn(page, E2E_ADMIN);
  const nav = page.getByRole("navigation", { name: "Menu admin" });
  if (isMobile) {
    await expect(page.getByRole("link", { name: "Booking", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Buka menu" }).click();
  }
  const booking = page.getByRole("link", { name: "Booking", exact: true });
  await expect(booking).toBeVisible();
  await expect(page.getByRole("link", { name: "SunDY Clinic" }).first()).toBeVisible();
  await booking.click();
  await expect(page).toHaveURL(/\/admin\/booking$/, { timeout: 30_000 });
  if (isMobile) {
    await expect(page.getByRole("link", { name: "Booking", exact: true })).toBeHidden();
  } else {
    await expect(nav.getByRole("link", { name: "Booking", exact: true })).toHaveAttribute("aria-current", "page");
  }
});
```

- [ ] **Step 7: Jalankan uji dan commit**

Run: `npx vitest run tests/unit/components/page-layout.test.tsx tests/unit/components/sign-in-form.test.tsx tests/unit/components/app-sidebar.test.tsx tests/unit/components/admin-shell.test.tsx tests/unit/stock-availability-ui.test.tsx tests/unit/admin-dashboard-page.test.tsx tests/unit/live-notifier.test.tsx tests/unit/architecture.test.ts`
Expected: PASS semua. (Bila uji lama mencari elemen dengan cara yang tidak lagi ada — mis. tiruan `@/components/ui/sidebar` — hapus tiruannya; jangan mengubah teks yang dicari.)

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t2.log" 2>&1; grep -E "Test Files|Tests " "$WS/t2.log"`
Expected: semua PASS.

Run: `npx playwright test tests/e2e/admin-sidebar.spec.ts tests/e2e/admin.spec.ts tests/e2e/dasbor.spec.ts > "$WS/t2-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t2-e2e.log"` (kedua proyek)
Expected: lulus.

```bash
git add src tests
git commit -m "feat: rebuild the admin shell, page layout, sidebar, header, and sign-in on Material UI"
```

---

### Task 3: Isian bersama — tanggal/bulan, pilihan native, rupiah, tabel data; pembantu uji; percontohan filter laporan

**Files:**
- Create: `src/lib/date-field.ts`, `src/components/admin/mui/date-field.tsx`, `src/components/admin/mui/select-field.tsx`, `src/components/admin/mui/admin-data-grid.tsx`, `tests/unit/helpers/mui.ts`, `tests/e2e/helpers/mui.ts`
- Modify: `src/components/admin/rupiah-input.tsx` (MUI, API sama + `label`/`sx`), `src/components/admin/report/report-filter.tsx` (percontohan), `tests/unit/helpers/browser-mocks.ts` (tiruan `ResizeObserver`), `tests/unit/report-filter.test.tsx`, `tests/e2e/laporan.spec.ts`
- Test: baru `tests/unit/date-field.test.ts`, `tests/unit/components/date-field.test.tsx`, `tests/unit/components/select-field.test.tsx`, `tests/unit/components/admin-data-grid.test.tsx`; ubah `tests/unit/components/rupiah-input.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`renderAdmin`, `PICKERS_LOCALE_ID` di provider), Task 2 (`EmptyState`).
- Produces:
  - `src/lib/date-field.ts`: `dateTextToDayjs(text: string): Dayjs | null`, `dayjsToDateText(value: Dayjs | null): string`, `monthTextToDayjs(text: string): Dayjs | null`, `dayjsToMonthText(value: Dayjs | null): string`, `DATE_FIELD_FORMAT = "DD/MM/YYYY"`, `MONTH_FIELD_FORMAT = "MM/YYYY"`;
  - `date-field.tsx` (`"use client"`): `DateField(props: PickerFieldProps)`, `MonthField(props: PickerFieldProps)` dengan `PickerFieldProps = { label: string; id?; name?; value?: string; defaultValue?: string; onChange?: (value: string) => void; min?: string; max?: string; disabled?; helperText?; error?; fullWidth?; sx? }`;
  - `select-field.tsx` (`"use client"`): `SelectField({ label?, "aria-label"?, id?, name?, value?, defaultValue?, onChange?: (value: string) => void, disabled?, helperText?, error?, fullWidth? = true, sx?, children })`;
  - `admin-data-grid.tsx` (`"use client"`): `AdminDataGrid<R>({ rows, columns: GridColDef<R>[], label, emptyText, initialSort?: GridSortModel, getRowId?, highlightId?: string })`, `ADMIN_GRID_PAGE_SIZE = 25`; baris DataGrid berperan `row`, sel berperan `gridcell` (bukan `cell`), judul kolom `columnheader`, tabel `grid` bernama `label`;
  - `RupiahInput({ id?, label?, value, onChange, placeholder?, "aria-label"?, sx?, fullWidth? })` (prop `className` tetap diterima selama migrasi, diabaikan; dihapus di Task 13);
  - uji unit: `dateFieldInput`, `setDateField`, `dateFieldValue`, `pickOption`, `mockGridLayout` dari `tests/unit/helpers/mui.ts`;
  - E2E: `isiTanggal(scope, label, "YYYY-MM-DD" | "YYYY-MM")`, `pilihOpsi(scope, label, teksOpsi)` dari `tests/e2e/helpers/mui.ts`.

**Catatan perilaku (berlaku untuk semua pemakai):**
- Isian tanggal memakai `DesktopDatePicker` di semua ukuran layar: tetap bisa diketik di ponsel (versi "mobile" MUI hanya bisa dipilih lewat dialog). Format tampil `DD/MM/YYYY` (bulan `MM/YYYY`), tombol kalender bernama "Pilih tanggal".
- Nama aksesibel isian tanggal ada di **kelompok** (`role="group"`), bukan di input. Uji tidak lagi memakai `getByLabelText` untuk tanggal; pakai pembantu di atas.
- `min`/`max` menjadi `minDate`/`maxDate`: kalender menonaktifkan tanggal di luar rentang dan isian bertanda galat. Nilai di luar rentang yang diketik **tetap diteruskan**, sama seperti `<input type="date">` sebelumnya; pesan galatnya tetap dari validasi yang sudah ada.
- Isian setengah jadi atau tanggal mustahil (31/02) menjadi `""`, sehingga pesan "wajib diisi" yang lama muncul.
- Untuk formulir GET/aksi, `name` dikirim lewat `<input type="hidden">` bernilai `YYYY-MM-DD`/`YYYY-MM`. Input bawaan pemilih tidak diberi `name`, supaya teks `DD/MM/YYYY` tidak ikut terkirim.
- Jangan menambah `required` pada isian MUI yang sebelumnya tidak punya. Tanda bintang mengubah teks label, sehingga `getByLabelText("…")` gagal.

- [ ] **Step 1: Uji konversi tanggal (gagal)**

`tests/unit/date-field.test.ts`:

```ts
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { dateTextToDayjs, dayjsToDateText, dayjsToMonthText, monthTextToDayjs } from "@/lib/date-field";

describe("konversi isian tanggal", () => {
  it.each(["2026-10-08", "2026-01-01", "2026-12-31", "2024-02-29"])("%s bolak-balik tanpa bergeser sehari", (text) => {
    expect(dayjsToDateText(dateTextToDayjs(text))).toBe(text);
  });

  it("teks kosong, mustahil, atau berformat lain → null", () => {
    expect(dateTextToDayjs("")).toBeNull();
    expect(dateTextToDayjs("2026-02-30")).toBeNull();
    expect(dateTextToDayjs("08/10/2026")).toBeNull();
    expect(dateTextToDayjs("2026-10-8")).toBeNull();
  });

  it("nilai kosong, tidak sah, atau tahun belum lengkap → teks kosong", () => {
    expect(dayjsToDateText(null)).toBe("");
    expect(dayjsToDateText(dayjs("bukan tanggal"))).toBe("");
    expect(dayjsToDateText(dayjs("0002-10-08", "YYYY-MM-DD"))).toBe("");
  });

  it("bulan: YYYY-MM bolak-balik; tidak sah → null/kosong", () => {
    expect(dayjsToMonthText(monthTextToDayjs("2026-10"))).toBe("2026-10");
    expect(dayjsToMonthText(monthTextToDayjs("2026-01"))).toBe("2026-01");
    expect(monthTextToDayjs("2026-13")).toBeNull();
    expect(monthTextToDayjs("")).toBeNull();
    expect(dayjsToMonthText(null)).toBe("");
  });
});
```

Run: `npx vitest run tests/unit/date-field.test.ts`
Expected: FAIL (modul `@/lib/date-field` belum ada).

- [ ] **Step 2: Pembantu konversi**

`src/lib/date-field.ts`:

```ts
import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

// Isian tanggal panel admin (spec MUI 4): nilai di aplikasi tetap teks tanggal kalender ("YYYY-MM-DD",
// bulan "YYYY-MM"); dayjs hanya dipakai pemilih. Tanpa zona waktu, jadi tidak bisa bergeser sehari.

export const DATE_FIELD_FORMAT = "DD/MM/YYYY";
export const MONTH_FIELD_FORMAT = "MM/YYYY";

function parseStrict(text: string, format: string): Dayjs | null {
  if (!text) return null;
  const value = dayjs(text, format, true);
  return value.isValid() ? value : null;
}

/** Ketikan belum selesai (tahun < 1000) dihitung kosong supaya validasi "wajib diisi" yang berlaku. */
function formatComplete(value: Dayjs | null, format: string): string {
  if (!value || !value.isValid() || value.year() < 1000) return "";
  return value.format(format);
}

export function dateTextToDayjs(text: string): Dayjs | null {
  return parseStrict(text, "YYYY-MM-DD");
}

export function dayjsToDateText(value: Dayjs | null): string {
  return formatComplete(value, "YYYY-MM-DD");
}

export function monthTextToDayjs(text: string): Dayjs | null {
  return parseStrict(text, "YYYY-MM");
}

export function dayjsToMonthText(value: Dayjs | null): string {
  return formatComplete(value, "YYYY-MM");
}
```

Run: `npx vitest run tests/unit/date-field.test.ts`
Expected: PASS.

- [ ] **Step 3: Pembantu uji unit dan tiruan ResizeObserver**

`tests/unit/helpers/mui.ts`:

```ts
import { fireEvent, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { vi } from "vitest";

type Queries = Pick<typeof screen, "getByRole">;

/**
 * Input tersembunyi isian tanggal MUI X 9. Nama aksesibel ada di kelompok (`role="group"`) berisi bagian
 * hari/bulan/tahun; input di dalamnya memuat teks terformat "DD/MM/YYYY" atau "MM/YYYY".
 */
export function dateFieldInput(label: string, scope: Queries = screen): HTMLInputElement {
  const input = scope.getByRole("group", { name: label }).querySelector("input");
  if (!input) throw new Error(`Isian tanggal "${label}" tidak punya input`);
  return input;
}

/** Mengisi DateField/MonthField dengan "YYYY-MM-DD"/"YYYY-MM", seperti pengguna mengetik tanggal lengkap. */
export function setDateField(label: string, text: string, scope: Queries = screen): void {
  const [year, month, day] = text.split("-");
  fireEvent.change(dateFieldInput(label, scope), { target: { value: day ? `${day}/${month}/${year}` : `${month}/${year}` } });
}

/** Nilai isian tanggal sebagai "YYYY-MM-DD"/"YYYY-MM"; "" bila kosong. */
export function dateFieldValue(label: string, scope: Queries = screen): string {
  const parts = dateFieldInput(label, scope).value.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  if (parts.length === 2) return `${parts[1]}-${parts[0]}`;
  return "";
}

/** Memilih opsi Autocomplete (pasien/barang). Daftar opsi tampil di portal, jadi dicari di seluruh dokumen. */
export async function pickOption(user: UserEvent, label: string, option: string | RegExp, scope: Queries = screen): Promise<void> {
  await user.click(scope.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

/**
 * jsdom tidak menghitung tata letak; DataGrid butuh ukuran agar kolom dan baris dirender.
 * Pakai `beforeEach(() => mockGridLayout())` — fungsi yang dikembalikan memulihkan tiruan.
 */
export function mockGridLayout(width = 1200, height = 800): () => void {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
  const spies = [
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(width),
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(height),
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(width),
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(height),
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect),
  ];
  return () => spies.forEach((spy) => spy.mockRestore());
}
```

Di `tests/unit/helpers/browser-mocks.ts`, dalam `installBrowserMocks()` setelah baris `scrollTo`, tambahkan:

```ts
  // DataGrid dan Popper MUI mengamati ukuran elemen; jsdom tidak punya ResizeObserver.
  if (!("ResizeObserver" in window)) {
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  }
```

(dan perbarui komentar berkas: "…matchMedia, IntersectionObserver, ResizeObserver, scrollIntoView, dan Element.scrollTo…").

- [ ] **Step 4: Uji komponen isian (gagal)**

`tests/unit/components/date-field.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DateField, MonthField } from "@/components/admin/mui/date-field";
import { dateFieldInput, dateFieldValue, setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

function Controlled({ initial = "", onValue, min, max }: { initial?: string; onValue: (value: string) => void; min?: string; max?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField label="Tanggal bayar" value={value} min={min} max={max} onChange={(next) => (setValue(next), onValue(next))} />
      <button type="button" onClick={() => setValue("2026-11-15")}>
        Ganti dari luar
      </button>
      <button type="button" onClick={() => setValue("")}>
        Kosongkan dari luar
      </button>
    </>
  );
}

describe("DateField", () => {
  it("tanggal lengkap yang diketik menjadi teks YYYY-MM-DD yang sama persis", () => {
    const onValue = vi.fn();
    renderAdmin(<Controlled onValue={onValue} />);
    setDateField("Tanggal bayar", "2026-12-31");
    expect(onValue).toHaveBeenLastCalledWith("2026-12-31");
    expect(dateFieldValue("Tanggal bayar")).toBe("2026-12-31");
    expect(screen.getByRole("button", { name: /Pilih tanggal/ })).toBeInTheDocument();
  });

  it("tanggal mustahil menjadi kosong", () => {
    const onValue = vi.fn();
    renderAdmin(<Controlled initial="2026-10-01" onValue={onValue} />);
    fireEvent.change(dateFieldInput("Tanggal bayar"), { target: { value: "31/02/2026" } });
    expect(onValue).toHaveBeenLastCalledWith("");
  });

  it("nilai dari luar mengganti dan mengosongkan isian", () => {
    renderAdmin(<Controlled initial="2026-10-01" onValue={vi.fn()} />);
    expect(dateFieldValue("Tanggal bayar")).toBe("2026-10-01");
    fireEvent.click(screen.getByRole("button", { name: "Ganti dari luar" }));
    expect(dateFieldValue("Tanggal bayar")).toBe("2026-11-15");
    fireEvent.click(screen.getByRole("button", { name: "Kosongkan dari luar" }));
    expect(dateFieldValue("Tanggal bayar")).toBe("");
  });

  it("tanggal di luar min/max tetap diteruskan (validasi tetap di aturan yang ada)", () => {
    const onValue = vi.fn();
    renderAdmin(<Controlled onValue={onValue} min="2026-10-01" max="2026-10-08" />);
    setDateField("Tanggal bayar", "2026-10-20");
    expect(onValue).toHaveBeenLastCalledWith("2026-10-20");
  });

  it("dengan name: formulir mengirim YYYY-MM-DD lewat input tersembunyi, bukan teks DD/MM/YYYY", () => {
    renderAdmin(
      <form aria-label="Filter">
        <DateField label="Dari tanggal" name="dari" defaultValue="2026-10-01" />
      </form>,
    );
    const form = screen.getByRole("form", { name: "Filter" }) as HTMLFormElement;
    expect(new FormData(form).getAll("dari")).toEqual(["2026-10-01"]);
    setDateField("Dari tanggal", "2026-10-15");
    expect(new FormData(form).getAll("dari")).toEqual(["2026-10-15"]);
  });
});

describe("MonthField", () => {
  it("bulan MM/YYYY ↔ YYYY-MM, termasuk lewat name", () => {
    const onChange = vi.fn();
    renderAdmin(
      <form aria-label="Bulan">
        <MonthField label="Bulan" name="bulan" defaultValue="2026-10" onChange={onChange} />
      </form>,
    );
    expect(dateFieldValue("Bulan")).toBe("2026-10");
    setDateField("Bulan", "2026-03");
    expect(onChange).toHaveBeenLastCalledWith("2026-03");
    expect(new FormData(screen.getByRole("form", { name: "Bulan" }) as HTMLFormElement).getAll("bulan")).toEqual(["2026-03"]);
  });
});
```

`tests/unit/components/select-field.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "@/components/admin/mui/select-field";
import { renderAdmin } from "../helpers/render-admin";

describe("SelectField", () => {
  it("tetap <select> asli berlabel; memilih memanggil onChange dengan nilai opsi", async () => {
    const onChange = vi.fn();
    renderAdmin(
      <SelectField label="Kategori" value="" onChange={onChange}>
        <option value="">Pilih kategori</option>
        <option value="kat1">Sewa</option>
      </SelectField>,
    );
    const select = screen.getByLabelText("Kategori");
    expect(select.tagName).toBe("SELECT");
    await userEvent.selectOptions(select, "kat1");
    expect(onChange).toHaveBeenCalledWith("kat1");
  });

  it("tanpa label tampil: aria-label; name ikut terkirim", () => {
    renderAdmin(
      <form aria-label="F">
        <SelectField aria-label="Cabang" name="cabang" defaultValue="b1">
          <option value="">Semua cabang</option>
          <option value="b1">Mahakeret</option>
        </SelectField>
      </form>,
    );
    expect(screen.getByLabelText("Cabang")).toHaveValue("b1");
    expect(new FormData(screen.getByRole("form", { name: "F" }) as HTMLFormElement).get("cabang")).toBe("b1");
  });
});
```

`tests/unit/components/rupiah-input.test.tsx` (sudah ada): ganti `render` dengan `renderAdmin` (impor dari `../helpers/render-admin`) dan tambahkan di `describe("RupiahInput")`:

```tsx
  it("dengan label tampil: terhubung ke isian (pengganti pasangan Label + Input lama)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<RupiahInput id="expense-amount" label="Nominal" value={null} onChange={onChange} />);
    await user.type(screen.getByLabelText("Nominal"), "5");
    expect(onChange).toHaveBeenLastCalledWith(5);
  });
```

`tests/unit/components/admin-data-grid.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GridColDef } from "@mui/x-data-grid";
import NextLink from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDataGrid } from "@/components/admin/mui/admin-data-grid";
import { mockGridLayout } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

type Row = { id: string; name: string; total: number };
const columns: GridColDef<Row>[] = [
  { field: "name", headerName: "Nama", flex: 1, minWidth: 160, renderCell: ({ row }) => <NextLink href={`/admin/x/${row.id}`}>{row.name}</NextLink> },
  { field: "total", headerName: "Total", type: "number", width: 120 },
];
const many = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, name: `Baris ${String(i + 1).padStart(3, "0")}`, total: i }));
const dataRows = () => within(screen.getByRole("grid", { name: "Daftar uji" })).getAllByRole("row").slice(1);

beforeEach(() => mockGridLayout());

describe("AdminDataGrid", () => {
  it("0 baris: teks kosong lama, tanpa tabel", () => {
    renderAdmin(<AdminDataGrid rows={[]} columns={columns} label="Daftar uji" emptyText="Tidak ada data di tampilan ini." />);
    expect(screen.getByText("Tidak ada data di tampilan ini.")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("1 baris: tautan di sel bisa diklik; tanpa kaki halaman", () => {
    renderAdmin(<AdminDataGrid rows={many(1)} columns={columns} label="Daftar uji" emptyText="-" />);
    expect(screen.getByRole("link", { name: "Baris 001" })).toHaveAttribute("href", "/admin/x/r1");
    expect(screen.queryByText(/dari 1$/)).toBeNull();
  });

  it("300 baris: 25 per halaman dengan kaki halaman berbahasa Indonesia", async () => {
    renderAdmin(<AdminDataGrid rows={many(300)} columns={columns} label="Daftar uji" emptyText="-" />);
    expect(dataRows()).toHaveLength(25);
    expect(screen.getByText("1–25 dari 300")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /halaman berikutnya/i }));
    expect(screen.getByText("26–50 dari 300")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Baris 026" })).toBeInTheDocument();
  });

  it("urut kolom: klik judul Nama dua kali → menurun", async () => {
    renderAdmin(<AdminDataGrid rows={many(3)} columns={columns} label="Daftar uji" emptyText="-" />);
    const header = screen.getByRole("columnheader", { name: /Nama/ });
    await userEvent.click(header);
    await userEvent.click(header);
    expect(dataRows()[0]).toHaveTextContent("Baris 003");
  });

  it("urutan awal dari initialSort", () => {
    renderAdmin(<AdminDataGrid rows={many(3)} columns={columns} label="Daftar uji" emptyText="-" initialSort={[{ field: "total", sort: "desc" }]} />);
    expect(dataRows()[0]).toHaveTextContent("Baris 003");
  });

  it("highlightId: tepat satu baris bertanda, halaman tempat baris itu dibuka, dan digulir ke layar", () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    renderAdmin(<AdminDataGrid rows={many(60)} columns={columns} label="Daftar uji" emptyText="-" highlightId="r40" />);
    const marked = document.querySelectorAll('[role="row"][data-highlighted="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent("Baris 040");
    expect(screen.getByText("26–50 dari 60")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
  });

  it("highlightId yang tidak ada: tidak ada baris bertanda, halaman pertama", () => {
    renderAdmin(<AdminDataGrid rows={many(30)} columns={columns} label="Daftar uji" emptyText="-" highlightId="tidak-ada" />);
    expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0);
    expect(screen.getByText("1–25 dari 30")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/components/date-field.test.tsx tests/unit/components/select-field.test.tsx tests/unit/components/rupiah-input.test.tsx tests/unit/components/admin-data-grid.test.tsx`
Expected: FAIL (modul belum ada; RupiahInput belum menerima `label`).

- [ ] **Step 5: Komponen isian dan tabel data**

`src/components/admin/mui/date-field.tsx`:

```tsx
"use client";

import type { SxProps, Theme } from "@mui/material/styles";
import { DesktopDatePicker } from "@mui/x-date-pickers/DesktopDatePicker";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import {
  DATE_FIELD_FORMAT,
  dateTextToDayjs,
  dayjsToDateText,
  dayjsToMonthText,
  MONTH_FIELD_FORMAT,
  monthTextToDayjs,
} from "@/lib/date-field";

export type PickerFieldProps = {
  label: string;
  id?: string;
  /** Untuk formulir GET/aksi: dikirim lewat input tersembunyi bernilai "YYYY-MM-DD"/"YYYY-MM". */
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
};

const KINDS = {
  date: { toDayjs: dateTextToDayjs, toText: dayjsToDateText, format: DATE_FIELD_FORMAT, views: undefined, openTo: undefined },
  month: { toDayjs: monthTextToDayjs, toText: dayjsToMonthText, format: MONTH_FIELD_FORMAT, views: ["year", "month"] as const, openTo: "month" as const },
};

/**
 * Pemilih tanggal MUI X dengan nilai teks (spec MUI 4). Nilai pemilih disimpan di sini supaya ketikan
 * setengah jadi tidak dihapus oleh nilai "" dari induk; nilai dari luar hanya diambil bila berbeda dari
 * yang sedang tampil. Desktop picker di semua layar: bisa diketik juga di ponsel.
 */
function PickerField({ kind, label, id, name, value, defaultValue, onChange, min, max, disabled, helperText, error, fullWidth, sx }: PickerFieldProps & { kind: keyof typeof KINDS }) {
  const { toDayjs, toText, format, views, openTo } = KINDS[kind];
  const [picked, setPicked] = useState<Dayjs | null>(() => toDayjs(value ?? defaultValue ?? ""));
  const [seen, setSeen] = useState(value);
  if (value !== undefined && value !== seen) {
    setSeen(value);
    if (value !== toText(picked)) setPicked(toDayjs(value));
  }

  function handleChange(next: Dayjs | null) {
    const before = toText(picked);
    setPicked(next);
    const text = toText(next);
    if (text !== before) onChange?.(text);
  }

  return (
    <>
      <DesktopDatePicker
        label={label}
        value={picked}
        onChange={handleChange}
        format={format}
        views={views ? [...views] : undefined}
        openTo={openTo}
        minDate={min ? (toDayjs(min) ?? undefined) : undefined}
        maxDate={max ? (toDayjs(max) ?? undefined) : undefined}
        disabled={disabled}
        slotProps={{ textField: { id, helperText, error, fullWidth, sx } }}
      />
      {name && <input type="hidden" name={name} value={toText(picked)} />}
    </>
  );
}

export function DateField(props: PickerFieldProps) {
  return <PickerField kind="date" {...props} />;
}

export function MonthField(props: PickerFieldProps) {
  return <PickerField kind="month" {...props} />;
}
```

`src/components/admin/mui/select-field.tsx`:

```tsx
"use client";

import type { SxProps, Theme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import type { ReactNode } from "react";

/**
 * Pilihan berbentuk TextField MUI yang tetap `<select>` asli (spec MUI 4): pilihan sistem di ponsel,
 * dan `selectOptions`/`selectOption` di uji tetap berlaku. Isi dengan `<option>`.
 */
export function SelectField({
  label,
  "aria-label": ariaLabel,
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  helperText,
  error,
  fullWidth = true,
  sx,
  children,
}: {
  label?: string;
  "aria-label"?: string;
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  return (
    <TextField
      select
      id={id}
      label={label}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      disabled={disabled}
      helperText={helperText}
      error={error}
      fullWidth={fullWidth}
      sx={sx}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true }, htmlInput: { "aria-label": ariaLabel } }}
    >
      {children}
    </TextField>
  );
}
```

`src/components/admin/mui/admin-data-grid.tsx`:

```tsx
"use client";

import Box from "@mui/material/Box";
import { DataGrid, GridRow, type GridColDef, type GridRowProps, type GridSortModel, type GridValidRowModel } from "@mui/x-data-grid";
import { idID } from "@mui/x-data-grid/locales";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { EmptyState } from "../page-layout";

export const ADMIN_GRID_PAGE_SIZE = 25;
const LOCALE_TEXT = idID.components.MuiDataGrid.defaultProps.localeText;

const HighlightContext = createContext<string | undefined>(undefined);

/** Baris DataGrid dengan `data-highlighted` untuk baris yang baru dibuat/dibuka (mis. booking dari tautan). */
function AdminGridRow(props: GridRowProps) {
  const highlightId = useContext(HighlightContext);
  return <GridRow {...props} data-highlighted={highlightId !== undefined && props.rowId === highlightId ? "true" : undefined} />;
}

/**
 * Daftar besar panel admin (spec MUI 4): urut dan saring kolom, 25 baris per halaman, di sisi klien atas
 * baris yang sudah disaring server. Virtualisasi mati supaya semua baris halaman ada di DOM (pembaca layar,
 * cetak, uji). Daftar kosong memakai teks kosong lama, bukan lapisan bawaan DataGrid.
 * `highlightId` (tanpa `initialSort`): baris itu bertanda, halamannya dibuka, dan digulir ke tengah layar.
 */
export function AdminDataGrid<R extends GridValidRowModel>({
  rows,
  columns,
  label,
  emptyText,
  initialSort,
  getRowId,
  highlightId,
}: {
  rows: readonly R[];
  columns: GridColDef<R>[];
  /** Nama aksesibel tabel. */
  label: string;
  emptyText: ReactNode;
  initialSort?: GridSortModel;
  getRowId?: (row: R) => string;
  highlightId?: string;
}) {
  const highlightIndex = highlightId === undefined ? -1 : rows.findIndex((row) => String(getRowId ? getRowId(row) : row.id) === highlightId);

  useEffect(() => {
    if (highlightIndex >= 0) document.querySelector('[role="row"][data-highlighted="true"]')?.scrollIntoView({ block: "center" });
  }, [highlightIndex]);

  if (rows.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <HighlightContext.Provider value={highlightIndex >= 0 ? highlightId : undefined}>
      <Box sx={{ width: "100%", minWidth: 0 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={getRowId}
          label={label}
          localeText={LOCALE_TEXT}
          autoHeight
          disableVirtualization
          disableRowSelectionOnClick
          getRowHeight={() => "auto"}
          initialState={{
            pagination: { paginationModel: { page: highlightIndex >= 0 ? Math.floor(highlightIndex / ADMIN_GRID_PAGE_SIZE) : 0, pageSize: ADMIN_GRID_PAGE_SIZE } },
            sorting: { sortModel: initialSort ?? [] },
          }}
          pageSizeOptions={[ADMIN_GRID_PAGE_SIZE]}
          hideFooter={rows.length <= ADMIN_GRID_PAGE_SIZE}
          slots={{ row: AdminGridRow }}
          sx={{
            border: 0,
            "& .MuiDataGrid-cell": { py: 1, display: "flex", alignItems: "center" },
            "& .MuiDataGrid-row[data-highlighted='true']": { bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.16)" },
          }}
        />
      </Box>
    </HighlightContext.Provider>
  );
}
```

`src/components/admin/rupiah-input.tsx` (ganti seluruh isi):

```tsx
"use client";

import type { SxProps, Theme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import { parseRupiahText, rupiahInputText } from "@/lib/rupiah-input";

/** Masukan harga: diketik sebagai angka, tampil "Rp 189.000"; yang diteruskan tetap angka bulat (spec D 5.4). */
export function RupiahInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  sx,
  fullWidth,
  "aria-label": ariaLabel,
}: {
  id?: string;
  label?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  /** Sisa API lama; diabaikan (dihapus di Task 13). */
  className?: string;
  sx?: SxProps<Theme>;
  fullWidth?: boolean;
  "aria-label"?: string;
}) {
  return (
    <TextField
      id={id}
      label={label}
      placeholder={placeholder}
      autoComplete="off"
      value={rupiahInputText(value)}
      onChange={(event) => onChange(parseRupiahText(event.target.value))}
      fullWidth={fullWidth}
      sx={sx}
      slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": ariaLabel } }}
    />
  );
}
```

Run: `npx vitest run tests/unit/date-field.test.ts tests/unit/components/date-field.test.tsx tests/unit/components/select-field.test.tsx tests/unit/components/rupiah-input.test.tsx tests/unit/components/admin-data-grid.test.tsx`
Expected: PASS. Bila DataGrid tidak merender baris di jsdom meski `mockGridLayout` aktif, periksa dulu apakah `ResizeObserver` tiruan terpasang dan `autoHeight` aktif. Bila tetap kosong, tambahkan ukuran pada tiruan (mis. `scrollWidth`/`scrollHeight`) di `mockGridLayout`, lalu catat `Ruling:`. Jangan melemahkan harapan uji.

- [ ] **Step 6: Percontohan — filter laporan**

Ganti JSX `ReportFilter` (logika sama) di `src/components/admin/report/report-filter.tsx`; hapus `selectClass`, impor `Button`/`Input` shadcn:

```tsx
  return (
    <Form action="/admin/laporan">
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        <SelectField name="periode" label="Periode" value={preset} onChange={(value) => setPreset(value as ReportPreset)} fullWidth={false} sx={{ minWidth: 180 }}>
          {REPORT_PRESETS.map((value) => (
            <option key={value} value={value}>
              {REPORT_PRESET_LABEL[value]}
            </option>
          ))}
        </SelectField>
        <DateField name="dari" label="Dari tanggal" defaultValue={period.from} onChange={() => setPreset("RENTANG")} sx={{ width: 180 }} />
        <DateField name="sampai" label="Sampai tanggal" defaultValue={period.to} onChange={() => setPreset("RENTANG")} sx={{ width: 180 }} />
        <SelectField name="cabang" label="Cabang" defaultValue={branchId ?? ""} fullWidth={false} sx={{ minWidth: 180 }}>
          <option value="">Semua cabang</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="outlined" sx={{ height: 40 }}>
          Tampilkan
        </Button>
      </Stack>
    </Form>
  );
```

dengan impor `Button` dan `Stack` dari `@mui/material`, `DateField` dari `../mui/date-field`, dan `SelectField` dari `../mui/select-field`.

Di `tests/unit/report-filter.test.tsx`: ganti `render` dengan `renderAdmin` (impor dari `./helpers/render-admin`). Pada uji pertama, ganti tiga baris `const from = …`, `userEvent.clear(from)`, dan `userEvent.type(from, "2026-10-05")` dengan `setDateField("Dari tanggal", "2026-10-05");` (impor dari `./helpers/mui`). Judul dan harapan uji tetap.

`tests/e2e/helpers/mui.ts`:

```ts
import { expect, type Locator, type Page } from "@playwright/test";

type Scope = Page | Locator;
const pageOf = (scope: Scope): Page => ("keyboard" in scope ? scope : scope.page());

/**
 * Mengisi DateField/MonthField seperti pengguna: klik bagian pertama, lalu ketik angka (hari, bulan,
 * tahun berpindah sendiri). `text` berformat "YYYY-MM-DD" atau "YYYY-MM".
 */
export async function isiTanggal(scope: Scope, label: string, text: string): Promise<void> {
  const [year, month, day] = text.split("-");
  const shown = day ? `${day}/${month}/${year}` : `${month}/${year}`;
  const group = scope.getByRole("group", { name: label, exact: true });
  await group.getByRole("spinbutton").first().click();
  await pageOf(scope).keyboard.type(shown.replaceAll("/", ""));
  await expect(group.locator("input")).toHaveValue(shown);
}

/** Memilih opsi Autocomplete (pasien/barang): ketik teks opsi, lalu klik opsi yang sama persis. */
export async function pilihOpsi(scope: Scope, label: string, option: string): Promise<void> {
  const input = scope.getByRole("combobox", { name: label, exact: true });
  await input.click();
  await input.fill(option);
  await pageOf(scope).getByRole("option", { name: option, exact: true }).click();
  await expect(input).toHaveValue(option);
}
```

Di `tests/e2e/laporan.spec.ts`, impor `isiTanggal` dari `./helpers/mui`, lalu tepat setelah baris `await expect(page).toHaveURL(/periode=TAHUN_INI/, { timeout: 30_000 });` tambahkan:

```ts
  await isiTanggal(page, "Dari tanggal", "2026-10-02");
  await expect(page.getByLabel("Periode")).toHaveValue("RENTANG");
  await page.getByRole("button", { name: "Tampilkan" }).click();
  await expect(page).toHaveURL(/periode=RENTANG&dari=2026-10-02&sampai=/, { timeout: 30_000 });
```

- [ ] **Step 7: Jalankan dan commit**

Run: `npx vitest run tests/unit/report-filter.test.tsx tests/unit/report-ui.test.tsx && npx tsc --noEmit -p . && npx eslint src tests`
Expected: PASS; bersih.

Run: `npx playwright test tests/e2e/laporan.spec.ts > "$WS/t3-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t3-e2e.log"` (desktop dan ponsel)
Expected: lulus di kedua proyek (isian tanggal bisa diketik di ponsel).

Run: `npx vitest run > "$WS/t3.log" 2>&1; grep -E "Test Files|Tests " "$WS/t3.log"`
Expected: PASS semua.

```bash
git add src/lib/date-field.ts src/components/admin/mui src/components/admin/rupiah-input.tsx src/components/admin/report/report-filter.tsx tests/unit tests/e2e/helpers/mui.ts tests/e2e/laporan.spec.ts
git commit -m "feat: add admin date, month, select, rupiah fields and a data grid on Material UI"
```

---

### Task 4: Pencarian dengan saran — barang dan pasien (Autocomplete)

**Files:**
- Create: `src/components/admin/mui/item-autocomplete.tsx`
- Modify: `src/components/admin/patient-picker.tsx` (Autocomplete asinkron; API `PatientPicker({ onSelect })` dan `PatientBookingInfo({ patient })` tetap)
- Test: baru `tests/unit/components/item-autocomplete.test.tsx`; ubah `tests/unit/components/patient-picker.test.tsx`, `tests/unit/components/appointment-form.test.tsx` (cara memilih pasien)

**Interfaces:**
- Consumes: Task 3 (`pickOption`), Task 1 (`renderAdmin`).
- Produces:
  - `ItemOption = { id: string; code: string; name: string; unit?: string; available?: number }`;
  - `ItemAutocomplete({ label?, "aria-label"?, id?, items: ItemOption[], value: string, onChange: (itemId: string) => void, showStock?: boolean, disabled?, sx? })`. Teks opsi persis sama dengan `<option>` lama: `"{name} ({code})"`, atau dengan `showStock` `"{name} ({code}) — sisa {available} {unit}"`. Dengan `showStock`, barang bersisa ≤ 0 tidak bisa dipilih. Nilai `""` berarti belum memilih.
  - `PatientPicker`: combobox berlabel "Cari pasien (nama, WhatsApp, atau nomor RM)", opsi `role="option"` berisi nama, RM · WhatsApp, dan `PatientBookingInfo`; "Mencari…" / "Tidak ada pasien yang cocok."; `NewPatientForm` ("+ Pasien Baru") tetap di bawahnya.

- [ ] **Step 1: Uji (gagal)**

`tests/unit/components/item-autocomplete.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ItemAutocomplete, type ItemOption } from "@/components/admin/mui/item-autocomplete";
import { pickOption } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

const items: ItemOption[] = [
  { id: "vit", code: "VIT-01", name: "Vitamin C", unit: "tablet", available: 10 },
  { id: "kos", code: "SRM-02", name: "Serum Kosong", unit: "botol", available: 0 },
];

function Harness({ showStock, onChange }: { showStock?: boolean; onChange: (id: string) => void }) {
  const [value, setValue] = useState("");
  return <ItemAutocomplete label="Barang" items={items} value={value} showStock={showStock} onChange={(id) => (setValue(id), onChange(id))} />;
}

describe("ItemAutocomplete", () => {
  it("teks opsi sama dengan pilihan lama; memilih meneruskan id barang", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<Harness onChange={onChange} />);
    await pickOption(user, "Barang", "Vitamin C (VIT-01)");
    expect(onChange).toHaveBeenLastCalledWith("vit");
    expect(screen.getByRole("combobox", { name: "Barang" })).toHaveValue("Vitamin C (VIT-01)");
  });

  it("dengan sisa stok: sisa tampil dan barang habis tidak bisa dipilih", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness showStock onChange={vi.fn()} />);
    await user.click(screen.getByRole("combobox", { name: "Barang" }));
    expect(await screen.findByRole("option", { name: "Vitamin C (VIT-01) — sisa 10 tablet" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: "Serum Kosong (SRM-02) — sisa 0 botol" })).toHaveAttribute("aria-disabled", "true");
  });

  it("mencari lewat kode; tanpa hasil → 'Tidak ada barang yang cocok.'", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Barang" });
    await user.type(input, "srm");
    expect(await screen.findByRole("option", { name: "Serum Kosong (SRM-02)" })).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "zzz");
    expect(await screen.findByText("Tidak ada barang yang cocok.")).toBeInTheDocument();
  });

  it("menghapus pilihan meneruskan id kosong", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<Harness onChange={onChange} />);
    await pickOption(user, "Barang", "Vitamin C (VIT-01)");
    await user.clear(screen.getByRole("combobox", { name: "Barang" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
```

Di `tests/unit/components/patient-picker.test.tsx`: ganti `render` dengan `renderAdmin` (impor dari `../helpers/render-admin`); ganti `findByRole("button", { name: /Maria Wenas/ })` dan `getByRole("button", { name: /Maria Baru/ })` dengan `findByRole("option", …)` / `getByRole("option", …)`. Tambahkan dua uji:

```tsx
  it("memilih opsi memanggil onSelect dengan pasien itu", async () => {
    const maria = patient({});
    vi.mocked(searchPatients).mockResolvedValue([maria]);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<PatientPicker onSelect={onSelect} />);
    await user.type(screen.getByRole("combobox", { name: /Cari pasien/ }), "maria");
    await user.click(await screen.findByRole("option", { name: /Maria Wenas/ }));
    expect(onSelect).toHaveBeenCalledWith(maria);
  });

  it("tanpa hasil atau galat jaringan → 'Tidak ada pasien yang cocok.'", async () => {
    vi.mocked(searchPatients).mockRejectedValue(new Error("jaringan"));
    const user = userEvent.setup();
    renderAdmin(<PatientPicker onSelect={vi.fn()} />);
    await user.type(screen.getByRole("combobox", { name: /Cari pasien/ }), "zzz");
    expect(await screen.findByText("Tidak ada pasien yang cocok.")).toBeInTheDocument();
  });
```

Di `tests/unit/components/appointment-form.test.tsx`: ganti `render` dengan `renderAdmin`; dalam `fillBooking`, ganti `findByRole("button", { name: /Maria Wenas/ })` dengan `findByRole("option", { name: /Maria Wenas/ })`. Baris 152 (`getByLabelText(/Cari pasien/)` bernilai `""`) tetap.

Run: `npx vitest run tests/unit/components/item-autocomplete.test.tsx tests/unit/components/patient-picker.test.tsx tests/unit/components/appointment-form.test.tsx`
Expected: FAIL (`item-autocomplete` belum ada; hasil pasien masih tombol).

- [ ] **Step 2: Implementasi**

`src/components/admin/mui/item-autocomplete.tsx`:

```tsx
"use client";

import Autocomplete from "@mui/material/Autocomplete";
import type { SxProps, Theme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";

export type ItemOption = { id: string; code: string; name: string; unit?: string; available?: number };

/** Teks opsi sama persis dengan `<option>` lama, supaya kebiasaan staf dan uji tetap berlaku. */
export function itemOptionLabel(item: ItemOption, showStock: boolean): string {
  const base = `${item.name} (${item.code})`;
  return showStock ? `${base} — sisa ${item.available ?? 0} ${item.unit ?? ""}`.trimEnd() : base;
}

/**
 * Pilih barang dengan pencarian nama/kode (spec MUI 4): barang masuk, tambah barang tagihan, tambah obat
 * resep. Dengan `showStock`, barang tanpa sisa tetap tampil tetapi tidak bisa dipilih.
 */
export function ItemAutocomplete({
  label,
  "aria-label": ariaLabel,
  id,
  items,
  value,
  onChange,
  showStock = false,
  disabled,
  sx,
}: {
  label?: string;
  "aria-label"?: string;
  id?: string;
  items: ItemOption[];
  value: string;
  onChange: (itemId: string) => void;
  showStock?: boolean;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}) {
  const selected = items.find((item) => item.id === value) ?? null;
  return (
    <Autocomplete
      id={id}
      options={items}
      value={selected}
      onChange={(_, item) => onChange(item?.id ?? "")}
      getOptionLabel={(item) => itemOptionLabel(item, showStock)}
      getOptionDisabled={(item) => showStock && (item.available ?? 0) <= 0}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText="Tidak ada barang yang cocok."
      disabled={disabled}
      fullWidth
      sx={sx}
      renderInput={(params) => (
        <TextField {...params} label={label} slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": ariaLabel } }} />
      )}
    />
  );
}
```

(Bila `params.slotProps` belum ada di versi terpasang dan `renderInput` masih memakai `params.inputProps`, gabungkan `"aria-label"` ke `inputProps` dan catat `Ruling:`.)

`src/components/admin/patient-picker.tsx`: `PatientBookingInfo` memakai `Typography` (`variant="caption"`, `component="span"`, `display: "block"`, `color: "text.secondary"`) dan bagian booking berikutnya `color: "warning.main"`, `fontWeight: 500`; teks tetap. `PatientPicker` (logika debounce 250 ms dan "hanya permintaan terakhir" tetap):

```tsx
export function PatientPicker({ onSelect }: { onSelect: (patient: PatientSummary) => void }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ query: "", patients: [] });
  const latestRequest = useRef(0);
  const trimmed = query.trim();

  useEffect(() => {
    // … isi efek pencarian sama persis dengan versi lama …
  }, [trimmed]);

  const settled = trimmed !== "" && search.query === trimmed;
  const results = settled ? search.patients : [];

  return (
    <Stack spacing={1.5}>
      <Autocomplete<PatientSummary, false, false, false>
        id="patient-search"
        options={results}
        value={null}
        inputValue={query}
        onInputChange={(_, next, reason) => reason !== "reset" && setQuery(next)}
        onChange={(_, patient) => patient && onSelect(patient)}
        // Penyaringan dilakukan server (nama, WhatsApp, RM); jangan disaring ulang di sini.
        filterOptions={(options) => options}
        getOptionLabel={(patient) => patient.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        open={trimmed !== ""}
        loading={trimmed !== "" && !settled}
        loadingText="Mencari…"
        noOptionsText="Tidak ada pasien yang cocok."
        renderOption={({ key, ...props }, patient) => (
          <li key={key} {...props}>
            <span>
              <Typography component="span" sx={{ fontWeight: 500 }}>
                {patient.name}
              </Typography>
              <Typography component="span" sx={{ ml: 1, color: "text.secondary" }}>
                {patient.medicalRecordNumber} · {patient.whatsapp}
              </Typography>
              <PatientBookingInfo patient={patient} />
            </span>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Cari pasien (nama, WhatsApp, atau nomor RM)" placeholder="Ketik untuk mencari…" />}
      />
      <NewPatientForm onCreated={onSelect} onPickExisting={onSelect} />
    </Stack>
  );
}
```

dengan impor `Autocomplete`, `Stack`, `TextField`, `Typography` dari `@mui/material`; impor shadcn `Input`/`Label` dihapus. (`NewPatientForm` dimigrasikan di Task 6; sampai saat itu ia tetap shadcn.)

Run: `npx vitest run tests/unit/components/item-autocomplete.test.tsx tests/unit/components/patient-picker.test.tsx tests/unit/components/appointment-form.test.tsx`
Expected: PASS.

- [ ] **Step 3: Jalankan dan commit**

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t4.log" 2>&1; grep -E "Test Files|Tests " "$WS/t4.log"`
Expected: PASS semua.

Run: `npx playwright test tests/e2e/admin-booking.spec.ts tests/e2e/tagihan.spec.ts > "$WS/t4-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t4-e2e.log"`
Expected: lulus (alur "+ Pasien Baru" tidak berubah).

```bash
git add src/components/admin/mui/item-autocomplete.tsx src/components/admin/patient-picker.tsx tests/unit
git commit -m "feat: search patients and stock items with Material UI autocomplete"
```

---

## Resep konversi (berlaku untuk Task 5–12)

Task 5–12 memindahkan sekitar 110 berkas dengan pola yang sama. Supaya rencana tetap bisa dibaca, setiap tugas modul berisi **daftar berkas, catatan khusus modul, dan perubahan uji**. Kode tiap berkas tidak ditulis ulang di sini; konversinya mengikuti resep ini. Logika (state, aksi server, validasi, teks) **tidak boleh berubah**; yang berubah hanya elemen tampilan.

**R1 — Impor.** Hapus impor `@/components/ui/*`, `lucide-react`, dan `cn` bila hanya dipakai untuk kelas. Impor MUI per komponen (`import Button from "@mui/material/Button";`), ikon dari `@mui/icons-material/<Nama>`. Pembantu bersama dari `src/components/admin/mui/*` (Task 1–4).

**R2 — Tata letak dan teks** (satuan Tailwind 4px → satuan MUI 8px):

| Tailwind | MUI |
|---|---|
| `space-y-1/2/3/4/6` | `<Stack spacing={0.5/1/1.5/2/3}>` |
| `flex flex-wrap items-center gap-2` | `<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>` |
| `flex items-center justify-between` | `<Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>` |
| `grid gap-4 sm:grid-cols-2` (`lg:grid-cols-3`) | `<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" } }}>` |
| `text-sm text-muted-foreground` | `<Typography variant="body2" sx={{ color: "text.secondary" }}>` |
| `text-xs text-muted-foreground` | `<Typography variant="caption" sx={{ color: "text.secondary" }}>` (tambah `component="div"` bila sebelumnya `div`) |
| `font-medium` / `font-semibold` | `fontWeight: 500` / `600` |
| `font-mono text-xs` | `sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}` |
| `font-display text-3xl` | `sx={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "1.875rem", fontWeight: 600 }}` |
| `text-destructive` / `text-red-*` | `color: "error.main"` |
| `text-amber-*` | `color: "warning.main"` |
| `text-emerald-*` / `text-green-*` | `color: "success.main"` |
| `bg-amber-50/100`, `bg-cream-*` sebagai sorotan | `bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.08)"` (atau `primary`/`error` sesuai makna) |
| `border rounded-lg p-3` (kotak) | `<Paper variant="outlined" sx={{ p: 1.5 }}>` |
| `sr-only` | `sx={visuallyHidden}` (`import { visuallyHidden } from "@mui/utils";`) |
| `line-through` | `textDecoration: "line-through"` |

Jangan menulis warna heksadesimal di komponen. Jangan memakai `primary.main` sebagai warna **teks** (emas terlalu terang di latar krem); pakai `text.primary`/`text.secondary` atau warna status. Elemen semantik tetap: `<p role="alert">` → `<Alert severity="error">` (perannya tetap `alert`, teksnya sama); `<dl>/<dt>/<dd>`, `<ul>/<li>`, `<nav aria-label>`, `<section aria-label>` tetap memakai elemen yang sama (`Box component="dl"` dst.). Kelas `print:hidden` boleh tetap sebagai `className` pada elemen MUI.

**R3 — Halaman server** (`page.tsx` tanpa `"use client"`): boleh memakai `Box`, `Stack`, `Typography`, `Paper`, `Card`, `CardContent`, `Divider`, `Alert` (tanpa `onClose`), `Chip` (tanpa `onClick`/`onDelete`), dan keluarga `Table`. Props hanya nilai yang bisa diserialisasi: string, angka, boolean, elemen, dan `sx` berupa objek tanpa fungsi. Tautan: `LinkButton`/`TextLink` (Task 2). Selebihnya pindahkan ke komponen klien modul. Halaman server tidak mengimpor fungsi atau konstanta dari berkas `"use client"` (aturan arsitektur yang sudah ada).

**R4 — Tombol:**

| shadcn | MUI |
|---|---|
| `<Button>` (bawaan) | `<Button variant="contained">` |
| `variant="outline"` | `variant="outlined"` |
| `variant="ghost"` / `variant="link"` | `variant="text"` |
| `variant="destructive"` | `variant="contained" color="error"` |
| `variant="secondary"` | `variant="outlined" color="secondary"` |
| `size="sm"` / `size="lg"` | `size="small"` / `size="large"` |
| `size="icon"` | `<IconButton aria-label="…">` dengan ikon MUI |
| `asChild` + `<Link href>` | `<LinkButton href=… variant=…>` (di komponen klien boleh juga `component={NextLink}`) |
| `asChild` + `<a href download>` | `<LinkButton href=… download>` |

`type`, `disabled`, `onClick`, `aria-label`, `aria-pressed`, dan teks tombol tetap.

**R5 — Isian:**
- `<Label htmlFor="x">Teks</Label><Input id="x" … />` → `<TextField id="x" label="Teks" fullWidth … />`. `value`/`onChange` sama. `type="number"`, `min`, `max`, `step`, `inputMode`, `maxLength`, `autoComplete`, `pattern` → `slotProps={{ htmlInput: { … } }}`.
- Hanya `aria-label` (tanpa label tampil) → `slotProps={{ htmlInput: { "aria-label": "…" } }}`. Untuk `aria-describedby`, perlakukan sama.
- Keterangan di bawah isian (`<p className="text-xs …">`) → `helperText`.
- `<textarea>` → `<TextField multiline minRows={…}>` (baris sama dengan `rows` lama).
- `type="time"` → `<TextField type="time" slotProps={{ inputLabel: { shrink: true } }}>`. Nilainya tetap `"HH:MM"`.
- `type="date"`/`"month"` → `DateField`/`MonthField` (Task 3), `min`/`max`/`name` sama.
- `<select>` asli dan Select Radix → `SelectField` (Task 3, tetap `<select>` asli). Pilihan barang dan pasien → `ItemAutocomplete`/`PatientPicker` (Task 4).
- Harga → `RupiahInput` dengan `label`.
- Kotak centang `<input type="checkbox">` + label → `<FormControlLabel control={<Checkbox checked={…} onChange={(e) => …(e.target.checked)} />} label="Teks" />`.
- Kelompok radio → `<FormControl><FormLabel id="…">Judul</FormLabel><RadioGroup aria-labelledby="…" value onChange>` dengan `FormControlLabel control={<Radio />}`.
- Tombol pilihan dengan `aria-pressed` → `<ToggleButtonGroup exclusive value onChange aria-label="…">` + `<ToggleButton value=…>` (MUI menulis `aria-pressed` sendiri; teks sama). Bila pilihan boleh kosong, jangan pakai `exclusive` + `onChange` yang menolak `null`.
- **Jangan** menambah `required` yang sebelumnya tidak ada (tanda bintang mengubah teks label).

**R6 — Dialog.** Pemicu (`DialogTrigger asChild`) menjadi tombol biasa dengan `onClick={() => setOpen(true)}`. `onOpenChange(next)` dipecah: buka di tombol, tutup di `onClose`, dengan logika pembersihan yang sama. Struktur:

```tsx
<Dialog open={open} onClose={close}>
  <DialogTitle sx={{ pr: 6 }}>Judul sama</DialogTitle>
  <DialogCloseButton onClick={close} />
  <DialogContent>
    <DialogContentText>Deskripsi sama (bila ada)</DialogContentText>
    <Stack spacing={2} sx={{ pt: 1 }}>{/* isian */}</Stack>
  </DialogContent>
  <DialogActions>{/* tombol footer */}</DialogActions>
</Dialog>
```

MUI menyambungkan `DialogTitle` ke `aria-labelledby` dialog, jadi `getByRole("dialog", { name: "Judul" })` tetap berlaku. `AlertDialog` → `Dialog` yang sama dengan `slotProps={{ paper: { role: "alertdialog" } }}`, tanpa `DialogCloseButton`. Tombol batal tetap ada dengan teks sama. `DialogCloseButton` (Task 2) menggantikan tombol silang bawaan shadcn yang bernama "Close". Formulir di dalam dialog tetap `<form onSubmit>` (`<Box component="form">`).

**R7 — Tabel kecil** (bukan 12 daftar DataGrid): `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` shadcn → MUI `Table size="small"` / **`TableHead`** / `TableBody` / `TableRow` / **`TableCell`** / `TableCell`. Awas, namanya bertukar: `TableHead` shadcn adalah sel judul, sedangkan `TableHead` MUI adalah `<thead>`. `className="text-right"` → `align="right"`. Bungkus dengan `<TableContainer>` agar bisa digulir mendatar di dalam kartunya. `aria-label`/`<caption>` tabel tetap. Peran `table`/`row`/`cell`/`columnheader` tetap sama.

**R8 — Daftar DataGrid** (12 daftar spec 4). Komponen tabel menjadi `"use client"` dan memakai `AdminDataGrid` (Task 3). Kolom `GridColDef<Row>[]` ditulis di tingkat modul bila tidak bergantung props; bila bergantung, pakai `useMemo`. Untuk setiap kolom:
- `field` = kunci baris (atau nama bebas untuk kolom turunan), `headerName` = teks judul kolom lama persis.
- Lebar: `flex: 1, minWidth: 140` (teks), `width: 120` (angka/tanggal).
- Nilai urut: `valueGetter: (_value, row) => …`. Tanggal: `type: "dateTime"`, `valueGetter` mengembalikan `Date`. Uang/angka: `type: "number", align: "right", headerAlign: "right"`.
- Isi sel lama → `renderCell: ({ row }) => …` dengan elemen MUI yang sama maknanya (tautan `TextLink`/`NextLink`, chip, teks kecil).
- Kolom aksi: `sortable: false, filterable: false, disableColumnMenu: true, headerName` lama (kosong boleh `""`).
- Teks keadaan kosong = teks `EmptyState` lama → prop `emptyText`. Baris jumlah di bawah tabel (mis. "Total …") menjadi `Typography` di bawah grid dengan teks yang sama.
- Uji yang merender daftar ini menambah `beforeEach(() => mockGridLayout())`. Peran sel menjadi `gridcell`: ganti `getByRole("cell", …)` dengan `getByRole("gridcell", …)`. Jumlah `row` tetap termasuk satu baris judul.
- **Kontrol yang diketik di dalam sel DataGrid tidak dipakai** (DataGrid menangkap tombol panah/Enter). Daftar yang punya isian per baris tetap memakai tabel MUI biasa (R7).

**R9 — Lencana status** (`Badge`) → `StatusChip` (Task 2) dengan teks sama. Nada: `default` → `"primary"`, `secondary` → `"info"`, `destructive` → `"error"`, `outline` → `"neutral"`; kecuali status selesai/lunas (`LUNAS`, `FINAL`, `SELESAI`, `DISERAHKAN`, staf aktif) → `"success"`, dan peringatan waktu (`Terlambat`, `Perlu waktu baru`, kedaluwarsa) → `"error"`; menipis → `"warning"`.

**R10 — Ikon** lucide → MUI: `EllipsisIcon` → `MoreHoriz`, `Lock` → `LockOutlined`, `Search` → `Search`, `Bell`/`BellOff` → `NotificationsActiveOutlined`/`NotificationsOffOutlined`, `LogOut` → `Logout`.

**R11 — Cetak.** Semua halaman admin tercetak terang lewat kelas `cetak-terang` di akar panel (Task 1), jadi halaman cetak (tagihan final, etiket) tidak perlu kelas tambahan. Tombol dan bilah yang tidak ikut dicetak tetap `className="print:hidden"`. Menu samping dan bilah atas sudah `print:hidden` (Task 2).

**R12 — Uji.**
- Ganti `render` dengan `renderAdmin` (`tests/unit/helpers/render-admin.tsx`) di uji yang merender komponen yang sudah MUI.
- Teks yang dicari **tidak berubah**. Yang boleh berubah hanya cara mencari: tanggal → `setDateField`/`dateFieldValue`/`dateFieldInput`; Select Radix → `userEvent.selectOptions`; pilihan barang → `pickOption`; sel DataGrid → `gridcell`; atribut Radix `data-state`/`data-disabled` → `toBeChecked()`/`toBeDisabled()`/`aria-*`.
- Setiap perubahan cara mencari dicatat di ledger sebagai `Task <N>: uji disesuaikan: <berkas> — <apa>`. Perubahan yang mengubah harapan (yang diuji) adalah `Ruling:`.
- E2E: `selectOption` di `<select>` asli tetap; Autocomplete → `pilihOpsi`; tanggal → `isiTanggal`; `tr[...]` → `[role="row"][...]`.

**R13 — Gerbang per modul.** Mulai Task 5, `tests/unit/architecture.test.ts` punya daftar `MUI_MIGRATED`. Setiap tugas modul **pertama-tama** menambahkan berkasnya ke daftar itu, lalu memastikan uji gagal (RED: berkas masih mengimpor shadcn). Uji lulus setelah konversi (GREEN). Task 13 mengganti daftar dengan aturan untuk seluruh admin.

**R14 — Bukti tiap modul.** Uji unit berkas modul, `tsc`, `eslint`, seluruh suite unit, dan E2E modul di **kedua** proyek (desktop dan ponsel). Lalu foto halaman modul: `FOTO_ADMIN=1 FOTO_HALAMAN=<path tepat, atau awalan diakhiri *> npx playwright test <spek E2E modul> tests/e2e/zz-foto-admin.spec.ts --workers=1`. Persiapan E2E mengosongkan data setiap putaran; dengan satu worker Playwright menjalankan berkas menurut abjad, jadi spek foto (`zz-`) berjalan terakhir dan halaman detail punya data dari spek modul. Hasilnya terang dan gelap, desktop dan ponsel. Buka foto dengan alat Read (bisa membaca JPEG) dan perbaiki yang janggal: teks tak terbaca di gelap, isian terpotong, gulir mendatar. Catat perbaikan visual di ledger.

---

### Task 5: Modul Dasbor, Pengaturan, Layanan & Harga, Staf + gerbang per modul + foto halaman

**Files:**
- Modify (resep R1–R12): `src/app/(admin)/admin/page.tsx`, `src/components/admin/dashboard-numbers.tsx`, `src/components/admin/dashboard-work.tsx`, `src/components/admin/schedule-timeline.tsx`, `src/components/admin/clinic-setting-form.tsx`, `src/components/admin/online-service-card.tsx`, `src/components/admin/service-price-table.tsx`, `src/components/admin/staff-table.tsx` (DataGrid "Staf")
- Create: `src/components/admin/booking-source-chart.tsx`, `tests/e2e/helpers/admin-pages.ts`, `tests/e2e/zz-foto-admin.spec.ts`
- Tidak berubah (sudah hanya memakai komponen tata letak): `src/app/(admin)/admin/{pengaturan,layanan,staf}/page.tsx`
- Test: `tests/unit/architecture.test.ts` (gerbang `MUI_MIGRATED`), `tests/unit/admin-dashboard-page.test.tsx`, `tests/unit/components/{dashboard-numbers,dashboard-work,schedule-timeline,clinic-setting-form,online-service-card,service-price-table,staff-table}.test.tsx`
- E2E: `tests/e2e/dasbor.spec.ts`, `tests/e2e/admin.spec.ts`, `tests/e2e/tampilan-admin.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`StatTile`, `SectionCard`, `TextLink`, `LinkButton`, `StatusChip`), Task 3 (`SelectField`, `RupiahInput`, `AdminDataGrid`, `mockGridLayout`), Task 1 (`SUNDY`, `DARK` dari tema).
- Produces: `MUI_MIGRATED` di `tests/unit/architecture.test.ts` (diperpanjang Task 6–12); `BookingSourceChart({ bySource })`; `ADMIN_PAGES`, `AdminPage`, `resolveAdminPage(page, target)` dari `tests/e2e/helpers/admin-pages.ts`; `tests/e2e/zz-foto-admin.spec.ts` (dipakai R14 dan Task 13).

- [ ] **Step 1: Gerbang per modul (RED)**

Di `tests/unit/architecture.test.ts`, dalam `describe("batasan arsitektur")`, tambahkan:

```ts
  // Rencana MUI (Task 5–12): berkas admin yang sudah pindah ke MUI tidak boleh kembali memakai shadcn,
  // lucide, atau kelas warna Tailwind (warna tetap tidak ikut mode gelap). Setiap tugas modul menambah
  // berkasnya ke sini sebelum konversi. Task 13 menggantinya dengan aturan untuk seluruh panel admin.
  const MUI_MIGRATED = [
    // Task 2–4
    "src/app/(admin)/admin/layout.tsx",
    "src/app/(admin)/masuk/page.tsx",
    "src/components/admin/admin-header.tsx",
    "src/components/admin/app-sidebar.tsx",
    "src/components/admin/live-notifier.tsx",
    "src/components/admin/nav-user.tsx",
    "src/components/admin/page-layout.tsx",
    "src/components/admin/page-tabs.tsx",
    "src/components/admin/patient-picker.tsx",
    "src/components/admin/report/report-filter.tsx",
    "src/components/admin/rupiah-input.tsx",
    "src/components/admin/sign-in-form.tsx",
    "src/components/admin/stat-tile.tsx",
    // Task 5
    "src/app/(admin)/admin/page.tsx",
    "src/app/(admin)/admin/layanan/page.tsx",
    "src/app/(admin)/admin/pengaturan/page.tsx",
    "src/app/(admin)/admin/staf/page.tsx",
    "src/components/admin/booking-source-chart.tsx",
    "src/components/admin/clinic-setting-form.tsx",
    "src/components/admin/dashboard-numbers.tsx",
    "src/components/admin/dashboard-work.tsx",
    "src/components/admin/online-service-card.tsx",
    "src/components/admin/schedule-timeline.tsx",
    "src/components/admin/service-price-table.tsx",
    "src/components/admin/staff-table.tsx",
  ];
  const SHADCN_OR_FIXED_COLOR =
    /from "@\/components\/ui\/|from "lucide-react"|["'`][^"'`\n]*\b(?:text|bg|border|fill|stroke|ring)-(?:muted|foreground|primary|secondary|destructive|accent|card|background|input|amber|emerald|stone|red|green|gold|brown|cream|white|black)\b/;

  it("berkas admin yang sudah pindah ke MUI tidak memakai shadcn, lucide, atau kelas warna Tailwind", () => {
    const offenders = MUI_MIGRATED.filter((file) => !existsSync(file) || SHADCN_OR_FIXED_COLOR.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
```

Run: `npx vitest run tests/unit/architecture.test.ts`
Expected: FAIL. Daftar pelanggar berisi berkas Task 5: `page.tsx` dasbor masih mengimpor `@/components/ui/button`, `booking-source-chart.tsx` belum ada, dst. Berkas Task 2–4 **tidak boleh** muncul. Bila muncul, perbaiki dulu (sisa kelas warna) sebelum lanjut, dan catat di ledger.

- [ ] **Step 2: Sesuaikan dan tambah uji (RED)**

- Semua uji di daftar Test: `render` → `renderAdmin`. Hapus tiruan `@/components/ui/sidebar` di `admin-dashboard-page.test.tsx`.
- `admin-dashboard-page.test.tsx` uji pertama: ganti dua baris `closest("div.grid")`/`className` dengan:

```tsx
    const grid = screen.getByRole("region", { name: "Pasien hari ini" }).closest("[data-columns]");
    expect(grid).toHaveAttribute("data-columns", "1");
```

- `staff-table.test.tsx`: tambahkan `beforeEach(() => mockGridLayout())` dan ganti `toHaveAttribute("data-slot", "badge")` dengan `expect(within(diane).getByText("Dokter").closest(".MuiChip-root")).not.toBeNull();`.
- `dashboard-numbers.test.tsx`: tambahkan ke uji pertama:

```tsx
    expect(within(card).getByRole("img", { name: "Grafik booking per sumber: Situs 9, WhatsApp 10, Telepon 2, Walk-in 2" })).toBeInTheDocument();
```

Run: `npx vitest run tests/unit/admin-dashboard-page.test.tsx tests/unit/components/dashboard-numbers.test.tsx tests/unit/components/staff-table.test.tsx`
Expected: FAIL (`data-columns`, grafik, dan chip belum ada).

- [ ] **Step 3: Konversi**

Ikuti resep R1–R12. Catatan modul:
- **Dasbor `page.tsx`** (server): tombol "+ Booking Baru" → `<LinkButton href="/admin/booking/baru" variant="contained">+ Booking Baru</LinkButton>`. Kisi daftar dokter + Angka:

```tsx
          <Box
            data-columns={worklist && numbers ? "2" : "1"}
            sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: worklist && numbers ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" } }}
          >
```

  (`minmax(0, 1fr)` tetap: tanpa itu tabel daftar dokter melebarkan halaman di ponsel). Hapus impor `cn` dan `Button`.
- **`dashboard-numbers.tsx`** (server): `Figure` → `Stack spacing={0.5}` dengan `Typography` (resep R2, angka besar dengan huruf Cormorant). Pilihan periode tetap `<nav aria-label="Periode angka">` berisi `TextLink` dengan `aria-current`; yang aktif `sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 600 }}`, yang lain `color: "text.secondary"`, keduanya `px: 1, py: 0.5, borderRadius: 1.5, fontSize: "0.75rem"`. Daftar `dl` tetap. Tepat sebelum `dl`, sisipkan `<BookingSourceChart bySource={current.bySource} />`.
- **`booking-source-chart.tsx`** (baru):

```tsx
"use client";

import Box from "@mui/material/Box";
import { useColorScheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import type { DashboardNumbers } from "@/server/dashboard";
import { DARK, SUNDY } from "./mui/theme";

type BySource = DashboardNumbers["current"]["bySource"];
const SOURCES: [keyof BySource, string][] = [
  ["SITUS", "Situs"],
  ["WHATSAPP", "WhatsApp"],
  ["TELEPON", "Telepon"],
  ["WALK_IN", "Walk-in"],
];

/**
 * Batang kecil booking per sumber di kartu Angka (spec MUI 4). Pelengkap visual: angka yang sama tetap
 * tertulis di bawahnya, dan nama aksesibelnya memuat semua angka.
 */
export function BookingSourceChart({ bySource }: { bySource: BySource }) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const label = `Grafik booking per sumber: ${SOURCES.map(([key, name]) => `${name} ${bySource[key]}`).join(", ")}`;
  return (
    <Box role="img" aria-label={label} sx={{ width: "100%", height: 150, mt: 2 }}>
      <BarChart
        height={150}
        layout="horizontal"
        yAxis={[{ scaleType: "band", data: SOURCES.map(([, name]) => name), width: 76 }]}
        xAxis={[{ tickMinStep: 1 }]}
        series={[{ data: SOURCES.map(([key]) => bySource[key]), label: "Booking", color: dark ? DARK.primary : SUNDY.gold600 }]}
        hideLegend
        margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
      />
    </Box>
  );
}
```

  (Emas `gold600` di skema terang memenuhi kontras grafik 3:1 terhadap kartu putih. Bila nama prop di MUI X Charts terpasang berbeda — mis. `hideLegend` — sesuaikan dengan dokumentasi versi itu dan catat `Ruling:`.)
- **`dashboard-work.tsx`, `schedule-timeline.tsx`**: hanya resep (tautan → `TextLink`/`NextLink`, `role="listitem"`/`aria-label` lajur tetap, warna status menurut R2).
- **`clinic-setting-form.tsx`**: pasangan Label+Input → `TextField`; "Biaya booking" → `RupiahInput` dengan `id="booking-fee" label="Biaya booking"`; bagian tetap `SectionCard` (wilayah bernama).
- **`online-service-card.tsx`**: "Durasi" → `SelectField label="Durasi"`; kotak "Aktifkan konsultasi online" → `FormControlLabel` + `Checkbox` (nama aksesibel sama); harga → `RupiahInput id="online-price" label="Harga Konsultasi Online"`.
- **`service-price-table.tsx`**: daftar harga berisi isian per baris → **tabel MUI biasa (R7)**, bukan DataGrid. Pencarian `TextField type="search"` dengan `slotProps.htmlInput["aria-label"] = "Cari layanan"` (peran `searchbox` tetap). Pilihan kategori → `ToggleButtonGroup exclusive aria-label="Kategori"` (nilai `"semua"` untuk "Semua"; `aria-pressed` ditulis MUI). Tombol Simpan/Batal per baris tetap di sel terakhir.
- **`staff-table.tsx`** → `"use client"` + `AdminDataGrid label="Daftar staf" emptyText="Belum ada staf."`. Kolom: `name` "Nama" (tebal), `role` "Peran" (`StatusChip` tone neutral, label `STAFF_ROLE_LABEL`), `showOnWebsite` "Tampil di situs" (`"Ya"`/`"Tidak"`), `isActive` "Status" (`StatusChip` "Aktif" success / "Nonaktif" neutral). Bila `EmptyState` lama memakai teks lain, pakai teks lama.

`tests/e2e/helpers/admin-pages.ts` (baru; dipakai skrip foto dan uji tampilan di Task 13):

```ts
import type { Page } from "@playwright/test";

/** Halaman detail dicari lewat tautan pertama (`link`) di halaman `from`, atau lewat halaman perantara (`via`). */
export type AdminPage = { path: string; from?: string; via?: string; link?: string };

/** Ke-26 halaman panel admin (spec MUI 1). `/masuk` diuji terpisah karena perlu keadaan belum masuk. */
export const ADMIN_PAGES: AdminPage[] = [
  { path: "/admin" },
  { path: "/admin/booking" },
  { path: "/admin/booking/baru" },
  { path: "/admin/pengingat" },
  { path: "/admin/pasien" },
  { path: "/admin/pasien/[id]", from: "/admin/pasien", link: 'a[href^="/admin/pasien/"]' },
  { path: "/admin/kunjungan/[id]", from: "/admin/pasien", via: 'a[href^="/admin/pasien/"]', link: 'a[href^="/admin/kunjungan/"]' },
  { path: "/admin/isian/[id]", from: "/admin/pasien", via: 'a[href^="/admin/pasien/"]', link: 'a[href^="/admin/isian/"]' },
  { path: "/admin/jadwal" },
  { path: "/admin/tagihan" },
  { path: "/admin/tagihan/[id]", from: "/admin/tagihan?lihat=BELUM_LUNAS", link: 'a[href^="/admin/tagihan/"]' },
  { path: "/admin/resep" },
  { path: "/admin/resep/[id]", from: "/admin/resep", link: 'a[href^="/admin/resep/"]' },
  { path: "/admin/resep/[id]/etiket", from: "/admin/resep", via: 'a[href^="/admin/resep/"]', link: 'a[href$="/etiket"]' },
  { path: "/admin/stok" },
  { path: "/admin/stok/barang/[id]", from: "/admin/stok", link: 'a[href^="/admin/stok/barang/"]' },
  { path: "/admin/stok/masuk/[id]", from: "/admin/stok?tab=masuk", link: 'a[href^="/admin/stok/masuk/"]' },
  { path: "/admin/stok/masuk/baru" },
  { path: "/admin/stok-dokter" },
  { path: "/admin/hutang" },
  { path: "/admin/pengeluaran" },
  { path: "/admin/laporan" },
  { path: "/admin/layanan" },
  { path: "/admin/staf" },
  { path: "/admin/pengaturan" },
  { path: "/admin/stok?tab=supplier" },
];

async function firstHref(page: Page, from: string, selector: string): Promise<string | null> {
  await page.goto(from);
  await page.waitForLoadState("networkidle");
  return page.locator(selector).first().getAttribute("href", { timeout: 3_000 }).catch(() => null);
}

/** Alamat sebenarnya untuk sebuah halaman; `null` bila data contohnya belum ada (mis. belum ada resep). */
export async function resolveAdminPage(page: Page, target: AdminPage): Promise<string | null> {
  if (!target.from) return target.path;
  if (!target.via) return firstHref(page, target.from, target.link!);
  await page.goto(target.from);
  await page.waitForLoadState("networkidle");
  const hops = await page.locator(target.via).evaluateAll((links) => links.slice(0, 10).map((a) => a.getAttribute("href")));
  for (const hop of hops) {
    const href = hop && (await firstHref(page, hop, target.link!));
    if (href) return href;
  }
  return null;
}
```

(Detail tagihan diambil dari tampilan "Belum lunas" (`?lihat=BELUM_LUNAS`), yang memuat tagihan final berikut pembayarannya. Ke-26 baris = 25 halaman + tab supplier di halaman stok.)

`tests/e2e/zz-foto-admin.spec.ts` (baru):

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { ADMIN_PAGES, resolveAdminPage } from "./helpers/admin-pages";
import { signIn } from "./helpers/quiz";

// Foto halaman admin untuk tinjauan visual (rencana MUI: R14 dan Task 13). Tidak ikut uji biasa: hanya
// jalan dengan FOTO_ADMIN=1. Nama berawalan zz- supaya berjalan terakhir bila dijalankan bersama spek lain
// dengan --workers=1 (Playwright mengurutkan berkas menurut abjad), sehingga halaman detail sudah punya data. FOTO_HALAMAN = path dipisah koma; path tepat ("/admin") atau awalan berakhiran *
// ("/admin/tagihan*" = daftar dan detail tagihan).

test.skip(!process.env.FOTO_ADMIN, "Hanya untuk foto tinjauan (FOTO_ADMIN=1).");
test.setTimeout(900_000);

const OUT = process.env.FOTO_DIR ?? ".superpowers/sdd/2026-10-08-plan-admin-mui/foto";
const MODE_KEY = "sundy-mode-admin";
const slug = (path: string) => path.replace(/^\/admin\/?/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "dasbor";

test("foto halaman admin di kedua skema", async ({ page }, testInfo) => {
  const only = (process.env.FOTO_HALAMAN ?? "").split(",").filter(Boolean);
  const targets = ADMIN_PAGES.filter(
    (t) => only.length === 0 || only.some((p) => (p.endsWith("*") ? t.path.startsWith(p.slice(0, -1)) : t.path === p)),
  );
  const missing: string[] = [];
  const errors: string[] = [];
  page.on("console", (message) => message.type() === "error" && errors.push(`${page.url()}: ${message.text()}`));
  await signIn(page, E2E_ADMIN);
  for (const scheme of ["light", "dark"] as const) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [MODE_KEY, scheme] as const);
    const dir = join(OUT, testInfo.project.name, scheme);
    mkdirSync(dir, { recursive: true });
    for (const target of targets) {
      const href = await resolveAdminPage(page, target);
      if (!href) {
        missing.push(`${scheme} ${target.path}`);
        continue;
      }
      await page.goto(href);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute(`data-${scheme}`, "");
      await page.screenshot({ path: join(dir, `${slug(target.path)}.jpg`), type: "jpeg", quality: 70, fullPage: true });
    }
  }
  writeFileSync(join(OUT, `${testInfo.project.name}-catatan.txt`), [`Tidak ditemukan: ${missing.join("; ") || "-"}`, ...errors].join("\n"));
});
```

(Dengan `colorSchemeSelector: "data"`, MUI 9 menulis atribut kosong `data-light` atau `data-dark` di `<html>` — sudah diperiksa di kode `@mui/system` 9.4.)

- [ ] **Step 4: Jalankan uji modul (GREEN)**

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/admin-dashboard-page.test.tsx tests/unit/components/dashboard-numbers.test.tsx tests/unit/components/dashboard-work.test.tsx tests/unit/components/schedule-timeline.test.tsx tests/unit/components/clinic-setting-form.test.tsx tests/unit/components/online-service-card.test.tsx tests/unit/components/service-price-table.test.tsx tests/unit/components/staff-table.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t5.log" 2>&1; grep -E "Test Files|Tests " "$WS/t5.log"`
Expected: PASS semua.

- [ ] **Step 5: E2E dan foto**

Run: `npx playwright test tests/e2e/dasbor.spec.ts tests/e2e/admin.spec.ts tests/e2e/tampilan-admin.spec.ts > "$WS/t5-e2e.log" 2>&1; grep -E "passed|failed|skipped" "$WS/t5-e2e.log"`
Expected: lulus di desktop dan ponsel.

Run: `FOTO_ADMIN=1 FOTO_HALAMAN=/admin,/admin/layanan,/admin/staf,/admin/pengaturan npx playwright test tests/e2e/zz-foto-admin.spec.ts > "$WS/t5-foto.log" 2>&1; ls "$WS"/foto/*/*/`
Expected: foto `dasbor`, `layanan`, `staf`, `pengaturan` ada untuk `light`/`dark` × `desktop`/`mobile`. Buka dengan Read dan periksa menurut R14.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: move the dashboard, settings, services, and staff pages to Material UI with a bookings-by-source chart"
```

---

### Task 6: Modul Pasien, isian kuis, NIK, cocokkan pasien, food recall

**Files:**
- Modify (resep): `src/app/(admin)/admin/pasien/page.tsx`, `src/app/(admin)/admin/pasien/[id]/page.tsx`, `src/app/(admin)/admin/isian/[id]/page.tsx`, `src/components/admin/{patient-detail-view,patient-note-forms,new-patient-form,nik-form,nik-input,intake-view,intake-clinical-content,intake-approval-form,match-patient-dialog,food-recall-table,food-recall-link-panel,food-recall-dialog}.tsx`
- Create: `src/components/admin/patient-table.tsx` (DataGrid "Pasien")
- Test: `tests/unit/architecture.test.ts` (tambah berkas Task 6 ke `MUI_MIGRATED`), baru `tests/unit/components/patient-table.test.tsx`; sesuaikan `tests/unit/components/{patient-detail-view,nik-form,intake-view,intake-clinical-content,intake-approval-form,food-recall-dialog,patient-picker}.test.tsx`
- E2E: `tests/e2e/admin.spec.ts`, `tests/e2e/check-in.spec.ts`, `tests/e2e/public-registration.spec.ts`, `tests/e2e/tampilan-admin.spec.ts`

**Interfaces:**
- Consumes: Task 2–5 (`MUI_MIGRATED`, `AdminDataGrid`, `StatusChip`, `TextLink`, `LinkButton`, `SelectField`, `DateField`, `DialogCloseButton`, `mockGridLayout`).
- Produces: `PatientTable({ patients: PatientTableRow[], emptyText: string })` dengan `PatientTableRow = PatientSummary & { programLabel: string }`. `patient-detail-view.tsx` **tetap tanpa direktif** karena halaman server mengimpor `PATIENT_PROGRAM_LABEL` darinya; konstanta dari berkas `"use client"` dilarang aturan arsitektur.

- [ ] **Step 1: Gerbang dan uji baru (RED)**

Tambahkan ke `MUI_MIGRATED` (di bawah komentar `// Task 6`): ketiga halaman, `patient-table.tsx`, dan ke-12 komponen di daftar Files. `tests/unit/components/patient-table.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PatientTable, type PatientTableRow } from "@/components/admin/patient-table";
import { mockGridLayout } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

const row = (patch: Partial<PatientTableRow>): PatientTableRow => ({
  id: "p1",
  medicalRecordNumber: "SDY-2026-0012",
  name: "Maria Wenas",
  whatsapp: "6281234567001",
  programStatus: "AKTIF",
  programLabel: "Aktif",
  lastVisitAt: null,
  nextBookingAt: null,
  ...patch,
});

beforeEach(() => mockGridLayout());

describe("PatientTable", () => {
  it("nama bertautan ke detail, program sebagai chip, kunjungan kosong tertulis —", () => {
    renderAdmin(<PatientTable patients={[row({})]} emptyText="Belum ada pasien." />);
    expect(screen.getByRole("grid", { name: "Daftar pasien" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Maria Wenas" })).toHaveAttribute("href", "/admin/pasien/p1");
    expect(screen.getByText("Aktif").closest(".MuiChip-root")).not.toBeNull();
    const cells = screen.getAllByRole("gridcell");
    expect(cells.some((cell) => cell.textContent === "—")).toBe(true);
  });

  it("kosong: teks dari halaman", () => {
    renderAdmin(<PatientTable patients={[]} emptyText="Tidak ada pasien yang cocok dengan “zzz”." />);
    expect(screen.getByText("Tidak ada pasien yang cocok dengan “zzz”.")).toBeInTheDocument();
  });
});
```

Sesuaikan uji yang ada menurut R12. Uji yang merender dialog dengan tanggal (mis. tanggal lahir) memakai `setDateField`/`dateFieldValue`.

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/components/patient-table.test.tsx`
Expected: FAIL (gerbang menyebut berkas Task 6; `patient-table` belum ada).

- [ ] **Step 2: Konversi**

Catatan modul:
- **`pasien/page.tsx`** (server): formulir cari tetap `<Box component="form" action="/admin/pasien" role="search" sx={{ display: "flex", gap: 1 }}>` berisi `TextField name="q" defaultValue={query} placeholder="Cari nama, WhatsApp, atau No. RM"` dengan `slotProps={{ htmlInput: { "aria-label": "Cari pasien" }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}` dan `sx={{ width: { xs: "100%", sm: 288 } }}`, lalu `<Button type="submit" variant="outlined" size="small">Cari</Button>`. Tabel → `<PatientTable patients={patients.map((p) => ({ ...p, programLabel: PATIENT_PROGRAM_LABEL[p.programStatus] }))} emptyText={query ? `Tidak ada pasien yang cocok dengan “${query}”.` : "Belum ada pasien."} />`.
- **`patient-table.tsx`** (baru, `"use client"`): `AdminDataGrid label="Daftar pasien"`. Kolom: `medicalRecordNumber` "No. RM" (huruf mono), `name` "Nama" (`TextLink` ke `/admin/pasien/{id}`), `whatsapp` "WhatsApp", `programStatus` "Program" (`StatusChip label={row.programLabel} tone={row.programStatus === "AKTIF" ? "primary" : "neutral"}`), `lastVisitAt` "Kunjungan terakhir" (`type: "dateTime"`, tampil `formatDateWithYear` atau "—"), `nextBookingAt` "Booking berikutnya" (`type: "dateTime"`, tampil `${formatShortIndonesianDate(d)} · ${minutesToTimeLabel(witaMinutesOfDay(d))}` atau "—"). Tanpa `initialSort` (urutan server).
- **`pasien/[id]/page.tsx`**: "+ Booking" → `LinkButton href={`/admin/booking/baru?pasien=${patient.id}`} variant="contained"`.
- **`patient-detail-view.tsx`**: tabel kunjungan → tabel MUI (R7); tautan → `TextLink`; tanpa direktif.
- **`nik-input.tsx`**: dua isian (NIK, alasan) → `TextField` + `SelectField label="Alasan"` (teks opsi tetap). Dipakai juga `check-in-dialog` (Task 7): API komponen tidak berubah.
- **`intake-clinical-content.tsx`, `food-recall-table.tsx`**: tabel kecil (R7). Nama tabel (`aria-label`) dan judul kolom tetap.
- **`match-patient-dialog.tsx`, `food-recall-dialog.tsx`**: R6. `food-recall-link-panel.tsx`: tombol salin/kirim (R4).
- **`new-patient-form.tsx`**: tombol "+ Pasien Baru" membuka formulir. Isian Nama/Nomor WhatsApp/(jenis kelamin → `SelectField`)/(tanggal lahir → `DateField` bila ada). Tombol "Buat Pasien" tetap.

- [ ] **Step 3: Uji modul (GREEN)**

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/components/patient-table.test.tsx tests/unit/components/patient-detail-view.test.tsx tests/unit/components/nik-form.test.tsx tests/unit/components/intake-view.test.tsx tests/unit/components/intake-clinical-content.test.tsx tests/unit/components/intake-approval-form.test.tsx tests/unit/components/food-recall-dialog.test.tsx tests/unit/components/patient-picker.test.tsx tests/unit/components/check-in-dialog.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t6.log" 2>&1; grep -E "Test Files|Tests " "$WS/t6.log"`
Expected: PASS semua.

- [ ] **Step 4: E2E dan foto**

Run: `npx playwright test tests/e2e/admin.spec.ts tests/e2e/check-in.spec.ts tests/e2e/public-registration.spec.ts tests/e2e/tampilan-admin.spec.ts > "$WS/t6-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t6-e2e.log"`
Expected: lulus di kedua proyek.

Run: `FOTO_ADMIN=1 FOTO_HALAMAN='/admin/pasien*,/admin/isian*' npx playwright test tests/e2e/check-in.spec.ts tests/e2e/public-registration.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1 > "$WS/t6-foto.log" 2>&1`, lalu periksa fotonya (R14).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: move patients, intake review, NIK, patient matching, and food recall to Material UI"
```

---

### Task 7: Modul Booking — daftar, booking baru, filter, pita tanggal, check-in, ubah jadwal, pesan WhatsApp, link kuis

**Files:**
- Modify (resep): `src/app/(admin)/admin/booking/page.tsx`, `src/app/(admin)/admin/booking/baru/page.tsx`, `src/components/admin/{appointment-form,appointment-table,appointment-status-badge,booking-created-panel,booking-dialogs,booking-filters,booking-summary,date-strip,slot-picker,reschedule-dialog,check-in-dialog,send-message-dialog,message-actions,whatsapp-send-button,quiz-link-dialog}.tsx`
- Test: `tests/unit/architecture.test.ts` (`// Task 7`); sesuaikan `tests/unit/components/{appointment-form,appointment-table,booking-created-panel,booking-summary,check-in-dialog,date-strip,reschedule-dialog,send-message-dialog,whatsapp-send-button,quiz-link-dialog}.test.tsx`
- E2E (sesuaikan): `tests/e2e/admin-booking.spec.ts`, `tests/e2e/dasbor.spec.ts`, `tests/e2e/link-kuis.spec.ts`, `tests/e2e/pengingat.spec.ts`; jalankan juga `check-in.spec.ts`, `gizi-klinik.spec.ts`, `public-registration.spec.ts`, `online-consultation.spec.ts`

**Interfaces:**
- Consumes: Task 2–6 (`AdminDataGrid` dengan `highlightId`, `StatusChip`, `SelectField`, `DateField`, `PatientPicker`, `DialogCloseButton`, `LinkButton`, `isiTanggal`).
- Produces: `AppointmentTable({ rows, canReadRecords, highlightId?: string | null, emptyText?: string })` — props lama tetap; `emptyText` bawaan `"Tidak ada booking."`. `AppointmentStatusBadge` kini `StatusChip`.

- [ ] **Step 1: Gerbang dan penyesuaian uji (RED)**

Tambahkan ke `MUI_MIGRATED` (`// Task 7`): kedua halaman dan ke-15 komponen. Sesuaikan uji menurut R12, dengan butir khusus berikut:
- `appointment-table.test.tsx`: `beforeEach(() => mockGridLayout())`. Pemilih `[data-highlighted="true"]` tetap (kini ada di `div[role="row"]`). Uji menu "Aksi lain" tetap (`menuitem`). Tambahkan satu uji: daftar kosong menampilkan `"Tidak ada booking."`.
- `appointment-form.test.tsx`: baris 145 `toHaveAttribute("data-disabled")` → `toBeDisabled()` (Tenaga kini `<select>` asli yang dinonaktifkan; komentar di atasnya disesuaikan). Pilihan Tenaga/Cabang Radix yang diklik → `userEvent.selectOptions`.
- `date-strip.test.tsx`: `fireEvent.change(getByLabelText("Tanggal lain"), …)` → `setDateField("Tanggal lain", "2026-11-02")`.
- `check-in-dialog.test.tsx`: `queryByLabelText("Tanggal lahir")` (tidak ada) → `queryByRole("group", { name: "Tanggal lahir" })`.

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/components/appointment-table.test.tsx tests/unit/components/appointment-form.test.tsx tests/unit/components/date-strip.test.tsx`
Expected: FAIL (gerbang menyebut berkas Task 7; uji yang disesuaikan belum cocok dengan komponen lama).

- [ ] **Step 2: Konversi**

Catatan modul:
- **`appointment-table.tsx`** → `AdminDataGrid label="Daftar booking"` dengan `highlightId={highlightId ?? undefined}` dan `emptyText`. Hapus `highlightRef` dan efek `scrollIntoView` lama, karena `AdminDataGrid` yang menggulir. Kolom (isi sel = isi `TableCell` lama menurut R2/R9):
  - `timeLabel` "Jam" (`minWidth: 130`; jendela waktu online, chip "Online", chip "Perlu waktu baru" tone error, kode mono, label tenggat `error.main`/`warning.main`);
  - `patientName` "Pasien" (`flex: 1, minWidth: 200`; tautan ke pasien, chip "Belum dicocokkan"/"Belum punya isian lengkap" neutral, RM · sumber, catatan);
  - `serviceName` "Layanan" (`minWidth: 140`);
  - `staffName` "Tenaga" (`minWidth: 140`; nama + cabang);
  - `status` "Status" (`valueGetter: (_v, row) => STATUS_LABEL[row.status]`; `AppointmentStatusBadge` + catatan isian/food recall/pesan);
  - `actions` "Aksi" (`sortable: false, filterable: false, disableColumnMenu: true, minWidth: 220`; tombol aksi utama tetap, menu lain → `IconButton aria-label={`Aksi lain ${row.code}`}` dengan ikon `MoreHoriz` + `Menu`/`MenuItem` (item "Batalkan" `sx={{ color: "error.main" }}`)).
  - Dialog batal → R6 versi `alertdialog` (judul `Batalkan booking {code}?`, tombol "Kembali" dan aksi merah).
- **`appointment-status-badge.tsx`**: `StatusChip` dengan nada `MENUNGGU_KONFIRMASI` neutral, `TERKONFIRMASI` primary, `HADIR` info, `SELESAI` success, `DIBATALKAN`/`TIDAK_HADIR` error, `KEDALUWARSA` neutral.
- **`booking/page.tsx`** (server): "+ Booking Baru", "Kembali ke daftar per tanggal", "Hari ini", dan panah hari → `LinkButton` (panah: `aria-label` "Hari sebelumnya"/"Hari berikutnya", isi `‹`/`›` atau ikon `ChevronLeft`/`ChevronRight`). Formulir cari tetap `next/form` (`Form` adalah komponen, boleh di server) dengan `TextField name="cari"` (`key`, `defaultValue`, label/`aria-label` lama) dan `Button type="submit" variant="outlined"`.
- **`booking-filters.tsx`**: tanggal → `DateField id="filter-date" label="Tanggal" value={date} onChange={(v) => v && update("tanggal", v)}`; empat Select Radix → `SelectField` (`id` dan label sama; nilai `ALL` tetap sebagai opsi pertama).
- **`date-strip.tsx`**: tombol hari → `ToggleButton`/`Button` dengan `aria-pressed` sama; "Tanggal lain" → `DateField id="booking-date-other" label="Tanggal lain" min={today} value={inStrip ? "" : selected} onChange={(v) => v && onSelect(v)}`. Pemeriksaan `v &&` mencegah ketikan setengah jadi mengosongkan pilihan.
- **`slot-picker.tsx`**: tombol jam tetap `role="group" aria-label="Pilih jam"`, tombol `aria-pressed`.
- **`appointment-form.tsx`**: pilihan Tenaga (`id="booking-staff"`) dan Cabang → `SelectField`; tombol jenis (`aria-pressed`) → `ToggleButtonGroup`; ringkasan (`booking-summary.tsx`) tetap `complementary` bernama "Ringkasan booking".
- **`check-in-dialog.tsx`**: R6; "Tanggal lahir" → `DateField`; "Jenis kelamin"/"Alasan" → `SelectField`; `NikInput` sudah MUI (Task 6).
- **`reschedule-dialog.tsx`, `send-message-dialog.tsx`, `quiz-link-dialog.tsx`, `booking-dialogs.tsx`**: R6 (tombol "Tutup" yang sudah ada tetap). "Ganti link kuis?" → `alertdialog`.
- **`whatsapp-send-button.tsx`, `message-actions.tsx`, `booking-created-panel.tsx`**: R4. Tautan `wa.me` tetap jangkar biasa (`Button component="a" href target="_blank" rel="noopener noreferrer"`).

- [ ] **Step 3: Penyesuaian E2E**

- `link-kuis.spec.ts` (2×), `admin-booking.spec.ts`, `dasbor.spec.ts`: `'tr[data-highlighted="true"]'` → `'[role="row"][data-highlighted="true"]'`.
- `link-kuis.spec.ts` baris 40 dan `pengingat.spec.ts` baris 71: `getByLabel("Tanggal lain").fill(x)` → `await isiTanggal(page, "Tanggal lain", x)` / `await isiTanggal(dialog, "Tanggal lain", x)` (impor dari `./helpers/mui`).
- `link-kuis.spec.ts` baris 38: `expect(page.locator("#booking-staff")).toContainText("Diane")` → `expect(page.locator("#booking-staff option:checked")).toContainText("Diane")`, supaya yang diperiksa tetap tenaga **terpilih**, bukan daftar opsi.

- [ ] **Step 4: Uji modul (GREEN)**

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/components/appointment-form.test.tsx tests/unit/components/appointment-table.test.tsx tests/unit/components/booking-created-panel.test.tsx tests/unit/components/booking-summary.test.tsx tests/unit/components/check-in-dialog.test.tsx tests/unit/components/date-strip.test.tsx tests/unit/components/reschedule-dialog.test.tsx tests/unit/components/send-message-dialog.test.tsx tests/unit/components/whatsapp-send-button.test.tsx tests/unit/components/quiz-link-dialog.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t7.log" 2>&1; grep -E "Test Files|Tests " "$WS/t7.log"`
Expected: PASS semua.

- [ ] **Step 5: E2E dan foto**

Run: `npx playwright test tests/e2e/admin-booking.spec.ts tests/e2e/dasbor.spec.ts tests/e2e/link-kuis.spec.ts tests/e2e/pengingat.spec.ts tests/e2e/check-in.spec.ts tests/e2e/gizi-klinik.spec.ts tests/e2e/public-registration.spec.ts tests/e2e/online-consultation.spec.ts > "$WS/t7-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t7-e2e.log"`
Expected: lulus di kedua proyek. (Bila mesin berat, jalankan per berkas — Global Constraints.)

Run: `FOTO_ADMIN=1 FOTO_HALAMAN='/admin/booking*' npx playwright test tests/e2e/admin-booking.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1 > "$WS/t7-foto.log" 2>&1`, lalu periksa (R14). Perhatikan kolom Aksi di ponsel: DataGrid menggulir di dalam kartunya, halaman tidak.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: move bookings, check-in, rescheduling, WhatsApp messages, and quiz links to Material UI"
```

---

### Task 8: Modul Jadwal, Pengingat, Konsultasi online (+ editor waktu luang versi admin)

**Files:**
- Modify (resep): `src/app/(admin)/admin/jadwal/page.tsx`, `src/app/(admin)/admin/pengingat/page.tsx`, `src/components/admin/{holiday-list,schedule-exception-form,schedule-exception-list,weekly-schedule-form,reminder-worklist,online-work,online-appointment-form,contact-windows-dialog}.tsx`
- Create: `src/components/admin/contact-windows-fields.tsx` (kembaran MUI dari `ContactWindowsEditor` publik, API sama)
- Modify (tanpa perubahan rupa): `src/lib/online-consultation.ts` (pindahkan daftar pilihan jam ke sini), `src/components/online/contact-windows-editor.tsx` (impor daftar itu dari lib)
- Test: `tests/unit/architecture.test.ts` (`// Task 8`), baru `tests/unit/components/contact-windows-fields.test.tsx`; tambah ke `tests/unit/online-consultation.test.ts`; sesuaikan `tests/unit/components/{weekly-schedule-form,schedule-exception-list,reminder-worklist,online-work,online-appointment-form,contact-windows-dialog}.test.tsx`
- E2E: `tests/e2e/online-consultation.spec.ts` (baris 159), `tests/e2e/pengingat.spec.ts`, `tests/e2e/tampilan-admin.spec.ts`

**Interfaces:**
- Consumes: Task 2–7.
- Produces:
  - `src/lib/online-consultation.ts`: `CONTACT_START_CHOICES: number[]`, `CONTACT_END_CHOICES: number[]` (menit, kelipatan `ONLINE_STEP_MINUTES`; nilai sama persis dengan `START_CHOICES`/`END_CHOICES` lama di editor publik);
  - `ContactWindowsFields({ value: WindowDraft[], onChange, minDate, maxDate })` — sama dengan `ContactWindowsEditor`.

Kedua perubahan di luar `src/components/admin` hanya memindahkan konstanta murni, tanpa perubahan perilaku. Ini pengecualian sadar dari Global Constraints, supaya pilihan jam di situs publik dan admin tidak bisa berbeda. Situs publik tidak mengimpor MUI.

- [ ] **Step 1: Uji (RED)**

Tambahkan ke `MUI_MIGRATED` (`// Task 8`): kedua halaman, ke-8 komponen, dan `contact-windows-fields.tsx`.

Di `tests/unit/online-consultation.test.ts` tambahkan:

```ts
describe("pilihan jam waktu luang", () => {
  it("mulai dari jam pertama sampai (jam terakhir − rentang minimal); selesai dari (jam pertama + rentang minimal) sampai jam terakhir", () => {
    expect(CONTACT_START_CHOICES[0]).toBe(ONLINE_FIRST_MINUTE);
    expect(CONTACT_START_CHOICES.at(-1)).toBe(ONLINE_LAST_MINUTE - ONLINE_MIN_WINDOW_MINUTES);
    expect(CONTACT_END_CHOICES[0]).toBe(ONLINE_FIRST_MINUTE + ONLINE_MIN_WINDOW_MINUTES);
    expect(CONTACT_END_CHOICES.at(-1)).toBe(ONLINE_LAST_MINUTE);
    expect(CONTACT_START_CHOICES.every((m, i, all) => i === 0 || m - all[i - 1] === ONLINE_STEP_MINUTES)).toBe(true);
  });
});
```

(impor konstanta dari `@/lib/online-consultation`).

`tests/unit/components/contact-windows-fields.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ContactWindowsFields } from "@/components/admin/contact-windows-fields";
import { EMPTY_WINDOW_DRAFT, type WindowDraft } from "@/lib/online-consultation";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

function Harness({ onValue }: { onValue: (value: WindowDraft[]) => void }) {
  const [value, setValue] = useState<WindowDraft[]>([EMPTY_WINDOW_DRAFT]);
  return <ContactWindowsFields value={value} onChange={(next) => (setValue(next), onValue(next))} minDate="2026-10-06" maxDate="2026-10-20" />;
}

describe("ContactWindowsFields (admin)", () => {
  it("label sama dengan editor publik: isi tanggal dan jam, tambah sampai tiga, hapus", async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<Harness onValue={onValue} />);
    setDateField("Tanggal waktu 1", "2026-10-08");
    await user.selectOptions(screen.getByLabelText("Jam mulai waktu 1"), String(9 * 60));
    await user.selectOptions(screen.getByLabelText("Jam selesai waktu 1"), String(11 * 60));
    expect(onValue).toHaveBeenLastCalledWith([{ date: "2026-10-08", startMinute: 540, endMinute: 660 }]);
    expect(screen.queryByRole("button", { name: "Hapus waktu 1" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "+ Tambah waktu" }));
    await user.click(screen.getByRole("button", { name: "+ Tambah waktu" }));
    expect(screen.queryByRole("button", { name: "+ Tambah waktu" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hapus waktu 2" }));
    expect(screen.getByRole("group", { name: "Tanggal waktu 2" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Tanggal waktu 3" })).toBeNull();
  });
});
```

(09.00 dan 11.00 ada di dalam rentang 08.00–21.00.)

Sesuaikan uji yang ada (R12): `online-appointment-form.test.tsx` dan `contact-windows-dialog.test.tsx` mengganti `fireEvent.change(getByLabelText("Tanggal waktu 1"), { target: { value: x } })` dengan `setDateField("Tanggal waktu 1", x)`.

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/online-consultation.test.ts tests/unit/components/contact-windows-fields.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Konstanta bersama**

Di `src/lib/online-consultation.ts`, setelah konstanta `ONLINE_*`:

```ts
function minutesBetween(from: number, to: number): number[] {
  const list: number[] = [];
  for (let minute = from; minute <= to; minute += ONLINE_STEP_MINUTES) list.push(minute);
  return list;
}

/** Pilihan jam mulai/selesai waktu luang (situs publik dan panel admin memakai daftar yang sama). */
export const CONTACT_START_CHOICES = minutesBetween(ONLINE_FIRST_MINUTE, ONLINE_LAST_MINUTE - ONLINE_MIN_WINDOW_MINUTES);
export const CONTACT_END_CHOICES = minutesBetween(ONLINE_FIRST_MINUTE + ONLINE_MIN_WINDOW_MINUTES, ONLINE_LAST_MINUTE);
```

Di `src/components/online/contact-windows-editor.tsx`, hapus `minutesBetween`, `START_CHOICES`, dan `END_CHOICES`, lalu impor `CONTACT_START_CHOICES`/`CONTACT_END_CHOICES` dari lib. JSX tidak berubah selain nama konstanta.

Run: `npx vitest run tests/unit/online-consultation.test.ts tests/unit/components/contact-windows-editor.test.tsx tests/unit/components/registration-flow.test.tsx`
Expected: PASS (editor publik tidak berubah perilaku).

- [ ] **Step 3: Konversi**

- **`contact-windows-fields.tsx`** (baru, `"use client"`): struktur sama dengan editor publik. Tiap waktu: `<Paper variant="outlined" component="fieldset" sx={{ p: 1.5, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>` dengan `<Box component="legend" sx={{ px: 0.5, fontWeight: 500 }}>Waktu {n}</Box>`; `DateField label={`Tanggal waktu ${n}`} min={minDate} max={maxDate} value={window.date} onChange={(date) => update(index, { date })}`; `SelectField label="Mulai" aria-label={`Jam mulai waktu ${n}`}` berisi `CONTACT_START_CHOICES` (`minutesToTimeLabel`), `SelectField label="Selesai" aria-label={`Jam selesai waktu ${n}`}` berisi `CONTACT_END_CHOICES`; tombol `variant="text" aria-label={`Hapus waktu ${n}`}` "Hapus" bila lebih dari satu; "+ Tambah waktu" `variant="outlined"` bila kurang dari `ONLINE_MAX_WINDOWS`.
- **`contact-windows-dialog.tsx`, `online-appointment-form.tsx`**: ganti `ContactWindowsEditor` dengan `ContactWindowsFields`; sisanya R6/resep. `online-appointment-form` memakai `PatientPicker` (Task 4) dan `ToggleButtonGroup` untuk sumber.
- **`weekly-schedule-form.tsx`**: "Buka hari X" → `FormControlLabel` + `Checkbox` (nama sama); jam → `TextField type="time"` dengan label sama ("Mulai Minggu", "Selesai Minggu").
- **`schedule-exception-form.tsx`**: tanggal → `DateField` (label lama); jenis (Select Radix) → `SelectField` dengan tiga opsi yang sama; jam → `TextField type="time"`.
- **`schedule-exception-list.tsx`**: konfirmasi hapus → `alertdialog` (R6). **`holiday-list.tsx`**: daftar dan tombol (R2/R4).
- **`reminder-worklist.tsx`**: kotak kerja tetap `region` bernama dengan `listitem` (E2E pengingat mencari `region` → `listitem`).
- **`online-work.tsx`**: tautan isian → `TextLink`; chip tujuan → `StatusChip` neutral.
- **`jadwal/page.tsx`**: navigasi "Pilih tenaga" (tautan dengan `aria-current`) dan tab "Jam kerja" tetap tautan (`PageTabs`/`TextLink`).

Di `tests/e2e/online-consultation.spec.ts` baris 159: `await dialog.getByLabel("Tanggal waktu 1").fill(dayFromToday(3));` → `await isiTanggal(dialog, "Tanggal waktu 1", dayFromToday(3));` (impor dari `./helpers/mui`). Baris 67 dan 69 ada di situs publik `/daftar`, jadi **tidak** diubah.

- [ ] **Step 4: Uji modul (GREEN)**

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/online-consultation.test.ts tests/unit/components/contact-windows-fields.test.tsx tests/unit/components/contact-windows-editor.test.tsx tests/unit/components/weekly-schedule-form.test.tsx tests/unit/components/schedule-exception-list.test.tsx tests/unit/components/reminder-worklist.test.tsx tests/unit/components/online-work.test.tsx tests/unit/components/online-appointment-form.test.tsx tests/unit/components/contact-windows-dialog.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t8.log" 2>&1; grep -E "Test Files|Tests " "$WS/t8.log"`
Expected: PASS semua.

- [ ] **Step 5: E2E dan foto**

Run: `npx playwright test tests/e2e/online-consultation.spec.ts tests/e2e/pengingat.spec.ts tests/e2e/tampilan-admin.spec.ts tests/e2e/public-registration.spec.ts > "$WS/t8-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t8-e2e.log"`
Expected: lulus di kedua proyek (alur publik `/daftar` tetap).

Run: `FOTO_ADMIN=1 FOTO_HALAMAN=/admin/jadwal,/admin/pengingat npx playwright test tests/e2e/pengingat.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1 > "$WS/t8-foto.log" 2>&1`, lalu periksa (R14).

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: move schedules, reminders, and online consultation work to Material UI"
```

---

### Task 9: Modul Kunjungan dokter (+ daftar aktivitas food recall versi admin)

**Files:**
- Modify (resep): `src/app/(admin)/admin/kunjungan/[id]/page.tsx`, `src/components/admin/{encounter-workspace,encounter-page-view,encounter-record,encounter-form,encounter-warnings,encounter-context-panel,encounter-intake-tab,encounter-food-recall-tab,previous-visits-tab,vitals-trend-tab,addendum-form,audit-trail,doctor-worklist,open-encounter-button}.tsx`
- Create: `src/components/admin/activity-list-fields.tsx` (kembaran MUI dari `ActivityList` kuis, API sama; kuis publik tetap memakai yang lama)
- Test: `tests/unit/architecture.test.ts` (`// Task 9`), baru `tests/unit/components/activity-list-fields.test.tsx`; sesuaikan `tests/unit/components/{encounter-form,encounter-page-view,encounter-context-panel,encounter-food-recall-tab,doctor-worklist}.test.tsx`
- E2E: `tests/e2e/kunjungan.spec.ts`, `tests/e2e/resep.spec.ts`, `tests/e2e/check-in.spec.ts`, `tests/e2e/pemberitahuan.spec.ts`

**Interfaces:**
- Consumes: Task 2–8.
- Produces: `ActivityListFields({ entries: ActivityEntry[], onChange })`, dengan label yang sama dengan `ActivityList`: daftar "Catatan aktivitas", isian "Jam", kelompok radio "Jenis catatan", isian "Isi catatan", tombol "＋ Tambah catatan", tombol hapus `Hapus {teks}`.

- [ ] **Step 1: Uji (RED)**

Tambahkan ke `MUI_MIGRATED` (`// Task 9`): halaman, ke-14 komponen, dan `activity-list-fields.tsx`.

`tests/unit/components/activity-list-fields.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActivityListFields } from "@/components/admin/activity-list-fields";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { renderAdmin } from "../helpers/render-admin";

function Harness({ onValue }: { onValue: (entries: ActivityEntry[]) => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([{ hour: 12, kind: "MAKAN_MINUM", text: "Nasi ikan" }]);
  return <ActivityListFields entries={entries} onChange={(next) => (setEntries(next), onValue(next))} />;
}

describe("ActivityListFields (admin)", () => {
  it("menambah catatan pada jam dan jenis terpilih, urut menurut jam, dan bisa dihapus", async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<Harness onValue={onValue} />);
    await user.selectOptions(screen.getByLabelText("Jam"), "7");
    const kinds = screen.getByRole("radiogroup", { name: "Jenis catatan" });
    await user.click(within(kinds).getAllByRole("radio")[0]);
    expect(screen.getByRole("button", { name: "＋ Tambah catatan" })).toBeDisabled();
    await user.type(screen.getByLabelText("Isi catatan"), "Teh tawar{Enter}");
    expect(onValue).toHaveBeenLastCalledWith([
      { hour: 12, kind: "MAKAN_MINUM", text: "Nasi ikan" },
      expect.objectContaining({ hour: 7, text: "Teh tawar" }),
    ]);
    const items = within(screen.getByRole("list", { name: "Catatan aktivitas" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Teh tawar");
    await user.click(screen.getByRole("button", { name: "Hapus Nasi ikan" }));
    expect(onValue).toHaveBeenLastCalledWith([expect.objectContaining({ text: "Teh tawar" })]);
  });
});
```

Sesuaikan uji yang ada (R12). Tab konteks tetap `tab`/`tabpanel` dengan `aria-selected`, jadi uji `encounter-context-panel` cukup memakai `renderAdmin`.

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/components/activity-list-fields.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Konversi**

- **`activity-list-fields.tsx`** (baru, `"use client"`): logika sama dengan `src/components/kuis/activity-list.tsx` (jam bawaan 7, jenis bawaan `"MAKAN_MINUM"`, potong `TEXT_LIMITS.activity`, Enter = tambah, daftar urut jam). Tampilan: `List aria-label="Catatan aktivitas"` berisi `ListItem` (jam tebal, jenis `text.secondary`, teks, `IconButton aria-label={`Hapus ${entry.text}`}` dengan `CloseIcon`); kotak tambah `Paper variant="outlined" sx={{ borderStyle: "dashed", p: 1.5 }}` berisi `SelectField label="Jam"` (06.00–22.00 dari `ACTIVITY_FIRST_HOUR`–`ACTIVITY_LAST_HOUR`), `RadioGroup row aria-label="Jenis catatan"` (opsi `ACTIVITY_KINDS`), `TextField label="Isi catatan" placeholder="mis. Nasi ½, ikan bakar"` (`maxLength` lewat `htmlInput`), tombol `variant="outlined"` "＋ Tambah catatan" (`disabled` bila teks kosong).
- **`encounter-food-recall-tab.tsx`**: `ActivityList` → `ActivityListFields`; "Salin food recall lagi?" → `alertdialog`.
- **`encounter-context-panel.tsx`**: tombol tab buatan → `Tabs value={tab} onChange={(_, next) => setTab(next)} aria-label="Konteks kunjungan" variant="scrollable" allowScrollButtonsMobile`, dengan `Tab value={item.key} label={item.label} id={`${id}-${item.key}`} aria-controls={`${id}-${item.key}-panel`}`. Panel tetap `div role="tabpanel"` dengan `hidden`, **semua tetap terpasang** (komentar lama dipertahankan). `<details open>`/`<summary>` tetap (`Box component="details"`).
- **`encounter-form.tsx`**: `textarea` → `TextField multiline minRows={rows}` (label/`id`/`maxLength` sama); `<select>` → `SelectField` (label "Treatment" dll. sama); "Finalisasi catatan ini?" dan "Buang draf kunjungan ini?" → `alertdialog` (R6). Autosave, versi, dan finalisasi tidak berubah.
- **`encounter-page-view.tsx`**: chip "Final"/"Draf" (success/neutral) dan "Konsultasi online" (neutral); tautan pasien → `TextLink`.
- **`vitals-trend-tab.tsx`, `previous-visits-tab.tsx`, `encounter-record.tsx`**: tabel kecil (R7). Nama tabel "Tren tanda vital" tetap.
- **`doctor-worklist.tsx`**: tabel kecil (R7), bukan DataGrid. Uji menghitung `row`. Chip status (R9).
- **`addendum-form.tsx`**: `TextField multiline`. **`audit-trail.tsx`**: daftar (R2). **`open-encounter-button.tsx`**: R4.

- [ ] **Step 3: Uji modul (GREEN)**

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/components/activity-list-fields.test.tsx tests/unit/components/encounter-form.test.tsx tests/unit/components/encounter-page-view.test.tsx tests/unit/components/encounter-context-panel.test.tsx tests/unit/components/encounter-food-recall-tab.test.tsx tests/unit/components/doctor-worklist.test.tsx tests/unit/components/intake-approval-form.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t9.log" 2>&1; grep -E "Test Files|Tests " "$WS/t9.log"`
Expected: PASS semua.

- [ ] **Step 4: E2E dan foto**

Run: `npx playwright test tests/e2e/kunjungan.spec.ts tests/e2e/resep.spec.ts tests/e2e/check-in.spec.ts tests/e2e/pemberitahuan.spec.ts > "$WS/t9-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t9-e2e.log"`
Expected: lulus di kedua proyek.

Run: `FOTO_ADMIN=1 FOTO_HALAMAN='/admin/kunjungan*,/admin' npx playwright test tests/e2e/kunjungan.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1 > "$WS/t9-foto.log" 2>&1`, lalu periksa (R14). Halaman kunjungan memakai `PageBody wide`: periksa dua kolom desktop dan satu kolom ponsel.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: move the doctor visit workspace and worklist to Material UI"
```

---

### Task 10: Modul Tagihan, Resep (penyerahan obat), Stok obat dokter, halaman cetak

**Files:**
- Modify (resep): `src/app/(admin)/admin/tagihan/page.tsx`, `src/app/(admin)/admin/tagihan/[id]/page.tsx`, `src/app/(admin)/admin/resep/page.tsx`, `src/app/(admin)/admin/resep/[id]/page.tsx`, `src/app/(admin)/admin/resep/[id]/etiket/page.tsx`, `src/app/(admin)/admin/stok-dokter/page.tsx`
- Modify: `src/components/admin/billing/{add-free-line-dialog,add-item-dialog,billable-table,billing-tiles,cancel-invoice-dialog,create-invoice-button,direct-sale-dialog,discount-form,final-discount-dialog,invoice-draft-editor,invoice-final-view,invoice-payment-dialog,invoice-status-badge,invoice-table,print-button,revoke-invoice-payment-dialog}.tsx`
- Modify: `src/components/admin/dispensing/{dispensing-editor,dispensing-label,dispensing-status-badge,dispensing-summary,dispensing-table,dispensing-tiles,reopen-dispensing-button,stock-availability-table}.tsx`
- Test: `tests/unit/architecture.test.ts` (`// Task 10`); sesuaikan `tests/unit/{billing-list,billing-tiles,invoice-draft-editor,invoice-final-view,dispensing-ui,stock-availability-ui}.test.tsx`
- E2E (sesuaikan): `tests/e2e/tagihan.spec.ts` (baris 71), `tests/e2e/resep.spec.ts` (baris 88); jalankan juga `pemberitahuan.spec.ts`

**Interfaces:**
- Consumes: Task 2–9 (`AdminDataGrid`, `ItemAutocomplete` dengan `showStock`, `PatientPicker`, `RupiahInput`, `DateField`, `SelectField`, `StatusChip`, `DialogCloseButton`, `pickOption`, `pilihOpsi`).
- Produces: tidak ada API baru. `InvoiceTable`, `BillableTable`, dan `DispensingTable` menjadi `"use client"` dengan props sama.

- [ ] **Step 1: Gerbang dan penyesuaian uji (RED)**

Tambahkan ke `MUI_MIGRATED` (`// Task 10`): keenam halaman dan ke-24 komponen. Sesuaikan uji (R12):
- `billing-list.test.tsx`: `beforeEach(() => mockGridLayout())`. Teks dan tautan yang dicari tetap.
- `dispensing-ui.test.tsx` baris 104: `userEvent.selectOptions(screen.getByLabelText("Obat"), "it1")` → `await pickOption(userEvent.setup(), "Obat", "Amoxicillin (AMX) — sisa 40 kapsul")`. Tambahkan `beforeEach(() => mockGridLayout())` karena berkas itu juga merender `DispensingTable`.

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/billing-list.test.tsx tests/unit/dispensing-ui.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Konversi**

- **`invoice-table.tsx`** → DataGrid `label="Daftar tagihan"`, `emptyText="Tidak ada tagihan di tampilan ini."`. Kolom:
  - `number` "Tagihan": tautan `row.number ?? "Draf"` ke `/admin/tagihan/{id}`, tanggal kecil di bawah; urut menurut `createdAt` lewat `valueGetter`.
  - `patientName` "Pasien", `branchName` "Cabang".
  - `total` "Total" dan `balance` "Sisa": angka rata kanan, `formatRupiah`; Sisa tebal.
  - `display` "Status": `InvoiceStatusBadge`, urut menurut label.
- **`billable-table.tsx`** → DataGrid `label="Kunjungan perlu ditagih"`, `emptyText="Semua kunjungan sudah ditagih."`. Kolom:
  - `finalizedAt` "Selesai" (`dateTime`), `patientName` "Pasien" (isi sel lama, termasuk chip "Online"), `serviceName` "Layanan", `branchName` "Cabang";
  - `treatmentCount` "Treatment" (angka);
  - bila `canManage`, kolom aksi tanpa judul berisi `CreateInvoiceButton` (nama tombol `Buat tagihan {pasien}` tetap).
- **`dispensing-table.tsx`** → DataGrid `label="Daftar resep"`, `emptyText="Tidak ada resep di tampilan ini."`. Kolom: Pasien (tautan ke `/admin/resep/{id}`), Cabang, Kunjungan (`dateTime`), Obat (angka), Status.
- **Lencana**:
  - `invoice-status-badge.tsx`: `LUNAS` success, `DIBATALKAN` error, lainnya neutral;
  - `dispensing-status-badge.tsx`: `MENUNGGU` warning, lainnya success.
- **`add-item-dialog.tsx`**: "Barang" → `ItemAutocomplete id="add-item" label="Barang" items={items} value={itemId} onChange={setItemId} showStock`; "Jumlah" → `TextField type="number"`. Dialog menurut R6.
- **`dispensing-editor.tsx`**: "Obat" → `ItemAutocomplete id="dispense-item" label="Obat" … showStock`; "Jumlah" dan "Aturan pakai" → `TextField`.
- **`invoice-draft-editor.tsx`**: baris tagihan berisi isian harga → **tabel MUI (R7)**. `RupiahInput aria-label={`Harga ${line.name}`}` tetap; ikon `Lock` → `LockOutlined`. "Jenis diskon" (`discount-form.tsx`) → `SelectField` (opsi `PERSEN` dll. tetap).
- **`invoice-payment-dialog.tsx`**: tanggal bayar → `DateField id="inv-payment-date" label="Tanggal bayar" min={finalizedDate} max={today}`; nominal → `RupiahInput label`; "Metode" → `SelectField`. Pakai label lama persis untuk setiap isian.
- **`invoice-final-view.tsx`**: bilah tombol tetap `className="print:hidden"`; tabel baris (R7); cetak terang sudah diurus akar panel (R11). **`print-button.tsx`**: `Button variant="outlined" className="print:hidden"`.
- **`resep/[id]/etiket/page.tsx` + `dispensing-label.tsx`**: `article aria-label="Etiket obat"` tetap; pembungkus `print:hidden` tetap.
- **`direct-sale-dialog.tsx`**: `PatientPicker` (Task 4) dalam `Dialog` (R6). Judul "Penjualan langsung" tetap.
- **`stok-dokter/page.tsx`** (server): `select name="cabang"` → `SelectField name="cabang" defaultValue={branch.id} aria-label="Cabang" fullWidth={false}`; tombol kirim (R4). **`stock-availability-table.tsx`**: tabel kecil (R7).
- **`billing-tiles.tsx`, `dispensing-tiles.tsx`**: sudah memakai `StatTile`; hapus sisa kelas Tailwind (R2).

Penyesuaian E2E:
- `tests/e2e/tagihan.spec.ts` baris 71: `await itemDialog.getByLabel("Barang", { exact: true }).selectOption({ label: X })` → `await pilihOpsi(itemDialog, "Barang", X)`.
- `tests/e2e/resep.spec.ts` baris 88: `await page.getByLabel("Obat", { exact: true }).selectOption({ label: X })` → `await pilihOpsi(page, "Obat", X)`.
- Impor `pilihOpsi` dari `./helpers/mui`. Baris "Barang baris N" (formulir barang masuk) baru disesuaikan di Task 11. `tagihan.spec.ts` baris 153 (`"Close"`) tetap berlaku lewat `DialogCloseButton`.

- [ ] **Step 3: Uji modul (GREEN)**

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/billing-list.test.tsx tests/unit/billing-tiles.test.tsx tests/unit/invoice-draft-editor.test.tsx tests/unit/invoice-final-view.test.tsx tests/unit/dispensing-ui.test.tsx tests/unit/stock-availability-ui.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t10.log" 2>&1; grep -E "Test Files|Tests " "$WS/t10.log"`
Expected: PASS semua.

- [ ] **Step 4: E2E dan foto**

Run: `npx playwright test tests/e2e/tagihan.spec.ts tests/e2e/resep.spec.ts tests/e2e/pemberitahuan.spec.ts > "$WS/t10-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t10-e2e.log"`
Expected: lulus di kedua proyek.

Run: `FOTO_ADMIN=1 FOTO_HALAMAN='/admin/tagihan*,/admin/resep*,/admin/stok-dokter' npx playwright test tests/e2e/resep.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1 > "$WS/t10-foto.log" 2>&1`, lalu periksa (R14), termasuk etiket di skema gelap. Di layar, etiket boleh gelap; saat dicetak harus terang (diuji di Task 13).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: move invoices, dispensing, doctor stock view, and printable pages to Material UI"
```

---

### Task 11: Modul Stok & Hutang — barang, barang masuk, supplier, pembayaran hutang

**Files:**
- Modify (resep): `src/app/(admin)/admin/stok/page.tsx`, `src/app/(admin)/admin/stok/barang/[id]/page.tsx`, `src/app/(admin)/admin/stok/masuk/[id]/page.tsx`, `src/app/(admin)/admin/stok/masuk/baru/page.tsx`, `src/app/(admin)/admin/hutang/page.tsx`
- Modify: `src/components/admin/stock/{adjust-stock-dialog,cancel-purchase-dialog,due-date-dialog,payable-status-badge,payable-table,payable-tiles,payment-dialog,purchase-form,purchase-payments-section,purchase-table,revoke-payment-dialog,stock-alert-tiles,stock-item-active-button,stock-item-dialog,stock-item-table,supplier-active-button,supplier-dialog,supplier-return-dialog,supplier-table}.tsx`
- Test: `tests/unit/architecture.test.ts` (`// Task 11`); sesuaikan `tests/unit/components/{adjust-stock-dialog,cancel-purchase-dialog,payable-table,payment-dialog,purchase-form,purchase-payments-section,stock-item-dialog,stock-item-table,supplier-return-dialog}.test.tsx`
- E2E (sesuaikan): `tests/e2e/stok-hutang.spec.ts`, `tests/e2e/tagihan.spec.ts`, `tests/e2e/resep.spec.ts` (langkah barang masuk)

**Interfaces:**
- Consumes: Task 2–10 (`AdminDataGrid`, `ItemAutocomplete`, `DateField`, `SelectField`, `RupiahInput`, `StatusChip`, `DialogCloseButton`, `setDateField`, `dateFieldValue`, `pickOption`, `isiTanggal`, `pilihOpsi`).
- Produces: tidak ada API baru. `StockItemTable`, `PurchaseTable`, `PayableTable`, dan `SupplierTable` menjadi `"use client"` dengan props sama.

- [ ] **Step 1: Gerbang dan penyesuaian uji (RED)**

Tambahkan ke `MUI_MIGRATED` (`// Task 11`): kelima halaman dan ke-19 komponen. Sesuaikan uji (R12). Untuk `purchase-form.test.tsx`:
- `user.selectOptions(screen.getByLabelText("Barang baris 1"), "obat")` → `await pickOption(user, "Barang baris 1", "Amoxicillin (OBT-001)")`, dan `"serum"` di baris 2 → `pickOption(user, "Barang baris 2", "Serum C (PRD-001)")`. "Supplier" tetap `selectOptions` (pilihan supplier tetap `<select>` asli).
- `fireEvent.change(getByLabelText("Kedaluwarsa baris 1"), …)` → `setDateField("Kedaluwarsa baris 1", "2027-06-01")`.
- Uji jatuh tempo:

```tsx
  it("jatuh tempo mengikuti tanggal faktur + 30 hari sampai diubah sendiri", () => {
    renderForm();
    setDateField("Tanggal faktur", "2026-10-01");
    expect(dateFieldValue("Jatuh tempo")).toBe("2026-10-31");
    setDateField("Jatuh tempo", "2026-11-15");
    setDateField("Tanggal faktur", "2026-10-02");
    expect(dateFieldValue("Jatuh tempo")).toBe("2026-11-15");
  });
```

- Uji yang merender keempat daftar DataGrid menambah `beforeEach(() => mockGridLayout())`. Uji `stock-item-table`/`payable-table` yang mencari `cell` diganti `gridcell`.

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/components/purchase-form.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Konversi**

- **DataGrid** (R8):
  - `stock-item-table.tsx` → `label="Daftar barang"`, `emptyText="Tidak ada barang yang cocok."`. Kolom: Kode (mono), Barang (tautan ke `/admin/stok/barang/{id}` + isi lama, mis. chip nonaktif/menipis/kedaluwarsa), Jenis (`STOCK_ITEM_KIND_LABEL`), Stok tersedia (angka + satuan), Harga jual (angka, "—" bila null).
  - `purchase-table.tsx` → `label="Daftar barang masuk"`, `emptyText="Belum ada barang masuk."`. Kolom: Tanggal (`dateTime` dari `invoiceDate`), Faktur (tautan ke `/admin/stok/masuk/{id}` + supplier), Cabang, Total (angka), Status (`PayableStatusBadge`).
  - `payable-table.tsx` → `label="Daftar hutang"`, `emptyText="Tidak ada faktur di tampilan ini."`. Kolom: Jatuh tempo, Faktur, Cabang, Total, Dibayar / retur, Sisa (tebal), Status.
  - `supplier-table.tsx` → `label="Daftar supplier"`, `emptyText="Belum ada supplier."`. Kolom: Nama, Telepon, Alamat, Sisa hutang (hanya bila `showBalance`; susun daftar kolom dengan `useMemo` bergantung `showBalance` dan `canManage`), Status, Aksi (bila `canManage`; tombol ubah/aktif-nonaktif lama).
- **`payable-status-badge.tsx`**: `LUNAS` success, lainnya neutral; "Terlambat" error (dua chip berdampingan dalam `Stack direction="row" spacing={0.5}`).
- **`purchase-form.tsx`**:
  - "Supplier" → `SelectField`; "Tanggal faktur" → `DateField id="purchase-date" max={today}` dengan `onChange={changeInvoiceDate}`; "Jatuh tempo" → `DateField id="purchase-due" min={invoiceDate}` (penanda `dueTouched` tetap).
  - Tiap baris tetap `fieldset` (`Paper variant="outlined" component="fieldset"`) berisi:
    - `ItemAutocomplete aria-label={`Barang baris ${n}`} items={items} value={line.itemId} onChange={(itemId) => update(line.key, { itemId })}` (tanpa `showStock`, karena barang masuk boleh barang bersisa 0);
    - `TextField type="number"` "Jumlah baris n";
    - `RupiahInput aria-label` "Harga beli baris n";
    - `TextField` "Batch baris n";
    - `DateField label={`Kedaluwarsa baris ${n}`} min={today}`.
  - Tombol "+ Tambah baris" dan hapus baris tetap.
- **`adjust-stock-dialog.tsx`**: arah Kurangi/Tambah → `ToggleButtonGroup exclusive` (`aria-pressed` tetap); isian lain → `TextField`/`SelectField`.
- **`due-date-dialog.tsx`**: `DateField id="due-date-new" min={invoiceDate}` (label lama). **`payment-dialog.tsx`**: `DateField id="payment-date" min={invoiceDate} max={today}`, `RupiahInput id="payment-amount" label=…`, `SelectField` "Metode".
- **`stock-item-dialog.tsx`**: Kode/Nama/Satuan/Batas menipis → `TextField`; "Harga jual" → `RupiahInput label="Harga jual"`; Jenis → `SelectField`.
- **`supplier-return-dialog.tsx`**: isian jumlah per batch (`aria-label` `Jumlah retur {barang} batch {batch}`) di tabel kecil (R7).
- **Halaman `stok/page.tsx`** (server): filter GET tetap `next/form`. `select name="cabang"|"jenis"|"tanda"` → `SelectField name=… defaultValue=… aria-label=… fullWidth={false}`; isian cari → `TextField name="cari"`; tombol kirim (R4); tautan → `LinkButton`/`TextLink`. Hapus `selectClass`.
- **`stok/barang/[id]/page.tsx`, `stok/masuk/[id]/page.tsx`, `hutang/page.tsx`**: tabel kecil (R7) + `TextLink`; teks kosong tetap.

Penyesuaian E2E (impor `isiTanggal`, `pilihOpsi` dari `./helpers/mui`):
- `stok-hutang.spec.ts` baris 51 dan 57, `tagihan.spec.ts` baris 44, `resep.spec.ts` baris 43: `await page.getByLabel("Barang baris N").selectOption({ label: X })` → `await pilihOpsi(page, "Barang baris N", X)`.
- `stok-hutang.spec.ts` baris 55 dan 61, `tagihan.spec.ts` baris 48, `resep.spec.ts` baris 47: `await page.getByLabel("Kedaluwarsa baris N").fill(D)` → `await isiTanggal(page, "Kedaluwarsa baris N", D)`.

- [ ] **Step 3: Uji modul (GREEN)**

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/components/adjust-stock-dialog.test.tsx tests/unit/components/cancel-purchase-dialog.test.tsx tests/unit/components/payable-table.test.tsx tests/unit/components/payment-dialog.test.tsx tests/unit/components/purchase-form.test.tsx tests/unit/components/purchase-payments-section.test.tsx tests/unit/components/stock-item-dialog.test.tsx tests/unit/components/stock-item-table.test.tsx tests/unit/components/supplier-return-dialog.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t11.log" 2>&1; grep -E "Test Files|Tests " "$WS/t11.log"`
Expected: PASS semua.

- [ ] **Step 4: E2E dan foto**

Run: `npx playwright test tests/e2e/stok-hutang.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/resep.spec.ts > "$WS/t11-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t11-e2e.log"`
Expected: lulus di kedua proyek.

Run: `FOTO_ADMIN=1 FOTO_HALAMAN='/admin/stok*,/admin/hutang' npx playwright test tests/e2e/stok-hutang.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1 > "$WS/t11-foto.log" 2>&1`, lalu periksa (R14). Formulir barang masuk di ponsel: baris isian tersusun satu kolom, tanpa gulir mendatar.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: move stock, purchases, suppliers, and payables to Material UI"
```

---

### Task 12: Modul Pengeluaran & Laporan (+ grafik tren MUI X Charts)

**Files:**
- Modify (resep): `src/app/(admin)/admin/pengeluaran/page.tsx`, `src/app/(admin)/admin/laporan/page.tsx`, `src/components/admin/expenses/{category-manager,expense-form-dialog,expense-table,recurring-dialog,recurring-table,stop-recurring-button,void-expense-dialog}.tsx`, `src/components/admin/report/{cash-flow-card,profit-tiles,report-detail,report-summary}.tsx`
- Rewrite: `src/components/admin/report/trend-chart.tsx` (MUI X Charts; `chartGeometry` dihapus)
- Test: `tests/unit/architecture.test.ts` (`// Task 12`); sesuaikan `tests/unit/expense-ui.test.tsx`, `tests/unit/report-ui.test.tsx`
- E2E: `tests/e2e/laporan.spec.ts`

**Interfaces:**
- Consumes: Task 2–11 (`AdminDataGrid`, `DateField`, `MonthField`, `SelectField`, `RupiahInput`, `StatusChip`, `DialogCloseButton`, `SUNDY`/`DARK`/`STATUS`).
- Produces: `TrendChart({ points: TrendPoint[] })` (`"use client"`; ekspor `chartGeometry`, `Series`, dan `Bar` dihapus — tidak ada pemakai lain selain uji geometri). `ExpenseTable` dan `RecurringTable` menjadi `"use client"` dengan props sama.

- [ ] **Step 1: Gerbang dan penyesuaian uji (RED)**

Tambahkan ke `MUI_MIGRATED` (`// Task 12`): kedua halaman, ke-7 komponen pengeluaran, dan ke-5 komponen laporan (termasuk `trend-chart.tsx`). Sesuaikan uji:
- `expense-ui.test.tsx`: `beforeEach(() => mockGridLayout())`. Baris 96 `getByText("Total (tanpa yang dibatalkan)").closest("tr")` → `.parentElement`, karena baris total kini satu `Stack` berisi label dan nominal. Bila uji mengisi tanggal atau bulan, pakai `setDateField`.
- `report-ui.test.tsx`: hapus uji `"geometri: skala bersama, …"` dan impor `chartGeometry`, karena geometri kini dihitung MUI X Charts. Uji `"gambar dengan nama dan tabel tersembunyi berisi angka tiap bulan"` tetap tanpa perubahan harapan. Catat penghapusan uji ini di ledger sebagai `Ruling:`.

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/expense-ui.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Grafik tren**

`src/components/admin/report/trend-chart.tsx` (ganti seluruh isi):

```tsx
"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useColorScheme } from "@mui/material/styles";
import { visuallyHidden } from "@mui/utils";
import { BarPlot } from "@mui/x-charts/BarChart";
import { ChartsDataProvider } from "@mui/x-charts/ChartsDataProvider";
import { ChartsGrid } from "@mui/x-charts/ChartsGrid";
import { ChartsLegend } from "@mui/x-charts/ChartsLegend";
import { ChartsSurface } from "@mui/x-charts/ChartsSurface";
import { ChartsTooltip } from "@mui/x-charts/ChartsTooltip";
import { ChartsXAxis } from "@mui/x-charts/ChartsXAxis";
import { ChartsYAxis } from "@mui/x-charts/ChartsYAxis";
import { LinePlot, MarkPlot } from "@mui/x-charts/LineChart";
import { formatRupiah } from "@/lib/format";
import type { TrendPoint } from "@/lib/report";
import { DARK, STATUS, SUNDY } from "../mui/theme";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const rupiah = (value: number | null) => formatRupiah(value ?? 0);

/** "2026-08" → "Ags 2026". */
function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${MONTH_SHORT[mon - 1]} ${year}`;
}

/**
 * Grafik tren 12 bulan (spec laporan 7, spec MUI 4): batang pendapatan dan biaya, garis laba bersih, dengan
 * keterangan nilai saat disorot. Angka lengkapnya tetap ada di tabel yang tersembunyi secara visual.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const color = dark
    ? { revenue: DARK.primary, cost: SUNDY.cream300, net: STATUS.dark.success }
    : { revenue: SUNDY.gold600, cost: SUNDY.brown600, net: STATUS.light.success };
  return (
    <Stack spacing={1}>
      <Box role="img" aria-label="Grafik tren 12 bulan" sx={{ width: "100%", minHeight: 300 }}>
        <ChartsDataProvider
          height={280}
          xAxis={[{ id: "bulan", scaleType: "band", data: points.map((p) => MONTH_SHORT[Number(p.month.slice(5, 7)) - 1]) }]}
          yAxis={[{ id: "rupiah", width: 56, valueFormatter: (value: number) => compact.format(value) }]}
          series={[
            { type: "bar", id: "revenue", label: "Pendapatan", data: points.map((p) => p.revenue), color: color.revenue, valueFormatter: rupiah },
            { type: "bar", id: "cost", label: "Biaya (harga pokok + pengeluaran)", data: points.map((p) => p.cost), color: color.cost, valueFormatter: rupiah },
            { type: "line", id: "net", label: "Laba bersih", data: points.map((p) => p.netProfit), color: color.net, valueFormatter: rupiah },
          ]}
        >
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <BarPlot />
            <LinePlot />
            <MarkPlot />
            <ChartsXAxis />
            <ChartsYAxis />
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsDataProvider>
      </Box>
      <Box component="table" aria-label="Data tren bulanan" sx={visuallyHidden}>
        <thead>
          <tr>
            <th>Bulan</th>
            <th>Pendapatan</th>
            <th>Biaya</th>
            <th>Laba bersih</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <td>{monthLabel(point.month)}</td>
              <td>{formatRupiah(point.revenue)}</td>
              <td>{formatRupiah(point.cost)}</td>
              <td>{formatRupiah(point.netProfit)}</td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Stack>
  );
}
```

Pola komposisi (`ChartsDataProvider` + `ChartsSurface`) dipakai karena batang dan garis digabung dalam satu grafik. Bila nama ekspor di versi terpasang berbeda, ikuti dokumentasi "Composition" versi itu dan catat `Ruling:`. Nama gambar, isi tabel, dan ketiga seri wajib tetap.

- [ ] **Step 3: Konversi**

- **`expense-table.tsx`** → DataGrid `label="Daftar pengeluaran"`, `emptyText="Belum ada pengeluaran di bulan ini."`. Kolom:
  - Tanggal (`dateTime`), Kategori (nama + chip "Berulang" neutral), Keterangan (teks + catatan pembatalan), Cabang (`branchName ?? "Umum"`);
  - Nominal: angka, `textDecoration: "line-through"` dan `color: "text.secondary"` bila `voided`;
  - aksi tanpa judul: `VoidExpenseDialog`, tombol tetap bernama `Batalkan {label}`.
  - Di bawah grid: `<Stack direction="row" sx={{ justifyContent: "space-between", px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>` dengan `Typography` "Total (tanpa yang dibatalkan)" dan nominal tebal.
- **`recurring-table.tsx`** → DataGrid `label="Daftar pengeluaran berulang"`, `emptyText="Belum ada pengeluaran berulang."`. Kolom:
  - Kategori, Nominal (angka), Jadwal, Cabang;
  - Status (chip: aktif success / berhenti neutral);
  - aksi: ubah (`RecurringDialog`) dan `StopRecurringButton`.
- **`expense-form-dialog.tsx`**:
  - `DateField id="expense-date" label="Tanggal" max={today}`, `SelectField id="expense-category" label="Kategori"`, `RupiahInput id="expense-amount" label="Nominal"`, `SelectField id="expense-branch" label="Cabang"`;
  - `TextField id="expense-note" label="Keterangan (opsional)"`.
- **`recurring-dialog.tsx`**:
  - `SelectField` "Kategori", `RupiahInput` "Nominal", `TextField type="number"` "Tanggal tiap bulan";
  - `MonthField id="recurring-start" label="Bulan mulai"`, `MonthField id="recurring-end" label="Bulan berakhir (opsional)"`;
  - `SelectField` "Cabang", `TextField` "Keterangan (opsional)".
- **`void-expense-dialog.tsx`, `stop-recurring-button.tsx`**: R6. **`category-manager.tsx`**: tabel kecil (R7) + `TextField` "Nama kategori baru".
- **`pengeluaran/page.tsx`** (server):
  - filter `next/form`: `MonthField name="bulan" label="Bulan" defaultValue={month}`, `SelectField name="kategori" aria-label="Kategori"` dan `name="cabang" aria-label="Cabang"` (`fullWidth={false}`), tombol kirim `variant="outlined"`;
  - `nav aria-label="Pindah bulan"` berisi `TextLink`. Hapus `selectClass`.
- **`report-detail.tsx`**: tabel "Rincian laporan" (R7). **`report-summary.tsx`, `cash-flow-card.tsx`, `profit-tiles.tsx`**: R2. Warna laba/rugi memakai `success.main`/`error.main`.
- **`laporan/page.tsx`**: "Unduh CSV" → `LinkButton href=… download variant="outlined"` (nama tautan sama; E2E menunggu unduhan).

- [ ] **Step 4: Uji modul (GREEN)**

Run: `npx vitest run tests/unit/architecture.test.ts tests/unit/expense-ui.test.tsx tests/unit/report-ui.test.tsx tests/unit/report-filter.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . && npx eslint src tests && npx vitest run > "$WS/t12.log" 2>&1; grep -E "Test Files|Tests " "$WS/t12.log"`
Expected: PASS semua.

- [ ] **Step 5: E2E dan foto**

Run: `npx playwright test tests/e2e/laporan.spec.ts > "$WS/t12-e2e.log" 2>&1; grep -E "passed|failed" "$WS/t12-e2e.log"`
Expected: lulus di kedua proyek. Unduh CSV berhasil, sebab `LinkButton download` adalah jangkar biasa dan tetap berperan `link`.

Run: `FOTO_ADMIN=1 FOTO_HALAMAN=/admin/pengeluaran,/admin/laporan npx playwright test tests/e2e/laporan.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1 > "$WS/t12-foto.log" 2>&1`, lalu periksa (R14), termasuk keterbacaan grafik di skema gelap.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: move expenses and the profit report to Material UI with an interactive trend chart"
```

---

### Task 13: Penutup — aturan menyeluruh, uji mode gelap, semua halaman di dua skema, foto pratinjau, ukuran, verifikasi penuh

**Files:**
- Modify: `tests/unit/architecture.test.ts` (ganti `MUI_MIGRATED` dengan aturan menyeluruh), `src/components/admin/page-layout.tsx` dan `src/components/admin/rupiah-input.tsx` (hapus prop peralihan `className`), `tests/e2e/tampilan-admin.spec.ts`, `docs/superpowers/specs/2026-10-08-admin-material-ui-design.md` (status)
- Create: `tests/e2e/mode-gelap.spec.ts`
- Tidak di-commit: `$WS/buat-pratinjau.mjs`, `$WS/pratinjau/` (halaman pratinjau foto untuk pemilik)

**Interfaces:**
- Consumes: semua tugas sebelumnya; `ADMIN_PAGES`/`resolveAdminPage` (Task 5); `MODE_STORAGE_KEY` (Task 1); `DARK` (Task 1).
- Produces: tidak ada API baru.

- [ ] **Step 1: Aturan menyeluruh (RED bila ada yang terlewat)**

Di `tests/unit/architecture.test.ts`, hapus konstanta `MUI_MIGRATED` dan ujinya. Pertahankan `SHADCN_OR_FIXED_COLOR`, lalu tambahkan:

```ts
  it("panel admin seluruhnya memakai MUI: tanpa shadcn, lucide, atau kelas warna Tailwind", () => {
    const adminFiles = [...collectSourceFiles("src/app/(admin)"), ...collectSourceFiles("src/components/admin")];
    const offenders = adminFiles.filter((file) => SHADCN_OR_FIXED_COLOR.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("panel admin tidak memakai komponen situs publik (gayanya tidak ikut mode gelap)", () => {
    // Komponen yang dipakai bersama punya kembaran MUI di admin (mis. ContactWindowsFields, ActivityListFields).
    const shared = /from "@\/components\/(online|kuis|pendaftaran|layout|food-recall|ui)\//;
    const adminFiles = [...collectSourceFiles("src/app/(admin)"), ...collectSourceFiles("src/components/admin")];
    expect(adminFiles.filter((file) => shared.test(readFileSync(file, "utf8")))).toEqual([]);
  });
```

Run: `npx vitest run tests/unit/architecture.test.ts`
Expected: PASS. Bila ada pelanggar, itu berkas yang terlewat oleh Task 5–12: konversi menurut resep, catat di ledger, lalu jalankan lagi.

- [ ] **Step 2: Hapus prop peralihan**

Run: `grep -rnE "<(SectionCard|RupiahInput)[^>]*className=" src`
Expected: tidak ada hasil. Hapus `className?: string` (dan komentarnya) dari props `SectionCard` di `page-layout.tsx` dan dari `RupiahInput` di `rupiah-input.tsx`.

Run: `npx tsc --noEmit -p .`
Expected: bersih.

- [ ] **Step 3: Uji E2E mode gelap**

`tests/e2e/mode-gelap.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { signIn } from "./helpers/quiz";

// Spec MUI 5: Terang / Gelap / Ikuti sistem, diingat per perangkat, tanpa kedip, cetak terang, situs publik tetap.

const DARK_BACKGROUND = "rgb(20, 16, 10)"; // DARK.background #14100a

test("mode tampilan: pilihan, bertahan setelah muat ulang, tanpa kedip, cetak terang, halaman masuk", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/laporan");
  const html = page.locator("html");
  const mode = page.getByRole("group", { name: "Mode tampilan" });

  await mode.getByRole("button", { name: "Gelap" }).click();
  await expect(html).toHaveAttribute("data-dark", "");
  await expect(mode.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".MuiScopedCssBaseline-root")).toHaveCSS("background-color", DARK_BACKGROUND);

  // Skema sudah terpasang sebelum React berjalan: tidak ada kedip terang.
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-dark"))).toBe(true);
  await expect(mode.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");

  // Cetak selalu terang.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.emulateMedia({ media: "screen" });

  // Ikuti sistem: mengikuti pengaturan perangkat dan perubahannya.
  await mode.getByRole("button", { name: "Ikuti sistem" }).click();
  await expect(html).toHaveAttribute("data-light", "");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-dark", "");

  // Terang mengalahkan pengaturan perangkat.
  await mode.getByRole("button", { name: "Terang" }).click();
  await expect(html).toHaveAttribute("data-light", "");

  // Halaman masuk ikut pilihan yang tersimpan di perangkat.
  await mode.getByRole("button", { name: "Gelap" }).click();
  await page.context().clearCookies();
  await page.goto("/masuk");
  await expect(page.getByRole("heading", { level: 1, name: "Panel Admin" })).toBeVisible({ timeout: 30_000 });
  await expect(html).toHaveAttribute("data-dark", "");
});

test("situs publik tetap terang walau perangkat gelap dan atribut skema admin tertinggal", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const body = page.locator("body");
  const before = await body.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.setAttribute("data-dark", ""));
  await expect(body).toHaveCSS("background-color", before);
  expect(before).not.toBe(DARK_BACKGROUND);
});
```

Run: `npx playwright test tests/e2e/mode-gelap.spec.ts > "$WS/t13-gelap.log" 2>&1; grep -E "passed|failed" "$WS/t13-gelap.log"`
Expected: lulus di kedua proyek. Bila langkah cetak gagal karena `toHaveCSS` membaca warna sebelum media cetak berlaku, ulangi pemeriksaan di dalam `expect.poll`, catat `Ruling:`, dan jangan longgarkan nilai yang diharapkan.

- [ ] **Step 4: Semua halaman di dua skema**

Di `tests/e2e/tampilan-admin.spec.ts`, tambahkan impor `ADMIN_PAGES`, `resolveAdminPage` dari `./helpers/admin-pages`, lalu tambahkan uji:

```ts
test("semua halaman admin terbuka tanpa galat di skema terang dan gelap, tanpa gulir mendatar di ponsel", async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => message.type() === "error" && errors.push(`${page.url()}: ${message.text()}`));
  await signIn(page, E2E_ADMIN);
  const missing: string[] = [];
  for (const scheme of ["light", "dark"] as const) {
    await page.evaluate((value) => localStorage.setItem("sundy-mode-admin", value), scheme);
    for (const target of ADMIN_PAGES) {
      const href = await resolveAdminPage(page, target);
      if (!href) {
        missing.push(`${scheme} ${target.path}`);
        continue;
      }
      await page.goto(href);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1, { timeout: 30_000 });
      await expect(page.locator("html")).toHaveAttribute(`data-${scheme}`, "");
      if (testInfo.project.name === "mobile") {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${href} (${scheme}) melebar ${overflow}px`).toBeLessThanOrEqual(1);
      }
    }
  }
  // Halaman detail tanpa data contoh dilewati di sini; pemeriksaan lengkapnya ada di Step 6 (foto, dengan data).
  testInfo.annotations.push({ type: "halaman detail tanpa data", description: missing.join("; ") || "-" });
  expect(errors).toEqual([]);
});
```

Run: `npx playwright test tests/e2e/tampilan-admin.spec.ts > "$WS/t13-tampilan.log" 2>&1; grep -E "passed|failed" "$WS/t13-tampilan.log"`
Expected: lulus di kedua proyek. Galat konsol yang muncul adalah temuan (Review Focus 1): perbaiki penyebabnya, jangan menyaringnya. Pengecualian hanya untuk pesan dari luar aplikasi, misalnya ekstensi peramban; yang seperti itu dicatat sebagai `Ruling:` dengan teks pesannya.

- [ ] **Step 5: Verifikasi penuh**

Run (berurutan, satu per satu):
1. `npx tsc --noEmit -p . && npx eslint src tests`
   Expected: bersih.
2. `npx vitest run > "$WS/t13-unit.log" 2>&1; grep -E "Test Files|Tests " "$WS/t13-unit.log"`
   Expected: semua lulus.
3. `NODE_OPTIONS=--max-old-space-size=1536 npx next build > "$WS/build-sesudah.log" 2>&1; echo "build exit $?"`
   Expected: `build exit 0` dengan batas memori yang sama seperti server 2 GB.
4. `npx playwright test > "$WS/t13-e2e.log" 2>&1; grep -E "passed|failed|skipped" "$WS/t13-e2e.log"`
   Expected: semua lulus di kedua proyek; yang dilewati hanya `zz-foto-admin` dan lewatan lama yang sudah ada.
5. Kosongkan data E2E sesuai Global Constraints, lalu `npm run test:integration > "$WS/t13-int.log" 2>&1; grep -E "Test Files|Tests |FAIL" "$WS/t13-int.log"`
   Expected: lulus, kecuali 3 uji lama `tests/integration/schedule.test.ts`.

Ukuran: `grep -E "^(├|└|┌).*(/admin|/masuk)" "$WS/build-sesudah.log" > "$WS/ukuran-sesudah.txt"`, lalu bandingkan "First Load JS" tiap rute dengan `ukuran-sebelum.txt` (Task 1). Catat tabel sebelum/sesudah dan rute dengan kenaikan terbesar di ledger. Tabel yang sama masuk laporan akhir. Tidak ada ambang gagal (spec 6: diukur dan dilaporkan).

- [ ] **Step 6: Foto semua halaman dan halaman pratinjau untuk pemilik**

Run: `FOTO_ADMIN=1 npx playwright test tests/e2e/admin-booking.spec.ts tests/e2e/check-in.spec.ts tests/e2e/kunjungan.spec.ts tests/e2e/laporan.spec.ts tests/e2e/link-kuis.spec.ts tests/e2e/public-registration.spec.ts tests/e2e/resep.spec.ts tests/e2e/stok-hutang.spec.ts tests/e2e/tagihan.spec.ts tests/e2e/zz-foto-admin.spec.ts --workers=1 > "$WS/t13-foto.log" 2>&1; cat "$WS"/foto/*-catatan.txt`
Expected: kedua berkas catatan berisi `Tidak ditemukan: -` dan tidak ada baris galat konsol. Bila masih ada halaman detail yang tidak ditemukan, tambahkan spek pembuat datanya ke perintah. Bila ada galat, perbaiki dulu (Review Focus 1).

Buka setiap foto (Read) dan periksa menurut R14. Perbaikan visual di tahap ini di-commit sebagai `fix: …` dengan uji bila perilakunya berubah.

`$WS/buat-pratinjau.mjs` (tidak di-commit):

```js
// Menyusun data pratinjau foto admin: node buat-pratinjau.mjs <WS>
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ws = process.argv[2];
const root = join(ws, "foto");
const combos = [
  ["desktop", "light", "Desktop · terang"],
  ["desktop", "dark", "Desktop · gelap"],
  ["mobile", "light", "Ponsel · terang"],
  ["mobile", "dark", "Ponsel · gelap"],
];
const slugs = [...new Set(combos.flatMap(([p, s]) => (existsSync(join(root, p, s)) ? readdirSync(join(root, p, s)) : [])))].sort();
const pages = slugs.map((file) => ({
  name: file.replace(/\.jpg$/, ""),
  shots: combos.filter(([p, s]) => existsSync(join(root, p, s, file))).map(([p, s, label]) => ({ label, src: `foto/${p}/${s}/${file}` })),
}));
writeFileSync(join(ws, "pratinjau-data.json"), JSON.stringify(pages, null, 2));
console.log(`${pages.length} halaman, ${pages.reduce((n, p) => n + p.shots.length, 0)} foto`);
```

Run: `node "$WS/buat-pratinjau.mjs" "$WS"`
Expected: `26 halaman, 104 foto` (kurang bila ada halaman tanpa data, yang sudah ditangani di atas).

Buat halaman pratinjau privat untuk pemilik (spec 6 "Tinjauan visual"):
1. Muat skill `artifact-design` dulu, lalu tulis `$WS/pratinjau/index.html` dari `pratinjau-data.json`: satu bagian per halaman admin, berisi empat foto (desktop/ponsel × terang/gelap) dengan keterangan, daftar isi, dan gambar `loading="lazy"`.
2. Terbitkan dengan alat Artifact. `files` memetakan setiap `foto/<proyek>/<skema>/<nama>.jpg` ke berkas di `$WS/foto/…`. Batas: maksimal 255 berkas dan 64 MB per terbitan, 15 MB per gambar.
3. Simpan tautannya untuk laporan akhir.

- [ ] **Step 7: Status spec dan commit**

Di `docs/superpowers/specs/2026-10-08-admin-material-ui-design.md`, ubah baris status menjadi `- **Status:** Disetujui pemilik (8 Okt 2026); diimplementasikan di branch \`desain-mui\``.

```bash
git add tests src docs/superpowers/specs/2026-10-08-admin-material-ui-design.md
git commit -m "test: enforce Material UI across the admin panel and cover dark mode, every admin page, and print"
```

(Jangan men-stage `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.)

---

## Catatan untuk pelaksana

- Task 1–4 adalah fondasi; Task 5–12 boleh dikerjakan berurutan saja (gerbang `MUI_MIGRATED` dan penyesuaian E2E bertumpuk). Task 13 terakhir.
- Bila sebuah komponen modul ternyata dipakai modul lain yang belum dikonversi, tetap konversi di modul yang tercantum. MUI dan shadcn boleh berdampingan sementara, karena lapisan CSS sudah diatur di Task 1.
- Bila uji yang ada gagal karena **teks** berubah, yang salah adalah konversinya (Global Constraints), bukan ujinya.
- Berkas admin tanpa tampilan tidak perlu diubah: `src/app/(admin)/admin/laporan/unduh/route.ts`, `src/app/(admin)/admin/pemberitahuan/route.ts`, `src/components/admin/dispensing/use-dispensing-action.ts`, `src/components/admin/use-draft-autosave.ts`.
- Penyimpangan sadar dari tabel spec 4, dengan alasannya:
  - `PageTabs` tetap berupa **tautan** dengan `aria-current`, bukan `Tabs`/`Tab` MUI. Setiap tab adalah alamat sendiri (`?tab=`/`?lihat=`), dan uji serta E2E mencarinya sebagai `link`. Gayanya tetap mirip tab Material (garis bawah emas).
  - Angka di menu samping memakai `Chip` kecil di sisi kanan, bukan `Badge` yang menempel di ikon. Angkanya lebih mudah dibaca dan label aksesibelnya tetap utuh.
  - `ScopedCssBaseline` dipakai, bukan `CssBaseline` global, supaya reset MUI tidak tertinggal di situs publik setelah berpindah halaman di sisi klien.
