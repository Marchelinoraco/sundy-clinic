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
import { revokeSupplierPayment } from "@/server/payables";

/** Batalkan pembayaran salah input (spec stok 6.2): tidak dihapus, ditandai dibatalkan dengan alasan. */
export function RevokePaymentDialog({ paymentId, label }: { paymentId: string; label: string }) {
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
        const result = await revokeSupplierPayment({ paymentId, reason });
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
          <DialogDescription>{label}. Pembayaran tetap tercatat dengan tanda dibatalkan, dan sisa hutang kembali.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor={`revoke-${paymentId}`}>Alasan</Label>
          <Input id={`revoke-${paymentId}`} value={reason} onChange={(e) => setReason(e.target.value)} />
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
