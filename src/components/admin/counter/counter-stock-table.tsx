import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { STOCK_FLAG_LABEL } from "@/lib/stock";
import type { CounterItemRow } from "@/server/counter-read";
import { StatusChip } from "../mui/status-chip";
import { EmptyState } from "../page-layout";
import { FillCounterDialog } from "./fill-counter-dialog";

/** Stok meja satu cabang (spec stok meja 4.1): meja tersedia, Batas meja, dan tanda. Tanpa gudang dan harga. */
export function CounterStockTable({ rows, branchId, branchName, canFill }: { rows: CounterItemRow[]; branchId: string; branchName: string; canFill: boolean }) {
  if (rows.length === 0) return <EmptyState>Tidak ada barang di tampilan ini.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Stok meja">
        <TableHead>
          <TableRow>
            <TableCell>Barang</TableCell>
            <TableCell align="right">Meja</TableCell>
            <TableCell align="right">Batas meja</TableCell>
            <TableCell>Tanda</TableCell>
            {canFill && <TableCell>Aksi</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Box sx={{ fontWeight: 500 }}>{row.name}</Box>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {row.code}
                </Typography>
              </TableCell>
              <TableCell align="right">
                {row.available} {row.unit}
                {row.expired > 0 && <Box sx={{ fontSize: "0.75rem", color: "error.main" }}>{row.expired} kedaluwarsa di meja</Box>}
              </TableCell>
              <TableCell align="right">{row.counterMinStock > 0 ? row.counterMinStock : "—"}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {row.flag && <StatusChip label={STOCK_FLAG_LABEL[row.flag]} tone={row.flag === "MEJA_HABIS" ? "error" : "warning"} />}
                  {row.requested && <StatusChip label="Sudah diminta" tone="info" />}
                </Stack>
              </TableCell>
              {canFill && (
                <TableCell>
                  <FillCounterDialog item={{ id: row.id, name: row.name, unit: row.unit }} branches={[{ id: branchId, name: branchName }]} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
