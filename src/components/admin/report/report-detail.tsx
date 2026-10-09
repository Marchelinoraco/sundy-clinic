import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { formatRupiah } from "@/lib/format";
import { profitLabel, type ReportView } from "@/lib/report";

type Line = { label: string; current: number; previous: number; strong?: boolean; note?: string };

function categoryLines(current: ReportView, previous: ReportView): Line[] {
  const names = new Map<string, { name: string; isActive: boolean }>();
  for (const row of [...current.expensesByCategory, ...previous.expensesByCategory]) names.set(row.categoryId, { name: row.name, isActive: row.isActive });
  const amountOf = (view: ReportView, id: string) => view.expensesByCategory.find((row) => row.categoryId === id)?.amount ?? 0;
  return [...names.entries()].map(([id, category]) => ({
    label: category.isActive ? category.name : `${category.name} (nonaktif)`,
    current: amountOf(current, id),
    previous: amountOf(previous, id),
  }));
}

/** Rincian pendapatan, harga pokok, dan pengeluaran per kategori untuk periode ini dan sebelumnya (spec laporan 7). */
export function ReportDetail({ current, previous }: { current: ReportView; previous: ReportView }) {
  const c = current.totals;
  const p = previous.totals;
  const lines: Line[] = [
    { label: "Layanan", current: c.service, previous: p.service },
    { label: "Treatment", current: c.treatment, previous: p.treatment },
    { label: "Obat dan produk", current: c.goods, previous: p.goods },
    { label: "Diskon", current: c.discount, previous: p.discount, note: "pengurang" },
    { label: "Biaya booking (di muka)", current: current.upfrontFee, previous: previous.upfrontFee },
    { label: "Konsultasi Online (di muka)", current: current.upfrontOnline, previous: previous.upfrontOnline },
    { label: "Total pendapatan", current: c.revenue, previous: p.revenue, strong: true },
    { label: "Harga pokok", current: c.cogs, previous: p.cogs },
    { label: "Laba kotor", current: c.grossProfit, previous: p.grossProfit, strong: true },
    ...categoryLines(current, previous),
    { label: "Total pengeluaran", current: c.expenses, previous: p.expenses, strong: true },
    { label: `${profitLabel(c.netProfit)} bersih`, current: c.netProfit, previous: p.netProfit, strong: true },
    { label: "Belum tertagih (informasi)", current: c.outstanding, previous: p.outstanding, note: "tidak mengurangi laba" },
  ];
  return (
    <TableContainer>
      <Table size="small" aria-label="Rincian laporan">
        <TableHead>
          <TableRow>
            <TableCell>Rincian</TableCell>
            <TableCell align="right">Periode ini</TableCell>
            <TableCell align="right">Periode sebelumnya</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.label} sx={line.strong ? { "& > td": { fontWeight: 600 } } : undefined}>
              <TableCell>
                {line.label}
                {line.note && (
                  <Box component="span" sx={{ ml: 1, fontSize: "0.75rem", fontWeight: 400, color: "text.secondary" }}>
                    {line.note}
                  </Box>
                )}
              </TableCell>
              <TableCell align="right">{formatRupiah(line.current)}</TableCell>
              <TableCell align="right">{formatRupiah(line.previous)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
