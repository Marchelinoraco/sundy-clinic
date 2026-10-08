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
import type { ContactWindowsTarget } from "@/lib/booking-actions";
import { ONLINE_MAX_DAYS_AHEAD, windowDraftsError, type WindowDraft } from "@/lib/online-consultation";
import { addDaysToDateString } from "@/lib/time";
import { updateContactWindows } from "@/server/online-consultation";
import { ContactWindowsFields } from "./contact-windows-fields";
import { DialogCloseButton } from "./mui/dialog-close-button";

/**
 * Mengganti seluruh rentang waktu luang booking online (spec konsultasi online 5.3).
 * Aturan versi resepsionis: boleh mulai sekarang, paling jauh 14 hari.
 */
export function ContactWindowsDialog({
  target,
  today,
  open,
  onOpenChange,
}: {
  target: ContactWindowsTarget;
  /** Hari ini dalam WITA, dari server. */
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [windows, setWindows] = useState<WindowDraft[]>(target.windows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const problem = windowDraftsError(windows, "STAFF", new Date());
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateContactWindows({ appointmentId: target.appointmentId, windows });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Waktu luang ${target.code} diperbarui.`);
        onOpenChange(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onClose={close} maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>Ubah waktu luang — {target.code}</DialogTitle>
      <DialogCloseButton onClick={close} />
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {target.patientName}. Rentang di bawah menggantikan semua rentang yang lama. Pesan konfirmasi dan pengingat lama tidak berlaku
          lagi; kirim yang baru dari daftar.
        </DialogContentText>
        <ContactWindowsFields value={windows} onChange={setWindows} minDate={today} maxDate={addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD)} />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button type="button" variant="outlined" onClick={close}>
          Batal
        </Button>
        <Button type="button" variant="contained" onClick={save} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
