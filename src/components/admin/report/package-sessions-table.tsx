import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { EmptyState } from "../page-layout";

/** Sesi paket terpakai per treatment di periode laporan (spec paket 8). */
export function PackageSessionsTable({ rows }: { rows: { name: string; unit: string | null; sessions: number }[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada sesi paket terpakai.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Sesi paket terpakai">
        <TableHead>
          <TableRow>
            <TableCell>Isi paket</TableCell>
            <TableCell align="right">Terpakai</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.name}-${row.unit ?? ""}`}>
              <TableCell>{row.name}</TableCell>
              <TableCell align="right">
                {row.sessions}
                {row.unit ? ` ${row.unit}` : " sesi"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
