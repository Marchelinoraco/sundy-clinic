"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VITAL_KEYS, bloodPressureProblem, describeVitals, parseVital, parseVitalValues, type VitalKey } from "@/lib/encounter";
import { parseNurseVitals } from "@/lib/nurse-vitals";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { completeNurseVisit, saveNurseVitals } from "@/server/nurse-vitals";
import type { NurseVisit } from "@/server/nurse";
import { autosaveStatusText, useDraftAutosave } from "../use-draft-autosave";
import { VitalField } from "../vital-field";

type Inputs = Record<VitalKey, string>;

/**
 * Angka vital di halaman Tangani (spec vital perawat VP1–VP3, VP6): isian yang sama dengan bagian O dokter, tersimpan
 * otomatis, lalu Selesai ditangani mengunci angka dan membuka Periksa bagi dokter.
 */
export function NurseVitalsCard({ appointmentId, vitals, autosaveDelayMs }: { appointmentId: string; vitals: NurseVisit["vitals"]; autosaveDelayMs?: number }) {
  const router = useRouter();
  const [inputs, setInputs] = useState<Inputs>(vitals.inputs);
  const [confirm, setConfirm] = useState(false);
  const [busy, startTransition] = useTransition();
  const autosave = useDraftAutosave<Inputs>({
    initialVersion: vitals.version ?? "",
    save: (version, value) => saveNurseVitals({ appointmentId, version, vitals: value }),
    validate: (value) => {
      const parsed = parseNurseVitals(value);
      return parsed.ok ? null : parsed.message;
    },
    delayMs: autosaveDelayMs,
  });

  if (vitals.completed) {
    const lines = describeVitals(parseVitalValues(vitals.inputs));
    return (
      <Stack spacing={1}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Ditangani {vitals.completed.byName} · {minutesToTimeLabel(witaMinutesOfDay(vitals.completed.at))}
        </Typography>
        {lines.length === 0 ? (
          <Typography variant="body2">Tidak ada angka vital yang diukur.</Typography>
        ) : (
          lines.map((line) => (
            <Typography key={line} variant="body2">
              {line}
            </Typography>
          ))
        )}
      </Stack>
    );
  }

  const set = (key: VitalKey, value: string) => {
    const next = { ...inputs, [key]: value };
    setInputs(next);
    autosave.change(next);
  };
  const errors = Object.fromEntries(VITAL_KEYS.map((key) => {
    const parsed = parseVital(key, inputs[key]);
    return [key, parsed.ok ? null : parsed.message];
  })) as Record<VitalKey, string | null>;
  const values = parseVitalValues(inputs);
  const pressure = errors.systolic || errors.diastolic ? null : bloodPressureProblem(values.systolic, values.diastolic);
  const invalid = pressure !== null || VITAL_KEYS.some((key) => errors[key] !== null);

  function complete() {
    startTransition(async () => {
      // Angka yang terlihat dikirim bersama penyelesaian, agar yang terkunci sama dengan yang terlihat.
      const version = await autosave.settle();
      try {
        const result = await completeNurseVisit({ appointmentId, version, vitals: inputs });
        if (!result.ok) {
          toast.error(result.error);
          autosave.change(inputs);
          return;
        }
        autosave.forget();
        setConfirm(false);
        toast.success("Selesai ditangani. Dokter bisa mulai memeriksa.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
        autosave.change(inputs);
      }
    });
  }

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
        {VITAL_KEYS.map((key) => (
          <VitalField key={key} vital={key} value={inputs[key]} error={errors[key]} onChange={(value) => set(key, value)} />
        ))}
      </Box>
      {pressure && (
        <Typography variant="body2" sx={{ color: "error.main" }}>
          {pressure}
        </Typography>
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {autosaveStatusText(autosave.status)}
        </Typography>
        <Button type="button" variant="contained" disabled={busy || invalid} onClick={() => setConfirm(true)}>
          Selesai ditangani
        </Button>
      </Stack>
      <Dialog open={confirm} onClose={() => !busy && setConfirm(false)} aria-labelledby="selesai-ditangani-judul">
        <DialogTitle id="selesai-ditangani-judul">Selesaikan penanganan?</DialogTitle>
        <DialogContent>
          <DialogContentText>Angka vital tidak bisa diubah lagi di halaman ini.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button type="button" disabled={busy} onClick={() => setConfirm(false)}>
            Batal
          </Button>
          <Button type="button" variant="contained" disabled={busy || invalid} onClick={complete}>
            Selesai ditangani
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
