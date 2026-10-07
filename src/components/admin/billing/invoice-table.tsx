import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import type { InvoiceRow } from "@/server/invoice-read";
import { EmptyState } from "../page-layout";
import { InvoiceStatusBadge } from "./invoice-status-badge";

/** Daftar tagihan (spec tagihan 4.1). */
export function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada tagihan di tampilan ini.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tagihan</TableHead>
          <TableHead>Pasien</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Sisa</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/admin/tagihan/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.number ?? "Draf"}
              </Link>
              <div className="text-xs text-muted-foreground">{formatDateWithYear(row.createdAt)}</div>
            </TableCell>
            <TableCell>{row.patientName}</TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="text-right">{formatRupiah(row.total)}</TableCell>
            <TableCell className="text-right font-medium">{formatRupiah(row.balance)}</TableCell>
            <TableCell>
              <InvoiceStatusBadge status={row.display} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
