"use client";

import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlined from "@mui/icons-material/SettingsBrightnessOutlined";
import { useColorScheme } from "@mui/material/styles";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";

const OPTIONS = [
  { value: "light", label: "Terang", Icon: LightModeOutlined },
  { value: "dark", label: "Gelap", Icon: DarkModeOutlined },
  { value: "system", label: "Ikuti sistem", Icon: SettingsBrightnessOutlined },
] as const;

/** Terang / Gelap / Ikuti sistem (spec MUI 5). Pilihan disimpan per perangkat oleh MUI. */
export function ColorModeToggle() {
  const { mode, setMode } = useColorScheme();
  // Sebelum terpasang di peramban, mode belum diketahui: jangan render agar tidak salah tanda.
  if (!mode) return null;
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={mode}
      onChange={(_, next: "light" | "dark" | "system" | null) => next && setMode(next)}
      aria-label="Mode tampilan"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <Tooltip key={value} title={label}>
          <ToggleButton value={value} aria-label={label}>
            <Icon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
