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
import { pullToWarehouse } from "@/server/counter-stock";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** Tarik stok meja satu batch ke gudang (spec stok meja 3). */
export function PullToWarehouseDialog({ batch }: { batch: { id: string; label: string; counterRemaining: number; unit: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const value = quantity.trim() === "" ? Number.NaN : Number(quantity);
    if (!Number.isInteger(value) || value < 1) {
      setError("Jumlah harus bilangan bulat lebih dari 0.");
      return;
    }
    if (value > batch.counterRemaining) {
      setError(`Melebihi sisa meja (${batch.counterRemaining} ${batch.unit}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await pullToWarehouse({ batchId: batch.id, quantity: value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Stok ditarik ke gudang.");
        setOpen(false);
        setQuantity("");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button size="small" variant="outlined" aria-label={`Tarik ke gudang ${batch.label}`} onClick={() => setOpen(true)}>
        Tarik ke gudang
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Tarik ke gudang</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <DialogContentText>
            {batch.label} · meja {batch.counterRemaining} {batch.unit}
          </DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField
              id={`pull-${batch.id}`}
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1, inputMode: "numeric" } }}
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
