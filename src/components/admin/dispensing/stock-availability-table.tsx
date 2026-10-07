import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STOCK_ITEM_KIND_LABEL } from "@/lib/stock";
import type { AvailabilityRow } from "@/server/stock-availability";
import { EmptyState } from "../page-layout";

/** Tabel baca saja untuk Dokter: tanpa harga dan tanpa batch. */
export function StockAvailabilityTable({ rows }: { rows: AvailabilityRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada barang yang cocok.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Barang</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead className="text-right">Tersedia</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{STOCK_ITEM_KIND_LABEL[row.kind]}</TableCell>
            <TableCell className="text-right">
              {row.available > 0 ? `${row.available} ${row.unit}` : <Badge variant="destructive">Habis</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
