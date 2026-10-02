import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FloatingChipProps = {
  children: ReactNode;
  /** Posisi, misalnya "-left-4 bottom-16". */
  className?: string;
  /** Jeda awal ayunan supaya beberapa kartu tidak naik-turun serempak. */
  delayMs?: number;
};

/** Kartu kecil yang naik-turun pelan ±8 px di atas foto hero. */
export function FloatingChip({ children, className, delayMs = 0 }: FloatingChipProps) {
  return (
    <div
      className={cn(
        "float-y absolute rounded-2xl border border-cream-300 bg-white/95 px-4 py-3 text-sm shadow-[0_18px_40px_-20px_rgb(107_85_53/0.55)]",
        className,
      )}
      style={delayMs > 0 ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
