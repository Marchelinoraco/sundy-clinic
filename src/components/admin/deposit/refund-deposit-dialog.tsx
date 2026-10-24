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
import { DEPOSIT_REFUND_METHODS, DEPOSIT_REFUND_MIN, validateDepositRefund, type DepositRefundMethod } from "@/lib/deposit";
import { formatRupiah } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/stock";
import { refundDeposit } from "@/server/deposit-actions";
import { useApproval } from "../approval/use-approval";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

/**
 * Kembalikan saldo deposit dalam bentuk uang (spec deposit D15, D16): jumlah, cara, dan alasan, lalu Persetujuan
 * dengan PIN Admin Keuangan atau Super Admin.
 */
export function RefundDepositDialog({ patientId, patientName, balance }: { patientId: string; patientName: string; balance: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(balance);
  const [method, setMethod] = useState<DepositRefundMethod>("TUNAI");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { withApproval, dialog } = useApproval();

  function openDialog() {
    setAmount(balance);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  function confirm() {
    const input = { patientId, amount: amount ?? Number.NaN, method, reason };
    const checked = validateDepositRefund(input, balance);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await withApproval((approval) => refundDeposit({ ...input, approval }));
        if (result === null) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Deposit ${formatRupiah(checked.value.amount)} dikembalikan ke ${patientName}.`);
        setOpen(false);
        setReason("");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" size="small" onClick={openDialog}>
        Kembalikan uang
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Kembalikan uang deposit</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>
            Saldo deposit {patientName} {formatRupiah(balance)} masih berlaku. Pengembalian minimal {formatRupiah(DEPOSIT_REFUND_MIN)}.
          </DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <RupiahInput id={`refund-amount-${patientId}`} label="Jumlah" value={amount} onChange={setAmount} fullWidth />
            <SelectField id={`refund-method-${patientId}`} label="Cara" value={method} onChange={(value) => setMethod(value as DepositRefundMethod)}>
              {DEPOSIT_REFUND_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </SelectField>
            <TextField id={`refund-reason-${patientId}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={confirm} disabled={pending}>
            {pending ? "Menyimpan…" : "Kembalikan"}
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </>
  );
}
