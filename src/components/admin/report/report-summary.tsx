import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { formatRupiah } from "@/lib/format";
import { profitLabel, type Comparison, type Delta, type ReportView } from "@/lib/report";

/** Teks perbandingan dengan periode sebelumnya, mis. "naik 10% (Rp 10) dari periode sebelumnya". */
export function deltaText(delta: Delta): string {
  if (delta.amount === 0) return "sama dengan periode sebelumnya";
  const direction = delta.amount > 0 ? "naik" : "turun";
  const amount = formatRupiah(Math.abs(delta.amount));
  if (delta.percent === null) return `${direction} ${amount} dari periode sebelumnya`;
  return `${direction} ${String(Math.abs(delta.percent)).replace(".", ",")}% (${amount}) dari periode sebelumnya`;
}

function Card({ label, value, delta, tone }: { label: string; value: number; delta: Delta; tone?: "success" | "error" }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: tone ? `${tone}.main` : undefined }}>{formatRupiah(value)}</Typography>
      <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
        {deltaText(delta)}
      </Typography>
    </Paper>
  );
}

/** Lima angka utama (spec laporan 7); laba bersih ditulis "Rugi bersih" bila negatif. */
export function ReportSummary({ view, comparison }: { view: ReportView; comparison: Comparison }) {
  const { totals } = view;
  const net = profitLabel(totals.netProfit);
  return (
    <Box
      component="section"
      aria-label="Ringkasan laporan"
      sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(5, 1fr)" } }}
    >
      <Card label="Pendapatan" value={totals.revenue} delta={comparison.revenue} />
      <Card label="Harga pokok" value={totals.cogs} delta={comparison.cogs} />
      <Card label="Laba kotor" value={totals.grossProfit} delta={comparison.grossProfit} tone={totals.grossProfit < 0 ? "error" : undefined} />
      <Card label="Pengeluaran" value={totals.expenses} delta={comparison.expenses} />
      <Card label={`${net} bersih`} value={totals.netProfit} delta={comparison.netProfit} tone={net === "Rugi" ? "error" : "success"} />
    </Box>
  );
}
