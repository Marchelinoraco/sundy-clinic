"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { validateInternalService } from "@/lib/service-catalog";
import { createInternalService, updateInternalService } from "@/server/service-admin";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

type EditableService = {
  id: string;
  name: string;
  categoryId: string;
  normalPrice: number | null;
  promoPrice: number;
  durationMin: number;
  requiresDoctor: boolean;
};

/** Tambah atau ubah layanan internal (spec layanan situs 5.1). Belum tampil di situs sampai ada layanan situs yang menautkannya. */
export function InternalServiceDialog({ categories, service }: { categories: { id: string; name: string }[]; service?: EditableService }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [promoPrice, setPromoPrice] = useState<number | null>(null);
  const [normalPrice, setNormalPrice] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState("30");
  const [requiresDoctor, setRequiresDoctor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setName(service?.name ?? "");
    setCategoryId(service?.categoryId ?? categories[0]?.id ?? "");
    setPromoPrice(service?.promoPrice ?? null);
    setNormalPrice(service?.normalPrice ?? null);
    setDurationMin(String(service?.durationMin ?? 30));
    setRequiresDoctor(service?.requiresDoctor ?? false);
    setError(null);
    setOpen(true);
  }

  function save() {
    const checked = validateInternalService({ name, categoryId, promoPrice: promoPrice ?? Number.NaN, normalPrice, durationMin: Number(durationMin), requiresDoctor });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = service ? await updateInternalService({ id: service.id, ...checked.value }) : await createInternalService(checked.value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(service ? "Layanan tersimpan." : `${checked.value.name} ditambahkan.`);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  const title = service ? `Ubah — ${service.name}` : "Tambah layanan internal";
  return (
    <>
      {service ? (
        <Button type="button" size="small" variant="text" onClick={openDialog} aria-label={`Ubah ${service.name}`}>
          Ubah
        </Button>
      ) : (
        <Button type="button" variant="contained" onClick={openDialog}>
          + Layanan internal
        </Button>
      )}
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id={`${id}-name`} label="Nama" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <SelectField id={`${id}-category`} label="Kategori" value={categoryId} onChange={setCategoryId}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
            <RupiahInput id={`${id}-promo`} label="Harga berlaku" value={promoPrice} onChange={setPromoPrice} fullWidth />
            <RupiahInput id={`${id}-normal`} label="Harga coret (opsional)" value={normalPrice} onChange={setNormalPrice} fullWidth />
            <TextField
              id={`${id}-duration`}
              label="Durasi (menit)"
              type="number"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 15, max: 480, step: 15 } }}
            />
            <FormControlLabel control={<Checkbox checked={requiresDoctor} onChange={(e) => setRequiresDoctor(e.target.checked)} />} label="Perlu dokter" />
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
