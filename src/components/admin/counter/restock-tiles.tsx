import Box from "@mui/material/Box";
import { StatTile } from "../stat-tile";

/** Kotak Permintaan restock di dasbor Apoteker (spec stok meja 6). */
export function RestockTiles({ pending }: { pending: number }) {
  return (
    <Box component="section" aria-label="Permintaan restock" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
      <StatTile label="Permintaan restock" value={pending} note="menunggu dikirim ke meja" href="/admin/stok?tab=permintaan" attention={pending > 0} />
    </Box>
  );
}
