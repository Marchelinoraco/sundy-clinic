"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { PRESCRIPTION_USAGE_MAX, stockWarnings, type MedicineOption, type PrescriptionInput } from "@/lib/prescription";
import { SelectField } from "./mui/select-field";

/** Resep dokter (spec resep dokter 3): obat dari stok cabang, jumlah, aturan pakai. Sisa stok tampil tanpa harga. */
export function PrescriptionFields({ rows, medicines, onChange }: { rows: PrescriptionInput[]; medicines: MedicineOption[]; onChange: (rows: PrescriptionInput[]) => void }) {
  const byId = new Map(medicines.map((m) => [m.id, m]));
  const warnings = stockWarnings(
    rows.map((r) => ({ itemId: r.itemId, quantity: Number(r.quantity) || 0 })),
    medicines,
  );
  const set = (index: number, patch: Partial<PrescriptionInput>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Stack spacing={1.5}>
      {rows.length === 0 && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Belum ada obat di resep ini.
        </Typography>
      )}
      {rows.map((row, index) => {
        const medicine = byId.get(row.itemId);
        const warning = warnings.get(row.itemId);
        return (
          <Paper key={index} component="fieldset" variant="outlined" sx={{ m: 0, p: 1.5, minWidth: 0 }}>
            <Box component="legend" sx={{ px: 0.5, fontSize: "0.875rem", fontWeight: 500 }}>
              Obat {index + 1}
            </Box>
            <Stack spacing={1.5}>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
                <SelectField label="Obat" value={row.itemId} onChange={(itemId) => set(index, { itemId })}>
                  <option value="">Pilih obat</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Jumlah"
                  type="number"
                  value={row.quantity}
                  onChange={(e) => set(index, { quantity: e.target.value })}
                  fullWidth
                  slotProps={{ htmlInput: { min: 1, max: 9999 } }}
                  helperText={medicine ? `Sisa ${medicine.available} ${medicine.unit}` : " "}
                />
              </Box>
              <TextField
                label="Aturan pakai"
                placeholder="mis. 3 x 1 sesudah makan"
                value={row.usage}
                onChange={(e) => set(index, { usage: e.target.value })}
                fullWidth
                slotProps={{ htmlInput: { maxLength: PRESCRIPTION_USAGE_MAX } }}
              />
              {warning && (
                <Alert severity="warning" role="alert">
                  {warning}
                </Alert>
              )}
              <Box>
                <Button type="button" variant="outlined" size="small" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                  Hapus obat {index + 1}
                </Button>
              </Box>
            </Stack>
          </Paper>
        );
      })}
      <Box>
        <Button type="button" variant="outlined" onClick={() => onChange([...rows, { itemId: "", quantity: "1", usage: "" }])}>
          Tambah obat
        </Button>
      </Box>
    </Stack>
  );
}
