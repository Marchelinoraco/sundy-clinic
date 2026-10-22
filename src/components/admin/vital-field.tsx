"use client";

import TextField from "@mui/material/TextField";
import { VITALS, type VitalKey } from "@/lib/encounter";

/** Satu isian angka vital dengan label dan satuannya; dipakai bagian O dokter dan halaman Tangani perawat. */
export function VitalField(props: { vital: VitalKey; value: string; error: string | null; onChange: (value: string) => void }) {
  const spec = VITALS[props.vital];
  return (
    <TextField
      label={`${spec.label} (${spec.unit})`}
      value={props.value}
      error={props.error !== null}
      helperText={props.error}
      onChange={(e) => props.onChange(e.target.value)}
      fullWidth
      slotProps={{ htmlInput: { inputMode: spec.decimals === 0 ? "numeric" : "decimal" } }}
    />
  );
}
