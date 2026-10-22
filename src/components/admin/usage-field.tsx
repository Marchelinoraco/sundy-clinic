"use client";

import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { USAGE_FREQUENCIES, USAGE_OTHER, type UsageParts } from "@/lib/usage";
import { SelectField } from "./mui/select-field";

/**
 * Aturan pakai obat (spec aturan pakai AP1–AP2): frekuensi pilihan atau diketik sendiri lewat Lainnya, ditambah waktu.
 * Dipakai resep dokter dan penyerahan obat Apoteker. Dengan `name`, setiap isian diberi nama aksesibel "… {name}" agar
 * bisa dibedakan antarbaris tabel.
 */
export function UsageField({ value, onChange, name }: { value: UsageParts; onChange: (parts: UsageParts) => void; name?: string }) {
  const accessible = (label: string) => (name ? `${label} ${name}` : undefined);
  const set = (patch: Partial<UsageParts>) => onChange({ ...value, ...patch });
  const other = value.frequency === USAGE_OTHER;

  return (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: other ? "1fr 1fr 1fr" : "1fr 1fr" } }}>
      <SelectField label="Aturan pakai" aria-label={accessible("Aturan pakai")} value={value.frequency} onChange={(frequency) => set({ frequency: frequency as UsageParts["frequency"] })}>
        <option value="">Pilih aturan pakai</option>
        {USAGE_FREQUENCIES.map((frequency) => (
          <option key={frequency} value={frequency}>
            {frequency}
          </option>
        ))}
        <option value={USAGE_OTHER}>Lainnya (ketik sendiri)</option>
      </SelectField>
      {other && (
        <TextField
          label="Aturan pakai lain"
          placeholder="mis. 2xSehari, bila perlu"
          value={value.custom}
          onChange={(e) => set({ custom: e.target.value })}
          fullWidth
          slotProps={{ htmlInput: { "aria-label": accessible("Aturan pakai lain") } }}
        />
      )}
      <TextField
        label="Waktu"
        value={value.timing}
        onChange={(e) => set({ timing: e.target.value })}
        fullWidth
        slotProps={{ htmlInput: { "aria-label": accessible("Waktu") } }}
      />
    </Box>
  );
}
