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
import { STOCK_ITEM_KIND_LABEL, validateStockItem, type StockItemInput, type StockItemKindValue } from "@/lib/stock";
import { createStockItem, updateStockItem } from "@/server/stock-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

const EMPTY: StockItemInput = { code: "", name: "", kind: "OBAT", unit: "", sellPrice: null, minStock: 0, notes: "" };
const KINDS = Object.keys(STOCK_ITEM_KIND_LABEL) as StockItemKindValue[];

/** Tambah atau ubah barang (spec stok 5.1). Aturan isian diulang di server. */
export function StockItemDialog({
  itemId,
  initial,
  triggerLabel,
}: {
  itemId?: string;
  initial?: StockItemInput;
  triggerLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<StockItemInput>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof StockItemInput>(key: K, next: StockItemInput[K]) => setValue((v) => ({ ...v, [key]: next }));

  function save() {
    const checked = validateStockItem(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = itemId ? await updateStockItem(itemId, value) : await createStockItem(value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(itemId ? "Barang diperbarui." : `${checked.value.name} ditambahkan.`);
        setOpen(false);
        if (!itemId) setValue(EMPTY);
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

  const wide = { gridColumn: { sm: "span 2" } } as const;

  return (
    <>
      <Button variant={itemId ? "outlined" : "contained"} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>{itemId ? "Ubah barang" : "Tambah barang"}</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>Obat dan produk yang dibeli dari supplier dan distok di klinik.</DialogContentText>
          <Box sx={{ pt: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
            <TextField id="stock-item-code" label="Kode" value={value.code} onChange={(e) => set("code", e.target.value)} placeholder="OBT-001" fullWidth />
            <SelectField id="stock-item-kind" label="Jenis" value={value.kind} onChange={(kind) => set("kind", kind as StockItemKindValue)}>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {STOCK_ITEM_KIND_LABEL[kind]}
                </option>
              ))}
            </SelectField>
            <TextField id="stock-item-name" label="Nama" value={value.name} onChange={(e) => set("name", e.target.value)} fullWidth sx={wide} />
            <TextField
              id="stock-item-unit"
              label="Satuan"
              value={value.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="tablet, botol, tube"
              fullWidth
            />
            <TextField
              id="stock-item-min"
              label="Batas menipis"
              type="number"
              value={value.minStock}
              onChange={(e) => set("minStock", e.target.value === "" ? 0 : Number(e.target.value))}
              fullWidth
              slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }}
            />
            <RupiahInput
              id="stock-item-price"
              label="Harga jual"
              value={value.sellPrice}
              onChange={(next) => set("sellPrice", next)}
              placeholder="Boleh dikosongkan"
              fullWidth
              sx={wide}
            />
            <TextField id="stock-item-notes" label="Catatan" value={value.notes} onChange={(e) => set("notes", e.target.value)} fullWidth sx={wide} />
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
