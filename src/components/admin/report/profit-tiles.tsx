import { formatRupiah } from "@/lib/format";
import { profitLabel } from "@/lib/report";
import { StatTile } from "../stat-tile";

/** Kotak Laba bersih bulan ini di dasbor (spec laporan 7) untuk pemegang profit:read. */
export function ProfitTiles({ profit }: { profit: { month: string; revenue: number; netProfit: number } }) {
  return (
    <section aria-label="Laporan" className="grid gap-4 sm:grid-cols-2">
      <StatTile
        label={`${profitLabel(profit.netProfit)} bersih bulan ini`}
        value={formatRupiah(Math.abs(profit.netProfit))}
        note={`pendapatan ${formatRupiah(profit.revenue)}`}
        href="/admin/laporan"
        attention={profit.netProfit < 0}
      />
    </section>
  );
}
