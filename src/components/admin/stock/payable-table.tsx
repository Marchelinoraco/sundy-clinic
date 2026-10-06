import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { dateLabel } from "@/lib/stock";
import type { PayableRow } from "@/server/payable-read";
import { EmptyState } from "../page-layout";
import { PayableStatusBadge } from "./payable-status-badge";

/** Daftar hutang (spec stok 6.1). */
export function PayableTable({ rows }: { rows: PayableRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada faktur di tampilan ini.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Jatuh tempo</TableHead>
          <TableHead>Faktur</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Dibayar / retur</TableHead>
          <TableHead className="text-right">Sisa</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap">{dateLabel(row.dueDate)}</TableCell>
            <TableCell>
              <Link href={`/admin/stok/masuk/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.invoiceNumber}
              </Link>
              <div className="text-xs text-muted-foreground">{row.supplierName}</div>
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="text-right">{formatRupiah(row.total)}</TableCell>
            <TableCell className="text-right">
              {formatRupiah(row.paid - row.refunded)}
              {row.returned > 0 && <div className="text-xs text-muted-foreground">retur {formatRupiah(row.returned)}</div>}
            </TableCell>
            <TableCell className="text-right font-medium">
              {row.balance < 0 ? `Kredit ${formatRupiah(-row.balance)}` : formatRupiah(row.balance)}
            </TableCell>
            <TableCell>
              <PayableStatusBadge status={row.status} overdue={row.overdue} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
