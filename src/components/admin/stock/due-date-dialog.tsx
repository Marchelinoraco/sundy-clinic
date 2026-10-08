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
import { validateDueDateChange, validateReason } from "@/lib/stock";
import { updateDueDate } from "@/server/payables";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Ubah jatuh tempo beralasan (spec stok 6.2). */
export function DueDateDialog({ invoiceId, dueDate, invoiceDate }: { invoiceId: string; dueDate: string; invoiceDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(dueDate);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const due = validateDueDateChange(value, invoiceDate);
    if (!due.ok) {
      setError(due.message);
      return;
    }
    const why = validateReason(reason);
    if (!why.ok) {
      setError(why.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateDueDate({ invoiceId, dueDate: value, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Jatuh tempo diperbarui.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
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
        Ubah jatuh tempo
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Ubah jatuh tempo</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>Perubahan tercatat di jejak audit bersama alasannya.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <DateField id="due-date-new" label="Jatuh tempo baru" min={invoiceDate} value={value} onChange={setValue} fullWidth />
            <TextField id="due-date-reason" label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
