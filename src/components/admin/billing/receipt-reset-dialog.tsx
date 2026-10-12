"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resetReceiptLink } from "@/server/receipt";

/** "Ganti tautan" (spec S3): untuk tautan yang terkirim ke nomor yang salah. */
export function ReceiptResetDialog({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await resetReceiptLink(invoiceId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Tautan struk diganti. Kirim ulang struk bila perlu.");
        setOpen(false);
      } catch {
        setError("Tautan gagal diganti. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="text" size="small" onClick={() => setOpen(true)}>
        Ganti tautan
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Ganti tautan struk?</DialogTitle>
        <DialogContent>
          <DialogContentText>Tautan struk yang sudah terkirim tidak bisa dibuka lagi. Kirim ulang struk ke pasien dengan tautan baru.</DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="button" disabled={pending} onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button type="button" variant="contained" color="warning" disabled={pending} onClick={confirm}>
            Ganti
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
