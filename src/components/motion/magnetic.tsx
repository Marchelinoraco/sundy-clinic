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
