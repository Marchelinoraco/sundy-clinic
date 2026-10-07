import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { profitLabel, type ReportView } from "@/lib/report";
import { cn } from "@/lib/utils";

type Line = { label: string; current: number; previous: number; strong?: boolean; note?: string };

function categoryLines(current: ReportView, previous: ReportView): Line[] {
  const names = new Map<string, { name: string; isActive: boolean }>();
  for (const row of [...current.expensesByCategory, ...previous.expensesByCategory]) names.set(row.categoryId, { name: row.name, isActive: row.isActive });
  const amountOf = (view: ReportView, id: string) => view.expensesByCategory.find((row) => row.categoryId === id)?.amount ?? 0;
  return [...names.entries()].map(([id, category]) => ({
    label: category.isActive ? category.name : `${category.name} (nonaktif)`,
    current: amountOf(current, id),
    previous: amountOf(previous, id),
  }));
}

/** Rincian pendapatan, harga pokok, dan pengeluaran per kategori untuk periode ini dan sebelumnya (spec laporan 7). */
export function ReportDetail({ current, previous }: { current: ReportView; previous: ReportView }) {
  const c = current.totals;
  const p = previous.totals;
  const lines: Line[] = [
    { label: "Layanan", current: c.service, previous: p.service },
    { label: "Treatment", current: c.treatment, previous: p.treatment },
    { label: "Obat dan produk", current: c.goods, previous: p.goods },
    { label: "Diskon", current: c.discount, previous: p.discount, note: "pengurang" },
    { label: "Biaya booking (di muka)", current: current.upfrontFee, previous: previous.upfrontFee },
    { label: "Konsultasi Online (di muka)", current: current.upfrontOnline, previous: previous.upfrontOnline },
    { label: "Total pendapatan", current: c.revenue, previous: p.revenue, strong: true },
    { label: "Harga pokok", current: c.cogs, previous: p.cogs },
    { label: "Laba kotor", current: c.grossProfit, previous: p.grossProfit, strong: true },
    ...categoryLines(current, previous),
    { label: "Total pengeluaran", current: c.expenses, previous: p.expenses, strong: true },
    { label: `${profitLabel(c.netProfit)} bersih`, current: c.netProfit, previous: p.netProfit, strong: true },
    { label: "Belum tertagih (informasi)", current: c.outstanding, previous: p.outstanding, note: "tidak mengurangi laba" },
  ];
  return (
    <Table aria-label="Rincian laporan">
      <TableHeader>
        <TableRow>
          <TableHead>Rincian</TableHead>
          <TableHead className="text-right">Periode ini</TableHead>
          <TableHead className="text-right">Periode sebelumnya</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.label} className={cn(line.strong && "font-semibold")}>
            <TableCell>
              {line.label}
              {line.note && <span className="ml-2 text-xs font-normal text-muted-foreground">{line.note}</span>}
            </TableCell>
            <TableCell className="text-right">{formatRupiah(line.current)}</TableCell>
            <TableCell className="text-right">{formatRupiah(line.previous)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
