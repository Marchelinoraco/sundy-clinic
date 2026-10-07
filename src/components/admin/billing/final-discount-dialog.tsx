"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISCOUNT_KIND_LABEL, discountAmount, validateDiscount, type DiscountKindValue } from "@/lib/invoice";
import { applyFinalDiscount } from "@/server/invoice-payments";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Tambah diskon di tagihan final (spec tagihan 5): hanya menambah, tidak di bawah yang sudah dibayar. */
export function FinalDiscountDialog({
  invoiceId,
  subtotal,
  currentDiscount,
  paid,
}: {
  invoiceId: string;
  subtotal: number;
  currentDiscount: number;
  paid: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DiscountKindValue>("PERSEN");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const input = { kind, value: Number(value), reason };
    const checked = validateDiscount(input, { subtotal, canExceed: true });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    const amount = discountAmount(subtotal, kind, Number(value));
    if (amount <= currentDiscount) {
      setError("Diskon sesudah final hanya bisa ditambah.");
      return;
    }
    if (subtotal - amount < paid) {
      setError("Diskon membuat total di bawah yang sudah dibayar.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyFinalDiscount({ invoiceId, ...input });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Diskon ditambahkan.");
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
          Tambah diskon
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah diskon</DialogTitle>
          <DialogDescription>Diskon menggantikan diskon sebelumnya dan harus lebih besar. Tercatat dengan nama Anda.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="final-discount-kind">Jenis diskon</Label>
            <select id="final-discount-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as DiscountKindValue)}>
              {(Object.keys(DISCOUNT_KIND_LABEL) as DiscountKindValue[]).map((option) => (
                <option key={option} value={option}>
                  {DISCOUNT_KIND_LABEL[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="final-discount-value">Nilai diskon</Label>
            <Input id="final-discount-value" type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="final-discount-reason">Alasan diskon</Label>
            <Input id="final-discount-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
