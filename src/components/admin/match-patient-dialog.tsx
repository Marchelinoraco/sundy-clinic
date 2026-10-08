"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import {
  createPatientFromIntake,
  getMatchCandidates,
  matchPatient,
  type MatchCandidates,
} from "@/server/intake";
import { DialogCloseButton } from "./mui/dialog-close-button";

/**
 * Dialog pencocokan pasien untuk booking situs. Dibuka oleh daftar booking,
 * baik dari tombol "Cocokkan pasien" maupun dari menu ⋯ "Ganti pasien". Item
 * menu tertutup begitu dipilih, jadi dialog tidak boleh hidup di dalamnya.
 */
export function MatchPatientDialog({
  appointmentId,
  code,
  open,
  onOpenChange,
}: {
  appointmentId: string;
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogTitle sx={{ pr: 6 }}>Cocokkan pasien — {code}</DialogTitle>
      <DialogCloseButton onClick={() => onOpenChange(false)} />
      <MatchPatientBody appointmentId={appointmentId} code={code} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}

/** Dipasang hanya selama dialog terbuka, sehingga kandidat dimuat sekali setiap kali dialog dibuka. */
function MatchPatientBody({
  appointmentId,
  code,
  onDone,
}: {
  appointmentId: string;
  code: string;
  onDone: () => void;
}) {
  const [data, setData] = useState<MatchCandidates | null>(null);
  const [pending, startTransition] = useTransition();
  // onDone terbaru dipakai tanpa memuat ulang kandidat setiap kali induknya dirender ulang.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let current = true;
    getMatchCandidates(appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          toast.error(result.error);
          onDoneRef.current();
          return;
        }
        setData(result.data);
      })
      .catch(() => {
        if (!current) return;
        toast.error("Gagal memuat data pasien. Coba lagi.");
        onDoneRef.current();
      });
    return () => {
      current = false;
    };
  }, [appointmentId]);

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        onDoneRef.current();
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  return (
    <>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Pilih pasien lama yang benar-benar orang yang sama, atau buat pasien baru dari isian. Satu nomor WhatsApp sering dipakai
          sekeluarga — periksa nama dan tanggal lahir.
        </DialogContentText>
        {!data ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Memuat…
          </Typography>
        ) : (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 1.5, fontSize: "0.875rem" }}>
              <Box component="p" sx={{ m: 0, fontWeight: 500 }}>
                {data.intake.name}
              </Box>
              <Box component="p" sx={{ m: 0 }}>
                {data.intake.whatsapp} · lahir {data.intake.birthDateLabel ?? "—"}
              </Box>
              <Box component="p" sx={{ m: 0, color: "text.secondary" }}>
                {data.intake.claimsReturning ? "Mengaku pernah berobat di sini" : "Mengaku pasien baru"}
              </Box>
            </Paper>

            <Stack spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Pasien yang mirip
              </Typography>
              {data.candidates.length === 0 ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Tidak ada pasien dengan nomor WhatsApp, atau nama & tanggal lahir, yang sama.
                </Typography>
              ) : (
                data.candidates.map((candidate) => (
                  <Paper
                    key={candidate.id}
                    variant="outlined"
                    sx={{ p: 1, fontSize: "0.875rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
                  >
                    <div>
                      <Box component="p" sx={{ m: 0, fontWeight: 500 }}>
                        {candidate.name}
                      </Box>
                      <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
                        {candidate.medicalRecordNumber} · {candidate.whatsapp} · lahir {candidate.birthDateLabel ?? "—"} · kunjungan terakhir{" "}
                        {candidate.lastVisitLabel ?? "—"}
                      </Typography>
                    </div>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={pending}
                      onClick={() => run(() => matchPatient(appointmentId, candidate.id), `${code} dicocokkan dengan ${candidate.name}.`)}
                    >
                      Pilih pasien ini
                    </Button>
                  </Paper>
                ))
              )}
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="outlined"
          disabled={pending || !data}
          onClick={() => run(() => createPatientFromIntake(appointmentId), `Pasien baru dibuat untuk ${code}.`)}
        >
          Buat pasien baru
        </Button>
      </DialogActions>
    </>
  );
}
