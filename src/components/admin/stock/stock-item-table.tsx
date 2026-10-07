import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { STOCK_FLAG_LABEL, STOCK_ITEM_KIND_LABEL } from "@/lib/stock";
import type { StockItemRow } from "@/server/stock-read";
import { EmptyState } from "../page-layout";

/** Daftar barang satu cabang (spec stok 5.1). */
export function StockItemTable({ rows }: { rows: StockItemRow[] }) {
  if (rows.length === 0) return <EmptyState>Tidak ada barang yang cocok.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kode</TableHead>
          <TableHead>Barang</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead className="text-right">Stok tersedia</TableHead>
          <TableHead className="text-right">Harga jual</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs">{row.code}</TableCell>
            <TableCell>
              <Link href={`/admin/stok/barang/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                {row.name}
              </Link>
              {(row.flags.length > 0 || !row.isActive) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {row.flags.map((flag) => (
                    <Badge key={flag} variant={flag === "KEDALUWARSA" ? "destructive" : "outline"}>
                      {STOCK_FLAG_LABEL[flag]}
                    </Badge>
                  ))}
                  {!row.isActive && <Badge variant="outline">Nonaktif</Badge>}
                </div>
              )}
            </TableCell>
            <TableCell>{STOCK_ITEM_KIND_LABEL[row.kind]}</TableCell>
            <TableCell className="text-right">
              <div>
                {row.available} {row.unit}
              </div>
              {row.onHand > row.available && (
                <div className="text-xs text-destructive">{row.onHand - row.available} kedaluwarsa</div>
              )}
            </TableCell>
            <TableCell className="text-right">{row.sellPrice === null ? "—" : formatRupiah(row.sellPrice)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
