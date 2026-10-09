import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { formatDecimal, formatSignedDecimal, vitalsTrend, type TrendSource, type VitalKey } from "@/lib/encounter";
import { formatShortIndonesianDate } from "@/lib/format";

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <Box
      component="span"
      sx={{ ml: 0.5, fontSize: "0.75rem", color: value < 0 ? "success.main" : value > 0 ? "error.main" : "text.secondary" }}
    >
      {formatSignedDecimal(value)}
    </Box>
  );
}

const show = (value: number | null) => (value === null ? "—" : formatDecimal(value));

/** Tab Tren (spec UI B bagian 4): berat, IMT, pinggang, dan tensi per kunjungan. */
export function VitalsTrendTab({ current, history }: { current: Record<VitalKey, number | null>; history: TrendSource[] }) {
  const trend = vitalsTrend(current, history);
  if (trend.empty) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Belum ada angka tanda vital.
      </Typography>
    );
  }

  const totals = [
    trend.summary.weight && `berat ${formatSignedDecimal(trend.summary.weight.delta)} kg sejak ${formatShortIndonesianDate(trend.summary.weight.since)}`,
    trend.summary.waist && `pinggang ${formatSignedDecimal(trend.summary.waist.delta)} cm sejak ${formatShortIndonesianDate(trend.summary.waist.since)}`,
  ].filter(Boolean);

  return (
    <Stack spacing={1}>
      <TableContainer>
        {/* Kolom konteks sempit: jarak sel serapat tabel lama agar kelima kolom muat. */}
        <Table size="small" aria-label="Tren tanda vital" sx={{ "& .MuiTableCell-root": { px: 1 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Tanggal</TableCell>
              <TableCell>Berat</TableCell>
              <TableCell>IMT</TableCell>
              <TableCell>Pinggang</TableCell>
              <TableCell>Tensi</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trend.rows.map((row, index) => (
              <TableRow
                key={row.current ? "current" : index}
                sx={row.current ? { bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.08)", "& > td": { fontWeight: 500 } } : undefined}
              >
                <TableCell>{row.current ? "Kunjungan ini" : formatShortIndonesianDate(row.date as Date)}</TableCell>
                <TableCell>
                  {show(row.weightKg)}
                  <Delta value={row.weightDelta} />
                </TableCell>
                <TableCell>{show(row.bmi)}</TableCell>
                <TableCell>
                  {show(row.waistCm)}
                  <Delta value={row.waistDelta} />
                </TableCell>
                <TableCell>{row.bloodPressure ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {totals.length > 0 && <Typography variant="body2">Total: {totals.join(" · ")}</Typography>}
      <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
        Dari kunjungan final.
      </Typography>
    </Stack>
  );
}
