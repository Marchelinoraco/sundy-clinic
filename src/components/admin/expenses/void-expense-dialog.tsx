"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateReason } from "@/lib/stock";
import { voidExpense } from "@/server/expense-actions";

/** Batalkan pengeluaran salah catat: tetap tercatat dengan tanda dibatalkan dan alasannya (spec laporan 9). */
export function VoidExpenseDialog({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    const checked = validateReason(reason);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await voidExpense({ id, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Pengeluaran dibatalkan.");
        setOpen(false);
        setReason("");
        router.refresh();
      } catch {
        setError("Gagal membatalkan. Coba lagi.");
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
        <Button type="button" size="sm" variant="ghost" aria-label={`Batalkan ${label}`}>
          Batalkan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan pengeluaran?</DialogTitle>
          <DialogDescription>{label}. Catatan tetap tersimpan dengan tanda dibatalkan dan tidak dihitung di laporan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor={`void-${id}`}>Alasan</Label>
          <Input id={`void-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            Batalkan pengeluaran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
