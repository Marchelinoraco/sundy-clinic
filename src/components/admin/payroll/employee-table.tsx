import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { formatRupiah } from "@/lib/format";
import type { EmployeeRow } from "@/server/payroll-read";
import { EmptyState, SectionCard } from "../page-layout";
import { EmployeeDialog } from "./employee-dialog";
import { EmployeeStatusButton } from "./employee-status-button";

/** Daftar karyawan (spec karyawan 5). Tanpa NIK dan nomor rekening. */
export function EmployeeTable({
  rows,
  branches,
  staffOptions,
}: {
  rows: EmployeeRow[];
  branches: { id: string; name: string }[];
  staffOptions: { id: string; name: string; employeeId: string | null }[];
}) {
  return (
    <SectionCard title="Karyawan" description={`${rows.filter((r) => r.status === "AKTIF").length} aktif`} flush>
      {rows.length === 0 ? (
        <EmptyState>Belum ada karyawan.</EmptyState>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nama</TableCell>
                <TableCell>Jabatan</TableCell>
                <TableCell>Cabang</TableCell>
                <TableCell align="right">Gaji pokok</TableCell>
                <TableCell align="right">Tunjangan</TableCell>
                <TableCell>Staf tertaut</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
                  <TableCell>{row.position}</TableCell>
                  <TableCell>{row.branchName ?? "Umum"}</TableCell>
                  <TableCell align="right">{formatRupiah(row.baseSalary)}</TableCell>
                  <TableCell align="right">{formatRupiah(row.allowance)}</TableCell>
                  <TableCell>{row.staffName ?? "—"}</TableCell>
                  <TableCell>{row.status === "AKTIF" ? "Aktif" : `Berhenti ${row.leftOn}`}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <EmployeeDialog branches={branches} staffOptions={staffOptions} employee={row} />
                      <EmployeeStatusButton employee={row} />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}
