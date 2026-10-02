"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-motion-prefs";

type Phase = "static" | "armed" | "shown";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Jeda sebelum muncul, dalam milidetik. Untuk kumpulan kartu, pakai staggerDelay(index) dari ./stagger. */
  delay?: number;
  /** Arah datangnya elemen. Bawaan dari bawah (naik ±24 px). */
  from?: "bottom" | "left" | "right";
};

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
