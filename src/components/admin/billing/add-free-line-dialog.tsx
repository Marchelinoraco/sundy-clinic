"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { formatRupiah } from "@/lib/format";
import { validateFreeLine, validateServiceLineAdd } from "@/lib/invoice";
import { addFreeLine, addServiceLine } from "@/server/invoice-drafts";
import type { InternalServiceOption } from "@/server/internal-catalog";
import { useApproval } from "../approval/use-approval";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

const OTHER = "lainnya";
type Choice = { id: string; label: string; group: string };

/**
 * Tambah baris layanan (spec tagihan 4.2, spec layanan situs 6): treatment dari katalog internal dengan harga katalog, atau
 * "Lainnya (ketik sendiri)" untuk hal yang belum ada di katalog, tanpa biaya maupun komisi.
 */
export function AddFreeLineDialog({ invoiceId, version, services = [] }: { invoiceId: string; version: number; services?: InternalServiceOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(services.length === 0 ? OTHER : "");
  const [kind, setKind] = useState<"LAYANAN" | "TREATMENT">("LAYANAN");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { withApproval, dialog } = useApproval();

  const choices: Choice[] = [
    ...services.map((service) => ({ id: service.id, label: `${service.name} — ${formatRupiah(service.price)}`, group: service.categoryName })),
    { id: OTHER, label: "Lainnya (ketik sendiri)", group: "Lainnya" },
  ];
  const selected = choices.find((option) => option.id === choice) ?? null;
  const service = services.find((option) => option.id === choice) ?? null;

  function reset() {
    setChoice(services.length === 0 ? OTHER : "");
    setKind("LAYANAN");
    setName("");
    setQuantity("1");
    setUnitPrice(null);
  }

  function finish(result: ActionResult<unknown>) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  function add() {
    if (choice !== OTHER) {
      const checked = validateServiceLineAdd({ serviceId: choice, quantity: Number(quantity) });
      if (!checked.ok) {
        setError(checked.message);
        return;
      }
      setError(null);
      startTransition(async () => {
        try {
          finish(await addServiceLine({ invoiceId, version, ...checked.value }));
        } catch {
          setError("Gagal menambah baris. Coba lagi.");
        }
      });
      return;
    }
    const checked = validateFreeLine({ kind, name, quantity: Number(quantity), unitPrice: unitPrice ?? Number.NaN });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        // Baris bebas berharga di luar katalog: server meminta PIN persetujuan (spec PIN P13).
        const result = await withApproval((approval) => addFreeLine({ invoiceId, version, ...checked.value, approval }));
        if (result === null) return;
        finish(result);
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
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Tambah baris layanan</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              id="line-service"
              options={choices}
              value={selected}
              onChange={(_, option) => setChoice(option?.id ?? "")}
              groupBy={(option) => option.group}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Tidak ada layanan yang cocok."
              fullWidth
              renderInput={(params) => <TextField {...params} label="Layanan" />}
            />
            {choice === OTHER && (
              <>
                <SelectField id="free-kind" label="Jenis" value={kind} onChange={(value) => setKind(value as "LAYANAN" | "TREATMENT")}>
                  <option value="LAYANAN">Layanan</option>
                  <option value="TREATMENT">Treatment</option>
                </SelectField>
                <TextField id="free-name" label="Nama" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
              </>
            )}
            <TextField
              id="free-quantity"
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1 } }}
            />
            {choice === OTHER ? (
              <RupiahInput id="free-price" label="Harga" value={unitPrice} onChange={setUnitPrice} fullWidth />
            ) : (
              service && <TextField id="catalog-price" label="Harga" value={formatRupiah(service.price)} disabled fullWidth helperText="Harga katalog. Potongan lewat diskon per item." />
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={add} disabled={pending}>
            Tambah
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </>
  );
}
