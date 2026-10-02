import type { ReactNode } from "react";

/** Label kecil di atas judul bagian. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">{children}</p>;
}
