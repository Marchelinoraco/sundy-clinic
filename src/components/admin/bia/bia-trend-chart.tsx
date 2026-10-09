"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useColorScheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import { ChartsDataProvider } from "@mui/x-charts/ChartsDataProvider";
import { ChartsGrid } from "@mui/x-charts/ChartsGrid";
import { ChartsLegend } from "@mui/x-charts/ChartsLegend";
import { ChartsSurface } from "@mui/x-charts/ChartsSurface";
import { ChartsTooltip } from "@mui/x-charts/ChartsTooltip";
import { ChartsXAxis } from "@mui/x-charts/ChartsXAxis";
import { ChartsYAxis } from "@mui/x-charts/ChartsYAxis";
import { LinePlot, MarkPlot } from "@mui/x-charts/LineChart";
import type { BiaPoint } from "@/lib/bia";
import { formatDecimal } from "@/lib/encounter";
import { formatShortIndonesianDate } from "@/lib/format";
import { DARK, STATUS, SUNDY } from "../mui/theme";

const show = (value: number | null, unit: string) => (value === null ? "—" : `${formatDecimal(value)} ${unit}`);

/**
 * Grafik progres komposisi tubuh (spec hasil BIA 6.2, PRD: penurunan lemak dan kenaikan massa otot): % lemak tubuh
 * dan massa otot per pengukuran. Angka lengkapnya ada di tabel yang tersembunyi secara visual, seperti grafik laporan.
 */
export function BiaTrendChart({ points }: { points: BiaPoint[] }) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  if (points.length === 0) return <Typography variant="body2">Belum ada hasil BIA.</Typography>;
  const color = dark ? { fat: DARK.primary, muscle: STATUS.dark.success } : { fat: SUNDY.brown600, muscle: STATUS.light.success };
  return (
    <Stack spacing={1}>
      <Box role="img" aria-label="Grafik komposisi tubuh" sx={{ width: "100%", minHeight: 240 }}>
        <ChartsDataProvider
          height={220}
          xAxis={[{ id: "tanggal", scaleType: "point", data: points.map((p) => formatShortIndonesianDate(p.at)) }]}
          yAxis={[{ id: "nilai", width: 40 }]}
          series={[
            { type: "line", id: "fat", label: "Lemak tubuh (%)", data: points.map((p) => p.bodyFatPercent), color: color.fat, connectNulls: true },
            { type: "line", id: "muscle", label: "Massa otot (kg)", data: points.map((p) => p.muscleMassKg), color: color.muscle, connectNulls: true },
          ]}
        >
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <LinePlot />
            <MarkPlot />
            <ChartsXAxis />
            <ChartsYAxis />
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsDataProvider>
      </Box>
      <Box component="table" aria-label="Data komposisi tubuh" sx={visuallyHidden}>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Lemak tubuh</th>
            <th>Massa otot</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.at.toISOString()}>
              <td>{formatShortIndonesianDate(point.at)}</td>
              <td>{show(point.bodyFatPercent, "%")}</td>
              <td>{show(point.muscleMassKg, "kg")}</td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Stack>
  );
}
