import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { dateLabel } from "@/lib/stock";
import type { PurchaseRow } from "@/server/purchase-read";
import { EmptyState } from "../page-layout";
import { PayableStatusBadge } from "./payable-status-badge";

/** Tab "Barang masuk": faktur terbaru di atas. */
export function PurchaseTable({ rows }: { rows: PurchaseRow[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada barang masuk.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Faktur</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap">{dateLabel(row.invoiceDate)}</TableCell>
            <TableCell>
              <Link href={`/admin/stok/masuk/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.invoiceNumber}
              </Link>
              <div className="text-xs text-muted-foreground">
                {row.supplierName} · {row.lineCount} baris
              </div>
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="text-right">{formatRupiah(row.total)}</TableCell>
            <TableCell>
              <PayableStatusBadge status={row.status} overdue={row.overdue} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
