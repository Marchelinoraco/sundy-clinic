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
import { voidExpense } from "@/server/expense-actions";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Batalkan pengeluaran salah catat: tetap tercatat dengan tanda dibatalkan dan alasannya (spec laporan 9). */
export function VoidExpenseDialog({ id, label }: { id: string; label: string }) {
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
        const result = await voidExpense({ id, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Pengeluaran dibatalkan.");
        setOpen(false);
        setReason("");
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
      <Button type="button" size="small" variant="text" aria-label={`Batalkan ${label}`} onClick={() => setOpen(true)}>
        Batalkan
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Batalkan pengeluaran?</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>{label}. Catatan tetap tersimpan dengan tanda dibatalkan dan tidak dihitung di laporan.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField id={`void-${id}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" color="error" onClick={confirm} disabled={pending}>
            Batalkan pengeluaran
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
