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
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { categoryPhotoName, validateServiceCategory } from "@/lib/service-category";
import type { ServiceCategoryRow } from "@/server/catalog-admin-read";
import { createServiceCategory, removeServiceCategoryPhoto, updateServiceCategory } from "@/server/service-category-admin";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { PhotoUploadField } from "../photo-upload-field";

const SELF_BOOKABLE_LABEL = "Pasien boleh memilih sendiri di situs";
const SELF_BOOKABLE_HELP =
  "Bila tidak dicentang, layanan di kategori ini tidak ditawarkan saat pasien lama Aesthetic memilih treatment sendiri di situs. Layanan tetap bisa dipakai di Booking Baru, tagihan, resep, dan paket.";

/** Tambah atau ubah satu kategori layanan (spec kategori layanan KL3, KL9, KL14). */
export function CategoryDialog({ row }: { row?: ServiceCategoryRow }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selfBookable, setSelfBookable] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setName(row?.name ?? "");
    setDescription(row?.description ?? "");
    setSelfBookable(row?.selfBookable ?? true);
    setImageUrl(row?.imageUrl ?? null);
    setError(null);
    setOpen(true);
  }

  function save() {
    const checked = validateServiceCategory({ name, description, selfBookable });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = row ? await updateServiceCategory({ id: row.id, ...checked.value }) : await createServiceCategory(checked.value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(row ? "Kategori tersimpan." : "Kategori ditambahkan. Unggah foto lewat tombol Ubah.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      {row ? (
        <Button type="button" size="small" variant="text" onClick={openDialog} aria-label={`Ubah ${row.name}`}>
          Ubah
        </Button>
      ) : (
        <Button type="button" variant="contained" size="small" onClick={openDialog}>
          + Kategori
        </Button>
      )}
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>{row ? `Ubah — ${row.name}` : "Tambah kategori"}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id={`${id}-name`} label="Nama kategori" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField
              id={`${id}-description`}
              label="Deskripsi"
              helperText="Tampil di bawah judul kategori di halaman Layanan situs."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
            <Stack spacing={0.5}>
              <FormControlLabel control={<Checkbox checked={selfBookable} onChange={(e) => setSelfBookable(e.target.checked)} />} label={SELF_BOOKABLE_LABEL} />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {SELF_BOOKABLE_HELP}
              </Typography>
            </Stack>
            {row ? (
              <PhotoUploadField
                endpoint="/admin/layanan/foto-kategori"
                fields={{ categoryId: row.id }}
                previewUrl={categoryPhotoName(imageUrl) ? imageUrl : null}
                inputLabel="Berkas foto kategori"
                emptyText="Belum ada foto unggahan. Kartu layanan tanpa foto memakai foto bawaan kategori."
                savedText="Foto kategori diganti dan sudah tampil di situs."
                removedText="Foto kategori dihapus."
                onRemove={() => removeServiceCategoryPhoto(row.id)}
                onChange={(next) => {
                  setImageUrl(next);
                  router.refresh();
                }}
              />
            ) : (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Simpan dulu, lalu unggah foto lewat tombol Ubah.
              </Typography>
            )}
            {error && (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            )}
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
