"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { stopRecurringExpense } from "@/server/expense-recurring";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Hentikan templat berulang; catatan yang sudah dibuat tetap (spec laporan 5). */
export function StopRecurringButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function stop() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await stopRecurringExpense({ id });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Templat dihentikan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menghentikan. Coba lagi.");
      }
    });
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button type="button" size="small" variant="text" aria-label={`Hentikan ${label}`} onClick={() => setOpen(true)}>
        Hentikan
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Hentikan pengeluaran berulang?</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>{label}. Tidak ada catatan baru yang dibuat; catatan yang sudah ada tetap.</DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" color="error" onClick={stop} disabled={pending}>
            Hentikan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
