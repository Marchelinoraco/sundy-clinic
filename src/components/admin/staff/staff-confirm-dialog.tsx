"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useId, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

/** Konfirmasi tindakan yang berdampak (nonaktifkan, reset). Galat server tampil di dalam dialog, dialog tetap terbuka. */
export function StaffConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<ActionResult<unknown>>;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-describedby={`${id}-desc`} slotProps={{ paper: { role: "alertdialog" } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${id}-desc`}>{description}</DialogContentText>
        {error && (
          <DialogContentText role="alert" sx={{ mt: 2, color: "error.main" }}>
            {error}
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Kembali</Button>
        <Button color="error" variant="contained" disabled={pending} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
