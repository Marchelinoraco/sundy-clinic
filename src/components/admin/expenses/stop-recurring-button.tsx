"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { stopRecurringExpense } from "@/server/expense-recurring";

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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" aria-label={`Hentikan ${label}`}>
          Hentikan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hentikan pengeluaran berulang?</DialogTitle>
          <DialogDescription>{label}. Tidak ada catatan baru yang dibuat; catatan yang sudah ada tetap.</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={stop} disabled={pending}>
            Hentikan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
