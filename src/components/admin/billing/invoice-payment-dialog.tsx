"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { validateInvoicePayment } from "@/lib/invoice";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethodValue } from "@/lib/stock";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

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

  function openDialog() {
    setTyped(undefined);
    setPaidAt(today);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button type="button" variant="contained" onClick={openDialog}>
        Catat pembayaran
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Catat pembayaran</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>Sisa tagihan {formatRupiah(limit)}.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <RupiahInput id="inv-payment-amount" label="Nominal" value={amount} onChange={setTyped} fullWidth />
            <SelectField id="inv-payment-method" label="Metode" value={method} onChange={(value) => setMethod(value as PaymentMethodValue)}>
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </SelectField>
            <DateField id="inv-payment-date" label="Tanggal" min={finalizedDate} max={today} value={paidAt} onChange={setPaidAt} fullWidth />
            <TextField
              id="inv-payment-reference"
              label="Referensi (opsional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nomor kuitansi atau transfer"
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
