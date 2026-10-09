"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPatient, findPatientsByWhatsapp, type PatientSummary } from "@/server/patient";

type Props = {
  onCreated?: (patient: PatientSummary) => void;
  /** Bila diisi, peringatan duplikat menawarkan tombol untuk memakai pasien yang sudah ada. */
  onPickExisting?: (patient: PatientSummary) => void;
};

export function NewPatientForm({ onCreated, onPickExisting }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [duplicates, setDuplicates] = useState<PatientSummary[]>([]);
  const [pending, startTransition] = useTransition();
  // Transition terpisah: pemeriksaan duplikat terpicu saat kolom WhatsApp
  // kehilangan fokus — tepat ketika admin mengklik "Buat Pasien". Bila
  // berbagi `pending`, tombol itu sudah nonaktif saat kliknya mendarat.
  const [, startDuplicateCheck] = useTransition();

  function close() {
    setOpen(false);
    setName("");
    setWhatsapp("");
    setDuplicates([]);
  }

  function handleCheckDuplicate() {
    if (!whatsapp.trim()) {
      setDuplicates([]);
      return;
    }
    startDuplicateCheck(async () => {
      try {
        setDuplicates(await findPatientsByWhatsapp(whatsapp));
      } catch {
        // Pemeriksaan duplikat hanya peringatan; kegagalannya tidak boleh menghalangi pendaftaran.
        setDuplicates([]);
      }
    });
  }

  function handleCreate() {
    if (!name.trim() || !whatsapp.trim()) {
      toast.error("Nama dan nomor WhatsApp wajib diisi.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createPatient({ name, whatsapp });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const patient = result.data;
        toast.success(`Pasien ${patient.name} (${patient.medicalRecordNumber}) dibuat.`);
        onCreated?.(patient);
        close();
      } catch {
        toast.error("Gagal membuat pasien. Coba lagi.");
      }
    });
  }

  function handlePickExisting(patient: PatientSummary) {
    onPickExisting?.(patient);
    close();
  }

  if (!open) {
    return (
      <Button type="button" variant="outlined" size="small" onClick={() => setOpen(true)}>
        + Pasien Baru
      </Button>
    );
  }

  return (
    <Paper variant="outlined" sx={{ maxWidth: 448, p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <TextField id="new-patient-name" label="Nama" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
      <TextField
        id="new-patient-whatsapp"
        label="Nomor WhatsApp"
        value={whatsapp}
        onChange={(e) => setWhatsapp(e.target.value)}
        onBlur={handleCheckDuplicate}
        placeholder="081234567890"
        slotProps={{ htmlInput: { inputMode: "tel" } }}
        fullWidth
      />

      {duplicates.length > 0 && (
        <Alert severity="warning" icon={false}>
          <Box component="p" sx={{ mt: 0, mb: 1 }}>
            Nomor ini sudah terdaftar. Pastikan ini bukan pasien yang sama:
          </Box>
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
            {duplicates.map((p) => (
              <Box component="li" key={p.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <span>
                  <strong>{p.name}</strong> · {p.medicalRecordNumber}
                </span>
                {onPickExisting && (
                  <Button type="button" size="small" variant="outlined" onClick={() => handlePickExisting(p)}>
                    Pakai pasien ini
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        </Alert>
      )}

      <Stack direction="row" spacing={1}>
        <Button type="button" size="small" variant="contained" disabled={pending} onClick={handleCreate}>
          {pending ? "Menyimpan…" : "Buat Pasien"}
        </Button>
        <Button type="button" size="small" variant="text" disabled={pending} onClick={close}>
          Batal
        </Button>
      </Stack>
    </Paper>
  );
}
