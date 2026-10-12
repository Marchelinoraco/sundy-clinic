"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { DiscountKindValue } from "@/lib/invoice";
import { dateOnlyString } from "@/lib/stock";
import { validatePromo, type PromoFields, type PromoInput } from "@/lib/stock-promo";
import { setStockItemPrice } from "@/server/stock-catalog";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

const NO_PROMO: PromoInput = { name: "", kind: null, value: 0, startsOn: "", endsOn: "" };

function promoInput(promo: PromoFields): PromoInput {
  if (!promo.promoKind) return NO_PROMO;
  return {
    name: promo.promoName ?? "",
    kind: promo.promoKind,
    value: promo.promoValue,
    startsOn: promo.promoStartsOn ? dateOnlyString(promo.promoStartsOn) : "",
    endsOn: promo.promoEndsOn ? dateOnlyString(promo.promoEndsOn) : "",
  };
}

/** Harga jual dan promo barang, hanya Admin Keuangan dan Super Admin (spec perbaikan tagihan 5.1). */
export function StockPriceDialog({ itemId, itemName, sellPrice, promo }: { itemId: string; itemName: string; sellPrice: number | null; promo: PromoFields }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<number | null>(sellPrice);
  const [value, setValue] = useState<PromoInput>(() => promoInput(promo));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof PromoInput>(key: K, next: PromoInput[K]) => setValue((v) => ({ ...v, [key]: next }));

  function openDialog() {
    setPrice(sellPrice);
    setValue(promoInput(promo));
    setError(null);
    setOpen(true);
  }

  function save() {
    const sent: PromoInput = value.kind ? value : NO_PROMO;
    const checked = validatePromo(sent);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await setStockItemPrice({ itemId, sellPrice: price, promo: sent });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Harga & promo disimpan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  const wide = { gridColumn: { sm: "span 2" } } as const;

  return (
    <>
      <Button type="button" variant="outlined" onClick={openDialog}>
        Harga & promo
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Harga & promo {itemName}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <DialogContentText>Harga jual kosong berarti barang belum bisa ditagihkan. Promo dipotong otomatis saat barang masuk tagihan.</DialogContentText>
          <Box sx={{ pt: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
            <RupiahInput id="stock-price-sell" label="Harga jual" value={price} onChange={setPrice} placeholder="Belum diisi" fullWidth />
            <SelectField id="stock-price-promo" label="Promo" value={value.kind ?? ""} onChange={(next) => set("kind", (next || null) as DiscountKindValue | null)}>
              <option value="">Tanpa promo</option>
              <option value="PERSEN">Persen</option>
              <option value="NOMINAL">Nominal per unit</option>
            </SelectField>
            {value.kind && (
              <>
                <TextField id="stock-price-promo-name" label="Nama promo" value={value.name} onChange={(e) => set("name", e.target.value)} fullWidth />
                {value.kind === "PERSEN" ? (
                  <TextField
                    id="stock-price-promo-percent"
                    label="Persen promo"
                    type="number"
                    value={value.value || ""}
                    onChange={(e) => set("value", e.target.value === "" ? 0 : Number(e.target.value))}
                    fullWidth
                    slotProps={{ htmlInput: { min: 1, max: 100, inputMode: "numeric" } }}
                  />
                ) : (
                  <RupiahInput
                    id="stock-price-promo-nominal"
                    label="Nominal per unit"
                    value={value.value || null}
                    onChange={(next) => set("value", next ?? 0)}
                    fullWidth
                  />
                )}
                <DateField id="stock-price-promo-start" label="Mulai" value={value.startsOn} onChange={(next) => set("startsOn", next)} fullWidth />
                <DateField id="stock-price-promo-end" label="Selesai" value={value.endsOn} onChange={(next) => set("endsOn", next)} fullWidth />
              </>
            )}
            {error && (
              <Alert severity="error" sx={wide}>
                {error}
              </Alert>
            )}
          </Box>
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
