import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDecimal, formatSignedDecimal, vitalsTrend, type TrendSource, type VitalKey } from "@/lib/encounter";
import { formatShortIndonesianDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className={cn("ml-1 text-xs", value < 0 ? "text-emerald-700" : value > 0 ? "text-red-700" : "text-muted-foreground")}>
      {formatSignedDecimal(value)}
    </span>
  );
}

const show = (value: number | null) => (value === null ? "—" : formatDecimal(value));

/** Tab Tren (spec UI B bagian 4): berat, IMT, pinggang, dan tensi per kunjungan. */
export function VitalsTrendTab({ current, history }: { current: Record<VitalKey, number | null>; history: TrendSource[] }) {
  const trend = vitalsTrend(current, history);
  if (trend.empty) return <p className="text-sm text-muted-foreground">Belum ada angka tanda vital.</p>;

  const totals = [
    trend.summary.weight && `berat ${formatSignedDecimal(trend.summary.weight.delta)} kg sejak ${formatShortIndonesianDate(trend.summary.weight.since)}`,
    trend.summary.waist && `pinggang ${formatSignedDecimal(trend.summary.waist.delta)} cm sejak ${formatShortIndonesianDate(trend.summary.waist.since)}`,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <Table aria-label="Tren tanda vital">
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal</TableHead>
            <TableHead>Berat</TableHead>
            <TableHead>IMT</TableHead>
            <TableHead>Pinggang</TableHead>
            <TableHead>Tensi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trend.rows.map((row, index) => (
            <TableRow key={row.current ? "current" : index} className={row.current ? "bg-amber-50/70 font-medium dark:bg-amber-950/30" : undefined}>
              <TableCell>{row.current ? "Kunjungan ini" : formatShortIndonesianDate(row.date as Date)}</TableCell>
              <TableCell>
                {show(row.weightKg)}
                <Delta value={row.weightDelta} />
              </TableCell>
              <TableCell>{show(row.bmi)}</TableCell>
              <TableCell>
                {show(row.waistCm)}
                <Delta value={row.waistDelta} />
              </TableCell>
              <TableCell>{row.bloodPressure ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totals.length > 0 && <p className="text-sm">Total: {totals.join(" · ")}</p>}
      <p className="text-xs text-muted-foreground">Dari kunjungan final. Grafik lengkap menyusul di bagian BIA.</p>
    </div>
  );
}
