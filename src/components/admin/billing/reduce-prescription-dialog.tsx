"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { validateReduction } from "@/lib/prescription";
import { reducePrescriptionLine } from "@/server/invoice-drafts";
import { DialogCloseButton } from "../mui/dialog-close-button";

type Line = { id: string; name: string; quantity: number; prescription: { prescribedQuantity: number; usage: string } };

/** Kurangi atau hapus (jumlah 0) baris dari resep dokter, dengan alasan (spec resep dokter 4). */
export function ReducePrescriptionDialog({ invoiceId, version, line, disabled }: { invoiceId: string; version: number; line: Line; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const prescribed = line.prescription.prescribedQuantity;

  function save() {
    // Kolom kosong bukan 0: tanpa ini obat terhapus dari tagihan tanpa sengaja.
    const checked = validateReduction({ quantity: quantity.trim() === "" ? Number.NaN : Number(quantity), reason }, { prescribed });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await reducePrescriptionLine({ invoiceId, version, lineId: line.id, ...checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Jumlah obat disimpan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" size="small" variant="text" disabled={disabled} onClick={() => setOpen(true)} aria-label={`Kurangi ${line.name}`}>
        Kurangi
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Kurangi {line.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Resep dokter: {prescribed} · {line.prescription.usage}. Isi 0 untuk tidak menagih obat ini. Isi {prescribed} untuk kembali sesuai resep.
            </Typography>
            <TextField
              id={`reduce-qty-${line.id}`}
              label="Jumlah ditagih"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 0, max: prescribed } }}
            />
            <TextField id={`reduce-reason-${line.id}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
