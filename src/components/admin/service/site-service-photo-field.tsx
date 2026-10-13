"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DOCTOR_PHOTO_ACCEPT, DOCTOR_PHOTO_MIN_SIDE } from "@/lib/doctor-profile";
import { siteServicePhotoPreviewUrl } from "@/lib/service-catalog";
import { removeSiteServicePhoto } from "@/server/site-service-admin";
import { postPhoto } from "../photo-upload";

/**
 * Foto layanan situs (spec layanan situs 5.3). Alur sama dengan foto dokter: pilih berkas → pratinjau → "Pakai foto ini". Foto
 * langsung tersimpan dan tidak menunggu tombol Simpan; layar mengatakannya.
 */
export function SiteServicePhotoField({
  siteServiceId,
  imageUrl,
  visibleOnSite,
  onChange,
}: {
  siteServiceId: string;
  imageUrl: string | null;
  visibleOnSite: boolean;
  onChange: (imageUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (candidate) URL.revokeObjectURL(candidate.preview);
    },
    [candidate],
  );

  async function use() {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    const result = await postPhoto("/admin/layanan/foto", { siteServiceId }, candidate.file);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(visibleOnSite ? "Foto diganti dan sudah tampil di situs." : "Foto disimpan. Foto tampil setelah layanan ini aktif di situs.");
    setCandidate(null);
    onChange(result.photoUrl);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await removeSiteServicePhoto(siteServiceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Foto dihapus. Situs memakai foto kategori.");
      onChange(null);
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const uploaded = siteServicePhotoPreviewUrl(imageUrl);
  const shown = candidate?.preview ?? uploaded;
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", flexWrap: "wrap", rowGap: 1.5 }}>
      {shown ? (
        <Box sx={{ width: 160, aspectRatio: "4 / 3", overflow: "hidden", borderRadius: 2, bgcolor: "action.hover", flexShrink: 0 }}>
          <Box component="img" src={shown} alt={candidate ? "Pratinjau foto baru" : "Foto saat ini"} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </Box>
      ) : null}
      <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
        {!shown && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Belum ada foto unggahan. Situs memakai foto kategori.
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Foto mendatar (4:3) paling bagus, minimal {DOCTOR_PHOTO_MIN_SIDE} px. Foto langsung tersimpan saat dipakai, tanpa menunggu tombol Simpan.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          <Button variant="outlined" size="small" disabled={busy} onClick={() => input.current?.click()}>
            Pilih foto
          </Button>
          {candidate && (
            <>
              <Button variant="contained" size="small" disabled={busy} onClick={() => void use()}>
                Pakai foto ini
              </Button>
              <Button size="small" disabled={busy} onClick={() => setCandidate(null)}>
                Batal
              </Button>
            </>
          )}
          {!candidate && uploaded && (
            <Button color="error" size="small" disabled={busy} onClick={() => void remove()}>
              Hapus foto
            </Button>
          )}
        </Stack>
        <input
          ref={input}
          hidden
          type="file"
          accept={DOCTOR_PHOTO_ACCEPT}
          aria-label="Berkas foto layanan"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setError(null);
            setCandidate({ file, preview: URL.createObjectURL(file) });
          }}
        />
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </Stack>
    </Stack>
  );
}
