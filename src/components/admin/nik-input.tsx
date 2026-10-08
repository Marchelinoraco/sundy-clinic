"use client";

import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId } from "react";
import { NIK_MISSING_REASONS, type NikMissingReasonValue } from "@/lib/nik";
import { SelectField } from "./mui/select-field";

export type NikDraft = { mode: "NIK"; value: string } | { mode: "MISSING"; reason: NikMissingReasonValue | "" };

/** NIK 16 angka, atau "Belum ada NIK" dengan alasan (spec check-in 3.2). Dipakai dialog check-in dan data pasien. */
export function NikInput({
  draft,
  onChange,
  warning,
}: {
  draft: NikDraft;
  onChange: (draft: NikDraft) => void;
  /** Peringatan kecocokan dengan tanggal lahir/jenis kelamin; tidak menghalangi. */
  warning?: string | null;
}) {
  const id = useId();
  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
      <Box component="legend" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 500 }}>
        NIK
      </Box>
      <RadioGroup
        row
        name={`${id}-mode`}
        value={draft.mode}
        onChange={(_, mode) => onChange(mode === "NIK" ? { mode: "NIK", value: "" } : { mode: "MISSING", reason: "" })}
      >
        <FormControlLabel value="NIK" control={<Radio size="small" />} label="Isi NIK" />
        <FormControlLabel value="MISSING" control={<Radio size="small" />} label="Belum ada NIK" />
      </RadioGroup>
      {draft.mode === "NIK" ? (
        <div>
          <TextField
            id={`${id}-nik`}
            label="NIK (16 angka)"
            autoComplete="off"
            value={draft.value}
            onChange={(e) => onChange({ mode: "NIK", value: e.target.value })}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            fullWidth
          />
          {warning && (
            <Typography variant="caption" component="p" sx={{ mt: 0.5, color: "warning.main" }}>
              {warning}
            </Typography>
          )}
        </div>
      ) : (
        <SelectField
          id={`${id}-reason`}
          label="Alasan"
          value={draft.reason}
          onChange={(value) => onChange({ mode: "MISSING", reason: value as NikMissingReasonValue | "" })}
        >
          <option value="">Pilih alasan</option>
          {Object.entries(NIK_MISSING_REASONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      )}
    </Box>
  );
}
