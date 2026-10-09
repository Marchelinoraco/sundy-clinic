"use client";

import type { SxProps, Theme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import type { ReactNode } from "react";

/**
 * Pilihan berbentuk TextField MUI yang tetap `<select>` asli (spec MUI 4): pilihan sistem di ponsel,
 * dan `selectOptions`/`selectOption` di uji tetap berlaku. Isi dengan `<option>`.
 */
export function SelectField({
  label,
  "aria-label": ariaLabel,
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  helperText,
  error,
  fullWidth = true,
  sx,
  children,
}: {
  label?: string;
  "aria-label"?: string;
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  return (
    <TextField
      select
      id={id}
      label={label}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      disabled={disabled}
      helperText={helperText}
      error={error}
      fullWidth={fullWidth}
      sx={sx}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true }, htmlInput: { "aria-label": ariaLabel } }}
    >
      {children}
    </TextField>
  );
}
