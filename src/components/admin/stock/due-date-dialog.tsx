"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateDueDateChange, validateReason } from "@/lib/stock";
import { updateDueDate } from "@/server/payables";

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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Ubah jatuh tempo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah jatuh tempo</DialogTitle>
          <DialogDescription>Perubahan tercatat di jejak audit bersama alasannya.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="due-date-new">Jatuh tempo baru</Label>
            <Input id="due-date-new" type="date" min={invoiceDate} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="due-date-reason">Alasan</Label>
            <Input id="due-date-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
