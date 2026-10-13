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
import { validateExtension } from "@/lib/treatment-package";
import { extendPatientPackage } from "@/server/patient-packages";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Perpanjang masa berlaku paket customer, khusus Admin Keuangan (spec paket 7). */
export function ExtendPackageDialog({ packageId, expiresOn }: { packageId: string; expiresOn: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(expiresOn);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setDate(expiresOn);
    setReason("");
    setError(null);
    setOpen(true);
  }

  function save() {
    const input = { packageId, expiresOn: date, reason };
    const checked = validateExtension(input, { currentExpiresOn: expiresOn });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await extendPatientPackage(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Masa berlaku diperpanjang.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" onClick={openDialog}>
        Perpanjang
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Perpanjang paket</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DateField id="extend-date" label="Berlaku sampai" value={date} onChange={setDate} fullWidth />
            <TextField id="extend-reason" label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
