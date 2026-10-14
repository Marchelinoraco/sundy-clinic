import Box from "@mui/material/Box";
import { StatTile } from "../stat-tile";

/** Kotak Stok meja di dasbor resepsionis (spec stok meja 6). */
export function CounterTiles({ alerts }: { alerts: number }) {
  return (
    <Box component="section" aria-label="Stok meja" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
      <StatTile label="Stok meja menipis / habis" value={alerts} note="barang" href="/admin/stok-meja" attention={alerts > 0} />
    </Box>
  );
}
