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
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  validatePayment,
  type PaymentMethodValue,
  type SupplierPaymentKindValue,
} from "@/lib/stock";
import { recordSupplierPayment } from "@/server/payables";
import { RupiahInput } from "../rupiah-input";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

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
  // undefined = belum diubah pengguna: nominal mengikuti sisa terbaru (bisa berubah setelah halaman dimuat ulang).
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const amount = typed === undefined ? limit : typed;
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
      <Button type="button" variant={kind === "BAYAR" ? "contained" : "outlined"} onClick={openDialog}>
        {title}
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>
            {kind === "BAYAR" ? `Sisa hutang ${formatRupiah(limit)}.` : `Kredit dari supplier ${formatRupiah(limit)}.`}
          </DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <RupiahInput id="payment-amount" label="Nominal" value={amount} onChange={setTyped} fullWidth />
            <SelectField id="payment-method" label="Metode" value={method} onChange={(value) => setMethod(value as PaymentMethodValue)}>
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </SelectField>
            <DateField id="payment-date" label="Tanggal" min={invoiceDate} max={today} value={paidAt} onChange={setPaidAt} fullWidth />
            <TextField
              id="payment-reference"
              label="Referensi (opsional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nomor transfer atau kuitansi"
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
