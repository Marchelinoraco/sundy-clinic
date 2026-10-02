import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Kotak angka dasbor (spec D 3.1): seluruh kotak bertautan; `attention` bergaris emas. */
export function StatTile({
  label,
  value,
  note,
  href,
  attention = false,
}: {
  label: string;
  value: ReactNode;
  note?: string | null;
  href: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      data-attention={attention ? "true" : undefined}
      className={cn(
        "block rounded-xl border bg-card p-4 transition-colors hover:border-gold-400",
        attention && "border-gold-400 bg-gold-300/10",
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-display text-4xl font-semibold leading-tight text-brown-900">{value}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </Link>
  );
}
