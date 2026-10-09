"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ENCOUNTER_TEXT_MAX } from "@/lib/encounter";
import { addEncounterAddendum } from "@/server/encounter";

/** Tambah adendum pada catatan final (PRD F12). */
export function AddendumForm({ encounterId }: { encounterId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        const result = await addEncounterAddendum({ encounterId, text });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setText("");
        toast.success("Adendum ditambahkan.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan adendum. Coba lagi.");
      }
    });
  }

  return (
    <Stack spacing={1.5}>
      <Typography component="h3" sx={{ fontSize: "0.875rem", fontWeight: 500 }}>
        Tambah adendum
      </Typography>
      <TextField
        label="Isi adendum"
        multiline
        minRows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        fullWidth
        slotProps={{ htmlInput: { maxLength: ENCOUNTER_TEXT_MAX } }}
      />
      <Box>
        <Button variant="contained" onClick={submit} disabled={pending || text.trim() === ""}>
          Simpan adendum
        </Button>
      </Box>
    </Stack>
  );
}
