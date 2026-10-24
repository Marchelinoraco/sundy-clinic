import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { approvedSuffix } from "@/lib/approval";
import { DEPOSIT_REFUND_MIN } from "@/lib/deposit";
import { formatRupiah } from "@/lib/format";
import { dateLabel } from "@/lib/stock";
import type { DepositBalanceRow, DepositMovement, DepositMovementKind } from "@/server/deposit-read";
import { TextLink } from "../mui/links";
import { StatusChip, type StatusTone } from "../mui/status-chip";
import { EmptyState } from "../page-layout";
import { RefundDepositDialog } from "./refund-deposit-dialog";

const KIND: Record<DepositMovementKind, { label: string; tone: StatusTone }> = {
  MASUK: { label: "Masuk", tone: "success" },
  DIPAKAI: { label: "Dipakai", tone: "info" },
  DIKEMBALIKAN: { label: "Dikembalikan", tone: "warning" },
  HANGUS: { label: "Hangus", tone: "neutral" },
};

function PatientName({ row, link }: { row: { patientId: string; patientName: string; medicalRecordNumber: string }; link: boolean }) {
  return (
    <>
      {link ? <TextLink href={`/admin/pasien/${row.patientId}`}>{row.patientName}</TextLink> : row.patientName}
      <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
        {row.medicalRecordNumber}
      </Typography>
    </>
  );
}

/** Tab Aktif (spec deposit D18): saldo yang masih berlaku per pasien; Kembalikan uang bila saldo ≥ Rp 200.000 (D16). */
export function DepositBalanceTable({ rows, canRefund, patientLinks = true }: { rows: DepositBalanceRow[]; canRefund: boolean; patientLinks?: boolean }) {
  if (rows.length === 0) return <EmptyState>Belum ada pasien dengan saldo deposit.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Saldo deposit aktif">
        <TableHead>
          <TableRow>
            <TableCell>Pasien</TableCell>
            <TableCell align="right">Saldo</TableCell>
            <TableCell>Berlaku s.d. (terdekat)</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.patientId}>
              <TableCell>
                <PatientName row={row} link={patientLinks} />
              </TableCell>
              <TableCell align="right">{formatRupiah(row.balance)}</TableCell>
              <TableCell>{dateLabel(row.nearestValidUntil)}</TableCell>
              <TableCell align="right">
                {canRefund && row.balance >= DEPOSIT_REFUND_MIN && <RefundDepositDialog patientId={row.patientId} patientName={row.patientName} balance={row.balance} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Tab Riwayat (spec deposit D18): masuk, dipakai, dikembalikan, dan hangus, terbaru dulu. */
export function DepositHistoryTable({ rows }: { rows: DepositMovement[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada gerakan deposit pada rentang ini.</EmptyState>;
  return (
    <TableContainer>
      <Table size="small" aria-label="Riwayat deposit">
        <TableHead>
          <TableRow>
            <TableCell>Tanggal</TableCell>
            <TableCell>Gerakan</TableCell>
            <TableCell>Pasien</TableCell>
            <TableCell align="right">Jumlah</TableCell>
            <TableCell>Tagihan</TableCell>
            <TableCell>Staf</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{dateLabel(row.date)}</TableCell>
              <TableCell>
                <StatusChip label={KIND[row.kind].label} tone={KIND[row.kind].tone} />
                <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                  {row.label}
                </Typography>
              </TableCell>
              <TableCell>
                <PatientName row={row} link={false} />
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                {row.kind === "MASUK" ? "+" : "-"}
                {formatRupiah(row.amount)}
              </TableCell>
              <TableCell>{row.invoiceId && row.invoiceNumber ? <TextLink href={`/admin/tagihan/${row.invoiceId}`}>{row.invoiceNumber}</TextLink> : "—"}</TableCell>
              <TableCell>
                {row.staffName ? `${row.staffName}${approvedSuffix(row.approvedByName)}` : "—"}
                {row.note && (
                  <Box component="div" sx={{ typography: "caption", color: "text.secondary" }}>
                    {row.note}
                  </Box>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
