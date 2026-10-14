"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moveToCounter } from "@/server/counter-stock";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

/** Isi meja dari gudang tanpa permintaan (spec stok meja 4.2): FEFO di server. Hanya untuk stock:manage. */
export function FillCounterDialog({
  item,
  branches,
  triggerLabel = "Isi meja",
}: {
  item: { id: string; name: string; unit: string };
  branches: { id: string; name: string; warehouseAvailable?: number }[];
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const branch = branches.find((b) => b.id === branchId);

  function save() {
    const value = quantity.trim() === "" ? Number.NaN : Number(quantity);
    if (!Number.isInteger(value) || value < 1) {
      setError("Jumlah harus bilangan bulat lebih dari 0.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await moveToCounter({ branchId, itemId: item.id, quantity: value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Meja diisi.");
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
      <Button size="small" variant="outlined" aria-label={`${triggerLabel} ${item.name}`} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>
          {triggerLabel} {item.name}
        </DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <DialogContentText>Dipindah dari gudang, kedaluwarsa terdekat dulu.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            {branches.length > 1 && (
              <SelectField id={`fill-branch-${item.id}`} label="Cabang" value={branchId} onChange={setBranchId}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectField>
            )}
            <TextField
              id={`fill-qty-${item.id}`}
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              helperText={branch?.warehouseAvailable !== undefined ? `Gudang tersedia ${branch.warehouseAvailable} ${item.unit}` : " "}
              fullWidth
              slotProps={{ htmlInput: { min: 1, inputMode: "numeric" }, input: { endAdornment: <InputAdornment position="end">{item.unit}</InputAdornment> } }}
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
