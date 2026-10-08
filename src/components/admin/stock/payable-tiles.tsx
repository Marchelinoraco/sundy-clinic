import Box from "@mui/material/Box";
import { formatRupiah } from "@/lib/format";
import type { PayablesOverview } from "@/server/payable-read";
import { StatTile } from "../stat-tile";

/** Kotak Hutang di dasbor (spec stok 6.5). */
export function PayableTiles({ overview }: { overview: PayablesOverview }) {
  return (
    <Box component="section" aria-label="Hutang" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
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
    </Box>
  );
}
