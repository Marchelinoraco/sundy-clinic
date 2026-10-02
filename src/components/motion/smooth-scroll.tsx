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
