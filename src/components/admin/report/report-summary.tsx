import { formatRupiah } from "@/lib/format";
import { profitLabel, type Comparison, type Delta, type ReportView } from "@/lib/report";
import { cn } from "@/lib/utils";

/** Teks perbandingan dengan periode sebelumnya, mis. "naik 10% (Rp 10) dari periode sebelumnya". */
export function deltaText(delta: Delta): string {
  if (delta.amount === 0) return "sama dengan periode sebelumnya";
  const direction = delta.amount > 0 ? "naik" : "turun";
  const amount = formatRupiah(Math.abs(delta.amount));
  if (delta.percent === null) return `${direction} ${amount} dari periode sebelumnya`;
  return `${direction} ${String(Math.abs(delta.percent)).replace(".", ",")}% (${amount}) dari periode sebelumnya`;
}

function Card({ label, value, delta, negative = false }: { label: string; value: number; delta: Delta; negative?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold", negative && "text-destructive")}>{formatRupiah(value)}</p>
      <p className="text-xs text-muted-foreground">{deltaText(delta)}</p>
    </div>
  );
}

/** Lima angka utama (spec laporan 7); laba bersih ditulis "Rugi bersih" bila negatif. */
export function ReportSummary({ view, comparison }: { view: ReportView; comparison: Comparison }) {
  const { totals } = view;
  const net = profitLabel(totals.netProfit);
  return (
    <section aria-label="Ringkasan laporan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card label="Pendapatan" value={totals.revenue} delta={comparison.revenue} />
      <Card label="Harga pokok" value={totals.cogs} delta={comparison.cogs} />
      <Card label="Laba kotor" value={totals.grossProfit} delta={comparison.grossProfit} negative={totals.grossProfit < 0} />
      <Card label="Pengeluaran" value={totals.expenses} delta={comparison.expenses} />
      <Card label={`${net} bersih`} value={totals.netProfit} delta={comparison.netProfit} negative={net === "Rugi"} />
    </section>
  );
}
