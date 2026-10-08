"use client";

import type { SxProps, Theme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import { parseRupiahText, rupiahInputText } from "@/lib/rupiah-input";

/** Masukan harga: diketik sebagai angka, tampil "Rp 189.000"; yang diteruskan tetap angka bulat (spec D 5.4). */
export function RupiahInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  sx,
  fullWidth,
  "aria-label": ariaLabel,
}: {
  id?: string;
  label?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  /** Sisa API lama; diabaikan (dihapus di Task 13). */
  className?: string;
  sx?: SxProps<Theme>;
  fullWidth?: boolean;
  "aria-label"?: string;
}) {
  return (
    <TextField
      id={id}
      label={label}
      placeholder={placeholder}
      autoComplete="off"
      value={rupiahInputText(value)}
      onChange={(event) => onChange(parseRupiahText(event.target.value))}
      fullWidth={fullWidth}
      sx={sx}
      slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": ariaLabel } }}
    />
  );
}
