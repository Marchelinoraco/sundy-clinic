"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DOCTOR_PHOTO_ACCEPT, DOCTOR_PHOTO_MIN_SIDE, doctorPhotoPreviewUrl } from "@/lib/doctor-profile";
import { removeStaffPhoto } from "@/server/staff";
import { sendStaffPhoto } from "./send-photo";

/** Bingkai pratinjau 4:5 dengan sudut atas setengah lingkaran, cukup dekat dengan bingkai lengkung halaman publik untuk menunjukkan bagian yang terpotong. */
function ArchPreview({ src, alt }: { src: string; alt: string }) {
  return (
    <Box sx={{ width: 160, aspectRatio: "4 / 5", overflow: "hidden", borderRadius: "999px 999px 32px 32px", bgcolor: "action.hover", flexShrink: 0 }}>
      <Box component="img" src={src} alt={alt} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </Box>
  );
}

/**
 * Foto dokter di dialog Ubah (spec profil dokter 5.1). Alur: pilih berkas → pratinjau → "Pakai foto ini". Berbeda dari teks,
 * foto langsung terpublikasi saat dipakai dan tidak menunggu tombol Simpan; layar mengatakannya.
 */
export function DoctorPhotoField({
  staffId,
  photoUrl,
  visibleOnSite,
  onChange,
}: {
  staffId: string;
  photoUrl: string | null;
  /** Dokter aktif dan sudah tampil di situs (nilai tersimpan, bukan sakelar yang belum disimpan). */
  visibleOnSite: boolean;
  onChange: (photoUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Alamat blob dilepas saat pilihan diganti, dibatalkan, atau dialog ditutup.
  useEffect(
    () => () => {
      if (candidate) URL.revokeObjectURL(candidate.preview);
    },
    [candidate],
  );

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCandidate({ file, preview: URL.createObjectURL(file) });
  }

  async function use() {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    const result = await sendStaffPhoto(staffId, candidate.file);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(visibleOnSite ? "Foto diganti dan sudah tampil di situs." : "Foto disimpan. Foto tampil di situs setelah dokter ditampilkan.");
    setCandidate(null);
    onChange(result.photoUrl);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await removeStaffPhoto(staffId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Foto dihapus.");
      onChange(null);
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  // Pratinjau foto terpasang lewat rute admin: rute publik menolak dokter yang belum tampil di situs.
  const shown = candidate?.preview ?? doctorPhotoPreviewUrl(photoUrl);
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", flexWrap: "wrap", rowGap: 1.5 }}>
      {shown ? <ArchPreview src={shown} alt={candidate ? "Pratinjau foto baru" : "Foto saat ini"} /> : null}
      <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
        {!shown && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Belum ada foto unggahan. Situs memakai foto bawaan bila ada.
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Foto potret (tegak) paling bagus, minimal {DOCTOR_PHOTO_MIN_SIDE} px.{" "}
          {visibleOnSite
            ? "Foto langsung tampil di situs saat dipakai, tanpa menunggu tombol Simpan."
            : "Foto langsung disimpan, tetapi baru tampil di situs setelah dokter ditampilkan (nyalakan Tampil di situs publik, lalu Simpan)."}
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
          {!candidate && photoUrl && (
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
          aria-label="Berkas foto dokter"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            pick(file);
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
