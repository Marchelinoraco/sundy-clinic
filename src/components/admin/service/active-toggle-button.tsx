"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Aktifkan langsung; nonaktifkan lewat konfirmasi yang menyebut akibatnya (spec layanan situs 5.1 dan 5.2). */
export function ActiveToggleButton({
  name,
  active,
  confirmText,
  onToggle,
}: {
  name: string;
  active: boolean;
  confirmText: string;
  onToggle: (active: boolean) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(next: boolean) {
    startTransition(async () => {
      try {
        const result = await onToggle(next);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(next ? `${name} diaktifkan.` : `${name} dinonaktifkan.`);
        setConfirming(false);
        router.refresh();
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  if (!active) {
    return (
      <Button type="button" size="small" variant="text" disabled={pending} onClick={() => run(true)} aria-label={`Aktifkan ${name}`}>
        Aktifkan
      </Button>
    );
  }
  return (
    <>
      <Button type="button" size="small" variant="text" color="error" disabled={pending} onClick={() => setConfirming(true)} aria-label={`Nonaktifkan ${name}`}>
        Nonaktifkan
      </Button>
      <Dialog open={confirming} onClose={() => !pending && setConfirming(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nonaktifkan {name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{confirmText}</Typography>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            Batal
          </Button>
          <Button type="button" variant="contained" color="error" onClick={() => run(false)} disabled={pending}>
            Nonaktifkan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
