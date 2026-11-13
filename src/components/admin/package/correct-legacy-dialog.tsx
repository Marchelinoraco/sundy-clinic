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
import { validateRemainingCorrection } from "@/lib/legacy-package";
import { correctLegacyRemaining } from "@/server/legacy-packages";
import { DialogCloseButton } from "../mui/dialog-close-button";

type Item = { id: string; name: string; unit: string | null; remaining: number; sessions: number; usedHere: number };

/** Koreksi sisa paket lama oleh Admin Keuangan/Super Admin (spec paket lama PL11, bagian 6). Batasnya dihitung ulang di server. */
export function CorrectLegacyDialog({ packageId, items }: { packageId: string; items: Item[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const max = (item: Item) => Math.max(0, item.sessions - item.usedHere);

  function openDialog() {
    setValues(Object.fromEntries(items.map((item) => [item.id, String(item.remaining)])));
    setReason("");
    setError(null);
    setOpen(true);
  }

  function save() {
    const remaining = Object.fromEntries(items.map((item) => [item.id, values[item.id]?.trim() === "" ? Number.NaN : Number(values[item.id])]));
    const input = { packageId, reason, remaining };
    const checked = validateRemainingCorrection(input, { items: items.map((item) => ({ id: item.id, name: item.name, remaining: item.remaining, max: max(item) })) });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await correctLegacyRemaining(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Sisa paket dikoreksi.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" onClick={openDialog}>
        Koreksi sisa
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Koreksi sisa</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText variant="body2">Untuk angka yang salah ketik. Riwayat pemakaian di SunDY tetap utuh.</DialogContentText>
            {items.map((item) => (
              <TextField
                key={item.id}
                id={`correct-${item.id}`}
                type="number"
                label={`Sisa yang benar ${item.name}`}
                value={values[item.id] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))}
                helperText={`0–${max(item)}${item.unit ? ` ${item.unit}` : ""} · sekarang ${item.remaining}`}
                slotProps={{ htmlInput: { min: 0, max: max(item) } }}
                fullWidth
              />
            ))}
            <TextField id="correct-reason" label="Alasan" value={reason} onChange={(event) => setReason(event.target.value)} fullWidth />
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
