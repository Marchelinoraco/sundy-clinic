"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { validateRejectReason } from "@/lib/counter-stock";
import { rejectRestockRequest } from "@/server/restock";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Tolak permintaan restock dengan alasan (spec stok meja 4.2). */
export function RejectRestockDialog({ requestId, version, disabled = false }: { requestId: string; version: number; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const checked = validateRejectReason(reason);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await rejectRestockRequest({ requestId, version, reason: checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Permintaan ditolak.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" color="error" disabled={disabled} onClick={() => setOpen(true)}>
        Tolak
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Tolak permintaan</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id={`reject-${requestId}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth multiline minRows={2} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" color="error" onClick={save} disabled={pending}>
            Tolak permintaan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
