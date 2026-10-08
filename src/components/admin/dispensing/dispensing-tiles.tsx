import Box from "@mui/material/Box";
import { StatTile } from "../stat-tile";

/** Kotak Resep menunggu di dasbor Apoteker (spec penyerahan 6). */
export function DispensingTiles({ pending }: { pending: number }) {
  return (
    <Box component="section" aria-label="Resep" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
      <StatTile label="Resep menunggu" value={pending} note="kunjungan" href="/admin/resep" attention={pending > 0} />
    </Box>
  );
}
