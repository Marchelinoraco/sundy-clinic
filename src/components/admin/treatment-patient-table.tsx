import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { dateLabel } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { returnIntervalLabel } from "@/lib/treatment-reminder";
import type { TreatmentPatientRow } from "@/server/treatment-patients-read";
import { EmptyState } from "./page-layout";
import { TreatmentReminderSendButton } from "./treatment-reminder-send-button";

/** Tab "Pasien treatment" (spec pengingat treatment PT10): treatment terakhir dan kirim ulang satu per satu. */
export function TreatmentPatientTable({ rows }: { rows: TreatmentPatientRow[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada pasien treatment.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Pasien treatment">
        <TableHead>
          <TableRow>
            <TableCell>Pasien</TableCell>
            <TableCell>Treatment terakhir</TableCell>
            <TableCell>Tanggal</TableCell>
            <TableCell>Terakhir diingatkan</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.patientId}>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {row.patientName}
                </Typography>
                <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                  {row.medicalRecordNumber}
                </Typography>
                {row.markers.map((marker) => (
                  <Typography key={marker} variant="caption" component="div" sx={{ color: "warning.main" }}>
                    {marker}
                  </Typography>
                ))}
              </TableCell>
              <TableCell>
                {row.treatments}
                <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                  tiap {returnIntervalLabel(row.intervalDays)}
                </Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{dateLabel(row.treatmentOn)}</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{row.lastReminder ? `${dateLabel(witaDateString(row.lastReminder.sentAt))} · ${row.lastReminder.staffName}` : "—"}</TableCell>
              <TableCell align="right">
                {row.message.link ? (
                  <TreatmentReminderSendButton href={row.message.link} patientId={row.patientId} treatmentOn={row.treatmentOn} label={row.lastReminder ? "Kirim lagi" : "Kirim"} />
                ) : (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Nomor WhatsApp pasien tidak dikenali.
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
