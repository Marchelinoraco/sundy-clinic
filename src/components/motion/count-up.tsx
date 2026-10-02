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
