"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useColorScheme } from "@mui/material/styles";
import { visuallyHidden } from "@mui/utils";
import { BarPlot } from "@mui/x-charts/BarChart";
import { ChartsDataProvider } from "@mui/x-charts/ChartsDataProvider";
import { ChartsGrid } from "@mui/x-charts/ChartsGrid";
import { ChartsLegend } from "@mui/x-charts/ChartsLegend";
import { ChartsSurface } from "@mui/x-charts/ChartsSurface";
import { ChartsTooltip } from "@mui/x-charts/ChartsTooltip";
import { ChartsXAxis } from "@mui/x-charts/ChartsXAxis";
import { ChartsYAxis } from "@mui/x-charts/ChartsYAxis";
import { LinePlot, MarkPlot } from "@mui/x-charts/LineChart";
import { formatRupiah } from "@/lib/format";
import type { TrendPoint } from "@/lib/report";
import { DARK, STATUS, SUNDY } from "../mui/theme";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const rupiah = (value: number | null) => formatRupiah(value ?? 0);

/** "2026-08" → "Ags 2026". */
function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${MONTH_SHORT[mon - 1]} ${year}`;
}

/**
 * Grafik tren 12 bulan (spec laporan 7, spec MUI 4): batang pendapatan dan biaya, garis laba bersih, dengan
 * keterangan nilai saat disorot. Angka lengkapnya tetap ada di tabel yang tersembunyi secara visual.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const color = dark
    ? { revenue: DARK.primary, cost: SUNDY.cream300, net: STATUS.dark.success }
    : { revenue: SUNDY.gold600, cost: SUNDY.brown600, net: STATUS.light.success };
  return (
    <Stack spacing={1}>
      <Box role="img" aria-label="Grafik tren 12 bulan" sx={{ width: "100%", minHeight: 300 }}>
        <ChartsDataProvider
          height={280}
          xAxis={[{ id: "bulan", scaleType: "band", data: points.map((p) => MONTH_SHORT[Number(p.month.slice(5, 7)) - 1]) }]}
          yAxis={[{ id: "rupiah", width: 56, valueFormatter: (value: number) => compact.format(value) }]}
          series={[
            { type: "bar", id: "revenue", label: "Pendapatan", data: points.map((p) => p.revenue), color: color.revenue, valueFormatter: rupiah },
            { type: "bar", id: "cost", label: "Biaya (harga pokok + pengeluaran)", data: points.map((p) => p.cost), color: color.cost, valueFormatter: rupiah },
            { type: "line", id: "net", label: "Laba bersih", data: points.map((p) => p.netProfit), color: color.net, valueFormatter: rupiah },
          ]}
        >
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <BarPlot />
            <LinePlot />
            <MarkPlot />
            <ChartsXAxis />
            <ChartsYAxis />
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsDataProvider>
      </Box>
      <Box component="table" aria-label="Data tren bulanan" sx={visuallyHidden}>
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
      </Box>
    </Stack>
  );
}
