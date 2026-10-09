"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { IMPORTANT_NOTES_MAX, PAPER_RECORD_NUMBER_MAX } from "@/lib/encounter";
import { updatePaperRecordNumber, updatePatientImportantNotes } from "@/server/patient";

function InlineTextEditor(props: {
  label: string;
  editLabel: string;
  value: string | null;
  emptyText: string;
  multiline: boolean;
  maxLength: number;
  onSave: (text: string) => Promise<ActionResult<void>>;
}) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.value ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const result = await props.onSave(text);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${props.label} disimpan.`);
        setEditing(false);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <Typography component="h3" sx={{ fontSize: "0.75rem", fontWeight: 400, color: "text.secondary" }}>
          {props.label}
        </Typography>
        <Box component="p" sx={{ m: 0, whiteSpace: "pre-line" }}>
          {props.value ?? props.emptyText}
        </Box>
        <Button
          variant="text"
          size="small"
          sx={{ px: 0, minWidth: 0, textDecoration: "underline" }}
          onClick={() => {
            setText(props.value ?? "");
            setEditing(true);
          }}
        >
          {props.editLabel}
        </Button>
      </div>
    );
  }

  return (
    <Stack spacing={1}>
      <TextField
        id={id}
        label={props.label}
        multiline={props.multiline}
        minRows={props.multiline ? 3 : undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
        slotProps={{ htmlInput: { maxLength: props.maxLength } }}
        fullWidth
      />
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" onClick={save} disabled={pending}>
          Simpan
        </Button>
        <Button size="small" variant="outlined" onClick={() => setEditing(false)} disabled={pending}>
          Batal
        </Button>
      </Stack>
    </Stack>
  );
}

/** Catatan penting dokter (spec R6). Hanya ditampilkan untuk record:write. */
export function ImportantNotesForm({ patientId, value }: { patientId: string; value: string | null }) {
  return (
    <InlineTextEditor
      label="Catatan penting"
      editLabel="Ubah catatan penting"
      value={value}
      emptyText="Belum ada"
      multiline
      maxLength={IMPORTANT_NOTES_MAX}
      onSave={(text) => updatePatientImportantNotes({ patientId, text })}
    />
  );
}

/** No. RM kertas lama (spec R11), untuk semua staf booking:manage. */
export function PaperRecordNumberForm({ patientId, value }: { patientId: string; value: string | null }) {
  return (
    <InlineTextEditor
      label="No. RM kertas lama"
      editLabel="Ubah no. RM kertas lama"
      value={value}
      emptyText="—"
      multiline={false}
      maxLength={PAPER_RECORD_NUMBER_MAX}
      onSave={(text) => updatePaperRecordNumber({ patientId, text })}
    />
  );
}
