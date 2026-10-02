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
