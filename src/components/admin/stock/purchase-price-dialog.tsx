"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { validatePurchasePrices } from "@/lib/costing";
import { formatRupiah } from "@/lib/format";
import { setPurchasePrices } from "@/server/purchase-pricing";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { RupiahInput } from "../rupiah-input";

type PriceLine = { id: string; label: string; quantity: number; unit: string; unitCost: number | null };

/** "Isi harga beli" faktur barang masuk, khusus Admin Keuangan dan Super Admin (spec harga modal 4). */
export function PurchasePriceDialog({ invoiceId, lines }: { invoiceId: string; lines: PriceLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = lines.reduce((sum, line) => sum + line.quantity * (prices[line.id] ?? 0), 0);

  function openDialog() {
    setPrices(Object.fromEntries(lines.map((line) => [line.id, line.unitCost])));
    setError(null);
    setOpen(true);
  }

  function save() {
    const input = lines.map((line) => ({ lineId: line.id, unitCost: prices[line.id] ?? null }));
    const checked = validatePurchasePrices(input, { lineIds: lines.map((line) => line.id) });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await setPurchasePrices({ invoiceId, prices: checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Harga beli disimpan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="contained" onClick={openDialog}>
        Isi harga beli
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Isi harga beli</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {lines.map((line) => (
              <Stack key={line.id} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                  {line.label} · {line.quantity} {line.unit}
                </Typography>
                <RupiahInput
                  aria-label={`Harga beli ${line.label}`}
                  placeholder="per satuan"
                  value={prices[line.id] ?? null}
                  onChange={(next) => setPrices((current) => ({ ...current, [line.id]: next }))}
                  sx={{ width: { xs: "100%", sm: 180 } }}
                />
              </Stack>
            ))}
            <Typography variant="body2" aria-live="polite">
              Total faktur: <strong>{formatRupiah(total)}</strong>
            </Typography>
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
