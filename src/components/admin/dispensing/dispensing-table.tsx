import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear } from "@/lib/format";
import type { DispensingRow } from "@/server/dispensing-read";
import { EmptyState } from "../page-layout";
import { DispensingStatusBadge } from "./dispensing-status-badge";

/** Antrean resep (spec penyerahan 6). */
export function DispensingTable({ rows }: { rows: DispensingRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada resep di tampilan ini.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pasien</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead>Kunjungan</TableHead>
          <TableHead className="text-right">Obat</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/admin/resep/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.patientName}
              </Link>
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDateWithYear(row.startAt)}</TableCell>
            <TableCell className="text-right">{row.lineCount}</TableCell>
            <TableCell>
              <DispensingStatusBadge status={row.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
