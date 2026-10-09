"use client";

import Box from "@mui/material/Box";
import { useColorScheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import type { DashboardNumbers } from "@/server/dashboard";
import { DARK, SUNDY } from "./mui/theme";

type BySource = DashboardNumbers["current"]["bySource"];
const SOURCES: [keyof BySource, string][] = [
  ["SITUS", "Situs"],
  ["WHATSAPP", "WhatsApp"],
  ["TELEPON", "Telepon"],
  ["WALK_IN", "Walk-in"],
];

/**
 * Batang kecil booking per sumber di kartu Angka (spec MUI 4). Pelengkap visual: angka yang sama tetap
 * tertulis di bawahnya, dan nama aksesibelnya memuat semua angka.
 */
export function BookingSourceChart({ bySource }: { bySource: BySource }) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const label = `Grafik booking per sumber: ${SOURCES.map(([key, name]) => `${name} ${bySource[key]}`).join(", ")}`;
  return (
    <Box role="img" aria-label={label} sx={{ width: "100%", height: 150, mt: 2 }}>
      <BarChart
        height={150}
        layout="horizontal"
        yAxis={[{ scaleType: "band", data: SOURCES.map(([, name]) => name), width: 76 }]}
        xAxis={[{ tickMinStep: 1 }]}
        series={[{ data: SOURCES.map(([key]) => bySource[key]), label: "Booking", color: dark ? DARK.primary : SUNDY.gold600 }]}
        hideLegend
        margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
      />
    </Box>
  );
}
