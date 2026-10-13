"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
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
import { formatRupiah } from "@/lib/format";
import { siteSlugFrom, validateSiteService } from "@/lib/service-catalog";
import type { SiteServiceRow } from "@/server/catalog-admin-read";
import { createSiteService, updateSiteService } from "@/server/site-service-admin";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { SiteServicePhotoField } from "./site-service-photo-field";

export type SiteServiceOption = { id: string; name: string; categoryId: string; price: number; isActive: boolean };

const optionLabel = (option: SiteServiceOption) => `${option.name} — ${formatRupiah(option.price)}${option.isActive ? "" : " (nonaktif)"}`;

/** Tambah atau ubah layanan situs (spec layanan situs 5.2). Harga tidak diisi di sini: selalu ikut layanan internal. */
export function SiteServiceDialog({ categories, services, row }: { categories: { id: string; name: string }[]; services: SiteServiceOption[]; row?: SiteServiceRow }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [isSignature, setIsSignature] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = services.find((service) => service.id === serviceId) ?? null;

  function openDialog() {
    setServiceId(row?.serviceId ?? "");
    setName(row?.name ?? "");
    setSlug(row?.slug ?? "");
    setSlugTouched(Boolean(row));
    setCategoryId(row?.categoryId ?? categories[0]?.id ?? "");
    setDescription(row?.description ?? "");
    setPriceNote(row?.priceNote ?? "");
    setIsSignature(row?.isSignature ?? false);
    setSortOrder(String(row?.sortOrder ?? 0));
    setImageUrl(row?.imageUrl ?? null);
    setError(null);
    setOpen(true);
  }

  function changeName(next: string) {
    setName(next);
    if (!slugTouched) setSlug(siteSlugFrom(next));
  }

  function chooseService(option: SiteServiceOption | null) {
    setServiceId(option?.id ?? "");
    if (!option || row) return;
    if (!name.trim()) changeName(option.name);
    setCategoryId(option.categoryId);
  }

  function save() {
    const checked = validateSiteService({ serviceId, name, slug, categoryId, description, priceNote, isSignature, sortOrder: Number(sortOrder) });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = row ? await updateSiteService({ id: row.id, ...checked.value }) : await createSiteService(checked.value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(row ? "Layanan situs tersimpan." : "Layanan situs ditambahkan. Unggah foto lewat tombol Ubah.");
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
        <Button type="button" variant="contained" onClick={openDialog}>
          + Layanan situs
        </Button>
      )}
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>{row ? `Ubah — ${row.name}` : "Tambah layanan situs"}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              id={`${id}-service`}
              options={services}
              value={selected}
              onChange={(_, option) => chooseService(option)}
              getOptionLabel={optionLabel}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Tidak ada layanan yang cocok."
              fullWidth
              renderInput={(params) => <TextField {...params} label="Layanan internal" />}
            />
            {selected && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Harga di situs: {formatRupiah(selected.price)} (ikut layanan internal)
              </Typography>
            )}
            <TextField id={`${id}-name`} label="Nama di situs" value={name} onChange={(e) => changeName(e.target.value)} fullWidth />
            <TextField
              id={`${id}-slug`}
              label="Alamat (slug)"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              helperText={`/layanan/${slug || "…"}`}
              fullWidth
            />
            {row && slug !== row.slug && <Alert severity="warning">Tautan lama ke halaman ini akan rusak.</Alert>}
            <SelectField id={`${id}-category`} label="Kategori" value={categoryId} onChange={setCategoryId}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
            <TextField id={`${id}-description`} label="Deskripsi" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={3} fullWidth />
            <TextField id={`${id}-note`} label="Satuan harga" placeholder="/ 5 titik" value={priceNote} onChange={(e) => setPriceNote(e.target.value)} fullWidth />
            <TextField
              id={`${id}-order`}
              label="Urutan"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 0, max: 9999 } }}
            />
            <FormControlLabel control={<Checkbox checked={isSignature} onChange={(e) => setIsSignature(e.target.checked)} />} label="Signature (tampil di beranda)" />
            {row ? (
              <SiteServicePhotoField
                siteServiceId={row.id}
                imageUrl={imageUrl}
                visibleOnSite={row.isActive && row.serviceActive}
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
