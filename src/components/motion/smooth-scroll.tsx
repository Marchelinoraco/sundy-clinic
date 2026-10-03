"use client";

import type { LenisOptions } from "lenis";
import { ReactLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { useFinePointer, usePrefersReducedMotion } from "./use-motion-prefs";

/**
 * Alur kuis dan form food recall tidak diubah redesign ini, jadi tetap memakai gulir asli: setiap ganti langkah
 * kuis menggulir sendiri ke atas, dan isiannya punya kolom teks yang bisa digulir.
 */
const NATIVE_SCROLL_PATHS = ["/daftar", "/cek-booking", "/isi", "/food-recall"];

export function usesNativeScroll(pathname: string | null): boolean {
  if (!pathname) return false;
  return NATIVE_SCROLL_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const LENIS_OPTIONS = {
  autoRaf: true,
  lerp: 0.12,
  smoothWheel: true,
  // Sentuhan tetap memakai gulir asli HP.
  syncTouch: false,
  // Klik tautan ke halaman lain menghentikan sisa luncuran; tanpa ini luncuran halaman lama
  // menimpa gulir-ke-atas Next dan halaman baru terbuka di tengah.
  stopInertiaOnNavigate: true,
  // Elemen yang bisa digulir sendiri (kolom teks, baris chip) tetap menerima gulir rodanya.
  allowNestedScroll: true,
  // Panel menu dan dialog memakai gulir aslinya sendiri.
  prevent: (node: HTMLElement) => node.closest("[role='dialog']") !== null,
} satisfies LenisOptions;

/**
 * Gulir halus untuk roda tetikus di desktop. Dipasang sebagai saudara isi
 * halaman, bukan pembungkusnya: menyalakannya setelah hidrasi tidak
 * memasang ulang halaman. Halaman lain mengambil instansnya lewat useLenis().
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const reduce = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  if (reduce || !finePointer || usesNativeScroll(pathname)) return null;
  return <ReactLenis root options={LENIS_OPTIONS} />;
}
