"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NIK_FORMAT_ERROR, NIK_MISSING_REASONS, normalizeNik, type NikMissingReasonValue } from "@/lib/nik";
import { updatePatientNik } from "@/server/patient";
import { NikInput, type NikDraft } from "./nik-input";

/** NIK di halaman data pasien (spec check-in 3.4), untuk semua staf booking:manage. */
export function NikForm({
  patientId,
  nik,
  missingReason,
}: {
  patientId: string;
  nik: string | null;
  missingReason: NikMissingReasonValue | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NikDraft>({ mode: "NIK", value: nik ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    let payload: { nik: string | null; missingReason: string | null };
    if (draft.mode === "NIK") {
      const value = normalizeNik(draft.value);
      if (!value) {
        setError(NIK_FORMAT_ERROR);
        return;
      }
      payload = { nik: value, missingReason: null };
    } else {
      if (!draft.reason) {
        setError("Pilih alasan belum ada NIK.");
        return;
      }
      payload = { nik: null, missingReason: draft.reason };
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updatePatientNik({ patientId, ...payload });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("NIK disimpan.");
        setEditing(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan NIK. Coba lagi.");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <Typography component="h3" sx={{ fontSize: "0.75rem", fontWeight: 400, color: "text.secondary" }}>
          NIK
        </Typography>
        {nik ? (
          <Box component="p" sx={{ m: 0 }}>
            {nik}
          </Box>
        ) : missingReason ? (
          <Box component="p" sx={{ m: 0, fontWeight: 500, color: "warning.main" }}>
            NIK belum ada ({NIK_MISSING_REASONS[missingReason]})
          </Box>
        ) : (
          <Box component="p" sx={{ m: 0 }}>
            —
          </Box>
        )}
        <Button
          variant="text"
          size="small"
          sx={{ px: 0, minWidth: 0, textDecoration: "underline" }}
          onClick={() => {
            setDraft({ mode: "NIK", value: nik ?? "" });
            setEditing(true);
          }}
        >
          Ubah NIK
        </Button>
      </div>
    );
  }

  return (
    <Stack spacing={1}>
      <NikInput draft={draft} onChange={setDraft} />
      {error && <Alert severity="error">{error}</Alert>}
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
