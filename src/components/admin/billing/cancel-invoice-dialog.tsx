"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateReason } from "@/lib/stock";
import { cancelInvoice } from "@/server/invoice-lifecycle";

/** Batalkan tagihan (spec tagihan 5): tidak dihapus; stok kembali dan alasan tercatat. Draf dibuang dengan cara yang sama. */
export function CancelInvoiceDialog({ invoiceId, label, draft = false }: { invoiceId: string; label: string; draft?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = draft ? "Buang draf" : "Batalkan tagihan";

  function confirm() {
    const checked = validateReason(reason);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelInvoice({ invoiceId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(draft ? "Draf dibuang." : "Tagihan dibatalkan.");
        setOpen(false);
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
        <Button type="button" variant="outline">
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{draft ? "Buang draf?" : "Batalkan tagihan?"}</DialogTitle>
          <DialogDescription>
            {label}. {draft ? "Draf tetap tercatat dengan tanda dibatalkan." : "Tagihan tetap tercatat dengan tanda dibatalkan dan stok barang kembali."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor={`cancel-${invoiceId}`}>Alasan</Label>
          <Input id={`cancel-${invoiceId}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            {trigger}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
