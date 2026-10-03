"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFinePointer, usePrefersReducedMotion } from "./use-motion-prefs";

export const MAX_MAGNET = 8;

type Box = { left: number; top: number; width: number; height: number };

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));

/** Geser ke arah kursor, sebanding jaraknya dari tengah, paling jauh `max` piksel. */
export function magneticOffset(rect: Box, pointerX: number, pointerY: number, max = MAX_MAGNET) {
  const dx = (pointerX - (rect.left + rect.width / 2)) / (rect.width / 2 || 1);
  const dy = (pointerY - (rect.top + rect.height / 2)) / (rect.height / 2 || 1);
  return { x: clampUnit(dx) * max, y: clampUnit(dy) * max };
}

/**
 * Tombol yang tertarik ke kursor. Hanya di perangkat berkursor tanpa "kurangi gerakan".
 * Kelenturannya dari transisi CSS, tanpa pustaka motion (dipakai di header setiap halaman).
 */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const active = finePointer && !reduce;

  // Bila gerak dimatikan saat tombol sedang tertarik, kembalikan ke tempatnya.
  useEffect(() => {
    if (!active && ref.current) ref.current.style.transform = "";
  }, [active]);

  return (
    <span
      ref={ref}
      data-magnetic={active ? "aktif" : "mati"}
      className={cn(
        "inline-block transition-transform duration-300 ease-out motion-reduce:transition-none",
        className,
      )}
      onPointerMove={
        active
          ? (event) => {
              const offset = magneticOffset(
                event.currentTarget.getBoundingClientRect(),
                event.clientX,
                event.clientY,
              );
              event.currentTarget.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`;
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
    </span>
  );
}
