"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useId, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

/** Pembatalan beralasan (spec hasil BIA B6): tidak ada yang dihapus, alasan wajib. */
export function BiaVoidDialog({
  open,
  title,
  description,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<ActionResult<void>>;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    const result = await onConfirm(reason);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReason("");
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-describedby={`${id}-desc`} slotProps={{ paper: { role: "alertdialog" } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${id}-desc`} sx={{ mb: 2 }}>
          {description}
        </DialogContentText>
        <TextField
          label="Alasan pembatalan"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={error !== null}
          helperText={error ?? " "}
          fullWidth
          autoFocus
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Kembali</Button>
        <Button color="error" variant="contained" disabled={pending || reason.trim() === ""} onClick={() => void confirm()}>
          {title.startsWith("Batalkan pengukuran") ? "Batalkan pengukuran" : "Batalkan berkas"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
