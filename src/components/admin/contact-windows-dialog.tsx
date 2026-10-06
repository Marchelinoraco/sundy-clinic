"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ContactWindowsEditor } from "@/components/online/contact-windows-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContactWindowsTarget } from "@/lib/booking-actions";
import { ONLINE_MAX_DAYS_AHEAD, windowDraftsError, type WindowDraft } from "@/lib/online-consultation";
import { addDaysToDateString } from "@/lib/time";
import { updateContactWindows } from "@/server/online-consultation";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ubah waktu luang — {target.code}</DialogTitle>
          <DialogDescription>
            {target.patientName}. Rentang di bawah menggantikan semua rentang yang lama. Pesan konfirmasi dan pengingat
            lama tidak berlaku lagi; kirim yang baru dari daftar.
          </DialogDescription>
        </DialogHeader>
        <ContactWindowsEditor
          value={windows}
          onChange={setWindows}
          minDate={today}
          maxDate={addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
