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
import { validateSupplier, type SupplierInput } from "@/lib/stock";
import { createSupplier, updateSupplier } from "@/server/stock-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";

const EMPTY: SupplierInput = { name: "", phone: "", address: "", notes: "" };

/** Tambah atau ubah supplier (spec stok 5.6). `onSaved` dipanggil setelah supplier baru dibuat. */
export function SupplierDialog({
  supplierId,
  initial,
  triggerLabel,
  onSaved,
}: {
  supplierId?: string;
  initial?: SupplierInput;
  triggerLabel: string;
  onSaved?: (supplier: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<SupplierInput>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof SupplierInput, next: string) => setValue((v) => ({ ...v, [key]: next }));

  function save() {
    const checked = validateSupplier(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (supplierId) {
          const result = await updateSupplier(supplierId, value);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success("Supplier diperbarui.");
        } else {
          const result = await createSupplier(value);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(`${result.data.name} ditambahkan.`);
          onSaved?.(result.data);
          setValue(EMPTY);
        }
        setOpen(false);
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
      <Button type="button" variant="outlined" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{supplierId ? "Ubah supplier" : "Tambah supplier"}</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>Pemasok obat dan produk klinik.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField id="supplier-name" label="Nama supplier" value={value.name} onChange={(e) => set("name", e.target.value)} fullWidth />
            <TextField id="supplier-phone" label="Telepon" value={value.phone} onChange={(e) => set("phone", e.target.value)} fullWidth />
            <TextField id="supplier-address" label="Alamat" value={value.address} onChange={(e) => set("address", e.target.value)} fullWidth />
            <TextField id="supplier-notes" label="Catatan" value={value.notes} onChange={(e) => set("notes", e.target.value)} fullWidth />
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
