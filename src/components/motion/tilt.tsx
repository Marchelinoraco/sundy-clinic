"use client";

import { motion, useSpring } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFinePointer, usePrefersReducedMotion } from "./use-motion-prefs";

export const MAX_TILT = 6;

const SPRING = { stiffness: 180, damping: 20 };

type Box = { left: number; top: number; width: number; height: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Sudut miring kartu (derajat) mengikuti posisi kursor; paling jauh `max` di sudut kartu. */
export function tiltAngles(rect: Box, pointerX: number, pointerY: number, max = MAX_TILT) {
  const px = clamp01((pointerX - rect.left) / (rect.width || 1));
  const py = clamp01((pointerY - rect.top) / (rect.height || 1));
  return { rotateX: (0.5 - py) * 2 * max, rotateY: (px - 0.5) * 2 * max };
}

/** Kartu yang miring mengikuti kursor. Hanya di perangkat berkursor tanpa "kurangi gerakan". */
export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const rotateX = useSpring(0, SPRING);
  const rotateY = useSpring(0, SPRING);
  const active = finePointer && !reduce;

  return (
    <motion.div
      data-tilt={active ? "aktif" : "mati"}
      className={cn("h-full", className)}
      style={active ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      onPointerMove={
        active
          ? (event) => {
              const angles = tiltAngles(
                event.currentTarget.getBoundingClientRect(),
                event.clientX,
                event.clientY,
              );
              rotateX.set(angles.rotateX);
              rotateY.set(angles.rotateY);
            }
          : undefined
      }
      onPointerLeave={
        active
          ? () => {
              rotateX.set(0);
              rotateY.set(0);
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
