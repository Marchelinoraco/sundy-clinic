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
import { cancelInvoice } from "@/server/invoice-lifecycle";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Batalkan tagihan (spec tagihan 5): tidak dihapus; stok kembali dan alasan tercatat. Draf dibuang dengan cara yang sama. */
export function CancelInvoiceDialog({ invoiceId, label, draft = false }: { invoiceId: string; label: string; draft?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = draft ? "Buang draf" : "Batalkan tagihan";

  function confirm() {
    const checked = validateReason(reason);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelInvoice({ invoiceId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(draft ? "Draf dibuang." : "Tagihan dibatalkan.");
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
      <Button type="button" variant="outlined" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{draft ? "Buang draf?" : "Batalkan tagihan?"}</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>
            {label}. {draft ? "Draf tetap tercatat dengan tanda dibatalkan." : "Tagihan tetap tercatat dengan tanda dibatalkan dan stok barang kembali."}
          </DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField id={`cancel-${invoiceId}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" color="error" onClick={confirm} disabled={pending}>
            {trigger}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
