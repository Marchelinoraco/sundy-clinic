import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { marginOf, marginPercent } from "@/lib/costing";
import { formatRupiah } from "@/lib/format";
import type { MarginReport } from "@/server/report-sql";
import { EmptyState } from "../page-layout";

const percentText = (margin: number, revenue: number) => {
  const percent = marginPercent(margin, revenue);
  return percent === null ? "—" : `${percent.toLocaleString("id-ID")}%`;
};

const total = { "& > td": { fontWeight: 600 } } as const;

/** Tab "Margin" laporan (spec harga modal 7): per kelompok, lalu per barang dan per treatment. */
export function MarginReportView({ report }: { report: MarginReport }) {
  const goodsCost = report.goods.stockCost;
  const goodsMargin = marginOf({ ...report.goods, materialCost: 0, toolCost: 0, otherCost: 0, commission: 0 });
  const treatmentCost = report.treatment.materialCost + report.treatment.toolCost + report.treatment.otherCost + report.treatment.commission;
  const treatmentMargin = marginOf({ ...report.treatment, stockCost: 0 });
  const totalMargin = goodsMargin + treatmentMargin + report.packageRevenue + report.serviceRevenue - report.invoiceDiscount;
  const empty = report.goods.revenue === 0 && report.treatment.revenue === 0 && report.packageRevenue === 0 && report.serviceRevenue === 0 && report.byTreatment.length === 0;
  if (empty) return <EmptyState>Belum ada transaksi di periode ini.</EmptyState>;

  return (
    <Stack spacing={3} sx={{ pb: 2 }}>
      <TableContainer>
        <Table size="small" aria-label="Margin per kelompok">
          <TableHead>
            <TableRow>
              <TableCell>Kelompok</TableCell>
              <TableCell align="right">Pendapatan</TableCell>
              <TableCell align="right">Modal</TableCell>
              <TableCell align="right">Margin</TableCell>
              <TableCell align="right">%</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>Obat dan produk</TableCell>
              <TableCell align="right">{formatRupiah(report.goods.revenue)}</TableCell>
              <TableCell align="right">{formatRupiah(goodsCost)}</TableCell>
              <TableCell align="right">{formatRupiah(goodsMargin)}</TableCell>
              <TableCell align="right">{percentText(goodsMargin, report.goods.revenue)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Treatment</TableCell>
              <TableCell align="right">{formatRupiah(report.treatment.revenue)}</TableCell>
              <TableCell align="right">{formatRupiah(treatmentCost)}</TableCell>
              <TableCell align="right">{formatRupiah(treatmentMargin)}</TableCell>
              <TableCell align="right">{percentText(treatmentMargin, report.treatment.revenue)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Paket</TableCell>
              <TableCell align="right">{formatRupiah(report.packageRevenue)}</TableCell>
              <TableCell align="right">—</TableCell>
              <TableCell align="right">{formatRupiah(report.packageRevenue)}</TableCell>
              <TableCell align="right">—</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Layanan</TableCell>
              <TableCell align="right">{formatRupiah(report.serviceRevenue)}</TableCell>
              <TableCell align="right">—</TableCell>
              <TableCell align="right">{formatRupiah(report.serviceRevenue)}</TableCell>
              <TableCell align="right">—</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Diskon tagihan</TableCell>
              <TableCell align="right" />
              <TableCell align="right" />
              <TableCell align="right">-{formatRupiah(report.invoiceDiscount)}</TableCell>
              <TableCell align="right" />
            </TableRow>
            <TableRow sx={total}>
              <TableCell>Total margin</TableCell>
              <TableCell align="right" />
              <TableCell align="right" />
              <TableCell align="right">{formatRupiah(totalMargin)}</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" component="p" sx={{ px: 2, mt: -2, color: "text.secondary" }}>
        Pendapatan paket dihitung saat dijual; bahan, alat, biaya lainnya, dan komisi sesi paket yang terpakai sudah masuk baris Treatment.
      </Typography>

      <Box>
        <Typography component="h3" variant="subtitle2" sx={{ px: 2, pb: 1 }}>
          Per barang
        </Typography>
        <TableContainer>
          <Table size="small" aria-label="Margin per barang">
            <TableHead>
              <TableRow>
                <TableCell>Barang</TableCell>
                <TableCell align="right">Terjual</TableCell>
                <TableCell align="right">Pendapatan</TableCell>
                <TableCell align="right">Harga pokok</TableCell>
                <TableCell align="right">Margin</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.byItem.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell align="right">{row.quantity}</TableCell>
                  <TableCell align="right">{formatRupiah(row.revenue)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.cost)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.revenue - row.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography component="h3" variant="subtitle2" sx={{ px: 2, pb: 1 }}>
          Per treatment
        </Typography>
        <TableContainer>
          <Table size="small" aria-label="Margin per treatment">
            <TableHead>
              <TableRow>
                <TableCell>Treatment</TableCell>
                <TableCell align="right">Dilakukan</TableCell>
                <TableCell align="right">Pendapatan</TableCell>
                <TableCell align="right">Bahan</TableCell>
                <TableCell align="right">Alat</TableCell>
                <TableCell align="right">Lainnya</TableCell>
                <TableCell align="right">Komisi</TableCell>
                <TableCell align="right">Margin</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.byTreatment.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell align="right">{row.quantity}</TableCell>
                  <TableCell align="right">{formatRupiah(row.revenue)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.materialCost)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.toolCost)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.otherCost)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.commission)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.revenue - row.materialCost - row.toolCost - row.otherCost - row.commission)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Stack>
  );
}
