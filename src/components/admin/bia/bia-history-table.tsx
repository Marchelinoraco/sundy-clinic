import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { BIA_FIELDS } from "@/lib/bia";
import { formatDecimal } from "@/lib/encounter";
import { formatIndonesianDate } from "@/lib/format";
import type { BiaMeasurementView } from "@/server/bia-read";

/** Riwayat pengukuran BIA satu pasien (spec hasil BIA 6.3), terbaru dulu. */
export function BiaHistoryTable({ items }: { items: BiaMeasurementView[] }) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Riwayat BIA">
        <TableHead>
          <TableRow>
            <TableCell>Tanggal</TableCell>
            <TableCell>Booking</TableCell>
            {BIA_FIELDS.map((spec) => (
              <TableCell key={spec.key} align="right">
                {spec.label}
                {spec.unit ? ` (${spec.unit})` : ""}
              </TableCell>
            ))}
            <TableCell>Berkas</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} sx={item.voided ? { opacity: 0.7 } : undefined}>
              <TableCell>
                {formatIndonesianDate(item.createdAt)}
                {item.voided && <div>Dibatalkan: {item.voided.reason}</div>}
              </TableCell>
              <TableCell sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>{item.appointmentCode}</TableCell>
              {BIA_FIELDS.map((spec) => (
                <TableCell key={spec.key} align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {item.numbers[spec.key] === null ? "—" : formatDecimal(item.numbers[spec.key]!, spec.decimals)}
                </TableCell>
              ))}
              <TableCell>
                {item.files.length === 0
                  ? "—"
                  : item.files.map((file) => (
                      <div key={file.id}>
                        <Link href={`/admin/bia/berkas/${file.id}${file.previewable ? "" : "?unduh=1"}`} target="_blank" rel="noopener">
                          {file.originalName}
                        </Link>
                      </div>
                    ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
