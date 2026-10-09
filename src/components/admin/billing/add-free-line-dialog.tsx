"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { validateFreeLine } from "@/lib/invoice";
import { addFreeLine } from "@/server/invoice-drafts";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

/** Tambah baris layanan atau treatment yang tidak ada di kunjungan (spec tagihan 4.2). */
export function AddFreeLineDialog({ invoiceId, version }: { invoiceId: string; version: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"LAYANAN" | "TREATMENT">("LAYANAN");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const input = { kind, name, quantity: Number(quantity), unitPrice: unitPrice ?? Number.NaN };
    const checked = validateFreeLine(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await addFreeLine({ invoiceId, version, ...checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        setName("");
        setQuantity("1");
        setUnitPrice(null);
        router.refresh();
      } catch {
        setError("Gagal menambah baris. Coba lagi.");
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
        + Baris layanan
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Tambah baris layanan</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <SelectField id="free-kind" label="Jenis" value={kind} onChange={(value) => setKind(value as "LAYANAN" | "TREATMENT")}>
              <option value="LAYANAN">Layanan</option>
              <option value="TREATMENT">Treatment</option>
            </SelectField>
            <TextField id="free-name" label="Nama" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField
              id="free-quantity"
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1 } }}
            />
            <RupiahInput id="free-price" label="Harga" value={unitPrice} onChange={setUnitPrice} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={add} disabled={pending}>
            Tambah
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
