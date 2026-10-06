import { formatRupiah } from "@/lib/format";
import type { PayablesOverview } from "@/server/payable-read";
import { StatTile } from "../stat-tile";

/** Kotak Hutang di dasbor (spec stok 6.5). */
export function PayableTiles({ overview }: { overview: PayablesOverview }) {
  return (
    <section aria-label="Hutang" className="grid gap-4 sm:grid-cols-3">
      <StatTile
        label="Hutang terlambat"
        value={overview.overdueCount}
        note={`faktur · ${formatRupiah(overview.overdueBalance)}`}
        href="/admin/hutang?lihat=TERLAMBAT"
        attention={overview.overdueCount > 0}
      />
      <StatTile
        label="Jatuh tempo 7 hari"
        value={overview.dueSoonCount}
        note="faktur"
        href="/admin/hutang?lihat=JATUH_TEMPO"
        attention={overview.dueSoonCount > 0}
      />
      <StatTile label="Sisa hutang" value={formatRupiah(overview.totalBalance)} href="/admin/hutang" />
    </section>
  );
}
