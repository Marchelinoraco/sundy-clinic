"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { optionKey, packageTargetLabel, type PackageOption } from "@/lib/treatment-package";
import { takePackageItem } from "@/server/invoice-drafts";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { packageSource } from "./package-session-button";

/** Ambil jatah barang paket sebagai baris BARANG Rp 0 (spec paket barang PB4). `options` hanya isi paket berupa barang. */
export function TakePackageItemDialog({ invoiceId, version, options, disabled = false }: { invoiceId: string; version: number; options: readonly PackageOption[]; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = options.find((option) => optionKey(option) === choice);

  function openDialog() {
    setChoice(options.length === 1 ? optionKey(options[0]) : "");
    setQuantity("1");
    setError(null);
    setOpen(true);
  }

  function take() {
    if (!chosen) {
      setError("Pilih barang.");
      return;
    }
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount < 1 || amount > chosen.remaining) {
      setError(`Jumlah 1–${chosen.remaining}.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await takePackageItem({ invoiceId, version, quantity: amount, itemId: chosen.itemId ?? undefined, ...packageSource(chosen) });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Barang paket ditambahkan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" size="small" variant="outlined" color="inherit" disabled={disabled || pending} onClick={openDialog}>
        Ambil barang paket
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Ambil barang paket</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <SelectField id="take-package-item" label="Barang" value={choice} onChange={setChoice}>
              <option value="">Pilih barang</option>
              {options.map((option) => (
                <option key={optionKey(option)} value={optionKey(option)}>
                  {option.serviceName} — {packageTargetLabel(option)}
                </option>
              ))}
            </SelectField>
            <TextField
              id="take-package-quantity"
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              slotProps={{
                htmlInput: { min: 1, max: chosen?.remaining, inputMode: "numeric" },
                input: chosen?.unit ? { endAdornment: <InputAdornment position="end">{chosen.unit}</InputAdornment> } : undefined,
              }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={take}>
            Ambil
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
