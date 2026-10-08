import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { formatRupiah } from "@/lib/format";
import type { CashFlow } from "@/lib/report";

/** Arus kas periode (spec laporan 3.3): terpisah dari laba; pembayaran hutang supplier ada di sini. */
export function CashFlowCard({ cash }: { cash: CashFlow }) {
  const rows: { label: string; value: number; strong?: boolean }[] = [
    { label: "Pembayaran customer", value: cash.customer },
    { label: "Pendapatan di muka", value: cash.upfront },
    { label: "Total masuk", value: cash.inflow, strong: true },
    { label: "Pembayaran hutang supplier (neto)", value: cash.supplier },
    { label: "Pengeluaran", value: cash.expenses },
    { label: "Total keluar", value: cash.outflow, strong: true },
    { label: "Kas bersih", value: cash.net, strong: true },
  ];
  return (
    <Box component="section" aria-label="Arus kas">
      <TableContainer>
        <Table size="small">
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label} sx={row.strong ? { "& > td": { fontWeight: 600 } } : undefined}>
                <TableCell>{row.label}</TableCell>
                <TableCell align="right">{formatRupiah(row.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" component="p" sx={{ px: 2, pt: 1, pb: 1.5, color: "text.secondary" }}>
        Pembayaran hutang supplier tampil di sini saja dan tidak mengurangi laba (biaya barang sudah masuk lewat harga pokok).
      </Typography>
    </Box>
  );
}
