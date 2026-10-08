"use client";

import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { ACTIVITY_FIRST_HOUR, ACTIVITY_KINDS, ACTIVITY_LAST_HOUR, TEXT_LIMITS } from "@/lib/kuis/v1/options";
import { minutesToTimeLabel } from "@/lib/time";
import { SelectField } from "./mui/select-field";

const HOURS = Array.from(
  { length: ACTIVITY_LAST_HOUR - ACTIVITY_FIRST_HOUR + 1 },
  (_, index) => ACTIVITY_FIRST_HOUR + index,
);

const KINDS = Object.entries(ACTIVITY_KINDS) as [ActivityEntry["kind"], string][];

/**
 * Versi panel admin dari ActivityList kuis (situs publik): label, urutan menurut jam, dan batas teks
 * sama, dengan isian MUI yang ikut mode gelap.
 */
export function ActivityListFields({
  entries,
  onChange,
}: {
  entries: ActivityEntry[];
  onChange: (entries: ActivityEntry[]) => void;
}) {
  const [hour, setHour] = useState(7);
  const [kind, setKind] = useState<ActivityEntry["kind"]>("MAKAN_MINUM");
  const [text, setText] = useState("");

  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.hour - b.entry.hour);

  function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange([...entries, { hour, kind, text: trimmed.slice(0, TEXT_LIMITS.activity) }]);
    setText("");
  }

  return (
    <Stack spacing={2}>
      {sorted.length > 0 && (
        <List aria-label="Catatan aktivitas" disablePadding sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sorted.map(({ entry, index }) => (
            <ListItem
              key={index}
              sx={{ gap: 1.5, py: 0.5, pr: 0.5, border: 1, borderColor: "divider", borderRadius: 1, fontSize: "0.875rem" }}
            >
              <Box component="span" sx={{ width: 48, flexShrink: 0, fontWeight: 600 }}>
                {minutesToTimeLabel(entry.hour * 60)}
              </Box>
              <Box component="span" sx={{ color: "text.secondary" }}>
                {ACTIVITY_KINDS[entry.kind]}
              </Box>
              <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                {entry.text}
              </Box>
              <IconButton
                size="small"
                aria-label={`Hapus ${entry.text}`}
                onClick={() => onChange(entries.filter((_, i) => i !== index))}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </ListItem>
          ))}
        </List>
      )}

      <Paper variant="outlined" sx={{ borderStyle: "dashed", p: 1.5 }}>
        <Stack spacing={1.5}>
          <SelectField label="Jam" value={String(hour)} onChange={(value) => setHour(Number(value))} fullWidth={false} sx={{ width: 140 }}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {minutesToTimeLabel(h * 60)}
              </option>
            ))}
          </SelectField>
          <RadioGroup row aria-label="Jenis catatan" value={kind} onChange={(_, value) => setKind(value as ActivityEntry["kind"])}>
            {KINDS.map(([value, label]) => (
              <FormControlLabel key={value} value={value} control={<Radio size="small" />} label={label} />
            ))}
          </RadioGroup>
          <TextField
            label="Isi catatan"
            placeholder="mis. Nasi ½, ikan bakar"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            fullWidth
            slotProps={{ htmlInput: { maxLength: TEXT_LIMITS.activity } }}
          />
          <Box>
            <Button type="button" variant="outlined" onClick={add} disabled={!text.trim()}>
              ＋ Tambah catatan
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}
