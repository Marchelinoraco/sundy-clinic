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
import { DISCOUNT_KIND_LABEL, discountAmount, validateDiscount, type DiscountKindValue } from "@/lib/invoice";
import { applyFinalDiscount } from "@/server/invoice-payments";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

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

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button type="button" variant="outlined" onClick={() => setOpen(true)}>
        Tambah diskon
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Tambah diskon</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>Diskon menggantikan diskon sebelumnya dan harus lebih besar. Tercatat dengan nama Anda.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <SelectField id="final-discount-kind" label="Jenis diskon" value={kind} onChange={(value) => setKind(value as DiscountKindValue)}>
              {(Object.keys(DISCOUNT_KIND_LABEL) as DiscountKindValue[]).map((option) => (
                <option key={option} value={option}>
                  {DISCOUNT_KIND_LABEL[option]}
                </option>
              ))}
            </SelectField>
            <TextField
              id="final-discount-value"
              label="Nilai diskon"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1 } }}
            />
            <TextField id="final-discount-reason" label="Alasan diskon" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
