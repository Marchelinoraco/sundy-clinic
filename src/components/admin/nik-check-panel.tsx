"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import type { PatientSummary } from "@/server/patient";
import { TextLink } from "./mui/links";

export type NikCheckState =
  | { kind: "IDLE" }
  | { kind: "CHECKING" }
  | { kind: "ERROR" }
  | { kind: "FREE" }
  | { kind: "TAKEN"; patient: PatientSummary; birthDateLabel: string | null };

/** Hasil cek NIK di bawah isian NIK pada dialog Pasien baru (spec pendaftaran pasien bagian 6.1). */
export function NikCheckPanel({
  state,
  onPickExisting,
}: {
  state: NikCheckState;
  /** Bila diisi, kartu menawarkan "Pakai pasien ini"; bila tidak, tautan ke data pasien. */
  onPickExisting?: (patient: PatientSummary) => void;
}) {
  if (state.kind === "IDLE") return null;
  if (state.kind === "CHECKING") {
    return (
      <Typography variant="caption" role="status" sx={{ color: "text.secondary" }}>
        Memeriksa NIK…
      </Typography>
    );
  }
  if (state.kind === "ERROR") {
    return (
      <Alert severity="info" role="status">
        NIK belum bisa diperiksa sekarang. Pemeriksaan diulang saat disimpan.
      </Alert>
    );
  }
  if (state.kind === "FREE") {
    return (
      <Alert severity="success" role="status">
        NIK belum terdaftar.
      </Alert>
    );
  }

  const { patient, birthDateLabel } = state;
  return (
    <Alert severity="warning" icon={false}>
      <Typography component="p" sx={{ m: 0, fontWeight: 600 }}>
        NIK sudah terdaftar
      </Typography>
      <Box component="p" sx={{ mt: 0.5, mb: 1 }}>
        <strong>{patient.name}</strong> · {patient.medicalRecordNumber}
        <br />
        Lahir {birthDateLabel ?? "—"} · WhatsApp {patient.whatsapp}
      </Box>
      {onPickExisting ? (
        <Button type="button" size="small" variant="outlined" onClick={() => onPickExisting(patient)}>
          Pakai pasien ini
        </Button>
      ) : (
        <TextLink href={`/admin/pasien/${patient.id}`}>Buka data pasien</TextLink>
      )}
    </Alert>
  );
}
