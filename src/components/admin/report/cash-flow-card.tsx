import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { CashFlow } from "@/lib/report";
import { cn } from "@/lib/utils";

/** Arus kas periode (spec laporan 3.3): terpisah dari laba; pembayaran hutang supplier ada di sini. */
export function CashFlowCard({ cash }: { cash: CashFlow }) {
  const rows: { label: string; value: number; strong?: boolean }[] = [
    { label: "Pembayaran customer", value: cash.customer },
    { label: "Pendapatan di muka", value: cash.upfront },
    { label: "Total masuk", value: cash.inflow, strong: true },
    { label: "Pembayaran hutang supplier (neto)", value: cash.supplier },
    { label: "Pengeluaran", value: cash.expenses },
    { label: "Total keluar", value: cash.outflow, strong: true },
    { label: "Kas bersih", value: cash.net, strong: true },
  ];
  return (
    <section aria-label="Arus kas" className="space-y-2">
      <Table>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label} className={cn(row.strong && "font-semibold")}>
              <TableCell>{row.label}</TableCell>
              <TableCell className="text-right">{formatRupiah(row.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="px-4 pb-3 text-xs text-muted-foreground">Pembayaran hutang supplier tampil di sini saja dan tidak mengurangi laba (biaya barang sudah masuk lewat harga pokok).</p>
    </section>
  );
}
