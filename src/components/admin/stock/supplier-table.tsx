import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { SupplierRow } from "@/server/stock-read";
import { EmptyState } from "../page-layout";
import { SupplierActiveButton } from "./supplier-active-button";
import { SupplierDialog } from "./supplier-dialog";

/** Tab "Supplier" (spec stok 5.6). Kolom sisa hutang hanya untuk pemegang payable:manage. */
export function SupplierTable({ rows, canManage }: { rows: SupplierRow[]; canManage: boolean }) {
  if (rows.length === 0) return <EmptyState>Belum ada supplier.</EmptyState>;
  const showBalance = rows.some((row) => row.balance !== null);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nama</TableHead>
          <TableHead>Telepon</TableHead>
          <TableHead>Alamat</TableHead>
          {showBalance && <TableHead className="text-right">Sisa hutang</TableHead>}
          <TableHead>Status</TableHead>
          {canManage && <TableHead>Aksi</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="font-medium">{row.name}</div>
              {row.notes && <div className="text-xs text-muted-foreground">{row.notes}</div>}
            </TableCell>
            <TableCell>{row.phone ?? "—"}</TableCell>
            <TableCell>{row.address ?? "—"}</TableCell>
            {showBalance && <TableCell className="text-right">{formatRupiah(row.balance ?? 0)}</TableCell>}
            <TableCell>
              <Badge variant={row.isActive ? "default" : "outline"}>{row.isActive ? "Aktif" : "Nonaktif"}</Badge>
            </TableCell>
            {canManage && (
              <TableCell className="flex flex-wrap gap-1">
                <SupplierDialog
                  supplierId={row.id}
                  triggerLabel="Ubah"
                  initial={{ name: row.name, phone: row.phone ?? "", address: row.address ?? "", notes: row.notes ?? "" }}
                />
                <SupplierActiveButton supplierId={row.id} name={row.name} active={row.isActive} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
