"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { declineDoctorPackage } from "@/server/invoice-drafts";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Paket dari dokter yang tidak dibeli pasien: barisnya dihapus dengan alasan yang terlihat dokter (spec vital perawat PR3). */
export function DeclinePackageDialog({ invoiceId, version, line, disabled }: { invoiceId: string; version: number; line: { id: string; name: string }; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const text = reason.trim();
    if (text.length < 2 || text.length > 200) {
      setError("Alasan 2–200 karakter.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await declineDoctorPackage({ invoiceId, version, lineId: line.id, reason: text });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`${line.name} ditandai tidak dibeli.`);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" size="small" variant="text" disabled={disabled} onClick={() => setOpen(true)} aria-label={`Tidak dibeli ${line.name}`}>
        Tidak dibeli
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Paket tidak dibeli — {line.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">Paket ini disarankan dokter. Alasan terlihat oleh dokter di catatan kunjungan.</Typography>
            <TextField id={`decline-reason-${line.id}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
