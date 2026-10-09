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
import { validateItemAdd } from "@/lib/invoice";
import { addInvoiceItem } from "@/server/invoice-drafts";
import type { BillingItem } from "@/server/invoice-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { ItemAutocomplete } from "../mui/item-autocomplete";

/** Tambah obat atau produk dari katalog stok dengan harga jual saat ini (spec tagihan 4.2). */
export function AddItemDialog({ invoiceId, version, items, onError }: { invoiceId: string; version: number; items: BillingItem[]; onError: (message: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const input = { itemId, quantity: Number(quantity) };
    const checked = validateItemAdd(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await addInvoiceItem({ invoiceId, version, ...input });
        if (!result.ok) {
          onError(result.error);
        }
        setOpen(false);
        setItemId("");
        setQuantity("1");
        router.refresh();
      } catch {
        setError("Gagal menambah barang. Coba lagi.");
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
        + Tambah barang
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Tambah barang</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <ItemAutocomplete id="add-item" label="Barang" items={items} value={itemId} onChange={setItemId} showStock />
            <TextField
              id="add-item-quantity"
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1 } }}
            />
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
