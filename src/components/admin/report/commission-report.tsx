import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import type { CommissionDetailRow, CommissionRow } from "@/server/report-sql";
import { LinkButton, TextLink } from "../mui/links";
import { EmptyState } from "../page-layout";

/** Tab "Komisi" laporan (spec harga modal 7): per pelaksana, lalu rincian pelaksana yang dipilih. */
export function CommissionReportView({
  rows,
  details,
  selected,
  hrefFor,
  downloadHref,
}: {
  rows: CommissionRow[];
  details: CommissionDetailRow[] | null;
  selected: string | null;
  hrefFor: (performerId: string) => string;
  downloadHref: string;
}) {
  const chosen = rows.find((row) => row.performerId === selected);
  const total = rows.reduce((sum, row) => sum + row.commission, 0);
  return (
    <Stack spacing={2} sx={{ pb: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, pt: 2, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Komisi persen dihitung dari harga katalog treatment, bukan harga setelah diskon. Hanya tagihan final.
        </Typography>
        <LinkButton href={downloadHref} download variant="outlined" size="small">
          Unduh CSV komisi
        </LinkButton>
      </Stack>
      {rows.length === 0 ? (
        <EmptyState>Belum ada komisi di periode ini.</EmptyState>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Komisi per pelaksana">
            <TableHead>
              <TableRow>
                <TableCell>Pelaksana</TableCell>
                <TableCell align="right">Treatment</TableCell>
                <TableCell align="right">Komisi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.performerId} selected={row.performerId === selected}>
                  <TableCell>
                    <TextLink href={hrefFor(row.performerId)}>{row.performerName}</TextLink>
                  </TableCell>
                  <TableCell align="right">{row.treatments}</TableCell>
                  <TableCell align="right">{formatRupiah(row.commission)}</TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ "& > td": { fontWeight: 600 } }}>
                <TableCell>Total</TableCell>
                <TableCell align="right" />
                <TableCell align="right">{formatRupiah(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {details && chosen && (
        <TableContainer>
          <Table size="small" aria-label={`Rincian komisi ${chosen.performerName}`}>
            <TableHead>
              <TableRow>
                <TableCell>Tanggal</TableCell>
                <TableCell>Tagihan</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Treatment</TableCell>
                <TableCell align="right">Jumlah</TableCell>
                <TableCell align="right">Komisi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {details.map((detail, index) => (
                <TableRow key={`${detail.invoiceId}-${index}`}>
                  <TableCell>{formatDateWithYear(detail.finalizedAt)}</TableCell>
                  <TableCell>
                    <TextLink href={`/admin/tagihan/${detail.invoiceId}`}>{detail.invoiceNumber}</TextLink>
                  </TableCell>
                  <TableCell>{detail.customerName}</TableCell>
                  <TableCell>{detail.treatment}</TableCell>
                  <TableCell align="right">{detail.quantity}</TableCell>
                  <TableCell align="right">{formatRupiah(detail.commission)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
