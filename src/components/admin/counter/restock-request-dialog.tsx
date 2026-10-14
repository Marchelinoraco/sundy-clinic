"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
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
import { RESTOCK_NOTE_MAX, suggestedRestock, validateRestockRequest } from "@/lib/counter-stock";
import type { CounterItemRow } from "@/server/counter-read";
import { createRestockRequest } from "@/server/restock";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { ItemAutocomplete } from "../mui/item-autocomplete";

type Row = { key: number; itemId: string; quantity: string };

/**
 * Minta restock meja (spec stok meja 4.1). Bawaannya terisi barang yang menipis atau habis dan belum diminta, dengan
 * jumlah usulan; `initial` dipakai draf tagihan untuk barang yang kurang. Barang yang masih diminta tidak bisa dipilih.
 */
export function RestockRequestDialog({
  branchId,
  options,
  initial,
  triggerLabel = "Minta restock",
}: {
  branchId: string;
  options: CounterItemRow[];
  initial?: { itemId: string; quantity: number }[];
  triggerLabel?: string;
}) {
  const router = useRouter();
  const startRows = (): Row[] => {
    const list =
      initial ?? options.filter((o) => o.flag !== null && !o.requested).map((o) => ({ itemId: o.id, quantity: suggestedRestock(o.counterMinStock, o.available) }));
    return list.length > 0 ? list.map((entry, index) => ({ key: index + 1, itemId: entry.itemId, quantity: String(entry.quantity) })) : [{ key: 1, itemId: "", quantity: "" }];
  };
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(startRows);
  const [nextKey, setNextKey] = useState(1000);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requested = options.filter((o) => o.requested);
  const choices = (current: string) =>
    options.filter((o) => !o.requested || o.id === current).map((o) => ({ id: o.id, code: o.code, name: o.name, unit: o.unit }));
  const update = (key: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  function openDialog() {
    setRows(startRows());
    setNote("");
    setError(null);
    setOpen(true);
  }

  function submit() {
    const input = {
      branchId,
      note,
      lines: rows
        .filter((row) => row.itemId || row.quantity.trim())
        .map((row) => ({ itemId: row.itemId, quantity: row.quantity.trim() === "" ? Number.NaN : Number(row.quantity) })),
    };
    const checked = validateRestockRequest(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createRestockRequest(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Permintaan restock dikirim.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal mengirim. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="contained" onClick={openDialog}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Minta restock</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {rows.map((row, index) => {
              const n = index + 1;
              return (
                <Stack key={row.key} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                  <ItemAutocomplete label={`Barang ${n}`} items={choices(row.itemId)} value={row.itemId} onChange={(itemId) => update(row.key, { itemId })} sx={{ flex: 1 }} />
                  <TextField
                    label={`Jumlah ${n}`}
                    type="number"
                    value={row.quantity}
                    onChange={(e) => update(row.key, { quantity: e.target.value })}
                    sx={{ width: { sm: 120 } }}
                    slotProps={{ htmlInput: { min: 1, inputMode: "numeric" } }}
                  />
                  {rows.length > 1 && (
                    <Button type="button" size="small" aria-label={`Hapus barang ${n}`} onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}>
                      Hapus
                    </Button>
                  )}
                </Stack>
              );
            })}
            <Box>
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => {
                  setRows((current) => [...current, { key: nextKey, itemId: "", quantity: "" }]);
                  setNextKey((key) => key + 1);
                }}
              >
                + Barang lain
              </Button>
            </Box>
            {requested.length > 0 && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Sudah diminta: {requested.map((o) => o.name).join(", ")}
              </Typography>
            )}
            <TextField label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: RESTOCK_NOTE_MAX } }} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={submit} disabled={pending}>
            {pending ? "Mengirim…" : "Kirim permintaan"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
