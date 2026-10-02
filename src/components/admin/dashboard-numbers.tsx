import Link from "next/link";
import type { ReactNode } from "react";
import { deltaLabel } from "@/lib/dashboard";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardNumbers } from "@/server/dashboard";
import { SectionCard } from "./page-layout";

/** Selisih rupiah tanpa "Rp": "+250.000", "−200.000", atau "sama". */
function feeDelta(current: number, previous: number): string {
  const label = deltaLabel(current, previous);
  if (label === "sama") return label;
  return `${label[0]}${formatRupiah(Math.abs(current - previous)).replace(/^Rp\s?/, "")}`;
}

function Figure({ label, value, delta, compare }: { label: string; value: ReactNode; delta: string; compare: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-display text-3xl font-semibold text-brown-900">{value}</div>
      <div className="text-xs text-muted-foreground">
        {delta} dibanding {compare}
      </div>
    </div>
  );
}

/** Kartu Angka untuk Super Admin (spec D 4.5). */
export function DashboardNumbersCard({ numbers }: { numbers: DashboardNumbers }) {
  const { current, previous, previousLabel } = numbers;
  const periods = [
    { id: "minggu", label: "Minggu ini", href: "/admin" },
    { id: "bulan", label: "Bulan ini", href: "/admin?periode=bulan" },
  ] as const;
  return (
    <SectionCard
      title="Angka"
      description={numbers.label}
      actions={
        <nav aria-label="Periode angka" className="flex gap-1 rounded-lg border p-0.5">
          {periods.map((p) => (
            <Link
              key={p.id}
              href={p.href}
              aria-current={numbers.period === p.id ? "page" : undefined}
              className={cn("rounded-md px-2 py-1 text-xs", numbers.period === p.id ? "bg-gold-500 font-semibold text-white" : "text-muted-foreground")}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Booking" value={current.bookings} delta={deltaLabel(current.bookings, previous.bookings)} compare={previousLabel} />
        <Figure label="Pasien baru" value={current.newPatients} delta={deltaLabel(current.newPatients, previous.newPatients)} compare={previousLabel} />
        <Figure
          label="Biaya booking masuk"
          value={formatRupiah(current.feeReceived)}
          delta={feeDelta(current.feeReceived, previous.feeReceived)}
          compare={previousLabel}
        />
      </div>
      <dl className="mt-4 space-y-1 border-t pt-3 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Per sumber:</dt>
          <dd>
            Situs {current.bySource.SITUS} · WhatsApp {current.bySource.WHATSAPP} · Telepon {current.bySource.TELEPON} · Walk-in{" "}
            {current.bySource.WALK_IN}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Tidak hadir &amp; batal:</dt>
          <dd>
            Tidak hadir {current.noShow} · Dibatalkan {current.cancelled} · Kedaluwarsa {current.expired}
          </dd>
        </div>
      </dl>
    </SectionCard>
  );
}
