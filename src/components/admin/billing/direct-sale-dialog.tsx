"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createDirectSale } from "@/server/invoice-drafts";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { PatientPicker } from "../patient-picker";

/** Penjualan langsung tanpa kunjungan (spec tagihan 4.1): pilih pasien, lalu tagihan draf kosong terbuka. */
export function DirectSaleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(patient: { id: string }) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createDirectSale({ patientId: patient.id });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.push(`/admin/tagihan/${result.data.id}`);
      } catch {
        setError("Gagal membuat tagihan. Coba lagi.");
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
        + Penjualan langsung
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Penjualan langsung</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>Untuk obat atau produk yang dibeli tanpa kunjungan. Pilih pasien dulu.</DialogContentText>
          <Stack spacing={2}>
            <PatientPicker onSelect={choose} />
            {pending && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Membuat tagihan…
              </Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
