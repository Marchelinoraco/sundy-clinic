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
import { validateReason } from "@/lib/stock";
import { cancelPurchase } from "@/server/purchases";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Batalkan faktur salah input (spec stok 6.4). Tombol hanya ditampilkan bila syaratnya terpenuhi. */
export function CancelPurchaseDialog({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    const checked = validateReason(reason);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelPurchase({ invoiceId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Faktur ${invoiceNumber} dibatalkan.`);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal membatalkan. Coba lagi.");
      }
    });
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button type="button" variant="outlined" color="error" onClick={() => setOpen(true)}>
        Batalkan faktur
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Batalkan faktur {invoiceNumber}?</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>
            Stok dari faktur ini ditarik dan hutangnya hilang. Faktur tetap tercatat dengan status Dibatalkan, dan nomornya tidak bisa
            dipakai lagi untuk supplier ini.
          </DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField id="cancel-purchase-reason" label="Alasan pembatalan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" color="error" onClick={confirm} disabled={pending}>
            Batalkan faktur
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
