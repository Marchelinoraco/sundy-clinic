"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { EncounterOptions } from "@/lib/encounter";
import { SelectField } from "./mui/select-field";

type Row = { packageId: string };

/** Paket di bagian Resep (spec vital perawat PR1): dipilih dari katalog, isinya terlihat, tanpa harga. */
export function PackageFields({ rows, options, onChange }: { rows: Row[]; options: EncounterOptions["packages"]; onChange: (rows: Row[]) => void }) {
  const byId = new Map(options.map((option) => [option.id, option]));
  return (
    <Stack spacing={1.5}>
      {rows.map((row, index) => (
        <Paper key={index} component="fieldset" variant="outlined" sx={{ m: 0, p: 1.5, minWidth: 0 }}>
          <Box component="legend" sx={{ px: 0.5, fontSize: "0.875rem", fontWeight: 500 }}>
            Paket {index + 1}
          </Box>
          <Stack spacing={1}>
            <SelectField label="Paket" value={row.packageId} onChange={(packageId) => onChange(rows.map((r, i) => (i === index ? { packageId } : r)))}>
              <option value="">Pilih paket</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </SelectField>
            {byId.get(row.packageId) && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {byId.get(row.packageId)!.contents}
              </Typography>
            )}
            <Box>
              <Button type="button" variant="outlined" size="small" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                Hapus paket {index + 1}
              </Button>
            </Box>
          </Stack>
        </Paper>
      ))}
      <Box>
        <Button type="button" variant="outlined" onClick={() => onChange([...rows, { packageId: "" }])}>
          Tambah paket
        </Button>
      </Box>
    </Stack>
  );
}
