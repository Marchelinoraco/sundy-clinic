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
import { validateReason } from "@/lib/stock";
import { revokeInvoicePayment } from "@/server/invoice-payments";

/** Batalkan pembayaran salah input (spec tagihan 5): tidak dihapus, ditandai dibatalkan dengan alasan. */
export function RevokeInvoicePaymentDialog({ paymentId, label }: { paymentId: string; label: string }) {
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
        const result = await revokeInvoicePayment({ paymentId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Pembayaran dibatalkan.");
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
        <Button type="button" size="sm" variant="ghost" aria-label={`Batalkan pembayaran ${label}`}>
          Batalkan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan pembayaran?</DialogTitle>
          <DialogDescription>{label}. Pembayaran tetap tercatat dengan tanda dibatalkan, dan sisa tagihan kembali.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor={`inv-revoke-${paymentId}`}>Alasan</Label>
          <Input id={`inv-revoke-${paymentId}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            Batalkan pembayaran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
