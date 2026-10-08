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
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ADJUST_REASON_LABEL, DECREASE_REASONS, INCREASE_REASONS, validateAdjustment, type AdjustReasonValue } from "@/lib/stock";
import { adjustStock } from "@/server/stock-movements";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

type Direction = "KURANGI" | "TAMBAH";

/** Penyesuaian satu batch (spec stok 5.4). Batas sisa diperiksa lagi di server secara atomik. */
export function AdjustStockDialog({ batch }: { batch: { id: string; label: string; remaining: number; unit: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("KURANGI");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<AdjustReasonValue>(DECREASE_REASONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasons = direction === "KURANGI" ? DECREASE_REASONS : INCREASE_REASONS;

  function changeDirection(next: Direction) {
    setDirection(next);
    setReason(next === "KURANGI" ? DECREASE_REASONS[0] : INCREASE_REASONS[0]);
    setError(null);
  }

  function save() {
    const input = { batchId: batch.id, direction, quantity: Number(quantity), reason, note };
    const checked = validateAdjustment(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    if (checked.value.delta < 0 && -checked.value.delta > batch.remaining) {
      setError(`Pengurangan melebihi sisa batch (${batch.remaining} ${batch.unit}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await adjustStock(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Stok disesuaikan.");
        setOpen(false);
        setQuantity("");
        setNote("");
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
      <Button size="small" variant="outlined" aria-label={`Penyesuaian ${batch.label}`} onClick={() => setOpen(true)}>
        Penyesuaian
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Penyesuaian stok</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>
            {batch.label} · sisa {batch.remaining} {batch.unit}
          </DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              aria-label="Arah penyesuaian"
              value={direction}
              onChange={(_, next: Direction | null) => next && changeDirection(next)}
            >
              {(["KURANGI", "TAMBAH"] as const).map((value) => (
                <ToggleButton key={value} value={value} sx={{ px: 2 }}>
                  {value === "KURANGI" ? "Kurangi" : "Tambah"}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <TextField
              id="adjust-quantity"
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1, inputMode: "numeric" } }}
            />
            <SelectField id="adjust-reason" label="Alasan" value={reason} onChange={(value) => setReason(value as AdjustReasonValue)}>
              {reasons.map((value) => (
                <option key={value} value={value}>
                  {ADJUST_REASON_LABEL[value]}
                </option>
              ))}
            </SelectField>
            <TextField id="adjust-note" label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
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
