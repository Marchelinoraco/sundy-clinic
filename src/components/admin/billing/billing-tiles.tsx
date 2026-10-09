import Box from "@mui/material/Box";
import { formatRupiah } from "@/lib/format";
import { StatTile } from "../stat-tile";

/** Kotak Tagihan di dasbor (spec tagihan 8): resepsionis melihat "Perlu ditagih", Admin Keuangan "Tagihan belum lunas". */
export function BillingTiles({ billable, unpaid }: { billable: number | null; unpaid: { count: number; balance: number } | null }) {
  if (billable === null && unpaid === null) return null;
  return (
    <Box component="section" aria-label="Tagihan" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
      {billable !== null && (
        <StatTile label="Perlu ditagih" value={billable} note="kunjungan" href="/admin/tagihan" attention={billable > 0} />
      )}
      {unpaid !== null && (
        <StatTile
          label="Tagihan belum lunas"
          value={formatRupiah(unpaid.balance)}
          note={`${unpaid.count} tagihan`}
          href="/admin/tagihan?lihat=BELUM_LUNAS"
          attention={unpaid.count > 0}
        />
      )}
    </Box>
  );
}
