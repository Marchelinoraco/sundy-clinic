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
import { formatRupiah } from "@/lib/format";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  validatePayment,
  type PaymentMethodValue,
  type SupplierPaymentKindValue,
} from "@/lib/stock";
import { recordSupplierPayment } from "@/server/payables";
import { RupiahInput } from "../rupiah-input";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Catat pembayaran ke supplier atau pengembalian dana dari supplier (spec stok 6.2–6.3). */
export function PaymentDialog({
  invoiceId,
  kind,
  limit,
  invoiceDate,
  today,
}: {
  invoiceId: string;
  kind: SupplierPaymentKindValue;
  /** Sisa hutang (BAYAR) atau kredit dari supplier (PENGEMBALIAN); diperiksa lagi di server. */
  limit: number;
  invoiceDate: string;
  today: string;
}) {
  const router = useRouter();
  const title = kind === "BAYAR" ? "Catat pembayaran" : "Catat pengembalian dana";
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(limit);
  const [method, setMethod] = useState<PaymentMethodValue>("TRANSFER");
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const input = { invoiceId, kind, amount: amount ?? Number.NaN, method, paidAt, reference };
    const checked = validatePayment(input, { today, invoiceDate, limit });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await recordSupplierPayment(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`${kind === "BAYAR" ? "Pembayaran" : "Pengembalian dana"} ${formatRupiah(checked.value.amount)} dicatat.`);
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
        if (next) {
          setAmount(limit);
          setPaidAt(today);
        } else {
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={kind === "BAYAR" ? "default" : "outline"}>
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === "BAYAR" ? `Sisa hutang ${formatRupiah(limit)}.` : `Kredit dari supplier ${formatRupiah(limit)}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="payment-amount">Nominal</Label>
            <RupiahInput id="payment-amount" value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-method">Metode</Label>
            <select
              id="payment-method"
              className={selectClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethodValue)}
            >
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-date">Tanggal</Label>
            <Input id="payment-date" type="date" min={invoiceDate} max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-reference">Referensi (opsional)</Label>
            <Input
              id="payment-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nomor transfer atau kuitansi"
            />
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
