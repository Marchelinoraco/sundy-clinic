import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { EmptyState } from "../page-layout";

/** Sesi paket terpakai per treatment di periode laporan (spec paket 8). */
export function PackageSessionsTable({ rows }: { rows: { name: string; sessions: number }[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada sesi paket terpakai.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Sesi paket terpakai">
        <TableHead>
          <TableRow>
            <TableCell>Treatment</TableCell>
            <TableCell align="right">Sesi</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell>{row.name}</TableCell>
              <TableCell align="right">{row.sessions}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
