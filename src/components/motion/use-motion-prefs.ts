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
