import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear } from "@/lib/format";
import type { BillableVisit } from "@/server/invoice-read";
import { EmptyState } from "../page-layout";
import { CreateInvoiceButton } from "./create-invoice-button";

/** Kunjungan final 30 hari terakhir yang belum punya tagihan aktif (spec tagihan 4.1). */
export function BillableTable({ rows, canManage }: { rows: BillableVisit[]; canManage: boolean }) {
  if (rows.length === 0) return <EmptyState>Semua kunjungan sudah ditagih.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Selesai</TableHead>
          <TableHead>Pasien</TableHead>
          <TableHead>Layanan</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Treatment</TableHead>
          {canManage && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.appointmentId}>
            <TableCell className="whitespace-nowrap">{formatDateWithYear(row.finalizedAt)}</TableCell>
            <TableCell>
              {row.patientName}
              <div className="text-xs text-muted-foreground">{row.medicalRecordNumber}</div>
            </TableCell>
            <TableCell>
              {row.serviceName ?? "-"} {row.online && <Badge variant="outline">Online</Badge>}
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="text-right">{row.treatmentCount}</TableCell>
            {canManage && (
              <TableCell className="text-right">
                <CreateInvoiceButton appointmentId={row.appointmentId} patientName={row.patientName} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
