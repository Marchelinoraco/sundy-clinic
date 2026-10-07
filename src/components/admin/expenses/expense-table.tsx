import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { dateLabel } from "@/lib/stock";
import type { ExpenseRow } from "@/server/expense-read";
import { EmptyState } from "../page-layout";
import { VoidExpenseDialog } from "./void-expense-dialog";

/** Daftar pengeluaran satu bulan; total tidak menghitung yang dibatalkan. */
export function ExpenseTable({ rows }: { rows: ExpenseRow[] }) {
  if (rows.length === 0) return <EmptyState>Belum ada pengeluaran di bulan ini.</EmptyState>;
  const total = rows.reduce((sum, row) => (row.voided ? sum : sum + row.amount), 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Kategori</TableHead>
          <TableHead>Keterangan</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead className="text-right">Nominal</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className={row.voided ? "text-muted-foreground" : undefined}>
            <TableCell className="whitespace-nowrap">{dateLabel(row.date)}</TableCell>
            <TableCell>
              {row.categoryName} {row.recurring && <Badge variant="outline">Berulang</Badge>}
            </TableCell>
            <TableCell>
              <span className={row.voided ? "line-through" : undefined}>{row.note ?? "-"}</span>
              {row.voided && <div className="text-xs text-destructive">Dibatalkan oleh {row.voided.by}: {row.voided.reason}</div>}
            </TableCell>
            <TableCell>{row.branchName ?? "Umum"}</TableCell>
            <TableCell className={row.voided ? "text-right line-through" : "text-right"}>{formatRupiah(row.amount)}</TableCell>
            <TableCell className="text-right">
              {!row.voided && <VoidExpenseDialog id={row.id} label={`${row.categoryName} ${formatRupiah(row.amount)}`} />}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4}>Total (tanpa yang dibatalkan)</TableCell>
          <TableCell className="text-right font-semibold">{formatRupiah(total)}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
