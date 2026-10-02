# Redesign Situs Publik dengan Motion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semua halaman publik SunDY tampil dengan arah desain B (Organik Lembut): foto stok dan foto dr. Diane, bentuk emas cair, kartu berfoto, serta gerak yang berani tetapi tetap cepat, mudah diakses, dan berhenti total untuk "kurangi gerakan".

**Architecture:**
- Isi, teks, dan harga tetap dirender di server. Gerak hanya dipasang lewat pulau `"use client"` kecil di `src/components/motion/`.
- Semua gerak yang terlihat saat halaman dibuka (hero, transisi halaman, bentuk emas, kartu melayang) memakai CSS keyframes yang dimatikan oleh `prefers-reduced-motion`.
- Gerak saat digulir memakai pola "armed": elemen hanya disembunyikan bila berada di bawah layar ketika JavaScript jalan. Tanpa JavaScript, atau bila elemen sudah terlihat, isi tidak pernah tersembunyi.
- `motion` dipakai untuk parallax, tombol magnet, kartu miring, dan penanda tab. `lenis` dipakai untuk gulir halus roda tetikus di desktop.

**Tech Stack:**
- Next.js 15.5 App Router, React 19, Tailwind v4, shadcn/ui (Sheet)
- `motion` 14 (`motion/react`), `lenis` 1.3 (`lenis/react`), `next/image`
- Vitest 4 + jsdom + Testing Library, Playwright (desktop + Pixel 7), Lighthouse (`npx`)

**Spec:** `docs/superpowers/specs/2026-10-03-redesign-situs-publik-design.md`

## Global Constraints

- Teks situs dalam Bahasa Indonesia dan memakai "Anda" serta "customer". Kata **"pasien" dan "berobat" tidak boleh muncul** di halaman publik.
- **Tanpa klaim, rating, atau ulasan karangan.** Angka hanya `CUSTOMER_COUNT = 700` (tampil "700+"), `CLINIC_FOUNDED_YEAR = 2026` ("angka dari pemilik, 3 Okt 2026"), dan jumlah treatment dari database.
- Dependensi baru hanya `motion` dan `lenis`, tanpa pustaka animasi lain. `tw-animate-css` yang sudah ada tetap dipakai. Spec menyebut motion v12; versi terbaru saat plan ditulis 14.0.0, dengan API yang dipakai sama.
- **Hanya `transform` dan `opacity` yang dianimasikan.** Satu-satunya pengecualian adalah tinggi akordeon FAQ.
- **`prefers-reduced-motion: reduce`:**
  - semua bahan langsung menampilkan keadaan akhir;
  - angka langsung bernilai akhir;
  - tanpa parallax, tanpa bentuk yang bergerak, tanpa Lenis, dan tanpa transisi halaman.
- **Layar sentuh:** gulir asli. Kartu miring dan tombol magnet hanya aktif bila `(hover: hover) and (pointer: fine)`.
- **Isi tanpa JavaScript:** isi tetap terlihat, dan elemen yang sudah terlihat saat halaman dibuka tidak pernah disembunyikan.
- **Foto:**
  - memakai `next/image` dengan berkas lokal di `public/images/`, tanpa domain luar, dan `next.config.ts` tidak diubah;
  - foto hero memakai `priority`;
  - foto dari data (`imageUrl`/`photoUrl`) hanya dipakai bila diawali `/`.
- **Tata letak:** tidak ada gulir mendatar di lebar ponsel pada semua halaman publik.
- **SEO tetap:** `metadata`, judul halaman, `sitemap`, dan `robots` tidak berubah, dan seluruh isi tetap ada di HTML server.
- **Tanpa migrasi database.** `prisma/schema.prisma` tidak disentuh.
- **Halaman yang tidak berubah:** alur `/daftar`, `/cek-booking`, `/isi`, isi Kebijakan Privasi, isi Syarat & Ketentuan, dan panel admin tidak berubah. Komponen `kuis`, `pendaftaran`, `admin`, dan `src/app/(admin)` tidak mengimpor bahan gerak.
- **Warna judul:** aturan `h1, h2, h3 { color }` di `globals.css` berada di luar `@layer`, jadi mengalahkan kelas warna Tailwind. Judul berwarna lain diberi warna lewat `<span>` di dalamnya.
- **Aksesibilitas:**
  - fokus keyboard tetap terlihat;
  - tombol pilihan paket dan akordeon dapat dipakai dengan keyboard dan pembaca layar;
  - bentuk hiasan memakai `aria-hidden="true"`;
  - foto bermakna punya teks alternatif.
- **Berkas terlarang:** jangan pernah men-stage atau meng-commit `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md`.

## Review Focus

1. **Foto dari data yang bukan berkas lokal** (`https://…`, `//…`, `foto.jpg`, kosong) **atau slug kategori tanpa foto** (termasuk `constructor`/`__proto__`): kartu dan halaman tetap tampil dengan foto cadangan, tanpa galat `next/image`. Dikunci di Task 3.
2. **`?paket=` yang aneh** (huruf campur `LuX`, spasi, parameter ganda, nilai asing, atau kelompok tanpa paket aktif): yang terbuka selalu kelompok yang ada, tidak pernah panel kosong. Dikunci di Task 9.
3. **Pengunjung tiba di tengah halaman** (muat ulang saat tergulir, tautan `#bagian-…`, tombol Kembali): isi di atas layar tidak pernah disembunyikan, dan isi di bawahnya muncul saat tercapai. Dikunci di Task 1.
4. **"Kurangi gerakan" dinyalakan saat halaman sudah terbuka:** elemen yang sedang menunggu langsung tampil, dan angka langsung bernilai akhir. Dikunci di Task 1.
5. **Belum ada dokter yang tampil di situs** (staf nonaktif atau `showOnWebsite` mati): Beranda dan Tentang tetap tampil tanpa kartu dan bagian dokter, dan tanpa galat. Dikunci di Task 7 dan Task 10.

---

## Struktur berkas

**Bahan gerak** (`src/components/motion/`, semuanya `"use client"`):

| Berkas | Isi |
|---|---|
| `use-motion-prefs.ts` | `usePrefersReducedMotion()`, `useFinePointer()`, `REDUCED_MOTION_QUERY`, `FINE_POINTER_QUERY` |
| `reveal.tsx` | `Reveal`, `staggerDelay()` (muncul saat digulir) |
| `count-up.tsx` | `CountUp`, `countUpValue()` |
| `parallax.tsx` | `Parallax`, `clampParallax()` |
| `magnetic.tsx` | `Magnetic`, `magneticOffset()` |
| `tilt.tsx` | `Tilt`, `tiltAngles()` |
| `smooth-scroll.tsx` | `SmoothScroll`, `LENIS_OPTIONS` |

**Bahan visual publik** (`src/components/public/`, komponen server kecuali disebut lain):

| Berkas | Isi |
|---|---|
| `morph-blob.tsx` | bentuk emas cair, hiasan saja |
| `arch-image.tsx` | foto dalam bingkai lengkung |
| `floating-chip.tsx` | kartu kecil melayang |
| `eyebrow.tsx` | label kecil di atas judul |
| `page-hero.tsx` | kepala halaman bersama |
| `doctor-profile.tsx` | `DoctorProfile`, `doctorCallName()` |
| `clinic-gallery.tsx` | galeri suasana dengan parallax |
| `final-cta.tsx` | ajakan akhir |
| `program-steps.tsx` | `"use client"`: langkah menempel |
| `category-nav.tsx` | `"use client"`: chip kategori Layanan |
| `sticky-booking-bar.tsx` | `"use client"`: bar bawah detail layanan |
| `package-tabs.tsx` | `"use client"`: tombol pilihan paket |
| `faq-list.tsx` | `"use client"`: akordeon dan kotak cari |

**Bagian Beranda** (`src/components/home/`): `home-hero.tsx`, `stats-strip.tsx`, `value-props.tsx`, `signature-treatments.tsx`.

**Header** (`src/components/layout/`):
- baru: `nav-items.ts`, `header-shell.tsx` (`"use client"`), `nav-links.tsx` (`"use client"`), `mobile-menu.tsx` (`"use client"`);
- diubah: `site-header.tsx`, `site-footer.tsx`, `whatsapp-fab.tsx`.

**Data:**
- baru: `src/lib/site-images.ts`, `src/lib/category-anchor.ts`, `src/lib/package-group.ts`;
- diubah: `src/lib/clinic.ts` (konstanta baru) dan `src/server/catalog.ts` (`getSignatureServices` dengan kategori, `getRelatedServices`, `countActiveServices`).

**Kartu katalog** yang diubah: `service-card.tsx`, `branch-card.tsx`, `product-card.tsx`, `package-card.tsx`.

**Halaman** (`src/app/(public)/`):
- diubah: `layout.tsx`, `page.tsx`, `layanan/page.tsx`, `layanan/[slug]/page.tsx`, `program-slimming/page.tsx`, `produk/page.tsx`, `lokasi/page.tsx`, `lokasi/[slug]/page.tsx`, `tentang/page.tsx`, `faq/page.tsx`;
- baru: `template.tsx`.

**CSS:** `src/app/globals.css`, berisi keyframes, kelas gerak, dan blok reduced-motion serta cetak.

**Uji:**
- `tests/unit/helpers/browser-mocks.ts` (baru) dan `tests/setup.ts`;
- uji unit per komponen di `tests/unit/components/…`, ditambah `tests/unit/site-images.test.ts`, `tests/unit/clinic.test.ts`, dan `tests/unit/package-group.test.ts`;
- `tests/integration/catalog.test.ts` dan `tests/unit/architecture.test.ts`;
- `tests/e2e/public-site.spec.ts` (diubah) dan `tests/e2e/situs-publik-gerak.spec.ts` (baru).

**Ruang kerja eksekusi** (di-ignore git): `WS=.superpowers/sdd/2026-10-03-plan-redesign-situs-publik`. Log, hasil Lighthouse, dan ledger ditaruh di sini.

---

### Task 1: Fondasi gerak — tiruan peramban, preferensi gerak, Reveal, CountUp, CSS, transisi halaman

**Files:**
- Modify: `package.json`, `package-lock.json` (lewat `npm install`)
- Create: `tests/unit/helpers/browser-mocks.ts`
- Modify: `tests/setup.ts`
- Create: `src/components/motion/use-motion-prefs.ts`, `src/components/motion/reveal.tsx`, `src/components/motion/count-up.tsx`
- Create: `src/app/(public)/template.tsx`
- Modify: `src/app/globals.css` (tambah di akhir berkas)
- Modify: `tests/unit/architecture.test.ts`
- Test: `tests/unit/components/motion/use-motion-prefs.test.tsx`, `tests/unit/components/motion/reveal.test.tsx`, `tests/unit/components/motion/count-up.test.tsx`, `tests/unit/components/public-template.test.tsx`

**Interfaces:**
- Consumes: —
- Produces:
  - `REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"`, `FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)"`
  - `usePrefersReducedMotion(): boolean` (bernilai `true` di server dan saat hidrasi), `useFinePointer(): boolean` (bernilai `false` di server)
  - `Reveal({ children, className?, delay?: number, from?: "bottom" | "left" | "right" })`: merender `<div class="reveal" data-reveal="static|armed|shown">`
  - `staggerDelay(index: number): number`, yaitu `min(index, 6) * 70`
  - `CountUp({ value: number, suffix?: string, durationMs?: number, className?: string })` dan `countUpValue(progress: number, target: number): number`
  - kelas CSS: `.page-in`, `.hero-line`, `.arch-rise`, `.zoom-slow`, `.morph-blob` + `.morph-blob__part.blob-a/b/c`, `.float-y`, `.pulse-soft`, `.pulse-once`, `.fab-in`, `.panel-in`, `.check-in`, `.hero-bleed`; variabel `--header-h` dan `--ease-soft`
  - tiruan uji: `setMediaMatches(query, matches)`, `triggerIntersection(target, isIntersecting, rect?)`, `mockElementTop(top)`

- [ ] **Step 1: Ukur Lighthouse sebelum perubahan**

Tulis skrip ukur di ruang kerja. Skrip ini tidak masuk repo dan tidak ditambahkan ke `package.json`:

```bash
WS=.superpowers/sdd/2026-10-03-plan-redesign-situs-publik
mkdir -p "$WS"
cat > "$WS/lighthouse.sh" <<'EOF'
#!/usr/bin/env bash
# Pemakaian: bash "$WS/lighthouse.sh" <label>. Server produksi harus sudah jalan di :3200.
set -euo pipefail
WS=.superpowers/sdd/2026-10-03-plan-redesign-situs-publik
LABEL=$1
CHROME_PATH=$(node -e 'console.log(require("@playwright/test").chromium.executablePath())')
export CHROME_PATH
for path in "/" "/layanan" "/program-slimming"; do
  name=$(echo "$path" | tr '/' '-'); [ "$name" = "-" ] && name="-beranda"
  out="$PWD/$WS/lh-$LABEL$name.json"
  npx --yes lighthouse@12 "http://localhost:3200$path" --only-categories=performance,accessibility \
    --chrome-flags="--headless=new" --output=json --output-path="$out" --quiet
  node -e 'const r=require(process.argv[1]);console.log(process.argv[2],"performa",Math.round(r.categories.performance.score*100),"aksesibilitas",Math.round(r.categories.accessibility.score*100))' "$out" "$path"
done
EOF
npm run build > "$WS/build-sebelum.log" 2>&1 && tail -3 "$WS/build-sebelum.log"
```

- Jalankan `npx next start -p 3200 > "$WS/start-sebelum.log" 2>&1` di latar. Tunggu sampai `curl -sf http://localhost:3200/ > /dev/null` berhasil.
- Lalu jalankan `bash "$WS/lighthouse.sh" sebelum`, dan hentikan server dengan `pkill -f "next start -p 3200"`.
- Tidak boleh ada `next dev` lain yang jalan saat build.

Expected: tiga baris `/… performa N aksesibilitas M`. Catat ketiganya di ledger sebagai `Lighthouse sebelum: …`. Bila Lighthouse gagal jalan (misalnya Chrome tidak ditemukan), catat galatnya sebagai `Ruling:` dan lanjutkan. Pengukuran sesudah di Task 11 tetap wajib.

- [ ] **Step 2: Pasang dependensi**

```bash
npm install motion@^14.0.0 lenis@^1.3.26
node -e 'console.log(require("motion/package.json").version, require("lenis/package.json").version)'
```

Expected: `14.x.x 1.3.x`. `package.json` kini memuat `"lenis"` dan `"motion"` di `dependencies`.

- [ ] **Step 3: Tulis tiruan peramban untuk jsdom**

Buat `tests/unit/helpers/browser-mocks.ts`:

```ts
import { vi } from "vitest";

/**
 * jsdom tidak punya matchMedia, IntersectionObserver, scrollIntoView, dan
 * Element.scrollTo. Bahan gerak situs publik memakai semuanya; tiruan ini
 * memasangnya untuk seluruh uji unit dan bisa dikendalikan dari uji.
 */

type MediaListener = (event: { matches: boolean; media: string }) => void;

const mediaMatches = new Map<string, boolean>();
const mediaListeners = new Map<string, Set<MediaListener>>();

/** Mengubah hasil sebuah media query dan memberi tahu semua pendengarnya. */
export function setMediaMatches(query: string, matches: boolean): void {
  mediaMatches.set(query, matches);
  for (const listener of mediaListeners.get(query) ?? []) listener({ matches, media: query });
}

function listenersFor(query: string): Set<MediaListener> {
  let set = mediaListeners.get(query);
  if (!set) {
    set = new Set();
    mediaListeners.set(query, set);
  }
  return set;
}

function matchMedia(query: string) {
  return {
    get matches() {
      return mediaMatches.get(query) ?? false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => listenersFor(query).add(listener),
    removeEventListener: (_type: string, listener: MediaListener) =>
      listenersFor(query).delete(listener),
    addListener: (listener: MediaListener) => listenersFor(query).add(listener),
    removeListener: (listener: MediaListener) => listenersFor(query).delete(listener),
    dispatchEvent: () => false,
  };
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: number[] = [];

  constructor(
    readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.rootMargin = options.rootMargin ?? "";
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/** Memanggil setiap observer yang sedang mengamati `target`, seolah target masuk atau keluar layar. */
export function triggerIntersection(
  target: Element,
  isIntersecting: boolean,
  rect: Partial<DOMRectReadOnly> = {},
): void {
  const boundingClientRect = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    ...rect,
  } as DOMRectReadOnly;

  for (const observer of [...MockIntersectionObserver.instances]) {
    if (!observer.targets.has(target)) continue;
    const entry = {
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect,
      intersectionRect: boundingClientRect,
      rootBounds: null,
      time: 0,
    } as IntersectionObserverEntry;
    observer.callback([entry], observer as unknown as IntersectionObserver);
  }
}

/** Membuat setiap elemen tampak berada `top` piksel dari atas layar (jsdom selalu memberi 0). */
export function mockElementTop(top: number) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 100,
    left: 0,
    right: 100,
    width: 100,
    height: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

export function installBrowserMocks(): void {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver,
  });
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
}

export function resetBrowserMocks(): void {
  mediaMatches.clear();
  mediaListeners.clear();
  MockIntersectionObserver.instances = [];
}
```

Ubah `tests/setup.ts` menjadi:

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { installBrowserMocks, resetBrowserMocks } from "./unit/helpers/browser-mocks";

// Beberapa uji berjalan di lingkungan node (tanpa window); tiruan peramban hanya untuk jsdom.
if (typeof window !== "undefined") {
  installBrowserMocks();
  afterEach(() => resetBrowserMocks());
}
```

- [ ] **Step 4: Pastikan uji lama tetap hijau dengan tiruan baru**

Run: `npx vitest run > "$WS/t1-setup.log" 2>&1; tail -6 "$WS/t1-setup.log"`
Expected: semua uji yang ada PASS, dengan jumlah sama seperti sebelum Step 3.

- [ ] **Step 5: Tulis uji preferensi gerak (gagal)**

Buat `tests/unit/components/motion/use-motion-prefs.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FINE_POINTER_QUERY,
  REDUCED_MOTION_QUERY,
  useFinePointer,
  usePrefersReducedMotion,
} from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

function Probe() {
  const reduce = usePrefersReducedMotion();
  const fine = useFinePointer();
  return <p>{`kurangi:${reduce} kursor:${fine}`}</p>;
}

describe("preferensi gerak", () => {
  it("mengikuti media query dan berubah saat setelan pengunjung berubah", () => {
    render(<Probe />);
    expect(screen.getByText("kurangi:false kursor:false")).toBeInTheDocument();

    act(() => {
      setMediaMatches(REDUCED_MOTION_QUERY, true);
      setMediaMatches(FINE_POINTER_QUERY, true);
    });
    expect(screen.getByText("kurangi:true kursor:true")).toBeInTheDocument();
  });

  it("merender keadaan tanpa gerak dan tanpa kursor di server", () => {
    expect(renderToString(<Probe />)).toContain("kurangi:true kursor:false");
  });
});
```

Run: `npx vitest run tests/unit/components/motion/use-motion-prefs.test.tsx`
Expected: FAIL, karena modul `@/components/motion/use-motion-prefs` tidak ditemukan.

- [ ] **Step 6: Tulis hook preferensi gerak**

Buat `src/components/motion/use-motion-prefs.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Hook media query. Di server dan saat hidrasi, nilai cadangan yang dipakai,
 * jadi HTML awal selalu berupa keadaan akhir tanpa gerak. Begitu terpasang di
 * peramban, nilainya mengikuti setelan pengunjung, termasuk bila setelan
 * berubah saat halaman masih terbuka.
 *
 * Tidak memakai useReducedMotion milik motion: hook itu membaca setelan sekali
 * untuk seluruh halaman dan tidak mengikuti perubahan.
 */
function createMediaHook(query: string, serverValue: boolean) {
  const subscribe = (onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
  const getSnapshot = () => window.matchMedia(query).matches;
  const getServerSnapshot = () => serverValue;

  return function useMediaQuery(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  };
}

/** `true` bila pengunjung memilih "kurangi gerakan". Di server selalu `true`. */
export const usePrefersReducedMotion = createMediaHook(REDUCED_MOTION_QUERY, true);

/** `true` bila perangkat punya kursor (bukan layar sentuh). Di server selalu `false`. */
export const useFinePointer = createMediaHook(FINE_POINTER_QUERY, false);
```

Run: `npx vitest run tests/unit/components/motion/use-motion-prefs.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 7: Tulis uji Reveal (gagal)**

Buat `tests/unit/components/motion/reveal.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reveal, staggerDelay } from "@/components/motion/reveal";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { mockElementTop, setMediaMatches, triggerIntersection } from "../../helpers/browser-mocks";

afterEach(() => vi.restoreAllMocks());

function renderReveal(delay?: number) {
  render(
    <Reveal delay={delay}>
      <p>Isi kartu</p>
    </Reveal>,
  );
  return screen.getByText("Isi kartu").parentElement as HTMLElement;
}

describe("Reveal", () => {
  it("membiarkan elemen yang sudah terlihat saat halaman dibuka", () => {
    mockElementTop(120);
    expect(renderReveal()).toHaveAttribute("data-reveal", "static");
  });

  it("tidak menyembunyikan elemen di atas layar, misalnya saat halaman dimuat ulang di tengah", () => {
    mockElementTop(-900);
    expect(renderReveal()).toHaveAttribute("data-reveal", "static");
  });

  it("menyembunyikan elemen di bawah layar lalu memunculkannya sekali saat masuk layar", () => {
    mockElementTop(2000);
    const element = renderReveal();
    expect(element).toHaveAttribute("data-reveal", "armed");

    act(() => triggerIntersection(element, true));
    expect(element).toHaveAttribute("data-reveal", "shown");

    // Sekali saja: keluar layar lagi tidak menyembunyikannya kembali.
    act(() => triggerIntersection(element, false));
    expect(element).toHaveAttribute("data-reveal", "shown");
  });

  it("langsung menampilkan keadaan akhir bila pengunjung memilih kurangi gerakan", () => {
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    mockElementTop(2000);
    expect(renderReveal()).toHaveAttribute("data-reveal", "static");
  });

  it("menampilkan elemen yang sedang menunggu begitu kurangi gerakan dinyalakan", () => {
    mockElementTop(2000);
    const element = renderReveal();
    expect(element).toHaveAttribute("data-reveal", "armed");

    act(() => setMediaMatches(REDUCED_MOTION_QUERY, true));
    expect(element).toHaveAttribute("data-reveal", "static");
  });

  it("memberi jeda bergiliran saat elemen muncul", () => {
    mockElementTop(2000);
    const element = renderReveal(140);
    act(() => triggerIntersection(element, true));
    expect(element.style.transitionDelay).toBe("140ms");
  });
});

describe("staggerDelay", () => {
  it("menambah 70 ms per kartu dan berhenti di kartu ketujuh", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBe(140);
    expect(staggerDelay(6)).toBe(420);
    expect(staggerDelay(20)).toBe(420);
  });
});
```

Run: `npx vitest run tests/unit/components/motion/reveal.test.tsx`
Expected: FAIL, karena modul `@/components/motion/reveal` tidak ditemukan.

- [ ] **Step 8: Tulis Reveal**

Buat `src/components/motion/reveal.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-motion-prefs";

type Phase = "static" | "armed" | "shown";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Jeda sebelum muncul, dalam milidetik. Untuk kumpulan kartu, pakai staggerDelay(index). */
  delay?: number;
  /** Arah datangnya elemen. Bawaan dari bawah (naik ±24 px). */
  from?: "bottom" | "left" | "right";
};

/** Jeda bergiliran 70 ms per kartu, paling lama tujuh langkah supaya kartu terakhir tidak menunggu lama. */
export function staggerDelay(index: number): number {
  return Math.min(index, 6) * 70;
}

/**
 * Muncul saat digulir: naik dan memudar masuk sekali saja.
 *
 * HTML server selalu "static" (terlihat). Setelah JavaScript jalan, hanya
 * elemen yang masih di bawah layar yang disembunyikan ("armed") lalu
 * dimunculkan saat masuk layar. Elemen yang sudah terlihat, atau sudah
 * tergulir lewat ke atas, tidak pernah disembunyikan.
 */
export function Reveal({ children, className, delay = 0, from = "bottom" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const reduce = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("static");

  useEffect(() => {
    const element = ref.current;
    if (!element || reduce || done.current) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setPhase("armed");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        done.current = true;
        setPhase("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reduce]);

  const visiblePhase: Phase = reduce ? "static" : phase;

  return (
    <div
      ref={ref}
      data-reveal={visiblePhase}
      data-from={from}
      style={visiblePhase === "shown" && delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn("reveal", className)}
    >
      {children}
    </div>
  );
}
```

Run: `npx vitest run tests/unit/components/motion/reveal.test.tsx`
Expected: PASS (7/7).

- [ ] **Step 9: Tulis uji CountUp (gagal)**

Buat `tests/unit/components/motion/count-up.test.tsx`:

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp, countUpValue } from "@/components/motion/count-up";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { mockElementTop, setMediaMatches, triggerIntersection } from "../../helpers/browser-mocks";

describe("countUpValue", () => {
  it("mulai dari 0 dan berakhir tepat di nilai akhir", () => {
    expect(countUpValue(0, 700)).toBe(0);
    expect(countUpValue(1, 700)).toBe(700);
    expect(countUpValue(1.4, 700)).toBe(700);
    expect(countUpValue(-1, 700)).toBe(0);
  });

  it("naik cepat di awal lalu melambat menjelang akhir", () => {
    expect(countUpValue(0.5, 700)).toBeGreaterThan(350);
    expect(countUpValue(0.5, 700)).toBeLessThan(700);
  });
});

describe("CountUp", () => {
  beforeEach(() => {
    // Bingkai animasi dijalankan per 16 ms supaya uji tidak bergantung pada rAF jsdom.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("merender nilai akhir sejak awal untuk angka yang sudah terlihat", () => {
    mockElementTop(100);
    render(<CountUp value={700} suffix="+" />);
    expect(screen.getByText("700+")).toBeInTheDocument();
  });

  it("menghitung dari 0 sampai nilai akhir, dengan akhiran, setelah masuk layar", async () => {
    mockElementTop(2000);
    const { container } = render(<CountUp value={700} suffix="+" durationMs={60} />);
    const number = container.querySelector("span") as HTMLElement;
    expect(number.textContent).toBe("0+");

    act(() => triggerIntersection(number, true));
    await waitFor(() => expect(number.textContent).toBe("700+"));
  });

  it("langsung bernilai akhir bila kurangi gerakan", () => {
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    mockElementTop(2000);
    render(<CountUp value={35} />);
    expect(screen.getByText("35")).toBeInTheDocument();
  });

  it("langsung bernilai akhir bila kurangi gerakan dinyalakan sebelum angka terlihat", () => {
    mockElementTop(2000);
    const { container } = render(<CountUp value={700} suffix="+" />);
    expect(container.querySelector("span")?.textContent).toBe("0+");

    act(() => setMediaMatches(REDUCED_MOTION_QUERY, true));
    expect(container.querySelector("span")?.textContent).toBe("700+");
  });
});
```

Run: `npx vitest run tests/unit/components/motion/count-up.test.tsx`
Expected: FAIL, karena modul `@/components/motion/count-up` tidak ditemukan.

- [ ] **Step 10: Tulis CountUp**

Buat `src/components/motion/count-up.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-motion-prefs";

const formatter = new Intl.NumberFormat("id-ID");

/** Nilai pada titik `progress` (0–1) dengan perlambatan di akhir; tepat `target` saat progress ≥ 1. */
export function countUpValue(progress: number, target: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - clamped) ** 3;
  return Math.round(target * eased);
}

type CountUpProps = {
  value: number;
  /** Akhiran yang selalu tampil, misalnya "+". */
  suffix?: string;
  durationMs?: number;
  className?: string;
};

/**
 * Angka berhitung dari 0 ke nilai akhir saat pertama masuk layar.
 *
 * HTML server berisi nilai akhir. Angka yang sudah terlihat saat halaman
 * dibuka dibiarkan bernilai akhir, supaya tidak berkedip ke 0.
 */
export function CountUp({ value, suffix = "", durationMs = 1500, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || reduce || done.current) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setShown(0);
    let frame = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      done.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = (now - start) / durationMs;
        setShown(countUpValue(progress, value));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      // Bila dihentikan di tengah (misalnya kurangi gerakan dinyalakan), jangan tertinggal di angka antara.
      setShown(value);
    };
  }, [reduce, value, durationMs]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {formatter.format(reduce ? value : shown)}
      {suffix}
    </span>
  );
}
```

Run: `npx vitest run tests/unit/components/motion/count-up.test.tsx`
Expected: PASS (6/6).

- [ ] **Step 11: Tulis uji transisi halaman (gagal)**

Buat `tests/unit/components/public-template.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublicTemplate from "@/app/(public)/template";

describe("transisi halaman publik", () => {
  it("membungkus isi halaman dengan animasi masuk", () => {
    render(
      <PublicTemplate>
        <p>Isi halaman</p>
      </PublicTemplate>,
    );
    expect(screen.getByText("Isi halaman").parentElement).toHaveClass("page-in");
  });
});
```

Run: `npx vitest run tests/unit/components/public-template.test.tsx`
Expected: FAIL, karena modul `@/app/(public)/template` tidak ditemukan.

- [ ] **Step 12: Tulis template dan CSS gerak**

Buat `src/app/(public)/template.tsx`:

```tsx
/**
 * Template dirender ulang setiap pindah halaman, jadi isi baru selalu masuk
 * dengan pudar + naik ±12 px. Animasinya CSS (.page-in di globals.css) dan
 * mati untuk "kurangi gerakan". Header, footer, dan tombol WhatsApp ada di
 * layout, jadi tidak ikut beranimasi.
 */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
```

Tambahkan di **akhir** `src/app/globals.css`:

```css
/* ------------------------------------------------------------------------
   Gerak situs publik (spec redesign 3 Okt 2026, §3).
   Hanya transform dan opacity yang dianimasikan. Semua dimatikan untuk
   "kurangi gerakan" di blok paling bawah.
   ------------------------------------------------------------------------ */

:root {
  --ease-soft: cubic-bezier(0.22, 1, 0.36, 1);
  /* Tinggi header tetap. Header berupa fixed dan tidak memendek secara tinggi,
     jadi tidak ada animasi tinggi; kesan "memendek" datang dari logo yang mengecil. */
  --header-h: 4.5rem;
}

@media (min-width: 48rem) {
  :root {
    --header-h: 5rem;
  }
}

/* Kepala halaman yang menerus sampai ke balik header transparan. */
.hero-bleed {
  margin-top: calc(var(--header-h) * -1);
  padding-top: calc(var(--header-h) + 2.5rem);
}

@media (min-width: 64rem) {
  .hero-bleed {
    padding-top: calc(var(--header-h) + 4rem);
  }
}

@keyframes page-in {
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes line-up {
  from {
    opacity: 0;
    transform: translate3d(0, 0.6em, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes arch-rise {
  from {
    transform: translate3d(0, 14%, 0) scale(1.08);
  }
  to {
    transform: none;
  }
}

@keyframes zoom-slow {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.06);
  }
}

@keyframes blob-drift-a {
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
  }
  50% {
    transform: translate3d(6%, -5%, 0) rotate(25deg) scale(1.08);
  }
}

@keyframes blob-drift-b {
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
  }
  50% {
    transform: translate3d(-7%, 4%, 0) rotate(-30deg) scale(0.94);
  }
}

@keyframes blob-drift-c {
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
  }
  50% {
    transform: translate3d(4%, 6%, 0) rotate(40deg) scale(1.05);
  }
}

@keyframes float-y {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -8px, 0);
  }
}

@keyframes pulse-soft {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.85;
  }
}

@keyframes fab-in {
  from {
    opacity: 0;
    transform: translate3d(0, 16px, 0) scale(0.8);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes panel-in {
  from {
    opacity: 0;
    transform: translate3d(16px, 0, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes check-in {
  from {
    opacity: 0;
    transform: translate3d(-6px, 0, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.page-in {
  animation: page-in 0.55s var(--ease-soft) both;
}

.hero-line {
  animation: line-up 0.9s var(--ease-soft) both;
}

.arch-rise {
  animation: arch-rise 1.2s var(--ease-soft) both;
}

.zoom-slow {
  animation: zoom-slow 18s ease-in-out infinite alternate;
}

/* Bentuk emas cair: tiga gumpalan bergradasi bergeser dengan tempo berbeda,
   jadi gabungannya tampak berubah bentuk tanpa menganimasikan border-radius. */
.morph-blob {
  isolation: isolate;
}

.morph-blob__part {
  position: absolute;
  border-radius: 9999px;
  will-change: transform;
}

.morph-blob__part.blob-a {
  inset: 0 18% 22% 0;
  background: radial-gradient(closest-side, rgb(239 208 140 / 0.85), rgb(239 208 140 / 0));
  animation: blob-drift-a 9s ease-in-out infinite;
}

.morph-blob__part.blob-b {
  inset: 20% 0 0 25%;
  background: radial-gradient(closest-side, rgb(232 184 75 / 0.55), rgb(232 184 75 / 0));
  animation: blob-drift-b 11s ease-in-out infinite;
}

.morph-blob__part.blob-c {
  inset: 30% 30% 5% 5%;
  background: radial-gradient(closest-side, rgb(212 160 23 / 0.35), rgb(212 160 23 / 0));
  animation: blob-drift-c 12s ease-in-out infinite;
}

.morph-blob[data-tone="cream"] .morph-blob__part.blob-a {
  background: radial-gradient(closest-side, rgb(253 246 227 / 0.95), rgb(253 246 227 / 0));
}

.morph-blob[data-tone="cream"] .morph-blob__part.blob-b {
  background: radial-gradient(closest-side, rgb(247 237 212 / 0.8), rgb(247 237 212 / 0));
}

.morph-blob[data-tone="cream"] .morph-blob__part.blob-c {
  background: radial-gradient(closest-side, rgb(239 208 140 / 0.35), rgb(239 208 140 / 0));
}

.float-y {
  animation: float-y 6s ease-in-out infinite;
}

.pulse-soft {
  animation: pulse-soft 2.4s ease-in-out infinite;
}

.pulse-once {
  animation: pulse-soft 1.2s var(--ease-soft) 0.9s 1 both;
}

/* "backwards", bukan "both": setelah selesai, transform tombol harus bisa diatur
   aturan lain (tombol naik saat bar booking detail layanan tampil). */
.fab-in {
  animation: fab-in 0.6s var(--ease-soft) 0.8s backwards;
}

.panel-in {
  animation: panel-in 0.45s var(--ease-soft) both;
}

.check-in {
  animation: check-in 0.4s var(--ease-soft) both;
}

/* Muncul saat digulir (src/components/motion/reveal.tsx). */
.reveal[data-reveal="armed"] {
  opacity: 0;
  transform: translate3d(0, 24px, 0);
}

.reveal[data-reveal="armed"][data-from="left"] {
  transform: translate3d(-24px, 0, 0);
}

.reveal[data-reveal="armed"][data-from="right"] {
  transform: translate3d(24px, 0, 0);
}

.reveal[data-reveal="shown"] {
  transition:
    opacity 0.7s var(--ease-soft),
    transform 0.7s var(--ease-soft);
}

@media (prefers-reduced-motion: reduce) {
  .page-in,
  .hero-line,
  .arch-rise,
  .zoom-slow,
  .morph-blob__part,
  .float-y,
  .pulse-soft,
  .pulse-once,
  .fab-in,
  .panel-in,
  .check-in {
    animation: none !important;
  }

  .reveal[data-reveal] {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}

/* Saat dicetak, elemen yang belum sempat muncul tetap ikut tercetak. */
@media print {
  .reveal[data-reveal] {
    opacity: 1 !important;
    transform: none !important;
  }
}
```

Run: `npx vitest run tests/unit/components/public-template.test.tsx`
Expected: PASS (1/1).

- [ ] **Step 13: Kunci batas bahan gerak di uji arsitektur**

Tambahkan kasus ini di dalam `describe("batasan arsitektur", …)` pada `tests/unit/architecture.test.ts`:

```ts
  it("kuis, pendaftaran, dan panel admin tidak memakai bahan gerak situs publik", () => {
    // Spec redesign §6: alur kuis /daftar dan panel admin bebas dari gerak.
    const dirs = [
      "src/components/kuis",
      "src/components/pendaftaran",
      "src/components/admin",
      "src/app/(admin)",
    ];
    const offenders = dirs.flatMap(collectSourceFiles).filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        source.includes('from "@/components/motion/') ||
        source.includes('from "motion/') ||
        source.includes('from "lenis')
      );
    });

    expect(offenders).toEqual([]);
  });
```

Run: `npx vitest run tests/unit/architecture.test.ts`
Expected: PASS. Uji ini penjaga yang langsung lulus karena belum ada yang mengimpor bahan gerak. Untuk memastikan ia bisa gagal, tambahkan sementara `import { Reveal } from "@/components/motion/reveal";` di `src/components/kuis/choice.tsx`, jalankan, lihat FAIL dengan nama berkas itu, lalu kembalikan berkasnya (`git checkout src/components/kuis/choice.tsx`).

- [ ] **Step 14: Jalankan seluruh uji unit dan lint**

Run: `npx vitest run > "$WS/t1.log" 2>&1; tail -6 "$WS/t1.log"; npx eslint src/components/motion "src/app/(public)/template.tsx" tests/unit/helpers tests/setup.ts`
Expected: semua PASS dan eslint tanpa galat.

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json tests/unit/helpers/browser-mocks.ts tests/setup.ts \
  src/components/motion/use-motion-prefs.ts src/components/motion/reveal.tsx src/components/motion/count-up.tsx \
  "src/app/(public)/template.tsx" src/app/globals.css tests/unit/architecture.test.ts \
  tests/unit/components/motion tests/unit/components/public-template.test.tsx
git commit -m "feat: add the motion foundation for the public site: reveal on scroll, counting numbers, page transition, and reduced-motion CSS"
```

---

### Task 2: Gerak interaktif — parallax, tombol magnet, kartu miring, gulir halus

**Files:**
- Create: `src/components/motion/parallax.tsx`, `src/components/motion/magnetic.tsx`, `src/components/motion/tilt.tsx`, `src/components/motion/smooth-scroll.tsx`
- Modify: `src/app/(public)/layout.tsx`
- Modify: `tests/unit/architecture.test.ts`
- Test: `tests/unit/components/motion/parallax.test.tsx`, `tests/unit/components/motion/pointer-motion.test.tsx`, `tests/unit/components/motion/smooth-scroll.test.tsx`

**Interfaces:**
- Consumes (dari Task 1): `usePrefersReducedMotion`, `useFinePointer`, `REDUCED_MOTION_QUERY`, `FINE_POINTER_QUERY`, `setMediaMatches`
- Produces:
  - `Parallax({ children, distance?: number /* bawaan 40, dibatasi ±60 */, className? })` merender `<div data-parallax="aktif|mati">`; `clampParallax(distance): number`; `MAX_PARALLAX = 60`
  - `Magnetic({ children, className? })` merender `<span data-magnetic="aktif|mati" class="inline-block">`; `magneticOffset(rect, x, y, max = 8): { x, y }`
  - `Tilt({ children, className? })` merender `<div data-tilt="aktif|mati">`; `tiltAngles(rect, x, y, max = 6): { rotateX, rotateY }`
  - `SmoothScroll()` merender `<ReactLenis root />` hanya untuk perangkat berkursor tanpa kurangi gerakan; `LENIS_OPTIONS`

- [ ] **Step 1: Tulis uji parallax (gagal)**

Buat `tests/unit/components/motion/parallax.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clampParallax, MAX_PARALLAX, Parallax } from "@/components/motion/parallax";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

describe("clampParallax", () => {
  it("membatasi pergeseran paling jauh 60 px ke dua arah", () => {
    expect(MAX_PARALLAX).toBe(60);
    expect(clampParallax(30)).toBe(30);
    expect(clampParallax(100)).toBe(60);
    expect(clampParallax(-90)).toBe(-60);
  });
});

describe("Parallax", () => {
  it("tidak menggeser isi bila kurangi gerakan", () => {
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    render(
      <Parallax distance={40}>
        <p>Foto</p>
      </Parallax>,
    );
    const wrapper = screen.getByText("Foto").parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute("data-parallax", "mati");
    expect(wrapper.style.transform).toBe("");
  });

  it("menggeser isi mengikuti gulir bila gerak diizinkan", () => {
    render(
      <Parallax distance={40}>
        <p>Foto</p>
      </Parallax>,
    );
    expect(screen.getByText("Foto").parentElement).toHaveAttribute("data-parallax", "aktif");
  });
});
```

Run: `npx vitest run tests/unit/components/motion/parallax.test.tsx`
Expected: FAIL, karena modul `@/components/motion/parallax` tidak ditemukan.

- [ ] **Step 2: Tulis Parallax**

Buat `src/components/motion/parallax.tsx`:

```tsx
"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./use-motion-prefs";

export const MAX_PARALLAX = 60;

export function clampParallax(distance: number): number {
  return Math.max(-MAX_PARALLAX, Math.min(MAX_PARALLAX, distance));
}

type ParallaxProps = {
  children: ReactNode;
  /** Pergeseran terjauh dalam piksel; negatif bergerak berlawanan arah. Dibatasi ±60. */
  distance?: number;
  className?: string;
};

/**
 * Isi bergeser lebih lambat atau lebih cepat dari gulir halaman. Elemennya
 * selalu motion.div (tidak berganti jenis saat hidrasi, jadi isinya tidak
 * dipasang ulang); hanya gaya geraknya yang dilepas untuk "kurangi gerakan",
 * termasuk di HTML server.
 */
export function Parallax({ children, distance = 40, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const limit = clampParallax(distance);
  const y = useTransform(scrollYProgress, [0, 1], [limit, -limit]);

  return (
    <motion.div
      ref={ref}
      data-parallax={reduce ? "mati" : "aktif"}
      className={className}
      style={reduce ? undefined : { y }}
    >
      {children}
    </motion.div>
  );
}
```

Run: `npx vitest run tests/unit/components/motion/parallax.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 3: Tulis uji tombol magnet dan kartu miring (gagal)**

Buat `tests/unit/components/motion/pointer-motion.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Magnetic, magneticOffset } from "@/components/motion/magnetic";
import { Tilt, tiltAngles } from "@/components/motion/tilt";
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

describe("magneticOffset", () => {
  const rect = { left: 100, top: 100, width: 200, height: 50 };

  it("tidak bergeser saat kursor tepat di tengah tombol", () => {
    expect(magneticOffset(rect, 200, 125)).toEqual({ x: 0, y: 0 });
  });

  it("bergeser sebanding jarak kursor dari tengah", () => {
    expect(magneticOffset(rect, 250, 125)).toEqual({ x: 4, y: 0 });
  });

  it("bergeser paling jauh 8 px walau kursor jauh di luar tombol", () => {
    expect(magneticOffset(rect, 300, 150)).toEqual({ x: 8, y: 8 });
    expect(magneticOffset(rect, 900, -400)).toEqual({ x: 8, y: -8 });
  });
});

describe("tiltAngles", () => {
  const rect = { left: 0, top: 0, width: 200, height: 100 };

  it("datar saat kursor di tengah kartu", () => {
    expect(tiltAngles(rect, 100, 50)).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it("miring paling jauh 6 derajat di sudut kartu", () => {
    expect(tiltAngles(rect, 200, 0)).toEqual({ rotateX: 6, rotateY: 6 });
    expect(tiltAngles(rect, 0, 100)).toEqual({ rotateX: -6, rotateY: -6 });
    expect(tiltAngles(rect, 900, -300)).toEqual({ rotateX: 6, rotateY: 6 });
  });
});

describe("gerak mengikuti kursor", () => {
  it("mati di layar sentuh", () => {
    render(
      <>
        <Magnetic>
          <button type="button">Daftar</button>
        </Magnetic>
        <Tilt>
          <p>Kartu</p>
        </Tilt>
      </>,
    );
    const magnet = screen.getByRole("button").parentElement as HTMLElement;
    fireEvent.pointerMove(magnet, { clientX: 300, clientY: 150 });
    expect(magnet).toHaveAttribute("data-magnetic", "mati");
    expect(magnet.style.transform).toBe("");
    expect(screen.getByText("Kartu").parentElement).toHaveAttribute("data-tilt", "mati");
  });

  it("mati bila kurangi gerakan walau ada kursor", () => {
    setMediaMatches(FINE_POINTER_QUERY, true);
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    render(
      <Magnetic>
        <button type="button">Daftar</button>
      </Magnetic>,
    );
    expect(screen.getByRole("button").parentElement).toHaveAttribute("data-magnetic", "mati");
  });

  it("aktif di perangkat berkursor", () => {
    setMediaMatches(FINE_POINTER_QUERY, true);
    render(
      <>
        <Magnetic>
          <button type="button">Daftar</button>
        </Magnetic>
        <Tilt>
          <p>Kartu</p>
        </Tilt>
      </>,
    );
    expect(screen.getByRole("button").parentElement).toHaveAttribute("data-magnetic", "aktif");
    expect(screen.getByText("Kartu").parentElement).toHaveAttribute("data-tilt", "aktif");
  });
});
```

Run: `npx vitest run tests/unit/components/motion/pointer-motion.test.tsx`
Expected: FAIL, karena modul `@/components/motion/magnetic` tidak ditemukan.

- [ ] **Step 4: Tulis Magnetic dan Tilt**

Buat `src/components/motion/magnetic.tsx`:

```tsx
"use client";

import { motion, useSpring } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFinePointer, usePrefersReducedMotion } from "./use-motion-prefs";

export const MAX_MAGNET = 8;

const SPRING = { stiffness: 220, damping: 18, mass: 0.6 };

type Box = { left: number; top: number; width: number; height: number };

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));

/** Geser ke arah kursor, sebanding jaraknya dari tengah, paling jauh `max` piksel. */
export function magneticOffset(rect: Box, pointerX: number, pointerY: number, max = MAX_MAGNET) {
  const dx = (pointerX - (rect.left + rect.width / 2)) / (rect.width / 2 || 1);
  const dy = (pointerY - (rect.top + rect.height / 2)) / (rect.height / 2 || 1);
  return { x: clampUnit(dx) * max, y: clampUnit(dy) * max };
}

/** Tombol yang tertarik ke kursor. Hanya di perangkat berkursor tanpa "kurangi gerakan". */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);
  const active = finePointer && !reduce;

  return (
    <motion.span
      data-magnetic={active ? "aktif" : "mati"}
      className={cn("inline-block", className)}
      style={active ? { x, y } : undefined}
      onPointerMove={
        active
          ? (event) => {
              const offset = magneticOffset(
                event.currentTarget.getBoundingClientRect(),
                event.clientX,
                event.clientY,
              );
              x.set(offset.x);
              y.set(offset.y);
            }
          : undefined
      }
      onPointerLeave={
        active
          ? () => {
              x.set(0);
              y.set(0);
            }
          : undefined
      }
    >
      {children}
    </motion.span>
  );
}
```

Buat `src/components/motion/tilt.tsx`:

```tsx
"use client";

import { motion, useSpring } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFinePointer, usePrefersReducedMotion } from "./use-motion-prefs";

export const MAX_TILT = 6;

const SPRING = { stiffness: 180, damping: 20 };

type Box = { left: number; top: number; width: number; height: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Sudut miring kartu (derajat) mengikuti posisi kursor; paling jauh `max` di sudut kartu. */
export function tiltAngles(rect: Box, pointerX: number, pointerY: number, max = MAX_TILT) {
  const px = clamp01((pointerX - rect.left) / (rect.width || 1));
  const py = clamp01((pointerY - rect.top) / (rect.height || 1));
  return { rotateX: (0.5 - py) * 2 * max, rotateY: (px - 0.5) * 2 * max };
}

/** Kartu yang miring mengikuti kursor. Hanya di perangkat berkursor tanpa "kurangi gerakan". */
export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const rotateX = useSpring(0, SPRING);
  const rotateY = useSpring(0, SPRING);
  const active = finePointer && !reduce;

  return (
    <motion.div
      data-tilt={active ? "aktif" : "mati"}
      className={cn("h-full", className)}
      style={active ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      onPointerMove={
        active
          ? (event) => {
              const angles = tiltAngles(
                event.currentTarget.getBoundingClientRect(),
                event.clientX,
                event.clientY,
              );
              rotateX.set(angles.rotateX);
              rotateY.set(angles.rotateY);
            }
          : undefined
      }
      onPointerLeave={
        active
          ? () => {
              rotateX.set(0);
              rotateY.set(0);
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
```

Run: `npx vitest run tests/unit/components/motion/pointer-motion.test.tsx`
Expected: PASS (8/8).

- [ ] **Step 5: Tulis uji gulir halus (gagal)**

Buat `tests/unit/components/motion/smooth-scroll.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LENIS_OPTIONS, SmoothScroll } from "@/components/motion/smooth-scroll";
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

vi.mock("lenis/react", () => ({
  ReactLenis: ({ root }: { root?: boolean }) => <div data-testid="lenis" data-root={String(root)} />,
}));

describe("SmoothScroll", () => {
  it("memasang gulir halus global di perangkat berkursor", () => {
    setMediaMatches(FINE_POINTER_QUERY, true);
    render(<SmoothScroll />);
    expect(screen.getByTestId("lenis")).toHaveAttribute("data-root", "true");
  });

  it("membiarkan gulir asli di layar sentuh", () => {
    render(<SmoothScroll />);
    expect(screen.queryByTestId("lenis")).not.toBeInTheDocument();
  });

  it("membiarkan gulir asli bila kurangi gerakan", () => {
    setMediaMatches(FINE_POINTER_QUERY, true);
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    render(<SmoothScroll />);
    expect(screen.queryByTestId("lenis")).not.toBeInTheDocument();
  });

  it("tidak mengambil alih gulir di dalam panel dialog", () => {
    document.body.innerHTML =
      '<div role="dialog"><ul><li id="di-dialog">Menu</li></ul></div><p id="di-luar">Isi</p>';
    expect(LENIS_OPTIONS.prevent(document.getElementById("di-dialog") as HTMLElement)).toBe(true);
    expect(LENIS_OPTIONS.prevent(document.getElementById("di-luar") as HTMLElement)).toBe(false);
    expect(LENIS_OPTIONS.syncTouch).toBe(false);
  });
});
```

Run: `npx vitest run tests/unit/components/motion/smooth-scroll.test.tsx`
Expected: FAIL, karena modul `@/components/motion/smooth-scroll` tidak ditemukan.

- [ ] **Step 6: Tulis SmoothScroll**

Buat `src/components/motion/smooth-scroll.tsx`:

```tsx
"use client";

import type { LenisOptions } from "lenis";
import { ReactLenis } from "lenis/react";
import { useFinePointer, usePrefersReducedMotion } from "./use-motion-prefs";

export const LENIS_OPTIONS = {
  autoRaf: true,
  lerp: 0.12,
  smoothWheel: true,
  // Sentuhan tetap memakai gulir asli HP.
  syncTouch: false,
  // Panel menu dan dialog memakai gulir aslinya sendiri.
  prevent: (node: HTMLElement) => node.closest("[role='dialog']") !== null,
} satisfies LenisOptions;

/**
 * Gulir halus untuk roda tetikus di desktop. Dipasang sebagai saudara isi
 * halaman, bukan pembungkusnya: menyalakannya setelah hidrasi tidak
 * memasang ulang halaman. Halaman lain mengambil instansnya lewat useLenis().
 */
export function SmoothScroll() {
  const reduce = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  if (reduce || !finePointer) return null;
  return <ReactLenis root options={LENIS_OPTIONS} />;
}
```

Run: `npx vitest run tests/unit/components/motion/smooth-scroll.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 7: Kunci tempat Lenis di uji arsitektur (gagal)**

Tambahkan di `tests/unit/architecture.test.ts`, di dalam `describe` yang sama:

```ts
  it("gulir halus hanya dipasang sekali, di layout situs publik", () => {
    // Spec redesign §6: Lenis hanya di layout (public); panel admin dan kuis memakai gulir asli.
    const mounts = collectSourceFiles("src").filter((file) =>
      readFileSync(file, "utf8").includes("<SmoothScroll"),
    );
    expect(mounts).toEqual(["src/app/(public)/layout.tsx"]);
  });
```

Run: `npx vitest run tests/unit/architecture.test.ts`
Expected: FAIL, dengan `expected [] to deeply equal [ 'src/app/(public)/layout.tsx' ]`.

- [ ] **Step 8: Pasang di layout publik**

Ubah `src/app/(public)/layout.tsx` menjadi:

```tsx
import "lenis/dist/lenis.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Toaster } from "@/components/ui/sonner";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Gulir halus roda tetikus di desktop; mati di layar sentuh dan untuk "kurangi gerakan". */}
      <SmoothScroll />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <WhatsAppFab />
      {/* Pesan untuk customer di /daftar dan /cek-booking (galat kirim, jam penuh, kuis diperbarui). */}
      <Toaster />
    </>
  );
}
```

Run: `npx vitest run tests/unit/architecture.test.ts`
Expected: PASS.

- [ ] **Step 9: Jalankan seluruh uji unit, lint, dan tipe**

Run: `npx vitest run > "$WS/t2.log" 2>&1; tail -6 "$WS/t2.log"; npx eslint src/components/motion "src/app/(public)/layout.tsx"; npx tsc --noEmit -p . > "$WS/t2-tsc.log" 2>&1; tail -5 "$WS/t2-tsc.log"`
Expected: semua PASS, eslint bersih, dan `tsc` tanpa galat.

- [ ] **Step 10: Commit**

```bash
git add src/components/motion/parallax.tsx src/components/motion/magnetic.tsx src/components/motion/tilt.tsx \
  src/components/motion/smooth-scroll.tsx "src/app/(public)/layout.tsx" tests/unit/architecture.test.ts \
  tests/unit/components/motion/parallax.test.tsx tests/unit/components/motion/pointer-motion.test.tsx \
  tests/unit/components/motion/smooth-scroll.test.tsx
git commit -m "feat: add parallax, magnetic buttons, tilting cards, and desktop smooth scrolling that stay off for touch and reduced motion"
```

---
### Task 3: Foto & data — peta foto, angka klinik, kueri katalog

**Files:**
- Create: `src/lib/site-images.ts`
- Modify: `src/lib/clinic.ts`
- Modify: `src/lib/whatsapp.ts` (tambah `generalInquiryMessage`)
- Modify: `src/server/catalog.ts`
- Test: `tests/unit/site-images.test.ts`, `tests/unit/clinic.test.ts`, `tests/unit/whatsapp.test.ts`, `tests/integration/catalog.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type SiteImage = { src: string; alt: string }`
  - `CATEGORY_IMAGES: Record<string, SiteImage>` (kunci = slug kategori; `slimming` → `kategori-slimming-wellness.jpg`), `FALLBACK_IMAGE`, `STEP_IMAGES: { konsultasi, timbang, kontrol }`, `CLINIC_GALLERY: readonly SiteImage[]` (3), `PRODUCT_IMAGE`, `BRANCH_IMAGES`
  - `categoryImage(slug?: string | null): SiteImage`
  - `serviceImage(service: { name: string; imageUrl?: string | null }, categorySlug?: string | null): SiteImage`
  - `productImage(product: { name: string; imageUrl?: string | null }): SiteImage`
  - `branchImage(slug: string): SiteImage`
  - `type DoctorPhotos = { portrait: SiteImage; feature: SiteImage }` dan `doctorPhotos(staff: { slug: string; name: string; photoUrl?: string | null }): DoctorPhotos | null`
  - `OPENING_DAYS = "Senin–Sabtu"`, `OPENING_TIME = "11.00–19.00"`; `OPENING_HOURS` tetap `"Senin–Sabtu, 11.00–19.00 WITA"`
  - `CLINIC_FOUNDED_YEAR = 2026`, `CUSTOMER_COUNT = 700`
  - `generalInquiryMessage(): string`, yaitu `"Halo SunDY Clinic, saya ingin bertanya."`
  - `getSignatureServices(): Promise<ServiceWithCategory[]>`, sekarang dengan `category`
  - `getRelatedServices(categoryId: string, excludeServiceId: string, limit = 3): Promise<Service[]>`
  - `countActiveServices(): Promise<number>`

- [ ] **Step 1: Periksa isi foto untuk teks alternatif**

Buka setiap berkas di `public/images/stok/` dengan alat Read (berupa gambar). Bandingkan isinya dengan teks alternatif di Step 3, yang ditulis dari deskripsi foto saat pemilik memilihnya. Bila ada yang tidak sesuai, sesuaikan teksnya di Step 3 dan catat sebagai `Ruling:`. Teks alternatif menggambarkan isi foto saja dan tidak menyebut foto itu ruangan atau produk SunDY, karena foto ini adalah foto stok.

- [ ] **Step 2: Tulis uji peta foto, angka klinik, dan pesan WhatsApp (gagal)**

Buat `tests/unit/site-images.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRANCH_IMAGES,
  CATEGORY_IMAGES,
  CLINIC_GALLERY,
  FALLBACK_IMAGE,
  PRODUCT_IMAGE,
  STEP_IMAGES,
  branchImage,
  categoryImage,
  doctorPhotos,
  productImage,
  serviceImage,
  type SiteImage,
} from "@/lib/site-images";

const DIANE = { slug: "diane-paparang", name: "Dr. Diane Paparang, Sp.GK, AIFO-K", photoUrl: null };

// Slug kategori di prisma/seed.ts.
const SEEDED_CATEGORY_SLUGS = [
  "facial",
  "peeling",
  "rf",
  "hifu",
  "botox",
  "laser",
  "dermapen",
  "elektrocauter",
  "skin-booster",
  "vitamin-c",
  "slimming",
];

function allImages(): SiteImage[] {
  const diane = doctorPhotos(DIANE);
  return [
    ...Object.values(CATEGORY_IMAGES),
    ...Object.values(STEP_IMAGES),
    ...CLINIC_GALLERY,
    ...Object.values(BRANCH_IMAGES),
    FALLBACK_IMAGE,
    PRODUCT_IMAGE,
    ...(diane ? [diane.portrait, diane.feature] : []),
  ];
}

describe("peta foto situs publik", () => {
  it("setiap berkas yang dipetakan ada di public/", () => {
    const missing = allImages().filter((image) => !existsSync(join("public", image.src)));
    expect(missing).toEqual([]);
  });

  it("setiap foto punya teks alternatif", () => {
    expect(allImages().filter((image) => image.alt.trim() === "")).toEqual([]);
  });

  it("setiap kategori layanan di data awal punya foto sendiri", () => {
    const unmapped = SEEDED_CATEGORY_SLUGS.filter((slug) => !Object.hasOwn(CATEGORY_IMAGES, slug));
    expect(unmapped).toEqual([]);
    expect(CATEGORY_IMAGES.slimming.src).toBe("/images/stok/kategori-slimming-wellness.jpg");
  });

  it("memakai foto cadangan untuk kategori yang belum punya foto", () => {
    expect(categoryImage("kategori-baru")).toEqual(FALLBACK_IMAGE);
    expect(categoryImage(null)).toEqual(FALLBACK_IMAGE);
    expect(categoryImage(undefined)).toEqual(FALLBACK_IMAGE);
  });

  it("tidak tertipu nama bawaan objek sebagai slug kategori", () => {
    expect(categoryImage("constructor")).toEqual(FALLBACK_IMAGE);
    expect(categoryImage("__proto__")).toEqual(FALLBACK_IMAGE);
    expect(branchImage("toString")).toEqual(CLINIC_GALLERY[0]);
    expect(doctorPhotos({ slug: "constructor", name: "X" })).toBeNull();
  });

  it("mendahulukan foto layanan yang diisi lewat data", () => {
    expect(serviceImage({ name: "HIFU Wajah", imageUrl: "/images/layanan/hifu.jpg" }, "hifu")).toEqual({
      src: "/images/layanan/hifu.jpg",
      alt: "HIFU Wajah",
    });
    expect(serviceImage({ name: "HIFU Wajah", imageUrl: null }, "hifu")).toEqual(CATEGORY_IMAGES.hifu);
  });

  it("mengabaikan alamat foto yang bukan berkas lokal", () => {
    for (const imageUrl of ["https://contoh.com/a.jpg", "//cdn.contoh.com/a.jpg", "foto.jpg", "", "   "]) {
      expect(serviceImage({ name: "HIFU Wajah", imageUrl }, "hifu")).toEqual(CATEGORY_IMAGES.hifu);
      expect(productImage({ name: "Kapsul M", imageUrl })).toEqual(PRODUCT_IMAGE);
    }
  });

  it("mendahulukan foto produk yang diisi lewat data", () => {
    expect(productImage({ name: "Kapsul M", imageUrl: "/images/produk/kapsul-m.jpg" })).toEqual({
      src: "/images/produk/kapsul-m.jpg",
      alt: "Kapsul M",
    });
  });

  it("memetakan dua foto dr. Diane menurut slug staf", () => {
    const photos = doctorPhotos(DIANE);
    expect(photos?.portrait.src).toBe("/images/dokter/diane-1.jpg");
    expect(photos?.feature.src).toBe("/images/dokter/diane-2.jpg");
    expect(photos?.portrait.alt).toBe("dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic");
  });

  it("mendahulukan foto staf yang diisi lewat data, dan kosong bila tidak ada foto", () => {
    expect(doctorPhotos({ slug: "dokter-baru", name: "dr. Baru", photoUrl: "/images/dokter/baru.jpg" })).toEqual({
      portrait: { src: "/images/dokter/baru.jpg", alt: "dr. Baru" },
      feature: { src: "/images/dokter/baru.jpg", alt: "dr. Baru" },
    });
    expect(doctorPhotos({ slug: "terapis-mahakeret", name: "Terapis" })).toBeNull();
  });

  it("memberi setiap cabang foto, dengan cadangan untuk cabang baru", () => {
    expect(branchImage("mahakeret")).toEqual(BRANCH_IMAGES.mahakeret);
    expect(branchImage("cabang-baru")).toEqual(CLINIC_GALLERY[0]);
  });
});
```

Buat `tests/unit/clinic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CLINIC_FOUNDED_YEAR,
  CUSTOMER_COUNT,
  OPENING_DAYS,
  OPENING_HOURS,
  OPENING_TIME,
} from "@/lib/clinic";

describe("data klinik", () => {
  it("menyusun jam buka dari hari dan jam, tanpa mengubah teks yang sudah tayang", () => {
    expect(OPENING_DAYS).toBe("Senin–Sabtu");
    expect(OPENING_TIME).toBe("11.00–19.00");
    expect(OPENING_HOURS).toBe("Senin–Sabtu, 11.00–19.00 WITA");
  });

  it("memakai angka dari pemilik", () => {
    expect(CUSTOMER_COUNT).toBe(700);
    expect(CLINIC_FOUNDED_YEAR).toBe(2026);
  });
});
```

Tambahkan `generalInquiryMessage` ke import di `tests/unit/whatsapp.test.ts`, lalu tambahkan di akhir berkas:

```ts
describe("generalInquiryMessage", () => {
  it("menyapa klinik untuk pertanyaan umum", () => {
    expect(generalInquiryMessage()).toBe("Halo SunDY Clinic, saya ingin bertanya.");
  });
});
```

Run: `npx vitest run tests/unit/site-images.test.ts tests/unit/clinic.test.ts tests/unit/whatsapp.test.ts`
Expected: FAIL, karena `@/lib/site-images` tidak ditemukan, `OPENING_DAYS`/`CUSTOMER_COUNT` tidak terdefinisi, dan `generalInquiryMessage is not a function`.

- [ ] **Step 3: Tulis peta foto, konstanta, dan pesan WhatsApp**

Buat `src/lib/site-images.ts`:

```ts
/**
 * Foto situs publik: berkas, teks alternatif, dan kegunaannya.
 *
 * Foto stok sementara dari Unsplash (sumbernya di public/images/stok/SUMBER.md).
 * Menggantinya dengan foto klinik sendiri cukup dengan menimpa berkas bernama sama.
 *
 * Foto yang diisi lewat data (Service.imageUrl, Product.imageUrl, Staff.photoUrl)
 * didahulukan, asalkan berupa berkas lokal yang diawali "/". next/image di situs
 * ini tidak mengizinkan domain luar, jadi alamat lain diabaikan dan foto
 * cadangan yang dipakai.
 */
export type SiteImage = { src: string; alt: string };

export type DoctorPhotos = {
  /** Foto 1 (latar krem): hero Beranda dan Tentang. */
  portrait: SiteImage;
  /** Foto 2 (latar biru): bagian Dokter. */
  feature: SiteImage;
};

const STOCK = "/images/stok";

export const CATEGORY_IMAGES: Record<string, SiteImage> = {
  facial: { src: `${STOCK}/kategori-facial.jpg`, alt: "Masker wajah dioleskan saat perawatan facial" },
  peeling: { src: `${STOCK}/kategori-peeling.jpg`, alt: "Pipet meneteskan cairan bening" },
  rf: { src: `${STOCK}/kategori-rf.jpg`, alt: "Roller perawatan kulit berwarna putih dan perak" },
  hifu: { src: `${STOCK}/kategori-hifu.jpg`, alt: "Perawatan wajah dengan alat logam" },
  botox: { src: `${STOCK}/kategori-botox.jpg`, alt: "Tangan memegang jarum suntik" },
  laser: { src: `${STOCK}/kategori-laser.jpg`, alt: "Perawatan laser pada kaki" },
  dermapen: { src: `${STOCK}/kategori-dermapen.jpg`, alt: "Roller perawatan kulit berwarna emas" },
  elektrocauter: {
    src: `${STOCK}/kategori-elektrocauter.jpg`,
    alt: "Tangan bersarung tangan memegang nampan alat",
  },
  "skin-booster": {
    src: `${STOCK}/kategori-skin-booster.jpg`,
    alt: "Botol serum berpipet dengan bayangan panjang",
  },
  "vitamin-c": { src: `${STOCK}/kategori-vitamin-c.jpg`, alt: "Jeruk dan pipet serum" },
  slimming: {
    src: `${STOCK}/kategori-slimming-wellness.jpg`,
    alt: "Irisan sayuran segar di atas piring putih",
  },
};

export const CLINIC_GALLERY: readonly SiteImage[] = [
  { src: `${STOCK}/suasana-1.jpg`, alt: "Meja bundar putih di dekat dinding putih" },
  { src: `${STOCK}/suasana-2.jpg`, alt: "Ranjang perawatan berseprai krem di samping wastafel" },
  { src: `${STOCK}/suasana-3.jpg`, alt: "Rak produk perawatan kulit di lorong yang terang" },
];

/** Foto untuk kategori yang belum punya foto sendiri. */
export const FALLBACK_IMAGE: SiteImage = CLINIC_GALLERY[2];

export const STEP_IMAGES = {
  konsultasi: { src: `${STOCK}/langkah-konsultasi.jpg`, alt: "Stetoskop di atas latar putih" },
  timbang: { src: `${STOCK}/langkah-timbang.jpg`, alt: "Semangkuk salad sayur di mangkuk kaca" },
  kontrol: { src: `${STOCK}/langkah-kontrol.jpg`, alt: "Pinggang diukur dengan pita ukur kuning" },
} satisfies Record<string, SiteImage>;

export const PRODUCT_IMAGE: SiteImage = { src: `${STOCK}/produk.jpg`, alt: "Tiga botol putih" };

export const BRANCH_IMAGES: Record<string, SiteImage> = {
  mahakeret: CLINIC_GALLERY[0],
  citraland: CLINIC_GALLERY[1],
};

const DOCTOR_PHOTOS: Record<string, DoctorPhotos> = {
  "diane-paparang": {
    portrait: {
      src: "/images/dokter/diane-1.jpg",
      alt: "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic",
    },
    feature: {
      src: "/images/dokter/diane-2.jpg",
      alt: "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic",
    },
  },
};

function isLocalImage(url: string | null | undefined): url is string {
  return typeof url === "string" && /^\/(?!\/)\S+$/.test(url);
}

/** Dicari dengan Object.hasOwn: slug seperti "constructor" tidak boleh terbaca sebagai milik objek. */
function lookup<T>(map: Record<string, T>, key: string | null | undefined): T | undefined {
  return key && Object.hasOwn(map, key) ? map[key] : undefined;
}

export function categoryImage(slug?: string | null): SiteImage {
  return lookup(CATEGORY_IMAGES, slug) ?? FALLBACK_IMAGE;
}

export function serviceImage(
  service: { name: string; imageUrl?: string | null },
  categorySlug?: string | null,
): SiteImage {
  if (isLocalImage(service.imageUrl)) return { src: service.imageUrl, alt: service.name };
  return categoryImage(categorySlug);
}

export function productImage(product: { name: string; imageUrl?: string | null }): SiteImage {
  if (isLocalImage(product.imageUrl)) return { src: product.imageUrl, alt: product.name };
  return PRODUCT_IMAGE;
}

export function branchImage(slug: string): SiteImage {
  return lookup(BRANCH_IMAGES, slug) ?? CLINIC_GALLERY[0];
}

export function doctorPhotos(staff: {
  slug: string;
  name: string;
  photoUrl?: string | null;
}): DoctorPhotos | null {
  if (isLocalImage(staff.photoUrl)) {
    const photo = { src: staff.photoUrl, alt: staff.name };
    return { portrait: photo, feature: photo };
  }
  return lookup(DOCTOR_PHOTOS, staff.slug) ?? null;
}
```

Di `src/lib/clinic.ts`, ganti baris `export const OPENING_HOURS = "Senin–Sabtu, 11.00–19.00 WITA";` dengan:

```ts
export const OPENING_DAYS = "Senin–Sabtu";
export const OPENING_TIME = "11.00–19.00";
export const OPENING_HOURS = `${OPENING_DAYS}, ${OPENING_TIME} WITA`;
```

Lalu tambahkan di akhir berkas:

```ts
/** Tahun berdiri. Angka dari pemilik, 3 Okt 2026. */
export const CLINIC_FOUNDED_YEAR = 2026;
/** Jumlah customer, ditampilkan "700+". Angka dari pemilik, 3 Okt 2026. */
export const CUSTOMER_COUNT = 700;
```

Di `src/lib/whatsapp.ts`, tambahkan tepat di atas `export function productInquiryMessage`:

```ts
/** Pesan pembuka untuk pertanyaan umum (tombol WhatsApp melayang, menu ponsel, ajakan akhir). */
export function generalInquiryMessage(): string {
  return `Halo ${CLINIC_NAME}, saya ingin bertanya.`;
}
```

Bila `CLINIC_NAME` belum diimpor di `src/lib/whatsapp.ts`, tambahkan ke import `@/lib/clinic` yang sudah ada.

Run: `npx vitest run tests/unit/site-images.test.ts tests/unit/clinic.test.ts tests/unit/whatsapp.test.ts tests/unit/components/site-footer.test.tsx`
Expected: PASS semua. Uji footer memastikan teks jam buka yang sudah tayang tidak berubah.

- [ ] **Step 4: Tulis uji kueri katalog (gagal)**

Di `tests/integration/catalog.test.ts`, tambahkan `countActiveServices` dan `getRelatedServices` ke import `@/server/catalog`. Lalu tambahkan kasus berikut di akhir `describe`:

```ts
  it("menyertakan kategori pada layanan signature, untuk foto kartunya", async () => {
    const signature = await getSignatureServices();
    expect(signature.find((s) => s.slug === "hifu-wajah")?.category.slug).toBe("hifu");
  });

  it("mengambil sampai tiga layanan lain dalam kategori yang sama, terurut", async () => {
    const hifu = await getServiceBySlug("hifu-wajah");
    const related = await getRelatedServices(hifu!.categoryId, hifu!.id);
    expect(related.map((s) => s.slug)).toEqual(["hifu-miss-v", "hifu-perut"]);

    const rfPerut = await getServiceBySlug("rf-perut");
    const rf = await getRelatedServices(rfPerut!.categoryId, rfPerut!.id);
    expect(rf.map((s) => s.slug)).toEqual(["rf-paha", "rf-lengan", "rf-wajah"]);
  });

  it("tidak menawarkan layanan nonaktif sebagai treatment lain", async () => {
    await prisma.service.update({ where: { slug: "hifu-perut" }, data: { isActive: false } });
    try {
      const hifu = await getServiceBySlug("hifu-wajah");
      const related = await getRelatedServices(hifu!.categoryId, hifu!.id);
      expect(related.map((s) => s.slug)).toEqual(["hifu-miss-v"]);
    } finally {
      await prisma.service.update({ where: { slug: "hifu-perut" }, data: { isActive: true } });
    }
  });

  it("menghitung layanan aktif untuk angka di Beranda", async () => {
    const total = await countActiveServices();
    expect(total).toBe((await getAllServiceSlugs()).length);

    await prisma.service.update({ where: { slug: "botox" }, data: { isActive: false } });
    try {
      expect(await countActiveServices()).toBe(total - 1);
    } finally {
      await prisma.service.update({ where: { slug: "botox" }, data: { isActive: true } });
    }
  });
```

Run: `npm run test:integration -- tests/integration/catalog.test.ts`
Expected: FAIL, karena `getRelatedServices`/`countActiveServices` bukan fungsi dan `category` undefined pada layanan signature.

- [ ] **Step 5: Tulis kueri katalog**

Di `src/server/catalog.ts`, ganti `getSignatureServices` dengan:

```ts
/** Layanan signature beserta kategorinya (foto kartu memakai foto kategori). */
export async function getSignatureServices(): Promise<ServiceWithCategory[]> {
  return prisma.service.findMany({
    where: { isSignature: true, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { category: true },
  });
}

/** Layanan aktif lain dalam kategori yang sama, untuk "Treatment lain di …" di halaman detail. */
export async function getRelatedServices(
  categoryId: string,
  excludeServiceId: string,
  limit = 3,
): Promise<Service[]> {
  return prisma.service.findMany({
    where: { categoryId, isActive: true, id: { not: excludeServiceId } },
    orderBy: { sortOrder: "asc" },
    take: limit,
  });
}

/** Jumlah treatment aktif, untuk angka di Beranda. */
export async function countActiveServices(): Promise<number> {
  return prisma.service.count({ where: { isActive: true } });
}
```

Run: `npm run test:integration -- tests/integration/catalog.test.ts`
Expected: PASS semua, termasuk "mengembalikan empat layanan signature" yang sudah ada.

- [ ] **Step 6: Periksa tipe dan uji unit**

Run: `npx tsc --noEmit -p . > "$WS/t3-tsc.log" 2>&1; tail -5 "$WS/t3-tsc.log"; npx vitest run > "$WS/t3.log" 2>&1; tail -6 "$WS/t3.log"`
Expected: `tsc` tanpa galat (`src/app/(public)/page.tsx` tetap cocok, karena `ServiceCard` menerima objek yang kini juga berisi `category`), dan semua uji unit PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/site-images.ts src/lib/clinic.ts src/lib/whatsapp.ts src/server/catalog.ts \
  tests/unit/site-images.test.ts tests/unit/clinic.test.ts tests/unit/whatsapp.test.ts tests/integration/catalog.test.ts
git commit -m "feat: map the stock and doctor photos, add the owner's numbers, and query signature categories, related treatments, and the treatment count"
```

---

### Task 4: Bahan visual publik — bentuk emas, foto lengkung, kartu melayang, kepala halaman

**Files:**
- Create: `src/components/public/morph-blob.tsx`, `src/components/public/arch-image.tsx`, `src/components/public/floating-chip.tsx`, `src/components/public/eyebrow.tsx`, `src/components/public/page-hero.tsx`
- Test: `tests/unit/components/public-visuals.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: kelas `.morph-blob`, `.morph-blob__part.blob-a/b/c`, `.arch-rise`, `.zoom-slow`, `.float-y`, `.hero-line`, `.hero-bleed`
  - Task 2: `Parallax` (bentuk emas di kepala halaman)
  - Task 3: `SiteImage`
- Produces:
  - `MorphBlob({ className?, tone?: "gold" | "cream" })`: `<div aria-hidden="true" class="morph-blob absolute …">`; posisi dan ukuran lewat `className`
  - `ArchImage({ image: SiteImage, sizes: string, priority?: boolean, rise?: boolean, className? })`: lebar dan rasio lewat `className` (misalnya `"aspect-[4/5] w-full"`)
  - `FloatingChip({ children, className?, delayMs?: number })`: kartu kecil `absolute`; posisi lewat `className`
  - `Eyebrow({ children })`: `<p>` label kecil emas
  - `PageHero({ title, eyebrow?, description?, image?, imageSize?: "small" | "large", children? })`: `<section class="hero-bleed …">` dengan `<h1>`

- [ ] **Step 1: Tulis uji bahan visual (gagal)**

Buat `tests/unit/components/public-visuals.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArchImage } from "@/components/public/arch-image";
import { FloatingChip } from "@/components/public/floating-chip";
import { MorphBlob } from "@/components/public/morph-blob";
import { PageHero } from "@/components/public/page-hero";

const PHOTO = { src: "/images/stok/suasana-3.jpg", alt: "Rak produk perawatan kulit di lorong yang terang" };

describe("bahan visual situs publik", () => {
  it("menyembunyikan bentuk emas dari pembaca layar", () => {
    const { container } = render(<MorphBlob className="h-40 w-40" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".morph-blob__part")).toHaveLength(3);
  });

  it("menampilkan foto lengkung dengan teks alternatif, dan naik dari bingkai bila diminta", () => {
    const { container } = render(<ArchImage image={PHOTO} sizes="200px" rise className="w-40" />);
    expect(screen.getByRole("img", { name: PHOTO.alt })).toBeInTheDocument();
    expect(container.querySelector(".arch-rise")).not.toBeNull();
  });

  it("tidak menaikkan foto lengkung di bawah layar", () => {
    const { container } = render(<ArchImage image={PHOTO} sizes="200px" />);
    expect(container.querySelector(".arch-rise")).toBeNull();
  });

  it("menjadikan kartu kecil melayang dengan jeda yang diminta", () => {
    render(<FloatingChip delayMs={1200}>700+ customer</FloatingChip>);
    const chip = screen.getByText("700+ customer");
    expect(chip).toHaveClass("float-y");
    expect(chip.style.animationDelay).toBe("1200ms");
  });

  it("menampilkan kepala halaman dengan judul h1, deskripsi, tombol, dan foto yang dimuat lebih dulu", () => {
    render(
      <PageHero title="Layanan & Harga" description={<p>35 treatment · harga promo berlaku</p>} image={PHOTO}>
        <a href="/daftar">Daftar Konsultasi</a>
      </PageHero>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Layanan & Harga" })).toBeInTheDocument();
    expect(screen.getByText("35 treatment · harga promo berlaku")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: PHOTO.alt })).not.toHaveAttribute("loading", "lazy");
  });

  it("tetap rapi tanpa foto", () => {
    render(<PageHero title="Tanya Jawab" />);
    expect(screen.getByRole("heading", { level: 1, name: "Tanya Jawab" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/components/public-visuals.test.tsx`
Expected: FAIL, karena modul `@/components/public/arch-image` tidak ditemukan.

- [ ] **Step 2: Tulis bahan visual**

Buat `src/components/public/morph-blob.tsx`:

```tsx
import { cn } from "@/lib/utils";

type MorphBlobProps = {
  /** Posisi dan ukuran, misalnya "-right-24 -top-24 h-80 w-80". */
  className?: string;
  tone?: "gold" | "cream";
};

/**
 * Bentuk emas cair: tiga gumpalan bergradasi yang bergeser dan berputar dengan
 * tempo berbeda (CSS di globals.css). Hiasan saja, jadi disembunyikan dari
 * pembaca layar dan tidak menangkap klik. Induknya perlu `relative` dan
 * `overflow-hidden` supaya bentuknya tidak membuat halaman menggulir ke samping.
 */
export function MorphBlob({ className, tone = "gold" }: MorphBlobProps) {
  return (
    <div aria-hidden="true" data-tone={tone} className={cn("morph-blob pointer-events-none absolute", className)}>
      <span className="morph-blob__part blob-a" />
      <span className="morph-blob__part blob-b" />
      <span className="morph-blob__part blob-c" />
    </div>
  );
}
```

Buat `src/components/public/arch-image.tsx`:

```tsx
import Image from "next/image";
import type { SiteImage } from "@/lib/site-images";
import { cn } from "@/lib/utils";

type ArchImageProps = {
  image: SiteImage;
  sizes: string;
  /** Untuk foto di kepala halaman: dimuat paling dulu. */
  priority?: boolean;
  /** Foto naik dari dalam bingkai saat halaman dibuka (untuk hero). Foto di bawah layar dibungkus Reveal. */
  rise?: boolean;
  /** Lebar dan rasio, misalnya "aspect-[4/5] w-full". */
  className?: string;
};

/**
 * Foto dalam bingkai lengkung: atas setengah lingkaran, bawah membulat.
 * Dua lapis pemotong karena satu border-radius tidak bisa membuat keduanya:
 * radius atas yang sangat besar ikut mengecilkan radius bawah.
 */
export function ArchImage({ image, sizes, priority = false, rise = false, className }: ArchImageProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-b-[2rem]", className)}>
      <div className="absolute inset-0 overflow-hidden rounded-t-full bg-cream-200">
        <div className={cn("absolute inset-0", rise && "arch-rise")}>
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes={sizes}
            priority={priority}
            className="zoom-slow object-cover"
          />
        </div>
      </div>
    </div>
  );
}
```

Buat `src/components/public/floating-chip.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FloatingChipProps = {
  children: ReactNode;
  /** Posisi, misalnya "-left-4 bottom-16". */
  className?: string;
  /** Jeda awal ayunan supaya beberapa kartu tidak naik-turun serempak. */
  delayMs?: number;
};

/** Kartu kecil yang naik-turun pelan ±8 px di atas foto hero. */
export function FloatingChip({ children, className, delayMs = 0 }: FloatingChipProps) {
  return (
    <div
      className={cn(
        "float-y absolute rounded-2xl border border-cream-300 bg-white/95 px-4 py-3 text-sm shadow-[0_18px_40px_-20px_rgb(107_85_53/0.55)]",
        className,
      )}
      style={delayMs > 0 ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
```

Buat `src/components/public/eyebrow.tsx`:

```tsx
import type { ReactNode } from "react";

/** Label kecil di atas judul bagian. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">{children}</p>;
}
```

Buat `src/components/public/page-hero.tsx`:

```tsx
import type { ReactNode } from "react";
import { Parallax } from "@/components/motion/parallax";
import type { SiteImage } from "@/lib/site-images";
import { cn } from "@/lib/utils";
import { ArchImage } from "./arch-image";
import { MorphBlob } from "./morph-blob";

type PageHeroProps = {
  title: string;
  /** Baris kecil di atas judul, misalnya jejak halaman. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  image?: SiteImage | null;
  /** "large" untuk detail layanan; bawaannya foto kecil di samping judul. */
  imageSize?: "small" | "large";
  /** Tombol atau chip di bawah deskripsi. */
  children?: ReactNode;
};

const IMAGE_CLASS = {
  small: "w-24 sm:w-48 lg:w-56",
  large: "w-28 sm:w-64 lg:w-80",
};

const IMAGE_SIZES = {
  small: "(min-width: 1024px) 224px, (min-width: 640px) 192px, 96px",
  large: "(min-width: 1024px) 320px, (min-width: 640px) 256px, 112px",
};

/**
 * Kepala halaman bersama: latar krem–emas yang menerus ke balik header
 * transparan, bentuk emas cair, judul yang naik per baris, dan foto lengkung.
 */
export function PageHero({ title, eyebrow, description, image, imageSize = "small", children }: PageHeroProps) {
  return (
    <section className="hero-bleed relative overflow-hidden bg-[radial-gradient(110%_120%_at_0%_0%,var(--color-cream-100),var(--color-cream-200)_55%,var(--color-gold-300))] pb-14">
      {/* Bentuk emas sedikit ikut bergeser saat digulir (spec §3.2). */}
      <Parallax
        distance={-30}
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 sm:h-[28rem] sm:w-[28rem]"
      >
        <MorphBlob className="inset-0" />
      </Parallax>
      <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-6 px-4 sm:items-center">
        <div className="min-w-0">
          {eyebrow && <div className="hero-line text-sm text-brown-600">{eyebrow}</div>}
          <h1
            className="hero-line mt-2 font-display text-4xl leading-tight text-brown-900 sm:text-5xl"
            style={{ animationDelay: "80ms" }}
          >
            {title}
          </h1>
          {description && (
            <div className="hero-line mt-4 max-w-2xl text-brown-700" style={{ animationDelay: "160ms" }}>
              {description}
            </div>
          )}
        </div>
        {image && (
          <ArchImage
            image={image}
            priority
            rise
            sizes={IMAGE_SIZES[imageSize]}
            className={cn("aspect-[4/5] justify-self-end sm:row-span-2", IMAGE_CLASS[imageSize])}
          />
        )}
        {children && (
          <div className="hero-line col-span-2 sm:col-span-1" style={{ animationDelay: "240ms" }}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
```

Run: `npx vitest run tests/unit/components/public-visuals.test.tsx`
Expected: PASS (6/6).

- [ ] **Step 3: Lint dan commit**

Run: `npx eslint src/components/public`
Expected: tanpa galat.

```bash
git add src/components/public tests/unit/components/public-visuals.test.tsx
git commit -m "feat: add the liquid gold shape, arched photos, floating chips, and the shared page hero"
```

---

### Task 5: Header, menu ponsel, footer, dan tombol WhatsApp

**Files:**
- Create: `src/components/layout/nav-items.ts`, `src/components/layout/header-shell.tsx`, `src/components/layout/nav-links.tsx`, `src/components/layout/mobile-menu.tsx`
- Modify: `src/components/layout/site-header.tsx`, `src/components/layout/site-footer.tsx`, `src/components/layout/whatsapp-fab.tsx`
- Modify: `src/app/(public)/layout.tsx`
- Test: `tests/unit/components/site-header.test.tsx`, `tests/unit/components/whatsapp-fab.test.tsx`, `tests/unit/components/site-footer.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `--header-h`, `.fab-in`, `.panel-in`
  - Task 2: `Magnetic`
  - Task 3: `generalInquiryMessage`
  - Task 4: `MorphBlob`
- Produces:
  - `type NavItem = { href: string; label: string }`, `PRIMARY_NAV`, `MOBILE_NAV`, `isActivePath(pathname, href): boolean`
  - `headerStartsSolid(pathname): boolean`, `SCROLL_THRESHOLD = 40`, `HeaderShell({ children })`, yaitu `<header data-solid="true|false" class="group/header fixed …">`
  - `NavLinks({ links })` dan `MobileMenu({ links })`
  - kelas `whatsapp-fab` pada tombol WhatsApp (dipakai CSS bar booking di Task 8)
  - `<main class="pt-[var(--header-h)]">` di layout publik

- [ ] **Step 1: Tulis uji header dan menu (gagal)**

Buat `tests/unit/components/site-header.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeaderShell, headerStartsSolid } from "@/components/layout/header-shell";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { isActivePath, MOBILE_NAV, PRIMARY_NAV } from "@/components/layout/nav-items";
import { NavLinks } from "@/components/layout/nav-links";
import { SiteHeader } from "@/components/layout/site-header";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

// Tautan Next membutuhkan router aplikasi; di sini cukup <a> yang tidak benar-benar berpindah halaman.
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

afterEach(() => {
  navigation.pathname = "/";
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("isActivePath", () => {
  it("menandai halaman itu dan halaman turunannya saja", () => {
    expect(isActivePath("/layanan", "/layanan")).toBe(true);
    expect(isActivePath("/layanan/hifu-wajah", "/layanan")).toBe(true);
    expect(isActivePath("/layanan-baru", "/layanan")).toBe(false);
    expect(isActivePath("/layanan", "/")).toBe(false);
    expect(isActivePath("/", "/")).toBe(true);
  });
});

describe("headerStartsSolid", () => {
  it("langsung krem di halaman tanpa kepala halaman berwarna", () => {
    expect(headerStartsSolid("/daftar")).toBe(true);
    expect(headerStartsSolid("/cek-booking")).toBe(true);
    expect(headerStartsSolid("/isi")).toBe(true);
    expect(headerStartsSolid("/kebijakan-privasi")).toBe(true);
    expect(headerStartsSolid("/syarat-ketentuan")).toBe(true);
    expect(headerStartsSolid("/")).toBe(false);
    expect(headerStartsSolid("/layanan/hifu-wajah")).toBe(false);
    expect(headerStartsSolid("/daftarkan")).toBe(false);
  });
});

describe("HeaderShell", () => {
  it("transparan di atas hero lalu krem setelah digulir lebih dari 40 px", () => {
    render(
      <HeaderShell>
        <span>Isi</span>
      </HeaderShell>,
    );
    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("data-solid", "false");

    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    fireEvent.scroll(window);
    expect(header).toHaveAttribute("data-solid", "true");

    Object.defineProperty(window, "scrollY", { configurable: true, value: 10 });
    fireEvent.scroll(window);
    expect(header).toHaveAttribute("data-solid", "false");
  });

  it("langsung krem di halaman kuis", () => {
    navigation.pathname = "/daftar";
    render(
      <HeaderShell>
        <span>Isi</span>
      </HeaderShell>,
    );
    expect(screen.getByRole("banner")).toHaveAttribute("data-solid", "true");
  });
});

describe("NavLinks", () => {
  it("menandai menu halaman yang sedang dibuka", () => {
    navigation.pathname = "/layanan/hifu-wajah";
    render(<NavLinks links={PRIMARY_NAV} />);
    expect(screen.getByRole("link", { name: "Layanan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Produk" })).not.toHaveAttribute("aria-current");
  });
});

describe("MobileMenu", () => {
  it("membuka panel berisi semua menu, Daftar Konsultasi, dan WhatsApp, lalu menutup saat tautan diklik", async () => {
    const user = userEvent.setup();
    render(<MobileMenu links={MOBILE_NAV} />);

    await user.click(screen.getByRole("button", { name: "Buka menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    for (const item of MOBILE_NAV) {
      expect(within(dialog).getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
    expect(within(dialog).getByRole("link", { name: "Beranda" })).toHaveAttribute("aria-current", "page");
    expect(within(dialog).getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    expect(within(dialog).getByRole("link", { name: /WhatsApp 0851-7222-8900/ }).getAttribute("href")).toContain(
      "wa.me/6285172228900",
    );

    await user.click(within(dialog).getByRole("link", { name: "Produk" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("menutup panel dengan Esc dan dengan tombol tutup", async () => {
    const user = userEvent.setup();
    render(<MobileMenu links={MOBILE_NAV} />);

    await user.click(screen.getByRole("button", { name: "Buka menu" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Buka menu" }));
    await user.click(screen.getByRole("button", { name: "Tutup menu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("SiteHeader", () => {
  it("memuat logo ke beranda, menu utama, tombol daftar, dan tombol menu ponsel", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: /beranda$/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("navigation", { name: "Navigasi utama" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("link", { name: "Daftar" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("button", { name: "Buka menu" })).toBeInTheDocument();
  });
});
```

Di `tests/unit/components/whatsapp-fab.test.tsx`, tambahkan kasus ini di dalam `describe`:

```tsx
  it("masuk dengan animasi dan bisa digeser naik oleh bar booking", () => {
    render(<WhatsAppFab />);
    const link = screen.getByRole("link", { name: /chat via whatsapp/i });
    expect(link).toHaveClass("fab-in");
    expect(link).toHaveClass("whatsapp-fab");
  });
```

Di `tests/unit/components/site-footer.test.tsx`, tambahkan kasus ini di dalam `describe`:

```tsx
  it("menyembunyikan bentuk hiasan dari pembaca layar", () => {
    const { container } = render(<SiteFooter />);
    const blobs = container.querySelectorAll(".morph-blob");
    expect(blobs.length).toBeGreaterThan(0);
    blobs.forEach((blob) => expect(blob).toHaveAttribute("aria-hidden", "true"));
  });
```

Run: `npx vitest run tests/unit/components/site-header.test.tsx tests/unit/components/whatsapp-fab.test.tsx tests/unit/components/site-footer.test.tsx`
Expected: FAIL, karena `@/components/layout/header-shell` tidak ditemukan, FAB belum punya kelas `fab-in`, dan footer belum punya `.morph-blob`.

- [ ] **Step 2: Tulis daftar menu, cangkang header, menu desktop, dan menu ponsel**

Buat `src/components/layout/nav-items.ts`:

```ts
export type NavItem = { href: string; label: string };

/** Menu utama di header desktop. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/layanan", label: "Layanan" },
  { href: "/program-slimming", label: "Program Slimming" },
  { href: "/produk", label: "Produk" },
  { href: "/lokasi", label: "Lokasi" },
  { href: "/tentang", label: "Tentang" },
];

/** Menu panel ponsel: menu utama ditambah Beranda dan Tanya Jawab. */
export const MOBILE_NAV: readonly NavItem[] = [
  { href: "/", label: "Beranda" },
  ...PRIMARY_NAV,
  { href: "/faq", label: "Tanya Jawab" },
];

/** `true` bila `pathname` adalah halaman `href` atau turunannya (misalnya /layanan/hifu-wajah untuk /layanan). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

Buat `src/components/layout/header-shell.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/** Halaman tanpa kepala halaman berwarna: header sudah krem sejak atas supaya isi tidak menembus logo. */
const SOLID_PATHS = ["/daftar", "/cek-booking", "/isi", "/kebijakan-privasi", "/syarat-ketentuan"];

export const SCROLL_THRESHOLD = 40;

export function headerStartsSolid(pathname: string): boolean {
  return SOLID_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Header menempel di atas: transparan di atas hero, lalu krem buram setelah
 * digulir ±40 px. Latar krem muncul lewat opacity, dan logo mengecil lewat
 * transform (kelas group-data-[solid=true]/header di site-header.tsx). Tinggi
 * header tetap --header-h, jadi tidak ada animasi tinggi dan isi tidak melompat.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const solid = scrolled || headerStartsSolid(pathname);

  return (
    <header
      data-solid={solid ? "true" : "false"}
      className="group/header fixed inset-x-0 top-0 z-40 h-[var(--header-h)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 border-b border-cream-300 bg-cream-50/90 opacity-0 shadow-sm backdrop-blur transition-opacity duration-300 group-data-[solid=true]/header:opacity-100 motion-reduce:transition-none"
      />
      <div className="relative mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4">
        {children}
      </div>
    </header>
  );
}
```

Buat `src/components/layout/nav-links.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, type NavItem } from "./nav-items";

/** Menu desktop. Halaman aktif bergaris emas; garis yang sama muncul dari kiri saat disentuh kursor. */
export function NavLinks({ links }: { links: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigasi utama" className="hidden items-center gap-7 text-sm md:flex">
      {links.map((link) => {
        const active = isActivePath(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className="relative py-2 text-brown-700 after:absolute after:inset-x-0 after:bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-gold-500 after:transition-transform after:duration-300 hover:text-brown-900 hover:after:scale-x-100 aria-[current=page]:font-medium aria-[current=page]:text-brown-900 aria-[current=page]:after:scale-x-100 motion-reduce:after:transition-none"
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

Buat `src/components/layout/mobile-menu.tsx`:

```tsx
"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CLINIC_NAME, CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { buildWhatsAppLink, generalInquiryMessage } from "@/lib/whatsapp";
import { isActivePath, type NavItem } from "./nav-items";
import { RegisterCta } from "./register-cta";

/**
 * Menu garis tiga di ponsel: panel meluncur dari kanan, berisi semua menu,
 * Daftar Konsultasi, dan WhatsApp. Tertutup saat tautan diklik, Esc ditekan,
 * tombol tutup diklik, atau halaman berganti (termasuk lewat tombol Kembali).
 */
export function MobileMenu({ links }: { links: readonly NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Buka menu"
        className="inline-flex size-10 items-center justify-center rounded-full border border-cream-300 bg-white/80 text-brown-800 md:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[82%] max-w-sm gap-0 border-cream-300 bg-cream-50 p-0"
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <SheetTitle className="font-display text-2xl text-brown-900">Menu</SheetTitle>
          <SheetClose
            aria-label="Tutup menu"
            className="inline-flex size-10 items-center justify-center rounded-full border border-cream-300 text-brown-800"
          >
            <X className="size-5" aria-hidden="true" />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">Tautan halaman {CLINIC_NAME}</SheetDescription>

        <nav aria-label="Menu ponsel" className="mt-4 flex flex-col px-3">
          {links.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
              className="panel-in rounded-xl px-3 py-3 font-display text-xl text-brown-800 hover:bg-cream-100 aria-[current=page]:text-gold-600"
              style={{ animationDelay: `${80 + index * 50}ms` }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto grid gap-3 p-6">
          <RegisterCta className="text-center" />
          <a
            href={buildWhatsAppLink(generalInquiryMessage())}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="rounded-full border border-gold-500 px-7 py-3 text-center font-medium text-gold-600 hover:bg-cream-100"
          >
            WhatsApp {CLINIC_WHATSAPP_DISPLAY}
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Tulis ulang header, footer, tombol WhatsApp, dan layout**

Ganti seluruh isi `src/components/layout/site-header.tsx`:

```tsx
import Link from "next/link";
import { Magnetic } from "@/components/motion/magnetic";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { HeaderShell } from "./header-shell";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { MOBILE_NAV, PRIMARY_NAV } from "./nav-items";
import { NavLinks } from "./nav-links";
import { RegisterCta } from "./register-cta";

export function SiteHeader() {
  return (
    <HeaderShell>
      <Link
        href="/"
        aria-label={`${CLINIC_FULL_NAME} — beranda`}
        className="origin-left transition-transform duration-300 group-data-[solid=true]/header:scale-90 motion-reduce:transition-none"
      >
        <Logo className="h-11 md:h-12" />
      </Link>

      <NavLinks links={PRIMARY_NAV} />

      <div className="flex items-center gap-2">
        <div className="hidden md:block">
          <Magnetic>
            <RegisterCta className="px-5 py-2.5 text-sm" />
          </Magnetic>
        </div>
        {/* Di ponsel cukup "Daftar" supaya logo, tombol, dan menu muat di lebar 390 px. */}
        <Link
          href="/daftar"
          className="rounded-full bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 md:hidden"
        >
          Daftar
        </Link>
        <MobileMenu links={MOBILE_NAV} />
      </div>
    </HeaderShell>
  );
}
```

Di `src/components/layout/site-footer.tsx`:
1. Tambahkan `import { MorphBlob } from "@/components/public/morph-blob";`.
2. Ganti pembuka `<footer className="mt-24 border-t border-cream-300 bg-cream-100">` dengan:

```tsx
    <footer className="relative overflow-hidden border-t border-cream-300 bg-cream-100">
      <MorphBlob className="-right-32 -top-32 h-96 w-96 opacity-60" />
      <MorphBlob className="-bottom-40 -left-24 h-80 w-80 opacity-50" tone="cream" />
```

3. Tambahkan `relative` di kelas `<div className="mx-auto grid …">` (menjadi `relative mx-auto grid max-w-6xl …`) dan di `<p className="border-t …">` (menjadi `relative border-t …`) supaya keduanya di atas bentuk hiasan.

Margin `mt-24` dibuang, karena halaman sekarang mengatur ruang bawahnya sendiri: Beranda dan Program Slimming berakhir dengan ajakan akhir, halaman lain dengan `py-14`. Isi footer lainnya tidak berubah.

Di `src/components/layout/whatsapp-fab.tsx`:
1. Ganti import `CLINIC_NAME` dengan `import { buildWhatsAppLink, generalInquiryMessage } from "@/lib/whatsapp";` dan hapus import `@/lib/clinic` yang tidak terpakai lagi.
2. Ganti `const href = buildWhatsAppLink(\`Halo ${CLINIC_NAME}, saya ingin bertanya.\`);` dengan `const href = buildWhatsAppLink(generalInquiryMessage());`.
3. Tambahkan `whatsapp-fab fab-in` di awal `className` tautan, jadi `className="whatsapp-fab fab-in fixed bottom-5 right-5 z-50 flex …"`; sisanya tetap.

Di `src/app/(public)/layout.tsx`, ganti `<main>{children}</main>` dengan:

```tsx
      {/* Header berupa fixed: isi diberi ruang setinggi header; kepala halaman (.hero-bleed) menerus ke baliknya. */}
      <main className="pt-[var(--header-h)]">{children}</main>
```

- [ ] **Step 4: Jalankan uji**

Run: `npx vitest run tests/unit/components/site-header.test.tsx tests/unit/components/whatsapp-fab.test.tsx tests/unit/components/site-footer.test.tsx tests/unit/components/register-cta.test.tsx`
Expected: PASS semua.

- [ ] **Step 5: Periksa tampilan di peramban**

Jalankan `npm run dev` di latar, lalu buka `http://localhost:3000/` dan `http://localhost:3000/daftar` di lebar 390 px dan 1280 px, misalnya lewat Playwright `page.setViewportSize` dan tangkapan layar ke `$WS/`. Periksa:
- header transparan di Beranda dan krem setelah digulir;
- header krem sejak atas di `/daftar`, dan isi kuis tidak tertutup header;
- logo, "Daftar", dan tombol menu muat di 390 px tanpa gulir mendatar;
- menu ponsel terbuka dari kanan.

Hentikan server setelahnya. Catat hasilnya di ledger. Bila isi kuis tertutup header, perbaiki `pt-[var(--header-h)]` dan catat sebagai `Ruling:`.

- [ ] **Step 6: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t5.log" 2>&1; tail -6 "$WS/t5.log"; npx eslint src/components/layout "src/app/(public)/layout.tsx"; npx tsc --noEmit -p . > "$WS/t5-tsc.log" 2>&1; tail -5 "$WS/t5-tsc.log"`
Expected: semua PASS, eslint dan `tsc` bersih.

```bash
git add src/components/layout "src/app/(public)/layout.tsx" tests/unit/components/site-header.test.tsx \
  tests/unit/components/whatsapp-fab.test.tsx tests/unit/components/site-footer.test.tsx
git commit -m "feat: give the public site a transparent sticky header with an active link line, a slide-in phone menu, and a restyled footer"
```

---
### Task 6: Kartu katalog berfoto — layanan, cabang, produk, paket

**Files:**
- Modify: `src/components/catalog/service-card.tsx`, `src/components/catalog/branch-card.tsx`, `src/components/catalog/product-card.tsx`, `src/components/catalog/package-card.tsx`
- Test: `tests/unit/components/service-card.test.tsx` (baru), `tests/unit/components/branch-card.test.tsx`, `tests/unit/components/product-card.test.tsx` (baru), `tests/unit/components/package-card.test.tsx` (baru)

**Interfaces:**
- Consumes:
  - Task 1: `.pulse-soft`, `.check-in`
  - Task 2: `Tilt`
  - Task 3: `serviceImage`, `productImage`, `branchImage`
- Produces:
  - `ServiceCard({ service: { slug, name, description?, normalPrice?, promoPrice, priceNote?, imageUrl? }, categorySlug?: string | null })`; seluruh kartu bisa diklik, dan nama tautan tetap nama layanan
  - `BranchCard({ branch, headingLevel?: 2 | 3, title?: string, withImage?: boolean })`; bawaannya `headingLevel` 2, judul nama cabang, dan berfoto
  - `ProductCard({ product: { slug, name, description?, price?, imageUrl? } })`
  - `PackageCard({ pkg: { slug, name, monthlyPrice, items: { id, label }[] } })`; isi paket muncul bergiliran

- [ ] **Step 1: Tulis uji kartu (gagal)**

Buat `tests/unit/components/service-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServiceCard } from "@/components/catalog/service-card";

const HIFU = {
  slug: "hifu-wajah",
  name: "HIFU Wajah",
  description: "Mengencangkan kulit dan mengurangi garis halus.",
  normalPrice: 749000,
  promoPrice: 499000,
  priceNote: null,
  imageUrl: null,
};

function imageSrc(container: HTMLElement): string {
  return decodeURIComponent(container.querySelector("img")?.getAttribute("src") ?? "");
}

describe("ServiceCard", () => {
  it("menautkan nama layanan ke halaman detailnya, dengan harga coret dan harga promo", () => {
    render(<ServiceCard service={HIFU} categorySlug="hifu" />);
    expect(screen.getByRole("link", { name: "HIFU Wajah" })).toHaveAttribute("href", "/layanan/hifu-wajah");
    expect(screen.getByText("Rp 749.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 499.000")).toBeInTheDocument();
  });

  it("memakai foto kategori bila layanan belum punya foto sendiri", () => {
    const { container } = render(<ServiceCard service={HIFU} categorySlug="hifu" />);
    expect(imageSrc(container)).toContain("/images/stok/kategori-hifu.jpg");
  });

  it("mendahulukan foto layanan sendiri", () => {
    const { container } = render(
      <ServiceCard service={{ ...HIFU, imageUrl: "/images/layanan/hifu.jpg" }} categorySlug="hifu" />,
    );
    expect(imageSrc(container)).toContain("/images/layanan/hifu.jpg");
  });

  it("menganggap foto kartu sebagai hiasan, karena nama layanan sudah ada di judul", () => {
    const { container } = render(<ServiceCard service={HIFU} categorySlug="hifu" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
```

Tambahkan kasus ini di dalam `describe("BranchCard", …)` pada `tests/unit/components/branch-card.test.tsx`:

```tsx
  it("memakai judul pengganti dan tingkat judul yang diminta", () => {
    render(<BranchCard branch={active} title="Alamat & jam buka" headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "Alamat & jam buka" })).toBeInTheDocument();
  });

  it("menampilkan foto cabang sebagai hiasan, dan bisa tanpa foto", () => {
    const { container, rerender } = render(<BranchCard branch={active} />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");

    rerender(<BranchCard branch={active} withImage={false} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("membuat label Segera Hadir berdenyut pelan", () => {
    render(<BranchCard branch={comingSoon} />);
    expect(screen.getByText("Segera Hadir")).toHaveClass("pulse-soft");
  });
```

Buat `tests/unit/components/product-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductCard } from "@/components/catalog/product-card";

const KAPSUL = {
  slug: "kapsul-m",
  name: "Kapsul M",
  description: "Kapsul pendukung program slimming.",
  price: null,
  imageUrl: null,
};

describe("ProductCard", () => {
  it("memakai foto stok produk bila produk belum punya foto", () => {
    const { container } = render(<ProductCard product={KAPSUL} />);
    const src = decodeURIComponent(container.querySelector("img")?.getAttribute("src") ?? "");
    expect(src).toContain("/images/stok/produk.jpg");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("menautkan pemesanan ke WhatsApp dengan nama produk terisi", () => {
    render(<ProductCard product={KAPSUL} />);
    const href = screen.getByRole("link", { name: "Pesan via WhatsApp" }).getAttribute("href") ?? "";
    expect(href).toContain("wa.me/6285172228900");
    expect(decodeURIComponent(href)).toContain("Kapsul M");
  });

  it("meminta menghubungi klinik bila harga belum ada", () => {
    render(<ProductCard product={KAPSUL} />);
    expect(screen.getByText("Hubungi kami untuk harga")).toBeInTheDocument();
  });
});
```

Buat `tests/unit/components/package-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PackageCard } from "@/components/catalog/package-card";

const MAX_SLIM = {
  slug: "max-slim",
  name: "MAX SLIM",
  monthlyPrice: 1925000,
  items: [
    { id: "1", label: "Konsul & Timbang BIA" },
    { id: "2", label: "Kapsul M" },
    { id: "3", label: "Fat Blocker" },
    { id: "4", label: "Inject S" },
  ],
};

describe("PackageCard", () => {
  it("menampilkan nama, harga per bulan, dan seluruh isi paket", () => {
    render(<PackageCard pkg={MAX_SLIM} />);
    expect(screen.getByRole("heading", { level: 3, name: "MAX SLIM" })).toBeInTheDocument();
    expect(screen.getByText("Rp 1.925.000")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      MAX_SLIM.items.map((item) => item.label),
    );
  });

  it("memunculkan isi paket bergiliran", () => {
    render(<PackageCard pkg={MAX_SLIM} />);
    const delays = screen.getAllByRole("listitem").map((item) => item.style.animationDelay);
    expect(delays).toEqual(["150ms", "210ms", "270ms", "330ms"]);
  });
});
```

Run: `npx vitest run tests/unit/components/service-card.test.tsx tests/unit/components/branch-card.test.tsx tests/unit/components/product-card.test.tsx tests/unit/components/package-card.test.tsx`
Expected: FAIL, karena kartu belum berfoto dan `BranchCard` belum menerima `title`/`headingLevel`/`withImage`.

- [ ] **Step 2: Tulis ulang keempat kartu**

Ganti seluruh isi `src/components/catalog/service-card.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { Tilt } from "@/components/motion/tilt";
import { serviceImage } from "@/lib/site-images";
import { PriceTag } from "./price-tag";

type ServiceCardProps = {
  service: {
    slug: string;
    name: string;
    description?: string | null;
    normalPrice?: number | null;
    promoPrice: number;
    priceNote?: string | null;
    imageUrl?: string | null;
  };
  /** Kategori layanan; fotonya dipakai bila layanan belum punya foto sendiri. */
  categorySlug?: string | null;
};

export function ServiceCard({ service, categorySlug }: ServiceCardProps) {
  const image = serviceImage(service, categorySlug);

  return (
    <Tilt>
      <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-sm hover:shadow-lg">
        <div className="relative aspect-[4/3] overflow-hidden bg-cream-200">
          {/* Foto ilustrasi; nama layanan sudah ada di judul kartu. */}
          <Image
            src={image.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 80vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
          />
        </div>

        <div className="flex flex-1 flex-col p-5">
          <h3 className="font-display text-xl text-brown-900">
            {/* Seluruh kartu bisa diklik lewat ::after, tetapi nama tautannya tetap nama layanan. */}
            <Link
              href={`/layanan/${service.slug}`}
              className="underline-offset-4 after:absolute after:inset-0 after:rounded-3xl hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-gold-500"
            >
              {service.name}
            </Link>
          </h3>

          {service.description && (
            <p className="mt-2 line-clamp-3 text-sm text-brown-600">{service.description}</p>
          )}

          <div className="mt-auto pt-4">
            <PriceTag
              normalPrice={service.normalPrice}
              promoPrice={service.promoPrice}
              priceNote={service.priceNote}
            />
          </div>
        </div>
      </article>
    </Tilt>
  );
}
```

Ganti seluruh isi `src/components/catalog/branch-card.tsx`:

```tsx
import Image from "next/image";
import { CLOSED_NOTE } from "@/lib/clinic";
import { branchImage } from "@/lib/site-images";
import { branchNotifyMessage, buildWhatsAppLink } from "@/lib/whatsapp";

type BranchCardProps = {
  branch: {
    slug: string;
    name: string;
    address: string;
    openingHours: string;
    status: "AKTIF" | "SEGERA_HADIR";
    mapsUrl?: string | null;
  };
  /** 3 bila kartu berada di bawah judul bagian (Beranda). */
  headingLevel?: 2 | 3;
  /** Judul pengganti nama cabang, untuk halaman detail yang judul halamannya sudah nama cabang. */
  title?: string;
  /** false di halaman detail, yang fotonya sudah tampil di kepala halaman. */
  withImage?: boolean;
};

export function BranchCard({ branch, headingLevel = 2, title, withImage = true }: BranchCardProps) {
  const isOpen = branch.status === "AKTIF";
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const image = branchImage(branch.slug);

  return (
    <article
      className={`grid overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-sm ${withImage ? "sm:grid-cols-[13rem_1fr]" : ""}`}
    >
      {withImage && (
        <div className="relative aspect-[16/9] bg-cream-200 sm:aspect-auto sm:min-h-full">
          {/* Foto suasana sementara, bukan foto cabang itu sendiri; nama cabang ada di judul. */}
          <Image src={image.src} alt="" fill sizes="(min-width: 640px) 208px, 92vw" className="object-cover" />
        </div>
      )}

      <div className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Heading className="font-display text-2xl text-brown-900">{title ?? branch.name}</Heading>
          {!isOpen && (
            <span className="pulse-soft inline-block rounded-full bg-gold-300 px-3 py-1 text-xs font-semibold text-brown-900">
              Segera Hadir
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-brown-700">{branch.address}</p>
        <p className="mt-3 text-sm text-brown-600">
          {branch.openingHours} · {CLOSED_NOTE}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {isOpen && branch.mapsUrl && (
            <a
              href={branch.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-gold-500 px-5 py-2 text-sm font-medium text-gold-600 hover:bg-cream-100"
            >
              Petunjuk Arah
            </a>
          )}

          {!isOpen && (
            <a
              href={buildWhatsAppLink(branchNotifyMessage(branch.name))}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-gold-500 px-5 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              Beri tahu saya saat buka
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
```

Ganti seluruh isi `src/components/catalog/product-card.tsx`:

```tsx
import Image from "next/image";
import { formatRupiah } from "@/lib/format";
import { productImage } from "@/lib/site-images";
import { buildWhatsAppLink, productInquiryMessage } from "@/lib/whatsapp";

type ProductCardProps = {
  product: {
    slug: string;
    name: string;
    description?: string | null;
    price?: number | null;
    imageUrl?: string | null;
  };
};

export function ProductCard({ product }: ProductCardProps) {
  const image = productImage(product);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-sm">
      <div className="relative aspect-[4/3] overflow-hidden bg-cream-200">
        {/* Foto ilustrasi; nama produk sudah ada di judul kartu. */}
        <Image
          src={image.src}
          alt=""
          fill
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw"
          className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl text-brown-900">{product.name}</h3>

        {product.description && <p className="mt-2 text-sm text-brown-600">{product.description}</p>}

        <p className="mt-3 text-base font-semibold text-gold-600">
          {product.price ? formatRupiah(product.price) : "Hubungi kami untuk harga"}
        </p>

        <a
          href={buildWhatsAppLink(productInquiryMessage(product.name))}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto pt-4"
        >
          <span className="inline-block rounded-full bg-gold-500 px-5 py-2 text-sm font-medium text-white hover:bg-gold-600">
            Pesan via WhatsApp
          </span>
        </a>
      </div>
    </article>
  );
}
```

Ganti seluruh isi `src/components/catalog/package-card.tsx`:

```tsx
import { Check } from "lucide-react";
import { formatRupiah } from "@/lib/format";

type PackageCardProps = {
  pkg: {
    slug: string;
    name: string;
    monthlyPrice: number;
    items: { id: string; label: string }[];
  };
};

export function PackageCard({ pkg }: PackageCardProps) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-gold-300 bg-white p-6 shadow-sm">
      <h3 className="font-display text-2xl text-brown-900">{pkg.name}</h3>

      <p className="mt-1">
        <span className="text-xl font-semibold text-gold-600">{formatRupiah(pkg.monthlyPrice)}</span>
        <span className="text-sm text-brown-600"> / bulan</span>
      </p>

      <ul className="mt-5 space-y-2 text-sm text-brown-700">
        {pkg.items.map((item, index) => (
          // Isi paket muncul bergiliran setiap panel paket dibuka (animasi CSS mulai ulang saat panel tampil).
          <li key={item.id} className="check-in flex gap-2" style={{ animationDelay: `${150 + index * 60}ms` }}>
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold-600" />
            {item.label}
          </li>
        ))}
      </ul>
    </article>
  );
}
```

Run: `npx vitest run tests/unit/components/service-card.test.tsx tests/unit/components/branch-card.test.tsx tests/unit/components/product-card.test.tsx tests/unit/components/package-card.test.tsx tests/unit/components/price-tag.test.tsx`
Expected: PASS semua, termasuk enam kasus `BranchCard` yang sudah ada.

- [ ] **Step 3: Uji unit, tipe, commit**

Run: `npx vitest run > "$WS/t6.log" 2>&1; tail -6 "$WS/t6.log"; npx tsc --noEmit -p . > "$WS/t6-tsc.log" 2>&1; tail -5 "$WS/t6-tsc.log"`
Expected: semua PASS dan `tsc` bersih. Halaman yang memakai kartu-kartu ini belum mengirim `categorySlug`; itu boleh karena propnya opsional, dan halaman-halaman itu diubah di Task 7–10.

```bash
git add src/components/catalog tests/unit/components/service-card.test.tsx tests/unit/components/branch-card.test.tsx \
  tests/unit/components/product-card.test.tsx tests/unit/components/package-card.test.tsx
git commit -m "feat: give service, branch, product, and package cards photos, tilt, a pulsing coming-soon label, and staggered package items"
```

---

### Task 7: Beranda — sepuluh bagian

**Files:**
- Create: `src/components/home/home-hero.tsx`, `src/components/home/stats-strip.tsx`, `src/components/home/value-props.tsx`, `src/components/home/signature-treatments.tsx`
- Create: `src/components/public/program-steps.tsx`, `src/components/public/doctor-profile.tsx`, `src/components/public/clinic-gallery.tsx`, `src/components/public/final-cta.tsx`
- Modify: `src/app/(public)/page.tsx`
- Test: `tests/unit/components/home-sections.test.tsx`, `tests/unit/components/program-steps.test.tsx`, `tests/unit/components/doctor-profile.test.tsx`, `tests/unit/pages/home-page.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `Reveal`, `staggerDelay`, `CountUp`, `.hero-line`, `.hero-bleed`
  - Task 2: `Parallax`, `Magnetic`
  - Task 3: `CLINIC_GALLERY`, `STEP_IMAGES`, `doctorPhotos`, `CUSTOMER_COUNT`, `CLINIC_FOUNDED_YEAR`, `OPENING_DAYS`, `OPENING_TIME`, `generalInquiryMessage`, `getSignatureServices`, `countActiveServices`, `getPublicStaff`, `getBranches`
  - Task 4: `ArchImage`, `MorphBlob`, `FloatingChip`, `Eyebrow`
  - Task 6: `ServiceCard`, `BranchCard`
- Produces:
  - `HomeHero({ doctor: { name; specialty: string | null } | null, photo: SiteImage | null })` dan `HERO_TITLE_LINES`
  - `StatsStrip({ treatmentCount: number })`, `ValueProps()`, `SignatureTreatments({ services })`
  - `ProgramSteps({ headingId: string, title: string, showProgramLink?: boolean })` (`"use client"`) dan `PROGRAM_STEPS`
  - `DoctorProfile({ person: { name; specialty: string | null; bio: string | null; role: string }, photo: SiteImage | null, headingLevel?: 2 | 3, eyebrow?: string })` dan `doctorCallName(name): string`
  - `ClinicGallery({ headingId: string })`, `FinalCta()`

- [ ] **Step 1: Tulis uji bagian Beranda (gagal)**

Buat `tests/unit/components/home-sections.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HERO_TITLE_LINES, HomeHero } from "@/components/home/home-hero";
import { StatsStrip } from "@/components/home/stats-strip";
import { ClinicGallery } from "@/components/public/clinic-gallery";
import { FinalCta } from "@/components/public/final-cta";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { CLINIC_GALLERY } from "@/lib/site-images";

const DOCTOR = { name: "Dr. Diane Paparang, Sp.GK, AIFO-K", specialty: "Spesialis Gizi Klinik" };
const PORTRAIT = {
  src: "/images/dokter/diane-1.jpg",
  alt: "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic",
};

describe("HomeHero", () => {
  it("memakai nama lengkap klinik sebagai judul, dipecah per baris", () => {
    expect(HERO_TITLE_LINES.join(" ")).toBe(CLINIC_FULL_NAME.replace(" —", ""));
    render(<HomeHero doctor={DOCTOR} photo={PORTRAIT} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "SunDY Nutrition, Slimming & Wellness Clinic",
    );
  });

  it("menampilkan foto dr. Diane yang dimuat paling dulu, kartu dokter, dan kartu 700+ customer", () => {
    render(<HomeHero doctor={DOCTOR} photo={PORTRAIT} />);
    expect(screen.getByRole("img", { name: PORTRAIT.alt })).not.toHaveAttribute("loading", "lazy");
    expect(screen.getByText(DOCTOR.name)).toBeInTheDocument();
    expect(screen.getByText(DOCTOR.specialty)).toBeInTheDocument();
    expect(screen.getByText("700+")).toBeInTheDocument();
  });

  it("mengajak mendaftar, ke Program Slimming, dan ke daftar layanan", () => {
    render(<HomeHero doctor={DOCTOR} photo={PORTRAIT} />);
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("link", { name: "Program Slimming" })).toHaveAttribute("href", "/program-slimming");
    expect(screen.getByRole("link", { name: "Lihat Layanan & Harga" })).toHaveAttribute("href", "/layanan");
  });

  it("tetap tampil tanpa dokter: foto suasana, tanpa kartu dokter", () => {
    render(<HomeHero doctor={null} photo={null} />);
    expect(screen.getByRole("img", { name: CLINIC_GALLERY[0].alt })).toBeInTheDocument();
    expect(screen.queryByText(/Diane/)).not.toBeInTheDocument();
    expect(screen.getByText("700+")).toBeInTheDocument();
  });
});

describe("StatsStrip", () => {
  it("menampilkan customer, tahun berdiri, jumlah treatment, dan jam buka", () => {
    render(<StatsStrip treatmentCount={35} />);
    expect(screen.getByText("700+")).toBeInTheDocument();
    expect(screen.getByText("customer")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("tahun berdiri")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("pilihan treatment")).toBeInTheDocument();
    expect(screen.getByText("11.00–19.00")).toBeInTheDocument();
    expect(screen.getByText("Senin–Sabtu · WITA")).toBeInTheDocument();
  });
});

describe("ClinicGallery", () => {
  it("menampilkan tiga foto suasana berteks alternatif di bawah judulnya", () => {
    render(<ClinicGallery headingId="suasana" />);
    expect(screen.getByRole("region", { name: "Tenang, bersih, dan nyaman" })).toBeInTheDocument();
    for (const image of CLINIC_GALLERY) {
      expect(screen.getByRole("img", { name: image.alt })).toBeInTheDocument();
    }
  });
});

describe("FinalCta", () => {
  it("mengajak mendaftar dan chat WhatsApp", () => {
    render(<FinalCta />);
    expect(screen.getByRole("heading", { level: 2, name: "Mulai perjalanan sehat Anda" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    const whatsapp = screen.getByRole("link", { name: "Chat WhatsApp" });
    expect(whatsapp.getAttribute("href")).toContain("wa.me/6285172228900");
    // Uji e2e mencari tombol melayang lewat /chat via whatsapp/i; nama tombol ini tidak boleh ikut cocok.
    expect(whatsapp).not.toHaveAccessibleName(/chat via whatsapp/i);
  });
});
```

Buat `tests/unit/components/program-steps.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROGRAM_STEPS, ProgramSteps } from "@/components/public/program-steps";
import { STEP_IMAGES } from "@/lib/site-images";
import { triggerIntersection } from "../helpers/browser-mocks";

describe("ProgramSteps", () => {
  it("menampilkan tiga langkah, dengan langkah pertama menyala", () => {
    render(<ProgramSteps headingId="cara-kerja" title="Program Slimming dalam tiga langkah" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Program Slimming dalam tiga langkah" }),
    ).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(PROGRAM_STEPS.map((step) => step.title)).toEqual([
      "Konsultasi dokter",
      "Timbang BIA & meal plan",
      "Kontrol mingguan",
    ]);
    expect(steps[0]).toHaveAttribute("data-active", "true");
    expect(steps[1]).toHaveAttribute("data-active", "false");
  });

  it("menyalakan langkah yang melintasi tengah layar dan mengganti foto yang menempel", () => {
    render(<ProgramSteps headingId="cara-kerja" title="Cara kerja program" />);
    const steps = screen.getAllByRole("listitem");

    act(() => triggerIntersection(steps[1], true));
    expect(steps[1]).toHaveAttribute("data-active", "true");
    expect(steps[0]).toHaveAttribute("data-active", "false");

    // Foto di kartu ponsel selalu berteks alternatif; foto menempel desktop hanya untuk langkah aktif.
    expect(screen.getAllByAltText(STEP_IMAGES.timbang.alt)).toHaveLength(2);
    expect(screen.getAllByAltText(STEP_IMAGES.konsultasi.alt)).toHaveLength(1);
  });

  it("menautkan ke Program Slimming hanya bila diminta", () => {
    const { rerender } = render(<ProgramSteps headingId="cara-kerja" title="Cara kerja program" />);
    expect(screen.queryByRole("link", { name: "Lihat paket Program Slimming" })).not.toBeInTheDocument();

    rerender(<ProgramSteps headingId="cara-kerja" title="Cara kerja program" showProgramLink />);
    expect(screen.getByRole("link", { name: "Lihat paket Program Slimming" })).toHaveAttribute(
      "href",
      "/program-slimming",
    );
  });
});
```

Buat `tests/unit/components/doctor-profile.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DoctorProfile, doctorCallName } from "@/components/public/doctor-profile";

const DIANE = {
  name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
  specialty: "Spesialis Gizi Klinik",
  bio: "Dokter penanggung jawab SunDY Clinic Manado untuk program slimming, nutrisi, dan perawatan estetika.",
  role: "DOKTER",
};
const PHOTO = { src: "/images/dokter/diane-2.jpg", alt: "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic" };

describe("doctorCallName", () => {
  it("memendekkan nama bergelar menjadi sapaan untuk tombol", () => {
    expect(doctorCallName("Dr. Diane Paparang, Sp.GK, AIFO-K")).toBe("dr. Diane");
    expect(doctorCallName("dr. Budi Santoso")).toBe("dr. Budi");
    expect(doctorCallName("Dr.Diane Paparang")).toBe("dr. Diane");
    expect(doctorCallName("Drajat Wibowo")).toBe("dr. Drajat");
  });
});

describe("DoctorProfile", () => {
  it("menampilkan foto, nama, gelar, profil, dan ajakan konsultasi", () => {
    render(<DoctorProfile person={DIANE} photo={PHOTO} eyebrow="Kenali dokter Anda" />);
    expect(screen.getByRole("img", { name: PHOTO.alt })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: DIANE.name })).toBeInTheDocument();
    expect(screen.getByText(DIANE.specialty)).toBeInTheDocument();
    expect(screen.getByText(DIANE.bio)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Konsultasi dengan dr. Diane" })).toHaveAttribute("href", "/daftar");
  });

  it("tidak menawarkan konsultasi dokter untuk terapis", () => {
    render(<DoctorProfile person={{ ...DIANE, name: "Terapis Sari", role: "TERAPIS" }} photo={null} />);
    expect(screen.queryByRole("link", { name: /Konsultasi dengan/ })).not.toBeInTheDocument();
  });

  it("tetap tampil tanpa foto, dengan tingkat judul yang diminta", () => {
    render(<DoctorProfile person={DIANE} photo={null} headingLevel={3} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: DIANE.name })).toBeInTheDocument();
  });
});
```

Buat `tests/unit/pages/home-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(public)/page";

const DIANE = {
  id: "d1",
  slug: "diane-paparang",
  name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
  specialty: "Spesialis Gizi Klinik",
  bio: "Dokter penanggung jawab SunDY Clinic Manado.",
  role: "DOKTER",
  photoUrl: null,
};

const catalog = vi.hoisted(() => ({ team: [] as unknown[] }));

vi.mock("@/server/catalog", () => ({
  getSignatureServices: async () => [
    {
      id: "s1",
      slug: "hifu-wajah",
      name: "HIFU Wajah",
      description: "Mengencangkan kulit.",
      normalPrice: 749000,
      promoPrice: 499000,
      priceNote: null,
      imageUrl: null,
      category: { slug: "hifu", name: "HIFU Treatment" },
    },
  ],
  getBranches: async () => [
    {
      id: "b1",
      slug: "mahakeret",
      name: "SunDY Mahakeret",
      address: "Jl. Garuda No. 10, Mahakeret Barat, Manado",
      openingHours: "Senin–Sabtu, 11.00–19.00",
      status: "AKTIF",
      mapsUrl: null,
    },
  ],
  getPublicStaff: async () => catalog.team,
  countActiveServices: async () => 35,
}));

describe("Beranda", () => {
  it("menampilkan sepuluh bagian, termasuk dr. Diane", async () => {
    catalog.team = [DIANE];
    render(await HomePage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("SunDY");
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Beauty, Our Priority" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Program Slimming dalam tiga langkah" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our Signature Treatment" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HIFU Wajah" })).toHaveAttribute("href", "/layanan/hifu-wajah");
    expect(screen.getByRole("link", { name: "Konsultasi dengan dr. Diane" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("heading", { name: "Tenang, bersih, dan nyaman" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lokasi Kami" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "SunDY Mahakeret" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mulai perjalanan sehat Anda" })).toBeInTheDocument();
  });

  it("tetap tampil tanpa dokter yang ditampilkan di situs", async () => {
    catalog.team = [];
    render(await HomePage());

    expect(screen.queryByRole("link", { name: /Konsultasi dengan/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Diane/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our Signature Treatment" })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/components/home-sections.test.tsx tests/unit/components/program-steps.test.tsx tests/unit/components/doctor-profile.test.tsx tests/unit/pages/home-page.test.tsx`
Expected: FAIL, karena modul `@/components/home/home-hero` dan lainnya tidak ditemukan.

- [ ] **Step 2: Tulis hero, angka, keunggulan, dan signature**

Buat `src/components/home/home-hero.tsx`:

```tsx
import Link from "next/link";
import { RegisterCta } from "@/components/layout/register-cta";
import { Magnetic } from "@/components/motion/magnetic";
import { Parallax } from "@/components/motion/parallax";
import { ArchImage } from "@/components/public/arch-image";
import { FloatingChip } from "@/components/public/floating-chip";
import { MorphBlob } from "@/components/public/morph-blob";
import { CLINIC_BEAUTY_TAGLINE, CLINIC_TAGLINE, CUSTOMER_COUNT } from "@/lib/clinic";
import { CLINIC_GALLERY, type SiteImage } from "@/lib/site-images";

/** CLINIC_FULL_NAME tanpa tanda pisah, dipecah per baris untuk animasi judul. */
export const HERO_TITLE_LINES = ["SunDY", "Nutrition, Slimming", "& Wellness Clinic"];

type HomeHeroProps = {
  /** Dokter utama yang tampil di situs; null bila belum ada. */
  doctor: { name: string; specialty: string | null } | null;
  /** Foto 1 dr. Diane; null bila belum ada, lalu foto suasana yang dipakai. */
  photo: SiteImage | null;
};

export function HomeHero({ doctor, photo }: HomeHeroProps) {
  return (
    <section
      aria-labelledby="judul-beranda"
      className="hero-bleed relative overflow-hidden bg-[radial-gradient(120%_100%_at_0%_0%,var(--color-cream-50),var(--color-cream-100)_45%,var(--color-cream-200)_75%,var(--color-gold-300))] pb-20 sm:pb-24"
    >
      <Parallax distance={-40} className="pointer-events-none absolute -right-32 -top-24 h-[30rem] w-[30rem] sm:h-[40rem] sm:w-[40rem]">
        <MorphBlob className="inset-0" />
      </Parallax>
      <MorphBlob className="-bottom-40 -left-32 h-80 w-80" tone="cream" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <h1
            id="judul-beranda"
            className="font-display text-[2.6rem] leading-[1.05] text-brown-900 sm:text-6xl lg:text-7xl"
          >
            {HERO_TITLE_LINES.map((line, index) => (
              <span key={line}>
                {index > 0 && " "}
                <span
                  className={`hero-line block ${index === 0 ? "text-gold-600" : ""}`}
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  {line}
                </span>
              </span>
            ))}
          </h1>

          <p className="hero-line mt-5 text-lg text-brown-700" style={{ animationDelay: "360ms" }}>
            {CLINIC_TAGLINE} · {CLINIC_BEAUTY_TAGLINE}
          </p>

          <div className="hero-line mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "480ms" }}>
            <Magnetic>
              <RegisterCta />
            </Magnetic>
            <Link
              href="/program-slimming"
              className="rounded-full border border-gold-500 bg-white/60 px-7 py-3 font-medium text-gold-600 hover:bg-white"
            >
              Program Slimming
            </Link>
          </div>

          <Link
            href="/layanan"
            className="hero-line mt-5 inline-block text-sm font-medium text-brown-700 underline decoration-gold-400 underline-offset-4 hover:text-brown-900"
            style={{ animationDelay: "560ms" }}
          >
            Lihat Layanan & Harga
          </Link>
        </div>

        <div className="relative mx-auto w-full max-w-[20rem] sm:max-w-[22rem] lg:max-w-[26rem]">
          <Parallax distance={24}>
            <ArchImage
              image={photo ?? CLINIC_GALLERY[0]}
              priority
              rise
              sizes="(min-width: 1024px) 416px, (min-width: 640px) 352px, 80vw"
              className="aspect-[4/5] w-full"
            />
          </Parallax>

          {doctor && (
            <FloatingChip className="-left-3 bottom-14 max-w-[14rem] sm:-left-10">
              <p className="font-display text-base font-semibold leading-tight text-brown-900">{doctor.name}</p>
              {doctor.specialty && <p className="mt-0.5 text-xs text-brown-600">{doctor.specialty}</p>}
            </FloatingChip>
          )}

          <FloatingChip className="-right-2 top-10 text-center sm:-right-8" delayMs={1200}>
            <p className="font-display text-2xl font-semibold text-gold-600">{CUSTOMER_COUNT}+</p>
            <p className="text-xs text-brown-600">customer</p>
          </FloatingChip>
        </div>
      </div>
    </section>
  );
}
```

Buat `src/components/home/stats-strip.tsx`:

```tsx
import type { ReactNode } from "react";
import { CountUp } from "@/components/motion/count-up";
import { CLINIC_FOUNDED_YEAR, CUSTOMER_COUNT, OPENING_DAYS, OPENING_TIME } from "@/lib/clinic";

type Stat = { key: string; value: ReactNode; label: string };

/** Angka sekilas di bawah hero. Hanya angka dari pemilik dan dari data; tanpa klaim lain. */
export function StatsStrip({ treatmentCount }: { treatmentCount: number }) {
  const stats: Stat[] = [
    { key: "customer", value: <CountUp value={CUSTOMER_COUNT} suffix="+" />, label: "customer" },
    { key: "berdiri", value: <span>{CLINIC_FOUNDED_YEAR}</span>, label: "tahun berdiri" },
    { key: "treatment", value: <CountUp value={treatmentCount} />, label: "pilihan treatment" },
    { key: "jam", value: <span>{OPENING_TIME}</span>, label: `${OPENING_DAYS} · WITA` },
  ];

  return (
    <section aria-label="Sekilas SunDY" className="relative z-10 mx-auto -mt-10 max-w-5xl px-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-cream-300 bg-cream-300 shadow-[0_24px_48px_-28px_rgb(107_85_53/0.5)] md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.key} className="flex flex-col-reverse bg-white px-4 py-6 text-center">
            <dt className="mt-1 text-sm text-brown-600">{stat.label}</dt>
            <dd className="font-display text-[1.75rem] font-semibold leading-none text-gold-600 sm:text-4xl">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

Buat `src/components/home/value-props.tsx`:

```tsx
import { HeartHandshake, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import { Reveal, staggerDelay } from "@/components/motion/reveal";
import { Eyebrow } from "@/components/public/eyebrow";
import { CLINIC_BEAUTY_TAGLINE } from "@/lib/clinic";

/** Empat nilai jual dari materi promosi klinik. */
const VALUE_PROPS = [
  { title: "Professional Treatment", body: "Ditangani dokter dan terapis berpengalaman.", icon: Stethoscope },
  { title: "Premium Technology", body: "Peralatan modern untuk hasil yang optimal.", icon: Sparkles },
  { title: "Safe & Hygienic", body: "Prosedur dan alat yang steril serta terkontrol.", icon: ShieldCheck },
  { title: "Beauty For You", body: "Perawatan yang disesuaikan dengan kondisi Anda.", icon: HeartHandshake },
];

export function ValueProps() {
  return (
    <section aria-labelledby="keunggulan" className="mx-auto max-w-6xl px-4 py-20">
      <Eyebrow>Kenapa SunDY</Eyebrow>
      <h2 id="keunggulan" className="mt-2 font-display text-4xl text-brown-900">
        {CLINIC_BEAUTY_TAGLINE}
      </h2>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {VALUE_PROPS.map((prop, index) => (
          <Reveal key={prop.title} delay={staggerDelay(index)} className="h-full">
            <div className="h-full rounded-3xl border border-cream-300 bg-white p-6 transition-transform duration-300 hover:-translate-y-1.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-cream-100 text-gold-600">
                <prop.icon aria-hidden="true" className="size-6" />
              </span>
              <h3 className="mt-4 font-display text-xl text-brown-900">{prop.title}</h3>
              <p className="mt-2 text-sm text-brown-600">{prop.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

Buat `src/components/home/signature-treatments.tsx`:

```tsx
import Link from "next/link";
import type { ComponentProps } from "react";
import { ServiceCard } from "@/components/catalog/service-card";
import { Reveal, staggerDelay } from "@/components/motion/reveal";

type SignatureService = ComponentProps<typeof ServiceCard>["service"] & {
  id: string;
  category: { slug: string };
};

/** Layanan signature: digeser menyamping dengan jepretan per kartu di ponsel, kisi di layar lebar. */
export function SignatureTreatments({ services }: { services: SignatureService[] }) {
  return (
    <section aria-labelledby="signature" className="mx-auto max-w-6xl px-4 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="signature" className="font-display text-4xl text-brown-900">
          Our Signature Treatment
        </h2>
        <Link href="/layanan" className="text-sm font-medium text-gold-600 underline-offset-4 hover:underline">
          Lihat seluruh layanan
        </Link>
      </div>

      <ul className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {services.map((service, index) => (
          <li key={service.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
            <Reveal delay={staggerDelay(index)} className="h-full">
              <ServiceCard service={service} categorySlug={service.category.slug} />
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Tulis langkah menempel, profil dokter, galeri, dan ajakan akhir**

Buat `src/components/public/program-steps.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/motion/reveal";
import { STEP_IMAGES } from "@/lib/site-images";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";

export const PROGRAM_STEPS = [
  {
    title: "Konsultasi dokter",
    body: "Dokter mendengarkan tujuan dan kondisi kesehatan Anda, lalu menyusun rencana program yang sesuai.",
    image: STEP_IMAGES.konsultasi,
  },
  {
    title: "Timbang BIA & meal plan",
    body: "Timbang BIA mengukur komposisi tubuh Anda — massa lemak, massa otot, lemak visceral, dan kadar air — sebagai dasar menu makan Anda.",
    image: STEP_IMAGES.timbang,
  },
  {
    title: "Kontrol mingguan",
    body: "Perkembangan Anda dipantau dari minggu ke minggu, dan program disesuaikan agar hasilnya terjaga.",
    image: STEP_IMAGES.kontrol,
  },
];

type ProgramStepsProps = {
  headingId: string;
  title: string;
  /** Tautan ke /program-slimming (Beranda); tidak perlu di halaman Program Slimming sendiri. */
  showProgramLink?: boolean;
};

/**
 * Cara kerja Program Slimming. Desktop: foto menempel di kanan dan berganti
 * mengikuti langkah yang sedang melintasi tengah layar. Ponsel: kartu
 * berfoto yang menempel bertumpuk dan muncul satu per satu.
 */
export function ProgramSteps({ headingId, title, showProgramLink = false }: ProgramStepsProps) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = stepRefs.current.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const step of stepRefs.current) if (step) observer.observe(step);
    return () => observer.disconnect();
  }, []);

  return (
    <section aria-labelledby={headingId} className="py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Eyebrow>Cara kerja</Eyebrow>
        <h2 id={headingId} className="mt-2 font-display text-4xl text-brown-900">
          {title}
        </h2>

        <div className="mt-10 lg:grid lg:grid-cols-2 lg:gap-16">
          <ol className="space-y-5 lg:space-y-0">
            {PROGRAM_STEPS.map((step, index) => (
              <li
                key={step.title}
                ref={(node) => {
                  stepRefs.current[index] = node;
                }}
                data-active={index === active ? "true" : "false"}
                // Ponsel: kartu menempel bertumpuk dengan sedikit selisih. Desktop: statis, setinggi 70% layar.
                style={{ top: `calc(var(--header-h) + ${1 + index * 0.75}rem)` }}
                className="group sticky lg:static lg:flex lg:min-h-[70vh] lg:items-center"
              >
                <Reveal className="w-full">
                  <article className="overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-[0_18px_40px_-28px_rgb(107_85_53/0.6)] transition-opacity duration-500 motion-reduce:transition-none lg:border-0 lg:bg-transparent lg:shadow-none lg:group-data-[active=false]:opacity-40">
                    <div className="relative aspect-[16/10] bg-cream-200 lg:hidden">
                      <Image
                        src={step.image.src}
                        alt={step.image.alt}
                        fill
                        sizes="(min-width: 640px) 600px, 92vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="p-6 lg:p-0">
                      <p aria-hidden="true" className="font-display text-5xl text-gold-500">
                        {index + 1}
                      </p>
                      <h3 className="mt-1 font-display text-2xl text-brown-900">{step.title}</h3>
                      <p className="mt-2 leading-relaxed text-brown-700">{step.body}</p>
                    </div>
                  </article>
                </Reveal>
              </li>
            ))}
          </ol>

          <div className="hidden lg:block">
            <div className="sticky top-[calc(var(--header-h)+3rem)] aspect-[4/5] overflow-hidden rounded-b-[2rem]">
              <div className="absolute inset-0 overflow-hidden rounded-t-full bg-cream-200">
                {PROGRAM_STEPS.map((step, index) => (
                  <Image
                    key={step.title}
                    src={step.image.src}
                    alt={index === active ? step.image.alt : ""}
                    fill
                    sizes="(min-width: 1024px) 560px, 1px"
                    className={cn(
                      "object-cover transition-opacity duration-700 motion-reduce:transition-none",
                      index === active ? "opacity-100" : "opacity-0",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {showProgramLink && (
          <Link
            href="/program-slimming"
            className="mt-10 inline-block rounded-full border border-gold-500 px-7 py-3 font-medium text-gold-600 hover:bg-cream-100"
          >
            Lihat paket Program Slimming
          </Link>
        )}
      </div>
    </section>
  );
}
```

Buat `src/components/public/doctor-profile.tsx`:

```tsx
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import type { SiteImage } from "@/lib/site-images";
import { cn } from "@/lib/utils";
import { ArchImage } from "./arch-image";
import { Eyebrow } from "./eyebrow";
import { MorphBlob } from "./morph-blob";

/** "Dr. Diane Paparang, Sp.GK, AIFO-K" → "dr. Diane": sapaan pendek untuk tombol. */
export function doctorCallName(name: string): string {
  const [fullName = ""] = name.split(",");
  const withoutTitle = fullName.replace(/^dr\.\s*|^dr\s+/i, "").trim();
  const [firstName = withoutTitle] = withoutTitle.split(/\s+/);
  return `dr. ${firstName}`;
}

type DoctorProfileProps = {
  person: { name: string; specialty: string | null; bio: string | null; role: string };
  photo: SiteImage | null;
  /** 2 di Beranda (bagian sendiri), 3 di Tentang (di bawah "Tim Dokter"). */
  headingLevel?: 2 | 3;
  eyebrow?: string;
};

/**
 * Profil dokter: foto dalam bingkai lengkung dengan bentuk emas, teks yang
 * masuk dari samping, dan ajakan konsultasi. Induknya perlu overflow-hidden
 * karena bentuk emas melebar keluar foto.
 */
export function DoctorProfile({ person, photo, headingLevel = 2, eyebrow }: DoctorProfileProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className={cn("grid items-center gap-10", photo && "md:grid-cols-[minmax(0,22rem)_1fr]")}>
      {photo && (
        <Reveal className="relative mx-auto w-full max-w-[20rem]">
          <MorphBlob className="-inset-10" />
          <ArchImage image={photo} sizes="(min-width: 768px) 352px, 80vw" className="aspect-[4/5] w-full" />
        </Reveal>
      )}

      <Reveal from="right">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading className="mt-2 font-display text-3xl text-brown-900 sm:text-4xl">{person.name}</Heading>
        {person.specialty && <p className="mt-2 font-medium text-gold-600">{person.specialty}</p>}
        {person.bio && <p className="mt-4 max-w-xl leading-relaxed text-brown-700">{person.bio}</p>}
        {person.role === "DOKTER" && (
          <Link
            href="/daftar"
            className="mt-8 inline-block rounded-full bg-gold-500 px-7 py-3 font-medium text-white hover:bg-gold-600"
          >
            Konsultasi dengan {doctorCallName(person.name)}
          </Link>
        )}
      </Reveal>
    </article>
  );
}
```

Buat `src/components/public/clinic-gallery.tsx`:

```tsx
import Image from "next/image";
import { Parallax } from "@/components/motion/parallax";
import { CLINIC_GALLERY } from "@/lib/site-images";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";

/** Tiap foto bergeser dengan kecepatan berbeda (parallax). Foto pertama melebar di ponsel. */
const LAYOUT = [
  { distance: -30, wrapper: "col-span-2 md:col-span-1", frame: "aspect-[3/2] md:aspect-[4/5]", sizes: "(min-width: 768px) 360px, 92vw" },
  { distance: 45, wrapper: "md:mt-16", frame: "aspect-[4/5]", sizes: "(min-width: 768px) 360px, 46vw" },
  { distance: -55, wrapper: "", frame: "aspect-[4/5]", sizes: "(min-width: 768px) 360px, 46vw" },
];

export function ClinicGallery({ headingId }: { headingId: string }) {
  return (
    <section aria-labelledby={headingId} className="overflow-hidden bg-cream-100 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Eyebrow>Suasana</Eyebrow>
        <h2 id={headingId} className="mt-2 font-display text-4xl text-brown-900">
          Tenang, bersih, dan nyaman
        </h2>

        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 md:items-start">
          {CLINIC_GALLERY.map((image, index) => {
            const layout = LAYOUT[index % LAYOUT.length];
            return (
              <Parallax key={image.src} distance={layout.distance} className={layout.wrapper}>
                <div className={cn("relative overflow-hidden rounded-[2rem] bg-cream-200", layout.frame)}>
                  <Image src={image.src} alt={image.alt} fill sizes={layout.sizes} className="object-cover" />
                </div>
              </Parallax>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

Buat `src/components/public/final-cta.tsx`:

```tsx
import { RegisterCta } from "@/components/layout/register-cta";
import { Magnetic } from "@/components/motion/magnetic";
import { Parallax } from "@/components/motion/parallax";
import { CLINIC_TAGLINE } from "@/lib/clinic";
import { buildWhatsAppLink, generalInquiryMessage } from "@/lib/whatsapp";
import { MorphBlob } from "./morph-blob";

export function FinalCta() {
  return (
    <section
      aria-labelledby="ajakan-akhir"
      className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-cream-100),var(--color-cream-200)_50%,var(--color-gold-300))] px-4 py-24 text-center"
    >
      <Parallax distance={-40} className="pointer-events-none absolute -left-24 -top-24 h-96 w-96">
        <MorphBlob className="inset-0" />
      </Parallax>
      <Parallax distance={40} className="pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem]">
        <MorphBlob className="inset-0" tone="cream" />
      </Parallax>

      <div className="relative mx-auto max-w-2xl">
        <h2 id="ajakan-akhir" className="font-display text-4xl text-brown-900 sm:text-5xl">
          Mulai perjalanan sehat Anda
        </h2>
        <p className="mt-4 text-lg text-brown-700">
          {CLINIC_TAGLINE}. Konsultasikan tujuan Anda bersama dokter kami.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Magnetic>
            <RegisterCta />
          </Magnetic>
          <Magnetic>
            <a
              href={buildWhatsAppLink(generalInquiryMessage())}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full border border-brown-800/30 bg-white/70 px-7 py-3 font-medium text-brown-800 hover:bg-white"
            >
              Chat WhatsApp
            </a>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Susun Beranda**

Ganti seluruh isi `src/app/(public)/page.tsx`:

```tsx
import { BranchCard } from "@/components/catalog/branch-card";
import { HomeHero } from "@/components/home/home-hero";
import { SignatureTreatments } from "@/components/home/signature-treatments";
import { StatsStrip } from "@/components/home/stats-strip";
import { ValueProps } from "@/components/home/value-props";
import { Reveal, staggerDelay } from "@/components/motion/reveal";
import { ClinicGallery } from "@/components/public/clinic-gallery";
import { DoctorProfile } from "@/components/public/doctor-profile";
import { FinalCta } from "@/components/public/final-cta";
import { ProgramSteps } from "@/components/public/program-steps";
import { doctorPhotos } from "@/lib/site-images";
import {
  countActiveServices,
  getBranches,
  getPublicStaff,
  getSignatureServices,
} from "@/server/catalog";

export default async function HomePage() {
  const [signatureServices, branches, team, treatmentCount] = await Promise.all([
    getSignatureServices(),
    getBranches(),
    getPublicStaff(),
    countActiveServices(),
  ]);

  // Saat ini hanya dr. Diane. Bila tidak ada dokter yang tampil di situs, bagian dokter dilewati.
  const doctor = team.find((person) => person.role === "DOKTER") ?? null;
  const photos = doctor ? doctorPhotos(doctor) : null;

  return (
    <>
      <HomeHero doctor={doctor} photo={photos?.portrait ?? null} />
      <StatsStrip treatmentCount={treatmentCount} />
      <ValueProps />
      <ProgramSteps headingId="cara-kerja" title="Program Slimming dalam tiga langkah" showProgramLink />
      <SignatureTreatments services={signatureServices} />

      {doctor && (
        <section className="overflow-hidden bg-cream-100">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <DoctorProfile person={doctor} photo={photos?.feature ?? null} eyebrow="Kenali dokter Anda" />
          </div>
        </section>
      )}

      <ClinicGallery headingId="suasana" />

      <section aria-labelledby="lokasi" className="mx-auto max-w-5xl px-4 py-20">
        <h2 id="lokasi" className="font-display text-4xl text-brown-900">
          Lokasi Kami
        </h2>
        <div className="mt-8 grid gap-6">
          {branches.map((branch, index) => (
            <Reveal key={branch.id} delay={staggerDelay(index)}>
              <BranchCard branch={branch} headingLevel={3} />
            </Reveal>
          ))}
        </div>
      </section>

      <FinalCta />
    </>
  );
}
```

Run: `npx vitest run tests/unit/components/home-sections.test.tsx tests/unit/components/program-steps.test.tsx tests/unit/components/doctor-profile.test.tsx tests/unit/pages/home-page.test.tsx`
Expected: PASS semua.

- [ ] **Step 5: Periksa Beranda di peramban**

Jalankan `npm run dev` di latar, lalu buka `http://localhost:3000/` di lebar 390 px dan 1280 px. Simpan tangkapan layar ke `$WS/beranda-*.png`. Periksa:
- foto dr. Diane terlihat dalam satu gulir pertama di ponsel;
- tidak ada gulir mendatar (`document.documentElement.scrollWidth <= clientWidth`);
- langkah menempel berganti foto di desktop;
- kartu signature bisa digeser menyamping di ponsel.

Hentikan server. Catat hasilnya di ledger; penyesuaian tata letak dicatat sebagai `Ruling:`.

- [ ] **Step 6: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t7.log" 2>&1; tail -6 "$WS/t7.log"; npx eslint src/components/home src/components/public "src/app/(public)/page.tsx"; npx tsc --noEmit -p . > "$WS/t7-tsc.log" 2>&1; tail -5 "$WS/t7-tsc.log"`
Expected: semua PASS, eslint dan `tsc` bersih.

```bash
git add src/components/home src/components/public "src/app/(public)/page.tsx" \
  tests/unit/components/home-sections.test.tsx tests/unit/components/program-steps.test.tsx \
  tests/unit/components/doctor-profile.test.tsx tests/unit/pages/home-page.test.tsx
git commit -m "feat: rebuild the homepage in ten sections with dr. Diane, counting numbers, sticky program steps, photo cards, a gallery, and a closing call to action"
```

---
### Task 8: Layanan & Harga dan detail layanan — chip kategori, treatment lain, bar bawah

**Files:**
- Create: `src/lib/category-anchor.ts`, `src/components/public/category-nav.tsx`, `src/components/public/sticky-booking-bar.tsx`
- Modify: `src/app/(public)/layanan/page.tsx`, `src/app/(public)/layanan/[slug]/page.tsx`
- Modify: `src/app/globals.css` (tambah di akhir berkas)
- Test: `tests/unit/components/category-nav.test.tsx`, `tests/unit/components/sticky-booking-bar.test.tsx`, `tests/unit/pages/services-pages.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `Reveal`, `staggerDelay`, `usePrefersReducedMotion`, `.pulse-once`, `triggerIntersection`, `setMediaMatches`
  - Task 2: `Magnetic`
  - Task 3: `serviceImage`, `FALLBACK_IMAGE`, `getRelatedServices`
  - Task 4: `PageHero`
  - Task 5: kelas `whatsapp-fab`
  - Task 6: `ServiceCard`
- Produces:
  - `categoryAnchorId(slug): string`, yaitu `bagian-${slug}`
  - `CategoryNav({ categories: { slug; name }[] })`
  - `StickyBookingBar({ watchId: string, price: string, whatsappHref: string })`: `<div data-sticky-booking-bar data-visible="true|false">` di `document.body`

- [ ] **Step 1: Tulis uji chip kategori dan bar bawah (gagal)**

Buat `tests/unit/components/category-nav.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { CategoryNav } from "@/components/public/category-nav";
import { categoryAnchorId } from "@/lib/category-anchor";
import { setMediaMatches, triggerIntersection } from "../helpers/browser-mocks";

const CATEGORIES = [
  { slug: "facial", name: "Facial Treatment" },
  { slug: "rf", name: "RF Treatment" },
  { slug: "hifu", name: "HIFU Treatment" },
];

function renderServicesPage() {
  render(
    <>
      <CategoryNav categories={CATEGORIES} />
      {CATEGORIES.map((category) => (
        <section key={category.slug} id={categoryAnchorId(category.slug)} data-category={category.slug}>
          <h2>{category.name}</h2>
        </section>
      ))}
    </>,
  );
}

const chip = (name: string) => screen.getByRole("link", { name });

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("CategoryNav", () => {
  it("berupa jangkar biasa ke bagian kategori, dengan chip pertama menyala", () => {
    renderServicesPage();
    expect(categoryAnchorId("rf")).toBe("bagian-rf");
    expect(chip("RF Treatment")).toHaveAttribute("href", "#bagian-rf");
    expect(chip("Facial Treatment")).toHaveAttribute("aria-current", "true");
  });

  it("menyala mengikuti kategori yang sedang terlihat", () => {
    renderServicesPage();
    act(() => triggerIntersection(document.getElementById("bagian-rf") as HTMLElement, true));
    expect(chip("RF Treatment")).toHaveAttribute("aria-current", "true");
    expect(chip("Facial Treatment")).not.toHaveAttribute("aria-current");
  });

  it("menggulir halus ke kategori saat chip diklik dan mencatatnya di alamat halaman", async () => {
    const user = userEvent.setup();
    renderServicesPage();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    await user.click(chip("HIFU Treatment"));
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(scroll.mock.contexts[0]).toBe(document.getElementById("bagian-hifu"));
    expect(window.location.hash).toBe("#bagian-hifu");
    expect(chip("HIFU Treatment")).toHaveAttribute("aria-current", "true");
  });

  it("langsung melompat ke kategori bila kurangi gerakan", async () => {
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    const user = userEvent.setup();
    renderServicesPage();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    await user.click(chip("RF Treatment"));
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});
```

Buat `tests/unit/components/sticky-booking-bar.test.tsx`:

```tsx
import { act, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StickyBookingBar } from "@/components/public/sticky-booking-bar";
import { triggerIntersection } from "../helpers/browser-mocks";

const WHATSAPP = "https://wa.me/6285172228900?text=Halo";

function renderBar() {
  render(
    <>
      <div id="aksi-booking">Tombol utama</div>
      <StickyBookingBar watchId="aksi-booking" price="Rp 499.000" whatsappHref={WHATSAPP} />
    </>,
  );
  return {
    bar: document.querySelector("[data-sticky-booking-bar]") as HTMLElement,
    actions: document.getElementById("aksi-booking") as HTMLElement,
  };
}

describe("StickyBookingBar", () => {
  it("dipasang di body dan tersembunyi selama tombol utama belum tergulir lewat", () => {
    const { bar } = renderBar();
    expect(bar.parentElement).toBe(document.body);
    expect(bar).toHaveAttribute("data-visible", "false");
    expect(bar).toHaveAttribute("inert");
  });

  it("tampil setelah tombol utama tergulir lewat ke atas, berisi harga, Daftar, dan WhatsApp", () => {
    const { bar, actions } = renderBar();
    act(() => triggerIntersection(actions, false, { top: -240 }));

    expect(bar).toHaveAttribute("data-visible", "true");
    expect(bar).not.toHaveAttribute("inert");
    expect(within(bar).getByText("Rp 499.000")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Daftar" })).toHaveAttribute("href", "/daftar");
    expect(within(bar).getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", WHATSAPP);
  });

  it("tidak tampil saat tombol utama masih di bawah layar", () => {
    const { bar, actions } = renderBar();
    act(() => triggerIntersection(actions, false, { top: 900 }));
    expect(bar).toHaveAttribute("data-visible", "false");
  });

  it("tersembunyi lagi saat tombol utama kembali terlihat", () => {
    const { bar, actions } = renderBar();
    act(() => triggerIntersection(actions, false, { top: -240 }));
    act(() => triggerIntersection(actions, true, { top: 200 }));
    expect(bar).toHaveAttribute("data-visible", "false");
  });
});
```

Run: `npx vitest run tests/unit/components/category-nav.test.tsx tests/unit/components/sticky-booking-bar.test.tsx`
Expected: FAIL, karena modul `@/components/public/category-nav` tidak ditemukan.

- [ ] **Step 2: Tulis jangkar kategori, chip kategori, dan bar bawah**

Buat `src/lib/category-anchor.ts`:

```ts
/** Id bagian kategori di /layanan, dipakai chip kategori dan tautan #bagian-…. */
export function categoryAnchorId(slug: string): string {
  return `bagian-${slug}`;
}
```

Buat `src/components/public/category-nav.tsx`:

```tsx
"use client";

import { useLenis } from "lenis/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { usePrefersReducedMotion } from "@/components/motion/use-motion-prefs";
import { categoryAnchorId } from "@/lib/category-anchor";

/** Tinggi header + baris chip; sama dengan scroll-mt bagian kategori di /layanan. */
const SCROLL_OFFSET = 144;

type CategoryNavProps = { categories: { slug: string; name: string }[] };

/**
 * Chip kategori yang menempel di bawah header. Chip menyala mengikuti
 * kategori yang sedang terlihat, dan klik chip menggulir halus ke
 * kategorinya (langsung melompat untuk "kurangi gerakan"). Tanpa
 * JavaScript, chip tetap berupa jangkar #bagian-… biasa.
 */
export function CategoryNav({ categories }: CategoryNavProps) {
  const [active, setActive] = useState<string | null>(categories[0]?.slug ?? null);
  const reduce = usePrefersReducedMotion();
  const lenis = useLenis();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const slug = entry.target.getAttribute("data-category");
          if (entry.isIntersecting && slug) setActive(slug);
        }
      },
      // Bagian dianggap terlihat saat melintasi pita sepertiga atas layar, tepat di bawah chip.
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const category of categories) {
      const section = document.getElementById(categoryAnchorId(category.slug));
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [categories]);

  // Chip aktif digeser masuk ke baris chip, yang di ponsel bisa digeser menyamping.
  useEffect(() => {
    const row = rowRef.current;
    const chip = active ? row?.querySelector<HTMLElement>(`[data-chip="${active}"]`) : null;
    if (!row || !chip) return;
    row.scrollTo({ left: chip.offsetLeft - 16, behavior: reduce ? "auto" : "smooth" });
  }, [active, reduce]);

  function goTo(event: MouseEvent<HTMLAnchorElement>, slug: string) {
    const target = document.getElementById(categoryAnchorId(slug));
    if (!target) return;
    event.preventDefault();
    setActive(slug);
    if (lenis) lenis.scrollTo(target, { offset: -SCROLL_OFFSET, immediate: reduce });
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${categoryAnchorId(slug)}`);
  }

  return (
    <nav
      aria-label="Kategori layanan"
      className="sticky top-[var(--header-h)] z-30 border-b border-cream-300 bg-cream-50/90 backdrop-blur"
    >
      <div ref={rowRef} className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {categories.map((category) => (
          <a
            key={category.slug}
            href={`#${categoryAnchorId(category.slug)}`}
            data-chip={category.slug}
            aria-current={active === category.slug ? "true" : undefined}
            onClick={(event) => goTo(event, category.slug)}
            className="shrink-0 whitespace-nowrap rounded-full border border-cream-300 bg-white px-4 py-1.5 text-sm text-brown-700 hover:border-gold-400 aria-[current=true]:border-brown-900 aria-[current=true]:bg-brown-900 aria-[current=true]:text-gold-300"
          >
            {category.name}
          </a>
        ))}
      </div>
    </nav>
  );
}
```

Buat `src/components/public/sticky-booking-bar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type StickyBookingBarProps = {
  /** Id tombol utama di kepala halaman. */
  watchId: string;
  /** Harga berlaku yang sudah diformat. */
  price: string;
  whatsappHref: string;
};

/**
 * Bar bawah di ponsel (hilang mulai lg): harga, Daftar, dan WhatsApp.
 *
 * Bar tampil setelah tombol utama tergulir lewat ke atas, bukan sebelum
 * tombol itu tercapai. Ia dipasang di body supaya posisinya tidak terpengaruh
 * transisi halaman, dan `inert` selama tersembunyi supaya tautannya tidak
 * bisa difokus. Ruang bawah halaman dan geseran tombol WhatsApp diatur di
 * globals.css.
 */
export function StickyBookingBar({ watchId, price, whatsappHref }: StickyBookingBarProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const target = document.getElementById(watchId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  if (!mounted) return null;

  return createPortal(
    <div
      data-sticky-booking-bar=""
      data-visible={visible ? "true" : "false"}
      inert={!visible}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-300 bg-cream-50/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-20px_rgb(46_37_23/0.5)] backdrop-blur transition duration-300 data-[visible=false]:translate-y-full data-[visible=false]:opacity-0 motion-reduce:transition-none lg:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 leading-tight">
          <span className="block text-xs text-brown-600">Harga</span>
          <span className="font-semibold text-gold-600">{price}</span>
        </p>
        <Link
          href="/daftar"
          className="rounded-full bg-gold-500 px-5 py-2 text-sm font-medium text-white hover:bg-gold-600"
        >
          Daftar
        </Link>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-gold-500 px-4 py-2 text-sm font-medium text-gold-600"
        >
          WhatsApp
        </a>
      </div>
    </div>,
    document.body,
  );
}
```

Tambahkan di **akhir** `src/app/globals.css`:

```css
/* Bar booking detail layanan (sticky-booking-bar.tsx), hanya di bawah lg:
   halaman diberi ruang bawah setinggi bar supaya bar tidak menutupi footer,
   dan tombol WhatsApp melayang naik selama bar tampil. */
@media (max-width: 63.98rem) {
  body:has([data-sticky-booking-bar]) {
    padding-bottom: 4.5rem;
  }

  body:has([data-sticky-booking-bar][data-visible="true"]) .whatsapp-fab {
    transform: translate3d(0, -4.5rem, 0);
  }
}
```

Run: `npx vitest run tests/unit/components/category-nav.test.tsx tests/unit/components/sticky-booking-bar.test.tsx`
Expected: PASS (8/8).

- [ ] **Step 3: Tulis uji halaman Layanan dan detail layanan (gagal)**

Buat `tests/unit/pages/services-pages.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ServiceDetailPage from "@/app/(public)/layanan/[slug]/page";
import ServicesPage from "@/app/(public)/layanan/page";

const HIFU_CATEGORY = { id: "c-hifu", slug: "hifu", name: "HIFU Treatment", description: null, sortOrder: 4 };

function service(slug: string, name: string, promoPrice: number, normalPrice: number | null) {
  return {
    id: `s-${slug}`,
    slug,
    name,
    description: null,
    normalPrice,
    promoPrice,
    priceNote: null,
    durationMin: 90,
    imageUrl: null,
    categoryId: HIFU_CATEGORY.id,
  };
}

const HIFU_WAJAH = { ...service("hifu-wajah", "HIFU Wajah", 499000, 749000), category: HIFU_CATEGORY };
const catalog = vi.hoisted(() => ({ related: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/server/catalog", () => ({
  getServiceCategoriesWithServices: async () => [
    { ...HIFU_CATEGORY, services: [service("hifu-wajah", "HIFU Wajah", 499000, 749000), service("hifu-perut", "HIFU Perut", 699000, 1000000)] },
    { id: "c-rf", slug: "rf", name: "RF Treatment", description: null, sortOrder: 3, services: [service("rf-wajah", "RF Wajah", 199000, null)] },
  ],
  getServiceBySlug: async (slug: string) => (slug === "hifu-wajah" ? HIFU_WAJAH : null),
  getRelatedServices: async () => catalog.related,
  getAllServiceSlugs: async () => ["hifu-wajah"],
}));

describe("halaman Layanan & Harga", () => {
  it("menampilkan jumlah treatment, chip kategori, dan bagian per kategori yang bisa dituju", async () => {
    render(await ServicesPage());
    expect(screen.getByRole("heading", { level: 1, name: "Layanan & Harga" })).toBeInTheDocument();
    expect(screen.getByText("3 treatment · harga promo berlaku")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Kategori layanan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RF Treatment" })).toHaveAttribute("href", "#bagian-rf");
    expect(document.getElementById("bagian-rf")).toHaveAttribute("data-category", "rf");
    expect(screen.getByRole("link", { name: "HIFU Wajah" })).toHaveAttribute("href", "/layanan/hifu-wajah");
  });
});

describe("halaman detail layanan", () => {
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

  it("menampilkan harga, durasi, kategori, dan kedua tombol di kepala halaman", async () => {
    render(await ServiceDetailPage(params("hifu-wajah")));
    expect(screen.getByRole("heading", { level: 1, name: "HIFU Wajah" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Remah roti" })).toHaveTextContent("Layanan · HIFU Treatment");
    expect(screen.getByText("Rp 749.000")).toBeInTheDocument();
    expect(screen.getByText("90 menit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("link", { name: "Tanya via WhatsApp" }).getAttribute("href")).toContain("wa.me/");
    expect(document.querySelector("[data-sticky-booking-bar]")).not.toBeNull();
  });

  it("menawarkan treatment lain di kategori yang sama", async () => {
    catalog.related = [service("hifu-miss-v", "HIFU Miss V", 489000, 649000)];
    render(await ServiceDetailPage(params("hifu-wajah")));
    expect(screen.getByRole("heading", { level: 2, name: "Treatment lain di HIFU Treatment" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HIFU Miss V" })).toHaveAttribute("href", "/layanan/hifu-miss-v");
  });

  it("tidak menampilkan bagian treatment lain bila kategori hanya punya satu layanan", async () => {
    catalog.related = [];
    render(await ServiceDetailPage(params("hifu-wajah")));
    expect(screen.queryByRole("heading", { name: /Treatment lain/ })).not.toBeInTheDocument();
  });

  it("menolak slug yang tidak ada", async () => {
    await expect(ServiceDetailPage(params("tidak-ada"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

Run: `npx vitest run tests/unit/pages/services-pages.test.tsx`
Expected: FAIL, karena "3 treatment · harga promo berlaku", chip kategori, dan "Treatment lain di …" belum ada.

- [ ] **Step 4: Tulis ulang kedua halaman**

Ganti seluruh isi `src/app/(public)/layanan/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ServiceCard } from "@/components/catalog/service-card";
import { Reveal, staggerDelay } from "@/components/motion/reveal";
import { CategoryNav } from "@/components/public/category-nav";
import { PageHero } from "@/components/public/page-hero";
import { categoryAnchorId } from "@/lib/category-anchor";
import { FALLBACK_IMAGE } from "@/lib/site-images";
import { getServiceCategoriesWithServices } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Layanan & Harga",
  description:
    "Daftar lengkap treatment SunDY Clinic Manado: facial, peeling, RF, HIFU, botox, laser, dermapen, skin booster, dan vitamin C beserta harganya.",
};

export default async function ServicesPage() {
  const categories = await getServiceCategoriesWithServices();
  const treatmentCount = categories.reduce((total, category) => total + category.services.length, 0);

  return (
    <>
      <PageHero
        title="Layanan & Harga"
        image={FALLBACK_IMAGE}
        description={
          <>
            <p className="font-medium text-brown-800">{treatmentCount} treatment · harga promo berlaku</p>
            <p className="mt-2">
              Seluruh treatment yang tersedia di SunDY Clinic Manado. Harga yang tercantum adalah harga
              promo yang sedang berjalan.
            </p>
          </>
        }
      />

      <CategoryNav categories={categories.map(({ slug, name }) => ({ slug, name }))} />

      <div className="mx-auto max-w-6xl px-4 pb-16">
        {categories.map((category) => (
          <section
            key={category.id}
            id={categoryAnchorId(category.slug)}
            data-category={category.slug}
            aria-labelledby={`kategori-${category.slug}`}
            className="scroll-mt-[calc(var(--header-h)+4.5rem)] pt-14"
          >
            <h2 id={`kategori-${category.slug}`} className="font-display text-3xl text-brown-900">
              {category.name}
            </h2>
            {category.description && <p className="mt-1 text-sm text-brown-600">{category.description}</p>}

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {category.services.map((service, index) => (
                <Reveal key={service.id} delay={staggerDelay(index)} className="h-full">
                  <ServiceCard service={service} categorySlug={category.slug} />
                </Reveal>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
```

Di `src/app/(public)/layanan/[slug]/page.tsx`:
- `generateStaticParams` dan `generateMetadata` **tidak berubah**;
- ganti blok import di atas dan fungsi `ServiceDetailPage` dengan yang berikut;
- `type PageProps` tetap.

```tsx
import { Clock, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceTag } from "@/components/catalog/price-tag";
import { ServiceCard } from "@/components/catalog/service-card";
import { RegisterCta } from "@/components/layout/register-cta";
import { Magnetic } from "@/components/motion/magnetic";
import { Reveal, staggerDelay } from "@/components/motion/reveal";
import { PageHero } from "@/components/public/page-hero";
import { StickyBookingBar } from "@/components/public/sticky-booking-bar";
import { formatPrice } from "@/lib/format";
import { serviceImage } from "@/lib/site-images";
import { buildWhatsAppLink, serviceInquiryMessage } from "@/lib/whatsapp";
import { getAllServiceSlugs, getRelatedServices, getServiceBySlug } from "@/server/catalog";

/** Id tombol utama; bar bawah di ponsel tampil setelah tombol ini tergulir lewat. */
const BOOKING_ACTIONS_ID = "aksi-booking";
```

```tsx
export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);

  if (!service) notFound();

  const related = await getRelatedServices(service.categoryId, service.id);
  const whatsappHref = buildWhatsAppLink(serviceInquiryMessage(service.name));

  return (
    <>
      <PageHero
        eyebrow={
          <nav aria-label="Remah roti">
            <Link href="/layanan" className="underline-offset-4 hover:underline">
              Layanan
            </Link>
            <span aria-hidden="true"> · </span>
            <span>{service.category.name}</span>
          </nav>
        }
        title={service.name}
        image={serviceImage(service, service.category.slug)}
        imageSize="large"
        description={
          <>
            <div className="pulse-once inline-block origin-left">
              <PriceTag
                normalPrice={service.normalPrice}
                promoPrice={service.promoPrice}
                priceNote={service.priceNote}
              />
            </div>
            {service.description && <p className="mt-4 leading-relaxed">{service.description}</p>}
          </>
        }
      >
        <dl className="flex flex-wrap gap-2 text-sm">
          <div className="rounded-full border border-cream-300 bg-white/80 px-3 py-1.5">
            <dt className="sr-only">Perkiraan durasi</dt>
            <dd className="flex items-center gap-1.5 text-brown-800">
              <Clock aria-hidden="true" className="size-4 text-gold-600" />
              {service.durationMin} menit
            </dd>
          </div>
          <div className="rounded-full border border-cream-300 bg-white/80 px-3 py-1.5">
            <dt className="sr-only">Kategori</dt>
            <dd className="flex items-center gap-1.5 text-brown-800">
              <Tag aria-hidden="true" className="size-4 text-gold-600" />
              {service.category.name}
            </dd>
          </div>
        </dl>

        <div id={BOOKING_ACTIONS_ID} className="mt-6 flex flex-wrap gap-3">
          <Magnetic>
            <RegisterCta />
          </Magnetic>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full border border-gold-500 bg-white/60 px-7 py-3 font-medium text-gold-600 hover:bg-white"
          >
            Tanya via WhatsApp
          </a>
        </div>
      </PageHero>

      {related.length > 0 && (
        <section aria-labelledby="treatment-lain" className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="treatment-lain" className="font-display text-3xl text-brown-900">
            Treatment lain di {service.category.name}
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((other, index) => (
              <Reveal key={other.id} delay={staggerDelay(index)} className="h-full">
                <ServiceCard service={other} categorySlug={service.category.slug} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <StickyBookingBar
        watchId={BOOKING_ACTIONS_ID}
        price={formatPrice(service.promoPrice, service.priceNote)}
        whatsappHref={whatsappHref}
      />
    </>
  );
}
```

Run: `npx vitest run tests/unit/pages/services-pages.test.tsx`
Expected: PASS (5/5).

- [ ] **Step 5: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t8.log" 2>&1; tail -6 "$WS/t8.log"; npx eslint src/components/public src/lib/category-anchor.ts "src/app/(public)/layanan"; npx tsc --noEmit -p . > "$WS/t8-tsc.log" 2>&1; tail -5 "$WS/t8-tsc.log"`
Expected: semua PASS, eslint dan `tsc` bersih.

```bash
git add src/lib/category-anchor.ts src/components/public/category-nav.tsx src/components/public/sticky-booking-bar.tsx \
  "src/app/(public)/layanan" src/app/globals.css tests/unit/components/category-nav.test.tsx \
  tests/unit/components/sticky-booking-bar.test.tsx tests/unit/pages/services-pages.test.tsx
git commit -m "feat: add sticky category chips to the services page, related treatments and a phone booking bar to service details"
```

---

### Task 9: Program Slimming — tombol pilihan paket MAX · LUX · ACTIVE

**Files:**
- Create: `src/lib/package-group.ts`, `src/components/public/package-tabs.tsx`
- Modify: `src/server/catalog.ts` (urutan kelompok dari `PACKAGE_GROUPS`)
- Modify: `src/app/(public)/program-slimming/page.tsx`
- Modify: `tests/e2e/public-site.spec.ts`
- Test: `tests/unit/package-group.test.ts`, `tests/unit/components/package-tabs.test.tsx`, `tests/unit/pages/program-page.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `usePrefersReducedMotion`, `.panel-in`
  - Task 3: `STEP_IMAGES`
  - Task 4: `PageHero`
  - Task 6: `PackageCard`, `ServiceCard`
  - Task 7: `ProgramSteps`, `FinalCta`
- Produces:
  - `PACKAGE_GROUPS = ["MAX", "LUX", "ACTIVE"] as const`, `type PackageGroupName`
  - `parsePackageGroup(value: string | string[] | undefined): PackageGroupName`
  - `type PackageTabGroup = { groupName: string; tagline: string; packages: { id; slug; name; monthlyPrice; items: { id; label }[] }[] }`
  - `PackageTabs({ groups: PackageTabGroup[], initialGroup: string })`
  - halaman `/program-slimming` membaca `?paket=` (halaman menjadi dinamis)

- [ ] **Step 1: Tulis uji kelompok paket dan tombol pilihan (gagal)**

Buat `tests/unit/package-group.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PACKAGE_GROUPS, parsePackageGroup } from "@/lib/package-group";

describe("parsePackageGroup", () => {
  it("mengurutkan kelompok paket MAX, LUX, ACTIVE", () => {
    expect(PACKAGE_GROUPS).toEqual(["MAX", "LUX", "ACTIVE"]);
  });

  it("membaca ?paket= tanpa peduli huruf besar-kecil dan spasi", () => {
    expect(parsePackageGroup("lux")).toBe("LUX");
    expect(parsePackageGroup(" LuX ")).toBe("LUX");
    expect(parsePackageGroup("active")).toBe("ACTIVE");
    expect(parsePackageGroup("MAX")).toBe("MAX");
  });

  it("kembali ke MAX untuk nilai kosong atau tidak dikenal", () => {
    expect(parsePackageGroup(undefined)).toBe("MAX");
    expect(parsePackageGroup("")).toBe("MAX");
    expect(parsePackageGroup("premium")).toBe("MAX");
    expect(parsePackageGroup("constructor")).toBe("MAX");
  });

  it("memakai nilai pertama bila ?paket= diulang", () => {
    expect(parsePackageGroup(["lux", "max"])).toBe("LUX");
    expect(parsePackageGroup([])).toBe("MAX");
  });
});
```

Buat `tests/unit/components/package-tabs.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PackageTabs, type PackageTabGroup } from "@/components/public/package-tabs";

function pkg(slug: string, name: string, items: string[]) {
  return {
    id: slug,
    slug,
    name,
    monthlyPrice: 1000000,
    items: items.map((label, index) => ({ id: `${slug}-${index}`, label })),
  };
}

const GROUPS: PackageTabGroup[] = [
  { groupName: "MAX", tagline: "Shape with Care, Transform with Confidence", packages: [pkg("max", "MAX", ["Kapsul M"])] },
  { groupName: "LUX", tagline: "A More Refined Way to Reach Your Ideal Shape", packages: [pkg("lux", "LUX", ["Kapsul L"])] },
  { groupName: "ACTIVE", tagline: "Personalized Care for Your Best Self", packages: [pkg("lux-t-active", "LUX T ACTIVE", ["Kapsul L"])] },
];

const tab = (name: string) => screen.getByRole("tab", { name });

beforeEach(() => {
  window.history.replaceState(null, "", "/program-slimming");
});

describe("PackageTabs", () => {
  it("membuka kelompok awal, dan panel lain tetap ada di HTML tetapi tersembunyi", () => {
    render(<PackageTabs groups={GROUPS} initialGroup="MAX" />);
    expect(tab("MAX")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "MAX" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Paket MAX" })).toBeVisible();
    expect(screen.getByText("Shape with Care, Transform with Confidence")).toBeVisible();
    expect(screen.getByText("LUX T ACTIVE")).not.toBeVisible();
  });

  it("berganti kelompok saat tombol diklik dan menyimpan pilihan di alamat halaman", async () => {
    const user = userEvent.setup();
    render(<PackageTabs groups={GROUPS} initialGroup="MAX" />);

    await user.click(tab("LUX"));
    expect(tab("LUX")).toHaveAttribute("aria-selected", "true");
    expect(tab("MAX")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("heading", { name: "Paket LUX" })).toBeVisible();
    expect(window.location.search).toBe("?paket=lux");
  });

  it("mempertahankan parameter dan jangkar lain di alamat halaman", async () => {
    window.history.replaceState(null, "", "/program-slimming?utm_source=ig#paket");
    const user = userEvent.setup();
    render(<PackageTabs groups={GROUPS} initialGroup="MAX" />);

    await user.click(tab("ACTIVE"));
    expect(window.location.search).toBe("?utm_source=ig&paket=active");
    expect(window.location.hash).toBe("#paket");
  });

  it("berpindah dengan panah kiri/kanan, Home, dan End, dengan fokus ikut pindah", async () => {
    const user = userEvent.setup();
    render(<PackageTabs groups={GROUPS} initialGroup="MAX" />);
    tab("MAX").focus();

    await user.keyboard("{ArrowRight}");
    expect(tab("LUX")).toHaveFocus();
    expect(tab("LUX")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(tab("ACTIVE")).toHaveFocus();

    await user.keyboard("{Home}");
    expect(tab("MAX")).toHaveFocus();

    await user.keyboard("{End}");
    expect(tab("ACTIVE")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Paket ACTIVE" })).toBeVisible();
  });

  it("hanya tombol aktif yang masuk urutan Tab", () => {
    render(<PackageTabs groups={GROUPS} initialGroup="LUX" />);
    expect(tab("LUX")).toHaveAttribute("tabindex", "0");
    expect(tab("MAX")).toHaveAttribute("tabindex", "-1");
    expect(tab("ACTIVE")).toHaveAttribute("tabindex", "-1");
  });

  it("membuka kelompok pertama yang ada bila kelompok awal sedang tanpa paket", () => {
    render(<PackageTabs groups={GROUPS.slice(0, 2)} initialGroup="ACTIVE" />);
    expect(tab("MAX")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Paket MAX" })).toBeVisible();
  });
});
```

Buat `tests/unit/pages/program-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SlimmingProgramPage from "@/app/(public)/program-slimming/page";

function pkg(slug: string, name: string, groupName: string) {
  return {
    id: slug,
    slug,
    name,
    groupName,
    monthlyPrice: 1125000,
    description: null,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [{ id: `${slug}-1`, packageId: slug, label: "Konsul & Timbang BIA", sortOrder: 1 }],
  };
}

vi.mock("@/server/catalog", () => ({
  getPackagesByGroup: async () => [
    { groupName: "MAX", packages: [pkg("max", "MAX", "MAX")] },
    { groupName: "LUX", packages: [pkg("lux", "LUX", "LUX")] },
    { groupName: "ACTIVE", packages: [pkg("lux-t-active", "LUX T ACTIVE", "ACTIVE")] },
  ],
  getServiceCategoriesWithServices: async () => [
    {
      id: "c-slimming",
      slug: "slimming",
      name: "Slimming & Wellness",
      description: null,
      services: [
        { id: "s1", slug: "konsultasi-dokter", name: "Konsultasi Dokter", description: null, normalPrice: null, promoPrice: 150000, priceNote: null, imageUrl: null },
      ],
    },
  ],
}));

const page = (paket?: string | string[]) =>
  SlimmingProgramPage({ searchParams: Promise.resolve(paket === undefined ? {} : { paket }) });

describe("halaman Program Slimming", () => {
  it("membuka MAX bila tidak ada ?paket=", async () => {
    render(await page());
    expect(screen.getByRole("tab", { name: "MAX" })).toHaveAttribute("aria-selected", "true");
  });

  it("membuka kelompok dari ?paket=, termasuk huruf besar-kecil yang campur", async () => {
    render(await page("LuX"));
    expect(screen.getByRole("tab", { name: "LUX" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Paket LUX" })).toBeVisible();
  });

  it("kembali ke MAX untuk ?paket= yang tidak dikenal", async () => {
    render(await page("premium"));
    expect(screen.getByRole("tab", { name: "MAX" })).toHaveAttribute("aria-selected", "true");
  });

  it("memuat cara kerja, layanan satuan, Nutrigenomics, dan ajakan akhir", async () => {
    render(await page());
    expect(screen.getByRole("heading", { name: "Cara kerja program" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Konsultasi Dokter" })).toHaveAttribute("href", "/layanan/konsultasi-dokter");
    expect(screen.getByText(/Nutrigenomics Program/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mulai perjalanan sehat Anda" })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/unit/package-group.test.ts tests/unit/components/package-tabs.test.tsx tests/unit/pages/program-page.test.tsx`
Expected: FAIL, karena modul `@/lib/package-group` dan `@/components/public/package-tabs` tidak ditemukan.

- [ ] **Step 2: Tulis kelompok paket dan tombol pilihan**

Buat `src/lib/package-group.ts`:

```ts
/** Urutan kelompok paket sebagaimana ditampilkan ke pengunjung. */
export const PACKAGE_GROUPS = ["MAX", "LUX", "ACTIVE"] as const;

export type PackageGroupName = (typeof PACKAGE_GROUPS)[number];

/** Nilai ?paket= di alamat halaman → kelompok paket. Kosong atau tidak dikenal kembali ke MAX. */
export function parsePackageGroup(value: string | string[] | undefined): PackageGroupName {
  const raw = Array.isArray(value) ? value[0] : value;
  const wanted = raw?.trim().toUpperCase();
  return PACKAGE_GROUPS.find((group) => group === wanted) ?? "MAX";
}
```

Di `src/server/catalog.ts`, hapus `const PACKAGE_GROUP_ORDER = …` beserta komentarnya. Tambahkan `import { PACKAGE_GROUPS } from "@/lib/package-group";`, lalu di `getPackagesByGroup` ganti `PACKAGE_GROUP_ORDER.map(` dengan `PACKAGE_GROUPS.map(`.

Buat `src/components/public/package-tabs.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { PackageCard } from "@/components/catalog/package-card";
import { usePrefersReducedMotion } from "@/components/motion/use-motion-prefs";
import { cn } from "@/lib/utils";

export type PackageTabGroup = {
  groupName: string;
  tagline: string;
  packages: { id: string; slug: string; name: string; monthlyPrice: number; items: { id: string; label: string }[] }[];
};

type PackageTabsProps = {
  groups: PackageTabGroup[];
  /** Kelompok dari ?paket=. Bila kelompok itu sedang tanpa paket, kelompok pertama yang dibuka. */
  initialGroup: string;
};

/**
 * Tombol pilihan paket (pola ARIA tablist, aktivasi otomatis).
 *
 * Semua panel dirender di server dan yang tidak aktif disembunyikan dengan
 * `hidden`, jadi semua paket tetap terbaca mesin pencari. Penanda pilihan
 * meluncur ke tombol aktif (layoutId motion), dan pilihan disimpan di
 * ?paket= dengan replaceState supaya tautannya bisa dibagikan tanpa
 * menambah riwayat Kembali.
 */
export function PackageTabs({ groups, initialGroup }: PackageTabsProps) {
  const fallback = groups[0]?.groupName ?? "";
  const [active, setActive] = useState(
    groups.some((group) => group.groupName === initialGroup) ? initialGroup : fallback,
  );
  const reduce = usePrefersReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  function select(index: number, focus: boolean) {
    const group = groups[index];
    if (!group) return;
    setActive(group.groupName);
    const url = new URL(window.location.href);
    url.searchParams.set("paket", group.groupName.toLowerCase());
    window.history.replaceState(null, "", url);
    if (focus) tabRefs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = groups.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Kelompok paket"
        className="inline-flex rounded-full border border-cream-300 bg-white p-1 shadow-sm"
      >
        {groups.map((group, index) => {
          const selected = group.groupName === active;
          return (
            <button
              key={group.groupName}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${group.groupName}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${group.groupName}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(index, false)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "relative rounded-full px-6 py-2 text-sm font-semibold tracking-wide",
                selected ? "text-gold-300" : "text-brown-700 hover:text-brown-900",
              )}
            >
              {selected &&
                (reduce ? (
                  <span aria-hidden="true" className="absolute inset-0 rounded-full bg-brown-900" />
                ) : (
                  <motion.span
                    layoutId={`${baseId}-penanda`}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-brown-900"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                ))}
              <span className="relative">{group.groupName}</span>
            </button>
          );
        })}
      </div>

      {groups.map((group) => (
        <section
          key={group.groupName}
          role="tabpanel"
          id={`${baseId}-panel-${group.groupName}`}
          aria-labelledby={`${baseId}-tab-${group.groupName}`}
          hidden={group.groupName !== active}
          tabIndex={0}
          className="panel-in mt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-500"
        >
          <h2 className="font-display text-3xl text-brown-900">Paket {group.groupName}</h2>
          <p className="mt-1 text-sm italic text-brown-600">{group.tagline}</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.packages.map((item) => (
              <PackageCard key={item.id} pkg={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

Run: `npx vitest run tests/unit/package-group.test.ts tests/unit/components/package-tabs.test.tsx`
Expected: PASS (10/10).

- [ ] **Step 3: Tulis ulang halaman Program Slimming**

Ganti seluruh isi `src/app/(public)/program-slimming/page.tsx`. Metadata, `GROUP_DESCRIPTION`, dan `INDIVIDUAL_SERVICE_SLUGS` tetap:

```tsx
import type { Metadata } from "next";
import { ServiceCard } from "@/components/catalog/service-card";
import { Reveal, staggerDelay } from "@/components/motion/reveal";
import { FinalCta } from "@/components/public/final-cta";
import { PackageTabs, type PackageTabGroup } from "@/components/public/package-tabs";
import { PageHero } from "@/components/public/page-hero";
import { ProgramSteps } from "@/components/public/program-steps";
import { CLINIC_TAGLINE } from "@/lib/clinic";
import { parsePackageGroup } from "@/lib/package-group";
import { STEP_IMAGES } from "@/lib/site-images";
import { getPackagesByGroup, getServiceCategoriesWithServices } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Program Slimming",
  description:
    "Paket program slimming bulanan SunDY Clinic Manado: MAX, LUX, dan ACTIVE. Termasuk konsultasi dokter, Timbang BIA, dan pendampingan nutrisi.",
};

const GROUP_DESCRIPTION: Record<string, string> = {
  MAX: "Shape with Care, Transform with Confidence",
  LUX: "A More Refined Way to Reach Your Ideal Shape",
  ACTIVE: "Personalized Care for Your Best Self",
};

/** Layanan satuan program slimming, ditampilkan terpisah dari paket bulanan. */
const INDIVIDUAL_SERVICE_SLUGS = ["konsultasi-dokter", "timbang-bia", "meal-plan"];

type PageProps = { searchParams: Promise<{ paket?: string | string[] }> };

export default async function SlimmingProgramPage({ searchParams }: PageProps) {
  // ?paket= dibaca di server supaya kelompok yang dibagikan langsung terbuka tanpa berkedip.
  const [{ paket }, groups, categories] = await Promise.all([
    searchParams,
    getPackagesByGroup(),
    getServiceCategoriesWithServices(),
  ]);

  // Hanya data polos ke komponen klien.
  const tabGroups: PackageTabGroup[] = groups.map((group) => ({
    groupName: group.groupName,
    tagline: GROUP_DESCRIPTION[group.groupName] ?? "",
    packages: group.packages.map((pkg) => ({
      id: pkg.id,
      slug: pkg.slug,
      name: pkg.name,
      monthlyPrice: pkg.monthlyPrice,
      items: pkg.items.map((item) => ({ id: item.id, label: item.label })),
    })),
  }));

  const individualServices = INDIVIDUAL_SERVICE_SLUGS.flatMap((slug) => {
    for (const category of categories) {
      const service = category.services.find((candidate) => candidate.slug === slug);
      if (service) return [{ service, categorySlug: category.slug }];
    }
    return [];
  });

  return (
    <>
      <PageHero
        title="Program Slimming"
        image={STEP_IMAGES.kontrol}
        description={
          <p>
            {CLINIC_TAGLINE}. Setiap paket sudah termasuk konsultasi dokter dan Timbang BIA untuk
            memantau komposisi tubuh Anda dari bulan ke bulan.
          </p>
        }
      />

      <section aria-label="Paket bulanan" className="mx-auto max-w-6xl px-4 py-14">
        <PackageTabs groups={tabGroups} initialGroup={parsePackageGroup(paket)} />
      </section>

      <ProgramSteps headingId="cara-kerja" title="Cara kerja program" />

      <section aria-labelledby="layanan-satuan" className="mx-auto max-w-6xl px-4 pb-20">
        <h2 id="layanan-satuan" className="font-display text-3xl text-brown-900">
          Layanan Satuan
        </h2>
        <p className="mt-1 text-sm text-brown-600">
          Ingin mencoba tanpa mengambil paket bulanan? Layanan berikut tersedia satuan.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {individualServices.map(({ service, categorySlug }, index) => (
            <Reveal key={service.id} delay={staggerDelay(index)} className="h-full">
              <ServiceCard service={service} categorySlug={categorySlug} />
            </Reveal>
          ))}
        </div>

        <p className="mt-6 rounded-3xl border border-cream-300 bg-cream-100 p-5 text-sm text-brown-700">
          <strong className="font-semibold">Nutrigenomics Program</strong> — segera hadir.
        </p>
      </section>

      <FinalCta />
    </>
  );
}
```

Run: `npx vitest run tests/unit/pages/program-page.test.tsx`
Expected: PASS (4/4).

Run: `npm run test:integration -- tests/integration/catalog.test.ts`
Expected: PASS, termasuk "mengelompokkan paket menurut MAX, LUX, ACTIVE dengan urutan itu".

- [ ] **Step 4: Sesuaikan uji e2e situs publik untuk tombol pilihan**

Di `tests/e2e/public-site.spec.ts`, ganti dua uji `"halaman program slimming menampilkan ketiga kelompok paket"` dan `"LUX T ACTIVE memakai Kapsul L, bukan Kapsul M"` dengan:

```ts
test("halaman program slimming menampilkan ketiga kelompok paket lewat tombol pilihan", async ({ page }) => {
  await page.goto("/program-slimming");
  await expect(page.getByRole("heading", { name: "Paket MAX" })).toBeVisible();

  for (const group of ["LUX", "ACTIVE"]) {
    await page.getByRole("tab", { name: group }).click();
    await expect(page.getByRole("heading", { name: `Paket ${group}` })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`paket=${group.toLowerCase()}`));
  }
});

test("LUX T ACTIVE memakai Kapsul L, bukan Kapsul M", async ({ page }) => {
  // Materi promosi klinik menulis Kapsul M di sini. Koreksinya harus sampai
  // ke halaman yang dilihat customer, bukan berhenti di basis data.
  await page.goto("/program-slimming");
  await page.getByRole("tab", { name: "ACTIVE" }).click();
  const card = page.locator("article").filter({ hasText: "LUX T ACTIVE" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Kapsul L");
  await expect(card).not.toContainText("Kapsul M");
});
```

E2E dijalankan bersama di Task 11.

- [ ] **Step 5: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t9.log" 2>&1; tail -6 "$WS/t9.log"; npx eslint src/components/public/package-tabs.tsx src/lib/package-group.ts src/server/catalog.ts "src/app/(public)/program-slimming"; npx tsc --noEmit -p . > "$WS/t9-tsc.log" 2>&1; tail -5 "$WS/t9-tsc.log"`
Expected: semua PASS, eslint dan `tsc` bersih.

```bash
git add src/lib/package-group.ts src/components/public/package-tabs.tsx src/server/catalog.ts \
  "src/app/(public)/program-slimming/page.tsx" tests/e2e/public-site.spec.ts tests/unit/package-group.test.ts \
  tests/unit/components/package-tabs.test.tsx tests/unit/pages/program-page.test.tsx
git commit -m "feat: switch the slimming packages to MAX, LUX, and ACTIVE tabs that remember the choice in ?paket= and add the program steps"
```

---
### Task 10: Produk, Lokasi, Tentang, dan Tanya Jawab

**Files:**
- Create: `src/components/public/faq-list.tsx`
- Modify: `src/app/(public)/produk/page.tsx`, `src/app/(public)/lokasi/page.tsx`, `src/app/(public)/lokasi/[slug]/page.tsx`, `src/app/(public)/tentang/page.tsx`, `src/app/(public)/faq/page.tsx`
- Test: `tests/unit/components/faq-list.test.tsx`, `tests/unit/pages/about-page.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `Reveal`, `staggerDelay`
  - Task 3: `PRODUCT_IMAGE`, `CLINIC_GALLERY`, `branchImage`, `doctorPhotos`, `CUSTOMER_COUNT`, `CLINIC_FOUNDED_YEAR`
  - Task 4: `PageHero`, `Eyebrow`
  - Task 6: `ProductCard`, `BranchCard({ title, withImage })`
  - Task 7: `DoctorProfile`, `ClinicGallery`
- Produces:
  - `type Faq = { question: string; answer: string }`
  - `filterFaqs(faqs, query): Faq[]`
  - `FaqList({ faqs })`

- [ ] **Step 1: Tulis uji tanya jawab dan halaman Tentang (gagal)**

Buat `tests/unit/components/faq-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FaqList, filterFaqs } from "@/components/public/faq-list";

const FAQS = [
  { question: "Apa itu Timbang BIA?", answer: "BIA mengukur komposisi tubuh Anda." },
  { question: "Berapa jam operasional klinik?", answer: "Senin–Sabtu, 11.00–19.00 WITA." },
  { question: "Kapan cabang Citraland buka?", answer: "Cabang Citraland sedang dipersiapkan." },
];

describe("filterFaqs", () => {
  it("mencari di pertanyaan dan jawaban tanpa peduli huruf besar-kecil dan spasi", () => {
    expect(filterFaqs(FAQS, "bia").map((faq) => faq.question)).toEqual(["Apa itu Timbang BIA?"]);
    expect(filterFaqs(FAQS, "  SENIN  ").map((faq) => faq.question)).toEqual(["Berapa jam operasional klinik?"]);
    expect(filterFaqs(FAQS, "cabang dipersiapkan").map((faq) => faq.question)).toEqual([
      "Kapan cabang Citraland buka?",
    ]);
  });

  it("menampilkan semua pertanyaan bila kotak cari kosong", () => {
    expect(filterFaqs(FAQS, "   ")).toHaveLength(3);
  });
});

describe("FaqList", () => {
  it("membuka dan menutup jawaban", async () => {
    const user = userEvent.setup();
    render(<FaqList faqs={FAQS} />);
    const button = screen.getByRole("button", { name: "Apa itu Timbang BIA?" });
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "") as HTMLElement;

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("inert");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getByRole("region", { name: "Apa itu Timbang BIA?" })).toHaveTextContent(
      "BIA mengukur komposisi tubuh Anda.",
    );

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("menyimpan semua jawaban di HTML walau tertutup, supaya tetap terbaca mesin pencari", () => {
    render(<FaqList faqs={FAQS} />);
    for (const faq of FAQS) expect(screen.getByText(faq.answer)).toBeInTheDocument();
  });

  it("menyaring pertanyaan saat mengetik", async () => {
    const user = userEvent.setup();
    render(<FaqList faqs={FAQS} />);
    await user.type(screen.getByRole("searchbox", { name: "Cari pertanyaan" }), "bia");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Apa itu Timbang BIA?"]);
  });

  it("memberi tahu bila tidak ada pertanyaan yang cocok", async () => {
    const user = userEvent.setup();
    render(<FaqList faqs={FAQS} />);
    await user.type(screen.getByRole("searchbox", { name: "Cari pertanyaan" }), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Tidak ada pertanyaan yang cocok.");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
```

Buat `tests/unit/pages/about-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AboutPage from "@/app/(public)/tentang/page";
import { CLINIC_GALLERY } from "@/lib/site-images";

const DIANE = {
  id: "d1",
  slug: "diane-paparang",
  name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
  specialty: "Spesialis Gizi Klinik",
  bio: "Dokter penanggung jawab SunDY Clinic Manado.",
  role: "DOKTER",
  photoUrl: null,
};
const DIANE_ALT = "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic";

const catalog = vi.hoisted(() => ({ team: [] as unknown[] }));
vi.mock("@/server/catalog", () => ({ getPublicStaff: async () => catalog.team }));

describe("halaman Tentang", () => {
  it("menampilkan cerita, angka, dr. Diane, galeri suasana, dan jam praktik", async () => {
    catalog.team = [DIANE];
    render(await AboutPage());

    expect(screen.getByRole("heading", { level: 1, name: "Tentang SunDY" })).toBeInTheDocument();
    // Foto 1 di kepala halaman, foto 2 di profil dokter.
    expect(screen.getAllByRole("img", { name: DIANE_ALT })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Cerita kami" })).toBeInTheDocument();
    expect(screen.getByText("700+ customer")).toBeInTheDocument();
    expect(screen.getByText("Sejak 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Tim Dokter" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: DIANE.name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Konsultasi dengan dr. Diane" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("heading", { name: "Tenang, bersih, dan nyaman" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Jam Praktik" })).toBeInTheDocument();
  });

  it("tetap tampil tanpa dokter yang ditampilkan di situs", async () => {
    catalog.team = [];
    render(await AboutPage());

    expect(screen.queryByRole("heading", { name: "Tim Dokter" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Diane/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: CLINIC_GALLERY[0].alt }).length).toBeGreaterThan(0);
  });
});
```

Run: `npx vitest run tests/unit/components/faq-list.test.tsx tests/unit/pages/about-page.test.tsx`
Expected: FAIL, karena modul `@/components/public/faq-list` tidak ditemukan dan halaman Tentang belum berjudul "Tentang SunDY".

- [ ] **Step 2: Tulis daftar tanya jawab**

Buat `src/components/public/faq-list.tsx`:

```tsx
"use client";

import { Plus, Search } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type Faq = { question: string; answer: string };

function normalize(text: string): string {
  return text.toLocaleLowerCase("id-ID").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Pertanyaan yang memuat semua kata yang diketik, di pertanyaan atau jawabannya. */
export function filterFaqs(faqs: readonly Faq[], query: string): Faq[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...faqs];
  return faqs.filter((faq) => {
    const haystack = normalize(`${faq.question} ${faq.answer}`);
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Akordeon tanya jawab dengan kotak cari. Jawaban yang tertutup tetap ada di
 * HTML (dilipat dengan grid-rows dan `inert`), jadi tetap terbaca mesin
 * pencari. Tinggi akordeon adalah satu-satunya animasi tinggi yang diizinkan spec.
 */
export function FaqList({ faqs }: { faqs: readonly Faq[] }) {
  const baseId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const visible = filterFaqs(faqs, query);

  function toggle(question: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(question)) next.delete(question);
      else next.add(question);
      return next;
    });
  }

  return (
    <div>
      <label htmlFor={`${baseId}-cari`} className="sr-only">
        Cari pertanyaan
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-brown-600"
        />
        <input
          id={`${baseId}-cari`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari pertanyaan, misalnya BIA"
          autoComplete="off"
          className="w-full rounded-full border border-cream-300 bg-white py-3 pl-12 pr-5 text-brown-900 placeholder:text-brown-600/70 focus-visible:outline-2 focus-visible:outline-gold-500"
        />
      </div>

      {visible.length === 0 ? (
        <p role="status" className="mt-8 rounded-3xl border border-cream-300 bg-cream-100 p-6 text-center text-brown-700">
          Tidak ada pertanyaan yang cocok.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-cream-300 overflow-hidden rounded-3xl border border-cream-300 bg-white">
          {visible.map((faq) => {
            const index = faqs.indexOf(faq);
            const expanded = open.has(faq.question);
            const buttonId = `${baseId}-tanya-${index}`;
            const panelId = `${baseId}-jawab-${index}`;

            return (
              <li key={faq.question}>
                <h2 className="font-display text-xl text-brown-900">
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggle(faq.question)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left hover:bg-cream-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-500"
                  >
                    <span>{faq.question}</span>
                    <Plus
                      aria-hidden="true"
                      className={cn(
                        "size-5 shrink-0 text-gold-600 transition-transform duration-300 motion-reduce:transition-none",
                        expanded && "rotate-45",
                      )}
                    />
                  </button>
                </h2>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  inert={!expanded}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                    expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-6 leading-relaxed text-brown-700">{faq.answer}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

Run: `npx vitest run tests/unit/components/faq-list.test.tsx`
Expected: PASS (6/6).

- [ ] **Step 3: Tulis ulang kelima halaman**

Ganti seluruh isi `src/app/(public)/produk/page.tsx`. Metadata tetap:

```tsx
import type { Metadata } from "next";
import { ProductCard } from "@/components/catalog/product-card";
import { Reveal, staggerDelay } from "@/components/motion/reveal";
import { PageHero } from "@/components/public/page-hero";
import { CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { PRODUCT_IMAGE } from "@/lib/site-images";
import { getActiveProducts } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Produk",
  description:
    "Produk pendukung program SunDY Clinic Manado. Pemesanan dilakukan lewat WhatsApp setelah konsultasi dokter.",
};

export default async function ProductsPage() {
  const products = await getActiveProducts();

  return (
    <>
      <PageHero
        title="Produk"
        image={PRODUCT_IMAGE}
        description={
          <p>
            Produk berikut digunakan dalam program SunDY Clinic. Pemesanan dilakukan lewat WhatsApp di{" "}
            {CLINIC_WHATSAPP_DISPLAY}.
          </p>
        }
      />

      <div className="mx-auto max-w-6xl px-4 py-14">
        <p className="rounded-3xl border border-gold-300 bg-cream-100 p-5 text-sm text-brown-700">
          Produk yang mengandung bahan aktif hanya diberikan sesuai anjuran dokter setelah konsultasi.
          Silakan hubungi kami untuk mengetahui produk mana yang sesuai dengan kondisi Anda.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, index) => (
            <Reveal key={product.id} delay={staggerDelay(index)} className="h-full">
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
```

Ganti seluruh isi `src/app/(public)/lokasi/page.tsx`. Metadata tetap:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { BranchCard } from "@/components/catalog/branch-card";
import { Reveal, staggerDelay } from "@/components/motion/reveal";
import { PageHero } from "@/components/public/page-hero";
import { CLINIC_GALLERY } from "@/lib/site-images";
import { getBranches } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Lokasi Klinik",
  description:
    "Lokasi SunDY Clinic Manado: cabang Mahakeret Barat (Jl. Garuda No. 10) dan cabang Citraland Cluster The Manhattan yang segera hadir.",
};

export default async function LocationsPage() {
  const branches = await getBranches();

  return (
    <>
      <PageHero
        title="Lokasi Klinik"
        image={CLINIC_GALLERY[0]}
        description={<p>SunDY Clinic hadir di dua lokasi di Manado.</p>}
      />

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14">
        {branches.map((branch, index) => (
          <Reveal key={branch.id} delay={staggerDelay(index)}>
            <BranchCard branch={branch} />
            <Link
              href={`/lokasi/${branch.slug}`}
              className="mt-3 inline-block text-sm font-medium text-gold-600 underline-offset-4 hover:underline"
            >
              Lihat detail {branch.name}
            </Link>
          </Reveal>
        ))}
      </div>
    </>
  );
}
```

Di `src/app/(public)/lokasi/[slug]/page.tsx`:
- `generateStaticParams` dan `generateMetadata` **tetap**;
- tambahkan import `Link from "next/link"`, `PageHero` dari `@/components/public/page-hero`, dan `branchImage` dari `@/lib/site-images`;
- ganti fungsi `BranchDetailPage` dengan:

```tsx
export default async function BranchDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);

  if (!branch) notFound();

  return (
    <>
      <PageHero
        eyebrow={
          <nav aria-label="Remah roti">
            <Link href="/lokasi" className="underline-offset-4 hover:underline">
              Lokasi
            </Link>
            <span aria-hidden="true"> · </span>
            <span>{branch.name}</span>
          </nav>
        }
        title={branch.name}
        image={branchImage(branch.slug)}
      />
      <div className="mx-auto max-w-3xl px-4 py-14">
        {/* Judul halaman sudah nama cabang, dan fotonya sudah di kepala halaman. */}
        <BranchCard branch={branch} title="Alamat & jam buka" withImage={false} />
      </div>
    </>
  );
}
```

Ganti seluruh isi `src/app/(public)/tentang/page.tsx`. Metadata tetap:

```tsx
import type { Metadata } from "next";
import { Reveal } from "@/components/motion/reveal";
import { ClinicGallery } from "@/components/public/clinic-gallery";
import { DoctorProfile } from "@/components/public/doctor-profile";
import { PageHero } from "@/components/public/page-hero";
import {
  CLINIC_BEAUTY_TAGLINE,
  CLINIC_FOUNDED_YEAR,
  CLINIC_TAGLINE,
  CLOSED_NOTE,
  CUSTOMER_COUNT,
  OPENING_HOURS,
} from "@/lib/clinic";
import { CLINIC_GALLERY, doctorPhotos } from "@/lib/site-images";
import { getPublicStaff } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Tentang Kami",
  description:
    "SunDY — Nutrition, Slimming & Wellness Clinic Manado. Program penurunan berat badan dan perawatan estetika yang ditangani dokter.",
};

export default async function AboutPage() {
  const team = await getPublicStaff();
  const leadDoctor = team.find((person) => person.role === "DOKTER");
  const heroPhoto = leadDoctor ? doctorPhotos(leadDoctor)?.portrait : null;

  return (
    <>
      <PageHero
        title="Tentang SunDY"
        image={heroPhoto ?? CLINIC_GALLERY[0]}
        description={
          <p>
            Nutrition, Slimming &amp; Wellness Clinic · Manado · sejak {CLINIC_FOUNDED_YEAR}
          </p>
        }
      />

      <section aria-labelledby="cerita-kami" className="mx-auto max-w-3xl px-4 py-16">
        <h2 id="cerita-kami" className="font-display text-3xl text-brown-900">
          Cerita kami
        </h2>
        <Reveal>
          <p className="mt-6 leading-relaxed text-brown-700">
            SunDY Clinic adalah klinik nutrisi, slimming, dan wellness di Manado. Kami memadukan
            program penurunan berat badan yang diawasi dokter dengan perawatan estetika, sehingga
            perubahan yang Anda capai terlihat sekaligus terasa. {CLINIC_TAGLINE}. {CLINIC_BEAUTY_TAGLINE}.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-4 leading-relaxed text-brown-700">
            Setiap program dimulai dari konsultasi dan Timbang BIA untuk mengetahui komposisi tubuh Anda
            — bukan sekadar angka di timbangan — agar rencana yang disusun benar-benar sesuai kondisi
            Anda.
          </p>
        </Reveal>
        <ul aria-label="Sekilas SunDY" className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-brown-800">
          <li className="rounded-full border border-gold-300 bg-cream-100 px-4 py-2">{CUSTOMER_COUNT}+ customer</li>
          <li className="rounded-full border border-gold-300 bg-cream-100 px-4 py-2">Sejak {CLINIC_FOUNDED_YEAR}</li>
        </ul>
      </section>

      {team.length > 0 && (
        <section aria-labelledby="tim-dokter" className="overflow-hidden bg-cream-100 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="tim-dokter" className="font-display text-3xl text-brown-900">
              Tim Dokter
            </h2>
            <div className="mt-10 grid gap-16">
              {team.map((person) => (
                // Foto 2 di sini, karena foto 1 sudah di kepala halaman.
                <DoctorProfile key={person.id} person={person} photo={doctorPhotos(person)?.feature ?? null} headingLevel={3} />
              ))}
            </div>
          </div>
        </section>
      )}

      <ClinicGallery headingId="suasana-tentang" />

      <section aria-labelledby="jam-praktik" className="mx-auto max-w-3xl px-4 py-16">
        <h2 id="jam-praktik" className="font-display text-3xl text-brown-900">
          Jam Praktik
        </h2>
        <p className="mt-3 text-brown-700">{OPENING_HOURS}</p>
        <p className="text-brown-600">{CLOSED_NOTE}</p>
      </section>
    </>
  );
}
```

Di `src/app/(public)/faq/page.tsx`:
- metadata dan isi array `faqs` **tetap** (spec §5.6: isi pertanyaan tidak berubah);
- tambahkan import `FaqList` dari `@/components/public/faq-list` dan `PageHero` dari `@/components/public/page-hero`, dan pertahankan import `@/lib/clinic` yang sudah ada;
- ganti fungsi `FaqPage` dengan:

```tsx
export default function FaqPage() {
  return (
    <>
      <PageHero
        title="Tanya Jawab"
        description={
          <p>
            Pertanyaan yang sering diajukan tentang layanan dan program SunDY Clinic. Belum menemukan
            jawabannya? Tanyakan lewat WhatsApp di {CLINIC_WHATSAPP_DISPLAY}.
          </p>
        }
      />
      <div className="mx-auto max-w-3xl px-4 py-14">
        <FaqList faqs={faqs} />
      </div>
    </>
  );
}
```

Run: `npx vitest run tests/unit/components/faq-list.test.tsx tests/unit/pages/about-page.test.tsx`
Expected: PASS (8/8).

- [ ] **Step 4: Uji unit, lint, tipe, commit**

Run: `npx vitest run > "$WS/t10.log" 2>&1; tail -6 "$WS/t10.log"; npx eslint src/components/public/faq-list.tsx "src/app/(public)"; npx tsc --noEmit -p . > "$WS/t10-tsc.log" 2>&1; tail -5 "$WS/t10-tsc.log"`
Expected: semua PASS, eslint dan `tsc` bersih.

```bash
git add src/components/public/faq-list.tsx "src/app/(public)/produk/page.tsx" "src/app/(public)/lokasi" \
  "src/app/(public)/tentang/page.tsx" "src/app/(public)/faq/page.tsx" \
  tests/unit/components/faq-list.test.tsx tests/unit/pages/about-page.test.tsx
git commit -m "feat: restyle products, locations, about, and FAQ with page heroes, photo cards, dr. Diane, and a searchable animated FAQ"
```

---

### Task 11: Uji menyeluruh, Lighthouse, dan penutup

**Files:**
- Create: `tests/e2e/situs-publik-gerak.spec.ts`
- Modify: `tests/unit/architecture.test.ts`
- Modify: `docs/superpowers/specs/2026-10-03-redesign-situs-publik-design.md` (baris status saja)

**Interfaces:**
- Consumes: semua task sebelumnya, terutama atribut `data-reveal`, `data-parallax`, `data-sticky-booking-bar`/`data-visible`, nama tombol "Buka menu", dialog "Menu", tab paket, dan navigasi "Kategori layanan"
- Produces: —

- [ ] **Step 1: Kunci larangan kata "pasien" dan "berobat" (penjaga)**

Tambahkan di `describe("batasan arsitektur", …)` pada `tests/unit/architecture.test.ts`:

```ts
  it("halaman publik tidak memakai kata pasien atau berobat", () => {
    // Spec redesign §4.3: halaman publik memakai "Anda" dan "customer". Kuis, cek booking,
    // dan teks hukum tidak diubah redesign ini, jadi tidak ikut diperiksa.
    const dirs = [
      "src/components/home",
      "src/components/public",
      "src/components/layout",
      "src/components/catalog",
      "src/components/motion",
      "src/app/(public)",
    ];
    const untouched = [
      "src/app/(public)/daftar",
      "src/app/(public)/cek-booking",
      "src/app/(public)/isi",
      "src/app/(public)/kebijakan-privasi",
      "src/app/(public)/syarat-ketentuan",
    ];
    const offenders = dirs
      .flatMap(collectSourceFiles)
      .filter((file) => !untouched.some((dir) => file.startsWith(dir)))
      .filter((file) => /\b(pasien|berobat)\b/i.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
```

Run: `npx vitest run tests/unit/architecture.test.ts`
Expected: PASS. Uji ini penjaga. Untuk memastikan ia bisa gagal, tambahkan sementara komentar `// pasien` di `src/components/public/eyebrow.tsx`, jalankan, dan lihat FAIL dengan nama berkas itu. Lalu kembalikan berkasnya (`git checkout src/components/public/eyebrow.tsx`).

- [ ] **Step 2: Tulis uji e2e gerak dan tata letak**

Buat `tests/e2e/situs-publik-gerak.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/** Semua halaman publik, termasuk yang hanya mendapat header, footer, dan transisi baru. */
const PUBLIC_PATHS = [
  "/",
  "/layanan",
  "/layanan/hifu-wajah",
  "/program-slimming",
  "/produk",
  "/lokasi",
  "/lokasi/mahakeret",
  "/lokasi/citraland",
  "/tentang",
  "/faq",
  "/kebijakan-privasi",
  "/syarat-ketentuan",
  "/daftar",
  "/cek-booking",
];

test("tidak ada halaman publik yang menggulir ke samping", async ({ page }) => {
  test.setTimeout(180_000);
  for (const path of PUBLIC_PATHS) {
    await page.goto(path);
    // Sampai bawah dulu, supaya bentuk hiasan dan kartu di bawah layar ikut terukur.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `halaman ${path} menggulir ke samping`).toBe(false);
  }
});

test("elemen di bawah layar menunggu, lalu muncul saat digulir sampai", async ({ page }) => {
  await page.goto("/");
  const armed = page.locator('[data-reveal="armed"]');
  await expect.poll(() => armed.count()).toBeGreaterThan(0);

  const element = await armed.first().elementHandle();
  await element!.scrollIntoViewIfNeeded();
  await expect.poll(() => element!.getAttribute("data-reveal")).toBe("shown");
});

test("saat dicetak, isi yang belum muncul tetap tercetak", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator('[data-reveal="armed"]').count()).toBeGreaterThan(0);
  await page.emulateMedia({ media: "print" });
  const invisible = await page
    .locator('[data-reveal="armed"]')
    .evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).opacity !== "1").length);
  expect(invisible).toBe(0);
});

test.describe("dengan kurangi gerakan", () => {
  test.use({ reducedMotion: "reduce" });

  test("isi Beranda, Layanan, dan Program Slimming langsung terlihat tanpa animasi", async ({ page }) => {
    for (const path of ["/", "/layanan", "/program-slimming"]) {
      await page.goto(path);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      // Beri waktu hidrasi; elemen tidak boleh pernah menunggu.
      await page.waitForTimeout(800);
      await expect(page.locator('[data-reveal="armed"]'), path).toHaveCount(0);
      await expect(page.locator('[data-parallax="aktif"]'), path).toHaveCount(0);
      const running = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === "running")
            // Indikator dev Next.js ada di shadow DOM-nya sendiri; yang dihitung hanya isi situs.
            .filter((animation) => {
              const target = (animation.effect as KeyframeEffect | null)?.target;
              return target instanceof Element && target.getRootNode() === document;
            }).length,
      );
      expect(running, `animasi masih berjalan di ${path}`).toBe(0);
    }
  });
});

test("chip kategori Layanan menggulir ke kategorinya dan ikut menyala", async ({ page }) => {
  await page.goto("/layanan");
  const nav = page.getByRole("navigation", { name: "Kategori layanan" });
  await nav.getByRole("link", { name: "HIFU Treatment" }).click();

  await expect(page).toHaveURL(/#bagian-hifu$/);
  await expect(page.getByRole("heading", { level: 2, name: "HIFU Treatment" })).toBeInViewport();
  await expect(nav.getByRole("link", { name: "HIFU Treatment" })).toHaveAttribute("aria-current", "true");
});

test("tautan ?paket=lux langsung membuka paket LUX", async ({ page }) => {
  await page.goto("/program-slimming?paket=lux");
  await expect(page.getByRole("tab", { name: "LUX" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Paket LUX" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paket MAX" })).toBeHidden();
});

test("menu ponsel terbuka, berpindah halaman, dan tertutup", async ({ page, isMobile }) => {
  test.skip(!isMobile, "menu garis tiga hanya tampil di ponsel");
  await page.goto("/");
  await page.getByRole("button", { name: "Buka menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();

  await menu.getByRole("link", { name: "Produk" }).click();
  await expect(page).toHaveURL(/\/produk$/);
  await expect(menu).toBeHidden();

  await page.getByRole("button", { name: "Buka menu" }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("bar booking menempel di bawah layar ponsel setelah tombol utama terlewati", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "bar bawah hanya untuk ponsel");
  await page.goto("/layanan/hifu-wajah");
  const bar = page.locator("[data-sticky-booking-bar]");
  await expect(bar).toHaveAttribute("data-visible", "false");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(bar).toHaveAttribute("data-visible", "true");
  await expect(bar).toContainText("Rp 499.000");
  await expect(bar.getByRole("link", { name: "Daftar" })).toBeVisible();

  // Tombol WhatsApp melayang naik supaya tidak menutupi bar.
  const fab = page.getByRole("link", { name: /chat via whatsapp/i });
  await expect
    .poll(async () => {
      const [fabBox, barBox] = await Promise.all([fab.boundingBox(), bar.boundingBox()]);
      return fabBox && barBox ? fabBox.y + fabBox.height <= barBox.y + 1 : false;
    })
    .toBe(true);
});
```

Run: `npx playwright test tests/e2e/situs-publik-gerak.spec.ts tests/e2e/public-site.spec.ts > "$WS/e2e-publik.log" 2>&1; tail -30 "$WS/e2e-publik.log"`
Expected: semua PASS di proyek `desktop` dan `mobile`. Uji `isMobile` dilewati di desktop. Bila ada yang gagal, perbaiki kodenya (bukan ujinya) dengan superpowers:systematic-debugging. Bila ternyata ujinya yang salah, catat sebagai `Ruling:`.

- [ ] **Step 3: Jalankan seluruh uji**

Run:

```bash
npm run lint > "$WS/lint.log" 2>&1; tail -5 "$WS/lint.log"
npx tsc --noEmit -p . > "$WS/tsc.log" 2>&1; tail -5 "$WS/tsc.log"
npx vitest run > "$WS/unit.log" 2>&1; tail -6 "$WS/unit.log"
npm run test:integration > "$WS/integration.log" 2>&1; tail -6 "$WS/integration.log"
npm run test:e2e > "$WS/e2e.log" 2>&1; tail -30 "$WS/e2e.log"
```

Expected: lint dan `tsc` bersih, dan semua uji unit, integrasi, serta e2e PASS. Ini termasuk kuis `/daftar` sampai kode booking (`public-registration.spec.ts`) dan uji panel admin, yang tidak boleh berubah perilakunya.

- [ ] **Step 4: Ukur Lighthouse sesudah perubahan**

```bash
npm run build > "$WS/build-sesudah.log" 2>&1 && tail -3 "$WS/build-sesudah.log"
```

- Jalankan `npx next start -p 3200 > "$WS/start-sesudah.log" 2>&1` di latar, lalu tunggu sampai `curl -sf http://localhost:3200/ > /dev/null` berhasil.
- Jalankan `bash "$WS/lighthouse.sh" sesudah`.
- Hentikan server dengan `pkill -f "next start -p 3200"`. Jangan ada `next dev` yang jalan saat build.

Expected: untuk `/`, `/layanan`, dan `/program-slimming`, **performa ≥ 85** dan **aksesibilitas ≥ 90**. Catat ketiganya di ledger sebagai `Lighthouse sesudah: …`, di samping angka "sebelum" dari Task 1.

Bila ada yang di bawah ambang:
1. Buka `$WS/lh-sesudah-*.json` dan baca audit yang gagal (`audits` dengan `score < 0.9`).
2. Perbaiki penyebabnya. Contohnya: `sizes` foto hero yang terlalu besar, bentuk hiasan yang memicu layout shift, kontras warna, atau nama tautan yang kosong.
3. Ukur ulang. Setiap perbaikan diuji seperti biasa, dengan uji yang gagal dulu bila perilakunya bisa diuji, lalu di-commit.

Bila setelah perbaikan wajar ambang tetap tidak tercapai, catat angkanya dan penyebabnya sebagai `Ruling:` supaya pemilik memutuskan.

- [ ] **Step 5: Perbarui status spec dan commit**

Di `docs/superpowers/specs/2026-10-03-redesign-situs-publik-design.md`, ganti baris status menjadi:

```markdown
- **Status:** Disetujui pemilik (3 Oktober 2026); foto stok dipilih pemilik 3 Oktober 2026; dibangun lewat `docs/superpowers/plans/2026-10-03-plan-redesign-situs-publik.md`
```

```bash
git add tests/e2e/situs-publik-gerak.spec.ts tests/unit/architecture.test.ts \
  docs/superpowers/specs/2026-10-03-redesign-situs-publik-design.md
git commit -m "test: cover the public redesign end to end (no sideways scroll, reveal, print, reduced motion, chips, package links, phone menu, booking bar); mark the spec built"
```

`git status` harus bersih, kecuali berkas pemilik `docs/superpowers/specs/2026-09-28-pendaftaran-pasien-design.md` bila sedang diubah. Berkas itu tidak pernah di-stage.
