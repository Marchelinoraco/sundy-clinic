import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { AuditTrailRow } from "@/server/audit";

/** "Jejak catatan ini" (spec bagian 9) — hanya diberikan untuk audit:read. */
export function AuditTrail({ rows }: { rows: AuditTrailRow[] }) {
  return (
    <Paper component="details" variant="outlined" sx={{ p: 2, fontSize: "0.875rem", "& > summary": { cursor: "pointer", fontWeight: 500 } }}>
      <summary>Jejak catatan ini</summary>
      <Box sx={{ mt: 1.5 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Waktu (WITA)</TableCell>
                <TableCell>Staf</TableCell>
                <TableCell>Aksi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {formatShortIndonesianDate(row.at)}, {minutesToTimeLabel(witaMinutesOfDay(row.at))}
                  </TableCell>
                  <TableCell>
                    {row.actorName} ({row.roleLabel})
                  </TableCell>
                  <TableCell>{row.actionLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  );
}
