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
import { DEPOSIT_VALID_DAYS } from "@/lib/deposit";
import { formatRupiah } from "@/lib/format";
import { validateInvoicePayment } from "@/lib/invoice";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethodValue } from "@/lib/stock";
import type { ClinicBankAccountView } from "@/server/clinic-bank";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

/** Catat pembayaran customer (spec tagihan 4.4): tunai, transfer, QRIS, atau EDC (spec invoice A4 IA12); bisa sebagian. */
export function InvoicePaymentDialog({
  invoiceId,
  limit,
  finalizedDate,
  today,
  bankAccounts,
}: {
  invoiceId: string;
  /** Sisa tagihan; diperiksa lagi di server. */
  limit: number;
  finalizedDate: string;
  today: string;
  /** Rekening klinik aktif untuk transfer (spec perbaikan tagihan 8). */
  bankAccounts: ClinicBankAccountView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // undefined = belum diubah pengguna: nominal mengikuti sisa terbaru.
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const amount = typed === undefined ? limit : typed;
  const [method, setMethod] = useState<PaymentMethodValue>("TUNAI");
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [accountId, setAccountId] = useState(bankAccounts.length === 1 ? bankAccounts[0].id : "");
  const [senderBank, setSenderBank] = useState("");
  const [senderAccountName, setSenderAccountName] = useState("");
  const [senderAccountNumber, setSenderAccountNumber] = useState("");
  const transfer = method === "TRANSFER";
  const edc = method === "EDC";
  const noAccounts = (transfer || edc) && bankAccounts.length === 0;
  // Kelebihan non-tunai menjadi saldo deposit pasien (spec deposit D5); tunai tetap dibatasi sisa.
  const excess = method !== "TUNAI" && amount !== null && amount > limit ? amount - limit : 0;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const input = {
      invoiceId,
      amount: amount ?? Number.NaN,
      method,
      paidAt,
      reference,
      ...(transfer ? { clinicBankAccountId: accountId, senderBank, senderAccountName, senderAccountNumber } : {}),
      ...(edc ? { clinicBankAccountId: accountId } : {}),
    };
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
            {excess > 0 && (
              <Alert severity="info">
                Kelebihan {formatRupiah(excess)} menjadi saldo deposit pasien, berlaku {DEPOSIT_VALID_DAYS} hari.
              </Alert>
            )}
            <SelectField id="inv-payment-method" label="Metode" value={method} onChange={(value) => setMethod(value as PaymentMethodValue)}>
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </SelectField>
            <DateField id="inv-payment-date" label="Tanggal" min={finalizedDate} max={today} value={paidAt} onChange={setPaidAt} fullWidth />
            {noAccounts && <Alert severity="warning">Belum ada rekening klinik. Tambahkan di Pengaturan.</Alert>}
            {edc && !noAccounts && (
              <SelectField id="inv-payment-edc" label="Mesin EDC" value={accountId} onChange={setAccountId}>
                <option value="">Pilih mesin EDC</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    EDC {account.bankName} ({account.accountNumber})
                  </option>
                ))}
              </SelectField>
            )}
            {transfer && !noAccounts && (
              <>
                <SelectField id="inv-payment-account" label="Rekening tujuan" value={accountId} onChange={setAccountId}>
                  <option value="">Pilih rekening</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </SelectField>
                <TextField id="inv-payment-sender-bank" label="Bank pengirim (opsional)" value={senderBank} onChange={(e) => setSenderBank(e.target.value)} fullWidth />
                <TextField
                  id="inv-payment-sender-name"
                  label="Nama pemilik rekening pengirim (opsional)"
                  value={senderAccountName}
                  onChange={(e) => setSenderAccountName(e.target.value)}
                  fullWidth
                />
                <TextField
                  id="inv-payment-sender-number"
                  label="Nomor rekening pengirim (opsional)"
                  value={senderAccountNumber}
                  onChange={(e) => setSenderAccountNumber(e.target.value)}
                  placeholder="mis. ****1234"
                  fullWidth
                />
              </>
            )}
            <TextField
              id="inv-payment-reference"
              label="Nomor referensi (opsional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nomor kuitansi atau transfer"
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={save} disabled={pending || noAccounts}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
