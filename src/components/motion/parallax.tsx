"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./use-motion-prefs";

export const MAX_PARALLAX = 60;

export function clampParallax(distance: number): number {
  return Math.max(-MAX_PARALLAX, Math.min(MAX_PARALLAX, distance));
}

/**
 * Geseran (px) untuk elemen yang sisi atasnya `top` piksel dari atas layar, sebelum digeser:
 * +distance saat elemen baru masuk dari bawah, -distance saat keluar di atas, 0 di tengah.
 */
export function parallaxOffset(top: number, height: number, viewportHeight: number, distance: number) {
  const travel = viewportHeight + height;
  const progress = travel > 0 ? Math.min(1, Math.max(0, (viewportHeight - top) / travel)) : 0;
  return Math.round(distance * (1 - 2 * progress) * 10) / 10;
}

type ParallaxProps = {
  children: ReactNode;
  /** Pergeseran terjauh dalam piksel; negatif bergerak berlawanan arah. Dibatasi ±60. */
  distance?: number;
  className?: string;
};

/**
 * Isi bergeser lebih lambat atau lebih cepat dari gulir halaman, lewat transform saja.
 *
 * Tanpa pustaka motion: komponen ini ada di kepala setiap halaman, dan motion/react selalu
 * membawa seluruh framer-motion. Posisi diukur dari getBoundingClientRect dikurangi geseran
 * yang sedang dipakai, jadi tidak perlu elemen pembungkus kedua. Mati untuk "kurangi gerakan",
 * termasuk di HTML server.
 */
export function Parallax({ children, distance = 40, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const limit = clampParallax(distance);

  useEffect(() => {
    const element = ref.current;
    if (!element || reduce) return;

    let current = 0;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const next = parallaxOffset(rect.top - current, rect.height, window.innerHeight, limit);
      if (next === current && element.style.transform) return;
      current = next;
      element.style.transform = `translate3d(0, ${next}px, 0)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      element.style.transform = "";
    };
  }, [reduce, limit]);

  return (
    <div ref={ref} data-parallax={reduce ? "mati" : "aktif"} className={className}>
      {children}
    </div>
  );
}
