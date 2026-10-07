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
import { cancelPurchase } from "@/server/purchases";

/** Batalkan faktur salah input (spec stok 6.4). Tombol hanya ditampilkan bila syaratnya terpenuhi. */
export function CancelPurchaseDialog({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
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
        const result = await cancelPurchase({ invoiceId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Faktur ${invoiceNumber} dibatalkan.`);
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
        <Button type="button" variant="outline" className="text-destructive">
          Batalkan faktur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan faktur {invoiceNumber}?</DialogTitle>
          <DialogDescription>
            Stok dari faktur ini ditarik dan hutangnya hilang. Faktur tetap tercatat dengan status Dibatalkan, dan nomornya tidak bisa
            dipakai lagi untuk supplier ini.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="cancel-purchase-reason">Alasan pembatalan</Label>
          <Input id="cancel-purchase-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            Batalkan faktur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
