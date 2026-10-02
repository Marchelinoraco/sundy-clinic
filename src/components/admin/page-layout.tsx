import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * Kepala halaman gaya A (spec D 3.1): judul besar Cormorant, keterangan satu
 * baris, jejak opsional, dan aksi di kanan yang turun ke bawah judul di layar sempit.
 * Satu-satunya <h1> di halaman.
 */
export function PageHeader({
  title,
  description,
  trail,
  actions,
}: {
  title: string;
  description?: ReactNode;
  trail?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {trail && trail.length > 0 && (
          <nav aria-label="Jejak halaman" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1">
              {trail.map((crumb, index) => {
                const last = index === trail.length - 1;
                return (
                  <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                    {crumb.href && !last ? (
                      <Link href={crumb.href} className="underline-offset-4 hover:underline">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                    )}
                    {!last && <span aria-hidden>›</span>}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <h1 className="font-display text-3xl font-semibold leading-tight text-brown-900">{title}</h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Jarak tepi dan lebar isi yang sama di semua halaman. Halaman kunjungan memakai `wide`. */
export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn("mx-auto w-full space-y-6 p-4 sm:p-6", wide ? "max-w-none" : "max-w-6xl")}>{children}</div>;
}

/** Kartu bagian: judul, aksi kecil di kanan, lalu isi. `flush` untuk tabel yang menempel ke tepi kartu. */
export function SectionCard({
  title,
  description,
  actions,
  flush = false,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={cn("min-w-0 rounded-xl border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-medium text-brown-900">{title}</h2>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 text-sm">{actions}</div>}
      </div>
      <div className={cn("min-w-0", flush ? "overflow-x-auto" : "p-4")}>{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Bagian dasbor yang gagal dimuat (spec D 4.7). */
export function FailedSection({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <EmptyState>Gagal dimuat. Muat ulang halaman.</EmptyState>
    </SectionCard>
  );
}
