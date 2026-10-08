import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { STOCK_ITEM_KIND_LABEL } from "@/lib/stock";
import type { AvailabilityRow } from "@/server/stock-availability";
import { StatusChip } from "../mui/status-chip";
import { EmptyState } from "../page-layout";

/** Tabel baca saja untuk Dokter: tanpa harga dan tanpa batch. */
export function StockAvailabilityTable({ rows }: { rows: AvailabilityRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada barang yang cocok.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Barang</TableCell>
            <TableCell>Jenis</TableCell>
            <TableCell align="right">Tersedia</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
              <TableCell>{STOCK_ITEM_KIND_LABEL[row.kind]}</TableCell>
              <TableCell align="right">{row.available > 0 ? `${row.available} ${row.unit}` : <StatusChip label="Habis" tone="error" />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
