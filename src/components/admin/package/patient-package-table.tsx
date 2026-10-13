import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { dateLabel } from "@/lib/stock";
import { PACKAGE_STATE_LABEL, type PatientPackageState } from "@/lib/treatment-package";
import type { PatientPackageSummary } from "@/server/patient-package-read";
import { TextLink } from "../mui/links";
import { StatusChip, type StatusTone } from "../mui/status-chip";
import { EmptyState } from "../page-layout";

const TONE: Record<PatientPackageState, StatusTone> = { AKTIF: "success", KEDALUWARSA: "warning", HABIS: "neutral", DIBATALKAN: "error" };

/** Daftar paket customer (spec paket 7): sisa per treatment, berlaku s.d., dan status. */
export function PatientPackageTable({ rows, showPatient = true }: { rows: PatientPackageSummary[]; showPatient?: boolean }) {
  if (rows.length === 0) return <EmptyState>Belum ada paket.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Paket customer">
        <TableHead>
          <TableRow>
            {showPatient && <TableCell>Customer</TableCell>}
            <TableCell>Paket</TableCell>
            <TableCell>Sisa sesi</TableCell>
            <TableCell>Berlaku s.d.</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {showPatient && (
                <TableCell>
                  <Box component="span" sx={{ fontWeight: 500 }}>
                    {row.patient.name}
                  </Box>
                  <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                    {row.patient.medicalRecordNumber}
                  </Typography>
                </TableCell>
              )}
              <TableCell>
                <TextLink href={`/admin/paket/${row.id}`}>{row.name}</TextLink>
              </TableCell>
              <TableCell>
                {row.items.map((item) => (
                  <div key={item.serviceName}>
                    {item.serviceName} {item.remaining} dari {item.sessions}
                  </div>
                ))}
              </TableCell>
              <TableCell>{dateLabel(row.expiresOn)}</TableCell>
              <TableCell>
                <StatusChip label={PACKAGE_STATE_LABEL[row.state]} tone={TONE[row.state]} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
