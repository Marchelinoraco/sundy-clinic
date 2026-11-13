"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { validateReason } from "@/lib/legacy-package";
import { cancelLegacyPackage } from "@/server/legacy-packages";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Batalkan paket lama yang salah pasien atau salah paket (spec paket lama PL11, bagian 6). */
export function CancelLegacyDialog({ packageId }: { packageId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const checked = validateReason(reason, "Isi alasan pembatalan.");
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelLegacyPackage({ packageId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Paket lama dibatalkan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" color="error" onClick={() => (setReason(""), setError(null), setOpen(true))}>
        Batalkan paket lama
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Batalkan paket lama</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText variant="body2">
              Untuk salah pasien atau salah paket. Sisa sesinya hilang; ketik ulang paket yang benar. Salah angka cukup lewat Koreksi sisa.
            </DialogContentText>
            <TextField id="cancel-legacy-reason" label="Alasan" value={reason} onChange={(event) => setReason(event.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" color="error" disabled={pending} onClick={save}>
            Batalkan paket
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
