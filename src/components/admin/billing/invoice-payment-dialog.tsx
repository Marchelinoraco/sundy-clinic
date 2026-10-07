"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { validateInvoicePayment } from "@/lib/invoice";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethodValue } from "@/lib/stock";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { RupiahInput } from "../rupiah-input";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Catat pembayaran customer (spec tagihan 4.4): tunai, transfer, atau QRIS; bisa sebagian. */
export function InvoicePaymentDialog({
  invoiceId,
  limit,
  finalizedDate,
  today,
}: {
  invoiceId: string;
  /** Sisa tagihan; diperiksa lagi di server. */
  limit: number;
  finalizedDate: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // undefined = belum diubah pengguna: nominal mengikuti sisa terbaru.
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const amount = typed === undefined ? limit : typed;
  const [method, setMethod] = useState<PaymentMethodValue>("TUNAI");
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const input = { invoiceId, amount: amount ?? Number.NaN, method, paidAt, reference };
    const checked = validateInvoicePayment(input, { today, finalizedDate, limit });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await recordInvoicePayment(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Pembayaran ${formatRupiah(checked.value.amount)} dicatat.`);
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
          setTyped(undefined);
          setPaidAt(today);
        } else {
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">Catat pembayaran</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat pembayaran</DialogTitle>
          <DialogDescription>Sisa tagihan {formatRupiah(limit)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="inv-payment-amount">Nominal</Label>
            <RupiahInput id="inv-payment-amount" value={amount} onChange={setTyped} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-payment-method">Metode</Label>
            <select id="inv-payment-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethodValue)}>
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-payment-date">Tanggal</Label>
            <Input id="inv-payment-date" type="date" min={finalizedDate} max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-payment-reference">Referensi (opsional)</Label>
            <Input id="inv-payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nomor kuitansi atau transfer" />
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
