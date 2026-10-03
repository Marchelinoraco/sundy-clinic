"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFinePointer, usePrefersReducedMotion } from "./use-motion-prefs";

export const MAX_TILT = 6;

type Box = { left: number; top: number; width: number; height: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Sudut miring kartu (derajat) mengikuti posisi kursor; paling jauh `max` di sudut kartu. */
export function tiltAngles(rect: Box, pointerX: number, pointerY: number, max = MAX_TILT) {
  const px = clamp01((pointerX - rect.left) / (rect.width || 1));
  const py = clamp01((pointerY - rect.top) / (rect.height || 1));
  return { rotateX: (0.5 - py) * 2 * max, rotateY: (px - 0.5) * 2 * max };
}

/**
 * Kartu yang miring mengikuti kursor. Hanya di perangkat berkursor tanpa "kurangi gerakan".
 * Kelenturannya dari transisi CSS, tanpa pustaka motion (kartu ini ada di banyak halaman).
 */
export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const active = finePointer && !reduce;

  // Bila gerak dimatikan saat kartu sedang miring, ratakan kembali.
  useEffect(() => {
    if (!active && ref.current) ref.current.style.transform = "";
  }, [active]);

  return (
    <div
      ref={ref}
      data-tilt={active ? "aktif" : "mati"}
      className={cn("h-full transition-transform duration-300 ease-out motion-reduce:transition-none", className)}
      onPointerMove={
        active
          ? (event) => {
              const angles = tiltAngles(
                event.currentTarget.getBoundingClientRect(),
                event.clientX,
                event.clientY,
              );
              event.currentTarget.style.transform = `perspective(900px) rotateX(${angles.rotateX}deg) rotateY(${angles.rotateY}deg)`;
            }
          : undefined
      }
      onPointerLeave={
        active
          ? (event) => {
              event.currentTarget.style.transform = "";
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
