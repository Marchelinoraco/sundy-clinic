import { formatRupiah } from "@/lib/format";
import type { TrendPoint } from "@/lib/report";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

/** "2026-08" → "Ags 2026". */
function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${MONTH_SHORT[mon - 1]} ${year}`;
}

export type Series = "revenue" | "cost" | "net";
export type Bar = { month: string; series: Series; x: number; y: number; width: number; height: number; negative: boolean };

/**
 * Geometri grafik: tiga batang per bulan (pendapatan, biaya, laba bersih) dengan skala bersama. Batang laba
 * negatif digambar di bawah garis dasar. Semua nilai selalu berhingga (data nol tidak menghasilkan NaN).
 */
export function chartGeometry(points: TrendPoint[], size: { width: number; height: number }): { bars: Bar[]; baselineY: number } {
  const maxUp = Math.max(0, ...points.flatMap((p) => [p.revenue, p.cost, p.netProfit]));
  const maxDown = Math.max(0, ...points.map((p) => -p.netProfit));
  const total = maxUp + maxDown || 1;
  const baselineY = (maxUp / total) * size.height;
  const group = size.width / Math.max(points.length, 1);
  const barWidth = (group * 0.8) / 3;
  const bars: Bar[] = [];
  points.forEach((point, index) => {
    const x0 = index * group + group * 0.1;
    (["revenue", "cost", "net"] as const).forEach((series, seriesIndex) => {
      const value = series === "revenue" ? point.revenue : series === "cost" ? point.cost : point.netProfit;
      const height = (Math.abs(value) / total) * size.height;
      const negative = value < 0;
      bars.push({ month: point.month, series, x: x0 + seriesIndex * barWidth, y: negative ? baselineY : baselineY - height, width: barWidth, height, negative });
    });
  });
  return { bars, baselineY };
}

const FILL: Record<Series, string> = { revenue: "fill-amber-500", cost: "fill-stone-500", net: "fill-emerald-600" };

/** Grafik tren 12 bulan (spec laporan 7), digambar dengan SVG; angka lengkapnya ada di tabel yang tersembunyi secara visual. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const size = { width: 720, height: 200 };
  const { bars, baselineY } = chartGeometry(points, size);
  const group = size.width / Math.max(points.length, 1);
  return (
    <div className="space-y-2">
      <svg role="img" aria-label="Grafik tren 12 bulan" viewBox={`0 0 ${size.width} ${size.height + 24}`} className="h-auto w-full">
        <line x1={0} x2={size.width} y1={baselineY} y2={baselineY} className="stroke-border" />
        {bars.map((bar) => (
          <rect key={`${bar.month}-${bar.series}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} className={bar.series === "net" && bar.negative ? "fill-red-600" : FILL[bar.series]} />
        ))}
        {points.map((point, index) => (
          <text key={point.month} x={index * group + group / 2} y={size.height + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {MONTH_SHORT[Number(point.month.slice(5, 7)) - 1]}
          </text>
        ))}
      </svg>
      <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden>
        <li>
          <span className="mr-1 inline-block size-2 rounded-sm bg-amber-500" />
          Pendapatan
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-sm bg-stone-500" />
          Biaya (harga pokok + pengeluaran)
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-sm bg-emerald-600" />
          Laba bersih
        </li>
      </ul>
      <table aria-label="Data tren bulanan" className="sr-only">
        <thead>
          <tr>
            <th>Bulan</th>
            <th>Pendapatan</th>
            <th>Biaya</th>
            <th>Laba bersih</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <td>{monthLabel(point.month)}</td>
              <td>{formatRupiah(point.revenue)}</td>
              <td>{formatRupiah(point.cost)}</td>
              <td>{formatRupiah(point.netProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
