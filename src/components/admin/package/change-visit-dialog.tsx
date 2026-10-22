"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { validatePlanDate } from "@/lib/package-visit";
import { changeNextVisit } from "@/server/patient-packages";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Resepsionis atau Admin Keuangan mengubah tanggal kunjungan berikutnya (spec jadwal paket JP9, JP16). */
export function ChangeVisitDialog({ packageId, nextVisitOn, today, expiresOn }: { packageId: string; nextVisitOn: string; today: string; expiresOn: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(nextVisitOn);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setDate(nextVisitOn);
    setError(null);
    setOpen(true);
  }

  function save() {
    const checked = validatePlanDate(date, { today, expiresOn });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await changeNextVisit({ packageId, visitOn: checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Tanggal rencana diubah.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" size="small" onClick={openDialog}>
        Ubah tanggal rencana
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Ubah tanggal rencana</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText variant="body2">Kunjungan sesudahnya ikut bergeser dari tanggal ini. Pengingat WhatsApp mengikuti tanggal baru.</DialogContentText>
            <DateField id="next-visit-date" label="Tanggal kunjungan berikutnya" value={date} onChange={setDate} fullWidth />
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
