"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import {
  CONTACT_END_CHOICES,
  CONTACT_START_CHOICES,
  EMPTY_WINDOW_DRAFT,
  ONLINE_MAX_WINDOWS,
  type WindowDraft,
} from "@/lib/online-consultation";
import { minutesToTimeLabel } from "@/lib/time";
import { DateField } from "./mui/date-field";
import { SelectField } from "./mui/select-field";

/**
 * Versi panel admin dari ContactWindowsEditor (situs publik): 1–3 rentang waktu luang (spec konsultasi
 * online 3.2) dengan isian MUI yang ikut mode gelap. Label dan aturannya sama dengan editor publik;
 * aturan lengkapnya diperiksa windowDraftsError dan ulang di server.
 */
export function ContactWindowsFields({
  value,
  onChange,
  minDate,
  maxDate,
}: {
  value: WindowDraft[];
  onChange: (next: WindowDraft[]) => void;
  /** Tanggal WITA "YYYY-MM-DD". */
  minDate: string;
  maxDate: string;
}) {
  const update = (index: number, patch: Partial<WindowDraft>) =>
    onChange(value.map((window, i) => (i === index ? { ...window, ...patch } : window)));

  return (
    <Stack spacing={1.5}>
      {value.map((window, index) => {
        const n = index + 1;
        return (
          <Paper
            key={index}
            variant="outlined"
            component="fieldset"
            sx={{ m: 0, p: 1.5, minWidth: 0, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}
          >
            <Box component="legend" sx={{ px: 0.5, fontSize: "0.875rem", fontWeight: 500 }}>
              Waktu {n}
            </Box>
            <DateField label={`Tanggal waktu ${n}`} min={minDate} max={maxDate} value={window.date} onChange={(date) => update(index, { date })} fullWidth />
            <SelectField
              label="Mulai"
              aria-label={`Jam mulai waktu ${n}`}
              value={String(window.startMinute)}
              onChange={(minute) => update(index, { startMinute: Number(minute) })}
            >
              {CONTACT_START_CHOICES.map((minute) => (
                <option key={minute} value={minute}>
                  {minutesToTimeLabel(minute)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Selesai"
              aria-label={`Jam selesai waktu ${n}`}
              value={String(window.endMinute)}
              onChange={(minute) => update(index, { endMinute: Number(minute) })}
            >
              {CONTACT_END_CHOICES.map((minute) => (
                <option key={minute} value={minute}>
                  {minutesToTimeLabel(minute)}
                </option>
              ))}
            </SelectField>
            {value.length > 1 && (
              <Box sx={{ gridColumn: { sm: "span 3" } }}>
                <Button
                  type="button"
                  variant="text"
                  size="small"
                  aria-label={`Hapus waktu ${n}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  Hapus
                </Button>
              </Box>
            )}
          </Paper>
        );
      })}
      {value.length < ONLINE_MAX_WINDOWS && (
        <Box>
          <Button type="button" variant="outlined" onClick={() => onChange([...value, EMPTY_WINDOW_DRAFT])}>
            + Tambah waktu
          </Button>
        </Box>
      )}
    </Stack>
  );
}
