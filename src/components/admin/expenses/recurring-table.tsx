import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { CategoryRow, RecurringRow } from "@/server/expense-read";
import { EmptyState } from "../page-layout";
import { RecurringDialog } from "./recurring-dialog";
import { StopRecurringButton } from "./stop-recurring-button";

/** Templat pengeluaran berulang (spec laporan 7). */
export function RecurringTable({
  rows,
  categories,
  branches,
  currentMonth,
}: {
  rows: RecurringRow[];
  categories: CategoryRow[];
  branches: { id: string; name: string }[];
  currentMonth: string;
}) {
  if (rows.length === 0) return <EmptyState>Belum ada pengeluaran berulang.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kategori</TableHead>
          <TableHead className="text-right">Nominal</TableHead>
          <TableHead>Jadwal</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              {row.categoryName}
              {row.note && <div className="text-xs text-muted-foreground">{row.note}</div>}
            </TableCell>
            <TableCell className="text-right">{formatRupiah(row.amount)}</TableCell>
            <TableCell>
              Tiap tanggal {row.dayOfMonth}, dari {row.startMonth}
              {row.endMonth ? ` sampai ${row.endMonth}` : ""}
            </TableCell>
            <TableCell>{row.branchName ?? "Umum"}</TableCell>
            <TableCell>
              <Badge variant={row.isActive ? "default" : "outline"}>{row.isActive ? "Aktif" : "Dihentikan"}</Badge>
            </TableCell>
            <TableCell className="space-x-1 whitespace-nowrap text-right">
              {row.isActive && (
                <>
                  <RecurringDialog categories={categories} branches={branches} currentMonth={currentMonth} row={row} />
                  <StopRecurringButton id={row.id} label={row.categoryName} />
                </>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
